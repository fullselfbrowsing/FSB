# Phase 19: MCP Tools & Blocking/Detached Reporting - Pattern Map

**Mapped:** 2026-06-17
**Scope:** Files likely to be modified by Phase 19 plans and their closest local analogs.

## File Role Map

| File | Role in Phase 19 | Closest Existing Analog | Notes |
|------|------------------|-------------------------|-------|
| `extension/ai/tool-definitions.js` | Additive trigger reporting schema fields | Existing trigger block from Phase 18 | Mirror byte-identically to `mcp/ai/tool-definitions.cjs`; no non-trigger schema churn. |
| `mcp/ai/tool-definitions.cjs` | MCP mirror of shared registry | `extension/ai/tool-definitions.js` | Must stay byte-identical. |
| `mcp/src/tools/triggers.ts` | MCP trigger registrar, id pregen, progress mapping, bridge-disconnect recovery | `mcp/src/tools/autopilot.ts` | Clone progress-token and `Bridge disconnected` handling from `run_task`; keep direct companion dispatch. |
| `mcp/src/agent-bridge.ts` | Agent/ownership/progress bridge helper | Existing `sendAgentScopedBridgeMessage` | Only extend if current `onProgress`/target id options are insufficient. |
| `extension/ws/mcp-bridge-client.js` | Extension-side blocking wait, heartbeat, safety auto-detach | `_handleStartAutomation` | Add a trigger-specific wait helper beside run-task lifecycle code; pair timers and listeners. |
| `extension/background.js` | Trigger status/list projection and tool dispatch helpers | Phase 18 trigger handlers | Add event/timeout/re-arm fields without moving watcher ownership. |
| `extension/utils/trigger-lifecycle.js` | Fire event persistence, timed_out marking, owner-release cleanup, re-arm write-back | Existing `handleTriggerAlarm`, `clearTrigger`, `handleTriggerTabRemoved` | Keep storage writes atomic and best-effort. |
| `extension/utils/trigger-manager.js` | Pure hysteresis/de-dup logic | Existing `evaluate()` edge-fire contract | Must remain DOM/storage-free. |
| `extension/utils/agent-registry.js` | Owner release hook after reconnect grace | `_fireStagedRelease` | Call trigger lifecycle best-effort for each released agent. |
| `tests/trigger-blocking-reporting.test.js` | New VM/source tests for blocking trigger envelope | `tests/run-task-heartbeat.test.js`, `tests/run-task-resolve-discipline.test.js` | Use virtual clock and VM-loaded `mcp-bridge-client.js`. |
| Existing trigger/MCP tests | Contract regression coverage | Phase 18 tests | Extend, do not replace. |

## Key Local Patterns

### Pattern A: Run-Task Heartbeat Lifecycle

**Source:** `extension/ws/mcp-bridge-client.js:_handleStartAutomation`

```javascript
const heartbeatTimer = setInterval(fireHeartbeat, 30_000);
const timeout = setTimeout(async () => {
  let partial_state = null;
  // read persisted snapshot
  settle({ partial_outcome: 'timeout', partial_state }, 'safety_net_600s');
}, RUN_TASK_SAFETY_NET_MS);
```

**Use for Phase 19:** Trigger blocking wait needs the same single-resolve/timer-teardown shape, but settlement sources are trigger snapshots rather than automation lifecycle bus events.

### Pattern B: Server Progress Mapping

**Source:** `mcp/src/tools/autopilot.ts`

```typescript
const onProgress = (p: MCPResponse) => {
  if (extra._meta?.progressToken !== undefined) {
    extra.sendNotification({
      method: 'notifications/progress',
      params: { progressToken, progress, total: 100, message, _meta: { alive, elapsed_ms } },
    }).catch(() => {});
  }
};
```

**Use for Phase 19:** `mcp/src/tools/triggers.ts` should map trigger heartbeat fields to `notifications/progress` under `_meta`.

### Pattern C: Bridge Disconnect Partial Recovery

**Source:** `mcp/src/tools/autopilot.ts`

```typescript
if (errMsg === 'Bridge disconnected') {
  while (!bridge.isConnected && Date.now() < reconnectDeadline) {
    await new Promise((r) => setTimeout(r, 250));
  }
  if (bridge.isConnected) {
    const snap = await bridge.sendAndWait({ type: 'mcp:get-task-snapshot', payload: { agentId } }, { timeout: 5_000 });
  }
  return { content: [{ type: 'text', text: JSON.stringify(swEvictedResult, null, 2) }] };
}
```

