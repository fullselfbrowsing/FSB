'use strict';

/**
 * Phase 70 plan 70-01 Task 3 -- the run_task wire with fast mode off.
 *
 * D-01 and D-20: with the Advanced Settings switch off, a run_task call must
 * settle with exactly the value, MCP wire text, FsbMcpTaskStore writes and
 * heartbeat payload it produced before any Phase 70 edit. Those were captured
 * once from the unedited bridge into tests/fixtures/run-task-wire-golden.json
 * (never hand-written, never regenerated). This suite drives every settle
 * path of MCPBridgeClient._handleStartAutomation in a vm, the same way
 * tests/run-task-resolve-discipline.test.js does, and compares each one with
 * that golden under four variants:
 *
 *   V1  the vm context has no activeSessions binding;
 *   V2  activeSessions holds the seeded session, set inside the start
 *       dispatch before it resolves (background.js sets the map before
 *       sendResponse; 70-SYNC-RECHECK item o);
 *   V3  V2 with FsbFastPath loaded into the context;
 *   V4  activeSessions exists but is empty.
 *
 * The seeded session carries no field the bridge reads from a session
 * (70-SYNC-RECHECK item n), so all four variants produce the same golden.
 * Plan 70-06 adds the switch-on cases in the marked section below and builds
 * every switch-on session with makeSeededSession({ fastMode: ... }).
 *
 * The suite reads only the golden fixture and extension files. It never
 * imports mcp/build (plan 70-07 owns the in-process wire check), binds no
 * port and uses a virtual clock.
 *
 * Run: node tests/run-task-fast-mode-wire.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BRIDGE_PATH = path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js');
const FAST_PATH_PATH = path.join(__dirname, '..', 'extension', 'ai', 'jev-fast-path.js');
const GOLDEN_PATH = path.join(__dirname, 'fixtures', 'run-task-wire-golden.json');

// ---- Fixed inputs (reused by plan 70-06) -----------------------------------

const SESSION_ID = 'sess_p70_wire';
const MCP_MSG_ID = 'mcp_p70_wire';
const CLOCK_START_MS = 1760000000000;
const RUN_TASK_TEXT = 'Open the checklist and tick Alpha.';
const TAB_ID = 4242;
const SAFETY_NET_MS = 600000;
const HEARTBEAT_MS = 30000;

const SETTLE_PATHS = Object.freeze(['runtime-complete', 'bus-complete', 'bus-error', 'bus-stop', 'safety-net']);
const VARIANTS = Object.freeze(['V1', 'V2', 'V3', 'V4']);

// Session fields fireHeartbeat reads (70-SYNC-RECHECK item n). The seeded
// session must carry none of them, or the heartbeat payloads and the
// in_progress snapshots would differ between the null-session variants (V1,
// V4) and the seeded ones (V2, V3).
const HEARTBEAT_READ_FIELDS = Object.freeze(['iterationCount', 'lastKnownUrl', '_lastActionSummary', 'tabId', 'lastDOMHash']);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
  }
  return value;
}

// agent-loop.js notifySidepanel for a complete_task success
// (createTerminalOutcome('success', { summary, reason: 'complete_task' })).
const COMPLETE_SUMMARY = 'Ticked Alpha on the checklist.';
const COMPLETE_MESSAGE = deepFreeze({
  action: 'automationComplete',
  sessionId: SESSION_ID,
  tabId: TAB_ID,
  conversationId: null,
  historySessionId: SESSION_ID,
  result: COMPLETE_SUMMARY,
  partial: false,
  stopped: false,
  error: null,
  reason: 'complete_task',
  outcome: 'success',
  blocker: null,
  nextStep: null,
  outcomeDetails: {
    outcome: 'success',
    reason: 'complete_task',
    summary: COMPLETE_SUMMARY,
    blocker: null,
    nextStep: null,
    result: COMPLETE_SUMMARY,
    error: null
  },
  task: RUN_TASK_TEXT
});

// agent-loop.js notifySidepanel for the terminal API error
// (createTerminalOutcome('error', { error, reason: 'error' })).
const ERROR_TEXT = 'API call failed: provider returned 500';
const ERROR_MESSAGE = deepFreeze({
  action: 'automationError',
  sessionId: SESSION_ID,
  tabId: TAB_ID,
  conversationId: null,
  historySessionId: SESSION_ID,
  result: ERROR_TEXT,
  partial: false,
  stopped: false,
  error: ERROR_TEXT,
  reason: 'error',
  outcome: 'error',
  blocker: null,
  nextStep: null,
  outcomeDetails: {
    outcome: 'error',
    reason: 'error',
    summary: null,
    blocker: null,
    nextStep: null,
    result: ERROR_TEXT,
    error: ERROR_TEXT
  },
  task: RUN_TASK_TEXT
});

// background.js handleStopAutomation's lifecycle broadcast, field for field.
const STOP_MESSAGE = deepFreeze({
  action: 'automationComplete',
  sessionId: SESSION_ID,
  tabId: TAB_ID,
  conversationId: null,
  historySessionId: SESSION_ID,
  outcome: 'stopped',
  reason: 'user_stopped',
  stopped: true,
  timestamp: CLOCK_START_MS + 1000
});

// ---- Check counters ---------------------------------------------------------

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());
}

// Structural equality that ignores realm (vm objects have their own
// prototypes) and key order, and treats a key holding undefined as present.
function plainEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!plainEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!plainEqual(a[key], b[key])) return false;
  }
  return true;
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---- Shared chrome / clock / store builders (copied from
// tests/run-task-resolve-discipline.test.js; the clock takes a start time) ---

function createStorageArea(initial = {}) {
  const store = { ...initial };
  return {
    async get(keys) {
      if (keys == null) return { ...store };
      if (Array.isArray(keys)) {
        const out = {};
        keys.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(store, key)) out[key] = store[key];
        });
        return out;
      }
      if (typeof keys === 'string') {
        return Object.prototype.hasOwnProperty.call(store, keys) ? { [keys]: store[keys] } : {};
      }
      if (typeof keys === 'object') {
        const out = {};
        Object.keys(keys).forEach((key) => {
          out[key] = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : keys[key];
        });
        return out;
      }
      return { ...store };
    },
    async set(values) { Object.assign(store, values); },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => { delete store[key]; });
    },
    _dump() { return { ...store }; }
  };
}

function createOnMessageMock() {
  const listeners = [];
  return {
    addListener(fn) { listeners.push(fn); },
    removeListener(fn) {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    },
    _emit(message, sender = {}, sendResponse = () => {}) {
      for (const fn of [...listeners]) fn(message, sender, sendResponse);
    },
    _listeners() { return [...listeners]; }
  };
}

function createChromeMock() {
  const session = createStorageArea();
  const local = createStorageArea();
  const alarms = new Map();
  return {
    runtime: { id: 'phase-70-wire-test', onMessage: createOnMessageMock(), lastError: null },
    storage: { session, local },
    alarms: {
      async create(name, options) { alarms.set(name, { name, ...options }); },
      async clear(name) { alarms.delete(name); return true; },
      async getAll() { return Array.from(alarms.values()); }
    }
  };
}

function createFakeWebSocketClass() {
  const sockets = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
    }
    open() { this.readyState = 1; if (typeof this.onopen === 'function') this.onopen(); }
    close() { this.readyState = 3; if (typeof this.onclose === 'function') this.onclose(); }
    send(payload) { this.sent.push(payload); }
  }
  FakeWebSocket.CONNECTING = 0;
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSED = 3;
  FakeWebSocket._sockets = sockets;
  return FakeWebSocket;
}

function createVirtualClock(startAt) {
  let currentTime = Number(startAt) || 0;
  let nextHandle = 1;
  const pending = [];
  let activeIntervalCount = 0;

  function _enqueue(entry) {
    pending.push(entry);
    pending.sort((a, b) => a.fireAt - b.fireAt);
    return entry.handle;
  }

  function virtualSetTimeout(fn, ms) {
    return _enqueue({
      fireAt: currentTime + (Number(ms) || 0),
      fn, kind: 'timeout', handle: nextHandle++, cancelled: false
    });
  }
  function virtualSetInterval(fn, ms) {
    activeIntervalCount++;
    return _enqueue({
      fireAt: currentTime + (Number(ms) || 0),
      fn, kind: 'interval', intervalMs: Number(ms) || 0,
      handle: nextHandle++, cancelled: false
    });
  }
  function virtualClear(handle) {
    for (let i = 0; i < pending.length; i++) {
      if (pending[i].handle === handle) {
        if (pending[i].kind === 'interval') activeIntervalCount--;
        pending[i].cancelled = true;
        pending.splice(i, 1);
        return;
      }
    }
  }
  async function advance(ms) {
    const target = currentTime + (Number(ms) || 0);
    while (pending.length > 0 && pending[0].fireAt <= target) {
      const entry = pending.shift();
      if (entry.cancelled) continue;
      currentTime = entry.fireAt;
      try {
        const out = entry.fn();
        if (out && typeof out.then === 'function') {
          await out.catch(() => {});
        }
      } catch (_e) { /* swallow */ }
      if (entry.kind === 'interval' && !entry.cancelled) {
        entry.fireAt = currentTime + entry.intervalMs;
        _enqueue(entry);
      } else if (entry.kind === 'interval') {
        activeIntervalCount--;
      }
      await Promise.resolve();
    }
    currentTime = target;
    await Promise.resolve();
  }

  return {
    advance,
    now() { return currentTime; },
    activeIntervalCount() { return activeIntervalCount; },
    pendingCount() { return pending.length; },
    setInterval: virtualSetInterval,
    setTimeout: virtualSetTimeout,
    clearInterval: virtualClear,
    clearTimeout: virtualClear
  };
}

