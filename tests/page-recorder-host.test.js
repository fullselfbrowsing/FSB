'use strict';

// Service-worker page recorder host: track lifecycle, injection, the content
// port protocol (hello/start/batch/ack), navigation segments, restart resume,
// history linking, finalize paths, the settings gate and retention.

const assert = require('node:assert/strict');
const test = require('node:test');

const store = require('../extension/utils/page-recording-store.js');
const host = require('../extension/utils/page-recorder-host.js');

const tick = (ms = 0) => new Promise((resolve) => { const t = setTimeout(resolve, ms); if (t.unref) t.unref(); });

function makeChrome() {
  const local = {};
  const session = {};
  const listeners = { connect: [], committed: [], removed: [], changed: [], alarm: [] };
  const chrome = {
    _local: local,
    _session: session,
    _alarms: new Map(),
    _injections: [],
    _injectError: null,
    _tabs: new Map(),
    runtime: { id: 'ext-id', onConnect: { addListener: (fn) => listeners.connect.push(fn) } },
    storage: {
      local: {
        async get(keys) {
          const names = Array.isArray(keys) ? keys : [keys];
          const out = {};
          names.forEach((k) => { if (k in local) out[k] = structuredClone(local[k]); });
          return out;
        },
        async set(values) {
          const changes = {};
          Object.keys(values).forEach((k) => {
            changes[k] = { oldValue: local[k], newValue: structuredClone(values[k]) };
            local[k] = structuredClone(values[k]);
          });
          listeners.changed.forEach((fn) => fn(changes, 'local'));
        }
      },
      session: {
        async get(keys) {
          const names = Array.isArray(keys) ? keys : [keys];
          const out = {};
          names.forEach((k) => { if (k in session) out[k] = structuredClone(session[k]); });
          return out;
        },
        async set(values) { Object.keys(values).forEach((k) => { session[k] = structuredClone(values[k]); }); }
      },
      onChanged: { addListener: (fn) => listeners.changed.push(fn) }
    },
    alarms: {
      create(name, info) { chrome._alarms.set(name, info); },
      clear(name) { chrome._alarms.delete(name); },
      get(name, cb) { cb(chrome._alarms.get(name) || null); },
      onAlarm: { addListener: (fn) => listeners.alarm.push(fn) }
    },
    scripting: {
      async executeScript(details) {
        chrome._injections.push(details);
        if (chrome._injectError) throw chrome._injectError;
        return [];
      }
    },
    tabs: {
      async get(tabId) {
        if (!chrome._tabs.has(tabId)) throw new Error('No tab');
        return chrome._tabs.get(tabId);
      },
      onRemoved: { addListener: (fn) => listeners.removed.push(fn) }
    },
    webNavigation: { onCommitted: { addListener: (fn) => listeners.committed.push(fn) } }
  };
  chrome._listeners = listeners;
  return chrome;
}

function makePort(tabId, documentId, extra) {
  const port = {
    name: 'fsb-page-recorder',
    sender: Object.assign({ tab: { id: tabId }, frameId: 0, documentId, id: 'ext-id' }, extra || {}),
    received: [],
    disconnected: false,
    onMessage: { listeners: [], addListener(fn) { this.listeners.push(fn); } },
    onDisconnect: { listeners: [], addListener(fn) { this.listeners.push(fn); } },
    postMessage(message) { port.received.push(structuredClone(message)); },
    disconnect() { port.disconnected = true; },
    async send(message) {
      await Promise.all(port.onMessage.listeners.map((fn) => fn(message)));
      await tick(5);
    },
    drop() { port.onDisconnect.listeners.forEach((fn) => fn()); }
  };
  return port;
}

function keyframeChunk(seq, t) {
  return {
    trackId: 'ignored', segment: 99, seq, t0: t, t1: t, keyframe: true, bytes: 40,
    events: [{ t, type: 'ext:dom-snapshot', payload: { html: '<p>x</p>', streamSessionId: 's', snapshotId: t } }]
  };
}

let clock = 1_800_000_000_000;

