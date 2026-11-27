'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('path');
const { pathToFileURL } = require('url');
const vm = require('node:vm');
const smoke = require('./mcp-smoke-harness');

const repoRoot = path.resolve(__dirname, '..');
const WebSocket = require(path.join(repoRoot, 'mcp', 'node_modules', 'ws'));

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

async function assertRejectsAsync(operation, msg) {
  let error = null;
  try {
    await operation();
  } catch (caught) {
    error = caught;
  }
  assert(error, msg);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error('Unable to allocate free port'));
      });
    });
    server.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, label, timeoutMs = 1000, intervalMs = 10) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (predicate()) return true;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`${label} did not become true within ${timeoutMs}ms${lastError ? ` (${lastError.message})` : ''}`);
}

function createExtensionSocket(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { Origin: 'chrome-extension://legacy-test-extension' }
    });
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`extension socket did not open on ${port}`));
    }, 500);

    socket.once('open', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function createOriginlessSocket(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`origin-less socket did not open on ${port}`));
    }, 500);
    socket.once('open', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function attemptRelayWithOrigin(port, origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { Origin: origin }
    });
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`relay attempt from ${origin} was not closed`));
    }, 500);

    socket.once('open', () => {
      socket.send(JSON.stringify({ type: 'relay:hello', instanceId: 'browser-relay' }));
    });
    socket.once('close', (code, reason) => {
      settle({ code, reason: reason.toString() });
    });
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      if (response.statusCode === 403) {
        settle({ code: 1008, reason: 'Forbidden origin' });
      } else {
        reject(new Error(`unexpected HTTP status ${response.statusCode}`));
      }
    });
    socket.once('error', (error) => {
      if (!settled) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  });
}

function createBrowserSocket(port, options = {}) {
  return new Promise((resolve, reject) => {
    const protocols = options.pairingCode
      ? ['fsb-ext-v1', options.pairingCode]
      : options.stableProtocol
        ? ['fsb-ext-v1']
        : undefined;
    const socketOptions = {
      headers: options.origin ? { Origin: options.origin } : undefined,
      // false stands in for a peer that has stopped answering protocol pings.
      ...(options.autoPong === undefined ? {} : { autoPong: options.autoPong }),
    };
    const socket = protocols
      ? new WebSocket(`ws://127.0.0.1:${port}`, protocols, socketOptions)
      : new WebSocket(`ws://127.0.0.1:${port}`, socketOptions);
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error(`browser socket did not open on ${port}`));
    }, 1000);
    socket.once('open', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function collectSocketMessages(socket) {
  const messages = [];
  socket.on('message', (data) => {
    messages.push(JSON.parse(data.toString()));
  });
  return messages;
}

function waitForSocketClose(socket, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('socket did not close')), timeoutMs);
    socket.once('close', (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
  });
}

function rawUpgrade(port, headerLines) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let response = '';
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('raw upgrade did not receive a response'));
    }, 1000);
    socket.once('connect', () => {
      const headers = [
        'GET / HTTP/1.1',
        ...headerLines,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ];
      socket.write(headers.join('\r\n'));
    });
    socket.on('data', (chunk) => {
      response += chunk.toString();
      if (response.includes('\r\n\r\n')) socket.end();
    });
    socket.on('end', () => {
      clearTimeout(timeout);
      resolve(response);
    });
    socket.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function withTempHome(label, callback) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `fsb-${label}-`));
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  try {
    return await callback(home);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function instrumentUpgradeRegistration(bridge) {
  const original = bridge._handleNewConnection.bind(bridge);
  const counter = { registrations: 0 };
  bridge._handleNewConnection = (socket) => {
    counter.registrations++;
    return original(socket);
  };
  return counter;
}

// Most cases here model the extension as a bare socket that never says which
// install it is. The hub gives a socket 4s to say so before it attaches it as
// an older build, so here such sockets are attached at once, as every socket
// was before the hub kept one browser per install. The cases that are about
// identification pass their own extensionIdentifyTimeoutMs.
async function loadBridgeClass() {
  const bridgeUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'bridge.js')).href;
  const module = await import(bridgeUrl);
  return class TopologyBridge extends module.WebSocketBridge {
    constructor(options = {}) {
      super({ extensionIdentifyTimeoutMs: 0, ...options });
    }
  };
}

async function loadAuthModule() {
  const authUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'bridge-auth.js')).href;
  return import(authUrl);
}

async function loadServeDelegationModule() {
  const lifecycleUrl = pathToFileURL(
    path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'serve-delegation.js'),
  ).href;
  return import(lifecycleUrl);
}

function makeLifecycleFakes(overrides = {}) {
  const order = [];
  const signals = new Map();
  const exits = [];
  const state = {
    bridgeOptions: null,
    connectCalls: 0,
    inventoryCalls: 0,
    supervisorCloseCalls: 0,
    httpCloseCalls: 0,
    disconnectCalls: 0,
    handlerCalls: 0,
    compatibilityRegistryCalls: 0,
    compatibilityDetectCalls: 0,
    connectionTestCalls: [],
    authStatusCalls: 0,
    authBeginCalls: 0,
    authLogoutCalls: 0,
    authBeginSignal: null,
    prepareCalls: 0,
    readyCalls: 0,
    serveReady: false,
    onDegraded: null,
  };
  const grokBuildRuntime = Object.freeze({ kind: 'grok-runtime-fixture' });
  const grokBuildAuthCoordinator = {
    async recover() {},
    async status() {
      state.authStatusCalls++;
      return Object.freeze({ state: 'unauthenticated' });
    },
    async begin(emit, signal) {
      state.authBeginCalls++;
      state.authBeginSignal = signal ?? null;
      emit(Object.freeze({ state: 'opening_browser' }));
      emit(Object.freeze({ state: 'waiting' }));
      emit(Object.freeze({ state: 'waiting', url: 'https://auth.x.ai/device?code=SAFE' }));
      emit(Object.freeze({ state: 'authenticated' }));
      return Object.freeze({ state: 'oauth', reason: 'none' });
    },
    async logout() {
      state.authLogoutCalls++;
      if (overrides.authLogoutError) throw overrides.authLogoutError;
      if (overrides.authLogoutLocked) {
        return Object.freeze({ state: 'unknown', locked: true });
      }
      return Object.freeze({ state: 'unauthenticated' });
    },
    async acquireTask() { return Object.freeze({ release() {} }); },
    async recordSession() {},
    async deleteSession() {},
  };
  const bridge = {
    currentMode: 'hub',
    topology: {
      mode: 'hub',
      activeHubInstanceId: 'serve-lifecycle-hub',
      extensionConnected: false,
      relayCount: 0,
      lastExtensionHeartbeatAt: null,
      lastDisconnectReason: null,
    },
    async connect() {
      state.connectCalls++;
      order.push('bridge.connect');
      if (overrides.connectError) throw overrides.connectError;
    },
    disconnect() {
      state.disconnectCalls++;
      order.push('bridge.disconnect');
    },
  };
  const httpServer = {
    endpoint: 'http://127.0.0.1:6015/mcp',
    healthEndpoint: 'http://127.0.0.1:6015/health',
    markServeReady() {
      state.readyCalls++;
      state.serveReady = true;
      order.push('http.ready');
    },
    async close() {
      state.httpCloseCalls++;
      state.serveReady = false;
      order.push('http.close');
      if (overrides.httpCloseError) throw overrides.httpCloseError;
    },
  };
  const supervisor = {
    async recover() {
      order.push('supervisor.recover');
      if (overrides.recoveryError) throw overrides.recoveryError;
      return {
        confirmedKilled: 0,
        staleCleared: 0,
        ambiguousFailClosed: overrides.spawnAvailable === false ? 1 : 0,
        spawnAvailable: overrides.spawnAvailable !== false,
        profiles: [],
      };
    },
    async close() {
      state.supervisorCloseCalls++;
      order.push('supervisor.close');
      if (overrides.supervisorCloseError) throw overrides.supervisorCloseError;
      return {
        cancelled: 0,
        failed: overrides.supervisorFailed ? 1 : 0,
        alreadySettled: 0,
      };
    },
    journalEntryForChild() {
      return null;
    },
    async handleExtRequest(request, emit) {
      state.handlerCalls++;
      emit({
        id: request.id,
        type: 'ext:event',
        event: 'delegation.started',
        payload: { delegationId: 'delegation_lifecycle_0001' },
      });
      return { delegationId: 'delegation_lifecycle_0001', status: 'completed', terminal: {} };
    },
  };
  const dependencies = {
    createBridge(options) {
      order.push('bridge.construct');
      state.bridgeOptions = options;
      return bridge;
    },
    createQueue() {
      order.push('queue.construct');
      return { kind: 'queue' };
    },
    async startHttp(options) {
      order.push('http.bind');
      state.httpOptions = options;
      if (overrides.httpError) throw overrides.httpError;
      return httpServer;
    },
    createSupervisor(endpoint, onDegraded) {
      order.push(`supervisor.construct:${endpoint}`);
      state.onDegraded = onDegraded;
      return supervisor;
    },
    createGrokBuildRuntime() {
      return grokBuildRuntime;
    },
    createGrokBuildAuthCoordinator(runtime) {
      assert(runtime === grokBuildRuntime, 'serve shares one private Grok runtime with auth');
      return grokBuildAuthCoordinator;
    },
    createCompatibilityRegistry() {
      state.compatibilityRegistryCalls++;
      return {
        ids() {
          return ['claude-code', 'grok-build'];
        },
        require(id) {
          if (!['claude-code', 'grok-build'].includes(id)) {
            throw new Error('unknown adapter');
          }
          return {
            async detect() {
              state.compatibilityDetectCalls++;
              if (overrides.compatibilityDetectionError) {
                throw overrides.compatibilityDetectionError;
              }
              if (id === 'claude-code') {
                return overrides.compatibilityDetection ?? {
                  installed: true,
                  version: '2.1.177',
                  authState: 'unknown',
                  binary: {
                    command: 'claude',
                    realPath: '/private/compatibility-path-canary/claude',
                    argvPrefix: [],
                  },
                  profileVersion: '2.1.177',
                };
              }
              return {
                installed: true,
                version: '1.0.4',
                authState: 'oauth',
                binary: {
                  command: 'grok',
                  realPath: '/private/compatibility-path-canary/grok',
                  argvPrefix: [],
                },
                profileVersion: 'grok-acp-v1',
              };
            },
          };
        },
      };
    },
    now() {
      return 123_456_789;
    },
    async runConnectionTest(input) {
      state.connectionTestCalls.push(input);
      return Object.freeze({ ok: true, providerId: input.providerId });
    },
    async prepareBridgeAuth() {
      state.prepareCalls++;
      order.push('bridge.auth.prepare');
      if (overrides.prepareError) throw overrides.prepareError;
    },
    async pushInventory() {
      state.inventoryCalls++;
      order.push('inventory.push');
      if (overrides.inventoryError) throw overrides.inventoryError;
    },
    registerSignal(signal, handler) {
      signals.set(signal, handler);
    },
    exit(code) {
      exits.push(code);
      order.push(`process.exit:${code}`);
    },
  };
  return { bridge, dependencies, exits, httpServer, order, signals, state, supervisor };
}

