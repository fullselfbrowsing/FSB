---
phase: 68-autopilot-fast-mode
plan: 07
subsystem: testing
tags: [jev, fast-mode, agent-loop, harness, latches, budgets, breakers, never-re-roll, no-progress, pairing, containment, d-05, d-10, d-12, d-16, d-17, d-18, f1, f11, f13, f21, auto-03, auto-04, auto-05]

# Dependency graph
requires:
  - phase: 68-06
    provides: "tests/fixtures/agent-loop-fast-harness.js createHarness (the real runAgentIteration with stubbed chrome, provider and content), the background.js fsbCreateFastPathDeps evaluated in the test realm, and the two loop seams"
  - phase: 68-05
    provides: "FsbFastPath.beforeTurn / afterStep / observeTools / abortInFlight, the decline and latch table, and the afterStep outcome table"
  - phase: 68-04
    provides: "the constants (FAST_MAX_STEPS 12, FAST_MAX_CALLS 16, FAST_WALL_BUDGET_MS 20000, FAST_MAX_CONSECUTIVE 3, FAST_ESCALATION_LATCH 3), describeEscalation, SUMMARY_PREFIX / SNAPSHOT_HEADER / SNAPSHOT_COLLAPSED, and tests/fixtures/jev-fake-gateway.js"
provides:
  - "Loop-level proofs through the real runAgentIteration for every VALIDATION row AUTO-03-d, AUTO-04-a..c and AUTO-05-a..d"
  - "Harness helpers: makeFakeClock, scriptedGateway, recordingJevClient, signatureMenuContent, providerFormat, providerToolResponse, toolPairing"
affects: [68-08, 68-09, 68-11, V4, V5]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-iteration step records (provider requests, menus, decides, fast dispatches, schedules, latch state) taken around each harness step"
    - "Mutation spot-checks over byte-restored extension files prove each loop case is not vacuous (34 mutations, all caught)"
    - "A pending iteration is awaited with a bounded wait and a named check, so a hang fails by name instead of ending the process silently"

key-files:
  created:
    - .planning/phases/68-autopilot-fast-mode/68-07-SUMMARY.md
  modified:
    - tests/jev-fast-loop.test.js
    - tests/fixtures/agent-loop-fast-harness.js

key-decisions:
  - "No defect was found in the 68-04/05/06 code, so there is no fix(68-07) commit; the extension tree is unchanged by this plan"
  - "maxIterations is proven at both limit 4 (fast steps in iterations 2-3, iteration 4 stopped) and limit 5 (fast steps in iterations 2-4, iteration 5 stopped), because checkSafetyBreakers runs after the iteration increment"
  - "In the time-budget case a decide whose deadline is shorter than 2 400 ms takes exactly its deadline and times out through the real client's held timer, as a real slow gateway would"
  - "Only one harness is live at a time: createHarness installs its own chrome and timer globals"

patterns-established:
  - "loopRun / runSteps / finish in tests/jev-fast-loop.test.js: build a fast-mode run, step it, read per-iteration records, collect executed fast calls, dispose"
  - "toolPairing(providerKey, body) checks call/result adjacency in openai, anthropic and gemini bodies; it carries its own self-test against crafted bad bodies"

requirements-completed: [AUTO-03, AUTO-04, AUTO-05]

# Metrics
duration: 17min
completed: 2026-10-17
---

# Phase 68 Plan 07: Fast-mode safety proofs through the agent loop Summary

**The real `runAgentIteration` now proves fast mode's safety and truthfulness end to end. An uncalibrated answer costs one menu and one decide per session, after which every request body equals the switch-off run. Each budget and latch moves the command to LLM-only without ending it. The existing `maxIterations` and meta-attempt breakers stop fast-only runs on one control, while one same-named control per page does not trip them. The same page state is never asked twice, and steps that change nothing latch `no_progress`. Uncertain, stale, channel-closed and unanswered steps are dispatched exactly once, with a truthful hand-off. Request bodies stay paired for all seven provider keys. Faults, stops and a mid-run switch-off never end, corrupt or extend a session. No defect turned up, so the plan adds tests only.**

