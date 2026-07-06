(function (global) {
  'use strict';

  /**
   * eBay same-origin T1 head.
   *
   * Promotes deterministic eBay read rows through first-party page/API reads.
   * The watch mutation remains guarded fail-closed until live mutation-body UAT
   * records and approves the request shape.
   */

  var EBAY_ORIGIN = 'https://www.ebay.com';
  var EBAY_SERVICE = 'ebay.com';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var ITEM_PARAMS = schema({
    item_id: { type: 'string', minLength: 1, description: 'eBay item ID' }
  }, ['item_id']);
  var SELLER_PARAMS = schema({
    seller_id: { type: 'string', minLength: 1, description: 'eBay seller username' }
  }, ['seller_id']);
  var SUGGEST_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Partial search text' }
  }, ['query']);
  var SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search keywords' },
    category: { type: 'string', description: 'Category ID filter' },
    condition: {
      type: 'string',
      enum: ['new', 'used', 'refurbished'],
      description: 'Item condition filter'
    },
    min_price: { type: 'number', description: 'Minimum price' },
    max_price: { type: 'number', description: 'Maximum price' },
    sort: {
      type: 'string',
      enum: ['best_match', 'price_asc', 'price_desc', 'ending_soonest', 'newly_listed'],
      description: 'Sort order'
    },
    page: integerSchema('Page number', 1, INT_LIMIT)
  }, ['query']);

  var CONDITION_MAP = {
    new: '1000',
    used: '3000',
    refurbished: '2000|2500'
  };

  var SORT_MAP = {
    best_match: '',
    price_asc: '15',
    price_desc: '16',
    ending_soonest: '1',
    newly_listed: '10'
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
      reason: reason || 'ebay-shape-mismatch',
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
      url: EBAY_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: EBAY_ORIGIN,
      extract: '@'
    };
  }

  function jsonSpec(path, pairs) {
    return {
      url: EBAY_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: EBAY_ORIGIN,
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
    var n = Number(String(value || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function decodeEntities(value) {
    return str(value)
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function stripHtml(value) {
    return decodeEntities(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function firstString(values) {
    for (var i = 0; i < values.length; i++) {
      var value = values[i];
      if (value !== undefined && value !== null && String(value) !== '') {
        return String(value);
      }
    }
    return '';
  }

  function digitString(value) {
    var out = str(value).trim();
    return /^[0-9]{6,32}$/.test(out) ? out : '';
  }

  function sellerId(value) {
    var out = str(value).trim();
    return /^[A-Za-z0-9._-]{1,128}$/.test(out) ? out : '';
  }

  function regexText(source, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var match = patterns[i].exec(source);
      if (match && match[1]) { return stripHtml(match[1]); }
    }
    return '';
  }

  function attr(source, name) {
    var re = new RegExp("\\b" + name + "\\s*=\\s*([\"'])([\\s\\S]*?)\\1", 'i');
    var match = re.exec(source || '');
    return match && match[2] ? decodeEntities(match[2]) : '';
  }

  function resultText(result, slug) {
    if (!result || result.success !== true) {
      return { error: fallback(slug, 'ebay-request-failed') };
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return { error: fallback(slug, 'ebay-http-error') };
    }
    if (typeof result.text === 'string') { return { text: result.text }; }
    if (typeof result.body === 'string') { return { text: result.body }; }
    if (typeof result.data === 'string') { return { text: result.data }; }
    return { error: fallback(slug, 'ebay-html-empty') };
  }

  function resultJson(result, slug) {
    if (!result || result.success !== true) {
      return { error: fallback(slug, 'ebay-request-failed') };
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return { error: fallback(slug, 'ebay-http-error') };
    }
    if (isObject(result.data)) { return { data: result.data }; }
    var text = typeof result.text === 'string' ? result.text
      : (typeof result.body === 'string' ? result.body
        : (typeof result.data === 'string' ? result.data : ''));
    if (!text) { return { error: fallback(slug, 'ebay-json-empty') }; }
    try {
      return { data: JSON.parse(text) };
    } catch (e) {
      return { error: fallback(slug, 'ebay-json-unparseable') };
    }
  }

  async function execute(slug, spec, ctx, kind) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return { error: fallback(slug, 'ebay-execute-bound-spec-unavailable') };
    }
    var result = await ctx.executeBoundSpec(spec, ctx.tabId);
    return kind === 'json' ? resultJson(result, slug) : resultText(result, slug);
  }

  function makeHandler(slug, params, sideEffectClass, handle) {
    return {
      tier: 'T1a',
      origin: EBAY_ORIGIN,
      sideEffectClass: sideEffectClass || 'read',
      params: params,
      handle: handle
    };
  }

  function parseGhpre(text) {
    var userId = regexText(text, [
      /["']userId["']\s*:\s*["']([^"']+)["']/i,
      /GHpre\.userId\s*=\s*["']([^"']+)["']/i
    ]);
    var firstName = regexText(text, [
      /["']fn["']\s*:\s*["']([^"']*)["']/i,
      /["']firstName["']\s*:\s*["']([^"']*)["']/i,
      /GHpre\.fn\s*=\s*["']([^"']*)["']/i
    ]);
    return userId ? { user_id: userId, first_name: firstName } : null;
  }

  function parseResultCount(text) {
    var match = /(\d[\d,]*)\+?\s*results/i.exec(text || '');
    return match && match[1] ? Number.parseInt(match[1].replace(/,/g, ''), 10) : 0;
  }

  function itemIdFromHref(href) {
    var match = /\/itm\/(?:[^/?#]*\/)?(\d{6,32})(?:[/?#]|$)/.exec(href || '');
    return match && match[1] ? match[1] : '';
  }

  function absolutize(href) {
    var value = decodeEntities(href || '');
    if (/^https?:\/\//i.test(value)) { return value.split('?')[0]; }
    if (value.charAt(0) === '/') { return EBAY_ORIGIN + value.split('?')[0]; }
    return value;
  }

  function chunksByClass(text, classPart) {
    var out = [];
    var re = /<(li|div|article)\b[^>]*class=(["'])(?=[^"']*CLASS)[^"']*\2[^>]*>[\s\S]*?<\/\1>/gi;
    re = new RegExp(re.source.replace('CLASS', classPart), 'gi');
    var match;
    while ((match = re.exec(text || ''))) { out.push(match[0]); }
    return out;
  }

  function linkHref(chunk) {
    var match = /<a\b[^>]*href=(["'])([\s\S]*?\/itm\/[\s\S]*?)\1[^>]*>/i.exec(chunk || '');
    return match && match[2] ? decodeEntities(match[2]) : '';
  }

  function imageUrl(chunk) {
    var img = /<img\b[^>]*>/i.exec(chunk || '');
    return img && img[0] ? firstString([attr(img[0], 'src'), attr(img[0], 'data-src')]) : '';
  }

  function parseSearchItem(chunk) {
    var href = linkHref(chunk);
    var itemId = itemIdFromHref(href);
    if (!itemId || itemId === '123456') { return null; }
    var title = regexText(chunk, [
      /<[^>]*(?:role=["']heading["']|class=["'][^"']*s-card__title[^"']*["'])[^>]*>([\s\S]*?)<\/[^>]+>/i,
      /<a\b[^>]*href=["'][^"']*\/itm\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
    ]);
    if (!title) { return null; }
    var allText = stripHtml(chunk);
    var conditionMatch = /(Brand New|New|Pre-Owned|Used|Refurbished|Open Box|For parts)/i.exec(allText);
    var shippingMatch = /(Free shipping|\+\$[\d.]+\s*shipping)/i.exec(allText);
    var bidsMatch = /(\d+)\s*bid/i.exec(allText);
    return {
      item_id: itemId,
      title: title,
      price: regexText(chunk, [/<[^>]*class=["'][^"']*price[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i]),
      url: absolutize(href),
      image: imageUrl(chunk),
      condition: conditionMatch && conditionMatch[1] ? conditionMatch[1] : '',
      shipping: shippingMatch && shippingMatch[1] ? shippingMatch[1] : '',
      bids: bidsMatch && bidsMatch[1] ? bidsMatch[1] : ''
    };
  }

  function parseSearchResults(text) {
    var chunks = chunksByClass(text, 's-card');
    var out = [];
    for (var i = 0; i < chunks.length; i++) {
      var item = parseSearchItem(chunks[i]);
      if (item) { out.push(item); }
    }
    return out;
  }

  function parseJsonLd(text) {
    var out = [];
    var re = /<script\b[^>]*type=(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi;
    var match;
    while ((match = re.exec(text || ''))) {
      try {
        var value = JSON.parse(decodeEntities(match[1]).trim());
        if (Array.isArray(value)) {
          for (var i = 0; i < value.length; i++) { out.push(value[i]); }
        } else {
          out.push(value);
        }
      } catch (e) {
        // Ignore unrelated or malformed script blocks.
      }
    }
    return out;
  }

  function findProductLd(text) {
    var values = parseJsonLd(text);
    for (var i = 0; i < values.length; i++) {
      var value = values[i];
      if (isObject(value) && value['@type'] === 'Product') { return value; }
    }
    return null;
  }

  function firstOffer(raw) {
    var offers = raw && raw.offers;
    if (Array.isArray(offers)) { return offers[0] || {}; }
    return isObject(offers) ? offers : {};
  }

  function conditionName(value) {
    var map = {
      'https://schema.org/NewCondition': 'New',
      'https://schema.org/UsedCondition': 'Used',
      'https://schema.org/RefurbishedCondition': 'Refurbished',
      'https://schema.org/DamagedCondition': 'For Parts'
    };
    return map[value] || str(value).replace('https://schema.org/', '');
  }

  function shippingValue(offer) {
    var details = offer && offer.shippingDetails;
    if (!Array.isArray(details) || !details.length) { return ''; }
    var rate = details[0] && details[0].shippingRate;
    if (!rate) { return ''; }
    var value = str(rate.value);
    if (value === '0' || value === '0.0' || value === '0.00') { return 'Free'; }
    return firstString([str(rate.currency) + ' ' + value, value]).trim();
  }

  function parseItemDetail(text, itemId) {
    var product = findProductLd(text);
    if (!product) { return null; }
    var offer = firstOffer(product);
    var priceSpec = isObject(offer.priceSpecification) ? offer.priceSpecification : {};
    var images = Array.isArray(product.image) ? product.image.map(str).filter(Boolean) : [];
    var sellerLink = regexText(text, [
      /<a\b[^>]*href=["']([^"']*\/usr\/[^"']*)["'][^>]*>[\s\S]*?<\/a>/i
    ]);
    var sellerName = regexText(text, [
      /<[^>]*data-testid=["']str-title["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i,
      /<[^>]*class=["'][^"']*seller[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i
    ]);
    return {
      item_id: itemId,
      title: stripHtml(str(product.name)),
      price: str(offer.price),
      currency: str(offer.priceCurrency || 'USD'),
      list_price: str(priceSpec.price || ''),
      condition: conditionName(str(offer.itemCondition)),
      availability: str(offer.availability).replace('https://schema.org/', ''),
      images: images,
      seller: sellerName,
      seller_url: sellerLink ? absolutize(sellerLink) : '',
      url: firstString([str(offer.url), EBAY_ORIGIN + '/itm/' + itemId]),
      brand: isObject(product.brand) ? str(product.brand.name) : str(product.brand),
      description: stripHtml(regexText(text, [
        /<[^>]*(?:data-testid=["']item-description["']|class=["'][^"']*x-item-description[^"']*["'])[^>]*>([\s\S]*?)<\/[^>]+>/i
      ])).slice(0, 500),
      shipping: shippingValue(offer),
      return_policy: stripHtml(regexText(text, [
        /<[^>]*(?:data-testid=["']x-returns-minview["']|class=["'][^"']*returns[^"']*["'])[^>]*>([\s\S]*?)<\/[^>]+>/i
      ]))
    };
  }

  function parseDeals(text) {
    var chunks = chunksByClass(text, 'deal');
    var out = [];
    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i];
      var href = firstString([
        linkHref(chunk),
        regexText(chunk, [/<a\b[^>]*href=["']([^"']*\/e\/[^"']*)["'][^>]*>/i])
      ]);
      var title = regexText(chunk, [
        /<[^>]*(?:role=["']heading["']|class=["'][^"']*title[^"']*["'])[^>]*>([\s\S]*?)<\/[^>]+>/i,
        /<a\b[^>]*href=["'][^"']*(?:\/itm\/|\/e\/)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
      ]);
      if (!title) { continue; }
      out.push({
        title: title,
        price: regexText(chunk, [/<[^>]*class=["'][^"']*price[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i]),
        original_price: regexText(chunk, [/<(?:s|del)\b[^>]*>([\s\S]*?)<\/(?:s|del)>/i, /<[^>]*class=["'][^"']*(?:original|was|strikethrough)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i]),
        discount: regexText(chunk, [/<[^>]*class=["'][^"']*(?:discount|off)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i]),
        url: absolutize(href),
        image: imageUrl(chunk)
      });
    }
    return out;
  }

  function parseSeller(text, id) {
    var stats = stripHtml(regexText(text, [
      /<[^>]*class=["'][^"']*str-seller-card__store-stats-content[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
      /<body\b[^>]*>([\s\S]*?)<\/body>/i
    ]));
    var positive = /([\d.]+)%\s*positive feedback/i.exec(stats);
    var sold = /([\d.]+[KMB]?)\s*items? sold/i.exec(stats);
    var followers = /([\d.]+[KMB]?)\s*followers/i.exec(stats);
    var store = regexText(text, [
      /<[^>]*class=["'][^"']*str-seller-card__store-name[^"']*["'][^>]*>\s*(?:<a\b[^>]*>)?([\s\S]*?)(?:<\/a>)?\s*<\/[^>]+>/i
    ]);
    return {
      seller_id: id,
      items_sold: sold && sold[1] ? sold[1] : '',
      positive_feedback_pct: positive && positive[1] ? positive[1] + '%' : '',
      followers: followers && followers[1] ? followers[1] : '',
      store_name: store,
      url: EBAY_ORIGIN + '/usr/' + encodeURIComponent(id)
    };
  }

  function parseWatchlist(text) {
    var seen = {};
    var out = [];
    var re = /\/itm\/(?:[^/?#]*\/)?(\d{8,32})(?:[/?#]|$)/g;
    var match;
    while ((match = re.exec(text || ''))) {
      var id = match[1];
      if (!id || seen[id]) { continue; }
      seen[id] = true;
      out.push({
        item_id: id,
        title: '',
        price: '',
        url: EBAY_ORIGIN + '/itm/' + id,
        image: '',
        time_left: ''
      });
    }
    return out;
  }

  var handlers = {
    'ebay.get_current_user': makeHandler('ebay.get_current_user', EMPTY_PARAMS, 'read',
      async function (_args, ctx) {
        var res = await execute('ebay.get_current_user', htmlSpec('/'), ctx, 'html');
        if (res.error) { return res.error; }
        var user = parseGhpre(res.text);
        if (!user) { return fallback('ebay.get_current_user', 'ebay-auth-shape-missing'); }
        return { success: true, data: { user: user } };
      }
    ),

    'ebay.get_deals': makeHandler('ebay.get_deals', EMPTY_PARAMS, 'read',
      async function (_args, ctx) {
        var res = await execute('ebay.get_deals', htmlSpec('/deals'), ctx, 'html');
        if (res.error) { return res.error; }
        var deals = parseDeals(res.text);
        if (!deals.length) { return fallback('ebay.get_deals', 'ebay-deals-shape-mismatch'); }
        return { success: true, data: { deals: deals } };
      }
    ),

    'ebay.get_item': makeHandler('ebay.get_item', ITEM_PARAMS, 'read',
      async function (args, ctx) {
        var itemId = digitString(args && args.item_id);
        if (!itemId) { return fallback('ebay.get_item', 'ebay-invalid-item-id'); }
        var res = await execute('ebay.get_item', htmlSpec('/itm/' + encodeURIComponent(itemId)), ctx, 'html');
        if (res.error) { return res.error; }
        var item = parseItemDetail(res.text, itemId);
        if (!item || !item.title) { return fallback('ebay.get_item', 'ebay-item-product-shape-missing'); }
        return { success: true, data: { item: item } };
      }
    ),

    'ebay.get_seller_profile': makeHandler('ebay.get_seller_profile', SELLER_PARAMS, 'read',
      async function (args, ctx) {
        var id = sellerId(args && args.seller_id);
        if (!id) { return fallback('ebay.get_seller_profile', 'ebay-invalid-seller-id'); }
        var res = await execute('ebay.get_seller_profile', htmlSpec('/usr/' + encodeURIComponent(id)), ctx, 'html');
        if (res.error) { return res.error; }
        var seller = parseSeller(res.text, id);
        if (!seller.positive_feedback_pct && !seller.items_sold && !seller.followers && !seller.store_name) {
          return fallback('ebay.get_seller_profile', 'ebay-seller-shape-mismatch');
        }
        return { success: true, data: seller };
      }
    ),

    'ebay.get_watchlist': makeHandler('ebay.get_watchlist', EMPTY_PARAMS, 'read',
      async function (_args, ctx) {
        var res = await execute('ebay.get_watchlist', htmlSpec('/mye/myebay/Watchlist'), ctx, 'html');
        if (res.error) { return res.error; }
        if (res.text.indexOf('Watchlist') === -1 && res.text.indexOf('/itm/') === -1) {
          return fallback('ebay.get_watchlist', 'ebay-watchlist-shape-mismatch');
        }
        return { success: true, data: { items: parseWatchlist(res.text) } };
      }
    ),

    'ebay.search_items': makeHandler('ebay.search_items', SEARCH_PARAMS, 'read',
      async function (args, ctx) {
        var query = str(args && args.query).trim();
        if (!query) { return fallback('ebay.search_items', 'ebay-missing-query'); }
        var sort = SORT_MAP[str(args && args.sort)] || '';
        var condition = CONDITION_MAP[str(args && args.condition)] || '';
        var res = await execute('ebay.search_items', htmlSpec('/sch/i.html', [
          ['_nkw', query],
          ['_sacat', str(args && args.category) || '0'],
          ['_sop', sort],
          ['_pgn', args && args.page],
          ['_udlo', args && args.min_price],
          ['_udhi', args && args.max_price],
          ['LH_ItemCondition', condition]
        ]), ctx, 'html');
        if (res.error) { return res.error; }
        var items = parseSearchResults(res.text);
        if (!items.length) { return fallback('ebay.search_items', 'ebay-search-shape-mismatch'); }
        return { success: true, data: { total_results: parseResultCount(res.text), items: items } };
      }
    ),

    'ebay.search_suggestions': makeHandler('ebay.search_suggestions', SUGGEST_PARAMS, 'read',
      async function (args, ctx) {
        var query = str(args && args.query).trim();
        if (!query) { return fallback('ebay.search_suggestions', 'ebay-missing-query'); }
        var res = await execute('ebay.search_suggestions', jsonSpec('/sch/ajax/autocomplete', [
          ['kwd', query]
        ]), ctx, 'json');
        if (res.error) { return res.error; }
        if (!isObject(res.data)) { return fallback('ebay.search_suggestions', 'ebay-suggestions-shape-mismatch'); }
        return {
          success: true,
          data: {
            url: str(res.data.url),
            active_factors: isObject(res.data.activeFactors) ? res.data.activeFactors : {}
          }
        };
      }
    ),

    'ebay.watch_item': makeHandler('ebay.watch_item', ITEM_PARAMS, 'write',
      async function () {
        return fallback('ebay.watch_item', 'ebay-watch-item-mutation-unverified');
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
            service: EBAY_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerEbay = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
