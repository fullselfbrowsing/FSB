'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough, Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const mcpBuildRoot = process.env.FSB_MCP_BUILD_ROOT
  ? path.resolve(process.env.FSB_MCP_BUILD_ROOT)
  : path.join(repoRoot, 'mcp', 'build');
const processProbeBuildPath = path.join(
  mcpBuildRoot,
  'agent-providers',
  'process-probe.js',
);
const processTreeBuildPath = path.join(
  mcpBuildRoot,
  'agent-providers',
  'process-tree.js',
);
const spawnEnvironmentBuildPath = path.join(
  mcpBuildRoot,
  'agent-providers',
  'spawn-environment.js',
);
const adapterBuildPath = path.join(mcpBuildRoot, 'agent-providers', 'adapter.js');
const effectiveAuthorityBuildPath = path.join(
  mcpBuildRoot,
  'agent-providers',
  'effective-authority.js',
);
const serveDelegationBuildPath = path.join(
  mcpBuildRoot,
  'agent-providers',
  'serve-delegation.js',
);
const codexBuildPath = path.join(mcpBuildRoot, 'agent-providers', 'codex.js');
const codexDetectBuildPath = path.join(mcpBuildRoot, 'agent-providers', 'codex-detect.js');
const codexProfileBuildPath = path.join(mcpBuildRoot, 'agent-providers', 'codex-profile.js');
const codexStreamBuildPath = path.join(mcpBuildRoot, 'agent-providers', 'codex-stream.js');
const codexFixtureDir = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'agent-streams',
  'codex-0.142.5',
);

const SELECTED_SECTION = (() => {
  const offset = process.argv.indexOf('--section');
  return offset < 0 ? null : process.argv[offset + 1] || '';
})();

function ownedBuffersAreZero(result) {
  return result.stdout.every((byte) => byte === 0)
    && result.stderr.every((byte) => byte === 0);
}

function waitForCondition(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('condition timeout'));
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  });
}

function processIsPresent(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && error.code === 'ESRCH') return false;
    throw error;
  }
}

function descendantProbeScript(pidPath, markerPath, channel) {
  const descendant = [
    "const fs = require('node:fs');",
    `setTimeout(() => fs.writeFileSync(${JSON.stringify(markerPath)}, 'escaped'), 750);`,
    'setInterval(() => {}, 1000);',
  ].join('');
  const output = channel === 'stdout'
    ? 'setImmediate(() => process.stdout.write(Buffer.alloc(4096, 0x53)));'
    : channel === 'stderr'
      ? 'setImmediate(() => process.stderr.write(Buffer.alloc(4096, 0x45)));'
      : '';
  return [
    "const fs = require('node:fs');",
    "const { spawn } = require('node:child_process');",
    `const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore' });`,
    `fs.writeFileSync(${JSON.stringify(pidPath)}, JSON.stringify({ root: process.pid, descendant: descendant.pid }));`,
    output,
    'setInterval(() => {}, 1000);',
  ].join('');
}

function successfulDescendantProbeScript(pidPath, markerPath) {
  const descendant = [
    "const fs = require('node:fs');",
    `setTimeout(() => fs.writeFileSync(${JSON.stringify(markerPath)}, 'escaped'), 750);`,
    'setInterval(() => {}, 1000);',
  ].join('');
  return [
    "const fs = require('node:fs');",
    "const { spawn } = require('node:child_process');",
    `const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore' });`,
    `fs.writeFileSync(${JSON.stringify(pidPath)}, JSON.stringify({ root: process.pid, descendant: descendant.pid }));`,
    'process.exit(0);',
  ].join('');
}

function faithfulCodexAppServerScript(auditPath, pidPath, markerPath, endpoint) {
  const descendant = [
    "const fs = require('node:fs');",
    `setTimeout(() => fs.writeFileSync(${JSON.stringify(markerPath)}, 'escaped'), 350);`,
    'setInterval(() => {}, 1000);',
  ].join('');
  const initializeResult = {
    id: 1,
    result: {
      userAgent: 'codex_cli_rs/0.142.5',
      codexHome: '/fixture/codex-home',
      platformFamily: 'unix',
      platformOs: 'test',
    },
  };
  const configReadResult = {
    id: 2,
    result: {
      config: { mcp_servers: { fsb: codexFsbEffectiveServer(endpoint) } },
      origins: {},
    },
  };
  return [
    "const fs = require('node:fs');",
    "const { spawn } = require('node:child_process');",
    `const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore' });`,
    `fs.writeFileSync(${JSON.stringify(pidPath)}, JSON.stringify({ root: process.pid, descendant: descendant.pid }));`,
    `const auditPath = ${JSON.stringify(auditPath)};`,
    `const initializeResult = ${JSON.stringify(initializeResult)};`,
    `const configReadResult = ${JSON.stringify(configReadResult)};`,
    "const notification = { method: 'remoteControl/status/changed', params: {} };",
    "const expectedMethods = ['initialize', 'initialized', 'config/read'];",
    'let pending = Buffer.alloc(0);',
    'let methods = [];',
    'let ended = false;',
    'let id2Sent = false;',
    'let finished = false;',
    'let validSequence = true;',
    'const emit = (document) => process.stdout.write(`${JSON.stringify(document)}\\n`);',
    'const finish = () => {',
    '  if (finished) return;',
    '  finished = true;',
    '  fs.writeFileSync(auditPath, JSON.stringify({ methods, id2Sent, eofAfterId2: ended && id2Sent, validSequence }));',
    '  process.exit(validSequence ? 0 : 93);',
    '};',
    "process.stdin.on('data', (chunk) => {",
    '  pending = Buffer.concat([pending, chunk]);',
    '  while (true) {',
    '    const newline = pending.indexOf(10);',
    '    if (newline < 0) break;',
    '    const line = pending.subarray(0, newline);',
    '    pending = pending.subarray(newline + 1);',
    '    if (line.length === 0) continue;',
    '    let request;',
    '    try { request = JSON.parse(line.toString("utf8")); } catch { validSequence = false; continue; }',
    '    methods.push(request.method);',
    '    if (request.method === "initialize" && request.id === 1) emit(initializeResult);',
    '    else if (request.method === "initialized") emit(notification);',
    '    else if (request.method === "config/read" && request.id === 2) {',
    '      validSequence = validSequence && JSON.stringify(methods) === JSON.stringify(expectedMethods);',
    '      setTimeout(() => {',
    '        if (ended || !validSequence) return;',
    '        id2Sent = true;',
    '        emit(configReadResult);',
    '      }, 30);',
    '    } else validSequence = false;',
    '  }',
    '});',
    "process.stdin.on('end', () => {",
    '  ended = true;',
    '  setTimeout(finish, id2Sent ? 10 : 80);',
    '});',
  ].join('');
}

