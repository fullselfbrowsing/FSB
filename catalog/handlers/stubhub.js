(function (global) {
  'use strict';

  /**
   * StubHub same-origin T1 read head.
   *
   * Ports only reviewed GET reads on www.stubhub.com. The ticket purchase tool
   * stays DOM-backed because payment-op promotion is forbidden by the catalog
   * guard until a separate money-movement safety design exists.
   */

  var STUBHUB_ORIGIN = 'https://www.stubhub.com';
  var STUBHUB_SERVICE = 'www.stubhub.com';
  var INT_LIMIT = 9007199254740991;

  var SEARCH_PARAMS = schema({
    keyword: { type: 'string', minLength: 1, description: 'Artist, team, event, or venue to search for' },
    city: { type: 'string', description: 'City to filter events by' },
    start_date: { type: 'string', description: 'Earliest event date (YYYY-MM-DD)' },
    end_date: { type: 'string', description: 'Latest event date (YYYY-MM-DD)' }
  }, ['keyword']);

  var LISTING_PARAMS = schema({
    listing_id: { type: 'string', minLength: 1, description: 'The listing ID to fetch' }
  }, ['listing_id']);

  var ORDERS_PARAMS = schema({
    status: {
      description: 'Filter orders by status',
      type: 'string',
      enum: ['upcoming', 'past', 'cancelled']
    },
    limit: integerSchema('Maximum number of orders to return', 1, 50)
  }, []);

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
    return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
      slug: slug,
      reason: reason || 'stubhub-json-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function firstString(values) {
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v !== undefined && v !== null && String(v) !== '') { return String(v); }
    }
    return '';
  }

  function firstValue(values) {
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v !== undefined && v !== null && (typeof v !== 'string' || v !== '')) { return v; }
    }
    return undefined;
  }

  function numberValue(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function intValue(value, fallbackValue, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) { return fallbackValue; }
    n = Math.floor(n);
    if (min !== undefined && n < min) { return min; }
    if (max !== undefined && n > max) { return max; }
    return n;
  }

  function nested(raw, path) {
    var cur = raw;
    for (var i = 0; i < path.length; i++) {
      if (!cur || typeof cur !== 'object') { return undefined; }
      cur = cur[path[i]];
    }
    return cur;
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
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

  function jsonSpec(path) {
    return {
      url: STUBHUB_ORIGIN + path,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: STUBHUB_ORIGIN,
      extract: '@'
    };
  }

  function parseJsonText(text) {
    var s = str(text).trim();
    if (!s || (s.charAt(0) !== '{' && s.charAt(0) !== '[')) { return null; }
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function resultData(result, slug) {
    if (!result || result.success !== true) {
      return { error: fallback(slug, 'stubhub-request-failed') };
    }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return { error: fallback(slug, 'stubhub-http-error') };
    }
    if (isObject(result.data) || Array.isArray(result.data)) {
      return { data: result.data };
    }
    var parsed = parseJsonText(result.data || result.text || result.body);
    if (parsed) { return { data: parsed }; }
    return { error: fallback(slug, 'stubhub-json-missing') };
  }

  function looksLikeError(data) {
    return isObject(data) && (
      typeof data.error === 'string' ||
      typeof data.message === 'string' ||
      Array.isArray(data.errors)
    );
  }

  function priceString(value) {
    if (value === undefined || value === null || value === '') { return ''; }
    if (typeof value === 'number') { return '$' + value.toFixed(2); }
    if (isObject(value)) {
      var amount = firstString([value.formatted, value.display, value.displayPrice, value.priceString]);
      if (amount) { return amount; }
      var n = Number(value.amount || value.value || value.price);
      if (Number.isFinite(n)) {
        return (value.currency ? String(value.currency) + ' ' : '$') + n.toFixed(2);
      }
    }
    return String(value);
  }

  function absoluteUrl(value) {
    var raw = str(value);
    if (!raw) { return ''; }
    if (raw.indexOf('https://') === 0 || raw.indexOf('http://') === 0) { return raw; }
    if (raw.charAt(0) === '/') { return STUBHUB_ORIGIN + raw; }
    return '';
  }

  function mapEvent(raw) {
    if (!isObject(raw)) { return null; }
    var id = firstString([raw.id, raw.eventId, raw.event_id, raw.eventIdentifier]);
    var name = firstString([raw.name, raw.title, raw.eventName, raw.event_name]);
    if (!id || !name) { return null; }
    return {
      id: id,
      name: name,
      date: firstString([raw.date, raw.eventDate, raw.localDate, raw.startDate, raw.start_date]),
      venue: firstString([raw.venueName, nested(raw, ['venue', 'name']), raw.venue]),
      city: firstString([raw.city, nested(raw, ['venue', 'city']), nested(raw, ['venue', 'cityName'])]),
      url: absoluteUrl(firstString([raw.url, raw.webUrl, raw.eventUrl])),
      lowest_price: priceString(firstValue([raw.lowestPrice, raw.minPrice, raw.price, raw.priceDisplay]))
    };
  }

  function mapListing(raw) {
    if (!isObject(raw)) { return null; }
    var id = firstString([raw.id, raw.listingId, raw.listing_id]);
    var price = priceString(firstValue([raw.price, raw.displayPrice, raw.listingPrice, raw.currentPrice]));
    if (!id || !price) { return null; }
    return {
      id: id,
      price: price,
      section: firstString([raw.section, raw.sectionName]),
      row: firstString([raw.row, raw.rowName]),
      quantity: numberValue(firstString([raw.quantity, raw.availableQuantity, raw.available_quantity])),
      event_id: firstString([raw.eventId, raw.event_id, nested(raw, ['event', 'id'])]),
      event_name: firstString([raw.eventName, raw.event_name, nested(raw, ['event', 'name'])]),
      url: absoluteUrl(firstString([raw.url, raw.webUrl, raw.listingUrl]))
    };
  }

  function mapOrder(raw) {
    if (!isObject(raw)) { return null; }
    var id = firstString([raw.id, raw.orderId, raw.order_id]);
    var status = firstString([raw.status, raw.orderStatus, raw.order_status]);
    if (!id || !status) { return null; }
    return {
      id: id,
      status: status,
      event_id: firstString([raw.eventId, raw.event_id, nested(raw, ['event', 'id'])]),
      event_name: firstString([raw.eventName, raw.event_name, nested(raw, ['event', 'name'])]),
      listing_id: firstString([raw.listingId, raw.listing_id, nested(raw, ['listing', 'id'])]),
      quantity: numberValue(firstString([raw.quantity, raw.ticketQuantity, raw.ticket_quantity])),
      total: priceString(firstValue([raw.total, raw.totalPrice, raw.orderTotal])),
      order_date: firstString([raw.orderDate, raw.order_date, raw.createdAt, raw.created_at])
    };
  }

  function searchPath(args) {
    return '/search/catalog/events' + buildQuery([
      ['q', args.keyword],
      ['city', args.city],
      ['dateStart', args.start_date],
      ['dateEnd', args.end_date]
    ]);
  }

  function listingPath(args) {
    return '/inventory/listings/' + encodeURIComponent(str(args.listing_id));
  }

  function ordersPath(args) {
    var limit = args.limit === undefined ? undefined : intValue(args.limit, undefined, 1, 50);
    return '/orders' + buildQuery([
      ['status', args.status],
      ['limit', limit]
    ]);
  }

  function success(status, data) {
    return { success: true, status: status, data: data };
  }

  function readArrayResult(result, slug, sourceKeys, outputKey, mapper) {
    var body = resultData(result, slug);
    if (body.error) { return body.error; }
    var data = body.data;
    if (!isObject(data) || looksLikeError(data)) {
      return fallback(slug, 'stubhub-json-shape-mismatch');
    }
    var raw = [];
    var found = false;
    for (var i = 0; i < sourceKeys.length; i++) {
      if (Array.isArray(data[sourceKeys[i]])) {
        raw = list(data[sourceKeys[i]]);
        found = true;
        break;
      }
    }
    if (!found) {
      return fallback(slug, 'stubhub-json-items-missing');
    }
    var mapped = [];
    for (var j = 0; j < raw.length; j++) {
      var item = mapper(raw[j]);
      if (item) { mapped.push(item); }
    }
    if (raw.length && !mapped.length) {
      return fallback(slug, 'stubhub-json-map-failed');
    }
    var out = {};
    out[outputKey] = mapped;
    return success(result.status, out);
  }

  function readListingResult(result, slug) {
    var body = resultData(result, slug);
    if (body.error) { return body.error; }
    var data = body.data;
    if (!isObject(data) || looksLikeError(data)) {
      return fallback(slug, 'stubhub-json-shape-mismatch');
    }
    var listing = mapListing(isObject(data.listing) ? data.listing : data);
    if (!listing) { return fallback(slug, 'stubhub-json-map-failed'); }
    return success(result.status, { listing: listing });
  }

  function readHandler(slug, params, pathForArgs, mapperKind) {
    return {
      tier: 'T1a',
      origin: STUBHUB_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'stubhub-execute-bound-spec-unavailable');
        }
        var a = args || {};
        if ((slug === 'stubhub.search_events' && !str(a.keyword)) ||
            (slug === 'stubhub.get_listing' && !str(a.listing_id))) {
          return fallback(slug, 'stubhub-required-parameter-missing');
        }
        var result = await ctx.executeBoundSpec(jsonSpec(pathForArgs(a)), ctx.tabId);
        if (mapperKind === 'events') {
          return readArrayResult(result, slug, ['events', 'results', 'items'], 'events', mapEvent);
        }
        if (mapperKind === 'orders') {
          return readArrayResult(result, slug, ['orders', 'items'], 'orders', mapOrder);
        }
        return readListingResult(result, slug);
      }
    };
  }

  var handlers = {
    'stubhub.search_events': readHandler('stubhub.search_events', SEARCH_PARAMS, searchPath, 'events'),
    'stubhub.get_listing': readHandler('stubhub.get_listing', LISTING_PARAMS, listingPath, 'listing'),
    'stubhub.list_orders': readHandler('stubhub.list_orders', ORDERS_PARAMS, ordersPath, 'orders')
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
            service: STUBHUB_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerStubhub = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
