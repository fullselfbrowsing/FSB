'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SIDE_PANEL_PATH = path.resolve(__dirname, '../extension/ui/sidepanel.js');
const BACKGROUND_PATH = path.resolve(__dirname, '../extension/background.js');
const AGENT_LOOP_PATH = path.resolve(__dirname, '../extension/ai/agent-loop.js');
const MCP_BRIDGE_PATH = path.resolve(__dirname, '../extension/ws/mcp-bridge-client.js');
const REGISTRY_PATH = require.resolve('../extension/utils/agent-registry.js');

const sidepanelSource = fs.readFileSync(SIDE_PANEL_PATH, 'utf8');
const backgroundSource = fs.readFileSync(BACKGROUND_PATH, 'utf8');
const agentLoopSource = fs.readFileSync(AGENT_LOOP_PATH, 'utf8');
const mcpBridgeSource = fs.readFileSync(MCP_BRIDGE_PATH, 'utf8');

function extractNamedFunction(source, name) {
  const asyncStart = source.indexOf('async function ' + name + '(');
  const start = asyncStart >= 0 ? asyncStart : source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Function not found: ' + name);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index++) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error('Unbalanced function: ' + name);
}

function extractAfterAnchor(source, anchor) {
  const start = source.indexOf(anchor);
  if (start < 0) throw new Error('Anchor not found: ' + anchor);
  const brace = source.indexOf('{', start);
  let depth = 1;
  for (let index = brace + 1; index < source.length; index++) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(brace + 1, index);
    }
  }
  throw new Error('Unbalanced anchor: ' + anchor);
}

function makeClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    contains(name) { return values.has(name); }
  };
}

async function testExactUnownedRefresh() {
  const OwnerChip = require('../extension/ui/owner-chip.js');
  let queryCalls = 0;
  const lockCalls = [];
  const context = {
    MY_SURFACE: 'legacy:sidepanel',
    FSBOwnerChip: OwnerChip,
    statusText: { textContent: 'Ready' },
    statusDot: { classList: makeClassList() },
    chatInput: { title: '', removeAttribute() {} },
    _headerBaseStatusLabel: 'Ready',
    _headerBaseStatusTone: '',
    _ownerStatusRefreshGeneration: 0,
    _activeTabSurfaceSyncGeneration: 1,
    _chatLockedByOwnerChip: true,
    chrome: {
      tabs: {
        async get(tabId) { return { id: tabId, windowId: 1, active: true }; },
        async query() { queryCalls += 1; return [{ id: 10, windowId: 1, active: true }]; }
      },
      storage: {
        session: {
          async get() {
            return {
              fsbAgentRegistry: { v: 1, records: { agent_a: { tabIds: [10] } } }
            };
          }
        }
      }
    },
    applyInputLockout(value) { lockCalls.push(value); },
    updateSendButtonState() {},
    console: { warn() {} }
  };
  vm.createContext(context);
  vm.runInContext(extractNamedFunction(sidepanelSource, 'refreshActiveTabOwnership'), context);

  const result = await context.refreshActiveTabOwnership(20, 1);
  assert.strictEqual(result.verified, true);
  assert.strictEqual(result.tabId, 20);
  assert.strictEqual(result.foreignOwned, false);
  assert.strictEqual(queryCalls, 0, 'exact activation tab bypasses a stale active-tab query');
  assert.strictEqual(context.statusText.textContent, 'Ready');
  assert.strictEqual(context._chatLockedByOwnerChip, false);
  assert.strictEqual(lockCalls.at(-1), false, 'verified unowned tab unlocks the composer');
}

async function testOwnershipReadFailureIsFailSafe() {
  const OwnerChip = require('../extension/ui/owner-chip.js');
  const lockCalls = [];
  const warnings = [];
  const context = {
    MY_SURFACE: 'legacy:sidepanel',
    FSBOwnerChip: OwnerChip,
    statusText: { textContent: 'Working' },
    statusDot: { classList: makeClassList() },
    chatInput: { title: 'Disabled while automation is working on this tab', removeAttribute() {} },
    _headerBaseStatusLabel: 'Working',
    _headerBaseStatusTone: 'running',
    _ownerStatusRefreshGeneration: 0,
    _activeTabSurfaceSyncGeneration: 1,
    _chatLockedByOwnerChip: true,
    chrome: {
      tabs: { async get(tabId) { return { id: tabId, windowId: 1, active: true }; } },
      storage: { session: { async get() { throw new Error('storage unavailable'); } } }
    },
    applyInputLockout(value) { lockCalls.push(value); },
    updateSendButtonState() {},
    console: { warn(...args) { warnings.push(args); } }
  };
  vm.createContext(context);
  vm.runInContext(extractNamedFunction(sidepanelSource, 'refreshActiveTabOwnership'), context);

  const result = await context.refreshActiveTabOwnership(20, 1);
  assert.strictEqual(result.verified, false);
  assert.strictEqual(context.statusText.textContent, 'Working');
  assert.strictEqual(context._chatLockedByOwnerChip, true);
  assert.deepStrictEqual(lockCalls, [], 'failed storage read is not proof that the tab is unowned');
  assert.strictEqual(warnings.length, 1, 'ownership read failure emits a diagnostic');
}

