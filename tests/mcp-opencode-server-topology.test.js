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

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function startRequest(adapterId, task, id) {
  return {
    id,
    type: 'ext:request',
    method: 'delegate.start',
    payload: { adapterId, task },
  };
}

function normalizedEvent(type, payload = {}, sessionId = 'session_topology_fixture') {
  return { type, sessionId, payload };
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
      if (line) yield JSON.parse(line);
    }
  }
  if (pending) yield JSON.parse(pending);
}

function makeChild(role, pid, controls) {
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

  const send = (events, exit = { code: 0, signal: null }) => {
    if (closed) return;
    for (const event of events) stdout.write(`${JSON.stringify(event)}\n`);
    close(exit);
  };

  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      stdinBytes.push(Buffer.from(chunk));
      if (controls.stdinFailureRoles.has(role)) {
        callback(new Error('fixture stdin failure'));
        return;
      }
      setImmediate(callback);
    },
    final(callback) {
      callback();
      if (role === 'owned_server') return;
      const finish = () => {
        if (controls.zeroEventRoles.has(role)) {
          close({ code: 1, signal: null });
          return;
        }
        send([
          normalizedEvent('init', { role }, `session-topology-${pid}`),
          normalizedEvent('result', { is_error: false, role }, `session-topology-${pid}`),
        ]);
      };
      if (controls.holdTaskRoles.has(role)) {
        const pending = controls.pendingTaskCompletions.get(role) ?? [];
        pending.push(finish);
        controls.pendingTaskCompletions.set(role, pending);
      } else {
        setImmediate(finish);
      }
    },
  });

  Object.assign(child, {
    pid,
    stdin,
    stdout,
    stderr,
    stdinBytes,
    close,
    get closed() { return closed; },
  });
  queueMicrotask(() => {
    child.emit('spawn');
    if (role === 'owned_server') {
      for (const chunk of controls.readinessChunks) stdout.write(chunk);
      if (controls.closeServerBeforeReadiness) close({ code: 1, signal: null });
    }
  });
  return child;
}

function processSpec(role, adapterId, context) {
  const command = `/fixture/bin/${adapterId}`;
  const common = {
    role,
    command,
    cwd: '/fixture/workspace',
    privateFiles: [context.privateMcpConfigPath],
    fixedEnv: {
      FSB_AGENT_ADAPTER: adapterId,
      FSB_AGENT_PROFILE: 'fixture-profile-1',
      FSB_DELEGATION_ID: context.delegationId,
      FSB_AGENT_FINGERPRINT: context.runtimeFingerprint,
      FSB_TEST_PROCESS_ROLE: role,
    },
    spawnSecretEnvBindings: [],
    stdin: role === 'owned_server' ? 'none' : 'task',
    stdout: role === 'owned_server' ? 'bounded_readiness' : 'agent_jsonl',
  };
  if (role === 'owned_server') {
    return {
      ...common,
      spawnSecretEnvBindings: [{
        envKey: 'OPENCODE_SERVER_PASSWORD',
        secretRef: 'owned_server_basic_password',
      }],
      argv: ['serve', '--hostname', '127.0.0.1', '--port', '0', '--mdns', 'false'],
    };
  }
  if (role === 'attach_task') {
    return {
      ...common,
      spawnSecretEnvBindings: [{
        envKey: 'OPENCODE_SERVER_PASSWORD',
        secretRef: 'owned_server_basic_password',
      }],
      argv: ['run', '--attach', { runtimeRef: 'owned_server_endpoint' }],
    };
  }
  return { ...common, argv: [role] };
}

