'use strict';

/**
 * Phase 28 plan 01 (v0.9.99 Native Capability Catalog) -- capability-search eval
 * harness + milestone gate. Proves SURF-04, SURF-06, and the search half of
 * SURF-01:
 *   - SURF-06 (the milestone gate, D-13): recall@5 >= 0.9 AND wrong-invoke == 0
 *     over the SEEDED near-neighbor fixture set. Zero-wrong-invoke is
 *     non-negotiable (a mis-invoke is a real authenticated side effect). The seed
 *     (catalog/descriptors/_fixtures/) carries near-neighbor send/post/message
 *     services + a read/mutate/destructive contrast so a naive single-field index
 *     FAILS this gate -- the tuned INDEX_OPTIONS + boosts are what pass it.
 *   - SURF-04 (round-trip): build -> toJSON() -> MiniSearch.loadJSON(json,
 *     INDEX_OPTIONS) reproduces identical top hits; loadJSON WITHOUT the options
 *     arg throws (the load-bearing minisearch contract, Pitfall 3).
 *   - SURF-01 (schema-on-hit + cap): every hit carries params, including
 *     descriptor-level params for handler-backed capabilities, plus sideEffectClass;
 *     no query returns more than 5 hits.
 *
 * Single source of truth: this test require()s INDEX_OPTIONS + buildIndex +
 * search from extension/utils/capability-search.js, so the harness uses the SAME
 * options as the runtime module -- this is what prevents a silent options-drift
 * failure mode (the test cannot pass with options the runtime does not use).
 *
 * MiniSearch is a UMD module: require() returns the constructor. It is set on the
 * global BEFORE requiring capability-search.js so the module's typeof-guarded
 * _getMiniSearch() finds it (the SW gets it from importScripts; the test plants
 * it on globalThis). FsbRecipeIndex is likewise planted from the seed so the
 * module's internal search() (which reads the build-time catalog) is exercisable.
 *
 * Zero-framework clone of tests/capability-interpreter.test.js (passed/failed
 * counters, synchronous check(cond,msg), process.exit(failed>0?1:0)).
 *
 * Run: node tests/capability-search-eval.test.js
 */

const assert = require('assert');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

// UMD require -> the MiniSearch constructor. Plant it on the global so the
// capability-search module's _getMiniSearch() accessor resolves it.
const MiniSearch = require(path.join(REPO_ROOT, 'extension', 'lib', 'minisearch.min.js'));
global.MiniSearch = MiniSearch;

const SEED_DESCRIPTORS = require(path.join(REPO_ROOT, 'catalog', 'descriptors', '_fixtures', 'seed-descriptors.json'));
const SEED_RECIPES = require(path.join(REPO_ROOT, 'catalog', 'descriptors', '_fixtures', 'seed-recipes.json'));
const FIXTURES = require(path.join(REPO_ROOT, 'catalog', 'descriptors', '_fixtures', 'intent-cases.json'));

// slug -> recipe map (keyed by recipe id == descriptor slug).
const slugToRecipe = {};
SEED_RECIPES.forEach((r) => { if (r && r.id) slugToRecipe[r.id] = r; });

// Plant the build-time catalog global from the seed so the module's internal
// search() (which reads FsbRecipeIndex via buildOrRestore) is exercisable.
global.FsbRecipeIndex = { descriptors: SEED_DESCRIPTORS, recipes: SEED_RECIPES };

// Single source of truth: the runtime module's options + helpers.
const CapabilitySearch = require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-search.js'));
const { INDEX_OPTIONS, buildIndex, search } = CapabilitySearch;

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

// ---- Build the index via the module's pure builder (the SAME INDEX_OPTIONS) ---
const ms = buildIndex(SEED_DESCRIPTORS, slugToRecipe);
check(!!ms, 'buildIndex returned a MiniSearch instance');
check(INDEX_OPTIONS && INDEX_OPTIONS.idField === 'slug', 'INDEX_OPTIONS imported from the runtime module (idField slug)');

// ---- SURF-06: recall@5 + wrong-invoke gate ---------------------------------
let hit = 0;
let wrongInvoke = 0;
const misses = [];
const wrongs = [];
for (const f of FIXTURES) {
  const hits = ms.search(f.intent, {
    combineWith: 'OR',
    prefix: true,
    fuzzy: 0.2,
    boost: { intentSynonyms: 3 }
  });
  const top5 = hits.slice(0, 5).map((h) => h.id);
  if (top5.includes(f.expectedSlug)) {
    hit++;
  } else {
    misses.push(`${f.intent} -> got [${top5.join(', ') || 'none'}] want ${f.expectedSlug}`);
  }
  if (hits[0] && hits[0].id !== f.expectedSlug) {
    wrongInvoke++;
    wrongs.push(`${f.intent} -> top1 ${hits[0].id} want ${f.expectedSlug}`);
  }
}
const recall = hit / FIXTURES.length;
const wrongRate = wrongInvoke / FIXTURES.length;

// The line the acceptance check greps for: contains "recall@5=" and "wrong-invoke=".
console.log(`  METRICS: recall@5=${recall.toFixed(3)} wrong-invoke=${wrongRate.toFixed(3)} over ${FIXTURES.length} fixtures`);
if (misses.length) {
  console.error('  recall misses:');
  misses.forEach((m) => console.error('    -', m));
}
if (wrongs.length) {
  console.error('  wrong-invoke cases:');
  wrongs.forEach((m) => console.error('    -', m));
}

