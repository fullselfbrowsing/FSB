---
phase: 22-capture-adapter-migration
created: 2026-06-17
status: ready_for_planning
mode: autonomous
---

# Phase 22: Capture Adapter Migration - Context

## Phase Boundary

`extension/content/dom-stream.js` must delegate generic capture mechanics to `@full-self-browsing/phantom-stream/capture#createCapture` while preserving FSB's current content-script control messages and dashboard-facing payloads. Phase 22 owns capture-side behavior only.

Phase 22 must not migrate static or Angular dashboard rendering, server relay behavior, WebSocket compression, or remote-control protocol. Those are Phase 23 and Phase 24 responsibilities.

## Locked Inputs

- Package source: `.planning/PHANTOMSTREAM-PIN.md`
- Verified package surface: `.planning/phases/21-package-intake-contract-mapping/21-PACKAGE-SURFACE.md`
- Stream contract map: `.planning/phases/21-package-intake-contract-mapping/21-STREAM-CONTRACT-MAP.md`

Verified Phase 22 imports:

- `@full-self-browsing/phantom-stream/capture#createCapture`
- `@full-self-browsing/phantom-stream/protocol#STREAM`, `CONTROL`, `DIFF_OP`, `READY_PROBE_INTERVAL_MS`, `READY_PROBE_BUDGET_MS`

## Codebase Findings

- `extension/content/dom-stream.js` is a classic IIFE content script, not an ES module.
- `chrome.scripting.executeScript({ files })` injects classic files. Direct `import` from the content script is not viable.
- Existing esbuild config already supports per-entry browser bundles into `extension/dist/`.
- The dashboard renderers still query `data-fsb-nid` attributes for mutation application.
- PhantomStream capture emits framework identity through `nodeIds` sidecars and add-op `nodeIds`, not live-page or mirror `data-fsb-nid` attributes.
- `CONTENT_SCRIPT_FILES` in `extension/background.js` currently omits `content/dom-stream.js`, while the ws-client fallback list includes it. Phase 22 should fix the primary injection list because CAP-03 includes content-script reinjection readiness.

## Decisions

### D-01: Bundle the package capture surface for classic content-script injection

Create a small esbuild entry that imports PhantomStream capture/protocol symbols and exposes them on `globalThis` for `dom-stream.js`. Commit the generated bundle because users may load the unpacked extension without running `npm run build`.

### D-02: Keep existing content-script message names

The content script continues to respond to `pingDomStream`, `domStreamStart`, `domStreamStop`, `domStreamPause`, `domStreamResume`, and `domStreamRequestOverlay`. Background messages (`domStreamSnapshot`, `domStreamMutations`, `domStreamScroll`, `domStreamOverlay`, `domStreamDialog`, `domStreamReady`) stay unchanged in Phase 22.

### D-03: Use a temporary legacy identity bridge until Phase 23

PhantomStream owns capture identity internally, but the current dashboards still need `data-fsb-nid`. The Phase 22 adapter stamps `data-fsb-nid` into detached snapshot/add-op HTML using PhantomStream `nodeIds` sidecars before forwarding to existing dashboards. Phase 23 removes this bridge when renderers adopt PhantomStream.

### D-04: Preserve FSB resume semantics through adapter policy

PhantomStream `resume()` keeps the same stream and does not send a fresh snapshot. Current FSB `domStreamResume` sends a fresh snapshot and starts a new identity. The adapter preserves current FSB behavior by mapping `domStreamResume` to a fresh capture `stop()` + `start()` sequence.

### D-05: Keep FSB-owned side channels host-side

Overlay state is read from `window.FSB.actionGlowOverlay`, `window.FSB.highlightManager`, and `window.FSB.overlayState` through PhantomStream's `overlayProvider` seam. Dialog interception remains package-backed if emitted by capture, but FSB message wrapping and rate-limited diagnostics stay in the adapter.

### D-06: Masking/security is explicit configuration

Enable `maskInputs: true` and keep FSB overlay exclusion through `skipElement`. Add tests that assert password/value masking, dangerous URL/script/event stripping, `srcdoc` stripping, and overlay exclusion through the adapter or package-backed source.

## Risks

- PhantomStream payloads include additional op types (`value`, `shadow-root`, `frame`, `style-source`) that current dashboards ignore. Phase 22 must either keep those safe or document them as benign until Phase 23.
- Generated bundle drift is possible if `npm run build` is not run after editing the entry. Add tests that fail if the exposed bundle is missing from injection order or lacks the expected package-backed markers.
- Dashboard runtime parity cannot be fully proven without Phase 23 renderer migration and Phase 25 browser UAT.

## Success Criteria

- Starting a stream still emits an initial snapshot followed by rAF-batched mutation payloads with stream/session identity.
- Pause/resume/stop, reinjection readiness, `pingDomStream`, scroll tracking, dialogs, overlays, and watchdog diagnostics keep current FSB behavior.
- Sensitive content handling is explicitly configured and tested.
- Capture-focused tests no longer assert that bespoke FSB implementation details are owned by `dom-stream.js`; they assert package-backed adapter behavior.
