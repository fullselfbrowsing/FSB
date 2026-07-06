(function(global) {
  'use strict';

  /**
   * Phase 26 plan 02 (v0.9.99 Native Capability Catalog) -- capability-auth-strategies.js
   *
   * The closed, frozen auth-strategy handler registry: the Wall-1
   * "enum -> bundled behavior" rule made concrete. A recipe selects a handler by
   * its authStrategy enum id; it NEVER carries handler logic. Each handler is a
   * SPEC-SHAPING STUB that, given the in-progress bound request spec, RETURNS a
   * new spec describing what the (future) Phase 27 authenticated MAIN-world
   * request will need -- and performs NO I/O of any kind here (D-12): no network
   * request, no browser-API call, no DOM read. The cookie-carrying request and
   * the live CSRF scrape are Phase 27 (FETCH-01/02).
   *
   * Module shell: the dual-export IIFE mirror of extension/utils/value-extractor.js
   * (the PURE, browser-API-free variant) and extension/utils/trigger-store.js
   * (open at :1-2, close at the tail). Like value-extractor.js this module OMITS
   * any lazy browser-API resolver -- it touches no browser API. The Node test
   * harness re-requires it through module.exports; the service worker reads the
   * global FsbCapabilityAuthStrategies after importScripts.
   *
   * Locked decisions implemented here (26-CONTEXT.md):
   *   - D-08 the four authStrategy enum members (none, same-origin-cookie,
   *          bearer-from-storage, csrf-header-scrape) are the EXACT registry keys.
   *   - D-12 handlers are header/spec-shaping stubs ONLY -- they declare the need
   *          (credentials / a bearer auth-need marker / a csrfSource descriptor);
   *          they perform no I/O.
   *   - D-15 bindAuthStrategy RETURNS (never throws) the typed RECIPE_OPCODE_INVALID
   *          shape for an unknown strategy (defense-in-depth beyond the schema
   *          enum); BOTH `code` and `errorCode` are set so errors.ts
   *          resolveErrorKey surfaces it either way (mirrors createMcpOwnershipError).
   *
   * Allowlist note: this file is on the Plan 03 CI-guard recipe-path allowlist,
   * which scans even comments and strings for dynamic-code constructs, so this
   * source is kept free of run-string-as-code / function-from-string / dynamic
   * module loader patterns. It is pure spec-shaping data flow.
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- The frozen four-member auth-strategy registry (D-08 / D-12) --------
  //
  // Each value is an object with a shape(spec, recipe) method that RETURNS A NEW
  // spec (never mutates its input -- the caller's base spec is left intact). The
  // returned additions are DECLARATIONS the Phase 27 request layer consumes;
  // nothing is executed here.
  //
  //   none                 -> the spec is returned unchanged (anonymous request).
  //   same-origin-cookie   -> declares credentials:'include' so Phase 27's
  //                           MAIN-world request attaches first-party cookies.
  //   bearer-from-storage  -> declares an _authNeed marker; Phase 27 reads the
  //                           bearer token from storage and sets the header.
  //   csrf-header-scrape   -> declares a csrfSource descriptor (where to read the
  //                           token from and which header to send it as), taken
  //                           from the recipe's optional csrf field with a safe
  //                           meta-tag default. The live scrape is Phase 27.

  var AUTH_HANDLERS = Object.freeze({
    'none': {
      shape: function(spec) {
        return spec;
      }
    },
    'same-origin-cookie': {
      shape: function(spec) {
        return Object.assign({}, spec, { credentials: 'include' });
      }
    },
    'bearer-from-storage': {
      shape: function(spec) {
        return Object.assign({}, spec, { _authNeed: { kind: 'bearer', source: 'storage' } });
      }
    },
    'csrf-header-scrape': {
      shape: function(spec, recipe) {
        var csrfSource = (recipe && recipe.csrf)
          ? recipe.csrf
          : { from: 'meta', selector: 'meta[name=csrf-token]', header: 'X-CSRF-Token' };
        return Object.assign({}, spec, { csrfSource: csrfSource });
      }
    }
  });

  // ---- Typed error helper (mcp-tool-dispatcher.js:190-198 pattern) --------
  //
  // RETURN (never throw). Set BOTH `code` and `errorCode` so the downstream
  // errors.ts resolveErrorKey surfaces the RECIPE_* code verbatim from either
  // field.

  function createRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  // ---- bindAuthStrategy -- enum -> bundled-stub dispatch (D-12 / D-15) ----
  //
  // Looks up the handler for `strategy` in the frozen registry. An unknown
  // strategy (one the schema enum would also reject -- this is defense in depth)
  // RETURNS the typed RECIPE_OPCODE_INVALID shape naming the offending field and
  // value. Otherwise returns the handler's shaped spec.

  function bindAuthStrategy(strategy, spec, recipe) {
    var handler = (typeof strategy === 'string' && Object.prototype.hasOwnProperty.call(AUTH_HANDLERS, strategy))
      ? AUTH_HANDLERS[strategy]
      : null;
    if (!handler) {
      return createRecipeError('RECIPE_OPCODE_INVALID', { field: 'authStrategy', value: strategy });
    }
    return handler.shape(spec, recipe);
  }

  // ---- Export shape (mirror value-extractor.js:218-229) -------------------

  var exportsObj = {
    AUTH_HANDLERS: AUTH_HANDLERS,
    bindAuthStrategy: bindAuthStrategy
  };

  global.FsbCapabilityAuthStrategies = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                       // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