async function runServeDelegationLifecycle(lifecycleModule) {
  const success = makeLifecycleFakes();
  const running = await lifecycleModule.startServeDelegation({
    host: '127.0.0.1',
    port: 6015,
    dependencies: success.dependencies,
  });
  assertEqual(
    success.order.slice(0, 9).join(' > '),
    'bridge.construct > queue.construct > http.bind > supervisor.construct:http://127.0.0.1:6015/mcp > supervisor.recover > bridge.auth.prepare > bridge.connect > inventory.push > http.ready',
    'serve binds HTTP, recovers, prepares auth, connects, advertises, then marks readiness',
  );
  assertEqual(
    JSON.stringify(success.state.bridgeOptions.capabilities),
    '["agent-spawn"]',
    'serve bridge has the single closed spawn capability',
  );
  assertEqual(typeof success.state.bridgeOptions.handleExtRequest, 'function', 'serve bridge receives the supervisor handler closure');
  assert(success.state.httpOptions.bridge === success.bridge, 'HTTP receives the same not-yet-connected capable bridge');
  assertEqual(success.state.connectCalls, 1, 'capable bridge connects exactly once after recovery');
  assertEqual(success.state.prepareCalls, 1, 'bridge auth is prepared exactly once after recovery');
  assertEqual(success.state.inventoryCalls, 1, 'inventory advertises exactly once after capable connect');
  assertEqual(success.state.readyCalls, 1, 'serve readiness is marked exactly once after inventory');
  assertEqual(success.state.serveReady, true, 'serve is ready only after the complete startup barrier');

  const routedEvents = [];
  const routed = await success.state.bridgeOptions.handleExtRequest(
    { id: 'lifecycle-route', type: 'ext:request', method: 'delegate.start', payload: { adapterId: 'claude-code', task: 'safe' } },
    (event) => routedEvents.push(event),
  );
  assertEqual(success.state.handlerCalls, 1, 'ready handler closure routes to the recovered supervisor');
  assertEqual(routedEvents[0]?.event, 'delegation.started', 'ready handler preserves the early delegation event');
  assertEqual(routed.status, 'completed', 'ready handler preserves the terminal domain payload');

  const compatibility = await success.state.bridgeOptions.handleExtRequest({
    id: 'compatibility-route',
    type: 'ext:request',
    method: 'adapter.compatibility',
    payload: {},
  }, () => {});
  assertEqual(success.state.handlerCalls, 1, 'compatibility never invokes supervisor process authority');
  assertEqual(success.state.compatibilityRegistryCalls, 1, 'compatibility creates one production-registry view lazily');
  assertEqual(success.state.compatibilityDetectCalls, 2, 'compatibility invokes each registered production detector once');
  assertEqual(
    JSON.stringify(compatibility),
    '{"schemaVersion":2,"checkedAt":123456789,"adapters":[{"adapterId":"claude-code","displayLabel":"Claude Code","status":"supported","reason":"within_tested_range","authState":"unknown"},{"adapterId":"grok-build","displayLabel":"Grok Build","status":"supported","reason":"capability_verified","authState":"oauth"}]}',
    'compatibility returns only the exact bounded browser-safe projection',
  );
  for (const forbidden of [
    'compatibility-path-canary',
    '2.1.177',
    '1.0.4',
    'profileVersion',
    'sessionSecret',
    'sessionId',
    'task',
    'provider',
  ]) {
    assert(!JSON.stringify(compatibility).includes(forbidden), `compatibility response omits ${forbidden}`);
  }

  const invalidCompatibilityPayloads = [
    null,
    [],
    { extra: true },
    Object.create(null),
    Object.create({ inherited: true }),
  ];
  const accessorPayload = {};
  Object.defineProperty(accessorPayload, 'hidden', { enumerable: false, get() { return true; } });
  invalidCompatibilityPayloads.push(accessorPayload);
  for (const payload of invalidCompatibilityPayloads) {
    let error = null;
    try {
      await success.state.bridgeOptions.handleExtRequest({
        id: 'compatibility-invalid',
        type: 'ext:request',
        method: 'adapter.compatibility',
        payload,
      }, () => {});
    } catch (caught) {
      error = caught;
    }
    assert(
      error,
      `compatibility rejects non-empty/non-own/non-plain payload ${Object.prototype.toString.call(payload)}`,
    );
  }
  assertEqual(success.state.handlerCalls, 1, 'invalid compatibility payloads never reach the supervisor');
  assertEqual(success.state.compatibilityDetectCalls, 2, 'invalid compatibility payloads never run detection');

  const connectionAbort = new AbortController();
  const connectionTest = await success.state.bridgeOptions.handleExtRequest({
    id: 'connection-test-route',
    type: 'ext:request',
    method: 'provider.test-connection',
    payload: { providerId: 'claude-code' },
  }, () => {}, { signal: connectionAbort.signal });
  assertEqual(
    JSON.stringify(connectionTest),
    '{"ok":true,"providerId":"claude-code"}',
    'authenticated provider.test-connection returns only the bounded selected-provider result',
  );
  assertEqual(success.state.connectionTestCalls.length, 1,
    'provider.test-connection invokes one connection probe');
  assertEqual(success.state.connectionTestCalls[0].providerId, 'claude-code',
    'provider.test-connection routes only to the exact selected provider');
  assert(success.state.connectionTestCalls[0].signal === connectionAbort.signal,
    'provider.test-connection forwards socket cancellation');
  assertEqual(success.state.compatibilityRegistryCalls, 1,
    'connection tests reuse the one lazily-created production registry');
  assertEqual(success.state.handlerCalls, 1,
    'connection tests never enter delegation supervisor authority');

  const invalidConnectionPayloads = [
    null,
    [],
    {},
    { providerId: 'cursor' },
    { providerId: 'codex' },
    { providerId: 'opencode' },
    { providerId: 'codex', extra: true },
    Object.create(null),
    Object.assign(Object.create({ inherited: true }), { providerId: 'codex' }),
  ];
  const accessorConnectionPayload = {};
  Object.defineProperty(accessorConnectionPayload, 'providerId', {
    enumerable: true,
    get() { return 'codex'; },
  });
  invalidConnectionPayloads.push(accessorConnectionPayload);
  for (const payload of invalidConnectionPayloads) {
    let error = null;
    try {
      await success.state.bridgeOptions.handleExtRequest({
        id: 'connection-test-invalid',
        type: 'ext:request',
        method: 'provider.test-connection',
        payload,
      }, () => {});
    } catch (caught) {
      error = caught;
    }
    assert(error, 'provider.test-connection rejects every non-exact payload');
  }
  assertEqual(success.state.connectionTestCalls.length, 1,
    'invalid provider.test-connection payloads invoke no probe');

  const authStatus = await success.state.bridgeOptions.handleExtRequest({
    id: 'grok-auth-status',
    type: 'ext:request',
    method: 'provider.auth.status',
    payload: { providerId: 'grok-build' },
  }, () => {});
  assertEqual(JSON.stringify(authStatus), '{"state":"unauthenticated"}',
    'Grok auth status exposes only the safe state enum');

  const authAbort = new AbortController();
  const authEvents = [];
  const authBegin = await success.state.bridgeOptions.handleExtRequest({
    id: 'grok-auth-begin',
    type: 'ext:request',
    method: 'provider.auth.begin',
    payload: { providerId: 'grok-build' },
  }, (event) => authEvents.push(event), { signal: authAbort.signal });
  // begin() carries the settled state plus why it settled, because the bridge
  // collapses every ext-handler throw into one opaque code and the panel has to
  // name the refusal -- the same reason logout carries its `locked` marker.
  // The surface stays minimal: two keys, both from closed enums that
  // serve-delegation validates before anything can leave.
  assertEqual(JSON.stringify(authBegin), '{"state":"oauth","reason":"none"}',
    'Grok auth begin returns only the final safe state and its reason');
  assertEqual(Object.keys(authBegin).sort().join(','), 'reason,state',
    'Grok auth begin exposes no field beyond state and reason');
  assertEqual(
    [
      'none',
      'cancelled',
      'login_failed',
      'version_unsupported',
      'sandbox_unavailable',
      'adapter_unavailable',
      'provider_auth_locked',
      'session_cleanup_blocked',
    ].includes(authBegin.reason),
    true,
    'Grok auth begin reason stays inside the closed enum',
  );
  assert(success.state.authBeginSignal === authAbort.signal,
    'Grok auth begin forwards socket cancellation');
  assertEqual(
    JSON.stringify(authEvents),
    '[{"id":"grok-auth-begin","type":"ext:event","event":"provider.auth.progress","payload":{"providerId":"grok-build","state":"opening_browser"}},{"id":"grok-auth-begin","type":"ext:event","event":"provider.auth.progress","payload":{"providerId":"grok-build","state":"waiting"}},{"id":"grok-auth-begin","type":"ext:event","event":"provider.auth.progress","payload":{"providerId":"grok-build","state":"waiting","url":"https://auth.x.ai/device?code=SAFE"}},{"id":"grok-auth-begin","type":"ext:event","event":"provider.auth.progress","payload":{"providerId":"grok-build","state":"authenticated"}}]',
    'Grok auth begin emits the exact bounded progress event surface',
  );

  const authLogout = await success.state.bridgeOptions.handleExtRequest({
    id: 'grok-auth-logout',
    type: 'ext:request',
    method: 'provider.auth.logout',
    payload: { providerId: 'grok-build' },
  }, () => {});
  assertEqual(JSON.stringify(authLogout), '{"state":"unauthenticated"}',
    'Grok auth logout returns only the final unauthenticated state');
  assertEqual(success.state.authStatusCalls, 1, 'Grok auth status invokes its coordinator once');
  assertEqual(success.state.authBeginCalls, 1, 'Grok auth begin invokes its coordinator once');
  assertEqual(success.state.authLogoutCalls, 1, 'Grok auth logout invokes its coordinator once');
  assertEqual(success.state.handlerCalls, 1, 'Grok auth RPCs never enter supervisor task authority');

  for (const method of ['provider.auth.status', 'provider.auth.begin', 'provider.auth.logout']) {
    for (const payload of [
      {},
      { providerId: 'codex' },
      { providerId: 'grok-build', extra: true },
      Object.assign(Object.create({ providerId: 'grok-build' }), {}),
    ]) {
      await assertRejectsAsync(
        () => success.state.bridgeOptions.handleExtRequest({
          id: 'grok-auth-invalid', type: 'ext:request', method, payload,
        }, () => {}),
        'invalid provider auth payload',
      );
    }
  }
  assertEqual(success.state.authStatusCalls, 1, 'invalid auth status payloads invoke no coordinator');
  assertEqual(success.state.authBeginCalls, 1, 'invalid auth begin payloads invoke no coordinator');
  assertEqual(success.state.authLogoutCalls, 1, 'invalid auth logout payloads invoke no coordinator');

  const lockedLogout = makeLifecycleFakes({ authLogoutLocked: true });
  const lockedLogoutRunning = await lifecycleModule.startServeDelegation({
    host: '127.0.0.1',
    port: 6015,
    dependencies: lockedLogout.dependencies,
  });
  const refusedLogout = await lockedLogout.state.bridgeOptions.handleExtRequest({
    id: 'grok-auth-logout-locked',
    type: 'ext:request',
    method: 'provider.auth.logout',
    payload: { providerId: 'grok-build' },
  }, () => {});
  assertEqual(JSON.stringify(refusedLogout), '{"state":"unknown","locked":true}',
    'a locked logout crosses the bridge as data, not as an erased handler throw');
  assertEqual(lockedLogout.state.handlerCalls, 0,
    'a locked logout still grants no supervisor authority');
  await lockedLogoutRunning.shutdown();

  const failedDetection = makeLifecycleFakes({
    compatibilityDetectionError: new Error('PRIVATE_DETECTOR_FAILURE'),
  });
  const failedDetectionRunning = await lifecycleModule.startServeDelegation({
    host: '127.0.0.1',
    port: 6015,
    dependencies: failedDetection.dependencies,
  });
  const unavailableCompatibility = await failedDetection.state.bridgeOptions.handleExtRequest({
    id: 'compatibility-detector-failure',
    type: 'ext:request',
    method: 'adapter.compatibility',
    payload: {},
  }, () => {});
  assertEqual(
    JSON.stringify(unavailableCompatibility),
    '{"schemaVersion":2,"checkedAt":123456789,"adapters":[{"adapterId":"claude-code","displayLabel":"Claude Code","status":"unsupported","reason":"binary_not_found","authState":"unknown"},{"adapterId":"grok-build","displayLabel":"Grok Build","status":"unsupported","reason":"binary_not_found","authState":"unknown"}]}',
    'detector exceptions become deterministic canonical unsupported rows',
  );
  assert(!JSON.stringify(unavailableCompatibility).includes('PRIVATE_DETECTOR_FAILURE'), 'detector exceptions cannot leak through the safe response');
  assertEqual(failedDetection.state.handlerCalls, 0, 'detector failure still grants no supervisor authority');
  await failedDetectionRunning.shutdown();

  const firstShutdown = running.shutdown();
  const secondShutdown = running.shutdown();
  assert(firstShutdown === secondShutdown, 'repeated shutdown calls share one promise');
  success.signals.get('SIGTERM')();
  success.signals.get('SIGINT')();
  const shutdownResult = await firstShutdown;
  assertEqual(shutdownResult.exitCode, 0, 'clean shutdown reports exit code zero');
  assertEqual(
    success.order.slice(-4).join(' > '),
    'supervisor.close > http.close > bridge.disconnect > process.exit:0',
    'shutdown settles trees before HTTP, bridge, and process exit',
  );
  assertEqual(success.state.supervisorCloseCalls, 1, 'repeated signals close the supervisor once');
  assertEqual(success.state.httpCloseCalls, 1, 'repeated signals close HTTP once');
  assertEqual(success.state.serveReady, false, 'shutdown clears the readiness projection');
  assertEqual(success.state.disconnectCalls, 1, 'repeated signals disconnect the bridge once');
  assertEqual(success.exits.length, 1, 'repeated signals request process exit once');

  const unsettled = makeLifecycleFakes({ supervisorFailed: true });
  const unsettledRunning = await lifecycleModule.startServeDelegation({
    host: '127.0.0.1',
    port: 6015,
    dependencies: unsettled.dependencies,
  });
  let shutdownError = null;
  try {
    await unsettledRunning.shutdown();
  } catch (caught) {
    shutdownError = caught;
  }
  assert(shutdownError instanceof lifecycleModule.ServeDelegationShutdownError, 'unsettled tree yields a typed shutdown failure');
  assertEqual(
    unsettled.order.slice(-4).join(' > '),
    'supervisor.close > http.close > bridge.disconnect > process.exit:1',
    'unsettled tree still closes resources in order before nonzero exit',
  );
  assertEqual(unsettled.exits.length, 1, 'unsettled tree requests nonzero process exit exactly once');

  const degraded = makeLifecycleFakes();
  const degradedRunning = await lifecycleModule.startServeDelegation({
    host: '127.0.0.1',
    port: 6015,
    dependencies: degraded.dependencies,
  });
  assertEqual(typeof degraded.state.onDegraded, 'function', 'serve wires the supervisor degradation callback');
  degraded.state.onDegraded('tree_unsettled');
  let degradedError = null;
  try {
    await degradedRunning.shutdown();
  } catch (caught) {
    degradedError = caught;
  }
  assert(degradedError instanceof lifecycleModule.ServeDelegationShutdownError, 'runtime degradation forces typed nonzero shutdown');
  assertEqual(
    degraded.order.slice(-4).join(' > '),
    'supervisor.close > http.close > bridge.disconnect > process.exit:1',
    'runtime degradation withdraws the serve capability through orderly nonzero shutdown',
  );
  assertEqual(degraded.state.disconnectCalls, 1, 'runtime degradation disconnects the capable bridge once');
  assertEqual(degraded.exits.length, 1, 'runtime degradation requests one nonzero process exit');

  for (const [name, overrides, expectedPrefix] of [
    ['HTTP bind', { httpError: new Error('bind') }, 'bridge.construct > queue.construct > http.bind'],
    ['recovery ambiguity', { spawnAvailable: false }, 'bridge.construct > queue.construct > http.bind > supervisor.construct:http://127.0.0.1:6015/mcp > supervisor.recover'],
    ['bridge auth preparation', { prepareError: new Error('auth') }, 'bridge.construct > queue.construct > http.bind > supervisor.construct:http://127.0.0.1:6015/mcp > supervisor.recover > bridge.auth.prepare'],
    ['bridge connect', { connectError: new Error('connect') }, 'bridge.construct > queue.construct > http.bind > supervisor.construct:http://127.0.0.1:6015/mcp > supervisor.recover > bridge.auth.prepare > bridge.connect'],
    ['inventory push', { inventoryError: new Error('inventory') }, 'bridge.construct > queue.construct > http.bind > supervisor.construct:http://127.0.0.1:6015/mcp > supervisor.recover > bridge.auth.prepare > bridge.connect > inventory.push'],
  ]) {
    const failure = makeLifecycleFakes(overrides);
    let error = null;
    try {
      await lifecycleModule.startServeDelegation({
        host: '127.0.0.1',
        port: 6015,
        dependencies: failure.dependencies,
      });
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof lifecycleModule.ServeDelegationStartupError, `${name} failure is a typed startup failure`);
    assertEqual(failure.order.slice(0, expectedPrefix.split(' > ').length).join(' > '), expectedPrefix, `${name} failure preserves startup order`);
    assertEqual(
      failure.state.prepareCalls,
      ['bridge auth preparation', 'bridge connect', 'inventory push'].includes(name) ? 1 : 0,
      ['bridge auth preparation', 'bridge connect', 'inventory push'].includes(name)
        ? `${name} reaches one post-recovery auth preparation`
        : `${name} failure never prepares bridge auth`,
    );
    assertEqual(
      failure.state.connectCalls,
      name === 'bridge connect' || name === 'inventory push' ? 1 : 0,
      name === 'bridge connect' || name === 'inventory push'
        ? `${name} reaches one capable bridge connect attempt`
        : `${name} failure never connects a capable bridge`,
    );
    assertEqual(
      failure.state.inventoryCalls,
      name === 'inventory push' ? 1 : 0,
      name === 'inventory push'
        ? `${name} is attempted exactly once`
        : `${name} failure never advertises inventory`,
    );
    assertEqual(failure.state.readyCalls, 0, `${name} failure never advertises serve readiness`);
    assertEqual(failure.state.serveReady, false, `${name} failure remains false-by-default`);
    assertEqual(failure.exits.length, 0, `${name} startup cleanup never exits the process`);
  }

  const source = fs.readFileSync(path.join(repoRoot, 'mcp', 'src', 'index.ts'), 'utf8');
  const runtimeSource = fs.readFileSync(path.join(repoRoot, 'mcp', 'src', 'runtime.ts'), 'utf8');
  const stdioSource = source.slice(source.indexOf('async function runStdioServer'), source.indexOf('async function runHttpMode'));
  assert(!/SpawnSupervisor|handleExtRequest|agent-spawn|startServeDelegation/.test(stdioSource), 'stdio source contains no supervisor, handler, or spawn capability');
  assert(!/SpawnSupervisor|handleExtRequest|agent-spawn|startServeDelegation/.test(runtimeSource), 'shared MCP runtime contains no supervisor, handler, or spawn capability');
  assertEqual((source.match(/startServeDelegation\(/g) || []).length, 1, 'only serve mode starts the delegation lifecycle');
  const serveModeSource = source.slice(source.indexOf('async function runHttpMode'), source.indexOf('export function runPair'));
  assert(
    /prepareBridgeAuth[\s\S]*rotateBridgeSessionSecret/.test(serveModeSource),
    'serve composes bridge secret rotation solely through the lifecycle auth hook',
  );
  assert(
    !/rotateBridgeSessionSecret\(\);\s*const lifecycle/.test(serveModeSource),
    'serve never rotates bridge auth before lifecycle bind ownership',
  );
}

async function createBridgePair(WebSocketBridge) {
  const port = await getFreePort();
  const sockets = [];
  const bridges = [];

  const hub = new WebSocketBridge({
    port,
    host: '127.0.0.1',
    instanceId: 'test-hub',
    handshakeTimeoutMs: 25,
    promotionJitterMs: 1,
    maxReconnectDelayMs: 100
  });
  const relay = new WebSocketBridge({
    port,
    host: '127.0.0.1',
    instanceId: 'test-relay',
    handshakeTimeoutMs: 25,
    promotionJitterMs: 1,
    maxReconnectDelayMs: 100
  });

  bridges.push(hub, relay);
  await hub.connect();
  await relay.connect();

  return { port, hub, relay, sockets, bridges };
}

async function runRelayCapabilityAdvertisement(WebSocketBridge) {
  const port = await getFreePort();
  const seenHellos = [];
  const hub = new WebSocketBridge({
    port,
    host: '127.0.0.1',
    instanceId: 'capability-hub',
    handshakeTimeoutMs: 25,
  });
  const registerRelay = hub._registerRelayClient.bind(hub);
  hub._registerRelayClient = (socket, hello) => {
    seenHellos.push(hello);
    return registerRelay(socket, hello);
  };
  const defaultRelay = new WebSocketBridge({
    port,
    host: '127.0.0.1',
    instanceId: 'default-relay',
    handshakeTimeoutMs: 25,
  });
  const capableRelay = new WebSocketBridge({
    port,
    host: '127.0.0.1',
    instanceId: 'capable-relay',
    handshakeTimeoutMs: 25,
    capabilities: ['unknown', 'agent-spawn', 'agent-spawn'],
    handleExtRequest: async () => ({ accepted: true }),
  });
  const ignoredRelay = new WebSocketBridge({
    port,
    host: '127.0.0.1',
    instanceId: 'ignored-relay',
    handshakeTimeoutMs: 25,
    capabilities: ['agent-spawn'],
  });
  const resources = { sockets: [], bridges: [hub, defaultRelay, capableRelay, ignoredRelay] };

  try {
    await hub.connect();
    await defaultRelay.connect();
    await capableRelay.connect();
    await ignoredRelay.connect();

    assertEqual(
      JSON.stringify(seenHellos[0]),
      '{"type":"relay:hello","instanceId":"default-relay"}',
      'default relay hello remains byte-identical with no capabilities key',
    );
    assertEqual(
      JSON.stringify(seenHellos[1]),
      '{"type":"relay:hello","instanceId":"capable-relay","capabilities":["agent-spawn"]}',
      'capable relay advertises the one closed capability exactly once',
    );
    assertEqual(
      JSON.stringify(seenHellos[2]),
      '{"type":"relay:hello","instanceId":"ignored-relay"}',
      'capability without a handler is omitted from relay hello',
    );
    assertEqual(hub.relayCapabilities.get('default-relay')?.size, 0, 'default relay snapshots an empty capability set');
    assertEqual(hub.relayCapabilities.get('capable-relay')?.size, 1, 'capable relay snapshots one capability');
    assert(hub.relayCapabilities.get('capable-relay')?.has('agent-spawn'), 'capable relay snapshot contains agent-spawn');
    assertEqual(hub.relayCapabilities.get('ignored-relay')?.size, 0, 'ignored relay cannot enter capable topology state');

    capableRelay.disconnect();
    await waitFor(
      () => !hub.relayCapabilities.has('capable-relay'),
      'capable relay capability cleanup',
      1000,
      10,
    );
    assert(!hub.relayCapabilities.has('capable-relay'), 'relay close removes its capability snapshot');
  } finally {
    await cleanup(resources);
  }
}

async function cleanup(resources) {
  for (const socket of resources.sockets || []) {
    try {
      socket.close();
    } catch (_error) {}
  }
  for (const bridge of [...(resources.bridges || [])].reverse()) {
    try {
      bridge.disconnect();
    } catch (_error) {}
  }
  await sleep(50);
}

async function runCase(name, fn) {
  console.log(`\n--- ${name} ---`);
  try {
    await fn();
  } catch (error) {
    failed++;
    console.error(`  FAIL: ${name}: ${error.message}`);
  }
}

async function runServerFirstTopology(WebSocketBridge) {
  const resources = await createBridgePair(WebSocketBridge);
  try {
    const { hub, relay } = resources;

    assertEqual(hub.currentMode, 'hub', 'first bridge binds as hub');
    assertEqual(relay.currentMode, 'relay', 'second bridge connects as relay');
    assertEqual(hub.topology?.instanceId, 'test-hub', 'hub topology exposes instanceId test-hub');
    assertEqual(relay.topology?.instanceId, 'test-relay', 'relay topology exposes instanceId test-relay');
    assert(hub.topology && hub.topology.extensionConnected === false, 'hub.topology.extensionConnected === false before extension attach');
    assert(relay.topology?.hubConnected === true, 'relay topology reports hubConnected true after relay handshake');
    assert(relay.topology?.activeHubInstanceId === 'test-hub', 'relay topology tracks activeHubInstanceId test-hub');
  } finally {
    await cleanup(resources);
  }
}

async function runRelayWaitsForExtensionReachability(WebSocketBridge) {
  const resources = await createBridgePair(WebSocketBridge);
  try {
    const { relay } = resources;

    assert(relay.topology?.hubConnected === true, 'relay waits with hubConnected true after relay:welcome');
    assert(relay.topology?.extensionConnected === false, 'relay topology extensionConnected === false before extension attach');
    assert(relay.isConnected === false, 'relay.isConnected === false after relay:welcome and before extension attach');
  } finally {
    await cleanup(resources);
  }
}

async function runExtensionStateBroadcastsToRelays(WebSocketBridge) {
  return withTempHome('bridge-extension-state', async () => {
    const resources = await createBridgePair(WebSocketBridge);
    try {
      const { port, hub, relay, sockets } = resources;
      const extensionSocket = await createExtensionSocket(port);
      sockets.push(extensionSocket);

      await sleep(30);
      await waitFor(
        () => hub.topology?.extensionConnected === true && relay.topology?.extensionConnected === true,
        'extensionConnected topology broadcast',
        1000,
        10
      );

      assert(hub.topology?.extensionConnected === true, 'hub topology reports extensionConnected true after extension socket attach');
      assert(relay.topology?.extensionConnected === true, 'relay topology reports extensionConnected true after hub broadcast');
      assert(relay.isConnected === true, 'relay.isConnected becomes true after extension reachability is broadcast');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runRejectsUntrustedBrowserOrigin(WebSocketBridge) {
  const port = await getFreePort();
  const resources = {
    sockets: [],
    bridges: [
      new WebSocketBridge({
        port,
        host: '127.0.0.1',
        instanceId: 'test-hub-origin',
        handshakeTimeoutMs: 25
      })
    ]
  };

  try {
    const hub = resources.bridges[0];
    const counter = instrumentUpgradeRegistration(hub);
    await hub.connect();

    const close = await attemptRelayWithOrigin(port, 'https://evil.example');
    assertEqual(close.code, 1008, 'hub rejects browser-origin relay handshake with policy violation');
    assertEqual(close.reason, 'Forbidden origin', 'hub reports forbidden origin when rejecting browser-origin relay');
    assertEqual(hub.topology?.relayCount, 0, 'rejected browser-origin relay is not registered');
    assertEqual(counter.registrations, 0, 'evil browser Origin is rejected before connection registration');
  } finally {
    await cleanup(resources);
  }
}

/**
 * Safari port: the extension reaches :7225 either directly or through the
 * container app's native socket, and both dial with
 * Origin: safari-web-extension://<UUID>. The hub must classify that as an
 * extension candidate. An Origin-less socket is still only ever a relay, which
 * is why the native transport has to send the Origin explicitly.
 */
async function runAcceptsSafariExtensionOrigin(WebSocketBridge) {
  await withTempHome('bridge-safari-origin', async () => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'test-hub-safari-origin',
      handshakeTimeoutMs: 25,
    });
    const resources = { sockets: [], bridges: [hub] };
    const safariOrigin = 'safari-web-extension://4C6E0A1B-2F3D-4E5A-9B8C-7D6E5F4A3B2C';

    try {
      await hub.connect();

      for (const [label, origin] of [
        ['safari Origin with path', `${safariOrigin}/path`],
        ['safari Origin without host', 'safari-web-extension://'],
      ]) {
        const response = await rawUpgrade(port, [`Host: 127.0.0.1:${port}`, `Origin: ${origin}`]);
        assert(response.startsWith('HTTP/1.1 403'), `${label} receives HTTP 403 before upgrade`);
      }

      const safari = await createBrowserSocket(port, { origin: safariOrigin });
      resources.sockets.push(safari);
      await waitFor(() => hub.topology.extensionConnected, 'safari extension registration', 1000, 10);
      assertEqual(hub.topology.extensionConnected, true, 'hub registers a safari-web-extension:// origin as the extension');
      assertEqual(hub.topology.relayCount, 0, 'safari extension socket is not counted as a relay');

      const originless = await createOriginlessSocket(port);
      resources.sockets.push(originless);
      const close = await waitForSocketClose(originless);
      assertEqual(close.code, 1008, 'origin-less socket without relay:hello is closed, never made the extension');
      assertEqual(hub.topology.extensionConnected, true, 'safari extension survives the origin-less socket');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runRejectsNonLoopbackBind(WebSocketBridge) {
  const rejectedHosts = ['0.0.0.0', '::', '192.168.1.20', 'bridge.local', '', '127.0.0.1:7225'];
  for (const host of rejectedHosts) {
    try {
      new WebSocketBridge({ port: 1, host, instanceId: `bad-${host}` });
      assert(false, `non-loopback bind ${JSON.stringify(host)} throws before port use`);
    } catch (error) {
      assertEqual(error.code, 'BRIDGE_NON_LOOPBACK_BIND', `non-loopback bind ${JSON.stringify(host)} has stable error code`);
      assertEqual(error.message, 'BRIDGE_NON_LOOPBACK_BIND', `non-loopback bind ${JSON.stringify(host)} has stable error message`);
    }
  }
  const defaults = new WebSocketBridge({ port: 1, instanceId: 'default-host-check' });
  assertEqual(defaults.host, '127.0.0.1', 'bridge default bind host is 127.0.0.1');
}

async function runPreHandlerUpgradeGate(WebSocketBridge, auth) {
  await withTempHome('bridge-upgrade-gate', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    const state = auth.rotateBridgeSessionSecret(authPath, 10_000);
    auth.bindAllowedExtensionOrigin('chrome-extension://trusted-extension', authPath);
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'upgrade-gate-hub',
      handshakeTimeoutMs: 25,
    });
    const counter = instrumentUpgradeRegistration(hub);
    const resources = { sockets: [], bridges: [hub] };
    try {
      await hub.connect();
      const fixtures = [
        {
          label: 'hostile HTTPS Origin',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: https://evil.example'],
        },
        {
          label: 'evil Host resolving to loopback',
          headers: [`Host: evil.example:${port}`, 'Origin: chrome-extension://trusted-extension'],
        },
        {
          label: 'wrong Host port',
          headers: [`Host: 127.0.0.1:${port + 1}`, 'Origin: chrome-extension://trusted-extension'],
        },
        {
          label: 'missing Host',
          headers: ['Origin: chrome-extension://trusted-extension'],
        },
        {
          label: 'duplicate Host',
          headers: [`Host: 127.0.0.1:${port}`, `Host: localhost:${port}`, 'Origin: chrome-extension://trusted-extension'],
        },
        {
          label: 'multiple-like Host',
          headers: [`Host: 127.0.0.1:${port},evil.example:${port}`, 'Origin: chrome-extension://trusted-extension'],
        },
        {
          label: 'null Origin',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: null'],
        },
        {
          label: 'malformed extension Origin',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: chrome-extension://'],
        },
        {
          label: 'multiple-like extension Origin',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: chrome-extension://trusted-extension,https://evil.example'],
        },
        {
          label: 'extension Origin with path',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: chrome-extension://trusted-extension/path'],
        },
        {
          label: 'extension Origin with credentials',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: chrome-extension://user@trusted-extension'],
        },
        {
          label: 'extension Origin with query',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: chrome-extension://trusted-extension?pair=1'],
        },
        {
          label: 'wrong persisted extension ID with current token',
          headers: [
            `Host: 127.0.0.1:${port}`,
            'Origin: chrome-extension://wrong-extension',
            `Sec-WebSocket-Protocol: fsb-ext-v1, ${auth.formatPairingCode(state)}`,
          ],
        },
      ];

      for (const fixture of fixtures) {
        const response = await rawUpgrade(port, fixture.headers);
        assert(response.startsWith('HTTP/1.1 403'), `${fixture.label} receives HTTP 403 before upgrade`);
        assertEqual(counter.registrations, 0, `${fixture.label} does not increment registration count`);
        assertEqual(hub.topology.relayCount, 0, `${fixture.label} does not register a relay`);
        assertEqual(hub.topology.extensionConnected, false, `${fixture.label} does not register an extension`);
      }
    } finally {
      await cleanup(resources);
    }
  });
}

async function sendExtRequest(socket, id) {
  const messages = collectSocketMessages(socket);
  socket.send(JSON.stringify({ id, type: 'ext:request', method: 'bridge.test', payload: {} }));
  await waitFor(() => messages.length > 0, `ext response ${id}`, 1000, 10);
  return messages;
}

async function assertUnprivilegedSocket(port, options, label, method = 'bridge.test') {
  const socket = await createBrowserSocket(port, options);
  const messages = collectSocketMessages(socket);
  const closePromise = waitForSocketClose(socket);
  socket.send(JSON.stringify({ id: `request-${label}`, type: 'ext:request', method, payload: {} }));
  const close = await closePromise;
  const unauthorized = messages.filter((message) => message.error?.code === 'ext_unauthorized');
  assertEqual(unauthorized.length, 1, `${label} receives exactly one generic ext_unauthorized response`);
  assertEqual(close.code, 1008, `${label} closes with policy violation`);
  return socket;
}

async function runPairingAuthorityMatrix(WebSocketBridge, auth) {
  await withTempHome('bridge-authority', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    const initial = auth.rotateBridgeSessionSecret(authPath, 20_000);
    const initialCode = auth.formatPairingCode(initial);
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'authority-hub',
      handshakeTimeoutMs: 25,
    });
    let acceptedServerSocket = null;
    const handleNewConnection = hub._handleNewConnection.bind(hub);
    hub._handleNewConnection = (socket) => {
      acceptedServerSocket = socket;
      return handleNewConnection(socket);
    };
    const resources = { sockets: [], bridges: [hub] };
    try {
      await hub.connect();

      const first = await createBrowserSocket(port, {
        origin: 'chrome-extension://first-extension',
        pairingCode: initialCode,
      });
      resources.sockets.push(first);
      assertEqual(first.protocol, 'fsb-ext-v1', 'authenticated upgrade selects only the stable protocol');
      const firstMessages = await sendExtRequest(first, 'authorized-first-bind');
      assertEqual(firstMessages[0]?.error?.code, 'agent_provider_offline', 'authorized first bind reaches the reserved no-router response');
      assertEqual(
        auth.readBridgeAuthState(authPath).allowedExtensionOrigin,
        'chrome-extension://first-extension',
        'first authenticated upgrade durably binds the exact extension Origin',
      );
      const acceptedMetadata = hub.acceptedSocketMetadata.get(acceptedServerSocket);
      assertEqual(acceptedMetadata?.browserOrigin, 'chrome-extension://first-extension', 'accepted socket metadata records the exact browser Origin');
      assertEqual(acceptedMetadata?.sessionId, initial.sessionId, 'accepted socket metadata records the current non-secret session ID');
      assert(!Object.prototype.hasOwnProperty.call(acceptedMetadata || {}, 'sessionSecret'), 'accepted socket metadata never records the session credential');
      assertEqual(hub.topology.pendingRequestCount, 0, 'authorized no-router response retains no current route');
      first.close();
      await sleep(20);

      const reconnect = await createBrowserSocket(port, {
        origin: 'chrome-extension://first-extension',
        pairingCode: initialCode,
      });
      resources.sockets.push(reconnect);
      const reconnectMessages = await sendExtRequest(reconnect, 'authorized-reconnect');
      assertEqual(reconnectMessages[0]?.error?.code, 'agent_provider_offline', 'current exact Origin and token reconnect remains authorized');
      reconnect.close();
      await sleep(20);

      resources.sockets.push(await assertUnprivilegedSocket(
        port,
        { origin: 'chrome-extension://first-extension' },
        'missing auth token',
      ));
      resources.sockets.push(await assertUnprivilegedSocket(
        port,
        { origin: 'chrome-extension://first-extension' },
        'missing auth token compatibility request',
        'adapter.compatibility',
      ));
      resources.sockets.push(await assertUnprivilegedSocket(
        port,
        { origin: 'chrome-extension://first-extension' },
        'missing auth token provider connection test',
        'provider.test-connection',
      ));
      resources.sockets.push(await assertUnprivilegedSocket(
        port,
        { origin: 'chrome-extension://first-extension', pairingCode: `fsb-auth.${'A'.repeat(43)}` },
        'wrong auth token',
      ));

      const rotated = auth.rotateBridgeSessionSecret(authPath, 21_000);
      resources.sockets.push(await assertUnprivilegedSocket(
        port,
        { origin: 'chrome-extension://first-extension', pairingCode: initialCode },
        'rotated auth token',
      ));

      const current = await createBrowserSocket(port, {
        origin: 'chrome-extension://first-extension',
        pairingCode: auth.formatPairingCode(rotated),
      });
      resources.sockets.push(current);
      const currentMessages = await sendExtRequest(current, 'authorized-current-token');
      assertEqual(currentMessages[0]?.error?.code, 'agent_provider_offline', 'current rotated token retains extension authority');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runUnprivilegedCannotDisplaceExtension(WebSocketBridge, auth) {
  await withTempHome('bridge-incumbent-authority', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    let state = auth.rotateBridgeSessionSecret(authPath, 21_500);
    state = auth.bindAllowedExtensionOrigin('chrome-extension://incumbent-extension', authPath);
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'incumbent-authority-hub',
      handshakeTimeoutMs: 40,
    });
    let extensionRegistrations = 0;
    const registerExtension = hub._registerExtensionClient.bind(hub);
    hub._registerExtensionClient = (...args) => {
      extensionRegistrations++;
      return registerExtension(...args);
    };
    const resources = { sockets: [], bridges: [hub] };

    try {
      await hub.connect();
      const incumbent = await createBrowserSocket(port, {
        origin: 'chrome-extension://incumbent-extension',
        pairingCode: auth.formatPairingCode(state),
      });
      resources.sockets.push(incumbent);
      const incumbentMessages = collectSocketMessages(incumbent);
      await waitFor(() => hub.topology.extensionConnected === true, 'incumbent extension registration');
      const incumbentServerSocket = hub.extensionClient;
      assertEqual(extensionRegistrations, 1, 'authorized incumbent is the only registered extension');

      const immediate = await createOriginlessSocket(port);
      resources.sockets.push(immediate);
      const immediateMessages = collectSocketMessages(immediate);
      const immediateClose = waitForSocketClose(immediate);
      immediate.send('{}');
      assertEqual((await immediateClose).code, 1008, 'Origin-less immediate non-relay frame closes with policy violation');

      const timeout = await createOriginlessSocket(port);
      resources.sockets.push(timeout);
      const timeoutMessages = collectSocketMessages(timeout);
      assertEqual((await waitForSocketClose(timeout)).code, 1008, 'Origin-less handshake timeout closes with policy violation');

      const absentToken = await createBrowserSocket(port, {
        origin: 'chrome-extension://incumbent-extension',
      });
      resources.sockets.push(absentToken);
      const absentTokenMessages = collectSocketMessages(absentToken);
      assertEqual((await waitForSocketClose(absentToken)).code, 1008, 'absent-token browser cannot replace the incumbent');

      const wrongToken = await createBrowserSocket(port, {
        origin: 'chrome-extension://incumbent-extension',
        pairingCode: `fsb-auth.${'Z'.repeat(43)}`,
      });
      resources.sockets.push(wrongToken);
      const wrongTokenMessages = collectSocketMessages(wrongToken);
      assertEqual((await waitForSocketClose(wrongToken)).code, 1008, 'wrong-token browser cannot replace the incumbent');

      assertEqual(extensionRegistrations, 1, 'unprivileged candidates never increment extension registration count');
      assertEqual(hub.topology.relayCount, 0, 'invalid Origin-less candidates never increment relay registration count');
      assertEqual(hub.extensionClient, incumbentServerSocket, 'unprivileged candidates cannot change the incumbent server socket');
      assertEqual(hub.topology.extensionConnected, true, 'unprivileged candidates cannot change incumbent connectivity');

      const resultPromise = hub.sendAndWait({ type: 'mcp:get-tabs', payload: {} }, { timeout: 500 });
      await waitFor(
        () => incumbentMessages.some((message) => message.type === 'mcp:get-tabs'),
        'incumbent legacy MCP request',
      );
      const request = incumbentMessages.find((message) => message.type === 'mcp:get-tabs');
      for (const [messages, label] of [
        [immediateMessages, 'Origin-less immediate candidate'],
        [timeoutMessages, 'Origin-less timeout candidate'],
        [absentTokenMessages, 'absent-token candidate'],
        [wrongTokenMessages, 'wrong-token candidate'],
      ]) {
        assertEqual(messages.length, 0, `${label} receives no legacy MCP request`);
      }
      incumbent.send(JSON.stringify({
        id: request.id,
        type: 'mcp:result',
        payload: { success: true, owner: 'incumbent' },
      }));
      assertEqual(
        JSON.stringify(await resultPromise),
        '{"success":true,"owner":"incumbent"}',
        'only the incumbent settles the legacy MCP request',
      );
    } finally {
      await cleanup(resources);
    }
  });
}

// The slot is freed only by the incumbent socket's own close, so before the
// liveness reaper existed an extension whose worker died without the socket
// closing held it indefinitely -- and every legitimate reconnect was refused
// for as long as that lasted. A real ws client answers protocol pings from
// under the application, exactly as a browser does, so this exercises the
// application tier: the incumbent proves it speaks mcp:ping, then stops.
async function runStaleIncumbentIsReaped(WebSocketBridge, auth) {
  await withTempHome('bridge-stale-incumbent', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    let state = auth.rotateBridgeSessionSecret(authPath, 23_000);
    state = auth.bindAllowedExtensionOrigin('chrome-extension://stale-incumbent-extension', authPath);
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'stale-incumbent-hub',
      handshakeTimeoutMs: 40,
      extensionPingIntervalMs: 30,
      extensionHeartbeatTimeoutMs: 60,
    });
    const resources = { sockets: [], bridges: [hub] };

    try {
      await hub.connect();
      const incumbent = await createBrowserSocket(port, {
        origin: 'chrome-extension://stale-incumbent-extension',
        pairingCode: auth.formatPairingCode(state),
      });
      resources.sockets.push(incumbent);
      await waitFor(() => hub.topology.extensionConnected === true, 'incumbent extension registration');
      const incumbentServerSocket = hub.extensionClient;

      // One application heartbeat arms the application tier for this socket.
      incumbent.send(JSON.stringify({ type: 'mcp:ping', ts: Date.now() }));
      await waitFor(
        () => hub.topology.lastExtensionHeartbeatAt !== null,
        'incumbent application heartbeat recorded',
      );

      const incumbentClosed = waitForSocketClose(incumbent, 4000);
      // Observed now so a failure elsewhere in the case reports as a FAIL rather
      // than crashing the suite with an unhandled rejection.
      incumbentClosed.catch(() => {});
      await waitFor(
        () => hub.topology.extensionConnected === false,
        'stale incumbent is reaped',
        4000,
      );
      await incumbentClosed;
      assertEqual(hub.extensionClient, null, 'reaping the stale incumbent frees the extension slot');
      assertEqual(
        hub.topology.lastDisconnectReason,
        'extension_reaped_heartbeat_timeout',
        'the application tier names itself as the cause',
      );

      const successor = await createBrowserSocket(port, {
        origin: 'chrome-extension://stale-incumbent-extension',
      });
      resources.sockets.push(successor);
      await waitFor(() => hub.topology.extensionConnected === true, 'successor extension registration');
      assert(
        hub.extensionClient !== incumbentServerSocket,
        'an unpaired successor wins the freed slot rather than being refused',
      );
    } finally {
      await cleanup(resources);
    }
  });
}

