---
phase: 33
name: PhantomStream Media Mirroring (0.2.1 Uptake)
milestone: v0.9.99
kind: milestone-extension
lineage: v0.12.0 PhantomStream Package Migration
requirements: [MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04]
created: 2026-06-23
status: execution-complete
---

# Phase 33 — PhantomStream Media Mirroring (0.2.1 Uptake)

## Why this phase exists

PhantomStream shipped `0.2.1` (2026-06-23), adding live `<video>`/`<audio>` mirroring that `0.1.0` lacked: playback is mirrored **by reference** (URL + playback state, never pixels), with a pure drift reconciler and a parent-realm adaptive (HLS/DASH) player. FSB's dashboard live preview pins `0.1.0` and therefore has no media. This phase takes up `0.2.1` so the preview mirrors media.

This is a **milestone extension**, requested after the initial v0.9.99 audit. Thematically it continues the v0.12.0 PhantomStream migration lineage, but v0.12.0 is archived and phase numbers are global integers, so it lands as Phase 33 in the open v0.9.99 tree.

## The shape of the work (consume-the-upgrade, not reimplement)

FSB **consumes** PhantomStream via four esbuild bundles (capture, protocol, viewer) and a thin set of product adapters. The entire media feature lives **inside the package** (`createCapture` already emits `STREAM.MEDIA`; `createViewer` already wires `createMediaPlayer` + `reconcileMediaDrift` + `mediaMode`). So the port is: bump the pin, rebuild the three bundles, surface the new symbols in the entry shims, and un-drop the media side channel at FSB's three glue seams — not a from-scratch reimplementation.

The one true blocker: `extension/content/dom-stream.js`'s `forwardCaptureMessage` is an allowlist (`if type === STREAM.X`) that silently drops any `STREAM.*` it does not branch on — so `STREAM.MEDIA` would never leave the page without an explicit branch.

## Decisions (locked)

- **D-01 Placement.** Phase 33 in the active v0.9.99 tree (the user said "extend the milestone"; v0.12.0 is archived; integers never restart).
- **D-02 `mediaMode: 'reference'`.** Real media-by-reference playback is the point of the feature and the package default. `'poster'` (poster image only, no media bytes) and `'off'` stay one config flip away; FSB's existing capture-side masking (`maskInputs`, overlay skip) still applies.
- **D-03 Defer adaptive HLS/DASH discovery.** The `STREAM.MEDIA_HINT` path uses `chrome.webRequest`, which needs a new permission. Progressive `<video>`/`<audio>` works without it. The relay/dashboard seams are wired but dormant; `classifyManifest` is surfaced for when it is enabled. No `webRequest` permission added.
- **D-04 Protect working-tree drift.** The viewer-side seams live in files with pre-existing uncommitted user edits (`dashboard.js`, the Angular component, `ws-client.js`, `dist/offscreen/lattice-host.js`). Edits are additive and surgical; the bundle rebuild is targeted to the three phantom-stream entries only (NOT `buildAll()`), so `lattice-host.js`/`stt.js` are byte-untouched. Nothing is committed (drift is intermingled).

## Invariants

- INV-01..04 (the v0.9.99 capability invariants) are untouched: this phase changes no capability/MCP/agent-loop/provider code.
- The PhantomStream differential parity stays green **by construction** — FSB consumes the package, so the bundle matches the package reference after rebuild.
- Wire compatibility: additive only. Same `{ _lz, d }` envelope; two new `STREAM.*` types (`ext:dom-media`, `ext:dom-media-hint`). A `0.1.0`-era viewer simply ignores unknown types.
