(function(global) {
  'use strict';

  /**
   * Phase 30 plan 03 (v0.9.99 -- SIGN-01, SIGN-02; D-05/D-06/D-07/D-08) --
   * capability-signature.js
   *
   * The recipe INTEGRITY verifier: native-first Ed25519 over a deterministic
   * JCS (RFC 8785) canonical form of the recipe provenance envelope. Reached
   * from interpretRecipe (capability-interpreter.js) AFTER schema-validate and
   * BEFORE bind for NON-bundled recipes; first-party bundled recipes are
   * exempt-by-provenance (D-07) so the working Phase-29 head is untouched.
   *
   * Module shell: the dual-export IIFE mirror of capability-interpreter.js (the
   * PURE, browser-API-free variant). It touches NO browser API beyond the
   * Web-Crypto global (globalThis.crypto.subtle, a service-worker + Node global),
   * reached only through a typeof-guarded accessor so the module loads cleanly
   * under the Node test harness. The service worker reads
   * globalThis.FsbCapabilitySignature after importScripts.
   *
   * Wall-1 discipline (named capability-* so the recipe-path guard Check 4 disk
   * glob AUTO-covers it, and it is on RECIPE_PATH_ALLOWLIST): this file is
   * dynamic-code-FREE. It contains ZERO run-string-as-code / function-from-string
   * / dynamic module loader constructs, even in comments (the guard scans
   * comments). No network fetch of a key -- the trusted public key(s) ship as a
   * bundled constant (Wall-1; D-08). The private signer is offline/CI (Phase 31).
   *
   * Locked decisions implemented here (30-CONTEXT.md / 30-03-PLAN.md):
   *   - D-05 Ed25519 verify over the JCS canonical form; "Lattice receipt" = the
   *          provenance-envelope shape, the actual verify is Web Crypto.
   *   - D-07 provenance 'bundled' -> { ok:true } WITHOUT a verify call (the
   *          exemption short-circuits BEFORE verifyEd25519 is reached).
   *   - D-08 trusted public key(s) are a bundled constant (TRUSTED_PUBLIC_KEYS);
   *          a fixture key is injected by tests via _setTrustedKeysForTest.
   *   - RESEARCH Pattern 1 (tri-state native feature-detect + native verify +
   *          FAIL-CLOSED when native Ed25519 is absent -- never "assume valid").
   *   - RESEARCH Pattern 2 (the in-house RFC-8785 closed-shape serializer with
   *          the UTF-16 key sort + integer-only number throw). Its bytes are
   *          byte-for-byte identical to catalog/recipes/_fixtures/signature/
   *          sign-fixtures.mjs (the signer and the verifier MUST agree).
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- typeof-guarded Web-Crypto accessor ---------------------------------
  //
  // Returns the SubtleCrypto-bearing crypto object, or null when absent so the
  // verify path can FAIL CLOSED rather than throw (Pitfall 1).

  function getSubtleCrypto() {
    var c = (typeof globalThis !== 'undefined' && globalThis.crypto) ? globalThis.crypto : null;
    if (!c || !c.subtle || typeof c.subtle.importKey !== 'function' || typeof c.subtle.verify !== 'function') {
      return null;
    }
    return c;
  }

  // ---- In-house JCS canonical serializer (RFC 8785 closed-shape) ----------
  //
  // VERBATIM byte-twin of the fixture signer (sign-fixtures.mjs jcsCanonicalize).
  // Valid ONLY because the recipe vocabulary is closed: all values are strings,
  // enums, a const integer (schemaVersion=1), booleans, or shallow string
  // objects. No floats, no large integers, no non-BMP keys -> the RFC's hard
  // cases never arise. JavaScript's default Array.prototype.sort() on strings IS
  // UTF-16 code-unit order, the exact RFC 8785 sec 3.2.3 requirement, so no
  // custom comparator is needed. The THROW on a non-integer/non-finite number is
  // the closed-vocabulary tripwire: if the recipe shape ever gains a float the
  // canonicalizer fails LOUDLY rather than emitting a non-deterministic string.

  function jcsCanonicalize(value) {
    if (value === null) { return 'null'; }
    var t = typeof value;
    if (t === 'string' || t === 'boolean') { return JSON.stringify(value); }
    if (t === 'number') {
      if (!Number.isFinite(value) || !Number.isInteger(value)) {
        throw new Error('JCS: non-integer number outside closed recipe vocabulary');
      }
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      var items = [];
      for (var i = 0; i < value.length; i++) {
        items.push(jcsCanonicalize(value[i]));
      }
      return '[' + items.join(',') + ']';
    }
    if (t === 'object') {
      var keys = Object.keys(value).sort(); // default sort = UTF-16 code-unit order
      var parts = [];
      for (var k = 0; k < keys.length; k++) {
        parts.push(JSON.stringify(keys[k]) + ':' + jcsCanonicalize(value[keys[k]]));
      }
      return '{' + parts.join(',') + '}';
    }
    throw new Error('JCS: unserializable value');
  }

  // ---- base64 -> Uint8Array (no DOM atob dependency) ----------------------
  //
  // Decodes a standard base64 string to raw bytes. Uses Buffer under Node and
  // atob in the browser; both are present in their respective runtimes. Returns
  // null on any decode failure so the caller can FAIL CLOSED.

  function base64ToBytes(b64) {
    if (typeof b64 !== 'string' || b64.length === 0) { return null; }
    try {
      if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
        return new Uint8Array(Buffer.from(b64, 'base64'));
      }
      if (typeof atob === 'function') {
        var bin = atob(b64);
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
        return out;
      }
    } catch (_e) {
      return null;
    }
    return null;
  }

  // ---- UTF-8 string -> Uint8Array -----------------------------------------

  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      return new Uint8Array(Buffer.from(str, 'utf8'));
    }
    // No encoder available -> empty bytes (verify will fail closed downstream).
    return new Uint8Array(0);
  }

  // ---- Native Ed25519 feature-detect (Pattern 1) --------------------------
  //
  // Tri-state cache: null = unknown, true/false = detected. A no-op raw import
  // of a 32-byte zero key (a valid raw Ed25519 public-key length) is the cheapest
  // reliable probe; importKey rejects with NotSupportedError on pre-137 Chrome
  // where Ed25519 is unregistered. The probe runs ONCE; the result is cached.

  var _ed25519Native = null;

  async function _detectNativeEd25519() {
    if (_ed25519Native !== null) { return _ed25519Native; }
    var c = getSubtleCrypto();
    if (!c) { _ed25519Native = false; return false; }
    try {
      await c.subtle.importKey('raw', new Uint8Array(32), { name: 'Ed25519' }, false, ['verify']);
      _ed25519Native = true;
    } catch (_e) {
      _ed25519Native = false;
    }
    return _ed25519Native;
  }

  // ---- verifyEd25519 (native-first, FAIL CLOSED) --------------------------
  //
  // Returns a boolean and NEVER throws. With native crypto.subtle Ed25519
  // present it imports the raw key and verifies; with native Ed25519 absent it
  // returns false (FAIL CLOSED -> RECIPE_SIGNATURE_INVALID), never "assume
  // valid" (Pitfall 1 / T-30-11). The pure-JS fallback verifier is DEFERRED to
  // Phase 31 (RESEARCH Open Question 2); this is the seam where it would slot,
  // but the absent-verifier posture here is fail-closed by design, so deferring
  // it cannot weaken the gate -- only bundled recipes (exempt, D-07) would be
  // unaffected, never a non-bundled one.

  async function verifyEd25519(pubKeyRaw, sigBytes, msgBytes) {
    if (!pubKeyRaw || !sigBytes || !msgBytes) { return false; }
    var native = await _detectNativeEd25519();
    if (!native) { return false; } // fail closed: no native verifier (fallback deferred to Phase 31)
    var c = getSubtleCrypto();
    if (!c) { return false; }
    try {
      var key = await c.subtle.importKey('raw', pubKeyRaw, { name: 'Ed25519' }, false, ['verify']);
      return await c.subtle.verify({ name: 'Ed25519' }, key, sigBytes, msgBytes);
    } catch (_e) {
      return false; // any import/verify error -> fail closed
    }
  }

  // ---- Trusted public keys (bundled constant; D-08) -----------------------
  //
  // Array of base64 raw Ed25519 public keys shipped IN the extension bundle
  // (Wall-1: never remotely fetched). Phase 30 ships an EMPTY publish set -- the
  // real publish key lands with the Phase-31 signer. Tests inject the fixture
  // public key via _setTrustedKeysForTest (or by pushing onto this array). A
  // non-bundled recipe with NO trusted key matching its signature fails closed.

  var TRUSTED_PUBLIC_KEYS = [];

  function _setTrustedKeysForTest(keys) {
    // Replace the contents in place so callers holding the array reference (the
    // tests push onto Sig.TRUSTED_PUBLIC_KEYS directly) see the same instance.
    TRUSTED_PUBLIC_KEYS.length = 0;
    if (Array.isArray(keys)) {
      for (var i = 0; i < keys.length; i++) {
        if (typeof keys[i] === 'string' && keys[i].length > 0) {
          TRUSTED_PUBLIC_KEYS.push(keys[i]);
        }
      }
    }
  }

  // ---- verifyRecipeEnvelope (provenance-aware, FAIL CLOSED) ---------------
  //
  // Envelope (LOCKED -- the "Lattice receipt" provenance shape, D-05/D-07):
  //   { recipe:<schema-valid recipe core>, provenance:'bundled'|'server'|'learned',
  //     signature?:base64, capturedAt?:string, schemaHash?:string }
  //
  // Signed payload (LOCKED -- byte-identical to sign-fixtures.mjs): the JCS
  // canonical form of { recipe:<core>, capturedAt, schemaHash } -- i.e. the
  // recipe core PLUS capturedAt and schemaHash, EXCLUDING the signature field
  // (Pitfall 3). The signature signs THESE bytes; verifying re-canonicalizes the
  // same object and Ed25519-verifies the signature against each trusted key.
  //
  //   provenance === 'bundled' -> { ok:true } WITHOUT calling verifyEd25519 (D-07)
  //   else: missing signature/key OR verify false -> { ok:false, reason } (FAIL CLOSED)

  async function verifyRecipeEnvelope(envelope) {
    if (!envelope || typeof envelope !== 'object') {
      return { ok: false, reason: 'envelope-missing' };
    }

    // D-07 exemption: bundled provenance is trusted-by-provenance. Short-circuit
    // BEFORE any verify call so the exemption is observable (the test spies on
    // verifyEd25519 and asserts a zero call count on this path).
    if (envelope.provenance === 'bundled') {
      return { ok: true };
    }

    // Non-bundled: a signature is REQUIRED. Absent -> fail closed.
    if (typeof envelope.signature !== 'string' || envelope.signature.length === 0) {
      return { ok: false, reason: 'signature-absent' };
    }

    // A recipe core is required to reconstruct the signed payload.
    if (!envelope.recipe || typeof envelope.recipe !== 'object') {
      return { ok: false, reason: 'recipe-missing' };
    }

    // At least one trusted key must be available, or there is nothing to verify
    // against -> fail closed (a non-bundled recipe must NOT bind without a key).
    if (!Array.isArray(TRUSTED_PUBLIC_KEYS) || TRUSTED_PUBLIC_KEYS.length === 0) {
      return { ok: false, reason: 'no-trusted-key' };
    }

    // Reconstruct the EXACT signed payload (recipe core + capturedAt +
    // schemaHash, MINUS the signature field) and canonicalize to bytes. This
    // object literal's key set + ordering is irrelevant -- jcsCanonicalize sorts
    // keys deterministically -- but the FIELD SET must match the signer exactly.
    var signedPayload = {
      recipe: envelope.recipe,
      capturedAt: envelope.capturedAt,
      schemaHash: envelope.schemaHash
    };

    var msgBytes;
    try {
      msgBytes = utf8Bytes(jcsCanonicalize(signedPayload));
    } catch (e) {
      // A non-integer number (or otherwise out-of-vocab value) in the payload
      // trips the canonicalizer's tripwire -> treat as a verification failure.
      return { ok: false, reason: 'canonicalize-failed' };
    }

    var sigBytes = base64ToBytes(envelope.signature);
    if (!sigBytes) {
      return { ok: false, reason: 'signature-decode-failed' };
    }

    // Try each trusted key; the first that verifies wins. verifyEd25519 is
    // fail-closed and never throws, so a bad/absent verifier yields { ok:false }.
    for (var i = 0; i < TRUSTED_PUBLIC_KEYS.length; i++) {
      var pubBytes = base64ToBytes(TRUSTED_PUBLIC_KEYS[i]);
      if (!pubBytes) { continue; }
      // Re-read the (possibly test-spied) verifyEd25519 off the export object so
      // a test wrapper installed on the module surface is observed.
      var verifyFn = (exportsObj && typeof exportsObj.verifyEd25519 === 'function')
        ? exportsObj.verifyEd25519 : verifyEd25519;
      var ok = await verifyFn(pubBytes, sigBytes, msgBytes);
      if (ok === true) {
        return { ok: true };
      }
    }

    return { ok: false, reason: 'signature-invalid' };
  }

  // ---- Export shape (dual-export IIFE; mirror capability-interpreter.js) ----

  var exportsObj = {
    verifyEd25519: verifyEd25519,
    jcsCanonicalize: jcsCanonicalize,
    verifyRecipeEnvelope: verifyRecipeEnvelope,
    TRUSTED_PUBLIC_KEYS: TRUSTED_PUBLIC_KEYS,
    _setTrustedKeysForTest: _setTrustedKeysForTest
  };

  global.FsbCapabilitySignature = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                 // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
