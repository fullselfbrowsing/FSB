---
phase: 39-breadth-c-commerce-travel-misc-most-sensitive
plan: 02
subsystem: catalog
tags: [opentabs, breadth, descriptors, payment, food-delivery, rideshare, dom-only, posture-b, stem-overrides, minisearch]

# Dependency graph
requires:
  - phase: 39-01
    provides: "payment/money-movement classification of the commerce origins (6 food-delivery/rideshare origins SENSITIVE) + the payment-op CI guard (checkPaymentOpsNotSafeInvocable) + the widened finance/payment heuristic"
  - phase: 38-03
    provides: "the frozen screen-then-import contract + the STEM_OVERRIDES data-map pattern (threads www-canonicalization precedent) + the breadth-search-return/eval gate shapes"
  - phase: 37-01
    provides: "the frozen importer machinery (enumerateBatchApps + runImport + classifyGate + feedSeedDescriptors) + STEM_OVERRIDES extension point + synthSynonyms"
provides:
  - "6 food-delivery + rideshare apps (doordash/ubereats/grubhub/instacart/uber/lyft) vendored as hermetic metadata-only slices + imported DOM-only (31 descriptors, 94->125) on the 39-01 screened-SENSITIVE origins"
  - "every payment op (place_order/checkout/request_ride) is backing:'dom' on a sensitive origin -> the payment-op CI guard PASSES (the triple money-no-movement-under-Auto mitigation proven for the food-delivery/rideshare category)"
  - "6 STEM_OVERRIDES data-map entries canonicalizing the www/apex hosts to brand stems (0 opentabs__www__* slugs)"
