---
phase: 18-shared-tool-registry-dispatcher-wiring
plan: 01
subsystem: registry
tags: [tool-registry, trigger-tools, mcp, provider-parity, visual-session-schema]

requires:
  - phase: 14-trigger-survivability-foundation
    provides: storage-backed trigger lifecycle and alarm survivability
  - phase: 15-fire-condition-engine-value-extraction
    provides: condition evaluation and extraction semantics consumed by trigger schemas
  - phase: 16-live-observe-watch-analyzing-pulse
    provides: live-observe and trigger read content contracts
  - phase: 17-refresh-poll-watch-tab-owning-background-reload
    provides: refresh-poll interval and attention-state semantics
provides:
  - canonical trigger-family tool definitions in the shared registry
  - byte-identical MCP registry mirror with trigger-family schemas
  - parity tests for trigger additivity, provider visibility, and visual-session bypass classification
affects: [phase-18, mcp-tool-routing, autopilot-provider-formatting, trigger-dispatcher]

tech-stack:
  added: []
  patterns:
    - shared TOOL_REGISTRY remains the single source of truth for MCP and autopilot tool schemas
    - non-trigger registry additivity is guarded by a locked SHA-256 baseline
    - MCP mirror identity is enforced with Buffer.compare

key-files:
  created:
    - .planning/phases/18-shared-tool-registry-dispatcher-wiring/deferred-items.md
  modified:
    - extension/ai/tool-definitions.js
    - mcp/ai/tool-definitions.cjs
    - tests/tool-definitions-parity.test.js
    - tests/visual-session-schema-lock.test.js

key-decisions:
  - "Register trigger tools as plain background-routed registry entries, not visual-session action tools."
  - "Mark stop_trigger, get_trigger_status, and list_triggers _readOnly:true so downstream queues can derive bypass behavior from the shared registry."
  - "Keep trigger.condition as a JSON Schema object and leave nested validation to the trigger runtime."

patterns-established:
  - "Provider visibility tests format getPublicTools() output through every supported provider key."
  - "Registry additivity is tested by hashing all non-trigger definitions after excluding the trigger family."

requirements-completed: [REG-01, REG-03, REG-04, TRIG-01, LIFE-01, LIFE-02, LIFE-03]

duration: 6min
completed: 2026-06-16
---

# Phase 18 Plan 01: Shared Tool Registry Dispatcher Wiring Summary

**Shared trigger-family registry schemas with byte-identical MCP mirror and provider/schema parity locks.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-16T21:15:45Z
- **Completed:** 2026-06-16T21:21:07Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` once to `TOOL_REGISTRY`.
- Mirrored `extension/ai/tool-definitions.js` to `mcp/ai/tool-definitions.cjs` byte-identically.
- Extended parity tests to prove non-trigger schemas stayed unchanged and all seven provider envelopes expose the trigger family.
- Extended visual-session schema locks so trigger companions are bypass/read-only definitions without `visual_reason`, `client`, or `is_final`.

## Task Commits

1. **Task 1 RED: Add Wave 0 registry parity and provider visibility assertions** - `34b9d647` (test)
2. **Task 2 GREEN: Add trigger-family definitions once and mirror them byte-identically** - `d20e3ea8` (feat)

_No refactor commit was needed._

## Files Created/Modified

- `extension/ai/tool-definitions.js` - canonical trigger-family registry definitions.
- `mcp/ai/tool-definitions.cjs` - byte-identical MCP mirror of the canonical registry.
- `tests/tool-definitions-parity.test.js` - trigger additivity, mirror identity, and provider visibility assertions.
- `tests/visual-session-schema-lock.test.js` - read-only companion and no-visual-field schema locks.
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/deferred-items.md` - recorded the known full-suite route-contract follow-up.

## Decisions Made

- `trigger` is side-effecting (`_readOnly:false`) but is not wrapped with `withVisualSessionFields`.
- `stop_trigger`, `get_trigger_status`, and `list_triggers` are `_readOnly:true` despite `stop_trigger` mutating trigger state, because cancellation/status tools must bypass queued mutation work.
- The schema keeps `condition` as an object instead of hand-authoring nested validation in the registry.

## Deviations from Plan

None - plan implementation executed as written.

## Issues Encountered

- The focused command `node tests/tool-definitions-parity.test.js && node tests/visual-session-schema-lock.test.js` passes.
- The wave-level command `npm test && npm --prefix mcp run build && npm run test:mcp-smoke:tools` currently fails in `tests/mcp-tool-routing-contract.test.js` because the new background-routed trigger tools do not yet have direct MCP route contracts. That wiring is explicitly owned by Plan 18-04 and was logged in `deferred-items.md`.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 18-02 can build background trigger handlers against the shared schema surface. Plan 18-04 must close the expected route-contract gap introduced by exposing the new background-routed trigger tools.

## Self-Check: PASSED

- Verified summary, deferred item, registry, mirror, and test files exist.
- Verified task commits `34b9d647` and `d20e3ea8` exist in git history.
- Re-ran focused verification successfully.

---
*Phase: 18-shared-tool-registry-dispatcher-wiring*
*Completed: 2026-06-16*
