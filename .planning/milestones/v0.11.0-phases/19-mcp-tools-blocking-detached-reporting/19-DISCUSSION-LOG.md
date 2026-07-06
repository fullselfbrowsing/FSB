# Phase 19: MCP Tools & Blocking/Detached Reporting - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md -- this log preserves the analysis.

**Date:** 2026-06-17
**Phase:** 19-MCP Tools & Blocking/Detached Reporting
**Mode:** assumptions
**Areas analyzed:** MCP API defaults, blocking wait placement, fire/timeout outcomes, detached owner lifecycle, re-arm-on-fire, tests

## Assumptions Presented

### MCP API Defaults

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| `trigger()` should be blocking by default, with `detached: true` as additive opt-in. | Confident | `.planning/ROADMAP.md` Phase 19 SC#1; `.planning/REQUIREMENTS.md` REPORT-01/02; existing `extension/ai/tool-definitions.js` trigger schema has no reporting mode yet. |
| Defaults should be `30s` heartbeat, `120s` blocking timeout, `240s` safety ceiling, `6h` detached TTL, and `10s` reconnect grace. | Likely | `.planning/PROJECT.md` recommends ~30s heartbeats and a few-minute safety ceiling; `extension/utils/trigger-lifecycle.js` already uses `FSB_TRIGGER_DEFAULT_TTL_MS = 21600000`; `extension/ws/mcp-bridge-client.js` and `extension/utils/agent-registry.js` already use `RECONNECT_GRACE_MS = 10000`. |
| MCP should pre-generate `trigger_id` when omitted. | Likely | `extension/background.js` currently generates ids during arm; `mcp/src/tools/autopilot.ts` SW-eviction recovery depends on a known correlation key after bridge disconnect. |

### Blocking Wait Placement

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| The blocking wait belongs in MCP bridge/tool lifecycle plumbing, not the watcher runtime or TaskQueue. | Confident | Phase 18 context locks watcher ownership in background runtime and companions in bypass; `mcp/src/tools/triggers.ts` already registers trigger tools directly; `mcp/src/queue.ts` only serializes ordinary mutation tools. |
| Heartbeats should reuse `run_task` progress plumbing. | Confident | `extension/ws/mcp-bridge-client.js:_handleStartAutomation` already sends 30s progress and writes snapshots; `mcp/src/tools/autopilot.ts` maps bridge progress to MCP `notifications/progress`. |
| SW eviction should resolve from persisted trigger snapshots rather than error. | Confident | `.planning/ROADMAP.md` Phase 19 SC#2; `mcp/src/tools/autopilot.ts` already catches `Bridge disconnected`; `extension/utils/trigger-store.js` persists trigger snapshots in `chrome.storage.session`. |

### Fire & Timeout Outcomes

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Fire output should be a flat notify-only event. | Confident | `.planning/REQUIREMENTS.md` REPORT-04; `.planning/PROJECT.md` states notify-only and caller decides follow-up; Phase 19 roadmap recommends flat over receipt-shaped envelope. |
| Blocking timeout should be terminal `timed_out`, not an error and not safety detach. | Confident | `.planning/REQUIREMENTS.md` REPORT-06; roadmap SC#3 requires distinct timed-out result so AI can re-arm. |
| Fire event data must be persisted on the trigger snapshot before resolution. | Likely | `FsbTriggerManager.evaluate()` returns event fields, but `extension/utils/trigger-lifecycle.js` currently writes only terminal status/value fields. |

### Detached Owner Lifecycle

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Detached triggers should reuse existing tab close, TTL, stop, and reconnect-grace owner lifecycle. | Confident | `.planning/ROADMAP.md` Phase 19 SC#5; `extension/utils/trigger-lifecycle.js` already has TTL/tab-close reap; `extension/utils/agent-registry.js` already stages release by connection id after reconnect grace. |
| Owner release needs a new trigger lifecycle hook. | Likely | Existing agent release removes agent/tab ownership but does not call trigger cleanup; Phase 19 requires detached trigger auto-reap on owner disconnect. |

### Re-Arm-On-Fire

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Fire-once terminal remains default; `rearm_on_fire` is explicit opt-in. | Confident | `.planning/REQUIREMENTS.md` REPORT-05/07; `trigger-manager.evaluate()` already implements edge-fire with persisted `was_satisfied`. |
| Re-arm should keep watcher active after first fire but return first fire to blocking callers. | Likely | REPORT-07 requires continued watching; REPORT-01 requires blocking `trigger()` to return when condition fires. |
| Hysteresis should build on the condition-level `hysteresis` field already read by `evaluate()`. | Likely | `extension/utils/trigger-manager.js` reads `condition.hysteresis` but currently treats it as a placeholder for future re-arm behavior. |

### Tests

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Node/VM/source tests are sufficient for Phase 19; live browser UAT can remain Phase 20 integration debt if deterministic tests cover contracts. | Confident | Phase 18 verification closed with Node/smoke/schema tests; Phase 19 is MCP/bridge/storage lifecycle plumbing over existing watch mechanisms. |

## Corrections Made

No corrections -- assumptions mode proceeded with codebase-derived defaults.

## Auto-Resolved

- Blocking safety ceiling: selected `240_000ms` as the concrete "few minutes but under Chrome's 5-minute request ceiling" default.
- Blocking timeout: selected `120_000ms` as the default user-facing blocking wait; longer waits auto-detach at the safety ceiling.
- Detached TTL: kept the existing `6h` trigger lifecycle TTL instead of adding public TTL customization in this phase.
- Fire envelope: selected flat event shape over Lattice receipt shape for v0.11 notify-only scope.

