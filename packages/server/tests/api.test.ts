import type { ApiErrorBody, CategoriesResponse, HealthResponse, MetricsResponse, SearchResponse, SuggestResponse } from '@mrd/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';

const app = (overrides: Partial<AppConfig> = {}): ReturnType<typeof createApp>['app'] => createApp(overrides).app;

/** A reliable upstream (no latency, no failures) for contract-level tests. */
const reliable = app();

describe('GET /api/search — happy path', () => {
  it('returns ranked, enriched results in the documented envelope', async () => {
    const res = await request(reliable).get('/api/search').query({ q: 'burger' }).expect(200);
    const body = res.body as SearchResponse;

    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0]?.name).toContain('Burger');
    expect(body.results[0]?.enrichment.status).toBe('ok');
    expect(body.pagination).toMatchObject({ page: 1, pageSize: 12 });
    expect(body.facets.categories.length).toBeGreaterThan(0);
    expect(body.meta.requestId).toEqual(res.headers['x-request-id']);
    expect(body.meta.enrichment.degraded).toBe(false);
  });

  it('returns the whole catalog when no query is supplied', async () => {
    const body = (await request(reliable).get('/api/search').expect(200)).body as SearchResponse;
    expect(body.pagination.totalItems).toBe(36);
    expect(body.results).toHaveLength(12);
  });

  it('applies the category filter but keeps unfiltered facet counts', async () => {
    const body = (await request(reliable).get('/api/search').query({ category: 'Desserts' }).expect(200)).body as SearchResponse;
    expect(body.results.every((item) => item.category === 'Desserts')).toBe(true);
    expect(body.facets.categories).toHaveLength(6);
  });

  it('sorts by live price, ascending', async () => {
    const body = (await request(reliable).get('/api/search').query({ sort: 'price_asc', pageSize: 10 }).expect(200)).body as SearchResponse;
    const prices = body.results.map((item) => (item.enrichment.status === 'ok' ? item.enrichment.price : Number.MAX_SAFE_INTEGER));
    expect([...prices]).toEqual([...prices].sort((a, b) => a - b));
    expect(body.meta.enrichment.sortDegraded).toBe(false);
  });

  it('flags sortDegraded when the result set is larger than the enrich-for-sort budget', async () => {
    const small = app({ resilience: { ...createApp().config.resilience, enrichSortLimit: 5 } });
    const body = (await request(small).get('/api/search').query({ sort: 'price_asc' }).expect(200)).body as SearchResponse;
    expect(body.meta.enrichment.sortDegraded).toBe(true);
  });

  it('clamps an out-of-range page rather than returning an empty list', async () => {
    const body = (await request(reliable).get('/api/search').query({ page: 99 }).expect(200)).body as SearchResponse;
    expect(body.pagination.page).toBe(body.pagination.totalPages);
    expect(body.results.length).toBeGreaterThan(0);
  });

  it('returns an empty result set — not an error — when nothing matches', async () => {
    const body = (await request(reliable).get('/api/search').query({ q: 'xyzzy' }).expect(200)).body as SearchResponse;
    expect(body.results).toHaveLength(0);
    expect(body.pagination.totalItems).toBe(0);
  });

  it('only enriches the current page, not the whole catalog', async () => {
    const body = (await request(app()).get('/api/search').query({ pageSize: 4 }).expect(200)).body as SearchResponse;
    expect(body.meta.enrichment.requested).toBe(4);
  });
});

describe('GET /api/search — validation', () => {
  it('rejects an unknown category with a field-level 400', async () => {
    const res = await request(reliable).get('/api/search').query({ category: 'Spaceships' }).expect(400);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.[0]?.field).toBe('category');
    expect(body.error.requestId).toBeTruthy();
  });

  it('rejects an unknown sort option', async () => {
    await request(reliable).get('/api/search').query({ sort: 'cheapest' }).expect(400);
  });

  it('rejects an out-of-range pageSize', async () => {
    await request(reliable).get('/api/search').query({ pageSize: 1000 }).expect(400);
  });
});

