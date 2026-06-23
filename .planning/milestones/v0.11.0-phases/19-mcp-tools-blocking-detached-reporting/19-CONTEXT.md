# Phase 19: MCP Tools & Blocking/Detached Reporting - Context

**Gathered:** 2026-06-17 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 19 turns the Phase 18 bounded trigger arm route into the public MCP reporting contract: `trigger()` blocks by default with progress heartbeats, can be opted into detached mode, auto-converts to detached before the transport safety ceiling, and returns structured notify-only fire or timeout outcomes. The watcher, selector reads, value extraction, ownership checks, storage registry, and dispatcher routes already exist from Phases 14-18 and stay the source of truth.

**In scope:** additive trigger schema fields for reporting mode; blocking wait and heartbeat plumbing; safety auto-detach; SW-eviction partial-state resolution; flat structured fire events; distinct `timed_out` outcome; fire-once default; optional re-arm-on-fire with de-dup/hysteresis; detached trigger owner/TTL cleanup.

**Out of scope:** new watch mechanisms, new condition kinds, UI/docs/CHANGELOG closeout, same-tab watch-mode conflict handling, reload coalescing, cross-browser-restart resume, desktop/push/email/Slack notifications, and auto-actions on fire.
</domain>

<decisions>
## Implementation Decisions

### MCP API & Defaults

- **D-01:** `trigger()` is blocking by default. Add a reporting-mode field such as `detached: true` for immediate-return mode; do not overload the existing `watch` field, which remains only `live-observe` vs `refresh-poll`.
- **D-02:** Use these v0.11 defaults unless planning finds a hard code constraint: heartbeat interval `30_000ms`; blocking timeout default `120_000ms`; blocking safety ceiling `240_000ms`; detached absolute TTL `6h` via the existing `FSB_TRIGGER_DEFAULT_TTL_MS`; owner reconnect grace `10_000ms` via the existing agent reconnect-grace contract.
- **D-03:** If a blocking request asks for a wait longer than the safety ceiling, arm normally, wait only until the ceiling, then return `{ outcome: 'detached', detached: true, reason: 'safety_ceiling', trigger_id, status }`. The watcher keeps running and the caller polls with `get_trigger_status` / `list_triggers`.
- **D-04:** The MCP trigger registrar should pre-generate `trigger_id` when the caller omits it before sending `mcp:trigger`. Background may still generate defensively, but MCP-side correlation needs a known id for heartbeats, SW-eviction recovery, timeout cleanup, and detached auto-convert.
- **D-05:** Schema changes are additive to the trigger family only. Existing non-trigger MCP schemas stay byte-identical; trigger names and direct routes remain `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers`.

### Blocking Wait Placement

- **D-06:** Keep the long-running watcher and fire decision in `background.js` / `FsbTriggerStore` / `FsbTriggerLifecycle` / `FsbTriggerManager`. The blocking wait is a reporting wrapper around the bounded arm response, modeled on `run_task` lifecycle return, not a new watcher and not a TaskQueue item.
- **D-07:** Implement the blocking wait in the MCP bridge/tool layer (`extension/ws/mcp-bridge-client.js` plus `mcp/src/tools/triggers.ts`) so it can reuse `_sendProgress`, bridge `onProgress`, progress-token notifications, bridge timeout handling, and the existing direct trigger routes. Do not put the wait in `extension/ai/agent-loop.js`, content scripts, or the ordinary manual tool queue.
- **D-08:** Heartbeats use the existing `mcp:progress` -> `notifications/progress` path. Minimum heartbeat payload: `trigger_id`, `alive`, `elapsed_ms`, `status`, `current_value`, `last_evaluated_at`, `last_reported_at`, and `target_tab_id`; richer fields belong under MCP notification `_meta` as in `run_task`.
- **D-09:** A blocking trigger must have paired timer teardown and single-resolve guards mirroring `run_task`: no heartbeat after settle, no double resolve if fire and safety timeout race, and no interval leak across sequential invocations.
- **D-10:** If the bridge disconnects during a blocking trigger, the MCP server should catch `Bridge disconnected`, wait briefly for reconnect using the existing run-task pattern, then resolve from the persisted trigger snapshot. If the trigger is still `armed`, return a partial/detached result with `sw_evicted: true`, `trigger_id`, and `partial_state`; if it fired or timed out while the SW restarted, return that terminal outcome.
- **D-11:** `stop_trigger`, `get_trigger_status`, and `list_triggers` stay direct/bypass-class and must return promptly while a blocking `trigger()` is outstanding. A blocked caller must always be able to cancel the trigger it is waiting on.

