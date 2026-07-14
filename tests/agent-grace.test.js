'use strict';

/**
 * Phase 241 plan 01 task 3 -- reconnect grace stage / cancel / expire +
 * persisted stagedReleases envelope + hydrate-time recovery + LOG-04 emission
 * (LOCK-02 / D-07 / D-08 / D-09 / Q2).
 *
 * Validates:
 *   - stageReleaseByConnectionId stores staged entry, schedules setTimeout.
 *   - cancelStagedRelease clears the timer; agent NOT released.
 *   - Expiry releases all snapshot agentIds + emits LOG-04 'agent-grace-expired'.
 *   - Pitfall 3 (stale timer no-op): old timer firing post-fresh-claim does
 *     NOT touch the new agent.
 *   - Pitfall 1 hydrate-time recovery: deadline-passed fires immediately;
 *     deadline-future schedules fresh setTimeout.
 *   - Multi-agent same connection: stage releases ALL stamped agents.
 *   - Empty match returns false; no timer scheduled.
 *   - RECONNECT_GRACE_MS default = 10000.
 *
 * Run: node tests/agent-grace.test.js
 */

const assert = require('assert');
const REGISTRY_MODULE_PATH = require.resolve('../extension/utils/agent-registry.js');

function freshRequireRegistry() {
  delete require.cache[REGISTRY_MODULE_PATH];
  return require(REGISTRY_MODULE_PATH);
}

function createStorageArea(initial) {
  const store = Object.assign({}, initial || {});
  return {
    async get(keys) {
      if (keys == null) return Object.assign({}, store);
      if (Array.isArray(keys)) {
        const out = {};
        keys.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(store, key)) out[key] = store[key];
        });
        return out;
      }
      if (typeof keys === 'string') {
        return Object.prototype.hasOwnProperty.call(store, keys)
          ? { [keys]: store[keys] }
          : {};
      }
      return Object.assign({}, store);
    },
    async set(values) { Object.assign(store, values); },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => { delete store[key]; });
    },
    _dump() { return Object.assign({}, store); },
    _set(k, v) { store[k] = v; }
  };
}

function setupChromeMock(opts) {
  opts = opts || {};
  const session = createStorageArea(opts.session || {});
  const local = createStorageArea(opts.local || {});
  globalThis.chrome = {
    runtime: { id: 'phase-241-test', lastError: null },
    storage: {
      session: session,
      local: local,
      onChanged: { addListener() {} }
    },
    tabs: {
      async query() { return []; },
      async get(_id) { throw new Error('no tab'); },
      onRemoved: { addListener() {} }
    }
  };
  return { session: session, local: local };
}

function teardownChromeMock() {
  delete globalThis.chrome;
}

function setupDiagnosticCapture() {
  const captured = [];
  globalThis.rateLimitedWarn = function(prefix, category, message, ctx) {
    captured.push({ prefix: prefix, category: category, message: message, ctx: ctx });
  };
  globalThis.redactForLog = function(v) { return { kind: typeof v }; };
  return captured;
}

function teardownDiagnosticCapture() {
  delete globalThis.rateLimitedWarn;
  delete globalThis.redactForLog;
}

function installOwnerReleaseCapture() {
  const prior = globalThis.FsbTriggerLifecycle;
  const calls = [];
  globalThis.FsbTriggerLifecycle = {
    handleTriggerOwnerReleased(agentId) {
      calls.push(agentId);
      return Promise.resolve({ ok: true, reaped: 0 });
    }
  };
  return {
    calls: calls,
    restore() {
      if (prior === undefined) delete globalThis.FsbTriggerLifecycle;
      else globalThis.FsbTriggerLifecycle = prior;
    }
  };
}

