'use strict';

/**
 * Regression coverage for search_capabilities agent-scoped origin resolution.
 *
 * Run: node tests/capability-search-agent-scope.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

function assertMcpSourceUsesAgentScopedSearch() {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'mcp', 'src', 'tools', 'capabilities.ts'), 'utf8');
  const start = src.indexOf("'search_capabilities'");
  const end = src.indexOf('// invoke_capability', start);
  assert(start >= 0 && end > start, 'search_capabilities source block found');
  const block = src.slice(start, end);

  assert(block.includes('sendAgentScopedBridgeMessage('), 'search_capabilities uses sendAgentScopedBridgeMessage');
  assert(block.includes("'mcp:capabilities-search'"), 'search_capabilities sends mcp:capabilities-search');
  assert(block.includes('tab_id: z.coerce.number()'), 'search_capabilities exposes optional tab_id');
  assert(block.includes('targetTabId'), 'search_capabilities forwards targetTabId for ownership token lookup');
}

function installCapabilitySearchStub() {
  const calls = [];
  globalThis.FsbCapabilitySearch = {
    search(query, origin, topN) {
      calls.push({ query, origin, topN });
      return [{ slug: 'test.capability', service: origin || 'unbiased' }];
    },
  };
  return calls;
}

function installChromeStub() {
  const calls = { get: [], query: [] };
  globalThis.chrome = {
    tabs: {
      async get(tabId) {
        calls.get.push(tabId);
        if (tabId === 42) return { id: 42, url: 'https://github.com/notifications' };
        if (tabId === 77) return { id: 77, url: 'https://slack.com/client/T/C' };
        throw new Error('unknown tab ' + tabId);
      },
      async query(query) {
        calls.query.push(query);
        return [{ id: 77, url: 'https://slack.com/client/T/C' }];
      },
    },
  };
  return calls;
}

function buildClient(activeUrl) {
  const calls = { active: 0 };
  return {
    calls,
    async _getActiveTab() {
      calls.active += 1;
      return { id: 77, url: activeUrl || 'https://slack.com/client/T/C' };
    },
  };
}

async function run() {
  console.log('\n--- capability search agent-scope regression ---');
  assertMcpSourceUsesAgentScopedSearch();

  const priorSearch = globalThis.FsbCapabilitySearch;
  const priorChrome = globalThis.chrome;
  const priorResolver = globalThis.resolveAgentTabOrError;

  try {
    const dispatcher = require(path.join(REPO_ROOT, 'extension', 'ws', 'mcp-tool-dispatcher.js'));
    assert.strictEqual(dispatcher.hasMcpMessageRoute('mcp:capabilities-search'), true, 'capabilities-search message route exists');

    let searchCalls = installCapabilitySearchStub();
    let chromeCalls = installChromeStub();
    const resolverCalls = [];
    globalThis.resolveAgentTabOrError = async function resolveAgentTabOrError(agentId, payload) {
      resolverCalls.push({ agentId, payload });
      return { success: true, tabId: 42, agentId };
    };

    const scoped = await dispatcher.dispatchMcpMessageRoute({
      type: 'mcp:capabilities-search',
      payload: { query: 'notifications', agentId: 'agent-a', tab_id: 42, origin: 'https://github.com', topN: 3 },
      client: buildClient('https://slack.com/client/T/C'),
    });
    assert.strictEqual(scoped.success, true, 'agent-scoped search succeeds');
    assert.strictEqual(resolverCalls.length, 1, 'agent-scoped search calls resolveAgentTabOrError');
    assert.strictEqual(resolverCalls[0].payload.tab_id, 42, 'agent-scoped search forwards tab_id to resolver');
    assert.deepStrictEqual(chromeCalls.query, [], 'agent-scoped search does not query active Chrome tab');
    assert.strictEqual(searchCalls.length, 1, 'agent-scoped search calls capability search once');
    assert.strictEqual(searchCalls[0].origin, 'https://github.com', 'agent-scoped search uses resolved tab origin');
    assert.strictEqual(searchCalls[0].topN, 3, 'agent-scoped search preserves topN');

    const beforeMismatchSearches = searchCalls.length;
    const mismatch = await dispatcher.dispatchMcpMessageRoute({
      type: 'mcp:capabilities-search',
      payload: { query: 'notifications', agentId: 'agent-a', tab_id: 42, origin: 'https://evil.example', topN: 3 },
      client: buildClient('https://slack.com/client/T/C'),
    });
    assert.strictEqual(mismatch.success, false, 'origin mismatch rejects');
    assert.strictEqual(mismatch.errorCode, 'RECIPE_CONSENT_REQUIRED', 'origin mismatch returns RECIPE_CONSENT_REQUIRED');
    assert.strictEqual(searchCalls.length, beforeMismatchSearches, 'origin mismatch fails before FsbCapabilitySearch.search');

    searchCalls = installCapabilitySearchStub();
    chromeCalls = installChromeStub();
    const legacyClient = buildClient('https://slack.com/client/T/C');
    const legacy = await dispatcher.dispatchMcpMessageRoute({
      type: 'mcp:capabilities-search',
      payload: { query: 'channels', topN: 2 },
      client: legacyClient,
    });
    assert.strictEqual(legacy.success, true, 'legacy search succeeds');
    assert.strictEqual(legacyClient.calls.active, 1, 'legacy search uses client active tab when no origin supplied');
    assert.strictEqual(chromeCalls.query.length, 0, 'legacy client active-tab helper avoids chrome.tabs.query fallback');
    assert.strictEqual(searchCalls[0].origin, 'https://slack.com', 'legacy search uses active tab origin');

    searchCalls = installCapabilitySearchStub();
    const legacyOverrideClient = buildClient('https://slack.com/client/T/C');
    const legacyOverride = await dispatcher.dispatchMcpMessageRoute({
      type: 'mcp:capabilities-search',
      payload: { query: 'issues', origin: 'https://github.com' },
      client: legacyOverrideClient,
    });
    assert.strictEqual(legacyOverride.success, true, 'legacy origin override search succeeds');
    assert.strictEqual(legacyOverrideClient.calls.active, 0, 'legacy origin override does not need active tab lookup');
    assert.strictEqual(searchCalls[0].origin, 'https://github.com', 'legacy origin override remains accepted');
  } finally {
    if (priorSearch === undefined) delete globalThis.FsbCapabilitySearch; else globalThis.FsbCapabilitySearch = priorSearch;
    if (priorChrome === undefined) delete globalThis.chrome; else globalThis.chrome = priorChrome;
    if (priorResolver === undefined) delete globalThis.resolveAgentTabOrError; else globalThis.resolveAgentTabOrError = priorResolver;
  }

  console.log('capability search agent-scope: PASS');
}

run().catch((err) => {
  console.error('capability search agent-scope: FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
