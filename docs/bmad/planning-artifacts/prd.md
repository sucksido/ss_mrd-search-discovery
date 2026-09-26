# PRD — Search & Discovery Mini-App

**Agent:** Business Analyst · **Phase:** BMad Planning 2/6 · **Date:** 2026-09-26

## 1. Users & journeys

**J1 — Browse then narrow.** Customer lands, sees the full catalog sorted by
popularity, picks a category, switches sort to price, scans the cards.

**J2 — Know what you want.** Customer types "burger", sees suggestions after a
pause in typing, presses Enter, gets ranked matches with live price and ETA.

**J3 — Upstream is having a bad day.** Customer searches; catalog results
appear immediately; some cards show "Live info unavailable" with a Retry
control; a banner explains that live pricing is degraded. The page never blanks
and never shows a dead spinner.

**J4 — Share a search.** Customer copies the URL and sends it; the recipient
opens the exact same query, filter, sort and page.

## 2. Functional requirements

### Search
- **FR-1** Free-text search across item **name**, **category**, **tags** and **description**.
- **FR-2** Multi-token queries are ANDed: every token must match some field.
- **FR-3** Relevance ranking with field weights; exact > prefix > substring.
- **FR-4** Empty query returns the full catalog (browse mode), not an error.
- **FR-5** Diacritics and case are normalised ("cafe" matches "Café").

### Refine
- **FR-6** Filter by category (single select, derived from the dataset).
- **FR-7** Sort by relevance, price asc, price desc, rating, popularity, delivery time.
- **FR-8** Price and delivery sorts operate on **enriched** values, with
  un-enriched items sorted last (never silently dropped).
- **FR-9** Facet counts reflect the current text query, not the current filter,
  so the customer can see what switching category would yield.

### Enrichment
- **FR-10** Only the items on the current page are enriched (bounded fan-out).
- **FR-11** Per-item enrichment status: `ok` | `unavailable`.
- **FR-12** A partial or total enrichment failure returns **HTTP 200** with
  degraded metadata — it is not a search failure.
- **FR-13** Response metadata reports requested / fulfilled / failed / cache-hit
  counts and a `degraded` flag.

### Errors & validation
- **FR-14** Invalid query params return `400` with `{ error: { code, message, details } }`.
- **FR-15** Unknown routes return `404` in the same envelope.
- **FR-16** Every response carries an `x-request-id`, echoed in the body meta.

### Client
- **FR-17** Loading state uses skeleton cards, not a blocking spinner.
- **FR-18** In-flight requests are aborted when the query changes.
- **FR-19** Query, category, sort and page are synced to the URL.
- **FR-20** Typeahead suggestions are debounced and served by a cheap,
  non-enriching endpoint.

## 3. Non-functional requirements
- **NFR-1** TypeScript `strict: true` on both packages; zero `any` in domain code.
- **NFR-2** Catalog search is synchronous and in-memory; no I/O per request.
- **NFR-3** Client JS budget 120 KB gzipped.
- **NFR-4** WCAG 2.1 AA: combobox semantics for typeahead, `aria-live` for
  result-count and error announcements, visible focus, full keyboard operation.
- **NFR-5** Zero runtime dependencies beyond Express on the server.

## 4. Acceptance criteria (epic-level)
- AC-1 `GET /api/search?q=burger&category=Food&sort=price_asc` returns ranked,
  filtered, sorted, enriched results in the documented envelope.
- AC-2 With `UPSTREAM_FAILURE_RATE=1`, the same call returns 200, every item
  `enrichment.status === "unavailable"`, `meta.enrichment.degraded === true`.
- AC-3 The UI renders results, filter and sort controls, and recovers from a
  forced upstream outage without a reload.
- AC-4 `npm test` passes; `npm run typecheck` and `npm run build` are clean.
