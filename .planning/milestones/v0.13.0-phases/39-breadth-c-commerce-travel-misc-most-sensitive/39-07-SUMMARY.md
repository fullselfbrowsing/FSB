---
phase: 39-breadth-c-commerce-travel-misc-most-sensitive
plan: 07
subsystem: testing
tags: [coverage-report, head-learn-dom-dead-breakdown, payment-write-proof, posture-b, mutating-gate, dom-only, completeness-manifest, cold-start-budget, full-corpus-gate, opentabs-parity]

# Dependency graph
requires:
  - phase: 39-01
    provides: "the payment-screening machinery (payment-op CI guard, posture-B re-gate, doordash/commerce origins classified sensitive) the coverage cross-confirm + the e2e payment proof exercise"
  - phase: 39-02
    provides: "the REAL emitted opentabs__doordash__place_order.json + list_orders.json (the shipped payment WRITE + read descriptors the e2e proof loads from disk)"
  - phase: 39-06
    provides: "the COMPLETE real-app catalog (228 opentabs descriptors, 56 services) + the 39-06-REMAINING-APPS.md completeness manifest the coverage report verifies realAppCount against"
provides:
  - "scripts/coverage-report.mjs -- the full-corpus coverage report (success criterion 3): the head/learn-on-visit/DOM-only/dead breakdown across the ~117-app real set, dual-export (reportCoverage() + CLI), asserting zero dead entries over the complete corpus"
  - "tests/coverage-report.test.js -- drives the REAL reportCoverage over the committed catalog; verifies completeness against the 39-06 manifest (every VENDORED+IMPORTED row covered, else FAIL naming the gap); the commerce/travel/misc batch DOM-only; no payment op API-invocable"
  - "the END-TO-END payment-write proof (the headline) on opentabs__doordash__place_order -- RECIPE_CONSENT_MUTATING_REQUIRED without the flag, allow with it, read passes -- money-no-movement-under-Auto proven on a SHIPPED payment descriptor"
  - "Phase 39 closed: all 7 plans complete; the full-corpus gate is green over the complete real-app catalog (validate:extension + crosscheck + no-dead-entry + eval + coverage report + full npm test all exit 0)"