// The transport tier: a peer that stops answering protocol pings is gone even
// if it never proved it speaks mcp:ping, so it must not hold the slot.
async function runUnresponsiveIncumbentIsReaped(WebSocketBridge) {
  await withTempHome('bridge-unresponsive-incumbent', async () => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'unresponsive-incumbent-hub',
      handshakeTimeoutMs: 40,
      extensionPingIntervalMs: 30,
      extensionHeartbeatTimeoutMs: 60_000,
    });
    const resources = { sockets: [], bridges: [hub] };

    try {
      await hub.connect();
      const incumbent = await createBrowserSocket(port, {
        origin: 'chrome-extension://unresponsive-incumbent-extension',
        autoPong: false,
      });
      resources.sockets.push(incumbent);
      await waitFor(() => hub.topology.extensionConnected === true, 'unresponsive incumbent registration');

      const incumbentClosed = waitForSocketClose(incumbent, 4000);
      // Observed now so a failure elsewhere in the case reports as a FAIL rather
      // than crashing the suite with an unhandled rejection.
      incumbentClosed.catch(() => {});
      await waitFor(
        () => hub.topology.extensionConnected === false,
        'unresponsive incumbent is reaped',
        4000,
      );
      await incumbentClosed;
      assertEqual(hub.extensionClient, null, 'reaping the unresponsive incumbent frees the extension slot');
      assertEqual(
        hub.topology.lastDisconnectReason,
        'extension_reaped_pong_timeout',
        'the transport tier names itself as the cause',
      );
    } finally {
      await cleanup(resources);
    }
  });
}

// An extension build that predates mcp:ping still answers protocol pings. The
// application tier must stay disarmed for it, however long it stays quiet.
async function runQuietLegacyExtensionIsKept(WebSocketBridge) {
  await withTempHome('bridge-quiet-legacy', async () => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'quiet-legacy-hub',
      handshakeTimeoutMs: 40,
      extensionPingIntervalMs: 30,
      extensionHeartbeatTimeoutMs: 60,
    });
    const resources = { sockets: [], bridges: [hub] };

    try {
      await hub.connect();
      const legacy = await createBrowserSocket(port, {
        origin: 'chrome-extension://quiet-legacy-extension',
      });
      resources.sockets.push(legacy);
      await waitFor(() => hub.topology.extensionConnected === true, 'legacy extension registration');
      const registered = hub.extensionClient;

      await sleep(400);
      assertEqual(hub.topology.extensionConnected, true, 'a quiet extension that answers protocol pings stays connected');
      assert(hub.extensionClient === registered, 'the quiet extension keeps the slot it registered in');
      assertEqual(legacy.readyState, WebSocket.OPEN, 'the quiet extension socket is never closed');
    } finally {
      await cleanup(resources);
    }
  });
}

// A replaced socket can still deliver a ping already in flight. Counted, it
// would arm the application tier for a successor that never pings, and that
// successor would then be reaped merely for staying quiet.
async function runReplacedSocketPingIsIgnored(WebSocketBridge, auth) {
  await withTempHome('bridge-replaced-ping', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    let state = auth.rotateBridgeSessionSecret(authPath, 24_000);
    state = auth.bindAllowedExtensionOrigin('chrome-extension://replaced-ping-extension', authPath);
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'replaced-ping-hub',
      handshakeTimeoutMs: 40,
      extensionPingIntervalMs: 30,
      extensionHeartbeatTimeoutMs: 60,
    });
    const resources = { sockets: [], bridges: [hub] };

    try {
      await hub.connect();
      const options = {
        origin: 'chrome-extension://replaced-ping-extension',
        pairingCode: auth.formatPairingCode(state),
      };
      const first = await createBrowserSocket(port, options);
      resources.sockets.push(first);
      await waitFor(() => hub.topology.extensionConnected === true, 'first extension registration');
      const replaced = hub.extensionClient;

      const successor = await createBrowserSocket(port, options);
      resources.sockets.push(successor);
      await waitFor(
        () => hub.extensionClient !== null && hub.extensionClient !== replaced,
        'an authorized successor replaces the first socket',
      );
      const registered = hub.extensionClient;
      const heartbeatAt = hub.topology.lastExtensionHeartbeatAt;

      hub._handleExtensionMessage(replaced, JSON.stringify({ type: 'mcp:ping', ts: Date.now() }));
      assertEqual(hub.extensionHeartbeatCount, 0, 'a ping from the replaced socket is not counted for its successor');
      assertEqual(
        hub.topology.lastExtensionHeartbeatAt,
        heartbeatAt,
        'a ping from the replaced socket does not refresh the successor heartbeat',
      );

      await sleep(400);
      assert(hub.extensionClient === registered, 'a successor that never pings keeps the slot');
      assertEqual(successor.readyState, WebSocket.OPEN, 'the successor socket is never closed');
    } finally {
      await cleanup(resources);
    }
  });
}

function answerBridgeRequests(socket) {
  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (_error) {
      return;
    }
    if (typeof message.id !== 'string' || message.type === 'mcp:unanswered') return;
    socket.send(JSON.stringify({
      id: message.id,
      type: 'mcp:response',
      payload: { success: true, answered: message.type },
    }));
  });
}

// Node keeps a server listening after an accept failure such as EMFILE, so an
// 'error' event on a listening hub is not an outage and must not become one.
async function runHubSurvivesAcceptError(WebSocketBridge) {
  await withTempHome('bridge-hub-accept-error', async () => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({ port, host: '127.0.0.1', instanceId: 'accept-error-hub' });
    const resources = { sockets: [], bridges: [hub] };

    try {
      await hub.connect();
      const extension = await createBrowserSocket(port, {
        origin: 'chrome-extension://accept-error-extension',
      });
      resources.sockets.push(extension);
      answerBridgeRequests(extension);
      await waitFor(() => hub.topology.extensionConnected === true, 'extension registration');
      const server = hub.httpServer;

      server.emit('error', Object.assign(new Error('accept EMFILE'), { code: 'EMFILE' }));

      assertEqual(hub.currentMode, 'hub', 'an accept error leaves the bridge in hub mode');
      assert(hub.httpServer === server && server.listening, 'an accept error keeps the same listener');
      assertEqual(hub.topology.extensionConnected, true, 'an accept error keeps the extension attached');
      const response = await hub.sendAndWait({ type: 'mcp:get-tabs', payload: {} }, { timeout: 1000 });
      assertEqual(response.answered, 'mcp:get-tabs', 'requests still reach the extension after an accept error');
    } finally {
      await cleanup(resources);
    }
  });
}

