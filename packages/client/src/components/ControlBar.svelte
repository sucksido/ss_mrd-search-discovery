<script lang="ts">
  import { SORT_LABELS, SORT_OPTIONS, type SortOption } from '@mrd/shared';
  import type { SearchStore } from '../lib/search-store.svelte.js';

  let { store }: { store: SearchStore } = $props();

  const total = $derived(store.pagination?.totalItems ?? 0);
  const countLabel = $derived(
    store.state === 'loading'
      ? 'Searching…'
      : `${total} ${total === 1 ? 'result' : 'results'}${store.q !== '' ? ` for “${store.q}”` : ''}`,
  );
</script>

<div class="controls">
  <div class="group">
    <label for="category-select">Category</label>
    <select
      id="category-select"
      value={store.category ?? 'all'}
      onchange={(event) => store.setCategory(event.currentTarget.value)}
    >
      <option value="all">All categories</option>
      {#each store.categories as facet (facet.category)}
        <option value={facet.category}>{facet.category} ({facet.count})</option>
      {/each}
    </select>
  </div>

  <div class="group">
    <label for="sort-select">Sort</label>
    <select
      id="sort-select"
      value={store.sort}
      onchange={(event) => store.setSort(event.currentTarget.value as SortOption)}
    >
      {#each SORT_OPTIONS as option (option)}
        <option value={option}>{SORT_LABELS[option]}</option>
      {/each}
    </select>
  </div>

  <!-- Announced politely so a screen-reader user hears the new count without
       losing their place in the list. -->
  <p class="count" aria-live="polite">{countLabel}</p>
</div>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) 0;
  }
  .group { display: flex; align-items: center; gap: var(--space-2); }
  label { color: var(--text-muted); font-size: 0.85rem; }
  select {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
  }
  .count { margin: 0 0 0 auto; color: var(--text-muted); font-size: 0.9rem; }
  @media (max-width: 560px) {
    .count { margin-left: 0; width: 100%; }
  }
</style>
