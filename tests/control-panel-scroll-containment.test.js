'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(repoRoot, 'extension', 'ui', 'options.css'), 'utf8');
const html = fs.readFileSync(path.join(repoRoot, 'extension', 'ui', 'control_panel.html'), 'utf8');
const options = fs.readFileSync(path.join(repoRoot, 'extension', 'ui', 'options.js'), 'utf8');

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

assert(/class="session-item-header memory-item-header"/.test(options),
  'memory rows use a dedicated constrained header class');
assert(/class="memory-item-copy"/.test(options),
  'memory rows expose a shrinkable copy region');
assert(/class="memory-item-title"/.test(options) && /class="memory-item-meta"/.test(options),
  'memory title and metadata have scoped truncation hooks');

const memoryItemRule = getCssRule('.memory-item');
assert(/min-width\s*:\s*0\s*;/.test(memoryItemRule) && /max-width\s*:\s*100%\s*;/.test(memoryItemRule),
  'memory cards cannot exceed their list container');

const memoryHeaderRule = getCssRule('.memory-item-header');
assert(/flex\s*:\s*1\s+1\s+auto\s*;/.test(memoryHeaderRule),
  'memory header is allowed to shrink within the card');
assert(/width\s*:\s*100%\s*;/.test(memoryHeaderRule) && /min-width\s*:\s*0\s*;/.test(memoryHeaderRule),
  'memory header occupies the card without retaining max-content width');

const memoryCopyRule = getCssRule('.memory-item-copy');
assert(/flex\s*:\s*1\s+1\s+auto\s*;/.test(memoryCopyRule) && /min-width\s*:\s*0\s*;/.test(memoryCopyRule),
  'memory copy yields space to the fixed row actions');
assert(/overflow\s*:\s*hidden\s*;/.test(memoryCopyRule),
  'unbroken memory text is contained inside the copy region');

const memoryTextRule = css.match(/\.memory-item-title\s*,\s*\.memory-item-meta\s*\{([\s\S]*?)\}/m)?.[1] || '';
assert(/white-space\s*:\s*nowrap\s*;/.test(memoryTextRule)
  && /overflow\s*:\s*hidden\s*;/.test(memoryTextRule)
  && /text-overflow\s*:\s*ellipsis\s*;/.test(memoryTextRule),
  'memory title and metadata truncate on one line');

const explorerOptionRule = getCssRule('.explorer-option');
assert(/grid-template-columns\s*:\s*max-content\s+7\.5rem\s*;/.test(explorerOptionRule),
  'desktop reconnaissance options reserve stable label and select columns');
assert(/flex\s*:\s*0\s+0\s+auto\s*;/.test(explorerOptionRule),
  'reconnaissance options do not shrink into one another');

const explorerLabelRule = getCssRule('.explorer-option > span');
assert(/white-space\s*:\s*nowrap\s*;/.test(explorerLabelRule),
  'reconnaissance option labels stay on one line');

const explorerSelectRule = getCssRule('.explorer-option .form-select.small');
assert(/width\s*:\s*7\.5rem\s*;/.test(explorerSelectRule)
  && /min-width\s*:\s*7\.5rem\s*;/.test(explorerSelectRule),
  'reconnaissance selects override the shared wide small-select minimum');

const explorerStylesStart = css.indexOf('Site Explorer Styles');
const explorerResponsiveStart = css.indexOf('@media (max-width: 768px)', explorerStylesStart);
const explorerResponsiveEnd = css.indexOf('/* ==========================================', explorerResponsiveStart);
const explorerResponsiveCss = css.slice(explorerResponsiveStart, explorerResponsiveEnd);
assert(explorerStylesStart >= 0 && explorerResponsiveStart > explorerStylesStart
  && explorerResponsiveEnd > explorerResponsiveStart,
  'reconnaissance responsive stylesheet block exists');

const responsiveExplorerRowRule = getCssRule('.explorer-options-row', explorerResponsiveCss);
assert(/flex-direction\s*:\s*column\s*;/.test(responsiveExplorerRowRule)
  && /align-items\s*:\s*stretch\s*;/.test(responsiveExplorerRowRule),
  'narrow reconnaissance options stack as full-width rows');

const responsiveExplorerOptionRule = getCssRule('.explorer-option', explorerResponsiveCss);
assert(/grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s+7\.5rem\s*;/.test(responsiveExplorerOptionRule)
  && /width\s*:\s*100%\s*;/.test(responsiveExplorerOptionRule),
  'narrow reconnaissance labels and selects remain aligned');

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

assert(/<section[^>]*id=["']branding["'][\s\S]*?<span[^>]*class=["'][^"']*fsb-foot-ver[^"']*["'][^>]*>▽<\/span>[\s\S]*?<\/section>/.test(html),
  'version footer placeholder remains present at the end of the control panel content');
assert(/versionLabel\.textContent\s*=\s*`▽\$\{chrome\.runtime\.getManifest\(\)\.version\}`/.test(options),
  'version footer reads the canonical extension manifest version at runtime');

console.log('PASS control panel scroll containment guard');
