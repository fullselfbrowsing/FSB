---
phase: 22-capture-adapter-migration
plan: "01"
subsystem: phantomstream-capture-bundle
tags: [phantomstream, capture, mv3, content-script, esbuild]

provides:
  - Classic content-script bundle seam for PhantomStream capture
  - Primary content-script injection order including the capture bundle and dom-stream module
  - Focused regression test for bundle/injection seam
affects:
  - esbuild.config.js
  - extension/background.js
  - extension/content/phantom-stream-capture-entry.js
  - extension/content/phantom-stream-capture.js
  - tests/phantom-stream-content-bundle.test.js

requirements_touched: [CAP-01, CAP-03]
requirements_completed: []

completed: 2026-06-17
---

# Phase 22 Plan 01: Capture Adapter Seam Summary

Plan 22-01 is complete. FSB now has a tracked classic-script bundle that exposes the installed PhantomStream capture/protocol surface to `content/dom-stream.js`, and the primary content-script injection order loads it before the stream adapter.

## Accomplishments

- Added `content-phantom-stream-capture` to `esbuild.config.js`.
- Added `extension/content/phantom-stream-capture-entry.js`, importing `createCapture` and protocol symbols from `@full-self-browsing/phantom-stream`.
- Generated and committed `extension/content/phantom-stream-capture.js` as an IIFE for `chrome.scripting.executeScript({ files })`.
- Updated `CONTENT_SCRIPT_FILES` to include `content/phantom-stream-capture.js` and `content/dom-stream.js`, fixing the primary injection list for stream readiness/reinjection.
- Added `tests/phantom-stream-content-bundle.test.js`.

## Verification

Executed successfully:

```bash
npm run build
node tests/phantom-stream-content-bundle.test.js
node tests/dashboard-stream-readiness-ping.test.js
node tests/dashboard-stream-pending-intent.test.js
npm run validate:extension
```

Focused results:

- `tests/phantom-stream-content-bundle.test.js`: 11 PASS / 0 FAIL.
- `tests/dashboard-stream-readiness-ping.test.js`: 16 PASS / 0 FAIL.
- `tests/dashboard-stream-pending-intent.test.js`: 14 PASS / 0 FAIL.
- `npm run validate:extension`: manifest valid, 258 JS files parsed clean.

## Boundary

This plan creates the import/runtime seam only. It does not yet replace `dom-stream.js` snapshot/diff internals or mark CAP requirements complete. That replacement begins in Plan 22-02.
