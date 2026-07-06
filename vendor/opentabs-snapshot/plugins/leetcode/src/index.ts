import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './leetcode-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';

// Users
import { getContestHistory } from './tools/get-contest-history.js';
import { getUserBadges } from './tools/get-user-badges.js';
import { getUserCalendar } from './tools/get-user-calendar.js';
import { getUserLanguageStats } from './tools/get-user-language-stats.js';
import { getUserProfile } from './tools/get-user-profile.js';
import { getUserProgress } from './tools/get-user-progress.js';
import { getUserSkillStats } from './tools/get-user-skill-stats.js';
import { getUserSubmitStats } from './tools/get-user-submit-stats.js';

// Problems
import { getCodeSnippets } from './tools/get-code-snippets.js';
import { getDailyChallenge } from './tools/get-daily-challenge.js';
import { getProblem } from './tools/get-problem.js';
import { getProblemHints } from './tools/get-problem-hints.js';
import { getProblemSolution } from './tools/get-problem-solution.js';
import { getProblemStats } from './tools/get-problem-stats.js';
import { getSimilarProblems } from './tools/get-similar-problems.js';
import { listProblems } from './tools/list-problems.js';
import { listTopicTags } from './tools/list-topic-tags.js';
// Submissions
import { getSubmission } from './tools/get-submission.js';
import { listRecentSubmissions } from './tools/list-recent-submissions.js';
import { listSubmissions } from './tools/list-submissions.js';

// Code
import { runCode } from './tools/run-code.js';
import { submitCode } from './tools/submit-code.js';

// Discussions
import { listDiscussions } from './tools/list-discussions.js';

// Contests
import { getContestRanking } from './tools/get-contest-ranking.js';

// Favorites
import { listFavorites } from './tools/list-favorites.js';

class LeetCodePlugin extends OpenTabsPlugin {
  readonly name = 'leetcode';
  readonly description = 'OpenTabs plugin for LeetCode';
  override readonly displayName = 'LeetCode';
  readonly urlPatterns = ['*://*.leetcode.com/*'];
  override readonly homepage = 'https://leetcode.com';

  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,

    // Users
    getUserProfile,
    getUserProgress,
    getUserCalendar,
    getUserSubmitStats,
    getUserBadges,
    getUserLanguageStats,
    getUserSkillStats,

    // Problems
    listProblems,
    getProblem,
    getDailyChallenge,
    getProblemHints,
    getProblemSolution,
    getProblemStats,
    getSimilarProblems,
    getCodeSnippets,
    listTopicTags,

    // Submissions
    listSubmissions,
    listRecentSubmissions,
    getSubmission,

    // Code
    runCode,
    submitCode,

    // Discussions
    listDiscussions,

    // Contests
    getContestRanking,
    getContestHistory,

    // Favorites
    listFavorites,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new LeetCodePlugin();
