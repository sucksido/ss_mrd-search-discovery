<script lang="ts">
  import type { Pagination } from '@mrd/shared';
  import Icon from './Icon.svelte';

  let { pagination, disabled, onGo }: { pagination: Pagination; disabled: boolean; onGo: (page: number) => void } = $props();
</script>

{#if pagination.totalPages > 1}
  <nav class="pagination" aria-label="Search results pages">
    <button type="button" disabled={!pagination.hasPrev || disabled} onclick={() => onGo(pagination.page - 1)}>
      <Icon name="chevron-left" size={13} />
      Previous
    </button>
    <span class="position tnum" aria-live="polite">{pagination.page} / {pagination.totalPages}</span>
    <button type="button" disabled={!pagination.hasNext || disabled} onclick={() => onGo(pagination.page + 1)}>
      Next
      <Icon name="chevron-right" size={13} />
    </button>
  </nav>
{/if}

<style>
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-5) 0 var(--space-2);
    font-size: 0.8125rem;
  }
  .position { color: var(--text-dim); font-size: 0.75rem; }
  button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: var(--radius-sm);
    padding: 4px var(--space-3);
    font-size: 0.8125rem;
    cursor: pointer;
    box-shadow: var(--shadow-card);
  }
  button:hover:not(:disabled) { border-color: var(--border-strong); }
  button:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
</style>
