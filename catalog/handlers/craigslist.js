(function (global) {
  'use strict';

  /**
   * Craigslist first-party API READ head.
   *
   * The Craigslist web session is established on accounts.craigslist.org and its
   * reviewed tools call first-party Craigslist API subdomains from that page
   * context. Reads use executeBoundSpec only. Posting/payment mutations stay
   * guarded fail-closed until live mutation-body UAT records their exact shapes.
   */

  var ORIGIN = 'https://accounts.craigslist.org';
  var SERVICE = 'craigslist.org';
  var WAPI_BASE = 'https://wapi.craigslist.org/web/v8';
  var CAPI_BASE = 'https://capi.craigslist.org/web/v8';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var CARD_ID_PARAMS = schema({
    card_id: { type: 'string', minLength: 1, description: 'Payment card ID' }
  }, ['card_id']);
  var CONVERSATION_PARAMS = schema({
    conversation_id: integerSchema('Conversation ID to retrieve messages for', 1)
  }, ['conversation_id']);

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
      reason: reason || 'craigslist-api-shape-mismatch',
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

  function buildQuery(query) {
    var merged = Object.assign({ lang: 'en' }, query || {});
    var parts = [];
    for (var key in merged) {
      if (!Object.prototype.hasOwnProperty.call(merged, key)) { continue; }
      var value = merged[key];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function getSpec(base, endpoint, query) {
    return {
      url: base + endpoint + buildQuery(query),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function accountsSpec(endpoint) {
    return {
      url: ORIGIN + endpoint,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function envelopeData(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'craigslist-api-read-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'craigslist-logged-out-or-http-error');
    }
    var body = result.data;
    if (!isObject(body)) { return fallback(slug, 'craigslist-api-envelope-missing'); }
    if (Array.isArray(body.errors) && body.errors.length) {
      return fallback(slug, 'craigslist-api-errors');
    }
    if (!Object.prototype.hasOwnProperty.call(body, 'data')) {
      return fallback(slug, 'craigslist-api-data-missing');
    }
    return body.data || {};
  }

  async function readEnvelope(slug, ctx, base, endpoint, mapper) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'craigslist-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(getSpec(base, endpoint), ctx.tabId);
    var data = envelopeData(res, slug);
    if (data && data.success === false) { return data; }
    try {
      return { success: true, data: mapper(data || {}) };
    } catch (_err) {
      return fallback(slug, 'craigslist-api-shape-mismatch');
    }
  }

  async function readAccountsJson(slug, ctx, endpoint, mapper) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'craigslist-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(accountsSpec(endpoint), ctx.tabId);
    if (!res || res.success !== true) {
      return fallback(slug, 'craigslist-accounts-read-failed');
    }
    if (res.redirected || res.status === 401 || res.status === 403 ||
        (typeof res.status === 'number' && res.status >= 400)) {
      return fallback(slug, 'craigslist-logged-out-or-http-error');
    }
    try {
      return { success: true, data: mapper(res.data) };
    } catch (_err) {
      return fallback(slug, 'craigslist-accounts-shape-mismatch');
    }
  }

  function mapPaymentCard(raw) {
    var c = isObject(raw) ? raw : {};
    return {
      id: str(c.id),
      cardVendorName: str(c.card_vendor_name),
      cardNumberLastFour: str(c.card_number_last_four),
      cardExpireDate: str(c.card_expire_date),
      firstName: str(c.first_name),
      lastName: str(c.last_name),
      address: str(c.address),
      city: str(c.city),
      subnational: str(c.subnational),
      postalCode: str(c.postal_code),
      country: str(c.country),
      isDefault: bool(c.is_default),
      isExpired: bool(c.is_expired)
    };
  }

  function mapChatConversation(raw) {
    var c = isObject(raw) ? raw : {};
    return {
      conversationId: num(c.conversationId),
      postingId: num(c.postingId),
      postingTitle: str(c.postingTitle),
      otherPartyName: str(c.otherPartyName),
      lastMessageDate: str(c.lastMessageDate),
      lastMessagePreview: str(c.lastMessageText),
      unreadCount: num(c.unreadCount),
      isArchived: bool(c.archived)
    };
  }

  function mapChatMessage(raw) {
    var m = isObject(raw) ? raw : {};
    return {
      messageId: num(m.messageId),
      conversationId: num(m.conversationId),
      senderName: str(m.senderName),
      text: str(m.text),
      date: str(m.date),
      isFromMe: bool(m.isFromMe)
    };
  }

  function mapSavedSearchCount(raw) {
    var s = isObject(raw) ? raw : {};
    return {
      id: num(s.id),
      count: num(s.count)
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params || EMPTY_PARAMS,
      async handle() {
        return fallback(slug, reason || ('unverified-' + slug.replace(/\./g, '-') + '-mutation'));
      }
    };
  }

  function readHandler(slug, params, base, endpoint, mapper) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(_args, ctx) {
        return readEnvelope(slug, ctx, base, endpoint, mapper);
      }
    };
  }

  var handlers = {
    'craigslist.get_current_user': readHandler(
      'craigslist.get_current_user',
      EMPTY_PARAMS,
      WAPI_BASE,
      '/user/info',
      function(data) {
        return {
          userId: str(data.userId || data.userID || data.user_id),
          email: str(data.userEmail || data.email),
          defaultAreaId: num(data.defaultAreaId)
        };
      }
    ),
    'craigslist.get_saved_search_counts': {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: EMPTY_PARAMS,
      async handle(_args, ctx) {
        return readAccountsJson('craigslist.get_saved_search_counts', ctx, '/savesearch/counts', function(data) {
          return { searches: list(data).map(mapSavedSearchCount) };
        });
      }
    },
    'craigslist.list_renewable_postings': readHandler(
      'craigslist.list_renewable_postings',
      EMPTY_PARAMS,
      WAPI_BASE,
      '/postings/bulk-action/renew/list',
      function(data) {
        return { ids: list(data.ids).map(num), uuids: list(data.uuids).map(str) };
      }
    ),
    'craigslist.list_payment_cards': readHandler(
      'craigslist.list_payment_cards',
      EMPTY_PARAMS,
      WAPI_BASE,
      '/user/billing/payment-cards',
      function(data) {
        return {
          cards: list(data.items).map(mapPaymentCard),
          canBulkPost: bool(data.can_bulk_post)
        };
      }
    ),
    'craigslist.list_chat_conversations': readHandler(
      'craigslist.list_chat_conversations',
      EMPTY_PARAMS,
      CAPI_BASE,
      '/chat',
      function(data) {
        return {
          conversations: list(data.items).map(mapChatConversation),
          postingCount: num(data.postingCount)
        };
      }
    ),
    'craigslist.get_chat_messages': {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: CONVERSATION_PARAMS,
      async handle(args, ctx) {
        var id = encodeURIComponent(String(args && args.conversation_id));
        return readEnvelope('craigslist.get_chat_messages', ctx, CAPI_BASE, '/chat/' + id, function(data) {
          return { messages: list(data.items).map(mapChatMessage) };
        });
      }
    },
    'craigslist.renew_all_postings': guarded(
      'craigslist.renew_all_postings',
      'write',
      EMPTY_PARAMS,
      'unverified-craigslist-renew-all-postings-mutation'
    ),
    'craigslist.set_default_payment_card': guarded(
      'craigslist.set_default_payment_card',
      'write',
      CARD_ID_PARAMS,
      'unverified-craigslist-set-default-payment-card-mutation'
    ),
    'craigslist.delete_payment_card': guarded(
      'craigslist.delete_payment_card',
      'destructive',
      CARD_ID_PARAMS,
      'unverified-craigslist-delete-payment-card-mutation'
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
            service: SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerCraigslist = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