### Fire, Timeout & Status Outcomes

- **D-12:** Fire output is a flat notify-only event, not a Lattice Capability Receipt. Return and persist `event` with: `trigger_id`, `matched_condition`, `old_value`, `new_value`, `url`, `timestamp`, `target_tab_id`, and `watch`. The caller/AI decides any follow-up action.
- **D-13:** The fire path must persist enough event data on the snapshot before the blocking wait resolves. Add a field such as `last_event` / `last_fire_event` and stage URL from the value-report sender, refresh-poll read, or tab lookup before calling the lifecycle evaluation seam.
- **D-14:** A blocking timeout is a terminal, successful non-fire outcome: `{ outcome: 'timed_out', trigger_id, status }`. It is not an error. It should clear observer/pulse/alarm state, free the active cap slot, and write a terminal `status: 'timed_out'` with `timed_out_at` long enough for the MCP response/status projection.
- **D-15:** Safety auto-detach is not a timeout and must not clear the watcher. It leaves the snapshot `armed`, marks the response as detached, and returns the `trigger_id`.
- **D-16:** Extend status/list projection to expose `outcome`, `last_event`, `fire_count`, `timed_out_at`, `detached`, `detached_at`, `deadline_at` / `remaining_ms`, and terminal statuses (`fired`, `timed_out`, `stopped`) when requested. Default `list_triggers` should still focus on active/attention states.

### Detached Owner Lifecycle

- **D-17:** Detached triggers remain bound to `agent_id`, `ownership_token`, and `target_tab_id`. Store `connection_id` / `owner_connection_id` when available for diagnostics, but the durable owner key is still the agent id plus tab ownership token.
- **D-18:** Reap detached triggers on three existing lifecycle boundaries plus one new owner boundary: tab close (`handleTriggerTabRemoved`), absolute TTL (`deadline_at`), explicit stop, and owner release after the existing `10s` reconnect grace expires.
- **D-19:** Add an owner-release hook such as `FsbTriggerLifecycle.handleTriggerOwnerReleased(agentId)` and call it best-effort from the agent registry release path after reconnect grace expires. It should clear observer/pulse/alarm and delete or terminal-mark every trigger owned by that agent so cap slots cannot zombie.
- **D-20:** Keep the v0.11 detached TTL at the existing `6h` lifecycle constant. Do not introduce indefinite detached triggers in this phase.

### Re-Arm-On-Fire

- **D-21:** Fire-once terminal behavior is the default. A normal trigger transitions to `status: 'fired'`, clears observer/pulse/alarm state, and resolves a blocking call with the fire event.
- **D-22:** Add an opt-in `rearm_on_fire: true` flag. When enabled, a fire records `last_event`, increments `fire_count`, keeps or re-arms the watcher, and leaves the trigger active. A blocking call still returns on the first fire, with `still_armed: true` so the caller knows to poll or stop it.
- **D-23:** De-dup stays storage-backed. Continue using persisted `was_satisfied`, and implement condition hysteresis for the reset-to-unsatisfied path so the same threshold crossing cannot fire repeatedly while the value remains on the fired side of the boundary. Prefer the existing condition-level `hysteresis` field already read by `trigger-manager.evaluate()`.

