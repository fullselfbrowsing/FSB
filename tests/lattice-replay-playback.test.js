'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const background = fs.readFileSync(
  path.resolve(__dirname, '..', 'extension', 'background.js'),
  'utf8'
);
const overlayStateUtils = require(path.resolve(
  __dirname,
  '..',
  'extension',
  'utils',
  'overlay-state.js'
));

function declarationSource(source, name) {
  let start = source.indexOf('async function ' + name + '(');
  if (start === -1) start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'missing function ' + name);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = open; index < source.length; index++) {
    const char = source[index];
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
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error('unterminated function ' + name);
}

function classSource(source, name) {
  const start = source.indexOf('class ' + name);
  assert.notEqual(start, -1, 'missing class ' + name);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = open; index < source.length; index++) {
    const char = source[index];
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
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error('unterminated class ' + name);
}

function makeTimelineApi() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    "const FSB_REPLAY_LEGACY_TOOL_MAP = Object.freeze({});\n" +
      'const FSB_REPLAY_LEAD_IN_MS = 750;\n' +
      'const FSB_REPLAY_TAIL_MS = 750;\n' +
      'const FSB_REPLAY_MAX_RECORDED_GAP_MS = 30000;\n' +
      'const FSB_REPLAY_SPEEDS = Object.freeze([0.5, 1, 2, 4]);\n' +
      declarationSource(background, 'getReplayDelay') + '\n' +
      declarationSource(background, 'fsbReplayNormalizeSpeed') + '\n' +
      declarationSource(background, 'fsbReplayBuildTimeline') + '\n' +
      'this.api = { buildTimeline: fsbReplayBuildTimeline, normalizeSpeed: fsbReplayNormalizeSpeed };',
    context,
    { filename: 'extension/background.js' }
  );
  return context.api;
}

test('recorded timestamps pace replay steps with a visible lead-in and bounded idle gaps', () => {
  const api = makeTimelineApi();
  const timeline = JSON.parse(JSON.stringify(api.buildTimeline([
    { tool: 'click', timestamp: 1000 },
    { tool: 'type_text', timestamp: 3000 },
    { tool: 'click', timestamp: 93000 }
  ])));
  assert.deepEqual(timeline.offsets, [750, 2750, 32750]);
  assert.equal(timeline.durationMs, 33500);
});

test('missing or non-monotonic timestamps use the existing tool-aware replay delay', () => {
  const api = makeTimelineApi();
  const timeline = JSON.parse(JSON.stringify(api.buildTimeline([
    { tool: 'click', timestamp: 5000 },
    { tool: 'type_text', timestamp: null },
    { tool: 'navigate', timestamp: 4000 }
  ])));
  assert.deepEqual(timeline.offsets, [750, 1250, 1550]);
});

test('only the four player speeds are accepted', () => {
  const api = makeTimelineApi();
  assert.equal(api.normalizeSpeed(0.5), 0.5);
  assert.equal(api.normalizeSpeed('2'), 2);
  assert.equal(api.normalizeSpeed(4), 4);
  assert.equal(api.normalizeSpeed(3), 1);
  assert.equal(api.normalizeSpeed('fast'), 1);
});

function makePageLoadWatcherHarness(options = {}) {
  const listeners = new Set();
  let listenerArmedAtGet = false;
  const context = {
    chrome: {
      tabs: {
        onUpdated: {
          addListener(listener) { listeners.add(listener); },
          removeListener(listener) { listeners.delete(listener); }
        },
        async get(tabId) {
          listenerArmedAtGet = listeners.size > 0;
          if (options.emitCompleteDuringGet === true) {
            listeners.forEach((listener) => listener(tabId, { status: 'complete' }));
          }
          if (options.getError) throw options.getError;
          return { id: tabId, status: options.status || 'loading' };
        }
      }
    },
    clearTimeout,
    setTimeout,
    Date,
    Error,
    Map,
    Promise
  };
  vm.createContext(context);
  vm.runInContext(
    classSource(background, 'PageLoadWatcher') + '\n' +
      'this.watcher = new PageLoadWatcher();',
    context,
    { filename: 'extension/background.js' }
  );
  return {
    watcher: context.watcher,
    listenerCount: () => listeners.size,
    listenerArmedAtGet: () => listenerArmedAtGet
  };
}

