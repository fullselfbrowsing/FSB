'use strict';

const fs = require('fs');
const os = require('os');
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

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'mcp', 'build', 'index.js');
const EXTENSION_ID = 'badgafnfchcihdfnjneklogedcdkmjfk';
const DEVELOPMENT_EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';

function runCli(args, fixture) {
  return spawnSync('node', [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: fixture.home,
      APPDATA: fixture.appData,
      LOCALAPPDATA: fixture.localAppData,
    },
  });
}

function withTempHome(label, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `fsb-${label}-`));
  const fixture = {
    root,
    home: path.join(root, 'home'),
    appData: path.join(root, 'appdata'),
    localAppData: path.join(root, 'localappdata'),
  };

  fs.mkdirSync(fixture.home, { recursive: true });
  fs.mkdirSync(fixture.appData, { recursive: true });
  fs.mkdirSync(fixture.localAppData, { recursive: true });

  try {
    callback(fixture);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertIncludes(text, needle, msg) {
  assert(text.includes(needle), `${msg} (missing: ${needle})`);
}

function assertNotIncludes(text, needle, msg) {
  assert(!text.includes(needle), `${msg} (unexpected: ${needle})`);
}

function run() {
  console.log('\n--- install --all dry-run matrix ---');
  withTempHome('mcp-install-dry-run', (fixture) => {
    const result = runCli(['install', '--all', '--dry-run'], fixture);
    const output = `${result.stdout}${result.stderr}`;

    assertEqual(result.status, 0, 'install --all --dry-run exits cleanly');

    const requiredDryRunHosts = [
      'Claude Code',
      'Claude Desktop',
      'Cursor',
      'VS Code',
      'Windsurf',
      'Cline',
      'Zed',
      'Codex CLI',
      'Gemini CLI',
      'Continue',
    ];

    for (const host of requiredDryRunHosts) {
      assertIncludes(output, `[DRY RUN] ${host}`, `dry-run previews ${host}`);
    }

    assertIncludes(
      output,
      'claude mcp add --scope user fsb -- npx -y fsb-mcp-server',
      'dry-run locks Claude Code user-scope delegation',
    );
    assertIncludes(output, '"servers": {', 'dry-run shows VS Code top-level servers object');
    assertIncludes(output, '"type": "stdio"', 'dry-run shows VS Code stdio transport');
    assertIncludes(output, '[mcp_servers.fsb]', 'dry-run shows the Codex TOML server block');
    assertIncludes(output, 'name: fsb', 'dry-run shows the Continue YAML array entry');
    assertIncludes(
      output,
      '.codeium/windsurf/mcp_config.json',
      'dry-run shows the Windsurf app config path',
    );
    assertNotIncludes(output, 'Native messaging host', 'install --all excludes the native messaging host');
    assertNotIncludes(output, 'native-host', 'install --all output does not widen to the native target');
  });

  console.log('\n--- codex install + uninstall round trip ---');
  withTempHome('mcp-install-codex', (fixture) => {
    const codexPath = path.join(fixture.home, '.codex', 'config.toml');
    writeText(
      codexPath,
      [
        'model = "gpt-5.4"',
        '',
        '[mcp_servers.existing]',
        'command = "uvx"',
        'args = ["existing-server"]',
        '',
      ].join('\n'),
    );

    const installResult = runCli(['install', '--codex'], fixture);
    const installOutput = `${installResult.stdout}${installResult.stderr}`;
    const installedConfig = readText(codexPath);

    assertEqual(installResult.status, 0, 'codex install exits cleanly');
    assertIncludes(installOutput, 'Installed to Codex CLI', 'codex install reports a successful write');
    assertIncludes(installedConfig, 'model = "gpt-5.4"', 'codex install preserves unrelated top-level config');
    assertIncludes(installedConfig, '[mcp_servers.existing]', 'codex install preserves existing MCP entries');
    assertIncludes(installedConfig, '[mcp_servers.fsb]', 'codex install adds the fsb TOML block');
    assertIncludes(installedConfig, 'command = "npx"', 'codex install writes the fsb command');

    const uninstallResult = runCli(['uninstall', '--codex'], fixture);
    const uninstallOutput = `${uninstallResult.stdout}${uninstallResult.stderr}`;
    const uninstalledConfig = readText(codexPath);

    assertEqual(uninstallResult.status, 0, 'codex uninstall exits cleanly');
    assertIncludes(uninstallOutput, 'Removed from Codex CLI', 'codex uninstall reports a successful removal');
    assertNotIncludes(uninstalledConfig, '[mcp_servers.fsb]', 'codex uninstall removes the fsb TOML block');
    assertIncludes(uninstalledConfig, '[mcp_servers.existing]', 'codex uninstall keeps unrelated MCP entries');
  });

  console.log('\n--- continue yaml merge ---');
  withTempHome('mcp-install-continue', (fixture) => {
    const continuePath = path.join(fixture.home, '.continue', 'config.yaml');
    writeText(
      continuePath,
      [
        'theme: dark',
        'mcpServers:',
        '  - name: existing',
        '    command: uvx',
        '    args:',
        '      - existing-server',
        '',
      ].join('\n'),
    );

    const result = runCli(['install', '--continue'], fixture);
    const output = `${result.stdout}${result.stderr}`;
    const config = readText(continuePath);

    assertEqual(result.status, 0, 'continue install exits cleanly');
    assertIncludes(output, 'Installed to Continue', 'continue install reports a successful write');
    assertIncludes(config, 'theme: dark', 'continue install preserves unrelated YAML keys');
    assertIncludes(config, 'name: existing', 'continue install preserves existing YAML server entries');
    assertIncludes(config, 'name: fsb', 'continue install appends the fsb YAML array entry');
    assertIncludes(config, '- fsb-mcp-server', 'continue install writes the fsb command args');
  });

  console.log('\n--- windsurf app config path ---');
  withTempHome('mcp-install-windsurf-app', (fixture) => {
    const windsurfPath = path.join(fixture.home, '.codeium', 'windsurf', 'mcp_config.json');
    writeText(
      windsurfPath,
      JSON.stringify({
        mcpServers: {
          existing: {
            command: 'uvx',
            args: ['existing-server'],
          },
        },
      }, null, 2),
    );

    const result = runCli(['install', '--windsurf'], fixture);
    const output = `${result.stdout}${result.stderr}`;
    const config = readText(windsurfPath);

    assertEqual(result.status, 0, 'windsurf app-path install exits cleanly');
    assertIncludes(output, 'Installed to Windsurf', 'windsurf app-path install reports success');
    assertIncludes(config, '"existing"', 'windsurf app-path install preserves existing entries');
    assertIncludes(config, '"fsb"', 'windsurf app-path install writes the fsb entry');
  });

  console.log('\n--- windsurf plugin config variant ---');
  withTempHome('mcp-install-windsurf-plugin', (fixture) => {
    const pluginPath = path.join(fixture.home, '.codeium', 'mcp_config.json');
    writeText(
      pluginPath,
      JSON.stringify({
        mcpServers: {
          existing: {
            command: 'uvx',
            args: ['plugin-server'],
          },
        },
      }, null, 2),
    );

    const result = runCli(['install', '--windsurf'], fixture);
    const output = `${result.stdout}${result.stderr}`;
    const config = readText(pluginPath);

    assertEqual(result.status, 0, 'windsurf plugin-path install exits cleanly');
    assertIncludes(
      output,
      '.codeium/mcp_config.json',
      'windsurf plugin-path install targets the JetBrains/Cascade config when it is the only detected variant',
    );
    assertNotIncludes(
      output,
      'Directory does not exist',
      'windsurf plugin-path install does not fail because the app-specific directory is missing',
    );
    assertIncludes(
      config,
      '"fsb"',
      'windsurf plugin-path install updates the JetBrains/Cascade config when that is the only Windsurf config surface',
    );
  });

  console.log('\n--- native target isolation ---');
  withTempHome('mcp-native-target-isolation', (fixture) => {
    const helpResult = runCli(['--help'], fixture);
    const helpOutput = `${helpResult.stdout}${helpResult.stderr}`;
    const installResult = runCli(['install', '--native-host', '--dry-run'], fixture);
    const installOutput = `${installResult.stdout}${installResult.stderr}`;
    const uninstallResult = runCli(
      ['uninstall', '--native-host', '--codex', '--dry-run'],
      fixture,
    );
    const uninstallOutput = `${uninstallResult.stdout}${uninstallResult.stderr}`;

    assertEqual(helpResult.status, 0, 'help with native syntax exits cleanly');
    assertIncludes(
      helpOutput,
      'fsb-mcp-server install --native-host [--extension-id <id>] Install the Chrome native messaging host',
      'help names the exact optional native install syntax',
    );
    assertIncludes(
      helpOutput,
      'fsb-mcp-server uninstall --native-host Remove the Chrome native messaging host',
      'help names the exact native uninstall syntax',
    );
    assertIncludes(
      helpOutput,
      'fsb-mcp-server install             Install FSB to an MCP client config (21 platforms)',
      'help preserves the legacy install line byte-for-byte',
    );
    assertIncludes(
      helpOutput,
      'fsb-mcp-server uninstall           Remove FSB from an MCP client config',
      'help preserves the legacy uninstall line byte-for-byte',
    );

    assertEqual(installResult.status, 1, 'native install rejects legacy dry-run mixing');
    assertIncludes(
      installOutput,
      'fsb-mcp-server install --native-host',
      'native install mixing prints only the stable native usage',
    );
    assertEqual(uninstallResult.status, 1, 'native uninstall rejects client/dry-run mixing');
    assertIncludes(
      uninstallOutput,
      'fsb-mcp-server uninstall --native-host',
      'native uninstall mixing prints only the stable native usage',
    );
    assert(
      !fs.existsSync(path.join(fixture.home, '.fsb', 'native-host')),
      'invalid native syntax creates no owned runtime',
    );
    assert(
      !fs.existsSync(path.join(
        fixture.home,
        '.config',
        'google-chrome',
        'NativeMessagingHosts',
      )),
      'invalid native syntax creates no Chrome registration directory',
    );

    const unavailableInstall = runCli(['install', '--native-host'], fixture);
    const unavailableInstallOutput = `${unavailableInstall.stdout}${unavailableInstall.stderr}`;
    const unavailableUninstall = runCli(['uninstall', '--native-host'], fixture);
    const unavailableUninstallOutput = `${unavailableUninstall.stdout}${unavailableUninstall.stderr}`;
    assertEqual(unavailableInstall.status, 1, 'unresolved production native install fails closed');
    assertIncludes(
      unavailableInstallOutput,
      'Native messaging host was not changed: unavailable',
      'unresolved production native install reports only bounded unavailable',
    );
    assertIncludes(
      unavailableInstallOutput,
      'Run fsb-mcp-server doctor for repair details.',
      'unresolved production native install gives exact doctor guidance',
    );
    assertEqual(unavailableUninstall.status, 1, 'unresolved production native uninstall fails closed');
    assertIncludes(
      unavailableUninstallOutput,
      'Native messaging host was not changed: unavailable',
      'unresolved production native uninstall reports only bounded unavailable',
    );

    const duplicateId = runCli([
      'install',
      '--native-host',
      '--extension-id', DEVELOPMENT_EXTENSION_ID,
      '--extension-id', EXTENSION_ID,
    ], fixture);
    const duplicateTarget = runCli([
      'uninstall',
      '--native-host',
      '--native-host',
    ], fixture);
    const extraInlineValue = runCli([
      'install',
      '--native-host',
      `--extension-id=${DEVELOPMENT_EXTENSION_ID}=extra`,
    ], fixture);
    const extraPositional = runCli([
      'install',
      'unexpected-positional',
      '--native-host',
    ], fixture);
    const unknownShort = runCli([
      'install',
      '-x',
      '--native-host',
    ], fixture);
    for (const [result, label] of [
      [duplicateId, 'duplicate extension id'],
      [duplicateTarget, 'duplicate native target'],
      [extraInlineValue, 'extra inline extension-id value'],
      [extraPositional, 'extra positional'],
      [unknownShort, 'unknown short flag'],
    ]) {
      assertEqual(result.status, 1, `${label} is rejected before native mutation`);
      assertIncludes(
        `${result.stdout}${result.stderr}`,
        'Usage: fsb-mcp-server',
        `${label} prints stable bounded usage`,
      );
    }
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
