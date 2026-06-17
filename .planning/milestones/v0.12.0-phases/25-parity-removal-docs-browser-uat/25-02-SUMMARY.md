---
phase: 25-parity-removal-docs-browser-uat
plan: "02"
subsystem: stream-parity-tests
tags: [phantomstream, parity, security, regression-tests]

provides:
  - Differential PhantomStream parity guard
  - Package-backed source boundary assertions
  - Protocol, renderer, relay, compression, and sanitizer coverage
affects:
  - tests/phantom-stream-differential-parity.test.js
  - package.json
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md

requirements_completed: [PARITY-01, PARITY-02]
requirements_remaining: [PARITY-04, PARITY-05]

completed: 2026-06-17
---

# Phase 25 Plan 02: Differential Parity Tests Summary

Plan 25-02 is complete. The PhantomStream migration now has a deterministic Node regression guard that proves package-backed behavior across the adapter, renderer, protocol, relay, compression, stale-message, and sanitizer boundaries.

## Accomplishments

- Added `tests/phantom-stream-differential-parity.test.js`.
- Wired the new parity guard into the root `npm test` chain.
- Added source-boundary assertions that:
  - `dom-stream.js` consumes `window.FSBPhantomStreamCapture`;
  - local `serializeDOM`, local `MutationObserver`, legacy `stampLegacyNodeIds`, and `data-fsb-nid` stamping are absent;
  - static and Angular dashboards use `bridge.createDashboardViewer`;
  - dashboards no longer assemble mirrored `previewIframe.srcdoc` themselves.
- Added package renderer checks for snapshot CSP injection, stylesheet filtering, shell event-handler removal, dangerous CSS scrubbing, ADD/ATTR/TEXT/VALUE/REMOVE mutation application, identity sidecar indexing, stale mutation resync thresholds, and sanitizer counters.
- Added protocol/relay checks for stream identity rejection, compressed `_lz` encode/decode round trips, compressed-envelope classification, plain snapshot classification, and relay frame-cap rejection.

## Verification

Executed successfully:

```bash
node tests/phantom-stream-differential-parity.test.js
node tests/phantom-stream-capture-adapter.test.js
node tests/phantom-stream-security-masking.test.js
node tests/phantom-stream-dashboard-parity.test.js
node tests/phantom-stream-dashboard-sidechannels.test.js
node tests/server-ws-phantomstream-relay-compat.test.js
node tests/phantom-stream-protocol-envelope.test.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
npm run validate:extension
git diff --check
```

Focused results:

- `tests/phantom-stream-differential-parity.test.js`: 30 PASS / 0 FAIL.
- `tests/phantom-stream-capture-adapter.test.js`: 23 PASS / 0 FAIL.
- `tests/phantom-stream-security-masking.test.js`: 44 PASS / 0 FAIL.
- `tests/phantom-stream-dashboard-parity.test.js`: 70 PASS / 0 FAIL.
- `tests/phantom-stream-dashboard-sidechannels.test.js`: 131 PASS / 0 FAIL.
- `tests/server-ws-phantomstream-relay-compat.test.js`: 22 PASS / 0 FAIL.
- `tests/phantom-stream-protocol-envelope.test.js`: 36 PASS / 0 FAIL.
- `package.json`: parsed successfully.
- `npm run validate:extension`: manifest valid, 260 JS files parsed clean.
- `git diff --check`: clean.

## Boundary

PARITY-01 and PARITY-02 are complete for automated, deterministic coverage. Live browser fidelity, navigation/reconnect behavior, restricted-tab handling, large-page behavior, masking in Chrome, and remote-control usability remain Phase 25 Plan 04 browser UAT debt.
