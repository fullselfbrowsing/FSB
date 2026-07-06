import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './hack2hire-api.js';

// Account
import { getCompletedQuestionCount } from './tools/get-completed-question-count.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getSubscription } from './tools/get-subscription.js';
import { listMyBookmarks } from './tools/list-my-bookmarks.js';
import { listMyVisits } from './tools/list-my-visits.js';

// Companies
import { getCompanyQuestionStats } from './tools/get-company-question-stats.js';
import { listCompanies } from './tools/list-companies.js';

// Comments
import { getComment } from './tools/get-comment.js';
import { listCommentReplies } from './tools/list-comment-replies.js';
import { listQuestionComments } from './tools/list-question-comments.js';

// Questions
import { getQuestion } from './tools/get-question.js';
import { getQuestionNeighbors } from './tools/get-question-neighbors.js';
import { listQuestionCodingProblems } from './tools/list-question-coding-problems.js';
import { listQuestions } from './tools/list-questions.js';

class Hack2HirePlugin extends OpenTabsPlugin {
  readonly name = 'hack2hire';
  readonly description = 'OpenTabs plugin for Hack2Hire';
  override readonly displayName = 'Hack2Hire';
  readonly urlPatterns = ['*://*.hack2hire.com/*'];
  override readonly homepage = 'https://www.hack2hire.com';
  readonly tools: ToolDefinition[] = [
    // Companies
    listCompanies,
    getCompanyQuestionStats,

    // Questions
    listQuestions,
    getQuestion,
    getQuestionNeighbors,
    listQuestionCodingProblems,

    // Comments
    listQuestionComments,
    listCommentReplies,
    getComment,

    // Account
    getCurrentUser,
    getSubscription,
    listMyBookmarks,
    listMyVisits,
    getCompletedQuestionCount,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new Hack2HirePlugin();
