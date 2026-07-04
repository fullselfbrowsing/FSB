(function (global) {
  'use strict';

  /**
   * Domino's same-origin GraphQL READ head.
   *
   * Ports only explicit-input menu/store/deal reads over the first-party
   * /api/web-bff/graphql endpoint. Cart mutations, order placement, checkout
   * navigation, account profile, saved addresses/cards, and loyalty rows stay in
   * the discovery tail until their state carriers or mutation evidence are
   * separately reviewed.
   */

  var DOMINOS_ORIGIN = 'https://www.dominos.com';
  var DOMINOS_SERVICE = 'dominos.com';
  var GQL_URL = DOMINOS_ORIGIN + '/api/web-bff/graphql';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({});
  var SEARCH_ADDRESS_PARAMS = schema({
    address: { type: 'string', minLength: 1, description: 'Address text to autocomplete' },
    service_method: {
      type: 'string',
      enum: ['DELIVERY', 'CARRYOUT'],
      description: 'Service method: DELIVERY or CARRYOUT'
    }
  }, ['address', 'service_method']);
  var FIND_STORES_PARAMS = schema({
    place_id: { type: 'string', minLength: 1, description: 'Google Place ID from search_address results' },
    service_method: {
      type: 'string',
      enum: ['DELIVERY', 'CARRYOUT'],
      description: 'Filter by service method'
    }
  }, ['place_id']);
  var MENU_CATEGORIES_PARAMS = schema({
    store_id: { type: 'string', description: 'Store ID to get store-specific menu categories' }
  });
  var CATEGORY_PRODUCTS_PARAMS = schema({
    category_id: { type: 'string', minLength: 1, description: 'Category ID' },
    store_id: { type: 'string', description: 'Store ID for store-specific pricing and availability' }
  }, ['category_id']);
  var PRODUCT_PARAMS = schema({
    product_code: { type: 'string', minLength: 1, description: 'Product code/SKU' },
    store_id: { type: 'string', minLength: 1, description: 'Store ID for store-specific details' }
  }, ['product_code', 'store_id']);
  var DEAL_PARAMS = schema({
    deal_code: { type: 'string', minLength: 1, description: 'Deal/coupon code' },
    store_id: { type: 'string', minLength: 1, description: 'Store ID' },
    cart_id: { type: 'string', minLength: 1, description: 'Cart ID' }
  }, ['deal_code', 'store_id', 'cart_id']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function intSchema(description, min, max) {
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
      reason: reason || 'dominos-graphql-shape-mismatch',
      fellBackToDom: true
    });
  }

  function gqlSpec(operationName, query, variables) {
    return {
      url: GQL_URL,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-dpz-api': operationName
      },
      body: JSON.stringify({
        operationName: operationName,
        variables: variables || {},
        query: query
      }),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: DOMINOS_ORIGIN,
      extract: '@'
    };
  }

  function graphqlData(result, slug) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 500)) {
      return fallback(slug, 'dominos-logged-out-or-http-error');
    }
    var body = result.data;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fallback(slug, 'dominos-graphql-shape-mismatch');
    }
    if (Array.isArray(body.errors) && body.errors.length) {
      return fallback(slug, 'dominos-graphql-errors');
    }
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      return fallback(slug, 'dominos-graphql-data-missing');
    }
    return body.data;
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

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function mapSuggestion(raw) {
    var s = raw || {};
    return {
      place_id: str(s.placeId),
      main_text: str(s.mainText),
      secondary_text: str(s.secondaryText)
    };
  }

  function mapCustomerLocation(raw) {
    var l = raw || {};
    return {
      street_address: str(l.streetAddress),
      zip_code: str(l.zipCode),
      city: str(l.city),
      state: str(l.state)
    };
  }

  function mapStore(raw) {
    var s = raw || {};
    return {
      id: str(s.id),
      store_name: str(s.storeName || s.address),
      street: str(s.street),
      city: str(s.city),
      region: str(s.region),
      postal_code: str(s.postalCode),
      phone: str(s.phone),
      latitude: num(s.latitude),
      longitude: num(s.longitude),
      eta_minutes: str(s.etaMinutes),
      estimated_wait_minutes: str(s.estimatedWaitMinutes),
      distance: str(s.distance),
      is_open: bool(s.isOpen),
      open_label: str(s.openLabel),
      allows_delivery: bool(s.allowDeliveryOrders),
      allows_carside: bool(s.allowCarsideDelivery)
    };
  }

  function mapCategory(raw) {
    var c = raw || {};
    return {
      id: str(c.id),
      name: str(c.name),
      image: str(c.image),
      is_new: bool(c.isNew)
    };
  }

  function mapProduct(raw) {
    var p = raw || {};
    return {
      id: str(p.id),
      code: str(p.code),
      name: str(p.name),
      description: str(p.description),
      product_type: str(p.productType),
      price: num(p.price),
      size: str(p.size),
      image: str(p.image),
      is_popular: bool(p.isPopular),
      max_quantity: num(p.maxQuantity),
      is_build_your_own: bool(p.isBuildYourOwn)
    };
  }

  function mapProductBuilder(raw) {
    var p = raw || {};
    return {
      name: str(p.name),
      description: str(p.description),
      product_type: str(p.productType),
      min_quantity: num(p.minQuantity),
      max_quantity: num(p.maxQuantity),
      selected_size: str(p.selectedSize),
      size_label: str(p.sizeLabel)
    };
  }

  function mapDeal(raw) {
    var d = raw || {};
    return {
      code: str(d.code),
      name: str(d.name),
      description: str(d.description),
      image: str(d.image),
      visual_description: str(d.visualDescription)
    };
  }

  async function callGraphql(slug, operationName, query, variables, ctx, parser) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'dominos-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(gqlSpec(operationName, query, variables), ctx.tabId);
    var data = graphqlData(res, slug);
    if (!data || data.success === false) { return data; }
    var parsed = parser(data);
    if (!parsed) { return fallback(slug, 'dominos-graphql-shape-mismatch'); }
    return { success: true, data: parsed };
  }

  function readHandler(slug, operationName, query, variableFn, params, parser) {
    return {
      tier: 'T1a',
      origin: DOMINOS_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        return callGraphql(slug, operationName, query, variableFn ? variableFn(a) : {}, ctx, parser);
      }
    };
  }

  var handlers = {
    'dominos.search_address': readHandler(
      'dominos.search_address',
      'PlaceIdByAddress',
      'query PlaceIdByAddress($address: String!, $serviceMethod: ServiceMethod!) { getPlaceIdByAddress(address: $address, serviceMethod: $serviceMethod) { suggestions { placeId mainText secondaryText } } }',
      function (a) { return { address: a.address, serviceMethod: a.service_method }; },
      SEARCH_ADDRESS_PARAMS,
      function (data) {
        var payload = data.getPlaceIdByAddress;
        if (!payload || !Array.isArray(payload.suggestions)) { return null; }
        return { suggestions: payload.suggestions.map(mapSuggestion) };
      }
    ),
    'dominos.find_stores_by_address': readHandler(
      'dominos.find_stores_by_address',
      'StoresByPlaceId',
      'query StoresByPlaceId($placeId: String, $serviceMethod: ServiceMethod) { storesByPlaceId(placeId: $placeId, serviceMethod: $serviceMethod) { customerLocation { streetAddress zipCode city state } stores { id storeName etaMinutes latitude longitude estimatedWaitMinutes address postalCode region street city distance isOpen openLabel allowCarsideDelivery allowDeliveryOrders phone } } }',
      function (a) { return { placeId: a.place_id, serviceMethod: a.service_method }; },
      FIND_STORES_PARAMS,
      function (data) {
        var payload = data.storesByPlaceId;
        if (!payload || !Array.isArray(payload.stores)) { return null; }
        return {
          stores: payload.stores.map(mapStore),
          customer_location: mapCustomerLocation(payload.customerLocation)
        };
      }
    ),
    'dominos.get_menu_categories': readHandler(
      'dominos.get_menu_categories',
      'CategoryV2',
      'query CategoryV2($storeId: String) { categoriesV2(storeId: $storeId) { id image isNew name } }',
      function (a) { return { storeId: a.store_id }; },
      MENU_CATEGORIES_PARAMS,
      function (data) {
        if (!Array.isArray(data.categoriesV2)) { return null; }
        return { categories: data.categoriesV2.map(mapCategory) };
      }
    ),
    'dominos.get_category_products': readHandler(
      'dominos.get_category_products',
      'Products',
      'query Products($categoryId: String!, $storeId: String) { category(categoryId: $categoryId, storeId: $storeId) { name products { description productType code price size id image isPopular name maxQuantity isBuildYourOwn } } }',
      function (a) { return { categoryId: a.category_id, storeId: a.store_id }; },
      CATEGORY_PRODUCTS_PARAMS,
      function (data) {
        var category = data.category;
        if (!category || !Array.isArray(category.products)) { return null; }
        return {
          category_name: str(category.name),
          products: category.products.map(mapProduct)
        };
      }
    ),
    'dominos.get_product': readHandler(
      'dominos.get_product',
      'Product',
      'query Product($input: ProductBuilderInput!) { product(input: $input) { description name productType minQuantity maxQuantity selectedSize sizeLabel } }',
      function (a) { return { input: { productCode: a.product_code, storeId: a.store_id } }; },
      PRODUCT_PARAMS,
      function (data) {
        if (!data.product || typeof data.product !== 'object') { return null; }
        return mapProductBuilder(data.product);
      }
    ),
    'dominos.get_deal': readHandler(
      'dominos.get_deal',
      'Deal',
      'query Deal($dealCode: String!, $storeId: String!, $cartId: String!) { deal(dealCode: $dealCode, storeId: $storeId, cartId: $cartId) { code name description image visualDescription } }',
      function (a) { return { dealCode: a.deal_code, storeId: a.store_id, cartId: a.cart_id }; },
      DEAL_PARAMS,
      function (data) {
        if (!data.deal || typeof data.deal !== 'object') { return null; }
        return { deal: mapDeal(data.deal) };
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
            service: DOMINOS_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerDominos = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
