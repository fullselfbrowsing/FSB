'use strict';

/**
 * Phase 26 plan 01 (v0.9.99 Native Capability Catalog) -- capability-recipe-schema
 * accept/reject suite. Proves CAP-01: the closed-vocabulary recipe JSON Schema
 * accepts a valid recipe and rejects every forbidden script-like field
 * (script/expr/transform/code/fn/js), unknown top-level fields, and bad
 * method/authStrategy enums with the correct typed RECIPE_* code.
 *
 * Zero-framework clone of tests/trigger-store.test.js (passed/failed counters,
 * synchronous check(cond,msg) per tests/ownership-error-codes.test.js,
 * process.exit(failed>0?1:0)). Touches no chrome.* -- pure schema validation.
 *
 * cfworker IIFE test-load: extension/lib/cfworker-json-schema.min.js assigns
 * `var CfworkerJsonSchema = (()=>{...})()` (a script-scope global), so a bare
 * require() will NOT populate module.exports. We evaluate it via
 * vm.runInThisContext FIRST so globalThis.CfworkerJsonSchema exists, then the
 * recipe-schema module's typeof-guarded accessor reads that global. This loader
 * is test-only and is NOT on the Plan 03 recipe-path allowlist.
 *
 * The fixtures under catalog/recipes/_fixtures/ are the single source of truth
 * shared with the Plan 03 CI guard.
 *
 * Run: node tests/capability-recipe-schema.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CFWORKER_PATH = path.join(__dirname, '..', 'extension', 'lib', 'cfworker-json-schema.min.js');
const MODULE_PATH = path.join(__dirname, '..', 'extension', 'utils', 'capability-recipe-schema.js');
const FIXTURE_DIR = path.join(__dirname, '..', 'catalog', 'recipes', '_fixtures');

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

// ---- 1. Test-load the cfworker IIFE into the global (populates the global the
//        schema module reads) BEFORE requiring the module. -------------------
vm.runInThisContext(fs.readFileSync(CFWORKER_PATH, 'utf8'));
check(typeof globalThis.CfworkerJsonSchema === 'object' && globalThis.CfworkerJsonSchema !== null,
  'cfworker IIFE test-loaded: globalThis.CfworkerJsonSchema present');
check(typeof (globalThis.CfworkerJsonSchema && globalThis.CfworkerJsonSchema.Validator) === 'function',
  'cfworker exposes CfworkerJsonSchema.Validator');

// ---- 2. Load the module under test. ---------------------------------------
const M = require(MODULE_PATH);
check(typeof M.validateRecipe === 'function', 'module exports validateRecipe');
check(typeof M.RECIPE_SCHEMA === 'object' && M.RECIPE_SCHEMA !== null, 'module exports RECIPE_SCHEMA');
check(M.FSB_RECIPE_SCHEMA_VERSION === 2, 'module exports FSB_RECIPE_SCHEMA_VERSION === 2');

// ---- 3. Accept: the canonical valid recipe. -------------------------------
//        The fixture carries schemaVersion:1. Asserting it STILL validates under
//        the Phase-32 schemaVersion enum:[1,2] is the load-bearing D-08 backward-
//        compat proof -- a persisted/bundled v1 recipe (the Phase-31 LEARNED
//        recipes carry :1) must keep validating at runtime. The fixture is NOT
//        migrated off schemaVersion:1 for exactly this reason.
const valid = readFixture('valid-recipe.json');
const validResult = M.validateRecipe(valid);
check(validResult && validResult.success === true,
  'valid-recipe.json (schemaVersion:1) STILL validates under enum:[1,2] -> { success: true } (D-08 backward-compat) (got ' + JSON.stringify(validResult) + ')');

// ---- 4. Reject: each forbidden script-like field name. --------------------
const FORBIDDEN = [
  ['reject-field-script.json', 'script'],
  ['reject-field-expr.json', 'expr'],
  ['reject-field-transform.json', 'transform'],
  ['reject-field-code.json', 'code'],
  ['reject-field-fn.json', 'fn'],
  ['reject-field-js.json', 'js']
];
FORBIDDEN.forEach(function(entry) {
  const file = entry[0];
  const fieldName = entry[1];
  const r = M.validateRecipe(readFixture(file));
  check(r && r.success === false && r.code === 'RECIPE_UNKNOWN_FIELD',
    file + ' -> RECIPE_UNKNOWN_FIELD (got code ' + (r && r.code) + ')');
  check(r && r.field === fieldName,
    file + ' names the offending forbidden field "' + fieldName + '" (got ' + (r && r.field) + ')');
});

// ---- 5. Reject: an unknown top-level field. -------------------------------
const unknown = M.validateRecipe(readFixture('reject-unknown-field.json'));
check(unknown && unknown.success === false && unknown.code === 'RECIPE_UNKNOWN_FIELD',
  'reject-unknown-field.json -> RECIPE_UNKNOWN_FIELD (got ' + (unknown && unknown.code) + ')');
check(unknown && unknown.field === 'foo',
  'reject-unknown-field.json names the offending field "foo" (got ' + (unknown && unknown.field) + ')');

// ---- 6. Reject: bad method enum -> RECIPE_OPCODE_INVALID. ------------------
const badMethod = M.validateRecipe(readFixture('reject-bad-method.json'));
check(badMethod && badMethod.success === false && badMethod.code === 'RECIPE_OPCODE_INVALID',
  'reject-bad-method.json -> RECIPE_OPCODE_INVALID (got ' + (badMethod && badMethod.code) + ')');

// ---- 7. Reject: bad authStrategy enum -> RECIPE_OPCODE_INVALID. ------------
const badAuth = M.validateRecipe(readFixture('reject-bad-authstrategy.json'));
check(badAuth && badAuth.success === false && badAuth.code === 'RECIPE_OPCODE_INVALID',
  'reject-bad-authstrategy.json -> RECIPE_OPCODE_INVALID (got ' + (badAuth && badAuth.code) + ')');

// ---- 8. schemaVersion enum gate (Phase 32, D-08: enum:[1,2]). --------------
//        The schema widened schemaVersion from const:1 to enum:[1,2]. An
//        OUT-OF-ENUM version is still rejected; a schemaVersion:2 recipe carrying
//        the new optional fields validates.
//
// 8a. Out-of-enum versions (3 and 0) -> RECIPE_SCHEMA_INVALID (an unknown version
//     is still rejected -- the enum did not open the gate to any integer).
const outOfEnum3 = M.validateRecipe(Object.assign({}, valid, { schemaVersion: 3 }));
check(outOfEnum3 && outOfEnum3.success === false && outOfEnum3.code === 'RECIPE_SCHEMA_INVALID',
  'out-of-enum schemaVersion 3 -> RECIPE_SCHEMA_INVALID (got ' + (outOfEnum3 && outOfEnum3.code) + ')');
const outOfEnum0 = M.validateRecipe(Object.assign({}, valid, { schemaVersion: 0 }));
check(outOfEnum0 && outOfEnum0.success === false && outOfEnum0.code === 'RECIPE_SCHEMA_INVALID',
  'out-of-enum schemaVersion 0 -> RECIPE_SCHEMA_INVALID (got ' + (outOfEnum0 && outOfEnum0.code) + ')');

// 8b. A schemaVersion:2 recipe carrying the new OPTIONAL fields (capturedAt +
//     expectedShape) -> success:true (the v2-with-optional-fields accept path).
const v2Inline = Object.assign({}, valid, {
  schemaVersion: 2,
  capturedAt: '2026-06-23T00:00:00.000Z',
  expectedShape: '@'
});
const v2InlineResult = M.validateRecipe(v2Inline);
check(v2InlineResult && v2InlineResult.success === true,
  'schemaVersion 2 + optional capturedAt/expectedShape -> valid (got ' + JSON.stringify(v2InlineResult) + ')');

// 8c. Lock the v2 accept path to a FIXTURE (not only an inline object): the
//     sibling valid-recipe-v2.json (schemaVersion:2 + capturedAt + expectedShape)
//     must validate. The recipe-path CI guard (Check 2) also runs every valid-*
//     fixture, so this fixture doubles as a build-time v2 accept proof.
const v2Fixture = readFixture('valid-recipe-v2.json');
const v2FixtureResult = M.validateRecipe(v2Fixture);
check(v2FixtureResult && v2FixtureResult.success === true,
  'valid-recipe-v2.json (schemaVersion:2 + capturedAt + expectedShape) -> valid (got ' + JSON.stringify(v2FixtureResult) + ')');

const missingVersion = Object.assign({}, valid);
delete missingVersion.schemaVersion;
const missingVersionResult = M.validateRecipe(missingVersion);
check(missingVersionResult && missingVersionResult.success === false && missingVersionResult.code === 'RECIPE_SCHEMA_INVALID',
  'recipe missing schemaVersion -> RECIPE_SCHEMA_INVALID (got ' + (missingVersionResult && missingVersionResult.code) + ')');

// ---- 9. Typed-error contract: every rejection sets BOTH code and errorCode. -
const sample = M.validateRecipe(readFixture('reject-field-script.json'));
check(sample && sample.code === sample.errorCode && typeof sample.errorCode === 'string',
  'rejection sets both code and errorCode (errors.ts resolveErrorKey contract)');

// ---- 10. ME-01: non-object input is normalized to a typed RECIPE_SCHEMA_INVALID
//          and NEVER throws (D-15 "RETURNS (never throws)"). The literal
//          `undefined` previously reached cfworker and threw; now it is gated up
//          front along with null / primitive / array. -------------------------
[
  ['undefined', undefined],
  ['null', null],
  ['number 42', 42],
  ['string', 'str'],
  ['array', []],
  ['boolean', true]
].forEach(function(entry) {
  const label = entry[0];
  const value = entry[1];
  let result;
  let threw = false;
  try {
    result = M.validateRecipe(value);
  } catch (e) {
    threw = true;
  }
  check(!threw,
    'validateRecipe(' + label + ') does NOT throw (no-throw contract)');
  check(!threw && result && result.success === false && result.code === 'RECIPE_SCHEMA_INVALID',
    'validateRecipe(' + label + ') -> RECIPE_SCHEMA_INVALID (got ' + (result && result.code) + ')');
});

// ---- 11. ME-02: origin is gated to a scheme+authority pattern. A javascript:
//          pseudo-scheme, an ftp: scheme, and a full URL with a path/query are
//          all rejected; a bare https origin is still accepted (valid fixture). -
[
  ['javascript:alert(1)', 'javascript: pseudo-scheme'],
  ['ftp://x', 'ftp: scheme'],
  ['https://example.com/path?x=1', 'https URL with path+query (not a bare origin)']
].forEach(function(entry) {
  const badOrigin = entry[0];
  const desc = entry[1];
  const r = M.validateRecipe(Object.assign({}, valid, { origin: badOrigin }));
  check(r && r.success === false,
    'origin "' + badOrigin + '" (' + desc + ') -> REJECTED (got ' + JSON.stringify(r && r.code) + ')');
});

// ---- 12. ME-03: endpoint is gated to a single leading slash that is not
//          protocol-relative and forbids '..' traversal. A protocol-relative
//          //evil.com and a /a/../b traversal are rejected; the valid fixture's
//          /api/{id} is still accepted. ------------------------------------
[
  ['//evil.com/x', 'protocol-relative endpoint'],
  ['/a/../b', "single '..' traversal segment"],
  ['/a/../../b', "multi '..' traversal"]
].forEach(function(entry) {
  const badEndpoint = entry[0];
  const desc = entry[1];
  const r = M.validateRecipe(Object.assign({}, valid, { endpoint: badEndpoint }));
  check(r && r.success === false,
    'endpoint "' + badEndpoint + '" (' + desc + ') -> REJECTED (got ' + JSON.stringify(r && r.code) + ')');
});

// ---- 13. A value violation on a KNOWN field classifies as RECIPE_SCHEMA_INVALID,
//          NOT RECIPE_UNKNOWN_FIELD. cfworker emits the root additionalProperties
//          error ALONGSIDE the property-subschema failure, so the classifier must
//          not mistake a bad origin/endpoint/id VALUE for an out-of-vocabulary
//          field (step 4c falls through to 4d when a property subschema failed). --
[
  ['bad origin pattern', { origin: 'javascript:alert(1)' }],
  ['endpoint traversal', { endpoint: '/a/../b' }],
  ['protocol-relative endpoint', { endpoint: '//evil.com/x' }],
  ['wrong-typed id (number)', { id: 123 }],
  ['empty id (minLength)', { id: '' }]
].forEach(function(entry) {
  const label = entry[0];
  const patch = entry[1];
  const r = M.validateRecipe(Object.assign({}, valid, patch));
  check(r && r.success === false && r.code === 'RECIPE_SCHEMA_INVALID',
    'value violation on known field (' + label + ') -> RECIPE_SCHEMA_INVALID (got ' + (r && r.code) + ')');
});

// ---- 14. A genuinely out-of-vocabulary field STILL classifies as
//          RECIPE_UNKNOWN_FIELD and names the offending key -- the 4c guard did
//          not over-reach and swallow real unknown-field detection. ------------
const stillUnknown = M.validateRecipe(Object.assign({}, valid, { notAField: 1 }));
check(stillUnknown && stillUnknown.success === false && stillUnknown.code === 'RECIPE_UNKNOWN_FIELD',
  'out-of-vocabulary field notAField -> RECIPE_UNKNOWN_FIELD (got ' + (stillUnknown && stillUnknown.code) + ')');
check(stillUnknown && stillUnknown.field === 'notAField',
  'RECIPE_UNKNOWN_FIELD names the offending field "notAField" (got ' + (stillUnknown && stillUnknown.field) + ')');

// ---- report ----------------------------------------------------------------
console.log('  passed:', passed);
console.log('  failed:', failed);
process.exit(failed > 0 ? 1 : 0);
