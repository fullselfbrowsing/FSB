'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

function assertIncludes(text, needle, msg) {
  assert(text.includes(needle), `${msg} (missing: ${needle})`);
}

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'mcp', 'build', 'index.js');
const packageReadmePath = path.join(repoRoot, 'mcp', 'README.md');
const rootReadmePath = path.join(repoRoot, 'README.md');

const requiredSetupLines = [
  {
    label: 'Claude Code uses the user-scoped MCP install command',
    needles: ['claude mcp add --scope user fsb -- npx -y fsb-mcp-server@latest'],
  },
  {
    label: 'Codex documents ~/.codex/config.toml and the mcp_servers TOML block',
    needles: ['~/.codex/config.toml', '[mcp_servers.fsb]'],
  },
  {
    label: 'VS Code documents mcp.json with a top-level servers object and stdio transport',
    needles: ['mcp.json', '"servers"', '"type": "stdio"'],
  },
  {
    label: 'Cursor documents ~/.cursor/mcp.json and a restart or reload step',
    needles: ['~/.cursor/mcp.json', 'restart'],
  },
  {
    label: 'Windsurf distinguishes app and plugin config surfaces and tells the user to refresh or reload',
    needles: ['~/.codeium/windsurf/mcp_config.json', '~/.codeium/mcp_config.json', 'reload'],
  },
  {
    label: 'OpenCode includes the manual mcp.local snippet',
    needles: ['OpenCode', '"mcp"', '"type": "local"', '"command": ["npx", "-y", "fsb-mcp-server@latest"]'],
  },
  {
    label: 'Goose pins its split YAML package argument to npm latest',
    needles: ['Goose (Block)', '- fsb-mcp-server@latest'],
  },
  {
    label: 'JetBrains pins its separate arguments field to npm latest',
    needles: ['JetBrains (AI Assistant / Junie)', 'Arguments: -y fsb-mcp-server@latest'],
  },
  {
    label: 'OpenClaw is called out as a manual or unsupported fallback',
    needles: ['OpenClaw', 'manual', 'unsupported'],
  },
  {
    label: 'Setup guidance routes broken installs to doctor and status --watch first',
    needles: ['doctor', 'status --watch'],
  },
];

const requiredReadmeMarkers = [
  'OpenCode',
  'OpenClaw',
  'status --watch',
  'doctor',
  'scope user',
  'config.toml',
  'mcp.json',
  'refresh',
];

function run() {
  const result = spawnSync('node', [cliPath, 'setup'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const output = `${result.stdout}${result.stderr}`;
  const packageReadme = fs.readFileSync(packageReadmePath, 'utf8');
  const rootReadme = fs.readFileSync(rootReadmePath, 'utf8');

  console.log('\n--- setup command ---');
  assertEqual(result.status, 0, 'setup exits cleanly');
  assertIncludes(output, 'FSB MCP install snippets', 'setup prints the install snippet header');

  console.log('\n--- host guidance contract ---');
  for (const contract of requiredSetupLines) {
    for (const needle of contract.needles) {
      assertIncludes(output, needle, contract.label);
    }
  }
  const unpinnedSetupCommands = output.match(/fsb-mcp-server(?!@latest|%40latest)/gu) || [];
  assertEqual(
    unpinnedSetupCommands.length,
    0,
    'setup output contains no unpinned MCP package invocation',
  );

  console.log('\n--- readme parity ---');
  for (const needle of requiredReadmeMarkers) {
    assertIncludes(packageReadme, needle, `package README includes ${needle}`);
    assertIncludes(rootReadme, needle, `root README includes ${needle}`);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
