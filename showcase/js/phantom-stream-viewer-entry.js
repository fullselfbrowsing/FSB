// Browser-global PhantomStream viewer bridge for FSB dashboard surfaces.
//
// Static dashboard and Angular dashboard both consume this same wrapper so
// Phase 23 can migrate renderer behavior without creating two adapter shapes.

import {
  computeScale,
  createViewer,
  mapHostPointToViewport,
  mapRectToHost,
} from '@full-self-browsing/phantom-stream/renderer';
import { CONTROL, STREAM } from '@full-self-browsing/phantom-stream/protocol';

function noop() {}

function normalizeLogger(logger) {
  var base = logger || console;
  return {
    info: typeof base.info === 'function' ? base.info.bind(base) : noop,
    warn: typeof base.warn === 'function' ? base.warn.bind(base) : noop,
    error: typeof base.error === 'function' ? base.error.bind(base) : noop,
  };
}

function safeCall(fn, args, logger, label) {
  if (typeof fn !== 'function') return undefined;
  try {
    return fn.apply(null, args || []);
  } catch (err) {
    logger.error('[FSB Viewer] callback failed', label || '', err);
    return undefined;
  }
}

function localizedText(copy, key, fallback) {
  return copy && typeof copy[key] === 'string' ? copy[key] : fallback;
}

function installLocalizedProgressRenderer(viewer, copy, logger) {
  var helpers = globalThis.FSBDashboardRuntimeState || {};
  if (
    !viewer
    || typeof viewer.registerOverlay !== 'function'
    || typeof helpers.formatProgressOverlay !== 'function'
  ) {
    return;
  }

  viewer.registerOverlay('progress', function(value, _anchorRect, layer) {
    var element = layer && typeof layer.querySelector === 'function'
      ? layer.querySelector('.ps-overlay-progress')
      : null;
    if (!element) return;
    if (!value) {
      element.style.display = 'none';
      return;
    }
    try {
      element.textContent = helpers.formatProgressOverlay(value, copy || {});
      element.style.display = 'block';
    } catch (error) {
      logger.warn('[FSB Viewer] could not format localized progress', error);
      var working = localizedText(copy, 'phaseWorking', 'Working');
      element.textContent = working + ' - ' + working;
      element.style.display = 'block';
    }
  });
}

function payloadMayInstallFrames(type, payload) {
  if (type === STREAM.SNAPSHOT || type === STREAM.SUBTREE_RESPONSE) return true;
  if (type !== STREAM.MUTATIONS || !payload || !Array.isArray(payload.mutations)) return false;
  return payload.mutations.some(function(mutation) {
    if (!mutation || typeof mutation !== 'object') return false;
    return mutation.op === 'frame'
      || mutation.op === 'shadow-root'
      || mutation.op === 'rm'
      || (Array.isArray(mutation.frames) && mutation.frames.length > 0)
      || (Array.isArray(mutation.shadowRoots) && mutation.shadowRoots.length > 0);
  });
}

