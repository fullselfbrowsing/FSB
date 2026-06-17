# Requirements: FSB v0.12.0 PhantomStream Package Migration

**Defined:** 2026-06-17
**Core Value:** Reliable single-attempt execution -- the AI decides correctly; the mechanics execute precisely. The dashboard preview must preserve that value while delegating DOM mirroring mechanics to the extracted PhantomStream package instead of FSB-owned duplicate stream code.

## v1 Requirements

Requirements for milestone v0.12.0. Each maps to exactly one roadmap phase (see Traceability). Research basis: `.planning/research/PHANTOMSTREAM-PACKAGE.md` plus upstream `fullselfbrowsing/PhantomStream`.

### PKG -- Package intake, pinning, and source-of-truth

- [x] **PKG-01**: FSB can install PhantomStream from an approved source with an exact version or immutable reference, lockfile integrity/provenance recorded, and no floating dependency.
- [x] **PKG-02**: The migration records the upstream package surface actually available to FSB (`protocol`, `capture`, `renderer`, and any relay/transport/adapters) before production code imports it.
- [x] **PKG-03**: The stale `@fullselfbrowsing/phantom-stream` source is rejected, and FSB uses the published `@full-self-browsing/phantom-stream@0.1.0` package unless a later smoke test blocks it.
- [x] **PKG-04**: Existing FSB stream contracts are mapped to PhantomStream equivalents before replacement: snapshot, mutation diffs, scroll, overlays, dialogs, stream-state recovery, stale-message rejection, compression, relay, and remote-control reverse path.

### CAP -- Capture-side replacement

- [x] **CAP-01**: `extension/content/dom-stream.js` no longer owns bespoke snapshot and MutationObserver diff logic; it becomes a thin adapter around PhantomStream capture primitives.
- [x] **CAP-02**: Capture preserves FSB behavior for stable node identity, curated computed-style capture, budgeted snapshots, rAF-batched mutations, scroll side channel, dialog mirroring, automation overlay side channel, session stamping, and stale flush diagnostics.
- [x] **CAP-03**: Capture continues to respect FSB overlay exclusion, reduced page impact, content-script reinjection, pause/resume/stop semantics, and `pingDomStream` readiness probing.
- [x] **CAP-04**: Sensitive content handling is explicitly configured: password masking, dangerous URL/script stripping, event-handler removal, `srcdoc`/embed handling, and any custom masking hooks required by FSB.

### VIEW -- Dashboard renderer replacement

- [x] **VIEW-01**: The static showcase dashboard viewer delegates snapshot rendering and diff application to PhantomStream renderer primitives while preserving FSB preview states and controls.
- [x] **VIEW-02**: The Angular dashboard viewer delegates to the same PhantomStream renderer behavior or a shared wrapper, eliminating drift between static and Angular diff application logic.
- [x] **VIEW-03**: Viewer behavior remains unchanged for iframe sandboxing, scaling/layout modes, stale stream/session rejection, resync on divergence, frozen-disconnect/frozen-complete states, restricted-page placeholders, and diagnostic tooltip counters.
- [x] **VIEW-04**: Side-channel rendering remains intact: scroll position, action glow, progress badge/client identity, native dialogs, remote-control affordances, and final/frozen overlay state.

### RELAY -- Transport and relay integration

- [x] **RELAY-01**: `extension/ws/ws-client.js` uses PhantomStream-compatible protocol/envelope helpers for stream payloads without regressing existing dashboard WebSocket task/status traffic.
- [x] **RELAY-02**: `showcase/server/src/ws/handler.js` either adopts PhantomStream relay primitives or keeps a documented compatibility adapter, preserving hash-key room routing, dashboard/extension roles, 1 MiB message cap, and 16 MiB backpressure drop behavior.
- [x] **RELAY-03**: Compression remains stateless and self-identifying (`{ _lz: true, d }`) for large stream payloads, with symmetric decompression and clear diagnostics on malformed or unsupported frames.
- [x] **RELAY-04**: Stream recovery still works across dashboard reconnect, extension reconnect, service-worker wake, content-script late readiness, and parked `dash:dom-stream-start` intent re-arm.

### CTRL -- Remote control and reverse mapping

- [ ] **CTRL-01**: Dashboard click/type/scroll remote-control events map through PhantomStream-compatible target metadata while preserving FSB's CDP/input behavior and ownership/debugger-state reporting.
- [ ] **CTRL-02**: Remote-control retargeting remains safe across stream-tab changes, page navigation, reconnects, and stale frames.
- [ ] **CTRL-03**: Remote-control user-visible states remain authoritative: attached, blocked by external debugger, retarget-required, user-stop, and ownership diagnostics.

