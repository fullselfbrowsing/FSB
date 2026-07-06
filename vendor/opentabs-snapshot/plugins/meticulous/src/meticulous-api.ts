import { ToolError, getLocalStorage, postJSON, waitUntil } from '@opentabs-dev/plugin-sdk';

// --- Auth detection ---
// Meticulous uses HttpOnly session cookies (meticulous.sid) for API auth.
// The meticulous_auth localStorage key is set when the user is logged in,
// serving as a client-side indicator. Actual API auth uses the session cookie
// sent automatically via credentials: 'include' (handled by postJSON).

export const isAuthenticated = (): boolean => {
  const auth = getLocalStorage('meticulous_auth');
  return auth !== null && auth.length > 0;
};

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

// --- GraphQL fragments ---

const ORGANIZATION_FRAGMENT = `
  fragment OrganizationFragment on Organization {
    id name createdAt updatedAt
  }
`;

const USER_FRAGMENT = `
  fragment UserFragment on User {
    id sub email firstName lastName isAdmin canAccessMetrics
    createdAt updatedAt
  }
`;

const PROJECT_FRAGMENT = `
  fragment ProjectFragment on Project {
    id name hostKind repositoryData recordingToken apiToken status
    createdAt updatedAt
    organization { ...OrganizationFragment }
    settings { enterpriseGradeSecurity }
    sessionSelectionConfig { autoSessionSelection { enabled } }
  }
  ${ORGANIZATION_FRAGMENT}
`;

const PROJECT_LIST_ITEM_FRAGMENT = `
  fragment ProjectListItemFragment on Project {
    id name hostKind repositoryData status
    organization { ...OrganizationFragment }
    latestSuccessfulTestRun {
      createdAt
      stats { totalSessions totalScreenshots }
    }
  }
  ${ORGANIZATION_FRAGMENT}
`;

const SCREENSHOTS_DATA_FRAGMENT = `
  fragment ScreenshotsDataFragment on ReplayScreenshotData {
    publicUrl filename
    identifier {
      ... on ScreenshotAfterEvent { __typename type eventNumber }
      ... on EndStateScreenshot { __typename type }
    }
    route { url group }
  }
`;

const SCREENSHOT_DIFF_RESULT_FRAGMENT = `
  fragment ScreenshotDiffResultFragment on ScreenshotDiffResult {
    outcome userVisibleOutcome groupId
    changedSectionsClassNames isClassNamesListTruncated
    diffInBoundingBoxOfIgnoredElement
    width mismatchPixels diffHash
    baseReplayScreenshot {
      filename publicUrl replayId
      route { url group }
      identifier {
        ... on ScreenshotAfterEvent { type eventNumber }
        ... on EndStateScreenshot { type }
      }
    }
    headReplayScreenshot {
      filename publicUrl replayId
      route { url group }
      identifier {
        ... on ScreenshotAfterEvent { type eventNumber }
        ... on EndStateScreenshot { type }
      }
    }
    diffScreenshot {
      baseReplayId filename publicUrlThumb publicUrlFull
    }
  }
`;

const REPLAY_FRAGMENT = `
  fragment ReplayFragment on Replay {
    id commitSha meticulousSha status version createdAt updatedAt isAccurate
    project { id name organization { name } }
    parameters { appUrl originalAppUrl }
    session { id }
  }
`;

const TEST_RUN_CONTEXT_FIELDS = `
  ... on TestRunGitHubPullRequestContext {
    type event title number htmlUrl baseSha baseRef headSha headRef runId
  }
  ... on TestRunGitHubPushContext {
    type event beforeSha afterSha ref runId
  }
  ... on TestRunGitLabMergeRequestContext {
    type event title internalId baseSha headSha webUrl baseRef headRef
  }
  ... on TestRunGitLabPushContext {
    type event beforeSha afterSha ref
  }
  ... on TestRunBitbucketPullRequestContext {
    type event title number htmlUrl baseSha baseRef headSha headRef
  }
`;