function installViewerLocalization(container, copy, logger) {
  if (!container) return { refresh: noop, stop: noop };

  var strings = copy || {};
  var frameLoadCleanup = new WeakMap();
  var frameDocumentCleanup = new WeakMap();
  var frameDocument = new WeakMap();
  var frameRefByFrame = new WeakMap();
  var frameRefs = new Set();
  var frameFinalizer = typeof FinalizationRegistry === 'function'
    ? new FinalizationRegistry(function(ref) { frameRefs.delete(ref); })
    : null;
  var stopped = false;

  function text(key, fallback) {
    return localizedText(strings, key, fallback);
  }

  function elementsWithin(root, selector) {
    var start = root && root.nodeType === 3 ? root.parentElement : root;
    if (!start) return [];
    var elements = [];
    if (typeof start.matches === 'function' && start.matches(selector)) elements.push(start);
    if (typeof start.querySelectorAll === 'function') {
      var descendants = start.querySelectorAll(selector);
      for (var i = 0; i < descendants.length; i += 1) elements.push(descendants[i]);
    }
    return elements;
  }

  function replaceExact(root, selector, expected, replacement) {
    elementsWithin(root, selector).forEach(function(element) {
      if (element.textContent === expected && replacement !== expected) {
        element.textContent = replacement;
      }
    });
  }

  function addLoadListener(target, handler, capture) {
    target.addEventListener('load', handler, !!capture);
    return function removeLoadListener() {
      target.removeEventListener('load', handler, !!capture);
    };
  }

  function trackFrame(frame) {
    if (frameRefByFrame.has(frame) || typeof WeakRef !== 'function') return;
    var ref = new WeakRef(frame);
    frameRefByFrame.set(frame, ref);
    frameRefs.add(ref);
    if (frameFinalizer) frameFinalizer.register(frame, ref, ref);
  }

  function untrackFrame(frame) {
    var ref = frameRefByFrame.get(frame);
    if (!ref) return;
    frameRefs.delete(ref);
    frameRefByFrame.delete(frame);
    if (frameFinalizer) frameFinalizer.unregister(ref);
  }

  function framesWithin(root) {
    var frames = [];
    var seenFrames = new WeakSet();
    var seenRoots = new WeakSet();

    function visit(currentRoot) {
      if (!currentRoot || seenRoots.has(currentRoot)) return;
      seenRoots.add(currentRoot);
      elementsWithin(currentRoot, 'iframe').forEach(function(frame) {
        if (!seenFrames.has(frame)) {
          seenFrames.add(frame);
          frames.push(frame);
        }
      });
      var hosts = elementsWithin(currentRoot, '*');
      var start = currentRoot && currentRoot.nodeType === 3 ? currentRoot.parentElement : currentRoot;
      if (start && start.shadowRoot) hosts.push(start);
      hosts.forEach(function(host) {
        if (host && host.shadowRoot) visit(host.shadowRoot);
      });
    }

    visit(root);
    return frames;
  }

  function isRendererPlaceholderDocument(frame, doc) {
    var srcdoc = frame && typeof frame.getAttribute === 'function'
      ? frame.getAttribute('srcdoc') || ''
      : '';
    // PhantomStream's cross-origin placeholder has a package-owned document
    // shell that differs from every captured same-origin frame: it omits the
    // generated viewport meta and includes this exact static stylesheet prefix.
    // Require that provenance before touching content so a mirrored page that
    // happens to use the same CSS class remains producer-owned and unchanged.
    if (
      srcdoc.indexOf('<meta name="viewport"') !== -1
      || srcdoc.indexOf(
        '<meta charset="UTF-8"><style>body{margin:0;font:13px system-ui,sans-serif;'
        + 'color:#30333a;background:#f6f7f9;}.ps-frame-placeholder{',
      ) === -1
    ) {
      return false;
    }
    var body = doc && doc.body;
    if (!body || !body.children || body.children.length !== 1) return false;
    var onlyChild = body.firstElementChild;
    return !!(
      onlyChild
      && typeof onlyChild.matches === 'function'
      && onlyChild.matches('.ps-frame-placeholder[role="note"]')
    );
  }

  function localizeFrameDocument(frame, doc) {
    if (!doc) return;
    if (isRendererPlaceholderDocument(frame, doc)) {
      replaceExact(doc, '.ps-frame-placeholder strong', 'Cross-origin iframe', text('viewerCrossOriginFrame', 'Cross-origin iframe'));
      elementsWithin(doc, '.ps-frame-placeholder p').forEach(function(element) {
        var value = element.textContent || '';
        if (value.indexOf('Origin: ') === 0) {
          element.textContent = text('viewerOriginLabel', 'Origin') + ': ' + value.slice(8);
        } else if (value.indexOf('Source: ') === 0) {
          element.textContent = text('viewerSourceLabel', 'Source') + ': ' + value.slice(8);
        }
      });
    }
    wireFrames(doc, false);
  }

  function localizeCurrentFrame(frame) {
    if (stopped) return;
    try {
      var doc = frame.contentDocument;
      if (!doc) return;
      if (frameDocument.get(frame) === doc) {
        localizeFrameDocument(frame, doc);
        return;
      }

      var previousDocument = frameDocument.get(frame);
      if (previousDocument) unwireFrames(previousDocument);
      var previousCleanup = frameDocumentCleanup.get(frame);
      if (previousCleanup) previousCleanup();

      var onNestedFrameLoad = function(event) {
        var target = event && event.target;
        if (target && String(target.tagName || '').toLowerCase() === 'iframe') {
          wireFrame(target);
        }
      };
      frameDocument.set(frame, doc);
      frameDocumentCleanup.set(frame, addLoadListener(doc, onNestedFrameLoad, true));
      localizeFrameDocument(frame, doc);
    } catch (error) {
      logger.warn('[FSB Viewer] could not localize nested frame', error);
    }
  }

  function wireFrame(frame) {
    if (!frameLoadCleanup.has(frame)) {
      var onFrameLoad = function() { localizeCurrentFrame(frame); };
      frameLoadCleanup.set(frame, addLoadListener(frame, onFrameLoad, false));
      trackFrame(frame);
    }
    localizeCurrentFrame(frame);
  }

  function wireFrames(root, includeHostTitle) {
    framesWithin(root).forEach(function(frame) {
      if (includeHostTitle && frame.getAttribute('title') === 'PhantomStream live mirror') {
        var title = text('viewerLiveMirrorTitle', 'PhantomStream live mirror');
        if (title !== frame.getAttribute('title')) frame.setAttribute('title', title);
      }
      wireFrame(frame);
    });
  }

  function localizeHostTree(root) {
    wireFrames(root, true);
    elementsWithin(root, '[aria-label="Play mirrored media"]').forEach(function(element) {
      var label = text('viewerPlayMedia', 'Play mirrored media');
      if (label !== element.getAttribute('aria-label')) element.setAttribute('aria-label', label);
    });
    elementsWithin(root, '[aria-label="Unmute mirrored media"]').forEach(function(element) {
      var label = text('viewerUnmuteMedia', 'Unmute mirrored media');
      if (label !== element.getAttribute('aria-label')) element.setAttribute('aria-label', label);
    });
    replaceExact(root, '.ps-overlay-media-unmute-label', 'Unmute', text('viewerUnmute', 'Unmute'));
    replaceExact(root, '.ps-overlay-media-poster', 'Media (poster only)', text('viewerMediaPosterOnly', 'Media (poster only)'));
    replaceExact(root, '.ps-overlay-media-unavailable', 'Media unavailable', text('viewerMediaUnavailable', 'Media unavailable'));

    elementsWithin(root, '.ps-overlay-dialog-type').forEach(function(element) {
      var replacement = '';
      switch (element.textContent || '') {
        case 'Alert':
          replacement = text('dialogAlert', 'Alert');
          break;
        case 'Confirm':
          replacement = text('dialogConfirm', 'Confirm');
          break;
        case 'Prompt':
          replacement = text('dialogPrompt', 'Prompt');
          break;
        default:
          break;
      }
      if (replacement && replacement !== element.textContent) element.textContent = replacement;
    });
  }

  function unwireFrame(frame) {
    var doc = frameDocument.get(frame);
    if (doc) unwireFrames(doc);
    var removeDocumentListener = frameDocumentCleanup.get(frame);
    if (removeDocumentListener) removeDocumentListener();
    frameDocumentCleanup.delete(frame);
    frameDocument.delete(frame);
    var removeFrameListener = frameLoadCleanup.get(frame);
    if (removeFrameListener) removeFrameListener();
    frameLoadCleanup.delete(frame);
    untrackFrame(frame);
  }

  function unwireFrames(root) {
    framesWithin(root).forEach(unwireFrame);
  }

  function collectLiveFrames(root, liveFrames) {
    framesWithin(root).forEach(function(frame) {
      if (liveFrames.has(frame)) return;
      liveFrames.add(frame);
      try {
        if (frame.contentDocument) collectLiveFrames(frame.contentDocument, liveFrames);
      } catch (_error) {
        // Renderer frames are sandboxed same-origin, but containment here keeps
        // cleanup safe if a host supplies a different iframe implementation.
      }
    });
  }

  function reconcileTrackedFrames() {
    var liveFrames = new Set();
    collectLiveFrames(container, liveFrames);
    Array.from(frameRefs).forEach(function(ref) {
      var frame = ref.deref();
      if (!frame) {
        frameRefs.delete(ref);
      } else if (!liveFrames.has(frame)) {
        unwireFrame(frame);
      }
    });
  }

  var hostObserver = null;
  if (typeof MutationObserver === 'function') {
    hostObserver = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        Array.prototype.forEach.call(mutation.removedNodes || [], unwireFrames);
        if (mutation.type === 'attributes') localizeHostTree(mutation.target);
        Array.prototype.forEach.call(mutation.addedNodes || [], localizeHostTree);
      });
      reconcileTrackedFrames();
    });
    hostObserver.observe(container, {
      attributes: true,
      attributeFilter: ['aria-label', 'title'],
      childList: true,
      subtree: true,
    });
  }
  localizeHostTree(container);

  return {
    refresh: function refreshViewerLocalization() {
      if (!stopped) {
        localizeHostTree(container);
        reconcileTrackedFrames();
      }
    },
    stop: function stopViewerLocalization() {
      if (stopped) return;
      stopped = true;
      Array.from(frameRefs).forEach(function(ref) {
        var frame = ref.deref();
        if (frame) unwireFrame(frame);
      });
      unwireFrames(container);
      frameRefs.clear();
      if (hostObserver) hostObserver.disconnect();
    },
  };
}

