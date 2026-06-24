'use strict';

/**
 * Phase 35 plan 02 (v1.0.0 Full App Catalog -- DENY-03) -- classification-gate
 * behavior test.
 *
 * Proves the fail-closed import-time gate (scripts/verify-classification-gate.mjs)
 * does what DENY-03 requires, independent of the CLI sweep:
 *   (a) classifyGate over the unclassified-sensitive proof fixture returns
 *       failures.length >= 1 and the failure names pay.unclassified-fixture.test
 *       (fail-closed PROVEN).
 *   (b) classifyGate over that SAME fixture item, with the fixture origin passed
 *       through the SAFE_ALLOWLIST override (opts.safeAllowlist -- the override
 *       path Task 2 exposes), returns failures.length === 0 (the override works).
 *   (c) classifyGate over a benign sample from the 119-app universe (airtable,
 *       asana, wikipedia, hackernews) returns failures.length === 0 (no
 *       false-positive).
 *   (d) classifyGate over a known-sensitive roster origin already in the denylist
 *       (dashboard.stripe.com) returns failures.length === 0 (an explicitly
 *       classified origin never fails, even though it trips the heuristic).
 *
 * The gate is ESM (.mjs) and this test is CJS, so classifyGate is loaded via a
 * dynamic await import() inside the async IIFE. classify() must be populated
 * before assertions (b)/(d) rely on real roster data, so the test awaits
 * Denylist.load() against the committed extension/config/service-denylist.json.
 *
 * Zero-framework node test (mirror tests/service-denylist.test.js): a
 * check(cond,msg) counter, PASS=/FAIL= summary, process.exit(1) on any fail.
 *
 * Run: node tests/classification-gate.test.js
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
const GATE_PATH = path.join(REPO_ROOT, 'scripts', 'verify-classification-gate.mjs');
const FIXTURE_PATH = path.join(REPO_ROOT, 'catalog', 'descriptors', '_fixtures', 'unclassified-sensitive.fixture.json');
const DENYLIST_MODULE = path.join(REPO_ROOT, 'extension', 'utils', 'service-denylist.js');

(async () => {
  console.log('--- DENY-03 classification gate (fail-closed) ---');

  // Load classify() data so (b)/(d) see the real committed roster. The gate's
  // classifyGate calls Denylist.classify() on the SAME module instance this test
  // loads via require, so awaiting load() here populates it for the gate too.
  const Denylist = require(DENYLIST_MODULE);
  await Denylist.load();
  check(Denylist.isLoaded() === true, 'service-denylist loaded (classify() reads the committed roster)');

  // Dynamic import of the ESM gate (this test is CJS).
  const gate = await import(path.toNamespacedPath ? GATE_PATH : GATE_PATH);
  check(typeof gate.classifyGate === 'function', 'verify-classification-gate.mjs exports classifyGate');

  // Build the fixture item from the on-disk proof fixture: origin = https://<service>.
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  check(fixture && fixture.service === 'pay.unclassified-fixture.test',
    'proof fixture present with service pay.unclassified-fixture.test');
  const fixtureOrigin = 'https://' + fixture.service;
  const fixtureItem = { origin: fixtureOrigin, slug: fixture.slug, description: fixture.description };

  // (a) FAIL-CLOSED: the unclassified sensitivity-suspect fixture is rejected,
  //     and the failure NAMES the offending origin.
  const rejected = gate.classifyGate([fixtureItem]);
  check(rejected && Array.isArray(rejected.failures) && rejected.failures.length >= 1,
    '(a) classifyGate([fixture]) reports >= 1 failure (fail-closed)');
  check(rejected.failures.length >= 1 && /pay\.unclassified-fixture\.test/.test(rejected.failures[0]),
    '(a) the failure NAMES the offending origin pay.unclassified-fixture.test');

  // (b) OVERRIDE PATH: passing the fixture origin through SAFE_ALLOWLIST
  //     (opts.safeAllowlist -- the override Task 2 exposes) yields zero failures.
  const overridden = gate.classifyGate([fixtureItem], { safeAllowlist: [fixtureOrigin] });
  check(overridden && overridden.failures.length === 0,
    '(b) classifyGate([fixture], { safeAllowlist:[origin] }) -> 0 failures (override path proven)');

  // (c) NO FALSE-POSITIVE: a benign sample from the 119-app universe.
  const benign = gate.classifyGate([
    { origin: 'https://airtable.com', slug: 'airtable.list', description: 'list records in a base' },
    { origin: 'https://app.asana.com', slug: 'asana.tasks', description: 'list your assigned tasks' },
    { origin: 'https://www.wikipedia.org', slug: 'wikipedia.search', description: 'search articles' },
    { origin: 'https://news.ycombinator.com', slug: 'hackernews.top', description: 'list top stories' },
  ]);
  check(benign && benign.failures.length === 0,
    '(c) benign sample [airtable, asana, wikipedia, hackernews] -> 0 failures (no false-positive)');

  // (d) EXPLICITLY-CLASSIFIED NEVER FAILS: stripe trips the finance heuristic but
  //     dashboard.stripe.com is classified sensitive, so the gate continues.
  const classifiedSensitive = gate.classifyGate([
    { origin: 'https://dashboard.stripe.com', slug: 'stripe.charges', description: 'list payments' },
  ]);
  check(classifiedSensitive && classifiedSensitive.failures.length === 0,
    '(d) classifyGate([dashboard.stripe.com]) -> 0 failures (explicitly classified sensitive, even though it trips the heuristic)');

  // The package.json chain wiring is asserted separately (acceptance check 4 in
  // the plan): validate:extension contains verify-classification-gate.mjs and the
  // test chain contains this file. Assert it here too so the test self-guards the
  // wiring that makes it run in CI.
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  check(/verify-classification-gate\.mjs/.test(pkg.scripts['validate:extension']),
    'package.json validate:extension chains node scripts/verify-classification-gate.mjs');
  check(/classification-gate\.test\.js/.test(pkg.scripts.test),
    'package.json test chain contains node tests/classification-gate.test.js');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('classification-gate.test.js failed:', err && err.message ? err.message : err);
  process.exit(1);
});