### Tests & Verification

- **D-24:** Add focused tests for: additive trigger schema fields and parity; MCP trigger blocking default; detached immediate return; progress heartbeat payload/wire shape; safety auto-detach; bridge-disconnect/SW-eviction partial result; fire event projection; timeout terminal cleanup; companion bypass while blocking; owner-release reaping; tab-close/TTL cleanup preservation; and re-arm-on-fire hysteresis/de-dup.
- **D-25:** Live browser UAT is not required for this phase unless deterministic Node/source tests expose a gap. The behavior is primarily MCP/bridge/storage lifecycle plumbing and should be verified with the existing VM harness style plus smoke/schema tests.

### the agent's Discretion

- Exact internal helper names and file split for the trigger blocking wait, as long as the wait reuses the run-task lifecycle-return shape and does not move watcher ownership out of background trigger runtime.
- Exact MCP `_meta` heartbeat field names beyond the minimum fields above.
- Whether terminal trigger snapshots are retained until next restore/sweep or deleted after the response, as long as the response/status path can distinguish `timed_out` from `fired` and cap slots are freed.
- Exact response wrapper names (`event`, `last_event`, `partial_state`) as long as fire, timeout, detached, and SW-evicted outcomes are distinct and stable.

### Folded Todos

None -- no pending todos matched this phase.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope & Requirements

- `.planning/ROADMAP.md` -- Phase 19 goal and success criteria for blocking default, detached opt-in, safety auto-detach, structured fire/timeout outcomes, re-arm-on-fire, and owner TTL/reap.
- `.planning/REQUIREMENTS.md` -- REPORT-01, REPORT-02, REPORT-03, REPORT-04, REPORT-05, REPORT-06, REPORT-07.
- `.planning/PROJECT.md` -- v0.11 trigger tool milestone, reporting defaults, notify-only scope, MV3 survivability posture, and run-task lifecycle-return precedent.
- `.planning/STATE.md` -- Phase 18 handoff notes, REG-02 queue-starvation risk, and Phase 19 blocking transport timeout note.

### Prior Locked Trigger Decisions

- `.planning/phases/14-trigger-survivability-foundation/14-CONTEXT.md` -- storage-backed trigger registry, `fsbTrigger:<id>` alarms, `FSB_TRIGGER_DEFAULT_TTL_MS`, tab-close reap, restore/reconcile, and session-only survival.
- `.planning/phases/15-fire-condition-engine-value-extraction/15-CONTEXT.md` -- pure `evaluate()`, `matched_condition`, `old_value`, `new_value`, persisted `was_satisfied`, edge-fire semantics, hysteresis placeholder, and cap source.
- `.planning/phases/16-live-observe-watch-analyzing-pulse/16-CONTEXT.md` -- live-observe value-report path, pulse start/stop lifecycle, and SW value-report ingress.
- `.planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md` -- refresh-poll own-tab reload/read/evaluate path, attention states, pulse reassertion, and no-focus ownership constraints.
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-CONTEXT.md` -- shared trigger tools, direct MCP routes, bounded arm response, companion bypass, storage-of-truth status/list, and Phase 19 handoff.
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-VERIFICATION.md` -- verified Phase 18 wiring, code-review fixes, and route/bridge/dispatcher test evidence.

### MCP & Bridge Lifecycle

