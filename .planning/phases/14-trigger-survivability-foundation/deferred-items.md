# Phase 14 - Deferred Items (out-of-scope discoveries during execution)

> Logged per the executor SCOPE BOUNDARY rule: issues NOT directly caused by this
> plan's changes are recorded here and left unfixed.

## Pre-existing `npm test` chain failure (NOT caused by Plan 14-01)

- **Discovered during:** Plan 14-01, Task 2 (`npm test` full-chain verification).
- **Failing test:** `tests/mcp-philosophy-parity-smoke.test.js` -- `Part 9.6 -- REQUIREMENTS.md INV-02 wording extension landed (Phase 10 ceremony Plan 10-03 Task 1)` (`36 PASS / 1 FAIL`).
- **Chain position:** index 122 of 131; the `&&` chain short-circuits here, BEFORE the newly-appended `tests/trigger-store.test.js` at index 130.
- **Evidence it is pre-existing / out-of-scope:**
  - The test asserts `.planning/REQUIREMENTS.md` INV-02 wording from a **v0.10.0 Phase 10** Lattice ceremony -- unrelated to the Phase 14 trigger family.
  - Neither `tests/mcp-philosophy-parity-smoke.test.js` nor `.planning/REQUIREMENTS.md` were modified by Plan 14-01 (clean `git status`).
  - The test fails identically in isolation (`node tests/mcp-philosophy-parity-smoke.test.js` -> exit 1, same Part 9.6 FAIL) with NONE of this plan's changes in play.
  - It is the **only** FAIL in the entire chain log.
- **Proof Plan 14-01's wiring is correct despite the short-circuit:** running every chain entry from index 122 to the end (continuing past the pre-existing failure) shows all of them PASS, including `tests/trigger-store.test.js` (10/10, exit 0). No prior test regressed.
- **Disposition:** NOT fixed (out of scope -- belongs to the v0.10.0 / Phase 10 REQUIREMENTS.md surface, a different milestone). Flag for the milestone owner / a future Phase 10 follow-up. It does not affect the correctness, survivability, or wiring of the trigger-store substrate delivered by Plan 14-01.

## Deferred human-UAT: live-Chrome MV3 SW-eviction survival (Plan 14-03, Task 2)

- **Type:** `checkpoint:human-verify` -- live-browser observation, NOT automatable.
- **Discovered during:** Plan 14-03, Task 2 (the plan's second task is a human-verify checkpoint).
- **What is deferred:** loading the unpacked extension in real Chrome and observing the ONE behavior the Node-mock cannot reproduce -- a genuine MV3 service-worker eviction + `chrome.alarms` wake re-hydrating the trigger registry in a running browser.
- **Why it is safe to defer:** all four glue points are wired and committed (`06a241e3`), `node --check extension/background.js` passes, and the full trigger logic (store envelope discipline, idempotent `handleTriggerAlarm`, cold-boot `restoreTriggersFromStorage` reconcile + orphan sweep, tab-close reap) has deterministic Node-mock coverage (Plans 14-01: 10/10, 14-02: 62/62). 14-VALIDATION.md classes live SW-eviction survival as a "Manual-Only Verification," and this matches FSB's established milestone-end Chrome MV3 UAT deferral pattern (the v0.10.0 close acknowledged 11 such human-gated UAT items as deferred closeout debt rather than fabricated passes).
- **How to verify (when performed at milestone-end UAT):**
  1. chrome://extensions -> Developer mode -> Load unpacked -> select `extension/`.
  2. Open the SW console; confirm NO `[FSB] Failed to load trigger-store.js` / `trigger-lifecycle.js` load errors and that bootstrap `restoreTriggersFromStorage` ran clean (fresh profile -> no-op `{ ok:true, restored:0, reaped:0, dropped:0, orphans_cleared:0 }`).
  3. (Survival smoke) From the SW console seed an armed snapshot + alarm (`FsbTriggerStore.writeSnapshot(...)` + `chrome.alarms.create('fsbTrigger:test', { when: Date.now() + <minutes> })`), stop the SW via chrome://serviceworker-internals (or idle >30s with devtools closed), and confirm the alarm wakes the SW, `restoreTriggersFromStorage` re-hydrates, and the trigger stays `armed` with no duplicate fire / no orphan alarm. (Full end-to-end arming is Phase 15; for Phase 14 the storage/alarm primitives are exercised directly from the SW console.)
  4. Close a tab a seeded trigger is bound to (`target_tab_id`); confirm `handleTriggerTabRemoved` reaped its entry + alarm.
- **Disposition:** DEFERRED to milestone-end Chrome MV3 UAT (per the v0.10.0 UAT-debt pattern). Plan 14-03's autonomous code work is 100% complete and committed; only the live-browser observation is outstanding. Also recorded in STATE.md Deferred Items and 14-03-SUMMARY.md.
