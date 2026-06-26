'use strict';

/**
 * Phase 43 Plan 01 (v1.0.0 Catalog-Scale + Milestone Gate, SCALE-02) --
 * app-degraded-surfacing RED-first contract for the app-level degraded/needs-re-port
 * status accessor.
 *
 * WAVE 0: this file is authored BEFORE the degraded accessor exists (Plan 43-03 adds
 * getOriginHealth(origin) to learned-recipe-store.js). A clean RED here is the
 * CORRECT and EXPECTED Wave 0 state: the additive method is absent, so the guard
 * below reports a single deterministic non-crash failure (process exits 1). The full
 * assertion body is the SCALE-02 degraded-surfacing contract the store addition must
 * satisfy once it lands; every check() runs GREEN in Plan 43-03 with zero edits here.
 *
 * The surfacing is an ADDITIVE status accessor: when an origin's learned-recipe set
 * is stale/quarantined, a query reports the origin as degraded/needs-re-port instead
 * of silently failing -- so a user/agent SEES "this app needs re-learning" rather
 * than a silent miss.
 *
 * Proves (RED now, GREEN in Plan 43-03):
 *
 *   - HEALTHY: an origin with at least one live, non-quarantined learned recipe
 *     reports healthy ({ degraded:false, status:'ok', origin }).
 *   - DEGRADED: an origin whose learned recipes are ALL quarantined reports
 *     degraded ({ degraded:true, status:'needs-re-port', origin }) with the origin
 *     identified.
 *   - VISIBLE-NOT-SILENT: the degraded state is RETRIEVABLE (the accessor returns it
 *     truthfully) so a user/agent SEES the needs-re-learning state -- not a silent
 *     failure.
 *   - UNKNOWN-ORIGIN SAFE: an unknown / un-hydrated origin returns a defined
 *     healthy-ish default (degraded:false) and NEVER throws.
 *   - ADDITIVE / NON-BREAKING: the existing getLearnedSync / quarantine / promote
 *     shapes are UNCHANGED (the surfacing is a NEW accessor, never a breaking change
 *     to the store contract).
 *
 * The store seam this file pins (Plan 43-03 publishes this ADDITIVE export on
 * FsbLearnedRecipeStore alongside the UNCHANGED envelope/cap/LRU/quarantine):
 *   - getOriginHealth(origin) -> { degraded:boolean, status:string, origin:string }
 *     reading the SYNCHRONOUS _syncMirror (the same source getLearnedSync uses).
 *
 * This suite drives a chrome.storage.local STUB (the learned-recipe-store.test.js
 * idiom) so promote()/quarantine() populate the sync mirror getOriginHealth reads.
 *
 * Zero-framework FSB convention (tests/learned-recipe-store.test.js): module-level
 * passed/failed counters, synchronous check(cond,msg), ASCII-only, NO emojis,
 * process.exit(failed>0?1:0).
 *
 * Run: node tests/app-degraded-surfacing.test.js
 */

const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const STORE_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'learned-recipe-store.js');

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

// ---- chrome.storage.local stub (the learned-recipe-store.test.js idiom) so
//      promote/quarantine persist + the sync mirror stays in lock-step. Planted
//      on globalThis BEFORE the store is required.
const _store = {};
globalThis.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        const out = {};
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) { if (Object.prototype.hasOwnProperty.call(_store, k)) { out[k] = _store[k]; } }
        cb(out);
      },
      set(obj, cb) { Object.assign(_store, obj); if (cb) cb(); },
      remove(key, cb) { delete _store[key]; if (cb) cb(); }
    }
  }
};

// ---- Require the store under test. The ABSENT getOriginHealth export is the CLEAN
//      Wave 0 RED (the module loads, but the degraded accessor does not exist yet).
let STORE = null;
let storeLoadError = null;
try {
  STORE = require(STORE_PATH);
} catch (err) {
  storeLoadError = err;
}

if (!STORE || typeof STORE.getOriginHealth !== 'function') {
  // Wave 0 RED: the additive degraded accessor does not exist yet (Plan 43-03).
  // Report a single deterministic failure and exit non-zero WITHOUT crashing.
  const why = storeLoadError && storeLoadError.code === 'MODULE_NOT_FOUND'
    ? 'learned-recipe-store.js not found'
    : 'learned-recipe-store.js does not yet export getOriginHealth() (expected Wave 0 RED; Plan 43-03 adds the additive degraded/needs-re-port accessor)';
  check(false, 'SCALE-02 degraded-surfacing: ' + why);
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
}

const getOriginHealth = STORE.getOriginHealth;

// Build a minimal learned recipe whose origin matches (HARD origin scope: the store
// surfaces a recipe only when entry.recipe.origin === origin).
function recipeFor(origin, id) {
  return {
    schemaVersion: 2,
    id: id,
    origin: origin,
    endpoint: '/api/x',
    method: 'GET',
    authStrategy: 'same-origin-cookie',
    extract: '@'
  };
}

