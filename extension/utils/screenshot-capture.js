/**
 * Chromium compositor screenshot engine used by autopilot and MCP.
 *
 * The engine intentionally returns base64 only to its immediate caller. Each
 * front door is responsible for its delivery policy (transient model image or
 * private MCP-managed file/native image result).
 */
(function initFsbScreenshotCapture(root) {
  'use strict';

  const PNG_MIME_TYPE = 'image/png';
  const MAX_EDGE = 16384;
  const MAX_PIXELS = 25000000;
  const MAX_BYTES = 25 * 1024 * 1024;
  const VALID_MODES = new Set(['viewport', 'full_page', 'region', 'element']);
  const VALID_COORDINATE_SPACES = new Set(['viewport', 'page']);
  const VALID_DEVICE_MODES = new Set(['current', 'desktop', 'mobile']);
  const VALID_ORIENTATIONS = new Set(['auto', 'portrait', 'landscape']);

  class ScreenshotError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = 'ScreenshotError';
      this.code = code;
      this.retryable = options.retryable === true;
      if (options.cause) this.cause = options.cause;
    }
  }

  function fail(code, message, options) {
    throw new ScreenshotError(code, message, options);
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function validateArguments(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      fail('INVALID_SCREENSHOT_ARGUMENTS', 'Screenshot arguments must be an object.');
    }

    const params = { ...raw };
    params.mode = params.mode === undefined ? 'viewport' : params.mode;
    params.coordinate_space = params.coordinate_space === undefined ? 'viewport' : params.coordinate_space;
    params.wait_ms = params.wait_ms === undefined ? 250 : params.wait_ms;
    if (own(params, 'include_fsb_overlays') && typeof params.include_fsb_overlays !== 'boolean') {
      fail('INVALID_SCREENSHOT_ARGUMENTS', 'include_fsb_overlays must be a boolean.');
    }
    params.include_fsb_overlays = params.include_fsb_overlays === true;

    if (!VALID_MODES.has(params.mode)) {
      fail('INVALID_SCREENSHOT_ARGUMENTS', 'mode must be viewport, full_page, region, or element.');
    }
    if (!finite(params.wait_ms) || params.wait_ms < 0 || params.wait_ms > 5000) {
      fail('INVALID_SCREENSHOT_ARGUMENTS', 'wait_ms must be a finite number from 0 through 5000.');
    }

    const hasDimensions = own(params, 'viewport_width') || own(params, 'viewport_height');
    if (hasDimensions && params.device_mode === undefined) params.device_mode = 'desktop';
    params.device_mode = params.device_mode === undefined ? 'current' : params.device_mode;
    if (!VALID_DEVICE_MODES.has(params.device_mode)) {
      fail('INVALID_SCREENSHOT_ARGUMENTS', 'device_mode must be current, desktop, or mobile.');
    }

    const emulating = params.device_mode !== 'current';
    if (emulating) {
      if (!finite(params.viewport_width) || !finite(params.viewport_height)
          || params.viewport_width <= 0 || params.viewport_height <= 0) {
        fail('INVALID_SCREENSHOT_ARGUMENTS', 'desktop and mobile device modes require positive viewport_width and viewport_height values.');
      }
      if (!Number.isInteger(params.viewport_width) || !Number.isInteger(params.viewport_height)) {
        fail('INVALID_SCREENSHOT_ARGUMENTS', 'viewport dimensions must be integer CSS pixels.');
      }
    } else if (hasDimensions || own(params, 'device_scale_factor')) {
      fail('INVALID_SCREENSHOT_ARGUMENTS', 'Viewport dimensions and device_scale_factor require desktop or mobile emulation.');
    }

    if (own(params, 'device_scale_factor')) {
      if (!finite(params.device_scale_factor) || params.device_scale_factor < 1 || params.device_scale_factor > 4) {
        fail('INVALID_SCREENSHOT_ARGUMENTS', 'device_scale_factor must be a finite number from 1 through 4.');
      }
    } else if (emulating) {
      params.device_scale_factor = 1;
    }
    if (emulating) {
      assertSize(
        Math.ceil(params.viewport_width * params.device_scale_factor),
        Math.ceil(params.viewport_height * params.device_scale_factor)
      );
    }

    params.orientation = params.orientation === undefined ? 'auto' : params.orientation;
    if (!VALID_ORIENTATIONS.has(params.orientation)) {
      fail('INVALID_SCREENSHOT_ARGUMENTS', 'orientation must be auto, portrait, or landscape.');
    }
    if (params.device_mode !== 'mobile' && own(raw, 'orientation')) {
      fail('INVALID_SCREENSHOT_ARGUMENTS', 'orientation is supported only in mobile device mode.');
    }

    const regionFields = ['x', 'y', 'width', 'height'];
    const hasRegionField = regionFields.some((field) => own(params, field));
    if (params.mode === 'region') {
      if (!VALID_COORDINATE_SPACES.has(params.coordinate_space)) {
        fail('INVALID_SCREENSHOT_ARGUMENTS', 'coordinate_space must be viewport or page.');
      }
      for (const field of regionFields) {
        if (!finite(params[field])) {
          fail('INVALID_SCREENSHOT_ARGUMENTS', `Region ${field} must be a finite number.`);
        }
      }
      if (params.x < 0 || params.y < 0 || params.width <= 0 || params.height <= 0) {
        fail('INVALID_SCREENSHOT_ARGUMENTS', 'Region coordinates must be non-negative and dimensions must be positive.');
      }
    } else if (hasRegionField || own(raw, 'coordinate_space')) {
      fail('INVALID_SCREENSHOT_ARGUMENTS', 'Region coordinates and coordinate_space are valid only when mode is region.');
    }

    if (params.mode === 'element') {
      if (typeof params.selector !== 'string' || !params.selector.trim()) {
        fail('INVALID_SCREENSHOT_ARGUMENTS', 'Element mode requires a CSS selector or FSB element ref.');
      }
      params.selector = params.selector.trim();
    } else if (own(params, 'selector')) {
      fail('INVALID_SCREENSHOT_ARGUMENTS', 'selector is valid only when mode is element.');
    }

    if (own(params, 'tab_id') && (!Number.isInteger(params.tab_id) || params.tab_id <= 0)) {
      fail('INVALID_SCREENSHOT_ARGUMENTS', 'tab_id must be a positive integer.');
    }

    return params;
  }

  function scriptResult(results) {
    return Array.isArray(results) && results[0] ? results[0].result : undefined;
  }

  async function executeScript(scripting, tabId, func, args = []) {
    return scriptResult(await scripting.executeScript({ target: { tabId }, func, args }));
  }

  function overlayInstallScript(styleId) {
    const stateKey = '__fsbScreenshotOverlayStates';
    let states = globalThis[stateKey];
    if (!(states instanceof Map)) {
      states = new Map();
      Object.defineProperty(globalThis, stateKey, {
        value: states,
        configurable: true,
        enumerable: false,
        writable: false
      });
    }

    let state = states.get(styleId);
    if (!state) {
      const priorStyle = document.getElementById(styleId);
      if (priorStyle) priorStyle.remove();
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = '[data-fsb-overlay]{display:none!important;visibility:hidden!important;opacity:0!important}';
      (document.head || document.documentElement).appendChild(style);
      state = { style, entries: new Map(), observer: null, apply: null };
      states.set(styleId, state);

      state.apply = (element) => {
        if (!element || element.nodeType !== 1) return;
        const candidates = [];
        if (element.matches && element.matches('[data-fsb-overlay]')) candidates.push(element);
        if (element.querySelectorAll) candidates.push(...element.querySelectorAll('[data-fsb-overlay]'));
        for (const overlay of candidates) {
          if (!state.entries.has(overlay)) {
            const prior = {};
            for (const property of ['display', 'visibility', 'opacity']) {
              prior[property] = {
                value: overlay.style.getPropertyValue(property),
                priority: overlay.style.getPropertyPriority(property)
              };
            }
            state.entries.set(overlay, prior);
          }
          overlay.style.setProperty('display', 'none', 'important');
          overlay.style.setProperty('visibility', 'hidden', 'important');
          overlay.style.setProperty('opacity', '0', 'important');
        }
      };
      state.apply(document.documentElement);
      state.observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) state.apply(node);
        }
      });
      state.observer.observe(document.documentElement, { childList: true, subtree: true });
    } else if (typeof state.apply === 'function') {
      state.apply(document.documentElement);
    }
    return state.entries.size;
  }

  function overlayRemoveScript(styleId) {
    const stateKey = '__fsbScreenshotOverlayStates';
    const states = globalThis[stateKey];
    const state = states instanceof Map ? states.get(styleId) : null;
    if (state) {
      if (state.observer) state.observer.disconnect();
      for (const [overlay, prior] of state.entries) {
        for (const property of ['display', 'visibility', 'opacity']) {
          const original = prior[property];
          if (original && original.value) {
            overlay.style.setProperty(property, original.value, original.priority || '');
          } else {
            overlay.style.removeProperty(property);
          }
        }
      }
      if (state.style) state.style.remove();
      states.delete(styleId);
      if (states.size === 0) {
        try { delete globalThis[stateKey]; } catch (_error) { /* non-critical */ }
      }
    } else {
      const style = document.getElementById(styleId);
      if (style) style.remove();
    }
    return true;
  }

  async function settleScript(waitMs) {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready.catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 1500))
      ]);
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    return true;
  }

  function elementRectScript(selector) {
    function deepQuery(rootNode, query) {
      let match = null;
      try { match = rootNode.querySelector(query); } catch (_error) { return null; }
      if (match) return match;
      const all = rootNode.querySelectorAll('*');
      for (const node of all) {
        if (!node.shadowRoot) continue;
        const nested = deepQuery(node.shadowRoot, query);
        if (nested) return nested;
      }
      return null;
    }

    let element = null;
    try {
      if (globalThis.FSB && typeof globalThis.FSB.resolveRef === 'function') {
        element = globalThis.FSB.resolveRef(selector);
      }
    } catch (_error) { /* fall through */ }
    if (!element) {
      try {
        if (globalThis.FSB && typeof globalThis.FSB.querySelectorWithShadow === 'function') {
          element = globalThis.FSB.querySelectorWithShadow(selector);
        }
      } catch (_error) { /* fall through */ }
    }
    if (!element) element = deepQuery(document, selector);
    if (!element || !element.isConnected) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + globalThis.scrollX,
      y: rect.top + globalThis.scrollY,
      width: rect.width,
      height: rect.height
    };
  }

  function metricRect(metric, fallback = {}) {
    return {
      x: finite(metric && (metric.pageX ?? metric.x)) ? (metric.pageX ?? metric.x) : (fallback.x || 0),
      y: finite(metric && (metric.pageY ?? metric.y)) ? (metric.pageY ?? metric.y) : (fallback.y || 0),
      width: finite(metric && metric.clientWidth) ? metric.clientWidth
        : (finite(metric && metric.width) ? metric.width : fallback.width),
      height: finite(metric && metric.clientHeight) ? metric.clientHeight
        : (finite(metric && metric.height) ? metric.height : fallback.height)
    };
  }

  function within(inner, outer) {
    const epsilon = 0.01;
    return inner.x >= outer.x - epsilon
      && inner.y >= outer.y - epsilon
      && inner.x + inner.width <= outer.x + outer.width + epsilon
      && inner.y + inner.height <= outer.y + outer.height + epsilon;
  }

  function selectCaptureRect(params, metrics, elementRect) {
    const viewport = metricRect(metrics.cssVisualViewport || metrics.visualViewport,
      metricRect(metrics.cssLayoutViewport || metrics.layoutViewport, { x: 0, y: 0, width: 0, height: 0 }));
    const content = metricRect(metrics.cssContentSize || metrics.contentSize, {
      x: 0,
      y: 0,
      width: viewport.x + viewport.width,
      height: viewport.y + viewport.height
    });
    content.x = 0;
    content.y = 0;

    if (![viewport.width, viewport.height, content.width, content.height].every(finite)) {
      fail('SCREENSHOT_CAPTURE_FAILED', 'Chromium returned incomplete page layout metrics.');
    }

    let rect;
    let bounds;
    if (params.mode === 'viewport') {
      rect = viewport;
      bounds = content;
    } else if (params.mode === 'full_page') {
      rect = content;
      bounds = content;
    } else if (params.mode === 'element') {
      if (!elementRect) fail('SCREENSHOT_TARGET_NOT_FOUND', `No element matched ${params.selector}.`);
      rect = elementRect;
      bounds = content;
    } else {
      bounds = params.coordinate_space === 'viewport' ? viewport : content;
      rect = {
        x: params.x + (params.coordinate_space === 'viewport' ? viewport.x : 0),
        y: params.y + (params.coordinate_space === 'viewport' ? viewport.y : 0),
        width: params.width,
        height: params.height
      };
    }

    if (!finite(rect.x) || !finite(rect.y) || !finite(rect.width) || !finite(rect.height)
        || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0) {
      const code = params.mode === 'element' ? 'SCREENSHOT_TARGET_NOT_FOUND' : 'SCREENSHOT_REGION_OUT_OF_BOUNDS';
      fail(code, 'The selected screenshot rectangle has no capturable area.');
    }
    if (!within(rect, bounds)) {
      fail('SCREENSHOT_REGION_OUT_OF_BOUNDS', 'The selected screenshot rectangle is outside the requested viewport or page.');
    }
    return rect;
  }

  function assertSize(width, height, byteLength) {
    if (!finite(width) || !finite(height) || width <= 0 || height <= 0
        || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS
        || (finite(byteLength) && byteLength > MAX_BYTES)) {
      fail('SCREENSHOT_TOO_LARGE', `Screenshot exceeds the ${MAX_EDGE}px edge, ${MAX_PIXELS} pixel, or 25 MiB limit.`);
    }
  }

  function decodeBase64(data) {
    if (typeof data !== 'string' || !data || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0) {
      fail('SCREENSHOT_CAPTURE_FAILED', 'Chromium returned invalid screenshot data.');
    }
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(data, 'base64'));
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function pngDimensions(bytes) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) {
      fail('SCREENSHOT_CAPTURE_FAILED', 'Chromium did not return a valid PNG image.');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  async function sha256(bytes, cryptoApi) {
    const subtle = cryptoApi && cryptoApi.subtle;
    if (!subtle || typeof subtle.digest !== 'function') {
      fail('SCREENSHOT_CAPTURE_FAILED', 'SHA-256 support is unavailable.');
    }
    const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
    return Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  function captureId(cryptoApi) {
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    return `capture-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isDebuggerContention(error) {
    const message = error && error.message ? error.message : String(error || '');
    return /another debugger|already attached|debugger is busy|target is being debugged/i.test(message);
  }

  function errorResult(error) {
    const typed = error instanceof ScreenshotError
      ? error
      : new ScreenshotError('SCREENSHOT_CAPTURE_FAILED', error && error.message ? error.message : String(error), { cause: error });
    return {
      success: false,
      error: typed.message,
      code: typed.code,
      retryable: typed.retryable === true
    };
  }

  async function capture(rawParams, tabId, options = {}) {
    let params;
    try {
      params = validateArguments(rawParams);
    } catch (error) {
      return errorResult(error);
    }

    const chromeApi = options.chrome || root.chrome;
    const debuggerApi = options.debugger || (chromeApi && chromeApi.debugger);
    const scripting = options.scripting || (chromeApi && chromeApi.scripting);
    const tabs = options.tabs || (chromeApi && chromeApi.tabs);
    const leaseApi = options.lease || root.FsbCdpLease;
    const releaseOwnedDebugger = options.releaseOwnedDebugger || root.FsbReleaseOwnedDebuggerForTab;
    const cryptoApi = options.crypto || root.crypto;
    const targetTabId = tabId || params.tab_id;
    const warnings = [];
    let lease = null;
    let attached = false;
    let metricsApplied = false;
    let touchApplied = false;
    let overlayStyleId = null;
    const startedAt = Date.now();

    if (!Number.isInteger(targetTabId) || targetTabId <= 0) {
      return errorResult(new ScreenshotError('INVALID_SCREENSHOT_ARGUMENTS', 'A positive tab_id is required.'));
    }
    if (!debuggerApi || !scripting || !tabs) {
      return errorResult(new ScreenshotError('SCREENSHOT_CAPTURE_FAILED', 'Required Chrome capture APIs are unavailable.'));
    }

    try {
      if (!options.skipLease) {
        if (!leaseApi || typeof leaseApi.acquire !== 'function') {
          fail('SCREENSHOT_CAPTURE_FAILED', 'The CDP lease coordinator is unavailable.');
        }
        try {
          lease = await leaseApi.acquire(targetTabId, { timeoutMs: options.leaseTimeoutMs ?? 10000 });
        } catch (error) {
          fail('SCREENSHOT_DEBUGGER_BUSY', error.message || 'The debugger is busy.', { retryable: true, cause: error });
        }
      }

      // KeyboardEmulator intentionally keeps an FSB-owned attachment warm.
      // Once this operation owns the per-tab lease it is safe to relinquish
      // that internal attachment; external DevTools/debugger owners are never
      // detached here.
      if (typeof releaseOwnedDebugger === 'function') {
        try {
          await releaseOwnedDebugger(targetTabId);
        } catch (_error) {
          warnings.push({
            code: 'SCREENSHOT_FSB_DEBUGGER_RELEASE_FAILED',
            message: 'Could not release an idle FSB debugger attachment before capture.'
          });
        }
      }

      try {
        await debuggerApi.attach({ tabId: targetTabId }, '1.3');
        attached = true;
      } catch (error) {
        if (isDebuggerContention(error)) {
          fail('SCREENSHOT_DEBUGGER_BUSY', 'Another debugger owns this tab. Close DevTools or retry later.', { retryable: true, cause: error });
        }
        throw error;
      }

      const emulating = params.device_mode !== 'current';
      if (emulating) {
        const mobile = params.device_mode === 'mobile';
        const orientation = params.orientation === 'auto'
          ? (params.viewport_width > params.viewport_height ? 'landscape' : 'portrait')
          : params.orientation;
        const metricsParams = {
          width: params.viewport_width,
          height: params.viewport_height,
          deviceScaleFactor: params.device_scale_factor,
          mobile,
          screenWidth: params.viewport_width,
          screenHeight: params.viewport_height
        };
        if (mobile) {
          metricsParams.screenOrientation = orientation === 'landscape'
            ? { type: 'landscapePrimary', angle: 90 }
            : { type: 'portraitPrimary', angle: 0 };
        }
        await debuggerApi.sendCommand({ tabId: targetTabId }, 'Emulation.setDeviceMetricsOverride', metricsParams);
        metricsApplied = true;
        if (mobile) {
          await debuggerApi.sendCommand({ tabId: targetTabId }, 'Emulation.setTouchEmulationEnabled', {
            enabled: true,
            maxTouchPoints: 5
          });
          touchApplied = true;
        }
      }

      if (!params.include_fsb_overlays) {
        overlayStyleId = `fsb-screenshot-hide-${captureId(cryptoApi)}`;
        await executeScript(scripting, targetTabId, overlayInstallScript, [overlayStyleId]);
      }

      try {
        await executeScript(scripting, targetTabId, settleScript, [params.wait_ms]);
      } catch (_error) {
        warnings.push({ code: 'SCREENSHOT_SETTLE_INCOMPLETE', message: 'The page settle wait did not complete; the live frame was captured.' });
      }
      if (overlayStyleId) {
        await executeScript(scripting, targetTabId, overlayInstallScript, [overlayStyleId]);
      }

      const metrics = await debuggerApi.sendCommand({ tabId: targetTabId }, 'Page.getLayoutMetrics');
      let elementRect = null;
      if (params.mode === 'element') {
        try {
          elementRect = await executeScript(scripting, targetTabId, elementRectScript, [params.selector]);
        } catch (error) {
          fail('SCREENSHOT_TARGET_NOT_FOUND', `Unable to resolve element ${params.selector}: ${error.message}`);
        }
      }
      const rect = selectCaptureRect(params, metrics || {}, elementRect);

      let scaleFactor = params.device_mode === 'current' ? 1 : params.device_scale_factor;
      if (params.device_mode === 'current') {
        try {
          const evaluated = await debuggerApi.sendCommand({ tabId: targetTabId }, 'Runtime.evaluate', {
            expression: 'window.devicePixelRatio',
            returnByValue: true
          });
          const measured = evaluated && evaluated.result && evaluated.result.value;
          if (finite(measured) && measured > 0) scaleFactor = measured;
        } catch (_error) {
          warnings.push({ code: 'SCREENSHOT_SCALE_FACTOR_UNKNOWN', message: 'Could not read devicePixelRatio; output limits were checked again after capture.' });
        }
      }
      assertSize(Math.ceil(rect.width * scaleFactor), Math.ceil(rect.height * scaleFactor));

      const captured = await debuggerApi.sendCommand({ tabId: targetTabId }, 'Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: params.mode !== 'viewport',
        clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 }
      });
      const imageData = captured && captured.data;
      const bytes = decodeBase64(imageData);
      const output = pngDimensions(bytes);
      assertSize(output.width, output.height, bytes.byteLength);
      const tab = await tabs.get(targetTabId);
      const hash = await sha256(bytes, cryptoApi);
      const effectiveOrientation = params.device_mode === 'mobile'
        ? (params.orientation === 'auto'
          ? (params.viewport_width > params.viewport_height ? 'landscape' : 'portrait')
          : params.orientation)
        : null;

      return {
        success: true,
        image_data: imageData,
        mime_type: PNG_MIME_TYPE,
        metadata: {
          capture_id: captureId(cryptoApi),
          source_url: (tab && tab.url) || '',
          timestamp: new Date().toISOString(),
          mode: params.mode,
          css_rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          output_width: output.width,
          output_height: output.height,
          byte_length: bytes.byteLength,
          mime_type: PNG_MIME_TYPE,
          sha256: hash,
          effective_emulation: {
            device_mode: params.device_mode,
            viewport_width: params.device_mode === 'current' ? null : params.viewport_width,
            viewport_height: params.device_mode === 'current' ? null : params.viewport_height,
            device_scale_factor: params.device_mode === 'current' ? scaleFactor : params.device_scale_factor,
            orientation: effectiveOrientation,
            touch: params.device_mode === 'mobile'
          },
          delivery_status: 'captured',
          duration_ms: Date.now() - startedAt,
          warnings
        }
      };
    } catch (error) {
      return errorResult(error);
    } finally {
      if (overlayStyleId) {
        try { await executeScript(scripting, targetTabId, overlayRemoveScript, [overlayStyleId]); } catch (_error) { /* best-effort */ }
      }
      if (touchApplied) {
        try {
          await debuggerApi.sendCommand({ tabId: targetTabId }, 'Emulation.setTouchEmulationEnabled', { enabled: false });
        } catch (_error) { /* best-effort */ }
      }
      if (metricsApplied) {
        try { await debuggerApi.sendCommand({ tabId: targetTabId }, 'Emulation.clearDeviceMetricsOverride'); } catch (_error) { /* best-effort */ }
      }
      if (attached) {
        try { await debuggerApi.detach({ tabId: targetTabId }); } catch (_error) { /* best-effort */ }
      }
      if (lease) lease.release();
    }
  }

  const api = {
    capture,
    validateArguments,
    selectCaptureRect,
    assertSize,
    pngDimensions,
    errorResult,
    ScreenshotError,
    constants: { PNG_MIME_TYPE, MAX_EDGE, MAX_PIXELS, MAX_BYTES }
  };
  root.FsbScreenshotCapture = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({}, api, {
      _test: { overlayInstallScript, overlayRemoveScript }
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);
