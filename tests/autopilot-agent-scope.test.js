'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

require('../extension/utils/agent-tab-resolver.js');
const dispatcherPath = require.resolve('../extension/ws/mcp-tool-dispatcher.js');
delete require.cache[dispatcherPath];
const { dispatchMcpMessageRoute } = require(dispatcherPath);

function installHarness() {
  const previous = {
    chrome: globalThis.chrome,
    registry: globalThis.fsbAgentRegistryInstance,
    sessions: globalThis.activeSessions,
    start: globalThis.handleStartAutomation,
    stop: globalThis.handleStopAutomation
  };
  const tabOwners = new Map([[2, 'agent_a'], [3, 'agent_b'], [4, 'agent_c']]);
  const knownAgents = new Set(['agent_a', 'agent_b', 'agent_c']);
  const tabs = new Map([
    [2, { id: 2, url: 'https://example.com/a', windowId: 1 }],
    [3, { id: 3, url: 'https://example.com/b', windowId: 1 }],
    [4, { id: 4, url: 'https://example.com/c', windowId: 1 }]
  ]);
  const calls = { get: [], active: 0, starts: [], stops: [] };

  globalThis.fsbAgentRegistryInstance = {
    hasAgent(agentId) { return knownAgents.has(agentId); },
    getAgentTabs(agentId) {
      if (!knownAgents.has(agentId)) return null;
      return Array.from(tabOwners.entries())
        .filter((entry) => entry[1] === agentId)
        .map((entry) => entry[0]);
    },
    getOwner(tabId) { return tabOwners.get(tabId) || null; },
    getSelectedTabId() { return null; }
  };
  globalThis.chrome = {
    tabs: {
      async get(tabId) {
        calls.get.push(tabId);
        if (!tabs.has(tabId)) throw new Error('missing tab');
        return { ...tabs.get(tabId) };
      },
      async query() { throw new Error('unexpected active-tab query'); }
    }
  };
  globalThis.activeSessions = new Map([
    ['session_a', { agentId: 'agent_a', tabId: 2, task: 'A task', startTime: 10, iterationCount: 2, maxIterations: 8, actionHistory: [1] }],
    ['session_b', { agentId: 'agent_b', tabId: 3, task: 'B task', startTime: 20, iterationCount: 4, maxIterations: 9, actionHistory: [1, 2] }]
  ]);
  globalThis.handleStartAutomation = (request, sender, respond) => {
    calls.starts.push({ request, sender });
    respond({ success: true, sessionId: 'new_session' });
  };
  globalThis.handleStopAutomation = (request, sender, respond) => {
    calls.stops.push({ request, sender });
    respond({ success: true, stopped: true });
  };

  return {
    calls,
    client: {
      async _getActiveTab() {
        calls.active++;
        return tabs.get(3);
      }
    },
    restore() {
      const restoreValue = (key, value) => {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      };
      restoreValue('chrome', previous.chrome);
      restoreValue('fsbAgentRegistryInstance', previous.registry);
      restoreValue('activeSessions', previous.sessions);
      restoreValue('handleStartAutomation', previous.start);
      restoreValue('handleStopAutomation', previous.stop);
    }
  };
}

async function testStartUsesOwnedTab() {
  const harness = installHarness();
  try {
    const result = await dispatchMcpMessageRoute({
      type: 'mcp:start-automation',
      payload: { agentId: 'agent_a', ownershipToken: 'token-a', task: 'summarize mail' },
      client: harness.client
    });
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(harness.calls.get, [2]);
    assert.strictEqual(harness.calls.active, 0, 'the user-active tab is never consulted');
    assert.strictEqual(harness.calls.starts.length, 1);
    assert.strictEqual(harness.calls.starts[0].request.tabId, 2);
    assert.strictEqual(harness.calls.starts[0].request.agentId, 'agent_a');
    assert.strictEqual(harness.calls.starts[0].request.ownershipToken, 'token-a');
    assert.strictEqual(harness.calls.starts[0].sender.tab.id, 2);
  } finally {
    harness.restore();
  }
}

async function testStatusIsAgentScoped() {
  const harness = installHarness();
  try {
    const result = await dispatchMcpMessageRoute({
      type: 'mcp:get-status',
      payload: { agentId: 'agent_b' },
      client: harness.client
    });
    assert.strictEqual(result.activeSessions, 1);
    assert.deepStrictEqual(result.sessionIds, ['session_b']);
    assert.strictEqual(result.currentSessionId, 'session_b');
    assert.strictEqual(result.currentTask, 'B task');

    const idle = await dispatchMcpMessageRoute({
      type: 'mcp:get-status',
      payload: { agentId: 'agent_c' },
      client: harness.client
    });
    assert.strictEqual(idle.activeSessions, 0);
    assert.deepStrictEqual(idle.sessionIds, []);

    const unknown = await dispatchMcpMessageRoute({
      type: 'mcp:get-status',
      payload: { agentId: 'agent_unknown' },
      client: harness.client
    });
    assert.strictEqual(unknown.success, false);
    assert.strictEqual(unknown.code, 'AGENT_NOT_REGISTERED');
  } finally {
    harness.restore();
  }
}

async function testStopCannotCrossAgentBoundary() {
  const harness = installHarness();
  try {
    const result = await dispatchMcpMessageRoute({
      type: 'mcp:stop-automation',
      payload: { agentId: 'agent_a' },
      client: harness.client
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(harness.calls.stops.length, 1);
    assert.strictEqual(harness.calls.stops[0].request.sessionId, 'session_a');
    assert.strictEqual(harness.calls.stops[0].sender.tab.id, 2);
    assert.strictEqual(harness.calls.active, 0, 'stop targets the session tab, not the active tab');

    const denied = await dispatchMcpMessageRoute({
      type: 'mcp:stop-automation',
      payload: { agentId: 'agent_a', sessionId: 'session_b' },
      client: harness.client
    });
    assert.strictEqual(denied.success, false);
    assert.strictEqual(denied.code, 'TAB_NOT_OWNED');
    assert.strictEqual(harness.calls.stops.length, 1, 'cross-agent stop has no side effect');
  } finally {
    harness.restore();
  }
}

function testBridgeForwardsStatusIdentity() {
  const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'),
    'utf8'
  );
  assert.match(source, /case 'mcp:get-status':\s*return this\._handleGetStatus\(payload\);/);
  assert.match(source, /async _handleGetStatus\(payload = \{\}\)[\s\S]*?type: 'mcp:get-status',\s*payload,/);
}

(async () => {
  await testStartUsesOwnedTab();
  await testStatusIsAgentScoped();
  await testStopCannotCrossAgentBoundary();
  testBridgeForwardsStatusIdentity();
  console.log('autopilot-agent-scope.test.js: PASS');
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
