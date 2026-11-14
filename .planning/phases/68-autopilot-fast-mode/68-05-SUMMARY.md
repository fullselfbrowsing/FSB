---
phase: 68-autopilot-fast-mode
plan: 05
subsystem: service-worker
tags: [jev, fast-mode, orchestration, latches, budgets, evidence, hand-off, never-re-roll, auto-02, auto-03, auto-04, auto-05, d-03, d-05, d-09, d-10, d-11, d-12, d-16, d-17, d-18, d-23, f13, f21]

# Dependency graph
requires:
  - phase: 68-04
    provides: "the FsbFastPath pure core (constants, classifyFallback, toBuilderInput, evaluateDecision, buildStaticCall, classifyStepEvidence, isNoProgress, describeEscalation, buildHandoffMessage, collapseEarlierHandoffs, the measurement helpers) and tests/fixtures/jev-fake-gateway.js"
  - phase: 68-02
    provides: "the menu shape, including signature and recentHandles answered per recent descriptor"
  - phase: 67
    provides: "FsbJevState.buildRequest, FsbJevClient.createJevClient / decide / DEFAULT_TIMEOUT_MS, FsbJevPolicy.accept"
provides:
  - "FsbFastPath.beforeTurn(session, {sessionId, iteration, deps?}): one bounded fast attempt per iteration; resolves {toolCall, step} or {decline}; never rejects"
  - "FsbFastPath.afterStep(session, step, toolResults): synchronous evidence handling, escalate-once, pending hand-off, recent action, actionHistory decisionSource marker"
  - "FsbFastPath.observeTools(session, toolCalls, toolResults): the LLM turn, recent LLM actions with ref/document epochs, vault flows, lastLlmTools"
  - "FsbFastPath.flushHandoff(session, {deps?}): delivers unflushed fast steps; reads neither fastMode nor agentState"
  - "FsbFastPath.latchOff(session, reason) and abortInFlight(session)"
  - "the memory-only state layout: session._fastPath (session) and session.agentState.jevFast (command)"
affects: [68-06, 68-07, 68-08, 68-09, V5]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Every LLM-path exit from beforeTurn goes through one declineWith(session, deps, reason) helper that flushes the pending hand-off first"
    - "Ref and document epochs: positional refs are trusted for identity only while no snapshot or navigation has happened since the action"
    - "Mutation spot-checks over a byte-restored module prove the orchestration cases are not vacuous (39 mutations, all caught)"

key-files:
  created:
    - .planning/phases/68-autopilot-fast-mode/68-05-SUMMARY.md
  modified:
    - extension/ai/jev-fast-path.js
    - tests/jev-fast-path.test.js

key-decisions:
  - "A latched session or command declines with its latch reason; a forced LLM turn after afterStep declines with the step's stop reason; an escalation declines with its escalation reason"
  - "An LLM selector that is an e-ref token (the form autopilot uses, e.g. selector 'e5') is tracked as a ref under the refEpoch rule; a selector over 250 characters is dropped, never cut"
  - "A menu without a non-empty signature declines menu_invalid (no latch), because no-progress and same-state both key on it"
  - "When the attempt set no stop reason, the decline that triggered the flush becomes the hand-off's stop reason if it has its own description; with nothing pending the flush clears any stale stop reason"
  - "afterStep's uncertain, stale, failed and denied outcomes count toward the consecutive-escalation latch; no effect latches the command directly"
  - "A decide that returns after the session stopped is still recorded (outcome declined, escalationReason stopped) before beforeTurn resolves stopped"
  - "latchOff keeps the first lasting reason; only a switch_off latch may be replaced"

patterns-established:
  - "68-06 wires: beforeTurn before buildTurnMessages, afterStep in place of the tool-result push for fast iterations, observeTools after the push loop on LLM iterations, flushHandoff before the follow-up recompute, abortInFlight in handleStopAutomation"
  - "68-08 capture hooks into declineWith (the single LLM-path exit after the menu) and must add its own gate before the not_enabled return for run_task sessions"

requirements-completed: [AUTO-02, AUTO-03, AUTO-04, AUTO-05]

# Metrics
duration: 20min
completed: 2026-10-17
---