function fakeProbeChild(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

async function runGenericProbeTests(
  processProbeModule,
  processTreeModule,
  spawnEnvironmentModule,
) {
  const {
    ProcessProbeError,
    runBoundedProcessProbe,
  } = processProbeModule;
  const {
    buildSanitizedAgentEnvironment,
    freezeAgentEnvironmentPolicy,
  } = spawnEnvironmentModule;

  const policy = freezeAgentEnvironmentPolicy({
    inheritedAllowRules: ['allow_unlisted'],
    strippedKeys: ['GENERIC_PROBE_SECRET'],
    forcedValues: {},
  });
  const environment = buildSanitizedAgentEnvironment({
    PATH: process.env.PATH,
    GENERIC_PROBE_SECRET: 'AMBIENT_PROBE_SECRET_MUST_NOT_SURVIVE',
  }, {
    FSB_PROBE_FIXED: 'yes',
  }, policy);
  const descriptor = (argv, overrides = {}) => ({
    command: process.execPath,
    argv,
    cwd: repoRoot,
    environment,
    timeoutMs: 2_000,
    stdoutLimitBytes: 256,
    stderrLimitBytes: 256,
    ...overrides,
  });

  const stdoutCanary = Buffer.from('PROBE_STDOUT_CANARY');
  const stderrCanary = Buffer.from('PROBE_STDERR_CANARY');
  const success = await runBoundedProcessProbe(descriptor([
    '-e',
    [
      "if (process.env.GENERIC_PROBE_SECRET !== undefined) process.exit(91);",
      "if (process.env.FSB_PROBE_FIXED !== 'yes') process.exit(92);",
      `process.stdout.write(Buffer.from('${stdoutCanary.toString('ascii')}'));`,
      `process.stderr.write(Buffer.from('${stderrCanary.toString('ascii')}'));`,
    ].join(''),
  ]));
  assert(Buffer.isBuffer(success.stdout));
  assert(Buffer.isBuffer(success.stderr));
  assert.notStrictEqual(success.stdout, stdoutCanary);
  assert.notStrictEqual(success.stderr, stderrCanary);
  assert(success.stdout.equals(stdoutCanary));
  assert(success.stderr.equals(stderrCanary));
  assert.deepEqual(success.exit, { code: 0, signal: null });
  assert(Object.isFrozen(success));
  assert(Object.isFrozen(success.exit));
  success.zeroize();
  success.zeroize();
  assert.equal(ownedBuffersAreZero(success), true, 'success channels zero idempotently');

  const stdinCanary = Buffer.from('FIXED_PROBE_STDIN');
  const stdinEcho = await runBoundedProcessProbe(descriptor([
    '-e',
    'const chunks=[];process.stdin.on("data",(chunk)=>chunks.push(chunk));process.stdin.on("end",()=>process.stdout.write(Buffer.concat(chunks)));',
  ], { stdinBytes: Object.freeze(Array.from(stdinCanary)) }));
  assert.equal(stdinEcho.stdout.equals(stdinCanary), true, 'fixed probe stdin reaches the child');
  stdinEcho.zeroize();
  assert.equal(ownedBuffersAreZero(stdinEcho), true);

  const responseChild = fakeProbeChild(42_000);
  const responsePrefix = Buffer.from('{"id":2,"result":', 'utf8');
  const responseLifecycle = Object.freeze({
    stdinBytes: Object.freeze([0x52, 0x0a]),
    stdinCloseAfterStdoutLinePrefixBytes: Object.freeze(Array.from(responsePrefix)),
  });
  const responseSources = [
    Buffer.from('{"id":1,"result":{}}\n{"id":2,"res', 'utf8'),
    Buffer.from('ult":{"config":{}}}', 'utf8'),
    Buffer.from('\n', 'utf8'),
  ];
  const responseDriven = runBoundedProcessProbe(descriptor(['synthetic'], {
    stdinBytes: Object.freeze(Array.from(Buffer.from('REQUESTS\n', 'utf8'))),
    stdinCloseAfterStdoutLinePrefixBytes: Object.freeze(Array.from(responsePrefix)),
  }), {
    spawn: () => responseChild,
    terminateTree: async (_pid, childClosed) => childClosed,
  });
  assert.equal(responseChild.stdin.writableEnded, false,
    'response-driven stdin stays open after the request write');
  responseChild.stdout.emit('data', responseSources[0]);
  responseChild.stdout.emit('data', responseSources[1]);
  assert.equal(responseChild.stdin.writableEnded, false,
    'a matching prefix does not close stdin before the complete response line');
  responseChild.stdout.emit('data', responseSources[2]);
  await waitForCondition(() => responseChild.stdin.writableEnded);
  responseChild.emit('close', 0, null);
  const responseDrivenResult = await responseDriven;
  assert.equal(responseSources.every((source) => source.every((byte) => byte === 0)), true,
    'response-driven exact source chunks are erased');
  responseDrivenResult.zeroize();
  assert.equal(ownedBuffersAreZero(responseDrivenResult), true);

  const nonzero = await runBoundedProcessProbe(descriptor([
    '-e',
    'process.exitCode = 17;',
  ]));
  assert.deepEqual(nonzero.exit, { code: 17, signal: null });
  nonzero.zeroize();

  for (const [label, operation, code] of [
    [
      'stdout overflow',
      () => runBoundedProcessProbe(descriptor([
        '-e',
        "process.stdout.write(Buffer.alloc(512, 0x53)); setInterval(() => {}, 1000);",
      ], { stdoutLimitBytes: 32 })),
      'stdout_overflow',
    ],
    [
      'stderr overflow',
      () => runBoundedProcessProbe(descriptor([
        '-e',
        "process.stderr.write(Buffer.alloc(512, 0x45)); setInterval(() => {}, 1000);",
      ], { stderrLimitBytes: 32 })),
      'stderr_overflow',
    ],
    [
      'timeout',
      () => runBoundedProcessProbe(descriptor([
        '-e',
        'setInterval(() => {}, 1000);',
      ], { timeoutMs: 25 })),
      'timeout',
    ],
    [
      'spawn failure',
      () => runBoundedProcessProbe(descriptor([], {
        command: path.join(repoRoot, 'missing-generic-probe-binary'),
      })),
      'spawn_failed',
    ],
  ]) {
    await assert.rejects(
      operation,
      (error) => {
        assert(error instanceof ProcessProbeError, label);
        assert.equal(error.code, code, label);
        const serialized = JSON.stringify({ name: error.name, code: error.code, message: error.message });
        assert.equal(serialized.includes('AMBIENT_PROBE_SECRET_MUST_NOT_SURVIVE'), false);
        assert.equal(serialized.includes('PROBE_STDOUT_CANARY'), false);
        assert.equal(serialized.includes('PROBE_STDERR_CANARY'), false);
        return true;
      },
    );
  }

  const controller = new AbortController();
  const aborted = runBoundedProcessProbe(descriptor([
    '-e',
    'setInterval(() => {}, 1000);',
  ], { signal: controller.signal }));
  controller.abort();
  await assert.rejects(aborted, (error) => error.code === 'aborted');

  if (process.platform === 'darwin' || process.platform === 'linux') {
    const treeCases = [
      ['timeout tree', 'none', { timeoutMs: 125 }, null, 'timeout'],
      ['abort tree', 'none', {}, new AbortController(), 'aborted'],
      ['stdout overflow tree', 'stdout', { stdoutLimitBytes: 32 }, null, 'stdout_overflow'],
      ['stderr overflow tree', 'stderr', { stderrLimitBytes: 32 }, null, 'stderr_overflow'],
    ];
    for (const [label, channel, overrides, abortController, expectedCode] of treeCases) {
      const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-probe-tree-'));
      const pidPath = path.join(temporaryDirectory, 'pids.json');
      const markerPath = path.join(temporaryDirectory, 'escaped.marker');
      try {
        const operation = runBoundedProcessProbe(descriptor([
          '-e',
          descendantProbeScript(pidPath, markerPath, channel),
        ], {
          ...responseLifecycle,
          ...overrides,
          ...(abortController ? { signal: abortController.signal } : {}),
        }));
        await waitForCondition(() => fs.existsSync(pidPath));
        abortController?.abort();
        await assert.rejects(operation, (error) => error.code === expectedCode, label);
        const pids = JSON.parse(fs.readFileSync(pidPath, 'utf8'));
        assert.equal(processIsPresent(pids.root), false, `${label} root settled before rejection`);
        assert.equal(
          processIsPresent(pids.descendant),
          false,
          `${label} descendant settled before rejection`,
        );
        await new Promise((resolve) => setTimeout(resolve, 800));
        assert.equal(fs.existsSync(markerPath), false, `${label} descendant marker never appears`);
      } finally {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
      }
    }
  }

  for (const [label, trigger, expectedCode] of [
    ['spawn event failure', (child) => child.emit('error', new Error('synthetic')), 'spawn_failed'],
    ['stdout stream failure', (child) => child.stdout.emit('error', new Error('synthetic')), 'malformed_channel'],
    ['stderr stream failure', (child) => child.stderr.emit('error', new Error('synthetic')), 'malformed_channel'],
    ['stdin stream failure', (child) => child.stdin.emit('error', new Error('synthetic')), 'spawn_failed'],
  ]) {
    const child = fakeProbeChild(42_001);
    let releaseTree;
    let treeSettled = false;
    let rejected = false;
    const operation = runBoundedProcessProbe(descriptor(['synthetic']), {
      spawn: () => {
        queueMicrotask(() => trigger(child));
        return child;
      },
      terminateTree: async (pid, childClosed) => {
        assert.equal(pid, 42_001, label);
        child.emit('close', null, 'SIGKILL');
        await childClosed;
        await new Promise((resolve) => { releaseTree = resolve; });
        treeSettled = true;
      },
    });
    operation.catch(() => { rejected = true; });
    await waitForCondition(() => typeof releaseTree === 'function');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(rejected, false, `${label} cannot reject before tree settlement`);
    releaseTree();
    await assert.rejects(operation, (error) => error.code === expectedCode, label);
    assert.equal(treeSettled, true, `${label} terminator settled`);
  }

  const windowsTaskkillPids = [];
  const windowsPresencePids = [];
  await processTreeModule.terminateDetachedProcessTree(42_002, Promise.resolve(), {
    platform: 'win32',
    taskkill: async (pid) => { windowsTaskkillPids.push(pid); },
    processPresent: (pid) => { windowsPresencePids.push(pid); return false; },
    wait: async () => undefined,
  });
  assert.deepEqual(windowsTaskkillPids, [42_002]);
  assert(windowsPresencePids.length >= 1);
  assert(windowsPresencePids.every((pid) => pid === 42_002));

  if (process.platform === 'darwin' || process.platform === 'linux') {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-probe-success-tree-'));
    const pidPath = path.join(temporaryDirectory, 'pids.json');
    const markerPath = path.join(temporaryDirectory, 'escaped.marker');
    let releaseSettlement;
    let settlementStarted = false;
    let resolved = false;
    try {
      const operation = runBoundedProcessProbe(descriptor([
        '-e',
        successfulDescendantProbeScript(pidPath, markerPath),
      ]), {
        terminateTree: async (pid, childClosed) => {
          settlementStarted = true;
          await new Promise((resolve) => { releaseSettlement = resolve; });
          await processTreeModule.terminateDetachedProcessTree(pid, childClosed);
        },
      });
      operation.then(() => { resolved = true; }, () => undefined);
      await waitForCondition(() => fs.existsSync(pidPath) && settlementStarted);
      const pids = JSON.parse(fs.readFileSync(pidPath, 'utf8'));
      assert.equal(processIsPresent(pids.descendant), true,
        'successful root leaves a real same-group descendant before settlement');
      assert.equal(resolved, false, 'successful probe cannot resolve while its descendant exists');
      releaseSettlement();
      const result = await operation;
      assert.equal(processIsPresent(pids.root), false, 'successful probe root is absent on resolve');
      assert.equal(processIsPresent(pids.descendant), false,
        'successful probe descendant is absent on resolve');
      result.zeroize();
      await new Promise((resolve) => setTimeout(resolve, 800));
      assert.equal(fs.existsSync(markerPath), false,
        'settled successful descendant cannot perform a delayed marker write');
    } finally {
      releaseSettlement?.();
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }

  const windowsSuccessChild = fakeProbeChild(42_005);
  const windowsSuccessTree = { root: true, descendant: true };
  const windowsSuccess = runBoundedProcessProbe(descriptor(['synthetic']), {
    spawn: () => windowsSuccessChild,
    terminateTree: (pid, childClosed) => processTreeModule.terminateDetachedProcessTree(
      pid,
      childClosed,
      {
        platform: 'win32',
        taskkill: async (targetPid) => {
          assert.equal(targetPid, 42_005);
          windowsSuccessTree.root = false;
          windowsSuccessTree.descendant = false;
        },
        processPresent: () => windowsSuccessTree.root || windowsSuccessTree.descendant,
        wait: async () => undefined,
      },
    ),
  });
  windowsSuccessChild.emit('close', 0, null);
  const windowsSuccessResult = await windowsSuccess;
  assert.deepEqual(windowsSuccessTree, { root: false, descendant: false },
    'successful Windows probes invoke the supported full-tree mechanism');
  windowsSuccessResult.zeroize();

  const unsettledSuccessChild = fakeProbeChild(42_006);
  const unsettledSuccessSource = Buffer.from('UNSETTLED_SUCCESS_SOURCE');
  const unsettledSuccess = runBoundedProcessProbe(descriptor(['synthetic']), {
    spawn: () => unsettledSuccessChild,
    terminateTree: async () => { throw new Error('synthetic unsettled tree'); },
  });
  unsettledSuccessChild.stdout.emit('data', unsettledSuccessSource);
  unsettledSuccessChild.emit('close', 0, null);
  await assert.rejects(unsettledSuccess, (error) => error.code === 'tree_unsettled');
  assert.equal(unsettledSuccessSource.every((byte) => byte === 0), true,
    'failed success-path absence proof erases the exact emitted source');

  const sourceSuccessChild = fakeProbeChild(42_003);
  const successSources = [
    Buffer.from('RETAINED_SUCCESS_STDOUT'),
    Buffer.from('RETAINED_SUCCESS_STDERR'),
  ];
  const sourceSuccess = runBoundedProcessProbe(descriptor(['synthetic']), {
    spawn: () => sourceSuccessChild,
  });
  sourceSuccessChild.stdout.emit('data', successSources[0]);
  sourceSuccessChild.stderr.emit('data', successSources[1]);
  sourceSuccessChild.emit('close', 0, null);
  const sourceSuccessResult = await sourceSuccess;
  assert(successSources.every((source) => source.every((byte) => byte === 0)));
  assert.equal(sourceSuccessResult.stdout.equals(Buffer.from('RETAINED_SUCCESS_STDOUT')), true);
  assert.equal(sourceSuccessResult.stderr.equals(Buffer.from('RETAINED_SUCCESS_STDERR')), true);
  sourceSuccessResult.zeroize();
  assert.equal(ownedBuffersAreZero(sourceSuccessResult), true);

  const sourceFailureCases = [
    {
      label: 'retained timeout source',
      expectedCode: 'timeout',
      overrides: { timeoutMs: 25 },
      trigger: () => undefined,
    },
    {
      label: 'retained abort source',
      expectedCode: 'aborted',
      controller: new AbortController(),
      trigger: (_child, controller) => controller.abort(),
    },
    {
      label: 'retained malformed source',
      expectedCode: 'malformed_channel',
      trigger: (child) => child.stdout.emit('data', { malformed: true }),
    },
    {
      label: 'retained overflow source',
      expectedCode: 'stdout_overflow',
      overrides: { stdoutLimitBytes: 8 },
      overflow: true,
      trigger: () => undefined,
    },
    {
      label: 'retained spawn failure source',
      expectedCode: 'spawn_failed',
      trigger: (child) => child.emit('error', new Error('synthetic')),
    },
    {
      label: 'retained stream failure source',
      expectedCode: 'malformed_channel',
      trigger: (child) => child.stderr.emit('error', new Error('synthetic')),
    },
  ];
  for (const testCase of sourceFailureCases) {
    const child = fakeProbeChild(42_004);
    const source = Buffer.from(testCase.overflow
      ? 'RETAINED_OVERFLOW_SOURCE'
      : 'RETAINED_FAILURE_SOURCE');
    const operation = runBoundedProcessProbe(descriptor(['synthetic'], {
      ...responseLifecycle,
      ...testCase.overrides,
      ...(testCase.controller ? { signal: testCase.controller.signal } : {}),
    }), {
      spawn: () => child,
      terminateTree: async (_pid, childClosed) => {
        child.emit('close', null, 'SIGKILL');
        await childClosed;
      },
    });
    child.stdout.emit('data', source);
    testCase.trigger(child, testCase.controller);
    const keepAlive = testCase.expectedCode === 'timeout'
      ? setInterval(() => undefined, 100)
      : null;
    try {
      await assert.rejects(
        operation,
        (error) => error.code === testCase.expectedCode,
        testCase.label,
      );
    } finally {
      if (keepAlive !== null) clearInterval(keepAlive);
    }
    assert.equal(
      source.every((byte) => byte === 0),
      true,
      `${testCase.label} exact emitted source is erased`,
    );
  }

  await assert.rejects(
    runBoundedProcessProbe({
      ...descriptor(['-e', 'process.exit(0);']),
      environment: { PATH: process.env.PATH },
    }),
    (error) => error.code === 'invalid_descriptor',
    'an unbranded environment cannot cross the probe boundary',
  );
  await assert.rejects(
    runBoundedProcessProbe({
      ...descriptor(['-e', 'process.exit(0);']),
      stdinCloseAfterStdoutLinePrefixBytes: [123],
    }),
    (error) => error.code === 'invalid_descriptor',
    'response-driven close requires a bounded stdin request',
  );

  const probeSource = fs.readFileSync(
    path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'process-probe.ts'),
    'utf8',
  );
  assert.equal(probeSource.includes('.toString('), false);
  assert.equal(probeSource.includes('JSON.stringify'), false);
  assert.equal(probeSource.includes('console.'), false);

  const productionRoot = path.join(repoRoot, 'mcp', 'src', 'agent-providers');
  const productionSource = fs.readdirSync(productionRoot)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => fs.readFileSync(path.join(productionRoot, name), 'utf8'))
    .join('\n');
  assert.equal(productionSource.includes('CODEX_ADAPTER_ID'), true);
  assert.equal(productionSource.includes('createCodexAdapter'), true);
}