function makeAdapter(adapterId, topologyKind) {
  return Object.freeze({
    async detect() {
      const command = `/fixture/bin/${adapterId}`;
      return {
        installed: true,
        version: 'fixture-profile-1',
        authState: 'unknown',
        profileVersion: 'fixture-profile-1',
        binary: { command, realPath: command, argvPrefix: [] },
      };
    },
    async buildSpawn(_task, context) {
      if (topologyKind === 'direct') {
        return {
          adapterId,
          profileVersion: 'fixture-profile-1',
          topology: {
            kind: 'direct',
            task: processSpec('direct_task', adapterId, context),
          },
          attestations: [],
        };
      }
      return {
        adapterId,
        profileVersion: 'fixture-profile-1',
        topology: {
          kind: 'owned_server',
          server: processSpec('owned_server', adapterId, context),
          coldTask: processSpec('cold_task', adapterId, context),
          attachTask: processSpec('attach_task', adapterId, context),
          readiness: {
            linePrefix: 'opencode server listening on http://127.0.0.1:',
            maxBytes: 4096,
            timeoutMs: 5000,
          },
          idle: { timeoutMs: 300000 },
          runtimeRefs: {
            endpoint: 'owned_server_endpoint',
            generation: 'daemon_generation',
          },
        },
        attestations: [],
      };
    },
    parseEvents: parseNormalizedLines,
    async kill() {},
    caps() {
      return {
        taskMode: true,
        chatMode: false,
        resume: false,
        serverMode: topologyKind === 'owned_server',
      };
    },
  });
}

