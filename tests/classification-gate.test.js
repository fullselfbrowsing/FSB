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

  // (e) MD-02 REGRESSION (closed false-negative): a brand-only finance origin
  //     whose HOST carries no category noun, but whose DESCRIPTION contains the
  //     inflected forms `funds` / `banking`, is now caught. Before MD-02 the
  //     `\bfund\b`/`\bbank\b` anchors missed "funds"/"banking" entirely, so these
  //     unclassified-sensitive origins slipped the gate as "safe". The hosts are
  //     fabricated (not in the roster), so they are NOT explicitly classified and
  //     fall through to the heuristic.
  const fundsItem = { origin: 'https://acme-capital.example.com', slug: 'acme.balance', description: 'manage your funds and transfers' };
  const bankingItem = { origin: 'https://acme-neo.example.com', slug: 'acme.account', description: 'online banking dashboard' };
  // Guard: these must be UNclassified (else they would continue before the heuristic).
  check(Denylist.classify(fundsItem.origin).sensitive === false && Denylist.classify(fundsItem.origin).denied === false,
    '(e) precondition: the "funds" test origin is unclassified (reaches the heuristic)');
  check(Denylist.classify(bankingItem.origin).sensitive === false && Denylist.classify(bankingItem.origin).denied === false,
    '(e) precondition: the "banking" test origin is unclassified (reaches the heuristic)');
  const fundsCaught = gate.classifyGate([fundsItem]);
  check(fundsCaught && fundsCaught.failures.length >= 1 && /finance\/payment/.test(fundsCaught.failures[0]),
    '(e) an unclassified origin whose description contains "funds" is now FLAGGED (MD-02 false-negative closed)');
  const bankingCaught = gate.classifyGate([bankingItem]);
  check(bankingCaught && bankingCaught.failures.length >= 1 && /finance\/payment/.test(bankingCaught.failures[0]),
    '(e) an unclassified origin whose description contains "banking" is now FLAGGED (MD-02 false-negative closed)');

  // (f) NO-FALSE-POSITIVE PRESERVED: widening the finance vocabulary with
  //     `funds`/`banking` must NOT start failing benign already-shipped
  //     descriptors. reddit.inbox / github.notifications carry no finance token,
  //     so they still produce zero failures.
  const benignShipped = gate.classifyGate([
    { origin: 'https://www.reddit.com', slug: 'reddit.inbox', description: 'list your unread messages' },
    { origin: 'https://github.com', slug: 'github.notifications', description: 'list your notifications' },
    { origin: 'https://airtable.com', slug: 'airtable.list', description: 'list records in a base' },
    { origin: 'https://www.wikipedia.org', slug: 'wikipedia.search', description: 'search articles' },
  ]);
  check(benignShipped && benignShipped.failures.length === 0,
    '(f) benign [reddit.inbox, github.notifications, airtable, wikipedia] -> 0 failures (MD-02 widening kept no-false-positive)');

  // (g) MED-01 (38-REVIEW) BACKSTOP: the heuristic now INDEPENDENTLY flags all 6 of
  //     the Phase-38 comms/social WRITE origins on host+slug+description alone -- so an
  //     accidentally-dropped explicit sensitiveOrigins line for chatgpt/claude/bsky/
  //     mastodon/threads (discord already tripped) would FAIL the build instead of
  //     silently re-enabling writes. This loads each REAL EMITTED write descriptor
  //     FROM DISK and asserts sensitivityHeuristic(host, slug, description) returns
  //     { suspect:true, axis:'social/messaging' } -- the safety net, proven, not the
  //     current shipped state (which is correct: all 6 are explicitly classified).
  check(typeof gate.sensitivityHeuristic === 'function',
    '(g) verify-classification-gate.mjs exports sensitivityHeuristic (the backstop under test)');
  const DESCRIPTORS_DIR = path.join(REPO_ROOT, 'catalog', 'descriptors');
  const socialWriteDescriptors = [
    'opentabs__chatgpt__send_message.json',
    'opentabs__claude__send_message.json',
    'opentabs__bsky__create_post.json',
    'opentabs__mastodon__create_status.json',
    'opentabs__threads__create_thread.json',
    'opentabs__discord__send_message.json',
  ];
  for (const fileName of socialWriteDescriptors) {
    const filePath = path.join(DESCRIPTORS_DIR, fileName);
    check(fs.existsSync(filePath), '(g) the REAL emitted ' + fileName + ' exists on disk (the screened write descriptor)');
    const d = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const host = String(d.service || '').toLowerCase();
    const verdict = gate.sensitivityHeuristic(host, d.slug, d.description);
    check(verdict && verdict.suspect === true && verdict.axis === 'social/messaging',
      '(g) sensitivityHeuristic trips social/messaging for ' + d.slug + ' (' + host + ') [matched "' + (verdict && verdict.keyword) + '"] -- the explicit-classification SPOF is now backstopped');
  }
  // (g) NO-FALSE-POSITIVE REASSERTED for the MED-01 widening: reddit READS carry
  // "post"/"posts" heavily ("reddit post", "posts in a subreddit") but reddit is
  // safe-by-default (in NO axis), so the heuristic must NOT trip on them -- the
  // widening deliberately added brand tokens (chatgpt/claude/bsky/mastodon/threads),
  // never a bare `post`/`feed`/`dm`. Proven directly over the real reddit read shapes.
  const redditReadHay = [
    ['reddit.com', 'reddit.get_post', 'Get a single Reddit post by its ID, including its body and top-level comments.'],
    ['reddit.com', 'reddit.list_subreddit_posts', 'List posts in a subreddit, sorted hot/new/top/rising.'],
  ];
  for (const [host, slug, desc] of redditReadHay) {
    const verdict = gate.sensitivityHeuristic(host, slug, desc);
    check(verdict && verdict.suspect === false,
      '(g) sensitivityHeuristic does NOT trip on the reddit READ ' + slug + ' (reddit stays safe-by-default; the MED-01 widening added no bare post/feed/dm token)');
  }

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