// A hub whose listener is really gone must release everything it holds and
// compete for the port again, rather than sit in a mode nothing can reach.
async function runHubRebindsAfterListenerLoss(WebSocketBridge, bridgeModule) {
  await withTempHome('bridge-hub-listener-loss', async (home) => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'listener-loss-hub',
      promotionJitterMs: 1,
    });
    const resources = { sockets: [], bridges: [hub] };

    try {
      await hub.connect();
      const extension = await createBrowserSocket(port, {
        origin: 'chrome-extension://listener-loss-extension',
      });
      resources.sockets.push(extension);
      answerBridgeRequests(extension);
      await waitFor(() => hub.topology.extensionConnected === true, 'extension registration');
      extension.send(JSON.stringify({
        type: 'mcp:extension-state',
        extensionId: 'a'.repeat(32),
        extensionVersion: '1.0.0',
        installInstanceId: 'listener-loss-install',
        normalWindowCount: 1,
        connectedAt: null,
      }));
      await waitFor(() => hub.topology.extensionAttachment !== null, 'extension attachment report');

      const pending = hub.sendAndWait({ type: 'mcp:unanswered', payload: {} }, { timeout: 5000 })
        .then(() => null, (error) => error);
      const extensionClosed = waitForSocketClose(extension, 2000);
      // Observed now so a failure elsewhere in the case reports as a FAIL rather
      // than crashing the suite with an unhandled rejection.
      extensionClosed.catch(() => {});
      const lostServer = hub.httpServer;
      // An accept failure just before the loss must not coalesce away its record.
      lostServer.emit('error', Object.assign(new Error('accept EMFILE'), { code: 'EMFILE' }));
      lostServer.close();
      const startedAt = Date.now();
      lostServer.emit('error', Object.assign(new Error('listener lost'), { code: 'EBADF' }));
      assertEqual(hub.topology.extensionAttachment, null, 'the departed extension is no longer reported as attached');
      const journal = fs.readFileSync(path.join(home, '.fsb', 'agent-runtime', 'bridge-events.jsonl'), 'utf8')
        .trim().split('\n').map((line) => JSON.parse(line));
      assert(journal.some((record) => record.event === 'hub_listener_lost' && record.reason === 'ebadf'),
        'the lost listener is journaled after an accept failure');

      const error = await pending;
      assert(error instanceof Error, 'an in-flight request is rejected when the listener is lost');
      assert(Date.now() - startedAt < 1000, 'the rejection is immediate rather than waiting out the request timeout');
      assertEqual(bridgeModule.isBridgeDisconnectError(error), true, 'the rejection arms the sw_evicted recovery');
      assertEqual(bridgeModule.bridgeDisconnectReason(error), 'hub_server_error', 'the rejection carries the real cause');
      await extensionClosed;
      assert(true, 'the extension socket is closed so it reconnects to whoever binds next');

      await waitFor(
        () => hub.currentMode === 'hub' && hub.httpServer !== lostServer && hub.httpServer?.listening === true,
        'hub re-binds the port',
        5000,
      );
      const successor = await createBrowserSocket(port, {
        origin: 'chrome-extension://listener-loss-extension',
      });
      resources.sockets.push(successor);
      answerBridgeRequests(successor);
      await waitFor(() => hub.topology.extensionConnected === true, 'extension re-registration');
      const response = await hub.sendAndWait({ type: 'mcp:get-tabs', payload: {} }, { timeout: 1000 });
      assertEqual(response.answered, 'mcp:get-tabs', 'requests reach the extension again after the hub re-binds');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runStdinShutdownHelper() {
  const { PassThrough } = require('node:stream');
  const helperUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'stdin-shutdown.js')).href;
  const { shutdownWhenStdinEnds } = await import(helperUrl);

  const ended = new PassThrough();
  ended.end();
  ended.resume();
  await new Promise((resolve) => ended.once('end', resolve));
  let endedCalls = 0;
  const firedImmediately = shutdownWhenStdinEnds(ended, () => { endedCalls += 1; });
  assertEqual(firedImmediately, true, 'stdin that already hit EOF is reported as ended');
  assertEqual(endedCalls, 1, 'stdin that already hit EOF shuts down synchronously');

  const live = new PassThrough();
  let liveCalls = 0;
  assertEqual(shutdownWhenStdinEnds(live, () => { liveCalls += 1; }), false, 'open stdin is left running');
  assertEqual(liveCalls, 0, 'open stdin does not shut down');
  const closed = new Promise((resolve) => live.once('close', resolve));
  live.end();
  await closed;
  assertEqual(liveCalls, 1, 'end followed by close shuts down exactly once');

  const source = fs.readFileSync(path.join(repoRoot, 'mcp', 'src', 'index.ts'), 'utf8');
  const stdioSource = source.slice(
    source.indexOf('async function runStdioServer'),
    source.indexOf('async function runHttpMode'),
  );
  assert(
    /shutdownWhenStdinEnds\(process\.stdin,[\s\S]*?shutdown\(\);/.test(stdioSource),
    'the stdio server shuts down when the host closes stdin',
  );
}

async function runAuthStatusProbe(WebSocketBridge, auth) {
  await withTempHome('bridge-auth-status', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    let state = auth.rotateBridgeSessionSecret(authPath, 22_000);
    state = auth.bindAllowedExtensionOrigin('chrome-extension://auth-status-extension', authPath);
    let localInvocations = 0;
    let relayInvocations = 0;
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'auth-status-hub',
      handshakeTimeoutMs: 25,
      capabilities: ['agent-spawn'],
      handleExtRequest: async () => {
        localInvocations++;
        return { unexpected: true };
      },
    });
    const relay = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'auth-status-relay',
      handshakeTimeoutMs: 25,
      capabilities: ['agent-spawn'],
      handleExtRequest: async () => {
        relayInvocations++;
        return { unexpected: true };
      },
    });
    const resources = { sockets: [], bridges: [hub, relay] };
    try {
      await hub.connect();
      await relay.connect();
      const extension = await createBrowserSocket(port, {
        origin: 'chrome-extension://auth-status-extension',
        pairingCode: auth.formatPairingCode(state),
      });
      resources.sockets.push(extension);
      const messages = collectSocketMessages(extension);
      extension.send(JSON.stringify({
        id: 'auth-status-current',
        type: 'ext:request',
        method: 'bridge.auth-status',
        payload: {},
      }));
      await waitFor(() => messages.length === 1, 'auth-status response', 1000, 10);

      assertEqual(
        JSON.stringify(messages[0]),
        '{"id":"auth-status-current","type":"ext:response","payload":{"authorized":true}}',
        'bridge.auth-status returns only the secret-free authorization acknowledgement',
      );
      assertEqual(localInvocations, 0, 'bridge.auth-status invokes no local handler');
      assertEqual(relayInvocations, 0, 'bridge.auth-status invokes no capable relay');
      assertEqual(hub.activeExtRequests.size, 0, 'bridge.auth-status retains no reverse route');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runLocalReverseRouting(WebSocketBridge, auth) {
  await withTempHome('bridge-local-route', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    let state = auth.rotateBridgeSessionSecret(authPath, 23_000);
    state = auth.bindAllowedExtensionOrigin('chrome-extension://local-route-extension', authPath);
    let localInvocations = 0;
    let relayInvocations = 0;
    let localRouteAborts = 0;
    let lateEmit = null;
    const localPending = [];
    const delegationId = 'delegation_local_0001';
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'local-route-hub',
      handshakeTimeoutMs: 25,
      capabilities: ['agent-spawn'],
      handleExtRequest: async (request, emit, context) => {
        localInvocations++;
        lateEmit = emit;
        if (request.method === 'delegate.cancel') {
          return {
            delegationId: request.payload.delegationId,
            status: 'already_terminal',
            terminal: { type: 'diagnostic', code: 'already_terminal' },
          };
        }
        if (request.payload.fail === true) {
          throw new Error(`handler rejected ${request.payload.marker}`);
        }
        if (request.payload.drift === true) {
          emit({
            id: request.id,
            type: 'ext:event',
            event: 'delegation.started',
            payload: { delegationId: 'delegation_local_drift', adapterId: 'claude-code', profileVersion: '1' },
          });
          emit({
            id: request.id,
            type: 'ext:event',
            event: 'delegation.event',
            payload: { type: 'diagnostic', code: 'agent_protocol_drift', message: 'Agent protocol drift' },
          });
          return {
            delegationId: 'delegation_local_drift',
            status: 'failed',
            terminal: { type: 'diagnostic', code: 'agent_protocol_drift' },
          };
        }
        return new Promise((resolve) => {
          const pending = { request, emit, resolve, signal: context?.signal };
          context?.signal.addEventListener('abort', () => {
            localRouteAborts++;
            resolve({
              delegationId: 'delegation_local_route_lost',
              status: 'failed',
              terminal: { type: 'diagnostic', code: 'route_lost' },
            });
          }, { once: true });
          localPending.push(pending);
        });
      },
    });
    const relay = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'local-route-relay',
      handshakeTimeoutMs: 25,
      capabilities: ['agent-spawn'],
      handleExtRequest: async () => {
        relayInvocations++;
        return { target: 'relay' };
      },
    });
    const resources = { sockets: [], bridges: [hub, relay] };
    try {
      await hub.connect();
      await relay.connect();
      const extension = await createBrowserSocket(port, {
        origin: 'chrome-extension://local-route-extension',
        pairingCode: auth.formatPairingCode(state),
      });
      resources.sockets.push(extension);
      const messages = collectSocketMessages(extension);

      extension.send(JSON.stringify({
        id: 'malformed-local-route',
        type: 'ext:request',
        method: 'Bridge.Invalid',
        payload: {},
      }));
      await waitFor(() => messages.length === 1, 'malformed request response', 1000, 10);
      assertEqual(messages[0]?.error?.code, 'invalid_ext_request', 'malformed authorized request fails before routing');
      assertEqual(localInvocations, 0, 'malformed request invokes no local handler');
      assertEqual(relayInvocations, 0, 'malformed request invokes no relay handler');

      extension.send(JSON.stringify({
        id: 'local-route',
        type: 'ext:request',
        method: 'delegate.start',
        payload: { adapterId: 'claude-code', task: 'safe' },
      }));
      await waitFor(() => localPending.length === 1, 'pending local delegation start', 1000, 10);
      assertEqual(hub.activeExtRequests.size, 1, 'local start route remains open while delegation runs');
      localPending[0].emit({
        id: 'local-route',
        type: 'ext:event',
        event: 'delegation.started',
        payload: { delegationId, adapterId: 'claude-code', profileVersion: '1' },
      });
      localPending[0].emit({
        id: 'local-route',
        type: 'ext:event',
        event: 'delegation.event',
        payload: { type: 'system', subtype: 'init', profileVersion: '1' },
      });
      localPending[0].emit({
        id: 'local-route',
        type: 'ext:event',
        event: 'delegation.event',
        payload: { type: 'assistant', text: 'progress' },
      });
      await waitFor(() => messages.length === 4, 'local early id and ordered events', 1000, 10);
      assertEqual(messages[1]?.event, 'delegation.started', 'local start emits the early server id first');
      assertEqual(messages[1]?.payload?.delegationId, delegationId, 'local early event carries the server-minted delegation id');
      assertEqual(messages[2]?.event, 'delegation.event', 'local normalized init follows the early id');
      assertEqual(messages[3]?.event, 'delegation.event', 'local normalized progress remains routable while pending');
      assertEqual(hub.activeExtRequests.size, 1, 'multiple local events do not settle the start route');
      localPending[0].resolve({
        delegationId,
        status: 'completed',
        terminal: { type: 'result', isError: false },
      });
      await waitFor(() => messages.length === 5, 'local terminal response', 1000, 10);
      assertEqual(messages[4]?.type, 'ext:response', 'local handler emits one final response after ordered events');
      assertEqual(messages[4]?.payload?.delegationId, delegationId, 'local final response correlates to the early server id');
      assertEqual(messages[4]?.payload?.status, 'completed', 'local final response carries domain completion status');
      assertEqual(localInvocations, 1, 'local handler runs exactly once');
      assertEqual(relayInvocations, 0, 'capable relay is not invoked when local handler exists');
      assertEqual(hub.activeExtRequests.size, 0, 'local final response deletes reverse route state');

      lateEmit({ id: 'local-route', type: 'ext:event', event: 'delegation.event', payload: { type: 'assistant', text: 'late' } });
      await sleep(20);
      assertEqual(messages.length, 5, 'late local event after final response is dropped');

      extension.send(JSON.stringify({
        id: 'local-cancel',
        type: 'ext:request',
        method: 'delegate.cancel',
        payload: { delegationId },
      }));
      await waitFor(() => messages.length === 6, 'local cancel response', 1000, 10);
      assertEqual(messages[5]?.payload?.delegationId, delegationId, 'cancel uses the server-minted delegation id');
      assertEqual(messages[5]?.payload?.status, 'already_terminal', 'duplicate/late cancel is an idempotent domain response');

      extension.send(JSON.stringify({
        id: 'local-protocol-drift',
        type: 'ext:request',
        method: 'delegate.start',
        payload: { adapterId: 'claude-code', task: 'safe', drift: true },
      }));
      await waitFor(() => messages.length === 9, 'local protocol drift settlement', 1000, 10);
      assertEqual(messages[6]?.event, 'delegation.started', 'drift run still exposes its server id before diagnostics');
      assertEqual(messages[7]?.payload?.code, 'agent_protocol_drift', 'drift is emitted as a domain diagnostic event');
      assertEqual(messages[8]?.payload?.terminal?.code, 'agent_protocol_drift', 'drift settles in the domain terminal payload');
      assertEqual(messages[8]?.payload?.status, 'failed', 'drift domain terminal is non-success');
      assertEqual(messages[8]?.error, undefined, 'drift does not add a Phase 59 transport error code');

      extension.send(JSON.stringify({
        id: 'local-handler-throw',
        type: 'ext:request',
        method: 'delegate.start',
        payload: { adapterId: 'claude-code', task: 'safe', fail: true, marker: 'RAW_HANDLER_INPUT' },
      }));
      await waitFor(() => messages.length === 10, 'handler throw response', 1000, 10);
      assertEqual(messages[9]?.error?.code, 'invalid_ext_request', 'handler throw settles with the typed invalid request error');
      assert(!JSON.stringify(messages[9]).includes('RAW_HANDLER_INPUT'), 'handler failure response omits raw request content');
      assertEqual(hub.activeExtRequests.size, 0, 'handler throw settles and clears route exactly once');

      extension.send(JSON.stringify({
        id: 'local-route-loss',
        type: 'ext:request',
        method: 'delegate.start',
        payload: { adapterId: 'claude-code', task: 'route-lifetime' },
      }));
      await waitFor(() => localPending.length === 2, 'pending local route-loss delegation', 1000, 10);
      localPending[1].emit({
        id: 'local-route-loss',
        type: 'ext:event',
        event: 'delegation.started',
        payload: { delegationId: 'delegation_local_route_lost', adapterId: 'claude-code', profileVersion: '1' },
      });
      await waitFor(() => messages.length === 11, 'local route-loss started event', 1000, 10);
      extension.close();
      await waitFor(() => localRouteAborts === 1, 'local route abort signal', 1000, 10);
      assertEqual(localPending[1].signal?.aborted, true, 'local socket loss revokes continuing task authority');
      assertEqual(hub.activeExtRequests.size, 0, 'local socket loss clears the reverse route');
      assertEqual(localRouteAborts, 1, 'local socket loss aborts the handler once');
      assertEqual(relayInvocations, 0, 'local socket loss never replays onto a capable relay');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runRelayReverseRouting(WebSocketBridge, auth) {
  await withTempHome('bridge-relay-route', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    let state = auth.rotateBridgeSessionSecret(authPath, 24_000);
    state = auth.bindAllowedExtensionOrigin('chrome-extension://relay-route-extension', authPath);
    let skippedInvocations = 0;
    let firstInvocations = 0;
    let secondInvocations = 0;
    let relayRouteAborts = 0;
    const pending = [];
    const delegationId = 'delegation_relay_0001';
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'relay-route-hub',
      handshakeTimeoutMs: 25,
    });
    const skippedRelay = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'relay-route-skipped',
      handshakeTimeoutMs: 25,
      handleExtRequest: async () => {
        skippedInvocations++;
        return { target: 'skipped' };
      },
    });
    const firstRelay = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'relay-route-first',
      handshakeTimeoutMs: 25,
      capabilities: ['agent-spawn'],
      handleExtRequest: (request, emit, context) => {
        firstInvocations++;
        if (request.method === 'delegate.cancel') {
          return Promise.resolve({
            delegationId: request.payload.delegationId,
            status: 'already_terminal',
            terminal: { type: 'diagnostic', code: 'already_terminal' },
          });
        }
        return new Promise((resolve) => {
          const item = { request, emit, resolve, signal: context?.signal };
          context?.signal.addEventListener('abort', () => {
            relayRouteAborts++;
            resolve({
              delegationId: 'delegation_relay_route_lost',
              status: 'failed',
              terminal: { type: 'diagnostic', code: 'route_lost' },
            });
          }, { once: true });
          pending.push(item);
        });
      },
    });
    const secondRelay = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'relay-route-second',
      handshakeTimeoutMs: 25,
      capabilities: ['agent-spawn'],
      handleExtRequest: async () => {
        secondInvocations++;
        return { target: 'second' };
      },
    });
    const resources = { sockets: [], bridges: [hub, skippedRelay, firstRelay, secondRelay] };
    try {
      await hub.connect();
      await skippedRelay.connect();
      await firstRelay.connect();
      await secondRelay.connect();
      const extension = await createBrowserSocket(port, {
        origin: 'chrome-extension://relay-route-extension',
        pairingCode: auth.formatPairingCode(state),
      });
      resources.sockets.push(extension);
      const messages = collectSocketMessages(extension);
      const request = {
        id: 'relay-route',
        type: 'ext:request',
        method: 'delegate.start',
        payload: { adapterId: 'claude-code', task: 'relay' },
      };
      extension.send(JSON.stringify(request));
      await waitFor(() => pending.length === 1, 'first capable relay invocation', 1000, 10);
      assertEqual(skippedInvocations, 0, 'earlier non-capable relay is skipped');
      assertEqual(firstInvocations, 1, 'first capable relay is selected exactly once');
      assertEqual(secondInvocations, 0, 'later capable relay is not selected');
      assertEqual(hub.activeExtRequests.size, 1, 'relay route is inserted before handler settlement');

      secondRelay.hubConnection.send(JSON.stringify({
        id: request.id,
        type: 'ext:response',
        payload: { target: 'spoof' },
      }));
      await sleep(20);
      assertEqual(messages.length, 0, 'wrong capable relay cannot spoof the selected route');

      extension.send(JSON.stringify(request));
      await waitFor(() => messages.length === 1, 'duplicate active ID response', 1000, 10);
      assertEqual(messages[0]?.error?.code, 'invalid_ext_request', 'duplicate active request ID is rejected before forwarding');
      assertEqual(firstInvocations, 1, 'duplicate active ID never invokes the selected relay twice');

      pending[0].emit({
        id: request.id,
        type: 'ext:event',
        event: 'delegation.started',
        payload: { delegationId, adapterId: 'claude-code', profileVersion: '1' },
      });
      pending[0].emit({
        id: request.id,
        type: 'ext:event',
        event: 'delegation.event',
        payload: { type: 'system', subtype: 'init', profileVersion: '1' },
      });
      pending[0].emit({
        id: request.id,
        type: 'ext:event',
        event: 'delegation.event',
        payload: { type: 'assistant', text: 'progress' },
      });
      pending[0].emit({
        id: request.id,
        type: 'ext:event',
        event: 'delegation.event',
        payload: {
          delegationId,
          event: {
            type: 'result',
            sessionId: 'session_bridge_result_0001',
            payload: { is_error: false },
          },
        },
      });
      await waitFor(() => messages.length === 5, 'selected relay ordered events', 1000, 10);
      assertEqual(messages[1]?.event, 'delegation.started', 'selected relay forwards the early server id first');
      assertEqual(messages[1]?.payload?.delegationId, delegationId, 'relayed early event carries the server-minted id');
      assertEqual(messages[2]?.event, 'delegation.event', 'selected relay forwards normalized init without settling');
      assertEqual(messages[3]?.event, 'delegation.event', 'selected relay forwards multiple normalized events while pending');
      assertEqual(messages[4]?.payload?.event?.type, 'result', 'selected relay forwards one authoritative result before final');
      assertEqual(hub.activeExtRequests.size, 1, 'events do not settle the selected relay route');

      pending[0].resolve({
        delegationId,
        status: 'succeeded',
        terminal: { type: 'result', isError: false },
      });
      await waitFor(() => messages.length === 6, 'selected relay response', 1000, 10);
      assertEqual(messages[5]?.payload?.delegationId, delegationId, 'first capable relay supplies one correlated final response');
      assertEqual(messages[5]?.payload?.status, 'succeeded', 'relayed final response follows the authoritative result');
      assertEqual(hub.activeExtRequests.size, 0, 'first relay final deletes hub reverse route');

      firstRelay.hubConnection.send(JSON.stringify({
        id: request.id,
        type: 'ext:event',
        event: 'delegation.event',
        payload: { late: true },
      }));
      firstRelay.hubConnection.send(JSON.stringify({
        id: request.id,
        type: 'ext:response',
        payload: { target: 'duplicate' },
      }));
      await sleep(20);
      assertEqual(messages.length, 6, 'late event and duplicate final from selected relay are dropped');

      extension.send(JSON.stringify({
        id: 'relay-cancel',
        type: 'ext:request',
        method: 'delegate.cancel',
        payload: { delegationId },
      }));
      await waitFor(() => messages.length === 7, 'selected relay cancel response', 1000, 10);
      assertEqual(messages[6]?.payload?.delegationId, delegationId, 'relayed cancel uses the early server-minted id');
      assertEqual(messages[6]?.payload?.status, 'already_terminal', 'relayed cancel remains idempotent after terminal settlement');
      assertEqual(secondInvocations, 0, 'relayed cancel stays on the first capable relay without replay');

      extension.send(JSON.stringify({
        id: 'extension-close-route',
        type: 'ext:request',
        method: 'delegate.start',
        payload: { adapterId: 'claude-code', task: 'close-route' },
      }));
      await waitFor(() => pending.length === 2, 'extension-close relay invocation', 1000, 10);
      pending[1].emit({
        id: 'extension-close-route',
        type: 'ext:event',
        event: 'delegation.started',
        payload: { delegationId: 'delegation_relay_route_lost', adapterId: 'claude-code', profileVersion: '1' },
      });
      await waitFor(() => messages.length === 8, 'extension-close relay started event', 1000, 10);
      extension.close();
      await waitFor(() => hub.activeExtRequests.size === 0, 'extension-close route cleanup', 1000, 10);
      assertEqual(hub.activeExtRequests.size, 0, 'extension close clears its active reverse route');
      await waitFor(() => firstRelay.relayActiveExtRequests.size === 0, 'relay handler cleanup after extension close', 1000, 10);
      assertEqual(pending[1].signal?.aborted, true, 'relayed socket loss revokes continuing task authority');
      assertEqual(relayRouteAborts, 1, 'relayed socket loss aborts the selected handler once');
      pending[1].resolve({ target: 'too-late' });
      await sleep(20);
      assertEqual(firstInvocations, 3, 'relayed socket loss does not replay the start request');
      assertEqual(secondInvocations, 0, 'relayed socket loss does not fail over to another capable relay');
      assertEqual(secondRelay.currentMode, 'relay', 'extension close retains other capable relays');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runActiveSocketRevocation(WebSocketBridge, auth, reset) {
  const suffix = reset ? 'reset' : 'rotate';
  await withTempHome(`bridge-active-${suffix}`, async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    let state = auth.rotateBridgeSessionSecret(authPath, 30_000);
    auth.bindAllowedExtensionOrigin('chrome-extension://active-extension', authPath);
    state = auth.readBridgeAuthState(authPath);
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: `active-${suffix}-hub`,
      handshakeTimeoutMs: 25,
    });
    const resources = { sockets: [], bridges: [hub] };
    try {
      await hub.connect();
      const relay = await createOriginlessSocket(port);
      resources.sockets.push(relay);
      const relayMessages = collectSocketMessages(relay);
      relay.send(JSON.stringify({ type: 'relay:hello', instanceId: `active-${suffix}-relay` }));
      await waitFor(() => hub.topology.relayCount === 1, `${suffix} relay registration`, 1000, 10);

      const extension = await createBrowserSocket(port, {
        origin: 'chrome-extension://active-extension',
        pairingCode: auth.formatPairingCode(state),
      });
      resources.sockets.push(extension);
      const messages = await sendExtRequest(extension, `before-${suffix}`);
      assertEqual(messages[0]?.error?.code, 'agent_provider_offline', `authorized socket is current before external ${suffix}`);

      if (reset) auth.resetBridgePairing(authPath, 31_000);
      else auth.rotateBridgeSessionSecret(authPath, 31_000);

      const closePromise = waitForSocketClose(extension);
      extension.send(JSON.stringify({ id: `after-${suffix}`, type: 'ext:request', method: 'bridge.test', payload: {} }));
      const close = await closePromise;
      const unauthorized = messages.filter((message) => message.error?.code === 'ext_unauthorized');
      const relayExtFrames = relayMessages.filter((message) => typeof message.type === 'string' && message.type.startsWith('ext:'));
      assertEqual(unauthorized.length, 1, `already-open socket receives one unauthorized response after external ${suffix}`);
      assertEqual(close.code, 1008, `already-open socket closes with policy violation after external ${suffix}`);
      assertEqual(relayExtFrames.length, 0, `external ${suffix} invokes no relay reverse path`);
      assertEqual(hub.topology.pendingRequestCount, 0, `external ${suffix} leaves current route count zero`);

      if (reset) {
        const resetState = auth.readBridgeAuthState(authPath);
        const rebound = await createBrowserSocket(port, {
          origin: 'chrome-extension://new-extension',
          pairingCode: auth.formatPairingCode(resetState),
        });
        resources.sockets.push(rebound);
        const reboundMessages = await sendExtRequest(rebound, 'after-reset-rebind');
        assertEqual(reboundMessages[0]?.error?.code, 'agent_provider_offline', 'explicit reset permits a new authenticated extension ID');
        assertEqual(auth.readBridgeAuthState(authPath).allowedExtensionOrigin, 'chrome-extension://new-extension', 'reset rebind persists only the new exact Origin');
      }
    } finally {
      await cleanup(resources);
    }
  });
}

