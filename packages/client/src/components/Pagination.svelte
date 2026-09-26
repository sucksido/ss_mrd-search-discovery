<script lang="ts">
  import type { Pagination } from '@mrd/shared';

  let { pagination, disabled, onGo }: { pagination: Pagination; disabled: boolean; onGo: (page: number) => void } = $props();
</script>

{#if pagination.totalPages > 1}
  <nav class="pagination" aria-label="Search results pages">
    <button type="button" disabled={!pagination.hasPrev || disabled} onclick={() => onGo(pagination.page - 1)}>
      ← Previous
    </button>
    <span aria-live="polite">Page {pagination.page} of {pagination.totalPages}</span>
    <button type="button" disabled={!pagination.hasNext || disabled} onclick={() => onGo(pagination.page + 1)}>
      Next →
    </button>
  </nav>
{/if}

<style>
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-5) 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  button {
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    cursor: pointer;
  }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