check(recall >= 0.9, `recall@5 ${recall.toFixed(3)} >= 0.9 (SURF-06 / D-13)`);
check(wrongRate === 0, `wrong-invoke ${wrongRate.toFixed(3)} === 0 (non-negotiable, D-13)`);

// ---- CGEN-04: serialized-index-size + SW cold-start budget (smoke proof) ------
// Phase 36 Plan 04: add the MEASUREMENT MACHINERY before breadth lands (Phase 43
// re-runs the same gate at the full ~2,523-descriptor scale). The data-layout
// discipline this proves: params are NOT indexed/stored (schema-on-hit via the
// slug->descriptor map), so the serialized index stays small and loadJSON+first
// search stays fast. Serialize the SAME ms built above with INDEX_OPTIONS, then time
// MiniSearch.loadJSON(serialized, INDEX_OPTIONS) + a first search (the cold-start
// path: a freshly-woken SW restores the snapshot and answers one query). Generous
// smoke gates (< 50KB, < 10ms) -- the point is that the asserts exist + the layout
// holds, not a tight benchmark.
const { performance } = require('perf_hooks');
const smokeSerialized = JSON.stringify(ms.toJSON()); // toJSON() returns an object; loadJSON wants a JSON string
check(smokeSerialized.length < 50 * 1024,
  `smoke index serialized < 50KB (got ${(smokeSerialized.length / 1024).toFixed(1)}KB over ${SEED_DESCRIPTORS.length} descriptors)`);
const _t0 = performance.now();
const smokeRestored = MiniSearch.loadJSON(smokeSerialized, INDEX_OPTIONS); // SAME options -- mandatory
smokeRestored.search('create a task'); // first search on the cold-restored index
const smokeElapsedMs = performance.now() - _t0;
check(smokeElapsedMs < 10,
  `smoke loadJSON(serialized, INDEX_OPTIONS) + first search < 10ms (got ${smokeElapsedMs.toFixed(2)}ms)`);

// ---- SURF-04: toJSON -> loadJSON(json, INDEX_OPTIONS) round-trip -------------
const sampleQuery = 'message my team on slack';
const beforeHits = ms.search(sampleQuery).slice(0, 5).map((h) => h.id);
const serialized = JSON.stringify(ms.toJSON()); // toJSON() returns an object; loadJSON wants a JSON string
const restored = MiniSearch.loadJSON(serialized, INDEX_OPTIONS); // SAME options -- mandatory
const afterHits = restored.search(sampleQuery).slice(0, 5).map((h) => h.id);
check(
  JSON.stringify(beforeHits) === JSON.stringify(afterHits),
  'round-trip: loadJSON(json, INDEX_OPTIONS) reproduces identical top hits'
);

let loadJsonThrew = false;
try {
  MiniSearch.loadJSON(serialized); // no options arg -> must throw
} catch (e) {
  loadJsonThrew = true;
}
check(loadJsonThrew, 'loadJSON WITHOUT the options arg throws (the load-bearing contract)');

// ---- SURF-01: schema-on-hit + cap via the module's search() -----------------
// search() reads the module's INTERNAL index, which buildOrRestore() populates
// from the planted FsbRecipeIndex global (no chrome present -> in-memory build,
// no snapshot). Must await it before exercising search().
(async function exerciseModuleSearch() {
  await CapabilitySearch.buildOrRestore();

  const moduleHits = search('send a message', null, 5);
  check(moduleHits.length > 0, `module search returns hits after buildOrRestore (got ${moduleHits.length})`);
  check(moduleHits.length <= 5, `module search caps results at <=5 (got ${moduleHits.length})`);
  check(
    moduleHits.length > 0 && moduleHits.every((h) => Object.prototype.hasOwnProperty.call(h, 'params')),
    'every search hit carries a params field (schema-on-hit)'
  );
  check(
    moduleHits.length > 0 && moduleHits.every((h) => typeof h.sideEffectClass === 'string' && h.sideEffectClass.length > 0),
    'every search hit carries a sideEffectClass (D-03)'
  );
  // A capped query that could match many docs must still never exceed 5.
  const wideHits = search('send', null, 99);
  check(wideHits.length <= 5, `topN clamp holds even for topN=99 (got ${wideHits.length})`);

  const realSlackDescriptor = require(path.join(REPO_ROOT, 'catalog', 'descriptors', 'slack-message.json'));
  global.FsbRecipeIndex = { descriptors: [realSlackDescriptor], recipes: [] };
  await CapabilitySearch.buildOrRestore();
  const handlerHits = search('send a slack message', null, 5);
  const slackHit = handlerHits.find((h) => h.slug === 'slack.chat.postMessage');
  check(
    slackHit && slackHit.params && Array.isArray(slackHit.params.required)
      && slackHit.params.required.includes('channel')
      && slackHit.params.required.includes('text'),
    'handler-backed search hit carries descriptor params schema for slack.chat.postMessage'
  );
  check(
    slackHit && slackHit.sideEffectClass === 'mutate',
    'handler-backed descriptor sideEffectClass "write" is normalized to "mutate"'
  );

  // ---- Exit convention ------------------------------------------------------
  console.log(`\ncapability-search-eval: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
