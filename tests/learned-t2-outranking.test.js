'use strict';

/**
 * Phase 31 plan 01 (v0.9.99 -- LEARN-04 / D-15) -- learned T2 outranking RED contract.
 *
 * Wave 0 RED test (two halves):
 *   CATALOG: capability-catalog.resolve does NOT yet check a learned store first
 *     (Wave 4 adds the _getLearned() prepend). Today resolve('github.notifications',
 *     origin) returns the built-in T1b -- so the "learned T2 outranks the generic
 *     T1b" assertion FAILS LOUD (the RED).
 *   ROUTER: capability-router's case 'T2' is the unconditional RECIPE_LEARN_PENDING
 *     stub (capability-router.js:498-501); it ignores entry.recipe. Today a T2 entry
 *     WITH a learned recipe still returns the stub -- so the "dispatch via the
 *     declarative tier when a learned recipe is attached" assertion FAILS LOUD.
 * Both turn GREEN only when Wave 4 ships the resolve learned-first prepend + the
 * router T2 dispatch (RESEARCH Pattern 6). NEVER silently passes.
 *
 * LEARN-04 / D-15 sampled behavior:
 *   - catalog.resolve(slug, originA) returns { tier:'T2', recipe, descriptor } that
 *     OUTRANKS the generic T1b for the SAME slug (learned-first by resolve order)
 *   - resolve(slug, originB) does NOT return the learned recipe (origin-scoped)
 *   - router invoke dispatches case 'T2' via the declarative tier (interpret +
 *     execute called) when a learned recipe is attached; returns the
 *     RECIPE_LEARN_PENDING stub when none is
 *
 * Stubs: the real catalog driven with a seeded global.FsbLearnedRecipeStore; the
 * router driven with stubbed global.FsbCapabilityCatalog / FsbConsentGate /
 * FsbCapabilityInterpreter / FsbCapabilityFetch (the router-test injection idiom).
 *
 * Zero-framework: passed/failed + check(cond,msg) + process.exit(failed>0?1:0).
 *
 * Run: node tests/learned-t2-outranking.test.js
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
const ROUTER_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-router.js');

const SLUG = 'github.notifications';     // a slug the built-in REGISTRY has as a generic T1b
const ORIGIN_A = 'https://github.com';
const ORIGIN_B = 'https://other.example.com';

const LEARNED_RECIPE = {
  schemaVersion: 1, id: SLUG, origin: ORIGIN_A, endpoint: '/notifications/learned',
  method: 'GET', authStrategy: 'same-origin-cookie', extract: '@'
};
const LEARNED_DESC = { slug: SLUG, service: 'github.com', sideEffectClass: 'read' };

(async () => {
  console.log('--- LEARN-04/D-15 learned T2 outranking (RED until Wave 4) ---');

  // ===== HALF 1: catalog resolve learned-first (origin-scoped) =====
  // Seed the learned-store global the catalog's (Wave-4) _getLearned() reads.
  global.FsbLearnedRecipeStore = {
    getLearnedSync: function (slug, origin) {
      if (slug === SLUG && origin === ORIGIN_A) {
        return { recipe: LEARNED_RECIPE, descriptor: LEARNED_DESC };
      }
      return null;
    },
    getLearned: function (slug, origin) {
      return Promise.resolve((slug === SLUG && origin === ORIGIN_A) ? { recipe: LEARNED_RECIPE, descriptor: LEARNED_DESC } : null);
    }
  };

  const Catalog = require(CATALOG_PATH);
  check(typeof Catalog.resolve === 'function', 'capability-catalog exports resolve');

  const resA = Catalog.resolve(SLUG, ORIGIN_A);
  check(resA && resA.tier === 'T2',
    "resolve(slug, originA) returns tier 'T2' (learned-first) EVEN THOUGH the REGISTRY has a generic T1b for the slug (D-15 outranking)");
  check(resA && resA.recipe && resA.recipe.endpoint === '/notifications/learned',
    'the resolved T2 entry carries the LEARNED recipe (not the generic T1b recipe)');

  const resB = Catalog.resolve(SLUG, ORIGIN_B);
  check(resB && resB.tier !== 'T2',
    'resolve(slug, originB) does NOT return the learned T2 (origin-scoped, Pitfall 6) -- falls through to the generic tier');

  // ===== HALF 2: router case 'T2' dispatch vs stub =====
  // Inject stubbed collaborators so invoke reaches the T2 case (the router-test idiom).
  const interpretCalls = [];
  const executeCalls = [];
  globalThis.FsbConsentGate = {
    evaluate: function (req) { return Promise.resolve({ decision: 'allow', method: 'GET', sideEffectClass: 'read' }); }
  };
  globalThis.FsbCapabilityInterpreter = {
    interpretRecipe: function (recipe, args, opts) {
      interpretCalls.push({ recipe: recipe, opts: opts });
      return { success: true, spec: { origin: ORIGIN_A, url: ORIGIN_A + '/notifications/learned' } };
    }
  };
  globalThis.FsbCapabilityFetch = {
    executeBoundSpec: function (spec, tabId) {
      executeCalls.push({ spec: spec, tabId: tabId });
      return { success: true, status: 200, data: {} };
    }
  };

  // T2 WITH a learned recipe attached -> declarative dispatch.
  globalThis.FsbCapabilityCatalog = {
    resolve: function (slug, origin) {
      return { tier: 'T2', recipe: LEARNED_RECIPE, descriptor: LEARNED_DESC };
    }
  };
  // fresh-require the router so it binds the just-installed globals at module scope.
  try { delete require.cache[require.resolve(ROUTER_PATH)]; } catch (_e) { /* not loaded */ }
  const Router = require(ROUTER_PATH);
  check(typeof Router.invoke === 'function', 'capability-router exports invoke');

  const t2Hit = await Router.invoke(SLUG, {}, { origin: ORIGIN_A, tabId: 21 });
  check(interpretCalls.length >= 1 && executeCalls.length >= 1,
    "case 'T2' with a learned recipe DISPATCHES via the declarative tier (interpret + execute called, D-15)");
  check(t2Hit && t2Hit.success === true && t2Hit.tier === 'T2',
    'a learned-T2 dispatch returns the declarative success shape stamped tier:T2');
  const t2Opts = interpretCalls[0] && interpretCalls[0].opts;
  check(t2Opts && t2Opts.trustedProvenance === 'local',
    "the T2 dispatch threads {trustedProvenance:'local'} into interpretRecipe (the 'local' vouch, D-09/Pattern 6)");

  // T2 with NO learned recipe attached -> the RECIPE_LEARN_PENDING stub.
  interpretCalls.length = 0;
  executeCalls.length = 0;
  globalThis.FsbCapabilityCatalog = {
    resolve: function (slug, origin) { return { tier: 'T2', descriptor: LEARNED_DESC }; } // no recipe
  };
  try { delete require.cache[require.resolve(ROUTER_PATH)]; } catch (_e) { /* not loaded */ }
  const Router2 = require(ROUTER_PATH);
  const stubMiss = await Router2.invoke(SLUG, {}, { origin: ORIGIN_A, tabId: 21 });
  check(stubMiss && (stubMiss.code === 'RECIPE_LEARN_PENDING' || stubMiss.errorCode === 'RECIPE_LEARN_PENDING'),
    "case 'T2' with NO learned recipe falls back to the RECIPE_LEARN_PENDING stub (no dispatch)");
  check(executeCalls.length === 0, 'the RECIPE_LEARN_PENDING fall-back does NOT execute any spec');

  // cleanup injected globals
  delete globalThis.FsbConsentGate;
  delete globalThis.FsbCapabilityInterpreter;
  delete globalThis.FsbCapabilityFetch;
  delete globalThis.FsbCapabilityCatalog;
  delete global.FsbLearnedRecipeStore;

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('learned-t2-outranking.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
