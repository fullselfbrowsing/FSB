(function(global) {
  'use strict';

  /**
   * Phase 26 plan 02 (v0.9.99 Native Capability Catalog) -- capability-interpreter.js
   *
   * The Wall-1 / Wall-2 seam: the fixed, dynamic-code-free interpreter that turns
   * a validated recipe + invoke args into a bound, ready-to-execute request spec
   * { url, method, headers, body, authStrategy, csrfSource?, origin, extract } --
   * and STOPS there. Phase 26's hard boundary is that the interpreter VALIDATES +
   * BINDS and emits the spec; it performs NO network call. The authenticated
   * MAIN-world request, the live CSRF scrape, the origin-pin enforcement, and the
   * read-only extract RUN are Phase 27. This file is the config-driven binder, not
   * a command runner: a recipe selects a bundled auth handler by enum id and never
   * carries handler logic.
   *
   * Module shell: the dual-export IIFE mirror of extension/utils/value-extractor.js
   * (the PURE, browser-API-free variant). Like value-extractor.js this module
   * OMITS any lazy browser-API resolver -- it touches no browser API and reaches
   * the vendored globals only through typeof-guarded accessors (the
   * ws-client.js getFSBLZStringCodec pattern), so it loads cleanly under the Node
   * test harness where the cfworker IIFE is pre-loaded via vm. The service worker
   * reads the global FsbCapabilityInterpreter after importScripts.
   *
   * Locked decisions implemented here (26-CONTEXT.md):
   *   - D-04 endpoint templating is a hand-rolled {var} replacer; url-template is
   *          OUT. Every substituted param is encodeURIComponent-escaped and an
   *          unfilled/unknown placeholder is rejected (no template injection).
   *   - D-11 the interpreter validates + binds -> bound request spec and performs
   *          NO network call (the no-network proof lives in the Task 3 suite).
   *   - D-13 validation is dynamic-code-free -- @cfworker/json-schema only; this
   *          file contains ZERO run-string-as-code / function-from-string /
   *          dynamic module loader constructs. It is on the Plan 03 CI-guard
   *          recipe-path allowlist, which scans even comments, so the literal
   *          forbidden patterns are kept out of this source.
   *   - D-14 recipe.extract (a read-only JMESPath string) is carried in the spec
   *          for Phase 27 to execute; it is defined + schema-validated here and
   *          NOT run against any live response.
   *   - D-15 typed-error RETURN shape { success:false, code:'RECIPE_*', ... };
   *          BOTH `code` and `errorCode` are set. The public API never throws.
   *
   * Reuse contract: validateRecipe + RECIPE_SCHEMA come from
   * extension/utils/capability-recipe-schema.js (Plan 01); bindAuthStrategy +
   * AUTH_HANDLERS come from extension/utils/capability-auth-strategies.js (Task 1).
   * Neither is re-implemented here.
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- typeof-guarded accessors for the sibling modules + vendored globals --
  //
  // Each returns null when its global is absent so the module loads (and degrades
  // to a typed RECIPE_SCHEMA_INVALID) where a dependency was not pre-loaded.

  function getFSBRecipeSchema() {
    return (typeof FsbCapabilityRecipeSchema !== 'undefined' && FsbCapabilityRecipeSchema)
      ? FsbCapabilityRecipeSchema : null;
  }

  function getFSBAuthStrategies() {
    return (typeof FsbCapabilityAuthStrategies !== 'undefined' && FsbCapabilityAuthStrategies)
      ? FsbCapabilityAuthStrategies : null;
  }

  // The validator constructor (cfworker IIFE global). Used to validate invoke
  // args against the recipe's params sub-schema. shortCircuit:false -> all errors.
  function getFSBRecipeValidator(schema, draft) {
    if (typeof CfworkerJsonSchema === 'undefined' || !CfworkerJsonSchema || !CfworkerJsonSchema.Validator) {
      return null;
    }
    return new CfworkerJsonSchema.Validator(schema, draft || '2020-12', false /* emit all errors */);
  }

  // The read-only path query lib (lowercase global). Carried for Phase 27; NOT
  // invoked here -- the extract string is placed in the spec unevaluated (D-14).
  function getFSBJmespath() {
    return (typeof jmespath !== 'undefined' && jmespath) ? jmespath : null;
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

  // ---- $ref / $dynamicRef pre-scan for the untrusted params sub-schema -----
  //
  // recipe.params is an intentionally-open JSON-Schema sub-document (D-06). A
  // recipe must NOT be able to pull a remote schema or reach an out-of-document
  // pointer: an unresolvable $ref makes the cfworker Validator constructor throw
  // (handled by the HI-01 try/catch), and a $dynamicRef is silently lenient. As
  // defense-in-depth (HI-01, the "encouraged" half) we reject ANY $ref/$dynamicRef
  // anywhere in the params sub-schema up front, so a recipe can only ever describe
  // a self-contained shape. Walks own enumerable keys with a hasOwnProperty guard;
  // arrays and nested objects are recursed.

  function paramsHasRemoteRef(node) {
    if (!node || typeof node !== 'object') { return false; }
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        if (paramsHasRemoteRef(node[i])) { return true; }
      }
      return false;
    }
    for (var key in node) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) { continue; }
      if (key === '$ref' || key === '$dynamicRef') { return true; }
      if (paramsHasRemoteRef(node[key])) { return true; }
    }
    return false;
  }

  // ---- Hand-rolled {var} endpoint templater (D-04) ------------------------
  //
  // Substitute ONLY validated params; reject leftover/unknown placeholders. Each
  // substituted param is encodeURIComponent-escaped (no template injection into
  // the URL -- ASVS V5.2). The internal replacer throws a typed marker on a
  // missing param; the wrapper catches it and converts to a typed RETURN so the
  // public API never throws. Origin-pin (request origin == recipe.origin) is
  // ENFORCED IN PHASE 27 (FETCH-03); here we only build the templated path.

  function templateEndpoint(template, params) {
    var safeParams = (params && typeof params === 'object') ? params : {};
    try {
      var url = String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, function(_m, name) {
        if (!Object.prototype.hasOwnProperty.call(safeParams, name)) {
          throw { __recipeTemplateError: true, name: name };
        }
        return encodeURIComponent(String(safeParams[name]));
      });
      return { success: true, url: url };
    } catch (e) {
      if (e && e.__recipeTemplateError) {
        return createRecipeError('RECIPE_SCHEMA_INVALID', {
          reason: 'unfilled-placeholder', field: e.name
        });
      }
      // Any other throw (e.g. template not a string) is also a schema problem.
      return createRecipeError('RECIPE_SCHEMA_INVALID', { reason: 'endpoint-template' });
    }
  }

  // ---- Static request placement map (D-06) -------------------------------
  //
  // recipe.request is a STATIC param->placement map: { query?, header?, body? }.
  // Each placement object's string values may contain {var} tokens filled from
  // the validated args (encodeURIComponent for query values; raw for header/body
  // since those are not URL-encoded). Non-string values pass through unchanged.
  // No arbitrary header/body is constructed from server strings beyond this
  // static, recipe-authored map. Returns { success, query, headers, body } or a
  // typed error when a placement value references an unfilled {var}.

  function fillPlacementValue(value, params, encode) {
    if (typeof value !== 'string') {
      return { ok: true, value: value };
    }
    var missing = null;
    var filled = value.replace(/\{([a-zA-Z0-9_]+)\}/g, function(_m, name) {
      if (!Object.prototype.hasOwnProperty.call(params, name)) {
        missing = name;
        return '';
      }
      var raw = String(params[name]);
      return encode ? encodeURIComponent(raw) : raw;
    });
    if (missing) {
      return { ok: false, field: missing };
    }
    return { ok: true, value: filled };
  }

  function fillPlacementMap(map, params, encode) {
    var out = {};
    if (!map || typeof map !== 'object') {
      return { ok: true, value: out };
    }
    for (var key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        var r = fillPlacementValue(map[key], params, encode);
        if (!r.ok) { return { ok: false, field: r.field }; }
        out[key] = r.value;
      }
    }
    return { ok: true, value: out };
  }

  function buildRequest(request, params) {
    var safeParams = (params && typeof params === 'object') ? params : {};
    var req = (request && typeof request === 'object') ? request : {};
    // query values are URL-encoded; header/body values are passed through raw.
    var q = fillPlacementMap(req.query, safeParams, true);
    if (!q.ok) { return createRecipeError('RECIPE_SCHEMA_INVALID', { reason: 'request.query placeholder', field: q.field }); }
    var h = fillPlacementMap(req.header, safeParams, false);
    if (!h.ok) { return createRecipeError('RECIPE_SCHEMA_INVALID', { reason: 'request.header placeholder', field: h.field }); }
    var b = fillPlacementMap(req.body, safeParams, false);
    if (!b.ok) { return createRecipeError('RECIPE_SCHEMA_INVALID', { reason: 'request.body placeholder', field: b.field }); }
    return { success: true, query: q.value, headers: h.value, body: b.value };
  }

  // ---- interpretRecipe -- validate -> bind -> emit spec (D-11) ------------
  //
  // RETURNS one of:
  //   { success:true, spec:{ url, method, headers, body, query, authStrategy,
  //                          csrfSource?, _authNeed?, credentials?, origin, extract } }
  //   { success:false, code:'RECIPE_UNKNOWN_FIELD'|'RECIPE_OPCODE_INVALID'|'RECIPE_SCHEMA_INVALID', ... }
  //
  // Order:
  //   1. validateRecipe(recipe) via the schema module -- return its typed result
  //      verbatim on failure (closed-vocab / forbidden-name / bad-enum gate).
  //   2. validate args against recipe.params via a fresh cfworker Validator --
  //      invalid -> RECIPE_SCHEMA_INVALID.
  //   3. templateEndpoint(recipe.endpoint, args) -- typed error on unfilled {var}.
  //   4. buildRequest(recipe.request, args) -- static placement map applied.
  //   5. assemble the base spec.
  //   6. bindAuthStrategy(recipe.authStrategy, spec, recipe) -- if it returns a
  //      {success:false} shape, return that; otherwise the shaped spec is returned.
  // The interpreter performs NO network call and does NOT run the path query lib
  // against any live response (recipe.extract is carried unevaluated -- D-14).

  function interpretRecipe(recipe, args) {
    var schemaMod = getFSBRecipeSchema();
    if (!schemaMod || typeof schemaMod.validateRecipe !== 'function') {
      return createRecipeError('RECIPE_SCHEMA_INVALID', { error: 'recipe schema module unavailable' });
    }
    var authMod = getFSBAuthStrategies();
    if (!authMod || typeof authMod.bindAuthStrategy !== 'function') {
      return createRecipeError('RECIPE_SCHEMA_INVALID', { error: 'auth-strategies module unavailable' });
    }

    // 1. Recipe schema gate (delegated; typed RECIPE_* returned verbatim).
    var recipeResult = schemaMod.validateRecipe(recipe);
    if (!recipeResult || recipeResult.success !== true) {
      return recipeResult;
    }

    var safeArgs = (args && typeof args === 'object') ? args : {};

    // 2. Invoke-args gate: validate against the recipe's params sub-schema.
    //    recipe.params is an optional, intentionally-open JSON-Schema document
    //    (D-06) accepted verbatim from the untrusted recipe -- validateRecipe only
    //    asserts it is {type:'object'} and lets any shape through. The cfworker
    //    Validator constructor THROWS (uncaught) when the supplied schema carries
    //    an unresolvable $ref (e.g. params:{ "$ref":"https://evil/x.json" } or a
    //    "#/does/not/exist" pointer), and .validate() can throw on other hostile
    //    sub-schemas. D-15 promises "The public API never throws", so BOTH the
    //    construction AND the validate call are wrapped and converted to a typed
    //    RECIPE_SCHEMA_INVALID return (HI-01).
    if (recipe.params && typeof recipe.params === 'object') {
      // Defense-in-depth: refuse a params sub-schema that tries to pull a remote
      // or out-of-document schema via $ref/$dynamicRef (HI-01). The try/catch
      // below is still the load-bearing no-throw guarantee for anything this
      // pre-scan does not catch.
      if (paramsHasRemoteRef(recipe.params)) {
        return createRecipeError('RECIPE_SCHEMA_INVALID', { reason: 'invoke-params-ref' });
      }
      var paramValidator;
      var paramResult;
      try {
        paramValidator = getFSBRecipeValidator(recipe.params, '2020-12');
        if (!paramValidator) {
          return createRecipeError('RECIPE_SCHEMA_INVALID', { error: 'validator unavailable' });
        }
        paramResult = paramValidator.validate(safeArgs);
      } catch (e) {
        return createRecipeError('RECIPE_SCHEMA_INVALID', {
          reason: 'invoke-params-schema',
          error: (e && e.message) ? e.message : String(e)
        });
      }
      if (!paramResult || paramResult.valid !== true) {
        return createRecipeError('RECIPE_SCHEMA_INVALID', {
          reason: 'invoke-params',
          errors: (paramResult && paramResult.errors) ? paramResult.errors : []
        });
      }
    }

    // 3. Endpoint templating ({var} -> escaped validated args).
    var templated = templateEndpoint(recipe.endpoint, safeArgs);
    if (!templated || templated.success !== true) {
      return templated;
    }

    // 4. Static request placement map.
    var built = buildRequest(recipe.request, safeArgs);
    if (!built || built.success !== true) {
      return built;
    }

    // 5. Assemble the base bound request spec. extract is carried unevaluated.
    var spec = {
      url: templated.url,
      method: recipe.method,
      headers: built.headers,
      body: built.body,
      query: built.query,
      authStrategy: recipe.authStrategy,
      origin: recipe.origin,
      extract: (typeof recipe.extract === 'string') ? recipe.extract : null
    };

    // 6. Auth-strategy binding (enum -> bundled spec-shaping stub).
    var shaped = authMod.bindAuthStrategy(recipe.authStrategy, spec, recipe);
    if (shaped && shaped.success === false) {
      return shaped;
    }

    return { success: true, spec: shaped };
  }

  // ---- Export shape (mirror value-extractor.js:218-229) -------------------

  var exportsObj = {
    interpretRecipe: interpretRecipe,
    templateEndpoint: templateEndpoint,
    getFSBJmespath: getFSBJmespath
  };

  global.FsbCapabilityInterpreter = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                    // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
