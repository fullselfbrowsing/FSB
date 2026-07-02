(function (global) {
  'use strict';

  /**
   * Gemini same-origin READ head.
   *
   * Gemini exposes its web-app state and read RPCs from
   * https://gemini.google.com. Reads use executeBoundSpec only, with a
   * same-origin bootstrap page read for Wiz tokens. Conversation mutations stay
   * guarded fail-closed until live mutation-body UAT records the volatile body
   * shape, token carriers, consent behavior, and redaction proof.
   */

  var ORIGIN = 'https://gemini.google.com';
  var SERVICE = 'gemini.google.com';
  var BATCH_PATH = '/_/BardChatUi/data/batchexecute';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  var EMPTY_PARAMS = schema({}, []);
  var CONVERSATION_PARAMS = schema({
    conversation_id: { type: 'string', description: 'Conversation ID to load. If omitted, reads /app.' }
  }, []);
  var CREATE_CONVERSATION_PARAMS = schema({
    text: { type: 'string', minLength: 1, description: 'Initial message text to start the conversation' },
    model_id: { type: 'string', description: 'Model ID to use' }
  }, ['text']);
  var SEND_MESSAGE_PARAMS = schema({
    text: { type: 'string', minLength: 1, description: 'Message text to send to Gemini' },
    conversation_id: { type: 'string', description: 'Conversation ID to continue' },
    response_id: { type: 'string', description: 'Response ID from the previous turn' },
    response_choice_id: { type: 'string', description: 'Response choice ID from the previous turn' },
    model_id: { type: 'string', description: 'Model ID to use' }
  }, ['text']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
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

  function fallback(slug, reason) {
    return typedRecipeError(FALLBACK_CODE, {
      slug: slug,
      reason: reason || 'gemini-auth-or-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function bool(value) {
    return value === true;
  }

  function decodeHtml(value) {
    return str(value)
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function stripTags(value) {
    return decodeHtml(str(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value || ''));
  }

  function appendQuery(parts, key, value) {
    if (value === undefined || value === null || value === '') { return; }
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      appendQuery(parts, pairs[i][0], pairs[i][1]);
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function pageSpec(path) {
    return {
      url: ORIGIN + (path || '/app'),
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: null
    };
  }

  function rpcSpec(auth, rpcId, args) {
    var reqid = String(Math.floor(Math.random() * 10000000));
    var body = 'f.req=' + encodeURIComponent(JSON.stringify([[[rpcId, args, null, 'generic']]]))
      + '&at=' + encodeURIComponent(auth.atToken) + '&';
    return {
      url: ORIGIN + BATCH_PATH + buildQuery([
        ['rpcids', rpcId],
        ['source-path', '/app'],
        ['bl', auth.bl],
        ['f.sid', auth.fsid],
        ['hl', 'en'],
        ['_reqid', reqid],
        ['rt', 'c']
      ]),
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Same-Domain': '1',
        'x-goog-ext-525001261-jspb': '[1,null,null,null,null,null,null,null,[4]]',
        'x-goog-ext-73010989-jspb': '[0]'
      },
      body: body,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: null
    };
  }

  function badHttp(result) {
    var status = Number(result && result.status || 0);
    return !result || result.success !== true || result.redirected ||
      status === 401 || status === 403 || status >= 400;
  }

  function htmlFromResult(result) {
    if (typeof (result && result.text) === 'string') { return result.text; }
    if (typeof (result && result.data) === 'string') { return result.data; }
    return '';
  }

  function extractJsonObjectAfter(text, marker) {
    var start = text.indexOf(marker);
    if (start === -1) { return null; }
    start = text.indexOf('{', start);
    if (start === -1) { return null; }
    var depth = 0;
    var inString = false;
    var quote = '';
    var escaped = false;
    for (var i = start; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inString) {
        if (escaped) { escaped = false; }
        else if (ch === '\\') { escaped = true; }
        else if (ch === quote) { inString = false; quote = ''; }
        continue;
      }
      if (ch === '"' || ch === "'") { inString = true; quote = ch; continue; }
      if (ch === '{') { depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 0) { return text.slice(start, i + 1); }
      }
    }
    return null;
  }

  function extractWizValue(html, key) {
    var objectText = extractJsonObjectAfter(html, 'WIZ_global_data');
    if (objectText) {
      try {
        var parsed = JSON.parse(objectText);
        if (parsed && parsed[key] !== undefined && parsed[key] !== null) {
          return str(parsed[key]);
        }
      } catch (_err) {
        // Fall through to regex extraction for non-JSON script payloads.
      }
    }
    var re = new RegExp('["\\\']' + key + '["\\\']\\s*:\\s*["\\\']([^"\\\']*)["\\\']');
    var match = re.exec(html);
    return match && match[1] ? decodeHtml(match[1]) : '';
  }

  function parseBootstrap(html) {
    return {
      atToken: extractWizValue(html, 'SNlM0e'),
      bl: extractWizValue(html, 'cfb2h'),
      fsid: extractWizValue(html, 'FdrFJe'),
      email: extractWizValue(html, 'oPEP7c'),
      userId: extractWizValue(html, 'S06Grb')
    };
  }

  async function bootstrap(slug, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return { error: fallback(slug, 'gemini-execute-bound-spec-unavailable') };
    }
    var result = await ctx.executeBoundSpec(pageSpec('/app'), ctx.tabId);
    if (badHttp(result)) { return { error: fallback(slug, 'gemini-bootstrap-http-error') }; }
    var html = htmlFromResult(result);
    if (!html) { return { error: fallback(slug, 'gemini-bootstrap-page-missing') }; }
    var auth = parseBootstrap(html);
    auth.html = html;
    auth.result = result;
    return auth;
  }

  function parseBatchResponse(text, rpcId) {
    var lines = str(text).replace(/^\)\]\}'\n\n/, '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf('[[') !== 0) { continue; }
      try {
        var parsed = JSON.parse(line);
        var row = parsed && parsed[0];
        if (row && row[1] === rpcId && row[2]) {
          return JSON.parse(row[2]);
        }
        if (row && row[0] === 'er') {
          return { __gemini_error: true };
        }
      } catch (_err) {
        // Skip non-payload framing rows.
      }
    }
    return null;
  }

  function mapModel(raw, index) {
    raw = list(raw);
    return {
      id: str(raw[0]),
      display_name: str(raw[1]),
      description: str(raw[2]),
      is_default: index === 0
    };
  }

  function parseModelsPayload(data) {
    var rawModels = list(data && data[15]);
    var models = rawModels.filter(Array.isArray).map(mapModel);
    return models.length ? { models: models } : null;
  }

  function parseConversationLinks(html) {
    var out = [];
    var re = /<a\b[^>]*(?:data-test-id=["']conversation["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*data-test-id=["']conversation["'])[^>]*>([\s\S]*?)<\/a>/gi;
    var match;
    while ((match = re.exec(html))) {
      var href = match[1] || match[2] || '';
      var idMatch = href.match(/\/app\/([^"?#/]+)/);
      if (!idMatch) { continue; }
      var title = stripTags(match[3]);
      out.push({
        id: idMatch[1],
        title: title,
        url: href.indexOf('http') === 0 ? href : ORIGIN + href
      });
    }
    return out;
  }

  function parseMessagePairs(html) {
    var prompts = [];
    var responses = [];
    var userRe = /<(?:div|span|p)[^>]*(?:data-test-id=["']user-message["']|class=["'][^"']*(?:query-text|user-query)[^"']*["'])[^>]*>([\s\S]*?)<\/(?:div|span|p)>/gi;
    var modelRe = /<(?:div|span|p)[^>]*(?:data-test-id=["']model-response["']|class=["'][^"']*(?:model-response-text|response-container-content)[^"']*["'])[^>]*>([\s\S]*?)<\/(?:div|span|p)>/gi;
    var match;
    while ((match = userRe.exec(html))) { prompts.push(stripTags(match[1])); }
    while ((match = modelRe.exec(html))) { responses.push(stripTags(match[1])); }
    var count = Math.max(prompts.length, responses.length);
    var messages = [];
    for (var i = 0; i < count; i++) {
      if (!prompts[i] && !responses[i]) { continue; }
      messages.push({ prompt: prompts[i] || '', response: responses[i] || '' });
    }
    return messages;
  }

  function readHandler(slug, params, run) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        try {
          return await run(args || {}, ctx || {}, slug);
        } catch (_err) {
          return fallback(slug, 'gemini-handler-map-failed');
        }
      }
    };
  }

  function guarded(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'write',
      params: params || EMPTY_PARAMS,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'gemini.get_current_user': readHandler('gemini.get_current_user', EMPTY_PARAMS, async function(_args, ctx, slug) {
      var auth = await bootstrap(slug, ctx);
      if (auth.error) { return auth.error; }
      if (!auth.email && !auth.userId) { return fallback(slug, 'gemini-current-user-missing'); }
      return {
        success: true,
        status: auth.result.status,
        data: { user: { email: auth.email, user_id: auth.userId } }
      };
    }),
    'gemini.list_models': readHandler('gemini.list_models', EMPTY_PARAMS, async function(_args, ctx, slug) {
      var auth = await bootstrap(slug, ctx);
      if (auth.error) { return auth.error; }
      if (!auth.atToken || !auth.bl || !auth.fsid) {
        return fallback(slug, 'gemini-rpc-bootstrap-missing');
      }
      var rpcId = 'otAQ7b';
      var res = await ctx.executeBoundSpec(rpcSpec(auth, rpcId, '[]'), ctx.tabId);
      if (badHttp(res)) { return fallback(slug, 'gemini-rpc-http-error'); }
      var payload = Array.isArray(res.data) ? res.data : parseBatchResponse(res.text || res.data || '', rpcId);
      if (!payload || payload.__gemini_error) { return fallback(slug, 'gemini-rpc-shape-mismatch'); }
      var mapped = parseModelsPayload(payload);
      if (!mapped) { return fallback(slug, 'gemini-models-missing'); }
      return { success: true, status: res.status, data: mapped };
    }),
    'gemini.list_conversations': readHandler('gemini.list_conversations', EMPTY_PARAMS, async function(_args, ctx, slug) {
      if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
        return fallback(slug, 'gemini-execute-bound-spec-unavailable');
      }
      var res = await ctx.executeBoundSpec(pageSpec('/app'), ctx.tabId);
      if (badHttp(res)) { return fallback(slug, 'gemini-conversation-list-http-error'); }
      var html = htmlFromResult(res);
      if (!html) { return fallback(slug, 'gemini-conversation-list-page-missing'); }
      return { success: true, status: res.status, data: { conversations: parseConversationLinks(html) } };
    }),
    'gemini.get_conversation': readHandler('gemini.get_conversation', CONVERSATION_PARAMS, async function(args, ctx, slug) {
      if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
        return fallback(slug, 'gemini-execute-bound-spec-unavailable');
      }
      var path = args.conversation_id ? '/app/' + encodeSegment(args.conversation_id) : '/app';
      var res = await ctx.executeBoundSpec(pageSpec(path), ctx.tabId);
      if (badHttp(res)) { return fallback(slug, 'gemini-conversation-http-error'); }
      var html = htmlFromResult(res);
      if (!html) { return fallback(slug, 'gemini-conversation-page-missing'); }
      var id = args.conversation_id || '';
      if (!id && res.finalUrl) {
        var idMatch = str(res.finalUrl).match(/\/app\/([^?#/]+)/);
        id = idMatch && idMatch[1] ? idMatch[1] : '';
      }
      return {
        success: true,
        status: res.status,
        data: {
          conversation_id: id,
          messages: parseMessagePairs(html)
        }
      };
    }),
    'gemini.create_conversation': guarded(
      'gemini.create_conversation',
      CREATE_CONVERSATION_PARAMS,
      'unverified-gemini-create-conversation-mutation'
    ),
    'gemini.send_message': guarded(
      'gemini.send_message',
      SEND_MESSAGE_PARAMS,
      'unverified-gemini-send-message-mutation'
    )
  };

  if (typeof FsbCapabilityCatalog !== 'undefined' && FsbCapabilityCatalog
      && typeof FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: handlers[slug].origin,
          params: handlers[slug].params,
          descriptor: {
            slug: slug,
            service: SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerGemini = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
