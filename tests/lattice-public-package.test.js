'use strict';

/**
 * Public Lattice package integration smoke.
 *
 * Locks FSB's new milestone dependency model: the production import specifier
 * stays `lattice`, but npm resolves it to the public scoped runtime package.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  EXPECTED_PUBLIC_LATTICE,
  validatePublicLatticePin
} = require('./helpers/lattice-public-pin.js');

let passed = 0;

function ok(condition, message) {
  assert.equal(condition, true, message);
  passed++;
  console.log('  PASS:', message);
}

(async () => {
  console.log('\n--- Public Lattice package integration smoke ---');

  const repoRoot = path.resolve(__dirname, '..');
  const pinResult = validatePublicLatticePin(repoRoot);
  ok(pinResult.ok, 'package.json, package-lock.json, and LATTICE-PIN agree on public Lattice ' + EXPECTED_PUBLIC_LATTICE.packageVersion + ': ' + pinResult.errors.join('; '));

  const installedPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'node_modules', 'lattice', 'package.json'), 'utf8'));
  ok(installedPkg.name === EXPECTED_PUBLIC_LATTICE.packageName, 'node_modules/lattice is the scoped public package');
  ok(installedPkg.version === EXPECTED_PUBLIC_LATTICE.packageVersion, 'node_modules/lattice version is ' + EXPECTED_PUBLIC_LATTICE.packageVersion);
  ok(installedPkg.engines && installedPkg.engines.node === '>=24', 'installed Lattice package declares Node >=24');

  const lattice = await import('lattice');
  ok(lattice.latticeVersion === EXPECTED_PUBLIC_LATTICE.packageVersion, 'lattice.latticeVersion is stamped with ' + EXPECTED_PUBLIC_LATTICE.packageVersion);
  const expectedFunctions = [
    'createReceipt',
    'verifyReceipt',
    'createInMemorySigner',
    'generateEd25519KeyPairJwk',
    'createMemoryKeySet',
    'createHookPipeline',
    'createCheckpointHook',
    'createNoopSurvivabilityAdapter',
    'createAnthropicProvider',
    'createGeminiProvider',
    'createLmStudioProvider',
    'createOpenAIProvider',
    'createOpenAICompatibleProvider',
    'createOpenRouterProvider',
    'createXaiProvider',
    'runAgent',
    'defineAgent',
    'runAgentCrew',
    'negotiateCapabilities',
    'getStructuredOutputContract',
    'stripReasoningTags',
    'unwrapInternalEnvelope',
    'receiptCid',
    'createRateLimitGroup',
    'createLiteLLMProvider',
    'collectStream',
    'createOtelRunEventSink',
    'createRemoteReceiptSigner'
  ];
  for (const key of expectedFunctions) {
    ok(typeof lattice[key] === 'function', 'lattice.' + key + ' is exported');
  }
  ok(lattice.STEP_TRANSITION_EVENT_NAME === 'step.transition', 'STEP_TRANSITION_EVENT_NAME preserved');
  ok(lattice.DEFAULT_CHECKPOINT_BAND === 1, 'DEFAULT_CHECKPOINT_BAND preserved');

  const cliPackagePath = path.join(repoRoot, 'node_modules', '@full-self-browsing', 'lattice-cli', 'package.json');
  const cliPkg = JSON.parse(fs.readFileSync(cliPackagePath, 'utf8'));
  ok(cliPkg.version === EXPECTED_PUBLIC_LATTICE.cliPackageVersion, '@full-self-browsing/lattice-cli version is ' + EXPECTED_PUBLIC_LATTICE.cliPackageVersion);
  const cliBin = cliPkg.bin && cliPkg.bin.lattice ? cliPkg.bin.lattice.replace(/^\.\//, '') : '';
  ok(cliBin === 'dist/cli.js', 'Lattice CLI exposes lattice bin');

  const cli = spawnSync(path.join(repoRoot, 'node_modules', '.bin', 'lattice'), ['--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });
  ok(cli.status === 0, 'lattice --help exits 0');
  // The published @full-self-browsing/lattice-cli (citty) colorizes its help
  // banner with ANSI escape codes even when stdout is not a TTY (NO_COLOR is
  // not load-bearing on its own), so strip ANSI before matching the usage line.
  const cliStdout = (cli.stdout || '').replace(/\x1b\[[0-9;]*m/g, '');
  ok(/USAGE lattice repro\|verify\|eval\|receipt\|diagnostics/.test(cliStdout), 'lattice CLI exposes repro|verify|eval|receipt|diagnostics commands');

  console.log('\nPublic Lattice package smoke: ' + passed + ' PASS / 0 FAIL');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
