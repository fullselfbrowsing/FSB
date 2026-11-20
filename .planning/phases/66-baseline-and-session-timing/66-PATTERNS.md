# Phase 66: Baseline and Session Timing - Pattern Map

**Mapped:** 2026-09-29
**Files analyzed:** 41 (8 extension sources modified, 8 tests modified, 2 config files modified, 15 new bench scripts or data trees, 6 new bench tests, 2 new test fixtures)
**Analogs found:** 36 / 41 (5 have only partial or no analog; see "No Analog Found")
**Line numbers:** verified against the working tree on 2026-09-29 (commit `55789b51`). graphify's graph is stale for these files (for example, it places `handleGetSessionMessageRoute` at L2278; it is at L2904). Trust the numbers below.

Nothing under `mcp/` is modified (D-01). The `mcp/` files cited below are read-only references for the bench driver.

---

## File Classification

### Extension sources (modified; every one has source-pin tripwires, see "Tripwire Register")

| File | Role | Data Flow | Closest Analog | Match |
|------|------|-----------|----------------|-------|
| `extension/ws/mcp-bridge-client.js` | middleware (MCP ingress, action tap, config resource) | request-response | `extension/ws/mcp-tool-dispatcher.js:157-160, 3184-3197` (`MCP_REPLAY_RECORD_CONTEXT`); `extension/background.js:1726-1739` (`fsbReadAuthoritativeProviderConfig`) | exact |
| `extension/ws/mcp-tool-dispatcher.js` | controller (message routes and sanitizers) | request-response | `extension/background.js:12496-12536` (journal-first lookup); `extension/ui/options.js:3444-3476` (journal-to-legacy conversion); its own sanitizers `:2027-2116` | exact |
| `extension/utils/mcp-session-recorder.js` | service (recorder, fire-and-forget queue) | event-driven | its own `_snapshotJournalEntry` `:918-966` / `recordAction` `:2336-2352` | exact |
| `extension/utils/mcp-lattice-journal.js` | store (IndexedDB journal) | file-I/O | its own `recordDispatchNow` metadata `:1210-1229`; text exports `:2019-2045`, `:2121-2153` | exact |
| `extension/ai/agent-loop.js` | service (autopilot iterator) | event-driven | its own `apiCallStartTime` `:1936` and action-push `:2797-2812` | exact |
| `extension/ai/cost-tracker.js` | utility (pure pricing) | transform | `mcp/src/tools/pricing.ts:68-74, 152-158, 246-275` (`McpPricingResult`); `extension/utils/delegation-event-store.js:551-581` (`_projectMetrics`) | role-match |
| `extension/utils/automation-logger.js` | store (session history) | CRUD | its own `saveSession` projections `:904-916`, `:963-973` | exact |
| `extension/ai/action-history.js` (optional) | model (event factory) | transform | itself `:38-53` | exact |

### Tests and config (modified)

| File | Role | Data Flow | Closest Analog | Match |
|------|------|-----------|----------------|-------|
| `tests/mcp-bridge-background-dispatch.test.js` | test (vm harness) | request-response | its own `runRecordingLeaseLifecycleCase` `:399-434` | exact |
| `tests/mcp-in-flight-session-lookup.test.js` | test (vm harness) | request-response | its own `buildHarness` `:34-103` + `runGetSessionDetailFallbackCase` `:105-135` | exact |
| `tests/mcp-session-recorder-journal.test.js` | test (`node:test` + journal stub) | event-driven | its own `makeJournalStub` `:27-72`, `journalEntry` `:131-151` | exact |
| `tests/mcp-lattice-journal.test.js` | test (`node:test`, memory backend) | file-I/O | its own `setup`/`entry`/`allDetail` `:30-96`; text parity `:417-440` | exact |
| `tests/cost-tracker.test.js` | test (plain node) | transform | itself (price pins must change with D-11) | exact |
| `tests/action-history.test.js` (only if the default changes) | test | transform | itself `:67` | exact |
| `tests/automation-logger-mcp-retention.test.js` | test (vm harness) | CRUD | its own `loadLogger` `:60-73` + first case `:108-141` | exact |
| `tests/delegation-phase-contract.test.js` | test (chain contract) | config | its own `REFINEMENT_ROOT_TEST_COMMANDS` `:129-155` | exact |
| `package.json` (`scripts.test`) | config | config | tail of the 298-command chain; ordering rule in `tests/mcp-client-identity-integration.test.js:469-486` | exact |
| `.gitignore` | config | config | existing commented sections (e.g. `extension/dist/` block) | exact |

### Benchmark (new, `scripts/bench/`)

| File | Role | Data Flow | Closest Analog | Match |
|------|------|-----------|----------------|-------|
| `scripts/bench/run-bench.mjs` | CLI runner | batch | `scripts/run-phase65-full-tests.mjs:169-287` (bounded spawn, signals, exit codes) | role-match |
| `scripts/bench/report.mjs` | CLI report | transform | `scripts/report-t1-readiness.mjs:14-24, 1241-1280` (pure exports + `writeReport` + direct-run guard) | exact |
| `scripts/bench/export-history.mjs` | CLI transform | file-I/O | `scripts/report-t1-readiness.mjs` (same shape); input format from `extension/ui/options.js:3478-3487` paging | role-match |
| `scripts/bench/fixture-server.mjs` | server | request-response | `tests/screenshot-uat.test.js:63-85` (`startFixtureServer`, path-traversal guard) | exact |
| `scripts/bench/lib/stats.mjs` | utility (pure) | transform | module style only: `scripts/lib/t1-port-contract.mjs:1-60`; math from RESEARCH Pattern 9 | partial |
| `scripts/bench/lib/outcome.mjs` | utility (pure) | transform | `scripts/lib/t1-port-contract.mjs` (validator returning check lists) | role-match |
| `scripts/bench/lib/tasks.mjs` | utility (load + validate) | file-I/O | `scripts/lib/t1-port-contract.mjs` validators; manifest style `tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json` | role-match |
| `scripts/bench/lib/identity.mjs` | utility (hashing) | transform | `extension/utils/mcp-lattice-journal.js:110-130` (`stableJson`); `scripts/run-phase60-full-tests.mjs:51-62` (`captureGitBuffer`) | role-match |
| `scripts/bench/lib/claude-arm.mjs` | driver | streaming | `mcp/src/agent-providers/claude-profile.ts:93-105, 192-211`; `mcp/src/agent-providers/claude-stream.ts:353-400` | exact |
| `scripts/bench/lib/cursor-arm.mjs` (optional) | driver | streaming | same NDJSON loop as `claude-stream.ts:353-400` | partial |
| `scripts/bench/lib/mcp-client.mjs` | client | request-response | `tests/write-activation-evidence.test.js:7-10` (createRequire from a package.json); RESEARCH "Runner" code example | partial |
| `scripts/bench/lib/cdp.mjs` | client | request-response | `tests/screenshot-uat.test.js:50-61, 87-135, 229-234`; `ws` resolution `tests/mcp-bridge-topology.test.js:10-11` | exact |
| `scripts/bench/tasks/{core,live}/*.json` | config (versioned task data) | config | `tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json` (versioned manifest + provenance) | partial |
| `scripts/bench/fixtures/<app>/**` | static fixture pages | request-response | `tests/fixtures/screenshot-uat.html` (`dataset.fixtureReady` marker at `:119`) | role-match |
| `scripts/bench/results/**` | committed data | batch output | none | none |

### Benchmark tests and fixtures (new)

| File | Role | Data Flow | Closest Analog | Match |
|------|------|-----------|----------------|-------|
| `tests/bench-stats.test.mjs` | test (ESM, `node:test`) | transform | `tests/dashboard-localization-fallback.test.mjs:1-6` (ESM header); `tests/mcp-lattice-journal.test.js:1-7` (`node:test` + `assert/strict`) | role-match |
| `tests/bench-outcome.test.mjs` | test | transform | same | role-match |
| `tests/bench-tasks.test.mjs` | test | file-I/O | same | role-match |
| `tests/bench-identity.test.mjs` | test | transform | same | role-match |
| `tests/bench-claude-stream.test.mjs` | test | streaming | same + source-text parity idea from `scripts/verify-agent-provider-flags.mjs:36-52` | role-match |
| `tests/bench-fixture-server.test.mjs` | test (local http) | request-response | `tests/screenshot-uat.test.js:63-85, 214-216, 379-384` | exact |
| `tests/fixtures/bench/claude-stream-result.jsonl` (new dir; NOT under `agent-streams/`) | test fixture | streaming | `tests/fixtures/agent-streams/claude-code-2.1.177/contract-stream.jsonl` | exact |
| `tests/fixtures/bench/xai-chat-completion.json` (or `.js`) | test fixture | transform | `tests/fixtures/model-discovery-responses.js:1-28` (synthetic, documented provider shapes) | role-match |

