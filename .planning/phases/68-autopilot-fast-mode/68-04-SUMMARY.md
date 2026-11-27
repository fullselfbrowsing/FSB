---
phase: 68-autopilot-fast-mode
plan: 04
subsystem: service-worker
tags: [jev, fast-mode, decision-core, fallback-classification, evidence, hand-off, measurement, auto-02, auto-03, auto-04, auto-05, d-10, d-11, d-15, d-16, d-17, d-18, d-20, d-23, f9, f11, f22]

# Dependency graph
requires:
  - phase: 68-03
    provides: "the strict content resolver (jevHandle, jevGeneration, expectedRole, expectedName), FSB.jevContentVerbOps and the refStale response shape"
  - phase: 68-02
    provides: "the menu shape {success, generation, url, title, visibleText, moreBelow, signature, count, truncated, entries, recentHandles} and its entry shape"
  - phase: 67
    provides: "FsbJevState (CONTRACT, buildRequest, validateRequest, scrubText, filterInjection), FsbJevPolicy.accept, FsbJevClient.createJevClient"
provides:
  - "extension/ai/jev-fast-path.js: FsbFastPath pure core (constants, classifyFallback, toBuilderInput, evaluateDecision, buildStaticCall, classifyStepEvidence, isNoProgress, describeEscalation, buildHandoffMessage, collapseEarlierHandoffs, ensureMeasurement, appendAttempt, addCommandTotals, attemptFromResult)"
  - "tests/fixtures/jev-fake-gateway.js: calibratedBody (test-only profile), uncalibratedBody, snapshotChangedBody, fallbackBody, makeHeldTimers, makeClient"
  - "tests/jev-fast-path.test.js (574 checks, registered)"
  - "tests/jev-extension-boundary.test.js: FAST_PATH_MODULE and ALL_MODULES (fourth enumerated module)"
affects: [68-05, 68-06, 68-07, 68-08, 68-09, 68-11, V2, V3]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Upstream modules resolved per call (root global, else require under Node, else null), so a missing module declines instead of throwing"
    - "Producer parity through real producers: evidence cases come from the real tool-executor.js over a stubbed chrome.tabs, denial cases from the real createPermissionHook over a real PermissionContext"
    - "Generated-menu parity: survivors are judged by the real buildRequest on a target-free probe, then toBuilderInput must agree"
    - "Measurement records built only from closed vocabularies (op, outcome, reason-code regex, contract fallback list), so page text cannot enter them"

key-files:
  created:
    - extension/ai/jev-fast-path.js
    - tests/fixtures/jev-fake-gateway.js
    - tests/jev-fast-path.test.js
  modified:
    - tests/jev-extension-boundary.test.js
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "offeredOps is the union of the element ops of entries that survive buildRequest's drop rules (plus scroll and go_back), and each entry's ops are reduced to the four element ops, so a dropped or text-entry-only entry never adds an op"
  - "A malformed target answer latches the session, like a malformed operation answer (tighten-only; neither can come out of a validated client result)"
  - "classifyFallback returns reason 'unknown_fallback' for a reason outside the contract, so no free string flows on into hand-off text or measurement keys"
  - "jevCalled is true for every decide() result, including decide's own local answers such as aborted, and false only for a buildRequest refusal ({ok:false, reason})"
  - "A hand-off withholds a label ('(label withheld)') when FsbJevState is unreachable; roles go through the same scrub and filter as labels"
  - "isNoProgress's repeat rule needs both steps to have been dispatched; a stale or denied earlier step never ran"

patterns-established:
  - "68-05 consumes: toBuilderInput -> FsbJevState.buildRequest -> decide -> evaluateDecision -> buildStaticCall; classifyStepEvidence -> isNoProgress; describeEscalation -> buildHandoffMessage -> collapseEarlierHandoffs; attemptFromResult -> appendAttempt / addCommandTotals"
  - "Tests that need a decide() answer use gateway.makeClient(responder) with held timers, never the global setTimeout"

requirements-completed: [AUTO-02, AUTO-03, AUTO-04, AUTO-05]

# Metrics
duration: 23min
completed: 2026-10-17
---

# Phase 68 Plan 04: Fast-path decision core Summary

