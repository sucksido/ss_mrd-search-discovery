# Epics & Stories — Search & Discovery Mini-App

**Agent:** Scrum Master · **Phase:** BMad Planning 5/6 · **Date:** 2026-09-26

## Epic 1 — Search & Discovery Slice
**Goal:** a customer can find catalog items by free text, refine by category and
sort, and see live availability/price/ETA that degrades gracefully.

| Story | Title | AC summary | Deps |
|-------|-------|-----------|------|
| 1-1 | Catalog dataset & repository | 36 items / 6 categories; loaded once; `getById`, `getAll`, `categories()` | — |
| 1-2 | Simulated upstream provider | Variable latency, seeded RNG, configurable failure rate, batch lookup | 1-1 |
| 1-3 | Resilient enrichment client | Timeout, 1 retry, circuit breaker, TTL cache, in-flight dedupe, `allSettled` isolation | 1-2 |
| 1-4 | Search service | Normalised tokens, weighted scoring, AND semantics, category filter, 6 sorts, pagination, facet counts | 1-1 |
| 1-5 | HTTP API | `/search` `/suggest` `/categories` `/items/:id/enrichment` `/metrics` `/health`; validation 400s; error envelope; request-id | 1-3, 1-4 |
| 1-6 | Svelte client | Search form, filter, sort, grid, skeletons, error/empty states, pagination, dark mode, a11y | 1-5 |
| 1-7 | Stretch goals | Debounced typeahead + abort, URL-synced state, metrics panel, client + server caching | 1-6 |

## Story 1-4 — test plan (representative)
- empty query returns all items ordered by popularity
- `q="burger"` ranks a name match above a description-only match
- multi-token query ANDs: `"veg burger"` excludes items matching only one token
- diacritic/case fold: `"cafe"` matches `"Café Mocha"`
- category filter narrows results; facet counts ignore the active category
- `price_asc` puts un-enriched items last
- pagination clamps `page` to `[1, totalPages]` and never returns a negative offset

## Definition of Done (per story)
Typecheck clean · tests green · no `any` in domain code · loading and error
states implemented for anything user-facing · README updated if the API changed.
