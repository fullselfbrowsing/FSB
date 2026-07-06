(function (global) {
  'use strict';

  /**
   * Google Drive GAPI page-read READ head.
   *
   * Drive reads execute through the existing bounded MAIN-world page-read
   * primitive so the Drive page-owned gapi client performs GET requests with the
   * user's active session. File, permission, trash, and destructive operations
   * remain guarded fail-closed until live mutation-body UAT records exact request
   * safety evidence.
   */

  var ORIGIN = 'https://drive.google.com';
  var SERVICE = 'drive.google.com';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string' };
  var STRING_ID = { type: 'string', minLength: 1 };
  var BOOLEAN = { type: 'boolean' };
  var EMPTY_PARAMS = schema({}, []);
  var FILE_ID_PARAMS = schema({
    file_id: { type: 'string', description: 'File or folder ID' }
  }, ['file_id']);
  var GET_FILE_PARAMS = FILE_ID_PARAMS;
  var LIST_FILES_PARAMS = schema({
    parent_id: { type: 'string', description: 'Parent folder ID to list contents of. Defaults to root.' },
    page_size: integer(1, 1000, 'Maximum number of files to return'),
    page_token: STRING,
    order_by: STRING,
    include_trashed: BOOLEAN
  }, []);
  var SEARCH_FILES_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search text to match against file names and content' },
    mime_type: STRING,
    page_size: integer(1, 1000, 'Maximum number of files to return'),
    page_token: STRING,
    include_trashed: BOOLEAN
  }, ['query']);

  var COPY_FILE_PARAMS = schema({
    file_id: { type: 'string', description: 'File ID to copy' },
    name: STRING,
    parent_id: STRING
  }, ['file_id']);
  var CREATE_FILE_PARAMS = schema({
    name: STRING_ID,
    mime_type: STRING,
    parent_id: STRING,
    description: STRING
  }, ['name']);
  var CREATE_FOLDER_PARAMS = schema({
    name: STRING_ID,
    parent_id: STRING,
    description: STRING
  }, ['name']);
  var CREATE_PERMISSION_PARAMS = schema({
    file_id: STRING_ID,
    type: { type: 'string', enum: ['user', 'group', 'domain', 'anyone'] },
    role: { type: 'string', enum: ['reader', 'commenter', 'writer', 'fileOrganizer', 'organizer'] },
    email: STRING,
    domain: STRING,
    send_notification: BOOLEAN
  }, ['file_id', 'type', 'role']);
  var DELETE_PERMISSION_PARAMS = schema({
    file_id: STRING_ID,
    permission_id: STRING_ID
  }, ['file_id', 'permission_id']);
  var MOVE_FILE_PARAMS = schema({
    file_id: STRING_ID,
    from_parent_id: STRING_ID,
    to_parent_id: STRING_ID
  }, ['file_id', 'from_parent_id', 'to_parent_id']);
  var UPDATE_FILE_PARAMS = schema({
    file_id: STRING_ID,
    name: STRING,
    description: STRING,
    starred: BOOLEAN
  }, ['file_id']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function integer(min, max, description) {
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
      reason: reason || 'gdrive-auth-or-shape-mismatch',
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

  function looksLikeError(value) {
    return isObject(value) && (
      isObject(value.error) ||
      typeof value.error === 'string' ||
      typeof value.message === 'string' ||
      Array.isArray(value.errors)
    );
  }

  function resultFailed(result) {
    var status = Number((result && result.status) || 0);
    return !result || result.success !== true || status === 401 || status === 403 || status >= 400;
  }

  function withData(result, data) {
    var out = {};
    for (var key in result) {
      if (Object.prototype.hasOwnProperty.call(result, key)) { out[key] = result[key]; }
    }
    out.data = data;
    return out;
  }

  function mapUser(user) {
    user = user || {};
    return {
      display_name: str(user.displayName),
      email: str(user.emailAddress),
      permission_id: str(user.permissionId),
      photo_link: str(user.photoLink)
    };
  }

  function mapStorageQuota(quota) {
    quota = quota || {};
    return {
      limit: str(quota.limit),
      usage: str(quota.usage),
      usage_in_drive: str(quota.usageInDrive),
      usage_in_drive_trash: str(quota.usageInDriveTrash)
    };
  }

  function mapPerson(person) {
    person = person || {};
    return {
      display_name: str(person.displayName),
      email: str(person.emailAddress)
    };
  }

  function mapFile(file) {
    file = file || {};
    return {
      id: str(file.id),
      name: str(file.name),
      mime_type: str(file.mimeType),
      modified_time: str(file.modifiedTime),
      created_time: str(file.createdTime),
      size: str(file.size),
      parents: list(file.parents).map(str),
      trashed: bool(file.trashed),
      starred: bool(file.starred),
      shared: bool(file.shared),
      web_view_link: str(file.webViewLink),
      icon_link: str(file.iconLink),
      description: file.description === undefined ? null : file.description,
      owners: list(file.owners).map(mapPerson),
      last_modifying_user: mapPerson(file.lastModifyingUser)
    };
  }

  function mapPermission(permission) {
    permission = permission || {};
    return {
      id: str(permission.id),
      type: str(permission.type),
      role: str(permission.role),
      email: str(permission.emailAddress),
      display_name: str(permission.displayName),
      domain: str(permission.domain)
    };
  }

  function parsePageResult(result, slug) {
    if (resultFailed(result)) {
      return { error: fallback(slug, result && result.reason ? result.reason : 'gdrive-page-read-failed') };
    }
    var data = result.data;
    if ((!isObject(data) && !Array.isArray(data)) || looksLikeError(data)) {
      return { error: fallback(slug, 'gdrive-api-error-envelope') };
    }
    return { data: data };
  }

  function readHandler(slug, params, action, mapper) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
          return fallback(slug, 'gdrive-page-read-primitive-unavailable');
        }
        var result = await ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'gdrive',
          action: action,
          args: args || {}
        }, ctx.tabId);
        var parsed = parsePageResult(result, slug);
        if (parsed.error) { return parsed.error; }
        try {
          return withData(result, mapper(parsed.data));
        } catch (err) {
          return fallback(slug, 'gdrive-api-shape-mismatch');
        }
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason || 'gdrive-mutation-uat-required');
      }
    };
  }

  var handlers = {
    'gdrive.get_current_user': readHandler('gdrive.get_current_user', EMPTY_PARAMS, 'get_current_user', function(data) {
      return {
        user: mapUser(data.user),
        storage_quota: mapStorageQuota(data.storageQuota)
      };
    }),
    'gdrive.get_file': readHandler('gdrive.get_file', GET_FILE_PARAMS, 'get_file', function(data) {
      return { file: mapFile(data) };
    }),
    'gdrive.get_storage_quota': readHandler('gdrive.get_storage_quota', EMPTY_PARAMS, 'get_storage_quota', function(data) {
      return { storage_quota: mapStorageQuota(data.storageQuota) };
    }),
    'gdrive.list_files': readHandler('gdrive.list_files', LIST_FILES_PARAMS, 'list_files', function(data) {
      return {
        files: list(data.files).map(mapFile),
        next_page_token: str(data.nextPageToken)
      };
    }),
    'gdrive.list_permissions': readHandler('gdrive.list_permissions', FILE_ID_PARAMS, 'list_permissions', function(data) {
      return { permissions: list(data.permissions).map(mapPermission) };
    }),
    'gdrive.search_files': readHandler('gdrive.search_files', SEARCH_FILES_PARAMS, 'search_files', function(data) {
      return {
        files: list(data.files).map(mapFile),
        next_page_token: str(data.nextPageToken)
      };
    }),

    'gdrive.copy_file': guarded('gdrive.copy_file', 'write', COPY_FILE_PARAMS, 'unverified-gdrive-copy-file-mutation'),
    'gdrive.create_file': guarded('gdrive.create_file', 'write', CREATE_FILE_PARAMS, 'unverified-gdrive-create-file-mutation'),
    'gdrive.create_folder': guarded('gdrive.create_folder', 'write', CREATE_FOLDER_PARAMS, 'unverified-gdrive-create-folder-mutation'),
    'gdrive.create_permission': guarded('gdrive.create_permission', 'write', CREATE_PERMISSION_PARAMS, 'unverified-gdrive-create-permission-mutation'),
    'gdrive.delete_file': guarded('gdrive.delete_file', 'destructive', FILE_ID_PARAMS, 'unverified-gdrive-delete-file-mutation'),
    'gdrive.delete_permission': guarded('gdrive.delete_permission', 'destructive', DELETE_PERMISSION_PARAMS, 'unverified-gdrive-delete-permission-mutation'),
    'gdrive.empty_trash': guarded('gdrive.empty_trash', 'destructive', EMPTY_PARAMS, 'unverified-gdrive-empty-trash-mutation'),
    'gdrive.move_file': guarded('gdrive.move_file', 'write', MOVE_FILE_PARAMS, 'unverified-gdrive-move-file-mutation'),
    'gdrive.restore_file': guarded('gdrive.restore_file', 'write', FILE_ID_PARAMS, 'unverified-gdrive-restore-file-mutation'),
    'gdrive.trash_file': guarded('gdrive.trash_file', 'write', FILE_ID_PARAMS, 'unverified-gdrive-trash-file-mutation'),
    'gdrive.update_file': guarded('gdrive.update_file', 'write', UPDATE_FILE_PARAMS, 'unverified-gdrive-update-file-mutation')
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

  global.FsbHandlerGdrive = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
