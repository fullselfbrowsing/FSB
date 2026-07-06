(function (global) {
  'use strict';

  /**
   * Home Depot first-party T1 head.
   *
   * Promotes explicit Home Depot product, store, cart, and saved-item reads that
   * can be expressed through executeBoundSpec. The cart mutation is registered
   * only as guarded fail-closed until live mutation-body UAT records activation
   * evidence. Customer cookie parsing and browser navigation rows stay absent.
   */

  var HOMEDEPOT_ORIGIN = 'https://www.homedepot.com';
  var HOMEDEPOT_SERVICE = 'homedepot.com';
  var GQL_URL = 'https://apionline.homedepot.com/federation-gateway/graphql';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({});
  var ITEM_PARAMS = schema({
    item_id: { type: 'string', minLength: 1, description: 'Home Depot product item ID' },
    store_id: { type: 'string', description: 'Store ID for local pricing and fulfillment' }
  }, ['item_id']);
  var SEARCH_PARAMS = schema({
    keyword: { type: 'string', minLength: 1, description: 'Search keyword' },
    store_id: { type: 'string', description: 'Store ID for local pricing and availability' }
  }, ['keyword']);
  var STORE_SEARCH_PARAMS = schema({
    zip_code: { type: 'string', minLength: 1, description: 'ZIP code to search near' },
    radius: { type: 'number', description: 'Search radius in miles' }
  }, ['zip_code']);
  var ADD_TO_CART_PARAMS = schema({
    item_id: { type: 'string', minLength: 1, description: 'Product item ID to add' },
    quantity: integerSchema('Quantity to add', 1, INT_LIMIT),
    store_id: { type: 'string', description: 'Store ID for fulfillment' }
  }, ['item_id']);

  var SEARCH_QUERY = 'query searchModel($keyword: String!, $channel: Channel!, $storefilter: StoreFilter, $storeId: String) {\n' +
    '  searchModel(keyword: $keyword, channel: $channel, storefilter: $storefilter, storeId: $storeId) {\n' +
    '    searchReport { totalProducts keyword }\n' +
    '    products {\n' +
    '      itemId\n' +
    '      identifiers { itemId productLabel storeSkuNumber brandName modelNumber canonicalUrl }\n' +
    '      media { images { url } }\n' +
    '      pricing(storeId: $storeId) { value original unitOfMeasure }\n' +
    '      reviews { ratingsReviews { averageRating totalReviews } }\n' +
    '      availabilityType { type }\n' +
    '    }\n' +
    '  }\n' +
    '}';

  var PRODUCT_QUERY = 'query productClientOnlyProduct($storeId: String, $itemId: String!) {\n' +
    '  product(itemId: $itemId) {\n' +
    '    itemId dataSources\n' +
    '    identifiers { itemId productLabel storeSkuNumber brandName modelNumber parentId canonicalUrl }\n' +
    '    details { description collection { name url } }\n' +
    '    media { images { url sizes type subType } }\n' +
    '    pricing(storeId: $storeId) { value original mapAboveOriginalPrice message unitOfMeasure }\n' +
    '    reviews { ratingsReviews { averageRating totalReviews } }\n' +
    '    availabilityType { type discontinued }\n' +
    '    fulfillment(storeId: $storeId) { fulfillmentOptions { type services { type locations { isAnchor inventory { isInStock isLimitedQuantity quantity } } } } }\n' +
    '  }\n' +
    '}';

  var STORE_SEARCH_QUERY = 'query storeSearch($zipCode: String!, $radius: Float!) {\n' +
    '  storeSearch(zipCode: $zipCode, radius: $radius) {\n' +
    '    storeId storeName phone\n' +
    '    address { street city state postalCode }\n' +
    '    storeHours { monday { open close } tuesday { open close } wednesday { open close } thursday { open close } friday { open close } saturday { open close } sunday { open close } }\n' +
    '  }\n' +
    '}';

  var CART_SUMMARY_QUERY = 'query getCart {\n' +
    '  cartInfo { cartId itemCount totals { total totalWithNoDiscount totalDiscount deliveryCharge } localization { primaryStoreId deliveryZip deliveryStateCode } }\n' +
    '}';

  var CART_ITEMS_QUERY = 'query getCart {\n' +
    '  cartInfo { items { id quantity product { itemId identifiers { productLabel brandName canonicalUrl } pricing { value total } media { images { url } } } fulfillmentType } }\n' +
    '}';

  var SAVED_ITEMS_QUERY = 'query getAllSaveForLaterItems {\n' +
    '  saveForLaterList {\n' +
    '    itemCount\n' +
    '    items { quantity product { media { images { url } } identifiers { itemId canonicalUrl brandName productLabel modelNumber storeSkuNumber productType } pricing { original value total } } }\n' +
    '  }\n' +
    '}';

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
      reason: reason || 'homedepot-shape-mismatch',
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

  function trimString(value) {
    return str(value).trim();
  }

  function boundedRadius(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) { n = 25; }
    if (n < 1) { n = 1; }
    if (n > 100) { n = 100; }
    return n;
  }

  function defaultStoreId(value) {
    var out = trimString(value);
    return out || '6672';
  }

  function activePath(ctx) {
    var fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (var i = 0; i < fields.length; i++) {
      var value = ctx && ctx[fields[i]];
      if (typeof value !== 'string' || !value) { continue; }
      try {
        var parsed = new URL(value);
        if (parsed.origin === HOMEDEPOT_ORIGIN) {
          return parsed.pathname + parsed.search;
        }
      } catch (e) {
        return '/';
      }
    }
    return '/';
  }

  function graphSpec(opname, query, variables, experienceName, ctx) {
    return {
      url: GQL_URL + '?opname=' + encodeURIComponent(opname),
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-experience-name': experienceName || 'general-merchandise',
        'x-hd-dc': 'origin',
        'x-debug': 'false',
        'x-current-url': activePath(ctx),
        'X-Api-Cookies': JSON.stringify({ 'x-user-id': '' })
      },
      body: JSON.stringify({
        operationName: opname,
        variables: variables || {},
        query: query
      }),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: HOMEDEPOT_ORIGIN,
      extract: '@'
    };
  }

  function bootstrapSpec(ctx) {
    return {
      url: HOMEDEPOT_ORIGIN + '/',
      method: 'GET',
      headers: { 'Accept': 'text/html,application/xhtml+xml,application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: HOMEDEPOT_ORIGIN,
      extract: '@'
    };
  }

  function textFromResult(result) {
    if (!result) { return ''; }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    return '';
  }

  function parseJsonText(text) {
    var s = str(text).trim();
    if (!s || (s.charAt(0) !== '{' && s.charAt(0) !== '[')) { return null; }
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function readJsonObjectAfter(text, marker) {
    var idx = str(text).indexOf(marker);
    if (idx === -1) { return null; }
    var start = text.indexOf('{', idx);
    if (start === -1) { return null; }
    var depth = 0;
    var inString = false;
    var escaped = false;
    for (var i = start; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inString) {
        if (escaped) { escaped = false; }
        else if (ch === '\\') { escaped = true; }
        else if (ch === '"') { inString = false; }
        continue;
      }
      if (ch === '"') { inString = true; }
      else if (ch === '{') { depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return parseJsonText(text.slice(start, i + 1));
        }
      }
    }
    return null;
  }

  function failedHttp(result, slug, reason) {
    if (!result || result.success !== true) {
      return fallback(slug, reason || 'homedepot-request-failed');
    }
    var status = Number(result.status || 0);
    if (result.redirected || status === 401 || status === 403 || status >= 400) {
      return fallback(slug, reason || 'homedepot-logged-out-or-http-error');
    }
    return null;
  }

  function graphData(result, slug) {
    var failed = failedHttp(result, slug, 'homedepot-graphql-http-error');
    if (failed) { return failed; }
    var body = result.data;
    if (typeof body === 'string') { body = parseJsonText(body); }
    if (!isObject(body)) { return fallback(slug, 'homedepot-graphql-shape-mismatch'); }
    if (Array.isArray(body.errors) && body.errors.length && !isObject(body.data)) {
      return fallback(slug, 'homedepot-graphql-errors');
    }
    if (!isObject(body.data)) { return fallback(slug, 'homedepot-graphql-data-missing'); }
    return body.data;
  }

  async function callGraph(slug, opname, query, variables, ctx, mapper, experienceName) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'homedepot-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(graphSpec(opname, query, variables, experienceName, ctx), ctx.tabId);
    var data = graphData(res, slug);
    if (!data || data.success === false) { return data; }
    var mapped = mapper(data);
    if (!mapped) { return fallback(slug, 'homedepot-graphql-shape-mismatch'); }
    return { success: true, status: res.status, data: mapped };
  }

  function mapProductSummary(raw) {
    var p = raw || {};
    var identifiers = p.identifiers || {};
    var media = p.media || {};
    var pricing = p.pricing || {};
    var reviews = (p.reviews && p.reviews.ratingsReviews) || {};
    var availability = p.availabilityType || {};
    return {
      item_id: str(p.itemId || identifiers.itemId),
      name: str(identifiers.productLabel),
      brand: str(identifiers.brandName),
      model_number: str(identifiers.modelNumber),
      url: str(identifiers.canonicalUrl),
      image_url: str(list(media.images)[0] && list(media.images)[0].url),
      price: num(pricing.value),
      original_price: pricing.original === undefined ? num(pricing.value) : num(pricing.original),
      unit_of_measure: str(pricing.unitOfMeasure),
      average_rating: str(reviews.averageRating),
      total_reviews: str(reviews.totalReviews),
      availability_type: str(availability.type)
    };
  }

  function mapProductDetail(raw) {
    var p = raw || {};
    var summary = mapProductSummary(p);
    var identifiers = p.identifiers || {};
    var details = p.details || {};
    var availability = p.availabilityType || {};
    var fulfillment = p.fulfillment || {};
    summary.description = str(details.description);
    summary.store_sku = str(identifiers.storeSkuNumber);
    summary.parent_id = str(identifiers.parentId);
    summary.discontinued = availability.discontinued === true;
    summary.fulfillment_options = list(fulfillment.fulfillmentOptions).map(function (option) {
      return str(option && option.type);
    }).filter(Boolean);
    return summary;
  }

  function mapStore(raw) {
    var s = raw || {};
    var address = s.address || {};
    var hours = {};
    var rawHours = isObject(s.storeHours) ? s.storeHours : {};
    for (var day in rawHours) {
      if (Object.prototype.hasOwnProperty.call(rawHours, day)) {
        var h = rawHours[day] || {};
        hours[day] = str(h.open) + '-' + str(h.close);
      }
    }
    return {
      store_id: str(s.storeId),
      store_name: str(s.storeName),
      phone: str(s.phone),
      street: str(address.street),
      city: str(address.city),
      state: str(address.state),
      postal_code: str(address.postalCode),
      hours: hours
    };
  }

  function mapCartTotals(raw) {
    var t = raw || {};
    return {
      total: t.total === undefined ? null : t.total,
      subtotal: t.totalWithNoDiscount === undefined ? null : t.totalWithNoDiscount,
      discount: t.totalDiscount === undefined ? null : t.totalDiscount,
      delivery_charge: t.deliveryCharge === undefined ? null : t.deliveryCharge
    };
  }

  function mapCartItem(raw) {
    var item = raw || {};
    var product = item.product || {};
    var identifiers = product.identifiers || {};
    var pricing = product.pricing || {};
    var media = product.media || {};
    return {
      id: str(item.id),
      item_id: str(product.itemId || identifiers.itemId),
      quantity: num(item.quantity),
      name: str(identifiers.productLabel),
      brand: str(identifiers.brandName),
      price: pricing.value === undefined ? num(pricing.total) : num(pricing.value),
      image_url: str(list(media.images)[0] && list(media.images)[0].url),
      url: str(identifiers.canonicalUrl),
      fulfillment_type: str(item.fulfillmentType)
    };
  }

  function mapSavedItem(raw) {
    var item = raw || {};
    var product = item.product || {};
    var identifiers = product.identifiers || {};
    var pricing = product.pricing || {};
    var media = product.media || {};
    return {
      item_id: str(identifiers.itemId),
      name: str(identifiers.productLabel),
      brand: str(identifiers.brandName),
      model_number: str(identifiers.modelNumber),
      price: pricing.value === undefined ? num(pricing.total) : num(pricing.value),
      original_price: pricing.original === undefined ? num(pricing.value) : num(pricing.original),
      quantity: num(item.quantity),
      image_url: str(list(media.images)[0] && list(media.images)[0].url),
      url: str(identifiers.canonicalUrl),
      product_type: str(identifiers.productType),
      store_sku: str(identifiers.storeSkuNumber)
    };
  }

  function readHandler(slug, params, handler) {
    return {
      tier: 'T1a',
      origin: HOMEDEPOT_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        return handler(args || {}, ctx);
      }
    };
  }

  function guarded(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: HOMEDEPOT_ORIGIN,
      sideEffectClass: 'write',
      params: params,
      async handle() {
        return fallback(slug, reason || 'unverified-homedepot-mutation');
      }
    };
  }

  async function getCart(args, ctx) {
    var slug = 'homedepot.get_cart';
    var summaryResult = await callGraph(slug, 'getCart', CART_SUMMARY_QUERY, {}, ctx, function (data) {
      var cart = data.cartInfo;
      if (!isObject(cart)) { return null; }
      var localization = cart.localization || {};
      return {
        cart_id: cart.cartId === undefined ? null : cart.cartId,
        item_count: num(cart.itemCount),
        items: [],
        totals: mapCartTotals(cart.totals || {}),
        delivery_zip: str(localization.deliveryZip),
        store_id: str(localization.primaryStoreId)
      };
    }, 'my-cart');
    if (!summaryResult || summaryResult.success === false) { return summaryResult; }
    if (!summaryResult.data || summaryResult.data.item_count <= 0) { return summaryResult; }

    var detailResult = await callGraph(slug, 'getCart', CART_ITEMS_QUERY, {}, ctx, function (data) {
      var cart = data.cartInfo;
      if (!isObject(cart) || !Array.isArray(cart.items)) { return null; }
      return { items: cart.items.map(mapCartItem) };
    }, 'my-cart');
    if (!detailResult || detailResult.success === false) { return detailResult; }
    summaryResult.data.items = detailResult.data.items;
    return summaryResult;
  }

  async function getStoreContext(args, ctx) {
    var slug = 'homedepot.get_store_context';
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'homedepot-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(bootstrapSpec(ctx), ctx.tabId);
    var failed = failedHttp(res, slug, 'homedepot-store-context-http-error');
    if (failed) { return failed; }
    var payload = isObject(res.data) ? res.data : null;
    var context = payload && (payload.__EXPERIENCE_CONTEXT__ || payload.experienceContext || payload);
    if (!isObject(context)) {
      var text = textFromResult(res);
      context = readJsonObjectAfter(text, '__EXPERIENCE_CONTEXT__') ||
        readJsonObjectAfter(text, 'experienceContext');
    }
    if (!isObject(context)) { return fallback(slug, 'homedepot-store-context-shape-mismatch'); }
    var store = context.store || {};
    if (!store.storeId && !context.deliveryZip) {
      return fallback(slug, 'homedepot-store-context-shape-mismatch');
    }
    return {
      success: true,
      status: res.status,
      data: {
        store_id: str(store.storeId),
        store_name: str(store.storeName),
        delivery_zip: str(context.deliveryZip),
        store_zip: str(store.storeZip)
      }
    };
  }

  var handlers = {
    'homedepot.add_to_cart': guarded(
      'homedepot.add_to_cart',
      ADD_TO_CART_PARAMS,
      'unverified-homedepot-add-to-cart-mutation'
    ),
    'homedepot.search_products': readHandler(
      'homedepot.search_products',
      SEARCH_PARAMS,
      function (args, ctx) {
        var keyword = trimString(args.keyword);
        if (!keyword) { return fallback('homedepot.search_products', 'homedepot-invalid-keyword'); }
        return callGraph('homedepot.search_products', 'searchModel', SEARCH_QUERY, {
          keyword: keyword,
          channel: 'DESKTOP',
          storefilter: 'ALL',
          storeId: defaultStoreId(args.store_id)
        }, ctx, function (data) {
          var model = data.searchModel;
          if (!isObject(model) || !Array.isArray(model.products)) { return null; }
          var report = model.searchReport || {};
          return {
            products: model.products.map(mapProductSummary),
            total_products: num(report.totalProducts),
            keyword: str(report.keyword || keyword)
          };
        });
      }
    ),
    'homedepot.get_product': readHandler(
      'homedepot.get_product',
      ITEM_PARAMS,
      function (args, ctx) {
        var itemId = trimString(args.item_id);
        if (!itemId) { return fallback('homedepot.get_product', 'homedepot-invalid-item-id'); }
        return callGraph('homedepot.get_product', 'productClientOnlyProduct', PRODUCT_QUERY, {
          itemId: itemId,
          storeId: defaultStoreId(args.store_id)
        }, ctx, function (data) {
          if (!isObject(data.product)) { return null; }
          var product = mapProductDetail(data.product);
          if (!product.item_id || !product.name) { return null; }
          return { product: product };
        });
      }
    ),
    'homedepot.search_stores': readHandler(
      'homedepot.search_stores',
      STORE_SEARCH_PARAMS,
      function (args, ctx) {
        var zip = trimString(args.zip_code);
        if (!zip) { return fallback('homedepot.search_stores', 'homedepot-invalid-zip-code'); }
        return callGraph('homedepot.search_stores', 'storeSearch', STORE_SEARCH_QUERY, {
          zipCode: zip,
          radius: boundedRadius(args.radius)
        }, ctx, function (data) {
          if (!Array.isArray(data.storeSearch)) { return null; }
          return { stores: data.storeSearch.map(mapStore) };
        });
      }
    ),
    'homedepot.get_cart': readHandler('homedepot.get_cart', EMPTY_PARAMS, getCart),
    'homedepot.get_saved_items': readHandler(
      'homedepot.get_saved_items',
      EMPTY_PARAMS,
      function (args, ctx) {
        return callGraph('homedepot.get_saved_items', 'getAllSaveForLaterItems', SAVED_ITEMS_QUERY, {}, ctx, function (data) {
          var saved = data.saveForLaterList;
          if (!isObject(saved)) { return null; }
          var items = list(saved.items);
          return {
            item_count: num(saved.itemCount),
            items: items.map(mapSavedItem)
          };
        }, 'my-cart');
      }
    ),
    'homedepot.get_store_context': readHandler('homedepot.get_store_context', EMPTY_PARAMS, getStoreContext)
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
            service: HOMEDEPOT_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerHomedepot = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