const TEST_RUN_FRAGMENT = `
  fragment TestRunFragment on TestRun {
    id commitSha executionSha meticulousSha status
    createdAt updatedAt
    project { ...ProjectFragment }
    configData {
      testCases arguments
      environment {
        ci cloudReplay trigger
        context { ${TEST_RUN_CONTEXT_FIELDS} }
      }
    }
    stats {
      totalScreenshots totalSessions
      totalSessionsReplayed sessionsSkipped screenshotsSkipped
    }
    describeTested
    pullRequest { id approvalState createdAt updatedAt latestTestRunId }
    labelActions { id replayDiffId screenshotFileName label data createdAt }
  }
  ${PROJECT_FRAGMENT}
`;

const ROUTE_COVERAGE_FRAGMENT = `
  fragment RouteCoverageFragment on RouteCoverage {
    route { group url }
    variants {
      variantId
      screenshots { filename publicUrl replayId fetchedFromBase }
    }
  }
`;

const PULL_REQUEST_FRAGMENT = `
  fragment PullRequestFragment on PullRequest {
    id approvalState createdAt updatedAt latestTestRunId
  }
`;

const SESSION_FRAGMENT = `
  fragment RecordedSessionFragment on RecordedSession {
    id hostname datetime numberUserEvents numberBytes
    source startUrl abandoned description isPatched
    project { id name organization { id name } }
    metadata { navigator { webdriver } }
  }
`;

const SESSION_USER_EVENTS_FRAGMENT = `
  fragment RecordedSessionUserEventsFragment on RecordedSession {
    id
    data {
      userEvents { type timestamp selector clientX clientY }
    }
  }
`;

// --- GraphQL caller ---

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

export const graphql = async <T>(query: string, variables?: Record<string, unknown>): Promise<T> => {
  if (!isAuthenticated()) {
    throw ToolError.auth('Not authenticated — please log in to Meticulous.');
  }

  const result = (await postJSON<GraphQLResponse<T>>('/api/graphql', {
    query,
    variables,
  })) as GraphQLResponse<T> | undefined;

  if (!result) {
    throw ToolError.internal('GraphQL response was empty');
  }

  if (result.errors?.length) {
    const msg = result.errors.map(e => e.message).join('; ');
    const code = result.errors[0]?.extensions?.code;
    if (code === 'UNAUTHENTICATED') throw ToolError.auth(msg);
    if (code === 'FORBIDDEN') throw ToolError.auth(msg);
    throw ToolError.internal(`GraphQL error: ${msg}`);
  }

  if (!result.data) {
    throw ToolError.internal('GraphQL response contained no data');
  }

  return result.data;
};

// --- Typed query helpers ---

