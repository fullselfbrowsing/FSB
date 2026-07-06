import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './meticulous-api.js';

// User & Organizations
import { getCurrentUser } from './tools/get-current-user.js';
import { listOrganizations } from './tools/list-organizations.js';
import { listOrganizationMembers } from './tools/list-organization-members.js';

// Projects
import { listProjects } from './tools/list-projects.js';
import { getProject } from './tools/get-project.js';
import { getProjectPullRequest } from './tools/get-project-pull-request.js';
import { listGithubRepositories } from './tools/list-github-repositories.js';

// Test Runs
import { getTestRun } from './tools/get-test-run.js';
import { getTestRunScreenshots } from './tools/get-test-run-screenshots.js';
import { getTestRunDiffs } from './tools/get-test-run-diffs.js';
import { getTestRunTestCases } from './tools/get-test-run-test-cases.js';
import { getTestRunCoverage } from './tools/get-test-run-coverage.js';
import { getTestRunSourceCode } from './tools/get-test-run-source-code.js';
import { getTestRunPrDescription } from './tools/get-test-run-pr-description.js';
import { acceptAllDiffs } from './tools/accept-all-diffs.js';
import { checkForFlakes } from './tools/check-for-flakes.js';
import { createLabelAction } from './tools/create-label-action.js';
import { upsertDiffApproval } from './tools/upsert-diff-approval.js';

// Replays
import { getReplay } from './tools/get-replay.js';
import { listReplays } from './tools/list-replays.js';
import { getReplayScreenshots } from './tools/get-replay-screenshots.js';
import { compareReplays } from './tools/compare-replays.js';

// Sessions
import { listSessions } from './tools/list-sessions.js';
import { getSession } from './tools/get-session.js';
import { searchSessions } from './tools/search-sessions.js';
import { getSessionEvents } from './tools/get-session-events.js';

class MeticulousPlugin extends OpenTabsPlugin {
  readonly name = 'meticulous';
  readonly description = 'OpenTabs plugin for Meticulous';
  override readonly displayName = 'Meticulous';
  readonly urlPatterns = ['*://app.meticulous.ai/*'];
  override readonly homepage = 'https://app.meticulous.ai';

  readonly tools: ToolDefinition[] = [
    // User & Organizations
    getCurrentUser,
    listOrganizations,
    listOrganizationMembers,

    // Projects
    listProjects,
    getProject,
    getProjectPullRequest,
    listGithubRepositories,

    // Test Runs
    getTestRun,
    getTestRunScreenshots,
    getTestRunDiffs,
    getTestRunTestCases,
    getTestRunCoverage,
    getTestRunSourceCode,
    getTestRunPrDescription,
    acceptAllDiffs,
    checkForFlakes,
    createLabelAction,
    upsertDiffApproval,

    // Replays
    getReplay,
    listReplays,
    getReplayScreenshots,
    compareReplays,

    // Sessions
    listSessions,
    getSession,
    searchSessions,
    getSessionEvents,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new MeticulousPlugin();
