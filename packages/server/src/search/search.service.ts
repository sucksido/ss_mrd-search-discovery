import type {
  CategoryFacet,
  Enrichment,
  Pagination,
  SearchQuery,
  SearchResponse,
  SearchResultItem,
  SortOption,
  Suggestion,
} from '@mrd/shared';
import type { CatalogRepository, IndexedItem } from '../catalog/catalog.repository.js';
import type { ResilienceConfig } from '../config.js';
import { normalize, tokenize } from '../lib/text.js';
import type { EnrichmentClient } from '../upstream/enrichment.client.js';
import { matchesNameOrTags, scoreItem } from './scoring.js';

export interface ScoredItem {
  item: IndexedItem;
  score: number;
}

/** Sorts whose key only exists after enrichment. */
const LIVE_VALUE_SORTS: ReadonlySet<SortOption> = new Set<SortOption>(['price_asc', 'price_desc', 'delivery_asc']);

export function sortNeedsEnrichment(sort: SortOption): boolean {
  return LIVE_VALUE_SORTS.has(sort);
}

/* ----------------------------------------------------- pure search helpers */

export function matchAndScore(items: readonly IndexedItem[], q: string): ScoredItem[] {
  const tokens = tokenize(q);
  const phrase = normalize(q);
  const matched: ScoredItem[] = [];

  for (const item of items) {
    const score = scoreItem(item, tokens, phrase);
    if (score === null) continue;
    matched.push({ item, score });
  }
  return matched;
}

/**
 * Facets are built from the text-matched set *before* the category filter is
 * applied, so the counts answer "what would I get if I switched category?"
 * rather than "1 result in the category I already picked".
 */
export function buildFacets(matched: readonly ScoredItem[]): CategoryFacet[] {
  const counts = new Map<string, number>();
  for (const { item } of matched) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([category, count]) => ({ category: category as CategoryFacet['category'], count }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function applyCategoryFilter(matched: readonly ScoredItem[], category: string | null): ScoredItem[] {
  if (category === null) return [...matched];
  return matched.filter((entry) => entry.item.category === category);
}

/**
 * `live` carries enriched values when we were able to enrich the whole result
 * set. Without it, price sorts fall back to the catalog base price and
 * delivery falls back to popularity — the response flags that as
 * `meta.enrichment.sortDegraded` rather than pretending the order is live.
 */
export function sortResults(
  entries: readonly ScoredItem[],
  sort: SortOption,
  live?: ReadonlyMap<string, Enrichment>,
): ScoredItem[] {
  const priceOf = (entry: ScoredItem): number | null => {
    if (live === undefined) return entry.item.basePrice;
    const enrichment = live.get(entry.item.id);
    return enrichment !== undefined && enrichment.status === 'ok' ? enrichment.price : null;
  };
  const etaOf = (entry: ScoredItem): number | null => {
    if (live === undefined) return null;
    const enrichment = live.get(entry.item.id);
    return enrichment !== undefined && enrichment.status === 'ok' ? enrichment.deliveryEtaMinutes : null;
  };

  // Items with no live value sort last in every direction — never dropped.
  const byNullable = (a: number | null, b: number | null, direction: 1 | -1): number | null => {
    if (a === null && b === null) return null;
    if (a === null) return 1;
    if (b === null) return -1;
    return a === b ? null : (a - b) * direction;
  };

  const fallback = (a: ScoredItem, b: ScoredItem): number =>
    b.score - a.score || b.item.popularity - a.item.popularity || a.item.name.localeCompare(b.item.name);

  const sorted = [...entries];
  sorted.sort((a, b) => {
    switch (sort) {
      case 'price_asc':
        return byNullable(priceOf(a), priceOf(b), 1) ?? fallback(a, b);
      case 'price_desc':
        return byNullable(priceOf(a), priceOf(b), -1) ?? fallback(a, b);
      case 'delivery_asc':
        return byNullable(etaOf(a), etaOf(b), 1) ?? (a.item.popularity === b.item.popularity ? fallback(a, b) : b.item.popularity - a.item.popularity);
      case 'rating_desc':
        return b.item.rating - a.item.rating || fallback(a, b);
      case 'popularity_desc':
        return b.item.popularity - a.item.popularity || fallback(a, b);
      case 'relevance':
      default:
        return fallback(a, b);
    }
  });
  return sorted;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): { slice: T[]; pagination: Pagination } {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    slice: items.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
    },
  };
}

/* --------------------------------------------------------------- the service */

