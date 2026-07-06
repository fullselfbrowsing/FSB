#!/usr/bin/env node
/**
 * Phase 30 / Plan 01 (v0.9.99 -- SIGN-01, D-08) -- reproducible signature-fixture
 * generator. Emits the three artifacts the recipe-signature tests consume:
 *
 *   - fixture-public-key.json : { publicKey: <base64 raw Ed25519 public key> }
 *   - signed-recipe.json      : a valid provenance envelope with a correct signature
 *   - tampered-recipe.json     : a byte-identical-signature copy whose recipe core
 *                                differs by exactly ONE character (verify MUST fail)
 *
 * SIGNED-PAYLOAD SCOPE (LOCKED -- Plan 03 binds to this identical contract):
 *   the recipe core fields PLUS capturedAt PLUS schemaHash, MINUS the signature
 *   field itself. Canonicalized via the in-house JCS serializer below, which is a
 *   byte-for-byte copy of the RFC-8785 closed-shape logic Plan 03 ships in
 *   extension/utils/capability-signature.js (jcsCanonicalize). The fixture signer
 *   and the runtime verifier MUST agree on these exact bytes, so the serializer is
 *   duplicated here verbatim rather than imported (the runtime module does not
 *   exist yet in Wave 0).
 *
 * Crypto: Node globalThis.crypto.subtle natively supports Ed25519 generateKey /
 * sign / verify (Node >= 16), so this runs zero-dependency in plain Node -- the
 * same native Web Crypto path the Chrome 137+ runtime uses (30-RESEARCH
 * Test-harness note). No chrome stub is needed for crypto.
 *
 * This script is test tooling under catalog/recipes/_fixtures/ -- it is NOT shipped
 * runtime and is NOT on the recipe-path allowlist (it is an .mjs in the fixtures
 * tree, exactly like the reject-*.json fixtures are test data).
 *
 * Run: node catalog/recipes/_fixtures/signature/sign-fixtures.mjs
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Node exposes Ed25519 under webcrypto.subtle; alias to the same shape the SW
// reads as globalThis.crypto.subtle.
const subtle = webcrypto.subtle;

// ---- In-house JCS serializer (RFC 8785 closed-shape) -----------------------
//
// VERBATIM copy of the Plan 03 runtime serializer (capability-signature.js
// jcsCanonicalize). Valid ONLY because the recipe vocabulary is closed: all
// values are strings, enums, a const integer (schemaVersion=1), booleans, or
// shallow string objects. No floats, no large integers, no non-BMP keys -> the
// RFC's hard cases never arise. JavaScript's default Array.prototype.sort() on
// strings IS UTF-16 code-unit order, the exact RFC 8785 sec 3.2.3 requirement.
function jcsCanonicalize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return JSON.stringify(value);
  if (t === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error('JCS: non-integer number outside closed recipe vocabulary');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(jcsCanonicalize).join(',') + ']';
  }
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    const parts = [];
    for (let i = 0; i < keys.length; i++) {
      parts.push(JSON.stringify(keys[i]) + ':' + jcsCanonicalize(value[keys[i]]));
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error('JCS: unserializable value');
}

function toBase64(uint8) {
  return Buffer.from(uint8).toString('base64');
}

function utf8Bytes(str) {
  return new Uint8Array(Buffer.from(str, 'utf8'));
}

async function sha256Hex(str) {
  const digest = await subtle.digest('SHA-256', utf8Bytes(str));
  return Buffer.from(new Uint8Array(digest)).toString('hex');
}

// ---- Build the SIGNED PAYLOAD --------------------------------------------
//
// The signed payload object = recipe core + capturedAt + schemaHash, MINUS the
// signature field. Plan 03 reconstructs this exact object from the envelope and
// re-canonicalizes it to verify. Keep the recipe core schema-valid: based on
// valid-github-notifications.json (schemaVersion 1, a same-origin-cookie GET).
function buildSignedPayload(recipe, capturedAt, schemaHash) {
  return {
    recipe: recipe,
    capturedAt: capturedAt,
    schemaHash: schemaHash
  };
}

(async () => {
  // 1. Generate an Ed25519 keypair (extractable so we can export the raw key).
  const keyPair = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);

  // 2. The schema-valid recipe core (additionalProperties:false; required
  //    schemaVersion/id/origin/endpoint/method/authStrategy). Mirrors
  //    valid-github-notifications.json.
  const recipe = {
    schemaVersion: 1,
    id: 'github.notifications.signed',
    origin: 'https://github.com',
    endpoint: '/notifications',
    method: 'GET',
    authStrategy: 'same-origin-cookie',
    extract: '@'
  };

  // 3. Integrity metadata. schemaHash is the sha-256 hex of the canonical recipe
  //    core (SIGN-02). capturedAt is a fixed ISO string for reproducibility.
  const capturedAt = '2026-06-21T00:00:00.000Z';
  const schemaHash = await sha256Hex(jcsCanonicalize(recipe));

  // 4. Canonicalize the SIGNED PAYLOAD (recipe core + capturedAt + schemaHash,
  //    MINUS signature) and sign the canonical bytes.
  const signedPayload = buildSignedPayload(recipe, capturedAt, schemaHash);
  const canonical = jcsCanonicalize(signedPayload);
  const sigBuf = await subtle.sign({ name: 'Ed25519' }, keyPair.privateKey, utf8Bytes(canonical));
  const signatureB64 = toBase64(new Uint8Array(sigBuf));

  // 5. Export the raw public key (base64).
  const rawPub = await subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyB64 = toBase64(new Uint8Array(rawPub));

  // 6. The full signed envelope: provenance 'server' (non-bundled -> the verify
  //    gate applies, D-07). signature is OUTSIDE the signed payload.
  const signedEnvelope = {
    recipe: recipe,
    provenance: 'server',
    capturedAt: capturedAt,
    schemaHash: schemaHash,
    signature: signatureB64
  };

  // 7. The tampered copy: flip exactly ONE character of one signed field
  //    (recipe.endpoint) while leaving the signature byte-identical. The
  //    canonical bytes now differ from what was signed -> verify MUST fail.
  const tamperedRecipe = Object.assign({}, recipe, { endpoint: '/notificationz' });
  const tamperedEnvelope = {
    recipe: tamperedRecipe,
    provenance: 'server',
    capturedAt: capturedAt,
    schemaHash: schemaHash,
    signature: signatureB64
  };

  // 8. Self-check: verify the signed envelope passes and the tampered one fails,
  //    using the SAME native Web Crypto path the runtime uses. This makes the
  //    script a self-proving fixture generator (it never emits a fixture that
  //    would not behave as the tests expect).
  const importedPub = await subtle.importKey('raw', new Uint8Array(rawPub), { name: 'Ed25519' }, false, ['verify']);
  const signedOk = await subtle.verify(
    { name: 'Ed25519' }, importedPub,
    Buffer.from(signatureB64, 'base64'),
    utf8Bytes(jcsCanonicalize(buildSignedPayload(recipe, capturedAt, schemaHash)))
  );
  const tamperedOk = await subtle.verify(
    { name: 'Ed25519' }, importedPub,
    Buffer.from(signatureB64, 'base64'),
    utf8Bytes(jcsCanonicalize(buildSignedPayload(tamperedRecipe, capturedAt, schemaHash)))
  );
  if (!signedOk) throw new Error('self-check: signed envelope failed to verify (signer/verifier disagree)');
  if (tamperedOk) throw new Error('self-check: tampered envelope unexpectedly verified (one-byte flip not detected)');

  // 9. Write the three artifacts (stable 2-space JSON for diff-readable fixtures).
  writeFileSync(resolve(__dirname, 'fixture-public-key.json'), JSON.stringify({ publicKey: publicKeyB64 }, null, 2) + '\n');
  writeFileSync(resolve(__dirname, 'signed-recipe.json'), JSON.stringify(signedEnvelope, null, 2) + '\n');
  writeFileSync(resolve(__dirname, 'tampered-recipe.json'), JSON.stringify(tamperedEnvelope, null, 2) + '\n');

  console.log('sign-fixtures: wrote fixture-public-key.json, signed-recipe.json, tampered-recipe.json');
  console.log('  signed verify=' + signedOk + ' tampered verify=' + tamperedOk + ' (expected true/false)');
})().catch((err) => {
  console.error('sign-fixtures FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