function createTaskStoreStub(writeSnapshotCalls) {
  const snapshots = {};
  return {
    writeSnapshot: (taskId, snap) => {
      writeSnapshotCalls.push({ taskId, snapshot: snap });
      snapshots[taskId] = snap;
      return Promise.resolve();
    },
    readSnapshot: (taskId) => Promise.resolve(snapshots[taskId] || null),
    deleteSnapshot: (taskId) => { delete snapshots[taskId]; return Promise.resolve(); },
    listInFlightSnapshots: () => Promise.resolve(
      Object.values(snapshots).filter((s) => s && s.status === 'in_progress')
    ),
    hydrate: () => Promise.resolve({ v: 1, records: { ...snapshots } })
  };
}

// ---- Seeded session and the bridge harness ---------------------------------

// The switch-off base session is {}: no fastMode key and no field the bridge
// reads from a session. Plan 70-06 passes { fastMode: ... } as extra.
function makeSeededSession(extra) {
  return Object.assign({}, extra);
}

function buildWireHarness({ sessionId = SESSION_ID, variant = 'V2', fastPathModule = null, session = null } = {}) {
  if (VARIANTS.indexOf(variant) === -1) throw new Error('unknown variant ' + variant);
  const chromeMock = createChromeMock();
  const FakeWebSocket = createFakeWebSocketClass();
  const clock = createVirtualClock(CLOCK_START_MS);
  const writeSnapshotCalls = [];
  const taskStoreStub = createTaskStoreStub(writeSnapshotCalls);
  const seededSession = session || makeSeededSession();
  const activeSessions = variant === 'V1' ? null : new Map();
  const dispatchCalls = [];

  const FakeDate = class extends Date {
    static now() { return clock.now(); }
  };

  const context = {
    chrome: chromeMock,
    WebSocket: FakeWebSocket,
    console,
    Math,
    Date: FakeDate,
    EventTarget,
    CustomEvent,
    setInterval: clock.setInterval,
    setTimeout: clock.setTimeout,
    clearInterval: clock.clearInterval,
    clearTimeout: clock.clearTimeout,
    Promise,
    dispatchMcpMessageRoute: async (request) => {
      dispatchCalls.push(request);
      // background.js handleStartAutomation runs activeSessions.set before
      // sendResponse, so the session is in the map when this resolves.
      if (variant === 'V2' || variant === 'V3') activeSessions.set(sessionId, seededSession);
      return { success: true, sessionId };
    },
    globalThis: {}
  };
  if (activeSessions) context.activeSessions = activeSessions;
  context.globalThis = context;
  context.fsbAutomationLifecycleBus = new EventTarget();
  context.FsbMcpTaskStore = taskStoreStub;
  if (variant === 'V3') context.FsbFastPath = fastPathModule || require(FAST_PATH_PATH);

  const source = fs.readFileSync(BRIDGE_PATH, 'utf8');
  const footer = `
this.__phase70wire = {
  MCPBridgeClient,
  mcpBridgeClient,
  lifecycleBus: typeof fsbAutomationLifecycleBus !== 'undefined' ? fsbAutomationLifecycleBus : null
};
`;
  vm.runInNewContext(`${source}\n${footer}`, context, { filename: 'ws/mcp-bridge-client.js' });

  const client = context.__phase70wire.mcpBridgeClient;
  const sent = [];
  client._send = (msg) => { sent.push(msg); };

  return {
    variant,
    chrome: chromeMock,
    clock,
    sockets: FakeWebSocket._sockets,
    writeSnapshotCalls,
    taskStoreStub,
    activeSessions,
    seededSession,
    dispatchCalls,
    sent,
    client,
    context,
    exports: context.__phase70wire
  };
}

