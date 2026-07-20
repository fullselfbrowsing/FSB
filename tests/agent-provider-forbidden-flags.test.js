'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const scanner = path.join(repoRoot, 'scripts', 'verify-agent-provider-flags.mjs');
const forbiddenFlags = [
  '--dangerously-skip-permissions',
  '--yolo',
  '--auto',
];

function runScanner(root) {
  return spawnSync(process.execPath, [scanner, '--root', root], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function combinedOutput(result) {
  return String(result.stdout || '') + String(result.stderr || '');
}

function write(root, relativePath, source) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source, 'utf8');
  return file;
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-agent-provider-flags-'));

try {
  const missing = runScanner(path.join(tempRoot, 'missing-agent-providers'));
  assert.strictEqual(missing.status, 0, `missing scan directory should be clean: ${combinedOutput(missing)}`);

  const cleanRoot = path.join(tempRoot, 'clean');
  write(cleanRoot, 'nested/adapter.ts', 'export const flags = ["--permission-mode", "dontAsk"];\n');
  write(cleanRoot, 'nested/config.json', '{"mode":"review"}\n');
  write(cleanRoot, 'nested/README', 'No automatic approval switches are used.\n');
  const clean = runScanner(cleanRoot);
  assert.strictEqual(clean.status, 0, `clean nested files should pass: ${combinedOutput(clean)}`);

  const extensions = ['.ts', '.js', '.json', ''];
  for (let flagIndex = 0; flagIndex < forbiddenFlags.length; flagIndex += 1) {
    for (let extensionIndex = 0; extensionIndex < extensions.length; extensionIndex += 1) {
      const flag = forbiddenFlags[flagIndex];
      const extension = extensions[extensionIndex];
      const caseRoot = path.join(tempRoot, `case-${flagIndex}-${extensionIndex}`);
      const relativeFile = `nested/candidate${extension}`;
      write(caseRoot, relativeFile, `safe first line\n${flag}\n`);
      const result = runScanner(caseRoot);
      const output = combinedOutput(result);
      assert.strictEqual(result.status, 1, `${flag} in ${extension || 'extensionless'} should fail`);
      assert(output.includes(`${relativeFile}:2: forbidden agent-provider flag`), `diagnostic should name ${relativeFile}:2`);
      assert(!output.includes(flag), 'diagnostic must not print the matched source text');
    }
  }

  const multipleRoot = path.join(tempRoot, 'multiple');
  write(
    multipleRoot,
    'a/first.ts',
    `${forbiddenFlags[0]} ${forbiddenFlags[0]}\nsafe\n${forbiddenFlags[1]}\n`,
  );
  write(multipleRoot, 'b/second', `safe\n${forbiddenFlags[2]}\n`);
  const multiple = runScanner(multipleRoot);
  const multipleOutput = combinedOutput(multiple);
  assert.strictEqual(multiple.status, 1, 'multiple matches should fail');
  assert.strictEqual((multipleOutput.match(/forbidden agent-provider flag/g) || []).length, 4, 'every match should report');
  assert(multipleOutput.indexOf('a/first.ts:1') < multipleOutput.indexOf('b/second:2'), 'diagnostics should be path deterministic');

  const linkRoot = path.join(tempRoot, 'symlink-file');
  fs.mkdirSync(path.join(linkRoot, 'nested'), { recursive: true });
  const linkTarget = path.join(tempRoot, 'linked-target.txt');
  fs.writeFileSync(linkTarget, `safe\n${forbiddenFlags[1]}\n`, 'utf8');
  fs.symlinkSync(linkTarget, path.join(linkRoot, 'nested', 'linked'));
  const linked = runScanner(linkRoot);
  assert.strictEqual(linked.status, 1, 'symlink-resolved regular files should be scanned');
  assert(combinedOutput(linked).includes('nested/linked:2: forbidden agent-provider flag'));

  const brokenRoot = path.join(tempRoot, 'broken-link');
  fs.mkdirSync(brokenRoot, { recursive: true });
  fs.symlinkSync(path.join(tempRoot, 'absent-target'), path.join(brokenRoot, 'broken'));
  const broken = runScanner(brokenRoot);
  assert.strictEqual(broken.status, 1, 'symlink resolution errors should fail closed');
  assert(combinedOutput(broken).includes('broken: symlink resolution failed'));

  const unreadableRoot = path.join(tempRoot, 'unreadable');
  const unreadableFile = write(unreadableRoot, 'nested/private.ts', 'safe\n');
  fs.chmodSync(unreadableFile, 0o000);
  let permissionsEnforced = false;
  try {
    fs.readFileSync(unreadableFile, 'utf8');
  } catch (_error) {
    permissionsEnforced = true;
  }
  if (permissionsEnforced) {
    const unreadable = runScanner(unreadableRoot);
    assert.strictEqual(unreadable.status, 1, 'unreadable files should fail closed');
    assert(combinedOutput(unreadable).includes('nested/private.ts: read failed'));
  } else {
    console.log('  SKIP: file permissions are not enforceable on this platform/user');
  }
  fs.chmodSync(unreadableFile, 0o600);

  const profilePath = path.join(
    repoRoot,
    'mcp',
    'src',
    'agent-providers',
    'opencode-profile.ts',
  );
  const detectorPath = path.join(
    repoRoot,
    'mcp',
    'src',
    'agent-providers',
    'opencode-detect.ts',
  );
  const profileSource = fs.readFileSync(profilePath, 'utf8');
  const detectorSource = fs.readFileSync(detectorPath, 'utf8');
  for (const sourceFlag of [
    'OPENCODE_DISABLE_PROJECT_CONFIG',
    'OPENCODE_DISABLE_CLAUDE_CODE_PROMPT',
    'OPENCODE_DISABLE_EXTERNAL_SKILLS',
    'OPENCODE_DISABLE_AUTOUPDATE',
    'OPENCODE_DISABLE_LSP_DOWNLOAD',
    'OPENCODE_TEST_HOME',
    'OPENCODE_TEST_MANAGED_CONFIG_DIR',
    'XDG_CONFIG_HOME',
  ]) assert(profileSource.includes(sourceFlag), `${sourceFlag} is source-pinned`);
  assert(profileSource.includes("'--pure'"));
  assert(profileSource.includes("'--log-level'"));
  assert(profileSource.includes("'ERROR'"));
  assert(profileSource.includes("'--hostname', '127.0.0.1'"));
  assert(profileSource.includes("'--port', '0'"));
  assert(profileSource.includes("'--mdns', 'false'"));
  assert(profileSource.includes("'--attach'"));
  assert(profileSource.includes("'owned_server_endpoint'"));
  assert(profileSource.includes("path: '/config'"));
  assert(profileSource.includes("path: '/agent'"));
  assert(profileSource.includes("prefixRef: 'fsb_mcp_tool_prefix'"));
  assert(profileSource.includes('SHIPPED_FSB_PROMPT_SHA256'));
  assert(profileSource.includes("'*': 'deny'"));
  assert(profileSource.includes("'fsb_*': 'allow'"));
  assert(profileSource.indexOf("'*': 'deny'") < profileSource.indexOf("'fsb_*': 'allow'"));
  assert(profileSource.includes('OPENCODE_SERVER_PASSWORD_ENV_KEY'));
  assert(profileSource.includes('OWNED_SERVER_BASIC_PASSWORD_SECRET_REF'));
  assert(detectorSource.includes("OPENCODE_PROFILE_VERSION = '1.14.25'"));
  assert(detectorSource.includes('shell: false'));

  for (const forbidden of [
    '--model',
    '--continue',
    '--session',
    '--fork',
    '--share',
    '--file',
    '--command',
    '--print-logs',
    '--password',
  ]) assert(!profileSource.includes(forbidden), `${forbidden} is absent from OpenCode profile`);
  for (const forbiddenPattern of [
    /\bHOME\s*:/,
    /\bXDG_DATA_HOME\b/,
    /\bXDG_STATE_HOME\b/,
    /\bXDG_CACHE_HOME\b/,
    /\bOPENCODE_SERVER_PASSWORD\s*:/,
    /\b(?:ANTHROPIC|OPENAI|GOOGLE|GEMINI)_[A-Z_]*KEY\b/,
    /\bAuthorization\b/,
    /\bBasic\s+/,
    /process\.env/,
    /from ['"]node:(?:child_process|http|https|net|tls)['"]/,
    /export function (?:check|verify|reduce)OpenCode/,
    /adapterId\s*===\s*['"]opencode['"]/,
  ]) assert(!forbiddenPattern.test(profileSource), `${forbiddenPattern} is absent from OpenCode profile`);

  console.log('agent-provider-forbidden-flags: all assertions passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
