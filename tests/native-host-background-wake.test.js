'use strict';

const fs = require('fs');
const nodeCrypto = require('crypto');
const path = require('path');
const util = require('util');
const vm = require('vm');

const delegationProviders = require(path.join(
  __dirname,
  '..',
  'extension',
  'utils',
  'delegation-providers.js'
));
const CLAUDE_ACCEPTED_IDENTITY = delegationProviders.createAcceptedAgentIdentity(
  'claude-code',
  'unknown'
);

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

function toPlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertDeepEqual(actual, expected, message) {
  assert(
    util.isDeepStrictEqual(toPlain(actual), toPlain(expected)),
    `${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`
  );
}

async function flushMicrotasks() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
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

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    },
    removeListener(listener) {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    },
    emit(...args) {
      [...listeners].forEach((listener) => listener(...args));
    }
  };
}

function createFakeTimers() {
  let now = 1000;
  const timers = [];
  return {
    timers,
    now() {
      return now;
    },
    advance(milliseconds) {
      now += milliseconds;
    },
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false, ran: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
    runDelay(delay) {
      const timer = timers.find((entry) => (
        entry.delay === delay && entry.cleared === false && entry.ran === false
      ));
      if (!timer) throw new Error(`No live timer with delay ${delay}`);
      timer.ran = true;
      timer.callback();
      return timer;
    }
  };
}

function createNativeRuntime(options = {}) {
  const connectCalls = [];
  const nativeCalls = [];
  const ports = [];
  let nativeCallback = null;

  const runtime = {
    lastError: undefined,
    connectNative(hostName) {
      connectCalls.push(hostName);
      if (options.connectThrows) throw new Error('connect failed');
      const onMessage = createEvent();
      const onDisconnect = createEvent();
      const port = {
        onMessage,
        onDisconnect,
        postMessageCalls: [],
        disconnectCalls: 0,
        postMessage(value) {
          this.postMessageCalls.push(value);
        },
        disconnect() {
          this.disconnectCalls += 1;
          if (options.disconnectEmits !== false) onDisconnect.emit();
        },
        emitDisconnect(errorMessage) {
          runtime.lastError = errorMessage ? { message: errorMessage } : undefined;
          onDisconnect.emit();
          runtime.lastError = undefined;
        }
      };
      ports.push(port);
      return port;
    },
    sendNativeMessage(hostName, message, callback) {
      nativeCalls.push({ hostName, message });
      nativeCallback = callback;
      if (options.sendThrows) throw new Error('send failed');
    }
  };

  return {
    runtime,
    connectCalls,
    nativeCalls,
    ports,
    respond(value, errorMessage) {
      if (typeof nativeCallback !== 'function') throw new Error('No native callback pending');
      runtime.lastError = errorMessage ? { message: errorMessage } : undefined;
      nativeCallback(value);
      runtime.lastError = undefined;
    }
  };
}

function buildControllerHarness(options = {}) {
  const timers = createFakeTimers();
  const native = createNativeRuntime(options);
  let uuidCounter = 0;
  const crypto = {
    randomUUID() {
      uuidCounter += 1;
      const suffix = uuidCounter.toString(16).padStart(12, '0');
      return `00000000-0000-4000-8000-${suffix}`;
    }
  };
  const context = {
    chrome: { runtime: native.runtime },
    crypto,
    Date: { now: timers.now },
    Promise,
    Object,
    Array,
    Reflect,
    RegExp,
    Number,
    String,
    Error,
    Uint8Array,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    console
  };
  context.globalThis = context;
  const sourcePath = path.join(
    __dirname,
    '..',
    'extension',
    'utils',
    'native-host-wake.js'
  );
  const source = fs.readFileSync(sourcePath, 'utf8');
  vm.runInNewContext(`${source}\nthis.__wake = globalThis.FsbNativeHostWake;`, context, {
    filename: 'extension/utils/native-host-wake.js'
  });
  return {
    api: context.__wake,
    context,
    native,
    source,
    timers
  };
}

function validResponse(call, overrides = {}) {
  return {
    v: 1,
    correlationId: call.message.correlationId,
    outcome: 'already_running',
    reason: 'daemon_already_ready',
    ...overrides
  };
}

