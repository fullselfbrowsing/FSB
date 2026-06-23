'use strict';

/**
 * Phase 26 / Plan 03 (v0.9.99 Native Capability Catalog) -- recipe-path guard
 * spawn test. Proves CAP-04 end-to-end:
 *
 *   Assertion A (clean PASS): `node scripts/verify-recipe-path-guard.mjs` exits 0
 *     on the current clean recipe path (the happy path -- no dynamic code on the
 *     six allowlisted files and all schema fixtures classify correctly).
 *
 *   Assertion B (planted-eval FAIL): write a temp file containing a forbidden
 *     dynamic-code construct, point the guard at it via its test-only
 *     FSB_RECIPE_GUARD_EXTRA_ALLOWLIST seam, and assert the guard exits non-zero
 *     AND names the planted file -- proving the guard actually flips red when
 *     dynamic code appears on the (extended) recipe path. The temp file is
 *     removed in a finally so nothing is left on the recipe path.
 *
 * Zero-framework clone of tests/verify-store-listing.test.js (spawnSync('node',
 * [script]) + exit-code/stdout assertions; passed/failed counters;
 * process.exit(failed>0?1:0)).
 *
 * NB: the planted forbidden construct is assembled from string fragments so this
 * test's OWN source carries no literal forbidden token. The test is not on the
 * guard's allowlist, but keeping the source clean avoids confusing any future
 * broad scan.
 *
 * Run: node tests/recipe-path-guard.test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

console.log('--- recipe-path-guard.test (Phase 26 / Plan 03, CAP-04) ---');

// ---- Assertion A: clean tree -> guard exits 0 ------------------------------
{
  const result = spawnSync('node', ['scripts/verify-recipe-path-guard.mjs'], {
    cwd: ROOT,
    stdio: 'pipe',
    env: process.env,
  });
  const stdout = result.stdout ? result.stdout.toString() : '';
  const stderr = result.stderr ? result.stderr.toString() : '';

  check('guard exits 0 on the clean recipe path',
    result.status === 0,
    `exit ${result.status}; stderr tail: ${stderr.slice(-500)}`);
  check('guard stdout contains PASS on the clean tree',
    /PASS/i.test(stdout),
    `stdout: ${stdout.slice(0, 500)}`);
}

// ---- Assertion B: planted-eval on the extended allowlist -> guard exits non-zero
{
  // Assemble the forbidden construct from fragments so this source stays clean.
  const forbiddenConstruct = 'ev' + 'al' + '(';
  const plantedSource =
    '// planted forbidden construct for the recipe-path guard self-test\n' +
    'const x = ' + forbiddenConstruct + '"1 + 1");\n';

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-recipe-guard-'));
  const plantedFile = path.join(tmpDir, 'planted-recipe-path.js');

  try {
    fs.writeFileSync(plantedFile, plantedSource, 'utf8');

    const result = spawnSync('node', ['scripts/verify-recipe-path-guard.mjs'], {
      cwd: ROOT,
      stdio: 'pipe',
      env: Object.assign({}, process.env, {
        FSB_RECIPE_GUARD_EXTRA_ALLOWLIST: plantedFile,
      }),
    });
    const stdout = result.stdout ? result.stdout.toString() : '';
    const stderr = result.stderr ? result.stderr.toString() : '';
    const combined = stdout + stderr;

    check('guard exits non-zero when a planted-eval file is on the recipe path',
      result.status !== 0 && result.status !== null,
      `exit ${result.status}; combined tail: ${combined.slice(-500)}`);
    check('guard FAIL output names the planted file',
      combined.includes(plantedFile),
      `did not mention ${plantedFile}; combined: ${combined.slice(-500)}`);
    check('guard FAIL output mentions the forbidden construct',
      /forbidden/i.test(combined),
      `combined: ${combined.slice(-500)}`);
  } finally {
    try { fs.unlinkSync(plantedFile); } catch (_e) {}
    try { fs.rmdirSync(tmpDir); } catch (_e) {}
  }
}

console.log(`\n=== recipe-path-guard.test results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