**`FsbFastPath` turns a content menu into a validated Jev request and turns a Jev answer into either one tool call built from code-held values or a typed escalation with the right latch. It reads Jev decisions only through `FsbJevPolicy.accept`. It also classifies what a fast step really did, writes the truthful hand-off text the LLM will receive, and keeps Jev measurement separate, labelled and free of page content. Everything is proven offline with a fake gateway and a test-only calibrated profile. Nothing loads the module yet; plan 68-06 adds the `importScripts` line.**

## Performance

- **Duration:** about 23 min
- **Started:** 2026-10-17T09:25Z, right after the 68-03 docs commit
- **Completed:** 2026-10-17T09:47Z
- **Tasks:** 2 of 2
- **Files:** 6 (3 created, 3 modified)

## Accomplishments

- **Module shape (67 D-17, F12, D-06).** One named IIFE, `root.FsbFastPath = api`, the `module.exports` guard, and nothing at load. `FsbJevState` and `FsbJevPolicy` are resolved inside each call.
  - **Load:** in a context holding only `console`, the file adds exactly `FsbFastPath`, logs nothing and calls no timer.
  - **Missing upstream:** with no upstream reachable, `evaluateDecision` declines `unavailable` with a session latch, and a hand-off withholds labels.
  - **Bans:** none of the 67-11 bans match, and no `meetsThreshold`, `probabilities` or `.threshold` token appears.
- **Boundary suite (D-06).** `jev-fast-path.js` is the fourth enumerated module (`FAST_PATH_MODULE`, `ALL_MODULES`). It is covered by:
  - the jev-*.js bans, and the one-URL scan (still exactly one URL, the endpoint in jev-client.js);
  - the exact file set, and the caller-scan exemption;
  - the inert loads, alone and under read traps;
  - the four-module exact-globals check.

  The background.js check stays on the three load lines until 68-06. Three new self-test probes show:
  - the module list grew by exactly one entry;
  - `FsbFastPath` does not trip the `FsbJev` caller prefix, while `FsbJev*` still does;
  - every module ban and the URL scan still fire.
- **Request mapping (D-11, D-13, D-15, sync issue 6).** `toBuilderInput` reduces each entry to exactly `{id: handle, role, label, ops, inputType, autocomplete, purpose:{sensitive}, hidden}`.
  - **Request contents:** kinds `operation, target, completion, stuck`; no `proposedAction`; the goal unchanged; `vaultFilledIds`; at most 10 recent actions with handle-or-null targets and boolean `changed`.
  - **Parity:** the result passes the real `buildRequest`, `FsbJevState.validateRequest` and the server `validateRequest`.
  - **Empty target set:** a menu whose entries buildRequest would all drop declines `nothing_offerable`, even with scroll and go_back offered. The real `buildRequest` refuses that same menu as `invalid_request`.
  - **Generated menus:** across 400 deterministic menus, toBuilderInput is ok exactly when an entry survives and something is offerable. With a page op forced on, it is ok exactly when an entry survives.
- **Decisions (D-16, D-17, D-20, F22).** `evaluateDecision` runs over real `FsbJevClient` results from the fake gateway. The held timers record the 2500 ms deadline.
  - **Acts:** a calibrated click on a button, and check_box on an unchecked box.
  - **Page ops:** scroll and go_back act on a catch_all, below-threshold or not-a-fit target. A confident element pick with a page op escalates `page_op_with_target`.
  - **Calibration:** an uncalibrated or snapshot_changed answer latches the session.
  - **Fallbacks:** every gateway fallback, network_error, aborted, a fired deadline and a pre-deploy 404 (invalid_request, session) take their class's latch.
- **Static calls (D-15, F1, F2, AUTO-03).** `buildStaticCall` builds args only from the menu entry and constants. `pagePath` lives on the call object, never in args.
  - **Args per op:** click, hover and press_enter get exactly `{jevHandle, jevGeneration, expectedRole, expectedName, visual_reason}`. check_box adds `checked: true`. scroll is `{direction:'down', visual_reason}` and go_back is `{visual_reason}`.
  - **Hostile body:** a validated body whose `decisionId`, `servedModel` and `profileId` carry a marker produces a call without it.
  - **pagePath:** `https://example.test/wizard/step-2?token=abc#frag` gives `/wizard/step-2`, capped at 60 characters, and '' for an unparseable or non-web address.
  - **Registry tools:** each element op's registry tool routes to content with verb `click`, `toggleCheckbox`, `pressEnter` or `hover`.
