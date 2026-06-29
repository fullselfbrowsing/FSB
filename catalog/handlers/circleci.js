(function (global) {
  'use strict';

  /**
   * Phase 46 (T1R-06) -- CircleCI same-origin READ head.
   *
   * The selected CircleCI reads use the vendored first-party relative /api/v2 base and
   * HttpOnly session cookies on app.circleci.com. This module builds only GET bound
   * specs; triggering pipelines or other mutating operations remain out of scope.
   */

  var CIRCLECI_ORIGIN = 'https://app.circleci.com';
  var CIRCLECI_API_BASE = CIRCLECI_ORIGIN + '/api/v2';

  var GET_CURRENT_USER_PARAMS = {
    type: 'object',
    properties: {},
    additionalProperties: false
  };
  var LIST_PIPELINES_PARAMS = {
    type: 'object',
    properties: {
      project_slug: { type: 'string' },
      branch: { type: 'string' },
      mine: { type: 'boolean' },
      page_token: { type: 'string' }
    },
    required: ['project_slug'],
    additionalProperties: false
  };
  var GET_PROJECT_PARAMS = {
    type: 'object',
    properties: { project_slug: { type: 'string' } },
    required: ['project_slug'],
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

  function encodePathPreservingSlash(value) {
    return String(value).split('/').map(function (part) {
      return encodeURIComponent(part);
    }).join('/');
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
      origin: CIRCLECI_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeCircleciError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.message === 'string' || typeof data.error === 'string');
  }

  function guardObject(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeCircleciError(data)
      && (Object.prototype.hasOwnProperty.call(data, 'id')
        || Object.prototype.hasOwnProperty.call(data, 'login')
        || Object.prototype.hasOwnProperty.call(data, 'slug'));
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'circleci-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  function guardItems(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && Array.isArray(data.items)
      && !looksLikeCircleciError(data);
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'circleci-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  var handlers = {
    'circleci.get_current_user': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_CURRENT_USER_PARAMS,
      async handle(args, ctx) {
        var res = await ctx.executeBoundSpec(buildGetSpec(CIRCLECI_API_BASE + '/me'), ctx.tabId);
        return guardObject(res, 'circleci.get_current_user');
      }
    },

    'circleci.list_pipelines': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_PIPELINES_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var project = encodePathPreservingSlash(a.project_slug);
        var url = CIRCLECI_API_BASE + '/project/' + project + '/pipeline' + buildQuery([
          ['branch', a.branch],
          ['mine', a.mine],
          ['page-token', a.page_token]
        ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardItems(res, 'circleci.list_pipelines');
      }
    },

    'circleci.get_project': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_PROJECT_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/project/' + encodePathPreservingSlash(a.project_slug);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardObject(res, 'circleci.get_project');
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
          descriptor: { slug: slug, service: 'app.circleci.com', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerCircleci = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
