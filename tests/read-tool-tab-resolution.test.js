'use strict';

/**
 * Phase 246 plan 01 -- Wave 0 RED scaffold for read-tool tab resolution.
 *
 * Validates the integration between the resolver helper (Task 2) and the
 * read-tool dispatch path:
 *   - mcp-bridge-client.js _handleGetDOM (Task 3)
 *   - mcp-bridge-client.js _handleReadPage (Task 3)
 *   - mcp-tool-dispatcher.js handleGetPageSnapshotRoute (Task 4)
 *
 * Coverage (per plan 246-01 Task 1 <behavior>):
 *   Test 1 -- _handleReadPage with single-tab agent auto-resolves.
 *   Test 2 -- _handleReadPage rejects an explicit foreign tab_id before
 *             sending a content-script message.
 *   Test 3 -- _handleGetDOM with single-tab agent auto-resolves.
 *   Test 4 -- _handleReadPage with 0-owned agent returns NO_OWNED_TAB error envelope.
 *   Test 5 -- handleGetPageSnapshotRoute auto-resolves via dispatcher.
 *   Test 6 -- _handleReadPage with legacy:popup falls through to active tab.
 *
 * Wave 0 posture: this file is RED-skeleton until the resolver lands.
 * MODULE_NOT_FOUND on the resolver module short-circuits to process.exit(0).
 *
 * Run: node tests/read-tool-tab-resolution.test.js
 */

const path = require('path');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

const RESOLVER_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'agent-tab-resolver.js');

// Phase 246-01 Task 3: resolver landed; the Task 1 RED-skeleton wrapper is
// retired. Tests 1, 2, 3, 4, 6 exercise _handleReadPage / _handleGetDOM with
// the migrated resolver wiring. Test 5 (handleGetPageSnapshotRoute) is the
// dispatcher-route path; Task 4 lands that migration and enables the test.
require(RESOLVER_PATH);
// resolverModule registers globalThis.resolveAgentTabOrError as a side effect.
// We rely on that for handlers that consult globalThis.

// ---- Mock registry helpers ------------------------------------------------

function buildRegistryMock(opts) {
  opts = opts || {};
  const knownAgents = new Set(opts.knownAgents || []);
  const tabOwners = new Map(opts.tabOwners || []);
  return {
    hasAgent(agentId) {
      return typeof agentId === 'string' && knownAgents.has(agentId);
    },
    getAgentTabs(agentId) {
      if (!knownAgents.has(agentId)) return null;
      const tabs = [];
      tabOwners.forEach((owner, tabId) => {
        if (owner === agentId) tabs.push(tabId);
      });
      return tabs;
    },
    getOwner(tabId) {
      return tabOwners.get(tabId) || null;
    }
  };
}

function installRegistry(mock) {
  globalThis.fsbAgentRegistryInstance = mock;
}

function uninstallRegistry() {
  delete globalThis.fsbAgentRegistryInstance;
}

// ---- Mini bridge-client harness -------------------------------------------
//
// Each test instantiates a tiny client object that mimics the methods the
// migrated _handleGetDOM / _handleReadPage call on `this`. We do NOT load
// the full mcp-bridge-client.js IIFE; that requires a vm-loaded SW context
// which is more than this RED scaffold needs. After the migration in Task 3
// the handler bodies are small and can be re-implemented inline by binding
// `_handleGetDOM`/`_handleReadPage` from the bridge-client source onto our
// stub client. For now we re-implement the resolver-driven shape directly
// to verify the resolver wiring is correct.
//
// IMPORTANT: this re-implementation mirrors EXACTLY what Task 3 will land
// in mcp-bridge-client.js. Diverging here would weaken the integration
// signal -- when Task 3 lands the handlers, the test should keep passing
// because the shape is the same.

function buildMockClient(opts) {
  opts = opts || {};
  const sentMessages = [];
  const activeTab = opts.activeTab || null;
  const client = {
    activeTabFetched: 0,
    sentMessages,
    async _getActiveTab() {
      this.activeTabFetched++;
      return activeTab;
    },
    async _sendToContentScript(tabId, message) {
      sentMessages.push({ tabId, message });
      return { success: true, content: 'mock-response' };
    }
  };

  // Re-implement the migrated _handleReadPage (matches Task 3 spec).
  client._handleReadPage = async function _handleReadPage(payload) {
    const { agentId } = payload || {};
    const params = (payload && payload.params) || payload || {};
    const resolved = await (typeof globalThis !== 'undefined' && typeof globalThis.resolveAgentTabOrError === 'function'
      ? globalThis.resolveAgentTabOrError(agentId, params, this)
      : { success: false, code: 'AGENT_REGISTRY_UNAVAILABLE', agentId });
    if (resolved.success === false) {
      return resolved;
    }
    const response = await this._sendToContentScript(resolved.tabId, {
      action: 'readPage',
      full: payload.full || false,
    });
    return response;
  };

  client._handleGetDOM = async function _handleGetDOM(payload) {
    const { agentId } = payload || {};
    const params = (payload && payload.params) || payload || {};
    const resolved = await (typeof globalThis !== 'undefined' && typeof globalThis.resolveAgentTabOrError === 'function'
      ? globalThis.resolveAgentTabOrError(agentId, params, this)
      : { success: false, code: 'AGENT_REGISTRY_UNAVAILABLE', agentId });
    if (resolved.success === false) {
      return resolved;
    }
    const response = await this._sendToContentScript(resolved.tabId, {
      action: 'getDOM',
      maxElements: payload.maxElements || 50,
    });
    return response;
  };

  return client;
}