function identityProbe(overrides = {}) {
  return {
    source: 'retained_binary',
    argv: ['identity', 'status'],
    timeoutMs: 1_000,
    stdoutLimitBytes: 64,
    stderrLimitBytes: 64,
    expectedAuthState: 'unknown',
    outcomes: [{
      authState: 'unknown',
      exitCode: 0,
      stdout: { kind: 'empty' },
      stderr: { kind: 'exact', bytes: Array.from(Buffer.from('SAFE_STATUS\n')) },
    }],
    ...overrides,
  };
}

function authorityAttestation(overrides = {}) {
  return {
    source: 'retained_binary',
    argv: ['authority', 'list', '--json'],
    timeoutMs: 1_000,
    stdoutLimitBytes: 8 * 1024,
    stderrLimitBytes: 64,
    classifier: 'effective_authority_json',
    expectedServerName: 'fsb',
    endpointRef: 'direct_runtime_endpoint',
    required: true,
    enabled: true,
    enabledTools: ['fsb_fetch', 'fsb_search'],
    defaultToolsApprovalMode: 'approve',
    headers: 'absent',
    env: 'absent',
    bearerToken: 'absent',
    ...overrides,
  };
}

function directSpawnSpec(preSpawnIdentityProbe, effectiveAuthorityAttestation) {
  return {
    adapterId: 'claude-code',
    profileVersion: '2.1.177',
    topology: {
      kind: 'direct',
      task: {
        role: 'direct_task',
        command: '/fixture/bin/agent',
        argv: ['--json'],
        cwd: '/fixture/runtime/scratch',
        privateFiles: [],
        fixedEnv: {},
        spawnSecretEnvBindings: [],
        stdin: 'task',
        stdout: 'agent_jsonl',
      },
    },
    attestations: [],
    preSpawnIdentityProbe,
    effectiveAuthorityAttestation,
  };
}