## Performance

- **Duration:** about 17 min
- **Started:** 2026-10-17T10:39:08Z
- **Completed:** 2026-10-17T10:56Z
- **Tasks:** 2 of 2
- **Files:** 2 modified (tests/jev-fast-loop.test.js +903 lines, tests/fixtures/agent-loop-fast-harness.js +261 lines)

## Accomplishments

- **`node tests/jev-fast-loop.test.js`:** the suite grew from 71 to 260 checks, all passing, on Node 24, `npx --offline -y node@20` and `/tmp/fsb-node20/.../node`.
- **The extension tree is untouched.** `git diff --stat HEAD~1 -- extension/` prints nothing for either commit.
- **Harness helpers** in `tests/fixtures/agent-loop-fast-harness.js` are additive only, and no existing case runs differently:
  - `makeFakeClock`: a clock that moves only when a case advances it.
  - `scriptedGateway`: the i-th decide gets the i-th answer, and the last answer repeats.
  - `recordingJevClient`: a real `FsbJevClient` over held timers that records each decide's `timeoutMs`, `signal` and the clock reading.
  - `signatureMenuContent`: a content script where the case controls the menu url, entries and signature. The signature can change per request (a counter in the title), per fast action, or stay fixed. Fast-action answers can be scripted, can throw, or can resolve to undefined.
  - `providerFormat`, `providerToolResponse` and `toolPairing`: raw responses in the openai, anthropic and gemini formats, plus a pairing check on the request bodies.

## Behavior bullets and their checks

### Task 1: latches, budgets, completion and stuck gates, and the breakers (commit `158d6b9d`)