- **Evidence (D-17, D-18, F11, sync issue 2).** `classifyStepEvidence` is checked against real tool-executor shapes. A channel closed by the navigation, a closed port, a closed tab and no answer are all `uncertain` (`dispatch_unconfirmed`). bfCache is `uncertain` although it reports success with navigation. The real permission hook's denial is `denied` only for the step's own tool. Flipping the success-equals-effect flag never changes any outcome.
- **No progress (D-17, sync issue 4).** These cases latch:
  - a verified click followed by an unchanged url and signature;
  - any dispatched step on an unchanged page;
  - the same op on the same role and label twice with no observed effect.

  These do not:
  - stale or denied steps;
  - a changed signature with no repeat;
  - a repeat in which one step observed an effect.
- **Hand-off text (D-10, T-68-06).** Each label goes through `filterInjection(scrubText(...))`, is folded to one line and has its quotes replaced. It is capped at 80 code points and quoted as page text. A label cannot forge a snapshot header line or close its own quote. The message never claims the task is done, and it says "not permitted" only for a denied step. `collapseEarlierHandoffs` is idempotent and touches only earlier `role:'user'` hand-offs with string content.
- **Measurement (D-23, T-68-11).** Every number is null until a value arrives, never 0, and every usage and cost figure keeps its source label. Extras outside their closed vocabularies become null. The cost tracker and the provider cost fields are never touched. A scan of the records from a marked menu finds no label, URL, title, goal or page text.

## Fallback classification (classifyFallback, every CONTRACT.FALLBACK_REASONS member)

| Latch | Reasons |
| --- | --- |
| session (8) | the six `NON_TRANSIENT_REASONS`, read from CONTRACT at call time: `disabled`, `not_configured`, `spend_cap_reached`, `auth_error`, `upstream_billing`, `unavailable_model`. Also `invalid_request` (including the pre-V2 404) and `invalid_response` |
| command (1) | `sensitive_goal` |
| iteration (10) | `busy`, `timeout`, `rate_limited`, `upstream_overloaded`, `upstream_error`, `network_error`, `server_error`, `aborted`, `payload_too_large`, `upstream_rejected` |
| session (fail closed) | any other value, returned as reason `unknown_fallback` |

classifyFallback classifies decide() results only. A local `buildRequest` refusal is a page property, and 68-05 step p latches the command for it (`sensitive_goal`, or `local_invalid_request`).

## Escalation reason codes (evaluateDecision, in order)

| Reason | Latch | When |
| --- | --- | --- |
| a fallback reason or `unknown_fallback` | per the table above | `result.ok !== true` |
| `unavailable` | session | `FsbJevPolicy` is unreachable |
| `not_calibrated` | session | the operation answer comes from an uncalibrated or snapshot_changed profile |
| `operation_malformed` | session | the operation answer is malformed |
| `jev_stuck` | iteration | `accept(result, 'stuck')` is accepted |
| `completion_unconfirmed` | iteration | completion is neither accepted nor `threshold_null` |
| `operation_below_threshold`, `operation_catch_all`, `operation_threshold_null`, `operation_kind_absent` | iteration | the operation is not accepted |
| `op_not_offered` | iteration | the op is not a fast op, is `type_text` or `select_option`, or is not in offeredOps |
| `page_op_with_target` | iteration | scroll or go_back with a confident element pick |
| `target_<reason>` | iteration (`target_malformed`: session) | an element op without an accepted target, or a page op whose target reason is not catch_all, below_threshold or threshold_null |
| `unknown_target` | iteration | the choice is not an own key of idMap, or its handle is not in the menu |
| `op_not_in_element_ops` | iteration | the op is not in the entry's code-derived ops |
| `risk_excluded` | iteration | `entry.risk !== null` |
| `not_fast_eligible` | iteration | `entry.fastEligible !== true` |

Evidence outcomes and reasons from `classifyStepEvidence`:

