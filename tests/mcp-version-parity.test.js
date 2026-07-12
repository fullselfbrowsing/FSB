'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected: ${expected}, got: ${actual})`);
}

const repoRoot = path.resolve(__dirname, '..');
const canonicalVersion = '0.10.0';
const prePhase57MessageTypes = [
  'mcp:start-automation', 'mcp:stop-automation', 'mcp:get-status',
  'mcp:get-task-snapshot', 'mcp:trigger', 'mcp:stop-trigger',
  'mcp:get-trigger-status', 'mcp:list-triggers', 'mcp:start-visual-session',
  'mcp:end-visual-session', 'mcp:execute-action', 'mcp:go-back',
  'mcp:get-dom', 'mcp:get-tabs', 'mcp:get-site-guides',
  'mcp:get-page-snapshot', 'mcp:get-memory', 'mcp:get-config',
  'mcp:read-page', 'mcp:list-sessions', 'mcp:get-session', 'mcp:get-logs',
  'mcp:search-memory', 'mcp:create-agent', 'mcp:list-agents',
  'mcp:run-agent', 'mcp:stop-agent', 'mcp:delete-agent', 'mcp:toggle-agent',
  'mcp:get-agent-stats', 'mcp:get-agent-history', 'mcp:list-credentials',
  'mcp:fill-credential', 'mcp:list-payments', 'mcp:use-payment-method',
  'mcp:capabilities-search', 'mcp:capabilities-invoke', 'agent:register',
  'agent:release', 'agent:status',
];
const prePhase57ToolDefinitionsHash = '94ccbd785f8daefeea67032534ad6dd0864129e12569964254735086b93edac2';

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, relativePath))).digest('hex');
}

function extractMcpMessageTypes(typesSource) {
  const start = typesSource.indexOf('export type MCPMessageType =');
  const end = typesSource.indexOf('\n\n// Messages FROM extension TO MCP server', start);
  if (start < 0 || end < 0) return [];
  return Array.from(typesSource.slice(start, end).matchAll(/^\s*\|\s*'([^']+)'/gm), (match) => match[1]);
}

function extractRuntimeVersion(versionSource) {
  const match = versionSource.match(/FSB_MCP_VERSION = '([^']+)'/);
  return match ? match[1] : null;
}

function collectExplicitVersions(text) {
  const matches = [];
  const patterns = [
    /fsb-mcp-server@(\d+\.\d+\.\d+)/g,
    /FSB MCP Server (\d+\.\d+\.\d+)/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(text);
    while (match) {
      matches.push(match[1]);
      match = pattern.exec(text);
    }
  }

  return matches;
}

function runCommand(command) {
  return execSync(command, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

async function run() {
  const packageJson = readJson('mcp/package.json');
  const serverJson = readJson('mcp/server.json');
  const versionSource = readText('mcp/src/version.ts');
  const packageReadme = readText('mcp/README.md');
  const rootReadme = readText('README.md');
  const typesSource = readText('mcp/src/types.ts');
  const dispatcherSource = readText('extension/ws/mcp-tool-dispatcher.js');

  console.log('\n--- metadata parity ---');
  assertEqual(packageJson.version, canonicalVersion, 'mcp/package.json version stays on canonical version parity target');
  assertEqual(extractRuntimeVersion(versionSource), canonicalVersion, 'FSB_MCP_VERSION matches canonical package version');
  assertEqual(serverJson.version, canonicalVersion, 'server.json top-level version matches canonical package version');
  assertEqual(serverJson.packages[0].version, canonicalVersion, 'server.json package version matches canonical package version');

  console.log('\n--- cli output parity ---');
  const helpOutput = runCommand('node mcp/build/index.js help');
  const installOutput = runCommand('node mcp/build/index.js install');
  assert(helpOutput.includes(`FSB MCP Server ${canonicalVersion}`), 'help output prints canonical MCP version');
  assert(installOutput.includes(`FSB MCP Server ${canonicalVersion}`), 'install output prints canonical MCP version');

  console.log('\n--- docs flow parity ---');
  assert(packageReadme.includes('doctor'), 'mcp README mentions doctor');
  assert(packageReadme.includes('status --watch'), 'mcp README mentions status --watch');
  assert(rootReadme.includes('doctor'), 'root README mentions doctor');
  assert(rootReadme.includes('status --watch'), 'root README mentions status --watch');

  const explicitVersions = [
    ...collectExplicitVersions(packageReadme),
    ...collectExplicitVersions(rootReadme),
  ];
  for (const version of explicitVersions) {
    assertEqual(version, canonicalVersion, `explicit README MCP version reference stays on ${canonicalVersion}`);
  }

  console.log('\n--- Phase 57 additive wire freeze ---');
  const messageTypes = extractMcpMessageTypes(typesSource);
  assert(
    JSON.stringify(messageTypes.slice(0, prePhase57MessageTypes.length)) === JSON.stringify(prePhase57MessageTypes),
    'every pre-Phase-57 MCPMessageType remains present, unchanged, and in order',
  );
  assert(
    JSON.stringify(messageTypes.slice(prePhase57MessageTypes.length)) === JSON.stringify(['system:client-inventory']),
    'system:client-inventory is the only Phase 57 MCPMessageType addition',
  );
  assert(
    /type: 'mcp:result' \| 'mcp:progress' \| 'mcp:error';/.test(typesSource),
    'the MCP response type union remains byte-stable',
  );
  assertEqual(sha256('extension/ai/tool-definitions.js'), prePhase57ToolDefinitionsHash,
    'extension MCP tool definitions retain the pre-Phase-57 hash');
  assertEqual(sha256('mcp/ai/tool-definitions.cjs'), prePhase57ToolDefinitionsHash,
    'server MCP tool definitions retain the pre-Phase-57 hash');
  assert(
    dispatcherSource.includes('return { success: true, agentId, agentIdShort, ownershipTokens: {}, connectionId: connectionId };'),
    'agent:register response remains the exact established envelope',
  );

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
