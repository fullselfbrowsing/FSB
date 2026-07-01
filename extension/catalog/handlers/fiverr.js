(function (global) {
  'use strict';

  /**
   * Fiverr same-origin marketplace/message READ head plus guarded messaging write.
   *
   * Search, gig, seller, context, and inbox reads stay on first-party
   * www.fiverr.com bound specs. The message-send write is registered but guarded
   * fail-closed until live mutation-body UAT records and approves the request.
   */

  var FIVERR_ORIGIN = 'https://www.fiverr.com';
  var FIVERR_SERVICE = 'fiverr.com';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search keywords (e.g., "logo design", "wordpress developer")' },
    page: integerSchema('Page number for pagination (default 1)', 1, INT_LIMIT)
  }, ['query']);
  var GIG_PARAMS = schema({
    gig_url: {
      type: 'string',
      minLength: 1,
      description: 'Gig page path or full URL (e.g., "/username/do-something-great" or the absolute URL)'
    }
  }, ['gig_url']);
  var USERNAME_PARAMS = schema({
    username: { type: 'string', minLength: 1, description: 'The Fiverr username' }
  }, ['username']);
  var DRAFT_PARAMS = schema({
    recipient_username: { type: 'string', minLength: 1, description: 'Username of the person the message would be sent to' },
    body: { type: 'string', minLength: 1, description: 'Message text to compose' }
  }, ['recipient_username', 'body']);
  var SEND_PARAMS = schema({
    recipient_username: { type: 'string', minLength: 1, description: 'Username of the recipient' },
    body: { type: 'string', minLength: 1, description: 'Message text to send' }
  }, ['recipient_username', 'body']);

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
      reason: reason || 'fiverr-shape-mismatch',
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

  function first(values) {
    for (var i = 0; i < values.length; i++) {
      var value = values[i];
      if (value !== undefined && value !== null && String(value) !== '') { return value; }
    }
    return '';
  }

  function firstString(values) {
    return str(first(values));
  }

  function stripHtml(value) {
    return decodeEntities(str(value))
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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

  function boundedInt(value, fallbackValue, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) { n = fallbackValue; }
    n = Math.floor(n);
    if (min !== undefined && n < min) { n = min; }
    if (max !== undefined && n > max) { n = max; }
    return n;
  }

  function htmlSpec(path, pairs) {
    return {
      url: FIVERR_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: FIVERR_ORIGIN,
      extract: '@'
    };
  }

  function jsonSpec(path) {
    return {
      url: FIVERR_ORIGIN + path,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: FIVERR_ORIGIN,
      extract: '@'
    };
  }

  function resultText(result, slug) {
    if (!result || result.success !== true) {
      return { error: fallback(slug, 'fiverr-request-failed') };
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return { error: fallback(slug, 'fiverr-logged-out-or-http-error') };
    }
    if (typeof result.text === 'string') { return { text: result.text }; }
    if (typeof result.body === 'string') { return { text: result.body }; }
    if (typeof result.data === 'string') { return { text: result.data }; }
    return { error: fallback(slug, 'fiverr-html-empty') };
  }

  function resultJson(result, slug) {
    if (!result || result.success !== true) {
      return { error: fallback(slug, 'fiverr-request-failed') };
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return { error: fallback(slug, 'fiverr-logged-out-or-http-error') };
    }
    if (isObject(result.data) || Array.isArray(result.data)) { return { data: result.data }; }
    var text = typeof result.text === 'string' ? result.text
      : (typeof result.body === 'string' ? result.body
        : (typeof result.data === 'string' ? result.data : ''));
    if (!text) { return { error: fallback(slug, 'fiverr-json-empty') }; }
    try {
      return { data: JSON.parse(text) };
    } catch (_err) {
      return { error: fallback(slug, 'fiverr-json-unparseable') };
    }
  }

  async function executeHtml(slug, spec, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return { error: fallback(slug, 'fiverr-execute-bound-spec-unavailable') };
    }
    return resultText(await ctx.executeBoundSpec(spec, ctx.tabId), slug);
  }

  async function executeJson(slug, spec, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return { error: fallback(slug, 'fiverr-execute-bound-spec-unavailable') };
    }
    return resultJson(await ctx.executeBoundSpec(spec, ctx.tabId), slug);
  }

  function extractPerseusProps(text, slug) {
    var match = /<script[^>]*id=["']perseus-initial-props["'][^>]*>([\s\S]*?)<\/script>/i.exec(text || '');
    if (!match || !match[1]) { return { error: fallback(slug, 'fiverr-perseus-props-missing') }; }
    try {
      return { data: JSON.parse(decodeEntities(match[1])) };
    } catch (_err) {
      return { error: fallback(slug, 'fiverr-perseus-props-unparseable') };
    }
  }

  function scriptObject(text, name) {
    var escaped = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var patterns = [
      new RegExp(escaped + '\\s*=\\s*(\\{[\\s\\S]*?\\});', 'i'),
      new RegExp("[\"']" + escaped + "[\"']\\s*:\\s*(\\{[\\s\\S]*?\\})\\s*[,}]", 'i')
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = patterns[i].exec(text || '');
      if (!match || !match[1]) { continue; }
      try { return JSON.parse(match[1]); } catch (_err) { /* keep scanning */ }
    }
    return null;
  }

  function extractInitialContext(text) {
    var fiverrContext = scriptObject(text, 'initialData.FiverrContext') || scriptObject(text, 'FiverrContext') || {};
    var activation = scriptObject(text, 'initialData.UserActivationMessage') || scriptObject(text, 'UserActivationMessage') || {};
    var chat = scriptObject(text, 'initialData.FloatingChat') || scriptObject(text, 'FloatingChat') || {};
    var userId = num(fiverrContext.userId);
    return {
      username: firstString([activation.username, chat.currentUsername, fiverrContext.username]),
      user_id: userId,
      currency: firstString([fiverrContext.currency, 'USD']),
      country_code: firstString([fiverrContext.countryCode, fiverrContext.country_code]),
      locale: firstString([fiverrContext.locale]),
      is_pro: bool(fiverrContext.isPro),
      authenticated: userId > 0
    };
  }

  function normalizeUsername(value) {
    var username = str(value).trim().replace(/^[@/]+/, '');
    if (!username || username.indexOf('/') !== -1) { return ''; }
    return username;
  }

  function gigPath(value) {
    var raw = str(value).trim();
    if (!raw) { return ''; }
    if (/^https?:\/\//i.test(raw)) {
      try {
        var u = new URL(raw);
        var host = String(u.hostname || '').toLowerCase();
        if (host !== 'fiverr.com' && host !== 'www.fiverr.com' && !host.endsWith('.fiverr.com')) { return ''; }
        return u.pathname || '';
      } catch (_err) {
        return '';
      }
    }
    return raw.charAt(0) === '/' ? raw : '';
  }

  function absoluteUrl(path) {
    var p = str(path);
    if (!p) { return ''; }
    if (/^https?:\/\//i.test(p)) { return p; }
    return FIVERR_ORIGIN + (p.charAt(0) === '/' ? '' : '/') + p;
  }

  function mapGigSummary(raw, currency) {
    if (!isObject(raw)) { return null; }
    var id = num(first([raw.gigId, raw.gig_id]));
    var title = firstString([raw.title]);
    if (!id || !title) { return null; }
    var assets = list(raw.assets);
    return {
      gig_id: id,
      title: title,
      url: absoluteUrl(firstString([raw.gig_url, raw.url])),
      seller_name: firstString([raw.seller_name]),
      seller_display_name: firstString([raw.seller_display_name]),
      seller_level: firstString([raw.seller_level]),
      seller_country: firstString([raw.seller_country]),
      is_pro: bool(raw.is_pro),
      rating: num(raw.buying_review_rating),
      ratings_count: num(raw.buying_review_rating_count),
      price: num(raw.price_i),
      currency: currency || 'USD',
      num_packages: num(raw.num_of_packages),
      image: firstString([assets[0] && assets[0].cloud_img_main_gig])
    };
  }

  function mapPackage(raw) {
    var features = list(raw && raw.features).map(function(feature) {
      return typeof feature === 'string' ? feature : firstString([feature && feature.label, feature && feature.name]);
    }).filter(Boolean);
    return {
      id: num(raw && raw.id),
      title: firstString([raw && raw.title]),
      description: firstString([raw && raw.description]),
      price: num(raw && raw.price),
      duration: num(raw && raw.duration),
      revisions: num(raw && raw.revisions && raw.revisions.value),
      extra_fast: bool(raw && raw.extraFast && raw.extraFast.included),
      features: features
    };
  }

  function mapReview(raw) {
    return {
      id: str(first([raw && raw.id])),
      reviewer: firstString([raw && raw.username]),
      reviewer_country: firstString([raw && raw.reviewer_country]),
      rating: num(first([raw && raw.value, raw && raw.score])),
      comment: firstString([raw && raw.comment]),
      created_at: str(first([raw && raw.created_at]))
    };
  }

  function mapGigDetail(data) {
    var general = data && data.general || {};
    var overviewGig = data && data.overview && data.overview.gig || {};
    var sellerCard = data && data.sellerCard || {};
    var sellerUser = data && data.seller && data.seller.user || {};
    return {
      gig_id: num(general.gigId),
      title: firstString([general.gigTitle]),
      status: firstString([general.gigStatus]),
      category: firstString([general.categoryName]),
      subcategory: firstString([general.subCategoryName]),
      is_pro: bool(general.isPro),
      description: stripHtml(data && data.description && data.description.content),
      rating: num(overviewGig.rating),
      ratings_count: num(overviewGig.ratingsCount),
      orders_in_queue: num(overviewGig.ordersInQueue),
      seller_name: firstString([sellerUser.name]),
      seller_one_liner: firstString([sellerCard.oneLiner]),
      seller_country: firstString([sellerCard.countryCode]),
      seller_member_since: str(first([sellerCard.memberSince])),
      seller_response_time: firstString([sellerCard.responseTime]),
      packages: list(data && data.packages && data.packages.packageList).map(mapPackage),
      reviews: list(data && data.reviews && data.reviews.reviews).map(mapReview)
    };
  }

  function mapSellerProfile(data) {
    var seller = data && data.seller || {};
    var user = seller.user || {};
    var rating = seller.rating || {};
    return {
      username: firstString([user.name]),
      display_name: firstString([user.profile && user.profile.displayName, user.name]),
      joined_at: str(first([user.joinedAt])),
      is_pro: bool(seller.isPro),
      is_verified: bool(seller.isVerified),
      level: firstString([seller.sellerLevel]),
      country: firstString([user.address && user.address.countryName]),
      one_liner: firstString([seller.oneLinerTitle]),
      description: stripHtml(seller.description),
      rating: num(rating.score),
      ratings_count: num(rating.count),
      approved_gigs_count: num(seller.approvedGigsCount)
    };
  }

  function mapConversationSummary(raw) {
    return {
      username: firstString([raw && raw.username]),
      display_name: firstString([raw && raw.displayName, raw && raw.username]),
      user_id: num(raw && raw.userId),
      conversation_id: firstString([raw && raw.conversationId]),
      unread_count: num(raw && raw.unreadCount),
      excerpt: firstString([raw && raw.excerpt]),
      recent_message_date: str(first([raw && raw.recentMessageDate])),
      online: bool(raw && raw.online),
      archived: bool(raw && raw.archived),
      starred: bool(raw && raw.starred)
    };
  }

  function mapMessage(raw) {
    return {
      id: str(first([raw && raw.id])),
      sender: firstString([raw && raw.sender]),
      recipient: firstString([raw && raw.recipient]),
      body: stripHtml(firstString([raw && raw.bodyUnformatted, raw && raw.body])),
      created_at: str(first([raw && raw.createdAt])),
      type: firstString([raw && raw.type]),
      attachment_count: list(raw && raw.attachments).length
    };
  }

  function mapConversation(raw) {
    return {
      username: firstString([raw && raw.username]),
      display_name: firstString([raw && raw.displayName, raw && raw.username]),
      conversation_id: firstString([raw && raw.conversationId]),
      unread_count: num(raw && raw.unreadCount),
      last_page: bool(raw && raw.lastPage),
      messages: list(raw && raw.messages).map(mapMessage)
    };
  }

  function makeHandler(slug, params, sideEffectClass, handle) {
    return {
      tier: 'T1a',
      origin: FIVERR_ORIGIN,
      sideEffectClass: sideEffectClass || 'read',
      params: params,
      async handle(args, ctx) {
        return handle(args || {}, ctx);
      }
    };
  }

  function guarded(slug, params, reason) {
    return makeHandler(slug, params, 'write', async function () {
      return fallback(slug, reason);
    });
  }

  var handlers = {
    'fiverr.get_current_page_context': makeHandler(
      'fiverr.get_current_page_context',
      EMPTY_PARAMS,
      'read',
      async function (_args, ctx) {
        var got = await executeHtml('fiverr.get_current_page_context', htmlSpec('/'), ctx);
        if (got.error) { return got.error; }
        var account = extractInitialContext(got.text);
        if (!account.authenticated) {
          return fallback('fiverr.get_current_page_context', 'fiverr-auth-context-missing');
        }
        return {
          success: true,
          data: {
            username: account.username,
            user_id: account.user_id,
            currency: account.currency,
            country_code: account.country_code,
            locale: account.locale,
            is_pro: account.is_pro,
            current_url: firstString([ctx && ctx.url, FIVERR_ORIGIN + '/']),
            page_title: firstString([ctx && ctx.title])
          }
        };
      }
    ),
    'fiverr.search_gigs': makeHandler(
      'fiverr.search_gigs',
      SEARCH_PARAMS,
      'read',
      async function (args, ctx) {
        var query = str(args.query).trim();
        if (!query) { return fallback('fiverr.search_gigs', 'fiverr-invalid-query'); }
        var page = boundedInt(args.page, 1, 1, INT_LIMIT);
        var got = await executeHtml('fiverr.search_gigs', htmlSpec('/search/gigs', [
          ['query', query],
          ['page', page]
        ]), ctx);
        if (got.error) { return got.error; }
        var props = extractPerseusProps(got.text, 'fiverr.search_gigs');
        if (props.error) { return props.error; }
        var gigs = props.data && props.data.listings && props.data.listings[0] && props.data.listings[0].gigs;
        if (!Array.isArray(gigs)) { return fallback('fiverr.search_gigs', 'fiverr-search-gigs-shape-mismatch'); }
        var currency = props.data && props.data.currency && props.data.currency.name || 'USD';
        return {
          success: true,
          data: {
            gigs: gigs.map(function(g) { return mapGigSummary(g, currency); }).filter(Boolean),
            total_found: num(props.data && props.data.rawListingData && props.data.rawListingData.num_found) || gigs.length,
            has_more: bool(props.data && props.data.rawListingData && props.data.rawListingData.has_more),
            page: page
          }
        };
      }
    ),
    'fiverr.get_gig_details': makeHandler(
      'fiverr.get_gig_details',
      GIG_PARAMS,
      'read',
      async function (args, ctx) {
        var path = gigPath(args.gig_url);
        if (!path) { return fallback('fiverr.get_gig_details', 'fiverr-invalid-gig-url'); }
        var got = await executeHtml('fiverr.get_gig_details', htmlSpec(path), ctx);
        if (got.error) { return got.error; }
        var props = extractPerseusProps(got.text, 'fiverr.get_gig_details');
        if (props.error) { return props.error; }
        if (!props.data || !props.data.general || !props.data.general.gigId) {
          return fallback('fiverr.get_gig_details', 'fiverr-gig-details-shape-mismatch');
        }
        return { success: true, data: { gig: mapGigDetail(props.data) } };
      }
    ),
    'fiverr.get_seller_profile': makeHandler(
      'fiverr.get_seller_profile',
      USERNAME_PARAMS,
      'read',
      async function (args, ctx) {
        var username = normalizeUsername(args.username);
        if (!username) { return fallback('fiverr.get_seller_profile', 'fiverr-invalid-username'); }
        var got = await executeHtml('fiverr.get_seller_profile', htmlSpec('/' + encodeURIComponent(username)), ctx);
        if (got.error) { return got.error; }
        var props = extractPerseusProps(got.text, 'fiverr.get_seller_profile');
        if (props.error) { return props.error; }
        if (!props.data || !props.data.seller || !props.data.seller.user || !props.data.seller.user.name) {
          return fallback('fiverr.get_seller_profile', 'fiverr-seller-profile-shape-mismatch');
        }
        return { success: true, data: { seller: mapSellerProfile(props.data) } };
      }
    ),
    'fiverr.list_conversations': makeHandler(
      'fiverr.list_conversations',
      EMPTY_PARAMS,
      'read',
      async function (_args, ctx) {
        var got = await executeJson('fiverr.list_conversations', jsonSpec('/inbox/contacts'), ctx);
        if (got.error) { return got.error; }
        if (!Array.isArray(got.data)) { return fallback('fiverr.list_conversations', 'fiverr-conversations-shape-mismatch'); }
        return {
          success: true,
          data: { conversations: got.data.map(mapConversationSummary) }
        };
      }
    ),
    'fiverr.get_conversation': makeHandler(
      'fiverr.get_conversation',
      USERNAME_PARAMS,
      'read',
      async function (args, ctx) {
        var username = normalizeUsername(args.username);
        if (!username) { return fallback('fiverr.get_conversation', 'fiverr-invalid-username'); }
        var got = await executeJson(
          'fiverr.get_conversation',
          jsonSpec('/inbox/contacts/' + encodeURIComponent(username)),
          ctx
        );
        if (got.error) { return got.error; }
        if (!isObject(got.data) || !got.data.conversationId) {
          return fallback('fiverr.get_conversation', 'fiverr-conversation-shape-mismatch');
        }
        return { success: true, data: { conversation: mapConversation(got.data) } };
      }
    ),
    'fiverr.draft_message': makeHandler(
      'fiverr.draft_message',
      DRAFT_PARAMS,
      'read',
      async function (args, ctx) {
        var recipient = normalizeUsername(args.recipient_username);
        var body = str(args.body).trim();
        if (!recipient) { return fallback('fiverr.draft_message', 'fiverr-invalid-recipient'); }
        if (!body) { return fallback('fiverr.draft_message', 'fiverr-empty-body'); }
        var got = await executeHtml('fiverr.draft_message', htmlSpec('/'), ctx);
        if (got.error) { return got.error; }
        var account = extractInitialContext(got.text);
        if (!account.authenticated) { return fallback('fiverr.draft_message', 'fiverr-auth-context-missing'); }
        return {
          success: true,
          data: {
            from: account.username,
            recipient_username: recipient,
            body: body,
            char_count: body.length,
            ready_to_send: recipient.length > 0 && body.length > 0
          }
        };
      }
    ),
    'fiverr.send_message': guarded('fiverr.send_message', SEND_PARAMS, 'unverified-fiverr-send-message-mutation')
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: FIVERR_ORIGIN,
          params: handlers[slug].params,
          descriptor: {
            slug: slug,
            service: FIVERR_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerFiverr = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
