# Phase 70: Bounded MCP Fast Task - Pattern Map

**Mapped:** 2026-10-15
**Files analyzed:** 20 (4 source files modified, 1 optional bench lib file, 6 new test or fixture files, 5 upstream test or fixture files extended, 2 registration files, 3 planning artifacts)
**Analogs found:** 18 / 20 (the classifier and the goal normaliser have no in-tree behavioral analog; see "No Analog Found")

All in-tree line numbers were read at `e1e6439c` in `the repository root`. Phase 67, 68 and 69 files do not exist in this tree yet. Their analogs are quoted from their PLANs with line numbers, and 70-01's sync re-check (D-24) must confirm them before any Phase 70 source edit.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `extension/background.js` (MODIFY: the helper's MCP branch, `fsbRegisterFastRunEvidence`, one guarded call; the page-observation predicate lives in `jev-fast-path.js`, see Analog C) | SW controller (start path) | request-response + event-driven (hook registration) | `createSessionHooks` `background.js:4558-4589`; 68-06 `fsbFastModeSessionField` (`68-06-PLAN.md:108,118-119`) | exact (same file, same seam) |
| `extension/ai/jev-fast-path.js` (MODIFY; created by 68-04/05/08) | pure service module | transform + event-driven (hook handlers) | `extension/ai/hooks/progress-hook.js:47-69` (handler factory); `extension/ai/screenshot-attachments.js:6-7,328-343` (module shape); 68-04/68-05 API; 68-08's lazy `TOOL_REGISTRY` lookup (`68-08-PLAN.md:115`) for `isPageObservationTool` | role-match (additions only) |
| `extension/ws/mcp-bridge-client.js` (MODIFY: start capture plus settle block) | bridge controller | event-driven to request-response | the same function `_handleStartAutomation` `:2650-2925` | exact |
| `scripts/bench/run-bench.mjs` (MODIFY: `runAutopilotArm` raw record) | CLI runner | batch / transform | the same function `:555-590`; `scripts/bench/lib/runs.mjs:35-39` frozen key list | exact |
| `scripts/bench/lib/fast-mode.mjs` (NEW; the fixed home of the bench key mirror and `projectFastMode`, RESEARCH Open Question 5 RESOLVED, 70-07-02) | bench utility | transform | `scripts/bench/lib/runs.mjs:1-60` | role-match |
| `tests/jev-run-task-upstream-contract.test.js` (NEW) | test (tripwire) | contract | 68-01's `tests/jev-fast-upstream-contract.test.js` (`68-01-PLAN.md:141-158`) | exact (planned) |
| `tests/fixtures/run-task-wire-golden.json` (NEW) | fixture | file-I/O | 68-06 `tests/fixtures/jev-fast-loop-off-golden.json` (`68-06-PLAN.md:155-160`) | role-match |
| `tests/run-task-fast-mode-wire.test.js` (NEW) | test (vm bridge harness) | event-driven | `tests/run-task-resolve-discipline.test.js:225-300`; `tests/mcp-bridge-client-lifecycle.test.js:514-564` | exact |
| `tests/jev-run-task-outcome.test.js` (NEW) | test (unit + static slice) | transform | `tests/agent-loop-iterator-guard.test.js:45-72`; `tests/ownership-leakage-regression.test.js:19-33` | role-match |
| `tests/mcp-run-task-fast-caller.test.mjs` (NEW) | test (in-process MCP) | request-response | 69-07 `tests/mcp-expect-caller.test.mjs` through 69-01 `tests/helpers/mcp-in-process.mjs`; in tree: `tests/mcp-native-host-packaging.test.js:966-986`, `tests/mcp-tool-smoke.test.js:177,328-332` | exact (planned) |
| `tests/bench-fast-mode-record.test.mjs` (NEW) | test (node:test) | transform | `tests/bench-report.test.mjs:9-32,76-90`; `tests/bench-drivers.test.mjs:1-30` | role-match |
| `tests/jev-run-task-disclosure.test.js` (NEW) | test (fact fixture) | transform | 68-12 `tests/jev-fast-settings.test.js` card section plus `tests/fixtures/jev-fast-disclosure-facts.js` (`68-12-PLAN.md:18,24,120-127`) | role-match (planned) |
| `tests/jev-fast-start-path.test.js` (EXTEND / invert per D-05) | test | unit + source | itself (`68-06-PLAN.md:108,112`) | exact |
| `tests/jev-fast-loop.test.js` (EXTEND / invert plus SC2 end to end) | test | event-driven | itself (`68-06-PLAN.md:155-160,190`) | exact |
| `tests/jev-fast-path.test.js` (EXTEND: profile pins, recorder, normaliser, re-pointed 68-05 bench-goal case at `:103`, 68-08 capture cases) | test | transform | itself (`68-04-PLAN.md:146-150`, `68-05-PLAN.md:98-114`) | exact |
| `tests/fixtures/agent-loop-fast-harness.js` (EXTEND: register-evidence option) | fixture | event-driven | itself (`68-06-PLAN.md:160`) | exact |
| `package.json`, `tests/delegation-phase-contract.test.js` (registration) | config | n/a | `tests/delegation-phase-contract.test.js:129-161` | exact |
| `70-SYNC-RECHECK.md`, `70-SWEEP-BASELINE.json`, `70-VALIDATION.md` | planning artifacts | n/a | `68-01-PLAN.md:118-162`; `66-02-SWEEP-BASELINE.json`; `68-VALIDATION.md:160-177` | exact |

---

## Pattern Assignments

### `extension/background.js` (SW controller; request-response plus hook registration)

