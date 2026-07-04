'use strict';

/**
 * Phase 39 / Plan 07 (v1.0.0 Full App Catalog -- BRDTH-01/02/03, success criterion 3)
 * -- the coverage-report proof.
 *
 * THE CONTRACT: drive the REAL scripts/coverage-report.mjs reportCoverage() export
 * over the COMMITTED catalog (extension/catalog/recipe-index.generated.js -- the SAME
 * array capability-search.js indexes, NOT a hand-built stand-in) and assert the
 * full-corpus coverage breakdown holds:
 *
 *   1. ZERO dead entries: totals.dead === 0 AND deadSlugs is empty -- every searchable
 *      slug resolves to a non-null seam tier (the no-dead-entry invariant, CGEN-03,
 *      cross-confirmed over the COMPLETE real-app corpus, not just the smoke slice).
 *   2. The Phase-39 commerce/travel/misc batch is covered in supported seam buckets:
 *      DOM descriptors remain in the dom bucket, and T1 handler promotions are allowed
 *      to appear in the head bucket. NONE is dead.
 *   3. The head bucket is correct: it includes the 3 heads (github/slack/notion handler
 *      slugs) + the hand-authored recipes (reddit.inbox / github.notifications).
 *   4. COMPLETENESS VERIFIED AGAINST THE 39-06 MANIFEST: parse the VENDORED+IMPORTED
 *      rows of .planning/phases/39-.../39-06-REMAINING-APPS.md and assert EVERY such
 *      app (by its slug stem) has at least one catalog descriptor. A manifest row with
 *      NO matching descriptor FAILS naming the gap (the completeness contract -- the
 *      manifest is the source of truth for "what must be covered", NOT a hand-kept
 *      number). realAppCount is reported vs the ~117 milestone target.
 *   5. No payment op is on an ungated origin: the payment-op crosscheck may allow
 *      handler-backed payment ops when their services classify sensitive/denied.
 *
 * Zero-framework FSB convention (mirrors tests/no-dead-entry.test.js): module-level
 * passed/failed counters, synchronous check(cond,msg), process.exit(failed>0?1:0).
 * ASCII-only, NO emojis.
 *
 * The coverage report + the crosscheck gate are .mjs (ESM dual-exports); this test is
 * CJS (the FSB test convention), so it loads them via a dynamic import() inside an
 * async IIFE -- the same bridge tests/capability-search-eval.test.js uses for the ESM
 * runtime modules.
 *
 * Run: node tests/coverage-report.test.js
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(REPO_ROOT, 'scripts', 'coverage-report.mjs');
const CROSSCHECK_PATH = path.join(REPO_ROOT, 'scripts', 'verify-catalog-crosscheck.mjs');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const DENYLIST_MODULE = path.join(REPO_ROOT, 'extension', 'utils', 'service-denylist.js');
const MANIFEST_PATH = path.join(
  REPO_ROOT, '.planning', 'phases',
  '39-breadth-c-commerce-travel-misc-most-sensitive',
  '39-06-REMAINING-APPS.md'
);

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// The 30 Phase-39 commerce/travel/misc app slug STEMS (the batch imported across
// 39-02..06; authoritative from the plan summaries). T1 handler rollout can promote
// descriptors in this batch, so this coverage test verifies supported seam buckets
// and leaves payment safety to the shared payment-origin gate below.
const PHASE_39_STEMS = [
  // 39-02 food-delivery + rideshare
  'doordash', 'ubereats', 'grubhub', 'instacart', 'uber', 'lyft',
  // 39-03 retail/marketplace
  'amazon', 'ebay', 'etsy', 'bestbuy', 'costco', 'walmart', 'target',
  // 39-04 travel/transport
  'booking', 'airbnb', 'expedia', 'kayak', 'opentable',
  // 39-05 events/local-services/scheduling
  'ticketmaster', 'stubhub', 'eventbrite', 'yelp', 'tripadvisor', 'calendly',
  // 39-06 final commerce/misc
  'shopify', 'craigslist', 'dominos', 'chipotle', 'zillow', 'grafana',
];

// ---- Parse the 39-06 manifest's VENDORED+IMPORTED rows (the completeness source) ---
// The manifest table rows look like:
//   | 1 | shopify | `*.shopify.com` ... | `shopify` | SENSITIVE (payment) | ... | **VENDORED+IMPORTED** (39-06) |
// A genuine data row: starts with '|', contains 'VENDORED+IMPORTED', and the first
// cell is a number. Column 4 (1-indexed past the leading '') is the Stem (slug) --
// the canonical opentabs__<stem>__* identifier the catalog descriptors key on.
function parseManifestVendoredStems(md) {
  const stems = [];
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (line[0] !== '|') { continue; }
    if (line.indexOf('VENDORED+IMPORTED') === -1) { continue; }
    const cols = line.split('|').map(function (c) { return c.trim(); });
    // cols: ['', '#', 'App (dir)', 'Host (service)', 'Stem (slug)', 'Tier', 'Pay', 'Disposition', '']
    if (!/^[0-9]+$/.test(cols[1])) { continue; } // a numbered data row only (not prose)
    const stem = (cols[4] || '').replace(/`/g, '').trim();
    if (stem) { stems.push(stem); }
  }
  return stems;
}

(async () => {
  console.log('--- BRDTH (Phase 39-07): full-corpus coverage report proof (success criterion 3) ---');

  // ---- load the REAL exports (ESM dual-exports) via dynamic import ------------
  const reportMod = await import(pathToFileURL(REPORT_PATH).href);
  const crossMod = await import(pathToFileURL(CROSSCHECK_PATH).href);
  check(typeof reportMod.reportCoverage === 'function',
    'scripts/coverage-report.mjs dual-exports reportCoverage() (the REAL function the test drives)');
  check(typeof crossMod.checkPaymentOpsNotSafeInvocable === 'function',
    'scripts/verify-catalog-crosscheck.mjs exposes the payment-origin guard for cross-confirmation');

  // ---- load the COMMITTED catalog (the same array capability-search indexes) --
  const catalog = require(CATALOG_PATH);
  check(catalog && Array.isArray(catalog.descriptors) && catalog.descriptors.length > 0,
    'the committed catalog (recipe-index.generated.js) loaded with descriptors (got ' +
    (catalog && catalog.descriptors ? catalog.descriptors.length : 0) + ')');

  // ---- drive the REAL reportCoverage over the committed catalog ---------------
  const report = reportMod.reportCoverage(catalog);
  const t = report.totals;
  console.log('  REPORT totals: head=' + t.head + ' learn=' + t.learn + ' dom=' + t.dom +
    ' dead=' + t.dead + ' descriptors=' + t.descriptors +
    ' | realAppCount=' + report.realAppCount + ' (target ~' + report.milestoneTarget + ')');

  // (1) ZERO dead entries -- the no-dead-entry invariant over the complete corpus.
  check(t.dead === 0,
    'totals.dead === 0 (every searchable slug resolves to a non-null seam tier -- the ' +
    'no-dead-entry invariant cross-confirmed over the COMPLETE real-app corpus)');
  check(Array.isArray(report.deadSlugs) && report.deadSlugs.length === 0,
    'deadSlugs is empty (no slug resolves to null -> no RECIPE_NOT_FOUND surprise)' +
    (report.deadSlugs && report.deadSlugs.length ? ' -- DEAD: ' + report.deadSlugs.map(function (d) { return d.slug; }).join(', ') : ''));
  check(t.head + t.learn + t.dom + t.dead === t.descriptors,
    'the bucket counts sum to the descriptor total (head+learn+dom+dead === descriptors)');

  // (2) Phase-39 batch coverage -- descriptors may be DOM or promoted head entries.
  check(t.dom > 0, 'totals.dom > 0 (the dom bucket remains non-empty across the breadth corpus)');
  let phase39Count = 0;
  const invalidPhase39Backings = [];
  const promotedPhase39Slugs = [];
  for (const d of catalog.descriptors) {
    if (!d || typeof d.slug !== 'string') { continue; }
    const stem = d.slug.indexOf('.') !== -1 ? d.slug.slice(0, d.slug.indexOf('.')) : d.slug;
    if (PHASE_39_STEMS.indexOf(stem) === -1) { continue; }
    phase39Count++;
    if (d.backing === 'handler' || d.backing === 'recipe') {
      promotedPhase39Slugs.push(d.slug + ' (backing:' + String(d.backing) + ')');
    } else if (!(d.backing === 'dom' || d.backing === undefined || d.backing === 'learn')) {
      invalidPhase39Backings.push(d.slug + ' (backing:' + String(d.backing) + ')');
    }
  }
  check(phase39Count > 0,
    'the Phase-39 commerce/travel/misc batch is present in the catalog (got ' + phase39Count + ' descriptors over ' + PHASE_39_STEMS.length + ' apps)');
  check(invalidPhase39Backings.length === 0,
    'EVERY Phase-39 commerce/travel/misc descriptor uses a supported seam bucket (dom/absent/learn/handler/recipe)' +
    (invalidPhase39Backings.length ? ' -- INVALID BACKING(S): ' + invalidPhase39Backings.join(', ') : ''));
  check(promotedPhase39Slugs.length > 0,
    'the Phase-39 batch includes T1 handler promotions in the head bucket (got ' + promotedPhase39Slugs.length + ' promoted descriptors)');

  // (3) the head bucket is correct -- the 3 heads + the hand-authored recipes.
  const headSlugs = catalog.descriptors
    .filter(function (d) { return d && (d.backing === 'handler' || d.backing === 'recipe'); })
    .map(function (d) { return d.slug; });
  const HEAD_EXPECTED = [
    'github.issues.create', 'github.issues.list', // github head handlers
    'slack.chat.postMessage', 'slack.conversations.list', // slack head handlers
    'notion.loadPage', 'notion.getSpaces', // notion head handlers
    'reddit.inbox', // hand-authored recipe
    'github.notifications', // hand-authored recipe
  ];
  let everyHeadPresent = true;
  const missingHead = [];
  for (const slug of HEAD_EXPECTED) {
    if (headSlugs.indexOf(slug) === -1) { everyHeadPresent = false; missingHead.push(slug); }
  }
  check(everyHeadPresent,
    'the head bucket includes the 3 heads (github/slack/notion handler slugs) + the hand-authored recipes (reddit.inbox / github.notifications)' +
    (missingHead.length ? ' -- MISSING: ' + missingHead.join(', ') : ''));
  check(t.head === headSlugs.length,
    'totals.head (' + t.head + ') equals the count of handler/recipe-backed descriptors (' + headSlugs.length + ')');

  // (4) COMPLETENESS VERIFIED AGAINST THE 39-06 MANIFEST -----------------------
  check(fs.existsSync(MANIFEST_PATH),
    'the 39-06 remaining-app manifest (39-06-REMAINING-APPS.md) exists on disk (the completeness source of truth)');
  const manifestMd = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const vendoredStems = parseManifestVendoredStems(manifestMd);
  check(vendoredStems.length > 0,
    'parsed the manifest VENDORED+IMPORTED rows (got ' + vendoredStems.length + ' app stems: ' + vendoredStems.join(', ') + ')');

  // Build the set of slug stems the catalog actually covers.
  const catalogStems = new Set();
  for (const d of catalog.descriptors) {
    if (!d || typeof d.slug !== 'string') { continue; }
    const stem = d.slug.indexOf('.') !== -1 ? d.slug.slice(0, d.slug.indexOf('.')) : d.slug;
    catalogStems.add(stem);
  }
  // EVERY VENDORED+IMPORTED manifest row MUST have at least one catalog descriptor.
  let everyManifestRowCovered = true;
  const uncovered = [];
  for (const stem of vendoredStems) {
    if (!catalogStems.has(stem)) { everyManifestRowCovered = false; uncovered.push(stem); }
  }
  check(everyManifestRowCovered,
    'COMPLETENESS: every VENDORED+IMPORTED manifest row has at least one catalog descriptor (no silent coverage gap)' +
    (uncovered.length ? ' -- UNCOVERED REAL APP(S): ' + uncovered.join(', ') + ' (a real app on the 39-06 manifest with no catalog descriptor -- the import plans must close this)' : ''));

  // realAppCount sanity: the catalog covers the complete vendored surface. The 39-06
  // manifest closes the surface at 53 vendored dirs (100% imported); the catalog's
  // distinct services (opentabs DOM services + the heads + the hand-authored recipe
  // services) must therefore exceed the count of vendored apps. Report the count.
  check(report.realAppCount >= vendoredStems.length,
    'realAppCount (' + report.realAppCount + ' distinct services) covers at least the manifest VENDORED+IMPORTED apps (' + vendoredStems.length + ') -- complete coverage, reported vs ~' + report.milestoneTarget);
  // 39.5-04 (the full-source import): RAISED the floor from > 50 to >= 110 to reflect
  // the FULL ~117-real-app corpus. The real import emits ~2,374 descriptors across the
  // 117 real apps; reportCoverage yields realAppCount ~146 distinct services (the per-op
  // apex/www host split the real plugins vendor produces MORE distinct service hosts than
  // the 117 app count -- e.g. reddit.com + www.reddit.com, doordash.com + www.doordash.com).
  // The floor is set with deliberate margin (>= 110, actual ~146) so the exact count is
  // NOT brittle to a single app's host form, while still proving the full corpus landed
  // (the old > 50 floor would silently pass a half-imported catalog).
  check(report.realAppCount >= 110,
    'realAppCount (' + report.realAppCount + ') reflects the FULL real-app corpus (>= 110 distinct services -- the ~117 real apps across their emitted apex/www hosts + the 3 heads + the hand-authored recipe origins; the 39.5-04 full-source import)');

  // (5) NO payment op is on an ungated origin (cross-confirm the payment-op guard) -
  // Reuse the SAME dual-path payment detection the crosscheck gate ships (verbPrefix
  // PAYMENT_VERBS + PAYMENT_OP_NAMES) via the shared side-effect module, so the test
  // keys payment ops EXACTLY as the gate does for coverage counts. The actual safety
  // verdict is delegated to checkPaymentOpsNotSafeInvocable with the live denylist.
  const sideEffectMod = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'lib', 'side-effect-class.mjs')).href);
  const opNameFromSlug = sideEffectMod.opNameFromSlug;
  const verbPrefix = sideEffectMod.verbPrefix;
  const PAYMENT_VERBS = new Set([
    'buy', 'book', 'place', 'reserve', 'checkout', 'pay', 'purchase', 'charge', 'order', 'request', 'register',
  ]);
  const PAYMENT_OP_NAMES = new Set([
    'place_order', 'checkout', 'checkout_cart', 'complete_booking', 'submit_payment',
    'add_payment_method', 'confirm_order', 'create_order', 'buy_now', 'buy_tickets',
    'place_bid', 'book_stay', 'book_flight', 'book_hotel', 'register_for_event',
    'request_ride', 'purchase_tickets',
  ]);
  function isPaymentOp(slug) {
    const opName = opNameFromSlug(slug);
    const verb = verbPrefix(opName);
    if (verb && PAYMENT_VERBS.has(verb)) { return true; }
    if (opName && PAYMENT_OP_NAMES.has(opName)) { return true; }
    return false;
  }
  let paymentOpCount = 0;
  const handlerBackedPaymentOps = [];
  for (const d of catalog.descriptors) {
    if (!d || typeof d.slug !== 'string') { continue; }
    if (!isPaymentOp(d.slug)) { continue; }
    paymentOpCount++;
    if (d.backing === 'recipe' || d.backing === 'handler') {
      handlerBackedPaymentOps.push(d.slug);
    }
  }
  check(paymentOpCount > 0,
    'the catalog carries payment ops (got ' + paymentOpCount + ' -- place_order/create_order/buy_tickets/complete_booking/... across the commerce/travel batch)');

  const Denylist = require(DENYLIST_MODULE);
  await Denylist.load();
  const paymentGate = crossMod.checkPaymentOpsNotSafeInvocable(catalog.descriptors, Denylist.classify);
  check(Array.isArray(paymentGate.failures) && paymentGate.failures.length === 0,
    'NO payment op is on an ungated origin (handler-backed payment ops are allowed only because their services are sensitive/denied)' +
    (paymentGate.failures && paymentGate.failures.length ? ' -- FAILURES: ' + paymentGate.failures.join(' | ') : ''));
  check(handlerBackedPaymentOps.indexOf('etsy.checkout') !== -1 && handlerBackedPaymentOps.indexOf('lyft.request_ride') !== -1,
    'handler-backed payment ops include live etsy.checkout and lyft.request_ride by design (both are covered by the origin gate)');

  console.log('\ncoverage-report.test: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (err) {
  console.error('  FAIL: coverage-report.test threw:', err && err.message ? err.message : err);
  process.exit(1);
});