---

## Pattern Assignments

### Track A: MCP call timing capture and run identity

#### `extension/ws/mcp-bridge-client.js` (middleware, request-response)

**Analog 1: the hidden-symbol recorder context.** Declaration, `extension/ws/mcp-tool-dispatcher.js:157-160`:
```js
// Non-enumerable, in-process-only recorder context. A Symbol prevents an MCP
// caller from spoofing the resolved tab/origin metadata and keeps it out of
// the bridge response JSON.
const MCP_REPLAY_RECORD_CONTEXT = Symbol('fsb-mcp-replay-record-context');
```
Attachment, `extension/ws/mcp-tool-dispatcher.js:3184-3197`:
```js
Object.defineProperty(payload, MCP_REPLAY_RECORD_CONTEXT, {
  value: { tabId, targetUrl: ..., targetOrigin: origin, slug: ..., /* ... */ routeFamily: 'capabilities' },
  enumerable: false,
  configurable: true
});
```
Differences for Phase 66: use `Symbol.for('fsb.mcp.call-timing')`, not `Symbol(...)`, so the two SW files and the vm harnesses share one symbol. Give the top-level `const` a **different identifier in each file** (for example `MCP_BRIDGE_CALL_TIMING` here and `MCP_DISPATCHER_CALL_TIMING` in the dispatcher). Both files are classic scripts in one global lexical scope (`background.js:81` loads the dispatcher, `:122` loads the bridge client), so a duplicate `const` throws on the second load. All proposed names are unused today (grep checked).

**Where the stamp goes: `_handleMessage`, `:1144-1199`.** Insert right after `:1164-1165`:
```js
const { id, type, payload } = msg;
if (!id || !type) return;
```
It must come before the `recordingIdentity` block (`:1167-1187`). Do **not** put timing on `recordingIdentity`: `tests/mcp-session-recorder-journal.test.js:92` and `tests/mcp-bridge-background-dispatch.test.js:430` deep-equal it. Follow the ingress's existing "never gate routing" guard, `:1182-1187`:
```js
if (recordingIdentity && recorder && typeof recorder.beginCall === 'function') {
  try {
    Promise.resolve(recorder.beginCall(recordingIdentity, payload.recordingLeaseMs))
      .catch(function () { /* recording never gates routing */ });
  } catch (_error) { /* recording never gates routing */ }
}
```

**Payload identity is preserved to both recording paths (verified).**
- `_routeMessage` passes the same `payload` object to `dispatchMcpMessageRoute({ type, payload, ... })` (`:1255`), to `dispatchMcpToolRoute({ ..., payload })` for `mcp:task-status` (`:1266-1281`), and to `_handleExecuteAction(payload)` (`:1283-1284`).
- `_handleExecuteAction` calls `this._recordMcpSessionAction(payload, ...)` at `:1802`, `:1831` and `:1933`, with no spread in between.

**Where timing is read: `_recordMcpSessionAction`, `:1689-1743`.** Add `timing: <builder>(payload)` to the object literal at `:1712-1726`:
```js
let sessionRecordEntry = {
  client: (typeof globalThis.resolveMcpClientLabel === 'function')
    ? globalThis.resolveMcpClientLabel(payload)
    : null,
  tool: payload && payload.tool,
  // ...
  replayContext
};
```
Stamp `completedAt` here, synchronously, before the fire-and-forget enqueue. Omit the key (or pass `null`) when no stamp exists. Never write `0`.

**Sheets calls (new finding).** With the redactor loaded (production), `FsbSpreadsheetRecordRedaction.recordSafely` returns non-Sheets entries unchanged. It **rebuilds** Google Sheets entries through a `baseFields` allowlist (`extension/utils/spreadsheet-record-redaction.js:246-255`: `client, tool, success, tabId, dispatcher_route`), which drops `timing`. Choose one:
- extend `baseFields` with a validated optional `timing`, and add a case to `tests/spreadsheet-record-redaction.test.js`, which deep-equals only params and response;
- or accept "timing not recorded" for Sheets calls, and state that in the plan.

**`_handleGetConfig` fix, `:2702-2708`.** Current code:
```js
async _handleGetConfig() {
  const config = await chrome.storage.local.get([
    'selectedModel', 'selectedProvider', 'defaultModel',
    'maxIterations', 'domOptimization', 'maxDOMElements',
  ]);
  return { config };
}
```
Analog for defaults, `extension/background.js:1726-1739`. Copy the same defaults so `fsb://config` and autopilot start agree:
```js
async function fsbReadAuthoritativeProviderConfig() {
  const stored = await chrome.storage.local.get([
    'providerKind', 'agentProviderId', 'modelProvider', 'modelName', 'lmstudioBaseUrl'
  ]);
  return {
    providerKind: typeof stored.providerKind === 'string' ? stored.providerKind : 'api',
    agentProviderId: typeof stored.agentProviderId === 'string' ? stored.agentProviderId : '',
    modelProvider: typeof stored.modelProvider === 'string' ? stored.modelProvider : 'xai',
    modelName: typeof stored.modelName === 'string' ? stored.modelName.trim() : '',
    // ...
  };
}
```
The replacement shape is in RESEARCH Pattern 6 (`{ config, extension: { id, version, measurement: { callTiming: 1, sessionDetailJournal: 1 } } }`).
- The vm harness chrome mock has `runtime.id` but **no `getManifest`** (`tests/mcp-bridge-background-dispatch.test.js:208-223`), so guard it with `typeof`.
- `mcp/src/diagnostics.ts:1067` calls `normalizeConfig(payload?.config ?? payload)`, so a top-level `extension` sibling is harmless.
- `fsb://config` passes the payload through unchanged (`mcp/src/resources/index.ts:148-161`).

#### `extension/utils/mcp-session-recorder.js` (service, event-driven)

The whole file is an IIFE, so helper names do not leak into the SW scope.

**`recordAction`, `:2336-2352`.** It builds a new entry, so add a line forwarding `timing: input.timing`:
```js
function recordAction(input) {
  try {
    if (!input || typeof input !== 'object') return;
    recordDispatch({
      client: input.client,
      tool: input.tool,
      requestPayload: (input.payload && typeof input.payload === 'object')
        ? input.payload
        : { tool: input.tool, params: input.params || {}, agentId: input.agentId },
      response: input.response,
      success: input.success !== false,
      dispatcher_route: 'bridge-action',
      tabId: input.tabId,
      replayContext: input.replayContext
    });
  } catch (_e) { /* fire-and-forget */ }
}
```

**`_snapshotJournalEntry`, `:918-966`.** It returns an explicit field list ending at `:963-965`:
```js
      targetRedacted: entry.targetRedacted === true ||
        (rawTargetUrl !== null && safeContext.targetUrl !== rawTargetUrl)
    };
```
Add `timing: _sanitizeCallTiming(entry.timing)`, keeping only finite non-negative numbers. For the finite-number idiom, copy `extension/utils/delegation-event-store.js:274-282`:
```js
function _nonnegativeIntegerOrNull(value) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 0
    && value <= MAX_SAFE_INTEGER
    ? value
    : null;
}
```

**`recordTaskOutcome`, `:1751-1798`.** The journal entry is built at `:1777-1786`; add `timing: input.timing` to that literal:
```js
var journalEntry = _snapshotJournalEntry({
  client: payload.visualSession && payload.visualSession.client,
  tool: input.tool,
  requestPayload: payload,
  response: input.response,
  success: !(input.response && input.response.success === false),
  dispatcher_route: 'task-status',
  tabId: snapshot.tabId,
  replayContext: { routeFamily: 'lifecycle' }
});
```

**Legacy path.**
- `_snapshotEntry` (`:854-880`, same explicit-field style) gains `timing`.
- `session.actionHistory.push({...})` (`:2146-2152`) gains `durationMs` and `timing`, omitted when absent:
```js
session.actionHistory.push({
  tool: storedTool,
  params: replayParams,
  result: replayResult,
  timestamp: now,
  logicalTab: logicalTab
});
```
Keep `:2157-2170` byte-intact, because `tests/lattice-replay-background-contract.test.js:391-394` pins `requestPayload: _sanitizeRequestPayload(payload, entry.response)` (`:2162`) and `redactedInputs: entry.redactedInputs === true` (`:2168`).

