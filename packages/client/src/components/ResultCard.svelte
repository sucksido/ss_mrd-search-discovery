<script lang="ts">
  import type { SearchResultItem } from '@mrd/shared';
  import { formatEta, formatPrice, initials, STOCK_LABELS, UNAVAILABLE_LABELS } from '../lib/format.js';
  import CategoryIcon from './CategoryIcon.svelte';
  import Icon from './Icon.svelte';

  let {
    item,
    retrying = false,
    onRetry,
  }: { item: SearchResultItem; retrying?: boolean; onRetry: (id: string) => void } = $props();

  const live = $derived(item.enrichment.status === 'ok' ? item.enrichment : null);
  const unavailable = $derived(item.enrichment.status === 'unavailable' ? item.enrichment : null);

  // Only call it a surge when it is material — 1.02x is noise, not news.
  const deltaPercent = $derived(
    live === null ? 0 : Math.round(((live.price - item.basePrice) / item.basePrice) * 100),
  );
  const hasDelta = $derived(live !== null && Math.abs(deltaPercent) >= 2);
</script>

<!-- data-category drives the tile's tint through custom properties declared in
     app.css, so the component never names a colour. -->
<article class="card" class:sold-out={live?.available === false} data-category={item.category}>
  <div class="head">
    <!-- The glyph is the anchor; the merchant's initials sit under it so the
         tile still identifies who is cooking, not just what kind of food. -->
    <div class="tile" aria-hidden="true">
      <CategoryIcon category={item.category} size={19} />
      <span class="monogram">{initials(item.vendor)}</span>
    </div>

    <div class="title">
      <h3>{item.name}</h3>
      <p class="meta">
        <span class="rating tnum" title="{item.rating} out of 5">{item.rating.toFixed(1)}</span>
        <span class="vendor">{item.vendor}</span>
        <span class="tag">{item.category}</span>
      </p>
    </div>

    <div class="money">
      {#if live !== null}
        <p class="price tnum">{formatPrice(live.price)}</p>
        {#if hasDelta}
          <!-- Never a strikethrough: struck-out text reads as "was more, now
               less", which is the opposite of what a surge multiplier means.
               The direction is stated in words and in the sign instead. -->
          <p class="delta tnum" class:up={deltaPercent > 0} class:down={deltaPercent < 0}>
            {deltaPercent > 0 ? `+${deltaPercent}% surge` : `${deltaPercent}% off`}
          </p>
        {/if}
      {:else}
        <p class="price stale tnum">{formatPrice(item.basePrice)}</p>
        <p class="delta">menu price</p>
      {/if}
    </div>
  </div>

  <p class="description">{item.description}</p>

  <!-- margin-top:auto on this line is what keeps the footers of two cards in the
       same row on one baseline when their descriptions wrap differently. -->
  <div class="foot">
    {#if live !== null}
      <!-- Status carries a text label, never colour alone (WCAG 1.4.1). -->
      <p class="status stock-{live.stockLevel}">
        <span class="dot" aria-hidden="true"></span>
        {STOCK_LABELS[live.stockLevel]}
        <span class="sep" aria-hidden="true">·</span>
        <span class="eta tnum">{formatEta(live.deliveryEtaMinutes)}</span>
        {#if live.cached}
          <span class="sep" aria-hidden="true">·</span>
          <span class="cached" title="Served from the server-side enrichment cache">cached</span>
        {/if}
      </p>
      {#if hasDelta}
        <p class="anchor tnum">menu {formatPrice(item.basePrice)}</p>
      {/if}
    {:else}
      <!-- Degradation is stated and actionable, never a silent blank. -->
      <p class="status degraded">
        <span class="dot" aria-hidden="true"></span>
        {unavailable === null ? '' : UNAVAILABLE_LABELS[unavailable.reason]}
      </p>
      <button type="button" class="retry" disabled={retrying} onclick={() => onRetry(item.id)}>
        <Icon name="rotate" size={12} />
        {retrying ? 'retrying…' : 'retry'}
      </button>
    {/if}
  </div>
</article>

<style>
  .card {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-card);
    transition: box-shadow 120ms ease, border-color 120ms ease;
  }
  /* Lift, don't move: a card that translates on hover drags its neighbours
     through the user's peripheral vision. */
  .card:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-card-hover);
  }
  .card.sold-out .head, .card.sold-out .description { opacity: 0.55; }

  /* The one grid declaration in the card. The price column is auto-width so a
     four-digit rand value can never crush the item name. */
  .head {
    display: grid;
    grid-template-columns: var(--row-grid);
    gap: var(--space-3);
    align-items: start;
  }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    width: 40px;
    padding: 5px 0 4px;
    border-radius: var(--radius-sm);
    background: var(--cat-tint);
    color: var(--cat-ink);
  }
  .monogram {
    font-size: 0.5625rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    line-height: 1;
  }

  .title { min-width: 0; }
  h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: -0.005em;
    /* Wraps to two lines rather than truncating. In a food catalog the dish
       name is the thing being chosen, so hiding half of it to protect the
       card's height is the wrong trade; the footer stays aligned anyway
       because it is pushed down by margin-top:auto, not by a fixed height. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 3px 0 0;
    font-size: 0.75rem;
    min-width: 0;
  }
  .rating { color: var(--text-muted); flex: none; }
  .rating::before { content: '★ '; color: var(--star); }
  .vendor {
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    flex: none;
    background: var(--cat-tint);
    color: var(--cat-ink);
    border-radius: 2px;
    padding: 1px 6px;
    font-size: 0.6875rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .money { text-align: right; }
  .price { margin: 0; font-size: 1.0625rem; font-weight: 650; letter-spacing: -0.015em; white-space: nowrap; }
  .price.stale { font-weight: 500; color: var(--text-muted); }
  .delta { margin: 2px 0 0; font-size: 0.6875rem; color: var(--text-dim); white-space: nowrap; }
  .delta.up { color: var(--warn); }
  .delta.down { color: var(--ok); }

  .description {
    margin: var(--space-3) 0 var(--space-3);
    color: var(--text-dim);
    font-size: 0.8125rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .foot {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-top: auto;
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
    font-size: 0.75rem;
  }
  .status { margin: 0; color: var(--text-muted); }
  .anchor { margin: 0 0 0 auto; color: var(--text-dim); font-size: 0.6875rem; }
  .sep { color: var(--border-strong); margin: 0 2px; }
  /* The dot is decoration on top of the word — colour is never the only
     carrier of the status (WCAG 1.4.1). */
  .dot {
    display: inline-block;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: currentColor;
    margin-right: 2px;
    vertical-align: 1px;
  }
  .stock-in_stock { color: var(--ok); }
  .stock-low_stock { color: var(--warn); }
  .stock-sold_out { color: var(--danger); }
  .eta, .cached { color: var(--text-dim); }
  .degraded { color: var(--warn); }

  /* A text button, not a boxed one: the retry is a quiet affordance next to the
     reason, not a call to action competing with the price. */
  .retry {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: auto;
    border: 0;
    background: none;
    padding: 0;
    color: var(--accent);
    font-size: inherit;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .retry:disabled { color: var(--text-dim); cursor: progress; text-decoration: none; }
</style>
