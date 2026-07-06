(function (global) {
  'use strict';

  /**
   * Glama React Router loader-data READ head.
   *
   * Glama exposes reviewed catalog, gateway, project, and chat reads through
   * first-party React Router loader state on https://glama.ai. The handler keeps
   * direct network and credential access out of the module; reads dispatch through
   * the bounded MAIN-world page-read primitive, which origin-pins the active tab.
   */

  var ORIGIN = 'https://glama.ai';
  var SERVICE = 'glama.ai';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  var EMPTY_PARAMS = schema({}, []);
  var UID_PARAMS = schema({
    uid: stringField('Chat session UID')
  }, ['uid']);
  var SERVER_PARAMS = schema({
    namespace: stringField('Owner/namespace slug of the server'),
    slug: stringField('Server slug')
  }, ['namespace', 'slug']);
  var CATEGORY_PARAMS = schema({
    slug: stringField('Category slug')
  }, ['slug']);
  var POPULAR_PARAMS = schema({
    sort: {
      type: 'string',
      enum: ['popularity:desc', 'recently-added:desc', 'name:asc'],
      description: 'Sort order for the listing'
    }
  }, []);
  var SEARCH_SERVERS_PARAMS = schema({
    q: stringField('Search query to find MCP servers'),
    sort: {
      type: 'string',
      enum: ['search-relevance:desc', 'popularity:desc', 'recently-added:desc', 'name:asc'],
      description: 'Sort order for results'
    }
  }, ['q']);
  var SEARCH_TOOLS_PARAMS = schema({
    q: stringField('Search query to find MCP tools')
  }, ['q']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function stringField(description) {
    return { type: 'string', minLength: 1, description: description };
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
    return typedRecipeError(FALLBACK_CODE, {
      slug: slug,
      reason: reason || 'glama-page-read-unavailable',
      fellBackToDom: true
    });
  }

  function readHandler(slug, params, action) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
          return fallback(slug, 'glama-page-read-primitive-unavailable');
        }
        var out = await ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'glama',
          action: action,
          args: args || {}
        }, ctx.tabId);
        return out || fallback(slug, 'glama-page-read-no-result');
      }
    };
  }

  var handlers = {
    'glama.get_chat_session': readHandler('glama.get_chat_session', UID_PARAMS, 'get_chat_session'),
    'glama.get_current_user': readHandler('glama.get_current_user', EMPTY_PARAMS, 'get_current_user'),
    'glama.get_server': readHandler('glama.get_server', SERVER_PARAMS, 'get_server'),
    'glama.get_server_score': readHandler('glama.get_server_score', SERVER_PARAMS, 'get_server_score'),
    'glama.list_available_models': readHandler('glama.list_available_models', EMPTY_PARAMS, 'list_available_models'),
    'glama.list_gateway_models': readHandler('glama.list_gateway_models', EMPTY_PARAMS, 'list_gateway_models'),
    'glama.list_mcp_clients': readHandler('glama.list_mcp_clients', EMPTY_PARAMS, 'list_mcp_clients'),
    'glama.list_popular_servers': readHandler('glama.list_popular_servers', POPULAR_PARAMS, 'list_popular_servers'),
    'glama.list_projects': readHandler('glama.list_projects', EMPTY_PARAMS, 'list_projects'),
    'glama.list_recent_chats': readHandler('glama.list_recent_chats', EMPTY_PARAMS, 'list_recent_chats'),
    'glama.list_server_categories': readHandler('glama.list_server_categories', EMPTY_PARAMS, 'list_server_categories'),
    'glama.list_server_tools': readHandler('glama.list_server_tools', SERVER_PARAMS, 'list_server_tools'),
    'glama.list_servers_by_category': readHandler('glama.list_servers_by_category', CATEGORY_PARAMS, 'list_servers_by_category'),
    'glama.search_servers': readHandler('glama.search_servers', SEARCH_SERVERS_PARAMS, 'search_servers'),
    'glama.search_tools': readHandler('glama.search_tools', SEARCH_TOOLS_PARAMS, 'search_tools')
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: ORIGIN,
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

  global.FsbHandlerGlama = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