function makeHarness(supervisorModule, options = {}) {
  const secretBytes = options.secretBytes ?? Buffer.from(
    'owned-server-secret-fixture-material-0001',
    'utf8',
  );
  const controls = {
    spawnFailureRoles: new Set(),
    stdinFailureRoles: new Set(),
    zeroEventRoles: new Set(),
    serverIdentityValid: true,
    readinessChunks: ['opencode server listening on http://127.0.0.1:43123\n'],
    closeServerBeforeReadiness: false,
    healthResponse: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify({ healthy: true, version: 'fixture-profile-1' })),
    },
    healthGate: null,
    holdTaskRoles: new Set(),
    pendingTaskCompletions: new Map(),
  };
  const spawnCalls = [];
  const emitted = [];
  const journal = new Map();
  const activePids = new Map();
  const spawnedPids = new Map();
  const children = new Map();
  const randomCalls = [];
  const httpCalls = [];
  const terminationCalls = [];
  const lifecycleEvents = [];
  const scheduledTimers = [];
  let fakeClock = 0;
  let nextPid = 51000;
  let lastSpawn = null;
  let idCounter = 0;

  const adapters = new Map([
    // Deliberately inverted: topology shape, not provider identity, must select behavior.
    ['claude-code', makeAdapter('claude-code', 'owned_server')],
    ['opencode', makeAdapter('opencode', 'direct')],
  ]);
  const registry = {
    require(id) {
      const adapter = adapters.get(id);
      if (!adapter) throw new Error('unexpected adapter');
      return adapter;
    },
    ids() { return ['claude-code', 'opencode']; },
  };

  const runtimeFiles = {
    pathsFor(id) {
      const runDirectory = `/fixture/runtime/${id}`;
      return {
        runDirectory,
        mcpConfigPath: `${runDirectory}/mcp-config.json`,
        opencodeConfigRoot: `${runDirectory}/xdg`,
        opencodeConfigDirectory: `${runDirectory}/xdg/opencode`,
        opencodeConfigPath: `${runDirectory}/xdg/opencode/opencode.json`,
        opencodeTestHomePath: `${runDirectory}/test-home`,
        opencodeManagedConfigPath: `${runDirectory}/managed-config`,
      };
    },
    async prepareRun(input) {
      const role = input.role ?? 'delegation';
      const entry = Object.freeze({
        state: 'prepared',
        role,
        delegationId: input.delegationId,
        adapterId: input.adapterId,
        profileVersion: input.profileVersion,
        createdAt: input.createdAt,
        binaryRealPath: input.binaryRealPath,
        argvSignature: input.argvSignature,
        fixedEnv: Object.freeze({ ...(input.fixedEnv ?? {}) }),
        envFingerprint: input.envFingerprint,
        generation: input.generation,
      });
      journal.set(`${role}:${input.delegationId}`, entry);
      return { entry, ...this.pathsFor(input.delegationId) };
    },
    async activateRun(input) {
      const role = input.role ?? 'delegation';
      const key = `${role}:${input.delegationId}`;
      const prepared = journal.get(key);
      assert(prepared, `prepared ${key} exists before activation`);
      const active = Object.freeze({
        ...prepared,
        state: 'active',
        pid: input.pid,
        processGroupId: input.processGroupId,
        startedAt: input.startedAt,
        processStartIdentity: input.processStartIdentity,
      });
      journal.set(key, active);
      activePids.set(key, input.pid);
      return active;
    },
    async removeRun(input) {
      const role = typeof input === 'string' ? 'delegation' : input.role;
      const id = typeof input === 'string' ? input : input.delegationId;
      journal.delete(`${role}:${id}`);
      activePids.delete(`${role}:${id}`);
      lifecycleEvents.push(`remove:${role}:${id}`);
    },
  };

  const inspector = {
    async inspect(entry) {
      if (entry.role === 'provider_server' && !controls.serverIdentityValid) {
        return { classification: 'stale' };
      }
      const key = `${entry.role}:${entry.delegationId}`;
      const pid = activePids.get(key) ?? spawnedPids.get(key) ?? lastSpawn?.child.pid;
      if (!pid) return { classification: 'stale' };
      return {
        classification: 'confirmed',
        process: {
          pid,
          parentPid: 1,
          processGroupId: pid,
          processStartIdentity: `start-${pid}`,
          descendants: [],
        },
      };
    },
  };

  const terminator = {
    async stop(entry, supervisedChild) {
      terminationCalls.push({ entry, supervisedChild });
      lifecycleEvents.push(`stop:${entry.role}:${entry.delegationId}`);
      if (!supervisedChild) return;
      const child = children.get(supervisedChild.pid);
      if (child && !child.closed) child.close({ code: null, signal: 'SIGTERM' });
      await supervisedChild.closed;
    },
  };

  const startupRecovery = {
    async recover() {
      return {
        confirmedKilled: 0,
        staleCleared: 0,
        ambiguousFailClosed: 0,
        spawnAvailable: true,
        profiles: [],
        restartLosses: [],
      };
    },
  };

  const supervisor = supervisorModule.createSpawnSupervisor({
    registry,
    runtimeFiles,
    inspector,
    terminator,
    startupRecovery,
    endpoint: 'http://127.0.0.1:7226/mcp',
    cwd: '/fixture/workspace',
    platform: 'linux',
    environment: {
      PATH: '/fixture/bin',
      SAFE_VALUE: 'safe',
      OPENCODE_SERVER_PASSWORD: 'inherited-password-must-not-cross',
    },
    spawn(command, argv, options) {
      const role = options.env.FSB_TEST_PROCESS_ROLE;
      assert.equal(typeof role, 'string');
      const call = {
        command,
        argv: [...argv],
        options,
        role,
        passwordAtSpawn: options.env.OPENCODE_SERVER_PASSWORD,
        child: null,
      };
      spawnCalls.push(call);
      if (controls.spawnFailureRoles.has(role)) {
        throw new Error(`fixture ${role} spawn failure`);
      }
      const child = makeChild(role, ++nextPid, controls);
      call.child = child;
      lastSpawn = call;
      children.set(child.pid, child);
      const journalKey = role === 'owned_server'
        ? [...journal.entries()]
            .filter(([, entry]) => entry.role === 'provider_server' && entry.state === 'prepared')
            .at(-1)?.[0]
        : `delegation:${options.env.FSB_DELEGATION_ID}`;
      if (journalKey) spawnedPids.set(journalKey, child.pid);
      return child;
    },
    randomBytes(size) {
      randomCalls.push(size);
      return Buffer.from(secretBytes);
    },
    async requestOwnedServer(requestOptions) {
      httpCalls.push({
        options: requestOptions,
        authorizationAtCall: requestOptions.headers.Authorization,
      });
      if (controls.healthGate) await controls.healthGate.promise;
      if (controls.healthResponse instanceof Error) throw controls.healthResponse;
      return controls.healthResponse;
    },
    wallNow: (() => { let now = 1000; return () => ++now; })(),
    monotonicNow: (() => { let now = 0; return () => ++now; })(),
    wait: async () => {},
    mintDelegationId: () => `delegation_topology_${String(++idCounter).padStart(4, '0')}`,
    mintFingerprint: () => `runtime_fingerprint_${String(idCounter).padStart(4, '0')}`,
    mintGeneration: () => 'generation_topology_0001',
    schedule(callback, milliseconds) {
      const timer = {
        callback,
        milliseconds,
        dueAt: fakeClock + milliseconds,
        cleared: false,
        fired: false,
        unref() {},
      };
      scheduledTimers.push(timer);
      return timer;
    },
    clearScheduled(timer) { timer.cleared = true; },
    terminationGrace: 25,
    activationAttempts: 3,
  });

  return {
    supervisor,
    controls,
    spawnCalls,
    randomCalls,
    httpCalls,
    journal,
    terminationCalls,
    lifecycleEvents,
    scheduledTimers,
    secretPassword: secretBytes.toString('base64url'),
    releaseTasks(role, count = Infinity) {
      const pending = controls.pendingTaskCompletions.get(role) ?? [];
      const selected = pending.splice(0, count);
      for (const finish of selected) setImmediate(finish);
    },
    async advanceClock(milliseconds) {
      fakeClock += milliseconds;
      while (true) {
        const timer = scheduledTimers
          .filter((candidate) => (
            !candidate.cleared && !candidate.fired && candidate.dueAt <= fakeClock
          ))
          .sort((left, right) => left.dueAt - right.dueAt)[0];
        if (!timer) break;
        timer.fired = true;
        timer.callback();
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    emitted,
    emit(event) { emitted.push(event); },
  };
}

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function bounded(operation, label, milliseconds = 2000) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runSelectionReplay(supervisorModule) {
  {
    const harness = makeHarness(supervisorModule);
    const direct = await harness.supervisor.handleExtRequest(
      startRequest('opencode', 'poison-id direct topology', 'ext-topology-direct'),
      harness.emit,
    );
    assert.equal(direct.status, 'succeeded');
    assert.deepEqual(harness.spawnCalls.map((call) => call.role), ['direct_task']);

    const first = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'poison-id cold topology', 'ext-topology-cold'),
      harness.emit,
    );
    assert.equal(first.status, 'succeeded');
    assert.deepEqual(
      harness.spawnCalls.map((call) => call.role),
      ['direct_task', 'owned_server', 'cold_task'],
      'the first owned topology starts one server but executes exactly one cold task child',
    );

    const second = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'poison-id warm topology', 'ext-topology-attach'),
      harness.emit,
    );
    assert.equal(second.status, 'succeeded');
    assert.deepEqual(
      harness.spawnCalls.map((call) => call.role),
      ['direct_task', 'owned_server', 'cold_task', 'attach_task'],
      'a later task attaches only to the supervisor-owned ready lease',
    );
    assert.match(harness.spawnCalls.at(-1).argv.at(-1), /^http:\/\/127\.0\.0\.1:43123$/);
    await harness.supervisor.close();
  }

  {
    const harness = makeHarness(supervisorModule);
    const first = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'warm invalidation seed', 'ext-invalidation-seed'),
      harness.emit,
    );
    assert.equal(first.status, 'succeeded');
    harness.controls.serverIdentityValid = false;
    const fallback = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'invalid lease cold fallback', 'ext-invalidation-fallback'),
      harness.emit,
    );
    assert.equal(fallback.status, 'succeeded');
    assert.equal(
      harness.spawnCalls.filter((call) => call.role === 'cold_task').length,
      2,
      'invalid ownership discovered before task spawn chooses cold once',
    );
    assert.equal(
      harness.spawnCalls.filter((call) => call.role === 'attach_task').length,
      0,
    );
    await harness.supervisor.close();
  }

  for (const failure of ['spawn', 'stdin', 'zero-event']) {
    const harness = makeHarness(supervisorModule);
    const seed = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', `warm replay fence ${failure}`, `ext-replay-seed-${failure}`),
      harness.emit,
    );
    assert.equal(seed.status, 'succeeded');
    if (failure === 'spawn') harness.controls.spawnFailureRoles.add('attach_task');
    if (failure === 'stdin') harness.controls.stdinFailureRoles.add('attach_task');
    if (failure === 'zero-event') harness.controls.zeroEventRoles.add('attach_task');
    const before = harness.spawnCalls.length;
    const terminal = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', `never replay after ${failure}`, `ext-replay-${failure}`),
      harness.emit,
    );
    assert.equal(terminal.status, 'failed', `${failure} is terminal failure`);
    assert.deepEqual(
      harness.spawnCalls.slice(before).map((call) => call.role),
      ['attach_task'],
      `${failure} after the replay fence creates no cold retry`,
    );
    assert.equal(
      harness.spawnCalls.filter((call) => call.role === 'cold_task').length,
      1,
      `${failure} cannot replay task text through a second cold child`,
    );
    await harness.supervisor.close();
  }

  {
    const harness = makeHarness(supervisorModule);
    const seed = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'warm cancellation fence', 'ext-cancel-seed'),
      harness.emit,
    );
    assert.equal(seed.status, 'succeeded');
    const gate = deferred();
    harness.controls.zeroEventRoles.add('attach_task');
    const operation = harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'cancel never replays', 'ext-cancel-replay'),
      harness.emit,
    );
    await waitFor(
      () => harness.emitted.filter((event) => event.event === 'delegation.started').length === 2,
      'attach delegation.started before cancellation',
    );
    const delegationId = harness.emitted.at(-1).payload.delegationId;
    const cancelled = await harness.supervisor.handleExtRequest({
      id: 'ext-cancel-replay-request',
      type: 'ext:request',
      method: 'delegate.cancel',
      payload: { delegationId },
    }, harness.emit);
    gate.resolve();
    assert.equal(cancelled.status, 'cancelled');
    assert.equal((await operation).status, 'cancelled');
    assert.equal(harness.spawnCalls.filter((call) => call.role === 'attach_task').length, 1);
    assert.equal(harness.spawnCalls.filter((call) => call.role === 'cold_task').length, 1);
    await harness.supervisor.close();
  }
}

