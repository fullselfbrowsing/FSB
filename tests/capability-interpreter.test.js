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
  // Phase 27 (FETCH-03, D-09): spec.url is now the EFFECTIVE post-query-fold URL.
  // valid-recipe.json carries request.query {id:"{id}"}, so the built query map
  // folds onto the templated path: the {id} endpoint placement is substituted +
  // encodeURIComponent-escaped (/api/abc%20123) AND the same id is appended as a
  // query pair (?id=abc%20123, value NOT double-encoded -- already escaped by
  // buildRequest). The bare templated path is no longer the bound spec.url.
  check(spec.url === '/api/abc%20123?id=abc%20123',
    'spec.url is the effective folded URL: {id} substituted+escaped in the path AND appended as ?id (no double-encode) (got ' + spec.url + ')');
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

// ---- 6b. HI-01: a SCHEMA-VALID recipe whose intentionally-open params carries
//          an unresolvable $ref (the cfworker Validator constructor THROWS on it)
//          must RETURN a typed RECIPE_SCHEMA_INVALID -- interpretRecipe must NEVER
//          throw on hostile recipe data (D-15 "The public API never throws").
//          Each params shape passes validateRecipe (params is just {type:object})
//          but would crash the param-validator construction without the try/catch.
const HOSTILE_PARAMS = [
  ['remote $ref', { '$ref': 'https://evil.example/x.json' }],
  ['broken local pointer $ref', { type: 'object', properties: { id: { '$ref': '#/does/not/exist' } } }],
  ['$dynamicRef', { '$dynamicRef': '#meta' }],
  ['$ref inside allOf array', { allOf: [{ '$ref': 'https://evil.example/y.json' }] }]
];
HOSTILE_PARAMS.forEach(function(entry) {
  const label = entry[0];
  const params = entry[1];
  // endpoint with no {var} + empty request so the params gate is the unit under test.
  const recipe = Object.assign({}, valid, { params: params, endpoint: '/api/things', request: {} });
  // Sanity: the recipe is still schema-valid (params is only asserted {type:object}).
  check(globalThis.FsbCapabilityRecipeSchema.validateRecipe(recipe).success === true,
    'HI-01 precondition: recipe with ' + label + ' params is schema-valid');
  let result;
  let threw = false;
  try {
    result = I.interpretRecipe(recipe, { id: 'x' });
  } catch (e) {
    threw = true;
  }
  check(!threw,
    'interpretRecipe does NOT throw on hostile params (' + label + ') -- never-throws contract');
  check(!threw && result && result.success === false && result.code === 'RECIPE_SCHEMA_INVALID',
    'interpretRecipe returns RECIPE_SCHEMA_INVALID on hostile params (' + label + ') (got ' + (result && result.code) + ')');
});

// ---- 6c. NI-01: prototype-shaped placement keys (__proto__ / constructor)
//          round-trip as plain OWN data in the bound spec instead of silently
//          vanishing (fillPlacementMap builds on Object.create(null)), and they
//          do NOT pollute Object.prototype. The request.query map is built via
//          JSON.parse so __proto__ is a GENUINE own key, exactly as a real
//          catalog recipe (parsed from JSON) would deliver it.
const protoRecipe = Object.assign({}, valid, {
  params: { type: 'object' },        // open params so any args bind
  endpoint: '/api/things',           // no {var} -> templater is not the gate
  request: { query: JSON.parse('{"__proto__":"x","constructor":"c","normal":"n"}') }
});
const protoResult = I.interpretRecipe(protoRecipe, {});
check(protoResult && protoResult.success === true,
  'NI-01: recipe with prototype-shaped placement keys still binds (got ' + (protoResult && protoResult.code) + ')');
if (protoResult && protoResult.success) {
  const q = protoResult.spec.query;
  check(Object.prototype.hasOwnProperty.call(q, '__proto__') && q['__proto__'] === 'x',
    'NI-01: __proto__ placement key round-trips as own data (got ' + JSON.stringify(q && q['__proto__']) + ')');
  check(Object.prototype.hasOwnProperty.call(q, 'constructor') && q['constructor'] === 'c',
    'NI-01: constructor placement key round-trips as own data');
  check(Object.prototype.hasOwnProperty.call(q, 'normal') && q['normal'] === 'n',
    'NI-01: a normal sibling key is unaffected');
  check(Object.prototype['x'] === undefined,
    'NI-01: Object.prototype is NOT polluted by the __proto__ placement value');
}

