# Phase 19: MCP Tools & Blocking/Detached Reporting - Research

**Researched:** 2026-06-17
**Domain:** MCP bridge lifecycle reporting over storage-backed Chrome extension trigger runtime
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- `trigger()` blocks by default; `detached: true` is an additive immediate-return mode and must not overload `watch`.
- Defaults: `30_000ms` heartbeat interval, `120_000ms` blocking timeout, `240_000ms` safety ceiling, `6h` detached TTL, and `10_000ms` reconnect grace.
- MCP should pre-generate `trigger_id` when absent so blocking heartbeats, timeout cleanup, detached auto-convert, and SW-eviction recovery have a stable correlation key.
- The watcher and fire decision stay in `background.js`, `FsbTriggerStore`, `FsbTriggerLifecycle`, and `FsbTriggerManager`; blocking wait is a reporting wrapper in the MCP bridge/tool layer.
- Companion tools must remain direct/bypass-class while a blocking `trigger()` is outstanding.
- Fire output is a flat notify-only event with matched condition, old value, new value, URL, timestamp, tab id, and watch mode.
- Timeout is a terminal `timed_out` outcome, not an error and not safety detach.
- Safety auto-detach keeps the watcher armed and returns `trigger_id`.
- Detached triggers are reaped on explicit stop, tab close, TTL, and owner release after reconnect grace.
- Fire-once terminal behavior is default; `rearm_on_fire: true` keeps the watcher active and relies on persisted edge state plus hysteresis for de-dup.
- No UI/docs/CHANGELOG, external notifications, auto-actions, cross-browser-restart resume, or same-tab watch conflict handling in this phase.

### the agent's Discretion

- Exact helper names and file split for the trigger blocking wait.
- Exact MCP `_meta` heartbeat field names beyond the required fields.
- Whether terminal snapshots are retained until next restore/sweep or deleted after response, as long as `timed_out` and `fired` remain distinguishable and cap slots are freed.
- Exact response wrapper names, as long as `fired`, `timed_out`, `detached`, and `sw_evicted` are stable and distinct.

### Deferred Ideas (OUT OF SCOPE)

- Same-tab `live-observe` vs `refresh-poll` conflicts and refresh-poll reload coalescing.
- Trigger cap UI, README/CHANGELOG docs, and version bump.
- Cross-browser-restart trigger auto-resume.
- External desktop/push/email/Slack notifications and auto-actions on fire.
- Public `ttl_ms` customization for detached triggers.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Additive trigger reporting schema | MCP shared tool registry | MCP schema bridge | `extension/ai/tool-definitions.js` is mirrored byte-identically into `mcp/ai/tool-definitions.cjs`; MCP uses `jsonSchemaToZod`. |
| Blocking wait and progress heartbeats | MCP bridge/tool layer | Extension service worker | `run_task` already proves `_sendProgress` -> bridge `onProgress` -> MCP `notifications/progress`; trigger should clone the reporting envelope, not watcher logic. |
| Fire/timeout state | Extension service worker trigger runtime | MCP bridge waiter | `FsbTriggerLifecycle` owns terminal write-back and alarm cleanup; the waiter reads persisted snapshots and resolves. |
| Detached ownership and TTL | Extension storage/lifecycle | Agent registry | Trigger snapshots store agent/tab ownership; `AgentRegistry` owns reconnect-grace release and can call a trigger owner-release hook. |
| Re-arm-on-fire de-dup | Trigger manager/lifecycle | Watch mechanisms | `evaluate()` already computes edge state from persisted `was_satisfied`; lifecycle decides terminal vs re-armed storage write-back. |
| Verification | Node/VM test harness | MCP build/smoke tests | Existing trigger and run-task tests are plain Node/VM harnesses and cover this phase without live browser UAT. |
</architectural_responsibility_map>

<research_summary>
## Summary

Phase 19 should be implemented as a parallel copy of the proven `run_task` lifecycle-return envelope, but pointed at the trigger snapshot store instead of automation sessions. The codebase already has the difficult foundations: storage-backed trigger snapshots, per-trigger alarms, live-observe/refresh-poll value ingress, direct MCP trigger routes, queue-bypassing companions, and run-task bridge progress/safety-net handling.

The standard approach in this repo is not to add dependencies or a second scheduler. Additive trigger schema fields flow through the shared registry; MCP pre-generates a correlation id; the extension bridge arms the trigger through the existing route and then waits by reading `FsbTriggerStore`; progress is emitted through `_sendProgress`; terminal state is written by lifecycle helpers; companions bypass the queue so cancellation cannot deadlock.

