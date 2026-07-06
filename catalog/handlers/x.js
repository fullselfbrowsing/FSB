(function (global) {
  'use strict';

  /**
   * X public same-origin READ head.
   *
   * Ports only public tweet/profile reads that can be fetched from first-party
   * x.com HTML pages through executeBoundSpec. Authenticated timelines, search,
   * bookmarks, engagement lists, and mutation-like rows stay in the tail until the
   * dynamic GraphQL operation-hash and write-UAT evidence is available.
   */

  var X_ORIGIN = 'https://x.com';
  var X_SERVICE = 'x.com';

  var TWEET_PARAMS = withProps({
    tweet_id: { type: 'string', minLength: 1, description: 'Tweet ID' }
  }, ['tweet_id']);

  var USER_PROFILE_PARAMS = withProps({
    screen_name: { type: 'string', minLength: 1, description: 'Username without @' }
  }, ['screen_name']);

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
      reason: reason || 'x-public-html-shape-mismatch',
      fellBackToDom: true
    });
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

  function buildGetSpec(path) {
    return {
      url: X_ORIGIN + path,
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: X_ORIGIN,
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

  function parseLdJsonObjects(html) {
    var out = [];
    var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    var m;
    while ((m = re.exec(String(html || ''))) !== null) {
      var attrs = m[1] || '';
      if (attrValue(attrs, 'type').toLowerCase() !== 'application/ld+json') { continue; }
      try {
        var parsed = JSON.parse(htmlDecode(m[2] || '').trim());
        if (Array.isArray(parsed)) {
          for (var i = 0; i < parsed.length; i++) { out.push(parsed[i]); }
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed['@graph'])) {
            for (var j = 0; j < parsed['@graph'].length; j++) { out.push(parsed['@graph'][j]); }
          } else {
            out.push(parsed);
          }
        }
      } catch (e) {
        // Ignore malformed structured data and fall back to meta tags.
      }
    }
    return out;
  }

  function firstLdObject(html, types) {
    var wanted = {};
    for (var i = 0; i < types.length; i++) { wanted[String(types[i]).toLowerCase()] = true; }
    var objects = parseLdJsonObjects(html);
    for (var j = 0; j < objects.length; j++) {
      var item = objects[j] || {};
      var type = item['@type'];
      if (Array.isArray(type)) {
        for (var k = 0; k < type.length; k++) {
          if (wanted[String(type[k]).toLowerCase()]) { return item; }
        }
      } else if (wanted[String(type || '').toLowerCase()]) {
        return item;
      }
    }
    return null;
  }

  function cleanTitle(value) {
    return String(value || '')
      .replace(/\s*\/\s*X\s*$/i, '')
      .replace(/\s+on\s+X\s*$/i, '')
      .trim();
  }

  function parseAuthorFromTitle(title) {
    var text = cleanTitle(title);
    var m = /^(.*?)\s*\(@([A-Za-z0-9_]{1,20})\)/.exec(text);
    if (m) {
      return { name: m[1].trim(), screen_name: m[2] };
    }
    var onX = /^(.*?)\s+on\s+X\s*:/i.exec(String(title || ''));
    return onX ? { name: onX[1].trim(), screen_name: '' } : { name: text, screen_name: '' };
  }

  function tweetTextFromTitle(title) {
    var m = /on\s+X\s*:\s*["“]([\s\S]*?)["”]\s*$/i.exec(String(title || ''));
    return m ? htmlDecode(m[1]).trim() : '';
  }

  function urlPathParts(url) {
    try {
      var u = new URL(url, X_ORIGIN);
      return u.pathname.split('/').filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function parseTweet(html, args) {
    var ld = firstLdObject(html, ['SocialMediaPosting', 'Article']);
    var ogUrl = metaContent(html, 'property', 'og:url') || linkHref(html, 'canonical');
    var title = metaContent(html, 'property', 'og:title') || metaContent(html, 'name', 'twitter:title');
    var description = metaContent(html, 'property', 'og:description') || metaContent(html, 'name', 'twitter:description');
    var image = metaContent(html, 'property', 'og:image') || metaContent(html, 'name', 'twitter:image');
    var parts = urlPathParts(ogUrl);
    var statusIndex = parts.indexOf('status');
    var screenName = statusIndex > 0 ? parts[statusIndex - 1] : '';
    var tweetId = statusIndex !== -1 && parts[statusIndex + 1] ? parts[statusIndex + 1] : String(args && args.tweet_id || '');
    var ldAuthor = ld && ld.author && typeof ld.author === 'object' ? ld.author : null;
    var titleAuthor = parseAuthorFromTitle(title);
    var author = {
      name: String((ldAuthor && ldAuthor.name) || titleAuthor.name || ''),
      screen_name: String((ldAuthor && ldAuthor.alternateName ? String(ldAuthor.alternateName).replace(/^@+/, '') : '') || titleAuthor.screen_name || screenName || '')
    };
    var text = String((ld && (ld.articleBody || ld.text || ld.description)) || tweetTextFromTitle(title) || description || '').trim();

    if (!tweetId || (!text && !author.screen_name && !author.name)) { return null; }
    return {
      tweet: {
        id: tweetId,
        text: stripTags(text),
        url: ogUrl || (X_ORIGIN + '/i/status/' + pathSegment(tweetId)),
        created_at: String((ld && ld.datePublished) || ''),
        author: author,
        image_url: image || ''
      }
    };
  }

  function parseUserProfile(html, args) {
    var ld = firstLdObject(html, ['Person', 'ProfilePage']);
    var title = metaContent(html, 'property', 'og:title') || metaContent(html, 'name', 'twitter:title');
    var description = metaContent(html, 'property', 'og:description') || metaContent(html, 'name', 'twitter:description');
    var image = metaContent(html, 'property', 'og:image') || metaContent(html, 'name', 'twitter:image');
    var url = metaContent(html, 'property', 'og:url') || linkHref(html, 'canonical') || (X_ORIGIN + '/' + pathSegment(args && args.screen_name));
    var parts = urlPathParts(url);
    var titleAuthor = parseAuthorFromTitle(title);
    var screenName = String((ld && ld.alternateName ? String(ld.alternateName).replace(/^@+/, '') : '') || titleAuthor.screen_name || parts[0] || (args && args.screen_name) || '').replace(/^@+/, '');
    var name = String((ld && ld.name) || titleAuthor.name || screenName || '');
    var bio = String((ld && (ld.description || ld.disambiguatingDescription)) || description || '').trim();

    if (!screenName || (!name && !bio)) { return null; }
    return {
      user: {
        screen_name: screenName,
        name: cleanTitle(name),
        description: stripTags(bio),
        url: url,
        avatar_url: image || '',
        verified: /\bverified\b/i.test(String(title || '') + ' ' + String(description || ''))
      }
    };
  }

  function guardHtml(result, slug) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'x-redirect-or-http-error');
    }
    if (typeof result.text !== 'string' || result.text.indexOf('<') === -1) {
      return fallback(slug, 'x-public-html-shape-mismatch');
    }
    return { success: true, text: result.text, status: result.status, finalUrl: result.finalUrl, redirected: result.redirected };
  }

  function htmlHandler(slug, params, pathForArgs, parseResult) {
    return {
      tier: 'T1a',
      origin: X_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'x-execute-bound-spec-unavailable');
        }
        var path = pathForArgs(args || {});
        if (!path) { return fallback(slug, 'x-invalid-args'); }
        var res = await ctx.executeBoundSpec(buildGetSpec(path), ctx.tabId);
        var html = guardHtml(res, slug);
        if (!html || html.success !== true) { return html; }
        var data = parseResult(html.text, args || {});
        if (!data) { return fallback(slug, 'x-public-html-shape-mismatch'); }
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
    'x.get_tweet': htmlHandler('x.get_tweet', TWEET_PARAMS, function(args) {
      return '/i/status/' + pathSegment(args.tweet_id);
    }, parseTweet),
    'x.get_user_profile': htmlHandler('x.get_user_profile', USER_PROFILE_PARAMS, function(args) {
      return '/' + pathSegment(args.screen_name);
    }, parseUserProfile)
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
          descriptor: { slug: slug, service: X_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerX = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