#### `extension/utils/mcp-lattice-journal.js` (store, file-I/O)

This file is also an IIFE: `(function (globalScope) {` at `:9` through `:2248`.

**Metadata, `:1210-1229`.** Add `if (entry.timing) metadata.timing = <validated copy>;` after the literal and before `makeEvent` at `:1233`:
```js
var metadata = {
  schemaVersion: SCHEMA_VERSION,
  agentId: run.agentId,
  // ...
  targetRedacted: entry.targetRedacted === true,
  lateAfterClose: run.status !== 'running'
};
```
The budget-exhausted compact marker reuses the same `metadata` object (`:1243-1246`), so timing survives there too. Replay is unaffected: `replayEntryFromEvent` (`:1752-1766`) copies an explicit field list. `INTERNAL_PAYLOAD_KEYS` (`:44-48`) does not change.

**Text exports: one shared formatter for both.** Today the two producers emit identical call lines:
- `exportHumanReadable`, `:2039-2043`:
```js
rows.forEach(function (event, index) {
  var metadata = event.metadata || {};
  lines.push((metadata.success === false ? '[FAILED] ' : '[OK] ') +
    'Call ' + String(index + 1) + ': ' + (metadata.tool || 'unknown'));
});
```
- `streamSessionExport` text branch, `:2137-2151`. It pages 500 at a time; `callIndex` survives across pages, so add `prevCompletedAt` beside it:
```js
var textAfter = -1;
var callIndex = 0;
while (true) {
  var textRows = await backend().getEvents(sessionId, textAfter, DETAIL_MAX_LIMIT);
  // ...
    await emitChunked('\n' + (textMetadata.success === false ? '[FAILED] ' : '[OK] ') +
      'Call ' + String(callIndex) + ': ' + (textMetadata.tool || 'unknown'));
```
Append the suffix after the tool name; the formatter is in RESEARCH "Journal text export line". The pins are regex `assert.match(report, /Call 505: read_step_504/)` (`tests/mcp-lattice-journal.test.js:1399`, unanchored, so a suffix is fine) and **byte equality** of the two producers (`:432-439`).

**Journal read API used by Track B** (unchanged): `hasSession` `:2008-2011`, `getSessionDetail` `:1631-1648` (limit clamped to `DETAIL_MAX_LIMIT = 500`, `:25`; returns `{session: buildIndexEntry(run), events, nextSequence, hasMore}`), `exportHumanReadable` `:2019`, api object `:2199-2244`.

---

### Track B: `get_session_detail` journal branch and measurement projection

#### `extension/ws/mcp-tool-dispatcher.js` (controller, request-response)

**Analog 1: the control-panel journal-first lookup**, `extension/background.js:12500-12505` (text) and `:12513-12531` (detail):
```js
const isJournalSession = globalThis.FsbMcpLatticeJournal &&
  typeof globalThis.FsbMcpLatticeJournal.hasSession === 'function' &&
  await globalThis.FsbMcpLatticeJournal.hasSession(request.sessionId);
const text = isJournalSession && typeof globalThis.FsbMcpLatticeJournal.exportHumanReadable === 'function'
  ? await globalThis.FsbMcpLatticeJournal.exportHumanReadable(request.sessionId)
  : await automationLogger.exportHumanReadable(request.sessionId);
```
```js
const journal = globalThis.FsbMcpLatticeJournal;
const detail = journal && typeof journal.getSessionDetail === 'function'
  ? await journal.getSessionDetail({ sessionId: request.sessionId, afterSequence: request.afterSequence, limit: request.limit })
  : null;
if (detail) { sendResponse({ success: true, ...detail }); return; }
const session = await automationLogger.loadSession(request.sessionId);
```
**Do not copy the `...detail` spread.** It returns raw events (D-08).

**Analog 2: journal-to-legacy conversion**, `extension/ui/options.js:3466-3472`:
```js
session.actionHistory = events.filter(event => event.kind === 'tool.call').map((event) => ({
  tool: event.metadata?.tool || '',
  params: journalDescriptorPreview(event.metadata?.request),
  result: journalDescriptorPreview(event.metadata?.result),
  timestamp: Date.parse(event.timestamp),
  logicalTab: event.metadata?.logicalTab || 'primary'
}));
```
Mirror its field mapping, but **do not reuse `journalDescriptorPreview`** (`:3433-3442`), because it returns `descriptor.inline` values verbatim. Feed each pseudo-action through the existing `sanitizeActionHistoryEntry` instead. The paging loop to mirror is `loadSessionDetail` (`options.js:3478-3487`), using `afterSequence`/`limit: 500`.

**Target route: `handleGetSessionMessageRoute`, `:2904-2957`.** Insert the journal branch between `:2907` and `:2908`, so it runs after the sessionId check and before the `automationLogger` availability check:
```js
async function handleGetSessionMessageRoute({ payload }) {
  if (!payload.sessionId) {
    return createMcpInvalidParamsError('get_session_detail', 'get_session_detail requires sessionId', { routeFamily: 'observability' });
  }
  if (typeof automationLogger === 'undefined' || typeof automationLogger?.loadSession !== 'function') {
    return createMcpRouteError('get_session_detail', 'observability', MCP_ROUTE_RECOVERY_HINT, { error: 'Automation logger session loader unavailable' });
  }
  const session = await automationLogger.loadSession(payload.sessionId);
  if (session) {
    if (payload.format === 'text') { /* ... automationLogger.exportHumanReadable ... */ }
    return { success: true, session: sanitizeSessionDetail(session) };
  }
  // in-flight fallback (:2928-2947), then session_not_found (:2949-2956) -- unchanged
```
Keep the envelopes `{ success: true, session }` and `{ success: true, format: 'text', text }` byte-compatible. The error shape for a missing exporter is `:2916-2918`.

**Sanitizers to reuse, `:2027-2116`.** Mind the `/token/i` key filter:
```js
function isSensitiveKey(key) {
  return /password|passcode|token|secret|apikey|api_key|authorization|credential|cardnumber|card_number|cvv|cvc|vault|payment|privatekey|private_key/i.test(String(key || ''));
}
```
`sanitizeValue` flattens objects at depth >= `maxDepth` to `'[object]'` (`:2041`). `sanitizeActionHistoryEntry` (`:2072-2086`) is the allowlist to extend with a finite-only `durationMs` (and `timing`):
```js
function sanitizeActionHistoryEntry(action) {
  const params = (action?.params && typeof action.params === 'object') ? action.params : {};
  const result = (action?.result && typeof action.result === 'object') ? action.result : {};
  return {
    tool: action?.tool || null,
    timestamp: action?.timestamp || null,
    iteration: action?.iteration || null,
    ...(params.selector ? { selector: boundedString(params.selector, 250) } : {}),
    ...(params.url ? { domain: getDomainFromUrl(params.url) } : {}),
    result: {
      success: Boolean(result.success),
      ...(result.error ? { error: boundedString(result.error, 500) } : {})
    }
  };
}
```
The conditional-spread idiom (`...(cond ? {k} : {})`) already in this function is the one to copy for "omit when unmeasured". `sanitizeSessionDetail` (`:2088-2116`) is the pattern for post-sanitizer additions: it `delete`s a raw field and then attaches an explicit projection (`replaySummary`, `:2097-2105`). Build the `measurement` block the same way, after the generic sanitizer.

**Timing on the dispatcher's two recording paths.**
- **Message route:** add `timing` to `var sessionRecordEntry = {` (`:829-851`), read from `payload[MCP_DISPATCHER_CALL_TIMING]`.
- **Task outcomes:** in `dispatchMcpToolRoute` (`:639-731`), read the symbol from the **original** payload before `canonicalizeVisualSessionTaskParams` (`:649-652`). `canonicalizeVisualSessionOwnershipToken` spreads the payload (`:576-579`, `return { ...payload, ownershipToken: ... }`), which drops Symbols. Pass the timing explicitly at `:722`:
```js
globalThis.fsbMcpSessionRecorder.recordTaskOutcome({ tool, params, payload, response });
```

**Exports.** If the planner wants the new pure projection helpers unit-tested, add them to `_mcp_dispatcher_exports` (`:3926-3960`), whose comment style is "(test-only)". Nothing pins that key list.

---

### Track C: Autopilot timing, provider cost labels, price rows