| Behavior bullet | Check names (prefix) | What is asserted |
| --- | --- | --- |
| Uncalibrated latch (AUTO-03-d) | `uncalibrated latch (uncalibrated)`, `uncalibrated latch (snapshot_changed)` | Over 6 iterations: one getJevMenu and one decide in the whole session, both in iteration 2. Every iteration runs the LLM. Iterations 3-6 send no menu, make no decide and fetch no extra snapshot. `session.messages` deep-equals the switch-off run. The provider bodies of iterations 3-6 (and 2) equal the switch-off run. `offReason` is `not_calibrated`. |
| Fallback classes (AUTO-05-b) | `fallback disabled`, `fallback invalid_request (a 404 with no body)`, `fallback sensitive_goal`, `fallback timeout`, `escalation latch` | **disabled and 404:** one call in iteration 2. A session latch holds through a follow-up command (still one gateway call in the session). **sensitive_goal:** the bench goal with a run token gets one menu and zero decides. It is a command latch: `_fastPath.off` stays false, and the next command with a clean goal asks Jev again. **timeout:** that iteration escalates only. After the next LLM turn, fast mode asks again on the same page state and acts, because a fallback is not remembered. **Three consecutive busy fallbacks:** the command latches `escalation_latch` and there is no fourth decide. |
| Budgets (AUTO-04-a) | `consecutive cap`, `step budget`, `call budget`, `time budget` | **Consecutive cap:** iterations 2-4 are fast, and iteration 5 is the LLM's with no menu or decide. Its hand-off lists the 3 steps and the cap reason. Iteration 6 is fast again. **Step budget:** fast steps run in iterations 2-4, 6-8, 10-12 and 14-16. The twelfth is the last, and iteration 18 latches `step_budget`. **Call budget:** acts alternate with below-threshold escalations. The sixteenth decide (iteration 17) is the last, and iteration 18 latches `call_budget`. **Time budget:** the clock moves 300 ms per menu and 2 400 ms per decide. The decide timeouts are `[2500 ×7, 800]`, each ≤ min(2500, 20000 − used). The command latches `time_budget` at exactly 20 000 ms. In every case the status stays `running`, no `outcome` or `outcomeDetails` is set, and the next iteration runs the LLM. |
| Completion and stuck (AUTO-04-c) | `completion: ...`, `completion threshold_null: ...`, `stuck: ...` | **p 0.05 ≤ 0.2:** the step acts, and so does the next one. **p 0.6 above the cut:** iteration 3 goes to the LLM, and the hand-off carries `completion_unconfirmed`. **threshold_null:** three steps act, then the consecutive cap forces iteration 5 onto the LLM. **Stuck p 0.9 ≥ 0.8:** iteration 3 goes to the LLM, and the hand-off names the stuck signal. |
| No progress (D-17, sync issue 4) | `no progress: ...` | An unconfirmed click, or a click with `verification.verified` true, followed by the same url and signature latches `no_progress` before the next decide. The next LLM request carries one hand-off with the no-progress hint. A verified click that changes the signature does not latch. Two no-effect clicks on the same role and label latch even though a title counter changed the signature. |
| Never re-roll (D-18) | `same state (operation below_threshold)`, `same state (target catch_all)`, `same state (target threshold_null)` | Iteration 2 escalates on (U, S), and the LLM's turn is only `get_page_snapshot` (from toolCallLog). In iteration 3, the same U and S give no second decide, the LLM runs, `consecutiveEscalations` stays 1 and nothing is latched. Iteration 4 has a changed signature and makes the second decide. |
| Breakers (AUTO-04-b, F1) | `maxIterations: ...`, `meta_cognitive_loop_break: ...`, `per-page meta key: ...` | **maxIterations, limit 4 and 5:** the fast iterations count. The last iteration stops before any menu or provider call, with `iteration_limit_exceeded`, exactly like an LLM-only run with the same limit. **meta_cognitive_loop_break:** six effective fast clicks on "Next" on one page path (iterations 2-4 and 6-8, the cap forcing an LLM turn between the groups) end the run under `jev:/start:button:Next`, exactly as six LLM clicks on `#next` do. **per-page meta key:** seven effective "Next" clicks, each on its own wizard page, do not end the run. Each click is one attempt under its own `jev:/wizard/step-N:button:Next` key. |
| Static and log checks (AUTO-04-c) | `no executed fast call is named ...`, `jev-fast-path.js buildStaticCall names none of ...`, `jev-fast-path.js names no terminal tool anywhere` | None of the 84 executed fast calls across all loop cases is `complete_task`, `partial_task` or `fail_task`. Neither `buildStaticCall` nor the rest of the module names a terminal tool. |

### Task 2: outcomes, pairing, collapse, containment, stop and switch-off (commit `2fb77ee4`)