| Outcome | Reason | Effect observed |
| --- | --- | --- |
| stale | `stale` | false |
| uncertain | `uncertain` (unknown outcome, mayHaveExecuted or bfCache) | false |
| uncertain | `dispatch_unconfirmed` (no content response, not a denial) | false |
| denied | `denied` | false |
| failed | `failed` | false |
| no_effect | `no_effect` | false |
| progress | `progress` | true |
| unconfirmed | `unconfirmed` | false |

`describeEscalation` has its own sentence for every code above. It also covers the 68-05 codes: `stale`, `uncertain`, `dispatch_unconfirmed`, `failed`, `denied`, `no_effect`, `no_progress`, `same_state`, `step_budget`, `call_budget`, `time_budget`, `consecutive_cap`, `escalation_latch`, `vault_flow`, `switch_off`, `menu_unavailable`, `menu_invalid`, `nothing_offerable`, `local_invalid_request`, `sensitive_goal`, `exception` and `unavailable`. Any other code gets "Fast mode stopped and handed this step back to you."

## Constants (FsbFastPath.constants, frozen)

| Name | Value |
| --- | --- |
| MENU_CAP | 48 |
| FAST_MAX_STEPS | 12 |
| FAST_MAX_CALLS | 16 |
| FAST_WALL_BUDGET_MS | 20000 |
| FAST_MAX_CONSECUTIVE | 3 |
| FAST_ESCALATION_LATCH | 3 |
| MENU_DEADLINE_MS | 1500 |
| SNAPSHOT_DEADLINE_MS | 3000 |
| RECENT_ACTIONS_MAX | 10 |
| MEASUREMENT_ATTEMPTS_MAX | 100 (the commands list is capped at the same size) |
| KINDS | operation, target, completion, stuck |
| ELEMENT_OPS | click, check_box, press_enter, hover |
| PAGE_OPS | scroll, go_back |
| NEVER_OFFERED | type_text, select_option |
| VAULT_TOOL_NAMES | fill_credential, use_payment_method, list_credentials, list_payment_methods |
| FAST_VISUAL_REASON | `Fast mode: simple step` |
| SUMMARY_PREFIX | `FAST MODE HAND-OFF` |
| SNAPSHOT_HEADER | `Current page snapshot (these refs replace any earlier refs):` |
| SNAPSHOT_COLLAPSED | `(Snapshot removed: a later fast-mode hand-off carries the current page.)` |

## Task Commits

1. **Task 1: Module skeleton, fallback classes, request input mapping, accept-only decision evaluation and the static call builder.** Commit `35aaf569` (feat). It includes the fixture, the suite, the boundary-suite extension and the registration.
2. **Task 2: Evidence classification, no-progress rule, hand-off text and measurement helpers.** Commit `63043b7c` (feat).

**Plan metadata:** the `docs(68-04)` commit that adds this SUMMARY.

## Files Created/Modified

- `extension/ai/jev-fast-path.js` (new, 930 lines): the FsbFastPath pure core.
- `tests/fixtures/jev-fake-gateway.js` (new): fake gateway bodies, held timers and `makeClient` over `createJevClient({endpoint, fetchImpl, now, setTimeoutImpl, clearTimeoutImpl})`.
- `tests/jev-fast-path.test.js` (new, 574 checks).
- `tests/jev-extension-boundary.test.js`: the fourth enumerated module, three self-test probes and the updated header.
- `package.json` and `tests/delegation-phase-contract.test.js`: `node tests/jev-fast-path.test.js` appended once each, after `node tests/jev-fast-menu.test.js`.

## Decisions Made

See `key-decisions` in the frontmatter. Also:
- **Menu validation:** toBuilderInput answers `menu_invalid` for any of these:
  - not an object, or `success !== true`;
  - entries that are not an array;
  - a URL that is not an http(s) address;
  - a non-string title or text;
  - an entry that is not an object, or whose handle does not match `^j[1-9][0-9]{0,2}$`;
  - duplicate handles;
  - a non-string role or label, or ops that are not an array.