(async function run() {
  if (typeof STORE._reset === 'function') { await STORE._reset(); }

  // ===========================================================================
  // (A) HEALTHY: an origin with a live, non-quarantined learned recipe is healthy.
  // ===========================================================================
  console.log('\n--- (A) healthy: a live, non-quarantined origin reports healthy ---');

  const liveOrigin = 'https://todoist.com';
  await STORE.promote(liveOrigin, recipeFor(liveOrigin, 'todoist.create_task'), { slug: 'todoist.create_task' });

  // Sanity: the live recipe IS surfaced by the unchanged getLearnedSync.
  const liveSync = STORE.getLearnedSync('todoist.create_task', liveOrigin);
  check(liveSync && liveSync.recipe && liveSync.recipe.origin === liveOrigin,
    'precondition: the promoted recipe is live via the UNCHANGED getLearnedSync (origin-scoped)');

  const healthLive = getOriginHealth(liveOrigin);
  check(healthLive && healthLive.degraded === false,
    'HEALTHY: an origin with a live, non-quarantined learned recipe reports degraded:false');
  check(healthLive && (healthLive.status === 'ok' || healthLive.status === 'healthy'),
    "HEALTHY: the status field reads 'ok' (healthy) for a live origin (got " + (healthLive && healthLive.status) + ')');
  check(healthLive && healthLive.origin === liveOrigin,
    'HEALTHY: the health record identifies the origin (got ' + (healthLive && healthLive.origin) + ')');

  // ===========================================================================
  // (B) DEGRADED: an origin whose learned recipes are ALL quarantined is degraded.
  // ===========================================================================
  console.log('\n--- (B) degraded: an origin whose recipes are ALL quarantined reports needs-re-port ---');

  const staleOrigin = 'https://bsky.app';
  await STORE.promote(staleOrigin, recipeFor(staleOrigin, 'bsky.create_post'), { slug: 'bsky.create_post' });
  await STORE.promote(staleOrigin, recipeFor(staleOrigin, 'bsky.delete_post'), { slug: 'bsky.delete_post' });
  // Quarantine ALL of the origin's learned recipes (the site changed -> all rotted).
  await STORE.quarantine('bsky.create_post', staleOrigin);
  await STORE.quarantine('bsky.delete_post', staleOrigin);

  // Sanity: the UNCHANGED getLearnedSync now returns null for the quarantined slugs
  // (silent failure -- exactly what the degraded surfacing makes visible).
  check(STORE.getLearnedSync('bsky.create_post', staleOrigin) === null,
    'precondition: a quarantined recipe returns null from the UNCHANGED getLearnedSync (the silent failure the surfacing exposes)');

  const healthStale = getOriginHealth(staleOrigin);
  check(healthStale && healthStale.degraded === true,
    'DEGRADED: an origin whose learned recipes are ALL quarantined reports degraded:true (not silent failure)');
  check(healthStale && healthStale.status === 'needs-re-port',
    "DEGRADED: the status field reads 'needs-re-port' for a fully-quarantined origin (got " + (healthStale && healthStale.status) + ')');
  check(healthStale && healthStale.origin === staleOrigin,
    'DEGRADED: the degraded record identifies the origin so a user/agent knows WHICH app needs re-learning (got ' + (healthStale && healthStale.origin) + ')');

  // ===========================================================================
  // (C) VISIBLE-NOT-SILENT: the degraded state is retrievable + truthful.
  // ===========================================================================
  console.log('\n--- (C) visible-not-silent: the degraded state is retrievable + truthful ---');

  // The accessor distinguishes the two origins truthfully (live vs degraded) -- the
  // whole point of surfacing: the agent can SEE which app needs re-learning.
  check(getOriginHealth(liveOrigin).degraded === false && getOriginHealth(staleOrigin).degraded === true,
    'VISIBLE-NOT-SILENT: the accessor truthfully distinguishes a live origin (degraded:false) from a degraded one (degraded:true) -- the needs-re-learning state is visible, not a silent miss');

  // ===========================================================================
  // (D) UNKNOWN-ORIGIN SAFE: an unknown / un-hydrated origin is a defined default.
  // ===========================================================================
  console.log('\n--- (D) unknown-origin safe: an un-hydrated origin returns a defined healthy default, never throws ---');

  let threw = false;
  let unknownHealth = null;
  try {
    unknownHealth = getOriginHealth('https://never-seen.example');
  } catch (_e) {
    threw = true;
  }
  check(!threw,
    'UNKNOWN-ORIGIN SAFE: getOriginHealth on an unknown origin does NOT throw');
  check(unknownHealth && unknownHealth.degraded === false,
    'UNKNOWN-ORIGIN SAFE: an unknown / un-hydrated origin returns a defined healthy-ish default (degraded:false) -- absence is not failure');
  // A non-string arg degrades safely too.
  let threwBad = false;
  try { getOriginHealth(null); } catch (_e) { threwBad = true; }
  check(!threwBad,
    'UNKNOWN-ORIGIN SAFE: a non-string origin arg degrades safely (no throw)');

  // ===========================================================================
  // (E) ADDITIVE / NON-BREAKING: the existing store shapes are UNCHANGED.
  // ===========================================================================
  console.log('\n--- (E) additive / non-breaking: getLearnedSync / quarantine / promote shapes UNCHANGED ---');

  check(typeof STORE.getLearnedSync === 'function'
    && typeof STORE.quarantine === 'function'
    && typeof STORE.promote === 'function'
    && typeof STORE._reset === 'function',
    'ADDITIVE: getLearnedSync / quarantine / promote / _reset remain exported with their existing shapes (getOriginHealth is a NEW accessor, not a breaking change)');

  // getLearnedSync still returns the SAME { recipe, descriptor } shape for a live op
  // after the additive accessor exists (no contract drift).
  const liveAgain = STORE.getLearnedSync('todoist.create_task', liveOrigin);
  check(liveAgain && Object.prototype.hasOwnProperty.call(liveAgain, 'recipe')
    && Object.prototype.hasOwnProperty.call(liveAgain, 'descriptor'),
    'ADDITIVE: getLearnedSync still returns the unchanged { recipe, descriptor } shape (the surfacing did not alter the existing read contract)');

  console.log('\napp-degraded-surfacing: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (e) {
  console.error('  FAIL: app-degraded-surfacing harness threw:', e && e.message ? e.message : e);
  console.log('  passed:', passed);
  console.log('  failed:', failed + 1);
  process.exit(1);
});
