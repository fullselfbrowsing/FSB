import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './stackoverflow-api.js';

// Questions
import { searchQuestions } from './tools/search-questions.js';
import { getQuestion } from './tools/get-question.js';
import { listQuestions } from './tools/list-questions.js';
import { getQuestionAnswers } from './tools/get-question-answers.js';
import { getQuestionComments } from './tools/get-question-comments.js';
import { listRelatedQuestions } from './tools/list-related-questions.js';
import { listLinkedQuestions } from './tools/list-linked-questions.js';
import { listFeaturedQuestions } from './tools/list-featured-questions.js';
import { listUnansweredQuestions } from './tools/list-unanswered-questions.js';
import { getSimilarQuestions } from './tools/get-similar-questions.js';

// Answers
import { getAnswer } from './tools/get-answer.js';
import { getAnswerComments } from './tools/get-answer-comments.js';

// Users
import { getUser } from './tools/get-user.js';
import { searchUsers } from './tools/search-users.js';
import { getUserQuestions } from './tools/get-user-questions.js';
import { getUserAnswers } from './tools/get-user-answers.js';
import { getMyProfile } from './tools/get-my-profile.js';

// Tags
import { listTags } from './tools/list-tags.js';
import { getTagInfo } from './tools/get-tag-info.js';

// Search
import { searchExcerpts } from './tools/search-excerpts.js';

class StackOverflowPlugin extends OpenTabsPlugin {
  readonly name = 'stackoverflow';
  readonly description = 'OpenTabs plugin for Stack Overflow';
  override readonly displayName = 'Stack Overflow';
  readonly urlPatterns = ['*://*.stackoverflow.com/*'];
  override readonly homepage = 'https://stackoverflow.com';
  readonly tools: ToolDefinition[] = [
    // Questions
    searchQuestions,
    getQuestion,
    listQuestions,
    getQuestionAnswers,
    getQuestionComments,
    listRelatedQuestions,
    listLinkedQuestions,
    listFeaturedQuestions,
    listUnansweredQuestions,
    getSimilarQuestions,
    // Answers
    getAnswer,
    getAnswerComments,
    // Users
    getUser,
    searchUsers,
    getUserQuestions,
    getUserAnswers,
    getMyProfile,
    // Tags
    listTags,
    getTagInfo,
    // Search
    searchExcerpts,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new StackOverflowPlugin();
