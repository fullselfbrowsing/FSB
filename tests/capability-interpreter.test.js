'use strict';

/**
 * Phase 26 plan 02 (v0.9.99 Native Capability Catalog) -- capability-interpreter
 * binding + no-network suite. Proves CAP-02 and CAP-03:
 *   - CAP-02: a valid recipe + valid invoke args bind to a bound request spec
 *     { url, method, headers, body, query, authStrategy, csrfSource?, origin,
 *     extract } for ALL FOUR auth strategies, and the interpreter performs NO
 *     network call -- the load-bearing Phase 26/27 boundary assertion: the
 *     chrome.scripting.executeScript recorder AND the globalThis.fetch recorder
 *     are each called 0 times across the whole suite.
 *   - CAP-03: invoke args are validated against recipe.params by the eval-free
 *     validator before binding; invalid args -> RECIPE_SCHEMA_INVALID; an unknown
 *     authStrategy (defense-in-depth beyond the schema enum) -> RECIPE_OPCODE_INVALID;
 *     a missing {var} placeholder -> RECIPE_SCHEMA_INVALID.
 * Plus the errors.ts passthrough: a SW result { success:false,
 * code:'RECIPE_SCHEMA_INVALID' } surfaces the code verbatim through the built
 * mcp/build/errors.js (NOT collapsed to action_rejected).
 *
 * Zero-framework clone of tests/trigger-store.test.js (passed/failed counters,
 * synchronous check(cond,msg) per tests/ownership-error-codes.test.js,
 * process.exit(failed>0?1:0)).
 *
 * cfworker IIFE test-load: extension/lib/cfworker-json-schema.min.js assigns
 * `var CfworkerJsonSchema = (()=>{...})()` (a script-scope global), so a bare
 * require() will NOT populate module.exports. We evaluate it via
 * vm.runInThisContext FIRST so globalThis.CfworkerJsonSchema exists, then the
 * schema + auth-strategies modules are required so their globals are set, then
 * the interpreter is required. This loader is test-only and is NOT on the Plan 03
 * recipe-path allowlist.
 *
 * The chrome mock recorder + fetch recorder are test-only (the harness mock has
 * no scripting surface, so we extend it inline). The errors.ts passthrough check
 * dynamic-imports the BUILT mcp errors module (npm --prefix mcp run build runs
 * earlier in the scripts.test chain), mirroring tests/mcp-recovery-messaging.test.js.
 *
 * Run: node tests/capability-interpreter.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');
const harness = require('./fixtures/run-task-harness');

const REPO_ROOT = path.join(__dirname, '..');
const CFWORKER_PATH = path.join(REPO_ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js');
const SCHEMA_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-recipe-schema.js');
const AUTH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-auth-strategies.js');
const INTERP_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-interpreter.js');
const FIXTURE_DIR = path.join(REPO_ROOT, 'catalog', 'recipes', '_fixtures');

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

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

// ---- No-network recorders (CAP-02 boundary proof) --------------------------
// Install a chrome mock whose scripting.executeScript records every call, and a
// globalThis.fetch recorder. The interpreter MUST touch neither. We assert the
// recorders are still empty at the END of the suite.
const executeScriptCalls = [];
const fetchCalls = [];

const chromeHandle = harness.installChromeMock({});
chromeHandle.chrome.scripting = {
  executeScript: function () {
    executeScriptCalls.push(Array.prototype.slice.call(arguments));
    return Promise.resolve([]);
  }
};
const priorFetch = globalThis.fetch;
globalThis.fetch = function () {
  fetchCalls.push(Array.prototype.slice.call(arguments));
  return Promise.reject(new Error('fetch must not be called by the Phase 26 interpreter'));
};

function restoreGlobals() {
  if (priorFetch === undefined) {
    delete globalThis.fetch;
  } else {
    globalThis.fetch = priorFetch;
  }
  chromeHandle.restore();
}

// ---- 1. Test-load cfworker IIFE + the modules under test. ------------------
vm.runInThisContext(fs.readFileSync(CFWORKER_PATH, 'utf8'));
check(typeof globalThis.CfworkerJsonSchema === 'object' && globalThis.CfworkerJsonSchema !== null,
  'cfworker IIFE test-loaded: globalThis.CfworkerJsonSchema present');

require(SCHEMA_PATH);
const AUTH = require(AUTH_PATH);
const I = require(INTERP_PATH);
check(typeof I.interpretRecipe === 'function', 'interpreter exports interpretRecipe');
check(typeof globalThis.FsbCapabilityRecipeSchema === 'object', 'schema module global set (FsbCapabilityRecipeSchema)');
check(typeof globalThis.FsbCapabilityAuthStrategies === 'object', 'auth-strategies module global set (FsbCapabilityAuthStrategies)');

const valid = readFixture('valid-recipe.json');

// ---- 2a. CAP-02: valid recipe + valid args -> bound spec. ------------------
const okResult = I.interpretRecipe(valid, { id: 'abc 123' });
check(okResult && okResult.success === true,
  'valid recipe + valid args -> { success:true } (got ' + JSON.stringify(okResult && okResult.code) + ')');
if (okResult && okResult.success) {
  const spec = okResult.spec;
  check(spec.url === '/api/abc%20123',
    'spec.url has the {id} substituted and encodeURIComponent-escaped (got ' + spec.url + ')');
  check(spec.method === 'GET', 'spec.method carried from recipe');
  check(spec.origin === 'https://example.com', 'spec.origin carried from recipe');
  check(spec.extract === 'data.items[*].name', 'spec.extract carried (unevaluated) from recipe');
  check(spec.authStrategy === 'same-origin-cookie', 'spec.authStrategy carried from recipe');
  check(spec.query && spec.query.id === 'abc%20123',
    'spec.query.id filled from the static request placement map, escaped (got ' + JSON.stringify(spec.query) + ')');
}

// ---- 2b. CAP-02: each of the four auth strategies shapes the spec. ---------
function variant(strategy, extra) {
  const r = Object.assign({}, valid, { authStrategy: strategy }, extra || {});
  return I.interpretRecipe(r, { id: 'x' });
}

const vNone = variant('none');
check(vNone && vNone.success === true
  && !('credentials' in vNone.spec) && !('_authNeed' in vNone.spec) && !('csrfSource' in vNone.spec),
  'authStrategy none -> spec carries no auth shaping (unchanged)');

const vCookie = variant('same-origin-cookie');
check(vCookie && vCookie.success === true && vCookie.spec.credentials === 'include',
  'authStrategy same-origin-cookie -> spec.credentials === include');

const vBearer = variant('bearer-from-storage');
check(vBearer && vBearer.success === true
  && vBearer.spec._authNeed && vBearer.spec._authNeed.kind === 'bearer' && vBearer.spec._authNeed.source === 'storage',
  'authStrategy bearer-from-storage -> spec._authNeed { kind:bearer, source:storage }');

const vCsrf = variant('csrf-header-scrape', { csrf: { from: 'meta', selector: 'meta[name=csrf-token]', header: 'X-CSRF-Token' } });
check(vCsrf && vCsrf.success === true
  && vCsrf.spec.csrfSource && vCsrf.spec.csrfSource.header === 'X-CSRF-Token' && vCsrf.spec.csrfSource.from === 'meta',
  'authStrategy csrf-header-scrape -> spec.csrfSource from recipe.csrf');

// ---- 3. CAP-03: invalid invoke args -> RECIPE_SCHEMA_INVALID. --------------
// recipe.params requires id:string; pass a number and an empty object.
const badType = I.interpretRecipe(valid, { id: 123 });
check(badType && badType.success === false && badType.code === 'RECIPE_SCHEMA_INVALID',
  'invoke args violating recipe.params (id:number) -> RECIPE_SCHEMA_INVALID (got ' + (badType && badType.code) + ')');

const missingArg = I.interpretRecipe(valid, {});
check(missingArg && missingArg.success === false && missingArg.code === 'RECIPE_SCHEMA_INVALID',
  'invoke args missing required id -> RECIPE_SCHEMA_INVALID (got ' + (missingArg && missingArg.code) + ')');

// ---- 4. CAP-03: unknown authStrategy -> RECIPE_OPCODE_INVALID. -------------
// The schema enum would reject an unknown strategy on the recipe, so exercise
// the interpreter's defense-in-depth dispatch directly via bindAuthStrategy.
const unknownStrategy = AUTH.bindAuthStrategy('persisted-query-hash', { url: '/x' }, {});
check(unknownStrategy && unknownStrategy.success === false && unknownStrategy.code === 'RECIPE_OPCODE_INVALID',
  'bindAuthStrategy(unknown) -> RECIPE_OPCODE_INVALID (got ' + (unknownStrategy && unknownStrategy.code) + ')');
check(unknownStrategy && unknownStrategy.code === unknownStrategy.errorCode && unknownStrategy.field === 'authStrategy',
  'unknown-strategy rejection sets both code and errorCode and names field authStrategy');

// ---- 5. CAP-03: args missing a {var} placeholder -> RECIPE_SCHEMA_INVALID. -
// Open the params sub-doc (no required id) so the templater is the gate, not params.
const openParams = Object.assign({}, valid, { params: { type: 'object' }, request: {} });
const missingPlaceholder = I.interpretRecipe(openParams, {});
check(missingPlaceholder && missingPlaceholder.success === false && missingPlaceholder.code === 'RECIPE_SCHEMA_INVALID',
  'args missing the {id} endpoint placeholder -> RECIPE_SCHEMA_INVALID (got ' + (missingPlaceholder && missingPlaceholder.code) + ')');

// ---- 6. Recipe schema gate is delegated (bad enum surfaces verbatim). ------
const badMethod = I.interpretRecipe(Object.assign({}, valid, { method: 'CONNECT' }), { id: 'x' });
check(badMethod && badMethod.success === false && badMethod.code === 'RECIPE_OPCODE_INVALID',
  'recipe with bad method enum -> RECIPE_OPCODE_INVALID via validateRecipe (got ' + (badMethod && badMethod.code) + ')');

// ---- 7. CAP-02 NO-NETWORK PROOF: recorders never fired. --------------------
// This is the load-bearing Phase 26/27 boundary assertion.
check(executeScriptCalls.length === 0,
  'chrome.scripting.executeScript was called 0 times across the suite (got ' + executeScriptCalls.length + ')');
check(fetchCalls.length === 0,
  'globalThis.fetch was called 0 times across the suite (got ' + fetchCalls.length + ')');

// ---- 8. errors.ts RECIPE_ passthrough (built mcp module). ------------------
async function checkErrorsPassthrough() {
  const errorsModuleUrl = pathToFileURL(path.join(REPO_ROOT, 'mcp', 'build', 'errors.js')).href;
  const { mapFSBError } = await import(errorsModuleUrl);
  const out = mapFSBError({ success: false, code: 'RECIPE_SCHEMA_INVALID' });
  const text = out && out.content && out.content[0] ? out.content[0].text : '';
  check(text.indexOf('RECIPE_SCHEMA_INVALID') !== -1,
    'mapFSBError surfaces RECIPE_SCHEMA_INVALID verbatim (built errors.ts passthrough)');
  check(text.indexOf('action_rejected') === -1,
    'mapFSBError does NOT collapse RECIPE_SCHEMA_INVALID to action_rejected');
  // errorCode field carries the code too (resolveErrorKey reads errorCode then code).
  const out2 = mapFSBError({ success: false, errorCode: 'RECIPE_OPCODE_INVALID' });
  const text2 = out2 && out2.content && out2.content[0] ? out2.content[0].text : '';
  check(text2.indexOf('RECIPE_OPCODE_INVALID') !== -1,
    'mapFSBError surfaces RECIPE_OPCODE_INVALID verbatim from errorCode');
}

checkErrorsPassthrough()
  .then(function () {
    restoreGlobals();
    console.log('  passed:', passed);
    console.log('  failed:', failed);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(function (err) {
    restoreGlobals();
    console.error('FATAL:', err && err.message ? err.message : err);
    process.exit(2);
  });
