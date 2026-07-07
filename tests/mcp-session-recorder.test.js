/**
 * Regression suite for extension/utils/mcp-session-recorder.js
 * (quick task 260707-7id -- record MCP agent sessions into the SAME
 * logs/history/replay/memory pipeline autopilot runs use).
 *
 * Covers the 10 locked cases:
 *   1.  Birth on first sidecar action (keyed agentId+tabId; logSessionStart
 *       seeds the saveSession empty-logs gate; task = first visualReason;
 *       sessionId matches the autopilot /^session_\d+$/ format).
 *   2.  actionHistory accumulation in replay shape {tool, params, result,
 *       timestamp}, in dispatch order.
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
 *       dispatcher hook sites each wrapped in their own try/catch.
 *   10. Source-pin guards: exactly 2 fsbMcpSessionRecorder.recordDispatch
 *       sites in mcp-tool-dispatcher.js, each using
 *       resolveMcpClientLabel(payload); the message-route site gated by
 *       !_mcpMetricsSuppressInner; the original fsbMcpMetricsRecorder
 *       pattern still matches exactly 2 sites; background.js loads the
 *       recorder on exactly one line.
 *
 * Plus the eviction-restore machinery: a v:1 fsbMcpSessionBuffer envelope
 * with one expired + one live session restores correctly (_restoreFromBuffer);
 * a malformed/wrong-version envelope is treated as empty.
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

// Dispatch-entry builders (exact shape the dispatcher finally blocks emit).
function actionDispatch(o) {
  const visualSession = { visualReason: o.visualReason, client: o.client };
  if (o.isFinal !== undefined) visualSession.isFinal = o.isFinal;
  if (o.is_final !== undefined) visualSession.is_final = o.is_final;
  return {
    client: o.client || 'unknown',
    tool: o.tool,
    requestPayload: { tool: o.tool, params: o.params || {}, agentId: o.agentId, visualSession },
    response: o.response === undefined ? { success: true } : o.response,
    success: o.success === undefined ? true : o.success,
    dispatcher_route: 'tool'
  };
}

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
  console.log('--- Test 1: birth on first sidecar action ---');
  {
    const { storage, logger } = freshSection();
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-1', tool: 'click', params: { tabId: 42, selector: '#buy' },
      visualReason: 'Book a flight to Berlin', client: 'Claude'
    }));
    const open = recorder._peekOpenSessions();
    const keys = Object.keys(open);
    passAssertEqual(keys.length, 1, 'exactly one open session after birth');
    passAssertEqual(keys[0], 'agent-1::42', 'session keyed agentId::tabId');
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
  console.log('\n--- Test 2: actionHistory accumulation in replay shape ---');
  {
    const { logger } = freshSection();
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-1', tool: 'click', params: { tabId: 42, selector: '#compose' },
      visualReason: 'Compose an email', client: 'Claude'
    }));
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-1', tool: 'type_text', params: { tabId: 42, selector: '#to', text: 'a@b.c' },
      visualReason: 'Compose an email', client: 'Claude'
    }));
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-1', tool: 'press_enter', params: { tabId: 42 },
      visualReason: 'Compose an email', client: 'Claude'
    }));
    const rec = recorder._peekOpenSessions()['agent-1::42'];
    passAssertEqual(rec.actionHistory.length, 3, 'three dispatches -> three actionHistory entries');
    passAssertEqual(rec.actionHistory[0].tool, 'click', 'entry 1 tool in order');
    passAssertEqual(rec.actionHistory[1].tool, 'type_text', 'entry 2 tool in order');
    passAssertEqual(rec.actionHistory[2].tool, 'press_enter', 'entry 3 tool in order');
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
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-1', tool: 'navigate', params: { tabId: 42, url: 'https://example.com/inbox' },
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
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-1', tool: 'navigate', params: { tabId: 7, url: 'https://example.com/report' },
      visualReason: 'Compose the weekly report', client: 'Claude'
    }));
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-1', tool: 'type_text', params: { tabId: 7, selector: '#body', text: 'hello' },
      visualReason: 'Compose the weekly report', client: 'Claude'
    }));
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-1', tool: 'click', params: { tabId: 7, selector: '#send' },
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
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-2', tool: 'click', params: { tabId: 9 },
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
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-3', tool: 'click', params: { tabId: 5 },
      visualReason: 'Sort the inbox', client: 'Claude'
    }));
    time.advance(30000); // t+30s: inside the window
    passAssertEqual(logger.calls.saveSession.length, 0, 'no close before the 60s deadline');
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-3', tool: 'click', params: { tabId: 5 },
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
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-4', tool: 'run_task', params: { tabId: 3, task: 'do things' },
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
      tabId: 11
    };
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-5', tool: 'navigate', params: originalParams,
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
    recorder.recordDispatch(actionDispatch({
      agentId: 'agent-6', tool: 'type_text', params: { tabId: 12, text: 'ok', password: 'hunter2' },
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
    try {
      returned = recorder.recordDispatch(actionDispatch({
        agentId: 'agent-7', tool: 'click', params: { tabId: 1 },
        visualReason: 'Hostile shims', client: 'Claude'
      }));
      recorder.recordDispatch(actionDispatch({
        agentId: 'agent-7', tool: 'click', params: { tabId: 1 },
        visualReason: 'Hostile shims', client: 'Claude', isFinal: true
      }));
      recorder.recordDispatch(null);
      recorder.recordDispatch(42);
      recorder.recordDispatch({});
      recorder.recordDispatch({ tool: 'click', requestPayload: null });
    } catch (_e) {
      threw = true;
    }
    passAssertEqual(threw, false, 'recordDispatch never throws under throwing storage/logger shims');
    passAssertEqual(returned, undefined, 'recordDispatch returns undefined (fire-and-forget contract)');

    // Dispatcher-side contract: both hook sites wrapped in their OWN try/catch.
    const dispatcherSrc = fs.readFileSync(DISPATCHER_PATH, 'utf8');
    const guardCount = (dispatcherSrc.match(/never let session recording break dispatch/g) || []).length;
    passAssertEqual(guardCount, 2, 'both dispatcher hook sites carry their own defence-in-depth catch');
  }

  // -- Test 10: source-pin guards -------------------------------------------------
  console.log('\n--- Test 10: source-pin guards (dispatcher hooks + SW load line) ---');
  {
    const dispatcherSrc = fs.readFileSync(DISPATCHER_PATH, 'utf8');

    const sessionSitePattern = /globalThis\.fsbMcpSessionRecorder\.recordDispatch\(\{[\s\S]*?\}\);/g;
    const sessionSites = dispatcherSrc.match(sessionSitePattern) || [];
    passAssertEqual(sessionSites.length, 2,
      'exactly 2 fsbMcpSessionRecorder.recordDispatch sites in mcp-tool-dispatcher.js');
    for (let i = 0; i < sessionSites.length; i++) {
      passAssert(sessionSites[i].includes('resolveMcpClientLabel(payload)'),
        'session-recorder site #' + (i + 1) + ' calls resolveMcpClientLabel(payload)');
      passAssert(!/[\s,]client,\s/.test(sessionSites[i]),
        'session-recorder site #' + (i + 1) + ' does NOT pass a bare `client` arg');
    }

    // Message-route site sits inside the !_mcpMetricsSuppressInner gate:
    // substring order tool-route-site < gate < message-route-site.
    const gateNeedle = 'if (!_mcpMetricsSuppressInner) {';
    const gateCount = dispatcherSrc.split(gateNeedle).length - 1;
    passAssertEqual(gateCount, 1, 'exactly one !_mcpMetricsSuppressInner gate in the dispatcher');
    const gateIdx = dispatcherSrc.indexOf(gateNeedle);
    // Match the CALL form (with the opening brace) -- each hook site also
    // mentions the same dotted path inside its typeof guard.
    const sessionCallNeedle = 'globalThis.fsbMcpSessionRecorder.recordDispatch({';
    const firstSessionIdx = dispatcherSrc.indexOf(sessionCallNeedle);
    const secondSessionIdx = dispatcherSrc.indexOf(sessionCallNeedle, firstSessionIdx + 1);
    passAssert(firstSessionIdx !== -1 && firstSessionIdx < gateIdx,
      'tool-route session-recorder site appears BEFORE the message-route suppression gate');
    passAssert(secondSessionIdx > gateIdx,
      'message-route session-recorder site appears AFTER (inside) the !_mcpMetricsSuppressInner gate');

    // The original metrics pins are undisturbed (Test 9 of
    // mcp-dispatcher-client-label.test.js must keep matching exactly 2).
    const metricsSitePattern = /globalThis\.fsbMcpMetricsRecorder\.recordDispatch\(\{[\s\S]*?\}\);/g;
    const metricsSites = dispatcherSrc.match(metricsSitePattern) || [];
    passAssertEqual(metricsSites.length, 2, 'fsbMcpMetricsRecorder pattern still matches exactly 2 sites');
    for (let i = 0; i < metricsSites.length; i++) {
      passAssert(metricsSites[i].includes('resolveMcpClientLabel(payload)'),
        'metrics site #' + (i + 1) + ' still calls resolveMcpClientLabel(payload)');
      passAssert(!metricsSites[i].includes('fsbMcpSessionRecorder'),
        'metrics site #' + (i + 1) + ' span does NOT swallow the session-recorder call');
    }

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

  // -- Wrap up ---------------------------------------------------------------------
  recorder._resetForTests();
  recorder._setTimeShim(null);
  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (e) {
  console.error('FATAL: mcp-session-recorder test harness threw:', e && e.stack ? e.stack : e);
  process.exit(2);
});
