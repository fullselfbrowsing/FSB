---
phase: 23-dashboard-renderer-migration
plan: "01"
subsystem: dashboard-phantomstream-viewer-wrapper
tags: [phantomstream, renderer, dashboard, esbuild, static-dashboard, angular-dashboard]

provides:
  - Shared browser-global PhantomStream viewer wrapper
  - Static dashboard script loading seam
  - Angular asset/script loading seam
  - Focused regression guard for the wrapper bundle
affects:
  - esbuild.config.js
  - showcase/js/phantom-stream-viewer-entry.js
  - showcase/js/phantom-stream-viewer.js
  - showcase/dashboard.html
  - showcase/angular/angular.json
  - showcase/angular/src/index.html
  - package.json
  - tests/phantom-stream-dashboard-viewer-bundle.test.js

requirements_touched: [VIEW-01, VIEW-02, VIEW-03, VIEW-04]
requirements_completed: []

completed: 2026-06-17
---

# Phase 23 Plan 01: Shared Renderer Wrapper Summary

Plan 23-01 is complete. FSB now has a shared browser-global wrapper around the installed PhantomStream renderer package, generated as a static dashboard asset and loaded by both the static and Angular dashboard shells.

## Accomplishments

- Added `showcase/js/phantom-stream-viewer-entry.js`.
- Added `showcase-phantom-stream-viewer` to `esbuild.config.js`, emitting `showcase/js/phantom-stream-viewer.js`.
- Exposed `globalThis.FSBPhantomStreamViewer` with:
  - `createDashboardViewer(...)`;
  - direct `createViewer(...)` access for tests/future adapters;
  - PhantomStream `STREAM` and `CONTROL` constants;
  - `computeScale`, `mapHostPointToViewport`, and `mapRectToHost`;
  - wrapper dispatch methods for dashboard `STREAM.*` messages.
- Added host callback seams for viewer `CONTROL.START`, `CONTROL.SUBTREE_REQUEST`, unsupported controls, state events, and health events.
- Loaded `js/phantom-stream-viewer.js` in `showcase/dashboard.html` after `dashboard-runtime-state.js` and before `dashboard.js`.
- Added Angular asset copy config for `phantom-stream-viewer.js` from shared `showcase/js`.
- Loaded `assets/phantom-stream-viewer.js` from Angular `src/index.html` after `dashboard-runtime-state.js`.
- Added `tests/phantom-stream-dashboard-viewer-bundle.test.js`.
- Wired the new guard into `npm test`.

## Verification

Executed successfully:

```bash
npm run build
node tests/phantom-stream-dashboard-viewer-bundle.test.js
node tests/phantom-stream-exports.test.js
npm run validate:extension
node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
git diff --check
```

Focused results:

- `tests/phantom-stream-dashboard-viewer-bundle.test.js`: 26 PASS / 0 FAIL.
- `tests/phantom-stream-exports.test.js`: 121 PASS / 0 FAIL.
- `npm run validate:extension`: manifest valid, 258 JS files parsed clean.
- `package.json` parses successfully.
- `git diff --check`: clean.

## Boundary

This plan creates and loads the shared renderer wrapper only. Static and Angular snapshot/mutation handlers still use their existing local renderers until Plans 23-02 and 23-03.