function driveSettle(harness, pathName) {
  const bus = harness.exports.lifecycleBus;
  switch (pathName) {
    case 'runtime-complete':
      harness.chrome.runtime.onMessage._emit(jsonClone(COMPLETE_MESSAGE));
      return Promise.resolve();
    case 'bus-complete':
      bus.dispatchEvent(new CustomEvent('automationComplete', { detail: jsonClone(COMPLETE_MESSAGE) }));
      return Promise.resolve();
    case 'bus-error':
      bus.dispatchEvent(new CustomEvent('automationError', { detail: jsonClone(ERROR_MESSAGE) }));
      return Promise.resolve();
    case 'bus-stop':
      bus.dispatchEvent(new CustomEvent('automationComplete', { detail: jsonClone(STOP_MESSAGE) }));
      return Promise.resolve();
    case 'safety-net':
      return harness.clock.advance(SAFETY_NET_MS);
    default:
      throw new Error('unknown settle path ' + pathName);
  }
}

async function runSettlePath(pathName, opts = {}) {
  const harness = buildWireHarness(opts);
  const promise = harness.client._handleStartAutomation({ task: RUN_TASK_TEXT }, MCP_MSG_ID);
  await flushMicrotasks();
  await driveSettle(harness, pathName);
  const value = await promise;
  await flushMicrotasks();
  return { value, storeWrites: harness.writeSnapshotCalls, sent: harness.sent, harness };
}

// First heartbeat progress payload, 30 s after subscribe, then a clean settle.
async function captureHeartbeat(opts = {}) {
  const harness = buildWireHarness(opts);
  const promise = harness.client._handleStartAutomation({ task: RUN_TASK_TEXT }, MCP_MSG_ID);
  await flushMicrotasks();
  await harness.clock.advance(HEARTBEAT_MS);
  await flushMicrotasks();
  const progress = harness.sent.filter((m) => m && m.type === 'mcp:progress');
  await driveSettle(harness, 'bus-complete');
  await promise;
  await flushMicrotasks();
  return progress.length > 0 ? progress[0].payload : null;
}

function wireTextOf(value) {
  return JSON.stringify({ success: true, ...value }, null, 2);
}

// ---- Switch-on helpers (plan 70-06) -----------------------------------------

// The session field fsbFastModeSessionField gives an MCP start when the
// Advanced Settings switch is on (plan 70-02).
const FAST_MODE_FIELD = deepFreeze({ enabled: true, stored: true, source: 'mcp', budgetProfile: 'run_task' });

// What the bridge reports when the builder cannot run (D-19, RESEARCH F4).
const CLASSIFIER_ERROR_BLOCK = deepFreeze({
  outcome: 'ambiguous',
  reason: 'classifier_error',
  uncertain_unobserved: null,
  human_gate: null,
  budget_profile: null,
  jev: null
});

