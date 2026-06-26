'use strict';

/**
 * Phase 43 (v1.0.0 Catalog-Scale + Milestone Gate, SCALE-02) -- HI-01 LIVE-PATH
 * wiring proof for the per-origin re-learn scheduler + recurrence counter.
 *
 * The 43-REVIEW HI-01 gap this closes: relearn-scheduler.js + the learned-store
 * recordRot/getOriginHealth were unit-proven IN ISOLATION but NOT wired into the
 * live rot path. capability-router.js _quarantineAndRelearn fired
 * discovery.runDiscovery(origin, { tabId }) FIRE-AND-FORGET on EVERY broken verdict
 * -- so the per-origin coalescing (thundering-herd prevention) and the recurrence
 * counter NEVER ran in production. This test drives the REAL router on a REAL broken
 * (404) verdict and proves the re-learn now flows THROUGH the scheduler:
 *
 *   - COALESCING (N->1) ON THE LIVE PATH: N broken verdicts for ONE origin (N
 *     ROUTER.invoke calls that each rot) schedule the re-learn through
 *     FsbRelearnScheduler; flushing the coalescing window fires the consent-gated
 *     runDiscovery EXACTLY ONCE -- not N concurrent CDP attaches. (The isolated
 *     relearn-coalescing.test.js proves the scheduler module; THIS proves the
 *     router actually routes through it.)
 *   - RECURRENCE ON THE LIVE PATH: each broken verdict calls
 *     FsbLearnedRecipeStore.recordRot(origin, slug) so the recurrence counter
 *     ACCUMULATES in production -- dispositionFor crosses 'systemic' after the
 *     threshold (the systemic-vs-transient classification is no longer inert).
 *   - DEGRADED SURFACING REFLECTS THE QUARANTINE: after a broken T2 learned verdict
 *     quarantines the only learned recipe for an origin, getOriginHealth(origin)
 *     reports degraded:true / needs-re-port (the stale app is VISIBLE, not a silent
 *     miss).
 *   - CONSENT-PRESERVED: the scheduler INVOKES the supplied consent-gated
 *     runDiscovery (bound to the origin); it never re-implements capture/consent.
 *
 * SABOTAGE-RED (non-vacuous): if _quarantineAndRelearn is reverted to the direct
 * fire-and-forget runDiscovery, the COALESCING assertion reds (N runDiscovery calls,
 * not 1); if the recordRot call is removed, the recurrence assertion reds (count 0).
 *
 * Zero-framework FSB convention (tests/capability-router.test.js): module-level
 * passed/failed counters, synchronous check(cond,msg), ASCII-only, NO emojis,
 * process.exit(failed>0?1:0). The async assertion body runs inside an async IIFE.
 *
 * Run: node tests/relearn-router-wiring.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.join(__dirname, '..');
const ROUTER_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-router.js');
const SCHEDULER_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'relearn-scheduler.js');
const STORE_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'learned-recipe-store.js');
const ROT_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-rot-detector.js');
const CFWORKER_PATH = path.join(REPO_ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js');
const JMESPATH_PATH = path.join(REPO_ROOT, 'extension', 'lib', 'jmespath.min.js');
const SCHEMA_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-recipe-schema.js');
const AUTH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-auth-strategies.js');
const INTERP_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-interpreter.js');
const FETCH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-fetch.js');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

// ---- Load the real interpreter + collaborators so the router's lifted T1b body
//      (interpretRecipe -> executeBoundSpec) runs and the REAL rot detector fires.
vm.runInThisContext(fs.readFileSync(CFWORKER_PATH, 'utf8'));
globalThis.jmespath = require(JMESPATH_PATH);
require(SCHEMA_PATH);
require(AUTH_PATH);
globalThis.FsbCapabilityInterpreter = require(INTERP_PATH);

// The REAL self-heal collaborators (published on the SW globals the router reads).
const STORE = require(STORE_PATH);
const SCHEDULER = require(SCHEDULER_PATH);
globalThis.FsbLearnedRecipeStore = STORE;        // _learnedStore() reads this global
globalThis.FsbCapabilityRotDetector = require(ROT_PATH); // _rotDetector() reads this global

const ROUTER = require(ROUTER_PATH);

if (!ROUTER || typeof ROUTER.invoke !== 'function') {
  check(false, 'SCALE-02 router wiring: capability-router.js did not export invoke()');
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
}

// In-memory catalog stub mirroring capability-router.test.js installCatalog.
function installCatalog(entriesBySlug) {
  globalThis.FsbCapabilityCatalog = {
    resolve: function (slug) { return entriesBySlug[slug] || null; }
  };
}
function clearCatalog() { delete globalThis.FsbCapabilityCatalog; }

// A T1b recipe whose executeBoundSpec we force to a 404 (a real rot -> broken:true).
const ROT_RECIPE = {
  schemaVersion: 1,
  id: 'acme.notifications',
  origin: 'https://acme.example',
  endpoint: '/notifications',
  method: 'GET',
  authStrategy: 'same-origin-cookie',
  extract: '@'
};

(async function run() {
  console.log('--- SCALE-02 HI-01: the live broken-verdict path routes THROUGH the scheduler (coalesce N->1, record recurrence) ---');

  // Force every executeBoundSpec to a 404 so the REAL rot detector classifies broken.
  globalThis.FsbCapabilityFetch = {
    executeBoundSpec: async function () {
      return { success: true, status: 404, finalUrl: 'https://acme.example/notifications', redirected: false, data: null, text: 'gone' };
    }
  };

  // ===========================================================================
  // (A) COALESCING N->1 ON THE LIVE PATH: N broken T1b verdicts for ONE origin
  //     schedule the re-learn through FsbRelearnScheduler; flushing the window
  //     fires the consent-gated runDiscovery EXACTLY ONCE.
  // ===========================================================================
  if (typeof SCHEDULER._reset === 'function') { SCHEDULER._reset(); }
  if (typeof STORE._reset === 'function') { await STORE._reset(); }

  const runDiscoveryCalls = [];
  globalThis.FsbDiscoverySession = {
    runDiscovery: function (origin, opts) {
      runDiscoveryCalls.push({ origin: origin, opts: opts });
      return Promise.resolve({ ok: true });
    }
  };

  installCatalog({ 'acme.notifications': { tier: 'T1b', recipe: ROT_RECIPE } });

  const N = 5;
  for (let i = 0; i < N; i++) {
    const out = await ROUTER.invoke('acme.notifications', {}, { origin: 'https://acme.example', tabId: 7 });
    if (i === 0) {
      check(out && out.success === false && out.code === 'RECIPE_DOM_FALLBACK_PENDING',
        'LIVE PATH: a broken (404) T1b verdict returns dual-field RECIPE_DOM_FALLBACK_PENDING (the rot path fired)');
    }
  }

  // Before the window flushes, the re-learn has been SCHEDULED, not fired -- the
  // router routed it through the scheduler (a direct fire-and-forget would already
  // show N calls here).
  check(runDiscoveryCalls.length === 0,
    'COALESCING (live): ' + N + ' broken verdicts SCHEDULE the re-learn (0 runDiscovery calls before the window flushes -- routed through the scheduler, not fired synchronously; got ' + runDiscoveryCalls.length + ')');

  // Flush the coalescing window deterministically -> exactly ONE re-learn fires.
  await (typeof SCHEDULER.flush === 'function' ? SCHEDULER.flush('https://acme.example') : Promise.resolve());
  check(runDiscoveryCalls.length === 1,
    'COALESCING (live, N->1): ' + N + ' broken verdicts on ONE origin collapse to EXACTLY ONE consent-gated runDiscovery (no thundering-herd of CDP attaches; got ' + runDiscoveryCalls.length + ') -- a direct fire-and-forget would have fired ' + N);
  check(runDiscoveryCalls.length === 1 && runDiscoveryCalls[0].origin === 'https://acme.example',
    'CONSENT-PRESERVED (live): the single coalesced re-learn is the consent-gated runDiscovery bound to the broken origin (https://acme.example)');

  // ===========================================================================
  // (B) RECURRENCE ON THE LIVE PATH: each broken verdict called recordRot(origin,
  //     slug) so the recurrence counter accumulated and crossed 'systemic'.
  // ===========================================================================
  // The N broken T1b verdicts above all recorded against (origin, slug). The slug
  // the router records is the dispatched slug 'acme.notifications'.
  const disposition = (typeof STORE.dispositionFor === 'function')
    ? STORE.dispositionFor('https://acme.example', 'acme.notifications')
    : 'transient';
  check(disposition === 'systemic',
    'RECURRENCE (live): ' + N + ' broken verdicts recorded via recordRot accumulate to a SYSTEMIC disposition (the recurrence counter is no longer inert in production; got "' + disposition + '")');
  check(typeof STORE.recurrenceTrackedCount === 'function' && STORE.recurrenceTrackedCount() >= 1,
    'RECURRENCE (live): the recurrence store tracked the broken origin (recordRot ran on the rot path; got ' + STORE.recurrenceTrackedCount() + ' tracked)');

  clearCatalog();

  // ===========================================================================
  // (C) DEGRADED SURFACING reflects a SYSTEMIC learned origin on the LIVE path. A
  //     learned recipe that REPEATEDLY rots (recurrence crosses the systemic
  //     threshold via the live recordRot wiring) makes getOriginHealth report
  //     degraded:true / needs-re-port -- the stale app is VISIBLE, not a silent miss.
  //     (This exercises the recordRot -> dispositionFor 'systemic' -> getOriginHealth
  //     degraded chain end-to-end through the router, the SCALE-02 surfacing the
  //     deliverable promised; it is storage-independent so it runs in the Node
  //     harness where chrome.storage is absent.)
  // ===========================================================================
  if (typeof SCHEDULER._reset === 'function') { SCHEDULER._reset(); }
  if (typeof STORE._reset === 'function') { await STORE._reset(); }
  runDiscoveryCalls.length = 0;

  // Seed ONE learned recipe for the origin so getOriginHealth has a live learned slug
  // to read (it reads the synchronous mirror promote populates; recipe.id is the slug).
  const LEARN_ORIGIN = 'https://stale.example';
  const LEARN_SLUG = 'stale.notifications';
  const LEARNED_RECIPE = {
    schemaVersion: 1,
    id: LEARN_SLUG,
    origin: LEARN_ORIGIN,
    endpoint: '/n',
    method: 'GET',
    authStrategy: 'same-origin-cookie',
    extract: '@'
  };
  if (typeof STORE.promote === 'function') {
    await STORE.promote(LEARN_ORIGIN, LEARNED_RECIPE, { slug: LEARN_SLUG, origin: LEARN_ORIGIN });
  }

  // Healthy BEFORE the rot (a live, non-quarantined, non-systemic learned recipe).
  const healthBefore = (typeof STORE.getOriginHealth === 'function')
    ? STORE.getOriginHealth(LEARN_ORIGIN) : { degraded: false };
  check(healthBefore && healthBefore.degraded === false,
    'DEGRADED (live, pre-rot): an origin with a live learned recipe is healthy (degraded:false) before any rot');

  // Now rot the learned recipe REPEATEDLY on the live path. Each broken T2 verdict
  // calls recordRot(origin, slug) (the wiring proven above), accumulating the
  // recurrence count past the systemic threshold for this learned slug.
  installCatalog({ 'stale.notifications': { tier: 'T2', recipe: LEARNED_RECIPE } });
  const RECUR = 3; // >= RECURRENCE_SYSTEMIC_THRESHOLD
  for (let i = 0; i < RECUR; i++) {
    await ROUTER.invoke('stale.notifications', {}, { origin: LEARN_ORIGIN, tabId: 9 });
  }
  check(typeof STORE.dispositionFor === 'function'
    && STORE.dispositionFor(LEARN_ORIGIN, LEARN_SLUG) === 'systemic',
    'DEGRADED (live): ' + RECUR + ' broken verdicts on a learned slug cross the SYSTEMIC threshold via the live recordRot wiring');

  const healthAfter = (typeof STORE.getOriginHealth === 'function')
    ? STORE.getOriginHealth(LEARN_ORIGIN) : { degraded: false };
  check(healthAfter && healthAfter.degraded === true && healthAfter.status === 'needs-re-port',
    'DEGRADED (live, post-rot): after the learned recipe repeatedly rots to systemic, getOriginHealth reports degraded:true / needs-re-port (the stale app is VISIBLE, not a silent miss; got ' + JSON.stringify(healthAfter) + ')');

  clearCatalog();
  delete globalThis.FsbCapabilityFetch;
  delete globalThis.FsbDiscoverySession;
  if (typeof SCHEDULER._reset === 'function') { SCHEDULER._reset(); }
  if (typeof STORE._reset === 'function') { await STORE._reset(); }

  console.log('\nrelearn-router-wiring: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (err) {
  console.error('  FAIL: relearn-router-wiring harness threw:', err && err.message ? err.message : err);
  console.log('  passed:', passed);
  console.log('  failed:', failed + 1);
  process.exit(1);
});
