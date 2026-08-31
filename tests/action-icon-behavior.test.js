/**
 * Behaviour + parity tests for the toolbar action icon (extension/utils/action-icon.js).
 *
 * The module had no coverage at all: the only things pinning it were two
 * importScripts COUNT assertions in lattice-provider-bridge-smoke.test.js, which
 * say nothing about what it draws or when it draws it.
 *
 * Covers:
 *   ICON-01: every state still tracks its own canonical source (drift guard)
 *   ICON-02: the icon reads no phase at all -- it diverges from the overlay
 *   ICON-03: resting frame is full strength until a relay has actually connected
 *   ICON-04: watchdog alarm is armed only while a loop is owed
 *   ICON-05: the four forms -- orbit / sweep / ring / breathe -- and their geometry
 *   ICON-06: the breathe loops for as long as a watch is armed
 *   ICON-07: a state change restarts cleanly at frame 0
 *   ICON-08: service-worker eviction recovery
 *   ICON-09: the highest-ranked claim wins: breathe > ring > orbit > sweep
 *   ICON-10: a watch armed mid-run takes the icon over immediately
 *   ICON-11: claims are per tab, so one tab ending does not clear another
 *   ICON-12: the animation clock starts with the loop, not before it
 *   ICON-13: the glyphs are decoded once per worker, not once per state
 *   ICON-14: tools classify by what they DO, reusing the registry's _readOnly flag
 *   ICON-15: FSB verbs classify identically to their MCP tool names
 *   ICON-16: activity decays on a TTL; capability and watch claims do not
 *   ICON-17: disabled autopilot action highlights suppress toolbar activity
 *   ICON-18: Ring is exclusive to balanced capability invocation lifecycles
 *   ICON-19: exact-pixel interning and deadline scheduling skip only invisible work
 *   ICON-20: setIcon is serialized, phase-correct, and failure-backoff bounded
 *   ICON-21: the animation preference is authoritative across every ingress
 *
 * ICON-01 reads the canonical sources directly, so a timing or palette change in
 * visual-feedback.js that the icon does not follow fails here. ICON-14/15 derive
 * their expectations from TOOL_REGISTRY rather than restating it, so a new tool
 * cannot silently land in the wrong animation.
 *
 * Approach: run action-icon.js in a node vm sandbox with a stubbed worker
 * environment (OffscreenCanvas / createImageBitmap / fetch / chrome / timers /
 * Date). The fake 2d context records every draw op, so geometry is asserted
 * directly rather than inferred from pixels.
 *
 * Run: node tests/action-icon-behavior.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ICON_PATH = path.join(ROOT, 'extension/utils/action-icon.js');
const GLOW_PATH = path.join(ROOT, 'extension/content/visual-feedback.js');
const MESSAGING_PATH = path.join(ROOT, 'extension/content/messaging.js');
const AGENT_LOOP_PATH = path.join(ROOT, 'extension/ai/agent-loop.js');

const ICON_SRC = fs.readFileSync(ICON_PATH, 'utf8');
const GLOW_SRC = fs.readFileSync(GLOW_PATH, 'utf8');
const MESSAGING_SRC = fs.readFileSync(MESSAGING_PATH, 'utf8');
const AGENT_LOOP_SRC = fs.readFileSync(AGENT_LOOP_PATH, 'utf8');

// Mirrors the module's own locked constants.
const BEAD_FRACTION = 0.12;
const FADE_FRACTION = 0.02;
const BEAD_SEGMENTS = 24;
const ORBIT_WIDTH_RATIO = 0.10;
const FRAME_INTERVAL_MS = 66;
const WATCHDOG = 'fsb-action-icon-watchdog';
const ACTIVITY_TTL_MS = 60000;
const BREATHE_MIN_ALPHA = 0.45;
const BREATHE_GLOW_RATIO = 0.15625;
const BREATHE_GLOW_ALPHA = 0.95;
const RELAY_SEEN_KEY = 'fsbActionIconRelaySeen';
const INTENT_KEY = 'fsbActionIconIntent';
const ANIMATIONS_KEY = 'animatedActionHighlights';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed += 1; console.log('  PASS', msg); }
  else { failed += 1; console.error('  FAIL', msg); }
}

function assertEq(actual, expected, msg) {
  const ok = actual === expected;
  if (ok) { passed += 1; console.log('  PASS', msg); }
  else { failed += 1; console.error('  FAIL', msg, '\n        expected:', expected, '\n        actual:  ', actual); }
}

function assertClose(actual, expected, tol, msg) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed += 1; console.log('  PASS', msg); }
  else { failed += 1; console.error('  FAIL', msg, '\n        expected:', expected, '+/-', tol, '\n        actual:  ', actual); }
}

// ---------------------------------------------------------------------------
// Stubbed service-worker environment
// ---------------------------------------------------------------------------

function makeWorker(opts) {
  opts = opts || {};
  let now = typeof opts.now === 'number' ? opts.now : 1000000;

  const emits = [];
  const pendingIconCalls = [];
  const alarmLog = { created: [], cleared: [] };
  const sessionStore = Object.assign({}, opts.session || {});
  const localStore = Object.assign({}, opts.local || {});
  const storageChangeListeners = [];
  const timers = new Map();
  const timeouts = new Map();
  const errors = [];
  const contexts = {};
  const scratchContexts = {};
  const fetches = [];
  let timerSeq = 0;
  let timeoutSeq = 0;
  let imageSeq = 0;
  let iconInFlight = 0;
  let maxIconInFlight = 0;
  let animationTimerWakes = 0;

  // Records every op. Reads back as ordered groups, one per renderFrame call,
  // because renderFrame opens each frame with clearRect.
  function makeCtx(size) {
    const ops = [];
    let path = [];
    const ctx = {
      _ops: ops,
      globalAlpha: 1,
      filter: 'none',
      lineWidth: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 10,
      strokeStyle: null,
      fillStyle: null,
      globalCompositeOperation: 'source-over',
      clearRect() { ops.push({ op: 'clearRect' }); },
      drawImage(bitmap, x, y, w, h) {
        ops.push({
          op: 'drawImage', x, y, w, h, alpha: ctx.globalAlpha, filter: ctx.filter,
          composite: ctx.globalCompositeOperation,
          source: bitmap && bitmap.__scratch ? 'scratch' : 'bitmap'
        });
      },
      save() { ops.push({ op: 'save' }); },
      restore() { ops.push({ op: 'restore' }); },
      beginPath() { path = []; ops.push({ op: 'beginPath' }); },
      closePath() { ops.push({ op: 'closePath' }); },
      moveTo(x, y) { path.push({ kind: 'moveTo', x, y }); ops.push({ op: 'moveTo', x, y }); },
      lineTo(x, y) { path.push({ kind: 'lineTo', x, y }); ops.push({ op: 'lineTo', x, y }); },
      arcTo(x1, y1, x2, y2, r) {
        path.push({ kind: 'arcTo', x1, y1, x2, y2, r });
        ops.push({ op: 'arcTo', x1, y1, x2, y2, r });
      },
      rect(x, y, w, h) { path.push({ kind: 'rect', x, y, w, h }); ops.push({ op: 'rect', x, y, w, h }); },
      arc(cx, cy, r, a0, a1) {
        path.push({ kind: 'arc', cx, cy, r, a0, a1 });
        ops.push({ op: 'arc', cx, cy, r, a0, a1 });
      },
      clip() { ops.push({ op: 'clip', path: path.slice() }); },
      fillRect(x, y, w, h) {
        ops.push({
          op: 'fillRect', x, y, w, h, fillStyle: ctx.fillStyle,
          composite: ctx.globalCompositeOperation
        });
      },
      fill() {
        ops.push({
          op: 'fill', fillStyle: ctx.fillStyle, alpha: ctx.globalAlpha,
          filter: ctx.filter, path: path.slice()
        });
      },
      stroke() {
        ops.push({
          op: 'stroke', lineWidth: ctx.lineWidth, lineCap: ctx.lineCap,
          lineJoin: ctx.lineJoin, miterLimit: ctx.miterLimit,
          strokeStyle: ctx.strokeStyle, alpha: ctx.globalAlpha,
          filter: ctx.filter, path: path.slice()
        });
      },
      createLinearGradient(x0, y0, x1, y1) {
        const stops = [];
        ops.push({ op: 'linear', x0, y0, x1, y1, stops });
        return { __linear: true, addColorStop(off, color) { stops.push({ off, color }); } };
      },
      getImageData() {
        imageSeq += 1;
        const image = { __img: true, size, seq: imageSeq };
        if (opts.identicalPixels) image.data = new Uint8ClampedArray(size * size * 4);
        return image;
      }
    };
    if (opts.conicGradients !== false) {
      ctx.createConicGradient = function (startAngle, cx, cy) {
        const stops = [];
        ops.push({ op: 'conic', startAngle, cx, cy, stops });
        return { __conic: true, addColorStop(off, color) { stops.push({ off, color }); } };
      };
    }
    if (opts.dropShadows === false) {
      // A context that silently rejects the filter, the way an engine without
      // canvas-filter support would.
      Object.defineProperty(ctx, 'filter', { get() { return 'none'; }, set() {} });
    }
    // The module makes its main context per size first and the glow's scratch
    // surface later, so the second one for a size is the scratch. Without this
    // the scratch would overwrite the main context and groups() would read the
    // wrong op log entirely.
    const isScratch = Object.prototype.hasOwnProperty.call(contexts, size);
    ctx.canvas = { __scratch: isScratch, width: size, height: size };
    if (isScratch) scratchContexts[size] = ctx;
    else contexts[size] = ctx;
    return ctx;
  }

  class OffscreenCanvasStub {
    constructor(w, h) { this.width = w; this.height = h; this._ctx = makeCtx(w); }
    getContext() { return this._ctx; }
  }

  const chrome = {
    runtime: { getURL: (p) => 'chrome-extension://test/' + p },
    action: {
      setIcon(arg) {
        emits.push(arg);
        iconInFlight++;
        maxIconInFlight = Math.max(maxIconInFlight, iconInFlight);
        if (opts.deferSetIcon) {
          return new Promise((resolve, reject) => {
            pendingIconCalls.push({
              resolve() { iconInFlight--; resolve(); },
              reject(err) { iconInFlight--; reject(err || new Error('setIcon rejected')); }
            });
          });
        }
        return Promise.resolve().then(() => { iconInFlight--; });
      }
    },
    storage: {
      session: {
        get: async (k) => (Object.prototype.hasOwnProperty.call(sessionStore, k) ? { [k]: sessionStore[k] } : {}),
        set: async (rec) => { Object.assign(sessionStore, rec); }
      },
      local: {
        get: async (k) => (Object.prototype.hasOwnProperty.call(localStore, k) ? { [k]: localStore[k] } : {}),
        set: async (rec) => { Object.assign(localStore, rec); }
      },
      onChanged: {
        addListener(fn) { storageChangeListeners.push(fn); }
      }
    },
    alarms: {
      create(name, info) { alarmLog.created.push({ name, info }); },
      clear(name) { alarmLog.cleared.push(name); return Promise.resolve(true); }
    }
  };

  const sandbox = {
    chrome,
    OffscreenCanvas: OffscreenCanvasStub,
    createImageBitmap: async (blob) => ({ __bitmap: blob.__url, closed: false, close() { this.closed = true; } }),
    fetch: async (url) => {
      if (opts.failGlyphs) throw new Error('glyph fetch failed');
      fetches.push(url);
      // Lets a test charge real wall-clock to the frame build, which is the only
      // way to tell "clock starts with the loop" from "clock starts before it".
      if (opts.buildDelayMs) now += opts.buildDelayMs;
      return { blob: async () => ({ __url: url }) };
    },
    setInterval(fn, ms) { timerSeq += 1; timers.set(timerSeq, { fn, ms }); return timerSeq; },
    clearInterval(id) { timers.delete(id); },
    // Activity claims expire on a timeout. Held against the fake clock so a test
    // can expire them deterministically via expireTimeouts().
    setTimeout(fn, ms) {
      timeoutSeq += 1;
      timeouts.set(timeoutSeq, { fn, at: now + (ms || 0), ms: ms || 0 });
      return timeoutSeq;
    },
    clearTimeout(id) { timeouts.delete(id); },
    Date: { now: () => now },
    console: {
      log() {},
      warn() {},
      error(...a) { errors.push(a.map(String).join(' ')); }
    }
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(ICON_SRC, context, { filename: 'action-icon.js' });

  return {
    api: context.fsbActionIcon,
    emits,
    fetches,
    alarmLog,
    sessionStore,
    localStore,
    errors,
    timerCount: () => timers.size + Array.from(timeouts.values()).filter((t) => t.ms < 1000).length,
    timeoutCount: () => Array.from(timeouts.values()).filter((t) => t.ms >= ACTIVITY_TTL_MS).length,
    retryTimerCount: () => Array.from(timeouts.values()).filter((t) => t.ms >= 1000 && t.ms < ACTIVITY_TTL_MS).length,
    killIntervals: () => {
      timers.clear();
      for (const [id, t] of Array.from(timeouts.entries())) {
        if (t.ms < 1000) timeouts.delete(id);
      }
    },
    // The deadline scheduler owns exactly one short timeout at a time.
    timerIds: () => [
      ...Array.from(timers.keys()).map((id) => 'i' + id),
      ...Array.from(timeouts.entries()).filter(([, t]) => t.ms < 1000).map(([id]) => 't' + id)
    ].join(','),
    tick: () => {
      for (const t of Array.from(timers.values())) t.fn();
      for (const [id, t] of Array.from(timeouts.entries())) {
        if (t.ms >= 1000) continue;
        timeouts.delete(id);
        animationTimerWakes++;
        t.fn();
      }
    },
    // Fire every timeout whose deadline has passed on the fake clock.
    expireTimeouts: () => {
      for (const [id, t] of Array.from(timeouts.entries())) {
        if (t.at <= now) { timeouts.delete(id); t.fn(); }
      }
    },
    advance: (ms) => { now += ms; },
    nowValue: () => now,
    animationTimerWakes: () => animationTimerWakes,
    nextAnimationDelay: () => {
      const next = Array.from(timeouts.values()).find((t) => t.ms < 1000);
      return next ? next.ms : null;
    },
    nextRetryDelay: () => {
      const next = Array.from(timeouts.values()).find((t) => t.ms >= 1000 && t.ms < ACTIVITY_TTL_MS);
      return next ? next.ms : null;
    },
    pendingIconCount: () => pendingIconCalls.length,
    maxIconInFlight: () => maxIconInFlight,
    resolveNextIcon: () => {
      const call = pendingIconCalls.shift();
      if (call) call.resolve();
    },
    rejectNextIcon: (err) => {
      const call = pendingIconCalls.shift();
      if (call) call.reject(err);
    },
    setLocal: (key, value) => {
      const oldValue = localStore[key];
      localStore[key] = value;
      const changes = { [key]: { oldValue, newValue: value } };
      for (const listener of storageChangeListeners) listener(changes, 'local');
    },
    // Ops for one canvas size, split into one group per rendered frame.
    groups: (size) => {
      const ops = (contexts[size] || { _ops: [] })._ops;
      const out = [];
      let cur = null;
      for (const o of ops) {
        if (o.op === 'clearRect') { cur = []; out.push(cur); }
        else if (cur) cur.push(o);
      }
      return out;
    },
    resetOps: (size) => { if (contexts[size]) contexts[size]._ops.length = 0; }
  };
}

// Frame builds await fetch -> blob -> createImageBitmap, so several microtask
// turns have to drain before the frames exist.
const flush = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

// Drive one animated state and hand back its rendered frames, one op group each,
// for BOTH output sizes. A state's frames are built once and cached for the life
// of the worker, so a second call renders nothing -- read both sizes from one go.
async function renderActivity(w, activity, tabId) {
  w.resetOps(16);
  w.resetOps(32);
  w.api.noteActivity(tabId === undefined ? 1 : tabId, activity);
  await flush();
  return { 16: w.groups(16), 32: w.groups(32) };
}

async function renderCapability(w, tabId) {
  w.resetOps(16);
  w.resetOps(32);
  w.api.beginCapability(tabId === undefined ? 1 : tabId);
  await flush();
  return { 16: w.groups(16), 32: w.groups(32) };
}

const opsOf = (group, op) => (group || []).filter((o) => o.op === op);

(async function run() {

  // -------------------------------------------------------------------------
  console.log('\nICON-01: each state tracks its own canonical source');
  // -------------------------------------------------------------------------

  // The icon's own table. Key order is not pinned -- only the values are.
  const iconStates = {};
  const stateRe = /^\s{4}(\w+):\s*\{(.+?)\},?$/gm;
  let m;
  while ((m = stateRe.exec(ICON_SRC)) !== null) {
    const body = m[2];
    const num = (k) => {
      const hit = body.match(new RegExp(k + ':\\s*(\\d+)'));
      return hit ? Number(hit[1]) : undefined;
    };
    const str = (k) => {
      const hit = body.match(new RegExp(k + ":\\s*'([^']+)'"));
      return hit ? hit[1].toLowerCase() : undefined;
    };
    iconStates[m[1]] = {
      duration: num('duration'),
      form: str('form'),
      from: str('from'),
      to: str('to'),
      animated: /animated:\s*true/.test(body),
      bounded: /bounded:/.test(body)
    };
  }
  assertEq(Object.keys(iconStates).length, 4, 'icon defines exactly 4 states');
  // The key IS the form. Under the tool-category model the old phase names
  // (acting / thinking) would misname the animations outright -- orbit means
  // reading now, so a key called "acting" pointing at it is a trap.
  assertEq(
    ['sweep', 'orbit', 'ring', 'breathe'].map((s) => iconStates[s] && iconStates[s].form).join(','),
    'sweep,orbit,ring,breathe',
    'every state is keyed by the form it draws'
  );

  // -- acting: still ViewportGlow, the one state that kept overlay parity ----
  const durBody = GLOW_SRC.match(/_getDuration\(\)\s*\{([\s\S]*?)\n\s{4}\}/);
  assert(!!durBody, 'located ViewportGlow._getDuration() in visual-feedback.js');
  const durSrc = durBody ? durBody[1] : '';
  const actingDur = durSrc.match(/this\.state === 'acting'\)\s*return\s*(\d+);/);
  assert(!!actingDur, 'located the acting duration in _getDuration()');
  assertEq(iconStates.orbit.duration, actingDur ? Number(actingDur[1]) : null,
    'acting: period matches ViewportGlow._getDuration()');

  const actingCss = GLOW_SRC.match(
    /\.viewport-glow-root\.state-acting\s*\{[^}]*?--glow-color-1:\s*(#[0-9a-fA-F]{6});[^}]*?--glow-color-2:\s*(#[0-9a-fA-F]{6});/);
  assert(!!actingCss, 'located the .state-acting custom properties');
  assertEq(iconStates.orbit.from, actingCss ? actingCss[1].toLowerCase() : null, 'acting: --glow-color-1 matches');
  assertEq(iconStates.orbit.to, actingCss ? actingCss[2].toLowerCase() : null, 'acting: --glow-color-2 matches');

  // -- thinking: the indeterminate progress sweep ---------------------------
  const sweepAnim = GLOW_SRC.match(/animation:\s*fsbProgressSweep\s*([\d.]+)s\s*([a-z-]+)\s*infinite/);
  assert(!!sweepAnim, 'located the fsbProgressSweep animation shorthand');
  assertEq(iconStates.sweep.duration, sweepAnim ? Math.round(Number(sweepAnim[1]) * 1000) : null,
    'thinking: period matches fsbProgressSweep');
  assertEq(sweepAnim && sweepAnim[2], 'ease-in-out', 'fsbProgressSweep is ease-in-out, as the icon assumes');

  const sweepFill = GLOW_SRC.match(/\.fsb-progress-fill\s*\{[^}]*?background:\s*linear-gradient\(90deg,\s*(#[0-9a-fA-F]{6}),\s*(#[0-9a-fA-F]{6})\)/);
  assert(!!sweepFill, 'located the .fsb-progress-fill gradient');
  assertEq(iconStates.sweep.from, sweepFill ? sweepFill[1].toLowerCase() : null, 'thinking: gradient head matches');
  assertEq(iconStates.sweep.to, sweepFill ? sweepFill[2].toLowerCase() : null, 'thinking: gradient tail matches');

  // The canonical translate range, which the design export got wrong (-160/330).
  const sweepKf = GLOW_SRC.match(/@keyframes fsbProgressSweep\s*\{[^}]*?0%\s*\{\s*transform:\s*translateX\((-?[\d.]+)%\)[^}]*?\}[^}]*?100%\s*\{\s*transform:\s*translateX\((-?[\d.]+)%\)/);
  assert(!!sweepKf, 'located the fsbProgressSweep keyframe stops');
  if (sweepKf) {
    assert(ICON_SRC.includes('SWEEP_FROM_PCT = ' + (Number(sweepKf[1]) / 100).toFixed(2)),
      'icon SWEEP_FROM_PCT tracks the canonical translateX start');
    assert(ICON_SRC.includes('SWEEP_TO_PCT = ' + (Number(sweepKf[2]) / 100).toFixed(2)),
      'icon SWEEP_TO_PCT tracks the canonical translateX end');
  }
  const sweepWidth = GLOW_SRC.match(/\.fsb-progress-bar\.indeterminate\s+\.fsb-progress-fill\s*\{[^}]*?width:\s*(\d+)%/);
  assert(!!sweepWidth, 'located the indeterminate fill width');
  if (sweepWidth) {
    assert(ICON_SRC.includes('SWEEP_FILL_FRACTION = ' + (Number(sweepWidth[1]) / 100)),
      'icon SWEEP_FILL_FRACTION tracks the canonical 38% fill');
  }

  // -- watching: the trigger badge dot cadence ------------------------------
  const badgeAnim = GLOW_SRC.match(/animation:\s*fsb-trigger-badge-dot\s*([\d.]+)s\s*([a-z-]+)\s*infinite/);
  assert(!!badgeAnim, 'located the fsb-trigger-badge-dot animation shorthand');
  assertEq(iconStates.breathe.duration, badgeAnim ? Math.round(Number(badgeAnim[1]) * 1000) : null,
    'watching: period matches the trigger badge dot');
  assertEq(badgeAnim && badgeAnim[2], 'ease-in-out', 'the badge dot is ease-in-out, as the icon assumes');
  assert(iconStates.breathe.animated, 'the breathe animates');
  // Unbounded by request: the breathe runs for as long as a watch is armed, and
  // this constant is the single line that decides it. Flipping it back to a
  // number restores the bounded hold and lets the worker sleep again.
  assert(/var BREATHE_HOLD_MS = null;/.test(ICON_SRC),
    'the breathe is unbounded -- it loops while a watch is armed');

  // -- calling: design-only, no upstream source -----------------------------
  // Asserted as an absence, so this fails loudly the day someone DOES add a ring
  // pulse upstream and the icon should start tracking it instead.
  assert(!/@keyframes\s+\w*[Cc]apRing/.test(GLOW_SRC) && !/1\.6s/.test(GLOW_SRC),
    'no capability ring pulse or 1.6s cadence exists upstream (calling is design-only)');
  assertEq(iconStates.ring.duration, 1600, 'calling: 1.6s, from the design export');
  assertEq(iconStates.ring.from, '#8b5cf6', 'calling: the capability violet');

  // -------------------------------------------------------------------------
  console.log('\nICON-02: the icon no longer reads phase at all');
  // -------------------------------------------------------------------------

  // Deliberate divergence. Every implicit visual session reports phase
  // 'planning', so phase cannot distinguish a read from a click -- the icon is
  // driven by tool class instead. The on-page overlay keeps its own phase map;
  // the two surfaces are no longer expected to agree.
  assert(!/overlayState\.phase|applyOverlayState/.test(ICON_SRC),
    'the icon reads no phase and exposes no applyOverlayState');
  assert(/const glowState = overlayState\.phase === 'calling'/.test(MESSAGING_SRC),
    'the on-page overlay still maps phases -- only the icon opted out');

  // -------------------------------------------------------------------------
  console.log('\nICON-03: resting frame is full strength until a relay connects');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });

    // Static cache renders in order: idle:on, idle:off, watching:on, watching:off,
    // ring:kickoff, each at 16 then 32. Idle sequence numbers remain unchanged.
    const IDLE_ON_32 = 2;
    const IDLE_OFF_32 = 4;

    assertEq(w.emits.length, 1, 'init emits exactly one resting frame');
    assertEq(w.emits[0].imageData[32].seq, IDLE_ON_32, 'fresh install rests on the UNDIMMED idle frame');
    assert(w.emits[0].imageData[16] && w.emits[0].imageData[32], 'every emit carries both 16 and 32');

    const g32 = w.groups(32);
    assertEq(g32.length, 5, 'four resting frames and one Ring kickoff render at 32');
    assertEq(g32[0][0].alpha, 1, 'idle:on drawn at full alpha');
    assertEq(g32[0][0].filter, 'none', 'idle:on drawn unfiltered');
    assertEq(g32[1][0].alpha, 0.5, 'idle:off drawn at half alpha');
    assert(/grayscale/.test(g32[1][0].filter), 'idle:off drawn desaturated');

    // The regression: a relay that never connects must not dim anything.
    w.api.setConnected(false);
    assertEq(w.emits.length, 1, 'a failed/never-connected relay causes no repaint');
    assertEq(w.emits[w.emits.length - 1].imageData[32].seq, IDLE_ON_32,
      'icon stays UNDIMMED when the relay has never connected');

    // Once a relay has connected, losing it is a real signal and does dim.
    w.api.setConnected(true);
    assertEq(w.emits.length, 1, 'connecting does not repaint (appearance unchanged)');
    assertEq(w.localStore[RELAY_SEEN_KEY], true, 'first connect records the relay install-wide');

    w.api.setConnected(false);
    assertEq(w.emits.length, 2, 'losing a relay that HAD connected repaints');
    assertEq(w.emits[1].imageData[32].seq, IDLE_OFF_32, 'dropped relay dims the icon');
  }

  {
    // A dashboard user restarting the browser: relay known, not yet reconnected.
    const w = makeWorker({ local: { [RELAY_SEEN_KEY]: true } });
    await w.api.init({ hasLiveSession: () => false });
    assertEq(w.emits[0].imageData[32].seq, 4, 'known relay + not connected dims from the first frame');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-04: watchdog alarm armed only while a loop is owed');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });

    const createdFor = () => w.alarmLog.created.filter((a) => a.name === WATCHDOG).length;
    const clearedFor = () => w.alarmLog.cleared.filter((n) => n === WATCHDOG).length;

    assertEq(createdFor(), 0, 'idle worker arms no watchdog');
    assert(clearedFor() >= 1, 'idle init clears any watchdog a previous generation left');

    const armedBeforeSession = createdFor();
    w.api.noteActivity(1, 'orbit');
    await flush();
    assertEq(createdFor(), armedBeforeSession + 1, 'starting an animation arms the watchdog once');
    const lastAlarm = w.alarmLog.created[w.alarmLog.created.length - 1];
    assertEq(lastAlarm && lastAlarm.info && lastAlarm.info.periodInMinutes, 0.5,
      'watchdog uses the 30s periodic floor');

    // The bug this guards: create() on an existing name restarts the period, so
    // re-arming on every state change would defer the watchdog forever.
    w.api.noteActivity(1, 'sweep');
    await flush();
    w.api.noteActivity(1, 'orbit');
    await flush();
    w.api.beginCapability(1);
    await flush();
    assertEq(createdFor(), armedBeforeSession + 1,
      'activity churn does NOT re-create the alarm (no period reset)');

    // A watch outranks the activity, so it takes over rather than going idle.
    w.api.setWatching(true, 2);
    await flush();
    assertEq(w.timerCount(), 1, 'the watch takes over and still owes a loop');

    const clearedBefore = clearedFor();
    w.api.setWatching(false, 2);
    w.api.endCapability(1);
    w.advance(ACTIVITY_TTL_MS + 1);
    w.expireTimeouts();
    await flush();
    assertEq(clearedFor() > clearedBefore, true, 'the last claim ending clears the watchdog');
    assertEq(w.timerCount(), 0, 'the last claim ending stops the frame loop');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-05a: acting traces the sharp square perimeter');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });

    const acting = await renderActivity(w, 'orbit');
    assertEq(acting[32].length, Math.round(4000 / 66),
      'acting still builds one 4-second cycle of orbit frames');
    assert(!/createConicGradient|strokeBeadConic|conicGradients/.test(ICON_SRC),
      'Orbit no longer carries a circular/conic-gradient code path');

    const close = (a, b, tol = 1e-7) => Math.abs(a - b) <= tol;
    const pointsOf = (stroke) => (stroke && stroke.path || [])
      .filter((p) => p.kind === 'moveTo' || p.kind === 'lineTo');
    const strokeAlpha = (stroke) => {
      const hit = stroke && String(stroke.strokeStyle).match(/,\s*([\d.]+)\)\s*$/);
      return hit ? Number(hit[1]) : NaN;
    };

    for (const size of [16, 32]) {
      const width = ORBIT_WIDTH_RATIO * size;
      const half = width / 2;
      const far = size - half;
      const side = size - width;
      const frames = acting[size];
      const firstFrame = frames[0] || [];
      const strokes = opsOf(firstFrame, 'stroke');

      assertEq(opsOf(firstFrame, 'arc').length, 0, `${size}px: Orbit draws no circular arcs`);
      assertEq(opsOf(firstFrame, 'conic').length, 0, `${size}px: Orbit draws no conic gradient`);
      assertEq(strokes.length, BEAD_SEGMENTS, `${size}px: Orbit uses the locked segment count`);
      assert(strokes.every((s) => s.lineCap === 'butt' && s.lineJoin === 'miter'),
        `${size}px: segments use butt caps and sharp miter joins`);

      const firstPoints = pointsOf(strokes[0]);
      const start = firstPoints[0] || { x: NaN, y: NaN };
      assertClose(start.x, size / 2, 1e-7, `${size}px: progress 0 starts at top centre`);
      assertClose(start.y, half, 1e-7, `${size}px: top edge sits half a stroke inside`);

      const lastPoints = pointsOf(strokes[strokes.length - 1]);
      const end = lastPoints[lastPoints.length - 1] || { x: NaN, y: NaN };
      assertClose(end.x, half + (0.5 + BEAD_FRACTION * 4) * side, 1e-7,
        `${size}px: trailing edge lands exactly 12% of the perimeter after the start`);
      assertClose(end.y, half, 1e-7, `${size}px: the initial bead remains on the top edge`);

      const firstAlpha = strokeAlpha(strokes[0]);
      const middleAlpha = strokeAlpha(strokes[Math.floor(strokes.length / 2)]);
      const lastAlpha = strokeAlpha(strokes[strokes.length - 1]);
      const expectedEdgeAlpha = (0.5 / BEAD_SEGMENTS) / (FADE_FRACTION / BEAD_FRACTION);
      assertClose(firstAlpha, expectedEdgeAlpha, 1e-9, `${size}px: leading fade is preserved`);
      assertClose(lastAlpha, expectedEdgeAlpha, 1e-9, `${size}px: trailing fade is preserved`);
      assertClose(middleAlpha, 1, 1e-9, `${size}px: bead centre remains fully opaque`);

      let allOnEdges = true;
      let allInside = true;
      let noDiagonals = true;
      const visited = new Set();
      for (const frame of frames) {
        for (const stroke of opsOf(frame, 'stroke')) {
          const points = pointsOf(stroke);
          for (const point of points) {
            const onTop = close(point.y, half);
            const onRight = close(point.x, far);
            const onBottom = close(point.y, far);
            const onLeft = close(point.x, half);
            if (!(onTop || onRight || onBottom || onLeft)) allOnEdges = false;
            if (point.x - half < -1e-7 || point.x + half > size + 1e-7
                || point.y - half < -1e-7 || point.y + half > size + 1e-7) {
              allInside = false;
            }
            if (onTop) visited.add('top');
            if (onRight) visited.add('right');
            if (onBottom) visited.add('bottom');
            if (onLeft) visited.add('left');
          }
          for (let i = 1; i < points.length; i++) {
            if (!close(points[i - 1].x, points[i].x)
                && !close(points[i - 1].y, points[i].y)) {
              noDiagonals = false;
            }
          }
        }
      }
      assert(allOnEdges, `${size}px: every Orbit coordinate lies on a square edge`);
      assert(allInside, `${size}px: the outer stroke edge hugs but never leaves the tile`);
      assert(noDiagonals, `${size}px: no segment shortcuts diagonally across a corner`);
      assertEq(Array.from(visited).sort().join(','), 'bottom,left,right,top',
        `${size}px: one cycle visits all four edges`);

      const secondFrameStrokes = opsOf(frames[1] || [], 'stroke');
      const cornerStroke = secondFrameStrokes.find((stroke) =>
        pointsOf(stroke).some((p) => close(p.x, far) && close(p.y, half)));
      assert(!!cornerStroke, `${size}px: a corner-crossing frame explicitly visits top-right`);
      assert(pointsOf(cornerStroke).length >= 3,
        `${size}px: the corner is an intermediate vertex rather than a diagonal endpoint`);

      const nextStart = pointsOf(secondFrameStrokes[0])[0] || { x: NaN, y: NaN };
      assert(close(nextStart.y, half) && nextStart.x > start.x,
        `${size}px: frame progression moves clockwise from top centre`);
    }
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-05b: thinking is the indeterminate sweep bar');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    const thinking = await renderActivity(w, 'sweep');
    const frames = thinking[32];

    assertEq(frames.length, Math.round(1200 / 66), 'thinking builds one cycle of sweep frames');
    const f0 = frames[0] || [];

    assertEq(opsOf(f0, 'arc').length, 0, 'the sweep carries no orbit bead');
    assertEq(opsOf(f0, 'fill').length, 2, 'two fills: the track and the moving fill');
    assertEq(opsOf(f0, 'clip').length, 1, 'the fill is clipped to the track, as overflow:hidden does');
    assertEq(opsOf(f0, 'save').length, 1, 'the clip is scoped by save/restore');
    assertEq(opsOf(f0, 'restore').length, 1, 'the clip is released');

    const track = opsOf(f0, 'fill')[0];
    assertEq(track && track.fillStyle, 'rgba(255, 255, 255, 0.1)', 'track uses the canonical track colour');
    const trackRect = track && track.path.find((p) => p.kind === 'rect' || p.kind === 'arcTo');
    assert(!!trackRect, 'track is a real path, not an empty one');

    // Geometry: 59.4% wide, 2px tall at 32, centred on the clear band at y 0.75.
    const trackW = 0.594 * 32;
    const grads = opsOf(f0, 'linear');
    assertEq(grads.length, 1, 'the moving fill uses one linear gradient');
    const g0 = grads[0] || { stops: [] };
    assertEq(g0.stops.length, 2, 'gradient runs head -> tail');
    assertEq(g0.stops[0] && g0.stops[0].color, '#ff8c00', 'gradient head is the canonical #FF8C00');
    assertEq(g0.stops[1] && g0.stops[1].color, '#ff6600', 'gradient tail is the canonical #FF6600');
    assertClose(g0.x1 - g0.x0, 0.38 * trackW, 1e-6, 'gradient spans exactly the 38% fill width');

    // The fill travels -120% -> +320% of its OWN width across the cycle.
    const fillW = 0.38 * trackW;
    const trackX = (32 - trackW) / 2;
    const fillXAt = (i) => {
      const g = opsOf(frames[i] || [], 'linear')[0];
      return g ? g.x0 : NaN;
    };
    assertClose(fillXAt(0), trackX + (-1.2 * fillW), 1e-6, 'progress 0 starts the fill fully off the left');
    const last = frames.length - 1;
    assert(fillXAt(last) > trackX + trackW, 'the fill ends past the right edge of the track');
    let monotonic = true;
    for (let i = 1; i < frames.length; i++) {
      if (!(fillXAt(i) > fillXAt(i - 1))) monotonic = false;
    }
    assert(monotonic, 'the sweep advances monotonically across the cycle');

    // ease-in-out means the midpoint is the midpoint, and the ends are slower.
    const mid = frames.length >> 1;
    const span = fillXAt(last) - fillXAt(0);
    assertClose((fillXAt(mid) - fillXAt(0)) / span, 0.5, 0.06,
      'ease-in-out puts the halfway frame near the halfway position');
    assert((fillXAt(1) - fillXAt(0)) < (fillXAt(mid) - fillXAt(mid - 1)),
      'ease-in-out starts slower than it runs at the midpoint');

    // At 16 the track collapses to a single pixel row and must still be drawn.
    const small = thinking[16][0] || [];
    const smallTrack = opsOf(small, 'fill')[0];
    assert(!!smallTrack, '16px still paints a track');
    const rect16 = smallTrack.path.find((p) => p.kind === 'rect');
    assert(!!rect16 && rect16.h >= 1, '16px track is at least one physical pixel tall');
    assert(!!rect16 && rect16.y + rect16.h <= 16, '16px track stays inside the tile');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-05c: calling is an inset ring with an inward ping');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    const calling = await renderCapability(w);
    const frames = calling[32];
    assertEq(frames.length, Math.round(1600 / 66), 'calling builds one cycle of ring frames');

    // Scaled for legibility: the design's 3/128 is 0.75px at 32, and the 1px
    // hairline it floored to did not read as a pulse at toolbar size.
    assertEq(opsOf(frames[0] || [], 'stroke')[0].lineWidth, 2, 'ring is 2px at 32');
    assertEq(opsOf(calling[16][0] || [], 'stroke')[0].lineWidth, 1, 'ring is 1px at 16');

    const f0 = frames[0] || [];
    assertEq(opsOf(f0, 'arc').length, 0, 'the ring carries no orbit bead');
    const s0 = opsOf(f0, 'stroke');
    assertEq(s0.length, 2, 'progress 0 draws the inset ring plus the ping');
    assert(/139, 92, 246/.test(s0[0] && s0[0].strokeStyle || ''), 'ring uses the capability violet');

    const ringRect = s0[0] && s0[0].path.find((p) => p.kind === 'rect');
    assert(!!ringRect, 'the ring is a rect stroke');
    assert(!!ringRect && ringRect.x === s0[0].lineWidth / 2,
      'the ring is inset by half its own stroke width, so it sits fully inside the tile');
    assert(!!ringRect && ringRect.x + ringRect.w + s0[0].lineWidth / 2 <= 32,
      'the ring stays inside the 32px tile');

    // Alpha dips to the 70% stop and recovers by 100%.
    const alphaOf = (i) => {
      const st = opsOf(frames[i] || [], 'stroke')[0];
      const hit = st && String(st.strokeStyle).match(/,\s*([\d.]+)\)\s*$/);
      return hit ? Number(hit[1]) : NaN;
    };
    assertClose(alphaOf(0), 0.9, 1e-6, 'ring starts at the 0% alpha of 0.9');
    const dipIdx = Math.round(0.7 * frames.length);
    assertClose(alphaOf(Math.min(dipIdx, frames.length - 1)), 0.35, 0.06,
      'ring dips to 0.35 at the 70% stop');
    assert(alphaOf(frames.length - 1) > alphaOf(dipIdx - 1),
      'ring recovers between the 70% and 100% stops');

    // The ping travels INWARD and fades out, then stops being drawn entirely.
    const pingRect = (i) => {
      const st = opsOf(frames[i] || [], 'stroke')[1];
      return st ? st.path.find((p) => p.kind === 'rect') : null;
    };
    const p0 = pingRect(0);
    const pMid = pingRect(Math.round(0.35 * frames.length));
    assert(!!p0 && !!pMid, 'the ping is drawn early in the cycle');
    assert(!!p0 && !!pMid && pMid.x > p0.x && pMid.w < p0.w,
      'the ping contracts inward rather than spreading outward');
    // Full travel is CAP_PING_INSET_RATIO * size; at 32 that is ~4.8px.
    const pLate = pingRect(Math.round(0.65 * frames.length));
    assert(!!pLate && (pLate.x - p0.x) > 4,
      'the ping travels at least 4px inward before it fades out');
    assertEq(opsOf(frames[frames.length - 1] || [], 'stroke').length, 1,
      'after the 70% stop only the ring remains -- the ping has finished');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-05d: the breathe moves the MARK, never the plate');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    w.resetOps(16);
    w.resetOps(32);
    w.api.setWatching(true);
    await flush();
    const frames16 = w.groups(16);
    const frames = w.groups(32);
    assertEq(frames.length, Math.round(2400 / 66), 'watching builds one cycle of breathe frames');
    assertEq(frames16.length, frames.length, 'Breathe builds the same cycle at 16px and 32px');

    const f0 = frames[0] || [];
    assertEq(opsOf(f0, 'arc').length, 0, 'breathe draws no bead');
    assertEq(opsOf(f0, 'stroke').length, 0, 'breathe draws no ring');

    // THE regression this guards. The artwork is a flat opaque tile, so fading
    // it fades the whole icon -- the plate has to be repainted solid and the
    // mark composited over it, exactly as the design nests the lockup inside a
    // static black container.
    const plateAt = (frameSet, i) => opsOf(frameSet[i] || [], 'fillRect')[0];
    const plate0 = plateAt(frames, 0);
    assert(!!plate0, 'every breathe frame repaints the plate');
    assertEq(plate0 && plate0.fillStyle, '#000000', 'the plate is solid black');
    assertEq(plate0 && plate0.w, 32, 'and covers the whole tile');
    assertEq(plate0 && plate0.composite, 'source-over', 'painted normally, not blended');

    // The mark is the LAST drawImage -- the glow pass, when present, precedes it.
    const markAt = (frameSet, i) => {
      const draws = opsOf(frameSet[i] || [], 'drawImage').filter((d) => d.source === 'bitmap');
      return draws[draws.length - 1] || {};
    };
    const glowAt = (frameSet, i) => opsOf(frameSet[i] || [], 'drawImage').find((d) => d.source === 'scratch');
    const mid = frames.length >> 1;

    assertClose(markAt(frames, 0).alpha, BREATHE_MIN_ALPHA, 1e-6,
      'the mark starts at the stronger 0% opacity trough');
    assertClose(markAt(frames, mid).alpha, 1, 1e-6, 'and peaks at full opacity at 50%');
    assertClose(markAt(frames, frames.length - 1).alpha, BREATHE_MIN_ALPHA, 0.04,
      'and returns to the stronger opacity trough by 100%');
    assertEq(markAt(frames, mid).composite, 'source-over', 'the mark composites normally over the plate');

    // The glow is built from the mark, so it hugs the lettering rather than
    // haloing the square the way a filter on the tile would.
    assert(!glowAt(frames, 0), 'no glow at the trough, matching drop-shadow(0 0 0)');
    const g = glowAt(frames, mid);
    assert(!!g, 'the peak carries a glow pass');
    assertEq(g && g.composite, 'lighter', 'the glow is added, so the black plate contributes nothing');
    assert(g && /blur\(/.test(g.filter), 'the glow is a blur of the mark');
    assertClose(g ? g.alpha : NaN, BREATHE_GLOW_ALPHA, 1e-6,
      'the glow peaks at the strengthened alpha');

    const blurAt = (frameSet, i) => {
      const hit = glowAt(frameSet, i);
      const m = hit && String(hit.filter).match(/blur\(([\d.]+)px\)/);
      return m ? Number(m[1]) : 0;
    };
    assertClose(blurAt(frames16, mid), BREATHE_GLOW_RATIO * 16, 0.01,
      '16px glow blur peaks at 20/128 of the tile');
    assertClose(blurAt(frames, mid), BREATHE_GLOW_RATIO * 32, 0.01,
      '32px glow blur peaks at 20/128 of the tile');
    assertEq(blurAt(frames, 0), 0, 'glow blur starts at zero, not at full size');
    let blurRises = true;
    for (let i = 1; i <= mid; i++) {
      if (!(blurAt(frames, i) >= blurAt(frames, i - 1))) blurRises = false;
    }
    assert(blurRises, 'glow blur grows monotonically into the peak');

    let rises = true;
    for (let i = 1; i <= mid; i++) {
      if (!(markAt(frames, i).alpha >= markAt(frames, i - 1).alpha)) rises = false;
    }
    assert(rises, 'mark opacity rises monotonically into the peak');

    for (const [size, frameSet] of [[16, frames16], [32, frames]]) {
      const sizeMid = frameSet.length >> 1;
      for (const [phase, frameIndex] of [['trough', 0], ['peak', sizeMid]]) {
        const mark = markAt(frameSet, frameIndex);
        assertEq(mark.x, 0, `Breathe keeps the ${size}px ${phase} fixed on the x axis`);
        assertEq(mark.y, 0, `Breathe keeps the ${size}px ${phase} fixed on the y axis`);
        assertEq(mark.w, size, `Breathe does not scale the ${size}px ${phase} width`);
        assertEq(mark.h, size, `Breathe does not scale the ${size}px ${phase} height`);
      }
    }
  }

  {
    // A context that rejects drop-shadow degrades to an alpha-only breathe
    // rather than disabling the icon.
    const w = makeWorker({ dropShadows: false });
    await w.api.init({ hasLiveSession: () => false });
    w.resetOps(32);
    w.api.setWatching(true);
    await flush();
    const frames = w.groups(32);
    const mid = frames.length >> 1;
    const draw = opsOf(frames[mid] || [], 'drawImage')[0] || {};
    assert(frames.length > 0, 'breathe frames still build without drop-shadow support');
    assertEq(draw.filter, 'none', 'no filter is applied when drop-shadow is unsupported');
    assertClose(draw.alpha, 1, 1e-6, 'the opacity half of breathe still runs');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-06: the breathe loops for as long as a watch is armed');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });

    // Static cache order is unchanged: seq 2 is idle:on@32.
    const IDLE_ON_32 = 2;

    w.api.setWatching(true);
    await flush();
    assertEq(w.timerCount(), 1, 'arming a watch starts a breathe loop');
    assert(w.alarmLog.created.some((a) => a.name === WATCHDOG),
      'the breathe arms the watchdog while it owes a loop');

    w.advance(1000);
    w.tick();
    const midEmits = w.emits.length;
    assert(midEmits > 1, 'the breathe repaints while it runs');

    // It does NOT retire itself -- unbounded by request. The cost is that the
    // service worker stays awake for as long as the watch is armed.
    w.advance(61000);
    w.tick();
    await flush();
    assertEq(w.timerCount(), 1, 'the breathe is still looping a minute later');
    assert(w.emits.length > midEmits, 'and still repainting');

    // Only dropping the claim stops it. The breathe MEANS "a watch is armed", so
    // once it is gone there is nothing left to say and the icon goes to idle.
    w.api.setWatching(false);
    await flush();
    assertEq(w.timerCount(), 0, 'disarming stops the loop');
    assert(w.alarmLog.cleared.includes(WATCHDOG), 'and clears the watchdog');
    assertEq(w.emits[w.emits.length - 1].imageData[32].seq, IDLE_ON_32,
      'disarming drops straight to the idle frame');
  }

  {
    // A live session outranks the ambient breathe.
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    w.api.noteActivity(1, 'orbit');
    await flush();
    const before = w.emits.length;
    w.api.setWatching(true);
    await flush();
    w.advance(200);   // past a frame boundary; emit() dedupes identical frames
    w.tick();
    assert(w.emits.length > before, 'a loop keeps running across the takeover');
    assertEq(w.sessionStore[INTENT_KEY].resolved, 'breathe',
      'a watch armed mid-run takes the icon over -- it outranks every activity');
    assertEq(w.sessionStore[INTENT_KEY].claims['watch:global'], 'breathe',
      'and is recorded as a claim');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-07: a state change restarts cleanly at frame 0');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });

    w.api.noteActivity(1, 'orbit');   // 4000ms orbit
    await flush();
    assert(w.timerCount() === 1, 'animating runs exactly one interval');

    // Quarter of the way through the acting cycle.
    w.advance(1000);
    w.api.noteActivity(1, 'sweep'); // 1200ms sweep
    await flush();

    const record = w.sessionStore[INTENT_KEY] || {};
    assertEq(record.resolved, 'sweep', 'intent records the resolved state');
    assertEq(record.animating, true, 'intent records that a loop is owed');
    assertEq(record.claims['session:1'], undefined, 'activity claims are not persisted');

    // Every state owns a distinct form, so there is no visual position worth
    // carrying across a change -- the new form starts at its own frame 0.
    const before = w.emits.length;
    w.tick();
    assert(w.emits.length >= before, 'loop keeps emitting after the state change');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-08: service-worker eviction recovery');
  // -------------------------------------------------------------------------

  {
    // Worker died mid-animation, session is still live -> restart the loop.
    const w = makeWorker({
      session: { [INTENT_KEY]: { animating: true, claims: { 'watch:1': 'breathe' }, resolved: 'breathe', connected: true, updatedAt: 1 } },
      local: { [RELAY_SEEN_KEY]: true }
    });
    await w.api.init({ hasLiveSession: () => true });
    await new Promise((r) => setImmediate(r));
    assertEq(w.timerCount(), 1, 'live session revives the frame loop');
    assertEq(w.alarmLog.created.filter((a) => a.name === WATCHDOG).length, 1,
      'revived loop re-arms the watchdog');
  }

  {
    // Worker died mid-animation, but the session is gone -> snap to static.
    const w = makeWorker({
      session: { [INTENT_KEY]: { animating: true, claims: { 'watch:1': 'breathe' }, resolved: 'breathe', connected: true, updatedAt: 1 } }
    });
    await w.api.init({ hasLiveSession: () => false });
    await flush();
    // A watch claim legitimately outlives its worker -- the trigger runtime owns
    // it and restores it independently, so no live session is needed to justify
    // it. Only session-scoped claims are dropped when the probe says no.
    assertEq(w.timerCount(), 1, 'a restored watch claim revives its breathe');
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'breathe',
      'and resolves to the breathe');
  }

  {
    // A stored SESSION claim with no live session behind it is dropped.
    const w = makeWorker({
      session: { [INTENT_KEY]: { animating: true, claims: { 'session:1': 'orbit' }, resolved: 'orbit', connected: true, updatedAt: 1 } }
    });
    await w.api.init({ hasLiveSession: () => false });
    await flush();
    assertEq(w.timerCount(), 0, 'a stale session claim does not resurrect a loop');
    assertEq((w.sessionStore[INTENT_KEY] || {}).animating, false, 'stale intent is corrected on disk');
    assert(w.alarmLog.cleared.includes(WATCHDOG), 'stale intent clears the watchdog');
  }

  {
    // An in-flight promise cannot survive service-worker eviction. Even if an
    // older generation accidentally wrote Ring into session storage, recovery
    // must not resurrect it without a matching promise that can end it.
    const w = makeWorker({
      session: { [INTENT_KEY]: { animating: true, claims: { 'capability:1': 'ring' }, resolved: 'ring', connected: true, updatedAt: 1 } }
    });
    await w.api.init({ hasLiveSession: () => true });
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, null,
      'service-worker recovery discards a stale capability Ring');
    assertEq(w.timerCount(), 0, 'a stale capability claim cannot revive an animation loop');
  }

  {
    // Base frames fail to render -> the icon disables itself AND retires any beat
    // an earlier generation armed, because repair() no-ops once unavailable.
    const w = makeWorker({ failGlyphs: true });
    await w.api.init({ hasLiveSession: () => true });
    assertEq(w.emits.length, 0, 'a failed frame build paints nothing');
    assert(w.alarmLog.cleared.includes(WATCHDOG), 'a failed frame build retires the watchdog');
    assert(w.errors.some((e) => /base frames failed/.test(e)), 'the frame-build failure is reported once');
  }

  {
    // Degraded environment: no OffscreenCanvas -> every method is a silent no-op.
    const w = makeWorker();
    const ctx = vm.createContext({
      chrome: { action: { setIcon() {} }, storage: {}, alarms: {} },
      console: { log() {}, warn() {}, error() {} }
    });
    vm.runInContext(ICON_SRC, ctx, { filename: 'action-icon.js' });
    await ctx.fsbActionIcon.init({});
    ctx.fsbActionIcon.noteActivity(1, 'orbit');
    ctx.fsbActionIcon.setWatching(true);
    ctx.fsbActionIcon.setConnected(true);
    await ctx.fsbActionIcon.repair();
    assert(true, 'a worker without OffscreenCanvas degrades silently instead of throwing');
    assertEq(w.errors.filter((e) => /setIcon failed/.test(e)).length, 0, 'no spurious emit failures');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-09: the highest-ranked claim wins, across tabs and agents');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    const resolvedNow = () => (w.sessionStore[INTENT_KEY] || {}).resolved;

    // Rank order is breathe > ring > orbit > sweep. Build it from the bottom up.
    w.api.noteActivity(1, 'sweep');
    await flush();
    assertEq(resolvedNow(), 'sweep', 'a lone driving claim resolves to sweep');

    w.api.noteActivity(2, 'orbit');
    await flush();
    assertEq(resolvedNow(), 'orbit', 'reading outranks driving on another tab');

    w.api.beginCapability(3);
    await flush();
    assertEq(resolvedNow(), 'ring', 'an in-flight capability outranks reading');

    // A watch wins over everything, on any tab -- this is the whole point of
    // putting it top: it is the one state the user armed and is waiting on.
    w.api.setWatching(true, 4);
    await flush();
    assertEq(resolvedNow(), 'breathe', 'a watch outranks every activity on every tab');

    // More activity on other tabs cannot displace it.
    w.api.beginCapability(5);
    w.api.noteActivity(6, 'orbit');
    await flush();
    assertEq(resolvedNow(), 'breathe', 'further activity does not displace the watch');

    // Unwind top-down.
    w.api.setWatching(false, 4);
    await flush();
    assertEq(resolvedNow(), 'ring', 'dropping the watch falls back to the top activity');

    w.api.dropTab(3);
    w.api.dropTab(5);
    await flush();
    assertEq(resolvedNow(), 'orbit', 'then to reading');

    w.api.dropTab(2);
    w.api.dropTab(6);
    await flush();
    assertEq(resolvedNow(), 'sweep', 'then to driving');

    w.api.dropTab(1);
    await flush();
    assertEq(resolvedNow(), null, 'no claims left resolves to idle');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-10: a watch armed mid-run takes over immediately');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });

    w.api.noteActivity(1, 'orbit');
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'orbit', 'a read is running');

    // The old build DROPPED this outright while a session animated, and MCP
    // sessions stay running for 60s -- so an arm inside that window drew nothing
    // at all. It now wins instantly instead of waiting its turn.
    w.api.setWatching(true, 1);
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'breathe',
      'arming mid-run takes the icon over at once');
    assertEq((w.sessionStore[INTENT_KEY] || {}).claims['watch:1'], 'breathe',
      'the watch is recorded as a claim');
    assertEq(w.timerCount(), 1, 'and it runs a loop');

    // The activity underneath is still there; it resurfaces when the watch goes.
    w.api.setWatching(false, 1);
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'orbit',
      'the read underneath resurfaces once the watch is disarmed');
  }

  {
    // init() is called at top level in the service worker, so status updates can
    // land while its async body is still running. The old code dropped those
    // outright (`if (unavailable || !ready) return`); a claim must survive.
    const w = makeWorker();
    const booting = w.api.init({ hasLiveSession: () => true });
    w.api.noteActivity(5, 'orbit');
    await booting;
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'orbit',
      'an activity claim that races init is honoured, not dropped');

    const w2 = makeWorker();
    const booting2 = w2.api.init({ hasLiveSession: () => true });
    w2.api.setWatching(true, 6);
    await booting2;
    await flush();
    assertEq((w2.sessionStore[INTENT_KEY] || {}).claims['watch:6'], 'breathe',
      'and so is a watch that races it');

    const w3 = makeWorker();
    const booting3 = w3.api.init({ hasLiveSession: () => true });
    w3.api.beginCapability(10);
    await booting3;
    await flush();
    assertEq((w3.sessionStore[INTENT_KEY] || {}).resolved, 'ring',
      'a capability begin that races init is honoured');
    w3.api.endCapability(10);
    await flush();
    assertEq((w3.sessionStore[INTENT_KEY] || {}).resolved, null,
      'the matching capability end still clears a startup-race claim');
  }

  {
    // A live arm during boot coexists with a stored claim rather than being
    // clobbered by the restore.
    const w = makeWorker({
      session: { [INTENT_KEY]: { animating: true, claims: { 'watch:5': 'breathe' }, resolved: 'breathe', connected: true, updatedAt: 1 } }
    });
    const booting = w.api.init({ hasLiveSession: () => true });
    w.api.setWatching(true, 9);
    await booting;
    await flush();
    const merged = (w.sessionStore[INTENT_KEY] || {}).claims || {};
    assertEq(merged['watch:5'], 'breathe', 'the stored watch is restored');
    assertEq(merged['watch:9'], 'breathe', 'and a watch that raced init survives alongside it');
  }

  {
    // A disarm during boot is also authoritative even though the claim has not
    // been restored into memory yet.
    const w = makeWorker({
      session: { [INTENT_KEY]: { animating: true, claims: { 'watch:5': 'breathe' }, resolved: 'breathe', connected: true, updatedAt: 1 } }
    });
    const booting = w.api.init({ hasLiveSession: () => true });
    w.api.setWatching(false, 5);
    await booting;
    await flush();
    const restored = (w.sessionStore[INTENT_KEY] || {}).claims || {};
    assertEq(restored['watch:5'], undefined,
      'a watch disarmed during init is not resurrected from persisted intent');
    assertEq(w.timerCount(), 0, 'the stale watch does not restart the breathe loop');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-11: per-tab claims, so one tab ending does not clear another');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });

    w.api.setWatching(true, 1);
    w.api.setWatching(true, 2);
    await flush();
    assertEq(w.timerCount(), 1, 'two watches resolve to one breathe');
    const loopBefore = w.timerIds();
    const settledEmits = w.emits.length;

    // The old global boolean turned this into "nothing is watching" and cost a
    // full breathe every time; per-tab claims make it a no-op.
    w.api.setWatching(false, 2);
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'breathe',
      'tab 1 is still watching, so the resolved state does not change');
    assertEq(w.timerIds(), loopBefore, 'the same loop keeps running -- no restart');
    assertEq(w.emits.length, settledEmits, 'nothing repaints');

    // Only the last watcher going away drops to idle.
    w.api.setWatching(false, 1);
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, null, 'the last watcher clears it');
  }

  {
    // A closed tab cannot keep a claim alive.
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    w.api.noteActivity(7, 'orbit');
    w.api.noteActivity(8, 'sweep');
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'orbit', 'tab 7 is reading');

    w.api.dropTab(7);
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'sweep',
      'closing the reading tab falls back to the driving claim on tab 8');
    assertEq((w.sessionStore[INTENT_KEY] || {}).claims['session:7'], undefined,
      'the closed tab keeps no claims');

    // Tab id suffixes must not match by accident (":8" vs ":18").
    const w2 = makeWorker();
    await w2.api.init({ hasLiveSession: () => false });
    w2.api.setWatching(true, 18);
    await flush();
    w2.api.dropTab(8);
    await flush();
    assertEq((w2.sessionStore[INTENT_KEY] || {}).claims['watch:18'], 'breathe',
      'dropping tab 8 does not strip tab 18');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-12: the animation clock starts with the loop, not before it');
  // -------------------------------------------------------------------------

  {
    // Charge 900ms of fake wall-clock to the frame build. If startTime were set
    // before the build (the old bug), the cycle would begin 900ms in and a
    // bounded hold would be 900ms short.
    const w = makeWorker({ buildDelayMs: 450 });   // 2 fetches -> 900ms total
    await w.api.init({ hasLiveSession: () => false });
    const staticEmits = w.emits.length;

    w.api.noteActivity(1, 'orbit');
    await flush();

    // Static cache is seqs 1-10; the acting frames follow, frame f at 32 = 12+2f.
    const first = w.emits[staticEmits];
    assert(!!first, 'the loop emitted a frame');
    assertEq(first && first.imageData[32].seq, 12,
      'the first frame shown is frame 0, not a frame partway into the cycle');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-16: activity decays; capability and watch claims do not');
  // -------------------------------------------------------------------------

  {
    assert(
      new RegExp('\\bvar ACTIVITY_TTL_MS = ' + ACTIVITY_TTL_MS + ';').test(ICON_SRC),
      'the activity lifetime contract is exactly 60 seconds'
    );

    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });

    // A tool call is instantaneous, so the claim has to expire on its own --
    // nothing sends an "I stopped reading" signal.
    w.api.noteActivity(1, 'orbit');
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'orbit', 'the read is claimed');

    w.advance(ACTIVITY_TTL_MS - 100);
    w.expireTimeouts();
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'orbit', 'still claimed just under the TTL');

    w.advance(200);
    w.expireTimeouts();
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, null, 'the claim decays once the TTL passes');
    assertEq(w.timerCount(), 0, 'and the loop stops');

    // A second call of the same kind refreshes the deadline without restarting
    // the animation that is already on screen.
    w.api.noteActivity(1, 'sweep');
    await flush();
    w.advance(ACTIVITY_TTL_MS - 100);
    w.expireTimeouts();
    await flush();
    const beforeRefresh = w.emits.length;
    w.api.noteActivity(1, 'sweep');
    await flush();
    assertEq(w.timerCount(), 1, 'a repeated animation keeps exactly one scheduler live');
    assertEq(w.emits.length, beforeRefresh,
      'a repeated animation extends its deadline without restarting at frame zero');
    w.advance(200);
    w.expireTimeouts();
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'sweep',
      'a repeated call survives the original 60-second deadline');

    w.advance(ACTIVITY_TTL_MS - 201);
    w.expireTimeouts();
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'sweep',
      'the refreshed claim remains active immediately before its new deadline');

    w.advance(2);
    w.expireTimeouts();
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, null,
      'the refreshed claim expires immediately after its new deadline');

    // A watch claim carries no expiry at all.
    w.api.setWatching(true, 2);
    await flush();
    w.advance(ACTIVITY_TTL_MS * 10);
    w.expireTimeouts();
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'breathe',
      'the watch outlives every activity TTL');
  }

  {
    // Each tab keeps one tool claim. A newer call on that tab replaces the old
    // form immediately, even when the replacement has a lower global rank, and
    // receives its own full lifetime.
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    w.api.noteActivity(1, 'orbit');
    await flush();
    w.advance(ACTIVITY_TTL_MS - 100);
    w.expireTimeouts();

    w.api.noteActivity(1, 'sweep');
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'sweep',
      'a same-tab call immediately replaces the previous higher-ranked form');

    w.advance(200);
    w.expireTimeouts();
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'sweep',
      'the replacement receives a fresh 60-second deadline');

    w.advance(ACTIVITY_TTL_MS - 201);
    w.expireTimeouts();
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'sweep',
      'the replacement remains active immediately before its own deadline');

    w.advance(2);
    w.expireTimeouts();
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, null,
      'the replacement expires immediately after its own deadline');
  }

  {
    // Across tabs, rank remains authoritative. A hidden lower-ranked claim keeps
    // its own deadline and can surface when the higher-ranked claim expires.
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    w.api.noteActivity(1, 'orbit');
    await flush();
    w.advance(1000);
    w.api.noteActivity(2, 'sweep');
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'orbit',
      'a newer lower-ranked claim on another tab does not displace Orbit');

    w.advance(ACTIVITY_TTL_MS - 999);
    w.expireTimeouts();
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'sweep',
      'the still-live lower-ranked claim surfaces when Orbit expires');
  }

  {
    // The inverse ordering proves an already-expired hidden claim is not
    // resurrected when the claim that suppressed it eventually ends.
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    w.api.noteActivity(1, 'sweep');
    await flush();
    w.advance(1000);
    w.api.noteActivity(2, 'orbit');
    await flush();

    w.advance(ACTIVITY_TTL_MS - 999);
    w.expireTimeouts();
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'orbit',
      'expiring a hidden lower-ranked claim leaves the winner unchanged');

    w.advance(1000);
    w.expireTimeouts();
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, null,
      'an expired hidden claim does not reappear after the winner ends');
  }

  {
    // Breathe is controlled by the watch and Ring by the invoke promise. Neither
    // has an activity TTL, and Breathe retains priority while both are active.
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    w.api.beginCapability(1);
    w.api.setWatching(true, 2);
    await flush();
    assertEq(w.timeoutCount(), 0, 'a capability claim creates no activity timeout');
    w.advance(ACTIVITY_TTL_MS * 10);
    w.expireTimeouts();
    w.api.setWatching(false, 2);
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'ring',
      'disarming Breathe reveals the still-running capability after many activity TTLs');

    w.api.endCapability(1);
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, null,
      'the final capability end removes Ring immediately with no TTL tail');
  }

  {
    // Activity claims are ephemeral, so they must NOT be persisted -- a timer
    // does not survive eviction and a restored claim would never expire.
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    w.api.noteActivity(7, 'orbit');
    w.api.beginCapability(9);
    w.api.setWatching(true, 8);
    await flush();
    const stored = (w.sessionStore[INTENT_KEY] || {}).claims || {};
    assertEq(stored['session:7'], undefined, 'an activity claim is never persisted');
    assertEq(stored['capability:9'], undefined, 'a capability claim is never persisted');
    assertEq(stored['watch:8'], 'breathe', 'a watch claim is');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-13: the glyphs are decoded once per worker, not per state');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    const afterInit = w.fetches.length;
    assertEq(afterInit, 2, 'init fetches exactly one PNG per output size');

    // Every state's build used to re-fetch and re-decode both sources.
    for (const activity of ['orbit', 'sweep']) {
      w.api.noteActivity(1, activity);
      await flush();
    }
    w.api.beginCapability(1);
    await flush();
    w.api.setWatching(true, 1);
    await flush();

    assertEq(w.fetches.length, afterInit,
      'building all four states re-fetches nothing -- the decode is cached');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-14: tools classify by what they DO, reusing the _readOnly flag');
  // -------------------------------------------------------------------------

  {
    const { resolveIconActivity, TOOL_REGISTRY } = require(path.join(ROOT, 'extension/ai/tool-definitions.js'));

    // Reading -- orbit. Read-only is tested FIRST, which is why list_tabs and
    // list_triggers land here rather than with their category-mates.
    for (const t of ['read_page', 'get_text', 'get_attribute', 'get_dom_snapshot',
      'get_page_snapshot', 'get_site_guide', 'search_memory', 'list_tabs',
      'list_triggers', 'get_trigger_status', 'read_sheet']) {
      assertEq(resolveIconActivity(t), 'orbit', `${t} reads -> orbit`);
    }
    // Non-registry read-only tools have no _readOnly flag to consult.
    for (const t of ['list_sessions', 'get_logs', 'get_memory_stats', 'search_capabilities',
      'get_task_status', 'list_credentials']) {
      assertEq(resolveIconActivity(t), 'orbit', `${t} reads -> orbit (off-registry)`);
    }

    // Driving the browser -- sweep.
    for (const t of ['navigate', 'search', 'back', 'go_back', 'go_forward', 'refresh',
      'click', 'type_text', 'press_key', 'check_box', 'hover', 'drag_drop', 'focus',
      'scroll', 'scroll_to_bottom', 'open_tab', 'switch_tab', 'close_tab',
      'click_at', 'drag', 'insert_text']) {
      assertEq(resolveIconActivity(t), 'sweep', `${t} drives -> sweep`);
    }

    assertEq(resolveIconActivity('invoke_capability'), null,
      'invoke_capability leaves generic activity to its dedicated lifecycle');

    // Everything else -- sweep, including unknown and malformed names.
    for (const t of ['execute_js', 'run_task', 'stop_task',
      'fill_sheet', 'set_attribute', 'upload_file', 'trigger', 'fill_credential',
      'use_payment_method', 'end_visual_session']) {
      assertEq(resolveIconActivity(t), 'sweep', `${t} -> sweep (default)`);
    }

    assertEq(resolveIconActivity(''), 'sweep', 'an empty name falls to Sweep');
    assertEq(resolveIconActivity(undefined), 'sweep', 'so does a missing one');
    assertEq(resolveIconActivity('not_a_real_tool'), 'sweep', 'and an unknown one');

    // The split is derived, not hand-listed: every registry tool marked
    // _readOnly must classify as orbit, or the two have drifted apart.
    const drifted = TOOL_REGISTRY
      .filter((t) => t._readOnly === true && resolveIconActivity(t.name) !== 'orbit')
      .map((t) => t.name);
    assertEq(drifted.length, 0,
      `every _readOnly tool classifies as orbit (drifted: ${drifted.join(',') || 'none'})`);
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-15: the wire carries FSB verbs, not MCP tool names');
  // -------------------------------------------------------------------------

  {
    const { resolveIconActivity, TOOL_REGISTRY } = require(path.join(ROOT, 'extension/ai/tool-definitions.js'));

    // manual.ts sends `tool: tool._contentVerb || tool._cdpVerb || tool.name`, so
    // roughly half the interaction tools arrive under a different spelling. A
    // name-keyed map would silently classify all of them as the default.
    assertEq(resolveIconActivity('type'), 'sweep', 'type_text arrives as "type"');
    assertEq(resolveIconActivity('toggleCheckbox'), 'sweep', 'check_box arrives as "toggleCheckbox"');
    assertEq(resolveIconActivity('cdpClickAt'), 'sweep', 'click_at arrives as "cdpClickAt"');
    assertEq(resolveIconActivity('siteSearch'), 'sweep', 'search arrives as "siteSearch"');
    assertEq(resolveIconActivity('scrollToBottom'), 'sweep', 'scroll_to_bottom arrives as "scrollToBottom"');
    assertEq(resolveIconActivity('readPage'), 'orbit', 'read_page arrives as "readPage"');
    assertEq(resolveIconActivity('getAttribute'), 'orbit', 'get_attribute arrives as "getAttribute"');
    assertEq(resolveIconActivity('setAttribute'), 'sweep', 'set_attribute arrives as "setAttribute"');

    // Exhaustive: every verb must resolve to the same class as its tool name.
    const mismatched = TOOL_REGISTRY
      .filter((t) => t._contentVerb || t._cdpVerb)
      .filter((t) => resolveIconActivity(t._contentVerb || t._cdpVerb) !== resolveIconActivity(t.name))
      .map((t) => t.name);
    assertEq(mismatched.length, 0,
      `every verb classifies like its tool name (mismatched: ${mismatched.join(',') || 'none'})`);
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-17: the autopilot animation preference gates toolbar activity');
  // -------------------------------------------------------------------------

  {
    const resolveCall = 'var iconActivity = resolveIconActivity(call.name);';
    const activityCall = 'if (iconActivity) globalThis.fsbActionIcon.noteActivity(session.tabId, iconActivity);';
    const resolveIndex = AGENT_LOOP_SRC.indexOf(resolveCall);
    const callIndex = AGENT_LOOP_SRC.indexOf(activityCall);
    const tryIndex = AGENT_LOOP_SRC.lastIndexOf('try {', callIndex);
    const gateIndex = AGENT_LOOP_SRC.lastIndexOf('session.animatedActionHighlights !== false', callIndex);
    assert(callIndex >= 0, 'the autopilot still reports classified toolbar activity');
    assert(resolveIndex >= 0 && resolveIndex < callIndex,
      'the autopilot skips generic activity when classification returns null');
    assert(gateIndex > tryIndex && gateIndex < callIndex,
      'an explicit false animation preference gates the autopilot activity call');
    assert(AGENT_LOOP_SRC.includes('animateActionIcon: session.animatedActionHighlights'),
      'the same preference is passed to the dedicated capability lifecycle');
    assertEq((AGENT_LOOP_SRC.match(/session\.animatedActionHighlights !== false/g) || []).length, 1,
      'the preference uses one strict false gate so true and legacy undefined values remain enabled');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-18: Ring belongs only to balanced capability lifecycles');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    const resolvedNow = () => (w.sessionStore[INTENT_KEY] || {}).resolved;

    w.api.noteActivity(1, 'ring');
    assertEq(resolvedNow(), null, 'generic noteActivity cannot claim Ring');
    assertEq(w.timeoutCount(), 0, 'a rejected generic Ring creates no expiry timer');

    const emitsBefore = w.emits.length;
    w.api.beginCapability(1);
    assertEq(resolvedNow(), 'ring', 'beginCapability claims Ring');
    assertEq(w.emits.length, emitsBefore + 1,
      'beginCapability paints the cached kickoff frame synchronously');
    assertEq(w.emits[w.emits.length - 1].imageData[32].seq, 10,
      'the immediate frame is the cached Ring kickoff');
    await flush();
    assertEq(w.timerCount(), 1, 'Ring repeats while the capability remains unsettled');

    w.advance(1600 * 3);
    w.tick();
    assertEq(w.timerCount(), 1, 'Ring keeps cycling beyond one 1.6-second period');

    w.api.beginCapability(1);
    w.api.endCapability(1);
    assertEq(resolvedNow(), 'ring', 'one same-tab end cannot clear a concurrent invoke');
    w.api.endCapability(1);
    assertEq(resolvedNow(), null, 'the final same-tab end clears Ring immediately');
    assertEq(w.timerCount(), 0, 'the final end stops the Ring loop with no tail');

    w.api.beginCapability(2);
    w.api.beginCapability(3);
    await flush();
    w.api.endCapability(2);
    assertEq(resolvedNow(), 'ring', 'one tab ending cannot clear another tab\'s invoke');
    w.api.dropTab(3);
    assertEq(resolvedNow(), null, 'closing the last invoking tab clears its Ring');
    w.api.endCapability(3);
    assertEq(resolvedNow(), null, 'a late end after tab cleanup is harmless');
  }

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    w.api.noteActivity(4, 'sweep');
    w.api.beginCapability(4);
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'ring',
      'Ring retains its existing priority over Sweep');

    w.killIntervals();
    assertEq(w.timerCount(), 0, 'the test can simulate a lost service-worker frame timer');
    await w.api.repair();
    await flush();
    assertEq(w.timerCount(), 1, 'watchdog repair revives an owed capability Ring loop');

    w.api.endCapability(4);
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'sweep',
      'ending Ring immediately reveals an existing generic Sweep claim');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-19: exact-pixel dedupe preserves the original visible timeline');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker();
    await w.api.init({ hasLiveSession: () => false });
    const before = w.emits.length;
    const startedAt = w.nowValue();
    w.api.noteActivity(1, 'sweep');
    await flush();

    const firstRequest = w.emits[before];
    assertEq(w.nextAnimationDelay(), FRAME_INTERVAL_MS * 2,
      'Sweep skips the 66ms poll whose rounded frame is still frame zero');

    const observedTimes = [0];
    const observedRequests = [firstRequest];
    while (w.nowValue() - startedAt <= 1320) {
      const delay = w.nextAnimationDelay();
      if (delay === null || w.nowValue() - startedAt + delay > 1320) break;
      w.advance(delay);
      const callsBefore = w.emits.length;
      w.tick();
      await flush();
      if (w.emits.length > callsBefore) {
        observedTimes.push(w.nowValue() - startedAt);
        observedRequests.push(w.emits[w.emits.length - 1]);
      }
    }

    const expectedTimes = [0];
    let priorIndex = 0;
    for (let elapsed = FRAME_INTERVAL_MS; elapsed <= 1320; elapsed += FRAME_INTERVAL_MS) {
      const index = Math.min(17, Math.floor(((elapsed % 1200) / 1200) * 18));
      if (index === priorIndex) continue;
      priorIndex = index;
      expectedTimes.push(elapsed);
    }
    assertEq(observedTimes.join(','), expectedTimes.join(','),
      'deadline scheduling requests every distinct Sweep frame on the original 66ms grid');
    const wrappedFrame = observedTimes.indexOf(1254);
    assert(wrappedFrame > 0 && observedRequests[wrappedFrame] === firstRequest,
      'a cached request object is reused when the cycle returns to frame zero');
  }

  {
    // The stub makes every rendered ImageData byte-identical. Production data is
    // interned only after comparing both 16px and 32px byte arrays, so this is a
    // direct proof that skipped work cannot change the displayed result.
    const w = makeWorker({ identicalPixels: true });
    await w.api.init({ hasLiveSession: () => false });
    const before = w.emits.length;
    w.api.setWatching(true, 2);
    await flush();
    assertEq(w.emits.length, before,
      'a state transition emits nothing when both output sizes are byte-identical');
    assertEq(w.timerCount(), 0,
      'an entirely byte-identical cycle schedules no empty frame timer');
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'breathe',
      'pixel dedupe does not alter the continuous watching state');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-20: setIcon backpressure and failure retry are bounded');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker({ deferSetIcon: true });
    await w.api.init({ hasLiveSession: () => false });
    assertEq(w.pendingIconCount(), 1, 'init starts one asynchronous icon update');
    w.resolveNextIcon();
    await flush();

    const before = w.emits.length;
    w.api.noteActivity(1, 'sweep');
    await flush();
    assertEq(w.pendingIconCount(), 1, 'Sweep starts with exactly one update in flight');

    w.advance(132);
    w.tick();
    w.advance(132);
    w.tick();
    await flush();
    assertEq(w.emits.length, before + 1,
      'slow setIcon does not enqueue stale browser API calls for intermediate frames');
    assertEq(w.maxIconInFlight(), 1, 'setIcon concurrency never exceeds one');

    w.resolveNextIcon();
    await flush();
    assertEq(w.emits.length, before + 2, 'completion drains exactly one latest frame');
    assertEq(w.emits[w.emits.length - 1].imageData[32].seq, 18,
      'the drained frame matches the current wall-clock phase, not the oldest queued phase');
    w.resolveNextIcon();
    await flush();
  }

  {
    const w = makeWorker({ deferSetIcon: true });
    await w.api.init({ hasLiveSession: () => false });
    w.resolveNextIcon();
    await flush();
    w.api.noteActivity(1, 'orbit');
    await flush();
    w.rejectNextIcon(new Error('browser busy'));
    await flush();

    assertEq(w.timerCount(), 0, 'a rejected update pauses the 15fps frame scheduler');
    assertEq(w.retryTimerCount(), 1, 'a rejected update leaves one bounded retry');
    assertEq(w.nextRetryDelay(), 1000, 'the first retry backs off for one second');
    const failedCalls = w.emits.length;

    w.advance(1000);
    w.expireTimeouts();
    await flush();
    assertEq(w.emits.length, failedCalls + 1, 'the backoff retries only the current phase');
    w.rejectNextIcon(new Error('still busy'));
    await flush();
    assertEq(w.nextRetryDelay(), 2000, 'a repeated failure doubles the retry delay');
    assertEq(w.errors.filter((e) => /setIcon failed/.test(e)).length, 1,
      'repeated update failures are logged once');
    assertEq(w.maxIconInFlight(), 1, 'failure recovery also keeps one request in flight');

    w.advance(2000);
    w.expireTimeouts();
    await flush();
    w.resolveNextIcon();
    await flush();
    assertEq(w.retryTimerCount(), 0, 'a successful retry clears the backoff');
    assertEq(w.timerCount(), 1, 'a successful retry resumes the same continuous animation');
  }

  // -------------------------------------------------------------------------
  console.log('\nICON-21: one preference gates Autopilot, MCP, capability, and watch animation');
  // -------------------------------------------------------------------------

  {
    const w = makeWorker({ local: { [ANIMATIONS_KEY]: false } });
    await w.api.init({ hasLiveSession: () => false });
    const idleCalls = w.emits.length;
    w.api.noteActivity(1, 'orbit');
    w.api.beginCapability(2);
    w.api.setWatching(true, 3);
    await flush();
    assertEq(w.emits.length, idleCalls, 'disabled motion emits no frame from any public ingress');
    assertEq(w.timerCount(), 0, 'disabled motion owns no animation scheduler');
    assertEq((w.sessionStore[INTENT_KEY] || {}).claims['watch:3'], 'breathe',
      'disabled motion preserves semantic claims for an immediate re-enable');

    w.setLocal(ANIMATIONS_KEY, true);
    await flush();
    assertEq((w.sessionStore[INTENT_KEY] || {}).resolved, 'breathe',
      're-enabling resolves the same highest-priority claim');
    assertEq(w.timerCount(), 1, 're-enabling starts the unchanged continuous Breathe');

    w.setLocal(ANIMATIONS_KEY, false);
    await flush();
    assertEq(w.timerCount(), 0, 'disabling live motion stops its scheduler immediately');
    assertEq((w.sessionStore[INTENT_KEY] || {}).claims['watch:3'], 'breathe',
      'disabling live motion does not mutate watch functionality');
  }

  // -------------------------------------------------------------------------
  console.log('\n=========================================');
  console.log('action-icon-behavior.test.js results');
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  console.log('=========================================');
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
