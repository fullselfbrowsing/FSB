---
phase: 24-transport-relay-remote-control-integration
status: complete
validated: 2026-06-17
---

# Phase 24 Validation

Phase 24 automated validation is complete for transport, relay, recovery, and remote-control protocol integration. The phase is closed with browser-only remote-control UAT explicitly deferred to Phase 25.

## Automated Evidence

- Protocol/envelope bridge: `tests/phantom-stream-protocol-envelope.test.js` and `tests/ws-client-decompress.test.js`.
- Relay compatibility: `tests/server-ws-phantomstream-relay-compat.test.js` and `tests/server-ws-backpressure.test.js`.
- Recovery parity: `tests/dashboard-stream-recovery-parity.test.js`, `tests/dashboard-stream-readiness-ping.test.js`, and `tests/dashboard-stream-pending-intent.test.js`.
- Remote-control parity: `tests/phantom-stream-remote-control-parity.test.js`, `tests/remote-control-handlers.test.js`, `tests/sync-tab-runtime.test.js`, and `tests/dashboard-runtime-state.test.js`.
- Cross-surface viewer/state parity: `tests/phantom-stream-dashboard-parity.test.js`, `tests/phantom-stream-sidechannels.test.js`, and `tests/phantom-stream-exports.test.js`.
- Extension parse/manifest gate: `npm run validate:extension`.
- Diff hygiene: `git diff --check`.

## Browser-Only UAT Deferred To Phase 25

These items require a real Chrome extension session and are not marked as passed by Phase 24:

- Click/type/scroll through the live dashboard preview against a normal web page.
- Navigation while remote control is enabled, confirming `retarget-required` and re-arm behavior.
- External debugger contention, confirming `debugger-blocked` and `external-debugger` ownership UI.
- Stale stream/session frame rejection during live reconnect or tab switch.
- Restricted-tab/no-tab transitions in the live dashboard UI.

Phase 25 must record these as explicit browser UAT results before the v0.12.0 milestone closes.
