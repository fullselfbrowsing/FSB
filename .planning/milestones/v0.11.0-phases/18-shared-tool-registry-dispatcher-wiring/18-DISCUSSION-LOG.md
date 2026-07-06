# Phase 18: Shared Tool Registry & Dispatcher Wiring - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md -- this log preserves the analysis.

**Date:** 2026-06-16
**Phase:** 18-shared-tool-registry-dispatcher-wiring
**Mode:** assumptions
**Areas analyzed:** Shared Registry, Queue Bypass, Dispatcher Wiring, Status Shape

## Assumptions Presented

### Shared Registry

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| The four trigger tools are added once to the shared `TOOL_REGISTRY` in `extension/ai/tool-definitions.js` and mirrored byte-identically in `mcp/ai/tool-definitions.cjs`; existing tool schemas stay unchanged. | Confident | `extension/ai/tool-definitions.js`; `mcp/ai/tool-definitions.cjs`; `mcp/src/tools/schema-bridge.ts`; `tests/tool-definitions-parity.test.js`; `tests/visual-session-schema-lock.test.js` |

### Queue Bypass

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| `stop_trigger`, `get_trigger_status`, and `list_triggers` must be bypass tools, with `trigger` only arming a background watcher in Phase 18 rather than holding the mutation queue for the watch duration. | Likely | `mcp/src/queue.ts`; `mcp/src/tools/read-only.ts`; `mcp/src/tools/autopilot.ts`; `tests/mcp-tool-smoke.test.js`; `.planning/STATE.md` REG-02 risk |

### Dispatcher Wiring

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Registry exposure is not sufficient; Phase 18 must add direct trigger routes in `extension/ws/mcp-tool-dispatcher.js` and route them to background/service-worker trigger handlers. | Confident | `extension/ws/mcp-bridge-client.js`; `extension/ws/mcp-tool-dispatcher.js`; `tests/mcp-tool-routing-contract.test.js`; `extension/background.js`; `extension/utils/trigger-manager.js`; `extension/utils/trigger-lifecycle.js` |

### Status Shape

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| `stop_trigger`, `get_trigger_status`, and `list_triggers` should report from persisted trigger snapshots, not SW heap or `activeSessions`; status/list output should mirror existing plain JSON MCP envelopes with IDs, status, condition, watch mode, values, owner, age/remaining, and attention fields. | Likely | `extension/utils/trigger-store.js`; `extension/utils/trigger-lifecycle.js`; `extension/background.js`; `extension/ws/mcp-tool-dispatcher.js` |

## Corrections Made

No corrections were made. This Conductor default run proceeded with codebase-derived assumptions and no interactive correction pass.

## External Research

None. The codebase and existing planning artifacts provided enough evidence.