#### `extension/ai/agent-loop.js` (service, event-driven): **highest tripwire load**

**Model-time stamp.** Stamp model time from `apiCallStartTime` at `:1936`, next to the existing completion log at `:1986-1992`, which already computes the same delta:
```js
if (typeof automationLogger !== 'undefined') {
  automationLogger.debug('Agent iteration API call completed', {
    sessionId: sessionId, iteration: iterNum,
    durationMs: Date.now() - apiCallStartTime,
    hasToolCalls: _isToolCallResponse(response, providerKey)
  });
}
```
The single text-only retry is at `:1957-1979`; mark `modelRetried: true` when that path runs.

**Usage and cost block, `:2005-2029`.** Keep the legacy numeric flow. Add labelled fields beside it; do not replace these lines:
```js
var usage = _extractUsage(response, providerKey);
var inputTokens = usage.input || 0;
var outputTokens = usage.output || 0;
var iterationCost = 0;
if (session._costTracker) {
  iterationCost = session._costTracker.record(model, inputTokens, outputTokens);
```
The existing precedent for reading the raw xAI body directly off `response` is `:2775-2779`:
```js
var _phase10ReasoningTokens = undefined;
if (_phase10ProviderKey === 'xai' && typeof response !== 'undefined' &&
    response && response.usage && response.usage.completion_tokens_details) {
  _phase10ReasoningTokens = response.usage.completion_tokens_details.reasoning_tokens;
}
```

**Tool-time bracket.** Start after the permission hook returns non-denied, at the step marker `:2295-2298`:
```js
// Phase 9 FINT-14 -- mark in-flight tool dispatch boundary. ...
session._currentStepName = 'BEFORE_TOOL_EXECUTION';
```
End at the success push, `:2797-2812`, and add `durationMs` inside both object literals:
```js
if (session._actionHistory) {
  session._actionHistory.push({
    tool: call.name, params: call.args,
    result: { success: result.success, hadEffect: result.hadEffect, error: result.error || null },
    timestamp: Date.now(), iteration: iterNum
  });
  session.actionHistory = session._actionHistory.events; // backward compat sync
} else {
  if (!session.actionHistory) session.actionHistory = [];
  session.actionHistory.push(_al_createActionEvent({ /* same fields */ }));
}
```
The malformed-argument branch (`:2228-2252`) and the permission-denied branch (`:2258-2293`) never ran a tool. Leave `durationMs` absent there.

**Getting new cost-tracker helpers into the loop.** Use the resolver idiom at `:155-157`, which works in both the SW (globals) and Node (`require`, `:65-83`):
```js
var _al_estimateCost = (typeof estimateCost !== 'undefined') ? estimateCost : (_al_costTracker?.estimateCost || function() { return 0; });
var _al_CostTracker = (typeof CostTracker !== 'undefined') ? CostTracker : (_al_costTracker?.CostTracker || null);
```
Add the same one-liner for each new helper, with a null-returning fallback, never a zero-returning one. `_al_costTracker` is already `require('./cost-tracker.js')` at `:69`.

**Persistence hand-off.** `saveToLogger` (`:1457-1465`) calls `automationLogger.saveSession(sid, sess)` with the live session, so fields such as `session.iterationTiming` and `session.measurementSummary` reach the logger without an edit here.

**Exports.** `module.exports` (`:3131-3133`) can export a pure row builder additively; nothing pins its key list.

#### `extension/ai/cost-tracker.js` (utility, transform)

**Price table, `:23-55`.** Substring matching iterates insertion order (`estimateCost`, `:74-84`). New `grok-4.3`/`grok-4.3-latest` rows must come **before** the `'grok-4'` key (`:36`); today `'grok-4.3'` matches `grok-4` at $3/$15. The unknown-model fallback, `:85-88`, is D-10's second "invented value" site:
```js
// Default to grok-4-1-fast pricing if model not found
if (!pricing) {
  pricing = MODEL_PRICING['grok-4-1-fast-reasoning'] || { input: 0.20, output: 0.50 };
}
```
The row values already exist in the MCP pricing data (read-only reference): `mcp/data/mcp-pricing-data.json` has `grok-4.3` at `1.25 / 2.5`, confidence `HIGH`, `source_url` `https://docs.x.ai/developers/models`.

**Labelled nullable result: copy the envelope from `mcp/src/tools/pricing.ts`.** Type, `:68-74`:
```ts
export type McpPricingResult = {
  cost: number | null;
  source: 'lookup' | 'fallback' | 'unknown';
  model_used: string | null;
  pricing_confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'fallback' | null;
  pricing_source_date: '2026-05-14';
};
```
Unknown envelope, `:152-158`, and the finite, non-negative token gate, `:254-267`:
```ts
const tin = typeof tokensIn === 'number' && Number.isFinite(tokensIn) && tokensIn >= 0 ? tokensIn : null;
const tout = typeof tokensOut === 'number' && Number.isFinite(tokensOut) && tokensOut >= 0 ? tokensOut : null;
let cost: number | null = null;
if (tin !== null && tout !== null) { /* compute */ }
```
The second analog is "dollar cost is deliberately null", `extension/utils/delegation-event-store.js:567-570`:
```js
var billingKind = context.acceptedIdentity.billingKind;
// Neither shipped agent provider exposes authoritative dollar billing.
// Payload/context dollar claims are deliberately non-representable.
var usd = null;
```
Write the new functions in this file's ES5 style (`var`, `function`). Extend the exports line at `:171-173`:
```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MODEL_PRICING: MODEL_PRICING, estimateCost: estimateCost, CostTracker: CostTracker };
}
```
The provider-usage shapes to mirror are in `extension/ai/tool-use-adapter.js:312-337`: `extractUsage` handles anthropic `usage.input_tokens`, gemini `usageMetadata.promptTokenCount`, and OpenAI-compatible `usage.prompt_tokens`.

#### `extension/utils/automation-logger.js` (store, CRUD)

Two parallel explicit projections must both change.
- **Existing-session branch.** Totals at `:884-886` (`existing.totalCost = sessionData.totalCost || existing.totalCost || 0;`, the "invented 0" in D-10). Action rows at `:904-916`:
```js
if (sessionData.actionHistory) {
  existing.actionHistory = (sessionData.actionHistory || [])
    .filter(a => a.result?.success)
    .slice(-100)
    .map(a => ({
      tool: a.tool,
      params: a.params,
      result: a.result,
      timestamp: a.timestamp,
      logicalTab: a.logicalTab || 'primary'
    }));
}
```
- **New-session branch.** Totals at `:951-953`; action rows at `:963-973`, with the same `.map`.
- **Index entry.** `:982-1012` (`totalCost: savedSession.totalCost || 0` at `:993`). Leave the index lean; the index feeds `list_sessions`.

Add `durationMs: Number.isFinite(a.durationMs) ? a.durationMs : null` to **both** `.map`s. Copy `iterationTiming` (capped) and `measurementSummary` in **both** branches, following the `existing.replay = cloneReplayRecordForPersistence(...) || existing.replay || null` precedent at `:917-919`.

`exportHumanReadable` (`:689-714`) is the autopilot text export, if per-call ms is also shown for autopilot sessions. Keep the method order: `tests/lattice-replay-background-contract.test.js:111-114` slices from `async getReplayData(` to `async exportHumanReadable(`.

#### `extension/ai/action-history.js` (model, transform; optional)

`createActionEvent` (`:38-53`) has `durationMs: f.durationMs || 0` at `:51`; it runs only on the fallback path. `ActionHistory.prototype.push` (`:91-100`) stores objects that already have `tool` and `timestamp` as-is, so the agent-loop literal is what persists. If `:51` becomes null-when-absent, update `tests/action-history.test.js:67` (`assertEqual(evt.durationMs, 0, 'default durationMs is 0')`) in the same commit. Leave `tests/turn-result.test.js:50` alone: `lastTurnResult.durationMs` is session-elapsed time (`agent-loop.js:2111`).

---

### Track D: Bench core (helpers, tasks, fixtures, server, tests, chain registration)

#### `scripts/bench/fixture-server.mjs` (server, request-response)

