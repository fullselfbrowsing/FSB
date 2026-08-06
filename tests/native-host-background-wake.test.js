#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repositoryRoot = path.resolve(__dirname, '..');
const helperPath = path.join(
  repositoryRoot,
  'extension',
  'utils',
  'native-host-wake.js',
);
const installCommandHelperPath = path.join(
  repositoryRoot,
  'extension',
  'utils',
  'native-host-install-command.js',
);
const backgroundPath = path.join(repositoryRoot, 'extension', 'background.js');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const installCommandHelperSource = fs.readFileSync(installCommandHelperPath, 'utf8');
const installCommandHelper = require(installCommandHelperPath);
const backgroundSource = fs.readFileSync(backgroundPath, 'utf8');
const pairingCode = `fsb-auth.${'A'.repeat(43)}`;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function testInstallCommandHelper() {
  const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
  assert.equal(Object.isFrozen(installCommandHelper), true);
  assert.deepEqual(
    Object.keys(installCommandHelper),
    ['detectBrowser', 'buildInstallCommand'],
  );
  assert.equal(
    installCommandHelper.detectBrowser({
      brave: {},
      userAgentData: { brands: [{ brand: 'Microsoft Edge' }] },
    }),
    'brave',
    'the Brave navigator marker has first priority',
  );
  assert.equal(
    installCommandHelper.detectBrowser({
      userAgentData: {
        brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }],
      },
    }),
    'edge',
  );
  assert.equal(
    installCommandHelper.detectBrowser({
      userAgentData: {
        brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }],
      },
    }),
    'chrome',
  );
  assert.equal(
    installCommandHelper.detectBrowser({
      userAgentData: { brands: [{ brand: 'Chromium' }] },
    }),
    'chromium',
  );
  assert.equal(
    installCommandHelper.detectBrowser({
      userAgent: 'Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
    }),
    'edge',
    'the Edge user-agent token wins over its embedded Chrome token',
  );
  assert.equal(
    installCommandHelper.detectBrowser({}),
    'chrome',
    'unknown Chromium runtimes safely default to Chrome',
  );
  assert.equal(
    installCommandHelper.buildInstallCommand(extensionId, {
      userAgentData: { brands: [{ brand: 'Microsoft Edge' }] },
    }),
    'npx -y fsb-mcp-server install --native-host --browser edge'
      + ' --extension-id abcdefghijklmnopabcdefghijklmnop',
  );
  for (const invalidId of [
    '',
    'a'.repeat(31),
    'q'.repeat(32),
    'a'.repeat(32) + ' --help',
  ]) {
    assert.equal(installCommandHelper.buildInstallCommand(invalidId, {}), null);
  }
}

