import type { CategoryFacet, MetricsResponse, SearchResponse, SortOption, Suggestion } from '@mrd/shared';
import { api, ApiRequestError, buildSearchParams } from './api.js';
import { debounce } from './debounce.js';
import { readUrlState, writeUrlState } from './url-state.js';

export type LoadState = 'idle' | 'loading' | 'refreshing' | 'error';

const SUGGEST_DEBOUNCE_MS = 220;
const MIN_SUGGEST_LENGTH = 2;

/**
 * One object owns the whole screen's state: the request lifecycle, the
 * in-flight abort, the URL sync and the per-item retry.
 *
 * Svelte 5 runes make a plain class reactive, which beats scattering four or
 * five stores across components for a view this size — the invariant "one
 * search in flight at a time, and the URL always describes what you see" lives
 * in exactly one file.
 */
export class SearchStore {
  /* --- inputs ------------------------------------------------------- */
  q = $state('');
  category = $state<string | null>(null);
  sort = $state<SortOption>('relevance');
  page = $state(1);

  /* --- results ------------------------------------------------------ */
  response = $state<SearchResponse | null>(null);
  state = $state<LoadState>('idle');
  error = $state<string | null>(null);
  categories = $state<CategoryFacet[]>([]);

  /* --- typeahead ---------------------------------------------------- */
  suggestions = $state<Suggestion[]>([]);
  suggestionsOpen = $state(false);
  activeSuggestion = $state(-1);

  /* --- instrumentation panel --------------------------------------- */
  metrics = $state<MetricsResponse | null>(null);
  retryingIds = $state<string[]>([]);

  /* --- derived ------------------------------------------------------ */
  readonly results = $derived(this.response?.results ?? []);
  readonly pagination = $derived(this.response?.pagination ?? null);
  readonly enrichmentMeta = $derived(this.response?.meta.enrichment ?? null);
  readonly isDegraded = $derived(this.enrichmentMeta?.degraded === true);
  readonly isBusy = $derived(this.state === 'loading' || this.state === 'refreshing');
  readonly isEmpty = $derived(this.state !== 'loading' && this.response !== null && this.results.length === 0);

  #searchAbort: AbortController | null = null;
  #suggestAbort: AbortController | null = null;

  /** Debounced so a burst of keystrokes is one suggest call, not one per key. */
  #suggestDebounced = debounce((term: string) => { void this.#loadSuggestions(term); }, SUGGEST_DEBOUNCE_MS);

  async init(): Promise<void> {
    this.#applyUrlState();
    window.addEventListener('popstate', () => {
      this.#applyUrlState();
      void this.run({ resetPage: false });
    });

    // Categories are independent of the search — don't make results wait.
    void api.categories()
      .then((body) => { this.categories = body.categories; })
      .catch(() => { /* the filter simply stays at "All categories" */ });

    await this.run({ resetPage: false });
  }

  #applyUrlState(): void {
    const url = readUrlState();
    this.q = url.q;
    this.category = url.category;
    this.sort = url.sort;
    this.page = url.page;
  }

  /* --- actions ------------------------------------------------------ */

  onQueryInput(value: string): void {
    this.q = value;
    this.activeSuggestion = -1;
    if (value.trim().length < MIN_SUGGEST_LENGTH) {
      this.#suggestDebounced.cancel();
      this.suggestions = [];
      this.suggestionsOpen = false;
      return;
    }
    this.#suggestDebounced(value.trim());
  }

  closeSuggestions(): void {
    this.suggestionsOpen = false;
    this.activeSuggestion = -1;
  }

  moveSuggestion(delta: number): void {
    if (!this.suggestionsOpen || this.suggestions.length === 0) return;
    const next = this.activeSuggestion + delta;
    this.activeSuggestion = next < 0 ? this.suggestions.length - 1 : next % this.suggestions.length;
  }

  chooseSuggestion(index: number): void {
    const suggestion = this.suggestions[index];
    if (suggestion === undefined) return;
    this.q = suggestion.name;
    this.closeSuggestions();
    void this.run({ resetPage: true });
  }

  submit(): void {
    this.#suggestDebounced.cancel();
    this.closeSuggestions();
    void this.run({ resetPage: true });
  }

  clearQuery(): void {
    this.q = '';
    this.suggestions = [];
    this.closeSuggestions();
    void this.run({ resetPage: true });
  }

  setCategory(value: string): void {
    this.category = value === 'all' ? null : value;
    void this.run({ resetPage: true });
  }

  setSort(value: SortOption): void {
    this.sort = value;
    void this.run({ resetPage: true });
  }

  goToPage(page: number): void {
    this.page = page;
    void this.run({ resetPage: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  retry(): void {
    void this.run({ resetPage: false });
  }

  /* --- requests ----------------------------------------------------- */

  async run({ resetPage }: { resetPage: boolean }): Promise<void> {
    if (resetPage) this.page = 1;

    // Only one search may be in flight: a stale response must never overwrite
    // a newer one, and the browser's connection budget is not free.
    this.#searchAbort?.abort();
    const controller = new AbortController();
    this.#searchAbort = controller;

    // Keep previous results on screen while refining — a blank grid on every
    // keystroke reads as "broken", not as "loading".
    this.state = this.response === null ? 'loading' : 'refreshing';
    this.error = null;

    const query = { q: this.q, category: this.category, sort: this.sort, page: this.page };
    writeUrlState(buildSearchParams(query));

    try {
      const body = await api.search(query, controller.signal);
      this.response = body;
      this.page = body.pagination.page;
      this.state = 'idle';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.state = 'error';
      this.error = error instanceof ApiRequestError ? error.message : 'Something went wrong. Please try again.';
    } finally {
      if (this.#searchAbort === controller) this.#searchAbort = null;
    }
  }

  async #loadSuggestions(term: string): Promise<void> {
    this.#suggestAbort?.abort();
    const controller = new AbortController();
    this.#suggestAbort = controller;
    try {
      const body = await api.suggest(term, controller.signal);
      this.suggestions = body.suggestions;
      this.suggestionsOpen = body.suggestions.length > 0;
    } catch {
      this.suggestions = [];
      this.suggestionsOpen = false;
    }
  }

  /** Re-fetch one item's live data without re-running the whole search. */
  async retryItem(id: string): Promise<void> {
    if (this.retryingIds.includes(id)) return;
    this.retryingIds = [...this.retryingIds, id];
    try {
      const body = await api.itemEnrichment(id);
      const current = this.response;
      if (current === null) return;
      this.response = {
        ...current,
        results: current.results.map((item) => (item.id === id ? { ...item, enrichment: body.enrichment } : item)),
      };
    } catch {
      /* the card keeps its unavailable state; the button becomes clickable again */
    } finally {
      this.retryingIds = this.retryingIds.filter((value) => value !== id);
    }
  }

  async loadMetrics(): Promise<void> {
    try {
      this.metrics = await api.metrics();
    } catch {
      this.metrics = null;
    }
  }
}
