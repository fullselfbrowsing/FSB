---
phase: 56-governing-lineage-evidence-deadline-engine
plan: "03"
subsystem: truth
tags: [lineage, evidence, deadlines, deterministic-adjudication]
requires:
  - phase: 56-01
    provides: Closed truth schemas and pure civil-date deadline engine
  - phase: 56-02
    provides: Complete graph exact-set snapshots and normalized source-local candidates
provides:
  - Pure exact-set governing-lineage adjudication with four independent axes
  - Governing-path typed facts, complete conflicts, and deterministic deadline eligibility proofs
  - Storage-independent semantic family proofs with an exact 2,048-citation boundary
affects: [56-04, 56-05, phase-57, phase-58, phase-59]
tech-stack:
  added: []
  patterns: [exact-set digest binding, governing-path applicability, injected pure deadline evaluation]
key-files:
  created:
    - extension/utils/skopeo-lineage-adjudicator.js
    - tests/skopeo-lineage-adjudicator.test.js
  modified:
    - extension/utils/skopeo-truth-schema.js
    - tests/skopeo-truth-schema.test.js
key-decisions:
  - "Family identity binds only sorted source-owned document IDs and accepted explicit relation IDs."
  - "Historical facts remain visible, while only the selected governing document and latest exact overlay may clear conflicts or deadlines."
  - "Direct and derived notice deadlines remain separate assertion versions, and incompatible values form a blocking conflict."
patterns-established:
  - "Exact-set adjudication: recompute sgx1 and bind every normalized source-local candidate generation before family formation."
  - "Storage independence: adjudication emits semantic proofs only; paging, hashes, manifests, and sts1 remain store-owned."
requirements-completed: [TRUTH-02, TRUTH-03, TRUTH-04, TRUTH-06, TRUTH-07, TRUTH-08, TRUTH-11]
duration: 1h 5m
completed: 2026-07-24
---

# Phase 56 Plan 03: Governing Lineage Adjudication Summary

**Exact-set-bound, permutation-invariant lineage adjudication now preserves cited facts and conflicts while producing fail-closed deadline eligibility proofs without storage, provider, clock, or UI authority.**

## Performance

- **Duration:** 1h 5m
- **Started:** 2026-07-24T11:00:40Z
- **Completed:** 2026-07-24T12:05:28Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added a frozen classic/CommonJS adjudicator whose exact injected boundary accepts only the complete current `skopeo-graph-exact-set/1` plus generation-bound normalized source-local candidates.
- Implemented deterministic family formation, four independent lineage axes, full replacements, exact-clause overlays, inheritance, cycle/ambiguity abstention, and inertness to labels, confidence, recency, similarity, majority, and input order.
- Preserved governing-path typed assertions and complete conflict sets, including separate stated and derived notice deadlines, with deadline evaluation delegated only to the injected closed civil-date engine.
- Enforced page-free storage-independent semantic proofs and the exact shared citation boundary: 2,048 adjudicates and 2,049 returns no partial family.
- Kept the focused truth-schema, deadline-engine, and adjudicator verification loop at 16.8 seconds while retaining the full cap and timezone matrix.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the controlled RED deterministic lineage and abstention contract** - `76e486cf` (test)
2. **Task 2: Implement deterministic family, four-axis, replacement, and clause-overlay adjudication** - `4f9fef69` (feat)
3. **Task 3: Resolve applicable typed facts, preserve conflicts, and derive deadline eligibility proofs** - `d8f14762` (feat)

Additional validation commit:

- **Keep the full exact-citation fixture inside the focused feedback budget** - `dfab6865` (test)

**Plan metadata:** this commit

## Files Created/Modified

- `extension/utils/skopeo-lineage-adjudicator.js` - Pure family, lineage, fact/conflict, derivation, and eligibility adjudication.
- `tests/skopeo-lineage-adjudicator.test.js` - Controlled RED/GREEN, permutation, hostile-input, exact-cap, deadline, injection, and timezone oracle.
- `extension/utils/skopeo-truth-schema.js` - Accepts the Plan 56 exact-set `sgx1:` digest namespace at semantic-proof and manifest boundaries.
- `tests/skopeo-truth-schema.test.js` - Regression coverage for `sgx1:` authorized-set digest compatibility.

## Decisions Made

- Family identity is derived only from sorted source-owned document IDs and accepted explicit relation IDs; presentation and model metadata are never authority.
- All source-owned typed assertions remain inspectable, but only the selected governing document and latest accepted exact-clause overlay are applicable to conflict and deadline clearance.
- Byte-equivalent compatible values remain separate cited assertion versions; incompatible applicable values form complete deterministic conflict sets.
- A successfully derived notice deadline is a separate inferred assertion, never an overwrite of a stated deadline, and any mismatch blocks eligibility.
- Missing consequence evidence yields an explicit blocker and null consequence instead of borrowing an anchor or other nearby fact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Aligned truth-schema authorized-set digest admission with the exact-set namespace**

- **Found during:** Task 2
- **Issue:** Plan 56-01 admitted only `sha256:` authorized-set digests, while Plan 56-02 intentionally emits exact-set identities under `sgx1:`.
- **Fix:** Allowed either an existing `sha256:` digest or an exact-set `sgx1:` digest at semantic family proof and truth-manifest validation boundaries, with a focused regression.
- **Files modified:** `extension/utils/skopeo-truth-schema.js`, `tests/skopeo-truth-schema.test.js`
- **Verification:** `node tests/skopeo-truth-schema.test.js`
- **Committed in:** `4f9fef69`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The repair is the minimum cross-plan compatibility needed to bind the adjudicator to Plan 56-02 exact sets; scope and fail-closed behavior are unchanged.

## Issues Encountered

- The first exact 2,048/2,049 citation fixture made the focused suite exceed the 30-second feedback target. A deterministic Node SHA-256 adapter removed per-call WebCrypto scheduling overhead in the test process without changing digest bytes or production code; the complete focused gate now takes 16.8 seconds.

## User Setup Required

None - no external service configuration is required.

## Next Phase Readiness

- Plan 56-04 can admit these schema-parsed semantic family proofs into its store-owned paging, hashing, manifest, reverse-dependency, and invalidation boundary.
- Plan 56-05 can integrate the frozen adjudicator through the trusted background facade after Plans 56-03 and 56-04 are both complete.
- Expert legal/domain fixture approval and live Chrome validation remain explicitly `human_needed`; no automated result represents those checks as complete.

---
*Phase: 56-governing-lineage-evidence-deadline-engine*
*Completed: 2026-07-24*
