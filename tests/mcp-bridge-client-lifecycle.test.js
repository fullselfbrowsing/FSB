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

function createChromeMock(initialSession = {}) {
  const session = createStorageArea(initialSession);
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
    constructor(url, protocols) {
      if (options.throwOnConstruct) {
        throw new Error('server unavailable');
      }
      this.url = url;
      this.protocols = protocols;
      this.readyState = FakeWebSocket.CONNECTING;
      this.sent = [];
      this.closeCount = 0;
      sockets.push(this);
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      if (typeof this.onopen === 'function') this.onopen();
    }

    close() {
      this.closeCount += 1;
      if (options.deferClose) {
        this.readyState = FakeWebSocket.CLOSING;
        return;
      }
      this.finishClose();
    }

    finishClose() {
      this.readyState = FakeWebSocket.CLOSED;
      if (typeof this.onclose === 'function') this.onclose();
    }

    send(payload) {
      this.sent.push(payload);
    }

    receive(payload) {
      if (typeof this.onmessage === 'function') {
        this.onmessage({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) });
      }
    }
  }

  FakeWebSocket.CONNECTING = 0;
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSING = 2;
  FakeWebSocket.CLOSED = 3;
  FakeWebSocket._sockets = sockets;
  return FakeWebSocket;
}

function buildClientHarness(options = {}) {
  const chrome = createChromeMock(options.session);
  const timers = createFakeTimers();
  const FakeWebSocket = createFakeWebSocketClass(options);
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0;

  const context = {
    chrome,
    WebSocket: FakeWebSocket,
    console: options.console || console,
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
  MCP_PING_INTERVAL_MS: typeof MCP_PING_INTERVAL_MS !== 'undefined' ? MCP_PING_INTERVAL_MS : undefined,
  DELEGATION_HEARTBEAT_INTERVAL_MS: typeof DELEGATION_HEARTBEAT_INTERVAL_MS !== 'undefined' ? DELEGATION_HEARTBEAT_INTERVAL_MS : undefined,
  DELEGATION_HEARTBEAT_MISS_LIMIT: typeof DELEGATION_HEARTBEAT_MISS_LIMIT !== 'undefined' ? DELEGATION_HEARTBEAT_MISS_LIMIT : undefined,
  DELEGATION_START_REQUEST_TIMEOUT_MS: typeof DELEGATION_START_REQUEST_TIMEOUT_MS !== 'undefined' ? DELEGATION_START_REQUEST_TIMEOUT_MS : undefined,
  MCP_BRIDGE_PAIRING_KEY: typeof MCP_BRIDGE_PAIRING_KEY !== 'undefined' ? MCP_BRIDGE_PAIRING_KEY : undefined,
  FSB_EXT_PROTOCOL: typeof FSB_EXT_PROTOCOL !== 'undefined' ? FSB_EXT_PROTOCOL : undefined,
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
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
  await flushMicrotasks();
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

const VALID_PAIRING_CODE = 'fsb-auth.' + 'A'.repeat(43);

async function runPairingConstructionCases() {
  console.log('\n--- Phase 59 pairing-aware connection construction ---');

  {
    const harness = buildClientHarness();
    harness.exports.mcpBridgeClient.connect();
    await flushMicrotasks();
    const socket = harness.sockets[0];
    assertEqual(harness.exports.MCP_BRIDGE_PAIRING_KEY, 'fsbMcpBridgePairing', 'pairing storage key is exact');
    assertEqual(harness.exports.FSB_EXT_PROTOCOL, 'fsb-ext-v1', 'stable extension subprotocol is exact');
    assertEqual(socket.url, 'ws://localhost:7225', 'unpaired WebSocket uses the unchanged bridge URL');
    assertEqual(socket.protocols, undefined, 'unpaired WebSocket preserves the legacy single-argument constructor');
    assert(!/[?#]/.test(socket.url), 'unpaired bridge URL contains no query or hash credential transport');
  }

  {
    const logs = [];
    const harness = buildClientHarness({
      session: {
        fsbMcpBridgePairing: { pairingCode: VALID_PAIRING_CODE, storedAt: 1_783_900_000_000 }
      },
      console: {
        log: (...args) => logs.push(args),
        warn: (...args) => logs.push(args),
        error: (...args) => logs.push(args)
      }
    });
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const socket = harness.sockets[0];
    assertDeepEqual(toPlainObject(socket.protocols), ['fsb-ext-v1', VALID_PAIRING_CODE], 'configured WebSocket offers stable and credential subprotocols in order');
    assertEqual(socket.url, 'ws://localhost:7225', 'configured WebSocket keeps the credential out of the URL');
    assertEqual(client.getState().pairingStatus, 'configured', 'stored credential begins configured, not paired');
    const publicState = JSON.stringify(client.getState());
    const persistedState = JSON.stringify(harness.chrome.storage.session._dump().mcpBridgeState || {});
    const capturedLogs = JSON.stringify(logs);
    const interior = VALID_PAIRING_CODE.slice(15, 31);
    for (const [value, label] of [[publicState, 'getState'], [persistedState, 'mcpBridgeState'], [capturedLogs, 'captured logs']]) {
      assert(!value.includes(VALID_PAIRING_CODE), `${label} omits the full pairing credential`);
      assert(!value.includes(interior), `${label} omits a 16-character interior credential substring`);
    }
  }

  for (const record of [
    { pairingCode: 'fsb-auth.short', storedAt: Date.now() },
    { pairingCode: VALID_PAIRING_CODE, storedAt: Infinity },
    { pairingCode: VALID_PAIRING_CODE, storedAt: Date.now(), extra: true }
  ]) {
    const harness = buildClientHarness({ session: { fsbMcpBridgePairing: record } });
    harness.exports.mcpBridgeClient.connect();
    await flushMicrotasks();
    assertEqual(harness.sockets[0].protocols, undefined, 'malformed or non-exact session record is ignored');
    assertEqual(harness.exports.mcpBridgeClient.getState().pairingStatus, 'unpaired', 'invalid session record clears in-memory pairing state');
  }
}

async function runPairingProbeAndReloadCases() {
  console.log('\n--- Phase 59 authenticated pairing probe and reload ---');

  {
    const harness = buildClientHarness({
      session: { fsbMcpBridgePairing: { pairingCode: VALID_PAIRING_CODE, storedAt: Date.now() } }
    });
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const socket = harness.sockets[0];
    socket.open();
    const probe = JSON.parse(socket.sent[0]);
    assertEqual(client.getState().pairingStatus, 'configured', 'WebSocket open alone remains configured');
    assertDeepEqual(
      { type: probe.type, method: probe.method, payload: probe.payload },
      { type: 'ext:request', method: 'bridge.auth-status', payload: {} },
      'open configured socket sends the secret-free bridge.auth-status probe'
    );
    assert(!JSON.stringify(probe).includes(VALID_PAIRING_CODE), 'auth-status probe frame contains no credential');
    socket.receive({ id: probe.id, type: 'ext:response', payload: { authorized: true } });
    await flushMicrotasks();
    assertEqual(client.getState().pairingStatus, 'paired', 'exact authorized:true probe promotes to paired');
  }

  {
    const harness = buildClientHarness({
      session: { fsbMcpBridgePairing: { pairingCode: VALID_PAIRING_CODE, storedAt: Date.now() } }
    });
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const socket = harness.sockets[0];
    socket.open();
    const probe = JSON.parse(socket.sent[0]);
    socket.receive({
      id: probe.id,
      type: 'ext:response',
      error: { code: 'ext_unauthorized', message: 'Extension authorization is unavailable', retryable: false }
    });
    await flushMicrotasks();
    assertEqual(client.getState().pairingStatus, 'expired', 'unauthorized probe marks the stored credential expired');
  }

  {
    const harness = buildClientHarness();
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const first = harness.sockets[0];
    first.open();
    await harness.chrome.storage.session.set({
      fsbMcpBridgePairing: { pairingCode: VALID_PAIRING_CODE, storedAt: Date.now() }
    });
    const reloadPromise = client.reloadPairingAndReconnect();
    await flushMicrotasks();
    const replacement = harness.sockets[1];
    assertEqual(first.closeCount, 1, 'pairing reload closes the prior socket exactly once');
    assert(replacement && replacement !== first, 'pairing reload creates one replacement socket');
    assertDeepEqual(toPlainObject(replacement.protocols), ['fsb-ext-v1', VALID_PAIRING_CODE], 'replacement socket uses newly loaded authority');
    replacement.open();
    const probe = JSON.parse(replacement.sent[0]);
    replacement.receive({ id: probe.id, type: 'ext:response', payload: { authorized: true } });
    const result = await reloadPromise;
    assertDeepEqual(toPlainObject(result), { pairingStatus: 'paired' }, 'reload resolves paired only after authenticated probe');
  }

  {
    const harness = buildClientHarness({
      throwOnConstruct: true,
      session: { fsbMcpBridgePairing: { pairingCode: VALID_PAIRING_CODE, storedAt: Date.now() } }
    });
    const result = await harness.exports.mcpBridgeClient.reloadPairingAndReconnect();
    assertDeepEqual(toPlainObject(result), { pairingStatus: 'configured' }, 'offline reload retains honest configured status');
  }

  {
    const harness = buildClientHarness({
      deferClose: true,
      session: { fsbMcpBridgePairing: { pairingCode: VALID_PAIRING_CODE, storedAt: Date.now() } }
    });
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const first = harness.sockets[0];
    first.open();
    const firstProbe = JSON.parse(first.sent[0]);
    first.receive({ id: firstProbe.id, type: 'ext:response', payload: { authorized: true } });
    await flushMicrotasks();
    assertEqual(client.getState().pairingStatus, 'paired', 'incumbent socket is paired before delayed replacement close');

    let oldRejectionCount = 0;
    const oldApplicationRequest = client.sendExtRequest('agent.old-socket', { task: 'do not retain' });
    const oldApplicationOutcome = oldApplicationRequest.then(
      () => ({ resolved: true }),
      (error) => {
        oldRejectionCount++;
        return { resolved: false, error };
      }
    );
    assertEqual(client._extPending.size, 1, 'old socket owns one pending application request before reload');

    const reloadPromise = client.reloadPairingAndReconnect();
    await flushMicrotasks();
    const pairingCloseTimeout = harness.timers.timeouts.find((timer) => timer.delay === 1000 && !timer.cleared);
    assert(pairingCloseTimeout, 'pairing reload exposes the bounded old-socket close timeout');
    pairingCloseTimeout.fn();
    await flushMicrotasks();

    const replacement = harness.sockets[1];
    replacement.open();
    const replacementProbe = JSON.parse(replacement.sent[0]);
    assertEqual(client._extPending.size, 2, 'old application request and replacement auth probe are pending together');

    first.finishClose();
    const oldOutcome = await oldApplicationOutcome;
    assertEqual(oldOutcome.resolved, false, 'late old-socket close rejects its application request instead of resolving');
    assertEqual(oldOutcome.error.code, 'bridge_topology_changed', 'old-socket application request rejects with topology error');
    assertEqual(oldRejectionCount, 1, 'old-socket application request rejects exactly once');
    assertEqual(client._ws, replacement, 'late old-socket close preserves the replacement socket');
    assertEqual(client.isConnected, true, 'late old-socket close preserves replacement connectivity');
    assertEqual(client.getState().status, 'connected', 'late old-socket close preserves connected status');
    assertEqual(client.getState().pairingStatus, 'configured', 'late old-socket close does not expire the in-flight replacement probe');
    assertEqual(client._extPending.size, 1, 'late old-socket close clears only old work and preserves the replacement auth probe');

    replacement.receive({ id: replacementProbe.id, type: 'ext:response', payload: { authorized: true } });
    const result = await reloadPromise;
    assertDeepEqual(toPlainObject(result), { pairingStatus: 'paired' }, 'replacement auth probe settles once after the stale close');
    assertEqual(client.isConnected, true, 'replacement remains connected after authenticated settlement');
    assertEqual(client._extPending.size, 0, 'replacement auth probe clears exactly once after settlement');
  }
}

async function runExtRequestLifecycleCases() {
  console.log('\n--- Phase 59 reverse request lifecycle ---');

  {
    const harness = buildClientHarness();
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const socket = harness.sockets[0];
    socket.open();
    const pending = client.sendExtRequest('delegate.start', {
      adapterId: 'claude-code',
      task: 'a valid run that exceeds short RPC budgets'
    }, { timeout: 1000 });
    const request = JSON.parse(socket.sent[0]);
    const lifecycleTimer = harness.timers.timeouts.find((timer) => (
      timer.delay === harness.exports.DELEGATION_START_REQUEST_TIMEOUT_MS
      && !timer.cleared
    ));
    assertEqual(harness.exports.DELEGATION_START_REQUEST_TIMEOUT_MS, 2820000,
      'delegate.start owns a 45-minute run plus bounded cleanup transport budget');
    assert(!!lifecycleTimer, 'delegate.start ignores generic 30/120-second RPC timeout selection');
    assertEqual(client._extPending.size, 1,
      'delegate.start remains pending after both generic short-RPC ceilings');
    socket.receive({
      id: request.id,
      type: 'ext:response',
      payload: { delegationId: 'delegation_long_lived', status: 'succeeded' }
    });
    const result = await pending;
    assertDeepEqual(toPlainObject(result), {
      delegationId: 'delegation_long_lived',
      status: 'succeeded'
    }, 'long-lived delegate.start still settles only on its final response');
    assertEqual(lifecycleTimer.cleared, true, 'delegate.start clears its lifecycle timer after final settlement');
  }

  {
    const harness = buildClientHarness();
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const socket = harness.sockets[0];
    socket.open();
    const events = [];
    const resultPromise = client.sendExtRequest('agent.test', { task: 'one' }, {
      timeout: 7000,
      onEvent: (eventName, payload) => events.push({ eventName, payload: toPlainObject(payload) })
    });
    const request = JSON.parse(socket.sent[0]);
    assertDeepEqual(
      Object.keys(request).sort(),
      ['id', 'method', 'payload', 'type'],
      'ext request sends only id/type/method/payload'
    );
    assertDeepEqual(
      { type: request.type, method: request.method, payload: request.payload },
      { type: 'ext:request', method: 'agent.test', payload: { task: 'one' } },
      'ext request JSON matches the additive frame contract'
    );
    socket.receive({ id: request.id, type: 'ext:event', event: 'progress', payload: { step: 1 } });
    socket.receive({ id: request.id, type: 'ext:event', event: 'progress', payload: { step: 2 } });
    assertEqual(client._extPending.size, 1, 'events do not settle the pending request');
    socket.receive({ id: request.id, type: 'ext:response', payload: { ok: true } });
    const result = await resultPromise;
    assertDeepEqual(toPlainObject(events), [
      { eventName: 'progress', payload: { step: 1 } },
      { eventName: 'progress', payload: { step: 2 } }
    ], 'zero-or-more ext events are delivered in order before final');
    assertDeepEqual(toPlainObject(result), { ok: true }, 'first final response resolves the request payload');
    assertEqual(client._extPending.size, 0, 'final response clears pending state');
    socket.receive({ id: request.id, type: 'ext:response', payload: { ok: false } });
    assertEqual(client._extPending.size, 0, 'duplicate final is dropped after settlement');
  }

  {
    const harness = buildClientHarness();
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const socket = harness.sockets[0];
    socket.open();
    const rejected = client.sendExtRequest('agent.test', {});
    const request = JSON.parse(socket.sent[0]);
    socket.receive({
      id: request.id,
      type: 'ext:response',
      error: { code: 'agent_provider_offline', message: 'No handler', retryable: true }
    });
    await rejected.then(
      () => assert(false, 'error final rejects instead of resolving'),
      (error) => {
        assertEqual(error.code, 'agent_provider_offline', 'error final preserves stable error code');
        assertEqual(error.retryable, true, 'error final preserves retryable flag');
      }
    );
  }

  {
    const harness = buildClientHarness();
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const socket = harness.sockets[0];
    socket.open();
    const timedOut = client.sendExtRequest('agent.timeout', {}, { timeout: 1000 });
    const timeout = harness.timers.timeouts.find((timer) => timer.delay === 1000 && !timer.cleared);
    timeout.fn();
    await timedOut.then(
      () => assert(false, 'timeout rejects instead of resolving'),
      (error) => assertEqual(error.code, 'ext_request_timeout', 'timeout rejects with ext_request_timeout')
    );
    assertEqual(client._extPending.size, 0, 'timeout clears pending state');
  }

  {
    const harness = buildClientHarness();
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const socket = harness.sockets[0];
    socket.open();
    const pending = client.sendExtRequest('agent.close', { once: true });
    const originalFrame = socket.sent[0];
    socket.close();
    await pending.then(
      () => assert(false, 'socket close rejects instead of resolving'),
      (error) => assertEqual(error.code, 'bridge_topology_changed', 'socket close rejects with topology error')
    );
    assertEqual(client._extPending.size, 0, 'socket close clears every reverse pending entry');
    const reconnectTimer = harness.timers.timeouts.find((timer) => !timer.cleared && timer.delay >= 2000);
    reconnectTimer.fn();
    await flushMicrotasks();
    const replacement = harness.sockets[1];
    replacement.open();
    assert(!replacement.sent.includes(originalFrame), 'reconnect never replays an application ext request');
  }
}

async function runAsyncExtObserverCases() {
  console.log('\n--- Phase 61 per-correlation async event barriers ---');

  {
    const harness = buildClientHarness();
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const socket = harness.sockets[0];
    socket.open();

    const firstEventGate = deferred();
    const order = [];
    const removeFirst = client.addEventObserver(async (event) => {
      order.push(`${event.payload.owner}:${event.payload.step}:global-1:start`);
      if (event.payload.owner === 'a' && event.payload.step === 1) {
        await firstEventGate.promise;
      }
      order.push(`${event.payload.owner}:${event.payload.step}:global-1:end`);
    });
    client.addEventObserver(async (event) => {
      order.push(`${event.payload.owner}:${event.payload.step}:global-2`);
    });

    const requestA = client.sendExtRequest('delegate.start', { task: 'a' }, {
      onEvent: async (_eventName, payload) => {
        order.push(`${payload.owner}:${payload.step}:request`);
      }
    });
    const frameA = JSON.parse(socket.sent[0]);
    const requestB = client.sendExtRequest('delegate.start', { task: 'b' }, {
      onEvent: async (_eventName, payload) => {
        order.push(`${payload.owner}:${payload.step}:request`);
      }
    });
    const frameB = JSON.parse(socket.sent[1]);

    socket.receive({ id: frameA.id, type: 'ext:event', event: 'progress', payload: { owner: 'a', step: 1 } });
    socket.receive({ id: frameA.id, type: 'ext:event', event: 'progress', payload: { owner: 'a', step: 2 } });
    socket.receive({ id: frameB.id, type: 'ext:event', event: 'progress', payload: { owner: 'b', step: 1 } });
    socket.receive({ id: frameA.id, type: 'ext:response', payload: { ok: 'a' } });
    socket.receive({ id: frameB.id, type: 'ext:response', payload: { ok: 'b' } });

    let aSettled = false;
    requestA.finally(() => { aSettled = true; });
    const resultB = await requestB;
    assertDeepEqual(toPlainObject(resultB), { ok: 'b' }, 'a second correlation settles while the first correlation observer is deferred');
    assertEqual(aSettled, false, 'matching final remains blocked behind its own deferred observer tail');
    assert(order.includes('b:1:request'), 'the unrelated correlation runs its complete observer roster independently');
    assert(!order.includes('a:2:global-1:start'), 'event N+1 waits for deferred event N within one correlation');

    firstEventGate.resolve();
    const resultA = await requestA;
    assertDeepEqual(toPlainObject(resultA), { ok: 'a' }, 'matching final resolves after every earlier event observer completes');
    assertDeepEqual(order.filter((entry) => entry.startsWith('a:')), [
      'a:1:global-1:start',
      'a:1:global-1:end',
      'a:1:global-2',
      'a:1:request',
      'a:2:global-1:start',
      'a:2:global-1:end',
      'a:2:global-2',
      'a:2:request'
    ], 'global observers retain registration order and legacy per-request observers run after them for each event');
    assertEqual(removeFirst(), true, 'observer remover unregisters its observer exactly once');
    assertEqual(removeFirst(), false, 'observer remover is idempotent');
  }

  {
    const harness = buildClientHarness();
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const socket = harness.sockets[0];
    socket.open();

    let failingObserverCalls = 0;
    client.addEventObserver((event) => {
      if (event.payload.fail === 'throw') {
        failingObserverCalls++;
        throw new Error('synchronous observer detail');
      }
      if (event.payload.fail === 'reject') {
        failingObserverCalls++;
        return Promise.reject(new Error('asynchronous observer detail'));
      }
      return undefined;
    });

    const throwing = client.sendExtRequest('delegate.start', { task: 'throw' });
    const throwFrame = JSON.parse(socket.sent[0]);
    const unrelated = client.sendExtRequest('delegate.start', { task: 'unrelated' });
    const unrelatedFrame = JSON.parse(socket.sent[1]);
    socket.receive({ id: throwFrame.id, type: 'ext:event', event: 'progress', payload: { fail: 'throw' } });
    socket.receive({ id: unrelatedFrame.id, type: 'ext:event', event: 'progress', payload: { ok: true } });
    socket.receive({ id: throwFrame.id, type: 'ext:response', payload: { nominalSuccess: true } });
    socket.receive({ id: unrelatedFrame.id, type: 'ext:response', payload: { ok: true } });

    await throwing.then(
      () => assert(false, 'a synchronous observer failure wins over a nominal success final'),
      (error) => {
        assertEqual(error.code, 'ext_event_observer_failed', 'synchronous observer failure becomes the typed bridge failure');
        assertEqual(error.retryable, false, 'observer failure is non-retryable at the bridge correlation boundary');
      }
    );
    assertDeepEqual(toPlainObject(await unrelated), { ok: true }, 'observer failure does not reject or delay an unrelated request');

    const rejecting = client.sendExtRequest('delegate.start', { task: 'reject' });
    const rejectFrame = JSON.parse(socket.sent[2]);
    socket.receive({ id: rejectFrame.id, type: 'ext:event', event: 'progress', payload: { fail: 'reject' } });
    socket.receive({ id: rejectFrame.id, type: 'ext:response', payload: { nominalSuccess: true } });
    await rejecting.then(
      () => assert(false, 'an asynchronous observer rejection wins over a later nominal final'),
      (error) => assertEqual(error.code, 'ext_event_observer_failed', 'asynchronous observer rejection uses the same typed bridge failure')
    );
    assertEqual(failingObserverCalls, 2, 'sync and async observer failures each execute once and are never replayed');
  }
}

function runAsyncObserverSourceShapeCase() {
  console.log('\n--- Phase 61 async observer source-shape pins ---');
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
  for (const snippet of [
    'eventTail: Promise.resolve()',
    'observerError: null',
    'pending.eventTail = pending.eventTail',
    'await pending.eventTail',
    'ext_event_observer_failed',
    'addEventObserver(observer)'
  ]) {
    assert(source.includes(snippet), `bridge source includes per-pending observer barrier: ${snippet}`);
  }
  assert(!source.includes('_extEventTail'), 'bridge source has no global event promise tail');
  assert(!/forEach\s*\(\s*async\b/.test(source), 'bridge source has no unawaited async forEach observer path');
  assert(!source.includes('event observers do not settle'), 'bridge source has no catch-and-continue observer failure path');
}

async function runDelegationHeartbeatCases() {
  console.log('\n--- Phase 61 acknowledged delegation heartbeat ---');

  const activeIntervals = (harness, delay) => harness.timers.intervals
    .filter((timer) => timer.delay === delay && !timer.cleared);

  {
    const harness = buildClientHarness();
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const socket = harness.sockets[0];
    socket.open();

    assertEqual(harness.exports.MCP_PING_INTERVAL_MS, 25000, 'ordinary bridge ping remains on its legacy 25-second cadence');
    assertEqual(harness.exports.DELEGATION_HEARTBEAT_INTERVAL_MS, 20000, 'active delegation heartbeat cadence is exactly 20 seconds');
    assertEqual(harness.exports.DELEGATION_HEARTBEAT_MISS_LIMIT, 3, 'active delegation disconnect threshold is exactly three misses');
    assertEqual(activeIntervals(harness, 25000).length, 1, 'no owner starts only the ordinary bridge timer');
    assertEqual(activeIntervals(harness, 20000).length, 0, 'no active delegation starts no acknowledged heartbeat');
    assertEqual(client.retainDelegationHeartbeat(''), false, 'empty heartbeat owner is rejected');
    assertEqual(client.retainDelegationHeartbeat(' owner-a'), false, 'non-canonical heartbeat owner is rejected');

    assertEqual(client.retainDelegationHeartbeat('owner-a'), true, 'first owner retains the acknowledged heartbeat');
    assertEqual(activeIntervals(harness, 25000).length, 0, 'zero-to-one retain replaces the ordinary timer');
    assertEqual(activeIntervals(harness, 20000).length, 1, 'zero-to-one retain starts exactly one 20-second interval');
    assertEqual(client.retainDelegationHeartbeat('owner-a'), false, 'duplicate retain is idempotent');
    assertEqual(client.retainDelegationHeartbeat('owner-b'), true, 'a second distinct owner increments the refcount');
    assertEqual(activeIntervals(harness, 20000).length, 1, 'two owners still share one heartbeat interval');

    const heartbeatTimer = activeIntervals(harness, 20000)[0];
    heartbeatTimer.fn();
    const firstPing = JSON.parse(socket.sent[socket.sent.length - 1]);
    assertDeepEqual(Object.keys(firstPing).sort(), ['nonce', 'ts', 'type'], 'active heartbeat uses the exact additive ping shape');
    assertEqual(firstPing.type, 'mcp:ping', 'active heartbeat emits mcp:ping');
    assert(Number.isSafeInteger(firstPing.ts) && firstPing.ts >= 0, 'active heartbeat timestamp is a safe non-negative integer');
    assert(/^[A-Za-z0-9_-]{16,64}$/.test(firstPing.nonce), 'active heartbeat nonce is bounded and opaque');

    socket.receive({ type: 'mcp:pong', ts: -1, nonce: firstPing.nonce });
    assertEqual(client._delegationHeartbeatNonce, firstPing.nonce, 'invalid pong timestamp cannot acknowledge the outstanding beat');
    socket.receive({ type: 'mcp:pong', ts: Date.now(), nonce: firstPing.nonce, extra: true });
    assertEqual(client._delegationHeartbeatNonce, firstPing.nonce, 'extra pong fields fail closed without acknowledging the beat');
    socket.receive({ type: 'mcp:pong', ts: Date.now(), nonce: 'w'.repeat(16) });
    assertEqual(client._delegationHeartbeatNonce, firstPing.nonce, 'wrong nonce pong cannot acknowledge the outstanding beat');
    heartbeatTimer.fn();
    const secondPing = JSON.parse(socket.sent[socket.sent.length - 1]);
    assertEqual(client.getDelegationConnectionSnapshot().consecutiveMisses, 1, 'an unacknowledged current nonce increments misses once');
    socket.receive({ type: 'mcp:pong', ts: Date.now(), nonce: firstPing.nonce });
    assertEqual(client.getDelegationConnectionSnapshot().consecutiveMisses, 1, 'stale pong cannot reset the miss counter');
    socket.receive({ type: 'mcp:pong', ts: Date.now(), nonce: secondPing.nonce });
    const acknowledged = client.getDelegationConnectionSnapshot();
    assertEqual(acknowledged.consecutiveMisses, 0, 'exact current nonce pong resets misses');
    assertEqual(acknowledged.state, 'connected', 'exact current nonce pong publishes connected');
    assert(Number.isSafeInteger(acknowledged.lastAckAt), 'exact current nonce pong records an acknowledgement timestamp');
    socket.receive({ type: 'mcp:pong', ts: Date.now(), nonce: secondPing.nonce });
    assertEqual(client._delegationHeartbeatNonce, null, 'duplicate pong is ignored after acknowledgement');

    heartbeatTimer.fn();
    const boundaryPing = JSON.parse(socket.sent[socket.sent.length - 1]);
    socket.receive({ type: 'mcp:pong', ts: Date.now(), nonce: boundaryPing.nonce });
    heartbeatTimer.fn();
    assertEqual(client.getDelegationConnectionSnapshot().consecutiveMisses, 0, 'ack at the heartbeat boundary prevents a false miss');

    assertEqual(client.releaseDelegationHeartbeat('owner-a'), true, 'staggered release removes the first owner');
    assertEqual(activeIntervals(harness, 20000).length, 1, 'one remaining owner keeps the shared heartbeat alive');
    assertEqual(client.releaseDelegationHeartbeat('owner-a'), false, 'duplicate release is idempotent');
    assertEqual(client.releaseDelegationHeartbeat('owner-b'), true, 'final owner release reaches zero');
    assertEqual(activeIntervals(harness, 20000).length, 0, 'one-to-zero release clears the acknowledged heartbeat');
    assertEqual(activeIntervals(harness, 25000).length, 1, 'one-to-zero release restores ordinary bridge keepalive');
  }

  {
    const harness = buildClientHarness();
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const socket = harness.sockets[0];
    socket.open();
    client.retainDelegationHeartbeat('three-miss-owner');
    const heartbeatTimer = activeIntervals(harness, 20000)[0];

    heartbeatTimer.fn();
    heartbeatTimer.fn();
    assertDeepEqual(toPlainObject(client.getDelegationConnectionSnapshot()), {
      state: 'connected',
      consecutiveMisses: 1,
      lastAckAt: null
    }, 'one missed acknowledgement remains connected');
    heartbeatTimer.fn();
    assertEqual(client.getDelegationConnectionSnapshot().consecutiveMisses, 2, 'exactly two consecutive misses remain below disconnect threshold');
    assertEqual(client.getDelegationConnectionSnapshot().state, 'connected', 'exactly two consecutive misses remain connected');
    const staleNonce = JSON.parse(socket.sent[socket.sent.length - 1]).nonce;
    heartbeatTimer.fn();
    const currentPing = JSON.parse(socket.sent[socket.sent.length - 1]);
    assertEqual(client.getDelegationConnectionSnapshot().consecutiveMisses, 3, 'third consecutive unacknowledged beat is counted');
    assertEqual(client.getDelegationConnectionSnapshot().state, 'disconnected', 'three consecutive missed acknowledgements classify disconnected');

    socket.receive({ type: 'mcp:pong', ts: Date.now(), nonce: staleNonce });
    assertEqual(client.getDelegationConnectionSnapshot().state, 'disconnected', 'stale acknowledgement cannot revive a disconnected classification');
    socket.receive({ type: 'mcp:pong', ts: Date.now(), nonce: currentPing.nonce });
    assertEqual(client.getDelegationConnectionSnapshot().state, 'connected', 'later exact current acknowledgement may return to connected');
    assertEqual(client.getDelegationConnectionSnapshot().consecutiveMisses, 0, 'later exact current acknowledgement clears misses without replay');
    assert(socket.sent.every((raw) => JSON.parse(raw).type === 'mcp:ping'), 'heartbeat recovery sends no restart or work-replay frame');
  }

  {
    const harness = buildClientHarness();
    const client = harness.exports.mcpBridgeClient;
    client.connect();
    await flushMicrotasks();
    const firstSocket = harness.sockets[0];
    firstSocket.open();
    client.retainDelegationHeartbeat('reconnect-owner');
    const firstTimer = activeIntervals(harness, 20000)[0];
    firstTimer.fn();
    firstSocket.close();
    assertEqual(activeIntervals(harness, 20000).length, 0, 'socket close clears the acknowledged heartbeat timer');
    assertEqual(client.getDelegationConnectionSnapshot().state, 'disconnected', 'socket close publishes disconnected heartbeat state');

    const reconnectTimer = harness.timers.timeouts.find((timer) => !timer.cleared && timer.delay >= 2000);
    reconnectTimer.fn();
    await flushMicrotasks();
    const replacement = harness.sockets[1];
    replacement.open();
    assertEqual(activeIntervals(harness, 20000).length, 1, 'reconnect with a retained owner starts one replacement heartbeat timer');
    assertEqual(activeIntervals(harness, 25000).length, 0, 'reconnect with a retained owner does not also start ordinary keepalive');
    assertEqual(replacement.sent.length, 0, 'reconnect does not replay an outstanding beat or delegated work');
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
  await runPairingConstructionCases();
  await runPairingProbeAndReloadCases();
  await runExtRequestLifecycleCases();
  await runAsyncExtObserverCases();
  runAsyncObserverSourceShapeCase();
  await runDelegationHeartbeatCases();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
