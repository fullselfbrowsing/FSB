/**
 * Unified Tool Executor for FSB Browser Automation
 *
 * Single dispatch function that routes all 42 browser tools to their correct
 * handler based on _route metadata from tool-definitions.js.
 *
 * Replaces duplicated routing logic in background.js (autopilot lines 10892-10955,
 * MCP lines 13647-13740) with one shared function.
 *
 * Routes:
 *   - 'content' (28 tools): chrome.tabs.sendMessage to content script
 *   - 'cdp' (7 tools): options.cdpHandler callback (delegates to executeCDPToolDirect)
 *   - 'background' (7 tools): chrome.tabs APIs or options.dataHandler callback
 *
 * @module tool-executor
 */

'use strict';

// In Chrome extension importScripts context, TOOL_REGISTRY and getToolByName
// are already globals from tool-definitions.js loaded before this file.
// In Node.js/test context, fall back to require().
// Prefix with _te_ to avoid collisions with agent-loop.js in shared global scope.
var _te_defs = (typeof TOOL_REGISTRY !== 'undefined')
  ? { TOOL_REGISTRY, getToolByName }
  : require('./tool-definitions.js');
var _te_getToolByName = _te_defs.getToolByName;

// ---------------------------------------------------------------------------
// Structured result factory
// ---------------------------------------------------------------------------

/**
 * Create a structured tool result.
 * Every tool execution returns this shape for consistent downstream handling.
 *
 * @param {Object} fields
 * @param {boolean} fields.success - Whether the tool achieved its intended effect
 * @param {boolean} [fields.hadEffect=false] - Whether the page/state changed
 * @param {string|null} [fields.error=null] - Error message if success=false
 * @param {boolean} [fields.navigationTriggered=false] - Whether a page navigation occurred
 * @param {Object|null} [fields.result=null] - Tool-specific payload
 * @returns {Object} Structured result
 */
function makeResult({ success, hadEffect = false, error = null, navigationTriggered = false, result = null }) {
  return {
    success: Boolean(success),
    hadEffect: Boolean(hadEffect),
    error: error || null,
    navigationTriggered: Boolean(navigationTriggered),
    result: result || null
  };
}

function buildAutopilotTriggerParams(params, tabId) {
  const cleaned = Object.assign({}, params || {});
  const ownershipFields = ['agent_id', 'agentId', 'ownership_token', 'ownershipToken'];
  const tabAliasFields = ['tab_id', 'tabId', 'target_tab_id', 'targetTabId'];
  for (const field of ownershipFields) {
    delete cleaned[field];
  }
  if (Object.prototype.hasOwnProperty.call(cleaned, 'targetTabId')
      && !Object.prototype.hasOwnProperty.call(cleaned, 'target_tab_id')) {
    cleaned.target_tab_id = cleaned.targetTabId;
    delete cleaned.targetTabId;
  }
  const hasTabAlias = tabAliasFields.some((field) => (
    Object.prototype.hasOwnProperty.call(cleaned, field)
  ));
  if (!hasTabAlias && Number.isFinite(Number(tabId))) {
    cleaned.tab_id = Number(tabId);
  }
  return cleaned;
}