Analog: `tests/screenshot-uat.test.js:63-85`. Copy the traversal guard and the `listen(0, '127.0.0.1')` idiom:
```js
function startFixtureServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const absolute = path.resolve(WORKSPACE, `.${pathname}`);
      if (absolute !== WORKSPACE && !absolute.startsWith(`${WORKSPACE}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await fsp.readFile(absolute);
      const type = absolute.endsWith('.html') ? 'text/html; charset=utf-8'
        : (absolute.endsWith('.ttf') ? 'font/ttf' : 'application/octet-stream');
      response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      response.end(bytes);
    } catch (_error) {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
```
Differences:
- Root is `scripts/bench/fixtures`, not the workspace. Strip the `/r/<token>/` prefix before resolving.
- Add JSON/JS content types, POST body capture into a per-token request log, and a secret-gated `GET /__bench/evidence`.
- Export a `startFixtureServer(options)` function so `tests/bench-fixture-server.test.mjs` can import it without the CLI running (direct-run guard below).

#### `scripts/bench/fixtures/<app>/**` (static pages)

Analog: `tests/fixtures/screenshot-uat.html`, which sets a readiness marker at `:119` (`document.documentElement.dataset.fixtureReady = 'true';`). Use `data-bench-marker` attributes the same way. **Differences:** that fixture uses an absolute asset URL (`/extension/assets/...`, `:10`). Bench pages must use **relative** links only, so the `/r/<token>/` prefix is preserved (RESEARCH Pattern 7). Do not add in-page probes that post on DOM mutation (Pitfall 9).

#### `scripts/bench/lib/*.mjs`: pure ESM library style

Analog: `scripts/lib/t1-port-contract.mjs:1-60`, with a doc header, `export const` frozen enums and small private helpers:
```js
/**
 * Phase 45 / Plan 01 -- reusable T1 port contract helpers.
 * This module is tooling-only. ...
 */
'use strict';

export const PORT_TYPES = Object.freeze({ SAME_ORIGIN_READ: 'same-origin-read', /* ... */ });

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
```
- `lib/stats.mjs`: no statistics code exists in the repo. Use the RESEARCH Pattern 9 code verbatim; it is pure and seeded with `mulberry32`.
- `lib/outcome.mjs`: return `{ pass, checks: [{kind, pass, detail}] }`. The t1-port-contract validators return failure lists the same way. The evaluator must never read `claimed`.
- `lib/tasks.mjs`: schema-check task JSON the way `claude-profile.ts:53-79` validates `fsb.json`, with an exact sorted key set and explicit value checks:
```ts
const keys = Object.keys(policy).sort();
if (JSON.stringify(keys) !== JSON.stringify(STATIC_AGENT_KEYS)) {
  throw new Error('Invalid shipped FSB agent policy keys');
}
```
- `lib/identity.mjs`: the canonical-JSON analog is `extension/utils/mcp-lattice-journal.js:110-130` (`stableJson`: sorted keys, drops `undefined`/functions, throws on cycles). Hash with `createHash('sha256')`, as in `scripts/build-native-host-windows.mjs:102`. For the git SHA and dirty state, copy `captureGitBuffer` from `scripts/run-phase60-full-tests.mjs:51-62`:
```js
function captureGitBuffer(args, label) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    maxBuffer: maximumGitOutput,
    shell: false,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`${label} failed`);
  }
  return Buffer.from(result.stdout);
}
```

#### `scripts/bench/tasks/{core,live}/*.json` (versioned data)

Partial analog: `tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json`, a versioned JSON with `schemaVersion`, provenance and sanitization flags. The task schema itself is in RESEARCH Pattern 7 (`id`, `version`, `set`, `category`, `startPath`, `instruction`, `timeBudgetMs`, `success.all[]`, `fixtureFiles[]`).

#### `tests/bench-*.test.mjs` (tests, ESM, Node 20-safe)

The ESM header comes from `tests/dashboard-localization-fallback.test.mjs:1-6`:
```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
```
The `node:test` structure comes from `tests/mcp-lattice-journal.test.js:3-7` (`test('...', async () => { ... })` with `assert.equal`/`assert.deepEqual`/`assert.match`).
- **Difference:** the only existing `.mjs` test runs under `node --import tsx` (pretest). Bench tests are plain ESM with no TS imports: run them as `node tests/bench-x.test.mjs` or `node --test tests/bench-*.test.mjs ...`, and import `../scripts/bench/lib/*.mjs` by relative path.
- **CI is Node 20** (`.github/workflows/ci.yml:22`). No global `WebSocket`, `Object.groupBy`, `Promise.withResolvers`, `crypto.hash`, `fs.globSync` or `process.getBuiltinModule`.
- **`bench-fixture-server.test.mjs`:** copy the lifecycle from `tests/screenshot-uat.test.js:214-216` (start server, read `server.address().port`) and `:379-384` (`finally { await new Promise((resolve) => server.close(resolve)); }`). Bind port 0, never 7225.
- **`bench-claude-stream.test.mjs` argv parity:** read `mcp/src/agent-providers/claude-profile.ts` as text and assert that each task-mode flag (`:192-211`) appears in the bench argv. `scripts/verify-agent-provider-flags.mjs:36-52` is the precedent for line-scanning TS source from a script.

#### `tests/fixtures/bench/claude-stream-result.jsonl` (new fixture)

The analog is `tests/fixtures/agent-streams/claude-code-2.1.177/contract-stream.jsonl`. Its `result` line (line 6) has no duration or cost fields:
```json
{"type":"result","subtype":"success","session_id":"synthetic-session-01","is_error":false,"num_turns":2,"usage":{"input_tokens":10,"output_tokens":20}}
```
The new fixture adds `duration_ms`, `duration_api_ms`, `total_cost_usd`, `modelUsage`, an init with `tools` containing `ToolSearch`, and `apiKeySource`.

**Put it outside `tests/fixtures/agent-streams/`.** `tests/mcp-agent-drift-smoke.test.js:193-200, 358-366` enumerates every `agent-streams/*/manifest.json` and deep-equals the list against the adapter roster.

#### `tests/fixtures/bench/xai-chat-completion.json` (new fixture)

The analog is `tests/fixtures/model-discovery-responses.js:1-28`: synthetic data with a doc header naming the documented shape and stating that no network calls were made. The existing minimal xAI body shape is `tests/lattice-provider-bridge-smoke.test.js:334` (`usage: { prompt_tokens: 1, completion_tokens: 1 }`). Add `usage.cost_in_usd_ticks`, `usage.completion_tokens_details.reasoning_tokens`, `usage.prompt_tokens_details.cached_tokens` and `model`.

#### `package.json` + `tests/delegation-phase-contract.test.js` (chain registration, one plan only)

Registration list, `tests/delegation-phase-contract.test.js:129-155`:
```js
const REFINEMENT_ROOT_TEST_COMMANDS = Object.freeze([
  'node tests/mcp-agent-connection-test.test.js',
  // ...
  'node --test tests/google-sheets-session.test.js tests/google-sheets-content-actions.test.js tests/gsheets-handler.test.js tests/google-sheets-wiring.test.js tests/spreadsheet-record-redaction.test.js',
  'node tests/sidepanel-automation-runner.test.js',
]);
```
The enforcing checks are at `:2373-2391` and `:3126-3134`:
```js
const rootCommands = packageJson.scripts.test.split(' && ');
for (const command of REFINEMENT_ROOT_TEST_COMMANDS) {
  check(rootCommands.filter((candidate) => candidate === command).length === 1, ...);
}
// every command NOT in a known list must hash to PRE_PHASE61_ROOT_TEST_HASH / PRE_PHASE62_ROOT_TEST_HASH
```
Rules:
1. Append each new command string to the **tail** of `scripts.test`, joined with `' && '`. Today the last entry is `node --import tsx tests/no-orphan-descriptor.test.js`, and no test pins it.
2. Add the identical string to `REFINEMENT_ROOT_TEST_COMMANDS`.
3. Never edit the `PRE_PHASE6x_ROOT_TEST_HASH` constants (`:12`, `:16`).
4. Do not reorder existing entries (`tests/mcp-client-identity-integration.test.js:469-486`).

A multi-file `node --test a b c` entry is one command string, as the Sheets precedent shows.

#### `.gitignore`

Add a commented block such as `# Phase 66 -- raw benchmark captures (may contain page content; D-21)` followed by `scripts/bench/.local/`. The global `build/`, `dist/` and `*.log` ignores already exist, so do not name committed result directories `build`/`dist`, and do not give committed artifacts a `.log` extension. No test pins `.gitignore`.

---

### Track E: Runner, arms, report

#### `scripts/bench/run-bench.mjs` (CLI runner, batch)

