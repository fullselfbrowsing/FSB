'use strict';

const assert = require('assert');

const dispatcherPath = require.resolve('../extension/ws/mcp-tool-dispatcher.js');
delete require.cache[dispatcherPath];
const { dispatchMcpToolRoute } = require(dispatcherPath);

function installHarness({ agents, tabs, activeTabId, staleTabIds }) {
  const previousChrome = globalThis.chrome;
  const previousRegistry = globalThis.fsbAgentRegistryInstance;
  const knownAgents = new Map(Object.entries(agents || {}));
  const tabMap = new Map((tabs || []).map((tab) => [tab.id, { ...tab }]));
  const stale = new Set(staleTabIds || []);
  const calls = { get: [], query: [] };

  globalThis.fsbAgentRegistryInstance = {
    hasAgent(agentId) {
      return knownAgents.has(agentId);
    },
    getAgentTabs(agentId) {
      const ids = knownAgents.get(agentId);
      return ids ? ids.slice() : (knownAgents.has(agentId) ? [] : null);
    }
  };
  globalThis.chrome = {
    tabs: {
      async get(tabId) {
        calls.get.push(tabId);
        if (stale.has(tabId) || !tabMap.has(tabId)) throw new Error('No tab with id ' + tabId);
        return { ...tabMap.get(tabId) };
      },
      async query(queryInfo) {
        calls.query.push({ ...queryInfo });
        if (queryInfo && queryInfo.active === true && queryInfo.currentWindow === true) {
          const active = tabMap.get(activeTabId);
          return active ? [{ ...active }] : [];
        }
        throw new Error('list_tabs must not enumerate browser tabs');
      }
    }
  };

  return {
    calls,
    restore() {
      if (previousChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = previousChrome;
      if (previousRegistry === undefined) delete globalThis.fsbAgentRegistryInstance;
      else globalThis.fsbAgentRegistryInstance = previousRegistry;
    }
  };
}

async function listTabs(agentId, extra = {}) {
  return dispatchMcpToolRoute({
    tool: 'list_tabs',
    params: { agentId, ...extra },
    payload: { agentId, ...extra }
  });
}

async function testOwnedOnlyEnumeration() {
  const harness = installHarness({
    agents: { agent_a: [2, 4], agent_b: [3] },
    tabs: [
      { id: 1, title: 'User Gmail', url: 'https://mail.google.com/mail/u/0/', windowId: 10, active: false },
      { id: 2, title: 'Agent page', url: 'https://example.com/a', windowId: 10, active: false },
      { id: 3, title: 'Other agent', url: 'https://example.com/b', windowId: 10, active: true },
      { id: 4, title: 'Agent docs', url: 'https://example.com/docs', windowId: 11, active: false }
    ],
    activeTabId: 3
  });
  try {
    const result = await listTabs('agent_a');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.tabs.map((tab) => tab.id), [2, 4]);
    assert.strictEqual(result.activeTabId, null, 'foreign active tab is never exposed');
    assert.strictEqual(result.totalTabs, 2);
    assert.deepStrictEqual(harness.calls.get, [2, 4], 'only owned ids are fetched');
    assert.deepStrictEqual(harness.calls.query, [{ active: true, currentWindow: true }], 'no broad tab query occurs');
  } finally {
    harness.restore();
  }
}

async function testFreshAgentAndStaleCleanupRace() {
  let harness = installHarness({
    agents: { agent_fresh: [] },
    tabs: [{ id: 9, title: 'User tab', url: 'https://mail.google.com/', windowId: 1, active: true }],
    activeTabId: 9
  });
  try {
    const result = await listTabs('agent_fresh');
    assert.deepStrictEqual(result.tabs, []);
    assert.strictEqual(result.activeTabId, null);
    assert.strictEqual(result.totalTabs, 0);
    assert.deepStrictEqual(harness.calls.get, []);
  } finally {
    harness.restore();
  }

  harness = installHarness({
    agents: { agent_a: [2, 5] },
    tabs: [{ id: 2, title: 'Live', url: 'https://example.com/', windowId: 1, active: true }],
    activeTabId: 2,
    staleTabIds: [5]
  });
  try {
    const result = await listTabs('agent_a');
    assert.deepStrictEqual(result.tabs.map((tab) => tab.id), [2], 'a concurrently closed owned tab is omitted');
    assert.strictEqual(result.activeTabId, 2);
  } finally {
    harness.restore();
  }
}

async function testCurrentWindowFiltering() {
  const harness = installHarness({
    agents: { agent_a: [2, 4] },
    tabs: [
      { id: 2, title: 'Window one', url: 'https://example.com/one', windowId: 10, active: false },
      { id: 4, title: 'Window two', url: 'https://example.com/two', windowId: 11, active: true }
    ],
    activeTabId: 4
  });
  try {
    const result = await listTabs('agent_a', { currentWindowOnly: true });
    assert.deepStrictEqual(result.tabs.map((tab) => tab.id), [4]);
    assert.strictEqual(result.activeTabId, 4);
  } finally {
    harness.restore();
  }
}

async function testFailsClosedWithoutAuthority() {
  const previousChrome = globalThis.chrome;
  const previousRegistry = globalThis.fsbAgentRegistryInstance;
  globalThis.chrome = { tabs: { query: async () => [], get: async () => null } };
  delete globalThis.fsbAgentRegistryInstance;
  try {
    const unavailable = await listTabs('agent_a');
    assert.strictEqual(unavailable.success, false);
    assert.strictEqual(unavailable.code, 'AGENT_REGISTRY_UNAVAILABLE');
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
    if (previousRegistry === undefined) delete globalThis.fsbAgentRegistryInstance;
    else globalThis.fsbAgentRegistryInstance = previousRegistry;
  }

  const harness = installHarness({ agents: { agent_a: [] }, tabs: [], activeTabId: null });
  try {
    const unknown = await listTabs('agent_unknown');
    assert.strictEqual(unknown.success, false);
    assert.strictEqual(unknown.code, 'AGENT_NOT_REGISTERED');
  } finally {
    harness.restore();
  }
}

(async () => {
  await testOwnedOnlyEnumeration();
  await testFreshAgentAndStaleCleanupRace();
  await testCurrentWindowFiltering();
  await testFailsClosedWithoutAuthority();
  console.log('list-tabs-agent-scope.test.js: PASS');
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
