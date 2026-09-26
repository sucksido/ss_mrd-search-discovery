import type { CatalogItem } from '@mrd/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ResilienceConfig } from '../src/config.js';
import { createLogger } from '../src/lib/logger.js';
import { MetricsRegistry } from '../src/lib/metrics.js';
import { EnrichmentClient } from '../src/upstream/enrichment.client.js';
import { UpstreamError, UpstreamNotFoundError, type UpstreamProvider, type UpstreamRecord } from '../src/upstream/provider.js';

const item: CatalogItem = {
  id: 'a1', name: 'Burger', description: '', category: 'Fast Food', tags: [],
  vendor: 'Grill', basePrice: 10_000, rating: 4.5, popularity: 80, emoji: '🍔',
};

const record: UpstreamRecord = {
  itemId: 'a1', available: true, stockLevel: 'in_stock', surgeMultiplier: 1.2, deliveryEtaMinutes: 30,
};

const config = (overrides: Partial<ResilienceConfig> = {}): ResilienceConfig => ({
  timeoutMs: 50,
  retries: 1,
  retryBackoffMs: 1,
  cacheTtlMs: 10_000,
  cacheMaxEntries: 100,
  breakerThreshold: 2,
  breakerResetMs: 10_000,
  enrichSortLimit: 48,
  ...overrides,
});

const build = (provider: UpstreamProvider, overrides: Partial<ResilienceConfig> = {}): EnrichmentClient =>
  new EnrichmentClient(provider, config(overrides), new MetricsRegistry(), createLogger('silent'));

describe('EnrichmentClient', () => {
  it('maps an upstream record onto a live price using the surge multiplier', async () => {
    const client = build({ fetchOne: async () => record });
    const { enrichment } = await client.enrichOne(item);

    expect(enrichment.status).toBe('ok');
    if (enrichment.status !== 'ok') return;
    expect(enrichment.price).toBe(12_000);          // 10 000 x 1.2
    expect(enrichment.deliveryEtaMinutes).toBe(30);
    expect(enrichment.cached).toBe(false);
  });

  it('serves the second call from cache without touching the provider', async () => {
    const fetchOne = vi.fn(async () => record);
    const client = build({ fetchOne });

    await client.enrichOne(item);
    const second = await client.enrichOne(item);

    expect(fetchOne).toHaveBeenCalledTimes(1);
    expect(second.fromCache).toBe(true);
  });

  it('bypasses the cache when the caller asks for a real retry', async () => {
    const fetchOne = vi.fn(async () => record);
    const client = build({ fetchOne });

    await client.enrichOne(item);
    await client.enrichOne(item, { bypassCache: true });

    expect(fetchOne).toHaveBeenCalledTimes(2);
  });

  it('retries once on a transient failure and then succeeds', async () => {
    let calls = 0;
    const client = build({
      fetchOne: async () => {
        calls += 1;
        if (calls === 1) throw new UpstreamError('flake');
        return record;
      },
    });

    const { enrichment } = await client.enrichOne(item);
    expect(enrichment.status).toBe('ok');
    expect(calls).toBe(2);
  });

  it('degrades to `unavailable` instead of throwing when every attempt fails', async () => {
    const client = build({ fetchOne: async () => { throw new UpstreamError('down'); } });
    const { enrichment } = await client.enrichOne(item);

    expect(enrichment).toMatchObject({ status: 'unavailable', reason: 'upstream_error' });
  });

  it('reports a timeout distinctly from a hard failure', async () => {
    const client = build({ fetchOne: () => new Promise<UpstreamRecord>(() => { /* never settles */ }) }, { retries: 0 });
    const { enrichment } = await client.enrichOne(item);

    expect(enrichment).toMatchObject({ status: 'unavailable', reason: 'timeout' });
  });

  it('opens the circuit after repeated failures and then fails fast', async () => {
    const fetchOne = vi.fn(async (): Promise<UpstreamRecord> => { throw new UpstreamError('down'); });
    const client = build({ fetchOne }, { retries: 0, breakerThreshold: 2 });

    await client.enrichOne(item);
    await client.enrichOne({ ...item, id: 'a2' });
    expect(client.circuitState).toBe('open');

    const callsBefore = fetchOne.mock.calls.length;
    const { enrichment } = await client.enrichOne({ ...item, id: 'a3' });

    expect(enrichment).toMatchObject({ status: 'unavailable', reason: 'circuit_open' });
    expect(fetchOne.mock.calls.length).toBe(callsBefore); // no upstream call was made
  });

  it('does not trip the circuit on a not-found — that is an answer, not a fault', async () => {
    const client = build({ fetchOne: async () => { throw new UpstreamNotFoundError('a1'); } }, { breakerThreshold: 1 });
    const { enrichment } = await client.enrichOne(item);

    expect(enrichment).toMatchObject({ status: 'unavailable', reason: 'not_found' });
    expect(client.circuitState).toBe('closed');
  });

  it('collapses concurrent requests for the same item into one upstream call', async () => {
    const fetchOne = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return record;
    });
    const client = build({ fetchOne });

    await Promise.all([client.enrichOne(item), client.enrichOne(item), client.enrichOne(item)]);
    expect(fetchOne).toHaveBeenCalledTimes(1);
  });

  it('isolates a failing item from the rest of the page', async () => {
    const client = build({
      fetchOne: async (id) => {
        if (id === 'bad') throw new UpstreamError('down');
        return { ...record, itemId: id };
      },
    }, { retries: 0 });

    const outcome = await client.enrichMany([item, { ...item, id: 'bad' }, { ...item, id: 'c1' }]);

    expect(outcome.requested).toBe(3);
    expect(outcome.fulfilled).toBe(2);
    expect(outcome.failed).toBe(1);
    expect(outcome.byId.get('bad')).toMatchObject({ status: 'unavailable' });
    expect(outcome.byId.get('a1')).toMatchObject({ status: 'ok' });
  });
});
