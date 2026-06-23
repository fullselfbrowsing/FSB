'use strict';

/**
 * Phase 31 plan 01 (v0.9.99 -- LEARN-03 / D-14) -- addLearnedRecipe RED contract.
 *
 * Wave 0 RED test: capability-search.js does NOT yet export addLearnedRecipe (Wave 5
 * adds it). The export-presence check FAILS LOUD today and the suite exits non-zero
 * (the RED). It turns GREEN only when Wave 5 ships addLearnedRecipe feeding the ONE
 * MiniSearch instance (RESEARCH Pitfall 5). NEVER silently passes.
 *
 * LEARN-03 / D-14 sampled behavior:
 *   - addLearnedRecipe(recipe, descriptor) makes the slug findable via search(query,
 *     origin) AND getRecipeBySlug(recipe.id) returns the recipe
 *   - the snapshot is re-persisted to fsbCapabilityIndex with a BUMPED catalogVersion
 *   - a simulated SW restart restores from the persisted snapshot via
 *     MiniSearch.loadJSON(snapshot, INDEX_OPTIONS) WITHOUT a "loadJSON should be
 *     given the same options" throw (Pitfall 5 -- the SAME INDEX_OPTIONS instance is
 *     mutated, not a fresh one), and the learned slug survives the restore
 *
 * Loader: UMD require -> the MiniSearch constructor planted on global.MiniSearch
 * (capability-search-eval.test.js:43-44) + global.FsbRecipeIndex seed + the storage
 * stub (so buildOrRestore + the snapshot re-persist run under Node).
 *
 * Zero-framework: passed/failed + check(cond,msg) + process.exit(failed>0?1:0).
 *
 * Run: node tests/learned-search-add.test.js
 */

const path = require('path');
const { installChromeStorageStub } = require('./_helpers/cdp-event-driver');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const REPO_ROOT = path.resolve(__dirname, '..');
const MINISEARCH_PATH = path.join(REPO_ROOT, 'extension', 'lib', 'minisearch.min.js');
const SEARCH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-search.js');
const STORAGE_KEY = 'fsbCapabilityIndex';

// A small generic seed so the base index exists before the learned add.
const SEED_DESCRIPTORS = [
  { slug: 'github.notifications', service: 'github.com', intentSynonyms: ['check github'], description: 'github notifications', actionVerb: 'list', sideEffectClass: 'read' }
];
const SEED_RECIPES = [
  { schemaVersion: 1, id: 'github.notifications', origin: 'https://github.com', endpoint: '/notifications', method: 'GET', authStrategy: 'same-origin-cookie', extract: '@' }
];

const LEARNED_ORIGIN = 'https://shop.example.com';
const LEARNED_RECIPE = {
  schemaVersion: 1, id: 'shop.cart', origin: LEARNED_ORIGIN, endpoint: '/api/cart',
  method: 'GET', authStrategy: 'same-origin-cookie', extract: '@'
};
const LEARNED_DESC = {
  slug: 'shop.cart', service: 'shop.example.com',
  intentSynonyms: ['show my shopping cart', 'view cart contents'],
  description: 'View your shopping cart', actionVerb: 'list', sideEffectClass: 'read'
};

