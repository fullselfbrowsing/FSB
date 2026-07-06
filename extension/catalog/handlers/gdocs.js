(function (global) {
  'use strict';

  /**
   * Google Docs same-origin Drive API READ head.
   *
   * Read-only document and comment metadata execute through bounded specs pinned
   * to docs.google.com. Document/comment mutations remain guarded fail-closed
   * until live mutation-body UAT records exact request safety evidence.
   */

  var ORIGIN = 'https://docs.google.com';
  var SERVICE = 'docs.google.com';
  var DRIVE_BASE = ORIGIN + '/drive/v3';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';
  var DOCUMENT_MIME_TYPE = 'application/vnd.google-apps.document';
  var DOCUMENT_FIELDS = 'id,name,mimeType,modifiedTime,createdTime,trashed,starred,shared,ownedByMe,webViewLink,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress)';
  var DOCUMENT_LIST_FIELDS = 'nextPageToken,files(' + DOCUMENT_FIELDS + ')';
  var COMMENT_FIELDS = 'id,author(displayName,emailAddress,photoLink),content,createdTime,modifiedTime,resolved,quotedFileContent(mimeType,value),anchor,replies(id,author(displayName,emailAddress,photoLink),content,createdTime,modifiedTime,action)';
  var COMMENT_LIST_FIELDS = 'nextPageToken,comments(' + COMMENT_FIELDS + ')';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string' };
  var BOOLEAN = { type: 'boolean' };
  var EMPTY_PARAMS = schema({}, []);
  var DOCUMENT_ID_OPTIONAL = { type: 'string', description: 'Google Docs document ID. Defaults to the document open in the current editor tab.' };
  var DOCUMENT_ID_REQUIRED = { type: 'string', description: 'Google Docs document ID' };
  var GET_DOCUMENT_PARAMS = schema({
    document_id: DOCUMENT_ID_OPTIONAL,
    tab_id: { type: 'string', description: 'Optional tab ID to mark as selected' }
  }, []);
  var GET_DOCUMENT_TEXT_PARAMS = schema({ document_id: DOCUMENT_ID_OPTIONAL }, []);
  var LIST_COMMENTS_PARAMS = schema({
    document_id: DOCUMENT_ID_OPTIONAL,
    status: { type: 'string', enum: ['open', 'resolved', 'all'] },
    include_orphaned: BOOLEAN,
    page_size: intField('Maximum comments to return', 1, 100),
    page_token: STRING,
    include_deleted: BOOLEAN
  }, []);
  var LIST_RECENT_PARAMS = schema({
    page_size: intField('Maximum documents to return', 1, 100),
    page_token: STRING,
    include_trashed: BOOLEAN
  }, []);
  var SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search text to match against document titles and indexed content' },
    page_size: intField('Maximum documents to return', 1, 100),
    page_token: STRING,
    include_trashed: BOOLEAN
  }, ['query']);

  var COPY_DOCUMENT_PARAMS = schema({
    document_id: { type: 'string', description: 'Google Docs document ID to copy' },
    name: STRING,
    folder_id: STRING,
    description: STRING
  }, ['document_id']);
  var CREATE_COMMENT_PARAMS = schema({
    document_id: DOCUMENT_ID_OPTIONAL,
    content: { type: 'string', minLength: 1 },
    quoted_text: STRING
  }, ['content']);
  var CREATE_DOCUMENT_PARAMS = schema({
    name: { type: 'string', minLength: 1 },
    folder_id: STRING,
    description: STRING
  }, ['name']);
  var COMMENT_ID_PARAMS = schema({
    document_id: DOCUMENT_ID_OPTIONAL,
    comment_id: { type: 'string', description: 'Comment thread ID' }
  }, ['comment_id']);
  var DELETE_DOCUMENT_PARAMS = schema({
    document_id: { type: 'string', description: 'Google Docs document ID to delete permanently' }
  }, ['document_id']);
  var DELETE_REPLY_PARAMS = schema({
    document_id: DOCUMENT_ID_OPTIONAL,
    comment_id: { type: 'string', description: 'Comment thread ID' },
    reply_id: { type: 'string', description: 'Reply ID' }
  }, ['comment_id', 'reply_id']);
  var REPLY_PARAMS = schema({
    document_id: DOCUMENT_ID_OPTIONAL,
    comment_id: { type: 'string', description: 'Comment thread ID' },
    content: { type: 'string', minLength: 1 }
  }, ['comment_id', 'content']);
  var RESTORE_TRASH_PARAMS = schema({
    document_id: { type: 'string', description: 'Google Docs document ID' }
  }, ['document_id']);
  var UPDATE_TITLE_PARAMS = schema({
    document_id: { type: 'string', description: 'Google Docs document ID to rename' },
    title: { type: 'string', minLength: 1 }
  }, ['document_id', 'title']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function intField(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
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
      reason: reason || 'gdocs-auth-or-shape-mismatch',
      fellBackToDom: true
    });
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

  function driveQueryValue(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function clampInt(value, fallbackValue, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) { n = fallbackValue; }
    n = Math.floor(n);
    if (n < min) { return min; }
    if (n > max) { return max; }
    return n;
  }

  function activeUrl(ctx) {
    var fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (var i = 0; i < fields.length; i++) {
      var value = ctx && ctx[fields[i]];
      if (typeof value === 'string' && value) { return value; }
    }
    return '';
  }

  function currentDocumentContext(ctx) {
    var url = activeUrl(ctx);
    try {
      var parsed = new URL(url);
      if (parsed.origin !== ORIGIN) { return null; }
      var match = parsed.pathname.match(/\/document\/d\/([^/]+)/);
      if (!match || !match[1]) { return null; }
      return {
        documentId: decodeURIComponent(match[1]),
        tabId: parsed.searchParams.get('tab') || '',
        url: url
      };
    } catch (err) {
      return null;
    }
  }

  function resolveDocumentId(args, ctx, slug) {
    if (args && typeof args.document_id === 'string' && args.document_id) {
      return { documentId: args.document_id };
    }
    var current = currentDocumentContext(ctx);
    if (current && current.documentId) { return current; }
    return { error: fallback(slug, 'gdocs-document-id-unavailable') };
  }

  function spec(url, accept) {
    return {
      url: url,
      method: 'GET',
      headers: { 'Accept': accept || 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function driveSpec(path, pairs) {
    return spec(DRIVE_BASE + path + buildQuery(pairs || []), 'application/json');
  }

  function textSpec(documentId) {
    return spec(ORIGIN + '/document/d/' + encodeSegment(documentId) + '/export?format=txt', 'text/plain');
  }

  function resultFailed(result) {
    var status = Number((result && result.status) || 0);
    return !result || result.success !== true || result.redirected || status === 401 || status === 403 || status >= 400;
  }

  function looksLikeError(value) {
    return isObject(value) && (
      isObject(value.error) ||
      typeof value.error === 'string' ||
      typeof value.message === 'string' ||
      Array.isArray(value.errors)
    );
  }

  function withData(result, data) {
    var out = {};
    for (var key in result) {
      if (Object.prototype.hasOwnProperty.call(result, key)) { out[key] = result[key]; }
    }
    out.data = data;
    return out;
  }

  async function readDrive(slug, requestSpec, ctx, mapper) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'gdocs-execute-bound-spec-unavailable');
    }
    var result = await ctx.executeBoundSpec(requestSpec, ctx.tabId);
    if (resultFailed(result)) { return fallback(slug, 'gdocs-drive-read-failed'); }
    if (looksLikeError(result.data)) { return fallback(slug, 'gdocs-drive-error-envelope'); }
    try {
      return withData(result, mapper ? mapper(result.data, result) : result.data);
    } catch (err) {
      return fallback(slug, 'gdocs-drive-shape-mismatch');
    }
  }

  function mapUser(user) {
    user = isObject(user) ? user : {};
    return {
      display_name: str(user.displayName),
      email: str(user.emailAddress),
      permission_id: str(user.permissionId),
      photo_link: str(user.photoLink)
    };
  }

  function mapStorageQuota(quota) {
    quota = isObject(quota) ? quota : {};
    return {
      limit_bytes: str(quota.limit),
      usage_bytes: str(quota.usage),
      usage_in_drive_bytes: str(quota.usageInDrive),
      usage_in_trash_bytes: str(quota.usageInDriveTrash)
    };
  }

  function mapDocument(file) {
    file = isObject(file) ? file : {};
    var owners = list(file.owners);
    var owner = isObject(owners[0]) ? owners[0] : {};
    var modifier = isObject(file.lastModifyingUser) ? file.lastModifyingUser : {};
    return {
      id: str(file.id),
      title: str(file.name),
      mime_type: str(file.mimeType),
      created_time: str(file.createdTime),
      modified_time: str(file.modifiedTime),
      trashed: bool(file.trashed),
      starred: bool(file.starred),
      shared: bool(file.shared),
      owned_by_me: bool(file.ownedByMe),
      web_view_link: str(file.webViewLink),
      owner: str(owner.displayName),
      owner_email: str(owner.emailAddress),
      last_modified_by: str(modifier.displayName)
    };
  }

  function mapTab(tab, currentId) {
    tab = isObject(tab) ? tab : {};
    var id = str(tab.id);
    return {
      id: id,
      title: str(tab.title || (id ? 'Current tab' : 'Main body')),
      index: Number.isFinite(Number(tab.index)) ? Number(tab.index) : 0,
      parent_id: str(tab.parentId),
      is_current_tab: id === str(currentId || '')
    };
  }

  function currentTabFromArgs(args, ctx) {
    var current = currentDocumentContext(ctx);
    var tabId = args && typeof args.tab_id === 'string' ? args.tab_id : '';
    if (!tabId && current) { tabId = current.tabId; }
    return mapTab({ id: tabId, title: tabId ? 'Current tab' : 'Main body', index: 0, parentId: '' }, tabId);
  }

  function mapReply(reply) {
    reply = isObject(reply) ? reply : {};
    var author = isObject(reply.author) ? reply.author : {};
    return {
      id: str(reply.id),
      author: str(author.displayName),
      author_email: str(author.emailAddress),
      content: str(reply.content),
      created_time: str(reply.createdTime),
      modified_time: str(reply.modifiedTime),
      action: str(reply.action)
    };
  }

  function mapComment(comment) {
    comment = isObject(comment) ? comment : {};
    var author = isObject(comment.author) ? comment.author : {};
    var quoted = isObject(comment.quotedFileContent) ? comment.quotedFileContent : {};
    return {
      id: str(comment.id),
      author: str(author.displayName),
      author_email: str(author.emailAddress),
      content: str(comment.content),
      created_time: str(comment.createdTime),
      modified_time: str(comment.modifiedTime),
      resolved: bool(comment.resolved),
      quoted_text: str(quoted.value),
      anchor: str(comment.anchor),
      replies: list(comment.replies).map(mapReply)
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  function readHandler(slug, params, handle) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      handle: handle
    };
  }

  var handlers = {
    'gdocs.get_current_document': readHandler('gdocs.get_current_document', EMPTY_PARAMS, async function(args, ctx) {
      var resolved = resolveDocumentId(args, ctx, 'gdocs.get_current_document');
      if (resolved.error) { return resolved.error; }
      return readDrive('gdocs.get_current_document',
        driveSpec('/files/' + encodeSegment(resolved.documentId), [['fields', DOCUMENT_FIELDS]]),
        ctx,
        function(data) {
          var activeTab = currentTabFromArgs({}, ctx);
          return { document: mapDocument(data), active_tab: activeTab, tabs: [activeTab] };
        });
    }),

    'gdocs.get_current_user': readHandler('gdocs.get_current_user', EMPTY_PARAMS, async function(_args, ctx) {
      return readDrive('gdocs.get_current_user',
        driveSpec('/about', [['fields', 'user(displayName,emailAddress,permissionId,photoLink),storageQuota']]),
        ctx,
        function(data) {
          data = isObject(data) ? data : {};
          return { user: mapUser(data.user), storage_quota: mapStorageQuota(data.storageQuota) };
        });
    }),

    'gdocs.get_document': readHandler('gdocs.get_document', GET_DOCUMENT_PARAMS, async function(args, ctx) {
      var resolved = resolveDocumentId(args, ctx, 'gdocs.get_document');
      if (resolved.error) { return resolved.error; }
      return readDrive('gdocs.get_document',
        driveSpec('/files/' + encodeSegment(resolved.documentId), [['fields', DOCUMENT_FIELDS]]),
        ctx,
        function(data) {
          var selected = currentTabFromArgs(args || {}, ctx);
          return { document: mapDocument(data), selected_tab: selected, tabs: [selected] };
        });
    }),

    'gdocs.get_document_text': readHandler('gdocs.get_document_text', GET_DOCUMENT_TEXT_PARAMS, async function(args, ctx) {
      var resolved = resolveDocumentId(args, ctx, 'gdocs.get_document_text');
      if (resolved.error) { return resolved.error; }
      var meta = await readDrive('gdocs.get_document_text',
        driveSpec('/files/' + encodeSegment(resolved.documentId), [['fields', 'id,name']]),
        ctx,
        function(data) { return { id: str(data && data.id), title: str(data && data.name) }; });
      if (!meta || meta.success !== true) { return meta; }
      if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
        return fallback('gdocs.get_document_text', 'gdocs-execute-bound-spec-unavailable');
      }
      var text = await ctx.executeBoundSpec(textSpec(resolved.documentId), ctx.tabId);
      if (resultFailed(text)) { return fallback('gdocs.get_document_text', 'gdocs-document-export-failed'); }
      return withData(text, {
        document_id: resolved.documentId,
        title: str(meta.data && meta.data.title),
        text: str(text.text !== undefined && text.text !== null ? text.text : text.data)
      });
    }),

    'gdocs.list_comments': readHandler('gdocs.list_comments', LIST_COMMENTS_PARAMS, async function(args, ctx) {
      var resolved = resolveDocumentId(args, ctx, 'gdocs.list_comments');
      if (resolved.error) { return resolved.error; }
      return readDrive('gdocs.list_comments',
        driveSpec('/files/' + encodeSegment(resolved.documentId) + '/comments', [
          ['fields', COMMENT_LIST_FIELDS],
          ['includeDeleted', args && args.include_deleted === true ? 'true' : undefined],
          ['pageSize', clampInt(args && args.page_size, 50, 1, 100)],
          ['pageToken', args && args.page_token]
        ]),
        ctx,
        function(data) {
          var status = args && args.status ? args.status : 'open';
          var comments = list(data && data.comments).map(mapComment);
          if (status === 'open') {
            comments = comments.filter(function(c) { return c.resolved !== true; });
          } else if (status === 'resolved') {
            comments = comments.filter(function(c) { return c.resolved === true; });
          }
          return { comments: comments, next_page_token: str(data && data.nextPageToken) };
        });
    }),

    'gdocs.list_recent_documents': readHandler('gdocs.list_recent_documents', LIST_RECENT_PARAMS, async function(args, ctx) {
      var clauses = ["mimeType = '" + DOCUMENT_MIME_TYPE + "'"];
      if (!(args && args.include_trashed === true)) { clauses.push('trashed = false'); }
      return readDrive('gdocs.list_recent_documents',
        driveSpec('/files', [
          ['q', clauses.join(' and ')],
          ['orderBy', 'viewedByMeTime desc,modifiedTime desc'],
          ['pageSize', clampInt(args && args.page_size, 20, 1, 100)],
          ['pageToken', args && args.page_token],
          ['fields', DOCUMENT_LIST_FIELDS]
        ]),
        ctx,
        function(data) {
          return {
            documents: list(data && data.files).map(mapDocument),
            next_page_token: str(data && data.nextPageToken)
          };
        });
    }),

    'gdocs.search_documents': readHandler('gdocs.search_documents', SEARCH_PARAMS, async function(args, ctx) {
      var escaped = driveQueryValue(args && args.query);
      var clauses = [
        "mimeType = '" + DOCUMENT_MIME_TYPE + "'",
        "(name contains '" + escaped + "' or fullText contains '" + escaped + "')"
      ];
      if (!(args && args.include_trashed === true)) { clauses.push('trashed = false'); }
      return readDrive('gdocs.search_documents',
        driveSpec('/files', [
          ['q', clauses.join(' and ')],
          ['pageSize', clampInt(args && args.page_size, 20, 1, 100)],
          ['pageToken', args && args.page_token],
          ['fields', DOCUMENT_LIST_FIELDS]
        ]),
        ctx,
        function(data) {
          return {
            documents: list(data && data.files).map(mapDocument),
            next_page_token: str(data && data.nextPageToken)
          };
        });
    }),

    'gdocs.copy_document': guarded('gdocs.copy_document', 'write', COPY_DOCUMENT_PARAMS, 'gdocs-copy-document-live-uat-required'),
    'gdocs.create_comment': guarded('gdocs.create_comment', 'write', CREATE_COMMENT_PARAMS, 'gdocs-create-comment-live-uat-required'),
    'gdocs.create_document': guarded('gdocs.create_document', 'write', CREATE_DOCUMENT_PARAMS, 'gdocs-create-document-live-uat-required'),
    'gdocs.delete_comment': guarded('gdocs.delete_comment', 'destructive', COMMENT_ID_PARAMS, 'gdocs-delete-comment-live-uat-required'),
    'gdocs.delete_document': guarded('gdocs.delete_document', 'destructive', DELETE_DOCUMENT_PARAMS, 'gdocs-delete-document-live-uat-required'),
    'gdocs.delete_reply': guarded('gdocs.delete_reply', 'destructive', DELETE_REPLY_PARAMS, 'gdocs-delete-reply-live-uat-required'),
    'gdocs.reopen_comment': guarded('gdocs.reopen_comment', 'write', COMMENT_ID_PARAMS, 'gdocs-reopen-comment-live-uat-required'),
    'gdocs.reply_to_comment': guarded('gdocs.reply_to_comment', 'write', REPLY_PARAMS, 'gdocs-reply-to-comment-live-uat-required'),
    'gdocs.resolve_comment': guarded('gdocs.resolve_comment', 'write', COMMENT_ID_PARAMS, 'gdocs-resolve-comment-live-uat-required'),
    'gdocs.restore_document': guarded('gdocs.restore_document', 'write', RESTORE_TRASH_PARAMS, 'gdocs-restore-document-live-uat-required'),
    'gdocs.trash_document': guarded('gdocs.trash_document', 'write', RESTORE_TRASH_PARAMS, 'gdocs-trash-document-live-uat-required'),
    'gdocs.update_document_title': guarded('gdocs.update_document_title', 'write', UPDATE_TITLE_PARAMS, 'gdocs-update-document-title-live-uat-required')
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

  global.FsbHandlerGdocs = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