function autopilotTriggerHadEffect(toolName, response) {
  if (!response || response.success === false) return false;
  if (toolName === 'trigger') return true;
  if (toolName === 'stop_trigger') return response.stopped === true;
  return false;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * Dispatch a content-route tool via chrome.tabs.sendMessage.
 *
 * @param {Object} tool - Tool definition from registry
 * @param {Object} params - Tool parameters
 * @param {number} tabId - Chrome tab ID
 * @returns {Promise<Object>} Structured result
 */
async function executeContentTool(tool, params, tabId) {
  // Special case: get_dom_snapshot has no _contentVerb, uses dedicated message type
  if (tool.name === 'get_dom_snapshot') {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'mcp:get-dom',
        params: params
      });
      return makeResult({
        success: true,
        hadEffect: false,
        result: response
      });
    } catch (err) {
      return makeResult({
        success: false,
        error: `get_dom_snapshot failed: ${err.message || err}`
      });
    }
  }

  // Standard content tools: dispatch via executeAction with the _contentVerb
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'executeAction',
      tool: tool._contentVerb,
      params: params
    });

    // Normalize content script response into structured result.
    // Read-only tools (read_page, get_text, get_attribute, read_sheet) must
    // report hadEffect=false even on success -- otherwise they reset
    // stuck detection (see ai/agent-loop.js detectStuck) and the agent
    // can loop indefinitely on read/narrate patterns without ever acting.
    const success = response && response.success !== false;
    const hadEffect = success && tool._readOnly !== true;
    return makeResult({
      success: success,
      hadEffect: hadEffect,
      error: response?.error || null,
      navigationTriggered: Boolean(response?.navigationTriggered),
      result: response
    });
  } catch (err) {
    const errMsg = err.message || String(err);

    // BF cache detection: content script unreachable because page moved to BF cache
    if (errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')) {
      // Check if URL changed (navigation success) -- the action may have triggered navigation
      try {
        const tab = await chrome.tabs.get(tabId);
        // We cannot compare previous URL here (caller has that context),
        // but we flag the navigation possibility for the caller
        return makeResult({
          success: true,
          hadEffect: true,
          navigationTriggered: true,
          result: { bfCacheDetected: true, currentUrl: tab?.url }
        });
      } catch (_tabErr) {
        // Tab no longer exists
        return makeResult({
          success: false,
          error: 'Tab was closed or became inaccessible',
          navigationTriggered: true
        });
      }
    }

    return makeResult({
      success: false,
      error: `Content tool ${tool.name} failed: ${errMsg}`
    });
  }
}

/**
 * Dispatch a CDP-route tool via the injected cdpHandler callback.
 *
 * The executor does NOT reimplement CDP logic -- it delegates to
 * background.js executeCDPToolDirect via options.cdpHandler.
 *
 * @param {Object} tool - Tool definition from registry
 * @param {Object} params - Tool parameters
 * @param {number} tabId - Chrome tab ID
 * @param {Function} cdpHandler - Callback: (cdpVerb, params, tabId) => Promise<result>
 * @returns {Promise<Object>} Structured result
 */
async function executeCdpTool(tool, params, tabId, cdpHandler) {
  if (typeof cdpHandler !== 'function') {
    return makeResult({
      success: false,
      error: `CDP tool ${tool.name} requires options.cdpHandler callback`
    });
  }

  try {
    const response = await cdpHandler(tool._cdpVerb, params, tabId);
    const success = response && response.success !== false;
    // Mirror executeContentTool: read-only CDP tools must not claim hadEffect.
    const hadEffect = success && tool._readOnly !== true;
    return makeResult({
      success: success,
      hadEffect: hadEffect,
      error: response?.error || null,
      result: response
    });
  } catch (err) {
    return makeResult({
      success: false,
      error: `CDP tool ${tool.name} failed: ${err.message || err}`
    });
  }
}

/**
 * Dispatch a background-route tool using chrome.tabs APIs or dataHandler.
 *
 * Navigation tools (navigate, go_back, go_forward, refresh, open_tab, switch_tab, list_tabs)
 * use chrome.tabs APIs directly since they are simple one-liners.
 *
 * @param {Object} tool - Tool definition from registry
 * @param {Object} params - Tool parameters
 * @param {number} tabId - Chrome tab ID
 * @param {Function|undefined} dataHandler - Optional callback for data tools
 * @returns {Promise<Object>} Structured result
 */
