'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { PassThrough, Writable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const supervisorBuildPath = path.join(
  repoRoot,
  'mcp',
  'build',
  'agent-providers',
  'spawn-supervisor.js',
);
const registryBuildPath = path.join(
  repoRoot,
  'mcp',
  'build',
  'agent-providers',
  'registry.js',
);

function startRequest(payload, overrides = {}) {
  return {
    id: 'ext-start-1',
    type: 'ext:request',
    method: 'delegate.start',
    payload,
    ...overrides,
  };
}

function cancelRequest(delegationId, overrides = {}) {
  return {
    id: 'ext-cancel-1',
    type: 'ext:request',
    method: 'delegate.cancel',
    payload: { delegationId },
    ...overrides,
  };
}

function normalizedEvent(type, payload = {}) {
  return { type, sessionId: 'session_fixture_0001', payload };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function* parseNormalizedLines(stream) {
  let pending = '';
  for await (const chunk of stream) {
    pending += chunk.toString('utf8');
    while (true) {
      const newline = pending.indexOf('\n');
      if (newline < 0) break;
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      if (!line) continue;
      if (line === 'DRIFT') {
        throw Object.assign(new Error('fixture protocol drift'), { code: 'agent_protocol_drift' });
      }
      yield JSON.parse(line);
    }
  }
  if (pending) {
    if (pending === 'DRIFT') {
      throw Object.assign(new Error('fixture protocol drift'), { code: 'agent_protocol_drift' });
    }
    yield JSON.parse(pending);
  }
}

function makeChild(options = {}) {
  const child = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdinBytes = [];
  let closed = false;

  const close = (exit = { code: 0, signal: null }) => {
    if (closed) return;
    closed = true;
    if (!stdout.readableEnded) stdout.end();
    if (!stderr.readableEnded) stderr.end();
    setImmediate(() => child.emit('close', exit.code, exit.signal));
  };
  const send = (events, exit = { code: 0, signal: null }, stderrValue = '') => {
    for (const event of events) {
      stdout.write(typeof event === 'string' ? `${event}\n` : `${JSON.stringify(event)}\n`);
    }
    stdout.end();
    if (stderrValue) stderr.write(stderrValue);
    stderr.end();
    setImmediate(() => close(exit));
  };

  const stdin = new Writable({
    highWaterMark: options.highWaterMark ?? 8,
    write(chunk, _encoding, callback) {
      stdinBytes.push(Buffer.from(chunk));
      if (options.stdinError) {
        callback(new Error('fixture stdin failure'));
        return;
      }
      setImmediate(callback);
    },
    final(callback) {
      callback();
      if (options.onStdinEnd) {
        setImmediate(() => options.onStdinEnd({ child, stdout, stderr, close, send }));
      }
    },
  });

  Object.assign(child, {
    pid: options.pid ?? 41001,
    stdin,
    stdout,
    stderr,
    stdinBytes,
    close,
    send,
    get closed() { return closed; },
  });

  if (!options.suppressSpawnEvent) {
    queueMicrotask(() => child.emit('spawn'));
  }
  return child;
}

function makeHarness(supervisorModule, options = {}) {
  const order = [];
  const emitted = [];
  const spawnCalls = [];
  const children = new Map();
  const counters = { detect: 0, build: 0, prepare: 0, activate: 0, remove: 0 };
  const runtimeRuns = new Map();
  let preparedEntry = null;
  let activeEntry = null;
  const command = '/fixture/bin/claude';
  const profileVersion = '2.1.177';
  const runtimeRoot = '/fixture/private/agent-runtime';

  const adapter = {
    async detect() {
      counters.detect += 1;
      order.push('detect');
      if (options.detection) return options.detection;
      return {
        installed: true,
        version: profileVersion,
        authState: 'unknown',
        profileVersion,
        binary: { command, realPath: command, argvPrefix: [] },
      };
    },
    async buildSpawn(task, context) {
      counters.build += 1;
      order.push('build');
      if (options.buildGate) await options.buildGate.promise;
      if (options.buildError) throw new Error('fixture build failure');
      runtimeRuns.set(context.delegationId, 'config');
      return Object.freeze({
        adapterId: 'claude-code',
        profileVersion,
        command,
        argv: Object.freeze([
          '-p',
          '--strict-mcp-config',
          '--mcp-config', context.privateMcpConfigPath,
          '--output-format', 'stream-json',
        ]),
        cwd: '/fixture/workspace',
        privateFiles: Object.freeze([context.privateMcpConfigPath]),
        fixedEnv: Object.freeze({
          FSB_AGENT_ADAPTER: 'claude-code',
          FSB_AGENT_PROFILE: profileVersion,
          FSB_DELEGATION_ID: context.delegationId,
          FSB_AGENT_FINGERPRINT: context.runtimeFingerprint,
        }),
      });
    },
    parseEvents(stream) {
      order.push('parse-attached');
      return options.parseEvents ? options.parseEvents(stream) : parseNormalizedLines(stream);
    },
    async kill() {},
    caps() {
      return { taskMode: true, chatMode: false, resume: false, serverMode: false };
    },
  };

  const registry = {
    require(id) {
      order.push(`registry:${id}`);
      if (id !== 'claude-code') throw new Error('unexpected adapter');
      return adapter;
    },
    ids() { return ['claude-code']; },
  };

  const runtimeFiles = {
    pathsFor(delegationId) {
      order.push('paths');
      return {
        runDirectory: `${runtimeRoot}/${delegationId}`,
        mcpConfigPath: `${runtimeRoot}/${delegationId}/mcp-config.json`,
      };
    },
    async prepareRun(input) {
      counters.prepare += 1;
      order.push('prepare');
      if (options.prepareGate) await options.prepareGate.promise;
      if (options.prepareError) throw new Error('fixture prepare failure');
      const { endpoint: _endpoint, ...journalInput } = input;
      preparedEntry = Object.freeze({ state: 'prepared', ...journalInput });
      runtimeRuns.set(input.delegationId, 'prepared');
      return {
        entry: preparedEntry,
        runDirectory: `${runtimeRoot}/${input.delegationId}`,
        mcpConfigPath: `${runtimeRoot}/${input.delegationId}/mcp-config.json`,
      };
    },
    async activateRun(input) {
      counters.activate += 1;
      order.push('activate');
      if (options.activateGate) await options.activateGate.promise;
      assert.equal(spawnCalls[0]?.child.stdinBytes.length ?? 0, 0, 'task is held before active journal commit');
      assert.equal(emitted.length, 0, 'no event escapes before active journal commit');
      if (options.activateError) throw new Error('fixture activate failure');
      activeEntry = Object.freeze({
        ...preparedEntry,
        state: 'active',
        pid: input.pid,
        processGroupId: input.processGroupId,
        startedAt: input.startedAt,
        processStartIdentity: input.processStartIdentity,
      });
      runtimeRuns.set(input.delegationId, 'active');
      return activeEntry;
    },
    async removeRun(delegationId) {
      counters.remove += 1;
      order.push(`remove:${delegationId}`);
      if (options.removeError) throw new Error('fixture remove failure');
      runtimeRuns.delete(delegationId);
    },
  };

  let inspectionOffset = 0;
  const inspections = options.inspections ?? [{
    classification: 'confirmed',
    process: {
      pid: 41001,
      parentPid: 1,
      processGroupId: 41001,
      processStartIdentity: '90001',
      descendants: [],
    },
  }];
  const inspector = {
    async inspect(entry) {
      order.push(`inspect:${entry.state}`);
      if (options.resolveActivationGate) await options.resolveActivationGate.promise;
      const value = inspections[Math.min(inspectionOffset, inspections.length - 1)];
      inspectionOffset += 1;
      if (value instanceof Error) throw value;
      return value;
    },
  };

  const terminationCalls = [];
  const degradations = [];
  const terminator = {
    async stop(entry, supervisedChild, stopOptions) {
      order.push('terminate');
      terminationCalls.push({ entry, child: supervisedChild, options: stopOptions });
      if (options.terminateError) {
        throw Object.assign(new Error('fixture unsettled tree'), { code: 'tree_unsettled' });
      }
      const child = supervisedChild ? children.get(supervisedChild.pid) : null;
      if (child && !child.closed && options.closeOnTerminate !== false) child.close({ code: null, signal: 'SIGTERM' });
      if (supervisedChild) await supervisedChild.closed;
    },
  };

  const recoveryResult = Object.freeze({
    confirmedKilled: 0,
    staleCleared: 0,
    ambiguousFailClosed: 0,
    spawnAvailable: true,
    profiles: Object.freeze([]),
  });
  const startupRecovery = {
    async recover() {
      order.push('recover');
      return options.recoveryResult ?? recoveryResult;
    },
    async recoverBeforeAdvertise(advertise) {
      const result = await this.recover();
      if (result.spawnAvailable) await advertise();
      return result;
    },
  };

  let delegationCounter = 0;
  const supervisor = supervisorModule.createSpawnSupervisor({
    registry,
    runtimeFiles,
    inspector,
    terminator,
    startupRecovery,
    endpoint: 'http://127.0.0.1:7226/mcp',
    cwd: '/fixture/workspace',
    platform: options.platform ?? 'linux',
    environment: {
      PATH: '/fixture/bin',
      SAFE_VALUE: 'retained-safe-value',
      ANTHROPIC_API_KEY: 'anthropic_key_canary_0001',
      OPENAI_API_KEY: 'openai_key_canary_0001',
      GEMINI_API_KEY: 'gemini_key_canary_0001',
    },
    spawn(commandValue, argv, spawnOptions) {
      order.push('spawn');
      if (options.spawnError) throw new Error('fixture spawn failure');
      const child = makeChild({
        ...(options.childOptions ?? {}),
        onStdinEnd: options.onStdinEnd ?? ((controls) => {
          controls.send([
            normalizedEvent('init', { tools: ['mcp__fsb'] }),
            normalizedEvent('result', { is_error: false, usage: { input: 1, output: 2 } }),
          ], { code: 0, signal: null }, options.stderrValue ?? '');
        }),
      });
      children.set(child.pid, child);
      spawnCalls.push({ command: commandValue, argv: [...argv], options: spawnOptions, child });
      return child;
    },
    wallNow: (() => {
      let now = 1000;
      return () => now += 1;
    })(),
    monotonicNow: () => 1,
    wait: async () => {},
    mintDelegationId: () => `delegation_fixture_${String(++delegationCounter).padStart(4, '0')}`,
    mintFingerprint: () => 'runtime_fingerprint_fixture_0001',
    terminationGrace: 25,
    activationAttempts: 3,
    allowSpawnOnPlatform: options.allowSpawnOnPlatform,
    onDegraded(code) {
      degradations.push(code);
      if (options.onDegraded) options.onDegraded(code);
    },
  });

  const emit = (event) => {
    order.push(`emit:${event.event}`);
    emitted.push(event);
    if (options.emitError) throw new Error('fixture route lost');
  };

  return {
    supervisor,
    order,
    emitted,
    spawnCalls,
    children,
    counters,
    runtimeRuns,
    terminationCalls,
    degradations,
    runtimeFiles,
    inspector,
    terminator,
    startupRecovery,
    emit,
    get preparedEntry() { return preparedEntry; },
    get activeEntry() { return activeEntry; },
  };
}

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function expectInvalid(operation) {
  await assert.rejects(operation, (error) => {
    assert.equal(error.code, 'invalid_ext_request');
    return true;
  });
}

async function runStrictPayloadTests(supervisorModule) {
  const harness = makeHarness(supervisorModule);
  const validTask = 'valid fixture task';
  const badPayloads = [
    startRequest({ adapterId: 'Claude-Code', task: validTask }),
    startRequest({ adapterId: 'claude-code', task: '' }),
    startRequest({ adapterId: 'claude-code', task: '\ud800' }),
    startRequest({ adapterId: 'claude-code', task: 'x'.repeat(64 * 1024 + 1) }),
    startRequest({ adapterId: 'claude-code', task: validTask, delegationId: 'caller-id' }),
    startRequest({ adapterId: 'claude-code', task: validTask, command: '/tmp/evil' }),
    startRequest({ adapterId: 'claude-code', task: validTask, env: { PATH: '/tmp' } }),
    startRequest({ adapterId: 'claude-code', task: { text: validTask } }),
    startRequest([], {}),
    { ...startRequest({ adapterId: 'claude-code', task: validTask }), extra: true },
    { ...startRequest({ adapterId: 'claude-code', task: validTask }), method: 'delegate.unknown' },
    cancelRequest('short'),
    { ...cancelRequest('delegation_fixture_9999'), payload: { delegationId: 'delegation_fixture_9999', pid: 1 } },
  ];
  const prototypePayload = Object.create({ command: '/tmp/evil' });
  prototypePayload.adapterId = 'claude-code';
  prototypePayload.task = validTask;
  badPayloads.push(startRequest(prototypePayload));

  for (const request of badPayloads) {
    await expectInvalid(() => harness.supervisor.handleExtRequest(request, harness.emit));
  }
  assert.deepEqual(harness.counters, { detect: 0, build: 0, prepare: 0, activate: 0, remove: 0 });
  assert.equal(harness.spawnCalls.length, 0);
  await harness.supervisor.close();
}

async function runHappyPathTest(supervisorModule) {
  const task = 'TASK_CANARY_6f9c18f7_"; $(touch /tmp/nope)\n--permission-mode bypass';
  const largeEvents = Array.from({ length: 220 }, (_, index) => normalizedEvent('assistant', {
    index,
    text: 'x'.repeat(1024),
  }));
  const harness = makeHarness(supervisorModule, {
    stderrValue: 'stderr_secret_canary_'.repeat(6000),
    onStdinEnd: (controls) => controls.send([
      normalizedEvent('init', { tools: ['mcp__fsb'] }),
      ...largeEvents,
      normalizedEvent('result', { is_error: false, usage: { input: 2, output: 3 } }),
    ], { code: 0, signal: null }, 'stderr_secret_canary_'.repeat(6000)),
  });

  const result = await harness.supervisor.handleExtRequest(
    startRequest({ adapterId: 'claude-code', task }),
    harness.emit,
  );
  assert.equal(result.status, 'succeeded');
  assert.equal(result.terminal.type, 'result');
  assert.match(result.delegationId, /^delegation_fixture_/);
  assert.equal(harness.spawnCalls.length, 1);
  const call = harness.spawnCalls[0];
  assert.equal(call.command, '/fixture/bin/claude');
  assert.equal(call.options.shell, false);
  assert.equal(call.options.detached, true);
  assert.equal(call.options.windowsHide, true);
  assert.deepEqual(call.options.stdio, ['pipe', 'pipe', 'pipe']);
  assert.equal(call.options.cwd, '/fixture/workspace');
  assert.equal(call.options.env.SAFE_VALUE, 'retained-safe-value');
  for (const key of supervisorModule.DELEGATION_PROVIDER_KEY_NAMES) {
    assert.equal(Object.hasOwn(call.options.env, key), false, `${key} is scrubbed`);
  }
  assert.match(call.options.env.FSB_AGENT_ARGV_SIGNATURE, /^[A-Za-z0-9_-]{16,256}$/);
  assert.equal(call.argv.some((value) => value.includes(task)), false);
  assert.equal(Object.values(call.options.env).some((value) => String(value).includes(task)), false);
  assert.equal(Buffer.concat(call.child.stdinBytes).toString('utf8'), task);

  const preparedIndex = harness.order.indexOf('prepare');
  const spawnIndex = harness.order.indexOf('spawn');
  const activeIndex = harness.order.indexOf('activate');
  const startedIndex = harness.order.indexOf('emit:delegation.started');
  assert(preparedIndex >= 0 && preparedIndex < spawnIndex, 'prepared journal is durable before spawn');
  assert(activeIndex > spawnIndex && activeIndex < startedIndex, 'active journal commits before authority event');
  assert.equal(harness.emitted[0].event, 'delegation.started');
  assert.equal(harness.emitted[0].payload.delegationId, result.delegationId);
  assert.equal(harness.emitted.at(-1).payload.event.type, 'result');
  assert.equal(harness.emitted.filter((event) => event.event === 'delegation.started').length, 1);
  assert.equal(harness.terminationCalls.length, 1, 'normal close is still tree-verified once');
  assert.equal(harness.counters.remove, 1);

  const serialized = JSON.stringify({
    prepared: harness.preparedEntry,
    active: harness.activeEntry,
    emitted: harness.emitted,
    terminal: result,
    order: harness.order,
  });
  for (const forbidden of [
    task,
    'anthropic_key_canary_0001',
    'openai_key_canary_0001',
    'gemini_key_canary_0001',
    'stderr_secret_canary_',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden.slice(0, 24)} does not leak`);
  }
}

async function runFailureBarrierTests(supervisorModule) {
  {
    const harness = makeHarness(supervisorModule, { prepareError: true });
    const result = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'journal prepare must fail safely' }),
      harness.emit,
    );
    assert.equal(result.status, 'failed');
    assert.equal(harness.spawnCalls.length, 0);
    assert.equal(harness.emitted.length, 0);
  }

  {
    const harness = makeHarness(supervisorModule, {
      spawnError: true,
      inspections: [{ classification: 'stale' }],
    });
    const result = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'spawn must fail safely' }),
      harness.emit,
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.terminal.code, 'spawn_failed');
    assert.equal(harness.emitted.length, 0);
    assert.equal(harness.counters.prepare, 1);
    assert.equal(harness.counters.activate, 0);
    assert.equal(harness.counters.remove, 1);
  }

  {
    const harness = makeHarness(supervisorModule, {
      inspections: [{ classification: 'ambiguous', reason: 'identity_mismatch' }],
      onStdinEnd: () => { throw new Error('task must not be written'); },
    });
    const result = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'activation must fail safely' }),
      harness.emit,
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.terminal.code, 'activation_failed');
    assert.equal(harness.emitted.length, 0);
    assert.equal(Buffer.concat(harness.spawnCalls[0].child.stdinBytes).length, 0);
    assert.equal(harness.terminationCalls.length, 1);
    assert.equal(harness.counters.remove, 1);
  }

  {
    const harness = makeHarness(supervisorModule, { activateError: true });
    const result = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'journal activation must fail safely' }),
      harness.emit,
    );
    assert.equal(result.status, 'failed');
    assert.equal(harness.emitted.length, 0);
    assert.equal(Buffer.concat(harness.spawnCalls[0].child.stdinBytes).length, 0);
    assert.equal(harness.terminationCalls.length, 1);
  }

  {
    const harness = makeHarness(supervisorModule, {
      childOptions: { stdinError: true },
    });
    const result = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'stdin failure fixture' }),
      harness.emit,
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.terminal.code, 'stdin_failed');
    assert.equal(harness.emitted[0].event, 'delegation.started');
    assert.equal(harness.terminationCalls.length, 1);
  }

  {
    const harness = makeHarness(supervisorModule, { emitError: true });
    const result = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'route loss fixture' }),
      harness.emit,
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.terminal.code, 'route_lost');
    assert.equal(harness.terminationCalls.length, 1);
    assert.equal(Buffer.concat(harness.spawnCalls[0].child.stdinBytes).length, 0);
  }

  {
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: (controls) => controls.send([
        normalizedEvent('init', { tools: ['mcp__fsb'] }),
      ], { code: 1, signal: null }),
    });
    const result = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'missing result fixture' }),
      harness.emit,
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.terminal.code, 'agent_protocol_drift');
    assert.equal(harness.terminationCalls.length, 1);
  }

  {
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: (controls) => controls.send([
        normalizedEvent('init', { tools: ['mcp__fsb'] }),
        normalizedEvent('result', { is_error: false }),
        normalizedEvent('result', { is_error: false }),
      ]),
    });
    const result = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'duplicate result fixture' }),
      harness.emit,
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.terminal.code, 'agent_protocol_drift');
    assert.equal(harness.emitted.filter((event) => event.payload.event?.type === 'result').length, 0);
  }

  {
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: (controls) => controls.send([
        normalizedEvent('init', { tools: ['mcp__fsb'] }),
        'DRIFT',
      ]),
    });
    const result = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'protocol drift fixture' }),
      harness.emit,
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.terminal.code, 'agent_protocol_drift');
    assert.equal(harness.terminationCalls.length, 1);
    assert.equal(harness.emitted.some((event) => event.payload.event?.type === 'result'), false);
  }

  {
    const harness = makeHarness(supervisorModule, {
      platform: 'win32',
    });
    const result = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'unsupported verification fixture' }),
      harness.emit,
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.terminal.code, 'adapter_unavailable');
    assert.equal(harness.counters.detect, 0);
    assert.equal(harness.spawnCalls.length, 0);
  }
}

async function runCancelAndShutdownTests(supervisorModule) {
  {
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: () => {},
    });
    const startPromise = harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'wait for cancellation' }),
      harness.emit,
    );
    await waitFor(
      () => harness.emitted.some((event) => event.event === 'delegation.started'),
      'delegation.started',
    );
    const delegationId = harness.emitted[0].payload.delegationId;
    const firstCancel = harness.supervisor.handleExtRequest(cancelRequest(delegationId), harness.emit);
    const secondCancel = harness.supervisor.handleExtRequest(
      cancelRequest(delegationId, { id: 'ext-cancel-2' }),
      harness.emit,
    );
    const [first, second, terminal] = await Promise.all([firstCancel, secondCancel, startPromise]);
    assert.equal(first.status, 'cancelled');
    assert.equal(second.status, 'cancelled');
    assert.equal(terminal.status, 'cancelled');
    assert.equal(harness.terminationCalls.length, 1, 'duplicate cancel shares one tree stop');
    const late = await harness.supervisor.handleExtRequest(
      cancelRequest(delegationId, { id: 'ext-cancel-late' }),
      harness.emit,
    );
    assert.equal(late.status, 'already_terminal');
    const unknown = await harness.supervisor.handleExtRequest(
      cancelRequest('delegation_unknown_0001', { id: 'ext-cancel-unknown' }),
      harness.emit,
    );
    assert.equal(unknown.status, 'not_found');
  }

  {
    const harness = makeHarness(supervisorModule, { onStdinEnd: () => {} });
    const startPromise = harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'shutdown cancellation fixture' }),
      harness.emit,
    );
    await waitFor(() => harness.emitted.length > 0, 'started event before shutdown');
    const firstClose = harness.supervisor.close();
    const secondClose = harness.supervisor.close();
    assert.strictEqual(firstClose, secondClose);
    const [closed, terminal] = await Promise.all([firstClose, startPromise]);
    assert.deepEqual(closed, { cancelled: 1, failed: 0, alreadySettled: 0 });
    assert.equal(terminal.status, 'cancelled');
    assert.equal(harness.terminationCalls.length, 1);
    await expectInvalid(() => harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'too late' }),
      harness.emit,
    ));
  }

  {
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: () => {},
      terminateError: true,
    });
    const startPromise = harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'unsettled cancellation fixture' }),
      harness.emit,
    );
    await waitFor(() => harness.emitted.length > 0, 'started event before unsettled cancel');
    const delegationId = harness.emitted[0].payload.delegationId;
    const cancel = await harness.supervisor.handleExtRequest(cancelRequest(delegationId), harness.emit);
    const terminal = await startPromise;
    assert.equal(cancel.status, 'failed');
    assert.equal(terminal.status, 'failed');
    assert.equal(terminal.terminal.code, 'tree_unsettled');
    assert.equal(harness.counters.remove, 0, 'unsettled tree keeps journal state');
    assert.deepEqual(harness.degradations, ['tree_unsettled'], 'unsettled cleanup latches degradation once');
    await expectInvalid(() => harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'must not spawn after unsettled tree' }, { id: 'ext-start-after-unsettled' }),
      harness.emit,
    ));
    assert.equal(harness.spawnCalls.length, 1, 'degraded supervisor emits no second spawn');
  }
}

async function runSetupCancellationRaceTests(supervisorModule) {
  for (const fixture of [
    { name: 'buildSpawn', gateOption: 'buildGate', marker: 'build', expectedPrepare: 0, expectedSpawn: 0 },
    { name: 'prepareRun', gateOption: 'prepareGate', marker: 'prepare', expectedPrepare: 1, expectedSpawn: 0 },
    { name: 'resolveActivation', gateOption: 'resolveActivationGate', marker: 'inspect:prepared', expectedPrepare: 1, expectedSpawn: 1 },
    { name: 'activateRun', gateOption: 'activateGate', marker: 'activate', expectedPrepare: 1, expectedSpawn: 1 },
  ]) {
    const gate = deferred();
    const harness = makeHarness(supervisorModule, {
      [fixture.gateOption]: gate,
      onStdinEnd: () => {},
    });
    const startPromise = harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: `${fixture.name} cancellation barrier` }),
      harness.emit,
    );
    await waitFor(() => harness.order.includes(fixture.marker), `${fixture.name} held stage`);
    let closeSettled = false;
    const closePromise = harness.supervisor.close().then((result) => {
      closeSettled = true;
      return result;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(closeSettled, false, `${fixture.name} close joins the held setup mutation`);
    gate.resolve();
    const [closed, terminal] = await Promise.all([closePromise, startPromise]);
    assert.deepEqual(closed, { cancelled: 1, failed: 0, alreadySettled: 0 }, `${fixture.name} close classifies one cancellation`);
    assert.equal(terminal.status, 'cancelled', `${fixture.name} start settles only after cancellation cleanup`);
    assert.equal(harness.counters.prepare, fixture.expectedPrepare, `${fixture.name} does not advance into an extra prepare mutation`);
    assert.equal(harness.spawnCalls.length, fixture.expectedSpawn, `${fixture.name} does not advance into an extra spawn`);
    assert.equal(harness.runtimeRuns.size, 0, `${fixture.name} leaves no runtime config or journal entry`);
    assert.equal(harness.emitted.length, 0, `${fixture.name} grants no task authority`);
    if (harness.spawnCalls[0]) {
      assert.equal(Buffer.concat(harness.spawnCalls[0].child.stdinBytes).length, 0, `${fixture.name} writes no task bytes`);
      assert.equal(
        harness.supervisor.journalEntryForChild({
          pid: harness.spawnCalls[0].child.pid,
          processGroupId: harness.spawnCalls[0].child.pid,
          platform: 'linux',
          closed: Promise.resolve({ code: 0, signal: null }),
        }),
        null,
        `${fixture.name} clears the PID journal map before settlement`,
      );
    }
  }
}

async function runRecoveryAndRegistryTests(supervisorModule, registryModule) {
  const harness = makeHarness(supervisorModule);
  assert.deepEqual(await harness.supervisor.recover(), {
    confirmedKilled: 0,
    staleCleared: 0,
    ambiguousFailClosed: 0,
    spawnAvailable: true,
    profiles: [],
  });
  assert.equal(harness.order.at(-1), 'recover');

  const child = { pid: 99999, processGroupId: 99999, platform: 'linux', closed: Promise.resolve({ code: 0, signal: null }) };
  assert.equal(harness.supervisor.journalEntryForChild(child), null);

  let killCalls = 0;
  const productionRegistry = registryModule.createProductionAdapterRegistry({
    detect: async () => ({
      installed: false,
      version: null,
      authState: 'unknown',
      binary: null,
      profileVersion: null,
    }),
    parseEvents: () => parseNormalizedLines(new PassThrough()),
    kill: async () => { killCalls += 1; },
  });
  const productionAdapter = productionRegistry.require('claude-code');
  assert.deepEqual(
    Object.keys(productionAdapter).sort(),
    ['buildSpawn', 'caps', 'detect', 'kill', 'parseEvents'],
  );
  await productionAdapter.kill(child, { grace: 25 });
  assert.equal(killCalls, 1, 'production registry binds the concrete adapter kill dependency');
}

async function main() {
  const supervisorModule = await import(pathToFileURL(supervisorBuildPath).href);
  const registryModule = await import(pathToFileURL(registryBuildPath).href);
  assert.equal(supervisorModule.DELEGATION_TASK_LIMIT_BYTES, 64 * 1024);
  assert.equal(supervisorModule.DELEGATION_STDERR_LIMIT_BYTES, 64 * 1024);
  await runStrictPayloadTests(supervisorModule);
  await runHappyPathTest(supervisorModule);
  await runFailureBarrierTests(supervisorModule);
  await runCancelAndShutdownTests(supervisorModule);
  await runSetupCancellationRaceTests(supervisorModule);
  await runRecoveryAndRegistryTests(supervisorModule, registryModule);
  console.log('mcp-spawn-supervisor.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-spawn-supervisor.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
