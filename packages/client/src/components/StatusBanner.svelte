<script lang="ts">
  import Icon from './Icon.svelte';

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
  <!-- Decoration on top of the wording, not a replacement for it: the title
       already says what happened. -->
  <span class="glyph"><Icon name="alert" size={15} /></span>
  <p class="text">
    <strong>{title}</strong>
    {#if detail !== undefined}<span class="detail">{detail}</span>{/if}
  </p>
  {#if actionLabel !== undefined && onAction !== undefined}
    <button type="button" onclick={onAction}>{actionLabel}</button>
  {/if}
</div>

<style>
  /* A rule and a tint, not a rounded tinted box: this sits inside the reading
     column, so it should read as an annotation on the results rather than as a
     separate floating component. */
  .banner {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-left: 2px solid;
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    margin: var(--space-3) 0;
    font-size: 0.8125rem;
  }
  .warn { background: var(--warn-bg); border-color: var(--warn); color: var(--warn); }
  .danger { background: var(--danger-bg); border-color: var(--danger); color: var(--danger); }

  /* Nudged down a pixel: the flex baseline aligns the svg box, not the glyph. */
  .glyph { display: flex; flex: none; position: relative; top: 2px; }
  .text { margin: 0; }
  strong { font-weight: 600; }
  .detail { color: var(--text-muted); margin-left: var(--space-2); }

  button {
    margin-left: auto;
    border: 0;
    background: none;
    color: inherit;
    padding: 0;
    font-size: inherit;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    white-space: nowrap;
  }
</style>