async function executeBackgroundTool(tool, params, tabId, dataHandler) {
  try {
    switch (tool.name) {
      case 'navigate': {
        const url = params?.url;
        if (!url) {
          return makeResult({ success: false, error: 'navigate requires url parameter' });
        }
        let fromUrl = null;
        try {
          const tab = await chrome.tabs.get(tabId);
          fromUrl = tab?.url;
        } catch (_) { /* tab may not be accessible */ }
        // Phase 243 plan 02 (BG-04): stamp BEFORE chrome.tabs.update so the
        // webNavigation.onCommitted listener suppresses its
        // agent-tab-user-navigation emission within the 500ms window.
        try {
          if (typeof globalThis !== 'undefined'
              && globalThis.fsbAgentRegistryInstance
              && typeof globalThis.fsbAgentRegistryInstance.stampAgentNavigation === 'function') {
            globalThis.fsbAgentRegistryInstance.stampAgentNavigation(tabId);
          }
        } catch (_e) { /* best-effort */ }
        await chrome.tabs.update(tabId, { url });
        // Brief wait for navigation to initiate
        await new Promise(r => setTimeout(r, 500));
        return makeResult({
          success: true,
          hadEffect: true,
          navigationTriggered: true,
          result: { navigatingTo: url, fromUrl }
        });
      }

      case 'go_back': {
        // Phase 243 plan 02 (BG-04): stamp BEFORE chrome.tabs.goBack so the
        // webNavigation.onCommitted listener suppresses its
        // agent-tab-user-navigation emission within the 500ms window.
        try {
          if (typeof globalThis !== 'undefined'
              && globalThis.fsbAgentRegistryInstance
              && typeof globalThis.fsbAgentRegistryInstance.stampAgentNavigation === 'function') {
            globalThis.fsbAgentRegistryInstance.stampAgentNavigation(tabId);
          }
        } catch (_e) { /* best-effort */ }
        await chrome.tabs.goBack(tabId);
        return makeResult({
          success: true,
          hadEffect: true,
          navigationTriggered: true,
          result: { direction: 'back' }
        });
      }

      case 'go_forward': {
        // Phase 243 plan 02 (BG-04): stamp BEFORE chrome.tabs.goForward.
        try {
          if (typeof globalThis !== 'undefined'
              && globalThis.fsbAgentRegistryInstance
              && typeof globalThis.fsbAgentRegistryInstance.stampAgentNavigation === 'function') {
            globalThis.fsbAgentRegistryInstance.stampAgentNavigation(tabId);
          }
        } catch (_e) { /* best-effort */ }
        await chrome.tabs.goForward(tabId);
        return makeResult({
          success: true,
          hadEffect: true,
          navigationTriggered: true,
          result: { direction: 'forward' }
        });
      }

      case 'refresh': {
        // Phase 243 plan 02 (BG-04): stamp BEFORE chrome.tabs.reload.
        try {
          if (typeof globalThis !== 'undefined'
              && globalThis.fsbAgentRegistryInstance
              && typeof globalThis.fsbAgentRegistryInstance.stampAgentNavigation === 'function') {
            globalThis.fsbAgentRegistryInstance.stampAgentNavigation(tabId);
          }
        } catch (_e) { /* best-effort */ }
        await chrome.tabs.reload(tabId);
        return makeResult({
          success: true,
          hadEffect: true,
          navigationTriggered: true,
          result: { action: 'refresh' }
        });
      }

      case 'open_tab': {
        const url = params?.url || 'about:blank';
        const active = params?.active === true;
        const newTab = await chrome.tabs.create({ url, active });
        return makeResult({
          success: true,
          hadEffect: true,
          result: { tabId: newTab.id, url, active }
        });
      }

      case 'switch_tab': {
        const targetTabId = params?.tabId;
        if (!targetTabId) {
          return makeResult({ success: false, error: 'switch_tab requires tabId parameter' });
        }
        // Phase 243 BG-02: gate the foreground transition behind the per-tool
        // _forceForeground flag from tool-definitions.js. switch_tab is the
        // only tool with the flag set to true (D-01); every other tool runs
        // background-only. The autopilot dispatch path mirrors the MCP route
        // gate in mcp-tool-dispatcher.js handleSwitchTabRoute.
        const switchTabDef = (typeof _te_getToolByName === 'function')
          ? _te_getToolByName('switch_tab')
          : null;
        const forceForeground = !!(switchTabDef && switchTabDef._forceForeground === true && params?.active === true);
        if (forceForeground) {
          await chrome.tabs.update(targetTabId, { active: true });
          // Focus the window containing the tab
          try {
            const tabWindow = await chrome.tabs.get(targetTabId);
            if (tabWindow.windowId) {
              await chrome.windows.update(tabWindow.windowId, { focused: true });
            }
          } catch (_) { /* window focus is best-effort */ }
        } else {
          // Background-safe path: still resolve the target tab to confirm it
          // exists, but do not steal focus.
          try { await chrome.tabs.get(targetTabId); } catch (_) { /* best-effort */ }
        }
        return makeResult({
          success: true,
          hadEffect: true,
          result: { tabId: targetTabId }
        });
      }

      case 'list_tabs': {
        const allTabs = await chrome.tabs.query({});
        const tabList = allTabs.map(t => ({
          id: t.id,
          title: t.title,
          url: t.url,
          active: t.active,
          windowId: t.windowId
        }));
        return makeResult({
          success: true,
          hadEffect: false,
          result: { tabs: tabList }
        });
      }

      case 'execute_js': {
        // Escape-hatch: run arbitrary JS in the page context via chrome.scripting.
        // Used when standard tools (click, type_text) fail due to overlays,
        // zero-dimension elements, or other DOM quirks on sites like Google Flights.
        const code = params?.code;
        if (!code) {
          return makeResult({ success: false, error: 'execute_js requires code parameter' });
        }
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          func: (jsCode) => {
            try {
              const result = eval(jsCode);
              return { success: true, result: result !== undefined ? String(result).substring(0, 5000) : null };
            } catch (e) {
              return { success: false, error: e.message };
            }
          },
          args: [code]
        });
        const execResult = results?.[0]?.result;
        if (execResult && execResult.success) {
          return makeResult({ success: true, hadEffect: true, result: execResult });
        }
        return makeResult({ success: false, error: execResult?.error || 'JS execution returned no result' });
      }

      case 'upload_file': {
        // Phase 34: set a real file from disk on an <input type=file> via CDP
        // DOM.setFileInputFiles. Same shared background helper the MCP front
        // door uses, so the path denylist + audit cover this autopilot path too.
        const selector = params?.selector;
        const filePath = params?.file_path;
        if (!selector || !filePath) {
          return makeResult({ success: false, error: 'upload_file requires selector and file_path' });
        }
        const uploadFn = (typeof globalThis !== 'undefined' && typeof globalThis.executeUploadFile === 'function')
          ? globalThis.executeUploadFile
          : null;
        if (!uploadFn) {
          return makeResult({ success: false, error: 'upload_file handler unavailable' });
        }
        const r = await uploadFn(tabId, selector, filePath);
        if (r && r.success) {
          return makeResult({ success: true, hadEffect: true, result: r });
        }
        return makeResult({ success: false, error: (r && r.error) || 'upload_file failed' });
      }

      case 'trigger':
      case 'stop_trigger':
      case 'get_trigger_status':
      case 'list_triggers': {
        const dispatch = (typeof globalThis !== 'undefined') ? globalThis.fsbTriggerDispatchToolRequest : null;
        if (typeof dispatch !== 'function') {
          return makeResult({
            success: false,
            error: 'fsbTriggerDispatchToolRequest unavailable'
          });
        }

        const finalParams = buildAutopilotTriggerParams(params, tabId);
        const response = await dispatch(tool.name, finalParams, { tabId, source: 'autopilot' });
        const success = response && response.success !== false;
        return makeResult({
          success,
          hadEffect: autopilotTriggerHadEffect(tool.name, response),
          error: success ? null : (response?.error || response?.errorCode || null),
          result: response
        });
      }

      case 'fill_credential': {
        // Vault fill: look up credential by domain, send to content script for form fill.
        // AI only sends {domain} -- actual username/password resolved here in background,
        // never exposed in tool_use params or AI conversation.
        const domain = params?.domain;
        if (!domain) {
          return makeResult({ success: false, error: 'fill_credential requires domain parameter' });
        }

        // secureConfig is a global in background.js context (loaded at SW startup)
        if (typeof secureConfig === 'undefined' || !secureConfig.getFullCredential) {
          return makeResult({ success: false, error: 'Credential vault not available' });
        }

        let credential;
        try {
          credential = await secureConfig.getFullCredential(domain);
        } catch (err) {
          return makeResult({ success: false, error: 'Vault lookup failed: ' + (err.message || err) });
        }

        if (!credential || (!credential.username && !credential.password)) {
          return makeResult({ success: false, error: 'No saved credentials found for ' + domain });
        }

        // Send fill command to content script -- password travels background->content only
        try {
          const fillResult = await chrome.tabs.sendMessage(tabId, {
            action: 'executeAction',
            tool: 'fillCredentialFields',
            params: {
              username: credential.username || '',
              password: credential.password || ''
            }
          });

          const success = fillResult && fillResult.success !== false;
          return makeResult({
            success: success,
            hadEffect: success,
            error: fillResult?.error || null,
            result: {
              domain: domain,
              filled: fillResult?.filled || [],
              fieldsFound: fillResult?.fieldsFound || {}
            }
          });
        } catch (err) {
          return makeResult({
            success: false,
            error: 'Content script fill failed: ' + (err.message || err)
          });
        }
      }

      case 'fill_payment_method': {
        // Vault fill: look up payment method by ID, show confirmation in sidepanel,
        // then send to content script on approval. AI only sends {paymentMethodId}.
        const pmId = params?.paymentMethodId;
        if (!pmId) {
          return makeResult({ success: false, error: 'fill_payment_method requires paymentMethodId parameter' });
        }

        if (typeof secureConfig === 'undefined' || !secureConfig.getFullPaymentMethod) {
          return makeResult({ success: false, error: 'Payment vault not available' });
        }

        let paymentMethod;
        try {
          paymentMethod = await secureConfig.getFullPaymentMethod(pmId);
        } catch (err) {
          return makeResult({ success: false, error: 'Payment vault lookup failed: ' + (err.message || err) });
        }

        if (!paymentMethod) {
          return makeResult({ success: false, error: 'No saved payment method found for ID ' + pmId });
        }

        // Get the active tab's domain for the confirmation dialog
        let merchantDomain = 'unknown';
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab?.url) {
            merchantDomain = new URL(tab.url).hostname;
          }
        } catch (_) { /* best effort */ }

        // Send confirmation request to sidepanel -- show card brand, last 4, merchant domain
        // Then wait for user approval or denial
        const confirmationResult = await new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            chrome.runtime.onMessage.removeListener(handler);
            resolve({ approved: false, reason: 'timeout' });
          }, 120000); // 2 minute timeout

          function handler(request, sender, sendResponse) {
            if (request.action === 'paymentFillApproved' && request.paymentMethodId === pmId) {
              clearTimeout(timeoutId);
              chrome.runtime.onMessage.removeListener(handler);
              resolve({ approved: true });
              sendResponse({ received: true });
            } else if (request.action === 'paymentFillDenied' && request.paymentMethodId === pmId) {
              clearTimeout(timeoutId);
              chrome.runtime.onMessage.removeListener(handler);
              resolve({ approved: false, reason: 'user_declined' });
              sendResponse({ received: true });
            }
          }

          chrome.runtime.onMessage.addListener(handler);

          // Send the confirmation request to sidepanel
          chrome.runtime.sendMessage({
            action: 'paymentFillConfirmation',
            paymentMethodId: pmId,
            cardBrand: paymentMethod.cardBrand || 'unknown',
            last4: paymentMethod.last4 || '****',
            merchantDomain: merchantDomain
          }).catch(() => {
            // Sidepanel may not be open -- resolve as declined
            clearTimeout(timeoutId);
            chrome.runtime.onMessage.removeListener(handler);
            resolve({ approved: false, reason: 'sidepanel_unavailable' });
          });
        });

        if (!confirmationResult.approved) {
          return makeResult({
            success: false,
            hadEffect: false,
            error: null,
            result: {
              declined: true,
              reason: confirmationResult.reason || 'user_declined'
            }
          });
        }

        // User approved -- send fill command to content script
        try {
          const fillResult = await chrome.tabs.sendMessage(tabId, {
            action: 'executeAction',
            tool: 'fillPaymentFields',
            params: {
              cardNumber: paymentMethod.cardNumber || '',
              cvv: paymentMethod.cvv || '',
              expiryMonth: paymentMethod.expiryMonth || '',
              expiryYear: paymentMethod.expiryYear || '',
              cardholderName: paymentMethod.cardholderName || '',
              billingAddress: paymentMethod.billingAddress || {}
            }
          });

          const success = fillResult && fillResult.success !== false;
          return makeResult({
            success: success,
            hadEffect: success,
            error: fillResult?.error || null,
            result: {
              paymentMethodId: pmId,
              merchantDomain: merchantDomain,
              filled: fillResult?.filled || [],
              totalFieldsDetected: fillResult?.totalFieldsDetected || 0
            }
          });
        } catch (err) {
          return makeResult({
            success: false,
            error: 'Content script payment fill failed: ' + (err.message || err)
          });
        }
      }

      default: {
        // Data tools or other background tools -- delegate to dataHandler callback
        if (typeof dataHandler === 'function') {
          const response = await dataHandler(tool.name, params, tabId);
          const success = response && response.success !== false;
          const explicitHadEffect = typeof response?.hadEffect === 'boolean'
            ? response.hadEffect
            : null;
          return makeResult({
            success: success,
            hadEffect: success && (explicitHadEffect !== null ? explicitHadEffect : true),
            error: response?.error || null,
            result: response
          });
        }
        return makeResult({
          success: false,
          error: `Background tool ${tool.name} has no handler (no dataHandler callback provided)`
        });
      }
    }
  } catch (err) {
    return makeResult({
      success: false,
      error: `Background tool ${tool.name} failed: ${err.message || err}`
    });
  }
}