function createHostTransport(options, logger) {
  var handlers = new Set();
  var cfg = options || {};

  return {
    transport: {
      send: function(type, payload) {
        safeCall(cfg.onControl, [type, payload || {}], logger, 'control');
        if (type === CONTROL.START) {
          safeCall(cfg.onResync, [payload || {}], logger, 'resync');
        } else if (type === CONTROL.SUBTREE_REQUEST) {
          safeCall(cfg.onSubtreeRequest, [payload || {}], logger, 'subtree-request');
        } else if (type) {
          safeCall(cfg.onUnsupportedControl, [type, payload || {}], logger, 'unsupported-control');
        }
      },
      onMessage: function(handler) {
        if (typeof handler !== 'function') return noop;
        handlers.add(handler);
        return function unsubscribeViewerMessage() {
          handlers.delete(handler);
        };
      },
      onStatus: typeof cfg.onStatus === 'function' ? function(handler) {
        return cfg.onStatus(handler);
      } : undefined,
    },
    dispatch: function(type, payload) {
      if (!type) return;
      handlers.forEach(function(handler) {
        try {
          handler(type, payload || {});
        } catch (err) {
          logger.error('[FSB Viewer] dispatch failed', type, err);
        }
      });
    },
    clear: function() {
      handlers.clear();
    },
  };
}

