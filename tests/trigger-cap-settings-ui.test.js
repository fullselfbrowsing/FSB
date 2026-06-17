'use strict';

/**
 * Phase 20 Plan 01 -- Trigger Concurrency settings UI.
 *
 * Validates:
 *   - control_panel.html adds a Trigger Concurrency card adjacent to Agent
 *     Concurrency, with the locked D-01..D-05 ids and copy.
 *   - options.js persists chrome.storage.local.fsbTriggerCap with default 8,
 *     min 1, max 64, and step 1, using the same source-shape as Agent Cap.
 *   - options.js refreshes an informational active-trigger counter from
 *     chrome.storage.session.fsbTriggerRegistry with a 100ms debounce.
 *   - cap-counter-helpers.js exports computeActiveTriggerCount(envelope),
 *     counting armed / needs_attention / blocked records only.
 *
 * Plain Node + assert. No browser automation or DOM test framework.
 *
 * Run: node tests/trigger-cap-settings-ui.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const CONTROL_PANEL_HTML_PATH = path.resolve(__dirname, '..', 'extension', 'ui', 'control_panel.html');
const OPTIONS_JS_PATH = path.resolve(__dirname, '..', 'extension', 'ui', 'options.js');
const HELPERS_PATH = path.resolve(__dirname, '..', 'extension', 'ui', 'cap-counter-helpers.js');

let passed = 0;
let failed = 0;

function ok(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function sliceBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  assert.ok(start >= 0, 'start marker exists: ' + startNeedle);
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end >= 0, 'end marker exists: ' + endNeedle);
  return src.slice(start, end);
}

function assertOrdered(src, first, second, msg) {
  const firstIdx = src.indexOf(first);
  const secondIdx = src.indexOf(second);
  ok(firstIdx >= 0 && secondIdx >= 0 && firstIdx < secondIdx, msg);
}

(async () => {
  console.log('--- Test 1: Trigger Concurrency card shape and placement ---');
  {
    const html = readFile(CONTROL_PANEL_HTML_PATH);
    const agentIdx = html.indexOf('Agent Concurrency');
    const triggerIdx = html.indexOf('Trigger Concurrency');
    const changeReportsIdx = html.indexOf('Action Change Reports');

    ok(agentIdx >= 0, 'Agent Concurrency analog card still exists');
    ok(triggerIdx > agentIdx, 'Trigger Concurrency card appears after Agent Concurrency');
    ok(changeReportsIdx < 0 || triggerIdx < changeReportsIdx, 'Trigger Concurrency card is adjacent before Action Change Reports');
    ok(html.indexOf('fas fa-bolt') !== -1, 'Trigger Concurrency card uses fas fa-bolt icon');
    ok(html.indexOf('Maximum simultaneous trigger watches') !== -1, 'subtitle is locked copy');
    ok(html.indexOf('id="fsbTriggerCap"') !== -1, 'has fsbTriggerCap input');
    ok(html.indexOf('id="fsbTriggerCapDisplay"') !== -1, 'has fsbTriggerCapDisplay value badge');
    ok(html.indexOf('id="fsbTriggerCapReset"') !== -1, 'has fsbTriggerCapReset button');
    ok(html.indexOf('id="fsbTriggerCapValidation"') !== -1, 'has fsbTriggerCapValidation hint');
    ok(html.indexOf('id="fsbTriggerCapCurrentActive"') !== -1, 'has fsbTriggerCapCurrentActive counter');
    ok(/id="fsbTriggerCap"[^>]*min="1"[^>]*max="64"[^>]*step="1"[^>]*value="8"/.test(html),
      'fsbTriggerCap input has min/max/step/default 1/64/1/8');
    ok(html.indexOf('Reset to default (8)') !== -1, 'reset copy is locked');
    ok(html.indexOf('Must be between 1 and 64') !== -1, 'validation copy is locked');
    ok(html.indexOf('Default 8. Range 1 to 64.') !== -1, 'helper begins with locked range copy');
    ok(html.indexOf('0 of 8 active') !== -1, 'initial active counter copy is locked');

    const triggerCardSlice = sliceBetween(html, 'Trigger Concurrency', 'Action Change Reports');
    ok(triggerCardSlice.indexOf('full-width') === -1, 'Trigger Concurrency card is not full-width');
  }

  console.log('--- Test 2: options.js storage key, cache, clamp, reset, and save wiring ---');
  {
    const src = readFile(OPTIONS_JS_PATH);

    ok(/fsbTriggerCap\s*:\s*8\b/.test(src), 'defaultSettings contains fsbTriggerCap: 8');
    ok(/elements\.fsbTriggerCap\s*=\s*document\.getElementById\(['"]fsbTriggerCap['"]\)/.test(src),
      'cacheElements maps elements.fsbTriggerCap');
    ok(/elements\.fsbTriggerCapDisplay\s*=\s*document\.getElementById\(['"]fsbTriggerCapDisplay['"]\)/.test(src),
      'cacheElements maps elements.fsbTriggerCapDisplay');
    ok(/elements\.fsbTriggerCapReset\s*=\s*document\.getElementById\(['"]fsbTriggerCapReset['"]\)/.test(src),
      'cacheElements maps elements.fsbTriggerCapReset');
    ok(/elements\.fsbTriggerCapValidation\s*=\s*document\.getElementById\(['"]fsbTriggerCapValidation['"]\)/.test(src),
      'cacheElements maps elements.fsbTriggerCapValidation');
    ok(/elements\.fsbTriggerCapCurrentActive\s*=\s*document\.getElementById\(['"]fsbTriggerCapCurrentActive['"]\)/.test(src),
      'cacheElements maps elements.fsbTriggerCapCurrentActive');

    ok(/elements\.fsbTriggerCap\s*\.addEventListener\(\s*['"]input['"]/.test(src),
      'input listener attached to fsbTriggerCap');
    ok(/elements\.fsbTriggerCapReset\s*\.addEventListener\(\s*['"]click['"]/.test(src),
      'reset click listener attached to fsbTriggerCapReset');
    ok(src.indexOf('refreshActiveTriggerCount') !== -1, 'options.js references refreshActiveTriggerCount');
    ok(src.indexOf('scheduleRefreshActiveTriggerCount') !== -1, 'options.js references scheduleRefreshActiveTriggerCount');
    ok(src.indexOf('computeActiveTriggerCount') !== -1, 'options.js references computeActiveTriggerCount');
    ok(src.indexOf('fsbTriggerRegistry') !== -1, 'options.js references fsbTriggerRegistry');

    ok(/area\s*===\s*['"]session['"][\s\S]{0,120}fsbTriggerRegistry/.test(src),
      'storage listener watches session/fsbTriggerRegistry');
    ok(/area\s*===\s*['"]local['"][\s\S]{0,120}fsbTriggerCap/.test(src),
      'storage listener watches local/fsbTriggerCap');
    ok(/setTimeout\(\s*\(\)\s*=>[\s\S]{0,160}refreshActiveTriggerCount\(\)[\s\S]{0,80},\s*100\s*\)/.test(src),
      'trigger counter debounce is 100ms');

    const saveSlice = sliceBetween(src, 'function saveSettings()', 'chrome.storage.local.set');
    ok(/fsbTriggerCap\s*:\s*\(function\(\)/.test(saveSlice), 'saveSettings persists fsbTriggerCap through clamped IIFE');
    ok(saveSlice.indexOf('if (raw < 1) return 1;') !== -1, 'saveSettings clamps trigger cap min 1');
    ok(saveSlice.indexOf('if (raw > 64) return 64;') !== -1, 'saveSettings clamps trigger cap max 64');
    ok(saveSlice.indexOf('return 8;') !== -1, 'saveSettings defaults trigger cap to 8');
  }

  console.log('--- Test 3: helper computes active trigger statuses only ---');
  {
    delete require.cache[require.resolve(HELPERS_PATH)];
    const helpers = require(HELPERS_PATH);
    assert.strictEqual(typeof helpers.computeActiveTriggerCount, 'function', 'computeActiveTriggerCount exported');

    const envelope = {
      records: {
        armed: { status: 'armed' },
        attention: { status: 'needs_attention' },
        blocked: { status: 'blocked' },
        fired: { status: 'fired' },
        timeout: { status: 'timed_out' },
        stopped: { status: 'stopped' },
        missingStatus: {},
        nullRecord: null
      }
    };
    ok(helpers.computeActiveTriggerCount(envelope) === 3,
      'computeActiveTriggerCount includes armed/needs_attention/blocked and excludes terminal/malformed records');
    ok(helpers.computeActiveTriggerCount(null) === 0, 'computeActiveTriggerCount null envelope returns 0');
    ok(helpers.computeActiveTriggerCount({ records: null }) === 0, 'computeActiveTriggerCount non-object records returns 0');
  }

  console.log('--- Test 4: source ordering preserves helper globals before options.js ---');
  {
    const html = readFile(CONTROL_PANEL_HTML_PATH);
    assertOrdered(
      html,
      '<script src="cap-counter-helpers.js"></script>',
      '<script src="options.js"></script>',
      'cap-counter-helpers.js loads before options.js'
    );
  }

  console.log(`\nPASS=${passed} FAIL=${failed}`);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('Test crashed:', err && err.stack || err);
  process.exit(1);
});
