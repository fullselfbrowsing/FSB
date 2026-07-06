'use strict';

/**
 * Quick task 260701-2du -- keyboard-attach robustness regression.
 *
 * Proves the CDP keyboard-attach degradation fix (extension/utils/keyboard-emulator.js):
 *
 *   Test 1 (poisoned-cache gone / Tier 0): a FAILED attach must not leave a cached
 *     false-resolving attachPromise forever. After a first sendKeyEvent whose attach
 *     fails (all bounded attempts exhausted), the NEXT keystroke must call
 *     chrome.debugger.attach AGAIN (real retry, not cached false) and can succeed.
 *   Test 2 (force-detach-and-retry / Tier 1a): on an 'Another debugger is already
 *     attached' error, attachDebugger force-detaches then retries the attach once and
 *     succeeds (parity with background.js cdpInsertText/cdpMouseClick).
 *   Test 3 (post-op detach preserved / regression guard): after a successful op,
 *     detachDebugger (as handleKeyboardDebuggerAction does after every op) resets state
 *     so isAttachedTo(tabId) is false and the next attach starts fresh -- confirming we
 *     did NOT switch to a persistent debugger hold (resolved issue
 *     cdp-tab-debugger-attachment.md must not regress).
 *
 * Zero-framework sibling convention (tests/service-denylist.test.js,
 * tests/network-capture.test.js): passed/failed counters + check(cond,msg) +
 * process.exit(failed>0?1:0). Inline chrome mock installed BEFORE require. Hermetic:
 * no network, small retry counts, near-instant (attach failures resolve immediately;
 * the emulator's own bounded backoff is the only wall time).
 *
 * Run: node tests/keyboard-attach-robustness.test.js  (exit 0 = pass)
 */

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// --- Controllable chrome.debugger mock -------------------------------------
// attach() consults a per-call schedule: schedule[i] describes the i-th attach call.
//   { ok: true }                          -> resolve
//   { throw: '<message>' }                -> reject with an Error carrying that message
// Counters record how many times attach/detach/sendCommand were invoked.
const TAB_ID = 4242;

function makeChromeMock(attachSchedule) {
  const counts = { attach: 0, detach: 0, sendCommand: 0 };
  const chromeMock = {
    debugger: {
      attach: async () => {
        const step = attachSchedule[counts.attach] || { ok: true };
        counts.attach++;
        if (step.throw) {
          throw new Error(step.throw);
        }
        return undefined;
      },
      detach: async () => {
        counts.detach++;
        return undefined;
      },
      sendCommand: async () => {
        counts.sendCommand++;
        return {};
      },
      onDetach: { addListener() {} }
    }
  };
  return { chromeMock, counts };
}

// Install a placeholder chrome BEFORE requiring the module (module reads globalThis.chrome
// lazily inside methods, but keep the ordering explicit and hermetic).
globalThis.chrome = makeChromeMock([]).chromeMock;

const { KeyboardEmulator } = require('../extension/utils/keyboard-emulator.js');

