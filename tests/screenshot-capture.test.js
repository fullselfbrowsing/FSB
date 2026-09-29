'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const captureEngine = require('../extension/utils/screenshot-capture.js');
const cdpLease = require('../extension/utils/cdp-lease.js');

function pngBase64(width, height, byteLength = 24) {
  const bytes = Buffer.alloc(Math.max(24, byteLength));
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString('base64');
}

function harness(options = {}) {
  const calls = [];
  const metrics = options.metrics || {
    cssVisualViewport: { pageX: 10, pageY: 20, clientWidth: 800, clientHeight: 600 },
    cssLayoutViewport: { pageX: 10, pageY: 20, clientWidth: 800, clientHeight: 600 },
    cssContentSize: { width: 1200, height: 2000 },
  };
  const debuggerApi = {
    async attach(target, version) {
      calls.push(['attach', target.tabId, version]);
      if (options.attachError) throw options.attachError;
    },
    async detach(target) { calls.push(['detach', target.tabId]); },
    async sendCommand(target, method, params) {
      calls.push([method, params]);
      if (options.failMethod === method) throw new Error(`failed ${method}`);
      if (method === 'Page.getLayoutMetrics') return metrics;
      if (method === 'Runtime.evaluate') return { result: { value: options.dpr || 1 } };
      if (method === 'Page.captureScreenshot') {
        const width = options.outputWidth || Math.ceil(params.clip.width * (options.dpr || params.deviceScaleFactor || 1));
        const height = options.outputHeight || Math.ceil(params.clip.height * (options.dpr || params.deviceScaleFactor || 1));
        return { data: pngBase64(width, height, options.byteLength) };
      }
      return {};
    },
  };
  const scripting = {
    async executeScript(request) {
      calls.push(['script', request.func.name, request.args]);
      if (request.func.name === 'elementRectScript') {
        return [{ result: options.elementRect === undefined
          ? { x: 40, y: 60, width: 100, height: 50 }
          : options.elementRect }];
      }
      return [{ result: true }];
    },
  };
  const crypto = {
    randomUUID: () => '00000000-0000-4000-8000-000000000001',
    subtle: { digest: async () => new Uint8Array(32).buffer },
  };
  return {
    calls,
    options: {
      debugger: debuggerApi,
      scripting,
      tabs: { get: async () => ({ id: 7, url: 'https://example.test/fixture' }) },
      crypto,
      skipLease: true,
    },
  };
}

test('validates conditional region and emulation arguments', () => {
  const implied = captureEngine.validateArguments({ viewport_width: 1280, viewport_height: 720 });
  assert.equal(implied.device_mode, 'desktop');
  assert.equal(implied.device_scale_factor, 1);
  assert.throws(
    () => captureEngine.validateArguments({ device_mode: 'mobile', viewport_width: 390 }),
    (error) => error.code === 'INVALID_SCREENSHOT_ARGUMENTS',
  );
  assert.throws(
    () => captureEngine.validateArguments({ mode: 'viewport', x: 0 }),
    (error) => error.code === 'INVALID_SCREENSHOT_ARGUMENTS',
  );
  assert.throws(
    () => captureEngine.validateArguments({ device_mode: 'desktop', viewport_width: 800, viewport_height: 600, orientation: 'portrait' }),
    (error) => error.code === 'INVALID_SCREENSHOT_ARGUMENTS',
  );
  assert.throws(
    () => captureEngine.validateArguments({ include_fsb_overlays: 'yes' }),
    (error) => error.code === 'INVALID_SCREENSHOT_ARGUMENTS',
  );
  assert.throws(
    () => captureEngine.validateArguments({ viewport_width: 17000, viewport_height: 1000 }),
    (error) => error.code === 'SCREENSHOT_TOO_LARGE',
  );
});

