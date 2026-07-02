(function (global) {
  'use strict';

  /**
   * Microsoft Word Microsoft Graph read head.
   *
   * Safe Word and OneDrive reads use a short-lived Graph bearer token obtained
   * only through the bounded Microsoft Word page-read primitive. Document/file
   * mutations remain guarded fail-closed until live mutation-body UAT proves the
   * exact request shape.
   */

  var MSWORD_ORIGIN = 'https://word.cloud.microsoft';
  var MSWORD_SERVICE = 'word.cloud.microsoft';
  var GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  var EMPTY_PARAMS = schema({}, []);
  var ITEM_ID_PARAMS = schema({
    item_id: stringParam('File or folder ID')
  }, ['item_id']);
  var LIST_CHILDREN_PARAMS = schema({
    item_id: { type: 'string', description: 'Folder ID; omit for drive root' },
    top: integerParam('Maximum results to return', 1, 200),
    order_by: { type: 'string', description: 'Optional sort expression, such as name asc' }
  }, []);
  var TOP50_PARAMS = schema({
    top: integerParam('Maximum results to return', 1, 50)
  }, []);
  var RECENT_PARAMS = schema({
    limit: integerParam('Maximum recent documents to return', 1, 50)
  }, []);
  var SEARCH_PARAMS = schema({
    query: stringParam('Search query text'),
    top: integerParam('Maximum results to return', 1, 50)
  }, ['query']);

  var APPEND_PARAMS = schema({
    item_id: stringParam('File ID of the .docx document to append to'),
    paragraphs: stringArrayParam('Text paragraphs to append at the end of the document')
  }, ['item_id', 'paragraphs']);
  var COPY_PARAMS = schema({
    item_id: stringParam('File or folder ID to copy'),
    destination_id: { type: 'string', description: 'Optional destination folder ID' },
    name: { type: 'string', description: 'Optional copied item name' }
  }, ['item_id']);
  var CREATE_DOCUMENT_PARAMS = schema({
    path: stringParam('Destination path for the new .docx document'),
    paragraphs: stringArrayParam('Initial document paragraphs')
  }, ['path', 'paragraphs']);
  var CREATE_FOLDER_PARAMS = schema({
    name: stringParam('Folder name'),
    parent_id: { type: 'string', description: 'Optional parent folder ID; omit for drive root' }
  }, ['name']);
  var CREATE_SHARING_LINK_PARAMS = schema({
    item_id: stringParam('File or folder ID'),
    type: { type: 'string', description: 'Link type, such as view or edit' },
    scope: { type: 'string', description: 'Link scope, such as anonymous or organization' }
  }, ['item_id']);
  var DELETE_PERMISSION_PARAMS = schema({
    item_id: stringParam('File or folder ID'),
    permission_id: stringParam('Permission ID to delete')
  }, ['item_id', 'permission_id']);
  var MOVE_ITEM_PARAMS = schema({
    item_id: stringParam('File or folder ID to move'),
    destination_id: stringParam('Destination parent folder ID')
  }, ['item_id', 'destination_id']);
  var RENAME_ITEM_PARAMS = schema({
    item_id: stringParam('File or folder ID to rename'),
    name: stringParam('New file or folder name')
  }, ['item_id', 'name']);
  var REPLACE_TEXT_PARAMS = schema({
    item_id: stringParam('File ID of the .docx document'),
    find: stringParam('Text to search for'),
    replace: { type: 'string', description: 'Replacement text' }
  }, ['item_id', 'find', 'replace']);
  var RESTORE_VERSION_PARAMS = schema({
    item_id: stringParam('File ID'),
    version_id: stringParam('Version ID to restore')
  }, ['item_id', 'version_id']);
  var UPDATE_DOCUMENT_PARAMS = schema({
    item_id: stringParam('File ID of the .docx document to update'),
    paragraphs: stringArrayParam('New text paragraphs for the document body')
  }, ['item_id', 'paragraphs']);
  var UPDATE_FILE_CONTENT_PARAMS = schema({
    item_id: stringParam('File ID to replace'),
    content: { type: 'string', description: 'New file content' },
    content_type: { type: 'string', description: 'Optional MIME type for the new content' }
  }, ['item_id', 'content']);
  var UPLOAD_FILE_PARAMS = schema({
    path: stringParam('Destination path in OneDrive'),
    content: { type: 'string', description: 'File content to upload' },
    content_type: { type: 'string', description: 'Optional MIME type for the uploaded content' }
  }, ['path', 'content']);

  var DRIVE_ITEM_SELECT = 'id,name,folder,file,size,lastModifiedDateTime,webUrl,parentReference,createdDateTime,description';

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function stringParam(description) {
    return { type: 'string', minLength: 1, description: description };
  }

  function integerParam(description, min, max) {
    return { type: 'integer', minimum: min, maximum: max, description: description };
  }

  function stringArrayParam(description) {
    return {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
      description: description
    };
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

  function isWordPageOrigin(origin) {
    if (origin === MSWORD_ORIGIN) { return true; }
    try {
      var host = new URL(origin).hostname.toLowerCase();
      return host === 'sharepoint.com' || host.slice(-15) === '.sharepoint.com';
    } catch (err) {
      return false;
    }
  }

  function pageOrigin(ctx, slug) {
    var origin = ctx && typeof ctx.origin === 'string' && ctx.origin ? ctx.origin : MSWORD_ORIGIN;
    return isWordPageOrigin(origin) ? origin : fallback(slug, 'msword-origin-not-supported');
  }

  function graphGetSpec(path, pairs, graphToken, origin) {
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
      origin: origin,
      extract: '@'
    };
  }

  function textGetSpec(url, origin) {
    return {
      url: url,
      method: 'GET',
      headers: {
        'Accept': 'text/plain,*/*'
      },
      body: null,
      query: {},
      authStrategy: 'none',
      credentials: 'omit',
      origin: origin
    };
  }

  async function authContext(ctx, slug) {
    if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
      return fallback(slug, 'msword-page-read-primitive-unavailable');
    }
    var origin = pageOrigin(ctx, slug);
    if (origin && origin.success === false) { return origin; }
    var result = await ctx.executeBoundPageRead({
      origin: origin,
      namespace: 'microsoft-word',
      action: 'auth_context',
      args: {}
    }, ctx.tabId);
    if (!result || result.success !== true) {
      return result || fallback(slug, 'msword-auth-context-unavailable');
    }
    var data = result.data || {};
    var graphToken = typeof data.graph_token === 'string' ? data.graph_token : '';
    if (!graphToken) { return fallback(slug, 'msword-graph-token-unavailable'); }
    return {
      success: true,
      graphToken: graphToken,
      driveId: typeof data.drive_id === 'string' ? data.drive_id : '',
      itemId: typeof data.item_id === 'string' ? data.item_id : '',
      sharingUrl: typeof data.sharing_url === 'string' ? data.sharing_url : '',
      origin: origin
    };
  }

  function base64Url(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    var encoded;
    if (typeof btoa === 'function') {
      encoded = btoa(binary);
    } else if (typeof Buffer !== 'undefined') {
      encoded = Buffer.from(binary, 'binary').toString('base64');
    } else {
      return '';
    }
    return encoded.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  }

  function encodeShareId(sharingUrl) {
    var text = String(sharingUrl || '');
    if (!text) { return ''; }
    if (typeof TextEncoder !== 'undefined') {
      return 'u!' + base64Url(new TextEncoder().encode(text));
    }
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      bytes.push(text.charCodeAt(i) & 255);
    }
    return 'u!' + base64Url(bytes);
  }

  async function ensureActiveDocument(slug, auth, ctx) {
    if (auth.driveId && auth.itemId) {
      return { success: true, driveId: auth.driveId, itemId: auth.itemId };
    }
    if (!auth.sharingUrl) {
      return fallback(slug, 'msword-document-context-unavailable');
    }
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'msword-execute-bound-spec-unavailable');
    }
    var shareId = encodeShareId(auth.sharingUrl);
    if (!shareId) { return fallback(slug, 'msword-share-url-unusable'); }
    var result = await ctx.executeBoundSpec(graphGetSpec(
      '/shares/' + shareId + '/driveItem',
      [['$select', 'id,parentReference']],
      auth.graphToken,
      auth.origin
    ), ctx.tabId);
    if (!result || result.success !== true || !result.data || !result.data.parentReference) {
      return fallback(slug, 'msword-sharepoint-document-resolve-failed');
    }
    var driveId = result.data.parentReference.driveId || '';
    var itemId = result.data.id || '';
    if (!driveId || !itemId) {
      return fallback(slug, 'msword-document-context-incomplete');
    }
    auth.driveId = driveId;
    auth.itemId = itemId;
    return { success: true, driveId: driveId, itemId: itemId };
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

  function mapGraphResult(result, slug, mapper, auth, args) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || result.status === 401 || result.status === 403) {
      return fallback(slug, 'msword-graph-auth-failed');
    }
    var data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || looksLikeGraphError(data)) {
      return fallback(slug, 'msword-graph-shape-mismatch');
    }
    try {
      return withMappedData(result, mapper ? mapper(data, auth, args || {}) : data);
    } catch (err) {
      return fallback(slug, 'msword-map-shape-mismatch');
    }
  }

  async function graphRead(slug, args, ctx, requestForAuth, mapper) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'msword-execute-bound-spec-unavailable');
    }
    var auth = await authContext(ctx, slug);
    if (!auth || auth.success !== true) { return auth; }
    var req = await requestForAuth(args || {}, auth, ctx, slug);
    if (req && req.success === false) { return req; }
    if (req && req.fallbackReason) { return fallback(slug, req.fallbackReason); }
    var result = await ctx.executeBoundSpec(graphGetSpec(req.path, req.pairs || [], auth.graphToken, auth.origin), ctx.tabId);
    return mapGraphResult(result, slug, mapper, auth, args);
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
      quota: {
        total: quota.total || 0,
        used: quota.used || 0,
        remaining: quota.remaining || 0,
        state: quota.state || ''
      }
    } };
  }

  function mapDriveItem(item) {
    item = item || {};
    var parent = item.parentReference || {};
    return {
      id: item.id || '',
      name: item.name || '',
      size: item.size || 0,
      is_folder: !!item.folder,
      mime_type: item.file && item.file.mimeType ? item.file.mimeType : '',
      web_url: item.webUrl || '',
      created_at: item.createdDateTime || '',
      last_modified_at: item.lastModifiedDateTime || '',
      parent_path: parent.path || '',
      parent_id: parent.id || '',
      description: item.description || ''
    };
  }

  function mapDriveItems(data) {
    return { items: collectionValues(data).map(mapDriveItem) };
  }

  function mapPermission(permission) {
    permission = permission || {};
    var granted = (permission.grantedTo && permission.grantedTo.user)
      || (permission.grantedToIdentities && permission.grantedToIdentities[0]
        && permission.grantedToIdentities[0].user)
      || {};
    var link = permission.link || {};
    return {
      id: permission.id || '',
      roles: permission.roles || [],
      link_url: link.webUrl || '',
      link_type: link.type || '',
      granted_to: granted.displayName || ''
    };
  }

  function mapPermissions(data) {
    return { permissions: collectionValues(data).map(mapPermission) };
  }

  function mapVersion(version) {
    version = version || {};
    return {
      id: version.id || '',
      last_modified_at: version.lastModifiedDateTime || '',
      size: version.size || 0
    };
  }

  function mapVersions(data) {
    return { versions: collectionValues(data).map(mapVersion) };
  }

  function readHandler(slug, params, requestForAuth, mapper) {
    return {
      tier: 'T1a',
      origin: MSWORD_ORIGIN,
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
      origin: MSWORD_ORIGIN,
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
      origin: MSWORD_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  async function fileContent(args, ctx) {
    var slug = 'msword.get_file_content';
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'msword-execute-bound-spec-unavailable');
    }
    var auth = await authContext(ctx, slug);
    if (!auth || auth.success !== true) { return auth; }
    var meta = await ctx.executeBoundSpec(graphGetSpec(
      '/me/drive/items/' + encodeSegment(args && args.item_id),
      [],
      auth.graphToken,
      auth.origin
    ), ctx.tabId);
    var mapped = mapGraphResult(meta, slug, function(data) { return data; }, auth, args);
    if (!mapped || mapped.success !== true) { return mapped; }
    var downloadUrl = mapped.data && mapped.data['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) { return fallback(slug, 'msword-download-url-unavailable'); }
    var downloaded = await ctx.executeBoundSpec(textGetSpec(downloadUrl, auth.origin), ctx.tabId);
    if (!downloaded || downloaded.success !== true) { return downloaded; }
    if (downloaded.redirected || downloaded.status === 401 || downloaded.status === 403) {
      return fallback(slug, 'msword-download-auth-failed');
    }
    if (typeof downloaded.text !== 'string') {
      return fallback(slug, 'msword-download-text-unavailable');
    }
    return withMappedData(downloaded, {
      content: downloaded.text,
      size: downloaded.text.length
    });
  }

  var handlers = {
    'msword.get_active_document': readHandler('msword.get_active_document', EMPTY_PARAMS, async function(_args, auth, ctx, slug) {
      var doc = await ensureActiveDocument(slug, auth, ctx);
      if (!doc || doc.success !== true) { return doc; }
      return {
        path: '/drives/' + encodeSegment(doc.driveId) + '/items/' + encodeSegment(doc.itemId),
        pairs: [['$select', DRIVE_ITEM_SELECT]]
      };
    }, function(data, auth) {
      return { item: mapDriveItem(data), drive_id: auth.driveId };
    }),
    'msword.get_current_user': readHandler('msword.get_current_user', EMPTY_PARAMS, function() {
      return { path: '/me', pairs: [['$select', 'id,displayName,mail,userPrincipalName']] };
    }, mapUser),
    'msword.get_document_text': fallbackRead('msword.get_document_text', ITEM_ID_PARAMS, 'msword-docx-binary-parser-unavailable'),
    'msword.get_drive': readHandler('msword.get_drive', EMPTY_PARAMS, function() {
      return { path: '/me/drive', pairs: [] };
    }, mapDrive),
    'msword.get_file_content': {
      tier: 'T1a',
      origin: MSWORD_ORIGIN,
      sideEffectClass: 'read',
      params: ITEM_ID_PARAMS,
      async handle(args, ctx) {
        return fileContent(args || {}, ctx);
      }
    },
    'msword.get_item': readHandler('msword.get_item', ITEM_ID_PARAMS, function(args) {
      return {
        path: '/me/drive/items/' + encodeSegment(args.item_id),
        pairs: [['$select', DRIVE_ITEM_SELECT]]
      };
    }, function(data) { return { item: mapDriveItem(data) }; }),
    'msword.list_children': readHandler('msword.list_children', LIST_CHILDREN_PARAMS, function(args) {
      var base = args.item_id
        ? '/me/drive/items/' + encodeSegment(args.item_id) + '/children'
        : '/me/drive/root/children';
      return {
        path: base,
        pairs: [['$top', args.top || 20], ['$select', DRIVE_ITEM_SELECT], ['$orderby', args.order_by]]
      };
    }, mapDriveItems),
    'msword.list_permissions': readHandler('msword.list_permissions', ITEM_ID_PARAMS, function(args) {
      return { path: '/me/drive/items/' + encodeSegment(args.item_id) + '/permissions', pairs: [] };
    }, mapPermissions),
    'msword.list_recent_documents': readHandler('msword.list_recent_documents', RECENT_PARAMS, function(args) {
      return { path: '/me/drive/recent', pairs: [['$top', args.limit || 10]] };
    }, mapDriveItems),
    'msword.list_shared_with_me': readHandler('msword.list_shared_with_me', TOP50_PARAMS, function(args) {
      return {
        path: '/me/drive/sharedWithMe',
        pairs: [['$top', args.top || 10], ['$select', DRIVE_ITEM_SELECT]]
      };
    }, mapDriveItems),
    'msword.list_versions': readHandler('msword.list_versions', ITEM_ID_PARAMS, function(args) {
      return { path: '/me/drive/items/' + encodeSegment(args.item_id) + '/versions', pairs: [] };
    }, mapVersions),
    'msword.search_files': readHandler('msword.search_files', SEARCH_PARAMS, function(args) {
      var q = encodeURIComponent(String(args.query || '').replace(/'/g, "''"));
      return { path: "/me/drive/root/search(q='" + q + "')", pairs: [['$top', args.top || 10]] };
    }, mapDriveItems),

    'msword.append_to_document': guarded('msword.append_to_document', 'write', APPEND_PARAMS, 'unverified-msword-append-to-document-mutation'),
    'msword.copy_item': guarded('msword.copy_item', 'write', COPY_PARAMS, 'unverified-msword-copy-item-mutation'),
    'msword.create_document': guarded('msword.create_document', 'write', CREATE_DOCUMENT_PARAMS, 'unverified-msword-create-document-mutation'),
    'msword.create_folder': guarded('msword.create_folder', 'write', CREATE_FOLDER_PARAMS, 'unverified-msword-create-folder-mutation'),
    'msword.create_sharing_link': guarded('msword.create_sharing_link', 'write', CREATE_SHARING_LINK_PARAMS, 'unverified-msword-create-sharing-link-mutation'),
    'msword.delete_item': guarded('msword.delete_item', 'destructive', ITEM_ID_PARAMS, 'unverified-msword-delete-item-mutation'),
    'msword.delete_permission': guarded('msword.delete_permission', 'destructive', DELETE_PERMISSION_PARAMS, 'unverified-msword-delete-permission-mutation'),
    'msword.get_preview_url': guarded('msword.get_preview_url', 'write', ITEM_ID_PARAMS, 'unverified-msword-get-preview-url-post'),
    'msword.move_item': guarded('msword.move_item', 'write', MOVE_ITEM_PARAMS, 'unverified-msword-move-item-mutation'),
    'msword.rename_item': guarded('msword.rename_item', 'write', RENAME_ITEM_PARAMS, 'unverified-msword-rename-item-mutation'),
    'msword.replace_text_in_document': guarded('msword.replace_text_in_document', 'write', REPLACE_TEXT_PARAMS, 'unverified-msword-replace-text-in-document-mutation'),
    'msword.restore_version': guarded('msword.restore_version', 'write', RESTORE_VERSION_PARAMS, 'unverified-msword-restore-version-mutation'),
    'msword.update_document': guarded('msword.update_document', 'write', UPDATE_DOCUMENT_PARAMS, 'unverified-msword-update-document-mutation'),
    'msword.update_file_content': guarded('msword.update_file_content', 'write', UPDATE_FILE_CONTENT_PARAMS, 'unverified-msword-update-file-content-mutation'),
    'msword.upload_file': guarded('msword.upload_file', 'write', UPLOAD_FILE_PARAMS, 'unverified-msword-upload-file-mutation')
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: handlers[slug].origin,
          params: handlers[slug].params,
          descriptor: {
            slug: slug,
            service: MSWORD_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerMsword = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
