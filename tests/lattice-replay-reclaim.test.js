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

test('a missing in-flight close target becomes an idempotent tombstone', async () => {
  const harness = makeHarness({
    agentId: 'agent-recovery',
    tabs: [{ id: 101, url: 'https://one.example/start' }]
  });

  const result = JSON.parse(JSON.stringify(await harness.reclaimOwnedTabs(state, {
    allowMissingCloseLogicalTab: 'tab-2'
  })));
  assert.deepEqual(harness.calls.gets, [101, 202]);
  assert.deepEqual(harness.calls.binds, [
    { agentId: 'agent-recovery', tabId: 101 }
  ]);
  assert.deepEqual(harness.calls.releases, []);
  assert.equal(result.owned.tab.id, 101);
  assert.equal(result.replayTabs['tab-2'].tabId, 202);
  assert.equal(result.replayTabs['tab-2'].closed, true);
  assert.equal(result.replayTabs['tab-2'].ownershipToken, null);
});

test('the close exception does not admit a restricted tab', async () => {
  const harness = makeHarness({
    agentId: 'agent-recovery',
    tabs: [
      { id: 101, url: 'https://one.example/start' },
      { id: 202, url: 'chrome://settings/' }
    ]
  });

  await assert.rejects(harness.reclaimOwnedTabs(state, {
    allowMissingCloseLogicalTab: 'tab-2'
  }), /tab-2 is missing or restricted/);
  assert.deepEqual(harness.calls.binds, []);
  assert.deepEqual(harness.calls.releases, [
    { agentId: 'agent-recovery', reason: 'replay_recovery_failed' }
  ]);
});

test('an explicit empty logical-tab set reserves an unbound recovery agent', async () => {
  const harness = makeHarness({ hasAgent: false, tabs: [] });
  const result = JSON.parse(JSON.stringify(await harness.reclaimOwnedTabs({
    replayAgentId: null,
    targetTabId: 101,
    logicalTabs: []
  })));

  assert.deepEqual(harness.calls.gets, [], 'an explicit empty set must not use the legacy target fallback');
  assert.deepEqual(harness.calls.binds, []);
  assert.equal(harness.calls.registrations, 1);
  assert.equal(result.owned.agentId, 'agent-new');
  assert.equal(result.owned.tab, null);
  assert.deepEqual(result.replayTabs, {});
  assert.equal(result.bootstrapLogicalTab, null);
});

test('a filtered close tombstone is re-inferred after another worker eviction', async () => {
  const harness = makeHarness({ agentId: 'agent-recovery', tabs: [] });
  const result = JSON.parse(JSON.stringify(await harness.reclaimOwnedTabs({
    replayAgentId: 'agent-recovery',
    targetTabId: null,
    logicalTabs: []
  }, {
    allowMissingCloseLogicalTab: 'tab-closed'
  })));

  assert.deepEqual(harness.calls.gets, []);
  assert.deepEqual(harness.calls.binds, []);
  assert.equal(result.replayTabs['tab-closed'].closed, true);
  assert.equal(result.replayTabs['tab-closed'].tabId, null);
  assert.equal(result.owned.tab, null);
});

