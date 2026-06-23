'use strict';

/**
 * Phase 31 plan 01 (v0.9.99 -- D-09 / HI-01) -- 'local' provenance exemption RED
 * contract. Mirrors tests/recipe-signature-interpreter-hook.test.js:97-127.
 *
 * Wave 0 RED test: the 'local' trusted-provenance exemption is NOT yet wired (Wave 4
 * adds 'local' alongside 'bundled' in BOTH capability-signature.js verifyRecipeEnvelope
 * and capability-interpreter.js interpretRecipe -- RESEARCH Pattern 5). TODAY a
 * loader-vouched {trustedProvenance:'local'} ENVELOPE is NOT exempt: it falls through
 * to the signature verify path, so a 'local'-vouched (unsigned/tampered) core is
 * REJECTED and verifyEd25519 IS called. The "binds WITHOUT a verify call" assertion
 * therefore FAILS LOUD today (the RED) and turns GREEN only when Wave 4 ships the
 * 'local' short-circuit. NEVER silently passes.
 *
 * D-09 / HI-01 sampled behavior:
 *   (1) a loader-vouched {trustedProvenance:'local'} envelope BINDS (success:true)
 *       WITHOUT a verifyEd25519 call (verifyCalls === 0) -- the 'local' exemption
 *       short-circuits before verify (parallel to the 'bundled' exemption).
 *   (2) HI-01: a recipe payload SELF-ASSERTING provenance:'local' with NO trusted
 *       vouch (opts omitted) is STILL verified -- a tampered core is rejected with
 *       RECIPE_SIGNATURE_INVALID. A payload cannot self-declare 'local' to dodge
 *       verify (the trust comes ONLY from the loader's opts.trustedProvenance).
 *
 * Loader: the cfworker IIFE via vm.runInThisContext + require schema/auth/interpreter/
 * signature (the recipe-signature-interpreter-hook.test.js loader). The fixture
 * public key is injected so a correctly-signed envelope can verify.
 *
 * Zero-framework: passed/failed + check(cond,msg) + process.exit(failed>0?1:0).
 *
 * Run: node tests/learned-local-provenance-exempt.test.js
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
  console.log("--- D-09/HI-01 'local' provenance exemption (RED until Wave 4) ---");

  // Test-load cfworker + the schema/auth/interpreter modules (always present).
  vm.runInThisContext(fs.readFileSync(CFWORKER_PATH, 'utf8'));
  require(SCHEMA_PATH);
  require(AUTH_PATH);
  const I = require(INTERP_PATH);
  check(typeof I.interpretRecipe === 'function', 'interpreter exports interpretRecipe');

  const Sig = require(SIG_PATH);
  check(typeof Sig.verifyRecipeEnvelope === 'function', 'capability-signature exports verifyRecipeEnvelope');

  // Inject the fixture public key so a correctly-signed envelope can verify.
  const pub = readSigFixture('fixture-public-key.json');
  if (Array.isArray(Sig.TRUSTED_PUBLIC_KEYS) && Sig.TRUSTED_PUBLIC_KEYS.indexOf(pub.publicKey) === -1) {
    Sig.TRUSTED_PUBLIC_KEYS.push(pub.publicKey);
  }

  const signed = readSigFixture('signed-recipe.json');
  const tampered = readSigFixture('tampered-recipe.json');

  // ---- (1) a loader-vouched 'local' envelope binds WITHOUT a verify call (D-09) ----
  // Spy verifyEd25519: count calls. The 'local' exemption MUST short-circuit before it.
  let verifyCalls = 0;
  let realVerify = null;
  if (typeof Sig.verifyEd25519 === 'function') {
    realVerify = Sig.verifyEd25519;
    Sig.verifyEd25519 = async function () { verifyCalls += 1; return realVerify.apply(this, arguments); };
  }

  // Use the TAMPERED full envelope as the 'local' candidate: even a tampered core
  // binds when the LOADER vouches it as 'local' -- that is the exemption working as
  // designed (the loader vouches for locally-synthesized recipes, parallel to the
  // 'bundled' on-disk exemption). This is RED today (no 'local' short-circuit ->
  // it falls to verify -> tampered core REJECTED + verifyCalls > 0).
  const localRes = await I.interpretRecipe(tampered, {}, { trustedProvenance: 'local' });
  check(localRes && localRes.success === true,
    "a loader-vouched {trustedProvenance:'local'} envelope BINDS (success:true) -- the D-09 exemption (RED until Wave 4)");
  check(verifyCalls === 0,
    "the 'local' exemption short-circuits BEFORE any verifyEd25519 call (verifyCalls === 0, D-09)");

  if (realVerify) { Sig.verifyEd25519 = realVerify; } // restore

  // ---- (2) HI-01: a payload self-asserting provenance:'local' with NO vouch is STILL verified ----
  // Build an envelope whose OWN data says provenance:'local' but pass NO trusted
  // provenance (opts omitted). The interpreter must IGNORE the embedded label and
  // verify -- so the tampered core is rejected with RECIPE_SIGNATURE_INVALID. A
  // payload cannot self-declare 'local' to dodge verify.
  const masqueradeLocal = {
    recipe: tampered.recipe,        // the one-byte-tampered core
    provenance: 'local',            // SELF-ASSERTED in the payload -- must NOT be honored
    capturedAt: tampered.capturedAt,
    schemaHash: tampered.schemaHash,
    signature: tampered.signature
  };
  const mlRes = await I.interpretRecipe(masqueradeLocal, {});
  check(mlRes && (mlRes.code === 'RECIPE_SIGNATURE_INVALID' || mlRes.errorCode === 'RECIPE_SIGNATURE_INVALID'),
    "HI-01: a payload self-asserting provenance:'local' (no trusted vouch) is STILL verified -> tampered core rejected (cannot self-declare 'local')");

  // ---- (2b) a correctly-signed envelope self-asserting 'local' is verified (binds via signature, not the label) ----
  let verifyCalls2 = 0;
  let realVerify2 = null;
  if (typeof Sig.verifyEd25519 === 'function') {
    realVerify2 = Sig.verifyEd25519;
    Sig.verifyEd25519 = async function () { verifyCalls2 += 1; return realVerify2.apply(this, arguments); };
    const signedSelfLocal = Object.assign({}, signed, { provenance: 'local' });
    const sslRes = await I.interpretRecipe(signedSelfLocal, {});
    Sig.verifyEd25519 = realVerify2; // restore
    check(sslRes && sslRes.success === true,
      "HI-01: a correctly-signed envelope self-asserting 'local' still binds (via the signature, not the label)");
    check(verifyCalls2 > 0,
      "HI-01: the self-asserted 'local' envelope WAS verified (verifyEd25519 called -- the label did not short-circuit)");
  }

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('learned-local-provenance-exempt.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
