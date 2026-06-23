(function(global) {
  'use strict';

  /**
   * Phase 32 plan 02 (v0.9.99 Native Capability Catalog -- Self-Healing Fallback
   * + Recipe-Rot) -- capability-rot-detector.js
   *
   * The single genuinely-new module of Phase 32: a PURE, dynamic-code-FREE
   * classifier that reads the executeBoundSpec normalized result (built by
   * capability-fetch.js: success :377-384, failure :336/:356/:359, origin-pin
   * :293) and the bound recipe, and returns the HEAL-04 taxonomy the router acts
   * on AFTER a fetch. It executes nothing, mutates nothing, and logs nothing -- it
   * is a data classifier, so it sits on the recipe-path allowlist and is ASCII-only
   * and free of any dynamic-code construct even inside comments and strings.
   *
   * Module shell: the dual-export IIFE mirror of capability-catalog.js:312-326 and
   * capability-recipe-schema.js:301-316 -- build a module-scope exportsObj and
   * publish it on globalThis (SW importScripts consumer) and module.exports (Node
   * require), each typeof-guarded.
   *
   * Locked decisions implemented here (32-CONTEXT.md / 32-RESEARCH.md):
   *   - D-01 / HEAL-04 taxonomy: classifyRecipeBroken distinguishes
   *       broken (4xx/5xx, fetch-failed, expectedShape-mismatch) vs
   *       logged-out (redirected:true -> RECIPE_LOGGED_OUT, surfaced NOT healed) vs
   *       legitimate-no-results (200 + valid shape + empty-but-present container ->
   *       NOT broken, returned VERBATIM). The "empty-but-present = real result" line
   *       is load-bearing: a real no-results outcome is NEVER masked as a rot.
   *   - T-32-PASS / Pitfall 3: a dual-field RECIPE_* security rejection
   *       (RECIPE_ORIGIN_MISMATCH / RECIPE_CONSENT_*) classifies as NOT broken
   *       (typed-passthrough) -- a security rejection must NEVER be healed away. The
   *       passthrough branch runs BEFORE the generic fetch-failed branch, so a pin/
   *       consent rejection short-circuits.
   *   - D-05 / D-06 / HEAL-02: validateExpectedShape reuses the SAME read-path
   *       engine the recipe's `extract` field already runs (the vendored jmespath
   *       global, reached via FsbCapabilityInterpreter.getFSBJmespath()). The
   *       assertion is CONSERVATIVE -- structural invariants only, NEVER exact
   *       values -- and an ABSENT engine degrades to shape-passes (no false
   *       RECIPE_EXPIRED), because the DOM fallback is the real backstop.
   *   - T-32-LEAK / V7: this module reads result.data / result.status /
   *       result.redirected but NEVER logs a body or text. No console.* of any
   *       response payload. Any future diagnostic must route through a redactor
   *       (wired in plan 03 where logging lands).
   *   - D-16: dynamic-code-free; on the recipe-path allowlist (Check 4 auto-globs
   *       capability-*.js and Check 1 scans even comments). This source contains
   *       ZERO run-string-as-code / function-from-string / dynamic-module-load
   *       constructs.
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- Read-path engine accessor (mirror capability-fetch.js:362-375) --------
  //
  // validateExpectedShape must run the recipe's expectedShape through the EXACT
  // same vendored read-path engine the `extract` field already runs, so the
  // structural assertion and the live read agree. Prefer the interpreter's
  // typeof-guarded getFSBJmespath() (the canonical accessor); fall back to the
  // lowercase `jmespath` global the SW importScripts publishes (and the Node test
  // sets as globalThis.jmespath). Returns null when no engine is reachable -- the
  // caller then degrades to shape-passes (D-06, conservative).

  function getReadPathEngine() {
    if (typeof FsbCapabilityInterpreter !== 'undefined'
        && FsbCapabilityInterpreter
        && typeof FsbCapabilityInterpreter.getFSBJmespath === 'function') {
      var fromInterp = FsbCapabilityInterpreter.getFSBJmespath();
      if (fromInterp && typeof fromInterp.search === 'function') { return fromInterp; }
    }
    if (typeof jmespath !== 'undefined' && jmespath && typeof jmespath.search === 'function') {
      return jmespath;
    }
    return null;
  }

  // ---- validateExpectedShape -- the conservative structural predicate ---------
  //
  // HEAL-02 / D-06. Assert ONLY that the recipe's expectedShape read PATH resolves
  // to a PRESENT container of the expected kind -- NEVER that any value is non-
  // empty. The "present" predicate (RESEARCH Open Question 1, the load-bearing
  // HEAL-04 line):
  //
  //   - resolved !== null && resolved !== undefined  -> PRESENT.
  //   - an EMPTY array or EMPTY object that the path resolves to is a REAL empty
  //     result -> PRESENT (returns true). A genuine "0 results" outcome is shape-
  //     intact and MUST NOT be a false RECIPE_EXPIRED that masks the real result.
  //   - a missing path / null / undefined / wrong-kind body (e.g. a login-HTML
  //     STRING where the path needed a container) -> NOT present (returns false).
  //
  // Engine-absent degrade: if no read-path engine is reachable, return true
  // (conservative -- a missing engine must not produce a flood of false
  // RECIPE_EXPIRED; the DOM fallback is the backstop, D-06).
  //
  // V7: NEVER log `data`, the resolved value, or any body here.

  function validateExpectedShape(data, expectedShape) {
    if (typeof expectedShape !== 'string' || !expectedShape) {
      // No assertion to make -> nothing fails the shape (conservative).
      return true;
    }
    var engine = getReadPathEngine();
    if (!engine) {
      // No read-path engine: degrade to shape-passes (D-06). Do NOT manufacture a
      // RECIPE_EXPIRED just because the engine is missing.
      return true;
    }
    var resolved;
    try {
      resolved = engine.search(data, expectedShape);
    } catch (shapeErr) {
      // A read-path evaluation failure is treated CONSERVATIVELY as shape-passes:
      // an engine throw is not evidence of recipe rot (it is an engine/path edge),
      // and the backstop is the DOM fallback, not a false-positive RECIPE_EXPIRED.
      return true;
    }
    // PRESENT predicate: any non-null/undefined value -- INCLUDING an empty array
    // or empty object -- is a present container of the expected kind (a real,
    // possibly-empty, result). null / undefined (missing path, wrong-kind body
    // that does not resolve, explicit null) is NOT present.
    return resolved !== null && resolved !== undefined;
  }

  // ---- classifyRecipeBroken -- the HEAL-04 decision table (D-01) --------------
  //
  // RETURNS { broken:boolean, code:string|null, reason:string }. The router reads
  // `broken` (fall back to DOM when true) and `code` (the typed reason to surface).
  // The ORDER of the branches is load-bearing:
  //   0. non-object result            -> broken RECIPE_EXPIRED (no-result).
  //   1. typed RECIPE_* security fail  -> NOT broken (typed-passthrough) -- BEFORE
  //                                       the generic fetch-failed branch so a pin/
  //                                       consent rejection is never healed away
  //                                       (T-32-PASS / Pitfall 3).
  //   2. generic success:false         -> broken RECIPE_EXPIRED (fetch-failed).
  //   3. redirected:true               -> NOT broken, RECIPE_LOGGED_OUT (surfaced,
  //                                       not healed) -- the load-bearing logged-out
  //                                       line (D-01).
  //   4. status >= 400                 -> broken RECIPE_HTTP_5XX / RECIPE_HTTP_4XX.
  //   5. expectedShape present + fails -> broken RECIPE_EXPIRED (expectedShape-
  //                                       mismatch). A present-but-empty container
  //                                       PASSES here (real no-results, never
  //                                       masked).
  //   6. otherwise                     -> NOT broken (ok: success or legitimate
  //                                       no-results, returned verbatim).
  //
  // V7: reads result.status / result.redirected / result.data but NEVER logs them.

  function classifyRecipeBroken(result, recipe) {
    if (!result || typeof result !== 'object') {
      return { broken: true, code: 'RECIPE_EXPIRED', reason: 'no-result' };
    }

    // 1. Typed security rejection passthrough -- NOT a rot, NEVER a fallback. Must
    //    run BEFORE the generic success:false branch (Pitfall 3, T-32-PASS).
    if (result.success === false
        && typeof result.code === 'string'
        && /^RECIPE_/.test(result.code)) {
      return { broken: false, code: null, reason: 'typed-passthrough' };
    }

    // 2. Any other failure to obtain a page result is a rot (fetch-failed).
    if (result.success === false) {
      return { broken: true, code: 'RECIPE_EXPIRED', reason: 'fetch-failed' };
    }

    // success === true from here.

    // 3. A redirect-to-login is LOGGED-OUT, surfaced verbatim, NOT healed.
    if (result.redirected === true) {
      return { broken: false, code: 'RECIPE_LOGGED_OUT', reason: 'redirect-to-login' };
    }

    // 4. An HTTP error status is a rot (route to fallback).
    var status = result.status;
    if (typeof status === 'number' && status >= 400) {
      return {
        broken: true,
        code: (status >= 500 ? 'RECIPE_HTTP_5XX' : 'RECIPE_HTTP_4XX'),
        reason: 'http-' + status
      };
    }

    // 5. expectedShape gate (conservative): only a MISSING path / null / wrong-kind
    //    body is a rot. A present-but-empty container of the expected kind is a REAL
    //    empty result and PASSES (never masked).
    if (recipe && typeof recipe.expectedShape === 'string' && recipe.expectedShape) {
      if (!validateExpectedShape(result.data, recipe.expectedShape)) {
        return { broken: true, code: 'RECIPE_EXPIRED', reason: 'expectedShape-mismatch' };
      }
    }

    // 6. Success or legitimate no-results -> NOT broken (returned verbatim).
    return { broken: false, code: null, reason: 'ok' };
  }

  // ---- Export shape (dual-export IIFE; mirror capability-catalog.js:312-326) ---

  var exportsObj = {
    classifyRecipeBroken: classifyRecipeBroken,
    validateExpectedShape: validateExpectedShape
  };

  global.FsbCapabilityRotDetector = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                   // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