# Phase 68 Plan 05: Fast-path orchestration Summary

**`FsbFastPath.beforeTurn` decides once per iteration whether FSB takes one code-built step or hands the iteration to the LLM. It applies the session and command latches, the LLM-first rule, four per-command budgets, a stored-switch re-read, one menu, the no-progress and never-re-roll rules, and one decide bounded by the time left. `afterStep` reads what that step really did and makes the LLM take over exactly once when the outcome is uncertain, stale, failed or denied. `observeTools` records what the LLM did on its own turn. Fast steps reach the LLM only as one `role:'user'` hand-off with a fresh snapshot. Everything runs against injected dependencies and the fake gateway. Nothing loads the module yet; 68-06 wires it in.**

## Performance

- **Duration:** about 20 min
- **Started:** 2026-10-17T09:56:13Z
- **Completed:** 2026-10-17T10:16Z
- **Tasks:** 2 of 2
- **Files:** 2 modified (extension/ai/jev-fast-path.js +759 lines, tests/jev-fast-path.test.js +1213 lines)

## Accomplishments

- **beforeTurn (Task 1).** It never rejects, and the whole body sits in one try/catch: an exception latches the session `exception`, still flushes any pending step, and resolves `{decline:'exception'}`.
  - **run_task (D-03):** a session whose `fastMode.enabled` is not true declines `not_enabled` before any dependency call. That includes `now()`, which is also covered by a test.
  - **One menu and one decide per iteration.** The request has the goal `session.task`, the four KINDS and no `proposedAction`. The call id is `jev_<command>_<iteration>`.
  - **Timeout:** `timeoutMs = min(FsbJevClient.DEFAULT_TIMEOUT_MS, 20000 - jevMs)`. With 18 500 ms used, the held timer sees 1500.
  - **Abort:** `inFlight` holds the AbortController. `abortInFlight` and `latchOff` abort it, and the test sees the signal passed to fetch aborted.
  - **Stop (F21):** a stop while readSwitch, requestMenu or decide is pending resolves `stopped` with no message added.
  - **Default client (D-11):** created lazily with `createJevClient({})`. The module never names a hash-key supplier.
- **flushHandoff (D-10).** It delivers what a command left pending: one snapshot, one message, then `pendingSteps` is emptied. It resolves false with zero dependency calls when nothing is pending or `_fastPath` is absent.
  - **Fields read:** neither `fastMode` nor `agentState`. A test installs throwing getters on both to prove it.
  - **Failure paths:** a rejecting snapshot or missing deps still deliver the steps with the "Snapshot unavailable" sentence.
- **afterStep (Task 2).** Synchronous, never dispatches, never throws.
  - **Evidence:** read through `classifyStepEvidence` from the real tool-executor shapes.
  - **Bookkeeping:** it pushes the pending hand-off step, updates `lastStep` and `previousStep`, and records the fast recent action at its epochs. A navigating result then moves both epochs, bfCache included.
  - **Measurement and history:** it sets the acting attempt's `stepOutcome` and counts `fastSteps`, and tags the loop's actionHistory event with `decisionSource:'jev'`.
- **observeTools (Task 2).** It marks the LLM turn, resets the fast run and the no-progress chain, and records contract-op actions with `changed` from navigation or `verification.verified` only.
  - **Epochs:** `get_page_snapshot` moves `refEpoch`, and any navigation moves both epochs.
  - **Other bookkeeping:** it notes vault tools and stores `lastLlmTools`.
  - **Inputs:** deep-frozen inputs pass unchanged.

## Decline, escalation and latch table (beforeTurn, in order)

