'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(repoRoot, 'extension', 'ui', 'options.css'), 'utf8');
const html = fs.readFileSync(path.join(repoRoot, 'extension', 'ui', 'control_panel.html'), 'utf8');

function getCssRule(selector, source = css) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(escaped + '\\s*\\{([\\s\\S]*?)\\}', 'm'));
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

const printStart = css.indexOf('@media print');
const printEnd = css.indexOf('/* ==========================================', printStart);
const printCss = css.slice(printStart, printEnd);
assert(printStart >= 0 && printEnd > printStart, 'print stylesheet block exists');
assert(/html\s*,\s*body\s*\{[\s\S]*?height\s*:\s*auto\s*;[\s\S]*?overflow\s*:\s*visible\s*;/.test(printCss),
  'print restores document-root height and overflow');

const printContainerRule = getCssRule('.dashboard-container', printCss);
assert(/height\s*:\s*auto\s*;/.test(printContainerRule) && /overflow\s*:\s*visible\s*;/.test(printContainerRule),
  'print lets the dashboard container grow across pages');

const printMainRule = getCssRule('.dashboard-main', printCss);
assert(/display\s*:\s*block\s*;/.test(printMainRule) && /overflow\s*:\s*visible\s*;/.test(printMainRule),
  'print removes the clipped main flex scrollport');

const printContentRule = getCssRule('.dashboard-content', printCss);
assert(/display\s*:\s*block\s*;/.test(printContentRule) && /overflow\s*:\s*visible\s*;/.test(printContentRule),
  'print lets settings content flow beyond one viewport');

assert(/<section[^>]*id=["']branding["'][\s\S]*?▽\d+\.\d+\.\d+[\s\S]*?<\/section>/.test(html),
  'version footer remains present at the end of the control panel content');

console.log('PASS control panel scroll containment guard');
