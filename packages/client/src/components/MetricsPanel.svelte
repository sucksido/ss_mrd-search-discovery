<script lang="ts">
  import type { SearchStore } from '../lib/search-store.svelte.js';

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
    {open ? '▾' : '▸'} Instrumentation
  </button>

  {#if open}
    {#if upstream === null}
      <p class="muted">Metrics unavailable.</p>
    {:else}
      <dl>
        <div><dt>Upstream calls</dt><dd>{upstream.calls}</dd></div>
        <div><dt>Failures</dt><dd>{upstream.failures} ({upstream.timeouts} timeouts)</dd></div>
        <div><dt>Retries</dt><dd>{upstream.retries}</dd></div>
        <div><dt>Cache hit rate</dt><dd>{Math.round(upstream.cacheHitRate * 100)}%</dd></div>
        <div><dt>Upstream p50 / p95</dt><dd>{upstream.p50Ms} / {upstream.p95Ms} ms</dd></div>
        <div><dt>Circuit</dt><dd>{upstream.circuitState} (opened {upstream.circuitOpenedCount}×)</dd></div>
      </dl>
      <div class="requests">
        {#each Object.entries(store.metrics?.requests ?? {}) as [route, stat] (route)}
          <p><code>{route}</code> — {stat.count} reqs, p95 {stat.p95Ms} ms, {stat.errors} errors</p>
        {/each}
      </div>
      <button type="button" class="refresh" onclick={() => store.loadMetrics()}>Refresh</button>
    {/if}
  {/if}
</section>

<style>
  .panel { border-top: 1px solid var(--border); margin-top: var(--space-5); padding-top: var(--space-3); }
  .toggle, .refresh {
    border: 0; background: transparent; color: var(--text-muted);
    cursor: pointer; padding: var(--space-1) 0; font-size: 0.85rem;
  }
  .refresh { text-decoration: underline; }
  dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--space-2); margin: var(--space-3) 0; }
  dl div { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); }
  dt { color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
  dd { margin: 2px 0 0; font-size: 0.95rem; }
  .requests p { margin: 2px 0; font-size: 0.78rem; color: var(--text-muted); }
  code { font-size: 0.75rem; }
  .muted { color: var(--text-muted); font-size: 0.85rem; }
</style>