function createDashboardViewer(options) {
  var cfg = options || {};
  var logger = normalizeLogger(cfg.logger);
  var hostTransport = createHostTransport(cfg, logger);
  var viewer = createViewer({
    container: cfg.container,
    transport: hostTransport.transport,
    logger: logger,
    disconnectDelayMs: cfg.disconnectDelayMs,
    // Phase 33 (MEDIA): live <video>/<audio> mirroring. createViewer defaults
    // mediaMode to 'reference' when undefined and validates it (throws on an
    // invalid value); the degrade callbacks + reconciler tolerances are
    // optional and pass straight through ('off' | 'poster' | 'reference').
    mediaMode: cfg.mediaMode,
    onMediaBlocked: cfg.onMediaBlocked,
    onMediaUnavailable: cfg.onMediaUnavailable,
    mediaReconcileConfig: cfg.mediaReconcileConfig,
  });
  var localization = installViewerLocalization(cfg.container, cfg.copy, logger);
  installLocalizedProgressRenderer(viewer, cfg.copy, logger);
  var offState = typeof cfg.onState === 'function'
    ? viewer.on('state', cfg.onState)
    : null;
  var offHealth = typeof cfg.onHealth === 'function'
    ? viewer.on('health', cfg.onHealth)
    : null;

  function dispatch(type, payload) {
    var nextPayload = payload || {};
    hostTransport.dispatch(type, nextPayload);
    if (payloadMayInstallFrames(type, nextPayload)) localization.refresh();
  }

  function dispatchMessage(message) {
    var msg = message || {};
    dispatch(msg.type, msg.payload || {});
  }

  function detach() {
    if (offState) offState();
    if (offHealth) offHealth();
    localization.stop();
    viewer.detach();
    hostTransport.clear();
  }

  function destroy() {
    if (offState) offState();
    if (offHealth) offHealth();
    localization.stop();
    viewer.destroy();
    hostTransport.clear();
  }

  function getViewportMapping() {
    return viewer.getViewportMapping();
  }

  function mapPointToViewport(point) {
    var mapping = getViewportMapping();
    return mapHostPointToViewport(point || {}, mapping.scale || {});
  }

  return Object.freeze({
    dispatch: dispatch,
    dispatchMessage: dispatchMessage,
    detach: detach,
    destroy: destroy,
    getViewportMapping: getViewportMapping,
    mapPointToViewport: mapPointToViewport,
    resolveNode: viewer.resolveNode,
    highlightNode: viewer.highlightNode,
    clearHighlight: viewer.clearHighlight,
    requestSubtree: viewer.requestSubtree,
    registerOverlay: viewer.registerOverlay,
    on: viewer.on,
    viewer: viewer,
  });
}

export { installLocalizedProgressRenderer, installViewerLocalization, payloadMayInstallFrames };

globalThis.FSBPhantomStreamViewer = Object.freeze({
  CONTROL: CONTROL,
  STREAM: STREAM,
  computeScale: computeScale,
  createDashboardViewer: createDashboardViewer,
  createViewer: createViewer,
  mapHostPointToViewport: mapHostPointToViewport,
  mapRectToHost: mapRectToHost,
});
