---
phase: 70-bounded-mcp-fast-task
plan: 01
subsystem: testing
tags: [run_task, mcp-bridge, jev, fast-mode, golden, tripwire, sync-recheck]

# Dependency graph
requires:
  - phase: 66.1-mcp-settings-tool
    provides: the MCP settings tool that can flip the fast-mode switch (66.1-08 gate)
  - phase: 67-hosted-jev-gateway-policy-and-shadow-mode
    provides: FsbJevState (buildRequest, scrubText, matchesSecret, toOriginPath, CONTRACT)
  - phase: 68-autopilot-fast-mode
    provides: FsbFastPath, fsbFastModeSessionField, the loop harness, fake gateway, disclosure fixture, capture exporter
  - phase: 69-mcp-descriptions-and-same-call-checks
    provides: tests/helpers/mcp-in-process.mjs, the tools/list shape freeze, the mapFSBError success passthrough
provides:
  - "70-SYNC-RECHECK.md: P70_START, the interface table (items a-m), measured facts (n-u), 14 Drift substitutions and the For Phase 71 note"
  - "70-SWEEP-BASELINE.json: pre-edit regression sweep over the four files Phase 70 edits (110/110 pass)"
  - "tests/jev-run-task-upstream-contract.test.js: registered tripwire over every 67/68/69 interface Phase 70 consumes (87 checks)"
  - "tests/fixtures/run-task-wire-golden.json: switch-off run_task settle values, wire texts, store writes and first heartbeat, captured from the unedited bridge"
  - "tests/run-task-fast-mode-wire.test.js: vm bridge harness (buildWireHarness, runSettlePath, makeSeededSession, message constants) with 5 settle paths x 4 variants against the golden"
affects: [70-02, 70-03, 70-04, 70-05, 70-06, 70-07, 70-08, 71]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Golden captured once from unedited code by a /tmp one-off script that requires the suite's exported harness (module.exports guarded by require.main !== module)"
    - "Cross-realm structural comparison (plainEqual) for vm values, plus a byte-for-byte wire-text check that also pins key order"

key-files:
  created:
    - .planning/phases/70-bounded-mcp-fast-task/70-SYNC-RECHECK.md
    - .planning/phases/70-bounded-mcp-fast-task/70-SWEEP-BASELINE.json
    - tests/jev-run-task-upstream-contract.test.js
    - tests/fixtures/run-task-wire-golden.json
    - tests/run-task-fast-mode-wire.test.js
  modified:
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "P70_START = 3f7efb0ac7aae5607b97f0e5c3b26f41733a3e8e; no upstream interface is MISSING, so Phase 70 proceeds"
  - "The golden's wire passthrough is checked byte-for-byte for every variant (not only V2), so a key-order change on the wire also fails"
  - "Drift substitution 9 proposes PD-70-03 (narrow the two 'no terminal tool name in jev-fast-path.js' pins to outside one marker-bounded Phase 70 section); it needs orchestrator acceptance before 70-03 Task 1 commits"
  - "MCP-03 is advanced, not completed, by this plan; it is met only at the Phase 70 gate"

patterns-established:
  - "makeSeededSession(extra): switch-off base is {} (no fastMode, no heartbeat-read field); 70-06 builds switch-on sessions with makeSeededSession({fastMode: ...})"
  - "Settle-path message constants (COMPLETE_MESSAGE, ERROR_MESSAGE, STOP_MESSAGE) mirror agent-loop notifySidepanel and background handleStopAutomation field for field"

requirements-completed: []  # MCP-03 (plan requirement) is advanced here and met only at the Phase 70 gate plan
requirements-advanced: [MCP-03]

# Metrics
duration: ~20min of execution across two sessions (Tasks 1-2 on 2026-10-17, Task 3 on 2026-10-18)
completed: 2026-10-18
---

# Phase 70 Plan 01: Upstream sync re-check, tripwire and switch-off run_task wire golden Summary

**Phase 70 opens on verified upstream code: P70_START `3f7efb0a`, a 110/110 pre-edit sweep, a registered 87-check tripwire over every 67/68/69 interface Phase 70 consumes, and a switch-off `run_task` wire golden (5 settle paths, values, MCP wire text, 22 store writes on the safety net, first heartbeat) captured from the unedited bridge and proven under 4 variants.**

## Performance

