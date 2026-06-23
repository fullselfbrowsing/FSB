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
   *   - github.issues.create (write): a same-origin POST to GitHub's own frontend
   *     persisted-query GraphQL endpoint, which needs (a) a query body and (b) a CSRF
   *     token SCRAPED from the page first (from:'response', 27-D-06 carried forward) --
   *     neither expressible as recipe DATA, so it is a handler.
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
   * SECURITY (T-29-08, block-on-high): the scraped CSRF token is placed ONLY into the
   * bound spec's header; it is NEVER written to a console/diagnostic/log line and
   * never returned off-device (redactForLog discipline). No diagnostic line in this
   * module names a token-bearing variable.
   *
   * [ASSUMED] -- every internal endpoint PATH and the CSRF carrier below is training/
   * inference-derived (RESEARCH Assumption A2) and MUST be confirmed against a live
   * authenticated github.com tab before the head is trusted (29-03 Task 4, recorded as
   * human_needed live-UAT in 29-HUMAN-UAT.md). Registry/public-API existence does NOT
   * confer verified status for an INTERNAL endpoint. The origin-separation fact (the
   * public api subdomain is a separate origin) IS web-search-verified.
   *
   * Module shell: the dual-export IIFE mirror of capability-interpreter.js:372-385 --
   * the service worker reads global.FsbHandlerGithub after importScripts and (the
   * shipped path) the module self-registers its slugs into FsbCapabilityCatalog via
   * registerHandler at load; Node tests require() the module.exports slug-keyed object.
   * Eval-free, no chrome.*, no network of its own. NO EMOJIS, ASCII-only source.
   */

  // ---- Shared spec defaults -------------------------------------------------
  var GITHUB_ORIGIN = 'https://github.com';

  // A read-only same-origin GET spec the handler can issue first to obtain the CSRF
  // token from the page response (from:'response'). The token extraction itself is
  // [ASSUMED] -- the real selector/shape is captured live in Task 4.
  function buildCsrfProbeSpec() {
    return {
      // [ASSUMED-ENDPOINT: capture live in 29-03 Task 4] -- the issues page whose
      // HTML carries the frontend CSRF token GitHub includes on a /_graphql POST.
      url: GITHUB_ORIGIN + '/issues',
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: GITHUB_ORIGIN,
      // Read-only extract: the bound primitive runs this JMESPath service-worker-side.
      // '@' returns the whole body; the real token-bearing field is captured in Task 4.
      extract: '@'
    };
  }

  // Pull a CSRF token out of an executeBoundSpec result WITHOUT ever logging it.
  // [ASSUMED] field names -- the live capture (Task 4) replaces these with the real
  // token location. Returns a string token or null. Never console-logs the value.
  function readCsrfToken(probeResult) {
    if (!probeResult || probeResult.success !== true) { return null; }
    var d = probeResult.data;
    if (d && typeof d === 'object') {
      // [ASSUMED-ENDPOINT: capture live in 29-03 Task 4] -- candidate carriers.
      if (typeof d.csrf_token === 'string') { return d.csrf_token; }
      if (typeof d.authenticity_token === 'string') { return d.authenticity_token; }
    }
    var text = (typeof probeResult.text === 'string') ? probeResult.text : '';
    if (text) {
      var patterns = [
        /"csrf_token"\s*:\s*"([^"]+)"/,
        /"authenticity_token"\s*:\s*"([^"]+)"/,
        /name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i,
        /name=["']authenticity_token["'][^>]*value=["']([^"']+)["']/i
      ];
      for (var i = 0; i < patterns.length; i++) {
        var m = patterns[i].exec(text);
        if (m && m[1]) { return m[1]; }
      }
    }
    return null;
  }

  var handlers = {
    // ---- github.issues.list (read) -----------------------------------------
    'github.issues.list': {
      tier: 'T1a',
      origin: GITHUB_ORIGIN,
      sideEffectClass: 'read',
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
    // A mutation via GitHub's own frontend persisted-query GraphQL endpoint. Needs a
    // CSRF token scraped from the page FIRST (from:'response'), then a same-origin
    // POST carrying the GraphQL body. The token rides the spec header ONLY -- never a
    // log line (T-29-08). The mutating call inherits the resume-sidecar +
    // RECOVERY_AMBIGUOUS classification inside executeBoundSpec (T-29-10); never blind-
    // retried here.
    'github.issues.create': {
      tier: 'T1a',
      origin: GITHUB_ORIGIN,
      sideEffectClass: 'write',
      async handle(args, ctx) {
        var a = args || {};

        // Step 1 -- from:'response' CSRF scrape: a prior read-only GET whose response
        // carries the frontend CSRF token. (The pin inside executeBoundSpec applies to
        // this read too.)
        var probe = await ctx.executeBoundSpec(buildCsrfProbeSpec(), ctx.tabId);
        if (probe && probe.success === false) {
          // The probe itself failed the pin (RECIPE_ORIGIN_MISMATCH) or fetch -> return
          // it verbatim; do NOT proceed to the mutation.
          return probe;
        }
        var csrf = readCsrfToken(probe);

        // Step 2 -- the mutation POST. Headers carry the scraped token (when present);
        // the token value is NEVER logged. The GraphQL body shape is [ASSUMED].
        var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (csrf) {
          // [ASSUMED-ENDPOINT: capture live in 29-03 Task 4] -- the exact CSRF header
          // name GitHub's frontend uses on a /_graphql POST.
          headers['X-CSRF-Token'] = csrf;
        }
        var spec = {
          // [ASSUMED-ENDPOINT: capture live in 29-03 Task 4] -- GitHub's same-origin
          // frontend persisted-query GraphQL endpoint (NOT the public api subdomain).
          url: GITHUB_ORIGIN + '/_graphql',
          method: 'POST',
          headers: headers,
          // [ASSUMED] persisted-query mutation body -- real operation name / hash
          // captured in Task 4.
          body: JSON.stringify({
            query: 'mutation CreateIssue { __typename }',
            variables: {
              repositoryId: a.repositoryId || null,
              title: a.title || '',
              body: a.body || ''
            }
          }),
          query: {},
          authStrategy: 'same-origin-cookie',
          origin: GITHUB_ORIGIN,
          extract: '@'
        };
        return await ctx.executeBoundSpec(spec, ctx.tabId);
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
          descriptor: { slug: slug, service: 'github.com', sideEffectClass: handlers[slug].sideEffectClass }
        });
      }
    }
  }

  global.FsbHandlerGithub = handlers;   // SW importScripts consumer reads this global
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;          // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
