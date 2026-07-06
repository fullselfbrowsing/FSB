(function (global) {
  'use strict';

  /**
   * PowerPoint Microsoft Graph READ head.
   *
   * PowerPoint Online stores file and user data behind Microsoft Graph. The page
   * owns a short-lived Graph bearer token captured by the bundled PowerPoint
   * pre-script; this handler obtains that token only through the bounded
   * page-read primitive, keeps it inside read-only bound specs, and never logs or
   * returns it. Mutation-like Graph and PPTX edit operations remain guarded
   * fail-closed until live mutation-body UAT exists.
   */

  var POWERPOINT_ORIGIN = 'https://powerpoint.cloud.microsoft';
  var POWERPOINT_SERVICE = 'powerpoint.cloud.microsoft';
  var GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  var STRING = { type: 'string' };
  var INTEGER = { type: 'integer', minimum: 1, maximum: 9007199254740991 };
  var EMPTY_PARAMS = schema({}, []);
  var ITEM_ID_PARAMS = schema({
    item_id: field('Item ID of the PowerPoint file or OneDrive item')
  }, ['item_id']);
  var SLIDE_PARAMS = schema({
    item_id: field('Item ID of the PowerPoint file'),
    slide_number: INTEGER
  }, ['item_id', 'slide_number']);
  var DOWNLOAD_PARAMS = schema({
    item_id: field('Item ID of the file'),
    format: { type: 'string', enum: ['pdf', 'jpg', 'png'] }
  }, ['item_id']);
  var LIST_CHILDREN_PARAMS = schema({
    folder_id: field('Folder item ID; defaults to root'),
    top: { type: 'integer', minimum: 1, maximum: 200 }
  }, []);
  var TOP50_PARAMS = schema({
    top: { type: 'integer', minimum: 1, maximum: 50 }
  }, []);
  var SEARCH_PARAMS = schema({
    query: field('Search query text'),
    top: { type: 'integer', minimum: 1, maximum: 50 }
  }, ['query']);

  var COPY_PARAMS = schema({
    item_id: field('Item ID to copy'),
    name: STRING,
    destination_folder_id: STRING
  }, ['item_id']);
  var CREATE_FOLDER_PARAMS = schema({
    name: field('Folder name'),
    parent_folder_id: STRING
  }, ['name']);
  var CREATE_PRESENTATION_PARAMS = schema({
    name: field('Presentation file name'),
    folder_id: STRING
  }, ['name']);
  var CREATE_LINK_PARAMS = schema({
    item_id: field('Item ID'),
    type: { type: 'string', enum: ['view', 'edit', 'embed'] },
    scope: { type: 'string', enum: ['anonymous', 'organization', 'users'] }
  }, ['item_id', 'type']);
  var DELETE_PERMISSION_PARAMS = schema({
    item_id: field('Item ID'),
    permission_id: field('Permission ID')
  }, ['item_id', 'permission_id']);
  var MOVE_PARAMS = schema({
    item_id: field('Item ID'),
    destination_folder_id: field('Destination folder ID')
  }, ['item_id', 'destination_folder_id']);
  var RENAME_PARAMS = schema({
    item_id: field('Item ID'),
    name: field('New file or folder name')
  }, ['item_id', 'name']);
  var UPDATE_NOTES_PARAMS = schema({
    item_id: field('Item ID of the PowerPoint file'),
    slide_number: INTEGER,
    notes: STRING
  }, ['item_id', 'slide_number', 'notes']);
  var UPDATE_TEXT_PARAMS = schema({
    item_id: field('Item ID of the PowerPoint file'),
    slide_number: INTEGER,
    text: STRING
  }, ['item_id', 'slide_number', 'text']);

  function field(description) {
    return { type: 'string', description: description };
  }

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
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
      reason: reason,
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
      origin: POWERPOINT_ORIGIN,
      extract: '@'
    };
  }

  async function authContext(ctx, slug) {
    if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
      return fallback(slug, 'powerpoint-page-read-primitive-unavailable');
    }
    var result = await ctx.executeBoundPageRead({
      origin: POWERPOINT_ORIGIN,
      namespace: 'powerpoint',
      action: 'auth_context',
      args: {}
    }, ctx.tabId);
    if (!result || result.success !== true) {
      return result || fallback(slug, 'powerpoint-auth-context-unavailable');
    }
    var data = result.data || {};
    var graphToken = typeof data.graph_token === 'string' ? data.graph_token : '';
    var driveId = typeof data.drive_id === 'string' ? data.drive_id : '';
    if (!graphToken || !driveId) {
      return fallback(slug, 'powerpoint-auth-context-incomplete');
    }
    return {
      success: true,
      graphToken: graphToken,
      driveId: driveId,
      itemId: typeof data.item_id === 'string' ? data.item_id : ''
    };
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
      return fallback(slug, 'powerpoint-graph-auth-failed');
    }
    var data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || looksLikeGraphError(data)) {
      return fallback(slug, 'powerpoint-graph-shape-mismatch');
    }
    try {
      return withMappedData(result, mapper ? mapper(data) : data);
    } catch (err) {
      return fallback(slug, 'powerpoint-map-shape-mismatch');
    }
  }

  async function graphRead(slug, args, ctx, requestForAuth, mapper) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'powerpoint-execute-bound-spec-unavailable');
    }
    var auth = await authContext(ctx, slug);
    if (!auth || auth.success !== true) { return auth; }
    var req = requestForAuth(args || {}, auth);
    if (req && req.fallbackReason) { return fallback(slug, req.fallbackReason); }
    var result = await ctx.executeBoundSpec(graphGetSpec(req.path, req.pairs || [], auth.graphToken), ctx.tabId);
    return mapGraphResult(result, slug, mapper);
  }

  function collectionValues(data) {
    return Array.isArray(data.value) ? data.value : [];
  }

  function mapUser(data) {
    return { user: {
      id: data.id || '',
      display_name: data.displayName || '',
      email: data.mail || data.userPrincipalName || ''
    } };
  }

  function mapDrive(data) {
    var quota = data.quota || {};
    return { drive: {
      id: data.id || '',
      name: data.name || '',
      drive_type: data.driveType || '',
      total_bytes: quota.total || 0,
      used_bytes: quota.used || 0,
      remaining_bytes: quota.remaining || 0,
      state: quota.state || ''
    } };
  }

  function displayName(identity) {
    return (identity && identity.user && identity.user.displayName)
      || (identity && identity.application && identity.application.displayName)
      || '';
  }

  function mapDriveItem(item) {
    item = item || {};
    return {
      id: item.id || '',
      name: item.name || '',
      size: item.size || 0,
      web_url: item.webUrl || '',
      mime_type: item.file && item.file.mimeType ? item.file.mimeType : '',
      is_folder: !!item.folder,
      created_by: displayName(item.createdBy),
      created_at: item.createdDateTime || '',
      modified_by: displayName(item.lastModifiedBy),
      modified_at: item.lastModifiedDateTime || ''
    };
  }

  function mapDriveItems(data) {
    return { items: collectionValues(data).map(mapDriveItem) };
  }

  function mapPermission(permission) {
    permission = permission || {};
    var granted = (permission.grantedTo && permission.grantedTo.user)
      || (permission.grantedToV2 && permission.grantedToV2.siteUser)
      || {};
    var link = permission.link || {};
    return {
      id: permission.id || '',
      roles: permission.roles || [],
      granted_to: granted.displayName || '',
      granted_to_email: granted.email || '',
      link_url: link.webUrl || '',
      link_type: link.type || '',
      link_scope: link.scope || ''
    };
  }

  function mapPermissions(data) {
    return { permissions: collectionValues(data).map(mapPermission) };
  }

  function mapThumbnailSize(size) {
    size = size || {};
    return {
      url: size.url || '',
      width: size.width || 0,
      height: size.height || 0
    };
  }

  function mapThumbnails(data) {
    return { thumbnails: collectionValues(data).map(function(set) {
      set = set || {};
      return {
        small: mapThumbnailSize(set.small),
        medium: mapThumbnailSize(set.medium),
        large: mapThumbnailSize(set.large)
      };
    }) };
  }

  function mapVersion(version) {
    version = version || {};
    return {
      id: version.id || '',
      modified_by: version.lastModifiedBy && version.lastModifiedBy.user
        ? version.lastModifiedBy.user.displayName || ''
        : '',
      modified_at: version.lastModifiedDateTime || '',
      size: version.size || 0
    };
  }

  function mapVersions(data) {
    return { versions: collectionValues(data).map(mapVersion) };
  }

  function mapDownloadUrl(data) {
    return {
      download_url: data['@microsoft.graph.downloadUrl'] || '',
      name: data.name || ''
    };
  }

  function readHandler(slug, params, requestForAuth, mapper) {
    return {
      tier: 'T1a',
      origin: POWERPOINT_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        return graphRead(slug, args || {}, ctx, requestForAuth, mapper);
      }
    };
  }

  function fallbackRead(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: POWERPOINT_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: POWERPOINT_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason || 'unverified-powerpoint-mutation');
      }
    };
  }

  function drivePath(suffix, auth) {
    return '/drives/' + encodeSegment(auth.driveId) + suffix;
  }

  function itemPath(itemId, auth, suffix) {
    return drivePath('/items/' + encodeSegment(itemId) + (suffix || ''), auth);
  }

  var DRIVE_ITEM_SELECT = 'id,name,size,webUrl,file,folder,createdBy,createdDateTime,lastModifiedBy,lastModifiedDateTime';

  var handlers = {
    'powerpoint.get_current_user': readHandler('powerpoint.get_current_user', EMPTY_PARAMS, function() {
      return { path: '/me', pairs: [['$select', 'displayName,mail,userPrincipalName,id']] };
    }, mapUser),
    'powerpoint.get_drive': readHandler('powerpoint.get_drive', EMPTY_PARAMS, function(_args, auth) {
      return { path: drivePath('', auth), pairs: [['$select', 'id,name,driveType,quota']] };
    }, mapDrive),
    'powerpoint.get_item': readHandler('powerpoint.get_item', ITEM_ID_PARAMS, function(args, auth) {
      return { path: itemPath(args.item_id, auth), pairs: [['$select', DRIVE_ITEM_SELECT]] };
    }, function(data) { return { item: mapDriveItem(data) }; }),
    'powerpoint.list_children': readHandler('powerpoint.list_children', LIST_CHILDREN_PARAMS, function(args, auth) {
      var base = args.folder_id
        ? itemPath(args.folder_id, auth, '/children')
        : drivePath('/root/children', auth);
      return { path: base, pairs: [['$top', args.top || 20], ['$select', DRIVE_ITEM_SELECT]] };
    }, mapDriveItems),
    'powerpoint.list_recent': readHandler('powerpoint.list_recent', TOP50_PARAMS, function(args) {
      return { path: '/me/drive/recent', pairs: [['$top', args.top || 10]] };
    }, mapDriveItems),
    'powerpoint.list_shared_with_me': readHandler('powerpoint.list_shared_with_me', TOP50_PARAMS, function(args) {
      return { path: '/me/drive/sharedWithMe', pairs: [['$top', args.top || 10]] };
    }, mapDriveItems),
    'powerpoint.search_files': readHandler('powerpoint.search_files', SEARCH_PARAMS, function(args) {
      var q = encodeURIComponent(String(args.query || '').replace(/'/g, "''"));
      return {
        path: "/me/drive/root/search(q='" + q + "')",
        pairs: [['$top', args.top || 10], ['$select', DRIVE_ITEM_SELECT]]
      };
    }, mapDriveItems),
    'powerpoint.get_download_url': {
      tier: 'T1a',
      origin: POWERPOINT_ORIGIN,
      sideEffectClass: 'read',
      params: DOWNLOAD_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        if (a.format) {
          return fallback('powerpoint.get_download_url', 'powerpoint-format-download-requires-binary-redirect');
        }
        return graphRead('powerpoint.get_download_url', a, ctx, function(reqArgs, auth) {
          return { path: itemPath(reqArgs.item_id, auth), pairs: [] };
        }, mapDownloadUrl);
      }
    },
    'powerpoint.get_thumbnails': readHandler('powerpoint.get_thumbnails', ITEM_ID_PARAMS, function(args, auth) {
      return { path: itemPath(args.item_id, auth, '/thumbnails'), pairs: [] };
    }, mapThumbnails),
    'powerpoint.list_permissions': readHandler('powerpoint.list_permissions', ITEM_ID_PARAMS, function(args, auth) {
      return { path: itemPath(args.item_id, auth, '/permissions'), pairs: [] };
    }, mapPermissions),
    'powerpoint.list_versions': readHandler('powerpoint.list_versions', ITEM_ID_PARAMS, function(args, auth) {
      return { path: itemPath(args.item_id, auth, '/versions'), pairs: [] };
    }, mapVersions),
    'powerpoint.get_slides': fallbackRead('powerpoint.get_slides', ITEM_ID_PARAMS, 'powerpoint-pptx-binary-parser-unavailable'),
    'powerpoint.get_slide_content': fallbackRead('powerpoint.get_slide_content', SLIDE_PARAMS, 'powerpoint-pptx-binary-parser-unavailable'),
    'powerpoint.get_slide_notes': fallbackRead('powerpoint.get_slide_notes', SLIDE_PARAMS, 'powerpoint-pptx-binary-parser-unavailable'),

    'powerpoint.copy_item': guarded('powerpoint.copy_item', 'write', COPY_PARAMS, 'unverified-powerpoint-copy-item-mutation'),
    'powerpoint.create_folder': guarded('powerpoint.create_folder', 'write', CREATE_FOLDER_PARAMS, 'unverified-powerpoint-create-folder-mutation'),
    'powerpoint.create_presentation': guarded('powerpoint.create_presentation', 'write', CREATE_PRESENTATION_PARAMS, 'unverified-powerpoint-create-presentation-mutation'),
    'powerpoint.create_sharing_link': guarded('powerpoint.create_sharing_link', 'write', CREATE_LINK_PARAMS, 'unverified-powerpoint-create-sharing-link-mutation'),
    'powerpoint.delete_item': guarded('powerpoint.delete_item', 'destructive', ITEM_ID_PARAMS, 'unverified-powerpoint-delete-item-mutation'),
    'powerpoint.delete_permission': guarded('powerpoint.delete_permission', 'destructive', DELETE_PERMISSION_PARAMS, 'unverified-powerpoint-delete-permission-mutation'),
    'powerpoint.delete_slide': guarded('powerpoint.delete_slide', 'destructive', SLIDE_PARAMS, 'unverified-powerpoint-delete-slide-mutation'),
    'powerpoint.get_preview_url': guarded('powerpoint.get_preview_url', 'write', ITEM_ID_PARAMS, 'unverified-powerpoint-preview-url-post'),
    'powerpoint.move_item': guarded('powerpoint.move_item', 'write', MOVE_PARAMS, 'unverified-powerpoint-move-item-mutation'),
    'powerpoint.rename_item': guarded('powerpoint.rename_item', 'write', RENAME_PARAMS, 'unverified-powerpoint-rename-item-mutation'),
    'powerpoint.update_slide_notes': guarded('powerpoint.update_slide_notes', 'write', UPDATE_NOTES_PARAMS, 'unverified-powerpoint-update-slide-notes-mutation'),
    'powerpoint.update_slide_text': guarded('powerpoint.update_slide_text', 'write', UPDATE_TEXT_PARAMS, 'unverified-powerpoint-update-slide-text-mutation')
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: POWERPOINT_ORIGIN,
          descriptor: {
            slug: slug,
            service: POWERPOINT_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerPowerpoint = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
