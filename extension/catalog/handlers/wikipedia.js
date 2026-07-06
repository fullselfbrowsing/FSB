(function (global) {
  'use strict';

  /**
   * Wikipedia same-origin public READ head.
   *
   * Ports public MediaWiki and REST read descriptors through executeBoundSpec,
   * pinned to the first-party English Wikipedia origin. Auth-dependent
   * get_current_user and cross-origin wikimedia.org pageviews stay in the tail.
   */

  var WIKIPEDIA_ORIGIN = 'https://en.wikipedia.org';
  var WIKIPEDIA_SERVICE = 'wikipedia.org';
  var MEDIAWIKI_API_URL = WIKIPEDIA_ORIGIN + '/w/api.php';
  var REST_API_BASE = WIKIPEDIA_ORIGIN + '/api/rest_v1';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };
  var TITLE_PARAMS = stringParams('title', 'Wikipedia article title');

  var COMPARE_PARAMS = {
    type: 'object',
    properties: {
      from_rev: integerSchema('Source revision ID (older)'),
      to_rev: integerSchema('Target revision ID (newer)')
    },
    required: ['from_rev', 'to_rev'],
    additionalProperties: false
  };

  var TITLE_LIMIT_PARAMS = {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Wikipedia article title' },
      limit: integerSchema('Maximum number of items to return', 1, 500)
    },
    required: ['title'],
    additionalProperties: false
  };

  var CATEGORY_MEMBERS_PARAMS = {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Category name with Category: prefix' },
      limit: integerSchema('Maximum number of pages to return', 1, 500),
      type: { type: 'string', enum: ['page', 'subcat', 'file'], description: 'Category member type' }
    },
    required: ['category'],
    additionalProperties: false
  };

  var FEATURED_PARAMS = {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Date in YYYY/MM/DD format' }
    },
    additionalProperties: false
  };

  var RANDOM_PARAMS = {
    type: 'object',
    properties: {
      count: integerSchema('Number of random articles to return', 1, 20)
    },
    additionalProperties: false
  };

  var RECENT_CHANGES_PARAMS = {
    type: 'object',
    properties: {
      limit: integerSchema('Maximum number of recent changes to return', 1, 50)
    },
    additionalProperties: false
  };

  var REVISIONS_PARAMS = {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Wikipedia article title' },
      limit: integerSchema('Maximum number of revisions to return', 1, 50)
    },
    required: ['title'],
    additionalProperties: false
  };

  var SECTION_CONTENT_PARAMS = {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Wikipedia article title' },
      section: integerSchema('Section index', 0)
    },
    required: ['title', 'section'],
    additionalProperties: false
  };

  var USER_CONTRIBUTIONS_PARAMS = {
    type: 'object',
    properties: {
      username: { type: 'string', description: 'Wikipedia username' },
      limit: integerSchema('Maximum number of contributions to return', 1, 50)
    },
    required: ['username'],
    additionalProperties: false
  };

  var OPENSEARCH_PARAMS = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query text' },
      limit: integerSchema('Maximum number of suggestions to return', 1, 20)
    },
    required: ['query'],
    additionalProperties: false
  };

  var SEARCH_PARAMS = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query text' },
      limit: integerSchema('Maximum number of results to return', 1, 50),
      offset: integerSchema('Offset for pagination', 0)
    },
    required: ['query'],
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

  function fallback(slug, reason) {
    return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
      slug: slug,
      reason: reason || 'wikipedia-api-shape-mismatch',
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
    props[name] = { type: 'string', description: description };
    return {
      type: 'object',
      properties: props,
      required: [name],
      additionalProperties: false
    };
  }

  function valueOrDefault(value, fallbackValue) {
    return value === undefined || value === null ? fallbackValue : value;
  }

  function buildQuery(params) {
    var parts = [];
    var input = params || {};
    for (var key in input) {
      if (!Object.prototype.hasOwnProperty.call(input, key)) { continue; }
      var value = input[key];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.join('&');
  }

  function mediaWikiUrl(params) {
    var q = buildQuery(Object.assign({
      format: 'json',
      formatversion: 2
    }, params || {}));
    return MEDIAWIKI_API_URL + (q ? '?' + q : '');
  }

  function buildGetSpec(url) {
    return {
      url: url,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: WIKIPEDIA_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string'
        || (data.error && typeof data.error === 'object')
        || typeof data.message === 'string'
        || Array.isArray(data.errors));
  }

  function guardResult(result, slug, guard) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    if (looksLikeError(data) || (typeof guard === 'function' && !guard(data))) {
      return fallback(slug, 'wikipedia-api-shape-mismatch');
    }
    return result;
  }

  function objectHas(key) {
    return function(data) {
      return !!data && typeof data === 'object' && !Array.isArray(data)
        && Object.prototype.hasOwnProperty.call(data, key);
    };
  }

  function queryListHas(key) {
    return function(data) {
      return !!data && data.query && typeof data.query === 'object'
        && Array.isArray(data.query[key]);
    };
  }

  function hasPages(data) {
    return !!data && data.query && Array.isArray(data.query.pages)
      && data.query.pages.length > 0 && !data.query.pages[0].missing;
  }

  function hasFeaturedData(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (Object.prototype.hasOwnProperty.call(data, 'tfa')
        || Object.prototype.hasOwnProperty.call(data, 'mostread')
        || Object.prototype.hasOwnProperty.call(data, 'onthisday'));
  }

  function hasSummaryData(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.title === 'string' || typeof data.extract === 'string'
        || typeof data.pageid === 'number');
  }

  function hasOpenSearch(data) {
    return Array.isArray(data) && data.length >= 4 && Array.isArray(data[1]) && Array.isArray(data[3]);
  }

  function mediaWikiHandler(slug, paramsSchema, paramsForArgs, guard) {
    return {
      tier: 'T1a',
      origin: WIKIPEDIA_ORIGIN,
      sideEffectClass: 'read',
      params: paramsSchema,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'wikipedia-execute-bound-spec-unavailable');
        }
        var queryParams = paramsForArgs(args || {});
        var res = await ctx.executeBoundSpec(buildGetSpec(mediaWikiUrl(queryParams)), ctx.tabId);
        return guardResult(res, slug, guard);
      }
    };
  }

  function restHandler(slug, paramsSchema, pathForArgs, guard) {
    return {
      tier: 'T1a',
      origin: WIKIPEDIA_ORIGIN,
      sideEffectClass: 'read',
      params: paramsSchema,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'wikipedia-execute-bound-spec-unavailable');
        }
        var url = REST_API_BASE + pathForArgs(args || {});
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardResult(res, slug, guard);
      }
    };
  }

  function encodedTitle(value) {
    return encodeURIComponent(String(value || '').replace(/ /g, '_'));
  }

  function encodedDatePath(value) {
    var raw = value || new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    return String(raw).split('/').map(function(part) {
      return encodeURIComponent(part);
    }).join('/');
  }

  function titleLimitArgs(args, limitDefault) {
    return {
      titles: args.title,
      limit: valueOrDefault(args.limit, limitDefault)
    };
  }

  var handlers = {
    'wikipedia.compare_revisions': mediaWikiHandler('wikipedia.compare_revisions', COMPARE_PARAMS, function(args) {
      return {
        action: 'compare',
        fromrev: args.from_rev,
        torev: args.to_rev,
        prop: 'diff|title|ids'
      };
    }, objectHas('compare')),

    'wikipedia.get_article_categories': mediaWikiHandler('wikipedia.get_article_categories', TITLE_LIMIT_PARAMS, function(args) {
      var p = titleLimitArgs(args, 50);
      return { action: 'query', titles: p.titles, prop: 'categories', cllimit: p.limit };
    }, hasPages),

    'wikipedia.get_article_languages': mediaWikiHandler('wikipedia.get_article_languages', TITLE_LIMIT_PARAMS, function(args) {
      var p = titleLimitArgs(args, 50);
      return { action: 'query', titles: p.titles, prop: 'langlinks', lllimit: p.limit, llprop: 'url' };
    }, hasPages),

    'wikipedia.get_article_links': mediaWikiHandler('wikipedia.get_article_links', TITLE_LIMIT_PARAMS, function(args) {
      var p = titleLimitArgs(args, 50);
      return { action: 'query', titles: p.titles, prop: 'links', pllimit: p.limit, plnamespace: 0 };
    }, hasPages),

    'wikipedia.get_article_sections': mediaWikiHandler('wikipedia.get_article_sections', TITLE_PARAMS, function(args) {
      return { action: 'parse', page: args.title, prop: 'sections' };
    }, objectHas('parse')),

    'wikipedia.get_article': mediaWikiHandler('wikipedia.get_article', TITLE_PARAMS, function(args) {
      return {
        action: 'query',
        titles: args.title,
        prop: 'extracts|info|pageprops|pageimages',
        exintro: 1,
        explaintext: 1,
        piprop: 'thumbnail',
        pithumbsize: 300,
        inprop: 'url|displaytitle|protection'
      };
    }, hasPages),

    'wikipedia.get_backlinks': mediaWikiHandler('wikipedia.get_backlinks', TITLE_LIMIT_PARAMS, function(args) {
      return {
        action: 'query',
        list: 'backlinks',
        bltitle: args.title,
        bllimit: valueOrDefault(args.limit, 50),
        blnamespace: 0
      };
    }, queryListHas('backlinks')),

    'wikipedia.get_category_members': mediaWikiHandler('wikipedia.get_category_members', CATEGORY_MEMBERS_PARAMS, function(args) {
      return {
        action: 'query',
        list: 'categorymembers',
        cmtitle: args.category,
        cmlimit: valueOrDefault(args.limit, 50),
        cmtype: valueOrDefault(args.type, 'page')
      };
    }, queryListHas('categorymembers')),

    'wikipedia.get_featured_content': restHandler('wikipedia.get_featured_content', FEATURED_PARAMS, function(args) {
      return '/feed/featured/' + encodedDatePath(args.date);
    }, hasFeaturedData),

    'wikipedia.get_page_summary': restHandler('wikipedia.get_page_summary', TITLE_PARAMS, function(args) {
      return '/page/summary/' + encodedTitle(args.title);
    }, hasSummaryData),

    'wikipedia.get_random_articles': mediaWikiHandler('wikipedia.get_random_articles', RANDOM_PARAMS, function(args) {
      return {
        action: 'query',
        list: 'random',
        rnlimit: valueOrDefault(args.count, 5),
        rnnamespace: 0
      };
    }, queryListHas('random')),

    'wikipedia.get_recent_changes': mediaWikiHandler('wikipedia.get_recent_changes', RECENT_CHANGES_PARAMS, function(args) {
      return {
        action: 'query',
        list: 'recentchanges',
        rclimit: valueOrDefault(args.limit, 20),
        rcprop: 'user|timestamp|title|comment|sizes',
        rctype: 'edit',
        rcnamespace: 0
      };
    }, queryListHas('recentchanges')),

    'wikipedia.get_revisions': mediaWikiHandler('wikipedia.get_revisions', REVISIONS_PARAMS, function(args) {
      return {
        action: 'query',
        titles: args.title,
        prop: 'revisions',
        rvlimit: valueOrDefault(args.limit, 10),
        rvprop: 'ids|timestamp|user|comment|size'
      };
    }, hasPages),

    'wikipedia.get_section_content': mediaWikiHandler('wikipedia.get_section_content', SECTION_CONTENT_PARAMS, function(args) {
      return {
        action: 'parse',
        page: args.title,
        prop: 'text',
        section: args.section,
        disableeditsection: 1,
        disabletoc: 1
      };
    }, objectHas('parse')),

    'wikipedia.get_user_contributions': mediaWikiHandler('wikipedia.get_user_contributions', USER_CONTRIBUTIONS_PARAMS, function(args) {
      return {
        action: 'query',
        list: 'usercontribs',
        ucuser: args.username,
        uclimit: valueOrDefault(args.limit, 20),
        ucprop: 'ids|title|timestamp|comment|size'
      };
    }, queryListHas('usercontribs')),

    'wikipedia.opensearch': mediaWikiHandler('wikipedia.opensearch', OPENSEARCH_PARAMS, function(args) {
      return {
        action: 'opensearch',
        search: args.query,
        limit: valueOrDefault(args.limit, 10),
        namespace: 0
      };
    }, hasOpenSearch),

    'wikipedia.search_articles': mediaWikiHandler('wikipedia.search_articles', SEARCH_PARAMS, function(args) {
      return {
        action: 'query',
        list: 'search',
        srsearch: args.query,
        srlimit: valueOrDefault(args.limit, 10),
        sroffset: valueOrDefault(args.offset, 0)
      };
    }, queryListHas('search'))
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
          descriptor: { slug: slug, service: WIKIPEDIA_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerWikipedia = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
