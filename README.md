# Search & Discovery Mini-App

A small end-to-end slice of a food-delivery search experience: free-text search
over a local catalog, one filter, six sorts, and **live availability, pricing
and delivery estimates** pulled from a deliberately flaky simulated upstream.

The interesting part is not the search — it is what happens when the upstream
is slow or down. Results still render, degradation is visible per item, and the
page never blanks.

```
packages/
├── shared/   the HTTP contract (types + a couple of constants), used by both sides
├── server/   Express 5-route API in TypeScript (strict), 72 tests
└── client/   Svelte 5 (runes) + Vite, no UI framework or CSS library
```

---

## Quick start

Requires **Node 18+** (developed on Node 22).

```bash
npm install
npm run dev
```

| URL | What |
|-----|------|
| http://localhost:5173 | the app (Vite dev server, proxies `/api` to the API) |
| http://localhost:3000/api/health | the API |

One command starts both processes (`scripts/dev.mjs`, zero dependencies).

### Production-style run

```bash
npm run build
npm start          # http://localhost:3000 — the API also serves the built client
```

### Everything else

```bash
npm test               # 72 tests (Vitest + Supertest)
npm run test:coverage  # ~95% statement coverage on the server
npm run typecheck      # tsc --noEmit (server) + svelte-check (client)
```

---

## Seeing the failure modes

The whole point of the app. Every knob is an env var on the **server**:

```bash
# 1. Upstream completely down — results still render, every card degrades
UPSTREAM_FAILURE_RATE=1 npm run dev

# 2. Upstream slower than the timeout — the page stays responsive
UPSTREAM_BASE_LATENCY_MS=3000 npm run dev

# 3. Painfully flaky — watch the circuit breaker open and recover
UPSTREAM_FAILURE_RATE=0.6 BREAKER_RESET_MS=5000 npm run dev

# 4. Perfectly healthy upstream (useful for demoing the happy path)
UPSTREAM_FAILURE_RATE=0 UPSTREAM_SLOW_RATE=0 npm run dev
```

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3000` | API port |
| `UPSTREAM_BASE_LATENCY_MS` | `90` | Floor latency per upstream call |
| `UPSTREAM_JITTER_MS` | `140` | Random jitter on top |
| `UPSTREAM_SLOW_RATE` | `0.12` | Share of calls that take the slow path |
| `UPSTREAM_SLOW_LATENCY_MS` | `1200` | The slow path |
| `UPSTREAM_FAILURE_RATE` | `0.15` | Share of calls that throw |
| `UPSTREAM_SEED` | `0` | Non-zero = deterministic failures/latency |
| `UPSTREAM_TIMEOUT_MS` | `700` | Per-call timeout |
| `UPSTREAM_RETRIES` | `1` | Extra attempts after the first |
| `ENRICHMENT_CACHE_TTL_MS` | `20000` | Server-side enrichment cache TTL |
| `BREAKER_THRESHOLD` | `4` | Consecutive failures before the circuit opens |
| `BREAKER_RESET_MS` | `8000` | How long it stays open before a probe |
| `ENRICH_SORT_LIMIT` | `48` | Max result-set size enriched in full for a live sort |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` \| `silent` |

The UI's **Instrumentation** panel (bottom of the page) shows upstream call
counts, failures, retries, cache hit rate, latency percentiles and the current
circuit state — a live view of whatever you set above.

---

## API

Base path `/api`. Every response carries an `x-request-id` header, echoed in
`meta.requestId`. Every error uses one envelope.

### `GET /api/search`

The main endpoint: search → filter → sort → paginate → enrich.

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `q` | string | `""` | Free text over name, category, tags, vendor, description. Empty = browse everything |
| `category` | string | – | Must be a known category, or `all`. Case-insensitive |
| `sort` | enum | `relevance` | `relevance` `price_asc` `price_desc` `rating_desc` `popularity_desc` `delivery_asc` |
| `page` | int | `1` | Clamped to the last page rather than returning nothing |
| `pageSize` | int | `12` | 1–48 |

```bash
curl -s 'http://localhost:3000/api/search?q=burger&category=Fast%20Food&sort=price_asc&pageSize=2' | jq
```