function setup(options) {
  const opts = options || {};
  store._setBackendForTests(store._createMemoryBackend());
  store._resetLimitsForTests();
  host._test.reset();
  const chrome = makeChrome();
  if (opts.disabled) chrome._local.fsbPageRecordingEnabled = false;
  if (opts.sessionIndex) chrome._local.fsbSessionIndex = opts.sessionIndex;
  chrome._tabs.set(5, { id: 5, url: 'https://shop.example/cart?coupon=1' });
  chrome._tabs.set(7, { id: 7, url: 'https://docs.example/page' });
  chrome._tabs.set(9, { id: 9, url: 'https://shop.example/new' });
  const legacy = { ids: opts.legacyIds ? opts.legacyIds.slice() : [] };
  const existing = new Set(opts.existingHistory || []);
  host._test.setDeps({
    chrome,
    store,
    now: () => clock,
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
    recorder: () => ({
      SENSITIVE_FIELD_PATTERNS: { target: { source: 'otp', flags: 'i' }, pinToken: { source: 'pin', flags: 'i' } },
      sanitizeSummaryTextForPersistence: (text) => String(text).replace(/api_key=\S+/g, 'api_key=[REDACTED]'),
      resolveOpenSessionId: async () => (legacy.ids.length ? legacy.ids[0] : null)
    }),
    journal: () => ({ hasSession: async (id) => existing.has(id) }),
    logger: () => ({ loadSession: async () => null })
  });
  host.init();
  return { chrome, legacy, existing };
}

async function connect(chrome, tabId, documentId, hello) {
  const port = makePort(tabId, documentId);
  chrome._listeners.connect.forEach((fn) => fn(port));
  await port.send(Object.assign({ type: 'hello', version: 1, href: 'https://shop.example/cart?coupon=1', contentType: 'text/html', resume: null }, hello || {}));
  return port;
}

async function startTrack(chrome, input, documentId) {
  const pending = host.noteActionStart(input);
  await tick(5);
  const port = await connect(chrome, input.tabId, documentId || 'doc-1');
  const start = port.received.find((m) => m.type === 'start');
  await port.send({ type: 'batch', seq: 0, recordingId: start && start.recordingId, chunks: [keyframeChunk(0, clock)], bytes: 40 });
  await pending;
  return { port, start };
}

test('classifies recordable URLs and builds correlations', () => {
  setup();
  const { recordableUrl, correlationFor, sanitizeLabel } = host._test;
  assert.equal(recordableUrl('https://a.example/x').ok, true);
  assert.equal(recordableUrl('http://a.example/x').ok, true);
  assert.equal(recordableUrl('chrome://settings').ok, false);
  assert.equal(recordableUrl('file:///tmp/a.html').ok, false);
  assert.equal(recordableUrl('https://chromewebstore.google.com/detail/x').ok, false);
  assert.equal(recordableUrl('https://chrome.google.com/webstore/detail/x').ok, false);
  assert.equal(recordableUrl('not a url').ok, false);
  assert.equal(correlationFor({ driver: 'autopilot', sessionId: 'session_1' }), 'ap:session_1');
  assert.equal(correlationFor({ driver: 'mcp', agentId: 'A', recordingRunId: 'R' }), 'mcp:A:R');
  assert.equal(correlationFor({ driver: 'mcp', agentId: 'A' }), 'mcp:A:legacy');
  assert.equal(sanitizeLabel('Typing "hunter2" with api_key=abc'), 'Typing "…" with api_key=[REDACTED]');
});

test('the first MCP action starts a track, injects, and streams chunks with acks', async () => {
  const { chrome } = setup();
  const { port, start } = await startTrack(chrome, { driver: 'mcp', tabId: 5, agentId: 'A', recordingRunId: 'R1', actionId: 'c1', tool: 'click', reason: 'Clicking "Add to cart"' });
  assert.equal(chrome._injections.length, 1);
  assert.deepEqual(chrome._injections[0].files, ['dist/content/page-recorder-capture.js', 'content/page-recorder.js']);
  assert.deepEqual(chrome._injections[0].target, { tabId: 5, frameIds: [0] });
  assert.equal(start.trackId, 'primary');
  assert.equal(start.segment, 0);
  assert.equal(start.patterns.target.source, 'otp');
  assert.ok(port.received.some((m) => m.type === 'ack' && m.seq === 0));
  const rec = await store.getRecording(start.recordingId);
  assert.equal(rec.correlation, 'mcp:A:R1');
  const chunks = await store.readTrackChunks(start.recordingId, 'primary');
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].segment, 0, 'the host stamps its own track/segment');
  await tick(5);
  const markers = await store.readMarkers(start.recordingId);
  const kinds = markers.map((m) => m.kind);
  assert.ok(kinds.includes('navigation'));
  assert.equal(markers.find((m) => m.kind === 'navigation').data.url, 'https://shop.example/cart', 'no query string');
  const actionStart = markers.find((m) => m.kind === 'action-start');
  assert.equal(actionStart.data.label, 'Clicking "…"');
  assert.ok(port.received.some((m) => m.type === 'mark' && m.kind === 'action-start'));
});

