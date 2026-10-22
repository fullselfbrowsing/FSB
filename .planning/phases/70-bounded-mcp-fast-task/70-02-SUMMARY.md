---
phase: 70-bounded-mcp-fast-task
plan: 02
subsystem: fast-mode
tags: [run_task, jev, fast-mode, budgets, mcp, d-05-inversion, parity]

# Dependency graph
requires:
  - phase: 70-bounded-mcp-fast-task
    provides: "70-01: 70-SYNC-RECHECK.md (items a, b, g, h, s and Drift substitutions), 70-SWEEP-BASELINE.json, the upstream tripwire"
  - phase: 68-autopilot-fast-mode
    provides: FsbFastPath, fsbFastModeSessionField, the loop harness, the fake gateway
provides:
  - "FsbFastPath.BUDGET_PROFILES (frozen autopilot and run_task profiles), budgetsFor(session), budgetProfileName(session); every budget read goes through budgetsFor"
  - "fsbFastModeSessionField(true, 'mcp') -> {enabled:true, stored:true, source:'mcp', budgetProfile:'run_task'}; every non-MCP input unchanged"
  - "The Phase 68 'run_task is never fast' cases inverted (never deleted) and run_task parity suites at module and loop level"
affects: [70-03, 70-04, 70-05, 70-06, 70-07, 70-08, 71]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parity by twin runs: every run_task case runs the same script under the autopilot field and deep-equals the two traces, with wall-clock fields (actionHistory timestamp/durationMs, measurement latencyMs/jevMs) nulled or a fixed clock injected"
    - "Selection proven by mutation: a vm copy of jev-fast-path.js with run_task maxSteps 2 shows the run_task field latches at its own profile while autopilot keeps 12"

key-files:
  created: []
  modified:
    - extension/ai/jev-fast-path.js
    - extension/background.js
    - tests/jev-fast-path.test.js
    - tests/jev-fast-start-path.test.js
    - tests/jev-fast-loop.test.js

key-decisions:
  - "run_task profile is written as literals (12, 16, 20000, 3, 3, basis 'uncalibrated'); the autopilot profile reads the five constants; both frozen, sibling api export (constants untouched)"
  - "budgetsFor is an own-property lookup of session.fastMode.budgetProfile in BUDGET_PROFILES (hasOwn), so '__proto__', 'constructor', 'toString' and any unknown or non-string name get the autopilot profile; the module never reads fastMode.source"
  - "The 68-08 capture-mechanics cases that only used the disabled field as a capture-only rig keep running on it under the honest name CAPTURE_ONLY_FIELD; the two run_task claims of 68-08-PLAN.md:108-109 (captured but never decides; unarmed gate cost) are inverted to run_task-vs-autopilot comparisons"
  - "The JSDoc above fsbFastModeSessionField (background.js:4002-4010) is left as is because the plan's acceptance criterion allows no other removed line in background.js; an in-function comment states that D-04 supersedes its D-03 sentence (deferred item 1)"
  - "MCP-03 is advanced, not completed, by this plan; it is met only at the Phase 70 gate"

patterns-established:
  - "driveCommand(field, script) and transcriptOf(run) in tests/jev-fast-path.test.js: drive one command with an LLM turn after every decline and compare transcripts across fields"
  - "parityLoopRun(field, opts, n) in tests/jev-fast-loop.test.js: loopRun under a given field (new optional loopRun `field` option, default FAST_FIELD), with the fast call's real toolResult captured by an afterStep wrap"
  - "buildEndToEnd(fieldOf) / endToEndTrace(fieldOf) in tests/jev-fast-start-path.test.js: the capture end-to-end rig under any helper-built field, with the fake uncalibrated gateway as decide client"

requirements-completed: []  # MCP-03 is advanced here and met only at the Phase 70 gate plan
requirements-advanced: [MCP-03]

# Metrics
duration: ~25min
completed: 2026-10-18
---

# Phase 70 Plan 02: run_task joins the fast path with its own frozen budget profile Summary

**`fsbFastModeSessionField(true, 'mcp')` now returns `{enabled:true, stored:true, source:'mcp', budgetProfile:'run_task'}`, FsbFastPath enforces every budget through `budgetsFor(session)` over a frozen `BUDGET_PROFILES.run_task` equal to autopilot's (12 steps, 16 calls, 20,000 ms, 3 consecutive, latch 3, uncalibrated). The Phase 68 "run_task is never fast" tests are inverted, and every 68 fallback, escalate-once, risk and permission guarantee is re-proven under the run_task field to equal the autopilot field.**

