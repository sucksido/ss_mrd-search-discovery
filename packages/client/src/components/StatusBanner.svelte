<script lang="ts">
  let {
    tone = 'warn',
    title,
    detail,
    actionLabel,
    onAction,
  }: {
    tone?: 'warn' | 'danger';
    title: string;
    detail?: string;
    actionLabel?: string;
    onAction?: () => void;
  } = $props();
</script>

<!-- role=status (polite) rather than alert: a degraded upstream is worth
     announcing, but not worth interrupting whatever the user is doing. -->
<div class="banner {tone}" role="status">
  <span class="dot" aria-hidden="true"></span>
  <div class="text">
    <strong>{title}</strong>
    {#if detail !== undefined}<span>{detail}</span>{/if}
  </div>
  {#if actionLabel !== undefined && onAction !== undefined}
    <button type="button" onclick={onAction}>{actionLabel}</button>
  {/if}
</div>

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius);
    border: 1px solid;
    margin-bottom: var(--space-4);
    font-size: 0.9rem;
  }
  .warn { background: var(--warn-bg); border-color: var(--warn-border); color: var(--warn-text); }
  .danger { background: var(--danger-bg); border-color: var(--danger-border); color: var(--danger-text); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: none; }
  .text { display: flex; flex-direction: column; gap: 2px; }
  button {
    margin-left: auto;
    border: 1px solid currentColor;
    background: transparent;
    color: inherit;
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
    white-space: nowrap;
  }
</style>