**Analog A: the helper Phase 70 widens** (68-06, not in tree; `68-06-PLAN.md:108` behavior and `:118-119` action):
```
fsbFastModeSessionField(true, undefined) -> {enabled:true, stored:true, source:null}; (true, 'dashboard') -> enabled true;
(true, 'mcp') -> {enabled:false, stored:true, source:'mcp'}; (false, x), (undefined, x), ('true', x) -> null.
...
const fastModeField = fsbFastModeSessionField(storedSettings.fsbJevFastModeEnabled, source);
...(fastModeField ? { fastMode: fastModeField } : {}),        // next to the agentId spread
```
Phase 70 edits only the `source === 'mcp'` branch so that it returns `{enabled:true, stored:true, source:'mcp', budgetProfile:'run_task'}`. Every non-MCP return stays byte-identical, with no `budgetProfile` key (D-04). The 68 test extracts this function by name, so it must remain a top-level `function fsbFastModeSessionField(`.

**Analog B: hook registration shape to mirror without editing it** (`background.js:4576-4588`; `createSessionHooks` is hash-pinned by 68-SYNC-RECHECK item h):
```javascript
  // Permission hook: pre-checks tool permissions before execution
  if (typeof createPermissionHook === 'function' && typeof PermissionContext === 'function') {
    try {
      const permCtx = new PermissionContext();
      const permHook = createPermissionHook(permCtx);
      pipeline.register(LIFECYCLE_EVENTS.BEFORE_TOOL_EXECUTION, permHook);
    } catch (_e) {
      // PermissionContext may not be fully configured -- skip gracefully
      automationLogger.debug('Permission hook skipped', { sessionId, reason: _e.message });
    }
  }
  return pipeline;
```
Copy this into a new top-level `function fsbRegisterFastRunEvidence(pipeline, session, startUrl)`: a typeof-guarded API, a try/catch that skips quietly, and three `pipeline.register(LIFECYCLE_EVENTS.X, handler)` calls (BEFORE_TOOL_EXECUTION, AFTER_TOOL_EXECUTION, AFTER_ITERATION). The permission hook registers first inside `createSessionHooks`, so the evidence handler for BEFORE runs after it. That matches F3, where a denied call still emits BEFORE.

**Analog C: the page-observation predicate `isPageObservationTool` lives in `jev-fast-path.js`, behind 68-08's lazy registry lookup** (`68-08-PLAN.md:115`; plan 70-03 Task 1):
```javascript
  typeof TOOL_REGISTRY !== 'undefined' ? TOOL_REGISTRY : (typeof require === 'function' ? require('./tool-definitions.js').TOOL_REGISTRY : null)
```
Reuse the real helper 68-08 built around this expression (its name is recorded in 70-SYNC-RECHECK item e) and never resolve the registry at module load. The predicate is `def && def._readOnly === true && (def._route === 'content' || def._route === 'cdp')`, and it is false for an unknown name or a missing registry. Verified at `e1e6439c`, it gives exactly 9 tools: wait_for_element, wait_for_stable, read_sheet, capture_screenshot, read_page, get_text, get_attribute, get_dom_snapshot and get_page_snapshot. 70-03's test derives the set from `tool-definitions.js` and pins that list, so a registry change fails loudly. An earlier draft of this map put a background-side `fsbIsPageObservationTool` (built on `getToolByName`, `background.js:8675`, `tool-definitions.js:1461-1463`) in `background.js` and passed it into the module; that placement was dropped because 68-08 already gives the module a registry lookup, and keeping the predicate in the module means the loop harness, the unit tests and the service worker run the same code. `background.js` gains no predicate.

**Insertion anchor** (`background.js:14250-14265`; this is the new-session path only):
```javascript
    // Start the modular agent loop (Phase 181, D-01/D-02)
    const sessionHooks = createSessionHooks(sessionId);
    runAgentLoop(sessionId, {
      activeSessions,
      ...
      hooks: sessionHooks,
      emitter: null
    });
```
Insert exactly one guarded line between these two statements: `if (sessionData.fastMode) fsbRegisterFastRunEvidence(sessionHooks, sessionData, tabInfo && tabInfo.url);`.
- `tabInfo` is declared at `:13864` and re-read after smart navigation at `:13932`, so it holds the post-navigation URL (F5 start URL).
- Do not touch the follow-up path at `:13844` (`reactivationHooks`). `run_task` never reaches it (Open Question 4).
- Ordering fact for the bridge capture: `activeSessions.set(sessionId, sessionData)` (`:14031`) runs before `sendResponse({success:true, sessionId, ...})` (`:14134-14141`). So the session exists when the bridge's start dispatch returns. Record this in 70-SYNC-RECHECK.

**Source-pin cautions:**
- 57 test files read `background.js`, including the hash users `delegation-phase-contract`, `mcp-version-parity` and `bench-drivers`.
- No comment may contain the word `importScripts`.
- Run `node scripts/bench/sweep-tests.mjs --files extension/background.js --baseline .planning/phases/70-bounded-mcp-fast-task/70-SWEEP-BASELINE.json`.

---

### `extension/ai/jev-fast-path.js` (pure service module; transform plus hook handlers)

**Module shape analog** (`extension/ai/screenshot-attachments.js:6-7` and `:328-343`):
```javascript
(function initScreenshotAttachments(root) {
  'use strict';
  ...
  const api = { canCapture, storeToolResult, ..., constants: { MAX_SCREENSHOTS_PER_TURN, MAX_ATTACHMENT_BYTES_PER_TURN } };
  root.FsbScreenshotAttachments = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
```
The 68-04 acceptance criteria are stricter than this analog, and every one must hold after the Phase 70 additions (`68-04-PLAN.md:125-127`; D-25):
- `grep -nE "^(const|let|class|function) "` prints nothing, so every new declaration is indented inside the IIFE;
- no `chrome.`, `localStorage`, `importScripts`, `https://` (comments included; write the pattern as `https?:\/\/`), `setTimeout`, `setInterval` or `\bJEV_[A-Z_]+\b`;
- no `meetsThreshold`, `probabilities` or `.threshold`, and no `hadEffect`, `estimateCost`, `totalCost` or `getHashKey`;
- `afterStep` and `observeTools` contain no `await`, and nothing runs at load.

