# Product Brief — Search & Discovery Mini-App

**Agent:** Product Owner · **Phase:** BMad Planning 1/6 · **Date:** 2026-09-26

## Problem
A customer opening Mr D wants to find something to eat or buy in seconds. The
catalog is static and cheap to search, but the facts that actually drive the
decision — *is it available, what does it cost right now, how long will it
take* — live in an upstream system that is slow and occasionally down. A naive
implementation couples the two: when the upstream hiccups, search appears
broken, even though the catalog is sitting in memory and perfectly searchable.

## Product hypothesis
Search results should render the moment the catalog matches. Live facts arrive
as an **enrichment layer** over those results and are allowed to fail
independently, per item, without taking the page with them.

## Target user
A hungry customer on a phone, on patchy mobile data, with low patience.

## Success criteria
| # | Outcome | Measure |
|---|---------|---------|
| S1 | Results feel instant | Catalog-only search p95 < 20 ms server-side |
| S2 | Flaky upstream never blocks the page | Results render with upstream at 100% failure |
| S3 | Degradation is visible, not silent | Per-item state shown; retry affordance offered |
| S4 | The customer can narrow down | ≥1 filter and ≥1 sort, URL-shareable |

## Out of scope (deliberate)
Auth, cart, checkout, payments, geolocation, real vendor integrations, a
database, infinite scroll, i18n, and a design system. This is a vertical slice,
not a product.

## Key risk
Over-engineering the resilience layer past what a 36-item catalog justifies.
Mitigation: every resilience mechanism must be demonstrable in the UI or in a
test. If it can't be shown, it doesn't ship.
