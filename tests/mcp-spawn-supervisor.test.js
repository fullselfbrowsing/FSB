'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { PassThrough, Writable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const mcpBuildRoot = process.env.FSB_MCP_BUILD_ROOT
  ? path.resolve(process.env.FSB_MCP_BUILD_ROOT)
  : path.join(repoRoot, 'mcp', 'build');
const supervisorBuildPath = path.join(
  mcpBuildRoot,
  'agent-providers',
  'spawn-supervisor.js',
);
const registryBuildPath = path.join(
  mcpBuildRoot,
  'agent-providers',
  'registry.js',
);
const protocolDriftBuildPath = path.join(
  mcpBuildRoot,
  'agent-providers',
  'protocol-drift.js',
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

function lifecycleRequest(method, delegationId, overrides = {}) {
  return {
    id: `ext-${method.split('.')[1]}-1`,
    type: 'ext:request',
    method,
    payload: { delegationId },
    ...overrides,
  };
}

function statusRequest(payload = {}, overrides = {}) {
  return {
    id: 'ext-status-1',
    type: 'ext:request',
    method: 'delegate.status',
    payload,
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
  let stdinEndCount = 0;
  let closed = false;
  let closePending = false;
  let stdin = null;

  const finalizeClose = (exit) => {
    if (closed) return;
    closed = true;
    if (stdin && !stdin.destroyed) {
      if (options.stdinCloseGate) {
        void options.stdinCloseGate.promise.then(() => stdin.destroy());
      } else {
        stdin.destroy();
      }
    }
    if (!stdout.readableEnded) stdout.end();
    if (!stderr.readableEnded) stderr.end();
    setImmediate(() => child.emit('close', exit.code, exit.signal));
  };
  const close = (exit = { code: 0, signal: null }) => {
    if (closed || closePending) return;
    if (options.closeGate) {
      closePending = true;
      void options.closeGate.promise.then(() => finalizeClose(exit));
      return;
    }
    finalizeClose(exit);
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

  stdin = new Writable({
    highWaterMark: options.highWaterMark ?? 8,
    write(chunk, _encoding, callback) {
      stdinBytes.push(Buffer.from(chunk));
      if (options.stdinError) {
        callback(new Error('fixture stdin failure'));
        return;
      }
      if (options.holdStdinWrite) return;
      setImmediate(callback);
    },
    final(callback) {
      stdinEndCount += 1;
      callback();
      if (options.onStdinEnd) {
        setImmediate(() => options.onStdinEnd({ child, stdout, stderr, close, send }));
      }
    },
  });

  if (options.stdinEndFailure) {
    stdin.end = () => {
      setImmediate(() => {
        if (options.stdinEndFailure === 'error') {
          stdin.destroy(new Error('fixture EOF failure'));
        } else {
          stdin.destroy();
        }
      });
      return stdin;
    };
  }

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
  Object.defineProperty(child, 'stdinEndCount', {
    enumerable: true,
    get() { return stdinEndCount; },
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
        topology: Object.freeze({
          kind: 'direct',
          task: Object.freeze({
            role: 'direct_task',
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
            spawnSecretEnvBindings: Object.freeze([]),
            stdin: 'task',
            stdout: 'agent_jsonl',
          }),
        }),
        attestations: Object.freeze([]),
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
      assert.equal(spawnCalls.at(-1)?.child.stdinBytes.length ?? 0, 0, 'task is held before active journal commit');
      assert.equal(
        emitted.some((event) => event.payload?.delegationId === input.delegationId),
        false,
        'no event escapes before its active journal commit',
      );
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
      if (options.removeGate) await options.removeGate.promise;
      if (options.removeError) throw new Error('fixture remove failure');
      runtimeRuns.delete(delegationId);
    },
  };

  let inspectionOffset = 0;
  const inspections = options.inspections ?? null;
  const inspector = {
    async inspect(entry) {
      order.push(`inspect:${entry.state}`);
      if (options.resolveActivationGate) await options.resolveActivationGate.promise;
      if (!inspections) {
        const pid = spawnCalls.at(-1)?.child.pid ?? 41001;
        return {
          classification: 'confirmed',
          process: {
            pid,
            parentPid: 1,
            processGroupId: pid,
            processStartIdentity: String(90000 + pid),
            descendants: [],
          },
        };
      }
      const value = inspections[Math.min(inspectionOffset, inspections.length - 1)];
      inspectionOffset += 1;
      if (value instanceof Error) throw value;
      return value;
    },
  };

  const terminationCalls = [];
  const lifecycleCalls = [];
  const degradations = [];
  const terminator = {
    async stop(entry, supervisedChild, stopOptions) {
      order.push('terminate');
      terminationCalls.push({ entry, child: supervisedChild, options: stopOptions });
      if (options.terminateGate) await options.terminateGate.promise;
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
    restartLosses: Object.freeze([]),
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

  let processGroupState = options.initialProcessGroupState ?? 'running';
  let processGroupStatusOffset = 0;
  const processGroupStatuses = options.processGroupStatuses ?? null;
  const scheduledTimers = [];
  let fakeClock = 0;
  let monotonicClock = 0;
  const waitCalls = [];

  const schedule = (callback, milliseconds) => {
    const timer = {
      callback,
      dueAt: fakeClock + milliseconds,
      cleared: false,
      fired: false,
      unrefCalled: false,
      unref() { this.unrefCalled = true; },
    };
    scheduledTimers.push(timer);
    return timer;
  };

  const advanceClock = async (milliseconds) => {
    fakeClock += milliseconds;
    while (true) {
      const timer = scheduledTimers
        .filter((entry) => !entry.cleared && !entry.fired && entry.dueAt <= fakeClock)
        .sort((left, right) => left.dueAt - right.dueAt)[0];
      if (!timer) break;
      timer.fired = true;
      timer.callback();
      await new Promise((resolve) => setImmediate(resolve));
    }
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
        pid: options.childOptions?.pid ?? 41001 + spawnCalls.length,
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
    monotonicNow: () => monotonicClock,
    wait: async (milliseconds) => {
      waitCalls.push(milliseconds);
      monotonicClock += milliseconds;
    },
    mintDelegationId: options.mintDelegationId
      ?? (() => `delegation_fixture_${String(++delegationCounter).padStart(4, '0')}`),
    mintFingerprint: () => 'runtime_fingerprint_fixture_0001',
    mintGeneration: () => 'generation_fixture_0001',
    signalProcessGroup(group, signal) {
      order.push(`signal:${signal}`);
      lifecycleCalls.push({ operation: 'signal', group, signal });
      if (options.signalError === true || options.signalError === signal) {
        throw new Error('fixture signal failure');
      }
      processGroupState = signal === 'SIGSTOP' ? 'stopped' : 'running';
    },
    async inspectProcessGroupStatus(entry, process) {
      order.push(`group-status:${processGroupState}`);
      lifecycleCalls.push({ operation: 'inspect-status', entry, process });
      const callOffset = processGroupStatusOffset;
      processGroupStatusOffset += 1;
      const statusGate = options.processStatusGates?.[callOffset] ?? options.processStatusGate;
      if (statusGate) await statusGate.promise;
      if (options.processStatusError) throw new Error('fixture status failure');
      if (processGroupStatuses) {
        const status = processGroupStatuses[Math.min(
          callOffset,
          processGroupStatuses.length - 1,
        )];
        return status;
      }
      return { classification: processGroupState };
    },
    schedule,
    clearScheduled(timer) {
      timer.cleared = true;
    },
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
    if (options.emitError === true || options.emitError === event.event) {
      throw new Error('fixture route lost');
    }
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
    lifecycleCalls,
    waitCalls,
    scheduledTimers,
    advanceClock,
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
    lifecycleRequest('delegate.hold', 'short'),
    lifecycleRequest('delegate.resume', 'delegation_fixture_9999', {
      payload: { delegationId: 'delegation_fixture_9999', signal: 'SIGCONT' },
    }),
    lifecycleRequest('Delegate.Hold', 'delegation_fixture_9999'),
    statusRequest({ generation: 'caller-controlled' }),
    statusRequest({}, { extra: true }),
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

async function runLifecycleProtocolTests(supervisorModule) {
  const harness = makeHarness(supervisorModule, { onStdinEnd: () => {} });
  const initial = await harness.supervisor.handleExtRequest(statusRequest(), harness.emit);
  assert.deepEqual(initial, {
    generation: 'generation_fixture_0001',
    active: [],
    restartLosses: [],
    routeLosses: [],
  });
  assert.deepEqual(
    Object.keys(initial).sort(),
    ['active', 'generation', 'restartLosses', 'routeLosses'],
  );
  assert(Object.isFrozen(initial));
  assert(Object.isFrozen(initial.active));
  assert(Object.isFrozen(initial.restartLosses));
  assert(Object.isFrozen(initial.routeLosses));

  const startPromise = harness.supervisor.handleExtRequest(
    startRequest({ adapterId: 'claude-code', task: 'lifecycle protocol fixture' }),
    harness.emit,
  );
  await waitFor(
    () => harness.emitted.some((event) => event.event === 'delegation.started'),
    'delegation lifecycle authority',
  );
  const delegationId = harness.emitted[0].payload.delegationId;
  const running = await harness.supervisor.handleExtRequest(statusRequest(), harness.emit);
  assert.deepEqual(running.active, [{ delegationId, state: 'running' }]);

  const held = await harness.supervisor.handleExtRequest(
    lifecycleRequest('delegate.hold', delegationId),
    harness.emit,
  );
  assert.deepEqual(held, { delegationId, status: 'held' });
  assert.deepEqual(
    await harness.supervisor.handleExtRequest(
      lifecycleRequest('delegate.hold', delegationId, { id: 'ext-hold-duplicate' }),
      harness.emit,
    ),
    { delegationId, status: 'held' },
  );
  assert.deepEqual(
    harness.lifecycleCalls.filter((call) => call.operation === 'signal').map((call) => [call.group, call.signal]),
    [[-harness.spawnCalls[0].child.pid, 'SIGSTOP']],
  );
  assert.strictEqual(
    harness.lifecycleCalls.find((call) => call.operation === 'inspect-status').entry,
    harness.activeEntry,
  );
  assert.deepEqual(
    (await harness.supervisor.handleExtRequest(statusRequest(), harness.emit)).active,
    [{ delegationId, state: 'held' }],
  );

  const resumed = await harness.supervisor.handleExtRequest(
    lifecycleRequest('delegate.resume', delegationId),
    harness.emit,
  );
  assert.deepEqual(resumed, { delegationId, status: 'running' });
  assert.deepEqual(
    harness.lifecycleCalls.filter((call) => call.operation === 'signal').map((call) => [call.group, call.signal]),
    [
      [-harness.spawnCalls[0].child.pid, 'SIGSTOP'],
      [-harness.spawnCalls[0].child.pid, 'SIGCONT'],
    ],
  );
  assert.deepEqual(
    await harness.supervisor.handleExtRequest(
      lifecycleRequest('delegate.hold', 'delegation_unknown_0001'),
      harness.emit,
    ),
    { delegationId: 'delegation_unknown_0001', status: 'not_found' },
  );

  const cancelled = await harness.supervisor.handleExtRequest(cancelRequest(delegationId), harness.emit);
  const terminal = await startPromise;
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(terminal.status, 'cancelled');
  assert.deepEqual(
    await harness.supervisor.handleExtRequest(
      lifecycleRequest('delegate.resume', delegationId),
      harness.emit,
    ),
    { delegationId, status: 'already_terminal' },
  );
  const finalStatus = await harness.supervisor.handleExtRequest(statusRequest(), harness.emit);
  assert.deepEqual(finalStatus.active, []);
  const serialized = JSON.stringify(finalStatus);
  for (const forbidden of ['pid', 'argv', 'env', 'task', 'lifecycle protocol fixture']) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} is absent from status`);
  }
}

async function startLiveDelegation(harness, task, requestId) {
  const startPromise = harness.supervisor.handleExtRequest(
    startRequest(
      { adapterId: 'claude-code', task },
      { id: requestId },
    ),
    harness.emit,
  );
  await waitFor(
    () => harness.emitted.some((event) => event.event === 'delegation.started'),
    `${task} delegation.started`,
  );
  return {
    startPromise,
    delegationId: harness.emitted.find((event) => event.event === 'delegation.started').payload.delegationId,
  };
}

async function runPosixLifecycleRaceTests(supervisorModule) {
  {
    const holdGate = deferred();
    const resumeGate = deferred();
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: () => {},
      processStatusGates: [holdGate, null, resumeGate],
    });
    const { startPromise, delegationId } = await startLiveDelegation(
      harness,
      'coalesced POSIX lifecycle fixture',
      'ext-posix-coalesce-start',
    );
    const lifecycleOrderStart = harness.order.length;
    const firstHold = harness.supervisor.handleExtRequest(
      lifecycleRequest('delegate.hold', delegationId, { id: 'ext-posix-hold-1' }),
      harness.emit,
    );
    await waitFor(
      () => harness.lifecycleCalls.filter((call) => call.operation === 'inspect-status').length === 1,
      'held pre-signal status inspection',
    );
    const duplicateHold = harness.supervisor.handleExtRequest(
      lifecycleRequest('delegate.hold', delegationId, { id: 'ext-posix-hold-2' }),
      harness.emit,
    );
    assert.equal(
      harness.lifecycleCalls.filter((call) => call.operation === 'signal').length,
      0,
      'hold does not signal before process status confirmation',
    );
    holdGate.resolve();
    assert.deepEqual(await Promise.all([firstHold, duplicateHold]), [
      { delegationId, status: 'held' },
      { delegationId, status: 'held' },
    ]);
    assert.deepEqual(
      harness.order.slice(lifecycleOrderStart).filter((entry) => (
        entry === 'inspect:active'
        || entry.startsWith('group-status:')
        || entry.startsWith('signal:')
      )),
      [
        'inspect:active',
        'group-status:running',
        'signal:SIGSTOP',
        'inspect:active',
        'group-status:stopped',
      ],
      'SIGSTOP is bracketed by exact tree and group-state confirmation',
    );
    assert.equal(harness.scheduledTimers.length, 1, 'confirmed hold arms one expiry timer');
    assert.equal(
      harness.scheduledTimers[0].dueAt,
      supervisorModule.DELEGATION_HOLD_EXPIRY_MS,
      'hold expiry is the fixed five-minute interval',
    );
    assert.equal(harness.scheduledTimers[0].unrefCalled, true);

    const firstResume = harness.supervisor.handleExtRequest(
      lifecycleRequest('delegate.resume', delegationId, { id: 'ext-posix-resume-1' }),
      harness.emit,
    );
    await waitFor(
      () => harness.lifecycleCalls.filter((call) => call.operation === 'inspect-status').length === 3,
      'resume pre-signal status inspection',
    );
    const duplicateResume = harness.supervisor.handleExtRequest(
      lifecycleRequest('delegate.resume', delegationId, { id: 'ext-posix-resume-2' }),
      harness.emit,
    );
    resumeGate.resolve();
    assert.deepEqual(await Promise.all([firstResume, duplicateResume]), [
      { delegationId, status: 'running' },
      { delegationId, status: 'running' },
    ]);
    assert.deepEqual(
      harness.lifecycleCalls.filter((call) => call.operation === 'signal').map((call) => call.signal),
      ['SIGSTOP', 'SIGCONT'],
      'duplicate lifecycle requests coalesce to one signal per transition',
    );
    assert.equal(harness.scheduledTimers[0].cleared, true, 'resume clears the hold expiry');
    await harness.supervisor.handleExtRequest(cancelRequest(delegationId), harness.emit);
    assert.equal((await startPromise).status, 'cancelled');
  }

  {
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: () => {},
      processGroupStatuses: [
        { classification: 'running' },
        { classification: 'running' },
        { classification: 'running' },
        { classification: 'stopped' },
      ],
    });
    const { startPromise, delegationId } = await startLiveDelegation(
      harness,
      'delayed SIGSTOP observation fixture',
      'ext-delayed-hold-start',
    );
    assert.deepEqual(
      await harness.supervisor.handleExtRequest(
        lifecycleRequest('delegate.hold', delegationId),
        harness.emit,
      ),
      { delegationId, status: 'held' },
    );
    assert.deepEqual(harness.waitCalls, [
      supervisorModule.DELEGATION_PROCESS_TRANSITION_POLL_MS,
      supervisorModule.DELEGATION_PROCESS_TRANSITION_POLL_MS,
    ], 'hold polls while SIGSTOP visibility lags');
    assert.equal(
      harness.order.filter((entry) => entry === 'inspect:active').length,
      4,
      'hold revalidates the exact pid/group identity on every state observation',
    );
    await harness.supervisor.handleExtRequest(cancelRequest(delegationId), harness.emit);
    assert.equal((await startPromise).status, 'cancelled');
  }

  {
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: () => {},
      processGroupStatuses: [
        { classification: 'running' },
        { classification: 'stopped' },
        { classification: 'stopped' },
        { classification: 'stopped' },
        { classification: 'stopped' },
        { classification: 'running' },
      ],
    });
    const { startPromise, delegationId } = await startLiveDelegation(
      harness,
      'delayed SIGCONT observation fixture',
      'ext-delayed-resume-start',
    );
    assert.deepEqual(
      await harness.supervisor.handleExtRequest(
        lifecycleRequest('delegate.hold', delegationId),
        harness.emit,
      ),
      { delegationId, status: 'held' },
    );
    assert.deepEqual(
      await harness.supervisor.handleExtRequest(
        lifecycleRequest('delegate.resume', delegationId),
        harness.emit,
      ),
      { delegationId, status: 'running' },
    );
    assert.deepEqual(harness.waitCalls, [
      supervisorModule.DELEGATION_PROCESS_TRANSITION_POLL_MS,
      supervisorModule.DELEGATION_PROCESS_TRANSITION_POLL_MS,
    ], 'resume polls while SIGCONT visibility lags');
    assert.equal(
      harness.order.filter((entry) => entry === 'inspect:active').length,
      6,
      'resume revalidates the exact pid/group identity on every state observation',
    );
    await harness.supervisor.handleExtRequest(cancelRequest(delegationId), harness.emit);
    assert.equal((await startPromise).status, 'cancelled');
  }

  {
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: () => {},
      processGroupStatuses: [{ classification: 'running' }],
    });
    const { startPromise, delegationId } = await startLiveDelegation(
      harness,
      'never observed SIGSTOP transition fixture',
      'ext-never-transition-hold-start',
    );
    assert.deepEqual(
      await harness.supervisor.handleExtRequest(
        lifecycleRequest('delegate.hold', delegationId),
        harness.emit,
      ),
      { delegationId, status: 'hold_failed' },
    );
    assert.equal(
      harness.waitCalls.reduce((total, milliseconds) => total + milliseconds, 0),
      supervisorModule.DELEGATION_PROCESS_TRANSITION_GRACE_MS,
      'never-transition confirmation stops at the bounded monotonic deadline',
    );
    assert.equal(
      harness.order.filter((entry) => entry === 'inspect:active').length,
      harness.lifecycleCalls.filter((call) => call.operation === 'inspect-status').length,
      'timeout polling revalidates identity before every group-state read',
    );
    const terminal = await startPromise;
    assert.equal(terminal.status, 'failed');
    assert.equal(terminal.terminal.code, 'hold_failed');
    assert.equal(harness.terminationCalls.length, 1);
  }

  {
    const harness = makeHarness(supervisorModule, {
      platform: 'win32',
      allowSpawnOnPlatform: () => true,
      onStdinEnd: () => {},
    });
    const { startPromise, delegationId } = await startLiveDelegation(
      harness,
      'unsupported lifecycle platform fixture',
      'ext-unsupported-hold-start',
    );
    assert.deepEqual(
      await harness.supervisor.handleExtRequest(
        lifecycleRequest('delegate.hold', delegationId),
        harness.emit,
      ),
      { delegationId, status: 'hold_failed' },
    );
    const terminal = await startPromise;
    assert.equal(terminal.status, 'failed');
    assert.equal(terminal.terminal.code, 'hold_failed');
    assert.equal(harness.lifecycleCalls.length, 0, 'unsupported platforms never inspect or signal');
    assert.equal(harness.terminationCalls.length, 1);
    assert.equal(harness.counters.remove, 1);
  }

  {
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: () => {},
      signalError: 'SIGSTOP',
    });
    const { startPromise, delegationId } = await startLiveDelegation(
      harness,
      'signal failure convergence fixture',
      'ext-signal-failure-start',
    );
    assert.deepEqual(
      await harness.supervisor.handleExtRequest(
        lifecycleRequest('delegate.hold', delegationId),
        harness.emit,
      ),
      { delegationId, status: 'hold_failed' },
    );
    const terminal = await startPromise;
    assert.equal(terminal.status, 'failed');
    assert.equal(terminal.terminal.code, 'hold_failed');
    assert.deepEqual(
      harness.lifecycleCalls.filter((call) => call.operation === 'signal').map((call) => call.signal),
      ['SIGSTOP'],
    );
    assert.equal(harness.terminationCalls.length, 1);
    assert.equal(harness.counters.remove, 1);
  }

  {
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: () => {},
      processGroupStatuses: [
        { classification: 'running' },
        { classification: 'ambiguous' },
      ],
    });
    const { startPromise, delegationId } = await startLiveDelegation(
      harness,
      'post-signal inspection failure fixture',
      'ext-inspection-failure-start',
    );
    const held = await harness.supervisor.handleExtRequest(
      lifecycleRequest('delegate.hold', delegationId),
      harness.emit,
    );
    assert.deepEqual(held, { delegationId, status: 'hold_failed' });
    const terminal = await startPromise;
    assert.equal(terminal.status, 'failed');
    assert.equal(terminal.terminal.code, 'hold_failed');
    assert.equal(harness.scheduledTimers.length, 0, 'unconfirmed hold never arms expiry');
    assert.equal(harness.terminationCalls.length, 1);
    assert.equal(harness.counters.remove, 1);
  }

  {
    const confirmed = {
      classification: 'confirmed',
      process: {
        pid: 41001,
        parentPid: 1,
        processGroupId: 41001,
        processStartIdentity: '131001',
        descendants: [],
      },
    };
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: () => {},
      inspections: [confirmed, { classification: 'stale' }],
    });
    const { startPromise, delegationId } = await startLiveDelegation(
      harness,
      'exited child before hold fixture',
      'ext-stale-hold-start',
    );
    assert.deepEqual(
      await harness.supervisor.handleExtRequest(
        lifecycleRequest('delegate.hold', delegationId),
        harness.emit,
      ),
      { delegationId, status: 'hold_failed' },
    );
    assert.equal((await startPromise).terminal.code, 'hold_failed');
    assert.equal(
      harness.lifecycleCalls.filter((call) => call.operation === 'signal').length,
      0,
      'an absent exact tree is never signalled',
    );
  }

  {
    const harness = makeHarness(supervisorModule, { onStdinEnd: () => {} });
    const { startPromise, delegationId } = await startLiveDelegation(
      harness,
      'fixed hold expiry boundary fixture',
      'ext-expiry-start',
    );
    assert.deepEqual(
      await harness.supervisor.handleExtRequest(
        lifecycleRequest('delegate.hold', delegationId),
        harness.emit,
      ),
      { delegationId, status: 'held' },
    );
    await harness.advanceClock(supervisorModule.DELEGATION_HOLD_EXPIRY_MS - 1);
    assert.deepEqual(
      (await harness.supervisor.handleExtRequest(statusRequest(), harness.emit)).active,
      [{ delegationId, state: 'held' }],
      'hold remains active one millisecond before expiry',
    );
    assert.equal(harness.terminationCalls.length, 0);
    await harness.advanceClock(1);
    const terminal = await startPromise;
    assert.equal(terminal.status, 'failed');
    assert.equal(terminal.terminal.code, 'hold_expired');
    assert.equal(harness.terminationCalls.length, 1);
    assert.equal(harness.counters.remove, 1);
    assert.deepEqual(
      (await harness.supervisor.handleExtRequest(statusRequest(), harness.emit)).active,
      [],
    );
  }

  {
    const holdGate = deferred();
    let controls = null;
    const harness = makeHarness(supervisorModule, {
      processStatusGate: holdGate,
      onStdinEnd(value) { controls = value; },
    });
    const { startPromise, delegationId } = await startLiveDelegation(
      harness,
      'result while hold confirmation is pending',
      'ext-hold-result-start',
    );
    await waitFor(() => controls !== null, 'result-race child controls');
    const holdPromise = harness.supervisor.handleExtRequest(
      lifecycleRequest('delegate.hold', delegationId),
      harness.emit,
    );
    await waitFor(
      () => harness.lifecycleCalls.some((call) => call.operation === 'inspect-status'),
      'result-race hold inspection',
    );
    controls.send([
      normalizedEvent('init', { tools: ['mcp__fsb'] }),
      normalizedEvent('result', { is_error: false }),
    ]);
    const terminal = await startPromise;
    assert.equal(terminal.status, 'succeeded');
    holdGate.resolve();
    assert.deepEqual(await holdPromise, { delegationId, status: 'hold_failed' });
    assert.equal(harness.terminationCalls.length, 1, 'result/hold race stops the tree once');
    assert.equal(harness.counters.remove, 1, 'result/hold race removes runtime state once');
    assert.equal(harness.scheduledTimers.length, 0, 'result/hold race cannot arm expiry');
  }

  {
    const resumeGate = deferred();
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: () => {},
      processStatusGates: [null, null, resumeGate],
    });
    const { startPromise, delegationId } = await startLiveDelegation(
      harness,
      'cancel while resume confirmation is pending',
      'ext-resume-cancel-start',
    );
    await harness.supervisor.handleExtRequest(
      lifecycleRequest('delegate.hold', delegationId),
      harness.emit,
    );
    const resumePromise = harness.supervisor.handleExtRequest(
      lifecycleRequest('delegate.resume', delegationId),
      harness.emit,
    );
    await waitFor(
      () => harness.lifecycleCalls.filter((call) => call.operation === 'inspect-status').length === 3,
      'resume/cancel pre-signal inspection',
    );
    const cancelPromise = harness.supervisor.handleExtRequest(
      cancelRequest(delegationId, { id: 'ext-resume-cancel' }),
      harness.emit,
    );
    const [cancelled, terminal] = await Promise.all([cancelPromise, startPromise]);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(terminal.status, 'cancelled');
    resumeGate.resolve();
    assert.deepEqual(await resumePromise, { delegationId, status: 'resume_failed' });
    assert.deepEqual(
      harness.lifecycleCalls.filter((call) => call.operation === 'signal').map((call) => call.signal),
      ['SIGSTOP'],
      'cancel wins before SIGCONT',
    );
    assert.equal(harness.terminationCalls.length, 1);
    assert.equal(harness.counters.remove, 1);
    assert.equal(harness.scheduledTimers[0].cleared, true);
  }

  {
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: () => {},
      signalError: 'SIGSTOP',
      terminateError: true,
    });
    const { startPromise, delegationId } = await startLiveDelegation(
      harness,
      'lingering descendant fail-closed fixture',
      'ext-lingering-descendant-start',
    );
    assert.deepEqual(
      await harness.supervisor.handleExtRequest(
        lifecycleRequest('delegate.hold', delegationId),
        harness.emit,
      ),
      { delegationId, status: 'hold_failed' },
    );
    const terminal = await startPromise;
    assert.equal(terminal.status, 'failed');
    assert.equal(terminal.terminal.code, 'tree_unsettled');
    assert.equal(harness.counters.remove, 0, 'unsettled descendants retain recovery evidence');
    assert.deepEqual(harness.degradations, ['tree_unsettled']);
  }
}

async function runStatusBoundsTest(supervisorModule) {
  const harness = makeHarness(supervisorModule, { onStdinEnd: () => {} });
  const starts = [];
  const earlyTerminals = [];
  for (let index = 0; index < supervisorModule.DELEGATION_ACTIVE_STATUS_LIMIT + 2; index += 1) {
    const startedBefore = harness.emitted.filter((event) => event.event === 'delegation.started').length;
    const start = harness.supervisor.handleExtRequest(
      startRequest(
        { adapterId: 'claude-code', task: `bounded active status ${index}` },
        { id: `ext-status-bound-start-${index}` },
      ),
      harness.emit,
    );
    starts.push(start);
    void start.then((terminal) => { earlyTerminals.push(terminal); });
    await waitFor(
      () => (
        harness.emitted.filter((event) => event.event === 'delegation.started').length > startedBefore
        || earlyTerminals.length > 0
      ),
      `bounded active status ${index}`,
    );
    assert.deepEqual(earlyTerminals, [], `bounded active status ${index} must remain live`);
  }
  const status = await harness.supervisor.handleExtRequest(statusRequest(), harness.emit);
  assert.equal(status.active.length, supervisorModule.DELEGATION_ACTIVE_STATUS_LIMIT);
  assert.deepEqual(
    status.active.map((entry) => entry.delegationId),
    [...status.active.map((entry) => entry.delegationId)].sort(),
    'bounded active status is deterministic by exact server id',
  );
  assert(status.active.every((entry) => (
    Object.keys(entry).sort().join(',') === 'delegationId,state'
    && entry.state === 'running'
  )), 'active status uses only its closed allowlist');
  await harness.supervisor.close();
  await Promise.all(starts);
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
  assert.equal(call.child.stdinBytes.length, 1, 'the selected task child receives one write');
  assert.equal(call.child.stdinEndCount, 1, 'the selected task child receives one EOF');

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
  assert.equal(harness.preparedEntry.generation, 'generation_fixture_0001');
  assert.equal(harness.activeEntry.generation, 'generation_fixture_0001');

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

function emittedResults(harness) {
  return harness.emitted.filter((event) => event.payload?.event?.type === 'result');
}

async function runTerminalResultBarrierTests(supervisorModule) {
  {
    const exitGate = deferred();
    const terminateGate = deferred();
    const removeGate = deferred();
    const harness = makeHarness(supervisorModule, {
      childOptions: { closeGate: exitGate },
      terminateGate,
      removeGate,
    });
    let settlements = 0;
    const startPromise = harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'three-gate terminal result barrier' }),
      harness.emit,
    ).then((terminal) => {
      settlements += 1;
      return terminal;
    });
    await waitFor(
      () => harness.spawnCalls[0]?.child.stdout.readableEnded === true,
      'result candidate parser EOF',
    );
    assert.equal(emittedResults(harness).length, 0, 'parser EOF keeps the candidate private');
    assert.equal(settlements, 0, 'parser EOF cannot settle delegate.start');

    exitGate.resolve();
    await waitFor(() => harness.terminationCalls.length === 1, 'clean child exit barrier');
    assert.equal(emittedResults(harness).length, 0, 'clean exit keeps the candidate private');
    assert.equal(settlements, 0, 'clean exit cannot settle before tree verification');

    terminateGate.resolve();
    await waitFor(() => harness.counters.remove === 1, 'verified task-tree barrier');
    assert.equal(emittedResults(harness).length, 0, 'tree settlement keeps the candidate private');
    assert.equal(settlements, 0, 'tree settlement cannot settle before runtime removal');

    removeGate.resolve();
    const terminal = await startPromise;
    assert.equal(terminal.status, 'succeeded');
    assert.equal(settlements, 1, 'the clean path settles once');
    assert.equal(emittedResults(harness).length, 1, 'the clean path publishes one result');
    assert(
      harness.order.indexOf(`remove:${terminal.delegationId}`)
        < harness.order.lastIndexOf('emit:delegation.event'),
      'runtime removal precedes public result publication',
    );
  }

  for (const fixture of [
    {
      name: 'provider is_error',
      events: [
        normalizedEvent('init', { tools: ['mcp__fsb'] }),
        normalizedEvent('result', { is_error: true }),
      ],
      exit: { code: 0, signal: null },
      options: {},
    },
    {
      name: 'nonzero exit',
      events: [
        normalizedEvent('init', { tools: ['mcp__fsb'] }),
        normalizedEvent('result', { is_error: false }),
      ],
      exit: { code: 7, signal: null },
      options: {},
    },
    {
      name: 'signal exit',
      events: [
        normalizedEvent('init', { tools: ['mcp__fsb'] }),
        normalizedEvent('result', { is_error: false }),
      ],
      exit: { code: null, signal: 'SIGTERM' },
      options: {},
    },
    {
      name: 'stderr fallback drift',
      events: [
        normalizedEvent('init', { tools: ['mcp__fsb'] }),
        normalizedEvent('result', { is_error: false }),
      ],
      exit: { code: 0, signal: null },
      options: { stderrValue: 'agent "fsb" not found. Falling back to default agent' },
    },
    {
      name: 'tree unsettled',
      events: [
        normalizedEvent('init', { tools: ['mcp__fsb'] }),
        normalizedEvent('result', { is_error: false }),
      ],
      exit: { code: 0, signal: null },
      options: { terminateError: true },
    },
    {
      name: 'runtime cleanup failure',
      events: [
        normalizedEvent('init', { tools: ['mcp__fsb'] }),
        normalizedEvent('result', { is_error: false }),
      ],
      exit: { code: 0, signal: null },
      options: { removeError: true },
    },
  ]) {
    const harness = makeHarness(supervisorModule, {
      ...fixture.options,
      onStdinEnd: (controls) => controls.send(fixture.events, fixture.exit,
        fixture.options.stderrValue ?? ''),
    });
    const terminal = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: `${fixture.name} result discard` }),
      harness.emit,
    );
    assert.notEqual(terminal.status, 'succeeded', `${fixture.name} is non-success`);
    assert.equal(emittedResults(harness).length, 0, `${fixture.name} publishes no result`);
  }

  {
    let controls = null;
    const exitGate = deferred();
    const harness = makeHarness(supervisorModule, {
      childOptions: { closeGate: exitGate },
      onStdinEnd: (childControls) => {
        controls = childControls;
        childControls.send([
          normalizedEvent('init', { tools: ['mcp__fsb'] }),
          normalizedEvent('result', { is_error: false }),
        ]);
      },
    });
    const startPromise = harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'candidate cancellation discard' }),
      harness.emit,
    );
    await waitFor(() => controls?.stdout.readableEnded === true, 'candidate before cancellation');
    const delegationId = harness.emitted.find((event) => event.event === 'delegation.started')
      ?.payload.delegationId;
    const cancelPromise = harness.supervisor.handleExtRequest(
      cancelRequest(delegationId),
      harness.emit,
    );
    exitGate.resolve();
    const [cancelled, terminal] = await Promise.all([cancelPromise, startPromise]);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(terminal.status, 'cancelled');
    assert.equal(emittedResults(harness).length, 0, 'cancellation discards a parsed candidate');
  }
}

async function runFailureBarrierTests(supervisorModule) {
  {
    const sentinel = 'agent "fsb" not found. Falling back to default agent';
    const harness = makeHarness(supervisorModule, { stderrValue: `prefix ${sentinel} suffix` });
    const task = 'direct fallback sentinel task';
    const result = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task }),
      harness.emit,
    );
    assert.equal(result.status, 'failed');
    assert.equal(harness.spawnCalls.length, 1);
    assert.equal(harness.spawnCalls[0].child.stdinBytes.length, 1);
    assert.equal(harness.spawnCalls[0].child.stdinEndCount, 1);
    assert.equal(harness.terminationCalls.length, 1);
    assert.equal(JSON.stringify({ result, emitted: harness.emitted }).includes(sentinel), false);
    assert.equal(JSON.stringify({ result, emitted: harness.emitted }).includes(task), false);
  }

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
    const harness = makeHarness(supervisorModule, { emitError: 'delegation.event' });
    const result = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'active emitter route loss fixture' }),
      harness.emit,
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.terminal.code, 'route_lost', 'active emitter errors retain route_lost fidelity');
    assert.equal(harness.emitted[0].event, 'delegation.started', 'active emitter failure occurs after authority starts');
    assert.equal(harness.terminationCalls.length, 1, 'active emitter failure stops the tree once');
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
    assert.deepEqual(result.terminal.detail, {
      adapterId: 'claude-code',
      expected: 'adapter_contract',
      observed: 'protocol_drift',
    });
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
    assert.deepEqual(result.terminal.detail, {
      adapterId: 'claude-code',
      expected: 'adapter_contract',
      observed: 'protocol_drift',
    });
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
    assert.deepEqual(result.terminal.detail, {
      adapterId: 'claude-code',
      expected: 'adapter_contract',
      observed: 'protocol_drift',
    });
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

async function runTypedDriftDetailTests(supervisorModule, protocolDriftModule) {
  const expectedByReason = Object.freeze({
    configuration_surface: 'known_event_shape',
    duplicate_init: 'single_init_session',
    duplicate_result: 'single_terminal_result',
    event_after_result: 'single_terminal_result',
    event_before_init: 'single_init_session',
    invalid_json: 'bounded_jsonl',
    invalid_shape: 'known_event_shape',
    invalid_utf8: 'bounded_jsonl',
    line_too_large: 'bounded_jsonl',
    missing_result: 'single_terminal_result',
    session_mismatch: 'single_init_session',
    unknown_event_type: 'known_event_shape',
    unknown_stream_event: 'known_event_shape',
    unknown_system_subtype: 'known_event_shape',
  });
  const forbiddenCanary = 'TOP_SECRET_DRIFT_CANARY_prompt_session_token_path_provider_output';

  for (const [reason, expected] of Object.entries(expectedByReason)) {
    const drift = new protocolDriftModule.AgentProtocolDriftError(
      reason,
      7,
      [`message.content.${forbiddenCanary}`],
    );
    drift.message = forbiddenCanary;
    drift.stack = forbiddenCanary;
    drift.cause = { rawProviderOutput: forbiddenCanary };
    drift.line = forbiddenCanary;
    drift.task = forbiddenCanary;
    drift.version = forbiddenCanary;
    const harness = makeHarness(supervisorModule, {
      parseEvents() {
        return (async function* failWithTypedDrift() {
          throw drift;
        })();
      },
    });

    const result = await harness.supervisor.handleExtRequest(
      startRequest(
        { adapterId: 'claude-code', task: `typed drift reason ${reason}` },
        { id: `ext-typed-drift-${reason}` },
      ),
      harness.emit,
    );

    assert.equal(result.status, 'failed', `${reason} is terminal failure`);
    assert.deepEqual(Object.keys(result.terminal).sort(), [
      'code',
      'detail',
      'profileVersion',
      'type',
    ]);
    assert.equal(result.terminal.type, 'diagnostic');
    assert.equal(result.terminal.code, 'agent_protocol_drift');
    assert.deepEqual(result.terminal.detail, {
      adapterId: 'claude-code',
      expected,
      observed: reason,
    });
    assert.deepEqual(Object.keys(result.terminal.detail), [
      'adapterId',
      'expected',
      'observed',
    ]);
    assert(Object.values(result.terminal.detail).every((label) => label.length <= 64));
    assert.equal(JSON.stringify(result).includes(forbiddenCanary), false);
    assert.equal(
      harness.emitted.some((event) => event.payload?.event?.type === 'result'),
      false,
      `${reason} emits no success result`,
    );
    assert.equal(harness.terminationCalls.length, 1, `${reason} stops the child once`);
    assert.equal(harness.counters.remove, 1, `${reason} removes runtime state once`);
  }

  assert.deepEqual(
    Object.keys(expectedByReason).sort(),
    [
      'configuration_surface',
      'duplicate_init',
      'duplicate_result',
      'event_after_result',
      'event_before_init',
      'invalid_json',
      'invalid_shape',
      'invalid_utf8',
      'line_too_large',
      'missing_result',
      'session_mismatch',
      'unknown_event_type',
      'unknown_stream_event',
      'unknown_system_subtype',
    ],
    'the typed reason table is exhaustive for the production parser',
  );
}

async function runCancelAndShutdownTests(supervisorModule) {
  for (const fixture of [
    {
      name: 'successful result',
      result: normalizedEvent('result', { is_error: false }),
      exit: { code: 0, signal: null },
    },
    {
      name: 'is_error result',
      result: normalizedEvent('result', { is_error: true }),
      exit: { code: 0, signal: null },
    },
    {
      name: 'process_exit failure',
      result: normalizedEvent('result', { is_error: false }),
      exit: { code: 1, signal: null },
    },
  ]) {
    const route = new AbortController();
    const removeGate = deferred();
    const harness = makeHarness(supervisorModule, {
      removeGate,
      onStdinEnd: (controls) => controls.send([
        normalizedEvent('init', { tools: ['mcp__fsb'] }),
        fixture.result,
      ], fixture.exit),
    });
    let settlements = 0;
    const startPromise = harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: `${fixture.name} held cleanup route loss` }),
      harness.emit,
      { signal: route.signal },
    ).then((terminal) => {
      settlements += 1;
      return terminal;
    });
    await waitFor(
      () => harness.counters.remove === 1,
      `${fixture.name} held final cleanup`,
    );
    route.abort(new Error('fixture route lost during final cleanup'));
    route.abort(new Error('duplicate route loss during final cleanup'));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settlements, 0, `${fixture.name} cannot settle before held cleanup completes`);
    assert.equal(harness.terminationCalls.length, 1, `${fixture.name} stops the tree once`);
    assert.equal(harness.counters.remove, 1, `${fixture.name} shares one runtime cleanup`);
    removeGate.resolve();
    const terminal = await startPromise;
    assert.equal(settlements, 1, `${fixture.name} has one observable terminal settlement`);
    assert.equal(terminal.status, 'failed', `${fixture.name} route loss is non-success`);
    assert.equal(terminal.terminal.code, 'route_lost', `${fixture.name} preserves route-loss precedence`);
    assert.equal(harness.terminationCalls.length, 1, `${fixture.name} retains one tree stop`);
    assert.equal(harness.counters.remove, 1, `${fixture.name} retains one runtime cleanup`);
    assert.equal(harness.runtimeRuns.size, 0, `${fixture.name} removes all runtime state`);
  }

  {
    const route = new AbortController();
    const harness = makeHarness(supervisorModule, { onStdinEnd: () => {} });
    const startPromise = harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'route lifetime cancellation fixture' }),
      harness.emit,
      { signal: route.signal },
    );
    await waitFor(
      () => harness.emitted.some((event) => event.event === 'delegation.started'),
      'delegation.started before route loss',
    );
    route.abort(new Error('fixture route lost'));
    route.abort(new Error('duplicate route loss'));
    const terminal = await startPromise;
    assert.equal(terminal.status, 'failed', 'route loss is a non-success terminal state');
    assert.equal(terminal.terminal.code, 'route_lost', 'route loss preserves its domain failure code');
    assert.equal(harness.terminationCalls.length, 1, 'route loss stops the tree exactly once');
    assert.equal(harness.counters.remove, 1, 'route loss removes the verified runtime journal');
    assert.deepEqual(
      await harness.supervisor.handleExtRequest(statusRequest(), harness.emit),
      {
        generation: 'generation_fixture_0001',
        active: [],
        restartLosses: [],
        routeLosses: [{
          delegationId: terminal.delegationId,
          code: 'route_lost',
          lostAt: 1003,
        }],
      },
      'confirmed route cleanup is distinct from daemon-restart loss',
    );
  }

  {
    const route = new AbortController();
    const harness = makeHarness(supervisorModule, {
      onStdinEnd: () => {},
      terminateError: true,
    });
    const startPromise = harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'unsettled route loss fixture' }),
      harness.emit,
      { signal: route.signal },
    );
    await waitFor(
      () => harness.emitted.some((event) => event.event === 'delegation.started'),
      'delegation.started before unsettled route loss',
    );
    route.abort(new Error('fixture route lost before failed cleanup'));
    const terminal = await startPromise;
    assert.equal(terminal.terminal.code, 'tree_unsettled');
    assert.equal(harness.terminationCalls.length, 1);
    assert.equal(harness.supervisor.routeLosses.size, 0,
      'failed cleanup never records route-loss disposition evidence before degradation');
  }

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

async function runStdinLifecycleTests(supervisorModule) {
  for (const stdinEndFailure of ['close', 'error']) {
    const harness = makeHarness(supervisorModule, {
      childOptions: { stdinEndFailure },
      onStdinEnd: () => {},
    });
    const result = await harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: `${stdinEndFailure} during stdin EOF` }),
      harness.emit,
    );
    assert.equal(result.status, 'failed', `${stdinEndFailure} during EOF is non-success`);
    assert.equal(result.terminal.code, 'stdin_failed', `${stdinEndFailure} during EOF is classified as stdin_failed`);
    assert.equal(harness.terminationCalls.length, 1, `${stdinEndFailure} during EOF stops the tree once`);
  }

  {
    const harness = makeHarness(supervisorModule, {
      childOptions: { holdStdinWrite: true, highWaterMark: 1 },
      onStdinEnd: () => {},
    });
    const startPromise = harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'stdin backpressure never drains' }),
      harness.emit,
    );
    await waitFor(
      () => harness.spawnCalls[0]?.child.stdin.writableNeedDrain === true,
      'standalone stdin no-drain backpressure',
    );
    harness.spawnCalls[0].child.close({ code: 1, signal: null });
    const terminal = await startPromise;
    assert.equal(terminal.status, 'failed', 'child close without drain is non-success');
    assert.equal(terminal.terminal.code, 'stdin_failed', 'child close without drain is classified as stdin_failed');
    assert.equal(harness.terminationCalls.length, 1, 'child close without drain still verifies tree cleanup once');
  }

  {
    const stdinCloseGate = deferred();
    const harness = makeHarness(supervisorModule, {
      childOptions: { holdStdinWrite: true, highWaterMark: 1, stdinCloseGate },
      onStdinEnd: () => {},
    });
    const startPromise = harness.supervisor.handleExtRequest(
      startRequest({ adapterId: 'claude-code', task: 'cancel while stdin backpressure never drains' }),
      harness.emit,
    );
    await waitFor(
      () => harness.spawnCalls[0]?.child.stdin.writableNeedDrain === true,
      'stdin no-drain backpressure',
    );
    let closeSettled = false;
    const closePromise = harness.supervisor.close().then((result) => {
      closeSettled = true;
      return result;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(closeSettled, false, 'close joins the backpressured stdin continuation');
    stdinCloseGate.resolve();
    const [closed, terminal] = await Promise.all([closePromise, startPromise]);
    assert.deepEqual(closed, { cancelled: 1, failed: 0, alreadySettled: 0 });
    assert.equal(terminal.status, 'cancelled', 'backpressured stdin cancellation settles as cancelled');
    assert.equal(harness.terminationCalls.length, 1, 'backpressured stdin cancellation stops the tree once');
    assert.equal(harness.counters.remove, 1, 'backpressured stdin cancellation removes runtime state');
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
    restartLosses: [],
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

async function runRecoveryStatusTests(supervisorModule) {
  const restartLosses = Array.from({ length: 130 }, (_, index) => ({
    delegationId: `delegation_restart_${String(index).padStart(4, '0')}`,
    code: 'daemon_restart_lost_run',
    recoveredAt: 1700000000000 + index,
  }));
  restartLosses.push({
    delegationId: 'delegation_restart_0050',
    code: 'daemon_restart_lost_run',
    recoveredAt: 1800000000000,
  });
  restartLosses.push({
    delegationId: 'delegation_restart_secret',
    code: 'daemon_restart_lost_run',
    recoveredAt: 1800000000001,
    task: 'STATUS_SECRET_CANARY_MUST_NOT_LEAK',
  });
  const harness = makeHarness(supervisorModule, {
    recoveryResult: Object.freeze({
      confirmedKilled: 1,
      staleCleared: 1,
      ambiguousFailClosed: 0,
      spawnAvailable: true,
      profiles: Object.freeze([]),
      restartLosses: Object.freeze(restartLosses),
    }),
  });
  assert.deepEqual(
    (await harness.supervisor.handleExtRequest(statusRequest(), harness.emit)).restartLosses,
    [],
    'status does not invent restart loss before startup recovery',
  );
  await harness.supervisor.recover();
  const first = await harness.supervisor.handleExtRequest(statusRequest(), harness.emit);
  const second = await harness.supervisor.handleExtRequest(statusRequest(), harness.emit);
  assert.deepEqual(second, first, 'repeated status is non-destructive and idempotent');
  assert.equal(first.restartLosses.length, supervisorModule.DELEGATION_RECOVERY_STATUS_LIMIT);
  assert.equal(
    new Set(first.restartLosses.map((entry) => entry.delegationId)).size,
    first.restartLosses.length,
    'recovery status de-duplicates delegation ids',
  );
  assert.deepEqual(
    first.restartLosses,
    [...first.restartLosses].sort((left, right) => (
      left.recoveredAt - right.recoveredAt
      || left.delegationId.localeCompare(right.delegationId)
    )),
    'recovery status order is deterministic',
  );
  assert(Object.isFrozen(first.restartLosses));
  assert(first.restartLosses.every((entry) => (
    Object.isFrozen(entry)
    && Object.keys(entry).sort().join(',') === 'code,delegationId,recoveredAt'
  )));
  const serialized = JSON.stringify(first);
  for (const forbidden of [
    'STATUS_SECRET_CANARY_MUST_NOT_LEAK',
    'pid',
    'argv',
    'env',
    'cwd',
    'task',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} is absent from recovery status`);
  }
}

async function runRouteLossStatusTests(supervisorModule) {
  const secret = 'ROUTE_STATUS_SECRET_CANARY_MUST_NOT_LEAK';
  const harness = makeHarness(supervisorModule, { emitError: 'delegation.started' });
  const expectedIds = [];
  for (let index = 0; index < supervisorModule.DELEGATION_RECOVERY_STATUS_LIMIT + 2; index += 1) {
    const terminal = await harness.supervisor.handleExtRequest(
      startRequest(
        { adapterId: 'claude-code', task: `${secret}-${index}` },
        { id: `ext-route-loss-bound-${index}` },
      ),
      harness.emit,
    );
    assert.equal(terminal.terminal.code, 'route_lost');
    expectedIds.push(terminal.delegationId);
  }
  const first = await harness.supervisor.handleExtRequest(statusRequest(), harness.emit);
  const second = await harness.supervisor.handleExtRequest(statusRequest(), harness.emit);
  assert.deepEqual(second, first, 'route-loss status is non-destructive across repeated reads');
  assert.equal(first.routeLosses.length, supervisorModule.DELEGATION_RECOVERY_STATUS_LIMIT);
  assert.deepEqual(
    first.routeLosses.map((entry) => entry.delegationId),
    expectedIds.slice(-supervisorModule.DELEGATION_RECOVERY_STATUS_LIMIT),
    'route-loss evidence retains only the newest bounded exact ids',
  );
  assert.deepEqual(
    first.routeLosses,
    [...first.routeLosses].sort((left, right) => (
      left.lostAt - right.lostAt
      || left.delegationId.localeCompare(right.delegationId)
    )),
    'route-loss evidence has deterministic status order',
  );
  assert(Object.isFrozen(first.routeLosses));
  assert(first.routeLosses.every((entry) => (
    Object.isFrozen(entry)
    && Object.keys(entry).sort().join(',') === 'code,delegationId,lostAt'
    && entry.code === 'route_lost'
  )));
  const serialized = JSON.stringify(first.routeLosses);
  for (const forbidden of [secret, 'pid', 'argv', 'env', 'cwd', 'task']) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} is absent from route-loss status`);
  }

  const oldId = 'delegation_route_loss_reuse_old';
  const freshId = 'delegation_route_loss_reuse_fresh';
  const minted = [oldId, oldId, freshId];
  const reuseHarness = makeHarness(supervisorModule, {
    emitError: 'delegation.started',
    mintDelegationId: () => minted.shift(),
  });
  const firstTerminal = await reuseHarness.supervisor.handleExtRequest(
    startRequest({ adapterId: 'claude-code', task: 'route loss identity reserve' }),
    reuseHarness.emit,
  );
  assert.equal(firstTerminal.delegationId, oldId);
  reuseHarness.supervisor.completedRuns.delete(oldId);
  const secondTerminal = await reuseHarness.supervisor.handleExtRequest(
    startRequest(
      { adapterId: 'claude-code', task: 'route loss identity cannot be recycled' },
      { id: 'ext-route-loss-reuse' },
    ),
    reuseHarness.emit,
  );
  assert.equal(secondTerminal.delegationId, freshId,
    'retained route-loss evidence reserves its exact id after completed-result eviction');
}

async function main() {
  const supervisorModule = await import(pathToFileURL(supervisorBuildPath).href);
  const registryModule = await import(pathToFileURL(registryBuildPath).href);
  const protocolDriftModule = await import(pathToFileURL(protocolDriftBuildPath).href);
  assert.equal(supervisorModule.DELEGATION_TASK_LIMIT_BYTES, 64 * 1024);
  assert.equal(supervisorModule.DELEGATION_STDERR_LIMIT_BYTES, 64 * 1024);
  assert.equal(supervisorModule.DELEGATION_ACTIVE_STATUS_LIMIT, 64);
  assert.equal(supervisorModule.DELEGATION_RECOVERY_STATUS_LIMIT, 128);
  assert.equal(supervisorModule.DELEGATION_HOLD_EXPIRY_MS, 5 * 60 * 1000);
  assert.equal(supervisorModule.DELEGATION_PROCESS_TRANSITION_GRACE_MS, 500);
  assert.equal(supervisorModule.DELEGATION_PROCESS_TRANSITION_POLL_MS, 25);
  await runStrictPayloadTests(supervisorModule);
  await runLifecycleProtocolTests(supervisorModule);
  await runPosixLifecycleRaceTests(supervisorModule);
  await runStatusBoundsTest(supervisorModule);
  await runHappyPathTest(supervisorModule);
  await runTerminalResultBarrierTests(supervisorModule);
  await runFailureBarrierTests(supervisorModule);
  await runTypedDriftDetailTests(supervisorModule, protocolDriftModule);
  await runCancelAndShutdownTests(supervisorModule);
  await runSetupCancellationRaceTests(supervisorModule);
  await runStdinLifecycleTests(supervisorModule);
  await runRecoveryAndRegistryTests(supervisorModule, registryModule);
  await runRecoveryStatusTests(supervisorModule);
  await runRouteLossStatusTests(supervisorModule);
  console.log('mcp-spawn-supervisor.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-spawn-supervisor.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
