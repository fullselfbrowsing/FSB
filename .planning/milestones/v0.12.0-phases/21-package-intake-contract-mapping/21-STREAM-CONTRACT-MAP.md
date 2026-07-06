# Phase 21: FSB-to-PhantomStream Stream Contract Map

**Status:** Phase 21 intake map complete.
**Package source:** `@full-self-browsing/phantom-stream@0.1.0`
**Surface evidence:** `.planning/phases/21-package-intake-contract-mapping/21-PACKAGE-SURFACE.md`
**Scope:** This map defines what must survive in Phases 22-25. It does not claim the production migration is complete.

## Ownership Rule

PhantomStream owns generic DOM mirroring mechanics: snapshot, diff, protocol helpers, renderer, relay primitives, WebSocket transport helpers, and optional adapters.

FSB-owned behavior remains in FSB adapters: pairing and task traffic, dashboard state semantics, FSB overlay identity, diagnostics, restricted-tab UX, hash-key rooms, debugger ownership, and release/UAT evidence.

## Contract Matrix

### 1. Snapshot

**Current FSB files:** `extension/content/dom-stream.js`, `extension/ws/ws-client.js`, `showcase/js/dashboard.js`, `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts`

**Current behavior to preserve:**
- `serializeDOM()` emits HTML plus scroll, viewport/page dimensions, `streamSessionId`, `snapshotId`, truncation metadata, and `missingDescendants`.
- Snapshot startup creates a fresh stream session and snapshot identity.
- FSB overlays are excluded from captured HTML.
- Dashboard state resets stale counters and overlay/dialog state when a fresh snapshot replaces the stream.

**Verified PhantomStream surface:** `@full-self-browsing/phantom-stream/capture#createCapture`, `@full-self-browsing/phantom-stream/renderer#createViewer`, `buildSnapshotHtml`, `computeScale`, `@full-self-browsing/phantom-stream/protocol#createStreamSessionId`

**FSB-owned adapter responsibilities:**
- Preserve FSB message types and readiness control around `ext:dom-snapshot`.
- Preserve restricted-tab placeholders and preview state transitions.
- Preserve FSB-specific overlay exclusion and session/task metadata.

**Migration phase:** Phase 22 for capture, Phase 23 for viewer rendering.

**Evidence/tests:** `tests/dom-stream-perf.test.js`, `tests/dashboard-runtime-state.test.js`, `tests/dashboard-stream-readiness-ping.test.js`

### 2. Mutation Diffs

**Current FSB files:** `extension/content/dom-stream.js`, `showcase/js/dashboard.js`, `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts`

**Current behavior to preserve:**
- Mutations are rAF-batched and include `add`, `rm`, `attr`, and `text` style operations keyed by stable node IDs.
- Diffs carry `streamSessionId`, `snapshotId`, and `staleFlushCount`.
- Dashboard applies accepted diffs by `data-fsb-nid`, tracks stale target/parent misses, and requests resync after repeated failure.
- Mutation batch failures are diagnostic, not fatal to the whole dashboard.

**Verified PhantomStream surface:** `@full-self-browsing/phantom-stream/capture#createCapture`, `@full-self-browsing/phantom-stream/renderer#applyMutations`, `@full-self-browsing/phantom-stream/protocol#DIFF_OP`

**FSB-owned adapter responsibilities:**
- Preserve FSB's stale-mutation diagnostics and resync triggers.
- Keep existing dashboard message acceptance gate for stale stream/session identities.
- Keep existing source-contract tests until PhantomStream-backed tests replace implementation-body assertions.

**Migration phase:** Phase 22 for capture diffs, Phase 23 for viewer diff application.

**Evidence/tests:** `tests/dom-stream-perf.test.js`, `tests/dashboard-runtime-state.test.js`

### 3. Scroll

**Current FSB files:** `extension/content/dom-stream.js`, `showcase/js/dashboard.js`, `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts`

**Current behavior to preserve:**
- Content script sends scroll side-channel payloads with `scrollX`, `scrollY`, `streamSessionId`, and `snapshotId`.
- Dashboard maintains `lastPreviewScroll` and reapplies scroll position after snapshots/mutations.
- Remote-control scroll from dashboard is throttled around 16ms and maps through the stream target path.

**Verified PhantomStream surface:** `@full-self-browsing/phantom-stream/capture#createCapture`, `@full-self-browsing/phantom-stream/renderer#mapHostPointToViewport`, `mapRectToHost`

**FSB-owned adapter responsibilities:**
- Preserve dashboard-side `dash:remote-scroll` message shape and FSB's CDP/direct input routing.
- Preserve scroll side-channel message routing and stale identity rejection.

