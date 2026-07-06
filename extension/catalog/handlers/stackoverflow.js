(function (global) {
  'use strict';

  /**
   * Stack Overflow public same-origin HTML READ head.
   *
   * Ports only public question, answer, search/list, and tag reads that can be
   * fetched from first-party stackoverflow.com HTML pages. The vendored Stack
   * Exchange API helper uses a separate host; this head intentionally does not
   * replay that API or authenticated user/profile endpoints.
   */

  var STACKOVERFLOW_ORIGIN = 'https://stackoverflow.com';
  var STACKOVERFLOW_SERVICE = 'stackoverflow.com';
  var INT_LIMIT = 9007199254740991;

  var QUESTION_ID_PARAMS = withProps({
    question_id: integerSchema('Question ID')
  }, ['question_id']);

  var ANSWER_ID_PARAMS = withProps({
    answer_id: integerSchema('Answer ID')
  }, ['answer_id']);

  var QUESTION_ANSWERS_PARAMS = withProps({
    question_id: integerSchema('Question ID'),
    sort: { description: 'Sort order (default: votes)', type: 'string', enum: ['activity', 'creation', 'votes'] },
    order: { description: 'Sort direction (default: desc)', type: 'string', enum: ['asc', 'desc'] },
    page: integerSchema('Page number (default 1)', 1),
    pagesize: integerSchema('Results per page (best-effort for HTML; default 30)', 1, 100)
  }, ['question_id']);

  var LIST_QUESTIONS_PARAMS = withProps({
    sort: { description: 'Sort order (default: activity)', type: 'string', enum: ['activity', 'creation', 'votes', 'hot', 'week', 'month'] },
    order: { description: 'Sort direction (default: desc)', type: 'string', enum: ['asc', 'desc'] },
    tagged: { description: 'Semicolon-delimited tags to filter by', type: 'string' },
    page: integerSchema('Page number (default 1)', 1),
    pagesize: integerSchema('Results per page (HTML page size is site-controlled)', 1, 100)
  }, []);

  var SEARCH_QUESTIONS_PARAMS = withProps({
    q: { description: 'Full-text search query', type: 'string' },
    tagged: { description: 'Semicolon-delimited tags to filter by', type: 'string' },
    nottagged: { description: 'Semicolon-delimited tags to exclude', type: 'string' },
    sort: { description: 'Sort order (default: relevance when q is provided)', type: 'string', enum: ['activity', 'creation', 'votes', 'relevance'] },
    order: { description: 'Sort direction (default: desc)', type: 'string', enum: ['asc', 'desc'] },
    accepted: { description: 'Filter by whether the question has an accepted answer', type: 'boolean' },
    answers: integerSchema('Minimum number of answers'),
    page: integerSchema('Page number (default 1)', 1),
    pagesize: integerSchema('Results per page (HTML page size is site-controlled)', 1, 100)
  }, []);

  var SIMILAR_PARAMS = withProps({
    title: { type: 'string', minLength: 1, description: 'Title text to find similar questions for' },
    tagged: { description: 'Semicolon-delimited tags to filter by', type: 'string' },
    nottagged: { description: 'Semicolon-delimited tags to exclude', type: 'string' },
    sort: { description: 'Sort order (default: relevance)', type: 'string', enum: ['activity', 'creation', 'votes', 'relevance'] },
    order: { description: 'Sort direction (default: desc)', type: 'string', enum: ['asc', 'desc'] },
    page: integerSchema('Page number (default 1)', 1),
    pagesize: integerSchema('Results per page (HTML page size is site-controlled)', 1, 100)
  }, ['title']);

  var LIST_TAGS_PARAMS = withProps({
    inname: { description: 'Filter tags containing this string', type: 'string' },
    sort: { description: 'Sort order (default: popular)', type: 'string', enum: ['popular', 'activity', 'name'] },
    order: { description: 'Sort direction (default: desc)', type: 'string', enum: ['asc', 'desc'] },
    page: integerSchema('Page number (default 1)', 1),
    pagesize: integerSchema('Results per page (HTML page size is site-controlled)', 1, 100)
  }, []);

  var TAG_PARAMS = withProps({
    tag: { type: 'string', minLength: 1, description: 'Tag name' }
  }, ['tag']);

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
      reason: reason || 'stackoverflow-public-html-shape-mismatch',
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

  function withProps(properties, required) {
    return {
      type: 'object',
      properties: properties,
      required: required || [],
      additionalProperties: false
    };
  }

  function pathSegment(value) {
    return encodeURIComponent(String(value || '').replace(/^@+/, '').trim());
  }

  function tagPath(value) {
    return String(value || '')
      .split(';')
      .map(function(part) { return pathSegment(part); })
      .filter(Boolean)
      .join('+');
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

  function buildGetSpec(path) {
    return {
      url: STACKOVERFLOW_ORIGIN + path,
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: STACKOVERFLOW_ORIGIN,
      extract: '@'
    };
  }

  function htmlDecode(value) {
    var str = String(value || '');
    return str.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function(match, entity) {
      var lower = String(entity || '').toLowerCase();
      if (lower === 'amp') { return '&'; }
      if (lower === 'lt') { return '<'; }
      if (lower === 'gt') { return '>'; }
      if (lower === 'quot') { return '"'; }
      if (lower === 'apos' || lower === '#39' || lower === '#x27') { return '\''; }
      if (lower === 'nbsp') { return ' '; }
      if (lower.charAt(0) === '#') {
        var base = lower.charAt(1) === 'x' ? 16 : 10;
        var raw = lower.charAt(1) === 'x' ? lower.slice(2) : lower.slice(1);
        var code = parseInt(raw, base);
        if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
          try { return String.fromCodePoint(code); } catch (e) { return match; }
        }
      }
      return match;
    });
  }

  function stripTags(value) {
    return htmlDecode(String(value || '').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }

  function attrValue(attrs, name) {
    var quoted = new RegExp('\\b' + name + '\\s*=\\s*([\'"])([\\s\\S]*?)\\1', 'i').exec(attrs || '');
    if (quoted) { return htmlDecode(quoted[2]); }
    var bare = new RegExp('\\b' + name + '\\s*=\\s*([^\\s>]+)', 'i').exec(attrs || '');
    return bare ? htmlDecode(bare[1]) : '';
  }

  function metaContent(html, key, value) {
    var re = /<meta\b([^>]*)>/gi;
    var m;
    while ((m = re.exec(String(html || ''))) !== null) {
      var attrs = m[1] || '';
      var prop = attrValue(attrs, key);
      if (prop && prop.toLowerCase() === String(value || '').toLowerCase()) {
        return attrValue(attrs, 'content');
      }
    }
    return '';
  }

  function linkHref(html, relValue) {
    var re = /<link\b([^>]*)>/gi;
    var m;
    while ((m = re.exec(String(html || ''))) !== null) {
      var attrs = m[1] || '';
      var rel = attrValue(attrs, 'rel');
      if (rel && rel.toLowerCase() === String(relValue || '').toLowerCase()) {
        return attrValue(attrs, 'href');
      }
    }
    return '';
  }

  function numberFrom(value) {
    var n = parseInt(String(value || '').replace(/,/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }

  function unixToIso(ts) {
    var n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) { return ''; }
    try { return new Date(n * 1000).toISOString(); } catch (e) { return ''; }
  }

  function itempropNumber(html, prop) {
    var re = new RegExp('itemprop\\s*=\\s*([\'"])' + prop + '\\1[\\s\\S]{0,220}?data-value\\s*=\\s*([\'"])([^\'"]+)\\2', 'i');
    var m = re.exec(String(html || ''));
    if (m) { return numberFrom(m[3]); }
    re = new RegExp('itemprop\\s*=\\s*([\'"])' + prop + '\\1[^>]*>([\\s\\S]*?)<', 'i');
    m = re.exec(String(html || ''));
    return m ? numberFrom(stripTags(m[2])) : 0;
  }

  function allRelTags(html) {
    var tags = [];
    var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(String(html || ''))) !== null) {
      var attrs = m[1] || '';
      if (String(attrValue(attrs, 'rel')).toLowerCase() === 'tag') {
        var text = stripTags(m[2]);
        if (text) { tags.push(text); }
      }
    }
    return tags;
  }

  function bodyFromSegment(segment) {
    var re = /<div\b([^>]*\bclass\s*=\s*(['"])[^'"]*\bjs-post-body\b[^'"]*\2[^>]*)>([\s\S]*?)<\/div>/i;
    var m = re.exec(String(segment || ''));
    return m ? String(m[3] || '').trim() : '';
  }

  function canonicalUrl(html, fallbackPath) {
    return linkHref(html, 'canonical')
      || metaContent(html, 'property', 'og:url')
      || (STACKOVERFLOW_ORIGIN + (fallbackPath || ''));
  }

  function questionSegment(html) {
    var start = String(html || '').search(/<div\b[^>]*\bclass\s*=\s*(['"])[^'"]*\bjs-question\b[^'"]*\1[^>]*\bid\s*=\s*(['"])question\2[^>]*>/i);
    if (start < 0) {
      start = String(html || '').search(/<div\b[^>]*\bid\s*=\s*(['"])question\1[^>]*\bclass\s*=\s*(['"])[^'"]*\bjs-question\b[^'"]*\2[^>]*>/i);
    }
    if (start < 0) { return ''; }
    var end = String(html || '').indexOf('id="answers"', start);
    if (end < 0) { end = String(html || '').indexOf("id='answers'", start); }
    return end > start ? String(html || '').slice(start, end) : String(html || '').slice(start);
  }

  function questionIdFromHtml(html, args) {
    var seg = questionSegment(html);
    var m = /data-questionid\s*=\s*(['"])(\d+)\1/i.exec(seg);
    return m ? numberFrom(m[2]) : numberFrom(args && args.question_id);
  }

  function parseQuestion(html, args) {
    var seg = questionSegment(html);
    var id = questionIdFromHtml(html, args);
    var title = metaContent(html, 'name', 'twitter:title')
      || metaContent(html, 'property', 'og:title')
      || metaContent(html, 'itemprop', 'name');
    var body = bodyFromSegment(seg) || metaContent(html, 'itemprop', 'description');
    var accepted = /accepted-answer[\s\S]{0,500}?data-answerid\s*=\s*(['"])(\d+)\1/i.exec(html || '');
    var answerCount = /data-answercount\s*=\s*(['"])(\d+)\1/i.exec(html || '');
    var score = /data-score\s*=\s*(['"])(-?\d+)\1/i.exec(seg || '');
    var owner = /data-author-username\s*=\s*(['"])([^'"]+)\1/i.exec(seg || '');
    var link = canonicalUrl(html, id ? '/questions/' + id : '');
    if (!id || !title || !body) { return null; }
    return {
      question: {
        question_id: id,
        title: stripTags(title),
        body: body,
        tags: allRelTags(seg),
        score: score ? numberFrom(score[2]) : itempropNumber(seg, 'upvoteCount'),
        answer_count: answerCount ? numberFrom(answerCount[2]) : itempropNumber(html, 'answerCount'),
        view_count: 0,
        is_answered: !!accepted,
        accepted_answer_id: accepted ? numberFrom(accepted[2]) : 0,
        creation_date: '',
        last_activity_date: '',
        link: link,
        owner_display_name: owner ? htmlDecode(owner[2]) : '',
        owner_reputation: 0,
        owner_user_id: 0,
        bounty_amount: 0,
        closed_reason: ''
      }
    };
  }

  function answerSegments(html) {
    var parts = String(html || '').split(/<div\s+id=["']answer-/i);
    var out = [];
    for (var i = 1; i < parts.length; i++) {
      out.push('<div id="answer-' + parts[i]);
    }
    return out;
  }

  function parseAnswerSegment(segment) {
    var id = /^<div id="answer-(\d+)"/i.exec(segment || '');
    var parent = /data-parentid\s*=\s*(['"])(\d+)\1/i.exec(segment || '');
    var score = /data-score\s*=\s*(['"])(-?\d+)\1/i.exec(segment || '');
    var owner = /itemprop\s*=\s*(['"])author\1[\s\S]{0,500}?itemprop\s*=\s*(['"])name\2[^>]*>([\s\S]*?)<\/span>/i.exec(segment || '');
    var body = bodyFromSegment(segment);
    if (!id || !body) { return null; }
    return {
      answer_id: numberFrom(id[1]),
      question_id: parent ? numberFrom(parent[2]) : 0,
      body: body,
      score: score ? numberFrom(score[2]) : itempropNumber(segment, 'upvoteCount'),
      is_accepted: /\baccepted-answer\b/.test(segment || ''),
      creation_date: '',
      last_activity_date: '',
      owner_display_name: owner ? stripTags(owner[3]) : '',
      owner_reputation: 0,
      owner_user_id: 0
    };
  }

  function parseAnswers(html) {
    var segments = answerSegments(html);
    var answers = [];
    for (var i = 0; i < segments.length; i++) {
      var answer = parseAnswerSegment(segments[i]);
      if (answer) { answers.push(answer); }
    }
    return answers;
  }

  function parseGetAnswer(html, args) {
    var answers = parseAnswers(html);
    var wanted = numberFrom(args && args.answer_id);
    for (var i = 0; i < answers.length; i++) {
      if (answers[i].answer_id === wanted) {
        return { answer: answers[i] };
      }
    }
    return null;
  }

  function parseQuestionAnswers(html) {
    var answers = parseAnswers(html);
    if (!answers.length) { return null; }
    return {
      answers: answers,
      has_more: /rel\s*=\s*(['"])next\1/i.test(html || ''),
      quota_remaining: 0
    };
  }

  function parseQuestionSummary(segment) {
    var id = /^(\d+)/.exec(segment || '') || /data-post-id\s*=\s*(['"])(\d+)\1/i.exec(segment || '');
    var title = /<h3\b[^>]*\bs-post-summary--content-title\b[^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(segment || '');
    var excerpt = /<div\b[^>]*\bs-post-summary--content-excerpt\b[^>]*>([\s\S]*?)<\/div>/i.exec(segment || '');
    if (!id || !title) { return null; }
    return {
      question_id: numberFrom(id[2] || id[1]),
      title: stripTags(title[2]),
      body: excerpt ? stripTags(excerpt[1]) : '',
      tags: allRelTags(segment),
      score: itempropNumber(segment, 'upvoteCount'),
      answer_count: itempropNumber(segment, 'answerCount'),
      view_count: 0,
      is_answered: /\bhas-accepted-answer\b|\banswered-accepted\b|\banswered\b/i.test(segment || ''),
      accepted_answer_id: 0,
      creation_date: '',
      last_activity_date: '',
      link: STACKOVERFLOW_ORIGIN + attrValue(title[1], 'href'),
      owner_display_name: (function() {
        var owner = /itemprop\s*=\s*(['"])author\1[\s\S]{0,500}?itemprop\s*=\s*(['"])name\2[^>]*>([\s\S]*?)<\/span>/i.exec(segment || '');
        return owner ? stripTags(owner[3]) : '';
      })(),
      owner_reputation: 0,
      owner_user_id: 0,
      bounty_amount: 0,
      closed_reason: ''
    };
  }

  function parseQuestionList(html) {
    var parts = String(html || '').split(/<div\s+id=["']question-summary-/i);
    var questions = [];
    for (var i = 1; i < parts.length; i++) {
      var q = parseQuestionSummary(parts[i]);
      if (q) { questions.push(q); }
    }
    if (!questions.length) { return null; }
    return {
      questions: questions,
      has_more: /rel\s*=\s*(['"])next\1/i.test(html || '') || /\bs-pagination--item__clear\b[\s\S]*?>\s*next\s*</i.test(html || ''),
      quota_remaining: 0
    };
  }

  function parseSearchExcerptsAsQuestions(html) {
    return parseQuestionList(html);
  }

  function parseTags(html) {
    var parts = String(html || '').split(/<div\b[^>]*\bjs-tag-cell\b[^>]*>/i);
    var tags = [];
    for (var i = 1; i < parts.length; i++) {
      var a = /<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(parts[i]);
      if (!a || String(attrValue(a[1], 'rel')).toLowerCase() !== 'tag') { continue; }
      var count = /([\d,]+)\s+questions/i.exec(parts[i]);
      var excerpt = /<div\b[^>]*\bfc-black-500\b[^>]*>([\s\S]*?)<\/div>/i.exec(parts[i]);
      tags.push({
        name: stripTags(a[2]),
        count: count ? numberFrom(count[1]) : 0,
        has_synonyms: false,
        is_moderator_only: false,
        is_required: false,
        excerpt: excerpt ? stripTags(excerpt[1]) : ''
      });
    }
    if (!tags.length) { return null; }
    return {
      tags: tags.map(function(tag) {
        return {
          name: tag.name,
          count: tag.count,
          has_synonyms: tag.has_synonyms,
          is_moderator_only: tag.is_moderator_only,
          is_required: tag.is_required
        };
      }),
      has_more: /rel\s*=\s*(['"])next\1/i.test(html || ''),
      quota_remaining: 0
    };
  }

  function parseTagInfo(html, args) {
    var tagName = String(args && args.tag || '').trim();
    var list = parseTags(html);
    if (list && list.tags && list.tags.length) {
      for (var i = 0; i < list.tags.length; i++) {
        if (list.tags[i].name === tagName) {
          return {
            tag: {
              name: list.tags[i].name,
              count: list.tags[i].count,
              has_synonyms: list.tags[i].has_synonyms,
              is_moderator_only: list.tags[i].is_moderator_only,
              is_required: list.tags[i].is_required,
              excerpt: metaContent(html, 'name', 'description') || '',
              wiki_body: ''
            }
          };
        }
      }
    }
    var title = metaContent(html, 'property', 'og:title')
      || metaContent(html, 'name', 'twitter:title')
      || linkHref(html, 'canonical');
    var desc = metaContent(html, 'property', 'og:description')
      || metaContent(html, 'name', 'description')
      || metaContent(html, 'name', 'twitter:description');
    if (!tagName || !title) { return null; }
    return {
      tag: {
        name: tagName,
        count: 0,
        has_synonyms: false,
        is_moderator_only: false,
        is_required: false,
        excerpt: stripTags(desc),
        wiki_body: ''
      }
    };
  }

  function sortTab(sort) {
    var s = String(sort || '').toLowerCase();
    if (s === 'creation') { return 'Newest'; }
    if (s === 'votes') { return 'Votes'; }
    if (s === 'hot') { return 'Hot'; }
    if (s === 'week') { return 'Week'; }
    if (s === 'month') { return 'Month'; }
    if (s === 'relevance') { return 'Relevance'; }
    return 'Active';
  }

  function questionListPath(args, unanswered) {
    var tagged = tagPath(args && args.tagged);
    var base = unanswered
      ? (tagged ? '/unanswered/tagged/' + tagged : '/unanswered')
      : (tagged ? '/questions/tagged/' + tagged : '/questions');
    return base + buildQuery([
      ['tab', sortTab(args && args.sort)],
      ['page', args && args.page]
    ]);
  }

  function searchQuery(args, titleFallback) {
    var parts = [];
    var tagged = String(args && args.tagged || '').split(';').filter(Boolean);
    var nottagged = String(args && args.nottagged || '').split(';').filter(Boolean);
    for (var i = 0; i < tagged.length; i++) { parts.push('[' + tagged[i].trim() + ']'); }
    for (var j = 0; j < nottagged.length; j++) { parts.push('-[' + nottagged[j].trim() + ']'); }
    if (args && args.accepted === true) { parts.push('hasaccepted:yes'); }
    if (args && args.accepted === false) { parts.push('hasaccepted:no'); }
    if (args && args.answers !== undefined) { parts.push('answers:' + String(args.answers)); }
    parts.push(String((args && args.q) || titleFallback || '').trim());
    return parts.join(' ').trim();
  }

  function searchPath(args, titleFallback) {
    return '/search' + buildQuery([
      ['q', searchQuery(args || {}, titleFallback)],
      ['tab', sortTab(args && args.sort || 'relevance')],
      ['page', args && args.page]
    ]);
  }

  function tagListPath(args) {
    var sort = String(args && args.sort || 'popular').toLowerCase();
    var tab = sort === 'name' ? 'name' : (sort === 'activity' ? 'new' : 'popular');
    return '/tags' + buildQuery([
      ['tab', tab],
      ['filter', args && args.inname],
      ['page', args && args.page]
    ]);
  }

  function guardHtml(result, slug) {
    if (!result || result.success !== true) { return result; }
    if (typeof result.status === 'number' && result.status >= 400) {
      return fallback(slug, 'stackoverflow-http-error');
    }
    if (result.redirected && result.finalUrl) {
      try {
        if (new URL(result.finalUrl, STACKOVERFLOW_ORIGIN).origin !== STACKOVERFLOW_ORIGIN) {
          return fallback(slug, 'stackoverflow-cross-origin-redirect');
        }
      } catch (e) {
        return fallback(slug, 'stackoverflow-cross-origin-redirect');
      }
    }
    if (typeof result.text !== 'string' || result.text.indexOf('<') === -1) {
      return fallback(slug, 'stackoverflow-public-html-shape-mismatch');
    }
    if (/Human verification/i.test(result.text) || /\/nocaptcha\b/i.test(result.finalUrl || '')) {
      return fallback(slug, 'stackoverflow-human-verification');
    }
    return { success: true, text: result.text, status: result.status, finalUrl: result.finalUrl, redirected: result.redirected };
  }

  function htmlHandler(slug, params, pathForArgs, parseResult) {
    return {
      tier: 'T1a',
      origin: STACKOVERFLOW_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'stackoverflow-execute-bound-spec-unavailable');
        }
        var path = pathForArgs(args || {});
        if (!path) { return fallback(slug, 'stackoverflow-invalid-args'); }
        var res = await ctx.executeBoundSpec(buildGetSpec(path), ctx.tabId);
        var html = guardHtml(res, slug);
        if (!html || html.success !== true) { return html; }
        var data = parseResult(html.text, args || {});
        if (!data) { return fallback(slug, 'stackoverflow-public-html-shape-mismatch'); }
        return {
          success: true,
          status: html.status,
          finalUrl: html.finalUrl,
          redirected: html.redirected,
          data: data
        };
      }
    };
  }

  var handlers = {
    'stackoverflow.get_question': htmlHandler('stackoverflow.get_question', QUESTION_ID_PARAMS, function(args) {
      return '/questions/' + pathSegment(args.question_id);
    }, parseQuestion),
    'stackoverflow.get_answer': htmlHandler('stackoverflow.get_answer', ANSWER_ID_PARAMS, function(args) {
      return '/a/' + pathSegment(args.answer_id);
    }, parseGetAnswer),
    'stackoverflow.get_question_answers': htmlHandler('stackoverflow.get_question_answers', QUESTION_ANSWERS_PARAMS, function(args) {
      return '/questions/' + pathSegment(args.question_id) + buildQuery([
        ['answertab', sortTab(args.sort || 'votes').toLowerCase()],
        ['page', args.page]
      ]);
    }, parseQuestionAnswers),
    'stackoverflow.list_questions': htmlHandler('stackoverflow.list_questions', LIST_QUESTIONS_PARAMS, function(args) {
      return questionListPath(args, false);
    }, parseQuestionList),
    'stackoverflow.list_unanswered_questions': htmlHandler('stackoverflow.list_unanswered_questions', LIST_QUESTIONS_PARAMS, function(args) {
      return questionListPath(args, true);
    }, parseQuestionList),
    'stackoverflow.search_questions': htmlHandler('stackoverflow.search_questions', SEARCH_QUESTIONS_PARAMS, function(args) {
      return searchPath(args, '');
    }, parseSearchExcerptsAsQuestions),
    'stackoverflow.get_similar_questions': htmlHandler('stackoverflow.get_similar_questions', SIMILAR_PARAMS, function(args) {
      return searchPath(args, args.title);
    }, parseQuestionList),
    'stackoverflow.list_tags': htmlHandler('stackoverflow.list_tags', LIST_TAGS_PARAMS, tagListPath, parseTags),
    'stackoverflow.get_tag_info': htmlHandler('stackoverflow.get_tag_info', TAG_PARAMS, function(args) {
      return '/questions/tagged/' + pathSegment(args.tag);
    }, parseTagInfo)
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
          descriptor: { slug: slug, service: STACKOVERFLOW_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerStackoverflow = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
