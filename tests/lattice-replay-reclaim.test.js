'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const background = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');

function declarationSource(source, name) {
  let start = source.indexOf('async function ' + name + '(');
  if (start === -1) start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'missing function ' + name);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unterminated function ' + name);
}

function makeHarness(options = {}) {
  const calls = { gets: [], binds: [], releases: [], registrations: 0 };
  const tabs = new Map((options.tabs || []).map((tab) => [tab.id, tab]));
  const registry = {
    getOwner() { return null; },
    hasAgent(agentId) { return options.hasAgent !== false && agentId === options.agentId; },
    async registerAgent() {
      calls.registrations++;
      return { agentId: options.registeredAgentId || 'agent-new' };
    },
    async bindTab(agentId, tabId) {
      calls.binds.push({ agentId, tabId });
      if (typeof options.onBind === 'function') return options.onBind(agentId, tabId, calls);
      return { success: true, ownershipToken: 'token-' + tabId };
    },
    async releaseAgent(agentId, reason) {
      calls.releases.push({ agentId, reason });
      return true;
    }
  };
  const context = {
    chrome: {
      tabs: {
        async get(tabId) {
          calls.gets.push(tabId);
          if (!tabs.has(tabId)) throw new Error('missing tab ' + tabId);
          return tabs.get(tabId);
        }
      }
    },
    fsbReplayOrigin(url) {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null;
      } catch (_error) {
        return null;
      }
    },
    fsbAgentRegistryInstance: registry
  };
  vm.createContext(context);
  vm.runInContext(
    declarationSource(background, 'fsbReplayReclaimOwnedTab') + '\n' +
      declarationSource(background, 'fsbReplayReclaimOwnedTabs') + '\n' +
      'this.reclaimOwnedTabs = fsbReplayReclaimOwnedTabs;',
    context,
    { filename: 'extension/background.js' }
  );
  return { reclaimOwnedTabs: context.reclaimOwnedTabs, calls };
}

const state = {
  replayAgentId: 'agent-recovery',
  targetTabId: 101,
  logicalTabs: [
    { logicalTab: 'primary', tabId: 101, expectedOrigin: 'https://one.example' },
    { logicalTab: 'tab-2', tabId: 202, expectedOrigin: 'https://two.example' }
  ]
};

test('replay recovery preflights every tab before binding and returns all mappings', async () => {
  const harness = makeHarness({
    agentId: 'agent-recovery',
    tabs: [
      { id: 101, url: 'https://one.example/start' },
      { id: 202, url: 'https://two.example/start' }
    ],
    onBind(agentId, tabId, calls) {
      assert.deepEqual(calls.gets, [101, 202], 'both tabs must be validated before the first bind');
      return { success: true, ownershipToken: agentId + ':' + tabId };
    }
  });

  const result = JSON.parse(JSON.stringify(await harness.reclaimOwnedTabs(state)));
  assert.deepEqual(harness.calls.binds, [
    { agentId: 'agent-recovery', tabId: 101 },
    { agentId: 'agent-recovery', tabId: 202 }
  ]);
  assert.deepEqual(harness.calls.releases, []);
  assert.equal(result.owned.tab.id, 101);
  assert.equal(result.replayTabs.primary.tabId, 101);
  assert.equal(result.replayTabs['tab-2'].tabId, 202);
});

test('partial replay reclaim releases the shared agent and preserves the original error', async () => {
  const harness = makeHarness({
    agentId: 'agent-recovery',
    tabs: [
      { id: 101, url: 'https://one.example/start' },
      { id: 202, url: 'https://two.example/start' }
    ],
    onBind(_agentId, tabId) {
      return tabId === 202
        ? { success: false, error: 'second bind failed' }
        : { success: true, ownershipToken: 'first-token' };
    }
  });

  await assert.rejects(harness.reclaimOwnedTabs(state), /second bind failed/);
  assert.deepEqual(harness.calls.binds.map((call) => call.tabId), [101, 202]);
  assert.deepEqual(harness.calls.releases, [
    { agentId: 'agent-recovery', reason: 'replay_recovery_failed' }
  ]);
});

test('restricted recovery tab aborts before any binding and leaves tabs untouched', async () => {
  const harness = makeHarness({
    agentId: 'agent-recovery',
    tabs: [
      { id: 101, url: 'https://one.example/start' },
      { id: 202, url: 'chrome://settings/' }
    ]
  });

  await assert.rejects(harness.reclaimOwnedTabs(state), /tab-2 is missing or restricted/);
  assert.deepEqual(harness.calls.gets, [101, 202]);
  assert.deepEqual(harness.calls.binds, []);
  assert.deepEqual(harness.calls.releases, [
    { agentId: 'agent-recovery', reason: 'replay_recovery_failed' }
  ]);
});

test('a newly registered agent is released when its first recovery bind fails', async () => {
  const harness = makeHarness({
    hasAgent: false,
    tabs: [{ id: 101, url: 'https://one.example/start' }],
    onBind() { return { success: false, error: 'first bind failed' }; }
  });

  await assert.rejects(harness.reclaimOwnedTabs({
    replayAgentId: null,
    targetTabId: 101,
    logicalTabs: [{ logicalTab: 'primary', tabId: 101, expectedOrigin: 'https://one.example' }]
  }), /first bind failed/);
  assert.equal(harness.calls.registrations, 1);
  assert.deepEqual(harness.calls.releases, [
    { agentId: 'agent-new', reason: 'replay_recovery_failed' }
  ]);
});
