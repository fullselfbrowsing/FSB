'use strict';

/**
 * Phase 39.5 plan 01 (BRDTH-01) -- Wave-0 AUGMENT GUARD.
 *
 * Enforces the augment guarantee of the full OpenTabs source import: the real
 * upstream plugin slices are vendored (real src/**, NO sdk-stub) WHILE the
 * hand-authored-only apps that have NO upstream at the pinned SHA -- plus the
 * hand-authored grafana slice -- are PRESERVED. A wholesale-replace mistake (the
 * T-39.5-01 tampering threat) that drops a hand-only app or overwrites the
 * hand-authored grafana with the real empty-origin grafana FAILS here.
 *
 * Zero-framework FSB convention (NOT Jest): a check(cond,msg) counter +
 * PASS=/FAIL= summary + process.exit(failed>0?1:0). ASCII-only, no emojis.
 *
 * Count floor note: the vendored set is 129 plugin dirs = 115 real-src slices
 * (39 regenerated overlaps + 76 net-new) + 13 hand-authored-only + the
 * hand-authored grafana. (117 upstream real apps, minus real grafana [the
 * grafana dir is kept as the hand-authored grafana.com slice], minus sqlpad
 * [empty origin, no hand-authored slice -> not vendored] = 115 real-src.) The
 * floor is therefore 129, not 130 -- an earlier +1 double-counted grafana as
 * both a real-skip and a preserve.
 *
 * Run: node tests/vendor-augment-preserved.test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const REPO_ROOT = path.resolve(__dirname, '..');
const PLUGINS_DIR = path.join(REPO_ROOT, 'vendor', 'opentabs-snapshot', 'plugins');

// The 13 hand-authored-only apps (NO upstream at the pinned SHA) -- payment/commerce
// + mastodon, deliberately screened SENSITIVE in phases 38/39. They MUST survive the
// full real-source import byte-untouched (augment, not replace).
const HAND_ONLY = [
  'amazon', 'etsy', 'eventbrite', 'grubhub', 'kayak', 'lyft', 'mastodon',
  'opentable', 'shopify', 'stubhub', 'threads', 'ticketmaster', 'ubereats',
];
// The 2 CI fixtures + the empty-origin self-hosted app that must NOT be vendored.
const MUST_NOT_VENDOR = ['e2e-test', 'prescript-test', 'sqlpad'];
// The importer's fixture-skip regex (must match nothing in the vendored set).
const FIXTURE_RE = /(^|[-_])(e2e|prescript)([-_]|$)|-test$/i;

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_e) { return false; }
}
function listPluginDirs() {
  if (!isDir(PLUGINS_DIR)) return [];
  return fs.readdirSync(PLUGINS_DIR).filter((n) => isDir(path.join(PLUGINS_DIR, n)));
}

console.log('--- Phase 39.5-01 Wave-0 augment guard (BRDTH-01) ---');

const dirs = listPluginDirs();

// Test 1: >= 129 vendored plugin dirs (115 real-src + 13 hand-only + grafana).
check(dirs.length >= 129,
  'vendor/opentabs-snapshot/plugins/ holds >= 129 plugin dirs (115 real-src + 13 hand-only + grafana); got ' + dirs.length);

// Test 2: each of the 13 hand-authored-only apps is a present dir with a package.json.
for (const app of HAND_ONLY) {
  const dir = path.join(PLUGINS_DIR, app);
  check(isDir(dir) && fs.existsSync(path.join(dir, 'package.json')),
    'hand-only app preserved with package.json: ' + app);
}

// Test 3: the grafana dir is present AND is the hand-authored grafana.com slice (the
// real empty-origin grafana did NOT overwrite it -- the exact regression we guard).
const grafanaPkgPath = path.join(PLUGINS_DIR, 'grafana', 'package.json');
check(isDir(path.join(PLUGINS_DIR, 'grafana')) && fs.existsSync(grafanaPkgPath),
  'hand-authored grafana dir is present');
let grafanaOrigin = '';
try {
  const gp = JSON.parse(fs.readFileSync(grafanaPkgPath, 'utf8'));
  grafanaOrigin = ((gp.opentabs && gp.opentabs.urlPatterns) || [])[0] || '';
} catch (_e) { grafanaOrigin = ''; }
check(/grafana\.com/.test(grafanaOrigin),
  'grafana is the hand-authored grafana.com slice (real empty-origin grafana not vendored over it); urlPatterns[0]=' + JSON.stringify(grafanaOrigin));

// Test 4: a sampled overlap app (airtable) is the REAL src -- imports
// @opentabs-dev/plugin-sdk directly AND has NO src/sdk-stub.ts (augment regenerated).
const airIndex = path.join(PLUGINS_DIR, 'airtable', 'src', 'index.ts');
const airStub = path.join(PLUGINS_DIR, 'airtable', 'src', 'sdk-stub.ts');
let airSrc = '';
try { airSrc = fs.readFileSync(airIndex, 'utf8'); } catch (_e) { airSrc = ''; }
check(/from ['"]@opentabs-dev\/plugin-sdk['"]/.test(airSrc),
  'airtable overlap src/index.ts imports @opentabs-dev/plugin-sdk directly (real src, no stub)');
check(!fs.existsSync(airStub),
  'airtable overlap has NO src/sdk-stub.ts (the hand-authored stub was dropped)');

// Test 5: the 2 CI fixtures + sqlpad are NOT vendored.
for (const bad of MUST_NOT_VENDOR) {
  check(!isDir(path.join(PLUGINS_DIR, bad)),
    'NOT vendored: ' + bad);
}
// Stronger: NO fixture-matching dir slipped into the vendored set at all.
const fixtureDirs = dirs.filter((d) => FIXTURE_RE.test(d));
check(fixtureDirs.length === 0,
  'no CI-fixture-matching dir vendored (FIXTURE_DIR_RE)' + (fixtureDirs.length ? ' -- found: ' + fixtureDirs.join(', ') : ''));

// Test 6: >= 115 real-src slices (dirs WITHOUT a hand-authored sdk-stub.ts) -- the real
// corpus, not just the 14 hand-authored preserve dirs (13 hand-only + grafana).
let realSrc = 0;
for (const d of dirs) {
  if (!fs.existsSync(path.join(PLUGINS_DIR, d, 'src', 'sdk-stub.ts'))) realSrc++;
}
check(realSrc >= 115,
  'vendored >= 115 real-src slices (no sdk-stub.ts); got ' + realSrc);

console.log('\nPASS=' + passed + ' FAIL=' + failed);
if (failed > 0) process.exit(1);