async function runOwnedHealth(supervisorModule) {
  {
    const harness = makeHarness(supervisorModule);
    const direct = await harness.supervisor.handleExtRequest(
      startRequest('opencode', 'secret-negative direct task', 'ext-health-direct'),
      harness.emit,
    );
    assert.equal(direct.status, 'succeeded');
    const cold = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'owned health cold task', 'ext-health-cold'),
      harness.emit,
    );
    assert.equal(cold.status, 'succeeded');

    assert.deepEqual(harness.randomCalls, [32], 'one server mints exactly 32 CSPRNG bytes');
    const serverCall = harness.spawnCalls.find((call) => call.role === 'owned_server');
    const coldCall = harness.spawnCalls.find((call) => call.role === 'cold_task');
    const directCall = harness.spawnCalls.find((call) => call.role === 'direct_task');
    assert.equal(serverCall.passwordAtSpawn, harness.secretPassword);
    assert.equal(coldCall.passwordAtSpawn, undefined, 'cold task receives no server password');
    assert.equal(directCall.passwordAtSpawn, undefined, 'direct task receives no server password');
    assert.equal(
      Object.hasOwn(serverCall.options.env, 'OPENCODE_SERVER_PASSWORD'),
      false,
      'server spawn environment is scrubbed immediately after spawn returns',
    );
    assert.equal(
      Object.hasOwn(coldCall.options.env, 'OPENCODE_SERVER_PASSWORD'),
      false,
      'inherited password is scrubbed from cold task environment',
    );

    assert.equal(harness.httpCalls.length, 1);
    const expectedAuthorization = `Basic ${Buffer.from(
      `opencode:${harness.secretPassword}`,
      'utf8',
    ).toString('base64')}`;
    assert.equal(harness.httpCalls[0].authorizationAtCall, expectedAuthorization);
    assert.equal(harness.httpCalls[0].options.hostname, '127.0.0.1');
    assert.equal(harness.httpCalls[0].options.port, 43123);
    assert.equal(harness.httpCalls[0].options.path, '/global/health');
    assert.equal(harness.httpCalls[0].options.method, 'GET');
    assert.equal(
      Object.hasOwn(harness.httpCalls[0].options.headers, 'Authorization'),
      false,
      'transient Basic header is scrubbed after the direct HTTP call',
    );

    const attached = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'owned health attach task', 'ext-health-attach'),
      harness.emit,
    );
    assert.equal(attached.status, 'succeeded');
    const attachCall = harness.spawnCalls.find((call) => call.role === 'attach_task');
    assert.equal(attachCall.passwordAtSpawn, harness.secretPassword);
    assert.equal(
      Object.hasOwn(attachCall.options.env, 'OPENCODE_SERVER_PASSWORD'),
      false,
      'attach spawn environment is scrubbed immediately after spawn returns',
    );
    assert.equal(harness.randomCalls.length, 1, 'attach reuses the opaque stored secret bytes');

    const retained = JSON.stringify({
      cold,
      attached,
      emitted: harness.emitted,
      journal: [...harness.journal.values()],
      supervisor: harness.supervisor,
    });
    for (const forbidden of [
      harness.secretPassword,
      expectedAuthorization,
      'inherited-password-must-not-cross',
    ]) {
      assert.equal(retained.includes(forbidden), false, 'raw credentials are not serialized');
    }
    await harness.supervisor.close();
  }

  const invalidHealth = [
    ['unauthorized', {
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify({ healthy: true, version: 'fixture-profile-1' })),
    }],
    ['wrong-version', {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify({ healthy: true, version: 'fixture-profile-other' })),
    }],
    ['unhealthy', {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify({ healthy: false, version: 'fixture-profile-1' })),
    }],
    ['unknown-field', {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify({
        healthy: true,
        version: 'fixture-profile-1',
        extra: true,
      })),
    }],
    ['oversize', {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.alloc(64 * 1024, 0x20),
    }],
    ['request-error', new Error('fixture health transport failure')],
  ];
  for (const [label, response] of invalidHealth) {
    const harness = makeHarness(supervisorModule);
    harness.controls.healthResponse = response;
    const first = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', `${label} health cold one`, `ext-health-invalid-${label}-1`),
      harness.emit,
    );
    const second = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', `${label} health cold two`, `ext-health-invalid-${label}-2`),
      harness.emit,
    );
    assert.equal(first.status, 'succeeded', `${label} does not block the selected cold task`);
    assert.equal(second.status, 'succeeded', `${label} remains a cold-only optimization failure`);
    assert.equal(
      harness.spawnCalls.filter((call) => call.role === 'attach_task').length,
      0,
      `${label} cannot create an attachable lease`,
    );
    assert.equal(
      harness.spawnCalls.filter((call) => call.role === 'cold_task').length,
      2,
      `${label} deterministically keeps both tasks cold`,
    );
    await harness.supervisor.close();
  }

  const invalidReadiness = [
    ['non-loopback', ['opencode server listening on http://0.0.0.0:43123\n'], false],
    ['duplicate', [
      'opencode server listening on http://127.0.0.1:43123\n'
        + 'opencode server listening on http://127.0.0.1:43124\n',
    ], false],
    ['oversize', [`${'x'.repeat(4097)}\n`], false],
    ['missing', [], true],
  ];
  for (const [label, chunks, closeBeforeReady] of invalidReadiness) {
    const harness = makeHarness(supervisorModule);
    harness.controls.readinessChunks = chunks;
    harness.controls.closeServerBeforeReadiness = closeBeforeReady;
    await harness.supervisor.handleExtRequest(
      startRequest('claude-code', `${label} readiness cold one`, `ext-ready-invalid-${label}-1`),
      harness.emit,
    );
    await harness.supervisor.handleExtRequest(
      startRequest('claude-code', `${label} readiness cold two`, `ext-ready-invalid-${label}-2`),
      harness.emit,
    );
    assert.equal(
      harness.spawnCalls.filter((call) => call.role === 'attach_task').length,
      0,
      `${label} readiness never creates a lease`,
    );
    assert.equal(harness.httpCalls.length, 0, `${label} readiness sends no HTTP request`);
    await harness.supervisor.close();
  }
}

