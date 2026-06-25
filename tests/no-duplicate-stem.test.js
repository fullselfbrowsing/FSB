#!/usr/bin/env node
'use strict';

/**
 * Phase 39.5 / Plan 02 (v1.0.0 Full App Catalog -- BRDTH-01, BLOCKER A backstop) --
 * the NO-DUPLICATE-STEM gate proof.
 *
 * THE CORRECTNESS RISK THIS CLOSES: the importer writes each descriptor FLAT as
 * catalog/descriptors/opentabs__<service-stem>__<op>.json. The host-derived stem
 * (service.replace(/^app./,'').split('.')[0]) is WRONG or COLLIDING for ~40 of the
 * real ~117 plugins -- six collision groups (notably the 4-way `console`:
 * aws-console/clickhouse/google-cloud/twilio) would emit the SAME
 * opentabs__<stem>__*.json filename and SILENTLY CLOBBER each other. That is data
 * corruption, not a crash -- nothing surfaces it at runtime. STEM_OVERRIDES gives each
 * a DISTINCT canonical stem; scripts/verify-no-duplicate-stem.mjs is the build-time
 * backstop that turns a MISSING override into a BUILD FAILURE.
 *
 * This drives the REAL checkNoDuplicateStem export (NOT a re-implemented copy; mirrors
 * tests/payment-op-guard.test.js's real-export pattern) + the importer's OWN
 * enumerateBatchApps, so the gate can never drift from what the importer writes:
 *   (1) the REAL enumerated vendored corpus yields 0 collisions (the complete override
 *       map ships) -- this is also the CLI PASS path.
 *   (2) a SYNTHETIC two-app set whose hosts derive the SAME stem yields >= 1 failure
 *       NAMING both apps + the colliding stem (the gate is real, not a no-op).
 *   (3) a synthetic DISTINCT-stem set yields 0 failures (no false-positive).
 *
 * Zero-framework node test: a check(cond,msg) counter, PASS=/FAIL= summary,
 * process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/no-duplicate-stem.test.js
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

(async () => {
  console.log('--- BRDTH-01 no-duplicate-stem gate (BLOCKER A: no silent descriptor clobber) ---');

  const ROOT = path.resolve(__dirname, '..');
  const gateUrl = pathToFileURL(path.join(ROOT, 'scripts', 'verify-no-duplicate-stem.mjs')).href;
  const importerUrl = pathToFileURL(path.join(ROOT, 'scripts', 'import-opentabs-catalog.mjs')).href;

  const gate = await import(gateUrl);
  const importer = await import(importerUrl);

  check(typeof gate.checkNoDuplicateStem === 'function',
    'checkNoDuplicateStem is a named export of the real gate (not re-implemented here)');
  check(typeof importer.enumerateBatchApps === 'function',
    'the importer exports enumerateBatchApps (the gate re-derives over the SAME set the importer emits)');

  // ---- (1) the REAL enumerated corpus is collision-free (also the CLI PASS path) ----
  const realApps = importer.enumerateBatchApps();
  check(Array.isArray(realApps) && realApps.length > 0,
    '(1) enumerateBatchApps returns a non-empty real vendored set (' + (realApps ? realApps.length : 0) + ' apps)');
  const realResult = gate.checkNoDuplicateStem(realApps);
  check(realResult && Array.isArray(realResult.failures) && realResult.failures.length === 0,
    '(1) the real enumerated corpus yields 0 stem collisions -- the complete override map ships ['
      + (realResult && realResult.failures && realResult.failures.length ? realResult.failures.join(' | ') : 'collision-free') + ']');

  // ---- (2) a SYNTHETIC same-stem two-app set FAILS, naming both apps + the stem ----
  // Both synthetic apps carry the SAME host, so the gate's importer-mirrored derivation
  // (strip ^app., split('.')[0], displayServiceStem) produces stem 'dup' for both -> a
  // real collision the gate MUST catch (a missing STEM_OVERRIDE is a BUILD FAILURE).
  const collidingSet = [
    { app: 'alpha-collide', service: 'dup.example.com' },
    { app: 'beta-collide', service: 'dup.example.com' },
  ];
  const collResult = gate.checkNoDuplicateStem(collidingSet);
  check(collResult && Array.isArray(collResult.failures) && collResult.failures.length >= 1,
    '(2) a synthetic same-stem two-app set yields >= 1 failure (the gate is real)');
  const joined = (collResult && collResult.failures ? collResult.failures : []).join(' || ');
  check(joined.indexOf('alpha-collide') !== -1 && joined.indexOf('beta-collide') !== -1,
    '(2) the failure NAMES BOTH colliding apps (alpha-collide + beta-collide)');
  check(/(^|[^a-z])dup([^a-z]|$)/.test(joined),
    '(2) the failure NAMES the colliding stem (dup)');

  // ---- (3) a synthetic DISTINCT-stem set PASSES (no false-positive) ----
  const distinctSet = [
    { app: 'one-app', service: 'one.example.com' },
    { app: 'two-app', service: 'two.example.com' },
  ];
  const distinctResult = gate.checkNoDuplicateStem(distinctSet);
  check(distinctResult && Array.isArray(distinctResult.failures) && distinctResult.failures.length === 0,
    '(3) two distinct-stem synthetic apps yield 0 failures (no false-positive)');

  console.log('\nno-duplicate-stem: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: no-duplicate-stem test threw:', err && err.message ? err.message : err);
  process.exit(1);
});
