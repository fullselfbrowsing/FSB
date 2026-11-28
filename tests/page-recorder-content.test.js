'use strict';

// Content-side page recorder: masking, filtering, batching/acks, back-pressure,
// settle + keyframes, heavy-page policy, reconnect and re-injection. Runs the
// real extension/content/page-recorder.js in a vm sandbox with a fake capture
// kit and a fake runtime port.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content', 'page-recorder.js'), 'utf8');
const recorderApi = require('../extension/utils/mcp-session-recorder.js');

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function makeElement(attrs, extra) {
  return Object.assign({
    nodeType: 1,
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    labels: (extra && extra.labels) || []
  }, extra || {});
}

function makeKit(log, options) {
  const opts = options || {};
  return {
    createRecorder(config) {
      let seq = 0;
      let current = null;
      const emit = () => {
        if (!current) return;
        const chunk = { seq: seq++, t0: current[0].t, t1: current[current.length - 1].t, keyframe: current[0].type === 'ext:dom-snapshot', events: current };
        current = null;
        config.onChunk(chunk);
      };
      const recorder = {
        transport: {
          send(type, payload) {
            if (type === 'ext:dom-snapshot') emit();
            (current = current || []).push({ t: config.now(), type, payload });
            log.sent.push({ type, payload });
          },
          flush: emit
        },
        mark(kind, data) { log.marks.push({ kind, data }); },
        overlay(payload) { log.overlays.push(payload); },
        flush: emit
      };
      log.recorder = recorder;
      return recorder;
    },
    createCapture(config) {
      log.captureConfig = config;
      const capture = {
        start() {
          log.starts += 1;
          const html = opts.snapshotHtml || '<p>page</p>';
          config.transport.send('ext:dom-snapshot', { html, streamSessionId: 's' + log.starts, snapshotId: log.starts });
        },
        stop() { log.stops += 1; config.transport.flush(); },
        pause() { log.pauses += 1; },
        getNodeId(el) { return el && el.__nid ? el.__nid : null; },
        emitMutations(mutations) { config.transport.send('ext:dom-mutations', { mutations, streamSessionId: 's', snapshotId: 1 }); }
      };
      log.capture = capture;
      return capture;
    },
    STREAM: { SNAPSHOT: 'ext:dom-snapshot', MUTATIONS: 'ext:dom-mutations' }
  };
}

function createSandbox(options) {
  const opts = options || {};
  const log = { posted: [], ports: [], marks: [], overlays: [], sent: [], starts: 0, stops: 0, pauses: 0 };
  const runtime = {
    id: 'ext-id',
    connect() {
      const port = {
        posted: [],
        onMessage: { listeners: [], addListener(fn) { this.listeners.push(fn); } },
        onDisconnect: { listeners: [], addListener(fn) { this.listeners.push(fn); } },
        postMessage(message) { port.posted.push(JSON.parse(JSON.stringify(message))); log.posted.push(message); },
        disconnect() { port.disconnected = true; },
        deliver(message) { port.onMessage.listeners.forEach((fn) => fn(message)); },
        drop() { port.onDisconnect.listeners.forEach((fn) => fn()); }
      };
      log.ports.push(port);
      return port;
    }
  };
  const windowListeners = {};
  // Unref'd timers: the recorder polls the overlay on an interval and the
  // test process must still be able to exit.
  const unref = (handle) => { if (handle && typeof handle.unref === 'function') handle.unref(); return handle; };
  const sandbox = {
    console,
    setTimeout: (fn, ms) => unref(setTimeout(fn, ms)),
    clearTimeout,
    setInterval: (fn, ms) => unref(setInterval(fn, ms)),
    clearInterval,
    Promise, JSON, Math, Date, Object, Array, Map, Set, RegExp, String, Number,
    chrome: { runtime },
    location: { origin: 'https://shop.example', pathname: '/checkout', href: 'https://shop.example/checkout?token=x' },
    document: {
      contentType: 'text/html',
      readyState: 'complete',
      body: {},
      documentElement: {},
      addEventListener() {},
      removeEventListener() {}
    },
    window: { addEventListener(name, fn) { (windowListeners[name] = windowListeners[name] || []).push(fn); } },
    performance: { timeOrigin: 1_700_000_000_000, now: () => Date.now() - 1_700_000_000_000 + (opts.clockSkew || 0) },
    MutationObserver: class { constructor(cb) { log.activity = cb; } observe() {} disconnect() {} }
  };
  sandbox.globalThis = sandbox;
  sandbox.FsbPageCaptureKit = makeKit(log, opts);
  vm.createContext(sandbox);
  const load = () => vm.runInContext(SOURCE, sandbox, { filename: 'page-recorder.js' });
  load();
  return { sandbox, log, load, runtime, windowListeners };
}