(async () => {
  console.log('--- LEARN-03/D-14 addLearnedRecipe search wiring (RED until Wave 5) ---');

  // Plant the MiniSearch constructor + the catalog seed + the storage stub.
  const MiniSearch = require(MINISEARCH_PATH);
  global.MiniSearch = MiniSearch;
  global.FsbRecipeIndex = { descriptors: SEED_DESCRIPTORS, recipes: SEED_RECIPES };
  const store = installChromeStorageStub();

  const Search = require(SEARCH_PATH);
  check(typeof Search.buildOrRestore === 'function', 'capability-search exports buildOrRestore');
  check(typeof Search.addLearnedRecipe === 'function', 'capability-search exports addLearnedRecipe (RED until Wave 5)');
  check(Search.INDEX_OPTIONS && typeof Search.INDEX_OPTIONS === 'object', 'capability-search exports INDEX_OPTIONS');

  // Build the base index (restores or rebuilds + snapshots).
  await Search.buildOrRestore();

  // capture the base catalogVersion from the persisted snapshot
  const baseSnap = store.get(STORAGE_KEY);
  const baseVersion = baseSnap && baseSnap.catalogVersion;
  check(typeof baseVersion !== 'undefined', 'base snapshot persisted with a catalogVersion');

  // ---- add the learned recipe ----
  await Search.addLearnedRecipe(LEARNED_RECIPE, LEARNED_DESC);

  // findable via search() (origin-biased) AND getRecipeBySlug
  const hits = Search.search('shopping cart', LEARNED_ORIGIN, 5);
  check(Array.isArray(hits) && hits.some(function (h) { return h.slug === 'shop.cart'; }),
    'the learned slug is findable via search(query, origin) (LEARN-03)');
  const bySlug = Search.getRecipeBySlug('shop.cart');
  check(bySlug && bySlug.id === 'shop.cart', 'getRecipeBySlug(learned) returns the learned recipe (D-14)');

  // ---- snapshot re-persisted with a BUMPED catalogVersion ----
  const newSnap = store.get(STORAGE_KEY);
  check(newSnap && newSnap.index, 'the snapshot is re-persisted after addLearnedRecipe');
  check(newSnap && newSnap.catalogVersion !== baseVersion,
    'addLearnedRecipe BUMPS the catalogVersion (so an SW restart rebuilds WITH the learned entry, D-14)');

  // ---- the persisted snapshot survives loadJSON(snapshot, INDEX_OPTIONS) (Pitfall 5) ----
  let restored = null;
  let threw = null;
  try {
    restored = MiniSearch.loadJSON(JSON.stringify(newSnap.index), Search.INDEX_OPTIONS);
  } catch (e) {
    threw = e;
  }
  check(threw === null, 'loadJSON(snapshot, INDEX_OPTIONS) does NOT throw "same options" (the SAME INDEX_OPTIONS mutated, Pitfall 5)');
  check(restored !== null, 'the persisted snapshot restores into a MiniSearch index');
  if (restored) {
    const restoredHits = restored.search('shopping cart', { prefix: true, fuzzy: 0.2 });
    check(Array.isArray(restoredHits) && restoredHits.some(function (h) { return h.slug === 'shop.cart' || h.id === 'shop.cart'; }),
      'the learned slug survives an SW-restart restore (it was in the bumped snapshot)');
  }

  // ---- HI-01 REGRESSION: drive the REAL buildOrRestore() across an SW restart ----
  //
  // The loadJSON checks above prove the snapshot CONTAINS the learned slug, but they
  // bypass buildOrRestore()'s version-equality gate -- the exact path the HIGH bug
  // lived in (the '+learnedN' suffix made the gate reject the snapshot and rebuild
  // from the base catalog, dropping every learned slug). Simulate a genuine SW
  // restart: confirm the learned slug is findable BEFORE, drop the module from the
  // require cache (resets the module-level _ms / _learnedAddSeq to a fresh worker)
  // while KEEPING the same backing storage Map, re-require, run the real
  // buildOrRestore(), and assert search() STILL finds the learned slug afterwards.
  const beforeRestart = Search.search('shopping cart', LEARNED_ORIGIN, 5);
  check(Array.isArray(beforeRestart) && beforeRestart.some(function (h) { return h.slug === 'shop.cart'; }),
    'learned slug findable BEFORE the restart (sanity for the regression)');

  // Simulated restart: a fresh module instance, the SAME persisted storage + catalog.
  delete require.cache[require.resolve(SEARCH_PATH)];
  const SearchRestarted = require(SEARCH_PATH);
  const restoredOk = await SearchRestarted.buildOrRestore();
  check(restoredOk === true, 'buildOrRestore() returns true after the restart (restored, not rebuilt-from-empty)');

  const afterSnap = store.get(STORAGE_KEY);
  check(afterSnap && String(afterSnap.catalogVersion).indexOf('+learned') !== -1,
    'the snapshot is NOT overwritten back to a base-only version on restore (the learned suffix survives)');

  const afterRestart = SearchRestarted.search('shopping cart', LEARNED_ORIGIN, 5);
  const afterSlugs = Array.isArray(afterRestart) ? afterRestart.map(function (h) { return h.slug; }) : [];
  check(afterSlugs.indexOf('shop.cart') !== -1,
    'LEARN-03/D-14: the learned slug is STILL findable AFTER a real buildOrRestore() restart (was [] before the fix)');
  // NOTE: getRecipeBySlug(learned) is intentionally NOT asserted post-restart -- the
  // search module's _slugToRecipe is rebuilt from the BASE catalog on restart; learned
  // recipe RESOLUTION runs through FsbLearnedRecipeStore.getLearnedSync (hydrated by
  // hydrateSyncCache), not this module's map. The search-index snapshot only owns
  // DISCOVERY (search()), which is exactly the LEARN-03 surface the HIGH bug broke.

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('learned-search-add.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