(async () => {
  console.log('--- Test 1: stage + cancel + expire (D-08) ---');
  {
    setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);

      const A = (await reg.registerAgent()).agentId;
      reg.stampConnectionId(A, 'conn-X');
      await reg.bindTab(A, 100);

      // Stage with long deadline so we can verify state without expiry.
      const staged = await reg.stageReleaseByConnectionId('conn-X', 60000);
      assert.strictEqual(staged, true, 'stage returns true');
      assert.ok(reg._agents.has(A), 'A still in _agents post-stage');
      assert.ok(reg._stagedReleases.has('conn-X'), '_stagedReleases tracks conn-X');

      // Cancel.
      const cancelled = await reg.cancelStagedRelease('conn-X');
      assert.strictEqual(cancelled, true, 'cancel returns true');
      assert.ok(reg._agents.has(A), 'A still in _agents post-cancel');
      assert.strictEqual(reg._stagedReleases.has('conn-X'), false, 'staged entry cleared');

      // Re-stage with very short deadline.
      const staged2 = await reg.stageReleaseByConnectionId('conn-X', 50);
      assert.strictEqual(staged2, true, 'second stage returns true');
      // Wait for expiry.
      await new Promise((res) => setTimeout(res, 100));
      assert.strictEqual(reg._agents.has(A), false, 'A released after grace expiry');
      assert.strictEqual(reg._stagedReleases.has('conn-X'), false, 'staged entry cleared on expiry');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: stage + cancel + expire (D-08)');

  console.log('--- Test 2: stale timer no-op (Pitfall 3) ---');
  {
    setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);

      const A = (await reg.registerAgent()).agentId;
      reg.stampConnectionId(A, 'conn-A');

      // Stage A with short deadline.
      await reg.stageReleaseByConnectionId('conn-A', 50);

      // Mid-window: register B under fresh connection.
      await new Promise((res) => setTimeout(res, 25));
      const B = (await reg.registerAgent()).agentId;
      reg.stampConnectionId(B, 'conn-B');

      // Wait until A's timer fires.
      await new Promise((res) => setTimeout(res, 60));

      assert.strictEqual(reg._agents.has(A), false, 'A released by old timer');
      assert.strictEqual(reg._agents.has(B), true, 'B preserved (different connection_id)');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: stale timer filters by connectionId; fresh agents preserved');

  console.log('--- Test 3: LOG-04 agent-grace-expired emission (D-09) ---');
  {
    setupChromeMock();
    const captured = setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);

      const A = (await reg.registerAgent()).agentId;
      reg.stampConnectionId(A, 'conn-Z');
      await reg.bindTab(A, 100);
      await reg.bindTab(A, 101);

      await reg.stageReleaseByConnectionId('conn-Z', 50);
      await new Promise((res) => setTimeout(res, 100));

      const events = captured.filter(c => c.category === 'agent-grace-expired');
      assert.ok(events.length >= 1, 'at least one agent-grace-expired event emitted');
      const evt = events[0];
      assert.ok(evt.ctx, 'event has context payload');
      assert.strictEqual(evt.ctx.agentId, A, 'event payload includes agentId');
      assert.strictEqual(evt.ctx.connectionId, 'conn-Z', 'event payload includes connectionId');
      assert.strictEqual(typeof evt.ctx.poolSize, 'number', 'event payload includes poolSize');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: agent-grace-expired emitted with { agentId, connectionId, poolSize }');

  console.log('--- Test 3a: grace expiry notifies trigger lifecycle owner release ---');
  {
    setupChromeMock();
    setupDiagnosticCapture();
    const ownerRelease = installOwnerReleaseCapture();
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);

      const A = (await reg.registerAgent()).agentId;
      reg.stampConnectionId(A, 'conn-Z');

      await reg.stageReleaseByConnectionId('conn-Z', 50);
      await new Promise((res) => setTimeout(res, 100));

      assert.deepStrictEqual(ownerRelease.calls, [A],
        'expired grace calls handleTriggerOwnerReleased for the released agent');
    } finally {
      ownerRelease.restore();
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: owner-release hook called after grace expiry');

  console.log('--- Test 4: hydrate-time recovery, deadline already passed (Pitfall 1) ---');
  {
    const mock = setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const A = 'agent_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const envelope = {
        v: 1,
        records: {
          [A]: {
            agentId: A,
            createdAt: Date.now() - 60000,
            tabIds: [],
            connectionId: 'conn-Z'
          }
        },
        stagedReleases: {
          'conn-Z': {
            deadline: Date.now() - 1000, // ALREADY PASSED
            agentIds: [A]
          }
        }
      };
      mock.session._set('fsbAgentRegistry', envelope);

      const reg = new fresh.AgentRegistry();
      await reg.hydrate();
      // _fireStagedRelease may run after hydrate completes; await microtask.
      await new Promise((res) => setTimeout(res, 30));

      assert.strictEqual(reg._agents.has(A), false, 'A released on hydrate (deadline passed)');
      assert.strictEqual(reg._stagedReleases.has('conn-Z'), false, 'staged entry cleared');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: hydrate-time recovery for expired deadline');

  console.log('--- Test 5: hydrate-time recovery, deadline in future ---');
  {
    const mock = setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const A = 'agent_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const envelope = {
        v: 1,
        records: {
          [A]: {
            agentId: A,
            createdAt: Date.now() - 60000,
            tabIds: [],
            connectionId: 'conn-Future'
          }
        },
        stagedReleases: {
          'conn-Future': {
            deadline: Date.now() + 50, // 50ms remaining
            agentIds: [A]
          }
        }
      };
      mock.session._set('fsbAgentRegistry', envelope);

      const reg = new fresh.AgentRegistry();
      await reg.hydrate();

      assert.strictEqual(reg._agents.has(A), true, 'A still present immediately after hydrate');
      assert.ok(reg._stagedReleases.has('conn-Future'), 'staged release rescheduled');

      // Wait for the rescheduled timer to fire.
      await new Promise((res) => setTimeout(res, 100));
      assert.strictEqual(reg._agents.has(A), false, 'A released by rescheduled timer');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: hydrate-time recovery for future deadline');

  console.log('--- Test 6: multi-agent same connection ---');
  {
    setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);

      const A = (await reg.registerAgent()).agentId;
      const B = (await reg.registerAgent()).agentId;
      reg.stampConnectionId(A, 'conn-Y');
      reg.stampConnectionId(B, 'conn-Y');

      await reg.stageReleaseByConnectionId('conn-Y', 50);
      await new Promise((res) => setTimeout(res, 100));
      assert.strictEqual(reg._agents.has(A), false, 'A released');
      assert.strictEqual(reg._agents.has(B), false, 'B released');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: multi-agent same connection releases all on expiry');

  console.log('--- Test 7: empty match returns false; no timer ---');
  {
    setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);

      // No agent stamped with 'unknown-conn'.
      const r = await reg.stageReleaseByConnectionId('unknown-conn');
      assert.strictEqual(r, false, 'unknown connection returns false');
      assert.strictEqual(reg._stagedReleases.size, 0, '_stagedReleases empty');

      // Cancel of unknown returns false.
      const c = await reg.cancelStagedRelease('unknown-conn');
      assert.strictEqual(c, false, 'cancel unknown returns false');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: empty / unknown connection no-ops');

  console.log('--- Test 8: RECONNECT_GRACE_MS default 10000 ---');
  {
    setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);

      const A = (await reg.registerAgent()).agentId;
      reg.stampConnectionId(A, 'conn-Q');

      const before = Date.now();
      await reg.stageReleaseByConnectionId('conn-Q'); // no graceMs arg
      const entry = reg._stagedReleases.get('conn-Q');
      assert.ok(entry, 'staged entry exists');
      // Default 10000 ms with 50ms tolerance.
      assert.ok(
        entry.deadline >= before + 9950 && entry.deadline <= before + 10500,
        'deadline approximately Date.now() + 10000 (got ' + (entry.deadline - before) + ')'
      );
      // Cancel to avoid waiting 10s.
      await reg.cancelStagedRelease('conn-Q');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: RECONNECT_GRACE_MS default = 10000');

  // ===========================================================================
  // Phase 241 plan 02 task 2 -- bridge-side onopen/onclose wiring tests.
  //
  // These tests load extension/ws/mcp-bridge-client.js into a sandbox via vm,
  // instantiate MCPBridgeClient with a fake WebSocket constructor, and verify
  // that the bridge mints a connection_id at onopen, stages release at onclose,
  // and cancels the prior staged release on reconnect.
  // ===========================================================================
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');

  function buildBridgeWithRegistry(reg) {
    // Fake WebSocket whose onopen/onclose we trigger manually.
    class FakeWebSocket {
      constructor(_url) {
        this.readyState = FakeWebSocket.CONNECTING;
        this.sent = [];
        this.onopen = null;
        this.onclose = null;
        this.onmessage = null;
        this.onerror = null;
      }
      open() { this.readyState = FakeWebSocket.OPEN; if (this.onopen) this.onopen(); }
      close() { this.readyState = FakeWebSocket.CLOSED; if (this.onclose) this.onclose(); }
      send(p) { this.sent.push(p); }
    }
    FakeWebSocket.CONNECTING = 0;
    FakeWebSocket.OPEN = 1;
    FakeWebSocket.CLOSED = 3;

    const chromeMock = {
      runtime: { id: 'phase-241-bridge-test' },
      storage: {
        session: createStorageArea({}),
        local: createStorageArea({}),
        onChanged: { addListener() {} }
      },
      alarms: {
        async create() {}, async clear() { return true; }, async getAll() { return []; }
      },
      tabs: {
        async query() { return []; },
        async get() { throw new Error('no tab'); }
      }
    };

    const ctx = {
      chrome: chromeMock,
      WebSocket: FakeWebSocket,
      console: { log() {}, warn() {}, error() {} },
      Math: Math,
      Date: Date,
      crypto: globalThis.crypto || require('crypto').webcrypto,
      EventTarget: EventTarget,
      CustomEvent: typeof CustomEvent === 'function' ? CustomEvent : function CustomEvent() {},
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
      dispatchMcpMessageRoute: async () => ({ success: true }),
      // Phase 241: install the test registry singleton so the bridge's onopen
      // and onclose hooks can call cancelStagedRelease / stageReleaseByConnectionId
      // against it.
      fsbAgentRegistryInstance: reg,
      globalThis: {}
    };
    ctx.globalThis = ctx;

    const source = fs.readFileSync(
      path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'),
      'utf8'
    );
    const footer = `
this.__phase241bridge = {
  MCPBridgeClient,
  mcpBridgeClient,
  RECONNECT_GRACE_MS: typeof RECONNECT_GRACE_MS !== 'undefined' ? RECONNECT_GRACE_MS : null
};
`;
    vm.runInNewContext(source + '\n' + footer, ctx, { filename: 'ws/mcp-bridge-client.js' });
    return { exports: ctx.__phase241bridge, FakeWebSocket };
  }

  // Helper: clear pending timers on a bridge client so the test process exits.
  // The bridge schedules a setTimeout-based reconnect on every onclose; without
  // cancelling it the Node event loop stays alive for the full reconnect delay.
  function teardownBridgeClient(client) {
    if (!client) return;
    try {
      client._intentionalClose = true;
      if (client._reconnectTimer) { clearTimeout(client._reconnectTimer); client._reconnectTimer = null; }
      if (client._pingTimer) { clearInterval(client._pingTimer); client._pingTimer = null; }
      if (client._delegationHeartbeatTimer) {
        clearInterval(client._delegationHeartbeatTimer);
        client._delegationHeartbeatTimer = null;
      }
    } catch (_e) { /* best-effort */ }
  }

  async function connectBridgeClient(client) {
    client.connect();
    // Phase 59 validates trusted session pairing state before constructing
    // either the legacy or credential-subprotocol socket.
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.ok(client._ws, 'pairing preload eventually constructs the bridge socket');
    client._ws.open();
  }

  console.log('--- Test 9 (bridge): onopen mints connection_id ---');
  {
    setupChromeMock();
    setupDiagnosticCapture();
    let harness = null;
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);

      harness = buildBridgeWithRegistry(reg);
      const client = harness.exports.mcpBridgeClient;
      assert.strictEqual(harness.exports.RECONNECT_GRACE_MS, 10000,
        'bridge module exposes RECONNECT_GRACE_MS = 10000');

      assert.strictEqual(client._connectionId, null, 'no connectionId pre-connect');
      await connectBridgeClient(client);
      assert.strictEqual(typeof client._connectionId, 'string',
        'connectionId is a string after onopen');
      assert.ok(client._connectionId.length > 8, 'connectionId is non-trivial in length');
      // Optional UUID-ish shape check (hyphens allowed).
      assert.ok(/[a-f0-9-]/i.test(client._connectionId), 'connectionId looks UUID-ish');
      // getConnectionId() helper exposes the current id.
      assert.strictEqual(client.getConnectionId(), client._connectionId,
        'getConnectionId() reflects the current id');
    } finally {
      teardownBridgeClient(harness && harness.exports && harness.exports.mcpBridgeClient);
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: bridge onopen mints connection_id');

  console.log('--- Test 10 (bridge): onclose stages release for stamped agents ---');
  {
    setupChromeMock();
    setupDiagnosticCapture();
    let harness = null;
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);

      harness = buildBridgeWithRegistry(reg);
      const client = harness.exports.mcpBridgeClient;
      await connectBridgeClient(client);
      const conn = client._connectionId;

      const A = (await reg.registerAgent()).agentId;
      reg.stampConnectionId(A, conn);
      await reg.bindTab(A, 600);

      // Trigger onclose.
      client._ws.close();
      // Allow microtask for the staged-release withRegistryLock promise.
      await new Promise((r) => setTimeout(r, 20));

      assert.ok(reg._stagedReleases.has(conn),
        'staged release tracked under bridge connection_id');
      const entry = reg._stagedReleases.get(conn);
      assert.ok(entry.agentIds.indexOf(A) !== -1, 'staged entry includes agent A');
      assert.ok(reg._agents.has(A), 'A still in _agents during grace window');
    } finally {
      teardownBridgeClient(harness && harness.exports && harness.exports.mcpBridgeClient);
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: bridge onclose stages release via stageReleaseByConnectionId');

  console.log('--- Test 11 (bridge): onopen-after-close cancels prior staged release ---');
  {
    setupChromeMock();
    setupDiagnosticCapture();
    let harness = null;
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);

      harness = buildBridgeWithRegistry(reg);
      const client = harness.exports.mcpBridgeClient;

      await connectBridgeClient(client);
      const firstConn = client._connectionId;
      const A = (await reg.registerAgent()).agentId;
      reg.stampConnectionId(A, firstConn);
      await reg.bindTab(A, 700);

      // Disconnect: stages release for firstConn.
      client._ws.close();
      await new Promise((r) => setTimeout(r, 20));
      assert.ok(reg._stagedReleases.has(firstConn), 'first conn staged');

      // Reconnect: assigns a NEW connection_id and cancels the prior staged release.
      await connectBridgeClient(client);
      const secondConn = client._connectionId;
      assert.notStrictEqual(secondConn, firstConn, 'reconnect mints a fresh connection_id');
      await new Promise((r) => setTimeout(r, 20));

      assert.strictEqual(reg._stagedReleases.has(firstConn), false,
        'prior staged release cancelled on reopen');
      assert.ok(reg._agents.has(A), 'A preserved through the grace window');
    } finally {
      teardownBridgeClient(harness && harness.exports && harness.exports.mcpBridgeClient);
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: bridge onopen cancels prior staged release on reconnect');

  console.log('--- Test 11a (bridge): reconnect cancellation suppresses owner-release hook ---');
  {
    setupChromeMock();
    setupDiagnosticCapture();
    const ownerRelease = installOwnerReleaseCapture();
    let harness = null;
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);
      const realStageRelease = reg.stageReleaseByConnectionId.bind(reg);
      reg.stageReleaseByConnectionId = function(connectionId, _graceMs) {
        return realStageRelease(connectionId, 50);
      };

      harness = buildBridgeWithRegistry(reg);
      const client = harness.exports.mcpBridgeClient;

      await connectBridgeClient(client);
      const firstConn = client._connectionId;
      const A = (await reg.registerAgent()).agentId;
      reg.stampConnectionId(A, firstConn);

      client._ws.close();
      await new Promise((r) => setTimeout(r, 20));
      assert.ok(reg._stagedReleases.has(firstConn), 'first conn staged');

      await connectBridgeClient(client);
      await new Promise((r) => setTimeout(r, 100));

      assert.deepStrictEqual(ownerRelease.calls, [],
        'cancelled staged release does not call handleTriggerOwnerReleased');
      assert.ok(reg._agents.has(A), 'agent preserved after reconnect cancellation');
    } finally {
      teardownBridgeClient(harness && harness.exports && harness.exports.mcpBridgeClient);
      ownerRelease.restore();
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: bridge reconnect cancellation does not notify owner-release hook');

  console.log('--- Test 12 (bridge): onclose with no stamped agents is a no-op ---');
  {
    setupChromeMock();
    setupDiagnosticCapture();
    let harness = null;
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);

      harness = buildBridgeWithRegistry(reg);
      const client = harness.exports.mcpBridgeClient;

      await connectBridgeClient(client);
      // No agents stamped under this connection_id.
      client._ws.close();
      await new Promise((r) => setTimeout(r, 20));

      assert.strictEqual(reg._stagedReleases.size, 0,
        '_stagedReleases stays empty when no agents match');
    } finally {
      teardownBridgeClient(harness && harness.exports && harness.exports.mcpBridgeClient);
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: bridge onclose with no stamped agents is a clean no-op');

  console.log('--- Test 13 (bridge): RECONNECT_GRACE_MS const used by bridge ---');
  {
    setupChromeMock();
    setupDiagnosticCapture();
    let harness = null;
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);

      harness = buildBridgeWithRegistry(reg);
      const client = harness.exports.mcpBridgeClient;

      await connectBridgeClient(client);
      const conn = client._connectionId;
      const A = (await reg.registerAgent()).agentId;
      reg.stampConnectionId(A, conn);

      const before = Date.now();
      client._ws.close();
      await new Promise((r) => setTimeout(r, 20));

      const entry = reg._stagedReleases.get(conn);
      assert.ok(entry, 'staged entry created');
      // Default grace is 10s ± 50ms tolerance.
      const gap = entry.deadline - before;
      assert.ok(gap >= 9950 && gap <= 10500,
        'bridge passed RECONNECT_GRACE_MS=10000 (got ' + gap + ')');
      // Cancel so the test process does not have to wait 10s.
      await reg.cancelStagedRelease(conn);
    } finally {
      teardownBridgeClient(harness && harness.exports && harness.exports.mcpBridgeClient);
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: bridge passes RECONNECT_GRACE_MS=10000 to stageReleaseByConnectionId');

  console.log('--- Test 14 (bridge): delegation heartbeat remains separate from reconnect grace ---');
  {
    const bridgeSource = fs.readFileSync(
      path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'),
      'utf8'
    );
    assert.ok(
      bridgeSource.includes('const RECONNECT_GRACE_MS = 10000;'),
      'legacy agent transport grace remains exactly ten seconds'
    );
    assert.ok(
      bridgeSource.includes('const DELEGATION_HEARTBEAT_INTERVAL_MS = 20000;'),
      'active delegation acknowledgement interval is independently pinned to twenty seconds'
    );
    assert.ok(
      bridgeSource.includes('const DELEGATION_HEARTBEAT_MISS_LIMIT = 3;'),
      'active delegation connection classification requires three misses'
    );
    assert.ok(
      bridgeSource.includes('this._delegationHeartbeatOwners = new Set();'),
      'heartbeat owners use one Set-backed refcount roster'
    );
    assert.ok(
      bridgeSource.includes('retainDelegationHeartbeat(ownerId)')
        && bridgeSource.includes('releaseDelegationHeartbeat(ownerId)'),
      'bridge exposes paired retain/release heartbeat APIs'
    );
    assert.ok(
      bridgeSource.includes('stageReleaseByConnectionId(this._connectionId, RECONNECT_GRACE_MS)'),
      'socket-close agent release still uses only the legacy reconnect grace'
    );
    assert.ok(
      !/stageReleaseByConnectionId\([^\n]*DELEGATION_HEARTBEAT/.test(bridgeSource),
      'delegation heartbeat timing never replaces or widens agent transport grace'
    );
  }
  console.log('  PASS: 20s/three-miss heartbeat and 10s agent grace are independent contracts');

  console.log('--- Test 15 (bridge): heartbeat recovery has no native or restart authority ---');
  {
    const bridgeSource = fs.readFileSync(
      path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'),
      'utf8'
    );
    const heartbeatStart = bridgeSource.indexOf('retainDelegationHeartbeat(ownerId)');
    const heartbeatEnd = bridgeSource.indexOf('// Message handling', heartbeatStart);
    assert.ok(heartbeatStart >= 0 && heartbeatEnd > heartbeatStart,
      'heartbeat implementation region is present for closed source audit');
    const heartbeatSource = bridgeSource.slice(heartbeatStart, heartbeatEnd);
    for (const pattern of [
      /connectNative|sendNativeMessage|nativeMessaging/,
      /child_process|\bprocess\s*\./,
      /\b(?:execFile|execSync|spawn|spawnSync|fork)\s*\(/,
      /restart|replay/i,
      /sendExtRequest|dispatchMcpMessageRoute|chrome\.runtime\.sendMessage/,
    ]) {
      assert.strictEqual(pattern.test(heartbeatSource), false,
        'heartbeat region has no native, restart, execute, or work-dispatch path matching ' + pattern);
    }
    assert.ok(
      heartbeatSource.includes("this._ws.send(JSON.stringify({ type: 'mcp:ping', ts: Date.now(), nonce }))"),
      'heartbeat authority is limited to its exact mcp:ping frame'
    );
  }
  console.log('  PASS: heartbeat classifies connectivity without native execution or restart inference');

  console.log('PASS grace');
})().catch(err => {
  console.error('FAIL grace:', err && err.stack || err);
  process.exit(1);
});
