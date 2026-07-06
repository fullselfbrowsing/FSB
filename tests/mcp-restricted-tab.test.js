'use strict';

/**
 * Restricted-tab MCP parity regression tests.
 * Run: npm --prefix mcp run build && node tests/mcp-restricted-tab.test.js
 */

const path = require('path');
const util = require('util');
const { pathToFileURL } = require('url');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function assertDeepEqual(actual, expected, msg) {
  assert(util.isDeepStrictEqual(actual, expected), `${msg} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

const repoRoot = path.resolve(__dirname, '..');
const dispatcherRelativePath = 'extension/ws/mcp-tool-dispatcher.js';
const expectedRecoveryTools = ['navigate', 'open_tab', 'switch_tab', 'list_tabs'];
const restrictedUrls = [
  'chrome://newtab/',
  'about:blank',
  'chrome://settings/',
  'chrome://extensions/',
  'chrome://history/',
  'chrome://downloads/'
];

function createFailingContentDispatch(label) {
  return async () => {
    throw new Error(`${label} attempted content-script dispatch`);
  };
}

function createChromeMock(currentUrl) {
  const activeTab = {
    id: 19901,
    url: currentUrl,
    title: `Restricted ${currentUrl}`,
    active: true,
    windowId: 1
  };

  return {
    runtime: {
      id: 'phase-199-test-extension',
      lastError: null
    },
    tabs: {
      async query(queryInfo) {
        if (queryInfo && queryInfo.active && queryInfo.currentWindow) {
          return [activeTab];
        }
        return [activeTab];
      },
      sendMessage: () => {
        throw new Error('chrome.tabs.sendMessage attempted content-script dispatch');
      }
    }
  };
}

function installRestrictedTabGlobals(currentUrl) {
  const chrome = createChromeMock(currentUrl);
  global.chrome = chrome;
  global.sendMessageWithRetry = createFailingContentDispatch('sendMessageWithRetry');
  global.ensureContentScriptInjected = createFailingContentDispatch('ensureContentScriptInjected');

  return {
    chrome,
    tab: {
      id: 19901,
      url: currentUrl,
      title: `Restricted ${currentUrl}`,
      active: true,
      windowId: 1
    },
    client: {
      async _getActiveTab() {
        return {
          id: 19901,
          url: currentUrl,
          title: `Restricted ${currentUrl}`,
          active: true,
          windowId: 1
        };
      },
      _sendToContentScript: createFailingContentDispatch('client._sendToContentScript')
    }
  };
}

function loadDispatcher() {
  const dispatcherPath = path.join(repoRoot, dispatcherRelativePath);
  try {
    return require(dispatcherPath);
  } catch (error) {
    assert(false, `Missing executable dispatcher module ${dispatcherRelativePath}: ${error.code || error.message}`);
    return null;
  }
}

function assertRestrictedResponse(response, url, routeLabel) {
  assert(response && response.errorCode === 'restricted_active_tab', `${routeLabel} on ${url} returns errorCode restricted_active_tab`);
  assertDeepEqual(response?.validRecoveryTools, expectedRecoveryTools, `${routeLabel} on ${url} exposes navigation-only validRecoveryTools`);
  assert(!JSON.stringify(response || {}).includes('run_task'), `${routeLabel} on ${url} does not contain run_task`);
  assert(typeof response?.currentUrl === 'string' && response.currentUrl === url, `${routeLabel} on ${url} preserves currentUrl`);
  assert(typeof response?.pageType === 'string' && response.pageType.length > 0, `${routeLabel} on ${url} includes pageType`);
}

async function callRestrictedRoute(dispatcher, url, type, payload) {
  const harness = installRestrictedTabGlobals(url);
  return dispatcher.dispatchMcpMessageRoute({
    type,
    payload,
    client: harness.client,
    mcpMsgId: `phase199-${type}-${url}`
  });
}

async function runDispatcherRouteCases(dispatcher) {
  console.log('\n--- restricted dispatcher route contract ---');

  if (!dispatcher) return;

  const {
    dispatchMcpMessageRoute,
    buildRestrictedMcpResponse,
    MCP_NAVIGATION_RECOVERY_TOOLS
  } = dispatcher;

  assert(typeof dispatchMcpMessageRoute === 'function', 'dispatchMcpMessageRoute export exists');
  assert(typeof buildRestrictedMcpResponse === 'function', 'buildRestrictedMcpResponse export exists');
  assertDeepEqual(MCP_NAVIGATION_RECOVERY_TOOLS, expectedRecoveryTools, 'MCP_NAVIGATION_RECOVERY_TOOLS is navigation/tab-only');

  if (typeof dispatchMcpMessageRoute !== 'function') return;

  let firstRouteResponse = null;
  for (const currentUrl of restrictedUrls) {
    const readResponse = await callRestrictedRoute(dispatcher, currentUrl, 'mcp:read-page', { full: true });
    if (!firstRouteResponse) firstRouteResponse = readResponse;
    assertRestrictedResponse(readResponse, currentUrl, 'mcp:read-page');

    const domResponse = await callRestrictedRoute(dispatcher, currentUrl, 'mcp:get-dom', { maxElements: 50 });
    assertRestrictedResponse(domResponse, currentUrl, 'mcp:get-dom');
  }

  if (typeof buildRestrictedMcpResponse === 'function') {
    const direct = buildRestrictedMcpResponse({
      currentUrl: 'chrome://newtab/',
      pageType: 'Chrome internal page',
      tool: 'read_page',
      error: new Error('Content scripts are blocked on browser pages')
    });

    assertRestrictedResponse(direct, 'chrome://newtab/', 'buildRestrictedMcpResponse');

    if (firstRouteResponse) {
      assertDeepEqual(
        direct.validRecoveryTools,
        firstRouteResponse.validRecoveryTools,
        'buildRestrictedMcpResponse helper validRecoveryTools match dispatcher route response',
      );
    }
  }
}

// ---- Resolver-aware routing regression (the tab_id-vs-active-tab bug fix) ---
//
// The cases above prove the LEGACY fallback (no resolver wired up, no explicit
// tab_id) still checks the OS-active tab correctly. These cases prove the FIXED
// behavior when a resolver IS present: the pre-check must follow the caller's
// actual resolved target tab, not Chrome's OS-active tab.

const RESOLVER_TAB_A = 30001; // the caller's explicit target
const RESOLVER_TAB_B = 30002; // Chrome's OS-active tab (may differ from the target)

function createMultiTabChromeMock(tabsById, activeTabId) {
  return {
    runtime: { id: 'phase-199-test-extension', lastError: null },
    tabs: {
      async get(tabId) {
        const tab = tabsById[tabId];
        if (!tab) throw new Error('No tab with id: ' + tabId);
        return tab;
      },
      async query(queryInfo) {
        if (queryInfo && queryInfo.active && queryInfo.currentWindow) {
          const active = tabsById[activeTabId];
          return active ? [active] : [];
        }
        return Object.values(tabsById);
      },
      sendMessage: () => {
        throw new Error('chrome.tabs.sendMessage should not be reached in resolver-aware cases');
      }
    }
  };
}

// Installs a resolver-aware harness: a fake globalThis.resolveAgentTabOrError (so
// buildRestrictedResponseIfReadRoute takes the resolved-tab branch instead of the
// legacy active-tab fallback), a multi-tab chrome.tabs mock, and a client whose
// _handleGetDOM/_handleReadPage mirror the real handlers' contract closely enough
// to prove reachability and resolver-error passthrough: each calls
// resolveAgentTabOrError itself and forwards a failure verbatim, exactly like the
// real extension/ws/mcp-bridge-client.js _handleGetDOM/_handleReadPage do.
function installResolverAwareGlobals({ tabsById, activeTabId, resolverResult }) {
  global.chrome = createMultiTabChromeMock(tabsById, activeTabId);
  global.sendMessageWithRetry = createFailingContentDispatch('sendMessageWithRetry');
  global.ensureContentScriptInjected = createFailingContentDispatch('ensureContentScriptInjected');
  global.resolveAgentTabOrError = async () => resolverResult;

  const callLog = [];
  const client = {
    async _getActiveTab() {
      return tabsById[activeTabId] || null;
    },
    _sendToContentScript: createFailingContentDispatch('client._sendToContentScript'),
    async _handleGetDOM(payload, mcpMsgId) {
      callLog.push({ method: '_handleGetDOM', payload, mcpMsgId });
      const { agentId } = payload || {};
      const params = (payload && payload.params) || payload || {};
      const resolved = await global.resolveAgentTabOrError(agentId, params, client);
      if (resolved.success === false) return resolved;
      return { success: true, tool: 'get_dom_snapshot', tabId: resolved.tabId, mock: 'getDOM-ok' };
    },
    async _handleReadPage(payload, mcpMsgId) {
      callLog.push({ method: '_handleReadPage', payload, mcpMsgId });
      const { agentId } = payload || {};
      const params = (payload && payload.params) || payload || {};
      const resolved = await global.resolveAgentTabOrError(agentId, params, client);
      if (resolved.success === false) return resolved;
      return { success: true, tool: 'read_page', tabId: resolved.tabId, mock: 'readPage-ok' };
    }
  };

  return { client, callLog };
}

function clearResolverAwareGlobals() {
  delete global.resolveAgentTabOrError;
}

async function runResolverAwareRouteCases(dispatcher) {
  console.log('\n--- resolver-aware target-tab routing (tab_id vs active-tab bug fix) ---');

  if (!dispatcher) return;
  const { dispatchMcpMessageRoute } = dispatcher;
  if (typeof dispatchMcpMessageRoute !== 'function') return;

  // Case A -- core regression proof: explicit tab_id targets a NORMAL tab (A)
  // while a DIFFERENT, RESTRICTED tab (B) is OS-active. Must NOT be blocked,
  // and the real handler must actually be reached with the right tabId.
  {
    const tabsById = {
      [RESOLVER_TAB_A]: { id: RESOLVER_TAB_A, url: 'https://example.com/normal-page', active: false, windowId: 1 },
      [RESOLVER_TAB_B]: { id: RESOLVER_TAB_B, url: 'chrome://newtab/', active: true, windowId: 1 }
    };
    const { client, callLog } = installResolverAwareGlobals({
      tabsById,
      activeTabId: RESOLVER_TAB_B,
      resolverResult: { tabId: RESOLVER_TAB_A, ownershipToken: null, skipGate: false }
    });

    const readResponse = await dispatchMcpMessageRoute({
      type: 'mcp:read-page',
      payload: { agentId: 'agent-1', tab_id: RESOLVER_TAB_A, full: true },
      client,
      mcpMsgId: 'case-a-read-page'
    });
    assert(readResponse?.errorCode !== 'restricted_active_tab', 'Case A: read_page targeting a normal tab is NOT blocked by an unrelated restricted active tab');
    assert(readResponse?.success === true && readResponse?.tabId === RESOLVER_TAB_A, 'Case A: read_page reaches the real handler with the resolved target tabId');
    assert(callLog.some((c) => c.method === '_handleReadPage'), 'Case A: _handleReadPage was actually invoked (proves the request was not short-circuited)');

    const domResponse = await dispatchMcpMessageRoute({
      type: 'mcp:get-dom',
      payload: { agentId: 'agent-1', tab_id: RESOLVER_TAB_A, maxElements: 50 },
      client,
      mcpMsgId: 'case-a-get-dom'
    });
    assert(domResponse?.errorCode !== 'restricted_active_tab', 'Case A: get_dom_snapshot targeting a normal tab is NOT blocked by an unrelated restricted active tab');
    assert(domResponse?.success === true && domResponse?.tabId === RESOLVER_TAB_A, 'Case A: get_dom_snapshot reaches the real handler with the resolved target tabId');

    clearResolverAwareGlobals();
  }

  // Case B -- negative control: explicit tab_id targets a RESTRICTED tab (A)
  // while a DIFFERENT, NORMAL tab (B) is OS-active. Must still be blocked, and
  // must report the TARGETED tab's URL, not the active tab's.
  {
    const tabsById = {
      [RESOLVER_TAB_A]: { id: RESOLVER_TAB_A, url: 'chrome://settings/', active: false, windowId: 1 },
      [RESOLVER_TAB_B]: { id: RESOLVER_TAB_B, url: 'https://example.com/normal-page', active: true, windowId: 1 }
    };
    const { client, callLog } = installResolverAwareGlobals({
      tabsById,
      activeTabId: RESOLVER_TAB_B,
      resolverResult: { tabId: RESOLVER_TAB_A, ownershipToken: null, skipGate: false }
    });

    const response = await dispatchMcpMessageRoute({
      type: 'mcp:read-page',
      payload: { agentId: 'agent-1', tab_id: RESOLVER_TAB_A, full: true },
      client,
      mcpMsgId: 'case-b-read-page'
    });
    assertRestrictedResponse(response, 'chrome://settings/', 'mcp:read-page (Case B, explicit tab_id)');
    assert(callLog.length === 0, 'Case B: the real handler is never reached when the explicitly targeted tab is restricted');

    clearResolverAwareGlobals();
  }

  // Case C -- resolution-failure passthrough: the resolver cannot pick a tab
  // (e.g. ambiguous multi-tab agent). The pre-check must NOT mask this as a
  // restricted-tab verdict; the real handler's forwarded resolver error must surface.
  {
    const tabsById = {
      [RESOLVER_TAB_B]: { id: RESOLVER_TAB_B, url: 'https://example.com/normal-page', active: true, windowId: 1 }
    };
    const ambiguousFailure = { success: false, code: 'AMBIGUOUS_TAB', agentId: 'agent-1', tabIds: [RESOLVER_TAB_A, RESOLVER_TAB_B] };
    const { client } = installResolverAwareGlobals({
      tabsById,
      activeTabId: RESOLVER_TAB_B,
      resolverResult: ambiguousFailure
    });

    const response = await dispatchMcpMessageRoute({
      type: 'mcp:get-dom',
      payload: { agentId: 'agent-1', maxElements: 50 },
      client,
      mcpMsgId: 'case-c-get-dom'
    });
    assert(response?.errorCode !== 'restricted_active_tab', 'Case C: an ambiguous-tab resolution failure is not reported as a restricted tab');
    assert(response?.success === false && response?.code === 'AMBIGUOUS_TAB', 'Case C: the resolver failure code passes through to the caller');

    clearResolverAwareGlobals();
  }

  // Case D -- tab-vanished race: the resolver succeeds but the resolved tabId no
  // longer exists by the time chrome.tabs.get is called. The pre-check must
  // degrade gracefully (defer to the real handler), not throw or false-positive-restrict.
  {
    const VANISHED_TAB_ID = 30099;
    const tabsById = {
      [RESOLVER_TAB_B]: { id: RESOLVER_TAB_B, url: 'https://example.com/normal-page', active: true, windowId: 1 }
    };
    const { client } = installResolverAwareGlobals({
      tabsById,
      activeTabId: RESOLVER_TAB_B,
      resolverResult: { tabId: VANISHED_TAB_ID, ownershipToken: null, skipGate: false }
    });

    let response;
    let threw = false;
    try {
      response = await dispatchMcpMessageRoute({
        type: 'mcp:read-page',
        payload: { agentId: 'agent-1', tab_id: VANISHED_TAB_ID, full: true },
        client,
        mcpMsgId: 'case-d-read-page'
      });
    } catch (_e) {
      threw = true;
    }
    assert(!threw, 'Case D: a vanished resolved tab does not throw out of dispatchMcpMessageRoute');
    assert(response?.errorCode !== 'restricted_active_tab', 'Case D: a vanished resolved tab is not reported as a restricted tab');

    clearResolverAwareGlobals();
  }
}

async function runErrorMapperCase() {
  console.log('\n--- mapped MCP error messaging ---');

  const errorsModuleUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'errors.js')).href;
  const { mapFSBError } = await import(errorsModuleUrl);

  const mapped = mapFSBError({
    success: false,
    errorCode: 'restricted_active_tab',
    pageType: 'Chrome internal page',
    currentUrl: 'chrome://newtab/',
    validRecoveryTools: expectedRecoveryTools
  });

  const text = mapped.content[0].text;
  for (const tool of expectedRecoveryTools) {
    assert(text.includes(tool), `mapFSBError includes ${tool} recovery guidance`);
  }
  assert(!text.includes('run_task'), 'mapFSBError omits run_task from restricted recovery guidance');
}

async function run() {
  const dispatcher = loadDispatcher();
  await runDispatcherRouteCases(dispatcher);
  await runResolverAwareRouteCases(dispatcher);
  await runErrorMapperCase();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