test('concurrent replay starts create only one owned tab and session', async () => {
  let resolvePreparation;
  let createdTabs = 0;
  const responses = { first: [], second: [] };
  const context = {
    activeSessions: new Map(),
    fsbReplayIsTrustedUiSender() { return true; },
    prepareSessionReplay() {
      return new Promise((resolve) => { resolvePreparation = resolve; });
    },
    fsbReplayIsExecutable() { return true; },
    fsbReplayBootstrapTab() {
      return { id: 'primary', startUrl: 'https://example.com/start' };
    },
    async fsbReplayCreateOwnedTab() {
      createdTabs++;
      return { tab: { id: 501, url: 'https://example.com/start' }, agentId: 'agent-replay', ownershipToken: 'token' };
    },
    fsbReplayBuildSession(_prepared, replaySessionId, owned) {
      return {
        replaySessionId,
        status: 'replaying',
        task: 'Replay test',
        tabId: owned.tab.id
      };
    },
    startKeepAlive() {},
    automationLogger: { logSessionStart() {}, error() {} },
    async fsbReplayPersistCheckpoint() {},
    async fsbReplayPersistRun() { return {}; },
    fsbReplayAssertExecutablePreparation() {},
    async fsbReplayAbortFailedStart() {},
    setTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(
    'let fsbReplayStartPending = false;\n' +
      declarationSource(background, 'handleReplaySession') + '\n' +
      'this.handleReplaySession = handleReplaySession;',
    context,
    { filename: 'extension/background.js' }
  );

  const first = context.handleReplaySession(
    { sessionId: 'source-session', manifestHash: 'manifest-hash', approvedScopes: [] },
    {},
    (response) => responses.first.push(response)
  );
  const second = context.handleReplaySession(
    { sessionId: 'source-session', manifestHash: 'manifest-hash', approvedScopes: [] },
    {},
    (response) => responses.second.push(response)
  );

  await second;
  assert.equal(responses.second[0].success, false);
  assert.match(responses.second[0].error, /Another automation is already running/);
  resolvePreparation({
    replay: { manifestHash: 'manifest-hash' },
    steps: [{ id: 'step-1', tool: 'click' }]
  });
  await first;

  assert.equal(createdTabs, 1);
  assert.equal(responses.first[0].success, true);
  assert.equal(context.activeSessions.size, 1);
});

test('direct replay startup rejects truncated recordings before creating a tab', async () => {
  let createdTabs = 0;
  let response;
  const steps = Array.from({ length: 100 }, (_, index) => ({
    id: 'step-' + index,
    replay: { availability: 'ready' }
  }));
  const context = {
    activeSessions: new Map(),
    fsbReplayIsTrustedUiSender() { return true; },
    async prepareSessionReplay() {
      return {
        replay: { manifestHash: 'manifest-truncated' },
        steps,
        totalSourceSteps: 101,
        truncated: true
      };
    },
    async fsbReplayCreateOwnedTab() { createdTabs++; },
    async fsbReplayAbortFailedStart() {},
    automationLogger: { error() {} },
    Error,
    Map,
    Math,
    Number
  };
  vm.createContext(context);
  vm.runInContext(
    'let fsbReplayStartPending = false;\n' +
      declarationSource(background, 'fsbReplayIsExecutable') + '\n' +
      declarationSource(background, 'fsbReplayIsTruncated') + '\n' +
      declarationSource(background, 'fsbReplayTruncatedMessage') + '\n' +
      declarationSource(background, 'fsbReplayAssertExecutablePreparation') + '\n' +
      declarationSource(background, 'handleReplaySession') + '\n' +
      'this.handleReplaySession = handleReplaySession;',
    context,
    { filename: 'extension/background.js' }
  );

  await context.handleReplaySession(
    { sessionId: 'source-truncated', manifestHash: 'manifest-truncated' },
    {},
    (value) => { response = value; }
  );

  assert.equal(response.success, false);
  assert.match(response.error, /Earlier browser state is missing.*inspect-only/s);
  assert.equal(createdTabs, 0);
  assert.equal(context.activeSessions.size, 0);
});

test('replay startup reports failure when its initial run head is not durable', async () => {
  const events = [];
  let response;
  const context = {
    activeSessions: new Map(),
    fsbReplayIsTrustedUiSender() { return true; },
    async prepareSessionReplay() {
      return {
        replay: { manifestHash: 'manifest-persistence' },
        steps: [{ id: 'step-1', replay: { availability: 'ready' } }]
      };
    },
    fsbReplayAssertExecutablePreparation() {},
    fsbReplayBootstrapTab() { return { id: 'primary', startUrl: 'https://example.com/start' }; },
    async fsbReplayCreateOwnedTab() {
      events.push('create-tab');
      return { tab: { id: 501, url: 'https://example.com/start' }, agentId: 'agent-replay' };
    },
    fsbReplayBuildSession(_prepared, replaySessionId, owned) {
      return {
        replaySessionId,
        status: 'replaying',
        task: 'Replay test',
        tabId: owned.tab.id,
        replayRun: { id: replaySessionId, status: 'running', steps: [] }
      };
    },
    startKeepAlive() {},
    automationLogger: { logSessionStart() {}, error() {} },
    async fsbReplayPersistCheckpoint() { events.push('checkpoint'); },
    async fsbReplayPersistRun() { events.push('persist-failed'); return false; },
    async fsbReplayAbortFailedStart() { events.push('abort'); },
    setTimeout() { events.push('scheduled'); },
    Date,
    Error,
    Map,
    Math
  };
  vm.createContext(context);
  vm.runInContext(
    'let fsbReplayStartPending = false;\n' +
      declarationSource(background, 'handleReplaySession') + '\n' +
      'this.handleReplaySession = handleReplaySession;',
    context,
    { filename: 'extension/background.js' }
  );

  await context.handleReplaySession(
    { sessionId: 'source-persistence', manifestHash: 'manifest-persistence' },
    {},
    (value) => { response = value; }
  );

  assert.equal(response.success, false);
  assert.match(response.error, /persistence is unavailable/);
  assert.deepEqual(events, ['create-tab', 'checkpoint', 'persist-failed', 'abort']);
});

function makeMcpReplayApprovalHarness(options = {}) {
  let storedApprovals = [];
  let nextRequestId = 1;
  let failNextStorageWrite = false;
  let startupHandler = async (_request, _sender, respond) => {
    respond({ success: true });
  };
  const calls = { storageSets: 0, storageRemoves: 0 };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const context = {
    chrome: {
      storage: {
        session: {
          async get(key) {
            return storedApprovals.length > 0 ? { [key]: clone(storedApprovals) } : {};
          },
          async set(value) {
            calls.storageSets++;
            if (failNextStorageWrite) {
              failNextStorageWrite = false;
              throw new Error('approval storage write failed');
            }
            storedApprovals = clone(value.fsbPendingMcpReplayApprovals || []);
          },
          async remove() {
            calls.storageRemoves++;
            storedApprovals = [];
          }
        }
      },
      runtime: { async sendMessage() {} }
    },
    crypto: { randomUUID() { return 'approval-' + nextRequestId++; } },
    async prepareSessionReplay(sessionId) {
      const stepCount = options.truncated === true ? 100 : 1;
      return {
        sessionId,
        replay: { manifestHash: 'manifest-' + sessionId },
        steps: Array.from({ length: stepCount }, (_, index) => ({
          id: 'step-' + sessionId + '-' + index,
          replay: { availability: 'ready' }
        })),
        tabs: [],
        counts: { ready: stepCount },
        totalSourceSteps: options.truncated === true ? stepCount + 1 : stepCount,
        truncated: options.truncated === true
      };
    },
    fsbReplayPublicPreparation(prepared) {
      return {
        counts: prepared.counts,
        tabs: prepared.tabs,
        steps: prepared.steps
      };
    },
    async handleReplaySession(request, sender, respond) {
      return startupHandler(request, sender, respond);
    }
  };
  vm.createContext(context);
  vm.runInContext(
    "const FSB_PENDING_MCP_REPLAY_KEY = 'fsbPendingMcpReplayApprovals';\n" +
      'const FSB_MCP_REPLAY_APPROVAL_TTL_MS = 10 * 60 * 1000;\n' +
      'let fsbPendingMcpReplayApprovalTail = Promise.resolve();\n' +
      declarationSource(background, 'fsbReplayIsExecutable') + '\n' +
      declarationSource(background, 'fsbReplayIsTruncated') + '\n' +
      declarationSource(background, 'fsbReplayTruncatedMessage') + '\n' +
      declarationSource(background, 'fsbReplayAssertExecutablePreparation') + '\n' +
      declarationSource(background, 'fsbReadPendingMcpReplayApprovals') + '\n' +
      declarationSource(background, 'fsbWritePendingMcpReplayApprovals') + '\n' +
      declarationSource(background, 'fsbMutatePendingMcpReplayApprovals') + '\n' +
      declarationSource(background, 'fsbRemovePendingMcpReplayApproval') + '\n' +
      declarationSource(background, 'requestMcpSessionReplay') + '\n' +
      declarationSource(background, 'fsbGetMcpReplayApproval') + '\n' +
      declarationSource(background, 'fsbApprovePendingMcpReplay') + '\n' +
      'this.approvalApi = {' +
        'request: requestMcpSessionReplay,' +
        'read: fsbReadPendingMcpReplayApprovals,' +
        'remove: fsbRemovePendingMcpReplayApproval,' +
        'approve: fsbApprovePendingMcpReplay' +
      '};',
    context,
    { filename: 'extension/background.js' }
  );
  return {
    calls,
    request: context.approvalApi.request,
    read: context.approvalApi.read,
    remove: context.approvalApi.remove,
    approve: context.approvalApi.approve,
    failNextStorageWrite() { failNextStorageWrite = true; },
    setStartupHandler(handler) { startupHandler = handler; },
    stored() { return clone(storedApprovals); }
  };
}

test('concurrent MCP approval requests retain distinct manifests and coalesce duplicates', async () => {
  const distinct = makeMcpReplayApprovalHarness();
  await Promise.all([
    distinct.request('source-a'),
    distinct.request('source-b')
  ]);
  assert.deepEqual(distinct.stored().map((approval) => approval.sessionId).sort(), [
    'source-a',
    'source-b'
  ]);

  const duplicate = makeMcpReplayApprovalHarness();
  const results = await Promise.all([
    duplicate.request('source-a'),
    duplicate.request('source-a')
  ]);
  assert.equal(results[0].requestId, results[1].requestId);
  assert.equal(duplicate.stored().length, 1);
});

test('truncated recordings never create MCP replay approvals', async () => {
  const harness = makeMcpReplayApprovalHarness({ truncated: true });

  await assert.rejects(
    harness.request('source-truncated'),
    /Earlier browser state is missing.*inspect-only/s
  );
  assert.equal(harness.stored().length, 0);
  assert.equal(harness.calls.storageSets, 0);
});

test('a failed MCP approval mutation does not poison later storage updates', async () => {
  const harness = makeMcpReplayApprovalHarness();
  harness.failNextStorageWrite();
  await assert.rejects(harness.request('source-failed'), /approval storage write failed/);

  const retried = await harness.request('source-retried');
  assert.equal(harness.stored().length, 1);
  assert.equal(harness.stored()[0].requestId, retried.requestId);
});

test('approval removal after replay startup preserves a newer pending request', async () => {
  const harness = makeMcpReplayApprovalHarness();
  const older = await harness.request('source-old');
  let signalStarted;
  const started = new Promise((resolve) => { signalStarted = resolve; });
  let finishStartup;
  harness.setStartupHandler((_request, _sender, respond) => {
    signalStarted();
    return new Promise((resolve) => {
      finishStartup = (response) => {
        respond(response);
        resolve();
      };
    });
  });

  const approving = harness.approve({
    requestId: older.requestId,
    manifestHash: older.manifestHash
  }, {});
  await started;
  const newer = await harness.request('source-new');
  finishStartup({ success: true, sessionId: 'replay-old' });
  assert.equal((await approving).success, true);

  const remaining = harness.stored();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].requestId, newer.requestId);
  assert.equal(remaining[0].sessionId, 'source-new');
});

