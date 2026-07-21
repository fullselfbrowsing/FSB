'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
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

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function documentDigest(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function cleanPolicyDocuments() {
  const permission = [
    { permission: '*', action: 'deny', pattern: '*' },
    { permission: 'external_directory', pattern: '*', action: 'deny' },
    { permission: 'external_directory', pattern: '/fixture/data/tool-output/*', action: 'deny' },
    { permission: 'fsb_*', action: 'allow', pattern: '*' },
  ];
  return {
    config: {
      share: 'disabled',
      autoupdate: false,
      default_agent: 'fsb',
      plugin: [],
      command: {},
      instructions: [],
      agent: { fsb: { mode: 'primary' } },
      mcp: { fsb: { type: 'remote', url: 'http://127.0.0.1:7226/mcp', enabled: true, oauth: false } },
    },
    agent: {
      name: 'fsb',
      mode: 'primary',
      description: 'fixture FSB policy',
      prompt: 'fixture shipped prompt digest source',
      steps: 40,
      permission,
      tools: ['fsb_search_capabilities', 'fsb_invoke_capability'],
      resolvedModel: 'fixture-provider/fixture-model',
    },
  };
}

function policyAssertions(document, kind) {
  const assertions = [
    { kind: 'exact_keys', path: [], keys: Object.keys(document) },
    { kind: 'document_sha256', path: [], sha256: documentDigest(document) },
    { kind: 'absent', path: ['model'] },
  ];
  if (kind === 'agent') {
    assertions.push(
      { kind: 'all_strings_prefix', path: ['tools'], prefixRef: 'fsb_mcp_tool_prefix' },
      { kind: 'nonempty_string', path: ['resolvedModel'] },
    );
  }
  return assertions;
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
  let stdinEndCount = 0;
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
    stdout.end();
    stderr.end();
    const exitGate = controls.taskExitGates.get(role);
    if (exitGate) {
      void exitGate.promise.then(() => close(exit));
    } else {
      close(exit);
    }
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
      stdinEndCount += 1;
      callback();
      if (role === 'owned_server' || role === 'policy_preflight') return;
      const finish = () => {
        if (controls.zeroEventRoles.has(role)) {
          close({ code: 1, signal: null });
          return;
        }
        for (const chunk of controls.taskStderrChunks.get(role) ?? []) stderr.write(chunk);
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
  Object.defineProperty(child, 'stdinEndCount', {
    enumerable: true,
    get() { return stdinEndCount; },
  });
  queueMicrotask(() => {
    child.emit('spawn');
    if (role === 'owned_server') {
      for (const chunk of controls.readinessChunks) stdout.write(chunk);
      if (controls.closeServerBeforeReadiness) close({ code: 1, signal: null });
      return;
    }
    if (role === 'policy_preflight') {
      const output = controls.preflightOutputs.shift();
      if (!output || output.timeout) return;
      if (output.stderr) stderr.write(output.stderr);
      stdout.write(output.body);
      close(output.exit ?? { code: 0, signal: null });
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
    stdin: role === 'owned_server' || role === 'policy_preflight' ? 'none' : 'task',
    stdout: role === 'owned_server'
      ? 'bounded_readiness'
      : role === 'policy_preflight'
        ? 'bounded_json'
        : 'agent_jsonl',
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
  if (role === 'policy_preflight') {
    return { ...common, argv: ['debug', 'policy-fixture'] };
  }
  return { ...common, argv: [role] };
}

function makePolicyAttestations(adapterId, context, controls) {
  const clean = cleanPolicyDocuments();
  const expected = controls.expectedPolicyDocuments;
  const processDocuments = controls.processPolicyDocuments;
  controls.preflightOutputs.push(...processDocuments.map((document, index) => ({
    body: controls.rawPreflightBodies[index] ?? JSON.stringify(document),
    timeout: controls.timeoutPreflightIndex === index,
    exit: controls.preflightExits[index],
    stderr: controls.preflightStderr[index],
  })));
  return [
    {
      source: 'process_json',
      process: processSpec('policy_preflight', adapterId, context),
      maxBytes: controls.attestationMaxBytes,
      timeoutMs: 5000,
      assertions: policyAssertions(expected.config, 'config'),
    },
    {
      source: 'process_json',
      process: {
        ...processSpec('policy_preflight', adapterId, context),
        argv: ['debug', 'agent', 'fsb'],
      },
      maxBytes: controls.attestationMaxBytes,
      timeoutMs: 5000,
      assertions: policyAssertions(expected.agent, 'agent'),
    },
    {
      source: 'owned_server_json',
      method: 'GET',
      path: '/config',
      secretRef: 'owned_server_basic_password',
      maxBytes: controls.attestationMaxBytes,
      timeoutMs: 5000,
      assertions: policyAssertions(clean.config, 'config'),
    },
    {
      source: 'owned_server_json',
      method: 'GET',
      path: '/agent',
      secretRef: 'owned_server_basic_password',
      maxBytes: controls.attestationMaxBytes,
      timeoutMs: 5000,
      assertions: policyAssertions(clean.agent, 'agent'),
    },
  ];
}

function makeAdapter(adapterId, topologyKind, controls) {
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
      const attestations = controls.policyEnabled
        ? makePolicyAttestations(adapterId, context, controls)
        : [];
      if (topologyKind === 'direct') {
        return {
          adapterId,
          profileVersion: 'fixture-profile-1',
          topology: {
            kind: 'direct',
            task: processSpec('direct_task', adapterId, context),
          },
          attestations,
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
        attestations,
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
  const cleanPolicy = cleanPolicyDocuments();
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
    taskStderrChunks: new Map(),
    taskExitGates: new Map(),
    taskTerminationGate: null,
    taskRemoveGate: null,
    taskRemoveStarted: 0,
    policyEnabled: options.policyEnabled === true,
    expectedPolicyDocuments: cleanPolicy,
    processPolicyDocuments: options.processPolicyDocuments
      ? options.processPolicyDocuments.map(jsonClone)
      : [jsonClone(cleanPolicy.config), jsonClone(cleanPolicy.agent)],
    serverPolicyDocuments: options.serverPolicyDocuments
      ? {
          '/config': jsonClone(options.serverPolicyDocuments['/config']),
          '/agent': jsonClone(options.serverPolicyDocuments['/agent']),
        }
      : {
          '/config': jsonClone(cleanPolicy.config),
          '/agent': jsonClone(cleanPolicy.agent),
        },
    rawPreflightBodies: options.rawPreflightBodies ?? [],
    timeoutPreflightIndex: options.timeoutPreflightIndex ?? null,
    preflightExits: options.preflightExits ?? [],
    preflightStderr: options.preflightStderr ?? [],
    preflightOutputs: [],
    attestationMaxBytes: options.attestationMaxBytes ?? 128 * 1024,
    serverPolicyResponseFactory: options.serverPolicyResponseFactory ?? null,
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
    ['claude-code', makeAdapter('claude-code', 'owned_server', controls)],
    ['opencode', makeAdapter('opencode', 'direct', controls)],
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
      if (role === 'delegation' && controls.taskRemoveGate) {
        controls.taskRemoveStarted += 1;
        await controls.taskRemoveGate.promise;
      }
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
      if (entry.role === 'delegation' && controls.taskTerminationGate) {
        await controls.taskTerminationGate.promise;
      }
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
      if (requestOptions.path === '/global/health') {
        if (controls.healthResponse instanceof Error) throw controls.healthResponse;
        return controls.healthResponse;
      }
      if (controls.serverPolicyResponseFactory) {
        return controls.serverPolicyResponseFactory(requestOptions);
      }
      const document = controls.serverPolicyDocuments[requestOptions.path];
      if (document === undefined) throw new Error('unexpected policy route');
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify(document)),
      };
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

async function runTaskOnce(supervisorModule) {
  const fallbackSentinels = [
    'agent "fsb" not found. Falling back to default agent',
    'agent "fsb" is a subagent, not a primary agent. Falling back to default agent',
  ];

  {
    const task = 'DIRECT_TASK_ONCE_CANARY';
    const harness = makeHarness(supervisorModule);
    const terminal = await harness.supervisor.handleExtRequest(
      startRequest('opencode', task, 'ext-task-once-direct'),
      harness.emit,
    );
    assert.equal(terminal.status, 'succeeded');
    const direct = harness.spawnCalls.filter((call) => call.role === 'direct_task');
    assert.equal(direct.length, 1);
    assert.equal(direct[0].child.stdinBytes.length, 1);
    assert.equal(Buffer.concat(direct[0].child.stdinBytes).toString('utf8'), task);
    assert.equal(direct[0].child.stdinEndCount, 1);
    await harness.supervisor.close();
  }

  {
    const harness = makeHarness(supervisorModule);
    const coldTask = 'COLD_TASK_ONCE_CANARY';
    assert.equal((await harness.supervisor.handleExtRequest(
      startRequest('claude-code', coldTask, 'ext-task-once-cold'),
      harness.emit,
    )).status, 'succeeded');
    const server = harness.spawnCalls.find((call) => call.role === 'owned_server');
    const cold = harness.spawnCalls.find((call) => call.role === 'cold_task');
    assert.equal(server.child.stdinBytes.length, 0, 'server stdin receives no task bytes');
    assert.equal(cold.child.stdinBytes.length, 1);
    assert.equal(Buffer.concat(cold.child.stdinBytes).toString('utf8'), coldTask);
    assert.equal(cold.child.stdinEndCount, 1);
    assert.equal(cold.passwordAtSpawn, undefined);

    const attachTask = 'ATTACH_TASK_ONCE_CANARY';
    assert.equal((await harness.supervisor.handleExtRequest(
      startRequest('claude-code', attachTask, 'ext-task-once-attach'),
      harness.emit,
    )).status, 'succeeded');
    const attach = harness.spawnCalls.find((call) => call.role === 'attach_task');
    assert.equal(attach.child.stdinBytes.length, 1);
    assert.equal(Buffer.concat(attach.child.stdinBytes).toString('utf8'), attachTask);
    assert.equal(attach.child.stdinEndCount, 1);
    assert.equal(attach.passwordAtSpawn, harness.secretPassword);
    assert.equal(Object.hasOwn(attach.options.env, 'OPENCODE_SERVER_PASSWORD'), false);
    assert.equal(harness.spawnCalls.filter((call) => call.role === 'cold_task').length, 1);
    for (const event of harness.emitted.filter((item) => item.event === 'delegation.started')) {
      assert.deepEqual(Object.keys(event.payload).sort(), [
        'adapterId',
        'delegationId',
        'profileVersion',
      ]);
      for (const forbidden of ['endpoint', 'port', 'secretRef', 'password', 'topology', 'task']) {
        assert.equal(Object.hasOwn(event.payload, forbidden), false);
      }
    }
    await harness.supervisor.close();
  }

  for (const fixture of [
    { role: 'direct_task', adapterId: 'opencode', sentinel: fallbackSentinels[0] },
    { role: 'cold_task', adapterId: 'claude-code', sentinel: fallbackSentinels[0] },
    { role: 'attach_task', adapterId: 'claude-code', sentinel: fallbackSentinels[1] },
  ]) {
    const harness = makeHarness(supervisorModule);
    if (fixture.role === 'attach_task') {
      assert.equal((await harness.supervisor.handleExtRequest(
        startRequest('claude-code', 'attach sentinel seed', 'ext-sentinel-seed'),
        harness.emit,
      )).status, 'succeeded');
    }
    const split = Math.floor(fixture.sentinel.length / 2);
    harness.controls.taskStderrChunks.set(fixture.role, [
      `ignored stderr before ${fixture.sentinel.slice(0, split)}`,
      `${fixture.sentinel.slice(split)} ignored stderr after`,
    ]);
    const before = harness.spawnCalls.length;
    const task = `STDERR_TASK_CANARY_${fixture.role}`;
    const terminal = await harness.supervisor.handleExtRequest(
      startRequest(fixture.adapterId, task, `ext-sentinel-${fixture.role}`),
      harness.emit,
    );
    assert.equal(terminal.status, 'failed', `${fixture.role} fallback warning fails closed`);
    const expectedRoles = fixture.role === 'cold_task'
      ? ['owned_server', 'cold_task']
      : [fixture.role];
    assert.deepEqual(
      harness.spawnCalls.slice(before).map((call) => call.role),
      expectedRoles,
      `${fixture.role} sentinel creates no fallback task child`,
    );
    const taskCall = harness.spawnCalls.at(-1);
    assert.equal(taskCall.child.stdinBytes.length, 1);
    assert.equal(taskCall.child.stdinEndCount, 1);
    const serialized = JSON.stringify({ terminal, emitted: harness.emitted });
    assert.equal(serialized.includes(fixture.sentinel), false);
    assert.equal(serialized.includes(task), false);
    await harness.supervisor.close();
  }

  {
    const harness = makeHarness(supervisorModule);
    await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'zero event seed', 'ext-zero-event-seed'),
      harness.emit,
    );
    harness.controls.zeroEventRoles.add('attach_task');
    const before = harness.spawnCalls.length;
    const terminal = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'zero event task once', 'ext-zero-event-once'),
      harness.emit,
    );
    assert.equal(terminal.status, 'failed');
    assert.deepEqual(harness.spawnCalls.slice(before).map((call) => call.role), ['attach_task']);
    assert.equal(harness.spawnCalls.at(-1).child.stdinBytes.length, 1);
    assert.equal(harness.spawnCalls.at(-1).child.stdinEndCount, 1);
    assert.equal(harness.spawnCalls.filter((call) => call.role === 'cold_task').length, 1);
    await harness.supervisor.close();
  }
}

function resultEventsForRequest(harness, requestId) {
  return harness.emitted.filter((event) => (
    event.id === requestId && event.payload?.event?.type === 'result'
  ));
}

async function runTerminalBarrier(supervisorModule) {
  for (const fixture of [
    { label: 'direct', adapterId: 'opencode', role: 'direct_task' },
    { label: 'cold', adapterId: 'claude-code', role: 'cold_task' },
    { label: 'attach', adapterId: 'claude-code', role: 'attach_task', seed: true },
  ]) {
    const harness = makeHarness(supervisorModule);
    if (fixture.seed) {
      const seed = await harness.supervisor.handleExtRequest(
        startRequest('claude-code', 'terminal barrier attach seed', 'ext-terminal-seed'),
        harness.emit,
      );
      assert.equal(seed.status, 'succeeded');
    }

    const exitGate = deferred();
    const terminationGate = deferred();
    const removeGate = deferred();
    harness.controls.taskExitGates.set(fixture.role, exitGate);
    harness.controls.taskTerminationGate = terminationGate;
    harness.controls.taskRemoveGate = removeGate;
    const requestId = `ext-terminal-${fixture.label}`;
    let settlements = 0;
    const operation = harness.supervisor.handleExtRequest(
      startRequest(fixture.adapterId, `${fixture.label} terminal barrier`, requestId),
      harness.emit,
    ).then((terminal) => {
      settlements += 1;
      return terminal;
    });
    await waitFor(
      () => harness.spawnCalls.filter((call) => call.role === fixture.role)
        .at(-1)?.child.stdout.readableEnded === true,
      `${fixture.label} parser EOF`,
    );
    assert.equal(
      resultEventsForRequest(harness, requestId).length,
      0,
      `${fixture.label} parser EOF retains its result candidate`,
    );
    assert.equal(settlements, 0, `${fixture.label} parser EOF cannot settle`);

    exitGate.resolve();
    await waitFor(
      () => harness.lifecycleEvents.some((event) => event.startsWith('stop:delegation:')),
      `${fixture.label} clean exit`,
    );
    assert.equal(
      resultEventsForRequest(harness, requestId).length,
      0,
      `${fixture.label} clean exit retains its result candidate`,
    );

    terminationGate.resolve();
    await waitFor(
      () => harness.controls.taskRemoveStarted === 1,
      `${fixture.label} tree settlement`,
    );
    assert.equal(
      resultEventsForRequest(harness, requestId).length,
      0,
      `${fixture.label} tree settlement retains its result candidate`,
    );
    assert.equal(settlements, 0, `${fixture.label} waits for runtime removal`);

    removeGate.resolve();
    const terminal = await bounded(operation, `${fixture.label} terminal barrier`);
    assert.equal(terminal.status, 'succeeded');
    assert.equal(settlements, 1, `${fixture.label} settles once`);
    assert.equal(
      resultEventsForRequest(harness, requestId).length,
      1,
      `${fixture.label} publishes exactly one result after all gates`,
    );
    harness.controls.taskExitGates.delete(fixture.role);
    harness.controls.taskTerminationGate = null;
    harness.controls.taskRemoveGate = null;
    await harness.supervisor.close();
  }
}

async function runPolicyAttestation(supervisorModule) {
  {
    const task = 'POLICY_TASK_CANARY_must_only_reach_selected_stdin';
    const harness = makeHarness(supervisorModule, { policyEnabled: true });
    const terminal = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', task, 'ext-policy-clean'),
      harness.emit,
    );
    assert.equal(terminal.status, 'succeeded');
    assert.deepEqual(
      harness.spawnCalls.map((call) => call.role),
      ['policy_preflight', 'policy_preflight', 'owned_server', 'cold_task'],
      'both bounded process descriptors pass before one server and one selected task child',
    );
    const preflights = harness.spawnCalls.filter((call) => call.role === 'policy_preflight');
    assert.equal(preflights.length, 2);
    for (const call of preflights) {
      assert.equal(call.options.shell, false);
      assert.equal(call.options.env.FSB_TEST_PROCESS_ROLE, 'policy_preflight');
      assert.equal(call.passwordAtSpawn, undefined);
      assert.equal(Buffer.concat(call.child.stdinBytes).length, 0);
      assert.equal(JSON.stringify([call.argv, call.options.env]).includes(task), false);
    }
    const taskCalls = harness.spawnCalls.filter((call) => (
      call.role === 'cold_task' || call.role === 'attach_task' || call.role === 'direct_task'
    ));
    assert.equal(taskCalls.length, 1);
    assert.equal(Buffer.concat(taskCalls[0].child.stdinBytes).toString('utf8'), task);
    assert.deepEqual(
      harness.httpCalls.map((call) => call.options.path),
      ['/global/health', '/config', '/agent'],
      'owned-server policy descriptors run only after authenticated health',
    );
    for (const call of harness.httpCalls) {
      assert.equal(call.options.method, 'GET');
      assert.equal(call.options.hostname, '127.0.0.1');
      assert.equal(Object.hasOwn(call.options.headers, 'Authorization'), false);
    }
    const started = harness.emitted.filter((event) => event.event === 'delegation.started');
    assert.equal(started.length, 1);
    assert.deepEqual(Object.keys(started[0].payload).sort(), [
      'adapterId',
      'delegationId',
      'profileVersion',
    ]);
    await harness.supervisor.close();
  }

  const contaminationCases = [
    ['plugin', (config) => { config.plugin = ['poison-plugin']; }],
    ['mcp', (config) => { config.mcp.external = { enabled: true }; }],
    ['command', (config) => { config.command.poison = { template: 'secret' }; }],
    ['instruction', (config) => { config.instructions = ['POISON_INSTRUCTION']; }],
    ['skill', (config) => { config.skills = ['POISON_SKILL']; }],
    ['agent', (config) => { config.agent.poison = { mode: 'primary' }; }],
    ['tool', (_config, agent) => { agent.tools.push('bash'); }],
    ['permission-order', (_config, agent) => { agent.permission.reverse(); }],
    ['model-override', (_config, agent) => { agent.model = 'poison/model'; }],
    ['wrong-prompt', (_config, agent) => { agent.prompt = 'wrong prompt'; }],
    ['subagent', (_config, agent) => { agent.mode = 'subagent'; }],
    ['no-model', (_config, agent) => { agent.resolvedModel = ''; }],
  ];
  for (const [label, poison] of contaminationCases) {
    const documents = cleanPolicyDocuments();
    poison(documents.config, documents.agent);
    const harness = makeHarness(supervisorModule, {
      policyEnabled: true,
      processPolicyDocuments: [documents.config, documents.agent],
    });
    const terminal = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', `policy poison ${label}`, `ext-policy-poison-${label}`),
      harness.emit,
    );
    assert.equal(terminal.status, 'failed', `${label} fails closed`);
    assert.equal(
      harness.spawnCalls.some((call) => ['owned_server', 'cold_task', 'attach_task'].includes(call.role)),
      false,
      `${label} grants neither server nor task authority`,
    );
    assert.equal(harness.emitted.length, 0, `${label} emits no delegation.started`);
    assert.equal(
      harness.spawnCalls.some((call) => Buffer.concat(call.child.stdinBytes).length > 0),
      false,
      `${label} writes no task bytes`,
    );
    await harness.supervisor.close();
  }

  for (const [label, options] of [
    ['malformed-json', { rawPreflightBodies: ['{"share":'] }],
    ['prototype-poison', { rawPreflightBodies: ['{"__proto__":{"polluted":true}}'] }],
    ['oversize', {
      attestationMaxBytes: 256,
      rawPreflightBodies: ['x'.repeat(257)],
    }],
    ['nonzero', { preflightExits: [{ code: 1, signal: null }] }],
  ]) {
    const harness = makeHarness(supervisorModule, { policyEnabled: true, ...options });
    const terminal = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', `bounded policy ${label}`, `ext-policy-${label}`),
      harness.emit,
    );
    assert.equal(terminal.status, 'failed', `${label} is rejected`);
    assert.equal(harness.spawnCalls.some((call) => call.role === 'cold_task'), false);
    assert.equal(harness.emitted.length, 0);
    await harness.supervisor.close();
  }

  {
    const harness = makeHarness(supervisorModule, {
      policyEnabled: true,
      timeoutPreflightIndex: 0,
    });
    const operation = harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'bounded policy timeout', 'ext-policy-timeout'),
      harness.emit,
    );
    await waitFor(
      () => harness.spawnCalls.some((call) => call.role === 'policy_preflight'),
      'policy timeout probe spawn',
    );
    await harness.advanceClock(5000);
    const terminal = await bounded(operation, 'policy timeout terminal');
    assert.equal(terminal.status, 'failed');
    assert.equal(harness.spawnCalls.some((call) => call.role === 'cold_task'), false);
    assert.equal(harness.emitted.length, 0);
    await harness.supervisor.close();
  }

  {
    const serverDocuments = cleanPolicyDocuments();
    const canaries = [
      'RAW_POLICY_BODY_CANARY',
      'PASSWORD_POLICY_CANARY',
      'AUTHORIZATION_POLICY_CANARY',
    ];
    serverDocuments.agent.raw = canaries.join(':');
    const harness = makeHarness(supervisorModule, {
      policyEnabled: true,
      serverPolicyDocuments: {
        '/config': serverDocuments.config,
        '/agent': serverDocuments.agent,
      },
    });
    const terminal = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'server policy poison', 'ext-policy-server-poison'),
      harness.emit,
    );
    assert.equal(terminal.status, 'failed');
    assert.deepEqual(
      harness.spawnCalls.map((call) => call.role),
      ['policy_preflight', 'policy_preflight', 'owned_server'],
      'server attestation failure retires the server before any task child',
    );
    assert.equal(harness.emitted.length, 0);
    assert.equal(
      harness.terminationCalls.filter((call) => call.entry.role === 'provider_server').length,
      1,
    );
    const retained = JSON.stringify({ terminal, emitted: harness.emitted, journal: [...harness.journal.values()] });
    for (const canary of canaries) assert.equal(retained.includes(canary), false);
    await harness.supervisor.close();
  }

  {
    let getterCalls = 0;
    const harness = makeHarness(supervisorModule, {
      policyEnabled: true,
      serverPolicyResponseFactory() {
        const response = {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
        };
        Object.defineProperty(response, 'body', {
          enumerable: true,
          get() {
            getterCalls += 1;
            return Buffer.from('{}');
          },
        });
        return response;
      },
    });
    const terminal = await harness.supervisor.handleExtRequest(
      startRequest('claude-code', 'accessor policy poison', 'ext-policy-accessor'),
      harness.emit,
    );
    assert.equal(terminal.status, 'failed');
    assert.equal(getterCalls, 0, 'response accessors are rejected without invocation');
    assert.equal(harness.spawnCalls.some((call) => call.role === 'cold_task'), false);
    assert.equal(harness.emitted.length, 0);
    await harness.supervisor.close();
  }
}

