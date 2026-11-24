'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { classifyDoctorLayer } = require('../mcp/build/diagnostics.js');

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
const PRODUCT_VERSION = require('../extension/manifest.json').version;
const EXTENSION_ID = 'badgafnfchcihdfnjneklogedcdkmjfk';
const DEVELOPMENT_EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const CLINE_ENV_KEYS = ['CLINE_DIR', 'CLINE_DATA_DIR', 'CLINE_MCP_SETTINGS_PATH'];

function runCli(args, fixture, options = {}) {
  const env = {
    ...process.env,
    HOME: fixture.home,
    APPDATA: fixture.appData,
    LOCALAPPDATA: fixture.localAppData,
    ...(options.env ?? {}),
  };
  if (!Object.hasOwn(options.env ?? {}, 'npm_execpath')) delete env.npm_execpath;
  for (const key of CLINE_ENV_KEYS) {
    if (!Object.hasOwn(options.env ?? {}, key)) delete env[key];
  }
  for (const key of Object.keys(env)) {
    if (key.startsWith('FSB_NATIVE_HOST_') && !Object.hasOwn(options.env ?? {}, key)) delete env[key];
  }
  if (!Object.hasOwn(options.env ?? {}, 'CLAUDE_CONFIG_DIR')) delete env.CLAUDE_CONFIG_DIR;
  // A client install also publishes FSB's local helper, which packs this
  // package. Client tests write only the client config; the helper tests opt
  // in with `nativeHost: true`.
  const cliArgs = args[0] === 'install' && options.nativeHost !== true && !args.includes('--native-host')
    ? [...args, '--no-native-host']
    : args;
  // Uninstall's last-client check asks the Claude Code CLI when ~/.claude.json
  // is missing. An empty PATH keeps it from reaching a real one.
  if (args[0] === 'uninstall' && !Object.hasOwn(options.env ?? {}, 'PATH')) {
    const emptyBin = path.join(fixture.root, 'empty-bin');
    fs.mkdirSync(emptyBin, { recursive: true });
    env.PATH = emptyBin;
  }
  return spawnSync(process.execPath, [cliPath, ...cliArgs], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
    shell: false,
  });
}

// Points the helper's stop probes at a port nothing listens on and fixes the
// detected browsers, so helper tests never depend on the machine's own
// local service or browser profiles.
function nativeHostTestEnvironment(browsers = 'chrome') {
  const probe = spawnSync(process.execPath, [
    '-e',
    "const s = require('net').createServer().listen(0, '127.0.0.1', () => { process.stdout.write(String(s.address().port)); s.close(); });",
  ], { encoding: 'utf8' });
  return {
    FSB_NATIVE_HOST_TEST_MODE: '1',
    FSB_NATIVE_HOST_BROWSERS: browsers,
    FSB_NATIVE_HOST_TEST_SERVICE_PORT: probe.stdout.trim(),
  };
}

function withTempHome(label, callback) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `fsb-${label}-`)));
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

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function clineSettingsPath(fixture) {
  return path.join(fixture.home, '.cline', 'data', 'settings', 'cline_mcp_settings.json');
}

function clineLegacySettingsPath(fixture) {
  const storage = ['User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'];
  if (process.platform === 'darwin') {
    return path.join(fixture.home, 'Library', 'Application Support', 'Code', ...storage);
  }
  if (process.platform === 'win32') return path.join(fixture.appData, 'Code', ...storage);
  return path.join(fixture.home, '.config', 'Code', ...storage);
}

function assertIncludes(text, needle, msg) {
  assert(text.includes(needle), `${msg} (missing: ${needle})`);
}

function assertNotIncludes(text, needle, msg) {
  assert(!text.includes(needle), `${msg} (unexpected: ${needle})`);
}

function runProductionDoctor(fixture) {
  const result = runCli(['doctor', '--json', '--timeout', '0'], fixture);
  let snapshot = null;
  try {
    snapshot = JSON.parse(result.stdout);
  } catch {
    // The assertions below retain bounded stdout/stderr evidence on failure.
  }
  assertEqual(result.status, 1, 'production doctor preserves historical bridge-health exit semantics');
  const bridgeSnapshot = snapshot ? { ...snapshot } : null;
  if (bridgeSnapshot) delete bridgeSnapshot.nativeHost;
  assert(snapshot && snapshot.diagnosticLayer === classifyDoctorLayer(bridgeSnapshot),
    'native-host facts do not change the historical doctor health layer');
  return snapshot;
}

function startReadyHealthFixture(fixture) {
  const readyPath = path.join(fixture.root, 'health-ready.txt');
  const source = [
    "const fs = require('node:fs');",
    "const http = require('node:http');",
    'const readyPath = process.argv[1];',
    `const body = JSON.stringify({ ok: true, service: 'fsb-mcp-server', version: '${PRODUCT_VERSION}', nativeHostProtocol: 1, serveReady: true });`,
    'const server = http.createServer((_request, response) => {',
    "  response.writeHead(200, { 'content-type': 'application/json' });",
    '  response.end(body);',
    '});',
    "server.once('error', (error) => fs.writeFileSync(readyPath, `error:${error.code || 'unknown'}`));",
    "server.listen(7226, '127.0.0.1', () => fs.writeFileSync(readyPath, 'ready'));",
    "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
  ].join('\n');
  const child = spawn(process.execPath, ['-e', source, readyPath], {
    cwd: repoRoot,
    env: { ...process.env },
    shell: false,
    stdio: 'ignore',
  });
  const waitArray = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + 3000;
  while (!fs.existsSync(readyPath) && Date.now() < deadline) {
    Atomics.wait(waitArray, 0, 0, 20);
  }
  const state = fs.existsSync(readyPath) ? readText(readyPath) : 'timeout';
  assertEqual(state, 'ready', 'production doctor fixture owns the exact loopback health endpoint');
  return child;
}

