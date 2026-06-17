---
phase: 23-dashboard-renderer-migration
plan: "03"
subsystem: angular-dashboard-phantomstream-viewer
tags: [phantomstream, renderer, angular-dashboard, dashboard-preview, parity]

provides:
  - Angular dashboard PhantomStream viewer host
  - Angular snapshot/mutation/scroll/overlay/dialog dispatch through shared viewer wrapper
  - Static/Angular renderer parity guard
affects:
  - showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts
  - showcase/angular/src/app/pages/dashboard/dashboard-page.component.html
  - showcase/angular/src/app/pages/dashboard/dashboard-page.component.scss
  - package.json
  - tests/phantom-stream-dashboard-parity.test.js
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md

requirements_completed: [VIEW-02]
requirements_remaining: [VIEW-03, VIEW-04]

completed: 2026-06-17
---

# Phase 23 Plan 03: Angular Dashboard Renderer Migration Summary

Plan 23-03 is complete. The Angular dashboard now uses the same shared PhantomStream viewer wrapper contract as the static dashboard instead of maintaining a second local iframe `srcdoc` renderer and `data-fsb-nid` mutation applicator.

## Accomplishments

- Replaced the Angular preview iframe markup with a `dash-preview-viewer` host for the package-backed viewer.
- Updated Angular dashboard SCSS to style the viewer host and fullscreen selector.
- Added Angular viewer lifecycle helpers around `(window as any).FSBPhantomStreamViewer.createDashboardViewer(...)`.
- Routed Angular `ext:dom-snapshot`, `ext:dom-mutations`, `ext:dom-scroll`, `ext:dom-overlay`, and `ext:dom-dialog` messages into the shared viewer wrapper.
- Mapped viewer `CONTROL.START` resync callbacks back to the existing FSB `requestPreviewResync(...)` path.
- Kept subtree request handling explicit and deferred through a diagnostic event because full subtree routing remains Phase 24 work.
- Preserved Angular-owned preview state handling, stale-session checks, stream-start WebSocket message, side-channel host UI, client badge, diagnostic tooltip counters, and remote-control overlay.
- Updated Angular remote-control point clamping to use the viewer's host-to-viewport mapping when available, falling back to the previous scale clamp.
- Added `tests/phantom-stream-dashboard-parity.test.js` and wired it into `npm test` so static and Angular renderer paths cannot drift back to local renderers independently.

## Verification

Executed successfully:

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
node tests/phantom-stream-dashboard-parity.test.js
node tests/phantom-stream-static-viewer.test.js
node tests/phantom-stream-dashboard-viewer-bundle.test.js
node tests/dashboard-runtime-state.test.js
node tests/dashboard-stream-readiness-ping.test.js
node tests/dashboard-stream-pending-intent.test.js
npm --prefix showcase/angular run build
npm run validate:extension
git diff --check
```

Focused results:

- `tests/phantom-stream-dashboard-parity.test.js`: 70 PASS / 0 FAIL.
- `tests/phantom-stream-static-viewer.test.js`: 31 PASS / 0 FAIL.
- `tests/phantom-stream-dashboard-viewer-bundle.test.js`: 26 PASS / 0 FAIL.
- `tests/dashboard-runtime-state.test.js`: 57 PASS / 0 FAIL.
- `tests/dashboard-stream-readiness-ping.test.js`: 16 PASS / 0 FAIL.
- `tests/dashboard-stream-pending-intent.test.js`: 14 PASS / 0 FAIL.
- `npm --prefix showcase/angular run build`: completed successfully; Angular emitted existing zh locale fallback warnings only.
- `npm run validate:extension`: manifest valid, 258 JS files parsed clean.
- `package.json` parses successfully.
- `git diff --check`: clean.

## Boundary

VIEW-02 is complete: static and Angular dashboards now consume one shared wrapper contract. Final side-channel/frozen-state closeout and visual regression smoke remain Plan 23-04.
