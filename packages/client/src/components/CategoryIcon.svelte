<script lang="ts">
  import type { Category } from '@mrd/shared';

  let { category, size = 20 }: { category: Category; size?: number } = $props();

  /**
   * Six hand-drawn glyphs on one 24×24 grid, keyed by the contract's Category
   * union — so adding a seventh category is a type error here rather than a
   * silently missing icon in production.
   *
   * Inline SVG rather than an icon font or an emoji: it inherits currentColor,
   * costs no extra request, cannot 404, and renders identically on every OS.
   * Emoji do none of those things.
   */
  const PATHS: Record<Category, string> = {
    // Bun, patty, base.
    'Fast Food':
      'M3.5 10.5c0-3.2 3.8-5.5 8.5-5.5s8.5 2.3 8.5 5.5Z M3.5 13.5h17 M4.5 16.5h15a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3Z',
    // A slice, crust down.
    'Pizza & Pasta':
      'M12 3.5 20.5 19.5a20 20 0 0 1-17 0Z M10 11.5h.01 M13.5 15h.01',
    // Bowl and a pair of chopsticks.
    'Sushi & Asian':
      'M3 12.5h18a9 9 0 0 1-18 0Z M14 3.5 19.5 9 M16.5 3.5 21 8',
    // A leaf on its stem.
    Healthy:
      'M20.5 3.5C10.5 3.5 4 8.5 4 14.5a5 5 0 0 0 5.5 5c6.5 0 11-6.5 11-16Z M4.5 20 14 10.5',
    // Scoop and cone.
    Desserts:
      'M7.5 10a4.5 4.5 0 0 1 9 0Z M6.5 11.5h11L12 21Z',
    // Cup, tapered, with a straw.
    Drinks:
      'M5.5 5.5h13l-1.6 13.2a2 2 0 0 1-2 1.8h-5.8a2 2 0 0 1-2-1.8Z M6.6 10.5h10.8 M14.5 2.5 13 5.5',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  <path d={PATHS[category]} />
</svg>