// ---------------------------------------------------------------------------
// Parameter transforms (tool-definitions param names -> content script names)
// ---------------------------------------------------------------------------

/**
 * Transforms for tools where tool-definitions.js parameter names differ from
 * the content script handler's expected parameter names.
 *
 * fill_sheet: tool-definitions uses {csvData}, content/actions.js expects {data}
 */
const AUTOPILOT_PARAM_TRANSFORMS = {
  fill_sheet: (p) => ({
    startCell: p.startCell,
    data: p.csvData,
    sheetName: p.sheetName,
  }),
};

// ---------------------------------------------------------------------------
// Capability autopilot front door (CAT-04 / INV-02 / D-11)
// ---------------------------------------------------------------------------

// The two capability tools are OUT-of-registry (INV-01), so _te_getToolByName()
// returns null for them and executeTool() would die at "Unknown tool" BEFORE the
// _route switch is ever consulted. The capability branch therefore CANNOT be an
// executeBackgroundTool switch case (the trigger branch lives there only because
// the trigger tools ARE in TOOL_REGISTRY). It MUST be a guard at the TOP of
// executeTool, before _te_getToolByName -- the Pitfall-1 correction.
const CAPABILITY_TOOL_NAMES = new Set(['invoke_capability', 'search_capabilities']);

