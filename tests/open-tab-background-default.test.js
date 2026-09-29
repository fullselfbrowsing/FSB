'use strict';

/**
 * Phase 246 plan 01 -- Wave 0 RED scaffold for open_tab background-default.
 *
 * Validates the open_tab default flip (D-05), the schema documentation
 * (D-06), and the preserved bindTab + ownershipToken contract (D-08).
 * After the flip, `chrome.tabs.create` MUST be invoked with `active: false`
 * unless the caller explicitly passes `active: true`. open_tab still binds
 * the freshly created tab to the agent and surfaces ownershipToken in the
 * response (Phase 240 D-08 contract).
 *
 * Coverage (per plan 246-01 Task 1 <behavior>):
 *   Test 1 (D-05 default)  -- omit `active` -> chrome.tabs.create called
 *                              with active:false.
 *   Test 2 (D-05 explicit) -- `active: true` -> create called with
 *                              active:true.
 *   Test 3 (D-05 explicit) -- `active: false` -> create called with
 *                              active:false.
 *   Test 4 (D-08 bindTab)  -- After Test 1, registry's bindTab(agentId,
 *                              tabId) was called.
 *   Test 5 (D-08 token)    -- response object surfaces ownershipToken.
 *
 * Wave 0 posture: this file is RED-skeleton. The resolver module does not
 * yet exist (Task 2 creates it); we short-circuit on MODULE_NOT_FOUND.
 *
 * Run: node tests/open-tab-background-default.test.js
 */

const path = require('path');
const fs = require('fs');

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

// Phase 246-01 Task 5: open_tab default flipped; gates retired. Resolver and
// dispatcher source must be present for the tests below to exercise the
// flipped behavior end-to-end.
require(RESOLVER_PATH);

// ---- Mock registry helpers ------------------------------------------------

function buildRegistryMock(opts) {
  opts = opts || {};
  const knownAgents = new Set(opts.knownAgents || []);
  const tabOwners = new Map(opts.tabOwners || []);
  const bindCalls = [];
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
    isOwnedBy(tabId, agentId, _ownershipToken) {
      return tabOwners.get(tabId) === agentId;
    },
    getOwner(tabId) {
      return tabOwners.get(tabId) || null;
    },
    getTabMetadata(_tabId) {
      return null;
    },
    getAgentWindowId(_agentId) {
      return null;
    },
    async bindTab(agentId, tabId) {
      bindCalls.push({ agentId, tabId });
      knownAgents.add(agentId);
      tabOwners.set(tabId, agentId);
      return { agentId, tabId, ownershipToken: 'tok_test_' + tabId };
    },
    _bindCalls: bindCalls
  };
}

function installRegistry(mock) {
  globalThis.fsbAgentRegistryInstance = mock;
}

function uninstallRegistry() {
  delete globalThis.fsbAgentRegistryInstance;
}

// ---- Chrome API mock ------------------------------------------------------

function installChrome(captured) {
  globalThis.chrome = {
    tabs: {
      async create(params) {
        captured.createArgs = Object.assign({}, params);
        return { id: 999, url: params.url, active: !!params.active };
      },
      async query() { return []; }
    }
  };
}

function uninstallChrome(prev) {
  if (prev === undefined) {
    delete globalThis.chrome;
  } else {
    globalThis.chrome = prev;
  }
}

// =========================================================================
// Test 1 (D-05 default) -- omit active -> chrome.tabs.create active:false
// =========================================================================
async function test1_defaultBackground() {
  console.log('--- Test 1: D-05 default (no active flag) -> chrome.tabs.create active:false ---');
  const captured = {};
  const prevChrome = globalThis.chrome;
  installChrome(captured);
  const mock = buildRegistryMock({ knownAgents: ['agent_a'] });
  installRegistry(mock);
  try {
    const dispatcher = require(path.resolve(__dirname, '..', 'extension', 'ws', 'mcp-tool-dispatcher.js'));
    const result = await dispatcher.dispatchMcpToolRoute({
      tool: 'open_tab',
      params: { url: 'https://example.com', agentId: 'agent_a' },
      payload: { agentId: 'agent_a' }
    });
    check(captured.createArgs && captured.createArgs.active === false, 'chrome.tabs.create called with active:false');
    check(captured.createArgs && captured.createArgs.url === 'https://example.com', 'url forwarded to create');
    check(result && result.success !== false, 'open_tab succeeded (result.success not false)');
  } finally {
    uninstallRegistry();
    uninstallChrome(prevChrome);
  }
}

// =========================================================================
// Test 2 (D-05 explicit true) -- active:true -> create active:true
// =========================================================================
async function test2_explicitActiveTrue() {
  console.log('--- Test 2: D-05 explicit active:true -> chrome.tabs.create active:true ---');
  const captured = {};
  const prevChrome = globalThis.chrome;
  installChrome(captured);
  const mock = buildRegistryMock({ knownAgents: ['agent_a'] });
  installRegistry(mock);
  try {
    const dispatcher = require(path.resolve(__dirname, '..', 'extension', 'ws', 'mcp-tool-dispatcher.js'));
    await dispatcher.dispatchMcpToolRoute({
      tool: 'open_tab',
      params: { url: 'https://example.com', active: true, agentId: 'agent_a' },
      payload: { agentId: 'agent_a' }
    });
    check(captured.createArgs && captured.createArgs.active === true, 'chrome.tabs.create called with active:true');
  } finally {
    uninstallRegistry();
    uninstallChrome(prevChrome);
  }
}