test('failed replay startup leaves its MCP approval available for retry', async () => {
  const harness = makeMcpReplayApprovalHarness();
  const approval = await harness.request('source-retry');
  harness.setStartupHandler(async (_request, _sender, respond) => {
    respond({ success: false, error: 'startup failed' });
  });

  const response = await harness.approve({
    requestId: approval.requestId,
    manifestHash: approval.manifestHash
  }, {});
  assert.equal(response.success, false);
  assert.equal(harness.stored().length, 1);
  assert.equal(harness.stored()[0].requestId, approval.requestId);
});

function makeTerminalRecoveryHarness(options = {}) {
  const replaySessionId = 'replay-terminal-test';
  const sourceSessionId = 'source-terminal-test';
  let releaseFailuresRemaining = options.failReleaseCount || 0;
  let checkpointStored = true;
  let agentPresent = options.agentAlreadyReleased !== true;
  let storedLogs = {
    [sourceSessionId]: {
      replay: { lastRun: { id: replaySessionId, status: options.initialStatus || 'running', steps: [] } }
    }
  };
  const snapshot = {
    kind: 'survivability-snapshot',
    capturedAt: '2026-08-10T00:00:00.000Z',
    payload: JSON.stringify({
      kind: 'fsb-lattice-replay-checkpoint/v1',
      replaySessionId,
      originalSessionId: sourceSessionId,
      manifestHash: 'stale-manifest-hash',
      replayAgentId: 'agent-terminal-test',
      logicalTabs: []
    })
  };
  const calls = {
    clears: 0,
    events: [],
    localSets: 0,
    reclaims: 0,
    releaseAttempts: [],
    warnings: 0
  };
  const context = {
    chrome: {
      storage: {
        session: {
          async get(key) {
            return checkpointStored ? { [key]: [replaySessionId] } : {};
          }
        },
        local: {
          async get() {
            return { fsbSessionLogs: JSON.parse(JSON.stringify(storedLogs)) };
          },
          async set(value) {
            calls.localSets++;
            if (options.failLocalSet === true) throw new Error('local storage write failed');
            storedLogs = JSON.parse(JSON.stringify(value.fsbSessionLogs));
          }
        }
      }
    },
    FsbLatticeRuntimeAdapter: {
      createFsbLatticeRuntimeAdapter() {
        return {
          async loadLatestSnapshot() { return checkpointStored ? snapshot : null; }
        };
      }
    },
    FsbLatticeReplay: {
      async persistReplayRun(sessionId, run) {
        assert.equal(sessionId, sourceSessionId);
        calls.localSets++;
        if (options.failLocalSet === true) throw new Error('local storage write failed');
        storedLogs[sourceSessionId].replay.lastRun = JSON.parse(JSON.stringify(run));
        return true;
      }
    },
    fsbReplayClone(value, fallback) {
      return value == null ? fallback : JSON.parse(JSON.stringify(value));
    },
    activeSessions: new Map(),
    fsbAgentRegistryInstance: options.registryUnavailable === true ? null : {
      hasAgent(agentId) {
        return agentId === 'agent-terminal-test' && agentPresent;
      },
      async releaseAgent(agentId, reason) {
        calls.releaseAttempts.push({ agentId, reason });
        if (releaseFailuresRemaining > 0) {
          releaseFailuresRemaining--;
          calls.events.push('release-failed');
          throw new Error('registry release failed');
        }
        calls.events.push('release');
        if (options.releaseRefused === true) return false;
        if (!agentPresent) return false;
        agentPresent = false;
        return true;
      }
    },
    async prepareSessionReplay() {
      return {
        replay: {
          manifestHash: 'current-manifest-hash',
          lastRun: JSON.parse(JSON.stringify(storedLogs[sourceSessionId].replay.lastRun))
        },
        steps: []
      };
    },
    fsbReplayAssertExecutablePreparation() {},
    async fsbReplayClearRecoverySnapshots(id) {
      assert.equal(id, replaySessionId);
      calls.clears++;
      calls.events.push('clear');
      checkpointStored = false;
    },
    async fsbReplayReclaimOwnedTabs() {
      calls.reclaims++;
      throw new Error('reclaim must not run');
    },
    automationLogger: { warn() { calls.warnings++; } }
  };
  vm.createContext(context);
  vm.runInContext(
    "const FSB_REPLAY_CHECKPOINT_KIND = 'fsb-lattice-replay-checkpoint/v1';\n" +
      "const FSB_REPLAY_CHECKPOINT_CATALOG_KEY = 'fsbLatticeReplayCheckpointRunsV2';\n" +
      "const FSB_REPLAY_TERMINAL_STATUSES = new Set(['replay_completed', 'replay_failed', 'replay_stopped']);\n" +
      declarationSource(background, 'fsbReplayReleaseAgentId') + '\n' +
      declarationSource(background, 'fsbReplayReleaseRecoveredTerminalAgent') + '\n' +
      declarationSource(background, 'fsbReplayCleanupFailedRecovery') + '\n' +
      declarationSource(background, 'fsbRestoreLatticeReplayCheckpoints') + '\n' +
      'this.restoreReplayCheckpoints = fsbRestoreLatticeReplayCheckpoints;',
    context,
    { filename: 'extension/background.js' }
  );

  return {
    calls,
    restoreReplayCheckpoints: context.restoreReplayCheckpoints,
    storedRun() {
      return JSON.parse(JSON.stringify(storedLogs[sourceSessionId].replay.lastRun));
    }
  };
}

