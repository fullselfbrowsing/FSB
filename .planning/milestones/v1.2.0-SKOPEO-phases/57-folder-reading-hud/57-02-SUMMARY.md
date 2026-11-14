---
phase: 57-folder-reading-hud
plan: "02"
subsystem: runtime
tags: [truth, exact-set, evaluation-context, deduplication, background-privacy]

requires:
  - phase: 57-01
    provides: Closed folder/reading HUD schema and deterministic truth projector input contract
  - phase: 56-04
    provides: Immutable active truth generations with metadata and family reads
  - phase: 56-05
    provides: Background-private truth engine, fresh exact-set authority, and stale withdrawal
provides:
  - Complete bounded active-generation truth display snapshots through an eighth private facade method
  - Fresh configured-IANA evaluation contexts derived from one injected clock read
  - Explicit controller-local truth inspection and exact-key recompute deduplication with abort fencing
affects: [57-03, 57-04, 57-05, hud-runtime, truth-evals]

tech-stack:
  added: []
  patterns: [metadata-authority sandwich, injected civil-date context, lexical facade accessor, exact-key in-flight deduplication]

key-files:
  created:
    - tests/skopeo-hud-runtime.test.js
  modified:
    - extension/utils/skopeo-truth-engine.js
    - extension/config/config.js
    - extension/background.js
    - tests/skopeo-truth-store.test.js
    - tests/skopeo-truth-runtime.test.js
    - tests/skopeo-truth-evals.test.js

key-decisions:
  - "Display truth is valid only when metadata, every sorted family, exact graph/source authority, and evaluation context remain identical across the complete read sandwich."
  - "The controller accesses truth through a narrow private boundary operation function; the raw eight-method facade remains lexical and is reset on closed boot."
  - "Evaluation settings bypass the general config cache at consequential use and are reread before a derived civil-date context can escape."
  - "Only explicit fact-missing or snapshot-stale readiness may recompute; every other blocker stays closed without provider work."

patterns-established:
  - "Whole-result display admission: a missing, corrupt, replaced, stale, 33-family, or 64-KiB-plus-one input returns one blocker and no family prefix."
  - "Explicit truth readiness: key work by controller tuple, semantic entity, and context digest; clear it on settle, replacement, route change, abort, or tab removal."

requirements-completed: [VIEW-01, VIEW-02, VIEW-03, VIEW-05]

duration: 31 min
completed: 2026-08-12
---

# Phase 57 Plan 02: Private Truth Display and Evaluation Context Summary

**One complete current truth generation can now be inspected through a bounded background-private snapshot, under a fresh explicitly configured civil date, with exact explicit recomputation deduplicated and fenced to the live Skopeo controller.**

## Performance

- **Duration:** 31 min
- **Started:** 2026-08-12T17:39:25Z
- **Completed:** 2026-08-12T18:10:15Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added `inspectDisplaySnapshot` as the exact eighth frozen truth-facade method, composed only from the existing `inspectMetadata` and `readActiveFamily` store APIs.
- Enforced complete sorted generation membership, exact source/graph/version/context bindings, before/after metadata and authority equality, 32-family and 64-KiB caps, stale withdrawal, and whole-result failure with no usable prefix.
- Added default-closed timezone/calendar configuration and a dependency-injected builder that derives `YYYY-MM-DD` only with `Intl.DateTimeFormat(...).formatToParts()` in an explicit configured IANA timezone.
- Kept the truth facade module-lexical behind a narrow private operation seam and added the private `ensureCurrentHudTruthDisplaySnapshot` helper with exact tuple/entity/context-digest deduplication, replacement/abort fencing, and zero passive caller.
- Added production-shaped runtime tests for civil-date rollover, fresh configuration rechecks, exact and distinct-context concurrency, stale replacement, blockers, privacy, and aggregate compatibility.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write controlled RED complete-snapshot and evaluation-context runtime contracts** - `218fb64a` (test)
2. **Task 2: Implement the private complete truth display snapshot** - `840e53ec` (feat)
3. **Task 3: Build exact evaluation context and deduplicated explicit recomputation** - `99559899` (feat)

**Plan metadata:** committed with this summary

## Files Created/Modified

