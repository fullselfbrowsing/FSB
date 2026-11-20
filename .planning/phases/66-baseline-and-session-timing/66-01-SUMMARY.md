---
phase: 66-baseline-and-session-timing
plan: 01
subsystem: benchmark
tags: [benchmark, history-export, d-20, d-21, closed-not-executed]

# Dependency graph
requires: []
provides:
  - "scripts/bench/export-history.mjs, scripts/bench/history-export-snippet.js and tests/bench-export-history.test.mjs (Task 1 only; still in the root chain, 14 cases)"
  - "The gitignore rule for scripts/bench/.local/ (D-21), which 66-10 and 66-11 rely on for raw captures"
  - "No history metrics: scripts/bench/results/history-2026-09-16_21/metrics.json was never produced"
affects: [66-10, 66-11]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - scripts/bench/export-history.mjs
    - scripts/bench/history-export-snippet.js
    - tests/bench-export-history.test.mjs
    - tests/fixtures/bench/history-export-sample.json
  modified:
    - .gitignore

key-decisions:
  - "Closed 2026-10-12 without running H1 or Task 3. The 40 MCP sessions recorded 2026-09-16..21 were lost when the Web Store FSB was reinstalled on 2026-10-09, and no backup exists"
  - "The Task 1 code stays. It is tested, harmless, and works for any future export of the same shape"
  - "66-10 no longer depends on 66-01, and 66-11 no longer compares live call intervals with the history"

patterns-established: []

requirements-completed: []

# Metrics
duration: 0min
completed: 2026-10-12
---

# Phase 66 Plan 01: History Export (Closed, Not Executed) Summary

**Closed 2026-10-12: the source data was lost in the 2026-10-09 reinstall, so the plan was not executed. Task 1 (the export snippet, the sanitizing derivation and its test) shipped on 2026-09-30. The human export H1 and the metrics commit (Task 3) never ran. The 40 MCP sessions they were meant to save no longer exist in any Chrome profile on this machine.**

## What Was Done

- **Task 1 (shipped):**
  - `f406736b` test(66-01) added the failing test (RED).
  - `b4fe9d41` feat(66-01) added the code (GREEN):
    - the `scripts/bench/.local/` gitignore rule;
    - `export-history.mjs` (`deriveHistoryMetrics`, `assertNoLeak`, `HISTORY_METRICS_METHOD`);
    - the DevTools snippet;
    - the test and its fixture.
  - Plan 66-09 registered `tests/bench-export-history.test.mjs` in the root chain, where it passes 14 cases.
- **Task 2 (H1) and Task 3: not executed.**

## Why the Export Is Impossible

All checks were read-only, on 2026-10-09:

- **Fresh install in both profiles.** Chrome Default and Profile 2 both show the Web Store build (`badgafnfchcihdfnjneklogedcdkmjfk`, now 0.9.92) with `first_install_time` of 2026-10-09 around 15:58 UTC. An update keeps `chrome.storage.local`; a reinstall wipes it.
- **Empty stores.**
  - In both profiles, `fsbSessionIndex` is `[]` and `fsbSessionLogs` is `{}`.
  - Each extension-settings LevelDB holds only `MANIFEST-000001` and `000003.log`, so the store was created fresh.
  - The IndexedDB directories are about 20 KB each.
- **No copy anywhere.**
  - No extension storage in any profile, including the unpacked build in Profile 5, contains the session mode string `mcp-agent`.
  - `~/Downloads` holds no `fsb-history*` file.
  - Time Machine has no destination configured.
- The only remaining trace of those sessions is the pair of medians quoted in `PROJECT.md` (9.5 s per call with Claude, 4.6 s with Cursor). They can no longer be re-derived.

## Effect on the Phase

- **Phase 66 still meets its success criteria and requirements.** `66-01-PLAN.md` lists `metrics.json` as a must-have, but none of the four ROADMAP success criteria for Phase 66 and none of MEAS-01..03 mention the history. The ROADMAP success criteria take precedence over a plan's must-haves. The MEAS-03 baseline comes from the 66-11 campaign.
- **66-10** dropped 66-01 from `depends_on`.
- **66-11** dropped the history-versus-live call-interval comparison (W6). It still reports the live `callIntervalMs` median and p90.
- **The bench report's call-interval label** no longer names the 66-01 history, so the committed baseline will not point at an artifact that does not exist.
- **D-20 in 66-CONTEXT.md** has a dated amendment: the export part is superseded, and the save-each-run rule still applies.

## Deviations from Plan

The plan was closed instead of executed. Its human checkpoint became impossible when the source data was deleted outside the project.

## Issues Encountered

- The plan sent the operator to Chrome Profile 2. By 2026-10-07, though, Profile 2's Web Store slot was an empty stub, and the published build ran in Default. So the instruction had already gone stale before the reinstall.
- The `list_sessions` safety-net snapshot suggested in 66-RESEARCH.md was never taken.

## User Setup Required

None.

## Next Phase Readiness

- 66-10 is next. It has no dependency left on this plan.
- **Blockers:** none.

---
*Phase: 66-baseline-and-session-timing*
*Completed: 2026-10-12 (closed, not executed)*
