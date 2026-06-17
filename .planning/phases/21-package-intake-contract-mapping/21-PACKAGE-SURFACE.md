# Phase 21: PhantomStream Package Surface

**Package:** `@full-self-browsing/phantom-stream@0.1.0`
**Verified by:** `tests/phantom-stream-exports.test.js`
**Status:** Unblocked for planning Phases 22-24 against the import paths below.
**Boundary:** This artifact proves installed package exports and import-time feasibility. It does not prove FSB behavioral parity or browser UAT.

## Source Gate

- Approved source: npm package `@full-self-browsing/phantom-stream@0.1.0`.
- Rejected source: stale package name `@fullselfbrowsing/phantom-stream` returned npm `E404` on 2026-06-17.
- Pin record: `.planning/PHANTOMSTREAM-PIN.md`.
- Package pin smoke: `tests/phantom-stream-public-package.test.js`.

## Verified Import Paths

| Import Path | Verified Symbols | Owning Migration Phase | Caveat |
|-------------|------------------|-------------------------|--------|
| `@full-self-browsing/phantom-stream` | `createCapture`, `createViewer`, `createRelay`, `createWebSocketRelayBackend`, `createWebSocketTransport`, `encodeEnvelope`, `decodeEnvelope`, `applyMutations`, `validateRemoteControlMessage` | Shared reference for Phases 22-24 | Prefer subpath imports in production adapters to keep ownership clear. |
| `@full-self-browsing/phantom-stream/protocol` | `STREAM`, `CONTROL`, `REMOTE_CONTROL`, `REMOTE_CONTROL_STATE`, `NID_ATTR`, `RELAY_PER_MESSAGE_LIMIT_BYTES`, `createStreamSessionId`, `encodeEnvelope`, `decodeEnvelope`, `isCompressedEnvelope`, `isCurrentStream`, `validateRemoteControlMessage`, `createRemoteControlStateEvent` | Phase 24 | Protocol helpers are verified, but FSB task/status WebSocket traffic remains FSB-owned. |
| `@full-self-browsing/phantom-stream/capture` | `createCapture` | Phase 22 | This proves importability only; Phase 22 must verify FSB pause/resume/stop, `pingDomStream`, overlay exclusion, dialogs, masking, and watchdog behavior through the adapter. |
| `@full-self-browsing/phantom-stream/renderer` | `createViewer`, `applyMutations`, `buildSnapshotHtml`, `createOverlays`, `computeScale`, `mapHostPointToViewport`, `mapRectToHost`, `OVERLAY_CSS` | Phase 23 | Static and Angular dashboards must share this wrapper or contract tests strong enough to prevent drift. |
| `@full-self-browsing/phantom-stream/relay` | `createRelay`, `createWebSocketRelayBackend`, `checkRelayFrameLimit`, `classifyRelayFrame`, `BACKPRESSURE_BUFFER_LIMIT_BYTES` | Phase 24 | FSB hash-key room routing, dashboard/extension roles, message cap diagnostics, and backpressure drop behavior must remain preserved. |
| `@full-self-browsing/phantom-stream/transport/websocket` | `createWebSocketTransport`, `encodeWireMessage`, `decodeWireMessage` | Phase 24 | Transport helpers must not alter non-stream dashboard task/status messages. |
| `@full-self-browsing/phantom-stream/adapters/extension` | `createExtensionAdapter`, `createExtensionContentBridge`, `PHANTOMSTREAM_SESSION_KEY`, `PHANTOMSTREAM_WATCHDOG_ALARM` | Phase 22 and Phase 24 | Import-time feasible without Chrome globals; runtime MV3 behavior still needs content-script/background tests. |
| `@full-self-browsing/phantom-stream/adapters/playwright` | `createPlaywrightAdapter`, `getPlaywrightInjectSource` | Phase 25 parity/UAT support | Useful for differential parity harnesses; not a production Chrome extension dependency by itself. |
| `@full-self-browsing/phantom-stream/adapters/bookmarklet` | `createBookmarkletSource`, `createBookmarkletLoaderSource`, `BOOKMARKLET_ERROR_EVENT` | Optional future tooling | Verified but not required for v0.12.0 production migration. |

## ESM And MV3 Feasibility

`tests/phantom-stream-exports.test.js` dynamically imports capture, renderer, WebSocket transport, and extension adapter surfaces in Node. These imports do not throw at module evaluation time due to missing CommonJS, browser, or Chrome extension globals.

Phase 22 must still prove the selected extension integration path works in FSB's build/content-script environment before replacing `extension/content/dom-stream.js`.

## Blocker Policy

Later phases may use only the verified import paths listed above. If a later plan needs an unlisted PhantomStream subpath or symbol, it must first extend `tests/phantom-stream-exports.test.js` and this surface map.

Current blocker status: **none**. Package exports are adequate to plan Phase 22 capture migration, Phase 23 renderer migration, and Phase 24 protocol/relay/transport integration.

## Verification

```bash
node tests/phantom-stream-public-package.test.js
node tests/phantom-stream-exports.test.js
```
