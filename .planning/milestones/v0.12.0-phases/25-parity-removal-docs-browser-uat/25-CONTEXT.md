---
phase: 25-parity-removal-docs-browser-uat
requirements: [PARITY-01, PARITY-02, PARITY-03, PARITY-04, PARITY-05]
created: 2026-06-17
status: ready
---

# Phase 25 Context: Parity Removal, Docs & Browser UAT

## Phase Boundary

Phase 25 closes the v0.12.0 PhantomStream migration. It removes migration residue and duplicate stream-engine code from FSB, tightens package-backed tests, updates provenance/docs, and records final automated plus browser UAT evidence. It does not redesign the dashboard, change MCP schemas, or replace FSB-owned product traffic such as pairing, task lifecycle, metrics, and overlay identity.

## Implementation Decisions

### Adapter Boundary

- Treat generated PhantomStream bundles as package artifacts, not FSB-owned duplicate engines.
- Keep FSB-specific adapters where they translate between PhantomStream and existing FSB contracts: background actions, dashboard state, pairing, task/status traffic, overlay identity, and remote-control ownership.
- Remove legacy bridge code that only existed to support the pre-Phase-23 renderer path, especially adapter-side `data-fsb-nid` stamping.
- Do not remove browser UAT debt by assertion. Phase 25 must explicitly record what automated tests prove and what a real Chrome session proves.

### Verification Scope

- Prefer source-contract tests for duplicate-engine removal where runtime browser proof is unavailable.
- Add or update tests so they assert package-backed behavior instead of old local implementation details.
- Keep security/masking and stale-message coverage because those are migration risk areas.
- Final UAT evidence can be marked `human_needed` only if not actually run; no fabricated pass results.

## Existing Code Insights

### Reusable Assets

- `extension/content/dom-stream.js` is already a thin capture adapter around `window.FSBPhantomStreamCapture`.
- `showcase/js/phantom-stream-viewer-entry.js` supplies the shared static/Angular dashboard viewer wrapper.
- `extension/ws/phantom-stream-protocol-entry.js` supplies the classic service-worker protocol bridge.
- `showcase/server/src/ws/phantomstream-relay-compat.js` documents the FSB-specific relay compatibility adapter.

### Established Patterns

- Phase summaries live beside plans in `.planning/phases/<phase>/`.
- Static Node tests use source-contract checks plus small VM simulations instead of live Chrome where possible.
- Browser-only verification is recorded as explicit UAT debt rather than marked passed.

### Integration Points

- Capture adapter tests: `tests/phantom-stream-capture-adapter.test.js`, `tests/dom-stream-perf.test.js`, `tests/phantom-stream-sidechannels.test.js`.
- Renderer parity tests: `tests/phantom-stream-dashboard-parity.test.js`, `tests/phantom-stream-dashboard-sidechannels.test.js`, `tests/phantom-stream-static-viewer.test.js`.
- Transport/relay/remote tests: `tests/phantom-stream-protocol-envelope.test.js`, `tests/server-ws-phantomstream-relay-compat.test.js`, `tests/phantom-stream-remote-control-parity.test.js`.

## Deferred Ideas

- Upstream any FSB-only adapter needs back to PhantomStream after browser UAT proves production behavior.
- Remove the static dashboard implementation only under the deferred `DASH-FUTURE-01` requirement, not in this phase.
