'use strict';

/**
 * Static checks for the Claude plugin in plugins/claude, the folder that is
 * mirrored to the public plugin repository and submitted to the Claude plugin
 * directory. The rules live in scripts/claude-plugin-checks.mjs so the export
 * script enforces the same ones. This test runs them against the real folder,
 * proves the checker rejects known-bad variants, and confirms every tool name
 * the skill and README mention is registered by the built MCP server.
 *
 * Needs the MCP build (npm --prefix mcp run build). No network.
 *
 * Run: node tests/claude-plugin-spec.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const repoRoot = path.resolve(__dirname, '..');
const pluginRoot = path.join(repoRoot, 'plugins', 'claude');

let passed = 0;
let failed = 0;

function check(condition, message, detail) {
  if (condition) {
    passed += 1;
    console.log('  PASS:', message);
  } else {
    failed += 1;
    console.error('  FAIL:', message);
    if (detail) console.error(`        ${detail}`);
  }
}

function copyPlugin() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-claude-plugin-'));
  fs.cpSync(pluginRoot, root, { recursive: true });
  return root;
}

function editJson(root, relativePath, edit) {
  const file = path.join(root, relativePath);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const { collectClaudePluginErrors } = await import(
    pathToFileURL(path.join(repoRoot, 'scripts', 'claude-plugin-checks.mjs')).href
  );
  const mcpVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'mcp', 'package.json'), 'utf8')).version;

  const runtimePath = path.join(repoRoot, 'mcp', 'build', 'runtime.js');
  if (!fs.existsSync(runtimePath)) {
    console.error('claude-plugin-spec: mcp/build/runtime.js is missing; run npm --prefix mcp run build first');
    process.exit(1);
  }
  const runtimeModule = await import(pathToFileURL(runtimePath).href);
  const toolNames = Object.keys(runtimeModule.createRuntime().server._registeredTools || {});
  check(toolNames.length > 0, `built MCP server registers tools (${toolNames.length})`);

  console.log('\n--- plugins/claude passes every offline directory check ---');
  const errors = collectClaudePluginErrors(pluginRoot, { mcpVersion, toolNames });
  check(errors.length === 0, 'no checklist problems', errors.join('\n        '));

  console.log('\n--- the skill steers Claude to an allowlisted badge label ---');
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'fsb', 'SKILL.md'), 'utf8');
  const visualSession = await import(
    pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'tools', 'visual-session.js')).href
  );
  const clientLabels = [...skill.matchAll(/client: "([^"]+)"/gu)].map((match) => match[1]);
  check(clientLabels.length > 0, 'skill names the client label for action calls');
  for (const label of clientLabels) {
    check(
      visualSession.normalizeMcpVisualClientLabel(label) === label,
      `client label ${JSON.stringify(label)} is on the MCP badge allowlist`,
    );
  }
  check(
    skill.includes('mcp__plugin_full-self-browsing_fsb__'),
    'skill names the plugin-scoped tool prefix Claude Code assigns',
  );

  console.log('\n--- the checker rejects known-bad plugin folders ---');
  const negativeCases = [
    ['an @latest launcher', (root) => editJson(root, '.mcp.json', (config) => {
      config.mcpServers.fsb.args[1] = 'fsb-mcp-server@latest';
    }), /must launch exactly npx/u],
    ['a launcher pinned to another release', (root) => editJson(root, '.mcp.json', (config) => {
      config.mcpServers.fsb.args[1] = 'fsb-mcp-server@0.0.1';
    }), /must launch exactly npx/u],
    ['a second MCP server', (root) => editJson(root, '.mcp.json', (config) => {
      config.mcpServers.other = { command: 'node', args: ['server.js'] };
    }), /exactly one "fsb" server/u],
    ['a reserved plugin name', (root) => editJson(root, '.claude-plugin/plugin.json', (manifest) => {
      manifest.name = 'claude-browser';
    }), /reserved prefix/u],
    ['a plugin version behind the MCP package', (root) => editJson(root, '.claude-plugin/plugin.json', (manifest) => {
      manifest.version = '0.0.1';
    }), /plugin version must equal the MCP version/u],
    ['an http documentation URL', (root) => editJson(root, '.claude-plugin/plugin.json', (manifest) => {
      manifest.documentationUrl = 'http://example.com';
    }), /documentationUrl must be an https/u],
    ['an engines field', (root) => editJson(root, '.claude-plugin/plugin.json', (manifest) => {
      manifest.engines = { 'claude-code': '>=2.1.400' };
    }), /must not set engines/u],
    ['a marketplace entry with its own version', (root) => editJson(root, '.claude-plugin/marketplace.json', (marketplace) => {
      marketplace.plugins[0].version = '1.0.0';
    }), /must not set version/u],
    ['non-canonical JSON', (root) => fs.writeFileSync(
      path.join(root, '.mcp.json'),
      `${JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')))}\n`,
    ), /JSON\.stringify\(value, null, 2\) form/u],
    ['a .DS_Store file', (root) => fs.writeFileSync(path.join(root, '.DS_Store'), ''), /\.DS_Store must not be in the plugin/u],
    ['a root .gitattributes', (root) => fs.writeFileSync(path.join(root, '.gitattributes'), '* text=auto\n'), /\.gitattributes must not be in the plugin/u],
    ['an .npmrc beside the launcher', (root) => fs.writeFileSync(path.join(root, '.npmrc'), 'registry=https://example.com\n'), /\.npmrc must not be in the plugin/u],
    ['a bin directory', (root) => {
      fs.mkdirSync(path.join(root, 'bin'));
      fs.writeFileSync(path.join(root, 'bin', 'run.md'), 'x\n');
    }, /bin\/ must not be in the plugin/u],
    ['an unsupported binary file', (root) => fs.writeFileSync(path.join(root, 'assets', 'logo.ico'), 'x'), /unsupported file type/u],
    ['non-ASCII skill text', (root) => fs.appendFileSync(
      path.join(root, 'skills', 'fsb', 'SKILL.md'),
      '\nUse the arrow → here.\n',
    ), /SKILL\.md must be ASCII text/u],
    ['a skill front matter key other surfaces reject', (root) => {
      const file = path.join(root, 'skills', 'fsb', 'SKILL.md');
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('name: fsb\n', 'name: fsb\nuser-invocable: true\n'));
    }, /not accepted on every surface: user-invocable/u],
    ['a README without the npm disclosure', (root) => {
      const file = path.join(root, 'README.md');
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').split('registry.npmjs.org').join('the registry'));
    }, /must disclose "registry\.npmjs\.org"/u],
    ['a README with an HTML image', (root) => fs.appendFileSync(
      path.join(root, 'README.md'),
      '\n<img src="assets/logo.png" alt="logo" />\n',
    ), /Markdown image syntax only/u],
    ['a skill that names a tool the server does not register', (root) => fs.appendFileSync(
      path.join(root, 'skills', 'fsb', 'SKILL.md'),
      '\nCall `start_visual_session` first.\n',
    ), /`start_visual_session`, which is not a registered MCP tool/u],
  ];
  for (const [label, mutate, expected] of negativeCases) {
    const root = copyPlugin();
    try {
      mutate(root);
      const caseErrors = collectClaudePluginErrors(root, { mcpVersion, toolNames });
      check(
        caseErrors.some((message) => expected.test(message)),
        `rejects ${label}`,
        caseErrors.join(' | ') || 'no errors reported',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  console.log(`\nclaude-plugin-spec: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('claude-plugin-spec: unexpected error:', error);
  process.exit(1);
});