- **Duration:** Tasks 1-2 2026-10-17 (commits 09:00-09:07 -05:00, sweep 13:44:39Z-13:46:48Z); Task 3 2026-10-18 (~15 min)
- **Started:** 2026-10-17 (previous attempt; Tasks 1-2)
- **Completed:** 2026-10-18T16:45:46-05:00 (Task 3 commit)
- **Tasks:** 3 of 3
- **Files created/modified:** 7

This run continued a previous attempt: `git log` already held the Task 1 and Task 2 commits, which were re-verified (every Task 1 and Task 2 acceptance criterion passes) and not redone.

## P70_START and the sweep baseline

- `P70_START=3f7efb0ac7aae5607b97f0e5c3b26f41733a3e8e` (first line of 70-SYNC-RECHECK.md; also `p70Start` in the golden).
- Upstream gates present: 66.1-08, 67-13, 68-11 (68-12 also present; 68-11 is the gate) and 69-08 SUMMARY files; the porcelain check on extension/tests/package.json/scripts/showcase/mcp was clean.
- Sweep baseline (`scripts/bench/sweep-tests.mjs` over extension/background.js, extension/ws/mcp-bridge-client.js, extension/ai/jev-fast-path.js, scripts/bench/run-bench.mjs; Node v24.14.1): **110 of 110 selected tests passed, exit 0, `failures: []`. No pre-existing failure to record.** The last commit touching extension/ or run-bench.mjs (`b608f8d3`) is an ancestor of P70_START, so the baseline predates every Phase 70 edit.

## Accomplishments

- 70-SYNC-RECHECK.md: an interface table (43 rows, no MISSING) plus items a-u with file:line evidence, 14 Drift substitutions and a For Phase 71 note.
- `tests/jev-run-task-upstream-contract.test.js` (87 checks) fails with `upstream drift: <name> -- update 70-SYNC-RECHECK.md and the Phase 70 plans; never weaken the upstream test` on any consumed-interface drift.
- `tests/fixtures/run-task-wire-golden.json` captured once from the unedited bridge (`npm --prefix mcp run build` first; `mapFSBError({success:true, ...value}).content[0].text` from mcp/build/errors.js for each wire text).
- `tests/run-task-fast-mode-wire.test.js` (39 checks): 20 "switch-off golden" checks (5 paths x V1-V4), 5 "wire passthrough", 5 "json safe", 4 "heartbeat unchanged", "seed has no heartbeat-read field", 4 fixture-shape checks, and an empty "switch-on cases (plan 70-06)" section.

## Task Commits

1. **Task 1: Preconditions, P70_START, sweep baseline and the interface table (a-m)** - `65a60e6a` (docs)
2. **Task 2: Measured facts (n-u), Drift substitutions, For Phase 71** - `a0d9a669` (docs); **upstream tripwire + registration** - `f5add9c8` (test)
3. **Task 3: Switch-off run_task wire golden and the bridge-harness suite** - `c20081f5` (test) - **the golden's commit**

## Drift substitutions (every RENAMED/CHANGED item, 70-SYNC-RECHECK item t)

