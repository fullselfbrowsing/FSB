(function (global) {
  'use strict';

  /**
   * Phase 51 (T1 full-tail migration) -- Retool same-origin READ head.
   *
   * The selected Retool reads use first-party relative /api paths on retool.com.
   * Retool's internal API expects an X-Xsrf-Token header sourced from the xsrfToken
   * cookie, so specs use executeBoundSpec's existing cookie csrfSource path and do
   * not read or log the token in this handler.
   */

  var RETOOL_ORIGIN = 'https://retool.com';
  var RETOOL_API_BASE = RETOOL_ORIGIN + '/api';

  var EMPTY_PARAMS = {
    type: 'object',
    properties: {},
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

  function buildGetSpec(url) {
    return {
      url: url,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      csrfSource: { from: 'cookie', selector: 'xsrfToken', header: 'X-Xsrf-Token' },
      origin: RETOOL_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeRetoolError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string'
        || (!!data.error && typeof data.error === 'object')
        || typeof data.message === 'string'
        || typeof data.statusCode === 'number');
  }

  function fallback(slug) {
    return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
      slug: slug,
      reason: 'retool-logged-out-or-rot',
      fellBackToDom: true
    });
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasArray(data, key) {
    return Object.prototype.hasOwnProperty.call(data, key) && Array.isArray(data[key]);
  }

  function guardObject(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    if (!isPlainObject(data) || looksLikeRetoolError(data)) { return fallback(slug); }
    return result;
  }

  function guardObjectKey(result, slug, key) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = isPlainObject(data)
      && !looksLikeRetoolError(data)
      && Object.prototype.hasOwnProperty.call(data, key)
      && data[key] !== null
      && typeof data[key] === 'object';
    return ok ? result : fallback(slug);
  }

  function guardArray(result, slug) {
    if (!result || result.success !== true) { return result; }
    return Array.isArray(result.data) ? result : fallback(slug);
  }

  function guardArrays(result, slug, keys) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    if (!isPlainObject(data) || looksLikeRetoolError(data)) { return fallback(slug); }
    for (var i = 0; i < keys.length; i++) {
      if (hasArray(data, keys[i])) { return result; }
    }
    return fallback(slug);
  }

  function readHandler(slug, path, guard) {
    return {
      tier: 'T1a',
      origin: RETOOL_ORIGIN,
      sideEffectClass: 'read',
      params: EMPTY_PARAMS,
      async handle(args, ctx) {
        var res = await ctx.executeBoundSpec(buildGetSpec(RETOOL_API_BASE + path), ctx.tabId);
        return guard(res, slug);
      }
    };
  }

  var handlers = {
    'retool.get_current_user': readHandler('retool.get_current_user', '/user', function (res, slug) {
      return guardObjectKey(res, slug, 'user');
    }),
    'retool.get_organization': readHandler('retool.get_organization', '/organization', function (res, slug) {
      return guardObjectKey(res, slug, 'org');
    }),
    'retool.get_source_control_settings': readHandler('retool.get_source_control_settings', '/sourceControl/settings', function (res, slug) {
      return guardObjectKey(res, slug, 'settings');
    }),
    'retool.get_workflow_run_count': readHandler('retool.get_workflow_run_count', '/workflowRun/getCountByWorkflow', function (res, slug) {
      return guardObjectKey(res, slug, 'workflowRunsCountByWorkflow');
    }),
    'retool.get_workflows_config': readHandler('retool.get_workflows_config', '/workflow/workflowsConfiguration', guardObject),
    'retool.list_agents': readHandler('retool.list_agents', '/agents', function (res, slug) {
      return guardArrays(res, slug, ['agents']);
    }),
    'retool.list_apps': readHandler('retool.list_apps', '/pages', function (res, slug) {
      return guardArrays(res, slug, ['pages', 'folders']);
    }),
    'retool.list_branches': readHandler('retool.list_branches', '/branches', function (res, slug) {
      return guardArrays(res, slug, ['branches']);
    }),
    'retool.list_environments': readHandler('retool.list_environments', '/environments', function (res, slug) {
      return guardArrays(res, slug, ['environments']);
    }),
    'retool.list_experiments': readHandler('retool.list_experiments', '/experiments', guardObject),
    'retool.list_grids': readHandler('retool.list_grids', '/grid', guardArray),
    'retool.list_page_names': readHandler('retool.list_page_names', '/editor/pageNames', function (res, slug) {
      return guardArrays(res, slug, ['pageNames']);
    }),
    'retool.list_playground_queries': readHandler('retool.list_playground_queries', '/playground', function (res, slug) {
      return guardArrays(res, slug, ['userQueries', 'orgQueries']);
    }),
    'retool.list_resources': readHandler('retool.list_resources', '/resources', function (res, slug) {
      return guardArrays(res, slug, ['resources']);
    }),
    'retool.list_user_spaces': readHandler('retool.list_user_spaces', '/organization/userSpaces', function (res, slug) {
      return guardArrays(res, slug, ['userSpaces']);
    }),
    'retool.list_workflows': readHandler('retool.list_workflows', '/workflow/', function (res, slug) {
      return guardArrays(res, slug, ['workflowsMetadata', 'workflowFolders']);
    })
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
          descriptor: { slug: slug, service: 'retool.com', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerRetool = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
