#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PassThrough, Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(repoRoot, 'mcp', 'build', 'agent-providers');
const fixturePath = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'agent-streams',
  'grok-build-1.0.4',
  'contract-stream.jsonl',
);

function buildUrl(name) {
  return pathToFileURL(path.join(buildRoot, name)).href;
}

function probeResult(stdout, stderr = '', exit = { code: 0, signal: null }) {
  const stdoutBytes = Buffer.from(stdout, 'utf8');
  const stderrBytes = Buffer.from(stderr, 'utf8');
  let zeroized = false;
  return {
    stdout: stdoutBytes,
    stderr: stderrBytes,
    exit: Object.freeze(exit),
    zeroize() {
      zeroized = true;
      stdoutBytes.fill(0);
      stderrBytes.fill(0);
    },
    get zeroized() { return zeroized; },
  };
}

function inspectDocument(cwd, configPath) {
  const cells = [
    ['cursor', 'skills'],
    ['cursor', 'rules'],
    ['cursor', 'agents'],
    ['cursor', 'mcps'],
    ['cursor', 'hooks'],
    ['cursor', 'sessions'],
    ['claude', 'skills'],
    ['claude', 'rules'],
    ['claude', 'agents'],
    ['claude', 'mcps'],
    ['claude', 'hooks'],
    ['claude', 'sessions'],
    ['codex', 'sessions'],
  ].map(([vendor, surface]) => ({ vendor, surface, enabled: false, source: 'env' }));
  return {
    grokVersion: '1.0.4',
    cwd,
    projectRoot: null,
    projectTrusted: true,
    projectInstructions: [],
    hooks: [],
    skills: [],
    plugins: [],
    marketplaces: [],
    mcpServers: [],
    lspServers: [],
    permissions: {
      sources: [`${configPath} (config)`],
      loaded: 1,
      managedSettingsExists: false,
      managedSettingsActive: false,
      skipped: [],
      mcpServerAllowlist: [],
      marketplaceAllowlist: [],
    },
    agents: ['general-purpose', 'explore', 'plan'].map((name) => ({
      name,
      source: { type: 'builtin' },
    })),
    configSources: { layers: [{ role: 'user', path: configPath }] },
    externalCompat: { remoteSettingsLoaded: false, cells },
  };
}

function initializeResponse(defaultAuthMethodId) {
  const authMethods = defaultAuthMethodId === 'cached_token'
    ? [
        {
          id: 'cached_token',
          name: 'cached_token',
          description: 'Cached token from ~/.grok/auth.json'
        },
        { id: 'grok.com', name: 'Grok', description: 'Sign in with Grok' }
      ]
    : [{ id: 'grok.com', name: 'Grok', description: 'Sign in with Grok' }];
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: 1,
      agentCapabilities: {
        mcpCapabilities: { http: true },
        sessionCapabilities: { close: {} },
      },
      authMethods,
      _meta: {
        defaultAuthMethodId,
        agentVersion: '1.0.4',
        mcpServers: [],
      },
    },
  };
}

function authenticationResponse() {
  return {
    jsonrpc: '2.0',
    id: 2,
    result: {
      _meta: {
        email: 'private@example.test',
        auth_mode: 'Oidc',
        team_id: 'private-team',
        team_name: null,
        is_zdr: false,
        team_role: null,
        coding_data_retention_opt_out: true,
        show_resolved_model: null,
        gate: null,
        subscription_tier: 'SuperGrok'
      }
    }
  };
}

function bootstrapNotifications() {
  return [
    {
      jsonrpc: '2.0',
      method: '_x.ai/settings/update',
      params: { subscription_tier_display: null }
    },
    {
      jsonrpc: '2.0',
      method: '_x.ai/announcements/update',
      params: { gen: 1, announcements: [] }
    },
    {
      jsonrpc: '2.0',
      method: '_x.ai/mcp/servers_updated',
      params: { mcpServers: [] }
    }
  ];
}

function transcript(...messages) {
  return `${messages.flat().map((message) => JSON.stringify(message)).join('\n')}\n`;
}

