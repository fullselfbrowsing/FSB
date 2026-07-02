(function (global) {
  'use strict';

  /**
   * Grubhub same-origin T1 head.
   *
   * Ports the reviewed OpenTabs read endpoints over www.grubhub.com. Paid order
   * placement and cancellation are registered only as guarded fail-closed rows
   * until live mutation-body UAT records activation evidence.
   */

  var GRUBHUB_ORIGIN = 'https://www.grubhub.com';
  var GRUBHUB_SERVICE = 'www.grubhub.com';
  var INT_LIMIT = 9007199254740991;

  var LIST_RESTAURANTS_PARAMS = schema({
    address: { type: 'string', description: 'Delivery address to find restaurants for' },
    query: { type: 'string', description: 'Search term (cuisine, dish, or restaurant name)' },
    limit: integerSchema('Maximum number of restaurants to return', 1, 50)
  });
  var GET_RESTAURANT_PARAMS = schema({
    restaurant_id: { type: 'string', minLength: 1, description: 'The restaurant ID to fetch' }
  }, ['restaurant_id']);
  var LIST_ORDERS_PARAMS = schema({
    status: {
      type: 'string',
      enum: ['active', 'completed', 'cancelled'],
      description: 'Filter orders by status'
    },
    limit: integerSchema('Maximum number of orders to return', 1, 50)
  });
  var PLACE_ORDER_PARAMS = schema({
    restaurant_id: { type: 'string', minLength: 1, description: 'The restaurant to order from' },
    items: {
      type: 'array',
      minItems: 1,
      items: schema({
        item_id: { type: 'string', description: 'Menu item ID' },
        quantity: integerSchema('Quantity of this item', 1, INT_LIMIT)
      }, ['item_id', 'quantity']),
      description: 'The cart items to order'
    },
    delivery_address: { type: 'string', minLength: 1, description: 'The address to deliver to' },
    tip_amount: { type: 'number', description: 'Optional tip amount in dollars' }
  }, ['restaurant_id', 'items', 'delivery_address']);
  var CANCEL_ORDER_PARAMS = schema({
    order_id: { type: 'string', minLength: 1, description: 'The order ID to cancel' },
    reason: { type: 'string', description: 'Optional cancellation reason' }
  }, ['order_id']);

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
      reason: reason || 'grubhub-shape-mismatch',
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

  function apiSpec(path, pairs) {
    return {
      url: GRUBHUB_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: GRUBHUB_ORIGIN,
      extract: '@'
    };
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function boundedInt(value, fallbackValue, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) { n = fallbackValue; }
    n = Math.floor(n);
    if (min !== undefined && n < min) { n = min; }
    if (max !== undefined && n > max) { n = max; }
    return n;
  }

  function responseData(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'grubhub-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'grubhub-logged-out-or-http-error');
    }
    if (!isObject(result.data)) {
      return fallback(slug, 'grubhub-shape-mismatch');
    }
    return result.data;
  }

  function mapRestaurant(raw) {
    var r = raw || {};
    return {
      id: str(r.id || r.restaurant_id || r.restaurantId),
      name: str(r.name || r.restaurant_name || r.restaurantName),
      cuisine: str(r.cuisine || r.cuisine_name || r.cuisineName),
      rating: num(r.rating),
      delivery_fee: str(r.delivery_fee || r.deliveryFee),
      delivery_estimate: str(r.delivery_estimate || r.deliveryEstimate || r.eta),
      is_open: r.is_open === undefined ? r.isOpen === true : r.is_open === true
    };
  }

  function mapMenuItem(raw) {
    var item = raw || {};
    return {
      id: str(item.id || item.item_id || item.itemId),
      name: str(item.name),
      price: num(item.price),
      description: str(item.description)
    };
  }

  function mapOrder(raw) {
    var o = raw || {};
    return {
      id: str(o.id || o.order_id || o.orderId),
      status: str(o.status),
      restaurant_name: str(o.restaurant_name || o.restaurantName),
      total: num(o.total),
      placed_at: str(o.placed_at || o.placedAt || o.created_at || o.createdAt)
    };
  }

  async function callApi(slug, spec, ctx, parser) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'grubhub-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(spec, ctx.tabId);
    var data = responseData(res, slug);
    if (!data || data.success === false) { return data; }
    var parsed = parser(data);
    if (!parsed) { return fallback(slug, 'grubhub-shape-mismatch'); }
    return { success: true, data: parsed };
  }

  function readHandler(slug, params, specFn, parser) {
    return {
      tier: 'T1a',
      origin: GRUBHUB_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var a = args || {};
        return callApi(slug, specFn(a), ctx, parser);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: GRUBHUB_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'grubhub.list_restaurants': readHandler(
      'grubhub.list_restaurants',
      LIST_RESTAURANTS_PARAMS,
      function (a) {
        return apiSpec('/v1/restaurants', [
          ['address', a.address],
          ['query', a.query],
          ['limit', a.limit === undefined ? undefined : boundedInt(a.limit, 10, 1, 50)]
        ]);
      },
      function (data) {
        if (!Array.isArray(data.restaurants)) { return null; }
        return { restaurants: data.restaurants.map(mapRestaurant) };
      }
    ),
    'grubhub.get_restaurant': readHandler(
      'grubhub.get_restaurant',
      GET_RESTAURANT_PARAMS,
      function (a) {
        return apiSpec('/v1/restaurants/' + encodeSegment(a.restaurant_id), []);
      },
      function (data) {
        if (!isObject(data.restaurant)) { return null; }
        var restaurant = mapRestaurant(data.restaurant);
        restaurant.menu = list(data.restaurant.menu).map(mapMenuItem);
        return { restaurant: restaurant };
      }
    ),
    'grubhub.list_orders': readHandler(
      'grubhub.list_orders',
      LIST_ORDERS_PARAMS,
      function (a) {
        return apiSpec('/v1/orders', [
          ['status', a.status],
          ['limit', a.limit === undefined ? undefined : boundedInt(a.limit, 10, 1, 50)]
        ]);
      },
      function (data) {
        if (!Array.isArray(data.orders)) { return null; }
        return { orders: data.orders.map(mapOrder) };
      }
    ),
    'grubhub.place_order': guarded(
      'grubhub.place_order',
      'write',
      PLACE_ORDER_PARAMS,
      'unverified-grubhub-paid-order-mutation'
    ),
    'grubhub.cancel_order': guarded(
      'grubhub.cancel_order',
      'destructive',
      CANCEL_ORDER_PARAMS,
      'unverified-grubhub-cancel-order-mutation'
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
            service: GRUBHUB_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerGrubhub = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
