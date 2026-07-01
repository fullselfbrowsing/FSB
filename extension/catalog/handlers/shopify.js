(function (global) {
  'use strict';

  /**
   * Shopify Admin same-origin read + guarded mutation head.
   *
   * Shopify Admin runs on the first-party https://admin.shopify.com web app.
   * Reviewed catalog/order reads execute through executeBoundSpec with same-origin
   * cookies and strict response-shape guards. Paid-order creation and order
   * cancellation remain guarded fail-closed until live mutation-body UAT records
   * the exact request body, auth/CSRF carriers, and redaction proof.
   */

  var ORIGIN = 'https://admin.shopify.com';
  var SERVICE = 'shopify.com';
  var API_BASE = ORIGIN + '/admin/api';
  var INT_LIMIT = 9007199254740991;
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  var LIST_PRODUCTS_PARAMS = schema({
    collection: { type: 'string', description: 'Collection handle or ID to filter by' },
    query: { type: 'string', description: 'Search term to filter products by title' },
    limit: integerSchema('Maximum number of products to return', 1, 100)
  }, []);
  var GET_PRODUCT_PARAMS = schema({
    product_id: { type: 'string', minLength: 1, description: 'The product ID to retrieve' }
  }, ['product_id']);
  var LIST_ORDERS_PARAMS = schema({
    status: { type: 'string', enum: ['open', 'closed', 'cancelled', 'any'], description: 'Filter orders by status' },
    limit: integerSchema('Maximum number of orders to return', 1, 100)
  }, []);
  var CREATE_ORDER_PARAMS = schema({
    line_items: {
      minItems: 1,
      type: 'array',
      items: schema({
        variant_id: { type: 'string', description: 'The product variant ID' },
        quantity: integerSchema('Quantity of this variant', 1, INT_LIMIT)
      }, ['variant_id', 'quantity']),
      description: 'The line items to order'
    },
    shipping_address: { type: 'string', minLength: 1, description: 'The address to ship to' },
    payment_method_id: { type: 'string', description: 'Optional saved payment method ID to charge' }
  }, ['line_items', 'shipping_address']);
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
    return typedRecipeError(FALLBACK_CODE, {
      slug: slug,
      reason: reason || 'shopify-auth-or-shape-mismatch',
      fellBackToDom: true
    });
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

  function apiSpec(path, pairs) {
    return {
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
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

  function bool(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function looksLikeError(data) {
    return isObject(data) && (
      data.success === false ||
      typeof data.error === 'string' ||
      typeof data.message === 'string' ||
      Array.isArray(data.errors)
    );
  }

  function resultData(result, slug, reason) {
    if (!result || result.success !== true) {
      return fallback(slug, reason + '-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, reason + '-http-error');
    }
    if (result.data === undefined || result.data === null || looksLikeError(result.data)) {
      return fallback(slug, reason + '-shape-mismatch');
    }
    return result.data;
  }

  function withData(result, data) {
    var out = {};
    for (var key in result) {
      if (Object.prototype.hasOwnProperty.call(result, key)) { out[key] = result[key]; }
    }
    out.data = data;
    return out;
  }

  function firstVariant(product) {
    var variants = list(product && product.variants);
    return variants.length ? variants[0] : {};
  }

  function variantInventory(product) {
    var variants = list(product && product.variants);
    var total = 0;
    for (var i = 0; i < variants.length; i++) {
      total += num(variants[i] && variants[i].inventory_quantity);
    }
    return total;
  }

  function mapVariant(v) {
    v = isObject(v) ? v : {};
    return {
      id: str(v.id),
      title: str(v.title),
      sku: str(v.sku),
      price: num(v.price),
      inventory_quantity: num(v.inventory_quantity),
      available: bool(v.available)
    };
  }

  function mapProduct(p) {
    p = isObject(p) ? p : {};
    var v = firstVariant(p);
    return {
      id: str(p.id),
      title: str(p.title),
      handle: str(p.handle),
      vendor: str(p.vendor),
      product_type: str(p.product_type),
      status: str(p.status),
      price: num(p.price !== undefined ? p.price : v.price),
      in_stock: bool(p.in_stock) || variantInventory(p) > 0,
      inventory_quantity: variantInventory(p),
      created_at: str(p.created_at),
      updated_at: str(p.updated_at),
      published_at: str(p.published_at),
      tags: Array.isArray(p.tags) ? p.tags.map(str) : str(p.tags).split(',').map(function(tag) { return tag.trim(); }).filter(Boolean),
      variants: list(p.variants).map(mapVariant)
    };
  }

  function mapOrder(o) {
    o = isObject(o) ? o : {};
    return {
      id: str(o.id),
      name: str(o.name),
      order_number: str(o.order_number),
      status: str(o.status || o.display_fulfillment_status),
      financial_status: str(o.financial_status || o.display_financial_status),
      fulfillment_status: str(o.fulfillment_status || o.display_fulfillment_status),
      total_price: num(o.total_price || o.total_price_set && o.total_price_set.shop_money && o.total_price_set.shop_money.amount),
      currency: str(o.currency || o.presentment_currency),
      created_at: str(o.created_at),
      updated_at: str(o.updated_at),
      cancelled_at: str(o.cancelled_at),
      customer_email: str(o.email || o.contact_email),
      line_item_count: list(o.line_items).length
    };
  }

  function productsFromData(data) {
    if (Array.isArray(data)) { return data; }
    if (isObject(data) && Array.isArray(data.products)) { return data.products; }
    if (isObject(data) && isObject(data.data) && Array.isArray(data.data.products)) { return data.data.products; }
    return null;
  }

  function productFromData(data) {
    if (isObject(data) && isObject(data.product)) { return data.product; }
    if (isObject(data) && isObject(data.data) && isObject(data.data.product)) { return data.data.product; }
    if (isObject(data) && (data.id || data.title)) { return data; }
    return null;
  }

  function ordersFromData(data) {
    if (Array.isArray(data)) { return data; }
    if (isObject(data) && Array.isArray(data.orders)) { return data.orders; }
    if (isObject(data) && isObject(data.data) && Array.isArray(data.data.orders)) { return data.data.orders; }
    return null;
  }

  async function readApi(slug, path, pairs, mapper, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'shopify-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(apiSpec(path, pairs || []), ctx.tabId);
    var data = resultData(res, slug, 'shopify-api');
    if (!data || data.success === false) { return data; }
    try {
      var mapped = mapper(data);
      if (!mapped) { return fallback(slug, 'shopify-api-shape-mismatch'); }
      return withData(res, mapped);
    } catch (_err) {
      return fallback(slug, 'shopify-api-shape-mismatch');
    }
  }

  function readHandler(slug, params, pathForArgs, queryForArgs, mapper) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var input = args || {};
        return readApi(slug, pathForArgs(input), queryForArgs ? queryForArgs(input) : [], mapper, ctx);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'shopify.list_products': readHandler('shopify.list_products', LIST_PRODUCTS_PARAMS,
      function() { return '/products'; },
      function(args) { return [['collection', args.collection], ['query', args.query], ['limit', args.limit]]; },
      function(data) {
        var products = productsFromData(data);
        return products ? { products: products.map(mapProduct) } : null;
      }),
    'shopify.get_product': readHandler('shopify.get_product', GET_PRODUCT_PARAMS,
      function(args) { return '/products/' + encodeSegment(args.product_id); },
      null,
      function(data) {
        var product = productFromData(data);
        return product ? { product: mapProduct(product) } : null;
      }),
    'shopify.list_orders': readHandler('shopify.list_orders', LIST_ORDERS_PARAMS,
      function() { return '/orders'; },
      function(args) { return [['status', args.status], ['limit', args.limit]]; },
      function(data) {
        var orders = ordersFromData(data);
        return orders ? { orders: orders.map(mapOrder) } : null;
      }),

    'shopify.create_order': guarded('shopify.create_order', 'write', CREATE_ORDER_PARAMS, 'unverified-shopify-create-order-payment-mutation'),
    'shopify.cancel_order': guarded('shopify.cancel_order', 'destructive', CANCEL_ORDER_PARAMS, 'unverified-shopify-cancel-order-destructive-mutation')
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: ORIGIN,
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

  global.FsbHandlerShopify = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
