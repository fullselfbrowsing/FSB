/**
 * Regression suite for extension/utils/mcp-session-recorder.js
 * (quick task 260707-7id -- record MCP agent sessions into the SAME
 * logs/history/replay/memory pipeline autopilot runs use -- plus the
 * review-fix follow-up that moved the action tap to the bridge).
 *
 * Production entry points simulated by the fixtures:
 *   - recordAction(): the bridge-level tap
 *     (MCPBridgeClient._recordMcpSessionAction in mcp-bridge-client.js,
 *     called from _handleExecuteAction) -- carries the FULL bridge payload
 *     plus the ownership-resolved tabId. Tool names are WIRE VERBS
 *     (fsbVerb = _contentVerb || _cdpVerb || name): type_text ships as
 *     'type', press_enter as 'pressEnter', go_back as 'go_back', ...
 *   - recordDispatch(): the dispatcher message-route hook
 *     (dispatchMcpMessageRoute finally block) -- read-only/message traffic
 *     that JOINs open sessions by agentId.
 *
 * Covers the locked cases:
 *   1.  Birth on first sidecar action (keyed agentId+resolved tabId;
 *       logSessionStart seeds the saveSession empty-logs gate; task = first
 *       visualReason; sessionId matches the autopilot /^session_\d+$/ format).
 *   2.  actionHistory accumulation in replay shape {tool, params, result,
 *       timestamp}, in dispatch order, wire verbs stored replay-compatibly.
 *   3.  Read-only JOIN by agentId (sidecar-less dispatch appends to the open
 *       session; unknown agentId creates nothing).
 *   4.  isFinal close -> saveSession exactly once with mode 'mcp-agent',
 *       task = first visualReason, final action included, mcpClient set;
 *       no provider-backed memory extraction; a safe candidate is retained.
 *       Snake_case is_final tolerated.
 *   5.  60s idle expiry with sliding chrome.alarms re-arm (fake clock/alarm
 *       store -- no real waiting; no premature close).
 *   6.  run_task skipped entirely (automation engine already records it).
 *   7.  >=1-action persistence gate: pure read-only bursts never birth
 *       sessions, saveSession never fires.
 *   8.  Secret-key + sensitive-target redaction across params/results while
 *       ordinary replay text remains exact and caller objects stay unchanged.
 *   9.  Recorder never throws (throwing storage + throwing logger shims);
 *       each hook site wrapped in its own try/catch -- dispatcher guard
 *       string x1 (message route), bridge guard string x1 (action tap).
 *   10. Source-pin guards: exactly 1 shared-redactor recordDispatch ingress
 *       in mcp-tool-dispatcher.js (message route, inside the
 *       !_mcpMetricsSuppressInner gate, after dispatchMcpMessageRoute -- the
 *       tool route stays session-clean or background actions double-count);
 *       exactly 1 shared-redactor recordAction ingress and exactly 3
 *       this._recordMcpSessionAction( invocations in mcp-bridge-client.js;
 *       the fsbMcpMetricsRecorder pattern still matches exactly 2 sites;
 *       background.js loads the recorder on exactly one line;
 *       resolveAgentTabOrError stays within 4500 chars of
 *       _handleExecuteAction (action-tool-agent-scoped / ownership-error-
 *       codes source gates).
 *   11. Eviction restore: a v:1 fsbMcpSessionBuffer envelope with one
 *       expired + one live session restores correctly (_restoreFromBuffer).
 *   12. Malformed / wrong-version envelope treated as canonical empty.
 *   13. Tab identity (review finding #1): params.tab_id (wire snake_case)
 *       keys sessions -- no agentId::none collapse; explicit resolved tabId
 *       wins over params; camelCase back-compat; same agent on two tabs
 *       yields two distinct sessions.
 *   14. Bootstrap birth (open_tab/switch_tab): empty params + post-dispatch
 *       resolved tabId key the session; non-replayable wire verb stored
 *       verbatim.
 *   15. Replay-name map (review finding #2): go_back/go_forward stored as
 *       goBack/goForward (the whitelist names in background.js
 *       loadReplayableSession); cdp verbs stored verbatim; whitelist literal
 *       pinned to contain the mapped names.
 *   16. Failure semantics: failed actions still append (result.success ===
 *       false -- the replay filter excludes them downstream); sidecar-less
 *       recordAction calls JOIN, never birth.
 *   17-20. Recording opt-out/mid-session flush, startup restore ordering,
 *       durable alarm routing/rearming, and persisted startup policy.
 *   21-26. Client-authored local memories, ambiguity rules, SW-restored
 *       candidates/expiry, retryable persisted-data redaction migration, and
 *       independent non-fatal history/memory writes.
 *
 * Run: node tests/mcp-session-recorder.test.js
 *
 * Harness pattern mirrors tests/mcp-dispatcher-client-label.test.js: plain
 * Node script, no framework, passed/failed counters, process.exit(0|1).
 */

'use strict';

const path = require('path');
const fs = require('fs');

const RECORDER_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'mcp-session-recorder.js');
const DISPATCHER_PATH = path.resolve(__dirname, '..', 'extension', 'ws', 'mcp-tool-dispatcher.js');
const BRIDGE_CLIENT_PATH = path.resolve(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js');
const BACKGROUND_PATH = path.resolve(__dirname, '..', 'extension', 'background.js');

const recorder = require(RECORDER_PATH);

let passed = 0;
let failed = 0;

function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function passAssertEqual(actual, expected, msg) {
  passAssert(actual === expected,
    msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')');
}

function passAssertDeepEqual(actual, expected, msg) {
  passAssert(JSON.stringify(actual) === JSON.stringify(expected),
    msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')');
}

async function drainMicrotasks() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise(function (r) { setImmediate(r); });
}

// ---------------------------------------------------------------------------
// Shim factories
// ---------------------------------------------------------------------------

function makeLoggerStub(opts) {
  opts = opts || {};
  const calls = {
    logSessionStart: [], logAction: [], saveSession: [], pruneMcpSessions: [],
    withSessionMutationLock: [], updateSessionOutcome: []
  };
  const logs = [];
  let mutationLock = Promise.resolve();
  return {
    calls,
    withSessionMutationLock(fn) {
      if (opts.throwing) throw new Error('logger boom');
      calls.withSessionMutationLock.push(true);
      const next = mutationLock.then(fn, fn);
      mutationLock = next.catch(() => {});
      return next;
    },
    logSessionStart(sessionId, task, tabId) {
      if (opts.throwing) throw new Error('logger boom');
      calls.logSessionStart.push({ sessionId, task, tabId });
      logs.push({ data: { sessionId } });
    },
    logAction(sessionId, action, result) {
      if (opts.throwing) throw new Error('logger boom');
      calls.logAction.push({ sessionId, action, result });
      logs.push({ data: { sessionId } });
    },
    getSessionLogs(sessionId) {
      if (opts.throwing) throw new Error('logger boom');
      return logs.filter((l) => l.data && l.data.sessionId === sessionId);
    },
    saveSession(sessionId, sessionData) {
      if (opts.throwing) throw new Error('logger boom');
      calls.saveSession.push({ sessionId, sessionData });
      return Promise.resolve(true);
    },
    updateSessionOutcome(sessionId, sessionData) {
      if (opts.throwing) throw new Error('logger boom');
      calls.updateSessionOutcome.push({ sessionId, sessionData });
      return Promise.resolve(true);
    },
    pruneMcpSessions(days) {
      if (opts.throwing) throw new Error('logger boom');
      calls.pruneMcpSessions.push(days);
      return Promise.resolve({ removed: 0, ids: [] });
    }
  };
}

function makeMemoriesStub() {
  const calls = [];
  function extractAndStoreMemoriesStub(sessionId, session) {
    calls.push({ sessionId, session });
    return Promise.resolve([]);
  }
  extractAndStoreMemoriesStub.calls = calls;
  return extractAndStoreMemoriesStub;
}

function makeTaskMemoryStub() {
  const memories = [];
  const calls = [];
  return {
    memories,
    calls,
    createTaskMemory(text, metadata, typeData) {
      return {
        id: 'mem_' + (calls.length + 1),
        type: 'task',
        text,
        metadata: { ...metadata },
        sourceSessionId: metadata.sourceSessionId || null,
        typeData: JSON.parse(JSON.stringify(typeData || {}))
      };
    },
    storage: {
      async getAll() { return memories.slice(); },
      async add(memory) {
        calls.push(memory);
        memories.push(memory);
        return true;
      }
    }
  };
}

function makeStorageShim() {
  const store = {};
  return {
    store,
    get(keys) {
      return Promise.resolve().then(function () {
        const ks = Array.isArray(keys) ? keys : [keys];
        const out = {};
        for (const k of ks) {
          if (Object.prototype.hasOwnProperty.call(store, k)) out[k] = store[k];
        }
        return out;
      });
    },
    set(obj) {
      return Promise.resolve().then(function () { Object.assign(store, obj); });
    },
    remove(key) {
      return Promise.resolve().then(function () {
        const ks = Array.isArray(key) ? key : [key];
        for (const k of ks) delete store[k];
      });
    }
  };
}

function makeThrowingStorageShim() {
  return {
    get() { throw new Error('storage boom'); },
    set() { throw new Error('storage boom'); },
    remove() { throw new Error('storage boom'); }
  };
}

function makeTimeShim(startMs) {
  let nowMs = startMs;
  const shim = {
    now: function () { return nowMs; }
  };
  return {
    shim,
    advance(ms) {
      nowMs += ms;
    },
    now: function () { return nowMs; }
  };
}

function makeAlarmShim(time) {
  const alarms = new Map();
  const calls = { create: [], clear: [] };
  return {
    alarms,
    calls,
    create(name, info) {
      calls.create.push({ name, info: { ...info } });
      alarms.set(name, { name, ...info });
      return Promise.resolve();
    },
    get(name, callback) {
      const alarm = alarms.get(name) || null;
      if (typeof callback === 'function') callback(alarm);
      return Promise.resolve(alarm);
    },
    clear(name) {
      calls.clear.push(name);
      const existed = alarms.delete(name);
      return Promise.resolve(existed);
    },
    async fireDue() {
      const due = [...alarms.values()]
        .filter((alarm) => typeof alarm.when === 'number' && alarm.when <= time.now())
        .sort((a, b) => a.when - b.when);
      for (const alarm of due) await recorder.handleAlarm({ name: alarm.name });
      await recorder._drainForTests();
    }
  };
}

// Fresh section state: reset recorder, install fresh stubs, return handles.
async function freshSection(startMs) {
  await recorder._drainForTests();
  recorder._resetForTests();
  const storage = makeStorageShim();
  recorder._setStorageShim(storage);
  const localStorage = makeStorageShim();
  recorder._setLocalStorageShim(localStorage);
  const time = makeTimeShim(startMs || 1750000000000);
  recorder._setTimeShim(time.shim);
  const alarms = makeAlarmShim(time);
  recorder._setAlarmShim(alarms);
  const logger = makeLoggerStub();
  globalThis.automationLogger = logger;
  const memories = makeMemoriesStub();
  globalThis.extractAndStoreMemories = memories;
  const taskMemories = makeTaskMemoryStub();
  globalThis.createTaskMemory = taskMemories.createTaskMemory;
  globalThis.memoryStorage = taskMemories.storage;
  return { storage, localStorage, time, alarms, logger, memories, taskMemories };
}