| # | Condition | Decline reason | Latch | Escalation count | Dependency calls before it |
| --- | --- | --- | --- | --- | --- |
| c | `fastMode.enabled !== true` | `not_enabled` | none | no | none |
| - | deps missing (`now`, `readSwitch`, `requestMenu` or `requestSnapshot` not a function) | `unavailable` | session | no | none |
| d | session latched | its `offReason` | (session) | no | snapshot only if a step is pending |
| d | command latched | its `latched` reason | (command) | no | same |
| e | no LLM turn yet in this command | `first_llm_turn` | none | no | same |
| f | `yieldToLlm` (set by afterStep) | the step's stop reason, else `yield_to_llm` | none (cleared) | counted in afterStep | same |
| g | `consecutiveFast >= 3` | `consecutive_cap` | none | no | same |
| h | `steps >= 12`, `calls >= 16`, `jevMs >= 20000` | `step_budget`, `call_budget`, `time_budget` | command | no | same |
| i | a vault tool in this command | `vault_flow` | command | no | same |
| j | `readSwitch()` not true | `switch_off` | session, cleared at the next command | no | readSwitch |
| - | session no longer running after an await | `stopped` | none, no message | no | up to that await |
| l | menu null or `success !== true` | `menu_unavailable` | none | no | readSwitch, menu |
| l | menu without a url or a non-empty signature | `menu_invalid` | none | no | readSwitch, menu |
| m | `isNoProgress(lastStep, menu, previousStep)` | `no_progress` (hand-off carries the hint) | command | no | readSwitch, menu |
| n | `url + '\n' + signature` in `answeredStates` | `same_state` | none | no | readSwitch, menu |
| o | `toBuilderInput` not ok | `nothing_offerable` or `menu_invalid` | none | no | readSwitch, menu |
| p | FsbJevState unreachable | `unavailable` | session | no | readSwitch, menu |
| p | `buildRequest` refuses `sensitive_goal` | `sensitive_goal` (attempt recorded, jevCalled false) | command | no | readSwitch, menu |
| p | `buildRequest` refuses anything else | `local_invalid_request` (attempt recorded, jevCalled false) | command | no | readSwitch, menu |
| q | no wall time left | `time_budget` | command | no | readSwitch, menu |
| r | no client reachable | `unavailable` | session | no | readSwitch, menu |
| t | `evaluateDecision` escalates | its reason | session or command (classifyFallback, not_calibrated, malformed) or iteration | iteration latches count; the third in a row latches the command `escalation_latch` | readSwitch, menu, decide |
| u | `buildStaticCall` returns null | `menu_invalid` | iteration | yes | readSwitch, menu, decide |
| - | any exception | `exception` | session | no | - |

`answeredStates` gets the menu key for every `ok:true` answer, acted or escalated, and never for a fallback. A transient fallback on a page may be asked again after the next LLM turn, and a follow-up command starts with an empty list.

## afterStep outcomes

| Outcome (classifyStepEvidence) | Stop reason | Forced LLM turn | `uncertain` | Escalation run | Latch |
| --- | --- | --- | --- | --- | --- |
| progress | none | no | no | reset to 0 | none |
| unconfirmed | none | no | no | unchanged | the next menu decides (same url and signature: `no_progress`) |
| no_effect | `no_effect` | yes | no | unchanged | command `no_progress` |
| uncertain (`uncertain`: unknown outcome, mayHaveExecuted, bfCache) | `uncertain` | yes | yes | +1 | `escalation_latch` at 3 |
| uncertain (`dispatch_unconfirmed`: no content response) | `dispatch_unconfirmed` | yes | yes | +1 | same |
| stale | `stale` | yes | no | +1 | same |
| failed | `failed` | yes | no | +1 | same |
| denied (only the exact permission-denial text) | `denied` | yes | no | +1 | same |
| no result for the step's call id | `dispatch_unconfirmed` | yes | yes | +1 | session `exception` |
| an exception while reading the result | `exception` | (session off) | yes | - | session `exception` |

## Dependency contract for 68-06

- **Resolution:** the deps object is `ctx.deps`, else `globalThis.fsbFastPathDeps`.
  - **Required:** `now()` returns ms, `readSwitch()` returns `Promise<boolean>`, `requestMenu(tabId, {cap, recent, capture}, deadlineMs)` returns `Promise<menu|null>` and `requestSnapshot(tabId, deadlineMs)` returns `Promise<{success, markdownSnapshot}|null>`.
  - **Optional:** `getTabUrl(tabId)` returns `Promise<string|null>`. Only 68-08 capture uses it.
  - **Optional:** `jevClient` with a `decide`.
  - **Missing deps:** if a required member is missing, the session latches `unavailable`.
