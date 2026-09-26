import {
  isApiErrorBody,
  type CategoriesResponse,
  type ItemEnrichmentResponse,
  type MetricsResponse,
  type SearchResponse,
  type SortOption,
  type SuggestResponse,
} from '@mrd/shared';

/**
 * What the client sends. `category` is a plain string on purpose: the browser
 * may be restoring a link written by an older build, so the server — not the
 * client — is the authority on which categories exist, and it answers with a
 * field-level 400 when the value is wrong.
 */
export interface SearchParams {
  q: string;
  category: string | null;
  sort: SortOption;
  page: number;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { signal, headers: { accept: 'application/json' } });
  } catch (error) {
    // An abort is a deliberate cancellation, not a failure — let it through
    // untouched so the caller can ignore it.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiRequestError('Could not reach the server. Check that the API is running.', 0);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiRequestError(body.error.message, response.status, body.error.requestId);
    }
    throw new ApiRequestError(`Request failed with status ${response.status}`, response.status);
  }

  return body as T;
}

export function buildSearchParams(query: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q.trim() !== '') params.set('q', query.q.trim());
  if (query.category !== null) params.set('category', query.category);
  if (query.sort !== 'relevance') params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

export const api = {
  search: (query: SearchParams, signal?: AbortSignal): Promise<SearchResponse> =>
    getJson<SearchResponse>(`/api/search?${buildSearchParams(query).toString()}`, signal),

  suggest: (q: string, signal?: AbortSignal): Promise<SuggestResponse> =>
    getJson<SuggestResponse>(`/api/suggest?q=${encodeURIComponent(q)}`, signal),

  categories: (signal?: AbortSignal): Promise<CategoriesResponse> =>
    getJson<CategoriesResponse>('/api/categories', signal),

  itemEnrichment: (id: string, signal?: AbortSignal): Promise<ItemEnrichmentResponse> =>
    getJson<ItemEnrichmentResponse>(`/api/items/${encodeURIComponent(id)}/enrichment?refresh=1`, signal),

  metrics: (signal?: AbortSignal): Promise<MetricsResponse> =>
    getJson<MetricsResponse>('/api/metrics', signal),
};