function authorityObservation(endpoint, overrides = {}) {
  return {
    servers: [{
      serverName: 'fsb',
      endpoint,
      required: true,
      enabled: true,
      enabledTools: ['fsb_fetch', 'fsb_search'],
      defaultToolsApprovalMode: 'approve',
      ...overrides,
    }],
  };
}

async function runGenericAuthorityTests(
  adapterModule,
  effectiveAuthorityModule,
  serveDelegationModule,
) {
  const {
    EffectiveAuthorityContractError,
    classifyEffectiveAuthority,
    classifyPreSpawnIdentityProbe,
    createDirectRuntimeReference,
    validateDirectRuntimeReference,
    validateEffectiveAuthorityAttestation,
    validatePreSpawnIdentityProbe,
  } = effectiveAuthorityModule;
  const endpoint = 'http://127.0.0.1:7225/mcp';
  const generation = 'generation_generic_authority_0001';
  const reference = createDirectRuntimeReference(endpoint, generation);
  assert(Object.isFrozen(reference));
  assert.deepEqual(Object.keys(reference).sort(), ['endpoint', 'generation']);
  assert.strictEqual(validateDirectRuntimeReference(reference, generation), reference);
  assert.throws(
    () => validateDirectRuntimeReference({ endpoint, generation }, generation),
    (error) => error instanceof EffectiveAuthorityContractError
      && error.code === 'invalid_direct_runtime',
    'structurally identical caller data has no serve-owned capability',
  );
  assert.throws(
    () => validateDirectRuntimeReference(reference, 'generation_other_authority_0001'),
    (error) => error.code === 'invalid_direct_runtime',
  );
  for (const invalidEndpoint of [
    'https://127.0.0.1:7225/mcp',
    'http://localhost:7225/mcp',
    'http://0.0.0.0:7225/mcp',
    'http://127.0.0.1/mcp',
    'http://127.0.0.1:7225',
    'http://127.0.0.1:7225/',
    'http://127.0.0.1:7225/other',
    'http://user@127.0.0.1:7225/mcp',
    'http://127.0.0.1:7225/mcp?endpoint=foreign',
    'http://127.0.0.1:7225/mcp#fragment',
  ]) {
    assert.throws(
      () => createDirectRuntimeReference(invalidEndpoint, generation),
      (error) => error.code === 'invalid_direct_runtime',
      invalidEndpoint,
    );
  }

  const frozenIdentity = validatePreSpawnIdentityProbe(identityProbe());
  const frozenAuthority = validateEffectiveAuthorityAttestation(authorityAttestation());
  assert(Object.isFrozen(frozenIdentity));
  assert(Object.isFrozen(frozenIdentity.argv));
  assert(Object.isFrozen(frozenIdentity.outcomes));
  assert(Object.isFrozen(frozenIdentity.outcomes[0].stderr));
  assert(Object.isFrozen(frozenAuthority));
  assert(Object.isFrozen(frozenAuthority.argv));
  assert(Object.isFrozen(frozenAuthority.enabledTools));
  assert.equal(frozenAuthority.stdinBytes, undefined);

  const frozenSpec = adapterModule.freezeSpawnSpec(
    directSpawnSpec(identityProbe(), authorityAttestation()),
  );
  assert(Object.isFrozen(frozenSpec));
  assert(Object.isFrozen(frozenSpec.preSpawnIdentityProbe));
  assert(Object.isFrozen(frozenSpec.effectiveAuthorityAttestation));

  assert.deepEqual(
    classifyPreSpawnIdentityProbe({
      stdout: Buffer.alloc(0),
      stderr: Buffer.from('SAFE_STATUS\n'),
      exit: { code: 0, signal: null },
    }, frozenIdentity),
    { matched: true, authState: 'unknown', reason: 'match' },
  );
  assert.deepEqual(
    classifyPreSpawnIdentityProbe({
      stdout: Buffer.alloc(0),
      stderr: Buffer.from('DIFFERENT_STATUS\n'),
      exit: { code: 0, signal: null },
    }, frozenIdentity),
    { matched: false, authState: null, reason: 'byte_mismatch' },
  );

  const acceptedAuthority = classifyEffectiveAuthority(
    authorityObservation(endpoint),
    frozenAuthority,
    reference,
  );
  assert.equal(acceptedAuthority.pass, true);
  assert.equal(acceptedAuthority.reason, 'match');
  assert(Object.values(acceptedAuthority).every((value) => (
    typeof value === 'boolean' || value === 'match'
  )));

  const authorityNegatives = [
    [{ servers: [] }, 'server_count'],
    [{ servers: [
      authorityObservation(endpoint).servers[0],
      authorityObservation(endpoint).servers[0],
    ] }, 'server_count'],
    [authorityObservation(endpoint, { serverName: 'foreign' }), 'server_name'],
    [authorityObservation('http://127.0.0.1:7333/mcp'), 'endpoint'],
    [authorityObservation(endpoint, { required: false }), 'required'],
    [authorityObservation(endpoint, { enabled: false }), 'enabled'],
    [authorityObservation(endpoint, { enabledTools: ['fsb_fetch', 'fsb_fetch'] }), 'enabled_tools'],
    [authorityObservation(endpoint, { defaultToolsApprovalMode: 'prompt' }), 'approval_policy'],
    [authorityObservation(endpoint, { headers: { Authorization: 'RAW_HEADER_CANARY' } }), 'headers_present'],
    [authorityObservation(endpoint, { env: { RAW_SECRET: 'RAW_ENV_CANARY' } }), 'env_present'],
    [authorityObservation(endpoint, { bearerToken: 'RAW_BEARER_CANARY' }), 'bearer_present'],
  ];
  for (const [observed, reason] of authorityNegatives) {
    const classification = classifyEffectiveAuthority(observed, frozenAuthority, reference);
    assert.equal(classification.pass, false, reason);
    assert.equal(classification.reason, reason, reason);
    const safe = JSON.stringify(classification);
    for (const canary of ['RAW_HEADER_CANARY', 'RAW_ENV_CANARY', 'RAW_BEARER_CANARY']) {
      assert.equal(safe.includes(canary), false);
    }
  }

  for (const invalid of [
    { ...authorityAttestation(), endpoint: endpoint },
    { ...authorityAttestation(), enabledTools: ['fsb_fetch', 'fsb_fetch'] },
    { ...authorityAttestation(), headers: {} },
    { ...authorityAttestation(), env: 'present' },
    { ...authorityAttestation(), bearerToken: 'RAW_DESCRIPTOR_CANARY' },
    Object.assign(Object.create(null), authorityAttestation()),
  ]) {
    assert.throws(
      () => validateEffectiveAuthorityAttestation(invalid),
      (error) => error.code === 'invalid_authority_attestation'
        && !error.message.includes('RAW_DESCRIPTOR_CANARY'),
    );
  }

  let getterCalls = 0;
  const accessor = authorityAttestation();
  Object.defineProperty(accessor, 'enabledTools', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return ['fsb_fetch'];
    },
  });
  assert.throws(
    () => validateEffectiveAuthorityAttestation(accessor),
    (error) => error.code === 'invalid_authority_attestation',
  );
  assert.equal(getterCalls, 0);

  const order = [];
  let suppliedReference = null;
  const supervisor = {
    async recover() { order.push('recover'); return { spawnAvailable: true }; },
    async close() { order.push('close'); return { cancelled: 0, failed: 0, alreadySettled: 0 }; },
    journalEntryForChild() { return null; },
    async handleExtRequest() { throw new Error('unused'); },
  };
  const running = await serveDelegationModule.startServeDelegation({
    host: '127.0.0.1',
    port: 7225,
    dependencies: {
      createBridge: () => ({
        currentMode: 'hub',
        topology: {},
        async connect() { order.push('connect'); },
        disconnect() { order.push('disconnect'); },
      }),
      createQueue: () => ({}),
      startHttp: async () => {
        order.push('bind');
        return {
          endpoint,
          healthEndpoint: `${endpoint}/health`,
          markServeReady() { order.push('ready'); },
          async close() { order.push('http.close'); },
        };
      },
      createSupervisor(receivedEndpoint, _onDegraded, directRuntimeReference) {
        order.push('supervisor');
        assert.equal(receivedEndpoint, endpoint);
        suppliedReference = directRuntimeReference;
        return supervisor;
      },
      mintGeneration: () => generation,
      prepareBridgeAuth: () => undefined,
      pushInventory: async () => undefined,
      registerSignal: () => undefined,
      exit: () => undefined,
    },
  });
  assert.deepEqual(order.slice(0, 5), ['bind', 'supervisor', 'recover', 'connect', 'ready']);
  assert.strictEqual(validateDirectRuntimeReference(suppliedReference, generation), suppliedReference);
  await running.shutdown();
}