test('a terminalized recovery failure never reclaims again on the next wake', async () => {
  const harness = makeTerminalRecoveryHarness();

  await harness.restoreReplayCheckpoints();
  assert.equal(harness.storedRun().status, 'replay_failed');
  assert.equal(harness.calls.localSets, 1);
  assert.equal(harness.calls.warnings, 1);
  assert.equal(harness.calls.clears, 1);
  assert.equal(harness.calls.reclaims, 0);
  assert.deepEqual(harness.calls.releaseAttempts, [
    { agentId: 'agent-terminal-test', reason: 'replay_recovery_failed' }
  ]);
  assert.deepEqual(harness.calls.events, ['release', 'clear']);

  await harness.restoreReplayCheckpoints();
  assert.equal(harness.calls.localSets, 1, 'terminal retry must not rewrite the failure');
  assert.equal(harness.calls.warnings, 1, 'terminal retry must not log another recovery failure');
  assert.equal(harness.calls.clears, 1, 'the cleared checkpoint is absent on the next wake');
  assert.equal(harness.calls.releaseAttempts.length, 1, 'ownership was released before the first clear');
  assert.equal(harness.calls.reclaims, 0);
});

test('terminal replay recovery releases persisted ownership before deleting its snapshot', async () => {
  const harness = makeTerminalRecoveryHarness({
    initialStatus: 'replay_completed',
    agentAlreadyReleased: true
  });

  await harness.restoreReplayCheckpoints();

  assert.deepEqual(harness.calls.releaseAttempts, [
    { agentId: 'agent-terminal-test', reason: 'replay_terminal' }
  ]);
  assert.deepEqual(harness.calls.events, ['release', 'clear']);
  assert.equal(harness.calls.clears, 1);
  assert.equal(harness.calls.reclaims, 0);
  assert.equal(harness.calls.localSets, 0);
});

