<script lang="ts">
  import type { SearchResultItem } from '@mrd/shared';
  import { formatEta, formatPrice, STOCK_LABELS, UNAVAILABLE_LABELS } from '../lib/format.js';

  let {
    item,
    retrying = false,
    onRetry,
  }: { item: SearchResultItem; retrying?: boolean; onRetry: (id: string) => void } = $props();

  const live = $derived(item.enrichment.status === 'ok' ? item.enrichment : null);
  const unavailable = $derived(item.enrichment.status === 'unavailable' ? item.enrichment : null);
  // Only call it a surge when it is material — 1.02x is noise, not news.
  const hasSurge = $derived(live !== null && Math.abs(live.price - item.basePrice) / item.basePrice > 0.02);
</script>

<article class="card" class:sold-out={live?.available === false}>
  <header>
    <span class="emoji" aria-hidden="true">{item.emoji}</span>
    <div>
      <h3>{item.name}</h3>
      <p class="meta">{item.vendor} · {item.category}</p>
    </div>
    <span class="rating" title="{item.rating} out of 5">★ {item.rating.toFixed(1)}</span>
  </header>

  <p class="description">{item.description}</p>

  <footer>
    {#if live !== null}
      <div class="price">
        <strong>{formatPrice(live.price)}</strong>
        {#if hasSurge}
          <span class="was">{formatPrice(item.basePrice)}</span>
        {/if}
      </div>
      <div class="pills">
        <span class="pill stock-{live.stockLevel}">{STOCK_LABELS[live.stockLevel]}</span>
        <span class="pill eta">🛵 {formatEta(live.deliveryEtaMinutes)}</span>
        {#if live.cached}
          <span class="pill cached" title="Served from the server-side enrichment cache">cached</span>
        {/if}
      </div>
    {:else}
      <!-- Degradation is stated and actionable, never a silent blank. -->
      <div class="degraded">
        <div>
          <strong>{formatPrice(item.basePrice)}</strong>
          <span class="was-label">menu price</span>
        </div>
        <p class="reason">{unavailable === null ? '' : UNAVAILABLE_LABELS[unavailable.reason]}</p>
      </div>
      <button type="button" class="retry" disabled={retrying} onclick={() => onRetry(item.id)}>
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    {/if}
  </footer>
</article>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow);
  }
  .card.sold-out { opacity: 0.72; }

  header { display: flex; align-items: flex-start; gap: var(--space-3); }
  .emoji { font-size: 1.75rem; line-height: 1; }
  h3 { margin: 0; font-size: 1rem; }
  .meta { margin: 2px 0 0; color: var(--text-muted); font-size: 0.8rem; }
  .rating { margin-left: auto; color: var(--text-muted); font-size: 0.85rem; white-space: nowrap; }

  .description {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  footer {
    margin-top: auto;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .price strong { font-size: 1.15rem; }
  .was { margin-left: var(--space-2); color: var(--text-muted); text-decoration: line-through; font-size: 0.85rem; }
  .was-label { margin-left: var(--space-2); color: var(--text-muted); font-size: 0.75rem; }

  .pills { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .pill {
    font-size: 0.72rem;
    padding: 2px var(--space-2);
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text-muted);
    white-space: nowrap;
  }
  /* Status carries a text label, never colour alone (WCAG 1.4.1). */
  .stock-in_stock { color: var(--ok); border-color: currentColor; }
  .stock-low_stock { color: var(--warn-text); background: var(--warn-bg); border-color: var(--warn-border); }
  .stock-sold_out { color: var(--danger-text); background: var(--danger-bg); border-color: var(--danger-border); }

  .degraded { display: flex; flex-direction: column; gap: 2px; }
  .reason { margin: 0; font-size: 0.78rem; color: var(--warn-text); }
  .retry {
    border: 1px solid var(--border);
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
    font-size: 0.85rem;
  }
  .retry:disabled { opacity: 0.6; cursor: progress; }
</style>
