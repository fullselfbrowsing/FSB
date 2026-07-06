'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected: ${expected}, got: ${actual})`);
}

function assertDeepEqual(actual, expected, msg) {
  assert(util.isDeepStrictEqual(actual, expected), `${msg} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

function toPlainObject(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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
    async set(values) {
      Object.assign(store, values);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => {
        delete store[key];
      });
    },
    _dump() {
      return { ...store };
    }
  };
}

function createFakeTimers() {
  const timeouts = [];
  const intervals = [];
  return {
    timeouts,
    intervals,
    setTimeout(fn, delay) {
      const timer = { fn, delay, cleared: false };
      timeouts.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
    setInterval(fn, delay) {
      const timer = { fn, delay, cleared: false };
      intervals.push(timer);
      return timer;
    },
    clearInterval(timer) {
      if (timer) timer.cleared = true;
    }
  };
}

function createRuntimeOnMessageMock() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    removeListener(listener) {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    },
    _emit(message, sender = {}, sendResponse = () => {}) {
      for (const listener of [...listeners]) {
        listener(message, sender, sendResponse);
      }
    },
    _listeners() {
      return [...listeners];
    }
  };
}

function createChromeMock() {
  const session = createStorageArea();
  const local = createStorageArea();
  const alarms = new Map();
  const cleared = [];
  return {
    runtime: { id: 'phase-198-test-extension', onMessage: createRuntimeOnMessageMock() },
    storage: { session, local },
    alarms: {
      async create(name, options) {
        alarms.set(name, { name, ...options });
      },
      async clear(name) {
        cleared.push(name);
        alarms.delete(name);
        return true;
      },
      async getAll() {
        return Array.from(alarms.values());
      },
      _created() {
        return Array.from(alarms.values());
      },
      _cleared() {
        return [...cleared];
      }
    }
  };
}

function createFakeWebSocketClass(options = {}) {
  const sockets = [];

  class FakeWebSocket {
    constructor(url) {
      if (options.throwOnConstruct) {
        throw new Error('server unavailable');
      }
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.sent = [];
      sockets.push(this);
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      if (typeof this.onopen === 'function') this.onopen();
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED;
      if (typeof this.onclose === 'function') this.onclose();
    }

    send(payload) {
      this.sent.push(payload);
    }
  }

  FakeWebSocket.CONNECTING = 0;
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSED = 3;
  FakeWebSocket._sockets = sockets;
  return FakeWebSocket;
}

function buildClientHarness(options = {}) {
  const chrome = createChromeMock();
  const timers = createFakeTimers();
  const FakeWebSocket = createFakeWebSocketClass(options);
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0;

  const context = {
    chrome,
    WebSocket: FakeWebSocket,
    console,
    Math: deterministicMath,
    Date,
    EventTarget,
    CustomEvent,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    dispatchMcpMessageRoute: options.dispatchMcpMessageRoute || (async () => ({ success: true })),
    globalThis: {}
  };
  context.globalThis = context;
  // Phase 225-01: optionally seed the in-process lifecycle bus before mcp-bridge-client.js
  // captures it. background.js installs this on globalThis in real Chrome.
  if (options.installLifecycleBus) {
    context.fsbAutomationLifecycleBus = new EventTarget();
  }

  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
  const footer = `
this.__phase198 = {
  MCPBridgeClient,
  mcpBridgeClient,
  MCP_BRIDGE_STATE_KEY: typeof MCP_BRIDGE_STATE_KEY !== 'undefined' ? MCP_BRIDGE_STATE_KEY : undefined,
  MCP_RECONNECT_ALARM: typeof MCP_RECONNECT_ALARM !== 'undefined' ? MCP_RECONNECT_ALARM : undefined,
  MCP_RECONNECT_MAX_MS: typeof MCP_RECONNECT_MAX_MS !== 'undefined' ? MCP_RECONNECT_MAX_MS : undefined,
  lifecycleBus: typeof fsbAutomationLifecycleBus !== 'undefined' ? fsbAutomationLifecycleBus : null
};
`;
  vm.runInNewContext(`${source}\n${footer}`, context, { filename: 'ws/mcp-bridge-client.js' });

  return {
    chrome,
    timers,
    sockets: FakeWebSocket._sockets,
    exports: context.__phase198
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function assertNoSecrets(value, msg) {
  const serialized = JSON.stringify(value || {});
  assert(!/password|cardNumber|cvv|apiKey/i.test(serialized), msg);
}

async function runBrowserFirstReconnectCase() {
  console.log('\n--- browser-first reconnect state ---');

  const harness = buildClientHarness({ throwOnConstruct: true });
  const client = harness.exports.mcpBridgeClient;

  assertEqual(harness.exports.MCP_BRIDGE_STATE_KEY, 'mcpBridgeState', 'MCP_BRIDGE_STATE_KEY is exported as mcpBridgeState');
  assertEqual(harness.exports.MCP_RECONNECT_ALARM, 'fsb-mcp-bridge-reconnect', 'MCP_RECONNECT_ALARM is exported as fsb-mcp-bridge-reconnect');
  assertEqual(harness.exports.MCP_RECONNECT_MAX_MS, 30000, 'MCP_RECONNECT_MAX_MS remains bounded at 30000');

  client.connect();
  await flushMicrotasks();

  const sessionState = harness.chrome.storage.session._dump().mcpBridgeState;
  const localState = harness.chrome.storage.local._dump().mcpBridgeState;
  const reconnectAlarm = harness.chrome.alarms._created().find((alarm) => alarm.name === 'fsb-mcp-bridge-reconnect');
  const scheduledDelay = harness.timers.timeouts[0]?.delay;

  assert(sessionState && sessionState.status === 'reconnecting', 'browser-first failure persists reconnecting chrome.storage.session.mcpBridgeState');
  assertEqual(localState, undefined, 'chrome.storage.local._dump().mcpBridgeState remains undefined');
  assert(reconnectAlarm && reconnectAlarm.delayInMinutes === 0.5, 'reconnect alarm options include { delayInMinutes: 0.5 }');
  assert(typeof scheduledDelay === 'number' && scheduledDelay <= 30000, 'in-memory reconnect delay is no greater than 30000ms');
  assertNoSecrets(sessionState, 'mcpBridgeState omits password, cardNumber, cvv, and apiKey fields');
}

async function runServiceWorkerWakeCase() {
  console.log('\n--- service-worker wake state ---');

  const harness = buildClientHarness();
  const client = harness.exports.mcpBridgeClient;

  assert(typeof client.recordWake === 'function', 'mcpBridgeClient.recordWake(reason) exists');
  if (typeof client.recordWake === 'function') {
    await client.recordWake('service-worker-evaluated');
    await client.recordWake('runtime.onMessage');
  }
  await flushMicrotasks();

  const sessionState = harness.chrome.storage.session._dump().mcpBridgeState || (typeof client.getState === 'function' ? client.getState() : undefined);

  assertEqual(sessionState?.lastWakeReason, 'runtime.onMessage', "recordWake('runtime.onMessage') records lastWakeReason");
  assert(typeof sessionState?.wakeCount === 'number' && sessionState.wakeCount >= 2, 'recordWake updates wakeCount');
  assertEqual(harness.chrome.storage.local._dump().mcpBridgeState, undefined, 'wake state does not write chrome.storage.local._dump().mcpBridgeState');
  assertNoSecrets(sessionState, 'wake state omits password, cardNumber, cvv, and apiKey fields');
}

async function runConnectedTransitionCase() {
  console.log('\n--- connected transition state ---');

  const harness = buildClientHarness();
  const client = harness.exports.mcpBridgeClient;

  client.connect();
  const socket = harness.sockets[0];
  assert(socket, 'connect creates a WebSocket instance');
  if (socket) socket.open();
  await flushMicrotasks();

  const sessionState = harness.chrome.storage.session._dump().mcpBridgeState || (typeof client.getState === 'function' ? client.getState() : undefined);
  const reconnectDelay = sessionState?.reconnectDelayMs ?? sessionState?.nextReconnectDelayMs ?? client._reconnectDelay;

  assertEqual(sessionState?.status, 'connected', 'fake WebSocket onopen persists status: connected');
  assertEqual(reconnectDelay, 2000, 'fake WebSocket onopen resets reconnect delay to 2000');
  assert(harness.chrome.alarms._cleared().includes('fsb-mcp-bridge-reconnect'), 'fake WebSocket onopen clears fsb-mcp-bridge-reconnect alarm');
  assert(typeof sessionState?.lastConnectedAt === 'string' && sessionState.lastConnectedAt.length > 0, 'fake WebSocket onopen records lastConnectedAt');
  assertNoSecrets(sessionState, 'connected state omits password, cardNumber, cvv, and apiKey fields');
}

async function runAutomationRuntimeEventShapeCase() {
  console.log('\n--- run_task runtime event shape ---');

  const sessionId = 'session_action_event_shape';
  let dispatched = null;
  const harness = buildClientHarness({
    dispatchMcpMessageRoute: async ({ type, payload, mcpMsgId }) => {
      dispatched = { type, payload, mcpMsgId };
      return { success: true, sessionId };
    }
  });
  const client = harness.exports.mcpBridgeClient;
  const sent = [];
  client._send = (payload) => {
    sent.push(payload);
  };

  const resultPromise = client._handleStartAutomation({ task: 'finish checkout' }, 'mcp-msg-199');
  await flushMicrotasks();

  assertDeepEqual(
    dispatched,
    { type: 'mcp:start-automation', payload: { task: 'finish checkout' }, mcpMsgId: 'mcp-msg-199' },
    'run_task dispatches through mcp:start-automation',
  );
  assertEqual(harness.chrome.runtime.onMessage._listeners().length, 1, 'run_task registers one runtime listener');

  harness.chrome.runtime.onMessage._emit({
    action: 'automationProgress',
    sessionId,
    progress: 42,
    phase: 'acting',
    eta: 12,
    actionSummary: 'Clicking submit'
  });

  assertDeepEqual(
    toPlainObject(sent[0]),
    {
      id: 'mcp-msg-199',
      type: 'mcp:progress',
      payload: {
        taskId: sessionId,
        progress: 42,
        phase: 'acting',
        eta: 12,
        action: 'Clicking submit'
      }
    },
    'automationProgress action event emits stable MCP progress payload',
  );

  harness.chrome.runtime.onMessage._emit({
    action: 'automationComplete',
    sessionId,
    result: { summary: 'checkout complete' }
  });

  const result = await resultPromise;
  assertDeepEqual(
    toPlainObject(result),
    {
      sessionId,
      status: 'completed',
      result: { summary: 'checkout complete' }
    },
    'automationComplete action event resolves run_task before timeout',
  );
  assertEqual(harness.chrome.runtime.onMessage._listeners().length, 0, 'run_task removes runtime listener after completion');
  assert(harness.timers.timeouts[0]?.cleared === true, 'run_task clears timeout after completion');
}

async function runAutomationLifecycleBusCase() {
  console.log('\n--- Phase 225-01: run_task resolves via lifecycle bus ---');

  const sessionId = 'session_lifecycle_bus_completion';
  const harness = buildClientHarness({
    installLifecycleBus: true,
    dispatchMcpMessageRoute: async () => ({ success: true, sessionId }),
  });
  const client = harness.exports.mcpBridgeClient;
  client._send = () => {};

  // The harness installed the lifecycle bus inside the vm context before
  // mcp-bridge-client.js evaluated. Reach into the same context to dispatch.
  const bus = harness.exports.lifecycleBus;

  const resultPromise = client._handleStartAutomation({ task: 'lifecycle bus path' }, 'mcp-msg-225-01');
  await flushMicrotasks();

  // Dispatch a terminal event ONLY on the bus (not on chrome.runtime.onMessage)
  // to assert the bus-only resolution path that fixes the same-SW broadcast gap.
  bus.dispatchEvent(new CustomEvent('automationComplete', {
    detail: {
      action: 'automationComplete',
      sessionId,
      result: { summary: 'lifecycle bus completion received' },
    },
  }));

  const result = await resultPromise;
  assertDeepEqual(
    toPlainObject(result),
    {
      sessionId,
      status: 'completed',
      result: { summary: 'lifecycle bus completion received' },
    },
    'lifecycle bus automationComplete resolves run_task without chrome.runtime.onMessage',
  );
  assert(harness.timers.timeouts[0]?.cleared === true, 'lifecycle bus path clears the run_task 300s timeout');

  // Cleanup so subsequent cases get a fresh bus.
  delete globalThis.fsbAutomationLifecycleBus;
}

async function runBackgroundLifecycleBroadcasterSourceCase() {
  console.log('\n--- Phase 225-01: background lifecycle broadcaster ---');

  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const requiredSnippets = [
    'globalThis.fsbAutomationLifecycleBus = new EventTarget()',
    'function fsbBroadcastAutomationLifecycle(message)',
    "bus.dispatchEvent(new CustomEvent(message.action, { detail: message }))",
  ];

  for (const snippet of requiredSnippets) {
    assert(backgroundSource.includes(snippet), `background.js includes ${snippet}`);
  }

  // Ensure terminal broadcasts route through the helper, not raw chrome.runtime.sendMessage.
  const terminalBroadcastRegex = /chrome\.runtime\.sendMessage\(\{\s*\n\s*action:\s*'automation(Complete|Error)'/g;
  const lingering = backgroundSource.match(terminalBroadcastRegex);
  assert(!lingering, 'background.js no longer calls chrome.runtime.sendMessage directly for automationComplete/automationError');
}

async function runVisualSessionRouteCase() {
  console.log('\n--- visual-session route dispatch ---');

  const dispatched = [];
  const harness = buildClientHarness({
    dispatchMcpMessageRoute: async ({ type, payload }) => {
      dispatched.push({ type, payload });
      if (type === 'mcp:start-visual-session') {
        return { success: true, sessionToken: 'visual_token_123', clientLabel: payload.clientLabel, tabId: 7 };
      }
      return { success: true, sessionToken: payload.sessionToken, cleared: true };
    }
  });
  const client = harness.exports.mcpBridgeClient;

  const started = await client._routeMessage('mcp:start-visual-session', {
    clientLabel: 'Codex',
    task: 'Drive checkout',
    detail: 'Preparing checkout'
  }, 'mcp-msg-visual-start');

  assertDeepEqual(
    toPlainObject(dispatched[0]),
    {
      type: 'mcp:start-visual-session',
      payload: {
        clientLabel: 'Codex',
        task: 'Drive checkout',
        detail: 'Preparing checkout'
      }
    },
    'mcp:start-visual-session routes through dispatchMcpMessageRoute',
  );
  assertEqual(started.sessionToken, 'visual_token_123', 'visual-session start returns the issued token');

  const ended = await client._routeMessage('mcp:end-visual-session', {
    sessionToken: 'visual_token_123',
    reason: 'ended'
  }, 'mcp-msg-visual-end');

  assertDeepEqual(
    toPlainObject(dispatched[1]),
    {
      type: 'mcp:end-visual-session',
      payload: {
        sessionToken: 'visual_token_123',
        reason: 'ended'
      }
    },
    'mcp:end-visual-session routes through dispatchMcpMessageRoute',
  );
  assertEqual(ended.cleared, true, 'visual-session end returns the clear result');
}

async function runTriggerMessageRouteCase() {
  console.log('\n--- trigger message route dispatch ---');

  const dispatched = [];
  const harness = buildClientHarness({
    dispatchMcpMessageRoute: async ({ type, payload, mcpMsgId }) => {
      dispatched.push({ type, payload, mcpMsgId });
      return { success: true, routed: type };
    }
  });
  const client = harness.exports.mcpBridgeClient;

  const cases = [
    ['mcp:trigger', { selector: '#price', condition: { kind: 'changed' }, target_tab_id: 7 }],
    ['mcp:stop-trigger', { trigger_id: 'trg_1', tab_id: 7 }],
    ['mcp:get-trigger-status', { trigger_id: 'trg_1', tab_id: 7 }],
    ['mcp:list-triggers', { status: 'armed', tab_id: 7 }]
  ];

  for (let i = 0; i < cases.length; i++) {
    const [type, payload] = cases[i];
    const result = await client._routeMessage(type, payload, `mcp-msg-trigger-${i}`);
    assertDeepEqual(
      toPlainObject(result),
      { success: true, routed: type },
      `${type} returns dispatcher response`,
    );
  }

  assertDeepEqual(
    toPlainObject(dispatched),
    cases.map(([type, payload], i) => ({ type, payload, mcpMsgId: `mcp-msg-trigger-${i}` })),
    'trigger MCP messages route through dispatchMcpMessageRoute',
  );
}

function runBackgroundArmingSourceCase() {
  console.log('\n--- background wake arming source ---');

  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const requiredSnippets = [
    'function armMcpBridge(reason)',
    "armMcpBridge('service-worker-evaluated')",
    "armMcpBridge('runtime.onInstalled')",
    "armMcpBridge('runtime.onStartup')",
    "armMcpBridge('runtime.onMessage')",
    "armMcpBridge('runtime.onConnect')",
    "armMcpBridge('webNavigation.onCommitted')",
    "armMcpBridge('action.onClicked')",
    'alarm.name === MCP_RECONNECT_ALARM',
    "armMcpBridge('alarm:' + MCP_RECONNECT_ALARM)"
  ];

  for (const snippet of requiredSnippets) {
    assert(backgroundSource.includes(snippet), `background.js includes ${snippet}`);
  }

  const visualSessionSnippets = [
    "const MCP_VISUAL_SESSION_STORAGE_KEY = 'fsbMcpVisualSessions'",
    'chrome.storage.session.get([MCP_VISUAL_SESSION_STORAGE_KEY])',
    'chrome.storage.session.set({',
    'restorePersistedMcpVisualSessions()',
    'planMcpVisualSessionReplay',
    'finalClearAt',
    'lastUpdateAt',
    "source: 'contentScriptReady'",
    "source: 'port_ready'",
    'replayMcpVisualSessionForTab(tabId',
  ];

  for (const snippet of visualSessionSnippets) {
    assert(backgroundSource.includes(snippet), `background.js includes ${snippet}`);
  }
}

async function run() {
  await runBrowserFirstReconnectCase();
  await runServiceWorkerWakeCase();
  await runConnectedTransitionCase();
  await runAutomationRuntimeEventShapeCase();
  await runAutomationLifecycleBusCase();
  await runBackgroundLifecycleBroadcasterSourceCase();
  await runVisualSessionRouteCase();
  await runTriggerMessageRouteCase();
  runBackgroundArmingSourceCase();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