function startConfig(extra) {
  return Object.assign({
    type: 'start',
    recordingId: 'rec_1',
    trackId: 'primary',
    segment: 0,
    patterns: recorderApi.SENSITIVE_FIELD_PATTERNS,
    limits: { batchMs: 5, keyframeMinGapMs: 0, settleQuietMs: 10, settleMaxMs: 200 }
  }, extra || {});
}

test('says hello with only origin and path, then waits for the host', () => {
  const { log } = createSandbox();
  const hello = log.ports[0].posted[0];
  assert.equal(hello.type, 'hello');
  assert.equal(hello.href, 'https://shop.example/checkout');
  assert.equal(hello.resume, null);
  assert.equal(log.starts, 0);
});

test('starts capture with cssom styles, masking, and FSB overlays skipped', async () => {
  const { log } = createSandbox();
  log.ports[0].deliver(startConfig());
  const config = log.captureConfig;
  assert.equal(config.styleMode, 'cssom');
  assert.equal(config.maskInputs, true);
  assert.equal(typeof config.maskInputFn, 'function');
  const overlay = { closest: (selector) => (selector === '[data-fsb-overlay]' ? {} : null) };
  const pageNode = { closest: () => null };
  assert.equal(config.skipElement(overlay), true);
  assert.equal(config.skipElement(pageNode), false);
  await tick(20);
  const batch = log.ports[0].posted.find((m) => m.type === 'batch');
  assert.ok(batch, 'the first snapshot is posted as a batch');
  assert.equal(batch.chunks[0].keyframe, true);
  assert.equal(batch.chunks[0].trackId, 'primary');
});

test('masks sensitive fields and keeps ordinary typed text', () => {
  const { sandbox } = createSandbox();
  const t = sandbox.__fsbPageRecorder._test;
  const mask = (attrs, extra) => t.maskInputValue('secret 42', makeElement(attrs, extra));
  assert.equal(mask({ type: 'password' }), '****** **');
  assert.equal(mask({ type: 'text', name: 'cc-number' }), '****** **');
  assert.equal(mask({ type: 'text', autocomplete: 'one-time-code' }), '****** **');
  assert.equal(mask({ type: 'text', id: 'paymentPin' }), '****** **');
  assert.equal(mask({ type: 'text' }, { labels: [{ textContent: 'Security code' }] }), '****** **');
  assert.equal(mask({ type: 'text', name: 'shipping-address' }), 'secret 42');
  assert.equal(mask({ type: 'text', name: 'opinion' }), 'secret 42', 'pin needs token boundaries');
});

test('default patterns stay in sync with the MCP session recorder', () => {
  const { sandbox } = createSandbox();
  const defaults = sandbox.__fsbPageRecorder._test.DEFAULT_PATTERNS;
  assert.equal(defaults.target.source, recorderApi.SENSITIVE_FIELD_PATTERNS.target.source);
  assert.equal(defaults.target.flags, recorderApi.SENSITIVE_FIELD_PATTERNS.target.flags);
  assert.equal(defaults.pinToken.source, recorderApi.SENSITIVE_FIELD_PATTERNS.pinToken.source);
  assert.equal(defaults.pinToken.flags, recorderApi.SENSITIVE_FIELD_PATTERNS.pinToken.flags);
});