function helperHarness(options = {}) {
  let now = 10_000;
  let uuidCounter = 0;
  let lastError = null;
  const nativeCalls = [];
  const timers = [];
  const connectCalls = [];
  const ports = [];

  function listenerSet() {
    const listeners = [];
    return {
      listeners,
      addListener(listener) {
        listeners.push(listener);
      },
      removeListener(listener) {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    };
  }

  const chrome = {
    runtime: {
      get lastError() {
        return lastError;
      },
      sendNativeMessage(hostName, message, callback) {
        if (options.sendThrows) throw new Error('native send failed');
        nativeCalls.push({ hostName, message: plain(message), callback });
      },
      connectNative(hostName) {
        connectCalls.push(hostName);
        if (options.connectThrows) throw new Error('native connect failed');
        const port = {
          onMessage: listenerSet(),
          onDisconnect: listenerSet(),
          disconnectCalls: 0,
          disconnect() {
            this.disconnectCalls += 1;
          },
        };
        ports.push(port);
        return port;
      },
    },
  };

  const context = {
    chrome,
    crypto: {
      randomUUID() {
        uuidCounter += 1;
        return uuidCounter.toString(16).padStart(32, '0');
      },
    },
    Date: { now: () => now },
    Promise,
    Object,
    Array,
    Reflect,
    Uint8Array,
    Number,
    String,
    RegExp,
    Error,
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
  };
  context.globalThis = context;
  vm.runInNewContext(helperSource, context, { filename: helperPath });

  return {
    api: context.FsbNativeHostWake,
    nativeCalls,
    connectCalls,
    ports,
    timers,
    advance(milliseconds) {
      now += milliseconds;
    },
    runTimer(delay) {
      const timer = timers.find((entry) => !entry.cleared && entry.delay === delay);
      assert(timer, `timer ${delay} exists`);
      timer.cleared = true;
      timer.callback();
    },
    respond(index, response, errorMessage = null) {
      const call = nativeCalls[index];
      assert(call, `native call ${index} exists`);
      lastError = errorMessage ? { message: errorMessage } : null;
      call.callback(response);
      lastError = null;
    },
  };
}

function validWakeResponse(call, overrides = {}) {
  return {
    v: 1,
    correlationId: call.message.correlationId,
    outcome: 'already_running',
    reason: 'daemon_already_ready',
    ...overrides,
  };
}

function validBootstrapResponse(call, overrides = {}) {
  return {
    v: 2,
    correlationId: call.message.correlationId,
    outcome: 'already_running',
    reason: 'daemon_already_ready',
    pairingCode,
    ...overrides,
  };
}

async function testHelperV1Compatibility() {
  const harness = helperHarness();
  assert.equal(Object.isFrozen(harness.api), true);
  assert.deepEqual(
    Object.keys(harness.api),
    ['probePresence', 'getPresence', 'ensureWake', 'ensureBootstrap'],
  );

  const first = harness.api.ensureWake();
  const second = harness.api.ensureWake();
  assert.equal(first, second);
  assert.match(first.attemptId, /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(harness.nativeCalls.length, 1);
  const call = harness.nativeCalls[0];
  assert.equal(call.hostName, 'io.github.fullselfbrowsing.fsb_native_host');
  assert.deepEqual(Object.keys(call.message), ['v', 'action', 'correlationId']);
  assert.equal(call.message.v, 1);
  assert.equal(call.message.action, 'wake');
  harness.respond(0, validWakeResponse(call));
  assert.deepEqual(plain(await first), {
    ok: true,
    outcome: 'already_running',
    reason: 'daemon_already_ready',
  });
}

async function testHelperV2Bootstrap() {
  const harness = helperHarness();
  const first = harness.api.ensureBootstrap();
  const second = harness.api.ensureBootstrap();
  assert.equal(first, second, 'concurrent bootstrap callers share one native request');
  assert.equal(harness.nativeCalls.length, 1);
  const call = harness.nativeCalls[0];
  assert.deepEqual(Object.keys(call.message), ['v', 'action', 'correlationId']);
  assert.equal(call.message.v, 2);
  assert.equal(call.message.action, 'bootstrap');
  harness.respond(0, validBootstrapResponse(call));
  const result = await first;
  assert.deepEqual(plain(result), {
    ok: true,
    outcome: 'already_running',
    reason: 'daemon_already_ready',
    pairingCode,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(harness.api.getPresence(), 'present');

  const failureHarness = helperHarness();
  const failed = failureHarness.api.ensureBootstrap();
  const failedCall = failureHarness.nativeCalls[0];
  failureHarness.respond(0, {
    v: 2,
    correlationId: failedCall.message.correlationId,
    outcome: 'unavailable',
    reason: 'extension_origin_mismatch',
  });
  assert.deepEqual(plain(await failed), {
    ok: false,
    reason: 'extension_origin_mismatch',
  });

  for (const responseFactory of [
    (current) => ({ ...validBootstrapResponse(current), extra: true }),
    (current) => ({ ...validBootstrapResponse(current), pairingCode: 'too-short' }),
    (current) => ({ ...validBootstrapResponse(current), correlationId: 'wrong_id_12345678' }),
    (current) => ({
      v: 2,
      correlationId: current.message.correlationId,
      outcome: 'unavailable',
      reason: 'bridge_session_unavailable',
      pairingCode,
    }),
  ]) {
    const malformedHarness = helperHarness();
    const pending = malformedHarness.api.ensureBootstrap();
    const malformedCall = malformedHarness.nativeCalls[0];
    malformedHarness.respond(0, responseFactory(malformedCall));
    assert.deepEqual(plain(await pending), { ok: false });
  }

  const oldHostHarness = helperHarness();
  const oldHostPending = oldHostHarness.api.ensureBootstrap();
  oldHostHarness.respond(0, undefined, 'Native host exited without a v2 response');
  assert.deepEqual(plain(await oldHostPending), { ok: false });
  assert.equal(oldHostHarness.api.getPresence(), 'absent');
}

async function testHelperPresenceAndBounds() {
  const present = helperHarness();
  const probe = present.api.probePresence();
  assert.equal(present.connectCalls.length, 1);
  assert.equal(present.nativeCalls.length, 0);
  present.runTimer(250);
  assert.equal(await probe, 'present');
  assert.equal(present.ports[0].disconnectCalls, 1);

  const timeout = helperHarness();
  const pending = timeout.api.ensureBootstrap();
  const lateCall = timeout.nativeCalls[0];
  timeout.runTimer(12_000);
  assert.deepEqual(plain(await pending), { ok: false });
  const cooldown = timeout.api.ensureBootstrap();
  assert.equal(timeout.nativeCalls.length, 1);
  assert.deepEqual(plain(await cooldown), { ok: false });
  timeout.respond(0, validBootstrapResponse(lateCall));
  timeout.advance(5_001);
  const retry = timeout.api.ensureBootstrap();
  assert.equal(timeout.nativeCalls.length, 2);
  timeout.respond(1, validBootstrapResponse(timeout.nativeCalls[1]));
  assert.equal((await retry).ok, true);
}

function extractFunction(source, name) {
  const signature = `function ${name}(`;
  const functionStart = source.indexOf(signature);
  assert.notEqual(functionStart, -1, `${name} exists`);
  const start = source.slice(Math.max(0, functionStart - 6), functionStart) === 'async '
    ? functionStart - 6
    : functionStart;
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

function backgroundEnsureHarness(options = {}) {
  let bridgeState = {
    connected: true,
    status: 'connected',
    pairingStatus: options.pairingStatus || 'expired',
    delegationConnection: { state: 'connected' },
  };
  let bootstrapCalls = 0;
  let reloadCalls = 0;
  let refreshCalls = 0;
  let localWrites = 0;
  const sessionWrites = [];
  const events = [];
  const armReasons = [];
  let resolveBootstrap;
  const bootstrapPromise = new Promise((resolve) => {
    resolveBootstrap = resolve;
  });
  Object.defineProperty(bootstrapPromise, 'attemptId', {
    value: 'attempt_bootstrap_0001',
  });

  const context = {
    Promise,
    Object,
    Array,
    Number,
    String,
    RegExp,
    Error,
    Date: { now: () => 123456 },
    chrome: {
      storage: {
        local: {
          async set() {
            localWrites += 1;
          },
        },
        session: {
          async set(value) {
            sessionWrites.push(plain(value));
          },
        },
      },
      runtime: {
        sendMessage(value) {
          events.push(plain(value));
          return Promise.resolve();
        },
      },
    },
    FsbNativeHostWake: options.nativeMissing ? undefined : {
      ensureBootstrap() {
        bootstrapCalls += 1;
        return bootstrapPromise;
      },
      getPresence() {
        return 'present';
      },
    },
    mcpBridgeClient: {
      async reloadPairingAndReconnect() {
        reloadCalls += 1;
        if (!options.readyOnSecondReload || reloadCalls >= 2) {
          bridgeState = {
            connected: true,
            status: 'connected',
            pairingStatus: 'paired',
            delegationConnection: { state: 'connected' },
          };
        }
        return { pairingStatus: bridgeState.pairingStatus };
      },
    },
    fsbDelegationBridgeState() {
      return bridgeState;
    },
    fsbBroadcastNativeWakeChecking(attemptId, intentId) {
      events.push({
        type: 'FSB_NATIVE_WAKE_CHECKING',
        attemptId,
        intentId,
      });
    },
    armMcpBridge(reason) {
      armReasons.push(reason);
    },
    async fsbRefreshMcpCompatibility() {
      refreshCalls += 1;
    },
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
  };
  context.globalThis = context;

  const composition = [
    'const FSB_NATIVE_WAKE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;',
    'const FSB_NATIVE_WAKE_BRIDGE_TIMEOUT_MS = 100;',
    'const FSB_NATIVE_WAKE_BRIDGE_POLL_MS = 50;',
    "const FSB_MCP_BRIDGE_PAIRING_KEY = 'fsbMcpBridgePairing';",
    'let fsbAgentBridgeReadyAttempt = null;',
    extractFunction(backgroundSource, 'fsbNativeWakeBridgeReady'),
    extractFunction(backgroundSource, 'fsbAgentBridgeFailure'),
    extractFunction(backgroundSource, 'fsbWaitForAgentBridgeReady'),
    extractFunction(backgroundSource, 'fsbEnsureAgentBridgeReady'),
    'this.ensureReady = fsbEnsureAgentBridgeReady;',
  ].join('\n');
  vm.runInNewContext(composition, context, {
    filename: 'background.js#ensureAgentBridgeReady',
  });

  return {
    ensureReady: context.ensureReady,
    resolveBootstrap,
    sessionWrites,
    events,
    armReasons,
    get bootstrapCalls() {
      return bootstrapCalls;
    },
    get reloadCalls() {
      return reloadCalls;
    },
    get refreshCalls() {
      return refreshCalls;
    },
    get localWrites() {
      return localWrites;
    },
  };
}

function backgroundPreflightHarness(options = {}) {
  const originalResult = options.originalResult || {
    ok: false,
    code: 'agent_unpaired',
    providerId: 'claude-code',
    providerLabel: 'Claude Code',
  };
  const rerunResult = options.rerunResult || originalResult;
  let preflightCalls = 0;
  let readinessCalls = 0;
  const context = {
    Promise,
    Object,
    Array,
    RegExp,
    async fsbDelegationPreflightResult() {
      preflightCalls += 1;
      return {
        config: { providerKind: options.providerKind || 'agent' },
        result: preflightCalls === 1 ? originalResult : rerunResult,
      };
    },
    async fsbEnsureAgentBridgeReady() {
      readinessCalls += 1;
      if (options.bridgeError) throw new Error('bootstrap failed');
      return options.bridgeResult || { ok: false, code: 'bridge_not_ready' };
    },
  };
  context.globalThis = context;
  vm.runInNewContext([
    'const FSB_NATIVE_WAKE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;',
    extractFunction(backgroundSource, 'fsbDelegationHasExactKeys'),
    extractFunction(backgroundSource, 'fsbDelegationBridgePreflightFailure'),
    extractFunction(backgroundSource, 'fsbDelegationPreflightCommand'),
    'this.preflight = fsbDelegationPreflightCommand;',
  ].join('\n'), context, {
    filename: 'background.js#delegationNativePreflight',
  });
  return {
    run() {
      return context.preflight({
        type: 'FSB_DELEGATION_PREFLIGHT',
        task: 'Keep this browser task unsent',
      });
    },
    get preflightCalls() {
      return preflightCalls;
    },
    get readinessCalls() {
      return readinessCalls;
    },
  };
}

async function testBackgroundBootstrapCoalescing() {
  const harness = backgroundEnsureHarness();
  const first = harness.ensureReady('intent_bootstrap_0001');
  const second = harness.ensureReady('intent_bootstrap_0002');
  assert.equal(first, second);
  assert.equal(harness.bootstrapCalls, 1);
  assert.deepEqual(harness.events, [
    {
      type: 'FSB_NATIVE_WAKE_CHECKING',
      attemptId: 'attempt_bootstrap_0001',
      intentId: 'intent_bootstrap_0001',
    },
    {
      type: 'FSB_NATIVE_WAKE_CHECKING',
      attemptId: 'attempt_bootstrap_0001',
      intentId: 'intent_bootstrap_0002',
    },
  ]);
  harness.resolveBootstrap({
    ok: true,
    outcome: 'already_running',
    reason: 'daemon_already_ready',
    pairingCode,
  });
  assert.deepEqual(plain(await first), { ok: true });
  assert.deepEqual(harness.sessionWrites, [{
    fsbMcpBridgePairing: {
      pairingCode,
      storedAt: 123456,
    },
  }]);
  assert.equal(harness.localWrites, 0);
  assert.equal(harness.reloadCalls, 1);
  assert.equal(harness.refreshCalls, 1);
  assert.deepEqual(harness.armReasons, ['native-host-bootstrap']);
  assert.equal(JSON.stringify(await second).includes(pairingCode), false);

  const retry = backgroundEnsureHarness({ readyOnSecondReload: true });
  const retryPromise = retry.ensureReady();
  retry.resolveBootstrap({
    ok: true,
    outcome: 'started',
    reason: 'daemon_started_ready',
    pairingCode,
  });
  assert.deepEqual(plain(await retryPromise), { ok: true });
  assert.equal(retry.reloadCalls, 2);
  assert.deepEqual(retry.armReasons, [
    'native-host-bootstrap',
    'native-host-bootstrap-retry',
  ]);

  const missing = backgroundEnsureHarness({ nativeMissing: true });
  assert.deepEqual(plain(await missing.ensureReady()), {
    ok: false,
    code: 'native_host_missing',
  });
}

async function testBackgroundPreflightFailureMapping() {
  const providerFailure = {
    ok: false,
    code: 'agent_unpaired',
    providerId: 'claude-code',
    providerLabel: 'Claude Code',
  };
  for (const code of [
    'native_host_missing',
    'extension_origin_mismatch',
    'bridge_session_unavailable',
  ]) {
    const harness = backgroundPreflightHarness({
      originalResult: providerFailure,
      bridgeResult: { ok: false, code },
    });
    assert.deepEqual(plain(await harness.run()), {
      ok: false,
      code,
      providerId: 'claude-code',
      providerLabel: 'Claude Code',
    });
    assert.equal(harness.readinessCalls, 1);
    assert.equal(harness.preflightCalls, 1);
  }

  for (const failure of [
    { bridgeResult: { ok: false, code: 'serve_spawn_failed' } },
    { bridgeError: true },
  ]) {
    const harness = backgroundPreflightHarness({
      originalResult: providerFailure,
      ...failure,
    });
    assert.deepEqual(plain(await harness.run()), {
      ok: false,
      code: 'agent_offline',
      providerId: 'claude-code',
      providerLabel: 'Claude Code',
    });
  }

  const unrelatedFailure = {
    ok: false,
    code: 'unsupported_provider',
    providerId: 'unsupported-agent',
    providerLabel: 'Selected provider',
  };
  const unrelated = backgroundPreflightHarness({
    originalResult: unrelatedFailure,
    bridgeResult: { ok: false, code: 'extension_origin_mismatch' },
  });
  assert.deepEqual(plain(await unrelated.run()), unrelatedFailure);

  const readyResult = {
    ok: true,
    kind: 'agent',
    providerId: 'claude-code',
    providerLabel: 'Claude Code',
  };
  const ready = backgroundPreflightHarness({
    originalResult: providerFailure,
    bridgeResult: { ok: true },
    rerunResult: readyResult,
  });
  assert.deepEqual(plain(await ready.run()), readyResult);
  assert.equal(ready.preflightCalls, 2);
}

function backgroundFailureMessage(code, navigatorLike, extensionId) {
  const context = {
    navigator: navigatorLike,
    chrome: { runtime: { id: extensionId } },
  };
  context.globalThis = context;
  vm.runInNewContext(installCommandHelperSource, context, {
    filename: installCommandHelperPath,
  });
  vm.runInNewContext([
    extractFunction(backgroundSource, 'fsbCurrentNativeHostInstallCommand'),
    extractFunction(backgroundSource, 'fsbAgentBridgeFailureMessage'),
    'this.failureMessage = fsbAgentBridgeFailureMessage;',
  ].join('\n'), context, {
    filename: 'background.js#fsbAgentBridgeFailureMessage',
  });
  return context.failureMessage(code);
}

function testBackgroundAndUiContracts() {
  assert.match(
    backgroundSource,
    /function fsbEnsureAgentBridgeReady\(/,
  );
  assert.equal(
    (backgroundSource.match(/wakeController\.ensureBootstrap\(\)/g) || []).length,
    1,
  );
  assert.equal(
    (backgroundSource.match(/FsbNativeHostWake\.ensureWake\(\)/g) || []).length,
    0,
    'normal agent paths use bootstrap while the additive v1 helper remains available',
  );
  assert.match(
    backgroundSource,
    /chrome\.storage\.session\.set\(\{\s*\[FSB_MCP_BRIDGE_PAIRING_KEY\]/,
  );
  assert.doesNotMatch(
    extractFunction(backgroundSource, 'fsbEnsureAgentBridgeReady'),
    /chrome\.storage\.(?:local|sync)\.set/,
  );
  assert.match(
    extractFunction(backgroundSource, 'fsbDelegationPreflightCommand'),
    /fsbEnsureAgentBridgeReady\(/,
  );
  assert.match(
    extractFunction(backgroundSource, 'fsbDelegationConsentCommand'),
    /fsbEnsureConfiguredAgentBridgeReady\(/,
  );
  assert.match(
    extractFunction(backgroundSource, 'fsbDelegationStartCommand'),
    /fsbEnsureConfiguredAgentBridgeReady\(/,
  );
  assert.match(backgroundSource, /case 'testAgentProviderConnection':/);
  assert.match(
    backgroundSource,
    /sendExtRequest\(\s*'provider\.test-connection',\s*\{ providerId: providerId \},\s*\{ timeout: FSB_AGENT_CONNECTION_TEST_REQUEST_TIMEOUT_MS \}/,
  );
  assert.match(
    backgroundSource,
    /const FSB_AGENT_CONNECTION_TEST_REQUEST_TIMEOUT_MS = 120000;/,
    'connection-test transport covers detection, the 60-second probe, and cleanup',
  );
  assert.match(
    backgroundSource,
    /importScripts\('utils\/native-host-install-command\.js'\)/,
  );
  const edgeInstallMessage = backgroundFailureMessage(
    'native_host_missing',
    { userAgentData: { brands: [{ brand: 'Microsoft Edge' }] } },
    'abcdefghijklmnopabcdefghijklmnop',
  );
  assert.match(
    edgeInstallMessage,
    /install --native-host --browser edge --extension-id abcdefghijklmnopabcdefghijklmnop$/,
  );
  const mismatchMessage = backgroundFailureMessage(
    'extension_origin_mismatch',
    {},
    'abcdefghijklmnopabcdefghijklmnop',
  );
  assert.match(mismatchMessage, /npx -y fsb-mcp-server pair --reset/);
  assert.match(mismatchMessage, /Then try again so FSB can pair this extension automatically\./);
  assert.doesNotMatch(mismatchMessage, /install --native-host|reinstall/i);
  assert.doesNotMatch(
    backgroundFailureMessage('native_host_missing', {}, 'invalid'),
    /npx -y fsb-mcp-server/,
    'an invalid runtime id never reaches a shell command',
  );

  const helperAuthority = helperSource
    .replace(/pairingCode/g, '')
    .replace(/PAIRING_CODE_PATTERN/g, '');
  assert.doesNotMatch(helperAuthority, /chrome\.storage|console\.|delegate\.start|task|prompt/i);
  assert.match(helperSource, /v: NATIVE_PROTOCOL_VERSION,\s*action: 'wake'/);
  assert.match(helperSource, /v: NATIVE_BOOTSTRAP_PROTOCOL_VERSION,\s*action: 'bootstrap'/);

  const manifest = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, 'extension', 'manifest.json'),
    'utf8',
  ));
  assert.equal(
    manifest.permissions.filter((permission) => permission === 'nativeMessaging').length,
    1,
  );
}

async function main() {
  testInstallCommandHelper();
  await testHelperV1Compatibility();
  await testHelperV2Bootstrap();
  await testHelperPresenceAndBounds();
  await testBackgroundBootstrapCoalescing();
  await testBackgroundPreflightFailureMapping();
  testBackgroundAndUiContracts();
  console.log('native-host-background-wake.test.js: PASS');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
