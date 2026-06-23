'use strict';

/**
 * Phase 31 plan 01 (v0.9.99 -- LEARN-01 / D-11 / D-12) -- recipe-synthesizer RED
 * contract.
 *
 * Wave 0 RED test: extension/utils/recipe-synthesizer.js does NOT exist yet
 * (Wave 3). The require() at load throws MODULE_NOT_FOUND and exits non-zero (the
 * RED). It turns GREEN only when Wave 3 ships the synthesizer that turns a redacted
 * ObservedCall into a closed-vocab declarative recipe + descriptor. NEVER silently
 * passes.
 *
 * LEARN-01 / D-11 / D-12 sampled behavior:
 *   - synthesize(observedCall) -> { recipe, descriptor } whose recipe passes
 *     FsbCapabilityRecipeSchema.validateRecipe (success:true) and whose descriptor
 *     carries slug/service/intentSynonyms/actionVerb
 *   - the GATING synthesis cap (D-11 / Pitfall 4): a token-minted-by-prior-GET /
 *     response-CSRF ObservedCall yields a recipe with authStrategy
 *     'same-origin-cookie' (NOT csrf with from:'response', which the declarative
 *     replay path cannot execute) AND a flaggedForPhase32 marker
 *   - an unsynthesizable capture (cross-origin / malformed) yields null
 *
 * Loader: the cfworker IIFE via vm.runInThisContext (capability-fetch.test.js:85-90)
 * + require the schema module so validateRecipe runs under Node.
 *
 * Zero-framework: passed/failed + check(cond,msg) + process.exit(failed>0?1:0).
 *
 * Run: node tests/recipe-synthesizer.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const REPO_ROOT = path.resolve(__dirname, '..');
const CFWORKER_PATH = path.join(REPO_ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js');
const SCHEMA_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-recipe-schema.js');
const AUTH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-auth-strategies.js');
const INTERP_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-interpreter.js');
const SYNTH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'recipe-synthesizer.js');

(async () => {
  console.log('--- LEARN-01 recipe-synthesizer (RED until Wave 3) ---');

  // Test-load the cfworker validator into the global + the schema module so
  // validateRecipe runs (the SW importScripts the IIFE before the schema module).
  vm.runInThisContext(fs.readFileSync(CFWORKER_PATH, 'utf8'));
  const Schema = require(SCHEMA_PATH);
  global.FsbCapabilityAuthStrategies = require(AUTH_PATH);
  const Interp = require(INTERP_PATH);
  check(typeof Schema.validateRecipe === 'function', 'recipe-schema exports validateRecipe (loader OK)');

  // require AT TOP LEVEL -- a MISSING synthesizer throws here (the loud RED).
  const Synth = require(SYNTH_PATH);
  check(typeof Synth === 'object' && Synth, 'recipe-synthesizer module loads (require)');
  check(typeof Synth.synthesize === 'function', 'exports synthesize');

  // ---- a clean, redacted, same-origin GET ObservedCall -> a schema-valid recipe ----
  const observed = {
    origin: 'https://example.com',
    method: 'GET',
    path: '/api/items/42',                 // a concrete path the heuristic parameterizes
    headerNames: ['content-type', 'accept'],
    responseShape: { status: 200, mimeType: 'application/json' }
  };
  const out = Synth.synthesize(observed);
  check(out && typeof out === 'object', 'synthesize(cleanObservedCall) returns an object');
  check(out && out.recipe && typeof out.recipe === 'object', 'result carries a recipe');
  check(out && out.descriptor && typeof out.descriptor === 'object', 'result carries a descriptor');

  if (out && out.recipe) {
    const v = Schema.validateRecipe(out.recipe);
    check(v && v.success === true, 'synthesized recipe PASSES validateRecipe (closed-vocab valid, D-12)');
    check(out.recipe.origin === 'https://example.com', 'recipe.origin is the captured origin');
    check(typeof out.recipe.endpoint === 'string' && out.recipe.endpoint.charAt(0) === '/',
      'recipe.endpoint is a relative path template');
    check(out.recipe.endpoint === '/api/items/{id}', 'volatile path segment is converted to a named endpoint placeholder');
    check(out.recipe.params && Array.isArray(out.recipe.params.required) && out.recipe.params.required.indexOf('id') !== -1,
      'synthesized recipe declares the placeholder in params.required');
    check(out.replayArgs && out.replayArgs.id === '42',
      'synthesize returns transient replayArgs for the observed placeholder value');
    const bind = Interp.interpretRecipe(out.recipe, out.replayArgs, { trustedProvenance: 'local' });
    check(bind && bind.success === true && bind.spec && bind.spec.url === '/api/items/42',
      'synthesized placeholder recipe binds with its transient replayArgs');
    check(out.recipe.method === 'GET', 'recipe.method is the captured verb');
    // a GET with no CSRF header defaults to same-origin-cookie (D-11 default)
    check(out.recipe.authStrategy === 'same-origin-cookie', "GET recipe authStrategy defaults to 'same-origin-cookie' (D-11)");
  }
  if (out && out.descriptor) {
    check(typeof out.descriptor.slug === 'string' && out.descriptor.slug.length > 0, 'descriptor carries a slug');
    check(typeof out.descriptor.service === 'string' && out.descriptor.service.length > 0, 'descriptor carries a service');
    check(Array.isArray(out.descriptor.intentSynonyms), 'descriptor carries intentSynonyms (array)');
    check(typeof out.descriptor.actionVerb === 'string', 'descriptor carries an actionVerb');
  }

  // ---- the GATING synthesis cap (D-11 / Pitfall 4): a response-minted-CSRF call ----
  // A token minted by a prior same-origin GET (from:'response') is what the
  // DECLARATIVE replay path cannot execute. The synthesizer MUST cap to
  // same-origin-cookie + a flaggedForPhase32 marker, NOT emit csrf.from:'response'.
  const responseCsrfCall = {
    origin: 'https://example.com',
    method: 'POST',
    path: '/api/items',
    headerNames: ['content-type', 'x-csrf-token'],
    csrfHint: { from: 'response', header: 'x-csrf-token' }, // the prior-GET-minted token signal
    responseShape: { status: 201, mimeType: 'application/json' }
  };
  const capped = Synth.synthesize(responseCsrfCall);
  check(capped && capped.recipe, 'synthesize(responseCsrfCall) still produces a recipe (capped, not discarded)');
  if (capped && capped.recipe) {
    check(capped.recipe.authStrategy === 'same-origin-cookie',
      "response-minted-CSRF caps authStrategy to 'same-origin-cookie' (NOT csrf.from:'response', D-11/Pitfall 4)");
    const csrfFrom = capped.recipe.csrf && capped.recipe.csrf.from;
    check(csrfFrom !== 'response', "synthesized recipe NEVER carries csrf.from === 'response' (declarative path cannot execute it)");
    check(capped.recipe.flaggedForPhase32 === true || (capped.descriptor && capped.descriptor.flaggedForPhase32 === true),
      'the ambiguous-auth capture is flaggedForPhase32 (D-11 self-healing marker)');
    // and the capped recipe is STILL schema-valid (a non-conforming synthesis is never emitted)
    const cv = Schema.validateRecipe(capped.recipe);
    check(cv && cv.success === true, 'the capped recipe is STILL validateRecipe-green');
  }

  // ---- an unsynthesizable capture yields null ----
  const crossOrigin = {
    origin: 'https://other.example.org', // not the active first-party origin context
    method: 'GET',
    path: 'not-a-valid-path',            // malformed (no leading slash)
    headerNames: []
  };
  const none = Synth.synthesize(crossOrigin);
  check(none === null, 'an unsynthesizable / malformed capture yields null (never a bad recipe, D-12)');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('recipe-synthesizer.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
