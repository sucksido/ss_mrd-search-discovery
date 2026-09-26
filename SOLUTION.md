# SOLUTION — design, trade-offs, and what I left out

The brief is a search box over 36 items. That part is an afternoon. The real
assignment is the sentence *"integrate a simulated upstream provider with
variable latency and occasional failure"* — so that is what I designed around,
and it is what most of these decisions are about.

**The thesis: the catalog is never held hostage by the upstream.** Search is
in-memory and instant; live availability and pricing are an enrichment layer on
top that is allowed to fail per item, visibly, without taking the page down.

---

## 1. Architecture

```
routes (HTTP)  →  services (domain, no Express)  →  EnrichmentClient  →  provider
      ↑                     ↑                              ↑
   parse/validate      pure + testable              all the resilience
```

Express is confined to `routes/` and `middleware/`. `SearchService` never sees a
`Request`, which is why the scoring, filter, sort and pagination tests run in
milliseconds with no server. The provider is reachable *only* through
`EnrichmentClient`, so swapping the simulator for a real HTTP client is a
one-line change at the composition root (`app.ts`) — everything else depends on
the `UpstreamProvider` interface, not the simulator.

`createApp(overrides)` is a factory, not a singleton. That is what lets a test
build an app with a 100 %-failure upstream or a 5-second one and assert on real
behaviour instead of mocking the thing under test.

### The monorepo
`packages/shared` holds the HTTP contract. The client does **not** import server
code — it imports the wire format both sides agree on. One `npm install`, one
`npm run dev`, and a response-shape change breaks the client's typecheck
immediately instead of at runtime.

---

## 2. The decisions worth defending

### 2.1 Search first, enrich second — and only the current page
The alternative is enriching the whole catalog on boot and searching over live
data. That gives you stale prices and, worse, it hides exactly the failure mode
the brief asks you to handle. Enriching after pagination bounds the upstream
fan-out to `pageSize` (12 by default) no matter how big the catalog gets.

### 2.2 A broken upstream returns **200**, not 502
This is the decision I would defend hardest. An upstream outage is not a search
failure: the catalog is right there, and a customer who can still see what
exists is far better served than one looking at an error page. So:

- per item — `enrichment: { status: "unavailable", reason: "timeout" | … }`
- per response — `meta.enrichment: { requested, fulfilled, failed, degraded, circuitState }`

The UI turns that into a banner plus a per-card Retry. The response is
*honest about being partial* rather than pretending or failing.

### 2.3 Four resilience mechanisms, each for a different failure
Ordered **cache → breaker → timeout → retry**, and the order is deliberate:
checking the cache first means a tripped breaker still serves recent data;
checking the breaker before the call means a sustained outage costs ~0 ms
instead of `timeout × (retries + 1)` on *every* request.

| Mechanism | Default | The failure it addresses |
|-----------|---------|--------------------------|
| Timeout | 700 ms | A slow call holding the request open |
| Retry | 1, 60 ms + jitter | A transient blip |
| Circuit breaker | 4 failures / 8 s reset | A sustained outage — stop paying the timeout |
| TTL cache | 20 s, LRU-bounded | Repeat queries, pagination, the same item on two pages |
| In-flight dedupe | by item id | Two concurrent pages asking for the same item = one call |
| `Promise.allSettled` | – | One bad item must not fail its page |

Two details that took thought:

- **A 404 from the upstream does not trip the breaker.** "This item does not
  exist" is an *answer*, not a fault. Counting answers as faults is how a
  breaker ends up opening on healthy traffic.
- **The half-open state allows exactly one probe.** Without that, every request
  in flight when the window expires stampedes the recovering upstream.

### 2.4 Sorting by a value that does not exist yet
`price_asc` and `delivery_asc` sort on data that only arrives *after*
enrichment, which contradicts "enrich only the current page". Three options:

1. Sort by the catalog's `basePrice` and call it live — dishonest.
2. Enrich everything, always — unbounded fan-out.
3. **Enrich the whole result set only while it fits inside a budget**
   (`ENRICH_SORT_LIMIT`, default 48 — larger than this catalog), otherwise sort
   on catalog values and flag `meta.enrichment.sortDegraded`.