**Hook-handler factory analog** (`extension/ai/hooks/progress-hook.js:47-69`):
```javascript
function createToolProgressHook(emitter) {
  function toolProgressHandler(context) {
    try {
      emitter.emit(TOOL_EXECUTED, {
        sessionId: context.sessionId,
        toolName: context.toolName,
        success: !(context.toolResult && context.toolResult.error),
        iteration: context.iteration,
        timestamp: Date.now()
      });
    } catch (err) {
      console.warn('[progress-hook] toolProgressHandler error:', err);
    }
    return { shouldStop: false };
  }
  return toolProgressHandler;
}
```
For `createRunEvidenceHandlers(session, {startUrl})`, return `{beforeTool, afterTool, afterIteration}`; `afterTool` calls the module's own `isPageObservationTool` (Analog C), so no predicate is passed in. `startUrl` only seeds `session._fastRunStartPage` (origin + path; PD-70-02) and never enters the evidence record; `beforeTool` always clears `pending` first and sets it only for a non-terminal tool (70-03; RESEARCH Pattern 2's first draft differed and is marked superseded).
- Each handler is synchronous, wrapped in try/catch, and returns `{ shouldStop: false }` (or `undefined`); agent-loop reads only `denied`, `isStuck` and `shouldStop`.
- Drop the `console.warn` and `Date.now()`; the module has no clock.
- The factory creates `session._fastRunEvidence` (F13) with the layout in 70-03-PLAN.md's interfaces block, which holds no URL (PD-70-02). It never touches `_fastPath` or `jevMeasurement` (F12).

**Hook context shapes the handlers receive** (`extension/ai/agent-loop.js:2291-2297` and `:2866-2872`):
```javascript
        var permResult = await hooks.emit(_al_LIFECYCLE_EVENTS.BEFORE_TOOL_EXECUTION, {
          toolName: call.name,
          origin: '',
          session: session, sessionId: sessionId,
          iteration: iterNum
        });
...
        await hooks.emit(_al_LIFECYCLE_EVENTS.AFTER_TOOL_EXECUTION, {
          toolName: call.name, toolResult: result,
          session: session, sessionId: sessionId,
          iteration: iterNum
        });
```
There is no call object here, so the handlers cannot see `source:'jev'` (F2). Use the `fastIteration` marker set in 68-05 step u instead.

**Evidence semantics to reuse, not re-implement** (`68-04-PLAN.md:83,146`): `classifyStepEvidence(op, toolResult)` returns `{outcome:'progress'|'unconfirmed'|'no_effect'|'uncertain'|'stale'|'failed'|'denied', reason, effectObserved}` and reads the nested `toolResult.result`. `uncertain` means `outcome:'unknown'`, `mayHaveExecuted` or `bfCacheDetected`.

**Budget read sites that become profile reads** (`68-05-PLAN.md:125` step g, `:126` step h, `:135` step q, `:138` step t). The constants come from `68-04-PLAN.md:77`: `FAST_MAX_STEPS 12; FAST_MAX_CALLS 16; FAST_WALL_BUDGET_MS 20000; FAST_MAX_CONSECUTIVE 3; FAST_ESCALATION_LATCH 3`.
- Add a sibling export `BUDGET_PROFILES = Object.freeze({autopilot, run_task})` plus `budgetsFor(session)`, which reads `session.fastMode.budgetProfile`, never `source` (RESEARCH Pattern 1, `70-RESEARCH.md:543-553`).
- Keep `constants` byte-identical (Assumption A2).

**Two additive markers inside existing 68-05 steps:**
- Step u (`68-05-PLAN.md:139`), on act: `if (session._fastRunEvidence) session._fastRunEvidence.fastIteration = ctx.iteration;`.
- Step v flush helper (`68-05-PLAN.md:140`): only when `requestSnapshot` returned `success:true` with a snapshot, `if (session._fastRunEvidence) session._fastRunEvidence.lastObservationSeq = ++session._fastRunEvidence.seq;` (F14). The "Snapshot unavailable" branch writes nothing.

**Goal normaliser call site:** step o (`68-05-PLAN.md:133`) currently passes `goal session.task` to `toBuilderInput`. Replace it with `normaliseGoal(session.task, [menu.url, session._fastRunStartPage])` (PD-70-02; 70-04), so the normaliser runs before step p's `buildRequest` secret scan. For the sketch, see RESEARCH Pattern 5 (`70-RESEARCH.md:644-661`).

**Classifier inputs: real producer excerpts that define the closed vocabulary.**

