import { SORT_OPTIONS, type SortOption } from '@mrd/shared';

export interface UrlState {
  q: string;
  category: string | null;
  sort: SortOption;
  page: number;
}

export function readUrlState(search: string = window.location.search): UrlState {
  const params = new URLSearchParams(search);
  const sortRaw = params.get('sort');
  const sort = SORT_OPTIONS.find((option) => option === sortRaw) ?? 'relevance';
  const pageRaw = Number(params.get('page') ?? '1');

  return {
    q: params.get('q') ?? '',
    category: params.get('category'),
    sort,
    page: Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  };
}

/**
 * `replaceState` rather than `pushState`: typing a query is not a navigation,
 * and filling the back stack with every keystroke-triggered search is the
 * fastest way to make a Back button useless.
 */
export function writeUrlState(params: URLSearchParams): void {
  const query = params.toString();
  const next = query === '' ? window.location.pathname : `${window.location.pathname}?${query}`;
  if (next !== window.location.pathname + window.location.search) {
    window.history.replaceState({}, '', next);
  }
}
