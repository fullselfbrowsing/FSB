(function (global) {
  'use strict';

  /**
   * Phase 48 (T1R-06/T1R-07) -- Vercel same-origin READ head.
   *
   * The vendored Vercel runtime builds requests against the first-party /api path
   * on vercel.com and relies on the browser session cookie. This module ports only
   * non-mutating GET reads and leaves environment-variable reads out of the T1 batch.
   */

  var VERCEL_ORIGIN = 'https://vercel.com';
  var VERCEL_API_BASE = VERCEL_ORIGIN + '/api';

  var GET_USER_PARAMS = {
    type: 'object',
    properties: {},
    additionalProperties: false
  };
  var LIST_TEAMS_PARAMS = {
    type: 'object',
    properties: {
      limit: { type: 'number' },
      since: { type: 'string' }
    },
    additionalProperties: false
  };
  var LIST_PROJECTS_PARAMS = {
    type: 'object',
    properties: {
      limit: { type: 'number' },
      from: { type: 'string' },
      search: { type: 'string' }
    },
    additionalProperties: false
  };
  var GET_PROJECT_PARAMS = {
    type: 'object',
    properties: { project: { type: 'string' } },
    required: ['project'],
    additionalProperties: false
  };
  var LIST_DEPLOYMENTS_PARAMS = {
    type: 'object',
    properties: {
      project: { type: 'string' },
      target: { type: 'string', enum: ['production', 'preview'] },
      state: { type: 'string', enum: ['BUILDING', 'ERROR', 'INITIALIZING', 'QUEUED', 'READY', 'CANCELED'] },
      limit: { type: 'number' },
      from: { type: 'string' }
    },
    additionalProperties: false
  };
  var GET_DEPLOYMENT_PARAMS = {
    type: 'object',
    properties: { deployment_id: { type: 'string' } },
    required: ['deployment_id'],
    additionalProperties: false
  };
  var LIST_DOMAINS_PARAMS = {
    type: 'object',
    properties: { project: { type: 'string' } },
    required: ['project'],
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
      origin: VERCEL_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeVercelError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string'
        || typeof data.message === 'string'
        || (!!data.error && typeof data.error === 'object'));
  }

  function hasAnyKey(data, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(data, keys[i])) { return true; }
    }
    return false;
  }

  function guardObject(result, slug, keys) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeVercelError(data)
      && hasAnyKey(data, keys);
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'vercel-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  function guardCollection(result, slug, key) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && Array.isArray(data[key])
      && !looksLikeVercelError(data);
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'vercel-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  var handlers = {
    'vercel.get_user': {
      tier: 'T1a',
      origin: VERCEL_ORIGIN,
      sideEffectClass: 'read',
      params: GET_USER_PARAMS,
      async handle(args, ctx) {
        var res = await ctx.executeBoundSpec(buildGetSpec(VERCEL_API_BASE + '/www/user'), ctx.tabId);
        return guardObject(res, 'vercel.get_user', ['user', 'uid', 'email', 'username']);
      }
    },

    'vercel.list_teams': {
      tier: 'T1a',
      origin: VERCEL_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_TEAMS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = VERCEL_API_BASE + '/v2/teams' + buildQuery([
          ['limit', a.limit],
          ['since', a.since]
        ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardCollection(res, 'vercel.list_teams', 'teams');
      }
    },

    'vercel.list_projects': {
      tier: 'T1a',
      origin: VERCEL_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_PROJECTS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = VERCEL_API_BASE + '/v9/projects' + buildQuery([
          ['limit', a.limit],
          ['from', a.from],
          ['search', a.search]
        ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardCollection(res, 'vercel.list_projects', 'projects');
      }
    },

    'vercel.get_project': {
      tier: 'T1a',
      origin: VERCEL_ORIGIN,
      sideEffectClass: 'read',
      params: GET_PROJECT_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = VERCEL_API_BASE + '/v9/projects/' + encodeURIComponent(String(a.project));
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardObject(res, 'vercel.get_project', ['id', 'name']);
      }
    },

    'vercel.list_deployments': {
      tier: 'T1a',
      origin: VERCEL_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_DEPLOYMENTS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = VERCEL_API_BASE + '/v6/deployments' + buildQuery([
          ['limit', a.limit],
          ['from', a.from],
          ['projectId', a.project],
          ['target', a.target],
          ['state', a.state]
        ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardCollection(res, 'vercel.list_deployments', 'deployments');
      }
    },

    'vercel.get_deployment': {
      tier: 'T1a',
      origin: VERCEL_ORIGIN,
      sideEffectClass: 'read',
      params: GET_DEPLOYMENT_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = VERCEL_API_BASE + '/v13/deployments/' + encodeURIComponent(String(a.deployment_id));
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardObject(res, 'vercel.get_deployment', ['uid', 'id', 'name', 'url']);
      }
    },

    'vercel.list_domains': {
      tier: 'T1a',
      origin: VERCEL_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_DOMAINS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = VERCEL_API_BASE + '/v9/projects/' + encodeURIComponent(String(a.project)) + '/domains';
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardCollection(res, 'vercel.list_domains', 'domains');
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
          descriptor: { slug: slug, service: 'vercel.com', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerVercel = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