test('terminal replay recovery retains its snapshot until ownership release succeeds', async () => {
  const harness = makeTerminalRecoveryHarness({
    initialStatus: 'replay_failed',
    failReleaseCount: 1
  });

  await harness.restoreReplayCheckpoints();
  assert.equal(harness.calls.clears, 0);
  assert.equal(harness.calls.reclaims, 0);
  assert.deepEqual(harness.calls.events, ['release-failed']);

  await harness.restoreReplayCheckpoints();
  assert.equal(harness.calls.clears, 1);
  assert.equal(harness.calls.reclaims, 0);
  assert.equal(harness.calls.releaseAttempts.length, 2);
  assert.deepEqual(harness.calls.events, ['release-failed', 'release', 'clear']);
});

test('terminal replay recovery retains its snapshot while the ownership registry is unavailable', async () => {
  const harness = makeTerminalRecoveryHarness({
    initialStatus: 'replay_stopped',
    registryUnavailable: true
  });

  await harness.restoreReplayCheckpoints();

  assert.equal(harness.calls.clears, 0);
  assert.equal(harness.calls.reclaims, 0);
  assert.deepEqual(harness.calls.releaseAttempts, []);
  assert.deepEqual(harness.calls.events, []);
});

test('terminal replay recovery retains its snapshot when the registry refuses a live agent release', async () => {
  const harness = makeTerminalRecoveryHarness({
    initialStatus: 'replay_completed',
    releaseRefused: true
  });

  await harness.restoreReplayCheckpoints();

  assert.equal(harness.calls.clears, 0);
  assert.equal(harness.calls.reclaims, 0);
  assert.deepEqual(harness.calls.releaseAttempts, [
    { agentId: 'agent-terminal-test', reason: 'replay_terminal' }
  ]);
  assert.deepEqual(harness.calls.events, ['release']);
});