function probeResult(stdout, stderr, code = 0, signal = null) {
  const stdoutBytes = Buffer.from(stdout);
  const stderrBytes = Buffer.from(stderr);
  return {
    stdout: stdoutBytes,
    stderr: stderrBytes,
    exit: Object.freeze({ code, signal }),
    zeroize() {
      stdoutBytes.fill(0);
      stderrBytes.fill(0);
    },
  };
}

async function collectEvents(parser, input) {
  const events = [];
  for await (const event of parser(Readable.from([input]))) events.push(event);
  return events;
}

function codexContext(reference, authState = 'chatgpt', version = '0.142.5') {
  const privateMcpConfigPath = '/fixture/runtime/codex-run/mcp.json';
  return {
    adapterId: 'codex',
    detection: {
      installed: true,
      version,
      authState,
      binary: {
        command: '/fixture/bin/codex',
        realPath: '/fixture/bin/codex',
        argvPrefix: [],
      },
      profileVersion: '0.142.5',
    },
    delegationId: 'delegation_codex_0001',
    runtimeFingerprint: 'runtime_fingerprint_codex_0001',
    cwd: '/fixture/work',
    privateMcpConfigPath,
    runtimeFiles: [privateMcpConfigPath],
    runtimeScopes: [{}, {}, {}],
    directRuntimeReference: reference,
  };
}

function codexFsbEffectiveServer(endpoint, overrides = {}) {
  return {
    url: endpoint,
    environment_id: 'local',
    enabled: true,
    required: true,
    tool_timeout_sec: null,
    default_tools_approval_mode: 'approve',
    enabled_tools: ['search_capabilities', 'invoke_capability'],
    ...overrides,
  };
}

function codexConfigReadMessages(mcpServers, overrides = {}) {
  return [
    {
      id: 1,
      result: {
        userAgent: 'codex_cli_rs/0.142.5',
        codexHome: '/fixture/codex-home',
        platformFamily: 'unix',
        platformOs: 'macos',
      },
    },
    ...(overrides.remoteControlNotification !== false
      ? [{ method: 'remoteControl/status/changed', params: {} }]
      : []),
    {
      id: 2,
      result: {
        config: { mcp_servers: mcpServers },
        origins: {},
      },
    },
  ];
}

