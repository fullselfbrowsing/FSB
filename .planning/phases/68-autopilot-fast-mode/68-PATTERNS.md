# Phase 68: Autopilot Fast Mode - Pattern Map

**Mapped:** 2026-10-15
**Worktree:** `the repository root` at `e1e6439c` (Phases 66.1, 67, 69 are planned, not present; their interfaces are quoted from PLANs)
**Files analyzed:** 30 (9 new, 21 modified)
**Analogs found:** 28 / 30 (2 partial-only: the `runAgentIteration` end-to-end harness and the union risk classifier)

All line numbers below were read at `e1e6439c`. Upstream phases will shift them; the executor must re-grep the quoted anchor text, never trust the number alone.

**Post-67 sync (2026-10-17, c7a7d66f).** Phases 66.1, 67 and 69 are code-complete here. `background.js` lines after :818 moved by +3 (three 67-11 load lines at :819-821); `options.js`, `config.js` and `mcp-tool-dispatcher.js` moved (each plan's interfaces block has the verified numbers); `agent-loop.js`, `tool-executor.js`, `tool-definitions.js`, `control_panel.html`, `init-config.js`, `automation-logger.js` and every content script are unchanged. The 67-11 boundary suite scans text files under `extension/ui` and `extension/config` for the SUBSTRING `jev` (so the switch key trips it), allows `/jev/i` in `background.js` only on the jev-*.js load lines, and allows exactly one `<scheme>://` literal across all jev-*.js files; the plans narrow it with explicit allowlists (68-01, 68-04, 68-06, 68-08, 68-12). See 68-CONTEXT.md "Post-67 sync" for the full list.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `extension/ai/jev-fast-path.js` (NEW) | service (classic SW module) | request-response + event-driven (per-iteration decision) | `extension/ai/screenshot-attachments.js` (session-scoped, memory-only, consumed from agent-loop) + 67-06/07/08 module rules | exact (shape), role-match (logic) |
| `extension/ai/agent-loop.js` | service (iteration body) | event-driven | itself: `_al_ScreenshotAttachments` call seam `:1915-1917`, meta-attempt `user` push `:2940` | exact |
| `extension/background.js` | config/bootstrap + controller | request-response | itself: importScripts block `:803-818`, settings read `:13954-13959`, conditional spread `:14011`, `contentScriptReady` case `:12459-12487` | exact |
| `extension/config/config.js` | config (schema) | CRUD | 66.1-01 `FsbSettingsSchema` entry contract; `Config.defaults` `:16-59` | exact |
| `extension/config/init-config.js` | config | CRUD | itself `:4-50` (`defaultConfig`) | exact |
| `extension/ui/options.js` | component (control panel) | CRUD | `fsbChangeReportsEnabled` sites `:45, :327, :1000-1007, :2039-2043, :2375` | exact |
| `extension/ui/control_panel.html` | component (markup) | static | Action Change Reports card `:607-632` | exact |
| `extension/content/dom-state.js` | model (content registry) | in-memory | `RefMap` `:621-668`, exports `:787-788` | exact |
| `extension/content/dom-analysis.js` | utility (content extractor) | transform | `buildMarkdownSnapshot` registration loop `:2537-2572`; `inferElementPurpose` `:263-337`; `extractPageText` `:2761+` | role-match |
| `extension/content/messaging.js` | controller (content message router) | request-response | `getMarkdownSnapshot` case `:895-913`; COMPACT REF branch `:1039-1062` | exact |
| `extension/utils/automation-logger.js` | service (persistence) | file-I/O (chrome.storage) | `cloneIterationTimingForPersistence` `:237-245` + use sites `:1022`, `:1079` | exact |
| `extension/ws/mcp-tool-dispatcher.js` | controller (projection) | transform | `sanitizeSessionDetail` `:2230-2264`, `sanitizeActionHistoryEntry` `:2211-2228`, `projectAutopilotIterationRow` `:2583-2603` | exact |
| `scripts/bench/shadow/export-capture.mjs` (NEW) | utility (CLI exporter) | batch / file-I/O | `scripts/bench/export-history.mjs` (CLI + allowlist + leak check) + `cdp.mjs` `readExtensionStorageFlag` `:377-398` | exact |
| `showcase/.../privacy/privacy-page.component.html` | component (static legal page) | static | itself: External Services `:51-59`, telemetry Limited Use `:238-239`, history `:266-269` | exact |
| `showcase/.../privacy/privacy-history-archive.component.html` | component (archive) | static | itself `:1-7` (September entry) | exact |
| `showcase/angular/src/locale/messages*.xlf` (7) | config (generated i18n) | batch | `ng extract-i18n` + sync scripts (never hand-edited) | exact (workflow) |
| `tests/jev-fast-settings.test.js` (NEW) | test (source-regex + DOM-stub) | static | `tests/change-report-settings-ui.test.js` (whole file, 81 lines) | exact |
| `tests/jev-fast-menu.test.js` (NEW) | test (vm content slices) | transform | `tests/dom-analysis-viewport-priority.test.js` `:1-55`; `tests/selector-fail-closed.test.js` `:12-63` | exact |
| `tests/jev-fast-path.test.js` (NEW) | test (pure module unit) | request-response | `tests/autopilot-screenshot-delivery.test.js` `:1-50` | exact |
| `tests/jev-fast-loop.test.js` (NEW) | test (loop harness) | event-driven | `tests/agent-loop-empty-contents.test.js` `:17-41` + `tests/stuck-action-repetition.test.js` `:41-50` | partial (no existing `runAgentIteration` harness) |
| `tests/fixtures/agent-loop-fast-harness.js` (NEW) | test fixture | event-driven | same as above | partial |
| `tests/jev-fast-capture.test.mjs` (NEW) | test (node:test ESM) | batch | `tests/bench-export-history.test.mjs` `:1-40` | exact |
| `tests/jev-fast-measurement.test.js` (NEW) | test (vm dispatcher harness) | transform | `tests/mcp-in-flight-session-lookup.test.js` `buildHarness` `:34-90`, `runAutopilotMeasurementCase` `:893-931` | exact |
| `tests/meta-cognitive-tracker.test.js` | test (extend) | transform | itself `:33-54` (slice-and-eval) | exact |
| `tests/showcase-privacy-page.test.js` | test (extend) | static | itself `:164-215` | exact |
| `tests/jev-extension-boundary.test.js` | test (narrow; created by 67-11) | static | 67-11 Task 2 behaviour list | exact (upstream) |
| `tests/settings-schema.test.js` | test (count pins; created by 66.1-01) | static | 66.1-01 acceptance (`keys().length 35`, 24 writable) | exact (upstream) |
| `tests/lattice-provider-bridge-smoke.test.js` | test (pin bump) | static | itself `:634-636`, `:682-684` ledger | exact |
| `package.json` + `tests/delegation-phase-contract.test.js` | config (test registration) | static | `REFINEMENT_ROOT_TEST_COMMANDS` `:129-161` | exact |
| `extension/content/actions.js` (OPTIONAL, vault-filled WeakSet) | utility | event-driven | existing fill handlers (planner's choice, D-13) | role-match |

---

## Pattern Assignments

### `extension/ai/jev-fast-path.js` (NEW; service, per-iteration decision)

**Analog:** `extension/ai/screenshot-attachments.js` (session-scoped, memory-only map; consumed by agent-loop; one `Fsb*` global). The 67 modules use the same shape (67-06 line 58, 67-07 line 54, 67-08 line 50: named IIFE `initFsbJev*`, `root.FsbJev* = api`, `module.exports` guard, no top-level const/let/class).

**IIFE opener** (`screenshot-attachments.js:1-11`):
```javascript
/**
 * Session-scoped, memory-only screenshot attachments for autopilot.
 * Base64 enters here directly after CDP capture and never reaches the session,
 * transcript, action history, logger, metrics, or persistence layers.
 */
(function initScreenshotAttachments(root) {
  'use strict';

  const MAX_SCREENSHOTS_PER_TURN = 4;
  const MAX_ATTACHMENT_BYTES_PER_TURN = 25 * 1024 * 1024;
  const buckets = new Map();
```

**API object + dual export** (`screenshot-attachments.js:328-343`):
```javascript
  const api = {
    canCapture,
    storeToolResult,
    pending,
    attachForProvider,
    ...
    _buckets: buckets,
    constants: { MAX_SCREENSHOTS_PER_TURN, MAX_ATTACHMENT_BYTES_PER_TURN }
  };
  root.FsbScreenshotAttachments = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
```

**Apply:** `(function initFsbFastPath(root) { 'use strict'; ... root.FsbFastPath = api; if (typeof module !== 'undefined' && module.exports) module.exports = api; })(typeof globalThis !== 'undefined' ? globalThis : self);`. Exports at least `beforeTurn(session, ctx)`, `afterStep(session, fastStep, toolResults)`, pure helpers `classifyFallback(reason)`, `buildStaticCall(...)`, `isRiskExcluded(...)`, and `constants` (named `FAST_*`/`MENU_*`).

**Lazy upstream resolution** (copy the 67-08 rule, line 102): resolve `root.FsbJevState`, `root.FsbJevClient`, `root.FsbJevPolicy` inside each call, else `typeof require === 'function' ? require('./jev-state.js') : null`. Missing module => decline, never throw.

**Hard naming rules (67-11 boundary suite, RESEARCH F12 as corrected by the post-67 sync):** no `JEV_[A-Z_]+` identifier anywhere under `extension/`; no `<scheme>://` literal of any kind (the suite allows exactly one across all jev-*.js files, the endpoint in jev-client.js), `chrome.storage`, `localStorage`, `serverUrl` in any letter case or the word `importScripts` in any `extension/ai/jev-*.js` file (comments included). The module joins the suite as a fourth enumerated module (68-04). The switch reader, capture-store reader/writer and content messenger are injected deps (created in background.js), never read from `chrome.*` here.

**Upstream calls to quote exactly (67 PLANs):** `FsbJevState.buildRequest(input, {byteBudget})` -> `{ok, request, idMap, stats}` | `{ok:false, reason}`; `FsbJevClient.createJevClient({endpoint, fetchImpl, now, getHashKey, setTimeoutImpl, clearTimeoutImpl})` -> `{decide, resetCooldown}`; `decide(request, {signal, timeoutMs})` never rejects, `DEFAULT_TIMEOUT_MS = 2500`; `FsbJevPolicy.accept(result, kind)` with reasons `not_ok`, `not_calibrated`, `kind_absent`, `threshold_null`, `below_threshold`, `catch_all`, `malformed`; `CONTRACT.FALLBACK_REASONS`, `CONTRACT.NON_TRANSIENT_REASONS`.

**Secondary analog for pure-helper style:** `extension/utils/delegation-tab-seed.js` (`var` constants at top of IIFE, small pure functions, `var api = {...}; root.FsbDelegationTabSeed = api;` at `:148-163`).

---

### `extension/ai/agent-loop.js` (MODIFY; two guarded call sites + one meta-key branch)

**Lazy global resolution - DO NOT copy the load-time form.** `agent-loop.js:102-104` resolves the screenshot module once at load:
```javascript
var _al_ScreenshotAttachments = (typeof globalThis !== 'undefined' && globalThis.FsbScreenshotAttachments)
  ? globalThis.FsbScreenshotAttachments
  : (_al_screenshotAttachments || null);
```
`jev-fast-path.js` loads AFTER `ai/agent-loop.js` (it goes after the 67-11 `jev-policy.js` line), so a top-level `var` would be `null` in the SW. Read `globalThis.FsbFastPath` at call time inside `runAgentIteration`. Do not add `require('./jev-fast-path.js')` to the Node block at `:51-62` either: the D-01 harness needs "module not loaded" to be a real state.

**Seam 1 - decision call** goes between the screenshot-orphan expiry and `buildTurnMessages` (`agent-loop.js:1915-1918`):
```javascript
    if (_al_ScreenshotAttachments && typeof _al_ScreenshotAttachments.expireOrphans === 'function') {
      _al_ScreenshotAttachments.expireOrphans(sessionId, session.messages);
    }
    var turnMessages = buildTurnMessages(session);
```
Guard form to copy (RESEARCH Pattern 1): `if (session.fastMode && typeof globalThis !== 'undefined' && globalThis.FsbFastPath && typeof globalThis.FsbFastPath.beforeTurn === 'function') { try { ... } catch (_fastErr) { ... } if (session.status !== 'running') return; }`. The call sits inside the iteration `try` that starts at `:1896`, whose `catch (error)` at `:3084` treats errors as API failures (F13) - hence the local try/catch.

**Skipped block:** `:1918-2247` (turn build, provider call, usage, timing row `:2048-2063`, assistant push, `LLM_TURN`, parse, toolCallLog `:2233-2247`). Variables the rest of the iteration reads must be set explicitly on the fast branch: `toolCalls`, `response` (null), `inputTokens`/`outputTokens`/`iterationCost` (0, read by AFTER_ITERATION `:2952-2957` and `lastTurnResult` `:3055-3071`), `_timingRow` (null; `_al_addIterationToolTime` at `:2859` is already guarded on it). `providerKey` is defined at `:1898`, before the seam. Note the toolCallLog (`:2233-2247`) is "every iteration unconditionally"; the planner decides whether the fast branch also writes it (it is not on the off path either way).

**Tool loop is reused untouched** (`:2252-2298`), including the permission hook:
```javascript
      if (hooks) {
        var permResult = await hooks.emit(_al_LIFECYCLE_EVENTS.BEFORE_TOOL_EXECUTION, {
          toolName: call.name,
          origin: '',
          session: session, sessionId: sessionId,
          iteration: iterNum
        });
```

**actionHistory marker site** (`:2840-2857`) - push shape that fast entries share (decision-source marker is added via `params.jevHandle` presence, so this block can stay byte-identical):
```javascript
      if (session._actionHistory) {
        session._actionHistory.push({
          tool: call.name, params: call.args,
          result: { success: result.success, hadEffect: result.hadEffect, error: result.error || null },
          timestamp: Date.now(), iteration: iterNum,
          durationMs: _timingToolMs
        });
```

**Seam 2 - hand-back replaces the push loop** (`:2882-2891`):
```javascript
    for (var ti = 0; ti < toolResults.length; ti++) {
      var tr = toolResults[ti];
      var resultMsg = _formatToolResult(
        tr.callId,
        JSON.stringify(tr.result),
        providerKey,
        { name: tr.name }
      );
      session.messages.push(resultMsg);
    }
```
Wrap as `if (_fastStep && _fastStep.toolCall) { try { globalThis.FsbFastPath.afterStep(session, _fastStep, toolResults); } catch (_e) {} } else { <existing loop unchanged> }` (F10: the nested `result.result` evidence exists only in `toolResults`).

**Provider-neutral injected message pattern** (copy for the D-10 summary; `:2940` and `:2961`):
```javascript
        session.messages.push({ role: 'user', content: _metaMsg });
```

**Meta-attempt key branch** (F1) - add one branch at the top of `_extractMetaTargetKey` (`:202-220`), inside the slice that `tests/meta-cognitive-tracker.test.js` evals (`var _META_INTERACT_TOOLS = {` .. end of `_trackMetaAttempt`):
```javascript
function _extractMetaTargetKey(call) {
  if (!call || !call.args) return null;
  var a = call.args;
  if (a.selector) return 'sel:' + String(a.selector).slice(0, 80);
  if (a.elementId) return 'id:' + String(a.elementId).slice(0, 40);
```
Insert `if (a.jevHandle) return 'jev:' + ...call.pagePath + ':' + ...expectedRole + ':' + ...expectedName;` right after `var a = call.args;` (fast calls never carry a selector; `pagePath` is a property of the fast call object set by 68-04 `buildStaticCall`, not an arg; revision of 68-06 Task 3). `scroll`/`go_back` are not in `_META_INTERACT_TOOLS` (`:191-197`), so they stay uncounted as today.

**Pins that must not move (verified):** `tests/agent-loop-iterator-guard.test.js:49-69` (exact 100/5000/2000 ms lines; `scheduleMatches.length === 4`); 8 `setTimeout` tokens (comments count); one `stepName: 'LLM_TURN'` and one `stepName: 'TOOL_DISPATCH'`; no `_currentStepName` inside a schedule lambda (`:3075-3082`). Do not touch `checkSafetyBreakers` (`:257-294`) or `detectStuck`.

---

### `extension/background.js` (MODIFY)

**importScripts block** (`:803-818`); 67-11 inserts three plain lines after `:818`, and Phase 68 adds exactly one more after `importScripts('ai/jev-policy.js');`:
```javascript
importScripts('ai/screenshot-attachments.js');
importScripts('ai/tool-executor.js');
importScripts('ai/agent-loop.js');
importScripts('ai/model-discovery.js');
```
Plain form, no comment line containing the word `importScripts`.

**Settings read to extend** (`:13954-13959`) - add the key and its `false` default in both arrays:
```javascript
    const storedSettings = await getStorageWithTimeout(
      ['maxIterations', 'animatedActionHighlights', 'domOptimization', 'maxDOMElements', 'prioritizeViewport'],
      3000,
      { maxIterations: 100, animatedActionHighlights: true, domOptimization: true, maxDOMElements: 2000, prioritizeViewport: true }
    );
```

**"Absent when off" session field** - copy the conditional-spread idiom already in the `sessionData` literal (`:14011`):
```javascript
      allowedTabs: initialAllowedTabs,
      ...(requestAgentId ? { agentId: requestAgentId } : {}),
```
=> `...(storedSettings.<key> === true && source !== 'mcp' ? { fastMode: { enabled: true, stored: true, source: source || null } } : {})`. (Superseded by 68-06: `fsbFastModeSessionField` returns `{enabled: source !== 'mcp', stored: true, source}` whenever the stored value is true, so a `run_task` session carries `enabled:false` for D-22 capture.) `source` is destructured at `:13733` (`:13736` at c7a7d66f); the agent-kind early return at `:13747-13755` (`:13751-13758`) stays first.

**Follow-up reactivation** (`:13806-13859`) reads no settings today (F8). The new one-key `getStorageWithTimeout` read and the `fastMode` recompute go after `reactivateSession(existingSession, task);` (`:13808`) and before `createSessionHooks(sessionId)` (`:13844`):
```javascript
      if (existingSession && existingSession.status === 'idle') {
        // Reactivate the existing session
        reactivateSession(existingSession, task);
        const sessionId = convEntry.sessionId;
```
When the stored value is not `true`, `delete existingSession.fastMode` so the field stays absent (D-01).

**`createSessionHooks` stays untouched** (`:4558-4589`): no new hook registration (D-01).

**Capture observation message case (D-22, delivery option a)** - analog is the content-to-SW `contentScriptReady` case (`:12459-12487`), main-frame filter and `sender.tab?.id` keyed state:
```javascript
    case 'contentScriptReady':
      ...
      const tabId = sender.tab?.id;
      const frameId = sender.frameId;
      if (tabId) {
        // Only track main frame (frameId: 0) readiness for health checks
        if (frameId === 0) {
          contentScriptReadyStatus.set(tabId, { ... });
```
Note the `case` body declares `const tabId` without braces; a new case must wrap its body in `{ }` to avoid a duplicate-declaration error in the shared switch.

**In-SW dispatch** (gotcha 4): `globalThis.fsbDispatchInternalMessage` is assigned at `:13586` (`:13589` at c7a7d66f); any SW-to-SW call from the module goes through it, never `chrome.runtime.sendMessage`.

**Pins:** `tests/lattice-provider-bridge-smoke.test.js:634-636` (`importScriptsCount`, 334 at e1e6439c, ledger comment above it) and `:682-684` (`importScriptsCallSites`, 330). At c7a7d66f they are `:636-637` (337) and `:685-686` (333); set 338 / 334 and extend both ledger comments in the same commit. The 67-11 boundary suite's background.js check (`tests/jev-extension-boundary.test.js:250-259`) is narrowed in the same commit: four adjacent load lines and exact word-bounded tokens (68-06).

---

### `extension/config/config.js` and `extension/config/init-config.js` (MODIFY; config)

**Schema entry** - 66.1-01 SETTINGS CONTRACT (66.1-01-PLAN.md lines 78-116): entry fields `key`, `type`, `cls`, `default`; append after entry 35 (`serverHashKey`) as `{ key: 'fsbJevFastModeEnabled', type: 'boolean', cls: 'writable', default: false }`. Counts move 35 -> 36 keys and 24 -> 25 writable in `tests/settings-schema.test.js` and in the 66.1-01 acceptance `node -e` check (`keys().length!==35`).

**`Config.defaults`** (`config.js:40-59`, inside `this.defaults = {` at `:16`):
```javascript
      animatedActionHighlights: true,
      showSidepanelProgress: false,

      // Credential Manager (Beta)
      enableLogin: false,
```

**`init-config.js` `defaultConfig`** (`:4`, block `:28-50`):
```javascript
  animatedActionHighlights: true,
  showSidepanelProgress: false,
```
Add `fsbJevFastModeEnabled: false,` in both. No comment containing "Jev" or any `jev` substring. Correction (post-67 sync): the 67-11 suite scans text files under `extension/config` and `extension/ui` for the case-insensitive SUBSTRING `jev`, so the identifier itself trips it; 68-01 adds a word-bounded token allowlist for exactly `fsbJevFastModeEnabled` in the same commit. At c7a7d66f `Config.defaults` holds `animatedActionHighlights` at `:45` and `showSidepanelProgress` at `:46`, and the schema entries end at `:433`.

---

### `extension/ui/options.js` (MODIFY; component, CRUD)

**Analog:** the five `fsbChangeReportsEnabled` sites. Copy each, with `false` instead of `true`:

Default (`:42-45`):
```javascript
  // Phase 245 D-07: global toggle for action change_report emission. When
  // false, the dispatcher skips harvest instrumentation entirely (zero
  // overhead) and action tool responses revert to pre-Phase-245 shape.
  fsbChangeReportsEnabled: true,
```
cacheElements (`:327`):
```javascript
  elements.fsbChangeReportsEnabled = document.getElementById('fsbChangeReportsEnabled');
```
Listener (`:1000-1007`):
```javascript
  if (elements.fsbChangeReportsEnabled) {
    elements.fsbChangeReportsEnabled.addEventListener('change', () => {
      markUnsavedChanges();
    });
  }
```
loadSettings (`:2039-2043`):
```javascript
    if (elements.fsbChangeReportsEnabled) {
      elements.fsbChangeReportsEnabled.checked = settings.fsbChangeReportsEnabled ?? true;
    }
```
saveSettings, inside `const settings = {` (`:2329`), next to `:2375`:
```javascript
    fsbChangeReportsEnabled: elements.fsbChangeReportsEnabled?.checked ?? true,
```
**Panel sync (66.1-04):** `FSBSettingsSync.keyForElementId(id)` returns the id itself when it is a schema key, so `id="fsbJevFastModeEnabled"` needs no alias. RESEARCH A1 is resolved by the post-67 sync: the real sync applies and refreshes only keys with a `FIELD_REFRESHERS` entry (~`:9668`), so add `fsbJevFastModeEnabled: (value, deps) => setControlChecked(deps, 'fsbJevFastModeEnabled', value === true),` after the fsbChangeReportsEnabled refresher (~`:9734`) in the same commit. At c7a7d66f the fsbChangeReportsEnabled sites are `:45`, `:327`, `:1004-1008`, `:2047-2049` and `:2384` (`const settings = {` at `:2338`). Comments in this file must not contain "Jev" or any other `jev` substring (F12 as corrected).

**Pins:** `tests/delegation-phase-contract.test.js:2704, :2726, :2904, :3533` read options.js (`:2732, :2754, :2932, :3561` at c7a7d66f); re-grep for occurrence counts before editing.

---

### `extension/ui/control_panel.html` (MODIFY; static card)

**Analog:** Action Change Reports card (`:607-632`). Insert the new card directly after its closing `</div>` (`:632`), before `id="mcpSessionReplaySettings"`:
```html
            <!-- Phase 245 D-07: Action Change Reports global toggle (default ON) -->
            <div class="settings-card">
              <div class="settings-card-header">
                <div class="settings-card-icon">
                  <i class="fas fa-clipboard-list"></i>
                </div>
                <div class="settings-card-title">
                  <h3>Action Change Reports</h3>
                  <p>Inline diff returned with each action</p>
                </div>
              </div>
              <div class="settings-card-content">
                <div class="setting-item">
                  <label class="modern-toggle">
                    <input type="checkbox" id="fsbChangeReportsEnabled" checked>
                    <span class="toggle-track">
                      <span class="toggle-thumb"></span>
                    </span>
                    <div class="toggle-content">
                      <span class="toggle-label">Return action change reports (recommended)</span>
                      <span class="toggle-desc">Returns a compact diff ... Default on.</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
```
New card: no `checked` attribute; title/subtitle/label/desc from CONTEXT `<specifics>` (D-06 required content: recipients FSB server + TypeSafe AI, sent list, never-sent list, secrets scrubbed, experimental/inactive until calibrated, provider still plans/types/reads, server keeps no page content). The copy contains "Jev", so this file gets the marker-bounded card range in the narrowed boundary suite (68-12; the 68-01 token allowlist also gains this file). Scope every sent and never-sent claim to what fast mode sends to FSB's server (post-67 sync, sync issue 1). Occurrence pins: `tests/delegation-phase-contract.test.js:728, :1042, :2080, :3520-3546` (`:756, :1070, :2108, :3548+` at c7a7d66f).

---

### `extension/content/dom-state.js` (MODIFY; second registry)

**Analog:** `RefMap` (`:621-668`):
```javascript
  class RefMap {
    constructor() {
      this.map = new Map();    // ref -> { element: WeakRef, selector, role, name }
      this.counter = 0;
      this.generationId = 0;
      this.generationUrl = '';
    }

    reset() {
      this.map.clear();
      this.counter = 0;
      this.generationId++;
    }

    register(element, selector, role, name) {
      this.counter++;
      const ref = `e${this.counter}`;
      this.map.set(ref, {
        element: new WeakRef(element),
        selector,
        role: role || 'generic',
        name: name || ''
      });
      return ref;
    }

    resolve(ref) {
      const entry = this.map.get(ref);
      if (!entry) return null;
      const el = entry.element.deref();
      if (!el || !el.isConnected) return { element: null, selector: entry.selector, stale: true };
      return { element: el, selector: entry.selector, stale: false };
    }
```
**Exports** (`:787-788`):
```javascript
  FSB.RefMap = RefMap;
  FSB.refMap = refMap;
```
**Apply:** a sibling class after `const refMap = new RefMap();` (`:668`) minting `j1..jN` (F16), with a per-document `generation` = random nonce (`crypto.getRandomValues`) + counter, plus `FSB.jevRefMap = new <Sibling>()` next to `:788`. `FSB.refMap` is never touched (D-14). Keep the `ElementCache` slice markers (`'  class ElementCache {'` .. `'  const elementCache ='`) intact: `tests/selector-fail-closed.test.js:52-54` slices them.

---

### `extension/content/dom-analysis.js` (MODIFY; menu extractor, risk classifier, text excerpt)

**Local alias pattern** (`:20-25`; reuse, do not re-import):
```javascript
  // From accessibility.js
  const computeAccessibleName = FSB.computeAccessibleName;
  const getImplicitRole = FSB.getImplicitRole;
  const getARIARelationships = FSB.getARIARelationships;
  const isElementActionable = FSB.isElementActionable;
```
**Core extraction loop to mirror** (`buildMarkdownSnapshot`, `:2537-2572`), but register into `FSB.jevRefMap` instead of `FSB.refMap`:
```javascript
    const refMap = FSB.refMap;
    const generateSelectors = FSB.generateSelectors;

    // a. Reset refMap for this generation
    refMap.reset();
    refMap.generationUrl = window.location.href;

    // b. Get interactive elements via existing 3-stage filtering pipeline
    const elements = getFilteredElements({
      viewportComplete: true,
      prioritizeViewport: true,
      taskType: 'general',
      guideSelectors
    });
    ...
    for (const el of elements) {
      ...
      const role = getImplicitRole(el) || el.tagName.toLowerCase();
      const accName = computeAccessibleName(el);
      const nameStr = accName?.name || '';
      refMap.register(el, primarySelector, role, nameStr.substring(0, 60));
```
`buildMarkdownSnapshot` and `getMarkdownSnapshot` stay byte-identical (D-13). Never use `formatInlineRef` (`:2172+`, renders values). F18: button-type inputs use `getAttribute('value')`, never `.value`. Revision note (68-02, D-13): the menu must not reuse `computeAccessibleName` for labels the way this analog does: its label-for, label-wrap and aria-labelledby branches return a label's whole `textContent` (`accessibility.js:110-133`), which includes a wrapped textarea's default text, a wrapped select's options and contenteditable text. Use 68-02's `jevMenuLabel`/`jevSafeText` instead. Likewise `inferElementPurpose`'s search rule (`:384-387`) never grants `press_enter`.

**Purpose input** (`inferElementPurpose`, `:263-337`) is first-match (F3); the submit regex at `:301`:
```javascript
      if (/submit|send|post|confirm|done|finish|complete|checkout|pay|purchase|buy|order/.test(combined)) {
        return { role: 'primary-action', intent: 'submit', danger: false, priority: 'high' };
      }
```
Use its output as one input only; the D-19 classifier is a separate union-based pure function in the same new contiguous block (no analog: see No Analog Found).

**Text excerpt partial analog:** `extractPageText` (`:2761+`) recursive visitor with `isVisibleForSnapshot` and viewport filtering (`:2816-2832`); it does NOT skip editable regions, so the new walker adds the F4 exclusions (`input, textarea, select, option, [contenteditable], [role=textbox], [role=combobox], [aria-hidden=true]`, `script/style/noscript/template`, `FSB.isFsbElement`).

**Exports** (`:3641-3647`): add the new `FSB.*` names next to `FSB.getFilteredElements = getFilteredElements;`. No `JEV_*` constant names (67-11 scans content scripts too); name the cap e.g. `MENU_CAP`.

---

### `extension/content/messaging.js` (MODIFY; content router)

**New message case analog** (`getMarkdownSnapshot`, `:895-913`):
```javascript
        case 'getMarkdownSnapshot':
          const mdGuideSelectors = request.options?.guideSelectors || null;
          const mdStart = Date.now();
          const mdResult = FSB.buildMarkdownSnapshot({
            guideSelectors: mdGuideSelectors,
            charBudget: request.options?.charBudget || 12000,
            maxElements: request.options?.maxElements || 80
          });
          const mdTime = Date.now() - mdStart;
          logger.logTiming(FSB.sessionId, 'DOM', 'buildMarkdownSnapshot', mdTime, {
            elements: mdResult.elementCount
          });
          sendResponse({
            success: true,
            markdownSnapshot: mdResult.snapshot,
            refGeneration: mdResult.refGeneration,
            elementCount: mdResult.elementCount
          });
          break;
```
`const` names inside `case` bodies share one switch scope here; prefix new names uniquely (e.g. `jm*`) or wrap the case body in braces.

**Strict jev branch analog** (COMPACT REF, `:1039-1062`), inserted BEFORE it so it is the first branch when `params.jevHandle` is present (F17):
```javascript
          // COMPACT REF RESOLUTION
          if (params && params.ref && !params.selector) {
            const resolvedElement = FSB.resolveRef(params.ref);
            if (resolvedElement) {
              const refInfo = FSB.refMap.getInfo(params.ref);
              params.selector = refInfo?.selector;
              if (!params.selector) {
                const sels = FSB.generateSelectors(resolvedElement);
                const cssSel = sels.find(s => typeof s === 'string' ? !s.startsWith('//') : !s.selector?.startsWith('//'));
                params.selector = typeof cssSel === 'string' ? cssSel : (cssSel?.selector || sels[0]?.selector || sels[0] || '');
              }
              if (params.selector) FSB.elementCache.set(params.selector, resolvedElement);
              ...
            } else {
              ...
              sendResponse({ success: false, error: errorMsg, tool, refStale: true });
              return;
            }
          }
```
Differences the jev branch must have: reject when `selector` or `ref` is also present; never call `FSB.resolveRef` (it falls back to CSS, `selectors.js:568-587`); check generation, WeakRef alive + `isConnected`, role and name unchanged, `FSB.isElementActionable(el).actionable` (`accessibility.js:216-275`, which skips occlusion when the centre is off-viewport, so add an in-viewport centre check, F15), unique selector; every failure `sendResponse({success:false, error, tool, refStale:true, reason}); return;`.

**Danger zone right after** (REF-LESS fallback, `:1064-1085`) - presses Enter/types into `document.activeElement` when no selector: a jev failure that does not `return` falls into this (Pitfall 6).

**Capture observation point** (VIS-01, `:1087-1100`) - every action's target is resolved here; the armed-capture identity check goes here behind one guarded no-op check:
```javascript
          if (FSB.tools[tool]) {
            // VIS-01/VIS-03: Show highlight on target element
            if (params && (params.selector || params.ref)) {
              try {
                const targetElement = params.ref ? FSB.resolveRef(params.ref) : FSB.querySelectorWithShadow(params.selector);
```

---

### `extension/utils/automation-logger.js` (MODIFY; persistence)

**Analog** (`:237-245`):
```javascript
  function cloneIterationTimingForPersistence(rows) {
    if (!Array.isArray(rows)) return undefined;
    try {
      const plainRows = rows.filter(row => !!row && typeof row === 'object' && !Array.isArray(row));
      return JSON.parse(JSON.stringify(plainRows.slice(-100)));
    } catch (_e) {
      return undefined;
    }
  }
```
Use sites - update mode `:1022` and new mode `:1079`:
```javascript
          existing.iterationTiming = cloneIterationTimingForPersistence(sessionData.iterationTiming) || existing.iterationTiming;
          ...
            iterationTiming: cloneIterationTimingForPersistence(sessionData.iterationTiming),
```
Add a sibling `cloneJevMeasurementForPersistence` returning `undefined` when absent; in new mode use a conditional spread (`...(clone ? { jevMeasurement: clone } : {})`) so the key is absent for off sessions.

---

### `extension/ws/mcp-tool-dispatcher.js` (MODIFY; additive projection)

**Delete-then-project analog** (`sanitizeSessionDetail`, `:2255-2264`):
```javascript
  // Phase 66 (MEAS-01; D-05, D-10, D-12): stored measurement fields leave only
  // through the explicit block below. The generic sanitizer drops every
  // /token/i key and flattens deep objects, so it would mangle them.
  delete sanitized.iterationTiming;
  delete sanitized.measurementSummary;
  sanitized.measurement = session.mode === 'mcp-agent'
    ? buildMcpMeasurementFromLegacy(session)
    : buildAutopilotMeasurement(session);
```
Apply: `delete sanitized.jevMeasurement;` always, then `if (<present>) sanitized.jevMeasurement = projectJevMeasurement(session.jevMeasurement);` (absent key for off sessions => byte-identical output, D-23; F20: the generic sanitizer drops `/token/i` keys such as `inputTokens`).

**Conditional marker analog** (`sanitizeActionHistoryEntry`, `:2211-2228`):
```javascript
    ...(params.selector ? { selector: boundedString(params.selector, 250) } : {}),
    ...(params.url ? { domain: getDomainFromUrl(params.url) } : {}),
```
=> `...(params.jevHandle ? { decisionSource: 'jev' } : {})`.

**Null-not-zero field helpers** (`projectAutopilotIterationRow`, `:2583-2603`): reuse `measurementNumberOrNull`, `measurementCountOrNull`, `measurementSourceLabel(value, ['provider', 'estimate', 'unavailable'])`, `measurementModelName`. Never `CostTracker.estimateCost`.

---

### `scripts/bench/shadow/export-capture.mjs` (NEW; CLI exporter, batch)

**Analog:** `scripts/bench/export-history.mjs`.

Header + imports (`:1-31`): shebang, doc block stating inputs/outputs/what never leaves `.local`, `'use strict'`, `node:` imports only:
```javascript
#!/usr/bin/env node
/**
 * Phase 66 / Plan 01 (v1.0.0 Jev Fast Mode) -- sanitized metrics from the MCP
 * ...
 * Run: node scripts/bench/export-history.mjs --input <raw.json> --out <metrics.json>
 */

'use strict';

import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
```
CLI tail (`:562-622`): `USAGE`, `parseArgs` throwing `Error(USAGE)`, `writeMetrics` with `mkdirSync(dirname(resolve(outPath)), { recursive: true })`, and the main guard:
```javascript
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli(process.argv.slice(2));
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error('export-history: ERROR ' + message.replace(/\s+/g, ' ').trim());
    process.exit(1);
  }
}
```
**CDP storage read** (`scripts/bench/lib/cdp.mjs:377-398`, `readExtensionStorageFlag`) - copy the `findExtensionWorker` + `evaluate` + `closeWakeTab` in `finally` shape, returning the ring value instead of `=== true`:
```javascript
  let worker = null;
  try {
    worker = await findExtensionWorker(port, extensionId, options);
    if (!worker.target) return null;
    const name = JSON.stringify(key);
    const result = await evaluate(worker.target, `chrome.storage.local.get([${name}]).then((data) => data[${name}] === true)`, {
      timeoutMs: options.evaluateTimeoutMs || DEFAULT_EVALUATE_TIMEOUT_MS,
    });
    return result === true;
  } catch {
    return null;
  } finally {
    if (worker) await closeWakeTab(port, worker.wakeTargetId);
  }
```
`closeWakeTab` is module-private in cdp.mjs; either export it from cdp.mjs (small edit; check `tests/bench-drivers.test.mjs` hashes first) or inject the reader so the exporter's core is a pure `deriveRecords(ring, lock, ...)` tested offline.

**Path rewrite** (`scripts/bench/lib/outcome.mjs:67-73`): `stripRunPrefix(pathname, token)` needs the literal token; a scrubbed path may hold `[REDACTED_TOKEN]`, so match `/r/<segment>` generically (RESEARCH Pattern 6).

**Validation:** 67-10 `scripts/bench/shadow/lib/records.mjs` `validateRecord(record)` -> `{ok, errors}`, `checkLockReferences(records, lock)` -> `{ok, errors}`, `PROVENANCES = ['hand','recorded-llm','code-outcome']`; ids `^shadow-[a-z0-9-]+-\d{2}$`, file `<id>.json`. Default `--out` is the gitignored `scripts/bench/.local/shadow/recorded-llm/` (`.gitignore:83` ignores `scripts/bench/.local/`), never `scripts/bench/shadow/records/` (F6). Rebuild requests through `createRequire` of `extension/ai/jev-state.js` (cdp.mjs `:29`, `:75` shows the `createRequire` idiom). `core.lock.json` is read-only.

---

### `showcase/angular/src/app/pages/privacy/privacy-page.component.html` (MODIFY; static, 7 locales)

**Unit idiom** (every block has an `i18n="@@id"`, product names `<span [attr.translate]="'no'">...</span>`), e.g. External Services bullet (`:53-58`):
```html
        <li i18n="@@privacy.section.external.li.5">Each provider has their own privacy policy governing how they handle API requests</li>
```
Edit sites: "Last updated" `:6` (`@@privacy.header.updated`), TLDR `:13` (`@@privacy.tldr.body`), External Services list `:53-58` (new `li`), a new `<h2>` section (place before `<!-- Consent and Audit Controls -->` `:244` or after External Services; layout is discretionary), a separate fast-mode Limited Use paragraph with its own id. **Do not edit** `@@PRIVACY_TELEMETRY_LIMITED_USE_TEXT` (`:239`): `tests/showcase-privacy-page.test.js:168-180` pins its six phrases verbatim (F7).

### `.../privacy-history-archive.component.html` (MODIFY; prepend archive entry)

**Analog** (`:1-7`, the September entry; `september` id is taken):
```html
<details class="policy-version">
  <summary i18n="@@privacy.archive.september.summary">
    <span class="policy-version-date">September 2026</span>
    <span><span [attr.translate]="'no'">v0.9.91</span> &mdash; 365-day region retention, Region (state-level) metric (full archived text)</span>
  </summary>
  <div class="policy-version-body" i18n="@@privacy.archive.september.body">
    <p class="archive-note">Archived copy of the privacy policy as it stood from September 28, 2026, before the September 29, 2026 update.</p>
```
New entry archives the September 29, 2026 text under a new id. Then `ng extract-i18n` + the sync/assemble scripts for all six locales (memory: showcase i18n line pins; xlf files are only committed from an intentional extract and sync).

---

### `tests/jev-fast-settings.test.js` (NEW; source-regex)

**Analog:** `tests/change-report-settings-ui.test.js` (whole file). Copy its `ok(cond, msg)` helper and async IIFE, and these assertions with the new key and `false`:
```javascript
  ok(/fsbChangeReportsEnabled\s*:\s*true/.test(opts), 'defaultSettings.fsbChangeReportsEnabled = true');
  ok(/elements\.fsbChangeReportsEnabled\s*=\s*document\.getElementById\(['"]fsbChangeReportsEnabled['"]\)/.test(opts), ...);
  ok(/elements\.fsbChangeReportsEnabled[\s\S]{0,200}addEventListener\(['"]change['"]/.test(opts), ...);
  ok(/elements\.fsbChangeReportsEnabled\.checked\s*=\s*settings\.fsbChangeReportsEnabled/.test(opts), ...);
  ok(/fsbChangeReportsEnabled\s*:\s*elements\.fsbChangeReportsEnabled\?\.checked/.test(opts), ...);
  ...
  ok(/fsbChangeReportsEnabled\s*\?\?\s*true/.test(opts), 'load/save uses ?? true fallback ...');
```
The "unchecked" check inverts `:59-61` (assert the `<input ... id="fsbJevFastModeEnabled">` tag has no `checked`). Add the recipient and "never sent" phrase checks, plus schema/default-copy checks (config.js, init-config.js). FSBSettingsSync DOM-stub cases follow the 66.1-04 test (`noteStorageChanges`/`applyToForm`/`filterForSave`).

### `tests/jev-fast-menu.test.js` (NEW; vm content slices)

**Whole-file vm load analog** (`tests/dom-analysis-viewport-priority.test.js:22-53`):
```javascript
const source = fs.readFileSync(path.join(repoRoot, 'extension', 'content', 'dom-analysis.js'), 'utf8');
const noop = () => {};
const windowStub = {
  __FSB_SKIP_INIT__: false,
  innerWidth: 1280,
  innerHeight: 800,
  scrollX: 0,
  scrollY: 1500,
  FSB: {
    _modules: {},
    logger: { log: noop, info: noop, warn: noop, error: noop, debug: noop, logDOMOperation: noop },
  },
  location: { href: 'https://example.test/', hostname: 'example.test' },
};
const sandbox = { window: windowStub, document: {}, console, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 } };
vm.runInNewContext(source, sandbox, { filename: 'dom-analysis.js' });
const FSB = windowStub.FSB;
```
**Slice-and-eval analog** for the registry and the messaging branch (`tests/selector-fail-closed.test.js:12-30`, `:50-63`):
```javascript
  const start = domState.indexOf('  class ElementCache {');
  const end = domState.indexOf('  const elementCache =', start);
  assert.ok(start >= 0 && end > start);
  const ElementCache = vm.runInNewContext(`${domState.slice(start, end)}\nElementCache`, { WeakRef });
```
Choose stable start/end marker comments for the new contiguous blocks so the slices survive edits.

### `tests/jev-fast-path.test.js` (NEW; module unit)

**Analog:** `tests/autopilot-screenshot-delivery.test.js:1-50` (`node:test` + `require` of the module + per-provider message-shape assertions):
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const attachments = require('../extension/ai/screenshot-attachments.js');
...
test('OpenAI-compatible delivery appends a labeled user image after paired tool results', () => {
```
Iterate `CONTRACT.FALLBACK_REASONS` for `classifyFallback` (RESEARCH Code Examples). If written as a plain script instead, register it as `node tests/...`; if `node:test`, register as `node --test tests/...` (both shapes exist in `REFINEMENT_ROOT_TEST_COMMANDS`).

### `tests/jev-fast-loop.test.js` + `tests/fixtures/agent-loop-fast-harness.js` (NEW; partial analogs)

**Provider stub analog** (`tests/agent-loop-empty-contents.test.js:19-41`):
```javascript
globalThis.chrome = {
  runtime: {
    id: 'fsb-test',
    sendMessage: async function (envelope) {
      if (envelope && envelope.type === 'lattice-provider-execute') {
        lastCapturedRequestBody = envelope.requestBody;
        return { ok: true, response: { rawResponse: { __stub: true } } };
      }
      return undefined;
    }
  }
};
require('../extension/ai/lattice-provider-bridge.js');
const { callProviderWithTools } = require('../extension/ai/agent-loop.js');
```
`agent-loop.js` exports `runAgentLoop`, `runAgentIteration` (`:3182-3183`). **Session factory analog** (`tests/stuck-action-repetition.test.js:41-50`). The harness must capture `setTimeout` to step one iteration at a time without adding tokens to agent-loop.js, stub `chrome.tabs.sendMessage` per action, use a real `HookPipeline` + permission hook (as `createSessionHooks`, `background.js:4558-4589`), and record content messages / provider calls / tool calls / `session.messages` for the D-01 three-way comparison (module absent / key absent / key false).

### `tests/jev-fast-capture.test.mjs` (NEW; node:test ESM)

**Analog:** `tests/bench-export-history.test.mjs:1-40` (`node:test`, `mkdtempSync(tmpdir())` outputs, `spawnSync` of the CLI, import of the pure exports, sentinel strings to prove no leak). Assert `core.lock.json` bytes unchanged (SHA-256 before/after) as 67-10 does.

### `tests/jev-fast-measurement.test.js` (NEW; dispatcher vm harness)

**Analog:** `tests/mcp-in-flight-session-lookup.test.js` `buildHarness` (`:34-90`, dispatcher source in a vm context with stub `automationLogger`, `chrome`, `require` shim) and `runAutopilotMeasurementCase` (`:893-931`), including the absence check:
```javascript
  assert(!hasOwn(session, 'iterationTiming') && !hasOwn(session, 'measurementSummary'),
    'raw iterationTiming and measurementSummary are absent from the generic output');
```
Add the inverse: an off session's `get_session_detail` JSON is byte-identical with and without the Phase 68 projection code.

### `tests/meta-cognitive-tracker.test.js` (EXTEND)

Slice markers it depends on (`:39-46`) - keep the new branch inside them:
```javascript
const startMarker = 'var _META_INTERACT_TOOLS = {';
const endMarker = '\nfunction _trackMetaAttempt(session, call, iterNum) {';
const startIdx = agentLoopSrc.indexOf(startMarker);
const trackerEnd = agentLoopSrc.indexOf('\n}\n', agentLoopSrc.indexOf(endMarker)) + 2;
```
Add cases: `{name:'click', args:{jevHandle:'j3', jevGeneration:'..', expectedRole:'button', expectedName:'Next'}, pagePath:'/wizard/step-2'}` -> `jev:/wizard/step-2:button:Next`; six such calls with one pagePath force-stop; six with different pagePaths do not.

---

## Shared Patterns

### Classic SW module shape
**Source:** `extension/ai/screenshot-attachments.js:6`, `:328-343`; 67-06/07/08 module rules.
**Apply to:** `jev-fast-path.js`.
Named IIFE over `root`, one `root.Fsb* = api`, `module.exports` guard, nothing at load (no timers, no chrome, no fetch). Resolve other globals lazily at call time.

### "Absent when off" (D-01)
**Source:** `background.js:14011` (`...(requestAgentId ? { agentId: requestAgentId } : {})`), `mcp-tool-dispatcher.js:2218-2219` conditional spreads, `automation-logger.js:237-245` (`undefined` when nothing to persist).
**Apply to:** `session.fastMode`, `session.jevMeasurement`, persisted `jevMeasurement`, `decisionSource` marker, every agent-loop guard (synchronous plain-field check first, no `await` when off).

### Provider-neutral injected guidance
**Source:** `agent-loop.js:2940`, `:2961` (`session.messages.push({ role: 'user', content: ... })`).
**Apply to:** the D-10 hand-off summary; never synthetic `tool_calls`/`role:'tool'` pairs (`:2256-2260` explains the 400).

### Local try/catch around diagnostic or optional work
**Source:** `agent-loop.js:2049-2062` and `:2859-2862` (`catch (_timingErr) { /* measurement is diagnostic-only */ }`).
**Apply to:** both new agent-loop call sites (F13), measurement writes, capture writes.

### Null, never 0, with source labels
**Source:** `mcp-tool-dispatcher.js:2583-2603` helpers; `automation-logger.js:234-236` comment.
**Apply to:** `jevMeasurement` fields, exporter output.

### Content message shape
**Source:** `messaging.js:895-913` (`case` + `sendResponse({success:true, ...})`), `agent-loop.js:2396-2399` (`chrome.tabs.sendMessage(session.tabId, {action, options}, { frameId: 0 })`).
**Apply to:** `getJevMenu` request/response and the hand-off snapshot (`getMarkdownSnapshot` with `{ charBudget: 12000, maxElements: 80 }`, same as `get_page_snapshot`).

### Evidence read from the nested result
**Source:** `tool-executor.js:117-136` (`result: response`, `hadEffect = success && tool._readOnly !== true`) and `:138-160` (bfCache => `success:true, result:{bfCacheDetected:true}`); `content/actions.js:2686-2711` (`verification.verified`, `verification.changes`; catch returns `outcome: clickDispatched ? 'unknown' : 'failed', mayHaveExecuted: clickDispatched`), `:224-239` (coordinate fallback `outcome:'unknown', mayHaveExecuted:true`).
**Apply to:** `afterStep` evidence mapping; `hadEffect` is never evidence; `bfCacheDetected` = may have executed.

### Test registration
**Source:** `tests/delegation-phase-contract.test.js:129-161` (`REFINEMENT_ROOT_TEST_COMMANDS`, frozen array; at e1e6439c the last entry was the `node --test tests/bench-*.test.mjs` group, and at c7a7d66f it is `node --test tests/jev-shadow-score.test.mjs tests/jev-shadow-select.test.mjs tests/jev-shadow-records.test.mjs tests/jev-shadow-harness.test.mjs`) and the root `package.json` `test` chain.
**Apply to:** every new suite, same commit, appended once; never touch `PRE_PHASE6x` hashes. Upstream phases 66.1/67/69 append first; append after them.

### Source-pin discipline
**Source:** `tests/lattice-provider-bridge-smoke.test.js:614-636`, `:637-684` (ledger comment + exact count; the count asserts sit at `:636-637` and `:685-686` at c7a7d66f), `tests/agent-loop-iterator-guard.test.js:49-69`, and the 67-11 boundary suite `tests/jev-extension-boundary.test.js` (substring ui/config scan, background.js load-line check, enumerated modules).
**Apply to:** every commit touching `background.js`, `agent-loop.js`, `options.js`, `control_panel.html`, `messaging.js`, `dom-*.js`, `mcp-tool-dispatcher.js`, the privacy page. Grep `tests/` for `.match(`, `.includes(`, `indexOf(`, `readFileSync`, `sha256(` on the file first (D-24). Reference counts at e1e6439c: control_panel.html 17 test files, options.js 11, mcp-tool-dispatcher.js 38, messaging.js 8, automation-logger.js 5, config.js 4, dom-state.js 2, dom-analysis.js 1, init-config.js 1, privacy page 1.

---

## No Analog Found

| File / Part | Role | Data Flow | Reason |
|---|---|---|---|
| `tests/fixtures/agent-loop-fast-harness.js` (end-to-end `runAgentIteration` driver) | test fixture | event-driven | No existing test drives `runAgentIteration`; only `callProviderWithTools` (agent-loop-empty-contents) and source pins (iterator-guard) exist. Build from the partial analogs above and RESEARCH "Wave 0 Gaps". |
| D-19 union risk classifier (inside `dom-analysis.js` new block) | utility | transform | `inferElementPurpose` (`:263-337`) is first-match and misses Save/Publish/`input[type=submit] value=...`/dialog Continue (F3). Use RESEARCH Pattern 4 + Pitfall 3; oracle = 67-10 risk-true fixture targets (A6). |
| Strict jev resolver semantics | controller branch | request-response | The ref branch (`messaging.js:1039-1062`) is the shape analog only; it is lenient (CSS fallback via `resolveRef`). Strictness rules come from D-14 / RESEARCH Pattern 4. |
| Upstream-owned files (`jev-state.js`, `jev-client.js`, `jev-policy.js`, `tests/jev-extension-boundary.test.js`, `tests/settings-schema.test.js`, `scripts/bench/shadow/lib/records.mjs`, `FSBSettingsSync`) | various | various | Not in this worktree; quoted from 66.1-01/04 and 67-06/07/08/10/11 PLANs. Sync re-check (D-24) after those phases execute. |

## Metadata

**Analog search scope:** `extension/ai/`, `extension/ai/hooks/`, `extension/utils/`, `extension/content/`, `extension/ui/`, `extension/config/`, `extension/ws/`, `extension/background.js`, `scripts/bench/` (+`lib/`), `showcase/angular/src/app/pages/privacy/`, `tests/`, and the 66.1 / 67 PLAN files.
**Files scanned:** ~45 (13 read in targeted ranges; graphify graph is from July 2026 and returned nothing useful, so grep + targeted reads were used).
**Pattern extraction date:** 2026-10-15