`notifySidepanel` message fields (`agent-loop.js:1562-1588`, abridged):
```javascript
      var message = {
        action: terminal && terminal.outcome === 'error' ? 'automationError' : 'automationComplete',
        sessionId: sid,
        ...
        partial: terminal.partial || terminal.stopped,
        stopped: terminal.stopped,
        error: terminal.outcome === 'error' ? (terminal.error || terminal.resultText || 'Task failed') : null,
        reason: terminal.reason || null,
        outcome: terminal.outcome,
        blocker: terminal.blocker || null,
        nextStep: terminal.nextStep || null,
```
`createTerminalOutcome` default reasons (`agent-loop.js:1500-1511`):
```javascript
    var normalizedOutcome = outcome === 'partial' || outcome === 'stopped' || outcome === 'error' ? outcome : 'success';
    var reason = data.reason || (
      normalizedOutcome === 'success' ? 'completed' :
      normalizedOutcome === 'partial' ? 'blocked' :
      normalizedOutcome
    );
```
Auth walls (`agent-loop.js:792-799`): `auth_required | credentials_missing | user_skipped_login | credentials_failed | manual_approval`.
Safety reasons (`agent-loop.js:1679-1691`): `iteration_limit_exceeded | cost_limit_exceeded | time_limit_exceeded | safety`.
Stuck reasons (`extension/ai/turn-result.js:53-57`): `stuck_action_repetition | stuck_no_goal_progress | stuck_dom_hash`.
User stop (`background.js:14511-14522`): `{action:'automationComplete', ..., outcome:'stopped', reason:'user_stopped', stopped:true}`.
Add these F6 reasons too: `session_not_found` and `session_not_running` (`agent-loop.js:1710-1775`), and a reasonless `automationError` (`background.js:14194-14201`, which maps to `error`).

**Human-gate result shapes** (D-15, F7):
- Payment decline (`tool-executor.js:572-581`): `makeResult({ success: false, hadEffect: false, error: null, result: { declined: true, reason: confirmationResult.reason || 'user_declined' } })`. Detect it with `toolName === 'fill_payment_method' && toolResult.result && toolResult.result.declined === true`.
- Consent (`capability-router.js:61-68` `_err(code)` gives `{success:false, code, errorCode, error}`, wrapped by `tool-executor.js:805-811` as `result: response`). Detect it with `toolName === 'invoke_capability' && toolResult.result && toolResult.result.code === 'RECIPE_CONSENT_REQUIRED'`. Confirm the wrapping in 70-SYNC-RECHECK.

**`jev` summary sources** (no new fields on these structures):
- Per-command totals (`68-04-PLAN.md:150`): `{command, fastSteps, jevCalls, jevMs, usd:{provider, estimate}, escalations:{<reason>:n}}`.
- Attempts carry `calibrationStatus`.
- `agentState.jevFast.latched` and `_fastPath.offReason` (`68-05-PLAN.md:73-74`).

---

### `extension/ws/mcp-bridge-client.js` (bridge controller; event-driven to request-response)

**Capture analog in the same closure** (`:2693-2696`, `fireHeartbeat`):
```javascript
      const fireHeartbeat = async () => {
        if (settled) return; // Pitfall 5 guard -- single-resolve invariant
        const sessions = (typeof activeSessions !== 'undefined') ? activeSessions : null;
        const session = (sessions && typeof sessions.get === 'function') ? sessions.get(sessionId) : null;
```
Copy the two guarded lines once, right after `const sessionId = response.sessionId;` (`:2662`), and keep the reference only `if (session && session.fastMode)`. The guard is required because `tests/mcp-bridge-client-lifecycle.test.js` defines no `activeSessions` (F15).

**Settle point to extend** (`:2744-2792`, abridged):
```javascript
      const settle = (value, source) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearInterval(heartbeatTimer);  // Phase 239 plan 02 -- paired teardown
        ...
        try {
          const store = (typeof globalThis !== 'undefined') ? globalThis.FsbMcpTaskStore : null;
          if (store && typeof store.writeSnapshot === 'function') {
            let terminalStatus = 'complete';
            if (value && value.status === 'error') terminalStatus = 'error';
            ...
              final_result: value,
            }).catch(() => { /* best-effort */ });
          }
        } catch (_e) { /* never block resolve on persistence */ }
        try { ... console.log('[FSB MCP] run_task completion sent', redact({ sessionId, status: value && value.status, source })); }
        catch (_e) { /* logging never blocks resolution */ }
        resolve(value);
      };
```
Changes:
- Extend the signature to `(value, source, terminalMessage)`.
- After the listener teardown and before the store write, add one isolated `try { ... } catch { ... }` that builds `finalValue = Object.assign({}, value, { fast_mode: block })` only when the captured reference exists. It falls back to `classifier_error`, then to `value` unchanged (F4; RESEARCH Pattern 3, `70-RESEARCH.md:591-618`).
- Change only `final_result: value` to `final_result: finalValue` and `resolve(value)` to `resolve(finalValue)`.
- `terminalStatus` and the log line keep reading `value`.

**Terminal handlers that pass the message** (`:2881-2895`):
```javascript
      const handleComplete = (message, source) => {
        settle({
          sessionId,
          status: message.outcome || message.result?.status || (message.partial ? 'partial' : 'completed'),
          result: message.result || {},
        }, source);
      };
      const handleError = (message, source) => {
        settle({ sessionId, status: 'error', error: message.error || 'Unknown automation error' }, source);
      };
```
Add `message` as the third `settle` argument in both handlers. The object literals stay byte-identical (D-01).

**Safety net stays untouched** (`:2835-2841`). Its source string `'safety_net_600s'` is the classifier's row-2 discriminator:
```javascript
        settle({
          sessionId,
          success: true,
          partial_outcome: 'timeout',
          partial_state,
          hint: 'lifecycle event missing -- audit cleanup paths',
        }, 'safety_net_600s');
```

**Wire path that carries the block with no MCP change** (`:1391-1392`):
```javascript
      const result = await this._routeMessage(type, payload || {}, id);
      this._sendResult(id, { success: true, ...result });
```
Then `mcp/src/errors.ts:452-454`: `if (fsbResult && fsbResult.success) return { content: [{ type: 'text', text: JSON.stringify(fsbResult, null, 2) }] };`, and `mcp/src/tools/autopilot.ts:209` `return mapFSBError(result);`.

