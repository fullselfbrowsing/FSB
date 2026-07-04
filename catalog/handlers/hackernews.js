(function (global) {
  'use strict';

  /**
   * Hacker News same-origin public READ head.
   *
   * Ports the vendored read-only HTML scrapers through executeBoundSpec, pinned to
   * news.ycombinator.com. The comment submission tool is intentionally not
   * registered because its vendored implementation posts an HMAC-backed form.
   */

  var HACKERNEWS_ORIGIN = 'https://news.ycombinator.com';
  var HACKERNEWS_SERVICE = 'news.ycombinator.com';
  var INT_LIMIT = 9007199254740991;

  var PAGE_PARAMS = {
    type: 'object',
    properties: {
      page: integerSchema('Page number (default 1)', 1)
    },
    additionalProperties: false
  };

  var ITEM_PARAMS = {
    type: 'object',
    properties: {
      id: integerSchema('Item ID', 1)
    },
    required: ['id'],
    additionalProperties: false
  };

  var COMMENTS_PARAMS = {
    type: 'object',
    properties: {
      story_id: integerSchema('Story ID to get comments for', 1),
      page: integerSchema('Page number (default 1)', 1)
    },
    required: ['story_id'],
    additionalProperties: false
  };

  var USER_PARAMS = {
    type: 'object',
    properties: {
      username: { type: 'string', minLength: 1, description: 'Username (case-sensitive)' }
    },
    required: ['username'],
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
      reason: reason || 'hackernews-html-shape-mismatch',
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

  function positiveInt(value, fallbackValue) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 1) { return fallbackValue; }
    return Math.floor(n);
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

  function classHas(attrs, className) {
    var classes = attrValue(attrs, 'class');
    return (' ' + classes + ' ').indexOf(' ' + className + ' ') !== -1;
  }

  function regexEscape(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function parseRows(html) {
    var rows = [];
    var re = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
    var m;
    while ((m = re.exec(String(html || ''))) !== null) {
      rows.push({ attrs: m[1] || '', html: m[2] || '' });
    }
    return rows;
  }

  function classInner(html, className) {
    var name = regexEscape(className);
    var re = new RegExp("<([a-z0-9]+)\\b([^>]*\\bclass\\s*=\\s*(['\"])[^'\"]*\\b" + name + "\\b[^'\"]*\\3[^>]*)>([\\s\\S]*?)<\\/\\1>", 'i');
    var m = re.exec(String(html || ''));
    return m ? { tag: m[1], attrs: m[2] || '', html: m[4] || '' } : null;
  }

  function hasClass(html, className) {
    var re = /<([a-z0-9]+)\b([^>]*)>/gi;
    var m;
    while ((m = re.exec(String(html || ''))) !== null) {
      if (classHas(m[2] || '', className)) { return true; }
    }
    return false;
  }

  function extractTitleLink(rowHtml) {
    var m = /<span\b[^>]*class\s*=\s*(['"])[^'"]*\btitleline\b[^'"]*\1[^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(rowHtml || '');
    if (!m) { return { title: '', url: '' }; }
    var rawUrl = attrValue(m[2] || '', 'href');
    return {
      title: stripTags(m[3] || ''),
      url: rawUrl.indexOf('item?id=') === 0 ? '' : rawUrl
    };
  }

  function extractAgeTime(html) {
    var age = classInner(html, 'age');
    if (!age) { return ''; }
    var title = attrValue(age.attrs, 'title');
    if (!title) {
      var link = /<a\b([^>]*)>/i.exec(age.html || '');
      title = link ? attrValue(link[1] || '', 'title') : '';
    }
    return title ? String(title).split(' ')[0] : '';
  }

  function extractCommentCount(html) {
    var re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(String(html || ''))) !== null) {
      var text = stripTags(m[1] || '').toLowerCase();
      if (text.indexOf('comment') !== -1) {
        return parseInt(text, 10) || 0;
      }
    }
    return 0;
  }

  function parseStory(row, subHtml) {
    var id = positiveInt(attrValue(row.attrs, 'id'), 0);
    if (!id) { return null; }
    var titleLink = extractTitleLink(row.html);
    if (!titleLink.title) { return null; }
    var siteNode = classInner(row.html, 'sitestr');
    var scoreNode = classInner(subHtml, 'score');
    var userNode = classInner(subHtml, 'hnuser');
    return {
      id: id,
      title: titleLink.title,
      url: titleLink.url,
      site: siteNode ? stripTags(siteNode.html) : '',
      score: scoreNode ? (parseInt(stripTags(scoreNode.html), 10) || 0) : 0,
      by: userNode ? stripTags(userNode.html) : '',
      time: extractAgeTime(subHtml),
      descendants: extractCommentCount(subHtml)
    };
  }

  function parseStoryList(html) {
    var rows = parseRows(html);
    var stories = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!classHas(row.attrs, 'athing') || classHas(row.attrs, 'comtr')) { continue; }
      var story = parseStory(row, rows[i + 1] ? rows[i + 1].html : '');
      if (story) { stories.push(story); }
    }
    if (!stories.length) { return null; }
    return { stories: stories, has_more: hasClass(html, 'morelink') };
  }

  function parseItem(html, id) {
    if (String(html || '').indexOf('No such item') !== -1) { return null; }
    var rows = parseRows(html);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!classHas(row.attrs, 'athing')) { continue; }
      var itemId = positiveInt(attrValue(row.attrs, 'id'), id || 0);
      if (classHas(row.attrs, 'comtr')) {
        var commentUser = classInner(row.html, 'hnuser');
        var commentText = classInner(row.html, 'commtext');
        return {
          item: {
            id: itemId,
            type: 'comment',
            title: '',
            url: '',
            text: commentText ? commentText.html : '',
            score: 0,
            by: commentUser ? stripTags(commentUser.html) : '',
            time: extractAgeTime(row.html),
            descendants: 0
          }
        };
      }
      var story = parseStory(row, rows[i + 1] ? rows[i + 1].html : '');
      if (!story) { return null; }
      var topText = classInner(html, 'toptext');
      return {
        item: {
          id: story.id,
          type: (!story.by && !story.score) ? 'job' : 'story',
          title: story.title,
          url: story.url,
          text: topText ? topText.html : '',
          score: story.score,
          by: story.by,
          time: story.time,
          descendants: story.descendants
        }
      };
    }
    return null;
  }

  function parseIndent(rowHtml) {
    var m = /class\s*=\s*(['"])[^'"]*\bind\b[^'"]*\1[\s\S]*?<img\b([^>]*)>/i.exec(rowHtml || '');
    var width = m ? positiveInt(attrValue(m[2] || '', 'width'), 0) : 0;
    return Math.floor(width / 40);
  }

  function parseComments(html) {
    var rows = parseRows(html);
    var total = 0;
    var sawStory = false;
    var comments = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!classHas(row.attrs, 'athing')) { continue; }
      if (!classHas(row.attrs, 'comtr')) {
        sawStory = true;
        total = extractCommentCount(rows[i + 1] ? rows[i + 1].html : '');
        continue;
      }
      var id = positiveInt(attrValue(row.attrs, 'id'), 0);
      var byNode = classInner(row.html, 'hnuser');
      var textNode = classInner(row.html, 'commtext');
      if (!id || !textNode) { continue; }
      comments.push({
        id: id,
        by: byNode ? stripTags(byNode.html) : '[deleted]',
        text: textNode.html,
        time: extractAgeTime(row.html),
        indent: parseIndent(row.html)
      });
    }
    if (!sawStory) { return null; }
    return { comments: comments, total: total, has_more: hasClass(html, 'morelink') };
  }

  function cellHtml(rowHtml) {
    var cells = [];
    var re = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    var m;
    while ((m = re.exec(rowHtml || '')) !== null) {
      cells.push(m[1] || '');
    }
    return cells;
  }

  function parseUser(html, username) {
    var rows = parseRows(html);
    var foundUser = false;
    var created = '';
    var karma = 0;
    var about = '';
    for (var i = 0; i < rows.length; i++) {
      var cells = cellHtml(rows[i].html);
      if (cells.length < 2) { continue; }
      var label = stripTags(cells[0]).replace(':', '').trim();
      if (label === 'user') { foundUser = true; }
      if (label === 'created') { created = stripTags(cells[1]); }
      if (label === 'karma') { karma = parseInt(stripTags(cells[1]), 10) || 0; }
      if (label === 'about') { about = String(cells[1] || '').trim(); }
    }
    if (!foundUser) { return null; }
    return { user: { username: String(username || ''), created: created, karma: karma, about: about } };
  }

  function pagePath(base, args) {
    var page = positiveInt(args && args.page, 1);
    return page > 1 ? base + '?p=' + encodeURIComponent(String(page)) : base;
  }

  function itemPath(args) {
    var id = positiveInt(args && args.id, 0);
    return id ? '/item?id=' + encodeURIComponent(String(id)) : '';
  }

  function commentsPath(args) {
    var id = positiveInt(args && args.story_id, 0);
    if (!id) { return ''; }
    var page = positiveInt(args && args.page, 1);
    return '/item?id=' + encodeURIComponent(String(id)) + (page > 1 ? '&p=' + encodeURIComponent(String(page)) : '');
  }

  function userPath(args) {
    var username = args && typeof args.username === 'string' ? args.username.trim() : '';
    return username ? '/user?id=' + encodeURIComponent(username) : '';
  }

  function buildGetSpec(path) {
    return {
      url: HACKERNEWS_ORIGIN + path,
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: HACKERNEWS_ORIGIN,
      extract: null
    };
  }

  function guardHtml(result, slug) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'hackernews-redirect-or-http-error');
    }
    if (typeof result.text !== 'string' || result.text.indexOf('<') === -1) {
      return fallback(slug, 'hackernews-html-shape-mismatch');
    }
    return { success: true, text: result.text, status: result.status, finalUrl: result.finalUrl, redirected: result.redirected };
  }

  function htmlHandler(slug, params, pathForArgs, parseResult) {
    return {
      tier: 'T1a',
      origin: HACKERNEWS_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'hackernews-execute-bound-spec-unavailable');
        }
        var path = pathForArgs(args || {});
        if (!path) { return fallback(slug, 'hackernews-invalid-args'); }
        var res = await ctx.executeBoundSpec(buildGetSpec(path), ctx.tabId);
        var html = guardHtml(res, slug);
        if (!html || html.success !== true) { return html; }
        var data = parseResult(html.text, args || {});
        if (!data) { return fallback(slug, 'hackernews-html-shape-mismatch'); }
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

  function listHandler(slug, basePath) {
    return htmlHandler(slug, PAGE_PARAMS, function(args) {
      return pagePath(basePath, args);
    }, parseStoryList);
  }

  var handlers = {
    'hackernews.get_item': htmlHandler('hackernews.get_item', ITEM_PARAMS, itemPath, function(html, args) {
      return parseItem(html, positiveInt(args && args.id, 0));
    }),
    'hackernews.get_story_comments': htmlHandler('hackernews.get_story_comments', COMMENTS_PARAMS, commentsPath, parseComments),
    'hackernews.get_user': htmlHandler('hackernews.get_user', USER_PARAMS, userPath, function(html, args) {
      return parseUser(html, args && args.username);
    }),
    'hackernews.list_ask_stories': listHandler('hackernews.list_ask_stories', '/ask'),
    'hackernews.list_best_stories': listHandler('hackernews.list_best_stories', '/best'),
    'hackernews.list_job_stories': listHandler('hackernews.list_job_stories', '/jobs'),
    'hackernews.list_new_stories': listHandler('hackernews.list_new_stories', '/newest'),
    'hackernews.list_show_stories': listHandler('hackernews.list_show_stories', '/show'),
    'hackernews.list_top_stories': listHandler('hackernews.list_top_stories', '/news')
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
          descriptor: { slug: slug, service: HACKERNEWS_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerHackernews = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