affects: [39-03, 39-04, 39-05, 39-06, 39-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "STEM_OVERRIDES www-host canonicalization extended to payment-bearing commerce apps (the cloudflare/datadog/threads precedent; a DATA-MAP entry, NOT a logic change -- INV-01 holds)"
    - "payment-op DOM-only-on-sensitive: each place_order/checkout/request_ride classes write/destructive AND ships backing:'dom' on a 39-01-screened sensitive origin -> the payment-op guard confirms it is NOT safe-and-API-invocable"

key-files:
  created:
    - "vendor/opentabs-snapshot/plugins/{doordash,ubereats,grubhub,instacart,uber,lyft}/** (6 hermetic metadata slices)"
    - "catalog/descriptors/opentabs__{doordash,ubereats,grubhub,instacart,uber,lyft}__*.json (31 emitted descriptors)"
  modified:
    - "scripts/import-opentabs-catalog.mjs (STEM_OVERRIDES: +6 data-map entries -- the ONLY importer touch)"
    - "extension/catalog/recipe-index.generated.js (snapshot regenerated, INV-01 byte-stable, 133 descriptors)"
    - "catalog/descriptors/_fixtures/{seed-descriptors,intent-cases,_provenance}.json"
    - "tests/breadth-search-return.test.js, tests/capability-search-eval.test.js"
    - "vendor/opentabs-snapshot/plugins/bluesky/src/tools/list-timeline.ts (Rule-1 metadata-source fix) + catalog/descriptors/opentabs__bsky__list_timeline.json (re-emitted)"
    - "vendor/opentabs-snapshot/PIN.md (Phase-39 batch C sub-batch 1 row)"

key-decisions:
  - "STEM_OVERRIDES extended with the 6 dir-name keys (doordash/ubereats/grubhub/instacart/uber/lyft) -- the orchestrator stem-resolution decision: vendor each slice with its REAL screened host (www.* exact for doordash/ubereats/grubhub/instacart; *.uber.com/*.lyft.com wildcards for uber/lyft) so the emitted origin stays the screened-sensitive host, while the slug canonicalizes to opentabs__<app>__* (the threads precedent; a DATA-MAP extension, INV-01 holds). 39-01's classifications were NOT changed."
  - "[Rule 1] the pre-existing bsky list/create near-tie ('scroll my bluesky feed' -> create_post) tipped by THIS corpus growth was fixed at the bsky METADATA SOURCE (description-only edit, summary unchanged), re-imported via the frozen machinery -- NOT a seed hand-edit (the 37-04 precedent)."
  - "[Rule 3, plan-authorized] the CGEN-04 cold-start smoke budget widened 64KB->96KB for legitimate linear seed growth (106->137) at a flat ~550 bytes/descriptor (no params leak verified)."

patterns-established:
  - "Payment-bearing op DOM-only-on-sensitive: the triple mitigation (frozen backing:'dom' default + 39-01 sensitive classification + the payment-op CI guard) holds for the food-delivery/rideshare category."
  - "A metadata-source synonym fix must be SCOPED: edit the weak description field (boost 1) to nudge a single eval fixture WITHOUT poisoning app-tagged cross-app collision probes; the summary (which seeds synthSynonyms) stays untouched when it would over-index a verb/noun shared across sibling apps."

requirements-completed: [BRDTH-01, BRDTH-02, BRDTH-03]

# Metrics
duration: 18min
completed: 2026-06-25
---

# Phase 39 Plan 02: Food-Delivery + Rideshare Import Summary

**6 payment-bearing food-delivery/rideshare apps (doordash/ubereats/grubhub/instacart/uber/lyft) imported DOM-only via the frozen machinery on the 39-01 screened-SENSITIVE origins -- every payment op (place_order/checkout/request_ride) is backing:'dom' on a sensitive origin so the payment-op CI guard PASSES (no money moves under Auto).**

## Performance

- **Duration:** ~18 min (active; the prior executor had pre-created the 6 vendor dirs but vendored only doordash fully + ubereats partially, ran NO importer, committed NOTHING -- this run finished ubereats, created uber/lyft/grubhub/instacart from scratch, imported, and ran all gates)
- **Started:** 2026-06-25T13:40Z (resume)
- **Completed:** 2026-06-25T13:56Z
- **Tasks:** 2
- **Files modified/created:** 96 (57 in Task 1 + 39 in Task 2)

## Accomplishments
- 6 hermetic metadata-only slices (Wall 1: NO dist/, NO executed handle(), NO runtime .js) mirroring the doordash/todoist structure, each carrying a PAYMENT-bearing write (place_order/checkout/request_ride, `api {method:'POST'}`) + a DESTRUCTIVE op (cancel_order/cancel_ride, `apiVoid {method:'DELETE'}`) + reads (list/get/track/search, `api {method:'GET'}`).
- The FROZEN importer (ZERO logic edit -- only the 6-entry STEM_OVERRIDES data-map extension from Task 1) emitted 31 descriptors (94->125), ALL backing:'dom', brand stems (0 opentabs__www__*), the merge-time classifyGate did NOT abort (all 6 origins screened sensitive by 39-01).
- The headline security property: every payment op classes write/destructive AND is DOM-only on a sensitive origin -> `verify-catalog-crosscheck.mjs checkPaymentOpsNotSafeInvocable` PASSES (the money-no-movement-under-Auto guard, the triple mitigation in action).
- Snapshot regenerated (INV-01 IIFE/djb2 byte-stable, 133 descriptors; only the DATA literal grows); `validate:extension` EXIT 0; no prior descriptor clobbered.
- All per-wave gates green over the grown corpus: crosscheck (incl. payment-op guard) + no-dead-entry (every new slug -> T3) + breadth-search-return (recall@5=1.000, wrong-invoke=0 over 125 ops / 40 collision probes incl. the cross-app place_order doordash/grubhub/ubereats + request_ride uber/lyft collisions) + capability-search-eval (recall@5=1.000, wrong-invoke=0 over 181 fixtures).

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor the 6 food-delivery/rideshare metadata slices + STEM_OVERRIDES + PIN.md** - `a1c12bc3` (feat) -- 57 files
2. **Task 2: Import the sub-batch, regenerate the snapshot, re-assert the per-wave gates** - `35640425` (feat) -- 39 files

**Plan metadata:** (this SUMMARY + STATE.md + ROADMAP.md) -- the docs commit following this file.

## Files Created/Modified
- `vendor/opentabs-snapshot/plugins/{doordash,ubereats,grubhub,instacart,uber,lyft}/**` - 6 hermetic metadata slices (package.json + sdk-stub.ts + `<app>`-api.ts + index.ts + tools/*.ts)
- `scripts/import-opentabs-catalog.mjs` - STEM_OVERRIDES extended with 6 dir-name keys (the ONLY importer touch -- a data-map entry, not logic)
- `catalog/descriptors/opentabs__{doordash,ubereats,grubhub,instacart,uber,lyft}__*.json` - 31 emitted DOM-only descriptors
- `extension/catalog/recipe-index.generated.js` - snapshot regenerated (INV-01 byte-stable)
- `catalog/descriptors/_fixtures/{seed-descriptors,_provenance}.json` - importer-fed (seed 106->137)
- `catalog/descriptors/_fixtures/intent-cases.json` - +31 read/payment-write/destructive eval cases
- `tests/breadth-search-return.test.js` - corpus regex + floor (94->125) + cross-app payment-op collision probes
- `tests/capability-search-eval.test.js` - cold-start budget 64KB->96KB (plan-authorized; documented inline)
- `vendor/opentabs-snapshot/plugins/bluesky/src/tools/list-timeline.ts` + `opentabs__bsky__list_timeline.json` - Rule-1 metadata-source fix (description-only)
- `vendor/opentabs-snapshot/PIN.md` - Phase-39 batch C sub-batch 1 append-only row

## Decisions Made
- **Stem resolution (orchestrator decision, applied):** each slice vendors its REAL screened host -- doordash/ubereats/grubhub/instacart at `*://www.<app>.com/*` (the exact www origins 39-01 screened sensitive); uber/lyft at `*://*.uber.com/*` and `*://*.lyft.com/*` (covered by the `*.uber.com`/`*.lyft.com` sensitive wildcards). The www-hosts derive the stem 'www', so 6 dir-name STEM_OVERRIDES entries canonicalize each slug to `opentabs__<app>__*` (the cloudflare/datadog/threads first-label-isn't-the-app-name precedent; a DATA-MAP extension of the 37-01 per-app extension point, NOT a logic change, so INV-01 holds). The emitted `origin`/`service` stays the screened host. 39-01's classifications were NOT changed.
- **instacart's payment op is `checkout`** (grocery cart), not `place_order` -- `checkout` is in BOTH the guard's PAYMENT_VERBS and PAYMENT_OP_NAMES, so it is keyed correctly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing bsky list/create near-tie tipped by this corpus growth**
- **Found during:** Task 2 (the capability-search-eval re-assertion over the grown corpus)
- **Issue:** The eval fixture `"scroll my bluesky feed" -> bsky.list_timeline` (a Phase-38 fixture) tipped to `bsky.create_post` once the 31 new descriptors shifted the corpus-global IDF -- pushing the NON-NEGOTIABLE eval wrong-invoke from 0.000 (green at 39-01 over 154 fixtures) to 0.006 (1/181). Root cause: the query word "feed" appears in create_post's description ("Post a new entry to your Bluesky feed") but NOT in list_timeline's text ("home timeline") -> a razor-thin 52.7 vs 51.7 cross-invoke. This is the SAME class of corpus-growth-tipped near-tie as the 37-04 Rule-1 deviation.
- **Fix:** Fixed at the bsky METADATA SOURCE (`vendor/opentabs-snapshot/plugins/bluesky/src/tools/list-timeline.ts`) -- added "read your home feed of posts" to the list_timeline DESCRIPTION (the weak boost-1 field) ONLY; the summary (which seeds synthSynonyms) was left UNCHANGED. A first attempt that ALSO changed the summary to "scroll my bluesky timeline feed" over-reached -- it poisoned the 3-way microblog `"scroll my <app> home feed"` collision probes (mastodon/threads cross-invoked to bsky), so it was reverted to the description-only scope. Re-imported via the FROZEN machinery (re-emitted opentabs__bsky__list_timeline.json + re-fed the seed) -- NO importer logic edit, NO seed hand-edit.
- **Files modified:** vendor/opentabs-snapshot/plugins/bluesky/src/tools/list-timeline.ts, catalog/descriptors/opentabs__bsky__list_timeline.json (re-emitted)
- **Verification:** eval wrong-invoke restored to 0.000 over 181 fixtures AND breadth-search-return wrong-invoke stays 0.000 over 40 collision probes (the scoped fix does not regress the cross-app microblog disambiguation).
- **Committed in:** `35640425` (Task 2 commit)

**2. [Rule 3 - Blocking, plan-authorized] CGEN-04 cold-start smoke budget widened 64KB -> 96KB**
- **Found during:** Task 2 (the capability-search-eval cold-start assertion)
- **Issue:** The eval seed grew 106 -> 137 descriptors as the 31-op food-delivery/rideshare sub-batch landed, pushing the serialized index 55.6KB -> 73.6KB, over the 64KB ceiling.
- **Fix:** Widened the smoke budget to 96KB with an inline comment documenting the grown count + the flat-footprint rationale. This is LEGITIMATE LINEAR growth at a FLAT per-descriptor footprint (~550 bytes/descriptor vs ~536 at 38-02 -- the marginal rise is the slightly-longer payment-op descriptions, genuine searchable text), NOT a layout regression: VERIFIED no params leak (no `additionalProperties` / `"required":[` in the serialized index; storedFields are {slug,service,description,sideEffectClass,backing} only). The plan explicitly authorizes this exact adjustment (the 38-02 precedent), and 39-CONTEXT requires flagging it.
- **Files modified:** tests/capability-search-eval.test.js
- **Verification:** the cold-start asserts pass at the grown size (73.6KB < 96KB, loadJSON+first-search 1.50ms < 10ms); the layout discipline (params schema-on-hit, NOT indexed) confirmed intact.
- **Committed in:** `35640425` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule-1 bug, 1 Rule-3 plan-authorized budget widen)
**Impact on plan:** The Rule-1 fix preserves the non-negotiable wrong-invoke=0 invariant the corpus growth would otherwise have broken (a foundational-slice fix that also hardens the bsky timeline-vs-feed routing for all later batches). The Rule-3 widen is a plan-authorized smoke-budget adjustment for legitimate growth, not a layout change. No scope creep; the importer machinery (enumerateBatchApps/runImport/classifyGate/side-effect-class) was NOT edited -- only the STEM_OVERRIDES data-map.

## Cold-Start Budget Flag (39-CONTEXT requirement)

39-CONTEXT requires flagging if a batch approaches the SW cold-start budget. **FLAGGED:** the food-delivery/rideshare sub-batch pushed the serialized smoke index to **73.6KB** (137 seed descriptors, ~550 bytes/descriptor flat). The budget was widened 64KB -> 96KB (headroom: ~22KB / ~30% for the remaining Phase-39 commerce sub-batches 39-03..06). The per-descriptor footprint is flat (no params leak verified); the full ~2,523-doc corpus at this rate is ~1.4MB, which remains the Phase-43 scale-gate's concern, NOT this smoke. Future sub-batches should re-flag if the footprint per descriptor rises (a layout regression) rather than the count alone.

## Issues Encountered
- The Rule-1 bsky fix required TWO iterations: the first (summary + description edit) over-indexed bsky on the shared "scroll ... feed" phrasing and regressed the 3-way microblog collision probes; narrowing it to a description-only edit (leaving the synthSynonyms-seeding summary untouched) fixed the eval fixture without poisoning the cross-app probes. Resolved within Task 2 before commit.

## User Setup Required
None - no external service configuration required (data-only vendoring + test edits; zod/tsx already devDeps; no new packages).

## Next Phase Readiness
- 39-03 (retail/marketplace: amazon/ebay/etsy/bestbuy/costco/walmart/target) is UNBLOCKED and inherits the SAME frozen screen-then-import contract + the STEM_OVERRIDES www-canonicalization pattern + the cold-start budget (96KB ceiling with headroom).
- All Phase-39 sub-batches reuse the payment-op-guard-on-sensitive proof established here; the END-TO-END payment-write consent proof on a REAL emitted descriptor (place_order -> RECIPE_CONSENT_MUTATING_REQUIRED, posture B) is Plan 39-07.
- The cold-start budget should be re-checked per sub-batch; flag if it approaches 96KB before 39-07.

## Self-Check: PASSED

- All created files verified on disk (6 slice index.ts + 3 payment-op descriptors + SUMMARY.md).
- Both task commits verified in git log (a1c12bc3, 35640425).
- The Task-2 plan verify-block runs end-to-end clean (import + payment-ops-DOM-only + package-extension + validate:extension + crosscheck + no-dead-entry + breadth-search-return + capability-search-eval all EXIT 0).
- 0 opentabs__www__* slugs; 31 new descriptors all backing:'dom'; no stubs/placeholders.

---
*Phase: 39-breadth-c-commerce-travel-misc-most-sensitive*
*Completed: 2026-06-25*
