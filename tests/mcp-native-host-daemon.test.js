'use strict';

const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  PASS:', message);
  } else {
    failed += 1;
    console.error('  FAIL:', message);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

async function importBuild(relativePath) {
  return import(pathToFileURL(path.join(repoRoot, 'mcp', 'build', relativePath)).href);
}

async function readHealth(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(1_000),
  });
  const body = await response.text();
  return {
    body,
    contentType: response.headers.get('content-type'),
    json: JSON.parse(body),
    status: response.status,
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Unable to allocate native-host test port'));
      });
    });
  });
}

async function runHealthSection() {
  const [{ startHttpServer }, nativeConstants, version] = await Promise.all([
    importBuild('http.js'),
    importBuild('native-host/constants.js'),
    importBuild('version.js'),
  ]);
  const bridge = {
    topology: {
      mode: 'hub',
      activeHubInstanceId: 'native-health-hub',
      extensionConnected: false,
      hubConnected: true,
      lastDisconnectReason: null,
      lastExtensionHeartbeatAt: null,
      relayCount: 0,
    },
  };
  const queue = { isRunning: false };
  const server = await startHttpServer({
    host: version.DEFAULT_HTTP_HOST,
    port: 0,
    bridge,
    queue,
  });

  try {
    const initial = await readHealth(server.healthEndpoint);
    assertEqual(initial.status, 200, 'health responds with HTTP 200');
    assert(
      initial.contentType?.startsWith('application/json'),
      'health identifies its bounded body as JSON',
    );
    assert(
      Buffer.byteLength(initial.body, 'utf8') <= nativeConstants.NATIVE_HOST_HEALTH_MAX_BYTES,
      'health body fits the native-host response cap',
    );
    assertEqual(
      initial.json.service,
      nativeConstants.NATIVE_HOST_HEALTH_PRODUCT,
      'health exposes the exact FSB product marker',
    );
    assertEqual(
      initial.json.version,
      version.FSB_MCP_VERSION,
      'health exposes the canonical MCP package version',
    );
    assert(
      typeof initial.json.version === 'string'
        && Buffer.byteLength(initial.json.version, 'utf8') > 0
        && Buffer.byteLength(initial.json.version, 'utf8') <= 64,
      'health version is non-empty and bounded',
    );
    assertEqual(
      initial.json.nativeHostProtocol,
      nativeConstants.NATIVE_HOST_PROTOCOL_VERSION,
      'health exposes the dedicated numeric native-host protocol',
    );
    assertEqual(initial.json.nativeHostProtocol, 1, 'health protocol remains exactly version 1');
    assertEqual(initial.json.serveReady, false, 'a freshly bound listener is false-by-default');
    assertEqual(initial.json.transport, 'streamable-http', 'existing transport evidence is preserved');
    assertEqual(initial.json.bridgeMode, 'hub', 'existing bridge topology evidence is preserved');
    assertEqual(initial.json.queuedMutationTools, false, 'existing queue evidence is preserved');
    assertEqual(version.DEFAULT_HTTP_HOST, '127.0.0.1', 'health stays on canonical loopback');
    assertEqual(version.DEFAULT_HTTP_PORT, 7226, 'health introduces no new serve port');
    assertEqual(typeof server.markServeReady, 'function', 'listener exposes lifecycle-only readiness authority');

    server.markServeReady();
    server.markServeReady();
    const ready = await readHealth(server.healthEndpoint);
    assertEqual(ready.json.serveReady, true, 'the readiness authority is idempotent and monotonic while open');
    assertEqual(ready.json.service, initial.json.service, 'readiness does not change product identity');
    assertEqual(ready.json.nativeHostProtocol, 1, 'readiness does not change protocol identity');
  } finally {
    await server.close();
  }
}

function makeBindAttempt(label, startHttpServer) {
  const order = [];
  const signals = new Map();
  const state = {
    bridgeOptions: null,
    connectCalls: 0,
    createSupervisorCalls: 0,
    disconnectCalls: 0,
    httpCloseCalls: 0,
    inventoryCalls: 0,
    prepareCalls: 0,
    readyCalls: 0,
    recoverCalls: 0,
    supervisorCloseCalls: 0,
  };
  const bridge = {
    currentMode: 'hub',
    topology: {
      mode: 'hub',
      activeHubInstanceId: `${label}-hub`,
      extensionConnected: false,
      hubConnected: true,
      lastDisconnectReason: null,
      lastExtensionHeartbeatAt: null,
      relayCount: 0,
    },
    async connect() {
      state.connectCalls += 1;
      order.push('bridge.connect');
    },
    disconnect() {
      state.disconnectCalls += 1;
      order.push('bridge.disconnect');
    },
  };
  const supervisor = {
    async recover() {
      state.recoverCalls += 1;
      order.push('supervisor.recover');
      return {
        confirmedKilled: 0,
        staleCleared: 0,
        ambiguousFailClosed: 0,
        spawnAvailable: true,
        profiles: [],
      };
    },
    async close() {
      state.supervisorCloseCalls += 1;
      order.push('supervisor.close');
      return { cancelled: 0, failed: 0, alreadySettled: 0 };
    },
    journalEntryForChild() {
      return null;
    },
    async handleExtRequest() {
      throw new Error('bind-race handler must remain unused');
    },
  };
  const dependencies = {
    createBridge(options) {
      state.bridgeOptions = options;
      order.push('bridge.construct');
      return bridge;
    },
    createQueue() {
      order.push('queue.construct');
      return { isRunning: false };
    },
    async startHttp(options) {
      order.push('http.bind');
      const running = await startHttpServer(options);
      return {
        endpoint: running.endpoint,
        healthEndpoint: running.healthEndpoint,
        markServeReady() {
          state.readyCalls += 1;
          order.push('http.ready');
          running.markServeReady();
        },
        async close() {
          state.httpCloseCalls += 1;
          order.push('http.close');
          await running.close();
        },
      };
    },
    createSupervisor() {
      state.createSupervisorCalls += 1;
      order.push('supervisor.construct');
      return supervisor;
    },
    async prepareBridgeAuth() {
      state.prepareCalls += 1;
      order.push('bridge.auth.prepare');
    },
    async pushInventory() {
      state.inventoryCalls += 1;
      order.push('inventory.push');
    },
    registerSignal(signal, handler) {
      signals.set(signal, handler);
    },
    exit(code) {
      order.push(`process.exit:${code}`);
    },
  };
  return { dependencies, order, signals, state };
}