I took (3). It is correct at this size, bounded at any size, and the response
tells the client which of the two happened rather than hiding it. At 10 000
items you would stop doing this and denormalise price into the search index,
accepting staleness — which is the real-world answer, and the reason the flag
exists rather than a silent fallback.

One further nuance, found by looking at the running app: items with no live
price normally sort *last* (an unknown price must not sit between two known
ones), but when **nothing** could be enriched, "last" is meaningless and the
order collapses to relevance — which looks broken under a "Price: low to high"
label. So a total enrichment failure falls back to menu-price ordering and sets
`sortDegraded`. The UI then says "sorted on menu prices".

### 2.5 Relevance: weighted fields, AND semantics
Field weights (name 10 / tags 6 / category 5 / vendor 3 / description 1.5),
matched exact → prefix → substring, with a bonus for an exact phrase hit on the
name. **Every token must match something** or the item is dropped — so
"veg burger" means both words, not "anything vegetarian plus anything burger".
Popularity contributes a sub-point nudge purely as a deterministic tie-break.

Text is folded once at boot (lowercase, diacritics stripped, punctuation to
spaces), so "cafe" finds "Café Mocha" without a per-request `normalize()` over
the catalog.

**I did not build an inverted index.** For 36 items a linear scan over
pre-folded strings is microseconds; an index would be pure ceremony. This is the
thing I would change first if the catalog grew — and it is a rewrite of exactly
one file, because scoring is already isolated.

### 2.6 Facets are computed *before* the category filter
So the counts answer "what would I get if I switched category?" rather than
"1 result in the category you already picked". Small thing, disproportionate
effect on whether a filter feels usable.

### 2.7 Hand-written validation instead of Zod
~60 lines in `query.parser.ts`. It keeps the server at exactly one runtime
dependency (Express), and every rule is visible at the boundary where a reviewer
looks for it. It collects **all** problems into one 400 rather than failing on
the first — a client should not have to play whack-a-mole. At the scale where
there are twenty of these, I would reach for Zod and share the schema through
`packages/shared`.

### 2.8 Svelte 5 runes, one store class
The whole screen's state lives in one reactive class: the request lifecycle, the
in-flight `AbortController`, the URL sync and the per-item retry. Splitting that
across four stores would scatter the invariant *"one search in flight, and the
URL always describes what you see"* across four files.

Two client behaviours worth calling out:

- **Every new search aborts the previous one.** A stale response must never
  overwrite a newer one, and the browser's connection budget is not free.
- **Refining dims the grid instead of clearing it.** Blanking the results on
  every keystroke reads as "broken", not as "loading". Skeletons appear only on
  the *first* load, where there is genuinely nothing to preserve.

### 2.9 Vite proxy instead of CORS
`/api` is proxied in dev and served by Express in production, so the app is
same-origin in both. No `cors` dependency, no preflight, no environment-specific
base URL.

---

## 3. Testing

**72 tests, ~95 % statement coverage on the server.** Split deliberately:

- **Unit** (fast, no I/O): scoring and AND semantics, diacritic folding, facet
  counts, all six sorts including the un-enriched-last rule, pagination
  clamping, query validation, TTL cache eviction, the breaker's full state
  machine.
- **Integration** (Supertest): the response envelope, validation 400s, the 404
  envelope, `?page=99` clamping, "only the current page is enriched".
- **Failure-mode tests** — the ones that matter here: a 100 %-failure upstream
  still returns 200 with every item degraded; the breaker opens and later
  requests come back `circuit_open` **without an upstream call**; an upstream
  slower than the timeout still returns in well under 2 s.

Determinism came from the provider taking a seed and honouring
`UPSTREAM_FAILURE_RATE=0` / `UPSTREAM_LATENCY_MS=0`. A test suite that flakes
because the simulator rolled badly is worse than no suite.

