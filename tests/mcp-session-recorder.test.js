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
 *       extractAndStoreMemories called with the same sessionId + session.
 *       Snake_case is_final tolerated.
 *   5.  60s idle expiry with sliding re-arm (fake clock/timers -- no real
 *       waiting; no premature close before the re-armed deadline).
 *   6.  run_task skipped entirely (automation engine already records it).
 *   7.  >=1-action persistence gate: pure read-only bursts never birth
 *       sessions, saveSession never fires.
 *   8.  Key-targeted redaction: url persists RAW (replay-critical), password
 *       and nested apiKey values replaced; lazy globalThis.redactForLog
 *       branch used when the helper is present.
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

async function drainMicrotasks() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise(function (r) { setImmediate(r); });
}

// ---------------------------------------------------------------------------
// Shim factories
// ---------------------------------------------------------------------------

function makeLoggerStub(opts) {
  opts = opts || {};
  const calls = { logSessionStart: [], logAction: [], saveSession: [] };
  const logs = [];
  return {
    calls,
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
  let nextId = 1;
  const timers = new Map();
  const shim = {
    now: function () { return nowMs; },
    setTimeout: function (fn, ms) {
      const id = nextId++;
      timers.set(id, { fireAt: nowMs + ms, fn });
      return id;
    },
    clearTimeout: function (id) { timers.delete(id); }
  };
  return {
    shim,
    timers,
    advance(ms) {
      nowMs += ms;
      let fired = true;
      while (fired) {
        fired = false;
        const due = [...timers.entries()]
          .filter(([, t]) => t.fireAt <= nowMs)
          .sort((a, b) => a[1].fireAt - b[1].fireAt);
        if (due.length > 0) {
          const [id, t] = due[0];
          timers.delete(id);
          t.fn();
          fired = true;
        }
      }
    },
    now: function () { return nowMs; }
  };
}

// Fresh section state: reset recorder, install fresh stubs, return handles.
function freshSection(startMs) {
  recorder._resetForTests();
  const storage = makeStorageShim();
  recorder._setStorageShim(storage);
  const time = makeTimeShim(startMs || 1750000000000);
  recorder._setTimeShim(time.shim);
  const logger = makeLoggerStub();
  globalThis.automationLogger = logger;
  const memories = makeMemoriesStub();
  globalThis.extractAndStoreMemories = memories;
  return { storage, time, logger, memories };
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
  return {
    client: o.client || 'unknown',
    tool: o.tool,
    requestPayload: { tool: o.tool, params: o.params || {}, agentId: o.agentId },
    response: o.response === undefined ? { success: true } : o.response,
    success: o.success === undefined ? true : o.success,
    dispatcher_route: o.route || 'message'
  };
}

(async function main() {

  // -- Test 1: birth on first sidecar action --------------------------------
  console.log('--- Test 1: birth on first sidecar action (bridge tap) ---');
  {
    const { storage, logger } = freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-1', tool: 'click', params: { tab_id: 42, selector: '#buy' }, tabId: 42,
      visualReason: 'Book a flight to Berlin', client: 'Claude'
    }));
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
    const { logger } = freshSection();
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
    const { logger } = freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-1', tool: 'navigate', params: { tab_id: 42, url: 'https://example.com/inbox' }, tabId: 42,
      visualReason: 'Open the inbox', client: 'Claude'
    }));
    recorder.recordDispatch(readDispatch({ agentId: 'agent-1', tool: 'mcp:read-page' }));
    const rec = recorder._peekOpenSessions()['agent-1::42'];
    passAssertEqual(rec.actionHistory.length, 2, 'sidecar-less dispatch with same agentId JOINS the open session');
    passAssertEqual(rec.actionHistory[1].tool, 'mcp:read-page', 'joined entry appended in order');
    passAssertEqual(rec.lastUrl, 'https://example.com/inbox', 'successful navigate sets lastUrl (memory domain fallback)');
    recorder.recordDispatch(readDispatch({ agentId: 'agent-UNKNOWN', tool: 'mcp:get-tabs' }));
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 1,
      'sidecar-less dispatch with unknown agentId creates NO session');
    passAssertEqual(logger.calls.saveSession.length, 0, 'no close happened during joins');
  }

  // -- Test 4: isFinal close -> history + memory pipeline ---------------------
  console.log('\n--- Test 4: isFinal close fires saveSession + extractAndStoreMemories ---');
  {
    const { logger, memories } = freshSection();
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
    passAssertEqual(memories.calls.length, 1, 'extractAndStoreMemories called once');
    passAssertEqual(memories.calls[0].sessionId, saved.sessionId, 'memory handoff got the same sessionId');
    passAssert(memories.calls[0].session === saved.sessionData, 'memory handoff got the SAME session object');
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0, 'session removed from the open map');

    // Snake_case tolerance: is_final on the very first action closes a
    // 1-action session.
    recorder.recordAction(bridgeAction({
      agentId: 'agent-2', tool: 'click', params: { tab_id: 9 }, tabId: 9,
      visualReason: 'One-shot action', client: 'Codex', is_final: true
    }));
    passAssertEqual(logger.calls.saveSession.length, 2, 'snake_case is_final also closes (wire-spec tolerance)');
    passAssertEqual(logger.calls.saveSession[1].sessionData.actionHistory.length, 1,
      'one-shot session persisted with its single action');
    passAssertEqual(logger.calls.saveSession[1].sessionData.mcpClient, 'Codex',
      'second session carries its own client label');
  }

  // -- Test 5: 60s idle expiry with sliding re-arm ----------------------------
  console.log('\n--- Test 5: 60s idle expiry (sliding window, fake clock) ---');
  {
    const { time, logger } = freshSection(1750000000000);
    recorder.recordAction(bridgeAction({
      agentId: 'agent-3', tool: 'click', params: { tab_id: 5 }, tabId: 5,
      visualReason: 'Sort the inbox', client: 'Claude'
    }));
    time.advance(30000); // t+30s: inside the window
    passAssertEqual(logger.calls.saveSession.length, 0, 'no close before the 60s deadline');
    recorder.recordAction(bridgeAction({
      agentId: 'agent-3', tool: 'click', params: { tab_id: 5 }, tabId: 5,
      visualReason: 'Sort the inbox', client: 'Claude'
    })); // re-arms deadline to t+90s
    time.advance(45000); // t+75s: past the ORIGINAL deadline (t+60s) but inside the re-armed one
    passAssertEqual(logger.calls.saveSession.length, 0,
      'fresh action re-armed the window -- no premature close at t+75s');
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 1, 'session still open at t+75s');
    time.advance(20000); // t+95s: past the re-armed deadline (t+90s)
    passAssertEqual(logger.calls.saveSession.length, 1, 'idle expiry closed and persisted the session');
    passAssertEqual(logger.calls.saveSession[0].sessionData.actionHistory.length, 2,
      'expired session kept both recorded actions');
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0, 'expired session removed from the map');
  }

  // -- Test 6: run_task skipped ------------------------------------------------
  console.log('\n--- Test 6: run_task dispatches are never recorded ---');
  {
    const { logger } = freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-4', tool: 'run_task', params: { tab_id: 3, task: 'do things' }, tabId: 3,
      visualReason: 'Autopilot handoff', client: 'Claude'
    }));
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0,
      'run_task (even with a sidecar) creates no session');
    passAssertEqual(logger.calls.logSessionStart.length, 0, 'run_task seeds no session logs');
    passAssertEqual(logger.calls.saveSession.length, 0, 'run_task persists nothing');
  }

  // -- Test 7: >=1-action persistence gate -------------------------------------
  console.log('\n--- Test 7: pure read-only bursts never create sessions ---');
  {
    const { logger } = freshSection();
    recorder.recordDispatch(readDispatch({ agentId: 'agent-ro', tool: 'mcp:get-tabs' }));
    recorder.recordDispatch(readDispatch({ agentId: 'agent-ro', tool: 'mcp:read-page' }));
    recorder.recordDispatch(readDispatch({ agentId: 'agent-ro', tool: 'read_page', route: 'tool' }));
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 0,
      'read-only burst (agentId, never a sidecar) births no session');
    passAssertEqual(logger.calls.saveSession.length, 0, 'saveSession never called for the burst');
  }

  // -- Test 8: key-targeted redaction -------------------------------------------
  console.log('\n--- Test 8: sensitive-key redaction, replay values raw ---');
  {
    const { logger } = freshSection();
    delete globalThis.redactForLog; // exercise the literal-fallback branch
    const originalParams = {
      url: 'https://example.com/x',
      password: 'hunter2',
      nested: { apiKey: 'k' },
      tab_id: 11
    };
    recorder.recordAction(bridgeAction({
      agentId: 'agent-5', tool: 'navigate', params: originalParams, tabId: 11,
      visualReason: 'Log in', client: 'Claude', isFinal: true
    }));
    passAssertEqual(logger.calls.saveSession.length, 1, 'redaction session closed and saved');
    const savedHistory = logger.calls.saveSession[0].sessionData.actionHistory;
    passAssertEqual(savedHistory[0].params.url, 'https://example.com/x',
      'url persists EXACTLY raw (replay-critical)');
    passAssert(savedHistory[0].params.password !== 'hunter2', 'password value replaced');
    passAssertEqual(savedHistory[0].params.password, '[REDACTED]',
      'literal [REDACTED] used when redactForLog is absent');
    passAssert(savedHistory[0].params.nested.apiKey !== 'k', 'nested apiKey value replaced');
    passAssertEqual(savedHistory[0].params.nested.apiKey, '[REDACTED]',
      'nested sensitive key redacted recursively');
    const historyJson = JSON.stringify(savedHistory);
    passAssert(historyJson.indexOf('hunter2') === -1, 'original password absent from stored actionHistory JSON');
    passAssert(historyJson.indexOf('"apiKey":"k"') === -1, 'original apiKey value absent from stored actionHistory JSON');
    passAssertEqual(originalParams.password, 'hunter2',
      'caller params object NOT mutated (deep-clone before redaction)');

    // Lazy-guard branch: with globalThis.redactForLog present, its shape
    // output is used instead of the literal.
    globalThis.redactForLog = function (value) {
      return { kind: 'shimmed', length: String(value).length };
    };
    recorder.recordAction(bridgeAction({
      agentId: 'agent-6', tool: 'type', params: { tab_id: 12, text: 'ok', password: 'hunter2' }, tabId: 12,
      visualReason: 'Second login', client: 'Claude', isFinal: true
    }));
    const shimmed = logger.calls.saveSession[1].sessionData.actionHistory[0].params.password;
    passAssert(shimmed && shimmed.kind === 'shimmed' && shimmed.length === 7,
      'globalThis.redactForLog used via lazy guard when available');
    delete globalThis.redactForLog;
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
  }

  // -- Test 11: eviction restore (expired closes, live rehydrates) ----------------
  console.log('\n--- Test 11: eviction restore from the fsbMcpSessionBuffer envelope ---');
  {
    const { storage, time, logger } = freshSection(1750000100000);
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
    passAssertEqual(logger.calls.logSessionStart.length, 1,
      'empty post-eviction log buffer re-seeded so the saveSession gate passes');
    const open = recorder._peekOpenSessions();
    passAssertEqual(Object.keys(open).length, 1, 'live session rehydrated into the map');
    passAssert(open['agent-y::2'] && open['agent-y::2'].sessionId === 'session_200',
      'live session record intact after restore');
    passAssert(time.timers.size >= 1, 'idle timer re-armed for the live session');

    time.advance(31000); // past the live session's remaining window
    passAssertEqual(logger.calls.saveSession.length, 2, 'live session closes when its restored deadline passes');
    passAssertEqual(logger.calls.saveSession[1].sessionId, 'session_200', 'live session persisted on expiry');
    await drainMicrotasks();
    passAssertEqual(storage.store[recorder.FSB_MCP_SESSION_BUFFER_KEY], undefined,
      'buffer storage key REMOVED once no open sessions remain');
  }

  // -- Test 12: malformed / wrong-version envelope treated as empty ----------------
  console.log('\n--- Test 12: malformed envelope collapses to canonical empty ---');
  {
    const { storage, logger } = freshSection();
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
    freshSection();
    // Wire snake_case tab_id keys the session even with NO explicit tabId
    // (e.g. a future recordDispatch caller without the resolved id).
    recorder.recordAction(bridgeAction({
      agentId: 'agent-8', tool: 'click', params: { tab_id: 42, selector: '#a' },
      visualReason: 'Wire snake_case tab', client: 'Claude'
    }));
    let keys = Object.keys(recorder._peekOpenSessions());
    passAssertEqual(keys.length, 1, 'snake_case-only dispatch opened one session');
    passAssertEqual(keys[0], 'agent-8::42', 'params.tab_id keys the session -- no agentId::none collapse');

    // Explicit resolved tabId wins over params.
    freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-8', tool: 'click', params: { tab_id: 99 }, tabId: 42,
      visualReason: 'Resolver beats raw params', client: 'Claude'
    }));
    keys = Object.keys(recorder._peekOpenSessions());
    passAssertEqual(keys[0], 'agent-8::42', 'explicit resolved tabId takes precedence over params.tab_id');

    // camelCase back-compat (dispatcher-injected routeParams shape).
    freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-8', tool: 'click', params: { tabId: 13 },
      visualReason: 'Legacy camelCase param', client: 'Claude'
    }));
    keys = Object.keys(recorder._peekOpenSessions());
    passAssertEqual(keys[0], 'agent-8::13', 'camelCase params.tabId still keys the session (back-compat)');

    // The review's headline scenario: one agent, two tabs -> two sessions.
    const { logger } = freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-m', tool: 'click', params: { tab_id: 1 }, tabId: 1,
      visualReason: 'Tab one work', client: 'Claude'
    }));
    recorder.recordAction(bridgeAction({
      agentId: 'agent-m', tool: 'click', params: { tab_id: 2 }, tabId: 2,
      visualReason: 'Tab two work', client: 'Claude'
    }));
    const open = recorder._peekOpenSessions();
    passAssertEqual(Object.keys(open).length, 2,
      'same agent driving two tabs holds two DISTINCT open sessions (no merge)');
    passAssert(open['agent-m::1'] && open['agent-m::2'], 'sessions keyed agent-m::1 and agent-m::2');
    passAssertEqual(open['agent-m::1'].actionHistory.length, 1, 'tab-1 session holds only its own action');
    passAssertEqual(logger.calls.saveSession.length, 0, 'no spurious close while both tabs are active');
  }

  // -- Test 14: bootstrap birth (open_tab/switch_tab post-dispatch tabId) ----------
  console.log('\n--- Test 14: bootstrap birth with post-dispatch resolved tabId ---');
  {
    const { logger } = freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-b', tool: 'open_tab', params: {},
      visualReason: 'Open a fresh tab for research', client: 'Claude',
      response: { success: true, tabId: 7 }, tabId: 7
    }));
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
    const { logger } = freshSection();
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
    const { logger } = freshSection();
    recorder.recordAction(bridgeAction({
      agentId: 'agent-f', tool: 'click', params: { tab_id: 3 }, tabId: 3,
      visualReason: 'Try a flaky button', client: 'Claude'
    }));
    recorder.recordAction(bridgeAction({
      agentId: 'agent-f', tool: 'click', params: { tab_id: 3 }, tabId: 3,
      visualReason: 'Try a flaky button', client: 'Claude',
      response: { success: false, error: 'element not found' }, success: false
    }));
    let rec = recorder._peekOpenSessions()['agent-f::3'];
    passAssertEqual(rec.actionHistory.length, 2, 'failed action still appended to the history');
    passAssertEqual(rec.actionHistory[1].result.success, false,
      'failure result preserved (replay filter excludes it downstream)');

    // Sidecar-less action-path call (defensive shape) JOINs the open session.
    recorder.recordAction(bridgeAction({
      agentId: 'agent-f', tool: 'get_text', params: { tab_id: 3 }, tabId: 3, noSidecar: true
    }));
    rec = recorder._peekOpenSessions()['agent-f::3'];
    passAssertEqual(rec.actionHistory.length, 3, 'sidecar-less action-path call JOINs the open session');

    // ...but never births for an agent with no open session.
    recorder.recordAction(bridgeAction({
      agentId: 'agent-fresh', tool: 'get_text', params: {}, tabId: 5, noSidecar: true
    }));
    passAssertEqual(Object.keys(recorder._peekOpenSessions()).length, 1,
      'sidecar-less call for an unknown agent births nothing');
    passAssertEqual(logger.calls.saveSession.length, 0, 'no close fired during Test 16');
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