**Migration phase:** Phase 22 for source scroll side-channel, Phase 23/24 for viewer and reverse remote-control handling.

**Evidence/tests:** `tests/dashboard-runtime-state.test.js`, `tests/remote-control-handlers.test.js`

### 4. Overlays

**Current FSB files:** `extension/content/dom-stream.js`, `showcase/js/dashboard.js`, `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts`, `extension/background.js`

**Current behavior to preserve:**
- Capture excludes DOM nodes marked `data-fsb-overlay`.
- Overlay side-channel emits progress/action glow/client identity/final result data.
- Static and Angular dashboards render live and frozen client badges and progress overlay state.
- Background relays `ext:dom-overlay` payloads without turning overlay identity into task traffic.

**Verified PhantomStream surface:** `@full-self-browsing/phantom-stream/renderer#createOverlays`, `OVERLAY_CSS`

**FSB-owned adapter responsibilities:**
- Keep FSB overlay identity, client label, session token, result metadata, and lifecycle semantics.
- Keep FSB overlay exclusion because these overlays are product-specific.

**Migration phase:** Phase 22 for capture exclusion/side-channel, Phase 23 for dashboard rendering.

**Evidence/tests:** `tests/dashboard-runtime-state.test.js`, `tests/overlay-content-audit.test.js`, `tests/test-overlay-state.js`

### 5. Dialogs

**Current FSB files:** `extension/content/dom-stream.js`, `showcase/js/dashboard.js`, `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts`

**Current behavior to preserve:**
- Content script injects an interceptor for `alert`, `confirm`, and `prompt`.
- Dialog open/closed events are relayed as side-channel messages with stream identity.
- Dashboards render and clear dialog overlay cards without corrupting the mirrored DOM.

**Verified PhantomStream surface:** `@full-self-browsing/phantom-stream/capture#createCapture`, `@full-self-browsing/phantom-stream/renderer#createOverlays`

**FSB-owned adapter responsibilities:**
- Preserve FSB's dialog message shape until dashboards are migrated.
- Preserve rate-limited logging/redaction behavior for send failures.

**Migration phase:** Phase 22 for content relay, Phase 23 for viewer rendering.

**Evidence/tests:** `tests/dashboard-runtime-state.test.js`, dialog source-shape checks in `extension/content/dom-stream.js`

### 6. Stale-Session Rejection

**Current FSB files:** `extension/content/dom-stream.js`, `showcase/js/dashboard.js`, `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts`

**Current behavior to preserve:**
- Every snapshot/diff/side-channel carries `streamSessionId` and `snapshotId`.
- Dashboards reject messages whose stream or snapshot identity no longer matches active preview identity.
- Stale mutation parent/target misses increment counters and trigger resync after thresholds.

**Verified PhantomStream surface:** `@full-self-browsing/phantom-stream/protocol#isCurrentStream`, `createStreamSessionId`

**FSB-owned adapter responsibilities:**
- Preserve dashboard diagnostic event names and counters.
- Keep existing `preview-stream-replaced`, `stale-preview-message-ignored`, and resync semantics visible to dashboard diagnostics.

**Migration phase:** Phase 23 for viewer stale rejection; Phase 24 for protocol alignment.

**Evidence/tests:** `tests/dashboard-runtime-state.test.js`, `tests/agent-sunset-showcase.test.js`

### 7. Compression

**Current FSB files:** `extension/ws/ws-client.js`, `showcase/js/dashboard.js`, `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts`, `tests/ws-client-decompress.test.js`

**Current behavior to preserve:**
- Large stream payloads use stateless self-identifying `_lz` envelope `{ _lz: true, d }`.
- Inbound and outbound paths decompress/compress symmetrically.
- Malformed `_lz` envelopes produce clear diagnostic records rather than crashing.

**Verified PhantomStream surface:** `@full-self-browsing/phantom-stream/protocol#encodeEnvelope`, `decodeEnvelope`, `isCompressedEnvelope`, `@full-self-browsing/phantom-stream/transport/websocket#encodeWireMessage`, `decodeWireMessage`

**FSB-owned adapter responsibilities:**
- Keep compatibility with current dashboard decompression until both static and Angular dashboards share the PhantomStream protocol wrapper.
- Preserve non-stream task/status WebSocket messages.

**Migration phase:** Phase 24.

**Evidence/tests:** `tests/ws-client-decompress.test.js`, `tests/agent-sunset-showcase.test.js`

### 8. Relay

**Current FSB files:** `showcase/server/src/ws/handler.js`, `tests/server-ws-backpressure.test.js`

