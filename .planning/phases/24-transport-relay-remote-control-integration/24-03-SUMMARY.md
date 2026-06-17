---
phase: 24-transport-relay-remote-control-integration
plan: "03"
subsystem: stream-recovery-parity
tags: [phantomstream, recovery, watchdog, reconnect, dashboard-preview]

provides:
  - Dashboard/static and Angular request-snapshot recovery path
  - Recovery parity test across reconnect/readiness/watchdog paths
  - Updated watchdog stream-state source contracts after protocol constant migration
affects:
  - extension/background.js
  - extension/ws/ws-client.js
  - showcase/js/dashboard.js
  - showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts
  - package.json
  - tests/dashboard-stream-recovery-parity.test.js
  - tests/dom-stream-perf.test.js
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md

requirements_completed: [RELAY-04]
requirements_remaining: [CTRL-01, CTRL-02, CTRL-03]

completed: 2026-06-17
---

# Phase 24 Plan 03: Recovery Parity Summary

Plan 24-03 is complete. Recovery, readiness, watchdog, and reconnect behavior now has focused automated evidence after the transport/relay protocol migration.

## Accomplishments

- Added `tests/dashboard-stream-recovery-parity.test.js`, covering:
  - extension reconnect state snapshots on WebSocket open;
  - `streamIntentActive` recovering/ready state recovery;
  - `ext:page-ready` recovery emission;
  - protocol-backed `ext:stream-state` emission with stale flush diagnostics;
  - parked `dash:dom-stream-start` late-readiness re-arm;
  - dashboard reconnect and extension-online recovery requests;
  - recovery watchdog arming from stream-state and page-ready;
  - service-worker watchdog request-snapshot path.
- Fixed the watchdog resync path:
  - `extension/background.js` now sends `STREAM.REQUEST_SNAPSHOT` through `globalThis.FSBPhantomStreamProtocol.STREAM` when available, with the legacy `ext:request-snapshot` fallback.
  - Static dashboard now handles `ext:request-snapshot` by routing to `requestPreviewResync(...)`.
  - Angular dashboard now handles `ext:request-snapshot` by routing to `requestPreviewResync(...)`.
  - Both dashboards ignore watchdog resync while `frozen-complete` is showing, preserving the final task state.
- Added `ext:request-snapshot` to WebSocket transport diagnostics tracking.
- Updated `tests/dom-stream-perf.test.js` for the protocol-constant `streamTypes.STATE` emission path.

## Verification

Executed successfully:

```bash
node tests/dashboard-stream-recovery-parity.test.js
node tests/dom-stream-perf.test.js
node tests/dashboard-stream-readiness-ping.test.js
node tests/dashboard-stream-pending-intent.test.js
node tests/dashboard-runtime-state.test.js
node tests/phantom-stream-dashboard-parity.test.js
node tests/phantom-stream-sidechannels.test.js
npm --prefix showcase/angular run build
npm run validate:extension
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
git diff --check
```

Focused results:

- `tests/dashboard-stream-recovery-parity.test.js`: 30 PASS / 0 FAIL.
- `tests/dom-stream-perf.test.js`: all assertions passed.
- `tests/dashboard-stream-readiness-ping.test.js`: 16 PASS / 0 FAIL.
- `tests/dashboard-stream-pending-intent.test.js`: 14 PASS / 0 FAIL.
- `tests/dashboard-runtime-state.test.js`: 57 PASS / 0 FAIL.
- `tests/phantom-stream-dashboard-parity.test.js`: 70 PASS / 0 FAIL.
- `tests/phantom-stream-sidechannels.test.js`: 29 PASS / 0 FAIL.
- `npm --prefix showcase/angular run build`: completed successfully; Angular emitted the existing zh locale fallback warnings only.
- `npm run validate:extension`: manifest valid, 260 JS files parsed clean.
- `git diff --check`: clean.

## Boundary

RELAY-04 is complete. Node/source-contract tests now cover the recovery paths Phase 24 can prove without a live browser. Live-browser reconnect evidence remains Phase 25 UAT. Remote-control reverse mapping and debugger ownership parity remain 24-04.
