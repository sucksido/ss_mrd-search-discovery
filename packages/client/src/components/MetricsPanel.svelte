<script lang="ts">
  import type { SearchStore } from '../lib/search-store.svelte.js';
  import Icon from './Icon.svelte';

  let { store }: { store: SearchStore } = $props();
  let open = $state(false);

  async function toggle(): Promise<void> {
    open = !open;
    if (open) await store.loadMetrics();
  }

  const upstream = $derived(store.metrics?.upstream ?? null);
</script>

<!-- The instrumentation stretch goal, surfaced rather than buried in a log:
     it is also the fastest way to *show* that caching and the breaker work. -->
<section class="panel">
  <button type="button" class="toggle" aria-expanded={open} onclick={toggle}>
    <span class="caret" class:open><Icon name="chevron-down" size={11} /></span>
    Instrumentation
  </button>

  {#if open}
    {#if upstream === null}
      <p class="muted">Metrics unavailable.</p>
    {:else}
      <dl class="tnum">
        <div><dt>upstream calls</dt><dd>{upstream.calls}</dd></div>
        <div><dt>failures</dt><dd>{upstream.failures} <span class="sub">({upstream.timeouts} timeout)</span></dd></div>
        <div><dt>retries</dt><dd>{upstream.retries}</dd></div>
        <div><dt>cache hit rate</dt><dd>{Math.round(upstream.cacheHitRate * 100)}%</dd></div>
        <div><dt>upstream p50 / p95</dt><dd>{upstream.p50Ms} / {upstream.p95Ms} ms</dd></div>
        <div><dt>circuit</dt><dd>{upstream.circuitState} <span class="sub">(opened {upstream.circuitOpenedCount}×)</span></dd></div>
      </dl>
      <table class="requests tnum">
        <tbody>
          {#each Object.entries(store.metrics?.requests ?? {}) as [route, stat] (route)}
            <tr>
              <td class="route">{route}</td>
              <td>{stat.count} req</td>
              <td>p95 {stat.p95Ms} ms</td>
              <td>{stat.errors} err</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <button type="button" class="refresh" onclick={() => store.loadMetrics()}>refresh</button>
    {/if}
  {/if}
</section>

<style>
  .panel {
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
    font-family: var(--font-mono);
  }
  .toggle, .refresh {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 0; background: none; color: var(--text-muted);
    cursor: pointer; padding: 0;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
  }
  .toggle:hover, .refresh:hover { color: var(--text); }
  /* One chevron that rotates, rather than swapping + for −: the rotation shows
     which direction the panel is about to move. */
  .caret {
    display: inline-flex;
    color: var(--text-dim);
    transition: transform 140ms ease;
  }
  .caret.open { transform: rotate(180deg); }
  .refresh { margin-top: var(--space-3); text-decoration: underline; text-underline-offset: 2px; }

  dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1px;
    margin: var(--space-3) 0;
    background: var(--border);
    border: 1px solid var(--border);
  }
  /* Cells are the card surface, not the canvas — otherwise the 1px grid gap and
     the page background are the same colour and the table loses its rules. */
  dl div { background: var(--surface); padding: var(--space-2); }
  dt { color: var(--text-dim); font-size: 0.625rem; letter-spacing: 0.04em; }
  dd { margin: 2px 0 0; font-size: 0.75rem; }
  .sub { color: var(--text-dim); }

  .requests { width: 100%; border-collapse: collapse; font-size: 0.6875rem; color: var(--text-muted); }
  .requests td { padding: 2px var(--space-3) 2px 0; white-space: nowrap; }
  .route { color: var(--text); }

  .muted { color: var(--text-dim); font-size: 0.6875rem; margin: var(--space-2) 0 0; }
</style>