function productionAgentDocument(config, opencodeDataRoot) {
  const shipped = config.agent.fsb;
  const truncationGlob = path.join(opencodeDataRoot, 'tool-output', '*');
  return {
    name: 'fsb',
    mode: 'primary',
    description: shipped.description,
    prompt: shipped.prompt,
    steps: 40,
    permission: [
      { permission: '*', action: 'allow', pattern: '*' },
      { permission: 'doom_loop', action: 'ask', pattern: '*' },
      { permission: 'external_directory', pattern: '*', action: 'ask' },
      { permission: 'external_directory', pattern: truncationGlob, action: 'allow' },
      { permission: 'question', action: 'deny', pattern: '*' },
      { permission: 'plan_enter', action: 'deny', pattern: '*' },
      { permission: 'plan_exit', action: 'deny', pattern: '*' },
      { permission: 'read', pattern: '*', action: 'allow' },
      { permission: 'read', pattern: '*.env', action: 'ask' },
      { permission: 'read', pattern: '*.env.*', action: 'ask' },
      { permission: 'read', pattern: '*.env.example', action: 'allow' },
      { permission: '*', action: 'deny', pattern: '*' },
      { permission: 'external_directory', pattern: '*', action: 'deny' },
      { permission: 'external_directory', pattern: truncationGlob, action: 'deny' },
      { permission: 'fsb_*', action: 'allow', pattern: '*' },
    ],
    tools: ['fsb_search_capabilities', 'fsb_invoke_capability'],
    resolvedModel: 'fixture-provider/fixture-model',
  };
}