test('drops FSB data-fsb-* attribute ops and redacts quoted caption text', () => {
  const { sandbox } = createSandbox();
  const t = sandbox.__fsbPageRecorder._test;
  const payload = { mutations: [
    { op: 'attr', nid: '1', attr: 'data-fsb-id', val: 'e12' },
    { op: 'attr', nid: '1', attr: 'class', val: 'open' },
    { op: 'add', parentNid: 'body', html: '<div></div>' }
  ] };
  const kept = t.stripFsbAttributeOps('ext:dom-mutations', payload).mutations;
  assert.deepEqual(kept.map((op) => op.attr || op.op), ['class', 'add']);
  assert.equal(t.redactQuoted('Typing "hunter2" into the password box'), 'Typing "…" into the password box');
  assert.equal(t.redactQuoted('Clicking “Place order”'), 'Clicking “…”');
});

test('acks clear unacked batches; heavy back-pressure pauses then keyframes', async () => {
  const { log } = createSandbox();
  log.ports[0].deliver(startConfig({ limits: { batchMs: 5, pauseUnackedBytes: 50, keyframeMinGapMs: 0 } }));
  await tick(20);
  assert.equal(log.pauses, 1, 'over the unacked limit the capture pauses');
  assert.ok(log.marks.some((m) => m.kind === 'gap' && m.data.reason === 'backpressure'));
  const port = log.ports[0];
  const startsBefore = log.starts;
  port.posted.filter((m) => m.type === 'batch').forEach((m) => port.deliver({ type: 'ack', seq: m.seq }));
  assert.equal(log.starts, startsBefore + 1, 'draining takes a fresh keyframe');
});

test('settles after the page goes quiet, marks it, and keyframes', async () => {
  const { log } = createSandbox();
  log.ports[0].deliver(startConfig());
  await tick(20);
  const startsBefore = log.starts;
  log.ports[0].deliver({ type: 'settle', actionId: 'call-7' });
  await tick(150);
  const settled = log.marks.find((m) => m.kind === 'action-settled');
  assert.ok(settled);
  assert.equal(settled.data.actionId, 'call-7');
  assert.equal(log.starts, startsBefore + 1);
});

test('skips keyframes that would land too soon after the last one', async () => {
  const { log } = createSandbox();
  log.ports[0].deliver(startConfig({ limits: { batchMs: 5, keyframeMinGapMs: 60_000, settleQuietMs: 10 } }));
  await tick(20);
  const startsBefore = log.starts;
  log.ports[0].deliver({ type: 'settle', actionId: 'a' });
  await tick(150);
  assert.equal(log.starts, startsBefore, 'small diffs within the gap reuse the last keyframe');
  log.ports[0].deliver({ type: 'keyframe', force: true });
  assert.equal(log.starts, startsBefore + 1, 'a forced keyframe always runs');
});

test('heavy first snapshots turn keyframes off; huge ones fall back to markers only', async () => {
  const heavy = createSandbox({ snapshotHtml: 'x'.repeat(2000) });
  heavy.log.ports[0].deliver(startConfig({ limits: { batchMs: 5, heavySnapshotBytes: 500, keyframeMinGapMs: 0 } }));
  await tick(20);
  assert.equal(heavy.sandbox.__fsbPageRecorder._state.keyframesEnabled, false);

  const huge = createSandbox({ snapshotHtml: 'y'.repeat(4000) });
  huge.log.ports[0].deliver(startConfig({ limits: { batchMs: 5, markersOnlySnapshotBytes: 1000 } }));
  await tick(20);
  const port = huge.log.ports[0];
  assert.equal(port.posted.filter((m) => m.type === 'batch').length, 0, 'the oversized snapshot never leaves the page');
  assert.ok(port.posted.some((m) => m.type === 'marker' && m.kind === 'gap' && m.data.reason === 'snapshot-too-large'));
  assert.equal(huge.sandbox.__fsbPageRecorder._state.markersOnly, true);
});

