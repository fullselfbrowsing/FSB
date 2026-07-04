(function (global) {
  'use strict';

  /**
   * Cloudflare same-origin READ head.
   *
   * The Cloudflare dashboard proxies API v4 calls through dash.cloudflare.com/api/v4
   * and requires an x-atok anti-forgery header from the dashboard bootstrap page.
   * This handler ports only read descriptors. DNS/cache/settings writes remain
   * DOM/discovery until live mutation-body evidence exists.
   */

  var CLOUDFLARE_ORIGIN = 'https://dash.cloudflare.com';
  var CLOUDFLARE_SERVICE = 'dash.cloudflare.com';
  var API_BASE = CLOUDFLARE_ORIGIN + '/api/v4';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };
  var ZONE_ID = { type: 'string', description: 'Zone ID (32-char hex string)' };
  var ZONE_PARAMS = withProps({ zone_id: ZONE_ID }, ['zone_id']);
  var RULESET_PARAMS = withProps({
    zone_id: ZONE_ID,
    ruleset_id: { type: 'string', description: 'Ruleset ID' }
  }, ['zone_id', 'ruleset_id']);
  var LIST_ZONES_PARAMS = withProps({
    name: { type: 'string', description: 'Filter by domain name (supports partial match)' },
    status: { type: 'string', enum: ['active', 'pending', 'initializing', 'moved'], description: 'Filter by zone status' },
    page: integerSchema('Page number (default 1)', 1),
    per_page: integerSchema('Results per page (default 20, max 50)', 5, 50)
  }, []);
  var LIST_DNS_RECORDS_PARAMS = withProps({
    zone_id: ZONE_ID,
    type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR', 'SOA'], description: 'Filter by record type' },
    name: { type: 'string', description: 'Filter by record name (e.g., "www.example.com")' },
    page: integerSchema('Page number (default 1)', 1),
    per_page: integerSchema('Results per page (default 50, max 100)', 5, 100)
  }, ['zone_id']);
  var LIST_AI_MODELS_PARAMS = withProps({
    search: { type: 'string', description: 'Search query to filter models by name' },
    task: { type: 'string', description: 'Filter by task type (e.g., "Text Generation", "Image Classification")' },
    per_page: integerSchema('Results per page (default 20)', 1, 100),
    page: integerSchema('Page number (default 1)', 1)
  }, []);
  var LIST_KV_PARAMS = withProps({
    page: integerSchema('Page number (default 1)', 1),
    per_page: integerSchema('Results per page (default 20, max 100)', 5, 100)
  }, []);
  var LIST_TUNNELS_PARAMS = withProps({
    is_deleted: { type: 'boolean', description: 'Filter by deletion status (default false -- only active tunnels)' }
  }, []);
  var GRAPHQL_PARAMS = withProps({
    query: { type: 'string', description: 'GraphQL query string' },
    variables: {
      description: 'GraphQL variables (optional)',
      type: 'object',
      propertyNames: { type: 'string' },
      additionalProperties: {}
    }
  }, ['query']);

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
      description: description
    };
  }

  function withProps(properties, required) {
    return {
      type: 'object',
      properties: properties,
      required: required || [],
      additionalProperties: false
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
      reason: reason || 'cloudflare-shape-mismatch',
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

  function accountIdFromContext(ctx) {
    var activeUrl = activeUrlFromContext(ctx);
    if (!activeUrl) { return ''; }
    try {
      var parsed = new URL(activeUrl);
      if (parsed.origin !== CLOUDFLARE_ORIGIN) { return ''; }
      var first = parsed.pathname.split('/').filter(Boolean)[0] || '';
      return /^[a-f0-9]{32}$/i.test(first) ? first.toLowerCase() : '';
    } catch (e) {
      return '';
    }
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
      if (value === undefined || value === null) { continue; }
      if (Array.isArray(value)) {
        for (var j = 0; j < value.length; j++) {
          if (value[j] !== undefined && value[j] !== null) {
            parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value[j])));
          }
        }
      } else {
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
      }
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function buildProbeSpec(ctx) {
    var url = activeUrlFromContext(ctx);
    try {
      if (!url || new URL(url).origin !== CLOUDFLARE_ORIGIN) { url = CLOUDFLARE_ORIGIN + '/'; }
    } catch (e) {
      url = CLOUDFLARE_ORIGIN + '/';
    }
    return {
      url: url,
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: CLOUDFLARE_ORIGIN,
      extract: '@'
    };
  }

  function readAtok(result) {
    if (!result || result.success !== true) { return null; }
    var data = result.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (typeof data.atok === 'string' && data.atok) { return data.atok; }
      if (data.bootstrap && typeof data.bootstrap.atok === 'string' && data.bootstrap.atok) {
        return data.bootstrap.atok;
      }
    }
    var text = typeof result.text === 'string' ? result.text : '';
    if (!text && typeof result.body === 'string') { text = result.body; }
    if (!text) { return null; }
    var patterns = [
      /"atok"\s*:\s*"([^"]+)"/,
      /\batok\b\s*:\s*"([^"]+)"/,
      /bootstrap\.atok\s*=\s*"([^"]+)"/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = patterns[i].exec(text);
      if (match && match[1]) { return match[1]; }
    }
    return null;
  }

  async function bootstrapAtok(ctx, slug) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'cloudflare-execute-bound-spec-unavailable');
    }
    var probe = await ctx.executeBoundSpec(buildProbeSpec(ctx), ctx.tabId);
    if (!probe || probe.success !== true) { return probe || fallback(slug, 'cloudflare-bootstrap-unavailable'); }
    var atok = readAtok(probe);
    if (!atok) { return fallback(slug, 'cloudflare-bootstrap-atok-unavailable'); }
    return { success: true, atok: atok };
  }

  function buildRestSpec(path, pairs, atok) {
    return {
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-atok': atok
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: CLOUDFLARE_ORIGIN,
      extract: '@'
    };
  }

  function buildGraphqlSpec(args, atok) {
    var body = { query: String(args.query || '') };
    if (args.variables !== undefined) { body.variables = args.variables; }
    return {
      url: API_BASE + '/graphql',
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-atok': atok
      },
      body: JSON.stringify(body),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: CLOUDFLARE_ORIGIN,
      extract: '@'
    };
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function looksLikeError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string'
        || typeof data.message === 'string'
        || (Array.isArray(data.errors) && data.errors.length > 0 && data.success === false));
  }

  function guardRestResult(result, slug, kind) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || looksLikeError(data) || data.success === false) {
      return fallback(slug, 'cloudflare-logged-out-or-rot');
    }
    if (!hasOwn(data, 'result')) { return fallback(slug, 'cloudflare-envelope-shape-mismatch'); }
    var payload = data.result;
    var ok = false;
    if (kind === 'array') { ok = Array.isArray(payload); }
    else if (kind === 'object') { ok = !!payload && typeof payload === 'object' && !Array.isArray(payload); }
    else { ok = true; }
    return ok ? result : fallback(slug, 'cloudflare-result-shape-mismatch');
  }

  function guardGraphqlResult(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || looksLikeError(data)) {
      return fallback(slug, 'cloudflare-graphql-shape-mismatch');
    }
    if (!hasOwn(data, 'data') && !Array.isArray(data.errors)) {
      return fallback(slug, 'cloudflare-graphql-shape-mismatch');
    }
    return result;
  }

  function accountPath(ctx, suffix) {
    var accountId = accountIdFromContext(ctx);
    if (!accountId) { return null; }
    return '/accounts/' + encodeURIComponent(accountId) + suffix;
  }

  function accountRequest(ctx, suffix, pairs) {
    var path = accountPath(ctx, suffix);
    return path ? { path: path, pairs: pairs || [] } : { fallbackReason: 'cloudflare-account-id-unavailable' };
  }

  function readHandler(slug, params, requestForArgs, kind) {
    return {
      tier: 'T1a',
      origin: CLOUDFLARE_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var req = requestForArgs(args || {}, ctx);
        if (req && req.fallbackReason) { return fallback(slug, req.fallbackReason); }
        var auth = await bootstrapAtok(ctx, slug);
        if (!auth || auth.success !== true) { return auth; }
        var res = await ctx.executeBoundSpec(buildRestSpec(req.path, req.pairs, auth.atok), ctx.tabId);
        return guardRestResult(res, slug, kind);
      }
    };
  }

  function graphqlHandler() {
    return {
      tier: 'T1a',
      origin: CLOUDFLARE_ORIGIN,
      sideEffectClass: 'read',
      params: GRAPHQL_PARAMS,
      async handle(args, ctx) {
        var auth = await bootstrapAtok(ctx, 'cloudflare.graphql_query');
        if (!auth || auth.success !== true) { return auth; }
        var res = await ctx.executeBoundSpec(buildGraphqlSpec(args || {}, auth.atok), ctx.tabId);
        return guardGraphqlResult(res, 'cloudflare.graphql_query');
      }
    };
  }

  var handlers = {
    'cloudflare.get_ruleset': readHandler('cloudflare.get_ruleset', RULESET_PARAMS, function(a) {
      return { path: '/zones/' + encodeURIComponent(String(a.zone_id)) + '/rulesets/' + encodeURIComponent(String(a.ruleset_id)), pairs: [] };
    }, 'object'),
    'cloudflare.get_user': readHandler('cloudflare.get_user', EMPTY_PARAMS, function() {
      return { path: '/user', pairs: [] };
    }, 'object'),
    'cloudflare.get_zone': readHandler('cloudflare.get_zone', ZONE_PARAMS, function(a) {
      return { path: '/zones/' + encodeURIComponent(String(a.zone_id)), pairs: [] };
    }, 'object'),
    'cloudflare.get_zone_settings': readHandler('cloudflare.get_zone_settings', ZONE_PARAMS, function(a) {
      return { path: '/zones/' + encodeURIComponent(String(a.zone_id)) + '/settings', pairs: [] };
    }, 'array'),
    'cloudflare.graphql_query': graphqlHandler(),
    'cloudflare.list_ai_models': readHandler('cloudflare.list_ai_models', LIST_AI_MODELS_PARAMS, function(a, ctx) {
      return accountRequest(ctx, '/ai/models/search', [
        ['search', a.search],
        ['task', a.task],
        ['per_page', a.per_page === undefined ? 20 : a.per_page],
        ['page', a.page === undefined ? 1 : a.page]
      ]);
    }, 'array'),
    'cloudflare.list_alerting_policies': readHandler('cloudflare.list_alerting_policies', EMPTY_PARAMS, function(a, ctx) {
      return accountRequest(ctx, '/alerting/v3/policies');
    }, 'array'),
    'cloudflare.list_d1_databases': readHandler('cloudflare.list_d1_databases', EMPTY_PARAMS, function(a, ctx) {
      return accountRequest(ctx, '/d1/database');
    }, 'array'),
    'cloudflare.list_dns_records': readHandler('cloudflare.list_dns_records', LIST_DNS_RECORDS_PARAMS, function(a) {
      return {
        path: '/zones/' + encodeURIComponent(String(a.zone_id)) + '/dns_records',
        pairs: [
          ['type', a.type],
          ['name', a.name],
          ['page', a.page === undefined ? 1 : a.page],
          ['per_page', a.per_page === undefined ? 50 : a.per_page]
        ]
      };
    }, 'array'),
    'cloudflare.list_email_addresses': readHandler('cloudflare.list_email_addresses', EMPTY_PARAMS, function(a, ctx) {
      return accountRequest(ctx, '/email/routing/addresses');
    }, 'array'),
    'cloudflare.list_email_routing_rules': readHandler('cloudflare.list_email_routing_rules', ZONE_PARAMS, function(a) {
      return { path: '/zones/' + encodeURIComponent(String(a.zone_id)) + '/email/routing/rules', pairs: [] };
    }, 'array'),
    'cloudflare.list_firewall_rules': readHandler('cloudflare.list_firewall_rules', ZONE_PARAMS, function(a) {
      return { path: '/zones/' + encodeURIComponent(String(a.zone_id)) + '/firewall/rules', pairs: [] };
    }, 'array'),
    'cloudflare.list_kv_namespaces': readHandler('cloudflare.list_kv_namespaces', LIST_KV_PARAMS, function(a, ctx) {
      return accountRequest(ctx, '/storage/kv/namespaces', [
        ['page', a.page === undefined ? 1 : a.page],
        ['per_page', a.per_page === undefined ? 20 : a.per_page]
      ]);
    }, 'array'),
    'cloudflare.list_page_rules': readHandler('cloudflare.list_page_rules', ZONE_PARAMS, function(a) {
      return { path: '/zones/' + encodeURIComponent(String(a.zone_id)) + '/pagerules', pairs: [] };
    }, 'array'),
    'cloudflare.list_pages_projects': readHandler('cloudflare.list_pages_projects', EMPTY_PARAMS, function(a, ctx) {
      return accountRequest(ctx, '/pages/projects');
    }, 'array'),
    'cloudflare.list_queues': readHandler('cloudflare.list_queues', EMPTY_PARAMS, function(a, ctx) {
      return accountRequest(ctx, '/queues');
    }, 'array'),
    'cloudflare.list_rules_lists': readHandler('cloudflare.list_rules_lists', EMPTY_PARAMS, function(a, ctx) {
      return accountRequest(ctx, '/rules/lists');
    }, 'array'),
    'cloudflare.list_rulesets': readHandler('cloudflare.list_rulesets', ZONE_PARAMS, function(a) {
      return { path: '/zones/' + encodeURIComponent(String(a.zone_id)) + '/rulesets', pairs: [] };
    }, 'array'),
    'cloudflare.list_ssl_certificates': readHandler('cloudflare.list_ssl_certificates', ZONE_PARAMS, function(a) {
      return { path: '/zones/' + encodeURIComponent(String(a.zone_id)) + '/ssl/certificate_packs', pairs: [] };
    }, 'array'),
    'cloudflare.list_tunnels': readHandler('cloudflare.list_tunnels', LIST_TUNNELS_PARAMS, function(a, ctx) {
      return accountRequest(ctx, '/cfd_tunnel', [
        ['is_deleted', a.is_deleted === undefined ? false : a.is_deleted]
      ]);
    }, 'array'),
    'cloudflare.list_vectorize_indexes': readHandler('cloudflare.list_vectorize_indexes', EMPTY_PARAMS, function(a, ctx) {
      return accountRequest(ctx, '/vectorize/indexes');
    }, 'array'),
    'cloudflare.list_waiting_rooms': readHandler('cloudflare.list_waiting_rooms', ZONE_PARAMS, function(a) {
      return { path: '/zones/' + encodeURIComponent(String(a.zone_id)) + '/waiting_rooms', pairs: [] };
    }, 'array'),
    'cloudflare.list_worker_routes': readHandler('cloudflare.list_worker_routes', ZONE_PARAMS, function(a) {
      return { path: '/zones/' + encodeURIComponent(String(a.zone_id)) + '/workers/routes', pairs: [] };
    }, 'array'),
    'cloudflare.list_workers': readHandler('cloudflare.list_workers', EMPTY_PARAMS, function(a, ctx) {
      return accountRequest(ctx, '/workers/scripts');
    }, 'array'),
    'cloudflare.list_zones': readHandler('cloudflare.list_zones', LIST_ZONES_PARAMS, function(a) {
      return {
        path: '/zones',
        pairs: [
          ['name', a.name],
          ['status', a.status],
          ['page', a.page === undefined ? 1 : a.page],
          ['per_page', a.per_page === undefined ? 20 : a.per_page]
        ]
      };
    }, 'array')
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
          descriptor: { slug: slug, service: CLOUDFLARE_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerCloudflare = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