- **Rejections:** the deps should resolve null instead of rejecting, as 68-06's `fsbFastPathWithDeadline` does. A rejecting or throwing `readSwitch`, `requestMenu` or `now` is treated as an exception and latches the session. A rejecting `requestSnapshot` only loses the snapshot.
- **Call sites:**
  - `beforeTurn(session, {sessionId, iteration: iterNum})` before `buildTurnMessages`.
  - `afterStep(session, _fastStep.step, toolResults)` in place of the tool-result push on fast iterations.
  - `observeTools(session, toolCalls, toolResults)` after the push loop on LLM iterations, only when `session.fastMode`.
  - `flushHandoff(existingSession)` before the follow-up recompute, only when `_fastPath` exists.
  - `abortInFlight(session)` in `handleStopAutomation`, only when `_fastPath` exists.
- **Session fields read:** `fastMode.enabled`, `status`, `task`, `tabId`, `commandCount`, `messages`, `agentState`, `_actionHistory` (or `actionHistory`) and `jevMeasurement`.
- **Session fields written:**
  - `_fastPath` and `agentState.jevFast`;
  - `messages`: one hand-off push, plus earlier hand-off snapshots collapsed;
  - `jevMeasurement`: from the first request-building attempt;
  - one `decisionSource` key on the fast step's actionHistory event.
- **The step object:** `{callId, name, op, handle, role, label, url, signature, generation, iteration, command}`. `callId` and `name` equal the tool call's `id` and `name`, and afterStep finds its result by `callId`. Page-level steps have `handle`, `role` and `label` null.
- **For 68-08 (capture):**
  - **Where to hook in:** every LLM-path exit after the menu goes through `declineWith(session, deps, reason)`, and the menu fetched this iteration is the local `menu` in beforeTurn.
  - **run_task sessions:** they return `not_enabled` before any dependency call, so capture needs its own gate before that return.
  - **Tool names:** `_fastPath.lastLlmTools` holds the LLM's tool names.

## Task Commits

1. **Task 1: beforeTurn, with eligibility, latches, budgets, one menu, one decide, the decision and the hand-off flush.** Commit `2b998a8a` (feat). It also adds flushHandoff, latchOff, abortInFlight and 162 orchestration checks.
2. **Task 2: afterStep and observeTools.** Commit `e8e0ee70` (feat). It covers evidence, escalate-once, recent actions and the actionHistory marker, adds 81 checks, and drives the first-turn, never-re-roll and recent-descriptor cases through the real observeTools.

**Plan metadata:** the `docs(68-05)` commit that adds this SUMMARY.

## Files Created/Modified

- `extension/ai/jev-fast-path.js` (now 1692 lines): the orchestration section (deps resolution, state layout, `beforeTurn`, `deliverPending`/`flushHandoff`, `latchOff`, `abortInFlight`) and the after-step section (`afterStep`, `observeTools` and their helpers). The page-op hand-off line is also fixed.
- `tests/jev-fast-path.test.js` (now 2392 lines, 819 checks): a fake deps factory with a controllable clock, the fake-gateway client with held timers, and 26 new sections.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - D-11 correctness] e-ref selectors are tracked as refs; long selectors are dropped**
- **Found during:** Task 2
- **Issue:** Autopilot's LLM passes refs in the `selector` field (`click` with `selector: 'e5'`; tool-definitions.js). Recording that as a CSS selector would let it survive snapshots under the docEpoch rule, even though the ref is positional and re-minted by every snapshot. Cutting a selector to 250 characters could also make it match a different element.
- **Fix:** A `selector` or `ref` matching `^e[0-9]+$` (case-insensitive) is recorded as `ref`, under the refEpoch rule. A selector longer than 250 characters is recorded as null.
- **Files modified:** extension/ai/jev-fast-path.js
- **Commit:** e8e0ee70

**2. [Rule 2 - D-17/D-18] A menu without a signature declines menu_invalid**
- **Found during:** Task 1
- **Issue:** The no-progress latch and the same-state rule both key on `menu.signature`. A menu without one would silently disable both.
- **Fix:** A menu with no url or no non-empty signature declines `menu_invalid`, with no latch and no escalation count. Real 68-02 menus always carry one.
- **Commit:** 2b998a8a