export const queries = {
  GET_USER_CONTEXT: `
    query GetUserContext {
      authInfo {
        isSignedIn
        user { ...UserFragment }
      }
    }
    ${USER_FRAGMENT}
  `,

  GET_ORGANIZATIONS: `
    query GetOrganizations {
      organizations { ...OrganizationFragment }
    }
    ${ORGANIZATION_FRAGMENT}
  `,

  GET_ORGANIZATION_MEMBERSHIPS: `
    query GetOrganizationMemberships($organizationName: String!) {
      organizationMemberships(organizationName: $organizationName) {
        id role createdAt
        user { ...UserFragment }
      }
    }
    ${USER_FRAGMENT}
  `,

  GET_PROJECTS: `
    query GetProjectListItems {
      projects { ...ProjectListItemFragment }
    }
    ${PROJECT_LIST_ITEM_FRAGMENT}
  `,

  GET_PROJECT: `
    query GetProject($organizationName: String!, $projectName: String!) {
      project(input: { organizationName: $organizationName, projectName: $projectName }) {
        ...ProjectFragment
      }
    }
    ${PROJECT_FRAGMENT}
  `,

  GET_PROJECT_PULL_REQUEST: `
    query GetProjectPullRequest($organizationName: String!, $projectName: String!, $pullRequestId: String!) {
      project(input: { organizationName: $organizationName, projectName: $projectName }) {
        pullRequest(hostingProviderPullRequestId: $pullRequestId) {
          ...PullRequestFragment
        }
      }
    }
    ${PULL_REQUEST_FRAGMENT}
  `,

  GET_TEST_RUN: `
    query GetTestRun($testRunId: String!) {
      testRun(id: $testRunId) { ...TestRunFragment }
    }
    ${TEST_RUN_FRAGMENT}
  `,

  GET_TEST_RUN_SCREENSHOTS: `
    query GetTestRunScreenshots(
      $testRunId: String!
      $replayDiffLimit: Int!
      $replayDiffOffset: Int!
      $testCaseResultLimit: Int!
      $testCaseResultOffset: Int!
    ) {
      testRun(id: $testRunId) {
        replayDiffs(excludeNoDiffs: true, limit: $replayDiffLimit, offset: $replayDiffOffset) {
          id
          headReplay { id status isAccurate parameters { appUrl } }
          baseReplay { id status isAccurate parameters { appUrl } }
          screenshotDiffResults {
            ...ScreenshotDiffResultFragment
            firstFailedRetry {
              ...ScreenshotDiffResultFragment
              headReplayId
            }
          }
        }
        testCaseResults(excludePasses: true, limit: $testCaseResultLimit, offset: $testCaseResultOffset) {
          headReplay {
            id status isAccurate
            parameters { appUrl }
            screenshotsData { ...ScreenshotsDataFragment }
          }
          session { id }
        }
      }
    }
    ${SCREENSHOT_DIFF_RESULT_FRAGMENT}
    ${SCREENSHOTS_DATA_FRAGMENT}
  `,

  GET_TEST_RUN_DIFFS: `
    query GetTestRunReplayDiffs($testRunId: String!, $limit: Int!, $offset: Int!) {
      testRun(id: $testRunId) {
        replayDiffs(excludeNoDiffs: true, limit: $limit, offset: $offset) {
          id
          headReplay { id status isAccurate parameters { appUrl } }
          baseReplay { id status isAccurate parameters { appUrl } }
          screenshotDiffResults {
            ...ScreenshotDiffResultFragment
            firstFailedRetry {
              ...ScreenshotDiffResultFragment
              headReplayId
            }
          }
        }
      }
    }
    ${SCREENSHOT_DIFF_RESULT_FRAGMENT}
  `,

  GET_TEST_RUN_TEST_CASES: `
    query GetTestRunTestCaseResults($testRunId: String!, $limit: Int!, $offset: Int!, $excludePasses: Boolean!) {
      testRun(id: $testRunId) {
        testCaseResults(excludePasses: $excludePasses, limit: $limit, offset: $offset) {
          headReplay {
            id status isAccurate
            parameters { appUrl }
            screenshotsData { ...ScreenshotsDataFragment }
          }
          session { id }
        }
      }
    }
    ${SCREENSHOTS_DATA_FRAGMENT}
  `,

  GET_TEST_RUN_COVERAGE: `
    query GetTestRunWithCoverage($testRunId: String!, $prMode: Boolean!, $replayId: String) {
      testRun(id: $testRunId) {
        ...TestRunFragment
        coverage(prMode: $prMode, replayId: $replayId) {
          screenshotsComparedWithDiffs { ...RouteCoverageFragment }
          screenshotsComparedButWithoutDiffs { ...RouteCoverageFragment }
          screenshotsNotCompared { ...RouteCoverageFragment }
          numUnmappedFiles
          coveredSourcesBlobUrl coverageDetailsBlobUrl
          coveredReplaysByFileBlobUrl coveredScreenshotsByFileBlobUrl
          coverageByReplayBlobUrl
        }
      }
    }
    ${TEST_RUN_FRAGMENT}
    ${ROUTE_COVERAGE_FRAGMENT}
  `,

  GET_TEST_RUN_SOURCE_CODE: `
    query GetTestRunWithSourceCodeFile($testRunId: String!, $path: String!) {
      testRun(id: $testRunId) { id sourceCode(path: $path) }
    }
  `,

  GET_TEST_RUN_PR_DESCRIPTION: `
    query GetTestRunPullRequestDescription($testRunId: String!) {
      testRun(id: $testRunId) {
        id
        pullRequest { id prDescription }
      }
    }
  `,

  GET_REPLAY: `
    query GetReplay($replayId: String!) {
      replay(id: $replayId) { ...ReplayFragment }
    }
    ${REPLAY_FRAGMENT}
  `,

  GET_REPLAYS_FOR_PROJECT: `
    query GetReplaysForProject($projectId: String!, $n: Int!) {
      replaysForProject(input: { projectId: $projectId, n: $n }) {
        ...ReplayFragment
      }
    }
    ${REPLAY_FRAGMENT}
  `,

  GET_REPLAY_SCREENSHOTS: `
    query GetReplayScreenshots($replayId: String!) {
      replay(id: $replayId) {
        id
        screenshotsData { ...ScreenshotsDataFragment }
      }
    }
    ${SCREENSHOTS_DATA_FRAGMENT}
  `,

  GET_COMPARE_REPLAYS: `
    query GetTestRunForCompareReplaysPage($testRunId: String!, $baseReplayId: String!) {
      testRun(id: $testRunId) {
        id
        replayDiff(baseReplayId: $baseReplayId) {
          id divergences
          headReplay {
            id status isAccurate
            parameters { appUrl }
            screenshotsData { ...ScreenshotsDataFragment }
          }
          baseReplay {
            id status isAccurate
            parameters { appUrl }
            screenshotsData { ...ScreenshotsDataFragment }
          }
          screenshotDiffResults {
            ...ScreenshotDiffResultFragment
          }
        }
      }
    }
    ${SCREENSHOTS_DATA_FRAGMENT}
    ${SCREENSHOT_DIFF_RESULT_FRAGMENT}
  `,

  GET_SESSIONS_FOR_PROJECT: `
    query GetSessionsForProject($projectId: String!, $n: Int!) {
      sessionsForProject(input: { projectId: $projectId, n: $n }) {
        ...RecordedSessionFragment
      }
    }
    ${SESSION_FRAGMENT}
  `,

  GET_SESSION: `
    query GetSession($sessionId: String!) {
      session(id: $sessionId) { ...RecordedSessionFragment }
    }
    ${SESSION_FRAGMENT}
  `,

  SEARCH_SESSIONS: `
    query GetSessionsBySearch(
      $projectId: String!
      $searchQuery: String!
      $n: Int!
      $offset: Int!
      $includeEmptySessions: Boolean!
      $includeAutomatedSessions: Boolean!
    ) {
      sessionsBySearch(input: {
        projectId: $projectId
        searchQuery: $searchQuery
        n: $n
        offset: $offset
        includeEmptySessions: $includeEmptySessions
        includeAutomatedSessions: $includeAutomatedSessions
      }) {
        ...RecordedSessionFragment
      }
    }
    ${SESSION_FRAGMENT}
  `,

  GET_SESSION_EVENTS: `
    query GetSessionUserEvents($sessionId: String!) {
      session(id: $sessionId) { ...RecordedSessionUserEventsFragment }
    }
    ${SESSION_USER_EVENTS_FRAGMENT}
  `,

  GET_GITHUB_REPOSITORIES: `
    query GetGitHubRepositories {
      gitHubRepositories { id name owner url fullName }
    }
  `,
};

