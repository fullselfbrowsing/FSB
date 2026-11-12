---
phase: 57-agent-identity-capture
plan: "01"
subsystem: mcp
tags: [mcp, client-info, platform-detection, websocket-bridge, node-execfile]

# Dependency graph
requires: []
provides:
  - Lazy MCP initialize clientInfo capture for every runtime transport
  - Process-lifetime installed-client inventory across the PLATFORMS registry
  - Additive inventory delivery through system frame and agent registration
affects: [57-02-extension-ingestion, 57-03-merged-view, 58-providers-panel, 60-claude-code-adapter]

# Tech tracking
tech-stack:
  added: []
  patterns: [feature-detected lazy suppliers, process-lifetime Promise memoization, fixed-argv execFile probing]

key-files:
  created:
    - mcp/src/client-inventory.ts
    - tests/mcp-client-identity.test.js
    - tests/mcp-client-inventory.test.js
  modified:
    - mcp/src/agent-scope.ts
    - mcp/src/runtime.ts
    - mcp/src/types.ts
    - mcp/src/index.ts
    - tests/agent-scope.test.js

key-decisions:
  - "Read SDK clientInfo and installed-client inventory lazily through feature-detected AgentScope suppliers so structural mocks and the exact bare-scope payload remain compatible."
  - "Reuse PLATFORMS and resolvePlatformTarget for every non-Claude client, while probing Claude Code with fixed candidates, argv, timeout, and no shell."
  - "Deliver one memoized inventory through both a tolerant system:client-inventory frame and the agent:register platforms piggyback."

patterns-established:
  - "Optional registration evidence is included only when a supplier resolves a non-empty, allowlisted shape."
  - "Machine-state probes are dependency-injected in tests and memoized once for the daemon lifetime."

requirements-completed: [IDENT-02, IDENT-04]

# Metrics
duration: 11 min
completed: 2026-07-12
---

# Phase 57 Plan 01: MCP Client Identity and Inventory Summary

**Lazy MCP handshake identity plus a cached 21-client platform sweep, delivered additively without changing the legacy empty registration payload**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-12T12:20:33Z
- **Completed:** 2026-07-12T12:32:18Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Threaded initialized MCP `clientInfo.name` and `clientInfo.version` through the common runtime factory for stdio and streamable HTTP.
- Added a memoized installed-client inventory that reuses every `PLATFORMS` entry and performs a bounded, shell-free Claude Code version probe.
- Delivered inventory through both the tolerant `system:client-inventory` system frame and the late-connect `agent:register.payload.platforms` convergence path.
- Preserved the exact `{ type: 'agent:register', payload: {} }` message for a bare scope with no evidence suppliers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread lazy MCP clientInfo through agent registration** - `ea47c50d` (feat)
2. **Task 2: Detect and deliver the installed MCP-client inventory** - `7938c38e` (feat)

## Files Created/Modified

- `mcp/src/client-inventory.ts` - Registry sweep, fixed Claude version probe, memoization, test injection, and tolerant system-frame push.
- `mcp/src/agent-scope.ts` - Lazy client identity and inventory suppliers with additive registration payload construction.
- `mcp/src/runtime.ts` - Common supplier wiring for all MCP transports with structural-mock feature detection.
- `mcp/src/types.ts` - Additive `system:client-inventory` message type.
- `mcp/src/index.ts` - Fire-and-tolerate inventory push after stdio and serve bridge connection.
- `tests/agent-scope.test.js` - Deep-equality freeze for the exact legacy registration message.
- `tests/mcp-client-identity.test.js` - Identity shape, laziness, single registration, transport-factory, and mock compatibility contracts.
- `tests/mcp-client-inventory.test.js` - Full registry, resolver reuse, probe safety/fallthrough, memoization, dual-delivery, and redacted failure contracts.

## Decisions Made

- Identity remains observability metadata: only string `name` and `version` fields cross the daemon bridge, and unknown supplier properties are dropped.
- Inventory detection remains daemon-only and dependency-free, with callback-based `execFile` and exact fixed options rather than a shell.
- The completed inventory Promise is cached for process lifetime so the CLI probe cannot repeat per registration or HTTP session.

## Verification

- `npm --prefix mcp run build` - PASS
- `node tests/agent-scope.test.js` - PASS
- `node tests/mcp-client-identity.test.js` - PASS
- `node tests/mcp-client-inventory.test.js` - PASS
- `node tests/mcp-install-platforms.test.js` - PASS (41 assertions)
- Task 1 acceptance criteria - PASS
- Task 2 acceptance criteria - PASS
- Wave 1 full `npm test` gate remains intentionally pending until Plan 57-02 also completes, as specified by the plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed locked MCP development dependencies**
- **Found during:** Task 1 baseline verification
- **Issue:** `npm --prefix mcp run build` could not start because the workspace had no `mcp/node_modules` and `tsc` was unavailable.
- **Fix:** Ran `npm --prefix mcp ci` against the existing lockfile; no dependency versions or tracked package files changed.
- **Files modified:** None tracked (`mcp/node_modules` is local-only).
- **Verification:** The TypeScript build and every focused contract exited 0.
- **Committed in:** Not committed (local execution environment only).

**2. [Rule 3 - Blocking] Kept the Task 1 runtime identity fixture independent of the real machine PATH**
- **Found during:** Task 2 inventory supplier integration
- **Issue:** The existing `createRuntime()` identity fixture would invoke the newly injected real inventory detector and make the unit test depend on locally installed CLIs.
- **Fix:** Injected an empty test registry around that fixture, then reset production dependencies; the identity assertion remains exact and deterministic.
- **Files modified:** `tests/mcp-client-identity.test.js`
- **Verification:** Identity and inventory suites both exit 0 in isolated Node processes.
- **Committed in:** `7938c38e`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were limited to execution reliability and deterministic tests; production scope and wire behavior were unchanged.

## Issues Encountered

None beyond the auto-fixed execution issues documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Daemon-side identity and installed-client evidence are ready for Plan 57-02 to sanitize, persist, and merge on the extension side.
- No blockers. The conditional Wave 1 full-regression gate should run only after Plan 57-02 is complete.

## Self-Check: PASSED

- All three created files and the summary exist on disk.
- Task commits `ea47c50d` and `7938c38e` exist in git history.
- `requirements-completed` exactly matches `[IDENT-02, IDENT-04]`.

---
*Phase: 57-agent-identity-capture*
*Completed: 2026-07-12*