**Pins on this file (D-25):**
- `tests/delegation-phase-contract.test.js:2705-2713` scans for `spawn(`, `fork(`, `execFile(`, `execSync(`, `spawnSync(` and `shell:`/`terminal://`, so new identifiers must avoid those tokens.
- The same file has the `:2441-2516` and `:2529+` audits (`eventTail`, `nonce`, `DELEGATION_HEARTBEAT_INTERVAL_MS = 20000`).
- `tests/mcp-version-parity.test.js:242`, `tests/run-task-resolve-discipline.test.js:257`, `tests/run-task-heartbeat.test.js:258` and `tests/lattice-replay-background-contract.test.js:15` read the file whole.

---

### `scripts/bench/run-bench.mjs` (CLI runner; batch / transform)

**Analog: the same function** (`:571-578`):
```javascript
  const timed = await deps.runTaskTimed(client, instruction, task.timeBudgetMs, { signal });
  const json = isPlainObject(timed.json) ? timed.json : null;
  const runTask = {
    isError: typeof timed.isError === 'boolean' ? timed.isError : null,
    status: json && typeof json.status === 'string' ? json.status : null,
    partialOutcome: json && typeof json.partial_outcome === 'string' ? json.partial_outcome : null,
    swEvicted: !!(json && json.sw_evicted === true),
    sessionIdSource: timed.sessionIdSource || null,
  };
```
- Add `if (json && isPlainObject(json.fast_mode)) runTask.fastMode = projectFastMode(json.fast_mode);` after the literal, so that records without the block keep their exact key set and order.
- `isPlainObject` is local (`:165-167`).
- The raw record copies `runTask` verbatim (`:769` `const runTask = ... result.runTask`; `:811` `runTask,`), so nothing else changes. Committed rows (`RUN_ROW_KEYS`) stay untouched (F10).

**Frozen key-list style for the bench mirror** (`scripts/bench/lib/runs.mjs:35-39`):
```javascript
export const RUN_ROW_KEYS = Object.freeze([
  'schemaVersion', 'campaignId', 'runId', ...
]);
```
Declare `FAST_MODE_BLOCK_KEYS`, `FAST_MODE_SUMMARY_KEYS` and `FAST_MODE_OUTCOMES` the same way in the new `scripts/bench/lib/fast-mode.mjs`, next to `projectFastMode`; the location is fixed (RESEARCH Open Question 5 RESOLVED, 70-07-02), and `run-bench.mjs` only imports `projectFastMode`. Grep `tests/` for file-list or export pins on `scripts/bench/lib/` first and bump any in the same commit.
- Pins: `tests/bench-drivers.test.mjs` and `tests/bench-identity.test.mjs` (hash readers), and `tests/bench-report.test.mjs:76-90` (`RUN_ROW_KEYS` deep-equal plus `Object.isFrozen`).
- `classifyAutopilot` (`runs.mjs:224-236`) stays unchanged.

---

### `tests/run-task-fast-mode-wire.test.js` (NEW; vm bridge harness, event-driven)

**Analog:** `tests/run-task-resolve-discipline.test.js`.

Harness context (`:229-262`):
```javascript
  const activeSessions = new Map();
  ...
  const context = {
    chrome: chromeMock, WebSocket: FakeWebSocket, console, Math, Date: FakeDate, EventTarget, CustomEvent,
    setInterval: clock.setInterval, setTimeout: clock.setTimeout, clearInterval: clock.clearInterval, clearTimeout: clock.clearTimeout,
    Promise,
    activeSessions,
    dispatchMcpMessageRoute: opts.dispatchMcpMessageRoute || (async () => ({ success: true, sessionId: opts.sessionId || 'sess_test' })),
    globalThis: {}
  };
  context.globalThis = context;
  context.fsbAutomationLifecycleBus = new EventTarget();
  context.FsbMcpTaskStore = taskStoreStub;
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
  const footer = `
this.__phase239 = { MCPBridgeClient, mcpBridgeClient, lifecycleBus: typeof fsbAutomationLifecycleBus !== 'undefined' ? fsbAutomationLifecycleBus : null };
`;
  vm.runInNewContext(`${source}\n${footer}`, context, { filename: 'ws/mcp-bridge-client.js' });
```
Driving a settle path (`:303-316`):
```javascript
    const promise = client._handleStartAutomation({ task: 'lifecycle wins' }, 'mcp_lw');
    await flushMicrotasks();
    harness.exports.lifecycleBus.dispatchEvent(new CustomEvent('automationComplete', {
      detail: { action: 'automationComplete', sessionId, result: { ok: true }, outcome: 'success' }
    }));
    const resolved = await promise;
```
Settle-value deep-equal style (`tests/mcp-bridge-client-lifecycle.test.js:555-564`):
```javascript
  assertDeepEqual(toPlainObject(result), { sessionId, status: 'completed', result: { summary: 'lifecycle bus completion received' } }, '...');
```
Phase 70 specifics:
- Seed `activeSessions.set(sessionId, session)` inside `dispatchMcpMessageRoute` before it resolves; this mirrors `background.js:14031` before `:14134`.
- Set `context.FsbFastPath = require('../extension/ai/jev-fast-path.js')` for the "loaded" runs, and leave it unset for the "not loaded" runs.
- The throwing case uses `Object.defineProperty(context, 'FsbFastPath', { get() { throw new Error('x'); } })`.
- Cover the five paths: runtime `_emit`, bus, error, stop (`outcome:'stopped', reason:'user_stopped'`), and safety net via `clock.advance(600_000)`.
- Assert `writeSnapshotCalls` holds `final_result.fast_mode`.
- Compare against `tests/fixtures/run-task-wire-golden.json`, then do the F9 re-serialization check (`70-RESEARCH.md:752-762`).

