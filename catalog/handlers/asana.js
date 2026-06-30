(function (global) {
  'use strict';

  /**
   * Asana same-origin READ head.
   *
   * The vendored Asana runtime uses https://app.asana.com/api/1.0 with browser
   * session cookies. This handler ports read-only calls through executeBoundSpec;
   * it does not script the page, read cookies, or perform direct network calls.
   */

  var ASANA_ORIGIN = 'https://app.asana.com';
  var ASANA_API_BASE = ASANA_ORIGIN + '/api/1.0';
  var TASK_OPT_FIELDS = [
    'gid',
    'name',
    'completed',
    'assignee.gid',
    'assignee.name',
    'due_on',
    'due_at',
    'start_on',
    'notes',
    'html_notes',
    'projects.gid',
    'projects.name',
    'tags.gid',
    'tags.name',
    'parent.gid',
    'num_subtasks',
    'created_at',
    'modified_at',
    'permalink_url',
    'resource_subtype'
  ].join(',');
  var PROJECT_OPT_FIELDS = 'gid,name,notes,html_notes,color,archived,created_at,modified_at,permalink_url,owner.gid,owner.name,current_status';
  var SECTION_OPT_FIELDS = 'gid,name,created_at';
  var STORY_OPT_FIELDS = 'gid,type,text,html_text,created_at,created_by.gid,created_by.name,resource_subtype';

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

  function buildGetSpec(path, pairs) {
    return {
      url: ASANA_API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ASANA_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeAsanaError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (Array.isArray(data.errors)
        || typeof data.error === 'string'
        || typeof data.message === 'string');
  }

  function guardData(result, slug, kind) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var payload = data && typeof data === 'object' ? data.data : undefined;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeAsanaError(data)
      && (kind === 'array' ? Array.isArray(payload) : !!payload && typeof payload === 'object' && !Array.isArray(payload));
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'asana-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };
  var GID = { type: 'string', minLength: 1 };
  var PAGING = {
    limit: { type: 'integer', minimum: 1, maximum: 100 },
    offset: { type: 'string' }
  };
  function withProps(properties, required) {
    return {
      type: 'object',
      properties: properties,
      required: required || [],
      additionalProperties: false
    };
  }

  var handlers = {
    'asana.get_current_user': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: EMPTY_PARAMS,
      async handle(args, ctx) {
        var res = await ctx.executeBoundSpec(buildGetSpec('/users/me', [
          ['opt_fields', 'name,email,workspaces.gid,workspaces.name']
        ]), ctx.tabId);
        return guardData(res, 'asana.get_current_user', 'object');
      }
    },

    'asana.list_workspaces': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: EMPTY_PARAMS,
      async handle(args, ctx) {
        var res = await ctx.executeBoundSpec(buildGetSpec('/workspaces'), ctx.tabId);
        return guardData(res, 'asana.list_workspaces', 'array');
      }
    },

    'asana.list_projects': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: withProps(Object.assign({
        workspace_gid: GID,
        archived: { type: 'boolean' }
      }, PAGING), ['workspace_gid']),
      async handle(args, ctx) {
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec('/projects', [
          ['workspace', a.workspace_gid],
          ['opt_fields', PROJECT_OPT_FIELDS],
          ['limit', a.limit === undefined ? 20 : a.limit],
          ['archived', a.archived],
          ['offset', a.offset]
        ]), ctx.tabId);
        return guardData(res, 'asana.list_projects', 'array');
      }
    },

    'asana.get_project': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: withProps({ project_gid: GID }, ['project_gid']),
      async handle(args, ctx) {
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec('/projects/' + encodeURIComponent(String(a.project_gid)), [
          ['opt_fields', PROJECT_OPT_FIELDS]
        ]), ctx.tabId);
        return guardData(res, 'asana.get_project', 'object');
      }
    },

    'asana.list_sections': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: withProps({ project_gid: GID }, ['project_gid']),
      async handle(args, ctx) {
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec('/projects/' + encodeURIComponent(String(a.project_gid)) + '/sections', [
          ['opt_fields', SECTION_OPT_FIELDS]
        ]), ctx.tabId);
        return guardData(res, 'asana.list_sections', 'array');
      }
    },

    'asana.list_tags': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: withProps(Object.assign({ workspace_gid: GID }, PAGING), ['workspace_gid']),
      async handle(args, ctx) {
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec('/workspaces/' + encodeURIComponent(String(a.workspace_gid)) + '/tags', [
          ['opt_fields', 'name,color'],
          ['limit', a.limit === undefined ? 20 : a.limit],
          ['offset', a.offset]
        ]), ctx.tabId);
        return guardData(res, 'asana.list_tags', 'array');
      }
    },

    'asana.list_teams': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: withProps(Object.assign({ workspace_gid: GID }, PAGING), ['workspace_gid']),
      async handle(args, ctx) {
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec('/workspaces/' + encodeURIComponent(String(a.workspace_gid)) + '/teams', [
          ['opt_fields', 'name,description'],
          ['limit', a.limit === undefined ? 20 : a.limit],
          ['offset', a.offset]
        ]), ctx.tabId);
        return guardData(res, 'asana.list_teams', 'array');
      }
    },

    'asana.list_users_for_workspace': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: withProps(Object.assign({ workspace_gid: GID }, PAGING), ['workspace_gid']),
      async handle(args, ctx) {
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec('/workspaces/' + encodeURIComponent(String(a.workspace_gid)) + '/users', [
          ['opt_fields', 'name,email'],
          ['limit', a.limit === undefined ? 20 : a.limit],
          ['offset', a.offset]
        ]), ctx.tabId);
        return guardData(res, 'asana.list_users_for_workspace', 'array');
      }
    },

    'asana.get_task': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: withProps({
        task_gid: GID,
        opt_fields: { type: 'string' }
      }, ['task_gid']),
      async handle(args, ctx) {
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec('/tasks/' + encodeURIComponent(String(a.task_gid)), [
          ['opt_fields', a.opt_fields || TASK_OPT_FIELDS]
        ]), ctx.tabId);
        return guardData(res, 'asana.get_task', 'object');
      }
    },

    'asana.get_tasks_for_project': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: withProps(Object.assign({ project_gid: GID }, PAGING), ['project_gid']),
      async handle(args, ctx) {
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec('/projects/' + encodeURIComponent(String(a.project_gid)) + '/tasks', [
          ['opt_fields', TASK_OPT_FIELDS],
          ['limit', a.limit === undefined ? 20 : a.limit],
          ['offset', a.offset]
        ]), ctx.tabId);
        return guardData(res, 'asana.get_tasks_for_project', 'array');
      }
    },

    'asana.get_tasks_for_section': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: withProps(Object.assign({ section_gid: GID }, PAGING), ['section_gid']),
      async handle(args, ctx) {
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec('/sections/' + encodeURIComponent(String(a.section_gid)) + '/tasks', [
          ['opt_fields', TASK_OPT_FIELDS],
          ['limit', a.limit === undefined ? 20 : a.limit],
          ['offset', a.offset]
        ]), ctx.tabId);
        return guardData(res, 'asana.get_tasks_for_section', 'array');
      }
    },

    'asana.get_subtasks': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: withProps(Object.assign({ task_gid: GID }, PAGING), ['task_gid']),
      async handle(args, ctx) {
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec('/tasks/' + encodeURIComponent(String(a.task_gid)) + '/subtasks', [
          ['opt_fields', TASK_OPT_FIELDS],
          ['limit', a.limit === undefined ? 20 : a.limit],
          ['offset', a.offset]
        ]), ctx.tabId);
        return guardData(res, 'asana.get_subtasks', 'array');
      }
    },

    'asana.get_stories_for_task': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: withProps(Object.assign({ task_gid: GID }, PAGING), ['task_gid']),
      async handle(args, ctx) {
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec('/tasks/' + encodeURIComponent(String(a.task_gid)) + '/stories', [
          ['opt_fields', STORY_OPT_FIELDS],
          ['limit', a.limit === undefined ? 20 : a.limit],
          ['offset', a.offset]
        ]), ctx.tabId);
        return guardData(res, 'asana.get_stories_for_task', 'array');
      }
    },

    'asana.get_user': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: withProps({ user_gid: GID }, ['user_gid']),
      async handle(args, ctx) {
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec('/users/' + encodeURIComponent(String(a.user_gid)), [
          ['opt_fields', 'name,email']
        ]), ctx.tabId);
        return guardData(res, 'asana.get_user', 'object');
      }
    },

    'asana.search_tasks': {
      tier: 'T1a',
      origin: ASANA_ORIGIN,
      sideEffectClass: 'read',
      params: withProps({
        workspace_gid: GID,
        text: { type: 'string' },
        assignee_gid: { type: 'string' },
        completed: { type: 'boolean' },
        due_on_before: { type: 'string' },
        due_on_after: { type: 'string' },
        projects_any: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100 }
      }, ['workspace_gid']),
      async handle(args, ctx) {
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec('/workspaces/' + encodeURIComponent(String(a.workspace_gid)) + '/tasks/search', [
          ['opt_fields', TASK_OPT_FIELDS],
          ['limit', a.limit === undefined ? 20 : a.limit],
          ['text', a.text],
          ['assignee.any', a.assignee_gid],
          ['completed', a.completed],
          ['due_on.before', a.due_on_before],
          ['due_on.after', a.due_on_after],
          ['projects.any', a.projects_any]
        ]), ctx.tabId);
        return guardData(res, 'asana.search_tasks', 'array');
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
          descriptor: { slug: slug, service: 'app.asana.com', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerAsana = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
