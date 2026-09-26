<script lang="ts">
  let { query, hasFilter, onReset }: { query: string; hasFilter: boolean; onReset: () => void } = $props();
</script>

<div class="empty">
  <span class="emoji" aria-hidden="true">🍽️</span>
  <h2>Nothing matched{query !== '' ? ` “${query}”` : ''}</h2>
  <p>
    {hasFilter
      ? 'Try a different word, or widen the search to all categories.'
      : 'Try a shorter word — the catalog only has 36 items.'}
  </p>
  <button type="button" onclick={onReset}>Reset search</button>
</div>

<style>
  .empty {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    text-align: center;
    padding: var(--space-6) var(--space-4);
    background: var(--surface);
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
  }
  .emoji { font-size: 2.5rem; }
  h2 { margin: 0; font-size: 1.1rem; }
  p { margin: 0; color: var(--text-muted); font-size: 0.9rem; }
  button {
    margin-top: var(--space-2);
    border: 1px solid var(--border);
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    cursor: pointer;
  }
</style>
