---
phase: 53-drive-context-router-semantic-anchors
plan: "02"
subsystem: content-runtime
tags: [semantic-anchors, dom-virtualization, stale-work, resource-ledger]

requires:
  - phase: 52-on-demand-hud-lifecycle-primitive-shell
    provides: Abort-first generation ownership and the canonical eleven-category resource ledger
provides:
  - Immutable semantic anchor descriptors separated from revocable DOM and Range bindings
  - Withdraw-first row-reuse, detach, geometry, ABA, and stale-async authority enforcement
  - Deterministic virtualized-row fixture with manual frames and reversed deferred resolution
affects: [53-03-runtime-integration, 53-04-shell-integration, 53-05-browser-closure, HUD-09]

tech-stack:
  added: []
  patterns: [immutable-descriptor-revocable-binding, full-tuple-async-gate, bounded-owned-observation]

key-files:
  created:
    - extension/content/skopeo-anchor-registry.js
    - tests/fixtures/skopeo-semantic-anchor-fixture.js
    - tests/skopeo-anchor-registry.test.js
  modified:
    - tests/helpers/skopeo-resource-ledger.js

key-decisions:
  - "Semantic meaning stays recursively frozen while the private live candidate and geometry certificate are revocable binding state."
  - "Every bind attempt and withdrawal advances registry-owned bindingEpoch authority; all async continuations must also pass generation, contextEpoch, semanticIdentity, and isCurrent checks."
  - "Mutation and geometry signals validate synchronously, withdraw invalid projections before scheduling, and share at most one owned animation frame."

patterns-established:
  - "Withdraw first: clear and epoch-invalidate an unsafe binding before any frame or resolver can begin replacement work."
  - "Final tuple gate: repeat complete current-authority, semantic proof, connection, and viewport geometry checks after awaits and immediately before commit."

requirements-completed: [HUD-09]

duration: 20 min
completed: 2026-07-15
---

# Phase 53 Plan 02: Semantic Anchor Registry Summary

**Immutable semantic descriptors with withdraw-first DOM binding leases, full-tuple stale-work rejection, and deterministic virtualization/resource proofs**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-15T18:29:00Z
- **Completed:** 2026-07-15T18:49:04Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Built a deterministic same-node `file-A → file-B → file-A` fixture with detach, reorder, Range-like targets, mutable rectangles, reversed deferred resolvers, and a manual drainable frame queue.
- Implemented frozen exact-key descriptors and private binding leases whose epochs make row recycling and ABA reuse incapable of inheriting old authority.
- Proved synchronous withdrawal before frame/resolver work, complete async tuple gates, one-frame coalescing, bounded observation, and exact eleven-category zero after abort or repeated disposal.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the deterministic virtualization and resource-ownership proof surface** - `7319c5c9` (test)
2. **Task 2: Implement immutable descriptors and withdraw-first revocable bindings** - `cbc4b0e8` (feat)

## Files Created/Modified

- `extension/content/skopeo-anchor-registry.js` - Frozen descriptor normalizer, revocable binding registry, bounded observation, resource ownership, and final authority gate.
- `tests/fixtures/skopeo-semantic-anchor-fixture.js` - Manual virtualization, geometry, MutationObserver, event, frame, Range, and reversed-promise harness.
- `tests/skopeo-anchor-registry.test.js` - HUD-09 descriptor, wrong-row, ABA, stale-work, geometry, coalescing, hostile-input, abort, and teardown contract.
- `tests/helpers/skopeo-resource-ledger.js` - Reusable non-vacuous resource-transition and exact-zero assertions using the existing eleven categories.

## Decisions Made

- Kept resolver adapters trusted but bounded: they receive only frozen locator records, while the registry independently revalidates semantic identity, connection, and geometry twice before a projection commit.
- Treated same-document navigation as an immediate binding withdrawal signal without patching host history APIs.
- Kept live nodes and Ranges entirely out of descriptors and snapshots; only the private binding lease may retain the current adapter candidate.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first GREEN trace assertion counted the fixture's setup event before the signal boundary; it was corrected to assert validation and withdrawal ordering from the exact signal call. Production behavior was already withdraw-first.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The semantic-anchor authority boundary is ready for Phase 53 runtime and shell integration.
- Live Drive/Docs host evidence remains explicitly outside this synthetic contract; no live-app approval is claimed by this plan.

## Self-Check: PASSED

- All four task-owned files and this summary exist.
- Task commits `7319c5c9` and `cbc4b0e8` are present.
- The production contract and canonical ledger self-test pass after summary creation.

---
*Phase: 53-drive-context-router-semantic-anchors*
*Completed: 2026-07-15*
