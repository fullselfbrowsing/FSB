(function (global) {
  'use strict';

  /**
   * Phase 29 Plan 03 (v0.9.99 Native Capability Catalog) -- catalog/handlers/github.js
   *
   * GitHub bundled-head handler module (CAT-02, T1a). Reviewed imperative CODE shipped
   * in the extension bundle -- NOT a recipe. github.notifications stays a T1b recipe
   * (catalog/recipes/github-notifications.json, the proven single-GET seed); THIS
   * module hosts the github.issues.* slugs whose mechanics the closed declarative
   * schema cannot express:
   *   - github.issues.list  (read)  : a same-origin GET of the issues feed.
   *   - github.issues.create (write): registered as a T1a handler, but intentionally
   *     fails closed to the DOM fallback seam until a real live-captured GitHub
   *     frontend mutation body is available. A placeholder GraphQL mutation must never
   *     report success for an issue that was not created.
   *
   * THE DECISIVE CONSTRAINT (D-09 + the origin-pin, Pitfall 3 credential-replay):
   * every spec targets GitHub's OWN first-party origin https://github.com, because
   * ctx.executeBoundSpec re-pins the active tab and the session cookie is scoped to
   * that origin. The documented public REST/GraphQL API on the SEPARATE api subdomain
   * does NOT carry the first-party session and is FORBIDDEN here (that separate-origin
   * host never appears in this file -- asserted by the test). The handler NEVER injects
   * into a page itself (no browser-extension scripting/tabs APIs are referenced); it
   * only builds bound spec(s) and calls ctx.executeBoundSpec, so the active-tab
   * origin-pin (inside executeBoundSpec) stays on the head path (D-12).
   *
   * SECURITY (T-29-08, block-on-high): github.issues.create does not scrape CSRF or
   * issue a mutation while the endpoint/body remain unverified. When the live capture
   * replaces this fallback, token material must still stay only inside the bound spec
   * and never in logs/diagnostics.
   *
   * [ASSUMED] -- internal endpoint paths are training/inference-derived (RESEARCH
   * Assumption A2) and MUST be confirmed against a live authenticated github.com tab
   * before the head is trusted (29-03 Task 4, recorded as human_needed live-UAT in
   * 29-HUMAN-UAT.md). Registry/public-API existence does NOT confer verified status
   * for an INTERNAL endpoint. The origin-separation fact (the public api subdomain is
   * a separate origin) IS web-search-verified.
   *
   * Module shell: the dual-export IIFE mirror of capability-interpreter.js:372-385 --
   * the service worker reads global.FsbHandlerGithub after importScripts and (the
   * shipped path) the module self-registers its slugs into FsbCapabilityCatalog via
   * registerHandler at load; Node tests require() the module.exports slug-keyed object.
   * Eval-free, no chrome.*, no network of its own. NO EMOJIS, ASCII-only source.
   */

  // ---- Shared spec defaults -------------------------------------------------
  var GITHUB_ORIGIN = 'https://github.com';
  var ISSUES_LIST_PARAMS = {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1 }
    },
    additionalProperties: false
  };
  var ISSUES_CREATE_PARAMS = {
    type: 'object',
    properties: {
      repositoryId: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1 },
      body: { type: 'string' }
    },
    required: ['repositoryId', 'title'],
    additionalProperties: false
  };

  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  var handlers = {
    // ---- github.issues.list (read) -----------------------------------------
    'github.issues.list': {
      tier: 'T1a',
      origin: GITHUB_ORIGIN,
      sideEffectClass: 'read',
      params: ISSUES_LIST_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITHUB_ORIGIN + '/issues';
        if (a.query) {
          url += '?q=' + encodeURIComponent(String(a.query));
        }
        var spec = {
          // [ASSUMED-ENDPOINT: capture live in 29-03 Task 4] -- the issues feed read
          // path on github.com (NOT the public api subdomain) so the first-party
          // session cookie attaches.
          url: url,
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          body: null,
          query: {},
          authStrategy: 'same-origin-cookie',
          origin: GITHUB_ORIGIN,
          extract: '@'
        };
        return await ctx.executeBoundSpec(spec, ctx.tabId);
      }
    },

    // ---- github.issues.create (write) --------------------------------------
    // The write slug remains discoverable, but the current endpoint/body were only
    // assumed. Fail closed so the model uses DOM tools instead of stamping success for
    // a placeholder mutation.
    'github.issues.create': {
      tier: 'T1a',
      origin: GITHUB_ORIGIN,
      sideEffectClass: 'write',
      params: ISSUES_CREATE_PARAMS,
      async handle(args, ctx) {
        return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
          slug: 'github.issues.create',
          reason: 'unverified-github-create-mutation',
          fellBackToDom: true
        });
      }
    }
  };

  // ---- Self-registration into the catalog (shipped SW path) ----------------
  // A T1a head handler registers its slug -> entry into FsbCapabilityCatalog at load,
  // AFTER the catalog module loads (background.js importScripts order). typeof-guarded
  // so the module loads cleanly under the Node test harness (the catalog global may be
  // absent there -> the test require()s the slug-keyed object directly).
  if (typeof FsbCapabilityCatalog !== 'undefined' && FsbCapabilityCatalog
      && typeof FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: handlers[slug].origin,
          params: handlers[slug].params,
          descriptor: { slug: slug, service: 'github.com', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerGithub = handlers;   // SW importScripts consumer reads this global
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;          // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
