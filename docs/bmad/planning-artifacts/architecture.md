# Architecture — Search & Discovery Mini-App

**Agent:** Architect · **Phase:** BMad Planning 3/6 · **Date:** 2026-09-26

## 1. Shape

```
Browser ── Svelte 5 (runes) ──┐
                              │  /api/*  (Vite dev proxy → :3000, no CORS layer)
                              ▼
                     ┌──────────────────────┐
                     │  Express app (TS)    │
                     │  routes → services   │
                     └──────────┬───────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
  CatalogRepository      SearchService        EnrichmentClient
  (JSON → Map, once)   (pure, sync, no I/O)   (resilience layer)
                                                      │
                                                      ▼
                                            upstreamProvider (simulated:
                                            latency, jitter, failures)
```

**Layering rule:** routes do HTTP (parse, validate, shape); services do domain
work and know nothing about Express; the provider is reachable only through the
EnrichmentClient. This is what makes the search path unit-testable without a
server and the upstream swappable for a real HTTP client later.

## 2. Key decisions & the alternatives rejected

| # | Decision | Why | Rejected alternative |
|---|----------|-----|---------------------|
| D1 | **Search-then-enrich**, enrich only the current page | Bounded fan-out (max 12 upstream lookups/request) and the catalog result never waits on the network | Enrich the whole catalog on boot — stale data, and it hides the very failure mode the brief asks us to handle |
| D2 | **Partial degradation returns 200**, per-item `enrichment.status` | An upstream outage is not a search failure. The customer can still see what exists | 502/503 on upstream error — throws away good catalog data |
| D3 | **In-memory catalog**, loaded once, indexed into a Map | 36 items; a linear scan with scoring is microseconds. No index to invalidate | Building an inverted index — real over-engineering at this size (noted in SOLUTION.md) |
| D4 | **Hand-rolled query validation** instead of Zod | Keeps the server at exactly one runtime dependency and keeps the parse → typed-object boundary explicit and readable | Zod — nicer at scale, a dependency for ~60 lines here |
| D5 | **Vite dev proxy** for `/api` | No CORS middleware, no dependency, same-origin in dev and prod | `cors` package |
| D6 | **Svelte 5 runes + a single reactive store class** | One place owns request lifecycle, abort, and URL sync; components stay dumb | Stores-per-concern — more files, more cross-talk for a screen this small |
| D7 | **Timeout + single retry + circuit breaker + TTL cache** in one client | Each addresses a distinct failure: slow, transient, sustained, repeated | Retry alone — retrying into a dead upstream doubles the latency the customer feels |
| D8 | **npm workspaces monorepo** | Shared types compiled once, one `npm install`, one `npm run dev` | Two repos / duplicated type definitions that drift |

## 3. Data model

```ts
CatalogItem   { id, name, description, category, tags[], vendor,
                basePrice, rating, popularity, imageEmoji }
Enrichment    { status: 'ok'|'unavailable', price?, currency?, available?,
                stockLevel?, deliveryEtaMinutes?, surgeMultiplier?, fetchedAt?,
                reason? }
SearchResult  = CatalogItem & { score, enrichment }
```

`basePrice` is the catalog's idea of the price; `enrichment.price` is the live
one (base × surge). The UI shows the live price and strikes through the base
when they differ — this is the visible payoff of the enrichment layer.

## 4. Resilience design

| Mechanism | Setting | Failure it addresses |
|-----------|---------|----------------------|
| Timeout | 700 ms per upstream call | A slow call holding the request open |
| Retry | 1 attempt, 60 ms + jitter backoff | Transient blip |
| Circuit breaker | opens after 4 consecutive failures, half-open after 8 s | Sustained outage — fail fast instead of paying 2 × 700 ms per request |
| TTL cache | 20 s per item, LRU-capped | Repeat queries and pagination |
| In-flight dedupe | keyed by item id | Two concurrent requests for the same item = one upstream call |
| Per-item isolation | `Promise.allSettled` | One bad item cannot fail its page |

All are configurable by env var so the reviewer can force each failure mode.

## 5. API surface

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/search` | Search + filter + sort + paginate + enrich |
| GET | `/api/suggest` | Cheap typeahead (catalog only, never enriches) |
| GET | `/api/categories` | Filter options with counts |
| GET | `/api/items/:id/enrichment` | Per-item enrichment retry for the UI |
| GET | `/api/metrics` | Counters + latency percentiles (stretch goal) |
| GET | `/api/health` | Liveness + breaker state |

Full request/response examples live in `README.md`.

## 6. Test strategy
- **Unit:** relevance scoring, filter, sort, pagination, query parsing, TTL
  cache eviction, circuit-breaker state machine.
- **Integration (Supertest):** happy path, validation 400s, forced 100%
  upstream failure → 200 + degraded, forced slow upstream → still responds.
- **Determinism:** the provider takes a seed and honours
  `UPSTREAM_FAILURE_RATE=0` / `UPSTREAM_LATENCY_MS=0`, so tests are not flaky.
