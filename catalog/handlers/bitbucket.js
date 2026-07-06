(function (global) {
  'use strict';

  var BITBUCKET_ORIGIN = 'https://bitbucket.org';
  var BITBUCKET_SERVICE = 'bitbucket.org';
  var BITBUCKET_API_BASE = BITBUCKET_ORIGIN + '/!api/2.0';
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

  function intField(description) {
    var out = {
      type: 'integer',
      minimum: -9007199254740991,
      maximum: 9007199254740991
    };
    if (description) { out.description = description; }
    return out;
  }

  function boolField(description) {
    var out = { type: 'boolean' };
    if (description) { out.description = description; }
    return out;
  }

  var EMPTY_PARAMS = schema({});
  var PAGE_PARAMS = {
    page: intField('Page number for pagination (default 1)'),
    pagelen: intField('Number of results per page (default 25, max 100)')
  };
  var WORKSPACE = stringField('Workspace slug or UUID');
  var REPO_SLUG = stringField('Repository slug');
  var PR_ID = intField('Pull request ID');
  var PIPELINE_UUID = stringField('Pipeline UUID');

  function withPaging(properties) {
    var out = {};
    var k;
    for (k in properties) {
      if (Object.prototype.hasOwnProperty.call(properties, k)) { out[k] = properties[k]; }
    }
    for (k in PAGE_PARAMS) {
      if (Object.prototype.hasOwnProperty.call(PAGE_PARAMS, k)) { out[k] = PAGE_PARAMS[k]; }
    }
    return out;
  }

  var LIST_WORKSPACES_PARAMS = schema(withPaging({}));
  var WORKSPACE_PARAMS = schema(withPaging({ workspace: WORKSPACE }), ['workspace']);
  var LIST_REPOSITORIES_PARAMS = schema(withPaging({
    workspace: WORKSPACE,
    query: stringField('Bitbucket query language filter')
  }), ['workspace']);
  var REPOSITORY_PARAMS = schema({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG
  }, ['workspace', 'repo_slug']);
  var LIST_BRANCHES_PARAMS = schema(withPaging({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    query: stringField('Filter branches by name (Bitbucket query language)')
  }), ['workspace', 'repo_slug']);
  var LIST_COMMITS_PARAMS = schema(withPaging({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    branch: stringField('Branch or tag name to filter commits by')
  }), ['workspace', 'repo_slug']);
  var LIST_PULL_REQUESTS_PARAMS = schema(withPaging({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    state: {
      type: 'string',
      enum: ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'],
      description: 'Pull request state filter (default OPEN)'
    }
  }), ['workspace', 'repo_slug']);
  var PULL_REQUEST_PARAMS = schema({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    pull_request_id: PR_ID
  }, ['workspace', 'repo_slug', 'pull_request_id']);
  var LIST_PR_COMMENTS_PARAMS = schema(withPaging({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    pull_request_id: PR_ID
  }), ['workspace', 'repo_slug', 'pull_request_id']);
  var LIST_PIPELINES_PARAMS = schema(withPaging({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    sort: stringField('Sort field')
  }), ['workspace', 'repo_slug']);
  var PIPELINE_PARAMS = schema({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    pipeline_uuid: PIPELINE_UUID
  }, ['workspace', 'repo_slug', 'pipeline_uuid']);
  var LIST_PIPELINE_STEPS_PARAMS = schema(withPaging({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    pipeline_uuid: PIPELINE_UUID
  }), ['workspace', 'repo_slug', 'pipeline_uuid']);
  var GET_COMMIT_PARAMS = schema({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    commit_hash: stringField('Full or short commit SHA')
  }, ['workspace', 'repo_slug', 'commit_hash']);
  var GET_FILE_CONTENT_PARAMS = schema({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    path: stringField('File path relative to repository root'),
    ref: stringField('Branch name, tag, or commit SHA')
  }, ['workspace', 'repo_slug', 'path']);
  var SEARCH_CODE_PARAMS = schema(withPaging({
    workspace: WORKSPACE,
    search_query: stringField('Search query string')
  }), ['workspace', 'search_query']);

  var CREATE_BRANCH_PARAMS = schema({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    name: stringField('New branch name'),
    target_hash: stringField('Commit hash to branch from, or branch name')
  }, ['workspace', 'repo_slug', 'name', 'target_hash']);
  var CREATE_PULL_REQUEST_PARAMS = schema({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    title: stringField('Pull request title'),
    source_branch: stringField('Source branch name'),
    destination_branch: stringField('Destination branch name'),
    description: stringField('Pull request description in Markdown'),
    close_source_branch: boolField('Whether to delete the source branch after merge'),
    reviewers: { type: 'array', items: { type: 'string' }, description: 'Reviewer UUIDs' }
  }, ['workspace', 'repo_slug', 'title', 'source_branch']);
  var CREATE_REPOSITORY_PARAMS = schema({
    workspace: WORKSPACE,
    repo_slug: stringField('Repository slug (URL-friendly name)'),
    scm: stringField('Source control type'),
    is_private: boolField('Whether the repository is private'),
    description: stringField('Repository description'),
    has_issues: boolField('Whether to enable the issue tracker'),
    has_wiki: boolField('Whether to enable the wiki')
  }, ['workspace', 'repo_slug']);
  var CREATE_PR_COMMENT_PARAMS = schema({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    pull_request_id: PR_ID,
    content: stringField('Comment content in Markdown')
  }, ['workspace', 'repo_slug', 'pull_request_id', 'content']);
  var DELETE_BRANCH_PARAMS = schema({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    name: stringField('Branch name to delete')
  }, ['workspace', 'repo_slug', 'name']);
  var MERGE_PULL_REQUEST_PARAMS = schema({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    pull_request_id: PR_ID,
    merge_strategy: {
      type: 'string',
      enum: ['merge_commit', 'squash', 'fast_forward'],
      description: 'Merge strategy'
    },
    close_source_branch: boolField('Whether to delete the source branch after merge'),
    message: stringField('Merge commit message')
  }, ['workspace', 'repo_slug', 'pull_request_id']);
  var UPDATE_PULL_REQUEST_PARAMS = schema({
    workspace: WORKSPACE,
    repo_slug: REPO_SLUG,
    pull_request_id: PR_ID,
    title: stringField('New pull request title'),
    description: stringField('New pull request description in Markdown'),
    destination_branch: stringField('New destination branch name'),
    close_source_branch: boolField('Whether to delete the source branch after merge'),
    reviewers: { type: 'array', items: { type: 'string' }, description: 'Reviewer UUIDs' }
  }, ['workspace', 'repo_slug', 'pull_request_id']);

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

  function encodePath(value) {
    return String(value).split('/').map(function(part) {
      return encodeURIComponent(part);
    }).join('/');
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < pairs.length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? ('?' + parts.join('&')) : '';
  }

  function buildGetSpec(url, raw) {
    return {
      url: url,
      method: 'GET',
      headers: raw ? { 'Accept': 'text/plain,*/*' } : { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: BITBUCKET_ORIGIN,
      extract: raw ? null : '@'
    };
  }

  function looksLikeBitbucketError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (data.type === 'error'
        || Object.prototype.hasOwnProperty.call(data, 'error')
        || typeof data.message === 'string'
        || Array.isArray(data.errors));
  }

  function textFromResult(result) {
    if (!result) { return ''; }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    return '';
  }

  function guardPage(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && Array.isArray(data.values)
      && !looksLikeBitbucketError(data);
    return ok ? result : fallback(slug, 'bitbucket-logged-out-or-shape-mismatch');
  }

  function guardObject(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeBitbucketError(data)
      && (Object.prototype.hasOwnProperty.call(data, 'uuid')
        || Object.prototype.hasOwnProperty.call(data, 'slug')
        || Object.prototype.hasOwnProperty.call(data, 'name')
        || Object.prototype.hasOwnProperty.call(data, 'id')
        || Object.prototype.hasOwnProperty.call(data, 'hash')
        || Object.prototype.hasOwnProperty.call(data, 'type'));
    return ok ? result : fallback(slug, 'bitbucket-logged-out-or-shape-mismatch');
  }

  function guardRaw(result, slug) {
    if (!result || result.success !== true) { return result; }
    var text = textFromResult(result);
    var data = result.data;
    var ok = typeof text === 'string' && text.length > 0;
    if (!ok && data && typeof data === 'object' && looksLikeBitbucketError(data)) {
      return fallback(slug, 'bitbucket-logged-out-or-shape-mismatch');
    }
    return ok ? result : fallback(slug, 'bitbucket-logged-out-or-shape-mismatch');
  }

  function readHandler(slug, params, pathBuilder, guard, raw) {
    return {
      tier: 'T1a',
      origin: BITBUCKET_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'bitbucket-execute-bound-spec-unavailable');
        }
        var url = BITBUCKET_API_BASE + pathBuilder(args || {});
        var res = await ctx.executeBoundSpec(buildGetSpec(url, raw), ctx.tabId);
        return guard(res, slug);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: BITBUCKET_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle(args, ctx) {
        return fallback(slug, reason);
      }
    };
  }

  function repoPath(a) {
    return '/repositories/' + encodeSegment(a.workspace) + '/' + encodeSegment(a.repo_slug);
  }

  var handlers = {
    'bitbucket.approve_pull_request': guarded(
      'bitbucket.approve_pull_request', 'write', PULL_REQUEST_PARAMS,
      'unverified-bitbucket-approve-pull-request-mutation'),
    'bitbucket.create_branch': guarded(
      'bitbucket.create_branch', 'write', CREATE_BRANCH_PARAMS,
      'unverified-bitbucket-create-branch-mutation'),
    'bitbucket.create_pr_comment': guarded(
      'bitbucket.create_pr_comment', 'write', CREATE_PR_COMMENT_PARAMS,
      'unverified-bitbucket-create-pr-comment-mutation'),
    'bitbucket.create_pull_request': guarded(
      'bitbucket.create_pull_request', 'write', CREATE_PULL_REQUEST_PARAMS,
      'unverified-bitbucket-create-pull-request-mutation'),
    'bitbucket.create_repository': guarded(
      'bitbucket.create_repository', 'write', CREATE_REPOSITORY_PARAMS,
      'unverified-bitbucket-create-repository-mutation'),
    'bitbucket.decline_pull_request': guarded(
      'bitbucket.decline_pull_request', 'write', PULL_REQUEST_PARAMS,
      'unverified-bitbucket-decline-pull-request-mutation'),
    'bitbucket.delete_branch': guarded(
      'bitbucket.delete_branch', 'destructive', DELETE_BRANCH_PARAMS,
      'unverified-bitbucket-delete-branch-mutation'),
    'bitbucket.merge_pull_request': guarded(
      'bitbucket.merge_pull_request', 'write', MERGE_PULL_REQUEST_PARAMS,
      'unverified-bitbucket-merge-pull-request-mutation'),
    'bitbucket.update_pull_request': guarded(
      'bitbucket.update_pull_request', 'write', UPDATE_PULL_REQUEST_PARAMS,
      'unverified-bitbucket-update-pull-request-mutation'),

    'bitbucket.get_commit': readHandler('bitbucket.get_commit', GET_COMMIT_PARAMS, function(a) {
      return repoPath(a) + '/commit/' + encodeSegment(a.commit_hash);
    }, guardObject),
    'bitbucket.get_file_content': readHandler('bitbucket.get_file_content', GET_FILE_CONTENT_PARAMS, function(a) {
      return repoPath(a) + '/src/' + encodePath(a.ref || 'HEAD') + '/' + encodePath(a.path);
    }, guardRaw, true),
    'bitbucket.get_pipeline': readHandler('bitbucket.get_pipeline', PIPELINE_PARAMS, function(a) {
      return repoPath(a) + '/pipelines/' + encodeSegment(a.pipeline_uuid);
    }, guardObject),
    'bitbucket.get_pull_request': readHandler('bitbucket.get_pull_request', PULL_REQUEST_PARAMS, function(a) {
      return repoPath(a) + '/pullrequests/' + encodeSegment(a.pull_request_id);
    }, guardObject),
    'bitbucket.get_pull_request_diff': readHandler('bitbucket.get_pull_request_diff', PULL_REQUEST_PARAMS, function(a) {
      return repoPath(a) + '/pullrequests/' + encodeSegment(a.pull_request_id) + '/diff';
    }, guardRaw, true),
    'bitbucket.get_repository': readHandler('bitbucket.get_repository', REPOSITORY_PARAMS, function(a) {
      return repoPath(a);
    }, guardObject),
    'bitbucket.get_user_profile': readHandler('bitbucket.get_user_profile', EMPTY_PARAMS, function() {
      return '/user';
    }, guardObject),
    'bitbucket.list_branches': readHandler('bitbucket.list_branches', LIST_BRANCHES_PARAMS, function(a) {
      return repoPath(a) + '/refs/branches' + buildQuery([
        ['page', a.page], ['pagelen', a.pagelen], ['q', a.query]
      ]);
    }, guardPage),
    'bitbucket.list_commits': readHandler('bitbucket.list_commits', LIST_COMMITS_PARAMS, function(a) {
      return repoPath(a) + '/commits' + buildQuery([
        ['page', a.page], ['pagelen', a.pagelen], ['include', a.branch]
      ]);
    }, guardPage),
    'bitbucket.list_pipeline_steps': readHandler('bitbucket.list_pipeline_steps', LIST_PIPELINE_STEPS_PARAMS, function(a) {
      return repoPath(a) + '/pipelines/' + encodeSegment(a.pipeline_uuid) + '/steps/' + buildQuery([
        ['page', a.page], ['pagelen', a.pagelen]
      ]);
    }, guardPage),
    'bitbucket.list_pipelines': readHandler('bitbucket.list_pipelines', LIST_PIPELINES_PARAMS, function(a) {
      return repoPath(a) + '/pipelines/' + buildQuery([
        ['page', a.page], ['pagelen', a.pagelen], ['sort', a.sort]
      ]);
    }, guardPage),
    'bitbucket.list_pr_comments': readHandler('bitbucket.list_pr_comments', LIST_PR_COMMENTS_PARAMS, function(a) {
      return repoPath(a) + '/pullrequests/' + encodeSegment(a.pull_request_id) + '/comments' + buildQuery([
        ['page', a.page], ['pagelen', a.pagelen]
      ]);
    }, guardPage),
    'bitbucket.list_pull_requests': readHandler('bitbucket.list_pull_requests', LIST_PULL_REQUESTS_PARAMS, function(a) {
      return repoPath(a) + '/pullrequests' + buildQuery([
        ['state', a.state], ['page', a.page], ['pagelen', a.pagelen]
      ]);
    }, guardPage),
    'bitbucket.list_repositories': readHandler('bitbucket.list_repositories', LIST_REPOSITORIES_PARAMS, function(a) {
      return '/repositories/' + encodeSegment(a.workspace) + buildQuery([
        ['page', a.page], ['pagelen', a.pagelen], ['q', a.query]
      ]);
    }, guardPage),
    'bitbucket.list_tags': readHandler('bitbucket.list_tags', schema(withPaging({
      workspace: WORKSPACE,
      repo_slug: REPO_SLUG
    }), ['workspace', 'repo_slug']), function(a) {
      return repoPath(a) + '/refs/tags' + buildQuery([
        ['page', a.page], ['pagelen', a.pagelen]
      ]);
    }, guardPage),
    'bitbucket.list_workspace_members': readHandler('bitbucket.list_workspace_members', WORKSPACE_PARAMS, function(a) {
      return '/workspaces/' + encodeSegment(a.workspace) + '/members' + buildQuery([
        ['page', a.page], ['pagelen', a.pagelen]
      ]);
    }, guardPage),
    'bitbucket.list_workspaces': readHandler('bitbucket.list_workspaces', LIST_WORKSPACES_PARAMS, function(a) {
      return '/workspaces' + buildQuery([
        ['page', a.page], ['pagelen', a.pagelen]
      ]);
    }, guardPage),
    'bitbucket.search_code': readHandler('bitbucket.search_code', SEARCH_CODE_PARAMS, function(a) {
      return '/workspaces/' + encodeSegment(a.workspace) + '/search/code' + buildQuery([
        ['search_query', a.search_query], ['page', a.page], ['pagelen', a.pagelen]
      ]);
    }, guardPage)
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
            service: BITBUCKET_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerBitbucket = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
