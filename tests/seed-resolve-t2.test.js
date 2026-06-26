'use strict';

/**
 * Phase 42 plan 03 (DSEED-01, SC2) -- seed-resolve-t2.test.js
 *
 * Drives the REAL capability-catalog resolve() to prove the seed->T2 branch:
 *   1. A descriptor-only slug (backing 'dom'/absent) on a SEEDED origin resolves
 *      tier:'T2' with NO recipe field (the router's RECIPE_LEARN_PENDING leg).
 *   2. The SAME slug on an UNSEEDED origin resolves tier:'T3' (unchanged).
 *   3. With a learned recipe for (slug, seededOrigin), resolve returns
 *      { tier:'T2', recipe } from the LEARN-04 learned-first path -- the seed branch
 *      did NOT shadow it, and the recipe is the learned one (outranks).
 *   4. A genuinely-unknown slug (not in descriptors, not in REGISTRY) still resolves
 *      null (RECIPE_NOT_FOUND) even on a seeded origin -- the seed branch only fires
 *      for a PRESENT descriptor.
 *   5. A descriptor with backing:'learn' still resolves T2 via the existing leg (the
 *      seed branch does not double-handle it).
 *
 * Non-vacuous: the unseeded->T3 case proves the branch is GATED on the seed (not
 * always-T2); the seeded set + descriptor slugs are distinctive.
 *
 * Zero-framework: passed/failed + check + process.exit (mirrors learned-t2-outranking).
 * Registered in package.json by Plan 01 Task 4.
 *
 * Run: node tests/seed-resolve-t2.test.js
 * NO EMOJIS, ASCII-only source.
 */

const path = require('path');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const REPO_ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-catalog.js');

const SEEDED_ORIGIN = 'https://dashboard.stripe.com';
const UNSEEDED_ORIGIN = 'https://not-seeded.example.com';
const DOM_SLUG = 'learned.stripe.list.charges';     // descriptor-only, backing 'dom'
const LEARN_SLUG = 'learned.stripe.create.charge';  // descriptor backing 'learn'
const UNKNOWN_SLUG = 'totally.unknown.slug.xyz';

const LEARNED_RECIPE = {
  schemaVersion: 2, id: DOM_SLUG, origin: SEEDED_ORIGIN, endpoint: '/v1/charges',
  method: 'GET', authStrategy: 'same-origin-cookie', extract: '@', expectedShape: '@'
};

(function () {
  console.log('--- DSEED-01/SC2 seed-resolve-t2 (seeded->T2, unseeded->T3) ---');

  // Stub the descriptors index (FsbRecipeIndex.descriptors) with a backing:'dom'
  // slug + a backing:'learn' slug, both distinctive.
  globalThis.FsbRecipeIndex = {
    descriptors: [
      { slug: DOM_SLUG, backing: 'dom', service: 'dashboard.stripe.com', intentSynonyms: ['list', 'charges'] },
      { slug: LEARN_SLUG, backing: 'learn', service: 'dashboard.stripe.com', intentSynonyms: ['create', 'charge'] }
    ]
  };

  // Stub the seeds accessor: SEEDED_ORIGIN is seeded, everything else null.
  globalThis.FsbNetworkCapture = {
    getSeedForOrigin: function (origin) {
      return origin === SEEDED_ORIGIN ? { hints: [{ op: 'list_charges', method: 'GET', path: '/v1/charges' }] } : null;
    }
  };

  // No learned recipe by default (the learned-first assertion installs one later).
  globalThis.FsbLearnedRecipeStore = {
    getLearnedSync: function () { return null; }
  };

  const Catalog = require(CATALOG_PATH);
  check(typeof Catalog.resolve === 'function', 'capability-catalog exports resolve');

  // ---- (1) seeded descriptor-only slug -> T2, NO recipe ----
  const seeded = Catalog.resolve(DOM_SLUG, SEEDED_ORIGIN);
  check(seeded && seeded.tier === 'T2', 'seeded would-be-T3 descriptor resolves tier:T2 (learn-pending)');
  check(seeded && !('recipe' in seeded), 'the seed->T2 branch sets NO recipe field (never fabricate a credentialed call)');
  check(seeded && seeded.descriptor && seeded.descriptor.slug === DOM_SLUG, 'the T2 result carries the descriptor');

  // ---- (2) the SAME slug on an UNSEEDED origin -> T3 (unchanged, gated on the seed) ----
  const unseeded = Catalog.resolve(DOM_SLUG, UNSEEDED_ORIGIN);
  check(unseeded && unseeded.tier === 'T3', 'the SAME slug on an UNSEEDED origin resolves tier:T3 (branch gated on the seed)');
  check(unseeded && !('recipe' in unseeded), 'the unseeded T3 result has no recipe (unchanged)');

  // ---- (5) a backing:'learn' descriptor still resolves T2 via the existing leg ----
  const learnBacked = Catalog.resolve(LEARN_SLUG, UNSEEDED_ORIGIN);
  check(learnBacked && learnBacked.tier === 'T2', "a backing:'learn' descriptor still resolves T2 via the existing leg (even unseeded)");
  check(learnBacked && !('recipe' in learnBacked), "the backing:'learn' T2 leg sets no recipe (descriptor-only seam)");

  // ---- (4) a genuinely-unknown slug -> null even on a seeded origin ----
  const unknown = Catalog.resolve(UNKNOWN_SLUG, SEEDED_ORIGIN);
  check(unknown === null, 'a genuinely-unknown slug resolves null (RECIPE_NOT_FOUND) even on a seeded origin (seed branch needs a descriptor)');

  // ---- (3) learned-first OUTRANKS the seed branch ----
  // Install a learned recipe for (DOM_SLUG, SEEDED_ORIGIN). resolve() must return it
  // from the LEARN-04 learned-first path with the recipe attached -- the seed branch
  // (which only runs in the no-learned fallback) did NOT shadow it.
  globalThis.FsbLearnedRecipeStore = {
    getLearnedSync: function (slug, origin) {
      return (slug === DOM_SLUG && origin === SEEDED_ORIGIN) ? { recipe: LEARNED_RECIPE, descriptor: null } : null;
    }
  };
  const learned = Catalog.resolve(DOM_SLUG, SEEDED_ORIGIN);
  check(learned && learned.tier === 'T2', 'with a learned recipe, resolve returns T2 (learned-first)');
  check(learned && learned.recipe && learned.recipe.id === DOM_SLUG,
    'the learned-first T2 carries the LEARNED recipe (outranks the seed-only T2-no-recipe)');
  check(learned && learned.recipe === LEARNED_RECIPE, 'the returned recipe is the learned one (byte-identical), not a fabrication');

  // cleanup the injected globals
  delete globalThis.FsbRecipeIndex;
  delete globalThis.FsbNetworkCapture;
  delete globalThis.FsbLearnedRecipeStore;

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})();
