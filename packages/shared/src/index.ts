/**
 * The HTTP contract, shared by the server and the client.
 *
 * This package is the single source of truth for the wire format. The client
 * does not import server code — it imports the contract, which is the only
 * thing the two are actually allowed to agree on.
 */

/* ------------------------------------------------------------------ catalog */

export type Category =
  | 'Fast Food'
  | 'Pizza & Pasta'
  | 'Sushi & Asian'
  | 'Healthy'
  | 'Desserts'
  | 'Drinks';

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  category: Category;
  tags: string[];
  vendor: string;
  /** The catalog's price in ZAR cents. Live price comes from enrichment. */
  basePrice: number;
  rating: number;
  popularity: number;
  emoji: string;
}

/* --------------------------------------------------------------- enrichment */

export type EnrichmentStatus = 'ok' | 'unavailable';
export type CircuitState = 'closed' | 'open' | 'half_open';
export type StockLevel = 'in_stock' | 'low_stock' | 'sold_out';

export interface EnrichmentOk {
  status: 'ok';
  /** Live price in ZAR cents (basePrice x surgeMultiplier). */
  price: number;
  currency: 'ZAR';
  available: boolean;
  stockLevel: StockLevel;
  deliveryEtaMinutes: number;
  surgeMultiplier: number;
  fetchedAt: string;
  /** True when served from the server-side TTL cache rather than upstream. */
  cached: boolean;
}

export interface EnrichmentUnavailable {
  status: 'unavailable';
  /** Machine-readable cause, for the UI and for debugging. */
  reason: 'timeout' | 'upstream_error' | 'circuit_open' | 'not_found';
  message: string;
}

export type Enrichment = EnrichmentOk | EnrichmentUnavailable;

/* ------------------------------------------------------------------- search */

export const SORT_OPTIONS = [
  'relevance',
  'price_asc',
  'price_desc',
  'rating_desc',
  'popularity_desc',
  'delivery_asc',
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number];

export const SORT_LABELS: Record<SortOption, string> = {
  relevance: 'Best match',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  rating_desc: 'Highest rated',
  popularity_desc: 'Most popular',
  delivery_asc: 'Fastest delivery',
};

export interface SearchQuery {
  q: string;
  category: Category | null;
  sort: SortOption;
  page: number;
  pageSize: number;
}

export interface SearchResultItem extends CatalogItem {
  /** Relevance score for this query; 0 when browsing with an empty query. */
  score: number;
  enrichment: Enrichment;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CategoryFacet {
  category: Category;
  count: number;
}

export interface EnrichmentMeta {
  requested: number;
  fulfilled: number;
  failed: number;
  cacheHits: number;
  /** True when at least one item on this page could not be enriched. */
  degraded: boolean;
  /**
   * True when a live-value sort (price/delivery) had to fall back to catalog
   * values because the result set was larger than the enrich-for-sort budget.
   */
  sortDegraded: boolean;
  circuitState: CircuitState;
}

export interface SearchResponse {
  query: SearchQuery;
  results: SearchResultItem[];
  pagination: Pagination;
  facets: { categories: CategoryFacet[] };
  meta: {
    requestId: string;
    tookMs: number;
    searchMs: number;
    enrichMs: number;
    enrichment: EnrichmentMeta;
  };
}

/* --------------------------------------------------------- other responses */

export interface Suggestion {
  id: string;
  name: string;
  category: Category;
  emoji: string;
}

export interface SuggestResponse {
  q: string;
  suggestions: Suggestion[];
  meta: { requestId: string; tookMs: number };
}

export interface CategoriesResponse {
  categories: CategoryFacet[];
  meta: { requestId: string };
}

export interface ItemEnrichmentResponse {
  id: string;
  enrichment: Enrichment;
  meta: { requestId: string; tookMs: number };
}

export interface MetricsResponse {
  uptimeSeconds: number;
  requests: Record<string, { count: number; errors: number; p50Ms: number; p95Ms: number; maxMs: number }>;
  upstream: {
    calls: number;
    failures: number;
    timeouts: number;
    retries: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    circuitState: CircuitState;
    circuitOpenedCount: number;
    p50Ms: number;
    p95Ms: number;
  };
}

export interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
  catalogSize: number;
  circuitState: CircuitState;
}

/* -------------------------------------------------------------------- error */

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Array<{ field: string; message: string }>;
    requestId: string;
  };
}

/** Type guard used by the client to branch on a failed response body. */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.code === 'string'
  );
}

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;
