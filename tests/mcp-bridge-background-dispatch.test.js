'use strict';

/**
 * mcp-bridge-background-dispatch.test.js
 *
 * Covers the same-context dispatch fix for vault/payment MCP tools:
 *
 * mcp-bridge-client.js is evaluated inside the background service worker,
 * and chrome.runtime.sendMessage() never delivers to onMessage listeners in
 * the sender's own context (the Phase 225-01 constraint). background.js now
 * exposes globalThis.fsbDispatchInternalMessage, which invokes its named
 * onMessage handler (fsbHandleRuntimeMessage) directly with a synthetic
 * sender, and _dispatchToBackground prefers it over sendMessage.
 *
 * Part A -- bridge behavior (vm-loaded mcp-bridge-client.js): prefers the
 *   global, falls back to sendMessage when absent, error envelopes, MCP-01
 *   secret strip end-to-end, agent-action deprecation short-circuit.
 * Part B -- wrapper behavior (fsbDispatchInternalMessage extracted from
 *   background.js): sync/async respond, no-response, throw, double-respond,
 *   timeout, synthetic sender shape.
 * Part C -- source-contract pins on background.js and mcp-bridge-client.js.
 *
 * Harness copied from tests/mcp-bridge-client-lifecycle.test.js (repo
 * convention: copy, don't share), extended with a chrome.runtime.sendMessage
 * mock and an optional fsbDispatchInternalMessage context seed.
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const vm = require('vm');

const delegationProviders = require(path.join(
  __dirname, '..', 'extension', 'utils', 'delegation-providers.js'
));

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

function toPlainObject(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// vm-created objects carry a foreign Object.prototype; normalize both sides
// so deep comparison is structural (same approach as the lifecycle test).
function assertDeepEqual(actual, expected, msg) {
  assert(util.isDeepStrictEqual(toPlainObject(actual), toPlainObject(expected)), `${msg} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

function assertNoSecrets(value, msg) {
  const serialized = JSON.stringify(value || {});
  assert(!/password|cardNumber|cvv|apiKey/i.test(serialized), msg);
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

async function flushMicrotasks() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
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
    }
  };
}

function createChromeMock() {
  const session = createStorageArea();
  const local = createStorageArea();
  const alarms = new Map();
  const sendMessageCalls = [];
  const runtime = {
    id: 'dispatch-test-extension',
    onMessage: createRuntimeOnMessageMock(),
    lastError: undefined,
    // Callback-style sendMessage; scenario overrides via _sendMessageImpl.
    sendMessage(request, callback) {
      sendMessageCalls.push(request);
      if (typeof runtime._sendMessageImpl === 'function') {
        runtime._sendMessageImpl(request, callback);
        return;
      }
      if (typeof callback === 'function') callback({});
    },
    _sendMessageImpl: null,
    _sendMessageCalls: sendMessageCalls
  };
  return {
    runtime,
    storage: { session, local },
    alarms: {
      async create(name, options) {
        alarms.set(name, { name, ...options });
      },
      async clear(name) {
        alarms.delete(name);
        return true;
      },
      async getAll() {
        return Array.from(alarms.values());
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
  if (typeof options.fsbDispatchInternalMessage === 'function') {
    context.fsbDispatchInternalMessage = options.fsbDispatchInternalMessage;
  }

  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
  const footer = `
this.__dispatchTest = {
  MCPBridgeClient,
  mcpBridgeClient
};
`;
  vm.runInNewContext(`${source}\n${footer}`, context, { filename: 'ws/mcp-bridge-client.js' });
  if (options.inboundAuthorityReady !== false) {
    context.__dispatchTest.mcpBridgeClient.setInboundAuthorityReady(true);
    context.__dispatchTest.mcpBridgeClient.setDelegationAuthorityReady(true);
  }

  return {
    chrome,
    timers,
    context,
    sockets: FakeWebSocket._sockets,
    exports: context.__dispatchTest
  };
}

// ---------------------------------------------------------------------------
// Part A -- bridge behavior
// ---------------------------------------------------------------------------

async function runPrefersInternalDispatchCase() {
  console.log('\n--- A1/A3/A4: _dispatchToBackground prefers globalThis.fsbDispatchInternalMessage ---');

  const dispatchCalls = [];
  let dispatchResult = Promise.resolve({ success: true, credentials: [] });
  const harness = buildClientHarness({
    fsbDispatchInternalMessage(request) {
      dispatchCalls.push(request);
      return dispatchResult;
    }
  });
  const client = harness.exports.mcpBridgeClient;

  const request = { action: 'getAllCredentials' };
  dispatchResult = Promise.resolve({ success: true, credentials: [{ domain: 'example.com', username: 'u' }] });
  const response = await client._dispatchToBackground(request);
  assertEqual(dispatchCalls.length, 1, 'internal dispatch invoked exactly once');
  assertEqual(dispatchCalls[0], request, 'internal dispatch received the exact request object');
  assertEqual(harness.chrome.runtime._sendMessageCalls.length, 0, 'chrome.runtime.sendMessage never called when the global exists');
  assertDeepEqual(response, { success: true, credentials: [{ domain: 'example.com', username: 'u' }] }, 'internal dispatch response passes through unchanged');

  // A3: rejection surfaces as a { success:false, error } envelope, never a throw.
  dispatchResult = Promise.reject(new Error('boom'));
  const rejected = await client._dispatchToBackground({ action: 'getAllPaymentMethods' });
  assertDeepEqual(rejected, { success: false, error: 'boom' }, 'internal dispatch rejection becomes an error envelope');

  // A4: undefined response coerces to {}.
  dispatchResult = Promise.resolve(undefined);
  const empty = await client._dispatchToBackground({ action: 'getFullCredential' });
  assertDeepEqual(empty, {}, 'undefined internal dispatch response coerces to {}');
}

async function runSendMessageFallbackCase() {
  console.log('\n--- A2: _dispatchToBackground falls back to sendMessage when the global is absent ---');

  const harness = buildClientHarness();
  const client = harness.exports.mcpBridgeClient;
  const runtime = harness.chrome.runtime;

  runtime._sendMessageImpl = (request, callback) => {
    callback({ success: true, via: 'sendMessage' });
  };
  const response = await client._dispatchToBackground({ action: 'getAllCredentials' });
  assertEqual(runtime._sendMessageCalls.length, 1, 'fallback path calls chrome.runtime.sendMessage');
  assertDeepEqual(response, { success: true, via: 'sendMessage' }, 'fallback response passes through unchanged');

  // Port-closed shape (pre-fix behavior) still maps to an error envelope.
  runtime._sendMessageImpl = (request, callback) => {
    runtime.lastError = { message: 'The message port closed before a response was received.' };
    callback(undefined);
    runtime.lastError = undefined;
  };
  const portClosed = await client._dispatchToBackground({ action: 'getAllCredentials' });
  assertDeepEqual(
    portClosed,
    { success: false, error: 'The message port closed before a response was received.' },
    'fallback lastError becomes a { success:false, error } envelope'
  );

  // Undefined callback response (no lastError) coerces to {}.
  runtime._sendMessageImpl = (request, callback) => {
    callback(undefined);
  };
  const empty = await client._dispatchToBackground({ action: 'getAllCredentials' });
  assertDeepEqual(empty, {}, 'undefined fallback response coerces to {}');
}

async function runListCredentialsSecretStripCase() {
  console.log('\n--- A5: mcp:list-credentials end-to-end strips secrets (MCP-01) ---');

  const dispatchCalls = [];
  const harness = buildClientHarness({
    fsbDispatchInternalMessage(request) {
      dispatchCalls.push(request);
      return Promise.resolve({
        success: true,
        credentials: [
          { domain: 'example.com', username: 'alice', password: 'hunter2' },
          { domain: 'shop.test', username: 'bob', password: 's3cret' }
        ]
      });
    }
  });
  const client = harness.exports.mcpBridgeClient;

  const result = await client._routeMessage('mcp:list-credentials', {}, 'msg-1');
  assertEqual(dispatchCalls.length, 1, 'list-credentials dispatches once through the internal path');
  assertDeepEqual(dispatchCalls[0], { action: 'getAllCredentials' }, 'list-credentials sends the getAllCredentials action');
  assertEqual(result.success, true, 'list-credentials succeeds via internal dispatch');
  assertDeepEqual(
    result.credentials,
    [
      { domain: 'example.com', username: 'alice' },
      { domain: 'shop.test', username: 'bob' }
    ],
    'credentials reduced to domain + username'
  );
  assertNoSecrets(result, 'list-credentials response contains no password material');
}

async function runAgentActionDeprecationCase() {
  console.log('\n--- A6: agent actions short-circuit with a deprecation envelope ---');

  const dispatchCalls = [];
  const harness = buildClientHarness({
    fsbDispatchInternalMessage(request) {
      dispatchCalls.push(request);
      return Promise.resolve({ success: true });
    }
  });
  const client = harness.exports.mcpBridgeClient;

  const result = await client._routeMessage('mcp:create-agent', { name: 'legacy' }, 'msg-2');
  assertEqual(result.success, false, 'create-agent reports failure');
  assertEqual(result.errorCode, 'agent_management_deprecated', 'create-agent returns the deprecation errorCode');
  assert(/createAgent/.test(result.error || ''), 'deprecation message names the requested action');
  assertEqual(dispatchCalls.length, 0, 'deprecated agent action never dispatches to background');

  const stats = await client._routeMessage('mcp:get-agent-stats', {}, 'msg-3');
  assertEqual(stats.errorCode, 'agent_management_deprecated', 'get-agent-stats returns the deprecation errorCode');
  assertEqual(dispatchCalls.length, 0, 'no agent action reaches the dispatch path');
}

// ---------------------------------------------------------------------------
// Part B -- fsbDispatchInternalMessage wrapper (extracted from background.js)
// ---------------------------------------------------------------------------

function extractNamedFunctionSource(backgroundSource, anchor) {
  const start = backgroundSource.indexOf(anchor);
  if (start === -1) throw new Error(`${anchor} not found in background.js`);
  let depth = 0;
  for (let i = start + anchor.length - 1; i < backgroundSource.length; i++) {
    const ch = backgroundSource[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return backgroundSource.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced braces while extracting ${anchor}`);
}

function extractWrapperSource(backgroundSource) {
  return extractNamedFunctionSource(
    backgroundSource,
    'function fsbDispatchInternalMessage(request) {'
  );
}

function extractDelegationCompositionSource(backgroundSource) {
  const startMarker = 'let fsbDelegationBootPromise = null;';
  const endMarker = '\nfunction findActiveAutomationSessionForTab(tabId) {';
  const start = backgroundSource.indexOf(startMarker);
  const end = backgroundSource.indexOf(endMarker, start);
  if (start < 0 || end <= start) throw new Error('delegation composition extraction markers missing');
  return backgroundSource.slice(start, end);
}

function extractCompatibilityCompositionSource(backgroundSource) {
  const startMarker = 'let fsbMcpCompatibilityRefreshPromise = null;';
  const endMarker = '\nfunction armMcpBridge(reason) {';
  const start = backgroundSource.indexOf(startMarker);
  const end = backgroundSource.indexOf(endMarker, start);
  if (start < 0 || end <= start) throw new Error('compatibility composition extraction markers missing');
  return backgroundSource.slice(start, end);
}

function buildCompatibilityRefreshHarness(options = {}) {
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const source = extractCompatibilityCompositionSource(backgroundSource);
  const calls = [];
  let pairingStatus = options.pairingStatus || 'paired';
  let pairingObserver = null;
  let cachedSnapshot = Object.prototype.hasOwnProperty.call(options, 'cachedSnapshot')
    ? options.cachedSnapshot
    : {
        schemaVersion: 1,
        checkedAt: 100,
        adapters: [{
          adapterId: 'claude-code',
          displayLabel: 'Claude Code',
          status: 'supported',
          reason: 'within_tested_range'
        }]
      };
  const clients = options.clients || {
    'claude-code': {
      id: 'claude-code',
      compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 100 }
    }
  };
  const providers = {
    COMPATIBILITY_MAX_AGE_MS: 15 * 60 * 1000,
    validateCompatibilitySnapshot(value) {
      calls.push(['validate', toPlainObject(value)]);
      if (value === null || value === undefined || options.rejectValidation) return null;
      return value;
    },
    async replaceCompatibility(value) {
      calls.push(['replace:start', toPlainObject(value)]);
      if (options.replaceGate) await options.replaceGate.promise;
      if (options.rejectReplace) throw new Error('storage rejected');
      cachedSnapshot = value;
      calls.push(['replace:done']);
      return { compatibility: value };
    },
    async read() {
      calls.push(['read']);
      return cachedSnapshot ? { compatibility: cachedSnapshot } : {};
    },
    async getMergedClients(liveRecords) {
      calls.push(['merge', toPlainObject(liveRecords)]);
      return clients;
    }
  };
  const bridge = {
    getState() { return { pairingStatus }; },
    requestAdapterCompatibility() {
      calls.push(['request']);
      if (typeof options.requestCompatibility === 'function') {
        return options.requestCompatibility();
      }
      if (options.rejectRequest) return Promise.reject(new Error('bridge unavailable'));
      return Promise.resolve(options.response || {
        schemaVersion: 1,
        checkedAt: 200,
        adapters: [{
          adapterId: 'claude-code',
          displayLabel: 'Claude Code',
          status: 'supported',
          reason: 'within_tested_range'
        }]
      });
    },
    addPairingStatusObserver(observer) {
      calls.push(['observe-pairing']);
      pairingObserver = observer;
      return () => {};
    }
  };
  const registry = {
    listAgents() {
      calls.push(['listAgents']);
      return [{ agentId: 'agent_fixture', clientInfo: { name: 'Claude Code' } }];
    }
  };
  const context = {
    mcpBridgeClient: bridge,
    FsbMcpAgentProviders: providers,
    FsbDelegationProviders: delegationProviders,
    fsbAgentRegistryInstance: registry,
    Promise,
    Object,
    Array,
    Number,
    Date,
    Error,
    console
  };
  context.globalThis = context;
  vm.runInNewContext(
    `${source}\n`
      + 'this.__readCachedClients = typeof fsbReadCachedMcpClients === \'function\' '
      + '? fsbReadCachedMcpClients : null;\n'
      + 'this.__refreshCompatibility = fsbRefreshMcpCompatibility;',
    context,
    { filename: 'background.js#compatibility-refresh' }
  );
  return {
    readCached: context.__readCachedClients,
    refresh: context.__refreshCompatibility,
    calls,
    clients,
    get pairingObserver() { return pairingObserver; },
    setPairingStatus(value) { pairingStatus = value; }
  };
}

function buildMcpClientsRuntimeHarness({ readCachedImpl, refreshImpl }) {
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const startMarker = 'const fsbHandleRuntimeMessage = (request, sender, sendResponse) => {';
  const endMarker = '\nchrome.runtime.onMessage.addListener(fsbHandleRuntimeMessage);';
  const start = backgroundSource.indexOf(startMarker);
  const end = backgroundSource.indexOf(endMarker, start);
  if (start < 0 || end <= start) throw new Error('runtime handler extraction markers missing');
  const handlerSource = backgroundSource.slice(start, end);
  const context = {
    chrome: { runtime: { id: 'mcp-clients-runtime-extension' } },
    armMcpBridge() {},
    fsbHandleDelegationCommand() { return null; },
    automationLogger: { logComm() {} },
    fsbReadCachedMcpClients: readCachedImpl,
    fsbRefreshMcpCompatibility: refreshImpl,
    Promise,
    Object,
    console
  };
  context.globalThis = context;
  vm.runInNewContext(`${handlerSource}\nthis.__handler = fsbHandleRuntimeMessage;`, context, {
    filename: 'background.js#getMcpClients'
  });
  return context.__handler;
}

function buildDelegationCommandHarness(options = {}) {
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const source = extractDelegationCompositionSource(backgroundSource);
  const preflight = require(path.join(__dirname, '..', 'extension', 'utils', 'delegation-preflight.js'));
  const calls = [];
  let inboundAuthorityReady = true;
  let delegationAuthorityReady = true;
  const providerConfig = {
    providerKind: 'agent',
    agentProviderId: 'claude-code',
    modelProvider: 'xai',
    ...(options.providerConfig || {})
  };
  const consent = {
    async getTrusted(providerId) {
      calls.push(['getTrusted', providerId]);
      return options.trusted === true;
    },
    async issueChallenge(input) {
      calls.push(['issueChallenge', toPlainObject(input)]);
      return { ok: true, challengeId: 'dch_fixture', expiresAt: 12345 };
    },
    async consumeChallenge(input) {
      calls.push(['consumeChallenge', toPlainObject(input)]);
      return { ok: true };
    },
    async writeTrustFromChallenge(input) {
      calls.push(['writeTrustFromChallenge', toPlainObject(input)]);
      return options.writeTrustResult || { ok: true, providerId: input.providerId, trusted: true };
    },
    async clearTrusted(input) {
      calls.push(['clearTrusted', toPlainObject(input)]);
      return options.clearTrustResult || { ok: true, providerId: input.providerId, trusted: false };
    }
  };
  const context = {
    chrome: {
      storage: { local: { async get() { return { ...providerConfig }; } } },
      runtime: { async sendMessage() {} },
      tabs: { async query() { return []; } }
    },
    FsbDelegationPreflight: preflight,
    FsbDelegationProviders: delegationProviders,
    FsbMcpAgentProviders: {
      async getMergedClients() {
        calls.push(['getMergedClients']);
        return options.compatibilityClients || {
          'claude-code': {
            compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 100 }
          },
          opencode: {
            compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 100 }
          }
        };
      }
    },
    FsbDelegationConsent: consent,
    FsbDelegationController: { create() { throw new Error('controller must not boot in authority-only cases'); } },
    FsbDelegationEventStore: {},
    fsbAgentRegistryInstance: null,
    bootstrapAgentRegistry: async () => {},
    mcpBridgeClient: {
      setInboundAuthorityReady(value) {
        inboundAuthorityReady = value === true;
        calls.push(['setInboundAuthorityReady', inboundAuthorityReady]);
        return inboundAuthorityReady;
      },
      isInboundAuthorityReady() { return inboundAuthorityReady; },
      setDelegationAuthorityReady(value) {
        delegationAuthorityReady = value === true;
        calls.push(['setDelegationAuthorityReady', delegationAuthorityReady]);
        return delegationAuthorityReady;
      },
      isDelegationAuthorityReady() { return delegationAuthorityReady; },
      getState() {
        return {
          connected: true,
          status: 'connected',
          pairingStatus: 'paired',
          delegationConnection: { state: 'connected' }
        };
      },
      sendExtRequest(method, payload) {
        calls.push(['sendExtRequest', method, toPlainObject(payload)]);
        return Promise.reject(new Error('unexpected transport call'));
      },
      addEventObserver() { calls.push(['addEventObserver']); }
    },
    crypto: require('node:crypto').webcrypto,
    TextEncoder,
    Uint8Array,
    Map,
    Set,
    Object,
    Array,
    Promise,
    Date,
    Number,
    Error,
    JSON,
    console,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  vm.runInNewContext(
    `${source}\nthis.__delegationCommand = fsbHandleDelegationCommand;`,
    context,
    { filename: 'background.js#delegation-composition' }
  );
  return {
    command: context.__delegationCommand,
    calls,
    setProviderId(providerId) { providerConfig.agentProviderId = providerId; }
  };
}

function extractDriftSettlementSource(backgroundSource) {
  const startMarker = 'const FSB_AGENT_PROTOCOL_DRIFT_SEEN_LIMIT = 512;';
  const endMarker = '\nasync function fsbDelegationStartCommand(request) {';
  const start = backgroundSource.indexOf(startMarker);
  const end = backgroundSource.indexOf(endMarker, start);
  if (start < 0 || end <= start) throw new Error('drift settlement extraction markers missing');
  return backgroundSource.slice(start, end);
}

function buildDriftSettlementHarness(options = {}) {
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const source = extractDriftSettlementSource(backgroundSource);
  const driftDiagnostics = require(path.join(
    __dirname,
    '..',
    'extension',
    'utils',
    'agent-protocol-drift-diagnostics.js'
  ));
  const reporterCalls = [];
  const settlementCalls = [];
  const snapshots = new Map();
  const profiles = new Map();
  const controller = {
    getSnapshot(delegationId) {
      if (options.snapshotThrows === true) throw new Error('snapshot failed');
      return snapshots.get(delegationId) || null;
    },
    async acceptEvent(input) {
      settlementCalls.push(toPlainObject(input));
      if (options.controllerThrows === true) throw new Error('controller rejected terminal');
      const snapshot = snapshots.get(input.delegationId);
      if (snapshot) snapshot.terminal = { code: input.context.terminalCode };
      return { ok: true };
    }
  };
  const diagnostics = options.missingDiagnostics === true ? undefined : {
    validateAgentProtocolDriftDetail(detail) {
      if (options.validatorThrows === true) throw new Error('validator failed');
      return driftDiagnostics.validateAgentProtocolDriftDetail(detail);
    },
    reportAgentProtocolDrift(detail) {
      reporterCalls.push(toPlainObject(detail));
      if (options.reporterThrows === true) throw new Error('reporter failed');
      return true;
    }
  };
  const sandbox = {
    FsbAgentProtocolDriftDiagnostics: diagnostics,
    fsbDelegationControllerInstance: controller,
    fsbDelegationProfiles: profiles,
    Date: { now: () => 4242 },
    Map,
    Set,
    Object,
    Array,
    Number,
    Promise,
    Error
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    `${source}\nthis.__settle = fsbSettleDelegationFromFinal;\n`
      + 'this.__seen = fsbAgentProtocolDriftSeenDelegationIds;\n'
      + 'this.__seenLimit = FSB_AGENT_PROTOCOL_DRIFT_SEEN_LIMIT;',
    sandbox,
    { filename: 'background.js#drift-settlement' }
  );
  return {
    settle: sandbox.__settle,
    seen: sandbox.__seen,
    seenLimit: sandbox.__seenLimit,
    reporterCalls,
    settlementCalls,
    profiles,
    activate(delegationId, profileVersion = '2.1.177') {
      snapshots.set(delegationId, { delegationId, terminal: null });
      profiles.set(delegationId, profileVersion);
    },
    resetActive(delegationId, profileVersion = '2.1.177') {
      snapshots.set(delegationId, { delegationId, terminal: null });
      profiles.set(delegationId, profileVersion);
    }
  };
}

function driftFinal(detail = {
  adapterId: 'claude-code',
  expected: 'bounded_jsonl',
  observed: 'invalid_json'
}) {
  return {
    status: 'failed',
    terminal: {
      type: 'diagnostic',
      code: 'agent_protocol_drift',
      profileVersion: '2.1.177',
      detail
    }
  };
}

function buildWrapperHarness(handlerImpl) {
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const wrapperSource = extractWrapperSource(backgroundSource);
  const timers = createFakeTimers();
  const handlerCalls = [];

  const context = {
    chrome: { runtime: { id: 'wrapper-test-extension' } },
    FSB_INTERNAL_DISPATCH_TIMEOUT_MS: 20000,
    fsbHandleRuntimeMessage(request, sender, sendResponse) {
      handlerCalls.push({ request, sender });
      return handlerImpl(request, sender, sendResponse);
    },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    Promise,
    console
  };
  context.globalThis = context;

  vm.runInNewContext(
    `${wrapperSource}\nthis.__wrapper = fsbDispatchInternalMessage;`,
    context,
    { filename: 'background.js#fsbDispatchInternalMessage' }
  );

  return { dispatch: context.__wrapper, timers, handlerCalls };
}

async function runDriftSettlementCases() {
  console.log('\n--- B0: authoritative drift finals report exactly once ---');

  {
    const harness = buildDriftSettlementHarness();
    const delegationId = 'delegation_drift_primary';
    harness.activate(delegationId);
    await harness.settle(delegationId, driftFinal(), null);

    assertEqual(harness.reporterCalls.length, 1,
      'first authoritative valid drift final invokes the reporter once');
    assertDeepEqual(harness.reporterCalls[0], {
      adapterId: 'claude-code', expected: 'bounded_jsonl', observed: 'invalid_json'
    }, 'reporter receives only the exact sanitized drift detail');
    assert(!JSON.stringify(harness.reporterCalls).includes(delegationId),
      'delegation id never enters diagnostic context');
    assertEqual(harness.settlementCalls.length, 1,
      'diagnostic reporting preserves one controller settlement');
    assertDeepEqual(harness.settlementCalls[0], {
      delegationId,
      event: { type: 'terminal', sessionId: null, payload: {} },
      context: {
        timestamp: 4242,
        terminalCode: 'agent_protocol_drift',
        treeSettled: true,
        client: { id: 'claude-code', label: 'Claude Code' },
        profileVersion: '2.1.177',
        billingKind: 'unknown'
      }
    }, 'controller terminal input remains byte-for-shape unchanged');
    assertEqual(harness.profiles.has(delegationId), false,
      'profile cleanup still occurs after drift settlement');

    await harness.settle(delegationId, driftFinal(), null);
    assertEqual(harness.reporterCalls.length, 1,
      'duplicate final against a terminal snapshot cannot multiply reporting');

    harness.resetActive(delegationId);
    await harness.settle(delegationId, driftFinal(), null);
    assertEqual(harness.reporterCalls.length, 1,
      'replayed final against a refreshed active snapshot remains deduplicated');
  }

  {
    const harness = buildDriftSettlementHarness();
    harness.activate('delegation_malformed');
    await harness.settle('delegation_malformed', driftFinal({
      adapterId: 'claude-code',
      expected: 'bounded_jsonl',
      observed: 'invalid_json',
      providerOutput: 'prompt=session-token-/private/path'
    }), null);
    assertEqual(harness.reporterCalls.length, 0,
      'malformed or secret-bearing drift detail never reaches the reporter');
    assertEqual(harness.settlementCalls[0].context.terminalCode, 'agent_protocol_drift',
      'malformed diagnostic detail cannot alter authoritative terminal settlement');

    harness.activate('delegation_non_drift');
    await harness.settle('delegation_non_drift', {
      status: 'failed',
      terminal: { type: 'diagnostic', code: 'agent_failed' }
    }, null);
    assertEqual(harness.reporterCalls.length, 0,
      'non-drift final never invokes the drift reporter');
    assertEqual(harness.settlementCalls.at(-1).context.terminalCode, 'agent_failed',
      'non-drift final retains its existing controller code');
  }

  {
    const harness = buildDriftSettlementHarness();
    for (const delegationId of ['delegation_distinct_a', 'delegation_distinct_b']) {
      harness.activate(delegationId);
      await harness.settle(delegationId, driftFinal(), null);
    }
    assertEqual(harness.reporterCalls.length, 2,
      'different delegation ids independently invoke the reporter');
    assertEqual(harness.seen.size, 2,
      'exact-once state tracks distinct authoritative delegations');
  }

  {
    const harness = buildDriftSettlementHarness();
    assertEqual(harness.seenLimit, 512, 'seen-id FIFO has the exact 512-entry bound');
    const ids = Array.from({ length: 513 }, (_, index) => `delegation_fifo_${String(index).padStart(3, '0')}`);
    for (const delegationId of ids) {
      harness.activate(delegationId);
      await harness.settle(delegationId, driftFinal(), null);
    }
    assertEqual(harness.seen.size, 512, 'seen-id state never exceeds 512 entries');
    assertEqual(harness.seen.has(ids[0]), false, 'capacity evicts the oldest inserted delegation id');
    assertEqual(harness.seen.has(ids[1]), true, 'capacity preserves the next-oldest delegation id');
    assertEqual(harness.seen.has(ids[512]), true, 'capacity preserves the newest delegation id');
  }

  for (const [name, options] of [
    ['missing diagnostics module', { missingDiagnostics: true }],
    ['throwing validator', { validatorThrows: true }],
    ['throwing reporter', { reporterThrows: true }]
  ]) {
    const harness = buildDriftSettlementHarness(options);
    const delegationId = `delegation_isolation_${name.replace(/\s+/g, '_')}`;
    harness.activate(delegationId);
    await harness.settle(delegationId, driftFinal(), null);
    assertEqual(harness.settlementCalls.length, 1,
      `${name} cannot prevent controller settlement`);
    assertEqual(harness.settlementCalls[0].context.terminalCode, 'agent_protocol_drift',
      `${name} cannot alter the controller terminal code`);
  }

  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const reportReferences = backgroundSource.match(/fsbReportAgentProtocolDriftOnce\s*\(/g) || [];
  assertEqual(reportReferences.length, 2,
    'report helper has one definition and one authoritative final-settlement call site');
  const connectionObserver = extractNamedFunctionSource(
    backgroundSource,
    'function fsbObserveDelegationConnection(connection) {'
  );
  const snapshotCommand = extractNamedFunctionSource(
    backgroundSource,
    'async function fsbDelegationSnapshotCommand(request) {'
  );
  assert(!connectionObserver.includes('fsbReportAgentProtocolDriftOnce')
      && !snapshotCommand.includes('fsbReportAgentProtocolDriftOnce'),
    'reconnect and panel snapshot/reopen paths cannot report drift');

  const redactorImport = backgroundSource.indexOf("importScripts('utils/redactForLog.js')");
  const reporterImport = backgroundSource.indexOf("importScripts('utils/agent-protocol-drift-diagnostics.js')");
  const webSocketImport = backgroundSource.indexOf("importScripts('ws/ws-client.js')");
  assert(redactorImport >= 0 && redactorImport < reporterImport && reporterImport < webSocketImport,
    'drift reporter loads after diagnostics/redaction and before final-capable runtime code');
}

async function runWrapperBehaviorCases() {
  console.log('\n--- B: fsbDispatchInternalMessage wrapper semantics ---');

  // B1 + B7: synchronous sendResponse resolves; synthetic sender shape.
  {
    const harness = buildWrapperHarness((request, sender, sendResponse) => {
      sendResponse({ ok: 1 });
      return undefined;
    });
    const result = await harness.dispatch({ action: 'getAllCredentials' });
    assertDeepEqual(result, { ok: 1 }, 'sync sendResponse resolves the promise');
    assertEqual(harness.handlerCalls.length, 1, 'handler invoked exactly once');
    assertEqual(harness.handlerCalls[0].sender.id, 'wrapper-test-extension', 'synthetic sender.id matches chrome.runtime.id (passes own-extension guard)');
    assertEqual(harness.handlerCalls[0].sender.fsbInternal, 'mcp-bridge', 'synthetic sender is tagged fsbInternal: mcp-bridge');
  }

  // B2: return true + async sendResponse resolves; safety timer cleared.
  {
    const harness = buildWrapperHarness((request, sender, sendResponse) => {
      Promise.resolve().then(() => sendResponse({ ok: 2 }));
      return true;
    });
    const result = await harness.dispatch({ action: 'getFullCredential' });
    assertDeepEqual(result, { ok: 2 }, 'async sendResponse (return true) resolves the promise');
    assertEqual(harness.timers.timeouts.length, 1, 'async path arms exactly one safety timer');
    assertEqual(harness.timers.timeouts[0].delay, 20000, 'safety timer uses FSB_INTERNAL_DISPATCH_TIMEOUT_MS');
    assertEqual(harness.timers.timeouts[0].cleared, true, 'safety timer cleared once the handler responds');
  }

  // B3: no response + return !== true mirrors closed-port semantics.
  {
    const harness = buildWrapperHarness(() => undefined);
    const result = await harness.dispatch({ action: 'createAgent' });
    assertEqual(result.success, false, 'no-response handler yields success:false');
    assert(/no response for action: createAgent/.test(result.error || ''), 'no-response envelope names the action');
    assertEqual(harness.timers.timeouts.length, 0, 'no safety timer armed when the handler declines the channel');
  }

  // B4: synchronous handler throw becomes an error envelope.
  {
    const harness = buildWrapperHarness(() => {
      throw new Error('kaboom');
    });
    const result = await harness.dispatch({ action: 'getAllPaymentMethods' });
    assertDeepEqual(result, { success: false, error: 'kaboom' }, 'handler throw becomes { success:false, error }');
  }

  // B5: double sendResponse -- first wins, second dropped.
  {
    const harness = buildWrapperHarness((request, sender, sendResponse) => {
      sendResponse({ first: true });
      sendResponse({ second: true });
      return undefined;
    });
    const result = await harness.dispatch({ action: 'getAllCredentials' });
    assertDeepEqual(result, { first: true }, 'first sendResponse wins; late responses dropped');
  }

  // B6: return true + never respond -> timeout envelope when the timer fires.
  {
    const harness = buildWrapperHarness(() => true);
    const pending = harness.dispatch({ action: 'getFullPaymentMethod' });
    assertEqual(harness.timers.timeouts.length, 1, 'never-responding handler leaves the safety timer armed');
    assertEqual(harness.timers.timeouts[0].cleared, false, 'safety timer not cleared while pending');
    harness.timers.timeouts[0].fn();
    const result = await pending;
    assertEqual(result.success, false, 'timeout yields success:false');
    assert(/timed out after 20000ms for action: getFullPaymentMethod/.test(result.error || ''), 'timeout envelope names the timeout and action');
  }

  // B8: the Phase 57 client inventory action uses the same exact async path.
  {
    const clients = {
      cursor: {
        id: 'cursor', raw: false, displayName: 'Cursor',
        clicked: null, installed: null, connected: null,
        live: { agentId: 'agent_cursor', clientInfo: { name: 'Cursor' } }
      }
    };
    const harness = buildWrapperHarness((request, sender, sendResponse) => {
      assertEqual(request.action, 'getMcpClients', 'inventory wrapper forwards the exact action');
      Promise.resolve().then(() => sendResponse({ success: true, clients }));
      return true;
    });
    const result = await harness.dispatch({ action: 'getMcpClients' });
    assertDeepEqual(result, { success: true, clients }, 'same-context inventory response passes through unchanged');
    assertEqual(harness.handlerCalls[0].sender.fsbInternal, 'mcp-bridge', 'inventory wrapper uses the synthetic MCP bridge sender');
  }
}

async function runCompatibilityRefreshCases() {
  console.log('\n--- B1: Phase 62 bounded compatibility refresh orchestration ---');

  {
    const harness = buildCompatibilityRefreshHarness({
      clients: {
        'claude-code': {
          id: 'claude-code',
          compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 500 }
        },
        opencode: {
          id: 'opencode',
          compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 100 }
        },
        codex: {
          id: 'codex',
          compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 1 }
        }
      }
    });
    const result = await harness.readCached();
    assertEqual(result.compatibilityExpiresAt, 900_100,
      'compatibility expiry uses the earliest exact shipped-provider row and ignores dormant Codex');
    assertEqual(harness.calls.filter((call) => call[0] === 'replace:start').length, 0,
      'expiry projection cannot write compatibility or provider selection');
  }

  {
    const harness = buildCompatibilityRefreshHarness();
    assertEqual(typeof harness.readCached, 'function',
      'background exposes a cache-only merged-client inventory path');
    if (typeof harness.readCached === 'function') {
      const result = await harness.readCached();
      assertDeepEqual(result, {
        clients: harness.clients,
        refreshOutcome: 'stale',
        compatibilityExpiresAt: 900_100
      },
        'cache-only inventory projects durable rows without changing the closed outcome');
      assertEqual(harness.calls.filter((call) => call[0] === 'request').length, 0,
        'cache-only inventory never requests daemon compatibility');
      assertEqual(harness.calls.filter((call) => call[0] === 'replace:start').length, 0,
        'cache-only inventory never writes compatibility storage');
    }
  }

  {
    const replaceGate = deferred();
    const harness = buildCompatibilityRefreshHarness({ replaceGate });
    const pending = harness.refresh();
    await flushMicrotasks();
    assertEqual(harness.calls.filter((call) => call[0] === 'request').length, 1,
      'fresh paired refresh issues one adapter compatibility request');
    assertEqual(harness.calls.filter((call) => call[0] === 'validate').length, 1,
      'daemon response is exact-validated once before replacement');
    assertEqual(harness.calls.filter((call) => call[0] === 'replace:start').length, 1,
      'validated response enters one durable replacement');
    assertEqual(harness.calls.filter((call) => call[0] === 'merge').length, 0,
      'merged rows cannot fan out while durable replacement is pending');
    replaceGate.resolve();
    const result = await pending;
    assertDeepEqual(result, {
      clients: harness.clients,
      refreshOutcome: 'refreshed',
      compatibilityExpiresAt: 900_100
    },
      'durable success returns clients plus the exact refreshed outcome');
    assert(harness.calls.findIndex((call) => call[0] === 'replace:done')
        < harness.calls.findIndex((call) => call[0] === 'merge'),
      'durable replacement completes before merged-client fan-out');
  }

  {
    const requestGate = deferred();
    const harness = buildCompatibilityRefreshHarness({
      requestCompatibility() { return requestGate.promise; }
    });
    const first = harness.refresh();
    const second = harness.refresh();
    assertEqual(first, second, 'simultaneous manual/cold refresh callers share one promise');
    await flushMicrotasks();
    assertEqual(harness.calls.filter((call) => call[0] === 'request').length, 1,
      'coalesced callers issue one live compatibility request');
    requestGate.resolve({
      schemaVersion: 1,
      checkedAt: 300,
      adapters: [{
        adapterId: 'claude-code', displayLabel: 'Claude Code',
        status: 'supported', reason: 'within_tested_range'
      }]
    });
    await Promise.all([first, second]);
  }

  {
    const harness = buildCompatibilityRefreshHarness({ pairingStatus: 'configured' });
    const result = await harness.refresh();
    assertDeepEqual(result, {
      clients: {
        'claude-code': {
          id: 'claude-code',
          compatibility: { status: 'degraded', reason: 'evidence_stale', checkedAt: 100 }
        }
      },
      refreshOutcome: 'stale',
      compatibilityExpiresAt: null
    }, 'unpaired/offline refresh degrades retained supported compatibility coherently');
    assertEqual(harness.calls.filter((call) => call[0] === 'request').length, 0,
      'unpaired refresh never enters reverse-channel transport');
  }

  {
    const harness = buildCompatibilityRefreshHarness({ rejectRequest: true });
    const result = await harness.refresh();
    assertDeepEqual(result.clients['claude-code'].compatibility,
      { status: 'degraded', reason: 'evidence_stale', checkedAt: 100 },
      'daemon refresh failure degrades fresh retained support to stale evidence');
    assertEqual(result.refreshOutcome, 'stale',
      'daemon refresh failure returns the coherent stale outcome');
  }

  {
    const harness = buildCompatibilityRefreshHarness({ rejectValidation: true });
    const result = await harness.refresh();
    assertDeepEqual(result, {
      clients: harness.clients,
      refreshOutcome: 'unavailable',
      compatibilityExpiresAt: null
    },
      'malformed response with no validated cache returns unavailable rows');
    assertEqual(harness.calls.filter((call) => call[0] === 'replace:start').length, 0,
      'malformed response never reaches durable replacement');
  }

  {
    const harness = buildCompatibilityRefreshHarness({ rejectReplace: true });
    const result = await harness.refresh();
    assertDeepEqual(result, {
      clients: {
        'claude-code': {
          id: 'claude-code',
          compatibility: { status: 'degraded', reason: 'evidence_stale', checkedAt: 100 }
        }
      },
      refreshOutcome: 'stale',
      compatibilityExpiresAt: null
    }, 'storage rejection degrades prior supported cache and reports stale');
    assertEqual(harness.calls.filter((call) => call[0] === 'merge').length, 1,
      'storage rejection still returns existing provider rows once');
  }

  for (const [label, compatibility] of [
    ['degraded', { status: 'degraded', reason: 'newer_than_tested_range', checkedAt: 100 }],
    ['unsupported', { status: 'unsupported', reason: 'wrong_major', checkedAt: 100 }]
  ]) {
    const clients = {
      'claude-code': { id: 'claude-code', compatibility }
    };
    const harness = buildCompatibilityRefreshHarness({ clients, rejectRequest: true });
    const result = await harness.refresh();
    assertDeepEqual(result.clients['claude-code'].compatibility, compatibility,
      `refresh failure preserves retained ${label} compatibility truth`);
  }

  {
    const harness = buildCompatibilityRefreshHarness({
      cachedSnapshot: null,
      rejectRequest: true
    });
    const result = await harness.refresh();
    assertDeepEqual(result, {
      clients: harness.clients,
      refreshOutcome: 'unavailable',
      compatibilityExpiresAt: null
    },
      'transport failure with no cache returns existing rows as unavailable');
  }

  {
    let requests = 0;
    const harness = buildCompatibilityRefreshHarness({
      requestCompatibility() {
        requests++;
        return Promise.resolve({
          schemaVersion: 1,
          checkedAt: 400 + requests,
          adapters: [{
            adapterId: 'claude-code', displayLabel: 'Claude Code',
            status: 'supported', reason: 'within_tested_range'
          }]
        });
      }
    });
    assertEqual(typeof harness.pairingObserver, 'function',
      'background installs one pairing observer for silent cold refresh');
    harness.pairingObserver('configured');
    harness.pairingObserver('paired');
    harness.pairingObserver('paired');
    await flushMicrotasks();
    assertEqual(requests, 1,
      'duplicate paired notification cannot multiply a cold-boot request');
    harness.pairingObserver('paired');
    await flushMicrotasks();
    assertEqual(requests, 1,
      'settled duplicate paired notification remains idempotent');
    harness.pairingObserver('configured');
    harness.pairingObserver('paired');
    await flushMicrotasks();
    assertEqual(requests, 2,
      'a genuine authenticated reconnect issues exactly one fresh request');
  }

  {
    const clients = { cursor: { id: 'cursor' } };
    let cacheReads = 0;
    let liveRefreshes = 0;
    const handler = buildMcpClientsRuntimeHarness({
      readCachedImpl: async () => {
        cacheReads++;
        return { clients, refreshOutcome: 'stale', compatibilityExpiresAt: null };
      },
      refreshImpl: async () => {
        liveRefreshes++;
        return { clients, refreshOutcome: 'refreshed', compatibilityExpiresAt: null };
      }
    });
    const response = await new Promise((resolve) => {
      const keepOpen = handler(
        { action: 'getMcpClients' },
        { id: 'mcp-clients-runtime-extension' },
        resolve
      );
      assertEqual(keepOpen, true, 'cache-only inventory keeps its runtime channel open');
    });
    assertDeepEqual(response, {
      success: true,
      clients,
      refreshOutcome: 'stale',
      compatibilityExpiresAt: null
    },
      'getMcpClients returns cache-only rows plus one closed refresh outcome');
    assertEqual(cacheReads, 1, 'getMcpClients invokes the cache-only reader once');
    assertEqual(liveRefreshes, 0, 'getMcpClients cannot invoke live compatibility refresh');

    let refreshResponse = null;
    const refreshKeepOpen = handler(
      { action: 'refreshMcpCompatibility' },
      { id: 'mcp-clients-runtime-extension' },
      (value) => { refreshResponse = value; }
    );
    assertEqual(refreshKeepOpen, true,
      'explicit compatibility refresh keeps its runtime channel open');
    await flushMicrotasks();
    assertDeepEqual(refreshResponse, {
      success: true,
      clients,
      refreshOutcome: 'refreshed',
      compatibilityExpiresAt: null
    },
      'explicit compatibility action returns the live refresh projection');
    assertEqual(cacheReads, 1, 'explicit live refresh does not re-enter cache-only route dispatch');
    assertEqual(liveRefreshes, 1, 'explicit compatibility action invokes one live refresh');

    let malformedResponse = null;
    const malformedKeepOpen = handler(
      { action: 'refreshMcpCompatibility', extra: true },
      { id: 'mcp-clients-runtime-extension' },
      (value) => { malformedResponse = value; }
    );
    assertEqual(malformedKeepOpen, false,
      'compatibility refresh rejects non-exact runtime requests synchronously');
    assertDeepEqual(malformedResponse, {
      success: false,
      error: 'mcp_client_inventory_unavailable'
    }, 'compatibility refresh rejects unknown request keys with the bounded error');
    assertEqual(liveRefreshes, 1, 'malformed refresh cannot reach daemon compatibility');
  }
}

async function runAgentRegistryBootstrapFailureCase() {
  console.log('\n--- B2: corrupt registry hydration blocks dependent authority boot ---');

  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const source = extractNamedFunctionSource(
    backgroundSource,
    'async function bootstrapAgentRegistry() {'
  );
  const warnings = [];
  const sandbox = {
    FsbAgentRegistry: {
      AgentRegistry: class AgentRegistry {
        async hydrate() {
          throw new Error('corrupt registry proof');
        }
      }
    },
    fsbAgentRegistryInstance: null,
    rateLimitedWarn(...args) {
      warnings.push(args);
    },
    redactForLog() {
      return { kind: 'error' };
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(`${source}\nthis.__bootstrapAgentRegistry = bootstrapAgentRegistry;`, sandbox);

  let rejected = null;
  try {
    await sandbox.__bootstrapAgentRegistry();
  } catch (error) {
    rejected = error;
  }
  assertEqual(rejected && rejected.message, 'corrupt registry proof',
    'registry hydration rejection propagates to dependent boot');
  assertEqual(warnings.length, 1, 'registry hydration rejection is logged once');

  const missingSandbox = {};
  missingSandbox.globalThis = missingSandbox;
  vm.runInNewContext(
    `${source}\nthis.__bootstrapAgentRegistry = bootstrapAgentRegistry;`,
    missingSandbox,
  );
  rejected = null;
  try {
    await missingSandbox.__bootstrapAgentRegistry();
  } catch (error) {
    rejected = error;
  }
  assertEqual(rejected && rejected.message, 'agent registry dependency is unavailable',
    'a missing registry module rejects instead of silently booting empty');
}

async function runDelegationBootQuarantineCase() {
  console.log('\n--- B3: registry authority quarantines on ledger/mapping disagreement ---');

  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const source = extractDelegationCompositionSource(backgroundSource);
  const cases = [
    ['delegation_binding_rejected', 'persisted tab authority has no registry mapping'],
    ['delegation_ledger_corrupt', 'persisted delegation ledger is corrupt'],
  ];
  for (const [code, message] of cases) {
    const calls = [];
    let inboundAuthorityReady = true;
    let delegationAuthorityReady = true;
    const hydrateError = new Error(message);
    hydrateError.code = code;
    const controller = {
      async hydrate() { throw hydrateError; },
      subscribe() { calls.push('subscribe'); },
    };
    const registry = {
      getAgentForDelegation() { return null; },
      listDelegationMappings() { return []; },
      getDelegationReleaseReceipt() { return null; },
      quarantineAuthority() { calls.push('quarantine'); },
    };
    const sandbox = {
      bootstrapAgentRegistry: async () => {},
      FsbDelegationController: { create() { calls.push('create'); return controller; } },
      FsbDelegationEventStore: {},
      fsbAgentRegistryInstance: registry,
      mcpBridgeClient: {
        setInboundAuthorityReady(value) {
          const next = value === true;
          if (next !== inboundAuthorityReady) calls.push(`authority:${next}`);
          inboundAuthorityReady = next;
          return inboundAuthorityReady;
        },
        isInboundAuthorityReady() { return inboundAuthorityReady; },
        setDelegationAuthorityReady(value) {
          const next = value === true;
          if (next !== delegationAuthorityReady) calls.push(`delegation-authority:${next}`);
          delegationAuthorityReady = next;
          return delegationAuthorityReady;
        },
        isDelegationAuthorityReady() { return delegationAuthorityReady; },
        sendExtRequest() { throw new Error('transport must not run'); },
        addEventObserver() { calls.push('event-observer'); },
        addDelegationConnectionObserver() { calls.push('connection-observer'); },
        retainDelegationHeartbeat() {},
        releaseDelegationHeartbeat() {},
        getDelegationConnectionSnapshot() { return { state: 'disconnected' }; },
      },
      chrome: {
        runtime: { async sendMessage() {} },
        storage: { session: { async get() { return {}; }, async set() {}, async remove() {} } },
        tabs: { async query() { return []; }, async get() { return null; } },
      },
      Map,
      Set,
      Promise,
      Date,
      Number,
      Object,
      Array,
      Error,
      JSON,
      console,
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(
      `${source}\nthis.__bootstrapDelegationController = bootstrapDelegationController;`,
      sandbox,
    );

    let rejected = null;
    try {
      await sandbox.__bootstrapDelegationController();
    } catch (error) {
      rejected = error;
    }
    assertEqual(rejected && rejected.code, code,
      `${code} rejects controller boot without rewriting the evidence class`);
    assertEqual(calls.filter((call) => call === 'create').length, 1,
      `${code} reaches controller hydration before quarantine`);
    assertEqual(calls.filter((call) => call === 'quarantine').length, 1,
      `${code} clears registry maps and staged timers once`);
    assertEqual(inboundAuthorityReady, false,
      `${code} closes inbound authority before returning the boot failure`);
    assertEqual(calls.filter((call) => call === 'authority:false').length, 1,
      `${code} closes inbound authority exactly once`);
    assertEqual(delegationAuthorityReady, false,
      `${code} closes delegation-scoped authority before returning the boot failure`);
    assertEqual(calls.filter((call) => call === 'delegation-authority:false').length, 1,
      `${code} closes delegation-scoped authority exactly once`);
    assert(!calls.includes('subscribe') && !calls.includes('event-observer')
        && !calls.includes('connection-observer'),
      `${code} installs no subscriber or bridge observer`);
  }
}

async function runDelegationBootReadinessCase() {
  console.log('\n--- B4: structural and delegated authority open at their exact boundaries ---');

  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const source = extractDelegationCompositionSource(backgroundSource);
  const hydrateGate = deferred();
  const statusGate = deferred();
  const calls = [];
  let inboundAuthorityReady = false;
  let delegationAuthorityReady = false;
  const snapshot = { delegationId: 'delegation_boot_readiness_6108', terminal: null };
  const controller = {
    hydrate() { calls.push('hydrate'); return hydrateGate.promise; },
    subscribe() { calls.push('subscribe'); },
    async reconcile(input) { calls.push(['reconcile', toPlainObject(input)]); },
    getSnapshot(delegationId) {
      return delegationId === snapshot.delegationId ? snapshot : null;
    },
  };
  const registry = {
    getAgentForDelegation() { return null; },
    listDelegationMappings() { return []; },
    getDelegationReleaseReceipt() { return null; },
    quarantineAuthority() { calls.push('quarantine'); },
  };
  const sandbox = {
    bootstrapAgentRegistry: async () => {},
    armMcpBridge(reason) { calls.push(['arm', reason]); },
    FsbDelegationController: { create() { calls.push('create'); return controller; } },
    FsbDelegationEventStore: {},
    fsbAgentRegistryInstance: registry,
    mcpBridgeClient: {
      isConnected: true,
      setInboundAuthorityReady(value) {
        inboundAuthorityReady = value === true;
        calls.push(['authority', inboundAuthorityReady]);
        return inboundAuthorityReady;
      },
      isInboundAuthorityReady() { return inboundAuthorityReady; },
      setDelegationAuthorityReady(value) {
        delegationAuthorityReady = value === true;
        calls.push(['delegation-authority', delegationAuthorityReady]);
        return delegationAuthorityReady;
      },
      isDelegationAuthorityReady() { return delegationAuthorityReady; },
      sendExtRequest(method, payload) {
        calls.push(['sendExtRequest', method, toPlainObject(payload)]);
        return statusGate.promise;
      },
      addEventObserver() { calls.push('event-observer'); },
      addDelegationConnectionObserver() { calls.push('connection-observer'); },
      retainDelegationHeartbeat() {},
      releaseDelegationHeartbeat() {},
      getDelegationConnectionSnapshot() { return { state: 'connected' }; },
    },
    chrome: {
      runtime: { async sendMessage() {} },
      storage: { session: { async get() { return {}; }, async set() {}, async remove() {} } },
      tabs: { async query() { return []; }, async get() { return null; } },
    },
    setTimeout,
    clearTimeout,
    Map,
    Set,
    Promise,
    Date,
    Number,
    Object,
    Array,
    Error,
    JSON,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    `${source}\nthis.__bootstrapDelegationController = bootstrapDelegationController;`,
    sandbox,
  );

  const boot = sandbox.__bootstrapDelegationController();
  await flushMicrotasks();
  assertEqual(inboundAuthorityReady, false,
    'inbound authority stays closed while controller hydration is pending');
  assertEqual(delegationAuthorityReady, false,
    'delegation-scoped authority stays closed while controller hydration is pending');
  assertEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'sendExtRequest').length, 0,
    'daemon status is not requested before persisted controller hydration');

  hydrateGate.resolve([snapshot]);
  await flushMicrotasks();
  assertEqual(inboundAuthorityReady, true,
    'persisted hydration opens ordinary inbound traffic before daemon status settles');
  assertEqual(delegationAuthorityReady, false,
    'delegation-scoped authority stays closed while daemon status reconciliation is pending');
  assertEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'sendExtRequest').length, 1,
    'one shared daemon status request follows successful hydration');
  assertEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'reconcile').length, 0,
    'controller reconcile waits for the authoritative status response');

  statusGate.resolve({ generation: 'generation_boot_readiness_6108', active: [], restartLosses: [], routeLosses: [] });
  await boot;
  assertEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'reconcile').length, 1,
    'hydrated snapshot reconciles exactly once against daemon status');
  assertEqual(inboundAuthorityReady, true,
    'ordinary inbound authority remains open after daemon state agrees');
  assertEqual(delegationAuthorityReady, true,
    'delegation-scoped authority opens only after persisted and daemon state agree');
  assertEqual(calls.filter((call) => Array.isArray(call)
      && call[0] === 'arm' && call[1] === 'delegation-authority-ready').length, 1,
    'successful boot records one authority-ready wake');
  assert(!calls.includes('quarantine'), 'successful combined hydration keeps registry authority live');
}

async function runIndependentDelegationWakeBootstrapCase() {
  console.log('\n--- B5: delegation wake boot is independent from legacy session recovery ---');

  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const source = extractNamedFunctionSource(
    backgroundSource,
    'function restoreServiceWorkerStateOnWake() {',
  );
  const calls = [];
  let inboundAuthorityReady = false;
  const sandbox = {
    async restoreSessionsFromStorage() {
      calls.push('sessions');
      throw new Error('malformed legacy session');
    },
    async bootstrapDelegationController() {
      calls.push('delegation');
      inboundAuthorityReady = true;
      return { controller: {} };
    },
    Promise,
    console: { warn(message) { calls.push(['warn', message]); } },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    `${source}\nthis.__restoreServiceWorkerStateOnWake = restoreServiceWorkerStateOnWake;`,
    sandbox,
  );

  await sandbox.__restoreServiceWorkerStateOnWake();
  assertEqual(calls.filter((call) => call === 'sessions').length, 1,
    'legacy session recovery is attempted once');
  assertEqual(calls.filter((call) => call === 'delegation').length, 1,
    'delegation hydration is attempted even when legacy session recovery rejects');
  assertEqual(inboundAuthorityReady, true,
    'successful independent delegation boot can open inbound authority after a session failure');
  assertEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'warn').length, 1,
    'the unrelated session failure remains contained to its own wake chain');
}

async function runDelegationLateConnectFenceCase() {
  console.log('\n--- B6: active delegation stays fenced across offline boot and reconnect ---');

  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const source = extractDelegationCompositionSource(backgroundSource);
  const calls = [];
  const snapshot = { delegationId: 'delegation_late_connect_6108', terminal: null };
  let statusGate = deferred();
  let connectionState = 'disconnected';
  let connectionObserver = null;
  let inboundAuthorityReady = false;
  let delegationAuthorityReady = false;
  const controller = {
    async hydrate() { calls.push('hydrate'); return [snapshot]; },
    subscribe() { calls.push('subscribe'); },
    async reconcile(input) {
      calls.push(['reconcile', toPlainObject(input)]);
      return snapshot;
    },
    getSnapshot(delegationId) {
      return delegationId === snapshot.delegationId ? snapshot : null;
    },
  };
  const registry = {
    getAgentForDelegation() { return 'agent_late_connect_6108'; },
    listDelegationMappings() {
      return [{ delegationId: snapshot.delegationId, agentId: 'agent_late_connect_6108' }];
    },
    getDelegationReleaseReceipt() { return null; },
    quarantineAuthority() { calls.push('quarantine'); },
  };
  const mcpBridgeClient = {
    isConnected: false,
    setInboundAuthorityReady(value) {
      inboundAuthorityReady = value === true;
      calls.push(['inbound-authority', inboundAuthorityReady]);
      return inboundAuthorityReady;
    },
    isInboundAuthorityReady() { return inboundAuthorityReady; },
    setDelegationAuthorityReady(value) {
      delegationAuthorityReady = value === true;
      calls.push(['delegation-authority', delegationAuthorityReady]);
      return delegationAuthorityReady;
    },
    isDelegationAuthorityReady() { return delegationAuthorityReady; },
    sendExtRequest(method, payload) {
      calls.push(['sendExtRequest', method, toPlainObject(payload)]);
      return statusGate.promise;
    },
    addEventObserver() { calls.push('event-observer'); },
    addDelegationConnectionObserver(observer) {
      connectionObserver = observer;
      calls.push('connection-observer');
    },
    retainDelegationHeartbeat() {},
    releaseDelegationHeartbeat() {},
    getDelegationConnectionSnapshot() { return { state: connectionState }; },
  };
  const sandbox = {
    bootstrapAgentRegistry: async () => {},
    armMcpBridge(reason) { calls.push(['arm', reason]); },
    FsbDelegationController: { create() { calls.push('create'); return controller; } },
    FsbDelegationEventStore: {},
    fsbAgentRegistryInstance: registry,
    mcpBridgeClient,
    chrome: {
      runtime: { async sendMessage() {} },
      storage: { session: { async get() { return {}; }, async set() {}, async remove() {} } },
      tabs: { async query() { return []; }, async get() { return null; } },
    },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    Map,
    Set,
    Promise,
    Date,
    Number,
    Object,
    Array,
    Error,
    JSON,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    `${source}\nthis.__bootstrapDelegationController = bootstrapDelegationController;`,
    sandbox,
  );

  await sandbox.__bootstrapDelegationController();
  assertEqual(inboundAuthorityReady, true,
    'offline boot opens ordinary inbound traffic after persisted hydration');
  assertEqual(delegationAuthorityReady, false,
    'offline boot with an active delegation keeps delegated sends fenced');
  assertEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'sendExtRequest').length, 0,
    'offline boot cannot fabricate an authoritative daemon status response');
  assertEqual(typeof connectionObserver, 'function',
    'successful persisted hydration installs the reconnect observer');

  connectionState = 'connected';
  mcpBridgeClient.isConnected = true;
  const firstReconnect = connectionObserver({ state: 'connected' });
  await flushMicrotasks();
  assertEqual(inboundAuthorityReady, true,
    'late connect preserves ordinary inbound traffic while status is pending');
  assertEqual(delegationAuthorityReady, false,
    'late connect keeps delegated sends fenced while status is pending');
  statusGate.resolve({
    generation: 'generation_late_connect_6108',
    active: [{ delegationId: snapshot.delegationId, state: 'running' }],
    restartLosses: [],
    routeLosses: [],
  });
  await firstReconnect;
  assertEqual(inboundAuthorityReady, true,
    'canonical late-connect status opens structural inbound authority');
  assertEqual(delegationAuthorityReady, true,
    'canonical late-connect status opens delegated sends');

  connectionState = 'disconnected';
  mcpBridgeClient.isConnected = false;
  await connectionObserver({ state: 'disconnected' });
  assertEqual(inboundAuthorityReady, true,
    'runtime delegation disconnect preserves unrelated MCP compatibility');
  assertEqual(delegationAuthorityReady, false,
    'runtime delegation disconnect synchronously fences mapped agents');

  statusGate = deferred();
  connectionState = 'connected';
  mcpBridgeClient.isConnected = true;
  const secondReconnect = connectionObserver({ state: 'connected' });
  await flushMicrotasks();
  assertEqual(inboundAuthorityReady, true,
    'runtime reconnect leaves ordinary inbound traffic available');
  assertEqual(delegationAuthorityReady, false,
    'runtime reconnect keeps mapped agents fenced until fresh status arrives');
  statusGate.resolve({
    generation: 'generation_late_connect_6108',
    active: [{ delegationId: snapshot.delegationId, state: 'running' }],
    restartLosses: [],
    routeLosses: [],
  });
  await secondReconnect;
  assertEqual(delegationAuthorityReady, true,
    'fresh canonical reconnect status reopens mapped-agent dispatch');

  connectionState = 'disconnected';
  mcpBridgeClient.isConnected = false;
  await connectionObserver({ state: 'disconnected' });
  statusGate = deferred();
  connectionState = 'connected';
  mcpBridgeClient.isConnected = true;
  const malformedReconnect = connectionObserver({ state: 'connected' });
  await flushMicrotasks();
  statusGate.resolve({
    generation: 'generation_late_connect_6108',
    active: [{ delegationId: snapshot.delegationId, state: 'running' }],
    restartLosses: [],
    routeLosses: [],
    providerDiagnostic: 'must-not-authorize',
  });
  await malformedReconnect;
  assertEqual(inboundAuthorityReady, true,
    'malformed daemon status cannot disrupt unrelated MCP compatibility');
  assertEqual(delegationAuthorityReady, false,
    'malformed daemon status cannot reopen mapped-agent dispatch');
}

function buildPairingRuntimeHarness(reloadImpl) {
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const startMarker = 'const fsbHandleRuntimeMessage = (request, sender, sendResponse) => {';
  const endMarker = '\nchrome.runtime.onMessage.addListener(fsbHandleRuntimeMessage);';
  const start = backgroundSource.indexOf(startMarker);
  const end = backgroundSource.indexOf(endMarker, start);
  if (start < 0 || end <= start) throw new Error('runtime handler extraction markers missing');
  const handlerSource = backgroundSource.slice(start, end);
  const calls = [];
  const context = {
    chrome: { runtime: { id: 'pairing-runtime-extension' } },
    armMcpBridge() {},
    fsbHandleDelegationCommand() { return null; },
    automationLogger: { logComm() {} },
    mcpBridgeClient: {
      reloadPairingAndReconnect() {
        calls.push(true);
        return reloadImpl();
      },
      getState() { return { pairingStatus: 'configured' }; }
    },
    console,
    Promise,
    Object
  };
  context.globalThis = context;
  vm.runInNewContext(`${handlerSource}\nthis.__handler = fsbHandleRuntimeMessage;`, context, {
    filename: 'background.js#reloadMcpBridgePairing'
  });
  return { handler: context.__handler, calls };
}

function dispatchPairingRuntime(harness, request) {
  return new Promise((resolve) => {
    const keepOpen = harness.handler(
      request,
      { id: 'pairing-runtime-extension' },
      resolve
    );
    if (keepOpen !== true && request.action === 'reloadMcpBridgePairing') {
      Promise.resolve().then(() => {});
    }
  });
}

async function runPairingRuntimeActionCases() {
  console.log('\n--- B9: reloadMcpBridgePairing is secret-free ---');

  {
    const harness = buildPairingRuntimeHarness(async () => ({ pairingStatus: 'paired' }));
    const response = await dispatchPairingRuntime(harness, { action: 'reloadMcpBridgePairing' });
    assertDeepEqual(response, { success: true, pairingStatus: 'paired' }, 'secret-free reload returns only success and pairingStatus');
    assertEqual(harness.calls.length, 1, 'secret-free reload invokes the bridge client exactly once');
  }

  for (const field of ['pairingCode', 'secret', 'token']) {
    const harness = buildPairingRuntimeHarness(async () => ({ pairingStatus: 'paired' }));
    const response = await dispatchPairingRuntime(harness, {
      action: 'reloadMcpBridgePairing',
      [field]: 'must-not-cross-runtime'
    });
    assertDeepEqual(response, { success: false, errorCode: 'pairing_secret_in_runtime_message' }, `${field}-bearing reload is rejected with a bounded code`);
    assertEqual(harness.calls.length, 0, `${field}-bearing reload rejects before bridge invocation`);
  }

  {
    const error = new Error('private detail');
    error.code = 'bridge_topology_changed';
    const harness = buildPairingRuntimeHarness(async () => { throw error; });
    const response = await dispatchPairingRuntime(harness, { action: 'reloadMcpBridgePairing' });
    assertDeepEqual(response, { success: false, errorCode: 'bridge_topology_changed' }, 'reload failure returns only the stable errorCode');
    assert(!JSON.stringify(response).includes('private detail'), 'reload failure omits private error text');
  }
}

async function runDelegationAuthorityCases() {
  console.log('\n--- B10: delegated runtime authority is exact and fail closed ---');

  {
    const harness = buildDelegationCommandHarness();
    const result = await harness.command({
      type: 'FSB_DELEGATION_PREFLIGHT',
      task: 'Use the browser tools for this task'
    });
    assertDeepEqual(result, {
      ok: true,
      kind: 'agent',
      providerId: 'claude-code',
      providerLabel: 'Claude Code'
    }, 'preflight returns only the pure closed agent disposition');
    assertDeepEqual(harness.calls.map((call) => call[0]), ['getMergedClients'],
      'preflight reads compatibility without consent/controller/transport mutation');
  }

  {
    const harness = buildDelegationCommandHarness({
      providerConfig: { agentProviderId: 'opencode' }
    });
    const result = await harness.command({
      type: 'FSB_DELEGATION_CONSENT',
      task: 'OpenCode-bound consent task'
    });
    assertEqual(result.providerId, 'opencode',
      'consent returns the exact authoritative OpenCode provider');
    assertEqual(result.providerLabel, 'OpenCode',
      'consent returns only the canonical OpenCode label');
    assertDeepEqual(harness.calls.find((call) => call[0] === 'issueChallenge')[1], {
      providerId: 'opencode',
      taskDigest: harness.calls.find((call) => call[0] === 'issueChallenge')[1].taskDigest
    }, 'challenge issuance binds the authoritative OpenCode id and task digest only');
  }

  {
    const harness = buildDelegationCommandHarness({
      providerConfig: { agentProviderId: 'opencode' }
    });
    const result = await harness.command({
      type: 'FSB_DELEGATION_PREFLIGHT',
      task: 'Use OpenCode for this task'
    });
    assertDeepEqual(result, {
      ok: true,
      kind: 'agent',
      providerId: 'opencode',
      providerLabel: 'OpenCode'
    }, 'background preflight authorizes OpenCode from saved settings and compatibility');
  }

  {
    const harness = buildDelegationCommandHarness({
      providerConfig: { agentProviderId: 'opencode' }
    });
    const first = await harness.command({
      type: 'FSB_DELEGATION_CLEAR_TRUST',
      providerId: 'opencode'
    });
    const second = await harness.command({
      type: 'FSB_DELEGATION_CLEAR_TRUST',
      providerId: 'opencode'
    });
    assertDeepEqual(first, { ok: true, providerId: 'opencode', trusted: false },
      'OpenCode clear returns the exact authority-reducing result');
    assertDeepEqual(second, first, 'OpenCode clear remains idempotent');
  }

  {
    const harness = buildDelegationCommandHarness({
      providerConfig: { agentProviderId: 'opencode' }
    });
    const result = await harness.command({
      type: 'FSB_DELEGATION_SET_TRUST',
      challengeId: 'dch_fixture',
      providerId: 'opencode',
      trusted: true
    });
    assertDeepEqual(result, { ok: true, providerId: 'opencode', trusted: true },
      'OpenCode trust grant returns the exact authoritative provider');
    assertDeepEqual(harness.calls.map((call) => call[0]), [
      'getMergedClients', 'writeTrustFromChallenge'
    ], 'selection/preflight recheck precedes provider-local trust mutation');
  }

  {
    const harness = buildDelegationCommandHarness({
      providerConfig: { agentProviderId: 'opencode' }
    });
    const issued = await harness.command({
      type: 'FSB_DELEGATION_CONSENT',
      task: 'Selection changes after challenge issue'
    });
    harness.calls.length = 0;
    harness.setProviderId('claude-code');
    const result = await harness.command({
      type: 'FSB_DELEGATION_SET_TRUST',
      challengeId: issued.challengeId,
      providerId: 'opencode',
      trusted: true
    });
    assertDeepEqual(result, { ok: false, code: 'trust_provider_changed' },
      'saved-provider change fails before challenge trust authority is consumed');
    assertEqual(harness.calls.some((call) => call[0] === 'writeTrustFromChallenge'), false,
      'provider-changed trust grant never reaches the challenge mutation primitive');
  }

  {
    const harness = buildDelegationCommandHarness();
    const result = await harness.command({
      type: 'FSB_DELEGATION_CONSENT',
      task: 'Bound consent task'
    });
    assertEqual(result.ok, true, 'untrusted consent mints a background challenge');
    assertEqual(result.trusted, false, 'untrusted consent remains explicit');
    assertEqual(typeof result.challengeId, 'string', 'consent returns the background challenge id');
    assertDeepEqual(harness.calls.map((call) => call[0]), [
      'getMergedClients', 'getTrusted', 'issueChallenge'
    ],
      'consent reads trust then mints exactly one task-bound challenge');
  }

  {
    const harness = buildDelegationCommandHarness({ trusted: true });
    const result = await harness.command({
      type: 'FSB_DELEGATION_CONSENT',
      task: 'Trusted consent task'
    });
    assertDeepEqual(result, {
      ok: true,
      providerId: 'claude-code',
      providerLabel: 'Claude Code',
      trusted: true,
      challengeId: null,
      expiresAt: null
    }, 'trusted consent discloses no reusable challenge');
    assertDeepEqual(harness.calls.map((call) => call[0]), ['getMergedClients', 'getTrusted'],
      'trusted consent does not mint a caller-visible challenge');
  }

  {
    const harness = buildDelegationCommandHarness();
    const first = await harness.command({
      type: 'FSB_DELEGATION_CLEAR_TRUST',
      providerId: 'claude-code'
    });
    const second = await harness.command({
      type: 'FSB_DELEGATION_CLEAR_TRUST',
      providerId: 'claude-code'
    });
    assertDeepEqual(first, { ok: true, providerId: 'claude-code', trusted: false },
      'canonical clear returns the exact authority-reducing result');
    assertDeepEqual(second, first, 'canonical clear remains idempotent');
    assertDeepEqual(harness.calls.map((call) => call[0]), ['clearTrusted', 'clearTrusted'],
      'clear invokes only provider-local clear authority');
  }

  for (const request of [
    { type: 'FSB_DELEGATION_CLEAR_TRUST', providerId: 'Claude-Code' },
    { type: 'FSB_DELEGATION_CLEAR_TRUST', providerId: 'codex' },
    { type: 'FSB_DELEGATION_CLEAR_TRUST', providerId: 'claude-code', trusted: false }
  ]) {
    const harness = buildDelegationCommandHarness();
    const result = await harness.command(request);
    assertDeepEqual(result, { ok: false, code: 'unsupported_provider' },
      'unknown, case-variant, and extra-key trust clear requests fail closed');
    assertEqual(harness.calls.length, 0, 'rejected trust clear touches no authority primitive');
  }

  for (const request of [
    { type: 'FSB_DELEGATION_SET_TRUST', challengeId: 'dch_fixture', providerId: 'claude-code', trusted: false },
    { type: 'FSB_DELEGATION_SET_TRUST', challengeId: 'dch_fixture', providerId: 'claude-code', trusted: true, task: 'extra' },
    { type: 'FSB_DELEGATION_START', challengeId: null, task: 'forbidden caller boolean', trusted: true },
    { type: 'FSB_DELEGATION_CONSENT', task: 'extra-key consent', consentGranted: true },
    { type: 'FSB_DELEGATION_TAKE_CONTROL', delegationId: 'delegation_fixture', activeTabId: 42 },
    { type: 'FSB_DELEGATION_RESUME', delegationId: 'delegation_fixture', liveTabIds: [42] },
    { type: 'FSB_DELEGATION_STOP', delegationId: 'delegation_fixture', agentId: 'caller-agent' },
    { type: 'FSB_DELEGATION_SNAPSHOT', delegationId: null, adopt: true }
  ]) {
    const harness = buildDelegationCommandHarness();
    const result = await harness.command(request);
    assertEqual(result.ok, false, `${request.type} rejects caller authority or lifecycle extras`);
    assertEqual(harness.calls.length, 0, `${request.type} extra-key rejection occurs before side effects`);
  }

  {
    const harness = buildDelegationCommandHarness({
      clearTrustResult: { ok: false, code: 'trust_storage_error' }
    });
    const result = await harness.command({
      type: 'FSB_DELEGATION_CLEAR_TRUST',
      providerId: 'claude-code'
    });
    assertDeepEqual(result, { ok: false, code: 'trust_storage_failed' },
      'clear storage failure remains a bounded trust failure');
  }
}

// ---------------------------------------------------------------------------
// Part C -- source-contract pins
// ---------------------------------------------------------------------------

function runSourceContractCase() {
  console.log('\n--- C: source-contract pins ---');

  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const backgroundSnippets = [
    'const fsbHandleRuntimeMessage = (request, sender, sendResponse) => {',
    'chrome.runtime.onMessage.addListener(fsbHandleRuntimeMessage);',
    'function fsbDispatchInternalMessage(request) {',
    'globalThis.fsbDispatchInternalMessage = fsbDispatchInternalMessage;'
  ];
  for (const snippet of backgroundSnippets) {
    assert(backgroundSource.includes(snippet), `background.js includes ${snippet}`);
  }
  assertEqual((backgroundSource.match(/case 'getMcpClients'/g) || []).length, 1, 'background.js contains exactly one getMcpClients case');
  assertEqual((backgroundSource.match(/case 'refreshMcpCompatibility'/g) || []).length, 1,
    'background.js contains exactly one explicit compatibility refresh case');
  assert(backgroundSource.includes("error: 'mcp_client_inventory_unavailable'"), 'getMcpClients carries the bounded failure code');
  assert(!/chrome\.runtime\.sendMessage\s*\(\s*\{\s*action\s*:\s*['"]getMcpClients['"]/.test(backgroundSource),
    'background.js never self-sends getMcpClients');
  const compatibilityComposition = extractCompatibilityCompositionSource(backgroundSource);
  const liveCompatibilityRefresh = extractNamedFunctionSource(
    backgroundSource,
    'function fsbRefreshMcpCompatibility() {'
  );
  assertEqual((backgroundSource.match(/let fsbMcpCompatibilityRefreshPromise = null;/g) || []).length, 1,
    'background owns one coalesced compatibility refresh promise');
  assertEqual((backgroundSource.match(/mcpBridgeClient\.addPairingStatusObserver\(/g) || []).length, 1,
    'background installs exactly one paired cold-refresh observer');
  assert(liveCompatibilityRefresh.includes('await providers.replaceCompatibility(validated)')
      && liveCompatibilityRefresh.indexOf('await providers.replaceCompatibility(validated)')
        < liveCompatibilityRefresh.indexOf('await fsbReadMergedMcpClients(providers)'),
    'validated durable compatibility replacement precedes merged fan-out');
  assert(!compatibilityComposition.includes('chrome.runtime.sendMessage'),
    'cold compatibility hydration emits no explicit UI announcement');
  for (const forbidden of [
    'selectedProvider', 'selectedModel', 'apiKey', 'endpoint', 'doctor',
    'nativeMessaging', 'child_process', 'delegate.status'
  ]) {
    assert(!compatibilityComposition.includes(forbidden),
      `compatibility refresh orchestration does not touch ${forbidden}`);
  }
  const sunsetListAgents = backgroundSource.indexOf("//     case 'listAgents':");
  assert(sunsetListAgents >= 0, 'sunset listAgents runtime case remains commented out');
  assert(backgroundSource.indexOf("case 'getMcpClients'") < sunsetListAgents,
    'new inventory action is independent from the later sunset listAgents block');

  const bridgeSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
  assert(bridgeSource.includes('globalThis.fsbDispatchInternalMessage'), 'mcp-bridge-client.js prefers globalThis.fsbDispatchInternalMessage');
  assert(bridgeSource.includes('agent_management_deprecated'), 'mcp-bridge-client.js carries the agent deprecation errorCode');
  assert(bridgeSource.includes("sendExtRequest('adapter.compatibility', {}, { timeout: ADAPTER_COMPATIBILITY_REQUEST_TIMEOUT_MS })"),
    'bridge compatibility wrapper sends only the exact method, payload, and five-second timeout');
  assert(!bridgeSource.includes('fsb-mcp-internal'), 'dead fsb-mcp-internal CustomEvent scaffolding removed');
  assert(backgroundSource.includes("case 'reloadMcpBridgePairing':"), 'background.js includes the secret-free pairing reload action');
  assert(backgroundSource.includes('mcpBridgeClient.reloadPairingAndReconnect()'), 'background.js delegates pairing reload directly to the bridge client');
  assert(!/chrome\.runtime\.sendMessage\s*\(\s*\{\s*action\s*:\s*['"]reloadMcpBridgePairing['"]/.test(backgroundSource),
    'background.js never self-sends the pairing reload action');

  const orderedImports = [
    "importScripts('utils/delegation-providers.js')",
    "importScripts('utils/delegation-preflight.js')",
    "importScripts('utils/delegation-consent.js')",
    "importScripts('utils/delegation-event-store.js')",
    "importScripts('utils/delegation-controller.js')"
  ].map((token) => backgroundSource.indexOf(token));
  assert(orderedImports.every((index) => index >= 0),
    'background loads the provider helper and all delegation modules');
  assert(orderedImports.every((index, position) => position === 0 || orderedImports[position - 1] < index),
    'provider helper and delegation modules load once in dependency order');
  const providerHelperImport = orderedImports[0];
  for (const consumer of [
    "importScripts('utils/mcp-agent-providers.js')",
    "importScripts('utils/delegation-preflight.js')",
    "importScripts('utils/delegation-consent.js')",
    "importScripts('utils/delegation-event-store.js')",
    "importScripts('utils/delegation-controller.js')"
  ]) {
    assert(providerHelperImport < backgroundSource.indexOf(consumer),
      `canonical provider helper loads before ${consumer}`);
  }
  const nativeWakeImport = "importScripts('utils/native-host-wake.js')";
  const nativeWakeImportIndex = backgroundSource.indexOf(nativeWakeImport);
  const bridgeImportIndex = backgroundSource.indexOf("importScripts('ws/mcp-bridge-client.js')");
  const nativeProbeIndex = backgroundSource.indexOf('FsbNativeHostWake.probePresence()');
  assertEqual((backgroundSource.match(/importScripts\('utils\/native-host-wake\.js'\)/g) || []).length, 1,
    'background loads the native wake helper exactly once');
  assert(nativeWakeImportIndex > orderedImports[0] && nativeWakeImportIndex < bridgeImportIndex,
    'native wake helper loads after pure preflight and before bridge composition');
  assert(nativeProbeIndex > bridgeImportIndex,
    'silent native presence probe starts only after background dependencies exist');
  assertEqual((backgroundSource.match(/FsbNativeHostWake\.probePresence\(\)/g) || []).length, 1,
    'service-worker boot starts exactly one advisory presence probe');
  assertEqual((backgroundSource.match(/FsbNativeHostWake\.ensureWake\(\)/g) || []).length, 1,
    'offline preflight owns the sole actual wake join');
  assert(backgroundSource.includes("type: 'FSB_NATIVE_WAKE_CHECKING'")
      && backgroundSource.includes('attemptId: wakePromise.attemptId')
      && backgroundSource.includes('intentId: intentId'),
    'checking fanout carries only the exact attempt and current intent ids');
  assertEqual((backgroundSource.match(/mcpBridgeClient\.addEventObserver\(/g) || []).length, 1,
    'background installs exactly one awaited delegation bridge observer');
  assertEqual((backgroundSource.match(/mcpBridgeClient\.addDelegationConnectionObserver\(/g) || []).length, 1,
    'background installs exactly one delegation connection observer');
  assert(backgroundSource.indexOf('await controller.hydrate()')
      < backgroundSource.indexOf('controller.subscribe((runtimeEvent)'),
    'controller hydration completes before runtime subscription');
  assert(backgroundSource.indexOf('controller.subscribe((runtimeEvent)')
      < backgroundSource.indexOf('mcpBridgeClient.addEventObserver(fsbObserveDelegationBridgeEvent)'),
    'hydrated subscription precedes the one live bridge observer');

  const delegationComposition = extractDelegationCompositionSource(backgroundSource);
  assertEqual((backgroundSource.match(/let fsbDelegationBootPromise = null;/g) || []).length, 1,
    'background owns one delegation boot promise');
  assert(delegationComposition.includes("const FSB_DELEGATION_GENERATION_PREFIX = 'fsbDelegationGeneration:v1:'"),
    'wake reconciliation stores bounded per-id daemon generation metadata');
  assert(delegationComposition.includes('chrome.storage.session.get([key])')
      && delegationComposition.includes('chrome.storage.session.set({')
      && delegationComposition.includes('chrome.storage.session.remove(fsbDelegationGenerationKey(delegationId))'),
    'daemon generation metadata stays in session storage and clears at terminal');
  assertEqual((delegationComposition.match(/'delegate\.status'/g) || []).length, 1,
    'wake reconciliation has one exact empty-payload delegate.status transport');
  assert(delegationComposition.includes('{},\n    { timeout: FSB_DELEGATION_STATUS_TIMEOUT_MS }'),
    'wake status request remains empty-payload with a bounded transport timeout');
  assertEqual((delegationComposition.match(/retainDelegationHeartbeat\(delegationId\)/g) || []).length, 1,
    'controller receives one id-keyed heartbeat retain callback');
  assertEqual((delegationComposition.match(/releaseDelegationHeartbeat\(delegationId\)/g) || []).length, 1,
    'controller receives one id-keyed heartbeat release callback');
  const nativePreflight = delegationComposition.slice(
    delegationComposition.indexOf('async function fsbDelegationPreflightCommand(request) {'),
    delegationComposition.indexOf('async function fsbDelegationConsentCommand(request) {')
  );
  assert(nativePreflight.includes("authority.result.code !== 'agent_offline'")
      && nativePreflight.includes('await fsbDelegationPreflightResult()'),
    'only exact offline authority may wake and successful reachability reruns pure preflight directly');
  assert(nativePreflight.includes("armMcpBridge('native-host-wake')")
      && nativePreflight.includes('FSB_NATIVE_WAKE_BRIDGE_TIMEOUT_MS')
      && nativePreflight.includes('FSB_NATIVE_WAKE_BRIDGE_POLL_MS'),
    'native continuation uses one bounded ordinary bridge readiness wait');
  assert(!/(?:delegate\.start|FSB_DELEGATION_START|consumeChallenge|issueChallenge|activeSessions|chrome\.tabs)/.test(nativePreflight),
    'native preflight continuation cannot replay, consent, create sessions, or touch tabs');

  const bootSource = delegationComposition.slice(
    delegationComposition.indexOf('async function bootstrapDelegationController() {')
  );
  const bootHydrate = bootSource.indexOf('const hydratedSnapshots = await controller.hydrate()');
  const bootSubscribe = bootSource.indexOf('controller.subscribe((runtimeEvent)');
  const bootObserver = bootSource.indexOf('mcpBridgeClient.addEventObserver(fsbObserveDelegationBridgeEvent)');
  const bootReconcile = bootSource.indexOf('await fsbReconcileDelegationSnapshots(controller, hydratedSnapshots)');
  assert(bootHydrate >= 0 && bootHydrate < bootSubscribe
      && bootSubscribe < bootObserver && bootObserver < bootReconcile,
    'boot hydrates silently before subscription, observer install, and status reconcile');
  const reconcileSource = delegationComposition.slice(
    delegationComposition.indexOf('async function fsbReconcileDelegationSnapshots(controller, snapshots) {'),
    delegationComposition.indexOf('async function fsbReadAuthoritativeProviderConfig()')
  );
  assert(delegationComposition.includes("armMcpBridge('delegation-reconcile')")
      && reconcileSource.includes('await fsbReadDelegationStatus()'),
    'wake reconciliation uses the ordinary bridge and one shared status snapshot');
  assert(reconcileSource.includes('for (const snapshot of snapshots)')
      && reconcileSource.includes('delegationId: snapshot.delegationId'),
    'one status response reconciles every hydrated server id independently');
  const connectionObserverSource = delegationComposition.slice(
    delegationComposition.indexOf('function fsbObserveDelegationConnection(connection) {'),
    delegationComposition.indexOf('async function bootstrapDelegationController() {')
  );
  assert(connectionObserverSource.includes("connection: 'disconnected'")
      && connectionObserverSource.includes('for (const snapshot of snapshots)')
      && connectionObserverSource.includes('fsbDelegationActiveIds'),
    'heartbeat disconnect reconciles and fans out every active controller record');
  assert(!/(?:delegate\.start|task\s*:|\badopt\b|\breplay\b)/.test(reconcileSource),
    'wake reconciliation cannot start, adopt, or replay delegated work');
  const snapshotCommand = delegationComposition.slice(
    delegationComposition.indexOf('async function fsbDelegationSnapshotCommand(request) {'),
    delegationComposition.indexOf('async function fsbDelegationLifecycleCommand(request, method)')
  );
  assert(snapshotCommand.indexOf('await bootstrapDelegationController()')
      < snapshotCommand.indexOf('boot.controller.getSnapshot(request.delegationId)'),
    'snapshot responses wait for the shared hydrated boot promise');
  assert(snapshotCommand.includes('await fsbReconcileDelegationSnapshots(boot.controller, [before])'),
    'id-keyed snapshot refresh observes supervisor status before replying');
  assert(snapshotCommand.includes('await boot.controller.refreshActiveTab({ delegationId: request.delegationId })'),
    'snapshot replies derive active-tab eligibility inside the controller before replying');
  const lifecycleCommand = delegationComposition.slice(
    delegationComposition.indexOf('async function fsbDelegationLifecycleCommand(request, operation) {'),
    delegationComposition.indexOf('async function fsbDelegationSnapshotCommand(request) {')
  );
  assert(lifecycleCommand.includes('await controller.refreshActiveTab({ delegationId: request.delegationId })')
      && lifecycleCommand.includes('const refreshed = controller.getSnapshot(request.delegationId)'),
    'lifecycle replies refresh and return canonical active-tab eligibility after settlement');
  assert(lifecycleCommand.indexOf("fsbDelegationHasExactKeys(request, ['delegationId', 'type'])")
      < lifecycleCommand.indexOf('controller.takeControl'),
    'lifecycle requests reject caller ownership fields before controller mutation');

  for (const type of [
    'FSB_DELEGATION_PREFLIGHT', 'FSB_DELEGATION_CONSENT', 'FSB_DELEGATION_SET_TRUST',
    'FSB_DELEGATION_CLEAR_TRUST', 'FSB_DELEGATION_START', 'FSB_DELEGATION_TAKE_CONTROL',
    'FSB_DELEGATION_RESUME', 'FSB_DELEGATION_STOP', 'FSB_DELEGATION_SNAPSHOT'
  ]) {
    assertEqual((backgroundSource.match(new RegExp(`case '${type}'`, 'g')) || []).length, 1,
      `${type} has one closed background command route`);
  }

  const legacyStart = backgroundSource.slice(
    backgroundSource.indexOf('async function handleStartAutomation(request, sender, sendResponse) {'),
    backgroundSource.indexOf('async function handleStopAutomation', backgroundSource.indexOf('async function handleStartAutomation(request, sender, sendResponse) {'))
  );
  const authorityBranch = legacyStart.indexOf('const authoritativeProvider = await fsbReadAuthoritativeProviderConfig()');
  assert(authorityBranch >= 0, 'legacy start reloads background-authoritative provider config');
  for (const mutation of [
    'chrome.sidePanel.setOptions', 'conversationSessions.has', 'chrome.tabs.get',
    'activeSessions.set', 'runAgentLoop'
  ]) {
    assert(authorityBranch < legacyStart.indexOf(mutation),
      `agent provider branch precedes ${mutation}`);
  }
  const controllerSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'utils', 'delegation-controller.js'),
    'utf8'
  );
  const delegatedStart = backgroundSource.slice(
    backgroundSource.indexOf('async function fsbDelegationStartCommand(request) {'),
    backgroundSource.indexOf('function fsbDelegationMapLifecycleFailure', backgroundSource.indexOf('async function fsbDelegationStartCommand(request) {'))
  );
  assert(!/request\.(?:trusted|consent|consentGranted|agentId)/.test(delegatedStart),
    'delegated start never reads caller trust, consent, or agent identity');
  assert(delegatedStart.indexOf('consumeChallenge') < delegatedStart.indexOf("sendExtRequest(\n      'delegate.start'"),
    'challenge consumption precedes delegate.start transport');
  assert(delegatedStart.indexOf('resolveAccepted(payload.delegationId)')
      < delegatedStart.indexOf('controller.getSnapshot(delegationId)'),
    'server-minted delegation id acceptance precedes returned controller state');
  const startedObserver = delegationComposition.slice(
    delegationComposition.indexOf("if (bridgeEvent.event === 'delegation.started') {"),
    delegationComposition.indexOf("if (bridgeEvent.event !== 'delegation.event') return;")
  );
  assert(startedObserver.includes('await controller.start({')
      && startedObserver.includes('profileVersion: payload.profileVersion'),
    'started observer durably commits the canonical profile row before request acceptance');
  const controllerStart = controllerSource.slice(
    controllerSource.indexOf('function start(input) {'),
    controllerSource.indexOf('function acceptEvent(input) {')
  );
  assert(controllerStart.indexOf('await eventStore.appendBeforeFanout(')
      < controllerStart.indexOf('var runtimeEvent = _emit(record, canonicalEntry.sequence)'),
    'controller start write completes before live fanout');
  assert(delegationComposition.includes("value === 'ext_request_timeout' || value === 'bridge_topology_changed'")
      && delegationComposition.includes("return 'route_lost'")
      && delegationComposition.includes("treeSettled: !transportError && code !== 'tree_unsettled'"),
    'transport timeout/topology loss requires exact cancellation before ownership release');

  const clearTrust = backgroundSource.slice(
    backgroundSource.indexOf('async function fsbDelegationClearTrustCommand(request) {'),
    backgroundSource.indexOf('function fsbDelegationTerminalCode', backgroundSource.indexOf('async function fsbDelegationClearTrustCommand(request) {'))
  );
  assert(clearTrust.includes('FsbDelegationConsent.clearTrusted'),
    'clear trust delegates only to the authority-reducing primitive');
  assert(!/(?:issueChallenge|consumeChallenge|controller|delegate\.start)/.test(clearTrust),
    'clear trust cannot consume consent, touch a controller, or start a run');

  const registrySource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'utils', 'agent-registry.js'),
    'utf8'
  );
  assert(!/(?:input|request)\.(?:activeTabId|liveTabIds)/.test(controllerSource),
    'controller never consumes caller-supplied active or live tab ids');
  assert(controllerSource.indexOf('await getActiveTab({ delegationId: record.delegationId })')
      < controllerSource.indexOf('await registry.getDelegationOwnedTabs({'),
    'controller queries the active tab before the complete ownership snapshot');
  assert(controllerSource.indexOf('await getLiveTabIds({')
      < controllerSource.indexOf('await registry.restoreHoldLease({'),
    'controller queries sealed tab identities before complete lease restoration');
  const hydrateSource = controllerSource.slice(
    controllerSource.indexOf('function hydrate() {'),
    controllerSource.indexOf('function subscribe(listener) {')
  );
  assert(hydrateSource.includes('eventStore.hydrateNonterminal()')
      && hydrateSource.includes('await _retainHeartbeatOnce(record)')
      && !hydrateSource.includes('_emit('),
    'controller hydration is silent and retains one owner for each nonterminal ledger');
  const controllerReconcile = controllerSource.slice(
    controllerSource.indexOf('function reconcile(input) {'),
    controllerSource.indexOf('function bindRegisteredAgent(input) {')
  );
  assert(controllerReconcile.includes('priorGeneration && priorGeneration !== status.generation')
      && controllerReconcile.includes('if (restartLoss && !active)')
      && controllerReconcile.includes("_settle(record, 'daemon_restart_lost_run', { cancel: false })"),
    'restart loss requires prior generation change and matching explicit disposition');
  assert(controllerSource.includes("_hasExactKeys(value, ['active', 'generation', 'restartLosses', 'routeLosses'])")
      && controllerReconcile.includes('priorGeneration === status.generation && routeLoss')
      && controllerReconcile.includes("_settle(record, 'route_lost', { cancel: false })"),
    'wake route loss requires exact same-generation daemon evidence and never re-cancels');
  assert(!controllerSource.includes('recoveryDisposition'),
    'controller rejects caller-authored restart disposition shortcuts');
  assert(!/(?:startOperation|delegate\.start|\badopt\b|\breplay\b)/.test(controllerReconcile),
    'same-generation reconcile observes without start, adopt, or replay');
  assert(controllerReconcile.includes("typeof registry.getDelegationHoldLease === 'function'")
      && controllerReconcile.indexOf('registry.getDelegationHoldLease({')
        < controllerReconcile.indexOf("_settle(record, 'resume_ownership_lost', { cancel: true })"),
    'held wake requires the exact sealed lease before continued observation');
  const terminalCommitSource = controllerSource.slice(
    controllerSource.indexOf('async function _commitTerminal(record, code, release, options) {'),
    controllerSource.indexOf('function _settle(record, requestedCode, options) {')
  );
  assert(terminalCommitSource.indexOf('await eventStore.markTerminal(record.delegationId')
      < terminalCommitSource.lastIndexOf('await _releaseHeartbeatOnce(record)')
      && terminalCommitSource.lastIndexOf('await _releaseHeartbeatOnce(record)')
        < terminalCommitSource.lastIndexOf('var runtimeEvent = _emit(record'),
    'terminal ledger commit precedes one heartbeat release and live fanout');
  assert(!/chrome\.tabs\.query\s*\(\s*\{[^}]*\bactive\s*:/s.test(registrySource),
    'registry never queries current active-tab state');
  for (const method of ['sealHoldLease', 'restoreHoldLease', 'releaseDelegation']) {
    assert(!backgroundSource.includes(`.${method}(`),
      `background never mutates registry lifecycle directly through ${method}`);
  }
  for (const method of ['delegate.cancel', 'delegate.hold', 'delegate.resume']) {
    assertEqual((backgroundSource.match(new RegExp(`'${method.replace('.', '\\.')}'`, 'g')) || []).length, 1,
      `${method} transport exists only as an injected controller callback`);
  }

  const nativeWakeSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'utils', 'native-host-wake.js'),
    'utf8'
  );
  const preflightSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'utils', 'delegation-preflight.js'),
    'utf8'
  );
  assertEqual((nativeWakeSource.match(/\.connectNative\(/g) || []).length, 1,
    'background helper owns one silent native presence API edge');
  assertEqual((nativeWakeSource.match(/\.sendNativeMessage\(/g) || []).length, 1,
    'background helper owns one actual native wake API edge');
  assert(!/(?:connectNative|sendNativeMessage|io\.github\.fullselfbrowsing\.fsb_native_host)/.test(bridgeSource),
    'bridge client remains native-free');
  assert(!/(?:connectNative|sendNativeMessage|io\.github\.fullselfbrowsing\.fsb_native_host)/.test(preflightSource),
    'pure preflight utility remains native-free');
}

// ---------------------------------------------------------------------------

async function run() {
  await runPrefersInternalDispatchCase();
  await runSendMessageFallbackCase();
  await runListCredentialsSecretStripCase();
  await runAgentActionDeprecationCase();
  await runDriftSettlementCases();
  await runWrapperBehaviorCases();
  await runCompatibilityRefreshCases();
  await runAgentRegistryBootstrapFailureCase();
  await runDelegationBootQuarantineCase();
  await runDelegationBootReadinessCase();
  await runIndependentDelegationWakeBootstrapCase();
  await runDelegationLateConnectFenceCase();
  await runPairingRuntimeActionCases();
  await runDelegationAuthorityCases();
  runSourceContractCase();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
