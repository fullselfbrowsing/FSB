---
phase: 24-transport-relay-remote-control-integration
plan: "01"
subsystem: websocket-protocol-envelope-adapter
tags: [phantomstream, protocol, websocket, envelope, compression]

provides:
  - Classic service-worker PhantomStream protocol bridge
  - Package-backed WebSocket envelope encode/decode adapter
  - Protocol constant seam for stream control/state messages
affects:
  - esbuild.config.js
  - extension/background.js
  - extension/ws/phantom-stream-protocol-entry.js
  - extension/ws/phantom-stream-protocol.js
  - extension/ws/ws-client.js
  - package.json
  - tests/phantom-stream-protocol-envelope.test.js
  - tests/ws-client-decompress.test.js
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md

requirements_completed: [RELAY-01]
requirements_remaining: [RELAY-02, RELAY-03, RELAY-04, CTRL-01, CTRL-02, CTRL-03]

completed: 2026-06-17
---

# Phase 24 Plan 01: Protocol/Envelope Adapter Summary

Plan 24-01 is complete. The extension WebSocket client now has a PhantomStream protocol/envelope seam that works in the classic MV3 service-worker runtime and preserves FSB's existing dashboard task/status envelope behavior.

## Accomplishments

- Added `extension/ws/phantom-stream-protocol-entry.js`, bundled by esbuild to `extension/ws/phantom-stream-protocol.js`.
- Exposed `globalThis.FSBPhantomStreamProtocol` with package protocol constants and helpers:
  - `STREAM`;
  - `CONTROL`;
  - `REMOTE_CONTROL`;
  - `encodeEnvelope(...)`;
  - `decodeEnvelope(...)`;
  - `isCompressedEnvelope(...)`;
  - remote-control validation/state helper exports for later Phase 24 plans.
- Loaded the protocol bridge after `lib/lz-string.min.js` and before `ws/ws-client.js`.
- Refactored `ws-client.js` to:
  - resolve stream/control constants from the protocol bridge with local fallbacks;
  - decode inbound frames through `decodeEnvelope(...)` when available;
  - encode outbound frames through `encodeEnvelope(...)` when available;
  - keep the self-identifying `_lz` frame format;
  - send compressed envelopes only when the full encoded wire string is smaller than raw JSON;
  - record explicit decode diagnostics for malformed JSON, missing decompressor, decompression failure, and invalid inner JSON.
- Added `tests/phantom-stream-protocol-envelope.test.js` and wired it into `npm test`.
- Updated `tests/ws-client-decompress.test.js` for the helper-backed envelope path.

## Verification

Executed successfully:

```bash
npm run build
node tests/phantom-stream-protocol-envelope.test.js
node tests/ws-client-decompress.test.js
node tests/phantom-stream-exports.test.js
node tests/dashboard-stream-readiness-ping.test.js
node tests/dashboard-stream-pending-intent.test.js
node tests/server-ws-backpressure.test.js
node tests/phantom-stream-content-bundle.test.js
node tests/dashboard-runtime-state.test.js
npm run validate:extension
node --check extension/ws/ws-client.js
node --check extension/ws/phantom-stream-protocol-entry.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
git diff --check
```

Focused results:

- `tests/phantom-stream-protocol-envelope.test.js`: 36 PASS / 0 FAIL.
- `tests/ws-client-decompress.test.js`: all assertions passed.
- `tests/phantom-stream-exports.test.js`: 121 PASS / 0 FAIL.
- `tests/dashboard-stream-readiness-ping.test.js`: 16 PASS / 0 FAIL.
- `tests/dashboard-stream-pending-intent.test.js`: 14 PASS / 0 FAIL.
- `tests/server-ws-backpressure.test.js`: 22 PASS / 0 FAIL.
- `tests/phantom-stream-content-bundle.test.js`: 11 PASS / 0 FAIL.
- `tests/dashboard-runtime-state.test.js`: 57 PASS / 0 FAIL.
- `npm run validate:extension`: manifest valid, 260 JS files parsed clean.
- `git diff --check`: clean.

## Boundary

RELAY-01 is complete. RELAY-03 has extension envelope-level evidence, but remains open until Phase 24 proves dashboard/relay compression classification and diagnostics across the full transport path. Relay package adoption, recovery parity, and remote-control reverse mapping remain 24-02 through 24-04.
