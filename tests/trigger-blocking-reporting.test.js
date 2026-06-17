'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const vm = require('vm');
const {
  createToolHarness,
  loadAgentScope,
  loadBuildModule,
} = require('./mcp-smoke-harness.js');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function checkDeepEqual(actual, expected, msg) {
  check(util.isDeepStrictEqual(actual, expected), `${msg} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());
}

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
      const index = listeners.indexOf(fn);
      if (index !== -1) listeners.splice(index, 1);
    },
    _emit(message, sender = {}, sendResponse = () => {}) {
      for (const fn of [...listeners]) fn(message, sender, sendResponse);
    },
    _listeners() { return [...listeners]; }
  };
}

function createChromeMock() {
  return {
    runtime: { id: 'phase-19-trigger-reporting', onMessage: createOnMessageMock(), lastError: null },
    storage: {
      session: createStorageArea(),
      local: createStorageArea(),
    },
    alarms: {
      async create() {},
      async clear() { return true; },
      async getAll() { return []; },
    },
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

function createVirtualClock() {
  let currentTime = 0;
  let nextHandle = 1;
  const pending = [];
  const activeIntervals = new Set();

  function enqueue(entry) {
    pending.push(entry);
    pending.sort((a, b) => (a.fireAt - b.fireAt) || (a.order - b.order));
    return entry.handle;
  }

  function setTimeoutShim(fn, ms) {
    const handle = nextHandle++;
    return enqueue({
      fireAt: currentTime + (Number(ms) || 0),
      fn,
      kind: 'timeout',
      handle,
      order: handle,
      cancelled: false,
    });
  }

  function setIntervalShim(fn, ms) {
    const handle = nextHandle++;
    activeIntervals.add(handle);
    return enqueue({
      fireAt: currentTime + (Number(ms) || 0),
      fn,
      kind: 'interval',
      intervalMs: Number(ms) || 0,
      handle,
      order: handle,
      cancelled: false,
    });
  }

  function clearShim(handle) {
    if (handle == null) return;
    activeIntervals.delete(handle);
    for (const entry of pending) {
      if (entry.handle === handle) entry.cancelled = true;
    }
  }

  async function advance(ms) {
    const target = currentTime + (Number(ms) || 0);
    while (pending.length > 0) {
      pending.sort((a, b) => (a.fireAt - b.fireAt) || (a.order - b.order));
      const entry = pending[0];
      if (entry.fireAt > target) break;
      pending.shift();
      if (entry.cancelled) continue;
      currentTime = entry.fireAt;
      try {
        const out = entry.fn();
        if (out && typeof out.then === 'function') {
          await out.catch(() => {});
        }
      } catch (_e) { /* test harness ignores handler errors */ }
      if (entry.kind === 'interval' && activeIntervals.has(entry.handle)) {
        entry.fireAt = currentTime + entry.intervalMs;
        enqueue(entry);
      }
      await flushMicrotasks();
    }
    currentTime = target;
    await flushMicrotasks();
  }

  return {
    advance,
    now() { return currentTime; },
    activeIntervalCount() { return activeIntervals.size; },
    setTimeout: setTimeoutShim,
    setInterval: setIntervalShim,
    clearTimeout: clearShim,
    clearInterval: clearShim,
  };
}

function buildBridgeHarness(options = {}) {
  const chrome = createChromeMock();
  const FakeWebSocket = createFakeWebSocketClass();
  const clock = createVirtualClock();
  const snapshots = { ...(options.snapshots || {}) };
  const dispatchCalls = [];
  const progressCalls = [];

  const triggerStore = {
    async readSnapshot(triggerId) {
      return snapshots[triggerId] || null;
    },
    async writeSnapshot(triggerId, snapshot) {
      snapshots[triggerId] = snapshot;
    },
    async deleteSnapshot(triggerId) {
      delete snapshots[triggerId];
    },
    async listArmedSnapshots() {
      return Object.values(snapshots).filter((snap) => snap && snap.status === 'armed');
    },
    async hydrate() {
      return { v: 1, records: { ...snapshots } };
    },
  };

  const FakeDate = class extends Date {
    static now() { return clock.now(); }
  };

  const context = {
    chrome,
    WebSocket: FakeWebSocket,
    console,
    Math,
    Date: FakeDate,
    EventTarget,
    CustomEvent,
    Promise,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    dispatchMcpMessageRoute: options.dispatchMcpMessageRoute || (async (route) => {
      dispatchCalls.push(route);
      if (route.type === 'mcp:trigger') {
        return {
          success: true,
          trigger_id: route.payload && route.payload.trigger_id,
          status: 'armed',
          target_tab_id: route.payload && route.payload.target_tab_id,
        };
      }
      return { success: true };
    }),
    activeSessions: new Map(),
    globalThis: {},
  };
  context.globalThis = context;
  context.FsbTriggerStore = triggerStore;
  context.fsbAutomationLifecycleBus = new EventTarget();

  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
  const footer = `
this.__phase19 = {
  MCPBridgeClient,
  mcpBridgeClient,
  TRIGGER_HEARTBEAT_INTERVAL_MS: typeof TRIGGER_HEARTBEAT_INTERVAL_MS !== 'undefined' ? TRIGGER_HEARTBEAT_INTERVAL_MS : undefined,
  TRIGGER_BLOCKING_SAFETY_CEILING_MS: typeof TRIGGER_BLOCKING_SAFETY_CEILING_MS !== 'undefined' ? TRIGGER_BLOCKING_SAFETY_CEILING_MS : undefined
};
`;
  vm.runInNewContext(`${source}\n${footer}`, context, { filename: 'ws/mcp-bridge-client.js' });

  const client = context.__phase19.mcpBridgeClient;
  client._sendProgress = (id, payload) => {
    progressCalls.push({ id, payload });
  };

  return {
    chrome,
    clock,
    context,
    client,
    dispatchCalls,
    progressCalls,
    snapshots,
    triggerStore,
    exports: context.__phase19,
  };
}

function readJsonTextResult(result) {
  const text = result && result.content && result.content[0] && result.content[0].text;
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch (_e) {
    return null;
  }
}

function bridgePayloadCalls(calls, type) {
  return calls.filter((entry) => entry && entry.message && entry.message.type === type);
}

function schema_fields_present() {
  console.log('\n--- schema_fields_present ---');
  const registry = require('../mcp/ai/tool-definitions.cjs');
  const trigger = registry.getToolByName('trigger');
  const props = (trigger && trigger.inputSchema && trigger.inputSchema.properties) || {};
  ['trigger_id', 'detached', 'timeout_ms', 'safety_ceiling_ms', 'rearm_on_fire'].forEach((field) => {
    check(!!props[field], `trigger schema includes ${field}`);
  });
  checkDeepEqual(trigger && trigger.inputSchema && trigger.inputSchema.required, ['selector', 'condition'], 'trigger required fields remain selector + condition');
}

async function mcp_generates_trigger_id() {
  console.log('\n--- mcp_generates_trigger_id ---');
  const triggersModule = await loadBuildModule(path.join('tools', 'triggers.js'));
  const harness = createToolHarness({
    bridgeResponses: {
      'mcp:trigger': ({ payload }) => ({
        success: true,
        trigger_id: payload.trigger_id,
        status: 'armed',
      }),
    },
  });
  const agentScope = await loadAgentScope();
  triggersModule.registerTriggerTools(harness.server, harness.bridge, harness.queue, agentScope);
  const handler = harness.getHandler('trigger');
  const result = await handler({
    selector: '#price',
    condition: { kind: 'changed' },
    watch: 'live-observe',
    detached: true,
  }, harness.createExtra());
  const triggerCalls = bridgePayloadCalls(harness.bridgeCalls, 'mcp:trigger');
  const payload = triggerCalls[0] && triggerCalls[0].message.payload;
  check(typeof payload.trigger_id === 'string' && payload.trigger_id.length >= 8, 'MCP registrar pre-generates non-empty trigger_id');
  check(result && Array.isArray(result.content), 'generated-id trigger call returns MCP content');
}

async function detached_returns_immediately() {
  console.log('\n--- detached_returns_immediately ---');
  const harness = buildBridgeHarness();
  const result = await harness.client._routeMessage('mcp:trigger', {
    trigger_id: 'trg_detached',
    selector: '#price',
    condition: { kind: 'changed' },
    watch: 'live-observe',
    target_tab_id: 77,
    detached: true,
  }, 'msg-detached');
  check(harness.dispatchCalls.length === 1, 'detached trigger dispatches bounded arm route exactly once');
  check(result && result.outcome === 'detached', 'detached trigger returns outcome detached');
  check(result && result.detached === true, 'detached trigger marks detached true');
  check(result && result.trigger_id === 'trg_detached', 'detached trigger returns caller trigger_id');
  check(harness.clock.activeIntervalCount() === 0, 'detached trigger schedules no heartbeat interval');
}

async function blocking_heartbeat_30s() {
  console.log('\n--- blocking_heartbeat_30s ---');
  const harness = buildBridgeHarness({
    snapshots: {
      trg_block: {
        trigger_id: 'trg_block',
        status: 'armed',
        current_value: { text: '$10.00' },
        last_evaluated_at: 1000,
        last_reported_at: 1000,
        target_tab_id: 77,
      },
    },
  });
  const promise = harness.client._routeMessage('mcp:trigger', {
    trigger_id: 'trg_block',
    selector: '#price',
    condition: { kind: 'changed' },
    watch: 'live-observe',
    target_tab_id: 77,
  }, 'msg-block');
  await flushMicrotasks();
  await harness.clock.advance(30_000);

  const heartbeat = harness.progressCalls[0] && harness.progressCalls[0].payload;
  check(harness.progressCalls.length >= 1, 'blocking trigger emits progress heartbeat after 30s');
  check(heartbeat && heartbeat.trigger_id === 'trg_block', 'heartbeat includes trigger_id');
  check(heartbeat && heartbeat.alive === true, 'heartbeat includes alive true');
  check(heartbeat && heartbeat.elapsed_ms === 30_000, 'heartbeat includes elapsed_ms');
  check(heartbeat && heartbeat.status === 'armed', 'heartbeat includes storage status');
  check(heartbeat && heartbeat.target_tab_id === 77, 'heartbeat includes target_tab_id');

  harness.snapshots.trg_block = {
    ...harness.snapshots.trg_block,
    status: 'fired',
    last_event: { trigger_id: 'trg_block', matched_condition: { kind: 'changed' } },
  };
  await harness.clock.advance(30_000);
  const result = await promise;
  check(result && result.outcome === 'fired', 'blocking trigger settles on fired snapshot');
  check(harness.clock.activeIntervalCount() === 0, 'fired settlement clears heartbeat interval');
}

async function safety_ceiling_auto_detaches() {
  console.log('\n--- safety_ceiling_auto_detaches ---');
  const harness = buildBridgeHarness({
    snapshots: {
      trg_safety: {
        trigger_id: 'trg_safety',
        status: 'armed',
        current_value: { text: '$10.00' },
        target_tab_id: 77,
      },
    },
  });
  const promise = harness.client._routeMessage('mcp:trigger', {
    trigger_id: 'trg_safety',
    selector: '#price',
    condition: { kind: 'threshold', op: '>=', value: 20 },
    watch: 'live-observe',
    target_tab_id: 77,
    timeout_ms: 600_000,
  }, 'msg-safety');
  await flushMicrotasks();
  await harness.clock.advance(240_000);
  const result = await promise;
  check(result && result.outcome === 'detached', 'safety ceiling returns detached outcome');
  check(result && result.detached === true, 'safety ceiling marks detached true');
  check(result && result.reason === 'safety_ceiling', 'safety ceiling reason is safety_ceiling');
  check(harness.snapshots.trg_safety && harness.snapshots.trg_safety.status === 'armed', 'safety ceiling keeps snapshot armed');
  check(harness.clock.activeIntervalCount() === 0, 'safety ceiling clears heartbeat interval');
}

async function bridge_disconnect_partial() {
  console.log('\n--- bridge_disconnect_partial ---');
  const triggersModule = await loadBuildModule(path.join('tools', 'triggers.js'));
  const harness = createToolHarness({
    onSendAndWait: async (message) => {
      if (message.type === 'mcp:trigger') {
        throw new Error('Bridge disconnected');
      }
      if (message.type === 'mcp:get-trigger-status') {
        return {
          success: true,
          trigger_id: message.payload.trigger_id,
          status: 'armed',
          watch: 'live-observe',
          current_value: { text: '$10.00' },
        };
      }
      return { success: true };
    },
  });
  const agentScope = await loadAgentScope();
  triggersModule.registerTriggerTools(harness.server, harness.bridge, harness.queue, agentScope);
  const handler = harness.getHandler('trigger');
  const result = await handler({
    trigger_id: 'trg_disconnect',
    selector: '#price',
    condition: { kind: 'changed' },
    watch: 'live-observe',
  }, harness.createExtra());
  const parsed = readJsonTextResult(result);
  const statusCalls = bridgePayloadCalls(harness.bridgeCalls, 'mcp:get-trigger-status');
  check(statusCalls.length === 1, 'bridge disconnect recovery sends mcp:get-trigger-status');
  check(parsed && parsed.sw_evicted === true, 'bridge disconnect returns sw_evicted true');
  check(parsed && parsed.trigger_id === 'trg_disconnect', 'bridge disconnect result keeps trigger_id');
  check(parsed && parsed.outcome === 'detached', 'bridge disconnect armed state maps to detached outcome');
  check(parsed && parsed.partial_state && parsed.partial_state.status === 'armed', 'bridge disconnect returns partial_state snapshot');
}

async function run() {
  schema_fields_present();
  await mcp_generates_trigger_id();
  await detached_returns_immediately();
  await blocking_heartbeat_30s();
  await safety_ceiling_auto_detaches();
  await bridge_disconnect_partial();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: trigger-blocking-reporting harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
