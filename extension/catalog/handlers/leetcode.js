(function (global) {
  'use strict';

  /**
   * LeetCode same-origin GraphQL READ head.
   *
   * Ports query-only OpenTabs descriptors through the existing bounded request
   * primitive. Code run/submit descriptors are intentionally not activated here.
   */

  var LEETCODE_ORIGIN = 'https://leetcode.com';
  var LEETCODE_GRAPHQL_URL = LEETCODE_ORIGIN + '/graphql/';
  var INT_LIMIT = 9007199254740991;
  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };
  var USERNAME_PARAMS = stringParams('username', 'LeetCode username');
  var TITLE_SLUG_PARAMS = stringParams('titleSlug', 'Problem URL slug');

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
      reason: reason || 'leetcode-logged-out-or-rot',
      fellBackToDom: true
    });
  }

  function stringParams(name, description) {
    var props = {};
    props[name] = { type: 'string', description: description };
    return {
      type: 'object',
      properties: props,
      required: [name],
      additionalProperties: false
    };
  }

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
      description: description
    };
  }

  function querySpec(query, variables) {
    return {
      url: LEETCODE_GRAPHQL_URL,
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
      csrfSource: { from: 'cookie', selector: 'csrftoken', header: 'x-csrftoken' },
      origin: LEETCODE_ORIGIN,
      extract: 'data'
    };
  }

  function hasOwn(obj, key) {
    return !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function looksLikeError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string'
        || typeof data.message === 'string'
        || Array.isArray(data.errors));
  }

  function guardGraphqlResult(result, slug, key, extraGuard) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || looksLikeError(data) || !hasOwn(data, key)) {
      return fallback(slug, 'leetcode-graphql-shape-mismatch');
    }
    if (typeof extraGuard === 'function') {
      var checked = extraGuard(data, slug);
      if (checked && checked.success === false) { return checked; }
    }
    return result;
  }

  function userStatusGuard(data, slug) {
    var status = data && data.userStatus;
    if (!status || typeof status !== 'object' || status.isSignedIn !== true) {
      return fallback(slug, 'leetcode-user-not-signed-in');
    }
    return { success: true };
  }

  function readHandler(slug, params, query, variablesForArgs, expectedKey, extraGuard) {
    return {
      tier: 'T1a',
      origin: LEETCODE_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'leetcode-execute-bound-spec-unavailable');
        }
        var variables = typeof variablesForArgs === 'function' ? variablesForArgs(args || {}) : {};
        var res = await ctx.executeBoundSpec(querySpec(query, variables), ctx.tabId);
        return guardGraphqlResult(res, slug, expectedKey, extraGuard);
      }
    };
  }

  var listProblemsParams = {
    type: 'object',
    properties: {
      categorySlug: { type: 'string', description: 'Category slug' },
      skip: integerSchema('Number of problems to skip (default 0)', 0),
      limit: integerSchema('Number of problems to return (default 20, max 100)', 1, 100),
      difficulty: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD'], description: 'Filter by difficulty' },
      status: { type: 'string', enum: ['NOT_STARTED', 'AC', 'TRIED'], description: 'Filter by status' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Filter by topic tag slugs' },
      searchKeywords: { type: 'string', description: 'Search by keyword in problem title' }
    },
    additionalProperties: false
  };

  var listDiscussionsParams = {
    type: 'object',
    properties: {
      questionId: { type: 'string', description: 'Question ID' },
      orderBy: { type: 'string', enum: ['most_votes', 'newest_to_oldest', 'most_relevant'], description: 'Sort order' },
      skip: integerSchema('Number to skip (default 0)', 0),
      first: integerSchema('Number of topics (default 10, max 25)', 1, 25)
    },
    required: ['questionId'],
    additionalProperties: false
  };

  var listRecentSubmissionsParams = {
    type: 'object',
    properties: {
      username: { type: 'string', description: 'LeetCode username' },
      limit: integerSchema('Number of submissions to return (default 10, max 20)', 1, 20)
    },
    required: ['username'],
    additionalProperties: false
  };

  var listSubmissionsParams = {
    type: 'object',
    properties: {
      questionSlug: { type: 'string', description: 'Filter by problem slug' },
      offset: integerSchema('Offset for pagination (default 0)', 0),
      limit: integerSchema('Number of submissions to return (default 20, max 40)', 1, 40)
    },
    additionalProperties: false
  };

  var userCalendarParams = {
    type: 'object',
    properties: {
      username: { type: 'string', description: 'LeetCode username' },
      year: integerSchema('Filter by year')
    },
    required: ['username'],
    additionalProperties: false
  };

  var submissionParams = {
    type: 'object',
    properties: {
      submissionId: integerSchema('Submission ID (numeric)')
    },
    required: ['submissionId'],
    additionalProperties: false
  };

  var queries = {
    codeSnippets: 'query codeSnippets($titleSlug: String!) { question(titleSlug: $titleSlug) { codeSnippets { lang langSlug code } } }',
    contestHistory: 'query userContestHistory($username: String!) { userContestRankingHistory(username: $username) { attended rating ranking contest { title startTime } } }',
    contestRanking: 'query userContestRankingInfo($username: String!) { userContestRanking(username: $username) { attendedContestsCount rating globalRanking totalParticipants topPercentage } }',
    currentUser: 'query globalData { userStatus { userId username avatar isSignedIn isMockUser isPremium isVerified checkedInToday notificationStatus { lastModified numUnread } activeSessionId } }',
    dailyChallenge: 'query questionOfToday { activeDailyCodingChallengeQuestion { date link question { acRate difficulty freqBar frontendQuestionId: questionFrontendId isFavor paidOnly: isPaidOnly status title titleSlug topicTags { name slug } hasSolution hasVideoSolution } } }',
    problemHints: 'query questionHints($titleSlug: String!) { question(titleSlug: $titleSlug) { title hints } }',
    problemSolution: 'query officialSolution($titleSlug: String!) { question(titleSlug: $titleSlug) { solution { id title content contentTypeId paidOnly hasVideoSolution } } }',
    problemStats: 'query questionStats($titleSlug: String!) { question(titleSlug: $titleSlug) { questionId title difficulty likes dislikes stats } }',
    problem: 'query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { questionId questionFrontendId title titleSlug content difficulty likes dislikes isLiked isPaidOnly categoryTitle acRate status topicTags { name slug } hints similarQuestions exampleTestcases sampleTestCase codeSnippets { lang langSlug code } } }',
    similarProblems: 'query similarQuestions($titleSlug: String!) { question(titleSlug: $titleSlug) { similarQuestions } }',
    submission: 'query submissionDetails($submissionId: Int!) { submissionDetails(submissionId: $submissionId) { runtime runtimeDisplay runtimePercentile memory memoryDisplay memoryPercentile code timestamp statusCode lang { name verboseName } question { questionId title titleSlug } notes topicTags { slug name } runtimeError compileError lastTestcase } }',
    userBadges: 'query userBadges($username: String!) { matchedUser(username: $username) { badges { id displayName icon creationDate } upcomingBadges { name icon } } }',
    userCalendar: 'query userProfileCalendar($username: String!, $year: Int) { matchedUser(username: $username) { userCalendar(year: $year) { activeYears streak totalActiveDays submissionCalendar } } }',
    userLanguageStats: 'query languageStats($username: String!) { matchedUser(username: $username) { languageProblemCount { languageName problemsSolved } } }',
    userProfile: 'query userPublicProfile($username: String!) { matchedUser(username: $username) { username profile { realName aboutMe userAvatar reputation ranking company school websites countryName skillTags } } }',
    userProgress: 'query userProfileUserQuestionProgressV2($userSlug: String!) { userProfileUserQuestionProgressV2(userSlug: $userSlug) { numAcceptedQuestions { difficulty count } numFailedQuestions { difficulty count } numUntouchedQuestions { difficulty count } } }',
    userSkillStats: 'query skillStats($username: String!) { matchedUser(username: $username) { tagProblemCounts { advanced { tagName tagSlug problemsSolved } intermediate { tagName tagSlug problemsSolved } fundamental { tagName tagSlug problemsSolved } } } }',
    userSubmitStats: 'query userSubmitStats($username: String!) { matchedUser(username: $username) { submitStats: submitStatsGlobal { acSubmissionNum { difficulty count submissions } } } }',
    discussions: 'query questionTopicsList($questionId: String!, $orderBy: TopicSortingOption, $skip: Int, $first: Int) { questionTopicsList(questionId: $questionId, orderBy: $orderBy, skip: $skip, first: $first) { totalNum edges { node { id title viewCount post { voteCount creationDate } tags { name slug } } } } }',
    favorites: 'query favoritesList { favoritesLists { allFavorites { idHash name isPublicFavorite questions { titleSlug } } } }',
    problems: 'query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) { problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) { totalNum data { acRate difficulty freqBar frontendQuestionId: questionFrontendId isFavor paidOnly: isPaidOnly status title titleSlug topicTags { name slug } hasSolution hasVideoSolution } } }',
    recentSubmissions: 'query recentAcSubmissions($username: String!, $limit: Int!) { recentAcSubmissionList(username: $username, limit: $limit) { id title titleSlug timestamp statusDisplay lang } }',
    submissions: 'query submissionList($offset: Int!, $limit: Int!, $questionSlug: String) { submissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) { lastKey hasNext submissions { id statusDisplay lang runtime timestamp url isPending title memory titleSlug } } }',
    topicTags: 'query questionTopicTags { questionTopicTags { edges { node { name slug } } } }'
  };

  function titleVars(args) { return { titleSlug: args.titleSlug }; }
  function usernameVars(args) { return { username: args.username }; }
  function userProgressVars(args) { return { userSlug: args.username }; }
  function calendarVars(args) { return { username: args.username, year: args.year }; }
  function submissionVars(args) { return { submissionId: args.submissionId }; }
  function discussionsVars(args) {
    return {
      questionId: args.questionId,
      orderBy: args.orderBy || 'most_votes',
      skip: args.skip === undefined ? 0 : args.skip,
      first: args.first === undefined ? 10 : args.first
    };
  }
  function listProblemsVars(args) {
    var filters = {};
    if (args.difficulty) { filters.difficulty = args.difficulty; }
    if (args.status) { filters.status = args.status; }
    if (args.tags && args.tags.length) { filters.tags = args.tags; }
    if (args.searchKeywords) { filters.searchKeywords = args.searchKeywords; }
    return {
      categorySlug: args.categorySlug || '',
      skip: args.skip === undefined ? 0 : args.skip,
      limit: args.limit === undefined ? 20 : args.limit,
      filters: filters
    };
  }
  function recentSubmissionsVars(args) {
    return { username: args.username, limit: args.limit === undefined ? 10 : args.limit };
  }
  function submissionsVars(args) {
    return {
      offset: args.offset === undefined ? 0 : args.offset,
      limit: args.limit === undefined ? 20 : args.limit,
      questionSlug: args.questionSlug
    };
  }

  var handlers = {
    'leetcode.get_code_snippets': readHandler('leetcode.get_code_snippets', TITLE_SLUG_PARAMS, queries.codeSnippets, titleVars, 'question'),
    'leetcode.get_contest_history': readHandler('leetcode.get_contest_history', USERNAME_PARAMS, queries.contestHistory, usernameVars, 'userContestRankingHistory'),
    'leetcode.get_contest_ranking': readHandler('leetcode.get_contest_ranking', USERNAME_PARAMS, queries.contestRanking, usernameVars, 'userContestRanking'),
    'leetcode.get_current_user': readHandler('leetcode.get_current_user', EMPTY_PARAMS, queries.currentUser, null, 'userStatus', userStatusGuard),
    'leetcode.get_daily_challenge': readHandler('leetcode.get_daily_challenge', EMPTY_PARAMS, queries.dailyChallenge, null, 'activeDailyCodingChallengeQuestion'),
    'leetcode.get_problem': readHandler('leetcode.get_problem', TITLE_SLUG_PARAMS, queries.problem, titleVars, 'question'),
    'leetcode.get_problem_hints': readHandler('leetcode.get_problem_hints', TITLE_SLUG_PARAMS, queries.problemHints, titleVars, 'question'),
    'leetcode.get_problem_solution': readHandler('leetcode.get_problem_solution', TITLE_SLUG_PARAMS, queries.problemSolution, titleVars, 'question'),
    'leetcode.get_problem_stats': readHandler('leetcode.get_problem_stats', TITLE_SLUG_PARAMS, queries.problemStats, titleVars, 'question'),
    'leetcode.get_similar_problems': readHandler('leetcode.get_similar_problems', TITLE_SLUG_PARAMS, queries.similarProblems, titleVars, 'question'),
    'leetcode.get_submission': readHandler('leetcode.get_submission', submissionParams, queries.submission, submissionVars, 'submissionDetails'),
    'leetcode.get_user_badges': readHandler('leetcode.get_user_badges', USERNAME_PARAMS, queries.userBadges, usernameVars, 'matchedUser'),
    'leetcode.get_user_calendar': readHandler('leetcode.get_user_calendar', userCalendarParams, queries.userCalendar, calendarVars, 'matchedUser'),
    'leetcode.get_user_language_stats': readHandler('leetcode.get_user_language_stats', USERNAME_PARAMS, queries.userLanguageStats, usernameVars, 'matchedUser'),
    'leetcode.get_user_profile': readHandler('leetcode.get_user_profile', USERNAME_PARAMS, queries.userProfile, usernameVars, 'matchedUser'),
    'leetcode.get_user_progress': readHandler('leetcode.get_user_progress', USERNAME_PARAMS, queries.userProgress, userProgressVars, 'userProfileUserQuestionProgressV2'),
    'leetcode.get_user_skill_stats': readHandler('leetcode.get_user_skill_stats', USERNAME_PARAMS, queries.userSkillStats, usernameVars, 'matchedUser'),
    'leetcode.get_user_submit_stats': readHandler('leetcode.get_user_submit_stats', USERNAME_PARAMS, queries.userSubmitStats, usernameVars, 'matchedUser'),
    'leetcode.list_discussions': readHandler('leetcode.list_discussions', listDiscussionsParams, queries.discussions, discussionsVars, 'questionTopicsList'),
    'leetcode.list_favorites': readHandler('leetcode.list_favorites', EMPTY_PARAMS, queries.favorites, null, 'favoritesLists'),
    'leetcode.list_problems': readHandler('leetcode.list_problems', listProblemsParams, queries.problems, listProblemsVars, 'problemsetQuestionList'),
    'leetcode.list_recent_submissions': readHandler('leetcode.list_recent_submissions', listRecentSubmissionsParams, queries.recentSubmissions, recentSubmissionsVars, 'recentAcSubmissionList'),
    'leetcode.list_submissions': readHandler('leetcode.list_submissions', listSubmissionsParams, queries.submissions, submissionsVars, 'submissionList'),
    'leetcode.list_topic_tags': readHandler('leetcode.list_topic_tags', EMPTY_PARAMS, queries.topicTags, null, 'questionTopicTags')
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
          descriptor: { slug: slug, service: 'leetcode.com', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerLeetcode = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