// agent-loop.js notifySidepanel for partial_task with reason manual_approval
// (createTerminalOutcome('partial', { reason: 'manual_approval', ... })).
const APPROVAL_SUMMARY = 'Stopped before paying: the order needs the user to approve it.';
const APPROVAL_MESSAGE = deepFreeze({
  action: 'automationComplete',
  sessionId: SESSION_ID,
  tabId: TAB_ID,
  conversationId: null,
  historySessionId: SESSION_ID,
  result: APPROVAL_SUMMARY,
  partial: true,
  stopped: false,
  error: null,
  reason: 'manual_approval',
  outcome: 'partial',
  blocker: 'Payment needs approval',
  nextStep: 'Approve the payment, then run the task again',
  outcomeDetails: {
    outcome: 'partial',
    reason: 'manual_approval',
    summary: APPROVAL_SUMMARY,
    blocker: 'Payment needs approval',
    nextStep: 'Approve the payment, then run the task again',
    result: APPROVAL_SUMMARY,
    error: null
  },
  task: RUN_TASK_TEXT
});

// background.js handleStartAutomation's content-script-not-ready abort: it
// broadcasts before the evidence registration line, with no outcome and no
// reason (70-SYNC-RECHECK item o).
const CONNECT_ERROR_TEXT = 'Could not connect to the page. Please refresh the page and try again. If the problem persists, reload the extension from chrome://extensions.';
const CONNECT_ABORT_MESSAGE = deepFreeze({
  action: 'automationError',
  sessionId: SESSION_ID,
  error: CONNECT_ERROR_TEXT,
  task: RUN_TASK_TEXT
});

// Executor-level tool results handed to the evidence afterTool handler.
const VERIFIED_CLICK_RESULT = deepFreeze({ success: true, result: { verification: { verified: true } } });
const UNKNOWN_CLICK_RESULT = deepFreeze({ success: false, result: { outcome: 'unknown', mayHaveExecuted: true } });

function omitKey(value, key) {
  const out = {};
  Object.keys(value).forEach((k) => { if (k !== key) out[k] = value[k]; });
  return out;
}

// A switched-on session: the 70-01 seed plus the fast-mode field (and any
// extra non-heartbeat fields), with the 70-03 run evidence record unless
// withEvidence is false. Returns { session, handlers }.
function makeFastSession(fastPathModule, { withEvidence = true, extra = {} } = {}) {
  const session = makeSeededSession(Object.assign({ fastMode: jsonClone(FAST_MODE_FIELD) }, extra));
  const handlers = withEvidence ? fastPathModule.createRunEvidenceHandlers(session, { startUrl: null }) : null;
  return { session, handlers };
}

function dispatchBus(harness, eventName, message) {
  harness.exports.lifecycleBus.dispatchEvent(new CustomEvent(eventName, { detail: jsonClone(message) }));
}

// Starts a run_task on a fresh harness. hooks.beforeStart(harness) runs before
// the start call, hooks.between(harness) while the task runs, and
// hooks.settle(harness) replaces the named settle path when given.
async function runWithHarness(pathName, opts = {}, hooks = {}) {
  const harness = buildWireHarness(opts);
  if (typeof hooks.beforeStart === 'function') hooks.beforeStart(harness);
  const promise = harness.client._handleStartAutomation({ task: RUN_TASK_TEXT }, MCP_MSG_ID);
  await flushMicrotasks();
  if (typeof hooks.between === 'function') await hooks.between(harness);
  if (typeof hooks.settle === 'function') await hooks.settle(harness);
  else await driveSettle(harness, pathName);
  const value = await promise;
  await flushMicrotasks();
  return { value, storeWrites: harness.writeSnapshotCalls, sent: harness.sent, harness };
}

// A switched-on run with the real FsbFastPath loaded (variant V3 shape).
async function runSwitchOn(pathName, fastPathModule, { withEvidence = true, extra = {}, between = null, settle = null } = {}) {
  const fast = makeFastSession(fastPathModule, { withEvidence, extra });
  const run = await runWithHarness(pathName, { variant: 'V3', fastPathModule, session: fast.session }, {
    between: between ? (harness) => between(harness, fast) : null,
    settle
  });
  run.fast = fast;
  return run;
}

// ---- Suite ------------------------------------------------------------------

