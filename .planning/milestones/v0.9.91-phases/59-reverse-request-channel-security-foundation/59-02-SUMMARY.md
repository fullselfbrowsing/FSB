---
phase: 59-reverse-request-channel-security-foundation
plan: "02"
subsystem: security
tags: [websocket, pairing, origin, host, loopback, session-rotation]

requires:
  - phase: 59-01
    provides: Strict ext-frame contract, bridge-secret redaction, and permanent forbidden-flag gate
provides:
  - Atomic private bridge auth state with durable exact Origin and rotating daemon-session authority
  - Explicit pair and pair-reset CLI lifecycle with secret-free status and doctor output
  - Loopback-only HTTP upgrade gate before WebSocket registration
  - Per-ext-frame socket session revalidation and immediate stale-socket revocation
affects: [59-03, 59-04, 60-adapter-contract-claude-code-mvp]

tech-stack:
  added: []
  patterns:
    - Atomic 0600 same-directory temp write and rename for bridge authority state
    - HTTP upgrade classification before noServer WebSocket handleUpgrade
    - WeakMap socket authority metadata revalidated against current shared state per ext frame

key-files:
  created:
    - mcp/src/bridge-auth.ts
    - tests/mcp-bridge-auth.test.js
  modified:
    - mcp/src/index.ts
    - mcp/src/bridge.ts
    - tests/mcp-bridge-topology.test.js
    - package.json

key-decisions:
  - "Keep only the exact extension Origin durable; every serve startup and explicit reset rotates both the secret and sessionId."
  - "Permit wrong or absent credentials to retain legacy MCP connectivity for an exact allowed Origin, but permanently classify that socket as lacking ext authority."
  - "Select only fsb-ext-v1 in the WebSocket response and keep the fsb-auth credential confined to the offered upgrade protocols."

patterns-established:
  - "Upgrade boundary: validate exact bind, Host, Origin, current credential, and first-Origin binding before handleUpgrade and registration."
  - "Revocation boundary: every ext frame re-reads auth state and closes an already-open socket after any session rotation, reset, missing state, or Origin mismatch."

requirements-completed: [CHAN-03, CHAN-04]

duration: 21 min
completed: 2026-07-13
---

# Phase 59 Plan 02: Bridge Pairing and Pre-Upgrade Trust Boundary Summary

**Private rotating daemon-session pairing now gates exact loopback WebSocket upgrades, with accepted socket authority revoked on the first ext frame after any external rotation or reset.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-07-13T02:45:11Z
- **Completed:** 2026-07-13T03:06:02Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added a closed version-1 auth store under `~/.fsb/bridge-auth.json` with 0700 directory mode, atomic 0600 file replacement, a 32-byte base64url secret, separate session ID, exact durable extension Origin, and fail-closed malformed/symlink handling.
- Added `fsb-mcp-server pair [--reset]`; ordinary serve startup rotates only session authority, while reset is the sole Origin-clearing operation and rotates both the secret and session ID before disclosure.
- Replaced the internally listening WebSocket server with an explicit loopback HTTP server and `WebSocketServer({ noServer: true })`, rejecting hostile Host/Origin input before `handleUpgrade` or connection registration.
- Stored exact Origin/session metadata privately on accepted sockets, selected only `fsb-ext-v1`, and re-read current auth state for every ext frame so already-open sockets close with one generic unauthorized response after rotation/reset.
- Expanded real-socket coverage to 111 assertions across hostile headers, missing/wrong/old credentials, first bind/reconnect, reset/new-ID rebind, active-socket rotation/reset, origin-less relay compatibility, and hub promotion.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the atomic daemon-session auth store and pairing CLI lifecycle** - `de25b553` (feat)
2. **Task 2: Refactor hub startup to a loopback-only pre-handler HTTP upgrade gate** - `e63fb4ab` (feat)
3. **Task 3: Run the security slice and full-suite regression gate** - `542aa006` (test)

## Files Created/Modified

- `mcp/src/bridge-auth.ts` - Closed auth schema, atomic private persistence, session rotation/reset, exact Origin binding, constant-time protocol comparison, and pairing formatting.
- `mcp/src/index.ts` - Pair CLI routing/output and serve-before-listen session rotation.
- `mcp/src/bridge.ts` - Loopback bind guard, explicit HTTP upgrade gate, stable-protocol selection, private socket metadata, and per-frame revocation.
- `tests/mcp-bridge-auth.test.js` - Filesystem, rotation, reset/rebind, protocol, CLI output, and disclosure contracts.
- `tests/mcp-bridge-topology.test.js` - Real hostile-upgrade, authorization, active-socket revocation, relay compatibility, and promotion fixtures.
- `package.json` - Auth contract test inserted once after the reverse-channel contract gate.

## Decisions Made

- Canonicalize the optional trailing slash on a syntactically valid extension Origin to its exact `chrome-extension://<id>` authority before durable comparison/binding.
- Return a temporary `agent_provider_offline` no-router response only for a currently authorized request; Plan 03 replaces this seam with deterministic capability routing.
- Preserve origin-less Node relay classification and all legacy MCP frames while denying those sockets extension-originated reverse authority.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first compact full-suite wrapper used zsh's read-only `status` variable after the tests completed; the cleanup trap ran and the suite was rerun with a neutral variable.
- A subsequent run lost the temporary Phase 39 symlink before the historical coverage test and failed only with that fixture `ENOENT`; a single Bash-owned trap rerun completed with exit 0 and removed the link and empty parent.

## Verification

- `npm --prefix mcp run build` - PASS; TypeScript compiled after the permanent forbidden-flag prebuild scan.
- Focused Plan 02 gate - PASS: reverse contract, 50 auth assertions, 111 topology assertions, 16 version-parity assertions, redaction, diagnostic sink, and forbidden-flag tests.
- `npm test` with the temporary Phase 39 archive symlink under a shell trap - PASS (exit 0); the link and empty temporary parent are absent afterward.
- `git diff --check` - PASS.
- Production-source audit - PASS; no process-spawn implementation, production `agent-spawn` advertisement, Plan 03 route map, or Plan 04 client/UI work was added.

## User Setup Required

None - no external service configuration required.

## Tracking Note

ROADMAP and STATE were intentionally left unchanged for the phase orchestrator because their current progress helpers can count collapsed/deleted historical phase trees and corrupt active milestone totals.

## Next Phase Readiness

- Ready for 59-03 to add optional capability advertisement and deterministic reverse routing on top of the authenticated socket boundary.
- The temporary no-router response is isolated and no production process-spawn capability is advertised.

## Self-Check: PASSED

- Both created files exist and all six planned files are represented in the three scoped task commits.
- Every task acceptance criterion, focused security command, and final full-suite gate passed.
- No unrelated user change is staged; the temporary Phase 39 fixture is absent.

---
*Phase: 59-reverse-request-channel-security-foundation*
*Completed: 2026-07-13*
