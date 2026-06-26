(function (global) {
  'use strict';

  /**
   * Phase 40 Plan 02 (v1.0.0 DEPTH-01) -- catalog/handlers/gitlab.js
   *
   * GitLab bundled-head handler module (T1a, the GitHub-GET template). Reviewed
   * imperative CODE shipped in the extension bundle -- NOT a recipe. Hosts the top 5
   * GitLab READ slugs whose opentabs breadth descriptors (catalog/descriptors/
   * opentabs__gitlab__*.json, backing:'dom') this module UPGRADES dom->T1a by
   * registering the EXACT dot-form slug:
   *   - gitlab.list_projects        (read) : GET /api/v4/projects
   *   - gitlab.get_project          (read) : GET /api/v4/projects/:id
   *   - gitlab.list_issues          (read) : GET /api/v4/projects/:id/issues
   *   - gitlab.get_issue            (read) : GET /api/v4/projects/:id/issues/:iid
   *   - gitlab.list_merge_requests  (read) : GET /api/v4/projects/:id/merge_requests
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
   * READS (Phase 40): the 5 READ slugs above; every read spec is a GET. No CSRF token
   * is read on the read path.
   *
   * GUARDED WRITES (Phase 41, DEPTH-02): 3 fail-closed write slugs were APPENDED --
   * gitlab.create_issue / create_merge_request / create_note (each UPGRADES its
   * opentabs__gitlab__create_*.json breadth descriptor dom->T1a). Each ships FAIL-CLOSED
   * (the github.issues.create pattern): handle() returns the dual-field
   * RECIPE_DOM_FALLBACK_PENDING and NEVER calls ctx.executeBoundSpec -- NO mutation
   * fires. The real mutating path requires the <meta name="csrf-token"> dance + a
   * live-captured POST body ([ASSUMED-ENDPOINT]); the writes are inert until
   * 41-HUMAN-UAT.md is satisfied. No CSRF token is read here (the writes fail closed
   * before any spec build).
   *
   * LOGGED-OUT GUARD (CONTEXT Top Risk, "200-with-logged-out-body"): a logged-out
   * gitlab.com tab can answer a /api/v4 read with a 200 carrying a sign-in HTML page or
   * a redirect. After executeBoundSpec, a per-op shape check rejects a body that is not
   * the expected shape (an ARRAY for list_*, an id-bearing OBJECT for get_*), returning
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

  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
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
  function buildGetSpec(url) {
    return {
      // [ASSUMED-ENDPOINT: live UAT in 40-VALIDATION.md] -- the same-origin /api/v4
      // read path on the gitlab.com origin (NOT a separate public api-host subdomain).
      url: url,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: GITLAB_ORIGIN,
      extract: '@'
    };
  }

  // A top-level GitLab error envelope carries a string `message` (e.g.
  // { message: "401 Unauthorized" } / { message: "404 Project Not Found" }) or a
  // string `error` (e.g. { error: "invalid_token" }) -- neither of which a real
  // project/issue resource body has. Used to reject an error envelope that happens
  // to also carry an id/iid field (IN-02: the get_* heuristic was looser than its
  // "id-bearing OBJECT" intent). Conservative: keyed only on the two documented
  // GitLab error markers, so a legitimate resource body is never excluded.
  function looksLikeGitlabError(data) {
    return !!data && typeof data === 'object'
      && (typeof data.message === 'string' || typeof data.error === 'string');
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
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'gitlab-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
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

    // ======================================================================
    // Phase 41 (DEPTH-02) -- the 3 GUARDED WRITE slugs (FAIL-CLOSED).
    // ----------------------------------------------------------------------
    // EXACT opentabs dot-form write slugs so resolve() UPGRADES each breadth
    // descriptor (backing:'dom', sideEffectClass:'write') dom->T1a -- the
    // correctness keystone, distinct from the 5 read slugs above (no collision).
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

    // ---- gitlab.create_issue (write -- fail-closed) ------------------------
    'gitlab.create_issue': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'write',
      params: CREATE_ISSUE_PARAMS,
      async handle(args, ctx) {
        return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
          slug: 'gitlab.create_issue',
          reason: 'unverified-gitlab-create-issue-mutation',
          fellBackToDom: true
        });
      }
    },

    // ---- gitlab.create_merge_request (write -- fail-closed) ----------------
    'gitlab.create_merge_request': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'write',
      params: CREATE_MERGE_REQUEST_PARAMS,
      async handle(args, ctx) {
        return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
          slug: 'gitlab.create_merge_request',
          reason: 'unverified-gitlab-create-merge-request-mutation',
          fellBackToDom: true
        });
      }
    },

    // ---- gitlab.create_note (write -- fail-closed) -------------------------
    'gitlab.create_note': {
      tier: 'T1a',
      origin: GITLAB_ORIGIN,
      sideEffectClass: 'write',
      params: CREATE_NOTE_PARAMS,
      async handle(args, ctx) {
        return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
          slug: 'gitlab.create_note',
          reason: 'unverified-gitlab-create-note-mutation',
          fellBackToDom: true
        });
      }
    }
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
