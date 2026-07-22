'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
const spawnEnvironmentBuildPath = path.join(
  mcpBuildRoot,
  'agent-providers',
  'spawn-environment.js',
);

const SELECTED_SECTION = (() => {
  const offset = process.argv.indexOf('--section');
  return offset < 0 ? null : process.argv[offset + 1] || '';
})();

function ownedBuffersAreZero(result) {
  return result.stdout.every((byte) => byte === 0)
    && result.stderr.every((byte) => byte === 0);
}

async function runGenericProbeTests(processProbeModule, spawnEnvironmentModule) {
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

  await assert.rejects(
    runBoundedProcessProbe({
      ...descriptor(['-e', 'process.exit(0);']),
      environment: { PATH: process.env.PATH },
    }),
    (error) => error.code === 'invalid_descriptor',
    'an unbranded environment cannot cross the probe boundary',
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
  assert.equal(productionSource.includes('CODEX_ADAPTER_ID'), false);
  assert.equal(productionSource.includes('createCodexAdapter'), false);
}

async function main() {
  const processProbeModule = await import(pathToFileURL(processProbeBuildPath).href);
  const spawnEnvironmentModule = await import(pathToFileURL(spawnEnvironmentBuildPath).href);
  if (SELECTED_SECTION === 'generic-probe' || SELECTED_SECTION === null) {
    await runGenericProbeTests(processProbeModule, spawnEnvironmentModule);
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
