'use strict';

/**
 * Phase 30 plan 01 (v0.9.99 -- SIGN-01 + D-07) -- recipe-signature SECURITY contract.
 *
 * Wave 0 canary: extension/utils/capability-signature.js does NOT exist yet (Plan
 * 03 ships it). This test's OTHER dependencies -- the fixtures (Task 1) + Node
 * native Web Crypto Ed25519 -- exist TODAY, so the moment Plan 03 lands the LOCKED
 * FsbCapabilitySignature surface this test flips GREEN with no edit. Until then it
 * fails loudly on the missing require -- it NEVER silently passes (no try/catch
 * swallow; a verify spy/counter proves the bundled-exempt branch does not call
 * verify rather than asserting an absence by omission).
 *
 * LOCKED interface (30-01-PLAN.md <interfaces>):
 *   async verifyEd25519(pubKeyRaw, sigBytes, msgBytes) -> Promise<boolean>  (native-first, fail-closed)
 *   jcsCanonicalize(value) -> string  (RFC 8785 closed-shape; throws on non-integer number)
 *   async verifyRecipeEnvelope(envelope) -> Promise<{ ok, reason? }>
 *     // provenance 'bundled' -> { ok:true } EXEMPT (D-07); else canonicalize
 *     //   (recipe core + capturedAt + schemaHash, MINUS signature) and Ed25519-verify
 *   TRUSTED_PUBLIC_KEYS  // array of raw base64 keys (fixture key injected in tests)
 *
 * Sampled:
 *   - the fixture public key injected into TRUSTED_PUBLIC_KEYS,
 *   - verifyRecipeEnvelope(signed-recipe.json) -> ok:true,
 *   - verifyRecipeEnvelope(tampered-recipe.json) -> ok:false (one-byte flip caught),
 *   - a provenance:'bundled' envelope -> ok:true WITHOUT calling verifyEd25519
 *     (a verify spy/counter proves the exemption short-circuits),
 *   - a non-bundled envelope with an ABSENT signature -> ok:false (fail-closed),
 *   - jcsCanonicalize sorts keys (UTF-16 order) and throws on a non-integer number.
 *
 * Run: node tests/recipe-signature.test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const FIXTURE_DIR = path.resolve(__dirname, '..', 'catalog', 'recipes', '_fixtures', 'signature');
function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

(async () => {
  console.log('--- SIGN-01 + D-07 recipe-signature (canary; RED until Plan 03) ---');

  const SIG_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'capability-signature.js');
  const Sig = require(SIG_PATH);

  check(typeof Sig === 'object' && Sig, 'capability-signature module loads (require)');
  check(typeof Sig.verifyEd25519 === 'function', 'exports verifyEd25519');
  check(typeof Sig.jcsCanonicalize === 'function', 'exports jcsCanonicalize');
  check(typeof Sig.verifyRecipeEnvelope === 'function', 'exports verifyRecipeEnvelope');
  check(Array.isArray(Sig.TRUSTED_PUBLIC_KEYS), 'exports TRUSTED_PUBLIC_KEYS (array)');

  // ---- jcsCanonicalize: UTF-16 key sort + integer-only number tripwire ----
  if (typeof Sig.jcsCanonicalize === 'function') {
    const canon = Sig.jcsCanonicalize({ b: 1, a: 'x', c: true });
    check(canon === '{"a":"x","b":1,"c":true}', 'jcsCanonicalize sorts keys (UTF-16 code-unit order)');
    let threw = false;
    try { Sig.jcsCanonicalize({ n: 1.5 }); } catch (_e) { threw = true; }
    check(threw, 'jcsCanonicalize throws on a non-integer number (closed-vocabulary tripwire)');
  }

  // ---- inject the fixture public key into TRUSTED_PUBLIC_KEYS ----
  const pub = readFixture('fixture-public-key.json');
  check(typeof pub.publicKey === 'string' && pub.publicKey.length > 0, 'fixture public key is a base64 string');
  if (Array.isArray(Sig.TRUSTED_PUBLIC_KEYS) && Sig.TRUSTED_PUBLIC_KEYS.indexOf(pub.publicKey) === -1) {
    Sig.TRUSTED_PUBLIC_KEYS.push(pub.publicKey);
  }

  // ---- signed envelope verifies; tampered envelope does not ----
  const signed = readFixture('signed-recipe.json');
  const tampered = readFixture('tampered-recipe.json');

  const signedRes = await Sig.verifyRecipeEnvelope(signed);
  check(signedRes && signedRes.ok === true, 'verifyRecipeEnvelope(signed) -> ok:true');

  const tamperedRes = await Sig.verifyRecipeEnvelope(tampered);
  check(tamperedRes && tamperedRes.ok === false, 'verifyRecipeEnvelope(tampered) -> ok:false (one-byte flip caught)');

  // ---- provenance 'bundled' is EXEMPT and does NOT call verifyEd25519 (D-07) ----
  // Wrap verifyEd25519 with a counting spy. The bundled branch must short-circuit
  // BEFORE any verify call.
  const realVerify = Sig.verifyEd25519;
  let verifyCalls = 0;
  Sig.verifyEd25519 = async function () { verifyCalls += 1; return realVerify.apply(this, arguments); };
  const bundled = { recipe: signed.recipe, provenance: 'bundled' }; // no signature at all
  const bundledRes = await Sig.verifyRecipeEnvelope(bundled);
  check(bundledRes && bundledRes.ok === true, 'verifyRecipeEnvelope(bundled) -> ok:true (provenance exemption, D-07)');
  check(verifyCalls === 0, 'bundled-provenance envelope did NOT call verifyEd25519 (exemption short-circuits)');

  // ---- non-bundled with ABSENT signature -> fail-closed ----
  verifyCalls = 0;
  const noSig = { recipe: signed.recipe, provenance: 'server', capturedAt: signed.capturedAt, schemaHash: signed.schemaHash };
  const noSigRes = await Sig.verifyRecipeEnvelope(noSig);
  check(noSigRes && noSigRes.ok === false, 'non-bundled envelope with ABSENT signature -> ok:false (fail-closed)');
  Sig.verifyEd25519 = realVerify; // restore

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('recipe-signature.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
