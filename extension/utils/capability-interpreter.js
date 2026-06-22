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

  // The recipe-integrity verifier (Phase 30, SIGN-01/02; capability-signature.js).
  // typeof-guarded so this module loads where the signature module is absent. The
  // signature-verify hook (interpretRecipe step 1b) calls it ONLY for non-bundled
  // provenance; when it is absent on a non-bundled recipe the hook FAILS CLOSED
  // with RECIPE_SIGNATURE_INVALID (a non-bundled recipe must never bind without a
  // verifier). The bundled/no-meta default path never reaches this accessor.
  function getFSBCapabilitySignature() {
    return (typeof FsbCapabilitySignature !== 'undefined' && FsbCapabilitySignature)
      ? FsbCapabilitySignature : null;
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
  // public API never throws. Origin-pin (request origin == recipe.origin) is now
  // ENFORCED in interpretRecipe step 5c (FETCH-03) against the EFFECTIVE
  // post-query-fold URL; templateEndpoint here only builds the templated path.

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
    // NI-01: build the output on a NULL prototype so prototype-shaped keys
    // (__proto__ / constructor / prototype) round-trip as plain own data instead
    // of silently vanishing. With a normal {} object, out['__proto__'] = x sets
    // the prototype rather than an own key, dropping the field from the result.
    // (A recipe with such a placement key does not pollute Object.prototype --
    // the value is a string -- but the silent data-drop confuses debugging.)
    var out = Object.create(null);
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
  //   1. validateRecipe(recipe core) via the schema module -- return its typed
  //      result verbatim on failure (closed-vocab / forbidden-name / bad-enum).
  //   1b. SIGNATURE VERIFY HOOK (Phase 30, SIGN-02, D-06): for a NON-bundled
  //      provenance envelope ONLY, AFTER schema-validate and BEFORE bind, verify
  //      the Ed25519/JCS signature; ok:false -> RECIPE_SIGNATURE_INVALID. The
  //      bundled/no-meta default path skips this entirely (D-07 exemption).
  //   2. validate args against recipe.params via a fresh cfworker Validator --
  //      invalid -> RECIPE_SCHEMA_INVALID.
  //   3. templateEndpoint(recipe.endpoint, args) -- typed error on unfilled {var}.
  //   4. buildRequest(recipe.request, args) -- static placement map applied.
  //   5. assemble the base spec.
  //   6. bindAuthStrategy(recipe.authStrategy, spec, recipe) -- if it returns a
  //      {success:false} shape, return that; otherwise the shaped spec is returned.
  // The interpreter performs NO network call and does NOT run the path query lib
  // against any live response (recipe.extract is carried unevaluated -- D-14).
  //
  // ENVELOPE vs BARE CORE (Phase 30, SIGN-02 / D-06 / D-07): the FIRST argument is
  // EITHER a bare schema-valid recipe core (today's callers + the Phase-29 head --
  // the bundled/no-meta exempt default path) OR a provenance ENVELOPE
  // { recipe:<core>, provenance:'bundled'|'server'|'learned', signature?,
  // capturedAt?, schemaHash? }. The recipe schema is additionalProperties:false,
  // so integrity metadata CANNOT live inside the schema-validated core -- it
  // travels in the wrapping envelope. An envelope is detected by a `recipe` object
  // property PLUS a string `provenance` property (a bare core has neither). When
  // an envelope is detected the core is unwrapped for schema-validate + bind and,
  // for NON-bundled provenance, the signature is verified after schema-validate
  // and before bind.
  //
  // RETURN-SHAPE contract (backward-compatible): the bare-core / bundled / no-meta
  // default path returns the typed result SYNCHRONOUSLY (a plain object) -- exactly
  // as the Phase-26 interpreter did -- so every current synchronous caller and the
  // existing capability-interpreter.test.js stay green untouched. ONLY the
  // NON-bundled envelope path returns a Promise (the Ed25519 verify is async). A
  // caller that may pass a non-bundled envelope (the router's _runDeclarativeTier,
  // and the Phase-30 hook test) `await`s the result; `await` on the synchronously
  // returned plain object is a no-op, so awaiting is always safe. This is why
  // interpretRecipe is NOT declared `async` (an async function would force a
  // Promise on the bundled path and break the sync callers): it is a sync
  // dispatcher that returns a Promise only on the verify branch.

  // Detect the Phase-30 provenance envelope. A bare recipe core has neither a
  // nested `recipe` object nor an integrity field, so a Phase-29 recipe is NEVER
  // misread as an envelope (the exempt default path is preserved). Returns null
  // for a bare core; an { core, signature, capturedAt, schemaHash } descriptor
  // for an envelope.
  //
  // HI-01 (trust boundary): the envelope shape is detected by the presence of a
  // nested `recipe` object PLUS the SIGNATURE-METADATA channel (a `signature`,
  // `capturedAt`, or `schemaHash` field) -- NEVER by the payload's self-asserted
  // `provenance` key. An envelope's embedded `provenance` is DELIBERATELY NOT
  // read here: provenance is a TRUSTED decision the LOADER makes from WHERE the
  // recipe came from (bundled-on-disk vs server vs learned), passed to
  // interpretRecipe as a separate trusted argument (opts.trustedProvenance). A
  // recipe data payload can therefore NEVER self-declare `bundled` to dodge the
  // signature-verify gate.
  function detectRecipeEnvelope(input) {
    if (!input || typeof input !== 'object') { return null; }
    if (!input.recipe || typeof input.recipe !== 'object') { return null; }
    // An envelope is anything that wraps a recipe core AND carries the integrity
    // channel (signature / capturedAt / schemaHash). The embedded `provenance`
    // field is intentionally IGNORED for trust purposes (HI-01).
    var hasIntegrityMeta =
      (typeof input.signature === 'string' && input.signature.length > 0) ||
      (typeof input.capturedAt === 'string' && input.capturedAt.length > 0) ||
      (typeof input.schemaHash === 'string' && input.schemaHash.length > 0) ||
      (typeof input.provenance === 'string' && input.provenance.length > 0);
    if (!hasIntegrityMeta) { return null; }
    return {
      core: input.recipe,
      signature: input.signature,
      capturedAt: input.capturedAt,
      schemaHash: input.schemaHash
    };
  }

  // interpretRecipe(recipeOrEnvelope, args, opts)
  //
  // opts.trustedProvenance (HI-01): the provenance the LOADER vouches for, derived
  // from the recipe's SOURCE (the bundled on-disk catalog vs a server/learned
  // channel) -- NEVER from a field inside the recipe payload. ONLY a trusted
  // 'bundled' here grants the no-verify exemption (D-07). A bare recipe core (no
  // envelope) is the bundled catalog path the router uses today, which is exempt
  // by source. Any envelope NOT vouched as 'bundled' by the loader is ALWAYS
  // signature-verified -- a payload carrying its own `provenance:'bundled'` can no
  // longer skip verification.
  function interpretRecipe(recipeOrEnvelope, args, opts) {
    // Unwrap a Phase-30 provenance envelope to its recipe core; a bare core is
    // used as-is (today's callers + the Phase-29 head -- the exempt default path).
    var envelope = detectRecipeEnvelope(recipeOrEnvelope);
    var recipe = envelope ? envelope.core : recipeOrEnvelope;

    // TRUSTED provenance comes ONLY from the call path (the loader), never from
    // the recipe payload. Absent => unvouched: a bare core is exempt by source
    // (bundled catalog), but an ENVELOPE with no trusted vouch must be verified.
    var trustedProvenance = (opts && typeof opts.trustedProvenance === 'string')
      ? opts.trustedProvenance : null;

    var schemaMod = getFSBRecipeSchema();
    if (!schemaMod || typeof schemaMod.validateRecipe !== 'function') {
      return createRecipeError('RECIPE_SCHEMA_INVALID', { error: 'recipe schema module unavailable' });
    }
    var authMod = getFSBAuthStrategies();
    if (!authMod || typeof authMod.bindAuthStrategy !== 'function') {
      return createRecipeError('RECIPE_SCHEMA_INVALID', { error: 'auth-strategies module unavailable' });
    }

    // 1. Recipe schema gate (delegated; typed RECIPE_* returned verbatim). This
    //    runs on the unwrapped CORE, so a schema-invalid envelope returns its
    //    SCHEMA error here -- BEFORE the signature hook (the hook is strictly
    //    after schema-validate, D-06). Runs synchronously for EVERY path so a
    //    schema error is always returned synchronously (never wrapped in a
    //    Promise), preserving the sync callers' contract on the failure path too.
    var recipeResult = schemaMod.validateRecipe(recipe);
    if (!recipeResult || recipeResult.success !== true) {
      return recipeResult;
    }

    // BARE-CORE / TRUSTED-BUNDLED / NO-META default path: NO signature verify
    // (D-07). The exemption fires ONLY for (a) a bare recipe core -- the bundled
    // on-disk catalog path the router uses -- or (b) an envelope the LOADER
    // explicitly vouched as 'bundled' via opts.trustedProvenance. The recipe
    // payload's OWN `provenance` field is NEVER consulted here (HI-01): a tampered
    // core relabeled `provenance:'bundled'` in its data CANNOT reach this
    // short-circuit, so it can no longer dodge verification. Bind synchronously
    // and return the typed result as a plain object so every current synchronous
    // caller behaves identically.
    if (!envelope || trustedProvenance === 'bundled') {
      return bindRecipeCore(recipe, args, authMod);
    }

    // 1b. SIGNATURE VERIFY HOOK (Phase 30, SIGN-02, D-06/D-07) -- any envelope NOT
    //     vouched 'bundled' by the loader, AFTER schema-validate (above) and
    //     BEFORE bind (below). The Ed25519 verify is async, so this branch returns
    //     a Promise; callers that may pass an envelope await it. Such a recipe MUST
    //     NOT bind without a verifier, so an absent signature module FAILS CLOSED.
    return (async function verifyThenBind() {
      var sigMod = getFSBCapabilitySignature();
      if (!sigMod || typeof sigMod.verifyRecipeEnvelope !== 'function') {
        return createRecipeError('RECIPE_SIGNATURE_INVALID', { reason: 'verifier-unavailable' });
      }
      var verifyResult;
      try {
        // Pass the TRUSTED provenance (from the loader, or null when unvouched) as
        // the SECOND argument so the signature module decides the exemption from
        // the trusted channel -- it must NOT honor a `provenance` embedded in the
        // envelope object. We deliberately do NOT forward any payload provenance.
        verifyResult = await sigMod.verifyRecipeEnvelope({
          recipe: recipe,
          signature: envelope.signature,
          capturedAt: envelope.capturedAt,
          schemaHash: envelope.schemaHash
        }, trustedProvenance);
      } catch (e) {
        // verifyRecipeEnvelope is fail-closed and should not throw, but guard the
        // public no-throw contract regardless -> treat any throw as invalid.
        return createRecipeError('RECIPE_SIGNATURE_INVALID', { reason: 'verify-threw' });
      }
      if (!verifyResult || verifyResult.ok !== true) {
        return createRecipeError('RECIPE_SIGNATURE_INVALID', {
          reason: (verifyResult && verifyResult.reason) ? verifyResult.reason : 'signature-invalid'
        });
      }
      // Verified -> bind the core (the same synchronous bind the exempt path uses).
      return bindRecipeCore(recipe, args, authMod);
    })();
  }

  // ---- bindRecipeCore -- the synchronous validate-args -> bind tail (D-11) ----
  //
  // Steps 2-6 of the original interpreter, factored out so BOTH the synchronous
  // bundled/no-meta path and the async verified-non-bundled path share ONE bind
  // implementation. Pure + synchronous: validates invoke args against the
  // recipe.params sub-schema, templates the endpoint, builds the static request
  // placement map, folds the query, re-asserts the origin-pin, and binds the auth
  // strategy -- performing NO network call and never running the path query lib
  // against any live response (recipe.extract is carried unevaluated -- D-14).
  // Returns the same typed shapes the interpreter has always returned.
  function bindRecipeCore(recipe, args, authMod) {
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

    // 5b. Query-fold (D-09, FETCH-03): fold the built query map into the URL
    //     BEFORE the origin-pin so the pin guards the TRUE effective request
    //     target. built.query VALUES are ALREADY encodeURIComponent-escaped by
    //     buildRequest -> fillPlacementMap(..., true); encode ONLY the key here,
    //     never the value (T-27-04: re-encoding the value would corrupt data, not
    //     add safety -- an accepted non-issue). When the query map is empty,
    //     effectiveUrl equals templated.url unchanged.
    var effectiveUrl = templated.url;
    var qkeys = Object.keys(built.query || {});
    if (qkeys.length) {
      var pairs = [];
      for (var qi = 0; qi < qkeys.length; qi++) {
        var qk = qkeys[qi];
        pairs.push(encodeURIComponent(qk) + '=' + built.query[qk]);
      }
      effectiveUrl = templated.url +
        (templated.url.indexOf('?') === -1 ? '?' : '&') +
        pairs.join('&');
    }

    // 5c. Origin-pin re-assertion (D-08 part 1, FETCH-03): resolve the EFFECTIVE
    //     (post-fold) URL against recipe.origin and reject any target whose origin
    //     does not match. This rejects a cross-origin re-target AND a protocol-
    //     relative effective target (new URL("//evil.com", origin) re-targets to a
    //     foreign host; the URL parser also normalizes a leading backslash the
    //     schema's leading-// guard does not catch) BEFORE any caller can act on
    //     the spec. Resolution failure (catch) is also a mismatch. Typed RETURN
    //     (never throw); BOTH code and errorCode are set by createRecipeError.
    var resolvedTarget;
    try {
      resolvedTarget = new URL(effectiveUrl, recipe.origin);
    } catch (urlErr) {
      resolvedTarget = null;
    }
    if (!resolvedTarget || resolvedTarget.origin !== recipe.origin) {
      return createRecipeError('RECIPE_ORIGIN_MISMATCH', {
        url: effectiveUrl,
        origin: recipe.origin
      });
    }

    // The bound spec carries the TRUE effective request target (replacing the
    // bare templated.url) so a downstream caller acts on exactly what was pinned.
    spec.url = effectiveUrl;

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