test('a failed terminal persistence retains the recovery checkpoint for the next wake', async () => {
  const harness = makeTerminalRecoveryHarness({ failLocalSet: true });

  await harness.restoreReplayCheckpoints();
  assert.equal(harness.storedRun().status, 'running');
  assert.equal(harness.calls.localSets, 1);
  assert.equal(harness.calls.warnings, 1);
  assert.equal(harness.calls.clears, 0);
  assert.equal(harness.calls.reclaims, 0);

  await harness.restoreReplayCheckpoints();
  assert.equal(harness.storedRun().status, 'running');
  assert.equal(harness.calls.localSets, 2, 'the next wake retries terminal persistence');
  assert.equal(harness.calls.warnings, 2, 'the retained checkpoint is retried on the next wake');
  assert.equal(harness.calls.clears, 0, 'the checkpoint remains until terminal state is durable');
  assert.equal(harness.calls.reclaims, 0, 'manifest failure occurs before tab reclaim');
});

function makeRegisteredRecoveryFailureHarness(options = {}) {
  const replaySessionId = 'replay-registered-test';
  const sourceSessionId = 'source-registered-test';
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const initialRun = options.journalRun || { id: replaySessionId, status: 'running', steps: [] };
  let storedLogs = {
    [sourceSessionId]: {
      replay: { lastRun: clone(initialRun) }
    }
  };
  let builtSession = null;
  let keepAliveRunning = false;
  let agentPresent = true;
  const activeSessions = new Map();
  const calls = {
    clears: 0,
    cleanups: 0,
    localSets: 0,
    reclaims: 0,
    reclaimStates: [],
    releases: [],
    executions: 0,
    starts: 0,
    stops: 0,
    warnings: 0
  };
  const snapshot = {
    kind: 'survivability-snapshot',
    capturedAt: '2026-08-10T00:00:00.000Z',
    payload: JSON.stringify({
      kind: 'fsb-lattice-replay-checkpoint/v1',
      replaySessionId,
      originalSessionId: sourceSessionId,
      manifestHash: 'current-manifest-hash',
      targetTabId: 101,
      logicalTabs: [{ logicalTab: 'primary', tabId: 101, expectedOrigin: 'https://example.com' }],
      approvedScopes: [],
      nextStep: 0
    })
  };
  const context = {
    chrome: {
      storage: {
        session: { async get(key) { return { [key]: [replaySessionId] }; } },
        local: {
          async get() { return { fsbSessionLogs: clone(storedLogs) }; },
          async set(value) {
            calls.localSets++;
            if (options.failLocalSet === true) throw new Error('local storage write failed');
            storedLogs = clone(value.fsbSessionLogs);
          }
        }
      }
    },
    FsbLatticeRuntimeAdapter: {
      createFsbLatticeRuntimeAdapter() {
        return { async loadLatestSnapshot() { return snapshot; } };
      }
    },
    FsbLatticeReplay: {
      async persistReplayRun(sessionId, run) {
        assert.equal(sessionId, sourceSessionId);
        calls.localSets++;
        if (options.failLocalSet === true) throw new Error('local storage write failed');
        storedLogs[sourceSessionId].replay.lastRun = clone(run);
        return true;
      }
    },
    fsbReplayClone(value, fallback) {
      return value == null ? fallback : clone(value);
    },
    activeSessions,
    fsbAgentRegistryInstance: {
      hasAgent(agentId) {
        return agentId === 'agent-recovered' && agentPresent;
      },
      async releaseAgent(agentId, reason) {
        calls.releases.push({ agentId, reason });
        if (options.releaseThrows === true) throw new Error('registry persistence failed');
        if (!agentPresent) return false;
        agentPresent = false;
        return true;
      }
    },
    async prepareSessionReplay() {
      return {
        receiptCid: 'source-receipt',
        replay: {
          manifestHash: 'current-manifest-hash',
          lastRun: clone(storedLogs[sourceSessionId].replay.lastRun)
        },
        steps: [
          { id: 'step-1', index: 0, tool: 'open_tab', replay: { risk: 'navigation' } },
          { id: 'step-2', index: 1, tool: 'click', replay: { risk: 'write' } }
        ],
        tabs: [{ id: 'primary', startUrl: 'https://example.com/start' }]
      };
    },
    fsbReplayAssertExecutablePreparation() {},
    async fsbReplayReclaimOwnedTabs(state) {
      calls.reclaims++;
      calls.reclaimStates.push(clone(state));
      const targetTabId = Number.isFinite(state.targetTabId) ? state.targetTabId : 101;
      const logicalTabs = Array.isArray(state.logicalTabs) ? state.logicalTabs : [];
      const replayTabs = {};
      logicalTabs.forEach((tab) => { replayTabs[tab.logicalTab || 'primary'] = clone(tab); });
      return {
        owned: {
          tab: { id: targetTabId, url: state.expectedOrigin || 'https://example.com/start' },
          agentId: 'agent-recovered',
          ownershipToken: 'ownership-token'
        },
        replayTabs,
        bootstrapLogicalTab: logicalTabs.find((tab) => tab.tabId === targetTabId)?.logicalTab || 'primary'
      };
    },
    fsbReplayBuildSession(prepared, id, owned, _scopes, priorRun) {
      builtSession = {
        replaySessionId: id,
        replayAgentId: owned.agentId,
        status: 'replaying',
        replayRun: priorRun,
        replaySteps: prepared.steps,
        currentStep: 0,
        _latticeAdapter: {
          async resume() { throw new Error('resume failed after registration'); }
        }
      };
      return builtSession;
    },
    fsbReplayLogicalTab() { return 'primary'; },
    fsbReplayOrigin() { return 'https://example.com'; },
    async fsbReplayClearRecoverySnapshots(id) {
      assert.equal(id, replaySessionId);
      calls.clears++;
    },
    startKeepAlive() {
      calls.starts++;
      keepAliveRunning = true;
    },
    stopKeepAlive() {
      calls.stops++;
      keepAliveRunning = false;
    },
    async cleanupSession(id) {
      calls.cleanups++;
      if (options.cleanupThrows === true) throw new Error('cleanup failed');
      activeSessions.delete(id);
    },
    async fsbReplayPauseForDecision() {},
    async fsbReplayFinalize() {},
    fsbReplayStartExecution() { calls.executions++; },
    automationLogger: { warn() { calls.warnings++; } }
  };
  vm.createContext(context);
  vm.runInContext(
    "const FSB_REPLAY_CHECKPOINT_KIND = 'fsb-lattice-replay-checkpoint/v1';\n" +
      "const FSB_REPLAY_CHECKPOINT_CATALOG_KEY = 'fsbLatticeReplayCheckpointRunsV2';\n" +
      "const FSB_REPLAY_TERMINAL_STATUSES = new Set(['replay_completed', 'replay_failed', 'replay_stopped']);\n" +
      'const FSB_REPLAY_LEGACY_TOOL_MAP = Object.freeze({});\n' +
      declarationSource(background, 'fsbReplayReleaseAgentId') + '\n' +
      declarationSource(background, 'fsbReplayReleaseAgent') + '\n' +
      declarationSource(background, 'fsbReplayCleanupFailedRecovery') + '\n' +
      declarationSource(background, 'fsbRestoreLatticeReplayCheckpoints') + '\n' +
      'this.restoreReplayCheckpoints = fsbRestoreLatticeReplayCheckpoints;',
    context,
    { filename: 'extension/background.js' }
  );

  return {
    activeSessions,
    calls,
    restoreReplayCheckpoints: context.restoreReplayCheckpoints,
    builtSession() { return builtSession; },
    isKeepAliveRunning() { return keepAliveRunning; },
    storedRun() { return clone(storedLogs[sourceSessionId].replay.lastRun); }
  };
}