**Primary recommendation:** Build three sequential slices: (1) schema/MCP/bridge blocking envelope, (2) runtime fire/timeout event semantics, and (3) re-arm plus owner-release cleanup.
</research_summary>

<standard_stack>
## Standard Stack

### Core

| Library / Module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | existing lockfile | MCP server tool registration and progress notifications | Already used by FSB MCP server; no new SDK needed. |
| `ws` | existing MCP dependency | Local extension bridge transport | Existing `WebSocketBridge` handles pending requests, progress, disconnect, and reconnect topology. |
| Chrome extension APIs | MV3 | Storage, alarms, tabs, service worker lifecycle | Existing trigger runtime uses `chrome.storage.session`, `chrome.alarms`, `chrome.tabs`, and ownership helpers. |
| Plain Node tests | repo convention | Contract/unit/smoke tests | Existing trigger/run-task tests are direct Node scripts with VM harnesses. |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `extension/ws/mcp-bridge-client.js` | Extension-side MCP lifecycle wrapper and progress emitter | Implement trigger blocking wait and safety auto-detach. |
| `mcp/src/tools/triggers.ts` | MCP trigger registrar from shared registry | Pre-generate ids, map progress to MCP notifications, catch bridge disconnect. |
| `extension/utils/trigger-lifecycle.js` | Terminal write-back and cleanup | Persist fire events, mark timeout, re-arm-on-fire, owner release. |
| `extension/utils/trigger-manager.js` | Pure condition/edge-state engine | Implement hysteresis reset for re-arm-on-fire without storage access. |
| `extension/utils/agent-registry.js` | Agent reconnect grace and owner release | Reap detached triggers when an owner is released after grace. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bridge/tool wait wrapper | Background-only long promise in dispatcher | Harder to map MCP progress and bridge disconnect recovery; risks hiding timeout behavior in route code. |
| Existing trigger snapshot store | New MCP trigger task store | Duplicates state and creates reconciliation drift; `FsbTriggerStore` is already the authoritative source. |
| Flat fire event | Lattice/receipt-shaped envelope | Receipt shape implies capabilities or auto-action semantics, which are out of scope. |
| Existing direct companion routes | Queue-based companion calls | Deadlocks cancellation/status behind a blocking trigger. |

**Installation:** No new runtime dependencies.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```text
MCP client
  -> mcp/src/tools/triggers.ts
       - pre-generate trigger_id
       - choose blocking vs detached
       - map bridge progress to notifications/progress
  -> WebSocketBridge.sendAndWait(mcp:trigger, onProgress)
  -> extension/ws/mcp-bridge-client.js
       - dispatch bounded arm through mcp-tool-dispatcher
       - if detached: return trigger_id immediately
       - if blocking: poll/read FsbTriggerStore snapshot
       - send 30s heartbeat progress
       - settle on fired/timed_out/safety_ceiling
  -> extension/ws/mcp-tool-dispatcher.js
  -> extension/background.js trigger handlers
  -> FsbTriggerManager.armTrigger / FsbTriggerLifecycle / FsbTriggerStore
  -> live-observe or refresh-poll watch layer
       - reports values
       - lifecycle persists fire/no-fire/timeout/re-arm state
  -> bridge result back to MCP client
```

### Recommended Project Structure

```text
mcp/src/tools/triggers.ts                 # MCP reporting contract and progress mapping
mcp/src/agent-bridge.ts                   # existing onProgress/agent id threading; extend only if needed
extension/ws/mcp-bridge-client.js         # blocking wait, heartbeats, safety auto-detach
extension/background.js                   # status/list projection and tool dispatch helpers
extension/utils/trigger-lifecycle.js      # fire event, timeout, re-arm, owner-release cleanup
extension/utils/trigger-manager.js        # pure hysteresis/de-dup logic
extension/utils/agent-registry.js         # call trigger owner-release hook after reconnect grace
tests/*trigger*.test.js                   # focused runtime/bridge tests
tests/run-task-*.test.js                  # source patterns to clone
```

### Pattern 1: Run-Task Lifecycle Envelope Clone

**What:** Start bounded work, then hold the bridge request open with a local heartbeat timer and single-resolve settlement.
**When to use:** Blocking `trigger()` calls.
**Example:**
```javascript
const heartbeatTimer = setInterval(fireHeartbeat, 30_000);
const timeout = setTimeout(settleSafety, TRIGGER_BLOCKING_SAFETY_CEILING_MS);
function settle(value, source) {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  clearInterval(heartbeatTimer);
  resolve(value);
}
```