Analog: `scripts/run-phase65-full-tests.mjs`. Copy the bounded child-output forwarding and the signal forwarding at `:169-227`:
```js
let activeChild = null;
let receivedSignal = null;
function onSignal(signal) {
  if (receivedSignal) return;
  receivedSignal = signal;
  if (activeChild && activeChild.exitCode === null && activeChild.signalCode === null) {
    try { activeChild.kill(signal); } catch { /* ... */ }
  }
}
process.on('SIGINT', () => onSignal('SIGINT'));
process.on('SIGTERM', () => onSignal('SIGTERM'));

function runChild(command, label) {
  return new Promise((resolveResult) => {
    let settled = false;
    const settle = (result) => { if (settled) return; settled = true; activeChild = null; resolveResult(result); };
    try {
      const child = spawn(command[0], command.slice(1), { cwd: repositoryRoot, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      activeChild = child;
      // forwardBounded(child.stdout, ...), child.once('error'...), child.once('close', (status, signal) => ...)
    } catch (error) { settle(Object.freeze({ label, error })); }
  });
}
```
Also copy the exit-code convention at `:274-276`: 130 for SIGINT, 143 for SIGTERM.

**Differences:**
- The Claude arm needs stdin (the task goes on stdin), so use `stdio: ['pipe', 'pipe', 'pipe']`.
- On a timeout, send SIGINT first, wait a grace period, then SIGTERM. SIGTERM produces no `result` event (RESEARCH Pattern 8).
- Write each run's JSON immediately (D-20).

#### `scripts/bench/report.mjs` and `scripts/bench/export-history.mjs` (CLI transform)

Analog: `scripts/report-t1-readiness.mjs`. Copy the header at `:14-24`, the pure exported `renderMarkdown`/`writeReport` at `:1241-1247`, and the direct-run guard at `:1273-1280`. The guard is what lets `tests/bench-*.test.mjs` import the module without side effects:
```js
export function writeReport(report, paths) {
  const jsonPath = (paths && paths.jsonPath) || JSON_OUT;
  const mdPath = (paths && paths.mdPath) || MD_OUT;
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(mdPath, renderMarkdown(report));
}
// ...
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try { runCli(); } catch (err) { console.error('...: ERROR ' + (err && err.message ? err.message : String(err))); process.exit(1); }
}
```
**Difference:** that report writes into `.planning/phases/44-*`. Bench output goes to `scripts/bench/results/<campaignId>/`, per RESEARCH "Recommended Project Structure" and Pitfall 22. The `export-history.mjs` input is the JSON produced by the RESEARCH console snippet. Its paging loop mirrors `extension/ui/options.js:3478-3487`.

#### `scripts/bench/lib/claude-arm.mjs` (driver, streaming)

- **argv:** mirror the task-mode argv at `mcp/src/agent-providers/claude-profile.ts:192-211`:
```ts
'-p', '--verbose', '--output-format', 'stream-json', '--include-partial-messages',
'--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--strict-mcp-config',
'--mcp-config', ctx.privateMcpConfigPath, '--agents', SERIALIZED_FSB_AGENTS, '--agent', 'fsb',
'--permission-mode', 'dontAsk', '--tools', '', '--allowedTools', 'mcp__fsb',
'--disallowedTools', DENIED_TOOLS.join(','), '--max-turns', '40', '--no-session-persistence',
```
- **`--agents` value:** build it the way `serializeStaticAgentPolicy` does (`:93-105`), with key order `description, prompt, tools, disallowedTools, permissionMode, maxTurns` under the key `fsb`. Read `mcp/ai/agents/fsb.json` (`loadStaticAgentPolicy`, `:53-89`). `DENIED_TOOLS` is at `:24-31`.
- **Forbidden flags:** never use `--dangerously-skip-permissions`, `--yolo` or `--auto` (`scripts/verify-agent-provider-flags.mjs:19-23`).
- **NDJSON reader:** copy the line-splitting loop at `mcp/src/agent-providers/claude-stream.ts:369-397`, including CR stripping and flushing the trailing partial line.

**Do NOT reuse `attestInit` (`:163-182`).** It rejects any tool that is not `mcp__fsb*`, so it would throw on `ToolSearch`/`WaitForMcpServers`, which D-18 must *record*. The bench summarizer is lenient and only records. The `ResultSchema` is `.passthrough()` (`:115-120`), so `duration_ms`, `duration_api_ms`, `total_cost_usd`, `modelUsage`, `apiKeySource` and `permission_denials` arrive as extra keys.

#### `scripts/bench/lib/cdp.mjs` (client, request-response)

The analog is `tests/screenshot-uat.test.js`:
- `waitForDevToolsPort` (`:50-61`) reads `<profile>/DevToolsActivePort`.
- `createCdpClient` (`:87-135`) is an id-correlated `pending` Map plus one-shot `listeners`.
- Target discovery is at `:231-232`: `fetch('http://127.0.0.1:' + port + '/json/list')`, then `targets.find(t => t.type === 'page')`.

**Difference:** that test uses the global `WebSocket` (Node 22+). Resolve `ws` from `mcp/node_modules` as `tests/mcp-bridge-topology.test.js:10-11` does, or with `createRequire` in ESM:
```js
const repoRoot = path.resolve(__dirname, '..');
const WebSocket = require(path.join(repoRoot, 'mcp', 'node_modules', 'ws'));
```

#### `scripts/bench/lib/mcp-client.mjs` (client, request-response)

No in-repo code uses the SDK `Client` (grep-verified). The module-resolution analog is `tests/write-activation-evidence.test.js:7-10`:
```js
const { createRequire } = require('node:module');
const REPO_ROOT = path.resolve(__dirname, '..');
const requireFromRoot = createRequire(path.join(REPO_ROOT, 'package.json'));
```
Use `createRequire(path.join(repo, 'mcp', 'package.json'))`, then follow the RESEARCH "Runner: own SDK client" code example. Pass `run_task` with `{ onprogress, resetTimeoutOnProgress: true, timeout: 60000, maxTotalTimeout }`, because the SDK default is 60 s. The server passes `fsb://config` through (`mcp/src/resources/index.ts:155-160`, 10 s timeout). `get_session_detail` forwards only `{ sessionId, format }` (`mcp/src/tools/observability.ts:46-57`, 10 s timeout), so no new parameters are possible without an `mcp/` change.

#### `scripts/bench/lib/cursor-arm.mjs` (optional)

There is no Cursor code in the repo. Reuse the NDJSON loop from `claude-arm.mjs`. The `result` event has durations only, so tokens and cost are labelled `unavailable (host does not report)`.

---

## Shared Patterns

### S1. Hidden side-channel on the payload (never serialized, never spoofable)
**Source:** `extension/ws/mcp-tool-dispatcher.js:157-160, 838-850, 3184-3197`
**Apply to:** `mcp-bridge-client.js` (stamp at ingress, read in the action tap) and `mcp-tool-dispatcher.js` (read in the message-route recorder and in `dispatchMcpToolRoute`)
```js
payload && payload[MCP_REPLAY_RECORD_CONTEXT]
  ? payload[MCP_REPLAY_RECORD_CONTEXT].tabId
  : (readRouteInspection.recordContext ? readRouteInspection.recordContext.tabId : null)
```
Any `{ ...payload }` spread or `structuredClone`/JSON round-trip drops the symbol. Read it before `canonicalizeVisualSessionTaskParams` (`:649`).

### S2. Recording never gates routing (fire-and-forget in its own try/catch)
**Source:** `extension/ws/mcp-bridge-client.js:1182-1197`, `extension/ws/mcp-tool-dispatcher.js:823-871`, `extension/utils/mcp-session-recorder.js:2222-2280`
**Apply to:** every new timing read or write in the bridge client, dispatcher, recorder and agent-loop.
- `Date.now()` only. `performance` is undefined in the vm harnesses.
- Do **not** reuse the exact comment strings `never let session recording break dispatch` / `never let session recording break the action`: `tests/mcp-session-recorder.test.js:867-875` counts each at exactly 1.

### S3. Unmeasured means null or omitted, never 0
**Sources:** `extension/utils/delegation-event-store.js:274-282` (`_nonnegativeIntegerOrNull`), `:567-570` (`usd = null`); `mcp/src/tools/pricing.ts:152-158` (unknown envelope), `:254-267` (finite gate)
**Apply to:** `_sanitizeCallTiming` (recorder), journal `metadata.timing`, `sanitizeActionHistoryEntry.durationMs`, agent-loop iteration rows, cost-tracker labelled helpers, automation-logger projections.
**Conditional-spread idiom** (`mcp-tool-dispatcher.js:2079-2080`):
```js
...(params.selector ? { selector: boundedString(params.selector, 250) } : {}),
```

