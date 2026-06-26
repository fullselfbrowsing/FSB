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
   * GUARDED WRITE (Phase 41, DEPTH-02): slack.send_message was APPENDED as a fail-closed
   * write head -- it is the BREADTH write slug (UPGRADES opentabs__slack__send_message
   * dom->T1a) and is DISTINCT from the live-proven executable slack.chat.postMessage (a
   * 29-03 hand slug with no opentabs descriptor -- no collision). The new write ships
   * FAIL-CLOSED (the github.issues.create pattern): handle() returns the dual-field
   * RECIPE_DOM_FALLBACK_PENDING and NEVER calls callSlackMethod or ctx.executeBoundSpec
   * -- NO mutation fires, NO xoxc is scraped. It is fail-closed EVEN THOUGH
   * chat.postMessage is the executable exception; the breadth write body is
   * [ASSUMED-ENDPOINT] until 41-HUMAN-UAT.md confirms it. app.slack.com is SENSITIVE
   * (https://*.slack.com), so the T1a write is mutating-gated by the posture-B consent
   * re-gate before tier dispatch (the SC2 proof, sensitive-write-import-gate.test.js).
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
  // ---- Phase 40 (DEPTH-01) closed params schemas for the 3 new READ slugs ----
  // From the opentabs__slack__*.json descriptor props. additionalProperties:false.
  var LIST_CHANNELS_PARAMS = {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 1000 },
      types: { type: 'string', minLength: 1 },
      cursor: { type: 'string' },
      exclude_archived: { type: 'boolean' }
    },
    additionalProperties: false
  };
  var LIST_MEMBERS_PARAMS = {
    type: 'object',
    properties: {
      channel: { type: 'string', minLength: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 1000 },
      cursor: { type: 'string' }
    },
    required: ['channel'],
    additionalProperties: false
  };
  var CHANNEL_INFO_PARAMS = {
    type: 'object',
    properties: {
      channel: { type: 'string', minLength: 1 }
    },
    required: ['channel'],
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
  // ---- Phase 41 (DEPTH-02) GUARDED-WRITE params schema ----------------------
  // Props mirrored EXACTLY from the opentabs__slack__send_message.json descriptor
  // (channel + text required, thread_ts optional). additionalProperties:false -- the
  // AI cannot smuggle extra fields into a credentialed same-origin write. This scaffolds
  // the params a single live-capture flips to executable; the slack.send_message handler
  // below is fail-closed today (it NEVER calls callSlackMethod or ctx.executeBoundSpec).
  var SEND_MESSAGE_PARAMS = {
    type: 'object',
    properties: {
      channel: { type: 'string', minLength: 1 },
      text: { type: 'string', minLength: 1 },
      thread_ts: { type: 'string' }
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

  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  // The logged-out shape guard (CONTEXT Top Risk, "200-with-logged-out-body") --
  // the Slack-envelope sibling of gitlab.js guardShape / notion.js guardRpcShape.
  // A logged-out or stale-token app.slack.com tab answers a web-API POST with an
  // HTTP 200 carrying Slack's auth-failure envelope { ok:false, error:"not_authed" }
  // (or "invalid_auth"). executeBoundSpec keys success off fetch-completion, NOT off
  // the Slack `ok` field, and the head-path rot classifier skips the body-shape row,
  // so such a 200 would otherwise masquerade as a successful T1a read. When `ok` is
  // explicitly false (the documented failure envelope), return the dual-field
  // RECIPE_DOM_FALLBACK_PENDING so the breadth DOM path serves; otherwise return the
  // executeBoundSpec result verbatim. Never masks a pin/fetch failure (success!==true
  // is passed through unchanged) and never inspects or logs the token.
  function guardSlackShape(result, slug) {
    if (!result || result.success !== true) {
      return result;   // pin / fetch failure -> return verbatim; do NOT mask it.
    }
    var d = result.data;
    if (d && typeof d === 'object' && d.ok === false) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'slack-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  // Shared: scrape xoxc, then POST the given Slack web-API method with the token in
  // the body. The xoxd cookie rides same-origin automatically (no cookie header set).
  async function callSlackMethod(slug, method, fields, ctx) {
    // Step 1 -- from:'response' xoxc scrape (the pin applies to this read too).
    var probe = await ctx.executeBoundSpec(buildXoxcProbeSpec(), ctx.tabId);
    if (probe && probe.success === false) {
      return probe;   // pin / fetch failure -> return verbatim; do NOT proceed.
    }
    var xoxc = readXoxcToken(probe);
    if (!xoxc) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        method: method,
        reason: 'missing-slack-xoxc',
        fellBackToDom: true
      });
    }

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
        var res = await callSlackMethod('slack.conversations.list', 'conversations.list', {
          types: a.types || 'public_channel,private_channel',
          limit: a.limit || 100
        }, ctx);
        return guardSlackShape(res, 'slack.conversations.list');
      }
    },

    // ---- Phase 40 (DEPTH-01) -- the 3 opentabs READ slugs ------------------
    // EXACT opentabs dot-form slugs so resolve() UPGRADES each breadth descriptor
    // dom->T1a (distinct from slack.conversations.list above -- no collision). Each
    // reuses callSlackMethod: scrape xoxc, POST same-origin /api/<method> with the
    // token in the BODY (never a header, never logged); a missing token fails closed
    // to RECIPE_DOM_FALLBACK_PENDING. READ-only (conversations.* read methods); slack
    // writes are Phase 41.

    // ---- slack.list_channels (read) ----------------------------------------
    'slack.list_channels': {
      tier: 'T1a',
      origin: SLACK_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_CHANNELS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var res = await callSlackMethod('slack.list_channels', 'conversations.list', {
          types: a.types || 'public_channel,private_channel',
          limit: a.limit || 100,
          cursor: a.cursor,
          exclude_archived: a.exclude_archived
        }, ctx);
        return guardSlackShape(res, 'slack.list_channels');
      }
    },

    // ---- slack.list_members (read) -----------------------------------------
    'slack.list_members': {
      tier: 'T1a',
      origin: SLACK_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_MEMBERS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var res = await callSlackMethod('slack.list_members', 'conversations.members', {
          channel: a.channel,
          limit: a.limit || 100,
          cursor: a.cursor
        }, ctx);
        return guardSlackShape(res, 'slack.list_members');
      }
    },

    // ---- slack.get_channel_info (read) -------------------------------------
    'slack.get_channel_info': {
      tier: 'T1a',
      origin: SLACK_ORIGIN,
      sideEffectClass: 'read',
      params: CHANNEL_INFO_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var res = await callSlackMethod('slack.get_channel_info', 'conversations.info', {
          channel: a.channel
        }, ctx);
        return guardSlackShape(res, 'slack.get_channel_info');
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
        return await callSlackMethod('slack.chat.postMessage', 'chat.postMessage', {
          channel: a.channel,
          text: a.text
        }, ctx);
      }
    },

    // ======================================================================
    // Phase 41 (DEPTH-02) -- the slack.send_message GUARDED WRITE (FAIL-CLOSED).
    // ----------------------------------------------------------------------
    // slack.send_message is the BREADTH write slug (it UPGRADES
    // opentabs__slack__send_message.json -- service slack.com, write/dom -- dom->T1a)
    // and is DISTINCT from the live-proven EXECUTABLE slack.chat.postMessage above (a
    // 29-03 hand slug with NO opentabs descriptor). The two do NOT collide: distinct
    // slugs, the upgrade harness asserts send_message resolves T1a byte-exact while
    // chat.postMessage still resolves its executable head.
    //
    // The NEW write ships FAIL-CLOSED, the github.issues.create pattern (github.js:
    // 111-123): handle() returns the dual-field RECIPE_DOM_FALLBACK_PENDING (reason
    // unverified-slack-send-message-mutation, fellBackToDom:true) and NEVER calls
    // callSlackMethod or ctx.executeBoundSpec -- so NO mutation fires (and NO xoxc is
    // scraped: it fails closed before any probe). It is fail-closed EVEN THOUGH
    // chat.postMessage is the live-proven executable exception -- the new breadth write
    // body is [ASSUMED-ENDPOINT] until 41-HUMAN-UAT.md confirms it.
    //
    // SC2: app.slack.com is SENSITIVE (service-denylist.json: https://*.slack.com), so a
    // T1a write here is mutating-gated by the DENY-04 posture-B consent re-gate BEFORE
    // tier dispatch -- proven end-to-end through the live roster in
    // tests/sensitive-write-import-gate.test.js. The gate-allow and the handler-fail-close
    // are DISTINCT concerns (the gate proves consent posture; the handler proves
    // no-mutation-without-capture).

    // ---- slack.send_message (write -- fail-closed) -------------------------
    'slack.send_message': {
      tier: 'T1a',
      origin: SLACK_ORIGIN,
      sideEffectClass: 'write',
      params: SEND_MESSAGE_PARAMS,
      async handle(args, ctx) {
        return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
          slug: 'slack.send_message',
          reason: 'unverified-slack-send-message-mutation',
          fellBackToDom: true
        });
      }
    }
  };

  // ---- Self-registration into the catalog (shipped SW path) ----------------
  // IN-03 note: the head registers descriptor.service as the app subdomain
  // 'app.slack.com' (the first-party origin the spec pins), whereas the breadth
  // opentabs__slack__*.json descriptor records the bare registrable domain
  // 'slack.com'. These are intentionally different fields -- resolve() upgrades
  // dom->T1a on the byte-exact SLUG (not the service string), and the origin-pin
  // uses the spec's origin, so the distinction is cosmetic, not a mismatch.
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
