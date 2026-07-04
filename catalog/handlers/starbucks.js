(function (global) {
  'use strict';

  /**
   * Starbucks same-origin T1 head.
   *
   * Starbucks web calls stay on www.starbucks.com under /apiproxy/v1. Read-only
   * calls use executeBoundSpec with session cookies carried by the browser. Cart,
   * favorite, and store mutations are registered only as guarded fail-closed until
   * live mutation-body UAT records the method/path/body and redaction proof.
   */

  var STARBUCKS_ORIGIN = 'https://www.starbucks.com';
  var STARBUCKS_SERVICE = 'starbucks.com';
  var API_BASE = STARBUCKS_ORIGIN + '/apiproxy/v1';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string' };
  var BOOLEAN = { type: 'boolean' };
  var EMPTY_PARAMS = schema({}, []);
  var STORE_NUMBER = { type: 'string', description: 'Starbucks store number' };

  var FIND_STORES_PARAMS = schema({
    lat: { type: 'number', description: 'Latitude coordinate' },
    lng: { type: 'number', description: 'Longitude coordinate' },
    limit: integerSchema('Maximum number of stores to return', 1, 50)
  }, ['lat', 'lng']);
  var STORE_NUMBER_PARAMS = schema({ store_number: STORE_NUMBER }, ['store_number']);
  var GET_PRODUCT_PARAMS = schema({
    product_number: integerSchema('Product number', -INT_LIMIT, INT_LIMIT),
    form: STRING,
    store_number: STORE_NUMBER
  }, ['product_number', 'form', 'store_number']);
  var FEED_PARAMS = schema({
    limit: integerSchema('Maximum number of feed items to return', 1, 50),
    offset: integerSchema('Pagination offset', 0, INT_LIMIT)
  }, []);
  var FAVORITE_PRODUCTS_PARAMS = schema({
    store_number: STORE_NUMBER,
    limit: integerSchema('Maximum number of favorites to return', 1, 50)
  }, ['store_number']);
  var PREVIOUS_ORDERS_PARAMS = schema({
    store_number: STORE_NUMBER,
    limit: integerSchema('Maximum number of orders to return', 1, 50)
  }, []);
  var PRICE_ORDER_PARAMS = schema({
    store_number: STORE_NUMBER,
    items: {
      type: 'array',
      minItems: 1,
      items: schema({
        sku: STRING,
        quantity: integerSchema('Quantity of this item', 1, INT_LIMIT),
        child_skus: { type: 'array', items: STRING }
      }, ['sku', 'quantity'])
    }
  }, ['store_number', 'items']);

  var ADD_FAVORITE_PRODUCT_PARAMS = schema({
    name: STRING,
    product_number: integerSchema('Product number', -INT_LIMIT, INT_LIMIT),
    form: STRING,
    size_code: STRING,
    sku: STRING
  }, ['name', 'product_number', 'form', 'size_code', 'sku']);
  var ADD_PRODUCT_TO_CART_PARAMS = schema({
    product_number: integerSchema('Product number', -INT_LIMIT, INT_LIMIT),
    form: STRING,
    size: STRING,
    quantity: integerSchema('Quantity to add', 1, INT_LIMIT),
    store_number: STORE_NUMBER
  }, ['product_number', 'form', 'store_number']);
  var DELETE_FAVORITE_PRODUCT_PARAMS = schema({
    favorite_product_id: STRING
  }, ['favorite_product_id']);
  var TOGGLE_FAVORITE_STORE_PARAMS = schema({
    store_number: STORE_NUMBER,
    favorite: BOOLEAN
  }, ['store_number', 'favorite']);
  var UPDATE_PRODUCT_QUANTITY_PARAMS = schema({
    item_key: STRING,
    quantity: integerSchema('New quantity', 0, INT_LIMIT)
  }, ['item_key', 'quantity']);

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
      reason: reason || 'starbucks-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function numberValue(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function boolValue(value) {
    return value === true;
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function buildApiSpec(path, pairs) {
    return {
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: STARBUCKS_ORIGIN,
      extract: '@'
    };
  }

  function buildOrchestraSpec(operationId, variables) {
    return {
      url: API_BASE + '/orchestra/' + encodeSegment(operationId),
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        operationId: operationId,
        variables: variables || {}
      }),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: STARBUCKS_ORIGIN,
      extract: '@'
    };
  }

  function activeUrlFromContext(ctx) {
    var fallbackUrl = STARBUCKS_ORIGIN + '/account/for-you';
    if (!ctx || typeof ctx !== 'object') { return fallbackUrl; }
    var fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (var i = 0; i < fields.length; i++) {
      var value = ctx[fields[i]];
      if (typeof value === 'string' && value) {
        try {
          var parsed = new URL(value);
          if (parsed.origin === STARBUCKS_ORIGIN) { return value; }
        } catch (e) {
          return fallbackUrl;
        }
      }
    }
    return fallbackUrl;
  }

  function buildBootstrapSpec(ctx) {
    return {
      url: activeUrlFromContext(ctx),
      method: 'GET',
      headers: { 'Accept': 'text/html,application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: STARBUCKS_ORIGIN,
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

  function objectAtPath(root, parts) {
    var cur = root;
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== 'object') { return null; }
      cur = cur[parts[i]];
    }
    return cur === undefined ? null : cur;
  }

  function readJsonObjectAfter(text, marker) {
    var idx = String(text || '').indexOf(marker);
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
          try { return JSON.parse(text.slice(start, i + 1)); } catch (e) { return null; }
        }
      }
    }
    return null;
  }

  function stateFromBootstrap(result) {
    var data = result && result.data;
    if (isObject(data)) {
      return data.state || data.store || data.__INITIAL_STATE__ || data.__PRELOADED_STATE__ || data;
    }
    var text = textFromResult(result);
    return readJsonObjectAfter(text, '__PRELOADED_STATE__') ||
      readJsonObjectAfter(text, '__INITIAL_STATE__') ||
      readJsonObjectAfter(text, 'window.store') ||
      null;
  }

  function failedHttp(result, slug, reason) {
    if (!result || result.success !== true) { return result || fallback(slug, 'starbucks-empty-response'); }
    var status = Number(result.status || 0);
    if (result.redirected || status === 401 || status === 403 || status >= 400) {
      return fallback(slug, reason || 'starbucks-logged-out-or-http-error');
    }
    return null;
  }

  function looksLikeError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data) &&
      (typeof data.error === 'string' ||
        typeof data.message === 'string' ||
        Array.isArray(data.errors));
  }

  function mapStore(row) {
    var r = isObject(row) ? row : {};
    var s = isObject(r.store) ? r.store : {};
    var address = isObject(s.address) ? s.address : {};
    var coordinates = isObject(s.coordinates) ? s.coordinates : {};
    var mobileOrdering = isObject(s.mobileOrdering) ? s.mobileOrdering : {};
    var amenities = Array.isArray(s.amenities) ? s.amenities : [];
    return {
      store_id: String(s.id || ''),
      store_number: String(s.storeNumber || ''),
      name: String(s.name || ''),
      phone_number: String(s.phoneNumber || ''),
      is_open: boolValue(s.open),
      open_status: String(s.openStatusFormatted || ''),
      hours_status: String(s.hoursStatusFormatted || ''),
      address_single_line: String(address.singleLine || ''),
      city: String(address.city || ''),
      state: String(address.countrySubdivisionCode || ''),
      postal_code: String(address.postalCode || ''),
      latitude: numberValue(coordinates.latitude),
      longitude: numberValue(coordinates.longitude),
      distance: numberValue(r.distance),
      is_favorite: boolValue(r.isFavorite),
      mobile_ordering_available: mobileOrdering.availability === 'READY',
      ownership_type: String(s.ownershipTypeCode || ''),
      amenities: amenities.map(function(a) { return String((a && a.name) || ''); }).filter(Boolean)
    };
  }

  function mapMenuCategory(category) {
    var c = isObject(category) ? category : {};
    var children = Array.isArray(c.children) ? c.children : [];
    return {
      id: String(c.id || ''),
      name: String(c.name || ''),
      subcategories: children.map(function(ch) {
        ch = isObject(ch) ? ch : {};
        return {
          id: String(ch.id || ''),
          name: String(ch.name || ''),
          product_count: Array.isArray(ch.products) ? ch.products.length : 0
        };
      })
    };
  }

  function mapProduct(product) {
    var p = isObject(product) ? product : {};
    return {
      product_number: numberValue(p.productNumber),
      name: String(p.name || ''),
      form: String(p.formCode || ''),
      description: String(p.description || ''),
      image_url: String(p.imageURL || ''),
      star_cost: numberValue(p.starCost),
      product_type: String(p.productType || '')
    };
  }

  function mapStreamItem(item) {
    var s = isObject(item) ? item : {};
    var content = isObject(s.content) ? s.content : {};
    var inner = isObject(content.item) ? content.item : {};
    return {
      item_id: String(s.streamItemId || ''),
      type: String(s.streamItemType || ''),
      title: String(inner.title || ''),
      body: String(inner.body || ''),
      image_url: String(inner.image || ''),
      cta_text: String(inner.calltoactiontext || ''),
      cta_link: String(inner.calltoactionlink || ''),
      start_date: String(s.startDate || ''),
      end_date: String(s.endDate || ''),
      rank: numberValue(s.rank)
    };
  }

  function mapUserProfile(data) {
    var d = isObject(data) ? data : {};
    var loyalty = isObject(d.loyaltyProgram) ? d.loyaltyProgram : {};
    var progress = isObject(loyalty.progress) ? loyalty.progress : {};
    return {
      first_name: String(d.firstName || ''),
      last_name: String(d.lastName || ''),
      email: String(d.email || ''),
      external_id: String(d.exId || ''),
      sub_market: String(d.subMarket || ''),
      birth_month: numberValue(d.birthMonth),
      birth_day: numberValue(d.birthDay),
      card_holder_since: String(loyalty.cardHolderSince || ''),
      star_balance: numberValue(progress.starBalance),
      stars_to_next_goal: numberValue(progress.starsToNextGoal),
      program_name: String(loyalty.programName || '')
    };
  }

  function mapCard(card) {
    var c = isObject(card) ? card : {};
    var balance = isObject(c.balance) ? c.balance : {};
    return {
      card_id: String(c.cardId || ''),
      card_number: String(c.cardNumber || ''),
      nickname: String(c.nickname || ''),
      balance_amount: numberValue(balance.amount),
      balance_currency: String(balance.currency || 'USD'),
      is_primary: boolValue(c.isPrimary),
      is_digital: boolValue(c.isDigital),
      card_image_url: String(c.cardImageUrl || '')
    };
  }

  function mapPaymentMethod(method) {
    var p = isObject(method) ? method : {};
    return {
      payment_type: String(p.paymentType || ''),
      payment_instrument_id: String(p.paymentInstrumentId || ''),
      nickname: String(p.nickname || ''),
      last_four: String(p.accountNumberLastFour || ''),
      card_issuer: String(p.cardIssuer || ''),
      status: String(p.instrumentStatusCode || '')
    };
  }

  function mapRewardTier(tier) {
    var r = isObject(tier) ? tier : {};
    return {
      code: String(r.code || ''),
      description: String(r.description || ''),
      stars_required: numberValue(r.totalStarsToEarn),
      available: boolValue(r.available)
    };
  }

  function mapCartItem(key, item) {
    var i = isObject(item) ? item : {};
    var product = isObject(i.product) ? i.product : {};
    var size = isObject(i.size) ? i.size : {};
    return {
      item_key: String(key || ''),
      name: String(product.name || ''),
      product_number: numberValue(product.productNumber),
      form: String(product.formCode || ''),
      size: String(i.sizeCode || size.name || ''),
      sku: String(size.sku || ''),
      quantity: numberValue(i.quantity || 1),
      image_url: String(product.imageURL || '')
    };
  }

  function mapFavoriteProduct(product) {
    var f = isObject(product) ? product : {};
    return {
      id: String(f.id || ''),
      product_number: numberValue(f.productNumber),
      name: String(f.name || ''),
      form: String(f.formCode || ''),
      size: String(f.sizeCode || '')
    };
  }

  function mapPreviousOrder(order) {
    var o = isObject(order) ? order : {};
    var basket = isObject(o.basket) ? o.basket : {};
    var items = Array.isArray(basket.items) ? basket.items : [];
    return {
      order_id: String(o.orderId || ''),
      store_name: String(o.storeName || ''),
      store_number: String(o.storeNumber || ''),
      order_date: String(o.orderDate || ''),
      total: String(o.orderTotal || ''),
      items: items.map(function(item) {
        item = isObject(item) ? item : {};
        return {
          name: String(item.name || ''),
          quantity: numberValue(item.quantity || 1)
        };
      })
    };
  }

  function readArrayResult(result, slug, key, mapper) {
    var failed = failedHttp(result, slug);
    if (failed) { return failed; }
    var data = result.data;
    if (!Array.isArray(data)) { return fallback(slug, 'starbucks-array-shape-mismatch'); }
    var out = {};
    out[key] = data.map(mapper);
    return { success: true, status: result.status, data: out };
  }

  function readMenuResult(result, slug) {
    var failed = failedHttp(result, slug);
    if (failed) { return failed; }
    var data = result.data;
    if (!isObject(data) || looksLikeError(data) || !Array.isArray(data.menus)) {
      return fallback(slug, 'starbucks-menu-shape-mismatch');
    }
    return { success: true, status: result.status, data: { categories: data.menus.map(mapMenuCategory) } };
  }

  function readProductResult(result, slug) {
    var failed = failedHttp(result, slug);
    if (failed) { return failed; }
    var data = result.data;
    if (!isObject(data) || looksLikeError(data) || !Array.isArray(data.products)) {
      return fallback(slug, 'starbucks-product-shape-mismatch');
    }
    return { success: true, status: result.status, data: { product: mapProduct(data.products[0] || {}) } };
  }

  function readFeedResult(result, slug) {
    var failed = failedHttp(result, slug);
    if (failed) { return failed; }
    var data = result.data;
    if (!isObject(data) || looksLikeError(data) || !Array.isArray(data.streamItems)) {
      return fallback(slug, 'starbucks-feed-shape-mismatch');
    }
    var paging = isObject(data.paging) ? data.paging : {};
    return {
      success: true,
      status: result.status,
      data: {
        items: data.streamItems.map(mapStreamItem),
        total: numberValue(paging.total)
      }
    };
  }

  function readFavoriteProductsResult(result, slug) {
    var failed = failedHttp(result, slug);
    if (failed) { return failed; }
    var root = result.data;
    var favorites = objectAtPath(root, ['data', 'favoriteProducts']);
    if (!Array.isArray(favorites)) { return fallback(slug, 'starbucks-favorite-products-shape-mismatch'); }
    return { success: true, status: result.status, data: { favorites: favorites.map(mapFavoriteProduct) } };
  }

  function readPreviousOrdersResult(result, slug) {
    var failed = failedHttp(result, slug);
    if (failed) { return failed; }
    var orders = objectAtPath(result.data, ['data', 'previousOrders']);
    if (!Array.isArray(orders)) { return fallback(slug, 'starbucks-previous-orders-shape-mismatch'); }
    return { success: true, status: result.status, data: { orders: orders.map(mapPreviousOrder) } };
  }

  function readTimeSlotsResult(result, slug) {
    var failed = failedHttp(result, slug);
    if (failed) { return failed; }
    var scheduling = objectAtPath(result.data, ['data', 'storeByNumber', 'scheduledOrdering']);
    if (!isObject(scheduling)) { return fallback(slug, 'starbucks-time-slots-shape-mismatch'); }
    var slots = Array.isArray(scheduling.slots) ? scheduling.slots : [];
    return {
      success: true,
      status: result.status,
      data: {
        time_slots: slots.map(function(slot) {
          slot = isObject(slot) ? slot : {};
          return {
            time: String(slot.time || ''),
            display: String(slot.display || ''),
            available: boolValue(slot.available)
          };
        }),
        mobile_order_availability: String(scheduling.mobileOrderAvailability || '')
      }
    };
  }

  function priceOrderVariables(args) {
    var items = Array.isArray(args.items) ? args.items : [];
    return {
      order: {
        cart: {
          items: items.map(function(item) {
            var childSkus = Array.isArray(item.child_skus) ? item.child_skus : [];
            return {
              quantity: item.quantity,
              commerce: { sku: item.sku },
              childItems: childSkus.map(function(sku) { return { commerce: { sku: sku } }; })
            };
          }),
          offers: []
        },
        fulfillment: {
          consumptionType: 'CONSUME_OUT_OF_STORE',
          collectionType: 'IN_STORE'
        },
        storeNumber: args.store_number,
        enableTransparentPricing: true,
        enableNextGenLoyalty: true
      }
    };
  }

  function readPriceOrderResult(result, slug) {
    var failed = failedHttp(result, slug);
    if (failed) { return failed; }
    var order = objectAtPath(result.data, ['data', 'priceOrder']);
    if (!isObject(order) || !isObject(order.summary)) {
      return fallback(slug, 'starbucks-price-order-shape-mismatch');
    }
    var cart = isObject(order.cart) ? order.cart : {};
    var items = Array.isArray(cart.items) ? cart.items : [];
    var lineItems = Array.isArray(order.summary.lineItems) ? order.summary.lineItems : [];
    var subtotal = '';
    var tax = '';
    for (var i = 0; i < lineItems.length; i++) {
      var line = lineItems[i] || {};
      if (line.key === 'subtotal') { subtotal = String(line.priceLabel || ''); }
      if (line.key === 'tax') { tax = String(line.priceLabel || ''); }
    }
    return {
      success: true,
      status: result.status,
      data: {
        items: items.map(function(item) {
          item = isObject(item) ? item : {};
          return {
            name: String(item.label || ''),
            quantity: numberValue(item.quantity || 1),
            price_label: String(item.priceLabel || ''),
            price: numberValue(item.price),
            calories: String(item.calories || ''),
            image_url: String(item.masterImageUrl || '')
          };
        }),
        subtotal: subtotal,
        tax: tax,
        total: String(order.summary.priceLabel || ''),
        order_id: String(order.orderId || ''),
        expires_in_seconds: numberValue(order.expiresIn)
      }
    };
  }

  function apiRead(slug, params, specBuilder, resultReader) {
    return {
      tier: 'T1a',
      origin: STARBUCKS_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'starbucks-execute-bound-spec-unavailable');
        }
        var res = await ctx.executeBoundSpec(specBuilder(args || {}), ctx.tabId);
        return resultReader(res, slug);
      }
    };
  }

  function sliceRead(slug, path, params, reader) {
    return {
      tier: 'T1a',
      origin: STARBUCKS_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'starbucks-execute-bound-spec-unavailable');
        }
        var res = await ctx.executeBoundSpec(buildBootstrapSpec(ctx), ctx.tabId);
        var failed = failedHttp(res, slug);
        if (failed) { return failed; }
        var state = stateFromBootstrap(res);
        var slice = objectAtPath(state, path);
        if (slice === null || slice === undefined) {
          return fallback(slug, 'starbucks-redux-slice-unavailable');
        }
        return reader(slice, res, slug);
      }
    };
  }

  function currentUserFromSlice(slice, result) {
    return { success: true, status: result.status, data: { user: mapUserProfile(slice) } };
  }

  function cardsFromSlice(slice, result, slug) {
    if (!Array.isArray(slice)) { return fallback(slug, 'starbucks-cards-shape-mismatch'); }
    return { success: true, status: result.status, data: { cards: slice.map(mapCard) } };
  }

  function paymentMethodsFromSlice(slice, result, slug) {
    var paymentInstruments = isObject(slice) && Array.isArray(slice.paymentInstruments) ? slice.paymentInstruments : null;
    if (!paymentInstruments) { return fallback(slug, 'starbucks-payment-methods-shape-mismatch'); }
    return {
      success: true,
      status: result.status,
      data: { payment_methods: paymentInstruments.map(mapPaymentMethod) }
    };
  }

  function rewardsFromSlice(slice, result, slug) {
    if (!isObject(slice)) { return fallback(slug, 'starbucks-rewards-shape-mismatch'); }
    var progress = isObject(slice.progress) ? slice.progress : {};
    var rewards = Array.isArray(slice.rewards) ? slice.rewards : [];
    return {
      success: true,
      status: result.status,
      data: {
        star_balance: numberValue(progress.starBalance),
        stars_to_next_goal: numberValue(progress.starsToNextGoal),
        card_holder_since: String(slice.cardHolderSince || ''),
        reward_tiers: rewards.map(mapRewardTier)
      }
    };
  }

  function earnRatesFromSlice(slice, result, slug) {
    if (!isObject(slice)) { return fallback(slug, 'starbucks-earn-rates-shape-mismatch'); }
    var rates = [];
    for (var key in slice) {
      if (!Object.prototype.hasOwnProperty.call(slice, key)) { continue; }
      var value = isObject(slice[key]) ? slice[key] : {};
      rates.push({
        payment_type: String(key),
        standard_earn_rate: numberValue(value.standardEarnRate),
        employee_earn_rate: numberValue(value.employeeEarnRate)
      });
    }
    return { success: true, status: result.status, data: { earn_rates: rates } };
  }

  function cartFromSlice(slice, result, slug) {
    if (!isObject(slice)) { return fallback(slug, 'starbucks-cart-shape-mismatch'); }
    var items = [];
    for (var key in slice) {
      if (Object.prototype.hasOwnProperty.call(slice, key)) {
        items.push(mapCartItem(key, slice[key]));
      }
    }
    var count = items.reduce(function(sum, item) { return sum + item.quantity; }, 0);
    return { success: true, status: result.status, data: { items: items, item_count: count } };
  }

  function navigateToCheckoutHandler() {
    return {
      tier: 'T1a',
      origin: STARBUCKS_ORIGIN,
      sideEffectClass: 'read',
      params: EMPTY_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback('starbucks.navigate_to_checkout', 'starbucks-execute-bound-spec-unavailable');
        }
        var url = STARBUCKS_ORIGIN + '/menu/cart';
        var res = await ctx.executeBoundSpec({
          url: url,
          method: 'GET',
          headers: { 'Accept': 'text/html,application/xhtml+xml' },
          body: null,
          query: {},
          authStrategy: 'same-origin-cookie',
          origin: STARBUCKS_ORIGIN,
          extract: '@'
        }, ctx.tabId);
        var failed = failedHttp(res, 'starbucks.navigate_to_checkout');
        if (failed) { return failed; }
        return {
          success: true,
          status: res.status,
          data: {
            navigated: false,
            checkout_url: url
          }
        };
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: STARBUCKS_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'starbucks.add_favorite_product': guarded('starbucks.add_favorite_product', 'write', ADD_FAVORITE_PRODUCT_PARAMS, 'unverified-starbucks-add-favorite-product-mutation'),
    'starbucks.add_product_to_cart': guarded('starbucks.add_product_to_cart', 'write', ADD_PRODUCT_TO_CART_PARAMS, 'unverified-starbucks-add-product-to-cart-mutation'),
    'starbucks.delete_favorite_product': guarded('starbucks.delete_favorite_product', 'destructive', DELETE_FAVORITE_PRODUCT_PARAMS, 'unverified-starbucks-delete-favorite-product-mutation'),
    // destructive, not write: the unfavorite leg DELETEs (the importer max-merges
    // the op's POST + DELETE method literals to the most-severe method).
    'starbucks.toggle_favorite_store': guarded('starbucks.toggle_favorite_store', 'destructive', TOGGLE_FAVORITE_STORE_PARAMS, 'unverified-starbucks-toggle-favorite-store-mutation'),
    'starbucks.update_product_quantity': guarded('starbucks.update_product_quantity', 'write', UPDATE_PRODUCT_QUANTITY_PARAMS, 'unverified-starbucks-update-product-quantity-mutation'),

    'starbucks.find_stores': apiRead('starbucks.find_stores', FIND_STORES_PARAMS, function(a) {
      return buildApiSpec('/locations', [
        ['lat', a.lat],
        ['lng', a.lng],
        ['limit', a.limit === undefined ? 10 : a.limit]
      ]);
    }, function(res, slug) { return readArrayResult(res, slug, 'stores', mapStore); }),
    'starbucks.get_store_menu': apiRead('starbucks.get_store_menu', STORE_NUMBER_PARAMS, function(a) {
      return buildApiSpec('/ordering/menu', [['storeNumber', a.store_number]]);
    }, readMenuResult),
    'starbucks.get_product': apiRead('starbucks.get_product', GET_PRODUCT_PARAMS, function(a) {
      return buildApiSpec('/ordering/' + encodeSegment(a.product_number) + '/' + encodeSegment(a.form), [
        ['storeNumber', a.store_number]
      ]);
    }, readProductResult),
    'starbucks.get_feed': apiRead('starbucks.get_feed', FEED_PARAMS, function(a) {
      return buildApiSpec('/stream-items', [
        ['limit', a.limit === undefined ? 10 : a.limit],
        ['offset', a.offset === undefined ? 0 : a.offset]
      ]);
    }, readFeedResult),
    'starbucks.get_favorite_products': apiRead('starbucks.get_favorite_products', FAVORITE_PRODUCTS_PARAMS, function(a) {
      return buildOrchestraSpec('get-favorite-products', {
        storeNumber: a.store_number,
        locale: 'en-US',
        limit: a.limit === undefined ? 10 : a.limit
      });
    }, readFavoriteProductsResult),
    'starbucks.get_previous_orders': apiRead('starbucks.get_previous_orders', PREVIOUS_ORDERS_PARAMS, function(a) {
      return buildOrchestraSpec('get-previous-orders', {
        storeNumber: a.store_number || null,
        locale: 'en-US',
        limit: a.limit === undefined ? 10 : a.limit
      });
    }, readPreviousOrdersResult),
    'starbucks.get_store_time_slots': apiRead('starbucks.get_store_time_slots', STORE_NUMBER_PARAMS, function(a) {
      return buildOrchestraSpec('get-store-time-slots', { storeNumber: a.store_number });
    }, readTimeSlotsResult),
    'starbucks.price_order': apiRead('starbucks.price_order', PRICE_ORDER_PARAMS, function(a) {
      return buildOrchestraSpec('price-order', priceOrderVariables(a));
    }, readPriceOrderResult),
    'starbucks.navigate_to_checkout': navigateToCheckoutHandler(),

    'starbucks.get_current_user': sliceRead('starbucks.get_current_user', ['user', 'accountProfile', 'data'], EMPTY_PARAMS, currentUserFromSlice),
    'starbucks.get_cards': sliceRead('starbucks.get_cards', ['svcCards', 'data'], EMPTY_PARAMS, cardsFromSlice),
    'starbucks.get_cart': sliceRead('starbucks.get_cart', ['ordering', 'cart', 'current'], EMPTY_PARAMS, cartFromSlice),
    'starbucks.get_payment_methods': sliceRead('starbucks.get_payment_methods', ['wallet', 'data'], EMPTY_PARAMS, paymentMethodsFromSlice),
    'starbucks.get_rewards': sliceRead('starbucks.get_rewards', ['rewards', 'loyaltyProfile', 'data'], EMPTY_PARAMS, rewardsFromSlice),
    'starbucks.get_earn_rates': sliceRead('starbucks.get_earn_rates', ['accrualEarnRates', 'data'], EMPTY_PARAMS, earnRatesFromSlice)
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
            service: STARBUCKS_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerStarbucks = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
