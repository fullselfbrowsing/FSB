(function (global) {
  'use strict';

  /**
   * Etsy same-origin marketplace READ head plus guarded cart/payment writes.
   *
   * Ports only the reviewed OpenTabs Etsy v1 read rows through origin-pinned
   * bound specs. Cart and checkout rows are registered only as guarded
   * fail-closed handlers until live mutation-body UAT records evidence.
   */

  var ETSY_ORIGIN = 'https://www.etsy.com';
  var ETSY_SERVICE = 'www.etsy.com';
  var API_BASE = ETSY_ORIGIN + '/v1';
  var INT_LIMIT = 9007199254740991;

  var SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search keywords (item name, material, or style)' },
    category: { type: 'string', description: 'Category to filter by' },
    sort: {
      type: 'string',
      enum: ['relevance', 'price_low_to_high', 'price_high_to_low', 'newest'],
      description: 'Result ordering'
    },
    limit: integerSchema('Maximum number of listings to return', 1, 50)
  }, ['query']);

  var LISTING_PARAMS = schema({
    listing_id: { type: 'string', minLength: 1, description: 'The Etsy listing ID to fetch' }
  }, ['listing_id']);

  var LIST_ORDERS_PARAMS = schema({
    status: {
      type: 'string',
      enum: ['paid', 'shipped', 'delivered', 'cancelled'],
      description: 'Filter orders by status'
    },
    limit: integerSchema('Maximum number of orders to return', 1, 50)
  });

  var ADD_TO_CART_PARAMS = schema({
    listing_id: { type: 'string', minLength: 1, description: 'The listing ID to add to the cart' },
    quantity: integerSchema('Quantity to add (default 1)', 1, INT_LIMIT),
    variation: { type: 'string', description: 'Optional product variation (size, color)' }
  }, ['listing_id']);

  var CHECKOUT_PARAMS = schema({
    shipping_address: { type: 'string', minLength: 1, description: 'The address to ship to' },
    payment_method_id: { type: 'string', description: 'Optional saved payment method ID to charge' }
  }, ['shipping_address']);

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
      reason: reason || 'etsy-same-origin-shape-mismatch',
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

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function boundedInt(value, fallbackValue, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) { n = fallbackValue; }
    n = Math.floor(n);
    if (min !== undefined && n < min) { n = min; }
    if (max !== undefined && n > max) { n = max; }
    return n;
  }

  function stringParam(value) {
    return String(value === undefined || value === null ? '' : value).trim();
  }

  function apiSpec(path, pairs) {
    return {
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ETSY_ORIGIN,
      extract: '@'
    };
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

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function firstString(values) {
    for (var i = 0; i < values.length; i++) {
      var value = values[i];
      if (value !== undefined && value !== null && String(value) !== '') {
        return String(value);
      }
    }
    return '';
  }

  function parseMaybeJson(value) {
    if (typeof value !== 'string') { return value; }
    var trimmed = value.trim();
    if (!trimmed || (trimmed.charAt(0) !== '{' && trimmed.charAt(0) !== '[')) { return value; }
    try { return JSON.parse(trimmed); } catch (e) { return value; }
  }

  function responseData(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'etsy-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'etsy-logged-out-or-http-error');
    }
    var data = result.data !== undefined ? result.data : (result.text !== undefined ? result.text : result.body);
    data = parseMaybeJson(data);
    if (!isObject(data) && !Array.isArray(data)) {
      return fallback(slug, 'etsy-response-shape-mismatch');
    }
    return data;
  }

  function pickArray(raw, keys) {
    if (Array.isArray(raw)) { return raw; }
    if (!isObject(raw)) { return []; }
    for (var i = 0; i < keys.length; i++) {
      var value = raw[keys[i]];
      if (Array.isArray(value)) { return value; }
      if (isObject(value)) {
        var nested = pickArray(value, keys);
        if (nested.length) { return nested; }
      }
    }
    return [];
  }

  function priceText(raw) {
    if (raw === undefined || raw === null) { return ''; }
    if (typeof raw === 'number') { return String(raw); }
    if (typeof raw === 'string') { return raw; }
    if (isObject(raw)) {
      return firstString([raw.formatted, raw.display, raw.amount, raw.value, raw.price]);
    }
    return '';
  }

  function absoluteUrl(value, fallbackPath) {
    var u = str(value);
    if (u.indexOf('https://') === 0 || u.indexOf('http://') === 0) { return u; }
    if (u.charAt(0) === '/') { return ETSY_ORIGIN + u; }
    return fallbackPath ? ETSY_ORIGIN + fallbackPath : '';
  }

  function normalizeListing(raw) {
    if (!isObject(raw)) { return null; }
    var id = firstString([raw.id, raw.listing_id, raw.listingId]);
    var title = firstString([raw.title, raw.name]);
    if (!id || !title) { return null; }
    var shop = isObject(raw.shop) ? raw.shop : {};
    var priceValue = raw.price_value !== undefined ? raw.price_value : raw.price;
    return {
      id: id,
      listing_id: id,
      title: title,
      price: priceText(raw.price),
      price_value: num(priceValue),
      currency_code: firstString([raw.currency_code, raw.currencyCode, raw.currency]),
      shop_name: firstString([raw.shop_name, raw.shopName, shop.name, shop.shop_name]),
      url: absoluteUrl(firstString([raw.url, raw.listing_url, raw.path]), '/listing/' + encodeSegment(id)),
      image_url: firstString([
        raw.image_url,
        raw.imageUrl,
        raw.primary_image_url,
        raw.image && raw.image.url,
        raw.images && raw.images[0] && raw.images[0].url
      ]),
      state: firstString([raw.state, raw.status]),
      quantity: num(raw.quantity),
      tags: list(raw.tags).map(str)
    };
  }

  function normalizeOrder(raw) {
    if (!isObject(raw)) { return null; }
    var id = firstString([raw.id, raw.order_id, raw.receipt_id, raw.receiptId]);
    if (!id) { return null; }
    var total = isObject(raw.total) ? raw.total : {};
    return {
      id: id,
      order_id: id,
      status: firstString([raw.status, raw.state]),
      total: num(raw.total_amount !== undefined ? raw.total_amount : (total.amount !== undefined ? total.amount : raw.total)),
      currency_code: firstString([raw.currency_code, raw.currencyCode, total.currency_code, total.currency]),
      created_at: firstString([raw.created_at, raw.createdAt, raw.creation_tsz]),
      shop_name: firstString([raw.shop_name, raw.shopName, raw.seller_name]),
      item_count: list(raw.items).length || num(raw.item_count)
    };
  }

  async function callRead(slug, spec, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'etsy-execute-bound-spec-unavailable');
    }
    var result = await ctx.executeBoundSpec(spec, ctx.tabId);
    return responseData(result, slug);
  }

  function readHandler(slug, params, handle) {
    return {
      tier: 'T1a',
      origin: ETSY_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return handle(args || {}, ctx);
      }
    };
  }

  function guarded(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: ETSY_ORIGIN,
      sideEffectClass: 'write',
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'etsy.search_listings': readHandler(
      'etsy.search_listings',
      SEARCH_PARAMS,
      async function (args, ctx) {
        var query = stringParam(args.query);
        if (!query) { return fallback('etsy.search_listings', 'etsy-invalid-query'); }
        var limit = boundedInt(args.limit, 10, 1, 50);
        var data = await callRead('etsy.search_listings', apiSpec('/listings/search', [
          ['query', query],
          ['category', args.category],
          ['sort', args.sort],
          ['limit', limit]
        ]), ctx);
        if (!data || data.success === false) { return data; }
        var rawListings = pickArray(data, ['listings', 'results', 'items', 'data']);
        var listings = rawListings.map(normalizeListing).filter(Boolean);
        if (!listings.length) { return fallback('etsy.search_listings', 'etsy-search-listings-shape-mismatch'); }
        return {
          success: true,
          data: {
            listings: listings.slice(0, limit),
            total_results: num(data.total_results !== undefined ? data.total_results : data.count)
          }
        };
      }
    ),
    'etsy.get_listing': readHandler(
      'etsy.get_listing',
      LISTING_PARAMS,
      async function (args, ctx) {
        var listingId = stringParam(args.listing_id);
        if (!listingId) { return fallback('etsy.get_listing', 'etsy-invalid-listing-id'); }
        var data = await callRead('etsy.get_listing', apiSpec('/listings/' + encodeSegment(listingId), []), ctx);
        if (!data || data.success === false) { return data; }
        var raw = data.listing || data.result || data.data || data;
        var listing = normalizeListing(raw);
        if (!listing) { return fallback('etsy.get_listing', 'etsy-listing-shape-mismatch'); }
        return { success: true, data: { listing: listing } };
      }
    ),
    'etsy.list_orders': readHandler(
      'etsy.list_orders',
      LIST_ORDERS_PARAMS,
      async function (args, ctx) {
        var limit = boundedInt(args.limit, 20, 1, 50);
        var data = await callRead('etsy.list_orders', apiSpec('/orders', [
          ['status', args.status],
          ['limit', limit]
        ]), ctx);
        if (!data || data.success === false) { return data; }
        var rawOrders = pickArray(data, ['orders', 'results', 'items', 'data']);
        if (!Array.isArray(rawOrders)) { return fallback('etsy.list_orders', 'etsy-orders-shape-mismatch'); }
        return {
          success: true,
          data: {
            orders: rawOrders.map(normalizeOrder).filter(Boolean).slice(0, limit)
          }
        };
      }
    ),
    'etsy.add_to_cart': guarded(
      'etsy.add_to_cart',
      ADD_TO_CART_PARAMS,
      'unverified-etsy-add-to-cart-mutation'
    ),
    'etsy.checkout': guarded(
      'etsy.checkout',
      CHECKOUT_PARAMS,
      'unverified-etsy-checkout-payment-mutation'
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
            service: ETSY_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerEtsy = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
