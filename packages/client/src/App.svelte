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
    return `${parts.join(' · ')}.`;
  });
</script>

<div class="page">
  <header class="masthead">
    <h1><span aria-hidden="true">🛵</span> Search &amp; Discovery</h1>
    <p>Find something to eat, with live availability and pricing.</p>
  </header>

  <div class="sticky">
    <SearchBar {store} />
    <ControlBar {store} />
    {#if store.isBusy}
      <div class="progress" role="presentation"><span></span></div>
    {/if}
  </div>

  <main>
    {#if store.state === 'error'}
      <StatusBanner
        tone="danger"
        title="We couldn’t load results"
        detail={store.error ?? undefined}
        actionLabel="Try again"
        onAction={() => store.retry()}
      />
    {:else if store.isDegraded}
      <StatusBanner
        title="Live pricing is degraded"
        detail={degradedDetail}
        actionLabel="Refresh"
        onAction={() => store.retry()}
      />
    {/if}

    <!-- Refining dims the existing grid instead of clearing it: the customer
         keeps their context, and nothing reflows under their thumb. -->
    <div class="grid" class:refreshing={store.state === 'refreshing'}>
      {#if store.state === 'loading'}
        {#each Array.from({ length: 6 }) as _, index (index)}
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

    {#if store.response !== null}
      <p class="timing">
        Served in {store.response.meta.tookMs} ms
        (search {store.response.meta.searchMs} ms · enrich {store.response.meta.enrichMs} ms ·
        {store.response.meta.enrichment.cacheHits} cache hits)
      </p>
    {/if}

    <MetricsPanel {store} />
  </main>
</div>

<style>
  .page { max-width: 1100px; margin: 0 auto; padding: var(--space-5) var(--space-4) var(--space-6); }

  .masthead h1 { margin: 0 0 var(--space-1); font-size: 1.6rem; }
  .masthead p { margin: 0 0 var(--space-4); color: var(--text-muted); }

  .sticky {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--bg);
    padding-top: var(--space-2);
    border-bottom: 1px solid var(--border);
    margin-bottom: var(--space-4);
  }

  .progress { height: 2px; background: var(--surface-2); overflow: hidden; }
  .progress span {
    display: block; height: 100%; width: 40%;
    background: var(--accent);
    animation: slide 1s ease-in-out infinite;
  }
  @keyframes slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--space-4);
    transition: opacity 150ms ease;
  }
  .grid.refreshing { opacity: 0.55; }

  .timing { text-align: center; color: var(--text-muted); font-size: 0.78rem; margin: 0; }
</style>
