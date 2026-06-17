// content/dom-stream.js -- FSB DOM Streaming Adapter
// Bridges the bundled PhantomStream capture engine into FSB's existing
// background/dashboard message contract.
// Depends on: content/init.js, content/visual-feedback.js,
// content/phantom-stream-capture.js

(function() {
  if (window.__FSB_SKIP_INIT__) return;

  var FSB = window.FSB || (window.FSB = {});
  var logger = FSB.logger || console;
  var bridge = window.FSBPhantomStreamCapture || null;
  var protocol = bridge && bridge.protocol ? bridge.protocol : {};
  var STREAM = protocol.STREAM || {
    SNAPSHOT: 'ext:dom-snapshot',
    MUTATIONS: 'ext:dom-mutations',
    SCROLL: 'ext:dom-scroll',
    OVERLAY: 'ext:dom-overlay',
    DIALOG: 'ext:dom-dialog',
    READY: 'ext:dom-ready'
  };

  var capture = null;
  var streaming = false;
  var paused = false;
  var lastStreamSessionId = '';
  var lastSnapshotId = 0;
  var lastSnapshot = null;
  var lastStaleFlushCount = 0;

  function logInfo(message, data) {
    try {
      if (logger && typeof logger.info === 'function') logger.info(message, data || {});
      else if (console && console.info) console.info(message, data || {});
    } catch (e) { /* logging must not affect capture */ }
  }

  function logWarn(message, data) {
    try {
      if (logger && typeof logger.warn === 'function') logger.warn(message, data || {});
      else if (console && console.warn) console.warn(message, data || {});
    } catch (e) { /* logging must not affect capture */ }
  }

  function logError(message, data) {
    try {
      if (logger && typeof logger.error === 'function') logger.error(message, data || {});
      else if (console && console.error) console.error(message, data || {});
    } catch (e) { /* logging must not affect capture */ }
  }

  function warnDelivery(channel, err) {
    var detail = (typeof redactForLog === 'function')
      ? redactForLog(err)
      : { error: err && err.message ? err.message : String(err || '') };
    if (typeof rateLimitedWarn === 'function') {
      rateLimitedWarn('DOM', channel, channel + ' sendMessage failed', detail);
      return;
    }
    logWarn('[DOM Stream] ' + channel + ' sendMessage failed', detail);
  }

  function sendRuntimeMessage(message, channel) {
    try {
      var result = chrome.runtime.sendMessage(message);
      if (result && typeof result.catch === 'function') {
        result.catch(function(err) { warnDelivery(channel, err); });
      }
      return result;
    } catch (err) {
      warnDelivery(channel, err);
      return null;
    }
  }

  function rememberIdentity(payload) {
    if (!payload || Object(payload) !== payload) return;
    if (payload.streamSessionId) lastStreamSessionId = String(payload.streamSessionId);
    if (typeof payload.snapshotId === 'number') lastSnapshotId = payload.snapshotId;
  }

  function adaptSnapshotPayload(payload) {
    var next = Object.assign({}, payload || {});
    rememberIdentity(next);
    lastSnapshot = next;
    return next;
  }

  function adaptMutationPayload(payload) {
    var next = Object.assign({}, payload || {});
    next.mutations = Array.isArray(next.mutations)
      ? next.mutations.slice()
      : [];
    if (typeof next.staleFlushCount === 'number') {
      lastStaleFlushCount = next.staleFlushCount;
    }
    rememberIdentity(next);
    return next;
  }

  function readOverlayState() {
    var glow = null;
    var progress = null;

    try {
      if (FSB.actionGlowOverlay && typeof FSB.actionGlowOverlay.getStreamState === 'function') {
        glow = FSB.actionGlowOverlay.getStreamState();
      }
      if (!glow) {
        var glowSource = (FSB.actionGlowOverlay && FSB.actionGlowOverlay.targetElement)
          || (FSB.highlightManager && FSB.highlightManager.activeHighlight);
        if (glowSource && glowSource.getBoundingClientRect) {
          var rect = glowSource.getBoundingClientRect();
          glow = {
            x: rect.x,
            y: rect.y,
            w: rect.width,
            h: rect.height,
            state: 'active',
            mode: 'box'
          };
        }
      }
    } catch (e) { /* overlay state is advisory */ }

    try {
      var overlayState = FSB.overlayState;
      if (overlayState && overlayState.lifecycle !== 'cleared') {
        progress = {
          mode: (overlayState.progress && overlayState.progress.mode) || 'indeterminate',
          percent: overlayState.progress && overlayState.progress.percent,
          label: (overlayState.progress && overlayState.progress.label) || '',
          phase: overlayState.phase || '',
          eta: (overlayState.progress && overlayState.progress.eta) || null,
          detail: (overlayState.display && overlayState.display.detail) || '',
          clientLabel: overlayState.clientLabel || '',
          sessionToken: overlayState.sessionToken || '',
          version: typeof overlayState.version === 'number' ? overlayState.version : null,
          lifecycle: overlayState.lifecycle || 'running',
          result: overlayState.result || null
        };
      }
    } catch (e) { /* overlay state is advisory */ }

    return { glow: glow, progress: progress };
  }

  function sendOverlayNow() {
    var overlay = readOverlayState();
    sendRuntimeMessage({
      action: 'domStreamOverlay',
      glow: overlay.glow || null,
      progress: overlay.progress || null,
      streamSessionId: lastStreamSessionId || '',
      snapshotId: lastSnapshotId || 0
    }, 'overlay-delivery');
  }

  function isFsbOverlay(el) {
    if (!el || !el.hasAttribute) return false;
    if (el.hasAttribute('data-fsb-overlay')) return true;
    if (el.closest && el.closest('[data-fsb-overlay]')) return true;
    try {
      var root = el.getRootNode && el.getRootNode();
      if (root && typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot
          && root.host && root.host.className
          && typeof root.host.className === 'string'
          && root.host.className.indexOf('fsb') !== -1) {
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function forwardCaptureMessage(type, payload) {
    if (type === STREAM.SNAPSHOT) {
      sendRuntimeMessage({
        action: 'domStreamSnapshot',
        snapshot: adaptSnapshotPayload(payload)
      }, 'snapshot-delivery');
      return;
    }

    if (type === STREAM.MUTATIONS) {
      var mutationPayload = adaptMutationPayload(payload);
      sendRuntimeMessage({
        action: 'domStreamMutations',
        mutations: mutationPayload.mutations,
        streamSessionId: mutationPayload.streamSessionId || '',
        snapshotId: mutationPayload.snapshotId || 0,
        staleFlushCount: typeof mutationPayload.staleFlushCount === 'number'
          ? mutationPayload.staleFlushCount
          : undefined
      }, 'mutation-delivery');
      return;
    }

    if (type === STREAM.SCROLL) {
      rememberIdentity(payload);
      sendRuntimeMessage({
        action: 'domStreamScroll',
        scrollX: payload && payload.scrollX || 0,
        scrollY: payload && payload.scrollY || 0,
        streamSessionId: payload && payload.streamSessionId || '',
        snapshotId: payload && payload.snapshotId || 0
      }, 'scroll-delivery');
      return;
    }

    if (type === STREAM.OVERLAY) {
      rememberIdentity(payload);
      sendRuntimeMessage({
        action: 'domStreamOverlay',
        glow: payload && payload.glow || null,
        progress: payload && payload.progress || null,
        streamSessionId: payload && payload.streamSessionId || '',
        snapshotId: payload && payload.snapshotId || 0
      }, 'overlay-delivery');
      return;
    }

    if (type === STREAM.DIALOG) {
      var dialog = payload && payload.dialog ? payload.dialog : {};
      rememberIdentity(dialog);
      sendRuntimeMessage({
        action: 'domStreamDialog',
        dialog: dialog
      }, 'dialog-relay');
      return;
    }

    if (type === STREAM.READY) {
      sendRuntimeMessage({ action: 'domStreamReady' }, 'ready-ping');
    }
  }

  function createCaptureHandle() {
    if (!bridge || typeof bridge.createCapture !== 'function') {
      throw new Error('phantomstream-capture-bridge-missing');
    }
    return bridge.createCapture({
      transport: {
        send: forwardCaptureMessage,
        flush: function() {}
      },
      logger: {
        info: function(message, data) { logInfo(message, data); },
        warn: function(message, data) { logWarn(message, data); },
        error: function(message, data) { logError(message, data); }
      },
      overlayProvider: readOverlayState,
      skipElement: isFsbOverlay,
      maskInputs: true
    });
  }

  function ensureCapture() {
    if (capture) return capture;
    capture = createCaptureHandle();
    return capture;
  }

  function startCapture() {
    var handle = ensureCapture();
    handle.start();
    streaming = true;
    paused = false;
  }

  function stopCapture() {
    if (capture) capture.stop();
    streaming = false;
    paused = false;
  }

  function pauseCapture() {
    var handle = ensureCapture();
    handle.pause();
    streaming = true;
    paused = true;
  }

  function resumeWithFreshSnapshot() {
    // Preserve legacy FSB behavior: resume sends a fresh snapshot and fresh
    // stream identity. PhantomStream resume() intentionally keeps the same
    // identity, so the adapter restarts the capture instead.
    if (capture) capture.stop();
    var handle = ensureCapture();
    handle.start();
    streaming = true;
    paused = false;
  }

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    request = request || {};
    try {
      switch (request.action) {
        case 'pingDomStream':
          sendResponse({ ready: true });
          break;

        case 'domStreamStart':
          logInfo('[DOM Stream] Start requested');
          startCapture();
          sendResponse({ success: true });
          break;

        case 'domStreamStop':
          logInfo('[DOM Stream] Stop requested');
          stopCapture();
          sendResponse({ success: true });
          break;

        case 'domStreamPause':
          logInfo('[DOM Stream] Pause requested');
          pauseCapture();
          sendResponse({ success: true });
          break;

        case 'domStreamResume':
          logInfo('[DOM Stream] Resume requested -- sending fresh snapshot');
          resumeWithFreshSnapshot();
          sendResponse({ success: true });
          break;

        case 'domStreamRequestOverlay':
          sendOverlayNow();
          sendResponse({ success: true });
          break;
      }
    } catch (err) {
      logError('[DOM Stream] Control request failed', {
        action: request.action || '',
        error: err && err.message ? err.message : String(err)
      });
      sendResponse({
        success: false,
        error: err && err.message ? err.message : String(err)
      });
    }
  });

  FSB.domStream = {
    start: startCapture,
    stop: stopCapture,
    pause: pauseCapture,
    resume: resumeWithFreshSnapshot,
    requestOverlay: sendOverlayNow,
    getStaleFlushCount: function() { return lastStaleFlushCount; },
    isStreaming: function() { return streaming; },
    isPaused: function() { return paused; },
    getLastSnapshot: function() { return lastSnapshot; },
    getCapture: function() { return capture; }
  };

  FSB._modules = FSB._modules || {};
  FSB._modules['dom-stream'] = {
    loaded: true,
    timestamp: Date.now(),
    packageBacked: true
  };

  try {
    ensureCapture();
  } catch (err) {
    logError('[DOM Stream] PhantomStream capture unavailable', {
      error: err && err.message ? err.message : String(err)
    });
  }

  logInfo('[DOM Stream] Package-backed adapter loaded');
})();