async function runHubExitWithActiveExtRequest(WebSocketBridge, auth) {
  await withTempHome('bridge-hub-exit-active-ext', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    let state = auth.rotateBridgeSessionSecret(authPath, 32_000);
    state = auth.bindAllowedExtensionOrigin('chrome-extension://hub-exit-extension', authPath);
    let handlerInvocations = 0;
    let resolveHandler = null;
    let routeAborts = 0;
    let routeSignal = null;
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'active-ext-original-hub',
      handshakeTimeoutMs: 25,
      promotionJitterMs: 1,
      maxReconnectDelayMs: 100,
    });
    const relay = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'active-ext-promoting-relay',
      handshakeTimeoutMs: 25,
      promotionJitterMs: 1,
      maxReconnectDelayMs: 100,
      capabilities: ['agent-spawn'],
      handleExtRequest: async (request, emit, context) => {
        handlerInvocations++;
        routeSignal = context?.signal ?? null;
        emit({
          id: request.id,
          type: 'ext:event',
          event: 'delegation.started',
          payload: { delegationId: 'delegation_hub_route_lost', adapterId: 'claude-code', profileVersion: '1' },
        });
        return new Promise((resolve) => {
          resolveHandler = resolve;
          context?.signal.addEventListener('abort', () => {
            routeAborts++;
            resolve({
              delegationId: 'delegation_hub_route_lost',
              status: 'failed',
              terminal: { type: 'diagnostic', code: 'route_lost' },
            });
          }, { once: true });
        });
      },
    });
    const resources = { sockets: [], bridges: [hub, relay] };
    try {
      await hub.connect();
      await relay.connect();
      const extension = await createBrowserSocket(port, {
        origin: 'chrome-extension://hub-exit-extension',
        pairingCode: auth.formatPairingCode(state),
      });
      resources.sockets.push(extension);
      const messages = collectSocketMessages(extension);
      const extensionClose = waitForSocketClose(extension);
      extension.send(JSON.stringify({
        id: 'hub-exit-active-request',
        type: 'ext:request',
        method: 'agent.start',
        payload: {},
      }));
      await waitFor(() => handlerInvocations === 1, 'hub-exit active relay invocation', 1000, 10);
      await waitFor(() => messages.length === 1, 'hub-exit started event', 1000, 10);
      assertEqual(hub.activeExtRequests.size, 1, 'hub tracks the active ext request before exit');
      assertEqual(relay.relayActiveExtRequests.size, 1, 'selected relay tracks the active ext request before hub exit');

      hub.disconnect();
      await extensionClose;
      await waitFor(
        () => relay.currentMode === 'hub' && relay.topology.activeHubInstanceId === 'active-ext-promoting-relay',
        'active ext relay promotion',
        1000,
        10,
      );
      assertEqual(messages[0]?.event, 'delegation.started', 'hub loss occurs after relayed authority starts');
      assertEqual(messages.length, 1, 'hub exit is observed as socket loss without a fabricated final response');
      assertEqual(hub.activeExtRequests.size, 0, 'exited hub clears its old reverse route state');
      assertEqual(relay.relayActiveExtRequests.size, 0, 'promoted relay clears its old relayed request state');
      assertEqual(routeSignal?.aborted, true, 'hub loss revokes the relayed handler authority');
      assertEqual(routeAborts, 1, 'hub loss aborts the selected relayed handler once');
      assertEqual(handlerInvocations, 1, 'hub exit does not replay the request during promotion');

      resolveHandler({ tooLate: true });
      await sleep(20);
      assertEqual(messages.length, 1, 'late selected-relay completion cannot reach the closed extension socket');
      assertEqual(handlerInvocations, 1, 'late completion does not create a replay after promotion');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runCapableRelayExitMidExtFrame(WebSocketBridge, auth) {
  await withTempHome('bridge-relay-exit-mid-ext', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    let state = auth.rotateBridgeSessionSecret(authPath, 33_000);
    state = auth.bindAllowedExtensionOrigin('chrome-extension://relay-exit-extension', authPath);
    let firstInvocations = 0;
    let secondInvocations = 0;
    let resolveFirst = null;
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'relay-exit-hub',
      handshakeTimeoutMs: 25,
    });
    const firstRelay = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'relay-exit-first',
      handshakeTimeoutMs: 25,
      capabilities: ['agent-spawn'],
      handleExtRequest: async () => {
        firstInvocations++;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      },
    });
    const secondRelay = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'relay-exit-second',
      handshakeTimeoutMs: 25,
      capabilities: ['agent-spawn'],
      handleExtRequest: async () => {
        secondInvocations++;
        return { target: 'second' };
      },
    });
    const resources = { sockets: [], bridges: [hub, firstRelay, secondRelay] };
    try {
      await hub.connect();
      await firstRelay.connect();
      await secondRelay.connect();
      const extension = await createBrowserSocket(port, {
        origin: 'chrome-extension://relay-exit-extension',
        pairingCode: auth.formatPairingCode(state),
      });
      resources.sockets.push(extension);
      const messages = collectSocketMessages(extension);
      extension.send(JSON.stringify({
        id: 'relay-exit-mid-frame',
        type: 'ext:request',
        method: 'agent.start',
        payload: {},
      }));
      await waitFor(() => firstInvocations === 1, 'selected relay invocation before exit', 1000, 10);
      assertEqual(hub.activeExtRequests.size, 1, 'hub route exists while selected relay is active');

      firstRelay.disconnect();
      await waitFor(() => messages.length === 1, 'relay topology error response', 1000, 10);
      assertEqual(messages[0]?.error?.code, 'bridge_topology_changed', 'selected relay exit returns one topology error');
      assertEqual(messages.filter((message) => message.type === 'ext:response').length, 1, 'selected relay exit settles exactly once');
      assertEqual(hub.activeExtRequests.size, 0, 'selected relay exit clears the reverse route');
      assertEqual(hub.currentMode, 'hub', 'original hub stays up after selected relay exit');
      assertEqual(secondRelay.currentMode, 'relay', 'second capable relay remains connected');
      assertEqual(secondInvocations, 0, 'selected relay exit does not replay to the second capable relay');
      assertEqual(hub.topology.relayCount, 1, 'hub retains the unselected capable relay');

      resolveFirst({ tooLate: true });
      await sleep(20);
      assertEqual(messages.length, 1, 'late response from exited relay cannot create a second final');
      assertEqual(secondInvocations, 0, 'late completion still does not trigger failover replay');
    } finally {
      await cleanup(resources);
    }
  });
}

// ---------------------------------------------------------------------------
// Several browsers on one hub
//
// The hub keeps one slot per browser kind, told apart by the scheme of the
// Origin each extension connects with. A call names its browser in a top-level
// `browser` field, which is the hub's own routing and never reaches an
// extension.
// ---------------------------------------------------------------------------

const MULTI_CHROME_ORIGIN = 'chrome-extension://multi-browser-chrome';
const MULTI_SAFARI_ORIGIN = 'safari-web-extension://4C6E0A1B-2F3D-4E5A-9B8C-7D6E5F4A3B2C';
// The sockets in these cases never say which install they are, so each is
// named after its extension (Chrome) or its kind (Safari, whose Origin changes
// on every launch). Installs that do say are covered further down.
const CHROME_KEY = 'chrome-legacy-multibro';
const SAFARI_KEY = 'safari-legacy';
const BOTH_KEYS = `${CHROME_KEY},${SAFARI_KEY}`;

// Stand in for an extension: remember what it is sent, answer when told to.
function attachFakeBrowser(socket) {
  const received = [];
  socket.on('message', (data) => {
    received.push(JSON.parse(data.toString()));
  });
  return {
    received,
    requests: () => received.filter((frame) => typeof frame.id === 'string'),
    answer: (id, payload) => socket.send(JSON.stringify({ id, type: 'mcp:result', payload })),
  };
}

// A call the test answers later. If an assertion fails first, cleanup rejects
// it, and that must be reported as the case's failure, not crash the run.
function inFlight(promise) {
  promise.catch(() => {});
  return promise;
}

async function attachBrowser(port, origin, options = {}) {
  const socket = await createBrowserSocket(port, { origin, ...options });
  return { socket, ...attachFakeBrowser(socket) };
}

// A relay as a client from before the roster behaves: it says hello and then
// forwards frames that name no browser.
async function createLegacyRelay(port, instanceId) {
  const socket = await createOriginlessSocket(port);
  const messages = collectSocketMessages(socket);
  socket.send(JSON.stringify({ type: 'relay:hello', instanceId }));
  await waitFor(() => messages.some((frame) => frame.type === 'relay:welcome'), `${instanceId} welcome`);
  return {
    socket,
    messages,
    send: (id, type = 'mcp:get-tabs') => socket.send(JSON.stringify({ id, type, payload: {} })),
    reply: (id) => messages.find((frame) => frame.id === id) || null,
    state: () => [...messages].reverse().find((frame) => frame.type === 'relay:state' || frame.type === 'relay:welcome'),
  };
}

function browserKeys(bridge) {
  return (bridge.topology.browsers || []).map((entry) => entry.key).sort().join(',');
}