test('duplicate batches are acked without writing twice', async () => {
  const { chrome } = setup();
  const { port, start } = await startTrack(chrome, { driver: 'mcp', tabId: 5, agentId: 'A', recordingRunId: 'R1' });
  await port.send({ type: 'batch', seq: 0, recordingId: start.recordingId, chunks: [keyframeChunk(0, clock)], bytes: 40 });
  assert.equal(port.received.filter((m) => m.type === 'ack' && m.seq === 0).length, 2);
  assert.equal((await store.getRecording(start.recordingId)).chunkCount, 1);
});

test('action end marks it, asks the page to settle, and links the journal history row', async () => {
  const { chrome } = setup({ sessionIndex: [{ id: 'hist-1', storageBackend: 'journal-v2', agentId: 'A', recordingRunId: 'R1' }] });
  const { port, start } = await startTrack(chrome, { driver: 'mcp', tabId: 5, agentId: 'A', recordingRunId: 'R1', actionId: 'c1' });
  await host.noteActionEnd({ tabId: 5, actionId: 'c1', tool: 'click', success: true });
  await tick(5);
  assert.ok(port.received.some((m) => m.type === 'settle' && m.actionId === 'c1'));
  assert.ok((await store.readMarkers(start.recordingId)).some((m) => m.kind === 'action-end' && m.data.success === true));
  assert.equal((await store.getRecording(start.recordingId)).historySessionId, 'hist-1');
  const summary = await host._test.writeIndexNow();
  assert.equal(summary['hist-1'].recordingId, start.recordingId);
  assert.equal(chrome._local.fsbPageRecordingIndex['hist-1'].state, 'recording');
});

test('each committed document gets a new segment; restricted pages leave a gap', async () => {
  const { chrome } = setup();
  const { start } = await startTrack(chrome, { driver: 'mcp', tabId: 5, agentId: 'A', recordingRunId: 'R1' });
  host._test.onCommitted({ tabId: 5, frameId: 0, documentId: 'doc-2', url: 'https://shop.example/checkout' });
  await tick(5);
  assert.deepEqual(chrome._injections[1].target, { tabId: 5, documentIds: ['doc-2'] });
  const second = await connect(chrome, 5, 'doc-2', { href: 'https://shop.example/checkout?step=2' });
  assert.equal(second.received.find((m) => m.type === 'start').segment, 1);
  host._test.onCommitted({ tabId: 5, frameId: 0, documentId: 'doc-3', url: 'chrome://settings' });
  host._test.onCommitted({ tabId: 5, frameId: 1, documentId: 'frame', url: 'https://ads.example' });
  host._test.onCommitted({ tabId: 5, frameId: 0, documentId: 'pre', url: 'https://shop.example/next', documentLifecycle: 'prerender' });
  await tick(10);
  assert.equal(chrome._injections.length, 2, 'no injection for restricted, subframe or prerender documents');
  const markers = await store.readMarkers(start.recordingId);
  assert.ok(markers.some((m) => m.kind === 'gap' && m.data.reason === 'restricted-page'));
  assert.ok(markers.some((m) => m.kind === 'navigation' && m.data.url === 'https://shop.example/checkout'));
});

test('non-HTML documents and rogue ports are refused', async () => {
  const { chrome } = setup();
  const { start } = await startTrack(chrome, { driver: 'mcp', tabId: 5, agentId: 'A', recordingRunId: 'R1' });
  const pdf = await connect(chrome, 5, 'doc-pdf', { contentType: 'application/pdf' });
  assert.ok(pdf.received.some((m) => m.type === 'stop' && m.reason === 'not-html'));
  assert.ok((await store.readMarkers(start.recordingId)).some((m) => m.kind === 'gap' && m.data.reason === 'not-html'));
  const subframe = makePort(5, 'x', { frameId: 2 });
  chrome._listeners.connect.forEach((fn) => fn(subframe));
  assert.equal(subframe.disconnected, true);
  const foreign = makePort(5, 'y', { id: 'other-extension' });
  chrome._listeners.connect.forEach((fn) => fn(foreign));
  assert.equal(foreign.disconnected, true);
  const untracked = await connect(chrome, 42, 'z');
  assert.ok(untracked.received.some((m) => m.type === 'stop' && m.reason === 'not-recording'));
});

