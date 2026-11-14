---
phase: 39-breadth-c-commerce-travel-misc-most-sensitive
plan: 06
subsystem: catalog
tags: [opentabs-import, breadth, payment-screening, commerce, real-estate, observability, read-only-safe, dom-only, completeness-manifest, cold-start-budget, minisearch]

# Dependency graph
requires:
  - phase: 39-01
    provides: "payment-screening machinery -- the payment-op CI guard (PAYMENT_VERBS place + PAYMENT_OP_NAMES place_order/create_order already finalized) + the widened finance/payment classifyGate heuristic (specific tokens, no false-trip on read hosts); shopify/dominos/chipotle/craigslist already classified sensitive"
  - phase: 39-05
    provides: "the proven screen-then-import template (events + read-only span) + the 512KB cold-start ceiling + the per-descriptor flatness check (<700 bytes/descriptor); cold-start headroom 390.1KB baseline"
  - phase: 38-02
    provides: "the MED-02 READ_ONLY_SAFE_SERVICES invariant (checkReadOnlySafeOrigins) -- a safe-because-read-only origin's future write FAILS the build; extended here with www.zillow.com + grafana.com"
  - phase: 37-01
    provides: "the FROZEN screen-then-import machinery (enumerateBatchApps + STEM_OVERRIDES data-map + classifyGate merge-gate + backingFor='dom' + synthSynonyms + feedSeedDescriptors) reused verbatim"
provides:
  - "6 remaining commerce/misc apps imported DOM-only as 24 descriptors (204->228 opentabs): shopify/dominos/chipotle (sensitive, payment) + craigslist (sensitive, marketplace) + zillow/grafana (safe, read-only) -- real-app coverage of the vendored OpenTabs surface is now COMPLETE"
  - "39-06-REMAINING-APPS.md: the derived completeness manifest (53 vendored - 0 fixtures - 0 denied - 47 imported = 6 remaining, all VENDORED+IMPORTED, zero unaccounted rows) -- the contract 39-07's coverage report verifies against"
  - "screening EXTENDED before import: craigslist widened to apex-suffix *.craigslist.org; *.myshopify.com ADDED (the Shopify storefront payment origin *.shopify.com did not suffix-match); zillow/grafana added to READ_ONLY_SAFE_SERVICES; create_order/place_order DOM-only-on-sensitive -> the payment-op CI guard PASSES"
  - "regenerated snapshot (236 descriptors, INV-01 byte-stable across two regens); validate:extension exit 0; all per-wave gates green; cold-start headroom 375.8KB (73.4% of the 512KB budget) -- circuit breaker NOT fired, budget UNCHANGED"
