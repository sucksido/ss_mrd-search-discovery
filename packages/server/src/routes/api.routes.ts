import type {
  CategoriesResponse,
  HealthResponse,
  ItemEnrichmentResponse,
  MetricsResponse,
  SuggestResponse,
} from '@mrd/shared';
import { Router } from 'express';
import type { CatalogRepository } from '../catalog/catalog.repository.js';
import { ApiError } from '../lib/api-error.js';
import type { MetricsRegistry } from '../lib/metrics.js';
import { asyncHandler } from '../middleware/request-context.js';
import { parseSearchQuery } from '../search/query.parser.js';
import type { SearchService } from '../search/search.service.js';
import type { EnrichmentClient } from '../upstream/enrichment.client.js';

const MAX_SUGGESTIONS = 8;
const startedAt = Date.now();

export interface RouteDeps {
  repo: CatalogRepository;
  search: SearchService;
  enrichment: EnrichmentClient;
  metrics: MetricsRegistry;
}

export function createApiRouter(deps: RouteDeps): Router {
  const router = Router();
  const categoryNames = deps.repo.categories().map((facet) => facet.category);

  /**
   * GET /api/search
   * Free-text search + category filter + sort + pagination + enrichment.
   * Always 200 when the query is valid: a broken upstream degrades the
   * individual results, it does not fail the search.
   */
  router.get(
    '/search',
    asyncHandler(async (req, res) => {
      const query = parseSearchQuery(req.query as Record<string, unknown>, categoryNames);
      const response = await deps.search.search(query, req.requestId);
      // Live prices must not be cached by an intermediary.
      res.setHeader('cache-control', 'no-store');
      res.json(response);
    }),
  );

  /** GET /api/suggest — catalog-only typeahead, no upstream calls. */
  router.get('/suggest', (req, res) => {
    const started = Date.now();
    const raw = req.query['q'];
    const q = typeof raw === 'string' ? raw : '';
    const body: SuggestResponse = {
      q,
      suggestions: deps.search.suggest(q, MAX_SUGGESTIONS),
      meta: { requestId: req.requestId, tookMs: Date.now() - started },
    };
    res.setHeader('cache-control', 'public, max-age=30');
    res.json(body);
  });

  /** GET /api/categories — filter options with catalog-wide counts. */
  router.get('/categories', (req, res) => {
    const body: CategoriesResponse = {
      categories: deps.repo.categories(),
      meta: { requestId: req.requestId },
    };
    res.setHeader('cache-control', 'public, max-age=300');
    res.json(body);
  });

  /**
   * GET /api/items/:id/enrichment
   * Per-item retry for the UI's "Live info unavailable — Retry" control.
   * `?refresh=1` bypasses the server cache so the retry is a real attempt.
   */
  router.get(
    '/items/:id/enrichment',
    asyncHandler(async (req, res) => {
      const id = req.params['id'] ?? '';
      const item = deps.repo.get(id);
      if (item === undefined) throw ApiError.notFound(`No catalog item with id "${id}"`);

      const started = Date.now();
      const { enrichment } = await deps.enrichment.enrichOne(item, { bypassCache: req.query['refresh'] === '1' });
      const body: ItemEnrichmentResponse = {
        id,
        enrichment,
        meta: { requestId: req.requestId, tookMs: Date.now() - started },
      };
      res.setHeader('cache-control', 'no-store');
      res.json(body);
    }),
  );

  /** GET /api/metrics — request counts, latency percentiles, upstream health. */
  router.get('/metrics', (_req, res) => {
    const body: MetricsResponse = deps.metrics.snapshot(
      deps.enrichment.circuitState,
      deps.enrichment.circuitOpenedCount,
    );
    res.setHeader('cache-control', 'no-store');
    res.json(body);
  });

  /** GET /api/health — liveness plus the current breaker state. */
  router.get('/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      catalogSize: deps.repo.size,
      circuitState: deps.enrichment.circuitState,
    };
    res.json(body);
  });

  return router;
}
