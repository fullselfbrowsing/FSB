---
phase: 70-bounded-mcp-fast-task
plan: 05
subsystem: fast-mode
tags: [run_task, jev, fast-mode, typed-outcome, classifier, sc2, d-13, d-16, d-18]

# Dependency graph
requires:
  - phase: 70-bounded-mcp-fast-task
    provides: "70-01: 70-SYNC-RECHECK.md (items b, c, d and Drift substitutions 3-5, 9), the tripwire; 70-02: budgetProfileName and the run_task profile; 70-03: session._fastRunEvidence, runEvidenceUnresolved, the registerRunEvidence harness option and the marked Phase 70 section (PD-70-03)"
  - phase: 68-autopilot-fast-mode
    provides: "jevMeasurement attempts and per-command totals, the _fastPath session latch, the agentState.jevFast command latch, describeEscalation's code table, the loop harness and the fake gateway"
provides:
  - "FsbFastPath.classifyRunTaskOutcome({source, kind, message, evidence}) -> {outcome, reason, uncertain_unobserved, human_gate}"
  - "FsbFastPath.summarizeFastMode(session) -> the eight-key jev summary"
  - "FsbFastPath.buildFastModeBlock(session, {source, kind, message}) -> the six-key fast_mode block; never throws"
  - "Frozen exports FAST_MODE_OUTCOMES, FAST_MODE_REASONS, FAST_MODE_HUMAN_GATES, FAST_MODE_BLOCK_KEYS, FAST_MODE_SUMMARY_KEYS, FAST_MODE_ESCALATION_CODES (shared with plans 70-06 and 70-07)"
  - "tests/jev-run-task-outcome.test.js (registered in the root chain and REFINEMENT_ROOT_TEST_COMMANDS)"
  - "The 'run_task outcome end to end' section of tests/jev-fast-loop.test.js, with a settle recorder that mirrors the bridge"
