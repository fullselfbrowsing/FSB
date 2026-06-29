(function (global) {
  'use strict';

  /**
   * Phase 46 (T1R-06) -- Bitbucket same-origin READ head.
   *
   * The selected Bitbucket reads are GET-only and use the vendored first-party
   * relative /!api/2.0 base. Mutating Bitbucket paths still require CSRF and remain
   * outside this phase; this module reads no cookies, page globals, or tokens.
   */

  var BITBUCKET_ORIGIN = 'https://bitbucket.org';
  var BITBUCKET_API_BASE = BITBUCKET_ORIGIN + '/!api/2.0';

  var LIST_WORKSPACES_PARAMS = {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: -9007199254740991, maximum: 9007199254740991 },
      pagelen: { type: 'integer', minimum: -9007199254740991, maximum: 9007199254740991 }
    },
    additionalProperties: false
  };
  var LIST_REPOSITORIES_PARAMS = {
    type: 'object',
    properties: {
      workspace: { type: 'string' },
      page: { type: 'integer', minimum: -9007199254740991, maximum: 9007199254740991 },
      pagelen: { type: 'integer', minimum: -9007199254740991, maximum: 9007199254740991 },
      query: { type: 'string' }
    },
    required: ['workspace'],
    additionalProperties: false
  };
  var GET_REPOSITORY_PARAMS = {
    type: 'object',
    properties: {
      workspace: { type: 'string' },
      repo_slug: { type: 'string' }
    },
    required: ['workspace', 'repo_slug'],
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

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < pairs.length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
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
      origin: BITBUCKET_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeBitbucketError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (data.type === 'error' || Object.prototype.hasOwnProperty.call(data, 'error'));
  }

  function guardPage(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && Array.isArray(data.values)
      && !looksLikeBitbucketError(data);
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'bitbucket-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  function guardObject(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeBitbucketError(data)
      && (Object.prototype.hasOwnProperty.call(data, 'uuid')
        || Object.prototype.hasOwnProperty.call(data, 'slug')
        || Object.prototype.hasOwnProperty.call(data, 'name'));
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'bitbucket-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  var handlers = {
    'bitbucket.list_workspaces': {
      tier: 'T1a',
      origin: BITBUCKET_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_WORKSPACES_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = BITBUCKET_API_BASE + '/workspaces' + buildQuery([
          ['page', a.page],
          ['pagelen', a.pagelen]
        ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardPage(res, 'bitbucket.list_workspaces');
      }
    },

    'bitbucket.list_repositories': {
      tier: 'T1a',
      origin: BITBUCKET_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_REPOSITORIES_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = BITBUCKET_API_BASE + '/repositories/' + encodeURIComponent(String(a.workspace)) +
          buildQuery([
            ['page', a.page],
            ['pagelen', a.pagelen],
            ['q', a.query]
          ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardPage(res, 'bitbucket.list_repositories');
      }
    },

    'bitbucket.get_repository': {
      tier: 'T1a',
      origin: BITBUCKET_ORIGIN,
      sideEffectClass: 'read',
      params: GET_REPOSITORY_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = BITBUCKET_API_BASE + '/repositories/' +
          encodeURIComponent(String(a.workspace)) + '/' + encodeURIComponent(String(a.repo_slug));
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardObject(res, 'bitbucket.get_repository');
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
          descriptor: { slug: slug, service: 'bitbucket.org', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerBitbucket = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