/**
 * Autopilot front door for the capability tools (CAT-04 / INV-02).
 *
 * Mirrors the `trigger` branch SHAPE (strip ownership via buildAutopilotTriggerParams,
 * source:'autopilot', call the SW-global, wrap in makeResult) but at a DIFFERENT hook
 * point and against a DIFFERENT global: it calls the SAME globalThis.FsbCapabilityRouter
 * the MCP dispatcher calls -- one engine, two thin front doors. No parallel autopilot
 * stack. The router routes every credentialed call through executeBoundSpec, which
 * re-asserts the active-tab origin-pin, so this branch is not a pin bypass.
 *
 * @param {string} name - 'invoke_capability' | 'search_capabilities'
 * @param {Object} params - Tool params (slug/params for invoke; query for search)
 * @param {number} tabId - Chrome tab ID the autopilot is acting against
 * @returns {Promise<Object>} makeResult-shaped { success, hadEffect, error, navigationTriggered, result }
 */
async function executeCapabilityToolForAutopilot(name, params, tabId) {
  const router = (typeof globalThis !== 'undefined') ? globalThis.FsbCapabilityRouter : null;
  if (!router || typeof router.invoke !== 'function') {
    return makeResult({ success: false, error: 'FsbCapabilityRouter unavailable' });
  }

  // Strip agent_id/ownership_token, normalize the tab alias, inject tab_id -- the
  // same ownership-strip the trigger branch uses.
  const finalParams = buildAutopilotTriggerParams(params, tabId);

  // Resolve the active-tab origin as the catalog bias input. executeBoundSpec re-pins
  // the active tab regardless, so a null origin here is non-fatal (the pin still holds).
  let origin = null;
  try {
    const tab = await chrome.tabs.get(tabId);
    origin = (tab && tab.url) ? new URL(tab.url).origin : null;
  } catch (_) {
    origin = null;
  }

  let response;
  if (name === 'invoke_capability') {
    // Route a slug through the shared engine -- may mutate.
    response = await router.invoke(finalParams.slug, finalParams.params || {}, {
      origin,
      tabId,
      source: 'autopilot'
    });
  } else {
    // search_capabilities never mutates: it queries the MiniSearch index directly.
    const searchMod = (typeof FsbCapabilitySearch !== 'undefined') ? FsbCapabilitySearch : null;
    const results = (searchMod && typeof searchMod.search === 'function')
      ? searchMod.search(finalParams.query || '', origin, 5)
      : [];
    response = { success: true, results };
  }

  const success = response && response.success !== false;
  return makeResult({
    success,
    hadEffect: success && name === 'invoke_capability',   // invoke may change state; search never does
    error: success ? null : (response?.error || response?.errorCode || null),
    result: response
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute any of the 42 browser tools by name.
 *
 * Routes to the correct handler based on _route metadata from tool-definitions.js:
 *   - 'content' -> chrome.tabs.sendMessage (content script)
 *   - 'cdp' -> options.cdpHandler callback (executeCDPToolDirect)
 *   - 'background' -> chrome.tabs APIs or options.dataHandler callback
 *
 * @param {string} name - Tool name (snake_case, e.g. 'click', 'navigate', 'click_at')
 * @param {Object} params - Tool-specific parameters
 * @param {number} tabId - Chrome tab ID to execute against
 * @param {Object} [options={}] - Optional callbacks
 * @param {Function} [options.cdpHandler] - (cdpVerb, params, tabId) => Promise<result>
 * @param {Function} [options.dataHandler] - (toolName, params, tabId) => Promise<result>
 * @returns {Promise<Object>} Structured result: {success, hadEffect, error, navigationTriggered, result}
 */
async function executeTool(name, params, tabId, options = {}) {
  // Capability front door (CAT-04): the two capability tools are out-of-registry,
  // so this guard MUST run BEFORE _te_getToolByName (else they die at "Unknown tool").
  if (CAPABILITY_TOOL_NAMES.has(name)) {
    return executeCapabilityToolForAutopilot(name, params, tabId);
  }

  const tool = _te_getToolByName(name);

  if (!tool) {
    return makeResult({
      success: false,
      error: `Unknown tool: ${name}`
    });
  }

  // Apply parameter transforms (e.g., fill_sheet csvData -> data)
  const transform = AUTOPILOT_PARAM_TRANSFORMS[name];
  const finalParams = transform ? transform(params) : params;

  switch (tool._route) {
    case 'content':
      return executeContentTool(tool, finalParams, tabId);

    case 'cdp':
      return executeCdpTool(tool, finalParams, tabId, options.cdpHandler);

    case 'background':
      return executeBackgroundTool(tool, finalParams, tabId, options.dataHandler);

    default:
      return makeResult({
        success: false,
        error: `Tool ${name} has unsupported route: ${tool._route}`
      });
  }
}

/**
 * Check whether a tool is read-only (bypasses mutation queue).
 *
 * Read-only tools: get_dom_snapshot, read_page, get_text, get_attribute, list_tabs, read_sheet
 *
 * @param {string} name - Tool name (snake_case)
 * @returns {boolean} True if tool is read-only, false otherwise
 */
function isReadOnly(name) {
  const tool = _te_getToolByName(name);
  return tool ? tool._readOnly === true : false;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// CommonJS for Chrome extension context and Node.js require()
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { executeTool, isReadOnly, executeCapabilityToolForAutopilot };
}
