'use strict';

/**
 * Phase 1 (v0.10.0-attempt-2) -- Lattice integration smoke test.
 *
 * Purpose: prove FSB consumes Lattice end-to-end via the public npm package.
 * Mints ONE Capability Receipt with an ephemeral Ed25519 keypair, verifies
 * the envelope round-trip, asserts the verified body fields match what was
 * signed. No persistence, no shared state -- the keypair is generated per
 * test run and discarded when the process exits.
 *
 * Coverage:
 *   - CONTEXT.md D-10 (mint one receipt via Lattice's public receipt surface)
 *   - CONTEXT.md D-12 #2 (Node smoke check -- the substantive proof)
 *   - INV-06 (the primitive lives in Lattice; FSB just consumes)
 *
 * Run: node tests/lattice-smoke.test.js
 */

const assert = require('node:assert/strict');
const { EXPECTED_PUBLIC_LATTICE } = require('./helpers/lattice-public-pin.js');

let passed = 0;
let failed = 0;

function passAssert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function passAssertEqual(actual, expected, msg) {
  passAssert(
    actual === expected,
    msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')'
  );
}

(async () => {
  console.log('\n--- Public Lattice smoke: mint + verify one Capability Receipt ---');

  // Dynamic ESM import -- Lattice is "type": "module"; FSB's test convention
  // is CJS. Node 16+ supports dynamic import() from CJS to ESM.
  let lattice;
  try {
    lattice = await import('lattice');
  } catch (err) {
    console.error('  FAIL: dynamic import("lattice") threw:', err && err.message ? err.message : err);
    console.error('         If you see ERR_MODULE_NOT_FOUND, did you run npm install?');
    process.exit(1);
  }

  // Surface presence checks -- prove the bare specifier resolves to Lattice's
  // public surface, and the symbols we need are reachable.
  passAssertEqual(typeof lattice.createReceipt, 'function', 'lattice.createReceipt is a function');
  passAssertEqual(typeof lattice.verifyReceipt, 'function', 'lattice.verifyReceipt is a function');
  passAssertEqual(typeof lattice.createInMemorySigner, 'function', 'lattice.createInMemorySigner is a function');
  passAssertEqual(typeof lattice.generateEd25519KeyPairJwk, 'function', 'lattice.generateEd25519KeyPairJwk is a function');
  passAssertEqual(typeof lattice.createMemoryKeySet, 'function', 'lattice.createMemoryKeySet is a function');

  if (failed > 0) {
    // Bail early -- the round-trip below will throw if a function is missing.
    console.log('\nLattice smoke: surface presence check failed; aborting before round-trip.');
    console.log('passed:', passed, 'failed:', failed);
    process.exit(1);
  }

  // Step 1: generate an ephemeral Ed25519 keypair via Lattice's WebCrypto wrapper.
  // No private material is persisted -- the keys live only in this process.
  const { privateKeyJwk, publicKeyJwk } = await lattice.generateEd25519KeyPairJwk();
  passAssert(privateKeyJwk && typeof privateKeyJwk === 'object', 'generateEd25519KeyPairJwk returned a privateKeyJwk object');
  passAssert(publicKeyJwk && typeof publicKeyJwk === 'object', 'generateEd25519KeyPairJwk returned a publicKeyJwk object');
  passAssertEqual(privateKeyJwk.kty, 'OKP', 'privateKeyJwk.kty is OKP (Ed25519)');
  passAssertEqual(privateKeyJwk.crv, 'Ed25519', 'privateKeyJwk.crv is Ed25519');

  // Step 2: build an in-memory signer keyed by the ephemeral private JWK.
  const signer = lattice.createInMemorySigner(privateKeyJwk, {
    kid: 'fsb-phase-1-smoke-key',
    publicKeyJwk: publicKeyJwk
  });
  passAssertEqual(signer.kid, 'fsb-phase-1-smoke-key', 'signer.kid round-trips through createInMemorySigner');
  passAssertEqual(typeof signer.sign, 'function', 'signer.sign is a function');

  // Step 3: mint one receipt against a stubbed capability + route + usage.
  // The stub values exercise the redact-canonicalize-sign-encode pipeline
  // without simulating any specific provider integration. costUsd is 0
  // (allowed; usageToCanonical converts to string "0" or null per I-JSON).
  let envelope;
  try {
    envelope = await lattice.createReceipt(
      {
        runId: 'fsb-phase-1-smoke-run',
        model: { requested: 'fsb-smoke-stub-model', observed: null },
        route: {
          providerId: 'fsb-smoke',
          capabilityId: 'fsb-smoke/round-trip',
          attemptNumber: 1
        },
        // Receipt training-lineage field (TrainingClass enum). Asserting
        // it round-trips proves the published runtime carries modelClass on the
        // signed body, not merely in its type surface.
        modelClass: 'frontier_rlhf',
        usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
        contractVerdict: 'success',
        contractHash: null,
        inputHashes: [],
        outputHash: null
      },
      signer
    );
  } catch (err) {
    console.error('  FAIL: createReceipt threw:', err && err.message ? err.message : err);
    process.exit(1);
  }

  // Step 4: assert the envelope shape matches Lattice's documented DSSE form.
  passAssertEqual(
    envelope.payloadType,
    'application/vnd.lattice.receipt+json',
    'envelope.payloadType is the Lattice receipt media type'
  );
  passAssert(typeof envelope.payload === 'string' && envelope.payload.length > 0, 'envelope.payload is a non-empty string');
  passAssert(Array.isArray(envelope.signatures), 'envelope.signatures is an array');
  passAssertEqual(envelope.signatures.length, 1, 'envelope has exactly one signature');
  passAssertEqual(envelope.signatures[0].keyid, 'fsb-phase-1-smoke-key', 'envelope.signatures[0].keyid matches signer.kid');
  passAssert(
    typeof envelope.signatures[0].sig === 'string' && envelope.signatures[0].sig.length > 0,
    'envelope.signatures[0].sig is a non-empty base64 string'
  );

  // Step 5: verify the envelope round-trips through Lattice's verifier.
  const keySet = lattice.createMemoryKeySet([
    { kid: 'fsb-phase-1-smoke-key', publicKeyJwk: publicKeyJwk, state: 'active' }
  ]);
  const result = await lattice.verifyReceipt(envelope, keySet);
  passAssert(result && typeof result === 'object', 'verifyReceipt returned an object');
  passAssertEqual(result.ok, true, 'verifyReceipt result.ok is true (round-trip successful)');

  if (result.ok === true) {
    passAssertEqual(result.body.version, EXPECTED_PUBLIC_LATTICE.receiptVersion, 'verified body.version matches public Lattice receipt schema');
    passAssertEqual(result.body.kid, 'fsb-phase-1-smoke-key', 'verified body.kid round-trips');
    passAssertEqual(result.body.runId, 'fsb-phase-1-smoke-run', 'verified body.runId round-trips');
    passAssertEqual(result.body.contractVerdict, 'success', 'verified body.contractVerdict round-trips');
    passAssertEqual(result.body.route.providerId, 'fsb-smoke', 'verified body.route.providerId round-trips');
    passAssertEqual(result.body.route.capabilityId, 'fsb-smoke/round-trip', 'verified body.route.capabilityId round-trips');
    passAssertEqual(result.body.route.attemptNumber, 1, 'verified body.route.attemptNumber round-trips');
    passAssertEqual(result.body.modelClass, 'frontier_rlhf', 'verified body.modelClass round-trips (receipt training-lineage field)');
    passAssertEqual(result.keyState, 'active', 'verified keyState is active');
  } else {
    failed++;
    console.error('  FAIL: result.ok was not true; result.error =', JSON.stringify(result.error));
  }

  // Step 6: negative round-trip -- a keyset with a different public key
  // MUST cause verifyReceipt to fail with a typed error (never throws).
  const wrongPair = await lattice.generateEd25519KeyPairJwk();
  const wrongKeySet = lattice.createMemoryKeySet([
    { kid: 'fsb-phase-1-smoke-key', publicKeyJwk: wrongPair.publicKeyJwk, state: 'active' }
  ]);
  const wrongResult = await lattice.verifyReceipt(envelope, wrongKeySet);
  passAssertEqual(wrongResult.ok, false, 'verifyReceipt with wrong public key returns ok: false (no throw)');
  if (wrongResult.ok === false) {
    passAssertEqual(
      wrongResult.error.kind,
      'signature-invalid',
      'verifyReceipt error.kind is signature-invalid when the public key does not match'
    );
  }

  console.log('\n--- Summary ---');
  console.log('passed:', passed);
  console.log('failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Smoke harness uncaught error:', err && err.stack ? err.stack : err);
  process.exit(1);
});
