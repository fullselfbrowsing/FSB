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
  var offState = typeof cfg.onState === 'function'
    ? viewer.on('state', cfg.onState)
    : null;
  var offHealth = typeof cfg.onHealth === 'function'
    ? viewer.on('health', cfg.onHealth)
    : null;

  function dispatch(type, payload) {
    hostTransport.dispatch(type, payload || {});
  }

  function dispatchMessage(message) {
    var msg = message || {};
    dispatch(msg.type, msg.payload || {});
  }

  function detach() {
    if (offState) offState();
    if (offHealth) offHealth();
    viewer.detach();
    hostTransport.clear();
  }

  function destroy() {
    if (offState) offState();
    if (offHealth) offHealth();
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

globalThis.FSBPhantomStreamViewer = Object.freeze({
  CONTROL: CONTROL,
  STREAM: STREAM,
  computeScale: computeScale,
  createDashboardViewer: createDashboardViewer,
  createViewer: createViewer,
  mapHostPointToViewport: mapHostPointToViewport,
  mapRectToHost: mapRectToHost,
});