export class SearchService {
  constructor(
    private readonly repo: CatalogRepository,
    private readonly enrichment: EnrichmentClient,
    private readonly config: ResilienceConfig,
  ) {}

  /**
   * Search, then enrich. Two orderings exist and the sort decides which:
   *
   *  - Ordinary sorts: filter → sort → paginate → enrich **one page**.
   *    Upstream fan-out is bounded by pageSize regardless of catalog size.
   *  - Live-value sorts (price, delivery): the key does not exist until the
   *    item is enriched, so the whole result set is enriched first — but only
   *    while it fits inside `enrichSortLimit`. Past that we sort on catalog
   *    values and say so, rather than firing hundreds of upstream calls.
   */
  async search(query: SearchQuery, requestId: string): Promise<SearchResponse> {
    const startedAt = Date.now();

    const matched = matchAndScore(this.repo.all(), query.q);
    const facets = buildFacets(matched);
    const filtered = applyCategoryFilter(matched, query.category);
    const searchMs = Date.now() - startedAt;

    const wantsLiveSort = sortNeedsEnrichment(query.sort);
    const canEnrichForSort = wantsLiveSort && filtered.length <= this.config.enrichSortLimit;

    const enrichStartedAt = Date.now();
    let enrichmentById: Map<string, Enrichment>;
    let stats = { requested: 0, fulfilled: 0, failed: 0, cacheHits: 0 };
    let ordered: ScoredItem[];
    let pageSlice: ScoredItem[];
    let pagination: Pagination;

    let sortDegraded = wantsLiveSort && !canEnrichForSort;

    if (canEnrichForSort) {
      const outcome = await this.enrichment.enrichMany(filtered.map((entry) => entry.item));
      enrichmentById = outcome.byId;
      stats = outcome;

      // Un-enriched items normally sort last — an unknown price must not sit
      // between two known ones. But when *nothing* came back, "last" is
      // meaningless and the order collapses to relevance, which looks broken
      // under a "Price: low to high" label. In that case fall back to menu
      // prices and say so, rather than showing an order that contradicts the
      // control the customer just used.
      const useLiveValues = outcome.fulfilled > 0;
      sortDegraded = !useLiveValues;
      ordered = useLiveValues ? sortResults(filtered, query.sort, outcome.byId) : sortResults(filtered, query.sort);
      ({ slice: pageSlice, pagination } = paginate(ordered, query.page, query.pageSize));
    } else {
      ordered = sortResults(filtered, query.sort);
      ({ slice: pageSlice, pagination } = paginate(ordered, query.page, query.pageSize));
      const outcome = await this.enrichment.enrichMany(pageSlice.map((entry) => entry.item));
      enrichmentById = outcome.byId;
      stats = outcome;
    }

    const enrichMs = Date.now() - enrichStartedAt;

    const results: SearchResultItem[] = pageSlice.map(({ item, score }) => ({
      ...stripIndex(item),
      score: Math.round(score * 100) / 100,
      enrichment:
        enrichmentById.get(item.id) ??
        ({ status: 'unavailable', reason: 'upstream_error', message: 'Live pricing is unavailable' } satisfies Enrichment),
    }));

    return {
      query: { ...query, page: pagination.page },
      results,
      pagination,
      facets: { categories: facets },
      meta: {
        requestId,
        tookMs: Date.now() - startedAt,
        searchMs,
        enrichMs,
        enrichment: {
          requested: stats.requested,
          fulfilled: stats.fulfilled,
          failed: stats.failed,
          cacheHits: stats.cacheHits,
          degraded: stats.failed > 0,
          sortDegraded,
          circuitState: this.enrichment.circuitState,
        },
      },
    };
  }

  /**
   * Typeahead. Deliberately does not enrich: suggestions fire on every pause
   * in typing, and paying upstream latency for a list the customer is about to
   * replace is how you make a search box feel broken.
   */
  suggest(q: string, limit: number): Suggestion[] {
    if (q.trim().length === 0) return [];
    const tokens = tokenize(q);
    return matchAndScore(this.repo.all(), q)
      .filter((entry) => matchesNameOrTags(entry.item, tokens))
      .sort((a, b) => b.score - a.score || b.item.popularity - a.item.popularity)
      .slice(0, limit)
      .map(({ item }) => ({ id: item.id, name: item.name, category: item.category, emoji: item.emoji }));
  }
}

/** Drop the internal folded-text index before the item goes over the wire. */
function stripIndex(item: IndexedItem): Omit<IndexedItem, 'searchable'> {
  const { searchable: _searchable, ...rest } = item;
  return rest;
}
