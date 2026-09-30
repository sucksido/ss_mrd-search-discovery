<script lang="ts">
  type IconName = 'alert' | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'search' | 'rotate';

  let { name, size = 14 }: { name: IconName; size?: number } = $props();

  /**
   * The interface glyphs, on the same 24×24 grid and the same stroke rules as
   * CategoryIcon, so the two sets sit together without looking borrowed from
   * different libraries. Every one is decorative: the component is aria-hidden
   * and each caller states its meaning in text.
   */
  const PATHS: Record<IconName, string> = {
    alert: 'M12 4.5 21 20H3Z M12 10v4 M12 17h.01',
    'chevron-left': 'M14.5 5 8 12l6.5 7',
    'chevron-right': 'M9.5 5 16 12l-6.5 7',
    'chevron-down': 'M5 9.5 12 16l7-6.5',
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z M15.5 15.5 20.5 20.5',
    rotate: 'M20 12a8 8 0 1 1-2.3-5.6 M20 4v4h-4',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  <path d={PATHS[name]} />
</svg>