```jsonc
{
  "query": { "q": "burger", "category": "Fast Food", "sort": "price_asc", "page": 1, "pageSize": 2 },
  "results": [
    {
      "id": "ff-006",
      "name": "Veg Smash Burger",
      "description": "Charred plant patty, vegan cheese, gherkin and smoky mayo.",
      "category": "Fast Food",
      "tags": ["burger", "vegan", "vegetarian", "plant"],
      "vendor": "Green Grill",
      "basePrice": 11500,          // menu price, integer cents (ZAR)
      "rating": 4.1,
      "popularity": 58,
      "emoji": "🥬",
      "score": 10.06,
      "enrichment": {
        "status": "ok",
        "price": 12995,            // live price = basePrice x surgeMultiplier
        "currency": "ZAR",
        "available": true,
        "stockLevel": "in_stock",  // in_stock | low_stock | sold_out
        "deliveryEtaMinutes": 31,
        "surgeMultiplier": 1.13,
        "fetchedAt": "2026-09-26T08:14:02.163Z",
        "cached": false
      }
    }
  ],
  "pagination": { "page": 1, "pageSize": 2, "totalItems": 3, "totalPages": 2, "hasNext": true, "hasPrev": false },
  "facets": { "categories": [{ "category": "Fast Food", "count": 3 }] },
  "meta": {
    "requestId": "0f0d…",
    "tookMs": 214, "searchMs": 1, "enrichMs": 213,
    "enrichment": {
      "requested": 3, "fulfilled": 3, "failed": 0, "cacheHits": 1,
      "degraded": false,        // at least one item could not be priced
      "sortDegraded": false,    // a live sort fell back to menu prices
      "circuitState": "closed"
    }
  }
}
```

**When the upstream fails, this endpoint still returns `200`.** The failure is
reported per item and summarised in `meta.enrichment`:

```jsonc
{
  "results": [{
    "id": "pp-001", "name": "Margherita Pizza", "basePrice": 13500,
    "enrichment": {
      "status": "unavailable",
      "reason": "circuit_open",   // timeout | upstream_error | circuit_open | not_found
      "message": "Live pricing is temporarily paused"
    }
  }],
  "meta": { "enrichment": { "requested": 6, "fulfilled": 0, "failed": 6, "degraded": true, "circuitState": "open" } }
}
```

### `GET /api/suggest?q=piz`

Typeahead. Catalog only — it never calls the upstream, because suggestions fire
on every pause in typing. Matches item names and tags (not categories), so
"piz" offers three pizzas rather than the whole Pizza & Pasta menu.

```jsonc
{ "q": "piz",
  "suggestions": [{ "id": "pp-001", "name": "Margherita Pizza", "category": "Pizza & Pasta", "emoji": "🍕" }],
  "meta": { "requestId": "…", "tookMs": 0 } }
```

### `GET /api/categories`

```jsonc
{ "categories": [{ "category": "Desserts", "count": 6 }, …], "meta": { "requestId": "…" } }
```

### `GET /api/items/:id/enrichment?refresh=1`

Re-fetch one item's live data — what the card's **Retry** button calls.
`refresh=1` bypasses the server cache so the retry is a real attempt.
`404` for an unknown id.

### `GET /api/metrics`

```jsonc
{ "uptimeSeconds": 412,
  "requests": { "GET /api/search": { "count": 18, "errors": 0, "p50Ms": 96, "p95Ms": 712, "maxMs": 740 } },
  "upstream": { "calls": 96, "failures": 14, "timeouts": 3, "retries": 11,
                "cacheHits": 41, "cacheMisses": 55, "cacheHitRate": 0.43,
                "circuitState": "closed", "circuitOpenedCount": 1, "p50Ms": 158, "p95Ms": 702 } }
```

### `GET /api/health`

```jsonc
{ "status": "ok", "uptimeSeconds": 412, "catalogSize": 36, "circuitState": "closed" }
```

### Errors

```jsonc
// 400
{ "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more query parameters are invalid",
    "requestId": "e180…",
    "details": [
      { "field": "category", "message": "must be one of: Desserts, Drinks, Fast Food, Healthy, Pizza & Pasta, Sushi & Asian" },
      { "field": "sort", "message": "must be one of: relevance, price_asc, price_desc, rating_desc, popularity_desc, delivery_asc" }
    ] } }
```

`VALIDATION_ERROR` (400) · `NOT_FOUND` (404) · `INTERNAL_ERROR` (500).
All validation problems are reported at once, not one at a time.

---

## What the UI does

- **Search** with debounced typeahead (220 ms) and full keyboard support
  (↑/↓/Enter/Escape, ARIA combobox).
- **Filter** by category, **sort** six ways.
- **URL-synced state** — `?q=burger&category=Fast%20Food&sort=price_asc&page=2`
  restores exactly what you were looking at. Copy the link, send it, it works.
- **Loading**: skeleton cards on first load; on a refine, the existing grid dims
  and a progress bar runs — content never disappears under you.
- **Errors**: a dismissable banner with Retry; the last good results stay on
  screen.
- **Per-item degradation**: cards that could not be priced show the menu price,
  say why, and offer a Retry that re-fetches just that item.
- **Dark mode**, responsive from 320 px, `prefers-reduced-motion` respected.

---

## Catalog

`packages/server/src/data/catalog.json` — 36 items across 6 categories
(Fast Food, Pizza & Pasta, Sushi & Asian, Healthy, Desserts, Drinks). Prices
are integer cents in ZAR; only the view layer knows about rands.

---

## Where to read next

- **`SOLUTION.md`** — design decisions, trade-offs, what I deliberately did not build.