describe('GET /api/search — upstream degradation', () => {
  const broken = app({ upstream: { ...createApp().config.upstream, failureRate: 1 }, resilience: { ...createApp().config.resilience, retries: 0, breakerThreshold: 2 } });

  it('still returns 200 with catalog data when the upstream is completely down', async () => {
    const body = (await request(broken).get('/api/search').query({ q: 'pizza' }).expect(200)).body as SearchResponse;

    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((item) => item.enrichment.status === 'unavailable')).toBe(true);
    expect(body.meta.enrichment.degraded).toBe(true);
    expect(body.meta.enrichment.fulfilled).toBe(0);
  });

  it('falls back to menu-price ordering — and flags it — when nothing could be enriched', async () => {
    const body = (await request(broken).get('/api/search').query({ q: 'pizza', sort: 'price_asc' }).expect(200)).body as SearchResponse;
    const prices = body.results.map((item) => item.basePrice);

    expect(body.meta.enrichment.fulfilled).toBe(0);
    expect(body.meta.enrichment.sortDegraded).toBe(true);
    expect([...prices]).toEqual([...prices].sort((a, b) => a - b));
  });

  it('trips the circuit so later requests fail fast instead of timing out', async () => {
    await request(broken).get('/api/search').query({ q: 'pizza' });
    const body = (await request(broken).get('/api/search').query({ q: 'sushi' }).expect(200)).body as SearchResponse;

    expect(body.meta.enrichment.circuitState).toBe('open');
    expect(body.results[0]?.enrichment).toMatchObject({ reason: 'circuit_open' });
  });

  it('survives an upstream that is slower than the timeout', async () => {
    const slow = app({
      upstream: { ...createApp().config.upstream, baseLatencyMs: 5_000, jitterMs: 0, failureRate: 0, slowRate: 0 },
      resilience: { ...createApp().config.resilience, timeoutMs: 40, retries: 0 },
    });
    const startedAt = Date.now();
    const body = (await request(slow).get('/api/search').query({ q: 'burger' }).expect(200)).body as SearchResponse;

    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(body.results[0]?.enrichment).toMatchObject({ status: 'unavailable', reason: 'timeout' });
  });
});

describe('the other endpoints', () => {
  it('GET /api/suggest returns catalog-only suggestions', async () => {
    const body = (await request(reliable).get('/api/suggest').query({ q: 'piz' }).expect(200)).body as SuggestResponse;
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.suggestions[0]).toHaveProperty('emoji');
  });

  it('GET /api/suggest offers items, not everything in a matching category', async () => {
    const body = (await request(reliable).get('/api/suggest').query({ q: 'piz' }).expect(200)).body as SuggestResponse;
    // "piz" prefix-matches the category "Pizza & Pasta", but a suggestion is a
    // shortcut to an item — so only the pizzas themselves should be offered.
    expect(body.suggestions.every((s) => s.name.toLowerCase().includes('pizza'))).toBe(true);
  });

  it('GET /api/suggest returns nothing for an empty query', async () => {
    const body = (await request(reliable).get('/api/suggest').expect(200)).body as SuggestResponse;
    expect(body.suggestions).toEqual([]);
  });

  it('GET /api/categories lists every category with counts', async () => {
    const body = (await request(reliable).get('/api/categories').expect(200)).body as CategoriesResponse;
    expect(body.categories).toHaveLength(6);
    expect(body.categories.reduce((sum, facet) => sum + facet.count, 0)).toBe(36);
  });

  it('GET /api/items/:id/enrichment re-fetches a single item', async () => {
    const body = (await request(reliable).get('/api/items/ff-001/enrichment').query({ refresh: '1' }).expect(200)).body;
    expect(body.id).toBe('ff-001');
    expect(body.enrichment.status).toBe('ok');
  });

  it('GET /api/items/:id/enrichment 404s on an unknown id', async () => {
    const body = (await request(reliable).get('/api/items/nope/enrichment').expect(404)).body as ApiErrorBody;
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('GET /api/metrics reports request and upstream counters', async () => {
    const instance = app();
    await request(instance).get('/api/search').query({ q: 'coffee' });
    const body = (await request(instance).get('/api/metrics').expect(200)).body as MetricsResponse;

    expect(body.upstream.calls).toBeGreaterThan(0);
    expect(Object.keys(body.requests).some((key) => key.includes('/search'))).toBe(true);
  });

  it('GET /api/health reports catalog size and circuit state', async () => {
    const body = (await request(reliable).get('/api/health').expect(200)).body as HealthResponse;
    expect(body).toMatchObject({ status: 'ok', catalogSize: 36, circuitState: 'closed' });
  });

  it('unknown routes use the same error envelope', async () => {
    const body = (await request(reliable).get('/api/nope').expect(404)).body as ApiErrorBody;
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBeTruthy();
  });
});
