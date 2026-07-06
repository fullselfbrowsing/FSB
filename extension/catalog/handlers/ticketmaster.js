(function (global) {
  'use strict';

  /**
   * Ticketmaster same-origin T1 head.
   *
   * Public event reads use first-party Ticketmaster pages through executeBoundSpec.
   * Buying tickets remains guarded fail-closed until live mutation-body UAT records
   * the real purchase request shape and redaction proof.
   */

  var TICKETMASTER_ORIGIN = 'https://www.ticketmaster.com';
  var TICKETMASTER_SERVICE = 'www.ticketmaster.com';
  var INT_LIMIT = 9007199254740991;
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  var SEARCH_PARAMS = schema({
    keyword: { type: 'string', minLength: 1, description: 'Artist, team, event, or venue to search for' },
    city: { type: 'string', description: 'City to filter events by' },
    start_date: { type: 'string', description: 'Earliest event date (YYYY-MM-DD)' },
    end_date: { type: 'string', description: 'Latest event date (YYYY-MM-DD)' }
  }, ['keyword']);

  var EVENT_PARAMS = schema({
    event_id: { type: 'string', minLength: 1, description: 'The event ID to fetch' }
  }, ['event_id']);

  var ORDERS_PARAMS = schema({
    status: {
      type: 'string',
      enum: ['upcoming', 'past', 'cancelled'],
      description: 'Filter orders by status'
    },
    limit: integerSchema('Maximum number of orders to return', 1, 50)
  }, []);

  var BUY_PARAMS = schema({
    event_id: { type: 'string', minLength: 1, description: 'The event to buy tickets for' },
    quantity: integerSchema('Number of tickets to buy', 1, INT_LIMIT),
    price_level: { type: 'string', description: 'Seating section or price level' }
  }, ['event_id', 'quantity']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
      description: description
    };
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
      reason: reason || 'ticketmaster-response-shape-mismatch',
      fellBackToDom: true
    });
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

  function encPath(value) {
    return encodeURIComponent(String(value === undefined || value === null ? '' : value));
  }

  function htmlSpec(path) {
    return {
      url: TICKETMASTER_ORIGIN + path,
      method: 'GET',
      headers: { 'Accept': 'text/html,application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: TICKETMASTER_ORIGIN,
      extract: '@'
    };
  }

  function resultText(result) {
    if (!result) { return ''; }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    if (result.data && typeof result.data === 'object') {
      try { return JSON.stringify(result.data); } catch (e) { return ''; }
    }
    return '';
  }

  function looksLikeTicketmaster(text) {
    var t = String(text || '').toLowerCase();
    return t.indexOf('ticketmaster') !== -1 ||
      t.indexOf('tm_event') !== -1 ||
      t.indexOf('__next_data__') !== -1 ||
      t.indexOf('eventid') !== -1;
  }

  function looksLoggedOut(text) {
    var t = String(text || '').toLowerCase();
    return (t.indexOf('sign in') !== -1 || t.indexOf('signin') !== -1 || t.indexOf('log in') !== -1)
      && (t.indexOf('my events') !== -1 || t.indexOf('my tickets') !== -1 || t.indexOf('account') !== -1);
  }

  function stripHtml(value) {
    return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function decodeEntities(value) {
    return String(value || '')
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function titleFromHtml(text) {
    var m = String(text || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return m && m[1] ? stripHtml(decodeEntities(m[1])) : '';
  }

  function cleanTicketmasterTitle(title) {
    var t = String(title || '').replace(/\s*\|\s*Ticketmaster.*$/i, '').trim();
    return t.replace(/\s*Tickets\s*$/i, '').trim();
  }

  function parseJsonScript(text, id) {
    var re = new RegExp("<script[^>]+id=[\"']" + id + "[\"'][^>]*>([\\s\\S]*?)<\\/script>", 'i');
    var m = String(text || '').match(re);
    if (!m || !m[1]) { return null; }
    try { return JSON.parse(decodeEntities(m[1]).trim()); } catch (e) { return null; }
  }

  function nested(obj, path) {
    var cur = obj;
    for (var i = 0; i < path.length; i++) {
      if (!cur || typeof cur !== 'object') { return undefined; }
      cur = cur[path[i]];
    }
    return cur;
  }

  function firstString(values) {
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v !== undefined && v !== null && String(v) !== '') { return String(v); }
    }
    return '';
  }

  function extractEventHints(text, limit) {
    var max = Math.max(1, Math.min(Number(limit) || 10, 25));
    var out = [];
    var seen = {};
    var next = parseJsonScript(text, '__NEXT_DATA__');
    var candidates = [];
    if (next) {
      candidates.push(nested(next, ['props', 'pageProps', 'events']));
      candidates.push(nested(next, ['props', 'pageProps', 'initialState', 'events']));
      candidates.push(nested(next, ['props', 'pageProps', 'data', 'events']));
    }
    for (var c = 0; c < candidates.length; c++) {
      var list = Array.isArray(candidates[c]) ? candidates[c] : [];
      for (var i = 0; i < list.length && out.length < max; i++) {
        var item = list[i] || {};
        var id = firstString([item.id, item.eventId, item.event_id]);
        var name = firstString([item.name, item.title]);
        if (!id && !name) { continue; }
        var key = id || name;
        if (seen[key]) { continue; }
        seen[key] = true;
        out.push({ id: id, name: name });
      }
    }
    return out;
  }

  async function readTicketmaster(slug, path, ctx, requireAuth) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return { error: fallback(slug, 'ticketmaster-execute-bound-spec-unavailable') };
    }
    var spec = htmlSpec(path);
    var result = await ctx.executeBoundSpec(spec, ctx.tabId);
    if (!result || result.success !== true) {
      return { error: fallback(slug, 'ticketmaster-request-failed') };
    }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return { error: fallback(slug, 'ticketmaster-http-error') };
    }
    var text = resultText(result);
    if (!text || !looksLikeTicketmaster(text)) {
      return { error: fallback(slug, 'ticketmaster-response-shape-mismatch') };
    }
    if (requireAuth && looksLoggedOut(text)) {
      return { error: fallback(slug, 'ticketmaster-auth-required') };
    }
    return { result: result, text: text, url: spec.url };
  }

  function searchPath(args) {
    return '/search' + buildQuery([
      ['q', args.keyword],
      ['city', args.city],
      ['startDateTime', args.start_date],
      ['endDateTime', args.end_date]
    ]);
  }

  function orderPath(args) {
    var status = String((args && args.status) || 'upcoming');
    if (status !== 'upcoming' && status !== 'past' && status !== 'cancelled') { status = 'upcoming'; }
    return '/user/events/' + encodeURIComponent(status);
  }

  function readHandler(slug, params, handle) {
    return {
      tier: 'T1a',
      origin: TICKETMASTER_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      handle: handle
    };
  }

  function guardedWrite(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: TICKETMASTER_ORIGIN,
      sideEffectClass: 'write',
      params: params,
      async handle() {
        return fallback(slug, reason || 'unverified-ticketmaster-mutation');
      }
    };
  }

  var handlers = {
    'ticketmaster.search_events': readHandler('ticketmaster.search_events', SEARCH_PARAMS, async function(args, ctx) {
      var read = await readTicketmaster('ticketmaster.search_events', searchPath(args || {}), ctx, false);
      if (read.error) { return read.error; }
      return {
        success: true,
        status: read.result.status,
        data: {
          search_url: read.url,
          events: extractEventHints(read.text),
          navigated: false
        }
      };
    }),
    'ticketmaster.get_event': readHandler('ticketmaster.get_event', EVENT_PARAMS, async function(args, ctx) {
      var eventId = encPath((args || {}).event_id);
      var read = await readTicketmaster('ticketmaster.get_event', '/event/' + eventId, ctx, false);
      if (read.error) { return read.error; }
      var title = cleanTicketmasterTitle(titleFromHtml(read.text));
      return {
        success: true,
        status: read.result.status,
        data: {
          event: {
            id: String((args || {}).event_id || ''),
            name: title || String((args || {}).event_id || ''),
            event_url: read.url
          }
        }
      };
    }),
    'ticketmaster.list_orders': readHandler('ticketmaster.list_orders', ORDERS_PARAMS, async function(args, ctx) {
      var read = await readTicketmaster('ticketmaster.list_orders', orderPath(args || {}), ctx, true);
      if (read.error) { return read.error; }
      return {
        success: true,
        status: read.result.status,
        data: {
          orders: [],
          orders_url: read.url,
          status: String((args || {}).status || 'upcoming'),
          parsed: false
        }
      };
    }),
    'ticketmaster.buy_tickets': guardedWrite(
      'ticketmaster.buy_tickets',
      BUY_PARAMS,
      'unverified-ticketmaster-buy-tickets-mutation'
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
            service: TICKETMASTER_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerTicketmaster = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