**Current behavior to preserve:**
- Dashboard and extension join hash-key rooms with separate role sets.
- Relay forwards raw stream frames to the opposite side of the room.
- Diagnostics record connection, room-state, missing-room, delivery, and backpressure-drop events.
- Backpressure limit is 16 MiB per client buffer; wedged targets are dropped without blocking healthy clients.
- Per-message stream cap remains compatible with the 1 MiB package relay frame limit.

**Verified PhantomStream surface:** `@full-self-browsing/phantom-stream/relay#createRelay`, `createWebSocketRelayBackend`, `checkRelayFrameLimit`, `classifyRelayFrame`, `BACKPRESSURE_BUFFER_LIMIT_BYTES`

**FSB-owned adapter responsibilities:**
- Preserve hash-key room routing and dashboard/extension role naming.
- Preserve FSB diagnostics and drop counters even if relay primitives are package-backed.
- Preserve existing task/status traffic sharing the WebSocket.

**Migration phase:** Phase 24.

**Evidence/tests:** `tests/server-ws-backpressure.test.js`, server handler source-shape tests.

### 9. Recovery

**Current FSB files:** `extension/ws/ws-client.js`, `extension/background.js`, `showcase/js/dashboard.js`, `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts`

**Current behavior to preserve:**
- `dash:dom-stream-start` can be parked until content script `pingDomStream` succeeds.
- `domStreamReady` re-arms parked stream-start intent.
- Content-side self-watchdog and SW `fsb-domstream-watchdog` alarm recover stranded streams by forcing flush or requesting a fresh snapshot.
- Dashboard reconnect/resync sends `dash:request-status` and `dash:dom-stream-start`, then arms preview recovery watchdogs.
- Restricted tabs remain explicit `restricted`/`not-ready` states.

**Verified PhantomStream surface:** `@full-self-browsing/phantom-stream/adapters/extension#createExtensionAdapter`, `createExtensionContentBridge`, `PHANTOMSTREAM_WATCHDOG_ALARM`, `@full-self-browsing/phantom-stream/protocol#WATCHDOG_TICK_MS`

**FSB-owned adapter responsibilities:**
- Preserve parked intent semantics and FSB background alarm ownership.
- Preserve service-worker wake/reconnect behavior.
- Preserve dashboard recovery copy and restricted-tab placeholder UX.

**Migration phase:** Phase 22 for content readiness; Phase 24 for recovery/protocol integration.

**Evidence/tests:** `tests/dashboard-stream-readiness-ping.test.js`, `tests/dashboard-stream-pending-intent.test.js`, `tests/dashboard-runtime-state.test.js`

### 10. Remote Control

**Current FSB files:** `extension/ws/ws-client.js`, `extension/background.js`, `showcase/js/dashboard.js`, `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts`, `tests/remote-control-handlers.test.js`

**Current behavior to preserve:**
- Dashboard sends `dash:remote-control-start`, `dash:remote-control-stop`, click, key, type, and scroll commands.
- Extension gates input on `_remoteControlActive`, validates finite coordinates, and decomposes modifier bitmasks.
- Input dispatch uses FSB CDP/direct primitives (`cdpClickAt`, `cdpInsertText`, `cdpScrollAt`, `Input.dispatchKeyEvent`) with debugger attach/detach recovery.
- Authoritative state flows back as `ext:remote-control-state`, including ready, user-stop, retarget-required, debugger-blocked, ownership diagnostics, and capture-active state.
- Dashboards force-disable remote control on incompatible preview states.

**Verified PhantomStream surface:** `@full-self-browsing/phantom-stream/protocol#REMOTE_CONTROL`, `REMOTE_CONTROL_STATE`, `validateRemoteControlMessage`, `createRemoteControlStateEvent`, `summarizeRemoteControlAction`, `@full-self-browsing/phantom-stream/renderer#mapHostPointToViewport`

**FSB-owned adapter responsibilities:**
- Preserve FSB debugger ownership semantics, external-debugger diagnostics, tab retargeting, and CDP cleanup.
- Preserve dashboard user-visible remote-control states and disable/retarget behavior.
- Do not change public MCP tool schemas.

**Migration phase:** Phase 24.

**Evidence/tests:** `tests/remote-control-handlers.test.js`, `tests/dashboard-runtime-state.test.js`, `tests/remote-control-rebrand.test.js`, `tests/sync-tab-runtime.test.js`

## Later-Phase Gate

Phases 22-24 may proceed because the package source and export surface are verified. They must still prove behavior against this contract map before Phase 25 removes duplicate FSB-owned generic stream engines.