function extractNamedFunctionSource(source, anchor) {
  const start = source.indexOf(anchor);
  if (start === -1) throw new Error(`${anchor} not found`);
  let depth = 0;
  for (let index = start + anchor.length - 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unbalanced braces while extracting ${anchor}`);
}

function extractNativePreflightComposition(backgroundSource) {
  const exactKeys = extractNamedFunctionSource(
    backgroundSource,
    'function fsbDelegationHasExactKeys(value, expected) {'
  );
  const acceptedIdentity = extractNamedFunctionSource(
    backgroundSource,
    'function fsbDelegationAcceptedIdentity(value) {'
  );
  const startMarker = 'async function fsbReadAuthoritativeProviderConfig() {';
  const endMarker = '\nasync function fsbDelegationConsentCommand(request) {';
  const start = backgroundSource.indexOf(startMarker);
  const end = backgroundSource.indexOf(endMarker, start);
  if (start === -1 || end <= start) throw new Error('native preflight composition markers missing');
  return `${exactKeys}\n${acceptedIdentity}\n${backgroundSource.slice(start, end)}`;
}

function buildBackgroundPreflightHarness(options = {}) {
  const backgroundPath = path.join(__dirname, '..', 'extension', 'background.js');
  const backgroundSource = fs.readFileSync(backgroundPath, 'utf8');
  const composition = extractNativePreflightComposition(backgroundSource);
  const preflight = require(path.join(
    __dirname,
    '..',
    'extension',
    'utils',
    'delegation-preflight.js'
  ));
  const wakeGate = deferred();
  Object.defineProperty(wakeGate.promise, 'attemptId', {
    value: 'attempt_native_wake_0001',
    enumerable: false
  });
  const calls = {
    arm: [],
    controller: 0,
    consent: 0,
    events: [],
    localGets: 0,
    sessionWrites: 0,
    startRequests: 0,
    tabCalls: 0,
    timers: 0,
    wake: 0
  };
  let providerConfig = {
    providerKind: 'agent',
    agentProviderId: 'claude-code',
    modelProvider: 'xai',
    ...(options.providerConfig || {})
  };
  let bridgeState = {
    connected: false,
    status: 'disconnected',
    pairingStatus: 'unpaired',
    delegationConnection: { state: 'disconnected' },
    ...(options.bridgeState || {})
  };
  const chrome = {
    storage: {
      local: {
        async get() {
          calls.localGets += 1;
          if (options.rejectConfigReadAt === calls.localGets) throw new Error('config read failed');
          return { ...providerConfig };
        }
      },
      session: {
        async set() {
          calls.sessionWrites += 1;
        }
      }
    },
    runtime: {
      sendMessage(event) {
        calls.events.push(toPlain(event));
        return Promise.resolve();
      }
    },
    tabs: {
      async query() {
        calls.tabCalls += 1;
        return [];
      }
    }
  };
  const bridge = {
    getState() {
      return bridgeState;
    },
    sendExtRequest(method) {
      if (method === 'delegate.start') calls.startRequests += 1;
      throw new Error('transport authority must not run during preflight wake');
    }
  };
  const context = {
    chrome,
    FsbDelegationProviders: delegationProviders,
    FsbMcpAgentProviders: {
      async getMergedClients() {
        return {
          'claude-code': {
            compatibility: {
              status: 'supported',
              reason: 'within_tested_range',
              checkedAt: 1000
            },
            acceptedIdentity: CLAUDE_ACCEPTED_IDENTITY
          }
        };
      }
    },
    fsbAgentRegistryInstance: {
      listAgents() { return []; }
    },
    FsbDelegationPreflight: preflight,
    FsbNativeHostWake: {
      ensureWake() {
        calls.wake += 1;
        return wakeGate.promise;
      }
    },
    FsbDelegationConsent: {
      getTrusted() {
        calls.consent += 1;
        throw new Error('consent authority must not run during preflight wake');
      }
    },
    FsbDelegationController: {
      create() {
        calls.controller += 1;
        throw new Error('controller authority must not run during preflight wake');
      }
    },
    mcpBridgeClient: bridge,
    armMcpBridge(reason) {
      calls.arm.push(reason);
    },
    setTimeout(callback, delay) {
      calls.timers += 1;
      if (typeof options.onBridgePoll === 'function') {
        options.onBridgePoll({ calls, delay, setBridgeState });
      }
      callback();
      return calls.timers;
    },
    clearTimeout() {},
    Promise,
    Object,
    Array,
    Number,
    String,
    RegExp,
    Set,
    Map,
    Error,
    console
  };
  context.globalThis = context;
  vm.runInNewContext(
    `${composition}\nthis.__preflightCommand = fsbDelegationPreflightCommand;`,
    context,
    { filename: 'background.js#native-wake-preflight' }
  );

  function setBridgeState(next) {
    bridgeState = { ...next };
  }

  return {
    backgroundSource,
    calls,
    command: context.__preflightCommand,
    rejectWake: wakeGate.reject,
    resolveWake: wakeGate.resolve,
    setBridgeState,
    setProviderConfig(next) {
      providerConfig = { ...next };
    }
  };
}

async function testSilentPresenceProbe() {
  console.log('\n--- controller: silent advisory presence probe ---');
  const harness = buildControllerHarness();
  const { api, native, timers } = harness;

  assert(api && Object.isFrozen(api), 'controller exports one frozen background helper');
  assertDeepEqual(
    Object.keys(api).sort(),
    ['ensureWake', 'getPresence', 'probePresence'],
    'controller exposes only probe, advisory read, and wake operations'
  );
  assertEqual(api.getPresence(), 'unknown', 'presence begins unknown');

  const probe = api.probePresence();
  assertEqual(native.connectCalls.length, 1, 'probe calls connectNative exactly once');
  assertEqual(native.connectCalls[0], 'io.github.fullselfbrowsing.fsb_native_host', 'probe uses the frozen host name');
  assertEqual(native.ports[0].onMessage.listeners.length, 1, 'probe installs the message listener immediately');
  assertEqual(native.ports[0].onDisconnect.listeners.length, 1, 'probe installs the disconnect listener immediately');
  assertEqual(native.ports[0].postMessageCalls.length, 0, 'probe never posts a native message');
  assertEqual(native.nativeCalls.length, 0, 'probe never calls sendNativeMessage');

  timers.runDelay(250);
  assertEqual(await probe, 'present', 'an open bounded probe records present');
  assertEqual(api.getPresence(), 'present', 'present is cached only in memory');
  assertEqual(native.ports[0].disconnectCalls, 1, 'probe closes the native port on its short timer');
  assertEqual(await api.probePresence(), 'present', 'subsequent probes return the cached advisory fact');
  assertEqual(native.connectCalls.length, 1, 'cached probe does not launch another host process');

  const absentHarness = buildControllerHarness({ disconnectEmits: false });
  const absentProbe = absentHarness.api.probePresence();
  absentHarness.native.ports[0].emitDisconnect('Specified native messaging host not found.');
  assertEqual(await absentProbe, 'absent', 'runtime.lastError records only absent advisory state');
  assertEqual(absentHarness.api.getPresence(), 'absent', 'absent state is cached without error text');

  const unknownHarness = buildControllerHarness({ connectThrows: true });
  assertEqual(await unknownHarness.api.probePresence(), 'unknown', 'synchronous probe failure remains unknown');
  assertEqual(unknownHarness.api.getPresence(), 'unknown', 'unknown state contains no raw failure');
}

async function testOneFlightPositiveWake() {
  console.log('\n--- controller: one-flight positive wake ---');
  const harness = buildControllerHarness();
  const first = harness.api.ensureWake();
  const second = harness.api.ensureWake();

  assert(first === second, 'concurrent callers receive the same work promise');
  assert(/^[A-Za-z0-9_-]{16,64}$/.test(first.attemptId), 'shared work exposes one safe attempt id');
  assertEqual(harness.native.nativeCalls.length, 1, 'concurrent callers issue one native request');
  const call = harness.native.nativeCalls[0];
  assertEqual(call.hostName, 'io.github.fullselfbrowsing.fsb_native_host', 'wake uses the frozen host name');
  assertDeepEqual(Object.keys(call.message), ['v', 'action', 'correlationId'], 'wake request has the exact v1 keys');
  assertEqual(call.message.v, 1, 'wake request uses protocol v1');
  assertEqual(call.message.action, 'wake', 'wake request uses the sole action');
  assert(/^[A-Za-z0-9_-]{16,64}$/.test(call.message.correlationId), 'wake correlation is cryptographically minted and bounded');
  assertEqual(harness.timers.timers.filter((timer) => timer.delay === 12000).length, 1, 'wake arms one 12 second timeout');

  harness.native.respond(validResponse(call));
  const result = await first;
  assertDeepEqual(
    result,
    { ok: true, outcome: 'already_running', reason: 'daemon_already_ready' },
    'exact already-running response becomes a positive reachability fact'
  );
  assert(Object.isFrozen(result), 'wake result is frozen');

  const startedHarness = buildControllerHarness();
  const started = startedHarness.api.ensureWake();
  const startedCall = startedHarness.native.nativeCalls[0];
  startedHarness.native.respond(validResponse(startedCall, {
    outcome: 'started',
    reason: 'daemon_started_ready'
  }));
  assertDeepEqual(
    await started,
    { ok: true, outcome: 'started', reason: 'daemon_started_ready' },
    'exact started response is the only other positive reachability fact'
  );
}

async function settleMalformedResponse(responseFactory, message) {
  const harness = buildControllerHarness();
  const pending = harness.api.ensureWake();
  const call = harness.native.nativeCalls[0];
  harness.native.respond(responseFactory(call));
  assertDeepEqual(await pending, { ok: false }, message);
}

async function testClosedResponseMatrix() {
  console.log('\n--- controller: closed response and failure matrix ---');
  await settleMalformedResponse(() => null, 'null response fails closed');
  await settleMalformedResponse((call) => ({ ...validResponse(call), extra: true }), 'extra response key fails closed');
  await settleMalformedResponse((call) => ({ ...validResponse(call), v: 2 }), 'wrong protocol version fails closed');
  await settleMalformedResponse((call) => ({ ...validResponse(call), correlationId: 'mismatch_correlation_0000' }), 'correlation mismatch fails closed');
  await settleMalformedResponse((call) => ({ ...validResponse(call), reason: 'daemon_started_ready' }), 'outcome and reason mismatch fails closed');
  await settleMalformedResponse((call) => validResponse(call, {
    outcome: 'unavailable',
    reason: 'runtime_invalid'
  }), 'valid unavailable response is not a positive reachability fact');
  await settleMalformedResponse((call) => validResponse(call, {
    outcome: 'failed',
    reason: 'serve_readiness_timeout'
  }), 'valid failed response is not a positive reachability fact');

  const prototypeHarness = buildControllerHarness();
  const prototypePending = prototypeHarness.api.ensureWake();
  const prototypeCall = prototypeHarness.native.nativeCalls[0];
  const polluted = Object.create({ inherited: true });
  Object.assign(polluted, validResponse(prototypeCall));
  prototypeHarness.native.respond(polluted);
  assertDeepEqual(await prototypePending, { ok: false }, 'prototype-bearing response fails closed');

  const lastErrorHarness = buildControllerHarness();
  const lastErrorPending = lastErrorHarness.api.ensureWake();
  lastErrorHarness.native.respond(undefined, 'Native host unavailable');
  assertDeepEqual(await lastErrorPending, { ok: false }, 'runtime.lastError fails closed without content');

  const throwHarness = buildControllerHarness({ sendThrows: true });
  assertDeepEqual(await throwHarness.api.ensureWake(), { ok: false }, 'synchronous native API failure fails closed');
}

async function testTimeoutCooldownAndLateFence() {
  console.log('\n--- controller: timeout, cooldown, and late settlement fence ---');
  const harness = buildControllerHarness();
  const pending = harness.api.ensureWake();
  const firstCall = harness.native.nativeCalls[0];
  harness.timers.runDelay(12000);
  assertDeepEqual(await pending, { ok: false }, '12 second timeout settles offline');

  const cooldown = harness.api.ensureWake();
  assertEqual(harness.native.nativeCalls.length, 1, 'failure cooldown suppresses another native request');
  assertDeepEqual(await cooldown, { ok: false }, 'cooldown remains a closed offline fact');

  harness.native.respond(validResponse(firstCall));
  await flushMicrotasks();
  assertEqual(harness.native.nativeCalls.length, 1, 'late native callback cannot reopen or replace the settled attempt');

  harness.timers.advance(5001);
  const retry = harness.api.ensureWake();
  assertEqual(harness.native.nativeCalls.length, 2, 'a fresh explicit intent may retry after the five second cooldown');
  assert(retry !== pending, 'post-cooldown retry has a new work promise');
  assert(retry.attemptId !== pending.attemptId, 'post-cooldown retry has a new attempt id');
  harness.native.respond(validResponse(harness.native.nativeCalls[1]));
  assertEqual((await retry).ok, true, 'post-cooldown retry may settle positively');
}

function testControllerAuthoritySource() {
  console.log('\n--- controller: background-only authority source ---');
  const harness = buildControllerHarness();
  assert(!/delegate\.start|FSB_DELEGATION_START/.test(harness.source), 'controller cannot start delegation');
  assert(!/chrome\.storage|storage\.(?:local|session)/.test(harness.source), 'controller cannot read or write persisted state');
  assert(!/pairing|sessionSecret|bridgeSecret|apiKey|task|prompt/i.test(harness.source), 'controller cannot read pairing, secret, task, or prompt data');
  assert(!/chrome\.tabs|chrome\.windows|chrome\.sidePanel/.test(harness.source), 'controller cannot mutate browser or UI authority');
}

function collectJavaScriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectJavaScriptFiles(absolutePath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(absolutePath);
  }
  return files.sort();
}

function testManifestAndBackgroundAuthority() {
  console.log('\n--- manifest-and-authority: exact additive permission ---');
  const extensionRoot = path.join(__dirname, '..', 'extension');
  const manifestPath = path.join(extensionRoot, 'manifest.json');
  const manifestSource = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestSource);

  assertDeepEqual(manifest.permissions, [
    'activeTab',
    'scripting',
    'storage',
    'unlimitedStorage',
    'tabs',
    'windows',
    'sidePanel',
    'debugger',
    'webNavigation',
    'alarms',
    'clipboardWrite',
    'offscreen',
    'nativeMessaging',
    'system.memory'
  ], 'manifest adds nativeMessaging once without changing permission order');
  assertEqual(
    manifest.permissions.filter((permission) => permission === 'nativeMessaging').length,
    1,
    'manifest contains exactly one nativeMessaging permission'
  );
  const withoutNativePermission = manifestSource.replace('    "nativeMessaging",\n', '');
  const baselineHash = nodeCrypto
    .createHash('sha256')
    .update(withoutNativePermission)
    .digest('hex');
  assertEqual(
    baselineHash,
    '838c12927d31d5595e827d137feed455ac4f1d6d8866915b9bb219c3379c0476',
    'every other manifest byte remains unchanged'
  );

  console.log('\n--- manifest-and-authority: background-only native surface ---');
  const nativePrimitivePattern = /connectNative|sendNativeMessage|io\.github\.fullselfbrowsing\.fsb_native_host/;
  const nativeFiles = collectJavaScriptFiles(extensionRoot)
    .filter((file) => nativePrimitivePattern.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(extensionRoot, file).split(path.sep).join('/'));
  assertDeepEqual(
    nativeFiles,
    ['utils/native-host-wake.js'],
    'native APIs and the host name exist only in the approved background helper'
  );

  const backgroundSource = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
  const wakeCalls = backgroundSource.match(/FsbNativeHostWake\.ensureWake\(\)/g) || [];
  const commandStart = backgroundSource.indexOf('async function fsbDelegationPreflightCommand(request) {');
  const commandEnd = backgroundSource.indexOf('\nasync function fsbDelegationConsentCommand(request) {', commandStart);
  const wakeCall = backgroundSource.indexOf('FsbNativeHostWake.ensureWake()');
  assertEqual(wakeCalls.length, 1, 'background contains one actual wake join');
  assert(
    commandStart !== -1 && commandEnd > commandStart && wakeCall > commandStart && wakeCall < commandEnd,
    'the sole wake join is confined to delegation preflight'
  );
  const commandSource = backgroundSource.slice(commandStart, commandEnd);
  assert(
    commandSource.indexOf("authority.result.code !== 'agent_offline'") < commandSource.indexOf('FsbNativeHostWake.ensureWake()'),
    'authoritative agent_offline gating precedes the sole wake join'
  );
  assertDeepEqual(
    collectJavaScriptFiles(extensionRoot)
      .filter((file) => file !== path.join(extensionRoot, 'background.js'))
      .filter((file) => /FsbNativeHostWake\.ensureWake\(\)/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(extensionRoot, file).split(path.sep).join('/')),
    [],
    'boot, refresh, setup, doctor-copy, tab, and UI modules cannot call actual wake'
  );
}

async function testBootCompositionIsProbeOnly() {
  console.log('\n--- background-integration: boot probe composition ---');
  const harness = buildBackgroundPreflightHarness();
  const helperImport = "importScripts('utils/native-host-wake.js')";
  const helperImportIndex = harness.backgroundSource.indexOf(helperImport);
  const bridgeImportIndex = harness.backgroundSource.indexOf("importScripts('ws/mcp-bridge-client.js')");
  const probeIndex = harness.backgroundSource.indexOf('FsbNativeHostWake.probePresence()');

  assert(helperImportIndex !== -1, 'background loads the native wake helper');
  assert(bridgeImportIndex !== -1 && probeIndex > bridgeImportIndex, 'boot probe starts only after the bridge dependency is loaded');
  const bootSlice = probeIndex === -1 ? '' : harness.backgroundSource.slice(probeIndex, probeIndex + 300);
  assert(!bootSlice.includes('ensureWake'), 'boot composition never calls actual wake');
  assert(!bootSlice.includes('sendMessage'), 'boot composition emits no UI event');
  assert(!/^\s*await\s+globalThis\.FsbNativeHostWake\.probePresence/m.test(harness.backgroundSource), 'boot does not await advisory probing for bootstrap');
}

async function testNonOfflinePreflightNeverWakes() {
  console.log('\n--- background-integration: non-offline paths never wake ---');
  const cases = [
    {
      name: 'API provider',
      providerConfig: { providerKind: 'api', agentProviderId: 'claude-code', modelProvider: 'xai' },
      bridgeState: {},
      expected: { ok: true, kind: 'api', providerId: 'xai', agentProviderId: '' }
    },
    {
      name: 'ready agent',
      bridgeState: {
        connected: true,
        status: 'connected',
        pairingStatus: 'paired',
        delegationConnection: { state: 'connected' }
      },
      expected: {
        ok: true,
        kind: 'agent',
        providerId: 'claude-code',
        providerLabel: 'Claude Code',
        acceptedIdentity: CLAUDE_ACCEPTED_IDENTITY
      }
    },
    {
      name: 'reachable unpaired agent',
      bridgeState: {
        connected: true,
        status: 'connected',
        pairingStatus: 'unpaired',
        delegationConnection: { state: 'connected' }
      },
      expected: { ok: false, code: 'agent_unpaired', providerId: 'claude-code', providerLabel: 'Claude Code' }
    },
    {
      name: 'unsupported agent',
      providerConfig: { providerKind: 'agent', agentProviderId: 'foreign-agent', modelProvider: 'xai' },
      bridgeState: {},
      expected: {
        ok: false,
        code: 'unsupported_provider',
        providerId: 'foreign-agent',
        providerLabel: 'foreign-agent'
      }
    }
  ];

  for (const scenario of cases) {
    const harness = buildBackgroundPreflightHarness(scenario);
    const result = await harness.command({
      type: 'FSB_DELEGATION_PREFLIGHT',
      task: 'Keep this intent unsent',
      intentId: 'intent_native_wake_0001'
    });
    assertDeepEqual(result, scenario.expected, `${scenario.name} returns the unchanged preflight shape`);
    assertEqual(harness.calls.wake, 0, `${scenario.name} issues zero native wake calls`);
    assertEqual(harness.calls.events.length, 0, `${scenario.name} emits zero checking events`);
    assertEqual(harness.calls.localGets, 1, `${scenario.name} evaluates preflight exactly once`);
  }
}

async function testConcurrentOfflineIntentsShareContinuation() {
  console.log('\n--- background-integration: concurrent offline intents ---');
  const harness = buildBackgroundPreflightHarness();
  let firstSettled = false;
  let secondSettled = false;
  const first = harness.command({
    type: 'FSB_DELEGATION_PREFLIGHT',
    task: 'First unsent intent',
    intentId: 'intent_native_wake_0001'
  }).then((value) => {
    firstSettled = true;
    return value;
  });
  const second = harness.command({
    type: 'FSB_DELEGATION_PREFLIGHT',
    task: 'Second unsent intent',
    intentId: 'intent_native_wake_0002'
  }).then((value) => {
    secondSettled = true;
    return value;
  });
  await flushMicrotasks();

  assertEqual(harness.calls.wake, 2, 'each offline caller joins the helper-owned shared promise');
  assertEqual(harness.calls.events.length, 2, 'each current intent receives one checking event');
  assertDeepEqual(harness.calls.events[0], {
    type: 'FSB_NATIVE_WAKE_CHECKING',
    attemptId: 'attempt_native_wake_0001',
    intentId: 'intent_native_wake_0001'
  }, 'first checking event has the exact closed attempt/intent shape');
  assertDeepEqual(harness.calls.events[1], {
    type: 'FSB_NATIVE_WAKE_CHECKING',
    attemptId: 'attempt_native_wake_0001',
    intentId: 'intent_native_wake_0002'
  }, 'joining intent receives the same attempt id and its own intent id');
  assertEqual(firstSettled, false, 'first command promise stays open while native wake is pending');
  assertEqual(secondSettled, false, 'joining command promise stays open while native wake is pending');

  harness.setBridgeState({
    connected: true,
    status: 'connected',
    pairingStatus: 'paired',
    delegationConnection: { state: 'connected' }
  });
  harness.resolveWake({ ok: true, outcome: 'started', reason: 'daemon_started_ready' });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  const expected = {
    ok: true,
    kind: 'agent',
    providerId: 'claude-code',
    providerLabel: 'Claude Code',
    acceptedIdentity: CLAUDE_ACCEPTED_IDENTITY
  };
  assertDeepEqual(firstResult, expected, 'first caller returns the exact existing ready result');
  assertDeepEqual(secondResult, expected, 'joining caller returns the exact existing ready result');
  assertEqual(harness.calls.arm.length, 1, 'concurrent callers share one bridge readiness wait');
  assertEqual(harness.calls.localGets, 4, 'each caller evaluates preflight once initially and once after readiness');
  assertEqual(harness.calls.startRequests, 0, 'positive wake never replays delegate.start');
  assertEqual(harness.calls.consent, 0, 'positive wake never creates consent authority');
  assertEqual(harness.calls.controller, 0, 'positive wake never creates controller/session authority');
  assertEqual(harness.calls.tabCalls, 0, 'positive wake never allocates or queries tab authority');
  assertEqual(harness.calls.sessionWrites, 0, 'positive wake never persists optimistic state');
}

async function testWakeFailureReturnsOriginalOffline() {
  console.log('\n--- background-integration: failure preserves exact offline result ---');
  const harness = buildBackgroundPreflightHarness();
  const pending = harness.command({
    type: 'FSB_DELEGATION_PREFLIGHT',
    task: 'Still unsent',
    intentId: 'intent_native_wake_0003'
  });
  await flushMicrotasks();
  harness.resolveWake({ ok: false });
  assertDeepEqual(await pending, {
    ok: false,
    code: 'agent_offline',
    providerId: 'claude-code',
    providerLabel: 'Claude Code'
  }, 'native failure returns the original exact offline result');
  assertEqual(harness.calls.localGets, 1, 'native failure does not rerun preflight');
  assertEqual(harness.calls.arm.length, 0, 'native failure does not wait for bridge readiness');
  assertEqual(harness.calls.startRequests, 0, 'native failure cannot replay start');
}

async function testBridgeAndRerunConvergence() {
  console.log('\n--- background-integration: bridge and rerun convergence ---');
  const timeoutHarness = buildBackgroundPreflightHarness();
  const timedOut = timeoutHarness.command({
    type: 'FSB_DELEGATION_PREFLIGHT',
    task: 'Bridge remains offline',
    intentId: 'intent_native_wake_0004'
  });
  await flushMicrotasks();
  timeoutHarness.resolveWake({ ok: true, outcome: 'already_running', reason: 'daemon_already_ready' });
  assertDeepEqual(await timedOut, {
    ok: false,
    code: 'agent_offline',
    providerId: 'claude-code',
    providerLabel: 'Claude Code'
  }, 'bridge readiness timeout preserves the original offline result');
  assertEqual(timeoutHarness.calls.timers, 100, 'bridge wait is bounded to five seconds in 50 ms slices');
  assertEqual(timeoutHarness.calls.localGets, 1, 'readiness timeout performs no optimistic rerun');

  const unpairedHarness = buildBackgroundPreflightHarness({
    onBridgePoll({ calls, setBridgeState }) {
      if (calls.timers === 1) {
        setBridgeState({
          connected: true,
          status: 'connected',
          pairingStatus: 'unpaired',
          delegationConnection: { state: 'connected' }
        });
      }
    }
  });
  const unpaired = unpairedHarness.command({
    type: 'FSB_DELEGATION_PREFLIGHT',
    task: 'Reachable but unpaired',
    intentId: 'intent_native_wake_0005'
  });
  await flushMicrotasks();
  unpairedHarness.resolveWake({ ok: true, outcome: 'started', reason: 'daemon_started_ready' });
  assertDeepEqual(await unpaired, {
    ok: false,
    code: 'agent_unpaired',
    providerId: 'claude-code',
    providerLabel: 'Claude Code'
  }, 'reachable unpaired rerun returns the existing exact unpaired result');
  assertEqual(unpairedHarness.calls.localGets, 2, 'unpaired convergence reruns preflight exactly once');

  const rerunFailure = buildBackgroundPreflightHarness({ rejectConfigReadAt: 2 });
  const rerunPending = rerunFailure.command({
    type: 'FSB_DELEGATION_PREFLIGHT',
    task: 'Rerun read fails',
    intentId: 'intent_native_wake_0006'
  });
  await flushMicrotasks();
  rerunFailure.setBridgeState({
    connected: true,
    status: 'connected',
    pairingStatus: 'paired',
    delegationConnection: { state: 'connected' }
  });
  rerunFailure.resolveWake({ ok: true, outcome: 'started', reason: 'daemon_started_ready' });
  assertDeepEqual(await rerunPending, {
    ok: false,
    code: 'agent_offline',
    providerId: 'claude-code',
    providerLabel: 'Claude Code'
  }, 'rerun exception returns the captured original offline result');
  assertEqual(rerunFailure.calls.localGets, 2, 'rerun failure still attempts at most one rerun');
}

async function testInvalidIntentFailsBeforeNativeAuthority() {
  console.log('\n--- background-integration: exact optional intent validation ---');
  const harness = buildBackgroundPreflightHarness();
  const result = await harness.command({
    type: 'FSB_DELEGATION_PREFLIGHT',
    task: 'Invalid caller id',
    intentId: 'bad'
  });
  assertDeepEqual(result, { ok: false, code: 'invalid_request' }, 'malformed explicit intent id fails closed');
  assertEqual(harness.calls.localGets, 0, 'invalid intent fails before provider reads');
  assertEqual(harness.calls.wake, 0, 'invalid intent fails before native authority');
  assertEqual(harness.calls.events.length, 0, 'invalid intent emits no checking event');
}

async function runControllerSection() {
  await testSilentPresenceProbe();
  await testOneFlightPositiveWake();
  await testClosedResponseMatrix();
  await testTimeoutCooldownAndLateFence();
  testControllerAuthoritySource();
}

async function runBackgroundIntegrationSection() {
  await testBootCompositionIsProbeOnly();
  await testNonOfflinePreflightNeverWakes();
  await testConcurrentOfflineIntentsShareContinuation();
  await testWakeFailureReturnsOriginalOffline();
  await testBridgeAndRerunConvergence();
  await testInvalidIntentFailsBeforeNativeAuthority();
}

function runManifestAndAuthoritySection() {
  testManifestAndBackgroundAuthority();
}

async function main() {
  const sectionIndex = process.argv.indexOf('--section');
  const section = sectionIndex === -1 ? null : process.argv[sectionIndex + 1];
  if (section === null || section === 'controller') await runControllerSection();
  if (section === null || section === 'background-integration') {
    await runBackgroundIntegrationSection();
  }
  if (section === null || section === 'manifest-and-authority') {
    runManifestAndAuthoritySection();
  }
  if (section !== null
      && section !== 'controller'
      && section !== 'background-integration'
      && section !== 'manifest-and-authority') {
    throw new Error(`Unknown section: ${section}`);
  }

  console.log(`\nNative host background wake tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
