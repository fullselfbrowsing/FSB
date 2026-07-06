(function (global) {
  'use strict';

  /**
   * Retool same-origin READ + guarded mutation head.
   *
   * Retool's first-party browser API uses relative /api paths and an xsrfToken
   * cookie copied into X-Xsrf-Token. Reads below use executeBoundSpec's cookie
   * csrfSource path only. Mutation and save-like rows stay guarded fail-closed
   * until live mutation-body UAT records exact method, body, CSRF, and redaction
   * evidence.
   */

  var RETOOL_ORIGIN = 'https://retool.com';
  var RETOOL_SERVICE = 'retool.com';
  var RETOOL_API_BASE = RETOOL_ORIGIN + '/api';
  var INT_LIMIT = 9007199254740991;
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
    var out = { type: 'string' };
    if (description) { out.description = description; }
    return out;
  }

  function numberField(description) {
    var out = { type: 'number' };
    if (description) { out.description = description; }
    return out;
  }

  function integerField(description, min, max) {
    var out = {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max
    };
    if (description) { out.description = description; }
    return out;
  }

  function booleanField(description) {
    var out = { type: 'boolean' };
    if (description) { out.description = description; }
    return out;
  }

  function objectField(description) {
    var out = {
      type: 'object',
      propertyNames: { type: 'string' },
      additionalProperties: {}
    };
    if (description) { out.description = description; }
    return out;
  }

  var EMPTY_PARAMS = schema({});
  var PAGE_UUID_PARAMS = schema({
    page_uuid: stringField('App UUID')
  }, ['page_uuid']);
  var APP_STATE_PARAMS = schema({
    page_uuid: stringField('App UUID'),
    app_state: stringField('Transit-encoded app state JSON string'),
    commit_message: stringField('Optional commit message describing the change'),
    branch_name: stringField('Optional source-control branch name to save into')
  }, ['page_uuid', 'app_state']);
  var FORCE_SAVE_PARAMS = schema({
    page_uuid: stringField('UUID of the app currently open in the targeted Retool editor tab'),
    trigger: {
      type: 'string',
      enum: ['manual', 'imported', 'forced'],
      description: 'Retool save trigger label to use for the editor save. Defaults to manual.'
    }
  }, ['page_uuid']);
  var PAGE_PATH_PARAMS = schema({
    page_path: stringField('Page path or name to look up')
  }, ['page_path']);
  var RESOURCE_ID_PARAMS = schema({
    resource_id: numberField('Resource ID')
  }, ['resource_id']);
  var WORKFLOW_ID_PARAMS = schema({
    workflow_id: stringField('Workflow ID')
  }, ['workflow_id']);
  var WORKFLOW_BRANCH_PARAMS = schema({
    workflow_id: stringField('Workflow ID'),
    branch_name: stringField('Source control branch name')
  }, ['workflow_id']);
  var RUN_ID_PARAMS = schema({
    run_id: stringField('Workflow run ID')
  }, ['run_id']);
  var LIST_WORKFLOW_RUNS_PARAMS = schema({
    workflow_id: stringField('Workflow ID'),
    limit: integerField('Max results per page (default 20)', 1, 100),
    offset: integerField('Offset for pagination (default 0)', 0, INT_LIMIT)
  }, ['workflow_id']);
  var CHANGE_USER_NAME_PARAMS = schema({
    first_name: stringField('New first name'),
    last_name: stringField('New last name')
  }, ['first_name', 'last_name']);
  var CLONE_APP_PARAMS = schema({
    page_uuid: stringField('App UUID to clone'),
    new_name: stringField('Name for the cloned app'),
    folder_id: numberField('Optional destination folder ID')
  }, ['page_uuid', 'new_name']);
  var CREATE_APP_PARAMS = schema({
    name: stringField('Name for the new app'),
    folder_id: numberField('Folder ID to create the app in')
  }, ['name', 'folder_id']);
  var CREATE_ARCHIVE_PARAMS = schema({
    name: stringField('Name for the new Retool app'),
    folder_id: numberField('Folder ID to create the app in'),
    base64_zip: stringField('Base64-encoded Toolscript ZIP archive'),
    file_name: stringField('Optional archive file name')
  }, ['name', 'folder_id', 'base64_zip']);
  var FOLDER_NAME_PARAMS = schema({
    name: stringField('Folder name'),
    parent_folder_id: numberField('Optional parent folder ID')
  }, ['name']);
  var RENAME_FOLDER_PARAMS = schema({
    folder_id: numberField('Folder ID to rename'),
    new_name: stringField('New name for the folder')
  }, ['folder_id', 'new_name']);
  var FOLDER_ID_PARAMS = schema({
    folder_id: numberField('Folder ID')
  }, ['folder_id']);
  var CREATE_RESOURCE_PARAMS = schema({
    display_name: stringField('Human-readable name for the resource'),
    type: stringField('Resource type'),
    options: objectField('Connection/resource options')
  }, ['display_name', 'type']);
  var CREATE_RESOURCE_FOLDER_PARAMS = schema({
    name: stringField('Name for the new resource folder'),
    parent_resource_folder_id: numberField('Parent resource folder ID')
  }, ['name', 'parent_resource_folder_id']);
  var RESOURCE_FOLDER_ID_PARAMS = schema({
    resource_folder_id: numberField('Resource folder ID')
  }, ['resource_folder_id']);
  var MOVE_RESOURCE_PARAMS = schema({
    resource_id: numberField('Resource ID to move'),
    resource_folder_id: numberField('Destination resource folder ID')
  }, ['resource_id', 'resource_folder_id']);
  var EXPORT_ARCHIVE_PARAMS = schema({
    page_uuid: stringField('App UUID to export'),
    file_name: stringField('Optional ZIP file name'),
    branch_name: stringField('Optional source-control branch name to export'),
    per_page_position_json_files: booleanField('Whether to emit per-page position JSON files'),
    download_to_browser: booleanField('Whether to also start a browser download')
  }, ['page_uuid']);
  var UPDATE_ARCHIVE_PARAMS = schema({
    page_uuid: stringField('App UUID to update'),
    base64_zip: stringField('Base64-encoded Toolscript ZIP archive'),
    file_name: stringField('Optional archive file name'),
    branch_name: stringField('Optional source-control branch name')
  }, ['page_uuid', 'base64_zip']);
  var COMPONENT_PARAMS = schema({
    page_uuid: stringField('App UUID'),
    component_id: stringField('Unique component ID'),
    component_type: stringField('Widget subtype'),
    properties: objectField('Template properties for the widget'),
    position: schema({
      row: numberField('Grid row'),
      col: numberField('Grid column'),
      width: numberField('Width in grid columns'),
      height: numberField('Height in grid rows')
    }, ['row', 'col', 'width', 'height'])
  }, ['page_uuid', 'component_id', 'component_type', 'properties', 'position']);
  var QUERY_PARAMS = schema({
    page_uuid: stringField('App UUID'),
    query_id: stringField('Unique query ID'),
    resource_name: stringField('Resource display name or UUID'),
    query_type: {
      type: 'string',
      enum: ['sql', 'RESTQuery', 'grpc'],
      description: 'Query type'
    },
    query_string: stringField('SQL, REST URL path, or gRPC method name'),
    run_on_page_load: booleanField('Whether to run when the page loads'),
    additional_properties: objectField('Extra query template properties')
  }, ['page_uuid', 'query_id', 'resource_name', 'query_type', 'query_string']);
  var RUN_QUERY_PARAMS = schema({
    resource_name: stringField('Resource display name or internal UUID'),
    query: stringField('SQL query to execute')
  }, ['resource_name', 'query']);
  var RUN_GRPC_PARAMS = schema({
    resource_name: stringField('Resource display name or internal UUID'),
    method_name: stringField('gRPC method name'),
    body: stringField('JSON request body for the gRPC method'),
    metadata: {
      type: 'object',
      propertyNames: { type: 'string' },
      additionalProperties: { type: 'string' },
      description: 'Optional gRPC metadata headers'
    }
  }, ['resource_name', 'method_name', 'body']);

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
      reason: reason || 'retool-logged-out-or-rot',
      fellBackToDom: true
    });
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

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function buildGetSpec(path, pairs, accept) {
    return {
      url: RETOOL_API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': accept || 'application/json',
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

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function looksLikeRetoolError(data) {
    return isPlainObject(data)
      && (typeof data.error === 'string'
        || isPlainObject(data.error)
        || typeof data.message === 'string'
        || Array.isArray(data.errors)
        || typeof data.statusCode === 'number');
  }

  function failedHttp(result) {
    var status = Number(result && result.status || 0);
    return !!(result && (result.redirected || status === 401 || status === 403 || status >= 400));
  }

  function hasArray(data, key) {
    return Object.prototype.hasOwnProperty.call(data, key) && Array.isArray(data[key]);
  }

  function hasObject(data, key) {
    return Object.prototype.hasOwnProperty.call(data, key) && isPlainObject(data[key]);
  }

  function guardObjectData(data) {
    return isPlainObject(data) && !looksLikeRetoolError(data);
  }

  function guardObjectKeyData(key) {
    return function(data) {
      return guardObjectData(data) && hasObject(data, key);
    };
  }

  function guardArrayData(data) {
    return Array.isArray(data);
  }

  function guardAnyArrayData(keys) {
    return function(data) {
      if (!guardObjectData(data)) { return false; }
      for (var i = 0; i < keys.length; i++) {
        if (hasArray(data, keys[i])) { return true; }
      }
      return false;
    };
  }

  function dataFromResult(result, slug) {
    if (!result || result.success !== true) { return result; }
    if (failedHttp(result)) { return fallback(slug, 'retool-http-error'); }
    var data = result.data;
    // executeBoundSpec yields data:null (never undefined) when the body is not
    // JSON, with the raw body on result.text -- the == null check is what makes
    // this plain-text recovery reachable.
    if (data == null && typeof result.text === 'string') { data = result.text; }
    if (looksLikeRetoolError(data)) { return fallback(slug, 'retool-error-envelope'); }
    return data;
  }

  function withData(result, data) {
    var out = {};
    for (var k in result) {
      if (Object.prototype.hasOwnProperty.call(result, k)) { out[k] = result[k]; }
    }
    out.data = data;
    return out;
  }

  function readHandler(slug, params, buildPath, guard, transform, accept) {
    return {
      tier: 'T1a',
      origin: RETOOL_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'retool-execute-bound-spec-unavailable');
        }
        var a = args || {};
        var specInfo = buildPath(a);
        var result = await ctx.executeBoundSpec(
          buildGetSpec(specInfo.path, specInfo.query || [], accept),
          ctx.tabId
        );
        var data = dataFromResult(result, slug);
        if (!result || result.success !== true) { return data; }
        if (data && data.success === false && data.code === FALLBACK_CODE) { return data; }
        if (guard && !guard(data)) { return fallback(slug, 'retool-api-shape-mismatch'); }
        return transform ? withData(result, transform(data, a)) : result;
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: RETOOL_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason || 'unverified-retool-mutation');
      }
    };
  }

  function pageUuidPath(suffix) {
    return function(a) {
      return { path: '/pages/uuids/' + encodeSegment(a.page_uuid) + (suffix || '') };
    };
  }

  function workflowPath(a) {
    return {
      path: '/workflow/' + encodeSegment(a.workflow_id),
      query: [['branchName', a.branch_name]]
    };
  }

  function findResource(data, a) {
    var resources = data && Array.isArray(data.resources) ? data.resources : [];
    for (var i = 0; i < resources.length; i++) {
      if (Number(resources[i] && resources[i].id) === Number(a.resource_id)) {
        return { resource: resources[i] };
      }
    }
    return { resource: null };
  }

  function guardResourceList(data) {
    return guardAnyArrayData(['resources'])(data);
  }

  function componentsFromAppState(data) {
    var appState = data && data.page && data.page.data && data.page.data.appState;
    if (typeof appState !== 'string' || !appState) { return { components: [] }; }
    var parsed;
    try { parsed = JSON.parse(appState); } catch (_e) { return { components: [] }; }
    var plugins = findPluginsMap(parsed);
    if (!plugins) { return { components: [] }; }
    var out = [];
    var entries = plugins[1] || [];
    for (var i = 0; i < entries.length; i += 2) {
      var id = entries[i];
      var plugin = extractPlugin(entries[i + 1]);
      if (plugin) {
        plugin.id = String(id || '');
        out.push(plugin);
      }
    }
    return { components: out };
  }

  function findPluginsMap(parsed) {
    if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) { return null; }
    var templateMap = parsed[1];
    var vIdx = templateMap.indexOf('v');
    if (vIdx === -1 || !Array.isArray(templateMap[vIdx + 1])) { return null; }
    var appMap = templateMap[vIdx + 1];
    for (var i = 1; i < appMap.length; i += 2) {
      if (appMap[i] === 'plugins' && Array.isArray(appMap[i + 1]) && appMap[i + 1][0] === '~#iOM') {
        return appMap[i + 1];
      }
    }
    return null;
  }

  function isTransitRecord(arr) {
    var tag = Array.isArray(arr) ? arr[0] : '';
    return tag === '~#iR' || (typeof tag === 'string' && tag.indexOf('^') === 0);
  }

  function extractPlugin(record) {
    if (!Array.isArray(record) || !isTransitRecord(record) || !Array.isArray(record[1])) { return null; }
    var map = record[1];
    var vIdx = map.indexOf('v');
    if (vIdx === -1 && map.length >= 5 && Array.isArray(map[4])) { vIdx = 3; }
    if (vIdx === -1 || !Array.isArray(map[vIdx + 1])) { return null; }
    var vals = map[vIdx + 1];
    var plugin = { type: '', subtype: '', container: '', position: null, properties: {} };
    for (var i = 1; i < vals.length; i += 2) {
      var key = vals[i];
      var val = vals[i + 1];
      if (key === 'type' || key === '^18') { plugin.type = String(val || ''); }
      else if (key === 'subtype' || key === '^19') { plugin.subtype = String(val || ''); }
      else if (key === 'container' || key === '^1C') { plugin.container = String(val || ''); }
      else if ((key === 'position2' || key === '^1?') && val != null) { plugin.position = extractPosition(val); }
      else if ((key === 'template' || key === '^1=') && val != null) { plugin.properties = extractTemplateProps(val); }
    }
    return plugin;
  }

  function extractPosition(pos) {
    if (!Array.isArray(pos) || !isTransitRecord(pos) || !Array.isArray(pos[1])) { return null; }
    var map = pos[1];
    var vIdx = map.indexOf('v');
    if (vIdx === -1 || !Array.isArray(map[vIdx + 1])) { return null; }
    var vals = map[vIdx + 1];
    var out = { row: 0, col: 0, width: 0, height: 0 };
    for (var i = 1; i < vals.length; i += 2) {
      if (vals[i] === 'row') { out.row = Number(vals[i + 1] || 0); }
      else if (vals[i] === 'col') { out.col = Number(vals[i + 1] || 0); }
      else if (vals[i] === 'width') { out.width = Number(vals[i + 1] || 0); }
      else if (vals[i] === 'height') { out.height = Number(vals[i + 1] || 0); }
    }
    return out;
  }

  function extractTemplateProps(template) {
    var props = {};
    if (!Array.isArray(template) || !Array.isArray(template[1])) { return props; }
    var entries = template[1];
    var important = {
      value: true,
      text: true,
      query: true,
      title: true,
      format: true,
      hidden: true,
      disabled: true,
      data: true,
      resourceName: true,
      httpMethod: true,
      type: true,
      padding: true
    };
    for (var i = 0; i < entries.length; i += 2) {
      var key = entries[i];
      var val = entries[i + 1];
      if (important[key] && val !== null && val !== undefined && val !== '' && val !== false) {
        props[key] = val;
      }
    }
    return props;
  }

  var handlers = {
    'retool.get_current_user': readHandler('retool.get_current_user', EMPTY_PARAMS, function () {
      return { path: '/user' };
    }, guardObjectKeyData('user')),
    'retool.get_organization': readHandler('retool.get_organization', EMPTY_PARAMS, function () {
      return { path: '/organization' };
    }, guardObjectKeyData('org')),
    'retool.get_source_control_settings': readHandler('retool.get_source_control_settings', EMPTY_PARAMS, function () {
      return { path: '/sourceControl/settings' };
    }, guardObjectKeyData('settings')),
    'retool.get_workflow_run_count': readHandler('retool.get_workflow_run_count', EMPTY_PARAMS, function () {
      return { path: '/workflowRun/getCountByWorkflow' };
    }, guardObjectKeyData('workflowRunsCountByWorkflow')),
    'retool.get_workflows_config': readHandler('retool.get_workflows_config', EMPTY_PARAMS, function () {
      return { path: '/workflow/workflowsConfiguration' };
    }, guardObjectData),
    'retool.list_agents': readHandler('retool.list_agents', EMPTY_PARAMS, function () {
      return { path: '/agents' };
    }, guardAnyArrayData(['agents'])),
    'retool.list_apps': readHandler('retool.list_apps', EMPTY_PARAMS, function () {
      return { path: '/pages' };
    }, guardAnyArrayData(['pages', 'folders'])),
    'retool.list_branches': readHandler('retool.list_branches', EMPTY_PARAMS, function () {
      return { path: '/branches' };
    }, guardAnyArrayData(['branches'])),
    'retool.list_environments': readHandler('retool.list_environments', EMPTY_PARAMS, function () {
      return { path: '/environments' };
    }, guardAnyArrayData(['environments'])),
    'retool.list_experiments': readHandler('retool.list_experiments', EMPTY_PARAMS, function () {
      return { path: '/experiments' };
    }, guardObjectData),
    'retool.list_grids': readHandler('retool.list_grids', EMPTY_PARAMS, function () {
      return { path: '/grid' };
    }, guardArrayData),
    'retool.list_page_names': readHandler('retool.list_page_names', EMPTY_PARAMS, function () {
      return { path: '/editor/pageNames' };
    }, guardAnyArrayData(['pageNames'])),
    'retool.list_playground_queries': readHandler('retool.list_playground_queries', EMPTY_PARAMS, function () {
      return { path: '/playground' };
    }, guardAnyArrayData(['userQueries', 'orgQueries'])),
    'retool.list_resources': readHandler('retool.list_resources', EMPTY_PARAMS, function () {
      return { path: '/resources' };
    }, guardAnyArrayData(['resources'])),
    'retool.list_user_spaces': readHandler('retool.list_user_spaces', EMPTY_PARAMS, function () {
      return { path: '/organization/userSpaces' };
    }, guardAnyArrayData(['userSpaces'])),
    'retool.list_workflows': readHandler('retool.list_workflows', EMPTY_PARAMS, function () {
      return { path: '/workflow/' };
    }, guardAnyArrayData(['workflowsMetadata', 'workflowFolders'])),

    'retool.get_app': readHandler('retool.get_app', PAGE_UUID_PARAMS, pageUuidPath(''), guardObjectKeyData('page')),
    'retool.get_app_docs': readHandler('retool.get_app_docs', PAGE_UUID_PARAMS, pageUuidPath('/documentation'), function(data) {
      return typeof data === 'string' || data === '' || guardObjectData(data);
    }, null, 'text/plain,application/json'),
    'retool.get_app_state': readHandler('retool.get_app_state', PAGE_UUID_PARAMS, pageUuidPath(''), function(data) {
      return guardObjectData(data) && data.page && data.page.data && typeof data.page.data.appState === 'string';
    }),
    'retool.get_resource': readHandler('retool.get_resource', RESOURCE_ID_PARAMS, function () {
      return { path: '/resources' };
    }, guardResourceList, findResource),
    'retool.get_workflow': readHandler('retool.get_workflow', WORKFLOW_BRANCH_PARAMS, workflowPath, guardObjectData),
    'retool.get_workflow_releases': readHandler('retool.get_workflow_releases', WORKFLOW_ID_PARAMS, function(a) {
      return { path: '/workflow/' + encodeSegment(a.workflow_id) + '/releases' };
    }, guardArrayData),
    'retool.get_workflow_run': readHandler('retool.get_workflow_run', RUN_ID_PARAMS, function(a) {
      return { path: '/workflowRun/' + encodeSegment(a.run_id) };
    }, guardObjectData),
    'retool.get_workflow_run_log': readHandler('retool.get_workflow_run_log', RUN_ID_PARAMS, function(a) {
      return { path: '/workflowRun/getLog', query: [['runId', a.run_id]] };
    }, function(data) {
      return guardObjectData(data) && (!Object.prototype.hasOwnProperty.call(data, 'logs') || Array.isArray(data.logs));
    }),
    'retool.list_app_tags': readHandler('retool.list_app_tags', PAGE_UUID_PARAMS, pageUuidPath('/tags'), guardAnyArrayData(['tags'])),
    'retool.list_components': readHandler('retool.list_components', PAGE_UUID_PARAMS, pageUuidPath(''), function(data) {
      return guardObjectData(data) && data.page && data.page.data && typeof data.page.data.appState === 'string';
    }, componentsFromAppState),
    'retool.list_page_saves': readHandler('retool.list_page_saves', PAGE_UUID_PARAMS, pageUuidPath('/saves'), guardAnyArrayData(['saves'])),
    'retool.list_workflow_triggers': readHandler('retool.list_workflow_triggers', WORKFLOW_ID_PARAMS, function(a) {
      return { path: '/workflowTrigger', query: [['workflowId', a.workflow_id]] };
    }, function(data) {
      return guardObjectData(data) &&
        (!Object.prototype.hasOwnProperty.call(data, 'deployedTriggers') || Array.isArray(data.deployedTriggers)) &&
        (!Object.prototype.hasOwnProperty.call(data, 'latestSavedTriggers') || Array.isArray(data.latestSavedTriggers));
    }),

    'retool.add_component': guarded('retool.add_component', 'write', COMPONENT_PARAMS, 'unverified-retool-page-mutation'),
    'retool.add_query': guarded('retool.add_query', 'write', QUERY_PARAMS, 'unverified-retool-page-mutation'),
    'retool.change_user_name': guarded('retool.change_user_name', 'write', CHANGE_USER_NAME_PARAMS, 'unverified-retool-user-mutation'),
    'retool.clone_app': guarded('retool.clone_app', 'write', CLONE_APP_PARAMS, 'unverified-retool-page-mutation'),
    'retool.create_app': guarded('retool.create_app', 'write', CREATE_APP_PARAMS, 'unverified-retool-page-mutation'),
    'retool.create_app_from_toolscript_archive': guarded('retool.create_app_from_toolscript_archive', 'write', CREATE_ARCHIVE_PARAMS, 'unverified-retool-page-mutation'),
    'retool.create_folder': guarded('retool.create_folder', 'write', FOLDER_NAME_PARAMS, 'unverified-retool-folder-mutation'),
    'retool.create_resource': guarded('retool.create_resource', 'write', CREATE_RESOURCE_PARAMS, 'unverified-retool-resource-mutation'),
    'retool.create_resource_folder': guarded('retool.create_resource_folder', 'write', CREATE_RESOURCE_FOLDER_PARAMS, 'unverified-retool-resource-mutation'),
    'retool.delete_app': guarded('retool.delete_app', 'destructive', PAGE_UUID_PARAMS, 'unverified-retool-page-delete'),
    'retool.delete_folder': guarded('retool.delete_folder', 'destructive', FOLDER_ID_PARAMS, 'unverified-retool-folder-delete'),
    'retool.delete_resource_folder': guarded('retool.delete_resource_folder', 'destructive', RESOURCE_FOLDER_ID_PARAMS, 'unverified-retool-resource-delete'),
    'retool.export_toolscript_archive': guarded('retool.export_toolscript_archive', 'write', EXPORT_ARCHIVE_PARAMS, 'unverified-retool-export-side-effect'),
    'retool.force_editor_save': guarded('retool.force_editor_save', 'write', FORCE_SAVE_PARAMS, 'unverified-retool-editor-save'),
    'retool.list_workflow_runs': guarded('retool.list_workflow_runs', 'write', LIST_WORKFLOW_RUNS_PARAMS, 'unverified-retool-post-read'),
    'retool.lookup_app': guarded('retool.lookup_app', 'write', PAGE_PATH_PARAMS, 'unverified-retool-post-read'),
    'retool.move_resource_to_folder': guarded('retool.move_resource_to_folder', 'write', MOVE_RESOURCE_PARAMS, 'unverified-retool-resource-mutation'),
    'retool.rename_folder': guarded('retool.rename_folder', 'write', RENAME_FOLDER_PARAMS, 'unverified-retool-folder-mutation'),
    'retool.run_grpc': guarded('retool.run_grpc', 'write', RUN_GRPC_PARAMS, 'unverified-retool-query-execution'),
    'retool.run_query': guarded('retool.run_query', 'write', RUN_QUERY_PARAMS, 'unverified-retool-query-execution'),
    'retool.save_page': guarded('retool.save_page', 'write', APP_STATE_PARAMS, 'unverified-retool-page-save'),
    'retool.update_app_from_toolscript_archive': guarded('retool.update_app_from_toolscript_archive', 'write', UPDATE_ARCHIVE_PARAMS, 'unverified-retool-page-save')
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
            service: RETOOL_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerRetool = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
