'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('path');
const { pathToFileURL } = require('url');

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
    const socket = protocols
      ? new WebSocket(`ws://127.0.0.1:${port}`, protocols, {
          headers: options.origin ? { Origin: options.origin } : undefined,
        })
      : new WebSocket(`ws://127.0.0.1:${port}`, {
          headers: options.origin ? { Origin: options.origin } : undefined,
        });
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

async function loadBridgeClass() {
  const bridgeUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'bridge.js')).href;
  const module = await import(bridgeUrl);
  return module.WebSocketBridge;
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
    readyCalls: 0,
    serveReady: false,
    onDegraded: null,
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
    createCompatibilityRegistry() {
      state.compatibilityRegistryCalls++;
      return {
        ids() {
          return ['claude-code'];
        },
        require(id) {
          if (id !== 'claude-code') throw new Error('unknown adapter');
          return {
            async detect() {
              state.compatibilityDetectCalls++;
              if (overrides.compatibilityDetectionError) {
                throw overrides.compatibilityDetectionError;
              }
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
            },
          };
        },
      };
    },
    now() {
      return 123_456_789;
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
    success.order.slice(0, 8).join(' > '),
    'bridge.construct > queue.construct > http.bind > supervisor.construct:http://127.0.0.1:6015/mcp > supervisor.recover > bridge.connect > inventory.push > http.ready',
    'serve binds HTTP, recovers, connects, advertises, then marks readiness',
  );
  assertEqual(
    JSON.stringify(success.state.bridgeOptions.capabilities),
    '["agent-spawn"]',
    'serve bridge has the single closed spawn capability',
  );
  assertEqual(typeof success.state.bridgeOptions.handleExtRequest, 'function', 'serve bridge receives the supervisor handler closure');
  assert(success.state.httpOptions.bridge === success.bridge, 'HTTP receives the same not-yet-connected capable bridge');
  assertEqual(success.state.connectCalls, 1, 'capable bridge connects exactly once after recovery');
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
  assertEqual(success.state.compatibilityDetectCalls, 1, 'compatibility invokes the registered production detector once');
  assertEqual(
    JSON.stringify(compatibility),
    '{"schemaVersion":1,"checkedAt":123456789,"adapters":[{"adapterId":"claude-code","displayLabel":"Claude Code","status":"supported","reason":"within_tested_range"}]}',
    'compatibility returns only the exact bounded browser-safe projection',
  );
  for (const forbidden of [
    'compatibility-path-canary',
    '2.1.177',
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
  assertEqual(success.state.compatibilityDetectCalls, 1, 'invalid compatibility payloads never run detection');

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
    '{"schemaVersion":1,"checkedAt":123456789,"adapters":[{"adapterId":"claude-code","displayLabel":"Claude Code","status":"unsupported","reason":"binary_not_found"}]}',
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
    ['bridge connect', { connectError: new Error('connect') }, 'bridge.construct > queue.construct > http.bind > supervisor.construct:http://127.0.0.1:6015/mcp > supervisor.recover > bridge.connect'],
    ['inventory push', { inventoryError: new Error('inventory') }, 'bridge.construct > queue.construct > http.bind > supervisor.construct:http://127.0.0.1:6015/mcp > supervisor.recover > bridge.connect > inventory.push'],
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
    hub._registerExtensionClient = (socket) => {
      extensionRegistrations++;
      return registerExtension(socket);
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
      await waitFor(() => messages.length === 4, 'selected relay ordered events', 1000, 10);
      assertEqual(messages[1]?.event, 'delegation.started', 'selected relay forwards the early server id first');
      assertEqual(messages[1]?.payload?.delegationId, delegationId, 'relayed early event carries the server-minted id');
      assertEqual(messages[2]?.event, 'delegation.event', 'selected relay forwards normalized init without settling');
      assertEqual(messages[3]?.event, 'delegation.event', 'selected relay forwards multiple normalized events while pending');
      assertEqual(hub.activeExtRequests.size, 1, 'events do not settle the selected relay route');

      pending[0].resolve({
        delegationId,
        status: 'completed',
        terminal: { type: 'result', isError: false },
      });
      await waitFor(() => messages.length === 5, 'selected relay response', 1000, 10);
      assertEqual(messages[4]?.payload?.delegationId, delegationId, 'first capable relay supplies one correlated final response');
      assertEqual(messages[4]?.payload?.status, 'completed', 'relayed final response carries domain completion status');
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
      assertEqual(messages.length, 5, 'late event and duplicate final from selected relay are dropped');

      extension.send(JSON.stringify({
        id: 'relay-cancel',
        type: 'ext:request',
        method: 'delegate.cancel',
        payload: { delegationId },
      }));
      await waitFor(() => messages.length === 6, 'selected relay cancel response', 1000, 10);
      assertEqual(messages[5]?.payload?.delegationId, delegationId, 'relayed cancel uses the early server-minted id');
      assertEqual(messages[5]?.payload?.status, 'already_terminal', 'relayed cancel remains idempotent after terminal settlement');
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
      await waitFor(() => messages.length === 7, 'extension-close relay started event', 1000, 10);
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
  const auth = await loadAuthModule();
  const lifecycleModule = await loadServeDelegationModule();

  await runCase('serve-only delegation startup and shutdown lifecycle', () => runServeDelegationLifecycle(lifecycleModule));
  await runCase('rejects non-loopback bind before port use', () => runRejectsNonLoopbackBind(WebSocketBridge));
  await runCase('server-first topology', () => runServerFirstTopology(WebSocketBridge));
  await runCase('optional relay capability advertisement', () => runRelayCapabilityAdvertisement(WebSocketBridge));
  await runCase('relay waits for extension reachability', () => runRelayWaitsForExtensionReachability(WebSocketBridge));
  await runCase('extension state broadcasts to relays', () => runExtensionStateBroadcastsToRelays(WebSocketBridge));
  await runCase('rejects untrusted browser relay origin', () => runRejectsUntrustedBrowserOrigin(WebSocketBridge));
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
