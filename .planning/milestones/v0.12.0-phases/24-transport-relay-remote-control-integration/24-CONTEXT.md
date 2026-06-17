---
phase: 24-transport-relay-remote-control-integration
title: Transport, Relay & Remote Control Integration
status: planned
requirements: [RELAY-01, RELAY-02, RELAY-03, RELAY-04, CTRL-01, CTRL-02, CTRL-03]
depends_on:
  - .planning/phases/23-dashboard-renderer-migration/23-VALIDATION.md
created: 2026-06-17
---

# Phase 24 Context: Transport, Relay & Remote Control Integration

## Goal

Align stream transport, relay behavior, recovery, and reverse remote-control paths with PhantomStream-compatible protocol helpers while preserving FSB's pairing, dashboard task traffic, hash-key rooms, and debugger ownership semantics.

## Starting Point

Phase 23 completed the dashboard renderer migration:

- Static and Angular dashboards both render live preview frames through the shared `FSBPhantomStreamViewer` wrapper.
- FSB preview state, frozen states, diagnostics, badges, overlays, dialogs, and resync UI remain host-owned.
- Relay/protocol alignment, WebSocket envelope ownership, recovery parity, and remote-control reverse mapping were explicitly left for Phase 24.

Current transport shape:

- `extension/ws/ws-client.js` owns dashboard relay connection, task/status traffic, stream control handling, stream-state emission, `_lz` compression/decompression, and remote-control dispatch.
- `extension/background.js` forwards content-side stream frames to `fsbWebSocket.send(...)`.
- `showcase/server/src/ws/handler.js` owns hash-key rooms, roles, 1 MiB message cap, and 16 MiB backpressure drop behavior.
- Static and Angular dashboards still send and receive existing FSB message types over the relay.

## PhantomStream Surfaces

Installed package: `@full-self-browsing/phantom-stream@0.1.0`.

Relevant exports verified in Phase 21:

- `@full-self-browsing/phantom-stream/protocol`
  - `STREAM`
  - `CONTROL`
  - `REMOTE_CONTROL`
  - `REMOTE_CONTROL_STATE`
  - `encodeEnvelope(...)`
  - `decodeEnvelope(...)`
  - `isCompressedEnvelope(...)`
  - `isCurrentStream(...)`
  - `validateRemoteControlMessage(...)`
  - `createRemoteControlStateEvent(...)`
- `@full-self-browsing/phantom-stream/relay`
  - `createRelay(...)`
  - `createWebSocketRelayBackend(...)`
  - `checkRelayFrameLimit(...)`
  - `classifyRelayFrame(...)`
  - `BACKPRESSURE_BUFFER_LIMIT_BYTES`
- `@full-self-browsing/phantom-stream/transport/websocket`
  - `createWebSocketTransport(...)`
  - `encodeWireMessage(...)`
  - `decodeWireMessage(...)`

## Decisions

- **RELAY-D-01:** Keep FSB dashboard task/status traffic on the existing relay message envelope. PhantomStream protocol helpers are introduced for stream/control framing without changing task lifecycle semantics.
- **RELAY-D-02:** The classic MV3 service worker cannot import ESM directly. Any protocol helper used by `ws-client.js` must be bundled into a browser-global bridge before `ws-client.js` loads.
- **RELAY-D-03:** Preserve the existing stateless `{ _lz: true, d }` contract and only send compressed envelopes when the full encoded wire string is smaller than raw JSON.
- **RELAY-D-04:** Server relay adoption must preserve hash-key room routing, dashboard/extension roles, message caps, and diagnostics before package-backed primitives are accepted.
- **CTRL-D-01:** Remote-control package protocol adoption must be additive and validated. Existing CDP input dispatch and user-visible ownership state stay authoritative until reverse mapping parity is proven.

## Risks

- PhantomStream `encodeEnvelope(...)` compresses over threshold even if the wrapper grows the frame; FSB must keep its size-saving guard.
- `ws-client.js` is loaded by `importScripts`, so a direct package import would break service-worker startup.
- Server relay behavior is product-critical because it also carries non-stream task/status traffic.
- Remote-control mapping spans dashboard viewport coordinates, PhantomStream renderer mapping, content/session freshness, and Chrome debugger ownership. It should not be folded into envelope work.

## Success Boundary

Phase 24 is complete when:

- Extension/dashboard stream envelopes use PhantomStream protocol helpers without changing non-stream task traffic.
- Server relay behavior is package-backed or explicitly documented as a compatibility adapter with matching limits/diagnostics.
- Recovery paths remain green across reconnect, service-worker wake, late content readiness, and parked stream-start re-arm.
- Remote-control click/type/scroll remains safe and authoritative across stale frames, stream-tab changes, navigation, and debugger contention.

Live browser UAT remains Phase 25 work.