// Bridge-tap entry builder -- the exact shape
// MCPBridgeClient._recordMcpSessionAction emits: the FULL bridge payload
// (wire verb, wire params with snake_case tab_id, agentId, visualSession
// sidecar) plus the ownership-resolved tabId. Tool names here are WIRE
// VERBS: 'type' (type_text), 'pressEnter' (press_enter), 'go_back', ...
function bridgeAction(o) {
  const payload = { tool: o.tool, params: o.params || {}, agentId: o.agentId };
  if (!o.noSidecar) {
    const visualSession = { visualReason: o.visualReason, client: o.client };
    if (o.isFinal !== undefined) visualSession.isFinal = o.isFinal;
    if (o.is_final !== undefined) visualSession.is_final = o.is_final;
    payload.visualSession = visualSession;
  }
  return {
    client: o.client || null,
    tool: o.tool,
    params: o.params || {},
    payload,
    response: o.response === undefined ? { success: true } : o.response,
    success: o.success === undefined ? true : o.success,
    tabId: o.tabId === undefined ? null : o.tabId
  };
}

// Dispatcher message-route entry builder (exact shape the
// dispatchMcpMessageRoute finally block emits).
function readDispatch(o) {
  const requestPayload = { tool: o.tool, params: o.params || {}, agentId: o.agentId };
  if (o.tab_id !== undefined) requestPayload.tab_id = o.tab_id;
  if (o.payloadTabId !== undefined) requestPayload.tabId = o.payloadTabId;
  const entry = {
    client: o.client || 'unknown',
    tool: o.tool,
    requestPayload,
    response: o.response === undefined ? { success: true } : o.response,
    success: o.success === undefined ? true : o.success,
    dispatcher_route: o.route || 'message'
  };
  if (o.entryTabId !== undefined) entry.tabId = o.entryTabId;
  return entry;
}

