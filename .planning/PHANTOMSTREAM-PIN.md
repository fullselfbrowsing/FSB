---
current_phantomstream_source: npm
current_phantomstream_package: "@full-self-browsing/phantom-stream"
current_phantomstream_version: "0.2.1"
current_phantomstream_integrity: "sha512-3aG66I7IHMml8H2kORlghwobVyIj9/YZaVxGkGMaRYPOEO19RabFZU/R4K1RG3Epf0bSfjbFDDxyGeXmgkXd5A=="
current_phantomstream_tarball: "https://registry.npmjs.org/@full-self-browsing/phantom-stream/-/phantom-stream-0.2.1.tgz"
current_phantomstream_shasum: "503705594ac92b463c970edfaa8f34ba6ecb50ad"
current_phantomstream_published_at: "2026-06-23T08:28:22.996Z"
rejected_phantomstream_package: "@fullselfbrowsing/phantom-stream"
rejected_phantomstream_status: "E404 on 2026-06-17"
last_verified: 2026-06-23
schema_version: 1
---

# PhantomStream Pin -- FSB Package Source Record

This file is the FSB-side source-of-truth for the PhantomStream package consumed by the v0.12.0 migration and its Phase 33 media-mirroring uptake.

**Current source:** npm package `@full-self-browsing/phantom-stream@0.2.1`
**Runtime tarball:** `https://registry.npmjs.org/@full-self-browsing/phantom-stream/-/phantom-stream-0.2.1.tgz`
**Runtime tarball integrity:** `sha512-3aG66I7IHMml8H2kORlghwobVyIj9/YZaVxGkGMaRYPOEO19RabFZU/R4K1RG3Epf0bSfjbFDDxyGeXmgkXd5A==`
**Registry shasum:** `503705594ac92b463c970edfaa8f34ba6ecb50ad`
**Rejected stale source:** `@fullselfbrowsing/phantom-stream` returned npm `E404` on 2026-06-17.

## Decision

FSB consumes the published npm package `@full-self-browsing/phantom-stream@0.2.1` with an exact dependency and package-lock integrity. A temporary GitHub or tarball pin is not authorized because the registry package is available and installable.

If a later smoke test proves the registry package cannot satisfy FSB's import/runtime constraints, the migration must stop and record a new explicit source decision before production stream code imports PhantomStream.

## Implementation Boundary

PhantomStream owns the generic DOM-mirroring mechanics:

- capture snapshot/mutation/session/scroll/media primitives through `@full-self-browsing/phantom-stream/capture`;
- renderer snapshot assembly, mutation application, viewport mapping, sanitizer behavior, media playback, and viewer lifecycle through `@full-self-browsing/phantom-stream/renderer`;
- stream/control constants, the media drift reconciler, the adaptive-manifest classifier, stale stream identity checks, and `_lz` envelope encode/decode through `@full-self-browsing/phantom-stream/protocol`;
- relay frame classification, compressed-envelope identification, message caps, and backpressure constants through `@full-self-browsing/phantom-stream/relay`.

FSB intentionally keeps product-specific adapters:

- `extension/content/dom-stream.js`: maps PhantomStream capture messages to existing FSB background actions, overlay exclusion, dialog/scroll/overlay/media side channels, readiness pings, stale-flush diagnostics, and resume-as-fresh-snapshot behavior.
- `showcase/js/phantom-stream-viewer.js`: generated browser wrapper that exposes `window.FSBPhantomStreamViewer` to both static and Angular dashboards (sets `mediaMode` + media degrade callbacks).
- `extension/ws/phantom-stream-protocol.js`: generated classic-service-worker bridge for protocol helpers used by `ws-client.js`.
- `showcase/server/src/ws/phantomstream-relay-compat.js`: CommonJS relay compatibility adapter preserving FSB hash-key rooms, extension/dashboard roles, status broadcasts, and task/status traffic while matching PhantomStream frame classification and limits.
- `extension/ws/ws-client.js`: remote-control adapter preserving FSB CDP dispatch, tab ownership, debugger contention reporting, retargeting, and legacy dashboard frame compatibility while accepting PhantomStream remote-control frames.

Generated PhantomStream bundles are package artifacts. They are not evidence of FSB retaining a duplicate capture, renderer, protocol, or relay engine.

## Milestone Release Note

v0.12.0 migrates FSB's dashboard DOM live preview from FSB-owned generic stream engines to the pinned PhantomStream package. The extension, server relay, and static/Angular dashboards now delegate generic capture, renderer, protocol, relay classification, compression, stale-frame, and sanitizer behavior to PhantomStream-backed seams.

The release does not change MCP tool schemas, dashboard task/status WebSocket traffic, pairing, auth, model/provider behavior, or the user-facing dashboard design. Remaining release evidence is live-browser UAT for dashboard preview fidelity, navigation/reconnect recovery, restricted tabs, large pages, security masking, and remote-control usability.

## v0.2.1 Media Mirroring Uptake (Phase 33)

Phase 33 bumps the pin `0.1.0 -> 0.2.1` to take up PhantomStream's media-mirroring feature: live `<video>`/`<audio>` playback is mirrored by reference (URL + playback state, never pixels), with a pure drift reconciler (`reconcileMediaDrift`) and a parent-realm adaptive (HLS/DASH) player inside the package.

The uptake is additive and wire-compatible (same `{ _lz, d }` envelope; two new `STREAM.*` types: `ext:dom-media` and `ext:dom-media-hint`). FSB's only glue is:

- `extension/content/dom-stream.js`: forward `STREAM.MEDIA` / `STREAM.MEDIA_HINT` (the capture allowlist otherwise drops unknown stream types).
- `extension/background.js`: relay `domStreamMedia` / `domStreamMediaHint` to `ext:dom-media` / `ext:dom-media-hint`.
- static + Angular dashboards: route inbound media frames to the viewer and set `mediaMode: 'reference'` plus logger-trapped degrade callbacks.

Deferred (off by default): the opt-in `chrome.webRequest` adaptive-manifest discovery path (`STREAM.MEDIA_HINT` synthesis) needs a new `webRequest` permission; progressive media works without it. The relay seam is wired but dormant.

Live-browser UAT for real media playback fidelity (playing video mirrored to the dashboard, drift staying in band, blocked/unavailable degrade) is recorded as `human_needed` in the Phase 33 UAT ledger, matching the standing live-UAT posture; the headless half (reconciler branches + the full wiring chain + bundle surface) is green.

## Verification Commands

```bash
npm view @full-self-browsing/phantom-stream@0.2.1 dist.integrity dist.tarball version name --json
npm view @fullselfbrowsing/phantom-stream --json
node tests/phantom-stream-public-package.test.js
node tests/phantom-stream-exports.test.js
node tests/phantom-stream-differential-parity.test.js
node tests/phantom-stream-media-sync.test.js
node tests/phantom-stream-media-wiring.test.js
```

## Schema Notes

- `current_phantomstream_source`: active source type. `npm` means the package-lock integrity is the source gate.
- `current_phantomstream_package` / `current_phantomstream_version`: the exact runtime package FSB imports.
- `current_phantomstream_integrity`: registry tarball integrity copied from `package-lock.json`.
- `rejected_phantomstream_package`: stale planning reference that must not be used in code or docs except to explain the correction.
