'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  PASS:', message);
  } else {
    failed++;
    console.error('  FAIL:', message);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

function assertThrows(callback, pattern, message) {
  try {
    callback();
    assert(false, `${message} (did not throw)`);
  } catch (error) {
    assert(pattern.test(String(error && error.message)), message);
  }
}

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'mcp', 'build', 'index.js');
const authModuleUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'bridge-auth.js')).href;
const pairingPattern = /fsb-auth\.[A-Za-z0-9_-]{43}/g;

function withTempHome(label, callback) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `fsb-${label}-`));
  try {
    return callback(home);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function runCli(args, home) {
  return spawnSync('node', [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
  });
}

async function run() {
  const auth = await import(`${authModuleUrl}?test=${Date.now()}`);

  console.log('\n--- auth state rotation and filesystem contract ---');
  withTempHome('bridge-auth-state', (home) => {
    const authPath = auth.getBridgeAuthPath(home);
    const first = auth.rotateBridgeSessionSecret(authPath, 1000);
    const firstCode = auth.formatPairingCode(first);

    assertEqual(Buffer.from(first.sessionSecret, 'base64url').length, 32, 'session secret decodes to exactly 32 bytes');
    assertEqual(firstCode.length, 'fsb-auth.'.length + 43, 'pairing code has the fixed header-safe length');
    assert(/^fsb-auth\.[A-Za-z0-9_-]{43}$/.test(firstCode), 'pairing code uses the exact fsb-auth base64url grammar');
    assertEqual(first.rotatedAt, 1000, 'injected rotation timestamp is retained');
    assertEqual(fs.statSync(authPath).mode & 0o777, 0o600, 'auth target mode is 0600');
    assertEqual(fs.statSync(path.dirname(authPath)).mode & 0o777, 0o700, 'auth directory mode is 0700');
    assertEqual(fs.readdirSync(path.dirname(authPath)).length, 1, 'atomic replacement leaves no temporary file');

    const bound = auth.bindAllowedExtensionOrigin('chrome-extension://extension-one', authPath);
    assertEqual(bound.allowedExtensionOrigin, 'chrome-extension://extension-one', 'first exact extension Origin binds');
    assertEqual(
      auth.bindAllowedExtensionOrigin('chrome-extension://extension-one', authPath).sessionId,
      bound.sessionId,
      'matching extension Origin is idempotent',
    );
    assertThrows(
      () => auth.bindAllowedExtensionOrigin('chrome-extension://extension-two', authPath),
      /pairing mismatch/i,
      'different extension Origin fails with a generic pairing mismatch',
    );
    assertThrows(
      () => auth.bindAllowedExtensionOrigin('chrome-extension://extension-one/path', authPath),
      /pairing mismatch/i,
      'extension Origin with a path is rejected',
    );

    const second = auth.rotateBridgeSessionSecret(authPath, 2000);
    assert(second.sessionSecret !== first.sessionSecret, 'ordinary rotation changes session secret');
    assert(second.sessionId !== first.sessionId, 'ordinary rotation changes session ID');
    assertEqual(second.allowedExtensionOrigin, bound.allowedExtensionOrigin, 'ordinary rotation preserves exact allowed Origin');
    assert(auth.authenticateBridgeProtocols(`fsb-ext-v1, ${auth.formatPairingCode(second)}`, second), 'current stable and auth protocols authenticate');
    assert(!auth.authenticateBridgeProtocols(`fsb-ext-v1, ${firstCode}`, second), 'old protocol credential fails after rotation');
    assert(!auth.authenticateBridgeProtocols(auth.formatPairingCode(second), second), 'auth protocol without stable protocol fails');
    assert(!auth.authenticateBridgeProtocols(`fsb-ext-v1, ${auth.formatPairingCode(second)}, fsb-auth.${'A'.repeat(43)}`, second), 'multiple auth candidates fail closed');
    assert(!auth.authenticateBridgeProtocols(['fsb-ext-v1', 'fsb-auth.short'], second), 'unequal-length credential fails without throwing');

    const reset = auth.resetBridgePairing(authPath, 3000);
    assertEqual(reset.allowedExtensionOrigin, null, 'explicit reset clears the durable Origin');
    assert(reset.sessionSecret !== second.sessionSecret, 'explicit reset rotates the session secret');
    assert(reset.sessionId !== second.sessionId, 'explicit reset rotates the session ID');
    assert(!auth.authenticateBridgeProtocols(auth.formatPairingCode(second), reset), 'pre-reset credential no longer authenticates');
    assertEqual(
      auth.bindAllowedExtensionOrigin('chrome-extension://extension-two', authPath).allowedExtensionOrigin,
      'chrome-extension://extension-two',
      'new exact extension ID binds after reset',
    );
  });

  console.log('\n--- malformed and symlink state fail closed ---');
  withTempHome('bridge-auth-invalid', (home) => {
    const authPath = auth.getBridgeAuthPath(home);
    fs.mkdirSync(path.dirname(authPath), { recursive: true });
    fs.writeFileSync(authPath, JSON.stringify({ version: 1, sessionSecret: 'partial' }));
    assertEqual(auth.readBridgeAuthState(authPath), null, 'malformed state is never partially trusted');
    const replaced = auth.rotateBridgeSessionSecret(authPath, 4000);
    assertEqual(replaced.rotatedAt, 4000, 'explicit rotation replaces malformed regular state');

    fs.unlinkSync(authPath);
    const symlinkTarget = path.join(home, 'outside.json');
    fs.writeFileSync(symlinkTarget, JSON.stringify(replaced));
    fs.symlinkSync(symlinkTarget, authPath);
    assertEqual(auth.readBridgeAuthState(authPath), null, 'symlink auth state fails closed on read');
    assertThrows(
      () => auth.rotateBridgeSessionSecret(authPath, 5000),
      /target is unavailable/i,
      'explicit rotation refuses a symlink target',
    );
  });

  console.log('\n--- pair CLI lifecycle and disclosure contract ---');
  withTempHome('bridge-auth-cli', (home) => {
    const missing = runCli(['pair'], home);
    assert(missing.status !== 0, 'pair without current serve state exits nonzero');
    assert(/start `fsb-mcp-server serve` first/i.test(missing.stderr), 'missing-state output gives a generic serve instruction');

    const authPath = auth.getBridgeAuthPath(home);
    const initial = auth.rotateBridgeSessionSecret(authPath, 6000);
    auth.bindAllowedExtensionOrigin('chrome-extension://extension-one', authPath);

    const plain = runCli(['pair'], home);
    const plainTokens = plain.stdout.match(pairingPattern) || [];
    assertEqual(plain.status, 0, 'plain pair exits cleanly');
    assertEqual(plainTokens.length, 1, 'plain pair emits exactly one full pairing code');
    assert(/local daemon session/i.test(plain.stdout), 'plain pair explains the local session authority');
    assertEqual(plain.stderr, '', 'plain pair keeps its warning and code on stdout only');

    const json = runCli(['pair', '--json'], home);
    const parsed = JSON.parse(json.stdout);
    assertEqual(json.status, 0, 'JSON pair exits cleanly');
    assertEqual(Object.keys(parsed).sort().join(','), 'pairingCode,protocol,rotatedAt', 'JSON pair has exactly the specified fields');
    assertEqual(parsed.protocol, 'fsb-ext-v1', 'JSON pair reports only the stable protocol');
    assertEqual(parsed.pairingCode, auth.formatPairingCode(auth.readBridgeAuthState(authPath)), 'JSON pair reports the current code');

    const beforeReset = auth.readBridgeAuthState(authPath);
    const resetResult = runCli(['pair', '--reset', '--json'], home);
    const resetJson = JSON.parse(resetResult.stdout);
    const afterReset = auth.readBridgeAuthState(authPath);
    assertEqual(resetResult.status, 0, 'pair --reset exits cleanly');
    assert(/revoked/i.test(resetResult.stderr), 'pair --reset prints an explicit revocation warning');
    assertEqual(afterReset.allowedExtensionOrigin, null, 'pair --reset clears the Origin binding');
    assert(afterReset.sessionSecret !== beforeReset.sessionSecret, 'pair --reset rotates the CLI-visible credential');
    assert(afterReset.sessionId !== beforeReset.sessionId, 'pair --reset rotates the socket session ID');
    assertEqual(resetJson.pairingCode, auth.formatPairingCode(afterReset), 'pair --reset outputs only the new code');
    assert(!auth.authenticateBridgeProtocols(auth.formatPairingCode(initial), afterReset), 'old CLI code fails after reset');
    assertEqual(
      auth.bindAllowedExtensionOrigin('chrome-extension://extension-two', authPath).allowedExtensionOrigin,
      'chrome-extension://extension-two',
      'pair --reset permits the next exact extension ID to bind',
    );

    const current = auth.readBridgeAuthState(authPath);
    const code = auth.formatPairingCode(current);
    const interior = code.slice(14, 34);
    for (const command of [['status', '--timeout', '1'], ['doctor', '--timeout', '1']]) {
      const result = runCli(command, home);
      const output = `${result.stdout}${result.stderr}`;
      assert(!output.includes(code), `${command[0]} output omits the full credential`);
      assert(!output.includes(interior), `${command[0]} output omits an interior credential substring`);
    }
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
