(function(global) {
  'use strict';

  /**
   * Phase 26 plan 01 (v0.9.99 Native Capability Catalog) -- capability-recipe-schema.js
   *
   * The Wall-1 data spine: a versioned, CLOSED-vocabulary JSON Schema that
   * defines a capability recipe as pure DATA, plus a validateRecipe() that
   * RETURNS (never throws) a typed RECIPE_* result. This is the foundational
   * "no code fetched as data" constraint of the milestone -- a recipe is an
   * untrusted server/catalog payload crossing into the service worker, and it
   * must be rejected if it carries any out-of-vocabulary or script-like field.
   *
   * Module shell: the dual-export IIFE mirror of extension/utils/trigger-store.js
   * (open at :1-2, close at :185-200) and extension/utils/value-extractor.js
   * (the PURE, browser-API-free variant). Like value-extractor.js this module
   * OMITS any lazy chrome.* resolver -- it touches no browser API. It reads the
   * vendored validator only through a typeof-guarded global accessor (the
   * ws-client.js getFSBLZStringCodec pattern), so it loads cleanly under the
   * Node test harness where the cfworker IIFE is pre-loaded via vm.
   *
   * Locked decisions implemented here (26-CONTEXT.md):
   *   - D-06 versioned closed top-level vocabulary; additionalProperties:false
   *          at every structural object level.
   *   - D-07 the six script-like field names (script/expr/transform/code/fn/js)
   *          are actively rejected with a precise RECIPE_UNKNOWN_FIELD via a
   *          defense-in-depth pre-scan (additionalProperties:false alone yields
   *          a generic location -- Pitfall 2 -- so the pre-scan names the field).
   *   - D-08 authStrategy enum LOCKED at four members; persisted-query-hash /
   *          split-token are deferred to the Phase 29 bundled-handler head.
   *   - D-09 pagination is OUT of v1 (absent by construction).
   *   - D-10 schemaVersion envelope via FSB_RECIPE_SCHEMA_VERSION, mirroring the
   *          FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION idiom.
   *   - D-13 validation is dynamic-code-free -- @cfworker/json-schema only; this
   *          file contains ZERO dynamic-code constructs (no run-string-as-code,
   *          no function-from-string, no dynamic module loader). It is on the
   *          Plan 03 CI-guard recipe-path allowlist, which scans even comments,
   *          so the literal forbidden patterns are kept out of this source.
   *   - D-15 typed-error RETURN shape { success:false, code:'RECIPE_*', ... };
   *          both `code` and `errorCode` are set so errors.ts resolveErrorKey
   *          picks it up either way (mirrors createMcpOwnershipError).
   *
   * Validator API (verified @cfworker/json-schema@4.1.1):
   *   new CfworkerJsonSchema.Validator(schema, '2020-12', false) // emit all errors
   *   validator.validate(value) -> { valid:boolean, errors: OutputUnit[] }
   *   OutputUnit = { keyword, keywordLocation, instanceLocation, error }
   *   NB: cfworker ASSERTS format:'uri' by default in 2020-12 (verified), which
   *   is why neither `origin` nor `endpoint` uses format:'uri'. Both are gated by
   *   explicit `pattern`s instead (ME-02/ME-03): `origin` by a scheme+authority
   *   pattern (http/https, no path/query/fragment) so javascript:/ftp: and full
   *   URLs are rejected; `endpoint` by a single-leading-slash, non-protocol-
   *   relative pattern plus a `..`-traversal `not` guard (Pitfall 4).
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- Version envelope (mirror trigger-store.js:58-59) -------------------

  var FSB_RECIPE_SCHEMA_VERSION = 1;

  // ---- Forbidden script-like field names (D-07, Pitfall 2) ---------------
  //
  // additionalProperties:false rejects ALL unknown fields, but the rejection's
  // keywordLocation is identical for any stray key, so the closed-vocab error
  // cannot say WHICH forbidden field was present. This explicit list drives a
  // pre-scan that reports the offending forbidden name precisely. Per-name
  // reject fixtures (Task 3) prove each is rejected.

  var FORBIDDEN_FIELD_NAMES = ['script', 'expr', 'transform', 'code', 'fn', 'js'];

  // ---- The closed-vocabulary recipe JSON Schema (D-06) --------------------
  //
  // additionalProperties:false at the top level AND on every structural object
  // (request, csrf). `params` is the ONE intentionally-open object: it holds a
  // user-authored JSON-Schema sub-document validated against invoke args
  // downstream (Phase 28+), so its internal shape is not locked. `extract` is a
  // single read-only JMESPath string (D-14; the live read runs in Phase 27).

  var RECIPE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'id', 'origin', 'endpoint', 'method', 'authStrategy'],
    properties: {
      // Envelope version -- a JSON-Schema const equal to FSB_RECIPE_SCHEMA_VERSION (D-10).
      schemaVersion: { const: FSB_RECIPE_SCHEMA_VERSION },
      // Recipe identity. Locked to the name `id` (NOT `slug`) to match the
      // valid-recipe.json accept fixture and the downstream catalog key.
      id: { type: 'string', minLength: 1 },
      // Full origin (e.g. https://example.com). A scheme+authority pattern --
      // NOT format:'uri' -- so the scheme is constrained to http/https and the
      // value is a bare origin with NO path/query/fragment (ME-02). This rejects
      // javascript:/ftp: pseudo-schemes and https://example.com/path?x=1 (a URL,
      // not an origin). origin flows verbatim into the bound spec and becomes the
      // Phase 27 trust anchor, so the schema is the cheapest place to gate it.
      origin: { type: 'string', pattern: '^https?://[^/?#\\s]+$' },
      // Relative endpoint template (e.g. /api/{id}). Pattern, NOT format:'uri'
      // (Pitfall 4: cfworker asserts uri format and a relative path is not a uri).
      // ME-03: a SINGLE leading slash that is NOT protocol-relative (rejects
      // //evil.com, which new URL("//evil.com", origin) would re-target to a
      // different host) and forbids any '..' path segment (rejects /a/../../b
      // traversal that would escape the declared path prefix). Phase 27 must
      // STILL re-assert new URL(endpoint, origin).origin === recipe.origin; the
      // schema just refuses to hand it an obviously hostile template.
      endpoint: {
        type: 'string',
        pattern: '^/(?!/)(?:[^\\s]*)$',
        not: { pattern: '(^|/)\\.\\.(/|$)' }
      },
      // HTTP verb -- closed enum of the five v1 verbs (D-06).
      method: { enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      // Auth strategy -- LOCKED at exactly the four D-08 members.
      authStrategy: { enum: ['same-origin-cookie', 'csrf-header-scrape', 'bearer-from-storage', 'none'] },
      // Nested JSON-Schema for invoke args (intentionally open sub-document).
      params: { type: 'object' },
      // Static param->placement map. Structural -> additionalProperties:false;
      // placements query / header / body (D-06).
      request: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'object' },
          header: { type: 'object' },
          body: { type: 'object' }
        }
      },
      // Read-only JMESPath extract (single string).
      extract: { type: 'string' },
      // Optional CSRF source declaration -- pure data (selector + header name),
      // not code. Required only when authStrategy === 'csrf-header-scrape'
      // (expressed via the if/then below). Live scrape is Phase 27.
      csrf: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'header'],
        properties: {
          from: { enum: ['meta', 'cookie', 'response'] },
          selector: { type: 'string' },
          header: { type: 'string' }
        }
      }
    },
    // csrf is mandatory when (and only when) the csrf-header-scrape strategy is used.
    if: {
      properties: { authStrategy: { const: 'csrf-header-scrape' } },
      required: ['authStrategy']
    },
    then: { required: ['csrf'] }
  };

  // ---- Vendored-validator accessor (ws-client.js:98-99 pattern) -----------
  //
  // typeof-guarded so the module loads where CfworkerJsonSchema is absent
  // (returns null -> validateRecipe maps to RECIPE_SCHEMA_INVALID). The SW
  // importScripts the cfworker IIFE before this module; the Node test pre-loads
  // it via vm.runInThisContext.

  function getFSBRecipeValidator(schema, draft) {
    if (typeof CfworkerJsonSchema === 'undefined' || !CfworkerJsonSchema || !CfworkerJsonSchema.Validator) {
      return null;
    }
    return new CfworkerJsonSchema.Validator(schema, draft || '2020-12', false /* emit all errors */);
  }

  // ---- Typed error helper (mcp-tool-dispatcher.js:190-198 pattern) --------
  //
  // RETURN (never throw). Set BOTH `code` and `errorCode` so errors.ts
  // resolveErrorKey surfaces the RECIPE_* code verbatim from either field.

  function createRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  // ---- Forbidden-name pre-scan (D-07, Pitfall 2) -------------------------
  //
  // Walks the recipe's OWN top-level keys against FORBIDDEN_FIELD_NAMES and
  // returns the first offending name, or null. Top-level scan is sufficient:
  // the closed schema rejects nested unknown objects, and the forbidden names
  // are top-level recipe fields by the threat model.

  function findForbiddenField(recipe) {
    if (!recipe || typeof recipe !== 'object') { return null; }
    for (var i = 0; i < FORBIDDEN_FIELD_NAMES.length; i++) {
      var name = FORBIDDEN_FIELD_NAMES[i];
      if (Object.prototype.hasOwnProperty.call(recipe, name)) { return name; }
    }
    return null;
  }

  // ---- Offending-key extraction for additionalProperties failures --------
  //
  // For a generic unknown field, cfworker emits an OutputUnit whose
  // instanceLocation points at the offending key (e.g. '#/foo') with a
  // per-property `false` keyword. Pull that key so RECIPE_UNKNOWN_FIELD can
  // name the field. instanceLocation is a JSON Pointer like '#/foo'.

  function offendingKeyFromErrors(errors) {
    if (!errors || !errors.length) { return undefined; }
    for (var i = 0; i < errors.length; i++) {
      var e = errors[i];
      var inst = e && e.instanceLocation;
      // A per-property rejection has instanceLocation deeper than root '#'.
      if (typeof inst === 'string' && inst.length > 1 && inst.charAt(0) === '#') {
        // '#/foo' -> 'foo' ; '#/request/x' -> 'request/x' (first segment is enough).
        var seg = inst.slice(1).replace(/^\//, '');
        if (seg) { return seg.split('/')[0]; }
      }
    }
    return undefined;
  }

  // ---- validateRecipe -- the typed gate (D-15) ---------------------------
  //
  // RETURNS one of:
  //   { success:true }
  //   { success:false, code:'RECIPE_UNKNOWN_FIELD', field, ... }
  //   { success:false, code:'RECIPE_OPCODE_INVALID', ... }   (bad method/authStrategy enum)
  //   { success:false, code:'RECIPE_SCHEMA_INVALID', ... }   (bad/missing schemaVersion, structural, validator-missing)
  //
  // Mapping ORDER is load-bearing. cfworker emits a root additionalProperties
  // error ALONGSIDE an enum/const error when a KNOWN field fails its enum/const
  // (verified live). So enum/const must be classified BEFORE the generic
  // additionalProperties check, otherwise a bad method/authStrategy/schemaVersion
  // would be mis-reported as RECIPE_UNKNOWN_FIELD.

  function validateRecipe(recipe) {
    // 1. Defense-in-depth: forbidden script-like names -> name the field.
    var forbidden = findForbiddenField(recipe);
    if (forbidden) {
      return createRecipeError('RECIPE_UNKNOWN_FIELD', { field: forbidden, forbidden: true });
    }

    // 2. Validator availability.
    var validator = getFSBRecipeValidator(RECIPE_SCHEMA, '2020-12');
    if (!validator) {
      return createRecipeError('RECIPE_SCHEMA_INVALID', { error: 'validator unavailable' });
    }

    // 3. Validate against the closed schema.
    var result = validator.validate(recipe);
    if (result && result.valid) {
      return { success: true };
    }
    var errors = (result && result.errors) ? result.errors : [];

    // 4a. schemaVersion const failure -> RECIPE_SCHEMA_INVALID (version envelope).
    var versionErr = errors.find(function(e) {
      return e && typeof e.keywordLocation === 'string' &&
        /\/properties\/schemaVersion\//.test(e.keywordLocation);
    });
    if (versionErr) {
      return createRecipeError('RECIPE_SCHEMA_INVALID', {
        reason: 'schemaVersion', keywordLocation: versionErr.keywordLocation, errors: errors
      });
    }

    // 4b. method / authStrategy enum failure -> RECIPE_OPCODE_INVALID.
    var enumErr = errors.find(function(e) {
      return e && typeof e.keywordLocation === 'string' &&
        /\/properties\/(method|authStrategy)\//.test(e.keywordLocation);
    });
    if (enumErr) {
      var field = /authStrategy/.test(enumErr.keywordLocation) ? 'authStrategy' : 'method';
      return createRecipeError('RECIPE_OPCODE_INVALID', {
        field: field, keywordLocation: enumErr.keywordLocation, errors: errors
      });
    }

    // 4c. additionalProperties failure (unknown field) -> RECIPE_UNKNOWN_FIELD.
    var addlErr = errors.find(function(e) {
      return e && typeof e.keywordLocation === 'string' &&
        /additionalProperties/.test(e.keywordLocation);
    });
    if (addlErr) {
      return createRecipeError('RECIPE_UNKNOWN_FIELD', {
        field: offendingKeyFromErrors(errors),
        instanceLocation: addlErr.instanceLocation,
        errors: errors
      });
    }

    // 4d. Anything else (missing required, bad type, pattern, format, if/then) -> RECIPE_SCHEMA_INVALID.
    return createRecipeError('RECIPE_SCHEMA_INVALID', { errors: errors });
  }

  // ---- Export shape (mirror trigger-store.js:185-200) --------------------

  var exportsObj = {
    RECIPE_SCHEMA: RECIPE_SCHEMA,
    FSB_RECIPE_SCHEMA_VERSION: FSB_RECIPE_SCHEMA_VERSION,
    FORBIDDEN_FIELD_NAMES: FORBIDDEN_FIELD_NAMES,
    getFSBRecipeValidator: getFSBRecipeValidator,
    validateRecipe: validateRecipe
  };

  global.FsbCapabilityRecipeSchema = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                    // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
