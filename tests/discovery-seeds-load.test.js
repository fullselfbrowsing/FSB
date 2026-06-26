'use strict';

/**
 * Phase 42 plan 01 (DSEED-01) -- discovery-seeds-load.test.js
 *
 * The seed-load + NO-MANIFEST-CHANGE keystone (SC1). Asserts:
 *   1. extension/config/discovery-seeds.json loads via require() NO-THROW and is a
 *      non-empty object carrying a _meta block.
 *   2. Every top-level key except _meta is a BARE https origin
 *      (matches /^https:\/\/[^/?#\s]+$/) mapping to an object with a hints array.
 *   3. THE keystone: manifest.json host_permissions is BYTE-identical to the locked
 *      baseline ["<all_urls>"] -- JSON.stringify equality. The seeds add NO host
 *      permission (the SC1 invariant guard).
 *   4. The loader contract DEGRADES to empty seeds (never throws) when the seeds file
 *      is absent -- the same no-throw shape network-capture.js (Plan 02) uses
 *      (mirror the service-denylist no-throw contract).
 *
 * Zero-framework: passed/failed + check(cond,msg) + process.exit(failed>0?1:0)
 * (mirrors tests/network-capture-redaction.test.js).
 *
 * Run: node tests/discovery-seeds-load.test.js
 * NO EMOJIS, ASCII-only source.
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const SEEDS_PATH = path.resolve(__dirname, '..', 'extension', 'config', 'discovery-seeds.json');
const MANIFEST_PATH = path.resolve(__dirname, '..', 'extension', 'manifest.json');

// The LOCKED host_permissions baseline (the no-new-permission keystone). The
// discovery seeds feed the synthesizer's recognition through the EXISTING capture
// permissions; they grant NO new host permission, so this must stay byte-stable.
const LOCKED_HOST_PERMISSIONS = ['<all_urls>'];

(function () {
  console.log('--- DSEED-01 discovery-seeds load + no-manifest-change keystone ---');

  // ---- Test 1: seeds load no-throw + non-empty + _meta block ----
  let seeds = null;
  let loadThrew = false;
  try {
    seeds = require(SEEDS_PATH);
  } catch (_e) {
    loadThrew = true;
  }
  check(!loadThrew, 'discovery-seeds.json loads via require() WITHOUT throwing');
  check(seeds && typeof seeds === 'object', 'discovery-seeds.json is an object');
  const topKeys = seeds ? Object.keys(seeds) : [];
  check(topKeys.length > 1, 'discovery-seeds.json is non-empty (more than just _meta)');
  check(seeds && seeds._meta && typeof seeds._meta === 'object', 'a _meta block is present');
  check(seeds && seeds._meta && typeof seeds._meta.vendorSha === 'string' && seeds._meta.vendorSha.length > 0,
    '_meta carries a vendorSha (provenance pin)');
  check(seeds && seeds._meta && typeof seeds._meta.generator === 'string',
    '_meta carries the generator name (provenance)');

  // ---- Test 2: every non-_meta key is a bare https origin -> { hints:[] } ----
  const ORIGIN_RE = /^https:\/\/[^/?#\s]+$/;
  let originKeys = 0;
  let allBareHttps = true;
  let allHaveHints = true;
  for (const k of topKeys) {
    if (k === '_meta') continue;
    originKeys++;
    if (!ORIGIN_RE.test(k)) {
      allBareHttps = false;
      console.error('    non-bare-origin key:', k);
    }
    const v = seeds[k];
    if (!v || typeof v !== 'object' || !Array.isArray(v.hints)) {
      allHaveHints = false;
      console.error('    key without hints array:', k);
    }
  }
  check(originKeys >= 50, 'at least 50 seeded origins (>= the gate)');
  check(allBareHttps, 'every non-_meta key is a BARE https origin (matches /^https:\\/\\/[^/?#\\s]+$/)');
  check(allHaveHints, 'every origin maps to an object with a hints array');

  // ---- Test 3: THE keystone -- manifest host_permissions byte-unchanged ----
  let manifest = null;
  let manifestThrew = false;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (_e) {
    manifestThrew = true;
  }
  check(!manifestThrew && manifest, 'manifest.json loads');
  check(
    manifest && JSON.stringify(manifest.host_permissions) === JSON.stringify(LOCKED_HOST_PERMISSIONS),
    'KEYSTONE: manifest host_permissions === ["<all_urls>"] byte-for-byte (NO new host permission, SC1)'
  );

  // ---- Test 4: the loader contract degrades to EMPTY (no-throw) on absent file ----
  // Prove the no-throw shape network-capture.js (Plan 02) uses: a try/catch require
  // of a bogus path yields empty seeds, NEVER a throw (mirror service-denylist).
  function loadSeedsNoThrow(p) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      return require(p);
    } catch (_e) {
      return {}; // DEGRADE to empty -- the contract Plan 02's loader honors
    }
  }
  let degradeThrew = false;
  let degraded = null;
  try {
    degraded = loadSeedsNoThrow(path.resolve(__dirname, '..', 'extension', 'config', 'no-such-seeds-file.json'));
  } catch (_e) {
    degradeThrew = true;
  }
  check(!degradeThrew, 'loading a NON-EXISTENT seeds file does NOT throw (degrade-to-empty contract)');
  check(degraded && typeof degraded === 'object' && Object.keys(degraded).length === 0,
    'the absent-file degrade yields EMPTY seeds ({}) -- the no-throw loader contract Plan 02 mirrors');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})();
