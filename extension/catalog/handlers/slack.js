(function (global) {
  'use strict';

  /**
   * Phase 29 Plan 03 (v0.9.99 Native Capability Catalog) -- catalog/handlers/slack.js
   *
   * Slack bundled-head handler module (CAT-02, T1a -- the SPLIT-TOKEN case). Reviewed
   * imperative CODE shipped in the extension bundle. Slack's own web client calls its
   * internal web API with a split credential the closed declarative recipe schema
   * cannot express, so it is a handler:
   *   - slack.conversations.list (read)  : list the workspace conversations.
   *   - slack.chat.postMessage  (write)  : post a message to a channel.
   *
   * THE SPLIT TOKEN (RESEARCH Head-Service Selection row #3, web-search-verified
   * mechanics):
   *   - `xoxd-...` is an HttpOnly cookie that rides the same-origin request
   *     automatically (the handler sets NO cookie header -- the browser attaches it).
   *   - `xoxc-...` is a per-workspace token the web client keeps in page state; it is
   *     SCRAPED from the page (from:'response', 27-D-06 carried forward) and placed in
   *     the request BODY as a form field, NOT a header. This body-placement is the
   *     load-bearing Slack-specific detail (a header would not authenticate).
   *
   * THE ORIGIN-PIN (D-09 + D-12, Pitfall 3 credential-replay): every spec targets
   * Slack's OWN first-party origin https://app.slack.com so the xoxd cookie attaches.
   * The handler NEVER injects into a page itself (no browser-extension scripting/tabs
   * APIs); it only builds bound spec(s) and calls ctx.executeBoundSpec, which re-pins
   * the active tab before any side effect.
   *
   * SECURITY (T-29-08, block-on-high): the xoxc/xoxd token is placed ONLY into the
   * bound spec (xoxc in the body, xoxd left to the cookie). It is NEVER written to a
   * console/diagnostic/log line and never returned off-device (redactForLog
   * discipline). No diagnostic line in this module names a token-bearing variable.
   *
   * [ASSUMED] -- the internal web-API method PATHS, the xoxc page location, and the
   * exact body field name below are training/inference-derived (RESEARCH Assumption
   * A2-class) and MUST be confirmed against a live authenticated app.slack.com tab
   * before the head is trusted (29-03 Task 4, recorded as human_needed live-UAT in
   * 29-HUMAN-UAT.md). The xoxc-in-body + xoxd-cookie split itself IS web-search-
   * verified; the exact endpoint shape is not.
   *
   * Module shell: the dual-export IIFE mirror of capability-interpreter.js:372-385 --
   * the service worker reads global.FsbHandlerSlack after importScripts and the module
   * self-registers its slugs into FsbCapabilityCatalog at load; Node tests require()
   * the module.exports slug-keyed object. Eval-free, no browser scripting/tabs APIs,
   * no network of its own. NO EMOJIS, ASCII-only source.
   */

  var SLACK_ORIGIN = 'https://app.slack.com';
  var CONVERSATIONS_LIST_PARAMS = {
    type: 'object',
    properties: {
      types: { type: 'string', minLength: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 1000 }
    },
    additionalProperties: false
  };
  var POST_MESSAGE_PARAMS = {
    type: 'object',
    properties: {
      channel: { type: 'string', minLength: 1 },
      text: { type: 'string', minLength: 1 }
    },
    required: ['channel', 'text'],
    additionalProperties: false
  };

  // A read-only same-origin GET the handler issues first to obtain the xoxc token
  // from the page response (from:'response'). The token extraction is [ASSUMED] --
  // the real page location is captured live in Task 4. Returns an executeBoundSpec-
  // shaped spec.
  function buildXoxcProbeSpec() {
    return {
      // [ASSUMED-ENDPOINT: capture live in 29-03 Task 4] -- the client boot page
      // whose state carries the per-workspace xoxc token.
      url: SLACK_ORIGIN + '/',
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: SLACK_ORIGIN,
      extract: '@'
    };
  }

  // Pull the xoxc token out of an executeBoundSpec result WITHOUT ever logging it.
  // [ASSUMED] carrier field -- the live capture (Task 4) replaces this with the real
  // location. Returns a string token or null. Never console-logs the value.
  function readXoxcToken(probeResult) {
    if (!probeResult || probeResult.success !== true) { return null; }
    var d = probeResult.data;
    if (d && typeof d === 'object') {
      // [ASSUMED-ENDPOINT: capture live in 29-03 Task 4] -- candidate carriers.
      if (typeof d.xoxc === 'string') { return d.xoxc; }
      if (typeof d.api_token === 'string') { return d.api_token; }
    }
    var text = (typeof probeResult.text === 'string') ? probeResult.text : '';
    if (text) {
      var patterns = [
        /"xoxc"\s*:\s*"([^"]+)"/,
        /"api_token"\s*:\s*"([^"]+)"/,
        /(xoxc-[A-Za-z0-9-]+)/i
      ];
      for (var i = 0; i < patterns.length; i++) {
        var m = patterns[i].exec(text);
        if (m && m[1]) { return m[1]; }
      }
    }
    return null;
  }

  // Build a form-encoded body placing the scraped token in the BODY (Slack puts the
  // token in the body, never a header). Extra fields (channel, text, ...) ride along.
  // The token value is embedded in the returned string but NEVER logged.
  function buildSlackBody(token, fields) {
    var parts = [];
    if (token) {
      // [ASSUMED-ENDPOINT: capture live in 29-03 Task 4] -- the exact body field name
      // Slack's web client uses for the token ('token' is the documented field).
      parts.push('token=' + encodeURIComponent(token));
    }
    var f = fields || {};
    for (var k in f) {
      if (Object.prototype.hasOwnProperty.call(f, k) && f[k] != null) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(f[k])));
      }
    }
    return parts.join('&');
  }

  // Shared: scrape xoxc, then POST the given Slack web-API method with the token in
  // the body. The xoxd cookie rides same-origin automatically (no cookie header set).
  async function callSlackMethod(method, fields, ctx) {
    // Step 1 -- from:'response' xoxc scrape (the pin applies to this read too).
    var probe = await ctx.executeBoundSpec(buildXoxcProbeSpec(), ctx.tabId);
    if (probe && probe.success === false) {
      return probe;   // pin / fetch failure -> return verbatim; do NOT proceed.
    }
    var xoxc = readXoxcToken(probe);

    // Step 2 -- the web-API POST. Token in the BODY, not a header. Content-Type is
    // form-encoded (Slack's web client posts form data). NO xoxc in any header.
    var spec = {
      // [ASSUMED-ENDPOINT: capture live in 29-03 Task 4] -- Slack's same-origin web
      // API method path (e.g. /api/conversations.list).
      url: SLACK_ORIGIN + '/api/' + method,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: buildSlackBody(xoxc, fields),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: SLACK_ORIGIN,
      extract: '@'
    };
    return await ctx.executeBoundSpec(spec, ctx.tabId);
  }

  var handlers = {
    // ---- slack.conversations.list (read) -----------------------------------
    'slack.conversations.list': {
      tier: 'T1a',
      origin: SLACK_ORIGIN,
      sideEffectClass: 'read',
      params: CONVERSATIONS_LIST_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        return await callSlackMethod('conversations.list', {
          types: a.types || 'public_channel,private_channel',
          limit: a.limit || 100
        }, ctx);
      }
    },

    // ---- slack.chat.postMessage (write) ------------------------------------
    // A mutating call -- inherits the resume-sidecar + RECOVERY_AMBIGUOUS
    // classification inside executeBoundSpec (T-29-10); never blind-retried here.
    'slack.chat.postMessage': {
      tier: 'T1a',
      origin: SLACK_ORIGIN,
      sideEffectClass: 'write',
      params: POST_MESSAGE_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        return await callSlackMethod('chat.postMessage', {
          channel: a.channel,
          text: a.text
        }, ctx);
      }
    }
  };

  // ---- Self-registration into the catalog (shipped SW path) ----------------
  if (typeof FsbCapabilityCatalog !== 'undefined' && FsbCapabilityCatalog
      && typeof FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: handlers[slug].origin,
          params: handlers[slug].params,
          descriptor: { slug: slug, service: 'app.slack.com', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerSlack = handlers;   // SW importScripts consumer reads this global
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;         // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
