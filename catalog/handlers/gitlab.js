(function (global) {
  'use strict';

  /**
   * Phase 40 Plan 02 (v1.0.0 DEPTH-01) -- catalog/handlers/gitlab.js
   *
   * GitLab bundled-head handler module (T1a, the GitHub-GET template). Reviewed
   * imperative CODE shipped in the extension bundle -- NOT a recipe. Hosts the
   * current GitLab catalog surface whose opentabs breadth descriptors
   * (catalog/descriptors/opentabs__gitlab__*.json, backing:'dom') this module
   * UPGRADES dom->T1a by registering the EXACT dot-form slug:
   *   - 16 read slugs backed by same-origin GETs under /api/v4
   *   - 6 write slugs registered as guarded fail-closed rows
   *
   * GitLab is the SAME-ORIGIN replacement for the deferred linear (40-01 decision_note):
   * linear's GraphQL is on a SEPARATE client-api subdomain reached only via cross-origin
   * CORS, which the Wall-2 origin-pin correctly rejects (that is Phase 41's CORS-gate
   * class). GitLab's REST API is https://gitlab.com/api/v4 -- a PATH on the gitlab.com
   * origin, NOT a separate api-host subdomain (verified in vendor/opentabs-snapshot/
   * plugins/gitlab/src/gitlab-api.ts:10-14) -- so spec.origin = https://gitlab.com and
   * the origin-pin passes with NO CORS, NO separate host.
   *
   * THE ORIGIN-PIN (Wall 2, Pitfall 3 credential-replay): every spec targets GitLab's
   * OWN first-party origin https://gitlab.com so the session cookie attaches. A separate
   * public api-host subdomain is FORBIDDEN (the session cookie does not cross origins;
   * executeBoundSpec rejects spec.origin !== activeTabOrigin with RECIPE_ORIGIN_MISMATCH
   * BEFORE any executeScript -- fail-closed, no side effect). That separate api-host
   * string never appears in this file (asserted by the head-handlers source scan). The
   * handler NEVER injects into a page itself (no browser-extension scripting/tabs APIs
   * are referenced); it only builds bound spec(s) and calls ctx.executeBoundSpec, so the
   * active-tab origin-pin stays on the head path.
   *
   * READS: every read spec is a GET. No CSRF token is read on the read path.
   *
   * GUARDED WRITES: write slugs ship FAIL-CLOSED (the github.issues.create pattern):
   * handle() returns the dual-field RECIPE_DOM_FALLBACK_PENDING and NEVER calls
   * ctx.executeBoundSpec -- NO mutation fires. The real mutating path requires the
   * <meta name="csrf-token"> dance + a live-captured request body ([ASSUMED-ENDPOINT]);
   * the writes are inert until live mutation-body UAT is satisfied. No CSRF token is
   * read here (the writes fail closed before any spec build).
   *
   * LOGGED-OUT GUARD (CONTEXT Top Risk, "200-with-logged-out-body"): a logged-out
   * gitlab.com tab can answer a /api/v4 read with a 200 carrying a sign-in HTML page or
   * a redirect. After executeBoundSpec, a per-op shape check rejects a body that is not
   * the expected shape (ARRAY/object/raw-text depending on the operation), returning
   * the dual-field RECIPE_DOM_FALLBACK_PENDING failure so the breadth DOM path still
   * serves -- a logged-out body NEVER masquerades as success.
   *
   * [ASSUMED] -- the same-origin internal /api/v4 paths are derived from the vendored
   * real source RE-TARGETED to the first-party origin + same-origin-cookie (the opentabs
   * plugin calls the public API with a bearer token; this hand-port calls gitlab.com's
   * OWN-origin API with the session cookie). Live endpoint-correctness on an authenticated
   * tab is carried-forward, user-gated UAT debt (40-VALIDATION.md Manual-Only); the
   * handler ships FAIL-CLOSED so security holds regardless. The same-origin /api/v4 fact
   * (a PATH on gitlab.com, not a separate subdomain) IS source-verified.
   *
   * Module shell: the dual-export IIFE mirror of github.js -- the service worker reads
   * global.FsbHandlerGitlab after importScripts and the module self-registers its slugs
   * into FsbCapabilityCatalog at load; Node tests require() the module.exports slug-keyed
   * object. Eval-free, no chrome.*, no network of its own. NO EMOJIS, ASCII-only source.
   */

  var GITLAB_ORIGIN = 'https://gitlab.com';
  var GITLAB_API_BASE = GITLAB_ORIGIN + '/api/v4';
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

  function stringField(minLength) {
    var out = { type: 'string' };
    if (minLength) { out.minLength = minLength; }
    return out;
  }

  function intField() {
    return { type: 'integer', minimum: 1, maximum: 9007199254740991 };
  }

  var PROJECT_FIELD = { type: 'string', minLength: 1 };
  var PAGE_FIELD = { type: 'integer', minimum: 1, maximum: 9007199254740991 };
  var PER_PAGE_FIELD = { type: 'integer', minimum: 1, maximum: 100 };

  // ---- Closed params schemas (from the opentabs descriptor props) -----------
  // additionalProperties:false everywhere -- the AI cannot smuggle extra fields
  // into a credentialed same-origin read.
  var LIST_PROJECTS_PARAMS = {
    type: 'object',
    properties: {
      membership: { type: 'boolean' },
      owned: { type: 'boolean' },
      search: { type: 'string' },
      visibility: { type: 'string', enum: ['public', 'internal', 'private'] },
      order_by: { type: 'string', enum: ['id', 'name', 'path', 'created_at', 'updated_at', 'last_activity_at'] },
      sort: { type: 'string', enum: ['asc', 'desc'] },
      per_page: { type: 'integer', minimum: 1, maximum: 100 },
      page: { type: 'integer', minimum: 1 }
    },
    additionalProperties: false
  };
  var GET_PROJECT_PARAMS = {
    type: 'object',
    properties: {
      project: { type: 'string', minLength: 1 }
    },
    required: ['project'],
    additionalProperties: false
  };
  var LIST_ISSUES_PARAMS = {
    type: 'object',
    properties: {
      project: { type: 'string', minLength: 1 },
      state: { type: 'string', enum: ['opened', 'closed', 'all'] },
      labels: { type: 'string' },
      assignee_username: { type: 'string' },
      milestone: { type: 'string' },
      search: { type: 'string' },
      order_by: { type: 'string' },
      sort: { type: 'string', enum: ['asc', 'desc'] },
      per_page: { type: 'integer', minimum: 1, maximum: 100 },
      page: { type: 'integer', minimum: 1 }
    },
    required: ['project'],
    additionalProperties: false
  };
  var GET_ISSUE_PARAMS = {
    type: 'object',
    properties: {
      project: { type: 'string', minLength: 1 },
      issue_iid: { type: ['integer', 'string'] }
    },
    required: ['project', 'issue_iid'],
    additionalProperties: false
  };
  var LIST_MERGE_REQUESTS_PARAMS = {
    type: 'object',
    properties: {
      project: { type: 'string', minLength: 1 },
      state: { type: 'string', enum: ['opened', 'closed', 'locked', 'merged', 'all'] },
      labels: { type: 'string' },
      author_username: { type: 'string' },
      assignee_id: { type: ['integer', 'string'] },
      source_branch: { type: 'string' },
      target_branch: { type: 'string' },
      search: { type: 'string' },
      order_by: { type: 'string' },
      sort: { type: 'string', enum: ['asc', 'desc'] },
      per_page: { type: 'integer', minimum: 1, maximum: 100 },
      page: { type: 'integer', minimum: 1 }
    },
    required: ['project'],
    additionalProperties: false
  };
  var GET_FILE_CONTENT_PARAMS = schema({
    project: PROJECT_FIELD,
    file_path: stringField(1),
    ref: stringField()
  }, ['project', 'file_path']);
  var GET_JOB_LOG_PARAMS = schema({
    project: PROJECT_FIELD,
    job_id: intField()
  }, ['project', 'job_id']);
  var GET_MERGE_REQUEST_PARAMS = schema({
    project: PROJECT_FIELD,
    merge_request_iid: intField()
  }, ['project', 'merge_request_iid']);
  var GET_USER_PROFILE_PARAMS = schema({
    username: stringField()
  });
  var LIST_BRANCHES_PARAMS = schema({
    project: PROJECT_FIELD,
    search: stringField(),
    per_page: PER_PAGE_FIELD,
    page: PAGE_FIELD
  }, ['project']);
  var LIST_COMMITS_PARAMS = schema({
    project: PROJECT_FIELD,
    ref_name: stringField(),
    path: stringField(),
    since: stringField(),
    until: stringField(),
    per_page: PER_PAGE_FIELD,
    page: PAGE_FIELD
  }, ['project']);
  var LIST_NOTES_PARAMS = schema({
    project: PROJECT_FIELD,
    noteable_type: { type: 'string', enum: ['issues', 'merge_requests'] },
    noteable_iid: intField(),
    order_by: { type: 'string', enum: ['created_at', 'updated_at'] },
    sort: { type: 'string', enum: ['asc', 'desc'] },
    per_page: PER_PAGE_FIELD,
    page: PAGE_FIELD
  }, ['project', 'noteable_type', 'noteable_iid']);
  var LIST_PIPELINE_JOBS_PARAMS = schema({
    project: PROJECT_FIELD,
    pipeline_id: intField(),
    per_page: PER_PAGE_FIELD,
    page: PAGE_FIELD
  }, ['project', 'pipeline_id']);
  var LIST_PIPELINES_PARAMS = schema({
    project: PROJECT_FIELD,
    status: { type: 'string', enum: ['running', 'pending', 'success', 'failed', 'canceled', 'skipped', 'manual', 'scheduled'] },
    ref: stringField(),
    source: stringField(),
    order_by: { type: 'string', enum: ['id', 'status', 'ref', 'updated_at', 'user_id'] },
    sort: { type: 'string', enum: ['asc', 'desc'] },
    per_page: PER_PAGE_FIELD,
    page: PAGE_FIELD
  }, ['project']);
  var SEARCH_PROJECTS_PARAMS = schema({
    search: stringField(1),
    order_by: { type: 'string', enum: ['id', 'name', 'path', 'created_at', 'updated_at', 'last_activity_at'] },
    sort: { type: 'string', enum: ['asc', 'desc'] },
    per_page: PER_PAGE_FIELD,
    page: PAGE_FIELD
  }, ['search']);

  // ---- Phase 41 (DEPTH-02) GUARDED-WRITE params schemas ---------------------
  // Props mirrored EXACTLY from the opentabs__gitlab__create_*.json descriptors
  // (the breadth write descriptors these slugs UPGRADE dom->T1a). The required path
  // fields are set; additionalProperties:false everywhere -- the AI cannot smuggle
  // extra fields into a credentialed same-origin write. These schemas scaffold the
  // params a single live-capture flips to executable; the handlers below are
  // fail-closed today (they NEVER build a spec or call ctx.executeBoundSpec).
  var CREATE_ISSUE_PARAMS = {
    type: 'object',
    properties: {
      project: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1 },
      description: { type: 'string' },
      labels: { type: 'string' },
      assignee_ids: { type: 'array', items: { type: 'number' } },
      milestone_id: { type: 'number' },
      confidential: { type: 'boolean' }
    },
    required: ['project', 'title'],
    additionalProperties: false
  };
  var CREATE_MERGE_REQUEST_PARAMS = {
    type: 'object',
    properties: {
      project: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1 },
      source_branch: { type: 'string', minLength: 1 },
      target_branch: { type: 'string', minLength: 1 },
      description: { type: 'string' },
      labels: { type: 'string' },
      assignee_id: { type: 'number' },
      milestone_id: { type: 'number' },
      remove_source_branch: { type: 'boolean' },
      squash: { type: 'boolean' }
    },
    required: ['project', 'title', 'source_branch', 'target_branch'],
    additionalProperties: false
  };
  var CREATE_NOTE_PARAMS = {
    type: 'object',
    properties: {
      project: { type: 'string', minLength: 1 },
      noteable_type: { type: 'string', enum: ['issues', 'merge_requests'] },
      noteable_iid: { type: 'integer', minimum: 1, maximum: 9007199254740991 },
      body: { type: 'string', minLength: 1 }
    },
    required: ['project', 'noteable_type', 'noteable_iid', 'body'],
    additionalProperties: false
  };
  var MERGE_MERGE_REQUEST_PARAMS = schema({
    project: PROJECT_FIELD,
    merge_request_iid: intField(),
    merge_commit_message: stringField(),
    squash_commit_message: stringField(),
    squash: { type: 'boolean' },
    should_remove_source_branch: { type: 'boolean' }
  }, ['project', 'merge_request_iid']);
  var UPDATE_ISSUE_PARAMS = schema({
    project: PROJECT_FIELD,
    issue_iid: intField(),
    title: stringField(),
    description: stringField(),
    state_event: { type: 'string', enum: ['close', 'reopen'] },
    labels: stringField(),
    assignee_ids: { type: 'array', items: { type: 'number' } },
    milestone_id: { type: 'number' },
    confidential: { type: 'boolean' }
  }, ['project', 'issue_iid']);
  var UPDATE_MERGE_REQUEST_PARAMS = schema({
    project: PROJECT_FIELD,
    merge_request_iid: intField(),
    title: stringField(),
    description: stringField(),
    state_event: { type: 'string', enum: ['close', 'reopen'] },
    labels: stringField(),
    assignee_id: { type: 'number' },
    target_branch: stringField(),
    remove_source_branch: { type: 'boolean' },
    squash: { type: 'boolean' }
  }, ['project', 'merge_request_iid']);

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
    return encodeURIComponent(String(value));
  }

  // Build a querystring from the optional filter props (mirror gitlab-api.ts buildUrl,
  // lines 50-61: URLSearchParams, skip undefined). `omit` excludes path-segment props
  // (project, issue_iid) that are NOT query params. Returns '' or '?k=v&...'.
  function buildQuery(args, omit) {
    var skip = {};
    var i;
    for (i = 0; i < (omit || []).length; i++) { skip[omit[i]] = true; }
    var parts = [];
    for (var key in args) {
      if (!Object.prototype.hasOwnProperty.call(args, key)) { continue; }
      if (skip[key]) { continue; }
      var value = args[key];
      if (value === undefined || value === null) { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? ('?' + parts.join('&')) : '';
  }

  // The same-origin GET bound spec. Accept:application/json, body:null, the gitlab.com
  // session cookie rides automatically (same-origin-cookie). extract:'@' returns the
  // whole result so the post-result shape guard can inspect the body.
  function buildGetSpec(url, raw) {
    return {
      // [ASSUMED-ENDPOINT: live UAT in 40-VALIDATION.md] -- the same-origin /api/v4
      // read path on the gitlab.com origin (NOT a separate public api-host subdomain).
      url: url,
      method: 'GET',
      headers: raw ? { 'Accept': 'text/plain,*/*' } : { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: GITLAB_ORIGIN,
      extract: raw ? null : '@'
    };
  }

  // A top-level GitLab error envelope carries a string `message` (e.g.
  // { message: "401 Unauthorized" } / { message: "404 Project Not Found" }) or a
  // string `error` (e.g. { error: "invalid_token" }) -- neither of which the
  // currently-ported project/issue/MR resource bodies carry. Used to reject an error
  // envelope that happens to also carry an id/iid field (IN-02: the get_* heuristic
  // was looser than its "id-bearing OBJECT" intent). Conservative: keyed only on the
  // two documented GitLab error markers, so none of the 5 currently-ported read shapes
  // is excluded. NOTE (IN-03): this is a value-shape assumption, NOT universal -- a
  // future get_* whose legitimate 200 body has a top-level string `message` (e.g. a
  // commit object's `message`) WOULD be classified an error envelope and fall back to
  // DOM (a false-negative read, the safe direction). If such a read is added, scope
  // this to require the ABSENCE of the resource's id/iid AND the error marker.
  function looksLikeGitlabError(data) {
    return !!data && typeof data === 'object'
      && (typeof data.message === 'string' || typeof data.error === 'string');
  }

  function textFromResult(result) {
    if (!result) { return ''; }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    return '';
  }

  // The logged-out shape guard. executeBoundSpec returns { success, data, ... } where
  // `data` is the parsed body. A logged-out gitlab.com tab answers a /api/v4 read with
  // a 200 sign-in HTML page or a redirect -> `data` is NOT the expected JSON shape.
  // wantArray: list_* expect an array; get_* expect an id-bearing object that is NOT a
  // GitLab error envelope (IN-02 hardening). On a wrong shape, return the dual-field
  // RECIPE_DOM_FALLBACK_PENDING so the breadth DOM path serves; otherwise return the
  // executeBoundSpec result verbatim.
  function guardShape(result, slug, wantArray) {
    if (!result || result.success !== true) {
      return result;   // pin / fetch failure -> return verbatim; do NOT mask it.
    }
    var data = result.data;
    var ok;
    if (wantArray) {
      ok = Array.isArray(data);
    } else {
      ok = !!data && typeof data === 'object' && !Array.isArray(data)
        && !looksLikeGitlabError(data)
        && (Object.prototype.hasOwnProperty.call(data, 'id')
          || Object.prototype.hasOwnProperty.call(data, 'iid'));
    }
    if (!ok) {
      return fallback(slug, 'gitlab-logged-out-or-rot');
    }
    return result;
  }

  function guardObjectWithAnyKey(result, slug, keys) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeGitlabError(data);
    if (ok && keys && keys.length) {
      ok = false;
      for (var i = 0; i < keys.length; i++) {
        if (Object.prototype.hasOwnProperty.call(data, keys[i])) {
          ok = true;
          break;
        }
      }
    }
    return ok ? result : fallback(slug, 'gitlab-logged-out-or-rot');
  }

  function guardArrayOrObject(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = Array.isArray(data) || (!!data && typeof data === 'object'
      && !Array.isArray(data) && !looksLikeGitlabError(data));
    return ok ? result : fallback(slug, 'gitlab-logged-out-or-rot');
  }

  function guardRaw(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var text = textFromResult(result);
    if (data && typeof data === 'object' && looksLikeGitlabError(data)) {
      return fallback(slug, 'gitlab-logged-out-or-rot');
    }
    return (text.length > 0) ? result : fallback(slug, 'gitlab-logged-out-or-rot');
  }

  function guarded(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'write',
      params: params,
      async handle(args, ctx) {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    // ---- gitlab.list_projects (read) ---------------------------------------
    'gitlab.list_projects': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_PROJECTS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects' + buildQuery(a, []);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardShape(res, 'gitlab.list_projects', true);
      }
    },

    // ---- gitlab.get_project (read) -----------------------------------------
    'gitlab.get_project': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: GET_PROJECT_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects/' + encodeURIComponent(String(a.project));
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardShape(res, 'gitlab.get_project', false);
      }
    },

    // ---- gitlab.list_issues (read) -----------------------------------------
    'gitlab.list_issues': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_ISSUES_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects/' + encodeURIComponent(String(a.project))
          + '/issues' + buildQuery(a, ['project']);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardShape(res, 'gitlab.list_issues', true);
      }
    },

    // ---- gitlab.get_issue (read) -------------------------------------------
    'gitlab.get_issue': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: GET_ISSUE_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects/' + encodeURIComponent(String(a.project))
          + '/issues/' + encodeURIComponent(String(a.issue_iid));
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardShape(res, 'gitlab.get_issue', false);
      }
    },

    // ---- gitlab.list_merge_requests (read) ---------------------------------
    'gitlab.list_merge_requests': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_MERGE_REQUESTS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects/' + encodeURIComponent(String(a.project))
          + '/merge_requests' + buildQuery(a, ['project']);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardShape(res, 'gitlab.list_merge_requests', true);
      }
    },

    // ---- gitlab.get_file_content (read) ------------------------------------
    'gitlab.get_file_content': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: GET_FILE_CONTENT_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects/' + encodeSegment(a.project)
          + '/repository/files/' + encodeSegment(a.file_path)
          + buildQuery({ ref: a.ref || 'HEAD' }, []);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardObjectWithAnyKey(res, 'gitlab.get_file_content', ['file_path', 'content']);
      }
    },

    // ---- gitlab.get_job_log (read) -----------------------------------------
    'gitlab.get_job_log': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: GET_JOB_LOG_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects/' + encodeSegment(a.project)
          + '/jobs/' + encodeSegment(a.job_id) + '/trace';
        var res = await ctx.executeBoundSpec(buildGetSpec(url, true), ctx.tabId);
        return guardRaw(res, 'gitlab.get_job_log');
      }
    },

    // ---- gitlab.get_merge_request (read) -----------------------------------
    'gitlab.get_merge_request': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: GET_MERGE_REQUEST_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects/' + encodeSegment(a.project)
          + '/merge_requests/' + encodeSegment(a.merge_request_iid);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardShape(res, 'gitlab.get_merge_request', false);
      }
    },

    // ---- gitlab.get_merge_request_diff (read) ------------------------------
    'gitlab.get_merge_request_diff': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: GET_MERGE_REQUEST_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects/' + encodeSegment(a.project)
          + '/merge_requests/' + encodeSegment(a.merge_request_iid) + '/changes';
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardObjectWithAnyKey(res, 'gitlab.get_merge_request_diff', ['changes']);
      }
    },

    // ---- gitlab.get_user_profile (read) ------------------------------------
    'gitlab.get_user_profile': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: GET_USER_PROFILE_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = a.username
          ? (GITLAB_API_BASE + '/users' + buildQuery({ username: a.username }, []))
          : (GITLAB_API_BASE + '/user');
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardArrayOrObject(res, 'gitlab.get_user_profile');
      }
    },

    // ---- gitlab.list_branches (read) ---------------------------------------
    'gitlab.list_branches': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_BRANCHES_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects/' + encodeSegment(a.project)
          + '/repository/branches' + buildQuery(a, ['project']);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardShape(res, 'gitlab.list_branches', true);
      }
    },

    // ---- gitlab.list_commits (read) ----------------------------------------
    'gitlab.list_commits': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_COMMITS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects/' + encodeSegment(a.project)
          + '/repository/commits' + buildQuery(a, ['project']);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardShape(res, 'gitlab.list_commits', true);
      }
    },

    // ---- gitlab.list_notes (read) ------------------------------------------
    'gitlab.list_notes': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_NOTES_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects/' + encodeSegment(a.project)
          + '/' + encodeSegment(a.noteable_type) + '/' + encodeSegment(a.noteable_iid)
          + '/notes' + buildQuery(a, ['project', 'noteable_type', 'noteable_iid']);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardShape(res, 'gitlab.list_notes', true);
      }
    },

    // ---- gitlab.list_pipeline_jobs (read) ----------------------------------
    'gitlab.list_pipeline_jobs': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_PIPELINE_JOBS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects/' + encodeSegment(a.project)
          + '/pipelines/' + encodeSegment(a.pipeline_id)
          + '/jobs' + buildQuery(a, ['project', 'pipeline_id']);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardShape(res, 'gitlab.list_pipeline_jobs', true);
      }
    },

    // ---- gitlab.list_pipelines (read) --------------------------------------
    'gitlab.list_pipelines': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_PIPELINES_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects/' + encodeSegment(a.project)
          + '/pipelines' + buildQuery(a, ['project']);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardShape(res, 'gitlab.list_pipelines', true);
      }
    },

    // ---- gitlab.search_projects (read) -------------------------------------
    'gitlab.search_projects': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'read',
      params: SEARCH_PROJECTS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = GITLAB_API_BASE + '/projects' + buildQuery(a, []);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardShape(res, 'gitlab.search_projects', true);
      }
    },

    // ======================================================================
    // Guarded WRITE slugs (FAIL-CLOSED).
    // ----------------------------------------------------------------------
    // EXACT opentabs dot-form write slugs so resolve() UPGRADES each breadth
    // descriptor (backing:'dom', sideEffectClass:'write') dom->T1a -- the
    // correctness keystone, distinct from the read slugs above (no collision).
    //
    // EACH SHIPS FAIL-CLOSED, the github.issues.create pattern (github.js:111-123):
    // handle() returns the dual-field RECIPE_DOM_FALLBACK_PENDING (reason
    // unverified-gitlab-<verb>-mutation, fellBackToDom:true) and NEVER calls
    // ctx.executeBoundSpec -- so NO mutation fires. Behaviorally identical to its
    // T3-DOM descriptor today (both -> DOM fallback); the VALUE is the scaffolded
    // params+endpoint+gating a single live-capture flips to executable -- without a
    // new hand-port.
    //
    // [ASSUMED-ENDPOINT] -- the real GitLab frontend mutation requires the
    // <meta name="csrf-token"> dance + a live-captured POST body (the gitlab-api.ts
    // mutating path uses the CSRF token; gitlab-api.ts:13 base is the SAME-ORIGIN
    // https://gitlab.com/api/v4 PATH). The handler scrapes NO token (it fails closed
    // BEFORE any spec build), so the credential discipline holds trivially; when a
    // future live-capture activates it, the CSRF token must stay only inside the
    // bound spec (the github/gitlab discipline). These writes ship FAIL-CLOSED until
    // 41-HUMAN-UAT.md (the gitlab guarded-write rows) is satisfied -- carried-forward,
    // user-gated UAT debt, NON-blocking for CI (the headless gates pass: handle()
    // returns RECIPE_DOM_FALLBACK_PENDING).

    'gitlab.create_issue': guarded(
      'gitlab.create_issue', CREATE_ISSUE_PARAMS,
      'unverified-gitlab-create-issue-mutation'),
    'gitlab.create_merge_request': guarded(
      'gitlab.create_merge_request', CREATE_MERGE_REQUEST_PARAMS,
      'unverified-gitlab-create-merge-request-mutation'),
    'gitlab.create_note': guarded(
      'gitlab.create_note', CREATE_NOTE_PARAMS,
      'unverified-gitlab-create-note-mutation'),
    'gitlab.merge_merge_request': guarded(
      'gitlab.merge_merge_request', MERGE_MERGE_REQUEST_PARAMS,
      'unverified-gitlab-merge-merge-request-mutation'),
    'gitlab.update_issue': guarded(
      'gitlab.update_issue', UPDATE_ISSUE_PARAMS,
      'unverified-gitlab-update-issue-mutation'),
    'gitlab.update_merge_request': guarded(
      'gitlab.update_merge_request', UPDATE_MERGE_REQUEST_PARAMS,
      'unverified-gitlab-update-merge-request-mutation')
  };

  // ---- Self-registration into the catalog (shipped SW path) ----------------
  // typeof-guarded so the module loads cleanly under the Node test harness (the
  // catalog global may be absent there -> the test require()s the slug-keyed object).
  if (typeof FsbCapabilityCatalog !== 'undefined' && FsbCapabilityCatalog
      && typeof FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: handlers[slug].origin,
          params: handlers[slug].params,
          descriptor: { slug: slug, service: 'gitlab.com', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerGitlab = handlers;   // SW importScripts consumer reads this global
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;          // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