affects: [39-07, 43-scale-milestone-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "STEM_OVERRIDES data-map extension for the 6 final apps (craigslist/dominos/chipotle/zillow -> 'www'-stem override; shopify/grafana pinned for stability) -- 0 opentabs__www__*"
    - "a derived completeness manifest as the verifiable coverage contract (vendor-dir-vs-imported diff with zero unaccounted rows), not a hoped-for completeness claim"
    - "apex-suffix denylist widening to keep the gate-checked origin = the screened origin AND screen the apex (craigslist *.craigslist.org); a missing payment-storefront origin added (*.myshopify.com)"

key-files:
  created:
    - "vendor/opentabs-snapshot/plugins/{shopify,craigslist,dominos,chipotle,zillow,grafana}/** (6 hermetic metadata slices, 48 files)"
    - "catalog/descriptors/opentabs__{shopify,craigslist,dominos,chipotle,zillow,grafana}__*.json (24 emitted descriptors)"
    - ".planning/phases/39-breadth-c-commerce-travel-misc-most-sensitive/39-06-REMAINING-APPS.md (the completeness manifest checklist)"
  modified:
    - "extension/config/service-denylist.json (craigslist -> *.craigslist.org apex-suffix; sensitiveOrigins += *.myshopify.com; _comment 39-06 completion note)"
    - "scripts/verify-catalog-crosscheck.mjs (READ_ONLY_SAFE_SERVICES += www.zillow.com/grafana.com -- the 38 MED-02 guard)"
    - "scripts/import-opentabs-catalog.mjs (STEM_OVERRIDES +6 data-map entries -- the only importer touch)"
    - "vendor/opentabs-snapshot/PIN.md (Phase-39 batch C sub-batch 5 completion row)"
    - "catalog/descriptors/_fixtures/{intent-cases.json,seed-descriptors.json,_provenance.json}; extension/catalog/recipe-index.generated.js; tests/breadth-search-return.test.js"

key-decisions:
  - "Manifest is DERIVED, not guessed: computed as the diff of the 53 vendored dirs minus fixtures (0) minus denied-with-a-vendored-dir (0) minus the 47 already-imported = the 6 remaining, all VENDORED+IMPORTED here. docker-hub/amplitude are illustrative ARCHITECTURE prose (never vendored) -> out of scope for the vendored-dir diff, recorded explicitly in the manifest so there is no silent drop."
  - "craigslist denylist host WIDENED from the exact www.craigslist.org to the apex-suffix *.craigslist.org (Rule 2) so the bare apex craigslist.org is ALSO screened (a marketplace-transact origin); the slice vendors www.craigslist.org (the screened origin) and derives stem 'www' -> STEM_OVERRIDES {craigslist:'craigslist'}."
  - "*.myshopify.com ADDED to sensitiveOrigins (Rule 2 -- a missing payment origin): Shopify storefronts/checkout run on the *.myshopify.com canonical domain, which the 39-01 *.shopify.com pattern does NOT suffix-match (shop.myshopify.com ends in myshopify.com, not .shopify.com). The plan's own verify probe (shop.myshopify.com -> sensitive) surfaced the gap; the importer gate-origin (shopify.com) was already sensitive so the import was never unscreened."
  - "No guard weakening + no budget widening: the 39-01 payment-op guard sets and the 512KB cold-start ceiling were used UNCHANGED. The cold-start circuit breaker did NOT fire (375.8KB headroom = 73.4% of budget, far above the 15%/76.8KB threshold). The authoritative full-corpus SCALE-01 gate stays Phase 43."

patterns-established:
  - "7th (final) verbatim reuse of the frozen screen-then-import contract (ZERO importer logic edit beyond the STEM_OVERRIDES data-map) -- completing real-app coverage of the vendored surface"
  - "A derived completeness manifest as the coverage contract: a real app with no disposition BLOCKS the plan; 39-07's realAppCount verifies the catalog against every VENDORED+IMPORTED row"

requirements-completed: [BRDTH-01, BRDTH-02, BRDTH-03]

# Metrics
duration: 21min
completed: 2026-06-25
---

# Phase 39 Plan 06: Completion Sub-Batch (shopify/craigslist/dominos/chipotle + zillow/grafana) + Real-App Completeness Manifest Summary

**The 6 remaining real OpenTabs apps imported DOM-only as 24 descriptors -- shopify/dominos/chipotle screened SENSITIVE with create_order/place_order DOM-only-on-sensitive (payment-op guard passes), craigslist SENSITIVE marketplace, zillow/grafana read-only-locked via READ_ONLY_SAFE_SERVICES -- COMPLETING real-app coverage of the vendored OpenTabs surface, with a DERIVED completeness manifest (zero unaccounted rows) as the verifiable contract and ample cold-start headroom preserved.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-06-25T10:14:19Z (after the 39-05 docs commit)
- **Completed:** 2026-06-25 (Task 2 commit 1b070379 at 10:35:32)
- **Tasks:** 2
- **Files modified/created:** 81 across the two task commits (52 in Task 1: 6 slices [48 files] + 3 screening/importer edits + PIN.md + the manifest; 29 in Task 2: 24 descriptors + snapshot + 3 fixtures + the breadth test)

## Accomplishments

- **Produced the DERIVED completeness manifest** (`39-06-REMAINING-APPS.md`): the read-only diff of the 53 vendored dirs MINUS 0 fixtures MINUS 0 denied-with-a-vendored-dir MINUS the 47 already-imported = the 6 remaining, ALL VENDORED+IMPORTED by this plan, zero unaccounted rows. docker-hub/amplitude (illustrative ARCHITECTURE prose, never vendored) explicitly recorded as out-of-scope-for-the-diff so nothing is silently dropped.
- **Vendored 6 hermetic metadata slices** (Wall 1: no dist/, no executed handle(), no runtime .js) mirroring the amazon (payment) / yelp (read-only) structure:
  - **Sensitive, payment (mirror amazon):** shopify (list_products/get_product/list_orders + create_order + cancel_order), dominos (list_stores/get_menu/list_orders/track_order + place_order), chipotle (list_locations/get_menu/list_orders + place_order). The payment write carries an explicit `{method:'POST'}`.
  - **Sensitive, marketplace:** craigslist (search_listings/get_listing + post_listing [WRITE, not a payment op] + delete_listing [DESTRUCTIVE]).
  - **Safe, read-only (api GET only):** zillow (search_listings/get_listing/get_home_value), grafana (list_dashboards/get_dashboard/query_metrics).
- **Extended the screening BEFORE vendoring:** craigslist widened to the apex-suffix `*.craigslist.org`; `*.myshopify.com` ADDED to sensitiveOrigins (the Shopify storefront payment origin); zillow/grafana left UNCLASSIFIED (safe) and their hosts (`www.zillow.com`/`grafana.com`) added to `verify-catalog-crosscheck.mjs` `READ_ONLY_SAFE_SERVICES` (the 38 MED-02 guard).
- **Imported via the FROZEN machinery** (only touch: 6 STEM_OVERRIDES data-map entries): enumerateBatchApps auto-discovered the dirs, emitted 24 descriptors (204->228 opentabs) all backing:dom; the merge-time classifyGate PASSED (all origins screened); 0 opentabs__www__* slugs; no prior descriptor clobbered; reddit-inbox.json intact.
- **Headline security -- BOTH guards proven over the COMPLETE corpus:**
  - **payment-op guard PASSES:** create_order (shopify; via PAYMENT_OP_NAMES -- its verb "create" is benign) + place_order (dominos/chipotle; via PAYMENT_VERBS "place" AND PAYMENT_OP_NAMES) are DOM-only on sensitive origins -> NOT safe-and-API-invocable. The live payment-op-guard test (20/0) confirms both detection paths.
  - **READ_ONLY_SAFE guard PASSES + locks:** zillow/grafana emit ONLY read ops -> the guard passes; a synthetic zillow write op FAILS it (proven), so a future re-vendored write FAILS the build.
- **Regenerated the snapshot** (236 descriptors; INV-01 byte-stable -- verified identical across two regens); validate:extension exits 0 (manifest + recipe-path guard + classification gate + crosscheck all green over the complete real-app corpus).
- **All per-wave gates green:** crosscheck (incl. payment-op + READ_ONLY_SAFE guards, 228 descriptors) + no-dead-entry (9/0) + breadth-search-return (recall@5=1.000 wrong-invoke=0.000 over 228 ops / 80 collision probes incl. 9 new cross-app probes) + capability-search-eval (recall@5=1.000 wrong-invoke=0.000 over 266 fixtures) + backing-status-annotation (10/0) + payment-op-guard (20/0) + full `npm test` exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Compute the manifest, screen + vendor the remaining real apps** - `498b1ada` (feat)
2. **Task 2: Import the final sub-batch, regenerate the complete-corpus snapshot, re-assert the per-wave gates** - `1b070379` (feat)

**Plan metadata:** (this SUMMARY + STATE.md + ROADMAP.md) — see final docs commit.

## Files Created/Modified

- `vendor/opentabs-snapshot/plugins/{shopify,craigslist,dominos,chipotle,zillow,grafana}/**` - 6 hermetic metadata slices (package.json + sdk-stub.ts verbatim + `<app>-api.ts` inert stub + index.ts + tools/*.ts; real z.object inputs; explicit transport signals -- POST for the 3 payment writes + the craigslist post_listing, DELETE for the destructives, GET-only for the read-only apps)
- `.planning/phases/39-.../39-06-REMAINING-APPS.md` - the derived completeness manifest checklist (zero unaccounted rows)
- `extension/config/service-denylist.json` - craigslist -> apex-suffix `*.craigslist.org`; sensitiveOrigins += `*.myshopify.com`; _comment extended with the 39-06 completion note
- `scripts/verify-catalog-crosscheck.mjs` - READ_ONLY_SAFE_SERVICES += `www.zillow.com`/`grafana.com` (the 38 MED-02 guard, with rationale comment)
- `scripts/import-opentabs-catalog.mjs` - STEM_OVERRIDES +6 entries (shopify/craigslist/dominos/chipotle/zillow/grafana) -- the only importer touch (a data-map extension, INV-01 holds)
- `vendor/opentabs-snapshot/PIN.md` - Phase-39 batch C sub-batch 5 (completion) row appended (append-only)
- `catalog/descriptors/opentabs__{shopify,craigslist,dominos,chipotle,zillow,grafana}__*.json` - 24 emitted descriptors (importer-written, all backing:dom)
- `catalog/descriptors/_fixtures/{intent-cases.json,seed-descriptors.json,_provenance.json}` - +24 intent cases; seed importer-fed (240); provenance apps[] filled (53 apps)
- `extension/catalog/recipe-index.generated.js` - regenerated snapshot (236 descriptors; IIFE/djb2/dual-export byte-stable, only DATA grew)
- `tests/breadth-search-return.test.js` - corpusFiles regex + floor->228 + 9 cross-app collision probes (dominos/chipotle place_order; shopify create_order; craigslist/ebay + zillow real-estate listings; grafana/datadog dashboards/metrics), all wrong-invoke=0

## Decisions Made

- **The manifest is the coverage contract:** rather than asserting "coverage complete," 39-06 produces a derived checklist (the vendor-dir-vs-imported diff) so 39-07's realAppCount can verify the catalog against every VENDORED+IMPORTED row. A real app with no disposition would BLOCK the plan; none did (the 6 remaining are all imported).
- **Completion of the FROZEN contract:** this is the 7th and final verbatim reuse of the screen-then-import machinery (37-01..39-05 were the prior six). The only importer touch remains the STEM_OVERRIDES data-map (now +6); no logic, no side-effect-class.mjs, no gate-core edit -- INV-01 holds.
- **No budget change:** the 512KB cold-start ceiling (set in 39-04) was used as-is. The smoke index reached 136.2KB at a flat 581 bytes/descriptor (vs 578 at 39-05 -- legitimate linear growth; the flatness check <700 passes). The authoritative full-corpus SCALE-01 cold-start gate stays Phase 43.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical screening] Added `*.myshopify.com` to sensitiveOrigins**
- **Found during:** Task 1 (running the plan's own classify probe `shop.myshopify.com -> sensitive`)
- **Issue:** The 39-01 denylist screens `*.shopify.com`, but Shopify storefronts/checkout (where create_order charges) run on the `*.myshopify.com` canonical domain, which `*.shopify.com` does NOT suffix-match (`shop.myshopify.com` ends in `myshopify.com`, not `.shopify.com`). The plan's Task-1 verify probe uses `shop.myshopify.com` and requires it sensitive -- it was not. (The importer gate-origin `shopify.com` was already sensitive, so the import itself was never unscreened; this closes the storefront-origin gap the probe surfaces.)
- **Fix:** Added `"https://*.myshopify.com"` to `sensitiveOrigins` (apex-suffix `*.` form, no broader than the merchant storefront's own scope); documented in the `_comment` 39-06 note + PIN.md.
- **Files modified:** extension/config/service-denylist.json
- **Verification:** `classify('https://shop.myshopify.com').sensitive === true`; the payment-op guard passes shopify.create_order DOM-only-on-(now-)sensitive; validate:extension exit 0.
- **Committed in:** 498b1ada (Task 1 commit)

**2. [Rule 2 - Screening correctness] Widened craigslist to the apex-suffix `*.craigslist.org`**
- **Found during:** Task 1 (the plan's classify probe uses `https://craigslist.org`, the apex)
- **Issue:** 39-01 classified the EXACT `www.craigslist.org` sensitive, but the bare apex `craigslist.org` (also a marketplace-transact origin -- posting/contacting a listing) was UNSCREENED, and the plan's Task-1 probe requires the apex sensitive.
- **Fix:** Changed the denylist entry from `https://www.craigslist.org` to the apex-suffix `https://*.craigslist.org` (covers apex + www + any subdomain -- the same `*.` discipline as *.shopify.com/*.uber.com/*.threads.net). The slice still vendors `www.craigslist.org` (the screened origin) and derives stem 'www' -> STEM_OVERRIDES {craigslist:'craigslist'}.
- **Files modified:** extension/config/service-denylist.json
- **Verification:** `classify('https://craigslist.org').sensitive === true` AND `classify('https://www.craigslist.org').sensitive === true`; the merge-time classifyGate did not abort.
- **Committed in:** 498b1ada (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2 -- missing/incorrect critical screening for a payment/marketplace origin).
**Impact on plan:** Both are screening-correctness fixes the plan's own verify probes surfaced (the plan named the named apps "already classified in 39-01" but the apex/storefront origin variants needed the `*.` widening). They tighten screening (more origins gated, never fewer); no scope creep, no machinery/logic change beyond denylist DATA.

## Issues Encountered

None beyond the two screening deviations above. The breadth collision probes were authored to be held-out paraphrases (no verbatim-synonym membership) and passed wrong-invoke=0 on the first run.

## Cold-Start Budget Flag + Circuit Breaker (per 39-CONTEXT, Task 2d)

**FLAGGED (and circuit breaker ENFORCED -- did NOT fire):**

| Metric | Value |
|--------|-------|
| Smoke serialized index (actual cold-start cost) | **136.2KB** over 240 seed descriptors |
| Per-descriptor footprint | **581 bytes/descriptor** (flat; vs 578 at 39-05; flatness gate <700 PASSES) |
| Smoke byte ceiling (budget) | **512KB** (set in 39-04, used UNCHANGED) |
| **Headroom (budget - actual)** | **375.8KB = 73.4% of budget** |
| Circuit-breaker threshold (15% of budget) | 76.8KB |
| **Circuit breaker fired?** | **NO** -- headroom (73.4%) is far above the 15% floor; proceed |
| Load-time (the real latency gate) | 1.73ms (< 10ms tight gate) PASSES |

This is the LARGEST corpus before the Phase-43 full-corpus gate (228 opentabs / 236 total descriptors; 240 seed descriptors indexed). The headroom is preserved well above the ~15% floor, so the circuit breaker did NOT fire and the byte budget was NOT widened. The remaining 375.8KB of slack stays available for the Phase-43 full-corpus SCALE gate (at the flat ~581 bytes/descriptor rate, the full ~2,523-doc corpus projects to ~1.4MB -- the Phase-43 concern, kept separate). The growth is legitimate LINEAR corpus growth (flat per-descriptor footprint), NOT a params-leak layout regression (the flatness assert is the regression signal and passes).

## User Setup Required

None - data-only vendoring + screening/test edits; no external service configuration, no new packages (zod/tsx already devDeps).

## Next Phase Readiness

- **39-07 UNBLOCKED:** real-app coverage of the vendored OpenTabs surface is COMPLETE -- enumerateBatchApps over the snapshot now covers every real app (every vendored dir except fixtures + the money-movement denied set). The completeness manifest (39-06-REMAINING-APPS.md) is the contract 39-07's coverage-report realAppCount check verifies against (a missing VENDORED+IMPORTED row FAILS 39-07). The head/learn/dom/dead breakdown across the ~228-descriptor / 53-app real set is ready to report.
- Plan 39-07 carries the full-corpus coverage report + (optionally) the end-to-end consent proof on a real emitted payment descriptor (shopify.create_order / dominos.place_order DOM-only-on-sensitive are now available proof origins alongside the 39-02..05 payment writes).
- Ample cold-start headroom (375.8KB) remains; no blockers.

## Self-Check: PASSED

- All 6 vendored slice index.ts files exist on disk; the headline emitted descriptors (opentabs__shopify__create_order.json, opentabs__dominos__place_order.json, opentabs__zillow__search_listings.json, opentabs__grafana__query_metrics.json) exist; 39-06-REMAINING-APPS.md + SUMMARY.md exist.
- Both task commits exist (498b1ada, 1b070379).

---
*Phase: 39-breadth-c-commerce-travel-misc-most-sensitive*
*Completed: 2026-06-25*