test('tab completion cannot be missed between the status read and listener registration', async () => {
  const harness = makePageLoadWatcherHarness({ emitCompleteDuringGet: true });

  await harness.watcher.waitForTabComplete(91, 50);

  assert.equal(harness.listenerArmedAtGet(), true);
  assert.equal(harness.listenerCount(), 0);
});

test('an already-complete tab resolves and removes its completion listener', async () => {
  const harness = makePageLoadWatcherHarness({ status: 'complete' });

  await harness.watcher.waitForTabComplete(92, 50);

  assert.equal(harness.listenerArmedAtGet(), true);
  assert.equal(harness.listenerCount(), 0);
});

test('tab completion timeout and status-read errors both remove their listeners', async () => {
  const timeoutHarness = makePageLoadWatcherHarness();
  await assert.rejects(
    () => timeoutHarness.watcher.waitForTabComplete(93, 10),
    /Tab load timeout/
  );
  assert.equal(timeoutHarness.listenerCount(), 0);

  const errorHarness = makePageLoadWatcherHarness({ getError: new Error('Tab is gone') });
  await assert.rejects(
    () => errorHarness.watcher.waitForTabComplete(94, 50),
    /Tab is gone/
  );
  assert.equal(errorHarness.listenerCount(), 0);
});

function makeClosedReplayTabHandler() {
  const context = { Number };
  vm.createContext(context);
  vm.runInContext(
    declarationSource(background, 'fsbReplayHandleClosedTab') + '\n' +
      'this.handleClosedTab = fsbReplayHandleClosedTab;',
    context,
    { filename: 'extension/background.js' }
  );
  return context.handleClosedTab;
}

test('closing the primary replay tab hands the session to a surviving owned tab', () => {
  const handleClosedTab = makeClosedReplayTabHandler();
  const session = {
    isReplay: true,
    status: 'replaying',
    tabId: 71,
    expectedOrigin: 'https://primary.example',
    ownershipToken: 'primary-token',
    replayTabs: {
      primary: {
        logicalTab: 'primary',
        tabId: 71,
        expectedOrigin: 'https://primary.example',
        ownershipToken: 'primary-token'
      },
      secondary: {
        logicalTab: 'secondary',
        tabId: 72,
        expectedOrigin: 'https://secondary.example',
        ownershipToken: 'secondary-token'
      }
    }
  };

  assert.equal(handleClosedTab(session, 71), true);
  assert.equal(session.replayTabs.primary.closed, true);
  assert.equal(session.replayTabs.primary.ownershipToken, null);
  assert.equal(session.tabId, 72);
  assert.equal(session.expectedOrigin, 'https://secondary.example');
  assert.equal(session.ownershipToken, 'secondary-token');
  assert.equal(session.status, 'replaying');
  assert.equal(handleClosedTab(session, 71), true, 'repeated tab-removal delivery remains idempotent');
  assert.equal(session.tabId, 72);
});

test('closing the last replay tab leaves a paused session alive without a tab target', () => {
  const handleClosedTab = makeClosedReplayTabHandler();
  const session = {
    isReplay: true,
    status: 'replay_paused',
    tabId: 81,
    expectedOrigin: 'https://only.example',
    ownershipToken: 'only-token',
    replayTabs: {
      primary: {
        logicalTab: 'primary',
        tabId: 81,
        expectedOrigin: 'https://only.example',
        ownershipToken: 'only-token'
      }
    }
  };

  assert.equal(handleClosedTab(session, 81), true);
  assert.equal(session.replayTabs.primary.closed, true);
  assert.equal(session.tabId, null);
  assert.equal(session.expectedOrigin, null);
  assert.equal(session.ownershipToken, null);
  assert.equal(session.status, 'replay_paused');
});

