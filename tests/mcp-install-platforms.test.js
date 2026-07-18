'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

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

function findNpmCliPath() {
  const result = spawnSync('npm', ['root', '--global'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  assertEqual(result.status, 0, 'production native-host fixture resolves the installed npm CLI');
  const candidate = path.join(result.stdout.trim(), 'npm', 'bin', 'npm-cli.js');
  return fs.realpathSync(candidate);
}

const npmCliPath = findNpmCliPath();

function runCli(args, fixture) {
  return spawnSync('node', [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: fixture.home,
      APPDATA: fixture.appData,
      LOCALAPPDATA: fixture.localAppData,
      npm_execpath: npmCliPath,
    },
  });
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
  if (fixture.doctorLayer === undefined && snapshot) fixture.doctorLayer = snapshot.diagnosticLayer;
  assert(snapshot && snapshot.diagnosticLayer === fixture.doctorLayer,
    'native-host facts do not change the historical doctor health layer');
  return snapshot;
}

function startReadyHealthFixture(fixture) {
  const readyPath = path.join(fixture.root, 'health-ready.txt');
  const source = [
    "const fs = require('node:fs');",
    "const http = require('node:http');",
    'const readyPath = process.argv[1];',
    'const body = JSON.stringify({ ok: true, service: \'fsb-mcp-server\', version: \'0.10.0\', nativeHostProtocol: 1, serveReady: true });',
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

    const missingDoctor = runProductionDoctor(fixture);
    assertEqual(missingDoctor?.nativeHost?.reason, 'not_installed',
      'production doctor derives the missing state from real local facts');
    assertEqual(missingDoctor?.nativeHost?.installState, 'not_installed',
      'production doctor reports a fully absent native host as not installed');

    const productionInstall = runCli(['install', '--native-host'], fixture);
    const productionInstallOutput = `${productionInstall.stdout}${productionInstall.stderr}`;
    assertEqual(productionInstall.status, 0, 'production CLI reaches the real native install transaction');
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

    const offlineDoctor = runProductionDoctor(fixture);
    assertEqual(offlineDoctor?.nativeHost?.reason, 'daemon_offline',
      'production doctor reuses the exact daemon health classifier');
    assertEqual(offlineDoctor?.nativeHost?.installState, 'installed',
      'an exact install remains installed while its daemon is offline');

    const exactManifest = readText(manifestPath);
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

    const idempotentInstall = runCli(['install', '--native-host'], fixture);
    assertEqual(idempotentInstall.status, 0, 'production native install is idempotent');
    assertIncludes(
      `${idempotentInstall.stdout}${idempotentInstall.stderr}`,
      'Native messaging host is already installed.',
      'production composition reuses its persisted exact ownership receipt',
    );

    const productionUninstall = runCli(['uninstall', '--native-host'], fixture);
    assertEqual(productionUninstall.status, 0, 'production CLI reaches the real native uninstall transaction');
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

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