| # | Item | Status | Substitution later plans use |
| --- | --- | --- | --- |
| 1 | beforeTurn steps a-v | RENAMED | Steps a-u live in `attemptStep(session, ctx, capture)` (`jev-fast-path.js:1307-1509`, context `c`, `iteration` at :1387); step v is `deliverPending(session, deps, reason)` (:1172-1208), delivered-snapshot condition :1191. Step g :1328, h :1329-1330 (`budgetReason` :1112-1117), o :1378-1385, q :1404-1405/:1411, t :1476-1479 (`applyEscalation` :1241-1251), u :1481-1499. |
| 2 | `constants` key set | pinned (A2 false) | `tests/jev-fast-path.test.js:295` deep-equals the 19 keys; 70-02 adds profiles as a sibling export (e.g. `BUDGET_PROFILES`), never in `constants`. Export list itself is not pinned. |
| 3 | `classifyStepEvidence` | CHANGED | `uncertain` has two reasons: `uncertain` (D-14(a) signals) and `dispatch_unconfirmed` (non-object result, or a failure with a null nested result other than the two denial texts). 70-03 keeps its "any `uncertain`" bullet (tighten-only); false-ambiguous rate is a V4 watch item (M-70-04). |
| 4 | `attemptFromResult` keys | CHANGED | No `toolMs`; keys are `iteration, command, decisionSource, jevCalled, servedModel, instrumentVersion, calibrationStatus, latencyMs, usage, cost, fallback, outcome, escalationReason, op, stepOutcome`; D-18 `jev` summary mapping recorded for 70-05. |
| 5 | `_fastPath` / `jevFast` layouts | CHANGED | `_fastPath` has no `lastLlmTools` (IN-01), adds `calibratedSeen` (WR-04) and lazy `capturePending`; `jevFast` adds `firstTabId` (IN-04) and capture keys. Phase 70 adds no field to either; evidence in `session._fastRunEvidence`, start page in `session._fastRunStartPage`. |
| 6 | `createHarness` | CHANGED (superset) | Also takes `model, task, pageUrl, tabId, sessionId, jevResponder, storage`; exposes `harness.pipeline` and `harness.permissionContext`; its lifecycle broadcaster is a recorder, so bridge settles use the 70-01 vm bridge harness. |
| 7 | Goal over 1000 code points | CHANGED | `buildRequest` truncates to 1000 code points and returns `ok:true` (`jev-state.js:851`); no length latch. 70-04's long-goal sub-check asserts the truncation. |
| 8 | Bench-goal `sensitive_goal` cases | note | Only the jev-fast-path.test.js case (68-05-PLAN.md:103) is re-pointed by 70-04; the loop and measurement cases stay latched (page url is not the Open URL). |
| 9 | Terminal tool names in jev-fast-path.js | CHANGED; **PD-70-03 proposed** | Two 68 pins ban `complete_task|partial_task|fail_task` anywhere in the module (`tests/jev-fast-path.test.js:204`, `tests/jev-fast-loop.test.js:1340`); recommended: narrow both to outside one marker-bounded Phase 70 section, plus a paired check that the fast-step functions name no terminal tool and the section builds no tool call. **Needs orchestrator acceptance before 70-03 Task 1 commits.** |
| 10 | D-22 condition (2) | note | Use `FsbJevState.toOriginPath(url).path === new URL(url).pathname` (real address rule incl. the percent-decoded check). |
| 11 | F5 token shape | note | 22-char token is not redacted per segment: 70-04 Task 1 takes its normal branch for both shapes. |
| 12 | PD-70-01 | planner decision | D-14 observation set narrowed (tighten-only) to the 9 page-reading read-only tools plus a delivered hand-off snapshot (RESEARCH F1); owner confirms at V5 (M-70-06). |
| 13 | PD-70-02 | planner decision | Code-held start page lives in memory-only `session._fastRunStartPage` (origin + path), never in the evidence record or on the wire. |
| 14 | Line anchors | moved | Use items n, o, p (bridge `settle` :2753, `final_result: value,` :2785, `resolve(value);` :2800; background `activeSessions.set` :14246, `sendResponse` :14349, `createSessionHooks(sessionId)` call :14466; agent-loop BEFORE :2335, AFTER :2915, AFTER_ITERATION :3014, meta-cognitive `return;` :2991; errors.ts :473-475). |

## F5 probe (item l)

URL `http://127.0.0.1:53211/r/<token>/fixtures/checklist/index.html`, goal `Open <url>. Tick Alpha.`:

| Token | `matchesSecret(goal)` | every segment unchanged by `scrubText` | `toOriginPath(url).path` | `buildRequest` (full goal) |
| --- | --- | --- | --- | --- |
| `Ab3dEf9hIj2kLm5nOp8qRs` (22-char base64url) | true | yes | `/r/Ab3dEf9hIj2kLm5nOp8qRs/fixtures/checklist/index.html` | `{ok:false, reason:'sensitive_goal'}` |
| `qwertyuiopasdfghjklzxcvb` (24 lowercase) | false | yes | `/r/qwertyuiopasdfghjklzxcvb/fixtures/checklist/index.html` | `ok:true` |

Neither token is redacted per segment, so D-22's normaliser does not decline on bench goals and plan 70-04 Task 1 takes its normal branch. Over 5,000 bench-style tokens, 3,457 full goals (about 69%) trip `sensitive_goal` today.

## The switch-off golden (Task 3)

| Path | Settle value (abridged) | Store writes |
| --- | --- | --- |
| runtime-complete | `{sessionId, status:'success', result:'Ticked Alpha on the checklist.'}` | 2 (subscribe in_progress, terminal `complete`) |
| bus-complete | same as runtime-complete | 2 |
| bus-error | `{sessionId, status:'error', error:'API call failed: provider returned 500'}` | 2 (terminal `error`) |
| bus-stop | `{sessionId, status:'stopped', result:{}}` | 2 (terminal `stopped`) |
| safety-net | `{sessionId, success:true, partial_outcome:'timeout', partial_state:<last in_progress snapshot>, hint}` | 22 (subscribe, 19 heartbeat ticks, the pre-settle `partial` rewrite, terminal) |