- `extension/utils/skopeo-truth-engine.js` - Complete-generation display metadata parsing, family minimization, authority/context sandwich, caps, stale withdrawal, and eighth facade method.
- `extension/config/config.js` - Default-closed truth timezone/calendar keys and a narrow fresh consequential settings read.
- `extension/background.js` - Injected evaluation-context builder, lexical truth facade lifecycle, narrow private truth operations, and controller-local exact-key readiness deduplication.
- `tests/skopeo-truth-store.test.js` - Existing-store composition proof for complete reads, missing members, and generation replacement.
- `tests/skopeo-truth-runtime.test.js` - Exact eight-method facade, complete display result, 32/33-family boundary, 64-KiB max-plus-one, missing member, and stale withdrawal coverage.
- `tests/skopeo-hud-runtime.test.js` - Controlled RED plus context, privacy, passive-zero, dedupe, blocker, distinct-digest, and abort/replacement contracts.
- `tests/skopeo-truth-evals.test.js` - Aggregate exact-facade assertion updated from seven to eight methods.

## Decisions Made

- The truth store surface remains unchanged. Complete display reads are an engine responsibility over the existing active-generation metadata and exact family-read primitives.
- Metadata that lists more than 32 families is rejected before any family read. A missing or replaced listed member is stale authority, is withdrawn, and never degrades to a prefix.
- General cached configuration cannot authorize deadline meaning. The builder reads only the two truth settings directly at consequential use and requires them to remain canonically identical before return.
- The raw facade never enters controller exports, content messages, MCP dispatch, globals, or serialized results. The controller can request only private inspect-display or recompute operations through the marked trusted boundary.
- No passive lifecycle function calls the readiness helper; Plan 57-03 owns the first explicit projection request.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated the Phase 56 aggregate facade pin**
- **Found during:** Task 3 full truth aggregate
- **Issue:** `tests/skopeo-truth-evals.test.js` still required the prior exact seven-method facade, blocking the planned exact-eight interface.
- **Fix:** Added `inspectDisplaySnapshot` to that exact aggregate expectation and updated its description to eight methods.
- **Files modified:** `tests/skopeo-truth-evals.test.js`
- **Commit:** `99559899`

## Issues Encountered

- A legacy source-extraction test locates the injection array with the first literal `]);` in `background.js`. The private builder uses equivalent classic-script formatting that avoids introducing that delimiter before the existing controller marker, preserving the established harness without weakening it.

## Known Stubs

None. The `null` timezone binding and empty calendar list are intentional default-closed configuration, not UI data placeholders; missing configuration returns typed blockers and starts no truth/provider work.

## Verification

- `node --check extension/config/config.js` - PASS
- `node --check extension/background.js` - PASS
- `node --check extension/utils/skopeo-truth-engine.js` - PASS
- `node tests/skopeo-truth-store.test.js` - PASS
- `node tests/skopeo-truth-runtime.test.js` - PASS
- `node tests/skopeo-hud-runtime.test.js` - PASS
- `npm run test:skopeo-truth-evals` - PASS
- `node tests/skopeo-corpus-runtime.test.js` - PASS
- `node scripts/verify-skopeo-storage-boundary.mjs` - PASS, 32 injected/dependency files checked
- `git diff --check` - PASS

## TDD Gate Compliance

- RED gate: `218fb64a` adds the controlled absent-seam contract and passes only with the exact single RED marker before production implementation.
- GREEN gate: `840e53ec` implements complete display inspection after RED.
- Integration completion: `99559899` adds fresh evaluation context and explicit deduplicated controller orchestration after the display facade exists.

## User Setup Required

An explicit valid `skopeoTruthTimezoneBinding` is required before truth evaluation can run. This plan intentionally adds no settings UI and never invents a browser or UTC fallback; until configured, the runtime returns `timezone-missing`.

## Next Phase Readiness

- Plan 57-03 can call the private readiness helper only from its exact current projection request, then pass the complete snapshot through the Plan 01 projector and authorize cited-source actions.
- Plans 57-04 and 57-05 can consume only the later closed projection; raw truth/store/provider authority remains unavailable to content and the shell.
- Legal/domain accuracy and authorized live Drive/Docs validation remain explicitly human-needed under `57-VALIDATION.md`.

## Self-Check: PASSED

- All seven source/test artifacts and this summary exist in the isolated worktree.
- Task commits `218fb64a`, `840e53ec`, and `99559899` are present in repository history.
- The focused, aggregate, corpus-regression, and unchanged storage-boundary gates passed during closeout.

---
*Phase: 57-folder-reading-hud*
*Completed: 2026-08-12*
