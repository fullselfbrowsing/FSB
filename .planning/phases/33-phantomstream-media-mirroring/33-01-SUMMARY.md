---
phase: 33
plan: 33-01
title: PhantomStream 0.2.1 media-mirroring uptake
requirements_completed: [MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04]
status: complete
completed: 2026-06-23
---

# Plan 33-01 — Summary

Took up PhantomStream `0.2.1`'s media-mirroring feature into FSB's dashboard live preview. Consume-the-upgrade: bumped the pin, rebuilt the three phantom-stream bundles, and un-dropped the `STREAM.MEDIA` side channel at the three FSB glue seams. No capability/MCP/agent-loop/provider code touched.

## Delivered

**Dependency + bundles (MEDIA-01)**
- `package.json` + `package-lock.json`: `@full-self-browsing/phantom-stream` `0.1.0 → 0.2.1` (exact; integrity `sha512-3aG66I7…Xd5A==`).
- Rebuilt only the three phantom-stream bundles (`extension/content/phantom-stream-capture.js`, `extension/ws/phantom-stream-protocol.js`, `showcase/js/phantom-stream-viewer.js`) via a targeted `esbuild.build` (NOT `buildAll()`); `dist/offscreen/lattice-host.js` hash byte-identical before/after (user drift protected).
- Entry shims: `protocol-entry.js` surfaces `classifyManifest`; `viewer-entry.js` forwards `mediaMode` + media degrade callbacks into `createViewer`.

**Capture → relay (MEDIA-02)**
- `extension/content/dom-stream.js`: `forwardCaptureMessage` branches `STREAM.MEDIA`→`domStreamMedia`, `STREAM.MEDIA_HINT`→`domStreamMediaHint` (resolves the allowlist drop).
- `extension/background.js`: relay cases → `fsbWebSocket.send('ext:dom-media' | 'ext:dom-media-hint', …)`. ws-client/relay-compat already generic by type (no change).

**Viewer (MEDIA-03)**
- `showcase/js/dashboard.js` + `…/dashboard-page.component.ts` (Angular): `handleDOMMedia`/`handleDOMMediaHint` (stale-frame guarded, stream-only), inbound router cases, and `createDashboardViewer({ mediaMode: 'reference', onMediaBlocked, onMediaUnavailable })`. Existing capture-side masking unchanged.

**Tests (MEDIA-04)**
- `tests/phantom-stream-media-sync.test.js` — 31 PASS / 0 FAIL (reconciler branches + `classifyManifest` + `/protocol` media surface).
- `tests/phantom-stream-media-wiring.test.js` — 24 PASS / 0 FAIL (3 glue seams + rebuilt bundle surface).
- Version-pin tests updated to `0.2.1`; both new tests wired into `npm test`.

**Docs**
- `PHANTOMSTREAM-PIN.md` (0.2.1 + media note), `REQUIREMENTS.md` (+MEDIA-01..04, 48/48), `ROADMAP.md` (Phase 33), `STATE.md`, `v0.9.99-MILESTONE-AUDIT.md`.

## Deviations / notes
- **Adaptive HLS/DASH discovery deferred** (D-03): `STREAM.MEDIA_HINT` via `chrome.webRequest` needs a new permission; progressive media works without it. The relay/dashboard seams are wired but dormant; `classifyManifest` surfaced for later enablement. No `manifest.json` change.
- **Not committed**: working-tree drift (dashboard/ws-client/lattice/showcase) is intermingled, so the phase is left uncommitted for the user to review/stage.

## Evidence
- Full phantom-stream cluster green after the bump (differential-parity 30/0, dashboard-parity 70/0, remote-control-parity 55/0, exports 121/0, public-package 15/0, + 16 more).
- INV-01..04 untouched (no capability/MCP/agent-loop/provider files changed).
