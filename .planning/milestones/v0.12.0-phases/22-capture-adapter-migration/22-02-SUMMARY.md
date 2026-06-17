---
phase: 22-capture-adapter-migration
plan: "02"
subsystem: content-dom-stream
tags: [phantomstream, capture, adapter, dashboard-compatibility]

provides:
  - Package-backed dom-stream capture adapter
  - Legacy dashboard identity bridge for PhantomStream nodeIds
  - Runtime simulation for stream action mapping
affects:
  - extension/content/dom-stream.js
  - tests/phantom-stream-capture-adapter.test.js
  - tests/dom-stream-perf.test.js
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md

requirements_completed: [CAP-01]
requirements_remaining: [CAP-02, CAP-03, CAP-04]

completed: 2026-06-17
---

# Phase 22 Plan 02: Capture Core Migration Summary

Plan 22-02 is complete. `extension/content/dom-stream.js` now delegates snapshot, mutation, scroll, and session capture to the bundled PhantomStream capture package through a thin FSB adapter.

## Accomplishments

- Replaced the local `serializeDOM`, `processMutationBatch`, and direct `MutationObserver` ownership in `dom-stream.js` with `bridge.createCapture(...)`.
- Mapped PhantomStream `STREAM.*` messages to existing FSB background actions:
  - `ext:dom-snapshot` -> `domStreamSnapshot`
  - `ext:dom-mutations` -> `domStreamMutations`
  - `ext:dom-scroll` -> `domStreamScroll`
  - `ext:dom-overlay` -> `domStreamOverlay`
  - `ext:dom-dialog` -> `domStreamDialog`
  - `ext:dom-ready` -> `domStreamReady`
- Added temporary legacy `data-fsb-nid` stamping from PhantomStream `nodeIds` sidecars so current static and Angular dashboards keep working until Phase 23 renderer migration.
- Preserved FSB resume semantics by mapping `domStreamResume` to a fresh stop/start snapshot path instead of PhantomStream's same-session `resume()`.
- Updated `tests/dom-stream-perf.test.js` so it checks package-backed bundle invariants instead of removed local implementation details.
- Expanded `tests/phantom-stream-capture-adapter.test.js` with a VM runtime simulation for message forwarding, stale-flush forwarding, legacy nid stamping, pause, resume, and overlay request behavior.

## Verification

Executed successfully:

```bash
node tests/phantom-stream-capture-adapter.test.js
node tests/dom-stream-perf.test.js
node tests/phantom-stream-content-bundle.test.js
node tests/dashboard-stream-readiness-ping.test.js
node tests/dashboard-stream-pending-intent.test.js
node tests/dashboard-runtime-state.test.js
npm run validate:extension
```

Focused results:

- `tests/phantom-stream-capture-adapter.test.js`: 23 PASS / 0 FAIL.
- `tests/dom-stream-perf.test.js`: all assertions passed.
- `tests/phantom-stream-content-bundle.test.js`: 11 PASS / 0 FAIL.
- `tests/dashboard-stream-readiness-ping.test.js`: 16 PASS / 0 FAIL.
- `tests/dashboard-stream-pending-intent.test.js`: 14 PASS / 0 FAIL.
- `tests/dashboard-runtime-state.test.js`: 57 PASS / 0 FAIL.
- `npm run validate:extension`: manifest valid, 258 JS files parsed clean.

## Boundary

CAP-01 is complete. CAP-02, CAP-03, and CAP-04 remain open because overlay/dialog/watchdog parity and security/masking evidence continue in Plans 22-03 and 22-04.