test('captures viewport compositor output and restores overlays/debugger', async () => {
  const h = harness();
  const result = await captureEngine.capture({}, 7, h.options);
  assert.equal(result.success, true);
  assert.deepEqual(result.metadata.css_rect, { x: 10, y: 20, width: 800, height: 600 });
  assert.equal(result.metadata.output_width, 800);
  assert.equal(result.metadata.output_height, 600);
  assert.equal(result.metadata.sha256, '0'.repeat(64));
  assert.equal(result.metadata.source_url, 'https://example.test/fixture');
  assert.equal(h.calls.filter((call) => call[0] === 'Page.captureScreenshot').length, 1);
  assert.equal(h.calls.at(-1)[0], 'detach');
  assert.ok(h.calls.some((call) => call[0] === 'script' && call[1] === 'overlayRemoveScript'));
});

test('converts viewport-region coordinates and rejects out-of-bounds regions', async () => {
  const h = harness({ outputWidth: 100, outputHeight: 50 });
  const result = await captureEngine.capture(
    { mode: 'region', coordinate_space: 'viewport', x: 5, y: 6, width: 100, height: 50 },
    7,
    h.options,
  );
  assert.equal(result.success, true);
  assert.deepEqual(result.metadata.css_rect, { x: 15, y: 26, width: 100, height: 50 });

  const rejected = await captureEngine.capture(
    { mode: 'region', x: 750, y: 0, width: 100, height: 50 },
    7,
    harness().options,
  );
  assert.equal(rejected.code, 'SCREENSHOT_REGION_OUT_OF_BOUNDS');

  const pageRegion = await captureEngine.capture(
    { mode: 'region', coordinate_space: 'page', x: 500, y: 700, width: 100, height: 50 },
    7,
    harness({ outputWidth: 100, outputHeight: 50 }).options,
  );
  assert.equal(pageRegion.success, true);
  assert.deepEqual(pageRegion.metadata.css_rect, { x: 500, y: 700, width: 100, height: 50 });
});

test('captures a full page and can explicitly include FSB overlays', async () => {
  const fullHarness = harness();
  const full = await captureEngine.capture({ mode: 'full_page' }, 7, fullHarness.options);
  assert.equal(full.success, true);
  assert.deepEqual(full.metadata.css_rect, { x: 0, y: 0, width: 1200, height: 2000 });
  const fullCapture = fullHarness.calls.find((call) => call[0] === 'Page.captureScreenshot');
  assert.equal(fullCapture[1].captureBeyondViewport, true);

  const overlaysHarness = harness();
  const withOverlays = await captureEngine.capture({ include_fsb_overlays: true }, 7, overlaysHarness.options);
  assert.equal(withOverlays.success, true);
  assert.equal(overlaysHarness.calls.some((call) => call[0] === 'script' && call[1] === 'overlayInstallScript'), false);
  assert.equal(overlaysHarness.calls.some((call) => call[0] === 'script' && call[1] === 'overlayRemoveScript'), false);
});

test('resolves element mode and returns typed missing-target errors', async () => {
  const found = await captureEngine.capture(
    { mode: 'element', selector: 'e4' },
    7,
    harness({ outputWidth: 100, outputHeight: 50 }).options,
  );
  assert.equal(found.success, true);
  assert.deepEqual(found.metadata.css_rect, { x: 40, y: 60, width: 100, height: 50 });

  const missing = await captureEngine.capture(
    { mode: 'element', selector: '#missing' },
    7,
    harness({ elementRect: null }).options,
  );
  assert.equal(missing.code, 'SCREENSHOT_TARGET_NOT_FOUND');
});

test('mobile emulation enables touch and always clears controlled state', async () => {
  const h = harness({ outputWidth: 750, outputHeight: 1334 });
  const result = await captureEngine.capture({
    device_mode: 'mobile',
    viewport_width: 375,
    viewport_height: 667,
    device_scale_factor: 2,
    orientation: 'portrait',
    wait_ms: 0,
  }, 7, h.options);
  assert.equal(result.success, true);
  assert.equal(result.metadata.effective_emulation.touch, true);
  assert.ok(h.calls.some((call) => call[0] === 'Emulation.setDeviceMetricsOverride'));
  assert.ok(h.calls.some((call) => call[0] === 'Emulation.setTouchEmulationEnabled' && call[1].enabled === true));
  assert.ok(h.calls.some((call) => call[0] === 'Emulation.setTouchEmulationEnabled' && call[1].enabled === false));
  assert.ok(h.calls.some((call) => call[0] === 'Emulation.clearDeviceMetricsOverride'));
  assert.equal(h.calls.at(-1)[0], 'detach');
});

