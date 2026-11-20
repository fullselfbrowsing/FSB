---
phase: 56-governing-lineage-evidence-deadline-engine
plan: "04"
subsystem: truth
tags: [storage, lineage, citations, reverse-dependencies, recovery]
requires:
  - phase: 56-01
    provides: Closed truth schemas and shared exact citation limits
  - phase: 56-02
    provides: Complete graph exact-set snapshots and source/candidate generations
  - phase: 56-03
    provides: Storage-independent semantic family proofs
provides:
  - Immutable pointer-last family truth snapshots derived only from parsed semantic proofs
  - Symmetric source/family reverse dependencies with real citations purge ownership
  - One-time graph truth-invalidator registration before source or overlay publication
  - Bounded fail-closed recovery, exact absence proofs, and privacy-safe diagnostics
affects: [56-05, phase-57, phase-58, phase-59]
tech-stack:
  added: []
  patterns: [pointer-last immutable snapshots, pointer-first withdrawal, symmetric reverse dependencies, bounded fail-closed recovery]
key-files:
  created:
    - extension/utils/skopeo-truth-store.js
    - tests/skopeo-truth-store.test.js
  modified:
    - extension/utils/skopeo-graph-store.js
    - tests/skopeo-graph-store.test.js
key-decisions:
  - "Only a store-created and reparsed manifest may derive and publish an sts1 snapshot identity."
  - "Source/family reverse dependencies must be symmetric before the active family control is published pointer-last."
  - "Once registered, graph source and overlay changes synchronously withdraw affected truth before graph publication."
  - "Large snapshot manifests use independently hashed bounded chunks so the exact 2,048-citation proof remains publishable under the 256-KiB value cap."
patterns-established:
  - "Visibility boundary: immutable pages and journals confer no authority; only one validated published family control makes truth readable."
  - "Invalidation boundary: clear family controls before removing sibling dependencies or publishing replacement graph state."
requirements-completed: [TRUTH-03, TRUTH-04, TRUTH-09, TRUTH-11]
duration: 46 min
completed: 2026-07-24
---

# Phase 56 Plan 04: Immutable Truth Store Summary

**Complete family truth now persists as store-derived immutable snapshots, stays visible only through one validated pointer written last, and is withdrawn across every dependent source before corpus or graph changes can publish.**

## Performance

- **Duration:** 46 min
- **Started:** 2026-07-24T12:10:53Z
- **Completed:** 2026-07-24T12:56:37Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added the frozen `FsbSkopeoTruthStore` boundary with opaque mutation capabilities, length-prefixed partition keys, store-owned deterministic paging/hashing, parsed manifests, and pointer-last `sts1:` publication.
- Added bounded symmetric source-to-family and family-to-source dependencies, pointer-first family withdrawal, the real `citations` corpus purge participant, and exact source/partition absence proofs.
- Added the graph store's one-time truth-invalidator seam so source replacement/withdrawal and proposer-plus-old/new-target overlay changes cannot publish until affected family truth has been withdrawn.
- Added sorted 128-step recovery that hides uncertain state, removes corrupt/orphan/asymmetric influence, never reconstructs authority, and converges safely after injected storage failures.
- Added privacy-safe partition diagnostics with exact closed fields, coarse time, saturating counts, and 100-entry/64-KiB/30-day bounds.
- Proved the exact 2,048-citation, 1,024-family/source, 64-page/category, 256-entry/page, 256-KiB/value, and 8-MiB/snapshot boundaries, including max-plus-one rejection before active publication.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the controlled RED immutable truth-store and real-citations contract** - `2f0b1a8b` (test)
2. **Task 2: Implement pointer-last family storage, symmetric dependencies, purge, and graph invalidation** - `e64911ab` (feat)
3. **Task 3: Close bounded MV3 recovery, absence proofs, and diagnostic privacy** - `6aa5e459` (fix)

**Plan metadata:** this commit

## Files Created/Modified

- `extension/utils/skopeo-truth-store.js` - Immutable family snapshots, reverse dependencies, citations purge binder, graph invalidator, diagnostics, and bounded recovery.
- `tests/skopeo-truth-store.test.js` - Controlled RED/GREEN, exact-cap, corruption, exhaustive storage-fault, restart, purge, invalidation, absence, and privacy oracle.
- `extension/utils/skopeo-graph-store.js` - One-time exact truth-invalidator registration and withdrawal-before-publication choreography.
- `tests/skopeo-graph-store.test.js` - Exact adapter/result validation plus source/overlay invalidation ordering and failure-closure coverage.

## Decisions Made

- A caller supplies only one schema-parsed, page-free semantic family proof. The store alone constructs pages, hashes, bounded manifest chunks, the parsed durable manifest, and the `sts1:` identity.
- An active family is readable only when its exact published control, manifest, pages, hashes, counts, and both dependency directions reparse. Staging bytes, journals, scan order, timestamps, and prior pointers never grant visibility.
- Family withdrawal is pointer-first. All affected family controls disappear before sibling source dependencies are rewritten and before a registered graph mutation can publish.
- The `citations` participant owns every Phase 56 control, page, manifest, journal, dependency, diagnostic, and projection influence; `counts` and `alerts` remain unimplemented.
- Recovery is durable-only and bounded. Missing, corrupt, asymmetric, over-cap, or incomplete state remains hidden and is cleaned or reported as `recovery-pending`, never promoted.

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered

- The schema-valid exact 2,048-citation snapshot produces a manifest larger than one 256-KiB storage value. The planned independently paged manifest boundary was implemented as bounded, independently hashed manifest chunks; fixed-order closed-record WebCrypto hashing is used for those chunks because the schema helper intentionally caps canonical strings at 4,096 characters. Every stored chunk remains at or below 256 KiB, and the exact-cap proof publishes and rereads successfully.

## User Setup Required

None - no external service configuration is required.

## Next Phase Readiness

- Plan 56-05 can register `truthStore.graphInvalidator` and the `citations` binder during trusted background boot, then expose only current-authorized family reads through the background facade.
- Truth-engine/background wiring, aggregate/static gates, fixture-corpus evaluation, and package integration remain intentionally deferred to Plan 56-05.
- Expert legal-domain clause-to-rule validation and live Chrome evidence remain explicitly `human_needed`; no automated result represents those checks as complete.

---
*Phase: 56-governing-lineage-evidence-deadline-engine*
*Completed: 2026-07-24*
