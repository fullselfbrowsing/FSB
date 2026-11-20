P70_START=3f7efb0ac7aae5607b97f0e5c3b26f41733a3e8e

# Phase 70: Sync re-check at P70_START (D-24)

**Recorded:** 2026-10-17, plan 70-01 Task 1, before any Phase 70 source edit.
**Tree:** branch Jev at `3f7efb0a` ("docs(phase-68): update tracking after phase execution"). The Phase 68 code-review fixes (`2788ebfc` CR-01 through `38312ca1` IN-06) are in this tree, so every fact below is read after them.
**Upstream finished:** `66.1-08-SUMMARY.md`, `67-13-SUMMARY.md`, `68-11-SUMMARY.md` and `69-08-SUMMARY.md` exist. Phase 68's highest-numbered plan is 68-12 (`68-12-SUMMARY.md` also exists); 68-11 is its gate plan, so both are present. `git status --porcelain -- extension tests package.json scripts showcase mcp` printed nothing.
**Guard:** `tests/jev-run-task-upstream-contract.test.js` (registered in the root chain and `REFINEMENT_ROOT_TEST_COMMANDS`, plan 70-01 Task 2) asserts the names and behaviour below and fails loudly on drift.

Later Phase 70 plans read this file first. The "Drift substitutions" section (item t) is authoritative over any name or shape quoted in a Phase 70 plan.

## Interface re-check

| Interface | Quoted at | Real location (file:line) | Status |
| --- | --- | --- | --- |
| `fsbFastModeSessionField(storedValue, source)` and its return shapes | 68-06-PLAN.md:108, :118-119 | `extension/background.js:4011-4015`; spread `...(fastModeField ? { fastMode: fastModeField } : {}),` at :14226; computed at :14200 | MATCH (item a) |
| `fsbRecomputeFastModeForFollowUp(existingSession, source)` | 68-06-PLAN.md:118-121 | `extension/background.js:4150-4168` (flush, then one `getStorageWithTimeout` read, then assign or delete) | MATCH |
| 68-06 source checks in tests/jev-fast-start-path.test.js (settings-read key array, createSessionHooks SHA-256 literal) | 68-06-PLAN.md:112 | `tests/jev-fast-start-path.test.js:547-571` (read, fieldLine, spread, agent-return order); `:55` `CREATE_SESSION_HOOKS_SHA256`, asserted at `:606-608` | MATCH |
| `FsbFastPath.constants` values | 68-04-PLAN.md:77 | `extension/ai/jev-fast-path.js:40-60` (deep-frozen literal) | MATCH (item b; key set is pinned, see item b) |
| `FsbFastPath` export list | 68-04/68-05/68-08 | `extension/ai/jev-fast-path.js:2108-2130` (`var api = {...}`, not frozen), `root.FsbFastPath = api` :2131, `module.exports = api` :2132 | MATCH (item b) |
| `classifyStepEvidence(op, toolResult)` | 68-04-PLAN.md:82, :146 | `extension/ai/jev-fast-path.js:496-514` | CHANGED (item f: reason `dispatch_unconfirmed` also has outcome `uncertain`; Drift substitution 3) |
| `ensureMeasurement`, `appendAttempt`, `addCommandTotals` | 68-04-PLAN.md:87 | `jev-fast-path.js:830-837`, :840-848, :905-938 | MATCH |
| `attemptFromResult` attempt keys (quoted as including `calibrationStatus`, `jevCalled`, `toolMs`) | 68-04-PLAN.md:87 | `jev-fast-path.js:858-896`; keys are exactly `iteration, command, decisionSource, jevCalled, servedModel, instrumentVersion, calibrationStatus, latencyMs, usage, cost, fallback, outcome, escalationReason, op, stepOutcome` | CHANGED (no `toolMs`; item c; Drift substitution 4) |
| `describeEscalation(reason)` code set | 68-04 Task 2 step 2 | `jev-fast-path.js:552-641` (`ESCALATION_TEXT` table :552-608, `CHOICE_TEXT` :611-630, generic sentence :632) | MATCH (item d) |
| `session.fastMode {enabled, stored, source}` | 68-05-PLAN.md:72 | read at `jev-fast-path.js:1315` (`enabled`) and :1859 (`stored`) | MATCH |
| `session._fastPath` layout `{off, offReason, offCommand, inFlight, pendingSteps, stopReason, uncertain, recent, lastLlmTools, refEpoch, docEpoch}` | 68-05-PLAN.md:73 | `jev-fast-path.js:1011-1034` (`fastPathOf`) | CHANGED (item c; Drift substitution 5) |
| `session.agentState.jevFast` layout | 68-05-PLAN.md:74 | `jev-fast-path.js:1042-1073` (`commandStateOf`) | CHANGED (item c; Drift substitution 5) |
| `beforeTurn(session, {sessionId, iteration, deps?})` | 68-05-PLAN.md:78 | `jev-fast-path.js:1279-1299` (capture wrapper) | MATCH |
| beforeTurn steps a-v | 68-05-PLAN.md:119-140 | steps a-u live in the inner `attemptStep(session, ctx, capture)` at `jev-fast-path.js:1307-1509`; the step-v flush helper is `deliverPending(session, deps, reason)` at :1172-1208 | RENAMED (item b; Drift substitution 1) |
| `afterStep(session, step, toolResults)` | 68-05-PLAN.md:79 | `jev-fast-path.js:1604-1689` (synchronous, no await) | MATCH |
| `observeTools(session, toolCalls, toolResults)` | 68-05-PLAN.md:80 | `jev-fast-path.js:1736-1779` (synchronous, no await) | MATCH |
| `latchOff(session, reason)`, `abortInFlight(session)` | 68-05-PLAN.md:81 | `jev-fast-path.js:1091-1104`, :1076-1084 | MATCH |
| `flushHandoff(session, ctx?)` | 68-05-PLAN.md:82, 68-06-PLAN.md:121 | `jev-fast-path.js:1218-1228` (calls `deliverPending`) | MATCH |
| `createHarness({providerKey, loadFastPath, sessionPatch, contentResponder, providerScript, deps, jevClient, permissionDenies})` | 68-06-PLAN.md:160 | `tests/fixtures/agent-loop-fast-harness.js:211-223` (option list), returns :548-572 | CHANGED (superset; item h; Drift substitution 6) |
| `tests/fixtures/jev-fake-gateway.js` (`calibratedBody`, `uncalibratedBody`, `snapshotChangedBody`, `fallbackBody`, `makeClient`) | 68-04 (68-06-PLAN.md:160) | exports `TEST_ENDPOINT, SERVED_MODEL, INSTRUMENT_VERSION, CATCH_ALL, optionKeys, calibratedBody, uncalibratedBody, snapshotChangedBody, fallbackBody, makeHeldTimers, makeClient` | MATCH (superset) |
| 68-08 capture gate cases naming run_task | 68-08-PLAN.md:103-104 | item g | MATCH |
| 68-08 lazy `TOOL_REGISTRY` resolution in jev-fast-path.js | 68-08-PLAN.md:115 | `function toolRegistry()` at `jev-fast-path.js:1999-2010`, `toolDefinitionOf(name)` :2012-2019 | MATCH (item e) |
| 68-08 exporter goal rule (`deriveRecords`) | 68-08-PLAN.md:28, :144 | `scripts/bench/shadow/export-capture.mjs` `goalOf(task)` :146-150 (not exported), `START_PREFIX` :78, `deriveRecords` :198 (exported) | MATCH (item k) |
| `cloneJevMeasurementForPersistence` | 68-09-PLAN.md:20-31 | `extension/utils/automation-logger.js:319`; called at :1104 and :1112 | MATCH (item q, Task 2) |
| `projectJevMeasurement` | 68-09-PLAN.md:20-31 | `extension/ws/mcp-tool-dispatcher.js:2774`; called at :2367-2369 | MATCH (item q, Task 2) |
| tests/fixtures/jev-fast-disclosure-facts.js exports `SHARED_PHRASES, CARD_ONLY_PHRASES, PAGE_ONLY_PHRASES, FORBIDDEN_PATTERNS, ENFORCEMENT, textOf(html)` | 68-12-PLAN.md:24 | `tests/fixtures/jev-fast-disclosure-facts.js:128-135` (29 / 2 / 6 / 4 / 4 entries) | MATCH (item j) |
| Card markers `id="fsbJevFastModeCard"` .. `<!-- /fsbJevFastModeCard -->` | 68-12-PLAN.md:120 | `extension/ui/control_panel.html:636` and `:665` | MATCH (item j) |
| Privacy Control fact names the MCP settings tool | 68-10-PLAN.md:71 | `showcase/angular/src/app/pages/privacy/privacy-page.component.html:65` (`@@privacy.section.jevFastMode.control`) | MATCH (item j) |
| Card copy has no MCP or settings-tool sentence | 68-12-PLAN.md:125 | card text (item j) | MATCH |
| `FsbJevState.scrubText`, `matchesSecret`, `toOriginPath` | 67-06-PLAN.md:69-76 | `extension/ai/jev-state.js:277-284`, :287-289, :672-680 (path scrubbed per segment by `scrubPathSegment` :657-663) | MATCH (item l) |
| `FsbJevState.buildRequest(input, {byteBudget})` -> `{ok:true, request, idMap, stats}` or `{ok:false, reason:'invalid_request'|'sensitive_goal'}` | 67-06-PLAN.md:69-75 | `jev-state.js:763-939`; secret check on the untruncated goal :780 | MATCH (item l) |
| Goal over `CAPS.goalChars` (1000) gives `invalid_request` | 67-01-PLAN.md:90, :189 (quoted by 70-CONTEXT D-22 and 70-04) | `jev-state.js:125` `goalChars: 1000`; `buildRequest` truncates the goal at :851 (`truncateCodePoints(input.goal, CAPS.goalChars)`); only the validator `:373` refuses an over-cap goal, and `buildRequest` validates the truncated request | CHANGED (item l; Drift substitution 7) |
| `CONTRACT.FALLBACK_REASONS` (19), `NON_TRANSIENT_REASONS` (6) | 67-01-PLAN.md:82, :85 | `jev-state.js:43-67`, :91 | MATCH |
| `matchesSecret(s) === (scrubText(s) !== s)` | 67-01-PLAN.md:152 | `jev-state.js:287-289` | MATCH |
| tests/helpers/mcp-in-process.mjs (`createInProcessClient({runtimePath, bridge, agentScope})`, `makeStubBridge({onSend})` with `calls`, `makeMockAgentScope()`, `assertBuildFresh()`) | 69-01-PLAN.md:140-146, :198-203 | `tests/helpers/mcp-in-process.mjs:16` re-exports `scripts/mcp/lib/tools-list.mjs` (`makeMockAgentScope` :43, `makeStubBridge` :56, `createInProcessClient` :70); `assertBuildFresh` :51 | MATCH (item m) |
| `tests/mcp-tools-list-shape-freeze.test.js`, `tests/mcp-expect-caller.test.mjs` | 69-06-PLAN.md:12, 69-07-PLAN.md:10 | both exist (also `tests/mcp-expect-wire.test.js`) | MATCH (item m) |
| `mapFSBError` success passthrough `JSON.stringify(fsbResult, null, 2)` | mcp/src/errors.ts ~:452-454 | `mcp/src/errors.ts:473-475` (inside `if (fsbResult && fsbResult.success) {`) | MATCH (line moved; item m) |
| Bridge anchors (`_handleStartAutomation`, `response.sessionId`, guarded `activeSessions` read, `settle`, safety net, `handleComplete`/`handleError`, listeners, `_sendResult`) | interfaces block (e1e6439c lines) | item n (Task 2) | MATCH (lines moved) |
| background.js anchors (`createSessionHooks`, `handleStartAutomation`, `tabInfo`, `activeSessions.set`, `sessionHooks`/`runAgentLoop`, stop broadcast) | interfaces block | `createSessionHooks` :4735-4766; `handleStartAutomation` :13941; `tabInfo = await chrome.tabs.get(targetTabId);` :14077 and :14143; `activeSessions.set(sessionId, sessionData);` :14246; `sendResponse({ success: true, sessionId, ...` :14349-14356; `const sessionHooks = createSessionHooks(sessionId);` :14466 then `runAgentLoop(sessionId, {` :14467; stop broadcast :14729-14742 (`outcome: 'stopped'` :14738, `reason: 'user_stopped'` :14739, `stopped: true` :14740) | MATCH (lines moved; items o, p) |
| agent-loop.js emits (BEFORE_TOOL_EXECUTION with the denial lookup, AFTER_TOOL_EXECUTION, AFTER_ITERATION, meta-cognitive force stop) | interfaces block | BEFORE emit :2335-2340, denial lookup `(permResult.results || []).find(function(r) { return r && r.denied; })` :2342; AFTER emit :2915-2919; AFTER_ITERATION emit :3014-3019; force stop :2972-2991 | MATCH (lines moved; item p) |
| tests/run-task-resolve-discipline.test.js harness parts | :31-44, :150-262, :281-290, :295-316 | counters :31-41, `flushMicrotasks` :43-45, chrome mock with `runtime.onMessage._emit` :82-110, `FakeWebSocket` :112-130, virtual clock :134-204, task-store stub recording `writeSnapshotCalls` :210-227, `buildHarness` :206-281, `runTest` :285-294, bus settle :301-327 | MATCH (lines moved) |
| tests/ownership-leakage-regression.test.js `extractNamedFunction(source, name)` | :19-33 | `tests/ownership-leakage-regression.test.js:19-33` | MATCH |
| `scripts/bench/sweep-tests.mjs` usage and exit codes | `--files <paths> [--baseline <json>] [--out <json>]`; 1 failures, 2 usage | `scripts/bench/sweep-tests.mjs:31-46` (also `--per-test-timeout-ms`) | MATCH |

