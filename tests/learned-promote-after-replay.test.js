'use strict';

/**
 * Phase 31 plan 01 (v0.9.99 -- LEARN-01 / D-10) -- promote-after-replay RED contract.
 *
 * Wave 0 RED test: the modules that orchestrate promote-after-replay
 * (extension/utils/recipe-synthesizer.js + extension/utils/learned-recipe-store.js)
 * do NOT exist yet (Wave 3). The require() at load throws MODULE_NOT_FOUND and exits
 * non-zero (the RED). It turns GREEN only when Wave 3 wires the candidate ->
 * interpretRecipe -> executeBoundSpec -> promote chain (RESEARCH Pattern 4). NEVER
 * silently passes.
 *
 * D-10 sampled behavior -- a candidate PROMOTES only after a clean replay:
 *   CASE A: clean replay (interpret {success:true,spec} + execute {success:true})
 *           -> the recipe IS stored (getLearned non-null)
 *   CASE B: failed replay (execute {success:false, code:'RECIPE_ORIGIN_MISMATCH'})
 *           -> NO store (getLearned null) -- the candidate is DISCARDED (D-10)
 *   CASE C: failed interpret ({success:false}) -> NO store
 *   AND: the replay threads {trustedProvenance:'local'} into interpretRecipe (the
 *        loader's vouch, HI-01) -- the injected stub records the opts it received.
 *
 * The interpret/execute deps are INJECTED stubs (the test owns the replay outcome);
 * the real per-origin store is driven with the storage stub so the
 * stored/not-stored branch is observable via getLearned.
 *
 * Zero-framework: passed/failed + check(cond,msg) + process.exit(failed>0?1:0).
 *
 * Run: node tests/learned-promote-after-replay.test.js
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
const SYNTH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'recipe-synthesizer.js');
const STORE_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'learned-recipe-store.js');

const ORIGIN = 'https://example.com';
const TAB_ID = 13;

function mkRecipe(id) {
  return {
    schemaVersion: 1, id: id, origin: ORIGIN, endpoint: '/api/' + id,
    method: 'GET', authStrategy: 'same-origin-cookie', extract: '@'
  };
}
function mkParamRecipe(id) {
  const recipe = mkRecipe(id);
  recipe.endpoint = '/api/{id}';
  recipe.params = {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string', minLength: 1 } }
  };
  return recipe;
}
function mkDesc(slug) {
  return { slug: slug, service: 'example.com', intentSynonyms: ['do ' + slug], description: slug, actionVerb: 'list', sideEffectClass: 'read' };
}

// An injected interpret stub that records the opts it received (HI-01 threading proof).
function makeInterpretStub(outcome) {
  const calls = [];
  const fn = function (recipe, args, opts) {
    calls.push({ recipe: recipe, args: args, opts: opts });
    return outcome; // a plain object (await is a no-op)
  };
  fn.calls = calls;
  return fn;
}
function makeExecuteStub(outcome) {
  const calls = [];
  const fn = function (spec, tabId) {
    calls.push({ spec: spec, tabId: tabId });
    return outcome;
  };
  fn.calls = calls;
  return fn;
}

(async () => {
  console.log('--- LEARN-01/D-10 promote-after-replay (RED until Wave 3) ---');

  installChromeStorageStub();

  // require AT TOP LEVEL -- a MISSING module throws here (the loud RED).
  const Synth = require(SYNTH_PATH);
  const Learned = require(STORE_PATH);
  check(typeof Synth.promoteAfterReplay === 'function',
    'recipe-synthesizer exports promoteAfterReplay(candidate, deps) (RED until Wave 3)');
  check(typeof Learned.getLearned === 'function', 'learned-recipe-store exports getLearned');

  // ---- CASE A: clean replay -> STORED ----
  const candA = { recipe: mkRecipe('clean'), descriptor: mkDesc('clean'), origin: ORIGIN };
  const interpA = makeInterpretStub({ success: true, spec: { origin: ORIGIN, url: ORIGIN + '/api/clean' } });
  const execA = makeExecuteStub({ success: true, status: 200, data: {} });
  const resA = await Synth.promoteAfterReplay(candA, { interpretRecipe: interpA, executeBoundSpec: execA, tabId: TAB_ID });
  check(resA && resA.promoted === true, 'CASE A clean replay -> promoteAfterReplay reports promoted:true');
  const storedA = await Learned.getLearned('clean', ORIGIN);
  check(storedA && storedA.recipe && storedA.recipe.id === 'clean', 'CASE A clean replay -> the recipe IS stored (getLearned non-null, D-10)');

  // the replay threaded {trustedProvenance:'local'} into interpretRecipe (HI-01)
  check(interpA.calls.length >= 1, 'CASE A called interpretRecipe');
  const optsA = interpA.calls[0] && interpA.calls[0].opts;
  check(optsA && optsA.trustedProvenance === 'local',
    "the replay threads {trustedProvenance:'local'} into interpretRecipe (the loader vouch, HI-01)");
  check(execA.calls.length >= 1 && execA.calls[0].tabId === TAB_ID, 'CASE A executed the bound spec on the session tab');

  // Synthesized endpoint placeholders must be filled during the replay gate. The
  // args are transient proof inputs and are not persisted by the store.
  const candParam = { recipe: mkParamRecipe('param'), descriptor: mkDesc('param'), origin: ORIGIN, replayArgs: { id: '42' } };
  const interpParam = makeInterpretStub({ success: true, spec: { origin: ORIGIN, url: ORIGIN + '/api/42' } });
  const execParam = makeExecuteStub({ success: true, status: 200, data: {} });
  const resParam = await Synth.promoteAfterReplay(candParam, { interpretRecipe: interpParam, executeBoundSpec: execParam, tabId: TAB_ID });
  check(resParam && resParam.promoted === true, 'placeholder candidate with replayArgs promotes after clean replay');
  check(interpParam.calls[0] && interpParam.calls[0].args && interpParam.calls[0].args.id === '42',
    'promoteAfterReplay passes candidate.replayArgs into interpretRecipe');
  const storedParam = await Learned.getLearned('param', ORIGIN);
  check(storedParam && !storedParam.replayArgs && storedParam.recipe && storedParam.recipe.endpoint === '/api/{id}',
    'transient replayArgs are not persisted with the learned recipe');

  // ---- CASE B: failed replay (execute fails) -> NOT stored (DISCARD, D-10) ----
  const candB = { recipe: mkRecipe('failexec'), descriptor: mkDesc('failexec'), origin: ORIGIN };
  const interpB = makeInterpretStub({ success: true, spec: { origin: ORIGIN, url: ORIGIN + '/api/failexec' } });
  const execB = makeExecuteStub({ success: false, code: 'RECIPE_ORIGIN_MISMATCH' });
  const resB = await Synth.promoteAfterReplay(candB, { interpretRecipe: interpB, executeBoundSpec: execB, tabId: TAB_ID });
  check(resB && resB.promoted === false, 'CASE B failed replay -> promoteAfterReplay reports promoted:false');
  const storedB = await Learned.getLearned('failexec', ORIGIN);
  check(storedB === null, 'CASE B failed replay -> NO store (candidate DISCARDED, D-10)');

  // ---- CASE C: failed interpret -> NOT stored ----
  const candC = { recipe: mkRecipe('failinterp'), descriptor: mkDesc('failinterp'), origin: ORIGIN };
  const interpC = makeInterpretStub({ success: false, code: 'RECIPE_SIGNATURE_INVALID' });
  const execC = makeExecuteStub({ success: true });
  const resC = await Synth.promoteAfterReplay(candC, { interpretRecipe: interpC, executeBoundSpec: execC, tabId: TAB_ID });
  check(resC && resC.promoted === false, 'CASE C failed interpret -> promoted:false');
  const storedC = await Learned.getLearned('failinterp', ORIGIN);
  check(storedC === null, 'CASE C failed interpret -> NO store (D-10)');
  check(execC.calls.length === 0, 'CASE C failed interpret -> executeBoundSpec is NOT reached (no replay side effect on a failed bind)');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('learned-promote-after-replay.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
