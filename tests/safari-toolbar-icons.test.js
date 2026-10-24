/**
 * Safari toolbar icons: extension/assets/safari-toolbar-<size>.png.
 *
 * Safari treats a grayscale toolbar icon as a template: it keeps only the
 * alpha channel and tints it. The opaque icon*.png tiles showed as a solid
 * blue square, so the Safari manifest points the toolbar at these instead.
 * This locks what makes them work as templates:
 *   1. each is <size>x<size>, 8-bit gray+alpha (PNG colour type 4);
 *   2. every gray value is 0 (black), so no pixel can read as colour;
 *   3. the corners are transparent and the lettering is opaque somewhere;
 *   4. transformManifest() points action.default_icon at exactly these files,
 *      and leaves the extension icon (`icons`) on the tile.
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

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// Minimal PNG reader for non-interlaced 8-bit gray+alpha images.
function readGrayAlpha(file) {
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
      header = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        bitDepth: data[8], colorType: data[9], interlace: data[12]
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const bpp = 2;
  const stride = header.width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(header.height * stride);
  for (let y = 0; y < header.height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= bpp && y > 0 ? pixels[(y - 1) * stride + x - bpp] : 0;
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
      pixels[y * stride + x] = out & 0xff;
    }
  }
  return { header, pixels };
}

(async function run() {
  const { transformManifest, SAFARI_TOOLBAR_ICON_SIZES } = await import('../scripts/build-safari.mjs');

  console.log('\n=== 1-3. each toolbar icon is a valid template ===');
  for (const size of SAFARI_TOOLBAR_ICON_SIZES) {
    const file = path.join(ASSETS, `safari-toolbar-${size}.png`);
    passAssert(fs.existsSync(file), `safari-toolbar-${size}.png exists`);
    if (!fs.existsSync(file)) continue;
    const { header, pixels } = readGrayAlpha(file);
    passAssert(header.width === size && header.height === size, `${size}: is ${size}x${size}`);
    passAssert(header.colorType === 4 && header.bitDepth === 8 && header.interlace === 0,
      `${size}: 8-bit gray+alpha, not interlaced`);
    let nonBlack = 0;
    let opaque = 0;
    for (let i = 0; i < pixels.length; i += 2) {
      if (pixels[i] !== 0) nonBlack++;
      if (pixels[i + 1] === 255) opaque++;
    }
    passAssert(nonBlack === 0, `${size}: every gray value is black`);
    const alphaAt = (x, y) => pixels[(y * size + x) * 2 + 1];
    passAssert([alphaAt(0, 0), alphaAt(size - 1, 0), alphaAt(0, size - 1), alphaAt(size - 1, size - 1)]
      .every((a) => a === 0), `${size}: the corners are transparent`);
    passAssert(opaque > size, `${size}: the lettering is opaque (${opaque} px)`);
  }

  console.log('\n=== 4. the Safari manifest uses them for the toolbar only ===');
  const src = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
  const out = transformManifest(src);
  const expected = Object.fromEntries(SAFARI_TOOLBAR_ICON_SIZES.map((s) => [String(s), `assets/safari-toolbar-${s}.png`]));
  passAssert(JSON.stringify(out.action.default_icon) === JSON.stringify(expected),
    'action.default_icon is the safari-toolbar set');
  passAssert(JSON.stringify(out.icons) === JSON.stringify(src.icons), 'icons keep the tile for Safari Settings');
  passAssert(JSON.stringify(src.action.default_icon).indexOf('safari-toolbar') === -1,
    'the Chrome manifest still uses the tile');

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('TEST HARNESS ERROR:', err);
  process.exit(1);
});