First heartbeat payload: `{timestamp: start+30000, sessionId, taskId, alive:true, step:0, elapsed_ms:30000, current_url:null, ai_cycles:0, last_action:null}`. Every wire text equals `JSON.stringify({success:true, ...value}, null, 2)`, and no value carries `fast_mode`. A /tmp mutation check (not committed) confirmed the suite fails on an added `fast_mode` key, a copied `reason`, an extra heartbeat key and an in_progress snapshot drift.

## Per-task `<automated>` wall times (Node v24.14.1)

- Task 1 verify: 0.08 s
- Task 2 verify (grep + tripwire + delegation-phase-contract): 0.25 s
- Task 3 verify (wire suite + 3 bridge suites + delegation-phase-contract + diff check): 1.02 s
- Wave check (`npx --offline -y node@20` on the tripwire and the wire suite, v20.20.2): ~1 s, both exit 0. The three bridge suites and delegation-phase-contract also pass on the official Node 20.20.2 binary.

## Files Created/Modified

- `.planning/phases/70-bounded-mcp-fast-task/70-SYNC-RECHECK.md` - P70_START, interface table, items a-u, Drift substitutions, For Phase 71
- `.planning/phases/70-bounded-mcp-fast-task/70-SWEEP-BASELINE.json` - pre-edit sweep (head, 110 selected, failures [])
- `tests/jev-run-task-upstream-contract.test.js` - upstream tripwire (87 checks)
- `tests/fixtures/run-task-wire-golden.json` - switch-off wire golden captured from the unedited bridge
- `tests/run-task-fast-mode-wire.test.js` - vm bridge harness and switch-off golden assertions
- `package.json` - two commands appended to `scripts.test` (342 commands now)
- `tests/delegation-phase-contract.test.js` - the same two commands appended to `REFINEMENT_ROOT_TEST_COMMANDS`

## Decisions Made

- The wire-passthrough and json-safe checks run over all four variants per path (stronger than V2 only); "heartbeat unchanged" is checked per variant (4 checks). Golden value/storeWrites comparisons are structural (realm- and key-order-independent); key order on the wire is pinned by the byte-for-byte wire-text check.
- Settle message constants mirror the real broadcasters field for field: `COMPLETE_MESSAGE`/`ERROR_MESSAGE` follow agent-loop `notifySidepanel` for `createTerminalOutcome('success', {reason:'complete_task'})` and `createTerminalOutcome('error', {reason:'error'})`; `STOP_MESSAGE` follows background `handleStopAutomation`. Each emit passes a JSON clone so the bridge receives a mutable plain object.
- The virtual clock copy takes a start time (`CLOCK_START_MS = 1760000000000`), the "fixed time" the plan asks for.

## Deviations from Plan

None in Task 3 beyond the strengthening noted under Decisions. Tasks 1-2 were executed by a previous attempt and only re-verified here.

## TDD Gate Compliance

Task 3 is `tdd="true"` but test-only, and the plan prescribes one commit. RED was observed before the capture (the suite exited 2 with ENOENT on the missing golden); GREEN after the one-time capture (39/39). No separate `test`/`feat` commit pair exists because there is no implementation code in this plan.

## Known Stubs

- `tests/run-task-fast-mode-wire.test.js`: the "switch-on cases (plan 70-06)" section header has no cases yet. This is intentional; plan 70-06 adds them.

## Issues Encountered

- Observation (pre-existing, recorded in the golden as-is, not fixed): on the safety-net path the settle's terminal store write records `status:'complete'` and overwrites the pre-settle `partial` rewrite, because the safety-net value carries `success:true` and no `status`/`partial`. The frozen golden keeps today's behaviour, so any future fix changes the switch-off wire and needs its own decision.

## Deferred to Validation Block

- Deferred: M-70-01 (V1: none). The baseline runs at 8a058bdf.

## Next Phase Readiness

- Plans 70-02 onward read 70-SYNC-RECHECK.md first and apply its Drift substitutions.
- **Open for the orchestrator:** PD-70-03 (Drift substitution 9) must be accepted or rejected before 70-03 Task 1 commits.
- No extension or mcp file changed in this plan; `git status --porcelain -- mcp/` is clean after the build.

---
*Phase: 70-bounded-mcp-fast-task*
*Completed: 2026-10-18*

## Self-Check: PASSED

All five created files exist; commits 65a60e6a, a0d9a669, f5add9c8 and c20081f5 exist on Jev; the interface table has 43 rows and none is MISSING.