## Performance

- **Duration:** ~25 min of execution (start 2026-10-18T21:51:29Z, last task commit 22:10:48Z, wave-check fix ~22:20Z)
- **Started:** 2026-10-18T21:51:29Z
- **Completed:** 2026-10-18
- **Tasks:** 3 of 3, plus one wave-check `fix(70-02)` commit
- **Files modified:** 5

## Accomplishments

- **Task 1:** `BUDGET_PROFILES`, `budgetsFor`, `budgetProfileName` in `extension/ai/jev-fast-path.js` (`:73-90`, `:1146-1162`). `budgetReason`, step g (consecutive cap), step h (budgets), step q (time left and decide deadline), step t (`applyEscalation`) and `afterStep`'s escalation latch all read the profile. `attemptStep` and `afterStep` each compute `budgetsFor(session)` once. The five FAST_* names now appear only in the `constants` literal and in `BUDGET_PROFILES.autopilot` (2 occurrences each). `constants` is byte-identical.
- **Task 2:** `extension/background.js` `fsbFastModeSessionField` replaces the one 68 line `return { enabled: from !== 'mcp', stored: true, source: from };` with the MCP branch plus the plain non-MCP return (`:4017-4018`). It is the only removed line in background.js, and with the helper cut out (brace matcher) background.js is identical to `9760759b`. In the same commit the 68 cases are inverted (table below).
- **Task 3:** run_task parity at module level (all 19 fallback reasons through the real `FsbJevClient`, the uncalibrated latch, switch off mid-run) and in the real loop (an uncertain fast click dispatched once, for both the unknown-outcome and bfCache shapes; risk-excluded and not-fast-eligible picks never act; a permission denial still blocks). Every case equals the autopilot-field run.

## The run_task profile

| Key | run_task (literal) | autopilot (reads) |
| --- | --- | --- |
| maxSteps | 12 | `constants.FAST_MAX_STEPS` (12) |
| maxCalls | 16 | `constants.FAST_MAX_CALLS` (16) |
| wallBudgetMs | 20000 | `constants.FAST_WALL_BUDGET_MS` (20000) |
| maxConsecutive | 3 | `constants.FAST_MAX_CONSECUTIVE` (3) |
| escalationLatch | 3 | `constants.FAST_ESCALATION_LATCH` (3) |
| basis | 'uncalibrated' | 'uncalibrated' |

The decide deadline stays `min(decideTimeoutLimit(), remaining)`, where `decideTimeoutLimit()` is `FsbJevClient.DEFAULT_TIMEOUT_MS` (2500). Proven: 2500 with no time used, 1500 with 18,500 ms used, and every deadline in a full time-budget drive is at most 2500 (the last one is 1000).

## Budget-latch reason codes as implemented

| Budget | Code | Where it lives | Effect |
| --- | --- | --- | --- |
| steps | `step_budget` | `agentState.jevFast.latched` (command latch) | rest of the command (= the whole run_task) is LLM-only |
| Jev calls | `call_budget` | command latch | same |
| menu-plus-Jev time | `time_budget` | command latch (step h, and step q when no time is left) | same |
| consecutive fast steps | `consecutive_cap` | a decline, not a latch | lifts after the next LLM turn (`observeTools`) |
| escalation run | `escalation_latch` | command latch (`applyEscalation` and `afterStep`) | rest of the command is LLM-only |

In every case `session.status` stays `'running'` and no terminal is produced (D-10). This is proven for each budget by driving the real module to exhaustion: 12 acted steps; 16 decides (8 acts, 8 escalations); 20,000 ms from 10 attempts at 1000+1000 ms; 3 escalations from decisions and 3 counted by `afterStep`.

## Inverted Phase 68 cases (D-05; edited in place, never deleted)

