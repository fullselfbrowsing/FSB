(function (global) {
  'use strict';

  /**
   * Instacart same-origin GraphQL READ head.
   *
   * Ports only account, address, cart-summary, cart-detail, and order reads that
   * can be expressed as explicit same-origin persisted-query requests. Product
   * search/detail, delivery-location page state, checkout navigation, cart
   * mutations, and destructive rows stay in the discovery tail until their
   * runtime state carriers or live mutation evidence are reviewed separately.
   */

  var INSTACART_ORIGIN = 'https://www.instacart.com';
  var INSTACART_SERVICE = 'instacart.com';
  var GQL_URL = INSTACART_ORIGIN + '/graphql';
  var INT_LIMIT = 9007199254740991;

  var HASHES = {
    CurrentUser: '4dadd77c2be35e01a3e199e04f3ece27c9beedadb6495b87c7c814c5c176e05c',
    PersonalActiveCarts: 'eac9d17bd45b099fbbdabca2e111acaf2a4fa486f2ce5bc4e8acbab2f31fd8c0',
    CartData: 'febb10bfcc2ba31eec79ad3f2bd7ef1e1a7d2d893b4f212ff438188bb5c1d359',
    UserAddresses: '22e6dfa5cb0c9e731bfb696f34f573c1c2e31b8191e96c2b14329c33400a0ddc',
    OrderDeliveriesConnection: '3a607c6dd2f24ed259549a32fb83378178ad88625db1a25b8377e7ab14fdfcd1',
    OrderDelivery: '3ed4c3e0648822a69f64512ff389c068053f32310edb0f790479a83d6c00b663'
  };

  var EMPTY_PARAMS = schema({});
  var CART_ID_PARAMS = schema({
    cart_id: { type: 'string', minLength: 1, description: 'Cart ID' }
  }, ['cart_id']);
  var ORDER_ID_PARAMS = schema({
    order_id: { type: 'string', minLength: 1, description: 'Order delivery ID' }
  }, ['order_id']);
  var LIST_ORDERS_PARAMS = schema({
    first: integerSchema('Number of orders to return', 1, 50),
    after: { type: 'string', description: 'Pagination cursor from a previous response' }
  });

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
      reason: reason || 'instacart-graphql-shape-mismatch',
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

  function bool(value) {
    return value === true;
  }

  function boundedInt(value, fallbackValue, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) { n = fallbackValue; }
    n = Math.floor(n);
    if (min !== undefined && n < min) { n = min; }
    if (max !== undefined && n > max) { n = max; }
    return n;
  }

  function appendQuery(parts, key, value) {
    if (value === undefined || value === null) { return; }
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      appendQuery(parts, pairs[i][0], pairs[i][1]);
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function gqlSpec(operationName, variables) {
    var hash = HASHES[operationName];
    return {
      url: GQL_URL + buildQuery([
        ['operationName', operationName],
        ['variables', JSON.stringify(variables || {})],
        ['extensions', JSON.stringify({
          persistedQuery: { version: 1, sha256Hash: hash }
        })]
      ]),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-client-identifier': 'web'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: INSTACART_ORIGIN,
      extract: '@'
    };
  }

  function graphqlData(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'instacart-graphql-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'instacart-logged-out-or-http-error');
    }
    var body = result.data;
    if (!isObject(body)) {
      return fallback(slug, 'instacart-graphql-shape-mismatch');
    }
    if (Array.isArray(body.errors) && body.errors.length && !isObject(body.data)) {
      return fallback(slug, 'instacart-graphql-errors');
    }
    if (!isObject(body.data)) {
      return fallback(slug, 'instacart-graphql-data-missing');
    }
    return body.data;
  }

  function mapUser(raw) {
    var u = raw || {};
    var view = u.viewSection || {};
    var avatar = view.avatarImage || {};
    return {
      id: str(u.id),
      email: str(u.email),
      first_name: str(u.firstName),
      last_name: str(u.lastName),
      full_name: str(u.fullName),
      guest: bool(u.guest),
      orders_count: num(u.ordersCount),
      avatar_url: str(avatar.url),
      customer_since: str(view.customerSinceString)
    };
  }

  function mapAddress(raw) {
    var a = raw || {};
    var coords = a.coordinates || {};
    var view = a.viewSection || {};
    return {
      id: str(a.id),
      street_address: str(a.streetAddress || view.lineOneString),
      apartment_number: str(a.apartmentNumber),
      city_state: str(view.cityStateString || view.lineTwoString),
      postal_code: str(a.postalCode),
      latitude: num(coords.latitude),
      longitude: num(coords.longitude),
      instructions: str(a.instructions)
    };
  }

  function mapCartItem(raw) {
    var item = raw || {};
    var product = item.basketProduct || {};
    var view = product.viewSection || {};
    var image = view.primaryImage || {};
    return {
      id: str(item.id),
      item_id: str(product.v4ItemId || product.id),
      product_id: str(product.productId),
      name: str(product.name),
      quantity: num(item.quantity),
      quantity_type: str(item.quantityType || 'each'),
      image_url: str(image.url || product.thumbnailImageUrl)
    };
  }

  function mapCart(raw) {
    var c = raw || {};
    var retailer = c.retailer || {};
    var shop = c.shop || {};
    var collection = c.cartItemCollection || {};
    return {
      id: str(c.id),
      item_count: num(c.itemCount),
      retailer_name: str(retailer.name),
      retailer_id: str(retailer.id),
      shop_id: str(shop.id),
      cart_type: str(c.cartType),
      updated_at: str(c.updatedAt),
      items: list(collection.cartItems).map(mapCartItem)
    };
  }

  function mapCartSummary(raw) {
    var c = raw || {};
    var retailer = c.retailer || {};
    var shop = c.shop || {};
    return {
      id: str(c.id),
      item_count: num(c.itemCount),
      retailer_name: str(retailer.name),
      retailer_id: str(retailer.id),
      shop_id: str(shop.id)
    };
  }

  function itemCountFromOrder(raw) {
    var direct = raw && raw.orderItems && raw.orderItems.totalCount;
    if (direct !== undefined && direct !== null) { return num(direct); }
    var text = str(raw && raw.viewSection && raw.viewSection.itemCountString);
    var match = text.match(/[0-9]+/);
    return match ? num(match[0]) : 0;
  }

  function mapOrder(raw) {
    var o = raw || {};
    var retailer = o.retailer || {};
    var view = o.viewSection || {};
    return {
      id: str(o.id),
      status: str(o.status),
      retailer_name: str(retailer.name),
      created_at: str(o.createdAt),
      total: str(view.totalString),
      item_count: itemCountFromOrder(o)
    };
  }

  async function callGraph(slug, operationName, variables, ctx, mapper) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'instacart-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(gqlSpec(operationName, variables || {}), ctx.tabId);
    var data = graphqlData(res, slug);
    if (!data || data.success === false) { return data; }
    var mapped = mapper(data);
    if (!mapped) { return fallback(slug, 'instacart-graphql-shape-mismatch'); }
    return { success: true, data: mapped };
  }

  function readHandler(slug, params, operationName, variablesForArgs, mapper) {
    return {
      tier: 'T1a',
      origin: INSTACART_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var variables = typeof variablesForArgs === 'function' ? variablesForArgs(a) : variablesForArgs;
        return callGraph(slug, operationName, variables || {}, ctx, mapper);
      }
    };
  }

  var handlers = {
    'instacart.get_current_user': readHandler(
      'instacart.get_current_user',
      EMPTY_PARAMS,
      'CurrentUser',
      {},
      function (data) {
        if (!isObject(data.currentUser)) { return null; }
        return { user: mapUser(data.currentUser) };
      }
    ),
    'instacart.list_addresses': readHandler(
      'instacart.list_addresses',
      EMPTY_PARAMS,
      'UserAddresses',
      {},
      function (data) {
        if (!Array.isArray(data.userAddresses)) { return null; }
        return { addresses: data.userAddresses.map(mapAddress) };
      }
    ),
    'instacart.list_active_carts': readHandler(
      'instacart.list_active_carts',
      EMPTY_PARAMS,
      'PersonalActiveCarts',
      {},
      function (data) {
        var userCarts = data.userCarts || {};
        if (!Array.isArray(userCarts.carts)) { return null; }
        return { carts: userCarts.carts.map(mapCartSummary) };
      }
    ),
    'instacart.get_cart': readHandler(
      'instacart.get_cart',
      CART_ID_PARAMS,
      'CartData',
      function (args) { return { id: str(args.cart_id) }; },
      function (data) {
        if (!isObject(data.userCart)) { return null; }
        return { cart: mapCart(data.userCart) };
      }
    ),
    'instacart.list_orders': readHandler(
      'instacart.list_orders',
      LIST_ORDERS_PARAMS,
      'OrderDeliveriesConnection',
      function (args) {
        return {
          first: boundedInt(args.first, 10, 1, 50),
          after: args.after ? str(args.after) : null
        };
      },
      function (data) {
        var conn = data.orderDeliveriesConnection || {};
        var pageInfo = conn.pageInfo || {};
        if (!Array.isArray(conn.nodes)) { return null; }
        return {
          orders: conn.nodes.map(mapOrder),
          has_next_page: bool(pageInfo.hasNextPage),
          end_cursor: str(pageInfo.endCursor)
        };
      }
    ),
    'instacart.get_order': readHandler(
      'instacart.get_order',
      ORDER_ID_PARAMS,
      'OrderDelivery',
      function (args) { return { id: str(args.order_id) }; },
      function (data) {
        if (!isObject(data.orderDelivery)) { return null; }
        return { order: mapOrder(data.orderDelivery) };
      }
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
            service: INSTACART_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerInstacart = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
