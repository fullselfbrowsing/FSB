'use strict';

/**
 * Phase 31 plan 01 (v0.9.99 -- D-13 / D-16) -- learned-recipe-store RED contract.
 *
 * Wave 0 RED test: extension/utils/learned-recipe-store.js does NOT exist yet
 * (Wave 3). The require() at load throws MODULE_NOT_FOUND and exits non-zero (the
 * RED). It turns GREEN only when Wave 3 ships the per-origin versioned store. NEVER
 * silently passes.
 *
 * D-13 / D-16 sampled behavior:
 *   - per-origin round-trip: promote(originA, recipeA, descA) then
 *     getLearned(recipeA.id, originA) returns the recipe; getLearned(recipeA.id,
 *     originB) returns null (origin-scoped, Pitfall 6)
 *   - the stored envelope is a versioned
 *     { v, recipes:{[origin]:{[slug]:{recipe,descriptor,...,quarantined}}} } shape
 *   - LRU: past the per-origin cap, promoting evicts the entry with the OLDEST
 *     lastSuccessAt
 *   - quarantine(slug, origin) sets quarantined:true (does NOT delete the key) and
 *     getLearned then returns null for that entry (demoted from routing)
 *
 * Stub: installChromeStorageStub (the storage the store reads/writes).
 *
 * Zero-framework: passed/failed + check(cond,msg) + process.exit(failed>0?1:0).
 *
 * Run: node tests/learned-recipe-store.test.js
 */

const path = require('path');
const { installChromeStorageStub } = require('./_helpers/cdp-event-driver');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const STORE_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'learned-recipe-store.js');

const ORIGIN_A = 'https://a.example.com';
const ORIGIN_B = 'https://b.example.com';

function mkRecipe(id, origin, endpoint) {
  return {
    schemaVersion: 1,
    id: id,
    origin: origin,
    endpoint: endpoint || '/api/' + id,
    method: 'GET',
    authStrategy: 'same-origin-cookie',
    extract: '@'
  };
}
function mkDesc(slug, service) {
  return { slug: slug, service: service, intentSynonyms: ['do ' + slug], description: slug, actionVerb: 'list', sideEffectClass: 'read' };
}

(async () => {
  console.log('--- D-13/D-16 learned-recipe-store (RED until Wave 3) ---');

  const store = installChromeStorageStub();

  // require AT TOP LEVEL -- a MISSING module throws here (the loud RED).
  const Learned = require(STORE_PATH);
  check(typeof Learned === 'object' && Learned, 'learned-recipe-store module loads (require)');
  check(typeof Learned.promote === 'function', 'exports promote');
  check(typeof Learned.getLearned === 'function', 'exports getLearned');
  check(typeof Learned.quarantine === 'function', 'exports quarantine');
  check(typeof Learned.readAll === 'function', 'exports readAll');

  // ---- per-origin round-trip (D-13) ----
  const recipeA = mkRecipe('items', ORIGIN_A, '/api/items/{id}');
  const descA = mkDesc('items', 'a.example.com');
  await Learned.promote(ORIGIN_A, recipeA, descA);

  const gotA = await Learned.getLearned(recipeA.id, ORIGIN_A);
  check(gotA && gotA.recipe && gotA.recipe.id === 'items', 'promote then getLearned(slug, originA) returns the recipe (round-trip)');
  check(gotA && gotA.descriptor && gotA.descriptor.slug === 'items', 'getLearned returns the paired descriptor');

  const gotB = await Learned.getLearned(recipeA.id, ORIGIN_B);
  check(gotB === null, 'getLearned(slug, originB) returns null (origin-scoped, Pitfall 6)');

  // ---- the persisted versioned envelope shape ----
  const env = await Learned.readAll();
  check(env && typeof env.v !== 'undefined', 'readAll() envelope carries a version field (v)');
  check(env && env.recipes && typeof env.recipes === 'object', 'envelope has a recipes map');
  check(env && env.recipes && env.recipes[ORIGIN_A] && env.recipes[ORIGIN_A]['items'],
    'envelope is keyed recipes[origin][slug] (D-13)');
  const slot = env && env.recipes && env.recipes[ORIGIN_A] && env.recipes[ORIGIN_A]['items'];
  check(slot && slot.recipe && slot.descriptor !== undefined, 'the slot carries {recipe, descriptor}');
  check(slot && typeof slot.lastSuccessAt !== 'undefined', 'the slot carries lastSuccessAt (the LRU key, D-16)');
  check(slot && slot.quarantined !== true, 'a freshly promoted slot is NOT quarantined');

  // the raw persisted key exists in storage (survives SW restart)
  const persistedKeys = Array.from(store.keys());
  check(persistedKeys.some(function (k) { return /learned/i.test(k) || /Learned/.test(k); }),
    'the store persists a chrome.storage.local key (SW-restart survival)');

  // ---- LRU eviction by oldest lastSuccessAt past the per-origin cap (D-16) ----
  check(typeof Learned.PER_ORIGIN_CAP === 'number' && Learned.PER_ORIGIN_CAP > 0,
    'exports a numeric PER_ORIGIN_CAP (the LRU bound)');
  const CAP = Learned.PER_ORIGIN_CAP || 24;
  // Promote CAP entries with strictly increasing lastSuccessAt; entry "lru-0" is the
  // OLDEST. Then promote ONE more -> "lru-0" must be evicted.
  for (let i = 0; i < CAP; i++) {
    const r = mkRecipe('lru-' + i, ORIGIN_A, '/api/lru/' + i);
    await Learned.promote(ORIGIN_A, r, mkDesc('lru-' + i, 'a.example.com'), { lastSuccessAt: 1000 + i });
  }
  // one over the cap, the newest
  const overflow = mkRecipe('lru-overflow', ORIGIN_A, '/api/lru/overflow');
  await Learned.promote(ORIGIN_A, overflow, mkDesc('lru-overflow', 'a.example.com'), { lastSuccessAt: 99999 });

  const evicted = await Learned.getLearned('lru-0', ORIGIN_A);
  check(evicted === null, 'past the per-origin cap, the OLDEST lastSuccessAt entry (lru-0) is EVICTED (LRU, D-16)');
  const kept = await Learned.getLearned('lru-overflow', ORIGIN_A);
  check(kept && kept.recipe, 'the newest entry (lru-overflow) is retained after eviction');

  // ---- quarantine flags (does NOT delete) + demotes from getLearned (D-16) ----
  await Learned.promote(ORIGIN_B, mkRecipe('q', ORIGIN_B, '/api/q'), mkDesc('q', 'b.example.com'), { lastSuccessAt: 5 });
  check((await Learned.getLearned('q', ORIGIN_B)) !== null, 'precondition: q is routable before quarantine');
  await Learned.quarantine('q', ORIGIN_B);

  const afterQ = await Learned.getLearned('q', ORIGIN_B);
  check(afterQ === null, 'getLearned returns null for a quarantined entry (demoted from routing, D-16)');

  const envQ = await Learned.readAll();
  const qSlot = envQ && envQ.recipes && envQ.recipes[ORIGIN_B] && envQ.recipes[ORIGIN_B]['q'];
  check(qSlot && qSlot.quarantined === true, 'quarantine sets quarantined:true on the slot (NOT deleted -- kept for Phase-32, D-16)');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('learned-recipe-store.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