| Old (file:line at P70_START) | New (file:line at HEAD) |
| --- | --- |
| `tests/jev-fast-start-path.test.js:221-222` "(true, "mcp") -> {enabled:false, ...} (run_task never fast-steps)" | `:233-235` "(true, "mcp") -> {enabled:true, stored:true, source:"mcp", budgetProfile:"run_task"}, keys in that order ..." plus new null cases (`:240-242`) and the non-MCP Phase 68 table (`:243-248`) |
| `tests/jev-fast-start-path.test.js:444-448` "a run_task follow-up gets enabled:false" | `:466-472` "a follow-up with source "mcp" gets the same run_task field as a start (Phase 70 D-04)" |
| `tests/jev-fast-start-path.test.js:984-992` capture e2e with hand-built `{enabled:false, stored:true, source:'mcp'}` | `:1079-1130`: the real helper field; first iteration `first_llm_turn` with a capture; second iteration's one fast attempt (uncalibrated latch). New section `:1133` "run_task capture equals autopilot" |
| `tests/jev-fast-start-path.test.js:12` header (enabled:false) | header now describes the D-04 field |
| `tests/jev-fast-loop.test.js:611-637` `runTaskCase` "run_task: fastMode {enabled:false, source:"mcp"} stays on the golden path ..." | `:627-693`: section "run_task takes an accepted fast step" (real helper field, iterations 1/2/3 as planned, equal to the autopilot run) plus new section "run_task switch off" (`(false,'mcp')` and `(undefined,'mcp')` equal the off golden) |
| `tests/jev-fast-loop.test.js:36`, `:62` header bullets | rewritten to the new truth |
| `tests/jev-fast-path.test.js:1377-1400` `orchNotEnabled` "a run_task session declines not_enabled at iteration i" | `:1384-1399` "hand-built disabled field declines not_enabled at iteration i" (behavior unchanged); section renamed |
| `tests/jev-fast-path.test.js:2559-2570` `captureNoCaptureDeps` "... make no call for a run_task session" | `:2576-2593` real run_task field, "... make no call on a run_task session's first turn", plus "run_task capture equals autopilot" twin check |
| `tests/jev-fast-path.test.js:2572-2592` `captureRunTask` "a run_task session still declines not_enabled" / "never asks Jev" / "never calls decide" | `:2601-2648` `armedCaptureRun` + `captureRunTask`: first turn captured; the next turn makes one fast attempt (capture:true menu, one decide, uncalibrated latch); "run_task capture equals autopilot" |
| `tests/jev-fast-path.test.js:2594-2611` `captureGateCost` unarmed run_task part "... makes no tab, switch, menu, snapshot or decide call" | `:2650-2701` `unarmedCommandsRun` + `captureGateCost`: one arm read per command, then logs identical to autopilot (one fast attempt, then the uncalibrated latch) |
| `tests/jev-fast-path.test.js:2458` `RUN_TASK_FIELD` used by the capture-mechanics cases | renamed `CAPTURE_ONLY_FIELD` (`:2471`, same value, documented as hand-built) for `labelOf`, `captureGateRules`, `captureLabels`, `captureRecordShape`, `captureMenuDrops`, `captureObservationShape`, `captureNeverRejects` and the armed/bench parts of `captureGateCost` |

Kept as they are: the switch-off golden (`tests/fixtures/jev-fast-loop-off-golden.json` unchanged; runs A/B/C pass) and the 68-05 `not_enabled` module case (renamed). The check-count criterion holds: 24 `check(` lines removed and 48 added across the three suites in the Task 2 commit.

## Task Commits

1. **Task 1: A frozen run_task budget profile and profile-driven budget reads** - `9760759b` (feat)
2. **Task 2: Widen fsbFastModeSessionField and invert the Phase 68 "never fast" tests** - `6c429098` (feat)
3. **Task 3: run_task fallback, escalate-once, risk and permission parity** - `29eb7edb` (test)
4. **Wave-check fix (completes `6c429098`)** - `c36157c2` (fix): null actionHistory `durationMs` in the accepted-step parity check

## Per-task `<automated>` wall times (Node v24.14.1)

- Task 1 verify (5 suites + 2 greps): 0.96 s
- Task 2 verify (5 suites): 0.88 s
- Task 3 verify (4 suites): 0.80 s

## Wave check (`<verification>`), ~33 s

