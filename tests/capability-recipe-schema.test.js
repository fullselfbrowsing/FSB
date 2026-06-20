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
check(M.FSB_RECIPE_SCHEMA_VERSION === 1, 'module exports FSB_RECIPE_SCHEMA_VERSION === 1');

// ---- 3. Accept: the canonical valid recipe. -------------------------------
const valid = readFixture('valid-recipe.json');
const validResult = M.validateRecipe(valid);
check(validResult && validResult.success === true,
  'valid-recipe.json -> { success: true } (got ' + JSON.stringify(validResult) + ')');

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

// ---- 8. Reject: wrong/missing schemaVersion -> RECIPE_SCHEMA_INVALID. ------
//        Constructed from the valid fixture (no dedicated fixture file).
const wrongVersion = Object.assign({}, valid, { schemaVersion: 2 });
const wrongVersionResult = M.validateRecipe(wrongVersion);
check(wrongVersionResult && wrongVersionResult.success === false && wrongVersionResult.code === 'RECIPE_SCHEMA_INVALID',
  'recipe with schemaVersion 2 -> RECIPE_SCHEMA_INVALID (got ' + (wrongVersionResult && wrongVersionResult.code) + ')');

const missingVersion = Object.assign({}, valid);
delete missingVersion.schemaVersion;
const missingVersionResult = M.validateRecipe(missingVersion);
check(missingVersionResult && missingVersionResult.success === false && missingVersionResult.code === 'RECIPE_SCHEMA_INVALID',
  'recipe missing schemaVersion -> RECIPE_SCHEMA_INVALID (got ' + (missingVersionResult && missingVersionResult.code) + ')');

// ---- 9. Typed-error contract: every rejection sets BOTH code and errorCode. -
const sample = M.validateRecipe(readFixture('reject-field-script.json'));
check(sample && sample.code === sample.errorCode && typeof sample.errorCode === 'string',
  'rejection sets both code and errorCode (errors.ts resolveErrorKey contract)');

// ---- report ----------------------------------------------------------------
console.log('  passed:', passed);
console.log('  failed:', failed);
process.exit(failed > 0 ? 1 : 0);