async function runLeaseLifecycle(supervisorModule) {
  {
    const harness = makeHarness(supervisorModule);
    const healthGate = deferred();
    harness.controls.healthGate = healthGate;
    const first = harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'concurrent cold task one', 'ext-concurrent-cold-1'),
      harness.emit,
    );
    await waitFor(() => harness.httpCalls.length === 1, 'held owned-server health');
    const second = harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'concurrent cold task two', 'ext-concurrent-cold-2'),
      harness.emit,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      harness.spawnCalls.filter((call) => call.role === 'owned_server').length,
      1,
      'concurrent warming coalesces to one server process',
    );
    healthGate.resolve();
    const terminals = await bounded(Promise.all([first, second]), 'concurrent cold terminals');
    assert(terminals.every((terminal) => terminal.status === 'succeeded'));
    assert.equal(harness.spawnCalls.filter((call) => call.role === 'cold_task').length, 2);
    assert.equal(harness.spawnCalls.filter((call) => call.role === 'attach_task').length, 0);
    await harness.supervisor.close();
  }

  {
    const harness = makeHarness(supervisorModule);
    const seed = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'lease lifecycle seed', 'ext-lease-seed'),
      harness.emit,
    );
    assert.equal(seed.status, 'succeeded');
    harness.controls.holdTaskRoles.add('attach_task');
    const firstAttach = harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'held attach one', 'ext-held-attach-1'),
      harness.emit,
    );
    const secondAttach = harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'held attach two', 'ext-held-attach-2'),
      harness.emit,
    );
    await waitFor(
      () => (
        harness.spawnCalls.filter((call) => call.role === 'attach_task').length === 2
        && (harness.controls.pendingTaskCompletions.get('attach_task')?.length ?? 0) === 2
      ),
      'two held attach children',
    );
    const attachedChildren = harness.spawnCalls.filter((call) => call.role === 'attach_task');
    assert.equal(new Set(attachedChildren.map((call) => call.child.pid)).size, 2);
    await harness.advanceClock(300000);
    assert.equal(
      harness.terminationCalls.filter((call) => call.entry.role === 'provider_server').length,
      0,
      'idle teardown cannot run while leases are active',
    );

    harness.releaseTasks('attach_task');
    const attachedTerminals = await bounded(
      Promise.all([firstAttach, secondAttach]),
      'held attach terminals',
    );
    assert(attachedTerminals.every((terminal) => terminal.status === 'succeeded'));
    const resultSessions = harness.emitted
      .filter((event) => event.payload?.event?.type === 'result')
      .map((event) => event.payload.event.sessionId);
    assert.equal(new Set(resultSessions.slice(-2)).size, 2, 'every attach has a fresh session');
    await waitFor(
      () => harness.scheduledTimers.some((timer) => (
        timer.milliseconds === 300000 && !timer.cleared && !timer.fired
      )),
      'zero-count idle teardown timer',
    );
    const staleIdleTimer = harness.scheduledTimers.find((timer) => (
      timer.milliseconds === 300000 && !timer.cleared && !timer.fired
    ));

    const renewedAttach = harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'renewed attach cancels idle', 'ext-renewed-attach'),
      harness.emit,
    );
    await waitFor(
      () => (
        harness.spawnCalls.filter((call) => call.role === 'attach_task').length === 3
        && (harness.controls.pendingTaskCompletions.get('attach_task')?.length ?? 0) === 1
      ),
      'renewed attach child',
    );
    assert.equal(staleIdleTimer.cleared, true, 'new lease cancels the prior idle timer');
    staleIdleTimer.callback();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      harness.terminationCalls.filter((call) => call.entry.role === 'provider_server').length,
      0,
      'a stale timer token cannot stop a renewed lease',
    );
    harness.releaseTasks('attach_task');
    assert.equal((await bounded(renewedAttach, 'renewed attach terminal')).status, 'succeeded');
    const liveIdleTimer = harness.scheduledTimers
      .filter((timer) => timer.milliseconds === 300000 && !timer.cleared && !timer.fired)
      .at(-1);
    assert(liveIdleTimer, 'lease release re-arms bounded idle teardown');
    await harness.advanceClock(299999);
    assert.equal(
      harness.terminationCalls.filter((call) => call.entry.role === 'provider_server').length,
      0,
    );
    await harness.advanceClock(1);
    await waitFor(
      () => harness.terminationCalls.some((call) => call.entry.role === 'provider_server'),
      'idle server teardown',
    );
    assert.equal(
      harness.terminationCalls.filter((call) => call.entry.role === 'provider_server').length,
      1,
      'idle teardown settles the owned tree exactly once',
    );

    harness.controls.holdTaskRoles.delete('attach_task');
    const afterIdle = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'cold after idle teardown', 'ext-after-idle'),
      harness.emit,
    );
    assert.equal(afterIdle.status, 'succeeded');
    assert.equal(harness.spawnCalls.filter((call) => call.role === 'cold_task').length, 2);
    assert.equal(harness.spawnCalls.filter((call) => call.role === 'owned_server').length, 2);
    await harness.supervisor.close();
  }

  {
    const harness = makeHarness(supervisorModule);
    await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'health loss seed', 'ext-health-loss-seed'),
      harness.emit,
    );
    harness.controls.healthResponse = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify({ healthy: false, version: 'fixture-profile-1' })),
    };
    const fallback = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'health loss cold fallback', 'ext-health-loss-fallback'),
      harness.emit,
    );
    assert.equal(fallback.status, 'succeeded');
    assert.equal(harness.spawnCalls.filter((call) => call.role === 'attach_task').length, 0);
    assert.equal(harness.spawnCalls.filter((call) => call.role === 'cold_task').length, 2);
    const serverStops = harness.terminationCalls
      .filter((call) => call.entry.role === 'provider_server')
      .map((call) => call.entry.delegationId);
    assert.equal(
      serverStops.filter((id) => id === serverStops[0]).length,
      1,
      'health loss settles the previously verified server tree once',
    );
    await harness.supervisor.close();
  }

  {
    const harness = makeHarness(supervisorModule);
    await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'overlapping close seed', 'ext-close-seed'),
      harness.emit,
    );
    harness.controls.holdTaskRoles.add('attach_task');
    const firstAttach = harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'close held attach one', 'ext-close-attach-1'),
      harness.emit,
    );
    const secondAttach = harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'close held attach two', 'ext-close-attach-2'),
      harness.emit,
    );
    await waitFor(
      () => harness.spawnCalls.filter((call) => call.role === 'attach_task').length === 2,
      'close-held attach children',
    );
    const firstClose = harness.supervisor.close();
    const secondClose = harness.supervisor.close();
    assert.strictEqual(firstClose, secondClose, 'overlapping close shares one operation');
    const [closed, firstTerminal, secondTerminal] = await bounded(Promise.all([
      firstClose,
      firstAttach,
      secondAttach,
    ]), 'overlapping close settlement');
    assert.deepEqual(closed, { cancelled: 2, failed: 0, alreadySettled: 0 });
    assert.equal(firstTerminal.status, 'cancelled');
    assert.equal(secondTerminal.status, 'cancelled');
    const stopRoles = harness.terminationCalls.map((call) => call.entry.role);
    assert.deepEqual(stopRoles.slice(-3), ['delegation', 'delegation', 'provider_server']);
    assert.equal(stopRoles.filter((role) => role === 'provider_server').length, 1);
  }
}

async function main() {
  const sectionIndex = process.argv.indexOf('--section');
  const section = sectionIndex >= 0 ? process.argv[sectionIndex + 1] : null;
  const supervisorModule = await import(pathToFileURL(supervisorBuildPath).href);
  if (!section || section === 'selection-replay') {
    await runSelectionReplay(supervisorModule);
  }
  if (!section || section === 'owned-health') {
    await runOwnedHealth(supervisorModule);
  }
  if (!section || section === 'lease-lifecycle') {
    await runLeaseLifecycle(supervisorModule);
  }
  if (section && !['selection-replay', 'owned-health', 'lease-lifecycle'].includes(section)) {
    throw new Error(`Unknown topology test section: ${section}`);
  }
  console.log('mcp-opencode-server-topology.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-opencode-server-topology.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