- `mcp/src/tools/triggers.ts` -- trigger registrar, current direct bridge dispatch, 30s bounded arm timeout to replace/extend for blocking mode, and trigger target tab extraction.
- `mcp/src/tools/autopilot.ts` -- `run_task` progress-token notification mapping, logging fallback, 600s safety net, and `Bridge disconnected` partial-state recovery pattern.
- `mcp/src/agent-bridge.ts` -- `sendAgentScopedBridgeMessage`, `targetTabIdFromParams`, ownership token threading, connection id threading, and `onProgress`.
- `mcp/src/bridge.ts` -- `sendAndWait`, pending request timeout/rejection, progress listener plumbing, and bridge disconnect behavior.
- `mcp/src/queue.ts` -- read-only bypass and proof that trigger companions must not queue behind mutations.
- `mcp/src/types.ts` -- MCP message types; add any new trigger snapshot/lookup message only if existing status route cannot serve the recovery path.
- `extension/ws/mcp-bridge-client.js` -- `_sendProgress`, `_handleStartAutomation` heartbeat/single-resolve/safety-net pattern, `_handleGetTaskSnapshot`, `_reconcileInFlightTasksOnConnect`, and trigger message routing.
- `extension/ws/mcp-tool-dispatcher.js` -- direct trigger route contracts, message alias mapping, and ownership gate.

### Trigger Runtime & Owner Lifecycle

- `extension/background.js` -- `fsbTriggerHandleToolArm`, `fsbTriggerHandleToolStop`, `fsbTriggerHandleToolStatus`, `fsbTriggerHandleToolList`, status projection helpers, value-report/refresh-poll evaluation glue, and trigger tab-close alarm branches.
- `extension/utils/trigger-store.js` -- persisted trigger registry and `hydrate()` / `readSnapshot()` / `writeSnapshot()` / `listArmedSnapshots()`.
- `extension/utils/trigger-lifecycle.js` -- fire write-back seam, `clearTrigger`, `handleTriggerAlarm`, `handleTriggerTabRemoved`, `restoreTriggersFromStorage`, TTL, refresh-poll scheduling, and terminal guard.
- `extension/utils/trigger-manager.js` -- pure edge-fire/hysteresis evaluation, re-arm state inputs, condition result fields, and active cap.
- `extension/utils/agent-registry.js` -- `RECONNECT_GRACE_MS`, connection-id staged release, `_fireStagedRelease`, ownership tokens, and owner-release integration point.
- `extension/ai/tool-definitions.js` and `mcp/ai/tool-definitions.cjs` -- canonical trigger schemas that must remain mirrored and additive.

### Contract Tests To Extend

- `tests/mcp-tool-smoke.test.js` -- packaged trigger registration, direct dispatch, timeout options, and queue bypass.
- `tests/mcp-bridge-client-lifecycle.test.js` -- VM harness for bridge client routes and lifecycle behavior.
- `tests/run-task-heartbeat.test.js` and `tests/run-task-resolve-discipline.test.js` -- heartbeat/safety-net/single-resolve patterns to clone for trigger blocking.
- `tests/mcp-in-flight-session-lookup.test.js` and `tests/mcp-task-store.test.js` -- partial-state and storage snapshot precedents.
- `tests/trigger-tool-dispatcher.test.js` -- background trigger handlers, status/list projection, stop cleanup, and ownership checks.
- `tests/trigger-lifecycle.test.js`, `tests/trigger-manager.test.js`, `tests/trigger-refresh-poll.test.js`, `tests/trigger-observe.test.js`, `tests/trigger-observe-pulse.test.js`, `tests/trigger-cap.test.js`, `tests/trigger-store.test.js` -- trigger runtime harnesses to extend for fire event, timeout, re-arm, and cleanup.
- `tests/tool-definitions-parity.test.js` and `tests/visual-session-schema-lock.test.js` -- schema additivity and registry parity gates.
- `tests/agent-grace.test.js` and `tests/agent-registry.test.js` -- reconnect grace and owner-release behavior to extend for detached trigger reap.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `run_task` already has the needed lifecycle-return shape: 30s progress heartbeats, progress-token notification mapping, single-resolve discipline, safety net, persisted partial state, and SW-eviction recovery.
- `FsbTriggerStore` is already the storage-of-truth registry. Blocking wait/status/list should read snapshots from it rather than keeping trigger state in MCP heap.
- `FsbTriggerManager.evaluate()` already returns `matched_condition`, `old_value`, `new_value`, and persisted edge-state patches, which are the core of the structured fire event.
- `FsbTriggerLifecycle` already owns terminal write-back and alarm clear. Phase 19 should extend that seam rather than writing fire/timeout status from scattered call sites.
- `AgentRegistry` already has connection-id reconnect grace and staged release after `10s`; detached trigger owner cleanup should plug into that existing owner lifecycle.
- Trigger companions already bypass the MCP queue and route directly through the dispatcher/bridge.

