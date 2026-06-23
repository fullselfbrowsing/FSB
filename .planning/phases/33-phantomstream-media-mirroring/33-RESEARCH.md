---
phase: 33
doc: research
created: 2026-06-23
---

# Phase 33 — Research / Seam Map

## What 0.2.1 adds (vs the pinned 0.1.0)

Live media mirroring, entirely inside the package:

- **Protocol** (`/protocol`): `STREAM.MEDIA` (`ext:dom-media`), `STREAM.MEDIA_HINT` (`ext:dom-media-hint`); `MediaSyncPayload` / `MediaBaselineEntry` / `MediaHintPayload` typedefs; `MEDIA_SYNC_THROTTLE_MS = 250`; `classifyManifest()`; and `protocol/media-reconcile.js` (`reconcileMediaDrift`, `DEFAULT_MEDIA_RECONCILE_CONFIG`) re-exported via `export * from './media-reconcile.js'`.
- **Capture** (`createCapture`): per-element media tracker (timeupdate heartbeat throttled at `MEDIA_SYNC_THROTTLE_MS`), emits one `MediaSyncPayload` per element per tick; media masking config (`maskMediaSelector`, `maskAssetUrls`, `maskAssetUrlFn`).
- **Renderer** (`createViewer`): `createMediaPlayer` (parent-realm hls.js MSE; the in-iframe `<video>` stays inert, sandbox `allow-same-origin` only, never `allow-scripts`); `mediaMode` `'off' | 'poster' | 'reference'` (validated, throws on invalid); `onMediaBlocked(nid)` / `onMediaUnavailable(nid, reason)` logger-trapped callbacks; per-element drift correction via `reconcileMediaDrift`.
- **Extension adapter**: opt-in `chrome.webRequest` adaptive-manifest discovery → `STREAM.MEDIA_HINT` (deferred; needs `webRequest`).

The reconciler is the package's novel contribution over rrweb's MediaManager: a tolerance band + bounded rate-nudge + live-edge rejoin (smooth convergence instead of always hard-seeking). It is pure (no DOM, caller supplies `now`), so it is fully node-testable.

## FSB consumption architecture (the reframe)

`esbuild.config.js` builds three phantom-stream bundles from entry shims that import the package:
- `extension/content/phantom-stream-capture.js` ← `…-capture-entry.js` (exposes `globalThis.FSBPhantomStreamCapture`).
- `extension/ws/phantom-stream-protocol.js` ← `…-protocol-entry.js` (exposes `globalThis.FSBPhantomStreamProtocol`).
- `showcase/js/phantom-stream-viewer.js` ← `…-viewer-entry.js` (exposes `globalThis.FSBPhantomStreamViewer`).

So most of the feature arrives by **bump + rebuild**. The remaining work is FSB-side glue.

## Seam map (file:line → classification)

| Seam | Location | Pre-state | Action |
|------|----------|-----------|--------|
| Capture allowlist | `extension/content/dom-stream.js` `forwardCaptureMessage` (~:175-235) | Drops unknown `STREAM.*` | **GLUE**: branch `STREAM.MEDIA`/`MEDIA_HINT` → `domStreamMedia`/`domStreamMediaHint` |
| Background relay | `extension/background.js` domStream* switch (~:8353-8444) | No media case | **GLUE**: cases → `fsbWebSocket.send('ext:dom-media'|'ext:dom-media-hint', …)` |
| ws-client / relay-compat | `extension/ws/ws-client.js` `send`, `showcase/server/.../phantomstream-relay-compat.js` | Generic by type | **AUTO**: new types pass through untouched |
| Viewer config | `showcase/js/phantom-stream-viewer-entry.js` `createViewer({…})` | No `mediaMode` | **GLUE**: forward `mediaMode` + `onMediaBlocked`/`onMediaUnavailable`/`mediaReconcileConfig` |
| Static dashboard | `showcase/js/dashboard.js` (handlers + router + viewer init) | No media | **GLUE**: `handleDOMMedia`/`Hint`, inbound `ext:dom-media`/`-hint` routes, `mediaMode: 'reference'` |
| Angular dashboard | `…/dashboard-page.component.ts` | No media | **GLUE**: same parity edits |
| Viewer sandbox/CSP | package `createViewer` builds its own sandboxed iframe | n/a | **AUTO**: media-src/CSP handled inside the package renderer |
| `chrome.webRequest` discovery | `extension/manifest.json` (no `webRequest`) | Absent | **DEFER**: off-by-default; progressive media works without it |
| Version pins | `package.json:83`, `package-lock.json`, `PHANTOMSTREAM-PIN.md`, `tests/helpers/phantom-stream-public-pin.js`, `tests/phantom-stream-exports.test.js` | `0.1.0` | **GLUE**: bump to `0.2.1` + integrity/shasum/tarball |

## Callback signatures (verified against package source)

- `onMediaUnavailable(nid, reason)` — `src/renderer/index.js:636`, `media-player.js:165`.
- `onMediaBlocked(nid)` — `src/renderer/index.js:1712`.
- Both wrapped in `safeInvokeMediaHook` (logger-trapped, never rethrown), so FSB's diagnostic callbacks are safe.

## 0.2.1 dist metadata (pin update inputs)

- integrity: `sha512-3aG66I7IHMml8H2kORlghwobVyIj9/YZaVxGkGMaRYPOEO19RabFZU/R4K1RG3Epf0bSfjbFDDxyGeXmgkXd5A==`
- shasum: `503705594ac92b463c970edfaa8f34ba6ecb50ad`
- tarball: `https://registry.npmjs.org/@full-self-browsing/phantom-stream/-/phantom-stream-0.2.1.tgz`
- published: `2026-06-23T08:28:22.996Z`
