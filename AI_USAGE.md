# AI_USAGE — how I used AI on this assignment

The brief asks for the prompts and the thinking behind them. This is that,
honestly: what I asked, what I kept, what I threw away, and where I had to
override the model.

**Tool:** Claude (Opus 5) in an agentic coding session, with my team's BMad
Enterprise SDLC skill pack loaded (`bmad-orchestrator` → `bmad-plan` →
`bmad-develop` → `bmad-quality`). BMad is the methodology I run software
projects on at work, so using it here is how I actually work, not a costume.

**My approach in one line:** use AI to go fast on the things where speed is
free — scaffolding, boilerplate, test permutations, docs — and spend my own
judgement on the two or three decisions the reviewer will actually ask about.

---

## 1. The prompts

### 1.1 Framing — before any code

> Read the attached assignment PDF. Build the project using the BMad
> methodology. Before you write anything, tell me what the *actual* hard part of
> this brief is, as opposed to the part that's just typing.

I always open with this. The answer I wanted — and got — was that free-text
search over 36 items is trivial, and the assignment's real content is the
simulated flaky upstream: what happens to the page when the dependency is slow
or dead. Everything downstream hangs off that framing. If the model had come
back with "the hard part is the search algorithm", I would have corrected it
before a single file existed.

### 1.2 Planning (BMad phase 1)

> Run the BMad planning pipeline: product brief, PRD, architecture, UX spec,
> epics and a readiness check. In the architecture doc, for every decision also
> record the alternative you rejected and why. Name the biggest risk to this
> project in the product brief.

Two deliberate constraints in that prompt:

- **"record the alternative you rejected"** — a decision without a rejected
  alternative is not a decision, it is a default. The table in
  `docs/bmad/planning-artifacts/architecture.md` is the direct output, and it is
  also my prep for the technical interview.
- **"name the biggest risk"** — the model named over-engineering, which produced
  the rule *"every resilience mechanism must be demonstrable in the UI or in a
  test, or it doesn't ship."* That rule is why the circuit breaker and cache are
  surfaced in the Instrumentation panel instead of being invisible cleverness,
  and it is why `SOLUTION.md` has a "what I deliberately did not build" table.

### 1.3 The upstream and the resilience layer

> Build the simulated provider and the enrichment client. Requirements:
> per-item failure isolation, a timeout, one retry, a circuit breaker and a TTL
> cache. Justify the *order* those are applied in, in a comment. Make every knob
> an env var so a reviewer can force each failure mode from the CLI.

The ordering question was the point. The first pass put the timeout before the
cache check, which means a tripped breaker stops serving cached data — wrong.
Asking for the justification in a comment is what surfaced it; I have found that
"explain why, in the code" catches more design errors than "is this correct?",
because the model has to make the reasoning concrete instead of agreeing with me.

### 1.4 The decision I had to make myself

> `price_asc` sorts on a value that only exists after enrichment, but we only
> enrich the current page. Give me three ways to resolve that with the
> trade-offs, and don't pick one.

"Don't pick one" matters. Left to itself the model picks the tidiest option and
writes a confident comment justifying it; you end up owning a decision you never
made — which is exactly what falls apart in a technical interview.

The three options and the one I chose (budgeted full enrichment plus an explicit
`sortDegraded` flag) are written up in `SOLUTION.md` §2.4. I picked it because it
is the only one that stays honest at both 36 items and 10 000.

### 1.5 Tests

> Write the server tests. Cover the failure modes first: 100% upstream failure
> must still return 200 with every item degraded; the breaker must open and then
> fail fast *without* an upstream call; an upstream slower than the timeout must
> still return quickly. Tests must be deterministic — no reliance on the
> simulator's RNG.

"Failure modes first" is the whole instruction. Asked for tests generically, you
get twenty assertions on the happy path and none on the thing that actually
breaks in production. The determinism clause forced the seeded RNG and the
`UPSTREAM_FAILURE_RATE=0` test environment, which is why the suite does not
flake.

### 1.6 Verification — the prompt that paid for itself

> Build it, run it, drive the real UI in a headless browser, and show me
> screenshots. Don't tell me it works.

See §2 — this found a bug that nothing else would have.

---

## 2. What AI got wrong, and how I caught it

### 2.1 The Svelte 5 effect loop (the real one)

The client called `store.init()` inside a `$effect`. In Svelte 5, an effect
tracks every reactive read inside it — and `init()` reads the store's own state
— so the first search response re-triggered the effect, which re-applied the URL
state and **wiped the query the user had just typed**.

It typechecked. All 72 tests passed. The code looked completely reasonable.

I found it because I insisted on screenshots of the running app: the typeahead
was showing three pizzas while the search box sat empty on its placeholder. Fix
was one line (`onMount` instead of `$effect`) plus a comment explaining why, so
nobody re-introduces it.

**The lesson I would give in the interview:** AI-written code fails in ways that
review and unit tests do not catch, because it is locally plausible everywhere.
The counter is to verify behaviour, not code — run it, click it, look at it.

### 2.2 Typeahead suggesting the wrong things

Live output check: typing `piz` suggested *Spaghetti Carbonara* and *Beef
Lasagne*, because "piz" prefix-matches the **category** "Pizza & Pasta" and the
suggest endpoint reused the full search scorer. Technically correct, obviously
wrong as a product.

Fix: suggestions match name and tags only. A suggestion is a shortcut to an
item; a search is a query. Same scorer, different field set — now a test.

### 2.3 Sorting that contradicted its own label

Same screenshot pass: a fully-degraded page under "Price: low to high" was
ordered by relevance (no live prices → everything ties → fall through). Correct
by the spec I had written, useless to a customer. Added the "if *nothing* was
enriched, sort by menu price and say so" rule (`SOLUTION.md` §2.4).

### 2.4 Things I rejected outright

| Suggested | Why I said no |
|-----------|---------------|
| Zod for query validation | One more runtime dependency for ~60 lines. Hand-rolled, and it collects all errors at once, which Zod would too — but not for free |
| An inverted search index | 36 items. Pure ceremony, and it would have been the flashiest wrong answer in the repo |
| `concurrently` for the dev script | A 60-line zero-dependency `scripts/dev.mjs` does it and works on Windows |
| A README "Architecture" section with an ASCII diagram of every file | Nobody reads it, it goes stale in a week. The diagram that survived is the one that shows the *layering rule* |
| Splitting client state into four stores | The invariant is "one search in flight, URL always matches the view". That belongs in one place |

---

## 3. Where I let AI run unsupervised

Deliberately, because the cost of being wrong is near zero and the feedback loop
is instant:

- the 36-item catalog dataset (names, descriptions, tags, prices)
- CSS tokens, dark-mode variables, the skeleton shimmer
- repetitive test permutations once the *shape* of the tests was set
- README endpoint tables and example payloads (verified against real `curl`
  output — every sample in the README came from the running server)

And where I did not: the enrichment ordering, the sort trade-off, the 200-vs-502
decision, the facet-before-filter rule, and every "not built" line. Those are the
questions a technical interview is made of, and an answer I did not reason
through myself is worthless there.

---

## 4. Honest summary

AI wrote most of the characters in this repo. It did not make the decisions that
matter, and it got three things wrong that I only found by running the app and
looking at it. The value was not "it wrote the code" — it was that the
boilerplate cost nearly nothing, which left the time to spend on the upstream
failure design, and on verification.

Every file here is one I can walk through line by line and defend, including the
parts I would change.