function makeFreshReplayTabHarness(options = {}) {
  const events = [];
  const removedTabs = [];
  const releasedAgents = [];
  const injected = options.injected !== false;
  const tabId = 91;
  const context = {
    FSB_REPLAY_TAB_LOAD_TIMEOUT_MS: 30000,
    pageLoadWatcher: {
      async waitForTabComplete(receivedTabId, timeout) {
        events.push(`load:${receivedTabId}:${timeout}`);
      },
      async waitForPageReady() {
        events.push('invalid-pre-injection-health-check');
        throw new Error('waitForPageReady must not run before injection');
      }
    },
    async ensureContentScriptInjected(receivedTabId) {
      events.push(`inject:${receivedTabId}`);
      return injected;
    },
    fsbAgentRegistryReady: Promise.resolve(),
    fsbAgentRegistryInstance: {
      async registerAgent() {
        events.push('register');
        return { agentId: 'agent-replay' };
      },
      async bindTab(agentId, receivedTabId) {
        events.push(`bind:${agentId}:${receivedTabId}`);
        return { success: true, ownershipToken: 'owned-token' };
      },
      async releaseAgent(agentId, reason) {
        events.push(`release:${agentId}:${reason}`);
        releasedAgents.push(agentId);
      }
    },
    chrome: {
      tabs: {
        async create({ url, active }) {
          events.push(`create:${url}:${active}`);
          return { id: tabId, url, status: 'loading' };
        },
        async get(receivedTabId) {
          events.push(`get:${receivedTabId}`);
          return { id: receivedTabId, url: 'https://example.com/start', status: 'complete' };
        },
        async remove(receivedTabId) {
          events.push(`remove:${receivedTabId}`);
          removedTabs.push(receivedTabId);
        }
      }
    },
    Date,
    Error,
    Math,
    Number,
    Promise,
    setTimeout
  };
  vm.createContext(context);
  vm.runInContext(
    declarationSource(background, 'fsbReplayWaitForTab') + '\n' +
      declarationSource(background, 'fsbReplayCreateOwnedTab') + '\n' +
      'this.createOwnedTab = fsbReplayCreateOwnedTab;',
    context,
    { filename: 'extension/background.js' }
  );
  return {
    createOwnedTab: context.createOwnedTab,
    events,
    removedTabs,
    releasedAgents,
    tabId
  };
}

test('fresh replay tabs finish loading before content injection and then proceed', async () => {
  const harness = makeFreshReplayTabHarness();
  const owned = await harness.createOwnedTab('https://example.com/start');

  assert.equal(owned.tab.id, harness.tabId);
  assert.equal(owned.agentId, 'agent-replay');
  assert.equal(owned.ownershipToken, 'owned-token');
  assert.deepEqual(harness.events, [
    'register',
    'create:https://example.com/start:true',
    'bind:agent-replay:91',
    'load:91:30000',
    'inject:91',
    'get:91'
  ]);
  assert.deepEqual(harness.removedTabs, []);
  assert.deepEqual(harness.releasedAgents, []);
});

test('failed fresh-tab injection closes only that replay tab and releases its agent', async () => {
  const harness = makeFreshReplayTabHarness({ injected: false });

  await assert.rejects(
    () => harness.createOwnedTab('https://example.com/start'),
    /Replay tab content script did not become ready/
  );
  assert.equal(harness.events.includes('invalid-pre-injection-health-check'), false);
  assert.deepEqual(harness.removedTabs, [harness.tabId]);
  assert.deepEqual(harness.releasedAgents, ['agent-replay']);
  assert.deepEqual(harness.events.slice(-2), [
    'remove:91',
    'release:agent-replay:replay_start_failed'
  ]);
});

test('an in-flight wait never rolls back a newer forward seek position', async () => {
  const session = {
    replaySessionId: 'replay-wait-test',
    status: 'replaying',
    playback: { paused: false, speed: 1, positionMs: 0, timeline: [100], _wake: null }
  };
  const context = {
    activeSessions: new Map([[session.replaySessionId, session]]),
    fsbReplayNormalizeSpeed(value) { return Number(value) || 1; },
    fsbReplayActionLabel() { return 'Clicking element'; },
    fsbReplayBroadcastProgress() {},
    setTimeout,
    clearTimeout,
    Date,
    Promise,
    Number,
    Math
  };
  vm.createContext(context);
  vm.runInContext(
    'const FSB_REPLAY_CLOCK_TICK_MS = 250;\n' +
      declarationSource(background, 'fsbReplayWakePlayback') + '\n' +
      declarationSource(background, 'fsbReplayWaitForWake') + '\n' +
      declarationSource(background, 'fsbReplayWaitForPlayback') + '\n' +
      'this.waitForPlayback = fsbReplayWaitForPlayback; this.wakePlayback = fsbReplayWakePlayback;',
    context,
    { filename: 'extension/background.js' }
  );

  const waiting = context.waitForPlayback(session, { tool: 'click' }, 0);
  await new Promise((resolve) => setTimeout(resolve, 10));
  session.playback.positionMs = 200;
  context.wakePlayback(session);
  assert.equal(await waiting, true);
  assert.equal(session.playback.positionMs, 200);
});

