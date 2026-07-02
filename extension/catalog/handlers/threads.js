(function (global) {
  'use strict';

  /**
   * Threads conservative same-origin head.
   *
   * Activates the single-thread read shape that upstream metadata modeled as a
   * same-origin GET. The timeline feed remains unregistered until a live
   * authenticated feed shape is proven. The create-thread write is registered
   * only as guarded fail-closed.
   */

  var ORIGIN = 'https://www.threads.net';
  var SERVICE = 'www.threads.net';

  var THREAD_PARAMS = schema({
    thread_id: { type: 'string', minLength: 1, description: 'Thread ID to retrieve' }
  }, ['thread_id']);
  var CREATE_PARAMS = schema({
    text: { type: 'string', minLength: 1, description: 'The text content of the thread to post' },
    reply_to_id: { type: 'string', description: 'Thread ID to reply to (omit to start a new thread)' }
  }, ['text']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) out.required = required;
    return out;
  }

  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
      }
    }
    return out;
  }

  function fallback(slug, reason) {
    return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
      slug: slug,
      reason: reason || 'threads-shape-mismatch',
      fellBackToDom: true
    });
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function pathSegment(value) {
    return encodeURIComponent(str(value).replace(/^\/+|\/+$/g, '').trim());
  }

  function getSpec(path) {
    return {
      url: ORIGIN + path,
      method: 'GET',
      headers: { 'Accept': 'application/json,text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function htmlDecode(value) {
    return str(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (match, entity) {
      var lower = str(entity).toLowerCase();
      if (lower === 'amp') return '&';
      if (lower === 'lt') return '<';
      if (lower === 'gt') return '>';
      if (lower === 'quot') return '"';
      if (lower === 'apos' || lower === '#39' || lower === '#x27') return '\'';
      if (lower === 'nbsp') return ' ';
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
    return htmlDecode(str(value).replace(/<[^>]+>/g, ' '))
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
    while ((match = re.exec(str(html))) !== null) {
      var attrs = match[1] || '';
      if (attrValue(attrs, key).toLowerCase() === str(value).toLowerCase()) {
        return attrValue(attrs, 'content');
      }
    }
    return '';
  }

  function linkHref(html, relValue) {
    var re = /<link\b([^>]*)>/gi;
    var match;
    while ((match = re.exec(str(html))) !== null) {
      var attrs = match[1] || '';
      if (attrValue(attrs, 'rel').toLowerCase() === str(relValue).toLowerCase()) {
        return attrValue(attrs, 'href');
      }
    }
    return '';
  }

  function parseJsonLdObjects(html) {
    var out = [];
    var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    var match;
    while ((match = re.exec(str(html))) !== null) {
      if (attrValue(match[1] || '', 'type').toLowerCase() !== 'application/ld+json') continue;
      try {
        var parsed = JSON.parse(htmlDecode(match[2] || '').trim());
        if (Array.isArray(parsed)) out = out.concat(parsed);
        else if (parsed && Array.isArray(parsed['@graph'])) out = out.concat(parsed['@graph']);
        else if (parsed && typeof parsed === 'object') out.push(parsed);
      } catch (e) {
        // Public pages can omit or reshape structured metadata.
      }
    }
    return out;
  }

  function firstJsonLd(html) {
    var list = parseJsonLdObjects(html);
    for (var i = 0; i < list.length; i++) {
      var type = list[i] && list[i]['@type'];
      var joined = Array.isArray(type) ? type.join(' ') : str(type);
      if (/SocialMediaPosting|Article|DiscussionForumPosting/i.test(joined)) return list[i];
    }
    return list[0] || null;
  }

  function authorFrom(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.replace(/^@+/, '');
    if (typeof value === 'object') {
      return str(value.username || value.handle || value.alternateName || value.name || '').replace(/^@+/, '');
    }
    return '';
  }

  function titleAuthor(title) {
    var m = /\(@([A-Za-z0-9._]{1,30})\)/.exec(str(title));
    if (m) return m[1];
    var by = /\bby\s+@?([A-Za-z0-9._]{1,30})\b/i.exec(str(title));
    return by ? by[1] : '';
  }

  function normalizeReply(reply) {
    if (!reply || typeof reply !== 'object') return null;
    var id = str(reply.id || reply.pk || reply.thread_id || reply.post_id);
    var text = str(reply.text || reply.caption || reply.body || reply.content);
    var author = authorFrom(reply.author || reply.user);
    if (!id && !text) return null;
    return { id: id, text: stripTags(text), author: author };
  }

  function normalizeThreadEnvelope(data, args) {
    var root = data && typeof data === 'object' ? (data.thread || data.post || data.data || data) : null;
    if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
    var id = str(root.id || root.pk || root.thread_id || root.post_id || (args && args.thread_id));
    var text = str(root.text || root.caption || root.body || root.content || root.message);
    var author = authorFrom(root.author || root.user || root.owner);
    var rawReplies = Array.isArray(root.replies) ? root.replies
      : (Array.isArray(root.children) ? root.children : []);
    var replies = [];
    for (var i = 0; i < rawReplies.length; i++) {
      var reply = normalizeReply(rawReplies[i]);
      if (reply) replies.push(reply);
    }
    if (!id || (!text && !author)) return null;
    return { thread: { id: id, text: stripTags(text), author: author, replies: replies } };
  }

  function parseHtmlThread(html, args) {
    var ld = firstJsonLd(html);
    var title = metaContent(html, 'property', 'og:title') || metaContent(html, 'name', 'twitter:title');
    var description = metaContent(html, 'property', 'og:description') || metaContent(html, 'name', 'description');
    var url = metaContent(html, 'property', 'og:url') || linkHref(html, 'canonical');
    var text = str((ld && (ld.articleBody || ld.text || ld.description)) || description || title);
    var author = authorFrom(ld && ld.author) || titleAuthor(title);
    var id = str(args && args.thread_id);
    if (!id) {
      try {
        var parts = new URL(url || '', ORIGIN).pathname.split('/').filter(Boolean);
        id = parts[parts.length - 1] || '';
      } catch (e) {
        id = '';
      }
    }
    if (!id || (!text && !author)) return null;
    return {
      thread: {
        id: id,
        text: stripTags(text),
        author: author,
        replies: []
      }
    };
  }

  function guardResult(result, slug) {
    if (!result || result.success !== true) return result || fallback(slug, 'threads-fetch-unavailable');
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'threads-http-or-redirect');
    }
    if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
      return { success: true, data: result.data, status: result.status, finalUrl: result.finalUrl, redirected: result.redirected };
    }
    if (typeof result.text === 'string' && result.text.indexOf('<') !== -1) {
      return { success: true, text: result.text, status: result.status, finalUrl: result.finalUrl, redirected: result.redirected };
    }
    return fallback(slug, 'threads-shape-mismatch');
  }

  function getThreadHandler() {
    var slug = 'threads.get_thread';
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: THREAD_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'threads-execute-bound-spec-unavailable');
        }
        var segment = pathSegment(args && args.thread_id);
        if (!segment) return fallback(slug, 'threads-invalid-args');
        var checked = guardResult(await ctx.executeBoundSpec(getSpec('/threads/' + segment), ctx.tabId), slug);
        if (!checked || checked.success !== true) return checked;
        var data = checked.data
          ? normalizeThreadEnvelope(checked.data, args || {})
          : parseHtmlThread(checked.text, args || {});
        if (!data) return fallback(slug, 'threads-shape-mismatch');
        return {
          success: true,
          status: checked.status,
          finalUrl: checked.finalUrl,
          redirected: checked.redirected,
          data: data
        };
      }
    };
  }

  function guarded(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'write',
      params: params,
      async handle() {
        return fallback(slug, reason || 'unverified-threads-mutation');
      }
    };
  }

  var handlers = {
    'threads.get_thread': getThreadHandler(),
    'threads.create_thread': guarded('threads.create_thread', CREATE_PARAMS, 'unverified-threads-create-thread-mutation')
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: ORIGIN,
          params: handlers[slug].params,
          descriptor: {
            slug: slug,
            service: SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerThreads = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
