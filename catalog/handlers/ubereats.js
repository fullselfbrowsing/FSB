(function (global) {
  'use strict';

  /**
   * Uber Eats same-origin read + guarded payment head.
   *
   * Ports only the OpenTabs-proven first-party `/eats/v1/...` read paths as
   * explicit same-origin requests. Paid order placement and order cancellation
   * remain guarded fail-closed until live mutation-body UAT records the exact
   * method, path, body shape, and redaction proof.
   */

  var UBEREATS_ORIGIN = 'https://www.ubereats.com';
  var UBEREATS_SERVICE = 'www.ubereats.com';
  var INT_LIMIT = 9007199254740991;

  var LIST_RESTAURANTS_PARAMS = schema({
    address: { description: 'Delivery address to find restaurants for', type: 'string' },
    query: { description: 'Search term (cuisine, dish, or restaurant name)', type: 'string' },
    limit: integerSchema('Maximum number of restaurants to return', 1, 50)
  });
  var RESTAURANT_ID_PARAMS = schema({
    restaurant_id: {
      type: 'string',
      minLength: 1,
      description: 'The restaurant ID to fetch the menu for'
    }
  }, ['restaurant_id']);
  var LIST_ORDERS_PARAMS = schema({
    status: {
      description: 'Filter orders by status',
      type: 'string',
      enum: ['active', 'completed', 'cancelled']
    },
    limit: integerSchema('Maximum number of orders to return', 1, 50)
  });
  var CANCEL_ORDER_PARAMS = schema({
    order_id: { type: 'string', minLength: 1, description: 'The order ID to cancel' },
    reason: { description: 'Optional cancellation reason', type: 'string' }
  }, ['order_id']);
  var PLACE_ORDER_PARAMS = schema({
    restaurant_id: { type: 'string', minLength: 1, description: 'The restaurant to order from' },
    items: {
      minItems: 1,
      type: 'array',
      items: schema({
        item_id: { type: 'string', description: 'Menu item ID' },
        quantity: integerSchema('Quantity of this item', 1, INT_LIMIT)
      }, ['item_id', 'quantity']),
      description: 'The cart items to order'
    },
    delivery_address: { type: 'string', minLength: 1, description: 'The address to deliver to' },
    tip_amount: { description: 'Optional tip amount in dollars', type: 'number' }
  }, ['restaurant_id', 'items', 'delivery_address']);

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
      reason: reason || 'ubereats-api-shape-mismatch',
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

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function boundedInt(value, fallbackValue, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) { n = fallbackValue; }
    n = Math.floor(n);
    if (min !== undefined && n < min) { n = min; }
    if (max !== undefined && n > max) { n = max; }
    return n;
  }

  function first(values) {
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v !== undefined && v !== null && String(v) !== '') { return v; }
    }
    return '';
  }

  function firstString(values) {
    return str(first(values));
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

  function apiSpec(path, pairs) {
    return {
      url: UBEREATS_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: UBEREATS_ORIGIN,
      extract: '@'
    };
  }

  function apiData(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'ubereats-api-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'ubereats-logged-out-or-http-error');
    }
    if (!isObject(result.data)) {
      return fallback(slug, 'ubereats-api-shape-mismatch');
    }
    if (result.data.error || (Array.isArray(result.data.errors) && result.data.errors.length)) {
      return fallback(slug, 'ubereats-api-error-envelope');
    }
    return result.data;
  }

  async function readApi(slug, spec, ctx, parser) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'ubereats-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(spec, ctx.tabId);
    var data = apiData(res, slug);
    if (!data || data.success === false) { return data; }
    var parsed = parser(data);
    if (!parsed) { return fallback(slug, 'ubereats-api-shape-mismatch'); }
    return { success: true, data: parsed };
  }

  function readHandler(slug, params, handle) {
    return {
      tier: 'T1a',
      origin: UBEREATS_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return handle(args || {}, ctx);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: UBEREATS_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  function arrayAt(data, names) {
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (Array.isArray(data[name])) { return data[name]; }
      if (isObject(data.data) && Array.isArray(data.data[name])) { return data.data[name]; }
    }
    return [];
  }

  function nestedArray(data, paths) {
    for (var i = 0; i < paths.length; i++) {
      var cur = data;
      var path = paths[i];
      for (var j = 0; j < path.length; j++) {
        if (!isObject(cur)) { cur = null; break; }
        cur = cur[path[j]];
      }
      if (Array.isArray(cur)) { return cur; }
    }
    return [];
  }

  function mapRestaurant(raw) {
    if (!isObject(raw)) { return null; }
    var id = firstString([raw.id, raw.uuid, raw.storeUuid, raw.restaurant_id, raw.restaurantId]);
    var name = firstString([raw.name, raw.title, raw.storeName, raw.restaurant_name]);
    if (!id || !name) { return null; }
    return {
      id: id,
      name: name,
      cuisine: firstString([raw.cuisine, raw.cuisineType, raw.category]),
      rating: num(first([raw.rating, raw.averageRating, raw.score])),
      delivery_time: firstString([raw.delivery_time, raw.deliveryTime, raw.eta, raw.etaRange]),
      delivery_fee: firstString([raw.delivery_fee, raw.deliveryFee, raw.fee]),
      image_url: firstString([raw.image_url, raw.imageUrl, raw.heroImageUrl, raw.logoUrl])
    };
  }

  function mapMenuItem(raw) {
    if (!isObject(raw)) { return null; }
    var id = firstString([raw.item_id, raw.itemId, raw.id, raw.uuid]);
    var name = firstString([raw.name, raw.title]);
    if (!id || !name) { return null; }
    return {
      item_id: id,
      name: name,
      price: num(first([raw.price, raw.price_amount, raw.priceAmount, raw.unitPrice])),
      description: firstString([raw.description, raw.subtitle]),
      image_url: firstString([raw.image_url, raw.imageUrl, raw.pictureUrl]),
      category: firstString([raw.category, raw.categoryName])
    };
  }

  function menuItems(data) {
    var direct = arrayAt(data, ['menu', 'items']);
    if (direct.length) { return direct; }
    var nested = nestedArray(data, [
      ['data', 'menu', 'items'],
      ['menu', 'items'],
      ['payload', 'menu', 'items']
    ]);
    if (nested.length) { return nested; }

    var sections = arrayAt(data, ['sections', 'categories']);
    var out = [];
    for (var i = 0; i < sections.length; i++) {
      var items = list(sections[i] && (sections[i].items || sections[i].menuItems));
      for (var j = 0; j < items.length; j++) {
        if (isObject(items[j]) && !items[j].category && sections[i].name) {
          items[j].category = sections[i].name;
        }
        out.push(items[j]);
      }
    }
    return out;
  }

  function mapOrder(raw) {
    if (!isObject(raw)) { return null; }
    var id = firstString([raw.id, raw.order_id, raw.orderId, raw.uuid]);
    if (!id) { return null; }
    return {
      id: id,
      status: firstString([raw.status, raw.state, raw.orderStatus]),
      restaurant_name: firstString([raw.restaurant_name, raw.restaurantName, raw.storeName]),
      total: firstString([raw.total, raw.total_display, raw.totalDisplay, raw.price]),
      total_value: num(first([raw.total_value, raw.totalValue, raw.totalAmount])),
      created_at: firstString([raw.created_at, raw.createdAt, raw.orderedAt]),
      item_count: num(first([raw.item_count, raw.itemCount, raw.itemsCount]))
    };
  }

  var handlers = {
    'ubereats.list_restaurants': readHandler(
      'ubereats.list_restaurants',
      LIST_RESTAURANTS_PARAMS,
      async function (args, ctx) {
        var limit = boundedInt(args.limit, 20, 1, 50);
        return readApi('ubereats.list_restaurants', apiSpec('/eats/v1/restaurants', [
          ['address', args.address],
          ['query', args.query],
          ['limit', limit]
        ]), ctx, function (data) {
          var restaurants = arrayAt(data, ['restaurants', 'stores']).map(mapRestaurant).filter(Boolean);
          return restaurants.length ? { restaurants: restaurants } : null;
        });
      }
    ),
    'ubereats.get_menu': readHandler(
      'ubereats.get_menu',
      RESTAURANT_ID_PARAMS,
      async function (args, ctx) {
        var restaurantId = str(args.restaurant_id).trim();
        if (!restaurantId) { return fallback('ubereats.get_menu', 'ubereats-invalid-restaurant-id'); }
        return readApi(
          'ubereats.get_menu',
          apiSpec('/eats/v1/restaurants/' + encodeURIComponent(restaurantId) + '/menu', []),
          ctx,
          function (data) {
            var items = menuItems(data).map(mapMenuItem).filter(Boolean);
            return items.length ? { menu: items } : null;
          }
        );
      }
    ),
    'ubereats.list_orders': readHandler(
      'ubereats.list_orders',
      LIST_ORDERS_PARAMS,
      async function (args, ctx) {
        var limit = boundedInt(args.limit, 20, 1, 50);
        return readApi('ubereats.list_orders', apiSpec('/eats/v1/orders', [
          ['status', args.status],
          ['limit', limit]
        ]), ctx, function (data) {
          var orders = arrayAt(data, ['orders']).map(mapOrder).filter(Boolean);
          return orders.length ? { orders: orders } : null;
        });
      }
    ),
    'ubereats.place_order': guarded(
      'ubereats.place_order',
      'write',
      PLACE_ORDER_PARAMS,
      'unverified-ubereats-place-order-payment-mutation'
    ),
    'ubereats.cancel_order': guarded(
      'ubereats.cancel_order',
      'destructive',
      CANCEL_ORDER_PARAMS,
      'unverified-ubereats-cancel-order-mutation'
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
            service: UBEREATS_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerUbereats = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
