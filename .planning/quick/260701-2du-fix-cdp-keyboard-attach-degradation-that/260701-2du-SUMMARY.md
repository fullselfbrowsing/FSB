---
phase: quick-260701-2du
plan: 01
subsystem: keyboard-cdp
tags: [cdp, keyboard, debugger-attach, self-healing, cross-origin-iframe, stripe]
requires:
  - extension/utils/keyboard-emulator.js (KeyboardEmulator class)
  - extension/background.js (keyboardEmulator singleton, handleKeyboardDebuggerAction)
  - extension/content/actions.js (keyPress tool)
provides:
  - Self-healing KeyboardEmulator.attachDebugger (poisoned-cache fix + force-detach-and-retry + bounded backoff)
  - KeyboardEmulator.handleExternalDetach + chrome.debugger.onDetach reconcile listener
  - Honest keyPress domEvents fallback (trusted:false / degraded / cdpError)
  - tests/keyboard-attach-robustness.test.js (Node regression, wired into npm test)
affects:
  - Trusted keystroke delivery into cross-origin payment/OAuth iframes (Stripe CVC)
tech-stack:
  added: []
  patterns:
    - Bounded retry with short backoff (<=3 attempts, 150ms) for transient attach races
    - Force-detach-and-retry on "Another debugger is already attached" (parity with cdpInsertText/cdpMouseClick)
    - chrome.debugger.onDetach reconcile (mirrors network-capture.js onDetach style)
key-files:
  created:
    - tests/keyboard-attach-robustness.test.js
  modified:
    - extension/utils/keyboard-emulator.js
    - extension/background.js
    - extension/content/actions.js
    - package.json
decisions:
  - "Tier 1c reset logic lives in KeyboardEmulator.handleExternalDetach(tabId) so state ownership stays with the class and is unit-testable; the background.js onDetach listener is a thin, guarded, non-throwing wrapper."
  - "keyPress keeps success:true for same-origin callers (per task contract) and only adds degraded:true/cdpError when a CDP attempt was actually made and failed; a TODO records fuller cross-origin-iframe detection (returning success:false in that case) as follow-up."
  - "New robustness test appended at the tail of the npm test chain (before the tsx-flagged no-orphan-descriptor entry) to avoid reordering or disturbing existing entries."
metrics:
  duration: ~4m
  completed: 2026-07-01
  tasks: 3
  files: 5
  commits: 3
---

# Quick Task 260701-2du: Fix CDP Keyboard-Attach Degradation Summary

Made `KeyboardEmulator.attachDebugger` self-healing (clears the poisoned single-promise cache on failure, force-detaches-and-retries on "Another debugger is already attached", bounded backoff for navigation races) and added a `chrome.debugger.onDetach` reconcile, so trusted keystrokes stop silently degrading into no-op untrusted `domEvents` inside cross-origin iframes (e.g. the Stripe CVC frame) for the life of the service worker. Also made `keyPress`'s `domEvents` fallback honest (`trusted:false` + `degraded`/`cdpError` + a warning log) instead of masking a cross-origin no-op as an unqualified success.

## Root Cause (recap)

`attachDebugger` memoized the in-flight attach in `this.attachPromise` and, on a FAILED attach, called `resolve(false)` but never nulled `attachPromise`. `attachPromise` was only cleared in `detachDebugger`, which early-returns whenever the attach failed (`debuggerAttached` is false). So one failed attach left a cached `false`-resolving promise forever; every later keystroke short-circuited on `if (this.attachPromise) return await this.attachPromise;` and returned cached `false`. Because `keyboardEmulator` is a single background-global singleton, one poisoned promise degraded EVERY tab. `sendKeyEvent` then returned failure and the content-script `keyPress` silently fell back to synthetic `domEvents` (isTrusted:false), which no-op inside cross-origin iframes.

## What Changed

### Task 1 -- Self-healing attachDebugger (commit `9330f1eb`)
`extension/utils/keyboard-emulator.js`, `extension/background.js`
- **Tier 0:** On attach exhaustion the catch path now sets `this.attachPromise = null;` before `resolve(false)`, so the next keystroke retries a real `chrome.debugger.attach`.
- **Tier 1a:** Inside the attach, mirror background.js `cdpInsertText`/`cdpMouseClick` exactly -- when the thrown message includes `'Another debugger is already attached'`, `chrome.debugger.detach({ tabId })` inside a swallowing try/catch, then re-attach once.
- **Tier 1b:** Bounded retry -- up to 3 total attempts with a 150ms delay between transient failures; no unbounded loop, no persistent hold.
- **Tier 1c:** New `KeyboardEmulator.handleExternalDetach(tabId)` resets `debuggerAttached`/`attachedTabId`/`attachPromise` when `tabId === this.attachedTabId`. A `chrome.debugger.onDetach` listener in background.js (registered once at boot beside the onRemoved/onSuspend cleanup, guarded + non-throwing) calls it, mirroring the network-capture.js onDetach style.
- **Preserved:** `isAttachedTo(tabId)` unchanged; `handleKeyboardDebuggerAction`'s post-op `emulator.detachDebugger(tabId)` (success + error paths) untouched -- the keyboard path still detaches after every op (resolved issue cdp-tab-debugger-attachment.md not regressed).

