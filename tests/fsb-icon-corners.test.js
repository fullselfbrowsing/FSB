/**
 * FSB icon corner parity.
 *
 * The toolbar icon is a black tile with rounded corners: a radius of 30/128 of its side, the
 * same rounding the showcase draws its icon tiles with. Several places have to agree on that
 * shape, and nothing else would notice if one of them drifted:
 *
 *   1. The icon PNGs carry the corners in their alpha. Each must equal what
 *      scripts/build-icon-corners.mjs makes of it, so a re-exported square icon fails here.
 *      They are compared chunk for chunk with the pixel rows inflated (samePng), not byte for
 *      byte: Node 20, which CI runs, compresses the same rows to different bytes than Node 24.
 *      Fix: node scripts/build-icon-corners.mjs
 *   2. The cut corners must hold only black. The toolbar animation rebuilds the uncut tile by
 *      painting black under the artwork, which is only lossless if the corners were black.
 *   3. The copies (onboarding page, site favicon, site icon) must be byte-identical to the
 *      extension's files. The same script rewrites them.
 *   4. extension/utils/action-icon.js draws every animated frame over these files and cuts it
 *      with their alpha, so its CORNER_RATIO must equal the script's radius, and the cut must
 *      still be there.
 *   5. Places that round the icon in CSS, or draw it as a tile on the showcase, must stay at
 *      about the same share (22-25% of their size), so the icon reads as one shape everywhere.
 *   6. The manifest must still point at the files that carry the corners.
 *   7. The light pair (icon16_light, icon128_light), which the toolbar icon draws when FSB's
 *      theme is set to Light, must be its source inverted: the same alpha, so the same rounded
 *      edge, and luminance 255 - source at every pixel, which leaves the cut corners white for
 *      the animation's white plate to rebuild. action-icon.js must draw from exactly that pair.
 *      Fix: node scripts/build-icon-corners.mjs
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const bytes = (relative) => fs.readFileSync(path.join(ROOT, relative));

const BAND = [0.22, 0.25];

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

const inBand = (ratio) => ratio >= BAND[0] - 1e-9 && ratio <= BAND[1] + 1e-9;
const px = (style, prop) => {
  const hit = new RegExp(`(?:^|[;{\\s])${prop}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(style);
  return hit ? Number(hit[1]) : null;
};
const ruleBody = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hit = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  return hit ? hit[1] : null;
};

async function main() {
  const corners = await import(pathToFileURL(path.join(ROOT, 'scripts/build-icon-corners.mjs')).href);
  const fix = 'run node scripts/build-icon-corners.mjs';

  console.log('\n1-2. The icon files carry the corners, over black');
  for (const source of corners.SOURCES) {
    const committed = bytes(source);
    let image = null;
    try { image = corners.decodePng(committed); } catch (e) { check(`${source} decodes`, false, e.message); continue; }
    check(`${source} is cut with the script's corners`, corners.samePng(committed, corners.cutCorners(committed)), fix);
    check(`${source} has transparent corners`, image.rgba[3] === 0 && image.rgba[image.rgba.length - 1] === 0,
      `corner alpha ${image.rgba[3]}; ${fix}`);
    const ink = corners.cornerInk(committed);
    check(`${source}: only black under the cut corners`, ink <= corners.MAX_CORNER_LUMA,
      `brightness ${ink}; the corners would lose artwork, so the design has to leave them black`);
  }

  console.log('\n3. Copies match the extension files');
  for (const [copy, source] of Object.entries(corners.COPIES)) {
    check(`${copy} is byte-identical to ${source}`, Buffer.compare(bytes(copy), bytes(source)) === 0, fix);
  }

  console.log('\n4. The toolbar animation uses the same corners');
  const icon = read('extension/utils/action-icon.js');
  const ratio = /var CORNER_RATIO = (\d+) \/ 128;/.exec(icon);
  check('action-icon.js declares CORNER_RATIO as n / 128', !!ratio, 'missing var CORNER_RATIO = n / 128;');
  check('CORNER_RATIO equals the radius the PNGs are cut with', !!ratio && Number(ratio[1]) === corners.RADIUS_128,
    `${ratio && ratio[1]} / 128 in action-icon.js vs ${corners.RADIUS_128} / 128 in scripts/build-icon-corners.mjs`);
  check('renderFrame cuts every undimmed frame with the artwork\'s alpha',
    /if \(spec\.dimmed !== true\) \{[\s\S]{0,200}?globalCompositeOperation = 'destination-in';\s*ctx\.drawImage\(bitmaps\[size\]/.test(icon),
    'the destination-in corner cut is missing from renderFrame');
  check('the animated frames are drawn from the files that carry the corners',
    icon.includes("GLYPH_PATHS = { 16: 'assets/icon16.png', 32: 'assets/icon128.png' }"), 'GLYPH_PATHS changed');

  console.log('\n5. Rounded copies keep the same share');
  const overlay = read('extension/content/visual-feedback.js');
  const onboardingCss = read('extension/ui/onboarding.css');
  const onboardingJs = read('extension/ui/onboarding.js');
  const microphone = read('extension/ui/microphone-permission.html');
  const crawl = ruleBody(overlay, '.fsb-crawl-logo');
  const tbImg = ruleBody(onboardingCss, '.ob3-tb-fsb img');
  const tbSize = /class="ob3-tb-fsb[^"]*"[^>]*>\s*<img[^>]*\bwidth="(\d+)"/.exec(onboardingJs);
  const pin = ruleBody(onboardingCss, '.ob-pin-row .pi');
  const mic = ruleBody(microphone, '.brand img');
  const cssCopies = [
    ['crawl overlay .fsb-crawl-logo', crawl && px(crawl, 'border-radius'), crawl && px(crawl, 'width')],
    ['onboarding toolbar .ob3-tb-fsb img', tbImg && px(tbImg, 'border-radius'), tbSize && Number(tbSize[1])],
    ['onboarding pin menu .ob-pin-row .pi', pin && px(pin, 'border-radius'), pin && px(pin, 'width')],
    ['microphone page .brand img', mic && px(mic, 'border-radius'), mic && px(mic, 'width')],
  ];
  for (const [label, radius, size] of cssCopies) {
    check(`${label}: ${radius}/${size}`, radius !== null && size && inBand(radius / size),
      `radius/size ${radius}/${size} is outside ${BAND.join('-')}; match the icon's 30/128`);
  }

  // Showcase release notes: a square inline-styled box that is a black tile, or that holds
  // the wordmark directly, draws the icon.
  const notesFile = 'showcase/angular/src/app/pages/release-notes/release-notes-page.component.html';
  const notes = read(notesFile);
  const tileRe = /<(span|div)\b[^>]*?style="([^"]*)"[^>]*>/g;
  const holdsMark = /^\s*(<(span|div)\b[^>]*>\s*)?<span\b[^>]*class="fsb-row"/;
  const tiles = [];
  for (let m; (m = tileRe.exec(notes));) {
    const style = m[2];
    const w = px(style, 'width');
    const h = px(style, 'height');
    if (w === null || w !== h || w < 24) continue;
    const black = /background:\s*#000000/.test(style);
    if (!black && !holdsMark.test(notes.slice(m.index + m[0].length, m.index + m[0].length + 400))) continue;
    tiles.push({ line: notes.slice(0, m.index).split('\n').length, size: w, radius: px(style, 'border-radius') });
  }
  check('release notes: icon tiles found', tiles.length >= 6, `${tiles.length} found; the scan no longer recognises them`);
  for (const t of tiles) {
    check(`release notes line ${t.line}: ${t.size}px tile at ${t.radius}px`, t.radius !== null && inBand(t.radius / t.size),
      `radius/size ${t.radius}/${t.size} is outside ${BAND.join('-')}; match the icon's 30/128`);
  }
  const toolbarTiles = tiles.filter((t) => t.size === 128);
  check('release notes 0.9.91: the four toolbar icon tiles use the icon\'s own 30px',
    toolbarTiles.length === 4 && toolbarTiles.every((t) => t.radius === corners.RADIUS_128),
    toolbarTiles.map((t) => `${t.size}px@${t.radius}`).join(', ') || 'none found');
  check('release notes 0.9.91: the reading tile\'s inset plate follows the same curve (30 - 5)',
    notes.includes('position: absolute; inset: 5px; border-radius: 25px; background: #000000;'),
    'the inner plate of the reading tile lost its 25px radius');

  console.log('\n6. The manifest points at the cut files');
  const manifest = JSON.parse(read('extension/manifest.json'));
  const expected = { 16: 'assets/icon16.png', 48: 'assets/icon48.png', 128: 'assets/icon128.png' };
  for (const [label, set] of [['icons', manifest.icons], ['action.default_icon', manifest.action && manifest.action.default_icon]]) {
    check(`manifest ${label}`, JSON.stringify(set) === JSON.stringify(expected), JSON.stringify(set));
  }

  console.log('\n7. The light pair is its source inverted');
  for (const [light, source] of Object.entries(corners.LIGHT)) {
    if (!fs.existsSync(path.join(ROOT, light))) { check(`${light} exists`, false, fix); continue; }
    const a = corners.decodePng(bytes(source));
    const b = corners.decodePng(bytes(light));
    check(`${light} is ${a.width}x${a.height}, like ${source}`, a.width === b.width && a.height === b.height,
      `${b.width}x${b.height}; ${fix}`);
    if (a.width !== b.width || a.height !== b.height) continue;
    let alphaOff = 0;
    let lumaOff = 0;
    for (let i = 0; i < a.rgba.length; i += 4) {
      if (a.rgba[i + 3] !== b.rgba[i + 3]) alphaOff++;
      for (let c = 0; c < 3; c++) if (b.rgba[i + c] !== 255 - a.rgba[i + c]) { lumaOff++; break; }
    }
    check(`${light}: same alpha as ${source}, so the same rounded edge`, alphaOff === 0, `${alphaOff} pixels differ; ${fix}`);
    check(`${light}: luminance is 255 - ${source} at every pixel`, lumaOff === 0, `${lumaOff} pixels differ; ${fix}`);
    // cornerInk reports the brightest corner pixel, so ask it about the inverse.
    const darkest = 255 - corners.cornerInk(corners.invertLuma(bytes(light)));
    check(`${light}: only white under the cut corners`, darkest >= 255 - corners.MAX_CORNER_LUMA,
      `darkest corner pixel ${darkest}; the white plate could not rebuild the tile`);
  }
  const lightPaths = /var LIGHT_GLYPH_PATHS = \{ 16: '([^']+)', 32: '([^']+)' \};/.exec(icon);
  const lightFiles = Object.keys(corners.LIGHT).map((file) => file.replace(/^extension\//, ''));
  check('the light tile is drawn from exactly the light pair',
    !!lightPaths && lightPaths[1] === lightFiles[0] && lightPaths[2] === lightFiles[1],
    `LIGHT_GLYPH_PATHS is ${lightPaths ? lightPaths.slice(1).join(', ') : 'missing'}; expected ${lightFiles.join(', ')}`);

  console.log(`\nfsb-icon-corners: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
