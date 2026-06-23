'use strict';

/**
 * Phase 32 Plan 01 (v0.9.99 Native Capability Catalog -- Self-Healing Fallback) --
 * recipe schema-lock unit suite (HEAL-05 / INV-01, D-14). Freezes the v2
 * RECIPE_SCHEMA hash (the contract between bundled recipes, learned recipes, and the
 * interpreter) AND re-asserts the frozen tool-definitions registry hash. Any drift
 * to either reds the build.
 *
 * WAVE 0 split (the correct Wave 0 state):
 *   - FSB_RECIPE_SCHEMA_VERSION === 2 RED-s TODAY (it is 1 until Plan 02 bumps it
 *     additively, D-08).
 *   - The v2 RECIPE_SCHEMA hash is a CLEARLY-MARKED placeholder -- the schema does
 *     not exist in v2 form yet, so the hash cannot be known now. Plan 04 computes it
 *     once at first green and pastes the real digest over the placeholder.
 *   - The frozen TOOL registry hash (ad6efb8c...) re-assertion can pass TODAY (this
 *     plan touches no production tool definitions; INV-01 holds by construction).
 *
 * The hash mechanism (stable + sha256) is cloned VERBATIM from
 * tests/tool-definitions-parity.test.js:54-69; tests/visual-session-schema-lock.test
 * .js is the second structural-lock clone template. The cfworker IIFE is preloaded
 * the way tests/capability-recipe-schema.test.js does, in case the schema module
 * needs the validator global at load.
 *
 * Zero-framework FSB convention: module-level passed/failed counters,
 * check(cond,msg), process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/recipe-schema-lock.test.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const CFWORKER_PATH = path.join(REPO_ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js');
const SCHEMA_MODULE_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-recipe-schema.js');
const TOOL_DEFS_PATH = path.join(REPO_ROOT, 'mcp', 'ai', 'tool-definitions.cjs');

// The INV-01 frozen tool-definitions registry lock -- reused verbatim from
// tests/tool-definitions-parity.test.js:52 / capability-mcp-surface.test.js. The
// recipe-rot work must NOT move this (no tool-definitions edit this phase).
const EXPECTED_NON_TRIGGER_REGISTRY_HASH =
  'ad6efb8cc3275d964488b67222129b1c0278c5c3b69c64888d926beb89a3926b';

// The four trigger tools sit IN TOOL_REGISTRY but are excluded from the frozen
// non-trigger baseline (mirrors tool-definitions-parity.test.js:35/132).
const TRIGGER_TOOL_NAMES = ['trigger', 'stop_trigger', 'get_trigger_status', 'list_triggers'];

// ---- The FROZEN v2 RECIPE_SCHEMA hash (D-14). Computed ONCE at first green from the
//      LIVE v2 RECIPE_SCHEMA (FSB_RECIPE_SCHEMA_VERSION === 2 with the optional
//      capturedAt + expectedShape fields added additively in Plan 02) via the SAME
//      stable() + sha256 schemaHash used below, then pasted here verbatim (Plan 04,
//      independently re-computed and cross-checked against the digest the Plan-02
//      suite printed). The recipe schema is the contract between the bundled recipes,
//      the Phase-31 learned recipes, and the interpreter; this digest LOCKS the closed
//      vocab -- any drift to the schema's fields, required list, enum members, or
//      additionalProperties:false posture reds this gate (the build fails so a vocab
//      change cannot land silently). To intentionally evolve the schema, bump the
//      version and re-freeze this digest in the same deliberate one-shot manner.
const FROZEN_RECIPE_SCHEMA_V2_HASH =
  'f35211f524639f4b9611edb973b1eaf94f24769fbaff205e3c658914fd622a37';

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

// Recursive key-sort stringify -- copied verbatim from
// tool-definitions-parity.test.js:54-63.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce(function (out, key) {
      out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}

function schemaHash(schema) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(stable(schema)))
    .digest('hex');
}

function registryHash(tools) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(tools.map(stable)))
    .digest('hex');
}

// ---- Preload the cfworker IIFE so the recipe-schema module's typeof-guarded
//      validator accessor finds CfworkerJsonSchema at load (the same loader
//      capability-recipe-schema.test.js:55 uses). Then require the module.
vm.runInThisContext(fs.readFileSync(CFWORKER_PATH, 'utf8'));
const FsbCapabilityRecipeSchema = require(SCHEMA_MODULE_PATH);

// ===========================================================================
// (1) The v2 schema version (D-08, additive). The version was bumped 1 -> 2 in
//     Plan 02 with capturedAt + expectedShape added optionally so v1 stays valid.
// ===========================================================================
console.log('\n--- (1) FSB_RECIPE_SCHEMA_VERSION === 2 (D-08, additive) ---');
check(FsbCapabilityRecipeSchema.FSB_RECIPE_SCHEMA_VERSION === 2,
  'D-08: FSB_RECIPE_SCHEMA_VERSION === 2 (additive v1 -> v2; v1 recipes still validate) -- got '
    + JSON.stringify(FsbCapabilityRecipeSchema.FSB_RECIPE_SCHEMA_VERSION));

// ===========================================================================
// (2) The FROZEN v2 RECIPE_SCHEMA hash (HEAL-05 / INV-01, D-14). GREEN once the
//     real digest is frozen (Plan 04): the live v2 schema must hash to the frozen
//     constant. Any drift to the closed vocab reds this gate.
// ===========================================================================
console.log('\n--- (2) frozen v2 RECIPE_SCHEMA hash (HEAL-05 / INV-01) ---');
const actualSchemaHash = schemaHash(FsbCapabilityRecipeSchema.RECIPE_SCHEMA);
check(actualSchemaHash === FROZEN_RECIPE_SCHEMA_V2_HASH,
  'INV-01/D-14: schemaHash(RECIPE_SCHEMA) === the frozen v2 hash (the closed-vocab recipe contract is locked)');
if (actualSchemaHash !== FROZEN_RECIPE_SCHEMA_V2_HASH) {
  console.error('  DIAG: frozen  ' + FROZEN_RECIPE_SCHEMA_V2_HASH);
  console.error('  DIAG: actual  ' + actualSchemaHash + '  <- the v2 schema vocab drifted; if intentional, bump the version and re-freeze this digest deliberately');
}

// ===========================================================================
// (3) The frozen TOOL-definitions registry hash is UNMOVED (INV-01). This half can
//     pass TODAY -- this plan touches no production tool definitions.
// ===========================================================================
console.log('\n--- (3) frozen tool-definitions registry hash unmoved (INV-01) ---');
const td = require(TOOL_DEFS_PATH);
const nonTriggerTools = td.TOOL_REGISTRY.filter(function (tool) {
  return TRIGGER_TOOL_NAMES.indexOf(tool.name) < 0;
});
const actualRegistryHash = registryHash(nonTriggerTools);
check(actualRegistryHash === EXPECTED_NON_TRIGGER_REGISTRY_HASH,
  'INV-01: the frozen non-trigger tool registry hash ad6efb8cc3275d964488b67222129b1c0278c5c3b69c64888d926beb89a3926b is unmoved (no tool-definitions edit this phase)');
if (actualRegistryHash !== EXPECTED_NON_TRIGGER_REGISTRY_HASH) {
  console.error('  DIAG: expected ' + EXPECTED_NON_TRIGGER_REGISTRY_HASH);
  console.error('  DIAG: actual   ' + actualRegistryHash);
  console.error('  DIAG: a moved tool registry hash means a tool definition drifted (INV-01 violation)');
}

console.log('  passed:', passed);
console.log('  failed:', failed);
process.exit(failed > 0 ? 1 : 0);
