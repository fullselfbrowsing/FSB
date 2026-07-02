(function(global) {
  'use strict';

  /**
   * Phase 27 plan 02 (v0.9.99 Native Capability Catalog) -- capability-fetch.js
   *
   * The Wall-2 spine: the fixed, bundled page-MAIN-world authenticated fetch that
   * carries first-party HttpOnly cookies, scrapes CSRF in-page, pins the origin a
   * SECOND time at the active tab, survives service-worker eviction via the
   * resume-sidecar, classifies mid-mutation ambiguity, and runs the read-only
   * extract service-worker-side. It drives a bound request spec produced by the
   * Phase 26 interpreter (FsbCapabilityInterpreter.interpretRecipe); it does NOT
   * itself validate or bind.
   *
   * Three exports (FETCH-01..05):
   *   - capabilityFetchInPage(spec)   -- the FIXED, self-contained page func that
   *       runs in the page MAIN world via chrome.scripting.executeScript. It
   *       references ONLY Web APIs (document, fetch, JSON, URL, Object) and
   *       args[0] (the spec). It is stringified by executeScript and re-parsed in
   *       the page realm, so it captures NOTHING from this module's scope (D-03,
   *       Wall-1). It NEVER returns cookies or auth material.
   *   - executeBoundSpec(spec, tabId) -- the service-worker wrapper. It re-asserts
   *       the active/owned tab origin === spec.origin BEFORE any side effect
   *       (FETCH-03 part 2, D-08 part 2), wraps the fetch in a BEFORE_API_REQUEST
   *       resume-sidecar snapshot (FETCH-04, D-10), injects capabilityFetchInPage
   *       into the page MAIN world, and runs the read-only JMESPath extract
   *       service-worker-side after the body returns (D-07).
   *   - classifyOnWake(snapshot)      -- a THIN LOCAL classifier (CAVEAT-1, D-11)
   *       that reuses the Lattice ResumePolicy marker STRINGS but reads the FLAT
   *       snake_case task-store envelope (current_step + method) directly. A
   *       mutating-method (POST/PUT/PATCH/DELETE) in-flight snapshot classifies to
   *       RECOVERY_AMBIGUOUS and is NEVER blind-retried; a GET is re-issuable.
   *
   * Locked decisions implemented here (27-CONTEXT.md / 27-RESEARCH.md):
   *   - D-01 this module is the dynamic-code-free MAIN-world fetch home. It is on
   *          the recipe-path CI-guard allowlist (scanned even in comments), so it
   *          contains ZERO run-string-as-code / function-from-string / dynamic
   *          module loader constructs -- not even in a comment or string literal.
   *   - D-03 capabilityFetchInPage is serialization-safe: a single top-level
   *          function with only inline locals, no closure variables, no sibling
   *          helpers, no service-worker globals.
   *   - D-04 the wrapper direct-drives a tabId (no MCP tool, no router -- those are
   *          Phase 28/29).
   *   - D-05 the CSRF token is live-scraped in-page BEFORE the request.
   *   - D-06 a from:'response' CSRF source is deferred to Phase 29 (the schema
   *          carries the enum member; this module does not implement it).
   *   - D-07 the read-only JMESPath extract runs service-worker-side AFTER the body
   *          returns, via FsbCapabilityInterpreter.getFSBJmespath().search -- the
   *          engine is not in page scope.
   *   - D-10 a BEFORE_API_REQUEST resume-sidecar snapshot is written (best-effort)
   *          BEFORE executeScript and a terminal write + delete on completion.
   *   - D-11 classifyOnWake never returns a verdict that blind-retries a mutation.
   *   - D-13 the hardcoded github.com GET /notifications recipe is the FETCH-05
   *          proof; it passes the closed schema.
   *   - D-15 the live logged-in-shape assertion is Plan 03's human-gated UAT; this
   *          module is proven in CI with a stubbed executeScript recorder.
   *   - D-16 the reserved /_graphql input[name=authenticity_token] CSRF exemplar
   *          reads .value (CAVEAT-2), not .content.
   *
   * Module shell: the dual-export IIFE mirror of extension/utils/mcp-task-store.js
   * -- the same lazy globalThis.chrome accessor (so the module loads cleanly under
   * the Node test harness where chrome is mocked AFTER load) and the same
   * global.Fsb* + module.exports dual export. Sibling service-worker globals
   * (FsbMcpTaskStore, FsbCapabilityInterpreter) are reached only through
   * typeof-guards, never closure/import. The in-page func reaches NONE of them.
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- Lazy globalThis.chrome accessor (mcp-task-store.js:59-61 pattern) ----
  //
  // Lazy so the module loads cleanly under the Node test harness where chrome is
  // mocked AFTER module load. The in-page func does NOT use this -- it is
  // serialization-isolated and reads the chrome-free page realm.

  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }

  // ---- typeof-guarded sibling-global accessors (NO closure/import) ----------
  //
  // Service-worker-side helpers only. Each returns null when its global is absent
  // so the wrapper degrades gracefully (best-effort sidecar; raw json on a missing
  // extract engine). The in-page func reaches NEITHER -- it is serialization-safe.

  function _getTaskStore() {
    return (typeof globalThis !== 'undefined' && globalThis.FsbMcpTaskStore)
      ? globalThis.FsbMcpTaskStore : null;
  }

  function _getJmespathEngine() {
    var interp = (typeof FsbCapabilityInterpreter !== 'undefined' && FsbCapabilityInterpreter)
      ? FsbCapabilityInterpreter : null;
    if (interp && typeof interp.getFSBJmespath === 'function') {
      return interp.getFSBJmespath();
    }
    return null;
  }

  // ---- Typed-error dual-field RETURN (capability-interpreter.js:85-93) -------
  //
  // RETURN (never throw). Set BOTH code AND errorCode AND error so errors.ts
  // resolveErrorKey surfaces the code verbatim from either field. Used for the
  // wrapper's RECIPE_ORIGIN_MISMATCH (active-tab pin) and RECOVERY_AMBIGUOUS.

  function _typedError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  // ===========================================================================
  // capabilityFetchInPage -- the FIXED, self-contained page MAIN-world func.
  // ===========================================================================
  //
  // D-03 / Wall-1: this function is stringified by chrome.scripting.executeScript
  // and re-parsed in the page realm. It MUST reference ONLY Web APIs (document,
  // fetch, JSON, URL, Object) and args[0] (spec). It captures NOTHING from this
  // module: no _getChrome, no _getTaskStore, no jmespath, no sibling helper. Any
  // free identifier that is not a Web API or a spec field would throw a
  // ReferenceError against a real page (CI's stubbed executeScript never runs the
  // body, which is why a static toString() guard asserts the prohibition).
  //
  // It returns ONLY non-secret response data { ok, status, finalUrl, redirected,
  // json, text }; it NEVER reads or returns cookies or auth material. The
  // read-only extract is NOT run here -- it runs service-worker-side (D-07).

  function capabilityFetchInPage(spec) {
    return (async function () {
      try {
        var headers = Object.assign({}, (spec && spec.headers) || {});

        // FETCH-02 (D-05): live CSRF scrape, in-page, BEFORE the request.
        if (spec && spec.csrfSource && spec.csrfSource.header) {
          var token = null;
          var src = spec.csrfSource;
          if (src.from === 'meta' && src.selector) {
            var el = document.querySelector(src.selector);
            if (el) {
              // CAVEAT-2 (D-16): an <input> (the reserved /_graphql exemplar
              // input[name=authenticity_token]) holds its token in .value; a
              // <meta> tag holds it in .content / getAttribute('content').
              var tag = el.tagName ? el.tagName.toLowerCase() : '';
              if (tag === 'input') {
                token = el.value || el.getAttribute('value') || null;
              } else {
                token = el.getAttribute('content') || el.content || null;
              }
            }
          } else if (src.from === 'cookie' && src.selector) {
            // Minimal document.cookie parse keyed by the selector (the cookie name).
            var prefix = '; ' + src.selector + '=';
            var parts = ('; ' + document.cookie).split(prefix);
            if (parts.length === 2) {
              var tail = parts.pop().split(';').shift();
              try { token = decodeURIComponent(tail); } catch (decErr) { token = tail; }
              if (src.stripQuotes === true) { token = String(token || '').replace(/^"+|"+$/g, ''); }
            }
          }
          // from:'response' is deferred to Phase 29 (D-06): no in-page handling.
          if (token) { headers[src.header] = token; }
        }

        if (spec && spec._authNeed && spec._authNeed.kind === 'bearer') {
          var need = spec._authNeed;
          var storage = need.storage === 'sessionStorage' ? sessionStorage : localStorage;
          function readJsonPath(root, jsonPath) {
            if (!jsonPath) { return root; }
            if (!root || typeof root !== 'object') { return null; }
            var current = root;
            var parts = String(jsonPath).split('.');
            for (var pi = 0; pi < parts.length; pi++) {
              if (!current || typeof current !== 'object') { return null; }
              current = current[parts[pi]];
            }
            return current;
          }
          function resolveJsonPathTemplate(template, root) {
            if (!template || String(template).indexOf('{') === -1) { return template; }
            return String(template).replace(/\{([^}]+)\}/g, function (_match, tokenPath) {
              var value = readJsonPath(root, tokenPath);
              return value === undefined || value === null ? '' : String(value);
            });
          }
          function readStoredString(key, parseJson, jsonPath, jsonPathTemplate) {
            if (!key || !storage || typeof storage.getItem !== 'function') { return null; }
            var raw = storage.getItem(key);
            if (!raw) { return null; }
            if (parseJson === false) { return String(raw); }
            try {
              var parsed = JSON.parse(raw);
              var path = resolveJsonPathTemplate(jsonPathTemplate || jsonPath, parsed);
              if (path && parsed && typeof parsed === 'object') {
                var current = readJsonPath(parsed, path);
                return typeof current === 'string' && current.length > 0 ? current : null;
              }
              return typeof parsed === 'string' && parsed.length > 0 ? parsed : null;
            } catch (jsonErr) {
              return String(raw);
            }
          }
          var bearer = readStoredString(
            need.tokenKey || need.key,
            need.parseJson,
            need.tokenPath || need.jsonPath || need.field || need.tokenField,
            need.tokenPathTemplate || need.jsonPathTemplate
          );
          if (!bearer) {
            return { error: 'auth-storage-missing' };
          }
          headers[need.header || 'Authorization'] = (need.prefix === undefined ? 'Bearer ' : String(need.prefix)) + bearer;
          var extra = Array.isArray(need.extraHeaders) ? need.extraHeaders : [];
          for (var eh = 0; eh < extra.length; eh++) {
            var item = extra[eh] || {};
            var name = item.header;
            var value = item.value !== undefined
              ? String(item.value)
              : readStoredString(
                item.storageKey,
                item.parseJson,
                item.tokenPath || item.jsonPath || item.field || item.tokenField,
                item.tokenPathTemplate || item.jsonPathTemplate
              );
            if (!name || !value) {
              if (item.optional === true) { continue; }
              return { error: 'auth-storage-missing' };
            }
            headers[name] = value;
          }
        }

        if (spec && spec.authSource && spec.authSource.from === 'discord-webpack-token'
            && spec.authSource.header) {
          var discordToken = null;
          try {
            var chunks = globalThis.webpackChunkdiscord_app;
            if (chunks && typeof chunks.push === 'function') {
              chunks.push([
                [Math.random()],
                {},
                function (req) {
                  var cache = req && req.c ? req.c : {};
                  var modules;
                  try {
                    modules = Object.values(cache);
                  } catch (cacheErr) {
                    modules = [];
                  }
                  for (var i = 0; i < modules.length; i++) {
                    try {
                      var exportsObj = modules[i] && modules[i].exports;
                      var candidate = exportsObj && (exportsObj.default || exportsObj);
                      if (candidate && typeof candidate.getToken === 'function') {
                        var tokenValue = candidate.getToken();
                        if (typeof tokenValue === 'string' && tokenValue.length > 0) {
                          discordToken = tokenValue;
                          break;
                        }
                      }
                    } catch (moduleErr) {
                      continue;
                    }
                  }
                }
              ]);
            }
          } catch (authErr) {
            discordToken = null;
          }
          if (!discordToken) {
            return { error: 'missing discord auth token' };
          }
          headers[spec.authSource.header] = discordToken;
        }

        var method = (spec && spec.method) || 'GET';
        var credentials = (spec && spec.credentials)
          ? spec.credentials
          : ((spec && spec.authStrategy === 'none') ? 'omit' : 'include');
        var init = {
          method: method,
          headers: headers,
          // FETCH-01: credentialed same-origin specs attach first-party HttpOnly
          // cookies. Explicit anonymous specs use credentials:'omit' so public CORS
          // endpoints with wildcard ACAO are not rejected as credentialed requests.
          credentials: credentials,
          // redirect:'manual' keeps a 302 -> /login observable as the logged-out
          // signal (D-14) instead of being silently followed.
          redirect: 'manual'
        };
        // Only attach a body for non-GET/HEAD methods.
        if (spec && spec.body != null && method !== 'GET' && method !== 'HEAD') {
          init.body = (typeof spec.body === 'string') ? spec.body : JSON.stringify(spec.body);
        }

        var resp = await fetch((spec && spec.url) || '', init);

        // Defensive body read (Pitfall 5): read status + url FIRST so the
        // 200-vs-302 signal is never lost to a parse throw on an HTML body.
        var status = resp.status;
        var finalUrl = resp.url;
        // IN-01: under redirect:'manual' (init above) a 3xx is surfaced as an
        // opaqueredirect (resp.type === 'opaqueredirect', status 0), so the
        // opaqueredirect disjunct is what actually fires for a login redirect and the
        // numeric (status >= 300 && status < 400) range is effectively unreachable on
        // THIS path. The numeric disjunct is kept as a belt-and-suspenders guard so the
        // logged-out signal stays correct if this init is ever changed to a redirect
        // mode that surfaces a live 3xx status; it does NOT mean the fetcher follows
        // redirects.
        var redirected = resp.type === 'opaqueredirect' || (status >= 300 && status < 400);

        var CAP = 256 * 1024;
        var text = '';
        try {
          text = await resp.text();
        } catch (bodyErr) {
          text = '';
        }
        if (text && text.length > CAP) { text = text.slice(0, CAP); }

        var json = null;
        try {
          json = JSON.parse(text);
        } catch (parseErr) {
          json = null;
        }

        // Return ONLY non-secret response data. No cookies, no auth material.
        return {
          ok: resp.ok,
          status: status,
          finalUrl: finalUrl,
          redirected: redirected,
          json: json,
          text: json ? null : text
        };
      } catch (err) {
        return { error: (err && err.message) ? err.message : String(err) };
      }
    })();
  }

  // ===========================================================================
  // capabilityPageReadInPage -- fixed, operation-keyed page-state read primitive.
  // ===========================================================================
  //
  // Some reviewed T1a heads read first-party state or page-loaded runtime helpers
  // that are only available in the app's MAIN-world context. This fixed primitive
  // is intentionally narrow: it supports only hardcoded read operations and returns
  // typed fallbacks for unsupported actions or missing app modules.

  function capabilityPageReadInPage(request) {
    return (async function () {
      function typedError(code, extra) {
        var out = { success: false, code: code, errorCode: code, error: code };
        if (extra) {
          for (var k in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
          }
        }
        return out;
      }
      function fallback(reason) {
        return typedError('RECIPE_DOM_FALLBACK_PENDING', {
          reason: reason,
          fellBackToDom: true
        });
      }
      function telegramString(value) {
        return value === undefined || value === null ? '' : String(value);
      }
      function telegramNumber(value) {
        var n = Number(value);
        return isFinite(n) ? n : 0;
      }
      function telegramObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      }
      function telegramThrow(reason) {
        throw { telegramFallbackReason: reason };
      }
      function telegramManagers() {
        var root = globalThis.rootScope;
        return root && root.managers && typeof root.managers === 'object' ? root.managers : null;
      }
      function telegramManager(name) {
        var managers = telegramManagers();
        return managers && managers[name] && typeof managers[name] === 'object' ? managers[name] : null;
      }
      async function telegramCallManager(managerName, methodName, args) {
        var manager = telegramManager(managerName);
        var fn = manager && manager[methodName];
        if (typeof fn !== 'function') {
          telegramThrow('telegram-' + managerName + '-' + methodName + '-unavailable');
        }
        return fn.apply(manager, args || []);
      }
      async function telegramInvokeApi(method, params) {
        var apiManager = telegramManager('apiManager');
        if (!apiManager || typeof apiManager.invokeApi !== 'function') {
          telegramThrow('telegram-api-manager-unavailable');
        }
        return apiManager.invokeApi(method, params || {});
      }
      function telegramFallbackFromError(err) {
        if (err && err.telegramFallbackReason) { return fallback(err.telegramFallbackReason); }
        var raw = telegramString(err && (err.type || err.code || err.message || err.name)) || 'api-error';
        var reason = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return fallback('telegram-' + (reason || 'api-error').slice(0, 80));
      }
      function telegramPeerId(peer) {
        if (typeof peer === 'number') { return peer; }
        peer = telegramObject(peer);
        return telegramNumber(peer.user_id || peer.channel_id || peer.chat_id);
      }
      function telegramStatus(status) {
        var raw = telegramString(telegramObject(status)._);
        if (!raw) { return 'unknown'; }
        if (raw === 'userStatusOnline') { return 'online'; }
        if (raw === 'userStatusOffline') { return 'offline'; }
        if (raw === 'userStatusRecently') { return 'recently'; }
        if (raw === 'userStatusLastWeek') { return 'lastWeek'; }
        if (raw === 'userStatusLastMonth') { return 'lastMonth'; }
        return raw.replace(/^userStatus/, '').toLowerCase();
      }
      function telegramFirstUsername(value) {
        value = telegramObject(value);
        if (value.username) { return telegramString(value.username); }
        var usernames = Array.isArray(value.usernames) ? value.usernames : [];
        return usernames[0] && usernames[0].username ? telegramString(usernames[0].username) : '';
      }
      function telegramMapUser(user) {
        user = telegramObject(user);
        var flags = telegramObject(user.pFlags);
        return {
          id: telegramNumber(user.id),
          first_name: telegramString(user.first_name),
          last_name: telegramString(user.last_name),
          username: telegramFirstUsername(user),
          phone: telegramString(user.phone),
          is_bot: !!flags.bot,
          is_premium: !!flags.premium,
          status: telegramStatus(user.status)
        };
      }
      function telegramMapChat(chat, about) {
        chat = telegramObject(chat);
        var flags = telegramObject(chat.pFlags);
        return {
          id: telegramNumber(chat.id),
          title: telegramString(chat.title),
          type: telegramString(chat._ || 'chat'),
          username: telegramFirstUsername(chat),
          participants_count: telegramNumber(chat.participants_count),
          about: telegramString(about),
          is_megagroup: !!flags.megagroup,
          is_broadcast: !!flags.broadcast
        };
      }
      function telegramMapMessage(message) {
        message = telegramObject(message);
        var flags = telegramObject(message.pFlags);
        var reply = telegramObject(message.reply_to);
        var action = telegramObject(message.action);
        return {
          id: telegramNumber(message.id),
          date: telegramNumber(message.date),
          text: telegramString(message.message || (action._ ? '[' + telegramString(action._).replace(/^messageAction/, '') + ']' : '')),
          from_id: telegramPeerId(message.from_id),
          peer_id: telegramPeerId(message.peer_id),
          is_outgoing: !!flags.out,
          reply_to_msg_id: telegramNumber(reply.reply_to_msg_id),
          edit_date: telegramNumber(message.edit_date),
          is_pinned: !!flags.pinned,
          type: telegramString(message._ || 'message'),
          views: telegramNumber(message.views)
        };
      }
      function telegramMapContact(contact) {
        contact = telegramObject(contact);
        return {
          user_id: telegramNumber(contact.user_id),
          mutual: !!telegramObject(contact.pFlags).mutual
        };
      }
      function telegramMapById(list) {
        var out = {};
        list = Array.isArray(list) ? list : [];
        for (var i = 0; i < list.length; i++) {
          var id = telegramNumber(list[i] && list[i].id);
          if (id) { out[String(id)] = list[i]; }
        }
        return out;
      }
      function telegramMapDialog(dialog, users, chats, messages) {
        dialog = telegramObject(dialog);
        var peer = telegramObject(dialog.peer);
        var peerId = telegramPeerId(peer);
        var peerType = telegramString(peer._ || 'peerUser').replace(/^peer/, '').toLowerCase();
        var topMessage = messages[String(telegramNumber(dialog.top_message))] || {};
        var chat = chats[String(peerId)] || {};
        var user = users[String(peerId)] || {};
        var title = peerType === 'user'
          ? (telegramString(user.first_name) + ' ' + telegramString(user.last_name)).trim()
          : telegramString(chat.title);
        return {
          peer_id: peerId,
          peer_type: peerType,
          title: title,
          unread_count: telegramNumber(dialog.unread_count),
          unread_mentions_count: telegramNumber(dialog.unread_mentions_count),
          top_message_id: telegramNumber(dialog.top_message),
          top_message_text: telegramString(topMessage.message),
          top_message_date: telegramNumber(topMessage.date),
          is_pinned: !!telegramObject(dialog.pFlags).pinned,
          is_muted: telegramNumber(telegramObject(dialog.notify_settings).mute_until) > 0,
          folder_id: telegramNumber(dialog.folder_id)
        };
      }
      function telegramSuccess(data) {
        return { success: true, status: 200, data: data };
      }
      async function telegramInputPeer(peerId, selfForZero) {
        if (telegramNumber(peerId) === 0) {
          return selfForZero ? { _: 'inputPeerSelf' } : { _: 'inputPeerEmpty' };
        }
        return telegramCallManager('appPeersManager', 'getInputPeerById', [peerId]);
      }
      async function telegramInputUser(userId) {
        return telegramCallManager('appUsersManager', 'getUserInput', [userId]);
      }
      async function telegramInputChannel(channelId) {
        return telegramCallManager('appChatsManager', 'getChannelInput', [channelId]);
      }
      async function telegramRead(action, args) {
        args = args || {};
        try {
          if (action === 'get_current_user') {
            return telegramSuccess({ user: telegramMapUser(await telegramCallManager('appUsersManager', 'getSelf', [])) });
          }
          if (action === 'get_user') {
            return telegramSuccess({ user: telegramMapUser(await telegramCallManager('appUsersManager', 'getUser', [args.user_id])) });
          }
          if (action === 'get_user_profile') {
            var inputUser = await telegramInputUser(args.user_id);
            var fullUser = telegramObject(await telegramInvokeApi('users.getFullUser', { id: inputUser }));
            var profile = telegramMapUser((Array.isArray(fullUser.users) ? fullUser.users[0] : {}) || {});
            profile.about = telegramString(telegramObject(fullUser.full_user).about);
            profile.common_chats_count = telegramNumber(telegramObject(fullUser.full_user).common_chats_count);
            return telegramSuccess({ profile: profile });
          }
          if (action === 'list_contacts') {
            var contactsResult = telegramObject(await telegramInvokeApi('contacts.getContacts', { hash: 0 }));
            return telegramSuccess({
              contacts: (Array.isArray(contactsResult.contacts) ? contactsResult.contacts : []).map(telegramMapContact),
              users: (Array.isArray(contactsResult.users) ? contactsResult.users : []).map(telegramMapUser)
            });
          }
          if (action === 'resolve_username') {
            var username = telegramString(args.username).replace(/^@+/, '');
            var resolved = telegramObject(await telegramInvokeApi('contacts.resolveUsername', { username: username }));
            var peer = telegramObject(resolved.peer);
            return telegramSuccess({
              peer_type: telegramString(peer._ || 'peerUser').replace(/^peer/, '').toLowerCase(),
              peer_id: telegramPeerId(peer),
              users: (Array.isArray(resolved.users) ? resolved.users : []).map(telegramMapUser),
              chats: (Array.isArray(resolved.chats) ? resolved.chats : []).map(function(chat) { return telegramMapChat(chat); })
            });
          }
          if (action === 'search_contacts') {
            var contactHits = telegramObject(await telegramInvokeApi('contacts.search', {
              q: telegramString(args.query),
              limit: telegramNumber(args.limit) || 20
            }));
            return telegramSuccess({
              users: (Array.isArray(contactHits.users) ? contactHits.users : []).map(telegramMapUser),
              chats: (Array.isArray(contactHits.chats) ? contactHits.chats : []).map(function(chat) { return telegramMapChat(chat); })
            });
          }
          if (action === 'list_conversations') {
            var dialogsResult = telegramObject(await telegramInvokeApi('messages.getDialogs', {
              offset_date: 0,
              offset_id: 0,
              offset_peer: { _: 'inputPeerEmpty' },
              limit: telegramNumber(args.limit) || 20,
              hash: 0,
              folder_id: telegramNumber(args.folder_id)
            }));
            var dialogUsers = telegramMapById(dialogsResult.users);
            var dialogChats = telegramMapById(dialogsResult.chats);
            var dialogMessages = telegramMapById(dialogsResult.messages);
            var dialogs = Array.isArray(dialogsResult.dialogs) ? dialogsResult.dialogs : [];
            return telegramSuccess({
              conversations: dialogs.map(function(dialog) {
                return telegramMapDialog(dialog, dialogUsers, dialogChats, dialogMessages);
              }),
              count: telegramNumber(dialogsResult.count) || dialogs.length
            });
          }
          if (action === 'get_conversation') {
            var conversationPeer = await telegramInputPeer(args.peer_id, true);
            var peerDialogs = telegramObject(await telegramInvokeApi('messages.getPeerDialogs', {
              peers: [{ _: 'inputDialogPeer', peer: conversationPeer }]
            }));
            var peerUsers = telegramMapById(peerDialogs.users);
            var peerChats = telegramMapById(peerDialogs.chats);
            var peerMessages = telegramMapById(peerDialogs.messages);
            var firstDialog = Array.isArray(peerDialogs.dialogs) ? peerDialogs.dialogs[0] : {};
            return telegramSuccess({
              conversation: telegramMapDialog(firstDialog || {}, peerUsers, peerChats, peerMessages)
            });
          }
          if (action === 'get_messages') {
            var historyPeer = await telegramInputPeer(args.peer_id, true);
            var history = telegramObject(await telegramInvokeApi('messages.getHistory', {
              peer: historyPeer,
              offset_id: telegramNumber(args.offset_id),
              offset_date: 0,
              add_offset: 0,
              limit: telegramNumber(args.limit) || 20,
              max_id: 0,
              min_id: 0,
              hash: 0
            }));
            var historyMessages = Array.isArray(history.messages) ? history.messages : [];
            return telegramSuccess({
              messages: historyMessages.map(telegramMapMessage),
              count: telegramNumber(history.count) || historyMessages.length
            });
          }
          if (action === 'search_messages') {
            var searchPeer = await telegramInputPeer(args.peer_id, false);
            var search = telegramObject(await telegramInvokeApi('messages.search', {
              peer: searchPeer,
              q: telegramString(args.query),
              filter: { _: 'inputMessagesFilterEmpty' },
              min_date: 0,
              max_date: 0,
              offset_id: telegramNumber(args.offset_id),
              add_offset: 0,
              limit: telegramNumber(args.limit) || 20,
              max_id: 0,
              min_id: 0,
              hash: 0
            }));
            var foundMessages = Array.isArray(search.messages) ? search.messages : [];
            return telegramSuccess({
              messages: foundMessages.map(telegramMapMessage),
              count: telegramNumber(search.count) || foundMessages.length
            });
          }
          if (action === 'get_chat_info') {
            var chatInfo;
            if (args.is_channel === true) {
              chatInfo = telegramObject(await telegramInvokeApi('channels.getFullChannel', {
                channel: await telegramInputChannel(args.peer_id)
              }));
            } else {
              chatInfo = telegramObject(await telegramInvokeApi('messages.getFullChat', {
                chat_id: args.peer_id
              }));
            }
            var fullChat = telegramObject(chatInfo.full_chat);
            var chatList = Array.isArray(chatInfo.chats) ? chatInfo.chats : [];
            var chat = telegramMapChat(chatList[0] || {}, fullChat.about);
            if (!chat.participants_count) { chat.participants_count = telegramNumber(fullChat.participants_count); }
            return telegramSuccess({ chat: chat });
          }
          if (action === 'get_chat_members') {
            var memberLimit = telegramNumber(args.limit) || 50;
            if (args.is_channel === true) {
              var participants = telegramObject(await telegramInvokeApi('channels.getParticipants', {
                channel: await telegramInputChannel(args.peer_id),
                filter: args.query ? { _: 'channelParticipantsSearch', q: telegramString(args.query) } : { _: 'channelParticipantsRecent' },
                offset: telegramNumber(args.offset),
                limit: memberLimit,
                hash: 0
              }));
              var participantUsers = Array.isArray(participants.users) ? participants.users : [];
              return telegramSuccess({
                members: participantUsers.map(telegramMapUser),
                count: telegramNumber(participants.count) || participantUsers.length
              });
            }
            var groupFull = telegramObject(await telegramInvokeApi('messages.getFullChat', {
              chat_id: args.peer_id
            }));
            var groupUsers = Array.isArray(groupFull.users) ? groupFull.users : [];
            var participantList = telegramObject(telegramObject(groupFull.full_chat).participants).participants;
            return telegramSuccess({
              members: groupUsers.map(telegramMapUser),
              count: Array.isArray(participantList) ? participantList.length : groupUsers.length
            });
          }
          return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-telegram-page-read-action' });
        } catch (err) {
          return telegramFallbackFromError(err);
        }
      }
      function minimaxWebpackRequire() {
        try {
          var chunk = globalThis.webpackChunk_N_E;
          if (!Array.isArray(chunk)) { return null; }
          var req = null;
          chunk.push([
            ['__fsb_minimax_probe_' + Date.now()],
            {},
            function (r) { req = r; }
          ]);
          return req;
        } catch (err) {
          return null;
        }
      }
      function minimaxIsAxiosLike(value) {
        return !!value
          && typeof value === 'object'
          && typeof value.get === 'function'
          && typeof value.post === 'function'
          && value.interceptors
          && typeof value.interceptors === 'object';
      }
      function minimaxAxios() {
        var req = minimaxWebpackRequire();
        var cache = req && req.c;
        if (!cache || typeof cache !== 'object') { return null; }
        for (var id in cache) {
          if (!Object.prototype.hasOwnProperty.call(cache, id)) { continue; }
          try {
            var exports = cache[id] && cache[id].exports;
            if (minimaxIsAxiosLike(exports)) { return exports; }
            if (!exports || typeof exports !== 'object') { continue; }
            for (var key in exports) {
              if (Object.prototype.hasOwnProperty.call(exports, key) && minimaxIsAxiosLike(exports[key])) {
                return exports[key];
              }
            }
          } catch (err) {
            // Skip opaque webpack modules.
          }
        }
        return null;
      }
      function minimaxString(value) {
        return value === undefined || value === null ? '' : String(value);
      }
      function minimaxBool(value) {
        return value === true;
      }
      function minimaxMapUser(user) {
        user = user && typeof user === 'object' ? user : {};
        var avatarInfo = user.avatarInfo && typeof user.avatarInfo === 'object' ? user.avatarInfo : {};
        return {
          user_id: minimaxString(user.userID),
          real_user_id: minimaxString(user.realUserID),
          name: minimaxString(user.name),
          email: minimaxString(user.email),
          avatar: minimaxString(avatarInfo.large || user.avatar),
          description: minimaxString(user.description),
          is_login: minimaxBool(user.isLogin)
        };
      }
      async function minimaxRead(action) {
        if (action !== 'get_current_user') {
          return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-minimax-page-read-action' });
        }
        var ax = minimaxAxios();
        if (!ax) { return fallback('minimax-axios-unavailable'); }
        try {
          var resp = await ax.get('/v1/api/user/info');
          var data = resp && resp.data ? resp.data : {};
          if (data.statusInfo && data.statusInfo.code && data.statusInfo.code !== 0) {
            return fallback('minimax-status-info-error');
          }
          if (data.base_resp && data.base_resp.status_code && data.base_resp.status_code !== 0) {
            return fallback('minimax-base-resp-error');
          }
          return {
            success: true,
            status: resp && resp.status ? resp.status : 200,
            data: { user: minimaxMapUser(data.data && data.data.userInfo) }
          };
        } catch (err) {
          return fallback('minimax-page-read-failed');
        }
      }
      function glamaString(value) {
        return value === undefined || value === null ? '' : String(value);
      }
      function glamaNumber(value) {
        var n = Number(value);
        return isFinite(n) ? n : 0;
      }
      function glamaList(value) {
        return Array.isArray(value) ? value : [];
      }
      function glamaObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      }
      function glamaEncode(value) {
        return encodeURIComponent(glamaString(value));
      }
      function glamaQuery(pairs) {
        var parts = [];
        for (var i = 0; i < (pairs || []).length; i++) {
          var key = pairs[i][0];
          var value = pairs[i][1];
          if (value === undefined || value === null || value === '') { continue; }
          parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
        }
        return parts.length ? '?' + parts.join('&') : '';
      }
      function glamaRouter() {
        var router = globalThis.__reactRouterDataRouter;
        return router && router.state && router.state.loaderData ? router : null;
      }
      function glamaSession(router) {
        var root = glamaObject(glamaObject(router.state.loaderData).root);
        var visitor = glamaObject(root.visitor);
        return glamaObject(visitor.visitorSession);
      }
      function glamaIsAuthenticated(router) {
        var session = glamaSession(router);
        if (!session || Object.keys(session).length === 0) { return false; }
        var attrs = glamaList(session.attributes);
        if (attrs.indexOf('authenticated') !== -1) { return true; }
        return !!session.userAccount;
      }
      async function glamaWaitForIdle(router) {
        var start = Date.now();
        while (router && router.state && router.state.navigation &&
            router.state.navigation.state && router.state.navigation.state !== 'idle') {
          if (Date.now() - start > 10000) { return false; }
          await new Promise(function(resolve) { setTimeout(resolve, 50); });
        }
        return true;
      }
      function glamaRouterError(router) {
        var errors = router && router.state ? router.state.errors : null;
        if (!errors || typeof errors !== 'object') { return null; }
        for (var key in errors) {
          if (!Object.prototype.hasOwnProperty.call(errors, key)) { continue; }
          var err = errors[key] || {};
          var status = Number(err.status || 0);
          if (status === 404) { return 'glama-route-not-found'; }
          if (status === 401 || status === 403) { return 'glama-auth-required'; }
          if (status >= 400) { return 'glama-route-error-' + status; }
        }
        return null;
      }
      async function glamaLoad(path, routeKey, requireAuth) {
        var router = glamaRouter();
        if (!router) { return { error: fallback('glama-react-router-unavailable') }; }
        if (requireAuth && !glamaIsAuthenticated(router)) {
          return { error: fallback('glama-auth-required') };
        }
        if (typeof router.navigate !== 'function') {
          return { error: fallback('glama-router-navigate-unavailable') };
        }
        try {
          await router.navigate(path);
        } catch (err) {
          return { error: fallback('glama-router-navigate-failed') };
        }
        if (!await glamaWaitForIdle(router)) {
          return { error: fallback('glama-router-navigation-timeout') };
        }
        var routeError = glamaRouterError(router);
        if (routeError) { return { error: fallback(routeError) }; }
        var data = glamaObject(router.state.loaderData)[routeKey];
        if (!data) { return { error: fallback('glama-route-data-missing') }; }
        return { data: data };
      }
      function glamaMapStats(s) {
        s = glamaObject(s);
        return {
          totalServerCount: glamaNumber(s.totalServerCount),
          lastUpdated: glamaString(s.lastUpdated)
        };
      }
      function glamaMapServerSummary(s) {
        s = glamaObject(s);
        var repo = glamaObject(glamaObject(s.repository).githubRepository);
        var license = glamaObject(repo.spdxLicense);
        return {
          uid: glamaString(s.uid),
          slug: glamaString(s.slug),
          displayName: glamaString(s.displayName),
          namespace: glamaString(glamaObject(s.namespace).slug),
          description: glamaString(s.descriptionPlainText),
          toolCount: glamaNumber(s.toolCount),
          stargazers: glamaNumber(repo.stargazers),
          language: glamaString(repo.language),
          license: glamaString(license.name),
          addedAt: glamaString(s.addedAt),
          updatedAt: glamaString(s.updatedAt),
          recentUsage: glamaNumber(s.recentUsage),
          attributes: glamaList(s.attributes).map(glamaString)
        };
      }
      function glamaMapServerDetail(s) {
        s = glamaObject(s);
        var base = glamaMapServerSummary(s);
        var repo = glamaObject(s.repository);
        var gh = glamaObject(repo.githubRepository);
        var project = glamaObject(repo.githubProject);
        var npmPackage = glamaObject(repo.npmPackage);
        var scores = glamaObject(s.scores);
        base.descriptionMarkdown = glamaString(s.descriptionMarkdown);
        base.githubRepoUrl = glamaString(project.url);
        base.githubRepoFullName = glamaString(gh.fullName);
        base.defaultBranch = glamaString(gh.defaultBranch);
        base.scores = {
          license: scores.license === undefined ? null : scores.license,
          quality: scores.quality === undefined ? null : scores.quality,
          security: scores.security === undefined ? null : scores.security
        };
        base.npmPackage = glamaString(npmPackage.name);
        base.supportedPlatforms = glamaList(repo.supportedPlatforms).map(glamaString);
        base.integrations = glamaList(s.integrations).map(function(integration) {
          integration = glamaObject(integration);
          var brand = glamaObject(integration.brand);
          return {
            name: glamaString(brand.name),
            slug: glamaString(brand.slug),
            description: glamaString(integration.description)
          };
        });
        return base;
      }
      function glamaMapTool(t) {
        t = glamaObject(t);
        var server = glamaObject(t.mcpServer);
        return {
          uid: glamaString(t.uid),
          name: glamaString(t.name),
          description: glamaString(t.description),
          serverDisplayName: glamaString(server.displayName),
          serverNamespace: glamaString(glamaObject(server.namespace).slug),
          serverSlug: glamaString(server.slug)
        };
      }
      function glamaMapChat(c) {
        c = glamaObject(c);
        return {
          uid: glamaString(c.uid),
          title: glamaString(c.title),
          model: glamaString(glamaObject(c.hostedLlmModel).name),
          projectName: glamaString(glamaObject(c.project).name),
          reasoningEffort: glamaString(c.reasoningEffort)
        };
      }
      function glamaMapUser(session) {
        session = glamaObject(session);
        var user = glamaObject(session.userAccount);
        var membership = glamaObject(session.membership);
        var role = glamaObject(membership.role);
        var workspace = glamaObject(membership.workspace);
        return {
          referenceId: glamaString(user.referenceId),
          email: glamaString(user.emailAddress),
          fullName: glamaString(user.fullName),
          workspaceName: glamaString(workspace.name),
          workspaceId: glamaNumber(workspace.id),
          role: glamaString(role.name)
        };
      }
      function glamaMapModel(m) {
        m = glamaObject(m);
        return { name: glamaString(m.name) };
      }
      async function glamaRead(action, args) {
        var loaded;
        var data;
        var path;
        if (action === 'get_current_user') {
          var router = glamaRouter();
          if (!router) { return fallback('glama-react-router-unavailable'); }
          var session = glamaSession(router);
          if (!session || Object.keys(session).length === 0) { return fallback('glama-auth-required'); }
          return { success: true, status: 200, data: { user: glamaMapUser(session) } };
        }
        if (action === 'list_recent_chats') {
          loaded = await glamaLoad('/chat', 'routes/_authenticated/_app/_layout', true);
          if (loaded.error) { return loaded.error; }
          return { success: true, status: 200, data: {
            chats: glamaList(loaded.data.recentChatSessions).map(function(c) {
              c = glamaObject(c);
              return { uid: glamaString(c.uid), title: glamaString(c.title) };
            })
          } };
        }
        if (action === 'list_available_models') {
          loaded = await glamaLoad('/chat', 'routes/_authenticated/_app/chat/~uid/_index/_route', true);
          if (loaded.error) { return loaded.error; }
          return { success: true, status: 200, data: {
            models: glamaList(loaded.data.availableHostedLlmModels).map(glamaMapModel)
          } };
        }
        if (action === 'get_chat_session') {
          path = '/chat/' + glamaEncode(args.uid);
          loaded = await glamaLoad(path, 'routes/_authenticated/_app/chat/~uid/_index/_route', true);
          if (loaded.error) { return loaded.error; }
          return { success: true, status: 200, data: {
            chat: glamaMapChat(loaded.data.chatSession),
            availableModels: glamaList(loaded.data.availableHostedLlmModels).map(function(m) {
              return glamaString(glamaObject(m).name);
            })
          } };
        }
        if (action === 'list_projects') {
          loaded = await glamaLoad('/projects', 'routes/_authenticated/_app/projects/_index/_route', true);
          if (loaded.error) { return loaded.error; }
          return { success: true, status: 200, data: {
            projects: glamaList(loaded.data.projects).map(function(p) {
              p = glamaObject(p);
              return { uid: glamaString(p.uid), name: glamaString(p.name) };
            })
          } };
        }
        if (action === 'list_gateway_models') {
          loaded = await glamaLoad('/gateway/models', 'routes/_public/gateway/models/_index/_route', false);
          if (loaded.error) { return loaded.error; }
          return { success: true, status: 200, data: {
            models: glamaList(loaded.data.llmModelProfiles).map(function(m) {
              m = glamaObject(m);
              return {
                model: glamaString(m.model),
                author: glamaString(glamaObject(m.author).displayName || glamaObject(m.author).name),
                provider: glamaString(glamaObject(m.provider).displayName || glamaObject(m.provider).name),
                capabilities: glamaList(m.capabilities).map(glamaString),
                maxInputTokens: glamaNumber(glamaObject(m.maxTokens).input),
                maxOutputTokens: glamaNumber(glamaObject(m.maxTokens).output),
                inputPricePerToken: glamaString(glamaObject(m.pricePerToken).input),
                outputPricePerToken: glamaString(glamaObject(m.pricePerToken).output)
              };
            })
          } };
        }
        if (action === 'list_mcp_clients') {
          loaded = await glamaLoad('/mcp/clients', 'routes/_public/mcp/clients/_index/_index/_route', false);
          if (loaded.error) { return loaded.error; }
          return { success: true, status: 200, data: {
            clients: glamaList(loaded.data.mcpClients).map(function(c) {
              c = glamaObject(c);
              return {
                name: glamaString(c.name),
                slug: glamaString(c.slug),
                description: glamaString(c.description),
                stars: glamaNumber(glamaObject(c.githubRepository).stargazers),
                attributes: glamaList(c.attributes).map(glamaString)
              };
            })
          } };
        }
        if (action === 'list_server_categories') {
          loaded = await glamaLoad('/mcp/servers/categories', 'routes/_public/mcp/servers/categories/_index/_route', false);
          if (loaded.error) { return loaded.error; }
          return { success: true, status: 200, data: {
            categories: glamaList(loaded.data.categories).map(function(c) {
              c = glamaObject(c);
              var lookup = glamaString(c.lookupKey);
              return {
                name: glamaString(c.name),
                slug: lookup.indexOf('category:') === 0 ? lookup.slice(9) : lookup,
                icon: glamaString(c.icon),
                description: glamaString(c.description)
              };
            })
          } };
        }
        if (action === 'list_servers_by_category') {
          loaded = await glamaLoad('/mcp/servers/categories/' + glamaEncode(args.slug),
            'routes/_public/mcp/servers/categories/~slug/_route', false);
          if (loaded.error) { return loaded.error; }
          return { success: true, status: 200, data: {
            servers: glamaList(loaded.data.mcpServers).map(glamaMapServerSummary)
          } };
        }
        if (action === 'list_popular_servers' || action === 'search_servers') {
          var pairs = [];
          if (action === 'search_servers') { pairs.push(['q', args.q]); }
          pairs.push(['sort', args.sort || (action === 'list_popular_servers' ? 'popularity:desc' : '')]);
          loaded = await glamaLoad('/mcp/servers' + glamaQuery(pairs), 'routes/_public/mcp/servers/_index/_route', false);
          if (loaded.error) { return loaded.error; }
          data = glamaObject(loaded.data.serverSearchResult);
          return { success: true, status: 200, data: {
            servers: glamaList(data.results).map(glamaMapServerSummary),
            stats: glamaMapStats(loaded.data.stats)
          } };
        }
        if (action === 'search_tools') {
          loaded = await glamaLoad('/mcp/tools' + glamaQuery([['q', args.q]]), 'routes/_public/mcp/tools/_index/_route', false);
          if (loaded.error) { return loaded.error; }
          data = glamaObject(loaded.data.toolSearchResult);
          return { success: true, status: 200, data: {
            tools: glamaList(data.results).map(function(row) {
              return glamaMapTool(glamaObject(row).tool);
            })
          } };
        }
        if (action === 'get_server' || action === 'list_server_tools') {
          loaded = await glamaLoad('/mcp/servers/' + glamaEncode(args.namespace) + '/' + glamaEncode(args.slug),
            'routes/_public/mcp/servers/~namespace/~slug/_pages/_index/_route', false);
          if (loaded.error) { return loaded.error; }
          if (action === 'list_server_tools') {
            return { success: true, status: 200, data: { tools: glamaList(loaded.data.tools).map(glamaMapTool) } };
          }
          return { success: true, status: 200, data: {
            server: glamaMapServerDetail(loaded.data.mcpServer),
            tools: glamaList(loaded.data.tools).map(glamaMapTool),
            discussionCommentCount: glamaNumber(loaded.data.discussionCommentCount)
          } };
        }
        if (action === 'get_server_score') {
          loaded = await glamaLoad('/mcp/servers/' + glamaEncode(args.namespace) + '/' + glamaEncode(args.slug) + '/score',
            'routes/_public/mcp/servers/~namespace/~slug/_pages/score/_route', false);
          if (loaded.error) { return loaded.error; }
          var score = glamaObject(loaded.data.score);
          return { success: true, status: 200, data: {
            licenseScore: score.license === undefined ? null : score.license,
            qualityScore: score.quality === undefined ? null : score.quality,
            securityScore: score.security === undefined ? null : score.security
          } };
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-glama-page-read-action' });
      }
      function waRequire(moduleName) {
        try {
          if (typeof globalThis.require === 'function') {
            return globalThis.require(moduleName);
          }
        } catch (err) {
          return null;
        }
        return null;
      }
      function getChatCollection() {
        var mod = waRequire('WAWebChatCollection');
        return mod && mod.ChatCollection;
      }
      function getContactCollection() {
        var mod = waRequire('WAWebContactCollection');
        return mod && mod.ContactCollection;
      }
      function getModels(collection) {
        return collection && typeof collection.getModelsArray === 'function'
          ? collection.getModelsArray()
          : [];
      }
      function wid(value) {
        return value && value._serialized ? String(value._serialized) : '';
      }
      function findChat(chatId) {
        var chats = getModels(getChatCollection());
        for (var i = 0; i < chats.length; i++) {
          if (wid(chats[i] && chats[i].id) === String(chatId || '')) { return chats[i]; }
        }
        return null;
      }
      function findContact(contactId) {
        var contacts = getModels(getContactCollection());
        for (var i = 0; i < contacts.length; i++) {
          if (wid(contacts[i] && contacts[i].id) === String(contactId || '')) { return contacts[i]; }
        }
        return null;
      }
      function serializeChat(chat) {
        var rawUnread = chat && typeof chat.unreadCount === 'number' ? chat.unreadCount : 0;
        var mute = chat && chat.muteExpiration;
        return {
          id: wid(chat && chat.id),
          name: String((chat && (chat.formattedTitle || chat.name)) || ''),
          is_group: !!(chat && chat.id && chat.id.server === 'g.us'),
          unread_count: Math.max(0, rawUnread),
          marked_unread: rawUnread === -1,
          timestamp: (chat && typeof chat.t === 'number') ? chat.t : 0,
          archived: !!(chat && chat.archive),
          pinned: !!(chat && typeof chat.pin === 'number' && chat.pin > 0),
          muted: typeof mute === 'number' ? mute > 0 : false,
          is_read_only: !!(chat && chat.isReadOnly)
        };
      }
      function serializeContact(contact) {
        return {
          id: wid(contact && contact.id),
          name: String((contact && contact.name) || ''),
          short_name: String((contact && contact.shortName) || ''),
          push_name: String((contact && contact.pushname) || ''),
          is_business: !!(contact && contact.isBusiness),
          is_me: !!(contact && contact.isMe),
          type: String((contact && contact.type) || '')
        };
      }
      function serializeMessage(message) {
        var id = message && message.id;
        return {
          id: id && id._serialized ? String(id._serialized) : '',
          from_me: !!(id && id.fromMe),
          type: String((message && message.type) || ''),
          body: String((message && message.body) || ''),
          timestamp: (message && typeof message.t === 'number') ? message.t : 0,
          ack: (message && typeof message.ack === 'number') ? message.ack : 0,
          starred: !!(message && message.star),
          from: wid(message && message.from),
          to: wid(message && message.to),
          author: wid(message && message.author),
          is_forwarded: !!(message && message.isForwarded),
          has_media: !!(message && (message.isMedia || message.mediaKey)),
          quoted_message_id: String((message && message.quotedStanzaID) || '')
        };
      }
      function positiveInt(value, fallbackValue, max) {
        var n = Number(value);
        if (!isFinite(n) || n < 1) { n = fallbackValue; }
        n = Math.floor(n);
        return n > max ? max : n;
      }
      function storageGet(key) {
        try {
          if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage) {
            return globalThis.localStorage.getItem(key);
          }
        } catch (err) {
          return null;
        }
        return null;
      }
      function storageKeyAt(index) {
        try {
          if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage) {
            return globalThis.localStorage.key(index);
          }
        } catch (err) {
          return null;
        }
        return null;
      }
      function storageLength() {
        try {
          if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage) {
            return globalThis.localStorage.length || 0;
          }
        } catch (err) {
          return 0;
        }
        return 0;
      }
      function parseJson(value) {
        if (!value || typeof value !== 'string') { return null; }
        try { return JSON.parse(value); } catch (err) { return null; }
      }
      function supabaseStr(value) {
        return value === undefined || value === null ? '' : String(value);
      }
      function supabaseNum(value) {
        var n = Number(value);
        return isFinite(n) ? n : 0;
      }
      function supabaseBool(value, fallbackValue) {
        return value === undefined || value === null ? !!fallbackValue : value === true;
      }
      function supabaseList(value) {
        return Array.isArray(value) ? value : [];
      }
      function supabaseObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      }
      function supabaseSegment(value) {
        return encodeURIComponent(supabaseStr(value));
      }
      function supabaseQuery(params) {
        var parts = [];
        params = params || {};
        for (var key in params) {
          if (!Object.prototype.hasOwnProperty.call(params, key)) { continue; }
          var value = params[key];
          if (value === undefined || value === null || value === '') { continue; }
          parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
        }
        return parts.length ? '?' + parts.join('&') : '';
      }
      function supabaseAuth() {
        var raw = storageGet('supabase.dashboard.auth.token');
        var parsed = parseJson(raw);
        var accessToken = parsed && typeof parsed.access_token === 'string' ? parsed.access_token : '';
        var expiresAt = parsed && parsed.expires_at !== undefined ? Number(parsed.expires_at) : 0;
        if (!accessToken) { return null; }
        if (expiresAt && isFinite(expiresAt) && expiresAt <= Math.floor(Date.now() / 1000) + 30) {
          return null;
        }
        return { accessToken: accessToken };
      }
      async function supabaseApi(endpoint, query) {
        var auth = supabaseAuth();
        if (!auth) { return fallback('supabase-auth-token-unavailable'); }
        var response;
        try {
          response = await fetch('https://api.supabase.com/v1' + endpoint + supabaseQuery(query || {}), {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Authorization': 'Bearer ' + auth.accessToken
            },
            credentials: 'omit',
            redirect: 'manual'
          });
        } catch (_fetchErr) {
          return fallback('supabase-network-error');
        }
        if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403) {
          return fallback('supabase-auth-failed');
        }
        if (response.status === 429) { return fallback('supabase-rate-limited'); }
        if (!response.ok) { return fallback('supabase-http-status-' + response.status); }
        if (response.status === 204) { return { success: true, status: response.status, data: {} }; }
        var data = null;
        try {
          data = await response.json();
        } catch (_jsonErr) {
          return fallback('supabase-json-shape-mismatch');
        }
        return { success: true, status: response.status, data: data };
      }
      function supabaseMapProject(project) {
        project = supabaseObject(project);
        return {
          id: supabaseStr(project.id || project.ref),
          name: supabaseStr(project.name),
          organization_id: supabaseStr(project.organization_id),
          region: supabaseStr(project.region),
          status: supabaseStr(project.status),
          created_at: supabaseStr(project.created_at)
        };
      }
      function supabaseMapOrganization(org) {
        org = supabaseObject(org);
        return {
          id: supabaseStr(org.id),
          name: supabaseStr(org.name),
          slug: supabaseStr(org.slug || org.id)
        };
      }
      function supabaseMapFunction(fn) {
        fn = supabaseObject(fn);
        return {
          id: supabaseStr(fn.id),
          slug: supabaseStr(fn.slug),
          name: supabaseStr(fn.name),
          status: supabaseStr(fn.status),
          version: supabaseNum(fn.version),
          created_at: supabaseStr(fn.created_at),
          updated_at: supabaseStr(fn.updated_at),
          verify_jwt: supabaseBool(fn.verify_jwt, true)
        };
      }
      function supabaseMapSecret(secret) {
        secret = supabaseObject(secret);
        return {
          name: supabaseStr(secret.name),
          value: supabaseStr(secret.value)
        };
      }
      function supabaseMapBucket(bucket) {
        bucket = supabaseObject(bucket);
        return {
          id: supabaseStr(bucket.id),
          name: supabaseStr(bucket.name),
          public: supabaseBool(bucket.public, false),
          created_at: supabaseStr(bucket.created_at),
          updated_at: supabaseStr(bucket.updated_at)
        };
      }
      function supabaseMapMember(member) {
        member = supabaseObject(member);
        return {
          user_id: supabaseStr(member.user_id || member.gotrue_id),
          user_name: supabaseStr(member.user_name || member.username),
          email: supabaseStr(member.email || member.primary_email),
          role_name: supabaseStr(member.role_name)
        };
      }
      function supabaseMapMigration(migration) {
        migration = supabaseObject(migration);
        return {
          version: supabaseStr(migration.version),
          name: supabaseStr(migration.name),
          statements: Array.isArray(migration.statements) ? migration.statements.map(supabaseStr) : undefined
        };
      }
      function supabaseMapApiKey(key) {
        key = supabaseObject(key);
        return {
          name: supabaseStr(key.name),
          api_key: supabaseStr(key.api_key)
        };
      }
      function supabaseMapBackup(backup) {
        backup = supabaseObject(backup);
        return {
          id: supabaseNum(backup.id),
          status: supabaseStr(backup.status),
          inserted_at: supabaseStr(backup.inserted_at),
          is_physical_backup: supabaseBool(backup.is_physical_backup, false)
        };
      }
      function supabaseMapHealth(service) {
        service = supabaseObject(service);
        return {
          name: supabaseStr(service.name),
          status: supabaseStr(service.status)
        };
      }
      function supabaseAdvisorList(data) {
        if (Array.isArray(data)) { return data; }
        data = supabaseObject(data);
        return supabaseList(data.lints);
      }
      function supabaseLogsQuery(source) {
        var tableMap = {
          postgres: 'postgres_logs',
          auth: 'auth_logs',
          realtime: 'realtime_logs',
          storage: 'storage_logs',
          'edge-functions': 'edge_logs',
          postgrest: 'postgrest_logs'
        };
        var table = tableMap[supabaseStr(source)];
        if (!table) { return null; }
        return 'select id, timestamp, event_message from ' + table + ' order by timestamp desc limit 100';
      }
      async function supabaseRead(action, args) {
        args = args || {};
        var out;
        var data;
        if (action === 'list_projects') {
          out = await supabaseApi('/projects');
          if (!out || out.success !== true) { return out; }
          if (!Array.isArray(out.data)) { return fallback('supabase-projects-shape-mismatch'); }
          return { success: true, status: out.status, data: { projects: out.data.map(supabaseMapProject) } };
        }
        if (action === 'get_project') {
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref));
          if (!out || out.success !== true) { return out; }
          return { success: true, status: out.status, data: { project: supabaseMapProject(out.data) } };
        }
        if (action === 'get_project_health') {
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref) + '/health', {
            services: 'auth,realtime,rest,storage,db'
          });
          if (!out || out.success !== true) { return out; }
          if (!Array.isArray(out.data)) { return fallback('supabase-health-shape-mismatch'); }
          return { success: true, status: out.status, data: { services: out.data.map(supabaseMapHealth) } };
        }
        if (action === 'list_organizations') {
          out = await supabaseApi('/organizations');
          if (!out || out.success !== true) { return out; }
          if (!Array.isArray(out.data)) { return fallback('supabase-organizations-shape-mismatch'); }
          return { success: true, status: out.status, data: { organizations: out.data.map(supabaseMapOrganization) } };
        }
        if (action === 'get_organization') {
          out = await supabaseApi('/organizations/' + supabaseSegment(args.slug));
          if (!out || out.success !== true) { return out; }
          return { success: true, status: out.status, data: { organization: supabaseMapOrganization(out.data) } };
        }
        if (action === 'list_organization_members') {
          out = await supabaseApi('/organizations/' + supabaseSegment(args.slug) + '/members');
          if (!out || out.success !== true) { return out; }
          if (!Array.isArray(out.data)) { return fallback('supabase-members-shape-mismatch'); }
          return { success: true, status: out.status, data: { members: out.data.map(supabaseMapMember) } };
        }
        if (action === 'generate_types') {
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref) + '/types/typescript');
          if (!out || out.success !== true) { return out; }
          data = supabaseObject(out.data);
          return { success: true, status: out.status, data: { types: supabaseStr(data.types || (typeof out.data === 'string' ? out.data : '')) } };
        }
        if (action === 'list_migrations') {
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref) + '/database/migrations');
          if (!out || out.success !== true) { return out; }
          if (!Array.isArray(out.data)) { return fallback('supabase-migrations-shape-mismatch'); }
          return { success: true, status: out.status, data: { migrations: out.data.map(supabaseMapMigration) } };
        }
        if (action === 'list_backups') {
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref) + '/database/backups');
          if (!out || out.success !== true) { return out; }
          data = supabaseObject(out.data);
          return { success: true, status: out.status, data: { backups: supabaseList(data.backups).map(supabaseMapBackup) } };
        }
        if (action === 'list_functions') {
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref) + '/functions');
          if (!out || out.success !== true) { return out; }
          if (!Array.isArray(out.data)) { return fallback('supabase-functions-shape-mismatch'); }
          return { success: true, status: out.status, data: { functions: out.data.map(supabaseMapFunction) } };
        }
        if (action === 'get_function') {
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref) + '/functions/' + supabaseSegment(args.function_slug));
          if (!out || out.success !== true) { return out; }
          return { success: true, status: out.status, data: { function: supabaseMapFunction(out.data) } };
        }
        if (action === 'list_secrets') {
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref) + '/secrets');
          if (!out || out.success !== true) { return out; }
          if (!Array.isArray(out.data)) { return fallback('supabase-secrets-shape-mismatch'); }
          return { success: true, status: out.status, data: { secrets: out.data.map(supabaseMapSecret) } };
        }
        if (action === 'get_api_keys') {
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref) + '/api-keys');
          if (!out || out.success !== true) { return out; }
          if (!Array.isArray(out.data)) { return fallback('supabase-api-keys-shape-mismatch'); }
          return { success: true, status: out.status, data: { api_keys: out.data.map(supabaseMapApiKey) } };
        }
        if (action === 'list_buckets') {
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref) + '/storage/buckets');
          if (!out || out.success !== true) { return out; }
          if (!Array.isArray(out.data)) { return fallback('supabase-buckets-shape-mismatch'); }
          return { success: true, status: out.status, data: { buckets: out.data.map(supabaseMapBucket) } };
        }
        if (action === 'get_project_logs') {
          var sql = supabaseLogsQuery(args.source);
          if (!sql) { return fallback('supabase-log-source-unsupported'); }
          var end = new Date().toISOString();
          var start = new Date(Date.now() - 3600000).toISOString();
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref) + '/analytics/endpoints/logs.all', {
            iso_timestamp_start: start,
            iso_timestamp_end: end,
            sql: sql
          });
          if (!out || out.success !== true) { return out; }
          data = supabaseObject(out.data);
          return { success: true, status: out.status, data: { logs: supabaseList(data.result) } };
        }
        if (action === 'get_performance_advisors') {
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref) + '/advisors/performance');
          if (!out || out.success !== true) { return out; }
          return { success: true, status: out.status, data: { advisors: supabaseAdvisorList(out.data) } };
        }
        if (action === 'get_security_advisors') {
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref) + '/advisors/security');
          if (!out || out.success !== true) { return out; }
          return { success: true, status: out.status, data: { advisors: supabaseAdvisorList(out.data) } };
        }
        if (action === 'get_postgrest_config') {
          out = await supabaseApi('/projects/' + supabaseSegment(args.ref) + '/postgrest');
          if (!out || out.success !== true) { return out; }
          return { success: true, status: out.status, data: { config: supabaseObject(out.data) } };
        }
        if (action === 'list_sql_snippets') {
          out = await supabaseApi('/snippets');
          if (!out || out.success !== true) { return out; }
          data = supabaseObject(out.data);
          var items = Array.isArray(out.data) ? out.data : supabaseList(data.data);
          return { success: true, status: out.status, data: { snippets: items.map(function(snippet) {
            snippet = supabaseObject(snippet);
            return {
              id: supabaseStr(snippet.id),
              name: supabaseStr(snippet.name),
              description: supabaseStr(snippet.description),
              visibility: supabaseStr(snippet.visibility),
              project_id: supabaseStr(snippet.project_id || (supabaseObject(snippet.project).id))
            };
          }) } };
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-supabase-page-read-action' });
      }
      function gcloudStr(value) {
        return value === undefined || value === null ? '' : String(value);
      }
      function gcloudList(value) {
        return Array.isArray(value) ? value : [];
      }
      function gcloudObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      }
      function gcloudProjectFromUrl() {
        try {
          var href = globalThis.location && globalThis.location.href ? String(globalThis.location.href) : '';
          return href ? (new URL(href)).searchParams.get('project') || '' : '';
        } catch (_urlErr) {
          return '';
        }
      }
      function gcloudProjectId(args) {
        var projectId = gcloudStr(args && args.project_id) || gcloudProjectFromUrl();
        return projectId ? { success: true, projectId: projectId } : fallback('gcloud-project-id-unavailable');
      }
      function gcloudClient() {
        try {
          var root = globalThis.gapi;
          var client = root && root.client;
          return client && typeof client.request === 'function' ? client : null;
        } catch (_clientErr) {
          return null;
        }
      }
      function gcloudCleanParams(params) {
        var out = {};
        var p = params || {};
        for (var key in p) {
          if (!Object.prototype.hasOwnProperty.call(p, key)) { continue; }
          if (p[key] !== undefined && p[key] !== null && p[key] !== '') { out[key] = p[key]; }
        }
        return Object.keys(out).length ? out : undefined;
      }
      function gcloudErrorReason(err) {
        var status = Number(err && err.status);
        if (status === 401 || status === 403) { return 'gcloud-auth-failed'; }
        if (status === 404) { return 'gcloud-not-found'; }
        if (status === 429) { return 'gcloud-rate-limited'; }
        if (status === 0) { return 'gcloud-request-timeout'; }
        return status ? 'gcloud-api-status-' + status : 'gcloud-api-error';
      }
      async function gcloudRequest(path, options) {
        var client = gcloudClient();
        if (!client) { return fallback('gcloud-gapi-client-unavailable'); }
        options = options || {};
        try {
          var response = await new Promise(function(resolve, reject) {
            var timeout = setTimeout(function() {
              reject({ status: 0 });
            }, 25000);
            client.request({
              path: path,
              method: options.method || 'GET',
              params: gcloudCleanParams(options.params),
              body: options.body
            }).then(function(result) {
              clearTimeout(timeout);
              resolve(result || {});
            }, function(err) {
              clearTimeout(timeout);
              reject(err);
            });
          });
          var data = response && response.result !== undefined ? response.result : response;
          if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) {
            return fallback('gcloud-api-shape-mismatch');
          }
          return { success: true, status: Number(response.status || 200), data: data };
        } catch (err) {
          return fallback(gcloudErrorReason(err));
        }
      }
      function gcloudListResponse(result, sourceKey, outputKey) {
        if (!result || result.success !== true) { return result; }
        var data = gcloudObject(result.data);
        if (data[sourceKey] !== undefined && !Array.isArray(data[sourceKey])) {
          return fallback('gcloud-api-shape-mismatch');
        }
        var out = {};
        out[outputKey] = gcloudList(data[sourceKey]);
        out.next_page_token = gcloudStr(data.nextPageToken);
        return { success: true, status: result.status, data: out };
      }
      function gcloudObjectResponse(result, outputKey) {
        if (!result || result.success !== true) { return result; }
        var data = gcloudObject(result.data);
        if (!Object.keys(data).length) { return fallback('gcloud-api-shape-mismatch'); }
        var out = {};
        out[outputKey] = data;
        return { success: true, status: result.status, data: out };
      }
      function gcloudAggregatedResponse(result, sourceKey, outputKey) {
        if (!result || result.success !== true) { return result; }
        var data = gcloudObject(result.data);
        var items = gcloudObject(data.items);
        var outList = [];
        for (var zone in items) {
          if (!Object.prototype.hasOwnProperty.call(items, zone)) { continue; }
          var entry = gcloudObject(items[zone]);
          if (entry[sourceKey] !== undefined && !Array.isArray(entry[sourceKey])) {
            return fallback('gcloud-api-shape-mismatch');
          }
          outList = outList.concat(gcloudList(entry[sourceKey]));
        }
        var out = {};
        out[outputKey] = outList;
        out.next_page_token = gcloudStr(data.nextPageToken);
        return { success: true, status: result.status, data: out };
      }
      function gcloudCurrentProject() {
        var projectId = gcloudProjectFromUrl();
        return projectId
          ? { success: true, status: 200, data: { project_id: projectId } }
          : fallback('gcloud-project-id-unavailable');
      }
      async function gcloudRead(action, args) {
        args = args || {};
        var project;
        var result;

        if (action === 'get_current_project') {
          return gcloudCurrentProject();
        }
        if (action === 'list_projects') {
          result = await gcloudRequest('https://cloudresourcemanager.googleapis.com/v1/projects', {
            params: { pageSize: args.page_size || 50, pageToken: args.page_token }
          });
          return gcloudListResponse(result, 'projects', 'projects');
        }
        if (action === 'get_project') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://cloudresourcemanager.googleapis.com/v3/projects/' + encodeURIComponent(project.projectId));
          return gcloudObjectResponse(result, 'project');
        }
        if (action === 'list_billing_accounts') {
          result = await gcloudRequest('https://cloudbilling.googleapis.com/v1/billingAccounts', {
            params: { pageSize: args.page_size || 50, pageToken: args.page_token }
          });
          return gcloudListResponse(result, 'billingAccounts', 'billing_accounts');
        }
        if (action === 'get_billing_info') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://cloudbilling.googleapis.com/v1/projects/' + encodeURIComponent(project.projectId) + '/billingInfo');
          return gcloudObjectResponse(result, 'billing_info');
        }
        if (action === 'list_buckets') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://storage.googleapis.com/storage/v1/b', {
            params: { project: project.projectId, maxResults: args.max_results || 50, pageToken: args.page_token }
          });
          return gcloudListResponse(result, 'items', 'buckets');
        }
        if (action === 'get_bucket') {
          result = await gcloudRequest('https://storage.googleapis.com/storage/v1/b/' + encodeURIComponent(gcloudStr(args.bucket_name)));
          return gcloudObjectResponse(result, 'bucket');
        }
        if (action === 'list_objects') {
          result = await gcloudRequest('https://storage.googleapis.com/storage/v1/b/' + encodeURIComponent(gcloudStr(args.bucket_name)) + '/o', {
            params: {
              prefix: args.prefix,
              delimiter: args.delimiter,
              maxResults: args.max_results || 50,
              pageToken: args.page_token
            }
          });
          if (!result || result.success !== true) { return result; }
          var objectData = gcloudObject(result.data);
          if (objectData.items !== undefined && !Array.isArray(objectData.items)) { return fallback('gcloud-api-shape-mismatch'); }
          return { success: true, status: result.status, data: {
            objects: gcloudList(objectData.items),
            prefixes: gcloudList(objectData.prefixes),
            next_page_token: gcloudStr(objectData.nextPageToken)
          } };
        }
        if (action === 'list_instances') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          if (args.zone) {
            result = await gcloudRequest('https://compute.googleapis.com/compute/v1/projects/' + encodeURIComponent(project.projectId) + '/zones/' + encodeURIComponent(gcloudStr(args.zone)) + '/instances', {
              params: { maxResults: args.max_results || 50, pageToken: args.page_token }
            });
            return gcloudListResponse(result, 'items', 'instances');
          }
          result = await gcloudRequest('https://compute.googleapis.com/compute/v1/projects/' + encodeURIComponent(project.projectId) + '/aggregated/instances', {
            params: { maxResults: args.max_results || 50, pageToken: args.page_token }
          });
          return gcloudAggregatedResponse(result, 'instances', 'instances');
        }
        if (action === 'get_instance') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://compute.googleapis.com/compute/v1/projects/' + encodeURIComponent(project.projectId) + '/zones/' + encodeURIComponent(gcloudStr(args.zone)) + '/instances/' + encodeURIComponent(gcloudStr(args.instance_name)));
          return gcloudObjectResponse(result, 'instance');
        }
        if (action === 'list_disks') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          if (args.zone) {
            result = await gcloudRequest('https://compute.googleapis.com/compute/v1/projects/' + encodeURIComponent(project.projectId) + '/zones/' + encodeURIComponent(gcloudStr(args.zone)) + '/disks', {
              params: { maxResults: args.max_results || 50, pageToken: args.page_token }
            });
            return gcloudListResponse(result, 'items', 'disks');
          }
          result = await gcloudRequest('https://compute.googleapis.com/compute/v1/projects/' + encodeURIComponent(project.projectId) + '/aggregated/disks', {
            params: { maxResults: args.max_results || 50, pageToken: args.page_token }
          });
          return gcloudAggregatedResponse(result, 'disks', 'disks');
        }
        if (action === 'list_networks') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://compute.googleapis.com/compute/v1/projects/' + encodeURIComponent(project.projectId) + '/global/networks', {
            params: { maxResults: args.max_results || 50, pageToken: args.page_token }
          });
          return gcloudListResponse(result, 'items', 'networks');
        }
        if (action === 'list_firewalls') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://compute.googleapis.com/compute/v1/projects/' + encodeURIComponent(project.projectId) + '/global/firewalls', {
            params: { maxResults: args.max_results || 50, pageToken: args.page_token }
          });
          return gcloudListResponse(result, 'items', 'firewalls');
        }
        if (action === 'list_service_accounts') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://iam.googleapis.com/v1/projects/' + encodeURIComponent(project.projectId) + '/serviceAccounts', {
            params: { pageSize: args.page_size || 50, pageToken: args.page_token }
          });
          return gcloudListResponse(result, 'accounts', 'service_accounts');
        }
        if (action === 'list_iam_roles') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://iam.googleapis.com/v1/projects/' + encodeURIComponent(project.projectId) + '/roles', {
            params: { pageSize: args.page_size || 50, pageToken: args.page_token }
          });
          return gcloudListResponse(result, 'roles', 'roles');
        }
        if (action === 'list_enabled_services') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://serviceusage.googleapis.com/v1/projects/' + encodeURIComponent(project.projectId) + '/services', {
            params: { pageSize: args.page_size || 50, pageToken: args.page_token, filter: 'state:ENABLED' }
          });
          return gcloudListResponse(result, 'services', 'services');
        }
        if (action === 'list_functions') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://cloudfunctions.googleapis.com/v2/projects/' + encodeURIComponent(project.projectId) + '/locations/-/functions', {
            params: { pageSize: args.page_size || 50, pageToken: args.page_token }
          });
          return gcloudListResponse(result, 'functions', 'functions');
        }
        if (action === 'get_function') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://cloudfunctions.googleapis.com/v2/projects/' + encodeURIComponent(project.projectId) + '/locations/' + encodeURIComponent(gcloudStr(args.location)) + '/functions/' + encodeURIComponent(gcloudStr(args.function_name)));
          return gcloudObjectResponse(result, 'function');
        }
        if (action === 'list_cloud_run_services') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://run.googleapis.com/v2/projects/' + encodeURIComponent(project.projectId) + '/locations/-/services', {
            params: { pageSize: args.page_size || 50, pageToken: args.page_token }
          });
          return gcloudListResponse(result, 'services', 'services');
        }
        if (action === 'get_cloud_run_service') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://run.googleapis.com/v2/projects/' + encodeURIComponent(project.projectId) + '/locations/' + encodeURIComponent(gcloudStr(args.location)) + '/services/' + encodeURIComponent(gcloudStr(args.service_name)));
          return gcloudObjectResponse(result, 'service');
        }
        if (action === 'list_clusters') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://container.googleapis.com/v1/projects/' + encodeURIComponent(project.projectId) + '/locations/-/clusters');
          return gcloudListResponse(result, 'clusters', 'clusters');
        }
        if (action === 'get_cluster') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://container.googleapis.com/v1/projects/' + encodeURIComponent(project.projectId) + '/locations/' + encodeURIComponent(gcloudStr(args.location)) + '/clusters/' + encodeURIComponent(gcloudStr(args.cluster_name)));
          return gcloudObjectResponse(result, 'cluster');
        }
        if (action === 'list_sql_instances') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://sqladmin.googleapis.com/v1/projects/' + encodeURIComponent(project.projectId) + '/instances', {
            params: { maxResults: args.max_results || 50, pageToken: args.page_token }
          });
          return gcloudListResponse(result, 'items', 'instances');
        }
        if (action === 'get_sql_instance') {
          project = gcloudProjectId(args);
          if (!project || project.success !== true) { return project; }
          result = await gcloudRequest('https://sqladmin.googleapis.com/v1/projects/' + encodeURIComponent(project.projectId) + '/instances/' + encodeURIComponent(gcloudStr(args.instance_name)));
          return gcloudObjectResponse(result, 'instance');
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-gcloud-page-read-action' });
      }
      function usablePowerpointToken(value) {
        if (!value || typeof value !== 'object') { return ''; }
        var token = typeof value.token === 'string' ? value.token : '';
        var exp = typeof value.exp === 'number' ? value.exp : Number(value.exp || 0);
        if (!token || token.length < 16) { return ''; }
        if (!isFinite(exp) || exp <= Math.floor(Date.now() / 1000) + 30) { return ''; }
        return token;
      }
      function getPowerpointPreScriptValue(key) {
        try {
          var ns = globalThis.__openTabs
            && globalThis.__openTabs.preScript
            && globalThis.__openTabs.preScript.powerpoint;
          return ns ? ns[key] : undefined;
        } catch (err) {
          return undefined;
        }
      }
      function readPowerpointGraphToken() {
        var fromNamespace = usablePowerpointToken(getPowerpointPreScriptValue('graph'));
        if (fromNamespace) { return fromNamespace; }

        var mirrored = usablePowerpointToken(parseJson(storageGet('__opentabs_powerpoint_graph_token')));
        if (mirrored) { return mirrored; }

        for (var i = 0; i < storageLength(); i++) {
          var key = storageKeyAt(i);
          if (!key || key.indexOf('accesstoken') === -1
              || key.indexOf('graph.microsoft.com') === -1
              || key.indexOf('2821b473-fe24-4c86-ba16-62834d6e80c3') === -1) {
            continue;
          }
          var data = parseJson(storageGet(key));
          var secret = data && typeof data.secret === 'string' ? data.secret : '';
          var expiresOn = data ? Number.parseInt(String(data.expiresOn || '0'), 10) : 0;
          if (secret && secret.length >= 16 && expiresOn > Math.floor(Date.now() / 1000) + 30) {
            return secret;
          }
        }
        return '';
      }
      function getWordPreScriptValue(key) {
        try {
          var ns = globalThis.__openTabs
            && globalThis.__openTabs.preScript
            && globalThis.__openTabs.preScript['microsoft-word'];
          return ns ? ns[key] : undefined;
        } catch (err) {
          return undefined;
        }
      }
      function readWordGraphToken() {
        var fromNamespace = usablePowerpointToken(getWordPreScriptValue('graph'));
        if (fromNamespace) { return fromNamespace; }

        var mirrored = usablePowerpointToken(parseJson(storageGet('__opentabs_word_graph_token')));
        if (mirrored) { return mirrored; }

        for (var i = 0; i < storageLength(); i++) {
          var key = storageKeyAt(i);
          if (!key || key.indexOf('accesstoken') === -1
              || key.indexOf('graph.microsoft.com') === -1
              || key.indexOf('2821b473-fe24-4c86-ba16-62834d6e80c3') === -1) {
            continue;
          }
          var data = parseJson(storageGet(key));
          var secret = data && typeof data.secret === 'string' ? data.secret : '';
          var expiresOn = data ? Number.parseInt(String(data.expiresOn || '0'), 10) : 0;
          if (secret && secret.length >= 16 && expiresOn > Math.floor(Date.now() / 1000) + 30) {
            return secret;
          }
        }
        return '';
      }
      function readWordDocumentContext() {
        var href = '';
        try {
          href = globalThis.location && globalThis.location.href ? String(globalThis.location.href) : '';
          var url = new URL(href);
          var driveId = url.searchParams.get('driveId') || '';
          var itemId = url.searchParams.get('docId') || url.searchParams.get('itemId') || '';
          var isSharePointDocument = url.hostname.toLowerCase().slice(-15) === '.sharepoint.com'
            && url.pathname.indexOf('/:w:/') !== -1;
          return {
            drive_id: driveId,
            item_id: itemId,
            sharing_url: (!driveId || !itemId) && isSharePointDocument ? href : ''
          };
        } catch (err) {
          return { drive_id: '', item_id: '', sharing_url: '' };
        }
      }
      function wordRead(action) {
        if (action !== 'auth_context') {
          return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-microsoft-word-page-read-action' });
        }
        var graphToken = readWordGraphToken();
        if (!graphToken) { return fallback('msword-graph-token-unavailable'); }
        var doc = readWordDocumentContext();
        return { success: true, status: 200, data: {
          graph_token: graphToken,
          drive_id: doc.drive_id,
          item_id: doc.item_id,
          sharing_url: doc.sharing_url
        } };
      }
      function pageGlobalPath(path) {
        try {
          var cur = globalThis;
          var parts = String(path || '').split('.');
          for (var i = 0; i < parts.length; i++) {
            if (!cur || typeof cur !== 'object') { return undefined; }
            cur = cur[parts[i]];
          }
          return cur;
        } catch (err) {
          return undefined;
        }
      }
      var GA_SUITE_BASE = 'https://analyticssuitefrontend-pa.clients6.google.com';
      var GA_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';
      function gaString(value) {
        return value === undefined || value === null ? '' : String(value);
      }
      function gaArray(value) {
        return Array.isArray(value) ? value : [];
      }
      function gaObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      }
      function gaGapiClient() {
        var gapi = pageGlobalPath('gapi');
        return gapi && gapi.client ? gapi.client : null;
      }
      function gaGapiFailure(err) {
        var obj = gaObject(err);
        var result = gaObject(obj.result);
        var error = gaObject(result.error);
        var status = Number(obj.status || error.code || 0);
        if (status === 401 || status === 403) { return fallback('ganalytics-gapi-auth-failed'); }
        if (status === 404) { return fallback('ganalytics-gapi-not-found'); }
        if (status === 400) { return fallback('ganalytics-gapi-validation-error'); }
        if (status === 429) { return fallback('ganalytics-gapi-rate-limited'); }
        return fallback('ganalytics-gapi-request-failed');
      }
      function gaGapiRequest(path, body) {
        var client = gaGapiClient();
        if (!client || typeof client.request !== 'function') {
          return Promise.resolve(fallback('ganalytics-gapi-client-unavailable'));
        }
        var params = {};
        var key = pageGlobalPath('preload.globals.gmsSuiteApiKey');
        if (typeof key === 'string' && key) { params.key = key; }
        return new Promise(function(resolve) {
          var settled = false;
          function done(value) {
            if (settled) { return; }
            settled = true;
            clearTimeout(timer);
            resolve(value);
          }
          var timer = setTimeout(function() {
            done(fallback('ganalytics-gapi-timeout'));
          }, 30000);
          try {
            var req = client.request({
              path: path,
              method: body ? 'POST' : 'GET',
              params: params,
              body: body ? JSON.stringify(body) : undefined,
              headers: body ? { 'Content-Type': 'application/json' } : {}
            });
            if (!req || typeof req.then !== 'function') {
              done(fallback('ganalytics-gapi-request-unavailable'));
              return;
            }
            req.then(function(resp) {
              done({
                success: true,
                status: Number((resp && resp.status) || 200),
                data: (resp && resp.result) || {}
              });
            }, function(err) {
              done(gaGapiFailure(err));
            });
          } catch (_requestErr) {
            done(fallback('ganalytics-gapi-request-failed'));
          }
        });
      }
      function gaSuiteApi(endpoint, body) {
        return gaGapiRequest(GA_SUITE_BASE + endpoint, body || {});
      }
      function gaDataApi(endpoint, body) {
        return gaGapiRequest(GA_DATA_BASE + endpoint, body);
      }
      function gaActivePropertyId() {
        var hash = '';
        try { hash = globalThis.location && globalThis.location.hash ? String(globalThis.location.hash) : ''; } catch (_hashErr) { hash = ''; }
        var match = hash.match(/p(\d+)/);
        return match && match[1] && match[1] !== '0' ? match[1] : '';
      }
      function gaCurrentUser() {
        var tree = gaObject(pageGlobalPath('preload.accountTree'));
        var accounts = gaArray(tree.accounts).map(function(account) {
          return {
            id: gaString(account && account.id),
            name: gaString(account && account.name)
          };
        });
        return { success: true, status: 200, data: {
          user_id: gaString(pageGlobalPath('preload.obfuscatedUserId')),
          account_count: accounts.length,
          accounts: accounts
        } };
      }
      function gaMapAccount(header) {
        header = gaObject(header);
        var meta = gaObject(header.accountMeta);
        return {
          id: gaString(header.id),
          name: gaString(header.name),
          entity_id: gaString(header.entityId),
          status: gaString(meta.accountStatus)
        };
      }
      function gaMapProperty(header) {
        header = gaObject(header);
        var meta = gaObject(header.propertyMeta);
        return {
          id: gaString(header.id),
          name: gaString(header.name),
          property_id: gaString(meta.propertyId),
          account_id: gaString(header.parentId),
          service_level: gaString(meta.serviceLevel)
        };
      }
      async function gaListAccounts() {
        var accounts = [];
        var propertyMap = {};
        var pageToken = '';
        var guard = 0;
        do {
          var out = await gaSuiteApi('/v1/search/gaEntityHeadersPaged', {
            personalOnly: false,
            pageOptions: { pageToken: { token: pageToken } }
          });
          if (!out || out.success !== true) { return out; }
          var data = gaObject(out.data);
          var headers = gaArray(data.header);
          for (var i = 0; i < headers.length; i++) {
            var header = gaObject(headers[i]);
            if (header.type === 'GA_ACCOUNT') {
              var mappedAccount = gaMapAccount(header);
              mappedAccount.properties = [];
              accounts.push(mappedAccount);
            } else if (header.type === 'GA_PROPERTY') {
              var mappedProperty = gaMapProperty(header);
              var parentId = mappedProperty.account_id;
              if (!propertyMap[parentId]) { propertyMap[parentId] = []; }
              propertyMap[parentId].push(mappedProperty);
            }
          }
          pageToken = gaString(data.nextPageToken);
          guard++;
        } while (pageToken && guard < 20);
        for (var a = 0; a < accounts.length; a++) {
          accounts[a].properties = propertyMap[accounts[a].id] || [];
        }
        return { success: true, status: 200, data: { accounts: accounts } };
      }
      function gaMapDimensionMetadata(d) {
        d = gaObject(d);
        return {
          api_name: gaString(d.apiName),
          ui_name: gaString(d.uiName),
          description: gaString(d.description),
          category: gaString(d.category)
        };
      }
      function gaMapMetricMetadata(m) {
        m = gaObject(m);
        return {
          api_name: gaString(m.apiName),
          ui_name: gaString(m.uiName),
          description: gaString(m.description),
          category: gaString(m.category),
          type: gaString(m.type)
        };
      }
      async function gaGetMetadata(args) {
        var out = await gaDataApi('/properties/' + encodeURIComponent(gaString(args.property_id)) + '/metadata');
        if (!out || out.success !== true) { return out; }
        var data = gaObject(out.data);
        var dimensions = gaArray(data.dimensions).map(gaMapDimensionMetadata);
        var metrics = gaArray(data.metrics).map(gaMapMetricMetadata);
        if (args.category) {
          dimensions = dimensions.filter(function(d) { return d.category === args.category; });
          metrics = metrics.filter(function(m) { return m.category === args.category; });
        }
        return { success: true, status: out.status, data: {
          dimensions: dimensions,
          metrics: metrics,
          dimension_count: dimensions.length,
          metric_count: metrics.length
        } };
      }
      function gaMapReportHeader(header) {
        return { name: gaString(header && header.name) };
      }
      function gaMapReportRow(row) {
        row = gaObject(row);
        return {
          dimensions: gaArray(row.dimensionValues).map(function(item) { return gaString(item && item.value); }),
          metrics: gaArray(row.metricValues).map(function(item) { return gaString(item && item.value); })
        };
      }
      function gaReportResult(data, includeMetadata) {
        data = gaObject(data);
        var meta = gaObject(data.metadata);
        var result = {
          dimension_headers: gaArray(data.dimensionHeaders).map(gaMapReportHeader),
          metric_headers: gaArray(data.metricHeaders).map(gaMapReportHeader),
          rows: gaArray(data.rows).map(gaMapReportRow),
          row_count: Number(data.rowCount || 0)
        };
        if (includeMetadata) {
          result.currency_code = gaString(meta.currencyCode);
          result.time_zone = gaString(meta.timeZone);
        }
        return result;
      }
      function gaParseJsonField(value, reason) {
        if (value === undefined || value === null || value === '') {
          return { ok: true, present: false, value: undefined };
        }
        try {
          return { ok: true, present: true, value: JSON.parse(String(value)) };
        } catch (_jsonErr) {
          return { ok: false, error: fallback(reason) };
        }
      }
      function gaReportBody(args, realtime) {
        args = args || {};
        var body = {
          metrics: gaArray(args.metrics).map(function(name) { return { name: gaString(name) }; }),
          limit: String(positiveInt(args.limit, 100, 10000))
        };
        if (!realtime) {
          body.dateRanges = [{ startDate: gaString(args.start_date), endDate: gaString(args.end_date) }];
        }
        if (gaArray(args.dimensions).length) {
          body.dimensions = gaArray(args.dimensions).map(function(name) { return { name: gaString(name) }; });
        }
        if (args.offset !== undefined && !realtime) { body.offset = String(args.offset); }
        var dimensionFilter = gaParseJsonField(args.dimension_filter, 'ganalytics-dimension-filter-invalid-json');
        if (!dimensionFilter.ok) { return dimensionFilter; }
        if (dimensionFilter.present) { body.dimensionFilter = dimensionFilter.value; }
        var metricFilter = gaParseJsonField(args.metric_filter, 'ganalytics-metric-filter-invalid-json');
        if (!metricFilter.ok) { return metricFilter; }
        if (metricFilter.present) { body.metricFilter = metricFilter.value; }
        if (!realtime) {
          var orderBy = gaParseJsonField(args.order_by, 'ganalytics-order-by-invalid-json');
          if (!orderBy.ok) { return orderBy; }
          if (orderBy.present) { body.orderBys = orderBy.value; }
        }
        return { ok: true, body: body };
      }
      function gaMapCompatibility(item, key) {
        item = gaObject(item);
        var meta = gaObject(item[key]);
        return {
          compatible: item.compatibility === 'COMPATIBLE',
          api_name: gaString(meta.apiName)
        };
      }
      async function gaCheckCompatibility(args) {
        var body = {};
        if (gaArray(args.dimensions).length) {
          body.dimensions = gaArray(args.dimensions).map(function(name) { return { name: gaString(name) }; });
        }
        if (gaArray(args.metrics).length) {
          body.metrics = gaArray(args.metrics).map(function(name) { return { name: gaString(name) }; });
        }
        var out = await gaDataApi('/properties/' + encodeURIComponent(gaString(args.property_id)) + ':checkCompatibility', body);
        if (!out || out.success !== true) { return out; }
        var data = gaObject(out.data);
        return { success: true, status: out.status, data: {
          compatible_dimensions: gaArray(data.dimensionCompatibilities).map(function(item) {
            return gaMapCompatibility(item, 'dimensionMetadata');
          }),
          compatible_metrics: gaArray(data.metricCompatibilities).map(function(item) {
            return gaMapCompatibility(item, 'metricMetadata');
          })
        } };
      }
      async function gaRead(action, args) {
        args = args || {};
        if (action === 'get_current_user') { return gaCurrentUser(); }
        if (action === 'get_active_property') {
          var hash = '';
          try { hash = globalThis.location && globalThis.location.hash ? String(globalThis.location.hash) : ''; } catch (_hashErr) { hash = ''; }
          return { success: true, status: 200, data: { property_id: gaActivePropertyId(), url_hash: hash } };
        }
        if (action === 'list_accounts') { return gaListAccounts(); }
        if (action === 'get_metadata') { return gaGetMetadata(args); }
        if (action === 'check_compatibility') { return gaCheckCompatibility(args); }
        if (action === 'run_report') {
          var reportBody = gaReportBody(args, false);
          if (!reportBody.ok) { return reportBody.error; }
          var report = await gaDataApi('/properties/' + encodeURIComponent(gaString(args.property_id)) + ':runReport', reportBody.body);
          return report && report.success === true
            ? { success: true, status: report.status, data: gaReportResult(report.data, true) }
            : report;
        }
        if (action === 'run_realtime_report') {
          var realtimeBody = gaReportBody(args, true);
          if (!realtimeBody.ok) { return realtimeBody.error; }
          var realtime = await gaDataApi('/properties/' + encodeURIComponent(gaString(args.property_id)) + ':runRealtimeReport', realtimeBody.body);
          return realtime && realtime.success === true
            ? { success: true, status: realtime.status, data: gaReportResult(realtime.data, false) }
            : realtime;
        }
        if (action === 'run_batch_report') {
          var requests = gaArray(args.reports).map(function(reportRequest) {
            reportRequest = gaObject(reportRequest);
            var request = {
              dateRanges: [{ startDate: gaString(reportRequest.start_date), endDate: gaString(reportRequest.end_date) }],
              metrics: gaArray(reportRequest.metrics).map(function(name) { return { name: gaString(name) }; }),
              limit: String(positiveInt(reportRequest.limit, 100, 10000))
            };
            if (gaArray(reportRequest.dimensions).length) {
              request.dimensions = gaArray(reportRequest.dimensions).map(function(name) { return { name: gaString(name) }; });
            }
            return request;
          });
          var batch = await gaDataApi('/properties/' + encodeURIComponent(gaString(args.property_id)) + ':batchRunReports', {
            requests: requests
          });
          if (!batch || batch.success !== true) { return batch; }
          return { success: true, status: batch.status, data: {
            reports: gaArray(gaObject(batch.data).reports).map(function(item) { return gaReportResult(item, false); })
          } };
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-ganalytics-page-read-action' });
      }
      function readPowerpointDriveId() {
        try {
          var href = globalThis.location && globalThis.location.href ? globalThis.location.href : '';
          var fromUrl = href ? new URL(href).searchParams.get('driveId') : '';
          if (fromUrl) { return fromUrl; }
        } catch (err) {
          // Continue to page-state fallbacks.
        }

        var wopiDriveId = pageGlobalPath('_wopiContextJson.DriveId');
        if (typeof wopiDriveId === 'string' && wopiDriveId) { return wopiDriveId; }

        var activeAccount = storageGet('msal.2821b473-fe24-4c86-ba16-62834d6e80c3.active-account');
        var match = activeAccount
          ? activeAccount.match(/00000000-0000-0000-([0-9a-f]{4}-[0-9a-f]{12})/i)
          : null;
        return match && match[1] ? match[1].replace(/-/g, '').toUpperCase() : '';
      }
      function readPowerpointItemId() {
        var itemId = pageGlobalPath('_wopiContextJson.DriveItemId');
        return typeof itemId === 'string' ? itemId : '';
      }
      function powerpointRead(action) {
        if (action !== 'auth_context') {
          return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-powerpoint-page-read-action' });
        }
        var graphToken = readPowerpointGraphToken();
        if (!graphToken) { return fallback('powerpoint-graph-token-unavailable'); }
        var driveId = readPowerpointDriveId();
        if (!driveId) { return fallback('powerpoint-drive-id-unavailable'); }
        return { success: true, status: 200, data: {
          graph_token: graphToken,
          drive_id: driveId,
          item_id: readPowerpointItemId()
        } };
      }
      function scopeClaimHasHost(target, host) {
        var scopes = String(target || '').split(/\s+/);
        for (var i = 0; i < scopes.length; i++) {
          if (!scopes[i]) { continue; }
          try {
            if (new URL(scopes[i]).hostname.toLowerCase() === host) { return true; }
          } catch (err) {
            // Non-URL scopes such as openid/profile/email are not API grants.
          }
        }
        return false;
      }
      function pushOutlookToken(out, seen, token, expiresOn) {
        var exp = Number(expiresOn || 0);
        if (!token || typeof token !== 'string' || token.length < 16) { return; }
        if (!isFinite(exp) || exp <= Math.floor(Date.now() / 1000) + 30) { return; }
        if (seen[token]) { return; }
        seen[token] = true;
        out.push(token);
      }
      function collectOutlookModernTokens(version, clientId, out, seen) {
        var tokenKeysRaw = storageGet('msal.' + version + '.token.keys.' + clientId);
        var tokenKeys = parseJson(tokenKeysRaw);
        var keys = tokenKeys && Array.isArray(tokenKeys.accessToken) ? tokenKeys.accessToken : [];
        for (var i = 0; i < keys.length; i++) {
          var raw = parseJson(storageGet(keys[i]));
          if (!raw || typeof raw.secret !== 'string') { continue; }
          if (!scopeClaimHasHost(raw.target || '', 'graph.microsoft.com')) { continue; }
          pushOutlookToken(out, seen, raw.secret, raw.expiresOn);
        }
      }
      function collectOutlookV1Tokens(clientId, out, seen) {
        var tokenKeysRaw = storageGet('msal.token.keys.' + clientId);
        var tokenKeys = parseJson(tokenKeysRaw);
        var keys = tokenKeys && Array.isArray(tokenKeys.accessToken) ? tokenKeys.accessToken : [];
        for (var i = 0; i < keys.length; i++) {
          if (String(keys[i] || '').indexOf('graph.microsoft.com') === -1) { continue; }
          var raw = parseJson(storageGet(keys[i]));
          if (!raw || typeof raw.secret !== 'string') { continue; }
          pushOutlookToken(out, seen, raw.secret, raw.expiresOn);
        }
      }
      function findAllMsalClientIds(prefix) {
        var ids = [];
        for (var i = 0; i < storageLength(); i++) {
          var key = storageKeyAt(i);
          if (key && key.indexOf(prefix) === 0) { ids.push(key.slice(prefix.length)); }
        }
        return ids;
      }
      function findOutlookGraphTokens() {
        var out = [];
        var seen = {};
        var enterprise = '9199bf20-a13f-4107-85dc-02114787ef48';
        var consumer = '2821b473-fe24-4c86-ba16-62834d6e80c3';
        collectOutlookModernTokens('3', enterprise, out, seen);
        collectOutlookModernTokens('2', enterprise, out, seen);
        collectOutlookV1Tokens(consumer, out, seen);
        var versions = ['3', '2'];
        for (var v = 0; v < versions.length; v++) {
          var ids = findAllMsalClientIds('msal.' + versions[v] + '.token.keys.');
          for (var j = 0; j < ids.length; j++) {
            if (ids[j] !== enterprise) {
              collectOutlookModernTokens(versions[v], ids[j], out, seen);
            }
          }
        }
        var v1Ids = findAllMsalClientIds('msal.token.keys.');
        for (var k = 0; k < v1Ids.length; k++) {
          if (v1Ids[k] !== consumer) { collectOutlookV1Tokens(v1Ids[k], out, seen); }
        }
        return out;
      }
      function outlookRead(action) {
        if (action !== 'auth_context') {
          return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-outlook-page-read-action' });
        }
        var graphTokens = findOutlookGraphTokens();
        if (!graphTokens.length) { return fallback('outlook-graph-token-unavailable'); }
        return { success: true, status: 200, data: {
          graph_tokens: graphTokens
        } };
      }
      function teamsRead(action) {
        if (action !== 'auth_context') {
          return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-teams-page-read-action' });
        }
        var graphTokens = findOutlookGraphTokens();
        if (!graphTokens.length) { return fallback('teams-graph-token-unavailable'); }
        return { success: true, status: 200, data: {
          graph_tokens: graphTokens
        } };
      }
      function findOneNoteGraphToken() {
        var out = [];
        var seen = {};
        var clientId = '2821b473-fe24-4c86-ba16-62834d6e80c3';
        collectOutlookV1Tokens(clientId, out, seen);
        if (out.length) { return out[0]; }

        var tokenKeys = parseJson(storageGet('msal.token.keys.' + clientId));
        var keys = tokenKeys && Array.isArray(tokenKeys.accessToken) ? tokenKeys.accessToken : [];
        for (var i = 0; i < keys.length; i++) {
          var key = String(keys[i] || '');
          if (key.indexOf('graph.microsoft.com') === -1 && key.indexOf('notes.') === -1) { continue; }
          var raw = parseJson(storageGet(key));
          if (!raw || typeof raw.secret !== 'string') { continue; }
          pushOutlookToken(out, seen, raw.secret, raw.expiresOn);
          if (out.length) { return out[0]; }
        }

        for (var j = 0; j < storageLength(); j++) {
          var storageKey = storageKeyAt(j);
          if (!storageKey || storageKey.indexOf('accesstoken') === -1
              || storageKey.indexOf(clientId) === -1
              || (storageKey.indexOf('graph.microsoft.com') === -1 && storageKey.indexOf('notes.') === -1)) {
            continue;
          }
          var data = parseJson(storageGet(storageKey));
          if (!data || typeof data.secret !== 'string') { continue; }
          pushOutlookToken(out, seen, data.secret, data.expiresOn);
          if (out.length) { return out[0]; }
        }
        return '';
      }
      function onenoteRead(action) {
        if (action !== 'auth_context') {
          return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-onenote-page-read-action' });
        }
        var graphToken = findOneNoteGraphToken();
        if (!graphToken) { return fallback('onenote-graph-token-unavailable'); }
        return { success: true, status: 200, data: {
          graph_token: graphToken
        } };
      }
      function usableExcelToken(value) {
        if (!value || typeof value !== 'object') { return ''; }
        var token = typeof value.token === 'string' ? value.token : '';
        var exp = typeof value.exp === 'number' ? value.exp : Number(value.exp || 0);
        if (!token || token.length < 16) { return ''; }
        if (!isFinite(exp) || exp <= Math.floor(Date.now() / 1000) + 30) { return ''; }
        return token;
      }
      function getExcelPreScriptValue(key) {
        try {
          var ns = globalThis.__openTabs
            && globalThis.__openTabs.preScript
            && globalThis.__openTabs.preScript['excel-online'];
          return ns ? ns[key] : undefined;
        } catch (err) {
          return undefined;
        }
      }
      function readExcelGraphToken() {
        var fromNamespace = usableExcelToken(getExcelPreScriptValue('graph'));
        if (fromNamespace) { return fromNamespace; }

        var mirrored = usableExcelToken(parseJson(storageGet('__opentabs_excel_graph_token')));
        if (mirrored) { return mirrored; }

        for (var i = 0; i < storageLength(); i++) {
          var key = storageKeyAt(i);
          if (!key || key.indexOf('accesstoken') === -1
              || key.indexOf('graph.microsoft.com') === -1) {
            continue;
          }
          var data = parseJson(storageGet(key));
          var secret = data && typeof data.secret === 'string' ? data.secret : '';
          var expiresOn = data ? Number.parseInt(String(data.expiresOn || '0'), 10) : 0;
          if (secret && secret.length >= 16 && expiresOn > Math.floor(Date.now() / 1000) + 30) {
            return secret;
          }
        }
        return '';
      }
      function readExcelWorkbookContext() {
        var href = '';
        try {
          href = globalThis.location && globalThis.location.href ? String(globalThis.location.href) : '';
          var url = new URL(href);
          var driveId = url.searchParams.get('driveId') || '';
          var itemId = url.searchParams.get('docId') || url.searchParams.get('itemId') || '';
          var isSharePointWorkbook = url.hostname.toLowerCase().slice(-15) === '.sharepoint.com'
            && url.pathname.indexOf('/:x:/') !== -1;
          return {
            drive_id: driveId,
            item_id: itemId,
            sharing_url: (!driveId || !itemId) && isSharePointWorkbook ? href : ''
          };
        } catch (err) {
          return { drive_id: '', item_id: '', sharing_url: '' };
        }
      }
      function excelRead(action) {
        if (action !== 'auth_context') {
          return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-excel-page-read-action' });
        }
        var graphToken = readExcelGraphToken();
        if (!graphToken) { return fallback('excel-graph-token-unavailable'); }
        var workbook = readExcelWorkbookContext();
        if ((!workbook.drive_id || !workbook.item_id) && !workbook.sharing_url) {
          return fallback('excel-workbook-context-unavailable');
        }
        return { success: true, status: 200, data: {
          graph_token: graphToken,
          drive_id: workbook.drive_id,
          item_id: workbook.item_id,
          sharing_url: workbook.sharing_url
        } };
      }
      function azureSessionStorageGet(key) {
        try {
          if (typeof globalThis.sessionStorage !== 'undefined' && globalThis.sessionStorage) {
            return globalThis.sessionStorage.getItem(key);
          }
        } catch (_sessionErr) {
          return null;
        }
        return null;
      }
      function azureSessionStorageKeyAt(index) {
        try {
          if (typeof globalThis.sessionStorage !== 'undefined' && globalThis.sessionStorage) {
            return globalThis.sessionStorage.key(index);
          }
        } catch (_sessionErr) {
          return null;
        }
        return null;
      }
      function azureSessionStorageLength() {
        try {
          if (typeof globalThis.sessionStorage !== 'undefined' && globalThis.sessionStorage) {
            return globalThis.sessionStorage.length || 0;
          }
        } catch (_sessionErr) {
          return 0;
        }
        return 0;
      }
      function azureValidToken(entry) {
        if (!entry || typeof entry !== 'object') { return ''; }
        var token = typeof entry.secret === 'string' ? entry.secret : '';
        var expiresOn = Number.parseInt(String(entry.expiresOn || '0'), 10);
        if (!token || token.length < 16) { return ''; }
        if (!isFinite(expiresOn) || expiresOn <= Math.floor(Date.now() / 1000) + 30) { return ''; }
        return token;
      }
      function azureArmToken() {
        for (var i = 0; i < azureSessionStorageLength(); i++) {
          var key = azureSessionStorageKeyAt(i);
          if (!key || key.indexOf('accesstoken') === -1 ||
              key.indexOf('management.core.windows.net') === -1) {
            continue;
          }
          var token = azureValidToken(parseJson(azureSessionStorageGet(key)));
          if (token) { return token; }
        }
        return '';
      }
      function azureJwtPayload(token) {
        try {
          var parts = String(token || '').split('.');
          if (parts.length < 2 || !parts[1]) { return {}; }
          var body = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (body.length % 4) { body += '='; }
          return parseJson(atob(body)) || {};
        } catch (_jwtErr) {
          return {};
        }
      }
      function azureAccountProfile() {
        var profile = {};
        var accountKeys = parseJson(azureSessionStorageGet('msal.1.account.keys'));
        if (Array.isArray(accountKeys) && accountKeys[0]) {
          var rawAccount = parseJson(azureSessionStorageGet(accountKeys[0]));
          if (rawAccount && typeof rawAccount === 'object') {
            profile.name = chStr(rawAccount.name);
            profile.email = chStr(rawAccount.username);
            profile.objectId = chStr(rawAccount.localAccountId);
          }
        }
        var claims = azureJwtPayload(azureArmToken());
        if (!profile.name) { profile.name = chStr(claims.name); }
        if (!profile.email) { profile.email = chStr(claims.email || claims.unique_name || claims.upn); }
        if (!profile.objectId) { profile.objectId = chStr(claims.oid); }
        profile.tenantId = chStr(claims.tid);
        return profile;
      }
      function azureBuildQuery(pairs) {
        var parts = [];
        for (var i = 0; i < (pairs || []).length; i++) {
          var key = pairs[i][0];
          var value = pairs[i][1];
          if (value === undefined || value === null || value === '') { continue; }
          parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
        }
        return parts.length ? '?' + parts.join('&') : '';
      }
      function azureSegment(value) {
        return encodeURIComponent(String(value || ''));
      }
      function azureResourcePath(value) {
        var resourcePath = String(value || '').trim();
        if (!resourcePath || resourcePath.charAt(0) !== '/' ||
            resourcePath.indexOf('://') !== -1 ||
            resourcePath.indexOf('?') !== -1 ||
            resourcePath.indexOf('#') !== -1 ||
            /[\r\n]/.test(resourcePath)) {
          return '';
        }
        return resourcePath;
      }
      function azureObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
      }
      async function azureArmGet(endpoint, apiVersion, queryPairs, wrapKey, expectList) {
        var armToken = azureArmToken();
        if (!armToken) { return fallback('azure-arm-token-unavailable'); }
        var url = 'https://management.azure.com' + endpoint +
          azureBuildQuery((queryPairs || []).concat([['api-version', apiVersion || '2022-12-01']]));
        var response;
        try {
          response = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Authorization': 'Bearer ' + armToken
            },
            credentials: 'omit',
            redirect: 'manual'
          });
        } catch (_fetchErr) {
          return fallback('azure-arm-network-error');
        }
        if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403) {
          return fallback('azure-arm-auth-failed');
        }
        if (!response.ok) { return fallback('azure-arm-http-status-' + response.status); }
        var data = {};
        try {
          data = response.status === 204 ? {} : await response.json();
        } catch (_jsonErr) {
          return fallback('azure-arm-json-shape-mismatch');
        }
        if (expectList && (!azureObject(data) || !Array.isArray(data.value))) {
          return fallback('azure-arm-list-shape-mismatch');
        }
        if (!expectList && !azureObject(data)) {
          return fallback('azure-arm-object-shape-mismatch');
        }
        var out = {};
        out[wrapKey] = expectList ? data.value : data;
        return { success: true, status: response.status, data: out };
      }
      async function azureRead(action, args) {
        args = args || {};
        if (action === 'get_current_user') {
          var profile = azureAccountProfile();
          if (!azureArmToken()) { return fallback('azure-arm-token-unavailable'); }
          var nameParts = chStr(profile.name).split(' ');
          return { success: true, status: 200, data: { user: {
            id: profile.objectId,
            display_name: profile.name || profile.email,
            user_principal_name: profile.email,
            mail: profile.email,
            given_name: nameParts[0] || '',
            surname: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '',
            job_title: '',
            tenant_id: profile.tenantId
          } } };
        }
        if (action === 'list_subscriptions') {
          return azureArmGet('/subscriptions', '2022-12-01', [], 'subscriptions', true);
        }
        if (action === 'get_subscription') {
          return azureArmGet('/subscriptions/' + azureSegment(args.subscription_id), '2022-12-01', [], 'subscription', false);
        }
        if (action === 'list_tenants') {
          return azureArmGet('/tenants', '2022-12-01', [], 'tenants', true);
        }
        if (action === 'list_locations') {
          return azureArmGet('/locations', '2022-12-01', [], 'locations', true);
        }
        if (action === 'list_subscription_locations') {
          return azureArmGet('/subscriptions/' + azureSegment(args.subscription_id) + '/locations', '2022-12-01', [], 'locations', true);
        }
        if (action === 'list_resource_groups') {
          return azureArmGet('/subscriptions/' + azureSegment(args.subscription_id) + '/resourcegroups', '2021-04-01', [
            ['$filter', args.filter],
            ['$top', args.top]
          ], 'resource_groups', true);
        }
        if (action === 'get_resource_group') {
          return azureArmGet('/subscriptions/' + azureSegment(args.subscription_id) + '/resourcegroups/' +
            azureSegment(args.resource_group_name), '2021-04-01', [], 'resource_group', false);
        }
        if (action === 'list_resources') {
          var resourceBase = args.resource_group_name
            ? '/subscriptions/' + azureSegment(args.subscription_id) + '/resourceGroups/' +
              azureSegment(args.resource_group_name) + '/resources'
            : '/subscriptions/' + azureSegment(args.subscription_id) + '/resources';
          return azureArmGet(resourceBase, '2021-04-01', [
            ['$filter', args.filter],
            ['$top', args.top]
          ], 'resources', true);
        }
        if (action === 'get_resource') {
          var resourcePath = azureResourcePath(args.resource_id);
          if (!resourcePath) { return fallback('azure-resource-id-invalid'); }
          return azureArmGet(resourcePath, args.api_version || '2021-04-01', [], 'resource', false);
        }
        if (action === 'list_resource_providers') {
          return azureArmGet('/subscriptions/' + azureSegment(args.subscription_id) + '/providers', '2021-04-01', [
            ['$top', args.top]
          ], 'providers', true);
        }
        if (action === 'list_tags') {
          return azureArmGet('/subscriptions/' + azureSegment(args.subscription_id) + '/tagNames', '2021-04-01', [], 'tags', true);
        }
        if (action === 'list_activity_logs') {
          return azureArmGet('/subscriptions/' + azureSegment(args.subscription_id) +
            '/providers/Microsoft.Insights/eventtypes/management/values', '2015-04-01', [
              ['$filter', args.filter],
              ['$select', args.select]
            ], 'events', true);
        }
        if (action === 'list_policy_assignments') {
          return azureArmGet('/subscriptions/' + azureSegment(args.subscription_id) +
            '/providers/Microsoft.Authorization/policyAssignments', '2022-06-01', [
              ['$filter', args.filter]
            ], 'policy_assignments', true);
        }
        if (action === 'get_policy_assignment') {
          return azureArmGet('/subscriptions/' + azureSegment(args.subscription_id) +
            '/providers/Microsoft.Authorization/policyAssignments/' +
            azureSegment(args.policy_assignment_name), '2022-06-01', [], 'policy_assignment', false);
        }
        if (action === 'list_role_assignments') {
          return azureArmGet('/subscriptions/' + azureSegment(args.subscription_id) +
            '/providers/Microsoft.Authorization/roleAssignments', '2022-04-01', [
              ['$filter', args.filter]
            ], 'role_assignments', true);
        }
        if (action === 'list_locks') {
          var lockBase = args.resource_group_name
            ? '/subscriptions/' + azureSegment(args.subscription_id) + '/resourceGroups/' +
              azureSegment(args.resource_group_name) + '/providers/Microsoft.Authorization/locks'
            : '/subscriptions/' + azureSegment(args.subscription_id) + '/providers/Microsoft.Authorization/locks';
          return azureArmGet(lockBase, '2020-05-01', [], 'locks', true);
        }
        if (action === 'list_deployments') {
          return azureArmGet('/subscriptions/' + azureSegment(args.subscription_id) + '/resourcegroups/' +
            azureSegment(args.resource_group_name) + '/providers/Microsoft.Resources/deployments', '2021-04-01', [
              ['$filter', args.filter],
              ['$top', args.top]
            ], 'deployments', true);
        }
        if (action === 'get_deployment') {
          return azureArmGet('/subscriptions/' + azureSegment(args.subscription_id) + '/resourcegroups/' +
            azureSegment(args.resource_group_name) + '/providers/Microsoft.Resources/deployments/' +
            azureSegment(args.deployment_name), '2021-04-01', [], 'deployment', false);
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-azure-page-read-action' });
      }
      function gcalSegment(value, fallbackValue) {
        return encodeURIComponent(String(value || fallbackValue || 'primary'));
      }
      function gcalParam(out, key, value) {
        if (value === undefined || value === null || value === '') { return; }
        out[key] = value;
      }
      function gcalPositiveInt(value, fallbackValue, max) {
        var n = Number(value);
        if (!isFinite(n) || n < 1) { n = fallbackValue; }
        n = Math.floor(n);
        return n > max ? max : n;
      }
      function gcalClient() {
        try {
          var gapi = globalThis && globalThis.gapi;
          var client = gapi && gapi.client;
          return client && typeof client.request === 'function' ? client : null;
        } catch (err) {
          return null;
        }
      }
      async function gcalRequest(path, params) {
        var client = gcalClient();
        if (!client) { return fallback('gcal-gapi-client-unavailable'); }
        try {
          var response = await client.request({
            path: path,
            method: 'GET',
            params: params || {}
          });
          var data = response && Object.prototype.hasOwnProperty.call(response, 'result')
            ? response.result
            : response;
          if (!data || typeof data !== 'object') {
            return fallback('gcal-response-shape-mismatch');
          }
          if (data.error || (data.result && data.result.error)) {
            return fallback('gcal-api-error-envelope');
          }
          return { success: true, status: 200, data: data };
        } catch (_requestErr) {
          return fallback('gcal-gapi-request-failed');
        }
      }
      function gcalListCalendarParams(args) {
        var params = {};
        gcalParam(params, 'showHidden', args.show_hidden);
        gcalParam(params, 'showDeleted', args.show_deleted);
        return params;
      }
      function gcalListEventParams(args, searchQuery, maxResults) {
        var params = {};
        gcalParam(params, 'timeMin', args.time_min);
        gcalParam(params, 'timeMax', args.time_max);
        gcalParam(params, 'q', searchQuery || args.q);
        gcalParam(params, 'maxResults', maxResults || args.max_results);
        gcalParam(params, 'pageToken', args.page_token);
        gcalParam(params, 'showDeleted', args.show_deleted);
        params.singleEvents = args.single_events === undefined ? true : args.single_events === true;
        if (args.order_by) {
          gcalParam(params, 'orderBy', args.order_by);
        } else if (params.singleEvents === true) {
          params.orderBy = 'startTime';
        }
        return params;
      }
      async function gcalSearchEvents(args) {
        var calendarsRes = await gcalRequest('/calendar/v3/users/me/calendarList', {
          minAccessRole: 'writer',
          showHidden: true
        });
        if (!calendarsRes || calendarsRes.success !== true) { return calendarsRes; }
        var calendars = Array.isArray(calendarsRes.data && calendarsRes.data.items)
          ? calendarsRes.data.items
          : [];
        var maxPerCalendar = gcalPositiveInt(args.max_results_per_calendar, 10, 250);
        var grouped = [];
        var flat = [];
        for (var i = 0; i < calendars.length && i < 25; i++) {
          var calendar = calendars[i] || {};
          var calendarId = String(calendar.id || '');
          if (!calendarId) { continue; }
          var eventsRes = await gcalRequest(
            '/calendar/v3/calendars/' + gcalSegment(calendarId) + '/events',
            gcalListEventParams(args, args.q, maxPerCalendar)
          );
          if (!eventsRes || eventsRes.success !== true) { return eventsRes; }
          var events = Array.isArray(eventsRes.data && eventsRes.data.items) ? eventsRes.data.items : [];
          grouped.push({
            calendar_id: calendarId,
            summary: String(calendar.summary || ''),
            events: events
          });
          for (var j = 0; j < events.length; j++) {
            flat.push(events[j]);
          }
        }
        return { success: true, status: 200, data: {
          calendars: grouped,
          events: flat,
          total: flat.length
        } };
      }
      async function gcalRead(action, args) {
        if (action === 'get_calendar') {
          return gcalRequest('/calendar/v3/calendars/' + gcalSegment(args.calendar_id), {});
        }
        if (action === 'get_colors') {
          return gcalRequest('/calendar/v3/colors', {});
        }
        if (action === 'get_event') {
          return gcalRequest(
            '/calendar/v3/calendars/' + gcalSegment(args.calendar_id) + '/events/' + gcalSegment(args.event_id, '')
          );
        }
        if (action === 'get_setting') {
          return gcalRequest('/calendar/v3/users/me/settings/' + gcalSegment(args.setting_id, ''), {});
        }
        if (action === 'list_calendars') {
          return gcalRequest('/calendar/v3/users/me/calendarList', gcalListCalendarParams(args));
        }
        if (action === 'list_event_instances') {
          var instanceParams = {};
          gcalParam(instanceParams, 'timeMin', args.time_min);
          gcalParam(instanceParams, 'timeMax', args.time_max);
          gcalParam(instanceParams, 'maxResults', args.max_results);
          gcalParam(instanceParams, 'pageToken', args.page_token);
          return gcalRequest(
            '/calendar/v3/calendars/' + gcalSegment(args.calendar_id) + '/events/' + gcalSegment(args.event_id, '') + '/instances',
            instanceParams
          );
        }
        if (action === 'list_events') {
          return gcalRequest(
            '/calendar/v3/calendars/' + gcalSegment(args.calendar_id) + '/events',
            gcalListEventParams(args)
          );
        }
        if (action === 'list_settings') {
          return gcalRequest('/calendar/v3/users/me/settings', {});
        }
        if (action === 'search_events') {
          return gcalSearchEvents(args);
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-gcal-page-read-action' });
      }
      var GDRIVE_API_KEY = 'AIzaSyD_InbmSFufIEps5UAt2NmB_3LvBH3Sz_8';
      var GDRIVE_FILE_FIELDS = 'id,name,mimeType,modifiedTime,createdTime,size,parents,trashed,starred,shared,webViewLink,iconLink,description,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress)';
      var GDRIVE_FILE_LIST_FIELDS = 'nextPageToken,files(' + GDRIVE_FILE_FIELDS + ')';
      function gdriveClient() {
        try {
          var gapi = globalThis.gapi;
          var client = gapi && gapi.client;
          return client && typeof client.request === 'function' ? client : null;
        } catch (err) {
          return null;
        }
      }
      function gdriveCleanParams(params) {
        var out = {};
        var has = false;
        params = params || {};
        for (var key in params) {
          if (!Object.prototype.hasOwnProperty.call(params, key)) { continue; }
          var value = params[key];
          if (value === undefined || value === null || value === '') { continue; }
          out[key] = value;
          has = true;
        }
        return has ? out : {};
      }
      function gdriveSegment(value) {
        return encodeURIComponent(String(value || ''));
      }
      function gdriveQueryValue(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      }
      function gdrivePositiveInt(value, fallbackValue, max) {
        var n = Number(value);
        if (!isFinite(n) || n < 1) { n = fallbackValue; }
        n = Math.floor(n);
        return n > max ? max : n;
      }
      async function gdriveRequest(path, params) {
        var client = gdriveClient();
        if (!client) { return fallback('gdrive-gapi-request-unavailable'); }
        try {
          if (typeof client.setApiKey === 'function') {
            client.setApiKey(GDRIVE_API_KEY);
          }
        } catch (apiKeyErr) {
          // gapi can still succeed when the key is already set by the page.
        }
        try {
          var pending = client.request({
            path: path,
            method: 'GET',
            params: gdriveCleanParams(params)
          });
          if (!pending || typeof pending.then !== 'function') {
            return fallback('gdrive-gapi-request-unavailable');
          }
          var resp = await new Promise(function(resolve, reject) {
            pending.then(resolve, reject);
          });
          var status = Number((resp && resp.status) || 200);
          var data = resp && resp.result !== undefined ? resp.result : {};
          if (status === 401 || status === 403 || status >= 400) {
            return fallback('gdrive-gapi-http-error');
          }
          if (!data || typeof data !== 'object' || data.error) {
            return fallback('gdrive-gapi-error-envelope');
          }
          return { success: true, status: status, data: data };
        } catch (err) {
          var errStatus = Number((err && err.status) || 0);
          if (errStatus === 401 || errStatus === 403 || errStatus >= 400) {
            return fallback('gdrive-gapi-http-error');
          }
          return fallback('gdrive-gapi-request-failed');
        }
      }
      async function gdriveRead(action, args) {
        args = args || {};
        if (action === 'get_current_user') {
          return gdriveRequest('/drive/v3/about', {
            fields: 'user(displayName,emailAddress,permissionId,photoLink),storageQuota'
          });
        }
        if (action === 'get_file') {
          var fileId = String(args.file_id || '');
          if (!fileId) { return fallback('gdrive-file-id-required'); }
          return gdriveRequest('/drive/v3/files/' + gdriveSegment(fileId), {
            fields: GDRIVE_FILE_FIELDS
          });
        }
        if (action === 'get_storage_quota') {
          return gdriveRequest('/drive/v3/about', {
            fields: 'storageQuota'
          });
        }
        if (action === 'list_files') {
          var parentId = String(args.parent_id || 'root');
          var q = "'" + gdriveQueryValue(parentId) + "' in parents";
          if (args.include_trashed !== true) { q += ' and trashed = false'; }
          return gdriveRequest('/drive/v3/files', {
            q: q,
            pageSize: gdrivePositiveInt(args.page_size, 50, 1000),
            pageToken: args.page_token,
            orderBy: args.order_by || 'modifiedTime desc',
            fields: GDRIVE_FILE_LIST_FIELDS
          });
        }
        if (action === 'list_permissions') {
          var permissionsFileId = String(args.file_id || '');
          if (!permissionsFileId) { return fallback('gdrive-file-id-required'); }
          return gdriveRequest('/drive/v3/files/' + gdriveSegment(permissionsFileId) + '/permissions', {
            fields: 'permissions(id,type,role,emailAddress,displayName,domain)'
          });
        }
        if (action === 'search_files') {
          var query = String(args.query || '');
          if (!query) { return fallback('gdrive-query-required'); }
          var searchQ = "fullText contains '" + gdriveQueryValue(query) + "'";
          if (args.mime_type) {
            searchQ += " and mimeType = '" + gdriveQueryValue(args.mime_type) + "'";
          }
          if (args.include_trashed !== true) { searchQ += ' and trashed = false'; }
          return gdriveRequest('/drive/v3/files', {
            q: searchQ,
            pageSize: gdrivePositiveInt(args.page_size, 20, 1000),
            pageToken: args.page_token,
            fields: GDRIVE_FILE_LIST_FIELDS
          });
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-gdrive-page-read-action' });
      }
      function crdbProtoClass(proto, className) {
        if (!proto || !className) { return null; }
        if (proto.console && proto.console[className]) { return proto.console[className]; }
        if (proto.common && proto.common[className]) { return proto.common[className]; }
        if (proto[className]) { return proto[className]; }
        return null;
      }
      function crdbNewRequest(proto, className) {
        var cls = crdbProtoClass(proto, className);
        return cls ? new cls() : null;
      }
      function crdbSetField(msg, setter, value) {
        var fn = msg && msg[setter];
        if (typeof fn !== 'function') { return false; }
        fn.call(msg, value);
        return true;
      }
      function crdbEncodeGrpcFrame(payload) {
        var bytes = payload instanceof Uint8Array ? payload : new Uint8Array(0);
        var frame = new Uint8Array(5 + bytes.length);
        frame[0] = 0;
        var view = new DataView(frame.buffer);
        view.setUint32(1, bytes.length);
        frame.set(bytes, 5);
        return frame.buffer;
      }
      function crdbDecodeGrpcFrames(buffer) {
        var bytes = new Uint8Array(buffer || new ArrayBuffer(0));
        var frames = [];
        var offset = 0;
        while (offset + 5 <= bytes.length) {
          var flag = bytes[offset];
          var view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4);
          var len = view.getUint32(0);
          if (offset + 5 + len > bytes.length) { break; }
          frames.push({ flag: flag, data: bytes.slice(offset + 5, offset + 5 + len) });
          offset += 5 + len;
        }
        return frames;
      }
      function crdbParseTrailer(data) {
        var text = '';
        try { text = new TextDecoder().decode(data); } catch (err) { text = ''; }
        var status = 0;
        var message = '';
        var lines = text.split('\r\n');
        for (var i = 0; i < lines.length; i++) {
          var statusMatch = /^grpc-status:\s*(\d+)/.exec(lines[i]);
          if (statusMatch && statusMatch[1]) { status = Number(statusMatch[1]); }
          var messageMatch = /^grpc-message:\s*(.*)/.exec(lines[i]);
          if (messageMatch && messageMatch[1]) {
            try { message = decodeURIComponent(messageMatch[1]); } catch (err2) { message = messageMatch[1]; }
          }
        }
        return { status: status, message: message };
      }
      async function crdbGrpc(method, responseClassName, setup) {
        if (typeof globalThis.initData !== 'string' || !globalThis.initData) {
          return fallback('cockroachdb-auth-or-initdata-unavailable');
        }
        var proto = globalThis.proto;
        if (!proto || !proto.console) { return fallback('cockroachdb-proto-unavailable'); }
        var responseClass = crdbProtoClass(proto, responseClassName);
        if (!responseClass || typeof responseClass.deserializeBinary !== 'function') {
          return fallback('cockroachdb-response-class-unavailable');
        }

        var payload = new Uint8Array(0);
        if (typeof setup === 'function') {
          var req = setup(proto);
          if (!req || typeof req.serializeBinary !== 'function') {
            return fallback('cockroachdb-request-class-unavailable');
          }
          payload = req.serializeBinary();
        }

        var response = await fetch('https://cockroachlabs.cloud/console.ManagementConsole/' + method, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/grpc-web+proto',
            'Accept': 'application/grpc-web+proto',
            'X-Grpc-Web': '1'
          },
          body: crdbEncodeGrpcFrame(payload),
          credentials: 'include',
          redirect: 'manual'
        });
        if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403) {
          return fallback('cockroachdb-grpc-auth-failed');
        }

        var frames = crdbDecodeGrpcFrames(await response.arrayBuffer());
        var trailer = null;
        var dataFrame = null;
        for (var i = 0; i < frames.length; i++) {
          if (frames[i].flag === 128) { trailer = crdbParseTrailer(frames[i].data); }
          if (frames[i].flag === 0 && !dataFrame) { dataFrame = frames[i]; }
        }
        if (trailer && trailer.status !== 0) {
          return fallback('cockroachdb-grpc-status-' + trailer.status);
        }
        if (!dataFrame) {
          return { success: true, status: response.status, data: {} };
        }
        return {
          success: true,
          status: response.status,
          data: responseClass.deserializeBinary(dataFrame.data).toObject()
        };
      }
      async function crdbWrap(method, responseClassName, setup, transform) {
        var out = await crdbGrpc(method, responseClassName, setup);
        if (!out || out.success !== true) { return out; }
        try {
          return {
            success: true,
            status: out.status,
            data: typeof transform === 'function' ? transform(out.data || {}) : (out.data || {})
          };
        } catch (err) {
          return fallback('cockroachdb-response-shape-mismatch');
        }
      }
      function crdbClusterRead(args, method, responseClassName, requestClassName, transform) {
        var clusterId = String((args && args.cluster_id) || '');
        if (!clusterId) { return fallback('cockroachdb-cluster-id-required'); }
        return crdbWrap(method, responseClassName, function(proto) {
          var req = crdbNewRequest(proto, requestClassName);
          if (!req) { return null; }
          crdbSetField(req, 'setClusterId', clusterId);
          return req;
        }, transform);
      }
      function crdbRead(action, args) {
        if (action === 'get_organization') {
          return crdbWrap('GetOrganization', 'GetOrganizationResponse', null, function(data) {
            return { organization: data.organization || {} };
          });
        }
        if (action === 'list_org_users') {
          return crdbWrap('ListOrgUsers', 'ListOrgUsersResponse', null, function(data) {
            return { members: data.usersList || [] };
          });
        }
        if (action === 'get_resource_count') {
          return crdbWrap('GetResourceCount', 'GetResourceCountResponse', null, function(data) {
            return {
              serverless_clusters: data.totalServerlessClusters || 0,
              dedicated_clusters: data.totalDedicatedClusters || 0,
              folders: data.totalFolders || 0
            };
          });
        }
        if (action === 'get_user_profile') {
          return crdbWrap('GetUserProfile', 'GetUserProfileResponse', null, function(data) {
            return { traits: data.traits || {} };
          });
        }
        if (action === 'list_clusters') {
          return crdbWrap('ListClusters', 'ListClustersResponse', null, function(data) {
            return { clusters: data.clustersList || [] };
          });
        }
        if (action === 'get_cluster') {
          return crdbClusterRead(args, 'GetCluster', 'GetClusterResponse', 'GetClusterRequest', function(data) {
            return { cluster: data.cluster || {} };
          });
        }
        if (action === 'get_cluster_usage') {
          return crdbClusterRead(args, 'GetClusterUsage', 'GetClusterUsageResponse', 'GetClusterUsageRequest', function(data) {
            return {
              usage: {
                consumed_request_units: data.consumedRequestUnits || 0,
                current_storage_gib: data.currentStorageGib || 0
              }
            };
          });
        }
        if (action === 'list_cluster_nodes') {
          return crdbClusterRead(args, 'ListClusterNodes', 'ListClusterNodesResponse', 'ListClusterNodesRequest', function(data) {
            return { nodes: data.nodesList || [] };
          });
        }
        if (action === 'list_database_names') {
          return crdbClusterRead(args, 'ListDatabaseNames', 'ListDatabaseNamesResponse', 'ListDatabaseNamesRequest', function(data) {
            return { databases: data.namesList || [] };
          });
        }
        if (action === 'list_database_users') {
          return crdbClusterRead(args, 'ListDatabaseUsers', 'ListDatabaseUsersResponse', 'ListDatabaseUsersRequest', function(data) {
            return { users: data.usersList || [] };
          });
        }
        if (action === 'get_networking_config') {
          return crdbClusterRead(args, 'GetNetworkingConfig', 'GetNetworkingConfigResponse', 'GetNetworkingConfigRequest', function(data) {
            return { config: data || {} };
          });
        }
        if (action === 'list_invoices') {
          return crdbWrap('ListInvoices', 'ListInvoicesResponse', null, function(data) {
            return { invoices: data.invoicesList || [] };
          });
        }
        if (action === 'get_credit_trial_status') {
          return crdbWrap('GetCreditTrialStatus', 'GetCreditTrialStatusResponse', null, function(data) {
            return { trial: data || {} };
          });
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-cockroachdb-page-read-action' });
      }
      var TEMPORAL_AUTH0_CLIENT_ID = 'nTmmPY5xUpQnSr7gRZh7s33hNamtCeDg';
      var TEMPORAL_AUTH0_AUDIENCE = 'https://saas-api.tmprl.cloud';
      function temporalStr(value) {
        return value === undefined || value === null ? '' : String(value);
      }
      function temporalNum(value) {
        var n = Number(value);
        return Number.isFinite(n) ? n : 0;
      }
      function temporalBool(value) {
        return value === true;
      }
      function temporalJson(raw) {
        if (!raw || typeof raw !== 'string') { return null; }
        try { return JSON.parse(raw); } catch (_jsonErr) { return null; }
      }
      function temporalLocalStorageGet(key) {
        try {
          return (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function')
            ? localStorage.getItem(key)
            : null;
        } catch (_storageErr) {
          return null;
        }
      }
      function temporalAuth() {
        try {
          if (typeof localStorage === 'undefined' || !localStorage) { return null; }
          var prefix = '@@auth0spajs@@::' + TEMPORAL_AUTH0_CLIENT_ID + '::';
          for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (!key || key.indexOf(prefix) !== 0 || key.indexOf(TEMPORAL_AUTH0_AUDIENCE) === -1) { continue; }
            var entry = temporalJson(temporalLocalStorageGet(key));
            var token = entry && entry.body && entry.body.access_token;
            var expiresAt = temporalNum(entry && entry.expiresAt);
            if (token && (!expiresAt || expiresAt >= Date.now() / 1000)) {
              return { accessToken: String(token) };
            }
          }
        } catch (_authErr) {
          return null;
        }
        return null;
      }
      function temporalAllowedOrigin(origin) {
        if (origin === 'https://cloud.temporal.io') { return true; }
        try {
          return /\.web\.tmprl\.cloud$/.test(new URL(origin).hostname.toLowerCase());
        } catch (_originErr) {
          return false;
        }
      }
      function temporalCurrentUrl() {
        try { return String(globalThis.location && globalThis.location.href || ''); } catch (_urlErr) { return ''; }
      }
      function temporalValidNamespace(value) {
        var ns = temporalStr(value);
        return /^[a-z0-9][a-z0-9.-]{0,252}$/i.test(ns) && ns.indexOf('..') === -1 ? ns : '';
      }
      function temporalResolveNamespace(args) {
        var explicit = temporalValidNamespace(args && args.namespace);
        if (explicit) { return explicit; }
        var url = temporalCurrentUrl();
        var match = url.match(/\/namespaces\/([^/]+)/);
        if (match && match[1]) { return temporalValidNamespace(decodeURIComponent(match[1])); }
        var hostMatch = url.match(/^https?:\/\/([^.]+)\.web\.tmprl\.cloud/i);
        return hostMatch && hostMatch[1] ? temporalValidNamespace(hostMatch[1]) : '';
      }
      function temporalAppendQuery(parts, key, value) {
        if (value === undefined || value === null || value === '') { return; }
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
      }
      function temporalBuildQuery(pairs) {
        var parts = [];
        for (var i = 0; i < (pairs || []).length; i++) {
          temporalAppendQuery(parts, pairs[i][0], pairs[i][1]);
        }
        return parts.length ? '?' + parts.join('&') : '';
      }
      async function temporalApi(namespace, path, pairs) {
        var auth = temporalAuth();
        if (!auth) { return fallback('temporal-auth-unavailable'); }
        try {
          var response = await fetch('https://' + namespace + '.web.tmprl.cloud/api/v1' + path + temporalBuildQuery(pairs), {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Authorization': 'Bearer ' + auth.accessToken
            },
            credentials: 'include',
            redirect: 'manual'
          });
          if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403) {
            return fallback('temporal-auth-failed');
          }
          if (!response.ok) { return fallback('temporal-http-status-' + response.status); }
          return { success: true, status: response.status, data: response.status === 204 ? {} : await response.json() };
        } catch (_fetchErr) {
          return fallback('temporal-network-error');
        }
      }
      function temporalDecodeBase64(value) {
        if (!value) { return ''; }
        try {
          if (typeof atob === 'function') { return atob(String(value)); }
        } catch (_atobErr) {
          return String(value);
        }
        return String(value);
      }
      function temporalDecodeFields(fields) {
        var out = {};
        if (!fields || typeof fields !== 'object') { return out; }
        for (var key in fields) {
          if (Object.prototype.hasOwnProperty.call(fields, key)) {
            out[key] = temporalDecodeBase64(fields[key] && fields[key].data);
          }
        }
        return out;
      }
      function temporalMapWorkflowExecution(w) {
        w = w || {};
        var execution = w.execution || {};
        var parent = w.parentExecution || {};
        var root = w.rootExecution || {};
        return {
          workflow_id: temporalStr(execution.workflowId),
          run_id: temporalStr(execution.runId),
          type: temporalStr(w.type && w.type.name),
          status: temporalStr(w.status),
          task_queue: temporalStr(w.taskQueue),
          start_time: temporalStr(w.startTime),
          execution_time: temporalStr(w.executionTime),
          close_time: temporalStr(w.closeTime),
          history_length: temporalStr(w.historyLength || '0'),
          memo: temporalDecodeFields(w.memo && w.memo.fields),
          parent_workflow_id: temporalStr(parent.workflowId),
          parent_run_id: temporalStr(parent.runId),
          root_workflow_id: temporalStr(root.workflowId),
          root_run_id: temporalStr(root.runId)
        };
      }
      function temporalMapWorkflowDetail(d) {
        d = d || {};
        var info = d.workflowExecutionInfo || {};
        var config = d.executionConfig || {};
        var base = temporalMapWorkflowExecution(info);
        base.history_size_bytes = temporalStr(info.historySizeBytes || '0');
        base.state_transition_count = temporalStr(info.stateTransitionCount || '0');
        base.first_run_id = temporalStr(info.firstRunId);
        base.execution_timeout = temporalStr(config.workflowExecutionTimeout || '0s');
        base.run_timeout = temporalStr(config.workflowRunTimeout || '0s');
        base.task_timeout = temporalStr(config.defaultWorkflowTaskTimeout || '10s');
        base.search_attributes = temporalDecodeFields(info.searchAttributes && info.searchAttributes.indexedFields);
        return base;
      }
      function temporalMapHistoryEvent(event) {
        event = event || {};
        var attrs = {};
        for (var key in event) {
          if (Object.prototype.hasOwnProperty.call(event, key) && /Attributes$/.test(key) &&
              key !== 'eventId' && key !== 'eventType' && key !== 'eventTime' && event[key]) {
            var obj = event[key];
            for (var attrKey in obj) {
              if (Object.prototype.hasOwnProperty.call(obj, attrKey)) { attrs[attrKey] = obj[attrKey]; }
            }
          }
        }
        return {
          event_id: temporalStr(event.eventId),
          event_type: temporalStr(event.eventType),
          event_time: temporalStr(event.eventTime),
          attributes: attrs
        };
      }
      function temporalFormatSpec(spec) {
        spec = spec || {};
        if (Array.isArray(spec.cronExpressions) && spec.cronExpressions.length) {
          return spec.cronExpressions.map(temporalStr).join(', ');
        }
        if (Array.isArray(spec.interval) && spec.interval.length) {
          return spec.interval.map(function(item) {
            return 'every ' + temporalStr(item && item.interval || '?');
          }).join(', ');
        }
        if (Array.isArray(spec.calendar) && spec.calendar.length) { return 'calendar-based'; }
        return '';
      }
      function temporalMapScheduleListEntry(s) {
        s = s || {};
        var info = s.info || {};
        return {
          schedule_id: temporalStr(s.scheduleId),
          workflow_type: temporalStr(info.workflowType && info.workflowType.name),
          task_queue: '',
          spec_summary: temporalFormatSpec(info.spec),
          overlap_policy: '',
          state: 'active',
          recent_actions_count: Array.isArray(info.recentActions) ? info.recentActions.length : 0,
          next_action_times: Array.isArray(info.futureActionTimes) ? info.futureActionTimes.map(temporalStr) : []
        };
      }
      function temporalMapScheduleDetail(d, scheduleId) {
        d = d || {};
        var schedule = d.schedule || {};
        var action = schedule.action && schedule.action.startWorkflow || {};
        var policies = schedule.policies || {};
        var state = schedule.state || {};
        var info = d.info || {};
        var recentActions = Array.isArray(info.recentActions) ? info.recentActions : [];
        return {
          schedule_id: temporalStr(scheduleId),
          workflow_type: temporalStr(action.workflowType && action.workflowType.name),
          workflow_id: temporalStr(action.workflowId),
          task_queue: temporalStr(action.taskQueue && action.taskQueue.name),
          spec_summary: temporalFormatSpec(schedule.spec),
          overlap_policy: temporalStr(policies.overlapPolicy),
          catchup_window: temporalStr(policies.catchupWindow),
          paused: temporalBool(state.paused),
          notes: temporalStr(state.notes),
          action_count: temporalStr(info.actionCount || '0'),
          recent_actions: recentActions.map(function(a) {
            return {
              schedule_time: temporalStr(a && a.scheduleTime),
              actual_time: temporalStr(a && a.actualTime),
              workflow_id: temporalStr(a && a.startWorkflowResult && a.startWorkflowResult.workflowId),
              run_id: temporalStr(a && a.startWorkflowResult && a.startWorkflowResult.runId),
              status: temporalStr(a && a.startWorkflowStatus)
            };
          }),
          next_action_times: Array.isArray(info.futureActionTimes) ? info.futureActionTimes.map(temporalStr) : []
        };
      }
      function temporalMapPoller(p) {
        p = p || {};
        return {
          identity: temporalStr(p.identity),
          last_access_time: temporalStr(p.lastAccessTime),
          rate_per_second: temporalNum(p.ratePerSecond),
          worker_version_capabilities_build_id: temporalStr(p.workerVersionCapabilities && p.workerVersionCapabilities.buildId)
        };
      }
      async function temporalRead(requestOrigin, action, args) {
        args = args || {};
        if (!temporalAllowedOrigin(requestOrigin)) { return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-temporal-origin' }); }
        var ns = temporalResolveNamespace(args);
        if (!ns) { return fallback('temporal-namespace-unavailable'); }
        var encodedNs = encodeURIComponent(ns);
        var data;
        if (action === 'count_workflows') {
          data = await temporalApi(ns, '/namespaces/' + encodedNs + '/workflow-count', [
            ['query', args.query]
          ]);
          if (!data || data.success !== true) { return data; }
          return { success: true, status: data.status, data: { count: temporalStr(data.data && data.data.count || '0') } };
        }
        if (action === 'list_workflows') {
          data = await temporalApi(ns, '/namespaces/' + encodedNs + '/workflows', [
            ['query', args.query],
            ['maximumPageSize', args.page_size || 100],
            ['nextPageToken', args.next_page_token]
          ]);
          if (!data || data.success !== true) { return data; }
          return { success: true, status: data.status, data: {
            workflows: (Array.isArray(data.data && data.data.executions) ? data.data.executions : []).map(temporalMapWorkflowExecution),
            next_page_token: temporalStr(data.data && data.data.nextPageToken)
          } };
        }
        if (action === 'get_workflow') {
          data = await temporalApi(ns, '/namespaces/' + encodedNs + '/workflows/' + encodeURIComponent(temporalStr(args.workflow_id)), [
            ['execution.runId', args.run_id]
          ]);
          if (!data || data.success !== true) { return data; }
          return { success: true, status: data.status, data: temporalMapWorkflowDetail(data.data) };
        }
        if (action === 'get_workflow_history') {
          data = await temporalApi(ns, '/namespaces/' + encodedNs + '/workflows/' + encodeURIComponent(temporalStr(args.workflow_id)) + '/history', [
            ['execution.runId', args.run_id],
            ['maximumPageSize', args.page_size || 100],
            ['nextPageToken', args.next_page_token],
            ['waitNewEvent', args.wait_new_event]
          ]);
          if (!data || data.success !== true) { return data; }
          return { success: true, status: data.status, data: {
            events: (Array.isArray(data.data && data.data.history && data.data.history.events) ? data.data.history.events : []).map(temporalMapHistoryEvent),
            next_page_token: temporalStr(data.data && data.data.nextPageToken)
          } };
        }
        if (action === 'list_schedules') {
          data = await temporalApi(ns, '/namespaces/' + encodedNs + '/schedules', [
            ['maximumPageSize', args.page_size || 100],
            ['nextPageToken', args.next_page_token]
          ]);
          if (!data || data.success !== true) { return data; }
          return { success: true, status: data.status, data: {
            schedules: (Array.isArray(data.data && data.data.schedules) ? data.data.schedules : []).map(temporalMapScheduleListEntry),
            next_page_token: temporalStr(data.data && data.data.nextPageToken)
          } };
        }
        if (action === 'get_schedule') {
          data = await temporalApi(ns, '/namespaces/' + encodedNs + '/schedules/' + encodeURIComponent(temporalStr(args.schedule_id)), []);
          if (!data || data.success !== true) { return data; }
          return { success: true, status: data.status, data: temporalMapScheduleDetail(data.data, args.schedule_id) };
        }
        if (action === 'get_task_queue') {
          data = await temporalApi(ns, '/namespaces/' + encodedNs + '/task-queues/' + encodeURIComponent(temporalStr(args.task_queue)), []);
          if (!data || data.success !== true) { return data; }
          var rate = data.data && data.data.effectiveRateLimit || {};
          return { success: true, status: data.status, data: {
            pollers: (Array.isArray(data.data && data.data.pollers) ? data.data.pollers : []).map(temporalMapPoller),
            rate_limit_per_second: temporalNum(rate.requestsPerSecond),
            rate_limit_source: temporalStr(rate.rateLimitSource)
          } };
        }
        if (action === 'get_settings') {
          data = await temporalApi(ns, '/settings', []);
          if (!data || data.success !== true) { return data; }
          var settings = data.data || {};
          return { success: true, status: data.status, data: {
            version: temporalStr(settings.Version),
            disable_write_actions: temporalBool(settings.DisableWriteActions),
            workflow_terminate_disabled: temporalBool(settings.WorkflowTerminateDisabled),
            workflow_cancel_disabled: temporalBool(settings.WorkflowCancelDisabled),
            workflow_signal_disabled: temporalBool(settings.WorkflowSignalDisabled),
            workflow_reset_disabled: temporalBool(settings.WorkflowResetDisabled),
            workflow_pause_disabled: temporalBool(settings.WorkflowPauseDisabled),
            start_workflow_disabled: temporalBool(settings.StartWorkflowDisabled),
            batch_actions_disabled: temporalBool(settings.BatchActionsDisabled)
          } };
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-temporal-page-read-action' });
      }

      var CLICKUP_REPRESENTATIVE_API_BASE = 'https://api.clickup.com';
      function cuStr(value) {
        return value === undefined || value === null ? '' : String(value);
      }
      function cuNum(value) {
        var n = Number(value);
        return Number.isFinite(n) ? n : 0;
      }
      function cuBool(value) {
        return value === true;
      }
      function cuList(value) {
        return Array.isArray(value) ? value : [];
      }
      function cuObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      }
      function cuNullableString(value) {
        return value === undefined || value === null ? null : String(value);
      }
      function cuJson(raw) {
        if (!raw || typeof raw !== 'string') { return null; }
        try { return JSON.parse(raw); } catch (_jsonErr) { return null; }
      }
      function cuLocalStorageGet(key) {
        try {
          return (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function')
            ? localStorage.getItem(key)
            : null;
        } catch (_storageErr) {
          return null;
        }
      }
      function cuAllowedApiBase(value) {
        try {
          var parsed = new URL(String(value || ''));
          var host = parsed.hostname.toLowerCase();
          if (parsed.protocol !== 'https:') { return ''; }
          if (host !== 'clickup.com' && host.slice(-12) !== '.clickup.com') { return ''; }
          return parsed.origin + parsed.pathname.replace(/\/$/, '');
        } catch (_urlErr) {
          return '';
        }
      }
      function cuHandshake() {
        var parsed = cuJson(cuLocalStorageGet('cuHandshake'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      }
      function cuAuth(args) {
        var token = '';
        try {
          token = typeof globalThis.__cu_captured_jwt === 'string' ? globalThis.__cu_captured_jwt : '';
        } catch (_tokenErr) {
          token = '';
        }
        if (!token) { return null; }
        var handshake = cuHandshake();
        if (!handshake) { return null; }
        var capturedWorkspace = '';
        try {
          capturedWorkspace = typeof globalThis.__cu_captured_team_id === 'string'
            ? globalThis.__cu_captured_team_id
            : '';
        } catch (_teamErr) {
          capturedWorkspace = '';
        }
        var keys = Object.keys(handshake);
        var workspaceId = cuStr(args && args.workspace_id) || capturedWorkspace || cuStr(keys[0]);
        if (!workspaceId) { return null; }
        var entry = cuObject(handshake[workspaceId] || handshake[keys[0]]);
        var env = cuObject(entry.appEnvironment);
        var apiBase = cuAllowedApiBase(env.apiUrlBase);
        if (!apiBase) { return null; }
        return {
          token: token,
          apiBase: apiBase,
          workspaceId: workspaceId
        };
      }
      function cuQuery(pairs) {
        var parts = [];
        pairs = Array.isArray(pairs) ? pairs : [];
        for (var i = 0; i < pairs.length; i++) {
          var pair = pairs[i] || [];
          if (pair[1] === undefined || pair[1] === null || pair[1] === '') { continue; }
          parts.push(encodeURIComponent(pair[0]) + '=' + encodeURIComponent(String(pair[1])));
        }
        return parts.length ? '?' + parts.join('&') : '';
      }
      async function cuApi(endpoint, pairs, args) {
        var auth = cuAuth(args || {});
        if (!auth) { return fallback('clickup-auth-unavailable'); }
        try {
          var response = await fetch(auth.apiBase + endpoint + cuQuery(pairs), {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Authorization': 'Bearer ' + auth.token
            },
            credentials: 'include',
            redirect: 'manual'
          });
          if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403) {
            return fallback('clickup-auth-failed');
          }
          if (!response.ok) { return fallback('clickup-http-status-' + response.status); }
          var data = await response.json();
          return { success: true, status: response.status, data: data, auth: auth };
        } catch (_fetchErr) {
          return fallback('clickup-network-or-json-error');
        }
      }
      function cuMapUser(u) {
        u = cuObject(u);
        return {
          id: cuNum(u.id),
          username: cuStr(u.username),
          email: cuStr(u.email),
          color: cuStr(u.color),
          initials: cuStr(u.initials),
          profile_picture: cuNullableString(u.profilePicture !== undefined ? u.profilePicture : u.profile_picture),
          timezone: cuStr(u.timezone)
        };
      }
      function cuMapMember(m) {
        m = cuObject(m);
        var user = cuObject(m.user);
        return {
          id: cuNum(user.id),
          username: cuStr(user.username),
          email: cuStr(user.email),
          color: cuStr(user.color),
          initials: cuStr(user.initials),
          profile_picture: cuNullableString(user.profilePicture !== undefined ? user.profilePicture : user.profile_picture),
          role: cuNum(m.role)
        };
      }
      function cuMapWorkspace(w) {
        w = cuObject(w);
        var owner = cuObject(w.owner);
        return {
          id: cuStr(w.id),
          name: cuStr(w.name),
          color: cuStr(w.color),
          plan_id: cuStr(w.plan_id),
          member_count: cuNum(w.billed_users_this_cycle),
          date_created: cuStr(w.date_created),
          owner: {
            id: cuNum(owner.id),
            username: cuStr(owner.username),
            email: cuStr(owner.email),
            color: cuStr(owner.color),
            initials: cuStr(owner.initials),
            profile_picture: cuNullableString(owner.profilePicture !== undefined ? owner.profilePicture : owner.profile_picture)
          }
        };
      }
      function cuMapSpace(s) {
        s = cuObject(s);
        return {
          id: cuStr(s.id),
          name: cuStr(s.name),
          color: cuStr(s.color),
          private: cuBool(s.private),
          archived: cuBool(s.archived),
          date_created: cuStr(s.date_created),
          multiple_assignees: cuBool(s.multiple_assignees)
        };
      }
      function cuMapFolder(f) {
        f = cuObject(f);
        return {
          id: cuStr(f.id),
          name: cuStr(f.name),
          orderindex: cuNum(f.orderindex),
          archived: cuBool(f.archived),
          hidden: cuBool(f.hidden),
          space_id: cuStr(f.project_id),
          date_updated: cuStr(f.date_updated)
        };
      }
      function cuMapList(l) {
        l = cuObject(l);
        return {
          id: cuStr(l.id),
          name: cuStr(l.name),
          orderindex: cuNum(l.orderindex),
          archived: cuBool(l.archived),
          due_date: cuNullableString(l.due_date),
          start_date: cuNullableString(l.start_date),
          folder_id: cuStr(cuObject(l.category).id),
          space_id: cuStr(cuObject(l.project).id),
          date_updated: cuStr(l.date_updated),
          task_count: cuNum(l.task_count)
        };
      }
      function cuMapGoal(g) {
        g = cuObject(g);
        return {
          id: cuStr(g.id),
          name: cuStr(g.name),
          description: cuStr(g.description),
          color: cuStr(g.color),
          date_created: cuStr(g.date_created),
          due_date: cuNullableString(g.due_date),
          percent_completed: cuNum(g.percent_completed),
          owner_id: cuNum(g.creator),
          folder_id: cuNullableString(g.folder_id),
          multiple_owners: cuBool(g.multiple_owners),
          key_result_count: cuList(g.key_results).length
        };
      }
      function cuMapCustomField(f) {
        f = cuObject(f);
        return {
          id: cuStr(f.id),
          name: cuStr(f.name),
          type: cuStr(f.type),
          required: cuBool(f.required)
        };
      }
      function cuSuccess(data) {
        return { success: true, status: 200, data: data };
      }
      function cuWorkspaceId(args) {
        var auth = cuAuth(args || {});
        return auth ? auth.workspaceId : '';
      }
      function cuRequireObject(result, reason) {
        if (!result || result.success === false) { return result; }
        return result.data && typeof result.data === 'object' && !Array.isArray(result.data)
          ? result
          : fallback(reason);
      }
      function cuRequireArray(result, reason) {
        if (!result || result.success === false) { return result; }
        return Array.isArray(result.data) ? result : fallback(reason);
      }
      async function clickupRead(action, args) {
        args = args || {};
        var result;
        var workspaceId;
        if (action === 'get_current_user') {
          result = cuRequireObject(await cuApi('/user/v1/user/me', [], args), 'clickup-user-shape-mismatch');
          if (result && result.success === false) { return result; }
          return cuSuccess({ user: cuMapUser(result.data) });
        }
        if (action === 'get_workspace') {
          workspaceId = cuStr(args.workspace_id) || cuWorkspaceId(args);
          if (!workspaceId) { return fallback('clickup-workspace-unavailable'); }
          result = cuRequireObject(await cuApi('/team/v1/team/' + encodeURIComponent(workspaceId), [], args), 'clickup-workspace-shape-mismatch');
          if (result && result.success === false) { return result; }
          return cuSuccess({ workspace: cuMapWorkspace(result.data) });
        }
        if (action === 'get_workspace_members') {
          workspaceId = cuStr(args.workspace_id) || cuWorkspaceId(args);
          if (!workspaceId) { return fallback('clickup-workspace-unavailable'); }
          result = cuRequireObject(await cuApi('/v1/team/' + encodeURIComponent(workspaceId) + '/member', [], args), 'clickup-members-shape-mismatch');
          if (result && result.success === false) { return result; }
          return cuSuccess({ members: cuList(result.data.members).map(cuMapMember) });
        }
        if (action === 'get_spaces') {
          workspaceId = cuStr(args.workspace_id) || cuWorkspaceId(args);
          if (!workspaceId) { return fallback('clickup-workspace-unavailable'); }
          result = cuRequireArray(await cuApi('/hierarchy/v1/project', [
            ['team', workspaceId],
            ['include_archived', args.include_archived === true]
          ], args), 'clickup-spaces-shape-mismatch');
          if (result && result.success === false) { return result; }
          return cuSuccess({ spaces: cuList(result.data).map(cuMapSpace) });
        }
        if (action === 'get_space') {
          result = cuRequireObject(await cuApi('/hierarchy/v1/project/' + encodeURIComponent(cuStr(args.space_id)), [], args), 'clickup-space-shape-mismatch');
          if (result && result.success === false) { return result; }
          return cuSuccess({ space: cuMapSpace(result.data) });
        }
        if (action === 'get_folders') {
          result = cuRequireObject(await cuApi('/hierarchy/v1/project/' + encodeURIComponent(cuStr(args.space_id)) + '/category', [
            ['include_archived', args.include_archived === true]
          ], args), 'clickup-folders-shape-mismatch');
          if (result && result.success === false) { return result; }
          return cuSuccess({ folders: cuList(result.data.categories).map(cuMapFolder) });
        }
        if (action === 'get_folder') {
          result = cuRequireObject(await cuApi('/hierarchy/v1/category/' + encodeURIComponent(cuStr(args.folder_id)), [], args), 'clickup-folder-shape-mismatch');
          if (result && result.success === false) { return result; }
          return cuSuccess({ folder: cuMapFolder(result.data) });
        }
        if (action === 'get_lists') {
          result = cuRequireObject(await cuApi('/hierarchy/v1/category/' + encodeURIComponent(cuStr(args.folder_id)) + '/subcategory', [
            ['include_archived', args.include_archived === true]
          ], args), 'clickup-lists-shape-mismatch');
          if (result && result.success === false) { return result; }
          return cuSuccess({ lists: cuList(result.data.subcategories).map(cuMapList) });
        }
        if (action === 'get_list') {
          result = cuRequireObject(await cuApi('/hierarchy/v1/subcategory/' + encodeURIComponent(cuStr(args.list_id)), [], args), 'clickup-list-shape-mismatch');
          if (result && result.success === false) { return result; }
          return cuSuccess({ list: cuMapList(result.data) });
        }
        if (action === 'get_goals') {
          workspaceId = cuStr(args.workspace_id) || cuWorkspaceId(args);
          if (!workspaceId) { return fallback('clickup-workspace-unavailable'); }
          result = cuRequireObject(await cuApi('/v1/team/' + encodeURIComponent(workspaceId) + '/goal', [], args), 'clickup-goals-shape-mismatch');
          if (result && result.success === false) { return result; }
          return cuSuccess({ goals: cuList(result.data.goals).map(cuMapGoal) });
        }
        if (action === 'get_custom_fields') {
          workspaceId = cuStr(args.workspace_id) || cuWorkspaceId(args);
          if (!workspaceId) { return fallback('clickup-workspace-unavailable'); }
          result = cuRequireObject(await cuApi('/customFields/v1/team/' + encodeURIComponent(workspaceId) + '/fields', [], args), 'clickup-fields-shape-mismatch');
          if (result && result.success === false) { return result; }
          return cuSuccess({ fields: cuList(result.data.fields).map(cuMapCustomField) });
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-clickup-page-read-action' });
      }

      var CLICKHOUSE_AUTH_KEY = '@@auth0spajs@@::IPpH4RND0qNXHVayepffgsGpbXQmFikr::control-plane-web::openid profile email';
      var CLICKHOUSE_CACHE_PREFIX = '__uc_cache__:';
      function chStr(value) {
        return value === undefined || value === null ? '' : String(value);
      }
      function chNum(value) {
        var n = Number(value);
        return Number.isFinite(n) ? n : 0;
      }
      function chBool(value) {
        return value === true;
      }
      function chToISOString(value) {
        if (value === undefined || value === null || value === '') { return ''; }
        if (typeof value === 'number') {
          try { return new Date(value).toISOString(); } catch (_dateErr) { return ''; }
        }
        return String(value);
      }
      function chJson(raw) {
        if (!raw || typeof raw !== 'string') { return null; }
        try { return JSON.parse(raw); } catch (_jsonErr) { return null; }
      }
      function chLocalStorageGet(key) {
        try {
          return (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function')
            ? localStorage.getItem(key)
            : null;
        } catch (_storageErr) {
          return null;
        }
      }
      function chAuth() {
        var entry = chJson(chLocalStorageGet(CLICKHOUSE_AUTH_KEY));
        var token = entry && entry.body && entry.body.access_token;
        var expiresAt = chNum(entry && entry.expiresAt);
        if (!token || (expiresAt > 0 && expiresAt < Date.now() / 1000)) { return null; }
        return { accessToken: String(token) };
      }
      function chCache(cacheKey) {
        try {
          if (typeof localStorage === 'undefined' || !localStorage) { return null; }
          var prefix = CLICKHOUSE_CACHE_PREFIX + cacheKey + ':';
          for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (!key || key.indexOf(prefix) !== 0) { continue; }
            var parsed = chJson(chLocalStorageGet(key));
            if (parsed !== null) { return parsed; }
          }
        } catch (_cacheErr) {
          return null;
        }
        return null;
      }
      function chOrgId() {
        var direct = chLocalStorageGet('currentOrganizationId');
        if (direct) { return String(direct); }
        var orgs = chCache('organizations');
        if (Array.isArray(orgs) && orgs[0] && orgs[0].id) { return String(orgs[0].id); }
        return '';
      }
      function chApiBase() {
        try {
          var cfg = globalThis && globalThis.consoleConfig;
          var host = cfg && cfg.controlPlane && cfg.controlPlane.apiHost;
          if (typeof host === 'string' && host) { return host.replace(/\/$/, ''); }
        } catch (_cfgErr) {
          // Fall through to the documented default.
        }
        return 'https://control-plane-internal.clickhouse.cloud';
      }
      async function chApi(endpoint, body) {
        var auth = chAuth();
        if (!auth) { return fallback('clickhouse-auth-unavailable'); }
        try {
          var response = await fetch(chApiBase() + endpoint, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + auth.accessToken
            },
            body: JSON.stringify(body || {}),
            credentials: 'include',
            redirect: 'manual'
          });
          if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403) {
            return fallback('clickhouse-auth-failed');
          }
          if (!response.ok) { return fallback('clickhouse-http-status-' + response.status); }
          return { success: true, status: response.status, data: response.status === 204 ? {} : await response.json() };
        } catch (_fetchErr) {
          return fallback('clickhouse-network-error');
        }
      }
      function chEndpointList(endpoints) {
        var out = [];
        if (!endpoints || typeof endpoints !== 'object') { return out; }
        for (var protocol in endpoints) {
          if (!Object.prototype.hasOwnProperty.call(endpoints, protocol)) { continue; }
          var ep = endpoints[protocol] || {};
          out.push({
            protocol: chStr(protocol),
            hostname: chStr(ep.hostname),
            port: chNum(ep.port)
          });
        }
        return out;
      }
      function chMapIpAccessList(entries) {
        var raw = Array.isArray(entries) ? entries : [];
        return raw.map(function(entry) {
          entry = entry || {};
          return { source: chStr(entry.source), description: chStr(entry.description) };
        });
      }
      function chMapOrganization(org) {
        org = org || {};
        var trial = org.cachedCommitmentState && org.cachedCommitmentState.TRIAL;
        return {
          id: chStr(org.id),
          name: chStr(org.name),
          billing_status: chStr(org.billingStatus),
          tier: chStr(org.tier),
          created_at: chToISOString(org.createdAt),
          trial_remaining_days: chNum(trial && trial.timeRemainingInDays),
          trial_amount_remaining: chNum(trial && trial.amountRemaining)
        };
      }
      function chMapService(service) {
        service = service || {};
        return {
          id: chStr(service.id),
          name: chStr(service.name),
          state: chStr(service.state),
          region: chStr(service.regionId),
          cloud_provider: chStr(service.cloudProvider),
          clickhouse_version: chStr(service.clickhouseVersion),
          endpoints: chEndpointList(service.endpoints),
          min_replica_memory_gb: chNum(service.minAutoScalingReplicaMemory),
          max_replica_memory_gb: chNum(service.maxAutoScalingReplicaMemory),
          num_replicas: chNum(service.maxReplicas || service.minReplicas),
          idle_scaling: chBool(service.enableIdleScaling),
          idle_timeout_minutes: chNum(service.idleTimeoutMinutes),
          created_at: chToISOString(service.creationDate),
          data_warehouse_id: chStr(service.dataWarehouseId),
          is_primary: chBool(service.isPrimary),
          is_readonly: chBool(service.isReadonly),
          release_channel: chStr(service.releaseChannel),
          ip_access_list: chMapIpAccessList(service.ipAccessList)
        };
      }
      function chMapMember(member) {
        member = member || {};
        return {
          user_id: chStr(member.userId),
          name: chStr(member.name),
          email: chStr(member.email),
          role: chStr(member.role),
          joined_at: chToISOString(member.joinedAt)
        };
      }
      function chMapBackup(backup) {
        backup = backup || {};
        return {
          id: chStr(backup.id),
          status: chStr(backup.status),
          started_at: chStr(backup.startedAt),
          finished_at: chStr(backup.finishedAt),
          size_bytes: chNum(backup.sizeInBytes),
          duration_seconds: chNum(backup.durationInSeconds),
          type: chStr(backup.type)
        };
      }
      function chFindById(list, id) {
        var items = Array.isArray(list) ? list : [];
        for (var i = 0; i < items.length; i++) {
          if (items[i] && String(items[i].id || '') === String(id || '')) { return items[i]; }
        }
        return null;
      }
      function chNeedOrgId() {
        var orgId = chOrgId();
        return orgId ? { success: true, orgId: orgId } : fallback('clickhouse-organization-context-unavailable');
      }
      async function chRead(action, args) {
        args = args || {};
        if (action === 'get_status') {
          try {
            var statusResponse = await fetch('https://statuspage.incident.io/clickhousecloud/api/v1/summary', {
              headers: { 'Accept': 'application/json' },
              credentials: 'omit'
            });
            if (!statusResponse.ok) { return fallback('clickhouse-status-http-' + statusResponse.status); }
            var statusJson = await statusResponse.json();
            return { success: true, status: statusResponse.status, data: { status: {
              status: chStr(statusJson && statusJson.status && statusJson.status.indicator),
              active_incidents: Array.isArray(statusJson && statusJson.ongoing_incidents) ? statusJson.ongoing_incidents.length : 0,
              active_maintenances: Array.isArray(statusJson && statusJson.in_progress_maintenances) ? statusJson.in_progress_maintenances.length : 0
            } } };
          } catch (_statusErr) {
            return fallback('clickhouse-status-page-unavailable');
          }
        }

        var orgContext;
        var orgs;
        var org;
        var instances;
        var service;
        if (action === 'get_organization' || action === 'list_organization_members' || action === 'list_services' ||
            action === 'get_private_endpoint_config' || action === 'list_backups' || action === 'query_metrics') {
          orgContext = chNeedOrgId();
          if (!orgContext || orgContext.success !== true) { return orgContext; }
        }
        if (action === 'get_organization') {
          orgs = chCache('organizations');
          org = chFindById(orgs, orgContext.orgId);
          if (!org) { return fallback('clickhouse-organization-cache-unavailable'); }
          return { success: true, status: 200, data: { organization: chMapOrganization(org) } };
        }
        if (action === 'list_organization_members') {
          orgs = chCache('organizations');
          org = chFindById(orgs, orgContext.orgId);
          if (!org) { return fallback('clickhouse-organization-cache-unavailable'); }
          var users = org.users && typeof org.users === 'object' ? org.users : {};
          var members = [];
          for (var userId in users) {
            if (Object.prototype.hasOwnProperty.call(users, userId)) { members.push(chMapMember(users[userId])); }
          }
          return { success: true, status: 200, data: { members: members } };
        }
        if (action === 'list_services') {
          instances = chCache('instances');
          if (!Array.isArray(instances)) { return fallback('clickhouse-service-cache-unavailable'); }
          return { success: true, status: 200, data: {
            services: instances.filter(function(item) {
              return item && String(item.organizationId || '') === orgContext.orgId;
            }).map(chMapService)
          } };
        }
        if (action === 'get_service') {
          instances = chCache('instances');
          service = chFindById(instances, args.service_id);
          if (!service) { return fallback('clickhouse-service-cache-unavailable'); }
          return { success: true, status: 200, data: { service: chMapService(service) } };
        }
        if (action === 'get_scaling_limits') {
          var limits = await chApi('/api/autoScaling', {
            rpcAction: 'getLimits',
            regionId: chStr(args.region)
          });
          if (!limits || limits.success !== true) { return limits; }
          return { success: true, status: limits.status, data: { limits: {
            min_replica_memory_gb: chNum(limits.data && limits.data.minReplicaMemoryGb),
            max_replica_memory_gb: chNum(limits.data && limits.data.maxReplicaMemoryGb),
            min_total_memory_gb: chNum(limits.data && limits.data.minMemoryGb),
            max_total_memory_gb: chNum(limits.data && limits.data.maxMemoryGb)
          } } };
        }
        if (action === 'get_private_endpoint_config') {
          var config = await chApi('/api/instance', {
            rpcAction: 'getPrivateEndpointConfig',
            organizationId: orgContext.orgId,
            instanceId: chStr(args.service_id)
          });
          if (!config || config.success !== true) { return config; }
          return { success: true, status: config.status, data: { config: {
            endpoint_service_id: chStr(config.data && config.data.endpointServiceId),
            private_dns_hostname: chStr(config.data && config.data.privateDnsHostname)
          } } };
        }
        if (action === 'list_backups') {
          var backups = await chApi('/api/backup', {
            rpcAction: 'list',
            organizationId: orgContext.orgId,
            instanceId: chStr(args.service_id)
          });
          if (!backups || backups.success !== true) { return backups; }
          var backupList = Array.isArray(backups.data && backups.data.backups) ? backups.data.backups : [];
          return { success: true, status: backups.status, data: { backups: backupList.map(chMapBackup) } };
        }
        if (action === 'query_metrics') {
          var period = chStr(args.time_period) || 'LAST_HOUR';
          var metrics = await chApi('/api/metrics/queryMetrics', {
            organizationId: orgContext.orgId,
            instanceId: chStr(args.service_id),
            batch: [{ type: chStr(args.metric_type), timePeriod: period }]
          });
          if (!metrics || metrics.success !== true) { return metrics; }
          var batchEntry = metrics.data && Array.isArray(metrics.data.batch) ? metrics.data.batch[0] : null;
          var rawPoints = batchEntry && Array.isArray(batchEntry.data) && Array.isArray(batchEntry.data[0]) ? batchEntry.data[0] : [];
          return { success: true, status: metrics.status, data: {
            data_points: rawPoints.map(function(point) {
              return { timestamp: chNum(point && point[0]), value: chNum(point && point[1]) };
            }),
            metric_type: chStr(args.metric_type),
            time_period: period
          } };
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-clickhouse-page-read-action' });
      }
      function sfNumeracy() {
        return (typeof globalThis !== 'undefined' && globalThis.numeracy) ? globalThis.numeracy : null;
      }
      function sfRequestContext() {
        var numeracy = sfNumeracy();
        var backendHttp = numeracy && numeracy.api && numeracy.api.backendHttp;
        if (!backendHttp || typeof backendHttp.getRequestContext !== 'function') { return null; }
        try {
          return backendHttp.getRequestContext();
        } catch (ctxErr) {
          return null;
        }
      }
      function sfSessionData() {
        var numeracy = sfNumeracy();
        var ctx = sfRequestContext();
        if (!numeracy || !ctx) { return null; }
        var user = numeracy.pageState && numeracy.pageState.user;
        var org = numeracy.stores && numeracy.stores.organization && numeracy.stores.organization.activeOrg;
        return {
          appServerUrl: String(ctx.appServerUrl || ''),
          decodedUserKey: String(ctx.decodedUserKey || ''),
          role: String(ctx.role || ''),
          isSecondaryUser: !!ctx.isSecondaryUser,
          userKey: String(ctx.userKey || ''),
          userEmail: String((user && user.email) || ''),
          orgId: String((org && org.id) || ''),
          orgShortName: String((org && org.shortName) || '')
        };
      }
      async function sfListEntities(args) {
        var numeracy = sfNumeracy();
        var session = sfSessionData();
        if (!numeracy || !session || !session.orgId) {
          return fallback('snowflake-auth-or-org-unavailable');
        }
        var entityApi = numeracy.stores && numeracy.stores.entity && numeracy.stores.entity.api;
        if (!entityApi || typeof entityApi.post !== 'function') {
          return fallback('snowflake-entity-api-unavailable');
        }
        var options = {
          sort: { col: 'modified', dir: 'desc' },
          limit: positiveInt(args.limit, 50, 100),
          owner: args.owner === undefined ? null : args.owner,
          types: Array.isArray(args.types) ? args.types : ['query', 'folder'],
          showNeverViewed: 'if-invited',
          excludeModels: true
        };
        if (args.cursor) { options.from = String(args.cursor); }
        try {
          var result = await entityApi.post({
            path: '/organizations/' + encodeURIComponent(session.orgId) + '/entities/list',
            data: {
              options: JSON.stringify(options),
              location: String(args.location || 'worksheets')
            }
          });
          return { success: true, status: 200, data: {
            entities: Array.isArray(result && result.entities) ? result.entities : [],
            next: String((result && result.next) || '')
          } };
        } catch (entityErr) {
          return fallback('snowflake-entity-api-error');
        }
      }
      function sfRead(action, args) {
        var numeracy = sfNumeracy();
        if (action === 'diagnose') {
          var ctx = sfRequestContext();
          var user = numeracy && numeracy.pageState && numeracy.pageState.user;
          var stores = numeracy && numeracy.stores;
          var org = stores && stores.organization && stores.organization.activeOrg;
          return { success: true, status: 200, data: {
            available: !!numeracy,
            url: (typeof globalThis !== 'undefined' && globalThis.location) ? String(globalThis.location.href || '') : '',
            hasRequestContext: !!ctx,
            appServerUrl: String((ctx && ctx.appServerUrl) || ''),
            role: String((ctx && ctx.role) || ''),
            hasUser: !!(user && user.id),
            orgId: String((org && org.id) || ''),
            storeKeys: stores ? Object.keys(stores) : [],
            hasNufetch: !!(numeracy && typeof numeracy.nufetch === 'function')
          } };
        }
        if (action === 'get_context') {
          var session = sfSessionData();
          if (!session || !session.appServerUrl || !session.decodedUserKey) {
            return fallback('snowflake-context-unavailable');
          }
          return { success: true, status: 200, data: session };
        }
        if (action === 'list_entities') {
          return sfListEntities(args);
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-snowflake-page-read-action' });
      }
      function airbnbIsObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
      }
      function airbnbList(value) {
        return Array.isArray(value) ? value : [];
      }
      function airbnbStr(value) {
        return value === undefined || value === null ? '' : String(value);
      }
      function airbnbNullableString(value) {
        return value === undefined || value === null ? null : String(value);
      }
      function airbnbExtractString(obj, key) {
        if (!airbnbIsObject(obj)) { return null; }
        return typeof obj[key] === 'string' ? obj[key] : null;
      }
      function airbnbFirstString(values) {
        for (var i = 0; i < values.length; i++) {
          if (values[i] !== undefined && values[i] !== null && String(values[i]) !== '') {
            return String(values[i]);
          }
        }
        return '';
      }
      function airbnbPageUrl() {
        return (typeof globalThis !== 'undefined' && globalThis.location)
          ? String(globalThis.location.href || '')
          : '';
      }
      function airbnbPageData() {
        var deferredEl = document.getElementById('data-deferred-state-0');
        if (deferredEl && deferredEl.textContent) {
          var deferred = parseJson(deferredEl.textContent);
          if (deferred && typeof deferred === 'object') { return deferred; }
        }
        var injectorEl = document.getElementById('data-injector-instances');
        if (injectorEl && injectorEl.textContent) {
          var injected = parseJson(injectorEl.textContent);
          if (injected && typeof injected === 'object') { return injected; }
        }
        return null;
      }
      function airbnbFindListings(obj, depth) {
        if (depth > 15 || obj === null || obj === undefined) { return null; }
        if (Array.isArray(obj)) {
          if (obj.length > 0 && airbnbIsObject(obj[0])
              && (obj[0].listing || obj[0].avgRatingLocalized || obj[0].pricingQuote)) {
            return obj;
          }
          for (var i = 0; i < obj.length; i++) {
            var foundItem = airbnbFindListings(obj[i], depth + 1);
            if (foundItem) { return foundItem; }
          }
        } else if (airbnbIsObject(obj)) {
          var keys = Object.keys(obj);
          for (var j = 0; j < keys.length; j++) {
            var foundValue = airbnbFindListings(obj[keys[j]], depth + 1);
            if (foundValue) { return foundValue; }
          }
        }
        return null;
      }
      function airbnbExtractListing(item) {
        var raw = airbnbIsObject(item) ? item : {};
        var listing = airbnbIsObject(raw.listing) ? raw.listing : raw;
        var id = airbnbStr(listing.id || raw.id);
        var priceQuote = airbnbIsObject(raw.pricingQuote) ? raw.pricingQuote : {};
        var contextualPictures = listing.contextualPictures || raw.contextualPictures;
        var imageUrl = null;
        if (Array.isArray(contextualPictures) && contextualPictures.length > 0) {
          imageUrl = airbnbExtractString(contextualPictures[0], 'picture');
        }
        return {
          id: id,
          name: airbnbFirstString([
            airbnbExtractString(listing, 'name'),
            airbnbExtractString(listing, 'title'),
            airbnbExtractString(raw, 'name')
          ]),
          listing_url: id ? 'https://www.airbnb.com/rooms/' + encodeURIComponent(id) : '',
          price_string: airbnbFirstString([
            airbnbExtractString(priceQuote, 'priceString'),
            airbnbExtractString(priceQuote, 'price')
          ]),
          rating: airbnbFirstString([
            airbnbExtractString(raw, 'avgRatingLocalized'),
            airbnbExtractString(listing, 'avgRatingLocalized')
          ]),
          review_count: typeof raw.reviewsCount === 'number'
            ? raw.reviewsCount
            : (typeof listing.reviewsCount === 'number' ? listing.reviewsCount : 0),
          room_type: airbnbFirstString([
            airbnbExtractString(listing, 'roomTypeCategory'),
            airbnbExtractString(listing, 'roomType')
          ]),
          city: airbnbStr(listing.city),
          image_url: imageUrl
        };
      }
      function airbnbFindListingDetail(obj, depth) {
        if (depth > 15 || obj === null || obj === undefined) { return null; }
        if (airbnbIsObject(obj)) {
          if (obj.pdpSections || (obj.listingTitle && obj.listingDescription)) { return obj; }
          var keys = Object.keys(obj);
          for (var i = 0; i < keys.length; i++) {
            var found = airbnbFindListingDetail(obj[keys[i]], depth + 1);
            if (found) { return found; }
          }
        } else if (Array.isArray(obj)) {
          for (var j = 0; j < obj.length; j++) {
            var foundItem = airbnbFindListingDetail(obj[j], depth + 1);
            if (foundItem) { return foundItem; }
          }
        }
        return null;
      }
      function airbnbFindAmenities(obj, depth) {
        if (depth > 10 || obj === null || obj === undefined) { return []; }
        if (Array.isArray(obj)) {
          var names = [];
          for (var i = 0; i < obj.length; i++) {
            if (airbnbIsObject(obj[i]) && typeof obj[i].title === 'string') {
              names.push(obj[i].title);
            }
          }
          if (names.length) { return names; }
          for (var ai = 0; ai < obj.length; ai++) {
            var fromItem = airbnbFindAmenities(obj[ai], depth + 1);
            if (fromItem.length) { return fromItem; }
          }
        } else if (airbnbIsObject(obj)) {
          if (obj.amenities) { return airbnbFindAmenities(obj.amenities, depth + 1); }
          var keys = Object.keys(obj);
          for (var j = 0; j < keys.length; j++) {
            var found = airbnbFindAmenities(obj[keys[j]], depth + 1);
            if (found.length) { return found; }
          }
        }
        return [];
      }
      function airbnbFindImageUrls(obj, depth) {
        if (depth > 10 || obj === null || obj === undefined) { return []; }
        if (Array.isArray(obj)) {
          var urls = [];
          for (var i = 0; i < obj.length; i++) {
            if (airbnbIsObject(obj[i])) {
              var url = obj[i].baseUrl || obj[i].url || obj[i].picture;
              if (typeof url === 'string' && url.indexOf('http') === 0) { urls.push(url); }
            }
          }
          if (urls.length) { return urls.slice(0, 10); }
          for (var ai = 0; ai < obj.length; ai++) {
            var fromItem = airbnbFindImageUrls(obj[ai], depth + 1);
            if (fromItem.length) { return fromItem; }
          }
        } else if (airbnbIsObject(obj)) {
          if (obj.photos) { return airbnbFindImageUrls(obj.photos, depth + 1); }
          if (obj.images) { return airbnbFindImageUrls(obj.images, depth + 1); }
          if (obj.photoTour) { return airbnbFindImageUrls(obj.photoTour, depth + 1); }
        }
        return [];
      }
      function airbnbExtractStringArray(obj, key) {
        if (!airbnbIsObject(obj) || !Array.isArray(obj[key])) { return []; }
        return obj[key].filter(function (value) {
          return typeof value === 'string';
        });
      }
      function airbnbRoomIdFromUrl() {
        var href = airbnbPageUrl();
        var match = href.match(/\/rooms\/(\d+)/);
        return match && match[1] ? match[1] : '';
      }
      function airbnbCookieValue(name) {
        var raw = '';
        try { raw = String(document.cookie || ''); } catch (err) { raw = ''; }
        var prefix = '; ' + String(name || '') + '=';
        var parts = ('; ' + raw).split(prefix);
        if (parts.length !== 2) { return ''; }
        var tail = parts.pop().split(';').shift();
        try { return decodeURIComponent(tail); } catch (decodeErr) { return tail; }
      }
      function airbnbUserAttributes() {
        var parsed = parseJson(airbnbCookieValue('_user_attributes'));
        return parsed && typeof parsed === 'object' ? parsed : {};
      }
      function airbnbRead(action) {
        if (action === 'get_user_attributes') {
          var attrs = airbnbUserAttributes();
          return { success: true, status: 200, data: {
            id: airbnbStr(attrs.id_str || attrs.id),
            currency: airbnbStr(attrs.curr || 'USD')
          } };
        }
        if (action === 'get_search_results') {
          var searchData = airbnbPageData();
          var pageUrl = airbnbPageUrl();
          if (!searchData) {
            return { success: true, status: 200, data: { results: [], result_count: 0, page_url: pageUrl } };
          }
          var rawListings = airbnbFindListings(searchData, 0) || [];
          var results = [];
          for (var i = 0; i < rawListings.length; i++) {
            var listing = airbnbExtractListing(rawListings[i]);
            if (listing.id) { results.push(listing); }
          }
          return { success: true, status: 200, data: {
            results: results,
            result_count: results.length,
            page_url: pageUrl
          } };
        }
        if (action === 'get_listing_from_page') {
          var listingData = airbnbPageData();
          if (!listingData) {
            return { success: true, status: 200, data: {
              listing: null,
              message: 'No page data found. Navigate to an Airbnb listing page first.'
            } };
          }
          var detail = airbnbFindListingDetail(listingData, 0);
          if (!detail) {
            return { success: true, status: 200, data: {
              listing: null,
              message: 'Not on a listing page. Navigate to an Airbnb listing page first.'
            } };
          }
          var host = airbnbIsObject(detail.host) ? detail.host : {};
          return { success: true, status: 200, data: {
            listing: {
              id: airbnbFirstString([airbnbRoomIdFromUrl(), detail.id]),
              name: airbnbFirstString([
                airbnbExtractString(detail, 'listingTitle'),
                airbnbExtractString(detail, 'name'),
                airbnbExtractString(detail, 'title')
              ]),
              description: airbnbFirstString([
                airbnbExtractString(detail, 'listingDescription'),
                airbnbExtractString(detail, 'description')
              ]),
              host_name: airbnbFirstString([
                airbnbExtractString(host, 'name'),
                airbnbExtractString(host, 'firstName')
              ]),
              location: airbnbFirstString([
                airbnbExtractString(detail, 'location'),
                airbnbExtractString(detail, 'locationTitle'),
                airbnbExtractString(detail, 'city')
              ]),
              price_string: airbnbFirstString([
                airbnbExtractString(detail, 'priceString'),
                airbnbExtractString(detail, 'price')
              ]),
              rating: airbnbFirstString([
                airbnbExtractString(detail, 'avgRatingLocalized'),
                airbnbExtractString(detail, 'rating')
              ]),
              review_count: typeof detail.reviewsCount === 'number' ? detail.reviewsCount : 0,
              image_urls: airbnbFindImageUrls(detail, 0).concat(airbnbExtractStringArray(detail, 'imageUrls')),
              amenities: airbnbFindAmenities(detail, 0)
            },
            message: null
          } };
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-airbnb-page-read-action' });
      }
      var SPOTIFY_PUBLIC_API = 'https://api.spotify.com/v1';
      var SPOTIFY_GRAPHQL_API = 'https://api-partner.spotify.com/pathfinder/v2/query';
      var SPOTIFY_OPERATION_HASHES = {
        profileAttributes: '53bcb064f6cd18c23f752bc324a791194d20df612d8e1239c735144ab0399ced',
        accountAttributes: '24aaa3057b69fa91492de26841ad199bd0b330ca95817b7a4d6715150de01827',
        searchDesktop: '3c9d3f60dac5dea3876b6db3f534192b1c1d90032c4233c1bbaba526db41eb31',
        queryArtistOverview: 'dd14c6043d8127b56c5acbe534f6b3c58714f0c26bc6ad41776079ed52833a8f',
        getAlbum: 'b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10',
        fetchPlaylist: '9c53fb83f35c6a177be88bf1b67cb080b853e86b576ed174216faa8f9164fc8f',
        fetchLibraryTracks: '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240'
      };
      function spotifyString(value) {
        return value === undefined || value === null ? '' : String(value);
      }
      function spotifyInt(value, fallbackValue, min, max) {
        var n = Number(value);
        if (!isFinite(n)) { n = fallbackValue; }
        n = Math.floor(n);
        if (min !== undefined && n < min) { n = min; }
        if (max !== undefined && n > max) { n = max; }
        return n;
      }
      function spotifyQuery(pairs) {
        var parts = [];
        for (var i = 0; i < (pairs || []).length; i++) {
          var key = pairs[i][0];
          var value = pairs[i][1];
          if (value === undefined || value === null || value === '') { continue; }
          parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
        }
        return parts.length ? '?' + parts.join('&') : '';
      }
      async function spotifyToken() {
        var response;
        try {
          response = await fetch('/api/token', {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin',
            redirect: 'manual'
          });
        } catch (_tokenErr) {
          return '';
        }
        if (!response || !response.ok) { return ''; }
        var data = null;
        try { data = await response.json(); } catch (_jsonErr) { data = null; }
        var token = data && (data.accessToken || data.access_token || data.token);
        return typeof token === 'string' && token.length > 16 ? token : '';
      }
      async function spotifyFetchJson(url, options, reason) {
        var response;
        try {
          response = await fetch(url, options || {});
        } catch (_fetchErr) {
          return fallback(reason + '-request-failed');
        }
        if (!response) { return fallback(reason + '-request-failed'); }
        if (response.status === 202 || response.status === 204) {
          return { success: true, status: response.status, data: {} };
        }
        var data = null;
        try { data = await response.json(); } catch (_jsonErr) { data = null; }
        if (!response.ok) { return fallback(reason + '-http-' + response.status); }
        if (data === null || data === undefined) { return fallback(reason + '-shape-mismatch'); }
        if (data && (data.error || data.errors)) { return fallback(reason + '-error-envelope'); }
        return { success: true, status: response.status, data: data };
      }
      async function spotifyApi(endpoint, pairs, reason) {
        var token = await spotifyToken();
        if (!token) { return fallback('spotify-auth-unavailable'); }
        return spotifyFetchJson(SPOTIFY_PUBLIC_API + endpoint + spotifyQuery(pairs || []), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          credentials: 'omit',
          redirect: 'manual'
        }, reason);
      }
      async function spotifyGraphql(operationName, variables, reason) {
        var token = await spotifyToken();
        if (!token) { return fallback('spotify-auth-unavailable'); }
        var hash = SPOTIFY_OPERATION_HASHES[operationName];
        if (!hash) { return fallback('spotify-unknown-graphql-operation'); }
        return spotifyFetchJson(SPOTIFY_GRAPHQL_API, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json;charset=UTF-8',
            'app-platform': 'WebPlayer'
          },
          body: JSON.stringify({
            variables: variables || {},
            operationName: operationName,
            extensions: { persistedQuery: { version: 1, sha256Hash: hash } }
          }),
          credentials: 'omit',
          redirect: 'manual'
        }, reason);
      }
      async function spotifyRead(action, args) {
        args = args || {};
        if (action === 'get_current_user') {
          var profile = await spotifyGraphql('profileAttributes', {}, 'spotify-profile-attributes');
          if (!profile || profile.success !== true) { return profile; }
          var account = await spotifyGraphql('accountAttributes', {}, 'spotify-account-attributes');
          if (!account || account.success !== true) { return account; }
          return { success: true, status: 200, data: { profile: profile.data, account: account.data } };
        }
        if (action === 'search') {
          return spotifyGraphql('searchDesktop', {
            searchTerm: spotifyString(args.query),
            offset: spotifyInt(args.offset, 0, 0),
            limit: spotifyInt(args.limit, 10, 1, 50),
            numberOfTopResults: 5,
            includeAudiobooks: false,
            includeArtistHasConcertsField: false,
            includePreReleases: false,
            includeAuthors: false
          }, 'spotify-search');
        }
        if (action === 'get_album') {
          return spotifyGraphql('getAlbum', {
            uri: spotifyString(args.uri),
            locale: '',
            offset: spotifyInt(args.offset, 0, 0),
            limit: spotifyInt(args.limit, 50, 1, 50)
          }, 'spotify-album');
        }
        if (action === 'get_artist') {
          return spotifyGraphql('queryArtistOverview', {
            uri: spotifyString(args.uri),
            locale: ''
          }, 'spotify-artist');
        }
        if (action === 'get_playlist') {
          return spotifyGraphql('fetchPlaylist', {
            uri: spotifyString(args.uri),
            offset: spotifyInt(args.offset, 0, 0),
            limit: spotifyInt(args.limit, 50, 1, 100),
            enableWatchFeedEntrypoint: false
          }, 'spotify-playlist');
        }
        if (action === 'get_saved_tracks') {
          return spotifyGraphql('fetchLibraryTracks', {
            offset: spotifyInt(args.offset, 0, 0),
            limit: spotifyInt(args.limit, 20, 1, 50)
          }, 'spotify-saved-tracks');
        }
        if (action === 'get_available_devices') {
          return spotifyApi('/me/player/devices', [], 'spotify-devices');
        }
        if (action === 'get_currently_playing') {
          return spotifyApi('/me/player/currently-playing', [], 'spotify-currently-playing');
        }
        if (action === 'get_playback_state') {
          return spotifyApi('/me/player', [], 'spotify-playback-state');
        }
        if (action === 'get_queue') {
          return spotifyApi('/me/player/queue', [], 'spotify-queue');
        }
        if (action === 'get_recently_played') {
          return spotifyApi('/me/player/recently-played', [
            ['limit', spotifyInt(args.limit, 20, 1, 50)],
            ['before', args.before],
            ['after', args.after]
          ], 'spotify-recently-played');
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-spotify-page-read-action' });
      }
      var TWITCH_GQL_URL = 'https://gql.twitch.tv/gql';
      var TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
      function twitchString(value) {
        return value === undefined || value === null ? '' : String(value);
      }
      function twitchInt(value, fallbackValue, min, max) {
        var n = Number(value);
        if (!isFinite(n)) { n = fallbackValue; }
        n = Math.floor(n);
        if (min !== undefined && n < min) { n = min; }
        if (max !== undefined && n > max) { n = max; }
        return n;
      }
      function twitchEnum(value, allowed, fallbackValue) {
        var raw = twitchString(value);
        for (var i = 0; i < allowed.length; i++) {
          if (raw === allowed[i]) { return raw; }
        }
        return fallbackValue;
      }
      function twitchCookie(name) {
        var key = encodeURIComponent(name) + '=';
        var parts = twitchString(document.cookie).split(';');
        for (var i = 0; i < parts.length; i++) {
          var part = parts[i].replace(/^\s+/, '');
          if (part.indexOf(key) === 0) {
            var value = part.slice(key.length);
            try { return decodeURIComponent(value); } catch (_decodeErr) { return value; }
          }
        }
        return '';
      }
      function twitchJsonCookie(name) {
        var raw = twitchCookie(name);
        if (!raw) { return null; }
        try { return JSON.parse(raw); } catch (_jsonErr) { return null; }
      }
      function twitchAuth() {
        var token = twitchCookie('auth-token');
        if (!token) { return null; }
        var user = twitchJsonCookie('twilight-user') || {};
        return { token: token, userId: twitchString(user.id), login: twitchString(user.login) };
      }
      async function twitchGql(query, variables, reason) {
        var auth = twitchAuth();
        if (!auth) { return fallback('twitch-auth-unavailable'); }
        var response;
        try {
          response = await fetch(TWITCH_GQL_URL, {
            method: 'POST',
            credentials: 'omit',
            redirect: 'manual',
            headers: {
              'Accept': 'application/json',
              'Client-Id': TWITCH_CLIENT_ID,
              'Authorization': 'OAuth ' + auth.token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: query, variables: variables || {} })
          });
        } catch (_fetchErr) {
          return fallback(reason + '-request-failed');
        }
        if (!response) { return fallback(reason + '-request-failed'); }
        var data = null;
        try { data = await response.json(); } catch (_jsonErr) { data = null; }
        if (!response.ok) { return fallback(reason + '-http-' + response.status); }
        if (data && data.errors && (!data.data || (Array.isArray(data.errors) && data.errors.length))) {
          var msg = '';
          try { msg = data.errors.map(function (err) { return twitchString(err && err.message); }).join('; '); } catch (_e) { msg = ''; }
          if (msg.indexOf('failed integrity check') !== -1) {
            return fallback('twitch-integrity-verification-required');
          }
          if (!data.data) { return fallback(reason + '-error-envelope'); }
        }
        if (!data || !data.data) { return fallback(reason + '-shape-mismatch'); }
        return { success: true, status: response.status, data: data.data };
      }
      function twitchList(value) {
        return Array.isArray(value) ? value : [];
      }
      function twitchObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      }
      function twitchNumber(value) {
        var n = Number(value);
        return isFinite(n) ? n : 0;
      }
      function twitchBool(value) {
        return value === true;
      }
      function twitchMapUser(raw) {
        raw = twitchObject(raw);
        var roles = twitchObject(raw.roles);
        var followers = twitchObject(raw.followers);
        return {
          id: twitchString(raw.id),
          login: twitchString(raw.login),
          displayName: twitchString(raw.displayName),
          description: twitchString(raw.description),
          profileImageURL: twitchString(raw.profileImageURL),
          createdAt: twitchString(raw.createdAt),
          hasPrime: twitchBool(raw.hasPrime),
          roles: {
            isPartner: twitchBool(roles.isPartner),
            isAffiliate: twitchBool(roles.isAffiliate)
          },
          followerCount: twitchNumber(followers.totalCount !== undefined ? followers.totalCount : raw.followerCount)
        };
      }
      function twitchMapGame(raw) {
        raw = twitchObject(raw);
        return {
          id: twitchString(raw.id),
          name: twitchString(raw.name),
          displayName: twitchString(raw.displayName || raw.name),
          viewersCount: twitchNumber(raw.viewersCount),
          broadcastersCount: twitchNumber(raw.broadcastersCount),
          boxArtURL: twitchString(raw.boxArtURL)
        };
      }
      function twitchMapBroadcaster(raw) {
        raw = twitchObject(raw);
        return {
          id: twitchString(raw.id),
          login: twitchString(raw.login),
          displayName: twitchString(raw.displayName),
          profileImageURL: twitchString(raw.profileImageURL)
        };
      }
      function twitchMapStream(raw) {
        raw = twitchObject(raw);
        return {
          id: twitchString(raw.id),
          title: twitchString(raw.title),
          viewersCount: twitchNumber(raw.viewersCount),
          type: twitchString(raw.type),
          createdAt: twitchString(raw.createdAt),
          broadcaster: twitchMapBroadcaster(raw.broadcaster),
          game: {
            id: twitchString(twitchObject(raw.game).id),
            name: twitchString(twitchObject(raw.game).name)
          }
        };
      }
      function twitchMapClip(raw) {
        raw = twitchObject(raw);
        return {
          id: twitchString(raw.id),
          slug: twitchString(raw.slug),
          title: twitchString(raw.title),
          viewCount: twitchNumber(raw.viewCount),
          createdAt: twitchString(raw.createdAt),
          thumbnailURL: twitchString(raw.thumbnailURL),
          durationSeconds: twitchNumber(raw.durationSeconds),
          broadcaster: {
            id: twitchString(twitchObject(raw.broadcaster).id),
            login: twitchString(twitchObject(raw.broadcaster).login),
            displayName: twitchString(twitchObject(raw.broadcaster).displayName)
          },
          game: {
            id: twitchString(twitchObject(raw.game).id),
            name: twitchString(twitchObject(raw.game).name)
          }
        };
      }
      function twitchMapVideo(raw) {
        raw = twitchObject(raw);
        var thumbnails = twitchList(raw.thumbnailURLs);
        return {
          id: twitchString(raw.id),
          title: twitchString(raw.title),
          viewCount: twitchNumber(raw.viewCount),
          publishedAt: twitchString(raw.publishedAt),
          lengthSeconds: twitchNumber(raw.lengthSeconds),
          game: {
            id: twitchString(twitchObject(raw.game).id),
            name: twitchString(twitchObject(raw.game).name)
          },
          thumbnailURL: twitchString(raw.thumbnailURL || thumbnails[0])
        };
      }
      function twitchEdges(container) {
        return twitchList(twitchObject(container).edges).map(function (edge) {
          return twitchObject(edge).node;
        }).filter(function (node) { return !!node; });
      }
      function twitchEmotes(products) {
        var out = [];
        var list = twitchList(products);
        for (var i = 0; i < list.length; i++) {
          var emotes = twitchList(twitchObject(list[i]).emotes);
          for (var j = 0; j < emotes.length; j++) {
            out.push({
              id: twitchString(twitchObject(emotes[j]).id),
              token: twitchString(twitchObject(emotes[j]).token)
            });
          }
        }
        return out;
      }
      async function twitchRead(action, args) {
        args = args || {};
        var first = twitchInt(args.first, 10, 1, 25);
        var result;
        if (action === 'get_current_user') {
          result = await twitchGql('query FsbTwitchCurrentUser { currentUser { id login displayName description profileImageURL(width: 300) createdAt hasPrime roles { isPartner isAffiliate } followers { totalCount } } }', {}, 'twitch-current-user');
          if (!result || result.success !== true) { return result; }
          if (!result.data.currentUser) { return fallback('twitch-current-user-shape-mismatch'); }
          return { success: true, status: result.status, data: { user: twitchMapUser(result.data.currentUser) } };
        }
        if (action === 'get_user_profile') {
          result = await twitchGql('query FsbTwitchUserProfile($login: String!) { user(login: $login) { id login displayName description profileImageURL(width: 300) createdAt roles { isPartner isAffiliate } followers { totalCount } } }', { login: twitchString(args.login) }, 'twitch-user-profile');
          if (!result || result.success !== true) { return result; }
          if (!result.data.user) { return fallback('twitch-user-not-found'); }
          return { success: true, status: result.status, data: { user: twitchMapUser(result.data.user) } };
        }
        if (action === 'get_channel_emotes') {
          result = await twitchGql('query FsbTwitchChannelEmotes($login: String!) { user(login: $login) { subscriptionProducts { emotes { id token } } } }', { login: twitchString(args.login) }, 'twitch-channel-emotes');
          if (!result || result.success !== true) { return result; }
          if (!result.data.user) { return fallback('twitch-user-not-found'); }
          return { success: true, status: result.status, data: { emotes: twitchEmotes(result.data.user.subscriptionProducts) } };
        }
        if (action === 'get_stream') {
          result = await twitchGql('query FsbTwitchStream($login: String!) { user(login: $login) { id stream { id title viewersCount type createdAt broadcaster { id login displayName profileImageURL(width: 70) } game { id name } } } }', { login: twitchString(args.login) }, 'twitch-stream');
          if (!result || result.success !== true) { return result; }
          if (!result.data.user) { return fallback('twitch-user-not-found'); }
          return { success: true, status: result.status, data: { stream: result.data.user.stream ? twitchMapStream(result.data.user.stream) : null, isLive: !!result.data.user.stream } };
        }
        if (action === 'get_top_streams') {
          result = await twitchGql('query FsbTwitchTopStreams($first: Int!) { streams(first: $first) { edges { node { id title viewersCount type createdAt broadcaster { id login displayName profileImageURL(width: 70) } game { id name } } } } }', { first: first }, 'twitch-top-streams');
          if (!result || result.success !== true) { return result; }
          return { success: true, status: result.status, data: { streams: twitchEdges(result.data.streams).map(twitchMapStream) } };
        }
        if (action === 'get_game') {
          if (twitchString(args.id)) {
            result = await twitchGql('query FsbTwitchGameById($id: ID!) { game(id: $id) { id name displayName viewersCount broadcastersCount boxArtURL } }', { id: twitchString(args.id) }, 'twitch-game');
          } else if (twitchString(args.name)) {
            result = await twitchGql('query FsbTwitchGameByName($name: String!) { game(name: $name) { id name displayName viewersCount broadcastersCount boxArtURL } }', { name: twitchString(args.name) }, 'twitch-game');
          } else {
            return fallback('twitch-game-invalid-args');
          }
          if (!result || result.success !== true) { return result; }
          if (!result.data.game) { return fallback('twitch-game-not-found'); }
          return { success: true, status: result.status, data: { game: twitchMapGame(result.data.game) } };
        }
        if (action === 'get_top_games') {
          result = await twitchGql('query FsbTwitchTopGames($first: Int!) { games(first: $first, options: { sort: VIEWER_COUNT }) { edges { node { id name displayName viewersCount broadcastersCount boxArtURL } } } }', { first: first }, 'twitch-top-games');
          if (!result || result.success !== true) { return result; }
          return { success: true, status: result.status, data: { games: twitchEdges(result.data.games).map(twitchMapGame) } };
        }
        if (action === 'get_streams_by_game') {
          if (twitchString(args.id)) {
            result = await twitchGql('query FsbTwitchStreamsByGameId($id: ID!, $first: Int!) { game(id: $id) { streams(first: $first) { edges { node { id title viewersCount type createdAt broadcaster { id login displayName profileImageURL(width: 70) } game { id name } } } } } }', { id: twitchString(args.id), first: first }, 'twitch-streams-by-game');
          } else if (twitchString(args.name)) {
            result = await twitchGql('query FsbTwitchStreamsByGameName($name: String!, $first: Int!) { game(name: $name) { streams(first: $first) { edges { node { id title viewersCount type createdAt broadcaster { id login displayName profileImageURL(width: 70) } game { id name } } } } } }', { name: twitchString(args.name), first: first }, 'twitch-streams-by-game');
          } else {
            return fallback('twitch-streams-by-game-invalid-args');
          }
          if (!result || result.success !== true) { return result; }
          if (!result.data.game) { return fallback('twitch-game-not-found'); }
          return { success: true, status: result.status, data: { streams: twitchEdges(result.data.game.streams).map(twitchMapStream) } };
        }
        if (action === 'get_game_clips') {
          result = await twitchGql('query FsbTwitchGameClips($name: String!, $first: Int!, $period: ClipsPeriod!) { game(name: $name) { clips(first: $first, criteria: { period: $period }) { edges { node { id slug title viewCount createdAt thumbnailURL durationSeconds broadcaster { id login displayName } game { id name } } } } } }', { name: twitchString(args.name), first: first, period: twitchEnum(args.period, ['LAST_DAY', 'LAST_WEEK', 'LAST_MONTH', 'ALL_TIME'], 'LAST_WEEK') }, 'twitch-game-clips');
          if (!result || result.success !== true) { return result; }
          if (!result.data.game) { return fallback('twitch-game-not-found'); }
          return { success: true, status: result.status, data: { clips: twitchEdges(result.data.game.clips).map(twitchMapClip) } };
        }
        if (action === 'get_user_clips') {
          result = await twitchGql('query FsbTwitchUserClips($login: String!, $first: Int!, $period: ClipsPeriod!) { user(login: $login) { clips(first: $first, criteria: { period: $period }) { edges { node { id slug title viewCount createdAt thumbnailURL durationSeconds broadcaster { id login displayName } game { id name } } } } } }', { login: twitchString(args.login), first: first, period: twitchEnum(args.period, ['LAST_DAY', 'LAST_WEEK', 'LAST_MONTH', 'ALL_TIME'], 'ALL_TIME') }, 'twitch-user-clips');
          if (!result || result.success !== true) { return result; }
          if (!result.data.user) { return fallback('twitch-user-not-found'); }
          return { success: true, status: result.status, data: { clips: twitchEdges(result.data.user.clips).map(twitchMapClip) } };
        }
        if (action === 'get_user_videos') {
          result = await twitchGql('query FsbTwitchUserVideos($login: String!, $first: Int!, $sort: VideoSort!, $type: BroadcastType) { user(login: $login) { videos(first: $first, sort: $sort, type: $type) { totalCount edges { node { id title viewCount publishedAt lengthSeconds game { id name } thumbnailURLs(width: 320, height: 180) } } } } }', { login: twitchString(args.login), first: first, sort: twitchEnum(args.sort, ['TIME', 'VIEWS'], 'TIME'), type: twitchString(args.type) || null }, 'twitch-user-videos');
          if (!result || result.success !== true) { return result; }
          if (!result.data.user) { return fallback('twitch-user-not-found'); }
          return { success: true, status: result.status, data: { videos: twitchEdges(result.data.user.videos).map(twitchMapVideo), totalCount: twitchNumber(twitchObject(result.data.user.videos).totalCount) } };
        }
        if (action === 'get_video') {
          result = await twitchGql('query FsbTwitchVideo($id: ID!) { video(id: $id) { id title viewCount publishedAt lengthSeconds game { id name } thumbnailURLs(width: 320, height: 180) owner { id login displayName } } }', { id: twitchString(args.id) }, 'twitch-video');
          if (!result || result.success !== true) { return result; }
          if (!result.data.video) { return fallback('twitch-video-not-found'); }
          var video = twitchMapVideo(result.data.video);
          video.broadcaster = {
            id: twitchString(twitchObject(result.data.video.owner).id),
            login: twitchString(twitchObject(result.data.video.owner).login),
            displayName: twitchString(twitchObject(result.data.video.owner).displayName)
          };
          return { success: true, status: result.status, data: { video: video } };
        }
        if (action === 'search_categories') {
          result = await twitchGql('query FsbTwitchSearchCategories($query: String!) { searchFor(userQuery: $query, platform: "web", options: { targets: [{ index: GAME }] }) { games { items { id name displayName viewersCount broadcastersCount boxArtURL } } } }', { query: twitchString(args.query) }, 'twitch-search-categories');
          if (!result || result.success !== true) { return result; }
          return { success: true, status: result.status, data: { categories: twitchList(twitchObject(twitchObject(result.data.searchFor).games).items).map(twitchMapGame) } };
        }
        if (action === 'search_channels') {
          result = await twitchGql('query FsbTwitchSearchChannels($query: String!) { searchFor(userQuery: $query, platform: "web", options: { targets: [{ index: CHANNEL }] }) { channels { items { id login displayName profileImageURL(width: 70) followers { totalCount } stream { id title viewersCount type createdAt broadcaster { id login displayName profileImageURL(width: 70) } game { id name } } } } } }', { query: twitchString(args.query) }, 'twitch-search-channels');
          if (!result || result.success !== true) { return result; }
          return { success: true, status: result.status, data: { channels: twitchList(twitchObject(twitchObject(result.data.searchFor).channels).items).map(function (channel) {
            channel = twitchObject(channel);
            return {
              id: twitchString(channel.id),
              login: twitchString(channel.login),
              displayName: twitchString(channel.displayName),
              profileImageURL: twitchString(channel.profileImageURL),
              followerCount: twitchNumber(twitchObject(channel.followers).totalCount),
              isLive: !!channel.stream,
              stream: channel.stream ? twitchMapStream(channel.stream) : null
            };
          }) } };
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-twitch-page-read-action' });
      }
      function gmapsString(value) {
        return value === undefined || value === null ? '' : String(value);
      }
      function gmapsFinite(value, fallbackValue) {
        var n = Number(value);
        return isFinite(n) ? n : fallbackValue;
      }
      function gmapsInt(value, fallbackValue, min, max) {
        var n = Number(value);
        if (!isFinite(n)) { n = fallbackValue; }
        n = Math.floor(n);
        if (min !== undefined && n < min) { n = min; }
        if (max !== undefined && n > max) { n = max; }
        return n;
      }
      function gmapsCurrentUrl() {
        return globalThis.location && globalThis.location.href ? String(globalThis.location.href) : '';
      }
      function gmapsBuildLocationUrl(lat, lng, zoom) {
        return 'https://www.google.com/maps/@' + gmapsFinite(lat, 0) + ',' +
          gmapsFinite(lng, 0) + ',' + gmapsInt(zoom, 15, 1, 21) + 'z';
      }
      function gmapsBuildSearchUrl(query, lat, lng, zoom) {
        var path = 'https://www.google.com/maps/search/' + encodeURIComponent(gmapsString(query));
        if (isFinite(Number(lat)) && isFinite(Number(lng))) {
          path += '/@' + Number(lat) + ',' + Number(lng) + ',' + gmapsInt(zoom, 15, 1, 21) + 'z';
        }
        return path;
      }
      function gmapsBuildDirectionsUrl(origin, destination, mode) {
        var modeMap = { driving: '0', transit: '1', walking: '2', bicycling: '3' };
        var travelMode = /^(driving|transit|walking|bicycling)$/.test(gmapsString(mode)) ? gmapsString(mode) : 'driving';
        return 'https://www.google.com/maps/dir/' + encodeURIComponent(gmapsString(origin)) + '/' +
          encodeURIComponent(gmapsString(destination)) + '/data=!4m2!4m1!3e' + modeMap[travelMode];
      }
      function gmapsMapCenter() {
        var url = gmapsCurrentUrl();
        var match = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+\.?\d*)z/);
        if (match && match[1] && match[2] && match[3]) {
          return {
            lat: parseFloat(match[1]),
            lng: parseFloat(match[2]),
            zoom: parseFloat(match[3])
          };
        }
        var initState = globalThis.APP_INITIALIZATION_STATE;
        if (Array.isArray(initState) && Array.isArray(initState[0])) {
          var coords = initState[0][0];
          if (Array.isArray(coords) && coords.length >= 3 &&
              typeof coords[2] === 'number' && typeof coords[1] === 'number') {
            return { lat: coords[2], lng: coords[1], zoom: 15 };
          }
        }
        return null;
      }
      function gmapsSearchQuery() {
        var url = gmapsCurrentUrl();
        var searchMatch = url.match(/\/maps\/search\/([^/@]+)/);
        if (searchMatch && searchMatch[1]) {
          return decodeURIComponent(searchMatch[1].replace(/\+/g, ' '));
        }
        var placeMatch = url.match(/\/maps\/place\/([^/@]+)/);
        if (placeMatch && placeMatch[1]) {
          return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
        }
        return '';
      }
      function gmapsDirectionsFromUrl() {
        var url = gmapsCurrentUrl();
        var dirMatch = url.match(/\/maps\/dir\/([^/]+)\/([^/@]+)/);
        if (!dirMatch || !dirMatch[1] || !dirMatch[2]) { return null; }
        var mode = 'driving';
        if (url.indexOf('!3e1') !== -1) { mode = 'transit'; }
        else if (url.indexOf('!3e2') !== -1) { mode = 'walking'; }
        else if (url.indexOf('!3e3') !== -1) { mode = 'bicycling'; }
        return {
          origin: decodeURIComponent(dirMatch[1].replace(/\+/g, ' ')),
          destination: decodeURIComponent(dirMatch[2].replace(/\+/g, ' ')),
          travel_mode: mode
        };
      }
      function gmapsCurrentView() {
        var center = gmapsMapCenter();
        return {
          view: {
            lat: center ? center.lat : 0,
            lng: center ? center.lng : 0,
            zoom: center ? center.zoom : 0,
            query: gmapsSearchQuery(),
            url: gmapsCurrentUrl()
          }
        };
      }
      function gmapsRead(action, args) {
        args = args || {};
        if (action === 'get_current_view') {
          return { success: true, status: 200, data: gmapsCurrentView() };
        }
        if (action === 'get_directions_info') {
          var dir = gmapsDirectionsFromUrl();
          return {
            success: true,
            status: 200,
            data: {
              route: dir ? {
                summary: '',
                distance: '',
                duration: '',
                origin: dir.origin,
                destination: dir.destination,
                travel_mode: dir.travel_mode,
                url: gmapsCurrentUrl()
              } : null
            }
          };
        }
        if (action === 'navigate_to_search') {
          var searchCenter = gmapsMapCenter();
          var searchLat = args.lat !== undefined ? args.lat : searchCenter && searchCenter.lat;
          var searchLng = args.lng !== undefined ? args.lng : searchCenter && searchCenter.lng;
          var searchZoom = args.zoom !== undefined ? args.zoom : searchCenter && searchCenter.zoom;
          return {
            success: true,
            status: 200,
            data: { url: gmapsBuildSearchUrl(args.query, searchLat, searchLng, searchZoom), success: true, navigated: false }
          };
        }
        if (action === 'search_nearby') {
          var nearbyCenter = gmapsMapCenter();
          var nearbyLat = args.lat !== undefined ? args.lat : nearbyCenter && nearbyCenter.lat;
          var nearbyLng = args.lng !== undefined ? args.lng : nearbyCenter && nearbyCenter.lng;
          var nearbyZoom = args.zoom !== undefined ? args.zoom : nearbyCenter && nearbyCenter.zoom;
          return {
            success: true,
            status: 200,
            data: { url: gmapsBuildSearchUrl(gmapsString(args.category) + ' nearby', nearbyLat, nearbyLng, nearbyZoom), success: true, navigated: false }
          };
        }
        if (action === 'share_location') {
          var shareCenter = gmapsMapCenter();
          var lat = args.lat !== undefined ? args.lat : shareCenter && shareCenter.lat;
          var lng = args.lng !== undefined ? args.lng : shareCenter && shareCenter.lng;
          var zoom = args.zoom !== undefined ? args.zoom : shareCenter && shareCenter.zoom;
          lat = gmapsFinite(lat, 0);
          lng = gmapsFinite(lng, 0);
          zoom = gmapsInt(zoom, 15, 1, 21);
          var shareUrl = (lat === 0 && lng === 0 && args.lat === undefined && args.lng === undefined)
            ? gmapsCurrentUrl()
            : gmapsBuildLocationUrl(lat, lng, zoom);
          return { success: true, status: 200, data: { url: shareUrl, lat: lat, lng: lng, zoom: zoom } };
        }
        if (action === 'toggle_layer') {
          var layerMap = { traffic: '!5m1!1e1', transit: '!5m1!1e2', bicycling: '!5m1!1e3', terrain: '!5m1!1e4' };
          var layerCode = layerMap[gmapsString(args.layer)] || layerMap.traffic;
          var currentUrl = gmapsCurrentUrl();
          var coordMatch = currentUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+\.?\d*)z/);
          var layerUrl = '';
          if (coordMatch && coordMatch[1] && coordMatch[2] && coordMatch[3]) {
            layerUrl = 'https://www.google.com/maps/@' + coordMatch[1] + ',' + coordMatch[2] + ',' + coordMatch[3] + 'z/data=' + layerCode;
          } else {
            layerUrl = currentUrl + (currentUrl.indexOf('data=') !== -1 ? '' : '/data=') + layerCode;
          }
          return { success: true, status: 200, data: { url: layerUrl, success: true, navigated: false } };
        }
        if (action === 'zoom_map') {
          var zoomCenter = gmapsMapCenter();
          var zoomLevel = gmapsInt(args.zoom, 15, 1, 21);
          return {
            success: true,
            status: 200,
            data: zoomCenter
              ? { url: gmapsBuildLocationUrl(zoomCenter.lat, zoomCenter.lng, zoomLevel), success: true, navigated: false }
              : { url: '', success: false, navigated: false }
          };
        }
        if (action === 'set_travel_mode') {
          var currentDirections = gmapsDirectionsFromUrl();
          return {
            success: true,
            status: 200,
            data: currentDirections
              ? { url: gmapsBuildDirectionsUrl(currentDirections.origin, currentDirections.destination, args.travel_mode), success: true, navigated: false }
              : { url: gmapsCurrentUrl(), success: false, navigated: false }
          };
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-gmaps-page-read-action' });
      }

      function steamRead(action) {
        // Steam auth lives in page globals set by the store.steampowered.com shell:
        //   g_AccountID: number (Steam32 account id, 0 when logged out)
        //   g_sessionID: string (session token, also mirrored in the `sessionid` cookie)
        // steam.get_current_user reads these directly rather than issuing an HTTP
        // request -- the classic user-identity primitive matches the vendored
        // getCurrentUser tool at vendor/opentabs-snapshot/plugins/steam/src/tools/
        // get-current-user.ts (returns { account_id, steam_id64 } derived from
        // accountId + Steam's SteamID64 constant offset 76561197960265728).
        if (action === 'get_current_user') {
          var g = globalThis || {};
          var accountId = Number(g.g_AccountID);
          if (!Number.isFinite(accountId) || accountId <= 0) {
            return typedError('RECIPE_DOM_FALLBACK_PENDING', { reason: 'steam-not-authenticated' });
          }
          var sessionId = g.g_sessionID;
          if (!sessionId) {
            var m = String(document && document.cookie || '').match(/(?:^|;\s*)sessionid=([^;]+)/);
            if (m) sessionId = m[1];
          }
          if (!sessionId) {
            return typedError('RECIPE_DOM_FALLBACK_PENDING', { reason: 'steam-not-authenticated' });
          }
          // Steam32 -> Steam64 conversion: fixed offset 76561197960265728.
          var steamId64 = (BigInt(accountId) + 76561197960265728n).toString();
          return {
            success: true,
            status: 200,
            data: { account_id: accountId, steam_id64: steamId64 }
          };
        }
        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-steam-page-read-action' });
      }

      try {
        if (!request || (request.namespace !== 'whatsapp'
            && request.namespace !== 'cockroachdb'
            && request.namespace !== 'clickhouse'
            && request.namespace !== 'clickup'
            && request.namespace !== 'temporal'
            && request.namespace !== 'excel'
            && request.namespace !== 'azure'
            && request.namespace !== 'gcloud'
            && request.namespace !== 'ganalytics'
            && request.namespace !== 'airbnb'
            && request.namespace !== 'powerpoint'
            && request.namespace !== 'microsoft-word'
            && request.namespace !== 'outlook'
            && request.namespace !== 'teams'
            && request.namespace !== 'gdrive'
            && request.namespace !== 'gcal'
            && request.namespace !== 'onenote'
            && request.namespace !== 'minimax'
            && request.namespace !== 'glama'
            && request.namespace !== 'supabase'
            && request.namespace !== 'telegram'
            && request.namespace !== 'spotify'
            && request.namespace !== 'twitch'
            && request.namespace !== 'gmaps'
            && request.namespace !== 'snowflake'
            && request.namespace !== 'steam')) {
          return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-page-read-namespace' });
        }
        if (request.origin && globalThis.location && globalThis.location.origin !== request.origin) {
          return typedError('RECIPE_ORIGIN_MISMATCH', {
            origin: request.origin,
            tabOrigin: globalThis.location.origin
          });
        }

        var action = String(request.action || '');
        var args = request.args && typeof request.args === 'object' ? request.args : {};
        if (request.namespace === 'airbnb') {
          return airbnbRead(action);
        }
        if (request.namespace === 'ganalytics') {
          return await gaRead(action, args);
        }
        if (request.namespace === 'powerpoint') {
          return powerpointRead(action);
        }
        if (request.namespace === 'microsoft-word') {
          return wordRead(action);
        }
        if (request.namespace === 'outlook') {
          return outlookRead(action);
        }
        if (request.namespace === 'teams') {
          return teamsRead(action);
        }
        if (request.namespace === 'telegram') {
          return await telegramRead(action, args);
        }
        if (request.namespace === 'onenote') {
          return onenoteRead(action);
        }
        if (request.namespace === 'excel') {
          return excelRead(action);
        }
        if (request.namespace === 'azure') {
          return await azureRead(action, args);
        }
        if (request.namespace === 'gcloud') {
          return await gcloudRead(action, args);
        }
        if (request.namespace === 'gdrive') {
          return await gdriveRead(action, args);
        }
        if (request.namespace === 'gcal') {
          return await gcalRead(action, args);
        }
        if (request.namespace === 'cockroachdb') {
          return crdbRead(action, args);
        }
        if (request.namespace === 'temporal') {
          return await temporalRead(request.origin, action, args);
        }
        if (request.namespace === 'clickhouse') {
          return await chRead(action, args);
        }
        if (request.namespace === 'clickup') {
          return await clickupRead(action, args);
        }
        if (request.namespace === 'snowflake') {
          return await sfRead(action, args);
        }
        if (request.namespace === 'minimax') {
          return await minimaxRead(action);
        }
        if (request.namespace === 'glama') {
          return await glamaRead(action, args);
        }
        if (request.namespace === 'supabase') {
          return await supabaseRead(action, args);
        }
        if (request.namespace === 'spotify') {
          return await spotifyRead(action, args);
        }
        if (request.namespace === 'twitch') {
          return await twitchRead(action, args);
        }
        if (request.namespace === 'gmaps') {
          return gmapsRead(action, args);
        }
        if (request.namespace === 'steam') {
          return await steamRead(action, args);
        }
        var chats;
        var contacts;
        var chat;
        var contact;
        var limit;

        if (action === 'get_current_user') {
          var connMod = waRequire('WAWebConnModel');
          var meMod = waRequire('WAWebUserPrefsMeUser');
          var conn = connMod && connMod.Conn;
          var pn = '';
          var lid = '';
          var displayName = '';
          if (meMod) {
            try { pn = wid(meMod.getMaybeMePnUser && meMod.getMaybeMePnUser()); } catch (e1) { pn = ''; }
            try { lid = wid(meMod.getMaybeMeLidUser && meMod.getMaybeMeLidUser()); } catch (e2) { lid = ''; }
            try { displayName = String((meMod.getMaybeMeDisplayName && meMod.getMaybeMeDisplayName()) || ''); } catch (e3) { displayName = ''; }
          }
          if (!conn && !pn && !lid && !displayName) {
            return fallback('whatsapp-auth-or-conn-module-unavailable');
          }
          return { success: true, status: 200, data: { user: {
            id: pn,
            lid: lid,
            display_name: String((conn && conn.pushname) || displayName || ''),
            platform: String((conn && conn.platform) || '')
          } } };
        }

        if (action === 'list_chats') {
          var chatCollection = getChatCollection();
          if (!chatCollection) { return fallback('whatsapp-chat-collection-unavailable'); }
          chats = getModels(chatCollection);
          limit = positiveInt(args.limit, 50, 100);
          return { success: true, status: 200, data: {
            chats: chats.slice(0, limit).map(serializeChat),
            total: chats.length
          } };
        }

        if (action === 'get_chat') {
          chat = findChat(args.chat_id);
          if (!chat) { return fallback('whatsapp-chat-not-found'); }
          return { success: true, status: 200, data: { chat: serializeChat(chat) } };
        }

        if (action === 'list_contacts') {
          var contactCollection = getContactCollection();
          if (!contactCollection) { return fallback('whatsapp-contact-collection-unavailable'); }
          contacts = getModels(contactCollection);
          limit = positiveInt(args.limit, 100, 500);
          return { success: true, status: 200, data: {
            contacts: contacts.slice(0, limit).map(serializeContact),
            total: contacts.length
          } };
        }

        if (action === 'get_contact') {
          contact = findContact(args.contact_id);
          if (!contact) { return fallback('whatsapp-contact-not-found'); }
          return { success: true, status: 200, data: { contact: serializeContact(contact) } };
        }

        if (action === 'list_messages') {
          chat = findChat(args.chat_id);
          if (!chat) { return fallback('whatsapp-chat-not-found'); }
          var loadMod = waRequire('WAWebChatLoadMessages');
          if (loadMod && typeof loadMod.loadEarlierMsgs === 'function') {
            try { await loadMod.loadEarlierMsgs(chat); } catch (loadErr) { /* use loaded messages */ }
          }
          var messages = getModels(chat.msgs);
          limit = positiveInt(args.limit, 20, 100);
          return { success: true, status: 200, data: {
            messages: messages.slice(-limit).map(serializeMessage),
            total_loaded: messages.length
          } };
        }

        if (action === 'get_group_invite_link') {
          chat = findChat(args.chat_id);
          if (!chat) { return fallback('whatsapp-chat-not-found'); }
          if (!(chat.id && chat.id.server === 'g.us')) { return fallback('whatsapp-chat-not-group'); }
          var inviteMod = waRequire('WAWebGroupInviteAction');
          if (!inviteMod || typeof inviteMod.queryGroupInviteCode !== 'function') {
            return fallback('whatsapp-group-invite-module-unavailable');
          }
          var code = await inviteMod.queryGroupInviteCode(chat);
          if (!code) { return fallback('whatsapp-group-invite-code-unavailable'); }
          return { success: true, status: 200, data: {
            invite_link: 'https://chat.whatsapp.com/' + String(code)
          } };
        }

        return typedError('RECIPE_NOT_FOUND', { reason: 'unsupported-whatsapp-page-read-action' });
      } catch (err) {
        return fallback('whatsapp-page-read-failed');
      }
    })();
  }

  // ---- Mutating-method set (D-11) -------------------------------------------
  //
  // A request whose effect is non-idempotent. An in-flight snapshot for one of
  // these is AMBIGUOUS after eviction (the request may or may not have reached the
  // server) and is NEVER blind-retried. GET/HEAD are safely re-issuable.

  var MUTATING_METHODS = { POST: true, PUT: true, PATCH: true, DELETE: true };

  // ---- Best-effort sidecar writes (mcp-bridge-client.js:1318-1333) ----------
  //
  // Persistence must NEVER block or crash the fetch. Each helper is guarded and
  // swallows its own failure; the caller does not await correctness, only the
  // happy-path write order.

  async function _writeSnapshotBestEffort(store, taskId, snapshot) {
    if (!store || typeof store.writeSnapshot !== 'function') { return; }
    try {
      await store.writeSnapshot(taskId, snapshot);
    } catch (writeErr) {
      // best-effort; never throw
    }
  }

  async function _deleteSnapshotBestEffort(store, taskId) {
    if (!store || typeof store.deleteSnapshot !== 'function') { return; }
    try {
      await store.deleteSnapshot(taskId);
    } catch (delErr) {
      // best-effort; never throw
    }
  }

  // ===========================================================================
  // executeBoundSpec -- the service-worker wrapper.
  // ===========================================================================
  //
  // Drives ONE bound spec against ONE tabId (D-04 direct-drive; no MCP tool, no
  // router). Sequence:
  //   1. FETCH-03 part 2 (D-08 part 2): re-assert the active/owned tab origin ===
  //      spec.origin BEFORE any side effect. A mismatch returns a dual-field
  //      RECIPE_ORIGIN_MISMATCH and fires NO executeScript -- this is what keeps
  //      FETCH-01 actually authenticated (cookies attach only on spec.origin; a
  //      "right URL, wrong tab session" is rejected here).
  //   2. FETCH-04 (D-10): write a BEFORE_API_REQUEST in_progress snapshot (with
  //      method + origin for the D-11 classifier) BEFORE executeScript.
  //   3. Inject the FIXED capabilityFetchInPage into the page MAIN world.
  //   4. Write a terminal snapshot then delete it (best-effort).
  //   5. D-07: run the read-only JMESPath extract service-worker-side after the
  //      body returns (the engine is not in page scope).

  async function executeBoundSpec(spec, tabId) {
    var c = _getChrome();
    var store = _getTaskStore();

    // ---- 1. Active-tab origin pin (FETCH-03 part 2, D-08 part 2). -----------
    var tab = null;
    if (c && c.tabs && typeof c.tabs.get === 'function') {
      try {
        tab = await c.tabs.get(tabId);
      } catch (tabErr) {
        tab = null;
      }
    }
    var tabOrigin = null;
    try {
      tabOrigin = (tab && tab.url) ? new URL(tab.url).origin : null;
    } catch (originErr) {
      tabOrigin = null;
    }
    if (!tabOrigin || tabOrigin !== (spec && spec.origin)) {
      // Dual-field typed error BEFORE any executeScript side effect.
      return _typedError('RECIPE_ORIGIN_MISMATCH', {
        url: spec && spec.url,
        origin: spec && spec.origin,
        tabOrigin: tabOrigin
      });
    }

    // ---- 2. BEFORE_API_REQUEST resume-sidecar write (FETCH-04, D-10). -------
    // The single bounded fetch needs no 30s heartbeat; the cadence collapses to
    // write -> executeScript -> terminal -> delete. Task id is unique in the
    // in-flight window and discoverable by listInFlightSnapshots().
    var taskId = 'cap_fetch_' + (spec && spec.origin ? spec.origin : 'unknown') + '_' + Date.now();
    var nowTs = Date.now();
    await _writeSnapshotBestEffort(store, taskId, {
      task_id: taskId,
      status: 'in_progress',
      started_at: nowTs,
      last_heartbeat_at: nowTs,
      target_tab_id: tabId,
      current_step: 'BEFORE_API_REQUEST',
      method: spec && spec.method,
      origin: spec && spec.origin
    });

    // ---- 3. Inject the FIXED func into the page MAIN world. -----------------
    var results;
    try {
      results = await c.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: capabilityFetchInPage,
        args: [spec]
      });
    } catch (execErr) {
      // executeScript itself threw (restricted page, tab gone). Terminal + delete.
      await _writeSnapshotBestEffort(store, taskId, {
        task_id: taskId,
        status: 'error',
        current_step: 'AFTER_API_REQUEST',
        method: spec && spec.method,
        origin: spec && spec.origin
      });
      await _deleteSnapshotBestEffort(store, taskId);
      return {
        success: false,
        error: 'executeScript failed: ' + (execErr && execErr.message ? execErr.message : String(execErr))
      };
    }

    var injectionResult = results && results[0];
    var r = injectionResult ? injectionResult.result : null;

    // ---- 4. Terminal snapshot then delete (best-effort). -------------------
    await _writeSnapshotBestEffort(store, taskId, {
      task_id: taskId,
      status: (r && !r.error) ? 'complete' : 'error',
      current_step: 'AFTER_API_REQUEST',
      method: spec && spec.method,
      origin: spec && spec.origin
    });
    await _deleteSnapshotBestEffort(store, taskId);

    if (!r) {
      return { success: false, error: 'no result from page fetch' };
    }
    if (r.error) {
      return { success: false, error: r.error };
    }

    // ---- 5. Service-worker-side read-only extract (D-07). -------------------
    // The JMESPath engine is NOT in page scope; run it here AFTER the body
    // crosses back. Leave data as the raw json on a throw or a missing engine.
    var data = r.json;
    if (spec && spec.extract && data != null) {
      var jp = _getJmespathEngine();
      if (jp && typeof jp.search === 'function') {
        try {
          data = jp.search(r.json, spec.extract);
        } catch (extractErr) {
          data = r.json;
        }
      }
    }

    return {
      success: true,
      status: r.status,
      finalUrl: r.finalUrl,
      redirected: r.redirected,
      data: data,
      text: r.text
    };
  }

  async function executeBoundPageRead(request, tabId) {
    var c = _getChrome();
    var tab = null;
    if (c && c.tabs && typeof c.tabs.get === 'function') {
      try {
        tab = await c.tabs.get(tabId);
      } catch (tabErr) {
        tab = null;
      }
    }
    var tabOrigin = null;
    try {
      tabOrigin = (tab && tab.url) ? new URL(tab.url).origin : null;
    } catch (originErr) {
      tabOrigin = null;
    }
    if (!tabOrigin || tabOrigin !== (request && request.origin)) {
      return _typedError('RECIPE_ORIGIN_MISMATCH', {
        origin: request && request.origin,
        tabOrigin: tabOrigin
      });
    }
    if (!c || !c.scripting || typeof c.scripting.executeScript !== 'function') {
      return _typedError('RECIPE_DOM_FALLBACK_PENDING', {
        reason: 'page-read-execute-script-unavailable',
        fellBackToDom: true
      });
    }

    var results;
    try {
      results = await c.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: capabilityPageReadInPage,
        args: [request]
      });
    } catch (execErr) {
      return _typedError('RECIPE_DOM_FALLBACK_PENDING', {
        reason: 'page-read-execute-script-failed',
        fellBackToDom: true
      });
    }
    var injectionResult = results && results[0];
    return injectionResult && injectionResult.result
      ? injectionResult.result
      : _typedError('RECIPE_DOM_FALLBACK_PENDING', {
        reason: 'page-read-no-result',
        fellBackToDom: true
      });
  }

  // ===========================================================================
  // classifyOnWake -- the thin local mid-mutation classifier (CAVEAT-1, D-11).
  // ===========================================================================
  //
  // A THIN LOCAL classifier -- it does NOT call Lattice's resume(). Lattice reads
  // snapshot.payload (a JSON string) + state._currentStepName (camelCase); the
  // mcp-task-store envelope is a FLAT object with current_step (snake_case) and
  // method. This reads the flat fields directly and REUSES the Lattice marker
  // STRINGS only.
  //
  // Verdicts:
  //   - a mutating-method (POST/PUT/PATCH/DELETE) snapshot at a non-safe in-flight
  //     marker -> 'RECOVERY_AMBIGUOUS' (surface, NEVER blind-retry).
  //   - a GET/HEAD snapshot at the BEFORE_API_REQUEST marker -> re-issuable
  //     ('ON_ERROR_SW_EVICTION_MID_REQUEST').
  //   - an absent / boundary marker -> 'SAFE'.
  // It NEVER returns a verdict that blind-retries a mutating method.

  function classifyOnWake(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return 'RECOVERY_AMBIGUOUS';
    }
    var marker = snapshot.current_step;
    var method = (typeof snapshot.method === 'string') ? snapshot.method.toUpperCase() : '';

    // Boundary / absent markers are safe to replay (no in-flight request).
    if (marker === undefined || marker === null || marker === '' || marker === 'AFTER_API_REQUEST') {
      return 'SAFE';
    }

    // An in-flight request (BEFORE_API_REQUEST or any other non-safe marker).
    if (MUTATING_METHODS[method]) {
      // Mutating + in-flight: the mutation may or may not have landed. Surface.
      return 'RECOVERY_AMBIGUOUS';
    }
    if (marker === 'BEFORE_API_REQUEST') {
      // GET/HEAD in flight: idempotent, safe to re-issue.
      return 'ON_ERROR_SW_EVICTION_MID_REQUEST';
    }
    // Any other non-safe marker with a non-mutating method: surface to be safe.
    return 'RECOVERY_AMBIGUOUS';
  }

  // ---- Export shape (mirror mcp-task-store.js:179-194) ----------------------

  var exportsObj = {
    capabilityFetchInPage: capabilityFetchInPage,
    capabilityPageReadInPage: capabilityPageReadInPage,
    executeBoundSpec: executeBoundSpec,
    executeBoundPageRead: executeBoundPageRead,
    classifyOnWake: classifyOnWake
  };

  global.FsbCapabilityFetch = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;            // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