test('a restarted service worker resumes the same segment and dedupes resent batches', async () => {
  const { chrome } = setup();
  const { start } = await startTrack(chrome, { driver: 'mcp', tabId: 5, agentId: 'A', recordingRunId: 'R1' });
  await host._test.persistNow();
  const saved = chrome._session.fsbPageRecorderState;
  assert.ok(saved.tabs[5]);
  // Simulate eviction: in-memory state gone, chrome.storage.session kept.
  const deps = { chrome, store, now: () => clock, setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; } };
  host._test.reset();
  host._test.setDeps(deps);
  // A restarted worker registers its listeners afresh; drop the old ones.
  Object.keys(chrome._listeners).forEach((key) => { chrome._listeners[key].length = 0; });
  host.init();
  const port = await connect(chrome, 5, 'doc-1', { resume: { recordingId: start.recordingId, trackId: 'primary', segment: 0, lastAckedSeq: 0 } });
  const resumed = port.received.find((m) => m.type === 'start');
  assert.equal(resumed.segment, 0);
  assert.equal(resumed.recordingId, start.recordingId);
  await port.send({ type: 'batch', seq: 0, recordingId: start.recordingId, chunks: [keyframeChunk(0, clock)], bytes: 40 });
  await port.send({ type: 'batch', seq: 1, recordingId: start.recordingId, chunks: [keyframeChunk(1, clock + 1)], bytes: 40 });
  assert.equal((await store.getRecording(start.recordingId)).chunkCount, 2, 'seq 0 was already stored; seq 1 is new');
  const navs = (await store.readMarkers(start.recordingId)).filter((m) => m.kind === 'navigation');
  assert.equal(navs.length, 1, 'a resume is not a navigation');
});

test('an end that arrives before its start (open_tab) is paired on the new tab', async () => {
  const { chrome } = setup();
  const { start } = await startTrack(chrome, { driver: 'mcp', tabId: 5, agentId: 'A', recordingRunId: 'R1' });
  await host.noteActionEnd({ tabId: 9, actionId: 'open', tool: 'open_tab', success: true });
  const second = host.noteActionStart({ driver: 'mcp', tabId: 9, agentId: 'A', recordingRunId: 'R1', actionId: 'open', tool: 'open_tab' });
  await tick(5);
  await connect(chrome, 9, 'doc-9', { href: 'https://shop.example/new' });
  await second;
  await tick(5);
  const rec = await store.getRecording(start.recordingId);
  assert.ok(rec.tracks['tab-2'], 'the second tab gets its own track');
  const markers = await store.readMarkers(start.recordingId);
  const forTab2 = markers.filter((m) => m.trackId === 'tab-2').map((m) => m.kind);
  assert.ok(forTab2.includes('action-start'));
  assert.ok(forTab2.includes('action-end'));
});

test('MCP recordings finish a minute after their last track ends', async () => {
  const { chrome } = setup();
  const { port, start } = await startTrack(chrome, { driver: 'mcp', tabId: 5, agentId: 'A', recordingRunId: 'R1' });
  await host.onVisualSessionCleared({ tabId: 5 }, 'is_final');
  assert.ok(port.received.some((m) => m.type === 'stop'));
  const alarmName = 'fsbPageRecording:finalize:' + start.recordingId;
  assert.ok(chrome._alarms.has(alarmName));
  chrome._listeners.alarm.forEach((fn) => fn({ name: alarmName }));
  await tick(20);
  const rec = await store.getRecording(start.recordingId);
  assert.equal(rec.status, store.STATUS_FINISHED);
  assert.equal(Object.keys(host._test.state().recordings).length, 0);
});

test('Autopilot recordings link to their session at once and finish with it', async () => {
  const { chrome } = setup();
  const { port, start } = await startTrack(chrome, { driver: 'autopilot', sessionId: 'session_1', tabId: 7, tool: 'click' });
  const rec = await store.getRecording(start.recordingId);
  assert.equal(rec.historySessionId, 'session_1');
  assert.equal(rec.driver, 'autopilot');
  await host.finalizeAutopilotSession('session_1');
  assert.equal((await store.getRecording(start.recordingId)).status, store.STATUS_FINISHED);
  assert.ok(port.received.some((m) => m.type === 'stop'));
  await host.finalizeAutopilotSession('session_1'); // idempotent
});

