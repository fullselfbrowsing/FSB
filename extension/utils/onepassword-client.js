/**
 * FSB 1Password client (service worker).
 *
 * FSB keeps no passwords or cards of its own. Logins and credit cards live in
 * the user's 1Password account; the FSB local server (fsb-mcp-server) signs in
 * to 1Password through the desktop app or a service account and answers these
 * requests over the paired loopback bridge.
 *
 * Values returned by resolveLogin / resolveCard are secrets. Callers must pass
 * them only to the page-fill step (content script or chrome.scripting) and must
 * never put them in a runtime message, a log line, storage, or a tool result.
 */
(function (root) {
  'use strict';

  var METHOD_PREFIX = 'onepassword.';
  var TIMEOUTS = {
    status: 5000,
    configure: 10000,
    disconnect: 10000,
    list: 75000,
    resolve: 75000,
    save: 75000,
    importLegacy: 120000
  };
  var BRIDGE_WAIT_STEPS = 40;
  var BRIDGE_WAIT_MS = 50;
  // As long as the bridge client's own pairing check may take.
  var PAIRING_PROBE_WAIT_MS = 5000;
  // chrome.storage.local flag: true once the user logged in from the Vault page.
  var LOGGED_IN_KEY = 'fsbOnePasswordLoggedIn';

  function failure(errorCode, error) {
    return { ok: false, errorCode: errorCode, error: error };
  }

  function offline() {
    return failure(
      'onepassword_bridge_offline',
      'FSB connects to 1Password through the FSB local server. Install it with "npx fsb-mcp-server install --native-host", then try again.'
    );
  }

  function unpaired() {
    return failure('onepassword_bridge_unpaired', 'Pair FSB with the local server again, then retry.');
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // mcp-bridge-client.js declares the client as a top-level const. Scripts
  // loaded with importScripts share that name, but a const never becomes a
  // property of self, so it is looked up by name first.
  function bridgeClient() {
    if (typeof mcpBridgeClient !== 'undefined' && mcpBridgeClient) return mcpBridgeClient;
    return root.mcpBridgeClient || null;
  }

  async function ensureBridge() {
    var client = bridgeClient();
    if (!client || typeof client.sendExtRequest !== 'function') return false;
    if (client.isConnected === true) return true;
    if (typeof root.armMcpBridge === 'function') root.armMcpBridge('onepassword');
    for (var attempt = 0; attempt < BRIDGE_WAIT_STEPS; attempt += 1) {
      if (client.isConnected === true) return true;
      await sleep(BRIDGE_WAIT_MS);
    }
    return client.isConnected === true;
  }

  function mapTransportError(error) {
    var code = error && error.code;
    var message = (error && error.message) || '';
    if (code === 'ext_request_timeout') {
      return failure('onepassword_timeout', '1Password did not answer in time. Check the 1Password app for an approval prompt, then try again.');
    }
    if (code === 'agent_provider_offline' || (code === 'invalid_ext_request' && /handler/i.test(message))) {
      return failure('onepassword_server_outdated', 'Update the FSB local server (fsb-mcp-server) to use 1Password.');
    }
    if (code === 'ext_unauthorized') return unpaired();
    if (code === 'bridge_topology_changed') return offline();
    return failure(code || 'onepassword_request_failed', message || '1Password request failed');
  }

  function pairingStatusOf(client) {
    try {
      var state = client && typeof client.getState === 'function' ? client.getState() : null;
      return state && typeof state.pairingStatus === 'string' ? state.pairingStatus : 'unknown';
    } catch (_e) {
      return 'unknown';
    }
  }

  // A socket that opened with a pairing code is checked right after it opens;
  // wait for that answer instead of racing it.
  async function settledPairingStatus(client) {
    for (var waited = 0; pairingStatusOf(client) === 'configured' && waited < PAIRING_PROBE_WAIT_MS; waited += BRIDGE_WAIT_MS) {
      await sleep(BRIDGE_WAIT_MS);
    }
    return pairingStatusOf(client);
  }

  // The FSB local server answers a 1Password request from an unpaired
  // extension by closing the extension's socket, and that socket also carries
  // every MCP tool call. So nothing is sent until the bridge is paired. Pairing
  // goes through the native host the way delegation does it; it reconnects the
  // socket once, and lasts for the browser session. Returns null when paired,
  // otherwise the failure to report.
  async function ensurePaired(client, allowPairing) {
    if ((await settledPairingStatus(client)) === 'paired') return null;
    if (!allowPairing || typeof root.fsbEnsureAgentBridgeReady !== 'function') return unpaired();
    var readiness;
    try {
      readiness = await root.fsbEnsureAgentBridgeReady();
    } catch (_e) {
      return unpaired();
    }
    if (readiness && readiness.ok === true && pairingStatusOf(client) === 'paired') return null;
    return readiness && readiness.code === 'native_host_missing' ? offline() : unpaired();
  }

  async function request(method, payload, timeout, options) {
    if (!(await ensureBridge())) return offline();
    var refused = await ensurePaired(bridgeClient(), !(options && options.pair === false));
    if (refused) return refused;
    try {
      var response = await bridgeClient().sendExtRequest(METHOD_PREFIX + method, payload || {}, { timeout: timeout });
      if (!response || typeof response !== 'object') {
        return failure('onepassword_request_failed', 'Empty response from the FSB local server');
      }
      return response;
    } catch (error) {
      return mapTransportError(error);
    }
  }

  function pageUrlFor(url) {
    if (typeof url !== 'string') return null;
    try {
      var parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
      return parsed.origin;
    } catch (_e) {
      return null;
    }
  }

  var api = {
    // { pair: false } reads the status only if FSB is already paired, so a
    // passive look (opening settings) never reconnects the bridge.
    status: function (options) {
      return request('status', {}, TIMEOUTS.status, { pair: !(options && options.pair === false) });
    },

    // Non-secret settings only. Service-account tokens are set from the CLI.
    // vaultScope 'all' lets FSB read every vault; a vaultIds list limits it.
    configure: function (settings) {
      var payload = {};
      ['authKind', 'accountName', 'vaultIds', 'saveVaultId', 'vaultScope'].forEach(function (key) {
        if (settings && Object.prototype.hasOwnProperty.call(settings, key)) payload[key] = settings[key];
      });
      return request('configure', payload, TIMEOUTS.configure);
    },

    disconnect: function (forget) {
      return request('disconnect', { forget: forget === true }, TIMEOUTS.disconnect);
    },

    listVaults: function () { return request('list-vaults', {}, TIMEOUTS.list); },
    listLogins: function () { return request('list-logins', {}, TIMEOUTS.list); },
    listCards: function () { return request('list-cards', {}, TIMEOUTS.list); },

    /**
     * Login for the page at `url` (only its origin is sent). With itemId the
     * item must still be saved for that site. With requireUnique, several
     * matches fail with `candidates` instead of picking one.
     */
    resolveLogin: function (url, options) {
      var origin = pageUrlFor(url);
      if (!origin) return Promise.resolve(failure('invalid_request', 'Logins can only be filled on http(s) pages'));
      var payload = { url: origin };
      if (options && typeof options.itemId === 'string' && options.itemId) payload.itemId = options.itemId;
      if (options && options.requireUnique === true) payload.requireUnique = true;
      return request('resolve-login', payload, TIMEOUTS.resolve);
    },

    describeCard: function (itemId) {
      return request('describe-card', { itemId: String(itemId || '') }, TIMEOUTS.resolve);
    },

    resolveCard: function (itemId) {
      return request('resolve-card', { itemId: String(itemId || '') }, TIMEOUTS.resolve);
    },

    saveLogin: function (url, username, password) {
      var origin = pageUrlFor(url);
      if (!origin) return Promise.resolve(failure('invalid_request', 'Logins can only be saved for http(s) pages'));
      return request('save-login', {
        url: origin,
        username: String(username || ''),
        password: String(password || '')
      }, TIMEOUTS.save);
    },

    importLegacy: function (logins, cards) {
      return request('import-legacy', {
        logins: Array.isArray(logins) ? logins : [],
        cards: Array.isArray(cards) ? cards : []
      }, TIMEOUTS.importLegacy);
    },

    // Whether the user logged in to 1Password from the Vault page. The page
    // sets the flag after a successful Log in and clears it on Disconnect.
    // Reading it never contacts the local server.
    isLoggedIn: async function () {
      try {
        var storage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
        if (!storage || typeof storage.get !== 'function') return false;
        var stored = await storage.get(LOGGED_IN_KEY);
        return !!(stored && stored[LOGGED_IN_KEY] === true);
      } catch (_e) {
        return false;
      }
    },

    LOGGED_IN_KEY: LOGGED_IN_KEY
  };

  // -------------------------------------------------------------------------
  // Page fills shared by the MCP bridge and the autopilot tool executor.
  // `send(tabId, message)` delivers a content-script message and returns its
  // reply. Results carry metadata only; secret values stay inside this file
  // and the content-script message.
  // -------------------------------------------------------------------------

  var PAYMENT_CONFIRM_TIMEOUT_MS = 120000;

  async function tabSite(tabId) {
    var tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (_e) {
      return { error: failure('tab_unavailable', 'Tab ' + tabId + ' could not be loaded') };
    }
    if (!tab || !tab.url) return { error: failure('tab_unavailable', 'No URL on the target tab') };
    try {
      var parsed = new URL(tab.url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { error: failure('unsupported_page', 'Credentials can only be filled on http(s) pages') };
      }
      return {
        url: tab.url,
        origin: parsed.origin,
        hostname: parsed.hostname,
        // What the user is shown: host plus any non-default port, and the
        // scheme too when the page is not https.
        label: parsed.protocol === 'https:' ? parsed.host : parsed.origin
      };
    } catch (_e) {
      return { error: failure('unsupported_page', 'Cannot determine the site from the tab URL') };
    }
  }

  // Secrets are resolved for one origin (scheme, host, and port). 1Password
  // reads can wait on a desktop approval, so the tab is re-read right before
  // a fill and the content script checks the origin again in the document
  // that receives the values.
  async function sameOrigin(tabId, origin) {
    var now = await tabSite(tabId);
    return !now.error && now.origin === origin;
  }

  function toFillFailure(result, fallback) {
    var out = {
      success: false,
      errorCode: (result && result.errorCode) || 'onepassword_request_failed',
      error: (result && result.error) || fallback
    };
    if (result && typeof result.reason === 'string') out.reason = result.reason;
    if (result && Array.isArray(result.candidates)) {
      out.candidates = result.candidates.map(function (candidate) {
        return {
          id: String(candidate && candidate.id || ''),
          title: String(candidate && candidate.title || ''),
          username: String(candidate && candidate.username || '')
        };
      });
    }
    return out;
  }

  // `hooks.status(state)` reports progress to the on-page status pill. It is
  // optional, receives no secret values, and its failures never affect a fill.
  function pill(hooks, state) {
    if (!hooks || typeof hooks.status !== 'function') return Promise.resolve(null);
    try {
      return Promise.resolve(hooks.status(state)).catch(function () { return null; });
    } catch (_e) {
      return Promise.resolve(null);
    }
  }

  function filledFields(reply) {
    return Array.isArray(reply && reply.filled)
      ? reply.filled.filter(function (field) { return typeof field === 'string'; })
      : [];
  }

  // The pill state for a failed fill: amber for a refusal on purpose, red for
  // a 1Password that cannot be reached, nothing for the rest.
  function failurePhase(result) {
    var code = result && result.errorCode;
    if (code === 'multiple_credentials') {
      return { phase: 'several', count: Array.isArray(result.candidates) ? result.candidates.length : 0 };
    }
    if (code === 'credential_needs_https') return { phase: 'not_https' };
    if (code === 'card_requires_https') return { phase: 'card_needs_https' };
    if (code === 'page_changed' || code === 'merchant_changed') return { phase: 'page_changed' };
    if (code === 'onepassword_auth_failed' && result.reason === 'locked') return { phase: 'locked' };
    if (/^onepassword_(bridge_offline|bridge_unpaired|server_outdated|timeout|request_failed|sdk_unavailable|auth_failed|unavailable)$/.test(String(code || ''))) {
      return { phase: 'unreachable' };
    }
    return { phase: 'exit' };
  }

  // A 1Password call that takes this long is usually waiting on the user to
  // approve FSB in the 1Password app, so the pill says so.
  var APPROVAL_HINT_MS = 2500;
  function withApprovalHint(hooks, promise) {
    if (!hooks) return promise;
    var timer = setTimeout(function () { pill(hooks, { phase: 'approve' }); }, APPROVAL_HINT_MS);
    return Promise.resolve(promise).then(function (value) {
      clearTimeout(timer);
      return value;
    }, function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

  api.fillLoginInTab = async function (tabId, options, send, hooks) {
    var site = await tabSite(tabId);
    if (site.error) return toFillFailure(site.error, 'Tab unavailable');
    pill(hooks, { phase: 'checking', site: site.label });
    var resolved = await withApprovalHint(hooks, api.resolveLogin(site.url, {
      itemId: options && options.itemId,
      requireUnique: !!(options && options.requireUnique)
    }));
    if (!resolved || !resolved.ok || !resolved.login) {
      // Nothing saved for the site: the caller may let the user type a login
      // on the page instead. A credential_id that does not fit the site is the
      // agent's mistake, so it is reported, not turned into a prompt.
      if (options && options.askUser === true && !options.itemId
          && resolved && resolved.errorCode === 'credential_not_found') {
        return api.askLoginInTab(tabId, site, send, hooks, options);
      }
      pill(hooks, failurePhase(resolved));
      return toFillFailure(resolved, 'No 1Password login for ' + site.hostname);
    }
    return fillResolvedLogin(tabId, site, resolved.login, send, hooks);
  };

  // Types one login resolved from 1Password into the tab.
  async function fillResolvedLogin(tabId, site, login, send, hooks) {
    var who = [login.title, login.username].filter(Boolean).join(' · ');
    pill(hooks, { phase: 'signing_1p', who: who });
    if (!(await sameOrigin(tabId, site.origin))) {
      pill(hooks, { phase: 'page_changed' });
      return toFillFailure(
        failure('page_changed', 'The page changed while 1Password was answering; the login was not filled'),
        'Page changed'
      );
    }
    var reply;
    try {
      reply = await send(tabId, {
        action: 'executeAction',
        tool: 'fillCredentialFields',
        params: {
          username: login.username || '',
          password: login.password || '',
          oneTimeCode: login.oneTimeCode || '',
          expectedOrigin: site.origin
        }
      });
    } catch (error) {
      pill(hooks, { phase: 'exit' });
      return failure('fill_failed', 'Content script fill failed: ' + ((error && error.message) || error));
    }
    var ok = !!reply && reply.success !== false;
    var out = {
      success: ok,
      credentialId: String(login.id || ''),
      title: String(login.title || ''),
      site: site.hostname,
      filled: Array.isArray(reply && reply.filled) ? reply.filled : [],
      fieldsFound: (reply && reply.fieldsFound) || {}
    };
    if (!ok) {
      out.errorCode = (reply && reply.errorCode) || 'fill_failed';
      out.error = (reply && reply.error) || 'Fill failed';
    }
    var chips = filledFields(reply);
    var codeOnly = chips.length === 1 && chips[0] === 'one-time-code';
    pill(hooks, ok
      ? { phase: codeOnly ? 'filled_code' : 'filled_1p', who: codeOnly ? String(login.title || '') : who, chips: chips }
      : failurePhase(out));
    return out;
  }

  // -------------------------------------------------------------------------
  // Typing a login on the page when 1Password has none for the site.
  //
  // FSB shows a sheet on the page whose fields live in an extension frame
  // (ui/credential-sheet.html), so page scripts never see a keystroke. The
  // frame talks to this worker over its own port, which no other extension
  // page receives, and must present the request's nonce. The content script
  // hands the nonce to the frame by postMessage, never in the frame URL, which
  // the page can read from its resource timing entries.
  //
  // Typed values go from the frame to this worker, then into the page fill and,
  // when the user asks and a save vault is set, to 1Password. They are never
  // returned, logged, or stored.
  // -------------------------------------------------------------------------

  var LOGIN_ASK_TIMEOUT_MS = 120000;
  var SHEET_PAGE = 'ui/credential-sheet.html';
  var SHEET_PORT = 'fsb-credential-sheet';
  var MAX_TYPED_LENGTH = 2048;
  var pendingAsks = Object.create(null);
  var asksByTab = Object.create(null);

  function randomToken(bytes) {
    var buffer = new Uint8Array(bytes);
    (root.crypto || globalThis.crypto).getRandomValues(buffer);
    var out = '';
    for (var i = 0; i < buffer.length; i += 1) out += (buffer[i] < 16 ? '0' : '') + buffer[i].toString(16);
    return out;
  }

  function notProvided(site, reason) {
    return {
      success: false,
      errorCode: 'credential_not_provided',
      reason: reason,
      error: reason === 'timeout'
        ? 'Nobody typed a login for ' + site.hostname + ' within 2 minutes; nothing was filled'
        : 'The user did not sign in to ' + site.hostname + '; nothing was filled'
    };
  }

  function settleAsk(entry, result, finalState) {
    if (entry.settled) return;
    entry.settled = true;
    clearTimeout(entry.timer);
    delete pendingAsks[entry.requestId];
    if (asksByTab[entry.tabId] === entry.requestId) delete asksByTab[entry.tabId];
    if (finalState) pill(entry.hooks, finalState);
    if (entry.port) {
      try { entry.port.disconnect(); } catch (_e) { /* already gone */ }
      entry.port = null;
    }
    entry.resolve(result);
  }

  api.askLoginInTab = async function (tabId, site, send, hooks, options) {
    var statusResult = await api.status({ pair: false });
    var status = statusResult && statusResult.ok ? statusResult.status : null;
    // effectiveSaveVaultId is the save vault only while 1Password still lists it.
    var canSave = !!(status && status.configured && status.effectiveSaveVaultId);
    var previous = asksByTab[tabId] && pendingAsks[asksByTab[tabId]];
    if (previous) settleAsk(previous, notProvided(previous.site, 'replaced'));

    return new Promise(function (resolve) {
      var entry = {
        requestId: randomToken(16),
        nonce: randomToken(24),
        tabId: tabId,
        site: site,
        send: send,
        hooks: hooks,
        canSave: canSave,
        client: (options && typeof options.client === 'string') ? options.client : '',
        port: null,
        busy: false,
        settled: false,
        resolve: resolve,
        timer: null
      };
      entry.timer = setTimeout(function () {
        settleAsk(entry, notProvided(site, 'timeout'), { phase: 'cancelled' });
      }, LOGIN_ASK_TIMEOUT_MS);
      pendingAsks[entry.requestId] = entry;
      asksByTab[tabId] = entry.requestId;
      pill(hooks, {
        phase: 'ask',
        site: site.label,
        frameUrl: chrome.runtime.getURL(SHEET_PAGE),
        requestId: entry.requestId,
        nonce: entry.nonce
      }).then(function (reply) {
        // No sheet on this page (no content script, or a page FSB cannot draw
        // on): report the original miss instead of waiting out the timer.
        if (!reply || reply.shown !== true) {
          settleAsk(entry, toFillFailure(
            failure('credential_not_found', 'No 1Password login is saved for ' + site.hostname + ', and FSB could not show the sign-in sheet on this page'),
            'No 1Password login for ' + site.hostname
          ), { phase: 'exit' });
        }
      });
    });
  };

  function sheetSenderOk(entry, message, sender) {
    if (!sender || sender.id !== chrome.runtime.id) return false;
    if (!message || typeof message.nonce !== 'string' || message.nonce !== entry.nonce) return false;
    if (!sender.tab || sender.tab.id !== entry.tabId) return false;
    if (typeof sender.frameId !== 'number' || sender.frameId <= 0) return false;
    if (typeof sender.url !== 'string') return false;
    return sender.url.split(/[?#]/)[0] === chrome.runtime.getURL(SHEET_PAGE);
  }

  async function submitTypedLogin(entry, message) {
    var username = typeof message.username === 'string' ? message.username : '';
    var password = typeof message.password === 'string' ? message.password : '';
    if ((!username && !password) || username.length > MAX_TYPED_LENGTH || password.length > MAX_TYPED_LENGTH) {
      return { type: 'refused', errorCode: 'invalid_request' };
    }
    var site = entry.site;
    var save = message.save === true && entry.canSave;
    entry.busy = true;
    pill(entry.hooks, { phase: 'signing_typed', client: entry.client });
    if (!(await sameOrigin(entry.tabId, site.origin))) {
      settleAsk(entry, toFillFailure(
        failure('page_changed', 'The page changed before the typed login was filled; nothing was filled'),
        'Page changed'
      ), { phase: 'page_changed' });
      return null;
    }
    var reply;
    try {
      reply = await entry.send(entry.tabId, {
        action: 'executeAction',
        tool: 'fillCredentialFields',
        params: { username: username, password: password, oneTimeCode: '', expectedOrigin: site.origin }
      });
    } catch (error) {
      settleAsk(entry, failure('fill_failed', 'Content script fill failed: ' + ((error && error.message) || error)), { phase: 'exit' });
      return null;
    }
    var ok = !!reply && reply.success !== false;
    var out = {
      success: ok,
      site: site.hostname,
      by: 'you',
      filled: filledFields(reply),
      fieldsFound: (reply && reply.fieldsFound) || {},
      savedTo1Password: false
    };
    if (!ok) {
      out.errorCode = (reply && reply.errorCode) || 'fill_failed';
      out.error = (reply && reply.error) || 'Fill failed';
      settleAsk(entry, out, { phase: reply && reply.errorCode === 'page_changed' ? 'page_changed' : 'exit' });
      return null;
    }
    if (save) {
      var saved = await api.saveLogin(site.url, username, password);
      out.savedTo1Password = !!(saved && saved.ok);
      if (out.savedTo1Password && saved.saved && saved.saved.id) out.credentialId = String(saved.saved.id);
      if (!out.savedTo1Password) out.saveErrorCode = (saved && saved.errorCode) || 'onepassword_request_failed';
    }
    settleAsk(entry, out, {
      phase: out.savedTo1Password ? 'filled_saved' : 'filled_not_saved',
      chips: out.filled
    });
    return null;
  }

  // "Use 1Password instead", then Continue: the user saved the login in
  // 1Password, so look again and fill it the usual way.
  async function retryFromOnePassword(entry) {
    entry.busy = true;
    var resolved = await api.resolveLogin(entry.site.url, { requireUnique: true });
    if (resolved && resolved.ok && resolved.login) {
      var out = await fillResolvedLogin(entry.tabId, entry.site, resolved.login, entry.send, entry.hooks);
      settleAsk(entry, out);
      return null;
    }
    if (resolved && resolved.errorCode === 'credential_not_found') {
      entry.busy = false;
      return { type: 'still_missing' };
    }
    if (resolved && resolved.errorCode === 'multiple_credentials') {
      settleAsk(entry, toFillFailure(resolved, 'Several 1Password logins match'), {
        phase: 'several',
        count: Array.isArray(resolved.candidates) ? resolved.candidates.length : 0
      });
      return null;
    }
    settleAsk(entry, toFillFailure(resolved, '1Password request failed'), { phase: 'exit' });
    return null;
  }

  async function handleSheetMessage(entry, message) {
    if (entry.busy || entry.settled || !message) return null;
    if (message.type === 'cancel') {
      settleAsk(entry, notProvided(entry.site, 'cancelled'), { phase: 'cancelled' });
      return null;
    }
    if (message.type === 'submit') return submitTypedLogin(entry, message);
    if (message.type === 'retry') return retryFromOnePassword(entry);
    return { type: 'refused', errorCode: 'invalid_request' };
  }

  function postSafely(port, message) {
    try { port.postMessage(message); } catch (_e) { /* the frame went away */ }
  }

  // background.js hands every port named SHEET_PORT to this function.
  api.serveSheetPort = function (port) {
    var entry = null;
    port.onMessage.addListener(function (message) {
      if (!entry) {
        var candidate = message && typeof message.requestId === 'string' ? pendingAsks[message.requestId] : null;
        if (!candidate || candidate.port || candidate.settled || message.type !== 'ready'
            || !sheetSenderOk(candidate, message, port.sender)) {
          postSafely(port, { type: 'refused', errorCode: 'untrusted_sender' });
          return;
        }
        entry = candidate;
        entry.port = port;
        postSafely(port, { type: 'init', site: entry.site.label, canSave: entry.canSave, client: entry.client });
        return;
      }
      Promise.resolve(handleSheetMessage(entry, message)).then(function (reply) {
        if (reply && entry.port === port) postSafely(port, reply);
      });
    });
    port.onDisconnect.addListener(function () {
      // A closed or navigated frame ends the request at once. A submit already
      // in flight finishes on its own.
      if (entry && entry.port === port && !entry.settled && !entry.busy) {
        settleAsk(entry, notProvided(entry.site, 'closed'), { phase: 'exit' });
      }
    });
  };
  api.SHEET_PORT = SHEET_PORT;

  function isTrustedUiSender(sender) {
    var prefix = 'chrome-extension://' + chrome.runtime.id + '/';
    return !!(sender && sender.id === chrome.runtime.id && typeof sender.url === 'string' && sender.url.indexOf(prefix) === 0);
  }

  // Ask the side panel to approve a card fill. Resolves { approved, reason }.
  // Ask the side panel to approve a card fill. Resolves { approved, reason }.
  // Each prompt carries its own request id, which the answer must echo, and
  // only one prompt is open at a time: one click can never approve two fills.
  // The side panel answers the request with { shown: true } once the prompt is
  // on screen; any other answer (another extension page, or none) settles at
  // once as sidepanel_unavailable instead of waiting out the 2 minutes.
  var pendingPayment = null;
  api.requestPaymentConfirmation = function (details) {
    if (pendingPayment) pendingPayment({ approved: false, reason: 'replaced' });
    return new Promise(function (resolve) {
      var settled = false;
      var requestId = randomToken(12);
      var timeoutId = setTimeout(function () { settle({ approved: false, reason: 'timeout' }); }, PAYMENT_CONFIRM_TIMEOUT_MS);
      function settle(value) {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(handler);
        if (pendingPayment === settle) pendingPayment = null;
        resolve(value);
      }
      function handler(request, sender, sendResponse) {
        if (!request || request.requestId !== requestId || request.paymentMethodId !== details.paymentMethodId) return;
        if (request.action !== 'paymentFillApproved' && request.action !== 'paymentFillDenied') return;
        if (!isTrustedUiSender(sender)) return;
        sendResponse({ received: true });
        settle(request.action === 'paymentFillApproved'
          ? { approved: true }
          : { approved: false, reason: 'user_declined' });
      }
      pendingPayment = settle;
      chrome.runtime.onMessage.addListener(handler);
      Promise.resolve(chrome.runtime.sendMessage({
        action: 'paymentFillConfirmation',
        requestId: requestId,
        paymentMethodId: details.paymentMethodId,
        cardBrand: details.cardBrand || 'unknown',
        last4: details.last4 || '****',
        title: details.title || '',
        expiryMonth: details.expiryMonth || '',
        expiryYearLast2: details.expiryYearLast2 || '',
        merchantDomain: details.merchantDomain
      })).then(function (reply) {
        if (!reply || reply.shown !== true) settle({ approved: false, reason: 'sidepanel_unavailable' });
      }, function () {
        settle({ approved: false, reason: 'sidepanel_unavailable' });
      });
    });
  };

  // `options.confirm`: 'sidepanel' (the default) asks the user in FSB's side
  // panel before the card is read; 'agent' skips that prompt because the MCP
  // agent already asked in its own app. Either way the card is read only for
  // an https page and filled only while the tab stays on the same origin.
  api.fillCardInTab = async function (tabId, itemId, send, options, hooks) {
    var site = await tabSite(tabId);
    if (site.error) return toFillFailure(site.error, 'Tab unavailable');
    if (site.origin.indexOf('https:') !== 0) {
      pill(hooks, { phase: 'card_needs_https' });
      var insecure = toFillFailure(
        failure('card_requires_https', 'Cards are filled only on https pages, and ' + site.label + ' is not https; nothing was read from 1Password'),
        'Cards need https'
      );
      insecure.merchantDomain = site.label;
      return insecure;
    }
    var askInPanel = !(options && options.confirm === 'agent');
    pill(hooks, { phase: 'checking', site: site.label });

    // Metadata only until the fill is cleared.
    var described = await withApprovalHint(hooks, api.describeCard(itemId));
    if (!described || !described.ok || !described.card) {
      var missing = toFillFailure(described, 'Payment method not found in 1Password');
      pill(hooks, failurePhase(missing));
      return missing;
    }
    var who = [described.card.title, described.card.last4].filter(Boolean).join(' · ');
    if (askInPanel) {
      var confirm = await api.requestPaymentConfirmation({
        paymentMethodId: String(itemId),
        cardBrand: described.card.cardBrand,
        last4: described.card.last4,
        title: described.card.title,
        expiryMonth: described.card.expiryMonth,
        expiryYearLast2: described.card.expiryYearLast2,
        merchantDomain: site.label
      });
      if (!confirm.approved) {
        var reason = confirm.reason || 'user_declined';
        pill(hooks, { phase: 'exit' });
        return {
          success: false,
          declined: true,
          reason: reason,
          errorCode: 'payment_not_approved',
          error: reason === 'sidepanel_unavailable'
            ? 'Payment confirmation requires the FSB side panel to be open'
            : (reason === 'timeout' ? 'Payment confirmation timed out (2 minutes)' : 'User declined payment fill')
        };
      }
    }
    pill(hooks, { phase: 'filling_card', who: who });

    // The fill was cleared for this origin. Check before reading the card, and
    // again after, since that read can wait on 1Password as well.
    var merchantChanged = toFillFailure(
      failure('merchant_changed', askInPanel
        ? 'The page changed after approval; the card was not filled'
        : 'The page changed before the card fill; the card was not filled'),
      'Page changed'
    );
    if (!(await sameOrigin(tabId, site.origin))) {
      pill(hooks, failurePhase(merchantChanged));
      return merchantChanged;
    }

    var resolved = await withApprovalHint(hooks, api.resolveCard(itemId));
    if (!resolved || !resolved.ok || !resolved.card) {
      var unread = toFillFailure(resolved, 'Could not read the card from 1Password');
      pill(hooks, failurePhase(unread));
      return unread;
    }
    if (!(await sameOrigin(tabId, site.origin))) {
      pill(hooks, failurePhase(merchantChanged));
      return merchantChanged;
    }
    var card = resolved.card;
    var reply;
    try {
      reply = await send(tabId, {
        action: 'executeAction',
        tool: 'fillPaymentFields',
        params: {
          expectedOrigin: site.origin,
          cardNumber: card.cardNumber || '',
          expiryMonth: card.expiryMonth || '',
          expiryYear: card.expiryYear || '',
          cvv: card.cvv || '',
          cardholderName: card.cardholderName || '',
          // fillPaymentFields reads billing from this nested shape.
          billingAddress: (card.addressLine1 || card.city || card.postalCode || card.country) ? {
            line1: card.addressLine1 || '',
            line2: card.addressLine2 || '',
            city: card.city || '',
            region: card.stateRegion || '',
            postalCode: card.postalCode || '',
            country: card.country || ''
          } : null
        }
      });
    } catch (error) {
      pill(hooks, { phase: 'exit' });
      return failure('fill_failed', 'Content script payment fill failed: ' + ((error && error.message) || error));
    }
    var ok = !!reply && reply.success !== false;
    var out = {
      success: ok,
      paymentMethodId: String(itemId),
      title: String(described.card.title || ''),
      cardBrand: described.card.cardBrand,
      last4: described.card.last4,
      merchantDomain: site.label,
      filled: Array.isArray(reply && reply.filled) ? reply.filled : [],
      totalFieldsDetected: (reply && reply.totalFieldsDetected) || 0
    };
    if (!ok) {
      out.errorCode = (reply && reply.errorCode) || 'fill_failed';
      out.error = (reply && reply.error) || 'Payment fill failed';
    }
    pill(hooks, ok ? { phase: 'card_filled', who: who, chips: filledFields(reply) } : failurePhase(out));
    return out;
  };

  root.fsbOnePassword = api;
})(typeof self !== 'undefined' ? self : globalThis);
