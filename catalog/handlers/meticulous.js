(function (global) {
  'use strict';

  /**
   * Meticulous same-origin GraphQL READ head.
   *
   * The selected descriptors are query-only calls to the first-party
   * app.meticulous.ai GraphQL endpoint. Mutations remain in the UAT tail. The
   * project query deliberately omits credential-like project token fields.
   */

  var METICULOUS_ORIGIN = 'https://app.meticulous.ai';
  var METICULOUS_SERVICE = 'app.meticulous.ai';
  var GRAPHQL_URL = METICULOUS_ORIGIN + '/api/graphql';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };
  var TEST_RUN_PARAMS = stringParams('test_run_id', 'Test run ID');
  var REPLAY_PARAMS = stringParams('replay_id', 'Replay ID');
  var SESSION_PARAMS = stringParams('session_id', 'Session ID');

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
    return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
      slug: slug,
      reason: reason || 'meticulous-logged-out-or-rot',
      fellBackToDom: true
    });
  }

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
      description: description
    };
  }

  function stringParams(name, description) {
    var props = {};
    props[name] = { type: 'string', minLength: 1, description: description };
    return {
      type: 'object',
      properties: props,
      required: [name],
      additionalProperties: false
    };
  }

  function withProps(properties, required) {
    return {
      type: 'object',
      properties: properties,
      required: required || [],
      additionalProperties: false
    };
  }

  function valueOrDefault(value, fallbackValue) {
    return value === undefined || value === null ? fallbackValue : value;
  }

  function querySpec(query, variables) {
    return {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: query,
        variables: variables || {}
      }),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: METICULOUS_ORIGIN,
      extract: 'data'
    };
  }

  function hasOwn(obj, key) {
    return !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function looksLikeError(data) {
    return isPlainObject(data)
      && (typeof data.error === 'string'
        || typeof data.message === 'string'
        || Array.isArray(data.errors));
  }

  function guardGraphqlResult(result, slug, key, extraGuard) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    if (!isPlainObject(data) || looksLikeError(data) || !hasOwn(data, key)) {
      return fallback(slug, 'meticulous-graphql-shape-mismatch');
    }
    if (typeof extraGuard === 'function') {
      var checked = extraGuard(data, slug);
      if (checked && checked.success === false) { return checked; }
    }
    return result;
  }

  function requireObjectKey(key) {
    return function(data, slug) {
      return isPlainObject(data[key])
        ? { success: true }
        : fallback(slug, 'meticulous-graphql-shape-mismatch');
    };
  }

  function requireArrayKey(key) {
    return function(data, slug) {
      return Array.isArray(data[key])
        ? { success: true }
        : fallback(slug, 'meticulous-graphql-shape-mismatch');
    };
  }

  function currentUserGuard(data, slug) {
    var auth = data && data.authInfo;
    if (!isPlainObject(auth) || auth.isSignedIn !== true || !isPlainObject(auth.user)) {
      return fallback(slug, 'meticulous-user-not-signed-in');
    }
    return { success: true };
  }

  function readHandler(slug, params, query, variablesForArgs, expectedKey, extraGuard) {
    return {
      tier: 'T1a',
      origin: METICULOUS_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'meticulous-execute-bound-spec-unavailable');
        }
        var variables = typeof variablesForArgs === 'function' ? variablesForArgs(args || {}) : {};
        var res = await ctx.executeBoundSpec(querySpec(query, variables), ctx.tabId);
        return guardGraphqlResult(res, slug, expectedKey, extraGuard);
      }
    };
  }

  var USER_FIELDS = 'id sub email firstName lastName isAdmin canAccessMetrics createdAt updatedAt';
  var ORG_FIELDS = 'id name createdAt updatedAt';
  var SCREENSHOT_FIELDS = 'filename publicUrl replayId route { url group } identifier { __typename ... on ScreenshotAfterEvent { type eventNumber } ... on EndStateScreenshot { type } }';
  var DIFF_FIELDS = 'id outcome userVisibleOutcome groupId changedSectionsClassNames isClassNamesListTruncated diffInBoundingBoxOfIgnoredElement width mismatchPixels diffHash baseReplayScreenshot { filename publicUrl replayId route { url group } } headReplayScreenshot { filename publicUrl replayId route { url group } } diffScreenshot { baseReplayId filename publicUrlThumb publicUrlFull }';
  var REPLAY_FIELDS = 'id commitSha meticulousSha status version createdAt updatedAt isAccurate project { id name organization { name } } parameters { appUrl originalAppUrl } session { id }';
  var SESSION_FIELDS = 'id hostname datetime numberUserEvents numberBytes source startUrl abandoned description isPatched project { id name organization { id name } } metadata { navigator { webdriver } }';
  var TEST_RUN_FIELDS = 'id commitSha executionSha meticulousSha status createdAt updatedAt project { id name organization { id name } } configData { testCases arguments environment { ci cloudReplay trigger } } stats { totalScreenshots totalSessions totalSessionsReplayed sessionsSkipped screenshotsSkipped } describeTested pullRequest { id approvalState createdAt updatedAt latestTestRunId } labelActions { id replayDiffId screenshotFileName label data createdAt }';
  var PROJECT_FIELDS = 'id name hostKind repositoryData status createdAt updatedAt organization { ' + ORG_FIELDS + ' } settings { enterpriseGradeSecurity } sessionSelectionConfig { autoSessionSelection { enabled } }';
  var PROJECT_LIST_FIELDS = 'id name hostKind repositoryData status organization { ' + ORG_FIELDS + ' } latestSuccessfulTestRun { createdAt stats { totalSessions totalScreenshots } }';
  var COVERAGE_FIELDS = 'route { group url } variants { variantId screenshots { filename publicUrl replayId fetchedFromBase } }';

  var queries = {
    currentUser: 'query GetUserContext { authInfo { isSignedIn user { ' + USER_FIELDS + ' } } }',
    organizations: 'query GetOrganizations { organizations { ' + ORG_FIELDS + ' } }',
    organizationMembers: 'query GetOrganizationMemberships($organizationName: String!) { organizationMemberships(organizationName: $organizationName) { id role createdAt user { ' + USER_FIELDS + ' } } }',
    projects: 'query GetProjectListItems { projects { ' + PROJECT_LIST_FIELDS + ' } }',
    project: 'query GetProject($organizationName: String!, $projectName: String!) { project(input: { organizationName: $organizationName, projectName: $projectName }) { ' + PROJECT_FIELDS + ' } }',
    projectPullRequest: 'query GetProjectPullRequest($organizationName: String!, $projectName: String!, $pullRequestId: String!) { project(input: { organizationName: $organizationName, projectName: $projectName }) { pullRequest(hostingProviderPullRequestId: $pullRequestId) { id approvalState createdAt updatedAt latestTestRunId } } }',
    githubRepositories: 'query GetGitHubRepositories { gitHubRepositories { id name owner url fullName } }',
    testRun: 'query GetTestRun($testRunId: String!) { testRun(id: $testRunId) { ' + TEST_RUN_FIELDS + ' } }',
    testRunScreenshots: 'query GetTestRunScreenshots($testRunId: String!, $replayDiffLimit: Int!, $replayDiffOffset: Int!, $testCaseResultLimit: Int!, $testCaseResultOffset: Int!) { testRun(id: $testRunId) { replayDiffs(excludeNoDiffs: true, limit: $replayDiffLimit, offset: $replayDiffOffset) { id headReplay { id status isAccurate parameters { appUrl } } baseReplay { id status isAccurate parameters { appUrl } } screenshotDiffResults { ' + DIFF_FIELDS + ' firstFailedRetry { ' + DIFF_FIELDS + ' headReplayId } } } testCaseResults(excludePasses: true, limit: $testCaseResultLimit, offset: $testCaseResultOffset) { headReplay { id status isAccurate parameters { appUrl } screenshotsData { ' + SCREENSHOT_FIELDS + ' } } session { id } } } }',
    testRunDiffs: 'query GetTestRunReplayDiffs($testRunId: String!, $limit: Int!, $offset: Int!) { testRun(id: $testRunId) { replayDiffs(excludeNoDiffs: true, limit: $limit, offset: $offset) { id headReplay { id status isAccurate parameters { appUrl } } baseReplay { id status isAccurate parameters { appUrl } } screenshotDiffResults { ' + DIFF_FIELDS + ' firstFailedRetry { ' + DIFF_FIELDS + ' headReplayId } } } } }',
    testRunTestCases: 'query GetTestRunTestCaseResults($testRunId: String!, $limit: Int!, $offset: Int!, $excludePasses: Boolean!) { testRun(id: $testRunId) { testCaseResults(excludePasses: $excludePasses, limit: $limit, offset: $offset) { headReplay { id status isAccurate parameters { appUrl } screenshotsData { ' + SCREENSHOT_FIELDS + ' } } session { id } } } }',
    testRunCoverage: 'query GetTestRunWithCoverage($testRunId: String!, $prMode: Boolean!, $replayId: String) { testRun(id: $testRunId) { ' + TEST_RUN_FIELDS + ' coverage(prMode: $prMode, replayId: $replayId) { screenshotsComparedWithDiffs { ' + COVERAGE_FIELDS + ' } screenshotsComparedButWithoutDiffs { ' + COVERAGE_FIELDS + ' } screenshotsNotCompared { ' + COVERAGE_FIELDS + ' } numUnmappedFiles coveredSourcesBlobUrl coverageDetailsBlobUrl coveredReplaysByFileBlobUrl coveredScreenshotsByFileBlobUrl coverageByReplayBlobUrl } } }',
    testRunSourceCode: 'query GetTestRunWithSourceCodeFile($testRunId: String!, $path: String!) { testRun(id: $testRunId) { id sourceCode(path: $path) } }',
    testRunPrDescription: 'query GetTestRunPullRequestDescription($testRunId: String!) { testRun(id: $testRunId) { id pullRequest { id prDescription } } }',
    replay: 'query GetReplay($replayId: String!) { replay(id: $replayId) { ' + REPLAY_FIELDS + ' } }',
    replaysForProject: 'query GetReplaysForProject($projectId: String!, $n: Int!) { replaysForProject(input: { projectId: $projectId, n: $n }) { ' + REPLAY_FIELDS + ' } }',
    replayScreenshots: 'query GetReplayScreenshots($replayId: String!) { replay(id: $replayId) { id screenshotsData { ' + SCREENSHOT_FIELDS + ' } } }',
    sessionsForProject: 'query GetSessionsForProject($projectId: String!, $n: Int!) { sessionsForProject(input: { projectId: $projectId, n: $n }) { ' + SESSION_FIELDS + ' } }',
    session: 'query GetSession($sessionId: String!) { session(id: $sessionId) { ' + SESSION_FIELDS + ' } }',
    searchSessions: 'query GetSessionsBySearch($projectId: String!, $searchQuery: String!, $n: Int!, $offset: Int!, $includeEmptySessions: Boolean!, $includeAutomatedSessions: Boolean!) { sessionsBySearch(input: { projectId: $projectId, searchQuery: $searchQuery, n: $n, offset: $offset, includeEmptySessions: $includeEmptySessions, includeAutomatedSessions: $includeAutomatedSessions }) { ' + SESSION_FIELDS + ' } }',
    sessionEvents: 'query GetSessionUserEvents($sessionId: String!) { session(id: $sessionId) { id data { userEvents { type timestamp selector clientX clientY } } } }'
  };

  var projectByNameParams = withProps({
    organization_name: { type: 'string', minLength: 1, description: 'Organization name' },
    project_name: { type: 'string', minLength: 1, description: 'Project name' }
  }, ['organization_name', 'project_name']);

  var projectPullRequestParams = withProps({
    organization_name: { type: 'string', minLength: 1, description: 'Organization name' },
    project_name: { type: 'string', minLength: 1, description: 'Project name' },
    pull_request_id: { type: 'string', minLength: 1, description: 'Hosting provider PR identifier' }
  }, ['organization_name', 'project_name', 'pull_request_id']);

  var projectCountParams = withProps({
    project_id: { type: 'string', minLength: 1, description: 'Project ID' },
    count: integerSchema('Number of rows to return', 1, 500)
  }, ['project_id']);

  var testRunScreenshotsParams = withProps({
    test_run_id: { type: 'string', minLength: 1, description: 'Test run ID' },
    replay_diff_limit: integerSchema('Max replay diffs to return', 1, 500),
    replay_diff_offset: integerSchema('Offset for replay diffs pagination', 0),
    test_case_limit: integerSchema('Max test case results to return', 1, 500),
    test_case_offset: integerSchema('Offset for test case pagination', 0)
  }, ['test_run_id']);

  var testRunDiffsParams = withProps({
    test_run_id: { type: 'string', minLength: 1, description: 'Test run ID' },
    only_with_screenshot_diffs: { type: 'boolean', description: 'Accepted for descriptor compatibility; filtering remains server-response dependent' },
    limit: integerSchema('Max results to return', 1, 500),
    offset: integerSchema('Offset for pagination', 0)
  }, ['test_run_id']);

  var testRunTestCasesParams = withProps({
    test_run_id: { type: 'string', minLength: 1, description: 'Test run ID' },
    include_passes: { type: 'boolean', description: 'Include passing test cases' },
    limit: integerSchema('Max results to return', 1, 500),
    offset: integerSchema('Offset for pagination', 0)
  }, ['test_run_id']);

  var testRunCoverageParams = withProps({
    test_run_id: { type: 'string', minLength: 1, description: 'Test run ID' },
    pr_mode: { type: 'boolean', description: 'Whether to use PR mode for coverage calculation' },
    replay_id: { type: 'string', description: 'Optional replay ID to scope coverage to' },
    category: { type: 'string', enum: ['with_diffs', 'without_diffs', 'not_compared', 'all'], description: 'Client display category preference' },
    route_filter: { type: 'string', description: 'Client route filter preference' },
    limit: integerSchema('Client display limit preference', 1, 500)
  }, ['test_run_id']);

  var sourceCodeParams = withProps({
    test_run_id: { type: 'string', minLength: 1, description: 'Test run ID' },
    path: { type: 'string', minLength: 1, description: 'File path relative to repository root' }
  }, ['test_run_id', 'path']);

  var searchSessionsParams = withProps({
    project_id: { type: 'string', minLength: 1, description: 'Project ID to search within' },
    query: { type: 'string', description: 'Search query string' },
    count: integerSchema('Number of rows to return', 1, 500),
    offset: integerSchema('Offset for pagination', 0),
    include_empty_sessions: { type: 'boolean', description: 'Include sessions with no user events' },
    include_automated_sessions: { type: 'boolean', description: 'Include automated sessions' }
  }, ['project_id', 'query']);

  var handlers = {
    'meticulous.get_current_user': readHandler('meticulous.get_current_user', EMPTY_PARAMS, queries.currentUser, null, 'authInfo', currentUserGuard),
    'meticulous.list_organizations': readHandler('meticulous.list_organizations', EMPTY_PARAMS, queries.organizations, null, 'organizations', requireArrayKey('organizations')),
    'meticulous.list_organization_members': readHandler('meticulous.list_organization_members', stringParams('organization_name', 'Organization name'), queries.organizationMembers, function(args) {
      return { organizationName: args.organization_name };
    }, 'organizationMemberships', requireArrayKey('organizationMemberships')),
    'meticulous.list_projects': readHandler('meticulous.list_projects', EMPTY_PARAMS, queries.projects, null, 'projects', requireArrayKey('projects')),
    'meticulous.get_project': readHandler('meticulous.get_project', projectByNameParams, queries.project, function(args) {
      return { organizationName: args.organization_name, projectName: args.project_name };
    }, 'project', requireObjectKey('project')),
    'meticulous.get_project_pull_request': readHandler('meticulous.get_project_pull_request', projectPullRequestParams, queries.projectPullRequest, function(args) {
      return { organizationName: args.organization_name, projectName: args.project_name, pullRequestId: args.pull_request_id };
    }, 'project', requireObjectKey('project')),
    'meticulous.list_github_repositories': readHandler('meticulous.list_github_repositories', EMPTY_PARAMS, queries.githubRepositories, null, 'gitHubRepositories', requireArrayKey('gitHubRepositories')),
    'meticulous.get_test_run': readHandler('meticulous.get_test_run', TEST_RUN_PARAMS, queries.testRun, function(args) {
      return { testRunId: args.test_run_id };
    }, 'testRun', requireObjectKey('testRun')),
    'meticulous.get_test_run_screenshots': readHandler('meticulous.get_test_run_screenshots', testRunScreenshotsParams, queries.testRunScreenshots, function(args) {
      return {
        testRunId: args.test_run_id,
        replayDiffLimit: valueOrDefault(args.replay_diff_limit, 50),
        replayDiffOffset: valueOrDefault(args.replay_diff_offset, 0),
        testCaseResultLimit: valueOrDefault(args.test_case_limit, 50),
        testCaseResultOffset: valueOrDefault(args.test_case_offset, 0)
      };
    }, 'testRun', requireObjectKey('testRun')),
    'meticulous.get_test_run_diffs': readHandler('meticulous.get_test_run_diffs', testRunDiffsParams, queries.testRunDiffs, function(args) {
      return { testRunId: args.test_run_id, limit: valueOrDefault(args.limit, 100), offset: valueOrDefault(args.offset, 0) };
    }, 'testRun', requireObjectKey('testRun')),
    'meticulous.get_test_run_test_cases': readHandler('meticulous.get_test_run_test_cases', testRunTestCasesParams, queries.testRunTestCases, function(args) {
      return { testRunId: args.test_run_id, limit: valueOrDefault(args.limit, 100), offset: valueOrDefault(args.offset, 0), excludePasses: !args.include_passes };
    }, 'testRun', requireObjectKey('testRun')),
    'meticulous.get_test_run_coverage': readHandler('meticulous.get_test_run_coverage', testRunCoverageParams, queries.testRunCoverage, function(args) {
      return { testRunId: args.test_run_id, prMode: valueOrDefault(args.pr_mode, true), replayId: args.replay_id };
    }, 'testRun', requireObjectKey('testRun')),
    'meticulous.get_test_run_source_code': readHandler('meticulous.get_test_run_source_code', sourceCodeParams, queries.testRunSourceCode, function(args) {
      return { testRunId: args.test_run_id, path: args.path };
    }, 'testRun', requireObjectKey('testRun')),
    'meticulous.get_test_run_pr_description': readHandler('meticulous.get_test_run_pr_description', TEST_RUN_PARAMS, queries.testRunPrDescription, function(args) {
      return { testRunId: args.test_run_id };
    }, 'testRun', requireObjectKey('testRun')),
    'meticulous.get_replay': readHandler('meticulous.get_replay', REPLAY_PARAMS, queries.replay, function(args) {
      return { replayId: args.replay_id };
    }, 'replay', requireObjectKey('replay')),
    'meticulous.list_replays': readHandler('meticulous.list_replays', projectCountParams, queries.replaysForProject, function(args) {
      return { projectId: args.project_id, n: valueOrDefault(args.count, 50) };
    }, 'replaysForProject', requireArrayKey('replaysForProject')),
    'meticulous.get_replay_screenshots': readHandler('meticulous.get_replay_screenshots', REPLAY_PARAMS, queries.replayScreenshots, function(args) {
      return { replayId: args.replay_id };
    }, 'replay', requireObjectKey('replay')),
    'meticulous.list_sessions': readHandler('meticulous.list_sessions', projectCountParams, queries.sessionsForProject, function(args) {
      return { projectId: args.project_id, n: valueOrDefault(args.count, 50) };
    }, 'sessionsForProject', requireArrayKey('sessionsForProject')),
    'meticulous.get_session': readHandler('meticulous.get_session', SESSION_PARAMS, queries.session, function(args) {
      return { sessionId: args.session_id };
    }, 'session', requireObjectKey('session')),
    'meticulous.search_sessions': readHandler('meticulous.search_sessions', searchSessionsParams, queries.searchSessions, function(args) {
      return {
        projectId: args.project_id,
        searchQuery: args.query,
        n: valueOrDefault(args.count, 50),
        offset: valueOrDefault(args.offset, 0),
        includeEmptySessions: valueOrDefault(args.include_empty_sessions, false),
        includeAutomatedSessions: valueOrDefault(args.include_automated_sessions, false)
      };
    }, 'sessionsBySearch', requireArrayKey('sessionsBySearch')),
    'meticulous.get_session_events': readHandler('meticulous.get_session_events', SESSION_PARAMS, queries.sessionEvents, function(args) {
      return { sessionId: args.session_id };
    }, 'session', requireObjectKey('session'))
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
          descriptor: { slug: slug, service: METICULOUS_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerMeticulous = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
