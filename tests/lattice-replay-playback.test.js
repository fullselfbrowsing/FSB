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
