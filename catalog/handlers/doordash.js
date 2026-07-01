(function (global) {
  'use strict';

  /**
   * DoorDash same-origin GraphQL READ head.
   *
   * Ports only authenticated account, address, order, payment-method, and
   * notification reads over www.doordash.com/graphql. Favorite/profile/default
   * address and notification mutations stay in the discovery tail until their
   * mutation evidence is reviewed separately.
   */

  var DOORDASH_ORIGIN = 'https://www.doordash.com';
  var DOORDASH_SERVICE = 'doordash.com';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({});
  var LIST_ORDERS_PARAMS = schema({
    offset: integerSchema('Pagination offset (default 0)', 0),
    limit: integerSchema('Number of orders to return (default 10, max 50)', 1, 50),
    include_cancelled: { type: 'boolean', description: 'Include cancelled orders (default true)' }
  });
  var ORDER_ID_PARAMS = schema({
    order_id: { type: 'string', minLength: 1, description: 'Order ID to look up' }
  }, ['order_id']);

  var QUERIES = {
    consumer: 'query consumer { consumer { id userId firstName lastName email phoneNumber timezone defaultCountry isGuest localizedNames { informalName formalName } phoneNumberComponents { formattedNationalNumber countryCode countryShortname } defaultAddress { id addressId street city state zipCode lat lng printableAddress shortname } } }',
    addresses: 'query getAvailableAddresses { getAvailableAddresses { id addressId street city subpremise state zipCode country countryCode lat lng districtId manualLat manualLng timezone shortname printableAddress driverInstructions } }',
    orders: 'query getConsumerOrdersWithDetails($offset: Int!, $limit: Int!, $includeCancelled: Boolean) { getConsumerOrdersWithDetails(offset: $offset, limit: $limit, includeCancelled: $includeCancelled) { id orderUuid deliveryUuid createdAt submittedAt cancelledAt fulfilledAt specialInstructions isGroup isGift isPickup isRetail fulfillmentType isReorderable creator { id firstName lastName } deliveryAddress { id formattedAddress } store { id name business { id name } phoneNumber } orders { id creator { id firstName lastName } items { id name quantity specialInstructions originalItemPrice purchaseQuantity { discreteQuantity { quantity unit } } } } paymentCard { id last4 type } grandTotal { unitAmount currency displayString } } }',
    paymentMethods: 'query getPaymentMethodList { getPaymentMethodList { id isDefault type last4 expYear expMonth metadata { isDashCard isHsaFsaCard paypalAccount } } }',
    notifications: 'query getHasNewNotifications { getHasNewNotifications { hasNewNotifications numUnreadNotifications } }'
  };

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
      reason: reason || 'doordash-graphql-shape-mismatch',
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

  function nullableStr(value) {
    return value === undefined || value === null ? null : String(value);
  }

  function boundedInt(value, fallbackValue, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) { n = fallbackValue; }
    n = Math.floor(n);
    if (min !== undefined && n < min) { n = min; }
    if (max !== undefined && n > max) { n = max; }
    return n;
  }

  function gqlSpec(operationName, query, variables) {
    return {
      url: DOORDASH_ORIGIN + '/graphql/' + encodeURIComponent(operationName),
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-channel-id': 'marketplace',
        'x-experience-id': 'doordash'
      },
      body: JSON.stringify({
        operationName: operationName,
        variables: variables || {},
        query: query
      }),
      query: {},
      authStrategy: 'same-origin-cookie',
      csrfSource: { from: 'cookie', selector: 'csrf_token', header: 'x-csrftoken' },
      origin: DOORDASH_ORIGIN,
      extract: '@'
    };
  }

  function graphqlData(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'doordash-graphql-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'doordash-logged-out-or-http-error');
    }
    var body = result.data;
    if (!isObject(body)) {
      return fallback(slug, 'doordash-graphql-shape-mismatch');
    }
    if (Array.isArray(body.errors) && body.errors.length) {
      return fallback(slug, 'doordash-graphql-errors');
    }
    if (!isObject(body.data)) {
      return fallback(slug, 'doordash-graphql-data-missing');
    }
    return body.data;
  }

  function mapAddress(a) {
    a = a || {};
    return {
      id: str(a.id),
      address_id: str(a.addressId),
      street: str(a.street),
      city: str(a.city),
      subpremise: str(a.subpremise),
      state: str(a.state),
      zip_code: str(a.zipCode),
      country: str(a.country),
      lat: num(a.lat),
      lng: num(a.lng),
      timezone: str(a.timezone),
      shortname: str(a.shortname),
      printable_address: str(a.printableAddress),
      driver_instructions: nullableStr(a.driverInstructions)
    };
  }

  function mapConsumer(c) {
    c = c || {};
    return {
      id: str(c.id),
      user_id: str(c.userId),
      first_name: str(c.firstName),
      last_name: str(c.lastName),
      email: str(c.email),
      phone_number: str(c.phoneNumber),
      timezone: str(c.timezone),
      default_country: str(c.defaultCountry),
      is_guest: bool(c.isGuest),
      default_address: c.defaultAddress ? {
        id: str(c.defaultAddress.id),
        street: str(c.defaultAddress.street),
        city: str(c.defaultAddress.city),
        state: str(c.defaultAddress.state),
        zip_code: str(c.defaultAddress.zipCode),
        printable_address: str(c.defaultAddress.printableAddress)
      } : null
    };
  }

  function mapOrderItem(item) {
    item = item || {};
    return {
      id: str(item.id),
      name: str(item.name),
      quantity: num(item.quantity),
      original_item_price: num(item.originalItemPrice)
    };
  }

  function mapOrder(o) {
    o = o || {};
    var items = [];
    var suborders = list(o.orders);
    for (var i = 0; i < suborders.length; i++) {
      var subItems = list(suborders[i] && suborders[i].items);
      for (var j = 0; j < subItems.length; j++) {
        items.push(mapOrderItem(subItems[j]));
      }
    }
    var store = o.store || {};
    var creator = o.creator || {};
    var deliveryAddress = o.deliveryAddress || {};
    var paymentCard = o.paymentCard || {};
    var grandTotal = o.grandTotal || {};
    return {
      id: str(o.id),
      order_uuid: str(o.orderUuid),
      delivery_uuid: str(o.deliveryUuid),
      created_at: str(o.createdAt),
      submitted_at: str(o.submittedAt),
      cancelled_at: nullableStr(o.cancelledAt),
      fulfilled_at: nullableStr(o.fulfilledAt),
      is_group: bool(o.isGroup),
      is_gift: bool(o.isGift),
      is_pickup: bool(o.isPickup),
      is_retail: bool(o.isRetail),
      is_reorderable: bool(o.isReorderable),
      fulfillment_type: str(o.fulfillmentType),
      store_name: str(store.name),
      store_id: str(store.id),
      creator_name: [creator.firstName, creator.lastName].filter(Boolean).join(' '),
      delivery_address_id: str(deliveryAddress.id),
      items: items,
      payment_card_type: str(paymentCard.type),
      payment_card_last4: str(paymentCard.last4),
      grand_total_display: str(grandTotal.displayString),
      grand_total_cents: num(grandTotal.unitAmount)
    };
  }

  function mapPaymentMethod(p) {
    p = p || {};
    var meta = p.metadata || {};
    return {
      id: str(p.id),
      is_default: bool(p.isDefault),
      type: str(p.type),
      last4: str(p.last4),
      exp_year: str(p.expYear),
      exp_month: str(p.expMonth),
      is_dash_card: bool(meta.isDashCard),
      is_hsa_fsa_card: bool(meta.isHsaFsaCard)
    };
  }

  function mapNotificationStatus(n) {
    n = n || {};
    return {
      has_new_notifications: bool(n.hasNewNotifications),
      num_unread_notifications: num(n.numUnreadNotifications)
    };
  }

  async function callGraphql(slug, operationName, query, variables, ctx, parser) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'doordash-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(gqlSpec(operationName, query, variables), ctx.tabId);
    var data = graphqlData(res, slug);
    if (!data || data.success === false) { return data; }
    var parsed = parser(data);
    if (!parsed) { return fallback(slug, 'doordash-graphql-shape-mismatch'); }
    return { success: true, data: parsed };
  }

  function readHandler(slug, params, operationName, query, variablesForArgs, parser) {
    return {
      tier: 'T1a',
      origin: DOORDASH_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        var variables = typeof variablesForArgs === 'function' ? variablesForArgs(args || {}) : {};
        return callGraphql(slug, operationName, query, variables, ctx, parser);
      }
    };
  }

  function orderVars(args) {
    return {
      offset: boundedInt(args.offset, 0, 0, INT_LIMIT),
      limit: boundedInt(args.limit, 10, 1, 50),
      includeCancelled: args.include_cancelled === undefined ? true : args.include_cancelled === true
    };
  }

  async function getOrder(args, ctx) {
    var slug = 'doordash.get_order';
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'doordash-execute-bound-spec-unavailable');
    }
    var target = str(args && args.order_id);
    if (!target) { return fallback(slug, 'doordash-required-input-missing'); }
    var offset = 0;
    var batchSize = 20;
    var maxSearchDepth = 100;
    while (offset < maxSearchDepth) {
      var res = await ctx.executeBoundSpec(gqlSpec('getConsumerOrdersWithDetails', QUERIES.orders, {
        offset: offset,
        limit: batchSize,
        includeCancelled: true
      }), ctx.tabId);
      var data = graphqlData(res, slug);
      if (!data || data.success === false) { return data; }
      var orders = data.getConsumerOrdersWithDetails;
      if (!Array.isArray(orders)) { return fallback(slug, 'doordash-graphql-shape-mismatch'); }
      if (orders.length === 0) { break; }
      for (var i = 0; i < orders.length; i++) {
        var o = orders[i] || {};
        if (str(o.id) === target || str(o.orderUuid) === target) {
          return { success: true, data: { order: mapOrder(o) } };
        }
      }
      offset += batchSize;
    }
    return fallback(slug, 'doordash-order-not-found');
  }

  var handlers = {
    'doordash.get_current_user': readHandler(
      'doordash.get_current_user',
      EMPTY_PARAMS,
      'consumer',
      QUERIES.consumer,
      null,
      function (data) {
        if (!isObject(data.consumer)) { return null; }
        return { consumer: mapConsumer(data.consumer) };
      }
    ),
    'doordash.list_addresses': readHandler(
      'doordash.list_addresses',
      EMPTY_PARAMS,
      'getAvailableAddresses',
      QUERIES.addresses,
      null,
      function (data) {
        if (!Array.isArray(data.getAvailableAddresses)) { return null; }
        return { addresses: data.getAvailableAddresses.map(mapAddress) };
      }
    ),
    'doordash.list_orders': readHandler(
      'doordash.list_orders',
      LIST_ORDERS_PARAMS,
      'getConsumerOrdersWithDetails',
      QUERIES.orders,
      orderVars,
      function (data) {
        if (!Array.isArray(data.getConsumerOrdersWithDetails)) { return null; }
        return { orders: data.getConsumerOrdersWithDetails.map(mapOrder) };
      }
    ),
    'doordash.get_order': {
      tier: 'T1a',
      origin: DOORDASH_ORIGIN,
      sideEffectClass: 'read',
      params: ORDER_ID_PARAMS,
      async handle(args, ctx) {
        return getOrder(args || {}, ctx);
      }
    },
    'doordash.list_payment_methods': readHandler(
      'doordash.list_payment_methods',
      EMPTY_PARAMS,
      'getPaymentMethodList',
      QUERIES.paymentMethods,
      null,
      function (data) {
        if (!Array.isArray(data.getPaymentMethodList)) { return null; }
        return { payment_methods: data.getPaymentMethodList.map(mapPaymentMethod) };
      }
    ),
    'doordash.get_notifications': readHandler(
      'doordash.get_notifications',
      EMPTY_PARAMS,
      'getHasNewNotifications',
      QUERIES.notifications,
      null,
      function (data) {
        if (!isObject(data.getHasNewNotifications)) { return null; }
        return { status: mapNotificationStatus(data.getHasNewNotifications) };
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
            service: DOORDASH_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerDoordash = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
