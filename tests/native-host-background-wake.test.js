'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const vm = require('vm');

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

async function runControllerSection() {
  await testSilentPresenceProbe();
  await testOneFlightPositiveWake();
  await testClosedResponseMatrix();
  await testTimeoutCooldownAndLateFence();
  testControllerAuthoritySource();
}

async function main() {
  const sectionIndex = process.argv.indexOf('--section');
  const section = sectionIndex === -1 ? null : process.argv[sectionIndex + 1];
  if (section === null || section === 'controller') await runControllerSection();
  else throw new Error(`Unknown section: ${section}`);

  console.log(`\nNative host background wake tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
