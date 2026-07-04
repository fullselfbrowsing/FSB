/**
 * Phase 280/281 VIEWPORT regression: dashboard stream stage must hold 16:10
 * on desktop, unset on mobile, fill the viewer surface in Maximized/Fullscreen,
 * and 16:10 in PiP.
 *
 * Run: node tests/dashboard-preview-aspect-ratio.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCSS_PATH = path.join(
  __dirname,
  '..',
  'showcase',
  'angular',
  'src',
  'app',
  'pages',
  'dashboard',
  'dashboard-page.component.scss'
);
const CSS_PATH = path.join(__dirname, '..', 'showcase', 'css', 'dashboard.css');
const ANGULAR_HTML_PATH = path.join(
  __dirname,
  '..',
  'showcase',
  'angular',
  'src',
  'app',
  'pages',
  'dashboard',
  'dashboard-page.component.html'
);
const VANILLA_HTML_PATH = path.join(__dirname, '..', 'showcase', 'dashboard.html');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

const scss = fs.readFileSync(SCSS_PATH, 'utf8');
const css = fs.readFileSync(CSS_PATH, 'utf8');
const angularHtml = fs.readFileSync(ANGULAR_HTML_PATH, 'utf8');
const vanillaHtml = fs.readFileSync(VANILLA_HTML_PATH, 'utf8');

function extractBlock(source, selectorRegex) {
  const match = source.match(selectorRegex);
  if (!match) return null;
  const start = match.index + match[0].length;
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  return depth === 0 ? source.slice(start, i - 1) : null;
}

const desktopStageBlock = extractBlock(scss, /\.dash-preview-stage\s*\{/);
assert(desktopStageBlock !== null, 'desktop .dash-preview-stage block exists');
assert(
  desktopStageBlock && /aspect-ratio:\s*16\s*\/\s*10\b/.test(desktopStageBlock),
  'desktop .dash-preview-stage declares aspect-ratio: 16 / 10'
);
assert(
  desktopStageBlock && /width:\s*100%/.test(desktopStageBlock),
  'desktop .dash-preview-stage keeps width: 100%'
);

const vanillaStageBlock = extractBlock(css, /\.dash-preview-stage\s*\{/);
assert(vanillaStageBlock !== null, 'vanilla .dash-preview-stage block exists');
assert(
  vanillaStageBlock && /aspect-ratio:\s*16\s*\/\s*10\b/.test(vanillaStageBlock),
  'vanilla .dash-preview-stage declares aspect-ratio: 16 / 10'
);

assert(
  /id="dash-preview-stage"[\s\S]*id="dash-preview-iframe"/.test(angularHtml),
  'Angular dashboard nests preview iframe inside dash-preview-stage'
);
assert(
  /id="dash-preview-stage"[\s\S]*id="dash-preview-iframe"/.test(vanillaHtml),
  'vanilla dashboard nests preview iframe inside dash-preview-stage'
);

function collectMediaBlocks(source, maxWidthPx) {
  const re = new RegExp(
    '@media\\s*\\(\\s*max-width:\\s*' + maxWidthPx + 'px\\s*\\)\\s*\\{',
    'g'
  );
  const blocks = [];
  let m;
  while ((m = re.exec(source)) !== null) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }
    if (depth === 0) blocks.push(source.slice(start, i - 1));
  }
  return blocks;
}

function mediaBlockHasPreviewOverride(blockBody) {
  const previewBlockRe = /\.dash-preview-stage\s*\{([^{}]*)\}/g;
  let m;
  while ((m = previewBlockRe.exec(blockBody)) !== null) {
    if (/aspect-ratio:\s*auto/.test(m[1])) return true;
  }
  return false;
}

const mobile768Blocks = collectMediaBlocks(scss, 768);
assert(mobile768Blocks.length > 0, 'at least one @media (max-width: 768px) block exists');
assert(
  mobile768Blocks.some(mediaBlockHasPreviewOverride),
  'mobile <=768px override sets aspect-ratio: auto on .dash-preview-stage'
);

const mobile480Blocks = collectMediaBlocks(scss, 480);
assert(mobile480Blocks.length > 0, 'at least one @media (max-width: 480px) block exists');
assert(
  mobile480Blocks.some(mediaBlockHasPreviewOverride),
  'mobile <=480px override sets aspect-ratio: auto on .dash-preview-stage'
);

const maximizedBlock = extractBlock(scss, /\.dash-preview-maximized\s*\{/);
assert(maximizedBlock !== null, '.dash-preview-maximized block exists');
assert(
  maximizedBlock && /aspect-ratio:\s*auto\s*!important/.test(maximizedBlock),
  'Maximized layout overrides aspect-ratio: auto !important (so 100vh fills the screen)'
);

const maximizedStageBlock = extractBlock(scss, /\.dash-preview-maximized\s+\.dash-preview-stage\s*\{/);
assert(maximizedStageBlock !== null, '.dash-preview-maximized .dash-preview-stage block exists');
assert(
  maximizedStageBlock && /position:\s*absolute/.test(maximizedStageBlock) &&
    /inset:\s*0/.test(maximizedStageBlock) &&
    /width:\s*100%\s*!important/.test(maximizedStageBlock) &&
    /height:\s*100%\s*!important/.test(maximizedStageBlock),
  'Maximized stream stage fills the viewer surface'
);

const fullscreenStageBlock = extractBlock(scss, /\.dash-preview:fullscreen\s+\.dash-preview-stage\s*\{/);
assert(fullscreenStageBlock !== null, '.dash-preview:fullscreen .dash-preview-stage block exists');
assert(
  fullscreenStageBlock && /position:\s*absolute/.test(fullscreenStageBlock) &&
    /inset:\s*0/.test(fullscreenStageBlock) &&
    /width:\s*100%\s*!important/.test(fullscreenStageBlock) &&
    /height:\s*100%\s*!important/.test(fullscreenStageBlock),
  'Fullscreen stream stage fills the actual fullscreen surface'
);

const fullscreenUrlbarBlock = extractBlock(scss, /\.dash-preview:fullscreen\s+\.dash-preview-urlbar\s*\{/);
assert(fullscreenUrlbarBlock !== null, '.dash-preview:fullscreen .dash-preview-urlbar block exists');
assert(
  fullscreenUrlbarBlock && /position:\s*absolute/.test(fullscreenUrlbarBlock) &&
    /z-index:\s*21/.test(fullscreenUrlbarBlock),
  'Fullscreen keeps the existing URL bar as an overlay above the stream stage'
);

const vanillaFullscreenStageBlock = extractBlock(css, /\.dash-preview:fullscreen\s+\.dash-preview-stage\s*\{/);
assert(vanillaFullscreenStageBlock !== null, 'vanilla fullscreen stage block exists');
assert(
  vanillaFullscreenStageBlock && /position:\s*absolute/.test(vanillaFullscreenStageBlock) &&
    /width:\s*100%\s*!important/.test(vanillaFullscreenStageBlock) &&
    /height:\s*100%\s*!important/.test(vanillaFullscreenStageBlock),
  'vanilla fullscreen stream stage fills the viewer surface'
);

const pipStageBlock = extractBlock(scss, /\.dash-preview-pip\s+\.dash-preview-stage\s*\{/);
assert(pipStageBlock !== null, '.dash-preview-pip .dash-preview-stage block exists');
assert(
  pipStageBlock && /aspect-ratio:\s*16\s*\/\s*10\s*!important/.test(pipStageBlock),
  'PiP layout pins stream stage aspect-ratio: 16 / 10 !important'
);

console.log('\nResults:', passed, 'passed,', failed, 'failed');
process.exit(failed > 0 ? 1 : 0);