function productionProcessRole(argv) {
  if (argv.includes('debug')) return 'policy_preflight';
  if (argv.includes('serve')) return 'owned_server';
  if (argv.includes('--attach')) return 'attach_task';
  return 'cold_task';
}

function makeProductionChild(role, pid, onFinal) {
  const child = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let closed = false;
  const close = (exit = { code: 0, signal: null }) => {
    if (closed) return;
    closed = true;
    if (!stdout.readableEnded) stdout.end();
    if (!stderr.readableEnded) stderr.end();
    setImmediate(() => child.emit('close', exit.code, exit.signal));
  };
  const stdin = new Writable({
    write(_chunk, _encoding, callback) { setImmediate(callback); },
    final(callback) {
      callback();
      if (onFinal) setImmediate(() => onFinal({ stdout, stderr, close }));
    },
  });
  Object.assign(child, { pid, stdin, stdout, stderr, close, get closed() { return closed; } });
  queueMicrotask(() => {
    child.emit('spawn');
    if (role === 'owned_server') {
      stdout.write('opencode server listening on http://127.0.0.1:43123\n');
    }
  });
  return child;
}

async function runProductionComposition(supervisorModule) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-opencode-production-'));
  const runtimeRoot = path.join(tempRoot, 'agent-runtime');
  const nativeDataHome = path.join(tempRoot, 'native-data');
  const opencodeDataRoot = path.join(nativeDataHome, 'opencode');
  const fixture = fs.readFileSync(path.join(
    repoRoot,
    'tests',
    'fixtures',
    'agent-streams',
    'opencode-1.14.25',
    'contract-stream.jsonl',
  ));
  const command = '/fixture/bin/opencode';
  const spawnCalls = [];
  const childrenBySignature = new Map();
  const serverDocuments = new Map();
  const emitted = [];
  let nextPid = 61000;

  const inspector = {
    async inspect(entry) {
      const child = childrenBySignature.get(entry.argvSignature);
      if (!child || child.closed) return { classification: 'stale' };
      return {
        classification: 'confirmed',
        process: {
          pid: child.pid,
          parentPid: 1,
          processGroupId: child.pid,
          processStartIdentity: `production-${child.pid}`,
          descendants: [],
        },
      };
    },
  };
  const terminator = {
    async stop(entry, supervisedChild) {
      const child = supervisedChild
        ? [...childrenBySignature.values()].find((candidate) => candidate.pid === supervisedChild.pid)
        : childrenBySignature.get(entry.argvSignature);
      if (child && !child.closed) child.close({ code: null, signal: 'SIGTERM' });
      if (supervisedChild) await supervisedChild.closed;
    },
  };

  const supervisor = supervisorModule.createProductionSpawnSupervisor({
    endpoint: 'http://127.0.0.1:7226/mcp',
    cwd: repoRoot,
    platform: 'linux',
    runtimeRootPath: runtimeRoot,
    environment: {
      PATH: '/fixture/bin',
      HOME: tempRoot,
      XDG_DATA_HOME: nativeDataHome,
      XDG_STATE_HOME: path.join(tempRoot, 'native-state'),
      SAFE_VALUE: 'retained',
    },
    processSeams: {
      openCodeDetect: async () => ({
        installed: true,
        version: '1.14.25',
        authState: 'unknown',
        profileVersion: '1.14.25',
        binary: { command, realPath: command, argvPrefix: [] },
      }),
      inspector,
      terminator,
      spawn(commandValue, argv, options) {
        assert.equal(commandValue, command);
        const role = productionProcessRole(argv);
        const configPath = path.join(options.env.XDG_CONFIG_HOME, 'opencode', 'opencode.json');
        assert.equal(fs.existsSync(configPath), true, `${role} config exists before spawn`);
        assert.equal(fs.existsSync(options.env.OPENCODE_TEST_HOME), true);
        assert.equal(fs.existsSync(options.env.OPENCODE_TEST_MANAGED_CONFIG_DIR), true);
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const agent = productionAgentDocument(config, opencodeDataRoot);
        const runtimeId = path.basename(path.dirname(options.env.XDG_CONFIG_HOME));
        const onFinal = role === 'policy_preflight'
          ? ({ stdout, close }) => {
              stdout.write(JSON.stringify(argv.at(-1) === 'config' ? config : agent));
              close();
            }
          : role === 'owned_server'
            ? null
            : ({ stdout, close }) => {
                stdout.write(fixture);
                close();
              };
        const child = makeProductionChild(role, ++nextPid, onFinal);
        childrenBySignature.set(options.env.FSB_AGENT_ARGV_SIGNATURE, child);
        spawnCalls.push({ role, runtimeId, argv: [...argv], child });
        if (role === 'owned_server') {
          serverDocuments.set('/config', config);
          serverDocuments.set('/agent', agent);
        }
        return child;
      },
    },
    networkSeams: {
      async requestOwnedServer(options) {
        if (options.path === '/global/health') {
          return {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: Buffer.from(JSON.stringify({ healthy: true, version: '1.14.25' })),
          };
        }
        const document = serverDocuments.get(options.path);
        assert(document, `owned server policy document ${options.path} exists`);
        return {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(JSON.stringify(document)),
        };
      },
    },
    terminationGrace: 25,
  });

  try {
    const recovery = await supervisor.recover();
    assert.equal(recovery.spawnAvailable, true);
    const first = await supervisor.handleExtRequest(
      startRequest('opencode', 'production composition cold task', 'ext-production-cold'),
      (event) => emitted.push(event),
    );
    assert.equal(first.status, 'succeeded');
    assert.deepEqual(
      spawnCalls.map((call) => call.role),
      ['policy_preflight', 'policy_preflight', 'owned_server', 'cold_task'],
    );
    const coldStarted = emitted.find((event) => event.event === 'delegation.started');
    const coldCall = spawnCalls.find((call) => call.role === 'cold_task');
    const serverCall = spawnCalls.find((call) => call.role === 'owned_server');
    assert.equal(coldCall.runtimeId, coldStarted.payload.delegationId);
    const warmJournal = JSON.parse(fs.readFileSync(
      path.join(runtimeRoot, 'agent-orphans.json'),
      'utf8',
    ));
    assert.deepEqual(warmJournal.entries.map((entry) => entry.role), ['provider_server']);
    assert.equal(warmJournal.entries[0].delegationId, serverCall.runtimeId);

    const second = await supervisor.handleExtRequest(
      startRequest('opencode', 'production composition warm task', 'ext-production-attach'),
      (event) => emitted.push(event),
    );
    assert.equal(second.status, 'succeeded');
    assert.deepEqual(
      spawnCalls.map((call) => call.role),
      [
        'policy_preflight',
        'policy_preflight',
        'owned_server',
        'cold_task',
        'policy_preflight',
        'policy_preflight',
        'attach_task',
      ],
    );
    assert.equal(spawnCalls.filter((call) => call.role === 'owned_server').length, 1);
    assert.equal(spawnCalls.at(-1).argv.includes('http://127.0.0.1:43123'), true);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'agent-orphans.json'), 'utf8')).entries.length,
      1,
      'task and policy runtimes are removed while the warm server remains owned',
    );

    await supervisor.close();
    const closedJournal = JSON.parse(fs.readFileSync(
      path.join(runtimeRoot, 'agent-orphans.json'),
      'utf8',
    ));
    assert.deepEqual(closedJournal.entries, []);
    const remainingDirectories = fs.readdirSync(runtimeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory());
    assert.deepEqual(remainingDirectories, []);
  } finally {
    await supervisor.close().catch(() => undefined);
    fs.rmSync(tempRoot, { recursive: true, force: true });
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
  if (!section || section === 'policy-attestation') {
    await runPolicyAttestation(supervisorModule);
  }
  if (!section || section === 'task-once') {
    await runTaskOnce(supervisorModule);
  }
  if (!section || section === 'terminal-barrier') {
    await runTerminalBarrier(supervisorModule);
  }
  if (!section || section === 'production-composition') {
    await runProductionComposition(supervisorModule);
  }
  if (section && ![
    'selection-replay',
    'owned-health',
    'lease-lifecycle',
    'policy-attestation',
    'task-once',
    'terminal-barrier',
    'production-composition',
  ].includes(section)) {
    throw new Error(`Unknown topology test section: ${section}`);
  }
  console.log('mcp-opencode-server-topology.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-opencode-server-topology.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
