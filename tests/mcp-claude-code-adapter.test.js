'use strict';

/**
 * Phase 60 Plan 01 -- retained Claude detection and closed spawn profile.
 *
 * No live CLI, provider authentication, model call, or browser is used.
 * Run: npm --prefix mcp run build && node tests/mcp-claude-code-adapter.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const adapterBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'adapter.js');
const compatibilityBuildPath = path.join(
  repoRoot,
  'mcp',
  'build',
  'agent-providers',
  'compatibility.js',
);
const claudeAdapterBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'claude-code.js');
const detectBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'claude-detect.js');
const profileBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'claude-profile.js');
const claudeAdapterSourcePath = path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'claude-code.ts');
const detectSourcePath = path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'claude-detect.ts');
const profileSourcePath = path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'claude-profile.ts');
const agentPath = path.join(repoRoot, 'mcp', 'ai', 'agents', 'fsb.json');

const nativeCandidate = Object.freeze({
  sourcePath: '/fixture/bin/claude',
  realPath: '/fixture/opt/claude-2.1.177',
});

function detectorDependencies(overrides = {}) {
  const probeCalls = [];
  let resolveCalls = 0;
  const dependencies = {
    platform: 'darwin',
    pathValue: '/fixture/bin',
    resolveBinary: async () => {
      resolveCalls += 1;
      return nativeCandidate;
    },
    resolveRealPath: async (value) => {
      if (value === nativeCandidate.sourcePath) return nativeCandidate.realPath;
      return value;
    },
    resolveWindowsShim: async () => null,
    probe: async (file, args, options) => {
      probeCalls.push({ file, args: [...args], options: { ...options } });
      return { stdout: 'Claude Code 2.1.177', stderr: '' };
    },
    ...overrides,
  };
  return {
    dependencies,
    probeCalls,
    getResolveCalls: () => resolveCalls,
  };
}

async function main() {
  assert.ok(fs.existsSync(agentPath), 'shipped FSB agent policy exists before profile tests');
  const shippedAgent = JSON.parse(fs.readFileSync(agentPath, 'utf8'));
  assert.equal(shippedAgent.name, 'fsb');
  assert.deepEqual(shippedAgent.tools, ['mcp__fsb']);
  assert.deepEqual(shippedAgent.disallowedTools, [
    'Bash',
    'Edit',
    'Write',
    'NotebookEdit',
    'WebFetch',
    'WebSearch',
  ]);
  assert.equal(shippedAgent.permissionMode, 'dontAsk');
  assert.equal(shippedAgent.maxTurns, 40);

  const detectModule = await import(pathToFileURL(detectBuildPath).href);
  const compatibilityModule = await import(pathToFileURL(compatibilityBuildPath).href);
  const profileModule = await import(pathToFileURL(profileBuildPath).href);
  const adapterModule = await import(pathToFileURL(adapterBuildPath).href);
  const claudeAdapterModule = await import(pathToFileURL(claudeAdapterBuildPath).href);
  const {
    CLAUDE_PROBE_OPTIONS,
    createClaudeCodeDetector,
  } = detectModule;
  const {
    classifyAdapterCompatibility,
    getAdapterCompatibilityContract,
  } = compatibilityModule;
  const {
    SERIALIZED_FSB_AGENTS,
    SHIPPED_FSB_AGENT_POLICY,
    buildClaudeSpawnSpec,
  } = profileModule;
  const { TASK_ONLY_CAPABILITIES } = adapterModule;
  const { createClaudeCodeAdapter } = claudeAdapterModule;

  const compatibilityRow = getAdapterCompatibilityContract('claude-code');
  assert.ok(compatibilityRow, 'the canonical compatibility row is available');
  assert.equal(compatibilityRow.profileVersion, '2.1.177');
  assert.deepEqual(CLAUDE_PROBE_OPTIONS, {
    timeout: 3000,
    windowsHide: true,
    maxBuffer: 65536,
    shell: false,
  });
  assert.ok(Object.isFrozen(CLAUDE_PROBE_OPTIONS));

  const supported = detectorDependencies();
  const detection = await createClaudeCodeDetector(supported.dependencies).detect();
  assert.deepEqual(detection, {
    installed: true,
    version: '2.1.177',
    authState: 'unknown',
    binary: {
      command: nativeCandidate.realPath,
      realPath: nativeCandidate.realPath,
      argvPrefix: [],
    },
    profileVersion: '2.1.177',
  });
  assert.ok(Object.isFrozen(detection));
  assert.ok(Object.isFrozen(detection.binary));
  assert.ok(Object.isFrozen(detection.binary.argvPrefix));
  assert.equal(supported.getResolveCalls(), 1, 'PATH candidate is resolved once');
  assert.deepEqual(supported.probeCalls, [{
    file: nativeCandidate.realPath,
    args: ['--version'],
    options: {
      timeout: 3000,
      windowsHide: true,
      maxBuffer: 65536,
      shell: false,
    },
  }], 'the retained native path is probed with fixed argv/options');

  const old = detectorDependencies({
    probe: async () => ({ stdout: 'Claude Code 2.1.176', stderr: '' }),
  });
  const oldDetection = await createClaudeCodeDetector(old.dependencies).detect();
  assert.equal(oldDetection.installed, false);
  assert.equal(oldDetection.version, '2.1.176');
  assert.deepEqual(oldDetection.binary, detection.binary, 'safe path is retained for local doctor output');
  assert.equal(oldDetection.diagnostic.code, 'version_unsupported');

  const newer = detectorDependencies({
    probe: async () => ({ stdout: 'Claude Code 2.1.178', stderr: '' }),
  });
  const newerDetection = await createClaudeCodeDetector(newer.dependencies).detect();
  assert.equal(newerDetection.installed, true, 'newer same-major evidence remains start eligible');
  assert.equal(newerDetection.version, '2.1.178');
  assert.equal(newerDetection.profileVersion, compatibilityRow.profileVersion);
  assert.deepEqual(newerDetection.binary, detection.binary);
  assert.equal(newerDetection.diagnostic, undefined);
  assert.deepEqual(
    classifyAdapterCompatibility('claude-code', newerDetection.version),
    {
      adapterId: 'claude-code',
      displayLabel: 'Claude Code',
      status: 'degraded',
      reason: 'newer_than_tested_range',
    },
  );

  const wrongMajor = detectorDependencies({
    probe: async () => ({ stdout: 'Claude Code 3.0.0', stderr: '' }),
  });
  const wrongMajorDetection = await createClaudeCodeDetector(wrongMajor.dependencies).detect();
  assert.equal(wrongMajorDetection.installed, false);
  assert.equal(wrongMajorDetection.version, '3.0.0');
  assert.deepEqual(wrongMajorDetection.binary, detection.binary);
  assert.equal(wrongMajorDetection.profileVersion, null);
  assert.equal(wrongMajorDetection.diagnostic.code, 'version_unsupported');

  const prerelease = detectorDependencies({
    probe: async () => ({ stdout: '2.1.177-rc.1', stderr: '' }),
  });
  assert.equal(
    (await createClaudeCodeDetector(prerelease.dependencies).detect()).installed,
    false,
    'a prerelease of the minimum stable version is rejected',
  );

  const unparseable = detectorDependencies({
    probe: async () => ({ stdout: 'Claude development build', stderr: '' }),
  });
  const unparseableDetection = await createClaudeCodeDetector(unparseable.dependencies).detect();
  assert.equal(unparseableDetection.installed, false);
  assert.equal(unparseableDetection.version, null);
  assert.deepEqual(unparseableDetection.binary, detection.binary);
  assert.equal(unparseableDetection.diagnostic.code, 'version_unparseable');
  assert.equal(JSON.stringify(unparseableDetection).includes('Claude development build'), false);

  const missingVersion = detectorDependencies({
    probe: async () => ({ stdout: '', stderr: '' }),
  });
  const missingVersionDetection = await createClaudeCodeDetector(missingVersion.dependencies).detect();
  assert.equal(missingVersionDetection.installed, false);
  assert.equal(missingVersionDetection.version, null);
  assert.deepEqual(missingVersionDetection.binary, detection.binary);
  assert.equal(missingVersionDetection.diagnostic.code, 'version_unparseable');

  const missing = detectorDependencies({ resolveBinary: async () => null });
  const missingDetection = await createClaudeCodeDetector(missing.dependencies).detect();
  assert.equal(missingDetection.installed, false);
  assert.equal(missingDetection.diagnostic.code, 'binary_missing');

  const probeSecret = 'provider_secret_probe_canary_71b831c9';
  const failedProbe = detectorDependencies({
    probe: async () => { throw new Error(probeSecret); },
  });
  const failedProbeDetection = await createClaudeCodeDetector(failedProbe.dependencies).detect();
  assert.equal(failedProbeDetection.installed, false);
  assert.deepEqual(failedProbeDetection.binary, detection.binary);
  assert.equal(failedProbeDetection.diagnostic.code, 'adapter_unavailable');
  assert.equal(JSON.stringify(failedProbeDetection).includes(probeSecret), false);

  let sourceChecks = 0;
  const changed = detectorDependencies({
    resolveRealPath: async (value) => {
      if (value === nativeCandidate.sourcePath) {
        sourceChecks += 1;
        return sourceChecks >= 2 ? '/fixture/opt/replaced-claude' : nativeCandidate.realPath;
      }
      return value;
    },
  });
  const changedDetection = await createClaudeCodeDetector(changed.dependencies).detect();
  assert.equal(changedDetection.installed, false);
  assert.equal(changedDetection.diagnostic.code, 'binary_changed');

  const windowsNativeCandidate = Object.freeze({
    sourcePath: 'C:\\fixture\\bin\\claude.exe',
    realPath: 'C:\\fixture\\bin\\claude.exe',
  });
  const windowsNative = detectorDependencies({
    platform: 'win32',
    resolveBinary: async () => windowsNativeCandidate,
    resolveRealPath: async (value) => value,
  });
  const windowsNativeDetection = await createClaudeCodeDetector(windowsNative.dependencies).detect();
  assert.equal(windowsNativeDetection.installed, true);
  assert.equal(windowsNativeDetection.binary.command, windowsNativeCandidate.realPath);

  const windowsShimCandidate = Object.freeze({
    sourcePath: 'C:\\fixture\\bin\\claude.cmd',
    realPath: 'C:\\fixture\\bin\\claude.cmd',
  });
  const rejectedShim = detectorDependencies({
    platform: 'win32',
    resolveBinary: async () => windowsShimCandidate,
    resolveRealPath: async (value) => value,
  });
  const rejectedShimDetection = await createClaudeCodeDetector(rejectedShim.dependencies).detect();
  assert.equal(rejectedShimDetection.installed, false);
  assert.equal(rejectedShimDetection.diagnostic.code, 'binary_unsafe');
  assert.equal(rejectedShim.probeCalls.length, 0, 'unsafe shim is never executed');

  const shimProbeCalls = [];
  const acceptedShim = detectorDependencies({
    platform: 'win32',
    resolveBinary: async () => windowsShimCandidate,
    resolveRealPath: async (value) => value,
    resolveWindowsShim: async () => ({
      verified: true,
      command: 'C:\\Program Files\\nodejs\\node.exe',
      realPath: 'C:\\Program Files\\nodejs\\node.exe',
      argvPrefix: ['C:\\fixture\\lib\\claude-cli.js'],
    }),
    probe: async (file, args, options) => {
      shimProbeCalls.push({ file, args: [...args], options: { ...options } });
      return { stdout: '2.1.177', stderr: '' };
    },
  });
  const acceptedShimDetection = await createClaudeCodeDetector(acceptedShim.dependencies).detect();
  assert.equal(acceptedShimDetection.installed, true);
  assert.deepEqual(shimProbeCalls[0], {
    file: 'C:\\Program Files\\nodejs\\node.exe',
    args: ['C:\\fixture\\lib\\claude-cli.js', '--version'],
    options: {
      timeout: 3000,
      windowsHide: true,
      maxBuffer: 65536,
      shell: false,
    },
  });

  const taskCanary = 'TASK_CANARY_71b831c9_$(touch pwned); --flag\nnext';
  const context = Object.freeze({
    adapterId: 'claude-code',
    detection,
    delegationId: 'delegation_71b831c9',
    runtimeFingerprint: 'fingerprint_71b831c9_fixed',
    cwd: '/fixture/workspace',
    privateMcpConfigPath: '/fixture/runtime/mcp-config.json',
    runtimeFiles: Object.freeze(['/fixture/runtime/mcp-config.json']),
  });
  const spec = buildClaudeSpawnSpec({ text: taskCanary }, context);
  assert.equal(spec.topology.kind, 'direct');
  const taskProcess = spec.topology.task;
  const exactArgv = [
    '-p',
    '--verbose',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--setting-sources', '',
    '--disable-slash-commands',
    '--no-chrome',
    '--strict-mcp-config',
    '--mcp-config', '/fixture/runtime/mcp-config.json',
    '--agents', SERIALIZED_FSB_AGENTS,
    '--agent', 'fsb',
    '--permission-mode', 'dontAsk',
    '--tools', '',
    '--allowedTools', 'mcp__fsb',
    '--disallowedTools', 'Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch',
    '--max-turns', '40',
    '--no-session-persistence',
  ];
  assert.deepEqual(taskProcess.argv, exactArgv, 'profile argv order and literal empty values are fixed');
  assert.equal(taskProcess.command, nativeCandidate.realPath, 'spawn spec retains the probed command');
  assert.equal(taskProcess.cwd, context.cwd);
  assert.deepEqual(taskProcess.privateFiles, [context.privateMcpConfigPath]);
  assert.deepEqual(taskProcess.fixedEnv, {
    FSB_AGENT_ADAPTER: 'claude-code',
    FSB_AGENT_PROFILE: '2.1.177',
    FSB_DELEGATION_ID: context.delegationId,
    FSB_AGENT_FINGERPRINT: context.runtimeFingerprint,
  });
  assert.equal(taskProcess.role, 'direct_task');
  assert.equal(taskProcess.stdin, 'task');
  assert.equal(taskProcess.stdout, 'agent_jsonl');
  assert.deepEqual(taskProcess.spawnSecretEnvBindings, []);
  assert.deepEqual(spec.attestations, []);
  assert.ok(Object.isFrozen(spec));
  assert.ok(Object.isFrozen(spec.topology));
  assert.ok(Object.isFrozen(taskProcess));
  assert.ok(Object.isFrozen(taskProcess.argv));
  assert.ok(Object.isFrozen(taskProcess.privateFiles));
  assert.ok(Object.isFrozen(taskProcess.fixedEnv));
  assert.equal(JSON.stringify(spec).includes(taskCanary), false, 'task canary is absent from all spawn metadata');
  for (const providerKey of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY']) {
    assert.equal(JSON.stringify(spec).includes(providerKey), false, `${providerKey} is absent`);
  }

  const serializedAgents = JSON.parse(SERIALIZED_FSB_AGENTS);
  assert.deepEqual(Object.keys(serializedAgents), ['fsb']);
  assert.deepEqual(serializedAgents.fsb, {
    description: shippedAgent.description,
    prompt: shippedAgent.prompt,
    tools: shippedAgent.tools,
    disallowedTools: shippedAgent.disallowedTools,
    permissionMode: shippedAgent.permissionMode,
    maxTurns: shippedAgent.maxTurns,
  }, 'serialized agent definition is derived only from the shipped static asset');
  assert.equal(
    JSON.stringify(serializedAgents).includes(taskCanary),
    false,
    'serialized static policy contains no task-derived value',
  );
  assert.deepEqual(
    Object.keys(serializedAgents.fsb).sort(),
    ['description', 'disallowedTools', 'maxTurns', 'permissionMode', 'prompt', 'tools'],
    'CLI agent definition excludes product metadata and dynamic fields',
  );
  assert.equal(SHIPPED_FSB_AGENT_POLICY.name, 'fsb');
  assert.ok(Object.isFrozen(SHIPPED_FSB_AGENT_POLICY));

  const retainedSpec = buildClaudeSpawnSpec({ text: 'Use the retained path.' }, context);
  assert.equal(
    retainedSpec.topology.task.command,
    nativeCandidate.realPath,
    'later PATH changes cannot alter the spec',
  );

  const degradedContext = Object.freeze({ ...context, detection: newerDetection });
  const degradedSpec = buildClaudeSpawnSpec({ text: 'Use a newer same-major CLI.' }, degradedContext);
  assert.equal(degradedSpec.profileVersion, compatibilityRow.profileVersion);
  assert.deepEqual(
    degradedSpec.topology.task.argv,
    exactArgv,
    'degraded start eligibility preserves fixed spawn policy',
  );

  assert.throws(
    () => buildClaudeSpawnSpec({ text: 'x'.repeat(65537) }, context),
    /safe byte limit/,
  );
  assert.throws(
    () => buildClaudeSpawnSpec({ text: '\ud800' }, context),
    /UTF-8 text/,
  );
  assert.throws(
    () => buildClaudeSpawnSpec({ text: 'valid task' }, { ...context, adapterId: 'Claude-Code' }),
    /canonical adapter id/,
  );

  const delegateCalls = {
    detect: 0,
    parse: [],
    kill: [],
  };
  const delegatedEvent = Object.freeze({
    type: 'diagnostic',
    sessionId: 'synthetic-session',
    payload: Object.freeze({ code: 'synthetic' }),
  });
  const delegatedIterable = Object.freeze({
    async *[Symbol.asyncIterator]() {
      yield delegatedEvent;
    },
  });
  const adapter = createClaudeCodeAdapter({
    detect: async () => {
      delegateCalls.detect += 1;
      return detection;
    },
    parseEvents: (stream) => {
      delegateCalls.parse.push(stream);
      return delegatedIterable;
    },
    kill: async (child, options) => {
      delegateCalls.kill.push({ child, options });
    },
  });

  assert.ok(Object.isFrozen(adapter));
  assert.deepEqual(
    Object.keys(adapter),
    ['detect', 'buildSpawn', 'parseEvents', 'kill', 'caps'],
    'concrete adapter exposes exactly the five contract methods in order',
  );
  assert.ok(Object.values(adapter).every((value) => typeof value === 'function'));

  assert.strictEqual(await adapter.detect(), detection);
  assert.equal(delegateCalls.detect, 1, 'detect delegates exactly once');

  const adapterSpec = await adapter.buildSpawn({ text: taskCanary }, context);
  assert.deepEqual(adapterSpec, spec, 'buildSpawn delegates to the closed profile builder');
  assert.equal(delegateCalls.detect, 1, 'buildSpawn does not re-detect or re-resolve PATH');
  assert.equal(JSON.stringify(adapterSpec).includes(taskCanary), false);

  const fakeStream = Readable.from([]);
  const parsedIterable = adapter.parseEvents(fakeStream);
  assert.strictEqual(parsedIterable, delegatedIterable, 'parseEvents returns the injected async iterable');
  const parsedEvents = [];
  for await (const event of parsedIterable) parsedEvents.push(event);
  assert.deepEqual(parsedEvents, [delegatedEvent]);
  assert.deepEqual(delegateCalls.parse, [fakeStream]);

  const supervisedChild = Object.freeze({
    pid: 41001,
    processGroupId: 41001,
    platform: 'darwin',
    closed: Promise.resolve({ code: 0, signal: null }),
  });
  const killOptions = Object.freeze({ grace: 1250 });
  await adapter.kill(supervisedChild, killOptions);
  assert.deepEqual(delegateCalls.kill, [{ child: supervisedChild, options: killOptions }]);

  assert.strictEqual(adapter.caps(), TASK_ONLY_CAPABILITIES);
  assert.deepEqual(adapter.caps(), {
    taskMode: true,
    chatMode: false,
    resume: false,
    serverMode: false,
  });

  await assert.rejects(
    () => adapter.buildSpawn({ text: 'x'.repeat(65537) }, context),
    /safe byte limit/,
  );
  await assert.rejects(
    () => adapter.buildSpawn(
      { text: 'valid task' },
      { ...context, detection: { ...detection, installed: false } },
    ),
    /supported retained detection/,
  );
  await assert.rejects(
    () => adapter.buildSpawn(
      { text: 'valid task' },
      { ...context, privateMcpConfigPath: 'relative-config.json' },
    ),
    /daemon-owned absolute runtime paths/,
  );
  await assert.rejects(
    () => adapter.buildSpawn({ text: 'valid task' }, { ...context, adapterId: 'Claude-Code' }),
    /canonical adapter id/,
  );

  const parserAdapter = createClaudeCodeAdapter({ kill: async () => {} });
  const driftInput = Readable.from([
    Buffer.from('{"type":"TOP_SECRET_SENTINEL"}\n', 'utf8'),
  ]);
  await assert.rejects(
    async () => {
      for await (const _event of parserAdapter.parseEvents(driftInput)) {
        // A drifted stream must never reach this body or fall back to another parser.
      }
    },
    (error) => {
      assert.equal(error.code, 'agent_protocol_drift');
      assert.equal(error.reason, 'unknown_event_type');
      assert.equal(error.eventIndex, 1);
      assert.equal(error.message.includes('TOP_SECRET_SENTINEL'), false);
      return true;
    },
  );

  assert.throws(
    () => createClaudeCodeAdapter({}),
    /tree-kill dependency/,
  );
  assert.throws(
    () => createClaudeCodeAdapter({ kill: async () => {}, detect: true }),
    /detection dependency must be callable/,
  );
  assert.throws(
    () => createClaudeCodeAdapter({ kill: async () => {}, parseEvents: true }),
    /parser dependency must be callable/,
  );

  const claudeAdapterSource = fs.readFileSync(claudeAdapterSourcePath, 'utf8');
  assert.doesNotMatch(claudeAdapterSource, /node:child_process/);
  assert.doesNotMatch(claudeAdapterSource, /\b(?:spawn|exec|execFile|fork)\s*\(/);
  assert.doesNotMatch(claudeAdapterSource, /shell\s*:/);

  const detectSource = fs.readFileSync(detectSourcePath, 'utf8');
  const profileSource = fs.readFileSync(profileSourcePath, 'utf8');
  const source = `${detectSource}\n${profileSource}\n${claudeAdapterSource}`;
  assert.match(source, /shell:\s*false/);
  assert.match(detectSource, /classifyAdapterCompatibility/);
  assert.match(profileSource, /compatibility\.js/);
  assert.doesNotMatch(detectSource, /CLAUDE_(?:MINIMUM|PROFILE)_VERSION/);
  assert.doesNotMatch(profileSource, /CLAUDE_(?:MINIMUM|PROFILE)_VERSION/);
  assert.doesNotMatch(`${detectSource}\n${profileSource}`, /2\.1\.177/);
  assert.doesNotMatch(`${detectSource}\n${profileSource}`, /minimumVersion|testedThroughVersion/);
  for (const forbiddenSource of [
    'shell: true',
    'cmd /c',
    '--bare',
    '--model',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
  ]) {
    assert.equal(source.includes(forbiddenSource), false, `provider source excludes ${forbiddenSource}`);
  }

  console.log('mcp-claude-code-adapter.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-claude-code-adapter.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
