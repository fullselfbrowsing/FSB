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
    configure: function (settings) {
      var payload = {};
      ['authKind', 'accountName', 'vaultIds', 'saveVaultId'].forEach(function (key) {
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
    }
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

  api.fillLoginInTab = async function (tabId, options, send) {
    var site = await tabSite(tabId);
    if (site.error) return toFillFailure(site.error, 'Tab unavailable');
    var resolved = await api.resolveLogin(site.url, {
      itemId: options && options.itemId,
      requireUnique: !!(options && options.requireUnique)
    });
    if (!resolved || !resolved.ok || !resolved.login) {
      return toFillFailure(resolved, 'No 1Password login for ' + site.hostname);
    }
    var login = resolved.login;
    if (!(await sameOrigin(tabId, site.origin))) {
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
    return out;
  };

  function isTrustedUiSender(sender) {
    var prefix = 'chrome-extension://' + chrome.runtime.id + '/';
    return !!(sender && sender.id === chrome.runtime.id && typeof sender.url === 'string' && sender.url.indexOf(prefix) === 0);
  }

  // Ask the side panel to approve a card fill. Resolves { approved, reason }.
  api.requestPaymentConfirmation = function (details) {
    return new Promise(function (resolve) {
      var settled = false;
      var timeoutId = setTimeout(function () { settle({ approved: false, reason: 'timeout' }); }, PAYMENT_CONFIRM_TIMEOUT_MS);
      function settle(value) {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(handler);
        resolve(value);
      }
      function handler(request, sender, sendResponse) {
        if (!request || request.paymentMethodId !== details.paymentMethodId) return;
        if (request.action !== 'paymentFillApproved' && request.action !== 'paymentFillDenied') return;
        if (!isTrustedUiSender(sender)) return;
        sendResponse({ received: true });
        settle(request.action === 'paymentFillApproved'
          ? { approved: true }
          : { approved: false, reason: 'user_declined' });
      }
      chrome.runtime.onMessage.addListener(handler);
      chrome.runtime.sendMessage({
        action: 'paymentFillConfirmation',
        paymentMethodId: details.paymentMethodId,
        cardBrand: details.cardBrand || 'unknown',
        last4: details.last4 || '****',
        merchantDomain: details.merchantDomain
      }).catch(function () { settle({ approved: false, reason: 'sidepanel_unavailable' }); });
    });
  };

  api.fillCardInTab = async function (tabId, itemId, send) {
    var site = await tabSite(tabId);
    if (site.error) return toFillFailure(site.error, 'Tab unavailable');

    // Metadata only until the user approves.
    var described = await api.describeCard(itemId);
    if (!described || !described.ok || !described.card) {
      return toFillFailure(described, 'Payment method not found in 1Password');
    }
    var confirm = await api.requestPaymentConfirmation({
      paymentMethodId: String(itemId),
      cardBrand: described.card.cardBrand,
      last4: described.card.last4,
      merchantDomain: site.label
    });
    if (!confirm.approved) {
      var reason = confirm.reason || 'user_declined';
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

    // The approval was for this origin. Check before reading the card, and
    // again after, since that read can wait on 1Password as well.
    var merchantChanged = toFillFailure(
      failure('merchant_changed', 'The page changed after approval; the card was not filled'),
      'Page changed'
    );
    if (!(await sameOrigin(tabId, site.origin))) return merchantChanged;

    var resolved = await api.resolveCard(itemId);
    if (!resolved || !resolved.ok || !resolved.card) {
      return toFillFailure(resolved, 'Could not read the card from 1Password');
    }
    if (!(await sameOrigin(tabId, site.origin))) return merchantChanged;
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
      return failure('fill_failed', 'Content script payment fill failed: ' + ((error && error.message) || error));
    }
    var ok = !!reply && reply.success !== false;
    var out = {
      success: ok,
      paymentMethodId: String(itemId),
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
    return out;
  };

  root.fsbOnePassword = api;
})(typeof self !== 'undefined' ? self : globalThis);