---

### `tests/fixtures/run-task-wire-golden.json` (NEW fixture; file-I/O)

**Analog:** 68-06's off-path golden rule (`68-06-PLAN.md:155-160`): "is written once, with the unedited agent-loop.js ... (a one-off node script under /tmp, not committed; the golden file is committed)".
- Capture the switch-off settle values for all five paths, plus each `JSON.stringify({success:true, ...value}, null, 2)` text, from the unedited `mcp-bridge-client.js` in 70-01, before any Phase 70 edit.
- Never regenerate it afterwards (RESEARCH anti-pattern "Hand-writing the switch-off golden").

---

### `tests/jev-run-task-outcome.test.js` (NEW; unit plus static slice)

**Function slice extractor** (`tests/ownership-leakage-regression.test.js:19-33`):
```javascript
function extractNamedFunction(source, name) {
  const asyncStart = source.indexOf('async function ' + name + '(');
  const start = asyncStart >= 0 ? asyncStart : source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Function not found: ' + name);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index++) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') { depth -= 1; if (depth === 0) return source.slice(start, index + 1); }
  }
  throw new Error('Unbalanced function: ' + name);
}
```
**Source-scan style** (`tests/agent-loop-iterator-guard.test.js:45-69`): `const src = fs.readFileSync(PATH, 'utf8'); check(src.indexOf(X) !== -1, '...')` and `(src.match(/.../g) || []).length === N`.

Phase 70 specifics:
- Slice `classifyRunTaskOutcome` and its helpers out of `jev-fast-path.js` and assert none of `decisions`, `meetsThreshold`, `threshold`, `probabilities`, `task`, `label`, `url` or `title` appears.
- Derive the reason table by scanning `agent-loop.js` for `createTerminalOutcome(` sites and `reason: '<literal>'`, `turn-result.js` STUCK_REASONS, `mapSafetyReasonToConstant` outputs and `background.js` stop broadcasts (Pitfall 6).
- Load the module via `require('../extension/ai/jev-fast-path.js')`, the module.exports branch (`68-04-PLAN.md:126` uses the same `require`).
- Marker-string scan over `JSON.stringify(block)`.

---

### `tests/mcp-run-task-fast-caller.test.mjs` (NEW; in-process MCP caller, request-response)

**Primary analog (planned):** 69-07 Task 2 (`69-07-PLAN.md:131-162`) through the 69-01 helper `tests/helpers/mcp-in-process.mjs` (`69-01-PLAN.md:140-146,198-203`):
```
makeStubBridge({ onSend }): { isConnected: true, on() {}, off() {}, async sendAndWait(message, options) } records { message, options } into calls; returns onSend ? onSend(message, options) : { success: true }
createInProcessClient({ runtimePath = <REPO_ROOT>/mcp/build/runtime.js, bridge, agentScope }) -> { client, runtime, close }
assertBuildFresh(): throws when mcp/src is newer than mcp/build or runtime.js is missing
```
**In-tree raw pattern** (`tests/mcp-native-host-packaging.test.js:972-983`):
```javascript
    const { Client } = await import(pathToFileURL(join(sdkRoot, 'client/index.js')));
    const { InMemoryTransport } = await import(pathToFileURL(join(sdkRoot, 'inMemory.js')));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'packed-icon-test', version: '1.0.0' });
    try { await server.connect(serverTransport); await client.connect(clientTransport); ... }
    finally { await client.close(); await server.close(); }
```
**Canned start response precedent** (`tests/mcp-tool-smoke.test.js:177`): `'mcp:start-automation': { success: true, sessionId: 'smoke-session', status: 'started' }`. The payload pin is at `:328-332`.

Phase 70 specifics:
- `onSend` answers `mcp:start-automation` with `{success:true, ...recordedSettleValue}` from the wire-test outputs, mirroring `mcp-bridge-client.js:1392`.
- Call `run_task {task}`, parse `content[0].text`, and assert `fast_mode` is intact, `isError` is absent, and the switch-off text is byte-equal to the golden's `mapFSBError` text.
- Call `assertBuildFresh()` first. Bind no port (`grep -cE "listen\(|createServer|7225|7226"` gives 0). Register it after chain step 12 (F16).

---

### `tests/bench-fast-mode-record.test.mjs` (NEW; node:test, transform)

**Analog header and imports** (`tests/bench-report.test.mjs:9-32`):
```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
...
import { createRunExecutor, main, runCampaignLoop } from '../scripts/bench/run-bench.mjs';
```
**Frozen-list pin style** (`tests/bench-report.test.mjs:76-90`): `assert.deepEqual([...RUN_ROW_KEYS], [...])` and `assert.ok(Object.isFrozen(list))`.

Phase 70 specifics:
- Import `runAutopilotArm` (exported at `run-bench.mjs:555`) and call it with fake `deps` `{openTab, runTaskTimed, getSessionDetailWithRetry, now}`. The fakes-only rule is in the `tests/bench-drivers.test.mjs:1-8` header.
- Parity: the bench key list must deep-equal the extension's frozen list, `require`d through `createRequire(import.meta.url)('../extension/ai/jev-fast-path.js')`.

---

### `tests/jev-run-task-upstream-contract.test.js` (NEW; tripwire)