- `npm run validate:extension`: exit 0
- `node tests/lattice-provider-bridge-smoke.test.js`, `node tests/mcp-version-parity.test.js`, `node tests/mcp-bridge-background-dispatch.test.js`, `node --test tests/bench-drivers.test.mjs tests/bench-identity.test.mjs`: all exit 0
- `npx --offline -y node@20` (v20.20.2) on `jev-fast-path`, `jev-fast-start-path`, `jev-fast-loop`: the first run failed one check in `jev-fast-loop`, the accepted-step parity check. The loop's actionHistory `durationMs` is wall clock. Fixed in `c36157c2`; after it, 45/45 loop runs across Node 24, the official Node 20.20.2 binary and `npx node@20`, and 16/16 runs each of the other two suites on both Node 20 builds, all pass.
- Official Node 20.20.2 (`/tmp/fsb-node20/...`): jev-fast-path, jev-fast-start-path, jev-fast-loop, the tripwire, tighten-only and the boundary suite all exit 0.
- Regression sweep (`node scripts/bench/sweep-tests.mjs --files extension/background.js extension/ai/jev-fast-path.js --baseline .../70-SWEEP-BASELINE.json`, run before the Task 2 commit, Node 24; port 7225 held by the user's hub as at baseline, left untouched): **98/98 passed, no new failures vs baseline, exit 0**. `git status --short showcase/angular/public` printed nothing.
- `git diff --quiet 3f7efb0a -- mcp/ extension/ai/agent-loop.js extension/ai/tool-definitions.js extension/ui/`: exit 0. `tests/jev-policy-tighten-only.test.js` and `tests/fixtures/` are unedited.

## Decisions Made

See key-decisions in the frontmatter. In addition:
- The fallback-parity cases drive the real `FsbJevClient` through the fake gateway for all 19 reasons. 17 come from the contract status plus `fallbackBody(reason)`, `network_error` from a transport error, and `aborted` from `abortInFlight` during the decide while the session keeps running. Each reason is checked twice: after a calibrated answer (its `classifyFallback` scope: session, command or iteration) and before one (a session latch, WR-04). Each check also confirms that the client really returned that reason (`jevMeasurement.attempts[].fallback`).
- The start-path capture e2e now loads `jev-policy.js` and injects the fake uncalibrated gateway as `deps.jevClient`, so the run_task session's second iteration behaves as it would ship today (one decide, `not_calibrated` latch). Without it, the run would latch `unavailable` because no client is reachable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The capture e2e sandbox lacked a service-worker global**
- **Found during:** Task 2
- **Issue:** With the real run_task field, the e2e's second iteration reaches `FsbJevState.buildRequest`, which needs `TextEncoder`. The vm sandbox did not provide it (the old enabled:false session never got that far), so the attempt latched `exception`.
- **Fix:** Added `TextEncoder` to the sandbox globals, loaded `jev-policy.js` and injected the fake uncalibrated client (see Decisions).
- **Files modified:** tests/jev-fast-start-path.test.js
- **Commit:** 6c429098

**2. [Rule 1 - Test bug] Parity traces included wall-clock values**
- **Found during:** Task 2 (stability runs) and the wave check
- **Issue:** The run_task and autopilot traces differed only in wall-clock fields: actionHistory `timestamp`/`durationMs`, and `jevMeasurement` `latencyMs`/`jevMs`, which come from the harness's own clients and Date.now deps.
- **Fix:** The start-path traces use a fixed clock for both the deps and the fake client. The loop's accepted-step parity nulls those four fields. The Task 3 loop parity runs use a fixed clock (`PARITY_CLOCK`). No assertion was loosened beyond the wall-clock fields.
- **Files modified:** tests/jev-fast-start-path.test.js, tests/jev-fast-loop.test.js
- **Commits:** 6c429098, c36157c2

**3. [Rule 1 - Test bug] Task 3 first read the fast step's result from actionHistory**
- **Found during:** Task 3
- **Issue:** The loop's actionHistory keeps only an abridged `{success, hadEffect, error}` record, so a nested-shape check on it failed. This is a test bug under the plan's fixture-shape bullet, not a module defect.
- **Fix:** `parityLoopRun` wraps `afterStep`, the same way the 68 permission-denial case does, to capture the executor's real `toolResult`. It asserts `{success:false, result:{outcome:'unknown', mayHaveExecuted:true}}` and `{success:true, result:{bfCacheDetected:true, currentUrl}}`, plus `stepOutcome === 'uncertain'`.
- **Files modified:** tests/jev-fast-loop.test.js
- **Commit:** 29eb7edb

### Additions beyond the plan (strengthening, no scope change)

- Task 1 "budgetsFor drives enforcement": a mutated vm copy proves the run_task field is enforced by its own profile. Equal values would otherwise make the parity checks unable to tell the two profiles apart. The "no direct budget read" check also proves `attemptStep`/`afterStep` compute `budgetsFor(session)` exactly once and that `budgetReason`/`applyEscalation` read no FAST_* constant.
- Task 2 source pins: `handleStartAutomation` names `fsbJevFastModeEnabled` exactly 3 times (unchanged); a SHA-256 pin of `fsbRecomputeFastModeForFollowUp` at P70_START (`bb06f1ff...`); `budgetProfile` appears once in background.js, inside the helper.
- `loopRun` gained an optional `field` option (default `FAST_FIELD`; no existing caller changed). The harness file is untouched.
- Two stale comments in `jev-fast-path.js` (the beforeTurn doc's "(run_task, D-03)" and the capture note "run_task sessions, whose fastMode.enabled is false") were reworded in Task 1 so they are true both before and after D-04.

## Defects found in Task 3

None. Every Task 3 case passed on the Task 1-2 code once its fixture shape was right (deviation 3). `extension/ai/jev-fast-path.js` was not touched in Task 3.

## TDD Gate Compliance

This is a `type: execute` plan whose tasks are `tdd="true"`. Each task prescribes one commit, so there is no separate `test(...)`/`feat(...)` pair. RED was observed before every implementation step:
- Task 1: 5 failures (`BUDGET_PROFILES`/`budgetsFor` missing, the literal not found, the static cut).
- Task 2: 9 failures in jev-fast-start-path and 6 in jev-fast-loop before the background.js edit. The module-level inversions in jev-fast-path passed already, because they use the literal field the module has honored since Task 1.
- Task 3 is test-only and was meant to pass on the Task 1-2 code (D-06).

## Known Stubs

None.

## Deferred items (out of scope, logged in deferred-items.md)

1. `extension/background.js:4002-4010`: the JSDoc of `fsbFastModeSessionField` still says a run_task start "carries enabled:false and never takes a fast step (D-03)", and its `@returns` type omits `budgetProfile`. The 70-02 acceptance criterion permits no other removed line in background.js, so an in-function comment (`:4014-4016`) states that D-04 supersedes it. Update the JSDoc in a later Phase 70 commit and run the background.js pin bundle with it.
2. `tests/jev-fast-capture.test.mjs:6,122,150` still call a hand-built `{enabled:false, stored:true, source:'mcp'}` session "a run_task bench session". The suite stays green (capture keys on the page), but the wording is stale after D-04, and the file is outside the 70-02 file list.

## Deferred to Validation Block

- Deferred: M-70-03 (V3), M-70-04 (V4), M-70-05 (V5), M-70-08 (V6).
  - M-70-03 (V3): a calibrated profile makes the run_task path act; revisit both profiles' numbers (both are `basis: 'uncalibrated'`).
  - M-70-04 (V4): switched-on overhead and budget-exhaustion counts.
  - M-70-05 (V5): a real host run with the switch on.
  - M-70-08 (V6): the MCP-enable consent review (release blocker for MCP-started transfers, D-07).

## Threat Flags

None. No new endpoint, storage key, message or wire field. T-70-07 (switch-off run_task) and T-70-08 (budgets and UNCALIBRATED) are mitigated as planned, and T-70-06 (duplicate side effect) is re-proven under the run_task field.

## Next Phase Readiness

- 70-03 can register its evidence handlers knowing that a run_task session now carries `fastMode` (the real helper field) and takes fast steps. Its static checks must keep "no direct budget read" and "no fastMode.source" green.
- Still open for the orchestrator: PD-70-03 (70-SYNC-RECHECK Drift substitution 9) before 70-03 Task 1 commits.

---
*Phase: 70-bounded-mcp-fast-task*
*Completed: 2026-10-18*

## Self-Check: PASSED

All five modified source/test files, this SUMMARY and deferred-items.md exist; commits 9760759b, 6c429098, 29eb7edb and c36157c2 exist on Jev; no commit message carries AI attribution; nothing was pushed; STATE.md, ROADMAP.md and REQUIREMENTS.md were not touched.