### Task 2 -- Node regression test (commit `f3e121a8`)
`tests/keyboard-attach-robustness.test.js` (new), `package.json`
- Zero-framework sibling convention (`check(cond,msg)` + `process.exit(failed>0?1:0)`), inline controllable `chrome.debugger` mock installed before require.
- Test 1: after a keystroke whose attach fails (all bounded attempts exhausted), `attachPromise` is null and the NEXT keystroke attempts a real attach again and succeeds (poisoned cache gone).
- Test 2: "Another debugger is already attached" -> exactly one force-detach + two attach calls + `success:true`.
- Test 3: post-op `detachDebugger` leaves `isAttachedTo` false and a following attach starts fresh (no persistent hold).
- Test 4 (extra): `handleExternalDetach` resets state for the attached tab and is a no-op for a different tab.
- Wired `&& node tests/keyboard-attach-robustness.test.js` into the `test` script (appended at the tail, before the tsx `no-orphan-descriptor` entry; no reordering).
- Result: `19 passed, 0 failed`, exit 0.

### Task 3 -- Honest keyPress domEvents fallback (commit `293162d9`)
`extension/content/actions.js`
- Capture the CDP failure reason into a local `cdpError` (from `response.error` and `error.message`) and track `cdpAttempted`.
- The `domEvents` return now includes `method:'domEvents'` + `trusted:false`, plus `degraded:true` + `cdpError` when a CDP attempt was made and failed.
- `success:true` and existing fields preserved for same-origin callers (per the narrowed task contract).
- `logger.warn(...)` emitted on the untrusted fallback with `cdpError` so the degradation is visible in logs.
- `TODO(260701-2du)` records fuller cross-origin-iframe detection (returning `success:false` in that specific case) as a follow-up.
- Sibling tool return shapes (`pressKeySequence`/`typeWithKeys`/`sendSpecialKey`) untouched; diff confined to the `keyPress` region.

## Verification

- `node tests/keyboard-attach-robustness.test.js` -> exit 0, 19/19 checks pass.
- Static: `attachPromise = null` (non-comment source) and `Another debugger is already attached` present in keyboard-emulator.js; `chrome.debugger.onDetach.addListener` + `handleExternalDetach` present in background.js; `trusted:false` / `degraded` / `cdpError` present in keyPress.
- Regression guards: `handleKeyboardDebuggerAction` still calls `emulator.detachDebugger(tabId)` (2 sites); `isAttachedTo` still used in background.js and exported from keyboard-emulator.js.
- Smoke: `require('./extension/utils/keyboard-emulator.js')` loads with all 5 methods; `node --check` passes for actions.js and background.js.
- Package.json parses as valid JSON with the new test wired in.

## Scope Isolation

The three commits touch EXACTLY the five files in the plan's `files_modified`. The 91 pre-existing unstaged `.planning/`/`catalog/` modifications were never staged, committed, reverted, or otherwise touched (verified: `git diff --name-only 8b2495b0..HEAD` matches only the plan files; the index is empty post-commit).

## Deviations from Plan

None -- plan executed as written.

Notes:
- The pre-existing non-ASCII characters in `keyboard-emulator.js` (middle-dot/em-dash/smart-quotes in the untouched `typeText` fallback comment at line 547) were left as-is: they are outside this task's changed lines (all added lines are ASCII), so per the scope boundary they were not modified.
- Task 2 was marked `tdd="true"`; because the implementation (Task 1's fix) already landed in the prior commit, the test was written to prove the fixed behavior (it passes against the fixed code and would fail against the pre-fix poisoned-cache/no-retry behavior). This matches the task's `<behavior>` contract of proving the poisoned cache is gone and force-detach-and-retry works.

## Commits

- `9330f1eb` fix(260701-2du): make KeyboardEmulator.attachDebugger self-healing
- `f3e121a8` test(260701-2du): keyboard-attach robustness regression + wire into npm test
- `293162d9` fix(260701-2du): stop keyPress masking untrusted domEvents no-op as success

## Self-Check: PASSED
- FOUND: tests/keyboard-attach-robustness.test.js
- FOUND commit 9330f1eb, f3e121a8, 293162d9
- All 5 plan files present with expected changes; no pre-existing files touched.