function withoutKey(value, key) {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

async function runCodexIsolationTests(
  codexModule,
  codexDetectModule,
  codexProfileModule,
  effectiveAuthorityModule,
  spawnEnvironmentModule,
  processProbeModule,
) {
  const strippedCanaries = {
    CODEX_API_KEY: 'CODEX_API_CANARY',
    CODEX_ACCESS_TOKEN: 'CODEX_ACCESS_CANARY',
    OPENAI_API_KEY: 'OPENAI_API_CANARY',
    CODEX_EXEC_SERVER_URL: 'https://foreign.invalid',
    CODEX_EXEC_SERVER_NOISE_AUTH_TOKEN: 'NOISE_AUTH_CANARY',
    CODEX_EXEC_SERVER_NOISE_CHATGPT_ACCOUNT_ID: 'NOISE_ACCOUNT_CANARY',
    CODEX_EXEC_SERVER_NOISE_ENVIRONMENT_ID: 'NOISE_ENV_CANARY',
    CODEX_EXEC_SERVER_NOISE_REGISTRY_URL: 'NOISE_REGISTRY_CANARY',
  };
  const environment = spawnEnvironmentModule.buildSanitizedAgentEnvironment({
    ...strippedCanaries,
    CODEX_HOME: '/fixture/codex-home-retained',
    PATH: '/fixture/bin',
  }, {}, spawnEnvironmentModule.DELEGATION_AGENT_ENVIRONMENT_POLICY);
  for (const key of Object.keys(strippedCanaries)) {
    if (key === 'CODEX_EXEC_SERVER_URL') continue;
    assert.equal(environment[key], undefined, `${key} is stripped`);
  }
  assert.equal(environment.CODEX_EXEC_SERVER_URL, 'none');
  assert.equal(environment.CODEX_HOME, '/fixture/codex-home-retained');

  async function detectVersion(version, authBytes = Buffer.from('Logged in using ChatGPT\n')) {
    const produced = [];
    const detector = codexDetectModule.createCodexDetector({
      platform: 'darwin',
      pathValue: '/fixture/bin',
      cwd: '/fixture/work',
      sourceEnv: {
        ...strippedCanaries,
        CODEX_HOME: '/fixture/codex-home-retained',
        PATH: '/fixture/bin',
      },
      resolveBinary: async () => ({
        sourcePath: '/fixture/bin/codex',
        realPath: '/fixture/bin/codex',
      }),
      resolveRealPath: async (value) => value,
      resolveWindowsShim: async () => null,
      probe: async (descriptor) => {
        assert.equal(descriptor.environment.CODEX_EXEC_SERVER_URL, 'none');
        assert.equal(descriptor.environment.CODEX_API_KEY, undefined);
        assert.equal(descriptor.environment.OPENAI_API_KEY, undefined);
        assert.equal(descriptor.environment.CODEX_HOME, '/fixture/codex-home-retained');
        const result = descriptor.argv.includes('--version')
          ? probeResult(Buffer.from(`codex-cli ${version}\n`), Buffer.alloc(0))
          : probeResult(Buffer.alloc(0), authBytes);
        produced.push(result);
        return result;
      },
    });
    const detection = await detector.detect();
    assert(produced.every(ownedBuffersAreZero), 'all detector probe buffers are erased');
    return detection;
  }

  const supported = await detectVersion('0.142.5');
  assert.deepEqual(supported, {
    installed: true,
    version: '0.142.5',
    authState: 'chatgpt',
    binary: {
      command: '/fixture/bin/codex',
      realPath: '/fixture/bin/codex',
      argvPrefix: [],
    },
    profileVersion: '0.142.5',
  });
  assert.equal((await detectVersion('0.144.6')).installed, true,
    'newer compatible Codex remains retained as degraded evidence');
  const below = await detectVersion('0.142.4');
  assert.equal(below.installed, false);
  assert.equal(below.diagnostic.code, 'version_unsupported');
  const wrongMajor = await detectVersion('1.0.0');
  assert.equal(wrongMajor.installed, false);
  assert.equal(wrongMajor.diagnostic.code, 'version_unsupported');

  const endpoint = 'http://127.0.0.1:7225/mcp';
  const reference = effectiveAuthorityModule.createDirectRuntimeReference(
    endpoint,
    'generation_codex_profile_0001',
  );
  const spec = codexProfileModule.buildCodexSpawnSpec(
    { text: 'Synthetic task text must travel only over stdin.' },
    codexContext(reference),
  );
  assert(Object.isFrozen(spec));
  assert.equal(spec.adapterId, 'codex');
  assert.equal(spec.profileVersion, '0.142.5');
  assert.equal(spec.topology.kind, 'direct');
  assert.deepEqual(
    spec.topology.task.argv.slice(0, codexProfileModule.CODEX_BASE_ARGV.length),
    codexProfileModule.CODEX_BASE_ARGV,
  );
  assert.deepEqual(codexProfileModule.CODEX_BASE_ARGV, [
    'exec', '-', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules',
    '--strict-config', '--color', 'never', '--sandbox', 'read-only',
    '--skip-git-repo-check',
  ]);
  assert.equal(spec.topology.task.stdin, 'task');
  assert.equal(spec.topology.task.stdout, 'agent_jsonl');
  assert.equal(spec.topology.task.cwd, '/fixture/runtime/codex-run');
  assert.deepEqual(spec.topology.task.privateFiles, []);
  assert.deepEqual(spec.topology.task.fixedEnv, {});
  assert.equal(spec.topology.task.argv.includes('Synthetic task text must travel only over stdin.'), false);
  for (const forbidden of [
    'resume', 'review', '--model', '--profile', '--image', '--output-last-message',
    '--output-schema', '--add-dir', '--search', '--local-provider', '--full-auto', '--yolo',
    '--dangerously-bypass-approvals-and-sandbox', '--ask-for-approval',
  ]) assert.equal(spec.topology.task.argv.includes(forbidden), false, `${forbidden} is forbidden`);
  const configValues = spec.topology.task.argv
    .map((value, index, values) => (value === '-c' ? values[index + 1] : null))
    .filter(Boolean);
  for (const required of [
    'project_doc_max_bytes=0',
    'web_search="disabled"',
    'shell_environment_policy.inherit="none"',
    'mcp_servers={}',
    'mcp_servers.fsb.required=true',
    'mcp_servers.fsb.enabled=true',
    'mcp_servers.fsb.enabled_tools=["search_capabilities","invoke_capability"]',
    'mcp_servers.fsb.default_tools_approval_mode="approve"',
  ]) assert.equal(configValues.filter((value) => value === required).length, 1, required);
  assert.equal(configValues.filter((value) => value.startsWith('mcp_servers.fsb.url=')).length, 1);
  assert(codexProfileModule.CODEX_DISABLED_TOOL_FEATURES.length >= 50);
  for (const feature of codexProfileModule.CODEX_DISABLED_TOOL_FEATURES) {
    assert.equal(configValues.filter((value) => value === `features.${feature}=false`).length, 1);
  }

  assert.equal(spec.preSpawnIdentityProbe.expectedAuthState, 'chatgpt');
  assert.deepEqual(spec.preSpawnIdentityProbe.argv, ['login', 'status']);
  assert.equal(spec.effectiveAuthorityAttestation.classifier, 'codex_effective_authority_json');
  assert.deepEqual(spec.effectiveAuthorityAttestation.enabledTools, [
    'search_capabilities',
    'invoke_capability',
  ]);
  assert.deepEqual(spec.effectiveAuthorityAttestation.argv.slice(-3), [
    'app-server', '--stdio', '--strict-config',
  ]);
  assert(Object.isFrozen(spec.effectiveAuthorityAttestation.stdinBytes));
  assert(Object.isFrozen(
    spec.effectiveAuthorityAttestation.stdinCloseAfterStdoutLinePrefixBytes,
  ));
  assert.equal(
    Buffer.from(spec.effectiveAuthorityAttestation.stdinCloseAfterStdoutLinePrefixBytes)
      .equals(Buffer.from('{"id":2,"result":', 'utf8')),
    true,
  );
  const authorityRequests = Buffer.from(spec.effectiveAuthorityAttestation.stdinBytes)
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(authorityRequests.map((request) => request.method), [
    'initialize', 'initialized', 'config/read',
  ]);
  assert.equal(authorityRequests[2].params.cwd, '/fixture/runtime/codex-run');
  assert.equal(authorityRequests[2].params.includeLayers, false);
  assert.equal(authorityRequests.some((request) => (
    request.method.includes('model')
    || request.method.includes('login')
    || request.method.includes('browser')
  )), false);
  assert.equal(effectiveAuthorityModule.codexAuthorityUsesTaskConfig(
    spec.effectiveAuthorityAttestation.argv,
    spec.topology.task.argv,
  ), true);
  assert.equal(effectiveAuthorityModule.codexAuthorityUsesTaskConfig(
    spec.effectiveAuthorityAttestation.argv,
    [...spec.topology.task.argv.slice(0, -1), 'mcp_servers.fsb.enabled=false'],
  ), false);

  const protocolRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-codex-protocol-'));
  try {
    const runFaithfulProtocol = async (label, responseDriven) => {
      const runDirectory = path.join(protocolRoot, label);
      fs.mkdirSync(runDirectory, { recursive: true });
      const auditPath = path.join(runDirectory, 'audit.json');
      const pidPath = path.join(runDirectory, 'pids.json');
      const markerPath = path.join(runDirectory, 'escaped.marker');
      const script = faithfulCodexAppServerScript(
        auditPath,
        pidPath,
        markerPath,
        endpoint,
      );
      const fixtureContext = codexContext(reference);
      const privateMcpConfigPath = path.join(runDirectory, 'mcp.json');
      const nativeSpec = codexProfileModule.buildCodexSpawnSpec(
        { text: 'Faithful native protocol transport fixture.' },
        {
          ...fixtureContext,
          detection: {
            ...fixtureContext.detection,
            binary: {
              command: process.execPath,
              realPath: process.execPath,
              argvPrefix: ['-e', script, '--'],
            },
          },
          cwd: runDirectory,
          privateMcpConfigPath,
          runtimeFiles: [privateMcpConfigPath],
        },
      );
      const attestation = nativeSpec.effectiveAuthorityAttestation;
      const result = await processProbeModule.runBoundedProcessProbe({
        command: process.execPath,
        argv: attestation.argv,
        cwd: runDirectory,
        environment,
        timeoutMs: attestation.timeoutMs,
        stdoutLimitBytes: attestation.stdoutLimitBytes,
        stderrLimitBytes: attestation.stderrLimitBytes,
        stdinBytes: attestation.stdinBytes,
        ...(responseDriven
          ? {
              stdinCloseAfterStdoutLinePrefixBytes:
                attestation.stdinCloseAfterStdoutLinePrefixBytes,
            }
          : {}),
      });
      const messages = result.stdout.toString('utf8').trimEnd().split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
      const pids = JSON.parse(fs.readFileSync(pidPath, 'utf8'));
      assert.deepEqual(audit.methods, ['initialize', 'initialized', 'config/read']);
      assert.equal(audit.validSequence, true);
      assert.equal(audit.methods.some((method) => (
        method.includes('model')
        || method.includes('login')
        || method.includes('browser')
        || method.includes('task')
      )), false, 'native authority handshake invokes no model, login, browser, or task');
      assert.equal(processIsPresent(pids.root), false, `${label} root settled`);
      assert.equal(processIsPresent(pids.descendant), false, `${label} descendant settled`);
      await new Promise((resolve) => setTimeout(resolve, 400));
      assert.equal(fs.existsSync(markerPath), false, `${label} descendant marker never appears`);
      return { result, messages, audit, attestation };
    };

    const immediateEof = await runFaithfulProtocol('immediate-eof', false);
    try {
      assert.deepEqual(immediateEof.messages.map((message) => message.id ?? null), [1, null]);
      assert.equal(immediateEof.audit.id2Sent, false,
        'faithful pinned protocol omits config/read after immediate EOF');
      assert.equal(immediateEof.audit.eofAfterId2, false);
      assert.equal(effectiveAuthorityModule.classifyEffectiveAuthority(
        immediateEof.messages,
        immediateEof.attestation,
        reference,
      ).pass, false, 'incomplete native response fails closed');
    } finally {
      immediateEof.result.zeroize();
      assert.equal(ownedBuffersAreZero(immediateEof.result), true);
    }

    const responseDriven = await runFaithfulProtocol('response-driven', true);
    try {
      assert.deepEqual(responseDriven.messages.map((message) => message.id ?? null), [1, null, 2]);
      assert.equal(responseDriven.audit.id2Sent, true);
      assert.equal(responseDriven.audit.eofAfterId2, true,
        'stdin closes only after the complete id 2 response line');
      assert.equal(effectiveAuthorityModule.classifyEffectiveAuthority(
        responseDriven.messages,
        responseDriven.attestation,
        reference,
      ).pass, true, 'response-driven handshake proves the exact effective roster');
    } finally {
      responseDriven.result.zeroize();
      assert.equal(ownedBuffersAreZero(responseDriven.result), true);
    }
  } finally {
    fs.rmSync(protocolRoot, { recursive: true, force: true });
  }

  const nativeServer = codexFsbEffectiveServer(endpoint);
  const nativeAuthority = codexConfigReadMessages({ fsb: nativeServer });
  assert.equal(effectiveAuthorityModule.classifyEffectiveAuthority(
    nativeAuthority,
    spec.effectiveAuthorityAttestation,
    reference,
  ).pass, true);
  assert.equal(effectiveAuthorityModule.classifyEffectiveAuthority(
    codexConfigReadMessages({ fsb: nativeServer, dormant: { enabled: false } }),
    spec.effectiveAuthorityAttestation,
    reference,
  ).pass, true, 'disabled inherited servers are outside the complete enabled roster');
  assert.equal(effectiveAuthorityModule.classifyEffectiveAuthority(
    codexConfigReadMessages({ fsb: nativeServer }),
    spec.effectiveAuthorityAttestation,
    reference,
  ).pass, true, 'the pinned initialize/status/config-read sequence is exact');

  const nativeNegatives = [
    [codexConfigReadMessages({
      fsb: nativeServer,
      foreign: codexFsbEffectiveServer('http://127.0.0.1:7333/mcp'),
    }), 'server_count'],
    [codexConfigReadMessages({
      fsb: nativeServer,
      FSB: codexFsbEffectiveServer('http://127.0.0.1:7334/mcp'),
    }), 'server_count'],
    [codexConfigReadMessages({ foreign: { enabled: true } }), 'server_name'],
    [codexConfigReadMessages({ fsb: { ...nativeServer, enabled: false } }), 'server_count'],
    [codexConfigReadMessages({ fsb: nativeServer, ambiguous: {} }), 'malformed'],
    [codexConfigReadMessages({ fsb: withoutKey(nativeServer, 'required') }), 'malformed'],
    [codexConfigReadMessages({ fsb: { ...nativeServer, required: false } }), 'required'],
    [codexConfigReadMessages({ fsb: withoutKey(nativeServer, 'default_tools_approval_mode') }), 'malformed'],
    [codexConfigReadMessages({ fsb: { ...nativeServer, default_tools_approval_mode: 'prompt' } }), 'approval_policy'],
    [codexConfigReadMessages({ fsb: withoutKey(nativeServer, 'enabled_tools') }), 'malformed'],
    [codexConfigReadMessages({ fsb: { ...nativeServer, enabled_tools: ['search_capabilities'] } }), 'enabled_tools'],
    [codexConfigReadMessages({ fsb: { ...nativeServer, url: 'http://127.0.0.1:7333/mcp' } }), 'endpoint'],
    [codexConfigReadMessages({ fsb: { ...nativeServer, environment_id: 'remote' } }), 'malformed'],
    [codexConfigReadMessages({ fsb: { ...nativeServer, tool_timeout_sec: 10 } }), 'malformed'],
    [codexConfigReadMessages({ fsb: { ...nativeServer, http_headers: { Authorization: 'HEADER_CANARY' } } }), 'headers_present'],
    [codexConfigReadMessages({ fsb: { ...nativeServer, env_http_headers: { Authorization: 'ENV_HEADER_CANARY' } } }), 'env_present'],
    [codexConfigReadMessages({ fsb: { ...nativeServer, bearer_token_env_var: 'TOKEN_CANARY' } }), 'bearer_present'],
    [codexConfigReadMessages({ fsb: { ...nativeServer, disabled_tools: [] } }), 'malformed'],
    [codexConfigReadMessages(
      { fsb: nativeServer },
      { remoteControlNotification: false },
    ), 'malformed'],
    [[nativeAuthority[2]], 'malformed'],
    [{ id: 2, result: nativeAuthority[2].result }, 'malformed'],
    [[nativeAuthority[2], nativeAuthority[1], nativeAuthority[0]], 'malformed'],
    [[
      nativeAuthority[0],
      { method: 'foreign/status', params: {} },
      nativeAuthority[2],
    ], 'malformed'],
    [[...nativeAuthority, { method: 'remoteControl/status/changed', params: {} }], 'malformed'],
  ];
  for (const [mutation, expectedReason] of nativeNegatives) {
    const result = effectiveAuthorityModule.classifyEffectiveAuthority(
      mutation,
      spec.effectiveAuthorityAttestation,
      reference,
    );
    assert.equal(result.pass, false);
    assert.equal(result.reason, expectedReason);
    const serialized = JSON.stringify(result);
    for (const canary of ['HEADER_CANARY', 'ENV_HEADER_CANARY', 'TOKEN_CANARY']) {
      assert.equal(serialized.includes(canary), false);
    }
  }

  assert.throws(
    () => effectiveAuthorityModule.validateEffectiveAuthorityAttestation({
      ...spec.effectiveAuthorityAttestation,
      stdinBytes: [],
    }),
    (error) => error.code === 'invalid_authority_attestation',
  );
  assert.throws(
    () => effectiveAuthorityModule.validateEffectiveAuthorityAttestation({
      ...spec.effectiveAuthorityAttestation,
      stdinCloseAfterStdoutLinePrefixBytes: Array.from(Buffer.from('{"id":7,"result":')),
    }),
    (error) => error.code === 'invalid_authority_attestation',
  );
  assert.throws(
    () => effectiveAuthorityModule.validateEffectiveAuthorityAttestation({
      ...spec.effectiveAuthorityAttestation,
      argv: [...spec.effectiveAuthorityAttestation.argv.slice(0, -3), 'mcp', 'get', 'fsb'],
    }),
    (error) => error.code === 'invalid_authority_attestation',
  );

  const authoritySource = fs.readFileSync(
    path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'effective-authority.ts'),
    'utf8',
  );
  assert.equal(authoritySource.includes('const serverCountMatches = true'), false);
  assert.equal(authoritySource.includes('const requiredMatches = true'), false);
  assert.equal(authoritySource.includes('const approvalPolicyMatches = true'), false);

  const calls = [];
  const fakeDetection = Object.freeze({ installed: false });
  const fakeParser = async function* () { yield Object.freeze({ type: 'diagnostic' }); };
  const adapter = codexModule.createCodexAdapter({
    detect: async () => fakeDetection,
    parseEvents: fakeParser,
    kill: async (...args) => { calls.push(args); },
  });
  assert.deepEqual(Object.keys(adapter), ['detect', 'buildSpawn', 'parseEvents', 'kill', 'caps']);
  assert(Object.isFrozen(adapter));
  assert.strictEqual(await adapter.detect(), fakeDetection);
  const parsed = [];
  for await (const event of adapter.parseEvents(Readable.from([]))) parsed.push(event);
  assert.deepEqual(parsed, [{ type: 'diagnostic' }]);
  assert.deepEqual(adapter.caps(), {
    taskMode: true,
    chatMode: false,
    resume: false,
    serverMode: false,
  });
  await adapter.kill({ pid: 1 }, { grace: 10 });
  assert.equal(calls.length, 1);
}