**Analog (planned):** `68-01-PLAN.md:141-158`, step 5:
```
plain Node script: local check(cond, msg) counters, a results line, process.exit(failed > 0 ? 1 : 0); async main for the one dynamic import ...
Each failing check prints "upstream drift: <name> -- update 68-SYNC-RECHECK.md and the Phase 68 plans; never weaken the upstream test".
```
**In-tree check-counter style** (`tests/run-task-resolve-discipline.test.js:31-40`):
```javascript
let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
```
It covers the D-24 interface list:
- `fsbFastModeSessionField` shapes (extracted by name);
- the `FsbFastPath` exports and constants;
- the 67 `buildRequest`, `scrubText`, `matchesSecret` and `toOriginPath`;
- the 69 helper and the shape-freeze file names;
- the `createSessionHooks` slice SHA-256, pinned as a literal.

Use "70-SYNC-RECHECK.md" in the drift message.

---

### Extended 68 suites (D-05 inversions; edit, never delete)

| File | Case to invert or re-point | Source of truth |
|---|---|---|
| `tests/jev-fast-start-path.test.js` | `(true,'mcp') -> {enabled:false, stored:true, source:'mcp'}` becomes `{enabled:true, stored:true, source:'mcp', budgetProfile:'run_task'}`; the non-MCP cases stay byte-identical | `68-06-PLAN.md:108`; source checks `:112` (the createSessionHooks hash is unchanged) |
| `tests/jev-fast-loop.test.js` | the "run_task: a session with fastMode {enabled:false, stored:true, source:'mcp'} ... same as the golden" case becomes "a session built by the real helper for source 'mcp' takes an accepted fast step"; add the SC2 end-to-end cases (RESEARCH test map MCP-03-e) | `68-06-PLAN.md:190`; harness `:160` |
| `tests/jev-fast-path.test.js` | rename the `not_enabled` case so it no longer claims to be run_task (`68-05-PLAN.md:99`); re-point the bench-goal `sensitive_goal` case (`:103`), add the `sk-` and query-token latch cases, and invert the 68-08 `{enabled:false, source:'mcp'}` capture cases | `68-05-PLAN.md:99,103`; `68-08-PLAN.md:103-104` |
| `tests/fixtures/agent-loop-fast-harness.js` | add one option (for example `registerRunEvidence: true`) that calls the same `FsbFastPath.createRunEvidenceHandlers` API the background helper uses on the harness's real `HookPipeline` | `68-06-PLAN.md:160` (`createHarness({providerKey, loadFastPath, sessionPatch, contentResponder, providerScript, deps, jevClient, permissionDenies})`) |

---

### `tests/jev-run-task-disclosure.test.js` (NEW; fact fixture)

**Analog (planned):** the 68-12 card section of `tests/jev-fast-settings.test.js` against `tests/fixtures/jev-fast-disclosure-facts.js`, which exports `SHARED_PHRASES, CARD_ONLY_PHRASES, PAGE_ONLY_PHRASES, FORBIDDEN_PATTERNS, ENFORCEMENT, textOf(html)` (`68-12-PLAN.md:24`). The card is scoped from `id="fsbJevFastModeCard"` to `<!-- /fsbJevFastModeCard -->` (`:123`).

The privacy section's "Control" fact names the MCP settings tool (`68-10-PLAN.md:71`). The 68-12 card copy has no MCP sentence and the fixture exports no Control phrase, so the settings-tool check runs on the privacy section only (70-04-02); the card's lack of an MCP sentence is recorded for M-70-09. The goal-suffix and at-most-one-decide checks call the real `normaliseGoal` and the 68 harness with the shipped `UNCALIBRATED` fake answer. Edit no copy; if a check fails, stop and raise it (D-23).

---

### Registration (`package.json`, `tests/delegation-phase-contract.test.js`)

**Analog** (`tests/delegation-phase-contract.test.js:129-161`): a frozen `REFINEMENT_ROOT_TEST_COMMANDS` array whose current last entry is the grouped `'node --test tests/bench-export-history.test.mjs ... tests/bench-drivers.test.mjs'`. The `package.json` `scripts.test` chain has 304 ` && `-joined commands.
- Append every new command once, at the end of both lists, in the creating commit, after the 66.1, 67, 68 and 69 appends.
- Never edit the `PRE_PHASE6x` hashes.
- Verify with `node -e "const p=require('./package.json').scripts.test.split(' && ');if(p.filter(c=>c==='<cmd>').length!==1)process.exit(1)"` (`68-01-PLAN.md:160`).

---

### Planning artifacts (`70-SYNC-RECHECK.md`, `70-SWEEP-BASELINE.json`, `70-VALIDATION.md`)

**Analog:** `68-01-PLAN.md:120-162`.
- Preconditions: the SUMMARYs exist and `git status --porcelain -- extension tests package.json scripts showcase mcp` is empty.
- Record `P70_START=<40-hex>` as the first line.
- Write the interface table with the columns "Interface | Quoted at | Real location | Status (MATCH, RENAMED, CHANGED, MISSING)".
- Record measured facts with file:line, slice hashes and a "Drift substitutions" section. Record F1's narrowing of the observation set here as a tighten-only substitution.
- Sweep baseline: `node scripts/bench/sweep-tests.mjs --files extension/background.js extension/ws/mcp-bridge-client.js extension/ai/jev-fast-path.js scripts/bench/run-bench.mjs --out .planning/phases/70-bounded-mcp-fast-task/70-SWEEP-BASELINE.json`. Exit 1 is allowed as a baseline; restore the crawler files afterwards.
- VALIDATION Manual-Only table: copy the columns of `68-VALIDATION.md:164` (`| ID | Block | Behavior | Requirement | Why Manual | Test Instructions |`) and the explicit-"none" V1 row style of `:166`.

---

## Shared Patterns

