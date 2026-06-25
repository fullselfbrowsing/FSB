'use strict';

/**
 * Phase 37 / Plan 01 (v1.0.0 Full App Catalog -- BRDTH-02) -- the merge-time
 * batch-coverage gate proof.
 *
 * The breadth contract imports descriptors in CATEGORY BATCHES, least-sensitive ->
 * most-sensitive, and EVERY origin in a batch must classify denied/sensitive/safe
 * BEFORE the batch merges. The importer (scripts/import-opentabs-catalog.mjs
 * runImport) calls classifyGate over the whole enumerated batch and ABORTS (exit 1)
 * if any origin is an unclassified sensitivity-suspect. This is the per-batch gate
 * Phases 38/39 inherit; this test proves it fails-closed on an unclassified batch
 * origin and passes the safe dev/productivity batch.
 *
 * Proof (mirrors tests/classification-gate.test.js):
 *   (a) classifyGate over the batch-unclassified-origin fixture (a finance/payment
 *       brand host the heuristic flags but that is NOT in the denylist) returns
 *       failures.length > 0 and NAMES the offending origin -> the build aborts.
 *   (b) classifyGate over the REAL dev/productivity batch origins (linear.app,
 *       app.asana.com) returns failures.length === 0 -> the safe batch passes.
 *
 * The gate is ESM (.mjs); this test is CJS, so classifyGate is loaded via a dynamic
 * await import() inside the async IIFE. classify() reads the committed roster, so the
 * test awaits Denylist.load() against extension/config/service-denylist.json first
 * (the SAME module instance the gate's classifyGate consults).
 *
 * Zero-framework node test: a check(cond,msg) counter, PASS=/FAIL= summary,
 * process.exit(1) on any fail. ASCII-only, NO emojis.
 *
 * Run: node tests/breadth-batch-gate.test.js
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
const FIXTURE_PATH = path.join(REPO_ROOT, 'catalog', 'descriptors', '_fixtures', 'batch-unclassified-origin.fixture.json');
const SOCIAL_FIXTURE_PATH = path.join(REPO_ROOT, 'catalog', 'descriptors', '_fixtures', 'batch-unclassified-social-origin.fixture.json');
const DENYLIST_MODULE = path.join(REPO_ROOT, 'extension', 'utils', 'service-denylist.js');

(async () => {
  console.log('--- BRDTH-02 merge-time batch-coverage gate (fail-closed) ---');

  // Populate classify() from the committed roster so the gate sees real data. The
  // gate's classifyGate calls Denylist.classify() on the SAME module instance this
  // test loads via require, so awaiting load() here populates it for the gate too.
  const Denylist = require(DENYLIST_MODULE);
  await Denylist.load();
  check(Denylist.isLoaded() === true, 'service-denylist loaded (classify() reads the committed roster)');

  // Dynamic import of the ESM gate (this test is CJS).
  const gate = await import(GATE_PATH);
  check(typeof gate.classifyGate === 'function', 'verify-classification-gate.mjs exports classifyGate');

  // ---- (a) FAIL-CLOSED on an unclassified batch origin ----------------------
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  check(fixture && fixture.service === 'wallet.acme-pay.example',
    'batch-unclassified-origin fixture present (service wallet.acme-pay.example)');
  const fixtureOrigin = 'https://' + fixture.service;
  const fixtureItem = { origin: fixtureOrigin, service: fixture.service, slug: fixture.slug, description: fixture.description };

  const rejected = gate.classifyGate([fixtureItem]);
  check(rejected && Array.isArray(rejected.failures) && rejected.failures.length > 0,
    '(a) classifyGate([unclassified batch origin]) reports > 0 failures -> the batch merge ABORTS (fail-closed)');
  check(rejected.failures.length > 0 && /wallet\.acme-pay\.example/.test(rejected.failures.join('\n')),
    '(a) the failure NAMES the offending batch origin wallet.acme-pay.example');

  // The fixture also trips classify()-as-unclassified: confirm the denylist genuinely
  // does NOT classify it (so the failure is the gate doing its job, not stale data).
  const fixtureClass = Denylist.classify(fixtureOrigin);
  check(fixtureClass && fixtureClass.denied === false && fixtureClass.sensitive === false,
    '(a) the fixture origin is genuinely UNCLASSIFIED in the denylist (denied:false, sensitive:false) -- the gate, not a stale roster, rejects it');

  // ---- (b) the safe dev/productivity batch passes ---------------------------
  const safeBatch = gate.classifyGate([
    { origin: 'https://linear.app', service: 'linear.app', slug: 'linear.create_issue', description: 'Create a new issue in Linear' },
    { origin: 'https://app.asana.com', service: 'app.asana.com', slug: 'asana.create_task', description: 'Create a new task in Asana' },
  ]);
  check(safeBatch && safeBatch.failures.length === 0,
    '(b) classifyGate([linear.app, app.asana.com]) -> 0 failures (the safe least-sensitive batch passes)');

  // ---- (c) FAIL-CLOSED on an unclassified SOCIAL/MESSAGING batch origin ------
  // Phase-38 (BRDTH-02) comms/social screening: a social/messaging batch origin
  // that trips the social/messaging sensitivity axis but is NOT classified must
  // abort the merge -- the per-app comms/social screening enforced as a build
  // failure, distinct from the finance-axis (a) block above.
  const socialFixture = JSON.parse(fs.readFileSync(SOCIAL_FIXTURE_PATH, 'utf8'));
  check(socialFixture && socialFixture.service === 'messenger.acme-social.example',
    'batch-unclassified-social-origin fixture present (service messenger.acme-social.example)');
  const socialOrigin = 'https://' + socialFixture.service;
  const socialItem = { origin: socialOrigin, service: socialFixture.service, slug: socialFixture.slug, description: socialFixture.description };

  const socialRejected = gate.classifyGate([socialItem]);
  check(socialRejected && Array.isArray(socialRejected.failures) && socialRejected.failures.length > 0,
    '(c) classifyGate([unclassified SOCIAL batch origin]) reports > 0 failures -> the comms/social batch merge ABORTS (fail-closed)');
  check(socialRejected.failures.length > 0 && /messenger\.acme-social\.example/.test(socialRejected.failures.join('\n')),
    '(c) the failure NAMES the offending social batch origin messenger.acme-social.example');
  check(socialRejected.failures.length > 0 && /social\/messaging/.test(socialRejected.failures.join('\n')),
    '(c) the failure cites the social/messaging sensitivity axis (the comms/social screening axis)');

  // The social fixture is genuinely UNCLASSIFIED -> the failure is the gate doing
  // its job over the committed roster, not stale data.
  const socialClass = Denylist.classify(socialOrigin);
  check(socialClass && socialClass.denied === false && socialClass.sensitive === false,
    '(c) the social fixture origin is genuinely UNCLASSIFIED in the denylist (denied:false, sensitive:false)');

  // ---- (d) the SCREENED comms/social batch origins PASS ----------------------
  // Task-1 classified chatgpt.com / claude.ai sensitive (discord.com already
  // sensitive in Phase 35), so the screened comms/social batch is GOVERNED ->
  // classifyGate continues past each (classify()-matched) with 0 failures and the
  // Phase-38 import (02/03) will NOT abort on these origins.
  const screenedSocialBatch = gate.classifyGate([
    { origin: 'https://chatgpt.com', service: 'chatgpt.com', slug: 'chatgpt.send_message', description: 'Send a message in ChatGPT' },
    { origin: 'https://claude.ai', service: 'claude.ai', slug: 'claude.send_message', description: 'Send a message in Claude' },
    { origin: 'https://discord.com', service: 'discord.com', slug: 'discord.post_message', description: 'Post a message in Discord' },
  ]);
  check(screenedSocialBatch && screenedSocialBatch.failures.length === 0,
    '(d) classifyGate([chatgpt.com, claude.ai, discord.com]) -> 0 failures (the SCREENED comms/social batch is governed and passes)');

  console.log(`\nbreadth-batch-gate: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: breadth-batch-gate threw:', err && err.message ? err.message : err);
  process.exit(1);
});