### S4. Labelled source/status fields beside the number
**Sources:** `McpPricingResult.source` / `pricing_confidence` (`pricing.ts:68-74`); `_projectMetrics.billingKind` (`delegation-event-store.js:567, 577`)
**Apply to:** `usageSource`, `costSource` (`'provider' | 'estimate' | 'mixed' | 'unavailable'`), `queueWaitStatus: 'not_measured'`, `host.status: 'unavailable'`, Claude `total_cost_usd` → `"list-price estimate, not billed"`.

### S5. Classic service-worker script conventions
**Sources:** `extension/ai/cost-tracker.js:171-173` (`module.exports` guard); `extension/ai/agent-loop.js:65-83, 94, 155-165` (`var` + `typeof X !== 'undefined' ? X : require-fallback`); `extension/utils/mcp-lattice-journal.js:9, 2246-2248` (IIFE with `globalScope`)
**Apply to:** all extension edits.
- The dispatcher, bridge client, cost-tracker and agent-loop are **not** IIFEs, so their top-level names are shared SW globals. All proposed new names are currently unused.
- Do not add top-level `require(...)` calls to the dispatcher: `tests/mcp-in-flight-session-lookup.test.js:65-74` throws on unknown requires.

### S6. Feature-detect optional SW modules through `globalThis`
**Source:** `extension/background.js:12500-12505`
**Apply to:** the journal branch in `handleGetSessionMessageRoute`
```js
const journal = (typeof globalThis !== 'undefined') ? globalThis.FsbMcpLatticeJournal : null;
if (journal && typeof journal.hasSession === 'function' && typeof journal.getSessionDetail === 'function'
    && await journal.hasSession(payload.sessionId)) { /* ... */ }
```
In the vm harness `context.globalThis = context` (`tests/mcp-in-flight-session-lookup.test.js:83`), so new cases set `context.FsbMcpLatticeJournal = require('../extension/utils/mcp-lattice-journal.js')`, after `journal._resetForTests()` and the time/local shims (`tests/mcp-lattice-journal.test.js:30-49`). The existing four cases must still pass with the module absent.

### S7. Test harness styles (copy, do not share; repo convention per `tests/mcp-bridge-background-dispatch.test.js:23-25`)
- **Plain node plus counters:** `assert`/`passed`/`failed`, then `process.exit(failed > 0 ? 1 : 0)` (`tests/mcp-in-flight-session-lookup.test.js:21-32, 192-207`). New cases are appended to `run()` (`:192-200`); in the bridge test, append to `run()` at `:3607-3633`.
- **vm harness:** read the source, build `context`, set `context.globalThis = context`, then `vm.runInNewContext(source, context, { filename })`, as in `tests/mcp-in-flight-session-lookup.test.js:34-103` and `tests/mcp-bridge-background-dispatch.test.js:278-326` (the footer exposes internals through `this.__dispatchTest`).
- **Cross-realm deep-equal:** normalize with `JSON.parse(JSON.stringify(x))` before `util.isDeepStrictEqual` (`tests/mcp-bridge-background-dispatch.test.js:100-108`).
- **`node:test`:** `test('...', async () => {...})` with `node:assert/strict`, as in `tests/mcp-lattice-journal.test.js` and `tests/mcp-session-recorder-journal.test.js`.

### S8. Sensitive-key filter trap (`/token/i`)
**Source:** `extension/ws/mcp-tool-dispatcher.js:2027-2046`
**Apply to:** every stored or returned measurement field. Name usage fields `usage: { input, output, reasoning, cachedInput }` (no "token" substring), keep stored rows flat, and emit the `measurement` block *after* `sanitizeSessionMetadata` (RESEARCH Pitfall 1).

---

## Tripwire Register (update the paired test in the SAME commit)

| Modified file | Test pin | What it pins | Current value (measured 2026-09-29) |
|---|---|---|---|
| `extension/ai/agent-loop.js` | `tests/lattice-survivability-smoke.test.js:371-373`, `tests/mcp-philosophy-parity-smoke.test.js:373-378`, `tests/lattice-step-emitter-smoke.test.js:302-307` | `setTimeout` token count, comments included | **8** (`:5, 1416, 1602, 2177, 3028, 3031, 3100, 3110`). Add no timers; do not write the word in comments |
| `extension/ai/agent-loop.js` | `tests/agent-loop-iterator-guard.test.js:49-69` | 3 schedule lines byte-exact; 4 schedule call sites | 4 |
| `extension/ai/agent-loop.js` | `tests/lattice-step-emitter-smoke.test.js:157-167, 246-250` | exactly one `stepName: 'LLM_TURN'`, one `stepName: 'TOOL_DISPATCH'`; **no other `stepName: '...'` literal anywhere** | 1 / 1. Do not name a timing-row key `stepName` |
| `extension/ai/agent-loop.js` | `tests/mcp-philosophy-parity-smoke.test.js:384-398` | no `recordDispatch`/`recordVisualSessionTick` inside a `setTimeout(function` lambda body (80-line scan) | 0 |
| `extension/ai/agent-loop.js` | `tests/cost-tracker-ordering.test.js:37-60` | anchors `var sessionConfig = await _al_loadSessionConfig(...)`, `hydrateCostTracker(session);`, `session._costTracker.totalCost = session.totalCost \|\| 0;` (and input/output), text `Cost circuit breaker REMOVED in Phase 231` | present |
| `extension/ai/agent-loop.js` | `tests/meta-cognitive-tracker.test.js:40-48` | markers `var _META_INTERACT_TOOLS = {` and `\nfunction _trackMetaAttempt(session, call, iterNum) {` | present |
| `extension/ai/agent-loop.js` | `tests/ownership-leakage-regression.test.js:334-335` | substrings `spawnProvenance.begin({`, `openTabRegistry.bindTab(openTabAgentId, newTabId)` | present |
| `extension/ai/agent-loop.js` | `tests/run-task-cleanup-paths.test.js` (not in any npm script; run manually) | `fsbBroadcastAutomationLifecycle(` usage | present |
| `extension/ai/cost-tracker.js` | `tests/cost-tracker.test.js:52-54, 74-76, 86, 92, 134-147, 176-183, 190-197, 212-221, 228-233` | `grok-4-1-fast-reasoning` = 0.20/0.50 and **the unknown-model fallback reads that row** (`cost-tracker.js:87`) | Changing that row to 1.25/2.50 (D-11) changes every one of these expectations, including `unknown model defaults to ...` (0.70 becomes 3.75) unless the fallback is decoupled from the row. Decide explicitly; update the test in the same commit |
| `extension/ai/action-history.js` | `tests/action-history.test.js:67` | `createActionEvent({}).durationMs === 0` | only if the default changes |
| `extension/ws/mcp-bridge-client.js` | `tests/mcp-session-recorder.test.js:928-940` | exactly 1 `recordSafely(... 'recordAction' ... sessionRecordEntry ...)`; `let sessionRecordEntry = {` span contains `resolveMcpClientLabel(payload)`; exactly **3** `this._recordMcpSessionAction(` calls | 1 / yes / 3. Add timing *inside* the tap, not a 4th call site |
| `extension/ws/mcp-bridge-client.js` | `tests/mcp-session-recorder.test.js:947-951` | `resolveAgentTabOrError` within 4500 chars after `async _handleExecuteAction` | offset **3845** (655 chars of headroom; edits in `_handleMessage`/`_recordMcpSessionAction` sit before it and do not count) |
| `extension/ws/mcp-bridge-client.js` | `tests/mcp-session-recorder.test.js:873-875` | exactly 1 comment `never let session recording break the action` | 1 |
| `extension/ws/mcp-bridge-client.js` | `tests/spreadsheet-record-redaction.test.js:779, 781` | regex `if \(!spreadsheetTool && !unresolvedRecordTarget\)[\s\S]*recordAction\(sessionRecordEntry\)` | matches |
| `extension/ws/mcp-bridge-client.js` | `tests/mcp-bridge-background-dispatch.test.js:399-487` | lifecycle order `begin, route, result/error, end`; begin/end identity deep-equal | unchanged by design |
| `extension/ws/mcp-tool-dispatcher.js` | `tests/mcp-session-recorder.test.js:887-911` | exactly 1 `recordSafely(... 'recordDispatch' ... sessionRecordEntry ...)`; `var sessionRecordEntry = {` span contains `resolveMcpClientLabel(payload)`; first `fsbMcpSessionRecorder.recordDispatch` occurs after `async function dispatchMcpMessageRoute`; exactly 1 `if (!_mcpMetricsSuppressInner) {` | 1 / yes / yes / 1. Do not add a session-recorder call in `dispatchMcpToolRoute` (`recordTaskOutcome` is fine) |
| `extension/ws/mcp-tool-dispatcher.js` | `tests/mcp-session-recorder.test.js:915-923`, `tests/mcp-dispatcher-client-label.test.js:219-236` | regex `/globalThis\.fsbMcpMetricsRecorder\.recordDispatch\(\{[\s\S]*?\}\);/g` matches exactly **2**, each containing `resolveMcpClientLabel(payload)` and not `fsbMcpSessionRecorder` | 2. Do not put timing in metrics payloads |
| `extension/ws/mcp-tool-dispatcher.js` | `tests/mcp-session-recorder.test.js:867-870` | exactly 1 comment `never let session recording break dispatch` | 1 |
| `extension/ws/mcp-tool-dispatcher.js` | `tests/spreadsheet-record-redaction.test.js:778, 780` | regexes `spreadsheetInvoke[\s\S]*recordSafely\([\s\S]*'recordDispatch'` and `if \(!spreadsheetRecord && !unresolvedRecordTarget\)[\s\S]*recordDispatch\(sessionRecordEntry\)` | match |
| `extension/ws/mcp-tool-dispatcher.js` | `tests/mcp-in-flight-session-lookup.test.js` | in-flight fallback, `session_not_found` (`errorCode`, `recoveryHint` mentions `list_sessions` and `get_task_status`), harness has no journal module and throws on unknown `require` | extend, do not rewrite |
| `extension/utils/mcp-session-recorder.js` | `tests/mcp-session-recorder-journal.test.js:92` | `beginCall` identity deep-equal (7 keys) | unchanged by design |
| `extension/utils/mcp-session-recorder.js` | `tests/mcp-session-recorder.test.js:1356-1357` | no `setTimeout(` anywhere in the recorder | 0 |
| `extension/utils/mcp-session-recorder.js` | `tests/lattice-replay-background-contract.test.js:391-394, 446` | substrings `requestPayload: _sanitizeRequestPayload(payload, entry.response)`, `redactedInputs: entry.redactedInputs === true`, `reason: 'idle_timeout'` | present (`:2162`, `:2168`, `:1625`) |
| `extension/utils/mcp-lattice-journal.js` | `tests/mcp-lattice-journal.test.js:432-439` | `streamSessionExport(id,'text')` output **byte-equals** `exportHumanReadable(id)` | shared formatter required |
| `extension/utils/mcp-lattice-journal.js` | `tests/mcp-lattice-journal.test.js:1396-1399` | `/Calls retained: 505/`, `/Executable replay: latest 100 of 505/`, `/Call 505: read_step_504/` (unanchored regex) | suffix-safe |
| `extension/utils/mcp-lattice-journal.js` | `tests/mcp-lattice-journal.test.js:605-640` | budget-exhausted compact marker path | add `metadata.timing` only when present |
| `extension/utils/automation-logger.js` | `tests/lattice-replay-background-contract.test.js:111-114` | `async getReplayData(` precedes `async exportHumanReadable(` | keep method order |
| `extension/utils/automation-logger.js` | `tests/delegation-sidepanel-tab-follow.test.js:470` | `var AUTOMATION_LOGS_PERSISTED_TAIL = (\d+);` >= 200 | untouched region |
| `extension/background.js` (only if a SW module is added; **not recommended**) | `tests/lattice-provider-bridge-smoke.test.js:634-635, 683-684` | `importScripts` tokens **333**, call sites **329** | inline stamps avoid this |
| `package.json` | `tests/delegation-phase-contract.test.js:2373-2391, 3126-3134` | refinement commands appear exactly once; the chain minus known lists hashes to the pre-phase constants | append to tail + `REFINEMENT_ROOT_TEST_COMMANDS` |
| `package.json` | `tests/mcp-client-identity-integration.test.js:469-486` | Phase 57 cluster order and count | do not reorder |
| new fixture dirs | `tests/mcp-agent-drift-smoke.test.js:193-200, 358-366` | exact set of `tests/fixtures/agent-streams/*/manifest.json` | keep bench fixtures out of `agent-streams/` |