(async function main() {

  // -- Test 1: birth on first sidecar action --------------------------------
  console.log('--- Test 1: birth on first sidecar action (bridge tap) ---');
  {
    const { storage, logger } = await freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-1', tool: 'click', params: { tab_id: 42, selector: '#buy' }, tabId: 42,
      visualReason: 'Book a flight to Berlin', client: 'Claude'
    }));
    await recorder._drainForTests();
    const open = recorder._peekOpenSessions();
    const keys = Object.keys(open);
    passAssertEqual(keys.length, 1, 'exactly one open session after birth');
    passAssertEqual(keys[0], 'agent-1::42', 'session keyed agentId::resolvedTabId');
    const rec = open['agent-1::42'];
    passAssert(/^session_\d+$/.test(rec.sessionId), 'sessionId matches autopilot format session_<ms> (got ' + rec.sessionId + ')');
    passAssertEqual(rec.task, 'Book a flight to Berlin', 'task seeded from first visualReason');
    passAssertEqual(rec.client, 'Claude', 'client label captured from sidecar');
    passAssertEqual(rec.sawActionTool, true, 'sawActionTool set on sidecar action');
    passAssertEqual(logger.calls.logSessionStart.length, 1, 'logSessionStart called once (seeds saveSession empty-logs gate)');
    passAssertEqual(logger.calls.logSessionStart[0].sessionId, rec.sessionId, 'logSessionStart got the session id');
    passAssertEqual(logger.calls.logSessionStart[0].task, 'Book a flight to Berlin', 'logSessionStart got the task');
    passAssertEqual(logger.calls.logSessionStart[0].tabId, 42, 'logSessionStart got the numeric tabId');
    await drainMicrotasks();
    const envelope = storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY];
    passAssert(envelope && envelope.v === 1, 'open-session buffer persisted with versioned envelope v=1');
    passAssert(envelope && envelope.records && envelope.records['agent-1::42'] &&
      envelope.records['agent-1::42'].sessionId === rec.sessionId,
      'persisted envelope carries the open session record');
  }

  // -- Test 2: actionHistory accumulation ------------------------------------
  console.log('\n--- Test 2: actionHistory accumulation in replay shape (wire verbs) ---');
  {
    const { logger } = await freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-1', tool: 'click', params: { tab_id: 42, selector: '#compose' }, tabId: 42,
      visualReason: 'Compose an email', client: 'Claude'
    }));
    recorder.recordAction(bridgeAction({
      agentId: 'agent-1', tool: 'type', params: { tab_id: 42, selector: '#to', text: 'a@b.c' }, tabId: 42,
      visualReason: 'Compose an email', client: 'Claude'
    }));
    recorder.recordAction(bridgeAction({
      agentId: 'agent-1', tool: 'pressEnter', params: { tab_id: 42 }, tabId: 42,
      visualReason: 'Compose an email', client: 'Claude'
    }));
    await recorder._drainForTests();
    const rec = recorder._peekOpenSessions()['agent-1::42'];
    passAssertEqual(rec.actionHistory.length, 3, 'three dispatches -> three actionHistory entries');
    passAssertEqual(rec.actionHistory[0].tool, 'click', 'entry 1 tool in order (replay whitelist name)');
    passAssertEqual(rec.actionHistory[1].tool, 'type', 'entry 2 tool in order (type_text wire verb = replay name)');
    passAssertEqual(rec.actionHistory[2].tool, 'pressEnter', 'entry 3 tool in order (press_enter wire verb = replay name)');
    const shapesOk = rec.actionHistory.every(function (a) {
      return a && typeof a.tool === 'string' && a.params && typeof a.params === 'object' &&
        'result' in a && typeof a.timestamp === 'number';
    });
    passAssert(shapesOk, 'every entry is {tool, params, result, timestamp} (replay shape)');
    passAssertEqual(rec.actionHistory[1].params.text, 'a@b.c', 'replay-critical text param persists raw');
    passAssertEqual(logger.calls.logAction.length, 3, 'logAction emitted per dispatch (session-bound logs)');
  }

  // -- Test 3: read-only JOIN by agentId --------------------------------------
  console.log('\n--- Test 3: read-only JOIN by agentId ---');
  {
    const { logger } = await freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-1', tool: 'navigate', params: { tab_id: 42, url: 'https://example.com/inbox' }, tabId: 42,
      visualReason: 'Open the inbox', client: 'Claude'
    }));
    recorder.recordDispatch(readDispatch({ agentId: 'agent-1', tool: 'mcp:read-page' }));
    await recorder._drainForTests();
    const rec = recorder._peekOpenSessions()['agent-1::42'];
    passAssertEqual(rec.actionHistory.length, 2, 'sidecar-less dispatch with same agentId JOINS the open session');
    passAssertEqual(rec.actionHistory[1].tool, 'mcp:read-page', 'joined entry appended in order');
    passAssertEqual(rec.lastUrl, 'https://example.com/inbox', 'successful navigate sets lastUrl (memory domain fallback)');
    recorder.recordDispatch(readDispatch({ agentId: 'agent-UNKNOWN', tool: 'mcp:get-tabs' }));
    await recorder._drainForTests();
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 1,
      'sidecar-less dispatch with unknown agentId creates NO session');
    passAssertEqual(logger.calls.saveSession.length, 0, 'no close happened during joins');
  }

  // -- Test 4: isFinal close -> history + safe memory candidate ---------------
  console.log('\n--- Test 4: isFinal close saves history without provider extraction ---');
  {
    const { logger, memories, taskMemories } = await freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-1', tool: 'navigate', params: { tab_id: 7, url: 'https://example.com/report' }, tabId: 7,
      visualReason: 'Compose the weekly report', client: 'Claude'
    }));
    recorder.recordAction(bridgeAction({
      agentId: 'agent-1', tool: 'type', params: { tab_id: 7, selector: '#body', text: 'hello' }, tabId: 7,
      visualReason: 'Compose the weekly report', client: 'Claude'
    }));
    recorder.recordAction(bridgeAction({
      agentId: 'agent-1', tool: 'click', params: { tab_id: 7, selector: '#send' }, tabId: 7,
      visualReason: 'Send the report', client: 'Claude', isFinal: true
    }));
    await recorder._drainForTests();
    passAssertEqual(logger.calls.saveSession.length, 1, 'saveSession invoked exactly once on isFinal');
    const saved = logger.calls.saveSession[0];
    passAssert(/^session_\d+$/.test(saved.sessionId), 'saveSession got the session id');
    passAssertEqual(saved.sessionData.mode, 'mcp-agent', "session.mode === 'mcp-agent' (locked schema value)");
    passAssertEqual(saved.sessionData.task, 'Compose the weekly report', 'session.task === FIRST visualReason');
    passAssertEqual(saved.sessionData.mcpClient, 'Claude', 'session.mcpClient carries the client label');
    passAssertEqual(saved.sessionData.status, 'completed', "session.status === 'completed'");
    passAssertEqual(saved.sessionData.tabId, 7, 'session.tabId numeric');
    passAssertEqual(saved.sessionData.actionHistory.length, 3, 'final action is part of the history (close AFTER append)');
    passAssertEqual(saved.sessionData.actionHistory[2].tool, 'click', 'last entry is the final action');
    passAssertEqual(saved.sessionData.iterationCount, 3, 'iterationCount = actionHistory length');
    passAssertEqual(saved.sessionData.lastUrl, 'https://example.com/report', 'lastUrl carried onto the session');
    passAssertEqual(memories.calls.length, 0, 'session close never calls provider-backed extractAndStoreMemories');
    passAssertEqual(taskMemories.calls.length, 0, 'session close creates no long-term memory without a lifecycle summary');
    const candidates = recorder._peekMemoryCandidates();
    passAssertEqual(Object.keys(candidates).length, 1, 'close retains one short-lived safe memory candidate');
    passAssertEqual(candidates[saved.sessionId].sessionId, saved.sessionId, 'candidate is keyed by the source session id');
    passAssertEqual(Object.prototype.hasOwnProperty.call(candidates[saved.sessionId], 'actionHistory'), false,
      'candidate contains no raw action history');
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0, 'session removed from the open map');

    // Snake_case tolerance: is_final on the very first action closes a
    // 1-action session.
    recorder.recordAction(bridgeAction({
      agentId: 'agent-2', tool: 'click', params: { tab_id: 9 }, tabId: 9,
      visualReason: 'One-shot action', client: 'Codex', is_final: true
    }));
    await recorder._drainForTests();
    passAssertEqual(logger.calls.saveSession.length, 2, 'snake_case is_final also closes (wire-spec tolerance)');
    passAssertEqual(logger.calls.saveSession[1].sessionData.actionHistory.length, 1,
      'one-shot session persisted with its single action');
    passAssertEqual(logger.calls.saveSession[1].sessionData.mcpClient, 'Codex',
      'second session carries its own client label');
  }

  // -- Test 5: 60s idle expiry with sliding re-arm ----------------------------
  console.log('\n--- Test 5: 60s idle expiry (sliding window, fake clock) ---');
  {
    const { time, alarms, logger, taskMemories } = await freshSection(1750000000000);
    recorder.recordAction(bridgeAction({
      agentId: 'agent-3', tool: 'click', params: { tab_id: 5 }, tabId: 5,
      visualReason: 'Sort the inbox', client: 'Claude'
    }));
    await recorder._drainForTests();
    time.advance(30000); // t+30s: inside the window
    passAssertEqual(logger.calls.saveSession.length, 0, 'no close before the 60s deadline');
    recorder.recordAction(bridgeAction({
      agentId: 'agent-3', tool: 'click', params: { tab_id: 5 }, tabId: 5,
      visualReason: 'Sort the inbox', client: 'Claude'
    })); // re-arms deadline to t+90s
    await recorder._drainForTests();
    time.advance(45000); // t+75s: past the ORIGINAL deadline (t+60s) but inside the re-armed one
    passAssertEqual(logger.calls.saveSession.length, 0,
      'fresh action re-armed the window -- no premature close at t+75s');
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 1, 'session still open at t+75s');
    time.advance(20000); // t+95s: past the re-armed deadline (t+90s)
    await alarms.fireDue();
    passAssertEqual(logger.calls.saveSession.length, 1, 'idle expiry closed and persisted the session');
    passAssertEqual(logger.calls.saveSession[0].sessionData.actionHistory.length, 2,
      'expired session kept both recorded actions');
    passAssertEqual(logger.calls.saveSession[0].sessionData.status, 'expired',
      'idle expiry persists an expired status');
    passAssertEqual(logger.calls.saveSession[0].sessionData.outcome, 'stopped',
      'idle expiry does not claim task success');
    passAssertEqual(logger.calls.saveSession[0].sessionData.outcomeDetails.reason, 'expired',
      'idle expiry preserves its non-terminal close reason');
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0, 'expired session removed from the map');

    recorder.recordTaskOutcome({
      tool: 'complete_task', params: { summary: 'Late confirmed completion', tab_id: 5 },
      payload: { agentId: 'agent-3' }, response: { status: 'completed' }
    });
    await recorder._drainForTests();
    passAssertEqual(logger.calls.updateSessionOutcome.length, 1,
      'a terminal summary can still correct an expired history row');
    passAssertEqual(logger.calls.updateSessionOutcome[0].sessionData.outcome, 'success',
      'late completion replaces the provisional stopped outcome');
    passAssertEqual(taskMemories.calls.length, 1,
      'late completion still creates the provider-free Task Memory');
  }

  // -- Test 6: run_task skipped ------------------------------------------------
  console.log('\n--- Test 6: run_task dispatches are never recorded ---');
  {
    const { logger } = await freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-4', tool: 'run_task', params: { tab_id: 3, task: 'do things' }, tabId: 3,
      visualReason: 'Autopilot handoff', client: 'Claude'
    }));
    await recorder._drainForTests();
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0,
      'run_task (even with a sidecar) creates no session');
    passAssertEqual(logger.calls.logSessionStart.length, 0, 'run_task seeds no session logs');
    passAssertEqual(logger.calls.saveSession.length, 0, 'run_task persists nothing');
  }

  // -- Test 7: >=1-action persistence gate -------------------------------------
  console.log('\n--- Test 7: pure read-only bursts never create sessions ---');
  {
    const { logger } = await freshSection();
    recorder.recordDispatch(readDispatch({ agentId: 'agent-ro', tool: 'mcp:get-tabs' }));
    recorder.recordDispatch(readDispatch({ agentId: 'agent-ro', tool: 'mcp:read-page' }));
    recorder.recordDispatch(readDispatch({ agentId: 'agent-ro', tool: 'read_page', route: 'tool' }));
    await recorder._drainForTests();
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0,
      'read-only burst (agentId, never a sidecar) births no session');
    passAssertEqual(logger.calls.saveSession.length, 0, 'saveSession never called for the burst');
  }

  // -- Test 8: targeted redaction + ordinary replay fidelity -------------------
  console.log('\n--- Test 8: secrets redact everywhere while ordinary replay text remains exact ---');
  {
    const { storage, logger } = await freshSection();
    const originalParams = {
      selector: 'input[type="password"]',
      password: 'hunter2',
      nested: { apiKey: 'k' },
      text: 'hunter2',
      tab_id: 11
    };
    const originalResult = { success: true, apiToken: 'result-secret', value: 'hunter2' };
    recorder.recordAction(bridgeAction({
      agentId: 'agent-5', tool: 'type', params: originalParams, tabId: 11,
      response: originalResult, visualReason: 'Log in', client: 'Claude'
    }));
    await recorder._drainForTests();
    const buffered = storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY]
      .records['agent-5::11'].actionHistory[0];
    passAssertEqual(buffered.params.password, '[REDACTED]', 'buffer redacts a password key');
    passAssertEqual(buffered.params.nested.apiKey, '[REDACTED]', 'buffer recursively redacts a nested API key');
    passAssertEqual(buffered.params.text, '[REDACTED]', 'buffer redacts generic text for a password target');
    passAssertEqual(buffered.result.apiToken, '[REDACTED]', 'buffer redacts secret-bearing result keys');
    passAssertEqual(buffered.result.value, '[REDACTED]', 'buffer redacts result value for a password target');
    passAssertEqual(logger.calls.logAction[0].action.params.password, '[REDACTED]',
      'automation logger receives only sanitized params');
    passAssertEqual(logger.calls.logAction[0].result.apiToken, '[REDACTED]',
      'automation logger receives only sanitized results');

    recorder.recordAction(bridgeAction({
      agentId: 'agent-5', tool: 'type',
      params: { selector: '#search', text: 'typed exactly as entered', tab_id: 11 }, tabId: 11,
      response: { success: true, text: 'ordinary result text' },
      visualReason: 'Search', client: 'Claude', isFinal: true
    }));
    await recorder._drainForTests();
    passAssertEqual(logger.calls.saveSession.length, 1, 'sanitized session closed and saved');
    const savedHistory = logger.calls.saveSession[0].sessionData.actionHistory;
    passAssertEqual(savedHistory[0].params.password, '[REDACTED]', 'history keeps the password redacted');
    passAssertEqual(savedHistory[0].result.apiToken, '[REDACTED]', 'history keeps the result token redacted');
    passAssertEqual(savedHistory[1].params.text, 'typed exactly as entered',
      'ordinary replay-critical typed text remains exact');
    passAssertEqual(savedHistory[1].result.text, 'ordinary result text',
      'ordinary non-secret action results remain exact');
    passAssertEqual(originalParams.password, 'hunter2',
      'caller params object is not mutated while cloning for replay');
    passAssertEqual(originalParams.text, 'hunter2', 'caller sensitive text remains unchanged');
    passAssertEqual(originalResult.apiToken, 'result-secret', 'caller result object remains unchanged');

    const ordinaryPinSubstrings = [
      { metadata: { selector: '#shipping-address' }, key: 'text', value: '123 Main St' },
      { metadata: { label: 'Shopping preferences' }, key: 'value', value: 'Weekly delivery' },
      { metadata: { placeholder: 'Share your opinion' }, key: 'text', value: 'Keep this exact' }
    ];
    ordinaryPinSubstrings.forEach(function (fixture) {
      const params = Object.assign({}, fixture.metadata, { [fixture.key]: fixture.value });
      const clonedParams = recorder.cloneParamsForReplay(params);
      const clonedResult = recorder.cloneResultForReplay({ value: fixture.value }, params);
      passAssertEqual(clonedParams[fixture.key], fixture.value,
        Object.values(fixture.metadata)[0] + ' remains replayable');
      passAssertEqual(clonedResult.value, fixture.value,
        Object.values(fixture.metadata)[0] + ' does not redact ordinary results');
    });

    const sensitivePinTargets = [
      { selector: '#pin' },
      { name: 'pin_code' },
      { field: 'payment-pin' },
      { field: 'paymentPin' },
      { label: 'PINCode' }
    ];
    sensitivePinTargets.forEach(function (metadata) {
      const params = Object.assign({}, metadata, { value: '1234' });
      passAssertEqual(recorder.cloneParamsForReplay(params).value, '[REDACTED]',
        Object.values(metadata)[0] + ' redacts replay input');
      passAssertEqual(recorder.cloneResultForReplay({ value: '1234' }, params).value, '[REDACTED]',
        Object.values(metadata)[0] + ' redacts replay results');
    });

    const sensitiveCardTargets = [
      { autocomplete: 'cc-number' },
      { selector: 'input[autocomplete="cc-csc"]' },
      { autocomplete: 'cc-cvc' },
      { selector: 'input[autocomplete="cc-cvv"]' }
    ];
    sensitiveCardTargets.forEach(function (metadata) {
      const params = Object.assign({}, metadata, { text: '4111111111111111' });
      const result = { typed: '4111111111111111', actualValue: '4111111111111111' };
      passAssertEqual(recorder.cloneParamsForReplay(params).text, '[REDACTED]',
        Object.values(metadata)[0] + ' redacts payment input');
      passAssertEqual(recorder.cloneResultForReplay(result, params).typed, '[REDACTED]',
        Object.values(metadata)[0] + ' redacts typed payment results');
      passAssertEqual(recorder.cloneResultForReplay(result, params).actualValue, '[REDACTED]',
        Object.values(metadata)[0] + ' redacts echoed payment values');
    });

    ['cc-name', 'cc-exp'].forEach(function (autocomplete) {
      const params = { autocomplete, text: 'replay exactly' };
      passAssertEqual(recorder.cloneParamsForReplay(params).text, 'replay exactly',
        autocomplete + ' remains replayable');
      passAssertEqual(recorder.cloneResultForReplay({ value: 'replay exactly' }, params).value, 'replay exactly',
        autocomplete + ' does not redact ordinary results');
    });

    const opaquePasswordResult = recorder.cloneResultForReplay({
      success: false,
      typed: 'opaque-password',
      actualValue: 'opaque-password',
      expectedValue: 'opaque-password',
      finalTextContent: 'opaque-password',
      elementInfo: {
        type: 'password',
        previousValue: 'previous-password'
      }
    }, { selector: 'e12', text: 'opaque-password' });
    passAssertEqual(opaquePasswordResult.typed, '[REDACTED]',
      'result metadata redacts typed text when an opaque selector targets a password field');
    passAssertEqual(opaquePasswordResult.actualValue, '[REDACTED]',
      'result metadata redacts the echoed password value');
    passAssertEqual(opaquePasswordResult.expectedValue, '[REDACTED]',
      'result metadata redacts the failed action expected-value echo');
    passAssertEqual(opaquePasswordResult.finalTextContent, '[REDACTED]',
      'result metadata redacts the final password text');
    passAssertEqual(opaquePasswordResult.elementInfo.previousValue, '[REDACTED]',
      'result metadata redacts the prior password value');

    const benignUrl = 'https://example.com/search?q=munich%20trip#results/list';
    passAssertEqual(recorder.cloneParamsForReplay({ url: benignUrl }).url, benignUrl,
      'ordinary navigation query and SPA fragment remain byte-exact');

    const secretUrlParams = {
      url: 'https://alice:password@example.com/callback?access_token=query-secret&view=summary#access_token=fragment-secret'
    };
    const sanitizedSecretUrl = 'https://example.com/callback?view=summary';
    passAssertEqual(recorder.cloneParamsForReplay(secretUrlParams).url, sanitizedSecretUrl,
      'URL userinfo plus token query and fragment are removed while benign query state remains');
    passAssertEqual(secretUrlParams.url,
      'https://alice:password@example.com/callback?access_token=query-secret&view=summary#access_token=fragment-secret',
      'URL sanitization does not mutate caller-owned params');
    passAssertEqual(
      recorder.cloneParamsForReplay({ url: 'https://example.com/callback?code=oauth-secret&view=summary' }).url,
      'https://example.com/callback?view=summary',
      'OAuth authorization codes are removed from recorded navigation URLs');
    passAssertEqual(
      recorder.cloneParamsForReplay({
        url: 'https://storage.example.com/file?X-Amz-Signature=signed-secret&X-Amz-Date=20260720T000000Z&view=summary'
      }).url,
      'https://storage.example.com/file?view=summary',
      'signed-storage parameters are removed without dropping benign query state');
    passAssertEqual(
      recorder.cloneParamsForReplay({
        url: 'https://account.blob.core.windows.net/file?sv=2026-01-01&se=2026-07-21&sp=r&sig=azure-secret&view=summary'
      }).url,
      'https://account.blob.core.windows.net/file?view=summary',
      'Azure SAS signatures and companion parameters are removed together');
    passAssertEqual(
      recorder.cloneParamsForReplay({ url: 'https://example.com/#/callback?code=fragment-code' }).url,
      'https://example.com/',
      'SPA callback fragments carrying OAuth codes are removed');
    passAssertEqual(
      recorder.cloneParamsForReplay({ url: 'https://example.com/#ghp_abcdefghijklmnopqrstuvwxyz123456' }).url,
      'https://example.com/',
      'opaque token-shaped fragments are removed');
    passAssertEqual(
      recorder.cloneParamsForReplay({ url: 'https://example.com/login/ghp_abcdefghijklmnopqrstuvwxyz123456/end' }).url,
      'https://example.com/login/:token/end',
      'recognizable credential path segments are masked');
    passAssertEqual(recorder.cloneParamsForReplay({ url: 'not a valid URL' }).url, '[REDACTED]',
      'malformed URL-like replay fields fail closed');

    const urlSection = await freshSection();
    const failedPasswordResponse = {
      success: false,
      typed: 'opaque-password',
      actualValue: 'opaque-password',
      expectedValue: 'opaque-password',
      elementInfo: { type: 'password', previousValue: 'prior-password' }
    };
    recorder.recordAction(bridgeAction({
      agentId: 'agent-url-redaction', tool: 'type',
      params: { tab_id: 12, selector: 'e42', text: 'opaque-password' }, tabId: 12,
      response: failedPasswordResponse, success: false,
      visualReason: 'Sign in safely', client: 'Codex'
    }));
    recorder.recordAction(bridgeAction({
      agentId: 'agent-url-redaction', tool: 'navigate', params: {
        tab_id: 12,
        url: secretUrlParams.url
      }, tabId: 12, visualReason: 'Sign in safely', client: 'Codex'
    }));
    await recorder._drainForTests();
    const redactedRecord = urlSection.storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY]
      .records['agent-url-redaction::12'];
    passAssertEqual(redactedRecord.actionHistory[0].params.text, '[REDACTED]',
      'response password metadata redacts opaque-selector request text in the session buffer');
    passAssertEqual(redactedRecord.actionHistory[0].result.expectedValue, '[REDACTED]',
      'failed password expectedValue is redacted in the session buffer');
    passAssertEqual(urlSection.logger.calls.logAction[0].action.params.text, '[REDACTED]',
      'automation logger receives redacted opaque-selector password params');
    passAssertEqual(urlSection.logger.calls.logAction[0].result.expectedValue, '[REDACTED]',
      'automation logger receives a redacted expectedValue');
    passAssertEqual(redactedRecord.actionHistory[1].params.url, sanitizedSecretUrl,
      'session buffer receives only the sanitized navigation URL');
    passAssertEqual(urlSection.logger.calls.logAction[1].action.params.url, sanitizedSecretUrl,
      'automation logger receives only the sanitized navigation URL');
    passAssertEqual(redactedRecord.lastUrl, sanitizedSecretUrl,
      'open-session lastUrl stores only the sanitized navigation URL');

    recorder.recordAction(bridgeAction({
      agentId: 'agent-url-redaction', tool: 'click', params: { tab_id: 12, selector: '#done' }, tabId: 12,
      visualReason: 'Sign in safely', client: 'Codex', isFinal: true
    }));
    await recorder._drainForTests();
    passAssertEqual(urlSection.logger.calls.saveSession[0].sessionData.lastUrl, sanitizedSecretUrl,
      'closed session history receives only the sanitized lastUrl');
    passAssertEqual(urlSection.logger.calls.saveSession[0].sessionData.actionHistory[1].params.url, sanitizedSecretUrl,
      'closed session replay history receives only the sanitized navigation URL');
  }

  // -- Test 9: recorder never throws --------------------------------------------
  console.log('\n--- Test 9: recorder never throws (throwing storage + logger) ---');
  {
    recorder._resetForTests();
    recorder._setStorageShim(makeThrowingStorageShim());
    const time = makeTimeShim(1750000000000);
    recorder._setTimeShim(time.shim);
    globalThis.automationLogger = makeLoggerStub({ throwing: true });
    globalThis.extractAndStoreMemories = makeMemoriesStub();
    let threw = false;
    let returned = 'sentinel';
    let returnedAction = 'sentinel';
    try {
      returnedAction = recorder.recordAction(bridgeAction({
        agentId: 'agent-7', tool: 'click', params: { tab_id: 1 }, tabId: 1,
        visualReason: 'Hostile shims', client: 'Claude'
      }));
      recorder.recordAction(bridgeAction({
        agentId: 'agent-7', tool: 'click', params: { tab_id: 1 }, tabId: 1,
        visualReason: 'Hostile shims', client: 'Claude', isFinal: true
      }));
      recorder.recordAction(null);
      recorder.recordAction(42);
      recorder.recordAction({});
      returned = recorder.recordDispatch(readDispatch({ agentId: 'agent-7', tool: 'mcp:read-page' }));
      recorder.recordDispatch(null);
      recorder.recordDispatch(42);
      recorder.recordDispatch({});
      recorder.recordDispatch({ tool: 'click', requestPayload: null });
    } catch (_e) {
      threw = true;
    }
    await recorder._drainForTests();
    passAssertEqual(threw, false, 'recordAction/recordDispatch never throw under throwing storage/logger shims');
    passAssertEqual(returned, undefined, 'recordDispatch returns undefined (fire-and-forget contract)');
    passAssertEqual(returnedAction, undefined, 'recordAction returns undefined (fire-and-forget contract)');

    // Hook-site contract: each site wrapped in its OWN try/catch.
    const dispatcherSrc = fs.readFileSync(DISPATCHER_PATH, 'utf8');
    const dispatcherGuards = (dispatcherSrc.match(/never let session recording break dispatch/g) || []).length;
    passAssertEqual(dispatcherGuards, 1,
      'the dispatcher message-route hook carries its own defence-in-depth catch');
    const bridgeSrc = fs.readFileSync(BRIDGE_CLIENT_PATH, 'utf8');
    const bridgeGuards = (bridgeSrc.match(/never let session recording break the action/g) || []).length;
    passAssertEqual(bridgeGuards, 1,
      'the bridge action tap carries its own defence-in-depth catch');
  }

  // -- Test 10: source-pin guards -------------------------------------------------
  console.log('\n--- Test 10: source-pin guards (bridge tap + dispatcher hook + SW load line) ---');
  {
    const dispatcherSrc = fs.readFileSync(DISPATCHER_PATH, 'utf8');
    const bridgeSrc = fs.readFileSync(BRIDGE_CLIENT_PATH, 'utf8');

    // Dispatcher: exactly ONE session-recorder site -- the message route.
    // The tool route must stay session-clean: all of its action traffic
    // originates in _handleExecuteAction (which records at the bridge tap),
    // so a second site here would double-count every background action.
    const sessionSitePattern = /spreadsheetRedactor\.recordSafely\([\s\S]*?globalThis\.fsbMcpSessionRecorder,[\s\S]*?'recordDispatch',[\s\S]*?sessionRecordEntry[\s\S]*?\);/g;
    const sessionSites = dispatcherSrc.match(sessionSitePattern) || [];
    passAssertEqual(sessionSites.length, 1,
      'exactly 1 redacted recordDispatch ingress in mcp-tool-dispatcher.js (message route only)');
    const sessionEntryStart = dispatcherSrc.indexOf('var sessionRecordEntry = {');
    const sessionIngressEnd = dispatcherSrc.indexOf("'recordDispatch'", sessionEntryStart);
    const sessionIngressSpan = sessionEntryStart === -1 || sessionIngressEnd === -1
      ? ''
      : dispatcherSrc.slice(sessionEntryStart, sessionIngressEnd);
    passAssert(sessionIngressSpan.includes('resolveMcpClientLabel(payload)'),
      'the message-route session site calls resolveMcpClientLabel(payload)');

    const msgRouteIdx = dispatcherSrc.indexOf('async function dispatchMcpMessageRoute');
    passAssert(msgRouteIdx !== -1, 'dispatchMcpMessageRoute found in the dispatcher');
    const firstSessionMention = dispatcherSrc.indexOf('fsbMcpSessionRecorder.recordDispatch');
    passAssert(firstSessionMention > msgRouteIdx,
      'no session-recorder recordDispatch before dispatchMcpMessageRoute (tool route is session-clean)');

    const gateNeedle = 'if (!_mcpMetricsSuppressInner) {';
    const gateCount = dispatcherSrc.split(gateNeedle).length - 1;
    passAssertEqual(gateCount, 1, 'exactly one !_mcpMetricsSuppressInner gate in the dispatcher');
    const gateIdx = dispatcherSrc.indexOf(gateNeedle);
    const sessionCallIdx = dispatcherSrc.indexOf('spreadsheetRedactor.recordSafely(');
    passAssert(sessionCallIdx > gateIdx,
      'message-route session site sits INSIDE the !_mcpMetricsSuppressInner gate (alias double-count guard)');

    // The original metrics pins are undisturbed (Test 9 of
    // mcp-dispatcher-client-label.test.js must keep matching exactly 2).
    const metricsSitePattern = /globalThis\.fsbMcpMetricsRecorder\.recordDispatch\(\{[\s\S]*?\}\);/g;
    const metricsSites = dispatcherSrc.match(metricsSitePattern) || [];
    passAssertEqual(metricsSites.length, 2, 'fsbMcpMetricsRecorder pattern still matches exactly 2 sites');
    for (let i = 0; i < metricsSites.length; i++) {
      passAssert(metricsSites[i].includes('resolveMcpClientLabel(payload)'),
        'metrics site #' + (i + 1) + ' still calls resolveMcpClientLabel(payload)');
      passAssert(!metricsSites[i].includes('fsbMcpSessionRecorder'),
        'metrics site #' + (i + 1) + ' span does NOT swallow a session-recorder call');
    }

    // Bridge tap: exactly ONE recordAction call site, reached from exactly
    // THREE _handleExecuteAction branches (main path + open_tab/switch_tab
    // bootstrap + navigate NO_OWNED_TAB recovery).
    const recordActionSites = bridgeSrc.match(/spreadsheetRedactor\.recordSafely\([\s\S]*?globalThis\.fsbMcpSessionRecorder,[\s\S]*?'recordAction',[\s\S]*?sessionRecordEntry[\s\S]*?\);/g) || [];
    passAssertEqual(recordActionSites.length, 1,
      'exactly 1 redacted recordAction ingress in mcp-bridge-client.js');
    const actionEntryStart = bridgeSrc.indexOf('let sessionRecordEntry = {');
    const actionIngressEnd = bridgeSrc.indexOf("'recordAction'", actionEntryStart);
    const actionIngressSpan = actionEntryStart === -1 || actionIngressEnd === -1
      ? ''
      : bridgeSrc.slice(actionEntryStart, actionIngressEnd);
    passAssert(actionIngressSpan.includes('resolveMcpClientLabel(payload)'),
      'the bridge tap resolves the canonical client label');
    const tapInvocations = (bridgeSrc.match(/this\._recordMcpSessionAction\(/g) || []).length;
    passAssertEqual(tapInvocations, 3,
      'the tap fires from exactly 3 _handleExecuteAction branches');

    // The 4500-char source gates in tests/action-tool-agent-scoped.test.js
    // and tests/ownership-error-codes.test.js slice from
    // 'async _handleExecuteAction' and require resolveAgentTabOrError inside;
    // insertions ahead of the resolver eat that budget. Fail HERE, loudly,
    // instead of letting those suites degrade to silent skips.
    const eaStart = bridgeSrc.indexOf('async _handleExecuteAction');
    passAssert(eaStart !== -1, '_handleExecuteAction found in mcp-bridge-client.js');
    const resolverOffset = bridgeSrc.indexOf('resolveAgentTabOrError', eaStart) - eaStart;
    passAssert(resolverOffset > -1 && resolverOffset < 4500,
      'resolveAgentTabOrError within 4500 chars of _handleExecuteAction (offset ' + resolverOffset + ')');

    const bgSource = fs.readFileSync(BACKGROUND_PATH, 'utf8');
    const loadLines = bgSource.split('\n').filter(function (line) {
      return line.includes("importScripts('utils/mcp-session-recorder.js')");
    });
    passAssertEqual(loadLines.length, 1, 'background.js loads utils/mcp-session-recorder.js on exactly one line');
    passAssert(bgSource.indexOf("importScripts('utils/automation-logger.js')") <
      bgSource.indexOf("importScripts('utils/mcp-session-recorder.js')"),
    'background.js loads the shared logger mutation chain before recorder initialization');
  }

  // -- Test 11: eviction restore (expired closes, live rehydrates) ----------------
  console.log('\n--- Test 11: eviction restore from the fsbMcpSessionBuffer envelope ---');
  {
    const { storage, time, alarms, logger } = await freshSection(1750000100000);
    const T = time.now();
    storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY] = {
      v: 1,
      records: {
        'agent-x::1': {
          sessionId: 'session_100', agentId: 'agent-x', tabId: 1,
          task: 'Old task', client: 'Codex',
          startTime: T - 120000, lastActivityAt: T - 70000, deadlineAt: T - 10000,
          lastUrl: 'https://old.example.com/a',
          visualReasons: ['Old task'],
          actionHistory: [{ tool: 'click', params: {}, result: { success: true }, timestamp: T - 70000 }],
          sawActionTool: true
        },
        'agent-y::2': {
          sessionId: 'session_200', agentId: 'agent-y', tabId: 2,
          task: 'Live task', client: 'Claude',
          startTime: T - 40000, lastActivityAt: T - 30000, deadlineAt: T + 30000,
          lastUrl: null,
          visualReasons: ['Live task'],
          actionHistory: [{ tool: 'click', params: {}, result: { success: true }, timestamp: T - 30000 }],
          sawActionTool: true
        }
      }
    };
    await recorder._restoreFromBuffer();
    await drainMicrotasks();

    passAssertEqual(logger.calls.saveSession.length, 1, 'expired session closed (saveSession called) on restore');
    passAssertEqual(logger.calls.saveSession[0].sessionId, 'session_100', 'the EXPIRED session is the one persisted');
    passAssertEqual(logger.calls.saveSession[0].sessionData.mode, 'mcp-agent', 'restored close keeps mcp-agent mode');
    passAssertEqual(logger.calls.saveSession[0].sessionData.mcpClient, 'Codex', 'restored close keeps the client label');
    passAssertEqual(logger.calls.saveSession[0].sessionData.status, 'expired',
      'restored expired session keeps the expired status');
    passAssertEqual(logger.calls.saveSession[0].sessionData.outcome, 'stopped',
      'restored expired session is not reported as successful');
    passAssertEqual(logger.calls.logSessionStart.length, 1,
      'empty post-eviction log buffer re-seeded so the saveSession gate passes');
    const open = recorder._peekOpenSessions();
    passAssertEqual(Object.keys(open).length, 1, 'live session rehydrated into the map');
    passAssert(open['agent-y::2'] && open['agent-y::2'].sessionId === 'session_200',
      'live session record intact after restore');
    passAssert([...alarms.alarms.keys()].some((name) => name.startsWith(recorder.FSB_MCP_SESSION_ALARM_PREFIX + 'idle:')),
      'storage-backed idle alarm re-armed for the live session');

    time.advance(31000); // past the live session's remaining window
    await alarms.fireDue();
    passAssertEqual(logger.calls.saveSession.length, 2, 'live session closes when its restored deadline passes');
    passAssertEqual(logger.calls.saveSession[1].sessionId, 'session_200', 'live session persisted on expiry');
    passAssertEqual(logger.calls.saveSession[1].sessionData.status, 'expired',
      'rehydrated live session later persists as expired');
    passAssertEqual(logger.calls.saveSession[1].sessionData.outcome, 'stopped',
      'rehydrated expiry maps to stopped');
    await drainMicrotasks();
    passAssertEqual(storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY], undefined,
      'buffer storage key REMOVED once no open sessions remain');
  }

  // -- Test 12: malformed / wrong-version envelope treated as empty ----------------
  console.log('\n--- Test 12: malformed envelope collapses to canonical empty ---');
  {
    const { storage, logger } = await freshSection();
    storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY] = {
      v: 99,
      records: {
        'agent-z::1': {
          sessionId: 'session_300', agentId: 'agent-z', tabId: 1,
          task: 'Wrong version', client: 'Claude',
          startTime: 1, lastActivityAt: 1, deadlineAt: 1,
          visualReasons: [], actionHistory: [{ tool: 'click', params: {}, result: { success: true }, timestamp: 1 }],
          sawActionTool: true
        }
      }
    };
    await recorder._restoreFromBuffer();
    await drainMicrotasks();
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0,
      'wrong-version envelope restores nothing');
    passAssertEqual(logger.calls.saveSession.length, 0, 'wrong-version envelope persists nothing');

    storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY] = 'not-an-object';
    await recorder._restoreFromBuffer();
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0,
      'malformed (non-object) envelope restores nothing');
  }

  // -- Test 13: tab identity precedence (review finding #1) ------------------------
  console.log('\n--- Test 13: tab identity -- snake_case tab_id, explicit precedence, no collapse ---');
  {
    await freshSection();
    // Wire snake_case tab_id keys the session even with NO explicit tabId
    // (e.g. a future recordDispatch caller without the resolved id).
    recorder.recordAction(bridgeAction({
      agentId: 'agent-8', tool: 'click', params: { tab_id: 42, selector: '#a' },
      visualReason: 'Wire snake_case tab', client: 'Claude'
    }));
    await recorder._drainForTests();
    let keys = Object.keys(recorder._peekOpenSessions());
    passAssertEqual(keys.length, 1, 'snake_case-only dispatch opened one session');
    passAssertEqual(keys[0], 'agent-8::42', 'params.tab_id keys the session -- no agentId::none collapse');

    // Explicit resolved tabId wins over params.
    await freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-8', tool: 'click', params: { tab_id: 99 }, tabId: 42,
      visualReason: 'Resolver beats raw params', client: 'Claude'
    }));
    await recorder._drainForTests();
    keys = Object.keys(recorder._peekOpenSessions());
    passAssertEqual(keys[0], 'agent-8::42', 'explicit resolved tabId takes precedence over params.tab_id');

    // camelCase back-compat (dispatcher-injected routeParams shape).
    await freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-8', tool: 'click', params: { tabId: 13 },
      visualReason: 'Legacy camelCase param', client: 'Claude'
    }));
    await recorder._drainForTests();
    keys = Object.keys(recorder._peekOpenSessions());
    passAssertEqual(keys[0], 'agent-8::13', 'camelCase params.tabId still keys the session (back-compat)');

    // The review's headline scenario: one agent, two tabs -> two sessions.
    const { logger } = await freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-m', tool: 'click', params: { tab_id: 1 }, tabId: 1,
      visualReason: 'Tab one work', client: 'Claude'
    }));
    recorder.recordAction(bridgeAction({
      agentId: 'agent-m', tool: 'click', params: { tab_id: 2 }, tabId: 2,
      visualReason: 'Tab two work', client: 'Claude'
    }));
    await recorder._drainForTests();
    const open = recorder._peekOpenSessions();
    passAssertEqual(Object.keys(open).length, 2,
      'same agent driving two tabs holds two DISTINCT open sessions (no merge)');
    passAssert(open['agent-m::1'] && open['agent-m::2'], 'sessions keyed agent-m::1 and agent-m::2');

    recorder.recordDispatch(readDispatch({ agentId: 'agent-m', tool: 'mcp:read-page', tab_id: 1 }));
    recorder.recordDispatch(readDispatch({ agentId: 'agent-m', tool: 'mcp:get-dom', payloadTabId: 2 }));
    recorder.recordDispatch(readDispatch({
      agentId: 'agent-m', tool: 'mcp:read-page', params: { tabId: 2 }, tab_id: 1
    }));
    recorder.recordDispatch(readDispatch({
      agentId: 'agent-m', tool: 'mcp:get-dom', params: { tab_id: 2 }, entryTabId: 1
    }));
    recorder.recordDispatch(readDispatch({ agentId: 'agent-m', tool: 'mcp:read-page', tab_id: 999 }));
    await recorder._drainForTests();
    const attributed = recorder._peekOpenSessions();
    passAssertEqual(attributed['agent-m::1'].actionHistory.length, 3,
      'top-level payload tab_id and entry.tabId reads join tab 1 exactly');
    passAssertEqual(attributed['agent-m::2'].actionHistory.length, 3,
      'top-level payload tabId and nested params.tabId reads join tab 2 exactly');
    passAssertEqual(attributed['agent-m::2'].actionHistory[2].tool, 'mcp:read-page',
      'nested tab identity takes precedence over a conflicting top-level payload id');
    passAssertEqual(attributed['agent-m::1'].actionHistory[2].tool, 'mcp:get-dom',
      'entry.tabId takes precedence over a conflicting nested tab identity');
    passAssertEqual(attributed['agent-m::1'].actionHistory.length + attributed['agent-m::2'].actionHistory.length, 6,
      'unknown explicit tab identity is ignored instead of falling back to another tab');
    passAssertEqual(logger.calls.saveSession.length, 0, 'no spurious close while both tabs are active');
  }

  // -- Test 14: bootstrap birth (open_tab/switch_tab post-dispatch tabId) ----------
  console.log('\n--- Test 14: bootstrap birth with post-dispatch resolved tabId ---');
  {
    const { logger } = await freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-b', tool: 'open_tab', params: {},
      visualReason: 'Open a fresh tab for research', client: 'Claude',
      response: { success: true, tabId: 7 }, tabId: 7
    }));
    await recorder._drainForTests();
    const open = recorder._peekOpenSessions();
    const keys = Object.keys(open);
    passAssertEqual(keys.length, 1, 'bootstrap action opened one session');
    passAssertEqual(keys[0], 'agent-b::7',
      'empty wire params + post-dispatch tabId key the session (no agentId::none)');
    passAssertEqual(logger.calls.logSessionStart[0].tabId, 7, 'logSessionStart got the post-dispatch tabId');
    passAssertEqual(open['agent-b::7'].actionHistory[0].tool, 'open_tab',
      'non-replayable wire verb stored verbatim (replay filter drops it downstream)');
  }

  // -- Test 15: replay-name map (review finding #2) ---------------------------------
  console.log('\n--- Test 15: go_back/go_forward stored as replay whitelist names ---');
  {
    const { logger } = await freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-h', tool: 'go_back', params: { tab_id: 4 }, tabId: 4,
      visualReason: 'Back to the results list', client: 'Claude'
    }));
    recorder.recordAction(bridgeAction({
      agentId: 'agent-h', tool: 'go_forward', params: { tab_id: 4 }, tabId: 4,
      visualReason: 'Forward again', client: 'Claude'
    }));
    recorder.recordAction(bridgeAction({
      agentId: 'agent-h', tool: 'cdpClickAt', params: { x: 10, y: 20, tab_id: 4 }, tabId: 4,
      visualReason: 'Click the canvas point', client: 'Claude'
    }));
    recorder.recordAction(bridgeAction({
      agentId: 'agent-h', tool: 'navigate', params: { tab_id: 4, url: 'https://example.com/done' }, tabId: 4,
      visualReason: 'Wrap up', client: 'Claude', isFinal: true
    }));
    await recorder._drainForTests();
    passAssertEqual(logger.calls.saveSession.length, 1, 'mapping session closed and saved');
    const tools = logger.calls.saveSession[0].sessionData.actionHistory.map(function (a) { return a.tool; });
    passAssertEqual(tools[0], 'goBack', "wire 'go_back' stored as replay name 'goBack'");
    passAssertEqual(tools[1], 'goForward', "wire 'go_forward' stored as replay name 'goForward'");
    passAssertEqual(tools[2], 'cdpClickAt', 'cdp verb stored verbatim (legitimately non-replayable)');
    passAssertEqual(tools[3], 'navigate', 'already-compatible wire verb stored verbatim');
    passAssertEqual(logger.calls.logAction[0].action.tool, 'goBack',
      'logAction agrees with actionHistory on the mapped name');

    // Pin the whitelist side of the contract: the mapped names exist in
    // background.js loadReplayableSession's set literal, the wire names do
    // not (which is exactly why the map is required).
    const bgSource = fs.readFileSync(BACKGROUND_PATH, 'utf8');
    const wlMatch = bgSource.match(/replayableTools = new Set\(\[[\s\S]*?\]\)/);
    passAssert(!!wlMatch, 'replayableTools set literal found in background.js');
    passAssert(!!wlMatch && wlMatch[0].indexOf("'goBack'") !== -1 && wlMatch[0].indexOf("'goForward'") !== -1,
      'replay whitelist contains the mapped names goBack/goForward');
    passAssert(!!wlMatch && wlMatch[0].indexOf("'go_back'") === -1,
      'replay whitelist does NOT contain wire name go_back (mapping is required)');
  }

  // -- Test 16: failure semantics + sidecar-less action calls -----------------------
  console.log('\n--- Test 16: failed actions append; sidecar-less recordAction joins, never births ---');
  {
    const { logger } = await freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-f', tool: 'click', params: { tab_id: 3 }, tabId: 3,
      visualReason: 'Try a flaky button', client: 'Claude'
    }));
    recorder.recordAction(bridgeAction({
      agentId: 'agent-f', tool: 'click', params: { tab_id: 3 }, tabId: 3,
      visualReason: 'Try a flaky button', client: 'Claude',
      response: { success: false, error: 'element not found' }, success: false
    }));
    await recorder._drainForTests();
    let rec = recorder._peekOpenSessions()['agent-f::3'];
    passAssertEqual(rec.actionHistory.length, 2, 'failed action still appended to the history');
    passAssertEqual(rec.actionHistory[1].result.success, false,
      'failure result preserved (replay filter excludes it downstream)');

    // Sidecar-less action-path call (defensive shape) JOINs the open session.
    recorder.recordAction(bridgeAction({
      agentId: 'agent-f', tool: 'get_text', params: { tab_id: 3 }, tabId: 3, noSidecar: true
    }));
    await recorder._drainForTests();
    rec = recorder._peekOpenSessions()['agent-f::3'];
    passAssertEqual(rec.actionHistory.length, 3, 'sidecar-less action-path call JOINs the open session');

    // ...but never births for an agent with no open session.
    recorder.recordAction(bridgeAction({
      agentId: 'agent-fresh', tool: 'get_text', params: {}, tabId: 5, noSidecar: true
    }));
    await recorder._drainForTests();
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 1,
      'sidecar-less call for an unknown agent births nothing');
    passAssertEqual(logger.calls.saveSession.length, 0, 'no close fired during Test 16');
  }

  // -- Test 17: recording policy opt-out + mid-session disable ---------------------
  console.log('\n--- Test 17: recording opt-out flushes open work and rejects future events ---');
  {
    const { logger } = await freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-policy', tool: 'type', params: { tab_id: 6, text: 'keep this' }, tabId: 6,
      visualReason: 'Policy transition', client: 'Codex'
    }));
    await recorder._drainForTests();
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 1,
      'session is open before recording is disabled');

    await recorder._applyPolicyForTests(false, 45);
    await recorder._drainForTests();
    passAssertEqual(logger.calls.saveSession.length, 1,
      'disabling recording flushes the currently open session');
    passAssertEqual(logger.calls.saveSession[0].sessionData.actionHistory[0].params.text, 'keep this',
      'mid-session disable preserves the already-recorded raw action');
    passAssertEqual(logger.calls.saveSession[0].sessionData.status, 'stopped',
      'mid-session disable persists a stopped status');
    passAssertEqual(logger.calls.saveSession[0].sessionData.outcome, 'stopped',
      'mid-session disable does not claim task success');
    passAssertEqual(logger.calls.saveSession[0].sessionData.outcomeDetails.reason, 'recording_disabled',
      'mid-session disable preserves its close reason');
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0,
      'flush removes all open recorder state');
    passAssertEqual(recorder._getPolicyForTests().retentionDays, 45,
      'custom retention policy is applied');

    recorder.recordAction(bridgeAction({
      agentId: 'agent-policy', tool: 'click', params: { tab_id: 6 }, tabId: 6,
      visualReason: 'Ignored after opt-out', client: 'Codex', isFinal: true
    }));
    await recorder._drainForTests();
    passAssertEqual(logger.calls.saveSession.length, 1,
      'new MCP events are ignored while recording is disabled');
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0,
      'disabled recording cannot birth a new session');
    passAssert(logger.calls.pruneMcpSessions.includes(45),
      'policy change immediately requests MCP-only retention pruning');
  }

  // -- Test 18: startup restore ordering -------------------------------------------
  console.log('\n--- Test 18: startup initialization queues live events behind restore ---');
  {
    const { storage, time } = await freshSection(1750000200000);
    const T = time.now();
    storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY] = {
      v: 1,
      records: {
        'agent-race::8': {
          sessionId: 'session_400', agentId: 'agent-race', tabId: 8,
          task: 'Restore then append', client: 'Codex',
          startTime: T - 1000, lastActivityAt: T - 500, deadlineAt: T + 30000,
          lastUrl: null, visualReasons: ['Restore then append'],
          actionHistory: [{ tool: 'click', params: { tab_id: 8 }, result: { success: true }, timestamp: T - 500 }],
          sawActionTool: true
        }
      }
    };
    const baseGet = storage.get;
    let releaseStorageGet;
    const storageGate = new Promise((resolve) => { releaseStorageGet = resolve; });
    storage.get = function (keys) {
      return storageGate.then(function () { return baseGet(keys); });
    };

    const initializing = recorder._startInitializationForTests();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-race', tool: 'type', params: { tab_id: 8, text: 'live event' }, tabId: 8,
      visualReason: 'Restore then append', client: 'Codex'
    }));
    await drainMicrotasks();
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0,
      'live event waits while startup storage restore is unresolved');

    releaseStorageGet();
    await initializing;
    await recorder._drainForTests();
    const restored = recorder._peekOpenSessions()['agent-race::8'];
    passAssert(restored && restored.actionHistory.length === 2,
      'restored action and queued live action both survive startup');
    passAssertEqual(restored.actionHistory[0].tool, 'click',
      'buffered action remains first in event order');
    passAssertEqual(restored.actionHistory[1].params.text, 'live event',
      'live action appends after restore instead of being overwritten by stale state');
    const persisted = storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY];
    passAssertEqual(persisted.records['agent-race::8'].actionHistory.length, 2,
      'final storage envelope contains both ordered actions');
  }

  // -- Test 19: durable alarm namespace + rearming -------------------------------
  console.log('\n--- Test 19: chrome.alarms rearm, daily prune, and background routing ---');
  {
    const { time, alarms, logger } = await freshSection(1750000300000);
    recorder.recordAction(bridgeAction({
      agentId: 'agent-alarm', tool: 'click', params: { tab_id: 4 }, tabId: 4,
      visualReason: 'Alarm test', client: 'Claude'
    }));
    await recorder._drainForTests();
    const idleCreates1 = alarms.calls.create.filter((call) => call.name.includes(':idle:'));
    passAssertEqual(idleCreates1.length, 1, 'first recorded action creates one durable idle alarm');
    const firstWhen = idleCreates1[0].info.when;

    time.advance(5000);
    recorder.recordDispatch(readDispatch({ agentId: 'agent-alarm', tool: 'mcp:read-page', tab_id: 4 }));
    await recorder._drainForTests();
    const idleCreates2 = alarms.calls.create.filter((call) => call.name.includes(':idle:'));
    passAssertEqual(idleCreates2.length, 2, 'recorded read re-arms the same idle alarm');
    passAssertEqual(idleCreates2[0].name, idleCreates2[1].name,
      'rearm uses a stable session-scoped alarm name');
    passAssertEqual(idleCreates2[1].info.when, firstWhen + 5000,
      'rearmed alarm moves to the new sliding deadline');

    await recorder.handleAlarm({ name: recorder.FSB_MCP_SESSION_RETENTION_ALARM });
    await recorder._drainForTests();
    passAssert(logger.calls.pruneMcpSessions.includes(30),
      'daily retention alarm requests pruning with the default policy');

    const recorderSource = fs.readFileSync(RECORDER_PATH, 'utf8');
    passAssert(!/\bsetTimeout\s*\(/.test(recorderSource),
      'recorder contains no service-worker setTimeout idle timer');
    const backgroundSource = fs.readFileSync(BACKGROUND_PATH, 'utf8');
    passAssert(backgroundSource.includes('fsbMcpSessionRecorder.handleAlarm(alarm)'),
      'existing background alarm listener routes the recorder namespace');
  }

  // -- Test 20: persisted startup opt-out -----------------------------------------
  console.log('\n--- Test 20: persisted startup opt-out loads before buffered sessions ---');
  {
    const { storage, localStorage, time, alarms, logger } = await freshSection(1750000400000);
    const T = time.now();
    localStorage.store[recorder.FSB_MCP_RECORDING_ENABLED_KEY] = false;
    localStorage.store[recorder.FSB_MCP_RETENTION_DAYS_KEY] = 12;
    storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY] = {
      v: 1,
      records: {
        'agent-disabled::3': {
          sessionId: 'session_500', agentId: 'agent-disabled', tabId: 3,
          task: 'Flush on disabled startup', client: 'Claude',
          startTime: T - 1000, lastActivityAt: T - 500, deadlineAt: T + 30000,
          lastUrl: null, visualReasons: ['Flush on disabled startup'],
          actionHistory: [{ tool: 'click', params: { tab_id: 3 }, result: { success: true }, timestamp: T - 500 }],
          sawActionTool: true
        }
      }
    };

    await recorder._startInitializationForTests();
    await recorder._drainForTests();
    const policy = recorder._getPolicyForTests();
    passAssertEqual(policy.recordingEnabled, false, 'startup loads the persisted recording opt-out');
    passAssertEqual(policy.retentionDays, 12, 'startup loads the persisted custom retention');
    passAssertEqual(logger.calls.saveSession.length, 1,
      'disabled startup flushes the buffered open recording exactly once');
    passAssertEqual(logger.calls.saveSession[0].sessionData.status, 'stopped',
      'disabled startup flush persists a stopped status');
    passAssertEqual(logger.calls.saveSession[0].sessionData.outcome, 'stopped',
      'disabled startup flush does not claim success');
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0,
      'disabled startup leaves no open recording state');
    passAssert(logger.calls.pruneMcpSessions.includes(12),
      'startup pruning uses the persisted custom retention');
    const retentionCreatesBefore = alarms.calls.create.filter((call) =>
      call.name === recorder.FSB_MCP_SESSION_RETENTION_ALARM).length;
    await recorder._applyPolicyForTests(false, 12);
    await recorder._drainForTests();
    const retentionCreatesAfter = alarms.calls.create.filter((call) =>
      call.name === recorder.FSB_MCP_SESSION_RETENTION_ALARM).length;
    passAssertEqual(retentionCreatesAfter, retentionCreatesBefore,
      'worker/policy reinitialization does not postpone an existing daily retention alarm');
  }

  // -- Test 21: completed summary -> one provider-free local Task Memory ----------
  console.log('\n--- Test 21: client-authored completion creates one local Task Memory ---');
  {
    const { logger, memories, taskMemories } = await freshSection(1750000500000);
    recorder.recordAction(bridgeAction({
      agentId: 'agent-memory', tool: 'type',
      params: { tab_id: 7, selector: 'input[type="password"]', text: 'do-not-copy' }, tabId: 7,
      visualReason: 'Submit the report', client: 'Codex', isFinal: true
    }));
    await recorder._drainForTests();
    const sourceSessionId = logger.calls.saveSession[0].sessionId;

    recorder.recordTaskOutcome({
      tool: 'complete_task',
      params: { summary: 'Report submitted; api_key=summary-secret', tab_id: 7 },
      payload: { agentId: 'agent-memory' },
      response: { status: 'completed' }
    });
    await recorder._drainForTests();

    passAssertEqual(memories.calls.length, 0, 'completion path never invokes provider-backed extraction');
    passAssertEqual(taskMemories.calls.length, 1, 'completion stores exactly one local Task Memory');
    const memory = taskMemories.calls[0];
    passAssertEqual(memory.sourceSessionId, sourceSessionId, 'memory is idempotently keyed to the replay session');
    passAssertEqual(memory.metadata.source, 'mcp-client', 'memory source identifies the MCP client summary');
    passAssertEqual(memory.typeData.session.outcome, 'success', 'completed summary maps to success outcome');
    passAssert(memory.text.includes('[REDACTED]') && !memory.text.includes('summary-secret'),
      'obvious secret assignments are sanitized from the client summary');
    passAssert(!JSON.stringify(memory).includes('do-not-copy'), 'memory contains no raw action params or results');
    passAssertEqual(Object.keys(recorder._peekMemoryCandidates()).length, 0,
      'successful terminal outcome consumes the pending candidate');
    passAssertEqual(logger.calls.updateSessionOutcome.length, 1,
      'completion arriving after is_final patches the closed history row');
    passAssertEqual(logger.calls.updateSessionOutcome[0].sessionId, sourceSessionId,
      'closed completion patches the history row for the matched replay session');
    passAssertEqual(logger.calls.updateSessionOutcome[0].sessionData.outcome, 'success',
      'closed completion persists a success outcome');

    recorder.recordTaskOutcome({
      tool: 'complete_task',
      params: { summary: 'Duplicate completion', tab_id: 7 },
      payload: { agentId: 'agent-memory' }
    });
    await recorder._drainForTests();
    passAssertEqual(taskMemories.calls.length, 1, 'duplicate terminal outcome cannot create a second memory');
    passAssertEqual(logger.calls.updateSessionOutcome.length, 1,
      'duplicate terminal outcome cannot patch history a second time');
  }

  // -- Test 22: partial/failure outcomes + open-session close ---------------------
  console.log('\n--- Test 22: partial and failure summaries map to local outcomes ---');
  {
    let section = await freshSection(1750000600000);
    recorder.recordAction(bridgeAction({
      agentId: 'agent-partial', tool: 'click', params: { tab_id: 3, selector: '#continue' }, tabId: 3,
      visualReason: 'Complete checkout', client: 'Claude'
    }));
    recorder.recordTaskOutcome({
      tool: 'partial_task',
      params: {
        summary: 'Cart prepared', blocker: 'Manual approval required',
        next_step: 'Approve the purchase', tab_id: 3
      },
      payload: { agentId: 'agent-partial' }
    });
    await recorder._drainForTests();
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0,
      'partial lifecycle closes a matching still-open session');
    passAssertEqual(section.logger.calls.saveSession[0].sessionData.status, 'partial',
      'open-session history records the partial status');
    passAssertEqual(section.logger.calls.updateSessionOutcome.length, 0,
      'open-session lifecycle writes its outcome through the initial save only');
    passAssertEqual(section.taskMemories.calls[0].typeData.session.outcome, 'partial',
      'partial lifecycle creates a partial Task Memory');
    passAssert(section.taskMemories.calls[0].text.includes('Manual approval required') &&
      section.taskMemories.calls[0].text.includes('Approve the purchase'),
    'partial memory preserves blocker and next step');

    section = await freshSection(1750000700000);
    recorder.recordAction(bridgeAction({
      agentId: 'agent-failed', tool: 'click', params: { tab_id: 4 }, tabId: 4,
      visualReason: 'Find unavailable data', client: 'Codex', isFinal: true
    }));
    await recorder._drainForTests();
    recorder.recordTaskOutcome({
      tool: 'fail_task',
      params: { reason: 'The requested data does not exist', tab_id: 4 },
      payload: { agentId: 'agent-failed' }
    });
    await recorder._drainForTests();
    passAssertEqual(section.taskMemories.calls.length, 1, 'failure creates one local Task Memory');
    passAssertEqual(section.taskMemories.calls[0].typeData.session.outcome, 'failure',
      'fail_task maps to failure outcome');
    passAssertEqual(section.logger.calls.updateSessionOutcome.length, 1,
      'failure arriving after is_final patches the closed history row');
    passAssertEqual(section.logger.calls.updateSessionOutcome[0].sessionData.status, 'failed',
      'closed failure persists failed history status');
    passAssertEqual(section.logger.calls.updateSessionOutcome[0].sessionData.outcome, 'failure',
      'closed failure persists failure history outcome');

    section = await freshSection(1750000750000);
    recorder.recordAction(bridgeAction({
      agentId: 'agent-closed-partial', tool: 'click', params: { tab_id: 8 }, tabId: 8,
      visualReason: 'Prepare protected change', client: 'Claude', isFinal: true
    }));
    await recorder._drainForTests();
    recorder.recordTaskOutcome({
      tool: 'partial_task',
      params: {
        summary: 'Preparation finished', blocker: 'Manual approval required',
        next_step: 'Approve the change', tab_id: 8
      },
      payload: { agentId: 'agent-closed-partial' }
    });
    await recorder._drainForTests();
    passAssertEqual(section.logger.calls.updateSessionOutcome.length, 1,
      'partial outcome arriving after is_final patches the closed history row');
    passAssertEqual(section.logger.calls.updateSessionOutcome[0].sessionData.status, 'partial',
      'closed partial outcome persists partial history status');
    passAssertEqual(section.logger.calls.updateSessionOutcome[0].sessionData.blocker,
      'Manual approval required', 'closed partial history preserves its blocker');
  }

  // -- Test 23: ambiguity falls back to history only ------------------------------
  console.log('\n--- Test 23: multi-tab ambiguity requires explicit tab_id ---');
  {
    const { taskMemories } = await freshSection(1750000800000);
    recorder.recordAction(bridgeAction({
      agentId: 'agent-ambiguous', tool: 'click', params: { tab_id: 1 }, tabId: 1,
      visualReason: 'Tab one', client: 'Claude'
    }));
    recorder.recordAction(bridgeAction({
      agentId: 'agent-ambiguous', tool: 'click', params: { tab_id: 2 }, tabId: 2,
      visualReason: 'Tab two', client: 'Claude'
    }));
    await recorder._drainForTests();
    recorder.recordTaskOutcome({
      tool: 'complete_task', params: { summary: 'Ambiguous completion' },
      payload: { agentId: 'agent-ambiguous' }
    });
    await recorder._drainForTests();
    passAssertEqual(taskMemories.calls.length, 0, 'tab-less ambiguous summary creates no memory');
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 2,
      'ambiguous summary does not close or misattribute either session');

    recorder.recordTaskOutcome({
      tool: 'complete_task', params: { summary: 'Tab two complete', tab_id: 2 },
      payload: { agentId: 'agent-ambiguous' }
    });
    await recorder._drainForTests();
    passAssertEqual(taskMemories.calls.length, 1, 'explicit tab_id resolves exactly one session');
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 1,
      'explicit outcome closes only its matching tab session');

    recorder.recordTaskOutcome({
      tool: 'complete_task', params: { tab_id: 1 }, payload: { agentId: 'agent-ambiguous' }
    });
    await recorder._drainForTests();
    passAssertEqual(taskMemories.calls.length, 1, 'missing required summary remains history-only');
  }

  // -- Test 24: candidate survives SW restart and expires after five minutes ------
  console.log('\n--- Test 24: persisted candidate restoration and expiry ---');
  {
    let section = await freshSection(1750000900000);
    recorder.recordAction(bridgeAction({
      agentId: 'agent-restore-memory', tool: 'click', params: { tab_id: 5 }, tabId: 5,
      visualReason: 'Restore candidate', client: 'Codex', isFinal: true
    }));
    await recorder._drainForTests();
    passAssert(!!section.storage.store[recorder.FSB_MCP_MEMORY_CANDIDATES_KEY],
      'closed-session candidate is persisted in chrome.storage.session');

    recorder._resetForTests();
    recorder._setStorageShim(section.storage);
    recorder._setLocalStorageShim(section.localStorage);
    recorder._setAlarmShim(section.alarms);
    recorder._setTimeShim(section.time.shim);
    await recorder._restoreMemoryCandidates();
    passAssertEqual(Object.keys(recorder._peekMemoryCandidates()).length, 1,
      'candidate rehydrates after simulated service-worker eviction');
    recorder.recordTaskOutcome({
      tool: 'complete_task', params: { summary: 'Restored completion', tab_id: 5 },
      payload: { agentId: 'agent-restore-memory' }
    });
    await recorder._drainForTests();
    passAssertEqual(section.taskMemories.calls.length, 1, 'restored candidate can create local memory');

    section = await freshSection(1750001000000);
    recorder.recordAction(bridgeAction({
      agentId: 'agent-expire-memory', tool: 'click', params: { tab_id: 6 }, tabId: 6,
      visualReason: 'Expire candidate', client: 'Claude', isFinal: true
    }));
    await recorder._drainForTests();
    section.time.advance(recorder.MCP_MEMORY_CANDIDATE_TTL_MS + 1);
    recorder._resetForTests();
    recorder._setStorageShim(section.storage);
    recorder._setLocalStorageShim(section.localStorage);
    recorder._setAlarmShim(section.alarms);
    recorder._setTimeShim(section.time.shim);
    await recorder._restoreMemoryCandidates();
    passAssertEqual(Object.keys(recorder._peekMemoryCandidates()).length, 0,
      'candidate older than five minutes is discarded on restore');
  }

  // -- Test 25: versioned persisted-data scrub retries after interruption ---------
  console.log('\n--- Test 25: persisted MCP data scrub is recursive and retryable ---');
  {
    const { storage, localStorage, time } = await freshSection(1750001100000);
    const rawSecretUrl = 'https://old-user:old-password@example.com/callback?code=old-oauth-code&view=history#access_token=old-fragment-token';
    const sanitizedSecretUrl = 'https://example.com/callback?view=history';
    const rawTask = 'Complete setup with password=hunter2';
    const sanitizedTask = 'Complete setup with password: [REDACTED]';
    const rawCompletion = 'Finished with Bearer abc.def.ghi';
    const sanitizedCompletion = 'Finished with Bearer [REDACTED]';
    const rawVisualReasons = ['Bearer abc.def.ghi', 'Review ordinary dashboard text'];
    const sanitizedVisualReasons = ['Bearer [REDACTED]', 'Review ordinary dashboard text'];
    const rawAction = {
      tool: 'type',
      params: { selector: 'e42', text: 'old-password', nested: { apiKey: 'old-key' } },
      result: {
        success: false,
        apiToken: 'old-result-token',
        typed: 'old-password',
        actualValue: 'old-password',
        expectedValue: 'old-password',
        elementInfo: { type: 'password', previousValue: 'prior-password' }
      },
      timestamp: time.now()
    };
    const rawNavigate = {
      tool: 'navigate', params: { url: rawSecretUrl }, result: { success: true }, timestamp: time.now()
    };
    storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY] = {
      v: 1,
      records: {
        'agent-old::1': {
          sessionId: 'session-old', agentId: 'agent-old', tabId: 1,
          task: rawTask, client: 'Claude', startTime: time.now(),
          lastActivityAt: time.now(), deadlineAt: time.now() + 1000,
          lastUrl: rawSecretUrl, visualReasons: rawVisualReasons,
          actionHistory: [rawAction, rawNavigate], sawActionTool: true
        }
      }
    };
    localStorage.store.fsbSessionLogs = {
      'session-old': {
        id: 'session-old', mode: 'mcp-agent', task: rawTask,
        result: 'Saved api_key=old-key', completionMessage: rawCompletion,
        outcomeDetails: { summary: rawTask, result: rawCompletion },
        lastUrl: rawSecretUrl, actionHistory: [rawAction, rawNavigate],
        logs: [{ data: { sessionId: 'session-old', task: rawTask } }]
      }
    };
    localStorage.store.fsbSessionIndex = [
      {
        id: 'session-old', mode: 'mcp-agent', task: rawTask,
        result: 'Saved api_key=old-key', completionMessage: rawCompletion,
        outcomeDetails: { summary: rawTask, result: rawCompletion }
      },
      { id: 'autopilot-old', mode: 'autopilot', task: 'Keep password=autopilot-value' }
    ];
    localStorage.store.automationLogs = [
      {
        data: {
          sessionId: 'session-old',
          task: rawTask,
          authorization: 'Bearer old-token',
          lastUrl: rawSecretUrl,
          action: { tool: 'type', params: rawAction.params },
          result: rawAction.result
        }
      },
      {
        data: {
          sessionId: 'autopilot-old',
          task: 'Keep password=autopilot-value',
          authorization: 'preserve-unrelated-row'
        }
      }
    ];
    localStorage.store[recorder.FSB_MCP_REDACTION_VERSION_KEY] = 2;
    const baseSet = localStorage.set.bind(localStorage);
    let interrupt = true;
    localStorage.set = function (values) {
      if (interrupt) return Promise.reject(new Error('interrupted migration'));
      return baseSet(values);
    };

    await recorder._scrubPersistedMcpData();
    passAssertEqual(localStorage.store[recorder.FSB_MCP_REDACTION_VERSION_KEY], 2,
      'failed scrub leaves the version-2 migration marker unchanged');
    interrupt = false;
    await recorder._scrubPersistedMcpData();
    passAssertEqual(localStorage.store[recorder.FSB_MCP_REDACTION_VERSION_KEY], recorder.FSB_MCP_REDACTION_VERSION,
      'successful retry writes the redaction version marker');
    const buffered = storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY].records['agent-old::1'].actionHistory[0];
    const bufferedSession = storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY].records['agent-old::1'];
    const historic = localStorage.store.fsbSessionLogs['session-old'].actionHistory[0];
    const historicSession = localStorage.store.fsbSessionLogs['session-old'];
    const rawLog = localStorage.store.automationLogs[0].data;
    passAssertEqual(buffered.params.text, '[REDACTED]', 'startup scrub sanitizes the session buffer');
    passAssertEqual(buffered.result.expectedValue, '[REDACTED]',
      'startup scrub removes failed password expectedValue echoes');
    passAssertEqual(bufferedSession.actionHistory[1].params.url, sanitizedSecretUrl,
      'startup scrub sanitizes replay navigation URLs in the session buffer');
    passAssertEqual(bufferedSession.lastUrl, sanitizedSecretUrl,
      'startup scrub sanitizes buffered lastUrl metadata');
    passAssertEqual(bufferedSession.task, sanitizedTask,
      'startup scrub sanitizes the buffered task text');
    passAssertDeepEqual(bufferedSession.visualReasons, sanitizedVisualReasons,
      'startup scrub sanitizes every buffered visual reason while preserving ordinary text');
    passAssertEqual(historic.params.nested.apiKey, '[REDACTED]', 'startup scrub sanitizes persisted history recursively');
    passAssertEqual(historic.params.text, '[REDACTED]',
      'startup scrub uses result metadata to redact opaque-selector request text');
    passAssertEqual(historicSession.actionHistory[1].params.url, sanitizedSecretUrl,
      'startup scrub sanitizes persisted replay navigation URLs');
    passAssertEqual(historicSession.lastUrl, sanitizedSecretUrl,
      'startup scrub sanitizes persisted session lastUrl metadata');
    passAssertEqual(historicSession.task, sanitizedTask,
      'startup scrub sanitizes the closed MCP session task');
    passAssertEqual(historicSession.completionMessage, sanitizedCompletion,
      'startup scrub sanitizes closed MCP lifecycle text');
    passAssertEqual(historicSession.logs[0].data.task, sanitizedTask,
      'startup scrub sanitizes session-start task text embedded in session logs');
    passAssertEqual(localStorage.store.fsbSessionIndex[0].task, sanitizedTask,
      'startup scrub sanitizes the MCP session-index task copy');
    passAssertEqual(localStorage.store.fsbSessionIndex[0].completionMessage, sanitizedCompletion,
      'startup scrub sanitizes the MCP session-index lifecycle copy');
    passAssertEqual(rawLog.result.apiToken, '[REDACTED]', 'startup scrub sanitizes associated automation results');
    passAssertEqual(rawLog.result.expectedValue, '[REDACTED]',
      'startup scrub sanitizes expectedValue in associated automation results');
    passAssertEqual(rawLog.action.params.text, '[REDACTED]', 'startup scrub sanitizes sensitive automation text');
    passAssertEqual(rawLog.lastUrl, sanitizedSecretUrl,
      'startup scrub sanitizes URL-like fields in associated automation logs');
    passAssertEqual(rawLog.authorization, '[REDACTED]', 'startup scrub recursively sanitizes associated MCP log fields');
    passAssertEqual(rawLog.task, sanitizedTask,
      'startup scrub sanitizes task text in the shared automation log');
    passAssertEqual(rawLog.sessionId, 'session-old',
      'startup scrub preserves the generated MCP session id used by retention pruning');
    passAssertEqual(localStorage.store.automationLogs[1].data.authorization, 'preserve-unrelated-row',
      'startup scrub leaves unrelated Autopilot raw logs unchanged');
    passAssertEqual(localStorage.store.automationLogs[1].data.task, 'Keep password=autopilot-value',
      'startup scrub leaves unrelated Autopilot task text unchanged');
    passAssertEqual(localStorage.store.fsbSessionIndex[1].task, 'Keep password=autopilot-value',
      'startup scrub leaves unrelated Autopilot index text unchanged');
    passAssertEqual(globalThis.automationLogger.calls.withSessionMutationLock.length, 2,
      'every local startup scrub attempt runs through the shared logger mutation chain');

    // A malformed record written after migration must still be sanitized at
    // restore, serialization, and final history/logging boundaries.
    const malformedRecord = storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY].records['agent-old::1'];
    malformedRecord.task = rawTask;
    malformedRecord.visualReasons = rawVisualReasons.slice();
    await recorder._restoreFromBuffer();
    await recorder._drainForTests();
    const restored = recorder._peekOpenSessions()['agent-old::1'];
    passAssertEqual(restored.task, sanitizedTask,
      'buffer restore sanitizes task text before exposing the open session');
    passAssertDeepEqual(restored.visualReasons, sanitizedVisualReasons,
      'buffer restore sanitizes visual reasons before re-persisting');
    time.advance(2000);
    await recorder.handleAlarm({ name: recorder.FSB_MCP_SESSION_ALARM_PREFIX + 'idle:session-old' });
    await recorder._drainForTests();
    const finalStartLog = globalThis.automationLogger.calls.logSessionStart.slice(-1)[0];
    const finalSavedSession = globalThis.automationLogger.calls.saveSession.slice(-1)[0];
    passAssertEqual(finalStartLog.task, sanitizedTask,
      'restored task text is sanitized before final session-start logging');
    passAssertEqual(finalSavedSession.sessionData.task, sanitizedTask,
      'restored task text is sanitized before final history persistence');
  }

  // -- Test 26: closed lifecycle history and memory failures stay independent -----
  console.log('\n--- Test 26: closed lifecycle side effects are independent and one-shot ---');
  {
    let section = await freshSection(1750001200000);
    recorder.recordAction(bridgeAction({
      agentId: 'agent-history-failure', tool: 'click', params: { tab_id: 9 }, tabId: 9,
      visualReason: 'Finish despite history failure', client: 'Codex', isFinal: true
    }));
    await recorder._drainForTests();
    section.logger.updateSessionOutcome = function (sessionId, sessionData) {
      section.logger.calls.updateSessionOutcome.push({ sessionId, sessionData });
      return Promise.reject(new Error('history unavailable'));
    };
    recorder.recordTaskOutcome({
      tool: 'complete_task', params: { summary: 'Work still completed', tab_id: 9 },
      payload: { agentId: 'agent-history-failure' }
    });
    await recorder._drainForTests();
    passAssertEqual(section.logger.calls.updateSessionOutcome.length, 1,
      'closed lifecycle attempts its history patch once when history fails');
    passAssertEqual(section.taskMemories.calls.length, 1,
      'history failure does not prevent the independent Task Memory write');
    recorder.recordTaskOutcome({
      tool: 'complete_task', params: { summary: 'Duplicate completion', tab_id: 9 },
      payload: { agentId: 'agent-history-failure' }
    });
    await recorder._drainForTests();
    passAssertEqual(section.logger.calls.updateSessionOutcome.length, 1,
      'history failure cannot make the terminal candidate reusable');
    passAssertEqual(section.taskMemories.calls.length, 1,
      'history failure cannot create a second Task Memory');

    section = await freshSection(1750001300000);
    recorder.recordAction(bridgeAction({
      agentId: 'agent-memory-failure', tool: 'click', params: { tab_id: 10 }, tabId: 10,
      visualReason: 'Finish despite memory failure', client: 'Claude', isFinal: true
    }));
    await recorder._drainForTests();
    section.taskMemories.storage.add = async function (memory) {
      section.taskMemories.calls.push(memory);
      throw new Error('memory unavailable');
    };
    recorder.recordTaskOutcome({
      tool: 'fail_task', params: { reason: 'Terminal client failure', tab_id: 10 },
      payload: { agentId: 'agent-memory-failure' }
    });
    await recorder._drainForTests();
    passAssertEqual(section.logger.calls.updateSessionOutcome.length, 1,
      'Task Memory failure does not prevent the independent history patch');
    passAssertEqual(section.taskMemories.calls.length, 1,
      'failed Task Memory storage is attempted only once');
    recorder.recordTaskOutcome({
      tool: 'fail_task', params: { reason: 'Duplicate client failure', tab_id: 10 },
      payload: { agentId: 'agent-memory-failure' }
    });
    await recorder._drainForTests();
    passAssertEqual(section.logger.calls.updateSessionOutcome.length, 1,
      'Task Memory failure cannot permit a second history outcome');
    passAssertEqual(section.taskMemories.calls.length, 1,
      'Task Memory failure cannot make the terminal candidate reusable');
  }

  // -- Wrap up ---------------------------------------------------------------------
  recorder._resetForTests();
  recorder._setTimeShim(null);
  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (e) {
  console.error('FATAL: mcp-session-recorder test harness threw:', e && e.stack ? e.stack : e);
  process.exit(2);
});