async function runTwoBrowsersShareTheHub(WebSocketBridge) {
  await withTempHome('bridge-two-browsers', async () => {
    const resources = await createBridgePair(WebSocketBridge);
    try {
      const { port, hub, relay, sockets } = resources;
      const chrome = await attachBrowser(port, MULTI_CHROME_ORIGIN);
      const safari = await attachBrowser(port, MULTI_SAFARI_ORIGIN);
      sockets.push(chrome.socket, safari.socket);
      await waitFor(
        () => browserKeys(hub) === BOTH_KEYS && browserKeys(relay) === BOTH_KEYS,
        'both browsers reach the hub and relay rosters',
      );

      assertEqual(browserKeys(hub), BOTH_KEYS, 'a second browser of another kind takes its own slot');
      assertEqual(browserKeys(relay), BOTH_KEYS, 'a relay hears of every attached browser');
      assert(hub.isConnectedTo(CHROME_KEY) && hub.isConnectedTo(SAFARI_KEY), 'hub.isConnectedTo names each attached browser');
      assert(relay.isConnectedTo(CHROME_KEY) && relay.isConnectedTo(SAFARI_KEY), 'relay.isConnectedTo names each attached browser');
      assertEqual(hub.isConnectedTo('firefox'), false, 'isConnectedTo is false for a browser that is not attached');
      assert(typeof hub.topology.hubVersion === 'string' && hub.topology.hubVersion.length > 0, 'the hub reports its package version');
      assertEqual(relay.topology.hubVersion, hub.topology.hubVersion, 'and a relay learns it');
      assertEqual(hub.topology.browsers.every((entry) => entry.authorized === false), true, 'unpaired browsers are listed as not authorized');

      const toSafari = hub.sendAndWait({ type: 'mcp:get-tabs', payload: { n: 1 }, browser: SAFARI_KEY });
      await waitFor(() => safari.requests().length === 1, 'safari receives the call named for it');
      assertEqual(chrome.requests().length, 0, 'chrome is not sent a call named for safari');
      assertEqual('browser' in safari.requests()[0], false, 'the routing field is removed before a local call reaches the extension');
      assertEqual(safari.requests()[0].payload.n, 1, 'the payload arrives unchanged');
      safari.answer(safari.requests()[0].id, { success: true, from: 'safari' });
      assertEqual((await toSafari).from, 'safari', 'the call resolves with the named browser\'s answer');

      const viaRelay = relay.sendAndWait({ type: 'mcp:get-tabs', payload: { n: 2 }, browser: CHROME_KEY });
      await waitFor(() => chrome.requests().length === 1, 'chrome receives the relayed call named for it');
      assertEqual(safari.requests().length, 1, 'safari is not sent a relayed call named for chrome');
      assertEqual('browser' in chrome.requests()[0], false, 'the routing field is removed before a relayed call reaches the extension');
      chrome.answer(chrome.requests()[0].id, { success: true, from: 'chrome' });
      assertEqual((await viaRelay).from, 'chrome', 'the relayed call resolves with the named browser\'s answer');

      const inChrome = hub.sendAndWait({ type: 'mcp:read-page', payload: {}, browser: CHROME_KEY });
      const inSafari = relay.sendAndWait({ type: 'mcp:read-page', payload: {}, browser: SAFARI_KEY });
      await waitFor(
        () => chrome.requests().length === 2 && safari.requests().length === 2,
        'one call in flight in each browser',
      );
      safari.answer(safari.requests()[1].id, { success: true, from: 'safari' });
      chrome.answer(chrome.requests()[1].id, { success: true, from: 'chrome' });
      assertEqual((await inChrome).from, 'chrome', 'two agents at once: the chrome call gets chrome\'s answer');
      assertEqual((await inSafari).from, 'safari', 'two agents at once: the safari call gets safari\'s answer');
      assertEqual(hub.topology.pendingRequestCount, 0, 'nothing is left pending');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runNamedBrowserThatIsAbsent(WebSocketBridge) {
  await withTempHome('bridge-absent-browser', async () => {
    const resources = await createBridgePair(WebSocketBridge);
    try {
      const { port, hub, relay, sockets } = resources;
      const chrome = await attachBrowser(port, MULTI_CHROME_ORIGIN);
      sockets.push(chrome.socket);
      await waitFor(() => browserKeys(hub) === CHROME_KEY && browserKeys(relay) === CHROME_KEY, 'chrome alone in the roster');

      let error = null;
      try {
        await hub.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: SAFARI_KEY });
      } catch (caught) {
        error = caught;
      }
      assertEqual(error && error.code, 'BROWSER_NOT_CONNECTED', 'a call that names an absent browser is refused');
      assertEqual(error && error.browser, SAFARI_KEY, 'the error names the browser that was asked for');
      assertEqual(error && error.connectedBrowsers.join(','), CHROME_KEY, 'and the ones that are attached');
      assertEqual(hub.topology.pendingRequestCount, 0, 'no pending entry or timer is left behind');

      const relayed = await relay.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: SAFARI_KEY });
      assertEqual(relayed.code, 'BROWSER_NOT_CONNECTED', 'a relayed call that names an absent browser is refused by the hub');
      assertEqual(relayed.success, false, 'as a failure');
      assertEqual((relayed.connectedBrowsers || []).join(','), CHROME_KEY, 'that lists what is attached');

      const malformed = await relay.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: 'Safari; drop' });
      assertEqual(malformed.code, 'BROWSER_NOT_CONNECTED', 'a name that is no browser key is refused the same way');

      await sleep(30);
      assertEqual(chrome.requests().length, 0, 'none of them fell back to the browser that is attached');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runOneBrowserClosingLeavesTheOther(WebSocketBridge) {
  await withTempHome('bridge-one-closes', async () => {
    const resources = await createBridgePair(WebSocketBridge);
    try {
      const { port, hub, relay, sockets } = resources;
      const chrome = await attachBrowser(port, MULTI_CHROME_ORIGIN);
      const safari = await attachBrowser(port, MULTI_SAFARI_ORIGIN);
      sockets.push(chrome.socket, safari.socket);
      await waitFor(() => browserKeys(relay) === BOTH_KEYS, 'both browsers in the relay roster');

      let progressed = 0;
      const localChrome = hub.sendAndWait(
        { type: 'mcp:read-page', payload: {}, browser: CHROME_KEY },
        { onProgress: () => { progressed += 1; } },
      );
      const relayedChrome = relay.sendAndWait({ type: 'mcp:read-page', payload: {}, browser: CHROME_KEY });
      const localSafari = hub.sendAndWait({ type: 'mcp:read-page', payload: {}, browser: SAFARI_KEY });
      let safariError = null;
      localSafari.catch((caught) => { safariError = caught; });
      await waitFor(
        () => chrome.requests().length === 2 && safari.requests().length === 1,
        'two calls in chrome and one in safari',
      );

      safari.socket.close();
      await waitFor(() => safariError !== null, 'the safari call fails when safari goes');
      assertEqual(safariError.message, 'Extension disconnected', 'with the message the sw_evicted recovery matches');
      assertEqual(safariError.bridgeDisconnectReason, 'extension_disconnected', 'and the cause on the error');
      assertEqual(hub.topology.extensionConnected, true, 'the hub still has a browser');
      assertEqual(browserKeys(hub), CHROME_KEY, 'the roster drops only the browser that left');
      await waitFor(() => browserKeys(relay) === CHROME_KEY, 'the relay roster follows');
      assertEqual(relay.isConnected, true, 'the relay still reaches a browser');
      assertEqual(relay.isConnectedTo(SAFARI_KEY), false, 'but not the one that left');
      assertEqual(hub.topology.pendingRequestCount, 1, 'the chrome call is still pending on the hub');

      const localId = chrome.requests()[0].id;
      chrome.socket.send(JSON.stringify({ id: localId, type: 'mcp:progress', payload: { progress: 50 } }));
      await waitFor(() => progressed === 1, 'the surviving call still receives its progress');
      for (const request of chrome.requests()) chrome.answer(request.id, { success: true, from: 'chrome' });
      assertEqual((await localChrome).from, 'chrome', 'a local chrome call survives safari closing');
      assertEqual((await relayedChrome).from, 'chrome', 'a relayed chrome call survives safari closing');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runReplyFromAnotherBrowserIsIgnored(WebSocketBridge) {
  await withTempHome('bridge-wrong-browser-reply', async () => {
    const resources = await createBridgePair(WebSocketBridge);
    try {
      const { port, hub, relay, sockets } = resources;
      const chrome = await attachBrowser(port, MULTI_CHROME_ORIGIN);
      const safari = await attachBrowser(port, MULTI_SAFARI_ORIGIN);
      sockets.push(chrome.socket, safari.socket);
      await waitFor(() => browserKeys(relay) === BOTH_KEYS, 'both browsers in the relay roster');

      let progressed = 0;
      let settled = false;
      const local = hub.sendAndWait(
        { type: 'mcp:read-page', payload: {}, browser: CHROME_KEY },
        { onProgress: () => { progressed += 1; } },
      );
      local.then(() => { settled = true; }, () => { settled = true; });
      await waitFor(() => chrome.requests().length === 1, 'the call reaches chrome');
      const localId = chrome.requests()[0].id;
      safari.socket.send(JSON.stringify({ id: localId, type: 'mcp:progress', payload: { progress: 99 } }));
      safari.answer(localId, { success: true, from: 'safari' });
      await sleep(40);
      assertEqual(settled, false, 'an answer from a browser that was not asked settles nothing');
      assertEqual(progressed, 0, 'nor does its progress reach the caller');
      chrome.answer(localId, { success: true, from: 'chrome' });
      assertEqual((await local).from, 'chrome', 'the browser that was asked still answers');

      let relayedSettled = false;
      const relayed = relay.sendAndWait({ type: 'mcp:read-page', payload: {}, browser: SAFARI_KEY });
      relayed.then(() => { relayedSettled = true; }, () => { relayedSettled = true; });
      await waitFor(() => safari.requests().length === 1, 'the relayed call reaches safari');
      const relayedId = safari.requests()[0].id;
      chrome.answer(relayedId, { success: true, from: 'chrome' });
      await sleep(40);
      assertEqual(relayedSettled, false, 'a relayed call is not settled by the other browser either');
      safari.answer(relayedId, { success: true, from: 'safari' });
      assertEqual((await relayed).from, 'safari', 'and resolves with the asked browser\'s answer');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runLegacyRelayKeepsItsBrowser(WebSocketBridge) {
  await withTempHome('bridge-legacy-relay', async () => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'legacy-relay-hub',
      handshakeTimeoutMs: 100,
      legacyRelayBindingGraceMs: 150,
    });
    const resources = { sockets: [], bridges: [hub] };
    try {
      await hub.connect();
      let chrome = await attachBrowser(port, MULTI_CHROME_ORIGIN);
      const safari = await attachBrowser(port, MULTI_SAFARI_ORIGIN);
      resources.sockets.push(chrome.socket, safari.socket);
      await waitFor(() => browserKeys(hub) === BOTH_KEYS, 'both browsers attached');

      const legacy = await createLegacyRelay(port, 'legacy-relay');
      resources.sockets.push(legacy.socket);
      assertEqual(legacy.state().browsers.length, 2, 'an old relay is sent the roster too, and ignores it');

      legacy.send('legacy-1');
      await waitFor(() => chrome.requests().length === 1, 'a frame that names no browser goes to the default');
      assertEqual(safari.requests().length, 0, 'with no focus reported, the default is chrome');
      assertEqual(chrome.requests()[0].id, 'legacy-1', 'the frame arrives as the old relay sent it');
      chrome.answer('legacy-1', { success: true, from: 'chrome' });
      await waitFor(() => legacy.reply('legacy-1') !== null, 'the answer returns to the old relay');
      assertEqual(legacy.reply('legacy-1').payload.from, 'chrome', 'from the browser it was given');

      safari.socket.send(JSON.stringify({ type: 'mcp:browser-state', focusedAt: Date.now() }));
      await waitFor(
        () => hub.topology.browsers.find((entry) => entry.key === SAFARI_KEY).focusedAt !== null,
        'safari reports focus',
      );
      const beforeBoth = hub.sendAndWait({ type: 'mcp:get-tabs', payload: {} });
      await waitFor(() => chrome.requests().length === 2, 'while chrome reports no focus the default stays chrome');
      assertEqual(safari.requests().length, 0, 'a browser that reports focus does not take the default from one that reports none');
      chrome.answer(chrome.requests()[1].id, { success: true });
      await beforeBoth;

      chrome.socket.send(JSON.stringify({ type: 'mcp:browser-state', focusedAt: Date.now() - 60_000 }));
      await waitFor(
        () => hub.topology.browsers.find((entry) => entry.key === CHROME_KEY).focusedAt !== null,
        'chrome reports an older focus',
      );
      // The hub cannot tell FSB in Safari from any other Safari extension, so
      // a later focus there does not move the default off a Chromium browser.
      // An old relay staying put when the default does move is
      // runLegacyRelayStaysWhenTheDefaultMoves.
      const unnamed = inFlight(hub.sendAndWait({ type: 'mcp:get-tabs', payload: {} }));
      await waitFor(() => chrome.requests().length === 3, 'once both report, a Safari focused more recently still does not take the default from chrome');
      assertEqual(safari.requests().length, 0, 'safari is sent nothing it was not named for');
      chrome.answer(chrome.requests()[2].id, { success: true });
      await unnamed;

      legacy.send('legacy-2');
      await waitFor(() => chrome.requests().length === 4, 'the old relay stays in the browser it was given');
      assertEqual(safari.requests().length, 0, 'and nothing of it reaches safari');
      chrome.answer('legacy-2', { success: true });
      await waitFor(() => legacy.reply('legacy-2') !== null, 'second answer returns');
      assertEqual(legacy.state().extensionConnected, true, 'its state describes its own browser');
      assertEqual(legacy.state().extensionAttachment, null, 'through the single-extension fields');

      chrome.socket.close();
      await waitFor(() => browserKeys(hub) === SAFARI_KEY, 'chrome goes away');
      await waitFor(() => legacy.state().extensionConnected === false, 'the old relay is told its browser is gone');
      legacy.send('legacy-3');
      await waitFor(() => legacy.reply('legacy-3') !== null, 'a frame sent meanwhile is answered');
      assertEqual(legacy.reply('legacy-3').payload.error, 'extension_not_connected', 'as not connected, like a worker restart always was');
      assertEqual(safari.requests().length, 0, 'and is not handed to the other browser');

      chrome = await attachBrowser(port, MULTI_CHROME_ORIGIN);
      resources.sockets.push(chrome.socket);
      await waitFor(() => browserKeys(hub) === BOTH_KEYS, 'chrome comes back');
      await waitFor(() => legacy.state().extensionConnected === true, 'the old relay is told');
      legacy.send('legacy-4');
      await waitFor(() => chrome.requests().length === 1, 'and its next frame goes to chrome again');

      chrome.socket.close();
      await waitFor(() => browserKeys(hub) === SAFARI_KEY, 'chrome goes away for good');
      await waitFor(() => legacy.state().extensionConnected === false, 'the old relay is told its browser is gone');
      // A real relay from before the roster sends nothing while it is told no
      // extension is connected, so it has to be told again without asking.
      await waitFor(
        () => legacy.state().extensionConnected === true,
        'past the grace, the old relay is told a browser is connected again, unprompted',
        1000,
      );
      assertEqual(safari.requests().length, 0, 'before it has sent anything more');
      legacy.send('legacy-5');
      await waitFor(() => safari.requests().length === 1, 'and its next frame is given the browser that is left');
      assertEqual(safari.requests()[0].id, 'legacy-5', 'delivered as it was sent');
    } finally {
      await cleanup(resources);
    }
  });
}

// The default moves between Chrome profiles as the user switches between
// them. A relay that names no browser was given one, and must stay there.
async function runLegacyRelayStaysWhenTheDefaultMoves(WebSocketBridge) {
  await withTempHome('bridge-legacy-relay-default-moves', async () => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'legacy-relay-moves-hub',
      handshakeTimeoutMs: 100,
      extensionIdentifyTimeoutMs: 2000,
    });
    const resources = { sockets: [], bridges: [hub] };
    try {
      await hub.connect();
      const profileA = await attachProfile(port, INSTALL_A, { state: { focusedAt: Date.now() - 60_000 } });
      const profileB = await attachProfile(port, INSTALL_B, { state: { focusedAt: Date.now() - 120_000 } });
      resources.sockets.push(profileA.socket, profileB.socket);
      await waitFor(
        () => browserKeys(hub) === `${KEY_A},${KEY_B}` && hub.topology.browsers.every((entry) => entry.focusedAt !== null),
        'both profiles attach and report focus',
      );

      const legacy = await createLegacyRelay(port, 'legacy-relay-moves');
      resources.sockets.push(legacy.socket);
      legacy.send('moves-1');
      await waitFor(() => profileA.requests().length === 1, 'an old relay is given the profile focused last');
      profileA.answer('moves-1', { success: true });
      await waitFor(() => legacy.reply('moves-1') !== null, 'and its answer returns');

      profileB.socket.send(JSON.stringify({ type: 'mcp:browser-state', focusedAt: Date.now() }));
      await waitFor(
        () => hub.topology.browsers.find((entry) => entry.key === KEY_B).focusedAt > Date.now() - 60_000,
        'the other profile takes focus',
      );
      const unnamed = inFlight(hub.sendAndWait({ type: 'mcp:get-tabs', payload: {} }));
      await waitFor(() => profileB.requests().length === 1, 'the default moves to the profile focused last');
      profileB.answer(profileB.requests()[0].id, { success: true });
      await unnamed;

      legacy.send('moves-2');
      await waitFor(() => profileA.requests().length === 2, 'the old relay stays in the profile it was given');
      assertEqual(profileB.requests().length, 1, 'and is not moved when the default changes');
      assertEqual(profileA.requests()[1].id, 'moves-2', 'delivered as it was sent');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runPairingClosesTheOtherBrowser(WebSocketBridge, auth) {
  await withTempHome('bridge-pair-closes-other', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    const pairingCode = auth.formatPairingCode(auth.rotateBridgeSessionSecret(authPath, 30_000));
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'pair-closes-other-hub',
      handshakeTimeoutMs: 100,
    });
    const relay = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'pair-closes-other-relay',
      handshakeTimeoutMs: 100,
    });
    const resources = { sockets: [], bridges: [hub, relay] };
    try {
      await hub.connect();
      await relay.connect();
      const safari = await attachBrowser(port, MULTI_SAFARI_ORIGIN);
      resources.sockets.push(safari.socket);
      await waitFor(() => browserKeys(hub) === SAFARI_KEY, 'safari attaches unpaired while nothing is pinned');
      const pending = hub.sendAndWait({ type: 'mcp:read-page', payload: {}, browser: SAFARI_KEY });
      let pendingError = null;
      pending.catch((caught) => { pendingError = caught; });

      const safariClosed = waitForSocketClose(safari.socket, 1500);
      safariClosed.catch(() => {});
      const chrome = await attachBrowser(port, MULTI_CHROME_ORIGIN, { pairingCode });
      resources.sockets.push(chrome.socket);
      const close = await safariClosed;
      assertEqual(close.code, 1008, 'pairing chrome closes the browser that attached before the pin');
      await waitFor(() => browserKeys(hub) === CHROME_KEY, 'only the paired browser stays attached');
      assertEqual(
        auth.readBridgeAuthState(authPath).allowedExtensionOrigin,
        MULTI_CHROME_ORIGIN,
        'the pin is bound to the paired browser',
      );
      assertEqual(hub.topology.browsers[0].authorized, true, 'the roster marks it authorized');
      await waitFor(() => pendingError !== null, 'a call the closed browser was holding fails');
      assertEqual(pendingError.bridgeDisconnectReason, 'extension_origin_pin_mismatch', 'with the pin as its cause');
      const refusal = hub.refusedBrowsers.find((entry) => entry.kind === 'safari');
      assertEqual(refusal && refusal.reason, 'extension_origin_pin_mismatch', 'the hub remembers why safari is not attached');
      await waitFor(
        () => relay.topology.refusedBrowsers.some((entry) => entry.kind === 'safari'),
        'and tells its relays',
      );

      const response = await rawUpgrade(port, [`Host: 127.0.0.1:${port}`, `Origin: ${MULTI_SAFARI_ORIGIN}`]);
      assert(response.startsWith('HTTP/1.1 403'), 'a later safari upgrade is refused while the pin stands');
      assertEqual(browserKeys(hub), CHROME_KEY, 'so the outcome is the same whichever browser came first');
    } finally {
      await cleanup(resources);
    }
  });
}

// A second Safari, as another launch or another extension would connect.
const WAITING_SAFARI_ORIGIN = 'safari-web-extension://9F1E2D3C-4B5A-4697-8877-665544332211';

// A socket that upgraded before anything was pinned can still be saying which
// install it is when another browser pairs. Pairing closes the browsers that
// are attached, and a socket that is still waiting is held to the pin when it
// would become one, whether it then speaks or stays silent like an older build.
async function runPairingTurnsAwayAWaitingBrowser(WebSocketBridge, auth) {
  await withTempHome('bridge-pair-waiting', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    const pairingCode = auth.formatPairingCode(auth.rotateBridgeSessionSecret(authPath, 30_000));
    const options = { port, host: '127.0.0.1', handshakeTimeoutMs: 100, extensionIdentifyTimeoutMs: 1000 };
    const hub = new WebSocketBridge({ ...options, instanceId: 'pair-waiting-hub' });
    const relay = new WebSocketBridge({ ...options, instanceId: 'pair-waiting-relay' });
    const resources = { sockets: [], bridges: [hub, relay] };
    try {
      await hub.connect();
      await relay.connect();
      const speaking = await attachBrowser(port, MULTI_SAFARI_ORIGIN);
      const silent = await attachBrowser(port, WAITING_SAFARI_ORIGIN);
      resources.sockets.push(speaking.socket, silent.socket);
      await sleep(30);
      assertEqual(browserKeys(hub), '', 'neither safari has said which install it is, so neither is listed');

      const chrome = await attachProfile(port, INSTALL_A, { pairingCode });
      resources.sockets.push(chrome.socket);
      await waitFor(() => browserKeys(hub) === KEY_A, 'the paired chrome attaches while both are still waiting');
      assertEqual(
        auth.readBridgeAuthState(authPath).allowedExtensionOrigin,
        PROFILE_ORIGIN,
        'and binds the pin',
      );

      const speakingClosed = waitForSocketClose(speaking.socket, 1500);
      speakingClosed.catch(() => {});
      const silentClosed = waitForSocketClose(silent.socket, 2500);
      silentClosed.catch(() => {});
      speaking.socket.send(JSON.stringify({
        type: 'mcp:extension-state',
        extensionId: 'com.fullselfbrowsing.fsb.Extension (UNSIGNED)',
        extensionVersion: '0.9.95',
        installInstanceId: 'b3f6f5c2-9d0e-4f0b-8a53-0d3a2f1c9e77',
        normalWindowCount: 1,
        connectedAt: null,
      }));
      assertEqual((await speakingClosed).code, 1008, 'a safari that says which install it is once the pin is bound is turned away');
      assertEqual((await silentClosed).code, 1008, 'and so is one that never says, once its wait is over');
      assertEqual(browserKeys(hub), KEY_A, 'only the paired browser is attached');
      const refusal = hub.refusedBrowsers.find((entry) => entry.kind === 'safari');
      assertEqual(refusal && refusal.reason, 'extension_origin_pin_mismatch', 'with the pin as the reason');
      await waitFor(
        () => relay.topology.refusedBrowsers.some((entry) => entry.kind === 'safari'
          && entry.reason === 'extension_origin_pin_mismatch'),
        'and its relays are told',
      );
    } finally {
      await cleanup(resources);
    }
  });
}

async function runSafariIdentityAndFocus(WebSocketBridge) {
  await withTempHome('bridge-safari-identity', async () => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'safari-identity-hub',
      handshakeTimeoutMs: 100,
    });
    const resources = { sockets: [], bridges: [hub] };
    const entry = (key) => hub.topology.browsers.find((browser) => browser.key === key);
    const state = (overrides) => JSON.stringify({
      type: 'mcp:extension-state',
      extensionVersion: '0.9.95',
      installInstanceId: 'b3f6f5c2-9d0e-4f0b-8a53-0d3a2f1c9e77',
      normalWindowCount: 1,
      connectedAt: null,
      ...overrides,
    });
    try {
      await hub.connect();
      let safari = await attachBrowser(port, MULTI_SAFARI_ORIGIN);
      const chrome = await attachBrowser(port, MULTI_CHROME_ORIGIN);
      resources.sockets.push(safari.socket, chrome.socket);
      await waitFor(() => browserKeys(hub) === BOTH_KEYS, 'both browsers attached');

      const safariId = 'com.fullselfbrowsing.fsb.Extension (UNSIGNED)';
      safari.socket.send(state({ extensionId: safariId, focusedAt: 1000 }));
      await waitFor(() => entry(SAFARI_KEY).extensionVersion === '0.9.95', 'safari\'s identity frame is accepted');
      assertEqual(entry(SAFARI_KEY).installInstanceId, 'b3f6f5c2-9d0e-4f0b-8a53-0d3a2f1c9e77', 'with its install id, the key for profiles later');
      assertEqual(entry(SAFARI_KEY).focusedAt, 1000, 'and the focus time it carries');
      assertEqual(hub.topology.extensionAttachment, null, 'with chrome reporting no focus, chrome stays the default the old fields describe');

      chrome.socket.send(state({ extensionId: safariId }));
      chrome.socket.send(state({ extensionId: 'abcdefghijklmnopabcdefghijklmnop', extensionVersion: '0.9.90' }));
      await waitFor(() => entry(CHROME_KEY).extensionVersion === '0.9.90', 'chrome\'s identity frame is accepted');
      assertEqual(entry(CHROME_KEY).focusedAt, null, 'a browser that reports no focus has none');
      assertEqual(hub.topology.extensionAttachment.extensionVersion, '0.9.90', 'and the old fields carry chrome\'s identity');

      safari.socket.send(state({ extensionId: 'not a bundle id!' }));
      await sleep(30);
      assertEqual(entry(SAFARI_KEY).extensionVersion, '0.9.95', 'a malformed safari id leaves the slot as it was');

      await sleep(120);
      const future = Date.now() + 10 * 60_000;
      safari.socket.send(JSON.stringify({ type: 'mcp:browser-state', focusedAt: future }));
      await waitFor(() => entry(SAFARI_KEY).focusedAt > 1000, 'a focus report moves the time forward');
      assert(entry(SAFARI_KEY).focusedAt <= Date.now(), 'a focus time in the future is held to now');

      const held = entry(SAFARI_KEY).focusedAt;
      safari.socket.send(JSON.stringify({ type: 'mcp:browser-state', focusedAt: 'now' }));
      safari.socket.send(JSON.stringify({ type: 'mcp:browser-state', focusedAt: 5 }));
      await sleep(40);
      assertEqual(entry(SAFARI_KEY).focusedAt, held, 'a malformed or older report changes nothing');

      await sleep(120);
      chrome.socket.send(JSON.stringify({ type: 'mcp:browser-state', focusedAt: Date.now() }));
      chrome.socket.send(JSON.stringify({ type: 'mcp:browser-state', focusedAt: Date.now() + 1 }));
      await waitFor(() => entry(CHROME_KEY).focusedAt !== null, 'chrome reports focus');
      const first = entry(CHROME_KEY).focusedAt;
      await sleep(40);
      assertEqual(entry(CHROME_KEY).focusedAt, first, 'a second report inside the rate limit is dropped');
      const unnamed = hub.sendAndWait({ type: 'mcp:get-tabs', payload: {} });
      await waitFor(() => chrome.requests().length === 1, 'chrome is the default');
      chrome.answer(chrome.requests()[0].id, { success: true });
      await unnamed;

      safari.socket.close();
      await waitFor(() => browserKeys(hub) === CHROME_KEY, 'safari\'s worker goes away');
      safari = await attachBrowser(port, MULTI_SAFARI_ORIGIN);
      resources.sockets.push(safari.socket);
      await waitFor(() => browserKeys(hub) === BOTH_KEYS, 'and comes back');
      assertEqual(entry(SAFARI_KEY).focusedAt, held, 'its last focus still stands until it reports again');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runEachBrowserHasItsOwnReaper(WebSocketBridge) {
  await withTempHome('bridge-per-browser-reaper', async () => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'per-browser-reaper-hub',
      handshakeTimeoutMs: 100,
      extensionPingIntervalMs: 30,
      extensionHeartbeatTimeoutMs: 60_000,
    });
    const resources = { sockets: [], bridges: [hub] };
    try {
      await hub.connect();
      const safari = await attachBrowser(port, MULTI_SAFARI_ORIGIN);
      let safariPings = 0;
      safari.socket.on('ping', () => { safariPings += 1; });
      // Registered second: its registration must not stop safari's timer.
      const chrome = await attachBrowser(port, MULTI_CHROME_ORIGIN, { autoPong: false });
      resources.sockets.push(safari.socket, chrome.socket);
      await waitFor(() => browserKeys(hub) === BOTH_KEYS, 'both browsers attached');

      await waitFor(() => !hub.isConnectedTo(CHROME_KEY), 'the browser that stops answering pings is reaped', 4000);
      assertEqual(hub.isConnectedTo(SAFARI_KEY), true, 'the browser that answers keeps its slot');
      assertEqual(hub.topology.lastDisconnectReason, 'extension_reaped_pong_timeout', 'the reaper names its cause');
      const before = safariPings;
      await sleep(150);
      assert(safariPings > before, 'and the surviving browser is still being pinged: its timer was not stopped with the other one');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runPromotedRelayStartsWithNoRoster(WebSocketBridge) {
  await withTempHome('bridge-promoted-roster', async () => {
    const resources = await createBridgePair(WebSocketBridge);
    try {
      const { port, hub, relay, sockets } = resources;
      const chrome = await attachBrowser(port, MULTI_CHROME_ORIGIN);
      const safari = await attachBrowser(port, MULTI_SAFARI_ORIGIN);
      sockets.push(chrome.socket, safari.socket);
      await waitFor(() => browserKeys(relay) === BOTH_KEYS, 'the relay holds the hub\'s roster');

      // A request the old hub is holding fails when it goes away. What the
      // relay reports at that moment is what a call queued behind it is routed
      // with, before any new hub answers.
      const held = relay.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: CHROME_KEY });
      await waitFor(() => chrome.requests().length === 1, 'the hub hands a request to chrome');
      const atLoss = held.then(
        () => null,
        () => ({ roster: relay.browserRoster, connected: relay.isConnected }),
      );

      hub.disconnect();
      const gap = await atLoss;
      assertEqual(gap && gap.roster, null, 'when the hub goes away, the relay has no roster while it fails the requests it held');
      assertEqual(gap && gap.connected, false, 'and is not connected: a call queued then is refused, not taken for one through an older hub');
      await waitFor(() => relay.currentMode === 'hub', 'the relay is promoted', 2000);
      assertEqual(browserKeys(relay), '', 'a promoted relay does not inherit the old hub\'s roster');
      assertEqual(relay.isConnected, false, 'and is not connected until a browser reaches it');

      const again = await attachBrowser(port, MULTI_SAFARI_ORIGIN);
      sockets.push(again.socket);
      await waitFor(() => browserKeys(relay) === SAFARI_KEY, 'a browser that reconnects to the new hub is listed');
      const call = relay.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: SAFARI_KEY });
      await waitFor(() => again.requests().length === 1, 'and can be named at once');
      again.answer(again.requests()[0].id, { success: true });
      await call;
    } finally {
      await cleanup(resources);
    }
  });
}