### Guarded lazy global resolution
**Source:** `mcp-bridge-client.js:2727-2728` and `:2760` (`const store = (typeof globalThis !== 'undefined') ? globalThis.FsbMcpTaskStore : null; if (store && typeof store.writeSnapshot === 'function') {...}`); `background.js:8675`.
**Apply to:** the bridge's `FsbFastPath.buildFastModeBlock` lookup at settle, the background registration helper, and `normaliseGoal`'s `FsbJevState` lookup (`resolveJevState()`).

### Optional work never blocks the main path
**Source:** `mcp-bridge-client.js:2779` (`catch (_e) { /* never block resolve on persistence */ }`), `:2790`; `progress-hook.js:57-66`.
**Apply to:** the block build at settle (a nested fallback, and `resolve()` is always reached, F4), every evidence handler, and the registration helper.

### Absent when off (D-01)
**Source:** `background.js:14011` (`...(requestAgentId ? { agentId: requestAgentId } : {}),`); 68-06's `...(fastModeField ? { fastMode: fastModeField } : {}),`.
**Apply to:** the `fast_mode` key (only when the captured session had `fastMode`), the `budgetProfile` key (MCP only), `runTask.fastMode` (only for a plain-object block), and evidence registration (only when `sessionData.fastMode`).

### Frozen key lists plus a parity test (gotcha 6)
**Source:** `scripts/bench/lib/runs.mjs:35-39`; `tests/bench-report.test.mjs:76-90` (`deepEqual` plus `Object.isFrozen`).
**Apply to:** the `fast_mode` block keys, the `jev` sub-keys and the closed outcome and reason vocabularies. Share one list across the producer test, the wire test and the bench mirror.

### Null, never 0, for missing values
**Source:** `68-04-PLAN.md:150` (usd buckets stay null until a source arrives); the bench `runTask` literal's `: null` defaults (`run-bench.mjs:574-577`).
**Apply to:** `jev_ms`, `calibration`, `latched`, `exhausted`, and `uncertain_unobserved: null` when no evidence was captured. Counts (`attempts`, `calls`, `fast_steps`) may be 0.

### Plain-node test style and Node 20
**Source:** `tests/run-task-resolve-discipline.test.js:31-44` (counters, `flushMicrotasks`), `:281-290` (`runTest` wrapper). The `.mjs` suites use `node:test` (`tests/bench-report.test.mjs:9-15`).
**Apply to:** every new `.test.js` file. Run each under `npx --offline -y node@20`. No Node 22+ globals, no port 7225 or 7226, no global `WebSocket`.

### Source-pin discipline (D-25)
**Source:** `tests/agent-loop-iterator-guard.test.js:45-69`; `tests/delegation-phase-contract.test.js:2705-2713`; the 68-04 grep acceptance lines (`68-04-PLAN.md:125-127`).
**Apply to:** each commit touching `background.js`, `mcp-bridge-client.js`, `jev-fast-path.js` or `run-bench.mjs`.
- First grep `tests/` for `.match(`, `.includes(`, `indexOf(`, `readFileSync` and `sha256(` on the file, then bump paired pins in the same commit.
- `agent-loop.js`, `createSessionHooks`, `tool-definitions.js`, `ai-integration.js` and all of `mcp/` stay byte-unchanged (`git diff --quiet "$P70_START" -- mcp/`).

---

## No Analog Found

| File / Part | Role | Data Flow | Reason |
|---|---|---|---|
| `classifyRunTaskOutcome` / `buildFastModeBlock` (inside `jev-fast-path.js`) | pure classifier | transform | No typed-outcome classifier exists. The vocabulary sources are quoted above (agent-loop terminal producers, turn-result STUCK_REASONS, background stop broadcasts). Use RESEARCH Pattern 4 (`70-RESEARCH.md:626-640`) with the F6 additions. |
| `normaliseGoal` (inside `jev-fast-path.js`) | pure text transform | transform | No in-tree goal rewriting exists. The rule matches 68-08's exporter (`68-08-PLAN.md:28,144`: "goal equals the core task instruction with the leading 'Open {startUrl}.' removed and trimmed"). Use RESEARCH Pattern 5 (`70-RESEARCH.md:644-661`). Bench rendering is `renderInstruction` (`scripts/bench/lib/tasks.mjs:461-471`), and all 12 core instructions start `Open {startUrl}. `. |
| Upstream-owned interfaces (`FsbFastPath` base API, `FsbJevState`, the 68 harness and fake gateway, the 69 in-process helper, the 68-12 fact fixture) | various | various | Not in this worktree. They are quoted from the 67, 68 and 69 PLANs above, and 70-01 re-checks them (D-24). |

## Metadata

**Analog search scope:**
- `extension/ws/`, `extension/background.js`, `extension/ai/` (including `hooks/`, `agent-loop.js`, `hook-pipeline.js`, `tool-definitions.js`, `tool-executor.js`, `turn-result.js`, `screenshot-attachments.js`), `extension/utils/capability-router.js`;
- `scripts/bench/` (`run-bench.mjs`, `lib/runs.mjs`, `lib/tasks.mjs`, `sweep-tests.mjs`);
- `mcp/src/errors.ts` and `mcp/src/tools/autopilot.ts` (read only);
- `tests/` (resolve-discipline, lifecycle, heartbeat, delegation-phase-contract, ownership-leakage, iterator-guard, bench-report, bench-drivers, native-host-packaging, mcp-tool-smoke, mcp-client-identity, mcp-version-parity);
- the 68-01/04/05/06/08/09/10/12 and 69-01/07 PLANs and `68-PATTERNS.md`.

**Files scanned:** about 30 (the graphify graph is dated July 2026 and gave nothing relevant to this phase, so grep and targeted non-overlapping reads were used).
**Pattern extraction date:** 2026-10-15
