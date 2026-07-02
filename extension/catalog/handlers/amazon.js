(function (global) {
  'use strict';

  /**
   * Amazon same-origin T1 head.
   *
   * Public product search/detail reads execute against www.amazon.com pages.
   * Account order reads require the signed-in same-origin page body and fail
   * closed on auth, robot-check, or unknown body shapes. Purchase/cancel writes
   * stay inert pending live mutation-body UAT.
   */

  var AMAZON_ORIGIN = 'https://www.amazon.com';
  var AMAZON_SERVICE = 'www.amazon.com';
  var INT_LIMIT = 9007199254740991;

  var SORT_MAP = {
    relevance: '',
    price_low_to_high: 'price-asc-rank',
    price_high_to_low: 'price-desc-rank',
    rating: 'review-rank'
  };

  var SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search keywords' },
    category: { type: 'string', description: 'Amazon department/category alias' },
    sort: {
      type: 'string',
      enum: ['relevance', 'price_low_to_high', 'price_high_to_low', 'rating'],
      description: 'Result ordering'
    },
    limit: integerSchema('Maximum number of products to return', 1, 50)
  }, ['query']);

  var PRODUCT_PARAMS = schema({
    product_id: { type: 'string', minLength: 1, description: 'Amazon ASIN/product ID' }
  }, ['product_id']);

  var ORDER_LIST_PARAMS = schema({
    status: {
      type: 'string',
      enum: ['open', 'shipped', 'delivered', 'cancelled'],
      description: 'Filter orders by status'
    },
    limit: integerSchema('Maximum number of orders to return', 1, 50)
  }, []);

  var ORDER_PARAMS = schema({
    order_id: { type: 'string', minLength: 1, description: 'Amazon order ID' }
  }, ['order_id']);

  var PLACE_ORDER_PARAMS = schema({
    items: {
      minItems: 1,
      type: 'array',
      items: schema({
        product_id: { type: 'string', description: 'Product ASIN/ID' },
        quantity: integerSchema('Quantity of this item', 1, INT_LIMIT)
      }, ['product_id', 'quantity']),
      description: 'The cart items to order'
    },
    shipping_address: { type: 'string', minLength: 1, description: 'The address to ship to' },
    payment_method_id: { type: 'string', description: 'Optional saved payment method ID to charge' }
  }, ['items', 'shipping_address']);

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
      reason: reason || 'amazon-page-shape-mismatch',
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

  function htmlSpec(path, pairs) {
    return {
      url: AMAZON_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: AMAZON_ORIGIN,
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
    var n = Number(str(value).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function decodeEntities(value) {
    return str(value)
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function textOnly(value) {
    return decodeEntities(str(value)
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }

  function attrValue(block, name) {
    var re = new RegExp(name + "=[\"']([^\"']*)[\"']", 'i');
    var m = re.exec(str(block));
    return m ? decodeEntities(m[1]) : '';
  }

  function firstMatch(text, patterns) {
    var raw = str(text);
    for (var i = 0; i < patterns.length; i++) {
      var m = patterns[i].exec(raw);
      if (m && m[1] !== undefined) { return m[1]; }
    }
    return '';
  }

  function normalizeAmazonUrl(value) {
    var raw = decodeEntities(value).trim();
    if (!raw) { return ''; }
    if (raw.indexOf('https://') === 0 || raw.indexOf('http://') === 0) { return raw; }
    if (raw.charAt(0) === '/') { return AMAZON_ORIGIN + raw; }
    return '';
  }

  function cleanAsin(value) {
    var out = str(value).trim();
    return /^[A-Z0-9]{8,16}$/i.test(out) ? out.toUpperCase() : '';
  }

  function cleanOrderId(value) {
    var out = str(value).trim();
    return /^\d{3}-\d{7}-\d{7}$/.test(out) ? out : '';
  }

  function parseJsonText(text) {
    var s = decodeEntities(text).trim();
    if (!s || (s.charAt(0) !== '{' && s.charAt(0) !== '[')) { return null; }
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function jsonLdCandidates(payload) {
    var out = [];
    var raw = str(payload);
    var re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    var match;
    while ((match = re.exec(raw))) {
      var parsed = parseJsonText(match[1]);
      if (parsed) { out.push(parsed); }
    }
    return out;
  }

  function walkJson(value, visitor, depth) {
    if (depth > 12 || value === null || value === undefined) { return; }
    visitor(value);
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) { walkJson(value[i], visitor, depth + 1); }
    } else if (isObject(value)) {
      for (var k in value) {
        if (Object.prototype.hasOwnProperty.call(value, k)) { walkJson(value[k], visitor, depth + 1); }
      }
    }
  }

  function firstProductJsonLd(payload) {
    var candidates = jsonLdCandidates(payload);
    var found = null;
    for (var i = 0; i < candidates.length && !found; i++) {
      walkJson(candidates[i], function (value) {
        if (found || !isObject(value)) { return; }
        var type = value['@type'];
        var types = Array.isArray(type) ? type : [type];
        for (var j = 0; j < types.length; j++) {
          if (String(types[j]).toLowerCase() === 'product') {
            found = value;
            return;
          }
        }
      }, 0);
    }
    return found;
  }

  function robotCheck(payload) {
    var lower = str(payload).toLowerCase();
    return lower.indexOf('robot check') !== -1 ||
      lower.indexOf('/errors/validatecaptcha') !== -1 ||
      lower.indexOf('enter the characters you see below') !== -1;
  }

  function authRequired(payload) {
    var lower = str(payload).toLowerCase();
    return lower.indexOf('/ap/signin') !== -1 ||
      lower.indexOf('authportal') !== -1 ||
      lower.indexOf('sign in to view') !== -1 ||
      lower.indexOf('signin-container') !== -1;
  }

  function responseText(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'amazon-request-failed');
    }
    if (typeof result.status === 'number' && result.status >= 400) {
      return fallback(slug, 'amazon-http-error');
    }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    if (isObject(result.data) || Array.isArray(result.data)) { return result.data; }
    return fallback(slug, 'amazon-empty-response');
  }

  function guardedPageText(payload, slug) {
    if (!payload || payload.success === false) { return payload; }
    if (robotCheck(payload)) { return fallback(slug, 'amazon-robot-check'); }
    if (authRequired(payload)) { return fallback(slug, 'amazon-auth-required'); }
    return payload;
  }

  async function readPage(slug, spec, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'amazon-execute-bound-spec-unavailable');
    }
    var result = await ctx.executeBoundSpec(spec, ctx.tabId);
    return responseText(result, slug);
  }

  function searchBlocks(payload) {
    var html = str(payload);
    var out = [];
    var re = /<div\b(?=[^>]*data-component-type=["']s-search-result["'])(?=[^>]*data-asin=["'][^"']+["'])[\s\S]*?(?=<div\b[^>]*data-component-type=["']s-search-result["']|<\/body>|$)/gi;
    var match;
    while ((match = re.exec(html))) { out.push(match[0]); }
    return out;
  }

  function reviewCount(block) {
    var value = firstMatch(block, [
      /<a\b[^>]*href=["'][^"']*customerReviews[^"']*["'][\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>/i,
      /aria-label=["']([0-9][0-9,]*)["']/i
    ]);
    return num(textOnly(value));
  }

  function mapSearchBlock(block) {
    var asin = cleanAsin(attrValue(block, 'data-asin'));
    var title = textOnly(firstMatch(block, [
      /<h2\b[\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/h2>/i,
      /<span\b[^>]*class=["'][^"']*a-size-(?:medium|base-plus)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
    ]));
    if (!asin || !title) { return null; }
    var href = firstMatch(block, [
      /<a\b[^>]*class=["'][^"']*a-link-normal[^"']*["'][^>]*href=["']([^"']*\/dp\/[^"']+)["']/i,
      /<a\b[^>]*href=["']([^"']*\/dp\/[^"']+)["']/i
    ]);
    var price = textOnly(firstMatch(block, [
      /<span\b[^>]*class=["'][^"']*a-price[^"']*["'][\s\S]*?<span\b[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
      /<span\b[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>(\$[\s\S]*?)<\/span>/i
    ]));
    var ratingText = textOnly(firstMatch(block, [
      /<span\b[^>]*class=["'][^"']*a-icon-alt[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
      /aria-label=["']([0-9.]+\s+out of\s+5 stars)["']/i
    ]));
    var imageUrl = attrValue(firstMatch(block, [/(<img\b[^>]*class=["'][^"']*s-image[^"']*["'][^>]*>)/i]), 'src') ||
      attrValue(firstMatch(block, [/(<img\b[^>]*>)/i]), 'src');
    return {
      product_id: asin,
      asin: asin,
      title: title,
      price: price,
      rating: num(firstMatch(ratingText, [/([0-9.]+)\s+out of\s+5/i])),
      review_count: reviewCount(block),
      image_url: imageUrl,
      url: normalizeAmazonUrl(href) || (AMAZON_ORIGIN + '/dp/' + encodeURIComponent(asin))
    };
  }

  function productFromJsonLd(raw, id) {
    if (!isObject(raw)) { return null; }
    var offers = Array.isArray(raw.offers) ? raw.offers[0] : raw.offers;
    var aggregate = raw.aggregateRating || {};
    return {
      product_id: id,
      asin: id,
      title: str(raw.name),
      price: offers && offers.price !== undefined
        ? (offers.priceCurrency ? String(offers.priceCurrency) + ' ' : '') + String(offers.price)
        : '',
      availability: str(offers && offers.availability).replace(/^https?:\/\/schema\.org\//, ''),
      description: textOnly(raw.description),
      rating: num(aggregate.ratingValue),
      review_count: num(aggregate.reviewCount),
      image_url: Array.isArray(raw.image) ? str(raw.image[0]) : str(raw.image),
      url: normalizeAmazonUrl(raw.url) || (AMAZON_ORIGIN + '/dp/' + encodeURIComponent(id))
    };
  }

  function bulletDescriptions(payload) {
    var block = firstMatch(payload, [
      /<div\b[^>]*id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/div>/i
    ]);
    var out = [];
    var re = /<li\b[^>]*>\s*<span\b[^>]*>([\s\S]*?)<\/span>\s*<\/li>/gi;
    var match;
    while ((match = re.exec(block))) {
      var text = textOnly(match[1]);
      if (text) { out.push(text); }
    }
    return out.slice(0, 12);
  }

  function productFromHtml(payload, id) {
    var title = textOnly(firstMatch(payload, [
      /<span\b[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i,
      /<title\b[^>]*>([\s\S]*?)<\/title>/i
    ]));
    if (title.indexOf(': Amazon') !== -1) { title = title.replace(/\s*:\s*Amazon\..*$/i, ''); }
    var price = textOnly(firstMatch(payload, [
      /<span\b[^>]*id=["']priceblock_(?:ourprice|dealprice|saleprice)["'][^>]*>([\s\S]*?)<\/span>/i,
      /<span\b[^>]*class=["'][^"']*a-price[^"']*["'][\s\S]*?<span\b[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
      /<span\b[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>(\$[\s\S]*?)<\/span>/i
    ]));
    var availability = textOnly(firstMatch(payload, [
      /<div\b[^>]*id=["']availability["'][^>]*>[\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>/i
    ]));
    var description = textOnly(firstMatch(payload, [
      /<div\b[^>]*id=["']productDescription["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div\b[^>]*id=["']bookDescription_feature_div["'][^>]*>([\s\S]*?)<\/div>/i
    ]));
    var ratingText = textOnly(firstMatch(payload, [
      /<span\b[^>]*class=["'][^"']*a-icon-alt[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
    ]));
    var reviewsText = textOnly(firstMatch(payload, [
      /<span\b[^>]*id=["']acrCustomerReviewText["'][^>]*>([\s\S]*?)<\/span>/i
    ]));
    var imageTag = firstMatch(payload, [
      /(<img\b[^>]*id=["']landingImage["'][^>]*>)/i,
      /(<img\b[^>]*data-old-hires=["'][^"']+["'][^>]*>)/i
    ]);
    var imageUrl = attrValue(imageTag, 'data-old-hires') || attrValue(imageTag, 'src');
    var bullets = bulletDescriptions(payload);
    if (!description && bullets.length) { description = bullets.join(' '); }
    if (!title) { return null; }
    return {
      product_id: id,
      asin: id,
      title: title,
      price: price,
      availability: availability,
      description: description,
      rating: num(firstMatch(ratingText, [/([0-9.]+)\s+out of\s+5/i])),
      review_count: num(firstMatch(reviewsText, [/([0-9,]+)/i])),
      image_url: imageUrl,
      bullet_descriptions: bullets,
      url: AMAZON_ORIGIN + '/dp/' + encodeURIComponent(id)
    };
  }

  function orderIds(payload) {
    var out = [];
    var seen = {};
    var re = /\b\d{3}-\d{7}-\d{7}\b/g;
    var match;
    while ((match = re.exec(str(payload)))) {
      if (!seen[match[0]]) {
        seen[match[0]] = true;
        out.push({ id: match[0], index: match.index });
      }
    }
    return out;
  }

  function contextAround(payload, index) {
    var html = str(payload);
    var start = Math.max(0, index - 3500);
    var end = Math.min(html.length, index + 4500);
    return html.slice(start, end);
  }

  function orderStatus(context) {
    var text = textOnly(context);
    var m = /(Delivered(?:\s+[A-Za-z]+day,\s+[A-Za-z]+\s+\d{1,2})?|Arriving(?:\s+[A-Za-z]+day,\s+[A-Za-z]+\s+\d{1,2})?|Out for delivery|Shipped|Not yet shipped|Ordered|Canceled|Cancelled|Returned)/i.exec(text);
    return m ? m[1] : '';
  }

  function statusBucket(value) {
    var lower = str(value).toLowerCase();
    if (lower.indexOf('cancel') !== -1) { return 'cancelled'; }
    if (lower.indexOf('delivered') !== -1 || lower.indexOf('returned') !== -1) { return 'delivered'; }
    if (lower.indexOf('shipped') !== -1 || lower.indexOf('out for delivery') !== -1) { return 'shipped'; }
    return 'open';
  }

  function orderDate(context) {
    return textOnly(firstMatch(context, [
      /Order placed[\s\S]{0,500}?<span\b[^>]*>([\s\S]*?)<\/span>/i,
      /ORDER PLACED[\s\S]{0,300}?([A-Za-z]+\s+\d{1,2},\s+\d{4})/i
    ]));
  }

  function orderTotal(context) {
    var total = textOnly(firstMatch(context, [
      /Total[\s\S]{0,500}?<span\b[^>]*>([\s\S]*?\$[\s\S]*?)<\/span>/i,
      /TOTAL[\s\S]{0,300}?(\$[0-9,]+(?:\.[0-9]{2})?)/i
    ]));
    return total || textOnly(firstMatch(context, [/(\$[0-9,]+(?:\.[0-9]{2})?)/i]));
  }

  function orderTitles(context) {
    var out = [];
    var re = /<a\b[^>]*href=["'][^"']*\/(?:gp\/product|dp)\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    var match;
    while ((match = re.exec(context))) {
      var title = textOnly(match[1]);
      if (title && out.indexOf(title) === -1) { out.push(title); }
    }
    return out.slice(0, 10);
  }

  function mapOrder(payload, hit) {
    var context = contextAround(payload, hit.index);
    var status = orderStatus(context);
    return {
      order_id: hit.id,
      status: status || '',
      status_bucket: statusBucket(status),
      order_date: orderDate(context),
      total: orderTotal(context),
      items: orderTitles(context),
      url: AMAZON_ORIGIN + '/gp/your-account/order-details?orderID=' + encodeURIComponent(hit.id)
    };
  }

  function trackingSummary(payload, orderId) {
    var context = contextAround(payload, Math.max(0, str(payload).indexOf(orderId)));
    var status = orderStatus(context) || textOnly(firstMatch(context, [
      /<h1\b[^>]*>([\s\S]*?)<\/h1>/i,
      /<div\b[^>]*class=["'][^"']*(?:shipment|tracking|delivery)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    ]));
    var delivery = textOnly(firstMatch(context, [
      /(?:Arriving|Delivery date|Estimated delivery)[\s\S]{0,250}?((?:[A-Za-z]+day,\s+)?[A-Za-z]+\s+\d{1,2}(?:,\s+\d{4})?)/i,
      /(Arriving\s+(?:[A-Za-z]+day,\s+)?[A-Za-z]+\s+\d{1,2})/i
    ]));
    var tracking = textOnly(firstMatch(context, [
      /Tracking(?:\s+ID|\s+number)?[\s:]+([A-Z0-9-]{8,})/i
    ]));
    var carrier = textOnly(firstMatch(context, [
      /\b(UPS|USPS|FedEx|Amazon Logistics|DHL)\b/i
    ]));
    if (!status && !delivery && !tracking) { return null; }
    return {
      order_id: orderId,
      status: status,
      status_bucket: statusBucket(status),
      delivery_estimate: delivery,
      carrier: carrier,
      tracking_number: tracking,
      url: AMAZON_ORIGIN + '/gp/your-account/order-details?orderID=' + encodeURIComponent(orderId)
    };
  }

  function readHandler(params, handle) {
    return {
      tier: 'T1a',
      origin: AMAZON_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return handle(args || {}, ctx);
      }
    };
  }

  function guardedHandler(sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: AMAZON_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle(args, ctx) {
        return fallback(this && this.slug ? this.slug : reason, reason);
      }
    };
  }

  var handlers = {
    'amazon.search_products': readHandler(
      SEARCH_PARAMS,
      async function (args, ctx) {
        var query = str(args.query).trim();
        if (!query) { return fallback('amazon.search_products', 'amazon-invalid-query'); }
        var limit = Math.min(50, Math.max(1, num(args.limit) || 10));
        var sort = SORT_MAP[args.sort] || '';
        var payload = await readPage('amazon.search_products', htmlSpec('/s', [
          ['k', query],
          ['i', args.category],
          ['s', sort]
        ]), ctx);
        payload = guardedPageText(payload, 'amazon.search_products');
        if (!payload || payload.success === false) { return payload; }
        var products = searchBlocks(payload).map(mapSearchBlock).filter(Boolean).slice(0, limit);
        if (!products.length) { return fallback('amazon.search_products', 'amazon-search-shape-mismatch'); }
        return { success: true, data: { products: products, total_results: products.length } };
      }
    ),
    'amazon.get_product': readHandler(
      PRODUCT_PARAMS,
      async function (args, ctx) {
        var id = cleanAsin(args.product_id);
        if (!id) { return fallback('amazon.get_product', 'amazon-invalid-product-id'); }
        var payload = await readPage('amazon.get_product', htmlSpec('/dp/' + encodeURIComponent(id), []), ctx);
        payload = guardedPageText(payload, 'amazon.get_product');
        if (!payload || payload.success === false) { return payload; }
        var product = productFromJsonLd(firstProductJsonLd(payload), id) || productFromHtml(payload, id);
        if (!product || !product.title) { return fallback('amazon.get_product', 'amazon-product-shape-mismatch'); }
        return { success: true, data: { product: product } };
      }
    ),
    'amazon.list_orders': readHandler(
      ORDER_LIST_PARAMS,
      async function (args, ctx) {
        var limit = Math.min(50, Math.max(1, num(args.limit) || 10));
        var payload = await readPage('amazon.list_orders', htmlSpec('/gp/your-account/order-history', []), ctx);
        payload = guardedPageText(payload, 'amazon.list_orders');
        if (!payload || payload.success === false) { return payload; }
        var hits = orderIds(payload);
        var noOrders = /(?:no orders found|you have not placed any orders)/i.test(textOnly(payload));
        if (!hits.length && noOrders) {
          return { success: true, data: { orders: [], total_results: 0 } };
        }
        var orders = hits.map(function (hit) { return mapOrder(payload, hit); });
        if (args.status) {
          orders = orders.filter(function (order) { return order.status_bucket === args.status; });
        }
        orders = orders.slice(0, limit);
        if (!orders.length && !noOrders) { return fallback('amazon.list_orders', 'amazon-orders-shape-mismatch'); }
        return { success: true, data: { orders: orders, total_results: orders.length } };
      }
    ),
    'amazon.track_order': readHandler(
      ORDER_PARAMS,
      async function (args, ctx) {
        var id = cleanOrderId(args.order_id);
        if (!id) { return fallback('amazon.track_order', 'amazon-invalid-order-id'); }
        var payload = await readPage('amazon.track_order', htmlSpec('/gp/your-account/order-details', [
          ['orderID', id]
        ]), ctx);
        payload = guardedPageText(payload, 'amazon.track_order');
        if (!payload || payload.success === false) { return payload; }
        if (str(payload).indexOf(id) === -1) { return fallback('amazon.track_order', 'amazon-order-not-found'); }
        var tracking = trackingSummary(payload, id);
        if (!tracking) { return fallback('amazon.track_order', 'amazon-tracking-shape-mismatch'); }
        return { success: true, data: { tracking: tracking } };
      }
    ),
    'amazon.place_order': guardedHandler('write', PLACE_ORDER_PARAMS, 'amazon-place-order-live-uat-required'),
    'amazon.cancel_order': guardedHandler('destructive', CANCEL_ORDER_PARAMS, 'amazon-cancel-order-live-uat-required')
  };

  handlers['amazon.place_order'].slug = 'amazon.place_order';
  handlers['amazon.cancel_order'].slug = 'amazon.cancel_order';

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
            service: AMAZON_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerAmazon = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