| Behavior bullet | Check names (prefix) | What is asserted |
| --- | --- | --- |
| Uncertain outcomes (AUTO-05-a, F11, sync issue 2) | `uncertain outcome (unknown outcome / mayHaveExecuted)`, `(bfCacheDetected)`, `(stale target)`, `(channel closed)`, `(no answer)` | **Dispatch count:** exactly one executeAction in the whole run, counted from the recorded content messages and from the content script's own counter. **Recorded result:** the loop records the real tool-executor shape: bfCache success, a `Content tool click failed: A listener indicated...` error, or `{success:false, error:null}` for no answer. **Next iteration:** it runs the LLM with no menu and no decide first. **Hand-off:** it says "may have executed; inspect the page before retrying" for (a), (b), (d) and (e). For (c) it uses the stale wording and makes no may-have-executed claim. No hand-off says "not permitted", and there is no second dispatch afterwards. |
| Pairing (AUTO-05-c) | `pairing self-test (openai/anthropic/gemini format)`, `pairing (xai)`, `(openai)`, `(anthropic)`, `(gemini)`, `(openrouter)`, `(lmstudio)`, `(custom)` | **Script:** an LLM turn, two fast steps, an escalation, and two LLM turns, the last ending the task. **Pairing:** in every request body, each assistant tool call is answered right after it, and no result lacks its call (counts 0/0, 1/1, 2/2). **Hand-off and ids:** no `jev_` id appears, and the hand-off is one plain user-role entry in each later request. **Self-test:** it confirms the checker rejects an unpaired call, an orphan result and an interleaved message in each format. |
| Collapse (D-10) | `collapse: ...` | Two hand-offs. The earlier one ends with `SNAPSHOT_HEADER\nSNAPSHOT_COLLAPSED` and keeps no snapshot text. Only the latest carries `SNAPSHOT_HEADER` followed by the snapshot. The iteration-5 request sees both in that form. |
| Exceptions (AUTO-05-d, F13) | `exception (beforeTurn throws)`, `exception (afterStep throws)` | The real module is used with one method replaced. **beforeTurn throws:** every iteration runs the LLM. **afterStep throws:** each fast step completes. In both, every iteration schedules normally, no "Iteration error" console line is written, `lastTurnResult.stopReason` is `tool_calls` five times and never `error`, and the session is not ended. |
| Stop (F21) | `stop: ...` | **Setup:** a decide is pending at the gateway when the stop arrives, then `status = 'stopped'` and `FsbFastPath.abortInFlight(session)` run. **Return:** the iteration returns (bounded wait, named check) with no provider request, no executeAction and no schedule. **Abort:** the fetch signal and the fast path's signal are both aborted. Nothing is added to `session.messages`. |
| Switch off mid-run (D-05) | `switch-off: ...` | The step is taken with the switch on, then the stored key is set to false. Iteration 3 re-reads it (one storage read), sends no menu, makes no decide, latches `switch_off` and delivers the earlier step in one hand-off. Later iterations send no menu, make no decide and do not read the switch again. |

## Task Commits

1. **Task 1: latches, budgets, completion and stuck gates, and the breakers.** Commit `158d6b9d` (`test(68-07): prove fast-mode latches, budgets and breakers through the agent loop`).
2. **Task 2: uncertain outcomes, provider pairing, hand-off collapse, exception containment, stop and switch-off.** Commit `2fb77ee4` (`test(68-07): prove escalate-once, provider pairing and fault containment for fast steps`).

**Plan metadata:** the `docs(68-07)` commit that adds this SUMMARY.

**fix(68-07) commits:** none. Every case passed against the 68-04/05/06 code, so no defect needed fixing and no extension file changed.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Plan detail - breaker arithmetic] maxIterations is proven at limit 4 and limit 5**
- **Found during:** Task 1
- **Issue:** The plan says "with maxIterations 4 and fast steps in iterations 2-4". `runAgentIteration` increments `iterationCount` before the BEFORE_ITERATION safety hook, and `checkSafetyBreakers` stops when the count reaches the limit. With `maxIterations` 4, iteration 4 itself is the stopped one, so only iterations 2-3 can be fast.
- **Fix:**
  - With limit 4, the fast steps fall in iterations 2-3 and iteration 4 is stopped.
  - With limit 5, the fast steps fall in iterations 2-4 and iteration 5 is stopped.
  - Each limit is compared with an LLM-only run under the same limit: same `stopped` status, same `iteration_limit_exceeded` reason, same `iterationCount`.
  - `checkSafetyBreakers` is unchanged, and its slice hash is still pinned.
- **Files modified:** tests/jev-fast-loop.test.js
- **Commit:** 158d6b9d

**2. [Plan detail - realistic clock] A cut-short decide takes its deadline, not 2 400 ms**
- **Found during:** Task 1
- **Issue:** The plan's fake clock moves 2 400 ms per decide. The eighth decide only gets 800 ms. A real client aborts at its deadline, so moving the clock 2 400 ms would show a call outlasting its own deadline (21 600 ms on the clock).
- **Fix:** A decide whose armed deadline is under 2 400 ms advances the clock by that deadline and fires the real client's held timer, so it ends as a real `timeout` fallback.
- **Effect:** The case proves the latch happens with exactly 20 000 ms used, never more. The sequence is seven 2 500 ms decides and one 800 ms decide.
- **Commit:** 158d6b9d

