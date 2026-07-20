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

function normalizedEvent(type, payload = {}) {
  return { type, sessionId: 'session_topology_fixture', payload };
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
      setImmediate(() => {
        if (controls.zeroEventRoles.has(role)) {
          close({ code: 1, signal: null });
          return;
        }
        send([
          normalizedEvent('init', { role }),
          normalizedEvent('result', { is_error: false, role }),
        ]);
      });
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
      stdout.write('opencode server listening on http://127.0.0.1:43123\n');
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

function makeHarness(supervisorModule) {
  const controls = {
    spawnFailureRoles: new Set(),
    stdinFailureRoles: new Set(),
    zeroEventRoles: new Set(),
    serverIdentityValid: true,
  };
  const spawnCalls = [];
  const emitted = [];
  const journal = new Map();
  const activePids = new Map();
  const children = new Map();
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
    },
  };

  const inspector = {
    async inspect(entry) {
      if (entry.role === 'provider_server' && !controls.serverIdentityValid) {
        return { classification: 'stale' };
      }
      const key = `${entry.role}:${entry.delegationId}`;
      const pid = activePids.get(key) ?? lastSpawn?.child.pid;
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
    async stop(_entry, supervisedChild) {
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
    environment: { PATH: '/fixture/bin', SAFE_VALUE: 'safe' },
    spawn(command, argv, options) {
      const role = options.env.FSB_TEST_PROCESS_ROLE;
      assert.equal(typeof role, 'string');
      const call = { command, argv: [...argv], options, role, child: null };
      spawnCalls.push(call);
      if (controls.spawnFailureRoles.has(role)) {
        throw new Error(`fixture ${role} spawn failure`);
      }
      const child = makeChild(role, ++nextPid, controls);
      call.child = child;
      lastSpawn = call;
      children.set(child.pid, child);
      return child;
    },
    wallNow: (() => { let now = 1000; return () => ++now; })(),
    monotonicNow: (() => { let now = 0; return () => ++now; })(),
    wait: async () => {},
    mintDelegationId: () => `delegation_topology_${String(++idCounter).padStart(4, '0')}`,
    mintFingerprint: () => `runtime_fingerprint_${String(idCounter).padStart(4, '0')}`,
    mintGeneration: () => 'generation_topology_0001',
    terminationGrace: 25,
    activationAttempts: 3,
  });

  return {
    supervisor,
    controls,
    spawnCalls,
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

async function main() {
  const sectionIndex = process.argv.indexOf('--section');
  const section = sectionIndex >= 0 ? process.argv[sectionIndex + 1] : null;
  const supervisorModule = await import(pathToFileURL(supervisorBuildPath).href);
  if (!section || section === 'selection-replay') {
    await runSelectionReplay(supervisorModule);
  }
  if (section && section !== 'selection-replay') {
    throw new Error(`Unknown topology test section: ${section}`);
  }
  console.log('mcp-opencode-server-topology.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-opencode-server-topology.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