(async () => {
  console.log('--- 260701-2du keyboard-attach robustness ---');

  // === Test 1: poisoned-cache gone (Tier 0) ================================
  // The emulator retries up to 3 times per attachDebugger call. To make the FIRST
  // sendKeyEvent fail, reject the first 3 attach calls; then succeed so the SECOND
  // keystroke can attach for real. (Poisoned cache would leave attach count flat at 3.)
  {
    const { chromeMock, counts } = makeChromeMock([
      { throw: 'boom transient 1' },
      { throw: 'boom transient 2' },
      { throw: 'boom transient 3' },
      { ok: true }
    ]);
    globalThis.chrome = chromeMock;

    const emu = new KeyboardEmulator();

    const first = await emu.sendKeyEvent(TAB_ID, 'keyDown', 'a', {});
    const attachAfterFirst = counts.attach;
    check(first && first.success === false, 'Test 1: first keystroke returns success:false when attach fails');
    check(attachAfterFirst === 3, 'Test 1: first keystroke exhausted bounded (3) attach attempts');
    check(emu.attachPromise === null, 'Test 1: attachPromise cleared after failed attach (no poisoned cache)');

    const second = await emu.sendKeyEvent(TAB_ID, 'keyDown', 'a', {});
    check(counts.attach > attachAfterFirst, 'Test 1: second keystroke attempts a REAL attach again (count increased, not cached)');
    check(second && second.success === true, 'Test 1: second keystroke succeeds once attach recovers');
    check(emu.isAttachedTo(TAB_ID) === true, 'Test 1: emulator is attached to the tab after recovery');
  }

  // === Test 2: force-detach-and-retry (Tier 1a) ============================
  // First attach throws the "Another debugger is already attached" sentinel; the
  // emulator must force-detach (once) then retry the attach (succeeds on the 2nd call).
  {
    const { chromeMock, counts } = makeChromeMock([
      { throw: 'Another debugger is already attached to the tab with id: 4242' },
      { ok: true }
    ]);
    globalThis.chrome = chromeMock;

    const emu = new KeyboardEmulator();
    const res = await emu.sendKeyEvent(TAB_ID, 'keyDown', 'a', {});

    check(counts.detach === 1, 'Test 2: force-detach called exactly once on "already attached"');
    check(counts.attach === 2, 'Test 2: attach retried once after force-detach (2 attach calls)');
    check(res && res.success === true, 'Test 2: sendKeyEvent succeeds via force-detach-and-retry');
    check(emu.isAttachedTo(TAB_ID) === true, 'Test 2: emulator attached to tab after retry');
  }

  // === Test 3: post-op detach preserved (regression guard) =================
  // A clean attach, then detachDebugger (as handleKeyboardDebuggerAction does after
  // every op) must reset state -- no persistent hold. A following attach starts fresh.
  {
    const { chromeMock, counts } = makeChromeMock([{ ok: true }, { ok: true }]);
    globalThis.chrome = chromeMock;

    const emu = new KeyboardEmulator();
    const res = await emu.sendKeyEvent(TAB_ID, 'keyDown', 'a', {});
    check(res && res.success === true && emu.isAttachedTo(TAB_ID) === true, 'Test 3: initial op attaches successfully');

    await emu.detachDebugger(TAB_ID);
    check(counts.detach === 1, 'Test 3: detachDebugger detached the tab (post-op detach)');
    check(emu.isAttachedTo(TAB_ID) === false, 'Test 3: isAttachedTo is false after post-op detach (no persistent hold)');
    check(emu.attachPromise === null, 'Test 3: attachPromise cleared after detach');

    const attachBefore = counts.attach;
    const again = await emu.attachDebugger(TAB_ID);
    check(again === true && counts.attach === attachBefore + 1, 'Test 3: a following attach starts fresh (real attach call)');
  }

  // === Test 4: external detach reconcile (Tier 1c) =========================
  // A Chrome-initiated detach on the attached tab (via handleExternalDetach, wired to
  // chrome.debugger.onDetach in background.js) must reset emulator state.
  {
    const { chromeMock } = makeChromeMock([{ ok: true }]);
    globalThis.chrome = chromeMock;

    const emu = new KeyboardEmulator();
    await emu.attachDebugger(TAB_ID);
    check(emu.isAttachedTo(TAB_ID) === true, 'Test 4: attached before external detach');

    const otherReset = emu.handleExternalDetach(TAB_ID + 1);
    check(otherReset === false && emu.isAttachedTo(TAB_ID) === true, 'Test 4: external detach for a DIFFERENT tab is a no-op');

    const reset = emu.handleExternalDetach(TAB_ID);
    check(reset === true, 'Test 4: handleExternalDetach returns true for the attached tab');
    check(emu.isAttachedTo(TAB_ID) === false && emu.attachPromise === null, 'Test 4: emulator state reset after external detach');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
