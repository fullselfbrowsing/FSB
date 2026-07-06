(function (global) {
  'use strict';

  /**
   * OneNote Microsoft Graph READ head.
   *
   * OneNote Online stores notebooks, sections, and section groups behind
   * Microsoft Graph. The page owns the MSAL bearer token; this handler obtains it
   * only through the bounded OneNote page-read primitive, keeps it inside GET-only
   * bound specs, and never logs or returns token material. Notebook/page/section
   * creation rows remain guarded fail-closed until live mutation-body UAT exists.
   */

  var ONENOTE_ORIGIN = 'https://onenote.cloud.microsoft';
  var ONENOTE_SERVICE = 'onenote.cloud.microsoft';
  var GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

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
    var out = { type: 'string', minLength: 1 };
    if (description) { out.description = description; }
    return out;
  }

  function intField(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? 1 : min,
      maximum: max === undefined ? 100 : max,
      description: description
    };
  }

  var EMPTY_PARAMS = schema({});
  var NOTEBOOK_ID_PARAMS = schema({
    notebook_id: stringField('Notebook ID')
  }, ['notebook_id']);
  var SECTION_ID_PARAMS = schema({
    section_id: stringField('Section ID')
  }, ['section_id']);
  var SECTION_GROUP_ID_PARAMS = schema({
    section_group_id: stringField('Section group ID')
  }, ['section_group_id']);
  var LIST_NOTEBOOKS_PARAMS = schema({
    order_by: { type: 'string', description: 'OData $orderby expression' },
    top: intField('Maximum notebooks to return', 1, 100)
  });
  var RECENT_NOTEBOOKS_PARAMS = schema({
    include_personal: {
      type: 'boolean',
      description: 'Include personal notebooks in addition to business notebooks'
    }
  });
  var LIST_CHILDREN_PARAMS = schema({
    notebook_id: { type: 'string', description: 'Notebook ID to filter by' },
    top: intField('Maximum rows to return', 1, 100)
  });
  var CREATE_NOTEBOOK_PARAMS = schema({
    display_name: stringField('Name for the new notebook')
  }, ['display_name']);
  var CREATE_SECTION_PARAMS = schema({
    notebook_id: stringField('Notebook ID'),
    display_name: stringField('Name for the new section')
  }, ['notebook_id', 'display_name']);
  var CREATE_SECTION_GROUP_PARAMS = schema({
    notebook_id: stringField('Notebook ID'),
    display_name: stringField('Name for the new section group')
  }, ['notebook_id', 'display_name']);
  var CREATE_PAGE_PARAMS = schema({
    section_id: stringField('Section ID'),
    html: stringField('Page content as HTML')
  }, ['section_id', 'html']);

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
      reason: reason || 'onenote-graph-shape-mismatch',
      fellBackToDom: true
    });
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value || ''));
  }

  function appendQuery(parts, key, value) {
    if (value === undefined || value === null || value === '') { return; }
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      appendQuery(parts, pairs[i][0], pairs[i][1]);
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function graphGetSpec(path, pairs, graphToken) {
    return {
      url: GRAPH_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + graphToken
      },
      body: null,
      query: {},
      authStrategy: 'none',
      credentials: 'omit',
      origin: ONENOTE_ORIGIN,
      extract: '@'
    };
  }

  async function authContext(ctx, slug) {
    if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
      return fallback(slug, 'onenote-page-read-primitive-unavailable');
    }
    var result = await ctx.executeBoundPageRead({
      origin: ONENOTE_ORIGIN,
      namespace: 'onenote',
      action: 'auth_context',
      args: {}
    }, ctx.tabId);
    if (!result || result.success !== true) {
      return result || fallback(slug, 'onenote-auth-context-unavailable');
    }
    var data = result.data || {};
    var graphToken = typeof data.graph_token === 'string' ? data.graph_token : '';
    if (!graphToken || graphToken.length < 16) {
      return fallback(slug, 'onenote-graph-token-unavailable');
    }
    return { success: true, graphToken: graphToken };
  }

  function looksLikeGraphError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (Object.prototype.hasOwnProperty.call(data, 'error')
        || Array.isArray(data.errors)
        || typeof data.message === 'string');
  }

  function withMappedData(result, mapped) {
    var out = {};
    for (var k in result) {
      if (Object.prototype.hasOwnProperty.call(result, k)) { out[k] = result[k]; }
    }
    out.data = mapped;
    return out;
  }

  function mapGraphResult(result, slug, mapper) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || result.status === 401 || result.status === 403) {
      return fallback(slug, 'onenote-graph-auth-failed');
    }
    var data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || looksLikeGraphError(data)) {
      return fallback(slug, 'onenote-graph-shape-mismatch');
    }
    try {
      return withMappedData(result, mapper ? mapper(data) : data);
    } catch (err) {
      return fallback(slug, 'onenote-map-shape-mismatch');
    }
  }

  async function graphRead(slug, args, ctx, requestForArgs, mapper) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'onenote-execute-bound-spec-unavailable');
    }
    var auth = await authContext(ctx, slug);
    if (!auth || auth.success !== true) { return auth; }
    var req = requestForArgs(args || {});
    if (req && req.fallbackReason) { return fallback(slug, req.fallbackReason); }
    var result = await ctx.executeBoundSpec(
      graphGetSpec(req.path, req.pairs || [], auth.graphToken),
      ctx.tabId
    );
    return mapGraphResult(result, slug, mapper);
  }

  function collectionValues(data) {
    return Array.isArray(data.value) ? data.value : [];
  }

  function mapIdentity(identity) {
    var user = identity && identity.user ? identity.user : {};
    return {
      id: user.id || '',
      display_name: user.displayName || ''
    };
  }

  function mapUser(data) {
    return { user: {
      id: data.id || '',
      display_name: data.displayName || '',
      email: data.mail || data.userPrincipalName || '',
      given_name: data.givenName || '',
      surname: data.surname || '',
      preferred_language: data.preferredLanguage || ''
    } };
  }

  function mapNotebook(n) {
    n = n || {};
    var links = n.links || {};
    var oneNoteWebUrl = links.oneNoteWebUrl || {};
    return {
      id: n.id || '',
      display_name: n.displayName || '',
      created_at: n.createdDateTime || '',
      last_modified_at: n.lastModifiedDateTime || '',
      is_default: n.isDefault === true,
      is_shared: n.isShared === true,
      user_role: n.userRole || '',
      sections_url: n.sectionsUrl || '',
      section_groups_url: n.sectionGroupsUrl || '',
      created_by: mapIdentity(n.createdBy),
      last_modified_by: mapIdentity(n.lastModifiedBy),
      web_url: oneNoteWebUrl.href || ''
    };
  }

  function mapRecentNotebook(n) {
    n = n || {};
    var links = n.links || {};
    var oneNoteWebUrl = links.oneNoteWebUrl || {};
    return {
      display_name: n.displayName || '',
      last_accessed_time: n.lastAccessedTime || '',
      source_service: n.sourceService || '',
      web_url: oneNoteWebUrl.href || ''
    };
  }

  function mapSection(s) {
    s = s || {};
    var parent = s.parentNotebook || {};
    return {
      id: s.id || '',
      display_name: s.displayName || '',
      created_at: s.createdDateTime || '',
      last_modified_at: s.lastModifiedDateTime || '',
      is_default: s.isDefault === true,
      pages_url: s.pagesUrl || '',
      parent_notebook_id: parent.id || '',
      parent_notebook_name: parent.displayName || '',
      created_by: mapIdentity(s.createdBy),
      last_modified_by: mapIdentity(s.lastModifiedBy)
    };
  }

  function mapSectionGroup(sg) {
    sg = sg || {};
    var parent = sg.parentNotebook || {};
    return {
      id: sg.id || '',
      display_name: sg.displayName || '',
      created_at: sg.createdDateTime || '',
      last_modified_at: sg.lastModifiedDateTime || '',
      sections_url: sg.sectionsUrl || '',
      section_groups_url: sg.sectionGroupsUrl || '',
      parent_notebook_id: parent.id || '',
      parent_notebook_name: parent.displayName || '',
      created_by: mapIdentity(sg.createdBy),
      last_modified_by: mapIdentity(sg.lastModifiedBy)
    };
  }

  function readHandler(slug, params, requestForArgs, mapper) {
    return {
      tier: 'T1a',
      origin: ONENOTE_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        return graphRead(slug, args || {}, ctx, requestForArgs, mapper);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: ONENOTE_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason || 'unverified-onenote-mutation');
      }
    };
  }

  var handlers = {
    'onenote.get_current_user': readHandler('onenote.get_current_user', EMPTY_PARAMS, function() {
      return { path: '/me', pairs: [['$select', 'id,displayName,mail,userPrincipalName,givenName,surname,preferredLanguage']] };
    }, mapUser),
    'onenote.list_notebooks': readHandler('onenote.list_notebooks', LIST_NOTEBOOKS_PARAMS, function(args) {
      return {
        path: '/me/onenote/notebooks',
        pairs: [
          ['$orderby', args.order_by || 'lastModifiedDateTime desc'],
          ['$top', args.top || 20]
        ]
      };
    }, function(data) { return { notebooks: collectionValues(data).map(mapNotebook) }; }),
    'onenote.get_notebook': readHandler('onenote.get_notebook', NOTEBOOK_ID_PARAMS, function(args) {
      return { path: '/me/onenote/notebooks/' + encodeSegment(args.notebook_id), pairs: [] };
    }, function(data) { return { notebook: mapNotebook(data) }; }),
    'onenote.get_recent_notebooks': readHandler('onenote.get_recent_notebooks', RECENT_NOTEBOOKS_PARAMS, function(args) {
      var includePersonal = args.include_personal === false ? 'false' : 'true';
      return { path: '/me/onenote/notebooks/getRecentNotebooks(includePersonalNotebooks=' + includePersonal + ')', pairs: [] };
    }, function(data) { return { notebooks: collectionValues(data).map(mapRecentNotebook) }; }),
    'onenote.list_sections': readHandler('onenote.list_sections', LIST_CHILDREN_PARAMS, function(args) {
      var path = args.notebook_id
        ? '/me/onenote/notebooks/' + encodeSegment(args.notebook_id) + '/sections'
        : '/me/onenote/sections';
      return { path: path, pairs: [['$top', args.top || 20]] };
    }, function(data) { return { sections: collectionValues(data).map(mapSection) }; }),
    'onenote.get_section': readHandler('onenote.get_section', SECTION_ID_PARAMS, function(args) {
      return { path: '/me/onenote/sections/' + encodeSegment(args.section_id), pairs: [] };
    }, function(data) { return { section: mapSection(data) }; }),
    'onenote.list_section_groups': readHandler('onenote.list_section_groups', LIST_CHILDREN_PARAMS, function(args) {
      var path = args.notebook_id
        ? '/me/onenote/notebooks/' + encodeSegment(args.notebook_id) + '/sectionGroups'
        : '/me/onenote/sectionGroups';
      return { path: path, pairs: [['$top', args.top || 20]] };
    }, function(data) { return { section_groups: collectionValues(data).map(mapSectionGroup) }; }),
    'onenote.get_section_group': readHandler('onenote.get_section_group', SECTION_GROUP_ID_PARAMS, function(args) {
      return { path: '/me/onenote/sectionGroups/' + encodeSegment(args.section_group_id), pairs: [] };
    }, function(data) { return { section_group: mapSectionGroup(data) }; }),

    'onenote.create_notebook': guarded('onenote.create_notebook', 'write', CREATE_NOTEBOOK_PARAMS, 'unverified-onenote-create-notebook-mutation'),
    'onenote.create_page': guarded('onenote.create_page', 'write', CREATE_PAGE_PARAMS, 'unverified-onenote-create-page-mutation'),
    'onenote.create_section': guarded('onenote.create_section', 'write', CREATE_SECTION_PARAMS, 'unverified-onenote-create-section-mutation'),
    'onenote.create_section_group': guarded('onenote.create_section_group', 'write', CREATE_SECTION_GROUP_PARAMS, 'unverified-onenote-create-section-group-mutation')
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: ONENOTE_ORIGIN,
          params: handlers[slug].params,
          descriptor: {
            slug: slug,
            service: ONENOTE_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerOnenote = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
