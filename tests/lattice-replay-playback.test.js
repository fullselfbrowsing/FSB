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
const recorder = require(path.resolve(
  __dirname,
  '..',
  'extension',
  'utils',
  'mcp-session-recorder.js'
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
      'const FSB_REPLAY_SPEEDS = Object.freeze([0.5, 1, 2, 4, 8]);\n' +
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

test('the five player speeds are accepted and missing speeds default to 2x', () => {
  const api = makeTimelineApi();
  assert.equal(api.normalizeSpeed(0.5), 0.5);
  assert.equal(api.normalizeSpeed(1), 1);
  assert.equal(api.normalizeSpeed('2'), 2);
  assert.equal(api.normalizeSpeed(4), 4);
  assert.equal(api.normalizeSpeed(8), 8);
  assert.equal(api.normalizeSpeed(3), 2);
  assert.equal(api.normalizeSpeed('fast'), 2);
  assert.equal(api.normalizeSpeed(undefined), 2);
});

test('fresh replay sessions start at 2x while resumed sessions preserve a valid saved speed', () => {
  const context = {
    fsbReplayClone(value, fallback) {
      return JSON.parse(JSON.stringify(value === undefined ? fallback : value));
    },
    fsbReplayOrigin(value) {
      return value ? new URL(value).origin : '';
    },
    Date,
    URL
  };
  vm.createContext(context);
  vm.runInContext(
    'const FSB_REPLAY_CHECKPOINT_CATALOG_KEY = "replay-checkpoints";\n' +
      'const FSB_REPLAY_LEGACY_TOOL_MAP = Object.freeze({});\n' +
      'const FSB_REPLAY_LEAD_IN_MS = 750;\n' +
      'const FSB_REPLAY_TAIL_MS = 750;\n' +
      'const FSB_REPLAY_MAX_RECORDED_GAP_MS = 30000;\n' +
      'const FSB_REPLAY_SPEEDS = Object.freeze([0.5, 1, 2, 4, 8]);\n' +
      declarationSource(background, 'getReplayDelay') + '\n' +
      declarationSource(background, 'fsbReplayNormalizeSpeed') + '\n' +
      declarationSource(background, 'fsbReplayBuildTimeline') + '\n' +
      declarationSource(background, 'fsbReplayBuildSession') + '\n' +
      'this.buildSession = fsbReplayBuildSession;',
    context,
    { filename: 'extension/background.js' }
  );

  const prepared = {
    sessionId: 'recorded-session',
    startUrl: 'https://example.test/start',
    tabs: [],
    steps: [{ id: 'step-1', tool: 'click' }],
    replay: { manifest: { task: 'Default speed' }, manifestHash: 'manifest-hash' },
    receiptCid: 'source-receipt',
    resultProjectionByStepId: {}
  };
  const owned = {
    agentId: 'replay-agent',
    ownershipToken: 'ownership-token',
    tab: { id: 77, url: prepared.startUrl }
  };

  const fresh = context.buildSession(prepared, 'fresh-replay', owned, [], null, null);
  assert.equal(fresh.playback.speed, 2);

  const resumed = context.buildSession(prepared, 'resumed-replay', owned, [], {
    nextStep: 0,
    playback: { speed: 1, positionMs: 0 }
  }, null);
  assert.equal(resumed.playback.speed, 1);
});

test('truncated replay previews remain verifiable but are inspect-only', () => {
  const context = {
    activeSessions: new Map(),
    fsbReplayBootstrapTab() {
      return { id: 'primary', startUrl: 'https://example.com/start' };
    },
    fsbReplayClone(value, fallback) {
      return JSON.parse(JSON.stringify(value === undefined ? fallback : value));
    },
    Array,
    Error,
    Map,
    Math,
    Number
  };
  vm.createContext(context);
  vm.runInContext(
    declarationSource(background, 'fsbReplayIsExecutable') + '\n' +
      declarationSource(background, 'fsbReplayIsTruncated') + '\n' +
      declarationSource(background, 'fsbReplayTruncatedMessage') + '\n' +
      declarationSource(background, 'fsbReplayAssertExecutablePreparation') + '\n' +
      declarationSource(background, 'fsbReplayPublicPreparation') + '\n' +
      'this.api = {' +
        'assertExecutable: fsbReplayAssertExecutablePreparation,' +
        'publicPreparation: fsbReplayPublicPreparation' +
      '};',
    context,
    { filename: 'extension/background.js' }
  );

  const steps = Array.from({ length: 100 }, (_, index) => ({
    id: `step-${index + 1}`,
    index,
    tool: 'click',
    success: true,
    target: { logicalTab: 'primary', origin: 'https://example.com' },
    replay: { risk: 'write', availability: 'approval-once', reason: null }
  }));
  const prepared = {
    verified: true,
    sessionId: 'source-truncated',
    startUrl: 'https://example.com/start',
    tabs: [{ id: 'primary', startUrl: 'https://example.com/start' }],
    replay: { manifestHash: 'manifest-truncated', integrity: 'verified', provenance: 'capture' },
    steps,
    counts: { total: 100, executable: 100, approvalRequired: 100, blocked: 0 },
    totalSourceSteps: 101,
    truncated: true,
    resultProjectionByStepId: { 'step-1': 'journal-action-v1' }
  };

  const preview = JSON.parse(JSON.stringify(context.api.publicPreparation(prepared)));
  assert.equal(preview.truncated, true);
  assert.equal(preview.totalSourceSteps, 101);
  assert.deepEqual(preview.counts, {
    total: 100,
    executable: 0,
    approvalRequired: 0,
    blocked: 100
  });
  assert.equal(preview.steps.length, 100);
  assert.equal(Object.prototype.hasOwnProperty.call(preview, 'resultProjectionByStepId'), false);
  assert.ok(preview.steps.every((step) =>
    step.replay.risk === 'inspect-only' && step.replay.availability === 'unsupported'
  ));
  assert.throws(
    () => context.api.assertExecutable(prepared),
    /Earlier browser state is missing.*inspect-only/s
  );

  const complete = Object.assign({}, prepared, {
    steps: steps.slice(0, 2),
    counts: { total: 2, executable: 2, approvalRequired: 2, blocked: 0 },
    totalSourceSteps: 2,
    truncated: false
  });
  assert.equal(context.api.assertExecutable(complete), complete);
  assert.equal(context.api.publicPreparation(complete).counts.executable, 2);
});

test('replay receipt persistence commits cursor, playback, and topology atomically', async () => {
  let persistenceMode = 'throw';
  const persisted = [];
  const checkpointInputs = [];
  const context = {
    FsbLatticeReplay: {
      async checkpointReplayStep(input) {
        checkpointInputs.push(JSON.parse(JSON.stringify(input)));
        let resultHash = 'live-result-hash';
        if (input.step.tool === 'click' && input.result.clicked === true && !input.result.change_report) {
          resultHash = 'recorded-result-hash';
        } else if (input.step.tool === 'mcp:read-page' && input.result.completeRead === true) {
          resultHash = 'recorded-read-result-hash';
        } else if (input.step.tool === 'legacy-action' && input.result.change_report) {
          resultHash = 'recorded-legacy-result-hash';
        }
        return {
          receiptCid: 'receipt-live-step',
          resultHash,
          receipt: { cid: 'receipt-live-step' }
        };
      },
      async persistReplayRun(sessionId, run) {
        if (persistenceMode === 'throw') throw new Error('simulated replay persistence failure');
        if (persistenceMode === 'false') return false;
        if (persistenceMode === 'null') return null;
        persisted.push({ sessionId, run: JSON.parse(JSON.stringify(run)) });
        return true;
      }
    },
    fsbMcpSessionRecorder: recorder,
    fsbReplayNormalizeSpeed(value) { return Number(value) || 1; },
    fsbReplayClone(value, fallback) {
      return JSON.parse(JSON.stringify(value === undefined ? fallback : value));
    },
    Date,
    Math,
    Number,
    Object,
    Error
  };
  vm.createContext(context);
  vm.runInContext(
    declarationSource(background, 'fsbReplayQueueMutation') + '\n' +
      declarationSource(background, 'fsbReplayPlaybackSnapshot') + '\n' +
      declarationSource(background, 'fsbReplayTopologySnapshot') + '\n' +
      declarationSource(background, 'fsbReplayPersistRun') + '\n' +
      declarationSource(background, 'fsbReplayRecordCheckpointNow') + '\n' +
      declarationSource(background, 'fsbReplayRecordCheckpoint') + '\n' +
      'this.recordCheckpoint = fsbReplayRecordCheckpoint;',
    context,
    { filename: 'extension/background.js' }
  );

  const session = {
    replaySessionId: 'replay-transactional-step',
    originalSessionId: 'source-transactional-step',
    manifestHash: 'manifest-transactional-step',
    sourceReceiptCid: 'source-receipt',
    previousReceiptCid: 'source-receipt',
    currentStep: 0,
    tabId: 71,
    expectedOrigin: 'https://primary.example',
    replayTabs: {
      primary: {
        logicalTab: 'primary', tabId: 71,
        expectedOrigin: 'https://primary.example', ownershipToken: 'secret-token'
      }
    },
    replayRun: { id: 'replay-transactional-step', status: 'running', nextStep: 0, steps: [] },
    resultProjectionByStepId: {
      'step-1': 'journal-action-v1',
      'step-2': 'journal-full-v1'
    },
    playback: {
      speed: 1, paused: false, positionMs: 100, interpolationTargetMs: 100,
      durationMs: 1000, timeline: [500]
    }
  };
  const step = { id: 'step-1', index: 0, tool: 'click', resultHash: 'recorded-result-hash' };

  await assert.rejects(
    context.recordCheckpoint(session, step, {
      success: true,
      clicked: true,
      change_report: { changedNodes: 3 }
    }, true, 'executed', {
      nextStep: 1,
      playbackPositionMs: 500
    }),
    /simulated replay persistence failure/
  );
  assert.equal(session.currentStep, 0);
  assert.equal(session.previousReceiptCid, 'source-receipt');
  assert.equal(session.replayRun.steps.length, 0);
  assert.equal(session.playback.positionMs, 100);

  for (const falseyMode of ['false', 'null']) {
    persistenceMode = falseyMode;
    await assert.rejects(
      context.recordCheckpoint(session, step, { success: true }, true, 'executed', {
        nextStep: 1,
        playbackPositionMs: 500
      }),
      /Replay run persistence is unavailable/
    );
    assert.equal(session.currentStep, 0);
    assert.equal(session.previousReceiptCid, 'source-receipt');
    assert.equal(session.replayRun.steps.length, 0);
    assert.equal(session.playback.positionMs, 100);
  }

  persistenceMode = 'success';
  await context.recordCheckpoint(session, step, {
    success: true,
    clicked: true,
    change_report: { changedNodes: 3 }
  }, true, 'executed', {
    nextStep: 1,
    playbackPositionMs: 500
  });
  assert.equal(session.currentStep, 1);
  assert.equal(session.previousReceiptCid, 'receipt-live-step');
  assert.equal(session.replayRun.steps.length, 1);
  assert.equal(session.replayRun.steps[0].match, true);
  assert.equal(session.playback.positionMs, 500);
  assert.deepEqual(checkpointInputs.at(-1).result, { success: true, clicked: true });
  assert.equal(persisted[0].run.nextStep, 1);
  assert.deepEqual(persisted[0].run.logicalTabs, [
    { logicalTab: 'primary', tabId: 71, expectedOrigin: 'https://primary.example' }
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(persisted[0].run.logicalTabs[0], 'ownershipToken'), false);

  const readStep = {
    id: 'step-2', index: 1, tool: 'mcp:read-page', resultHash: 'recorded-read-result-hash'
  };
  await context.recordCheckpoint(session, readStep, {
    success: true,
    completeRead: true,
    change_report: { retainedForRead: true }
  }, true, 'executed', { nextStep: 2 });
  assert.deepEqual(checkpointInputs.at(-1).result, {
    success: true,
    completeRead: true,
    change_report: { retainedForRead: true }
  });
  assert.equal(session.replayRun.steps.at(-1).match, true);

  const legacyStep = {
    id: 'step-3', index: 2, tool: 'legacy-action', resultHash: 'recorded-legacy-result-hash'
  };
  await context.recordCheckpoint(session, legacyStep, {
    success: true,
    change_report: { retainedForCompatibility: true }
  }, true, 'executed', { nextStep: 3 });
  assert.deepEqual(checkpointInputs.at(-1).result, {
    success: true,
    change_report: { retainedForCompatibility: true }
  });
  assert.equal(session.replayRun.steps.at(-1).match, true);
});

test('replay player interpolation stops at its anchor and accepts authoritative correction', () => {
  const context = {
    performance: { now: () => 500 },
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
    Number,
    Math,
    Promise
  };
  vm.createContext(context);
  vm.runInContext(
    'const REPLAY_PLAYER_SPEEDS = Object.freeze([0.5, 1, 2, 4, 8]);\n' +
    classSource(fs.readFileSync(
      path.resolve(__dirname, '..', 'extension', 'content', 'visual-feedback.js'),
      'utf8'
    ), 'ReplayPlayerOverlay') + '\nthis.ReplayPlayerOverlay = ReplayPlayerOverlay;',
    context,
    { filename: 'extension/content/visual-feedback.js' }
  );
  const overlay = new context.ReplayPlayerOverlay();
  overlay._replayState = {
    sessionId: 'replay-clock', status: 'playing', speed: 4,
    positionMs: 1000, interpolationTargetMs: 2000, durationMs: 10000
  };
  overlay._clockPositionMs = 1000;
  overlay._clockAnchorPositionMs = 1000;
  overlay._clockAnchorAt = 100;
  assert.equal(overlay._interpolatedPosition(5000), 2000);

  const element = {
    style: {}, classList: { toggle() {}, remove() {}, add() {} },
    setAttribute() {}, value: '', textContent: '', disabled: false
  };
  overlay.container = {
    classList: element.classList,
    querySelector() { return element; }
  };
  overlay.create = function () {};
  overlay._replayState = {
    sessionId: 'replay-clock', status: 'playing', speed: 1,
    positionMs: 8000, interpolationTargetMs: 9000, durationMs: 10000
  };
  overlay._clockPositionMs = 8000;
  overlay.update({
    sessionId: 'replay-clock', status: 'paused', speed: 1,
    positionMs: 3000, interpolationTargetMs: 3000, durationMs: 10000
  }, 'running');
  assert.equal(overlay._clockPositionMs, 3000);
  assert.equal(overlay._interpolatedPosition(9000), 3000);
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

function makeRemovedReplayTabHandler() {
  const finalizeCalls = [];
  const context = {
    Number,
    Error,
    Promise,
    automationLogger: { warn() {} },
    fsbReplayFinalize(session, status, error) {
      if (session._replayFinalizing === true) return Promise.resolve();
      session._replayFinalizing = true;
      if (session.playback) session.playback.paused = false;
      session.status = status;
      finalizeCalls.push({ session, status, error });
      return Promise.resolve();
    }
  };
  vm.createContext(context);
  vm.runInContext(
    declarationSource(background, 'fsbReplayOverlayTabIds') + '\n' +
      declarationSource(background, 'fsbReplayHandleClosedTab') + '\n' +
      declarationSource(background, 'fsbReplayHandleRemovedTab') + '\n' +
      'this.handleRemovedTab = fsbReplayHandleRemovedTab;',
    context,
    { filename: 'extension/background.js' }
  );
  return { handleRemovedTab: context.handleRemovedTab, finalizeCalls };
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

test('closing the last tab during playback pause stops the replay exactly once', () => {
  const harness = makeRemovedReplayTabHandler();
  const session = {
    isReplay: true,
    replaySessionId: 'replay-last-tab',
    status: 'replaying',
    tabId: 81,
    expectedOrigin: 'https://only.example',
    ownershipToken: 'only-token',
    playback: { paused: true },
    replayTabs: {
      primary: {
        logicalTab: 'primary',
        tabId: 81,
        expectedOrigin: 'https://only.example',
        ownershipToken: 'only-token'
      }
    }
  };

  assert.equal(harness.handleRemovedTab(session, 81), true);
  assert.equal(harness.finalizeCalls.length, 1);
  assert.equal(harness.finalizeCalls[0].status, 'replay_stopped');
  assert.match(harness.finalizeCalls[0].error.message, /last browser tab was closed/);
  assert.equal(session.tabId, null);
  assert.equal(session.status, 'replay_stopped');
  assert.equal(session.playback.paused, false);

  assert.equal(harness.handleRemovedTab(session, 81), true);
  assert.equal(harness.finalizeCalls.length, 1, 'repeated removal delivery does not finalize twice');
});

test('tab removal preserves replay sessions that can still continue or need a decision', () => {
  const survivingHarness = makeRemovedReplayTabHandler();
  const withSurvivor = {
    isReplay: true,
    status: 'replaying',
    tabId: 71,
    playback: { paused: true },
    replayTabs: {
      primary: { logicalTab: 'primary', tabId: 71, ownershipToken: 'primary-token' },
      secondary: { logicalTab: 'secondary', tabId: 72, ownershipToken: 'secondary-token' }
    }
  };
  assert.equal(survivingHarness.handleRemovedTab(withSurvivor, 71), true);
  assert.equal(withSurvivor.tabId, 72);
  assert.equal(survivingHarness.finalizeCalls.length, 0);

  const decisionHarness = makeRemovedReplayTabHandler();
  const decisionPaused = {
    isReplay: true,
    status: 'replay_paused',
    tabId: 81,
    playback: { paused: true },
    replayTabs: {
      primary: { logicalTab: 'primary', tabId: 81, ownershipToken: 'only-token' }
    }
  };
  assert.equal(decisionHarness.handleRemovedTab(decisionPaused, 81), true);
  assert.equal(decisionPaused.status, 'replay_paused');
  assert.equal(decisionHarness.finalizeCalls.length, 0);

  const playingHarness = makeRemovedReplayTabHandler();
  const playing = {
    isReplay: true,
    status: 'replaying',
    tabId: 91,
    playback: { paused: false },
    replayTabs: {
      primary: { logicalTab: 'primary', tabId: 91, ownershipToken: 'only-token' }
    }
  };
  assert.equal(playingHarness.handleRemovedTab(playing, 91), true);
  assert.equal(playing.status, 'replaying');
  assert.equal(playingHarness.finalizeCalls.length, 0);
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
      declarationSource(background, 'fsbReplaySettlePlaybackWait') + '\n' +
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

test('executor readiness does not cross a pending or committed pause barrier', async () => {
  let releaseControl;
  let dispatched = false;
  const controlTail = new Promise((resolve) => { releaseControl = resolve; });
  const session = {
    replaySessionId: 'replay-control-barrier-test',
    status: 'replaying',
    isTerminating: false,
    _replayControlPendingCount: 1,
    _replayControlTail: controlTail,
    playback: {
      paused: false,
      speed: 1,
      positionMs: 100,
      timeline: [100],
      _wake: null,
      _waitAnchor: null
    }
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
    declarationSource(background, 'fsbReplayWakePlayback') + '\n' +
      declarationSource(background, 'fsbReplayWaitForWake') + '\n' +
      declarationSource(background, 'fsbReplaySettlePlaybackWait') + '\n' +
      declarationSource(background, 'fsbReplayHasPendingControls') + '\n' +
      declarationSource(background, 'fsbReplayAwaitControls') + '\n' +
      declarationSource(background, 'fsbReplayWaitForPlayback') + '\n' +
      declarationSource(background, 'fsbReplayWaitUntilRunnable') + '\n' +
      'this.waitUntilRunnable = fsbReplayWaitUntilRunnable; this.wakePlayback = fsbReplayWakePlayback;',
    context,
    { filename: 'extension/background.js' }
  );

  const readiness = (async () => {
    if (await context.waitUntilRunnable(session, { tool: 'click' }, 0)) dispatched = true;
  })();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dispatched, false, 'the pending durable control blocks dispatch readiness');

  session.playback.paused = true;
  session._replayControlPendingCount = 0;
  releaseControl();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dispatched, false, 'the committed pause remains blocked after persistence');

  session.playback.paused = false;
  context.wakePlayback(session);
  await readiness;
  assert.equal(dispatched, true);
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
  assert.equal(statusData.replay.interpolationTargetMs, 100);

  const overlayState = overlayStateUtils.buildOverlayState(statusData, null);
  assert.equal(overlayState.clientLabel, 'Replay');
  assert.equal(Object.prototype.hasOwnProperty.call(overlayState, 'agentIdShort'), false);
  assert.equal(overlayState.stoppable, false);
  assert.equal(overlayState.replay.interpolationTargetMs, 100);
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
    fsbReplayClone(value, fallback) {
      return JSON.parse(JSON.stringify(value === undefined ? fallback : value));
    },
    fsbReplayPlaybackSnapshot(session) { return JSON.parse(JSON.stringify(session.playback || null)); },
    async fsbReplayPersistRun(session) { events.push('persist'); return session.replayRun; },
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
    declarationSource(background, 'fsbReplayQueueMutation') + '\n' +
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
    fsbReplayClone(value, fallback) {
      return JSON.parse(JSON.stringify(value === undefined ? fallback : value));
    },
    fsbReplayPlaybackSnapshot(session) { return JSON.parse(JSON.stringify(session.playback || null)); },
    async fsbReplayPersistRun(session) { return session.replayRun; },
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
    declarationSource(background, 'fsbReplayQueueMutation') + '\n' +
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

test('replay finalization retains snapshots when terminal persistence returns false', async () => {
  let clears = 0;
  let releases = 0;
  let cleanups = 0;
  const context = {
    fsbReplayWakePlayback() {},
    fsbReplayClone(value, fallback) {
      return JSON.parse(JSON.stringify(value === undefined ? fallback : value));
    },
    fsbReplayPlaybackSnapshot(session) { return JSON.parse(JSON.stringify(session.playback || null)); },
    async fsbReplayPersistRun() { return false; },
    async fsbReplayBroadcastOverlay() {},
    async fsbReplayReleaseAgent() { releases++; return true; },
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
    declarationSource(background, 'fsbReplayQueueMutation') + '\n' +
      declarationSource(background, 'fsbReplayFinalize') + '\n' +
      'this.finalize = fsbReplayFinalize;',
    context,
    { filename: 'extension/background.js' }
  );

  await context.finalize({
    replaySessionId: 'replay-terminal-persist-failed',
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

  assert.equal(releases, 1, 'ownership is still released after persistence failure');
  assert.equal(clears, 0, 'recovery snapshots remain available for a later durable terminal write');
  assert.equal(cleanups, 1);
});

test('failed replay startup releases ownership before clearing its snapshot', async () => {
  const events = [];
  const context = {
    fsbReplayClone(value, fallback) {
      return JSON.parse(JSON.stringify(value === undefined ? fallback : value));
    },
    async fsbReplayPersistRun(session) { events.push('persist'); return session.replayRun; },
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
    declarationSource(background, 'fsbReplayQueueMutation') + '\n' +
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

function makeControlHarness(options = {}) {
  let wakeCount = 0;
  let now = 1000;
  const persistenceResolvers = [];
  const persistedPlaybacks = [];
  const persistedRuns = [];
  const session = {
    replaySessionId: 'replay-player-test',
    originalSessionId: 'replay-player-source',
    manifestHash: 'replay-player-manifest',
    sourceReceiptCid: 'source-receipt',
    previousReceiptCid: 'source-receipt',
    isReplay: true,
    status: 'replaying',
    currentStep: 1,
    totalSteps: 3,
    replaySteps: [{ tool: 'click' }, { tool: 'type_text' }, { tool: 'press_enter' }],
    replayRun: { id: 'replay-player-test', status: 'running', nextStep: 1, steps: [] },
    replayTabs: {},
    tabId: 77,
    expectedOrigin: 'https://example.test',
    actionHistory: [],
    startTime: now,
    playback: {
      paused: false,
      speed: 1,
      positionMs: 1000,
      interpolationTargetMs: 1000,
      durationMs: 10000,
      timeline: [750, 5000, 10000]
    }
  };
  const context = {
    FsbLatticeReplay: {
      async checkpointReplayStep() {
        return {
          receiptCid: 'checkpoint-receipt',
          resultHash: 'checkpoint-result-hash',
          receipt: { cid: 'checkpoint-receipt' }
        };
      }
    },
    activeSessions: new Map([[session.replaySessionId, session]]),
    fsbReplayIsTrustedUiSender() { return false; },
    fsbReplayOverlayTabIds() { return [77]; },
    fsbReplayWakePlayback() { wakeCount++; },
    fsbReplayClone(value, fallback) {
      return JSON.parse(JSON.stringify(value === undefined ? fallback : value));
    },
    async fsbReplayPersistRun(_session, replayRun, stagedPlayback) {
      persistedRuns.push(JSON.parse(JSON.stringify(replayRun)));
      persistedPlaybacks.push(JSON.parse(JSON.stringify(stagedPlayback)));
      if (options.deferPersistence === true) {
        await new Promise((resolve) => persistenceResolvers.push(resolve));
      }
      if (options.persistenceFails === true) return false;
      return Object.assign({}, replayRun, {
        playback: JSON.parse(JSON.stringify(stagedPlayback))
      });
    },
    fsbReplayBroadcastProgress() {},
    async fsbReplayBroadcastOverlay() {},
    async fsbReplayReleaseAgent() { return true; },
    async fsbBroadcastAutomationLifecycle() {},
    automationLogger: { logSessionEnd() {} },
    async cleanupSession() {},
    fsbReplayNormalizeSpeed(value) { return [0.5, 1, 2, 4, 8].includes(Number(value)) ? Number(value) : 2; },
    fsbReplayPlaybackSnapshot(value) {
      return {
        paused: value.playback.paused,
        speed: value.playback.speed,
        positionMs: value.playback.positionMs,
        interpolationTargetMs: value.playback.interpolationTargetMs
      };
    },
    Date: class extends Date {
      static now() { return now; }
    }
  };
  vm.createContext(context);
  vm.runInContext(
    declarationSource(background, 'fsbReplaySettlePlaybackWait') + '\n' +
    declarationSource(background, 'fsbReplayHasPendingControls') + '\n' +
    declarationSource(background, 'fsbReplayQueueMutation') + '\n' +
    declarationSource(background, 'fsbReplayQueueControl') + '\n' +
      declarationSource(background, 'fsbReplayTopologySnapshot') + '\n' +
      declarationSource(background, 'fsbReplayRecordCheckpointNow') + '\n' +
      declarationSource(background, 'fsbReplayRecordCheckpoint') + '\n' +
      declarationSource(background, 'fsbReplayFinalize') + '\n' +
      'const FSB_REPLAY_SPEEDS = Object.freeze([0.5, 1, 2, 4, 8]);\n' +
      'const FSB_REPLAY_SEEK_EPSILON_MS = 250;\n' +
      declarationSource(background, 'fsbReplayCanControl') + '\n' +
      declarationSource(background, 'handleReplayControl') + '\n' +
      'this.control = handleReplayControl; this.recordCheckpoint = fsbReplayRecordCheckpoint;' +
      'this.finalize = fsbReplayFinalize;',
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
  return {
    session,
    control,
    recordCheckpoint() {
      const step = { id: 'step-2', index: 1, tool: 'type_text', resultHash: null };
      return context.recordCheckpoint(
        session,
        step,
        { success: true },
        true,
        'executed',
        { nextStep: 2, playbackPositionMs: 5000 }
      );
    },
    finalize(status = 'replay_stopped') {
      return context.finalize(session, status, new Error('terminal test'));
    },
    wakeCount: () => wakeCount,
    persistedPlaybacks,
    persistedRuns,
    advanceTime(ms) { now += ms; },
    releasePersistence() {
      const resolve = persistenceResolvers.shift();
      assert.ok(resolve, 'expected a deferred persistence operation');
      resolve();
    }
  };
}

test('owned replay tabs can pause, resume, change speed, and seek forward', async () => {
  const harness = makeControlHarness();
  assert.equal((await harness.control({ command: 'pause' })).success, true);
  assert.equal(harness.session.playback.paused, true);

  assert.equal((await harness.control({ command: 'play' })).success, true);
  assert.equal(harness.session.playback.paused, false);

  assert.equal((await harness.control({ command: 'setSpeed', speed: 8 })).success, true);
  assert.equal(harness.session.playback.speed, 8);

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
  assert.match(speed.error, /0\.5x, 1x, 2x, 4x, or 8x/);

  const unrelated = await harness.control({ command: 'pause' }, { tab: { id: 88 } });
  assert.equal(unrelated.success, false);
  assert.match(unrelated.error, /owned replay tab/);
});

test('replay controls do not commit requested state when persistence fails', async () => {
  const harness = makeControlHarness({ persistenceFails: true });
  const before = JSON.parse(JSON.stringify(harness.session.playback));

  const response = await harness.control({ command: 'pause' });

  assert.equal(response.success, false);
  assert.match(response.error, /persistence is unavailable/);
  assert.deepEqual(harness.session.playback, before);
  assert.equal(harness.session._replayControlPendingCount, 0);
  assert.ok(harness.wakeCount() >= 2, 'the transient barrier wakes on entry and release');
});

test('pause gates playback immediately while durable persistence is pending', async () => {
  const harness = makeControlHarness({ deferPersistence: true });

  const pendingPause = harness.control({ command: 'pause' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.session._replayControlPendingCount, 1);
  assert.equal(harness.session.playback.paused, false, 'durable state has not committed yet');
  assert.equal(harness.wakeCount(), 1, 'the playback wait is interrupted before persistence completes');

  harness.releasePersistence();
  const response = await pendingPause;
  assert.equal(response.success, true);
  assert.equal(harness.session.playback.paused, true);
  assert.equal(harness.session._replayControlPendingCount, 0);
});

test('a control cannot apply after its replay session becomes terminal', async () => {
  const harness = makeControlHarness({ deferPersistence: true });

  const pendingPause = harness.control({ command: 'pause' });
  await new Promise((resolve) => setImmediate(resolve));
  harness.session.status = 'replay_stopped';
  harness.releasePersistence();

  const response = await pendingPause;
  assert.equal(response.success, false);
  assert.match(response.error, /no longer active/);
  assert.equal(harness.session.playback.paused, false);
  assert.equal(harness.session._replayControlPendingCount, 0);
});

test('rapid pause and speed controls serialize against the latest committed state', async () => {
  const harness = makeControlHarness({ deferPersistence: true });

  const pendingPause = harness.control({ command: 'pause' });
  const pendingSpeed = harness.control({ command: 'setSpeed', speed: 4 });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.persistedPlaybacks.length, 1);
  assert.equal(harness.session._replayControlPendingCount, 2);
  harness.releasePersistence();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.persistedPlaybacks.length, 2);
  assert.equal(harness.persistedPlaybacks[1].paused, true);
  assert.equal(harness.persistedPlaybacks[1].speed, 4);
  harness.releasePersistence();

  const [pauseResponse, speedResponse] = await Promise.all([pendingPause, pendingSpeed]);
  assert.equal(pauseResponse.success, true);
  assert.equal(speedResponse.success, true);
  assert.equal(harness.session.playback.paused, true);
  assert.equal(harness.session.playback.speed, 4);
  assert.equal(harness.session._replayControlPendingCount, 0);
});

test('a pause queued behind checkpoint persistence keeps the durable attempt and cursor', async () => {
  const harness = makeControlHarness({ deferPersistence: true });

  const pendingCheckpoint = harness.recordCheckpoint();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.persistedRuns.length, 1);
  assert.equal(harness.persistedRuns[0].nextStep, 2);
  assert.deepEqual(harness.persistedRuns[0].steps.map((attempt) => attempt.stepId), ['step-2']);

  const pendingPause = harness.control({ command: 'pause' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.persistedRuns.length, 1, 'the pause waits behind the checkpoint mutation');

  harness.releasePersistence();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.persistedRuns.length, 2);
  assert.equal(harness.persistedRuns[1].nextStep, 2);
  assert.deepEqual(harness.persistedRuns[1].steps.map((attempt) => attempt.stepId), ['step-2']);
  assert.equal(harness.persistedPlaybacks[1].paused, true);

  harness.releasePersistence();
  const [, pauseResponse] = await Promise.all([pendingCheckpoint, pendingPause]);
  assert.equal(pauseResponse.success, true);
  assert.equal(harness.session.replayRun.nextStep, 2);
  assert.equal(harness.session.replayRun.steps.length, 1);
  assert.equal(harness.session.playback.paused, true);
});

test('a checkpoint queued behind pause persistence cannot unpause playback', async () => {
  const harness = makeControlHarness({ deferPersistence: true });

  const pendingPause = harness.control({ command: 'pause' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.persistedRuns.length, 1);
  assert.equal(harness.persistedPlaybacks[0].paused, true);

  const pendingCheckpoint = harness.recordCheckpoint();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.persistedRuns.length, 1, 'the checkpoint waits behind the pause mutation');

  harness.releasePersistence();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.persistedRuns.length, 2);
  assert.equal(harness.persistedPlaybacks[1].paused, true);
  assert.deepEqual(harness.persistedRuns[1].steps.map((attempt) => attempt.stepId), ['step-2']);

  harness.releasePersistence();
  const [pauseResponse] = await Promise.all([pendingPause, pendingCheckpoint]);
  assert.equal(pauseResponse.success, true);
  assert.equal(harness.session.playback.paused, true);
  assert.equal(harness.session.replayRun.nextStep, 2);
});

test('terminal intent skips queued controls before their snapshot reaches persistence', async () => {
  const harness = makeControlHarness({ deferPersistence: true });

  const pendingCheckpoint = harness.recordCheckpoint();
  await new Promise((resolve) => setImmediate(resolve));
  const pendingPause = harness.control({ command: 'pause' });
  const pendingFinalize = harness.finalize('replay_stopped');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.persistedRuns.length, 1);

  harness.releasePersistence();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.persistedRuns.length, 2);
  assert.deepEqual(harness.persistedRuns.map((run) => run.status), ['running', 'replay_stopped']);

  harness.releasePersistence();
  const [, pauseResponse] = await Promise.all([pendingCheckpoint, pendingPause, pendingFinalize]);
  assert.equal(pauseResponse.success, false);
  assert.match(pauseResponse.error, /no longer active/);
  assert.equal(harness.session.status, 'replay_stopped');
  assert.equal(harness.session.replayRun.status, 'replay_stopped');
});

test('controls settle elapsed playback at the prior speed before persisting', async () => {
  const harness = makeControlHarness({ deferPersistence: true });
  const waitAnchor = {
    startedAt: 1000,
    positionBeforeWait: 1000,
    speed: 2,
    targetMs: 5000
  };
  harness.session.playback.positionMs = 1000;
  harness.session.playback.interpolationTargetMs = 5000;
  harness.session.playback._waitAnchor = waitAnchor;
  harness.advanceTime(250);

  const pendingPause = harness.control({ command: 'pause' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.session.playback.positionMs, 1500);
  assert.equal(harness.session.playback._waitAnchor, null);
  assert.equal(harness.persistedPlaybacks[0].positionMs, 1500);
  assert.equal(harness.persistedPlaybacks[0].paused, true);

  harness.releasePersistence();
  await pendingPause;
});