test('replay overlay broadcast waits for every owned tab delivery', async () => {
  const deliveries = [];
  const resolvers = [];
  const context = {
    fsbReplayOverlayTabIds() { return [71, 72]; },
    fsbReplayPlaybackStatus() { return 'playing'; },
    fsbReplayNormalizeSpeed(value) { return Number(value) || 1; },
    fsbReplayActionLabel() { return 'Clicking element'; },
    sendSessionStatus(tabId, statusData) {
      deliveries.push({ tabId, statusData });
      return new Promise((resolve) => resolvers.push(resolve));
    },
    Promise,
    Number,
    Math
  };
  vm.createContext(context);
  vm.runInContext(
    declarationSource(background, 'fsbReplayBroadcastOverlay') + '\n' +
      'this.broadcast = fsbReplayBroadcastOverlay;',
    context,
    { filename: 'extension/background.js' }
  );

  const session = {
    replaySessionId: 'replay-overlay-test',
    replayAgentId: 'agent-replay',
    task: 'Replay a task',
    totalSteps: 2,
    playback: { speed: 1, positionMs: 100, durationMs: 500 }
  };
  let settled = false;
  const pending = context.broadcast(
    session,
    { tool: 'click' },
    0,
    'Replay complete',
    { status: 'completed', phase: 'complete', result: 'success' }
  ).then(() => { settled = true; });

  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[0].statusData.lifecycle, 'final');
  resolvers[0]();
  await Promise.resolve();
  assert.equal(settled, false);
  resolvers[1]();
  await pending;
  assert.equal(settled, true);
});

test('replay overlay uses ordinary session presentation with a Replay-only badge', async () => {
  const deliveries = [];
  const context = {
    fsbReplayOverlayTabIds() { return [71]; },
    fsbReplayPlaybackStatus() { return 'playing'; },
    fsbReplayNormalizeSpeed(value) { return Number(value) || 1; },
    fsbReplayActionLabel() { return 'Clicking element'; },
    async sendSessionStatus(tabId, statusData) {
      deliveries.push({ tabId, statusData });
    },
    Promise,
    Number,
    Math
  };
  vm.createContext(context);
  vm.runInContext(
    declarationSource(background, 'fsbReplayBroadcastOverlay') + '\n' +
      'this.broadcast = fsbReplayBroadcastOverlay;',
    context,
    { filename: 'extension/background.js' }
  );

  const session = {
    replaySessionId: 'replay-overlay-presentation',
    replayAgentId: 'agent_replay_internal_only',
    task: 'Replay a task',
    totalSteps: 2,
    playback: { speed: 1, positionMs: 100, durationMs: 500 }
  };
  await context.broadcast(session, { tool: 'click' }, 0);

  assert.equal(deliveries.length, 1);
  const statusData = deliveries[0].statusData;
  assert.equal(statusData.clientLabel, 'Replay');
  assert.equal(Object.prototype.hasOwnProperty.call(statusData, 'agentId'), false);
  assert.equal(statusData.stoppable, false);
  assert.equal(statusData.progress.label, '');
  assert.equal(statusData.progress.percent, 20);
  assert.equal(statusData.replay.currentStep, 1);
  assert.equal(statusData.replay.totalSteps, 2);

  const overlayState = overlayStateUtils.buildOverlayState(statusData, null);
  assert.equal(overlayState.clientLabel, 'Replay');
  assert.equal(Object.prototype.hasOwnProperty.call(overlayState, 'agentIdShort'), false);
  assert.equal(overlayState.stoppable, false);
  assert.equal(overlayState.progress.label, 'Acting…');
  assert.equal(overlayState.display.title, 'Replay a task');
  assert.equal(overlayState.display.detail, 'Clicking element');
});

