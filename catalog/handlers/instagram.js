(function (global) {
  'use strict';

  /**
   * Instagram public same-origin READ head.
   *
   * Only public profile pages, public post pages, and public topsearch JSON are
   * executable. Social, feed, direct-message, and mutation rows stay guarded
   * fail-closed until live request-shape evidence activates them.
   */

  var ORIGIN = 'https://www.instagram.com';
  var SERVICE = 'instagram.com';
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function schema(properties, required) {
    return {
      type: 'object',
      properties: properties,
      required: required || [],
      additionalProperties: false
    };
  }

  var USERNAME_PARAMS = schema({
    username: { type: 'string', minLength: 1, description: 'Instagram username without @' }
  }, ['username']);
  var POST_PARAMS = schema({
    media_id: { type: 'string', minLength: 1, description: 'Instagram numeric media ID' }
  }, ['media_id']);
  var SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search query text' }
  }, ['query']);
  var HASHTAG_SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Hashtag search query without #' },
    count: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum number of hashtags to return' }
  }, ['query']);
  var EMPTY_PARAMS = schema({}, []);
  var USER_ID_PARAMS = schema({
    user_id: { type: 'string', minLength: 1, description: 'Instagram numeric user ID' }
  }, ['user_id']);
  var MEDIA_ID_PARAMS = schema({
    media_id: { type: 'string', minLength: 1, description: 'Instagram numeric media ID' }
  }, ['media_id']);
  var COMMENT_PARAMS = schema({
    media_id: { type: 'string', minLength: 1, description: 'Instagram numeric media ID' },
    text: { type: 'string', minLength: 1, description: 'Comment text' }
  }, ['media_id', 'text']);
  var FEED_PARAMS = schema({
    max_id: { type: 'string', description: 'Pagination cursor from a previous response' }
  }, []);
  var MESSAGE_PARAMS = schema({
    thread_id: { type: 'string', minLength: 1, description: 'Conversation thread ID' },
    text: { type: 'string', minLength: 1, description: 'Message text to send' }
  }, ['thread_id', 'text']);

  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      Object.keys(extra).forEach(function (key) { out[key] = extra[key]; });
    }
    return out;
  }

  function fallback(slug, reason) {
    return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
      slug: slug,
      reason: reason || 'instagram-public-shape-mismatch',
      fellBackToDom: true
    });
  }

  function spec(path, accept) {
    return {
      url: ORIGIN + path,
      method: 'GET',
      headers: { 'Accept': accept },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function appendQuery(parts, key, value) {
    if (value === undefined || value === null || value === '') return;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) appendQuery(parts, pairs[i][0], pairs[i][1]);
    return parts.length ? '?' + parts.join('&') : '';
  }

  function htmlDecode(value) {
    return String(value || '')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
  }

  function stripTags(value) {
    return htmlDecode(String(value || '').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }

  function attrValue(attrs, name) {
    var quoted = new RegExp('\\b' + name + '\\s*=\\s*([\'"])([\\s\\S]*?)\\1', 'i').exec(attrs || '');
    if (quoted) return htmlDecode(quoted[2]);
    var bare = new RegExp('\\b' + name + '\\s*=\\s*([^\\s>]+)', 'i').exec(attrs || '');
    return bare ? htmlDecode(bare[1]) : '';
  }

  function metaContent(html, key, value) {
    var re = /<meta\b([^>]*)>/gi;
    var match;
    while ((match = re.exec(String(html || ''))) !== null) {
      var attrs = match[1] || '';
      if (attrValue(attrs, key).toLowerCase() === String(value || '').toLowerCase()) {
        return attrValue(attrs, 'content');
      }
    }
    return '';
  }

  function parseJsonLd(html, types) {
    var wanted = {};
    (types || []).forEach(function (type) { wanted[String(type).toLowerCase()] = true; });
    var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    var match;
    while ((match = re.exec(String(html || ''))) !== null) {
      if (attrValue(match[1] || '', 'type').toLowerCase() !== 'application/ld+json') continue;
      try {
        var parsed = JSON.parse(htmlDecode(match[2] || '').trim());
        var list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]);
        for (var i = 0; i < list.length; i++) {
          var type = list[i] && list[i]['@type'];
          if (Array.isArray(type)) {
            for (var j = 0; j < type.length; j++) if (wanted[String(type[j]).toLowerCase()]) return list[i];
          } else if (wanted[String(type || '').toLowerCase()]) {
            return list[i];
          }
        }
      } catch (e) {
        // Public pages can omit or change structured metadata.
      }
    }
    return null;
  }

  function usernameSegment(value) {
    return encodeURIComponent(String(value || '').replace(/^@+/, '').replace(/^\/+|\/+$/g, '').trim());
  }

  function hashtagQuery(value) {
    return String(value || '').replace(/^#+/, '').trim();
  }

  function urlParts(value) {
    try { return new URL(value, ORIGIN).pathname.split('/').filter(Boolean); }
    catch (e) { return []; }
  }

  function cleanTitle(value) {
    return stripTags(value)
      .replace(/\s*[•-]\s*Instagram(?: photos and videos)?\s*$/i, '')
      .replace(/\s*Instagram photos and videos\s*$/i, '')
      .trim();
  }

  function compactNumber(value) {
    var m = /^([0-9]+(?:\.[0-9]+)?)([kmb])?$/i.exec(String(value || '').replace(/,/g, '').trim());
    if (!m) return null;
    var n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    var suffix = String(m[2] || '').toLowerCase();
    if (suffix === 'k') n *= 1000;
    else if (suffix === 'm') n *= 1000000;
    else if (suffix === 'b') n *= 1000000000;
    return Math.round(n);
  }

  function profileStats(description) {
    var m = /([0-9][0-9,\.]*\s*[kmb]?)\s+Followers,\s+([0-9][0-9,\.]*\s*[kmb]?)\s+Following,\s+([0-9][0-9,\.]*\s*[kmb]?)\s+Posts/i.exec(String(description || ''));
    return {
      follower_count: m ? compactNumber(m[1]) : null,
      following_count: m ? compactNumber(m[2]) : null,
      post_count: m ? compactNumber(m[3]) : null
    };
  }

  function titleUsername(title) {
    var m = /\(@([A-Za-z0-9._]{1,30})\)/.exec(String(title || ''));
    return m ? m[1] : '';
  }

  function captionUsername(value) {
    var m = /-\s*([A-Za-z0-9._]{1,30})\s+on\s+[A-Z][a-z]+/i.exec(String(value || ''));
    return m ? m[1] : '';
  }

  function captionText(value) {
    var text = stripTags(value);
    var quoted = /["“]([\s\S]*?)["”]\s*$/.exec(text);
    if (quoted) return quoted[1].trim();
    var colon = /:\s*["“]?([\s\S]*?)["”]?\s*$/.exec(text);
    return colon ? colon[1].trim() : text;
  }

  function mediaIdToShortcode(mediaId) {
    var raw = String(mediaId || '').split('_')[0].trim();
    if (!/^[0-9]+$/.test(raw)) return '';
    try {
      var value = BigInt(raw);
      if (value < 0n) return '';
      if (value === 0n) return ALPHABET.charAt(0);
      var out = '';
      while (value > 0n) {
        out = ALPHABET.charAt(Number(value % 64n)) + out;
        value = value / 64n;
      }
      return out;
    } catch (e) {
      return '';
    }
  }

  function parseProfile(html, args) {
    var ld = parseJsonLd(html, ['Person', 'ProfilePage']);
    var title = metaContent(html, 'property', 'og:title') || metaContent(html, 'name', 'twitter:title');
    var description = metaContent(html, 'property', 'og:description') || metaContent(html, 'name', 'description');
    var image = metaContent(html, 'property', 'og:image') || metaContent(html, 'name', 'twitter:image');
    var url = metaContent(html, 'property', 'og:url') || (ORIGIN + '/' + usernameSegment(args && args.username) + '/');
    var parts = urlParts(url);
    var username = String((ld && ld.alternateName ? String(ld.alternateName).replace(/^@+/, '') : '') || titleUsername(title) || parts[0] || (args && args.username) || '').replace(/^@+/, '');
    var name = String((ld && ld.name) || cleanTitle(title) || username || '');
    var bio = String((ld && (ld.description || ld.disambiguatingDescription)) || description || '').trim();
    var stats = profileStats(description);
    if (!username || (!name && !bio && !image)) return null;
    return {
      user: {
        username: username,
        full_name: cleanTitle(name),
        biography: stripTags(bio),
        url: url,
        profile_pic_url: image || '',
        follower_count: stats.follower_count,
        following_count: stats.following_count,
        post_count: stats.post_count,
        verified: /\bverified\b/i.test(String(title || '') + ' ' + String(description || ''))
      }
    };
  }

  function parsePost(html, args) {
    var ld = parseJsonLd(html, ['SocialMediaPosting', 'ImageObject', 'VideoObject', 'Article']);
    var title = metaContent(html, 'property', 'og:title') || metaContent(html, 'name', 'twitter:title');
    var description = metaContent(html, 'property', 'og:description') || metaContent(html, 'name', 'description');
    var image = metaContent(html, 'property', 'og:image') || metaContent(html, 'name', 'twitter:image');
    var url = metaContent(html, 'property', 'og:url');
    var parts = urlParts(url);
    var shortcode = '';
    for (var i = 0; i < parts.length; i++) {
      if ((parts[i] === 'p' || parts[i] === 'reel' || parts[i] === 'tv') && parts[i + 1]) shortcode = parts[i + 1];
    }
    if (!shortcode) shortcode = mediaIdToShortcode(args && args.media_id);
    var author = ld && ld.author && typeof ld.author === 'object' ? ld.author : null;
    var authorName = String((author && author.name) || '').trim();
    var authorUsername = String((author && author.alternateName ? String(author.alternateName).replace(/^@+/, '') : '') || titleUsername(title) || captionUsername(description) || '').trim();
    var caption = String((ld && (ld.articleBody || ld.caption || ld.description)) || captionText(description || title) || '').trim();
    if (!shortcode || (!caption && !image && !authorUsername && !authorName)) return null;
    return {
      post: {
        media_id: String(args && args.media_id || ''),
        shortcode: shortcode,
        caption: stripTags(caption),
        url: url || (ORIGIN + '/p/' + encodeURIComponent(shortcode) + '/'),
        image_url: image || '',
        author: { username: authorUsername, full_name: authorName }
      }
    };
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function normalizeUser(item) {
    var user = item && item.user ? item.user : item;
    if (!user || typeof user !== 'object' || !user.username) return null;
    return {
      id: str(user.pk !== undefined ? user.pk : user.id),
      username: str(user.username),
      full_name: str(user.full_name || user.name),
      profile_pic_url: str(user.profile_pic_url || user.profile_pic_url_hd),
      verified: user.is_verified === true || user.verified === true
    };
  }

  function normalizeHashtag(item) {
    var hashtag = item && item.hashtag ? item.hashtag : item;
    if (!hashtag || typeof hashtag !== 'object') return null;
    var name = str(hashtag.name || hashtag.hashtag).replace(/^#+/, '').trim();
    return name ? { name: name, media_count: typeof hashtag.media_count === 'number' ? hashtag.media_count : null } : null;
  }

  function normalizePlace(item) {
    var place = item && item.place ? item.place : item;
    if (!place || typeof place !== 'object' || !(place.title || place.name)) return null;
    return {
      id: str(place.location && place.location.pk || place.pk || place.id),
      title: str(place.title || place.name),
      subtitle: str(place.subtitle),
      slug: str(place.slug)
    };
  }

  function mapList(list, normalizer, limit) {
    var out = [];
    var max = Number.isFinite(limit) && limit > 0 ? limit : 50;
    for (var i = 0; i < (Array.isArray(list) ? list.length : 0) && out.length < max; i++) {
      var item = normalizer(list[i]);
      if (item) out.push(item);
    }
    return out;
  }

  function parseSearch(data, args, mode) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    var limit = mode === 'hashtags' ? Number(args && args.count || 20) : 50;
    var users = mapList(data.users, normalizeUser, limit);
    var hashtags = mapList(data.hashtags, normalizeHashtag, limit);
    var places = mapList(data.places, normalizePlace, 50);
    if (mode === 'users') return users.length ? { query: str(args && args.query), users: users } : null;
    if (mode === 'hashtags') return hashtags.length ? { query: hashtagQuery(args && args.query), hashtags: hashtags } : null;
    if (!users.length && !hashtags.length && !places.length) return null;
    return { query: str(args && args.query), users: users, hashtags: hashtags, places: places };
  }

  function guardHtml(result, slug) {
    if (!result || result.success !== true) return result;
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'instagram-redirect-or-http-error');
    }
    if (typeof result.text !== 'string' || result.text.indexOf('<') === -1) {
      return fallback(slug, 'instagram-public-html-shape-mismatch');
    }
    return { success: true, text: result.text, status: result.status, finalUrl: result.finalUrl, redirected: result.redirected };
  }

  function guardJson(result, slug) {
    if (!result || result.success !== true) return result;
    if (typeof result.status === 'number' && result.status >= 400) {
      return fallback(slug, 'instagram-public-json-status-error');
    }
    if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data) ||
        typeof result.data.error === 'string' || typeof result.data.message === 'string') {
      return fallback(slug, 'instagram-public-json-shape-mismatch');
    }
    return { success: true, data: result.data, status: result.status, finalUrl: result.finalUrl, redirected: result.redirected };
  }

  function htmlHandler(slug, params, pathForArgs, parser) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') return fallback(slug, 'instagram-execute-bound-spec-unavailable');
        var path = pathForArgs(args || {});
        if (!path) return fallback(slug, 'instagram-invalid-args');
        var checked = guardHtml(await ctx.executeBoundSpec(spec(path, 'text/html'), ctx.tabId), slug);
        if (!checked || checked.success !== true) return checked;
        var data = parser(checked.text, args || {});
        if (!data) return fallback(slug, 'instagram-public-html-shape-mismatch');
        return { success: true, status: checked.status, finalUrl: checked.finalUrl, redirected: checked.redirected, data: data };
      }
    };
  }

  function searchHandler(slug, params, mode) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') return fallback(slug, 'instagram-execute-bound-spec-unavailable');
        var query = mode === 'hashtags' ? hashtagQuery(args && args.query) : str(args && args.query).trim();
        if (!query) return fallback(slug, 'instagram-invalid-args');
        var checked = guardJson(await ctx.executeBoundSpec(spec('/web/search/topsearch/' + buildQuery([['query', query]]), 'application/json'), ctx.tabId), slug);
        if (!checked || checked.success !== true) return checked;
        var data = parseSearch(checked.data, args || {}, mode);
        if (!data) return fallback(slug, 'instagram-public-json-shape-mismatch');
        return { success: true, status: checked.status, finalUrl: checked.finalUrl, redirected: checked.redirected, data: data };
      }
    };
  }

  function guarded(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'write',
      params: params,
      async handle(args, ctx) {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'instagram.get_post': htmlHandler('instagram.get_post', POST_PARAMS, function (args) {
      var shortcode = mediaIdToShortcode(args && args.media_id);
      return shortcode ? '/p/' + encodeURIComponent(shortcode) + '/' : '';
    }, parsePost),
    'instagram.get_user_profile': htmlHandler('instagram.get_user_profile', USERNAME_PARAMS, function (args) {
      var username = usernameSegment(args && args.username);
      return username ? '/' + username + '/' : '';
    }, parseProfile),
    'instagram.search': searchHandler('instagram.search', SEARCH_PARAMS, 'all'),
    'instagram.search_hashtags': searchHandler('instagram.search_hashtags', HASHTAG_SEARCH_PARAMS, 'hashtags'),
    'instagram.search_users': searchHandler('instagram.search_users', SEARCH_PARAMS, 'users'),
    'instagram.create_comment': guarded('instagram.create_comment', COMMENT_PARAMS, 'unverified-instagram-create-comment-mutation'),
    'instagram.follow_user': guarded('instagram.follow_user', USER_ID_PARAMS, 'unverified-instagram-follow-user-mutation'),
    'instagram.get_home_feed': guarded('instagram.get_home_feed', FEED_PARAMS, 'unverified-instagram-home-feed-request-shape'),
    'instagram.get_suggested_users': guarded('instagram.get_suggested_users', EMPTY_PARAMS, 'unverified-instagram-suggested-users-request-shape'),
    'instagram.like_post': guarded('instagram.like_post', MEDIA_ID_PARAMS, 'unverified-instagram-like-post-mutation'),
    'instagram.save_post': guarded('instagram.save_post', MEDIA_ID_PARAMS, 'unverified-instagram-save-post-mutation'),
    'instagram.send_message': guarded('instagram.send_message', MESSAGE_PARAMS, 'unverified-instagram-send-message-mutation'),
    'instagram.unfollow_user': guarded('instagram.unfollow_user', USER_ID_PARAMS, 'unverified-instagram-unfollow-user-mutation'),
    'instagram.unlike_post': guarded('instagram.unlike_post', MEDIA_ID_PARAMS, 'unverified-instagram-unlike-post-mutation'),
    'instagram.unsave_post': guarded('instagram.unsave_post', MEDIA_ID_PARAMS, 'unverified-instagram-unsave-post-mutation')
  };

  if (typeof FsbCapabilityCatalog !== 'undefined' && FsbCapabilityCatalog &&
      typeof FsbCapabilityCatalog.registerHandler === 'function') {
    Object.keys(handlers).forEach(function (slug) {
      FsbCapabilityCatalog.registerHandler(slug, {
        tier: 'T1a',
        handler: handlers[slug],
        origin: handlers[slug].origin,
        params: handlers[slug].params,
        descriptor: { slug: slug, service: SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
      });
    });
  }

  global.FsbHandlerInstagram = handlers;
  if (typeof module !== 'undefined' && module.exports) module.exports = handlers;
})(typeof globalThis !== 'undefined' ? globalThis : this);