// ---- 6d. FETCH-03 (Phase 27): query-fold into spec.url + origin-pin re-assertion.
// interpretRecipe now folds the built query map into spec.url BEFORE re-asserting
// the origin against the EFFECTIVE (post-fold) target (D-09 then D-08 part 1). A
// cross-origin OR protocol-relative effective target is rejected with the typed
// RECIPE_ORIGIN_MISMATCH (dual code+errorCode) before any side effect.
//
// Reachability note: the recipe schema gates `endpoint` to a single-leading-slash,
// non-protocol-relative path and rejects an absolute/`//`-leading endpoint, and
// buildRequest encodeURIComponent-escapes every query VALUE -- so a `{var}`-injected
// absolute query value cannot survive to re-target the origin. The most reachable
// construction that still drives a SCHEMA-VALID recipe to a foreign EFFECTIVE origin
// is a single-leading-slash endpoint whose SECOND character is a backslash
// (`/\evil.com`): the schema's `^/(?!/)` guard permits it, but the WHATWG URL parser
// normalizes the backslash to a slash for special schemes, so
// `new URL('/\evil.com', origin)` re-targets to https://evil.com. This is exactly the
// effective-target escape the interpreter's pin exists to catch beyond the schema.

// (a) same-origin query folds into spec.url (value not double-encoded).
const foldRecipe = Object.assign({}, valid, {
  endpoint: '/api/{id}',
  params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  request: { query: { id: '{id}' } }
});
const foldOk = I.interpretRecipe(foldRecipe, { id: 'a b' });
check(foldOk && foldOk.success === true,
  'FETCH-03(a): same-origin recipe with a request.query placement binds (got ' + (foldOk && foldOk.code) + ')');
check(foldOk && foldOk.success === true && foldOk.spec.url === '/api/a%20b?id=a%20b',
  'FETCH-03(a): query folds onto spec.url with a ?key=value suffix, value escaped once not twice (got ' + (foldOk && foldOk.spec && foldOk.spec.url) + ')');
// fold uses & when the templated path already contains a ?.
const foldAmp = I.interpretRecipe(Object.assign({}, valid, {
  endpoint: '/api/things?fixed=1',
  params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  request: { query: { id: '{id}' } }
}), { id: 'z' });
check(foldAmp && foldAmp.success === true && foldAmp.spec.url === '/api/things?fixed=1&id=z',
  'FETCH-03(a): a templated path that already has ? gets the folded pair joined with & (got ' + (foldAmp && foldAmp.spec && foldAmp.spec.url) + ')');

// (b) cross-origin EFFECTIVE target -> RECIPE_ORIGIN_MISMATCH (no side effect).
const esBefore_xorigin = executeScriptCalls.length;
const fBefore_xorigin = fetchCalls.length;
const crossOrigin = I.interpretRecipe(Object.assign({}, valid, {
  origin: 'https://github.com',
  endpoint: '/\\evil.com',            // schema-valid single leading slash; URL parser -> https://evil.com
  params: { type: 'object' },
  request: {}
}), {});
check(crossOrigin && crossOrigin.success === false
  && crossOrigin.code === 'RECIPE_ORIGIN_MISMATCH' && crossOrigin.errorCode === 'RECIPE_ORIGIN_MISMATCH',
  'FETCH-03(b): cross-origin effective target -> RECIPE_ORIGIN_MISMATCH on both code and errorCode (got ' + (crossOrigin && crossOrigin.code) + ')');
check(executeScriptCalls.length === esBefore_xorigin && fetchCalls.length === fBefore_xorigin,
  'FETCH-03(b): cross-origin rejection fired NO executeScript and NO fetch (recorders unchanged at rejection)');

// (c) protocol-relative EFFECTIVE target -> RECIPE_ORIGIN_MISMATCH (no side effect).
// A leading slash + two backslashes normalizes to //evil.com under the URL parser.
const esBefore_proto = executeScriptCalls.length;
const fBefore_proto = fetchCalls.length;
const protoRelative = I.interpretRecipe(Object.assign({}, valid, {
  origin: 'https://github.com',
  endpoint: '/\\\\evil.com',          // -> new URL normalizes to //evil.com -> https://evil.com
  params: { type: 'object' },
  request: {}
}), {});
check(protoRelative && protoRelative.success === false && protoRelative.code === 'RECIPE_ORIGIN_MISMATCH',
  'FETCH-03(c): protocol-relative effective target -> RECIPE_ORIGIN_MISMATCH (got ' + (protoRelative && protoRelative.code) + ')');
check(executeScriptCalls.length === esBefore_proto && fetchCalls.length === fBefore_proto,
  'FETCH-03(c): protocol-relative rejection fired NO executeScript and NO fetch (recorders unchanged at rejection)');

// (d) a same-origin recipe with an EMPTY query map leaves spec.url == the bare
// templated path (effectiveUrl == templated.url; fold is a no-op).
const emptyQuery = I.interpretRecipe(Object.assign({}, valid, {
  endpoint: '/api/list', params: { type: 'object' }, request: {}
}), {});
check(emptyQuery && emptyQuery.success === true && emptyQuery.spec.url === '/api/list',
  'FETCH-03(d): empty query map -> spec.url equals the bare templated path, success (got ' + (emptyQuery && emptyQuery.spec && emptyQuery.spec.url) + ')');

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
