<script lang="ts">
  import { SORT_LABELS, SORT_OPTIONS, type SortOption } from '@mrd/shared';
  import type { SearchStore } from '../lib/search-store.svelte.js';
  import CategoryIcon from './CategoryIcon.svelte';

  let { store }: { store: SearchStore } = $props();

  const total = $derived(store.pagination?.totalItems ?? 0);
  const countLabel = $derived(
    store.state === 'loading'
      ? 'Searching…'
      : `${total} ${total === 1 ? 'result' : 'results'}${store.q !== '' ? ` for “${store.q}”` : ''}`,
  );
</script>

<div class="controls">
  <!-- Chips rather than a <select>: with six categories the whole choice fits
       on one line, the counts are visible without opening anything, and the
       current filter is legible at a glance. aria-pressed carries the state,
       which is what a toggle button is for. -->
  <div class="chips" role="group" aria-label="Filter by category">
    <button
      type="button"
      class="chip"
      aria-pressed={store.category === null}
      onclick={() => store.setCategory('all')}
    >All</button>

    {#each store.facets as facet (facet.category)}
      <button
        type="button"
        class="chip"
        data-category={facet.category}
        aria-pressed={store.category === facet.category}
        onclick={() => store.setCategory(facet.category)}
      >
        <CategoryIcon category={facet.category} size={14} />
        {facet.category}
        <span class="count tnum">{facet.count}</span>
      </button>
    {/each}
  </div>

  <div class="line">
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
    <p class="count-label" aria-live="polite">{countLabel}</p>
  </div>
</div>

<style>
  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) 0;
  }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    padding: 3px 10px;
    font-size: 0.75rem;
    color: var(--text-muted);
    cursor: pointer;
    transition: border-color 120ms ease, color 120ms ease;
  }
  .chip:hover { border-color: var(--border-strong); color: var(--text); }

  /* :global because the svg belongs to CategoryIcon's scope, not this one. The
     glyph keeps its category colour even when the chip is selected — that is
     the only thing on the chip that identifies the category at a glance. */
  .chip :global(svg) { color: var(--cat-ink); flex: none; }

  /* Selected state is the brand red on white rather than a filled pill: one
     strong colour on the page at a time, and it is always the thing you chose. */
  .chip[aria-pressed='true'] {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 550;
  }

  .count {
    color: var(--cat-ink);
    background: var(--cat-tint);
    border-radius: 999px;
    padding: 0 5px;
    font-size: 0.6875rem;
  }

  .line { display: flex; align-items: center; gap: var(--space-2); }
  .group { display: flex; align-items: center; gap: var(--space-2); }

  label {
    color: var(--text-dim);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* appearance:none plus an inlined chevron — the native control renders as a
     different widget on every OS, which is the fastest way to make a considered
     layout look unconsidered. */
  select {
    appearance: none;
    background-color: var(--surface);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' fill='none' stroke='%236b6b66' stroke-width='1.2' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right var(--space-2) center;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 3px var(--space-5) 3px var(--space-2);
    font-size: 0.8125rem;
    cursor: pointer;
  }
  select:hover { border-color: var(--border-strong); }

  .count-label {
    margin: 0 0 0 auto;
    color: var(--text-dim);
    font-size: 0.75rem;
  }

  /* Wraps rather than hides: display:none would drop the aria-live region out
     of the accessibility tree and silence the result count on small screens. */
  @media (max-width: 560px) {
    .line { flex-wrap: wrap; }
    .count-label { margin-left: 0; width: 100%; }
  }
</style>