async function testUnifiedSyncAndRace() {
  const calls = { query: 0, owner: [], swap: [], status: [], idle: [], running: [], hydrate: 0 };
  const context = {
    _activeTabSurfaceSyncGeneration: 0,
    _delegationHydrationGeneration: 0,
    _activeTabIdSnapshot: 10,
    _chatLockedByOwnerChip: true,
    conversationId: 'conv_10',
    chatMessages: { innerHTML: 'old' },
    chrome: {
      tabs: { async query() { calls.query += 1; return [{ id: 10 }]; } },
      runtime: {
        async sendMessage(request) {
          calls.status.push(request.activeTabId);
          return { activeSessions: 0, currentSessionId: null, currentStartTime: null };
        }
      }
    },
    _persistTabStatusIntent() {},
    async refreshActiveTabOwnership(tabId) {
      calls.owner.push(tabId);
      return { verified: true, tabId, ownerAgentId: null, foreignOwned: false };
    },
    async swapToTabConversation(tabId) { calls.swap.push(tabId); return true; },
    _getTabRunningEntry() { return { isRunning: false, sessionId: null }; },
    setRunningState(tabId) { calls.running.push(tabId); },
    setIdleState(tabId) { calls.idle.push(tabId); },
    _restoreTabStatusIntent() {},
    async _hydrateDelegationForSelectedConversation() { calls.hydrate += 1; },
    applyInputLockout() {},
    console: { warn() {} }
  };
  vm.createContext(context);
  vm.runInContext(extractNamedFunction(sidepanelSource, 'syncActiveTabSurface'), context);

  assert.strictEqual(await context.syncActiveTabSurface(20, 1), true);
  assert.strictEqual(calls.query, 0, 'explicit activation never re-queries the old active tab');
  assert.deepStrictEqual(calls.owner, [20]);
  assert.deepStrictEqual(calls.swap, [20]);
  assert.deepStrictEqual(calls.status, [20], 'live running state is resolved for the exact synchronized tab');
  assert.deepStrictEqual(calls.idle, [20]);
  assert.strictEqual(context._activeTabIdSnapshot, 20);
  assert.strictEqual(calls.hydrate, 1);

  let resolveOld;
  calls.swap.length = 0;
  context.refreshActiveTabOwnership = async (tabId) => {
    if (tabId === 30) return new Promise((resolve) => { resolveOld = resolve; });
    return { verified: true, tabId, ownerAgentId: null, foreignOwned: false };
  };
  const oldSync = context.syncActiveTabSurface(30, 1);
  await new Promise((resolve) => setImmediate(resolve));
  const newSync = context.syncActiveTabSurface(40, 1);
  assert.strictEqual(await newSync, true);
  resolveOld({ verified: true, tabId: 30, ownerAgentId: 'agent_old', foreignOwned: true });
  assert.strictEqual(await oldSync, false);
  assert.strictEqual(context._activeTabIdSnapshot, 40);
  assert.deepStrictEqual(calls.swap, [40], 'older async ownership result cannot swap or relock the newer tab');
}

async function testVisibilityRecovery() {
  const body = extractAfterAnchor(sidepanelSource, "document.addEventListener('visibilitychange', async () => {");
  let syncCalls = 0;
  const run = new Function('document', 'syncActiveTabSurface', 'return (async function() {' + body + '})();');
  await run({ hidden: false }, async () => { syncCalls += 1; });
  await run({ hidden: true }, async () => { syncCalls += 1; });
  assert.strictEqual(syncCalls, 1, 'only visible restoration triggers active-tab synchronization');
}

function createStorageArea() {
  const store = {};
  return {
    async get(key) {
      if (typeof key === 'string') return store[key] === undefined ? {} : { [key]: store[key] };
      return Object.assign({}, store);
    },
    async set(value) { Object.assign(store, value); },
    async remove(key) { delete store[key]; }
  };
}