- **offeredOps order:** canonical, `click, check_box, press_enter, hover, scroll, go_back`, keeping only the ops that are offered.
- **buildStaticCall refusals:** it returns null for anything but an acting decision. An element op also needs a valid handle equal to `entry.handle`, string role and label, and a non-empty generation. Every call needs a non-empty callId.
- **Attempt record keys:** in this order, `iteration, command, decisionSource, jevCalled, servedModel, instrumentVersion, calibrationStatus, latencyMs, usage, cost, fallback, outcome, escalationReason, op, stepOutcome`. `stepOutcome` stays null until 68-05's afterStep sets it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Tighten-only] A malformed target answer latches the session**
- **Found during:** Task 1
- **Issue:** The plan latches the session only for a malformed operation answer. A malformed target answer would have cost one iteration.
- **Fix:** `target_malformed` latches the session, for page ops and element ops alike. A validated client result can never be malformed, so this only matters if the contract drifts.
- **Files modified:** extension/ai/jev-fast-path.js
- **Commit:** 35aaf569

**2. [Rule 2 - Information hygiene] Closed vocabularies wherever a string flows on**
- **Found during:** Tasks 1 and 2
- **Issue:** The plan gives no rule for these cases:
  - an unknown fallback string;
  - free-text measurement extras;
  - escalation keys;
  - a hand-off built while FsbJevState is unreachable.
- **Fix:**
  - `classifyFallback` returns reason `unknown_fallback`.
  - Attempt extras are kept only inside their vocabularies.
  - Escalation keys must match `^[a-z][a-z0-9_]{0,63}$`, else they count as `other`.
  - Roles are scrubbed and filtered like labels.
  - Labels are withheld when FsbJevState is unreachable.
- **Files modified:** extension/ai/jev-fast-path.js
- **Commits:** 35aaf569, 63043b7c

**3. [Plan wording] offeredOps from surviving entries, entry ops reduced to element ops**
- **Found during:** Task 1
- **Issue:** "The union of entry ops" could include ops that only dropped entries carry, or `type_text`/`select_option` or page ops that an entry claims.
- **Fix:** Only entries that survive buildRequest's drop rules add ops, and an entry's ops are filtered to the four element ops. Both changes only narrow what is offered.
- **Commit:** 35aaf569

**4. [Plan wording] isNoProgress's repeat rule requires both steps to have been dispatched**
- **Found during:** Task 2
- **Issue:** A stale or denied earlier step never ran, so it cannot show that a repeated action had no effect.
- **Fix:** The repeat rule needs both outcomes in progress, unconfirmed, no_effect, uncertain or failed. The unchanged-signature rule follows the plan as written.
- **Commit:** 63043b7c

**5. [Test harness] Real producers, a URL-bearing vm context, mutated results and RED/GREEN per task commit**
- **Found during:** both tasks
- **Issue and fix:**
  - **Real producers:** the evidence cases are produced by the real `tool-executor.js` `executeTool` over a stubbed `chrome.tabs`, rather than hand-written shapes. This applies gotcha 6 more strictly.
  - **vm context:** the call-time "missing upstream" checks run in a vm context that holds `console` and `URL`, because vm contexts have no web APIs. The plan's own load check still uses a context holding only `console`.
  - **Mutated results:** the `operation_malformed` and `type_text` cases mutate a real client result, because the real client never delivers either.
  - **Generator weights:** the generated-menu weights were tuned so that both outcomes are exercised (86 ok, 314 declined).
  - **Commit shape:** RED was observed before each implementation (Task 1: 23 failing checks with no module; Task 2: 6 failing sections). RED and GREEN landed in one commit per task, as in 68-02, because a separate `test(...)` commit would register a red suite in the root chain.
- **Commits:** 35aaf569, 63043b7c

---

**Total deviations:** 5. Two close leaks, two clarify plan wording and one concerns the test harness and commit shape. **Impact:** nothing is loosened. Every acceptance criterion holds as written.

## TDD Gate Compliance

There are no separate `test(68-04)` commits (deviation 5). RED was run and observed for both tasks before the implementation. Mutation spot-checks confirmed that the key cases are not vacuous. Each of these 15 mutations was caught, and the module was restored byte-for-byte afterwards:
- Task 1 (7): the autocomplete drop, the hidden drop, the risk check, the completion gate, the page-op target check, `checked: true` and the empty-target decline.
- Task 2 (8): the bfCache rule, a loose denial text, a null response classed as failed, reading the effect flag, no scrub in the hand-off, the unchanged-signature rule, free-text escalation keys and collapse idempotence.

