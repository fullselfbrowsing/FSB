'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const screenshotCapture = require('../extension/utils/screenshot-capture.js');

const WORKSPACE = path.resolve(__dirname, '..');

function chromeCandidates() {
  return [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
}

function findChrome() {
  return chromeCandidates().find((candidate) => {
    try { fs.accessSync(candidate, fs.constants.X_OK); return true; } catch (_error) { return false; }
  }) || null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopChrome(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  let exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, delay(2000)]);
  if (child.exitCode === null && child.signalCode === null) {
    exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGKILL');
    await Promise.race([exited, delay(1000)]);
  }
}

async function waitForDevToolsPort(profile, timeoutMs = 10_000) {
  const activePort = path.join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const [port] = (await fsp.readFile(activePort, 'utf8')).trim().split(/\r?\n/);
      if (/^[0-9]+$/.test(port)) return Number(port);
    } catch (_error) { /* Chrome is still starting */ }
    await delay(50);
  }
  throw new Error('Timed out waiting for Chrome DevToolsActivePort');
}

function startFixtureServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const absolute = path.resolve(WORKSPACE, `.${pathname}`);
      if (absolute !== WORKSPACE && !absolute.startsWith(`${WORKSPACE}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await fsp.readFile(absolute);
      const type = absolute.endsWith('.html') ? 'text/html; charset=utf-8'
        : (absolute.endsWith('.ttf') ? 'font/ttf' : 'application/octet-stream');
      response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      response.end(bytes);
    } catch (_error) {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const listeners = new Map();
  let sequence = 0;

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result || {});
      return;
    }
    if (message.method && listeners.has(message.method)) {
      const waiters = listeners.get(message.method);
      listeners.delete(message.method);
      waiters.forEach((resolve) => resolve(message.params || {}));
    }
  });

  async function send(method, params = {}) {
    await opened;
    const id = ++sequence;
    const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  function once(method, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const waiters = listeners.get(method) || [];
      waiters.push((params) => { clearTimeout(timer); resolve(params); });
      listeners.set(method, waiters);
    });
  }

  return {
    send,
    once,
    close() { try { socket.close(); } catch (_error) { /* best-effort */ } },
  };
}

function decodePng(base64) {
  const png = Buffer.from(base64, 'base64');
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  let width;
  let height;
  let colorType;
  const idat = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'UAT decoder expects 8-bit PNG output');
      colorType = data[9];
      assert.equal(data[12], 0, 'UAT decoder expects non-interlaced PNG output');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }
  const channels = colorType === 6 ? 4 : (colorType === 2 ? 3 : 0);
  assert.ok(channels, `Unsupported Chrome PNG color type ${colorType}`);
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[source++];
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[source++];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const pa = Math.abs(estimate - left);
        const pb = Math.abs(estimate - up);
        const pc = Math.abs(estimate - upLeft);
        value = raw + (pa <= pb && pa <= pc ? left : (pb <= pc ? up : upLeft));
      } else {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }
      pixels[y * stride + x] = value & 0xff;
    }
  }
  return {
    width,
    height,
    pixel(x, y) {
      const index = y * stride + x * channels;
      return [pixels[index], pixels[index + 1], pixels[index + 2]];
    },
  };
}

function assertColor(actual, expected, label, tolerance = 3) {
  assert.ok(actual.every((component, index) => Math.abs(component - expected[index]) <= tolerance),
    `${label}: expected ${expected.join(',')}, received ${actual.join(',')}`);
}

test('real Chromium compositor preserves visual landmarks across UAT capture modes', { timeout: 30_000 }, async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome/Chromium executable not found (set CHROME_PATH to run screenshot UAT)');
    return;
  }

  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'fsb-screenshot-uat-'));
  const server = await startFixtureServer();
  const port = server.address().port;
  const fixtureUrl = `http://127.0.0.1:${port}/tests/fixtures/screenshot-uat.html`;
  const chrome = childProcess.spawn(chromePath, [
    '--headless=new',
    '--disable-gpu-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });
  let client = null;

  try {
    const debuggingPort = await waitForDevToolsPort(profile);
    const targets = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json();
    const page = targets.find((target) => target.type === 'page');
    assert.ok(page && page.webSocketDebuggerUrl, 'Chrome exposed a debuggable page target');
    client = createCdpClient(page.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 900, height: 600, deviceScaleFactor: 1, mobile: false,
      screenWidth: 900, screenHeight: 600,
    });
    const loaded = client.once('Page.loadEventFired');
    await client.send('Page.navigate', { url: fixtureUrl });
    await loaded;
    const ready = await client.send('Runtime.evaluate', {
      expression: `(async () => {
        await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return {
          fixture: document.documentElement.dataset.fixtureReady,
          font: document.fonts.check('700 24px UatSpaceMono'),
          shadow: !!document.querySelector('#shadow-host').shadowRoot,
          canvas: !!document.querySelector('#canvas-landmark').getContext('2d'),
          viewport: [innerWidth, innerHeight, scrollX, scrollY],
          markerRect: (() => {
            const rect = document.querySelector('#responsive-marker').getBoundingClientRect();
            return [rect.x, rect.y, rect.width, rect.height];
          })(),
          markerColor: getComputedStyle(document.querySelector('#responsive-marker')).backgroundColor
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    assert.equal(ready.result.value.fixture, 'true');
    assert.equal(ready.result.value.font, true);
    assert.equal(ready.result.value.shadow, true);
    assert.equal(ready.result.value.canvas, true);
    assert.deepEqual(ready.result.value.viewport, [900, 600, 0, 0]);
    assert.deepEqual(ready.result.value.markerRect, [32, 32, 180, 56]);
    assert.equal(ready.result.value.markerColor, 'rgb(0, 208, 132)');

    const viewportResult = await client.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 900, height: 600, scale: 1 },
    });
    const viewport = decodePng(viewportResult.data);
    assert.deepEqual([viewport.width, viewport.height], [900, 600]);
    assertColor(viewport.pixel(60, 60), [0, 208, 132], 'responsive CSS landmark');
    assertColor(viewport.pixel(80, 200), [255, 92, 92], 'SVG landmark');
    assertColor(viewport.pixel(260, 200), [35, 136, 255], 'canvas landmark');
    assertColor(viewport.pixel(440, 200), [213, 72, 255], 'open shadow DOM landmark');
    assertColor(viewport.pixel(620, 200), [255, 214, 64], 'image landmark');
    assertColor(viewport.pixel(850, 40), [255, 140, 0], 'FSB overlay landmark');

    const regionResult = await client.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: true,
      clip: { x: 220, y: 160, width: 140, height: 100, scale: 1 },
    });
    const region = decodePng(regionResult.data);
    assert.deepEqual([region.width, region.height], [140, 100]);
    assertColor(region.pixel(70, 50), [35, 136, 255], 'region crop landmark');

    const metrics = await client.send('Page.getLayoutMetrics');
    const content = metrics.cssContentSize;
    assert.equal(content.width, 900);
    assert.ok(content.height >= 1800);
    const fullResult = await client.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: content.width, height: content.height, scale: 1 },
    });
    const full = decodePng(fullResult.data);
    assert.deepEqual([full.width, full.height], [content.width, content.height]);
    assertColor(full.pixel(100, 1540), [116, 85, 255], 'full-page bottom landmark');

    await client.send('Runtime.evaluate', {
      expression: `(${screenshotCapture._test.overlayInstallScript.toString()})('uat-hide-overlays')`,
    });
    const hiddenState = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const overlay = document.querySelector('#fsb-overlay-fixture');
        return {
          display: getComputedStyle(overlay).display,
          inlineDisplay: overlay.style.getPropertyValue('display'),
          priority: overlay.style.getPropertyPriority('display')
        };
      })()`,
      returnByValue: true,
    });
    assert.deepEqual(hiddenState.result.value, { display: 'none', inlineDisplay: 'none', priority: 'important' });
    const hiddenResult = await client.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 900, height: 600, scale: 1 },
    });
    assertColor(decodePng(hiddenResult.data).pixel(850, 40), [11, 16, 32], 'hidden-overlay background');

    await client.send('Runtime.evaluate', {
      expression: `(${screenshotCapture._test.overlayRemoveScript.toString()})('uat-hide-overlays')`,
    });
    const restoredState = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const overlay = document.querySelector('#fsb-overlay-fixture');
        return {
          display: getComputedStyle(overlay).display,
          inlineDisplay: overlay.style.getPropertyValue('display'),
          priority: overlay.style.getPropertyPriority('display')
        };
      })()`,
      returnByValue: true,
    });
    assert.deepEqual(restoredState.result.value, { display: 'block', inlineDisplay: 'block', priority: 'important' });
    const restoredResult = await client.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 900, height: 600, scale: 1 },
    });
    assertColor(decodePng(restoredResult.data).pixel(850, 40), [255, 140, 0], 'restored-overlay landmark');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
      screenWidth: 390, screenHeight: 844,
      screenOrientation: { type: 'portraitPrimary', angle: 0 },
    });
    const mobileState = await client.send('Runtime.evaluate', {
      expression: `(async () => {
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return {
          layoutWidth: innerWidth,
          visualWidth: visualViewport.width,
          screenWidth: screen.width,
          mobileMedia: matchMedia('(max-width: 600px)').matches,
          marker: document.querySelector('#responsive-marker').textContent,
          color: getComputedStyle(document.querySelector('#responsive-marker')).backgroundColor
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    assert.ok(mobileState.result.value.layoutWidth >= 390);
    assert.ok(mobileState.result.value.visualWidth >= 390);
    assert.equal(mobileState.result.value.screenWidth, 390);
    assert.equal(mobileState.result.value.mobileMedia, true);
    assert.equal(mobileState.result.value.marker, 'mobile');
    assert.equal(mobileState.result.value.color, 'rgb(255, 77, 109)');
    const mobileResult = await client.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 390, height: 844, scale: 1 },
    });
    const mobile = decodePng(mobileResult.data);
    assert.deepEqual([mobile.width, mobile.height], [390, 844]);
    assertColor(mobile.pixel(60, 60), [255, 77, 109], 'mobile responsive landmark');
  } finally {
    if (client) client.close();
    await stopChrome(chrome);
    await new Promise((resolve) => server.close(resolve));
    await fsp.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