test('reconnects after a service-worker restart and resends unacked batches', async () => {
  const { log } = createSandbox();
  log.ports[0].deliver(startConfig());
  await tick(20);
  const firstBatches = log.ports[0].posted.filter((m) => m.type === 'batch');
  assert.ok(firstBatches.length >= 1);
  log.ports[0].drop();
  await tick(400);
  assert.equal(log.ports.length, 2, 'a new port was opened');
  const second = log.ports[1].posted;
  assert.equal(second[0].type, 'hello');
  assert.equal(second[0].resume.recordingId, 'rec_1');
  assert.equal(second[0].resume.lastAckedSeq, -1);
  assert.deepEqual(second.filter((m) => m.type === 'batch').map((m) => m.seq), firstBatches.map((m) => m.seq));
});

test('stops for good when the extension context is gone', async () => {
  const { log, runtime, sandbox } = createSandbox();
  log.ports[0].deliver(startConfig());
  await tick(20);
  delete runtime.id;
  log.ports[0].drop();
  await tick(400);
  assert.equal(log.ports.length, 1, 'no reconnect without an extension');
  assert.equal(sandbox.__fsbPageRecorder.isStopped(), true);
});

test('re-injection rebinds a running recorder and replaces a stopped one', async () => {
  const { log, load, sandbox } = createSandbox();
  const first = sandbox.__fsbPageRecorder;
  load();
  assert.equal(sandbox.__fsbPageRecorder, first, 'a running recorder is kept');
  assert.equal(log.ports.length, 1);
  log.ports[0].deliver({ type: 'stop', reason: 'session-ended' });
  assert.equal(first.isStopped(), true);
  load();
  assert.notEqual(sandbox.__fsbPageRecorder, first, 'a stopped recorder is replaced');
  assert.equal(log.ports.length, 2);
});

test('leaving the page flushes the open chunk and capture before the document goes', async () => {
  const { log, windowListeners } = createSandbox();
  log.ports[0].deliver(startConfig({ limits: { batchMs: 10_000 } }));
  await tick(20);
  log.capture.emitMutations([{ op: 'text', nid: '3', text: 'Order placed' }]);
  log.recorder.mark('action-start', { actionId: 'last' });
  const stopsBefore = log.stops;
  windowListeners.pagehide.forEach((fn) => fn({ persisted: false }));
  assert.equal(log.stops, stopsBefore + 1, 'capture stops so its final mutations flush');
  const batches = log.ports[0].posted.filter((m) => m.type === 'batch');
  const sent = JSON.stringify(batches);
  assert.ok(sent.includes('Order placed'), 'the last mutations left the page');
  assert.ok(sent.includes('"type":"ext:dom-mutations"'));
  windowListeners.pagehide.forEach((fn) => fn({ persisted: true }));
  assert.equal(log.stops, stopsBefore + 1, 'a bfcache hide keeps capture running');
});

test('samples the agent highlight by node id and the status without typed text', async () => {
  const { log, sandbox } = createSandbox();
  log.ports[0].deliver(startConfig());
  await tick(20);
  sandbox.FSB = {
    actionGlowOverlay: { currentGeometry: { x: 1, y: 2, w: 3, h: 4 }, targetElement: { __nid: '42' } },
    overlayState: { lifecycle: 'running', phase: 'acting', display: { title: 'Typing "hunter2"' } }
  };
  const overlay = sandbox.__fsbPageRecorder._test.readOverlay();
  // Objects built inside the vm carry its prototypes; compare their JSON.
  assert.deepEqual(JSON.parse(JSON.stringify(overlay.glow)), { state: 'active', nid: '42' });
  assert.equal(overlay.progress.label, 'Typing "…"');
  log.ports[0].deliver({ type: 'mark', kind: 'action-start', data: { tool: 'type_text' } });
  await tick(300);
  assert.ok(log.overlays.some((o) => o.glow && o.glow.nid === '42'));
  assert.ok(log.marks.some((m) => m.kind === 'action-start'));
});