// ---------------------------------------------------------------------------
// One browser per install. Two profiles of one extension connect with the same
// Origin, and each says which install it is in its first state frame. Those
// two facts together are what a slot is keyed on.
// ---------------------------------------------------------------------------

const PROFILE_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const INSTALL_A = '4187c196-3c4b-4778-b904-a7ad83023d2e';
const INSTALL_B = '9a0c11d2-0f6e-4d1c-8a53-0d3a2f1c9e77';
const KEY_A = 'chrome-4187c196';
const KEY_B = 'chrome-9a0c11d2';

function installState(installInstanceId, overrides = {}) {
  return JSON.stringify({
    type: 'mcp:extension-state',
    extensionId: 'abcdefghijklmnopabcdefghijklmnop',
    extensionVersion: '0.9.95',
    installInstanceId,
    normalWindowCount: 1,
    connectedAt: null,
    ...overrides,
  });
}

// An extension as every build since 0.9.92 behaves: it opens its socket and
// says which install it is.
async function attachProfile(port, installInstanceId, options = {}) {
  const { state, origin = PROFILE_ORIGIN, ...socketOptions } = options;
  const profile = await attachBrowser(port, origin, socketOptions);
  profile.socket.send(installState(installInstanceId, state));
  return profile;
}

async function runTwoProfilesOfOneExtension(WebSocketBridge) {
  await withTempHome('bridge-two-profiles', async () => {
    const port = await getFreePort();
    const options = { port, host: '127.0.0.1', handshakeTimeoutMs: 100, extensionIdentifyTimeoutMs: 2000 };
    const hub = new WebSocketBridge({ ...options, instanceId: 'two-profiles-hub' });
    const relay = new WebSocketBridge({ ...options, instanceId: 'two-profiles-relay' });
    const resources = { sockets: [], bridges: [hub, relay] };
    const entry = (key) => hub.topology.browsers.find((browser) => browser.key === key);
    try {
      await hub.connect();
      await relay.connect();
      let profileA = await attachProfile(port, INSTALL_A);
      const profileB = await attachProfile(port, INSTALL_B, { state: { normalWindowCount: 3, extensionVersion: '0.9.92' } });
      resources.sockets.push(profileA.socket, profileB.socket);
      await waitFor(
        () => browserKeys(hub) === `${KEY_A},${KEY_B}` && browserKeys(relay) === `${KEY_A},${KEY_B}`,
        'both profiles reach the hub and relay rosters',
      );

      assertEqual(entry(KEY_A).kind, 'chrome', 'a profile is a Chromium browser');
      assertEqual(entry(KEY_A).extensionId, 'abcdefghijklmnopabcdefghijklmnop', 'listed with the extension its Origin names');
      assertEqual(entry(KEY_A).installInstanceId, INSTALL_A, 'and the install it said it is');
      assertEqual(entry(KEY_B).windows, 3, 'each profile reports its own windows');
      assertEqual(entry(KEY_B).extensionVersion, '0.9.92', 'and its own extension version');
      assertEqual(relay.topology.browsers.find((browser) => browser.key === KEY_B).windows, 3, 'a relay hears the same');
      assertEqual(hub.refusedBrowsers.length, 0, 'neither profile was turned away');

      const inA = hub.sendAndWait({ type: 'mcp:read-page', payload: {}, browser: KEY_A });
      const inB = relay.sendAndWait({ type: 'mcp:read-page', payload: {}, browser: KEY_B });
      let errorA = null;
      inA.catch((caught) => { errorA = caught; });
      await waitFor(
        () => profileA.requests().length === 1 && profileB.requests().length === 1,
        'two agents at once: one call in each profile',
      );

      profileA.socket.close();
      await waitFor(() => errorA !== null, 'the call in the profile that closed fails');
      assertEqual(errorA.message, 'Extension disconnected', 'with the message the sw_evicted recovery matches');
      assertEqual(browserKeys(hub), KEY_B, 'the roster drops only that profile');
      profileB.answer(profileB.requests()[0].id, { success: true, from: 'b' });
      assertEqual((await inB).from, 'b', 'the call in the other profile is untouched');

      const gone = await relay.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: KEY_A });
      assertEqual(gone.code, 'BROWSER_NOT_CONNECTED', 'a call for the profile that is away is refused');
      assertEqual(profileB.requests().length, 1, 'and not handed to the profile that is still here');

      profileA = await attachProfile(port, INSTALL_A);
      resources.sockets.push(profileA.socket);
      await waitFor(() => browserKeys(hub) === `${KEY_A},${KEY_B}`, 'the profile comes back under the same key');
      const again = hub.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: KEY_A });
      await waitFor(() => profileA.requests().length === 1, 'and a call for it reaches its new socket');
      profileA.answer(profileA.requests()[0].id, { success: true });
      await again;

      // A second socket that says it is a profile already attached: the same
      // extension in the same profile, so the incumbent keeps its slot.
      const twin = await attachProfile(port, INSTALL_B);
      resources.sockets.push(twin.socket);
      const twinClose = await waitForSocketClose(twin.socket);
      assertEqual(twinClose.code, 1008, 'an unpaired second socket of one install is refused');
      assertEqual(browserKeys(hub), `${KEY_A},${KEY_B}`, 'and the roster is unchanged');
      const stillB = hub.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: KEY_B });
      await waitFor(() => profileB.requests().length === 2, 'the incumbent socket still receives its calls');
      profileB.answer(profileB.requests()[1].id, { success: true });
      await stillB;
      assertEqual(hub.topology.pendingRequestCount, 0, 'nothing is left pending');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runInstallIdentification(WebSocketBridge) {
  await withTempHome('bridge-identification', async () => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'identification-hub',
      handshakeTimeoutMs: 100,
      extensionIdentifyTimeoutMs: 250,
    });
    const resources = { sockets: [], bridges: [hub] };
    const entry = (key) => hub.topology.browsers.find((browser) => browser.key === key);
    const legacyKey = 'chrome-legacy-abcdefgh';
    try {
      await hub.connect();

      // A socket that hangs up before it is named leaves nothing behind.
      const quitter = await attachBrowser(port, PROFILE_ORIGIN);
      quitter.socket.close();
      await waitForSocketClose(quitter.socket).catch(() => {});
      await sleep(30);
      assertEqual(hub.pendingExtensions.size, 0, 'a socket that closes unnamed is forgotten');

      const quiet = await attachBrowser(port, PROFILE_ORIGIN);
      resources.sockets.push(quiet.socket);
      // Not a state frame the hub accepts, so it names nothing.
      quiet.socket.send(installState(INSTALL_A, { extensionVersion: 7 }));
      await sleep(60);
      assertEqual(hub.topology.extensionConnected, false, 'a socket that has not said which install it is is not a browser yet');
      assertEqual(browserKeys(hub), '', 'and no roster lists it');
      let early = null;
      try {
        await hub.sendAndWait({ type: 'mcp:get-tabs', payload: {} });
      } catch (caught) {
        early = caught;
      }
      assert(early instanceof Error, 'a call made meanwhile is refused as not connected');
      assertEqual(quiet.requests().length, 0, 'and nothing is sent to the unnamed socket');

      // A profile that does say is attached at once, without waiting for the other.
      const named = await attachProfile(port, INSTALL_B);
      resources.sockets.push(named.socket);
      await waitFor(() => browserKeys(hub) === KEY_B, 'a socket that names its install is attached straight away', 200);

      await waitFor(() => browserKeys(hub) === `${KEY_B},${legacyKey}`, 'the quiet socket is attached once its time is up', 1500);
      assertEqual(entry(legacyKey).installInstanceId, null, 'as a build that never says which install it is');
      assertEqual(entry(legacyKey).extensionId, 'abcdefghijklmnopabcdefghijklmnop', 'named after its extension');

      quiet.socket.send(installState(INSTALL_A, { extensionVersion: '0.9.99' }));
      await waitFor(() => entry(legacyKey) && entry(legacyKey).extensionVersion === '0.9.99', 'a late state frame is still shown');
      assertEqual(browserKeys(hub), `${KEY_B},${legacyKey}`, 'but a slot keeps the key it was attached under');

      const toQuiet = hub.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: legacyKey });
      await waitFor(() => quiet.requests().length === 1, 'and it can be named like any other');
      quiet.answer(quiet.requests()[0].id, { success: true });
      await toQuiet;

      // Another profile of that old build cannot be told from the first.
      const quietTwin = await attachBrowser(port, PROFILE_ORIGIN);
      resources.sockets.push(quietTwin.socket);
      const twinClose = await waitForSocketClose(quietTwin.socket, 1500);
      assertEqual(twinClose.code, 1008, 'a second profile of a build that never says is refused, as it always was');
      assertEqual(browserKeys(hub), `${KEY_B},${legacyKey}`, 'leaving both attached browsers in place');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runInstallKeysStayApart(WebSocketBridge) {
  await withTempHome('bridge-install-keys', async () => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'install-keys-hub',
      handshakeTimeoutMs: 100,
      extensionIdentifyTimeoutMs: 2000,
    });
    const resources = { sockets: [], bridges: [hub] };
    const first = 'aaaaaaaa-1111-4000-8000-000000000001';
    const second = 'aaaaaaaa-2222-4000-8000-000000000002';
    try {
      await hub.connect();
      let one = await attachProfile(port, first);
      resources.sockets.push(one.socket);
      await waitFor(() => browserKeys(hub) === 'chrome-aaaaaaaa', 'the first install takes the short key');

      const two = await attachProfile(port, second);
      resources.sockets.push(two.socket);
      await waitFor(
        () => browserKeys(hub) === 'chrome-aaaaaaaa,chrome-aaaaaaaa2222',
        'an install whose id starts the same way is given a longer key',
      );

      one.socket.close();
      await waitFor(() => browserKeys(hub) === 'chrome-aaaaaaaa2222', 'the first install goes away');
      one = await attachProfile(port, first);
      resources.sockets.push(one.socket);
      await waitFor(
        () => browserKeys(hub) === 'chrome-aaaaaaaa,chrome-aaaaaaaa2222',
        'and gets its own key back, whichever of them is attached at the time',
      );

      // The same install id from another extension is another install. It can
      // attach only once this extension has left, and a key stays with the
      // install it was given to, so sessions that hold it are never sent here.
      one.socket.close();
      two.socket.close();
      await waitFor(() => browserKeys(hub) === '', 'both installs go away');
      const other = await attachProfile(port, first, { origin: 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba' });
      resources.sockets.push(other.socket);
      await waitFor(() => hub.topology.browsers.length === 1, 'another extension that claims the first install id attaches');
      assertEqual(
        hub.isConnectedTo('chrome-aaaaaaaa'),
        false,
        'and is not given the key that install was known by',
      );
      assertEqual(browserKeys(hub), 'chrome-aaaaaaaa1111', 'it takes the next one that was never anyone else\'s');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runPairedSocketReplacesItsOwnInstall(WebSocketBridge, auth) {
  await withTempHome('bridge-paired-replaces-install', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    let state = auth.rotateBridgeSessionSecret(authPath, 31_000);
    state = auth.bindAllowedExtensionOrigin(PROFILE_ORIGIN, authPath);
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'paired-replaces-hub',
      handshakeTimeoutMs: 100,
      extensionIdentifyTimeoutMs: 2000,
    });
    const resources = { sockets: [], bridges: [hub] };
    const entry = (key) => hub.topology.browsers.find((browser) => browser.key === key);
    try {
      await hub.connect();
      const profileA = await attachProfile(port, INSTALL_A);
      const profileB = await attachProfile(port, INSTALL_B);
      resources.sockets.push(profileA.socket, profileB.socket);
      await waitFor(() => browserKeys(hub) === `${KEY_A},${KEY_B}`, 'two unpaired profiles of the pinned extension attach');
      assertEqual(entry(KEY_A).authorized, false, 'neither is paired yet');

      const oldClosed = waitForSocketClose(profileA.socket, 1500);
      const paired = await attachProfile(port, INSTALL_A, { pairingCode: auth.formatPairingCode(state) });
      resources.sockets.push(paired.socket);
      await oldClosed;
      await waitFor(() => entry(KEY_A) && entry(KEY_A).authorized === true, 'a paired socket takes over its own install');
      assertEqual(browserKeys(hub), `${KEY_A},${KEY_B}`, 'under the same key');
      assertEqual(profileB.socket.readyState, WebSocket.OPEN, 'the other profile keeps its socket');
      assertEqual(entry(KEY_B).authorized, false, 'and is not paired by its neighbour pairing');

      const toA = hub.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: KEY_A });
      await waitFor(() => paired.requests().length === 1, 'calls for the install go to the socket that took over');
      assertEqual(profileA.requests().length, 0, 'not to the one it replaced');
      paired.answer(paired.requests()[0].id, { success: true });
      await toA;
    } finally {
      await cleanup(resources);
    }
  });
}

async function runExtRequestCarriesItsBrowser(WebSocketBridge, auth) {
  await withTempHome('bridge-ext-request-browser', async (home) => {
    const authPath = auth.getBridgeAuthPath(home);
    let state = auth.rotateBridgeSessionSecret(authPath, 32_000);
    state = auth.bindAllowedExtensionOrigin(PROFILE_ORIGIN, authPath);
    const pairingCode = auth.formatPairingCode(state);

    // The hub runs the handler itself.
    {
      const port = await getFreePort();
      const seen = [];
      const hub = new WebSocketBridge({
        port,
        host: '127.0.0.1',
        instanceId: 'ext-browser-local-hub',
        handshakeTimeoutMs: 100,
        extensionIdentifyTimeoutMs: 2000,
        capabilities: ['agent-spawn'],
        handleExtRequest: async (request, _emit, context) => {
          seen.push({ id: request.id, browser: context.browser });
          return { ok: true };
        },
      });
      const resources = { sockets: [], bridges: [hub] };
      try {
        await hub.connect();
        const profileA = await attachProfile(port, INSTALL_A, { pairingCode });
        const profileB = await attachProfile(port, INSTALL_B, { pairingCode });
        resources.sockets.push(profileA.socket, profileB.socket);
        await waitFor(() => browserKeys(hub) === `${KEY_A},${KEY_B}`, 'two paired profiles attach');

        profileB.socket.send(JSON.stringify({ id: 'from-b', type: 'ext:request', method: 'delegate.status', payload: {} }));
        profileA.socket.send(JSON.stringify({ id: 'from-a', type: 'ext:request', method: 'delegate.status', payload: {} }));
        await waitFor(() => seen.length === 2, 'both requests reach the local handler');
        assertEqual(seen.find((call) => call.id === 'from-b').browser, KEY_B, 'the handler is told which profile a request came from');
        assertEqual(seen.find((call) => call.id === 'from-a').browser, KEY_A, 'for each profile separately');
      } finally {
        await cleanup(resources);
      }
    }

    // The hub hands the request to a relay that can run it.
    {
      const port = await getFreePort();
      const seen = [];
      const hub = new WebSocketBridge({
        port,
        host: '127.0.0.1',
        instanceId: 'ext-browser-hub',
        handshakeTimeoutMs: 100,
        extensionIdentifyTimeoutMs: 2000,
      });
      const relay = new WebSocketBridge({
        port,
        host: '127.0.0.1',
        instanceId: 'ext-browser-relay',
        handshakeTimeoutMs: 100,
        capabilities: ['agent-spawn'],
        handleExtRequest: async (request, _emit, context) => {
          seen.push({ id: request.id, browser: context.browser });
          return { ok: true };
        },
      });
      const resources = { sockets: [], bridges: [hub, relay] };
      try {
        await hub.connect();
        await relay.connect();
        // A relay from before the roster, to see exactly what a relay is sent.
        const watcher = await createOriginlessSocket(port);
        resources.sockets.push(watcher);
        const profileA = await attachProfile(port, INSTALL_A, { pairingCode });
        const profileB = await attachProfile(port, INSTALL_B, { pairingCode });
        resources.sockets.push(profileA.socket, profileB.socket);
        const replies = collectSocketMessages(profileB.socket);
        await waitFor(() => browserKeys(relay) === `${KEY_A},${KEY_B}`, 'the relay hears of both profiles');

        profileB.socket.send(JSON.stringify({ id: 'relayed-from-b', type: 'ext:request', method: 'delegate.status', payload: {} }));
        await waitFor(() => seen.length === 1, 'the request reaches the relay\'s handler');
        assertEqual(seen[0].browser, KEY_B, 'with the profile it came from');
        await waitFor(() => replies.some((frame) => frame.id === 'relayed-from-b'), 'and its answer returns to that profile');
        assertEqual(relay.relayExtRoutes.size, 0, 'the relay keeps the route no longer than the request');

        const stray = { type: 'relay:ext-route', requestId: 'never-sent', browser: 'Not A Key' };
        relay._noteRelayExtRoute(stray);
        assertEqual(relay.relayExtRoutes.size, 0, 'a route that names no browser key is dropped');
      } finally {
        await cleanup(resources);
      }
    }
  });
}

