(function(global) {
  'use strict';

  /**
   * Phase 27 plan 02 (v0.9.99 Native Capability Catalog) -- capability-fetch.js
   *
   * The Wall-2 spine: the fixed, bundled page-MAIN-world authenticated fetch that
   * carries first-party HttpOnly cookies, scrapes CSRF in-page, pins the origin a
   * SECOND time at the active tab, survives service-worker eviction via the
   * resume-sidecar, classifies mid-mutation ambiguity, and runs the read-only
   * extract service-worker-side. It drives a bound request spec produced by the
   * Phase 26 interpreter (FsbCapabilityInterpreter.interpretRecipe); it does NOT
   * itself validate or bind.
   *
   * Three exports (FETCH-01..05):
   *   - capabilityFetchInPage(spec)   -- the FIXED, self-contained page func that
   *       runs in the page MAIN world via chrome.scripting.executeScript. It
   *       references ONLY Web APIs (document, fetch, JSON, URL, Object) and
   *       args[0] (the spec). It is stringified by executeScript and re-parsed in
   *       the page realm, so it captures NOTHING from this module's scope (D-03,
   *       Wall-1). It NEVER returns cookies or auth material.
   *   - executeBoundSpec(spec, tabId) -- the service-worker wrapper. It re-asserts
   *       the active/owned tab origin === spec.origin BEFORE any side effect
   *       (FETCH-03 part 2, D-08 part 2), wraps the fetch in a BEFORE_API_REQUEST
   *       resume-sidecar snapshot (FETCH-04, D-10), injects capabilityFetchInPage
   *       into the page MAIN world, and runs the read-only JMESPath extract
   *       service-worker-side after the body returns (D-07).
   *   - classifyOnWake(snapshot)      -- a THIN LOCAL classifier (CAVEAT-1, D-11)
   *       that reuses the Lattice ResumePolicy marker STRINGS but reads the FLAT
   *       snake_case task-store envelope (current_step + method) directly. A
   *       mutating-method (POST/PUT/PATCH/DELETE) in-flight snapshot classifies to
   *       RECOVERY_AMBIGUOUS and is NEVER blind-retried; a GET is re-issuable.
   *
   * Locked decisions implemented here (27-CONTEXT.md / 27-RESEARCH.md):
   *   - D-01 this module is the dynamic-code-free MAIN-world fetch home. It is on
   *          the recipe-path CI-guard allowlist (scanned even in comments), so it
   *          contains ZERO run-string-as-code / function-from-string / dynamic
   *          module loader constructs -- not even in a comment or string literal.
   *   - D-03 capabilityFetchInPage is serialization-safe: a single top-level
   *          function with only inline locals, no closure variables, no sibling
   *          helpers, no service-worker globals.
   *   - D-04 the wrapper direct-drives a tabId (no MCP tool, no router -- those are
   *          Phase 28/29).
   *   - D-05 the CSRF token is live-scraped in-page BEFORE the request.
   *   - D-06 a from:'response' CSRF source is deferred to Phase 29 (the schema
   *          carries the enum member; this module does not implement it).
   *   - D-07 the read-only JMESPath extract runs service-worker-side AFTER the body
   *          returns, via FsbCapabilityInterpreter.getFSBJmespath().search -- the
   *          engine is not in page scope.
   *   - D-10 a BEFORE_API_REQUEST resume-sidecar snapshot is written (best-effort)
   *          BEFORE executeScript and a terminal write + delete on completion.
   *   - D-11 classifyOnWake never returns a verdict that blind-retries a mutation.
   *   - D-13 the hardcoded github.com GET /notifications recipe is the FETCH-05
   *          proof; it passes the closed schema.
   *   - D-15 the live logged-in-shape assertion is Plan 03's human-gated UAT; this
   *          module is proven in CI with a stubbed executeScript recorder.
   *   - D-16 the reserved /_graphql input[name=authenticity_token] CSRF exemplar
   *          reads .value (CAVEAT-2), not .content.
   *
   * Module shell: the dual-export IIFE mirror of extension/utils/mcp-task-store.js
   * -- the same lazy globalThis.chrome accessor (so the module loads cleanly under
   * the Node test harness where chrome is mocked AFTER load) and the same
   * global.Fsb* + module.exports dual export. Sibling service-worker globals
   * (FsbMcpTaskStore, FsbCapabilityInterpreter) are reached only through
   * typeof-guards, never closure/import. The in-page func reaches NONE of them.
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- Lazy globalThis.chrome accessor (mcp-task-store.js:59-61 pattern) ----
  //
  // Lazy so the module loads cleanly under the Node test harness where chrome is
  // mocked AFTER module load. The in-page func does NOT use this -- it is
  // serialization-isolated and reads the chrome-free page realm.

  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }

  // ---- typeof-guarded sibling-global accessors (NO closure/import) ----------
  //
  // Service-worker-side helpers only. Each returns null when its global is absent
  // so the wrapper degrades gracefully (best-effort sidecar; raw json on a missing
  // extract engine). The in-page func reaches NEITHER -- it is serialization-safe.

  function _getTaskStore() {
    return (typeof globalThis !== 'undefined' && globalThis.FsbMcpTaskStore)
      ? globalThis.FsbMcpTaskStore : null;
  }

  function _getJmespathEngine() {
    var interp = (typeof FsbCapabilityInterpreter !== 'undefined' && FsbCapabilityInterpreter)
      ? FsbCapabilityInterpreter : null;
    if (interp && typeof interp.getFSBJmespath === 'function') {
      return interp.getFSBJmespath();
    }
    return null;
  }

  // ---- Typed-error dual-field RETURN (capability-interpreter.js:85-93) -------
  //
  // RETURN (never throw). Set BOTH code AND errorCode AND error so errors.ts
  // resolveErrorKey surfaces the code verbatim from either field. Used for the
  // wrapper's RECIPE_ORIGIN_MISMATCH (active-tab pin) and RECOVERY_AMBIGUOUS.

  function _typedError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  // ===========================================================================
  // capabilityFetchInPage -- the FIXED, self-contained page MAIN-world func.
  // ===========================================================================
  //
  // D-03 / Wall-1: this function is stringified by chrome.scripting.executeScript
  // and re-parsed in the page realm. It MUST reference ONLY Web APIs (document,
  // fetch, JSON, URL, Object) and args[0] (spec). It captures NOTHING from this
  // module: no _getChrome, no _getTaskStore, no jmespath, no sibling helper. Any
  // free identifier that is not a Web API or a spec field would throw a
  // ReferenceError against a real page (CI's stubbed executeScript never runs the
  // body, which is why a static toString() guard asserts the prohibition).
  //
  // It returns ONLY non-secret response data { ok, status, finalUrl, redirected,
  // json, text }; it NEVER reads or returns cookies or auth material. The
  // read-only extract is NOT run here -- it runs service-worker-side (D-07).

  function capabilityFetchInPage(spec) {
    return (async function () {
      try {
        var headers = Object.assign({}, (spec && spec.headers) || {});

        // FETCH-02 (D-05): live CSRF scrape, in-page, BEFORE the request.
        if (spec && spec.csrfSource && spec.csrfSource.header) {
          var token = null;
          var src = spec.csrfSource;
          if (src.from === 'meta' && src.selector) {
            var el = document.querySelector(src.selector);
            if (el) {
              // CAVEAT-2 (D-16): an <input> (the reserved /_graphql exemplar
              // input[name=authenticity_token]) holds its token in .value; a
              // <meta> tag holds it in .content / getAttribute('content').
              var tag = el.tagName ? el.tagName.toLowerCase() : '';
              if (tag === 'input') {
                token = el.value || el.getAttribute('value') || null;
              } else {
                token = el.getAttribute('content') || el.content || null;
              }
            }
          } else if (src.from === 'cookie' && src.selector) {
            // Minimal document.cookie parse keyed by the selector (the cookie name).
            var prefix = '; ' + src.selector + '=';
            var parts = ('; ' + document.cookie).split(prefix);
            if (parts.length === 2) {
              var tail = parts.pop().split(';').shift();
              try { token = decodeURIComponent(tail); } catch (decErr) { token = tail; }
            }
          }
          // from:'response' is deferred to Phase 29 (D-06): no in-page handling.
          if (token) { headers[src.header] = token; }
        }

        var method = (spec && spec.method) || 'GET';
        var init = {
          method: method,
          headers: headers,
          // FETCH-01: credentials:'include' is what attaches the first-party
          // HttpOnly cookies of the page origin (Wall 2).
          credentials: 'include',
          // redirect:'manual' keeps a 302 -> /login observable as the logged-out
          // signal (D-14) instead of being silently followed.
          redirect: 'manual'
        };
        // Only attach a body for non-GET/HEAD methods.
        if (spec && spec.body != null && method !== 'GET' && method !== 'HEAD') {
          init.body = (typeof spec.body === 'string') ? spec.body : JSON.stringify(spec.body);
        }

        var resp = await fetch((spec && spec.url) || '', init);

        // Defensive body read (Pitfall 5): read status + url FIRST so the
        // 200-vs-302 signal is never lost to a parse throw on an HTML body.
        var status = resp.status;
        var finalUrl = resp.url;
        var redirected = resp.type === 'opaqueredirect' || (status >= 300 && status < 400);

        var CAP = 256 * 1024;
        var text = '';
        try {
          text = await resp.text();
        } catch (bodyErr) {
          text = '';
        }
        if (text && text.length > CAP) { text = text.slice(0, CAP); }

        var json = null;
        try {
          json = JSON.parse(text);
        } catch (parseErr) {
          json = null;
        }

        // Return ONLY non-secret response data. No cookies, no auth material.
        return {
          ok: resp.ok,
          status: status,
          finalUrl: finalUrl,
          redirected: redirected,
          json: json,
          text: json ? null : text
        };
      } catch (err) {
        return { error: (err && err.message) ? err.message : String(err) };
      }
    })();
  }

  // ===========================================================================
  // executeBoundSpec -- the service-worker wrapper (Task 2 of this plan).
  // ===========================================================================
  //
  // Placeholder pending Task 2 -- the active-tab pin + resume-sidecar + MAIN-world
  // injection + service-worker-side extract land in the next task of this plan.
  // The export object below lists all three names so the module surface is stable.

  async function executeBoundSpec(spec, tabId) {
    return _typedError('RECIPE_EXEC_NOT_IMPLEMENTED', {
      detail: 'executeBoundSpec is implemented in Phase 27 Plan 02 Task 2'
    });
  }

  // ===========================================================================
  // classifyOnWake -- the thin local mid-mutation classifier (Task 2).
  // ===========================================================================
  //
  // Placeholder pending Task 2 -- the CAVEAT-1 flat-snapshot classifier lands in
  // the next task of this plan.

  function classifyOnWake(snapshot) {
    return 'RECOVERY_AMBIGUOUS';
  }

  // ---- Export shape (mirror mcp-task-store.js:179-194) ----------------------

  var exportsObj = {
    capabilityFetchInPage: capabilityFetchInPage,
    executeBoundSpec: executeBoundSpec,
    classifyOnWake: classifyOnWake
  };

  global.FsbCapabilityFetch = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;            // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