test('replay finalization waits for the terminal overlay and preserves it during cleanup', async () => {
  let releaseTerminalOverlay;
  let overlayStarted = false;
  const cleanupCalls = [];
  const events = [];
  const context = {
    FSB_REPLAY_TERMINAL_STATUSES: new Set(['replay_completed', 'replay_failed', 'replay_stopped']),
    fsbReplayWakePlayback() {},
    async fsbReplayPersistRun() { events.push('persist'); },
    fsbReplayBroadcastOverlay() {
      overlayStarted = true;
      events.push('overlay');
      return new Promise((resolve) => { releaseTerminalOverlay = resolve; });
    },
    async fsbReplayReleaseAgent() { events.push('release'); return true; },
    async fsbBroadcastAutomationLifecycle() {},
    automationLogger: { logSessionEnd() {} },
    async cleanupSession(sessionId, options) {
      events.push('cleanup');
      cleanupCalls.push({ sessionId, options });
    },
    Date,
    Promise,
    Math,
    Set,
    String,
    Error
  };
  vm.createContext(context);
  vm.runInContext(
    declarationSource(background, 'fsbReplayFinalize') + '\n' +
      'this.finalize = fsbReplayFinalize;',
    context,
    { filename: 'extension/background.js' }
  );

  const session = {
    replaySessionId: 'replay-finalize-test',
    originalSessionId: 'recorded-session',
    tabId: 71,
    status: 'replaying',
    currentStep: 1,
    totalSteps: 1,
    replaySteps: [{ tool: 'click' }],
    replayRun: { steps: [{ status: 'executed', success: true }] },
    playback: { paused: false, positionMs: 10, durationMs: 10 },
    actionHistory: [],
    startTime: Date.now(),
    _latticeAdapter: {
      async clearSnapshots() { events.push('clear'); }
    }
  };
  const pending = context.finalize(session, 'replay_completed', null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(overlayStarted, true);
  assert.equal(cleanupCalls.length, 0);
  assert.deepEqual(events, ['persist', 'overlay']);

  releaseTerminalOverlay();
  await pending;
  assert.deepEqual(events, ['persist', 'overlay', 'release', 'clear', 'cleanup']);
  assert.equal(cleanupCalls.length, 1);
  assert.equal(cleanupCalls[0].sessionId, session.replaySessionId);
  assert.equal(cleanupCalls[0].options.preserveFinalOverlay, true);
});

test('replay finalization retains snapshots when ownership release is not durable', async () => {
  let clears = 0;
  let cleanups = 0;
  const context = {
    fsbReplayWakePlayback() {},
    async fsbReplayPersistRun() {},
    async fsbReplayBroadcastOverlay() {},
    async fsbReplayReleaseAgent() { return false; },
    async fsbBroadcastAutomationLifecycle() {},
    automationLogger: { logSessionEnd() {} },
    async cleanupSession() { cleanups++; },
    Date,
    Promise,
    Math,
    String
  };
  vm.createContext(context);
  vm.runInContext(
    declarationSource(background, 'fsbReplayFinalize') + '\n' +
      'this.finalize = fsbReplayFinalize;',
    context,
    { filename: 'extension/background.js' }
  );

  await context.finalize({
    replaySessionId: 'replay-release-failed',
    originalSessionId: 'recorded-session',
    tabId: 71,
    status: 'replaying',
    currentStep: 0,
    totalSteps: 1,
    replaySteps: [{ tool: 'click' }],
    replayRun: { steps: [] },
    playback: { paused: false, positionMs: 0, durationMs: 10 },
    actionHistory: [],
    startTime: Date.now(),
    _latticeAdapter: { async clearSnapshots() { clears++; } }
  }, 'replay_failed', new Error('failed'));

  assert.equal(clears, 0);
  assert.equal(cleanups, 1, 'runtime cleanup continues while the snapshot is retained');
});

test('failed replay startup releases ownership before clearing its snapshot', async () => {
  const events = [];
  const context = {
    async fsbReplayPersistRun() { events.push('persist'); },
    async fsbReplayReleaseAgent(_session, reason) {
      events.push('release:' + reason);
      return true;
    },
    async fsbReplayReleaseAgentId() { throw new Error('unexpected fallback release'); },
    async cleanupSession() { events.push('cleanup'); },
    chrome: { tabs: { async remove() { events.push('remove-tab'); } } },
    Date,
    Number,
    String
  };
  vm.createContext(context);
  vm.runInContext(
    declarationSource(background, 'fsbReplayAbortFailedStart') + '\n' +
      'this.abortFailedStart = fsbReplayAbortFailedStart;',
    context,
    { filename: 'extension/background.js' }
  );

  const session = {
    replaySessionId: 'replay-start-failed',
    replayRun: {},
    _latticeAdapter: { async clearSnapshots() { events.push('clear'); } }
  };
  await context.abortFailedStart({ tab: { id: 72 } }, session, new Error('startup failed'));

  assert.deepEqual(events, [
    'persist',
    'release:replay_start_failed',
    'clear',
    'cleanup',
    'remove-tab'
  ]);
});

function makeControlHarness() {
  const session = {
    replaySessionId: 'replay-player-test',
    isReplay: true,
    status: 'replaying',
    currentStep: 1,
    totalSteps: 3,
    replaySteps: [{ tool: 'click' }, { tool: 'type_text' }, { tool: 'press_enter' }],
    playback: {
      paused: false,
      speed: 1,
      positionMs: 1000,
      durationMs: 10000,
      timeline: [750, 5000, 10000]
    }
  };
  const context = {
    activeSessions: new Map([[session.replaySessionId, session]]),
    fsbReplayIsTrustedUiSender() { return false; },
    fsbReplayOverlayTabIds() { return [77]; },
    fsbReplayWakePlayback() {},
    async fsbReplayPersistRun() {},
    fsbReplayBroadcastProgress() {},
    fsbReplayNormalizeSpeed(value) { return [0.5, 1, 2, 4].includes(Number(value)) ? Number(value) : 1; },
    fsbReplayPlaybackSnapshot(value) {
      return {
        paused: value.playback.paused,
        speed: value.playback.speed,
        positionMs: value.playback.positionMs
      };
    }
  };
  vm.createContext(context);
  vm.runInContext(
    'const FSB_REPLAY_SPEEDS = Object.freeze([0.5, 1, 2, 4]);\n' +
      'const FSB_REPLAY_CLOCK_TICK_MS = 250;\n' +
      declarationSource(background, 'fsbReplayCanControl') + '\n' +
      declarationSource(background, 'handleReplayControl') + '\n' +
      'this.control = handleReplayControl;',
    context,
    { filename: 'extension/background.js' }
  );
  async function control(request, sender = { tab: { id: 77 } }) {
    let response;
    await context.control(
      Object.assign({ sessionId: session.replaySessionId }, request),
      sender,
      (value) => { response = value; }
    );
    return response;
  }
  return { session, control };
}

test('owned replay tabs can pause, resume, change speed, and seek forward', async () => {
  const harness = makeControlHarness();
  assert.equal((await harness.control({ command: 'pause' })).success, true);
  assert.equal(harness.session.playback.paused, true);

  assert.equal((await harness.control({ command: 'play' })).success, true);
  assert.equal(harness.session.playback.paused, false);

  assert.equal((await harness.control({ command: 'setSpeed', speed: 4 })).success, true);
  assert.equal(harness.session.playback.speed, 4);

  assert.equal((await harness.control({ command: 'seek', positionMs: 8000 })).success, true);
  assert.equal(harness.session.playback.positionMs, 8000);
});

test('replay controls reject backward seeks, unsupported speeds, and unrelated tabs', async () => {
  const harness = makeControlHarness();
  const backwards = await harness.control({ command: 'seek', positionMs: 100 });
  assert.equal(backwards.success, false);
  assert.match(backwards.error, /only seek forward/);

  const speed = await harness.control({ command: 'setSpeed', speed: 3 });
  assert.equal(speed.success, false);
  assert.match(speed.error, /0\.5x, 1x, 2x, or 4x/);

  const unrelated = await harness.control({ command: 'pause' }, { tab: { id: 88 } });
  assert.equal(unrelated.success, false);
  assert.match(unrelated.error, /owned replay tab/);
});