export const mutations = {
  ACCEPT_ALL_DIFFS: `
    mutation AcceptAllDiffs($pullRequestId: String!, $testRunId: String!) {
      acceptAllDiffs(input: { pullRequestId: $pullRequestId, testRunId: $testRunId }) {
        pullRequest { id approvalState }
      }
    }
  `,

  CHECK_FOR_FLAKES: `
    mutation CheckForFlakes($testRunId: String!, $rerunTestsNTimes: Int!) {
      checkForFlakes(input: { testRunId: $testRunId, rerunTestsNTimes: $rerunTestsNTimes }) {
        id
      }
    }
  `,

  CREATE_LABEL_ACTION: `
    mutation CreateLabelAction(
      $testRunId: String!
      $replayDiffId: String
      $screenshotFileName: String
      $label: String!
      $data: Json
    ) {
      createLabelAction(input: {
        testRunId: $testRunId
        replayDiffId: $replayDiffId
        screenshotFileName: $screenshotFileName
        label: $label
        data: $data
      }) {
        id testRunId replayDiffId screenshotFileName label data createdAt
      }
    }
  `,

  UPSERT_DIFF_APPROVAL_STATES: `
    mutation upsertDiffApprovalStates($input: UpsertDiffApprovalStatesInput!) {
      upsertDiffApprovalStates(input: $input) {
        pullRequest { id approvalState }
      }
    }
  `,
};
