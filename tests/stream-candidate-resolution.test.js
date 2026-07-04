'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const wsClientSource = fs.readFileSync(
  path.join(__dirname, '..', 'extension', 'ws', 'ws-client.js'),
  'utf8'
);

function tabMatchesQuery(tab, query) {
  if (typeof query.active === 'boolean' && tab.active !== query.active) return false;
  if (query.lastFocusedWindow === true && tab.lastFocusedWindow !== true) return false;
  if (query.currentWindow === true && tab.currentWindow !== true) return false;
  return true;
}

function createHarness(tabs) {
  const queryCalls = [];
  const badgeCalls = [];
  const context = {
    console,
    URL,
    Set,
    Date,
    Promise,
    WebSocket: function WebSocket() {},
    chrome: {
      tabs: {
        get: async function get(tabId) {
          const found = tabs.find((tab) => tab.id === tabId);
          if (!found) throw new Error('No tab with id ' + tabId);
          return Object.assign({}, found);
        },
        query: async function query(query) {
          queryCalls.push(Object.assign({}, query));
          return tabs
            .filter((tab) => tabMatchesQuery(tab, query || {}))
            .map((tab) => Object.assign({}, tab));
        }
      },
      runtime: { lastError: null },
      action: {
        setBadgeText: (payload) => badgeCalls.push(['text', payload]),
        setBadgeBackgroundColor: (payload) => badgeCalls.push(['color', payload])
      }
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(
    wsClientSource + '\n' +
      'globalThis.__FSBWebSocketClass = FSBWebSocket;\n' +
      'globalThis.__handleRemoteControlStart = handleRemoteControlStart;\n' +
      'globalThis.__isStreamableTabUrl = _isStreamableTabUrl;\n',
    context
  );
  return {
    context,
    queryCalls,
    badgeCalls,
    client: new context.__FSBWebSocketClass()
  };
}

(async () => {
  console.log('--- stream candidate resolution behavior ---');

  {
    const harness = createHarness([
      { id: 1, url: 'https://full-selfbrowsing.com/dashboard', active: true, lastFocusedWindow: true, lastAccessed: 300 },
      { id: 2, url: 'https://example.com/', active: false, lastFocusedWindow: false, lastAccessed: 200 }
    ]);
    const candidate = await harness.client._resolveStreamCandidate();
    assert.strictEqual(candidate.ready, true, 'background normal tab is streamable');
    assert.strictEqual(candidate.tabId, 2, 'resolver skips active dashboard and selects background tab');
    assert.strictEqual(candidate.source, 'all-tabs', 'resolver enumerates background tabs');
    assert(harness.queryCalls.some((query) => Object.keys(query).length === 0), 'resolver calls chrome.tabs.query({})');
  }

  {
    const harness = createHarness([
      { id: 10, url: 'https://full-selfbrowsing.com/dashboard', active: true, lastFocusedWindow: true, lastAccessed: 100 }
    ]);
    const candidate = await harness.client._resolveStreamCandidate();
    assert.strictEqual(candidate.ready, false, 'dashboard-only tab set is not streamable');
    assert.strictEqual(candidate.reason, 'no-streamable-tab', 'dashboard-only tabs report no-streamable-tab, not restricted-tab');
    assert.strictEqual(candidate.tabId, null, 'dashboard-only fallback does not pin preview to dashboard tab');
  }

  {
    const harness = createHarness([
      { id: 20, url: 'chrome://extensions/', active: true, lastFocusedWindow: true, lastAccessed: 100 }
    ]);
    const candidate = await harness.client._resolveStreamCandidate();
    assert.strictEqual(candidate.ready, false, 'restricted active tab is not streamable');
    assert.strictEqual(candidate.reason, 'restricted-tab', 'restricted active tab still reports restricted-tab');
    assert.strictEqual(candidate.tabId, 20, 'restricted fallback preserves tab id for placeholder context');
  }

  {
    const harness = createHarness([
      { id: 30, url: 'https://old.example/', active: false, lastFocusedWindow: false, lastAccessed: 100 },
      { id: 31, url: 'https://new.example/', active: false, lastFocusedWindow: false, lastAccessed: 500 }
    ]);
    const candidate = await harness.client._resolveStreamCandidate();
    assert.strictEqual(candidate.tabId, 31, 'all-tabs fallback prefers most recently accessed normal page');
  }

  {
    const harness = createHarness([
      { id: 40, url: 'https://example.com/', active: false, lastFocusedWindow: false, lastAccessed: 100 }
    ]);
    const sent = [];
    harness.context._streamingTabId = 999;
    harness.context.__fsbWsInstance = {
      _resolveStreamCandidate: async () => ({ ready: true, tabId: 40, url: 'https://example.com/' }),
      send: (type, payload) => sent.push({ type, payload })
    };
    await harness.context.__handleRemoteControlStart();
    assert.strictEqual(harness.context._streamingTabId, 40, 'remote-control start refreshes stale streaming tab from resolver');
    assert.strictEqual(sent[0].type, 'ext:remote-control-state', 'remote-control start broadcasts state');
    assert.strictEqual(sent[0].payload.enabled, true, 'remote-control state is enabled');
    assert.strictEqual(sent[0].payload.tabId, 40, 'remote-control state uses resolved tab id');
  }

  console.log('All stream candidate resolution checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
