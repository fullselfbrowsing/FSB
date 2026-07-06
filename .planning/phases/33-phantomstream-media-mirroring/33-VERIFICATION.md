---
phase: 33
doc: verification
status: human_needed
ci_half: green
requirements: [MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04]
verified: 2026-06-23
---

# Phase 33 — Verification (goal-backward)

**Goal:** the dashboard live preview mirrors `<video>`/`<audio>` by reference via PhantomStream `0.2.1`.

**Status: human_needed** — the automated/CI half of all four MEDIA requirements is green; the irreducibly-live half (real media playing in a real tab, mirrored to the dashboard with drift held in band) is recorded as deferred UAT debt (`33-HUMAN-UAT.md`), matching the standing v0.9.99 / v0.12.0 live-UAT posture. Every MEDIA REQ-ID is `Complete`.

## Requirement-by-requirement

| REQ | What it claims | CI evidence | Verdict |
|-----|----------------|-------------|---------|
| MEDIA-01 | Pin 0.2.1 + bundles rebuilt with media surface | `phantom-stream-public-package` 15/0 (pin/lock/PIN agree on 0.2.1), `phantom-stream-exports` 121/0 (installed 0.2.1 + media exports), bundle greps (`ext:dom-media`, `classifyManifest`, `reconcileMediaDrift`) | satisfied |
| MEDIA-02 | `STREAM.MEDIA` flows capture→adapter→relay→dashboard | `phantom-stream-media-wiring` 24/0 (dom-stream branch, background relay case, bundle types) | satisfied (CI half); live flow = UAT |
| MEDIA-03 | Static + Angular dashboards drive viewer `mediaMode:'reference'` + route media | `phantom-stream-media-wiring` (handlers, router cases, mediaMode both dashboards), `phantom-stream-dashboard-parity` 70/0 | satisfied (CI half); live playback = UAT |
| MEDIA-04 | Headless tests green in npm test; live recorded human_needed | `phantom-stream-media-sync` 31/0, `phantom-stream-media-wiring` 24/0, wired into `scripts.test` | satisfied |

## Invariants / non-regression
- INV-01..04 untouched — no capability/MCP/agent-loop/provider file changed.
- PhantomStream differential parity green by construction (FSB consumes the package): `phantom-stream-differential-parity` 30/0, `remote-control-parity` 55/0.
- `dist/offscreen/lattice-host.js` byte-identical before/after the targeted rebuild (user drift protected).
- Wire-compatible/additive: same `{ _lz, d }` envelope; two new `STREAM.*` types; old viewers ignore unknown types.

## Deferred (non-blocking)
- Live media playback fidelity UAT — `33-HUMAN-UAT.md` (UAT-33-01).
- Adaptive HLS/DASH discovery (`STREAM.MEDIA_HINT` via `chrome.webRequest`) — off-by-default, no permission added; seam wired but dormant.