**3. [Rule 1 - Hand-off text] Page-level steps no longer print an empty quoted label**
- **Found during:** Task 2
- **Issue:** A scroll or go_back step has no role or label. The 68-04 `stepLine` rendered it as `scroll control "" (page text)`, which reads badly to the LLM.
- **Fix:** Such a step now reads `N. scroll (page): <effect>`. Element steps are unchanged, and the 68-04 hand-off checks still pass.
- **Commit:** e8e0ee70

**4. [Rule 2 - D-10 truthfulness] Stop reasons in the flush**
- **Found during:** Task 1
- **Issue:** When fast steps are flushed by a decline that set no stop reason (for example `consecutive_cap`, a budget or `menu_unavailable`), the hand-off would not say why fast mode stopped. A stop reason set by an escalation with no pending step could also leak into a later, unrelated hand-off.
- **Fix:** The triggering decline becomes the stop reason when the attempt set none and `describeEscalation` has a sentence for it. With nothing pending, the flush clears `stopReason` and `uncertain`, with no call and no message.
- **Commit:** 2b998a8a

**5. [Rule 2 - D-18 truthfulness] A missing or unreadable step result is reported as uncertain**
- **Found during:** Task 2
- **Issue:** The plan latches the session (`exception`) when toolResults lacks the step's call id or an accessor throws. A dispatched step may still have run.
- **Fix:** The step is classified as uncertain (`dispatch_unconfirmed`) and still gets its pending hand-off line. For a throwing accessor, the catch block adds one uncertain pending step. The next iteration's flush therefore says "may have executed; inspect the page before retrying".
- **Commit:** e8e0ee70

**6. [Plan order - D-23] A decide that returns after a stop is still measured**
- **Found during:** Task 1
- **Issue:** The plan's order checks for a stop right after decide and records the attempt afterwards, so a call that was made, and may have been paid for, would go unrecorded.
- **Fix:** The attempt is recorded (outcome `declined`, escalationReason `stopped`, together with the call and its ms) before beforeTurn resolves `stopped`. No message is added and no tool call is returned.
- **Commit:** 2b998a8a

**7. [Plan detail] Smaller choices the plan left open**
- **Missing deps:** they are checked after `not_enabled`, so a run_task session always declines `not_enabled`.
- **Decline reasons:** a decline names its latch reason.
- **latchOff:** it keeps the first lasting reason, and only `switch_off` can be replaced.
- **Escalation run:** afterStep's escalations count toward `escalation_latch`.
- **Measurement:** the command totals' `jevMs` is the decide time on the deps clock, while the budget's `jevMs` is menu plus decide time. Local refusals count in the totals' `escalations` by reason.
- **Commits:** 2b998a8a, e8e0ee70

**8. [Test harness and commit shape] RED observed, RED and GREEN in one commit per task**
- **RED runs:** RED was run and observed before each implementation: 24 failing checks for Task 1 and 13 for Task 2.
- **Commit shape:** each task's tests and code landed in one commit, as in 68-02 and 68-04, because the suite is registered in the root chain and a red `test(...)` commit would break it.
- **Task 1 order:** the Task 1 module-surface check names only the Task 1 functions. The afterStep and observeTools existence checks moved to Task 2.

---

**Total deviations:** 8. Three close correctness or truthfulness gaps, two tighten the hand-off text, one keeps the measurement truthful, one records the open choices, and one concerns the harness and commit shape. **Impact:** nothing is loosened, and every acceptance criterion holds as written.

## TDD Gate Compliance

