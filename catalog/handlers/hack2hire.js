(function (global) {
  'use strict';

  /**
   * Hack2Hire storage-bearer READ head.
   *
   * Hack2Hire keeps ALGRO_TOKEN and USER_ID in page localStorage as JSON strings.
   * The handler declares those storage needs in the bound spec; the fixed page
   * fetch primitive reads them inside the origin-pinned page and never returns
   * the values to the service worker. All promoted descriptors are GET reads.
   */

  var HACK2HIRE_ORIGIN = 'https://www.hack2hire.com';
  var HACK2HIRE_SERVICE = 'hack2hire.com';
  var API_BASE = 'https://api.hack2hire.com/algro/v1';
  var INT_LIMIT = 9007199254740991;

  var POST_TYPES = ['ALGORITHM', 'SD', 'ML_SD', 'BLOG'];
  var STAGES = ['SCREENING', 'OA', 'ONSITE', 'PHONE'];
  var SORT_FIELDS = ['isLocked', 'frequency', 'difficulty', 'createdDate'];

  var EMPTY_PARAMS = schema({});
  var COMMENT_ID_PARAMS = schema({
    commentId: { type: 'string', minLength: 1, description: 'Comment ID' }
  }, ['commentId']);
  var COMPANY_PARAMS = schema({
    company: { type: 'string', minLength: 1, description: 'Company key in uppercase' }
  }, ['company']);
  var POST_ID_PARAMS = schema({
    postId: { type: 'string', minLength: 1, description: 'Post ID' }
  }, ['postId']);
  var COMPLETED_COUNT_PARAMS = schema({
    company: { type: 'string', minLength: 1, description: 'Company key in uppercase' },
    type: { type: 'string', enum: POST_TYPES, description: 'Question type' },
    selectedCollectionKey: { type: 'string', minLength: 1, description: 'Curated collection key' }
  });
  var QUESTION_NEIGHBORS_PARAMS = schema({
    postId: { type: 'string', minLength: 1, description: 'Post ID' },
    company: { type: 'string', description: 'Company key in uppercase' },
    type: { type: 'string', enum: POST_TYPES, description: 'Question type' },
    sortedBy: { type: 'string', enum: SORT_FIELDS, description: 'Sort field' }
  }, ['postId']);
  var PAGED_COMMENT_REPLIES_PARAMS = schema({
    commentId: { type: 'string', minLength: 1, description: 'Parent comment ID' },
    page: integerSchema('Page number', 1),
    perPage: integerSchema('Results per page', 1, 50)
  }, ['commentId']);
  var POST_ACTIVITY_PARAMS = schema({
    postId: { type: 'string', description: 'Optional post ID filter' },
    page: integerSchema('Page number', 1),
    perPage: integerSchema('Results per page', 1, 999)
  });
  var QUESTION_COMMENTS_PARAMS = schema({
    postId: { type: 'string', description: 'Post ID' },
    codingQuestionId: { type: 'string', description: 'Coding question ID' },
    page: integerSchema('Page number', 1),
    perPage: integerSchema('Results per page', 1, 50)
  });
  var LIST_QUESTIONS_PARAMS = schema({
    companyTags: { type: 'string', description: 'Company key in uppercase' },
    type: { type: 'string', enum: POST_TYPES, description: 'Question type' },
    algorithmTags: { type: 'string', description: 'Algorithm/topic tag' },
    stages: { type: 'string', enum: STAGES, description: 'Interview stage' },
    difficulty: integerSchema('Difficulty level', 1, 3),
    selectedCollectionKey: { type: 'string', description: 'Curated collection key' },
    sortBy: { type: 'string', enum: SORT_FIELDS, description: 'Sort field' },
    page: integerSchema('Page number', 1),
    perPage: integerSchema('Results per page', 1, 100)
  });

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
      description: description
    };
  }

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
      reason: reason || 'hack2hire-api-shape-mismatch',
      fellBackToDom: true
    });
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function appendQuery(parts, key, value) {
    if (value === undefined || value === null || value === '') { return; }
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      appendQuery(parts, pairs[i][0], pairs[i][1]);
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function apiSpec(path, pairs) {
    return {
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      body: null,
      query: {},
      authStrategy: 'none',
      credentials: 'omit',
      origin: HACK2HIRE_ORIGIN,
      extract: '@',
      _authNeed: {
        kind: 'bearer',
        source: 'storage',
        storage: 'localStorage',
        tokenKey: 'ALGRO_TOKEN',
        parseJson: true,
        header: 'Authorization',
        prefix: 'Bearer ',
        extraHeaders: [
          { header: 'x-user-id', storageKey: 'USER_ID', parseJson: true }
        ]
      }
    };
  }

  function unwrapEnvelope(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, result && result.error === 'auth-storage-missing'
        ? 'hack2hire-auth-storage-missing'
        : 'hack2hire-api-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'hack2hire-api-http-error');
    }
    var envelope = result.data;
    if (!isObject(envelope) || !Object.prototype.hasOwnProperty.call(envelope, 'data')) {
      return fallback(slug, 'hack2hire-api-shape-mismatch');
    }
    var status = envelope.status;
    if (isObject(status) && typeof status.code === 'number' && status.code >= 400) {
      return fallback(slug, 'hack2hire-api-status-error');
    }
    return { success: true, status: result.status, data: envelope.data };
  }

  function readHandler(slug, params, pathBuilder, queryBuilder, guard) {
    return {
      tier: 'T1a',
      origin: HACK2HIRE_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'hack2hire-execute-bound-spec-unavailable');
        }
        var a = args || {};
        if (typeof guard === 'function') {
          var guarded = guard(a);
          if (guarded && guarded.success === false) { return guarded; }
        }
        var path = typeof pathBuilder === 'function' ? pathBuilder(a) : pathBuilder;
        var pairs = typeof queryBuilder === 'function' ? queryBuilder(a) : [];
        var res = await ctx.executeBoundSpec(apiSpec(path, pairs), ctx.tabId);
        return unwrapEnvelope(res, slug);
      }
    };
  }

  function requireOneCommentTarget(args) {
    return args.postId || args.codingQuestionId
      ? null
      : fallback('hack2hire.list_question_comments', 'hack2hire-comment-target-required');
  }

  var handlers = {
    'hack2hire.get_comment': readHandler(
      'hack2hire.get_comment',
      COMMENT_ID_PARAMS,
      function (a) { return '/comment/' + encodeSegment(a.commentId); }
    ),
    'hack2hire.get_company_question_stats': readHandler(
      'hack2hire.get_company_question_stats',
      COMPANY_PARAMS,
      '/post/company-statistics',
      function (a) { return [['company', a.company]]; }
    ),
    'hack2hire.get_completed_question_count': readHandler(
      'hack2hire.get_completed_question_count',
      COMPLETED_COUNT_PARAMS,
      '/user/completed-post-count',
      function (a) {
        return [
          ['company', a.company],
          ['type', a.type],
          ['selectedCollectionKey', a.selectedCollectionKey]
        ];
      }
    ),
    'hack2hire.get_current_user': readHandler(
      'hack2hire.get_current_user',
      EMPTY_PARAMS,
      '/user/profile'
    ),
    'hack2hire.get_question_neighbors': readHandler(
      'hack2hire.get_question_neighbors',
      QUESTION_NEIGHBORS_PARAMS,
      function (a) { return '/post/' + encodeSegment(a.postId) + '/previous-next'; },
      function (a) {
        return [
          ['company', a.company],
          ['type', a.type],
          ['sortedBy', a.sortedBy || 'isLocked']
        ];
      }
    ),
    'hack2hire.get_question': readHandler(
      'hack2hire.get_question',
      POST_ID_PARAMS,
      function (a) { return '/post/' + encodeSegment(a.postId); }
    ),
    'hack2hire.get_subscription': readHandler(
      'hack2hire.get_subscription',
      EMPTY_PARAMS,
      '/user/subscription-detail'
    ),
    'hack2hire.list_comment_replies': readHandler(
      'hack2hire.list_comment_replies',
      PAGED_COMMENT_REPLIES_PARAMS,
      '/comment/reply/filter',
      function (a) {
        return [
          ['commentId', a.commentId],
          ['page', a.page || 1],
          ['perPage', a.perPage || 10]
        ];
      }
    ),
    'hack2hire.list_companies': readHandler(
      'hack2hire.list_companies',
      EMPTY_PARAMS,
      '/company-directory'
    ),
    'hack2hire.list_my_bookmarks': readHandler(
      'hack2hire.list_my_bookmarks',
      POST_ACTIVITY_PARAMS,
      '/user/filter-bookmark-post-records',
      function (a) {
        return [
          ['page', a.page || 1],
          ['perPage', a.perPage || 25],
          ['postId', a.postId]
        ];
      }
    ),
    'hack2hire.list_my_visits': readHandler(
      'hack2hire.list_my_visits',
      POST_ACTIVITY_PARAMS,
      '/user/filter-visit-post-records',
      function (a) {
        return [
          ['page', a.page || 1],
          ['perPage', a.perPage || 25],
          ['postId', a.postId]
        ];
      }
    ),
    'hack2hire.list_question_coding_problems': readHandler(
      'hack2hire.list_question_coding_problems',
      POST_ID_PARAMS,
      '/coding/filter',
      function (a) { return [['postId', a.postId]]; }
    ),
    'hack2hire.list_question_comments': readHandler(
      'hack2hire.list_question_comments',
      QUESTION_COMMENTS_PARAMS,
      '/comment/filter',
      function (a) {
        return [
          ['page', a.page || 1],
          ['perPage', a.perPage || 10],
          ['postId', a.postId],
          ['codingQuestionId', a.codingQuestionId]
        ];
      },
      requireOneCommentTarget
    ),
    'hack2hire.list_questions': readHandler(
      'hack2hire.list_questions',
      LIST_QUESTIONS_PARAMS,
      '/post/filter',
      function (a) {
        return [
          ['page', a.page || 1],
          ['perPage', a.perPage || 10],
          ['companyTags', a.companyTags],
          ['type', a.type],
          ['algorithmTags', a.algorithmTags],
          ['stages', a.stages],
          ['difficulty', a.difficulty],
          ['selectedCollectionKey', a.selectedCollectionKey],
          ['sortBy', a.sortBy]
        ];
      }
    )
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
            service: HACK2HIRE_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerHack2hire = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
