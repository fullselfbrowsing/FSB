'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(repoRoot, 'extension', 'ui', 'options.css'), 'utf8');
const js = fs.readFileSync(path.join(repoRoot, 'extension', 'ui', 'options.js'), 'utf8');

function getCssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(escaped + '\\s*\\{([\\s\\S]*?)\\}', 'm'));
  return match ? match[1] : '';
}

console.log('--- Test: settings-card custom select dropdown clipping guard ---');

const cardRule = getCssRule('.settings-card');
assert(/overflow\s*:\s*hidden\s*;/.test(cardRule),
  'settings cards remain clipped by default for rounded-card styling');

const openCardRule = getCssRule('.settings-card.settings-card--select-open');
assert(/overflow\s*:\s*visible\s*;/.test(openCardRule),
  'open settings-card select state allows dropdown overflow');
assert(/position\s*:\s*relative\s*;/.test(openCardRule),
  'open settings-card select state creates a stacking context anchor');
assert(/z-index\s*:\s*(?:[1-9]\d*)\s*;/.test(openCardRule),
  'open settings-card select state is elevated above neighboring cards');

assert(/wrap\.closest\(['"]\.settings-card['"]\)/.test(js),
  'custom select locates the nearest settings card host');
assert(/classList\.toggle\(['"]settings-card--select-open['"],\s*open\)/.test(js),
  'shared helper toggles the open settings-card state');
assert(/function\s+closeFsbSelect\(wrap\)[\s\S]*setFsbSelectCardOpen\(wrap,\s*false\)/.test(js),
  'shared close helper clears the open settings-card state');
assert(/setOpen\(willOpen\)/.test(js),
  'button click path opens and closes through setOpen');
assert(/setOpen\(false\)/.test(js),
  'option pick and keyboard close paths close through setOpen');
assert(/if\s*\(w\s*!==\s*wrap\)\s*closeFsbSelect\(w\)/.test(js),
  'sibling-select close path delegates to the shared close helper');
assert(/if\s*\(!w\.contains\(e\.target\)\)\s*closeFsbSelect\(w\)/.test(js),
  'outside-click close path delegates to the shared close helper');

console.log('PASS settings-card custom select dropdown clipping guard');