### Established Patterns

- **Storage is truth:** status, values, edge state, ownership, TTL, and reporting events belong in `chrome.storage.session` snapshots, not SW heap.
- **Watcher vs reporting split:** background runtime watches/evaluates; MCP bridge/tool layer reports and waits.
- **Additive schema discipline:** trigger-family schema additions are allowed for Phase 19, but existing non-trigger MCP schemas must remain byte-identical.
- **Notify-only:** a fire event reports what happened; it never clicks, navigates, sends external notifications, or invokes follow-up actions.
- **Bypass for cancellation/status:** companion tools must stay callable while a blocking trigger is pending.
- **Owner-first cleanup:** tab close, owner release, TTL, timeout, and explicit stop must all clear observer/pulse/alarm state and free cap slots.

### Integration Points

- Extend `mcp/src/tools/triggers.ts` to pre-generate trigger ids, support blocking/detached params, map trigger heartbeat progress to MCP notifications, and handle bridge-disconnect partial recovery.
- Extend `extension/ws/mcp-bridge-client.js` with a trigger blocking wait helper modeled on `_handleStartAutomation`, or an equivalent path that reuses `_sendProgress` and direct trigger dispatch.
- Extend `extension/background.js` trigger projection and handler helpers for `timed_out`, `last_event`, `fire_count`, detached markers, and status/list output.
- Extend `extension/utils/trigger-lifecycle.js` for fire event persistence, timeout terminal marking/cleanup, re-arm-on-fire behavior, and owner-release reaping.
- Extend `extension/utils/trigger-manager.js` only where hysteresis/de-dup semantics need to become real for re-arm-on-fire; keep `evaluate()` pure.
- Extend shared trigger schemas in `extension/ai/tool-definitions.js` and mirror to `mcp/ai/tool-definitions.cjs`.
- Extend package tests rather than relying on manual Chrome UAT.
</code_context>

<specifics>
## Specific Ideas

- Pre-generating `trigger_id` in the MCP registrar is the easiest way to make SW-eviction recovery deterministic even if the service worker disconnects before the arm response reaches the MCP server.
- Timeout and safety auto-detach must be visibly different: timeout stops and frees the watcher; safety detach keeps it running and returns the id.
- Use a flat fire envelope for v0.11.0. A receipt-shaped or action-capability envelope would imply auto-act semantics, which are explicitly out of scope.
- `6h` detached TTL and `10s` reconnect grace are already present in the codebase; Phase 19 should reuse those constants instead of inventing parallel owner lifetimes.
- Re-arm-on-fire should return the first fire to a blocking caller, but leave the watcher active with `still_armed: true`.
</specifics>

<deferred>
## Deferred Ideas

- Same-tab `live-observe` vs `refresh-poll` conflict handling and refresh-poll reload coalescing -- Phase 20.
- Trigger cap UI, docs, CHANGELOG, README, and version bump -- Phase 20.
- Cross-browser-restart trigger auto-resume -- SURV-FUTURE-01.
- External desktop/push/email/Slack notifications and auto-actions on fire -- future notify/action phases.
- Public `ttl_ms` customization for detached triggers -- future enhancement; Phase 19 locks a fixed 6h TTL for v0.11.

### Reviewed Todos (not folded)

None -- no matching todos were found.
</deferred>

---

*Phase: 19-mcp-tools-blocking-detached-reporting*
*Context gathered: 2026-06-17*
