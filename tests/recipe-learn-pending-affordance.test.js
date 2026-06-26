'use strict';

/**
 * Phase 42 plan 04 (DSEED-01, SC2) -- recipe-learn-pending-affordance.test.js
 *
 * Drives the REAL capability-router (the router-test injection idiom) to prove the
 * RECIPE_LEARN_PENDING actionable affordance:
 *   - A T2 entry with NO recipe + a descriptor carrying a known origin, invoked
 *     through a consent-allowing gate, returns:
 *       code === errorCode === error === 'RECIPE_LEARN_PENDING'  (INV-03 triple byte-stable)
 *       reason === 'not-yet-learned', actionable === true, typeof message === 'string'
 *       message names the origin AND contains 'learn'; the slug field is present.
 *   - The with-recipe CONTROL: a T2 entry WITH a recipe dispatches the declarative
 *     tier (no RECIPE_LEARN_PENDING) -- proving the change is scoped to the no-recipe
 *     leg.
 *
 * Zero-framework: passed/failed + check + process.exit (mirrors learned-t2-outranking).
 * Registered in package.json by Plan 01 Task 4.
 *
 * Run: node tests/recipe-learn-pending-affordance.test.js
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
const ROUTER_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-router.js');

const SLUG = 'learned.stripe.list.charges';
const ORIGIN = 'https://dashboard.stripe.com';
const DESC = { slug: SLUG, service: 'dashboard.stripe.com', origin: ORIGIN, backing: 'dom' };
const LEARNED_RECIPE = {
  schemaVersion: 2, id: SLUG, origin: ORIGIN, endpoint: '/v1/charges',
  method: 'GET', authStrategy: 'same-origin-cookie', extract: '@', expectedShape: '@'
};

(async () => {
  console.log('--- DSEED-01/SC2 RECIPE_LEARN_PENDING actionable affordance ---');

  // ----- consent allow + interpret/execute stubs (the router-test idiom) -----
  const interpretCalls = [];
  const executeCalls = [];
  globalThis.FsbConsentGate = {
    evaluate: function () { return Promise.resolve({ decision: 'allow', method: 'GET', sideEffectClass: 'read' }); }
  };
  globalThis.FsbCapabilityInterpreter = {
    interpretRecipe: function (recipe, args, opts) {
      interpretCalls.push({ recipe: recipe, opts: opts });
      return { success: true, spec: { origin: ORIGIN, url: ORIGIN + '/v1/charges' } };
    }
  };
  globalThis.FsbCapabilityFetch = {
    executeBoundSpec: function (spec, tabId) {
      executeCalls.push({ spec: spec, tabId: tabId });
      return { success: true, status: 200, data: {} };
    }
  };

  // ===== the T2-NO-recipe affordance =====
  globalThis.FsbCapabilityCatalog = {
    resolve: function () { return { tier: 'T2', descriptor: DESC }; }   // NO recipe
  };
  try { delete require.cache[require.resolve(ROUTER_PATH)]; } catch (_e) { /* not loaded */ }
  const Router = require(ROUTER_PATH);
  check(typeof Router.invoke === 'function', 'capability-router exports invoke');

  const res = await Router.invoke(SLUG, {}, { origin: ORIGIN, tabId: 7 });

  // ---- INV-03: code === errorCode === error === 'RECIPE_LEARN_PENDING' (byte-stable) ----
  check(res && res.code === 'RECIPE_LEARN_PENDING', "code === 'RECIPE_LEARN_PENDING' (INV-03)");
  check(res && res.errorCode === 'RECIPE_LEARN_PENDING', "errorCode === 'RECIPE_LEARN_PENDING' (INV-03)");
  check(res && res.error === 'RECIPE_LEARN_PENDING', "error === 'RECIPE_LEARN_PENDING' (INV-03)");
  check(res && res.code === res.errorCode && res.errorCode === res.error,
    'INV-03 triple-field byte-equality: code === errorCode === error');

  // ---- the ADDITIVE actionable fields ----
  check(res && res.reason === 'not-yet-learned', "reason === 'not-yet-learned' (additive)");
  check(res && res.actionable === true, 'actionable === true (additive)');
  check(res && typeof res.message === 'string' && res.message.length > 0, 'message is a non-empty string (additive)');
  check(res && typeof res.message === 'string' && res.message.indexOf(ORIGIN) !== -1,
    'message NAMES the origin (' + ORIGIN + ')');
  check(res && typeof res.message === 'string' && res.message.indexOf('learn') !== -1,
    "message contains 'learn' (the actionable prompt)");
  check(res && res.slug === SLUG, 'the existing slug field is still present');

  // ---- the no-recipe leg did NOT dispatch ----
  check(executeCalls.length === 0, 'the affordance leg does NOT execute any spec (no dispatch)');

  // ===== the WITH-recipe CONTROL (scoped to the no-recipe leg) =====
  interpretCalls.length = 0;
  executeCalls.length = 0;
  globalThis.FsbCapabilityCatalog = {
    resolve: function () { return { tier: 'T2', recipe: LEARNED_RECIPE, descriptor: DESC }; }
  };
  try { delete require.cache[require.resolve(ROUTER_PATH)]; } catch (_e) { /* not loaded */ }
  const Router2 = require(ROUTER_PATH);
  const ctrl = await Router2.invoke(SLUG, {}, { origin: ORIGIN, tabId: 7 });
  check(interpretCalls.length >= 1 && executeCalls.length >= 1,
    'CONTROL: a T2 entry WITH a recipe DISPATCHES the declarative tier (interpret + execute called)');
  check(ctrl && ctrl.success === true && ctrl.tier === 'T2',
    'CONTROL: the with-recipe dispatch returns the declarative success shape (no RECIPE_LEARN_PENDING)');
  check(!(ctrl && ctrl.code === 'RECIPE_LEARN_PENDING'),
    'CONTROL: the with-recipe leg does NOT return RECIPE_LEARN_PENDING (change scoped to the no-recipe leg)');

  // cleanup injected globals
  delete globalThis.FsbConsentGate;
  delete globalThis.FsbCapabilityInterpreter;
  delete globalThis.FsbCapabilityFetch;
  delete globalThis.FsbCapabilityCatalog;

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('recipe-learn-pending-affordance.test.js failed:', err && err.message ? err.message : err);
  process.exit(1);
});
