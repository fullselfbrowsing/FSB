(function (global) {
  'use strict';

  /**
   * Costco public ecom READ head.
   *
   * Ports only public, parameter-driven product and inventory reads over Costco's
   * front-end ecom APIs. Account, lists, cart, checkout, navigation,
   * rendered-search-page, geocode, write, and destructive rows stay in the
   * discovery tail until separately reviewed.
   */

  var COSTCO_ORIGIN = 'https://www.costco.com';
  var COSTCO_SERVICE = 'costco.com';
  var PRODUCT_CLIENT_ID = '4900eb1f-0c10-4bd9-99c3-c59e6c1ecebf';
  var INVENTORY_CLIENT_ID = '481b1aec-aa3b-454b-b81b-48187e28f205';
  var PRODUCT_API = 'https://ecom-api.costco.com/ebusiness/product/v1/products/graphql';
  var INVENTORY_API = 'https://ecom-api.costco.com/ebusiness/inventory/v1/inventorylevels/availability/batch';
  var INT_LIMIT = 9007199254740991;

  var PRODUCT_PARAMS = schema({
    item_number: { type: 'string', minLength: 1, description: 'Costco item number' },
    warehouse_number: {
      type: 'string',
      description: 'Warehouse number for pricing (defaults to nearest warehouse)'
    }
  }, ['item_number']);
  var PRODUCTS_PARAMS = schema({
    item_numbers: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 25,
      description: 'Array of Costco item numbers (max 25)'
    },
    warehouse_number: {
      type: 'string',
      description: 'Warehouse number for pricing (defaults to nearest warehouse)'
    }
  }, ['item_numbers']);
  var AVAILABILITY_PARAMS = schema({
    item_numbers: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 30,
      description: 'Array of item numbers to check (max 30)'
    }
  }, ['item_numbers']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
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
      reason: reason || 'costco-public-ecom-shape-mismatch',
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
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function stripHtml(value) {
    return str(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function cleanPrice(value) {
    var raw = str(value);
    if (!raw || raw === '0' || raw === '0.00000' || raw === '-1' || raw === '-1.00000') {
      return raw && raw.charAt(0) === '-' ? '' : '0';
    }
    var n = Number(raw);
    return Number.isFinite(n) ? n.toFixed(2) : raw;
  }

  function digitString(value) {
    var out = str(value).trim();
    return /^[0-9]+$/.test(out) ? out : '';
  }

  function normalizeItemNumbers(value, max) {
    var raw = list(value).slice(0, max);
    var out = [];
    var seen = {};
    for (var i = 0; i < raw.length; i++) {
      var item = digitString(raw[i]);
      if (!item || seen[item]) { continue; }
      seen[item] = true;
      out.push(item);
    }
    return out;
  }

  function warehouseNumber(value) {
    return digitString(value) || '847';
  }

  function productQuery(itemNumbers, warehouse) {
    var items = itemNumbers.map(function (n) { return '"' + n + '"'; }).join(',');
    return 'query {\n' +
      '  products(\n' +
      '    itemNumbers: [' + items + '],\n' +
      '    clientId: "' + PRODUCT_CLIENT_ID + '",\n' +
      '    locale: "en-us",\n' +
      '    warehouseNumber: "' + warehouse + '"\n' +
      '  ) {\n' +
      '    catalogData {\n' +
      '      itemNumber itemId published locale buyable programTypes\n' +
      '      priceData { price listPrice }\n' +
      '      attributes { key value type pills identifier }\n' +
      '      description { shortDescription longDescription marketingStatement promotionalStatement auxDescription2 }\n' +
      '      additionalFieldData {\n' +
      '        rating numberOfRating dispPriceInCartOnly eligibleForReviews\n' +
      '        fsa membershipReqd productClassType maxItemOrderQty minItemOrderQty\n' +
      '      }\n' +
      '      fieldData { mfPartNumber mfName imageName startDate endDate }\n' +
      '    }\n' +
      '    fulfillmentData {\n' +
      '      itemNumber warehouseNumber channel currency price listPrice\n' +
      '      discounts { promoAmount promoType promoStartDate promoEndDate maximumCount }\n' +
      '      shippingInfo { fulfillmentMethods externalCarrier }\n' +
      '    }\n' +
      '  }\n' +
      '}';
  }

  function productSpec(itemNumbers, warehouse) {
    return {
      url: PRODUCT_API,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'client-identifier': PRODUCT_CLIENT_ID,
        'costco.env': 'ecom',
        'costco.service': 'restProduct'
      },
      body: JSON.stringify({ query: productQuery(itemNumbers, warehouse), variables: {} }),
      query: {},
      authStrategy: 'none',
      credentials: 'omit',
      origin: COSTCO_ORIGIN,
      extract: '@'
    };
  }

  function inventorySpec(itemNumbers) {
    return {
      url: INVENTORY_API,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'client-identifier': INVENTORY_CLIENT_ID,
        'costco.env': 'PROD',
        'costco.service': 'restInventory'
      },
      body: JSON.stringify({
        distributionCenters: [],
        itemNumbers: itemNumbers,
        selectedWarehouse: '847-wh'
      }),
      query: {},
      authStrategy: 'none',
      credentials: 'omit',
      origin: COSTCO_ORIGIN,
      extract: '@'
    };
  }

  function responseData(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'costco-public-ecom-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'costco-public-ecom-http-error');
    }
    if (result.data === undefined || result.data === null) {
      return fallback(slug, 'costco-public-ecom-empty');
    }
    return result.data;
  }

  function productData(result, slug) {
    var data = responseData(result, slug);
    if (!data || data.success === false) { return data; }
    if (!isObject(data) || (Array.isArray(data.errors) && data.errors.length)) {
      return fallback(slug, 'costco-product-graphql-errors');
    }
    var products = data.data && data.data.products;
    if (!isObject(products) || !Array.isArray(products.catalogData)) {
      return fallback(slug, 'costco-product-shape-mismatch');
    }
    return products;
  }

  function inventoryData(result, slug) {
    var data = responseData(result, slug);
    if (!data || data.success === false) { return data; }
    if (!Array.isArray(data)) {
      return fallback(slug, 'costco-inventory-shape-mismatch');
    }
    return data;
  }

  function attributeValue(raw, key) {
    var attrs = list(raw && raw.attributes);
    for (var i = 0; i < attrs.length; i++) {
      if (attrs[i] && attrs[i].key === key) { return str(attrs[i].value); }
    }
    return '';
  }

  function imageUrl(raw) {
    var imageName = str(raw && raw.fieldData && raw.fieldData.imageName);
    if (!imageName) { return ''; }
    if (imageName.indexOf('http://') === 0 || imageName.indexOf('https://') === 0) {
      return imageName;
    }
    return 'https://bfasset.costco-static.com/U447IH35/as/' + imageName + '?auto=webp&format=jpg';
  }

  function mapProduct(catalog, fulfillment) {
    var c = catalog || {};
    var f = fulfillment || {};
    var additional = c.additionalFieldData || {};
    var description = c.description || {};
    return {
      item_number: str(c.itemNumber),
      name: stripHtml(description.shortDescription),
      brand: attributeValue(c, 'Brand') || str(c.fieldData && c.fieldData.mfName),
      price: cleanPrice(f.price !== undefined ? f.price : c.priceData && c.priceData.price),
      list_price: cleanPrice(f.listPrice !== undefined ? f.listPrice : c.priceData && c.priceData.listPrice),
      rating: str(additional.rating || '0'),
      review_count: num(additional.numberOfRating),
      image_url: imageUrl(c),
      buyable: c.buyable === 1 || c.buyable === true,
      in_stock: true,
      program_types: str(c.programTypes),
      membership_required: additional.membershipReqd === 1 || additional.membershipReqd === true,
      marketing_statement: str(description.marketingStatement),
      promotional_statement: stripHtml(description.promotionalStatement),
      features: stripHtml(description.auxDescription2),
      max_order_qty: num(additional.maxItemOrderQty) || INT_LIMIT
    };
  }

  function productsByItemNumber(products) {
    var fulfillment = list(products.fulfillmentData);
    var byItem = {};
    for (var i = 0; i < fulfillment.length; i++) {
      var key = str(fulfillment[i] && fulfillment[i].itemNumber);
      if (key) { byItem[key] = fulfillment[i]; }
    }
    return list(products.catalogData).map(function (catalog) {
      return mapProduct(catalog, byItem[str(catalog && catalog.itemNumber)]);
    }).filter(function (product) {
      return !!product.item_number && !!product.name;
    });
  }

  function mapInventory(raw) {
    var item = raw || {};
    var pt = item.programTypes || {};
    var online = pt.siteControlledInventory || {};
    var warehouse = pt.inWarehouse || {};
    var pickup = pt.useWarehouseInventory || {};
    var thirdParty = pt['3rdPartyDelivery'] || {};
    return {
      item_number: str(item.itemNumber),
      online_available: online.availability === 'INSTOCK' || online.availability === 'LOWSTOCK',
      online_status: str(online.availability || 'UNKNOWN'),
      in_warehouse: warehouse.availability === 'INSTOCK' || warehouse.availability === 'LOWSTOCK',
      warehouse_status: str(warehouse.availability || 'UNKNOWN'),
      pickup_available: bool(pickup.buyable),
      pickup_order_cutoff: str(pickup.orderCutOff),
      pickup_date: str(pickup.orderPickup),
      max_pickup_units: num(pickup.maxUnitsAvailable),
      third_party_delivery: thirdParty.availability === 'INSTOCK' || thirdParty.availability === 'LOWSTOCK'
    };
  }

  async function callProductApi(slug, itemNumbers, warehouse, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'costco-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(productSpec(itemNumbers, warehouse), ctx.tabId);
    var products = productData(res, slug);
    if (!products || products.success === false) { return products; }
    var mapped = productsByItemNumber(products);
    if (!mapped.length) { return fallback(slug, 'costco-product-shape-mismatch'); }
    return mapped;
  }

  async function callInventoryApi(slug, itemNumbers, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'costco-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(inventorySpec(itemNumbers), ctx.tabId);
    var items = inventoryData(res, slug);
    if (!items || items.success === false) { return items; }
    var mapped = items.map(mapInventory).filter(function (item) { return !!item.item_number; });
    if (!mapped.length) { return fallback(slug, 'costco-inventory-shape-mismatch'); }
    return mapped;
  }

  function readHandler(slug, params, handle) {
    return {
      tier: 'T1a',
      origin: COSTCO_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return handle(args || {}, ctx);
      }
    };
  }

  var handlers = {
    'costco.get_product': readHandler(
      'costco.get_product',
      PRODUCT_PARAMS,
      async function (args, ctx) {
        var itemNumber = digitString(args.item_number);
        if (!itemNumber) { return fallback('costco.get_product', 'costco-invalid-item-number'); }
        var products = await callProductApi('costco.get_product', [itemNumber], warehouseNumber(args.warehouse_number), ctx);
        if (!products || products.success === false) { return products; }
        for (var i = 0; i < products.length; i++) {
          if (products[i].item_number === itemNumber) {
            return { success: true, data: { product: products[i] } };
          }
        }
        return fallback('costco.get_product', 'costco-product-not-found');
      }
    ),
    'costco.get_products': readHandler(
      'costco.get_products',
      PRODUCTS_PARAMS,
      async function (args, ctx) {
        var itemNumbers = normalizeItemNumbers(args.item_numbers, 25);
        if (!itemNumbers.length) { return fallback('costco.get_products', 'costco-invalid-item-numbers'); }
        var products = await callProductApi('costco.get_products', itemNumbers, warehouseNumber(args.warehouse_number), ctx);
        if (!products || products.success === false) { return products; }
        return { success: true, data: { products: products } };
      }
    ),
    'costco.get_product_availability': readHandler(
      'costco.get_product_availability',
      AVAILABILITY_PARAMS,
      async function (args, ctx) {
        var itemNumbers = normalizeItemNumbers(args.item_numbers, 30);
        if (!itemNumbers.length) {
          return fallback('costco.get_product_availability', 'costco-invalid-item-numbers');
        }
        var items = await callInventoryApi('costco.get_product_availability', itemNumbers, ctx);
        if (!items || items.success === false) { return items; }
        return { success: true, data: { items: items } };
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
            service: COSTCO_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerCostco = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