No row is MISSING, so the phase proceeds. None of the stop-condition interfaces (`fsbFastModeSessionField`, `FsbFastPath.beforeTurn`, `FsbFastPath.flushHandoff`, `FsbFastPath.classifyStepEvidence`, `FsbJevState.buildRequest`, `FsbJevState.scrubText`, `FsbJevState.matchesSecret`, the harness, the fake gateway, the in-process helper, the disclosure fixture) is missing.

## a. `fsbFastModeSessionField`

Exact source (`extension/background.js:4011-4015`):

```javascript
function fsbFastModeSessionField(storedValue, source) {
  if (storedValue !== true) return null;
  const from = typeof source === 'string' && source ? source : null;
  return { enabled: from !== 'mcp', stored: true, source: from };
}
```

Its doc comment (`background.js:4002-4010`) says "a run_task start (source 'mcp') carries enabled:false and never takes a fast step (D-03)"; no test pins that comment text.

Real return values (evaluated in a vm from the extracted text):

| Input | Result |
| --- | --- |
| `(true, undefined)` | `{"enabled":true,"stored":true,"source":null}` |
| `(true, 'dashboard')` | `{"enabled":true,"stored":true,"source":"dashboard"}` |
| `(true, 'mcp')` | `{"enabled":false,"stored":true,"source":"mcp"}` |
| `(false, 'mcp')` | `null` |
| `(undefined, 'mcp')` | `null` |
| `('true', 'mcp')` | `null` |

**The line that produces the MCP-disabled result** is the `enabled` expression, false only for `'mcp'`, quoted verbatim:

```javascript
  return { enabled: from !== 'mcp', stored: true, source: from };
```

There is no separate `source === 'mcp'` return. Plan 70-02 replaces this one line (D-04), not shadows it.

Test lines that pin its text or its MCP result (the cases D-05 inverts):
- `tests/jev-fast-start-path.test.js:221-222`: `(true, "mcp") -> {enabled:false, stored:true, source:"mcp"} (run_task never fast-steps)`.
- `tests/jev-fast-start-path.test.js:444-448`: `fsbRecomputeFastModeForFollowUp(session, 'mcp')` then `session.fastMode` deep-equals `{enabled:false, stored:true, source:'mcp'}` ("a run_task follow-up gets enabled:false"). So yes, a `fsbRecomputeFastModeForFollowUp` test passes `'mcp'`.
- `tests/jev-fast-start-path.test.js:12` header comment: "a run_task start (source 'mcp') gets enabled:false and never fast-steps".
- `tests/jev-fast-start-path.test.js:223-225`: `[false,'mcp']` gives null (stays true after D-04).
- `tests/jev-fast-start-path.test.js:556-562`: the exact line `const fastModeField = fsbFastModeSessionField(storedSettings.fsbJevFastModeEnabled, source);` and its position.
- `tests/jev-fast-loop.test.js:139-143`: extracts the helper by name (used only with `false`, :226).
- `tests/jev-extension-boundary.test.js:444` holds a probe line `const field = fsbFastModeSessionField(storedSettings.fsbJevFastModeEnabled, source);` inside a planted boundary self-test sample (not read from background.js).

## b. `FsbFastPath`

**Export key list** (21, `jev-fast-path.js:2108-2130`, `api` is not frozen): `constants, classifyFallback, toBuilderInput, evaluateDecision, buildStaticCall, classifyStepEvidence, isNoProgress, describeEscalation, buildHandoffMessage, collapseEarlierHandoffs, ensureMeasurement, appendAttempt, addCommandTotals, attemptFromResult, beforeTurn, afterStep, observeTools, flushHandoff, latchOff, abortInFlight, noteCaptureObservation`.

**`constants` key list and values** (19 keys, deep-frozen literal `var constants = deepFreeze({` at `jev-fast-path.js:40-60`): `MENU_CAP 48, FAST_MAX_STEPS 12, FAST_MAX_CALLS 16, FAST_WALL_BUDGET_MS 20000, FAST_MAX_CONSECUTIVE 3, FAST_ESCALATION_LATCH 3, MENU_DEADLINE_MS 1500, SNAPSHOT_DEADLINE_MS 3000, RECENT_ACTIONS_MAX 10, MEASUREMENT_ATTEMPTS_MAX 100, KINDS ['operation','target','completion','stuck'], ELEMENT_OPS ['click','check_box','press_enter','hover'], PAGE_OPS ['scroll','go_back'], NEVER_OFFERED ['type_text','select_option'], VAULT_TOOL_NAMES ['fill_credential','use_payment_method','list_credentials','list_payment_methods'], FAST_VISUAL_REASON 'Fast mode: simple step', SUMMARY_PREFIX 'FAST MODE HAND-OFF', SNAPSHOT_HEADER 'Current page snapshot (these refs replace any earlier refs):', SNAPSHOT_COLLAPSED '(Snapshot removed: a later fast-mode hand-off carries the current page.)'`.

**Pins (RESEARCH A2):**
- The `constants` key set IS deep-equal pinned: `tests/jev-fast-path.test.js:269-297`, check "constants holds exactly the documented keys" at :295 (`sameJson(sortedKeys(c), Object.keys(expected).sort())`), plus a frozen check at :296-297. A2 is false for `constants`: plan 70-02 adds `BUDGET_PROFILES` (or its chosen name) as a sibling export, never nested in `constants`, so this pin does not move.
- The export key list is NOT deep-equal pinned anywhere in `tests/`. `tests/jev-fast-path.test.js:1345` only checks that `beforeTurn`, `flushHandoff`, `latchOff` and `abortInFlight` are functions. New sibling exports need no pin bump.
- The boundary suite's exact-globals check (`tests/jev-extension-boundary.test.js:708-716`, `inertTogether`) counts globals (`FsbFastPath`), not members.

