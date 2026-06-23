(function(global) {
  'use strict';

  /**
   * Phase 31 plan 02 (v0.9.99 -- DISC-03 / LEARN-02; D-05/D-06/D-07/D-08) --
   * network-capture-redactor.js
   *
   * THE capture-time security boundary. Reduces a raw CDP Network request /
   * response to SHAPE ONLY, inside the onEvent handler, BEFORE anything leaves
   * the handler frame (D-05). The redacted ObservedCall shape is the only
   * artifact that ever persists; raw bodies, header VALUES, query strings, and
   * PII never do.
   *
   * redactRequest(request)  -> { method, path, origin, headerNames }
   *   * path     -- u.pathname ONLY; the query string and fragment are DROPPED
   *                 (D-06). A URL that does not parse degrades to path '/' +
   *                 origin null (never throws).
   *   * headerNames -- the header NAMES only, lowercased; values are NEVER read
   *                 (D-07). Any name matching the auth-carrier denylist
   *                 (authorization / proxy-authorization / authentication /
   *                 cookie / set-cookie / x-csrf* / x-xsrf* / x-api-key / x-auth* /
   *                 x-access-token / *bearer*) is removed entirely so even an
   *                 unrecognized auth header leaks nothing.
   *   * NO body / postData field exists on the returned object (D-06): the
   *     redactor never reads request.postData, so it cannot leak.
   *
   * redactResponse(response) -> { status, mimeType }
   *   * ONLY status + mimeType (the SHAPE, D-08). No headers (dropped entirely --
   *     strictly safer than names-only per RESEARCH Open Q3), no body, and NO
   *     code path to the CDP response-body fetch command anywhere (D-08).
   *
   * The structural exclusion is the PRIMARY control: this module is UNABLE to
   * leak a credential because it never reads the excluded fields (header values,
   * bodies, query params). redactForLog is composed for defensive reduction of a
   * non-string url (shape-only origin), but the shape contract holds even when
   * redactForLog is absent (the Node redaction suite loads this module alone).
   *
   * Module shell: the dual-export IIFE mirror of capability-interpreter.js /
   * service-denylist.js. The service worker reads global.FsbNetworkCaptureRedactor
   * after importScripts; Node tests require() the module.exports. Kept
   * dynamic-code-FREE (no run-string-as-code / function-from-string / dynamic
   * module loader constructs, even in comments) -- it is the most
   * credential-adjacent new surface in the milestone.
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- The auth-carrier header-name denylist (D-07) ------------------------
  // Case-insensitive, anchored to the full header name. Covers the common auth
  // carriers AND their families so even a name-only disclosure leaks nothing:
  //   - authorization / proxy-authorization / authentication
  //   - cookie / set-cookie
  //   - x-csrf* / x-xsrf*  (BARE x-csrf/x-xsrf AND the hyphenated x-csrf-token etc;
  //                         the prior x-csrf-.* required a trailing hyphen so a bare
  //                         x-csrf leaked -- ME-03)
  //   - x-api-key
  //   - x-auth*  (x-auth-token, ...)  /  x-access-token
  //   - ANY name containing 'bearer'
  // A matched name is removed from headerNames ENTIRELY (not just its value). This
  // is the SECONDARY name-hygiene control; the PRIMARY value-exclusion property
  // (the loop never reads a header value) is independent and already sound.
  var AUTH_CARRIER_DENYLIST = /^(authorization|proxy-authorization|authentication|cookie|set-cookie|x-csrf.*|x-xsrf.*|x-api-key|x-auth.*|x-access-token|.*bearer.*)$/i;

  // ---- lazy redactForLog accessor (composed defensively for free-form values)
  // typeof-guarded so the redactor degrades gracefully when redactForLog has not
  // been loaded (the Node redaction suite require()s this module standalone).
  function _redactForLog() {
    return (typeof globalThis !== 'undefined' && typeof globalThis.redactForLog === 'function')
      ? globalThis.redactForLog
      : null;
  }

  // ---- _shapeUrl(url) -> { path, origin } ----------------------------------
  // Parses the url with new URL() inside a try/catch and keeps ONLY the pathname
  // (no query, no fragment -- D-06) and the bare origin. A non-string or
  // unparseable url degrades to { path: '/', origin: null } WITHOUT throwing.
  // For a non-string url, redactForLog (if present) is composed purely as a
  // defensive shape reduction -- it can only ever yield an origin or a length,
  // never raw content.
  function _shapeUrl(url) {
    if (typeof url === 'string' && url.length > 0) {
      try {
        var u = new URL(url);
        return { path: u.pathname, origin: u.origin };
      } catch (_e) {
        return { path: '/', origin: null };
      }
    }
    // Non-string url: compose redactForLog defensively (shape only); never
    // surface raw content. The result is discarded for path/origin (which stay
    // safe defaults) -- the call exists so any future free-form value flows
    // through the proven shape-only reducer rather than being read raw.
    var rfl = _redactForLog();
    if (rfl) { try { rfl(url, 'url'); } catch (_e2) { /* best-effort */ } }
    return { path: '/', origin: null };
  }

  // ---- redactRequest(request) -> { method, path, origin, headerNames } ------
  function redactRequest(request) {
    var req = (request && typeof request === 'object') ? request : {};
    var shaped = _shapeUrl(req.url);
    var headerNames = [];
    var headers = (req.headers && typeof req.headers === 'object') ? req.headers : {};
    // NAMES ONLY -- the loop reads keys, never values (D-07). Auth carriers are
    // skipped entirely. Own-key guard so a prototype-shaped header map cannot
    // smuggle inherited names.
    for (var name in headers) {
      if (!Object.prototype.hasOwnProperty.call(headers, name)) { continue; }
      var lower = String(name).toLowerCase();
      if (AUTH_CARRIER_DENYLIST.test(lower)) { continue; }
      headerNames.push(lower);
    }
    // NO body / postData key by construction (D-06): the returned object never
    // carries request.postData -- the redactor does not read it.
    return {
      method: (typeof req.method === 'string') ? req.method : 'GET',
      path: shaped.path,
      origin: shaped.origin,
      headerNames: headerNames
    };
  }

  // ---- redactResponse(response) -> { status, mimeType } --------------------
  // SHAPE ONLY (D-08): status + mimeType, nothing else. No headers, no body, and
  // crucially NO call path to the CDP response-body fetch command -- the response
  // BODY is never read here or anywhere downstream of capture.
  function redactResponse(response) {
    var resp = (response && typeof response === 'object') ? response : {};
    return {
      status: (typeof resp.status === 'number') ? resp.status : 0,
      mimeType: (typeof resp.mimeType === 'string') ? resp.mimeType : ''
    };
  }

  // ---- Export shape (dual-export IIFE; mirror capability-interpreter.js) ----
  var exportsObj = {
    redactRequest: redactRequest,
    redactResponse: redactResponse,
    AUTH_CARRIER_DENYLIST: AUTH_CARRIER_DENYLIST
  };

  global.FsbNetworkCaptureRedactor = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                    // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
