---
phase: 22-capture-adapter-migration
plan: "03"
subsystem: phantomstream-sidechannels
tags: [phantomstream, capture, overlay, dialog, watchdogs]

provides:
  - Side-channel guard for overlay, dialog, and scroll forwarding
  - Watchdog and stale-flush diagnostic coverage for the package-backed capture adapter
  - Dashboard consumer checks for static and Angular side-channel messages
affects:
  - tests/phantom-stream-sidechannels.test.js
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md

requirements_completed: [CAP-02, CAP-03]
requirements_remaining: [CAP-04]

completed: 2026-06-17
---

# Phase 22 Plan 03: Side Channels And Watchdogs Summary

Plan 22-03 is complete. The PhantomStream-backed capture adapter now has focused regression coverage for FSB overlay, dialog, scroll, stale-flush, and watchdog behavior across the adapter, capture bundle, background forwarding path, and dashboard consumers.

## Accomplishments

- Added `tests/phantom-stream-sidechannels.test.js`.
- Verified `dom-stream.js` still passes the FSB overlay provider into `createCapture(...)`.
- Verified `domStreamRequestOverlay` forces an immediate overlay broadcast through the package-backed adapter.
- Verified overlay, dialog, and scroll side-channel messages still use the existing background actions and dashboard message types.
- Verified stale-flush diagnostics remain surfaced through mutation payloads, background cache state, and `FSB.domStream.getStaleFlushCount()`.
- Verified the bundled capture runtime still includes dialog relays, overlay throttling, stale mutation watchdog thresholds, watchdog rescue increments, and stop-time watchdog cleanup.
- Verified both static and Angular dashboards still consume `ext:dom-overlay`, `ext:dom-dialog`, and `ext:dom-scroll`.

## Verification

Executed successfully:

```bash
node tests/phantom-stream-sidechannels.test.js
node tests/phantom-stream-capture-adapter.test.js
node tests/dom-stream-perf.test.js
node tests/dashboard-runtime-state.test.js
node tests/overlay-content-audit.test.js
npm run validate:extension
```

Focused results:

- `tests/phantom-stream-sidechannels.test.js`: 29 PASS / 0 FAIL.
- `tests/phantom-stream-capture-adapter.test.js`: 23 PASS / 0 FAIL.
- `tests/dom-stream-perf.test.js`: all assertions passed.
- `tests/dashboard-runtime-state.test.js`: 57 PASS / 0 FAIL.
- `tests/overlay-content-audit.test.js`: 42 PASS / 0 FAIL.
- `npm run validate:extension`: manifest valid, 258 JS files parsed clean.

## Boundary

CAP-02 and CAP-03 are complete. CAP-04 remains open for explicit sensitive-content masking and sanitization evidence in Plan 22-04.