**beforeTurn step locations** (68-05 letters; the steps live in `attemptStep`, see Drift substitution 1):
- step g, consecutive cap: `jev-fast-path.js:1328` `if (jevFast.consecutiveFast >= constants.FAST_MAX_CONSECUTIVE) return await declineWith(session, deps, 'consecutive_cap');` (a decline, no latch).
- step h, budgets: `:1329-1330` `var budget = budgetReason(jevFast); if (budget !== null) return await declineWith(session, deps, latchCommand(jevFast, budget));` with `budgetReason` at `:1112-1117` returning exactly `'step_budget'` (`FAST_MAX_STEPS` :1113), `'call_budget'` (`FAST_MAX_CALLS` :1114) or `'time_budget'` (`FAST_WALL_BUDGET_MS` :1115). These are command latches (`jevFast.latched`).
- step o, goal: `:1378-1385`, `toBuilderInput(menu, { goal: session.task, ... })` with `goal: session.task` at `:1381`.
- step q, time left: `:1404` `var remaining = constants.FAST_WALL_BUDGET_MS - jevFast.jevMs;`, `:1405` `if (!(remaining > 0)) return await declineWith(session, deps, latchCommand(jevFast, 'time_budget'));`; the decide deadline `:1411` `var timeoutMs = Math.min(decideTimeoutLimit(), remaining);` (`decideTimeoutLimit` :995-999 reads `FsbJevClient.DEFAULT_TIMEOUT_MS`, fallback `FALLBACK_DECIDE_TIMEOUT_MS = 2500` :960).
- step t, escalation: `:1476-1479` `applyEscalation(...)` then decline; `applyEscalation` at `:1241-1251` reads `FAST_ESCALATION_LATCH` at `:1248` and latches the command `'escalation_latch'`.
- step u, act: `:1481-1499` (`jevFast.steps += 1; jevFast.consecutiveFast += 1;` then `return { toolCall: call, step: {callId, name, op, handle, role, label, url, signature, generation, iteration, command} }`). `iteration` comes from `indexOrNull(c.iteration)` at `:1387`.
- step v, flush helper: `deliverPending(session, deps, reason)` at `:1172-1208`; the snapshot request `:1187-1197`, the delivered-snapshot condition `isObject(answer) && answer.success === true && typeof answer.markdownSnapshot === 'string' && answer.markdownSnapshot.length > 0` at `:1191`; the exported `flushHandoff` `:1218-1228` calls it.

**Every read of the five budget names in the module:**