function runCodexAuthTests(codexDetectModule, codexProfileModule, effectiveAuthorityModule) {
  const cases = [
    ['chatgpt', Buffer.alloc(0), Buffer.from('Logged in using ChatGPT\n'), 0, null, 'chatgpt'],
    ['api key', Buffer.alloc(0), Buffer.from('Logged in using an API key - abCD12_-***z9_Y-\n'), 0, null, 'api_key'],
    ['unauthenticated', Buffer.alloc(0), Buffer.from('Not logged in\n'), 1, null, 'unauthenticated'],
    ['extra whitespace', Buffer.alloc(0), Buffer.from('Logged in using ChatGPT \n'), 0, null, 'unknown'],
    ['wrong api shape', Buffer.alloc(0), Buffer.from('Logged in using an API key - abCD12!!***z9_Y-\n'), 0, null, 'unknown'],
    ['wrong api exit', Buffer.alloc(0), Buffer.from('Logged in using an API key - abCD12_-***z9_Y-\n'), 1, null, 'unknown'],
    ['stdout contamination', Buffer.from('secret'), Buffer.from('Logged in using ChatGPT\n'), 0, null, 'unknown'],
    ['signal', Buffer.alloc(0), Buffer.from('Logged in using ChatGPT\n'), null, 'SIGTERM', 'unknown'],
  ];
  for (const [label, stdout, stderr, code, signal, expected] of cases) {
    const result = probeResult(stdout, stderr, code, signal);
    assert.equal(codexDetectModule.classifyCodexAuthProbe(result), expected, label);
    assert.equal(ownedBuffersAreZero(result), true, `${label} buffers are erased`);
  }

  const reference = effectiveAuthorityModule.createDirectRuntimeReference(
    'http://127.0.0.1:7226/mcp',
    'generation_codex_auth_0001',
  );
  const apiSpec = codexProfileModule.buildCodexSpawnSpec(
    { text: 'Synthetic API task' },
    codexContext(reference, 'api_key'),
  );
  const validApi = effectiveAuthorityModule.classifyPreSpawnIdentityProbe({
    stdout: Buffer.alloc(0),
    stderr: Buffer.from('Logged in using an API key - abCD12_-***z9_Y-\n'),
    exit: { code: 0, signal: null },
  }, apiSpec.preSpawnIdentityProbe);
  assert.deepEqual(validApi, { matched: true, authState: 'api_key', reason: 'match' });
  const invalidApi = effectiveAuthorityModule.classifyPreSpawnIdentityProbe({
    stdout: Buffer.alloc(0),
    stderr: Buffer.from('Logged in using an API key - abCD12!!***z9_Y-\n'),
    exit: { code: 0, signal: null },
  }, apiSpec.preSpawnIdentityProbe);
  assert.deepEqual(invalidApi, { matched: false, authState: null, reason: 'byte_mismatch' });

  const detectSource = fs.readFileSync(
    path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'codex-detect.ts'),
    'utf8',
  );
  assert.doesNotMatch(detectSource, /console\.|credential|keyring/i);
  assert.match(detectSource, /finally\s*\{\s*result\.zeroize\(\);\s*\}/);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function setPath(root, segments, value) {
  let current = root;
  for (const segment of segments.slice(0, -1)) current = current[segment];
  current[segments[segments.length - 1]] = value;
}