### PARITY -- Removal, tests, docs, and release gates

- [ ] **PARITY-01**: All existing stream-focused tests are updated to assert package-backed behavior rather than in-house implementation details, while preserving current behavioral coverage.
- [ ] **PARITY-02**: A differential parity test compares FSB's current in-house stream behavior against PhantomStream for representative snapshots, mutations, side channels, stale messages, and security sanitization.
- [ ] **PARITY-03**: In-house stream logic that is now owned by PhantomStream is removed or reduced to adapters, with no duplicate capture/renderer/relay engines left behind.
- [ ] **PARITY-04**: Documentation names PhantomStream as the stream implementation, records the package pin/source/provenance, and explains any FSB-specific adapters that remain.
- [ ] **PARITY-05**: Milestone close requires automated gates plus explicit browser UAT for dashboard live preview, remote control, navigation/reconnect recovery, restricted tabs, large pages, and security masking.

## Future Requirements (deferred -- tracked, not in this roadmap)

### PSTR-FUTURE -- Upstream enhancements

- **PSTR-FUTURE-01**: Contribute any FSB-only adapters or missing relay/transport exports back to PhantomStream after FSB validates them in production.
- **PSTR-FUTURE-02**: Adopt PhantomStream's planned CSSOM capture mode, WeakMap node identity, shadow DOM capture, and evaluation harness when upstream ships them.
- **PSTR-FUTURE-03**: Publish benchmark results comparing DOM streaming against WebRTC, CDP screencast, screenshots, and rrweb baselines from FSB's real workloads.

### DASH-FUTURE -- Dashboard consolidation

- **DASH-FUTURE-01**: Remove the static dashboard implementation once Angular dashboard parity is fully accepted and deployed.

## Out of Scope

Explicitly excluded for v0.12.0.

| Feature | Reason |
|---------|--------|
| Redesigning the dashboard product UI | This milestone is a dependency migration and behavior-preservation effort, not a visual redesign. |
| Replacing task/status WebSocket traffic | PhantomStream owns browser mirroring only; dashboard task lifecycle, metrics, and pairing traffic remain FSB-owned. |
| Changing MCP tool schemas | DOM stream internals are not an MCP wire-contract change. Existing MCP schemas remain byte-identical unless a later milestone explicitly adds stream tools. |
| Switching to pixel/video streaming | The goal is to replace FSB's in-house DOM stream with PhantomStream, not change the mirroring model. |
| Publishing PhantomStream itself | FSB may block on upstream package publication, but the publish action belongs to the PhantomStream repo/package owner. |

## Traceability

Which phase covers which requirement. Phase numbering continues from v0.11.0 (Phases 14-20); this milestone is Phases 21-25.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PKG-01 | Phase 21 | Complete |
| PKG-02 | Phase 21 | Complete |
| PKG-03 | Phase 21 | Complete |
| PKG-04 | Phase 21 | Complete |
| CAP-01 | Phase 22 | Complete |
| CAP-02 | Phase 22 | Complete |
| CAP-03 | Phase 22 | Complete |
| CAP-04 | Phase 22 | Complete |
| VIEW-01 | Phase 23 | Complete |
| VIEW-02 | Phase 23 | Complete |
| VIEW-03 | Phase 23 | Complete |
| VIEW-04 | Phase 23 | Complete |
| RELAY-01 | Phase 24 | Complete |
| RELAY-02 | Phase 24 | Complete |
| RELAY-03 | Phase 24 | Complete |
| RELAY-04 | Phase 24 | Complete |
| CTRL-01 | Phase 24 | Pending |
| CTRL-02 | Phase 24 | Pending |
| CTRL-03 | Phase 24 | Pending |
| PARITY-01 | Phase 25 | Pending |
| PARITY-02 | Phase 25 | Pending |
| PARITY-03 | Phase 25 | Pending |
| PARITY-04 | Phase 25 | Pending |
| PARITY-05 | Phase 25 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24 (Phases 21-25)
- Unmapped: 0

**Per-phase requirement counts:**
- Phase 21 (Package Intake & Contract Mapping): PKG-01..04 (4)
- Phase 22 (Capture Adapter Migration): CAP-01..04 (4)
- Phase 23 (Dashboard Renderer Migration): VIEW-01..04 (4)
- Phase 24 (Transport, Relay & Remote Control Integration): RELAY-01..04, CTRL-01..03 (7)
- Phase 25 (Parity Removal, Docs & Browser UAT): PARITY-01..05 (5)

---
*Requirements defined: 2026-06-17*
*Last updated: 2026-06-17 -- Phase 24 RELAY-04 completed via reconnect/readiness/watchdog recovery parity and dashboard request-snapshot handling*
