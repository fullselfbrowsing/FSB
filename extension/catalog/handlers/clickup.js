(function (global) {
  'use strict';

  /**
   * ClickUp page-bearer read head.
   *
   * ClickUp's web app exposes the workspace API base in page localStorage and its
   * session JWT in page runtime state. This handler stays network-free and
   * storage-free; reviewed reads route through the bounded MAIN-world page-read
   * primitive so bearer material never leaves the page context.
   */

  var ORIGIN = 'https://app.clickup.com';
  var SERVICE = 'app.clickup.com';

  var EMPTY_PARAMS = schema({}, []);
  var WORKSPACE_PARAMS = schema({
    workspace_id: stringField('Workspace ID. Defaults to the current workspace.')
  }, []);
  var SPACE_ID_PARAMS = schema({
    space_id: stringField('Space ID')
  }, ['space_id']);
  var FOLDER_ID_PARAMS = schema({
    folder_id: stringField('Folder ID')
  }, ['folder_id']);
  var LIST_ID_PARAMS = schema({
    list_id: stringField('List ID')
  }, ['list_id']);
  var FOLDERS_PARAMS = schema({
    space_id: stringField('Space ID to list folders for'),
    include_archived: boolField('Whether to include archived folders')
  }, ['space_id']);
  var LISTS_PARAMS = schema({
    folder_id: stringField('Folder ID to list lists for'),
    include_archived: boolField('Whether to include archived lists')
  }, ['folder_id']);
  var SPACES_PARAMS = schema({
    workspace_id: stringField('Workspace ID. Defaults to the current workspace.'),
    include_archived: boolField('Whether to include archived spaces')
  }, []);

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

  function boolField(description) {
    return { type: 'boolean', description: description };
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

  function readHandler(slug, params, action) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
          return fallback(slug, 'clickup-page-read-primitive-unavailable');
        }
        return ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'clickup',
          action: action,
          args: args || {}
        }, ctx.tabId);
      }
    };
  }

  var handlers = {
    'clickup.get_current_user': readHandler('clickup.get_current_user', EMPTY_PARAMS, 'get_current_user'),
    'clickup.get_custom_fields': readHandler('clickup.get_custom_fields', WORKSPACE_PARAMS, 'get_custom_fields'),
    'clickup.get_folder': readHandler('clickup.get_folder', FOLDER_ID_PARAMS, 'get_folder'),
    'clickup.get_folders': readHandler('clickup.get_folders', FOLDERS_PARAMS, 'get_folders'),
    'clickup.get_goals': readHandler('clickup.get_goals', WORKSPACE_PARAMS, 'get_goals'),
    'clickup.get_list': readHandler('clickup.get_list', LIST_ID_PARAMS, 'get_list'),
    'clickup.get_lists': readHandler('clickup.get_lists', LISTS_PARAMS, 'get_lists'),
    'clickup.get_space': readHandler('clickup.get_space', SPACE_ID_PARAMS, 'get_space'),
    'clickup.get_spaces': readHandler('clickup.get_spaces', SPACES_PARAMS, 'get_spaces'),
    'clickup.get_workspace': readHandler('clickup.get_workspace', WORKSPACE_PARAMS, 'get_workspace'),
    'clickup.get_workspace_members': readHandler('clickup.get_workspace_members', WORKSPACE_PARAMS, 'get_workspace_members')
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

  global.FsbHandlerClickup = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