**3. [Rule 1 - test robustness] The stop case waits with a bound and fails by name**
- **Found during:** Task 2 (mutation spot-check)
- **Issue:** With `abortInFlight` disabled, the pending iteration never settles. Node then exits with code 1 and prints no FAIL line, so the failure is invisible in the log.
- **Fix:** The stop case waits at most 2 000 macrotasks for the step. If it is still pending, the harness is disposed so the console is restored. The case then reports `stop: the in-flight iteration returns once the stop aborts the decision`.
- **Check:** The same mutation now fails 2 named checks.
- **Commit:** 2fb77ee4

**4. [Test scope] Checks beyond the plan's list**
- **Latch scope:** a follow-up command shows that the disabled and 404 latches are session latches (still one gateway call in the session) and that `sensitive_goal` is a command latch (the next clean command asks again).
- **Fallback memory:** the timeout case uses a fixed signature to show that a fallback is not remembered as an answer.
- **Pairing self-test:** a self-test of the pairing checker in all three formats.
- **Per-page meta key:** the case takes seven clicks (the plan says six) so that it runs past the force-stop threshold.
- **Executed fast calls:** the static check also scans every executed fast call collected across all loop cases (84).
- **Rules:** none was loosened.

**5. [Harness use] One harness at a time**
- **Found during:** Task 1
- **Issue:** The first breaker draft created two harnesses before stepping either. `createHarness` installs its own chrome and timer globals, so the first run talked to the second run's stubs, and 4 checks failed.
- **Fix:** Every case now creates, runs and disposes one harness before it builds the next. This is noted in the suite header.
- **Effect:** Test code only. No harness behavior changed.
- **Commit:** 158d6b9d

---

**Total deviations:** 5. Two correct plan arithmetic or modelling to match the real code, one closes a silent-failure gap in the test, one widens scope, and one is a harness-usage rule. **Impact:** no extension change, no case weakened, and no upstream test touched.

## TDD Gate Compliance

These are characterization proofs over code that already existed (68-04/05/06). Each case passed against that code, and the plan expects a passing run unless a defect turns up; none did. The RED evidence comes from mutation spot-checks. Each mutation was applied in place, the suite was run, and the file was restored byte-identical; `shasum -c` reported OK for both `jev-fast-path.js` and `agent-loop.js` after every batch:

- **Task 1 (21, all caught).** On the fast-path side:
  - **Latches and fallbacks:** the not_calibrated session latch demoted to the iteration; the non-transient fallbacks demoted to the iteration; invalid_request demoted to the command; a local sensitive_goal latching the session; the escalation latch removed; a transient fallback remembered as an answer.
  - **Budgets:** the consecutive cap removed; the step budget removed; the call budget removed; the decide timeout ignoring the time left; the menu time not counted.
  - **Completion and stuck gates:** the completion gate ignored; a threshold_null completion escalating; the stuck flag ignored.
  - **No progress and same state:** each of the two no-progress clauses removed; same_state removed; same_state counted as an escalation.

  On the agent-loop side:
  - the meta key without the page path;
  - the meta key made per call id;
  - fast iterations not counted by the breaker.

  One first-draft mutation was a no-op: the classifier's final branch is also a session latch. It was replaced by the two demotions above.
- **Task 2 (13, all caught).**
  - **Step evidence:** bfCacheDetected read as progress; a failure with no content response read as denied; an unknown outcome read as a plain failure; stale read as uncertain; an uncertain step not forcing an LLM turn.
  - **History and hand-off:** the fast step pushed as a tool message; the hand-off sent as an assistant message; the earlier hand-offs not collapsed.
  - **Stop:** seam 1 ignoring a stop; `abortInFlight` made a no-op (caught after deviation 3).
  - **Containment and switch:** beforeTurn exceptions escaping the seam; afterStep exceptions escaping the seam; the switch not re-read.

