'use strict';

/**
 * Phase 239 plan 03 -- run_task resolve-discipline regression suite.
 *
 * Validates the lifecycle-vs-safety-net race, the 600s safety-net firing
 * with D-06 partial_outcome shape, the SW-eviction sw_evicted server-side
 * catch, and the single-resolve invariant under microtask-boundary races.
 *
 * Wave 0 (RED): all 6 cases initially fail because the ceiling raise (Task
 * 1) and the resolve-discipline implementations (Task 2) have not yet
 * landed.
 * Wave 1 (GREEN): all 6 cases pass after Tasks 1 + 2 land.
 *
 * Test cases:
 *   1. lifecycle_wins_race
 *   2. safety_net_fires_with_partial_outcome
 *   3. safety_net_at_600_000_not_300_000
 *   4. sw_wake_settles_with_sw_evicted
 *   5. no_double_resolve_under_race
 *   6. heartbeat_ticker_cleared_on_safety_net
 *   7. sw_evicted_reports_disconnect_reason
 *
 * Run: node tests/run-task-resolve-discipline.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());
}

// ---- Shared chrome / lifecycle / clock builders --------------------------

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
    runtime: { id: 'phase-239-test', onMessage: createOnMessageMock(), lastError: null },
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

// In-context virtual clock that mirrors run-task-heartbeat's clock so the
// ticker + safety-net interact with the same time source.
function createVirtualClock() {
  let currentTime = 0;
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

function buildHarness(opts = {}) {
  const chromeMock = createChromeMock();
  const FakeWebSocket = createFakeWebSocketClass();
  const clock = createVirtualClock();
  const writeSnapshotCalls = [];
  const seedSnapshots = opts.seedSnapshots || {};

  // Stub task-store: serves the seeded snapshots through readSnapshot AND
  // records every writeSnapshot call.
  const taskStoreStub = {
    writeSnapshot: (taskId, snap) => {
      writeSnapshotCalls.push({ taskId, snapshot: snap });
      seedSnapshots[taskId] = snap;
      return Promise.resolve();
    },
    readSnapshot: (taskId) => Promise.resolve(seedSnapshots[taskId] || null),
    deleteSnapshot: (taskId) => { delete seedSnapshots[taskId]; return Promise.resolve(); },
    listInFlightSnapshots: () => Promise.resolve(
      Object.values(seedSnapshots).filter((s) => s && s.status === 'in_progress')
    ),
    hydrate: () => Promise.resolve({ v: 1, records: { ...seedSnapshots } })
  };

  const activeSessions = new Map();

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
    activeSessions,
    dispatchMcpMessageRoute: opts.dispatchMcpMessageRoute || (async () => ({ success: true, sessionId: opts.sessionId || 'sess_test' })),
    globalThis: {}
  };
  context.globalThis = context;

  context.fsbAutomationLifecycleBus = new EventTarget();
  context.FsbMcpTaskStore = taskStoreStub;

  const source = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'),
    'utf8'
  );
  const footer = `
this.__phase239 = {
  MCPBridgeClient,
  mcpBridgeClient,
  lifecycleBus: typeof fsbAutomationLifecycleBus !== 'undefined' ? fsbAutomationLifecycleBus : null
};
`;
  vm.runInNewContext(`${source}\n${footer}`, context, { filename: 'ws/mcp-bridge-client.js' });

  return {
    chrome: chromeMock,
    clock,
    sockets: FakeWebSocket._sockets,
    writeSnapshotCalls,
    activeSessions,
    seedSnapshots,
    taskStoreStub,
    context,
    exports: context.__phase239
  };
}

// ---- Tests ---------------------------------------------------------------

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

(async () => {

  // -----------------------------------------------------------------------
  // Test 1: lifecycle_wins_race
  // -----------------------------------------------------------------------
  await runTest('lifecycle_wins_race', async () => {
    const sessionId = 'sess_lifecycle_wins';
    const harness = buildHarness({ sessionId });
    const client = harness.exports.mcpBridgeClient;
    const sent = [];
    client._send = (msg) => sent.push(msg);

    const promise = client._handleStartAutomation({ task: 'lifecycle wins' }, 'mcp_lw');
    await flushMicrotasks();

    // Dispatch lifecycle event BEFORE 600s safety net fires.
    harness.exports.lifecycleBus.dispatchEvent(new CustomEvent('automationComplete', {
      detail: { action: 'automationComplete', sessionId, result: { ok: true }, outcome: 'success' }
    }));

    const resolved = await promise;

    // Now advance past 600_000 ms. The safety net firing must be a no-op.
    await harness.clock.advance(700_000);
    await flushMicrotasks();

    assert(resolved && resolved.status !== 'timeout', 'resolved status is NOT timeout (came from bus)');
    assert(!('partial_outcome' in (resolved || {})), 'resolved value does not contain partial_outcome');

    // Single-resolve discipline: heartbeat ticker must be cleared after settle.
    assertEqual(harness.clock.activeIntervalCount(), 0, 'heartbeat ticker was cleared');
  });

  // -----------------------------------------------------------------------
  // Test 2: safety_net_fires_with_partial_outcome
  // -----------------------------------------------------------------------
  await runTest('safety_net_fires_with_partial_outcome', async () => {
    const sessionId = 'sess_safety_net';
    const seededSnapshot = {
      task_id: sessionId,
      status: 'in_progress',
      started_at: 0,
      last_heartbeat_at: 30000,
      originating_mcp_call_id: 'mcp_safety',
      target_tab_id: 42,
      current_step: 3,
      ai_cycle_count: 3,
      last_dom_hash: 'hash_seed',
    };
    const harness = buildHarness({
      sessionId,
      seedSnapshots: { [sessionId]: { ...seededSnapshot } }
    });
    const client = harness.exports.mcpBridgeClient;
    const sent = [];
    client._send = (msg) => sent.push(msg);

    const promise = client._handleStartAutomation({ task: 'safety net' }, 'mcp_safety');
    await flushMicrotasks();

    // Advance past the 600s safety-net ceiling. No lifecycle event dispatched.
    await harness.clock.advance(600_001);
    await flushMicrotasks();

    const resolved = await promise;

    assertEqual(resolved.success, true, 'success: true (intentional -- host salvages progress)');
    assertEqual(resolved.partial_outcome, 'timeout', "partial_outcome: 'timeout'");
    assert(resolved.partial_state && resolved.partial_state.task_id === sessionId,
      'partial_state populated from store snapshot');
    assertEqual(resolved.hint, 'lifecycle event missing -- audit cleanup paths', 'hint string verbatim');
  });

  // -----------------------------------------------------------------------
  // Test 3: safety_net_at_600_000_not_300_000
  // -----------------------------------------------------------------------
  await runTest('safety_net_at_600_000_not_300_000', async () => {
    const sessionId = 'sess_ceiling_raise';
    const harness = buildHarness({
      sessionId,
      seedSnapshots: {
        [sessionId]: {
          task_id: sessionId,
          status: 'in_progress',
          started_at: 0,
          last_heartbeat_at: 0,
          originating_mcp_call_id: 'mcp_cr',
          target_tab_id: null,
          current_step: 0,
          ai_cycle_count: 0,
          last_dom_hash: null,
        }
      }
    });
    const client = harness.exports.mcpBridgeClient;
    const sent = [];
    client._send = (msg) => sent.push(msg);

    let resolvedAt = null;
    const promise = client._handleStartAutomation({ task: 'ceiling raise' }, 'mcp_cr')
      .then((v) => { resolvedAt = harness.clock.now(); return v; });
    await flushMicrotasks();

    // Advance 300_000ms first; safety net MUST NOT have fired yet.
    await harness.clock.advance(300_000);
    await flushMicrotasks();
    assertEqual(resolvedAt, null, 'no settle at t=300_000 (proves ceiling is now > 300s)');

    // Advance another 300_001ms; safety net fires at t=600_000.
    await harness.clock.advance(300_001);
    await flushMicrotasks();

    const resolved = await promise;
    assertEqual(resolved.partial_outcome, 'timeout', 'safety net fired at 600s with partial_outcome');
    assert(resolvedAt !== null && resolvedAt >= 600_000, 'resolved at t >= 600_000');
  });

  // -----------------------------------------------------------------------
  // Test 4: sw_wake_settles_with_sw_evicted
  // -----------------------------------------------------------------------
  // NOTE: This case exercises the SERVER-side path (mcp/src/tools/autopilot.ts).
  // It loads the compiled JS output, mocks bridge.sendAndWait to throw
  // 'Bridge disconnected' on the first call (mcp:start-automation), then
  // resolves the second call (mcp:get-task-snapshot) with the seeded snapshot.
  await runTest('sw_wake_settles_with_sw_evicted', async () => {
    const buildPath = path.join(__dirname, '..', 'mcp', 'build', 'tools', 'autopilot.js');
    if (!fs.existsSync(buildPath)) {
      // RED until Task 1+2 land and `npm --prefix mcp run build` is run.
      failed++;
      console.error('  FAIL: mcp/build/tools/autopilot.js not present (run npm --prefix mcp run build)');
      return;
    }

    // Detect whether the build contains the sw_evicted catch (RED if not).
    const builtSrc = fs.readFileSync(buildPath, 'utf8');
    if (!/sw_evicted/.test(builtSrc) || !/Bridge disconnected/.test(builtSrc)) {
      failed++;
      console.error('  FAIL: built autopilot.js missing sw_evicted catch (Task 2 not landed)');
      return;
    }

    const agentId = 'agent_sw_wake';
    const seededSnapshot = {
      task_id: agentId,
      status: 'in_progress',
      started_at: 1000,
      last_heartbeat_at: 12345,
      originating_mcp_call_id: 'mcp_swwake',
      target_tab_id: 7,
      current_step: 2,
      ai_cycle_count: 2,
      last_dom_hash: 'hash_pre_evict',
    };

    // Build a minimal MCP server stub that captures the run_task tool body,
    // then invoke it directly with a mock bridge that throws on the first
    // sendAndWait and resolves on the second.
    let toolBody = null;
    const serverStub = {
      tool(name, _desc, _schema, handler) {
        if (name === 'run_task') toolBody = handler;
      },
      sendLoggingMessage() {}
    };

    let sendCallCount = 0;
    let bridgeIsConnected = false;
    const bridgeStub = {
      get isConnected() { return bridgeIsConnected; },
      async sendAndWait(msg, _opts) {
        sendCallCount += 1;
        if (sendCallCount === 1) {
          // First call: mcp:start-automation -- simulate bridge disconnect.
          // Reconnect happens "during" the catch's wait loop.
          setTimeout(() => { bridgeIsConnected = true; }, 0);
          throw new Error('Bridge disconnected');
        }
        if (msg && msg.type === 'mcp:get-task-snapshot') {
          return { success: true, snapshot: seededSnapshot };
        }
        throw new Error('unexpected sendAndWait: ' + (msg && msg.type));
      }
    };

    const queueStub = {
      async enqueue(_name, fn) { return fn(); }
    };

    const agentScopeStub = {
      async ensure(_bridge) { return agentId; }
    };

    // Initially mark the bridge as connected so the upfront isConnected
    // check passes. The first sendAndWait will throw to simulate the
    // disconnect happening mid-call.
    bridgeIsConnected = true;

    const { registerAutopilotTools } = require(buildPath);
    registerAutopilotTools(serverStub, bridgeStub, queueStub, agentScopeStub);

    if (typeof toolBody !== 'function') {
      failed++;
      console.error('  FAIL: run_task tool body not registered');
      return;
    }

    const result = await toolBody({ task: 'a long task' }, { _meta: {} });

    // result should be { content: [{ type: 'text', text: '<json>' }] }
    assert(result && Array.isArray(result.content) && result.content[0],
      'tool result has content array');
    const text = result.content[0] && result.content[0].text;
    assert(typeof text === 'string', 'content[0].text is a string');
    let parsed;
    try { parsed = JSON.parse(text); } catch (_e) { parsed = null; }
    assert(parsed && typeof parsed === 'object', 'content[0].text JSON-parses');
    if (parsed) {
      assertEqual(parsed.sw_evicted, true, 'parsed.sw_evicted === true');
      assertEqual(parsed.disconnect_reason, 'bridge_disconnected', 'a cause-free disconnect reports bridge_disconnected');
      assert(parsed.partial_state && parsed.partial_state.task_id === agentId,
        'parsed.partial_state.task_id matches agentId');
      assert(parsed.last_heartbeat_at === 12345 || parsed.last_heartbeat_at === seededSnapshot.last_heartbeat_at,
        'parsed.last_heartbeat_at populated from snapshot');
      assert('success' in parsed, 'parsed has a success field');
    }
  });

  // -----------------------------------------------------------------------
  // Test 5: no_double_resolve_under_race
  // -----------------------------------------------------------------------
  await runTest('no_double_resolve_under_race', async () => {
    const sessionId = 'sess_double_race';
    const harness = buildHarness({
      sessionId,
      seedSnapshots: {
        [sessionId]: {
          task_id: sessionId, status: 'in_progress', started_at: 0,
          last_heartbeat_at: 0, originating_mcp_call_id: 'mcp_dr',
          target_tab_id: null, current_step: 0, ai_cycle_count: 0,
          last_dom_hash: null
        }
      }
    });
    const client = harness.exports.mcpBridgeClient;
    const sent = [];
    client._send = (msg) => sent.push(msg);

    let resolveCount = 0;
    const promise = client._handleStartAutomation({ task: 'race' }, 'mcp_dr')
      .then((v) => { resolveCount += 1; return v; });
    await flushMicrotasks();

    // Race the two settles in the same microtask boundary: dispatch lifecycle
    // event AND advance past the safety-net ceiling. The settled-flag guard
    // must keep the second-to-fire path a no-op.
    await Promise.all([
      Promise.resolve().then(() => {
        harness.exports.lifecycleBus.dispatchEvent(new CustomEvent('automationComplete', {
          detail: { action: 'automationComplete', sessionId, result: {} }
        }));
      }),
      Promise.resolve().then(() => harness.clock.advance(600_001))
    ]);
    await flushMicrotasks();
    await flushMicrotasks();

    const resolved = await promise;
    assertEqual(resolveCount, 1, 'exactly one resolve recorded');
    assert(resolved !== undefined, 'resolved value is defined');
    assertEqual(harness.clock.activeIntervalCount(), 0, 'heartbeat ticker cleared after race resolution');
  });

  // -----------------------------------------------------------------------
  // Test 6: heartbeat_ticker_cleared_on_safety_net
  // -----------------------------------------------------------------------
  await runTest('heartbeat_ticker_cleared_on_safety_net', async () => {
    const sessionId = 'sess_ticker_cleared';
    const harness = buildHarness({
      sessionId,
      seedSnapshots: {
        [sessionId]: {
          task_id: sessionId, status: 'in_progress', started_at: 0,
          last_heartbeat_at: 0, originating_mcp_call_id: 'mcp_tc',
          target_tab_id: null, current_step: 0, ai_cycle_count: 0,
          last_dom_hash: null
        }
      }
    });
    const client = harness.exports.mcpBridgeClient;
    const sent = [];
    client._send = (msg) => sent.push(msg);

    const promise = client._handleStartAutomation({ task: 'ticker cleared' }, 'mcp_tc');
    await flushMicrotasks();

    // Advance past 600_000 to fire the safety net.
    await harness.clock.advance(600_001);
    await flushMicrotasks();
    await promise;

    const progressBefore = sent.filter((m) => m && m.type === 'mcp:progress').length;

    // Advance another 60s; ticker should be cleared, no further _sendProgress.
    await harness.clock.advance(60_000);
    await flushMicrotasks();
    const progressAfter = sent.filter((m) => m && m.type === 'mcp:progress').length;

    assertEqual(progressAfter, progressBefore, 'no further heartbeat ticks after safety-net settle');
    assertEqual(harness.clock.activeIntervalCount(), 0, '0 active intervals after safety-net settle');
  });

  // -----------------------------------------------------------------------
  // Test 7: sw_evicted_reports_disconnect_reason
  // -----------------------------------------------------------------------
  // sw_evicted stays true for every disconnect because the recovery is the
  // same; the cause the bridge attached must still reach the caller, and a
  // malformed one must never be echoed.
  await runTest('sw_evicted_reports_disconnect_reason', async () => {
    const buildPath = path.join(__dirname, '..', 'mcp', 'build', 'tools', 'autopilot.js');
    const { registerAutopilotTools } = require(buildPath);

    async function runTaskAfterDisconnect(disconnectError) {
      let toolBody = null;
      const serverStub = {
        tool(name, _desc, _schema, handler) {
          if (name === 'run_task') toolBody = handler;
        },
        sendLoggingMessage() {}
      };
      let sendCallCount = 0;
      let bridgeIsConnected = true;
      const bridgeStub = {
        get isConnected() { return bridgeIsConnected; },
        async sendAndWait(msg) {
          sendCallCount += 1;
          if (sendCallCount === 1) {
            setTimeout(() => { bridgeIsConnected = true; }, 0);
            bridgeIsConnected = false;
            throw disconnectError;
          }
          if (msg && msg.type === 'mcp:get-task-snapshot') {
            return { success: true, snapshot: { task_id: 'agent_reason', status: 'in_progress', last_heartbeat_at: 1 } };
          }
          throw new Error('unexpected sendAndWait: ' + (msg && msg.type));
        }
      };
      registerAutopilotTools(
        serverStub,
        bridgeStub,
        { async enqueue(_name, fn) { return fn(); } },
        { async ensure() { return 'agent_reason'; } },
      );
      const result = await toolBody({ task: 'a long task' }, { _meta: {} });
      return JSON.parse(result.content[0].text);
    }

    const revoked = new Error('Extension disconnected');
    revoked.bridgeDisconnectReason = 'extension_auth_revoked';
    const revokedResult = await runTaskAfterDisconnect(revoked);
    assertEqual(revokedResult.sw_evicted, true, 'a revocation still arms the sw_evicted recovery');
    assertEqual(revokedResult.disconnect_reason, 'extension_auth_revoked', 'a revocation is reported as one, not as an eviction');

    const malformed = new Error('Extension disconnected');
    malformed.bridgeDisconnectReason = 'Not A Code!';
    const malformedResult = await runTaskAfterDisconnect(malformed);
    assertEqual(malformedResult.disconnect_reason, 'bridge_disconnected', 'a malformed cause falls back to bridge_disconnected');
  });

  console.log('\n--- Phase 239 plan 03 run-task-resolve-discipline summary ---');
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