async function testPrivateRuntime(runtimeModule) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fsb-grok-runtime-test-'));
  try {
    const runtime = runtimeModule.createGrokBuildPrivateRuntime({ rootPath: root });
    const paths = await runtime.ensureBase();
    assert.equal(paths.home, path.join(root, 'home'));
    assert.equal(paths.grokHome, path.join(root, 'grok-home'));
    assert.equal(paths.authPath, path.join(root, 'grok-home', 'auth.json'));
    assert.equal(paths.agentProfilePath, path.join(root, 'grok-home', 'fsb-agent.md'));
    assert.equal((await fs.stat(paths.configPath)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(paths.agentProfilePath)).mode & 0o777, 0o600);
    assert.equal(
      await fs.readFile(paths.configPath, 'utf8'),
      runtimeModule.buildGrokBuildConfig(paths.grokHome),
    );
    // Grok caches its platform skills into the private home on first real use;
    // the config has to keep them out of `inspect` or isolation stops attesting.
    assert(runtimeModule.buildGrokBuildConfig(paths.grokHome).includes(
      `ignore = ["${path.join(paths.grokHome, 'bundled', 'skills')}"]`,
    ));
    assert.throws(() => runtimeModule.buildGrokBuildConfig('relative/grok-home'));
    assert.throws(() => runtimeModule.buildGrokBuildConfig('/tmp/grok"home'));
    assert.equal(await fs.readFile(paths.agentProfilePath, 'utf8'), runtimeModule.GROK_BUILD_AGENT_PROFILE);
    await runtime.attestBase();

    const run = await runtime.prepareRun('delegation_runtime_test');
    assert.deepEqual(await fs.readdir(run.cwd), []);
    const taskEnv = runtime.taskEnvironment(run);
    assert.equal(taskEnv.HOME, paths.home);
    assert.equal(taskEnv.GROK_HOME, paths.grokHome);
    assert.equal(taskEnv.XDG_CONFIG_HOME, path.join(paths.home, '.config'));
    assert.equal(taskEnv.XDG_DATA_HOME, path.join(paths.home, '.local', 'share'));
    assert.equal(taskEnv.XDG_STATE_HOME, path.join(paths.home, '.local', 'state'));
    assert.equal(taskEnv.XDG_CACHE_HOME, path.join(paths.home, '.cache'));
    // The extension is the sole browser-tab opener, so NO_OPEN_BROWSER belongs to
    // the OAuth environment only; a delegated task never reaches a login flow.
    assert.equal(Object.prototype.hasOwnProperty.call(taskEnv, 'NO_OPEN_BROWSER'), false);
    assert.equal(runtime.authEnvironment().NO_OPEN_BROWSER, '1');
    assert.equal(taskEnv.GROK_TRACE_UPLOAD, 'false');
    assert.equal(Object.values(taskEnv).includes('true'), false);
    assert(runtimeModule.buildGrokBuildConfig(paths.grokHome).includes(
      '[harness]\ndisable_workspace_teleport = true\ndisable_codebase_upload = true',
    ));
    assert(runtimeModule.buildGrokBuildConfig(paths.grokHome)
      .includes('[managed_mcps]\nenabled = false'));
    assert(runtimeModule.buildGrokBuildConfig(paths.grokHome)
      .includes('[workflows]\nenabled = false'));

    await fs.writeFile(paths.authPath, '{"private":"credential-sentinel"}\n', { mode: 0o644 });
    assert.equal(await runtime.secureAuthFile(), true);
    assert.equal((await fs.stat(paths.authPath)).mode & 0o777, 0o600);

    const normalAuthCanary = path.join(root, 'normal-grok-auth-canary.json');
    await fs.rm(paths.authPath);
    await fs.writeFile(normalAuthCanary, '{"normal":"must-remain-separate"}\n', { mode: 0o600 });
    await fs.link(normalAuthCanary, paths.authPath);
    await assert.rejects(runtime.secureAuthFile(), /grok_private_profile_unavailable/,
      'the private OAuth cache rejects hard links to another Grok profile');
    assert.equal(await fs.readFile(normalAuthCanary, 'utf8'),
      '{"normal":"must-remain-separate"}\n');

    const sessionId = '00000000-0000-4000-8000-000000000010';
    await runtime.recordSession('delegation_runtime_test', sessionId);
    assert.deepEqual(await runtime.pendingSessions(), [{
      delegationId: 'delegation_runtime_test',
      sessionId,
    }]);
    await runtime.clearSession('delegation_runtime_test', sessionId);
    assert.deepEqual(await runtime.pendingSessions(), []);
    await runtime.removeRun('delegation_runtime_test');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function testEnvironment(environmentModule) {
  const environment = environmentModule.buildSanitizedGrokEnvironment({
    PATH: '/usr/bin',
    XAI_API_KEY: 'XAI_SECRET_SENTINEL',
    GROK_API_KEY: 'GROK_SECRET_SENTINEL',
    GROK_BASE_URL: 'https://evil.invalid',
    ANTHROPIC_API_KEY: 'ANTHROPIC_SECRET_SENTINEL',
    HTTPS_PROXY: 'https://proxy.invalid',
    Http_Proxy: 'https://mixed-proxy.invalid',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.invalid',
    Xdg_Config_Home: '/ambient/config',
    Codex_Home: '/ambient/codex',
    Cursor_Plugin_Path: '/ambient/cursor-plugin',
  }, {
    HOME: '/private/fsb/home',
    GROK_HOME: '/private/fsb/grok-home',
    XDG_CONFIG_HOME: '/private/fsb/home/.config',
    GROK_TELEMETRY_ENABLED: 'false',
  });
  assert.equal(environment.PATH, '/usr/bin');
  assert.equal(environment.HOME, '/private/fsb/home');
  assert.equal(environment.GROK_HOME, '/private/fsb/grok-home');
  assert.equal(environment.XDG_CONFIG_HOME, '/private/fsb/home/.config');
  assert.equal(environment.GROK_TELEMETRY_ENABLED, 'false');
  const serialized = JSON.stringify(environment);
  for (const sentinel of [
    'XAI_SECRET_SENTINEL',
    'GROK_SECRET_SENTINEL',
    'evil.invalid',
    'ANTHROPIC_SECRET_SENTINEL',
    'proxy.invalid',
    'mixed-proxy.invalid',
    'collector.invalid',
    '/ambient/config',
    '/ambient/codex',
    '/ambient/cursor-plugin',
  ]) assert.equal(serialized.includes(sentinel), false, `${sentinel} is stripped`);

  // Only process.env itself is allowed to carry platform-owned names such as
  // ProgramFiles(x86) or npm's npm_package_bin_*, so the real daemon
  // environment is the only input that reaches the removal pass with one. It
  // must be dropped, never turned into a thrown environment contract that
  // reports every Grok surface as adapter_unavailable.
  const platformOwnedKey = 'ProgramFiles(x86)';
  const previousPlatformOwned = process.env[platformOwnedKey];
  process.env[platformOwnedKey] = 'C:\\Program Files (x86)';
  try {
    const platformEnvironment = environmentModule.buildSanitizedGrokEnvironment(process.env, {
      HOME: '/private/fsb/home',
      GROK_HOME: '/private/fsb/grok-home',
    });
    assert.equal(Object.hasOwn(platformEnvironment, platformOwnedKey), false,
      'platform-owned environment names are dropped from the closed Grok profile');
    assert.equal(platformEnvironment.HOME, '/private/fsb/home');
    assert.equal(platformEnvironment.GROK_HOME, '/private/fsb/grok-home');
  } finally {
    if (previousPlatformOwned === undefined) delete process.env[platformOwnedKey];
    else process.env[platformOwnedKey] = previousPlatformOwned;
  }
}

async function testDetector(detectorModule) {
  const root = '/private/fsb/grok-test';
  const run = { runDirectory: `${root}/runs/probe`, cwd: `${root}/runs/probe/cwd` };
  const configPath = `${root}/grok-home/config.toml`;
  const runtime = {
    paths: {
      root,
      home: `${root}/home`,
      grokHome: `${root}/grok-home`,
      runsRoot: `${root}/runs`,
      configPath,
      authPath: `${root}/grok-home/auth.json`,
      agentProfilePath: `${root}/fsb-agent.md`,
      sessionJournalPath: `${root}/sessions.json`,
    },
    async ensureBase() {},
    async prepareRun() { return run; },
    async removeRun() {},
    taskEnvironment() { return {}; },
    authEnvironment() { return { HOME: `${root}/home`, GROK_HOME: `${root}/grok-home` }; },
    async secureAuthFile() { return true; },
    async pendingSessions() { return []; },
    async recordSession() {},
    async clearSession() {},
  };
  const descriptors = [];
  const outputs = [
    probeResult('grok 1.0.4\n'),
    probeResult(JSON.stringify(inspectDocument(run.cwd, configPath))),
    probeResult('[]'),
    probeResult('[]'),
    probeResult(transcript(initializeResponse('cached_token'), bootstrapNotifications())),
    probeResult(transcript(
      initializeResponse('cached_token'),
      authenticationResponse(),
      bootstrapNotifications()[2]
    )),
  ];
  const detector = detectorModule.createGrokBuildDetector({
    platform: 'linux',
    pathValue: '/fixture/bin',
    sourceEnv: { PATH: '/fixture/bin', XAI_API_KEY: 'SECRET_SENTINEL' },
    runtime,
    mintProbeId: () => 'probe_0000000000000001',
    resolveBinary: async () => ({
      sourcePath: '/fixture/bin/grok',
      realPath: '/fixture/bin/grok-1.0.4',
    }),
    resolveRealPath: async (value) => value === '/fixture/bin/grok'
      ? '/fixture/bin/grok-1.0.4'
      : value,
    probe: async (descriptor) => {
      descriptors.push(descriptor);
      const result = outputs.shift();
      assert.ok(result, 'detector issues only the fixed probe sequence');
      return result;
    },
  });
  const detected = await detector.detect();
  assert.equal(detected.installed, true);
  assert.equal(detected.version, '1.0.4');
  assert.equal(detected.authState, 'oauth');
  assert.equal(detected.profileVersion, '1.0.4');
  assert.equal(outputs.length, 0);
  assert.deepEqual(descriptors.map((value) => value.argv.slice(-3)), [
    ['--version'],
    ['inspect', '--json'],
    ['mcp', 'list', '--json'],
    ['plugin', 'list', '--json'],
    ['--agent-profile', runtime.paths.agentProfilePath, 'stdio'],
    ['--agent-profile', runtime.paths.agentProfilePath, 'stdio'],
  ]);
  for (const descriptor of descriptors) {
    assert.equal(JSON.stringify(descriptor.environment).includes('SECRET_SENTINEL'), false);
  }
  const authProbeRequests = Buffer.from(descriptors.at(-1).stdinBytes)
    .toString('utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(authProbeRequests.map((request) => request.method), [
    'initialize',
    'authenticate',
  ]);
  assert.equal(authProbeRequests[1].params.methodId, 'cached_token');
  assert.equal(JSON.stringify(detected).includes('private@example.test'), false,
    'ACP account metadata never enters detection evidence');

  const windowsOutputs = [
    probeResult('grok 1.0.4\r\n'),
    probeResult(JSON.stringify(inspectDocument(run.cwd, configPath))),
    probeResult('[]'),
    probeResult('[]'),
    probeResult(`${JSON.stringify(initializeResponse(null))}\r\n`),
  ];
  const windowsDetector = detectorModule.createGrokBuildDetector({
    platform: 'win32',
    runtime,
    mintProbeId: () => 'probe_0000000000000005',
    resolveBinary: async () => ({
      sourcePath: 'C:\\fixture\\bin\\grok.exe',
      realPath: 'C:\\fixture\\versions\\grok-1.0.4.exe',
    }),
    resolveRealPath: async (value) => value === 'C:\\fixture\\bin\\grok.exe'
      ? 'C:\\fixture\\versions\\grok-1.0.4.exe'
      : value,
    probe: async () => windowsOutputs.shift(),
  });
  const windowsDetection = await windowsDetector.detect();
  assert.equal(windowsDetection.installed, true);
  assert.equal(windowsDetection.authState, 'unauthenticated');
  assert.equal(windowsDetection.binary.command, 'C:\\fixture\\versions\\grok-1.0.4.exe');
  assert.equal(windowsOutputs.length, 0, 'Windows grok.exe uses the same bounded probe profile');

  const missing = detectorModule.createGrokBuildDetector({
    runtime,
    resolveBinary: async () => null,
  });
  assert.deepEqual(await missing.detect(), {
    installed: false,
    version: null,
    authState: 'unknown',
    binary: null,
    profileVersion: null,
    diagnostic: {
      code: 'binary_missing',
      message: 'Grok Build executable was not found',
    },
  });

  const unsafe = detectorModule.createGrokBuildDetector({
    platform: 'linux',
    runtime,
    resolveBinary: async () => ({ sourcePath: 'grok', realPath: '/fixture/grok' }),
  });
  assert.equal((await unsafe.detect()).diagnostic.code, 'binary_unsafe');

  const malformedVersion = detectorModule.createGrokBuildDetector({
    platform: 'linux',
    runtime,
    mintProbeId: () => 'probe_0000000000000006',
    resolveBinary: async () => ({
      sourcePath: '/fixture/bin/grok',
      realPath: '/fixture/bin/grok-1.0.4',
    }),
    resolveRealPath: async (value) => value === '/fixture/bin/grok'
      ? '/fixture/bin/grok-1.0.4'
      : value,
    probe: async () => probeResult('grok unknown\n'),
  });
  assert.equal((await malformedVersion.detect()).diagnostic.code, 'version_unparseable');

  let sourceIdentityChecks = 0;
  const changed = detectorModule.createGrokBuildDetector({
    platform: 'linux',
    runtime,
    mintProbeId: () => 'probe_0000000000000007',
    resolveBinary: async () => ({
      sourcePath: '/fixture/bin/grok',
      realPath: '/fixture/bin/grok-1.0.4',
    }),
    resolveRealPath: async (value) => {
      if (value !== '/fixture/bin/grok') return value;
      sourceIdentityChecks += 1;
      return sourceIdentityChecks === 1
        ? '/fixture/bin/grok-1.0.4'
        : '/fixture/bin/grok-replaced';
    },
    probe: async () => probeResult('grok 1.0.4\n'),
  });
  assert.equal((await changed.detect()).diagnostic.code, 'binary_changed');

  const malformedAcpOutputs = [
    probeResult('grok 1.0.4\n'),
    probeResult(JSON.stringify(inspectDocument(run.cwd, configPath))),
    probeResult('[]'),
    probeResult('[]'),
    probeResult(`${JSON.stringify({
      ...initializeResponse(null),
      result: { ...initializeResponse(null).result, protocolVersion: 2 },
    })}\n`),
  ];
  const malformedAcp = detectorModule.createGrokBuildDetector({
    platform: 'linux',
    runtime,
    mintProbeId: () => 'probe_0000000000000002',
    resolveBinary: async () => ({
      sourcePath: '/fixture/bin/grok',
      realPath: '/fixture/bin/grok-1.0.4',
    }),
    resolveRealPath: async (value) => value === '/fixture/bin/grok'
      ? '/fixture/bin/grok-1.0.4'
      : value,
    probe: async () => malformedAcpOutputs.shift(),
  });
  const malformedAcpDetection = await malformedAcp.detect();
  assert.equal(malformedAcpDetection.installed, false);
  assert.equal(malformedAcpDetection.diagnostic.code, 'adapter_unavailable');
  assert.equal(malformedAcpOutputs.length, 0,
    'malformed ACP initialization fails closed after the fixed probe sequence');

  const refreshFailureOutputs = [
    probeResult('grok 1.0.4\n'),
    probeResult(JSON.stringify(inspectDocument(run.cwd, configPath))),
    probeResult('[]'),
    probeResult('[]'),
    probeResult(transcript(initializeResponse('cached_token'), bootstrapNotifications())),
    probeResult(`${JSON.stringify(initializeResponse('cached_token'))}\n${JSON.stringify({
      jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'expired' },
    })}\n`),
  ];
  const refreshFailure = detectorModule.createGrokBuildDetector({
    platform: 'linux',
    runtime,
    mintProbeId: () => 'probe_0000000000000008',
    resolveBinary: async () => ({
      sourcePath: '/fixture/bin/grok',
      realPath: '/fixture/bin/grok-1.0.4',
    }),
    resolveRealPath: async (value) => value === '/fixture/bin/grok'
      ? '/fixture/bin/grok-1.0.4'
      : value,
    probe: async () => refreshFailureOutputs.shift(),
  });
  const refreshFailureDetection = await refreshFailure.detect();
  assert.equal(refreshFailureDetection.installed, true);
  assert.equal(refreshFailureDetection.authState, 'unknown');
  assert.equal(refreshFailureOutputs.length, 0,
    'expired cached OAuth fails closed without starting a session or prompt');

  const staleCacheOutputs = [
    probeResult('grok 1.0.4\n'),
    probeResult(JSON.stringify(inspectDocument(run.cwd, configPath))),
    probeResult('[]'),
    probeResult('[]'),
    probeResult(''),
  ];
  const staleCache = detectorModule.createGrokBuildDetector({
    platform: 'linux',
    runtime,
    mintProbeId: () => 'probe_0000000000000009',
    resolveBinary: async () => ({
      sourcePath: '/fixture/bin/grok',
      realPath: '/fixture/bin/grok-1.0.4',
    }),
    resolveRealPath: async (value) => value === '/fixture/bin/grok'
      ? '/fixture/bin/grok-1.0.4'
      : value,
    probe: async () => staleCacheOutputs.shift(),
  });
  const staleCacheDetection = await staleCache.detect();
  assert.equal(staleCacheDetection.installed, true);
  assert.equal(staleCacheDetection.authState, 'unauthenticated');
  assert.equal(staleCacheOutputs.length, 0,
    'a secured stale OAuth cache with the pinned empty transcript can recover through login');

  const unexplainedEmptyOutputs = [
    probeResult('grok 1.0.4\n'),
    probeResult(JSON.stringify(inspectDocument(run.cwd, configPath))),
    probeResult('[]'),
    probeResult('[]'),
    probeResult(''),
  ];
  const unexplainedEmpty = detectorModule.createGrokBuildDetector({
    platform: 'linux',
    runtime: { ...runtime, async secureAuthFile() { return false; } },
    mintProbeId: () => 'probe_0000000000000010',
    resolveBinary: async () => ({
      sourcePath: '/fixture/bin/grok',
      realPath: '/fixture/bin/grok-1.0.4',
    }),
    resolveRealPath: async (value) => value === '/fixture/bin/grok'
      ? '/fixture/bin/grok-1.0.4'
      : value,
    probe: async () => unexplainedEmptyOutputs.shift(),
  });
  const unexplainedEmptyDetection = await unexplainedEmpty.detect();
  assert.equal(unexplainedEmptyDetection.installed, false);
  assert.equal(unexplainedEmptyDetection.diagnostic.code, 'adapter_unavailable');
  assert.equal(unexplainedEmptyOutputs.length, 0,
    'an empty ACP transcript without a secured OAuth cache still fails closed');

  const unsupported = detectorModule.createGrokBuildDetector({
    platform: 'linux',
    runtime,
    mintProbeId: () => 'probe_0000000000000003',
    resolveBinary: async () => ({
      sourcePath: '/fixture/bin/grok',
      realPath: '/fixture/bin/grok-1.0.5',
    }),
    resolveRealPath: async (value) => value === '/fixture/bin/grok'
      ? '/fixture/bin/grok-1.0.5'
      : value,
    probe: async () => probeResult('grok 1.0.5\n'),
  });
  const unsupportedDetection = await unsupported.detect();
  assert.equal(unsupportedDetection.installed, false);
  assert.equal(unsupportedDetection.version, '1.0.5');
  assert.equal(unsupportedDetection.diagnostic.code, 'version_unsupported');

  const duplicateCellDocument = inspectDocument(run.cwd, configPath);
  duplicateCellDocument.externalCompat.cells[12] = {
    ...duplicateCellDocument.externalCompat.cells[0],
  };
  const duplicateCellOutputs = [
    probeResult('grok 1.0.4\n'),
    probeResult(JSON.stringify(duplicateCellDocument)),
  ];
  const duplicateCells = detectorModule.createGrokBuildDetector({
    platform: 'linux',
    runtime,
    mintProbeId: () => 'probe_0000000000000004',
    resolveBinary: async () => ({
      sourcePath: '/fixture/bin/grok',
      realPath: '/fixture/bin/grok-1.0.4',
    }),
    resolveRealPath: async (value) => value === '/fixture/bin/grok'
      ? '/fixture/bin/grok-1.0.4'
      : value,
    probe: async () => duplicateCellOutputs.shift(),
  });
  const duplicateCellDetection = await duplicateCells.detect();
  assert.equal(duplicateCellDetection.installed, false);
  assert.equal(duplicateCellDetection.diagnostic.code, 'adapter_unavailable');
  assert.equal(duplicateCellOutputs.length, 0,
    'duplicated compatibility cells fail the exact authority-set check');
}