The `EnrichmentClient` tests drive a stub `UpstreamProvider` directly, so
"retries once then succeeds" and "does not trip the breaker on a 404" are
asserted, not hoped for.

---

## 4. What I deliberately did not build

| Not built | Why |
|-----------|-----|
| Inverted index / fuzzy matching / stemming | 36 items. A linear scan wins, and typo-tolerance would need real query data to tune |
| A separate upstream service | The brief explicitly allows in-process, and the behaviour — not the transport — is what the client has to survive |
| Batch upstream endpoint | A real provider would batch; per-item calls make per-item failure isolation genuinely per-item, which is what the UI shows. With batching, one failed batch degrades a whole page unless you re-split it |
| Redis / shared cache | In-process is honest for a single-node demo; the cache interface is small enough to swap |
| Client-side result cache | The server cache plus `keyed each` already makes back-navigation instant; a second cache layer means a second invalidation bug |
| Infinite scroll | Pagination is honest about `totalItems` and is URL-addressable; infinite scroll is neither |
| Component tests / Playwright suite | Time budget. The server logic carries the risk; I used a one-off Playwright script for smoke verification (see below) rather than committing a harness |
| Auth, cart, checkout, i18n, a design system | Out of scope for a vertical slice |

---

## 5. Stretch goals (all four, since they were cheap)

- **Typeahead that avoids requests** — 220 ms trailing debounce, a 2-character
  minimum, `AbortController` on every keystroke, a server endpoint that never
  touches the upstream, and a `max-age=30` cache header.
- **URL-synced state** — `replaceState` (not `pushState`: typing is not a
  navigation, and filling the back stack makes Back useless), plus a `popstate`
  listener so Back/Forward still restore state.
- **Instrumentation** — `GET /api/metrics` with request counts, error counts and
  p50/p95 per route, plus upstream calls, failures, timeouts, retries, cache hit
  rate and circuit state. Surfaced in the UI's Instrumentation panel, because a
  metric nobody looks at is a metric nobody fixes.
- **Caching** — server-side TTL cache with in-flight dedupe. `cached: true` is
  exposed per item so you can *see* it working.

---

## 6. Process: BMad

Built through the [BMad Enterprise SDLC](docs/bmad/) methodology — product brief
→ PRD → architecture → UX spec → epics/stories → readiness check → TDD
implementation. The artifacts are in `docs/bmad/planning-artifacts/`.

It is more ceremony than a 4-hour assignment needs, and I would not claim
otherwise. What it bought here was specific: the "not built" table above exists
because the product brief named over-engineering as the project's main risk and
set the rule *"every resilience mechanism must be demonstrable in the UI or in a
test, or it doesn't ship"*. Both the circuit breaker and the cache are visible
in the Instrumentation panel because of that rule.

---

## 7. AI assistance

Used throughout — the assignment invites it, and pretending otherwise would be
silly. `AI_USAGE.md` has the actual prompts, what I accepted, and what I
rejected. Two things are worth flagging here because they shaped the code:

1. **The effect loop.** The first client version called `store.init()` inside a
   Svelte 5 `$effect`. That effect tracked the store reads inside `init()`, so
   the first response re-triggered it, re-applied the URL state and wiped the
   query the user had just typed. Everything typechecked, every test passed, and
   the bug was invisible in the code — I found it by screenshotting the running
   app and noticing the search box was empty while pizza suggestions were open.
   Fix: `onMount`. **Verification caught what review did not.**
2. **The sort-degradation nuance** in §2.4 came from the same pass — looking at
   a real degraded page and noticing the order made no sense under the label.

Everything in this repo I can explain line by line, which is the actual bar.

---

## 8. If I had another four hours

1. Component tests for the store's abort/URL/retry logic (highest remaining risk).
2. A batched upstream endpoint with per-item re-split on failure, to show the
   trade-off in §4 rather than just describe it.
3. `AbortSignal` plumbed from the Express request into the enrichment fan-out,
   so a client that navigates away stops costing upstream calls.
4. Persisted metrics (a 60-second ring buffer per route) and a tiny sparkline —
   p95 over time says more than p95 now.
