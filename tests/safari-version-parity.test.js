/**
 * Guards that safari/Config/Version.xcconfig is derived from
 * extension/manifest.json and never hand-edited.
 *
 * The CFBundleVersion derivation is the part worth pinning: App Store Connect
 * rejects an upload whose CFBundleVersion is not strictly greater than the
 * previous one, and a semver string does not order correctly on its own.
 *
 * Run: node tests/safari-version-parity.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function passAssertEqual(a, b, msg) { passAssert(a === b, msg + ' (got ' + JSON.stringify(a) + ')'); }

const ROOT = path.join(__dirname, '..');

(async function run() {
  const mod = await import('../scripts/sync-safari-version.mjs');
  const { deriveVersions, renderXcconfig } = mod;
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'));

  console.log('\n=== 1. xcconfig matches the manifest ===');
  const xcconfigPath = path.join(ROOT, 'safari', 'Config', 'Version.xcconfig');
  passAssert(fs.existsSync(xcconfigPath), 'Version.xcconfig exists');
  const actual = fs.readFileSync(xcconfigPath, 'utf8');
  passAssertEqual(actual, renderXcconfig(deriveVersions(manifest.version)),
    'file is byte-identical to what the generator produces (run build:safari if stale)');
  passAssert(actual.includes(`MARKETING_VERSION = ${manifest.version}`),
    `MARKETING_VERSION tracks the manifest (${manifest.version})`);
  passAssert(/DO NOT EDIT/.test(actual), 'file is marked generated');

  const pbx = fs.readFileSync(
    path.join(ROOT, 'safari', 'FSB', 'FSB.xcodeproj', 'project.pbxproj'), 'utf8'
  );
  passAssert(pbx.includes('path = ../Config/Version.xcconfig;'),
    'Xcode project references the generated Version.xcconfig');
  passAssertEqual((pbx.match(/baseConfigurationReference = .*Version\.xcconfig/g) || []).length, 2,
    'project Debug and Release configurations both inherit Version.xcconfig');
  passAssertEqual((pbx.match(/\bMARKETING_VERSION\s*=/g) || []).length, 0,
    'targets do not override MARKETING_VERSION');
  passAssertEqual((pbx.match(/\bCURRENT_PROJECT_VERSION\s*=/g) || []).length, 0,
    'targets do not override CURRENT_PROJECT_VERSION');

  console.log('\n=== 2. CFBundleVersion is STRICTLY MONOTONIC across releases ===');
  const ladder = ['0.9.9', '0.9.10', '0.9.90', '0.9.99', '0.10.0', '0.10.1', '0.99.999', '1.0.0', '1.0.1', '2.0.0'];
  let prev = -1;
  let monotonic = true;
  for (const v of ladder) {
    const n = deriveVersions(v).currentProjectVersion;
    if (n <= prev) { monotonic = false; console.error(`    ${v} -> ${n} is NOT greater than ${prev}`); }
    prev = n;
  }
  passAssert(monotonic, 'every step of ' + ladder.join(' < ') + ' strictly increases');
  passAssertEqual(deriveVersions('0.9.90').currentProjectVersion, 9090, '0.9.90 -> 9090');
  passAssertEqual(deriveVersions('0.10.0').currentProjectVersion, 10000, '0.10.0 -> 10000');
  passAssertEqual(deriveVersions('1.0.0').currentProjectVersion, 1000000, '1.0.0 -> 1000000');

  console.log('\n=== 3. MARKETING_VERSION is the manifest string verbatim ===');
  passAssertEqual(deriveVersions('0.9.90').marketingVersion, '0.9.90', 'no reformatting');

  console.log('\n=== 4. NEGATIVE cases ===');
  let threw = false;
  try { deriveVersions('not-a-version'); } catch (_e) { threw = true; }
  passAssert(threw, 'non-semver input throws');
  threw = false;
  try { deriveVersions('1.1000.0'); } catch (_e) { threw = true; }
  passAssert(threw, 'a minor above the radix throws rather than silently wrapping');

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('TEST HARNESS ERROR:', e); process.exit(1); });
