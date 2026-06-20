---
phase: 19-mcp-tools-blocking-detached-reporting
plan: 01
subsystem: mcp
tags: [trigger, mcp, bridge, heartbeat, detached, schema]

requires:
  - phase: 18-shared-tool-registry-dispatcher-wiring
    provides: shared trigger registry, direct MCP trigger routes, and companion bypass
provides:
  - Additive trigger reporting schema fields for blocking/detached mode
  - MCP-side trigger_id generation and bridge-disconnect partial recovery
  - Extension bridge blocking wait with 30s heartbeats and safety auto-detach
affects: [phase-19, trigger-runtime, mcp-tools, bridge-client]

tech-stack:
  added: []
  patterns: [MCP progress notification mapping, storage-backed blocking wait, safety auto-detach]

key-files:
  created:
    - tests/trigger-blocking-reporting.test.js
  modified:
    - extension/ai/tool-definitions.js
    - mcp/ai/tool-definitions.cjs
    - mcp/src/tools/triggers.ts
    - extension/ws/mcp-bridge-client.js
    - tests/mcp-tool-smoke.test.js
    - tests/tool-definitions-parity.test.js
    - tests/visual-session-schema-lock.test.js
    - package.json

key-decisions:
  - "MCP pre-generates trigger_id before mcp:trigger dispatch so blocking heartbeats and SW-eviction recovery have stable correlation."
  - "The extension bridge waits by polling FsbTriggerStore snapshots; background trigger runtime remains the watcher/evaluator source of truth."
  - "SW-evicted blocking triggers return structured JSON directly, even when success:false, because armed partial state is an intentional detached outcome rather than a tool error."

patterns-established:
  - "Blocking trigger wrapper: dispatch bounded arm route once, then report from persisted snapshots with paired timer cleanup."
  - "Detached trigger path: return outcome:'detached' immediately with no heartbeat interval."
  - "Safety ceiling: convert long blocking waits to detached without deleting or stopping the persisted trigger snapshot."

requirements-completed: [REPORT-01, REPORT-02, REPORT-03]

duration: 12min
completed: 2026-06-17
---

# Phase 19 Plan 01: MCP Trigger Reporting Envelope Summary

**Blocking-by-default MCP trigger reporting with generated trigger IDs, progress heartbeats, detached opt-in, safety auto-detach, and SW-eviction partial recovery**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-17T02:18:00Z
- **Completed:** 2026-06-17T02:30:05Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added trigger reporting fields: `trigger_id`, `detached`, `timeout_ms`, `safety_ceiling_ms`, and `rearm_on_fire`.
- Updated the MCP trigger registrar to generate IDs, set blocking/detached bridge options, map trigger progress to MCP notifications, and recover from `Bridge disconnected`.
- Added extension-side `_handleTrigger` blocking wait logic with `FsbTriggerStore` snapshot reads, 30s heartbeats, terminal fired/timed_out hooks, and safety auto-detach.
- Added focused VM/source coverage for schema fields, generated IDs, detached returns, heartbeat cleanup, safety auto-detach, and SW-evicted partial results.

## Task Commits

1. **Task 1: Add Wave 0 blocking-reporting schema and bridge tests** - `65512773` (test)
2. **Task 2: Add additive trigger reporting schema and MCP registrar correlation** - `5476b9e8` (feat)
3. **Task 3: Implement extension bridge blocking wait, heartbeat, and safety auto-detach** - `0d3ad57a` (feat)

## Files Created/Modified

- `tests/trigger-blocking-reporting.test.js` - Focused Phase 19 reporting contract harness.
- `extension/ai/tool-definitions.js` - Additive trigger reporting schema fields.
- `mcp/ai/tool-definitions.cjs` - Byte-identical schema mirror.
- `mcp/src/tools/triggers.ts` - MCP trigger ID generation, progress mapping, blocking bridge options, and disconnect recovery.
- `extension/ws/mcp-bridge-client.js` - Trigger blocking wait, heartbeats, safety auto-detach, and timer cleanup.
- `tests/mcp-tool-smoke.test.js` - Blocking/detached bridge option assertions.
- `tests/tool-definitions-parity.test.js` - Trigger reporting schema parity assertions.
- `tests/visual-session-schema-lock.test.js` - Trigger reporting fields kept out of visual-session action bundle.
- `package.json` - Root test chain includes trigger blocking reporting test.

## Decisions Made

- Keep timeout response support in the bridge wait wrapper, with Phase 19 Plan 02 responsible for durable timeout cleanup in the trigger runtime.
- Use agent-scoped `mcp:get-trigger-status` for bridge-disconnect recovery so persisted state lookup preserves ownership routing.
- Keep safety auto-detach response-only in this plan; it leaves the trigger armed for companion polling or explicit stop.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

- The first MCP smoke assertion requested default blocking mode but expected a timeout above the safety ceiling. The test was corrected to request `timeout_ms: 600000`, which exercises the intended safety-ceiling bridge timeout path.

## User Setup Required

None - no external service configuration required.

## Verification

- `node tests/trigger-blocking-reporting.test.js && node --check extension/ws/mcp-bridge-client.js` - 31 passed.
- `node tests/tool-definitions-parity.test.js && node tests/visual-session-schema-lock.test.js` - 249 + 338 passed.
- `npm --prefix mcp run build && node tests/mcp-tool-smoke.test.js` - build passed, 116 passed.

## Next Phase Readiness

Wave 2 can now settle blocking trigger calls on real runtime outcomes: persisted fire events, terminal timeout cleanup, and status/list projection can build on the envelope created here.

---
*Phase: 19-mcp-tools-blocking-detached-reporting*
*Completed: 2026-06-17*
