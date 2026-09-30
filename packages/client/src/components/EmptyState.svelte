<script lang="ts">
  import Icon from './Icon.svelte';

  let { query, hasFilter, onReset }: { query: string; hasFilter: boolean; onReset: () => void } = $props();
</script>

<div class="empty">
  <span class="glyph"><Icon name="search" size={26} /></span>
  <p class="headline">Nothing matched{query !== '' ? ` “${query}”` : ''}</p>
  <p class="hint">
    {hasFilter
      ? 'Try a different word, or widen the search to all categories.'
      : 'Try a shorter word — the catalog holds 36 items.'}
    <button type="button" onclick={onReset}>Reset search</button>
  </p>
</div>

<style>
  /* Sits on the same card as a result would, so an empty search reads as "this
     is the answer" rather than as a page that failed to render. */
  .empty {
    padding: var(--space-6) var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-card);
    text-align: center;
  }
  .glyph { display: inline-flex; color: var(--border-strong); margin-bottom: var(--space-2); }
  .headline { margin: 0; font-size: 0.9375rem; font-weight: 600; }
  .hint { margin: var(--space-1) 0 0; color: var(--text-muted); font-size: 0.8125rem; }
  button {
    border: 0;
    background: none;
    padding: 0;
    margin-left: var(--space-1);
    color: var(--accent);
    font-size: inherit;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>