test('capture failure still restores emulation, overlay, touch, and attachment', async () => {
  const h = harness({ failMethod: 'Page.captureScreenshot' });
  const result = await captureEngine.capture({
    device_mode: 'mobile', viewport_width: 390, viewport_height: 844,
  }, 7, h.options);
  assert.equal(result.code, 'SCREENSHOT_CAPTURE_FAILED');
  assert.ok(h.calls.some((call) => call[0] === 'Emulation.clearDeviceMetricsOverride'));
  assert.ok(h.calls.some((call) => call[0] === 'script' && call[1] === 'overlayRemoveScript'));
  assert.equal(h.calls.at(-1)[0], 'detach');
});

test('rejects oversized output before capture and never tiles or downscales', async () => {
  const h = harness({
    metrics: {
      cssVisualViewport: { pageX: 0, pageY: 0, clientWidth: 800, clientHeight: 600 },
      cssContentSize: { width: 17000, height: 1000 },
    },
  });
  const result = await captureEngine.capture({ mode: 'full_page' }, 7, h.options);
  assert.equal(result.code, 'SCREENSHOT_TOO_LARGE');
  assert.equal(h.calls.some((call) => call[0] === 'Page.captureScreenshot'), false);
  assert.throws(
    () => captureEngine.assertSize(1, 1, captureEngine.constants.MAX_BYTES + 1),
    (error) => error.code === 'SCREENSHOT_TOO_LARGE',
  );

  const invalidPngDimensions = await captureEngine.capture({}, 7, harness({ outputWidth: 16385 }).options);
  assert.equal(invalidPngDimensions.code, 'SCREENSHOT_TOO_LARGE');
});

test('external debugger contention is retryable and never force-detaches', async () => {
  const h = harness({ attachError: new Error('Another debugger is already attached') });
  const result = await captureEngine.capture({}, 7, h.options);
  assert.equal(result.code, 'SCREENSHOT_DEBUGGER_BUSY');
  assert.equal(result.retryable, true);
  assert.equal(h.calls.some((call) => call[0] === 'detach'), false);
});

test('releases only an idle FSB-owned debugger after acquiring the lease', async () => {
  const h = harness();
  const events = [];
  const result = await captureEngine.capture({}, 7, {
    ...h.options,
    skipLease: false,
    lease: {
      acquire: async (tabId) => {
        events.push(['acquire', tabId]);
        return { release: () => events.push(['release', tabId]) };
      },
    },
    releaseOwnedDebugger: async (tabId) => events.push(['release-owned', tabId]),
  });
  assert.equal(result.success, true);
  assert.deepEqual(events, [['acquire', 7], ['release-owned', 7], ['release', 7]]);
  assert.equal(h.calls[0][0], 'attach');
});

test('per-tab lease is FIFO and independent across tabs', async () => {
  const first = await cdpLease.acquire(901, { timeoutMs: 100 });
  const order = [];
  const secondPromise = cdpLease.acquire(901, { timeoutMs: 100 }).then((lease) => {
    order.push('second');
    lease.release();
  });
  const other = await cdpLease.acquire(902, { timeoutMs: 100 });
  order.push('other');
  other.release();
  first.release();
  await secondPromise;
  assert.deepEqual(order, ['other', 'second']);
});

test('lease timeout returns retryable screenshot busy error', async () => {
  const first = await cdpLease.acquire(903, { timeoutMs: 100 });
  await assert.rejects(
    cdpLease.acquire(903, { timeoutMs: 1 }),
    (error) => error.code === 'SCREENSHOT_DEBUGGER_BUSY' && error.retryable === true,
  );
  first.release();
});
