/**
 * requireForegroundNativeInput on Safari.
 *
 * Native keyboard and mouse input (CDP) needs the tab in front, so the guard
 * refuses a hidden or unfocused tab. Safari has no CDP: every caller's attach
 * fails and it falls back to untrusted DOM events, which need no focus. On
 * device, press_key refused whenever Safari was not the frontmost app even
 * though it was only ever going to dispatch DOM events.
 *
 * Runs the real function from extension/background.js in a VM context.
 *
 * Run: node tests/safari-foreground-input.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const background = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
const start = background.indexOf('async function requireForegroundNativeInput(');
const end = background.indexOf('\n}\n', start) + 2;
const SOURCE = background.slice(start, end);

function guardIn(context) {
  return vm.runInNewContext(`${SOURCE}\nrequireForegroundNativeInput`, context);
}

function chromeWith(state, calls) {
  return {
    tabs: { get: async (id) => { calls.push('tabs.get'); return { id, active: state.active, windowId: 1 }; } },
    windows: { get: async () => { calls.push('windows.get'); return { focused: state.focused, state: state.state }; } }
  };
}

(async function run() {
  passAssert(start >= 0 && end > start, 'requireForegroundNativeInput found in background.js');
  const unfocused = { active: true, focused: false, state: 'normal' };

  console.log('\n=== Safari (no trusted input) ===');
  {
    const calls = [];
    const guard = guardIn({
      chrome: chromeWith(unfocused, calls),
      FsbPlatform: { id: 'safari', caps: { trustedInput: false } }
    });
    let threw = null;
    try { await guard(7); } catch (err) { threw = err; }
    passAssert(threw === null, 'an unfocused Safari tab is let through to the DOM fallback');
    passAssert(calls.length === 0, 'without even querying the tab or window');
  }

  console.log('\n=== Chrome (trusted input) keeps refusing ===');
  for (const [label, context] of [
    ['no FsbPlatform', {}],
    ['FsbPlatform with trustedInput: true', { FsbPlatform: { id: 'chrome', caps: { trustedInput: true } } }]
  ]) {
    const calls = [];
    const guard = guardIn(Object.assign({ chrome: chromeWith(unfocused, calls) }, context));
    let threw = null;
    try { await guard(7); } catch (err) { threw = err; }
    passAssert(threw && threw.code === 'TAB_NOT_FOREGROUND', `${label}: an unfocused tab is refused`);
  }
  {
    const calls = [];
    const guard = guardIn({ chrome: chromeWith({ active: true, focused: true, state: 'normal' }, calls) });
    let threw = null;
    try { await guard(7); } catch (err) { threw = err; }
    passAssert(threw === null, 'a focused, visible tab still passes');
  }

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('TEST HARNESS ERROR:', err);
  process.exit(1);
});