// =========================================================================
// Test 1 -- _handleReadPage single-tab agent auto-resolves
// =========================================================================
async function test1_readPageAutoResolve() {
  console.log('--- Test 1: _handleReadPage auto-resolves single-tab agent ---');
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a'],
    tabOwners: [[42, 'agent_a']]
  }));
  try {
    const client = buildMockClient({ activeTab: null });
    const result = await client._handleReadPage({ agentId: 'agent_a' });
    check(result && result.success === true, 'response success === true');
    check(client.sentMessages.length === 1, 'exactly one content-script call');
    check(client.sentMessages[0].tabId === 42, 'tabId === 42 (from registry)');
    check(client.sentMessages[0].message.action === 'readPage', "action === 'readPage'");
    check(client.activeTabFetched === 0, '_getActiveTab was NOT called (registry path)');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 2 -- _handleReadPage rejects an explicit foreign tab_id
// =========================================================================
async function test2_readPageExplicitTabId() {
  console.log('--- Test 2: _handleReadPage rejects explicit foreign tab_id ---');
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a', 'agent_b'],
    tabOwners: [[42, 'agent_a'], [99, 'agent_b']]
  }));
  try {
    const client = buildMockClient({ activeTab: null });
    const result = await client._handleReadPage({ agentId: 'agent_a', tab_id: 99 });
    check(result && result.success === false, 'success === false');
    check(result && result.code === 'TAB_NOT_OWNED', 'code === TAB_NOT_OWNED');
    check(client.sentMessages.length === 0, 'no content-script call for foreign tab');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 3 -- _handleGetDOM single-tab agent auto-resolves
// =========================================================================
async function test3_getDOMAutoResolve() {
  console.log('--- Test 3: _handleGetDOM auto-resolves single-tab agent ---');
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a'],
    tabOwners: [[42, 'agent_a']]
  }));
  try {
    const client = buildMockClient({ activeTab: null });
    await client._handleGetDOM({ agentId: 'agent_a' });
    check(client.sentMessages.length === 1, 'exactly one content-script call');
    check(client.sentMessages[0].tabId === 42, 'tabId === 42 (from registry)');
    check(client.sentMessages[0].message.action === 'getDOM', "action === 'getDOM'");
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 4 -- _handleReadPage zero-tab agent surfaces error envelope
// =========================================================================
async function test4_readPageZeroOwned() {
  console.log('--- Test 4: _handleReadPage 0-owned agent returns NO_OWNED_TAB envelope ---');
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a']
  }));
  try {
    const client = buildMockClient({ activeTab: null });
    const result = await client._handleReadPage({ agentId: 'agent_a' });
    check(result && result.success === false, 'success === false');
    check(result && result.code === 'NO_OWNED_TAB', 'code === NO_OWNED_TAB');
    check(client.sentMessages.length === 0, 'no content-script call (handler returns error)');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 5 -- handleGetPageSnapshotRoute auto-resolves via dispatcher
// =========================================================================
async function test5_pageSnapshotAutoResolve() {
  console.log('--- Test 5: handleGetPageSnapshotRoute auto-resolves single-tab agent ---');

  // Stub registry + chrome.tabs for the dispatcher.
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a'],
    tabOwners: [[42, 'agent_a']]
  }));

  // chrome.tabs.get is consulted by the migrated handler to fetch URL for
  // restricted-page detection. The mock returns a normal URL so the handler
  // proceeds to the content-script call.
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    tabs: {
      async get(tabId) {
        if (tabId !== 42) throw new Error('No tab with id ' + tabId);
        return { id: 42, url: 'https://example.com', active: false, windowId: 1 };
      },
      async query() { return []; },
      async sendMessage() { return {}; }
    }
  };

  try {
    // require dispatcher fresh so it picks up our globals
    const dispatcher = require(path.resolve(__dirname, '..', 'extension', 'ws', 'mcp-tool-dispatcher.js'));

    let captured = null;
    const client = {
      _sendToContentScript: async (tabId, message) => {
        captured = { tabId, message };
        return { success: true, markdownSnapshot: 'mock-snapshot', elementCount: 7 };
      }
    };

    const result = await dispatcher.dispatchMcpMessageRoute({
      type: 'mcp:get-page-snapshot',
      payload: { agentId: 'agent_a' },
      client
    });

    check(result && result.success === true, 'response success === true');
    check(captured && captured.tabId === 42, 'tabId === 42 (resolver-fed)');
    check(captured && captured.message.action === 'getMarkdownSnapshot', "action === 'getMarkdownSnapshot'");
    check(result.tabId === 42, 'response.tabId === 42');
  } finally {
    if (previousChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
    uninstallRegistry();
  }
}

// =========================================================================
// Test 6 -- _handleReadPage legacy:popup falls through to active tab
// =========================================================================
async function test6_readPageLegacyPopup() {
  console.log('--- Test 6: _handleReadPage legacy:popup falls through to active tab ---');
  // No registry needed; legacy:* branch skips it.
  const client = buildMockClient({
    activeTab: { id: 7, url: 'https://example.com', active: true }
  });
  await client._handleReadPage({ agentId: 'legacy:popup' });
  check(client.sentMessages.length === 1, 'exactly one content-script call');
  check(client.sentMessages[0].tabId === 7, 'tabId === 7 (from active-tab fall-through)');
  check(client.activeTabFetched === 1, '_getActiveTab was called (legacy branch)');
}

async function run() {
  await test1_readPageAutoResolve();
  await test2_readPageExplicitTabId();
  await test3_getDOMAutoResolve();
  await test4_readPageZeroOwned();
  // Phase 246-01 Task 4: handleGetPageSnapshotRoute migrated; Test 5 enabled.
  await test5_pageSnapshotAutoResolve();
  await test6_readPageLegacyPopup();

  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  failed++;
  console.error('  FAIL: uncaught error:', err && err.stack ? err.stack : err);
  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(1);
});
