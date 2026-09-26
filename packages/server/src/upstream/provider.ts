import type { StockLevel } from '@mrd/shared';
import type { UpstreamConfig } from '../config.js';

export interface UpstreamRecord {
  itemId: string;
  available: boolean;
  stockLevel: StockLevel;
  /** Multiplier applied to the catalog base price, 0.85–1.45. */
  surgeMultiplier: number;
  deliveryEtaMinutes: number;
}

/**
 * The seam the EnrichmentClient depends on. Swapping the simulator for a real
 * HTTP client is a one-line change at the composition root — and it is what
 * lets the resilience tests drive failures directly instead of gambling on a
 * random number.
 */
export interface UpstreamProvider {
  fetchOne(itemId: string, signal?: AbortSignal): Promise<UpstreamRecord>;
}

export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export class UpstreamNotFoundError extends UpstreamError {
  constructor(itemId: string) {
    super(`Upstream has no record for item "${itemId}"`);
    this.name = 'UpstreamNotFoundError';
  }
}

/** Deterministic PRNG so seeded runs (and tests) reproduce exactly. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable hash so an item's ETA/stock don't jitter wildly between calls. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new UpstreamError('Upstream call aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Stand-in for the real availability/pricing service.
 *
 * In-process on purpose (the brief says so): it is the *behaviour* that
 * matters — variable latency, an occasional slow tail, and random failures —
 * because that behaviour is what the client has to survive. Every knob is
 * configurable so a reviewer can force each failure mode from the CLI.
 */
export class SimulatedUpstreamProvider implements UpstreamProvider {
  private readonly rand: () => number;

  constructor(
    private readonly config: UpstreamConfig,
    private readonly knownIds: ReadonlySet<string>,
  ) {
    this.rand = config.seed > 0 ? mulberry32(config.seed) : Math.random;
  }

  async fetchOne(itemId: string, signal?: AbortSignal): Promise<UpstreamRecord> {
    await sleep(this.nextLatency(), signal);

    if (this.rand() < this.config.failureRate) {
      throw new UpstreamError(`Upstream provider failed for item "${itemId}" (simulated)`);
    }
    if (!this.knownIds.has(itemId)) {
      throw new UpstreamNotFoundError(itemId);
    }

    return this.record(itemId);
  }

  private nextLatency(): number {
    const { baseLatencyMs, jitterMs, slowRate, slowLatencyMs } = this.config;
    if (this.rand() < slowRate) return slowLatencyMs + this.rand() * jitterMs;
    return baseLatencyMs + this.rand() * jitterMs;
  }

  /**
   * Values are a function of the item id and the current minute: stable enough
   * to look real across a page of results, fresh enough that a cache TTL and a
   * refresh visibly do something.
   */
  private record(itemId: string): UpstreamRecord {
    const bucket = Math.floor(Date.now() / 60_000);
    const base = hash(itemId);
    const drift = hash(`${itemId}:${bucket}`);

    const stockRoll = (base + drift) % 1;
    const stockLevel: StockLevel = stockRoll > 0.93 ? 'sold_out' : stockRoll > 0.78 ? 'low_stock' : 'in_stock';

    return {
      itemId,
      available: stockLevel !== 'sold_out',
      stockLevel,
      surgeMultiplier: Math.round((0.85 + drift * 0.6) * 100) / 100,
      deliveryEtaMinutes: Math.round(15 + base * 45 + drift * 10),
    };
  }
}