affects: [70-06, 70-07, 70-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three isolated try/catch parts in one builder (budget profile, summary, classifier), so one failure never loses the others"
    - "Closed vocabularies with 'other' for every string that leaves the extension; frozen key lists shared by producer and consumers"
    - "Reason table derived from the code: a comment- and string-aware scan of createTerminalOutcome call sites, guard broadcasts, mapSafetyReasonToConstant, STUCK_REASONS, the partial_task enum and background.js stop broadcasts"
    - "A broadcast-time settle recorder in loop tests: the block is computed synchronously inside fsbBroadcastAutomationLifecycle, once, from the live session"

key-files:
  created:
    - tests/jev-run-task-outcome.test.js
    - .planning/phases/70-bounded-mcp-fast-task/70-05-SUMMARY.md
  modified:
    - extension/ai/jev-fast-path.js
    - tests/jev-fast-loop.test.js
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "The terminal reason is matched after trim and lower-casing, as isAuthWallPartialReason reads it, so ' Manual_Approval ' still gives needs_confirmation; output strings stay closed"
  - "Row 2 (safety net) matches kind 'safety_net' or source 'safety_net_600s' (RESEARCH Pattern 4 used the source)"
  - "human_gate travels with every outcome: the safety-net row still reports an uncleared evidence gate; a success never reports one"
  - "A partial manual_approval terminal gives needs_confirmation even with no evidence record (the gate is the terminal's own); uncertain_unobserved is then null"
  - "A non-object session gives budget_profile null and jev null; a non-object settle gives classifier_error (matches the bridge fallback literal in 70-06)"
  - "FAST_MODE_ESCALATION_CODES is derived at definition from describeEscalation's tables plus four sentence-less decline codes and 'other' (69 codes), so the summary vocabulary cannot drift from 68's code table"
  - "calibration is the last non-null attempt status (Drift substitution 4)"
  - "MCP-03 is advanced, not completed, by this plan; it is met only at the Phase 70 gate"

patterns-established:
  - "settleRecorder(h) / outcomeLoop(opts) / expectBlock(run, name, want) in tests/jev-fast-loop.test.js"
  - "callClosure(source, roots) in tests/jev-run-task-outcome.test.js: the transitive set of module functions a function calls, for static slice bans"

requirements-completed: []  # MCP-03 is advanced here and met only at the Phase 70 gate plan
requirements-advanced: [MCP-03]

# Metrics
duration: ~18min
completed: 2026-10-18
---

# Phase 70 Plan 05: Typed run_task outcome Summary

**`FsbFastPath` now turns any run_task ending into one of `done`, `ambiguous`, `blocked` or `needs_confirmation`, with one reason from a closed list, from the settle path, the terminal message's outcome and reason, and the 70-03 run evidence. It never reads a Jev answer. A content-free `jev` summary rides along. It reports attempts, calls, fast steps, decide time, calibration, latches, spent budgets and escalations, and it never changes the outcome. In the real agent loop, an uncertain fast or LLM step that nothing observed before `complete_task` reads `ambiguous`, even though the LLM claimed success.**

## Performance

- **Duration:** ~18 min (start 2026-10-18T22:59:00Z, Task 1 commit ~23:06Z, Task 2 commit ~23:10Z, wave check, sweep and SUMMARY by ~23:17Z)
- **Tasks:** 2 of 2
- **Files modified:** 4 source/test files plus package.json (1 test file created)

## The classifier as implemented (D-13 precedence)

`classifyRunTaskOutcome({source, kind, message, evidence})` reads only `kind`, `source`, `message.outcome`, `message.reason` and the evidence record. The terminal is `'error'` for kind `'error'`. For kind `'complete'` it is `message.outcome` when that is one of success, partial, stopped or error. Otherwise it is `'unknown'`. A missing record (undefined, null or not an object) counts as no evidence and is decided first. No gate or uncertainty is read from it, `runEvidenceUnresolved` is never called on it, and `uncertain_unobserved` is null.

| # | Condition (first match wins) | outcome / reason |
| --- | --- | --- |
| 1 | builder: the classifier threw, the session or settle is unusable, or a verdict is not closed | ambiguous / classifier_error |
| 2 | kind `'safety_net'` or source `'safety_net_600s'` | ambiguous / safety_net_timeout |
| 3 | partial terminal with reason manual_approval; else, for a non-success terminal with evidence, an uncleared `payment_not_approved` or `site_consent_required` gate | needs_confirmation / the gate |
| 4 | evidence present and `runEvidenceUnresolved` true | ambiguous / uncertain_action |
| 5 | success with evidence | done / complete_task, end_turn, else other |
| 6 | success with no evidence record | ambiguous / evidence_unavailable |
| 7 | anything else | blocked / the reason in the blocked list. A reasonless error gives `error`, a reasonless partial gives `blocked`, anything else gives `other` |

`uncertain_unobserved` is `runEvidenceUnresolved(ev)` (null with no record). `human_gate` is the row-3 gate on every row, so the safety-net row still reports an uncleared gate, and a success never reports one.

## Final closed reason list (`FAST_MODE_REASONS`)

- **done:** complete_task, end_turn, other
- **ambiguous:** classifier_error, safety_net_timeout, uncertain_action, evidence_unavailable
- **blocked (21):** blocked, auth_required, credentials_missing, user_skipped_login, credentials_failed, fail_task, error, iteration_limit_exceeded, cost_limit_exceeded, time_limit_exceeded, safety, meta_cognitive_loop_break, stuck_action_repetition, stuck_no_goal_progress, stuck_dom_hash, user_stopped, tab_closed, service_worker_restart, session_not_found, session_not_running, other
- **needs_confirmation:** manual_approval, payment_not_approved, site_consent_required

The other lists are `FAST_MODE_OUTCOMES` `['done','ambiguous','blocked','needs_confirmation']` and `FAST_MODE_HUMAN_GATES` (the three gates). `FAST_MODE_BLOCK_KEYS` is `['outcome','reason','uncertain_unobserved','human_gate','budget_profile','jev']`. `FAST_MODE_SUMMARY_KEYS` is `['attempts','calls','fast_steps','jev_ms','calibration','latched','exhausted','escalations']`. All six lists are frozen, and `FAST_MODE_REASONS` is deep-frozen.

## Escalation-code list (`FAST_MODE_ESCALATION_CODES`, 69 codes) and its source

The list is built once at definition, inside the IIFE, from 68's own `describeEscalation` tables (70-SYNC-RECHECK item d). It never reads `FsbJevState.CONTRACT` at load:

1. `Object.keys(ESCALATION_TEXT)` (50). These are the 19 contract fallback reasons, plus unknown_fallback, not_calibrated, jev_stuck, completion_unconfirmed, op_not_offered, op_not_in_element_ops, page_op_with_target, unknown_target, risk_excluded, not_fast_eligible, stale, uncertain, dispatch_unconfirmed, failed, denied, no_effect, no_progress, same_state, step_budget, call_budget, time_budget, consecutive_cap, escalation_latch, vault_flow, switch_off, menu_unavailable, menu_invalid, nothing_offerable, local_invalid_request, exception and unavailable.
2. `operation_` and `target_` combined with each `CHOICE_TEXT` reason (14): not_ok, not_calibrated, kind_absent, threshold_null, below_threshold, catch_all, malformed.
3. The decline codes that have no sentence of their own: not_enabled, first_llm_turn, yield_to_llm, stopped. Then `other`.

The suite checks that the list holds every `CONTRACT.FALLBACK_REASONS` entry and every item-d code. It also checks that every code except the four declines and `other` has its own `describeEscalation` sentence, and that every vocabulary string matches the bench token rule `^[a-z_]{1,40}$` (70-07).

## Summary semantics (`summarizeFastMode`, read-only, F12)

- `attempts` is `jevMeasurement.attempts.length`.
- `calls` and `fast_steps` are `jevCalls` and `fastSteps` summed over the per-command totals, skipping invalid values.
- `jev_ms` is the summed per-command `jevMs`, or null until a decide is timed.
- `calibration` is the last non-null `calibrationStatus`, matched against the contract's `CALIBRATION_STATUSES`, else `other`.
- `escalations` sums every command's map into one plain object. Codes outside the list fold into `other`.
- `exhausted` is the `agentState.jevFast.latched` command latch when that latch is step_budget, call_budget or time_budget.
- `latched` is `_fastPath.offReason` when `_fastPath.off === true`, else a non-budget command latch, else null.
- The function creates and changes nothing on `jevMeasurement`, `_fastPath` or `agentState`, and `tests/jev-fast-measurement.test.js` still passes.

## Accomplishments

- **Task 1 (`b815bf35`):** added the classifier, the summary, the builder and the six frozen lists, all inside the marked Phase 70 section (PD-70-03), plus the module header line and the api members. Added `tests/jev-run-task-outcome.test.js` (785 checks) and registered it once in `scripts.test` (now 344 commands) and once in `REFINEMENT_ROOT_TEST_COMMANDS`.
- **Task 2 (`a9774fcc`):** added the section "run_task outcome end to end" to `tests/jev-fast-loop.test.js` (113 new `e2e` checks, 478 total). A recorder in place of `fsbBroadcastAutomationLifecycle` builds the block inside the terminal broadcast, as the bridge settle will (70-06). The harness file is unchanged.

## Named checks (all PASS)

- **Task 1:**
  - "d13 table" covers every planned row plus extra edge rows (230 checks).
  - "reasons derived from code" covers 25 distinct terminal:reason pairs scanned from agent-loop.js, turn-result.js, the partial_task schema and background.js. Each classifies to itself.
  - Also: "summary", "fallbacks never decide the outcome" (32 settle and evidence combinations), "static slice ban" (over the call closure of both functions, including `runEvidenceUnresolved`), "no page content" (45 blocks), "block shape" and "never throws" (getters that throw, null and undefined sessions, bad settles, a revoked proxy, a cyclic session).
- **Task 2 (twelve cases, each asserting exactly one broadcast-time block, the frozen keys, budget_profile run_task and the marker scan):**

| Case | Result |
| --- | --- |
| e2e fast uncertain unobserved | ambiguous / uncertain_action, `uncertain_unobserved` true, `fast_steps` 1 |
| e2e fast handed off | done / complete_task, `uncertain_unobserved` false |
| e2e llm same turn | ambiguous / uncertain_action |
| e2e report_progress | ambiguous / uncertain_action |
| e2e read after | done / complete_task |
| e2e manual approval | needs_confirmation / manual_approval |
| e2e auth wall | blocked / auth_required |
| e2e denied then end_turn | done / end_turn |
| e2e uncalibrated tally | done / complete_task, jev `{attempts:1, calls:1, fast_steps:0, calibration:'uncalibrated', latched:'not_calibrated'}` (the code is read from `_fastPath.offReason`) |
| e2e step budget tally | `fast_steps` 12, `exhausted` 'step_budget' (read from `jevFast.latched`); the LLM's complete_task ended the task and no fast step named a terminal tool |
| e2e transient tally | `escalations.timeout` 1; outcome equal to a reference run that has a calibrated catch-all in place of the timeout |
| e2e block computed at broadcast | after the loop exits, the evidence is changed so a recomputed block would read done; the recorded block still reads ambiguous / uncertain_action |

**Mutation checks (reverted):**
- Dropping `tab_closed` from the blocked list fails 3 checks.
- Calling `runEvidenceUnresolved` on a missing record fails 17.
- Treating any `offReason` as a latch fails 2.
- Removing row 4 fails 7 e2e checks.
- Counting any success as an observation fails 3 e2e checks.
- Disabling the manual_approval gate fails 3 e2e checks.

## Per-task `<automated>` wall times (Node 24)

- **Task 1:** about 1.1 s in total. outcome 0.09 s, jev-fast-path 0.28 s, measurement 0.17 s, boundary 0.23 s, tripwire 0.13 s, delegation-phase-contract 0.19 s, then the module grep (clean).
- **Task 2:** about 1.1 s in total. jev-fast-loop 0.52 s, outcome 0.09 s, jev-fast-path 0.28 s, tighten-only 0.18 s. `git diff --quiet HEAD~1 -- tests/fixtures/ extension/ai/agent-loop.js` exits 0.

## Wave check (`<verification>`)

- `npx --offline -y node@20` (v20.20.2) passes both `tests/jev-run-task-outcome.test.js` (785/0) and `tests/jev-fast-loop.test.js` (478/0).
- The official Node 20.20.2 binary passes the jev-fast-path.js pin bundle and the related suites: jev-run-task-outcome, jev-fast-path, jev-fast-loop, jev-fast-start-path, jev-fast-measurement, jev-extension-boundary, jev-run-task-upstream-contract, jev-policy-tighten-only, run-task-fast-mode-wire and jev-run-task-disclosure. All exit 0.
- Also exit 0 on Node 24: `jev-fast-capture.test.mjs`, `lattice-provider-bridge-smoke`, `npm run validate:extension`.
- Regression sweep: `node scripts/bench/sweep-tests.mjs --files extension/ai/jev-fast-path.js tests/jev-fast-loop.test.js --baseline .../70-SWEEP-BASELINE.json` gave **12/12 passed, no new failures vs baseline**. Port 7225 was held by the user's hub (pid 7109) and left alone.
- `git status --short` printed nothing after each commit. Showcase public files were untouched (no showcase build ran).
- `git diff 34d7166d -- mcp/ extension/ai/agent-loop.js extension/background.js tests/fixtures/` is empty.

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

### Choices within the plan's latitude (recorded, no scope change)

1. **Reason matching is trimmed and lower-cased.** `partial_task`'s reason is LLM-supplied and reaches the message raw. `isAuthWallPartialReason` normalises it the same way. Output strings are still only list members.
2. **The safety net is also recognised by source `'safety_net_600s'`.** This follows RESEARCH Pattern 4, in addition to the planned kind `'safety_net'`. Plan 70-06 passes both.
3. **`human_gate` is computed once and travels with every row.** On the safety-net row it reports an uncleared evidence gate. The plan's table did not specify that row.
4. **A partial manual_approval with no evidence record gives needs_confirmation.** The plan's "every other terminal to its blocked row" describes rows 4-7 for a missing record. Row 3's first clause reads only the terminal, so it does not need evidence.
5. **A non-object settle gives classifier_error.** A string or number settle would otherwise read as blocked/other. A non-object session gives `budget_profile: null` and `jev: null`, which matches the bridge fallback literal in 70-06's isolation case.
6. **`FAST_MODE_ESCALATION_CODES` also holds four decline codes.** These are not_enabled, first_llm_turn, yield_to_llm and stopped ("every 68 escalation, decline and latch code"). None of them is ever written to `escalations` or a latch.

### Test-side adjustments (no production change)

1. **"e2e transient tally" and WR-04.** The plan's literal order puts the timeout first and a calibrated answer second. Under WR-04 (70-SYNC-RECHECK Drift substitution 5), a fallback before any calibrated answer latches the session, so the calibrated answer is never requested. The case therefore runs [calibrated click, timeout, calibrated click, catch-all]. The timeout costs its iteration only, and the calibrated answer after it acts. A second check, named "e2e transient tally (WR-04)", runs the literal order and shows `escalations.timeout` 1, `latched` 'timeout' and an unchanged done/complete_task outcome. Both keep D-16.
2. **The allowlist in "reasons derived from code".** It is limited to the createTerminalOutcome defaults `completed` and `stopped`. The suite proves `completed` comes only from notifySidepanel's fallback. That fallback is unreachable: notifySidepanel is called once, from finalizeSession, and all 12 finalizeSession calls pass a terminal. Every stopped call site passes a reason, so the `stopped` default is never used. Both classify as `other`.
3. **The background.js scan skips two functions** (`generateAlternativeSelectors`, `isValidResult`). The test's bracket matcher cannot balance their regex literals. The suite checks that every function it relies on is located (the three excluded ones, `handleStartAutomation` and `handleStopAutomation`). The legacy `startAutomationLoop` and the replay broadcasts are excluded with a comment, as planned.

### Defects fixed in Task 2

None. Every e2e case passed against the Task 1 code. Each `contentResponder` answer follows the 68-07 fixture shape: the raw `{success:false, outcome:'unknown', mayHaveExecuted:true}`, which `executeContentTool` wraps as `result`.

### Auto-fixed issues

1. **[Rule 1 - test bug] Duplicate `safety` returns.** `mapSafetyReasonToConstant` has two `return 'safety'` statements, so the scan now dedupes the returns. This was found during Task 1 GREEN and is part of `b815bf35`.

## Known residuals (tighten-only; recorded, not fixed)

None new. The 70-03 residuals still apply to the outcome:
- The meta-cognitive force stop after a denied last call reads ambiguous instead of blocked.
- `dispatch_unconfirmed` LLM failures count as uncertain.
- A retried iteration number can be taken for the fast call.

Each can only move `done` toward `ambiguous`.

## TDD Gate Compliance

This is a `type: execute` plan whose tasks are `tdd="true"`, and each task prescribes one commit, as in 70-03.
- **Task 1:** RED was observed before the implementation (21 failures, "FsbFastPath.buildFastModeBlock is not a function"). GREEN and the registration then landed together as `feat(70-05)`.
- **Task 2:** the plan says these cases exercise code that already exists after Task 1, so no RED phase was possible. The mutation checks above show the cases fail when the classifier or the evidence rule is broken.

## Known Stubs

None.

## Threat Flags

None. There is no new endpoint, message, storage key or wire field in this plan; plan 70-06 adds the `fast_mode` key at the bridge. T-70-01 is mitigated by done requiring an explicit success plus resolved evidence, the static slice ban and the e2e uncertain-then-complete cases. T-70-02 is mitigated by the closed vocabularies, the frozen key lists, the marker scans (45 unit blocks and every e2e block) and no `jevMeasurement` additions. T-70-04 is mitigated by three isolated try/catch parts and a classifier_error fallback with every key present.

## Deferred to Validation Block

- Deferred: M-70-04 (V4). The typed-outcome agreement table, with the false-`done` count as a gate input, plus the false-`ambiguous` watch items from 70-03.
- Deferred: M-70-06 (V5). Real-page outcomes: manual approval, `stop_task`, foreground and background tabs, an uncertain target on a re-rendering page.
- F7 reachability (70-VALIDATION): the payment and consent gates are proven with injected evidence only. `partial_task` manual_approval is the live `needs_confirmation` source, proven end to end in "e2e manual approval".

## Next Phase Readiness

- Plan 70-06 can call `globalThis.FsbFastPath.buildFastModeBlock(sessionRef, {source, kind, message})` from the bridge settle and compare against `FAST_MODE_BLOCK_KEYS`. The builder already returns `budget_profile: null, jev: null` with classifier_error for a null session.
- Plan 70-07 can mirror `FAST_MODE_BLOCK_KEYS`, `FAST_MODE_SUMMARY_KEYS` and `FAST_MODE_OUTCOMES`. Every vocabulary string passes its `^[a-z_]{1,40}$` token rule. For a switched-on session with no jevMeasurement, the zero summary is `{attempts:0, calls:0, fast_steps:0, jev_ms:null, calibration:null, latched:null, exhausted:null, escalations:{}}`.

---
*Phase: 70-bounded-mcp-fast-task*
*Completed: 2026-10-18*

## Self-Check: PASSED

All five modified or created source and test files and this SUMMARY exist. Commits b815bf35 and a9774fcc exist on Jev, and neither message carries AI attribution. Nothing was pushed. STATE.md, ROADMAP.md and REQUIREMENTS.md were not touched (the orchestrator owns them).