test('journal-advanced recovery reclaims the topology committed with the cursor', async () => {
  const harness = makeRegisteredRecoveryFailureHarness({
    journalRun: {
      id: 'replay-registered-test',
      status: 'running',
      nextStep: 1,
      previousReceiptCid: 'receipt-after-open-tab',
      targetTabId: 202,
      expectedOrigin: 'https://two.example',
      logicalTabs: [
        { logicalTab: 'primary', tabId: 101, expectedOrigin: 'https://example.com' },
        { logicalTab: 'tab-2', tabId: 202, expectedOrigin: 'https://two.example' }
      ],
      steps: [{ stepId: 'step-1', index: 0, tool: 'open_tab', success: true }]
    }
  });

  await harness.restoreReplayCheckpoints();

  assert.equal(harness.calls.reclaims, 1);
  assert.equal(harness.calls.executions, 1);
  assert.equal(harness.calls.warnings, 0);
  assert.equal(harness.calls.reclaimStates[0].targetTabId, 202);
  assert.deepEqual(harness.calls.reclaimStates[0].logicalTabs, [
    { logicalTab: 'primary', tabId: 101, expectedOrigin: 'https://example.com' },
    { logicalTab: 'tab-2', tabId: 202, expectedOrigin: 'https://two.example' }
  ]);
  assert.equal(harness.builtSession().currentStep, 1);
  assert.equal(harness.builtSession().replayTabs['tab-2'].tabId, 202);
  assert.equal(harness.activeSessions.size, 1);
});