async function testAdapterSpawn(adapterModule) {
  let attestations = 0;
  const root = '/private/fsb/grok-spawn';
  const runtime = {
    paths: {
      root,
      home: `${root}/home`,
      grokHome: `${root}/grok-home`,
      runsRoot: `${root}/runs`,
      configPath: `${root}/grok-home/config.toml`,
      authPath: `${root}/grok-home/auth.json`,
      agentProfilePath: `${root}/grok-home/fsb-agent.md`,
      sessionJournalPath: `${root}/sessions.json`,
    },
    async ensureBase() {},
    async attestBase() { attestations += 1; },
    async prepareRun() {},
    async removeRun() {},
    taskEnvironment() {
      return Object.freeze({
        HOME: `${root}/home`,
        GROK_HOME: `${root}/grok-home`,
        NO_OPEN_BROWSER: '1',
      });
    },
    authEnvironment() { return {}; },
    async secureAuthFile() { return true; },
    async pendingSessions() { return []; },
    async recordSession() {},
    async clearSession() {},
  };
  const binary = Object.freeze({
    command: '/fixture/grok',
    realPath: '/fixture/grok',
    argvPrefix: Object.freeze([]),
  });
  const adapter = adapterModule.createGrokBuildAdapter({
    runtime,
    detect: async () => ({
      installed: true,
      version: '1.0.4',
      authState: 'oauth',
      binary,
      profileVersion: '1.0.4',
    }),
    async kill() {},
  });
  const task = '/goal TASK_TEXT_SENTINEL';
  const spec = await adapter.buildSpawn({ text: task }, {
    purpose: 'delegation',
    adapterId: 'grok-build',
    detection: await adapter.detect(),
    delegationId: 'delegation_spawn_test',
    runtimeFingerprint: 'runtime_fingerprint_0001',
    cwd: `${root}/runs/delegation_spawn_test/cwd`,
    privateMcpConfigPath: '/private/fsb/mcp.json',
    runtimeFiles: Object.freeze(['/private/fsb/mcp.json']),
  });
  assert.equal(attestations, 1, 'spawn materializes and hashes the private profile once');
  assert.equal(spec.topology.kind, 'direct');
  assert.equal(spec.topology.task.stdin, 'acp_jsonrpc');
  assert.equal(spec.topology.task.stdout, 'acp_jsonrpc');
  assert.deepEqual(spec.topology.task.argv, [
    '--tools', 'mcp',
    '--permission-mode', 'dontAsk',
    '--disable-web-search',
    '--no-memory',
    '--no-subagents',
    '--no-plan',
    '--sandbox', 'strict',
    'agent',
    '--no-leader',
    '--agent-profile', `${root}/grok-home/fsb-agent.md`,
    'stdio',
  ]);
  assert.equal(spec.attestations.length, 3);
  assert.equal(JSON.stringify(spec).includes(task), false,
    'task text stays out of the Grok spawn specification');
}

