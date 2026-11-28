/**
 * Page recorder (content script, isolated world).
 *
 * Records the DOM of a tab that an FSB automation session is acting on, so
 * the session can be watched later like a video. Injected by
 * utils/page-recorder-host.js right after dist/content/page-recorder-capture.js
 * (which defines FsbPageCaptureKit). It is NOT part of the always-on content
 * script set and only runs while a session records this tab.
 *
 * Privacy: password fields are always masked; fields that look like secrets
 * (one-time codes, card numbers, security codes, PINs, tokens) are masked with
 * the same patterns the MCP session recorder uses. FSB's own overlays are
 * never captured, and FSB's data-fsb-* attributes are dropped.
 *
 * State lives on globalThis.__fsbPageRecorder, not window.FSB, because the
 * main content-script injection resets window.FSB.
 */
(function () {
  'use strict';

  var VERSION = 1;
  var existing = globalThis.__fsbPageRecorder;
  if (existing && existing.version === VERSION && !existing.isStopped()) {
    try { existing.rebind(); } catch (_error) { /* a broken instance stays broken */ }
    return;
  }
  // A stopped instance (a finished session) is replaced so a later session can
  // record this same document again.

  var PORT_NAME = 'fsb-page-recorder';
  var MIB = 1024 * 1024;

  // Mirrors SENSITIVE_TARGET_PATTERN and SENSITIVE_PIN_TOKEN_PATTERN in
  // utils/mcp-session-recorder.js; the host sends the authoritative copies in
  // the start config and a test keeps these defaults in sync.
  var DEFAULT_PATTERNS = {
    target: /pass(word)?|secret|token|credential|api[-_ ]?key|authorization|auth[-_ ]?code|one[-_ ]?time|otp|cvv|cvc|(?:^|[^a-z0-9])cc[-_ ]?(?:number|csc|cvc|cvv)(?:$|[^a-z0-9])|card[-_ ]?(number|no)|security[-_ ]?code/i,
    pinToken: /(?:^|[^a-z])pin(?:$|[^a-z])/i
  };

  var DEFAULT_LIMITS = {
    batchMs: 250,
    batchBytes: 256 * 1024,
    pauseUnackedBytes: 4 * MIB,
    settleQuietMs: 300,
    settleMaxMs: 1500,
    keyframeMinGapMs: 3000,
    keyframeMinDiffBytes: 256 * 1024,
    heavySnapshotMs: 500,
    heavySnapshotBytes: 8 * MIB,
    markersOnlySnapshotBytes: 16 * MIB,
    overlayPollMs: 250,
    maxErrors: 3
  };

  var state = {
    port: null,
    connected: false,
    reconnectDelayMs: 250,
    reconnectTimer: null,
    stopped: false,
    started: false,
    config: null,
    patterns: DEFAULT_PATTERNS,
    limits: Object.assign({}, DEFAULT_LIMITS),
    kit: null,
    capture: null,
    recorder: null,
    seq: 0,
    lastAckedSeq: -1,
    pending: [],
    pendingBytes: 0,
    batchTimer: null,
    unacked: new Map(),
    unackedBytes: 0,
    paused: false,
    keyframesEnabled: true,
    markersOnly: false,
    lastKeyframeAt: 0,
    lastSnapshotBytes: 0,
    bytesSinceKeyframe: 0,
    lastMutationAt: 0,
    activityObserver: null,
    overlayTimer: null,
    overlayFingerprint: '',
    errors: 0
  };

  function perfNow() {
    try {
      return performance.timeOrigin + performance.now();
    } catch (_error) {
      return Date.now();
    }
  }

  function extensionAlive() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (_error) {
      return false;
    }
  }

  function jsonBytes(value) {
    try {
      return JSON.stringify(value).length;
    } catch (_error) {
      return 0;
    }
  }

  function toRegExp(spec, fallback) {
    if (spec instanceof RegExp) return spec;
    if (spec && typeof spec.source === 'string') {
      try { return new RegExp(spec.source, typeof spec.flags === 'string' ? spec.flags : 'i'); } catch (_error) { /* fall back */ }
    }
    return fallback;
  }

  // ---------------------------------------------------------------------------
  // Masking and filtering
  // ---------------------------------------------------------------------------

  function metadataLooksSensitive(value) {
    if (typeof value !== 'string' || !value) return false;
    if (state.patterns.target.test(value)) return true;
    var tokenized = value
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return state.patterns.pinToken.test(tokenized);
  }

  function labelTextFor(el) {
    try {
      if (el.labels && el.labels.length) {
        return Array.prototype.map.call(el.labels, function (label) { return label.textContent || ''; }).join(' ');
      }
    } catch (_error) { /* not labelable */ }
    return '';
  }

  function isSensitiveField(el) {
    if (!el || el.nodeType !== 1) return false;
    var type = String(el.getAttribute('type') || el.type || '').toLowerCase();
    if (type === 'password') return true;
    var autocomplete = String(el.getAttribute('autocomplete') || '').toLowerCase();
    if (/(^|\s)(one-time-code|current-password|new-password|cc-[a-z-]+)(\s|$)/.test(autocomplete)) return true;
    var probes = [
      el.getAttribute('name'),
      el.getAttribute('id'),
      autocomplete,
      el.getAttribute('aria-label'),
      el.getAttribute('placeholder'),
      el.getAttribute('data-testid'),
      labelTextFor(el)
    ];
    for (var i = 0; i < probes.length; i++) {
      if (metadataLooksSensitive(probes[i])) return true;
    }
    return false;
  }

  function maskText(text) {
    return String(text).replace(/\S/g, '*');
  }

  // Called for every form control value because maskInputs is on; ordinary
  // values pass through, sensitive ones are masked.
  function maskInputValue(text, el) {
    return isSensitiveField(el) ? maskText(text) : String(text);
  }

  function isFsbOverlay(el) {
    try {
      return !!(el && el.closest && el.closest('[data-fsb-overlay]'));
    } catch (_error) {
      return false;
    }
  }

  function stripFsbAttributeOps(type, payload) {
    if (!payload || type !== 'ext:dom-mutations' || !Array.isArray(payload.mutations)) return payload;
    var kept = payload.mutations.filter(function (op) {
      return !(op && op.op === 'attr' && typeof op.attr === 'string' && op.attr.indexOf('data-fsb-') === 0);
    });
    if (kept.length === payload.mutations.length) return payload;
    var next = Object.assign({}, payload, { mutations: kept });
    return next;
  }

  // Captions must never carry typed text: the action status embeds it in quotes.
  function redactQuoted(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/"[^"]*"/g, '"…"')
      .replace(/“[^”]*”/g, '“…”')
      .replace(/'[^']{2,}'/g, '\'…\'')
      .slice(0, 160);
  }

  // ---------------------------------------------------------------------------
  // Port and batching
  // ---------------------------------------------------------------------------

  function post(message) {
    if (!state.port || !state.connected) return false;
    try {
      state.port.postMessage(message);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function hello() {
    return {
      type: 'hello',
      version: VERSION,
      href: location.origin + location.pathname,
      contentType: document.contentType || '',
      readyState: document.readyState,
      wallNow: Date.now(),
      perfNow: perfNow(),
      resume: state.config ? {
        recordingId: state.config.recordingId,
        trackId: state.config.trackId,
        segment: state.config.segment,
        lastAckedSeq: state.lastAckedSeq
      } : null
    };
  }

  function connect() {
    if (state.stopped || state.connected) return;
    if (!extensionAlive()) {
      shutdown('extension-unavailable');
      return;
    }
    try {
      state.port = chrome.runtime.connect({ name: PORT_NAME });
    } catch (_error) {
      scheduleReconnect();
      return;
    }
    state.connected = true;
    state.port.onMessage.addListener(onPortMessage);
    state.port.onDisconnect.addListener(onPortDisconnect);
    post(hello());
    // Resend anything the service worker never acknowledged.
    state.unacked.forEach(function (batch) { post(batch); });
  }

  function scheduleReconnect() {
    if (state.stopped || state.reconnectTimer) return;
    state.reconnectTimer = setTimeout(function () {
      state.reconnectTimer = null;
      connect();
    }, state.reconnectDelayMs);
    state.reconnectDelayMs = Math.min(state.reconnectDelayMs * 2, 5000);
  }

  function onPortDisconnect() {
    state.connected = false;
    state.port = null;
    if (!extensionAlive()) {
      shutdown('extension-unavailable');
      return;
    }
    // The service worker restarted or the host dropped us; come back unless stopped.
    if (state.started) scheduleReconnect();
  }

  function queueChunk(chunk) {
    if (state.markersOnly || !chunk) return;
    var bytes = jsonBytes(chunk.events);
    if (chunk.keyframe) {
      state.lastSnapshotBytes = bytes;
      if (bytes > state.limits.markersOnlySnapshotBytes) {
        // Never ship a snapshot this large; keep the timeline (markers) only.
        goMarkersOnly('snapshot-too-large');
        return;
      }
    }
    state.pending.push({
      trackId: state.config.trackId,
      segment: state.config.segment,
      seq: chunk.seq,
      t0: chunk.t0,
      t1: chunk.t1,
      keyframe: chunk.keyframe === true,
      bytes: bytes,
      events: chunk.events
    });
    state.pendingBytes += bytes;
    if (chunk.keyframe) {
      state.bytesSinceKeyframe = 0;
    } else {
      state.bytesSinceKeyframe += bytes;
      state.lastMutationAt = perfNow();
    }
    if (state.pendingBytes >= state.limits.batchBytes) flushBatch();
    else if (!state.batchTimer) state.batchTimer = setTimeout(flushBatch, state.limits.batchMs);
  }

  function flushBatch() {
    if (state.batchTimer) {
      clearTimeout(state.batchTimer);
      state.batchTimer = null;
    }
    if (state.pending.length === 0) return;
    var batch = {
      type: 'batch',
      seq: state.seq++,
      recordingId: state.config.recordingId,
      chunks: state.pending,
      bytes: state.pendingBytes
    };
    state.pending = [];
    state.pendingBytes = 0;
    state.unacked.set(batch.seq, batch);
    state.unackedBytes += batch.bytes;
    post(batch);
    applyBackpressure();
  }

  function onAck(seq) {
    var batch = state.unacked.get(seq);
    if (!batch) return;
    state.unacked.delete(seq);
    state.unackedBytes = Math.max(0, state.unackedBytes - batch.bytes);
    if (seq > state.lastAckedSeq) state.lastAckedSeq = seq;
    applyBackpressure();
  }

  function applyBackpressure() {
    if (!state.capture) return;
    if (!state.paused && state.unackedBytes > state.limits.pauseUnackedBytes) {
      state.paused = true;
      try { state.capture.pause(); } catch (_error) { noteError(_error); }
      mark('gap', { reason: 'backpressure' });
    } else if (state.paused && state.unackedBytes < state.limits.pauseUnackedBytes / 2) {
      state.paused = false;
      keyframe('backpressure-drained', true);
    }
  }

  function mark(kind, data) {
    if (!state.recorder || state.markersOnly) {
      post({ type: 'marker', kind: kind, data: data || {}, t: perfNow() });
      return;
    }
    try { state.recorder.mark(kind, data || {}); } catch (error) { noteError(error); }
  }

  // ---------------------------------------------------------------------------
  // Capture lifecycle
  // ---------------------------------------------------------------------------

  function whenBodyReady(fn) {
    if (document.body) {
      fn();
      return;
    }
    document.addEventListener('DOMContentLoaded', function onReady() {
      document.removeEventListener('DOMContentLoaded', onReady);
      fn();
    });
  }

  function startActivityObserver() {
    if (state.activityObserver || typeof MutationObserver !== 'function') return;
    state.activityObserver = new MutationObserver(function () { state.lastMutationAt = perfNow(); });
    try {
      state.activityObserver.observe(document.documentElement || document, {
        subtree: true, childList: true, attributes: true, characterData: true
      });
    } catch (_error) {
      state.activityObserver = null;
    }
  }

  function startCapture(config) {
    state.config = config;
    state.patterns = {
      target: toRegExp(config.patterns && config.patterns.target, DEFAULT_PATTERNS.target),
      pinToken: toRegExp(config.patterns && config.patterns.pinToken, DEFAULT_PATTERNS.pinToken)
    };
    Object.keys(config.limits || {}).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_LIMITS, key) && Number.isFinite(config.limits[key])) {
        state.limits[key] = config.limits[key];
      }
    });
    if (state.started) return;
    state.kit = globalThis.FsbPageCaptureKit;
    if (!state.kit || typeof state.kit.createCapture !== 'function') {
      post({ type: 'gap', reason: 'capture-kit-missing' });
      return;
    }
    state.started = true;
    whenBodyReady(function () {
      if (state.stopped) return;
      try {
        state.recorder = state.kit.createRecorder({
          now: perfNow,
          onChunk: queueChunk,
          chunkMaxEvents: 200,
          chunkMaxMs: 1000
        });
        var recorderTransport = state.recorder.transport;
        state.capture = state.kit.createCapture({
          transport: {
            send: function (type, payload) {
              recorderTransport.send(type, stripFsbAttributeOps(type, payload));
            },
            flush: function () { recorderTransport.flush(); }
          },
          logger: { info: function () {}, warn: function () {}, error: function () {} },
          skipElement: isFsbOverlay,
          styleMode: 'cssom',
          maskInputs: true,
          maskInputFn: maskInputValue
        });
        startActivityObserver();
        timedStart();
        startOverlayPolling();
      } catch (error) {
        noteError(error);
      }
    });
  }

  // capture.start() serializes a full snapshot synchronously. Flushing the
  // recorder right after emits that snapshot as its own keyframe chunk, so it
  // can be timed and sized to decide whether this document affords keyframes.
  function timedStart() {
    state.lastSnapshotBytes = 0;
    var t0 = perfNow();
    state.capture.start();
    state.recorder.flush();
    var elapsed = perfNow() - t0;
    state.lastKeyframeAt = perfNow();
    state.overlayFingerprint = '';
    if (state.markersOnly) return;
    if (elapsed > state.limits.heavySnapshotMs || state.lastSnapshotBytes > state.limits.heavySnapshotBytes) {
      state.keyframesEnabled = false;
    }
    flushBatch();
  }

  function goMarkersOnly(reason) {
    if (state.markersOnly) return;
    state.markersOnly = true;
    mark('gap', { reason: reason });
    // Often reached from inside the recorder's own flush: stop on a microtask
    // so capture.stop() does not re-enter that flush.
    Promise.resolve().then(function () {
      try { if (state.capture) state.capture.stop(); } catch (_error) { /* already stopping */ }
    });
  }

  function keyframe(reason, force) {
    if (!state.capture || state.markersOnly || (state.paused && !force)) return false;
    if (!force) {
      if (!state.keyframesEnabled) return false;
      var gap = perfNow() - state.lastKeyframeAt;
      if (gap < state.limits.keyframeMinGapMs && state.bytesSinceKeyframe < state.limits.keyframeMinDiffBytes) return false;
    }
    try {
      state.capture.stop(); // flushes queued mutations first
      timedStart();
      return true;
    } catch (error) {
      noteError(error);
      return false;
    }
  }

  // Wait for the page to go quiet after an action, then mark it settled and
  // take a keyframe so seeks after this action are cheap.
  function settle(actionId) {
    var started = perfNow();
    function check() {
      if (state.stopped || !state.capture) return;
      var quietFor = perfNow() - (state.lastMutationAt || 0);
      var waited = perfNow() - started;
      if (quietFor >= state.limits.settleQuietMs || waited >= state.limits.settleMaxMs) {
        sampleOverlay();
        mark('action-settled', { actionId: actionId || null, waitedMs: Math.round(waited) });
        keyframe('settled', false);
        flushBatch();
        return;
      }
      setTimeout(check, Math.min(100, state.limits.settleQuietMs));
    }
    setTimeout(check, Math.min(100, state.limits.settleQuietMs));
  }

  // ---------------------------------------------------------------------------
  // Agent overlay (highlight + status), sampled from FSB's own overlay state
  // ---------------------------------------------------------------------------

  function readOverlay() {
    var fsb = globalThis.FSB;
    var glow = null;
    var progress = null;
    try {
      var glowOverlay = fsb && fsb.actionGlowOverlay;
      var geometry = glowOverlay && glowOverlay.currentGeometry;
      var target = glowOverlay && glowOverlay.targetElement;
      if (geometry) {
        var nid = target && state.capture ? state.capture.getNodeId(target) : null;
        glow = nid
          ? { state: 'active', nid: nid }
          : { state: 'active', x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h };
      }
      var overlayState = fsb && fsb.overlayState;
      var display = overlayState && overlayState.display;
      var title = display && (display.title || display.subtitle);
      if (title && overlayState.lifecycle !== 'cleared') {
        progress = { label: redactQuoted(String(title)), phase: redactQuoted(String(overlayState.phase || '')) || 'Working' };
      }
    } catch (_error) { /* overlay state is best-effort */ }
    return { glow: glow, progress: progress };
  }

  function sampleOverlay() {
    if (!state.recorder || state.markersOnly) return;
    var overlay = readOverlay();
    var fingerprint = JSON.stringify(overlay);
    if (fingerprint === state.overlayFingerprint) return;
    state.overlayFingerprint = fingerprint;
    try { state.recorder.overlay(overlay); } catch (error) { noteError(error); }
  }

  function startOverlayPolling() {
    if (state.overlayTimer) return;
    state.overlayTimer = setInterval(sampleOverlay, state.limits.overlayPollMs);
  }

  // ---------------------------------------------------------------------------
  // Host messages
  // ---------------------------------------------------------------------------

  function onPortMessage(message) {
    var m = message || {};
    try {
      switch (m.type) {
        case 'start':
          state.reconnectDelayMs = 250;
          startCapture(m);
          break;
        case 'ack':
          onAck(m.seq);
          break;
        case 'settle':
          settle(m.actionId);
          break;
        case 'mark':
          mark(String(m.kind || 'note'), m.data || {});
          if (m.kind === 'action-start') {
            setTimeout(sampleOverlay, 50);
            setTimeout(sampleOverlay, 200);
          }
          break;
        case 'keyframe':
          keyframe(m.reason || 'host', m.force === true);
          break;
        case 'pull':
          flushBatch();
          break;
        case 'stop':
          shutdown(m.reason || 'host-stop');
          break;
        default:
          break;
      }
    } catch (error) {
      noteError(error);
    }
  }

  function noteError(error) {
    state.errors += 1;
    post({ type: 'error', message: String(error && error.message || error).slice(0, 200), count: state.errors });
    if (state.errors >= state.limits.maxErrors) shutdown('too-many-errors');
  }

  function shutdown(reason) {
    if (state.stopped) return;
    state.stopped = true;
    try { if (state.capture) state.capture.stop(); } catch (_error) { /* stopping anyway */ }
    if (state.overlayTimer) clearInterval(state.overlayTimer);
    if (state.activityObserver) {
      try { state.activityObserver.disconnect(); } catch (_error) { /* gone */ }
    }
    try { if (state.recorder) state.recorder.flush(); } catch (_error) { /* best-effort */ }
    flushBatch();
    post({ type: 'stopped', reason: reason });
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    try { if (state.port) state.port.disconnect(); } catch (_error) { /* already closed */ }
    state.port = null;
    state.connected = false;
  }

  // bfcache: flush on the way out; on restore the document is the same, so
  // reconnect and take a keyframe (the host decides whether to keep going).
  window.addEventListener('pagehide', function () {
    try { flushBatch(); } catch (_error) { /* page is going away */ }
  });
  window.addEventListener('pageshow', function (event) {
    if (event && event.persisted && !state.stopped) {
      if (!state.connected) connect();
      keyframe('bfcache-restore', true);
    }
  });

  globalThis.__fsbPageRecorder = Object.freeze({
    version: VERSION,
    isStopped: function () { return state.stopped; },
    rebind: function () {
      if (state.stopped) return;
      if (!state.connected) connect();
    },
    _state: state,
    _test: {
      isSensitiveField: isSensitiveField,
      maskInputValue: maskInputValue,
      stripFsbAttributeOps: stripFsbAttributeOps,
      redactQuoted: redactQuoted,
      readOverlay: readOverlay,
      DEFAULT_PATTERNS: DEFAULT_PATTERNS
    }
  });

  connect();
})();
