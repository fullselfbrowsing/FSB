/**
 * Safari toolbar icons: extension/assets/safari-toolbar-<size>.png.
 *
 * Safari tints any toolbar icon it detects as grayscale, keeping only its
 * alpha. FSB's tile (icon*.png) is pure black and white, so the toolbar showed
 * a solid square; a letters-only template came out as tinted lettering. These
 * are the same tile with a faint warm tint on every pixel, so Safari shows them
 * in their own colors. This locks what that depends on:
 *   1. each is a <size>x<size> opaque RGB tile;
 *   2. no pixel is gray -- one would be enough to drift back toward the tint;
 *   3. it is still the FSB tile: dark plate, bright lettering, and at the
 *      hand-drawn 16 and 48 the same brightness as icon16/icon48;
 *   4. transformManifest() points action.default_icon at exactly these files
 *      and leaves the extension icon (`icons`) on the original tile.
 *
 * Regenerate with scripts/generate-safari-toolbar-icons.py.
 *
 * Run: node tests/safari-toolbar-icons.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ASSETS = path.join(__dirname, '..', 'extension', 'assets');
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };   // PNG colour type -> bytes per pixel at 8 bits

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// Minimal reader for non-interlaced 8-bit PNGs (gray, RGB, gray+alpha, RGBA).
function readPng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(file + ' is not a PNG');
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const bpp = CHANNELS[header.colorType];
  const stride = header.width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(header.height * stride);
  for (let y = 0; y < header.height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= bpp ? px[y * stride + x - bpp] : 0;
      const up = y > 0 ? px[(y - 1) * stride + x] : 0;
      const upLeft = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let out;
      if (filter === 0) out = value;
      else if (filter === 1) out = value + left;
      else if (filter === 2) out = value + up;
      else if (filter === 3) out = value + ((left + up) >> 1);
      else {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        out = value + (pa <= pb && pa <= pc ? left : (pb <= pc ? up : upLeft));
      }
      px[y * stride + x] = out & 0xff;
    }
  }
  const rgba = (x, y) => {
    const i = (y * header.width + x) * bpp;
    if (bpp === 1) return [px[i], px[i], px[i], 255];
    if (bpp === 2) return [px[i], px[i], px[i], px[i + 1]];
    if (bpp === 3) return [px[i], px[i + 1], px[i + 2], 255];
    return [px[i], px[i + 1], px[i + 2], px[i + 3]];
  };
  return { header, rgba };
}

const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

(async function run() {
  const { transformManifest, SAFARI_TOOLBAR_ICON_SIZES } = await import('../scripts/build-safari.mjs');

  console.log('\n=== 1-3. each toolbar icon is the tile, in colour ===');
  for (const size of SAFARI_TOOLBAR_ICON_SIZES) {
    const file = path.join(ASSETS, `safari-toolbar-${size}.png`);
    passAssert(fs.existsSync(file), `safari-toolbar-${size}.png exists`);
    if (!fs.existsSync(file)) continue;
    const { header, rgba } = readPng(file);
    passAssert(header.width === size && header.height === size, `${size}: is ${size}x${size}`);
    passAssert(header.colorType === 2 && header.bitDepth === 8 && header.interlace === 0, `${size}: 8-bit RGB, opaque`);

    let gray = 0;
    let maxLuma = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = rgba(x, y);
        if (Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]) < 8) gray++;
        maxLuma = Math.max(maxLuma, luma(p));
      }
    }
    passAssert(gray === 0, `${size}: no gray pixel (${gray} found)`);
    passAssert(luma(rgba(0, 0)) < 30 && luma(rgba(size - 1, size - 1)) < 30, `${size}: dark plate`);
    passAssert(maxLuma > 150, `${size}: bright lettering (max luma ${Math.round(maxLuma)})`);
  }

  console.log('\n=== 3. the hand-drawn sizes keep the artwork ===');
  // The tint lifts black to a warm black (luma ~13), so compare the brightness
  // pattern, not absolute values: a correlation near 1 is the same picture.
  for (const [size, source] of [[16, 'icon16.png'], [48, 'icon48.png']]) {
    const tinted = readPng(path.join(ASSETS, `safari-toolbar-${size}.png`));
    const original = readPng(path.join(ASSETS, source));
    const a = [];
    const b = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) { a.push(luma(tinted.rgba(x, y))); b.push(luma(original.rgba(x, y))); }
    }
    const mean = (v) => v.reduce((s, n) => s + n, 0) / v.length;
    const ma = mean(a);
    const mb = mean(b);
    let cov = 0;
    let va = 0;
    let vb = 0;
    for (let i = 0; i < a.length; i++) {
      cov += (a[i] - ma) * (b[i] - mb);
      va += (a[i] - ma) ** 2;
      vb += (b[i] - mb) ** 2;
    }
    const r = cov / Math.sqrt(va * vb);
    passAssert(r > 0.99, `${size}: same picture as ${source} (correlation ${r.toFixed(4)})`);
  }

  console.log('\n=== 4. the Safari manifest uses them for the toolbar only ===');
  const src = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
  const out = transformManifest(src);
  const expected = Object.fromEntries(SAFARI_TOOLBAR_ICON_SIZES.map((s) => [String(s), `assets/safari-toolbar-${s}.png`]));
  passAssert(JSON.stringify(out.action.default_icon) === JSON.stringify(expected),
    'action.default_icon is the safari-toolbar set');
  passAssert(['16', '19', '32', '38'].every((s) => out.action.default_icon[s]), 'including the 19 and 38 Safari asks for');
  passAssert(JSON.stringify(out.icons) === JSON.stringify(src.icons), 'icons keep the original tile for Safari Settings');
  passAssert(JSON.stringify(src.action.default_icon).indexOf('safari-toolbar') === -1,
    'the Chrome manifest still uses the original tile');

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('TEST HARNESS ERROR:', err);
  process.exit(1);
});
