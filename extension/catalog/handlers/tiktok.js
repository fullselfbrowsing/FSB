(function (global) {
  'use strict';

  /**
   * TikTok public same-origin READ head.
   *
   * Activates only public profile/video SSR page reads. Authenticated account,
   * relationship, personalized feed, notification, and signed search API rows stay
   * guarded fail-closed until live request-shape evidence exists.
   */

  var ORIGIN = 'https://www.tiktok.com';
  var SERVICE = 'tiktok.com';

  function schema(properties, required) {
    return {
      type: 'object',
      properties: properties || {},
      required: required || [],
      additionalProperties: false
    };
  }

  var EMPTY_PARAMS = schema({}, []);
  var USERNAME_PARAMS = schema({
    username: { type: 'string', minLength: 1, description: 'TikTok username without @' }
  }, ['username']);
  var VIDEO_PARAMS = schema({
    username: { type: 'string', minLength: 1, description: 'Author username without @' },
    video_id: { type: 'string', minLength: 1, description: 'TikTok video ID' }
  }, ['username', 'video_id']);
  var USER_LIST_PARAMS = schema({
    username: { type: 'string', description: 'Username to look up secUid' },
    sec_uid: { type: 'string', description: 'Secure user ID' },
    count: { type: 'integer', minimum: 1, maximum: 30, description: 'Number of results' },
    cursor: { type: 'integer', minimum: 0, description: 'Pagination cursor' }
  }, []);
  var COUNT_PARAMS = schema({
    count: { type: 'integer', minimum: 1, maximum: 50, description: 'Number of results' }
  }, []);
  var SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search query text' },
    count: { type: 'integer', minimum: 1, maximum: 20, description: 'Number of results' },
    offset: { type: 'integer', minimum: 0, description: 'Pagination offset' }
  }, ['query']);

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
      reason: reason || 'tiktok-public-ssr-shape-mismatch',
      fellBackToDom: true
    });
  }

  function getSpec(path) {
    return {
      url: ORIGIN + path,
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function htmlDecode(value) {
    return String(value || '')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function toNum(value) {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    var parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function usernameSegment(value) {
    return encodeURIComponent(String(value || '').replace(/^@+/, '').replace(/^\/+|\/+$/g, '').trim());
  }

  function videoIdSegment(value) {
    var raw = String(value || '').trim();
    return /^[0-9]+$/.test(raw) ? encodeURIComponent(raw) : '';
  }

  function parseUniversalScope(html) {
    var match = /<script\b[^>]*\bid\s*=\s*["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i.exec(String(html || ''));
    if (!match || !match[1]) return null;
    var text = match[1].trim();
    var data = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      try { data = JSON.parse(htmlDecode(text)); } catch (_e) { data = null; }
    }
    return data && data.__DEFAULT_SCOPE__ && typeof data.__DEFAULT_SCOPE__ === 'object'
      ? data.__DEFAULT_SCOPE__
      : null;
  }

  function mapUser(user) {
    user = user || {};
    return {
      id: str(user.id),
      unique_id: str(user.uniqueId),
      nickname: str(user.nickname),
      signature: str(user.signature),
      verified: user.verified === true,
      avatar_url: str(user.avatarLarger || user.avatarMedium),
      private_account: user.privateAccount === true,
      is_organization: user.isOrganization === 1 || user.isOrganization === true,
      sec_uid: str(user.secUid),
      bio_link: str(user.bioLink && user.bioLink.link),
      create_time: toNum(user.createTime)
    };
  }

  function mapStats(stats) {
    stats = stats || {};
    return {
      follower_count: toNum(stats.followerCount),
      following_count: toNum(stats.followingCount),
      heart_count: toNum(stats.heart !== undefined ? stats.heart : stats.heartCount),
      video_count: toNum(stats.videoCount),
      digg_count: toNum(stats.diggCount),
      friend_count: toNum(stats.friendCount)
    };
  }

  function mapVideo(item) {
    item = item || {};
    var author = item.author || {};
    var video = item.video || {};
    var stats = item.stats || {};
    var music = item.music || {};
    var uniqueId = str(author.uniqueId);
    var id = str(item.id);
    return {
      id: id,
      description: str(item.desc),
      create_time: toNum(item.createTime),
      author_unique_id: uniqueId,
      author_nickname: str(author.nickname),
      author_verified: author.verified === true,
      duration: toNum(video.duration),
      play_count: toNum(stats.playCount),
      digg_count: toNum(stats.diggCount),
      comment_count: toNum(stats.commentCount),
      share_count: toNum(stats.shareCount),
      collect_count: toNum(stats.collectCount),
      music_title: str(music.title),
      music_author: str(music.authorName),
      cover_url: str(video.originCover || video.cover),
      web_url: uniqueId && id ? ORIGIN + '/@' + encodeURIComponent(uniqueId) + '/video/' + encodeURIComponent(id) : ''
    };
  }

  function parseProfile(scope) {
    var detail = scope && scope['webapp.user-detail'];
    var info = detail && detail.userInfo;
    if (!info || !info.user || !info.user.id) return null;
    return {
      user: mapUser(info.user),
      stats: mapStats(info.stats)
    };
  }

  function parseVideo(scope) {
    var detail = scope && scope['webapp.video-detail'];
    var item = detail && detail.itemInfo && detail.itemInfo.itemStruct;
    if (!item || !item.id) return null;
    return { video: mapVideo(item) };
  }

  function guardHtml(result, slug) {
    if (!result || result.success !== true) return result || fallback(slug, 'tiktok-public-html-unavailable');
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'tiktok-public-html-http-or-redirect');
    }
    if (typeof result.text !== 'string' ||
        result.text.indexOf('__UNIVERSAL_DATA_FOR_REHYDRATION__') === -1) {
      return fallback(slug, 'tiktok-public-ssr-shape-mismatch');
    }
    return { success: true, text: result.text, status: result.status, finalUrl: result.finalUrl, redirected: result.redirected };
  }

  function htmlHandler(slug, params, pathForArgs, parser) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') return fallback(slug, 'tiktok-execute-bound-spec-unavailable');
        var path = pathForArgs(args || {});
        if (!path) return fallback(slug, 'tiktok-invalid-args');
        var checked = guardHtml(await ctx.executeBoundSpec(getSpec(path), ctx.tabId), slug);
        if (!checked || checked.success !== true) return checked;
        var scope = parseUniversalScope(checked.text);
        var data = parser(scope);
        if (!data) return fallback(slug, 'tiktok-public-ssr-shape-mismatch');
        return { success: true, status: checked.status, finalUrl: checked.finalUrl, redirected: checked.redirected, data: data };
      }
    };
  }

  function guarded(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'tiktok.get_user_profile': htmlHandler('tiktok.get_user_profile', USERNAME_PARAMS, function (args) {
      var username = usernameSegment(args && args.username);
      return username ? '/@' + username : '';
    }, parseProfile),
    'tiktok.get_video': htmlHandler('tiktok.get_video', VIDEO_PARAMS, function (args) {
      var username = usernameSegment(args && args.username);
      var videoId = videoIdSegment(args && args.video_id);
      return username && videoId ? '/@' + username + '/video/' + videoId : '';
    }, parseVideo),
    'tiktok.get_current_user': guarded('tiktok.get_current_user', EMPTY_PARAMS, 'unverified-tiktok-current-user-session-shape'),
    'tiktok.get_followers': guarded('tiktok.get_followers', USER_LIST_PARAMS, 'unverified-tiktok-followers-signed-api-shape'),
    'tiktok.get_following': guarded('tiktok.get_following', USER_LIST_PARAMS, 'unverified-tiktok-following-signed-api-shape'),
    'tiktok.get_for_you_feed': guarded('tiktok.get_for_you_feed', COUNT_PARAMS, 'unverified-tiktok-for-you-feed-signed-api-shape'),
    'tiktok.get_notifications': guarded('tiktok.get_notifications', COUNT_PARAMS, 'unverified-tiktok-notifications-signed-api-shape'),
    'tiktok.search_users': guarded('tiktok.search_users', SEARCH_PARAMS, 'unverified-tiktok-search-users-signed-api-shape'),
    'tiktok.search_videos': guarded('tiktok.search_videos', SEARCH_PARAMS, 'unverified-tiktok-search-videos-signed-api-shape')
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

  global.FsbHandlerTiktok = handlers;
  if (typeof module !== 'undefined' && module.exports) module.exports = handlers;
})(typeof globalThis !== 'undefined' ? globalThis : this);