| Name | Declaration | Reads |
| --- | --- | --- |
| `FAST_MAX_STEPS` | `:42` | `:1113` (budgetReason, step h) |
| `FAST_MAX_CALLS` | `:43` | `:1114` (budgetReason, step h) |
| `FAST_WALL_BUDGET_MS` | `:44` | `:1115` (budgetReason, step h); `:1404` (step q remaining) |
| `FAST_MAX_CONSECUTIVE` | `:45` | `:1328` (step g) |
| `FAST_ESCALATION_LATCH` | `:46` | `:1248` (`applyEscalation`, step t); `:1664` (`afterStep`'s escalation counter after an uncertain, stale, failed or denied step) |

`observeTools` reads none; `answeredStates` has no bound; no other helper reads them. The only declaration sites are the five keys inside the `constants` literal (`:40-60`); there is no module-level alias variable for any of them. Plan 70-02's module-wide static check cuts out exactly that literal.

## c. Latch reasons and the measurement layout

- **Session latches** live in `session._fastPath`: `off`, `offReason`, `offCommand` (`latchOff` :1091-1104; a `switch_off` latch from an earlier command is cleared on a new command, :1067-1071). Reasons seen: `exception`, `unavailable`, `switch_off`, every session-class fallback (`invalid_request`, `invalid_response`, the six non-transient reasons, `unknown_fallback`), `not_calibrated`, `operation_malformed`, `target_malformed`, and (WR-04) any decide fallback before a calibrated answer.
- **Command latches** live in `session.agentState.jevFast.latched` (`latchCommand` :1107-1110, first reason kept): `step_budget`, `call_budget`, `time_budget`, `vault_flow`, `no_progress`, `sensitive_goal`, `local_invalid_request`, `escalation_latch`.
- **Real `_fastPath` layout** (`fastPathOf` :1011-1034): `{off, offReason, offCommand, inFlight, pendingSteps, stopReason, uncertain, recent, refEpoch, docEpoch, calibratedSeen}`; capture adds `capturePending` lazily (:1944, `finalizeCapture` :2066-2077). `lastLlmTools` is gone (IN-01, `481a2d5c`); `calibratedSeen` was added (WR-04, `73ee0523`).
- **Real `agentState.jevFast` layout** (`commandStateOf` :1042-1073): `{command, llmTurnSeen, yieldToLlm, consecutiveFast, consecutiveEscalations, steps, calls, jevMs, latched, lastStep, previousStep, firstUrl, firstTabId, vaultFlow, answeredStates}`; `firstTabId` was added (IN-04, `b608f8d3`); capture adds `captureArmed`, `captureFirstTabId`, `captureFirstUrl` lazily (:1890-1897, :1931-1935).
- **`session.jevMeasurement`** (`ensureMeasurement` :830-837): `{v:1, attempts:[...], commands:[...]}`, each list capped at `MEASUREMENT_ATTEMPTS_MAX` (100).
  - Attempt keys (`attemptFromResult` :858-896), in order: `iteration, command, decisionSource ('jev'), jevCalled, servedModel, instrumentVersion, calibrationStatus, latencyMs, usage {inputTokens, source}, cost {usd, source}, fallback, outcome ('acted'|'escalated'|'declined'|null), escalationReason, op, stepOutcome`. Key path for the calibration status: `jevMeasurement.attempts[i].calibrationStatus` (one of `calibrated`, `uncalibrated`, `snapshot_changed`, or null).
  - Per-command totals (`addCommandTotals` :905-938): `{command, fastSteps, jevCalls, jevMs, usd: {provider, estimate}, escalations: {<reason>: n}}`. The `escalations` map key is the reason code when it matches `^[a-z][a-z0-9_]{0,63}$`, else `other`. `jevMs` here is the decide time only (68-05 deviation 7); the budget's `jevFast.jevMs` is menu plus decide time.

## d. `describeEscalation`

An inspectable object table, not a switch: `ESCALATION_TEXT` (`jev-fast-path.js:552-608`) holds `disabled, not_configured, invalid_request, payload_too_large, sensitive_goal, busy, spend_cap_reached, timeout, rate_limited, upstream_overloaded, auth_error, upstream_billing, unavailable_model, upstream_rejected, upstream_error, invalid_response, network_error, aborted, server_error, unknown_fallback, not_calibrated, jev_stuck, completion_unconfirmed, op_not_offered, op_not_in_element_ops, page_op_with_target, unknown_target, risk_excluded, not_fast_eligible, stale, uncertain, dispatch_unconfirmed, failed, denied, no_effect, no_progress, same_state, step_budget, call_budget, time_budget, consecutive_cap, escalation_latch, vault_flow, switch_off, menu_unavailable, menu_invalid, nothing_offerable, local_invalid_request, exception, unavailable`. `operation_<reason>` and `target_<reason>` come from `CHOICE_TEXT` (:611-630; reasons `not_ok, not_calibrated, kind_absent, threshold_null, below_threshold, catch_all, malformed`). An unknown code gets the generic sentence `'Fast mode stopped and handed this step back to you.'` (`GENERIC_ESCALATION` :632; `describeEscalation('zz_unknown_code')` returns it).

## e. Lazy tool-registry lookup and the page-reading tools

- Lookup: `function toolRegistry()` at `jev-fast-path.js:1999-2010`: `if (typeof TOOL_REGISTRY !== 'undefined') return Array.isArray(TOOL_REGISTRY) ? TOOL_REGISTRY : null;` else `require('./tool-definitions.js')` and its `TOOL_REGISTRY` when it is an array; any throw gives null. `toolDefinitionOf(name)` (:2012-2019) scans it. Nothing runs at load.
- `TOOL_REGISTRY` is an array of 57 definitions (`require('./extension/ai/tool-definitions.js').TOOL_REGISTRY`).
- `_readOnly === true` (19): wait_for_element:content, wait_for_stable:content, read_sheet:content, capture_screenshot:cdp, read_page:content, get_text:content, get_attribute:content, get_dom_snapshot:content, list_tabs:background, get_page_snapshot:content, get_site_guide:background, search_memory:background, report_progress:background, complete_task:background, partial_task:background, fail_task:background, stop_trigger:background, get_trigger_status:background, list_triggers:background.
- `_readOnly === true` and `_route` in {'content','cdp'} (9, sorted): `capture_screenshot, get_attribute, get_dom_snapshot, get_page_snapshot, get_text, read_page, read_sheet, wait_for_element, wait_for_stable`. Exactly the RESEARCH F1 set. MATCH.
- `fill_payment_method` and `invoke_capability` are not in `TOOL_REGISTRY` (F7).
- Note for 70-03: autopilot runs `get_page_snapshot`, `search_memory`, `get_site_guide`, `report_progress` and the three terminal tools inside agent-loop.js itself (:2435-2699), not through `_executeTool`; `get_page_snapshot`'s result is `{success, hadEffect:false, error, navigationTriggered:false, result:{snapshot, elementCount}}` (:2443-2449) and it still reaches the AFTER_TOOL_EXECUTION emit.

## f. `classifyStepEvidence` semantics and the two human-gate shapes

Real calls (`require('./extension/ai/jev-fast-path.js').classifyStepEvidence`):

| op | toolResult | Verdict |
| --- | --- | --- |
| click | `{success:false, result:{outcome:'unknown'}}` | `{outcome:'uncertain', reason:'uncertain'}` |
| click | `{success:false, result:{mayHaveExecuted:true}}` | `{outcome:'uncertain', reason:'uncertain'}` |
| click | `{success:true, result:{bfCacheDetected:true}}` | `{outcome:'uncertain', reason:'uncertain'}` |
| click | `{success:true, result:{outcome:'unknown'}}` | `{outcome:'unconfirmed'}` (unknown read only on failure) |
| click | `{success:true, result:{mayHaveExecuted:true}}` | `{outcome:'unconfirmed'}` (mayHaveExecuted read only on failure) |
| click | `{success:false, result:{bfCacheDetected:true}}` | `{outcome:'failed'}` (bfCacheDetected read only on success) |
| click | `{success:true, result:{verification:{verified:true}}}` | `{outcome:'progress', effectObserved:true}` |
| click | `{success:true, result:{}}` | `{outcome:'unconfirmed'}` |
| navigate | `{success:false, error:'Unknown tool: navigate', result:null}` | `{outcome:'uncertain', reason:'dispatch_unconfirmed'}` |
| click | `{success:false, error:'Tool not permitted', result:null}` | `{outcome:'denied'}` |

So `outcome:'unknown'`/`mayHaveExecuted` are read only when `success` is false (`:501`) and `bfCacheDetected` only when `success` is true (`:504`): the 68-04 behaviour holds. **CHANGED part:** any toolResult that is not an object, and any failed result whose nested `result` is null (other than the two permission-denial texts, `:471-475`), is also `uncertain`, with reason `dispatch_unconfirmed` (`:497`, `:505-507`; 68-05 deviation 5). `makeResult` defaults `result` to null (`extension/ai/tool-executor.js:45-53`), so for LLM calls this covers ordinary background-route failures such as `Unknown tool: <name>`, a missing parameter or `Tab was closed or became inaccessible`, and agent-loop's own null-result failures (`search_memory requires a non-empty query`, `get_page_snapshot failed: ...`). See Drift substitution 3.

The hook's `toolResult` is `_executeTool`'s return unchanged: `result = await _executeTool(call.name, call.args, actionOpenerTabId, {...})` at `agent-loop.js:2751-2757`, then `toolResult: result` in the AFTER emit at `:2915-2919` (the only changes in between are the capture_screenshot attachment store `:2766-2784` and the open_tab binding failure `:2787-2834`, neither on a gate tool).

- **f1. fill_payment_method decline.** `extension/ai/tool-executor.js:573-582` returns `makeResult({ success: false, hadEffect: false, error: null, result: { declined: true, reason: confirmationResult.reason || 'user_declined' } })` (reasons `timeout` :539, `user_declined` :551, `sidepanel_unavailable` :569); `makeResult` (`:45-53`) keeps `result` as given. **Key path `toolResult.result.declined === true`.** Status: MATCH. Real verdict of that result: `classifyStepEvidence('fill_payment_method', r).outcome === 'failed'` (not uncertain). Reachability: `fill_payment_method` is not in `TOOL_REGISTRY`, so autopilot's `executeTool` answers `Unknown tool: fill_payment_method` (`tool-executor.js:847-854`) and the gate is unreachable from a real run_task today (F7).
- **f2. invoke_capability consent refusal.** `extension/utils/capability-router.js` `_err(code, extra)` at `:61-69` returns `{success:false, code, errorCode:code, error:code, ...extra}`; the consent gate returns it verbatim (`var gErr = ... _err('RECIPE_CONSENT_REQUIRED', { origin: c.origin || null, slug: slug }); ... return gErr;` at `:811-813`; other `RECIPE_CONSENT_REQUIRED` sites :456, :493, :503, :519, :529). `executeCapabilityToolForAutopilot` wraps it at `tool-executor.js:805-811`: `makeResult({ success, hadEffect: success && name === 'invoke_capability', error: success ? null : (response?.error || response?.errorCode || null), result: response })`. **Key path `toolResult.result.code === 'RECIPE_CONSENT_REQUIRED'`** (also `toolResult.result.errorCode`, and `toolResult.error === 'RECIPE_CONSENT_REQUIRED'`). Status: MATCH. Real verdict: `outcome:'failed'`. Reachability: `invoke_capability` is out-of-registry and reaches `executeTool`'s capability front door (`CAPABILITY_TOOL_NAMES` :677, guard :843-845) only if the LLM calls it (F7).

## g. The 68 tests D-05 inverts (and the cases D-22 touches)

- **`(true,'mcp')` helper case** (68-06-PLAN.md:108): `tests/jev-fast-start-path.test.js:221-222`, check name `'(true, "mcp") -> {enabled:false, stored:true, source:"mcp"} (run_task never fast-steps)'`, section `fsbFastModeSessionField (D-01, D-03, D-05)` (:213). Companion follow-up case `:444-448` ("a run_task follow-up gets enabled:false") and header comment `:12`.
- **jev-fast-loop run_task case** (68-06-PLAN.md:190): `tests/jev-fast-loop.test.js:611-637`, `async function runTaskCase()`, section `'run_task: fastMode {enabled:false, source:"mcp"} stays on the golden path apart from one capture arm read (D-03, D-22)'` (:612), harness `sessionPatch: { fastMode: { enabled: false, stored: true, source: 'mcp' } }` (:623); header bullets `:36` and `:62`. Its checks: "the run_task session carries enabled:false" (:625), "run_task: the command reads the capture arm exactly once and never the tab url (unarmed)" (:631), "run_task: nothing is written to storage" (:632), "run_task: apart from that one read, ... equal the golden" (:633-634), "run_task: no menu request and no decide call" (:635-636).
- **68-08 capture cases naming run_task** (68-08-PLAN.md:103-104): all in `tests/jev-fast-path.test.js`, built on `const RUN_TASK_FIELD = Object.freeze({ enabled: false, stored: true, source: 'mcp' });` (:2458): `labelOf` (:2549-2557, used by `captureLabels` :2769), `captureNoCaptureDeps` (:2559-2570, "capture: deps without readCaptureArm, ... make no call for a run_task session"), `captureRunTask` (:2572-2592, "capture: a run_task session still declines not_enabled", "capture: a run_task capture never asks Jev and takes no snapshot", "capture: a captured run_task session never calls decide"), `captureGateCost` (:2594-2631, "capture gate cost: an unarmed run_task command reads the arm once ..."), `captureGateRules` (:2633-2690, including `{enabled:false, stored:false, source:'mcp'}` at :2661), `captureRecordShape` (:2779), `captureMenuDrops` (:2811), `captureObservationShape` (:2819), `captureNeverRejects` (:2853). Also outside that file: `tests/jev-fast-start-path.test.js:984-992` ("capture end to end: the run_task iteration holds a capture ..." with `fastMode: { enabled: false, stored: true, source: 'mcp' }` :984) and `tests/jev-fast-capture.test.mjs:122-150` (`moduleRing`, "a run_task bench session", :150). None is in `tests/jev-fast-loop.test.js` beyond `runTaskCase`.
- **68-05 `not_enabled` case** (68-05-PLAN.md:99): `tests/jev-fast-path.test.js:1377-1400`, `async function orchNotEnabled()`, session `fastSession({ fastMode: { enabled: false, stored: true, source: 'mcp' } })` (:1385), check name `'a run_task session declines not_enabled at iteration ' + i` (:1389). D-05 keeps it as a module-level case for a hand-built `enabled:false` field, renamed so it no longer claims to be run_task.
- **68-05 bench-goal `sensitive_goal` case** (68-05-PLAN.md:103): `tests/jev-fast-path.test.js:1520-1531` inside `async function orchFallbacks()` (:1505), goal `BENCH_GOAL` (:1181-1182), check `'a bench-like goal holding a run token latches the command sensitive_goal with zero decide calls'` (:1525-1526). Its rig's menu url is `https://example.test/wizard/step-2?token=abc#frag` (`menuOf` :115-128, `MENU_URL` :1183), which is not the Open URL. Two more bench-goal `sensitive_goal` cases exist: `tests/jev-fast-loop.test.js:719-720` (`BENCH_GOAL`) used at `:951-962` ("fallback sensitive_goal: ..."; harness `pageUrl` default `https://wizard.example/start`, `tests/fixtures/agent-loop-fast-harness.js:112-119`) and `tests/jev-fast-measurement.test.js:754-755` (`PARITY_SENSITIVE_GOAL`, page `PARITY_URL = 'https://mkr.example/wizard/step-2'`) asserted at :1005-1027. In all three the page url differs from the Open URL, so D-22's page-match condition (1) declines and they stay latched unless a case moves the page to the Open URL (Drift substitution 8).

## h. The 68 loop harness

- Option list (`tests/fixtures/agent-loop-fast-harness.js:211-222`, `function createHarness(options)` :223): `providerKey, model, task, pageUrl, tabId, sessionId` (defaults in `DEFAULTS` :112-119), `loadFastPath`, `sessionPatch`, `contentResponder(message, options)`, `providerScript`, `deps`, `jevResponder`, `jevClient`, `permissionDenies`, `storage`.
- HookPipeline: real (`new HookPipeline()` :407) with the real safety-breaker hook on BEFORE_ITERATION (:408) and the real permission hook over a real `PermissionContext` on BEFORE_TOOL_EXECUTION (:409); the progress hook is left out. The pipeline is exposed as `harness.pipeline` and the context as `harness.permissionContext` (returned object :548-572). `permissionDenies` overrides `isAllowed` on that one instance (:402-406).
- `globalThis.fsbBroadcastAutomationLifecycle` is replaced (:368-371) by a recorder that pushes `{type:'lifecycle', message: normalise(clone(message), null)}` into `harness.events` and returns `Promise.resolve()`; it does not dispatch on any bus. `dispose()` restores it (:540-546).
- Switch-off golden: `tests/fixtures/jev-fast-loop-off-golden.json` (keys `about, capturedFromAgentLoopSha256, events, final`), the scenario `runGoldenScenario` (:596-604; click by selector, get_page_snapshot, complete_task). Run names used with `matchesGolden(record, label)` in `tests/jev-fast-loop.test.js`: `'run A'` (:186), `'run B'` (:220), `'run C'` (:235), `'run_task'` (:633), `'run A again'` (:1897).

## i. Boundary-suite rules as narrowed by 68 (`tests/jev-extension-boundary.test.js`)

- Enumerated modules `jev-state.js`, `jev-client.js`, `jev-policy.js` plus `FAST_PATH_MODULE = {file:'jev-fast-path.js', global:'FsbFastPath'}` (`MODULES` :74-78, :82-84); `extension/ai` must hold exactly these jev-*.js files.
- Module bans over all four modules (`MODULE_PATTERNS` :95-100): `chrome.storage`, `localStorage`, `serverUrl` (case-insensitive), `importScripts`.
- Tree bans over every file under `extension/` (`TREE_PATTERNS` :88-92): `systemone`, `api.typesafe.ai`, `\bJEV_[A-Z_]+\b`.
- One-URL scan (`URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`)<>\]]*/gi` :151): across the four modules exactly one `<scheme>://` literal, the endpoint in jev-client.js; comments count. A regex written `https?:\/\/` (escaped slashes) does not match.
- Caller rule (`CALLER_PATTERN /FsbJev[A-Za-z_$]*/g` :103): nothing outside the modules names `FsbJevState`, `FsbJevClient` or `FsbJevPolicy`; `FsbFastPath` carries no `FsbJev` prefix and needs no exemption (bridge and background may name `FsbFastPath`).
- background.js: the lines matching `/jev/i` are exactly the four load lines in order directly after `importScripts('ai/model-discovery.js');`, plus the exact word-bounded tokens `BACKGROUND_JEV_TOKENS` (:140-146): `fsbJevFastModeEnabled`, `getJevMenu`, `fsbJevCaptureArmed`, `fsbJevCaptureRing`, `jevCaptureObservation`. Any other `jev` text in background.js, a comment included, fails.
- `/\bjev\b/i` and `/jev/i` scope (`UI_WORD_PATTERN`/`UI_TEXT_PATTERN` :106-107): files under `extension/ui` and `extension/config`; the token `fsbJevFastModeEnabled` is stripped only in `config.js`, `init-config.js`, `options.js` (`UI_CONFIG_TOKEN_FILES` :117-122); `control_panel.html` allows jev text only between `id="fsbJevFastModeCard"` and `<!-- /fsbJevFastModeCard -->` (at most 40 lines, :130-133).
- Inert loads: each module alone and all four together add exactly their own Fsb* global, make no timer call and log nothing (`inertTogether` :708-716).

