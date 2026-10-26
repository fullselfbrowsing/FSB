/**
 * Safari toolbar icons: extension/assets/safari-toolbar-<size>.png.
 *
 * Safari decides whether to tint a toolbar icon with -[NSImage
 * safari_isGrayscale] (SafariShared). Calling it on synthetic images gives the
 * rule: a pixel is coloured when its premultiplied channel spread (max minus
 * min of R, G, B) is at least 25/255, and the icon keeps its own colours only
 * when at least 3% of its visible pixels are coloured. Anything else is tinted
 * gray or accent blue, which turned FSB's black-and-white tile into a solid
 * square. On Safari the toolbar shows the same artwork in FSB orange with
 * black lettering instead. This locks what that depends on:
 *   1. each is a <size>x<size> opaque RGB tile with an #ff8c00 plate and black
 *      lettering, coloured by a wide margin at full and at half alpha (the
 *      dimmed toolbar frame);
 *   2. it is still the FSB artwork, at the hand-drawn 16 and 48 included;
 *   3. on macOS, Safari's own classifier agrees, and still calls the original
 *      tile grayscale (so it is the check we think it is);
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
const { spawnSync } = require('child_process');

const ASSETS = path.join(__dirname, '..', 'extension', 'assets');
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };   // PNG colour type -> bytes per pixel at 8 bits
const PLATE = [255, 140, 0];                     // FSB orange, action-icon.js TINTED_PLATE

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

// The share of visible pixels Safari counts as coloured when the icon is drawn
// at `alpha` (0..1). It needs 0.03.
function colouredShare({ header, rgba }, alpha) {
  let visible = 0;
  let coloured = 0;
  for (let y = 0; y < header.height; y++) {
    for (let x = 0; x < header.width; x++) {
      const p = rgba(x, y);
      const a = (p[3] / 255) * alpha;
      if (a <= 0) continue;
      visible++;
      if ((Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2])) * a >= 25) coloured++;
    }
  }
  return visible ? coloured / visible : 0;
}

// Safari's own classifier, through JXA. Reports each file at full alpha and
// drawn at half alpha. Null when it cannot run here (not macOS, or a Safari
// without the method).
const SAFARI_CHECK = `
ObjC.import('AppKit');
function faded(img, fraction) {
  var w = img.size.width, h = img.size.height;
  var rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(null, w, h, 8, 4, true, false, 'NSDeviceRGBColorSpace', 0, 0);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
  img.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, w, h), $.NSMakeRect(0, 0, 0, 0), 2, fraction);
  $.NSGraphicsContext.restoreGraphicsState;
  var out = $.NSImage.alloc.initWithSize($.NSMakeSize(w, h));
  out.addRepresentation(rep);
  return out;
}
function run(argv) {
  ['SafariCore', 'SafariFoundation', 'SafariShared', 'SafariSharedUI'].forEach(function (name) {
    var bundle = $.NSBundle.bundleWithPath('/System/Library/PrivateFrameworks/' + name + '.framework');
    if (bundle && !bundle.isNil()) bundle.load;
  });
  if (!$.NSImage.instancesRespondToSelector($.NSSelectorFromString('safari_isGrayscale'))) return 'null';
  var out = {};
  argv.forEach(function (file) {
    var img = $.NSImage.alloc.initWithContentsOfFile(file);
    out[file] = img.isNil() ? null : { full: img.safari_isGrayscale, half: faded(img, 0.5).safari_isGrayscale };
  });
  return JSON.stringify(out);
}`;

function safariIsGrayscale(files) {
  if (process.platform !== 'darwin') return null;
  const res = spawnSync('osascript', ['-l', 'JavaScript', '-e', SAFARI_CHECK, ...files], { encoding: 'utf8', timeout: 60000 });
  if (res.status !== 0) return null;
  try { return JSON.parse(res.stdout.trim()); } catch (_e) { return null; }
}

(async function run() {
  const { transformManifest, SAFARI_TOOLBAR_ICON_SIZES } = await import('../scripts/build-safari.mjs');
  const files = SAFARI_TOOLBAR_ICON_SIZES.map((size) => path.join(ASSETS, `safari-toolbar-${size}.png`));

  console.log('\n=== 1. each toolbar icon is the orange tile, in colour ===');
  for (const size of SAFARI_TOOLBAR_ICON_SIZES) {
    const file = path.join(ASSETS, `safari-toolbar-${size}.png`);
    passAssert(fs.existsSync(file), `safari-toolbar-${size}.png exists`);
    if (!fs.existsSync(file)) continue;
    const png = readPng(file);
    const { header, rgba } = png;
    passAssert(header.width === size && header.height === size, `${size}: is ${size}x${size}`);
    passAssert(header.colorType === 2 && header.bitDepth === 8 && header.interlace === 0, `${size}: 8-bit RGB, opaque`);

    const corners = [rgba(0, 0), rgba(size - 1, 0), rgba(0, size - 1), rgba(size - 1, size - 1)];
    passAssert(corners.every((p) => p[0] === PLATE[0] && p[1] === PLATE[1] && p[2] === PLATE[2]), `${size}: #ff8c00 plate`);
    let minLuma = 255;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) minLuma = Math.min(minLuma, luma(rgba(x, y)));
    passAssert(minLuma < 40, `${size}: black lettering (min luma ${Math.round(minLuma)})`);

    const full = colouredShare(png, 1);
    const half = colouredShare(png, 0.5);
    passAssert(full >= 0.5, `${size}: ${(full * 100).toFixed(1)}% of pixels coloured (Safari needs 3%)`);
    passAssert(half >= 0.5, `${size}: ${(half * 100).toFixed(1)}% still coloured at half alpha, the dimmed frame`);
  }

  console.log('\n=== 2. it is still the FSB artwork ===');
  // The tile is lerp(orange, black, v), so 255 - R recovers the artwork's own
  // brightness v: a correlation near 1 is the same picture.
  for (const [size, source] of [[16, 'icon16.png'], [48, 'icon48.png']]) {
    const tile = readPng(path.join(ASSETS, `safari-toolbar-${size}.png`));
    const original = readPng(path.join(ASSETS, source));
    const a = [];
    const b = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) { a.push(255 - tile.rgba(x, y)[0]); b.push(luma(original.rgba(x, y))); }
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

  console.log('\n=== 3. Safari\'s own classifier agrees ===');
  const originals = ['icon16.png', 'icon48.png', 'icon128.png'].map((f) => path.join(ASSETS, f));
  const verdicts = safariIsGrayscale(files.concat(originals));
  if (!verdicts) {
    console.log('  SKIP: -[NSImage safari_isGrayscale] is not available here (needs macOS with Safari)');
  } else {
    for (const file of files) {
      const v = verdicts[file];
      passAssert(!!v && v.full === false && v.half === false,
        `${path.basename(file)}: Safari keeps its colours, at half alpha too`);
    }
    for (const file of originals) {
      const v = verdicts[file];
      passAssert(!!v && v.full === true, `${path.basename(file)}: Safari still calls the original tile grayscale`);
    }
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
