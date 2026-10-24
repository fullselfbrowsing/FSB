/**
 * capture_screenshot without chrome.debugger (Safari).
 *
 * utils/screenshot-capture.js takes a tabs.captureVisibleTab path when the
 * platform reports caps.cdp === false: viewport is the captured image, region
 * and element are cropped out of it, and anything that needs more than the
 * visible viewport gets one of the typed codes mcp/src/tools/screenshots.ts
 * already maps. Locks:
 *   1. viewport returns the visible-tab PNG untouched, with page-space css_rect,
 *      the measured scale and the visible-viewport warning;
 *   2. FSB's overlays are hidden for the capture and restored after, unless
 *      include_fsb_overlays is true;
 *   3. region and element crops are cut at device pixels;
 *   4. off-screen targets, full_page, device emulation and background tabs are
 *      refused with typed codes before anything is captured;
 *   5. a platform with CDP keeps the debugger path.
 *
 * Run: node tests/safari-screenshot-capture.test.js
 */

'use strict';

const { webcrypto } = require('crypto');
const engine = require('../extension/utils/screenshot-capture.js');

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function passAssertEqual(a, b, msg) { passAssert(a === b, msg + ' (got ' + JSON.stringify(a) + ')'); }

// Just enough PNG for pngDimensions(): signature + IHDR.
function pngBytes(width, height) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
const pngDataUrl = (w, h) => 'data:image/png;base64,' + Buffer.from(pngBytes(w, h)).toString('base64');

function harness(opts = {}) {
  const view = Object.assign({ x: 0, y: 1000, width: 800, height: 600, contentWidth: 800, contentHeight: 4000 }, opts.view);
  const dpr = opts.dpr || 2;
  const calls = { scripts: [], captures: [], crops: [] };
  const chrome = {
    tabs: {
      get: async (id) => ({ id, windowId: 31, active: opts.active !== false, url: 'https://example.com/page' }),
      captureVisibleTab: async (windowId, options) => {
        calls.captures.push({ windowId, options });
        return pngDataUrl(view.width * dpr, view.height * dpr);
      }
    },
    scripting: {
      executeScript: async ({ target, func, args }) => {
        calls.scripts.push({ tabId: target.tabId, name: func.name, args });
        if (func.name === 'viewportScript') return [{ result: view }];
        if (func.name === 'elementRectScript') return [{ result: opts.elementRect === undefined ? null : opts.elementRect }];
        return [{ result: true }];
      }
    }
  };
  const imaging = {
    Blob,
    createImageBitmap: async () => ({ width: view.width * dpr, height: view.height * dpr, close() {} }),
    OffscreenCanvas: class {
      constructor(w, h) { this.w = w; this.h = h; }
      getContext() {
        return { drawImage: (...a) => calls.crops.push({ args: a.slice(1), size: [this.w, this.h] }) };
      }
      async convertToBlob() {
        const out = pngBytes(this.w, this.h);
        return { arrayBuffer: async () => out.buffer };
      }
    }
  };
  return {
    calls,
    options: { platform: { caps: { cdp: false } }, chrome, crypto: webcrypto, imaging },
    names: () => calls.scripts.map((s) => s.name)
  };
}