async function testTakeControl() {
  const tabState = new Map([
    [20, { id: 20, windowId: 1, active: true }],
    [21, { id: 21, windowId: 1, active: false }],
    [30, { id: 30, windowId: 1, active: true }],
    [40, { id: 40, windowId: 1, active: true }]
  ]);
  const chromeMock = {
    runtime: {
      id: 'ownership-leakage-test',
      getURL: (value) => 'chrome-extension://ownership-leakage-test/' + value
    },
    storage: {
      session: createStorageArea(),
      local: createStorageArea(),
      onChanged: { addListener() {} }
    },
    tabs: {
      async get(tabId) {
        const tab = tabState.get(tabId);
        if (!tab) throw new Error('missing tab');
        return Object.assign({ incognito: false }, tab);
      }
    }
  };
  globalThis.chrome = chromeMock;
  delete require.cache[REGISTRY_PATH];
  const { AgentRegistry } = require(REGISTRY_PATH);
  const registry = new AgentRegistry();
  registry.setCap(8);
  const A = (await registry.registerAgent()).agentId;
  const firstBinding = await registry.bindTab(A, 20);
  await registry.bindTab(A, 21);

  const events = [];
  const context = {
    chrome: chromeMock,
    fsbAgentRegistryInstance: registry,
    activeSessions: new Map(),
    handleStopAutomation(_request, _sender, respond) { events.push('stop'); respond({ success: true }); },
    console: { warn() {} }
  };
  vm.createContext(context);
  ['fsbTakeTabControlHasExactRequest', 'fsbTakeTabControlSenderTrusted', 'fsbTakeTabControlContextMatches', 'fsbStopLocalAutomationForTakeControl', 'handleTakeTabControl']
    .forEach((name) => vm.runInContext(extractNamedFunction(backgroundSource, name), context));

  const trustedSender = {
    id: chromeMock.runtime.id,
    url: chromeMock.runtime.getURL('ui/sidepanel.html')
  };

  const untrusted = await context.handleTakeTabControl({
    action: 'takeTabControl', tabId: 20, windowId: 1, expectedOwnerAgentId: A
  }, { id: chromeMock.runtime.id, url: chromeMock.runtime.getURL('content/messaging.js'), tab: { id: 20 } });
  assert.strictEqual(untrusted.code, 'stale_context');
  assert.strictEqual(registry.getOwner(20), A, 'content-script callers cannot release ownership');

  const released = await context.handleTakeTabControl({
    action: 'takeTabControl', tabId: 20, windowId: 1, expectedOwnerAgentId: A
  }, trustedSender);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(released)),
    { success: true, code: 'released', released: true });
  assert.strictEqual(registry.getOwner(20), null);
  assert.strictEqual(registry.getOwner(21), A, 'takeover releases only the active tab');
  assert.strictEqual(registry.isOwnedBy(20, A, firstBinding.ownershipToken), false,
    'the released tab rejects its old ownership token');

  const B = (await registry.registerAgent()).agentId;
  await registry.bindTab(B, 30);
  const stale = await context.handleTakeTabControl({
    action: 'takeTabControl', tabId: 30, windowId: 2, expectedOwnerAgentId: B
  }, trustedSender);
  assert.strictEqual(stale.code, 'stale_context');
  assert.strictEqual(registry.getOwner(30), B, 'stale window request makes no ownership change');

  const originalMappings = registry.listDelegationMappings.bind(registry);
  registry.listDelegationMappings = () => [{ delegationId: 'Delegation_test_12345678', agentId: B }];
  const protectedResult = await context.handleTakeTabControl({
    action: 'takeTabControl', tabId: 30, windowId: 1, expectedOwnerAgentId: B
  }, trustedSender);
  assert.strictEqual(protectedResult.code, 'protected_delegation');
  assert.strictEqual(registry.getOwner(30), B);
  registry.listDelegationMappings = originalMappings;

  const C = (await registry.registerAgent()).agentId;
  const lastBinding = await registry.bindTab(C, 40);
  context.activeSessions.set('session_local', { agentId: C, tabId: 40, status: 'running' });
  context.handleStopAutomation = (_request, _sender, respond) => {
    events.push('stop');
    context.activeSessions.delete('session_local');
    respond({ success: true });
  };
  const originalRelease = registry.releaseTab.bind(registry);
  registry.releaseTab = async (tabId) => {
    events.push('release');
    return originalRelease(tabId);
  };
  const localResult = await context.handleTakeTabControl({
    action: 'takeTabControl', tabId: 40, windowId: 1, expectedOwnerAgentId: C
  }, trustedSender);
  assert.strictEqual(localResult.success, true);
  assert.deepStrictEqual(events.slice(-2), ['stop', 'release'],
    'local automation settles through the stop lifecycle before ownership release');
  assert.strictEqual(registry.hasAgent(C), false, 'releasing the last unprotected tab removes the agent record');
  assert.strictEqual(registry.isOwnedBy(40, C, lastBinding.ownershipToken), false,
    'the last released tab rejects its old ownership token');

  delete globalThis.chrome;
}

function testActionWiring() {
  assert(backgroundSource.includes("importScripts('utils/agent-tab-spawn-provenance.js')"));
  assert(mcpBridgeSource.includes('provenance.run({ agentId, openerTabId: tabId }, rawExecuteFn)'));
  assert(agentLoopSource.includes('spawnProvenance.begin({'));
  assert(agentLoopSource.includes('openTabRegistry.bindTab(openTabAgentId, newTabId)'));
  assert(backgroundSource.includes('sessionData.agentId = resolvedAgentId'));
  assert(sidepanelSource.includes("action: 'getStatus',\n          activeTabId: incomingTabId"));
}

(async () => {
  await testExactUnownedRefresh();
  await testOwnershipReadFailureIsFailSafe();
  await testUnifiedSyncAndRace();
  await testVisibilityRecovery();
  await testTakeControl();
  testActionWiring();
  console.log('PASS ownership leakage regression');
})().catch((error) => {
  console.error('FAIL ownership leakage regression:', error && error.stack ? error.stack : error);
  process.exit(1);
});