function generatedNegative(generator, baseLines, streamModule) {
  if (generator === 'invalid_utf8') return Buffer.from([0xff, 0x0a]);
  if (generator === 'invalid_json') return Buffer.from('{\n', 'utf8');
  if (generator === 'line_overflow') {
    return Buffer.alloc(streamModule.CODEX_STREAM_LINE_LIMIT_BYTES + 1, 0x78);
  }
  if (generator === 'stream_overflow') {
    return Buffer.alloc(streamModule.CODEX_STREAM_LIMIT_BYTES + 1, 0x78);
  }
  if (generator === 'event_overflow') {
    const prefix = baseLines.slice(0, 3).map(JSON.stringify);
    const update = JSON.stringify(baseLines[6]);
    return Buffer.from([...prefix, ...Array.from({ length: 4_094 }, () => update)].join('\n') + '\n');
  }
  const lines = cloneJson(baseLines);
  if (generator === 'depth_overflow') {
    let nested = null;
    for (let index = 0; index < 12; index += 1) nested = { next: nested };
    lines[5].item.arguments = nested;
  } else if (generator === 'node_overflow') {
    lines[5].item.arguments = Object.fromEntries(Array.from(
      { length: 256 },
      (_, index) => [`key_${index}`, Array.from({ length: 16 }, () => null)],
    ));
  } else if (generator === 'key_overflow') {
    lines[5].item.arguments = Object.fromEntries(Array.from(
      { length: 257 },
      (_, index) => [`key_${index}`, null],
    ));
  } else if (generator === 'array_overflow') {
    lines[5].item.arguments = Array.from({ length: 257 }, () => null);
  } else {
    throw new Error(`Unknown generated native-negative case: ${generator}`);
  }
  return Buffer.from(`${lines.map(JSON.stringify).join('\n')}\n`);
}

function negativeInput(testCase, baseLines, streamModule) {
  const operation = testCase.operation;
  if (operation.kind === 'generated') {
    return generatedNegative(operation.generator, baseLines, streamModule);
  }
  const lines = cloneJson(baseLines);
  if (operation.kind === 'remove_line') {
    lines.splice(operation.index, 1);
  } else if (operation.kind === 'insert_line') {
    const value = operation.copyLine === undefined
      ? cloneJson(operation.value)
      : cloneJson(lines[operation.copyLine]);
    lines.splice(operation.index, 0, value);
  } else if (operation.kind === 'append_line') {
    lines.push(cloneJson(operation.value));
  } else if (operation.kind === 'replace_line') {
    lines[operation.index] = cloneJson(operation.value);
  } else if (operation.kind === 'move_line') {
    const [value] = lines.splice(operation.from, 1);
    lines.splice(operation.to, 0, value);
  } else if (operation.kind === 'set_path') {
    setPath(lines[operation.line], operation.path, cloneJson(operation.value));
  } else if (operation.kind === 'set_failed_mcp') {
    lines[operation.line].item.status = 'failed';
    lines[operation.line].item.result = null;
    lines[operation.line].item.error = { message: 'synthetic failure' };
  } else if (operation.kind === 'replace_item_type') {
    lines[operation.line].item.type = operation.value;
  } else if (operation.kind === 'insert_raw_line') {
    lines.splice(operation.index, 0, operation.value);
  } else {
    throw new Error(`Unknown native-negative operation: ${operation.kind}`);
  }
  return Buffer.from(`${lines.map((line) => (
    typeof line === 'string' ? line : JSON.stringify(line)
  )).join('\n')}\n`);
}

async function runCodexParserTests(codexStreamModule) {
  const fixtureText = fs.readFileSync(path.join(codexFixtureDir, 'contract-stream.jsonl'), 'utf8');
  const expected = JSON.parse(fs.readFileSync(
    path.join(codexFixtureDir, 'expected-events.json'),
    'utf8',
  ));
  const manifest = JSON.parse(fs.readFileSync(path.join(codexFixtureDir, 'manifest.json'), 'utf8'));
  const corpus = JSON.parse(fs.readFileSync(
    path.join(codexFixtureDir, 'native-negative-corpus.json'),
    'utf8',
  ));
  const baseLines = fixtureText.trimEnd().split(/\r?\n/).map((line) => JSON.parse(line));
  const events = await collectEvents(codexStreamModule.parseCodexStream, Buffer.from(fixtureText));
  assert.deepEqual(events, expected);
  assert.deepEqual(events.map((event) => event.type), manifest.expectedSequence);
  assert(events.every(Object.isFrozen));
  assert(events.every((event) => Object.isFrozen(event.payload)));
  const serializedEvents = JSON.stringify(events);
  for (const privateFragment of [
    'synthetic private plan',
    'synthetic private reasoning',
    'synthetic capability',
    'synthetic tool output',
  ]) assert.equal(serializedEvents.includes(privateFragment), false);

  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.profileVersion, '0.142.5');
  assert.equal(corpus.baseFixture, 'contract-stream.jsonl');
  assert(corpus.cases.length >= 40, 'native-negative corpus is comprehensive');
  assert.equal(new Set(corpus.cases.map((entry) => entry.id)).size, corpus.cases.length);
  for (const testCase of corpus.cases) {
    const input = negativeInput(testCase, baseLines, codexStreamModule);
    await assert.rejects(
      collectEvents(codexStreamModule.parseCodexStream, input),
      (error) => {
        assert.equal(error.code, 'agent_protocol_drift', testCase.id);
        assert.equal(error.providerId, 'codex', testCase.id);
        assert.equal(error.reason, testCase.expectedReason, testCase.id);
        const safeError = JSON.stringify({
          name: error.name,
          code: error.code,
          providerId: error.providerId,
          reason: error.reason,
          eventIndex: error.eventIndex,
          issuePaths: error.issuePaths,
          message: error.message,
        });
        for (const privateFragment of [
          'synthetic private plan',
          'synthetic private reasoning',
          'synthetic capability',
          'synthetic tool output',
        ]) assert.equal(safeError.includes(privateFragment), false, testCase.id);
        return true;
      },
    );
  }
}

async function main() {
  const processProbeModule = await import(pathToFileURL(processProbeBuildPath).href);
  const processTreeModule = await import(pathToFileURL(processTreeBuildPath).href);
  const spawnEnvironmentModule = await import(pathToFileURL(spawnEnvironmentBuildPath).href);
  if (SELECTED_SECTION === 'generic-probe') {
    await runGenericProbeTests(processProbeModule, processTreeModule, spawnEnvironmentModule);
    console.log('mcp-codex-adapter.test.js: PASS');
    return;
  }
  if (SELECTED_SECTION === 'generic-authority') {
    const adapterModule = await import(pathToFileURL(adapterBuildPath).href);
    const effectiveAuthorityModule = await import(pathToFileURL(effectiveAuthorityBuildPath).href);
    const serveDelegationModule = await import(pathToFileURL(serveDelegationBuildPath).href);
    await runGenericAuthorityTests(
      adapterModule,
      effectiveAuthorityModule,
      serveDelegationModule,
    );
    console.log('mcp-codex-adapter.test.js: PASS');
    return;
  }
  const adapterModule = await import(pathToFileURL(adapterBuildPath).href);
  const effectiveAuthorityModule = await import(pathToFileURL(effectiveAuthorityBuildPath).href);
  const serveDelegationModule = await import(pathToFileURL(serveDelegationBuildPath).href);
  const codexModule = await import(pathToFileURL(codexBuildPath).href);
  const codexDetectModule = await import(pathToFileURL(codexDetectBuildPath).href);
  const codexProfileModule = await import(pathToFileURL(codexProfileBuildPath).href);
  const codexStreamModule = await import(pathToFileURL(codexStreamBuildPath).href);
  if (SELECTED_SECTION === 'isolation') {
    await runCodexIsolationTests(
      codexModule,
      codexDetectModule,
      codexProfileModule,
      effectiveAuthorityModule,
      spawnEnvironmentModule,
      processProbeModule,
    );
    console.log('mcp-codex-adapter.test.js: PASS');
    return;
  }
  if (SELECTED_SECTION === 'auth') {
    runCodexAuthTests(codexDetectModule, codexProfileModule, effectiveAuthorityModule);
    console.log('mcp-codex-adapter.test.js: PASS');
    return;
  }
  if (SELECTED_SECTION === 'parser') {
    await runCodexParserTests(codexStreamModule);
    console.log('mcp-codex-adapter.test.js: PASS');
    return;
  }
  if (SELECTED_SECTION === null) {
    await runGenericProbeTests(processProbeModule, processTreeModule, spawnEnvironmentModule);
    await runGenericAuthorityTests(
      adapterModule,
      effectiveAuthorityModule,
      serveDelegationModule,
    );
    await runCodexIsolationTests(
      codexModule,
      codexDetectModule,
      codexProfileModule,
      effectiveAuthorityModule,
      spawnEnvironmentModule,
      processProbeModule,
    );
    runCodexAuthTests(codexDetectModule, codexProfileModule, effectiveAuthorityModule);
    await runCodexParserTests(codexStreamModule);
    console.log('mcp-codex-adapter.test.js: PASS');
    return;
  }
  throw new Error(`Unknown mcp-codex-adapter section: ${SELECTED_SECTION}`);
}

main().catch((error) => {
  console.error('mcp-codex-adapter.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