async function runBindRaceSection() {
  const [{ startHttpServer }, lifecycle] = await Promise.all([
    importBuild('http.js'),
    importBuild('agent-providers/serve-delegation.js'),
  ]);
  const port = await getFreePort();
  const attempts = [
    makeBindAttempt('attempt-a', startHttpServer),
    makeBindAttempt('attempt-b', startHttpServer),
  ];
  const results = await Promise.allSettled(attempts.map((attempt) => (
    lifecycle.startServeDelegation({
      host: '127.0.0.1',
      port,
      dependencies: attempt.dependencies,
    })
  )));
  const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
  const loserIndex = results.findIndex((result) => result.status === 'rejected');
  assertEqual(results.filter((result) => result.status === 'fulfilled').length, 1, 'one bind attempt wins');
  assertEqual(results.filter((result) => result.status === 'rejected').length, 1, 'one bind attempt loses');
  assert(
    loserIndex >= 0 && results[loserIndex].reason instanceof lifecycle.ServeDelegationStartupError,
    'bind loser receives only the bounded startup error',
  );
  if (winnerIndex < 0 || loserIndex < 0) return;

  const winner = attempts[winnerIndex];
  const loser = attempts[loserIndex];
  const running = results[winnerIndex].value;
  assertEqual(
    winner.order.slice(0, 9).join(' > '),
    'bridge.construct > queue.construct > http.bind > supervisor.construct > supervisor.recover > bridge.auth.prepare > bridge.connect > inventory.push > http.ready',
    'bind winner owns the exact startup authority order',
  );
  assertEqual(winner.state.createSupervisorCalls, 1, 'bind winner creates one supervisor');
  assertEqual(winner.state.recoverCalls, 1, 'bind winner recovers once');
  assertEqual(winner.state.prepareCalls, 1, 'bind winner prepares bridge auth exactly once');
  assertEqual(winner.state.connectCalls, 1, 'bind winner connects exactly once');
  assertEqual(winner.state.inventoryCalls, 1, 'bind winner pushes inventory exactly once');
  assertEqual(winner.state.readyCalls, 1, 'bind winner advertises readiness exactly once');
  assertEqual(
    JSON.stringify(winner.state.bridgeOptions.capabilities),
    '["agent-spawn"]',
    'bind winner retains the closed serve-only capability',
  );
  const health = await readHealth(running.healthEndpoint);
  assertEqual(health.json.serveReady, true, 'only the winning listener becomes ready');

  assertEqual(loser.state.createSupervisorCalls, 0, 'bind loser creates no supervisor');
  assertEqual(loser.state.recoverCalls, 0, 'bind loser performs no recovery');
  assertEqual(loser.state.prepareCalls, 0, 'bind loser cannot rotate bridge auth');
  assertEqual(loser.state.connectCalls, 0, 'bind loser cannot connect a bridge');
  assertEqual(loser.state.inventoryCalls, 0, 'bind loser cannot push inventory');
  assertEqual(loser.state.readyCalls, 0, 'bind loser cannot advertise readiness');
  assertEqual(loser.state.httpCloseCalls, 0, 'bind loser closes no listener it does not own');
  assertEqual(loser.state.supervisorCloseCalls, 0, 'bind loser closes no supervisor it does not own');
  assertEqual(loser.state.disconnectCalls, 1, 'bind loser closes only its unconnected owned bridge');

  const shutdown = await running.shutdown();
  assertEqual(shutdown.exitCode, 0, 'bind winner shuts down cleanly after the race');
}

async function runCase(name, callback) {
  console.log(`\n${name}`);
  try {
    await callback();
  } catch (error) {
    failed += 1;
    console.error('  FAIL:', error?.stack || error);
  }
}

async function main() {
  const sectionIndex = process.argv.indexOf('--section');
  const section = sectionIndex >= 0 ? process.argv[sectionIndex + 1] : null;
  const knownSections = new Set(['health', 'bind-race']);
  if (section && !knownSections.has(section)) {
    throw new Error(`Unknown section: ${section}`);
  }

  if (!section || section === 'health') {
    await runCase('product-specific serve health', runHealthSection);
  }
  if (!section || section === 'bind-race') {
    await runCase('same-port bind winner authority', runBindRaceSection);
  }

  console.log(`\nMCP native host daemon tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