// =========================================================================
// Test 3 (D-05 explicit false) -- active:false -> create active:false
// =========================================================================
async function test3_explicitActiveFalse() {
  console.log('--- Test 3: D-05 explicit active:false -> chrome.tabs.create active:false ---');
  const captured = {};
  const prevChrome = globalThis.chrome;
  installChrome(captured);
  const mock = buildRegistryMock({ knownAgents: ['agent_a'] });
  installRegistry(mock);
  try {
    const dispatcher = require(path.resolve(__dirname, '..', 'extension', 'ws', 'mcp-tool-dispatcher.js'));
    await dispatcher.dispatchMcpToolRoute({
      tool: 'open_tab',
      params: { url: 'https://example.com', active: false, agentId: 'agent_a' },
      payload: { agentId: 'agent_a' }
    });
    check(captured.createArgs && captured.createArgs.active === false, 'chrome.tabs.create called with active:false');
  } finally {
    uninstallRegistry();
    uninstallChrome(prevChrome);
  }
}

// =========================================================================
// Test 4 (D-08 bindTab preserved)
// =========================================================================
async function test4_bindTabPreserved() {
  console.log('--- Test 4: D-08 bindTab still called on success ---');
  const captured = {};
  const prevChrome = globalThis.chrome;
  installChrome(captured);
  const mock = buildRegistryMock({ knownAgents: ['agent_a'] });
  installRegistry(mock);
  try {
    const dispatcher = require(path.resolve(__dirname, '..', 'extension', 'ws', 'mcp-tool-dispatcher.js'));
    await dispatcher.dispatchMcpToolRoute({
      tool: 'open_tab',
      params: { url: 'https://example.com', agentId: 'agent_a' },
      payload: { agentId: 'agent_a' }
    });
    check(mock._bindCalls.length === 1, 'bindTab was called exactly once');
    check(mock._bindCalls[0].agentId === 'agent_a', 'bindTab agentId === agent_a');
    check(mock._bindCalls[0].tabId === 999, 'bindTab tabId === 999 (from create response)');
  } finally {
    uninstallRegistry();
    uninstallChrome(prevChrome);
  }
}

// =========================================================================
// Test 5 (D-08 ownershipToken in response)
// =========================================================================
async function test5_ownershipTokenSurfaced() {
  console.log('--- Test 5: D-08 response surfaces ownershipToken ---');
  const captured = {};
  const prevChrome = globalThis.chrome;
  installChrome(captured);
  const mock = buildRegistryMock({ knownAgents: ['agent_a'] });
  installRegistry(mock);
  try {
    const dispatcher = require(path.resolve(__dirname, '..', 'extension', 'ws', 'mcp-tool-dispatcher.js'));
    const result = await dispatcher.dispatchMcpToolRoute({
      tool: 'open_tab',
      params: { url: 'https://example.com', agentId: 'agent_a' },
      payload: { agentId: 'agent_a' }
    });
    check(result && typeof result.ownershipToken === 'string', 'response.ownershipToken is a string');
    check(result && result.ownershipToken === 'tok_test_999', 'ownershipToken === tok_test_999 (from mock bindTab)');
  } finally {
    uninstallRegistry();
    uninstallChrome(prevChrome);
  }
}

// =========================================================================
// Test 6 (Phase 61) -- delegation ownership does not change focus policy
// =========================================================================
async function test6_delegationLeavesBackgroundDefaultUntouched() {
  console.log('--- Test 6: Phase 61 delegation lifecycle leaves background-open policy untouched ---');
  const dispatcherPath = path.resolve(__dirname, '..', 'extension', 'ws', 'mcp-tool-dispatcher.js');
  const source = fs.readFileSync(dispatcherPath, 'utf8');
  const start = source.indexOf('async function handleOpenTabRoute');
  const end = source.indexOf('\nasync function ', start + 1);
  const body = source.slice(start, end === -1 ? source.length : end);
  check(start !== -1, 'handleOpenTabRoute source exists');
  check(
    body.includes("chrome.tabs.create({ url: params.url || 'about:blank', active: params.active === true })"),
    'open_tab still defaults to background and focuses only on explicit active:true',
  );
  check(!body.includes('sealHoldLease') && !body.includes('restoreHoldLease')
    && !body.includes('releaseDelegation'),
  'open_tab route does not perform delegation lease transitions');
}

async function run() {
  await test1_defaultBackground();
  await test2_explicitActiveTrue();
  await test3_explicitActiveFalse();
  await test4_bindTabPreserved();
  await test5_ownershipTokenSurfaced();
  await test6_delegationLeavesBackgroundDefaultUntouched();

  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  failed++;
  console.error('  FAIL: uncaught error:', err && err.stack ? err.stack : err);
  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(1);
});