test('the off switch blocks new recordings and stops live ones', async () => {
  const off = setup({ disabled: true });
  await host.noteActionStart({ driver: 'mcp', tabId: 5, agentId: 'A', recordingRunId: 'R1' });
  assert.equal(off.chrome._injections.length, 0);
  assert.equal((await store.listRecordings()).length, 0);

  const { chrome } = setup();
  const { start } = await startTrack(chrome, { driver: 'mcp', tabId: 5, agentId: 'A', recordingRunId: 'R1' });
  await chrome.storage.local.set({ fsbPageRecordingEnabled: false });
  await tick(30);
  assert.equal((await store.getRecording(start.recordingId)).status, store.STATUS_FINISHED);
});

test('recordings follow their history rows out of the session index', async () => {
  const { existing } = setup();
  const kept = await store.createRecording({ correlation: 'k', historySessionId: 'still-there' });
  const doomed = await store.createRecording({ correlation: 'd', historySessionId: 'deleted' });
  existing.add('still-there');
  await host._test.followSessionIndex([{ id: 'still-there' }, { id: 'deleted' }], []);
  assert.ok(await store.getRecording(kept.id), 'a row that still exists elsewhere keeps its recording');
  assert.equal(await store.getRecording(doomed.id), null);
  const fast = await store.createRecording({ correlation: 'f', historySessionId: 'fast' });
  await host.onHistoryDeleted(['fast']);
  assert.equal(await store.getRecording(fast.id), null);
});

test('housekeeping prunes old MCP recordings and sweeps unknown history rows', async () => {
  const { chrome } = setup({ sessionIndex: [{ id: 'known' }] });
  chrome._local.fsbMcpSessionRetentionDays = 1;
  const oldMcp = await store.createRecording({ correlation: 'm', driver: 'mcp', historySessionId: 'known' });
  await store.finishRecording(oldMcp.id, clock - 3 * 86400000);
  const oldAutopilot = await store.createRecording({ correlation: 'a', driver: 'autopilot', historySessionId: 'known' });
  await store.finishRecording(oldAutopilot.id, clock - 3 * 86400000);
  const orphan = await store.createRecording({ correlation: 'o', driver: 'autopilot', historySessionId: 'gone' });
  await store.finishRecording(orphan.id, clock);
  await host.housekeeping();
  assert.equal(await store.getRecording(oldMcp.id), null, 'MCP recordings follow the retention days');
  assert.ok(await store.getRecording(oldAutopilot.id), 'Autopilot history is never age-pruned');
  assert.equal(await store.getRecording(orphan.id), null);
});

test('legacy MCP sessions link through the recorder and split on rollover', async () => {
  const { chrome, legacy } = setup({ legacyIds: ['legacy-1'] });
  const { start } = await startTrack(chrome, { driver: 'mcp', tabId: 5, agentId: 'A' });
  await host.noteActionEnd({ tabId: 5, actionId: 'x' });
  await tick(5);
  assert.equal((await store.getRecording(start.recordingId)).historySessionId, 'legacy-1');
  legacy.ids = ['legacy-2'];
  await host.noteActionEnd({ tabId: 5, actionId: 'y' });
  await tick(20);
  assert.equal((await store.getRecording(start.recordingId)).status, store.STATUS_FINISHED);
});

test('closing a recorded tab ends its track; injection failures leave a gap', async () => {
  const { chrome } = setup();
  const { start } = await startTrack(chrome, { driver: 'mcp', tabId: 5, agentId: 'A', recordingRunId: 'R1' });
  chrome._listeners.removed.forEach((fn) => fn(5));
  await tick(20);
  assert.equal(host._test.state().tabs[5], undefined);
  assert.ok((await store.readMarkers(start.recordingId)).some((m) => m.kind === 'track-end' && m.data.reason === 'tab-closed'));

  const second = setup();
  second.chrome._injectError = new Error('Cannot access contents of the page');
  await host.noteActionStart({ driver: 'mcp', tabId: 7, agentId: 'B', recordingRunId: 'R9' });
  await tick(10);
  const rec = (await store.listRecordings())[0];
  assert.ok((await store.readMarkers(rec.id)).some((m) => m.kind === 'gap' && m.data.reason === 'inject-blocked'));
});
