---
phase: 59-reverse-request-channel-security-foundation
plan: "04"
subsystem: security
tags: [websocket, extension, pairing, session-storage, reverse-routing, providers-ui]

requires:
  - phase: 59-03
    provides: Authenticated local-first reverse router with deterministic topology-loss settlement
provides:
  - Pairing-aware MV3 WebSocket construction with authenticated status probing
  - Bounded extension reverse-request correlation with event/final/timeout/close cleanup
  - Session-only Providers pairing controls and secret-free service-worker reload dispatch
  - Complete automated/source verification with four honest milestone-end live checks
affects: [60-adapter-contract-claude-code-mvp]

tech-stack:
  added: []
  patterns:
    - Trusted session credential is offered only as a WebSocket subprotocol and never serialized into public state
    - Reverse application requests are connection-scoped, settle once, and are never replayed after topology change
    - Pairing UI writes session storage directly while runtime dispatch carries only a secret-free reload action

key-files:
  created:
    - .planning/phases/59-reverse-request-channel-security-foundation/59-HUMAN-UAT.md
  modified:
    - extension/ws/mcp-bridge-client.js
    - extension/background.js
    - extension/ui/control_panel.html
    - extension/ui/options.js
    - extension/ui/options.css
    - tests/mcp-bridge-client-lifecycle.test.js
    - tests/mcp-bridge-background-dispatch.test.js
    - tests/agent-grace.test.js
    - tests/providers-panel-logic.test.js
    - tests/providers-panel-ui.test.js

key-decisions:
  - "Treat WebSocket open as configured only; promote to paired exclusively after an exact secret-free bridge.auth-status { authorized: true } response."
  - "Reject every outstanding reverse request with bridge_topology_changed before reconnect and never retain an application frame for replay."
  - "Keep the pairing code outside providerPanelState, defaultSettings, Save/Discard, local/sync storage, logs, toasts, runtime messages, and restored DOM values."
  - "Preserve exactly four live Chrome checks as pending milestone-end UAT while keeping every automated and source gate blocking."

patterns-established:
  - "Authority reload: re-read trusted session storage, close/replace once, then probe current authority before claiming paired."
  - "Pairing UX: password input clears immediately after the session write begins; returned closed status selects exact honest copy."

requirements-completed: [CHAN-01, CHAN-03, CHAN-04, CHAN-05, CHAN-06]

duration: 22 min
completed: 2026-07-13
---

# Phase 59 Plan 04: Extension Reverse Pairing Summary

**The extension now authenticates to the local reverse bridge with a session-only credential, correlates reverse events/finals without replay, and exposes an accessible pairing flow whose runtime and durable settings paths remain secret-free.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-13T03:22:45Z
- **Completed:** 2026-07-13T03:45:06Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added guarded session preload and exact pairing-record validation while preserving the legacy one-argument WebSocket constructor for unpaired clients and offering exactly the stable/auth protocols for configured clients.
- Added authenticated `bridge.auth-status` probing so socket-open remains configured, exact authorization becomes paired, rejection becomes expired, and offline reload remains honestly configured.
- Added `sendExtRequest` with bounded timeouts, one optional event callback, first-final settlement, stable typed errors, close cleanup, late/duplicate drops, and no reconnect replay.
- Added a secret-free `reloadMcpBridgePairing` service-worker action that rejects credential-bearing request keys before invoking the bridge client.
- Added the Local bridge pairing section between Agent Setup and Usage with labeled password input, accessible status, session-only pair/remove behavior, responsive token-based styling, and no coupling to provider Save/Discard state.
- Recorded exactly four pending live checks for real pairing, daemon rotation, Chrome session clearing, and accessibility/theme review without fabricating results.
- Closed every focused Phase 59 gate, source audit, and the complete root suite under the required temporary-fixture cleanup trap.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pairing-aware connection construction and the reverse pending map** - `c42a38ec` (feat)
2. **Task 2: Add the explicit Providers pairing control with session-only persistence** - `058c2231` (feat)
3. **Task 3: Close automated verification and record deferred live UAT** - `b1b57860` (docs)

## Files Created/Modified

