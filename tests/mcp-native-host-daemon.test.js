'use strict';

const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
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

function readyHealth(overrides = {}) {
  return {
    statusCode: 200,
    body: Buffer.from(JSON.stringify({
      ok: true,
      service: 'fsb-mcp-server',
      version: '0.10.0',
      nativeHostProtocol: 1,
      serveReady: true,
      ...overrides,
    })),
  };
}

function createWakeHarness(options = {}) {
  const stableRuntimeRoot = '/Users/fsb/.fsb/native-host';
  const lockPath = `${stableRuntimeRoot}/wake.lock`;
  const metadataPath = `${lockPath}/owner.json`;
  const directories = new Map();
  const calls = {
    health: [],
    createDirectory: [],
    writePrivateFile: [],
    readPrivateFile: [],
    renameDirectory: [],
    removeDirectory: [],
    spawn: [],
    unref: 0,
    wait: [],
  };
  const trace = [];
  const tokens = [...(options.tokens || [
    '11111111111111111111111111111111',
    '22222222222222222222222222222222',
    '33333333333333333333333333333333',
    '44444444444444444444444444444444',
  ])];
  let now = options.now ?? 0;
  let tokenIndex = 0;

  if (options.initialLock) {
    directories.set(lockPath, new Map([
      [metadataPath, JSON.stringify(options.initialLock)],
    ]));
  }

  const state = {
    calls,
    directories,
    lockPath,
    metadataPath,
    trace,
    get now() {
      return now;
    },
    setLockMetadata(value) {
      const directory = directories.get(lockPath);
      if (directory) directory.set(metadataPath, JSON.stringify(value));
    },
  };

  const dependencies = {
    environment: Object.freeze({
      PATH: '/usr/bin:/bin',
      HOME: '/Users/fsb',
      FSB_SENTINEL: 'preserved',
      NODE_OPTIONS: '--inspect=127.0.0.1:9999',
      NODE_PATH: '/tmp/hostile-node-path',
      OMIT_UNDEFINED: undefined,
    }),
    now: () => now,
    wait: async (milliseconds) => {
      calls.wait.push(milliseconds);
      trace.push(`wait:${milliseconds}`);
      now += milliseconds;
      if (options.onWait) await options.onWait(state);
    },
    randomToken: () => {
      const token = tokens[tokenIndex] || `${tokenIndex}`.padStart(32, 'a').slice(-32);
      tokenIndex += 1;
      trace.push(`token:${token}`);
      return token;
    },
    requestHealth: async (request) => {
      calls.health.push(request);
      trace.push('health');
      const response = options.health
        ? await options.health(state)
        : readyHealth();
      if (response instanceof Error) throw response;
      return response;
    },
    createDirectory: async (pathname, mode) => {
      calls.createDirectory.push({ pathname, mode });
      trace.push(`mkdir:${pathname}`);
      if (directories.has(pathname)) return false;
      directories.set(pathname, new Map());
      return true;
    },
    writePrivateFile: async (pathname, contents, mode) => {
      calls.writePrivateFile.push({ pathname, contents, mode });
      trace.push(`write:${pathname}`);
      const directory = directories.get(path.dirname(pathname));
      if (!directory || directory.has(pathname)) throw new Error('fake_write_refused');
      directory.set(pathname, contents);
    },
    readPrivateFile: async (pathname, maxBytes) => {
      calls.readPrivateFile.push({ pathname, maxBytes });
      trace.push(`read:${pathname}`);
      return directories.get(path.dirname(pathname))?.get(pathname) ?? null;
    },
    renameDirectory: async (source, destination) => {
      calls.renameDirectory.push({ source, destination });
      trace.push(`rename:${source}->${destination}`);
      if (!directories.has(source) || directories.has(destination)) return false;
      directories.set(destination, directories.get(source));
      directories.delete(source);
      return true;
    },
    removeDirectory: async (pathname) => {
      calls.removeDirectory.push(pathname);
      trace.push(`remove:${pathname}`);
      directories.delete(pathname);
    },
    spawn: (command, argv, spawnOptions) => {
      calls.spawn.push({ command, argv, options: spawnOptions });
      trace.push('spawn');
      const child = new EventEmitter();
      child.unref = () => {
        calls.unref += 1;
        trace.push('unref');
      };
      queueMicrotask(() => {
        if (options.spawnError) child.emit('error', new Error('sensitive spawn failure'));
        else child.emit('spawn');
      });
      return child;
    },
  };

  return {
    dependencies,
    runtime: Object.freeze({
      stableRuntimeRoot,
      absoluteNode: '/usr/bin/node',
      absoluteStableBuildIndex: `${stableRuntimeRoot}/runtime/package/build/index.js`,
    }),
    state,
  };
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

async function runWakeDaemonSection() {
  const [daemon, nativeConstants] = await Promise.all([
    importBuild('native-host/daemon.js'),
    importBuild('native-host/constants.js'),
  ]);

  {
    const harness = createWakeHarness();
    const result = await daemon.wakeServeDaemon({
      runtime: harness.runtime,
      dependencies: harness.dependencies,
    });
    assertEqual(
      JSON.stringify(result),
      JSON.stringify({ outcome: 'already_running', reason: 'daemon_already_ready' }),
      'exact ready FSB health returns the closed already-running fact',
    );
    assertEqual(harness.state.calls.health.length, 1, 'ready health is probed exactly once');
    assertEqual(
      JSON.stringify(harness.state.calls.health[0]),
      JSON.stringify({
        url: 'http://127.0.0.1:7226/health',
        timeoutMs: 500,
        maxBytes: 4096,
      }),
      'health probe pins the exact URL, 500 ms timeout, and 4096-byte cap',
    );
    assertEqual(harness.state.calls.createDirectory.length, 0, 'ready health takes no wake lock');
    assertEqual(harness.state.calls.spawn.length, 0, 'ready health spawns no child');
  }

  const incompatibleCases = [
    ['wrong product', readyHealth({ service: 'not-fsb' }), 'daemon_identity_mismatch'],
    ['wrong protocol', readyHealth({ nativeHostProtocol: 2 }), 'daemon_protocol_mismatch'],
    ['malformed JSON', { statusCode: 200, body: Buffer.from('{') }, 'daemon_identity_mismatch'],
    ['oversize body', { statusCode: 200, body: Buffer.alloc(4097, 0x20) }, 'daemon_identity_mismatch'],
    ['non-200 response', { statusCode: 503, body: Buffer.from('{}') }, 'daemon_identity_mismatch'],
    ['unbounded version', readyHealth({ version: 'v'.repeat(65) }), 'daemon_identity_mismatch'],
  ];
  for (const [label, response, reason] of incompatibleCases) {
    const harness = createWakeHarness({ health: async () => response });
    const result = await daemon.wakeServeDaemon({
      runtime: harness.runtime,
      dependencies: harness.dependencies,
    });
    assertEqual(result.outcome, 'unavailable', `${label} is unavailable`);
    assertEqual(result.reason, reason, `${label} maps to a frozen content-free reason`);
    assertEqual(harness.state.calls.createDirectory.length, 0, `${label} takes no wake lock`);
    assertEqual(harness.state.calls.spawn.length, 0, `${label} spawns no child`);
  }

  {
    const harness = createWakeHarness({
      health: async (state) => (
        state.calls.spawn.length > 0 && state.calls.wait.length > 0
          ? readyHealth()
          : new Error('ECONNREFUSED secret local detail')
      ),
    });
    const result = await daemon.wakeServeDaemon({
      runtime: harness.runtime,
      dependencies: harness.dependencies,
    });
    assertEqual(result.outcome, 'started', 'offline lock winner returns started after exact readiness');
    assertEqual(result.reason, 'daemon_started_ready', 'winner returns the closed started reason');
    assertEqual(harness.state.calls.spawn.length, 1, 'offline lock winner spawns exactly once');
    const invocation = harness.state.calls.spawn[0];
    assertEqual(invocation.command, '/usr/bin/node', 'spawn uses the constant-owned absolute Node executable');
    assertEqual(
      JSON.stringify(invocation.argv),
      JSON.stringify([
        '/Users/fsb/.fsb/native-host/runtime/package/build/index.js',
        'serve',
        '--host',
        '127.0.0.1',
        '--port',
        '7226',
      ]),
      'spawn uses the one exact compiled serve argv tuple',
    );
    assertEqual(invocation.options.cwd, '/Users/fsb/.fsb/native-host', 'spawn cwd is the stable runtime root');
    assertEqual(invocation.options.shell, false, 'spawn disables the shell');
    assertEqual(invocation.options.detached, true, 'spawn is detached');
    assertEqual(invocation.options.stdio, 'ignore', 'spawn inherits no native protocol streams');
    assertEqual(invocation.options.windowsHide, true, 'spawn hides the Windows console');
    assertEqual(invocation.options.env.FSB_SENTINEL, 'preserved', 'spawn preserves ordinary inherited environment');
    assertEqual(Object.hasOwn(invocation.options.env, 'NODE_OPTIONS'), false, 'spawn strips NODE_OPTIONS');
    assertEqual(Object.hasOwn(invocation.options.env, 'NODE_PATH'), false, 'spawn strips NODE_PATH');
    assertEqual(Object.hasOwn(invocation.options.env, 'OMIT_UNDEFINED'), false, 'spawn omits undefined environment values');
    assertEqual(harness.state.calls.unref, 1, 'spawn is unrefed only after its spawn event');
    assertEqual(harness.state.directories.has(harness.state.lockPath), false, 'owner releases its exact lock');
    const metadata = JSON.parse(harness.state.calls.writePrivateFile[0].contents);
    assertEqual(
      JSON.stringify(Object.keys(metadata)),
      JSON.stringify(['schema', 'token', 'createdAt']),
      'wake lock metadata has only schema, token, and createdAt',
    );
    assertEqual(Object.hasOwn(metadata, 'pid'), false, 'wake lock never records a PID');
  }

  {
    const harness = createWakeHarness({
      health: async (state) => (
        state.calls.spawn.length > 0 && state.calls.wait.length >= 1
          ? readyHealth()
          : new Error('offline')
      ),
    });
    const [first, second] = await Promise.all([
      daemon.wakeServeDaemon({ runtime: harness.runtime, dependencies: harness.dependencies }),
      daemon.wakeServeDaemon({ runtime: harness.runtime, dependencies: harness.dependencies }),
    ]);
    assertEqual(harness.state.calls.spawn.length, 1, 'concurrent native hosts create at most one child');
    assertEqual(
      [first.outcome, second.outcome].sort().join(','),
      'already_running,started',
      'lock winner starts while contender reports the shared daemon ready',
    );
    assertEqual(
      [first.reason, second.reason].sort().join(','),
      'daemon_already_ready,daemon_started_ready',
      'concurrent settlements remain closed lifecycle facts',
    );
  }

  {
    const staleToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const harness = createWakeHarness({
      now: 30_001,
      initialLock: { schema: 1, token: staleToken, createdAt: 0 },
      tokens: [
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'cccccccccccccccccccccccccccccccc',
        'dddddddddddddddddddddddddddddddd',
      ],
      health: async (state) => (
        state.calls.spawn.length > 0
          ? readyHealth()
          : new Error('offline')
      ),
    });
    const result = await daemon.wakeServeDaemon({
      runtime: harness.runtime,
      dependencies: harness.dependencies,
    });
    assertEqual(result.outcome, 'started', 'expired lock is recovered and one daemon is started');
    assertEqual(harness.state.calls.spawn.length, 1, 'stale recovery still spawns only once');
    const rename = harness.state.calls.renameDirectory.find(({ destination }) => destination.includes('.quarantine-'));
    assert(Boolean(rename), 'stale directory is atomically renamed to a tokened quarantine');
    assert(
      rename && harness.state.calls.removeDirectory.includes(rename.destination),
      'only the exact tokened stale quarantine is removed',
    );
    const renameTraceIndex = harness.state.trace.findIndex((item) => item.includes('.quarantine-'));
    const precedingHealthIndex = harness.state.trace.lastIndexOf('health', renameTraceIndex);
    assert(precedingHealthIndex >= 0 && precedingHealthIndex < renameTraceIndex, 'health is rechecked immediately before stale quarantine');
  }

  {
    const ownerToken = '11111111111111111111111111111111';
    const foreignToken = 'ffffffffffffffffffffffffffffffff';
    const harness = createWakeHarness({
      tokens: [ownerToken, '22222222222222222222222222222222'],
      health: async (state) => {
        if (state.calls.spawn.length === 0) return new Error('offline');
        state.setLockMetadata({ schema: 1, token: foreignToken, createdAt: 0 });
        return readyHealth();
      },
    });
    const result = await daemon.wakeServeDaemon({
      runtime: harness.runtime,
      dependencies: harness.dependencies,
    });
    assertEqual(result.outcome, 'started', 'readiness remains factual when lock ownership changes');
    assertEqual(harness.state.directories.has(harness.state.lockPath), true, 'release refuses a non-matching lock token');
    assertEqual(
      harness.state.calls.removeDirectory.includes(harness.state.lockPath),
      false,
      'release never removes the shared lock path without exact token proof',
    );
  }

  {
    const harness = createWakeHarness({
      spawnError: true,
      health: async () => new Error('offline'),
    });
    const result = await daemon.wakeServeDaemon({
      runtime: harness.runtime,
      dependencies: harness.dependencies,
    });
    assertEqual(result.outcome, 'failed', 'spawn error returns failed');
    assertEqual(result.reason, 'serve_spawn_failed', 'spawn error is collapsed to the frozen reason');
    assertEqual(harness.state.calls.unref, 0, 'failed spawn is never unrefed');
    assertEqual(harness.state.directories.has(harness.state.lockPath), false, 'spawn failure releases the exact owned lock');
  }

  {
    const harness = createWakeHarness({ health: async () => new Error('offline') });
    const result = await daemon.wakeServeDaemon({
      runtime: harness.runtime,
      dependencies: harness.dependencies,
    });
    assertEqual(result.outcome, 'failed', 'winner readiness timeout returns failed');
    assertEqual(result.reason, 'serve_readiness_timeout', 'winner timeout has the exact readiness reason');
    assertEqual(harness.state.calls.spawn.length, 1, 'readiness timeout does not retry spawn');
    assertEqual(harness.state.calls.wait.every((value) => value === 100), true, 'readiness polling uses only 100 ms waits');
    assert(harness.state.now >= 10_000 && harness.state.now <= 10_100, 'readiness timeout is bounded to 10 seconds');
  }

  {
    const harness = createWakeHarness({
      initialLock: {
        schema: 1,
        token: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        createdAt: 0,
      },
      health: async () => new Error('offline'),
    });
    const result = await daemon.wakeServeDaemon({
      runtime: harness.runtime,
      dependencies: harness.dependencies,
    });
    assertEqual(result.outcome, 'failed', 'lock contender timeout returns failed');
    assertEqual(result.reason, 'wake_lock_timeout', 'contender timeout has the exact lock reason');
    assertEqual(harness.state.calls.spawn.length, 0, 'lock contender never spawns');
  }

  assertEqual(nativeConstants.NATIVE_HOST_HEALTH_TIMEOUT_MS, 500, 'the frozen health request timeout is 500 ms');
  assertEqual(nativeConstants.NATIVE_HOST_DAEMON_START_TIMEOUT_MS, 10_000, 'the readiness window stays 10 seconds');
  assertEqual(nativeConstants.NATIVE_HOST_START_POLL_INTERVAL_MS, 100, 'the readiness poll stays 100 ms');
  assertEqual(nativeConstants.NATIVE_HOST_START_LOCK_STALE_MS, 30_000, 'the stale-lock TTL stays 30 seconds');

  const platformSource = readFileSync(path.join(repoRoot, 'mcp/src/native-host/platform.ts'), 'utf8');
  const daemonSource = readFileSync(path.join(repoRoot, 'mcp/src/native-host/daemon.ts'), 'utf8');
  assert.doesNotMatch(platformSource, /\.kill\s*\(|process\.kill|\bSIG(?:TERM|KILL|INT)\b/u);
  assert.doesNotMatch(daemonSource, /\.kill\s*\(|process\.kill|\bSIG(?:TERM|KILL|INT)\b/u);
  assert.doesNotMatch(`${platformSource}\n${daemonSource}`, /\bpid\b/iu);
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
  const knownSections = new Set(['health', 'bind-race', 'wake-daemon']);
  if (section && !knownSections.has(section)) {
    throw new Error(`Unknown section: ${section}`);
  }

  if (!section || section === 'health') {
    await runCase('product-specific serve health', runHealthSection);
  }
  if (!section || section === 'bind-race') {
    await runCase('same-port bind winner authority', runBindRaceSection);
  }
  if (!section || section === 'wake-daemon') {
    await runCase('bounded native wake daemon', runWakeDaemonSection);
  }

  console.log(`\nMCP native host daemon tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
