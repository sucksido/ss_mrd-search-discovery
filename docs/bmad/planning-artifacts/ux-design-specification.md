# UX Specification — Search & Discovery Mini-App

**Agent:** UX Designer · **Phase:** BMad Planning 4/6 · **Date:** 2026-09-26

## Principles
1. **The catalog is never held hostage.** Item identity renders first; live
   facts fill in.
2. **Degradation is stated, not implied.** An absent price is labelled, with a
   way to act on it.
3. **Nothing jumps.** Skeletons occupy the same box as the card they become.

## Layout
Single column on mobile, auto-fill grid from 560 px (`minmax(260px, 1fr)`).
Sticky control bar so the customer can re-sort without scrolling back up.

## Component tree
```
App
├── SearchBar          text input + clear + submit; owns combobox semantics
│   └── Suggestions    debounced, keyboard-navigable listbox
├── ControlBar         category <select> · sort <select> · result count (aria-live)
├── StatusBanner       degraded / error / offline; dismissible, non-blocking
├── ResultsGrid
│   ├── SkeletonCard × n   (first load / query change)
│   ├── ResultCard         name, vendor, category, rating, price, ETA, stock
│   │                      └── enrichment `unavailable` → inline Retry button
│   └── EmptyState         "no matches" + the query, with a reset action
├── Pagination         prev / next, page N of M
└── MetricsPanel       collapsible; /api/metrics (stretch goal)
```

## States (every one is implemented)
| State | Treatment |
|-------|-----------|
| Idle / browse | Full catalog, popularity sort |
| Loading (first) | 6 skeleton cards |
| Loading (refine) | Existing results dimmed to 0.55 + progress bar — content stays on screen |
| Success | Cards with live price, ETA, stock pill |
| Partial degradation | Amber banner + per-card "Live info unavailable · Retry" |
| Total upstream outage | Same, plus banner naming the breaker state |
| Empty | Illustrated empty state + "clear filters" |
| Network/server error | Red banner + Retry; last good results retained |

## Design tokens
CSS custom properties on `:root`, redefined under
`@media (prefers-color-scheme: dark)`. Colour, spacing (4 px scale), radius,
shadow, and a single font stack. No CSS framework.

## Accessibility (WCAG 2.1 AA)
- Search input: `role="combobox"`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant`; ↑/↓/Enter/Escape on the suggestion list.
- Result count and enrichment-degraded messages in `aria-live="polite"`.
- Skeletons `aria-hidden`; the loading state is announced as text, not implied by motion.
- Focus visible on every interactive element; no colour-only status (stock pills
  carry text).
- `prefers-reduced-motion` disables the shimmer.