### Pattern 2: Snapshot-Is-Truth Settlement

**What:** Blocking wait reads `FsbTriggerStore.readSnapshot(triggerId)` for status, values, terminal event, and timing.
**When to use:** Heartbeats, fire settlement, timeout settlement, SW-eviction recovery, and status/list projection.
**Example:**
```javascript
const snap = await FsbTriggerStore.readSnapshot(triggerId);
if (snap && snap.status === 'fired') settle({ outcome: 'fired', event: snap.last_event });
if (snap && snap.status === 'timed_out') settle({ outcome: 'timed_out', status: project(snap) });
```

### Pattern 3: Timeout Is Terminal, Safety Ceiling Is Detached

**What:** `timeout_ms` clears the watcher and returns `timed_out`; safety ceiling returns `detached` and keeps watching.
**When to use:** Every blocking trigger.
**Example:**
```javascript
if (elapsed >= timeoutMs) return markTimedOutAndClear(triggerId);
if (elapsed >= safetyCeilingMs) return { outcome: 'detached', detached: true, reason: 'safety_ceiling', trigger_id: triggerId };
```

### Pattern 4: Owner-Release Cleanup Hook

**What:** Agent release after reconnect grace calls trigger lifecycle cleanup by agent id.
**When to use:** Detached trigger zombie prevention.
**Example:**
```javascript
if (globalThis.FsbTriggerLifecycle?.handleTriggerOwnerReleased) {
  await globalThis.FsbTriggerLifecycle.handleTriggerOwnerReleased(agentId);
}
```

### Pattern 5: Re-Arm-On-Fire Through Edge State

**What:** Normal fire writes terminal `fired`; `rearm_on_fire` records event/fire count and leaves `status:'armed'` with persisted `was_satisfied`.
**When to use:** REPORT-07.
**Example:**
```javascript
if (outcome.outcome === 'fired' && snap.rearm_on_fire === true) {
  snap.status = 'armed';
  snap.fire_count = Number(snap.fire_count || 0) + 1;
  snap.last_event = event;
  await store.writeSnapshot(triggerId, snap);
  return { ok: true, action: 'fired_rearmed', outcome };
}
```

### Anti-Patterns to Avoid

- **Waiting inside TaskQueue:** deadlocks companion cancellation/status behind the blocking trigger.
- **Keeping wait state only in heap:** SW eviction loses state and violates REPORT-03.
- **Clearing on safety auto-detach:** safety detach must keep watching.
- **Returning timeout as error:** REPORT-06 says `timed_out` is a distinct non-error outcome.
- **Using caller-supplied ownership fields blindly:** ownership must stay registry/token checked.
- **Adding auto-action semantics to fire event:** notify-only is a hard scope boundary.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP progress transport | A second notification channel | Existing `_sendProgress` + bridge `onProgress` + MCP `notifications/progress` | Proven by `run_task`; tests already exist. |
| Trigger persistence | New MCP trigger task store | `FsbTriggerStore` | Avoids split-brain trigger status. |
| Cancellation scheduling | Queue polling | Direct companion routes | Queue can be occupied by the blocking caller. |
| Owner reconnect grace | New trigger-specific grace timer | `AgentRegistry.stageReleaseByConnectionId` / `_fireStagedRelease` | Existing connection-id lifecycle already handles SW eviction during grace. |
| Fire-condition de-dup | New per-watch heap state | Persisted `was_satisfied` + condition hysteresis | Survives SW eviction and matches Phase 15. |

**Key insight:** Phase 19 is a lifecycle/reporting phase over existing primitives. New primitives create more risk than they remove.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Queue Starvation Deadlock
**What goes wrong:** `stop_trigger` waits behind the blocking `trigger()` it needs to cancel.
**Why it happens:** Companion tools are accidentally routed through the mutation queue.
**How to avoid:** Keep trigger registrar direct and companion tools `_readOnly:true`; add a test with a never-resolving queued mutation.
**Warning signs:** Tests only check direct responses when no queue item is running.

### Pitfall 2: Heartbeat Timer Leak
**What goes wrong:** A settled blocking call keeps sending progress or leaves intervals active.
**Why it happens:** Missing paired `clearInterval` and single-resolve guard.
**How to avoid:** Clone `run_task` `settled` flag pattern and add VM clock tests.
**Warning signs:** Sequential test invocations leave active interval count > 0.

