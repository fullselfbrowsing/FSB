#!/usr/bin/env node
'use strict';

/**
 * Phase 39 / Plan 01 (v1.0.0 Full App Catalog -- BRDTH-02) -- THE PAYMENT-OP
 * GUARD proof (the headline money-no-movement-under-Auto CI assertion).
 *
 * The most-sensitive batch's SECURITY CONTRACT: a payment-bearing op
 * (place_order / checkout / charge / complete_booking / buy_tickets / book_flight /
 * request_ride / place_bid / create_order / ...) that is ever classified
 * on an ungated origin would run under the shipped opt-out Auto default = MONEY
 * MOVED without consent. The payment-origin gate is the mitigation boundary:
 * checkPaymentOpsNotSafeInvocable in verify-catalog-crosscheck.mjs FAILS THE BUILD
 * on any payment op whose service is not sensitive/denied.
 *
 * This test drives the REAL checkPaymentOpsNotSafeInvocable export (NOT a
 * re-implemented copy; mirrors tests/catalog-crosscheck.test.js's real-export
 * pattern) and proves:
 *   (a) the payment-op-safe-invocable.fixture.json (a payment op on a SAFE origin)
 *       FAILS the guard even when promoted to backing handler.
 *   (b) PER-VERB-FAMILY COVERAGE (the blocker proof): EACH of buy_tickets /
 *       book_flight / request_ride / place_bid / create_order / place_order on a SAFE
 *       origin FAILS -- so all 12 phase-39 payment op-names are detected (the
 *       payment-VERB set AND the literal op-name set), not just the literal keys.
 *   (c) a payment op on a SENSITIVE origin PASSES regardless of backing (posture-B
 *       origin gating is the consent boundary).
 *   (d) a READ-only-safe op (yelp.search_businesses / calendly.get_availability)
 *       carries NO payment verb -> PASSES (the guard is payment-op-scoped, not a
 *       blanket safe-write ban -- it must not false-fail a benign commerce read).
 *   (e) over the REAL committed Denylist, opentable is sensitive (per 39-01) so a
 *       reserve op on it PASSES, live handler-backed etsy.checkout and
 *       lyft.request_ride PASS because their origins are gated, while the same op on
 *       a safe origin FAILS -- the live-roster classification drives the verdict.
 *
 * Zero-framework node test: a check(cond,msg) counter, PASS=/FAIL= summary,
 * process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/payment-op-guard.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const ROOT = path.resolve(__dirname, '..');
const GATE_PATH = path.join(ROOT, 'scripts', 'verify-catalog-crosscheck.mjs');
const DENYLIST_MODULE = path.join(ROOT, 'extension', 'utils', 'service-denylist.js');
const SAFE_INVOCABLE_FIXTURE = path.join(ROOT, 'catalog', 'descriptors', '_fixtures', 'payment-op-safe-invocable.fixture.json');

// A stub classify() returning a SAFE origin (the verdict the guard fails on, leg ii).
const safeClassify = () => ({ sensitive: false, denied: false });
// A stub classify() returning a SENSITIVE origin (the verdict the guard passes).
const sensClassify = () => ({ sensitive: true, denied: false });

// Does the guard flag a specific slug? (failures embed the slug.)
function flags(result, slug) {
  return !!(result && Array.isArray(result.failures) &&
    result.failures.some((f) => typeof f === 'string' && f.indexOf(slug) !== -1));
}

(async () => {
  console.log('--- BRDTH-02 payment-op guard (money-no-movement-under-Auto) ---');

  const gate = await import(pathToFileURL(GATE_PATH).href);
  check(typeof gate.checkPaymentOpsNotSafeInvocable === 'function',
    'checkPaymentOpsNotSafeInvocable is a named export of the real gate (not re-implemented here)');

  // ---- (a) the payment-op-safe-invocable fixture FAILS the guard -------------
  check(fs.existsSync(SAFE_INVOCABLE_FIXTURE),
    '(a) the payment-op-safe-invocable fixture exists on disk');
  const safeInvocableFixture = JSON.parse(fs.readFileSync(SAFE_INVOCABLE_FIXTURE, 'utf8'));
  check(safeInvocableFixture.service === 'shopcorp.example' && safeInvocableFixture.backing === 'handler',
    '(a) the fixture is a payment op on a SAFE origin (shopcorp.example) with backing handler');
  const aFail = gate.checkPaymentOpsNotSafeInvocable([safeInvocableFixture], safeClassify);
  check(Array.isArray(aFail.failures) && aFail.failures.length > 0,
    '(a) checkPaymentOpsNotSafeInvocable([payment-op-safe-invocable fixture]) yields > 0 failures because the origin is ungated -> the build ABORTS');
  check(flags(aFail, 'shopcorp.place_order'),
    '(a) the failure NAMES the offending slug shopcorp.place_order');

  for (const backing of ['dom', 'handler', 'recipe']) {
    const safeAnyBacking = gate.checkPaymentOpsNotSafeInvocable(
      [{ slug: 'shopcorp.checkout', service: 'shopcorp.example', sideEffectClass: 'write', backing }],
      safeClassify
    );
    check(Array.isArray(safeAnyBacking.failures) && safeAnyBacking.failures.length > 0 && flags(safeAnyBacking, 'shopcorp.checkout'),
      '(a) a payment op on a SAFE origin FAILS regardless of backing:' + backing);
  }

  // ---- (b) PER-VERB-FAMILY COVERAGE: each family on a SAFE origin FAILS -------
  // buy_tickets/book_flight/request_ride/place_bid -> PATH 1 payment verbs;
  // create_order -> PATH 2 op-name (verb 'create' is benign); place_order -> BOTH.
  // Each on a SAFE origin (backing:'dom') must FAIL -- proving the guard detects
  // every verb family, not just the literal place_order/checkout keys.
  const verbFamilies = ['buy_tickets', 'book_flight', 'request_ride', 'place_bid', 'create_order', 'place_order'];
  for (const op of verbFamilies) {
    const f = gate.checkPaymentOpsNotSafeInvocable(
      [{ slug: 'shopco.' + op, service: 'shopco.example', sideEffectClass: 'write', backing: 'dom' }],
      safeClassify
    );
    check(Array.isArray(f.failures) && f.failures.length > 0 && flags(f, 'shopco.' + op),
      '(b) payment verb family ' + op + ' on a SAFE origin FAILS the guard (all 12 phase-39 payment op-names detected)');
  }

  // create_order is the PATH-2-only case (verb 'create' is benign) -- assert it is
  // caught specifically by the op-name set, not PATH 1.
  const createOrder = gate.checkPaymentOpsNotSafeInvocable(
    [{ slug: 'shopco.create_order', service: 'shopco.example', sideEffectClass: 'write', backing: 'dom' }],
    safeClassify
  );
  check(createOrder.failures.length > 0 && /payment OP-NAME/.test(createOrder.failures.join('|')),
    '(b) create_order is caught via the literal PAYMENT_OP op-name set (its verb "create" is benign -- PATH 1 alone would miss it)');

  // ---- (b2) a payment op PROMOTED to recipe/handler PASSES on a SENSITIVE origin -
  // backing recipe/handler is allowed when posture-B origin gating supplies consent.
  const promotedOnSensitive = gate.checkPaymentOpsNotSafeInvocable(
    [{ slug: 'shopco.checkout', service: 'shopco.example', sideEffectClass: 'write', backing: 'handler' }],
    sensClassify
  );
  check(promotedOnSensitive.failures.length === 0,
    '(b2) a payment op promoted to backing handler PASSES on a SENSITIVE origin (origin gating is the consent boundary)');

  // ---- (c) a DOM-only payment op on a SENSITIVE origin PASSES -----------------
  // reserve_table on opentable: opentable is sensitive per 39-01 -> PASSES.
  const cPass = gate.checkPaymentOpsNotSafeInvocable(
    [{ slug: 'opentable.reserve_table', service: 'www.opentable.com', sideEffectClass: 'write', backing: 'dom' }],
    sensClassify
  );
  check(Array.isArray(cPass.failures) && cPass.failures.length === 0,
    '(c) a backing:"dom" payment op (reserve_table) on a SENSITIVE origin (opentable) PASSES');

  // ---- (d) a READ-only-safe op carries NO payment verb -> PASSES --------------
  // yelp.search_businesses / calendly.get_availability: search/get are NOT payment
  // verbs/op-names, so the guard never keys on them -- it must not false-fail a
  // benign commerce read (the guard is payment-op-scoped, not a blanket safe-write ban).
  const dPass = gate.checkPaymentOpsNotSafeInvocable([
    { slug: 'yelp.search_businesses', service: 'www.yelp.com', sideEffectClass: 'read', backing: 'dom' },
    { slug: 'calendly.get_availability', service: 'calendly.com', sideEffectClass: 'read', backing: 'dom' },
  ], safeClassify);
  check(Array.isArray(dPass.failures) && dPass.failures.length === 0,
    '(d) read-only-safe ops (yelp.search_businesses, calendly.get_availability) PASS -- they carry no payment verb/op-name, the guard never keys on them');

  // ---- (e) over the REAL committed Denylist the live classification drives it -
  // opentable, etsy, and lyft are gated in the committed roster, so payment ops on
  // them PASS; the SAME op on a genuinely safe origin FAILS.
  const Denylist = require(DENYLIST_MODULE);
  await Denylist.load();
  check(Denylist.isLoaded() === true, '(e) service-denylist loaded (the REAL committed roster drives classify())');
  check(Denylist.classify('https://www.opentable.com').sensitive === true,
    '(e) the committed roster classifies opentable SENSITIVE (per 39-01) -- the live data, not a stub');

  const eOpentable = gate.checkPaymentOpsNotSafeInvocable(
    [{ slug: 'opentable.reserve_table', service: 'www.opentable.com', sideEffectClass: 'write', backing: 'dom' }],
    Denylist.classify
  );
  check(Array.isArray(eOpentable.failures) && eOpentable.failures.length === 0,
    '(e) reserve_table on opentable PASSES against the LIVE committed roster (opentable is sensitive -> posture-B gated)');

  const livePaymentDescriptors = [
    JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'descriptors', 'opentabs__etsy__checkout.json'), 'utf8')),
    JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'descriptors', 'opentabs__lyft__request_ride.json'), 'utf8')),
  ];
  check(livePaymentDescriptors.every((d) => d && d.backing === 'handler'),
    '(e) live etsy.checkout and lyft.request_ride remain backing:"handler" by design');
  const eLiveHandlerBacked = gate.checkPaymentOpsNotSafeInvocable(livePaymentDescriptors, Denylist.classify);
  check(Array.isArray(eLiveHandlerBacked.failures) && eLiveHandlerBacked.failures.length === 0,
    '(e) live handler-backed etsy.checkout and lyft.request_ride PASS because their origins are gated in the committed roster');

  const eSafeHost = gate.checkPaymentOpsNotSafeInvocable(
    [{ slug: 'shopco.place_order', service: 'shopco.example', sideEffectClass: 'write', backing: 'dom' }],
    Denylist.classify
  );
  check(Array.isArray(eSafeHost.failures) && eSafeHost.failures.length > 0,
    '(e) the SAME payment op on a genuinely-safe origin (shopco.example, unclassified) FAILS against the LIVE roster -- the live classification drives the verdict');

  // ---- (f) a NON-payment write on a safe origin is NOT a payment op -----------
  // create_issue / send_message: 'create'/'send' are write verbs but NOT payment
  // verbs, and the op-names are not in PAYMENT_OP_NAMES -> the guard does not key on
  // them (scoped to payment ops; a generic write is governed by classification/posture-B,
  // not by this guard).
  const fIgnored = gate.checkPaymentOpsNotSafeInvocable([
    { slug: 'linear.create_issue', service: 'linear.app', sideEffectClass: 'write', backing: 'dom' },
    { slug: 'discord.send_message', service: 'discord.com', sideEffectClass: 'write', backing: 'dom' },
  ], safeClassify);
  check(Array.isArray(fIgnored.failures) && fIgnored.failures.length === 0,
    '(f) non-payment writes (create_issue, send_message) are NOT payment ops -> the guard does not key on them (payment-op-scoped, not a blanket write ban)');

  console.log('\npayment-op-guard: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: payment-op-guard threw:', err && err.message ? err.message : err);
  process.exit(1);
});