## Verification

- **Task 1 and Task 2 verify lines.** Both exit 0 after each commit:
  - Under Node 24: `node tests/jev-fast-loop.test.js` (260/0), `node tests/jev-fast-path.test.js`, `node tests/agent-loop-iterator-guard.test.js`, `node tests/meta-cognitive-tracker.test.js` (24/0) and `node tests/jev-policy-tighten-only.test.js` (29650/0, unchanged).
  - Under Node 20: `npx --offline -y node@20 tests/jev-fast-loop.test.js` (260/0), also run with `/tmp/fsb-node20/node-v20.20.2-darwin-arm64/bin/node`.
- **Also green:**
  - `node tests/delegation-phase-contract.test.js` (1244/0);
  - `node tests/jev-fast-start-path.test.js` (104/0);
  - `node tests/jev-extension-boundary.test.js`.
- **Sweep:** `node scripts/bench/sweep-tests.mjs --files tests/jev-fast-loop.test.js tests/fixtures/agent-loop-fast-harness.js --baseline .planning/phases/68-autopilot-fast-mode/68-SWEEP-BASELINE.json` passed 2/2 with no new failures against the baseline. Port 7225 was held by the user's hub and left untouched. The crawler files never changed, and `git status --short` was clean after the sweep.
- **Acceptance greps:**
  - The output carries each required name: "uncalibrated latch", "time budget", "call budget", "step budget", "consecutive cap", "escalation latch", "completion", "stuck", "no progress", "same state", "maxIterations", "meta_cognitive_loop_break", "per-page meta key".
  - It also carries the five uncertain-outcome variants (including "channel closed" and "no answer"), the seven provider keys, "collapse", both exception variants, "stop" and "switch-off".
  - `git diff --stat HEAD~1 -- extension/` prints nothing for either test commit.
- **Commit messages:** none carries an attribution line.

## Known Stubs

None. The plan adds tests and test helpers only.

## Deferred to Validation Block

- **M-68-05 (V4):** whole-task completion, wall time and cost across the baseline, the non-Jev control and the fast-mode arm (through `run_task` after Phase 70). Also watch the `meta_cognitive_loop_break` count in the fast-mode arm. The same-path residual is a single-URL wizard with six or more same-named effective steps inside 12 iterations, which still trips the breaker, as the "meta_cognitive_loop_break" case shows on one page path.
- **M-68-08 (V5):** a runaway or stuck real page must stop truthfully through the existing breakers. Escalation summaries must read truthfully in a real session, and stale targets must escalate without a mis-click on a re-rendering site. This plan proves the offline equivalent: the breakers, the uncertain, stale and no-progress hand-offs, and the never-re-roll rule.

Deferred: M-68-05 (V4), M-68-08 (V5)

## User Setup Required

None.

## Next Phase Readiness

- **68-08 (capture) and 68-09 (measurement)** can extend `tests/jev-fast-loop.test.js` with `loopRun` / `runSteps` / `finish`. `signatureMenuContent` already answers `getJevMenu` with any `options.capture` value, and `recordingJevClient` exposes the decide calls for measurement checks.
- **The golden** `tests/fixtures/jev-fast-loop-off-golden.json` is unchanged and still matches, both before and after every fast-mode case.

## Self-Check: PASSED

- FOUND: tests/jev-fast-loop.test.js, tests/fixtures/agent-loop-fast-harness.js, .planning/phases/68-autopilot-fast-mode/68-07-SUMMARY.md
- FOUND: commits 158d6b9d and 2fb77ee4 on branch Jev. Neither carries an attribution line.
- After the last task commit: `node tests/jev-fast-loop.test.js` 260/0 on Node 24 and Node 20.