### Pitfall 3: Safety Ceiling Deletes the Watcher
**What goes wrong:** Long waits auto-detach but the trigger stops watching.
**Why it happens:** Safety ceiling is implemented by the same cleanup path as timeout.
**How to avoid:** Separate `timed_out` terminal cleanup from `detached` response.
**Warning signs:** Snapshot missing after safety ceiling.

### Pitfall 4: Fire Event Races the Blocking Wait
**What goes wrong:** Blocking waiter sees `status:'fired'` but event fields are missing.
**Why it happens:** Lifecycle writes terminal status before event data is persisted.
**How to avoid:** Persist `last_event` in the same write as terminal or re-armed fire state.
**Warning signs:** Tests assert only status, not event fields.

### Pitfall 5: Detached Trigger Zombies
**What goes wrong:** Owner disconnect releases the agent, but trigger snapshot stays armed and consumes cap.
**Why it happens:** Agent registry cleanup does not notify trigger lifecycle.
**How to avoid:** Add `handleTriggerOwnerReleased(agentId)` and call it from `_fireStagedRelease`.
**Warning signs:** `listArmedSnapshots()` still includes released-agent triggers after grace.

### Pitfall 6: Re-Arm Flood
**What goes wrong:** `rearm_on_fire` fires repeatedly on the same threshold crossing.
**Why it happens:** `was_satisfied` resets too early or hysteresis is ignored.
**How to avoid:** Keep `was_satisfied:true` while the value remains on the fired side; reset only after hysteresis clearance.
**Warning signs:** Same value snapshot produces multiple fired outcomes.
</common_pitfalls>

<code_examples>
## Code Examples

### Existing Run-Task Heartbeat Shape
```javascript
// Source: extension/ws/mcp-bridge-client.js
const heartbeatTimer = setInterval(fireHeartbeat, 30_000);
try {
  this._sendProgress(mcpMsgId, payload);
} catch (_e) { /* best-effort */ }
```

### Existing Server Progress Mapping
```typescript
// Source: mcp/src/tools/autopilot.ts
extra.sendNotification({
  method: 'notifications/progress',
  params: {
    progressToken,
    progress: progress ?? 0,
    total: 100,
    message,
    _meta: { alive, step, elapsed_ms, current_url, ai_cycles, last_action },
  },
});
```

### Existing Trigger Snapshot Read
```javascript
// Source: extension/background.js
const snap = await FsbTriggerStore.readSnapshot(triggerId);
return { success: true, status: fsbTriggerProjectTriggerStatus(snap, Date.now()) };
```

### Existing Edge-Fire Output
```javascript
// Source: extension/utils/trigger-manager.js
return {
  outcome: isEdge ? 'fired' : 'no_fire',
  matched_condition: isEdge ? condition : undefined,
  old_value: result.old_value,
  new_value: newValue,
  next_state: { last_value: newValue, was_satisfied: satisfiedNow, last_evaluated_at: ts }
};
```
</code_examples>

<validation_architecture>
## Validation Architecture

### Requirement Coverage Strategy

| Requirement | Primary Automated Coverage | Secondary Coverage |
|-------------|----------------------------|--------------------|
| REPORT-01 | New trigger blocking heartbeat VM test; MCP smoke progress mapping | `node tests/mcp-tool-smoke.test.js` |
| REPORT-02 | Detached immediate-return test in `tests/mcp-tool-smoke.test.js` / trigger bridge lifecycle test | Status/list projection tests |
| REPORT-03 | Safety ceiling and bridge-disconnect partial-state tests | Trigger snapshot persistence tests |
| REPORT-04 | Fire event persistence/projection tests in `tests/trigger-lifecycle.test.js` and `tests/trigger-tool-dispatcher.test.js` | Blocking wait fired result test |
| REPORT-05 | Fire-once terminal lifecycle tests | Existing edge-fire tests in `tests/trigger-manager.test.js` |
| REPORT-06 | `timed_out` terminal cleanup test | Status/list terminal projection tests |
| REPORT-07 | Re-arm-on-fire + hysteresis tests | Owner/status/list tests for active re-armed trigger |

### Recommended Test Files

