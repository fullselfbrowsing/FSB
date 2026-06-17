'use strict';

/**
 * PhantomStream public package integration smoke.
 *
 * Locks FSB's v0.12.0 package source decision: the production package is
 * @full-self-browsing/phantom-stream@0.1.0 from npm, not the stale
 * @fullselfbrowsing/phantom-stream name.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  EXPECTED_PUBLIC_PHANTOM_STREAM,
  validatePublicPhantomStreamPin
} = require('./helpers/phantom-stream-public-pin.js');

let passed = 0;

function ok(condition, message) {
  assert.equal(condition, true, message);
  passed++;
  console.log('  PASS:', message);
}

(async () => {
  console.log('\n--- PhantomStream public package integration smoke ---');

  const repoRoot = path.resolve(__dirname, '..');
  const pinResult = validatePublicPhantomStreamPin(repoRoot);
  ok(pinResult.ok, 'package.json, package-lock.json, and PHANTOMSTREAM-PIN agree on PhantomStream '
    + EXPECTED_PUBLIC_PHANTOM_STREAM.packageVersion + ': ' + pinResult.errors.join('; '));

  const installedPackagePath = path.join(repoRoot, 'node_modules', '@full-self-browsing', 'phantom-stream', 'package.json');
  const installedPkg = JSON.parse(fs.readFileSync(installedPackagePath, 'utf8'));
  ok(installedPkg.name === EXPECTED_PUBLIC_PHANTOM_STREAM.packageName, 'installed package name is @full-self-browsing/phantom-stream');
  ok(installedPkg.version === EXPECTED_PUBLIC_PHANTOM_STREAM.packageVersion, 'installed package version is ' + EXPECTED_PUBLIC_PHANTOM_STREAM.packageVersion);
  ok(installedPkg.type === 'module', 'installed package is ESM');
  ok(installedPkg.license === 'MIT', 'installed package declares MIT license');

  const expectedExports = [
    '.',
    './protocol',
    './capture',
    './adapters/extension',
    './adapters/bookmarklet',
    './adapters/playwright',
    './renderer',
    './relay',
    './transport/websocket'
  ];
  for (const exportPath of expectedExports) {
    ok(Boolean(installedPkg.exports && installedPkg.exports[exportPath]), 'package exports ' + exportPath);
  }

  ok(!JSON.stringify(installedPkg).includes(EXPECTED_PUBLIC_PHANTOM_STREAM.stalePackageName),
    'installed package metadata does not reference stale @fullselfbrowsing/phantom-stream');

  console.log('\nPhantomStream public package smoke: ' + passed + ' PASS / 0 FAIL');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
