---
phase: 23-dashboard-renderer-migration
title: Dashboard Renderer Migration
status: planned
requirements: [VIEW-01, VIEW-02, VIEW-03, VIEW-04]
depends_on:
  - .planning/phases/22-capture-adapter-migration/22-VALIDATION.md
created: 2026-06-17
---

# Phase 23 Context: Dashboard Renderer Migration

## Goal

Both dashboard surfaces render and update the live preview through PhantomStream renderer-backed behavior without drifting from today's FSB preview state machine or side-channel UI.

## Starting Point

Phase 22 completed the content-side capture adapter:

- `extension/content/dom-stream.js` delegates snapshot/mutation/scroll/overlay/dialog capture to the bundled PhantomStream capture engine.
- The adapter temporarily stamps `data-fsb-nid` into snapshot and add-op HTML so current dashboard renderers keep working.
- Capture-side side channels, diagnostics, readiness, and masking/sanitization are guarded.

Phase 23 now removes dashboard ownership of generic snapshot assembly and mutation application.

## Current FSB Dashboard Renderer Shape

Static dashboard:

- `showcase/dashboard.html` owns the preview iframe (`dash-preview-iframe`) plus host overlay elements for glow, progress, dialog, frozen overlays, restricted/error/loading states, URL bar, layout controls, and remote-control overlay.
- `showcase/js/dashboard.js` builds iframe `srcdoc` manually from snapshot HTML, stylesheets, and inline styles.
- `showcase/js/dashboard.js` applies mutation ops by querying `[data-fsb-nid="..."]` in the iframe document.
- It owns stale-session rejection, stale-mutation counters, resync requests, preview states, side-channel rendering, remote-control overlay events, and diagnostics.

Angular dashboard:

- `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts` mirrors the static dashboard's snapshot, mutation, scale, side-channel, preview-state, and remote-control logic.
- Angular copies `showcase/js/dashboard-runtime-state.js` into assets through `showcase/angular/angular.json`; this pattern can also carry a generated PhantomStream viewer bundle.

## PhantomStream Renderer Surface

Installed package: `@full-self-browsing/phantom-stream@0.1.0`.

Relevant exports from `@full-self-browsing/phantom-stream/renderer`:

- `createViewer({ container, transport, logger, disconnectDelayMs? })`
- `applyMutations(...)`
- `buildSnapshotHtml(...)`
- `createOverlays(...)`
- `computeScale(...)`
- `mapHostPointToViewport(...)`
- `mapRectToHost(...)`
- `OVERLAY_CSS`

`createViewer(...)` auto-attaches:

- a viewer root stamped `data-phantomstream-ui="viewer"`;
- a sandboxed mirror iframe with sandbox exactly `allow-same-origin`;
- a host overlay layer;
- built-in glow, progress, and dialog overlay renderers;
- a private nid index from the `nodeIds` sidecar;
- host-facing `state` and `health` events;
- `resolveNode`, `highlightNode`, `clearHighlight`, `requestSubtree`, and `getViewportMapping` helpers.

Renderer transport contract:

- `transport.onMessage(handler)` receives `STREAM.*` messages from the dashboard host.
- `transport.send(type, payload)` emits viewer-to-host `CONTROL.*` messages.
- Resync uses `CONTROL.START`; FSB host glue must map that to the existing dashboard stream-start request.
- Subtree requests use `CONTROL.SUBTREE_REQUEST`; FSB transport routing for that path is not complete until Phase 24, so Phase 23 must avoid claiming full subtree-response support unless it is explicitly wired.

## Decisions

- **VIEW-D-01:** Build a shared browser-global wrapper around PhantomStream renderer before changing either dashboard surface. Static and Angular must consume the same wrapper contract.
- **VIEW-D-02:** Generate the wrapper with esbuild into `showcase/js/phantom-stream-viewer.js`, expose it as `window.FSBPhantomStreamViewer`, and copy/load that artifact into Angular assets the same way `dashboard-runtime-state.js` is shared.
- **VIEW-D-03:** The wrapper owns only the generic viewer bridge: `createViewer`, transport fan-out, viewer events, viewport mapping, and PhantomStream protocol constants. FSB preview states, URL bar, frozen overlays, task/remote-control state, WebSocket pairing, and dashboard chrome remain host-owned.
- **VIEW-D-04:** Static migration goes first. Angular migrates second and must match the same wrapper contract, not re-implement a parallel renderer adapter.
- **VIEW-D-05:** Existing FSB side-channel UI remains authoritative until the product accepts PhantomStream built-in visuals as a full replacement. Host code may still consume overlay/dialog/scroll payloads for client badges, frozen identity, diagnostics, and compatibility, while generic mirror rendering moves to the package viewer.
- **VIEW-D-06:** Keep the Phase 22 `data-fsb-nid` bridge until both dashboards are renderer-backed and Phase 25 removes duplicate generic render paths.

## Risks

- Static and Angular dashboards currently duplicate mutation logic; migrating one surface without contract tests can create drift.
- The PhantomStream viewer creates its own iframe and overlay layer, so host HTML/CSS must be adjusted without breaking loading, restricted, frozen, error, PiP/maximized/fullscreen, or remote-control overlays.
- Remote-control coordinate mapping relies on preview scale. Phase 23 must expose/use package viewport mapping enough to preserve the current affordance, while Phase 24 owns the deeper reverse-mapping protocol migration.
- The package viewer's `CONTROL.SUBTREE_REQUEST` path may emit messages the current FSB relay does not route yet. Phase 23 must either route only `CONTROL.START` or explicitly contain/log unsupported control messages.
- Node/static tests do not prove real browser iframe rendering. Phase 25 remains responsible for browser UAT.

## Success Boundary

Phase 23 is complete when both dashboards use the shared PhantomStream renderer wrapper for snapshot render and mutation apply, while existing preview states and side-channel UI remain behaviorally compatible. Phase 23 does not migrate WebSocket relay helpers, compression, remote-control CDP mapping, or final browser UAT.
