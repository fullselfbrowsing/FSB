---
phase: 57-folder-reading-hud
plan: "01"
subsystem: ui
tags: [classic-javascript, closed-schema, deterministic-projection, drive, governing-truth]

requires:
  - phase: 54-permission-scoped-drive-corpus-boundary
    provides: Current manifest, vendor scope, source-state, and authorized-set contracts
  - phase: 55-chrome-local-graph-incremental-truth-foundation
    provides: Immutable graph records and exact owner, memo, and policy relations
  - phase: 56-governing-lineage-evidence-deadline-engine
    provides: Governing lineage, accepted typed dates, conflicts, facts, and citations
provides:
  - Frozen exact-key schema for folder, reading, and contract-closed HUD projections
  - Pure deterministic corpus/graph/truth projector with bounded vendor, date, and gap summaries
  - Evidence-only owner, absence, policy, memo, and downstream-neutral display semantics
affects: [57-02, 57-03, 57-04, 57-05, hud-runtime, adaptive-composer]

tech-stack:
  added: []
  patterns: [descriptor-safe parsing, null-prototype output, clone-then-freeze, opaque-identity ordering]

key-files:
  created:
    - extension/utils/skopeo-hud-schema.js
    - extension/utils/skopeo-hud-projector.js
    - tests/skopeo-hud-schema.test.js
    - tests/skopeo-hud-projector.test.js
  modified: []

key-decisions:
  - "Graph relations are admitted only when their provenance binding equals the originating record's exact source binding."
  - "Owner ambiguity is computed from stable owner record tokens; identical display labels never merge distinct owners."
  - "Date summaries sort by civil date, closed date-type precedence, then opaque vendor identity and report exact overflow."

patterns-established:
  - "Closed projection boundary: validate exact data descriptors, minimize authority, reparse through the public schema, then recursively freeze."
  - "Evidence-only display: incomplete inputs retain explicit partial source status but cannot publish governing, date, or absence conclusions."

requirements-completed: [VIEW-01, VIEW-02, VIEW-03]

duration: 21min
completed: 2026-08-12
---

# Phase 57 Plan 01: Closed HUD Projection Kernel Summary

**A descriptor-safe, recursively frozen folder/reading projection kernel that preserves exact governing evidence, typed dates, neutral downstream states, and bounded deterministic overflow.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-08-12T17:10:48Z
- **Completed:** 2026-08-12T17:32:14Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Fixed the complete versioned vocabulary, exact keys, state enums, safe-text rules, finite caps, byte ceiling, and recursive-freeze contract for folder, reading, and closed projections.
- Implemented a pure projector that joins only certified vendor scopes and exact truth source bindings while excluding storage, Chrome, DOM, clock, locale, network, raw source, and facade authority.
- Preserved all four material-date meanings and separate consequences with deterministic vendor/date/gap ordering and explicit 32/3/4/3/10/6 cap overflow semantics.
- Distinguished complete evidence from partial or ambiguous authority so missing finals, owner gaps, policy gaps, governing state, and dates cannot be inferred from incomplete inputs.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write controlled RED contracts for the closed schema and pure projector** - `1d5980ee` (test)
2. **Task 2: Implement exact frozen projection schemas and the pure projector kernel** - `660dad91` (feat)
3. **Task 3: Complete vendor ordering, typed-date selection, and evidence-only gap semantics** - `11d45127` (feat)

**Plan metadata:** committed with this summary

## Files Created/Modified

- `extension/utils/skopeo-hud-schema.js` - Closed classic/CommonJS schema, enums, caps, exact parser, null-prototype clone, and recursive freeze.
- `extension/utils/skopeo-hud-projector.js` - Pure folder/reading aggregation, authority validation, evidence joins, neutral partial states, and deterministic summaries.
- `tests/skopeo-hud-schema.test.js` - Controlled RED plus exact-key, descriptor, cap, byte, authority-leak, and immutability contracts.
- `tests/skopeo-hud-projector.test.js` - Complete/partial, typed-date, evidence-gap, identity, overflow, hostile-input, and permutation contracts.

## Decisions Made

- Relation evidence must carry the same exact source binding as its originating graph record; a valid binding borrowed from another source closes the whole projection.
- Owner assignment is keyed by stable graph record identity, not display label. Multiple distinct owner records remain ambiguous even when their labels match.
- Only accepted future civil dates participate in next-date selection. Summary ties use notice deadline, termination, expiration, renewal, then opaque vendor identity.
- Phase 58 memo obligations and Phase 59 notification outcomes remain first-class neutral slots rather than inferred missing or failed states.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first Task 2 implementation represented the public `LIMITS` map with a null prototype, while the controlled exact-interface contract requires an ordinary frozen public map. The focused test caught the mismatch and it was corrected before the Task 2 commit.

## Known Stubs

- `extension/utils/skopeo-hud-schema.js:62-63` and `extension/utils/skopeo-hud-projector.js:836-837,1043-1044` intentionally reserve `memoRequirement: not-evaluated` and `notificationDelivery: not-available`. These are closed neutral contract states owned by Phases 58 and 59, not missing Phase 57 behavior.

## Verification

- `node --check extension/utils/skopeo-hud-schema.js` — PASS
- `node --check extension/utils/skopeo-hud-projector.js` — PASS
- `node tests/skopeo-hud-schema.test.js` — PASS
- `node tests/skopeo-hud-projector.test.js` — PASS
- `node tests/skopeo-corpus-schema.test.js` — PASS
- `node tests/skopeo-capability-projection.test.js` — PASS
- `node tests/skopeo-truth-schema.test.js` — PASS
- `git diff --check` and forbidden runtime-authority scan — PASS

## TDD Gate Compliance

- RED gate: `1d5980ee` adds the controlled failing schema/projector contracts before production modules exist.
- GREEN gate: `660dad91` implements the schema and projector after RED.
- Semantic completion: `11d45127` hardens exact evidence identity and expands cap/tie-order coverage.

## User Setup Required

None - no external services, packages, or environment configuration are required.

## Next Phase Readiness

- Plans 57-02 through 57-05 can consume one closed versioned semantic model without duplicating corpus, graph, truth, or ordering logic.
- Legal/domain accuracy and authorized live Drive/Docs verification remain explicitly human-needed per `57-VALIDATION.md`; they do not block this structural projection contract.

## Self-Check: PASSED

- All four planned source/test artifacts and this summary exist in the isolated worktree.
- Task commits `1d5980ee`, `660dad91`, and `11d45127` are present in repository history.
- Focused schema and projector contracts passed again during closeout.

---
*Phase: 57-folder-reading-hud*
*Completed: 2026-08-12*
