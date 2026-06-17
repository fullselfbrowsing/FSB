---
phase: 24-transport-relay-remote-control-integration
plan: "02"
subsystem: relay-compatibility-adapter
tags: [phantomstream, relay, websocket, backpressure, compression]

provides:
  - FSB relay compatibility adapter aligned with PhantomStream relay classifiers and limits
  - Relay-side oversized-frame diagnostics and 1 MiB cap enforcement
  - Relay compression-envelope classification parity
affects:
  - showcase/server/server.js
  - showcase/server/src/ws/handler.js
  - showcase/server/src/ws/phantomstream-relay-compat.js
  - package.json
  - tests/server-ws-backpressure.test.js
  - tests/server-ws-phantomstream-relay-compat.test.js
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md

requirements_completed: [RELAY-02, RELAY-03]
requirements_remaining: [RELAY-04, CTRL-01, CTRL-02, CTRL-03]

completed: 2026-06-17
---

# Phase 24 Plan 02: Relay Compatibility Summary

Plan 24-02 is complete. FSB keeps its product-specific relay shape, but the relay now uses a documented compatibility adapter for PhantomStream frame classification, relay limits, and compression-envelope diagnostics.

## Accomplishments

- Added `showcase/server/src/ws/phantomstream-relay-compat.js`, a CommonJS adapter that mirrors the installed PhantomStream relay classifier/limit behavior:
  - `RELAY_PER_MESSAGE_LIMIT_BYTES`;
  - `BACKPRESSURE_BUFFER_LIMIT_BYTES`;
  - `classifyRelayFrame(...)`;
  - `checkRelayFrameLimit(...)`;
  - FSB role mapping from `extension`/`dashboard` to PhantomStream `source`/`viewer`.
- Preserved FSB relay ownership of:
  - hash-key rooms;
  - extension/dashboard room sides;
  - dashboard online/offline `ext:status` broadcasts;
  - agent/task/status traffic;
  - existing room diagnostics shape.
- Added relay-side frame limit enforcement before parsing/relaying application messages.
- Added `message-too-large` diagnostics for oversized frames, including parsed type, compressed flag, byte size, cap, room prefix, and role.
- Set the WebSocket server `maxPayload` to `RELAY_PER_MESSAGE_LIMIT_BYTES + 1024`, matching the upstream relay backend guard.
- Kept 16 MiB backpressure drop behavior and counter semantics intact.
- Added `tests/server-ws-phantomstream-relay-compat.test.js` and wired it into `npm test`.
- Extended `tests/server-ws-backpressure.test.js` to assert relay cap/classifier exports.

## Verification

Executed successfully:

```bash
node tests/server-ws-phantomstream-relay-compat.test.js
node tests/server-ws-backpressure.test.js
node tests/phantom-stream-protocol-envelope.test.js
node tests/phantom-stream-exports.test.js
node tests/agent-sunset-showcase.test.js
node tests/showcase-build-smoke.test.js
npm run validate:extension
node --check showcase/server/src/ws/phantomstream-relay-compat.js
node --check showcase/server/src/ws/handler.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
git diff --check
```

Focused results:

- `tests/server-ws-phantomstream-relay-compat.test.js`: 22 PASS / 0 FAIL.
- `tests/server-ws-backpressure.test.js`: 25 PASS / 0 FAIL.
- `tests/phantom-stream-protocol-envelope.test.js`: 36 PASS / 0 FAIL.
- `tests/phantom-stream-exports.test.js`: 121 PASS / 0 FAIL.
- `tests/agent-sunset-showcase.test.js`: all checks passed, including static/Angular `_lz` decompression presence.
- `tests/showcase-build-smoke.test.js`: 124 PASS / 0 FAIL.
- `npm run validate:extension`: manifest valid, 260 JS files parsed clean.
- `git diff --check`: clean.

## Boundary

RELAY-02 and RELAY-03 are complete. Full package relay replacement was intentionally not used because the upstream relay backend owns admission with `room` plus `source`/`viewer` roles, while FSB must preserve `key` plus `extension`/`dashboard` pairing, status broadcasts, and task/status relay traffic. Recovery parity remains 24-03, and remote-control reverse mapping remains 24-04.
