#!/usr/bin/env node
'use strict';

/**
 * Phase 39.5 / Plan 03 (v1.0.0 Full App Catalog -- BRDTH-02/03) -- the FULL-CORPUS
 * re-screening proof (the security task's checked half).
 *
 * THE CONTRACT: before the Plan-39.5-04 full-source import lands, the whole ~114-origin
 * corpus across the 117 real OpenTabs apps must be CLASSIFY-COMPLETE (the fail-closed
 * classifyGate surfaces NO unclassified sensitivity-suspect origin), the 2 surfaced
 * origins (linkedin.com social axis / youtube.com media axis) must be governed, and the
 * CONSERVATIVE commerce posture must be a CHECKED invariant -- every commerce/payment/
 * travel/marketplace brand classifies SENSITIVE, enforced by the build-failing
 * checkCommerceSensitiveClassified backstop (the inverse of READ_ONLY_SAFE_SERVICES).
 *
 * WHY a backstop is needed beyond classifyGate (the gap this plan closes): a NET-NEW
 * READ-ONLY commerce brand (homedepot/priceline/redfin/starbucks/pandaexpress) emits
 * only list/get/search ops and its host carries no place-order/checkout/charge token ->
 * it does NOT trip any classifyGate axis, and the payment-op guard does NOT key on it
 * (no payment verb). So NEITHER existing gate catches a MISSED read-only commerce brand;
 * it would ship SAFE-under-Auto silently. The enumerated COMMERCE_SENSITIVE_SERVICES
 * roster + checkCommerceSensitiveClassified is the only gate that can.
 *
 * This test drives the REAL exports (NOT re-implemented copies):
 *   - the REAL classifyGate (scripts/verify-classification-gate.mjs) over EVERY real-app
 *     origin enumerated the SAME way the importer gates them (enumerateBatchApps +
 *     readPluginMeta from scripts/import-opentabs-catalog.mjs) -> 0 failures.
 *   - the REAL checkCommerceSensitiveClassified + COMMERCE_SENSITIVE_SERVICES
 *     (scripts/verify-catalog-crosscheck.mjs) -- the SAME roster + gate validate:extension
 *     runs -> 0 failures over the full NON-EMPTY roster (so it cannot pass vacuously).
 *   - the REAL committed service-denylist classify() (await Denylist.load(), NOT a stub).
 *
 * The gates are ESM (.mjs); this test is CJS, so they are loaded via a dynamic
 * await import() inside the async IIFE (the tests/payment-op-guard.test.js convention).
 * classify() reads the committed roster on the SAME module instance the gates consult,
 * so awaiting load() here populates it for the gates too (the live-roster pattern).
 *
 * Zero-framework FSB node test: a check(cond,msg) counter, PASS=/FAIL= summary,
 * process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/full-corpus-screen.test.js
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const ROOT = path.resolve(__dirname, '..');
const CLASSIFY_GATE_PATH = path.join(ROOT, 'scripts', 'verify-classification-gate.mjs');
const CROSSCHECK_PATH = path.join(ROOT, 'scripts', 'verify-catalog-crosscheck.mjs');
const IMPORTER_PATH = path.join(ROOT, 'scripts', 'import-opentabs-catalog.mjs');
const DENYLIST_MODULE = path.join(ROOT, 'extension', 'utils', 'service-denylist.js');

// Map a bare service host -> the origin the importer/gate use ('https://<service>').
function originFromService(service) {
  const s = String(service || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return 'https://' + s;
}

(async () => {
  console.log('--- BRDTH-02/03 full-corpus re-screening (classify-complete + commerce backstop) ---');

  // Populate classify() from the committed roster (the SAME module instance the gates'
  // classifyGate/checkCommerceSensitiveClassified consult).
  const Denylist = require(DENYLIST_MODULE);
  await Denylist.load();
  check(Denylist.isLoaded() === true, 'service-denylist loaded (the REAL committed roster drives classify())');

  // Dynamic import of the ESM gates + the importer (this test is CJS).
  const classifyMod = await import(pathToFileURL(CLASSIFY_GATE_PATH).href);
  const crosscheck = await import(pathToFileURL(CROSSCHECK_PATH).href);
  const importer = await import(pathToFileURL(IMPORTER_PATH).href);
  check(typeof classifyMod.classifyGate === 'function',
    'verify-classification-gate.mjs exports classifyGate (the real gate, not re-implemented)');
  check(typeof crosscheck.checkCommerceSensitiveClassified === 'function' &&
        crosscheck.COMMERCE_SENSITIVE_SERVICES instanceof Set,
    'verify-catalog-crosscheck.mjs exports checkCommerceSensitiveClassified + COMMERCE_SENSITIVE_SERVICES (the Task-1 backstop)');
  check(typeof importer.enumerateBatchApps === 'function' && typeof importer.readPluginMeta === 'function',
    'import-opentabs-catalog.mjs exports enumerateBatchApps + readPluginMeta (enumerate origins the SAME way the importer gates them)');

  // ---- TEST 1: classifyGate over EVERY enumerated real-app origin = 0 failures ----
  // Derive each real-app origin EXACTLY as the importer does: enumerateBatchApps()
  // (skips fixtures + self-hosted empty-origin apps + existing-head services) -> for
  // each, readPluginMeta(app).service -> 'https://<service>'. This is the full origin
  // set the merge-time classifyGate gates at Plan 04 -- proven classify-complete FIRST.
  const apps = importer.enumerateBatchApps();
  check(Array.isArray(apps) && apps.length >= 100,
    'TEST 1: enumerateBatchApps() yields the full real-app set (>= 100 apps; got ' + (apps ? apps.length : 'n/a') + ')');

  const items = [];
  const seenOrigins = new Set();
  for (const app of apps) {
    let service = '';
    try { service = importer.readPluginMeta(app).service; } catch (_e) { service = ''; }
    const origin = originFromService(service);
    if (!origin) continue;
    items.push({ origin, service, slug: app, description: 'OpenTabs plugin for ' + app });
    seenOrigins.add(origin);
  }
  check(items.length >= 100,
    'TEST 1: derived an origin for the full corpus (>= 100 origin-items; got ' + items.length + ')');

  const screen = classifyMod.classifyGate(items);
  check(screen && Array.isArray(screen.failures) && screen.failures.length === 0,
    'TEST 1: classifyGate over the FULL enumerated ~114-origin corpus yields 0 failures (fail-closed satisfied corpus-wide -- no unclassified sensitive origin)');
  if (screen && screen.failures && screen.failures.length > 0) {
    for (const f of screen.failures.slice(0, 8)) console.error('     UNCLASSIFIED:', f.slice(0, 120));
  }

  // The corpus genuinely INCLUDES the linkedin + youtube origins (so TEST 1 is not
  // trivially passing on an enumeration that skipped them).
  check(seenOrigins.has('https://linkedin.com'),
    'TEST 1: the enumerated corpus includes linkedin.com (the emitted apex, the social-axis classifyGate failure now governed)');
  check(seenOrigins.has('https://youtube.com'),
    'TEST 1: the enumerated corpus includes youtube.com (the emitted apex, the media-axis classifyGate failure now governed)');

  // ---- TEST 2: linkedin + youtube governed as sensitive (the 2 surfaced origins) --
  check(Denylist.classify('https://linkedin.com').sensitive === true,
    'TEST 2: classify(https://linkedin.com).sensitive === true (the social-axis origin governed)');
  check(Denylist.classify('https://youtube.com').sensitive === true &&
        Denylist.classify('https://youtube.com').denied === false,
    'TEST 2: classify(https://youtube.com) -> { sensitive:true, denied:false } (the media-axis origin governed without hard block)');

  // ---- TEST 3: a representative commerce/payment/travel brand set classifies sensitive --
  // The curated set + the spike-named NET-NEW homedepot/priceline/redfin/starbucks/
  // pandaexpress -- each at its EMITTED service host -- classifies sensitive (the
  // conservative posture holds corpus-wide).
  const commerceRepresentatives = [
    'doordash.com', 'www.amazon.com', 'booking.com', 'walmart.com', 'shopify.com',
    'homedepot.com', 'priceline.com', 'redfin.com', 'starbucks.com', 'pandaexpress.com',
  ];
  for (const host of commerceRepresentatives) {
    const c = Denylist.classify('https://' + host);
    check(!!(c && (c.sensitive === true || c.denied === true)),
      'TEST 3: ' + host + ' classifies sensitive/denied (conservative commerce posture)');
  }

  // ---- TEST 4: the backstop is GREEN over the FULL NON-EMPTY roster ---------------
  // checkCommerceSensitiveClassified over the FULL COMMERCE_SENSITIVE_SERVICES roster
  // (imported from the gate, the SAME roster validate:extension uses) returns 0
  // failures, and the roster is NON-EMPTY (>= the curated+net-new count) so the
  // assertion cannot pass vacuously on an empty roster.
  const rosterSize = crosscheck.COMMERCE_SENSITIVE_SERVICES.size;
  check(rosterSize >= 28,
    'TEST 4: COMMERCE_SENSITIVE_SERVICES is non-trivial (>= 28 brands; got ' + rosterSize + ') -- the backstop cannot pass vacuously');

  const backstop = crosscheck.checkCommerceSensitiveClassified(Denylist.classify);
  check(backstop && Array.isArray(backstop.failures) && backstop.failures.length === 0,
    'TEST 4: checkCommerceSensitiveClassified(classify) over the FULL roster yields 0 failures (the build-failing backstop is GREEN against the committed denylist)');
  if (backstop && backstop.failures && backstop.failures.length > 0) {
    for (const f of backstop.failures.slice(0, 8)) console.error('     ROSTER-GAP:', f.slice(0, 120));
  }

  // The backstop is NON-VACUOUS: it BITES when a commerce brand is downgraded to safe.
  // Drive it with a classify() that returns safe for a known roster brand -> > 0 failures.
  const downgradeClassify = (origin) => {
    if (typeof origin === 'string' && origin.indexOf('homedepot.com') !== -1) {
      return { sensitive: false, denied: false }; // simulate a dropped classification
    }
    return Denylist.classify(origin);
  };
  const biteCheck = crosscheck.checkCommerceSensitiveClassified(downgradeClassify);
  check(biteCheck && biteCheck.failures.length > 0 &&
        biteCheck.failures.some((f) => f.indexOf('homedepot.com') !== -1),
    'TEST 4: the backstop BITES -- a downgraded commerce brand (homedepot.com classifies safe) yields a failure naming it (the gate is non-vacuous)');

  // ---- TEST 5: a genuinely-non-commerce read origin is NOT over-restricted --------
  // datadog/airtable are dev/observability reads -- NOT forced sensitive (no false
  // over-restriction; the conservative posture targets commerce, not all reads).
  check(Denylist.classify('https://datadoghq.com').sensitive === false &&
        Denylist.classify('https://datadoghq.com').denied === false,
    'TEST 5: datadoghq.com is NOT sensitive (a genuinely-non-commerce read is not over-restricted)');
  check(Denylist.classify('https://airtable.com').sensitive === false &&
        Denylist.classify('https://airtable.com').denied === false,
    'TEST 5: airtable.com is NOT sensitive (a genuinely-non-commerce read is not over-restricted)');
  // zillow stays SAFE (it is in READ_ONLY_SAFE, distinct from redfin which is commerce).
  check(Denylist.classify('https://zillow.com').sensitive === false,
    'TEST 5: zillow.com stays SAFE (genuinely-read-only real-estate browse, in READ_ONLY_SAFE -- NOT on the commerce roster, distinct from redfin)');

  console.log('\nfull-corpus-screen: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: full-corpus-screen threw:', err && err.message ? err.message : err);
  process.exit(1);
});
