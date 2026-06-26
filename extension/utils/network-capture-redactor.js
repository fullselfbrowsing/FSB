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

  // ---- The auth-carrier header-name denylist (D-07; Phase 42 DSEED-02) ------
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
  //
  // Phase 42 (DSEED-02) WIDENING to the full 119-app auth-carrier NAME universe
  // audited from the vendored *-api.ts getAuth()/header-construction structs. The
  // additions are anchored to the auth-bearing forms so a BENIGN look-alike name is
  // NOT over-matched (e.g. a plain 'content-id' / 'request-id' is NOT swept; only
  // the *-client-id auth family is). Added carriers + families:
  //   - csrf / xsrf in ANY position (.*csrf.* / .*xsrf.*) -- covers csrf_token,
  //     csrftoken, x-csrftoken, x-<app>-csrf-token, the bare csrf forms
  //   - the *token* and *api[-_]key* families: .*api[_-]?key.*, .*apikey.*,
  //     .*access[_-]?token.*, .*id[_-]?token.*, .*refresh[_-]?token.*,
  //     .*session[_-]?token.*, .*auth[_-]?token.*, .*-security-token, sessionid
  //   - session_api_key (stripe) -- caught by .*session.*api.*key.* AND .*api[_-]?key.*
  //   - the auth-bearing client-id family (.*-client-id) -- linear-client-id,
  //     x-client-identifier, x-airtable-application-id-style ids (anchored to the
  //     -client-id / -application-id suffix so 'content-id' stays untouched)
  //   - 'organization' / x-org* -- linear sends the org id as the 'organization'
  //     auth header (getAuth() -> headers.organization); treated as an auth carrier
  //   - x-amz-* (the AWS SigV4 family: x-amz-security-token, x-amz-date, x-amz-target)
  //   - the vendored app id/session families: x-ig-app-id, x-modhash,
  //     x-thd-customer-token, x-notion-active-user-header, x-airbnb-api-key,
  //     x-twitter-auth-type, x-restli-protocol-version (LinkedIn auth-coupled),
  //     x-session-* -- all reached via the token/api-key/session/-id families above
  //     plus the explicit x-amz-/x-org/x-modhash/x-ig-app-id/x-*-customer-token/
  //     x-notion-active-user-header/x-restli-protocol-version/x-twitter-auth-type
  //     anchors.
  // A matched name is removed from headerNames ENTIRELY (not just its value). This
  // is the SECONDARY name-hygiene control; the PRIMARY value-exclusion property
  // (the loop never reads a header value) is independent and already sound -- so a
  // carrier NOT enumerated here STILL leaks no VALUE.
  var AUTH_CARRIER_DENYLIST = /^(authorization|proxy-authorization|authentication|cookie|set-cookie|sessionid|organization|x-org.*|x-modhash|x-ig-app-id|x-notion-active-user-header|x-restli-protocol-version|x-twitter-auth-type|x-amz-.*|.*csrf.*|.*xsrf.*|.*-client-id|.*-application-id|x-client-identifier|.*api[_-]?key.*|.*apikey.*|.*access[_-]?token.*|.*id[_-]?token.*|.*refresh[_-]?token.*|.*session[_-]?token.*|.*auth[_-]?token.*|.*-security-token|.*-customer-token|x-session-.*|x-api-key|x-auth.*|x-access-token|.*bearer.*)$/i;

  // ---- Header-NAME token-SHAPE defense-in-depth (Phase 42 DSEED-02) --------
  // Per CONTEXT: the name-based denylist above is the FLOOR; this is belt-and-
  // suspenders for the case where a credential VALUE slips into a header-NAME
  // position (a malformed/hostile header map). Applied ONLY to the header NAME
  // being considered -- NEVER to a value (the redactor must not start reading
  // values). A name MATCHING one of these distinctive token shapes is dropped from
  // headerNames, exactly like an AUTH_CARRIER_DENYLIST match. These are anchored to
  // the SAME distinctive prefixes the path-segment scrub uses (see _TOKEN_SHAPES).
  var HEADER_NAME_TOKEN_SHAPES = [
    /^(sk|pk|rk)_(live|test)_[a-z0-9]{8,}$/i,   // stripe secret/publishable/restricted
    /^xox[bcpars]-[a-z0-9-]{8,}$/i,             // slack tokens
    /^gh[opsur]_[a-z0-9]{20,}$/i,               // github PAT / oauth / server / refresh / user
    /^eyj[a-z0-9_-]+\.[a-z0-9_-]+/i             // JWT (eyJ... '.' ...) -- header.payload
  ];

  function _nameLooksTokenShaped(lowerName) {
    for (var i = 0; i < HEADER_NAME_TOKEN_SHAPES.length; i++) {
      if (HEADER_NAME_TOKEN_SHAPES[i].test(lowerName)) { return true; }
    }
    return false;
  }

  // ---- Path-segment token-SHAPE scrub (Phase 42 DSEED-02, SC3 sink #1) ------
  // A PRECISE distinctive-prefix set. Each pattern is anchored at a SEGMENT start
  // (the segment is the whole match target). This closes the leak where a token
  // embedded in a URL PATH SEGMENT (an OAuth callback / reset / share-link token)
  // would otherwise survive _shapeUrl's verbatim u.pathname AND the synthesizer's
  // keep-literal-on-separator rule -> persist into the learned recipe endpoint +
  // descriptor.description (the learned-recipe envelope).
  //
  // INTENTIONALLY NARROW: only UNAMBIGUOUS token shapes are masked. A BENIGN
  // hyphenated slug (/orgs/my-long-organization-name, /pages/my-document-title) or
  // a normal REST segment (/v1/charges) does NOT match any prefix below, so it
  // survives LITERAL and the legitimate recipe template still matches the real path
  // on replay. There is deliberately NO broad "long base64url/hex/high-entropy-with-
  // separator segment" rule -- adding one would FALSE-POSITIVE on benign hyphenated
  // slugs (/orgs/my-long-organization-name) and break legitimate recipe templates;
  // favor LITERAL on ambiguity.
  //
  // Coverage, stated honestly (do NOT over-claim a net the code does not provide):
  //   - THIS path scrub masks the distinctive token PREFIXES only (JWT eyJ. / stripe
  //     (sk|pk|rk)_ / github gh[opsur]_ / slack xox[bcpars]- / aws (AKIA|ASIA) /
  //     google ya29. / MS-Graph u!), each anchored at segment start.
  //   - The synthesizer (recipe-synthesizer.js _toPathTemplate / _LONG_TOKEN_RE)
  //     parameterizes PREFIXLESS high-entropy segments that contain NO separator:
  //     all-digit / UUID / hex>=16 / alnum>=20 over [0-9A-Za-z] ONLY (it does NOT
  //     include '-'/'_', so base64url is out of its net by construction).
  //   - RESIDUAL (accepted, uncommon): a prefixless high-entropy token that DOES
  //     carry a '-'/'_' separator in a path SEGMENT is masked by neither layer. This
  //     is NOT a documented vendored vector; reaching the persisted sink requires the
  //     consent-gated capture->replay->promote to fire on a URL that embeds a raw
  //     credential in a path segment (credentials normally ride headers/cookies). The
  //     structure-only value-exclusion FLOOR (the loop never reads a header value /
  //     body / query) and the named auth-carrier header denylist remain fully intact,
  //     so this seam is confined to the path-SEGMENT defense-in-depth layer. Honesty
  //     over a false-positive-prone widening.
  //
  // Masking a segment's SHAPE is STRUCTURE-ONLY: the path is an already-kept
  // structural field; shape-matching a segment is NOT a credential value-read.
  var _TOKEN_SHAPES = [
    /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/,   // JWT: the eyJ...'.' prefix is distinctive
    /^(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/,  // stripe sk_live_ / pk_test_ / rk_live_
    /^gh[opsur]_[A-Za-z0-9]{20,}/,              // github gho_/ghp_/ghs_/ghu_/ghr_
    /^xox[bcpars]-[A-Za-z0-9-]{8,}/,            // slack xoxb-/xoxc-/xoxp-/xoxa-/xoxr-/xoxs-
    /^(AKIA|ASIA)[A-Z0-9]{16}/,                 // aws access key id (prefix-anchored: AKIA/ASIA + 16 is distinctive, so a suffixed key id is still masked)
    /^ya29\.[A-Za-z0-9_-]+/,                    // google oauth access token
    /^u![A-Za-z0-9_-]+/                         // MS Graph share-id: u!<base64url> (excel-api.ts:145)
  ];

  function _segmentLooksTokenShaped(seg) {
    if (typeof seg !== 'string' || seg.length === 0) { return false; }
    for (var i = 0; i < _TOKEN_SHAPES.length; i++) {
      if (_TOKEN_SHAPES[i].test(seg)) { return true; }
    }
    return false;
  }

  // ---- _shapePath(pathname) -> pathname with token-shaped segments -> ':tok' --
  // Splits on '/', masks any token-shaped SEGMENT to ':tok', re-joins preserving
  // the leading slash. A non-string degrades to '/'. Benign segments are untouched.
  function _shapePath(pathname) {
    if (typeof pathname !== 'string' || pathname.length === 0) { return '/'; }
    var segments = pathname.split('/');
    for (var i = 0; i < segments.length; i++) {
      if (_segmentLooksTokenShaped(segments[i])) { segments[i] = ':tok'; }
    }
    return segments.join('/');
  }

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
        // Phase 42 (DSEED-02, SC3 sink #1): mask token-SHAPED path SEGMENTS to ':tok'
        // BEFORE the path is returned, so a path-embedded token never reaches the
        // learned-recipe envelope. Structure-only -- the path stays the pathname
        // structure; only token-shaped segments are masked (benign slugs untouched).
        return { path: _shapePath(u.pathname), origin: u.origin };
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
      // Phase 42 (DSEED-02) defense-in-depth: drop a NAME that is itself token-shaped
      // (a credential value that slipped into a header-NAME position). Applied to the
      // NAME only -- the loop still never reads a header VALUE (structure-only intact).
      if (_nameLooksTokenShaped(lower)) { continue; }
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
    AUTH_CARRIER_DENYLIST: AUTH_CARRIER_DENYLIST,
    // Phase 42 (DSEED-02) additive exports -- the header-name token-shape set + the
    // path-segment scrub (exported for the no-leak battery to reference; the existing
    // exports are UNCHANGED in shape).
    HEADER_NAME_TOKEN_SHAPES: HEADER_NAME_TOKEN_SHAPES,
    _shapePath: _shapePath
  };

  global.FsbNetworkCaptureRedactor = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                    // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