async function testAcp(acpModule) {
  const fixture = await fs.readFile(fixturePath);
  const fixtureLines = fixture.toString('utf8').trim().split('\n');
  const stdin = new PassThrough();
  const writes = [];
  stdin.on('data', (chunk) => writes.push(Buffer.from(chunk)));
  const events = [];
  const sessions = [];
  const deleted = [];
  const task = '/always-approve\nClick the synthetic button';
  const controller = acpModule.createGrokBuildAcpController({
    stdin,
    stdout: Readable.from([fixture]),
    task,
    cwd: '/private/fsb/run/cwd',
    endpoint: 'http://127.0.0.1:7225/mcp',
    onEvent: (event) => events.push(event),
    recordSession: async (sessionId) => sessions.push(sessionId),
    deleteSession: async (sessionId) => deleted.push(sessionId),
  });
  const result = await controller.run();
  await new Promise((resolve) => setImmediate(resolve));
  // The two catalog-lookup frames surface as diagnostics, never as browser
  // actions; only the use_tool invocation becomes a tool_use.
  assert.deepEqual(events.map((event) => event.type), [
    'init',
    'assistant_delta',
    'diagnostic',
    'diagnostic',
    'tool_use',
    'diagnostic',
    'tool_result',
    'assistant_delta',
    'assistant',
  ]);
  assert.equal(result.type, 'result');
  assert.equal(result.payload.stop_reason, 'end_turn');
  assert.deepEqual(sessions, ['00000000-0000-4000-8000-000000000001']);
  assert.deepEqual(deleted, sessions);
  const requests = Buffer.concat(writes).toString('utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(requests.map((request) => request.method), [
    'initialize',
    'authenticate',
    'session/new',
    'session/prompt',
    'session/close',
  ]);
  assert.equal(requests[1].params.methodId, 'cached_token');
  assert.deepEqual(requests[2].params.mcpServers, [{
    name: 'fsb',
    type: 'http',
    url: 'http://127.0.0.1:7225/mcp',
    headers: [],
  }]);
  const prompt = requests[3].params.prompt[0].text;
  assert.match(prompt, /^FSB_BROWSER_TASK_DATA_V1\n/);
  assert.match(prompt, /BEGIN_FSB_BROWSER_TASK_DATA\n\/always-approve/);
  assert.match(prompt, /END_FSB_BROWSER_TASK_DATA$/);
  assert.equal(JSON.stringify(requests.slice(0, 3)).includes(task), false,
    'task bytes appear only in the ACP prompt envelope');

  // Retarget the gateway at another server's tool: the fsb-only rule now lives on
  // use_tool's tool_name, so this has to fail closed without leaking the task.
  const foreignFixture = fixture.toString('utf8').replaceAll(
    'fsb__list_tabs',
    'foreign__shell',
  );
  const foreignController = acpModule.createGrokBuildAcpController({
    stdin: new PassThrough(),
    stdout: Readable.from([foreignFixture]),
    task: '/workflow',
    cwd: '/private/fsb/run/cwd',
    endpoint: 'http://127.0.0.1:7225/mcp',
    onEvent() {},
    async recordSession() {},
    async deleteSession() {},
  });
  await assert.rejects(foreignController.run(), (error) => {
    assert.equal(error.code, 'agent_protocol_drift');
    assert.equal(error.reason, 'configuration_surface');
    assert.equal(JSON.stringify(error).includes('/workflow'), false);
    return true;
  });

  for (const slashTask of ['/deep-research investigate', '/workflow run', '/goal own the browser']) {
    const slashStdin = new PassThrough();
    const slashWrites = [];
    slashStdin.on('data', (chunk) => slashWrites.push(Buffer.from(chunk)));
    const slashController = acpModule.createGrokBuildAcpController({
      stdin: slashStdin,
      stdout: Readable.from([fixture]),
      task: slashTask,
      cwd: '/private/fsb/run/cwd',
      endpoint: 'http://127.0.0.1:7225/mcp',
      onEvent() {},
      async recordSession() {},
      async deleteSession() {},
    });
    await slashController.run();
    await new Promise((resolve) => setImmediate(resolve));
    const slashRequests = Buffer.concat(slashWrites).toString('utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(slashRequests.map((request) => request.method), [
      'initialize', 'authenticate', 'session/new', 'session/prompt', 'session/close',
    ]);
    assert.match(slashRequests[3].params.prompt[0].text,
      new RegExp(`BEGIN_FSB_BROWSER_TASK_DATA\\n${slashTask.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }

  const hiddenSentinel = 'OAUTH_THOUGHT_SENTINEL';
  const hiddenLines = [...fixtureLines];
  const firstAssistantIndex = hiddenLines
    .findIndex((line) => line.includes('agent_message_chunk'));
  hiddenLines.splice(firstAssistantIndex, 0,
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: '00000000-0000-4000-8000-000000000001',
        update: {
          sessionUpdate: 'agent_thought_chunk',
          content: { type: 'text', text: hiddenSentinel },
        },
      },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: '00000000-0000-4000-8000-000000000001',
        update: {
          sessionUpdate: 'user_message_chunk',
          content: { type: 'text', text: '/always-approve' },
        },
      },
    }),
  );
  const hiddenEvents = [];
  const hiddenController = acpModule.createGrokBuildAcpController({
    stdin: new PassThrough(),
    stdout: Readable.from([`${hiddenLines.join('\n')}\n`]),
    task: 'safe task',
    cwd: '/private/fsb/run/cwd',
    endpoint: 'http://127.0.0.1:7225/mcp',
    onEvent: (event) => hiddenEvents.push(event),
    async recordSession() {},
    async deleteSession() {},
  });
  await hiddenController.run();
  assert.equal(JSON.stringify(hiddenEvents).includes(hiddenSentinel), false,
    'raw thought chunks never enter normalized FSB events');
  assert.equal(JSON.stringify(hiddenEvents).includes('/always-approve'), false,
    'echoed user chunks never enter normalized FSB events');

  async function expectDrift(lines, reason, label) {
    const driftController = acpModule.createGrokBuildAcpController({
      stdin: new PassThrough(),
      stdout: Readable.from([`${lines.join('\n')}\n`]),
      task: 'safe task',
      cwd: '/private/fsb/run/cwd',
      endpoint: 'http://127.0.0.1:7225/mcp',
      onEvent() {},
      async recordSession() {},
      async deleteSession() {},
    });
    await assert.rejects(driftController.run(), (error) => {
      assert.equal(error.code, 'agent_protocol_drift', `${label} has the drift error code`);
      assert.equal(error.reason, reason, `${label} has the pinned drift reason`);
      return true;
    });
  }

  const duplicateResponse = [...fixtureLines];
  const authResponseIndex = duplicateResponse.findIndex((line) => line.includes('"id":2'));
  duplicateResponse[authResponseIndex] = duplicateResponse[authResponseIndex]
    .replace('"id":2', '"id":1');
  await expectDrift(duplicateResponse, 'duplicate_id', 'duplicate response id');

  const unknownNotification = [...fixtureLines];
  unknownNotification.splice(authResponseIndex, 0, JSON.stringify({
    jsonrpc: '2.0',
    method: '_x.ai/foreign/update',
    params: {},
  }));
  await expectDrift(unknownNotification, 'unknown_event_type', 'unknown ACP notification');

  const unknownUpdate = [...fixtureLines];
  const assistantUpdateIndex = unknownUpdate.findIndex((line) => line.includes('agent_message_chunk'));
  unknownUpdate[assistantUpdateIndex] = unknownUpdate[assistantUpdateIndex]
    .replace('agent_message_chunk', 'foreign_update');
  await expectDrift(unknownUpdate, 'unknown_event_type', 'unknown ACP update');

  // Readiness is proven by mcp/server_status, not by a populated servers_updated:
  // grok only ever sends that one empty, ahead of session/new.
  const missingMcpConfirmation = fixtureLines
    .filter((line) => !line.includes('x.ai/mcp/server_status'));
  await expectDrift(missingMcpConfirmation, 'configuration_surface', 'missing MCP server status');

  const mcpStatusIndex = fixtureLines.findIndex((line) => line.includes('x.ai/mcp/server_status'));

  const unavailableMcp = [...fixtureLines];
  unavailableMcp[mcpStatusIndex] = unavailableMcp[mcpStatusIndex]
    .replace('"status":"ready"', '"status":"unavailable"')
    .replace('"reason":"initialized"', '"reason":"handshake_failed"');
  await expectDrift(unavailableMcp, 'configuration_surface', 'unavailable MCP server');

  const foreignMcpStatus = [...fixtureLines];
  foreignMcpStatus[mcpStatusIndex] = foreignMcpStatus[mcpStatusIndex]
    .replace('"name":"fsb"', '"name":"foreign"');
  await expectDrift(foreignMcpStatus, 'configuration_surface', 'foreign MCP server status');

  const remoteMcpStatus = [...fixtureLines];
  remoteMcpStatus[mcpStatusIndex] = remoteMcpStatus[mcpStatusIndex]
    .replace('"source":"local"', '"source":"remote"');
  await expectDrift(remoteMcpStatus, 'configuration_surface', 'remote MCP server status');

  const foreignMcp = [...fixtureLines];
  foreignMcp.splice(authResponseIndex, 0, JSON.stringify({
    jsonrpc: '2.0',
    method: '_x.ai/mcp/servers_updated',
    params: { mcpServers: [{ name: 'foreign' }] },
  }));
  await expectDrift(foreignMcp, 'configuration_surface', 'foreign MCP server update');

  // grok announces the session id in notifications before session/new returns it;
  // the response has to agree with what the stream already claimed.
  const contradictedSessionId = [...fixtureLines];
  const contradictedIndex = contradictedSessionId.findIndex((line) => line.includes('"id":3'));
  contradictedSessionId[contradictedIndex] = contradictedSessionId[contradictedIndex]
    .replace('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000beef');
  await expectDrift(contradictedSessionId, 'session_mismatch', 'session id contradicted by the response');

  // The gateway is the only route to an MCP tool, so the roster of built-ins it
  // may expose is exactly two; anything else is a foreign tool surface.
  const foreignBuiltin = [...fixtureLines];
  const searchCallIndex = foreignBuiltin.findIndex((line) => line.includes('"search_tool"'));
  foreignBuiltin[searchCallIndex] = foreignBuiltin[searchCallIndex]
    .replaceAll('"search_tool"', '"run_terminal_command"');
  await expectDrift(foreignBuiltin, 'configuration_surface', 'a non-gateway built-in tool');

  // A catalog lookup must never be mistaken for a browser action.
  const discoveryAsInvocation = [...fixtureLines];
  const useCallIndex = discoveryAsInvocation.findIndex((line) => line.includes('"use_tool"'));
  discoveryAsInvocation[useCallIndex] = discoveryAsInvocation[useCallIndex]
    .replace('"tool_name":"fsb__list_tabs"', '"tool_name":"list_tabs"');
  await expectDrift(discoveryAsInvocation, 'configuration_surface', 'an unprefixed gateway target');

  const crossSessionMcpStatus = [...fixtureLines];
  crossSessionMcpStatus[mcpStatusIndex] = crossSessionMcpStatus[mcpStatusIndex]
    .replace('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000dead');
  await expectDrift(crossSessionMcpStatus, 'session_mismatch', 'MCP status for another session');

  const malformedJson = [...fixtureLines];
  malformedJson[assistantUpdateIndex] = '{"jsonrpc":';
  await expectDrift(malformedJson, 'invalid_json', 'malformed JSON-RPC');

  const oversizedController = acpModule.createGrokBuildAcpController({
    stdin: new PassThrough(),
    stdout: Readable.from([Buffer.alloc((256 * 1024) + 1, 0x78), Buffer.from('\n')]),
    task: 'safe task',
    cwd: '/private/fsb/run/cwd',
    endpoint: 'http://127.0.0.1:7225/mcp',
    onEvent() {},
    async recordSession() {},
    async deleteSession() {},
  });
  await assert.rejects(oversizedController.run(), (error) => {
    assert.equal(error.reason, 'line_too_large');
    return true;
  });

  const cancellationStdout = new PassThrough();
  const cancellationStdin = new PassThrough();
  const cancellationWrites = [];
  cancellationStdin.on('data', (chunk) => cancellationWrites.push(Buffer.from(chunk)));
  const cancellationController = acpModule.createGrokBuildAcpController({
    stdin: cancellationStdin,
    stdout: cancellationStdout,
    task: '/goal cancel me',
    cwd: '/private/fsb/run/cwd',
    endpoint: 'http://127.0.0.1:7225/mcp',
    onEvent() {},
    async recordSession() {},
    async deleteSession() {},
  });
  const cancellationRun = cancellationController.run();
  const sessionResponseIndex = fixtureLines.findIndex((line) => line.includes('"id":3'));
  cancellationStdout.write(`${fixtureLines.slice(0, sessionResponseIndex + 1).join('\n')}\n`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    if (Buffer.concat(cancellationWrites).includes(Buffer.from('session/prompt'))) break;
  }
  await cancellationController.cancel();
  const cancelRequests = Buffer.concat(cancellationWrites).toString('utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(cancelRequests.at(-1), {
    jsonrpc: '2.0',
    method: 'session/cancel',
    params: { sessionId: '00000000-0000-4000-8000-000000000001' },
  });
  cancellationStdout.end();
  await assert.rejects(cancellationRun, (error) => error.reason === 'missing_result');
}

function fakeAuthChild(onSpawn) {
  const child = new EventEmitter();
  child.pid = 424242;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  queueMicrotask(() => onSpawn(child));
  return child;
}

async function testAuthCoordinator(authModule) {
  const binary = Object.freeze({
    command: '/fixture/grok',
    realPath: '/fixture/grok',
    argvPrefix: Object.freeze([]),
  });
  const root = '/private/fsb/grok-auth';
  const runtime = {
    paths: {
      root,
      home: `${root}/home`,
      grokHome: `${root}/grok-home`,
      runsRoot: `${root}/runs`,
      configPath: `${root}/grok-home/config.toml`,
      authPath: `${root}/grok-home/auth.json`,
      agentProfilePath: `${root}/fsb-agent.md`,
      sessionJournalPath: `${root}/sessions.json`,
    },
    async ensureBase() {},
    async prepareRun() { return { runDirectory: `${root}/runs/task`, cwd: `${root}/runs/task/cwd` }; },
    async removeRun() {},
    taskEnvironment() { return {}; },
    authEnvironment() { return { HOME: `${root}/home`, GROK_HOME: `${root}/grok-home` }; },
    async secureAuthFile() { return true; },
    async pendingSessions() { return []; },
    async recordSession() {},
    async clearSession() {},
  };
  const states = ['unauthenticated', 'oauth'];
  let spawnDescriptor = null;
  const progress = [];
  const coordinator = authModule.createGrokBuildAuthCoordinator({
    runtime,
    environment: {
      PATH: '/fixture',
      XAI_API_KEY: 'AUTH_SECRET_SENTINEL',
      GROK_BASE_URL: 'https://evil.invalid',
    },
    platform: 'win32',
    detect: async () => ({
      installed: true,
      version: '1.0.4',
      authState: states.shift() || 'oauth',
      binary,
      profileVersion: '1.0.4',
    }),
    spawn: (command, argv, options) => {
      spawnDescriptor = { command, argv, options };
      return fakeAuthChild((child) => {
        child.stdout.write('Ignore https://evil.invalid/device?code=LEAK\n');
        child.stdout.write('Ignore https://auth.x.ai/device?access_token=OAUTH_TOKEN_SENTINEL\n');
        child.stdout.write('Ignore https://auth.x.ai/device?code=SAFE#access_token=OAUTH_TOKEN_SENTINEL\n');
        child.stdout.write('Continue at https://auth.');
        child.stdout.write('x.ai/device?code=SAFE_CODE\n');
        child.stderr.write('AUTH_SECRET_SENTINEL must never escape\n');
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0, null);
      });
    },
  });
  const result = await coordinator.begin((event) => progress.push(event));
  assert.deepEqual(result, { state: 'oauth' });
  assert.deepEqual(progress.map((event) => event.state), [
    'opening_browser',
    'waiting',
    'waiting',
    'authenticated',
  ]);
  assert.equal(progress[2].url, 'https://auth.x.ai/device?code=SAFE_CODE');
  assert.deepEqual(spawnDescriptor.argv, ['login', '--oauth']);
  assert.equal(spawnDescriptor.options.cwd, runtime.paths.home);
  const publicSurface = JSON.stringify({ result, progress, argv: spawnDescriptor.argv });
  assert.equal(publicSurface.includes('AUTH_SECRET_SENTINEL'), false);
  assert.equal(publicSurface.includes('OAUTH_TOKEN_SENTINEL'), false);
  assert.equal(publicSurface.includes('evil.invalid'), false);
  assert.equal(JSON.stringify(spawnDescriptor.options.env).includes('AUTH_SECRET_SENTINEL'), false);
  assert.equal(JSON.stringify(spawnDescriptor.options.env).includes('evil.invalid'), false);

  const lease = await coordinator.acquireTask();
  assert.deepEqual(await coordinator.status(), { state: 'unknown' },
    'status never probes or refreshes cached OAuth while a Grok task is active');
  assert.deepEqual(await coordinator.logout(), { state: 'unknown', locked: true },
    'a locked logout reports the refusal as data the bridge can carry');
  lease.release();

  let preAbortedSpawnCalls = 0;
  const preAborted = new AbortController();
  preAborted.abort();
  const cancelledProgress = [];
  const cancelledCoordinator = authModule.createGrokBuildAuthCoordinator({
    runtime,
    platform: 'win32',
    detect: async () => { throw new Error('detection must not run'); },
    spawn: () => {
      preAbortedSpawnCalls += 1;
      throw new Error('spawn must not run');
    },
  });
  assert.deepEqual(
    await cancelledCoordinator.begin((event) => cancelledProgress.push(event), preAborted.signal),
    { state: 'unauthenticated' },
  );
  assert.deepEqual(cancelledProgress, [{ state: 'cancelled' }]);
  assert.equal(preAbortedSpawnCalls, 0, 'pre-cancelled OAuth never spawns Grok');

  let unsupportedAuthSpawnCalls = 0;
  const unsupportedAuthCoordinator = authModule.createGrokBuildAuthCoordinator({
    runtime,
    detect: async () => ({
      installed: false,
      version: '1.0.5',
      authState: 'unknown',
      binary,
      profileVersion: null,
      diagnostic: { code: 'version_unsupported', message: 'unsupported' },
    }),
    spawn: () => {
      unsupportedAuthSpawnCalls += 1;
      throw new Error('unsupported binary must never spawn');
    },
  });
  assert.deepEqual(await unsupportedAuthCoordinator.begin(() => {}), { state: 'unknown' });
  assert.equal(unsupportedAuthSpawnCalls, 0,
    'OAuth login refuses a retained binary outside the reviewed compatibility profile');

  const activeAbort = new AbortController();
  const activeAbortProgress = [];
  let activeAbortChild = null;
  const activeAbortCoordinator = authModule.createGrokBuildAuthCoordinator({
    runtime,
    platform: 'win32',
    detect: async () => ({
      installed: true,
      version: '1.0.4',
      authState: 'unauthenticated',
      binary,
      profileVersion: '1.0.4',
    }),
    spawn: () => {
      const child = fakeAuthChild(() => {});
      child.kill = (signal) => {
        queueMicrotask(() => child.emit('close', null, signal));
        return true;
      };
      activeAbortChild = child;
      return child;
    },
  });
  const activeAbortResult = activeAbortCoordinator.begin(
    (event) => activeAbortProgress.push(event),
    activeAbort.signal,
  );
  for (let attempt = 0; attempt < 20 && !activeAbortChild; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  activeAbort.abort();
  assert.deepEqual(await activeAbortResult, { state: 'unauthenticated' });
  assert.equal(activeAbortProgress.at(-1).state, 'cancelled',
    'an in-flight browser OAuth operation terminates as cancelled');

  const oversizedProgress = [];
  const oversizedCoordinator = authModule.createGrokBuildAuthCoordinator({
    runtime,
    platform: 'win32',
    detect: async () => ({
      installed: true,
      version: '1.0.4',
      authState: 'unauthenticated',
      binary,
      profileVersion: '1.0.4',
    }),
    spawn: () => fakeAuthChild((child) => {
      child.stdout.write(Buffer.alloc((64 * 1024) + 1, 0x78));
      child.stdout.end();
      child.stderr.end();
      child.emit('close', 0, null);
    }),
  });
  assert.deepEqual(
    await oversizedCoordinator.begin((event) => oversizedProgress.push(event)),
    { state: 'unauthenticated' },
  );
  assert.equal(oversizedProgress.at(-1).state, 'failed');
  assert.equal(JSON.stringify(oversizedProgress).includes('x'.repeat(64)), false,
    'oversized OAuth output never enters progress events');

  const logoutStates = ['oauth', 'unauthenticated'];
  const logoutProbes = [];
  const logoutProbeResult = probeResult('LOGOUT_OUTPUT_SENTINEL');
  const logoutCoordinator = authModule.createGrokBuildAuthCoordinator({
    runtime,
    environment: { PATH: '/fixture', XAI_API_KEY: 'LOGOUT_SECRET_SENTINEL' },
    detect: async () => ({
      installed: true,
      version: '1.0.4',
      authState: logoutStates.shift() || 'unauthenticated',
      binary,
      profileVersion: '1.0.4',
    }),
    probe: async (descriptor) => {
      logoutProbes.push(descriptor);
      return logoutProbeResult;
    },
  });
  assert.deepEqual(await logoutCoordinator.logout(), { state: 'unauthenticated' });
  assert.deepEqual(logoutProbes[0].argv, ['logout']);
  assert.equal(JSON.stringify(logoutProbes[0].environment).includes('LOGOUT_SECRET_SENTINEL'), false);
  assert.equal(logoutProbeResult.zeroized, true, 'logout output is zeroized before returning');

  const recovered = [];
  const recoveryRuntime = {
    ...runtime,
    async pendingSessions() {
      return [{
        delegationId: 'delegation_recovery_test',
        sessionId: '00000000-0000-4000-8000-000000000099',
      }];
    },
    async prepareRun(delegationId) {
      recovered.push(['prepare', delegationId]);
      return { runDirectory: `${root}/runs/${delegationId}`, cwd: `${root}/runs/${delegationId}/cwd` };
    },
    async clearSession(delegationId, sessionId) { recovered.push(['clear', delegationId, sessionId]); },
    async removeRun(delegationId) { recovered.push(['remove', delegationId]); },
  };
  const recoveryCoordinator = authModule.createGrokBuildAuthCoordinator({
    runtime: recoveryRuntime,
    detect: async () => ({
      installed: true,
      version: '1.0.4',
      authState: 'oauth',
      binary,
      profileVersion: '1.0.4',
    }),
    probe: async (descriptor) => {
      recovered.push(['delete', ...descriptor.argv]);
      return probeResult('');
    },
  });
  await recoveryCoordinator.recover();
  assert.deepEqual(recovered, [
    ['prepare', 'delegation_recovery_test'],
    ['delete', 'sessions', 'delete', '00000000-0000-4000-8000-000000000099'],
    ['clear', 'delegation_recovery_test', '00000000-0000-4000-8000-000000000099'],
    ['remove', 'delegation_recovery_test'],
  ], 'restart recovery deletes only the journal-proven Grok session');

  const blockedCoordinator = authModule.createGrokBuildAuthCoordinator({
    runtime,
    probe: async () => probeResult('', '', { code: 1, signal: null }),
  });
  await assert.rejects(blockedCoordinator.deleteSession({
    binary,
    delegationId: 'delegation_cleanup_test',
    sessionId: '00000000-0000-4000-8000-000000000088',
    cwd: `${root}/runs/delegation_cleanup_test/cwd`,
    journaled: false,
  }), /grok_session_cleanup_failed/);
  await assert.rejects(blockedCoordinator.acquireTask(), /grok_session_cleanup_failed/,
    'failed session cleanup blocks subsequent Grok runs');
}

async function main() {
  const [runtimeModule, environmentModule, detectorModule, adapterModule, acpModule, authModule] = await Promise.all([
    import(buildUrl('grok-runtime.js')),
    import(buildUrl('spawn-environment.js')),
    import(buildUrl('grok-detect.js')),
    import(buildUrl('grok.js')),
    import(buildUrl('grok-acp.js')),
    import(buildUrl('grok-auth.js')),
  ]);
  await testPrivateRuntime(runtimeModule);
  await testEnvironment(environmentModule);
  await testDetector(detectorModule);
  await testAdapterSpawn(adapterModule);
  await testAcp(acpModule);
  await testAuthCoordinator(authModule);
  console.log('mcp-grok-build-adapter.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-grok-build-adapter.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
