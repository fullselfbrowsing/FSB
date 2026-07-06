(function (global) {
  'use strict';

  /**
   * Figma same-origin API READ head.
   *
   * Figma's web app serves its internal API from the first-party
   * https://www.figma.com/api path. Read descriptors execute through
   * executeBoundSpec with same-origin credentials and shape guards. File/comment
   * mutations remain guarded fail-closed until live mutation-body UAT records the
   * exact request safety evidence.
   */

  var FIGMA_ORIGIN = 'https://www.figma.com';
  var FIGMA_SERVICE = 'figma.com';
  var API_BASE = FIGMA_ORIGIN + '/api';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  var EMPTY_PARAMS = schema({}, []);
  var FILE_KEY_PARAMS = schema({
    file_key: stringField('Figma file key')
  }, ['file_key']);
  var TEAM_PARAMS = schema({
    team_id: stringField('Figma team ID')
  }, ['team_id']);
  var FOLDER_PARAMS = schema({
    folder_id: stringField('Figma folder or project ID')
  }, ['folder_id']);
  var CREATE_FILE_PARAMS = schema({
    name: stringField('Name for the new file'),
    folder_id: stringField('Folder or project ID to create the file in'),
    editor_type: { type: 'string', description: 'Editor type: design, figjam, or slides' }
  }, ['name', 'folder_id']);
  var UPDATE_FILE_PARAMS = schema({
    file_key: stringField('Figma file key'),
    name: { type: 'string', description: 'New file name' },
    description: { type: 'string', description: 'New file description' }
  }, ['file_key']);
  var POST_COMMENT_PARAMS = schema({
    file_key: stringField('Figma file key'),
    message: stringField('Comment text to post')
  }, ['file_key', 'message']);

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
      reason: reason || 'figma-auth-or-shape-mismatch',
      fellBackToDom: true
    });
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value || ''));
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function apiSpec(path, pairs) {
    return {
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: FIGMA_ORIGIN,
      extract: '@'
    };
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function bool(value) {
    return value === true;
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function resultFailed(result) {
    var status = Number(result && result.status || 0);
    return !result || result.success !== true || result.redirected || status === 401 || status === 403 || status >= 400;
  }

  function looksLikeError(data) {
    return isObject(data) && (
      data.error === true ||
      typeof data.message === 'string' ||
      Array.isArray(data.errors) ||
      data.success === false
    );
  }

  function metaOf(data) {
    return isObject(data) && Object.prototype.hasOwnProperty.call(data, 'meta') ? data.meta : data;
  }

  function withData(result, data) {
    var out = {};
    for (var key in result) {
      if (Object.prototype.hasOwnProperty.call(result, key)) { out[key] = result[key]; }
    }
    out.data = data;
    return out;
  }

  function mapFile(f) {
    f = f || {};
    return {
      key: str(f.key),
      name: str(f.name),
      description: f.description === undefined ? null : f.description,
      editor_type: str(f.editor_type || 'design'),
      team_id: str(f.team_id),
      folder_id: str(f.folder_id),
      creator_id: str(f.creator_id),
      created_at: str(f.created_at),
      updated_at: str(f.updated_at),
      thumbnail_url: f.thumbnail_url === undefined ? null : f.thumbnail_url,
      url: str(f.url || f.edit_url),
      link_access: str(f.link_access),
      trashed_at: f.trashed_at === undefined ? null : f.trashed_at
    };
  }

  function mapUser(u) {
    u = u || {};
    return {
      id: str(u.id),
      name: str(u.name),
      handle: str(u.handle),
      email: str(u.email),
      img_url: str(u.img_url),
      created_at: str(u.created_at)
    };
  }

  function mapTeam(t) {
    t = t || {};
    return {
      id: str(t.id),
      name: str(t.name),
      description: t.description === undefined ? null : t.description,
      img_url: t.img_url === undefined ? null : t.img_url,
      created_at: str(t.created_at),
      editors: num(t.editors),
      is_paid: bool(t.is_paid)
    };
  }

  function mapProject(p) {
    p = p || {};
    return {
      id: str(p.id),
      name: str(p.name)
    };
  }

  function mapComponent(c) {
    c = c || {};
    return {
      key: str(c.key),
      name: str(c.name),
      description: str(c.description),
      node_id: str(c.node_id),
      thumbnail_url: c.thumbnail_url === undefined ? null : c.thumbnail_url,
      containing_frame: str(c.containing_frame && c.containing_frame.name),
      created_at: str(c.created_at),
      updated_at: str(c.updated_at)
    };
  }

  function mapVersion(v) {
    v = v || {};
    return {
      id: str(v.id),
      created_at: str(v.created_at),
      label: str(v.label),
      description: str(v.description),
      user_handle: str(v.user && v.user.handle)
    };
  }

  function mapComment(c) {
    c = c || {};
    return {
      id: str(c.id),
      message: str(c.message),
      user_id: str(c.user_id || (c.user && c.user.id)),
      user_handle: str(c.user_handle || (c.user && c.user.handle)),
      created_at: str(c.created_at),
      resolved_at: c.resolved_at === undefined ? null : c.resolved_at,
      parent_id: c.parent_id === undefined || c.parent_id === null ? null : str(c.parent_id)
    };
  }

  function mapRecentFile(r) {
    r = r || {};
    return {
      id: str(r.id),
      file_key: str(r.file_key || (r.fig_file && r.fig_file.key)),
      file_name: str(r.fig_file && r.fig_file.name),
      page_name: str(r.name),
      url: str(r.url),
      accessed_at: str(r.accessed_at),
      thumbnail_url: r.thumbnail_url === undefined ? null : r.thumbnail_url
    };
  }

  function parseApiData(result, slug) {
    if (resultFailed(result)) { return fallback(slug, 'figma-http-auth-or-rot'); }
    var data = result.data;
    if ((!isObject(data) && !Array.isArray(data)) || looksLikeError(data)) {
      return fallback(slug, 'figma-api-error-envelope');
    }
    return data;
  }

  async function callApi(slug, ctx, path, pairs) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'figma-execute-bound-spec-unavailable');
    }
    var result = await ctx.executeBoundSpec(apiSpec(path, pairs || []), ctx.tabId);
    var data = parseApiData(result, slug);
    if (data && data.success === false) { return data; }
    return { result: result, data: data };
  }

  async function bootstrapAuth(ctx, slug) {
    var api = await callApi(slug, ctx, '/session/state', []);
    if (!api || api.success === false) { return api; }
    var meta = metaOf(api.data);
    if (!isObject(meta)) { return fallback(slug, 'figma-session-state-missing'); }
    var users = list(meta.users);
    var teams = list(meta.teams);
    var user = users[0] || {};
    var fuid = str(user.id || meta.fuid);
    if (!fuid) { return fallback(slug, 'figma-session-user-missing'); }
    return {
      success: true,
      result: api.result,
      meta: meta,
      fuid: fuid,
      teamId: str((teams[0] && teams[0].id) || meta.team_id)
    };
  }

  function readHandler(slug, params, run) {
    return {
      tier: 'T1a',
      origin: FIGMA_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        try {
          return await run(args || {}, ctx || {}, slug);
        } catch (_err) {
          return fallback(slug, 'figma-handler-map-failed');
        }
      }
    };
  }

  function guarded(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: FIGMA_ORIGIN,
      sideEffectClass: 'write',
      params: params || EMPTY_PARAMS,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'figma.get_current_user': readHandler('figma.get_current_user', EMPTY_PARAMS, async function(_args, ctx, slug) {
      var auth = await bootstrapAuth(ctx, slug);
      if (!auth || auth.success !== true) { return auth; }
      var users = list(auth.meta.users);
      var me = users.filter(function(u) { return str(u.id) === auth.fuid; })[0] || users[0];
      if (!me) { return fallback(slug, 'figma-current-user-missing'); }
      return withData(auth.result, { user: mapUser(me) });
    }),
    'figma.list_teams': readHandler('figma.list_teams', EMPTY_PARAMS, async function(_args, ctx, slug) {
      var auth = await bootstrapAuth(ctx, slug);
      if (!auth || auth.success !== true) { return auth; }
      return withData(auth.result, { teams: list(auth.meta.teams).map(mapTeam) });
    }),
    'figma.get_team_info': readHandler('figma.get_team_info', TEAM_PARAMS, async function(args, ctx, slug) {
      var auth = await bootstrapAuth(ctx, slug);
      if (!auth || auth.success !== true) { return auth; }
      var api = await callApi(slug, ctx, '/user/state', [['team_id', args.team_id], ['fuid', auth.fuid]]);
      if (!api || api.success === false) { return api; }
      var meta = metaOf(api.data);
      var teams = list(isObject(meta) ? meta.teams : null);
      var team = teams.filter(function(t) { return str(t.id) === str(args.team_id); })[0] || teams[0];
      if (!team) { return fallback(slug, 'figma-team-missing'); }
      return withData(api.result, { team: mapTeam(team) });
    }),
    'figma.list_team_projects': readHandler('figma.list_team_projects', TEAM_PARAMS, async function(args, ctx, slug) {
      var api = await callApi(slug, ctx, '/teams/' + encodeSegment(args.team_id) + '/projects', []);
      if (!api || api.success === false) { return api; }
      var meta = metaOf(api.data);
      return withData(api.result, { projects: list(isObject(meta) ? meta.projects : null).map(mapProject) });
    }),
    'figma.list_files': readHandler('figma.list_files', FOLDER_PARAMS, async function(args, ctx, slug) {
      var auth = await bootstrapAuth(ctx, slug);
      if (!auth || auth.success !== true) { return auth; }
      var api = await callApi(slug, ctx, '/folders/' + encodeSegment(args.folder_id) + '/files', [['fuid', auth.fuid]]);
      if (!api || api.success === false) { return api; }
      var meta = metaOf(api.data);
      return withData(api.result, { files: list(isObject(meta) ? meta.files : null).map(mapFile) });
    }),
    'figma.get_file': readHandler('figma.get_file', FILE_KEY_PARAMS, async function(args, ctx, slug) {
      var api = await callApi(slug, ctx, '/files/' + encodeSegment(args.file_key) + '/meta', []);
      if (!api || api.success === false) { return api; }
      return withData(api.result, { file: mapFile(metaOf(api.data)) });
    }),
    'figma.get_file_components': readHandler('figma.get_file_components', FILE_KEY_PARAMS, async function(args, ctx, slug) {
      var api = await callApi(slug, ctx, '/files/' + encodeSegment(args.file_key) + '/components', []);
      if (!api || api.success === false) { return api; }
      var meta = metaOf(api.data);
      return withData(api.result, { components: list(isObject(meta) ? meta.components : null).map(mapComponent) });
    }),
    'figma.list_file_versions': readHandler('figma.list_file_versions', FILE_KEY_PARAMS, async function(args, ctx, slug) {
      var api = await callApi(slug, ctx, '/files/' + encodeSegment(args.file_key) + '/versions', []);
      if (!api || api.success === false) { return api; }
      var meta = metaOf(api.data);
      return withData(api.result, { versions: list(isObject(meta) ? meta.versions : null).map(mapVersion) });
    }),
    'figma.list_comments': readHandler('figma.list_comments', FILE_KEY_PARAMS, async function(args, ctx, slug) {
      var api = await callApi(slug, ctx, '/file/' + encodeSegment(args.file_key) + '/comments', []);
      if (!api || api.success === false) { return api; }
      return withData(api.result, { comments: list(metaOf(api.data)).map(mapComment) });
    }),
    'figma.list_recent_files': readHandler('figma.list_recent_files', EMPTY_PARAMS, async function(_args, ctx, slug) {
      var auth = await bootstrapAuth(ctx, slug);
      if (!auth || auth.success !== true) { return auth; }
      var api = await callApi(slug, ctx, '/recent_prototypes', [
        ['is_global', true],
        ['include_repo', true],
        ['fuid', auth.fuid]
      ]);
      if (!api || api.success === false) { return api; }
      var meta = metaOf(api.data);
      return withData(api.result, { recent_files: list(isObject(meta) ? meta.recent_prototypes : null).map(mapRecentFile) });
    }),
    'figma.create_file': guarded('figma.create_file', CREATE_FILE_PARAMS, 'unverified-figma-create-file-mutation'),
    'figma.update_file': guarded('figma.update_file', UPDATE_FILE_PARAMS, 'unverified-figma-update-file-mutation'),
    'figma.trash_file': guarded('figma.trash_file', FILE_KEY_PARAMS, 'unverified-figma-trash-file-mutation'),
    'figma.post_comment': guarded('figma.post_comment', POST_COMMENT_PARAMS, 'unverified-figma-post-comment-mutation')
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
          descriptor: {
            slug: slug,
            service: FIGMA_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerFigma = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