function run() {
  console.log('\n--- install --all dry-run matrix ---');
  withTempHome('mcp-install-dry-run', (fixture) => {
    const result = runCli(['install', '--all', '--dry-run'], fixture, { nativeHost: true });
    const output = `${result.stdout}${result.stderr}`;

    assertEqual(result.status, 0, 'install --all --dry-run exits cleanly');

    const requiredDryRunHosts = [
      'Claude Code',
      'Claude Desktop',
      'Cursor',
      'VS Code',
      'Antigravity',
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
      'claude mcp add --scope user fsb -- npx -y fsb-mcp-server@latest',
      'dry-run locks Claude Code user-scope delegation',
    );
    assertIncludes(output, '"servers": {', 'dry-run shows VS Code top-level servers object');
    assertIncludes(output, '"type": "stdio"', 'dry-run shows VS Code stdio transport');
    assertIncludes(output, '[mcp_servers.fsb]', 'dry-run shows the Codex TOML server block');
    assertIncludes(output, 'name: fsb', 'dry-run shows the Continue YAML array entry');
    assertIncludes(
      output,
      path.join('.gemini', 'config', 'mcp_config.json'),
      'dry-run shows the Antigravity config path',
    );
    assertIncludes(
      output,
      path.join('.cline', 'data', 'settings', 'cline_mcp_settings.json'),
      'dry-run shows the shared Cline settings path',
    );
    assertIncludes(output, '"timeout": 1800', 'dry-run shows the Cline request timeout');
    assertIncludes(
      output,
      "[DRY RUN] FSB's local helper (native messaging host)",
      'install --all --dry-run previews the helper step after the client configs',
    );
    assert(
      output.indexOf('Would install to') < output.indexOf("[DRY RUN] FSB's local helper"),
      'the helper preview follows the client summary',
    );
    assertNotIncludes(output, 'Native messaging host installed', 'install --all --dry-run installs no helper');
    for (const helperPath of ['native-host', 'native-host.lock', 'native-host-opt-out.json', 'native-host-ensure.json']) {
      assert(!fs.existsSync(path.join(fixture.home, '.fsb', helperPath)),
        `install --all --dry-run creates no ~/.fsb/${helperPath}`);
    }
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
    assertIncludes(config, '- fsb-mcp-server@latest', 'continue install writes the latest-channel fsb command args');
  });

  console.log('\n--- continue reinstall ignores property order but respects argument order ---');
  withTempHome('mcp-install-continue-reordered', (fixture) => {
    const configPath = path.join(fixture.home, '.continue', 'config.yaml');
    const original = [
      '# Keep this formatting on a no-op reinstall',
      'theme: dark',
      'mcpServers:',
      '  - args: ["-y", "fsb-mcp-server@latest"]',
      '    command: npx',
      '    name: fsb',
      '',
    ].join('\n');
    writeText(configPath, original);
    const unchanged = runCli(['install', '--continue'], fixture);
    assertEqual(unchanged.status, 0, 'continue reinstall with reordered properties exits cleanly');
    assertIncludes(`${unchanged.stdout}${unchanged.stderr}`, 'Continue already configured',
      'named-array property order does not trigger an update');
    assertEqual(readText(configPath), original, 'continue no-op preserves the complete YAML file');
    assertEqual(readText(configPath + '.bak'), original, 'continue no-op still backs up the original file');

    const reversedArgs = original.replace('["-y", "fsb-mcp-server@latest"]', '["fsb-mcp-server@latest", "-y"]');
    writeText(configPath, reversedArgs);
    const changed = runCli(['install', '--continue'], fixture);
    assertEqual(changed.status, 0, 'continue reinstall with changed arguments exits cleanly');
    assertIncludes(`${changed.stdout}${changed.stderr}`, 'Updated Continue',
      'named-array argument order remains significant');
    assertEqual(readText(configPath + '.bak'), reversedArgs, 'continue update backs up the changed argument order');
    const restored = runCli(['install', '--continue'], fixture);
    assertIncludes(`${restored.stdout}${restored.stderr}`, 'Continue already configured',
      'continue update restores the expected argument order');
  });

  console.log('\n--- antigravity config path ---');
  withTempHome('mcp-install-antigravity', (fixture) => {
    const configPath = path.join(fixture.home, '.gemini', 'config', 'mcp_config.json');
    writeText(
      configPath,
      JSON.stringify({
        mcpServers: {
          existing: {
            command: 'uvx',
            args: ['existing-server'],
          },
        },
      }, null, 2),
    );
    // An older release's file must not outrank the current config directory.
    writeText(path.join(fixture.home, '.gemini', 'antigravity', 'mcp_config.json'), '');

    const result = runCli(['install', '--antigravity'], fixture);
    const output = `${result.stdout}${result.stderr}`;
    const config = readJson(configPath);

    assertEqual(result.status, 0, 'antigravity install exits cleanly');
    assertIncludes(output, 'Installed to Antigravity', 'antigravity install reports success');
    assert(Object.hasOwn(config.mcpServers, 'existing'), 'antigravity install preserves existing entries');
    assertEqual(
      JSON.stringify(config.mcpServers.fsb),
      JSON.stringify({ command: 'npx', args: ['-y', 'fsb-mcp-server@latest'] }),
      'antigravity install writes the standard stdio entry',
    );
    assertEqual(
      readText(path.join(fixture.home, '.gemini', 'antigravity', 'mcp_config.json')),
      '',
      'antigravity install leaves the older release file alone when ~/.gemini/config exists',
    );
  });

  console.log('\n--- antigravity older release with an empty config file ---');
  withTempHome('mcp-install-antigravity-legacy', (fixture) => {
    // Antigravity creates its config file empty until a server is added.
    const legacyPath = path.join(fixture.home, '.gemini', 'antigravity', 'mcp_config.json');
    writeText(legacyPath, '');

    const result = runCli(['install', '--antigravity'], fixture);
    const output = `${result.stdout}${result.stderr}`;

    assertEqual(result.status, 0, 'antigravity install into an empty file exits cleanly');
    assertIncludes(
      output,
      path.join('.gemini', 'antigravity', 'mcp_config.json'),
      'antigravity install targets the older release file when ~/.gemini/config does not exist',
    );
    assertEqual(
      JSON.stringify(readJson(legacyPath)),
      JSON.stringify({ mcpServers: { fsb: { command: 'npx', args: ['-y', 'fsb-mcp-server@latest'] } } }),
      'antigravity install turns an empty config file into an mcpServers map with the fsb entry',
    );

    const rerun = runCli(['install', '--antigravity'], fixture);
    assertIncludes(
      `${rerun.stdout}${rerun.stderr}`,
      'Antigravity (older release) already configured',
      'antigravity reinstall is a no-op',
    );

    const uninstallResult = runCli(['uninstall', '--antigravity'], fixture);
    assertEqual(uninstallResult.status, 0, 'antigravity uninstall exits cleanly');
    assertIncludes(
      `${uninstallResult.stdout}${uninstallResult.stderr}`,
      'Removed from Antigravity',
      'antigravity uninstall reports a successful removal',
    );
    assert(!Object.hasOwn(readJson(legacyPath).mcpServers, 'fsb'), 'antigravity uninstall removes the fsb entry');
  });

  console.log('\n--- windsurf flag is gone ---');
  withTempHome('mcp-install-windsurf-retired', (fixture) => {
    const result = runCli(['install', '--windsurf'], fixture);
    const output = `${result.stdout}${result.stderr}`;
    assertNotIncludes(output, 'Installed to', 'install --windsurf writes nothing');
    assert(!fs.existsSync(path.join(fixture.home, '.codeium')), 'install --windsurf creates no Windsurf config');
  });

  console.log('\n--- cline shared settings install + uninstall ---');
  withTempHome('mcp-install-cline-shared', (fixture) => {
    const settingsPath = clineSettingsPath(fixture);
    const existingServer = {
      transport: { type: 'stdio', command: 'uvx', args: ['existing-server'] },
      autoApprove: ['search'],
    };
    writeText(settingsPath, JSON.stringify({ mcpServers: { existing: existingServer } }, null, 2));

    const result = runCli(['install', '--cline'], fixture);
    const output = `${result.stdout}${result.stderr}`;
    const config = readJson(settingsPath);

    assertEqual(result.status, 0, 'cline install exits cleanly');
    assertIncludes(output, 'Installed to Cline: ', 'cline install reports the shared settings target');
    assertEqual(
      JSON.stringify(config.mcpServers.fsb),
      JSON.stringify({ command: 'npx', args: ['-y', 'fsb-mcp-server@latest'], timeout: 1800 }),
      'cline install writes the stdio entry with a 30-minute request timeout',
    );
    assertEqual(
      JSON.stringify(config.mcpServers.existing),
      JSON.stringify(existingServer),
      'cline install preserves other servers byte-for-byte',
    );

    const uninstallResult = runCli(['uninstall', '--cline'], fixture);
    const uninstalled = readJson(settingsPath);
    assertEqual(uninstallResult.status, 0, 'cline uninstall exits cleanly');
    assertIncludes(
      `${uninstallResult.stdout}${uninstallResult.stderr}`,
      'Removed from Cline',
      'cline uninstall reports a successful removal',
    );
    assert(!Object.hasOwn(uninstalled.mcpServers, 'fsb'), 'cline uninstall removes the fsb entry');
    assert(Object.hasOwn(uninstalled.mcpServers, 'existing'), 'cline uninstall keeps other servers');
  });

  console.log('\n--- cline reinstall keeps client-owned settings ---');
  withTempHome('mcp-install-cline-preserve', (fixture) => {
    const settingsPath = clineSettingsPath(fixture);
    const userEntry = {
      command: 'npx',
      args: ['-y', 'fsb-mcp-server@latest'],
      timeout: 3600,
      autoApprove: ['navigate', 'read_page'],
      disabled: false,
    };
    for (const [label, keys] of [
      ['transport first', ['command', 'args', 'timeout', 'autoApprove', 'disabled']],
      ['client settings first', ['autoApprove', 'disabled', 'timeout', 'command', 'args']],
      ['interleaved settings', ['disabled', 'command', 'autoApprove', 'args', 'timeout']],
    ]) {
      const reordered = Object.fromEntries(keys.map((key) => [key, userEntry[key]]));
      const original = JSON.stringify({ mcpServers: { fsb: reordered } }, null, 4) + '\n';
      writeText(settingsPath, original);
      const unchanged = runCli(['install', '--cline'], fixture);
      assertEqual(unchanged.status, 0, `cline reinstall exits cleanly with ${label}`);
      assertIncludes(`${unchanged.stdout}${unchanged.stderr}`, 'Cline already configured',
        `cline reinstall skips an unchanged entry with ${label}`);
      assertEqual(readText(settingsPath), original,
        `cline reinstall preserves file bytes and client settings with ${label}`);
      assertEqual(readText(settingsPath + '.bak'), original,
        `cline reinstall preserves the backup behavior with ${label}`);
    }

    writeText(settingsPath, JSON.stringify({ mcpServers: { fsb: { ...userEntry, command: 'node' } } }));
    const changedCommand = runCli(['install', '--cline'], fixture);
    assertEqual(changedCommand.status, 0, 'cline reinstall with a stale command exits cleanly');
    assertIncludes(`${changedCommand.stdout}${changedCommand.stderr}`, 'Updated Cline',
      'a changed command still triggers an update');
    assertEqual(JSON.stringify(readJson(settingsPath).mcpServers.fsb), JSON.stringify(userEntry),
      'updating the command keeps the client timeout, auto-approve list, and disabled toggle');

    writeText(settingsPath, JSON.stringify({
      mcpServers: {
        fsb: {
          transport: { type: 'stdio', command: 'node', args: ['/old/fsb/build/index.js'] },
          disabled: true,
          autoApprove: ['click'],
        },
      },
    }, null, 2));
    const nested = runCli(['install', '--cline'], fixture);
    assertIncludes(
      `${nested.stdout}${nested.stderr}`,
      'Updated Cline',
      'a stale nested-transport entry is updated',
    );
    assertEqual(
      JSON.stringify(readJson(settingsPath).mcpServers.fsb),
      JSON.stringify({
        command: 'npx',
        args: ['-y', 'fsb-mcp-server@latest'],
        timeout: 1800,
        disabled: true,
        autoApprove: ['click'],
      }),
      'updating a nested entry replaces its transport and keeps Cline-owned settings',
    );
  });

  console.log('\n--- cline legacy VS Code settings fallback ---');
  withTempHome('mcp-install-cline-legacy', (fixture) => {
    const legacyPath = clineLegacySettingsPath(fixture);
    writeText(legacyPath, JSON.stringify({ mcpServers: {} }, null, 2));

    const legacyResult = runCli(['install', '--cline'], fixture);
    assertEqual(legacyResult.status, 0, 'legacy cline install exits cleanly');
    assertIncludes(
      `${legacyResult.stdout}${legacyResult.stderr}`,
      'Installed to Cline (legacy VS Code settings)',
      'cline falls back to the legacy VS Code settings when no shared settings exist',
    );
    assert(Object.hasOwn(readJson(legacyPath).mcpServers, 'fsb'), 'legacy fallback writes the fsb entry');

    fs.mkdirSync(path.dirname(clineSettingsPath(fixture)), { recursive: true });
    const sharedPreview = runCli(['install', '--cline', '--dry-run'], fixture);
    assertIncludes(
      `${sharedPreview.stdout}${sharedPreview.stderr}`,
      clineSettingsPath(fixture),
      'a shared settings directory outranks a leftover legacy settings file',
    );
  });

  console.log('\n--- cline settings path environment overrides ---');
  withTempHome('mcp-install-cline-env', (fixture) => {
    const explicitPath = path.join(fixture.root, 'explicit', 'cline_mcp_settings.json');
    const clineDir = path.join(fixture.root, 'cline-home');
    fs.mkdirSync(path.dirname(explicitPath), { recursive: true });
    fs.mkdirSync(path.join(clineDir, 'data', 'settings'), { recursive: true });

    const explicitResult = runCli(['install', '--cline'], fixture, {
      env: { CLINE_MCP_SETTINGS_PATH: explicitPath, CLINE_DIR: clineDir },
    });
    assertEqual(explicitResult.status, 0, 'cline install honors CLINE_MCP_SETTINGS_PATH');
    assert(fs.existsSync(explicitPath), 'CLINE_MCP_SETTINGS_PATH outranks CLINE_DIR');

    const dirPreview = runCli(['install', '--cline', '--dry-run'], fixture, {
      env: { CLINE_DIR: clineDir },
    });
    assertIncludes(
      `${dirPreview.stdout}${dirPreview.stderr}`,
      path.join(clineDir, 'data', 'settings', 'cline_mcp_settings.json'),
      'cline install honors CLINE_DIR',
    );
  });

  console.log('\n--- cline path overrides never fall back to the legacy settings ---');
  withTempHome('mcp-install-cline-env-missing', (fixture) => {
    const legacyPath = clineLegacySettingsPath(fixture);
    const legacyText = JSON.stringify({ mcpServers: { fsb: { command: 'legacy-fsb' } } }, null, 2);
    writeText(legacyPath, legacyText);
    const missingRoot = path.join(fixture.root, 'missing');
    const settingsFile = 'cline_mcp_settings.json';
    const explicitPath = path.join(missingRoot, 'explicit', settingsFile);
    const dataDir = path.join(missingRoot, 'data');
    const clineDir = path.join(missingRoot, 'cline-home');

    for (const [name, value, settingsPath] of [
      ['CLINE_MCP_SETTINGS_PATH', explicitPath, explicitPath],
      ['CLINE_DATA_DIR', dataDir, path.join(dataDir, 'settings', settingsFile)],
      ['CLINE_DIR', clineDir, path.join(clineDir, 'data', 'settings', settingsFile)],
    ]) {
      const installed = runCli(['install', '--cline'], fixture, { env: { [name]: value } });
      const installOutput = `${installed.stdout}${installed.stderr}`;
      assertIncludes(
        installOutput,
        `Directory does not exist: ${path.dirname(settingsPath)}`,
        `${name} reports its missing directory`,
      );
      assertNotIncludes(installOutput, 'legacy VS Code settings', `${name} is not replaced by the legacy settings`);
      assertEqual(fs.readFileSync(legacyPath, 'utf8'), legacyText, `${name} leaves the legacy settings untouched`);
      assert(!fs.existsSync(missingRoot), `${name} does not create the missing directory`);

      const preview = runCli(['install', '--cline', '--dry-run'], fixture, { env: { [name]: value } });
      const previewOutput = `${preview.stdout}${preview.stderr}`;
      assertIncludes(previewOutput, settingsPath, `${name} previews the requested settings file`);
      assertNotIncludes(previewOutput, legacyPath, `${name} does not preview the legacy settings`);
    }

    // An empty PATH keeps --all away from the real claude command.
    const allResult = runCli(['install', '--all'], fixture, { env: { CLINE_DIR: clineDir, PATH: '' } });
    assertIncludes(
      `${allResult.stdout}${allResult.stderr}`,
      'Skipped Cline (config path not detected)',
      'install --all skips Cline while its override directory is missing',
    );
    assertEqual(fs.readFileSync(legacyPath, 'utf8'), legacyText, 'install --all leaves the legacy settings untouched');

    const uninstalled = runCli(['uninstall', '--cline'], fixture, { env: { CLINE_DIR: clineDir } });
    assertEqual(uninstalled.status, 0, 'uninstall with a missing override directory exits cleanly');
    assertIncludes(
      `${uninstalled.stdout}${uninstalled.stderr}`,
      `Cline config file not found: ${path.join(clineDir, 'data', 'settings', settingsFile)}`,
      'uninstall looks only at the requested settings file',
    );
    assertEqual(fs.readFileSync(legacyPath, 'utf8'), legacyText, 'uninstall keeps the fsb entry in the legacy settings');

    const blank = runCli(['install', '--cline', '--dry-run'], fixture, { env: { CLINE_DIR: '   ' } });
    assertIncludes(
      `${blank.stdout}${blank.stderr}`,
      legacyPath,
      'a blank override still falls back to the legacy settings',
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
      'fsb-mcp-server install --native-host [--browser <chrome|edge|brave|chromium>] [--extension-id <id>] Install the selected browser native messaging host',
      'help names the exact optional native install syntax',
    );
    assertIncludes(
      helpOutput,
      'fsb-mcp-server uninstall --native-host [--browser <chrome|edge|brave|chromium>] Remove the selected browser native messaging host',
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

    const missingDoctor = runProductionDoctor(fixture);
    assertEqual(missingDoctor?.nativeHost?.reason, 'not_installed',
      'production doctor derives the missing state from real local facts');
    assertEqual(missingDoctor?.nativeHost?.installState, 'not_installed',
      'production doctor reports a fully absent native host as not installed');
    assert(!fs.existsSync(path.join(fixture.home, '.fsb', 'native-host')),
      'missing-state production inspection performs zero runtime mutation');

    const productionInstall = runCli(['install', '--native-host'], fixture);
    const productionInstallOutput = `${productionInstall.stdout}${productionInstall.stderr}`;
    assertEqual(
      productionInstall.status,
      0,
      'direct production CLI installs without inherited npm_execpath',
    );
    assertIncludes(
      productionInstallOutput,
      'Native messaging host installed.',
      'production CLI reports the bounded real install receipt',
    );
    const stableRoot = path.join(fixture.home, '.fsb', 'native-host');
    const manifestPath = process.platform === 'darwin'
      ? path.join(
        fixture.home,
        'Library',
        'Application Support',
        'Google',
        'Chrome',
        'NativeMessagingHosts',
        'io.github.fullselfbrowsing.fsb_native_host.json',
      )
      : path.join(
        fixture.home,
        '.config',
        'google-chrome',
        'NativeMessagingHosts',
        'io.github.fullselfbrowsing.fsb_native_host.json',
    );
    assert(fs.existsSync(stableRoot), 'production composition publishes the stable owned runtime');
    assert(fs.existsSync(manifestPath), 'production composition publishes the Chrome manifest');
    if (fs.existsSync(manifestPath)) {
      const exactManifest = readText(manifestPath);
      const offlineDoctor = runProductionDoctor(fixture);
      assertEqual(offlineDoctor?.nativeHost?.reason, 'daemon_offline',
        'production doctor reuses the exact daemon health classifier');
      assertEqual(offlineDoctor?.nativeHost?.installState, 'installed',
        'an exact install remains installed while its daemon is offline');
      assertEqual(readText(manifestPath), exactManifest,
        'installed-state production inspection performs zero registration mutation');

      const mismatchedManifest = JSON.parse(exactManifest);
      mismatchedManifest.allowed_origins = [`chrome-extension://${DEVELOPMENT_EXTENSION_ID}/`];
      fs.writeFileSync(manifestPath, `${JSON.stringify(mismatchedManifest)}\n`, 'utf8');
      const mismatchDoctor = runProductionDoctor(fixture);
      assertEqual(mismatchDoctor?.nativeHost?.reason, 'allowlist_mismatch',
        'production doctor distinguishes a structurally valid allowlist mismatch');
      fs.writeFileSync(manifestPath, exactManifest, 'utf8');

      const launcherPath = path.join(stableRoot, 'bin', 'fsb-native-host-launcher.mjs');
      const exactLauncher = fs.readFileSync(launcherPath);
      fs.appendFileSync(launcherPath, '\n// corrupt fixture\n');
      const corruptDoctor = runProductionDoctor(fixture);
      assertEqual(corruptDoctor?.nativeHost?.reason, 'runtime_invalid',
        'production doctor rejects a corrupt owned runtime before daemon facts');
      fs.writeFileSync(launcherPath, exactLauncher);

      const healthChild = startReadyHealthFixture(fixture);
      try {
        const readyDoctor = runProductionDoctor(fixture);
        assertEqual(readyDoctor?.nativeHost?.reason, 'ok',
          'production doctor reports ready only from exact install and health facts');
        assertEqual(readyDoctor?.nativeHost?.daemon, 'reachable',
          'production doctor maps the exact loopback health contract to reachable');
      } finally {
        healthChild.kill('SIGTERM');
      }
    }

    const idempotentInstall = runCli(['install', '--native-host'], fixture);
    assertEqual(
      idempotentInstall.status,
      0,
      'direct production native install is idempotent without inherited npm_execpath',
    );
    assertIncludes(
      `${idempotentInstall.stdout}${idempotentInstall.stderr}`,
      'Native messaging host is already installed.',
      'production composition reuses its persisted exact ownership receipt',
    );

    const productionUninstall = runCli(['uninstall', '--native-host'], fixture);
    assertEqual(
      productionUninstall.status,
      0,
      'direct production CLI uninstalls without inherited npm_execpath',
    );
    assertIncludes(
      `${productionUninstall.stdout}${productionUninstall.stderr}`,
      'Native messaging host removed.',
      'production CLI reports the bounded real uninstall receipt',
    );
    assert(!fs.existsSync(stableRoot), 'production uninstall removes only the exact owned runtime');
    assert(!fs.existsSync(manifestPath), 'production uninstall removes the exact Chrome manifest');

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

  if (process.platform !== 'win32') {
    console.log('\n--- native cross-browser split state ---');
    withTempHome('mcp-native-cross-browser-split', (fixture) => {
      const manifestName = 'io.github.fullselfbrowsing.fsb_native_host.json';
      const edgeManifestPath = process.platform === 'darwin'
        ? path.join(
          fixture.home,
          'Library',
          'Application Support',
          'Microsoft Edge',
          'NativeMessagingHosts',
          manifestName,
        )
        : path.join(
          fixture.home,
          '.config',
          'microsoft-edge',
          'NativeMessagingHosts',
          manifestName,
        );
      const chromeManifestPath = process.platform === 'darwin'
        ? path.join(
          fixture.home,
          'Library',
          'Application Support',
          'Google',
          'Chrome',
          'NativeMessagingHosts',
          manifestName,
        )
        : path.join(
          fixture.home,
          '.config',
          'google-chrome',
          'NativeMessagingHosts',
          manifestName,
        );
      const orphanRegistration = '{"foreign":"edge-registration"}\n';
      writeText(edgeManifestPath, orphanRegistration);

      const installResult = runCli(['install', '--native-host'], fixture);
      assertEqual(installResult.status, 1, 'Chrome install refuses an existing Edge registration');
      assertIncludes(
        `${installResult.stdout}${installResult.stderr}`,
        'not changed: split-state',
        'cross-browser install reports a stable split-state refusal',
      );
      assertEqual(
        readText(edgeManifestPath),
        orphanRegistration,
        'cross-browser install preserves the existing Edge registration byte-for-byte',
      );
      assert(!fs.existsSync(chromeManifestPath), 'cross-browser install publishes no Chrome registration');
      assert(
        !fs.existsSync(path.join(fixture.home, '.fsb', 'native-host')),
        'cross-browser install materializes no shared runtime',
      );

      const chromeUninstall = runCli(['uninstall', '--native-host', '--browser', 'chrome'], fixture);
      assertEqual(chromeUninstall.status, 1, 'Chrome uninstall refuses an existing Edge registration');
      assertEqual(
        readText(edgeManifestPath),
        orphanRegistration,
        'cross-browser uninstall preserves the existing Edge registration byte-for-byte',
      );

      // Without --browser, uninstall removes only what FSB owns. Nothing is
      // owned here, so it reports nothing installed and leaves Edge alone.
      const uninstallAll = runCli(['uninstall', '--native-host'], fixture);
      assertEqual(uninstallAll.status, 0, 'uninstall of every registration with none owned exits cleanly');
      assertIncludes(
        `${uninstallAll.stdout}${uninstallAll.stderr}`,
        'Native messaging host is not installed.',
        'uninstall of every registration reports that no owned helper exists',
      );
      assertEqual(
        readText(edgeManifestPath),
        orphanRegistration,
        'uninstall of every registration preserves a registration FSB does not own',
      );
    });
  }

  if (process.platform !== 'win32') {
    console.log('\n--- client install sets up the helper; the last client removes it ---');
    withTempHome('mcp-native-auto-helper', (fixture) => {
      const nativeEnv = nativeHostTestEnvironment('chrome');
      const helper = (args, extra = {}) => runCli(args, fixture, {
        nativeHost: true,
        env: { ...nativeEnv, ...extra },
      });
      const stableRoot = path.join(fixture.home, '.fsb', 'native-host');
      const receiptPath = path.join(stableRoot, 'install-receipt.json');
      const markerPath = path.join(stableRoot, 'owner.json');
      const optOutPath = path.join(fixture.home, '.fsb', 'native-host-opt-out.json');
      const manifestPath = process.platform === 'darwin'
        ? path.join(fixture.home, 'Library', 'Application Support', 'Google', 'Chrome',
          'NativeMessagingHosts', 'io.github.fullselfbrowsing.fsb_native_host.json')
        : path.join(fixture.home, '.config', 'google-chrome',
          'NativeMessagingHosts', 'io.github.fullselfbrowsing.fsb_native_host.json');
      const mcpVersion = require('../mcp/package.json').version;
      const lowerVersion = () => {
        const marker = readJson(markerPath);
        const receipt = readJson(receiptPath);
        marker.packageVersion = '0.0.1';
        receipt.packageVersion = '0.0.1';
        receipt.marker = { ...marker };
        fs.writeFileSync(markerPath, `${JSON.stringify(marker)}\n`);
        fs.writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);
      };
      const siblings = () => fs.readdirSync(path.join(fixture.home, '.fsb'))
        .filter((name) => /^native-host\.(?:stage|next|retired|quarantine|remove)-/u.test(name));
      fs.mkdirSync(path.join(fixture.home, '.codex'), { recursive: true });

      const first = helper(['install', '--codex']);
      const firstOutput = `${first.stdout}${first.stderr}`;
      assertEqual(first.status, 0, 'install --codex exits cleanly while setting up the helper');
      assertIncludes(firstOutput, 'Installed to Codex CLI', 'install --codex still writes the client config');
      assertIncludes(firstOutput, "Installed FSB's local helper (native messaging host) for Chrome",
        'install --codex sets up the helper for the detected browser');
      assert(fs.existsSync(stableRoot) && fs.existsSync(manifestPath), 'install --codex publishes the helper and its registration');
      assertEqual(readJson(receiptPath).provenance, 'auto', 'a helper set up by client install records auto provenance');

      const second = helper(['install', '--codex']);
      assertIncludes(`${second.stdout}${second.stderr}`,
        "FSB's local helper (native messaging host) is already installed for Chrome",
        'a second install reports the helper as already installed');

      const quiet = helper(['install', '--native-host', '--ensure', '--quiet']);
      assertEqual(quiet.status, 0, 'the background refresh command exits 0');
      assertEqual(`${quiet.stdout}${quiet.stderr}`, '', 'the background refresh command writes nothing');

      lowerVersion();
      const refreshed = helper(['install', '--native-host', '--ensure', '--quiet']);
      assertEqual(refreshed.status, 0, 'refreshing an older helper exits 0');
      assertEqual(`${refreshed.stdout}${refreshed.stderr}`, '', 'refreshing an older helper writes nothing');
      assertEqual(readJson(receiptPath).packageVersion, mcpVersion, 'the background refresh replaces an older helper');
      assertEqual(readJson(receiptPath).provenance, 'auto', 'the background refresh keeps auto provenance');
      assertEqual(siblings().length, 0, 'the refresh leaves no staging, next or retired directories');

      const lastClient = helper(['uninstall', '--codex']);
      const lastOutput = `${lastClient.stdout}${lastClient.stderr}`;
      assertEqual(lastClient.status, 0, 'uninstalling the last client exits cleanly');
      assertIncludes(lastOutput, "Removed FSB's local helper (native messaging host) from Chrome",
        'uninstalling the last client removes an auto helper');
      assert(!fs.existsSync(stableRoot) && !fs.existsSync(manifestPath), 'the last-client uninstall removes the helper and its registration');
      assert(!fs.existsSync(optOutPath), 'a last-client uninstall writes no opt-out');

      // A development extension id survives a refresh.
      const devInstall = helper(['install', '--codex', '--extension-id', DEVELOPMENT_EXTENSION_ID]);
      assertEqual(devInstall.status, 0, 'install --codex --extension-id exits cleanly');
      assertEqual(JSON.stringify(readJson(manifestPath).allowed_origins),
        JSON.stringify([`chrome-extension://${DEVELOPMENT_EXTENSION_ID}/`]),
        'install --extension-id registers the development origin');
      lowerVersion();
      helper(['install', '--native-host', '--ensure', '--quiet']);
      assertEqual(readJson(receiptPath).packageVersion, mcpVersion, 'the refresh replaces the older development helper');
      assertEqual(JSON.stringify(readJson(manifestPath).allowed_origins),
        JSON.stringify([`chrome-extension://${DEVELOPMENT_EXTENSION_ID}/`]),
        'the refresh keeps the development extension id rather than the store default');

      // The explicit repair path refreshes an older helper and owns it from then on.
      lowerVersion();
      const repair = helper(['install', '--native-host', '--extension-id', DEVELOPMENT_EXTENSION_ID]);
      assertEqual(repair.status, 0, 'install --native-host repairs an older helper instead of refusing');
      assertIncludes(`${repair.stdout}${repair.stderr}`,
        `Native messaging host updated from 0.0.1 to ${mcpVersion}.`,
        'install --native-host reports the refresh');
      assertEqual(readJson(receiptPath).provenance, 'explicit', 'install --native-host records explicit provenance');
      fs.writeFileSync(path.join(fixture.home, '.codex', 'config.toml'),
        '[mcp_servers.fsb]\ncommand = "npx"\nargs = ["-y", "fsb-mcp-server@latest"]\n');
      const keptExplicit = helper(['uninstall', '--codex']);
      assertIncludes(`${keptExplicit.stdout}${keptExplicit.stderr}`,
        "Kept FSB's local helper (native messaging host): install --native-host set it up",
        'uninstalling the last client keeps an explicit helper and says why');
      assert(fs.existsSync(stableRoot), 'an explicit helper survives its last client');

      // uninstall --native-host removes it however it was installed and pauses refreshes.
      const removed = helper(['uninstall', '--native-host']);
      assertEqual(removed.status, 0, 'uninstall --native-host exits cleanly');
      assertIncludes(`${removed.stdout}${removed.stderr}`, 'Removed registrations: Chrome',
        'uninstall --native-host removes every registration');
      assert(!fs.existsSync(stableRoot), 'uninstall --native-host removes an explicit helper');
      assertEqual(readJson(optOutPath).reason, 'uninstall-native-host', 'uninstall --native-host writes the opt-out marker');
      const pausedRefresh = helper(['install', '--native-host', '--ensure']);
      assertIncludes(`${pausedRefresh.stdout}${pausedRefresh.stderr}`, 'was not changed: opt-out',
        'the background refresh honors the opt-out');

      // Any later install withdraws the opt-out.
      const reinstall = helper(['install', '--codex']);
      assertIncludes(`${reinstall.stdout}${reinstall.stderr}`, "Installed FSB's local helper (native messaging host) for Chrome",
        'a later client install sets the helper up again');
      assert(!fs.existsSync(optOutPath), 'a later client install clears the opt-out marker');

      // A configured delegation provider keeps the helper.
      const providerRoot = path.join(fixture.home, '.fsb', 'agent-providers', 'grok');
      fs.mkdirSync(providerRoot, { recursive: true });
      const keptProvider = helper(['uninstall', '--codex']);
      assertIncludes(`${keptProvider.stdout}${keptProvider.stderr}`,
        'was not removed: a delegation provider is configured in ~/.fsb/agent-providers (grok)',
        'a delegation provider keeps the helper after its last client');
      assert(fs.existsSync(stableRoot), 'the helper survives while a delegation provider is configured');
      const keptAll = helper(['uninstall', '--all'], { PATH: path.join(fixture.root, 'empty-bin') });
      assert(fs.existsSync(stableRoot), 'uninstall --all keeps a helper a delegation provider uses');
      assertEqual(readJson(optOutPath).reason, 'uninstall-all', 'uninstall --all still writes the opt-out marker');
      assertIncludes(`${keptAll.stdout}${keptAll.stderr}`, 'a delegation provider is configured',
        'uninstall --all says why the helper stays');
      fs.rmSync(path.join(fixture.home, '.fsb', 'agent-providers'), { recursive: true, force: true });
      const removedAll = helper(['uninstall', '--all'], { PATH: path.join(fixture.root, 'empty-bin') });
      assertIncludes(`${removedAll.stdout}${removedAll.stderr}`, "Removed FSB's local helper (native messaging host)",
        'uninstall --all removes an auto helper once nothing else needs it');
      assert(!fs.existsSync(stableRoot) && !fs.existsSync(manifestPath), 'uninstall --all removes the helper and its registration');

      // --no-native-host writes only the client config and pauses refreshes.
      const skipped = helper(['install', '--codex', '--no-native-host']);
      assertEqual(skipped.status, 0, 'install --no-native-host exits cleanly');
      assert(!fs.existsSync(stableRoot), 'install --no-native-host publishes no helper');
      assertEqual(readJson(optOutPath).reason, 'install-no-native-host', 'install --no-native-host writes the opt-out marker');
    });
  }

  console.log('\n--- native npm CLI provenance ---');
  withTempHome('mcp-native-hostile-npm-cli', (fixture) => {
    const sentinelPath = path.join(fixture.root, 'untrusted-npm-ran.txt');
    const untrustedNpmCli = path.join(fixture.root, 'untrusted', 'npm', 'bin', 'npm-cli.js');
    writeText(
      untrustedNpmCli,
      `require('node:fs').writeFileSync(${JSON.stringify(sentinelPath)}, 'executed');\n`,
    );

    const installResult = runCli(['install', '--native-host'], fixture, {
      env: { npm_execpath: untrustedNpmCli },
    });
    assertEqual(
      installResult.status,
      0,
      'production install ignores an out-of-provenance absolute npm CLI candidate',
    );
    assert(
      !fs.existsSync(sentinelPath),
      'production install never executes an out-of-provenance npm CLI candidate',
    );

    const uninstallResult = runCli(['uninstall', '--native-host'], fixture, {
      env: { npm_execpath: untrustedNpmCli },
    });
    assertEqual(
      uninstallResult.status,
      0,
      'production uninstall has no npm CLI resolution or materialization dependency',
    );
    assert(
      !fs.existsSync(sentinelPath),
      'production uninstall never executes an inherited npm CLI candidate',
    );
  });

  withTempHome('mcp-native-invalid-npm-cli', (fixture) => {
    const installResult = runCli(['install', '--native-host'], fixture, {
      env: { npm_execpath: path.join(fixture.root, 'not-npm.js') },
    });
    assertEqual(
      installResult.status,
      0,
      'production install resolves a trusted npm CLI when the inherited candidate is invalid',
    );
    const uninstallResult = runCli(['uninstall', '--native-host'], fixture, {
      env: { npm_execpath: path.join(fixture.root, 'not-npm.js') },
    });
    assertEqual(
      uninstallResult.status,
      0,
      'production uninstall remains available when the inherited npm candidate is invalid',
    );
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