test('post-registration recovery failure releases ownership despite cleanup errors', async () => {
  const harness = makeRegisteredRecoveryFailureHarness({ cleanupThrows: true });

  await harness.restoreReplayCheckpoints();
  assert.equal(harness.builtSession().status, 'replay_failed');
  assert.equal(harness.builtSession().replayRun.status, 'replay_failed');
  assert.deepEqual(harness.calls.releases, [
    { agentId: 'agent-recovered', reason: 'replay_terminal' }
  ]);
  assert.equal(harness.calls.cleanups, 1);
  assert.equal(harness.activeSessions.size, 0, 'fallback removal must prevent a zombie session');
  assert.equal(harness.isKeepAliveRunning(), false);
  assert.equal(harness.calls.stops, 1);
  assert.equal(harness.storedRun().status, 'replay_failed');
  assert.equal(harness.calls.clears, 1);
});

test('post-registration persistence failure cleans runtime ownership but retains snapshot', async () => {
  const harness = makeRegisteredRecoveryFailureHarness({ failLocalSet: true });

  await harness.restoreReplayCheckpoints();
  assert.equal(harness.builtSession().status, 'replay_failed');
  assert.equal(harness.activeSessions.size, 0);
  assert.equal(harness.isKeepAliveRunning(), false);
  assert.deepEqual(harness.calls.releases, [
    { agentId: 'agent-recovered', reason: 'replay_terminal' }
  ]);
  assert.equal(harness.storedRun().status, 'running');
  assert.equal(harness.calls.localSets, 1);
  assert.equal(harness.calls.clears, 0, 'non-durable terminal state must retain recovery data');
});

test('post-registration release persistence failure cleans runtime state but retains snapshot', async () => {
  const harness = makeRegisteredRecoveryFailureHarness({ releaseThrows: true });

  await harness.restoreReplayCheckpoints();
  assert.equal(harness.builtSession().status, 'replay_failed');
  assert.equal(harness.activeSessions.size, 0);
  assert.equal(harness.isKeepAliveRunning(), false);
  assert.deepEqual(harness.calls.releases, [
    { agentId: 'agent-recovered', reason: 'replay_terminal' }
  ]);
  assert.equal(harness.storedRun().status, 'replay_failed');
  assert.equal(harness.calls.clears, 0, 'ownership persistence failure must retain recovery data');
});
