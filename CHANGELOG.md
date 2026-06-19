# Changelog

All notable changes to the FSB product (Chrome extension + showcase dashboard) are documented in this file. Entries are organized by FSB milestone. The extension version is `0.9.90`; milestone versions such as `v0.11.0` and `v0.12.0` are the meaningful release units.

The `fsb-mcp-server` npm package keeps its own semver changelog in [`mcp/CHANGELOG.md`](./mcp/CHANGELOG.md).

## [Unreleased]

Current beta build: `automation-beta-v0.9.90-lattice.2` (local, for testing).

### Fixed

- **`list_triggers` status filter accepts the full persisted set.** The optional `status` enum now allows `armed`, `needs_attention`, `blocked`, `fired`, `timed_out`, and `stopped`; `needs_attention` and `timed_out` were previously rejected at the schema gate. Kept in parity between the extension and MCP tool definitions. (`1d23c56c`)
- **Background-tab automation errors route to their owning tab only.** A session failing in a background tab now clears that tab's per-tab running state without disturbing the active tab's UI, matching the `automationComplete` routing contract. (`ace4528b`)

## v0.12.0 — PhantomStream Package Migration — 2026-06-17

Migrates FSB's dashboard DOM live-preview from FSB-owned generic stream engines to the pinned, published `@full-self-browsing/phantom-stream@0.1.0` package.

### Added / Changed

- **PhantomStream powers generic DOM mirroring.** The extension, server relay, and the static and Angular dashboards delegate generic capture (snapshot/mutation/session/scroll), renderer assembly, protocol envelopes, relay classification, compression, stale-frame detection, and sanitizer behavior to PhantomStream-backed seams. The package is pinned by exact version and `package-lock` integrity.
- **FSB keeps its product-specific adapters.** Capture maps to FSB background actions with overlay/dialog/scroll side channels and readiness pings (`content/dom-stream.js`); a shared `window.FSBPhantomStreamViewer` wrapper serves both dashboards; the WebSocket bridge preserves FSB task/status traffic, hash-key rooms, tab ownership, and debugger-contention reporting while accepting PhantomStream stream/control and remote-control frames.
- **No user-facing change.** MCP tool schemas, dashboard task/status WebSocket traffic, pairing, auth, model/provider behavior, and the dashboard's visual design are unchanged. The migration is internal.
- **Deterministic parity coverage.** Legacy `data-fsb-nid` stamping was removed in favor of differential parity tests; PhantomStream package, protocol, capture, renderer, relay, security, dashboard, and recovery paths are gated by the root `npm test` suite.

### Deferred (user-gated)

- Live-browser UAT for dashboard preview fidelity, navigation/reconnect recovery, restricted tabs, large pages, security masking, and remote-control usability remains `human_needed` (automated protocol and source-contract tests pass).

## v0.11.0 — Trigger Tool (Reactive DOM Monitoring) — 2026-06-17

Adds reactive DOM monitoring: an agent arms a watch on one element and is notified when a condition is met, without server-side polling.

### Added

- **Trigger tool family.** `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` arm and manage one-element watches in the caller's owned tab. Watches survive MV3 service-worker eviction and persist across tab navigation.
- **Two watch modes.** `live-observe` uses an in-page mutation observer with pulse feedback and no reload; `refresh-poll` reloads the owned tab in the background and coalesces same-tab due watches into a single reload.
- **Rich conditions.** `changed`, `threshold`, `delta_percent`, `equals`, `contains`, `regex`, and compound AND/OR; numeric and percent conditions use hysteresis to avoid repeated fires on the same edge. Text, number, and attribute extraction is supported.
- **Blocking or detached.** `trigger` blocks up to 120s by default with 30s progress heartbeats; `detached:true` returns immediately with a `trigger_id` to poll later. A 240s safety ceiling auto-detaches.
- **Concurrency cap.** A configurable `fsbTriggerCap` (default 8, range 1–64) limits active watches; armed and attention states (`needs_attention`, `blocked`) count toward the cap, terminal states (`fired`, `timed_out`, `stopped`) do not.
- **Local, session-bound, notify-only.** Triggers run in the open browser with no server-side monitoring and no desktop/email/SMS/Slack push or auto-act workflows; the caller decides any follow-up.

### Deferred (user-gated)

- Live-browser composed trigger UAT (multiple interacting watches on real pages) and publish/tag/release actions.

## v0.10.0 — Autopilot via Lattice SDK — 2026-06-15

Shipped 2026-06-15: FSB's agent runtime, providers, and MV3 survivability moved onto the public Lattice SDK. See the `v0.10.0` git tag for detail; MCP-specific history is in [`mcp/CHANGELOG.md`](./mcp/CHANGELOG.md).
