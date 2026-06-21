'use strict';

/**
 * Phase 30 plan 01 (v0.9.99 -- SIGN-02) -- interpreter signature-hook RED contract.
 *
 * Wave 0 RED test: the signature-verify hook is NOT yet wired inside
 * interpretRecipe (Plan 03, D-06: AFTER schema-validate, BEFORE bind). It turns
 * GREEN when Plan 03 adds the hook + ships capability-signature.js. It fails
 * loudly today (the tampered envelope is NOT yet rejected with
 * RECIPE_SIGNATURE_INVALID) and NEVER silently passes.
 *
 * SIGN-02 / D-06 sampled behaviors (observable, threading-agnostic so Plan 03 may
 * choose exactly how the envelope's provenance/signature reach interpretRecipe):
 *   (a) a NON-bundled TAMPERED envelope -> RECIPE_SIGNATURE_INVALID,
 *   (b) hook order: a SCHEMA-INVALID recipe still returns its SCHEMA error (not the
 *       signature error) -- the verify hook fires AFTER schema-validate,
 *   (c) a bundled / no-meta recipe binds WITHOUT a verify call (provenance exempt),
 *   (d) a NON-bundled correctly-SIGNED envelope binds (success) -- the hook does
 *       not over-block a valid signature.
 *
 * Loader: the cfworker IIFE via vm.runInThisContext (it assigns a script-scope
 * global) + require the schema/auth/interpreter modules, the
 * capability-interpreter.test.js idiom. The fixture public key is injected into
 * the (Plan-03) FsbCapabilitySignature.TRUSTED_PUBLIC_KEYS. This loader is
 * test-only and NOT on the recipe-path allowlist.
 *
 * Run: node tests/recipe-signature-interpreter-hook.test.js
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
const SIG_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-signature.js');
const FIXTURE_DIR = path.join(REPO_ROOT, 'catalog', 'recipes', '_fixtures', 'signature');

function readSigFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

(async () => {
  console.log('--- SIGN-02 interpreter signature hook (RED until Plan 03) ---');

  // 1. Test-load cfworker + the schema/auth/interpreter modules (always present).
  vm.runInThisContext(fs.readFileSync(CFWORKER_PATH, 'utf8'));
  require(SCHEMA_PATH);
  require(AUTH_PATH);
  const I = require(INTERP_PATH);
  check(typeof I.interpretRecipe === 'function', 'interpreter exports interpretRecipe');

  // 2. Load the Plan-03 signature module (Wave-0 RED: absent today -> require
  //    throws -> caught below as the loud RED state). NOT swallowed silently.
  const Sig = require(SIG_PATH);
  check(typeof Sig.verifyRecipeEnvelope === 'function', 'capability-signature exports verifyRecipeEnvelope (RED until Plan 03)');

  // Inject the fixture public key so a correctly-signed envelope can verify.
  const pub = readSigFixture('fixture-public-key.json');
  if (Array.isArray(Sig.TRUSTED_PUBLIC_KEYS) && Sig.TRUSTED_PUBLIC_KEYS.indexOf(pub.publicKey) === -1) {
    Sig.TRUSTED_PUBLIC_KEYS.push(pub.publicKey);
  }

  const signed = readSigFixture('signed-recipe.json');
  const tampered = readSigFixture('tampered-recipe.json');

  // (a) a NON-bundled TAMPERED envelope -> RECIPE_SIGNATURE_INVALID
  const tRes = await I.interpretRecipe(tampered, {});
  check(tRes && (tRes.code === 'RECIPE_SIGNATURE_INVALID' || tRes.errorCode === 'RECIPE_SIGNATURE_INVALID'),
    'non-bundled tampered envelope -> RECIPE_SIGNATURE_INVALID (hook rejects before bind)');

  // (b) hook order: a SCHEMA-INVALID recipe returns its SCHEMA error, NOT the sig
  //     error (the verify hook fires AFTER schema-validate). Use a non-bundled
  //     envelope whose recipe core violates the schema (bad method).
  const schemaBad = {
    recipe: Object.assign({}, signed.recipe, { method: 'TRACE' }), // TRACE is not in the verb enum
    provenance: 'server',
    capturedAt: signed.capturedAt,
    schemaHash: signed.schemaHash,
    signature: signed.signature
  };
  const sbRes = await I.interpretRecipe(schemaBad, {});
  check(sbRes && sbRes.success !== true, 'schema-invalid envelope is rejected');
  check(sbRes && (sbRes.code === 'RECIPE_METHOD_INVALID' || (typeof sbRes.code === 'string' && sbRes.code.indexOf('RECIPE_') === 0 && sbRes.code !== 'RECIPE_SIGNATURE_INVALID')),
    'schema-invalid envelope returns its SCHEMA error, NOT RECIPE_SIGNATURE_INVALID (hook is AFTER schema-validate)');

  // (c) a bundled / no-meta recipe binds WITHOUT a verify call (provenance exempt).
  let verifyCalls = 0;
  if (typeof Sig.verifyEd25519 === 'function') {
    const realVerify = Sig.verifyEd25519;
    Sig.verifyEd25519 = async function () { verifyCalls += 1; return realVerify.apply(this, arguments); };
  }
  // A bare recipe core (no provenance envelope) is the bundled/no-meta path.
  const bareRes = await I.interpretRecipe(signed.recipe, {});
  check(bareRes && bareRes.success === true, 'a bare/bundled recipe core binds (success) -- provenance exempt');
  check(verifyCalls === 0, 'bundled/no-meta recipe did NOT call verifyEd25519 (exemption short-circuits)');

  // (d) a NON-bundled correctly-SIGNED envelope binds (the hook does not over-block).
  const okRes = await I.interpretRecipe(signed, {});
  check(okRes && okRes.success === true, 'non-bundled correctly-signed envelope binds (valid signature is not over-blocked)');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('recipe-signature-interpreter-hook.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