(async function run() {
  console.log('\n=== 1-2. viewport ===');
  {
    const h = harness();
    const res = await engine.capture({}, 7, h.options);
    passAssert(res.success === true, 'viewport capture succeeds');
    passAssertEqual(h.calls.captures.length, 1, 'one captureVisibleTab call');
    passAssertEqual(h.calls.captures[0].windowId, 31, 'on the tab\'s own window');
    passAssertEqual(h.calls.captures[0].options.format, 'png', 'as PNG');
    passAssertEqual(res.image_data, pngDataUrl(1600, 1200).split(',')[1], 'the visible-tab image is returned untouched');
    passAssertEqual(res.metadata.output_width, 1600, 'output is device pixels wide');
    passAssertEqual(res.metadata.css_rect.y, 1000, 'css_rect is in page space (scrolled viewport)');
    passAssertEqual(res.metadata.effective_emulation.device_scale_factor, 2, 'scale measured from the image');
    passAssert(res.metadata.warnings.some((w) => w.code === 'SCREENSHOT_VISIBLE_VIEWPORT_ONLY'), 'says it is the visible viewport only');
    passAssertEqual(res.metadata.source_url, 'https://example.com/page', 'source_url from the tab');
    passAssert(/^[0-9a-f]{64}$/.test(res.metadata.sha256), 'sha256 recorded');
    const names = h.names();
    passAssertEqual(names.filter((n) => n === 'overlayInstallScript').length, 2, 'overlays hidden before and after the settle wait');
    passAssertEqual(names[names.length - 1], 'overlayRemoveScript', 'and restored last');

    const keep = harness();
    await engine.capture({ include_fsb_overlays: true }, 7, keep.options);
    passAssert(!keep.names().some((n) => /overlay/.test(n)), 'include_fsb_overlays: overlays left alone');
  }

  console.log('\n=== 3. region and element crops ===');
  {
    const h = harness();
    const res = await engine.capture({ mode: 'region', x: 100, y: 50, width: 200, height: 100 }, 7, h.options);
    passAssert(res.success === true, 'viewport-space region succeeds');
    passAssertEqual(JSON.stringify(h.calls.crops[0] && h.calls.crops[0].args.slice(0, 4)), JSON.stringify([200, 100, 400, 200]),
      'cropped at device pixels from the viewport origin');
    passAssertEqual(res.metadata.output_width, 400, 'crop output width');
    passAssertEqual(res.metadata.output_height, 200, 'crop output height');
    passAssert(res.image_data !== pngDataUrl(1600, 1200).split(',')[1], 'the crop, not the whole screen, is returned');

    const e = harness({ elementRect: { x: 40, y: 1100, width: 120, height: 60 } });
    const el = await engine.capture({ mode: 'element', selector: '#card' }, 7, e.options);
    passAssert(el.success === true, 'on-screen element succeeds');
    passAssertEqual(JSON.stringify(e.calls.crops[0] && e.calls.crops[0].args.slice(0, 4)), JSON.stringify([80, 200, 240, 120]),
      'element page rect is shifted by the scroll offset, then scaled');
  }

  console.log('\n=== 4. refused before capture ===');
  {
    const off = harness({ elementRect: { x: 40, y: 1550, width: 120, height: 200 } });
    const res = await engine.capture({ mode: 'element', selector: '#footer' }, 7, off.options);
    passAssertEqual(res.code, 'SCREENSHOT_REGION_OUT_OF_BOUNDS', 'an element running off screen is out of bounds');
    passAssert(/scroll/i.test(res.error), 'and the message says to scroll it into view');
    passAssertEqual(off.calls.captures.length, 0, 'nothing is captured');
    passAssertEqual(off.names()[off.names().length - 1], 'overlayRemoveScript', 'overlays still restored');

    const missing = harness({ elementRect: null });
    const nf = await engine.capture({ mode: 'element', selector: '#nope' }, 7, missing.options);
    passAssertEqual(nf.code, 'SCREENSHOT_TARGET_NOT_FOUND', 'a missing element is not found');

    const full = harness();
    const fp = await engine.capture({ mode: 'full_page' }, 7, full.options);
    passAssertEqual(fp.code, 'INVALID_SCREENSHOT_ARGUMENTS', 'full_page is refused as an argument this browser cannot honour');
    passAssertEqual(full.calls.scripts.length + full.calls.captures.length, 0, 'without touching the page');

    const emu = harness();
    const dm = await engine.capture({ device_mode: 'mobile', viewport_width: 390, viewport_height: 844 }, 7, emu.options);
    passAssertEqual(dm.code, 'INVALID_SCREENSHOT_ARGUMENTS', 'device emulation is refused');

    const hidden = harness({ active: false });
    const bg = await engine.capture({}, 7, hidden.options);
    passAssertEqual(bg.code, 'SCREENSHOT_CAPTURE_FAILED', 'a background tab cannot be captured');
    passAssertEqual(bg.retryable, true, 'retryable: switch_tab then retry');
    passAssert(/switch_tab/.test(bg.error), 'and the message says how');
    passAssertEqual(hidden.calls.scripts.length, 0, 'no script ran in the background tab');
  }

  console.log('\n=== 5. a platform with CDP keeps the debugger path ===');
  {
    const h = harness();
    h.options.platform = { caps: { cdp: true } };
    const res = await engine.capture({}, 7, { platform: h.options.platform, chrome: { tabs: h.options.chrome.tabs } });
    passAssertEqual(res.code, 'SCREENSHOT_CAPTURE_FAILED', 'no debugger API -> the CDP path\'s own error');
    passAssertEqual(h.calls.captures.length, 0, 'captureVisibleTab is not used');
  }

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('TEST HARNESS ERROR:', err);
  process.exit(1);
});
