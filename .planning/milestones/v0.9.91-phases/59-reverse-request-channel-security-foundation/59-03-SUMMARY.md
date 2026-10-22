---
phase: 59-reverse-request-channel-security-foundation
plan: "03"
subsystem: security
tags: [websocket, reverse-routing, capabilities, topology, correlation]

requires:
  - phase: 59-02
    provides: Rotating pairing authority, pre-upgrade trust boundary, and per-frame session revalidation
provides:
  - Closed optional agent-spawn capability advertisement with byte-identical defaults
  - Authenticated local-first and deterministic capable-relay reverse routing
  - Independent exactly-once reverse correlation and topology-loss cleanup without replay
affects: [59-04, 60-adapter-contract-claude-code-mvp]

tech-stack:
  added: []
  patterns:
    - Closed connection-scoped capability snapshots omitted from default relay bytes
    - Independent hub and relay reverse maps pinned to one selected target
    - Delete-before-forward final settlement with event-only non-terminal delivery

key-files:
  created: []
  modified:
    - mcp/src/types.ts
    - mcp/src/bridge.ts
    - tests/mcp-reverse-channel-contract.test.js
    - tests/mcp-bridge-topology.test.js

key-decisions:
  - "Advertise agent-spawn only when the bridge has both the closed capability and a handler; configuration without a handler is diagnosed and omitted."
  - "Keep activeExtRequests and relayActiveExtRequests independent from messageOrigin, pendingRequests, and progressListeners."
  - "Treat bridge.auth-status as the sole built-in reverse method and answer it locally after current authority revalidation without consulting capability routing."
  - "Pin every relayed request to its initially selected relay; loss settles with bridge_topology_changed and never replays to another relay or a promoted hub."

patterns-established:
  - "Reverse target pinning: local first, then first connected capable relay in insertion order, then one agent_provider_offline response."
  - "Reverse finalization: events preserve route state; the first final deletes route state before forwarding; late, duplicate, and wrong-relay frames are dropped."

requirements-completed: [CHAN-01, CHAN-02, CHAN-06]

duration: 13 min
completed: 2026-07-13
---

# Phase 59 Plan 03: Deterministic Reverse Router Summary

**Authenticated extension requests now route through a closed local-first/capable-relay topology with independent exactly-once correlation and deterministic no-replay loss behavior.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-07-13T03:06:30Z
- **Completed:** 2026-07-13T03:19:56Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added optional `BridgeOptions.capabilities` and `handleExtRequest` contracts while preserving every default relay hello, welcome, and state byte; unknown/duplicate values are excluded and handler-less spawn claims are omitted.
- Added connection-scoped relay capability snapshots plus separate hub-side and relay-side reverse maps that never share MCP request, response, or progress correlation.
- Implemented current-session `bridge.auth-status` as an exact `{ authorized: true }` acknowledgement with no route allocation, handler call, relay forwarding, or spawn-capability implication.
- Implemented local-first routing, then first connected capable relay in insertion order, then one typed offline response; only the selected relay can emit events or the final response.
- Enforced non-terminal events, delete-before-forward first finals, duplicate-ID rejection, late/spoofed-frame drops, redacted handler failures, and extension/relay/hub cleanup without automatic replay.
- Expanded real-socket topology coverage to 168 assertions, including exact CHAN-06 hub-exit and capable-relay-exit cases while retaining the original independent hub promotion case.

## Task Commits

Each task was committed atomically:

1. **Task 1: Advertise and track optional relay capabilities without legacy byte drift** - `b460166c` (feat)
2. **Task 2: Route authorized ext frames locally or to the first capable relay** - `35136504` (feat)
3. **Task 3: Prove hub-exit and relay-mid-frame behavior without spawn code** - `201ee716` (test)

## Files Created/Modified

- `mcp/src/types.ts` - Optional bridge capability/handler seam and typed reverse handler contract.
- `mcp/src/bridge.ts` - Closed capability registry, local/relay routing, selected-target pinning, independent route maps, and deterministic disconnect settlement.
- `tests/mcp-reverse-channel-contract.test.js` - Closed capability normalization and additive relay serialization contract.
- `tests/mcp-bridge-topology.test.js` - Real-socket local/relay/offline/auth-status, spoof/duplicate/final, extension-close, relay-loss, hub-loss, and promotion coverage.

## Decisions Made

- Require both `agent-spawn` and a handler before the bridge is locally capable or advertises relay capability, so configuration alone cannot grant authority.
- Keep the reverse route record secret-free and target-pinned; it stores only request ID, origin socket, target kind, optional relay ID, and settled state.
- Let capability-bearing relays execute only requests received from their current hub connection, and discard handler completion after hub loss or reconnection.
- Preserve all legacy welcome/state serialization by adding no availability field; capability data exists only in an explicitly capable relay hello.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- A repository-wide `child_process` grep finds pre-existing imports in `mcp/src/client-inventory.ts` and `mcp/src/install.ts`. The Plan 03 commit-range diff contains no `child_process`, supervisor, adapter, or production `agent-spawn` construction; the existing imports are unrelated inventory/install utilities and were left untouched.

## Verification

- `npm --prefix mcp run build` - PASS; TypeScript compiled and the permanent forbidden-agent-flag prebuild gate passed.
- `node tests/mcp-reverse-channel-contract.test.js` - PASS.
- `node tests/mcp-bridge-auth.test.js` - PASS (50 assertions).
- `node tests/mcp-bridge-topology.test.js` - PASS (168 assertions).
- `node tests/mcp-version-parity.test.js` - PASS (16 assertions).
- `npm test` under a Bash-owned cleanup trap with the temporary Phase 39 archive symlink - PASS (exit 0); the link and temporary directory are absent afterward.
- `git diff --check` - PASS.
- Plan 03 commit-range production audit - PASS; no spawn supervisor, adapter, new child-process import, or explicit production `agent-spawn` advertisement was added.

## User Setup Required

None - no external service configuration required.

## Tracking Note

ROADMAP and STATE were intentionally left unchanged for the phase orchestrator, as requested.

## Next Phase Readiness

- Ready for 59-04 to attach the extension pending-map and pairing UI to the authenticated server router.
- No production bridge advertises spawn authority, and no Phase 60 process-spawn implementation exists.

## Self-Check: PASSED

- All four planned implementation/test files exist and are represented in the three scoped task commits.
- Every task acceptance criterion, focused security command, topology churn case, legacy parity gate, and full root suite passed.
- The original `runHubExitPromotion` remains present and executes independently.
- The temporary Phase 39 fixture is absent, the index contains no unrelated staged path, and ROADMAP/STATE remain untouched.

---
*Phase: 59-reverse-request-channel-security-foundation*
*Completed: 2026-07-13*
