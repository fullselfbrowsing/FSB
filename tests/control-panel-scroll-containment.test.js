'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(repoRoot, 'extension', 'ui', 'options.css'), 'utf8');
const html = fs.readFileSync(path.join(repoRoot, 'extension', 'ui', 'control_panel.html'), 'utf8');

function getCssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(escaped + '\\s*\\{([\\s\\S]*?)\\}', 'm'));
  return match ? match[1] : '';
}

console.log('--- Test: control panel scroll containment guard ---');

const htmlRule = getCssRule('html');
assert(/height\s*:\s*100vh\s*;/.test(htmlRule),
  'html is fixed to the viewport height');
assert(/overflow\s*:\s*hidden\s*;/.test(htmlRule),
  'html cannot become a secondary vertical scroller');

const bodyRule = getCssRule('body');
assert(/height\s*:\s*100vh\s*;/.test(bodyRule),
  'body is fixed to the viewport height');
assert(/overflow\s*:\s*hidden\s*;/.test(bodyRule),
  'body cannot become a secondary vertical scroller');

const containerRule = getCssRule('.dashboard-container');
assert(/height\s*:\s*100vh\s*;/.test(containerRule),
  'dashboard container is viewport-bound');
assert(/overflow\s*:\s*hidden\s*;/.test(containerRule),
  'dashboard container clips shell overflow');

const mainRule = getCssRule('.dashboard-main');
assert(/min-height\s*:\s*0\s*;/.test(mainRule),
  'dashboard main can shrink inside the viewport-bound shell');
assert(/overflow\s*:\s*hidden\s*;/.test(mainRule),
  'dashboard main does not become a competing scroller');

const contentRule = getCssRule('.dashboard-content');
assert(/flex\s*:\s*1\s+1\s+auto\s*;/.test(contentRule),
  'dashboard content owns the remaining shell height');
assert(/min-height\s*:\s*0\s*;/.test(contentRule),
  'dashboard content can shrink enough for its own scroller to engage');
assert(/overflow-y\s*:\s*auto\s*;/.test(contentRule),
  'dashboard content remains the vertical scroller');
assert(/overscroll-behavior\s*:\s*contain\s*;/.test(contentRule),
  'dashboard content contains wheel/trackpad scroll chaining at its edges');

assert(/<section[^>]*id=["']branding["'][\s\S]*?▽0\.9\.90[\s\S]*?<\/section>/.test(html),
  'version footer remains present at the end of the control panel content');

console.log('PASS control panel scroll containment guard');
