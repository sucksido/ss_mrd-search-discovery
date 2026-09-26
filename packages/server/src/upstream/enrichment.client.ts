import type { CatalogItem, Enrichment, EnrichmentOk } from '@mrd/shared';
import type { ResilienceConfig } from '../config.js';
import { TtlCache } from '../lib/cache.js';
import { CircuitBreaker } from '../lib/circuit-breaker.js';
import type { Logger } from '../lib/logger.js';
import type { MetricsRegistry } from '../lib/metrics.js';
import { UpstreamError, UpstreamNotFoundError, type UpstreamProvider, type UpstreamRecord } from './provider.js';

export interface EnrichmentOutcome {
  byId: Map<string, Enrichment>;
  requested: number;
  fulfilled: number;
  failed: number;
  cacheHits: number;
}

class TimeoutError extends UpstreamError {
  constructor(ms: number) {
    super(`Upstream call exceeded ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Everything that makes a flaky dependency survivable, in one place.
 *
 * Ordering matters: cache → breaker → timeout → retry. Checking the cache
 * first means a tripped breaker still serves recent data; checking the breaker
 * before the call means a sustained outage costs ~0ms instead of
 * timeout x (retries + 1) on every single request.
 */
export class EnrichmentClient {
  private readonly cache: TtlCache<UpstreamRecord>;
  private readonly breaker: CircuitBreaker;
  /** Collapses concurrent requests for the same item into one upstream call. */
  private readonly inFlight = new Map<string, Promise<UpstreamRecord>>();

  constructor(
    private readonly provider: UpstreamProvider,
    private readonly config: ResilienceConfig,
    private readonly metrics: MetricsRegistry,
    private readonly logger: Logger,
  ) {
    this.cache = new TtlCache<UpstreamRecord>(config.cacheTtlMs, config.cacheMaxEntries);
    this.breaker = new CircuitBreaker(config.breakerThreshold, config.breakerResetMs);
  }

  get circuitState(): 'closed' | 'open' | 'half_open' {
    return this.breaker.currentState;
  }

  get circuitOpenedCount(): number {
    return this.breaker.openedCount;
  }

  /**
   * Enrich a page of items. `allSettled` is the whole point: one item's
   * failure is that item's problem, never the page's.
   */
  async enrichMany(items: readonly CatalogItem[], options: { bypassCache?: boolean } = {}): Promise<EnrichmentOutcome> {
    const outcome: EnrichmentOutcome = {
      byId: new Map(),
      requested: items.length,
      fulfilled: 0,
      failed: 0,
      cacheHits: 0,
    };

    const settled = await Promise.allSettled(
      items.map(async (item) => ({ item, result: await this.enrichOne(item, options) })),
    );

    for (const entry of settled) {
      // enrichOne never rejects — it maps failure into an `unavailable` value.
      // The guard exists so a future bug cannot take the request down with it.
      if (entry.status === 'rejected') {
        outcome.failed += 1;
        continue;
      }
      const { item, result } = entry.value;
      outcome.byId.set(item.id, result.enrichment);
      if (result.enrichment.status === 'ok') {
        outcome.fulfilled += 1;
        if (result.fromCache) outcome.cacheHits += 1;
      } else {
        outcome.failed += 1;
      }
    }

    return outcome;
  }

  async enrichOne(
    item: CatalogItem,
    options: { bypassCache?: boolean } = {},
  ): Promise<{ enrichment: Enrichment; fromCache: boolean }> {
    if (options.bypassCache === true) this.cache.delete(item.id);

    const cached = this.cache.get(item.id);
    this.metrics.recordCache(cached !== undefined);
    if (cached !== undefined) {
      return { enrichment: toEnrichment(item, cached, true), fromCache: true };
    }

    try {
      const record = await this.fetchDeduped(item.id);
      this.cache.set(item.id, record);
      return { enrichment: toEnrichment(item, record, false), fromCache: false };
    } catch (error) {
      return { enrichment: toUnavailable(error), fromCache: false };
    }
  }

  private fetchDeduped(itemId: string): Promise<UpstreamRecord> {
    const existing = this.inFlight.get(itemId);
    if (existing !== undefined) return existing;

    const promise = this.fetchWithResilience(itemId).finally(() => {
      this.inFlight.delete(itemId);
    });
    this.inFlight.set(itemId, promise);
    return promise;
  }

  private async fetchWithResilience(itemId: string): Promise<UpstreamRecord> {
    const attempts = this.config.retries + 1;
    let lastError: unknown = new UpstreamError('No attempt was made');

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (!this.breaker.canAttempt()) {
        throw new CircuitOpenError();
      }

      const startedAt = Date.now();
      try {
        const record = await this.callWithTimeout(itemId);
        this.breaker.onSuccess();
        this.metrics.recordUpstream(Date.now() - startedAt, 'success');
        return record;
      } catch (error) {
        const timedOut = error instanceof TimeoutError;
        this.metrics.recordUpstream(Date.now() - startedAt, timedOut ? 'timeout' : 'failure');

        // A 404 is a real answer, not a fault — it must not trip the breaker.
        if (error instanceof UpstreamNotFoundError) {
          this.breaker.onSuccess();
          throw error;
        }

        this.breaker.onFailure();
        lastError = error;
        this.logger.warn('upstream call failed', {
          itemId,
          attempt,
          attempts,
          timedOut,
          circuit: this.breaker.currentState,
        });

        if (attempt < attempts) {
          this.metrics.recordRetry();
          await delay(this.config.retryBackoffMs * attempt + Math.random() * this.config.retryBackoffMs);
        }
      }
    }

    throw lastError;
  }

  private async callWithTimeout(itemId: string): Promise<UpstreamRecord> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new TimeoutError(this.config.timeoutMs));
      }, this.config.timeoutMs);
    });

    try {
      return await Promise.race([this.provider.fetchOne(itemId, controller.signal), timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

export class CircuitOpenError extends UpstreamError {
  constructor() {
    super('Upstream circuit is open; failing fast');
    this.name = 'CircuitOpenError';
  }
}

function toEnrichment(item: CatalogItem, record: UpstreamRecord, cached: boolean): EnrichmentOk {
  return {
    status: 'ok',
    price: Math.round(item.basePrice * record.surgeMultiplier),
    currency: 'ZAR',
    available: record.available,
    stockLevel: record.stockLevel,
    deliveryEtaMinutes: record.deliveryEtaMinutes,
    surgeMultiplier: record.surgeMultiplier,
    fetchedAt: new Date().toISOString(),
    cached,
  };
}

function toUnavailable(error: unknown): Enrichment {
  if (error instanceof CircuitOpenError) {
    return { status: 'unavailable', reason: 'circuit_open', message: 'Live pricing is temporarily paused' };
  }
  if (error instanceof UpstreamNotFoundError) {
    return { status: 'unavailable', reason: 'not_found', message: 'No live record for this item' };
  }
  if (error instanceof TimeoutError) {
    return { status: 'unavailable', reason: 'timeout', message: 'Live pricing timed out' };
  }
  return { status: 'unavailable', reason: 'upstream_error', message: 'Live pricing is unavailable' };
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
