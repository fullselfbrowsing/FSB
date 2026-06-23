---
phase: 18-shared-tool-registry-dispatcher-wiring
plan: 03
subsystem: mcp-trigger-registration
tags: [mcp, trigger-tools, shared-registry, task-queue, agent-scope]

requires:
  - phase: 18-shared-tool-registry-dispatcher-wiring
    provides: shared trigger-family registry definitions and background trigger dispatcher handlers from Plans 18-01 and 18-02
provides:
  - MCP trigger-family registrar sourced from TOOL_REGISTRY and jsonSchemaToZod
  - trigger bridge message types and bounded agent-scoped bridge dispatch
  - runtime trigger registration before manual tools
  - manual action exclusion for trigger and queue-bypass proof for trigger companions
affects: [phase-18, phase-19, mcp-trigger-routing, trigger-reporting]

tech-stack:
  added: []
  patterns:
    - trigger MCP schemas are converted from the shared registry at registration time
    - trigger companions dispatch directly and remain protected by TaskQueue registry-derived read-only bypass
    - runtime registers special trigger tools before ordinary manual action tools

key-files:
  created:
    - mcp/src/tools/triggers.ts
  modified:
    - mcp/src/types.ts
    - mcp/src/runtime.ts
    - mcp/src/tools/manual.ts
    - tests/mcp-tool-smoke.test.js
    - tests/trigger-tool-dispatcher.test.js
    - .planning/phases/18-shared-tool-registry-dispatcher-wiring/deferred-items.md

key-decisions:
  - "MCP trigger tools are registered by a trigger-specific registrar from TOOL_REGISTRY rather than through manual visual-session actions."
  - "trigger returns a bounded arm response through mcp:trigger; Phase 19 owns blocking wait, heartbeat, detached mode, and fire/timeout envelopes."
  - "stop_trigger, get_trigger_status, and list_triggers dispatch directly and are also proven to bypass TaskQueue when a mutation is pending."

patterns-established:
  - "MCP special tool families can register from the shared registry while bypassing manual visual-session validation."
  - "TaskQueue starvation tests can instantiate the built queue with a never-resolving mutation and race registry read-only companions."

requirements-completed: [REG-01, REG-02, LIFE-01, LIFE-02, LIFE-03, TRIG-01]

duration: 9min
completed: 2026-06-17
---

# Phase 18 Plan 03: MCP Trigger Registrar Summary

**Registry-sourced MCP trigger tools with bounded agent-scoped bridge dispatch and queue-safe companions**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-17T00:40:38Z
- **Completed:** 2026-06-17T00:49:54Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `mcp/src/tools/triggers.ts` with `registerTriggerTools`, sourced from `TOOL_REGISTRY` and `jsonSchemaToZod`.
- Added MCP message types for `mcp:trigger`, `mcp:stop-trigger`, `mcp:get-trigger-status`, and `mcp:list-triggers`.
- Wired runtime registration before manual tools and excluded `trigger` from the manual visual-session action path.
- Extended MCP smoke coverage for all four trigger tools, bounded timeouts, agent identity, ownership tokens, and no queue calls.
- Extended dispatcher tests to prove registry-derived TaskQueue bypass for trigger companions while a mutation never resolves.

## Task Commits

1. **Task 1 RED: Add MCP trigger registrar smoke coverage** - `a41a0593` (test)
2. **Task 1 GREEN: Register MCP trigger tools from the shared registry** - `56199b01` (feat)
3. **Task 2 RED: Add runtime/manual/queue wiring coverage** - `4ccb3a60` (test)
4. **Task 2 GREEN: Wire trigger registrar into runtime and manual exclusion** - `ea6a31bf` (feat)

_No refactor commit was needed._

## Files Created/Modified

- `mcp/src/tools/triggers.ts` - trigger-specific MCP registrar and bridge message mapping.
- `mcp/src/types.ts` - trigger-family MCP bridge message type entries.
- `mcp/src/runtime.ts` - runtime call to `registerTriggerTools` before manual registration.
- `mcp/src/tools/manual.ts` - `trigger` exclusion from ordinary manual visual-session validation.
- `tests/mcp-tool-smoke.test.js` - packaged registrar and bridge dispatch smoke coverage.
- `tests/trigger-tool-dispatcher.test.js` - MCP source assertions and actual TaskQueue bypass proof.
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/deferred-items.md` - wave-level route-contract follow-up confirmation.

## Decisions Made

- `trigger` is registered by the trigger registrar, not manual tools, so it does not require `visual_reason`, `client`, or `is_final`.
- The trigger registrar sends caller params as the bounded bridge payload and lets `sendAgentScopedBridgeMessage` add FSB-minted `agentId` and ownership token.
- `target_tab_id` participates in ownership-token selection alongside `tab_id` and `tabId`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first Task 1 GREEN run exposed a smoke-test ordering issue: seeding a tab-specific ownership token before an existing no-tab `back` assertion changed the harness' current token. The trigger assertions were moved into the explicit-tab section before the Task 1 GREEN commit.
- Wave-level verification still fails in `tests/mcp-tool-routing-contract.test.js` because direct trigger dispatcher routes are explicitly owned by Plan 18-04. This is logged in `deferred-items.md`.

## Verification

- Passed: `npm --prefix mcp run build && node tests/mcp-tool-smoke.test.js`
- Passed: `npm --prefix mcp run build && node tests/trigger-tool-dispatcher.test.js`
- Passed: `npm --prefix mcp run build && node tests/mcp-tool-smoke.test.js && node tests/trigger-tool-dispatcher.test.js`
- Expected fail: `npm test && npm --prefix mcp run build && npm run test:mcp-smoke:tools` stops in `tests/mcp-tool-routing-contract.test.js` on missing trigger direct routes deferred to Plan 18-04.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 18-04 can wire direct MCP dispatcher routes and autopilot executor cases to the same background trigger dispatcher now that MCP server registration, agent-scoped bridge messages, and queue-safe companion behavior are in place.

## Self-Check: PASSED

- Verified `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-03-SUMMARY.md` exists.
- Verified `mcp/src/tools/triggers.ts` exists.
- Verified task commits `a41a0593`, `56199b01`, `4ccb3a60`, and `ea6a31bf` exist in git history.
- Re-ran focused verification successfully before summary closeout.

---
*Phase: 18-shared-tool-registry-dispatcher-wiring*
*Completed: 2026-06-17*
