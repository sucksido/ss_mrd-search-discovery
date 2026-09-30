<script lang="ts">
  import { onMount } from 'svelte';
  import ControlBar from './components/ControlBar.svelte';
  import EmptyState from './components/EmptyState.svelte';
  import MetricsPanel from './components/MetricsPanel.svelte';
  import Pagination from './components/Pagination.svelte';
  import ResultCard from './components/ResultCard.svelte';
  import SearchBar from './components/SearchBar.svelte';
  import SkeletonCard from './components/SkeletonCard.svelte';
  import StatusBanner from './components/StatusBanner.svelte';
  import { SearchStore } from './lib/search-store.svelte.js';

  const store = new SearchStore();

  // onMount, not $effect: init() reads the store's own reactive state, so an
  // effect would track those reads and re-run itself on the first response —
  // re-applying the URL state and wiping the query the user just typed.
  // (Caught by a Playwright smoke test; see SOLUTION.md.)
  onMount(() => {
    void store.init();
  });

  const degradedDetail = $derived.by(() => {
    const meta = store.enrichmentMeta;
    if (meta === null) return undefined;
    const parts = [`${meta.failed} of ${meta.requested} items could not be priced`];
    if (meta.circuitState !== 'closed') parts.push(`upstream circuit is ${meta.circuitState.replace('_', '-')}`);
    if (meta.sortDegraded) parts.push('sorted on menu prices');
    return parts.join(' · ');
  });
</script>

<div class="page">
  <header class="masthead">
    <h1>Search &amp; Discovery</h1>
    <p>Live availability and pricing across the Mr D catalog.</p>
  </header>

  <div class="sticky">
    <SearchBar {store} />
    <ControlBar {store} />
    <div class="progress" role="presentation" class:active={store.isBusy}><span></span></div>
  </div>

  <main>
    {#if store.state === 'error'}
      <StatusBanner
        tone="danger"
        title="Couldn’t load results"
        detail={store.error ?? undefined}
        actionLabel="Try again"
        onAction={() => store.retry()}
      />
    {:else if store.isDegraded}
      <StatusBanner
        title="Live pricing degraded"
        detail={degradedDetail}
        actionLabel="Refresh"
        onAction={() => store.retry()}
      />
    {/if}

    <!-- Refining dims the existing list instead of clearing it: the customer
         keeps their context, and nothing reflows under their thumb. -->
    <div
      class="results"
      class:refreshing={store.state === 'refreshing'}
      class:single={store.isEmpty}
    >
      {#if store.state === 'loading'}
        {#each Array.from({ length: 8 }) as _, index (index)}
          <SkeletonCard />
        {/each}
      {:else if store.isEmpty}
        <EmptyState
          query={store.q}
          hasFilter={store.category !== null}
          onReset={() => { store.category = null; store.clearQuery(); }}
        />
      {:else}
        {#each store.results as item (item.id)}
          <ResultCard
            {item}
            retrying={store.retryingIds.includes(item.id)}
            onRetry={(id) => store.retryItem(id)}
          />
        {/each}
      {/if}
    </div>

    {#if store.pagination !== null}
      <Pagination pagination={store.pagination} disabled={store.isBusy} onGo={(page) => store.goToPage(page)} />
    {/if}

    <footer class="instrumentation">
      {#if store.response !== null}
        <p class="timing tnum">
          {store.response.meta.tookMs} ms total
          <span aria-hidden="true">·</span> search {store.response.meta.searchMs} ms
          <span aria-hidden="true">·</span> enrich {store.response.meta.enrichMs} ms
          <span aria-hidden="true">·</span> {store.response.meta.enrichment.cacheHits} cache hits
        </p>
      {/if}
      <MetricsPanel {store} />
    </footer>
  </main>
</div>

<style>
  .page {
    max-width: 1060px;
    margin: 0 auto;
    padding: var(--space-6) var(--space-5) var(--space-6);
  }

  .masthead h1 {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .masthead p {
    margin: 2px 0 var(--space-5);
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .sticky {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--bg);
    padding-top: var(--space-2);
  }

  /* Always in the layout, only ever changes opacity — a progress bar that
     appears and disappears shifts the whole list down and back on every
     keystroke. */
  .progress { height: 1px; background: var(--border); overflow: hidden; opacity: 0; }
  .progress.active { opacity: 1; }
  .progress span {
    display: block; height: 100%; width: 30%;
    background: var(--accent);
    animation: slide 0.9s ease-in-out infinite;
  }
  @keyframes slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(400%); }
  }

  /* auto-fill with a minimum, not a hard "repeat(2, 1fr)": the column count
     falls to one when the viewport can no longer give a card 340px, so there is
     no separate mobile rule to keep in sync. A gap, not a divider — the canvas
     showing through is what makes each card read as its own object. */
  .results {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: var(--space-3);
    margin-top: var(--space-4);
    transition: opacity 120ms ease;
  }
  .results.refreshing { opacity: 0.5; }

  /* The empty state is a single statement, not a half-width card with a hole
     beside it. */
  .results.single { grid-template-columns: 1fr; }

  .instrumentation { margin-top: var(--space-6); }
  .timing {
    margin: 0 0 var(--space-2);
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 0.6875rem;
  }

  @media (max-width: 640px) {
    .page { padding: var(--space-5) var(--space-4); }
  }
</style>