## Verification

- `node tests/jev-fast-path.test.js`: 574 PASS / 0 FAIL on Node 24, `npx --offline -y node@20` and `/tmp/fsb-node20/.../node` (v20.20.2).
- `node tests/jev-extension-boundary.test.js`: 145 / 0 on Node 24 and Node 20.
- These exit 0: `node tests/jev-fast-upstream-contract.test.js`, `node tests/jev-policy-tighten-only.test.js`, `node tests/delegation-phase-contract.test.js`, `npm run validate:extension` and `node --check extension/ai/jev-fast-path.js`.
- Tree-walking suites that could notice a new extension file all exit 0: `no-dead-entry`, `overlay-content-audit`, `overlay-stability-cadence` and `agent-pooling`.
- The background sweep over the three new or changed files ran against `68-SWEEP-BASELINE.json`: 4 of 4 selected tests passed, no new failures, exit 0. Port 7225 was held by the user's hub and left untouched. The crawler files never changed.
- Acceptance greps:
  - The ban grep (`chrome.`, localStorage, serverurl, importScripts, `://`, systemone, api.typesafe.ai, setTimeout, setInterval), the `JEV_*` grep, the `meetsThreshold|probabilities|\.threshold\b` grep, the top-level declaration grep and the `estimateCost|totalCost|_costTracker|hadEffect` grep all print nothing.
  - `grep -c "FAST MODE HAND-OFF"` prints 1.
  - The classifyFallback node one-liner exits 0.
  - `grep -rl "FsbJev" extension/ | grep -v "extension/ai/jev-"` prints nothing.
- `extension/background.js`, `extension/ai/agent-loop.js`, `extension/ai/tool-definitions.js`, `extension/ai/ai-integration.js` and `mcp/` are unchanged since 515e2b2c. Nothing loads the module yet.
- No calibrated profile is committed. The only calibrated answer is the fixture's test-only `test-calibrated` body.

## Known Stubs

None. The module is intentionally not loaded yet. Plan 68-05 adds the orchestration (`beforeTurn`, `afterStep`, `observeTools`, `flushHandoff`, `latchOff`, `abortInFlight`) on top of these helpers, and plan 68-06 adds the `importScripts` line and the two agent-loop seams.

## Deferred to Validation Block

- **M-68-04 (V3):** a calibrated profile must make these decisions act on the bench fixtures. Revisit the numeric defaults (MENU_CAP 48, 12 steps, 16 calls, 20 s, 3 consecutive steps, escalation latch 3, menu deadline 1.5 s, snapshot deadline 3 s).
- **M-68-02 (V2 note):** before the V2 deploy, a pre-deploy 404 maps to `invalid_request`, which latches the session after one call. This is proven offline here and by design.

Deferred: M-68-02 (V2), M-68-04 (V3).

## User Setup Required

None.

## Next Phase Readiness

Plan 68-05 can start. The pieces it needs:
- **Request path:** `toBuilderInput(menu, {goal: session.task, recentActions, navigatedInCommand})`, then `FsbJevState.buildRequest(input)`. A `{ok:false}` there latches the command and never goes through classifyFallback.
- **Decision path:** `client.decide(request, {signal, timeoutMs})`, then `evaluateDecision(result, {request, idMap, entriesByHandle, offeredOps})`, then `buildStaticCall(decision, {generation: menu.generation, callId, pageUrl: menu.url})`.
- **Step results:** `classifyStepEvidence(step.op, toolResult)` gives `{outcome, reason, effectObserved}`. The hand-off step `effect` is that outcome code.
- **Tests:** they inject `gateway.makeClient(responder)` with held timers.

## Self-Check: PASSED

- FOUND: extension/ai/jev-fast-path.js, tests/fixtures/jev-fake-gateway.js, tests/jev-fast-path.test.js, tests/jev-extension-boundary.test.js, this SUMMARY
- FOUND: commits 35aaf569 and 63043b7c on branch Jev; neither carries an attribution line
- `node tests/jev-fast-path.test.js`: 574 PASS / 0 FAIL after the last commit