There are no separate `test(68-05)` commits (deviation 8). RED was observed for both tasks. Mutation spot-checks were run over a byte-restored module. All 39 mutations were caught, and the module SHA-256 was verified unchanged afterwards:
- **Task 1 (20):** the not_enabled check, the same-state check, the answered-state push, the stop checks after readSwitch and after decide, the ref and document epoch rules, the local refusal latching the session, no flush on decline, the budget bound on the timeout, the switch_off reset, the no-progress check, the escalation latch, the consecutive cap, the hand-off epoch bump, the menu time, the first-turn rule, the vault flow, the abort wiring and flushHandoff ignoring pending steps.
- **Task 2 (19):** no forced turn, no uncertain flag, no no-effect latch, progress keeping the run, no actionHistory tag, no stepOutcome, no latch on a missing result, no fast-navigation epoch bump, no snapshot bump in observeTools, e-refs as selectors, cut selectors, the effect flag treated as evidence, vault tools ignored, the chain or the fast run kept across an LLM turn, every tool recorded, no cap of 10, the page-op line reverted, and no uncertain report on an exception.

## Verification

- `node tests/jev-fast-path.test.js`: 819 PASS / 0 FAIL on Node 24, `npx --offline -y node@20` (v20.20.2) and `/tmp/fsb-node20/.../node`.
- `node tests/jev-extension-boundary.test.js`: 145 / 0 on Node 24 and Node 20.
- These also exit 0: `node tests/jev-fast-upstream-contract.test.js`, `jev-policy-tighten-only`, `jev-state`, `jev-client`, `jev-fast-menu`, `jev-fast-settings`, `delegation-phase-contract` and `node --check extension/ai/jev-fast-path.js`.
- **Regression sweep:** `node scripts/bench/sweep-tests.mjs --files extension/ai/jev-fast-path.js tests/jev-fast-path.test.js --baseline .planning/phases/68-autopilot-fast-mode/68-SWEEP-BASELINE.json` ran in the background. 3 of 3 referencing tests passed and there were no new failures. Port 7225 was held by the user's hub and left untouched, and the crawler files never changed.
- **Acceptance greps:**
  - `getHashKey` count: 0.
  - The flushHandoff export check exits 0.
  - `awk '/function afterStep/,/^  }/' ... | grep -c await` and the same check for observeTools both print 0.
  - The 68-04 bans print nothing: chrome., localStorage, serverUrl, importScripts, `://`, systemone, api.typesafe.ai, setTimeout, setInterval, `JEV_*`, meetsThreshold, probabilities, `.threshold`, estimateCost, totalCost, _costTracker, hadEffect and top-level declarations.
  - `FAST MODE HAND-OFF` appears once.
  - The FsbJev caller scan is clean.
- **Not wired yet:** `git diff --quiet 515e2b2c -- extension/background.js extension/ai/agent-loop.js extension/ai/tool-definitions.js extension/ai/ai-integration.js mcp/` exits 0, so nothing loads the module yet.
- Neither commit carries an attribution line.

## Known Stubs

None. Plan 68-06 adds the `importScripts` line, the deps object and the two agent-loop seams. The 68-08 capture hook is the `declineWith` exit described above, and no capture code exists yet, by plan.

## Deferred to Validation Block

- **M-68-07 (V5):** a real task with the switch on and the gateway disabled or uncalibrated must make at most one menu extraction and one Jev call, act on nothing, and otherwise match the switch-off path. The offline equivalent is proven here (the calibration-latch section, and every session-class fallback).
- **M-68-08 (V5):** on real pages, escalation summaries must read truthfully, and stale targets must escalate and never mis-click. The offline hand-off text cases are proven here.

Deferred: M-68-07, M-68-08 (V5)

## User Setup Required

None.

## Next Phase Readiness

Plan 68-06 can start. It needs to:
- add the fourth load line and the deps object (`fsbCreateFastPathDeps` as `globalThis.fsbFastPathDeps`, with requestMenu and requestSnapshot resolving null on failure or deadline);
- add the start and reactivation flag;
- call `flushHandoff` before the follow-up recompute;
- call `abortInFlight` in `handleStopAutomation`;
- add the two agent-loop seams, using the call sites listed in the dependency contract above.

## Self-Check: PASSED

- FOUND: extension/ai/jev-fast-path.js, tests/jev-fast-path.test.js, .planning/phases/68-autopilot-fast-mode/68-05-SUMMARY.md
- FOUND: commits 2b998a8a and e8e0ee70 on branch Jev; neither carries an attribution line
- `node tests/jev-fast-path.test.js`: 819 PASS / 0 FAIL after the last task commit
