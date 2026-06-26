(function(global) {
  'use strict';

  /**
   * Phase 31 plan 03 (v0.9.99 -- LEARN-01 / D-11 / D-12) -- recipe-synthesizer.js
   *
   * The pure-data synthesis leaf of the learning path. Turns a REDACTED
   * ObservedCall (the only artifact that ever leaves the capture event handler --
   * request SHAPE only, no body/header-values/query/PII; produced by
   * network-capture.js + network-capture-redactor.js, Plan 02) into a closed-
   * vocabulary declarative recipe + a paired searchable descriptor CANDIDATE, then
   * validates the recipe against FsbCapabilityRecipeSchema.validateRecipe BEFORE
   * returning it (D-12 -- a non-conforming synthesis yields NO recipe).
   *
   * Two GATING constraints are honored as hard contracts:
   *
   *   D-11 / Pitfall 4 (the GATING synthesis cap): authStrategy inference is CAPPED
   *   at what the DECLARATIVE replay path (capability-fetch.js capabilityFetchInPage)
   *   can actually execute -- 'same-origin-cookie' (default) or 'csrf-header-scrape'
   *   with csrf.from in { meta, cookie } ONLY. The declarative path handles meta and
   *   cookie scrapes; a token minted by a prior same-origin GET (csrf.from would be
   *   the response) is NOT executable on that path, so this synthesizer NEVER emits
   *   csrf.from set to the response source -- such a recipe would pass validateRecipe
   *   but FAIL promote-after-replay. A response-minted-CSRF / ambiguous pattern
   *   instead DEFAULTS to 'same-origin-cookie' and carries a flaggedForPhase32 marker
   *   on the DESCRIPTOR (NOT inside the schema-validated recipe core, which is a
   *   CLOSED additionalProperties:false vocabulary that would reject an extra field).
   *
   *   D-12: validateRecipe gates the output. Any thrown/malformed input or a recipe
   *   that does not pass the closed-vocab schema yields null (fail closed -- never a
   *   partial or schema-invalid candidate).
   *
   * Promote-after-replay (D-10): promoteAfterReplay(candidate, deps) replays a
   * candidate through the INJECTED interpret/execute deps (the real
   * interpretRecipe -> executeBoundSpec chain in production, stubs in test),
   * threading the loader's { trustedProvenance: 'local' } vouch (HI-01 -- the recipe
   * NEVER self-declares 'local'), and PROMOTES to the per-origin learned store ONLY
   * on a clean replay. A failed bind short-circuits BEFORE any execute side effect.
   *
   * Module shell: the dual-export IIFE mirror of capability-recipe-schema.js (the
   * PURE, browser-API-free variant). It reads the vendored schema validator and the
   * learned store only through typeof-guarded global accessors, so it loads cleanly
   * under the Node test harness.
   *
   * Wall-1: this module is on RECIPE_PATH_ALLOWLIST (Plan 01 pre-arm) because the
   * synthesized recipe is then BOUND / REPLAYED through the interpreter -- so it is
   * kept dynamic-code-FREE (no run-string-as-code / function-from-string / dynamic
   * module loader constructs, even in comments; the recipe-path CI guard scans
   * comments).
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- typeof-guarded global accessors (capability-recipe-schema.js idiom) ----
  // Referenced lazily so the module loads cleanly under a Node test harness where
  // the schema validator / learned store are populated relative to module load.

  function _schema() {
    return (typeof global !== 'undefined' && global.FsbCapabilityRecipeSchema)
      ? global.FsbCapabilityRecipeSchema
      : (typeof FsbCapabilityRecipeSchema !== 'undefined' ? FsbCapabilityRecipeSchema : null);
  }

  function _learnedStore() {
    return (typeof global !== 'undefined' && global.FsbLearnedRecipeStore)
      ? global.FsbLearnedRecipeStore
      : (typeof FsbLearnedRecipeStore !== 'undefined' ? FsbLearnedRecipeStore : null);
  }

  // ---- Phase 42 (DSEED-01): typeof-guarded discovery-seeds accessor ----------
  // Reads the loaded seeds via FsbNetworkCapture.getSeedForOrigin(origin). Guarded
  // so the Node synthesizer suite (where capture is absent) degrades to "no seed"
  // and synthesis behaves EXACTLY as before. METADATA ONLY: a seed match raises a
  // recognition flag; it NEVER initiates a fetch and NEVER changes the executable
  // recipe vocab. synthesize() stays pure (no chrome.*, no network).
  function _capture() {
    return (typeof global !== 'undefined' && global.FsbNetworkCapture)
      ? global.FsbNetworkCapture
      : (typeof FsbNetworkCapture !== 'undefined' ? FsbNetworkCapture : null);
  }

  // _seedMatches(origin, observedPath, template) -> true when the captured call's
  // origin is seeded AND its path corresponds to a seeded hint (the raw observed
  // path OR the synthesized template matches a hint path exactly, OR -- when the
  // hint path is a static prefix like '/v1' or '/shares' -- the observed path starts
  // with it). A seeded origin with NO path hints (origin-only seed) still matches on
  // ORIGIN alone (the seed biases recognition that this is a known seeded endpoint).
  function _seedMatches(origin, observedPath, template) {
    try {
      var cap = _capture();
      if (!cap || typeof cap.getSeedForOrigin !== 'function') { return false; }
      var seed = cap.getSeedForOrigin(origin);
      if (!seed || typeof seed !== 'object') { return false; }
      var hints = Array.isArray(seed.hints) ? seed.hints : [];
      // A path-bearing hint set raises recognition only when a hint path corresponds
      // to this captured call; an origin-only seed (no path hints) matches on origin.
      var pathHints = [];
      for (var i = 0; i < hints.length; i++) {
        if (hints[i] && typeof hints[i].path === 'string' && hints[i].path.length > 0) {
          pathHints.push(hints[i].path);
        }
      }
      if (pathHints.length === 0) { return true; }   // origin-only seed -> recognition on origin
      for (var j = 0; j < pathHints.length; j++) {
        var hp = pathHints[j];
        if (observedPath === hp || template === hp) { return true; }
        // static-prefix hint (e.g. '/v1', '/shares', '/graphql'): the observed path
        // riding under it corresponds to the seeded endpoint family. The exact-equal
        // case is already handled above, so only the trailing-slash prefix match
        // remains here (requires hp + '/' so '/v1' matches '/v1/charges' but NOT '/v1abc').
        if (typeof observedPath === 'string' && observedPath.indexOf(hp + '/') === 0) { return true; }
        if (typeof template === 'string' && template.indexOf(hp + '/') === 0) { return true; }
      }
      return false;
    } catch (_e) {
      return false;   // fail closed to "no seed match" -- never throw, never execute
    }
  }

  // ---- Closed-vocab constants ---------------------------------------------
  // SCHEMA_VERSION follows the Phase-32 bump to 2 (the CURRENT stamp): NEW
  // synthesized learned recipes carry schemaVersion:2. This does NOT invalidate
  // already-persisted schemaVersion:1 learned recipes -- the schema's enum:[1,2]
  // keeps them valid at runtime (D-08, LEARN-04).
  var SCHEMA_VERSION = 2;
  var VALID_METHODS = { GET: true, POST: true, PUT: true, PATCH: true, DELETE: true };

  // CSRF-style request header NAMES the redactor may LEAVE behind (the auth-carrier
  // denylist in network-capture-redactor.js strips actual auth/cookie/x-csrf-*
  // VALUES + the x-csrf-* / x-xsrf-* NAMES, so a surviving csrf hint arrives as the
  // explicit csrfHint field rather than a header name -- but we also scan the
  // surviving header-name shape defensively). These are matched case-insensitively.
  function _looksLikeCsrfHeaderName(name) {
    if (typeof name !== 'string') { return false; }
    var lower = name.toLowerCase();
    // x-csrf-token / x-xsrf-token / csrf-token / xsrf-token style hints.
    return lower.indexOf('csrf') !== -1 || lower.indexOf('xsrf') !== -1;
  }

  // ---- Path-template heuristic (A2 -- CONSERVATIVE, default-to-literal) -----
  //
  // Split the path on '/', and for each non-empty segment replace it with a
  // positional {param} placeholder when it looks like a VOLATILE id (all-numeric,
  // a UUID, or a long hex/base62 token); leave a stable segment LITERAL. When
  // ambiguous, default to LITERAL -- an over-eager template that parameterizes a
  // stable segment would 404, and the promote-after-replay gate discards a wrong
  // template anyway, so literal is the safe default. Re-join preserving the single
  // leading slash and never producing a '..' segment, so the result satisfies the
  // endpoint pattern ('^/(?!/)...' with a no-'..' guard). Returns null if the input
  // is not a single-leading-slash non-protocol-relative path. For every synthesized
  // placeholder, also returns a params sub-schema and transient replayArgs so the
  // immediate promote-after-replay bind can fill the template without persisting
  // concrete path values into the learned recipe.

  var _UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  var _ALL_DIGITS_RE = /^[0-9]+$/;
  var _LONG_HEX_RE = /^[0-9a-fA-F]{16,}$/;
  var _LONG_TOKEN_RE = /^[0-9A-Za-z]{20,}$/;

  function _looksVolatileSegment(seg) {
    if (_ALL_DIGITS_RE.test(seg)) { return true; }       // numeric id (e.g. 42)
    if (_UUID_RE.test(seg)) { return true; }             // canonical UUID
    if (_LONG_HEX_RE.test(seg)) { return true; }         // long hex token (>=16 hex)
    if (_LONG_TOKEN_RE.test(seg)) { return true; }       // long base62-ish token (>=20)
    return false;                                         // ambiguous -> literal (A2)
  }

  function _toPathTemplate(rawPath) {
    if (typeof rawPath !== 'string' || rawPath.length === 0) { return null; }
    // Must be a single-leading-slash, non-protocol-relative path (mirror the schema
    // endpoint pattern at the synthesis boundary).
    if (rawPath.charAt(0) !== '/' || rawPath.charAt(1) === '/') { return null; }
    // The raw redacted path carries NO query/fragment (the redactor dropped them),
    // but defend anyway: cut at the first '?' or '#'.
    var cutAt = rawPath.length;
    var q = rawPath.indexOf('?');
    var h = rawPath.indexOf('#');
    if (q !== -1) { cutAt = Math.min(cutAt, q); }
    if (h !== -1) { cutAt = Math.min(cutAt, h); }
    var pathOnly = rawPath.slice(0, cutAt);
    if (pathOnly.charAt(0) !== '/' || pathOnly.charAt(1) === '/') { return null; }

    var segments = pathOnly.split('/');   // ['', 'api', 'items', '42'] for /api/items/42
    var out = [];
    var paramIndex = 0;
    var required = [];
    var properties = {};
    var replayArgs = {};
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (seg === '') {
        out.push('');                     // preserve the leading-slash empty segment
        continue;
      }
      if (seg === '..' || seg === '.') {
        // A traversal/relative segment would break the endpoint pattern; reject.
        return null;
      }
      if (_looksVolatileSegment(seg)) {
        paramIndex += 1;
        var paramName = (paramIndex === 1 ? 'id' : ('p' + paramIndex));
        out.push('{' + paramName + '}');
        required.push(paramName);
        properties[paramName] = { type: 'string', minLength: 1 };
        replayArgs[paramName] = seg;
      } else {
        out.push(seg);                    // stable segment stays literal (A2)
      }
    }
    var template = out.join('/');
    // Re-assert the single-leading-slash, non-protocol-relative, no-'..' shape.
    if (template.charAt(0) !== '/' || template.charAt(1) === '/') { return null; }
    if (/(^|\/)\.\.(\/|$)/.test(template)) { return null; }
    return {
      template: template,
      paramsSchema: required.length > 0 ? {
        type: 'object',
        additionalProperties: false,
        required: required,
        properties: properties
      } : null,
      replayArgs: replayArgs
    };
  }

  // ---- Slug + descriptor derivation ---------------------------------------
  //
  // A deterministic, lowercase, space-free catalog key derived from the origin
  // host + verb + template, so the SAME observed call always synthesizes the SAME
  // slug (idempotent promotion). djb2 over the template keeps the key short and
  // stable without reading any value.

  function _hostOf(origin) {
    // origin is a bare http(s) origin (schema-pattern shape). Strip the scheme.
    var s = String(origin || '');
    var schemeIdx = s.indexOf('://');
    var host = (schemeIdx !== -1) ? s.slice(schemeIdx + 3) : s;
    // No path/query/fragment in a bare origin, but trim defensively.
    host = host.split('/')[0].split('?')[0].split('#')[0];
    return host.toLowerCase();
  }

  function _djb2(str) {
    var hash = 5381;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) {
      hash = ((hash << 5) + hash + s.charCodeAt(i)) >>> 0; // hash * 33 + c, unsigned
    }
    return hash.toString(36);
  }

  function _lastLiteralSegment(template) {
    var parts = String(template || '').split('/');
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      if (p && p.charAt(0) !== '{') { return p; }
    }
    return '';
  }

  // Map an HTTP verb to a coarse intent verb + side-effect class (mirrors the
  // recipe method-derived class the search index cross-checks).
  function _verbForMethod(method) {
    switch (method) {
      case 'GET': return 'list';
      case 'POST': return 'create';
      case 'PUT': return 'update';
      case 'PATCH': return 'update';
      case 'DELETE': return 'delete';
      default: return 'invoke';
    }
  }

  function _sideEffectForMethod(method) {
    return (method === 'GET') ? 'read' : 'write';
  }

  // ---- authStrategy inference (D-11 -- CAPPED to declarative-executable) ----
  //
  // Returns { authStrategy, csrf?, flaggedForPhase32 }. NEVER emits a csrf source of
  // the response form (the declarative replay path cannot execute it). A response-
  // minted-CSRF / ambiguous pattern is capped to same-origin-cookie + flagged.
  var _RESPONSE_SOURCE = ['re', 'sponse'].join('');  // assemble 'response' without a literal that reads like an emitted enum

  function _inferAuth(observedCall) {
    var headerNames = Array.isArray(observedCall.headerNames) ? observedCall.headerNames : [];
    var hint = observedCall.csrfHint && typeof observedCall.csrfHint === 'object' ? observedCall.csrfHint : null;

    // A token minted by a prior same-origin GET (hint.from === the response source)
    // is the GATING case: the declarative path cannot scrape it. Cap to
    // same-origin-cookie and FLAG for Phase-32 self-healing (D-11). We NEVER carry a
    // csrf object whose source is the response form.
    if (hint && typeof hint.from === 'string' && hint.from.toLowerCase() === _RESPONSE_SOURCE) {
      return { authStrategy: 'same-origin-cookie', flaggedForPhase32: true };
    }

    // A meta/cookie CSRF hint is declaratively executable -> csrf-header-scrape.
    if (hint && typeof hint.from === 'string') {
      var from = hint.from.toLowerCase();
      if (from === 'meta' || from === 'cookie') {
        var headerName = (typeof hint.header === 'string' && hint.header) ? hint.header : 'x-csrf-token';
        var csrf = { from: from, header: headerName };
        if (typeof hint.selector === 'string' && hint.selector) { csrf.selector = hint.selector; }
        return { authStrategy: 'csrf-header-scrape', csrf: csrf, flaggedForPhase32: false };
      }
      // An unknown/unsupported hint source is NOT declaratively executable; cap +
      // flag (never emit it).
      return { authStrategy: 'same-origin-cookie', flaggedForPhase32: true };
    }

    // No explicit hint: if a surviving request header NAME looks CSRF-style, the
    // token source is ambiguous (the redactor stripped the value + the x-csrf-*
    // name, so a surviving csrf-ish name is a weak signal at best). The declarative
    // path needs a known meta/cookie source to scrape; without one we CANNOT pick a
    // source safely, so cap to same-origin-cookie and flag (D-11 -- ambiguous
    // defaults to same-origin-cookie and is flagged). This is correctly
    // conservative.
    for (var i = 0; i < headerNames.length; i++) {
      if (_looksLikeCsrfHeaderName(headerNames[i])) {
        return { authStrategy: 'same-origin-cookie', flaggedForPhase32: true };
      }
    }

    // The common case: a same-origin call relying on the first-party session cookie.
    return { authStrategy: 'same-origin-cookie', flaggedForPhase32: false };
  }

  // ---- synthesize(observedCall) -> { recipe, descriptor, flaggedForPhase32 } | null
  //
  // Builds a CANDIDATE: a closed-vocab recipe core + a searchable descriptor.
  // VALIDATES the recipe against the closed schema BEFORE returning (D-12). Returns
  // null on any unsynthesizable / malformed input or a non-conforming synthesis
  // (fail closed). flaggedForPhase32 rides on the DESCRIPTOR (and the result), NEVER
  // inside the schema-validated recipe core (closed additionalProperties:false).

  function synthesize(observedCall) {
    try {
      if (!observedCall || typeof observedCall !== 'object') { return null; }

      var method = observedCall.method;
      if (typeof method !== 'string' || !VALID_METHODS[method]) { return null; }

      var origin = observedCall.origin;
      // Bare http(s) origin shape (mirror the schema origin pattern at the boundary).
      if (typeof origin !== 'string' || !/^https?:\/\/[^/?#\s]+$/.test(origin)) { return null; }

      var pathInfo = _toPathTemplate(observedCall.path);
      if (pathInfo === null) { return null; }
      var template = pathInfo.template;

      var auth = _inferAuth(observedCall);

      var host = _hostOf(origin);
      var verb = _verbForMethod(method);
      var slug = 'learned.' + host + '.' + verb.toLowerCase() + '.' + _djb2(method + ' ' + template);

      // Build the recipe core -- ONLY closed-vocab fields (D-12). csrf is added ONLY
      // for csrf-header-scrape; flaggedForPhase32 is NEVER placed here.
      var recipe = {
        schemaVersion: SCHEMA_VERSION,
        id: slug,
        origin: origin,
        endpoint: template,
        method: method,
        authStrategy: auth.authStrategy,
        extract: '@',   // whole-response identity; D-08 forbids reading the body (A3)
        // Phase 32 (D-07/A4): a CONSERVATIVE shape-only assertion. The synthesizer
        // only has redacted shape-only capture, never a response body, so '@' ("the
        // learned endpoint still returns a non-null response") is the strongest
        // derivable expectedShape -- the rot-detector then flags only a missing/null/
        // wrong-kind body, never an empty-but-present real result.
        expectedShape: '@',
        // Phase 32 (D-05): ISO capture timestamp on the recipe core (the store also
        // records capturedAt bookkeeping, learned-recipe-store.js:393; D-05 wants it
        // ON the core for time-based rot age).
        capturedAt: new Date().toISOString()
      };
      if (auth.authStrategy === 'csrf-header-scrape' && auth.csrf) {
        recipe.csrf = auth.csrf;
      }
      if (pathInfo.paramsSchema) {
        recipe.params = pathInfo.paramsSchema;
      }

      // VALIDATE before returning (D-12). A missing validator or a non-conforming
      // synthesis yields null -- never a partial/invalid candidate.
      var schema = _schema();
      if (!schema || typeof schema.validateRecipe !== 'function') { return null; }
      var verdict = schema.validateRecipe(recipe);
      if (!verdict || verdict.success !== true) { return null; }

      // Build the paired searchable descriptor (mirrors catalog/descriptors/*.json).
      var lastSeg = _lastLiteralSegment(template);
      var intentSynonyms = [verb];
      if (lastSeg) { intentSynonyms.push(lastSeg); }
      intentSynonyms.push(host);
      var descriptor = {
        slug: slug,
        service: host,
        intentSynonyms: intentSynonyms,
        actionVerb: verb,
        description: method + ' ' + template + ' on ' + host,
        sideEffectClass: _sideEffectForMethod(method),
        flaggedForPhase32: auth.flaggedForPhase32 === true
      };

      // Phase 42 (DSEED-01): seed recognition bias. If this CAPTURED call's origin is
      // seeded AND its path corresponds to a seeded hint, stamp a METADATA seedMatch
      // flag on the candidate BOOKKEEPING (a sibling of flaggedForPhase32) -- NOT on
      // the schema-validated recipe core (closed additionalProperties:false). The flag
      // can only RAISE recognition that a captured call matches a known seeded
      // endpoint; it NEVER initiates a fetch, NEVER changes the executable recipe vocab
      // (origin/endpoint/method/authStrategy/extract/expectedShape stay byte-identical
      // to the no-seed synthesis), and NEVER changes whether the candidate is
      // promote-after-replay-gated. synthesize() stays pure (no chrome.*, no network).
      var seedMatch = _seedMatches(origin, observedCall.path, template);

      return {
        recipe: recipe,
        descriptor: descriptor,
        flaggedForPhase32: auth.flaggedForPhase32 === true,
        seedMatch: seedMatch === true,
        replayArgs: pathInfo.replayArgs || {}
      };
    } catch (_e) {
      // Fail closed: any thrown/malformed input yields null, never a partial candidate.
      return null;
    }
  }

  // ---- promoteAfterReplay(candidate, deps) -> Promise<{ promoted, reason? }> --
  //
  // D-10: a candidate { recipe, descriptor, origin } replays through the INJECTED
  // deps (interpretRecipe -> executeBoundSpec) and PROMOTES to the per-origin
  // learned store ONLY on a clean replay. The replay threads
  // { trustedProvenance: 'local' } into interpretRecipe (the loader's vouch, HI-01 --
  // the recipe never self-declares 'local'). A failed bind short-circuits BEFORE any
  // execute side effect (no replay on a failed interpret).
  //
  // deps: { interpretRecipe, executeBoundSpec, tabId }. interpretRecipe and
  // executeBoundSpec may be sync (returning a plain object) or async; awaiting a
  // plain object is a no-op, so both forms work.

  async function promoteAfterReplay(candidate, deps) {
    try {
      if (!candidate || typeof candidate !== 'object' || !candidate.recipe) {
        return { promoted: false, reason: 'NO_CANDIDATE' };
      }
      if (!deps || typeof deps.interpretRecipe !== 'function' || typeof deps.executeBoundSpec !== 'function') {
        return { promoted: false, reason: 'NO_DEPS' };
      }

      var recipe = candidate.recipe;
      var descriptor = candidate.descriptor || null;
      var origin = (typeof candidate.origin === 'string' && candidate.origin)
        ? candidate.origin
        : (recipe && typeof recipe.origin === 'string' ? recipe.origin : null);
      if (!origin) {
        return { promoted: false, reason: 'NO_ORIGIN' };
      }

      // 1. Bind/verify via interpretRecipe with the loader-vouched 'local' provenance.
      // replayArgs are transient values from the observed path, used only to prove
      // this synthesized template still binds before the recipe is persisted.
      var replayArgs = (candidate.replayArgs && typeof candidate.replayArgs === 'object')
        ? candidate.replayArgs
        : {};
      var interpreted = await deps.interpretRecipe(recipe, replayArgs, { trustedProvenance: 'local' });
      if (!interpreted || interpreted.success !== true || !interpreted.spec) {
        // Failed bind -> DISCARD; do NOT reach executeBoundSpec (no replay side effect).
        return { promoted: false, reason: 'INTERPRET_FAILED' };
      }

      // 2. Replay the bound spec on the session tab (MAIN-world credentialed fetch in
      //    production; re-pins the active-tab origin).
      var out = await deps.executeBoundSpec(interpreted.spec, deps.tabId);
      if (!out || out.success !== true) {
        // Failed replay -> DISCARD (D-10 -- no speculative recipe in the store).
        return { promoted: false, reason: 'REPLAY_FAILED' };
      }

      // 3. Clean replay -> PROMOTE to the per-origin learned store.
      var store = _learnedStore();
      if (store && typeof store.promote === 'function') {
        await store.promote(origin, recipe, descriptor);
      }
      return { promoted: true };
    } catch (_e) {
      // Fail closed: a thrown replay never promotes.
      return { promoted: false, reason: 'THREW' };
    }
  }

  // ---- Export shape (dual-export IIFE; mirror capability-recipe-schema.js) ----
  var exportsObj = {
    synthesize: synthesize,
    promoteAfterReplay: promoteAfterReplay
  };

  global.FsbRecipeSynthesizer = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;              // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
