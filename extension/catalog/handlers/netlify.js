(function (global) {
  'use strict';

  /**
   * Phase 46 (T1R-06) -- Netlify same-origin READ head.
   *
   * Ports the first low-risk Netlify read batch from the OpenTabs descriptor tail to
   * executable T1a. The vendored Netlify runtime uses first-party relative paths under
   * /access-control/bb-api/api/v1 with HttpOnly session cookies, so each bound spec is
   * pinned to https://app.netlify.com and no token is read or logged here.
   */

  var NETLIFY_ORIGIN = 'https://app.netlify.com';
  var NETLIFY_API_BASE = NETLIFY_ORIGIN + '/access-control/bb-api/api/v1';

  var LIST_SITES_PARAMS = {
    type: 'object',
    properties: {
      account_slug: { type: 'string' },
      name: { type: 'string' },
      page: { type: 'number' },
      per_page: { type: 'number' }
    },
    required: ['account_slug'],
    additionalProperties: false
  };
  var GET_SITE_PARAMS = {
    type: 'object',
    properties: { site_id: { type: 'string' } },
    required: ['site_id'],
    additionalProperties: false
  };
  var LIST_DEPLOYS_PARAMS = {
    type: 'object',
    properties: {
      site_id: { type: 'string' },
      page: { type: 'number' },
      per_page: { type: 'number' }
    },
    required: ['site_id'],
    additionalProperties: false
  };
  var LIST_FORMS_PARAMS = {
    type: 'object',
    properties: { site_id: { type: 'string' } },
    required: ['site_id'],
    additionalProperties: false
  };

  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  function buildQuery(args, keys) {
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = args[key];
      if (value === undefined || value === null) { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? ('?' + parts.join('&')) : '';
  }

  function buildGetSpec(url) {
    return {
      url: url,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: NETLIFY_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeNetlifyError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string' || typeof data.message === 'string');
  }

  function guardArray(result, slug) {
    if (!result || result.success !== true) { return result; }
    if (!Array.isArray(result.data)) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'netlify-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  function guardObject(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeNetlifyError(data)
      && (Object.prototype.hasOwnProperty.call(data, 'id')
        || Object.prototype.hasOwnProperty.call(data, 'name'));
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'netlify-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  var handlers = {
    'netlify.list_sites': {
      tier: 'T1a',
      origin: NETLIFY_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_SITES_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var path = '/' + encodeURIComponent(String(a.account_slug)) + '/sites';
        var url = NETLIFY_API_BASE + path + buildQuery(a, ['page', 'per_page', 'name']);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardArray(res, 'netlify.list_sites');
      }
    },

    'netlify.get_site': {
      tier: 'T1a',
      origin: NETLIFY_ORIGIN,
      sideEffectClass: 'read',
      params: GET_SITE_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = NETLIFY_API_BASE + '/sites/' + encodeURIComponent(String(a.site_id));
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardObject(res, 'netlify.get_site');
      }
    },

    'netlify.list_deploys': {
      tier: 'T1a',
      origin: NETLIFY_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_DEPLOYS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = NETLIFY_API_BASE + '/sites/' + encodeURIComponent(String(a.site_id)) +
          '/deploys' + buildQuery(a, ['page', 'per_page']);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardArray(res, 'netlify.list_deploys');
      }
    },

    'netlify.list_forms': {
      tier: 'T1a',
      origin: NETLIFY_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_FORMS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = NETLIFY_API_BASE + '/sites/' + encodeURIComponent(String(a.site_id)) + '/forms';
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardArray(res, 'netlify.list_forms');
      }
    }
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
          descriptor: { slug: slug, service: 'app.netlify.com', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerNetlify = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
