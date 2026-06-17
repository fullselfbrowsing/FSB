---
phase: 23-dashboard-renderer-migration
plan: "02"
subsystem: static-dashboard-phantomstream-viewer
tags: [phantomstream, renderer, static-dashboard, dashboard-preview]

provides:
  - Static dashboard PhantomStream viewer host
  - Static snapshot/mutation/scroll/overlay/dialog dispatch through shared viewer wrapper
  - Static renderer regression guard
affects:
  - showcase/dashboard.html
  - showcase/css/dashboard.css
  - showcase/js/dashboard.js
  - package.json
  - tests/phantom-stream-static-viewer.test.js
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md

requirements_completed: [VIEW-01]
requirements_remaining: [VIEW-02, VIEW-03, VIEW-04]

completed: 2026-06-17
---

# Phase 23 Plan 02: Static Dashboard Renderer Migration Summary

Plan 23-02 is complete. The static dashboard now routes generic preview rendering through the shared PhantomStream viewer wrapper instead of owning iframe `srcdoc` assembly and local `data-fsb-nid` mutation application.

## Accomplishments

- Replaced the static dashboard preview iframe markup with a `dash-preview-viewer` host for the package viewer.
- Updated static dashboard CSS to style the viewer host and fullscreen selector.
- Added static dashboard viewer lifecycle helpers around `window.FSBPhantomStreamViewer.createDashboardViewer(...)`.
- Routed static `ext:dom-snapshot`, `ext:dom-mutations`, `ext:dom-scroll`, `ext:dom-overlay`, and `ext:dom-dialog` messages into the shared viewer wrapper.
- Mapped viewer `CONTROL.START` resync callbacks back to the existing FSB `requestPreviewResync(...)` path.
- Kept subtree request handling explicit and deferred through a diagnostic event because full subtree routing remains Phase 24 work.
- Preserved FSB-owned preview states, stale-session checks, stream-start WebSocket message, side-channel host UI, and remote-control overlay.
- Updated remote-control point clamping to use the viewer's host-to-viewport mapping when available, falling back to the previous scale clamp.
- Added `tests/phantom-stream-static-viewer.test.js` and wired it into `npm test`.

## Verification

Executed successfully:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
node --check showcase/js/dashboard.js
node tests/phantom-stream-static-viewer.test.js
node tests/phantom-stream-dashboard-viewer-bundle.test.js
node tests/dashboard-runtime-state.test.js
node tests/dashboard-stream-readiness-ping.test.js
node tests/dashboard-stream-pending-intent.test.js
npm run validate:extension
git diff --check
```

Focused results:

- `tests/phantom-stream-static-viewer.test.js`: 31 PASS / 0 FAIL.
- `tests/phantom-stream-dashboard-viewer-bundle.test.js`: 26 PASS / 0 FAIL.
- `tests/dashboard-runtime-state.test.js`: 57 PASS / 0 FAIL.
- `tests/dashboard-stream-readiness-ping.test.js`: 16 PASS / 0 FAIL.
- `tests/dashboard-stream-pending-intent.test.js`: 14 PASS / 0 FAIL.
- `npm run validate:extension`: manifest valid, 258 JS files parsed clean.
- `node --check showcase/js/dashboard.js`: clean.
- `package.json` parses successfully.
- `git diff --check`: clean.

## Boundary

VIEW-01 is complete for the static dashboard. Angular still carries its local renderer until Plan 23-03, and final side-channel/frozen-state closeout remains Plan 23-04.