- `extension/ws/mcp-bridge-client.js` - Trusted pairing preload, protocol construction, authenticated reload/probe state, reverse pending map, and no-replay cleanup.
- `extension/background.js` - Secret-free pairing reload action with forbidden credential-field rejection.
- `extension/ui/control_panel.html` - Accessible Local bridge pairing controls inside Agent CLI details.
- `extension/ui/options.js` - Exact validation, direct session storage pair/remove, public-state-only reload, and honest status rendering.
- `extension/ui/options.css` - Responsive, theme-token, focus-visible, wrap-safe, reduced-motion pairing styles.
- `tests/mcp-bridge-client-lifecycle.test.js` - Pairing construction/probe/reload and complete reverse lifecycle coverage.
- `tests/mcp-bridge-background-dispatch.test.js` - Secret-free action and credential-bearing request rejection coverage.
- `tests/agent-grace.test.js` - Source-pin adaptation for the client's guarded asynchronous pairing preload.
- `tests/providers-panel-logic.test.js` - Static placement, input, copy, and provider-radio boundary contracts.
- `tests/providers-panel-ui.test.js` - Session/runtime mocks and pair/configured/expired/remove/error/storage isolation coverage.
- `.planning/phases/59-reverse-request-channel-security-foundation/59-HUMAN-UAT.md` - Four pending milestone-end live checks.

## Decisions Made

- Validate the session record as an exact two-key object with a finite timestamp before retaining the credential in client memory.
- Persist only the closed pairing status in `mcpBridgeState`; never expose the code, protocol list, fingerprint, or auth material from `getState()`.
- Insert reverse pending state before sending and delete it before resolving/rejecting so duplicate and late finals cannot settle twice.
- Treat pairing removal as successful after the trusted session key is removed even if the background reload is temporarily unavailable; visible copy states only that the pairing was removed.
- Read only `mcpBridgeState` during UI initialization, always blank the password field, and let the background/client own credential inspection.

## Deviations from Plan

None - plan executed exactly as written. The `tests/agent-grace.test.js` source pin was updated as explicitly required after the guarded asynchronous preload changed connection timing.

## Issues Encountered

- The provider VM harness initially compared a VM-created key array with a host array using strict prototype-sensitive equality. The session mock now normalizes requested keys through `Array.from`, retaining the exact production behavior while making the assertion realm-independent.
- Repository-wide `child_process` search still finds pre-existing inventory/install imports. The Phase 59 commit-range audit is clean: no child-process import, SpawnSupervisor, adapter implementation, agent-provider directory, or production `agent-spawn` advertisement was added.
- The worktree already contained user-owned planning deletions, generated MCP output, and showcase public-file changes. They remained unstaged and outside all Plan 04 commits; the MCP build reproduced the pre-run `mcp/build/index.js` hash exactly.

## Verification

- Exact Plan 04 focused command - PASS: MCP build, reverse contract, auth (50 assertions), topology, version parity, lifecycle (104 assertions), background dispatch (66 assertions), redaction/ring, forbidden scanner, provider logic/UI, and lattice (110 assertions).
- Task 1 compatibility cluster - PASS: identity integration, agent grace, heartbeat (17 assertions), and dispatcher label (51 assertions).
- Task 2 compatibility cluster - PASS: model discovery UI (79 assertions), redaction, diagnostics, and all provider/lattice invariants.
- Source audits - PASS: no credential in bridge URL/ext payload/public status, no durable pairing setting, no production spawn capability, and no Phase 59 spawn/supervisor/adapter implementation.
- `npm test` with the temporary Phase 39 archive symlink under a shell cleanup trap - PASS (exit 0).
- UAT ledger contract - PASS: exact frontmatter, exactly four checks/results pending, complete prerequisites/steps/expected results, and no claimed live result.
- `git diff --check` - PASS.
- Temporary Phase 39 fixture - absent after the full suite; staging area contained only each explicitly committed task file.

## User Setup Required

None for automated completion. The four real Chrome/daemon observations remain intentionally deferred to the user's milestone-end UAT sweep.

## Tracking Note

ROADMAP and STATE were intentionally left unchanged for the phase orchestrator, as requested.

## Next Phase Readiness

- Phase 60 can use `sendExtRequest` over an authenticated, connection-scoped channel without adding credential transport or replay behavior.
- Production still advertises no spawn capability and contains no Phase 60 agent adapter/process implementation.
- Live pairing/browser evidence is preserved in the pending milestone-end checklist and does not replace any automated security gate.

## Self-Check: PASSED

- All planned implementation, UI, test, and UAT artifacts exist and are represented in three scoped task commits.
- Every CHAN-01/03/04/05/06 acceptance criterion and the Phase-wide CHAN-01–07 automated/source matrix passed.
- Exactly four live UAT checks remain pending; no other verification item is deferred.
- The temporary archive fixture is absent, no unrelated file is staged, and ROADMAP/STATE remain untouched.

---
*Phase: 59-reverse-request-channel-security-foundation*
*Completed: 2026-07-13*
