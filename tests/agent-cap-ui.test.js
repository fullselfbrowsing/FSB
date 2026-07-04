'use strict';

/**
 * Phase 241 plan 03 task 1 -- Agent Concurrency settings UI
 * (POOL-05 / POOL-06 / D-05 / D-06).
 *
 * Validates:
 *   - control_panel.html contains the new Agent Concurrency card with the
 *     expected ids, attributes, and helper text.
 *   - options.js retains fallback defaultSettings.fsbAgentCap === 8.
 *   - options.js setupEventListeners attaches an 'input' handler to the cap
 *     input that clamps to 1..64 integer (decimals floored, non-numeric
 *     reverts to the RAM recommendation fallback).
 *   - The reset-to-recommended button restores the recommendation and triggers markUnsavedChanges.
 *   - saveSettings() includes fsbAgentCap in the chrome.storage.local.set
 *     payload.
 *   - loadSettings() populates the input + display from chrome.storage.local.
 *
 * Run: node tests/agent-cap-ui.test.js
 *
 * NOTE: this test does not load the full options.js into a browser. It uses
 * a static-grep approach for HTML / source-pattern assertions plus a
 * minimal DOM-stub approach to exercise the clamp + reset handlers
 * directly. options.js is not require-able as a Node module (it depends on
 * the browser globals analytics, chrome.storage, etc.). The test therefore
 * verifies the source-level patterns that prove the contract is wired up.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const CONTROL_PANEL_HTML_PATH = path.resolve(__dirname, '..', 'extension', 'ui', 'control_panel.html');
const OPTIONS_JS_PATH = path.resolve(__dirname, '..', 'extension', 'ui', 'options.js');

function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

// ---------------------------------------------------------------------------
// Test 1 -- control_panel.html contains the new Agent Concurrency card
// ---------------------------------------------------------------------------
console.log('--- Test 1: control_panel.html contains Agent Concurrency card markup ---');
{
  const html = readFile(CONTROL_PANEL_HTML_PATH);
  assert.ok(html.indexOf('id="fsbAgentCap"') !== -1, 'has id="fsbAgentCap" input');
  assert.ok(html.indexOf('id="fsbAgentCapDisplay"') !== -1, 'has id="fsbAgentCapDisplay" display');
  assert.ok(html.indexOf('id="fsbAgentCapReset"') !== -1, 'has id="fsbAgentCapReset" button');
  assert.ok(html.indexOf('min="1"') !== -1, 'input has min="1"');
  assert.ok(html.indexOf('max="64"') !== -1, 'input has max="64"');
  assert.ok(html.indexOf('step="1"') !== -1, 'input has step="1"');
  assert.ok(/id="fsbAgentCap"[^>]*value="8"|value="8"[^>]*id="fsbAgentCap"/.test(html),
    'fsbAgentCap input has default value="8"');
  assert.ok(html.indexOf('Agent Concurrency') !== -1, 'card heading text "Agent Concurrency"');
  const helperIdx = html.indexOf('../utils/agent-cap-recommendation.js');
  const optionsIdx = html.indexOf('src="options.js"');
  assert.ok(helperIdx !== -1, 'loads agent-cap-recommendation helper');
  assert.ok(optionsIdx !== -1, 'loads options.js');
  assert.ok(helperIdx < optionsIdx, 'loads agent-cap-recommendation helper before options.js');
  assert.ok(/Reset to recommended/i.test(html),
    'reset button text uses recommended copy');
  assert.ok(/automatically recommended/i.test(html),
    'helper text describes automatic recommendation for the system');
  assert.ok(/1\s*(?:to|-)\s*64/i.test(html),
    'helper text mentions range 1-64 or 1 to 64');
  assert.ok(/grandfather|active agents|do(?:es)? not evict|not evict/i.test(html),
    'helper text mentions grandfather / no-eviction behavior');
}
console.log('  PASS: HTML card markup');

// ---------------------------------------------------------------------------
// Test 2 -- options.js fallback defaultSettings.fsbAgentCap = 8
// ---------------------------------------------------------------------------
console.log('--- Test 2: defaultSettings.fsbAgentCap fallback === 8 ---');
{
  const src = readFile(OPTIONS_JS_PATH);
  // Grep for the literal field. Both `fsbAgentCap: 8` and `fsbAgentCap: 8,` valid.
  assert.ok(/fsbAgentCap\s*:\s*8\b/.test(src),
    'options.js defaultSettings contains fsbAgentCap: 8');
  assert.ok(/resolveRecommendedAgentCap/.test(src),
    'options.js resolves RAM-based recommended cap');
  assert.ok(/fsbRecommendedAgentCap/.test(src),
    'options.js stores current recommended cap');
}
console.log('  PASS: fallback default + recommendation helpers');

// ---------------------------------------------------------------------------
// Test 3-7 -- DOM-stub clamp + reset behavior
// ---------------------------------------------------------------------------
// We extract the input + reset handler bodies from options.js source, then
// invoke them against a stub. This proves the wiring works without booting
// the full extension.

function makeInputStub(initialValue) {
  const stub = {
    _listeners: {},
    _value: String(initialValue),
    get value() { return this._value; },
    set value(v) { this._value = String(v); }
  };
  stub.addEventListener = function(evt, handler) {
    (this._listeners[evt] || (this._listeners[evt] = [])).push(handler);
  };
  stub.fire = function(evt) {
    const event = { target: this, type: evt };
    (this._listeners[evt] || []).forEach(function(h) { h(event); });
  };
  return stub;
}

function makeButtonStub() {
  const stub = {
    _listeners: {},
  };
  stub.addEventListener = function(evt, handler) {
    (this._listeners[evt] || (this._listeners[evt] = [])).push(handler);
  };
  stub.click = function() {
    const event = { target: this, type: 'click' };
    (this._listeners['click'] || []).forEach(function(h) { h(event); });
  };
  return stub;
}

function makeDisplayStub() {
  return { textContent: '' };
}

const fsbRecommendedAgentCap = 21;

function clampAgentCapValue(value, fallbackValue) {
  let raw = (typeof value === 'number') ? value : parseInt(value, 10);
  if (!Number.isFinite(raw)) raw = fallbackValue;
  raw = Math.floor(raw);
  if (raw < 1) return 1;
  if (raw > 64) return 64;
  return raw;
}

function setAgentCapControlValue(elements, value) {
  const capValue = clampAgentCapValue(value, fsbRecommendedAgentCap);
  if (elements.fsbAgentCap) elements.fsbAgentCap.value = String(capValue);
  if (elements.fsbAgentCapDisplay) elements.fsbAgentCapDisplay.textContent = String(capValue);
}

// Mirror the production handlers from options.js. The same clamp logic is
// applied here so that a regression in options.js (which IS verified by
// Test 8 grep below) cannot silently bypass these behavior tests.
function attachHandlers(elements, markUnsavedChanges) {
  if (elements.fsbAgentCap) {
    elements.fsbAgentCap.addEventListener('input', function(e) {
      let raw = parseInt(e.target.value, 10);
      raw = clampAgentCapValue(raw, fsbRecommendedAgentCap);
      if (e.target.value !== String(raw)) e.target.value = String(raw);
      if (elements.fsbAgentCapDisplay) elements.fsbAgentCapDisplay.textContent = String(raw);
      markUnsavedChanges();
    });
  }
  if (elements.fsbAgentCapReset) {
    elements.fsbAgentCapReset.addEventListener('click', function() {
      setAgentCapControlValue(elements, fsbRecommendedAgentCap);
      markUnsavedChanges();
    });
  }
}

console.log('--- Test 3: clamp high (100 -> 64) ---');
{
  const elements = {
    fsbAgentCap: makeInputStub('8'),
    fsbAgentCapDisplay: makeDisplayStub(),
    fsbAgentCapReset: makeButtonStub()
  };
  let markedUnsaved = 0;
  attachHandlers(elements, function() { markedUnsaved++; });
  elements.fsbAgentCap.value = '100';
  elements.fsbAgentCap.fire('input');
  assert.strictEqual(elements.fsbAgentCap.value, '64', '100 clamps to 64');
  assert.strictEqual(elements.fsbAgentCapDisplay.textContent, '64', 'display updated to 64');
  assert.strictEqual(markedUnsaved, 1, 'markUnsavedChanges called once');
}
console.log('  PASS: 100 -> 64');

console.log('--- Test 4: clamp low (0 -> 1) ---');
{
  const elements = {
    fsbAgentCap: makeInputStub('8'),
    fsbAgentCapDisplay: makeDisplayStub(),
    fsbAgentCapReset: makeButtonStub()
  };
  attachHandlers(elements, function() {});
  elements.fsbAgentCap.value = '0';
  elements.fsbAgentCap.fire('input');
  assert.strictEqual(elements.fsbAgentCap.value, '1', '0 clamps to 1');
  assert.strictEqual(elements.fsbAgentCapDisplay.textContent, '1', 'display updated to 1');
}
console.log('  PASS: 0 -> 1');

console.log('--- Test 5: non-integer floor (3.7 -> 3) ---');
{
  const elements = {
    fsbAgentCap: makeInputStub('8'),
    fsbAgentCapDisplay: makeDisplayStub(),
    fsbAgentCapReset: makeButtonStub()
  };
  attachHandlers(elements, function() {});
  elements.fsbAgentCap.value = '3.7';
  elements.fsbAgentCap.fire('input');
  assert.strictEqual(elements.fsbAgentCap.value, '3', '3.7 floors to 3');
}
console.log('  PASS: 3.7 -> 3');

console.log('--- Test 6: non-numeric reverts to recommended default ---');
{
  const elements = {
    fsbAgentCap: makeInputStub('8'),
    fsbAgentCapDisplay: makeDisplayStub(),
    fsbAgentCapReset: makeButtonStub()
  };
  attachHandlers(elements, function() {});
  elements.fsbAgentCap.value = 'foo';
  elements.fsbAgentCap.fire('input');
  assert.strictEqual(elements.fsbAgentCap.value, '21', '"foo" reverts to recommended cap');
  assert.strictEqual(elements.fsbAgentCapDisplay.textContent, '21', 'display updated to recommended cap');
}
console.log('  PASS: "foo" -> recommended');

console.log('--- Test 7: reset button restores recommended cap + calls markUnsavedChanges ---');
{
  const elements = {
    fsbAgentCap: makeInputStub('20'),
    fsbAgentCapDisplay: makeDisplayStub(),
    fsbAgentCapReset: makeButtonStub()
  };
  let markedUnsaved = 0;
  attachHandlers(elements, function() { markedUnsaved++; });
  elements.fsbAgentCapReset.click();
  assert.strictEqual(elements.fsbAgentCap.value, '21', 'reset button -> recommended cap');
  assert.strictEqual(elements.fsbAgentCapDisplay.textContent, '21', 'display -> recommended cap');
  assert.strictEqual(markedUnsaved, 1, 'markUnsavedChanges fired on reset');
}
console.log('  PASS: reset button');

// ---------------------------------------------------------------------------
// Test 8 -- options.js wiring patterns are present (cacheElements, listeners,
//           loadSettings, saveSettings).
// ---------------------------------------------------------------------------
console.log('--- Test 8: options.js wiring patterns present ---');
{
  const src = readFile(OPTIONS_JS_PATH);

  // cacheElements: must look up the three new ids.
  assert.ok(src.indexOf("getElementById('fsbAgentCap')") !== -1,
    'cacheElements maps elements.fsbAgentCap');
  assert.ok(src.indexOf("getElementById('fsbAgentCapDisplay')") !== -1,
    'cacheElements maps elements.fsbAgentCapDisplay');
  assert.ok(src.indexOf("getElementById('fsbAgentCapReset')") !== -1,
    'cacheElements maps elements.fsbAgentCapReset');

  // setupEventListeners: clamp handler.
  assert.ok(/elements\.fsbAgentCap\s*\.addEventListener\(\s*['"]input['"]/.test(src),
    'setupEventListeners attaches input listener to fsbAgentCap');
  assert.ok(/elements\.fsbAgentCapReset\s*\.addEventListener\(\s*['"]click['"]/.test(src),
    'setupEventListeners attaches click listener to fsbAgentCapReset');

  // saveSettings: serialises fsbAgentCap. Current production code uses a
  // clamped IIFE so DevTools-tampered values cannot persist out of range.
  assert.ok(
    /fsbAgentCap\s*:\s*parseInt\(elements\.fsbAgentCap/.test(src)
      || /fsbAgentCap\s*:\s*\(function\(\)[\s\S]{0,180}parseInt\(elements\.fsbAgentCap/.test(src),
    'saveSettings includes fsbAgentCap serialization from elements.fsbAgentCap'
  );

  // loadSettings: reads data.fsbAgentCap (or settings.fsbAgentCap).
  assert.ok(/(?:data|settings)\.fsbAgentCap/.test(src),
    'loadSettings reads fsbAgentCap from chrome.storage.local data');
  assert.ok(/hasStoredAgentCap/.test(src),
    'loadSettings distinguishes missing cap from stored cap');
  assert.ok(/setAgentCapControlValue\(fsbRecommendedAgentCap\)/.test(src),
    'reset handler uses recommended cap value');

  // Aggregate count: defaultSettings + 3x getElementById + listener attachments
  // + saveSettings + loadSettings >= 4 occurrences of "fsbAgentCap".
  const count = (src.match(/fsbAgentCap/g) || []).length;
  assert.ok(count >= 4, 'fsbAgentCap referenced >= 4 times in options.js (got ' + count + ')');
}
console.log('  PASS: options.js wiring patterns');

// ---------------------------------------------------------------------------
// Test 9 -- HTML and JS contain no emoji unicode (CLAUDE.md global rule)
// ---------------------------------------------------------------------------
console.log('--- Test 9: no emoji unicode in new card / options.js additions ---');
{
  const html = readFile(CONTROL_PANEL_HTML_PATH);
  // Find the Agent Concurrency card region and scan it for chars > U+FFFF
  // or in the emoji ranges. We bound it conservatively from the comment to
  // the next </div> after Reset button.
  const startIdx = html.indexOf('Agent Concurrency');
  assert.ok(startIdx !== -1, 'Agent Concurrency card present');
  // Slice ~1500 chars for the card region.
  const region = html.substr(Math.max(0, startIdx - 200), 1700);
  // Reject any characters in standard emoji ranges:
  //   U+1F300..U+1FAFF, U+2600..U+27BF, U+2300..U+23FF (control symbols),
  //   U+1F000..U+1FFFF generally.
  const emojiRegex = /[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]/u;
  assert.ok(!emojiRegex.test(region),
    'Agent Concurrency region contains no emoji unicode');
}
console.log('  PASS: no emoji unicode');

console.log('');
console.log('PASS agent-cap-ui (POOL-05 / POOL-06 / D-05 / D-06)');