- `tests/trigger-blocking-reporting.test.js` -- new VM/source test for bridge wait, heartbeats, safety auto-detach, timeout, and bridge disconnect.
- `tests/mcp-tool-smoke.test.js` -- extend existing MCP registration/bridge expectations for new schema fields and timeout options.
- `tests/mcp-bridge-client-lifecycle.test.js` -- extend live bridge routing coverage if the blocking helper sits in `mcp-bridge-client.js`.
- `tests/trigger-lifecycle.test.js` -- fire event persistence, `timed_out`, re-arm-on-fire, owner release.
- `tests/trigger-manager.test.js` -- hysteresis reset/de-dup.
- `tests/trigger-tool-dispatcher.test.js` -- status/list projection of new fields.
- `tests/agent-grace.test.js` -- owner release triggers detached trigger reap after reconnect grace.
- `tests/tool-definitions-parity.test.js` and `tests/visual-session-schema-lock.test.js` -- additive schema parity.

### Verification Commands

Focused:
```bash
node tests/trigger-blocking-reporting.test.js
node tests/mcp-tool-smoke.test.js
node tests/trigger-lifecycle.test.js
node tests/trigger-manager.test.js
node tests/trigger-tool-dispatcher.test.js
node tests/agent-grace.test.js
node tests/tool-definitions-parity.test.js
node tests/visual-session-schema-lock.test.js
node --check extension/ws/mcp-bridge-client.js extension/background.js extension/utils/trigger-lifecycle.js extension/utils/trigger-manager.js extension/utils/agent-registry.js
```

Full:
```bash
npm test && npm --prefix mcp run build && npm run test:mcp-smoke:tools
```
</validation_architecture>

<open_questions>
## Open Questions

1. **Terminal snapshot retention length**
   - What we know: status/list needs to expose `timed_out` and fire events long enough for the blocking response and optional terminal list.
   - What's unclear: whether terminal snapshots should be deleted immediately after response, retained until next restore/sweep, or retained until explicit stop.
   - Recommendation: retain terminal snapshot through response/status projection, drop terminal snapshots on restore as existing lifecycle already does, and keep default list focused on active/attention states.

2. **Exact helper split**
   - What we know: bridge/tool layer owns reporting wait; lifecycle owns terminal state; manager stays pure.
   - What's unclear: whether the bridge wait helper should live as a method on `MCPBridgeClient` or a small local helper function inside the trigger branch.
   - Recommendation: prefer local `MCPBridgeClient` methods beside `_handleStartAutomation` so tests can reuse the existing VM harness.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)

- `.planning/phases/19-mcp-tools-blocking-detached-reporting/19-CONTEXT.md` -- locked implementation decisions.
- `.planning/ROADMAP.md` -- Phase 19 goal and success criteria.
- `.planning/REQUIREMENTS.md` -- REPORT-01..REPORT-07.
- `extension/ws/mcp-bridge-client.js` -- run-task heartbeat, safety-net, progress, and snapshot recovery pattern.
- `mcp/src/tools/autopilot.ts` -- MCP progress notification and bridge-disconnect recovery pattern.
- `mcp/src/tools/triggers.ts` -- current trigger registrar direct dispatch.
- `extension/background.js` -- current trigger arm/stop/status/list handlers and projection helpers.
- `extension/utils/trigger-store.js`, `trigger-lifecycle.js`, `trigger-manager.js` -- storage, lifecycle, and edge-fire source of truth.
- `extension/utils/agent-registry.js` and `tests/agent-grace.test.js` -- reconnect grace and owner release.

### Secondary

- None. External research was not needed because this phase reuses in-repo MCP/Chrome extension machinery and no new library/API choice is being made.
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: MCP bridge lifecycle reporting in a Chrome MV3 service worker.
- Ecosystem: existing FSB MCP server, extension bridge, trigger runtime, and plain Node tests.
- Patterns: run-task lifecycle return, trigger snapshot store, direct route companions, owner reconnect grace.
- Pitfalls: queue starvation, heartbeat leaks, safety-vs-timeout conflation, missing event persistence, detached zombie triggers, re-arm flood.

**Confidence breakdown:**
- Standard stack: HIGH -- no new stack decision.
- Architecture: HIGH -- built from existing Phase 14-18 and run-task patterns.
- Pitfalls: HIGH -- directly inferred from prior regressions and test harnesses.
- Code examples: HIGH -- all examples are from local source.

**Research date:** 2026-06-17
**Valid until:** End of v0.11.0 trigger-tool milestone or until MCP bridge architecture changes.
</metadata>

---

*Phase: 19-mcp-tools-blocking-detached-reporting*
*Research completed: 2026-06-17*
*Ready for planning: yes*
