'use strict';

/**
 * Phase 247/248 -- recovery tools can bootstrap from chrome://newtab/
 * without stealing foreground focus by default.
 *
 * Covers the real MCP bridge action path for zero-owned agents and the
 * production dispatcher ownership/adoption behavior for navigate/switch_tab.
 *
 * Run: node tests/recovery-tools-bootstrap.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

function loadBridgeHarness() {
  const dispatches = [];
  const wrappedChangeReports = [];
  const context = {
    console,
    Date,
    Math,
    EventTarget,
    CustomEvent,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    WebSocket: class FakeWebSocket {},
    chrome: {
      storage: { session: { set: async () => {}, get: async () => ({}) } },
      alarms: { create: async () => {}, clear: async () => {} },
      runtime: { onMessage: { addListener: () => {}, removeListener: () => {} } }
    },
    dispatchMcpMessageRoute: async () => ({ success: true }),
    dispatchMcpToolRoute: async (args) => {
      dispatches.push(args);
      return { success: true, tool: args.tool, params: args.params };
    },
    hasMcpToolRoute: () => true,
    getToolByNameOrVerb: (name) => ({ name, _route: 'background', _emitChangeReport: true }),
    wrapWithChangeReport: async (args) => {
      wrappedChangeReports.push(args);
      return args.execute();
    },
    globalThis: null
  };
  context.globalThis = context;

  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
  const footer = 'this.__bridgeTest = { MCPBridgeClient, mcpBridgeClient };';
  vm.runInNewContext(`${source}\n${footer}`, context, { filename: 'extension/ws/mcp-bridge-client.js' });
  return { context, dispatches, wrappedChangeReports, client: context.__bridgeTest.mcpBridgeClient };
}

function buildRegistryMock(opts = {}) {
  const knownAgents = new Set(opts.knownAgents || []);
  const owners = new Map(opts.owners || []);
  const metadata = new Map(opts.metadata || []);
  const bindCalls = [];
  const releaseCalls = [];
  return {
    hasAgent(agentId) {
      return knownAgents.has(agentId);
    },
    isOwnedBy(tabId, agentId, ownershipToken) {
      if (owners.get(tabId) !== agentId) return false;
      if (ownershipToken === undefined) return true;
      const meta = metadata.get(tabId);
      return !!meta && meta.ownershipToken === ownershipToken;
    },
    getOwner(tabId) {
      return owners.get(tabId) || null;
    },
    getTabMetadata(tabId) {
      return metadata.get(tabId) || null;
    },
    getAgentWindowId(agentId) {
      return opts.agentWindowIds && opts.agentWindowIds[agentId] ? opts.agentWindowIds[agentId] : null;
    },
    async bindTab(agentId, tabId) {
      bindCalls.push({ agentId, tabId });
      const existingOwner = owners.get(tabId);
      if (existingOwner && existingOwner !== agentId) return false;
      owners.set(tabId, agentId);
      const token = 'tok-' + agentId + '-' + tabId;
      metadata.set(tabId, { ownershipToken: token, incognito: false, windowId: 1, boundAt: Date.now() });
      return { agentId, tabId, ownershipToken: token };
    },
    async releaseTab(tabId) {
      releaseCalls.push(tabId);
      owners.delete(tabId);
      metadata.delete(tabId);
      return true;
    },
    _bindCalls: bindCalls,
    _releaseCalls: releaseCalls,
    _owners: owners
  };
}

function installChromeForDispatcher({ activeTab, tabs, nextTabId }) {
  const updateCalls = [];
  const createCalls = [];
  const removeCalls = [];
  const windowUpdateCalls = [];
  const tabsById = new Map((tabs || []).map(tab => [tab.id, { ...tab }]));
  if (activeTab) tabsById.set(activeTab.id, { ...activeTab });
  let nextCreatedTabId = Number.isFinite(nextTabId) ? nextTabId : 1000;
  global.chrome = {
    tabs: {
      async query(queryInfo) {
        if (queryInfo && queryInfo.active && queryInfo.currentWindow) {
          return activeTab ? [{ ...tabsById.get(activeTab.id), active: true }] : [];
        }
        return Array.from(tabsById.values()).map(tab => ({ ...tab }));
      },
      async create(createProperties) {
        const tab = {
          id: nextCreatedTabId++,
          url: createProperties && createProperties.url ? createProperties.url : 'about:blank',
          title: '',
          active: !!(createProperties && createProperties.active === true),
          windowId: createProperties && Number.isFinite(createProperties.windowId)
            ? createProperties.windowId
            : (activeTab && Number.isFinite(activeTab.windowId) ? activeTab.windowId : 1)
        };
        createCalls.push({ ...createProperties });
        if (tab.active) {
          tabsById.forEach((existing) => { existing.active = false; });
          if (activeTab) activeTab.active = false;
        }
        tabsById.set(tab.id, { ...tab });
        return { ...tab };
      },
      async get(tabId) {
        const tab = tabsById.get(tabId);
        if (!tab) throw new Error('No tab with id ' + tabId);
        return { ...tab };
      },
      async update(tabId, updates) {
        updateCalls.push({ tabId, updates: { ...updates } });
        const tab = tabsById.get(tabId);
        if (!tab) throw new Error('No tab with id ' + tabId);
        Object.assign(tab, updates);
        if (updates.url) tab.url = updates.url;
        if (updates.active === true) {
          tabsById.forEach((existing) => { existing.active = false; });
          tab.active = true;
          if (activeTab) activeTab.active = activeTab.id === tabId;
        }
        return { ...tab };
      },
      async remove(tabId) {
        removeCalls.push(tabId);
        const ids = Array.isArray(tabId) ? tabId : [tabId];
        for (const id of ids) {
          tabsById.delete(id);
        }
      }
    },
    windows: {
      update: async (windowId, updates) => {
        windowUpdateCalls.push({ windowId, updates: { ...updates } });
        return {};
      }
    },
    storage: {
      local: { get: (_key, cb) => cb({}) },
      onChanged: { addListener: () => {} }
    }
  };
  return { updateCalls, createCalls, removeCalls, windowUpdateCalls };
}

async function testBridgeOpenTabBypassesResolver() {
  console.log('\n--- bridge open_tab bypasses zero-owned resolver ---');
  const h = loadBridgeHarness();
  h.context.resolveAgentTabOrError = async () => {
    throw new Error('open_tab must not call resolver');
  };
  const result = await h.client._handleExecuteAction({
    tool: 'open_tab',
    params: { url: 'https://example.com' },
    agentId: 'agent_a'
  });
  check(result && result.success === true, 'open_tab dispatch succeeded');
  check(h.dispatches.length === 1, 'dispatchMcpToolRoute called once');
  check(h.dispatches[0].tool === 'open_tab', 'dispatched tool open_tab');
  check(!Object.prototype.hasOwnProperty.call(h.dispatches[0].params, 'tabId'), 'open_tab params do not invent tabId');
  check(h.dispatches[0].params.agentId === 'agent_a', 'agentId threaded');
}

async function testBridgeNavigateZeroOwnedFallback() {
  console.log('\n--- bridge navigate falls back only on NO_OWNED_TAB ---');
  const h = loadBridgeHarness();
  h.context.resolveAgentTabOrError = async () => ({ success: false, code: 'NO_OWNED_TAB', agentId: 'agent_a' });
  const result = await h.client._handleExecuteAction({
    tool: 'navigate',
    params: { url: 'https://example.com' },
    agentId: 'agent_a'
  });
  check(result && result.success === true, 'navigate fallback dispatch succeeded');
  check(h.dispatches.length === 1, 'navigate dispatched once');
  check(!Object.prototype.hasOwnProperty.call(h.dispatches[0].params, 'tabId'), 'navigate fallback does not invent tabId');

  const h2 = loadBridgeHarness();
  h2.context.resolveAgentTabOrError = async () => ({ success: false, code: 'NO_OWNED_TAB', agentId: 'agent_a' });
  const click = await h2.client._handleExecuteAction({
    tool: 'click',
    params: { selector: '#x' },
    agentId: 'agent_a'
  });
  check(click && click.code === 'NO_OWNED_TAB', 'non-bootstrap click still returns NO_OWNED_TAB');
  check(h2.dispatches.length === 0, 'non-bootstrap click did not dispatch');
}

async function testBridgeSwitchTabBypassesResolver() {
  console.log('\n--- bridge switch_tab bypasses resolver and keeps target tabId ---');
  const h = loadBridgeHarness();
  h.context.resolveAgentTabOrError = async () => {
    throw new Error('switch_tab must not call resolver');
  };
  const result = await h.client._handleExecuteAction({
    tool: 'switch_tab',
    params: { tabId: 42 },
    agentId: 'agent_a'
  });
  check(result && result.success === true, 'switch_tab dispatch succeeded');
  check(h.dispatches[0].params.tabId === 42, 'switch_tab forwards required tabId');
}

async function testBridgeCloseTabUsesDispatcherSyntheticChangeReport() {
  console.log('\n--- bridge close_tab resolves target but skips DOM change wrapper ---');
  const h = loadBridgeHarness();
  h.context.resolveAgentTabOrError = async () => ({ tabId: 42, ownershipToken: 'tok-agent_a-42', skipGate: false });
  const result = await h.client._handleExecuteAction({
    tool: 'close_tab',
    params: { tab_id: 42 },
    agentId: 'agent_a',
    ownershipToken: 'tok-agent_a-42'
  });
  check(result && result.success === true, 'close_tab dispatch succeeded');
  check(h.dispatches.length === 1, 'close_tab dispatched once');
  check(h.dispatches[0].tool === 'close_tab', 'dispatched tool close_tab');
  check(h.dispatches[0].params.tabId === 42, 'close_tab routeParams include resolved camelCase tabId');
  check(h.wrappedChangeReports.length === 0, 'close_tab leaves change_report to dispatcher synthetic path');
}

async function testDispatcherNavigateCreatesBackgroundTabWhenZeroOwned() {
  console.log('\n--- dispatcher navigate creates background tab when zero-owned on chrome://newtab/ ---');
  delete require.cache[require.resolve('../extension/ws/mcp-tool-dispatcher.js')];
  const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');
  const registry = buildRegistryMock({ knownAgents: ['agent_a'] });
  globalThis.fsbAgentRegistryInstance = registry;
  const chromeMock = installChromeForDispatcher({
    activeTab: { id: 10, url: 'chrome://newtab/', title: 'New Tab', active: true, windowId: 1 },
    tabs: [],
    nextTabId: 30
  });
  try {
    const result = await dispatcher.dispatchMcpToolRoute({
      tool: 'navigate',
      params: { url: 'https://example.com', agentId: 'agent_a' },
      payload: { agentId: 'agent_a' },
      client: {
        _getActiveTab: async () => {
          throw new Error('navigate bootstrap must not inspect active chrome://newtab/');
        }
      }
    });
    check(result && result.success === true, 'navigate succeeded');
    check(chromeMock.createCalls.length === 1, 'chrome.tabs.create called once');
    check(chromeMock.createCalls[0].url === 'https://example.com', 'chrome.tabs.create used requested URL');
    check(chromeMock.createCalls[0].active === false, 'chrome.tabs.create used active:false');
    check(chromeMock.updateCalls.length === 0, 'chrome.tabs.update not called');
    check(registry._bindCalls.length === 1 && registry._bindCalls[0].tabId === 30, 'navigate bound created background tab 30');
    check(typeof result.ownershipToken === 'string', 'navigate returned ownershipToken');
  } finally {
    delete globalThis.fsbAgentRegistryInstance;
    delete global.chrome;
  }
}

async function testDispatcherNavigateRejectsOtherOwnedExplicitTarget() {
  console.log('\n--- dispatcher navigate rejects other-owned explicit target before update ---');
  delete require.cache[require.resolve('../extension/ws/mcp-tool-dispatcher.js')];
  const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');
  const registry = buildRegistryMock({ knownAgents: ['agent_a', 'agent_b'], owners: [[10, 'agent_b']] });
  globalThis.fsbAgentRegistryInstance = registry;
  const chromeMock = installChromeForDispatcher({
    activeTab: { id: 10, url: 'chrome://newtab/', title: 'New Tab', active: true, windowId: 1 },
    tabs: []
  });
  try {
    const result = await dispatcher.dispatchMcpToolRoute({
      tool: 'navigate',
      params: { url: 'https://example.com', tabId: 10, agentId: 'agent_a' },
      payload: { agentId: 'agent_a' },
      client: {
        _getActiveTab: async () => ({ id: 10, url: 'chrome://newtab/', title: 'New Tab', active: true, windowId: 1 })
      }
    });
    check(result && result.code === 'TAB_NOT_OWNED', 'navigate rejects with TAB_NOT_OWNED');
    check(chromeMock.updateCalls.length === 0, 'chrome.tabs.update not called');
    check(chromeMock.createCalls.length === 0, 'chrome.tabs.create not called');
  } finally {
    delete globalThis.fsbAgentRegistryInstance;
    delete global.chrome;
  }
}

async function testDispatcherSwitchTabClaimsUnownedTarget() {
  console.log('\n--- dispatcher switch_tab selects unowned target without focus transfer by default ---');
  delete require.cache[require.resolve('../extension/ws/mcp-tool-dispatcher.js')];
  const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');
  const registry = buildRegistryMock({ knownAgents: ['agent_a'] });
  globalThis.fsbAgentRegistryInstance = registry;
  const chromeMock = installChromeForDispatcher({
    activeTab: { id: 10, url: 'chrome://newtab/', title: 'New Tab', active: true, windowId: 1 },
    tabs: [{ id: 20, url: 'https://google.com/', title: 'Google', active: false, windowId: 1 }]
  });
  try {
    const result = await dispatcher.dispatchMcpToolRoute({
      tool: 'switch_tab',
      params: { tabId: 20, agentId: 'agent_a' },
      payload: { agentId: 'agent_a' }
    });
    check(result && result.success === true, 'switch_tab succeeded');
    check(registry._bindCalls.length === 1 && registry._bindCalls[0].tabId === 20, 'switch_tab bound target tab 20');
    check(chromeMock.updateCalls.length === 0, 'switch_tab did not foreground target by default');
    check(typeof result.ownershipToken === 'string', 'switch_tab returned ownershipToken');
  } finally {
    delete globalThis.fsbAgentRegistryInstance;
    delete global.chrome;
  }
}

async function testDispatcherSwitchTabActiveTrueForegroundsTarget() {
  console.log('\n--- dispatcher switch_tab active:true foregrounds target explicitly ---');
  delete require.cache[require.resolve('../extension/ws/mcp-tool-dispatcher.js')];
  const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');
  const registry = buildRegistryMock({ knownAgents: ['agent_a'] });
  globalThis.fsbAgentRegistryInstance = registry;
  const chromeMock = installChromeForDispatcher({
    activeTab: { id: 10, url: 'chrome://newtab/', title: 'New Tab', active: true, windowId: 1 },
    tabs: [{ id: 20, url: 'https://google.com/', title: 'Google', active: false, windowId: 1 }]
  });
  try {
    const result = await dispatcher.dispatchMcpToolRoute({
      tool: 'switch_tab',
      params: { tabId: 20, active: true, agentId: 'agent_a' },
      payload: { agentId: 'agent_a' }
    });
    check(result && result.success === true, 'switch_tab active:true succeeded');
    check(registry._bindCalls.length === 1 && registry._bindCalls[0].tabId === 20, 'switch_tab active:true bound target tab 20');
    check(chromeMock.updateCalls.length === 1 && chromeMock.updateCalls[0].updates.active === true, 'switch_tab active:true foregrounded target');
    check(chromeMock.windowUpdateCalls.length === 1 && chromeMock.windowUpdateCalls[0].updates.focused === true, 'switch_tab active:true focused target window');
  } finally {
    delete globalThis.fsbAgentRegistryInstance;
    delete global.chrome;
  }
}

async function testDispatcherSwitchTabRejectsOtherOwnedTarget() {
  console.log('\n--- dispatcher switch_tab rejects other-owned target before focus transfer ---');
  delete require.cache[require.resolve('../extension/ws/mcp-tool-dispatcher.js')];
  const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');
  const registry = buildRegistryMock({ knownAgents: ['agent_a', 'agent_b'], owners: [[20, 'agent_b']] });
  globalThis.fsbAgentRegistryInstance = registry;
  const chromeMock = installChromeForDispatcher({
    activeTab: { id: 10, url: 'chrome://newtab/', title: 'New Tab', active: true, windowId: 1 },
    tabs: [{ id: 20, url: 'https://google.com/', title: 'Google', active: false, windowId: 1 }]
  });
  try {
    const result = await dispatcher.dispatchMcpToolRoute({
      tool: 'switch_tab',
      params: { tabId: 20, agentId: 'agent_a' },
      payload: { agentId: 'agent_a' }
    });
    check(result && result.code === 'TAB_NOT_OWNED', 'switch_tab rejects with TAB_NOT_OWNED');
    check(chromeMock.updateCalls.length === 0, 'chrome.tabs.update not called');
    check(chromeMock.createCalls.length === 0, 'chrome.tabs.create not called');
  } finally {
    delete globalThis.fsbAgentRegistryInstance;
    delete global.chrome;
  }
}

async function testDispatcherOpenTabSyntheticChangeReport() {
  console.log('\n--- dispatcher open_tab returns synthetic change_report without focus transfer ---');
  delete require.cache[require.resolve('../extension/ws/mcp-tool-dispatcher.js')];
  const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');
  if (typeof dispatcher._setChangeReportsEnabledForTest === 'function') {
    dispatcher._setChangeReportsEnabledForTest(true);
  }
  const registry = buildRegistryMock({ knownAgents: ['agent_a'] });
  globalThis.fsbAgentRegistryInstance = registry;
  const chromeMock = installChromeForDispatcher({
    activeTab: { id: 10, url: 'https://google.com/', title: 'Google', active: true, windowId: 1 },
    tabs: [],
    nextTabId: 40
  });
  try {
    const result = await dispatcher.dispatchMcpToolRoute({
      tool: 'open_tab',
      params: { url: 'https://example.com', agentId: 'agent_a' },
      payload: { agentId: 'agent_a' }
    });
    check(result && result.success === true, 'open_tab succeeded');
    check(chromeMock.createCalls.length === 1 && chromeMock.createCalls[0].active === false, 'open_tab created background tab');
    check(result && result.change_report, 'open_tab attached change_report');
    check(result.change_report.url.before === null, 'open_tab change_report url.before is null');
    check(result.change_report.url.after === 'https://example.com', 'open_tab change_report url.after is created URL');
    check(result.change_report.url.changed === true, 'open_tab change_report url.changed is true');
    check(result.change_report.focus_shift === null, 'open_tab change_report focus_shift is null');
    check(result.change_report.partial === true, 'open_tab change_report marks partial synthetic report');
  } finally {
    delete globalThis.fsbAgentRegistryInstance;
    delete global.chrome;
  }
}

async function testDispatcherOpenTabHonorsChangeReportToggleOff() {
  console.log('\n--- dispatcher open_tab omits change_report when toggle is off ---');
  delete require.cache[require.resolve('../extension/ws/mcp-tool-dispatcher.js')];
  const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');
  if (typeof dispatcher._setChangeReportsEnabledForTest === 'function') {
    dispatcher._setChangeReportsEnabledForTest(false);
  }
  const registry = buildRegistryMock({ knownAgents: ['agent_a'] });
  globalThis.fsbAgentRegistryInstance = registry;
  installChromeForDispatcher({
    activeTab: { id: 10, url: 'https://google.com/', title: 'Google', active: true, windowId: 1 },
    tabs: [],
    nextTabId: 41
  });
  try {
    const result = await dispatcher.dispatchMcpToolRoute({
      tool: 'open_tab',
      params: { url: 'https://example.org', agentId: 'agent_a' },
      payload: { agentId: 'agent_a' }
    });
    check(result && result.success === true, 'open_tab succeeded with toggle off');
    check(!result.change_report, 'open_tab omitted change_report with toggle off');
  } finally {
    if (typeof dispatcher._setChangeReportsEnabledForTest === 'function') {
      dispatcher._setChangeReportsEnabledForTest(true);
    }
    delete globalThis.fsbAgentRegistryInstance;
    delete global.chrome;
  }
}

async function testDispatcherCloseTabClosesBackgroundOwnedTab() {
  console.log('\n--- dispatcher close_tab closes background owned tab and releases ownership ---');
  delete require.cache[require.resolve('../extension/ws/mcp-tool-dispatcher.js')];
  const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');
  if (typeof dispatcher._setChangeReportsEnabledForTest === 'function') {
    dispatcher._setChangeReportsEnabledForTest(true);
  }
  const registry = buildRegistryMock({
    knownAgents: ['agent_a'],
    owners: [[20, 'agent_a']],
    metadata: [[20, { ownershipToken: 'tok-agent_a-20', incognito: false, windowId: 1 }]],
    agentWindowIds: { agent_a: 1 }
  });
  globalThis.fsbAgentRegistryInstance = registry;
  const chromeMock = installChromeForDispatcher({
    activeTab: { id: 10, url: 'https://google.com/', title: 'Google', active: true, windowId: 1 },
    tabs: [{ id: 20, url: 'https://example.com/', title: 'Example', active: false, windowId: 1 }]
  });
  try {
    const result = await dispatcher.dispatchMcpToolRoute({
      tool: 'close_tab',
      params: { tabId: 20, agentId: 'agent_a', ownershipToken: 'tok-agent_a-20' }
    });
    check(result && result.success === true, 'close_tab succeeded');
    check(result.closed === true, 'close_tab reports closed:true');
    check(result.wasActive === false, 'close_tab reports wasActive:false for background tab');
    check(chromeMock.removeCalls.length === 1 && chromeMock.removeCalls[0] === 20, 'chrome.tabs.remove called for target tab');
    check(registry._releaseCalls.length === 1 && registry._releaseCalls[0] === 20, 'registry.releaseTab called after close');
    check(result && result.change_report, 'close_tab attached change_report');
    check(result.change_report.url.before === 'https://example.com/', 'close_tab change_report url.before is closed URL');
    check(result.change_report.url.after === null, 'close_tab change_report url.after is null');
    check(result.change_report.focus_shift === null, 'close_tab change_report focus_shift is null');
    check(result.change_report.partial === true, 'close_tab change_report marks partial synthetic report');
  } finally {
    delete globalThis.fsbAgentRegistryInstance;
    delete global.chrome;
  }
}

async function testDispatcherCloseTabRejectsActiveByDefault() {
  console.log('\n--- dispatcher close_tab rejects active tab without allow_active ---');
  delete require.cache[require.resolve('../extension/ws/mcp-tool-dispatcher.js')];
  const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');
  const registry = buildRegistryMock({
    knownAgents: ['agent_a'],
    owners: [[10, 'agent_a']],
    metadata: [[10, { ownershipToken: 'tok-agent_a-10', incognito: false, windowId: 1 }]],
    agentWindowIds: { agent_a: 1 }
  });
  globalThis.fsbAgentRegistryInstance = registry;
  const chromeMock = installChromeForDispatcher({
    activeTab: { id: 10, url: 'https://google.com/', title: 'Google', active: true, windowId: 1 },
    tabs: []
  });
  try {
    const result = await dispatcher.dispatchMcpToolRoute({
      tool: 'close_tab',
      params: { tabId: 10, agentId: 'agent_a', ownershipToken: 'tok-agent_a-10' }
    });
    check(result && result.success === false, 'close_tab active reject returns failure');
    check(result.errorCode === 'active_tab_close_rejected', 'close_tab active reject has typed errorCode');
    check(chromeMock.removeCalls.length === 0, 'chrome.tabs.remove not called for protected active tab');
    check(registry._releaseCalls.length === 0, 'registry.releaseTab not called for protected active tab');
  } finally {
    delete globalThis.fsbAgentRegistryInstance;
    delete global.chrome;
  }
}

async function testDispatcherCloseTabAllowActiveClosesActiveTab() {
  console.log('\n--- dispatcher close_tab allow_active:true closes active owned tab ---');
  delete require.cache[require.resolve('../extension/ws/mcp-tool-dispatcher.js')];
  const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');
  const registry = buildRegistryMock({
    knownAgents: ['agent_a'],
    owners: [[10, 'agent_a']],
    metadata: [[10, { ownershipToken: 'tok-agent_a-10', incognito: false, windowId: 1 }]],
    agentWindowIds: { agent_a: 1 }
  });
  globalThis.fsbAgentRegistryInstance = registry;
  const chromeMock = installChromeForDispatcher({
    activeTab: { id: 10, url: 'https://google.com/', title: 'Google', active: true, windowId: 1 },
    tabs: []
  });
  try {
    const result = await dispatcher.dispatchMcpToolRoute({
      tool: 'close_tab',
      params: { tabId: 10, allow_active: true, agentId: 'agent_a', ownershipToken: 'tok-agent_a-10' }
    });
    check(result && result.success === true, 'close_tab allow_active:true succeeded');
    check(result.wasActive === true, 'close_tab allow_active:true reports wasActive:true');
    check(chromeMock.removeCalls.length === 1 && chromeMock.removeCalls[0] === 10, 'chrome.tabs.remove called for active target');
    check(registry._releaseCalls.length === 1 && registry._releaseCalls[0] === 10, 'registry.releaseTab called for active target');
  } finally {
    delete globalThis.fsbAgentRegistryInstance;
    delete global.chrome;
  }
}

async function run() {
  await testBridgeOpenTabBypassesResolver();
  await testBridgeNavigateZeroOwnedFallback();
  await testBridgeSwitchTabBypassesResolver();
  await testBridgeCloseTabUsesDispatcherSyntheticChangeReport();
  await testDispatcherNavigateCreatesBackgroundTabWhenZeroOwned();
  await testDispatcherNavigateRejectsOtherOwnedExplicitTarget();
  await testDispatcherSwitchTabClaimsUnownedTarget();
  await testDispatcherSwitchTabActiveTrueForegroundsTarget();
  await testDispatcherSwitchTabRejectsOtherOwnedTarget();
  await testDispatcherOpenTabSyntheticChangeReport();
  await testDispatcherOpenTabHonorsChangeReportToggleOff();
  await testDispatcherCloseTabClosesBackgroundOwnedTab();
  await testDispatcherCloseTabRejectsActiveByDefault();
  await testDispatcherCloseTabAllowActiveClosesActiveTab();

  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  failed++;
  console.error('  FAIL: uncaught error:', err && err.stack ? err.stack : err);
  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(1);
});
