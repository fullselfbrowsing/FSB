(function (global) {
  'use strict';

  /**
   * Stripe Dashboard same-origin READ head.
   *
   * Stripe's dashboard proxies the Stripe API at /v1 on dashboard.stripe.com.
   * The dashboard session supplies a session API key, CSRF token, and account id in
   * page bootstrap state. This handler first performs a same-origin bootstrap read,
   * extracts only those carriers from the response, then uses executeBoundSpec for
   * read-only /v1 GET calls. The carriers are used only inside the bound spec and
   * are never logged or returned.
   */

  var STRIPE_ORIGIN = 'https://dashboard.stripe.com';
  var STRIPE_API_BASE = STRIPE_ORIGIN + '/v1';
  var STRIPE_VERSION = '2025-06-30.basil';

  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };
  var LIMIT_CURSOR_PARAMS = {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      starting_after: { type: 'string' }
    },
    additionalProperties: false
  };

  function withProps(props, required) {
    var out = { type: 'object', properties: props || {}, additionalProperties: false };
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
      reason: reason,
      fellBackToDom: true
    });
  }

  function activeUrlFromContext(ctx) {
    if (!ctx || typeof ctx !== 'object') { return ''; }
    var fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (var i = 0; i < fields.length; i++) {
      var value = ctx[fields[i]];
      if (typeof value === 'string' && value) { return value; }
    }
    return '';
  }

  function bootstrapPath(ctx) {
    var activeUrl = activeUrlFromContext(ctx);
    if (!activeUrl) { return '/'; }
    try {
      var parsed = new URL(activeUrl);
      if (parsed.origin !== STRIPE_ORIGIN) { return '/'; }
      return (parsed.pathname || '/') + (parsed.search || '');
    } catch (e) {
      return '/';
    }
  }

  function livemodeFromContext(ctx) {
    var activeUrl = activeUrlFromContext(ctx);
    try {
      var parsed = new URL(activeUrl || STRIPE_ORIGIN + '/');
      return parsed.pathname.indexOf('/test/') === -1;
    } catch (e) {
      return true;
    }
  }

  function buildBootstrapSpec(ctx) {
    return {
      url: STRIPE_ORIGIN + bootstrapPath(ctx),
      method: 'GET',
      headers: { 'Accept': 'text/html,application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: STRIPE_ORIGIN,
      extract: '@'
    };
  }

  function decodeMatch(value) {
    if (typeof value !== 'string') { return ''; }
    try { return JSON.parse('"' + value.replace(/"/g, '\\"') + '"'); } catch (e) { return value; }
  }

  function firstMatch(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var m = patterns[i].exec(text);
      if (m && m[1]) { return decodeMatch(m[1]); }
    }
    return '';
  }

  function authFromText(text, ctx) {
    var t = String(text || '');
    var sessionApiKey = firstMatch(t, [
      /["']session_api_key["']\s*:\s*["']([^"']+)["']/,
      /["']sessionApiKey["']\s*:\s*["']([^"']+)["']/,
      /PRELOADED\.session_api_key\s*=\s*["']([^"']+)["']/
    ]);
    var csrfToken = firstMatch(t, [
      /["']csrf_token["']\s*:\s*["']([^"']+)["']/,
      /["']csrfToken["']\s*:\s*["']([^"']+)["']/,
      /PRELOADED\.csrf_token\s*=\s*["']([^"']+)["']/
    ]);
    var merchantId = firstMatch(t, [
      /["']merchant["']\s*:\s*\{[\s\S]{0,800}?["']id["']\s*:\s*["']([^"']+)["']/,
      /["']merchant_id["']\s*:\s*["']([^"']+)["']/,
      /["']account_id["']\s*:\s*["']([^"']+)["']/,
      /["']stripe_account["']\s*:\s*["']([^"']+)["']/
    ]);
    var stripeVersion = firstMatch(t, [
      /["']STRIPE_VERSION["']\s*:\s*["']([^"']+)["']/,
      /STRIPE_VERSION\s*=\s*["']([^"']+)["']/
    ]) || STRIPE_VERSION;

    if (!sessionApiKey || !csrfToken || !merchantId) { return null; }
    return {
      sessionApiKey: sessionApiKey,
      csrfToken: csrfToken,
      merchantId: merchantId,
      stripeVersion: stripeVersion,
      livemode: livemodeFromContext(ctx)
    };
  }

  function parseBootstrapResult(result, slug, ctx) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || result.status === 401 || result.status === 403) {
      return fallback(slug, 'stripe-bootstrap-logged-out');
    }
    var text = typeof result.text === 'string' ? result.text : '';
    if (!text && result.data && typeof result.data === 'object') {
      try { text = JSON.stringify(result.data); } catch (e) { text = ''; }
    }
    var auth = authFromText(text, ctx);
    return auth || fallback(slug, 'stripe-bootstrap-auth-unavailable');
  }

  function appendQuery(path, query) {
    var parts = [];
    var q = query || {};
    for (var key in q) {
      if (Object.prototype.hasOwnProperty.call(q, key) && q[key] !== undefined && q[key] !== null && q[key] !== '') {
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(q[key])));
      }
    }
    return STRIPE_API_BASE + path + (parts.length ? '?' + parts.join('&') : '');
  }

  function buildApiSpec(path, query, auth) {
    return {
      url: appendQuery(path, query),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + auth.sessionApiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Stripe-Account': auth.merchantId,
        'Stripe-Livemode': String(auth.livemode),
        'Stripe-Version': auth.stripeVersion,
        'x-stripe-csrf-token': auth.csrfToken
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: STRIPE_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeStripeError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && !!data.error;
  }

  function guardObject(result, slug, allowNoId) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeStripeError(data)
      && (allowNoId === true || typeof data.id === 'string');
    if (result.redirected || result.status === 401 || result.status === 403 || !ok) {
      return fallback(slug, 'stripe-api-logged-out-or-shape-mismatch');
    }
    return result;
  }

  function guardList(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeStripeError(data)
      && Array.isArray(data.data);
    if (result.redirected || result.status === 401 || result.status === 403 || !ok) {
      return fallback(slug, 'stripe-api-logged-out-or-shape-mismatch');
    }
    return result;
  }

  async function bootstrapAuth(ctx, slug) {
    var boot = await ctx.executeBoundSpec(buildBootstrapSpec(ctx), ctx.tabId);
    return parseBootstrapResult(boot, slug, ctx);
  }

  async function callStripeRead(slug, path, query, ctx, guard) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'stripe-execute-bound-spec-unavailable');
    }
    var auth = await bootstrapAuth(ctx, slug);
    if (!auth || auth.success === false) { return auth; }
    var res = await ctx.executeBoundSpec(buildApiSpec(path, query, auth), ctx.tabId);
    return guard(res, slug);
  }

  function readHandler(slug, pathFn, queryFn, params, guard) {
    return {
      tier: 'T1a',
      origin: STRIPE_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        return callStripeRead(slug, pathFn(a), queryFn ? queryFn(a) : {}, ctx, guard || guardObject);
      }
    };
  }

  function listQuery(a, extra) {
    var q = { limit: a.limit, starting_after: a.starting_after };
    var e = extra || {};
    for (var k in e) {
      if (Object.prototype.hasOwnProperty.call(e, k)) { q[k] = e[k]; }
    }
    return q;
  }

  function idPath(prefix, field, args) {
    return prefix + '/' + encodeURIComponent(String(args[field] || ''));
  }

  var handlers = {
    'stripe.get_account': readHandler('stripe.get_account', function () { return '/account'; }, null, EMPTY_PARAMS, function (res, slug) { return guardObject(res, slug, false); }),
    'stripe.get_balance': readHandler('stripe.get_balance', function () { return '/balance'; }, null, EMPTY_PARAMS, function (res, slug) { return guardObject(res, slug, true); }),
    'stripe.get_customer': readHandler('stripe.get_customer', function (a) { return idPath('/customers', 'customer_id', a); }, null, withProps({ customer_id: { type: 'string', minLength: 1 } }, ['customer_id'])),
    'stripe.get_event': readHandler('stripe.get_event', function (a) { return idPath('/events', 'event_id', a); }, null, withProps({ event_id: { type: 'string', minLength: 1 } }, ['event_id'])),
    'stripe.get_invoice': readHandler('stripe.get_invoice', function (a) { return idPath('/invoices', 'invoice_id', a); }, null, withProps({ invoice_id: { type: 'string', minLength: 1 } }, ['invoice_id'])),
    'stripe.get_payment_intent': readHandler('stripe.get_payment_intent', function (a) { return idPath('/payment_intents', 'payment_intent_id', a); }, null, withProps({ payment_intent_id: { type: 'string', minLength: 1 } }, ['payment_intent_id'])),
    'stripe.get_price': readHandler('stripe.get_price', function (a) { return idPath('/prices', 'price_id', a); }, null, withProps({ price_id: { type: 'string', minLength: 1 } }, ['price_id'])),
    'stripe.get_product': readHandler('stripe.get_product', function (a) { return idPath('/products', 'product_id', a); }, null, withProps({ product_id: { type: 'string', minLength: 1 } }, ['product_id'])),
    'stripe.get_subscription': readHandler('stripe.get_subscription', function (a) { return idPath('/subscriptions', 'subscription_id', a); }, null, withProps({ subscription_id: { type: 'string', minLength: 1 } }, ['subscription_id'])),

    'stripe.list_balance_transactions': readHandler('stripe.list_balance_transactions', function () { return '/balance_transactions'; }, function (a) { return listQuery(a, { type: a.type }); }, withProps({ limit: LIMIT_CURSOR_PARAMS.properties.limit, starting_after: LIMIT_CURSOR_PARAMS.properties.starting_after, type: { type: 'string' } }), guardList),
    'stripe.list_customers': readHandler('stripe.list_customers', function () { return '/customers'; }, function (a) { return listQuery(a, { email: a.email }); }, withProps({ limit: LIMIT_CURSOR_PARAMS.properties.limit, starting_after: LIMIT_CURSOR_PARAMS.properties.starting_after, email: { type: 'string' } }), guardList),
    'stripe.list_events': readHandler('stripe.list_events', function () { return '/events'; }, function (a) { return listQuery(a, { type: a.type }); }, withProps({ limit: LIMIT_CURSOR_PARAMS.properties.limit, starting_after: LIMIT_CURSOR_PARAMS.properties.starting_after, type: { type: 'string' } }), guardList),
    'stripe.list_invoices': readHandler('stripe.list_invoices', function () { return '/invoices'; }, function (a) { return listQuery(a, { customer: a.customer, status: a.status }); }, withProps({ limit: LIMIT_CURSOR_PARAMS.properties.limit, starting_after: LIMIT_CURSOR_PARAMS.properties.starting_after, customer: { type: 'string' }, status: { type: 'string' } }), guardList),
    'stripe.list_payment_intents': readHandler('stripe.list_payment_intents', function () { return '/payment_intents'; }, function (a) { return listQuery(a, { customer: a.customer }); }, withProps({ limit: LIMIT_CURSOR_PARAMS.properties.limit, starting_after: LIMIT_CURSOR_PARAMS.properties.starting_after, customer: { type: 'string' } }), guardList),
    'stripe.list_prices': readHandler('stripe.list_prices', function () { return '/prices'; }, function (a) { return listQuery(a, { product: a.product, active: a.active, type: a.type }); }, withProps({ limit: LIMIT_CURSOR_PARAMS.properties.limit, starting_after: LIMIT_CURSOR_PARAMS.properties.starting_after, product: { type: 'string' }, active: { type: 'boolean' }, type: { type: 'string' } }), guardList),
    'stripe.list_products': readHandler('stripe.list_products', function () { return '/products'; }, function (a) { return listQuery(a, { active: a.active }); }, withProps({ limit: LIMIT_CURSOR_PARAMS.properties.limit, starting_after: LIMIT_CURSOR_PARAMS.properties.starting_after, active: { type: 'boolean' } }), guardList),
    'stripe.list_subscriptions': readHandler('stripe.list_subscriptions', function () { return '/subscriptions'; }, function (a) { return listQuery(a, { customer: a.customer, status: a.status }); }, withProps({ limit: LIMIT_CURSOR_PARAMS.properties.limit, starting_after: LIMIT_CURSOR_PARAMS.properties.starting_after, customer: { type: 'string' }, status: { type: 'string' } }), guardList),

    'stripe.search_customers': readHandler('stripe.search_customers', function () { return '/customers/search'; }, function (a) { return { query: a.query, limit: a.limit }; }, withProps({ query: { type: 'string', minLength: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, ['query']), guardList),
    'stripe.search_invoices': readHandler('stripe.search_invoices', function () { return '/invoices/search'; }, function (a) { return { query: a.query, limit: a.limit }; }, withProps({ query: { type: 'string', minLength: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, ['query']), guardList),
    'stripe.search_payment_intents': readHandler('stripe.search_payment_intents', function () { return '/payment_intents/search'; }, function (a) { return { query: a.query, limit: a.limit }; }, withProps({ query: { type: 'string', minLength: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, ['query']), guardList),
    'stripe.search_subscriptions': readHandler('stripe.search_subscriptions', function () { return '/subscriptions/search'; }, function (a) { return { query: a.query, limit: a.limit }; }, withProps({ query: { type: 'string', minLength: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, ['query']), guardList)
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
          descriptor: { slug: slug, service: 'dashboard.stripe.com', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerStripe = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
