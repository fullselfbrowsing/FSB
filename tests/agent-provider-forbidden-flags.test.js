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

  const supervisorPath = path.join(
    repoRoot,
    'mcp',
    'src',
    'agent-providers',
    'spawn-supervisor.ts',
  );
  const supervisorSource = fs.readFileSync(supervisorPath, 'utf8');
  const adapterSource = fs.readFileSync(path.join(
    repoRoot,
    'mcp',
    'src',
    'agent-providers',
    'adapter.ts',
  ), 'utf8');
  const policySource = fs.readFileSync(path.join(
    repoRoot,
    'mcp',
    'src',
    'agent-providers',
    'policy-attestation.ts',
  ), 'utf8');
  const runtimeSource = fs.readFileSync(path.join(
    repoRoot,
    'mcp',
    'src',
    'agent-providers',
    'runtime-files.ts',
  ), 'utf8');
  const environmentSource = fs.readFileSync(path.join(
    repoRoot,
    'mcp',
    'src',
    'agent-providers',
    'spawn-environment.ts',
  ), 'utf8');
  const providerContractSource = fs.readFileSync(path.join(
    repoRoot,
    'tests',
    'mcp-agent-provider-contract.test.js',
  ), 'utf8');
  const eventStoreTestSource = fs.readFileSync(path.join(
    repoRoot,
    'tests',
    'delegation-event-store.test.js',
  ), 'utf8');
  const providersUiTestSource = fs.readFileSync(path.join(
    repoRoot,
    'tests',
    'providers-panel-ui.test.js',
  ), 'utf8');
  const providersPanelSource = fs.readFileSync(path.join(
    repoRoot,
    'extension',
    'ui',
    'providers-panel.js',
  ), 'utf8');
  const delegationFeedSource = fs.readFileSync(path.join(
    repoRoot,
    'extension',
    'ui',
    'delegation-feed.js',
  ), 'utf8');
  const sidepanelCssSource = fs.readFileSync(path.join(
    repoRoot,
    'extension',
    'ui',
    'sidepanel.css',
  ), 'utf8');
  assert(supervisorSource.includes('verifyPolicyAttestation'));
  assert(supervisorSource.includes("descriptor.source === 'process_json'"));
  assert(supervisorSource.includes("descriptor.source === 'owned_server_json'"));
  assert(!/from ['"].*opencode-(?:profile|detect|stream)/.test(supervisorSource));
  assert(!/from ['"].*codex-(?:profile|detect|stream)/.test(supervisorSource));
  assert(!/(?:adapterId|spec\.adapterId)\s*===\s*(?:OPENCODE_ADAPTER_ID|['"]opencode['"])/.test(
    supervisorSource,
  ));
  assert(!/(?:verify|check|reduce)OpenCodePolicy/.test(supervisorSource));
  assert(!/(?:adapterId|spec\.adapterId)\s*===\s*(?:CODEX_ADAPTER_ID|['"]codex['"])/.test(
    supervisorSource,
  ));

  const adapterInterface = (adapterSource.match(
    /export interface AgentProviderAdapter \{([\s\S]*?)\n\}/,
  ) || [null, ''])[1];
  assert.deepEqual(
    Array.from(adapterInterface.matchAll(/^\s{2}([A-Za-z]+)\(/gm), (match) => match[1]),
    ['detect', 'buildSpawn', 'parseEvents', 'kill', 'caps'],
    'agent-provider adapter surface remains exactly five methods',
  );
  assert(!/callback|resolver|template/i.test(policySource),
    'shared attestation verifier exposes no executable provider callback seam');
  assert(!/(?:pgrep|lsof|ps aux|process[-_ ]?name|discover(?:y|Existing).*server)/i.test(
    supervisorSource,
  ), 'supervisor contains no user-process or existing-server discovery mechanism');
  assert(supervisorSource.includes('run.replayClosed = true'));
  assert(supervisorSource.includes('!run.replayClosed'));
  assert(supervisorSource.indexOf('run.replayClosed = true')
    < supervisorSource.indexOf('this.spawnChild('));
  assert(!/OPENCODE_SERVER_PASSWORD/.test(runtimeSource),
    'runtime journal grammar cannot name or retain the OpenCode server password');

  assert(adapterSource.includes('key === OWNED_SERVER_PASSWORD_ENV_KEY'));
  assert(adapterSource.includes("ownValue(binding, 'envKey') !== OWNED_SERVER_PASSWORD_ENV_KEY"));
  assert(adapterSource.includes("ownValue(binding, 'secretRef') !== OWNED_SERVER_BASIC_PASSWORD_SECRET_REF"));
  assert(supervisorSource.includes('options.env[binding.envKey] = password'));
  assert(supervisorSource.includes("delete options.env[binding.envKey]"));
  assert(supervisorSource.includes("headers.Authorization = ''"));
  assert(supervisorSource.includes('delete headers.Authorization'));
  assert(supervisorSource.includes('credentialBytes.fill(0)'));
  assert(supervisorSource.includes('secret.fill(0)'));

  for (const secretProof of [
    'fixedEnv: { FSB_OWNED_SERVER_PASSWORD: passwordCanary }',
    "fixedEnv: { SAFE_VALUE: `Basic ${passwordCanary}` }",
    "spawnSecretEnvBindings: [{ envKey: 'ARBITRARY_PASSWORD', secretRef: 'arbitrary' }]",
    'JSON.stringify(immutableOwned).includes(passwordCanary)',
    'JSON.stringify(passed).includes(passwordCanary)',
    'JSON.stringify(failed).includes(passwordCanary)',
    'runtime cleanup does not gain arbitrary recursive deletion authority',
  ]) assert(providerContractSource.includes(secretProof), `provider contract retains ${secretProof}`);
  for (const browserProof of [
    'secretCanary',
    'taskCanary',
    'argvCanary',
    'envCanary',
    'pathCanary',
    'endpointCanary',
    'rawNativeCanary',
  ]) assert(eventStoreTestSource.includes(browserProof), `browser projection rejects ${browserProof}`);
  assert(providersUiTestSource.includes(
    'there is exactly one visible provider selector',
  ));
  assert(providersUiTestSource.includes(
    'mcpBridgePairingCode',
  ));
  assert(providersUiTestSource.includes(
    'the seven API providers are followed by the two active local agents',
  ));

  const controlPanelSource = fs.readFileSync(path.join(
    repoRoot,
    'extension',
    'ui',
    'control_panel.html',
  ), 'utf8');
  const sidepanelSource = fs.readFileSync(path.join(
    repoRoot,
    'extension',
    'ui',
    'sidepanel.html',
  ), 'utf8');
  const helperTag = '<script src="../utils/delegation-providers.js"></script>';
  assert.equal(controlPanelSource.split(helperTag).length - 1, 1);
  assert.equal(sidepanelSource.split(helperTag).length - 1, 1);

  for (const retiredSource of [
    'codex.ts',
    'codex-detect.ts',
    'codex-profile.ts',
    'codex-stream.ts',
    'opencode.ts',
    'opencode-detect.ts',
    'opencode-profile.ts',
    'opencode-stream.ts',
  ]) assert.equal(fs.existsSync(path.join(
    repoRoot,
    'mcp',
    'src',
    'agent-providers',
    retiredSource,
  )), false, `${retiredSource} is deleted from the active provider runtime`);
  for (const stripped of [
    'CODEX_API_KEY',
    'CODEX_ACCESS_TOKEN',
    'OPENAI_API_KEY',
    'CODEX_EXEC_SERVER_URL',
    'CODEX_EXEC_SERVER_NOISE_AUTH_TOKEN',
    'CODEX_EXEC_SERVER_NOISE_CHATGPT_ACCOUNT_ID',
    'CODEX_EXEC_SERVER_NOISE_ENVIRONMENT_ID',
    'CODEX_EXEC_SERVER_NOISE_REGISTRY_URL',
  ]) assert(environmentSource.includes(`'${stripped}'`), `${stripped} is in the strip roster`);
  assert(environmentSource.includes("CODEX_EXEC_SERVER_URL: 'none'"));
  for (const exactBillingCopy of [
    'Included with your ChatGPT plan',
    'Billed to the API key stored by Codex; dollar amount not reported.',
  ]) {
    assert.strictEqual(providersPanelSource.split(exactBillingCopy).length - 1, 0,
      `active Providers UI excludes retired Codex billing copy: ${exactBillingCopy}`);
    assert.strictEqual(delegationFeedSource.split(exactBillingCopy).length - 1, 1,
      `delegation feed contains exact billing copy once: ${exactBillingCopy}`);
  }
  assert(!/_definition\([^\n]*['"]Profile['"]/.test(delegationFeedSource),
    'shared delegation feed renders no Profile row');
  assert(!/providerId\s*===\s*['"]codex['"]|case\s+['"]codex['"]/.test(delegationFeedSource),
    'shared delegation feed has no Codex-specific renderer branch');
  assert(delegationFeedSource.includes('summary.usd !== null'),
    'accepted identity summaries reject non-null USD');
  assert(/\.delegation-action\s*\{[\s\S]*?min-height:\s*44px/.test(sidepanelCssSource));
  assert(/\.stop-btn\[data-delegation-action="stop"\]\s*\{[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/.test(
    sidepanelCssSource,
  ));

  console.log('agent-provider-forbidden-flags: all assertions passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