**Suites to run on every Track C commit** (from RESEARCH Validation Architecture): `node tests/mcp-philosophy-parity-smoke.test.js && node tests/lattice-survivability-smoke.test.js && node tests/agent-loop-iterator-guard.test.js && node tests/cost-tracker-ordering.test.js && node tests/meta-cognitive-tracker.test.js && node tests/ownership-leakage-regression.test.js && node tests/run-task-cleanup-paths.test.js && node tests/lattice-step-emitter-smoke.test.js && node tests/cost-tracker.test.js && node tests/action-history.test.js && node tests/turn-result.test.js`.

**Suites to run on every Track A/B commit:** `node tests/mcp-bridge-background-dispatch.test.js && node tests/mcp-in-flight-session-lookup.test.js && node tests/mcp-session-recorder.test.js && node tests/mcp-dispatcher-client-label.test.js && node tests/mcp-session-recorder-journal.test.js && node --test tests/mcp-lattice-journal.test.js tests/mcp-session-export-port.test.js tests/spreadsheet-record-redaction.test.js && node tests/lattice-replay-background-contract.test.js`.

---

## No Analog Found

Files with no close match. The planner should use the RESEARCH.md patterns named here.

| File | Role | Data Flow | Reason | Use instead |
|------|------|-----------|--------|-------------|
| `scripts/bench/lib/stats.mjs` | utility | transform | no statistics or bootstrap code in the repo | RESEARCH Pattern 9 (verbatim, pure, seeded) + module style from `scripts/lib/t1-port-contract.mjs` |
| `scripts/bench/lib/mcp-client.mjs` | client | request-response | no in-repo use of the SDK `Client`/`StdioClientTransport` (grep-verified) | RESEARCH "Runner: own SDK client" example; resolution via `createRequire(<repo>/mcp/package.json)` |
| `scripts/bench/lib/cursor-arm.mjs` | driver | streaming | no Cursor integration exists | the `claude-arm.mjs` NDJSON loop; RESEARCH Pattern 8 (Cursor result has durations only) |
| `scripts/bench/results/**` | committed data | batch output | first committed benchmark artifacts | RESEARCH "Recommended Project Structure" (`runs.jsonl`, `summary.json`, `report.md`, `identity.json`); D-21 split raw vs sanitized |
| `scripts/bench/tasks/**/*.json` | config | config | no task-definition corpus exists (manifest style only is analogous) | RESEARCH Pattern 7 schema + suggested 6 mixed / 6 click-heavy set |

---

## Metadata

**Analog search scope:** `extension/ws/`, `extension/utils/`, `extension/ai/`, `extension/ui/options.js`, `extension/background.js` (targeted ranges), `extension/config/config.js`, `mcp/src/tools/`, `mcp/src/agent-providers/`, `mcp/src/resources/`, `mcp/src/diagnostics.ts`, `mcp/data/`, `scripts/*.mjs`, `scripts/lib/`, `tests/*.test.js`, `tests/*.test.mjs`, `tests/fixtures/`, `package.json`, `.gitignore`, `.github/workflows/ci.yml`
**Files scanned:** ~60 (full reads of the small files; grep-located, non-overlapping reads of the large ones)
**New findings not in RESEARCH.md:**
1. `FsbSpreadsheetRecordRedaction.sanitizeEntry` rebuilds Sheets entries via `baseFields` (`spreadsheet-record-redaction.js:246-255`), dropping any new `timing` field.
2. `tests/mcp-agent-drift-smoke.test.js` enumerates `tests/fixtures/agent-streams/*/manifest.json`, so the new Claude stream fixture must live elsewhere.
3. `tests/lattice-step-emitter-smoke.test.js:246-250` forbids any `stepName: '...'` literal other than the two existing ones in `agent-loop.js`.
4. `tests/mcp-session-recorder.test.js:867-875` counts the two "never let session recording break ..." comments at exactly 1 each.
5. `tests/cost-tracker.test.js` couples the unknown-model fallback value to the `grok-4-1-fast-reasoning` row, so D-11's price change moves ~15 assertions.
6. `resolveAgentTabOrError` currently sits 3845 chars into `_handleExecuteAction` (limit 4500).

**Pattern extraction date:** 2026-09-29