affects: [phase-40-depth-hand-ports, phase-41-guarded-writes, phase-42-discovery-seeding, phase-43-catalog-scale-milestone-gate, verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Coverage report as a dual-export build tool (reportCoverage() + CLI guarded by import.meta.url === pathToFileURL(process.argv[1])) -- the test drives the REAL function over the committed catalog, the CLI is the human-readable + CI surface (mirrors verify-catalog-crosscheck.mjs)"
    - "Bucket-by-backing (handler/recipe->head, learn->learn, dom/absent->dom) as the AUTHORITATIVE invocability classifier, cross-checked via capability-catalog.js resolve() (heads seeded to T1a/T1b) for dead-entry detection -- documented in-code"
    - "Manifest-as-completeness-contract: the coverage test parses the 39-06 manifest's VENDORED+IMPORTED rows and FAILS naming any uncovered real app -- the source of truth for 'what must be covered' is the derived manifest, NOT a hand-kept number"
    - "Second end-to-end consent-gate block mirroring the discord template EXACTLY, swapping in a REAL shipped PAYMENT descriptor (the descriptor's sideEffectClass read from the loaded JSON, never a literal)"

key-files:
  created:
    - "scripts/coverage-report.mjs"
    - "tests/coverage-report.test.js"
  modified:
    - "tests/sensitive-write-import-gate.test.js (extended with the doordash payment block)"
    - "package.json (registered tests/coverage-report.test.js)"

key-decisions:
  - "Bucket by `backing` (the importer-stamped invocability signal) as the primary classifier; use resolve() as the dead-entry cross-check (resolve()===null -> dead). Head handlers are seeded (the 3 handler modules load cleanly in Node + self-register) so a handler descriptor resolves to its real T1a tier in the report, not the CGEN-03 T3 fallback."
  - "The completeness contract maps each manifest VENDORED+IMPORTED stem to a catalog descriptor via the slug-prefix '<stem>.' (robust for all 6 rows: shopify/craigslist/dominos/chipotle/zillow/grafana) -- a missing stem FAILS naming the gap."
  - "Proved the payment write on opentabs__doordash__place_order (the plan's primary choice -- service www.doordash.com, sideEffectClass write, backing dom; clean 39-02 origin) with list_orders as the read-allows op."
  - "realAppCount = 56 distinct services (52 opentabs DOM services + github.com/app.slack.com/www.notion.so heads + www.reddit.com recipe) reported vs the ~117 milestone target; the milestone number is informational, the manifest is the gate."
  - "No catalog/descriptor changes this plan (report + proof only); the snapshot is byte-identical to 39-06 so the cold-start figure is unchanged (136.2KB actual / 375.8KB headroom). INV-01 untouched; no new packages."

patterns-established:
  - "Pattern 1: dual-export coverage report (function for the test, CLI for humans/CI) reading the committed catalog + driving resolve() for dead-entry detection"
  - "Pattern 2: derived-manifest-as-completeness-contract -- the coverage test fails naming any real app on the manifest with no catalog descriptor"

requirements-completed: [BRDTH-01, BRDTH-02, BRDTH-03]

# Metrics
duration: ~22min
completed: 2026-06-25
---

# Phase 39 Plan 07: Full-Corpus Coverage Report + End-to-End Payment-Write Proof Summary

**The reportable head(8)/learn(0)/DOM-only(228)/dead(0) breakdown across the complete ~117-app real set (56 services, zero dead entries, completeness verified against the 39-06 manifest) PLUS the headline money-no-movement-under-Auto mitigation proven end-to-end on the REAL emitted opentabs__doordash__place_order payment descriptor (RECIPE_CONSENT_MUTATING_REQUIRED without the flag, allow with it, read passes) -- Phase 39 closed with the full-corpus gate green.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-06-25T15:30:00Z (approx)
- **Completed:** 2026-06-25T15:51:00Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- **The coverage report (success criterion 3 -- THE deliverable):** `scripts/coverage-report.mjs` emits the head/learn-on-visit/DOM-only/dead breakdown across the full real-app set (head=8, learn=0, dom=228, dead=0; 236 descriptors total; realAppCount=56 services vs the ~117 milestone target), reading the committed catalog + driving `resolve()` to cross-check every slug. Zero dead entries asserted over the COMPLETE corpus (the CLI exits 1 on any dead entry).
- **Completeness VERIFIED against the 39-06 manifest:** `tests/coverage-report.test.js` parses the manifest's 6 VENDORED+IMPORTED rows (shopify/craigslist/dominos/chipotle/zillow/grafana) and asserts each has a catalog descriptor -- a missing real app would FAIL naming the gap (the completeness contract; no silent undercount).
- **The headline payment-write mitigation, end-to-end on a SHIPPED descriptor:** extended `tests/sensitive-write-import-gate.test.js` with a doordash block (mirroring the discord canary exactly) -- the REAL `opentabs__doordash__place_order.json` (service www.doordash.com, sideEffectClass write read from the JSON, backing dom) routed through the LIVE posture-B gate: read (list_orders) -> allow; payment WRITE without the per-origin mutating flag -> `RECIPE_CONSENT_MUTATING_REQUIRED` (dual-field byte-exact, INV-03); `setOriginMutating(true)` -> allow. No order placed under Auto.
- **The full-corpus gate is green over the complete real-app catalog:** validate:extension + verify-catalog-crosscheck (incl. the payment-op guard) + no-dead-entry + capability-search-eval + coverage-report all exit 0; the full `npm test` suite exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Full-corpus coverage report + test (completeness vs the 39-06 manifest)** - `2250ac57` (feat)
2. **Task 2: End-to-end payment-write proof on the REAL doordash place_order descriptor + full-corpus gate re-assert** - `42259696` (test)

**Plan metadata:** (this commit -- docs: complete plan)

## Files Created/Modified

- `scripts/coverage-report.mjs` (created) - dual-export `reportCoverage()` + CLI; buckets every descriptor by backing, cross-checks each slug via `capability-catalog.js resolve()` (heads seeded to T1a/T1b), asserts zero dead, prints the per-app table + totals + realAppCount vs ~117 + the commerce/travel/misc DOM-only confirmation.
- `tests/coverage-report.test.js` (created) - drives the REAL `reportCoverage` over the committed catalog: totals.dead===0; every Phase-39 commerce/travel/misc descriptor DOM-only; head bucket = the 3 heads + reddit.inbox/github.notifications; completeness verified against the 39-06 manifest; no payment op API-invocable.
- `tests/sensitive-write-import-gate.test.js` (modified, +92 lines) - second end-to-end block on `opentabs__doordash__place_order` proving the payment-write posture-B re-gate; discord block unchanged.
- `package.json` (modified, +1 token) - registered `tests/coverage-report.test.js` after `sensitive-write-import-gate.test.js`.

## Coverage Report Output (the reportable breakdown)

| Bucket | Count | Meaning |
|--------|-------|---------|
| head (handler/recipe) | 8 | API-invocable day-one: github/slack/notion handler slugs (6) + reddit.inbox/github.notifications recipes (2) |
| learn-on-visit (backing:learn) | 0 | T2-seeded; discovery is Phase 42, so ~0 in breadth today (reported for completeness) |
| DOM-only (backing:dom/absent) | 228 | T3 DOM-only -- the entire breadth corpus incl. the commerce/travel/misc batch, invocable=false |
| dead (resolve()===null) | 0 | the no-dead-entry invariant, cross-confirmed over the COMPLETE corpus |
| **total descriptors** | **236** | |

- **realAppCount = 56 distinct services** (52 opentabs DOM services + github.com/app.slack.com/www.notion.so heads + www.reddit.com recipe) -- the complete vendored OpenTabs surface (39-06 closed it at 53 vendored dirs, 100% imported), reported vs the ~117 milestone target.
- **Phase-39 commerce/travel/misc batch:** 134 descriptors across 30 apps (doordash/ubereats/grubhub/instacart/uber/lyft + amazon/ebay/etsy/bestbuy/costco/walmart/target + booking/airbnb/expedia/kayak/opentable + ticketmaster/stubhub/eventbrite/yelp/tripadvisor/calendly + shopify/craigslist/dominos/chipotle/zillow/grafana) -- EVERY one backing:dom (DOM-only, invocable=false).
- **25 payment ops** (place_order/create_order/buy_tickets/complete_booking/...) -- NONE backing recipe/handler (every payment op DOM-only; the payment-op CI guard cross-confirms no payment op is safe-and-API-invocable).

## SW Cold-Start Headroom (flagged per 39-CONTEXT)

No catalog/descriptor changes this plan (report + proof only), so the snapshot is byte-identical to 39-06 and the cold-start figure is **UNCHANGED**:

| Metric | Value |
|--------|-------|
| Smoke serialized index (actual cold-start cost) | **136.2KB** over 240 seed descriptors |
| Byte ceiling (budget, set 39-04, used UNCHANGED) | **512KB** |
| **Headroom** | **375.8KB (73.4% of budget)** -- circuit breaker NOT fired, far above the 15%/76.8KB threshold |
| Per-descriptor footprint | 581 bytes/descriptor (flat, < 700 -- no params leak) |
| loadJSON + first search | ~2.0ms (< 10ms -- the real cold-start latency, kept TIGHT) |
| Search quality | recall@5 = 1.000 (>= 0.9), wrong-invoke = 0.000 |

**The authoritative full-corpus SCALE-01 cold-start gate (size + load-time at the largest corpus) stays Phase 43** -- the data layout is unchanged here (params schema-on-hit, NOT indexed). The 512KB ceiling was used as-is; no budget widening, no guard weakening.

## Decisions Made

- **Bucket by `backing`, cross-check by `resolve()`:** `backing` is the importer-stamped day-one-invocability signal (the catalog field that decides API-invocable vs DOM-only), so it is the authoritative bucket; `resolve()` is the dead-entry detector (null -> dead). The 3 head handler modules load cleanly in Node and self-register their globals, so `seedHeadHandlers()` makes the handler descriptors resolve to their real T1a tier in the report (truthful invocability cross-check), not the CGEN-03 T3 fallback. Documented in-code.
- **Manifest stem -> slug-prefix mapping** (`<stem>.`) is the completeness join; robust for all 6 VENDORED+IMPORTED rows.
- **Proved on doordash place_order** (the plan's primary choice; clean 39-02 origin) with list_orders as the read op.

## Deviations from Plan

None - plan executed exactly as written. (The plan correctly anticipated no new descriptors; the snapshot was already complete + byte-stable from 39-06, validate:extension was already green, and the doordash descriptors existed on disk. No Rule 1-4 deviations were triggered.)

## Issues Encountered

None. The baseline was fully green before starting (validate:extension exit 0, all gates passing, doordash classifies sensitive, the catalog regen produced no git diff), so both tasks landed cleanly on the first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 39 is COMPLETE** -- all 7 plans done. Real-app breadth coverage of the vendored OpenTabs surface is complete and reportable (the head/learn/dom/dead breakdown across 56 services, zero dead entries), the headline payment-write mitigation is proven end-to-end on a shipped descriptor, and the full-corpus gate is green.
- **Ready for Phase-39 verification**, then Phase 40 (Depth 1 -- Top READ Hand-Ports). At this stage breadth is all DOM-only (head = the existing github/slack/notion + the 2 hand-authored recipes); the depth hand-ports that move descriptors from the dom bucket into the head bucket come in Phases 40-41. The coverage report is the instrument that will show that migration.
- **No blockers.** Cold-start headroom is ample (73.4% of budget); the authoritative full-corpus SCALE-01 scale gate remains scheduled for Phase 43.

## Self-Check: PASSED

- `scripts/coverage-report.mjs` -- FOUND
- `tests/coverage-report.test.js` -- FOUND
- `.planning/phases/39-.../39-07-SUMMARY.md` -- FOUND
- Task commit `2250ac57` (feat: coverage report) -- FOUND
- Task commit `42259696` (test: payment proof) -- FOUND
- Stub scan (created/modified files): none
- Full `npm test` exit 0; full-corpus gate (validate:extension + crosscheck + no-dead-entry + eval + coverage-report) all exit 0

---
*Phase: 39-breadth-c-commerce-travel-misc-most-sensitive*
*Completed: 2026-06-25*