async function runDefaultSurvivesAWorkerRestart(WebSocketBridge) {
  await withTempHome('bridge-default-survives-restart', async () => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'default-restart-hub',
      handshakeTimeoutMs: 100,
      extensionIdentifyTimeoutMs: 2000,
    });
    const resources = { sockets: [], bridges: [hub] };
    const unnamed = async (profile, label) => {
      const before = profile.requests().length;
      const call = hub.sendAndWait({ type: 'mcp:get-tabs', payload: {} });
      await waitFor(() => profile.requests().length === before + 1, label);
      profile.answer(profile.requests()[before].id, { success: true });
      await call;
    };
    try {
      await hub.connect();
      // The later id sorts first, so the order below is not an accident of the keys.
      let main = await attachProfile(port, INSTALL_B);
      resources.sockets.push(main.socket);
      await waitFor(() => browserKeys(hub) === KEY_B, 'the profile opened first attaches');
      await sleep(15);
      const second = await attachProfile(port, INSTALL_A);
      resources.sockets.push(second.socket);
      await waitFor(() => browserKeys(hub) === `${KEY_A},${KEY_B}`, 'a second profile attaches');
      await unnamed(main, 'with no focus reported, a call that names none goes to the profile attached longest');

      main.socket.close();
      await waitFor(() => browserKeys(hub) === KEY_A, 'that profile\'s worker restarts');
      main = await attachProfile(port, INSTALL_B);
      resources.sockets.push(main.socket);
      await waitFor(() => browserKeys(hub) === `${KEY_A},${KEY_B}`, 'and reconnects');
      await unnamed(main, 'the default is still the profile that was here first');

      second.socket.send(installState(INSTALL_A, { normalWindowCount: 2 }));
      main.socket.send(installState(INSTALL_B, { normalWindowCount: 0 }));
      await waitFor(
        () => hub.topology.browsers.find((browser) => browser.key === KEY_B).windows === 0,
        'the first profile closes its last window',
      );
      await unnamed(second, 'a profile with no window gives the default to one that has a window');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runBrowserLimit(WebSocketBridge) {
  await withTempHome('bridge-browser-limit', async () => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'browser-limit-hub',
      handshakeTimeoutMs: 100,
      extensionIdentifyTimeoutMs: 2000,
    });
    const resources = { sockets: [], bridges: [hub] };
    const installOf = (index) => `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`;
    try {
      await hub.connect();
      for (let index = 0; index < 16; index += 1) {
        resources.sockets.push((await attachProfile(port, installOf(index))).socket);
      }
      await waitFor(() => hub.topology.browsers.length === 16, 'sixteen profiles of one extension attach');
      const extra = await attachProfile(port, installOf(16));
      resources.sockets.push(extra.socket);
      const close = await waitForSocketClose(extra.socket);
      assertEqual(close.code, 1008, 'one more is turned away');
      assertEqual(hub.topology.browsers.length, 16, 'and the roster is unchanged');
      const refusal = hub.refusedBrowsers.find((entry) => entry.extensionId === 'abcdefghijklmnopabcdefghijklmnop');
      assertEqual(refusal && refusal.reason, 'browser_limit_reached', 'with the reason kept for status and list_browsers');
    } finally {
      await cleanup(resources);
    }
  });
}

// The extension's own code, not a stand-in: ws/mcp-bridge-client.js and
// background.js's getMcpAttachmentMetadata, run once per profile. Two profiles
// are two storage areas under one extension id, which is exactly what the hub
// has to tell apart.
function startRealExtension(port, profileStorage, label) {
  const background = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');
  const start = background.indexOf('let mcpInstallInstanceIdPromise = null;');
  const end = background.indexOf('async function collectMcpDiagnosticsSnapshot()');
  if (start === -1 || end <= start) throw new Error('getMcpAttachmentMetadata was not found in background.js');

  const chrome = smoke.createChromeMock({ local: profileStorage.local, session: smoke.createStorageArea() });
  chrome.runtime.id = 'abcdefghijklmnopabcdefghijklmnop';
  chrome.runtime.getManifest = () => ({ version: '0.9.95' });
  chrome.windows = {
    getAll: async () => profileStorage.windows.map((id) => ({ id })),
    getLastFocused: async () => ({ focused: false }),
  };
  const worker = { chrome, crypto: crypto.webcrypto, Promise };
  vm.runInNewContext(
    `${background.slice(start, end)}\nthis.getMcpAttachmentMetadata = getMcpAttachmentMetadata;`,
    worker,
    { filename: 'background.js' },
  );
  const harness = smoke.buildClientHarness({
    chrome,
    bridgeUrl: `ws://127.0.0.1:${port}`,
    reconnectBaseMs: 20,
    reconnectMaxMs: 40,
    globals: { getMcpAttachmentMetadata: worker.getMcpAttachmentMetadata },
    dispatchMcpMessageRoute: async () => ({ success: true, from: label }),
  });
  // background.js does this once its dispatcher is loaded.
  harness.exports.mcpBridgeClient.setInboundAuthorityReady(true);
  harness.exports.mcpBridgeClient.connect();
  return harness.exports.mcpBridgeClient;
}

async function runRealExtensionInTwoProfiles(WebSocketBridge) {
  await withTempHome('bridge-real-extension-profiles', async () => {
    const port = await getFreePort();
    // The shipped default: the hub waits for each socket to name its install.
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'real-profiles-hub',
      handshakeTimeoutMs: 100,
      extensionIdentifyTimeoutMs: undefined,
    });
    const resources = { sockets: [], bridges: [hub] };
    const clients = [];
    const work = { local: smoke.createStorageArea(), windows: [1] };
    const home = { local: smoke.createStorageArea(), windows: [1, 2, 3] };
    const installOf = async (profile) => (await profile.local.get('mcpInstallInstanceId')).mcpInstallInstanceId;
    const keyOf = (installId) => `chrome-${installId.replace(/-/g, '').slice(0, 8)}`;
    try {
      await hub.connect();
      const started = Date.now();
      clients.push(startRealExtension(port, work, 'work'), startRealExtension(port, home, 'home'));
      await waitFor(() => hub.topology.browsers.length === 2, 'the extension attaches from both profiles');
      const elapsed = Date.now() - started;
      assert(elapsed < 1000, `both are named by their own state frame, without waiting out the allowance for older builds (took ${elapsed}ms)`);

      const workInstall = await installOf(work);
      const homeInstall = await installOf(home);
      assert(/^[0-9a-f-]{36}$/.test(workInstall) && workInstall !== homeInstall, 'each profile made its own install id and kept it in its own storage');
      const workKey = keyOf(workInstall);
      const homeKey = keyOf(homeInstall);
      assertEqual(browserKeys(hub), [workKey, homeKey].sort().join(','), 'each profile is a browser named after its install id');
      const entry = (key) => hub.topology.browsers.find((browser) => browser.key === key);
      assertEqual(entry(homeKey).windows, 3, 'with the windows it reported');
      assertEqual(entry(workKey).extensionVersion, '0.9.95', 'and its extension version');
      assertEqual(entry(workKey).extensionId, 'abcdefghijklmnopabcdefghijklmnop', 'both under the one extension id');
      assertEqual(hub.refusedBrowsers.length, 0, 'and neither was refused, as the second profile always was before');

      const fromHome = await hub.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: homeKey });
      assertEqual(fromHome.from, 'home', 'a call for one profile is answered by that profile\'s extension');
      const fromWork = await hub.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: workKey });
      assertEqual(fromWork.from, 'work', 'and a call for the other by the other');

      // A service worker restart: the same storage, a new worker and socket.
      clients[0].disconnect();
      await waitFor(() => browserKeys(hub) === homeKey, 'one profile\'s worker goes away');
      clients.push(startRealExtension(port, work, 'work-restarted'));
      await waitFor(() => hub.topology.browsers.length === 2, 'and comes back');
      assertEqual(await installOf(work), workInstall, 'a restarted worker reads the install id its profile already had');
      assert(hub.isConnectedTo(workKey), 'so the profile returns under the same name');
      const afterRestart = await hub.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: workKey });
      assertEqual(afterRestart.from, 'work-restarted', 'and calls for it reach the new worker');
    } finally {
      for (const client of clients) {
        try { client.disconnect(); } catch (_error) { /* already gone */ }
      }
      await cleanup(resources);
    }
  });
}

async function runOneExtensionAtATime(WebSocketBridge, auth) {
  await withTempHome('bridge-one-extension', async (home) => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'one-extension-hub',
      handshakeTimeoutMs: 100,
      extensionIdentifyTimeoutMs: 2000,
    });
    const resources = { sockets: [], bridges: [hub] };
    const otherOrigin = 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba';
    const otherInstall = 'c0ffee00-1111-4000-8000-000000000001';
    try {
      await hub.connect();
      const fsb = await attachProfile(port, INSTALL_A);
      resources.sockets.push(fsb.socket);
      await waitFor(() => browserKeys(hub) === KEY_A, 'the extension attaches');

      // Any extension in the browser can open this socket and say it is an
      // install. It must not be able to sit beside the real one and be handed
      // the calls that name no browser.
      const stranger = await attachProfile(port, otherInstall, { origin: otherOrigin, state: { focusedAt: Date.now() } });
      resources.sockets.push(stranger.socket);
      const close = await waitForSocketClose(stranger.socket);
      assertEqual(close.code, 1008, 'a second extension id is turned away while the first is attached');
      assertEqual(browserKeys(hub), KEY_A, 'and is not listed');
      const refusal = hub.refusedBrowsers.find((entry) => entry.extensionId === 'ponmlkjihgfedcbaponmlkjihgfedcba');
      assertEqual(refusal && refusal.reason, 'another_extension_attached', 'with the reason kept for status and list_browsers');
      const unnamed = hub.sendAndWait({ type: 'mcp:get-tabs', payload: {} });
      await waitFor(() => fsb.requests().length === 1, 'a call that names no browser still goes to the extension that was here');
      fsb.answer(fsb.requests()[0].id, { success: true });
      await unnamed;

      const second = await attachProfile(port, INSTALL_B);
      resources.sockets.push(second.socket);
      await waitFor(() => browserKeys(hub) === `${KEY_A},${KEY_B}`, 'another profile of the same extension is still welcome');

      const safari = await attachBrowser(port, MULTI_SAFARI_ORIGIN);
      resources.sockets.push(safari.socket);
      safari.socket.send(installState('b3f6f5c2-9d0e-4f0b-8a53-0d3a2f1c9e77', {
        extensionId: 'com.fullselfbrowsing.fsb.Extension (UNSIGNED)',
      }));
      await waitFor(() => hub.isConnectedTo('safari-b3f6f5c2'), 'and so is Safari, which is another kind');

      // A Safari Origin is random and its frames say what they like, so the
      // hub cannot tell FSB in Safari from any other Safari extension. However
      // recently it says it was focused, it is not handed the calls that name
      // no browser while a Chromium browser is attached.
      fsb.socket.send(JSON.stringify({ type: 'mcp:browser-state', focusedAt: Date.now() - 60_000 }));
      second.socket.send(JSON.stringify({ type: 'mcp:browser-state', focusedAt: Date.now() - 30_000 }));
      safari.socket.send(JSON.stringify({ type: 'mcp:browser-state', focusedAt: Date.now() + 60_000 }));
      await waitFor(
        () => hub.topology.browsers.length === 3 && hub.topology.browsers.every((entry) => entry.focusedAt !== null),
        'every browser reports focus, Safari last',
      );
      const unnamedBesideSafari = inFlight(hub.sendAndWait({ type: 'mcp:get-tabs', payload: {} }));
      await waitFor(() => second.requests().length === 1, 'a call that names no browser goes to the Chrome profile focused last');
      assertEqual(safari.requests().length, 0, 'and not to Safari, focused later still');
      assertEqual(fsb.requests().length, 1, 'nor to the other profile');
      second.answer(second.requests()[0].id, { success: true });
      await unnamedBesideSafari;
      const namedSafari = inFlight(hub.sendAndWait({ type: 'mcp:get-tabs', payload: {}, browser: 'safari-b3f6f5c2' }));
      await waitFor(() => safari.requests().length === 1, 'Safari is still reached by name');
      safari.answer(safari.requests()[0].id, { success: true });
      await namedSafari;

      const secondSafari = await attachBrowser(port, 'safari-web-extension://11111111-2222-4333-8444-555555555555');
      resources.sockets.push(secondSafari.socket);
      secondSafari.socket.send(installState('deadbeef-9d0e-4f0b-8a53-0d3a2f1c9e77', {
        extensionId: 'com.example.other.Extension (UNSIGNED)',
      }));
      const safariClose = await waitForSocketClose(secondSafari.socket);
      assertEqual(safariClose.code, 1008, 'a second Safari install cannot be told to be FSB, and is turned away');

      fsb.socket.close();
      second.socket.close();
      await waitFor(() => browserKeys(hub) === 'safari-b3f6f5c2', 'the first extension leaves');
      const unnamedSafariAlone = inFlight(hub.sendAndWait({ type: 'mcp:get-tabs', payload: {} }));
      await waitFor(() => safari.requests().length === 2, 'with no Chromium browser left, Safari is the default');
      safari.answer(safari.requests()[1].id, { success: true });
      await unnamedSafariAlone;
      const later = await attachProfile(port, otherInstall, { origin: otherOrigin });
      resources.sockets.push(later.socket);
      await waitFor(() => hub.isConnectedTo('chrome-c0ffee00'), 'and only then can another extension id attach, as it always could');
      assertEqual(hub.refusedBrowsers.some((entry) => entry.extensionId === 'ponmlkjihgfedcbaponmlkjihgfedcba'), false, 'which clears its refusal');

      // Pairing still decides: a paired extension takes the bridge from an
      // unpaired one with another id.
      const authPath = auth.getBridgeAuthPath(home);
      const pairingCode = auth.formatPairingCode(auth.rotateBridgeSessionSecret(authPath, 33_000));
      const strangerClosed = waitForSocketClose(later.socket, 1500);
      const paired = await attachProfile(port, INSTALL_A, { pairingCode });
      resources.sockets.push(paired.socket);
      assertEqual((await strangerClosed).code, 1008, 'a paired extension is not held out by an unpaired one with another id');
      await waitFor(() => hub.isConnectedTo(KEY_A) && !hub.isConnectedTo('chrome-c0ffee00'), 'it attaches and the other is closed');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runBrowserKeysAreNeverReassigned(WebSocketBridge) {
  await withTempHome('bridge-key-permanence', async () => {
    const port = await getFreePort();
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'key-permanence-hub',
      handshakeTimeoutMs: 100,
      extensionIdentifyTimeoutMs: 2000,
    });
    const resources = { sockets: [], bridges: [hub] };
    const installOf = (index) => `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
    const keyOf = (index) => `chrome-${index.toString(16).padStart(8, '0')}`;
    try {
      await hub.connect();
      // The hub names 256 installs in its life. Each comes and goes here.
      for (let index = 0; index < 256; index += 1) {
        const profile = await attachProfile(port, installOf(index));
        await waitFor(() => hub.isConnectedTo(keyOf(index)), `install ${index} attaches`, 2000, 2);
        profile.socket.close();
        await waitFor(() => hub.topology.browsers.length === 0, `install ${index} leaves`, 2000, 2);
      }
      const late = await attachProfile(port, installOf(256));
      resources.sockets.push(late.socket);
      const close = await waitForSocketClose(late.socket);
      assertEqual(close.code, 1008, 'past that, an install the hub has never seen is turned away');
      const refusal = hub.refusedBrowsers.find((entry) => entry.reason === 'browser_key_unavailable');
      assert(Boolean(refusal), 'with the reason kept');
      const back = await attachProfile(port, installOf(0));
      resources.sockets.push(back.socket);
      await waitFor(() => hub.isConnectedTo(keyOf(0)), 'while the first install it named still gets its own key: no key was taken back to make room');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runHubExitPromotion(WebSocketBridge) {
  const resources = await createBridgePair(WebSocketBridge);
  try {
    const { hub, relay } = resources;

    hub.disconnect();
    await waitFor(
      () => relay.currentMode === 'hub' &&
        relay.topology?.activeHubInstanceId === 'test-relay',
      'hub-exit-promotion',
      1000,
      10
    );

    assertEqual(relay.currentMode, 'hub', 'relay promotes to hub after original hub exits');
    assertEqual(relay.topology?.activeHubInstanceId, 'test-relay', 'promoted relay reports itself as active hub');
  } finally {
    await cleanup(resources);
  }
}

async function run() {
  const WebSocketBridge = await loadBridgeClass();
  const bridgeModule = await import(pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'bridge.js')).href);
  const auth = await loadAuthModule();
  const lifecycleModule = await loadServeDelegationModule();

  await runCase('serve-only delegation startup and shutdown lifecycle', () => runServeDelegationLifecycle(lifecycleModule));
  await runCase('rejects non-loopback bind before port use', () => runRejectsNonLoopbackBind(WebSocketBridge));
  await runCase('server-first topology', () => runServerFirstTopology(WebSocketBridge));
  await runCase('optional relay capability advertisement', () => runRelayCapabilityAdvertisement(WebSocketBridge));
  await runCase('relay waits for extension reachability', () => runRelayWaitsForExtensionReachability(WebSocketBridge));
  await runCase('extension state broadcasts to relays', () => runExtensionStateBroadcastsToRelays(WebSocketBridge));
  await runCase('rejects untrusted browser relay origin', () => runRejectsUntrustedBrowserOrigin(WebSocketBridge));
  await runCase('accepts safari extension origin', () => runAcceptsSafariExtensionOrigin(WebSocketBridge));
  await runCase('pre-handler Host and Origin upgrade gate', () => runPreHandlerUpgradeGate(WebSocketBridge, auth));
  await runCase('pairing authority matrix', () => runPairingAuthorityMatrix(WebSocketBridge, auth));
  await runCase('unprivileged sockets cannot displace the active extension', () => runUnprivilegedCannotDisplaceExtension(WebSocketBridge, auth));
  await runCase('secret-free bridge auth-status probe', () => runAuthStatusProbe(WebSocketBridge, auth));
  await runCase('local reverse routing precedence and settlement', () => runLocalReverseRouting(WebSocketBridge, auth));
  await runCase('first capable relay routing and settlement', () => runRelayReverseRouting(WebSocketBridge, auth));
  await runCase('active socket revocation after external rotation', () => runActiveSocketRevocation(WebSocketBridge, auth, false));
  await runCase('active socket revocation and new-ID rebind after reset', () => runActiveSocketRevocation(WebSocketBridge, auth, true));
  await runCase('hub exits with an active ext request', () => runHubExitWithActiveExtRequest(WebSocketBridge, auth));
  await runCase('capable relay exits mid ext frame', () => runCapableRelayExitMidExtFrame(WebSocketBridge, auth));
  await runCase('stale incumbent is reaped and the slot is reusable', () => runStaleIncumbentIsReaped(WebSocketBridge, auth));
  await runCase('unresponsive incumbent is reaped by the transport tier', () => runUnresponsiveIncumbentIsReaped(WebSocketBridge));
  await runCase('quiet legacy extension is never reaped', () => runQuietLegacyExtensionIsKept(WebSocketBridge));
  await runCase('a replaced socket ping cannot arm its successor', () => runReplacedSocketPingIsIgnored(WebSocketBridge, auth));
  await runCase('hub keeps serving through an accept error', () => runHubSurvivesAcceptError(WebSocketBridge));
  await runCase('hub that loses its listener tears down and re-binds', () => runHubRebindsAfterListenerLoss(WebSocketBridge, bridgeModule));
  await runCase('stdio server exits when the host closes stdin', () => runStdinShutdownHelper());
  await runCase('two browsers share one hub', () => runTwoBrowsersShareTheHub(WebSocketBridge));
  await runCase('a call that names an absent browser is refused', () => runNamedBrowserThatIsAbsent(WebSocketBridge));
  await runCase('one browser closing leaves the other\'s calls alone', () => runOneBrowserClosingLeavesTheOther(WebSocketBridge));
  await runCase('a reply from another browser is ignored', () => runReplyFromAnotherBrowserIsIgnored(WebSocketBridge));
  await runCase('a relay that names no browser keeps the one it was given', () => runLegacyRelayKeepsItsBrowser(WebSocketBridge));
  await runCase('a relay that names no browser stays when the default moves', () => runLegacyRelayStaysWhenTheDefaultMoves(WebSocketBridge));
  await runCase('pairing one browser closes the other', () => runPairingClosesTheOtherBrowser(WebSocketBridge, auth));
  await runCase('a browser still saying who it is when pairing binds is turned away', () => runPairingTurnsAwayAWaitingBrowser(WebSocketBridge, auth));
  await runCase('safari identity and focus reports', () => runSafariIdentityAndFocus(WebSocketBridge));
  await runCase('each browser has its own liveness reaper', () => runEachBrowserHasItsOwnReaper(WebSocketBridge));
  await runCase('a promoted relay starts with no roster', () => runPromotedRelayStartsWithNoRoster(WebSocketBridge));
  await runCase('two profiles of one extension share one hub', () => runTwoProfilesOfOneExtension(WebSocketBridge));
  await runCase('a socket is a browser once it says which install it is', () => runInstallIdentification(WebSocketBridge));
  await runCase('install keys stay apart', () => runInstallKeysStayApart(WebSocketBridge));
  await runCase('a paired socket replaces only its own install', () => runPairedSocketReplacesItsOwnInstall(WebSocketBridge, auth));
  await runCase('a reverse-channel request carries its browser', () => runExtRequestCarriesItsBrowser(WebSocketBridge, auth));
  await runCase('the default browser survives a worker restart', () => runDefaultSurvivesAWorkerRestart(WebSocketBridge));
  await runCase('the hub holds a bounded number of browsers', () => runBrowserLimit(WebSocketBridge));
  await runCase('the real extension in two profiles', () => runRealExtensionInTwoProfiles(WebSocketBridge));
  await runCase('one extension id at a time', () => runOneExtensionAtATime(WebSocketBridge, auth));
  await runCase('a browser key is never given to another install', () => runBrowserKeysAreNeverReassigned(WebSocketBridge));
  await runCase('hub-exit-promotion', () => runHubExitPromotion(WebSocketBridge));

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
