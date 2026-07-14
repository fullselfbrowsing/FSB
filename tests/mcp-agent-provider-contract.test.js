'use strict';

/**
 * Phase 60 Plan 01 -- provider-neutral adapter/registry contract.
 *
 * Run: npm --prefix mcp run build && node tests/mcp-agent-provider-contract.test.js
 */

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const adapterSourcePath = path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'adapter.ts');
const adapterBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'adapter.js');
const registryBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'registry.js');
const platformsBuildPath = path.join(repoRoot, 'mcp', 'build', 'platforms.js');
const mcpRoot = path.join(repoRoot, 'mcp');
const mcpPackagePath = path.join(mcpRoot, 'package.json');
const shippedAgentPath = path.join(mcpRoot, 'ai', 'agents', 'fsb.json');

function expectRegistryError(fn, ErrorType, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ErrorType);
    assert.equal(error.code, code);
    return true;
  });
}

async function main() {
  assert.ok(fs.existsSync(adapterBuildPath), 'compiled adapter contract exists');
  assert.ok(fs.existsSync(registryBuildPath), 'compiled adapter registry exists');

  const adapterModule = await import(pathToFileURL(adapterBuildPath).href);
  const registryModule = await import(pathToFileURL(registryBuildPath).href);
  const { PLATFORMS } = await import(pathToFileURL(platformsBuildPath).href);

  const {
    CLAUDE_CODE_ADAPTER_ID,
    TASK_ONLY_CAPABILITIES,
    freezeSpawnSpec,
  } = adapterModule;
  const {
    AdapterRegistryError,
    createAdapterRegistry,
  } = registryModule;

  assert.equal(CLAUDE_CODE_ADAPTER_ID, 'claude-code');
  assert.equal(PLATFORMS['claude-code'].flag, 'claude-code', 'platform id remains canonical');

  const detection = Object.freeze({
    installed: true,
    version: '2.1.177',
    authState: 'unknown',
    binary: Object.freeze({
      command: '/fixture/claude',
      realPath: '/fixture/claude',
      argvPrefix: Object.freeze([]),
    }),
    profileVersion: '2.1.177',
  });
  const task = Object.freeze({ text: 'fixture task' });
  const context = Object.freeze({
    adapterId: 'claude-code',
    detection,
    delegationId: 'delegation_fixture_0001',
    runtimeFingerprint: 'fingerprint_fixture_0001',
    cwd: '/fixture/work',
    privateMcpConfigPath: '/fixture/run/mcp-config.json',
    runtimeFiles: Object.freeze(['/fixture/run/mcp-config.json']),
  });
  const immutableSpec = freezeSpawnSpec({
    adapterId: 'claude-code',
    profileVersion: '2.1.177',
    command: '/fixture/claude',
    argv: ['-p'],
    cwd: '/fixture/work',
    privateFiles: ['/fixture/run/mcp-config.json'],
    fixedEnv: { FSB_AGENT_PROFILE: '2.1.177' },
  });

  const fakeAdapter = Object.freeze({
    detect: async () => detection,
    buildSpawn: async (_task, _context) => immutableSpec,
    parseEvents: async function* () {},
    kill: async () => {},
    caps: () => TASK_ONLY_CAPABILITIES,
  });

  assert.deepEqual(
    Object.keys(fakeAdapter).sort(),
    ['buildSpawn', 'caps', 'detect', 'kill', 'parseEvents'],
    'a conforming adapter exposes exactly five callable methods',
  );
  assert.ok(Object.values(fakeAdapter).every((value) => typeof value === 'function'));
  assert.strictEqual(await fakeAdapter.buildSpawn(task, context), immutableSpec);

  assert.deepEqual(TASK_ONLY_CAPABILITIES, {
    taskMode: true,
    chatMode: false,
    resume: false,
    serverMode: false,
  });
  assert.ok(Object.isFrozen(TASK_ONLY_CAPABILITIES), 'capabilities are immutable');
  assert.throws(() => {
    TASK_ONLY_CAPABILITIES.taskMode = false;
  }, TypeError);

  assert.ok(Object.isFrozen(immutableSpec), 'spawn spec is immutable');
  assert.ok(Object.isFrozen(immutableSpec.argv), 'spawn argv is immutable');
  assert.ok(Object.isFrozen(immutableSpec.privateFiles), 'private file references are immutable');
  assert.ok(Object.isFrozen(immutableSpec.fixedEnv), 'fixed environment additions are immutable');
  assert.throws(() => immutableSpec.argv.push('--unexpected'), TypeError);
  assert.equal(JSON.stringify(immutableSpec).includes(task.text), false, 'task text is absent from spec');

  const registry = createAdapterRegistry([{ id: 'claude-code', adapter: fakeAdapter }]);
  assert.strictEqual(registry.require('claude-code'), fakeAdapter, 'exact canonical lookup succeeds');
  assert.deepEqual(registry.ids(), ['claude-code']);
  assert.ok(Object.isFrozen(registry));
  assert.ok(Object.isFrozen(registry.ids()));

  expectRegistryError(
    () => registry.require('Claude-Code'),
    AdapterRegistryError,
    'invalid_adapter_id',
  );
  expectRegistryError(
    () => registry.require(''),
    AdapterRegistryError,
    'invalid_adapter_id',
  );
  expectRegistryError(
    () => registry.require('codex'),
    AdapterRegistryError,
    'unknown_adapter_id',
  );
  expectRegistryError(
    () => createAdapterRegistry([]),
    AdapterRegistryError,
    'missing_adapter',
  );
  expectRegistryError(
    () => createAdapterRegistry([
      { id: 'claude-code', adapter: fakeAdapter },
      { id: 'claude-code', adapter: fakeAdapter },
    ]),
    AdapterRegistryError,
    'duplicate_adapter',
  );
  expectRegistryError(
    () => createAdapterRegistry([{ id: 'Claude-Code', adapter: fakeAdapter }]),
    AdapterRegistryError,
    'invalid_adapter_id',
  );
  expectRegistryError(
    () => createAdapterRegistry([{ id: 'opencode', adapter: fakeAdapter }]),
    AdapterRegistryError,
    'unknown_adapter_id',
  );

  const adapterSource = fs.readFileSync(adapterSourcePath, 'utf8');
  const interfaceMatch = adapterSource.match(
    /export interface AgentProviderAdapter\s*\{([\s\S]*?)\n\}/,
  );
  assert.ok(interfaceMatch, 'AgentProviderAdapter interface exists');
  const signatures = [...interfaceMatch[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*\(/gm)]
    .map((match) => match[1]);
  assert.deepEqual(
    signatures,
    ['detect', 'buildSpawn', 'parseEvents', 'kill', 'caps'],
    'interface has exactly the five required method signatures in order',
  );
  for (const forbidden of ['start', 'stop', 'close', 'init', 'dispose', 'spawn']) {
    assert.equal(signatures.includes(forbidden), false, `interface excludes ${forbidden}`);
  }

  const shippedAgent = JSON.parse(fs.readFileSync(shippedAgentPath, 'utf8'));
  assert.deepEqual(Object.keys(shippedAgent).sort(), [
    'description',
    'disallowedTools',
    'maxTurns',
    'name',
    'permissionMode',
    'prompt',
    'tools',
  ], 'shipped policy has the exact reviewed key set');
  assert.equal(shippedAgent.name, 'fsb');
  assert.equal(typeof shippedAgent.description, 'string');
  assert.ok(shippedAgent.description.length >= 24 && shippedAgent.description.length <= 300);
  assert.equal(typeof shippedAgent.prompt, 'string');
  assert.ok(shippedAgent.prompt.length >= 200 && shippedAgent.prompt.length <= 4000);
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

  const policyText = `${shippedAgent.description}\n${shippedAgent.prompt}`;
  assert.match(policyText, /server mints your agent identity/i);
  assert.match(policyText, /tabs owned by this agent/i);
  assert.match(policyText, /vault-reference operations/i);
  assert.match(policyText, /human handoff is required/i);
  assert.match(policyText, /irreversible or consent-required/i);
  assert.match(policyText, /fail closed/i);
  for (const dynamicMarker of ['${', '{{', '}}', '<task>', '%TASK%', 'TASK_CANARY']) {
    assert.equal(policyText.includes(dynamicMarker), false, `policy excludes ${dynamicMarker}`);
  }
  for (const credentialShape of [
    /\bsk-[A-Za-z0-9_-]{8,}/,
    /\bAKIA[A-Z0-9]{12,}/,
    /\bBearer\s+[A-Za-z0-9._-]{8,}/i,
    /\b(?:api[_-]?key|password|cvv)\s*[:=]\s*\S+/i,
  ]) {
    assert.equal(credentialShape.test(policyText), false, 'policy contains no credential value');
  }
  assert.deepEqual(
    shippedAgent.tools.filter((tool) => ['Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch'].includes(tool)),
    [],
    'policy grants no shell, filesystem-edit, or general web authority',
  );

  const mcpPackage = JSON.parse(fs.readFileSync(mcpPackagePath, 'utf8'));
  assert.ok(mcpPackage.files.includes('ai/'), 'package manifest publishes the ai directory');

  const packageArchivesBefore = fs.readdirSync(mcpRoot).filter((name) => name.endsWith('.tgz'));
  const packDestination = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-pack-dry-run-'));
  try {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const packed = spawnSync(
      npmCommand,
      ['pack', '--dry-run', '--json', '--pack-destination', packDestination],
      {
        cwd: mcpRoot,
        encoding: 'utf8',
        shell: false,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    assert.equal(packed.status, 0, packed.stderr || 'npm pack dry-run failed');
    const listing = JSON.parse(packed.stdout);
    assert.ok(Array.isArray(listing) && listing.length === 1, 'npm emits one dry-run package listing');
    const packagedPaths = listing[0].files.map((entry) => entry.path);
    assert.ok(packagedPaths.includes('ai/agents/fsb.json'), 'dry-run package includes static FSB agent');
  } finally {
    fs.rmSync(packDestination, { recursive: true, force: true });
  }
  assert.deepEqual(
    fs.readdirSync(mcpRoot).filter((name) => name.endsWith('.tgz')),
    packageArchivesBefore,
    'dry-run package validation leaves no workspace archive',
  );

  console.log('mcp-agent-provider-contract.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-agent-provider-contract.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