## j. Disclosure fixture, card and privacy section

- Fixture exports: `SHARED_PHRASES` (29), `CARD_ONLY_PHRASES` (2), `PAGE_ONLY_PHRASES` (6), `FORBIDDEN_PATTERNS` (4), `ENFORCEMENT` (4, including WR-04's "one step description"), `textOf(html)`. No exported phrase covers the Control fact.
- Card markers: `extension/ui/control_panel.html:636` (`<div class="settings-card" id="fsbJevFastModeCard">`) and `:665` (`<!-- /fsbJevFastModeCard -->`); 30 lines.
- Privacy-section markers: from `<h2 id="jev-fast-mode" i18n="@@privacy.section.jevFastMode.title">` (`showcase/angular/src/app/pages/privacy/privacy-page.component.html:63`, comment `<!-- Jev fast mode (Phase 68) -->` at :62) up to the next `<h2` (`<h2 id="local-service"` at :97); the same slicing as `tests/showcase-privacy-page.test.js:285-289`.
- **Control-fact sentence** (`@@privacy.section.jevFastMode.control`, `privacy-page.component.html:65`), as a reader sees it (the inline `<span [attr.translate]="'no'">` wrappers unwrapped first, as the 68-10 alignment test does):
  > An MCP client connected to FSB can also change this setting through FSB's settings tool.

  Plain `textOf` of the section gives `An MCP client connected to FSB can also change this setting through FSB 's settings tool.` (a space before the apostrophe, because `textOf` turns the closing `</span>` into a space; 68-10 SUMMARY deviation 1). The regex `/\bMCP\b[^.]*\bsettings tool\b/i` matches both forms. Status MATCH, so plan 70-04 Task 2 does not take its MISSING path.
- **Card and MCP:** the card text (`textOf` of the card range) mentions neither `MCP` nor `settings tool` (recorded for M-70-09, never a failure). It describes fast mode as "during autopilot" and "FSB's autopilot sends a short description of the current step"; it contains no phrase limiting fast mode to the side panel.

## k. 68-08 exporter goal rule

`scripts/bench/shadow/export-capture.mjs`: `const START_PREFIX = 'Open {startUrl}.';` (:78) and

```javascript
function goalOf(task) {
  if (typeof task.instruction !== 'string' || !task.instruction.startsWith(START_PREFIX)) return null;
  const goal = task.instruction.slice(START_PREFIX.length).trim();
  return goal.length > 0 && goal.indexOf('{startUrl}') === -1 ? goal : null;
}
```

(:146-150). It reads the unrendered corpus instruction (with the `{startUrl}` placeholder) and trims both ends. `goalOf` is **not exported**; the module exports `DEFAULT_OUT_DIR, MAX_PER_SLUG, STAND_IN_ORIGIN, deriveRecords, main, parseArgs` (`deriveRecords(ring, {tasks, lock, run, since})` at :198, which calls `goalOf` at :238). All 12 core instructions (`scripts/bench/tasks/core/*.json`) start with `Open {startUrl}. `, contain `{startUrl}` exactly once and have no trailing whitespace, so `trimStart` of the rendered remainder equals `goalOf` for every core task. Bench rendering is `renderInstruction(task, startUrl)` (`scripts/bench/lib/tasks.mjs:461-471`, a plain split-and-join on `{startUrl}`).

## l. 67 scrubber and the F5 probe

Signatures (`extension/ai/jev-state.js`, `root.FsbJevState = api` :958, `module.exports = api` :959): `scrubText(s)` (:277-284; non-strings pass through), `matchesSecret(s)` (:287-289, `typeof s === 'string' && scrubText(s) !== s`), `buildRequest(input, options)` (:763-939; `options.byteBudget`, default `CONTRACT.BUDGETS.requestByteBudget`; returns `{ok:true, request, idMap, stats}` or `{ok:false, reason:'invalid_request'|'sensitive_goal'}`; the secret scan runs on the untruncated goal at :780), `toOriginPath(url)` (:672-680; `{origin, path}` with each path segment passed through `scrubPathSegment` :657-663, which is `scrubText(segment)` plus, for a segment containing `%`, a `matchesSecret` check on its `decodeURIComponent` form; any other scheme or an unparseable URL gives null). `scrubPathSegment` is not exported.

**Goal length (CHANGED):** `buildRequest` truncates the goal to 1000 code points (`var goal = truncateCodePoints(input.goal, CAPS.goalChars);` :851) and then validates the truncated request; a 1001-, 2000- or 5000-character goal returns `ok:true` with a 1000-code-point goal (probe at P70_START; also pinned by `tests/jev-state.test.js:587` "goal truncated to 1000 code points"). Only `validateRequest` (:373, and the server mirror `showcase/server/src/jev/validator.js:80`) refuses an over-cap goal, and buildRequest never sends it one. See Drift substitution 7.

**F5 probe** (URL `http://127.0.0.1:53211/r/<token>/fixtures/checklist/index.html`, goal `Open <url>. Tick Alpha.`):

| Token | `matchesSecret(goal)` | `scrubText(segment) === segment` for `''`, `r`, token, `fixtures`, `checklist`, `index.html` | `toOriginPath(url)` | `buildRequest` with the full goal | `buildRequest` with goal `Tick Alpha.` |
| --- | --- | --- | --- | --- | --- |
| `Ab3dEf9hIj2kLm5nOp8qRs` (22-char base64url) | **true** (`scrubText(goal)` = `Open http://127.0.0.1:[REDACTED_TOKEN].html. Tick Alpha.`) | true for every segment | `{origin:'http://127.0.0.1:53211', path:'/r/Ab3dEf9hIj2kLm5nOp8qRs/fixtures/checklist/index.html'}` | `{ok:false, reason:'sensitive_goal'}` | `ok:true` |
| `qwertyuiopasdfghjklzxcvb` (24 lowercase letters) | **false** | true for every segment | `{origin:'http://127.0.0.1:53211', path:'/r/qwertyuiopasdfghjklzxcvb/fixtures/checklist/index.html'}` | `ok:true` | `ok:true` |

The 22-character token is **not** redacted per segment, so D-22's normaliser will not decline on bench goals because of condition (2), and plan 70-04 Task 1 does **not** take its recorded-redaction branch: both token shapes' sub-checks expect the normalised goal to equal the exporter goal. The whole-goal rule fires on the 22-character shape only because the high-entropy class spans the `:53211/r/<token>/fixtures/...` run. Extra probe: over 5,000 tokens drawn exactly as the bench draws them (`randomBytes(16).toString('base64url')`, `scripts/bench/fixture-server.mjs:416`), 0 token segments were changed by `scrubText` and 3,457 of the 5,000 full goals matched `matchesSecret`, so about 69% of current bench goals trip `sensitive_goal` today and the normaliser makes them sendable.

## m. 69 caller harness and the MCP success passthrough

- `tests/helpers/mcp-in-process.mjs` re-exports `scripts/mcp/lib/tools-list.mjs` (`export *` :16) and adds `assertBuildFresh()` (:51), `listCurrentTools()` (:71) and `EXPECT_TOOL_NAMES_VERBATIM` (:22). Dynamic import gives `createInProcessClient` (`({ runtimePath = DEFAULT_RUNTIME_PATH, bridge, agentScope } = {})`, tools-list.mjs:70), `makeStubBridge` (`({ onSend } = {})` with `calls` of `{message, options}`, :56-68), `makeMockAgentScope()` (:43), `assertBuildFresh`, plus `loadSdk`, `listToolsFromRuntimeModule`, `REPO_ROOT` and others.
- Files: `tests/mcp-tools-list-shape-freeze.test.js`, `tests/mcp-expect-caller.test.mjs` and `tests/mcp-expect-wire.test.js` exist.
- `mcp/src/errors.ts:469-475`: `export function mapFSBError(fsbResult, context?)`, and its first branch is `if (fsbResult && fsbResult.success) { return { content: [{ type: 'text', text: JSON.stringify(fsbResult, null, 2) }] }; }` (:473-475). `mcp/build/errors.js` and `mcp/build/runtime.js` are present (gitignored, built).

## Regression-sweep baseline

`node scripts/bench/sweep-tests.mjs --files extension/background.js extension/ws/mcp-bridge-client.js extension/ai/jev-fast-path.js scripts/bench/run-bench.mjs --out .planning/phases/70-bounded-mcp-fast-task/70-SWEEP-BASELINE.json` ran in the background at P70_START before any edit (Node v24.14.1; port 7225 held by the user's hub, untouched; started 13:44:39Z, finished 13:46:48Z). Result: **110 of 110 selected tests passed, exit 0, `failures: []`**. No pre-existing failure among the selected tests. `tests/showcase-build-smoke.test.js` was not selected, and `git status --short showcase/angular/public` printed nothing afterwards.

---

# Measured facts (plan 70-01 Task 2)

## n. Bridge anchors after Phase 69 (`extension/ws/mcp-bridge-client.js`)

| Anchor | Line at P70_START |
| --- | --- |
| `async _handleStartAutomation(payload, mcpMsgId) {` | :2659 (start dispatch `dispatchMcpMessageRoute({ type: 'mcp:start-automation', payload, client: this, mcpMsgId })` :2660-2665; `throw new Error(response?.error || 'Failed to start automation')` :2667-2669) |
| `const sessionId = response.sessionId;` | :2671 |
| `return new Promise((resolve) => {` / `let settled = false;` | :2694 / :2695 |
| `fireHeartbeat` and its guarded read `const sessions = (typeof activeSessions !== 'undefined') ? activeSessions : null;` / `const session = (sessions && typeof sessions.get === 'function') ? sessions.get(sessionId) : null;` | :2702 / :2704 / :2705 |
| `const settle = (value, source) => {` | :2753 (teardown :2754-2762; terminal store write :2768-2788; log :2790-2799) |
| `final_result: value,` | :2785 |
| `resolve(value);` | :2800 |
| `const RUN_TASK_SAFETY_NET_MS = 600_000;` and the safety-net timer | :2809, :2811-2851 |
| `const heartbeatTimer = setInterval(fireHeartbeat, 30_000);` and the subscribe-time snapshot | :2859, :2860-2875 |
| `const handleComplete = (message, source) => {` | :2890-2896 |
| `const handleError = (message, source) => {` | :2898-2904 |
| runtime listener `const runtimeListener = (message) => {` | :2906-2913 (registered :2929) |
| `const lifecycleBus = ...globalThis.fsbAutomationLifecycleBus`, `busCompleteHandler`, `busErrorHandler` | :2915, :2917-2921, :2923-2927 (registered :2930-2933) |
| result send `this._sendResult(id, { success: true, ...result });` | :1393 (in `_handleMessage`, after `const result = await this._routeMessage(type, payload || {}, id);` :1392) |
| `_sendProgress(id, progressData)` -> `this._send({ id, type: 'mcp:progress', payload: progressData })` | :1329-1331 |
| `_handleGetTaskSnapshot(payload, _mcpMsgId)` (reads `readSnapshot(agentId)`, F8) | :2962-2972 |

Exact settle literals (unchanged at P70_START):

```javascript
      const handleComplete = (message, source) => {
        settle({
          sessionId,
          status: message.outcome || message.result?.status || (message.partial ? 'partial' : 'completed'),
          result: message.result || {},
        }, source);
      };

      const handleError = (message, source) => {
        settle({
          sessionId,
          status: 'error',
          error: message.error || 'Unknown automation error',
        }, source);
      };
```

```javascript
        settle({
          sessionId,
          success: true,
          partial_outcome: 'timeout',
          partial_state,
          hint: 'lifecycle event missing -- audit cleanup paths',
        }, 'safety_net_600s');
```

`handleComplete`'s source argument is `'chrome.runtime'` (runtime listener) or `'lifecycleBus'` (bus handlers); the safety net passes `'safety_net_600s'`. `message.reason` is dropped by both handlers today.

**Session fields `fireHeartbeat` reads** (`:2714-2747`): `iterationCount` (:2714, :2717, :2745, :2746), `lastKnownUrl` (:2716), `_lastActionSummary` (:2718), `tabId` (:2744), `lastDOMHash` (:2747). The heartbeat progress payload is `{timestamp, sessionId, taskId, alive:true, step, elapsed_ms, current_url, ai_cycles, last_action}` (:2709-2719) and each tick writes an `in_progress` snapshot `{task_id, status:'in_progress', started_at, last_heartbeat_at, originating_mcp_call_id, target_tab_id, current_step, ai_cycle_count, last_dom_hash}` (:2738-2748). The plan 70-01 Task 3 seeded session carries none of those five fields. The safety net reads the stored snapshot back as `partial_state` (:2816-2822) and first rewrites it as `{...partial_state, status:'partial', final_result:{partial_outcome:'timeout'}}` (:2832-2840).

The settle's terminal write (`:2775-2786`): `{task_id, status: terminalStatus, started_at, last_heartbeat_at: Date.now(), originating_mcp_call_id, target_tab_id: (value && value.tabId) || null, current_step: heartbeatTickCount, ai_cycle_count: heartbeatTickCount, last_dom_hash: null, final_result: value}`, where `terminalStatus` is `error` when `value.status === 'error'`, `stopped` when `value.status === 'stopped' || value.stopped`, `partial` when `value.status === 'partial' || value.partial`, else `complete` (:2771-2774).

## o. Start-path order (`extension/background.js`)

- `handleStartAutomation(request, sender, sendResponse)` at :13941. The agent-provider early return (`if (authoritativeProvider.providerKind === 'agent') {` ... `sendResponse(consent); return;`) at :13956-13964 still comes first. The follow-up branch (`if (existingSession && existingSession.status === 'idle') {`) with `await fsbRecomputeFastModeForFollowUp(existingSession, source);` :14054 and `const reactivationHooks = createSessionHooks(sessionId);` :14055 needs a `conversationId`, which run_task never sends (`mcp-tool-dispatcher.js` `handleStartAutomationRoute` :3360-3404 forwards `{action:'startAutomation', task, tabId, source:'mcp', agentId?, ownershipToken?}` only).
- `tabInfo` is assigned at :14077 and refreshed after smart navigation at :14143; it is a `let` in the function scope, so it is in scope at :14466.
- The per-start settings read with `fsbJevFastModeEnabled` is at :14166-14170; `const fastModeField = fsbFastModeSessionField(storedSettings.fsbJevFastModeEnabled, source);` :14200; the `sessionData` literal :14204-14244 (spread :14226).
- `activeSessions.set(sessionId, sessionData);` at **:14246** happens before `sendResponse({ success: true, sessionId, message: navigationMessage || 'Automation started', navigationPerformed, agentId, ownershipToken })` at **:14349-14356**. The bridge's start dispatch resolves through `callCallbackHandler` (`mcp-tool-dispatcher.js:2898-2922`), whose promise resolves with the value passed to `sendResponse`, so the session is in the map when the bridge's `await dispatchMcpMessageRoute(...)` returns. The first removal path after that is the content-script-not-ready abort (`cleanupSession(sessionId)` then an `automationError` broadcast with no `reason`, :14390-14418), which runs only after `waitForContentScriptReady(targetTabId, 5000)` (:14374) and a forced injection.
- `const sessionHooks = createSessionHooks(sessionId);` :14466 is immediately followed by `runAgentLoop(sessionId, {` :14467 (options :14468-14480 with `hooks: sessionHooks`). `tabInfo` and `sessionData` are in scope there.
- **No test pins the text between those two lines.** The tests that read this region check only order or other anchors: `tests/mcp-bridge-background-dispatch.test.js:3711-3723` (the agent-provider branch precedes the first `chrome.tabs.get`, `activeSessions.set` and `runAgentLoop`), `tests/jev-fast-start-path.test.js:547-582` (settings read, fieldLine, spread, agent-return order, the follow-up recompute right before `const reactivationHooks = createSessionHooks(sessionId);`), `tests/runtime-contracts.test.js:50` (no `emitter: sessionHooks.emitter`) and `:54` (the `function createSessionHooks(sessionId)` signature), and the boundary suite's background.js `jev` rule (item i).

## p. Hook handlers and the AFTER_ITERATION window

1. **Handlers.** `createSessionHooks(sessionId)` (`background.js:4735-4766`) registers, in this order: the safety breaker on `BEFORE_ITERATION` (:4742), the progress hook on `AFTER_TOOL_EXECUTION` (:4750), the permission hook on `BEFORE_TOOL_EXECUTION` (:4758). It registers **no `AFTER_ITERATION` handler**. No other `.register(` call on a session `HookPipeline` exists anywhere in `extension/` (Phase 68 added none; the only other `register(` is the unrelated Lattice SDK pipeline in the offscreen document, `extension/offscreen/lattice-host.js:458`, `pipeline.register("AFTER_TOOL", handler, { band })`). So a Phase 70 `AFTER_ITERATION` handler is the only one and runs whenever that event is emitted. `HookPipeline.prototype.register(event, handler)` (`hook-pipeline.js:78-93`) validates `event` against the `LIFECYCLE_EVENTS` values (camelCase strings, :31-39, :45-49) and appends; `emit` (:132-159) awaits each handler in order inside its own try/catch and stops later handlers only when a result has `shouldStop === true` (:147). The permission hook returns `{ shouldStop: false, denied: true, denial: denial }` on a denial (`hooks/permission-hook.js:45`) and `{ shouldStop: false, denied: false }` otherwise (:47, :51), so an evidence `BEFORE_TOOL_EXECUTION` handler registered after it still runs for a denied call. The progress hook always returns `{ shouldStop: false }` (`hooks/progress-hook.js:67`), so an evidence `AFTER_TOOL_EXECUTION` handler registered after it always runs. `PermissionContext.prototype.isAllowed` always returns true (`permission-context.js:56-62`).
2. **Every exit between a BEFORE_TOOL_EXECUTION emit and the AFTER_ITERATION emit in `agent-loop.js`** (after Phase 68's seams):
   - tool-loop head `for (var ci = 0; ci < toolCalls.length; ci++) {` :2294;
   - malformed-args `continue` :2326 comes **before** the BEFORE emit (:2335-2340), so neither BEFORE nor AFTER fires for that call;
   - permission-denial `continue` :2366 follows BEFORE and skips AFTER for that call;
   - `complete_task` `return` :2552 (its own BEFORE fired; earlier calls in the turn already emitted AFTER);
   - `partial_task` `return` :2653, reached only when inline auth resolution did not resume; when `resolveAuthWall` resumes (:2589-2607) the call falls through to the AFTER emit with a `{resumed:true, authResolved:true}` result;
   - `fail_task` `return` :2689;
   - the tool loop ends at :2921; the fast branch's `afterStep` (:2930-2936) and the LLM branch's tool-result push plus `observeTools` (:2937-2953, 68-06 seam 2) add no return;
   - the meta-cognitive force stop `createTerminalOutcome('stopped', { reason: 'meta_cognitive_loop_break', ... })` :2973-2978, `finalizeSession` :2990, `return;` **:2991** is the only `return` between the end of the tool loop and the AFTER_ITERATION emit (:3014-3019);
   - **throws:** any exception inside the window (for example `_executeTool` rejecting at :2751, which is in a try/finally with no catch, or `persist` throwing) leaves the window for the iteration catch at :3146. That catch runs the WR-03 `afterStep(session, _fastStep.step, [])` (:3151-3157), emits `ON_ERROR`, and then either ends the session with an `error` terminal (401/403 :3196-3205, 400 :3208-3219, a second failure on the same iteration :3240-3246) or schedules a retry (429 :3223-3227; first failure :3230-3237, which decrements `iterationCount`). A retried iteration's next BEFORE clears any leftover `pending`; an `error` terminal reached this way leaves `pending` set, which is the true D-14(c) state (a dispatched call threw). `hooks.emit` itself cannot throw (per-handler try/catch). No `session.status` check returns inside the window.
   - Which of these can follow a denied last call: the denial `continue` then loop end, the meta-cognitive force stop (below), and the AFTER_ITERATION emit itself. `complete_task`, `partial_task` and `fail_task` after a denied call emit their own BEFORE first.
3. **Residual (tighten-only).** The meta-cognitive counter scans `toolCalls` (the LLM's intent, denied calls included; `_META_INTERACT_TOOLS` :191, `_trackMetaAttempt` :240, scan :2962-2967). When a permission-denied call is the last call of a turn and the counter force-stops in that iteration, AFTER_ITERATION never runs and the in-flight marker set by that call's BEFORE stays set, so the typed outcome reads `ambiguous`/`uncertain_action` instead of `blocked`/`meta_cognitive_loop_break`. It can only move an outcome toward `ambiguous`, and permission denials cannot happen in production today (`PermissionContext.prototype.isAllowed` returns true, `permission-context.js:56-62`).

## q. 68-09 persistence and projection conditions

- `cloneJevMeasurementForPersistence(block)` (`extension/utils/automation-logger.js:319-332`) has no source or mode condition: it returns undefined only for a non-object block. Both save modes call it (`:1104` update mode keeps the stored block when the clone is undefined; `:1112` new mode).
- `projectJevMeasurement(block)` (`extension/ws/mcp-tool-dispatcher.js:2774-2783`) has no source or mode condition. Its call (`:2367-2369`) is guarded only by `session.jevMeasurement` being a non-array object. The neighbouring `measurement` block branches on `session.mode === 'mcp-agent'` (:2364-2366), but `jevMeasurement` does not.
- So an MCP `run_task` session that gains a `jevMeasurement` block is persisted and projected exactly like an autopilot session (71 D-09 item 2 needs no change). Phase 70 adds no field to `jevMeasurement` (F12).

## r. Slice and file hashes at P70_START

| Target | Method | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `createSessionHooks` (`extension/background.js:4735-4766`) | 68-SYNC-RECHECK item h slicing (also identical with the `extractNamedFunction` brace matcher, because the function has no default parameters) | 1347 | `10ce1a544f31072f71121b8ee872a4ff6cdd8b07adb1c7a14171b50e4e940780` |
| `extension/ai/agent-loop.js` (whole file) | `sha256(readFileSync(file))` | - | `699946b2e0d9a734715e3130e66d1446737fde123f5a36dccf4c6e31c5e785f0` |

The `createSessionHooks` hash equals 68-SYNC-RECHECK item h and the literal in `tests/jev-fast-start-path.test.js:55`.

## s. Pins on the files Phase 70 edits (D-25 preflight) and the test chain

Preflight grep at P70_START (tests that read the file's source text, then the named pins):

- **`extension/background.js`** (63 suites read it). Pins that a Phase 70 edit can move: `tests/lattice-provider-bridge-smoke.test.js:638` (`importScripts` token count 338) and `:688` (call sites 334): Phase 70 adds no load line and no comment containing that word; `tests/jev-extension-boundary.test.js` background.js `jev` rule (item i): any new line or comment containing `jev` in any case outside the five tokens fails; `tests/jev-fast-start-path.test.js:547-608` (start-path anchors, the stop-path abort guard, the `createSessionHooks` SHA-256); `tests/jev-fast-start-path.test.js:177-225` (helper extraction and the `(true,'mcp')` case D-05 inverts); `tests/jev-fast-loop.test.js:139-143` (helper extraction); `tests/mcp-bridge-background-dispatch.test.js:3711-3723` (agent-provider branch order); `tests/runtime-contracts.test.js:50,54`; `tests/delegation-phase-contract.test.js` (`extractFunction(read('extension/background.js'), 'fsbDelegationStartCommand')` :2752 and other delegation audits); `tests/mcp-version-parity.test.js:241`; `tests/ownership-leakage-regression.test.js` (`extractNamedFunction` over background functions). Run list: the background.js pin bundle of 70-VALIDATION.md plus the regression sweep.
- **`extension/ws/mcp-bridge-client.js`** (26 suites read it). Pins: `tests/delegation-phase-contract.test.js:2733-2749` (no `connectNative`/`sendNativeMessage(`, `require('child_process')`, `\b(execFile|execSync|spawn|spawnSync|fork)\s*\(`, `shell://`/`terminal://` across a file set that includes the bridge), `:2496` (`/eventTail/`), `:2507` (`DELEGATION_HEARTBEAT_INTERVAL_MS = 20000`), `:2552` (`/nonce/`), `:2624` (`/mcp:ping/`), `:2806-2811` (`eventTail: Promise.resolve(),\s*observerError: null` and no `this.(_)eventTail`/`this.(_)observerError`); `tests/mcp-settings-route.test.js:878-882` (SHA-256 `4de2a8ab…` of the `async _handleGetConfig() {` method text up to `async _handleGetSiteGuides(`: Phase 70 must not touch that method; fsb://config never exposes `fsbJevFastModeEnabled`); vm loaders `tests/run-task-resolve-discipline.test.js:257-268`, `tests/run-task-heartbeat.test.js`, `tests/mcp-bridge-client-lifecycle.test.js` (no `activeSessions` in its context, F15), `tests/lattice-replay-background-contract.test.js`, `tests/mcp-version-parity.test.js:242`, `tests/expect-dispatcher.test.js`, `tests/recovery-tools-bootstrap.test.js`, `tests/trigger-blocking-reporting.test.js`, `tests/spreadsheet-record-redaction.test.js`, `tests/ownership-leakage-regression.test.js`, `tests/hung-page-recovery.test.js`, `tests/vault-list-state.test.js`, `tests/mcp-wire-verb-routing.test.js`. Run list: the bridge pin bundle of 70-VALIDATION.md.
- **`extension/ai/jev-fast-path.js`** (6 suites read it, plus `tests/delegation-phase-contract.test.js` for registration and `tests/lattice-provider-bridge-smoke.test.js` for its load line). Pins: `tests/jev-fast-path.test.js:187-212` (module bans: `chrome.`, `localStorage`, `serverUrl`, `importScripts`, any `://` literal, `systemone`, `api.typesafe.ai`, `setTimeout`, `setInterval`, `\bJEV_[A-Z_]+\b`, `meetsThreshold`, `probabilities`, `\.threshold\b`, **and `complete_task|partial_task|fail_task` anywhere in the module** at :204; no top-level `const|let|class|function`; the IIFE header; one `root.FsbFastPath = api;`; the `module.exports` guard; the IIFE close; `.accept(`; `node --check`), `:218-235` (inert load: only `FsbFastPath` added, no log, no timer), `:269-297` (`constants` values and exact key set), `:1074-1076` (`FAST MODE HAND-OFF` appears once), `:1348-1349` (no `getHashKey`), `:2388-2393` (`afterStep` and `observeTools` contain no `await` and are not `async`); `tests/jev-fast-loop.test.js:1335-1340` (`buildStaticCall` names no terminal tool, **and `jev-fast-path.js names no terminal tool anywhere`** at :1340); `tests/jev-fast-measurement.test.js:745` (no `estimateCost|CostTracker|iterationTiming|buildIterationTimingRow|totalCost|costUsd`); `tests/jev-fast-start-path.test.js:1036-1037` (no `fsbJevCapture`); `tests/jev-extension-boundary.test.js` (item i). See Drift substitution 9 for the two terminal-name bans.
- **`scripts/bench/run-bench.mjs`**: imported by `tests/bench-report.test.mjs:32` (`createRunExecutor, main, runCampaignLoop`); its only source-text pin is `tests/bench-report.test.mjs:586-591` (no console or stdout write of `pairingCode`/`fsb-auth.`). `runAutopilotArm` is exported at :555 (its `runTask` literal :572-578) and no test calls it today. `RUN_ROW_KEYS` and its pin `tests/bench-report.test.mjs:76-90` live in `scripts/bench/lib/runs.mjs`, which Phase 70 does not edit.
- **Test chain:** `package.json` `scripts.test` has **340** ` && `-joined commands at P70_START; `npm --prefix mcp run build` is at 0-based index **12** (the 13th command). The last command is `node tests/jev-fast-measurement.test.js`, which is also the last entry of `REFINEMENT_ROOT_TEST_COMMANDS` (`tests/delegation-phase-contract.test.js:129-197`, last entry :196, closing `]);` :197). `PRE_PHASE61_ROOT_TEST_HASH` (:12) and `PRE_PHASE62_ROOT_TEST_HASH` (:16) are never edited.

## t. Drift substitutions

These win over any name or shape quoted in a Phase 70 plan.

1. **beforeTurn steps live in `attemptStep`; step v is `deliverPending` (RENAMED).** `beforeTurn` (`jev-fast-path.js:1279-1299`) only wraps capture around `attemptStep(session, ctx, capture)` (:1307-1509), which holds steps a-u; inside it the context is `c` and the iteration is `var iteration = indexOrNull(c.iteration);` (:1387). Step u ("act") is :1481-1499; the 70-03 act marker goes there and reads `iteration` (or `c.iteration`). Step v, the flush helper, is `deliverPending(session, deps, reason)` (:1172-1208); the delivered-snapshot condition is :1191, so the 70-03 hand-off observation marker is written only inside that `if`. Step g is :1328, step h :1329-1330 with `budgetReason` :1112-1117, step o :1378-1385 (goal :1381), step q :1404-1405 and :1411, step t :1476-1479 with `applyEscalation` :1241-1251. 70-02 also changes `afterStep`'s latch read at :1664 (item b).
2. **`constants` key set is pinned (RESEARCH A2 false for `constants`).** `tests/jev-fast-path.test.js:295` deep-equals the 19 keys. Plan 70-02 exports the profiles as a sibling api member (for example `BUDGET_PROFILES`), never inside `constants`. The export list itself is not pinned, so new sibling members need no pin bump.
3. **`classifyStepEvidence` `uncertain` has two reasons (CHANGED).** Reason `uncertain` covers exactly D-14(a)'s three signals (`outcome:'unknown'` or `mayHaveExecuted` on a failure, `bfCacheDetected` on a success). Reason `dispatch_unconfirmed` (also outcome `uncertain`) covers a non-object result and any failure whose nested `result` is null other than the two permission-denial texts; for LLM calls that includes ordinary background-route failures (`Unknown tool: ...`, a missing parameter, `Tab was closed or became inaccessible`) and agent-loop's own null-result failures. 70-03's recorder bullet ("`outcome === 'uncertain'` sets `lastUncertainSeq` for any call") therefore also marks those LLM failures uncertain. That is tighten-only (it can only move `done` to `ambiguous`), so 70-03 keeps its bullet as written; the resulting false-`ambiguous` rate is a V4 watch item next to F18 (M-70-04). If 70-03 chooses to key D-14(a) on `reason === 'uncertain'` for non-fast calls instead, that is a loosening and needs its own recorded decision.
4. **Attempt keys (CHANGED).** There is no `toolMs`; the attempt keys are exactly `iteration, command, decisionSource, jevCalled, servedModel, instrumentVersion, calibrationStatus, latencyMs, usage, cost, fallback, outcome, escalationReason, op, stepOutcome`. For the D-18 `jev` summary (70-05): `attempts` = `jevMeasurement.attempts.length` for the command (or all attempts; run_task is one command); `calls` = per-command `jevCalls`; `fast_steps` = per-command `fastSteps`; `jev_ms` = per-command `jevMs` (decide time only, null until a decide is timed); `calibration` = the last non-null `attempts[i].calibrationStatus`; `escalations` = per-command `escalations` map; `latched` = `_fastPath.offReason` when `_fastPath.off === true`, else `agentState.jevFast.latched`; `exhausted` = `agentState.jevFast.latched` when it is `step_budget`, `call_budget` or `time_budget` (`consecutive_cap` is a decline, never a latch). The budget counter `agentState.jevFast.jevMs` (menu plus decide time) is a different number from the per-command `jevMs`.
5. **`_fastPath` and `jevFast` layouts (CHANGED).** Real `_fastPath`: `{off, offReason, offCommand, inFlight, pendingSteps, stopReason, uncertain, recent, refEpoch, docEpoch, calibratedSeen}` plus `capturePending` when capture runs; `lastLlmTools` no longer exists (IN-01). Real `jevFast`: the planned keys plus `firstTabId` (IN-04) and, under capture, `captureArmed`, `captureFirstTabId`, `captureFirstUrl`. WR-04 tightened D-16: until a session has seen a calibrated answer (`calibratedSeen`), any decide fallback latches the session, so an uncalibrated or failing gateway costs a session at most one request. Phase 70 adds no field to either object (F13); the evidence lives in `session._fastRunEvidence` and the start page in `session._fastRunStartPage`.
6. **Loop harness (CHANGED, superset).** `createHarness` also takes `model, task, pageUrl, tabId, sessionId, jevResponder, storage`; it exposes the real pipeline as `harness.pipeline` (safety breaker and permission hook registered, no progress hook) and `harness.permissionContext`. Its `globalThis.fsbBroadcastAutomationLifecycle` is a recorder (events of type `lifecycle`), not a bus, so loop-harness cases read the terminal message from `harness.events` and never reach a bridge `settle`; the bridge cases use the vm bridge harness (plan 70-01 Task 3). 70-03's harness option registers the evidence handlers on `harness.pipeline` after the permission hook, matching background.js order.
7. **Goal length (CHANGED).** `FsbJevState.buildRequest` truncates the goal to 1000 code points (`jev-state.js:851`) and returns `ok:true`; it never refuses a goal for length, and the secret scan runs on the untruncated goal (:780). D-22's and 70-04's "goals over 1,000 code points still give `invalid_request` and a session latch" is replaced by: a normalised goal over 1000 code points is sent truncated to its first 1000 code points, with one decide and no latch from length alone. 70-04's "long goal" sub-check asserts that real behaviour. The normaliser's own output is still always a suffix of the task text; the goal on the wire is the first 1000 code points of that output.
8. **Bench-goal `sensitive_goal` cases and D-22 condition (1).** The three existing bench-goal cases (`tests/jev-fast-path.test.js:1520-1531`, `tests/jev-fast-loop.test.js:951-962`, `tests/jev-fast-measurement.test.js:1005-1027`) run on a page whose url is not the Open URL, so the normaliser declines and they keep latching `sensitive_goal`. 70-04 re-points only the jev-fast-path.test.js case (68-05-PLAN.md:103) by moving its menu url (and/or `_fastRunStartPage`) to the Open URL; the other two stay as written and remain true.
9. **Terminal tool names in `jev-fast-path.js` (CHANGED; proposed PD-70-03, needs orchestrator acceptance before 70-03 Task 1 commits).** 68 implemented D-17's static check more broadly than planned: 68-07-PLAN.md:80 asks only that `buildStaticCall` name no terminal tool, but `tests/jev-fast-path.test.js:204` bans `complete_task|partial_task|fail_task` anywhere in the module and `tests/jev-fast-loop.test.js:1340` checks "jev-fast-path.js names no terminal tool anywhere". Phase 70's locked design needs those names inside `FsbFastPath`: 70-03's recorder excludes the three terminal tools from `pending` (D-14, RESEARCH F3), and 70-05's closed reason vocabulary includes `complete_task` and `fail_task` (D-13 rows 5 and 7). No registry flag marks a terminal tool (`TOOL_REGISTRY` entries for the three carry the same `_route`/`_readOnly` metadata as `report_progress`), and building the names by string concatenation would evade the pin rather than meet it. Recommended resolution, applied as a paired pin bump in the first commit that adds a terminal name (70-03 Task 1): narrow both checks, never delete them, to the region outside one marker-bounded Phase 70 section of the module (for example between `// --- run_task outcome (Phase 70) ---` and `// --- end run_task outcome ---`, each marker exactly once), and add in the same commit a check that `beforeTurn`, `attemptStep`, `evaluateDecision`, `buildStaticCall`, `afterStep`, `observeTools`, `deliverPending` and `flushHandoff` name no terminal tool and that the marked section builds no tool call (no `buildStaticCall(` and no `toolCall` key). The `buildStaticCall` slice check (:1337-1339) and the executed-fast-call check (:1332-1334) stay unchanged, so D-17's guarantee (fast mode never emits a terminal tool) is still proven. If the orchestrator rejects this, the alternative is to inject the terminal-tool set and the terminal reason vocabulary from outside the module, which splits the D-18 frozen vocabulary from its classifier and is not recommended.
10. **D-22 condition (2) and the address rule.** FSB's address rule is `scrubPathSegment` (`jev-state.js:657-663`, not exported): `scrubText(segment)` plus, for a segment containing `%`, a `matchesSecret` check on `decodeURIComponent(segment)`. A per-segment `scrubText` comparison misses the percent-decoded case. 70-04 implements condition (2) as `FsbJevState.toOriginPath(url).path === new URL(url).pathname` (true exactly when no segment is redacted under the real address rule), or as `scrubText` plus the decoded check; either is tighten-only relative to the quoted wording.
11. **F5 token shape.** The bench's 22-character base64url token is not redacted per segment (item l), so plan 70-04 Task 1 takes its normal branch for both token shapes: the 22-character and 24-letter sub-checks both assert that the normalised goal equals the 68-08 exporter goal (`goalOf`). Today about 69% of bench goals trip `sensitive_goal` (3,457 of 5,000 random tokens), not all of them.
12. **PD-70-01: tighten-only narrowing of D-14's observation set (RESEARCH F1).** An observation is a later successful call of one of the 9 page-reading read-only tools (`_readOnly === true` and `_route` 'content' or 'cdp': `capture_screenshot, get_attribute, get_dom_snapshot, get_page_snapshot, get_text, read_page, read_sheet, wait_for_element, wait_for_stable`; item e) or a delivered hand-off snapshot (`deliverPending` :1191). `report_progress`, the terminal tools and the other `_readOnly` tools that never read the page are not observations, because under the literal 19-tool set `[uncertain click, report_progress, complete_task]` reads as `done`. Recorded in 70-CONTEXT.md as the 2026-10-16 D-14 amendment; the owner confirms it at V5 (M-70-06).
13. **PD-70-02: the code-held start page is `session._fastRunStartPage`.** D-22's start-page condition reads the origin + path of `tabInfo.url` (in scope at `background.js:14466`, item o) from its own memory-only field `session._fastRunStartPage`, never from the evidence record (which holds no URL, D-14) and never on the wire.
14. **Line anchors.** Every in-tree anchor quoted in the Phase 70 plans at `e1e6439c` has moved; use items n, o and p and the interface table (for example the bridge `settle` is :2753, `final_result: value,` :2785, `resolve(value);` :2800; background.js `activeSessions.set` :14246, `sendResponse` :14349, `const sessionHooks = createSessionHooks(sessionId);` :14466; agent-loop.js BEFORE emit :2335, AFTER emit :2915, AFTER_ITERATION emit :3014, meta-cognitive `return;` :2991; `mcp/src/errors.ts` success branch :473-475).

## u. For Phase 71

71-CONTEXT D-09 item 3 expects the typed words (`done`, `ambiguous`, `blocked`, `needs_confirmation`) in the `run_task` JSON `status` field, stored by the bench as `claimed.status`. Phase 70 keeps `status` unchanged (MCP-04, D-17: it still carries `success`, `partial`, `stopped`, `error` or `completed`). The typed outcome travels at **`fast_mode.outcome`** on the wire, present only when the Advanced Settings switch was on when the task started, and at **`runTask.fastMode.outcome`** in raw bench records (plan 70-07; committed rows and `RUN_ROW_KEYS` are unchanged). The bench-side frozen key mirror lives in `scripts/bench/lib/fast-mode.mjs` (`projectFastMode`, `FAST_MODE_BLOCK_KEYS`, `FAST_MODE_SUMMARY_KEYS`, `FAST_MODE_OUTCOMES`). Phase 71's plans change before execution to read those paths (71's own D-09 says its plans change if an item differs).