**Use for Phase 19:** Trigger recovery should use known `trigger_id` and existing trigger status route or a minimal lookup message only if status route is insufficient.

### Pattern D: Storage-Truth Trigger Status

**Source:** `extension/background.js`

```javascript
const snap = await FsbTriggerStore.readSnapshot(triggerId);
return { success: true, status: fsbTriggerProjectTriggerStatus(snap, Date.now()) };
```

**Use for Phase 19:** Extend status projection with `last_event`, `fire_count`, `timed_out_at`, `detached`, and terminal outcomes. Do not project from bridge heap state.

### Pattern E: Lifecycle Fire Write-Back

**Source:** `extension/utils/trigger-lifecycle.js`

```javascript
if (outcome.outcome === 'fired') {
  snap.status = 'fired';
  snap.fired_at = now;
  if (nextState.last_value !== undefined) snap.last_value = nextState.last_value;
  await store.writeSnapshot(triggerId, snap);
  await clearAlarm(alarm.name);
  return { ok: true, action: 'fired', outcome: outcome };
}
```

**Use for Phase 19:** Persist `last_event` in this same transition. If `rearm_on_fire`, leave `status:'armed'`, increment `fire_count`, and reschedule/restart the watcher instead of clearing it.

### Pattern F: Agent Reconnect Grace Release

**Source:** `extension/utils/agent-registry.js:_fireStagedRelease`

```javascript
if (record.connectionId !== connectionId) return;
self._tabsByAgent.delete(agentId);
self._agents.delete(agentId);
```

**Use for Phase 19:** After releasing an agent, call `FsbTriggerLifecycle.handleTriggerOwnerReleased(agentId)` best-effort so detached triggers cannot survive owner release.

## Data Flow Contracts

### Blocking Trigger

1. MCP tool call enters `mcp/src/tools/triggers.ts`.
2. Registrar ensures `trigger_id`, sends `mcp:trigger` with `onProgress` and long enough bridge timeout.
3. Extension bridge routes bounded arm through `dispatchMcpMessageRoute`.
4. Background arm reads baseline and persists an `armed` trigger snapshot.
5. Bridge waiter emits heartbeats from persisted status.
6. Watch layer updates snapshot via lifecycle.
7. Bridge waiter settles on `fired`, `timed_out`, or `detached` safety ceiling.

### Detached Trigger

1. Same arm path as blocking.
2. If `detached:true`, bridge returns arm result immediately with `outcome:'detached'`.
3. Status/list read persisted snapshots.
4. Stop/tab close/TTL/owner release clear watcher and cap slot.

### Re-Arm-On-Fire

1. `evaluate()` detects false->true edge.
2. Lifecycle builds and persists `last_event`.
3. If `rearm_on_fire:true`, lifecycle keeps `status:'armed'`, increments `fire_count`, and preserves `was_satisfied:true`.
4. Hysteresis logic resets `was_satisfied:false` only after sufficient clearance.
5. Next edge can fire again.

## Test Harness Patterns

| Behavior | Harness Pattern |
|----------|-----------------|
| Heartbeat cadence and cleanup | Virtual clock from `tests/run-task-heartbeat.test.js`. |
| Safety-net race | Virtual clock + seeded snapshots from `tests/run-task-resolve-discipline.test.js`. |
| Bridge routing | VM loading of `extension/ws/mcp-bridge-client.js` from `tests/mcp-bridge-client-lifecycle.test.js`. |
| Trigger lifecycle | Direct `require()` with mocked Chrome storage from `tests/trigger-lifecycle.test.js`. |
| Source contract | `rg`/source-slice assertions from `tests/trigger-tool-dispatcher.test.js`. |
| Owner grace | Fake timers and registry mocks from `tests/agent-grace.test.js`. |

## File Conflict Notes

- `extension/ws/mcp-bridge-client.js` is high-risk and should be changed in one plan.
- `extension/background.js` and `extension/utils/trigger-lifecycle.js` are shared by timeout/fire/re-arm work; plan those sequentially.
- `extension/ai/tool-definitions.js` and `mcp/ai/tool-definitions.cjs` must be updated together in the same plan to keep parity green.

---

*Phase: 19-mcp-tools-blocking-detached-reporting*
*Pattern mapping complete: 2026-06-17*