async function runTest(name, fn) {
  console.log('\n---', name, '---');
  try {
    await fn();
  } catch (err) {
    failed++;
    console.error('  ERROR:', name, '--', err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
  }
}

async function main() {
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  const fastPathModule = require(FAST_PATH_PATH);

  await runTest('golden fixture shape', async () => {
    check(golden && /^[0-9a-f]{40}$/.test(golden.p70Start), 'golden carries the 40-hex P70_START');
    check(golden.sessionId === SESSION_ID, 'golden was captured for ' + SESSION_ID);
    check(SETTLE_PATHS.every((p) => golden.paths && golden.paths[p] && typeof golden.paths[p].wireText === 'string'
      && Array.isArray(golden.paths[p].storeWrites)), 'golden holds all five settle paths');
    check(golden.heartbeat && typeof golden.heartbeat === 'object', 'golden holds the first heartbeat payload');
  });

  await runTest('seeded session', async () => {
    const seed = makeSeededSession();
    check(HEARTBEAT_READ_FIELDS.every((f) => !Object.prototype.hasOwnProperty.call(seed, f))
      && !Object.prototype.hasOwnProperty.call(seed, 'fastMode'), 'seed has no heartbeat-read field');
  });

  // -------------------------------------------------------------------------
  // switch-off golden: every settle path under V1..V4
  // -------------------------------------------------------------------------
  const runs = {};
  for (const pathName of SETTLE_PATHS) {
    runs[pathName] = {};
    await runTest('switch-off ' + pathName, async () => {
      const expected = golden.paths[pathName];
      for (const variant of VARIANTS) {
        const opts = { variant };
        if (variant === 'V3') opts.fastPathModule = fastPathModule;
        const run = await runSettlePath(pathName, opts);
        runs[pathName][variant] = run;
        const valueMatches = plainEqual(run.value, expected.value);
        const writesMatch = plainEqual(run.storeWrites, expected.storeWrites);
        if (!valueMatches) console.error('    value:', JSON.stringify(run.value));
        if (!writesMatch) console.error('    storeWrites differ (' + run.storeWrites.length + ' vs ' + expected.storeWrites.length + ')');
        check(valueMatches && writesMatch, 'switch-off golden ' + pathName + ' ' + variant);
      }
      const variantRuns = VARIANTS.map((v) => runs[pathName][v]).filter(Boolean);
      check(variantRuns.length === VARIANTS.length
        && variantRuns.every((run) => wireTextOf(run.value) === expected.wireText), 'wire passthrough ' + pathName);
      check(variantRuns.length === VARIANTS.length
        && variantRuns.every((run) => plainEqual(jsonClone(run.value), run.value)
          && plainEqual(jsonClone(run.storeWrites), run.storeWrites)), 'json safe ' + pathName);
    });
  }

  await runTest('heartbeat', async () => {
    for (const variant of VARIANTS) {
      const opts = { variant };
      if (variant === 'V3') opts.fastPathModule = fastPathModule;
      const payload = await captureHeartbeat(opts);
      check(payload !== null && plainEqual(payload, golden.heartbeat), 'heartbeat unchanged ' + variant);
    }
  });

  // -------------------------------------------------------------------------
  // switch-on cases (plan 70-06)
  // -------------------------------------------------------------------------
  //
  // D-17, D-19, D-20: a run_task whose session had fastMode at start settles
  // with its switch-off value plus one key, fast_mode, appended last. Every
  // session here comes from makeSeededSession and carries no heartbeat-read
  // field, so everything but the block equals the 70-01 golden.

  const BLOCK_KEYS = Array.from(fastPathModule.FAST_MODE_BLOCK_KEYS);
  const SUMMARY_KEYS = Array.from(fastPathModule.FAST_MODE_SUMMARY_KEYS);

  await runTest('switch-off unchanged after edit', async () => {
    let matches = 0;
    for (const pathName of SETTLE_PATHS) {
      const expected = golden.paths[pathName];
      for (const variant of VARIANTS) {
        const opts = { variant };
        if (variant === 'V3') opts.fastPathModule = fastPathModule;
        const run = await runSettlePath(pathName, opts);
        if (plainEqual(run.value, expected.value) && plainEqual(run.storeWrites, expected.storeWrites)
          && wireTextOf(run.value) === expected.wireText && !('fast_mode' in run.value)) matches++;
      }
      // fastMode present but not set (never produced by background.js, which
      // spreads the field only when it is an object) still gives no block.
      const nullField = await runSettlePath(pathName, {
        variant: 'V3', fastPathModule, session: makeSeededSession({ fastMode: null })
      });
      if (plainEqual(nullField.value, expected.value) && plainEqual(nullField.storeWrites, expected.storeWrites)) matches++;
    }
    check(matches === SETTLE_PATHS.length * (VARIANTS.length + 1),
      'switch-off unchanged after edit (' + matches + '/' + (SETTLE_PATHS.length * (VARIANTS.length + 1)) + ' golden runs)');
  });

  const onRuns = {};
  for (const pathName of SETTLE_PATHS) {
    await runTest('switch-on ' + pathName, async () => {
      const expected = golden.paths[pathName];
      const run = await runSwitchOn(pathName, fastPathModule);
      onRuns[pathName] = run;
      const on = run.value;
      const off = expected.value;
      const added = Object.keys(on).filter((k) => !Object.keys(off).includes(k));
      const block = on && on.fast_mode;
      const additive = plainEqual(added, ['fast_mode'])
        && Object.keys(on).at(-1) === 'fast_mode'
        && plainEqual(omitKey(on, 'fast_mode'), off)
        && Object.is(on.success, off.success)
        && Object.is(on.status, off.status)
        && block && typeof block === 'object'
        && plainEqual(Object.keys(block), BLOCK_KEYS)
        && block.budget_profile === 'run_task'
        && block.jev && plainEqual(Object.keys(block.jev), SUMMARY_KEYS);
      if (!additive) console.error('    on:', JSON.stringify(on));
      check(additive, 'additive ' + pathName);

      const wire = { success: true, ...on };
      const parsed = JSON.parse(JSON.stringify(wire, null, 2));
      check(JSON.stringify(omitKey(parsed, 'fast_mode'), null, 2) === expected.wireText
        && Object.keys(parsed).at(-1) === 'fast_mode'
        && plainEqual(parsed.fast_mode, block), 'wire bytes ' + pathName);

      // The terminal write is the last one; every earlier write (subscribe,
      // heartbeats, the safety net's partial write) equals the golden's.
      const writes = run.storeWrites;
      const goldenWrites = expected.storeWrites;
      const last = writes.length - 1;
      const earlierMatch = writes.length === goldenWrites.length
        && writes.slice(0, last).every((w, i) => plainEqual(w, goldenWrites[i]));
      const terminal = writes[last];
      const goldenTerminal = goldenWrites[last];
      const terminalMatch = terminal && goldenTerminal
        && terminal.taskId === goldenTerminal.taskId
        && plainEqual(omitKey(terminal.snapshot, 'final_result'), omitKey(goldenTerminal.snapshot, 'final_result'))
        && plainEqual(terminal.snapshot.final_result, on)
        && plainEqual(goldenTerminal.snapshot.final_result, off);
      check(earlierMatch && terminalMatch, 'store carries block ' + pathName);
    });
  }

  await runTest('isolation', async () => {
    const throwingBuilder = { buildFastModeBlock() { throw new Error('builder failed'); } };
    const cyclicBuilder = {
      buildFastModeBlock() {
        const block = { outcome: 'done', reason: 'complete_task' };
        block.self = block;
        return block;
      }
    };
    const subCases = [
      { name: 'no module', variant: 'V2', module: null, getterThrows: false },
      { name: 'throwing getter', variant: 'V2', module: null, getterThrows: true },
      { name: 'throwing builder', variant: 'V3', module: throwingBuilder, getterThrows: false },
      { name: 'cyclic block', variant: 'V3', module: cyclicBuilder, getterThrows: false }
    ];
    for (const sub of subCases) {
      let ok = 0;
      for (const pathName of SETTLE_PATHS) {
        const fast = makeFastSession(fastPathModule);
        const opts = { variant: sub.variant, session: fast.session };
        if (sub.module) opts.fastPathModule = sub.module;
        const run = await runWithHarness(pathName, opts, {
          beforeStart: (harness) => {
            if (!sub.getterThrows) return;
            Object.defineProperty(harness.context, 'FsbFastPath', {
              configurable: true,
              enumerable: true,
              get() { throw new Error('FsbFastPath getter failed'); }
            });
          }
        });
        let serialisable = true;
        try { JSON.stringify(run.value); } catch (_e) { serialisable = false; }
        const block = run.value && run.value.fast_mode;
        if (block && plainEqual(block, CLASSIFIER_ERROR_BLOCK)
          && plainEqual(Object.keys(block), BLOCK_KEYS)
          && Object.keys(run.value).at(-1) === 'fast_mode'
          && plainEqual(omitKey(run.value, 'fast_mode'), golden.paths[pathName].value)
          && serialisable
          && run.harness.clock.activeIntervalCount() === 0) ok++;
        else console.error('    ' + sub.name + ' ' + pathName + ':', serialisable ? JSON.stringify(run.value) : '(not serialisable)');
      }
      check(ok === SETTLE_PATHS.length, 'isolation ' + sub.name + ' (' + ok + '/' + SETTLE_PATHS.length + ' paths)');
    }
  });

  await runTest('released at settle', async () => {
    for (const pathName of SETTLE_PATHS) {
      const fast = makeFastSession(fastPathModule);
      // reads counts every property read; blockReads only those of fields
      // the heartbeat never reads, so it shows the settle-time block read the
      // captured reference (the heartbeat reads the map entry itself).
      let reads = 0;
      let blockReads = 0;
      const spied = new Proxy(fast.session, {
        get(target, key, receiver) {
          reads++;
          if (typeof key === 'string' && !HEARTBEAT_READ_FIELDS.includes(key)) blockReads++;
          return Reflect.get(target, key, receiver);
        }
      });
      let blockReadsBeforeSettle = 0;
      const run = await runWithHarness(pathName, { variant: 'V3', fastPathModule, session: spied }, {
        between: () => { blockReadsBeforeSettle = blockReads; }
      });
      const readsAtSettle = reads;
      const blockReadsAtSettle = blockReads - blockReadsBeforeSettle;
      const writesAtSettle = run.storeWrites.length;
      const sentAtSettle = run.sent.length;
      const valueAtSettle = jsonClone(run.value);
      // A second ending of every kind, and the clock past both timers.
      run.harness.chrome.runtime.onMessage._emit(jsonClone(COMPLETE_MESSAGE));
      dispatchBus(run.harness, 'automationComplete', COMPLETE_MESSAGE);
      dispatchBus(run.harness, 'automationError', ERROR_MESSAGE);
      dispatchBus(run.harness, 'automationComplete', STOP_MESSAGE);
      await run.harness.clock.advance(SAFETY_NET_MS + HEARTBEAT_MS);
      await flushMicrotasks();
      check(blockReadsAtSettle > 0 && reads === readsAtSettle
        && run.value.fast_mode && run.value.fast_mode.budget_profile === 'run_task'
        && run.storeWrites.length === writesAtSettle
        && run.sent.length === sentAtSettle
        && plainEqual(jsonClone(run.value), valueAtSettle)
        && run.harness.clock.activeIntervalCount() === 0
        && run.harness.clock.pendingCount() === 0,
      'released at settle ' + pathName + ' (block reads at settle ' + blockReadsAtSettle + ', session reads after settle '
        + (reads - readsAtSettle) + ')');
    }
  });

  await runTest('no extra read', async () => {
    for (const variant of ['V2', 'V3', 'V4']) {
      let gets = 0;
      const opts = { variant };
      if (variant === 'V3') opts.fastPathModule = fastPathModule;
      const harness = buildWireHarness(opts);
      const realGet = harness.activeSessions.get;
      harness.activeSessions.get = function spyGet(key) { gets++; return realGet.call(this, key); };
      const promise = harness.client._handleStartAutomation({ task: RUN_TASK_TEXT }, MCP_MSG_ID);
      await flushMicrotasks();
      const getsBeforeHeartbeat = gets;
      await harness.clock.advance(HEARTBEAT_MS);
      await flushMicrotasks();
      const getsAfterHeartbeat = gets;
      dispatchBus(harness, 'automationComplete', COMPLETE_MESSAGE);
      const value = await promise;
      check(getsBeforeHeartbeat === 1 && getsAfterHeartbeat === 2 && !('fast_mode' in value),
        'no extra read ' + variant + ' (start path ' + getsBeforeHeartbeat + ', with first heartbeat ' + getsAfterHeartbeat + ')');
    }
  });

  // -------------------------------------------------------------------------
  // Bridge-level outcomes (plan 70-06 Task 2; SC2 at the wire, D-13)
  // -------------------------------------------------------------------------
  //
  // The evidence handlers are driven between the start and the ending, as
  // the session's hook pipeline would; the bridge then reports the typed
  // outcome while every existing key keeps its switch-off value.

  function outcomeMatches(run, want, label) {
    const block = run.value && run.value.fast_mode;
    const ok = !!block
      && plainEqual(Object.keys(block), BLOCK_KEYS)
      && Object.keys(run.value).at(-1) === 'fast_mode'
      && block.outcome === want.outcome
      && block.reason === want.reason
      && (!('uncertain_unobserved' in want) || block.uncertain_unobserved === want.uncertain_unobserved)
      && (!('human_gate' in want) || block.human_gate === want.human_gate)
      && block.budget_profile === 'run_task';
    if (!ok) console.error('    ' + label + ':', JSON.stringify(run.value));
    return ok;
  }

  function clickInFlight(_harness, fast) {
    fast.handlers.beforeTool({ toolName: 'click', origin: '', sessionId: SESSION_ID, iteration: 1 });
  }

  function clickWith(toolResult) {
    return (_harness, fast) => {
      fast.handlers.beforeTool({ toolName: 'click', origin: '', sessionId: SESSION_ID, iteration: 1 });
      fast.handlers.afterTool({ toolName: 'click', toolResult: jsonClone(toolResult), sessionId: SESSION_ID, iteration: 1 });
      fast.handlers.afterIteration({ sessionId: SESSION_ID, iteration: 1 });
      // The LLM's complete_task: a terminal tool is never marked in flight.
      fast.handlers.beforeTool({ toolName: 'complete_task', origin: '', sessionId: SESSION_ID, iteration: 2 });
    };
  }

  await runTest('wire outcome stop in flight', async () => {
    const run = await runSwitchOn('bus-stop', fastPathModule, { between: clickInFlight });
    check(outcomeMatches(run, { outcome: 'ambiguous', reason: 'uncertain_action', uncertain_unobserved: true }, 'stop in flight')
      && run.value.status === 'stopped'
      && plainEqual(omitKey(run.value, 'fast_mode'), golden.paths['bus-stop'].value), 'wire outcome stop in flight');
  });

  await runTest('wire outcome clean stop', async () => {
    const run = await runSwitchOn('bus-stop', fastPathModule);
    check(outcomeMatches(run, { outcome: 'blocked', reason: 'user_stopped', uncertain_unobserved: false, human_gate: null }, 'clean stop')
      && run.value.status === 'stopped'
      && plainEqual(omitKey(run.value, 'fast_mode'), golden.paths['bus-stop'].value), 'wire outcome clean stop');
  });

  await runTest('wire outcome safety net', async () => {
    const run = await runSwitchOn('safety-net', fastPathModule);
    const expected = golden.paths['safety-net'].value;
    check(outcomeMatches(run, { outcome: 'ambiguous', reason: 'safety_net_timeout' }, 'safety net')
      && run.value.success === expected.success
      && run.value.partial_outcome === expected.partial_outcome
      && plainEqual(run.value.partial_state, expected.partial_state)
      && run.value.hint === expected.hint
      && plainEqual(omitKey(run.value, 'fast_mode'), expected), 'wire outcome safety net');
  });

  await runTest('wire outcome manual approval', async () => {
    const run = await runSwitchOn('bus-complete', fastPathModule, {
      settle: (harness) => dispatchBus(harness, 'automationComplete', APPROVAL_MESSAGE)
    });
    check(outcomeMatches(run, { outcome: 'needs_confirmation', reason: 'manual_approval', human_gate: 'manual_approval' }, 'manual approval')
      && plainEqual(omitKey(run.value, 'fast_mode'), { sessionId: SESSION_ID, status: 'partial', result: APPROVAL_SUMMARY }),
    'wire outcome manual approval');
  });

  await runTest('wire outcome done', async () => {
    const run = await runSwitchOn('bus-complete', fastPathModule, { between: clickWith(VERIFIED_CLICK_RESULT) });
    check(outcomeMatches(run, { outcome: 'done', reason: 'complete_task', uncertain_unobserved: false, human_gate: null }, 'done')
      && plainEqual(omitKey(run.value, 'fast_mode'), golden.paths['bus-complete'].value), 'wire outcome done');
  });

  await runTest('wire outcome uncertain complete', async () => {
    const run = await runSwitchOn('bus-complete', fastPathModule, { between: clickWith(UNKNOWN_CLICK_RESULT) });
    const wire = { success: true, ...run.value };
    check(outcomeMatches(run, { outcome: 'ambiguous', reason: 'uncertain_action', uncertain_unobserved: true, human_gate: null }, 'uncertain complete')
      && wire.success === true
      && run.value.status === golden.paths['bus-complete'].value.status
      && run.value.status === 'success'
      && plainEqual(omitKey(run.value, 'fast_mode'), golden.paths['bus-complete'].value), 'wire outcome uncertain complete');
  });

  await runTest('wire outcome error', async () => {
    const run = await runSwitchOn('bus-error', fastPathModule);
    check(outcomeMatches(run, { outcome: 'blocked', reason: 'error', uncertain_unobserved: false, human_gate: null }, 'error')
      && run.value.status === 'error'
      && plainEqual(omitKey(run.value, 'fast_mode'), golden.paths['bus-error'].value), 'wire outcome error');
  });

  await runTest('wire outcome no evidence', async () => {
    const run = await runSwitchOn('bus-complete', fastPathModule, { withEvidence: false });
    check(!Object.prototype.hasOwnProperty.call(run.fast.session, '_fastRunEvidence')
      && outcomeMatches(run, { outcome: 'ambiguous', reason: 'evidence_unavailable', uncertain_unobserved: null, human_gate: null }, 'no evidence')
      && plainEqual(omitKey(run.value, 'fast_mode'), golden.paths['bus-complete'].value), 'wire outcome no evidence');
  });

  await runTest('wire outcome error without evidence', async () => {
    const run = await runSwitchOn('bus-error', fastPathModule, {
      withEvidence: false,
      settle: (harness) => dispatchBus(harness, 'automationError', CONNECT_ABORT_MESSAGE)
    });
    const rest = omitKey(run.value, 'fast_mode');
    check(!Object.prototype.hasOwnProperty.call(run.fast.session, '_fastRunEvidence')
      && outcomeMatches(run, { outcome: 'blocked', reason: 'error', uncertain_unobserved: null, human_gate: null }, 'error without evidence')
      && plainEqual(Object.keys(rest), ['sessionId', 'status', 'error'])
      && plainEqual(rest, { sessionId: SESSION_ID, status: 'error', error: CONNECT_ERROR_TEXT }), 'wire outcome error without evidence');
  });

  await runTest('wire marker scan', async () => {
    const MARK = 'P70WIRE_MARKER';
    const markRe = /p70wire/i;
    const markedComplete = Object.assign(jsonClone(COMPLETE_MESSAGE), {
      result: MARK + '_RESULT',
      outcomeDetails: Object.assign(jsonClone(COMPLETE_MESSAGE.outcomeDetails), { summary: MARK + '_SUMMARY', result: MARK + '_RESULT' }),
      task: MARK + '_TASK'
    });
    const markedError = Object.assign(jsonClone(ERROR_MESSAGE), {
      result: MARK + '_RESULT',
      error: MARK + '_ERROR',
      outcomeDetails: Object.assign(jsonClone(ERROR_MESSAGE.outcomeDetails), { result: MARK + '_RESULT', error: MARK + '_ERROR' }),
      task: MARK + '_TASK'
    });
    const markedStop = Object.assign(jsonClone(STOP_MESSAGE), { task: MARK + '_TASK' });
    const extra = {
      task: MARK + '_TASK',
      jevMeasurement: {
        v: 1,
        attempts: [{ calibrationStatus: MARK + '_CALIBRATION', op: MARK + '_OP' }],
        commands: [{ command: 0, fastSteps: 1, jevCalls: 1, jevMs: 5, escalations: { [MARK + '_ESC']: 1 } }]
      }
    };
    const drive = (_harness, fast) => {
      fast.handlers.beforeTool({ toolName: 'click', origin: '', sessionId: SESSION_ID, iteration: 1, args: { selector: MARK + '_SELECTOR' } });
      fast.handlers.afterTool({
        toolName: 'click',
        sessionId: SESSION_ID,
        iteration: 1,
        toolResult: { success: true, result: { verification: { verified: true }, text: MARK + '_CLICK', url: 'https://p70wire-marker.example/a' } }
      });
      fast.handlers.beforeTool({ toolName: 'get_text', origin: '', sessionId: SESSION_ID, iteration: 1 });
      fast.handlers.afterTool({
        toolName: 'get_text',
        sessionId: SESSION_ID,
        iteration: 1,
        toolResult: { success: true, result: { text: MARK + '_PAGE_TEXT', title: MARK + '_TITLE' } }
      });
      fast.handlers.afterIteration({ sessionId: SESSION_ID, iteration: 1 });
    };
    const settles = {
      'runtime-complete': (harness) => { harness.chrome.runtime.onMessage._emit(jsonClone(markedComplete)); },
      'bus-complete': (harness) => dispatchBus(harness, 'automationComplete', markedComplete),
      'bus-error': (harness) => dispatchBus(harness, 'automationError', markedError),
      'bus-stop': (harness) => dispatchBus(harness, 'automationComplete', markedStop),
      'safety-net': null
    };
    const escalationCodes = Array.from(fastPathModule.FAST_MODE_ESCALATION_CODES);
    let clean = 0;
    let markersReachedValue = 0;
    for (const pathName of SETTLE_PATHS) {
      const run = await runSwitchOn(pathName, fastPathModule, { extra, between: drive, settle: settles[pathName] });
      const block = run.value.fast_mode;
      const blockText = JSON.stringify(block);
      if (block && plainEqual(Object.keys(block), BLOCK_KEYS) && !markRe.test(blockText)
        && block.jev && Object.keys(block.jev.escalations).every((code) => escalationCodes.includes(code))) clean++;
      else console.error('    marker scan ' + pathName + ':', blockText);
      // The markers did reach the session and the value, so the scan is not vacuous.
      if (markRe.test(JSON.stringify(omitKey(run.value, 'fast_mode'))) || markRe.test(String(run.fast.session.task))) markersReachedValue++;
    }
    check(clean === SETTLE_PATHS.length && markersReachedValue === SETTLE_PATHS.length,
      'wire marker scan (' + clean + '/' + SETTLE_PATHS.length + ' blocks free of markers)');
  });

  console.log('\n--- Phase 70 run_task fast-mode wire summary ---');
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main !== module) {
  module.exports = {
    SESSION_ID,
    MCP_MSG_ID,
    CLOCK_START_MS,
    RUN_TASK_TEXT,
    TAB_ID,
    SETTLE_PATHS,
    VARIANTS,
    HEARTBEAT_READ_FIELDS,
    COMPLETE_MESSAGE,
    ERROR_MESSAGE,
    STOP_MESSAGE,
    makeSeededSession,
    buildWireHarness,
    runSettlePath,
    captureHeartbeat,
    plainEqual
  };
} else {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(2);
  });
}
