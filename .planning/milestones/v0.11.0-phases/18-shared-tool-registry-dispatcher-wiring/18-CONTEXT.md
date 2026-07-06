# Phase 18: Shared Tool Registry & Dispatcher Wiring - Context

**Gathered:** 2026-06-16 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 18 exposes the trigger family through the existing shared tool surface and dispatcher plumbing: `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` are defined once, visible to both autopilot and MCP, and routed to background/service-worker trigger handlers. The phase must prove that existing MCP schemas are unchanged, companion trigger tools cannot be starved by a long-running trigger path, and trigger state/status is reported from persisted trigger snapshots. Phase 19 owns the blocking-vs-detached MCP return envelope, heartbeats, safety ceiling, and structured fire/timeout event reporting. Phase 20 owns cap UI, docs, cross-mode integration edge cases, and version-bump closeout.
</domain>

<decisions>
## Implementation Decisions

### Shared Registry & Schema Parity

- **D-01:** Add all four trigger tools to the shared `TOOL_REGISTRY` in `extension/ai/tool-definitions.js` and mirror the file byte-identically to `mcp/ai/tool-definitions.cjs`. Do not create a separate MCP-only or autopilot-only trigger schema stack.
- **D-02:** Existing tool definitions and schemas stay byte-identical; the trigger family is purely additive. Phase 18 must update schema/parity tests so `tests/tool-definitions-parity.test.js`, existing schema-lock coverage, and MCP route-contract coverage fail if the trigger tools drift, replace existing fields, or lack routes.
- **D-03:** `trigger` is a side-effecting background-routed tool that arms a persisted watcher through existing trigger runtime seams. It should start/own the watcher in `background.js` and return a bounded arm result (`success`/`trigger_id`/initial status) for Phase 18. Any extended blocking wait, heartbeat loop, auto-detach, or structured fire/timeout envelope is Phase 19.

### Queue Bypass & Deadlock Prevention

- **D-04:** `stop_trigger`, `get_trigger_status`, and `list_triggers` must bypass the single-slot mutation queue even while `trigger` or future blocking trigger reporting is outstanding. Do not register these companions through the ordinary manual action path if that would require visual-session fields or enqueue behind mutation tools.
- **D-05:** `stop_trigger` is semantically side-effecting but cancellation-critical. Treat it like `stop_task` for scheduling: it must be callable promptly, must not wait behind the trigger it cancels, and must return idempotently when the trigger is already terminal or missing.
- **D-06:** `get_trigger_status` and `list_triggers` are status/query tools backed by persisted trigger snapshots. They should be in the queue-bypass/read-only class and should not require visual-session fields.

### Dispatcher & Background Ownership

- **D-07:** Registry exposure is not enough. Add explicit MCP direct route contracts in `extension/ws/mcp-tool-dispatcher.js` for the four trigger tools, and route them to background/service-worker trigger handlers. A background-routed registry tool without a `hasMcpToolRoute()` route is a bug.
- **D-08:** The long-running watcher always lives in `background.js` and the trigger runtime modules, not inside an MCP server handler or the MCP single-slot queue. The MCP server/dispatcher should send an arm/stop/status/list message and receive a bounded response; it must not own `MutationObserver`, refresh-poll alarms, lifecycle fire decisions, or trigger storage.
- **D-09:** Reuse the existing trigger runtime seams. Arming delegates to `FsbTriggerManager.armTrigger(spec)`. Stop/status/list read and mutate `FsbTriggerStore` / `FsbTriggerLifecycle` state. Fire/no-fire decisions remain owned by `FsbTriggerLifecycle.handleTriggerAlarm()` and `FsbTriggerManager.evaluate()`.

### Stop, Status & List Semantics

- **D-10:** `stop_trigger` orchestration should read the persisted snapshot first, stop any content-side observer/pulse for that trigger (`triggerObserveStop` / `triggerPulseStop`) when a target tab is known, clear the live-observe watchdog if present, then clear the persisted snapshot/alarm via `FsbTriggerLifecycle.clearTrigger(trigger_id)`. Missing or already terminal triggers return a successful idempotent outcome rather than throwing.
- **D-11:** `get_trigger_status` returns from the storage-of-truth snapshot, not SW heap or `activeSessions`. Include at minimum: `trigger_id`, `status`, `watch`, `condition`, `target_tab_id`, `agent_id`, baseline/initial value, current/last/reported value, `armed_at`, elapsed, remaining TTL when calculable, `last_evaluated_at`, `last_reported_at`, and attention details (`attention_reason`, `last_attention`, blocked/not-found codes) when present.
- **D-12:** `list_triggers` enumerates the persisted trigger registry and returns compact trigger summaries for active and attention states by default. Include age, owner, watch mode, status, tab id, last-check/report timestamps, and remaining TTL. Do not synthesize state from alarm names alone.
- **D-13:** Ownership remains agent-scoped. `trigger` must bind the trigger snapshot to the calling `agent_id`, `target_tab_id`, and ownership token where available. Companion tools must reject cross-agent stop/status/list access using the same ownership semantics already used by refresh-poll and MCP tab dispatch, while preserving legacy behavior only where existing MCP agent-scope contracts require it.

### Tests & Verification

- **D-14:** Add focused Node/source tests for: tool definition parity, trigger schema additivity, all four direct MCP route contracts, companion bypass behavior while a mutation/trigger queue item is running, stop idempotency and observer/pulse cleanup call shape, status/list projection from persisted snapshots, and provider/autopilot visibility from the shared registry.
- **D-15:** Do not require live-browser UAT for Phase 18 beyond existing deferred milestone debt. This phase is primarily registry/dispatcher/storage orchestration and should be verifiable with Node tests plus source-contract checks.

### the agent's Discretion

- Exact trigger input schema details, as long as it supports one uniqueness-scored selector, one target tab, watch mode, extraction options, and the Phase 15 condition contract without inventing multi-element compound conditions.
- Exact implementation split for trigger background handlers: extend `background.js` near existing trigger helpers or extract a small helper module, as long as import/order and MV3 service-worker constraints remain coherent.
- Exact MCP server registration mechanism for queue-bypass companions, as long as the tools are still defined once in the shared registry and companions do not go through the ordinary queued manual action path.
- Exact status/list response field names beyond the minimum fields above, as long as the output remains compact, structured, and stable enough for MCP clients and autopilot to consume.

### Folded Todos

None -- no pending todos matched this phase.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope & Requirements

- `.planning/ROADMAP.md` -- Phase 18 goal and success criteria for shared registry, companion tools, read-only bypass, background-owned watcher, schema-lock, and provider parity.
- `.planning/REQUIREMENTS.md` -- TRIG-01, REG-01, REG-02, REG-03, REG-04, LIFE-01, LIFE-02, LIFE-03.
- `.planning/PROJECT.md` -- v0.11 trigger-tool goal, shared-registry invariant INV-02, additive MCP invariant INV-01, provider parity INV-03, and notify-only scope.
- `.planning/STATE.md` -- current milestone state, prior trigger implementation notes, REG-02 queue-starvation risk, and Phase 18 handoff.

### Prior Locked Trigger Decisions

- `.planning/phases/14-trigger-survivability-foundation/14-CONTEXT.md` -- trigger store/lifecycle, storage-is-truth, `fsbTrigger:<id>` alarms, `clearTrigger`, TTL/reap, and session-only survivability.
- `.planning/phases/15-fire-condition-engine-value-extraction/15-CONTEXT.md` -- pure `evaluate(snapshot, reportedValue, now?)`, `FsbTriggerManager.armTrigger(spec)`, cap behavior, and lifecycle fire write-back seam.
- `.planning/phases/16-live-observe-watch-analyzing-pulse/16-CONTEXT.md` -- `triggerObserveStart/Stop`, `triggerRead`, `triggerPulseStart/Stop`, live-observe value report shape, pulse behavior, and live-watch watchdog.
- `.planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md` -- own-tab refresh-poll, ownership validation, missing/blocked attention states, and pulse reassertion.

### Shared Tool Surface & MCP Routing

- `extension/ai/tool-definitions.js` -- canonical shared `TOOL_REGISTRY`, `_route`, `_readOnly`, `_contentVerb`, `_cdpVerb`, `getToolByName`, `getReadOnlyTools`, and export shape.
- `mcp/ai/tool-definitions.cjs` -- byte-identical MCP mirror of the shared registry.
- `mcp/src/tools/schema-bridge.ts` -- CJS-to-ESM bridge, `TOOL_REGISTRY` re-export, JSON Schema to Zod conversion, and param transforms.
- `mcp/src/tools/manual.ts` -- ordinary non-read-only action registration, visual-session validation, and queued mutation path to avoid for companions.
- `mcp/src/tools/read-only.ts` -- read-only/bypass tool registration pattern and bridge message mapping.
- `mcp/src/tools/autopilot.ts` -- `run_task`, direct `stop_task`, and status patterns that inform cancellation/status behavior.
- `mcp/src/queue.ts` -- TaskQueue read-only bypass derives from registry read-only tools plus explicit non-registry bypass names.
- `extension/ws/mcp-tool-dispatcher.js` -- direct route contracts, alias routes, ownership gate, `dispatchMcpToolRoute`, and background route failure behavior.
- `extension/ws/mcp-bridge-client.js` -- background-routed tool dispatch through `hasMcpToolRoute()` / `dispatchMcpToolRoute()`.

### Trigger Runtime Integration Points

- `extension/utils/trigger-store.js` -- persisted trigger registry, `readSnapshot`, `writeSnapshot`, `deleteSnapshot`, `hydrate`, and `listArmedSnapshots`.
- `extension/utils/trigger-manager.js` -- `armTrigger(spec)`, storage-backed active cap, condition schema consumption, and `FsbTriggerManager` export.
- `extension/utils/trigger-lifecycle.js` -- `armTrigger`, `clearTrigger`, `handleTriggerAlarm`, `handleTriggerTabRemoved`, `restoreTriggersFromStorage`, and alarm constants.
- `extension/background.js` -- existing trigger helpers around `fsbTriggerStartObserveForSnapshot`, `fsbTriggerStopObserveForSnapshot`, `fsbTriggerHandleRefreshPollAlarm`, `fsbTriggerHandleValueReport`, `fsbTriggerHandleObserveWatchdog`, and `chrome.alarms.onAlarm` trigger branches.
- `extension/content/messaging.js` -- content router cases for `triggerObserveStart`, `triggerObserveStop`, `triggerRead`, `triggerPulseStart`, and `triggerPulseStop`.
- `extension/content/trigger-observe.js` -- content-side observe/read value shape.

### Contract Tests To Extend

- `tests/tool-definitions-parity.test.js` -- byte identity and registry sanity checks.
- `tests/visual-session-schema-lock.test.js` -- action/read-only classification schema-lock precedent.
- `tests/mcp-tool-routing-contract.test.js` -- direct MCP route-contract coverage, including background registry route checks.
- `tests/mcp-tool-smoke.test.js` -- packaged runtime registration and queue/direct-call expectations.
- `tests/trigger-lifecycle.test.js`, `tests/trigger-manager.test.js`, `tests/trigger-store.test.js`, `tests/trigger-refresh-poll.test.js`, `tests/trigger-observe.test.js`, `tests/trigger-observe-pulse.test.js` -- trigger runtime harnesses and source-contract patterns to reuse.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `TOOL_REGISTRY` already carries route/read-only metadata and is consumed by both MCP and extension-side code. The trigger tools should join this registry instead of inventing a new registry.
- `TaskQueue` already implements name-based read-only bypass. This is the mechanism that protects status/cancellation tools from queue starvation.
- `dispatchMcpToolRoute` / `getMcpRouteContracts` already enforce direct route availability for background-routed tools.
- `FsbTriggerStore.hydrate()` and `readSnapshot()` provide the storage-of-truth surface for status/list.
- `FsbTriggerLifecycle.clearTrigger()` clears registry entry and alarm; `fsbTriggerStopObserveForSnapshot()` in `background.js` is the existing content cleanup shape for observer/pulse.
- `FsbTriggerManager.armTrigger(spec)` already creates persisted snapshots and delegates alarm/storage writes to lifecycle.

### Established Patterns

- Shared schemas are additive and byte-identity locked between `extension/ai/tool-definitions.js` and `mcp/ai/tool-definitions.cjs`.
- MCP registration is split by classification: ordinary action tools go through `manual.ts` and queue serialization; read-only/bypass tools go through a different registration path and bypass queue execution.
- Background-routed registry tools need explicit route entries in `extension/ws/mcp-tool-dispatcher.js`; otherwise `mcp-bridge-client.js` returns `mcp_route_unavailable`.
- Trigger runtime state is storage-first. SW heap state, `activeSessions`, and live alarm names are not authoritative enough for status/list.

### Integration Points

- Tool definitions: add `trigger`, `stop_trigger`, `get_trigger_status`, `list_triggers` once to the shared registry and keep the MCP mirror byte-identical.
- MCP server: register the trigger tools from the shared registry while ensuring companions bypass queue and `trigger` does not become a long-lived queued handler in Phase 18.
- Dispatcher/bridge: add route contracts and background handlers so `hasMcpToolRoute()` returns true and background-routed calls dispatch successfully.
- Background SW: add arm/stop/status/list handlers near existing trigger helpers, reusing `FsbTriggerManager`, `FsbTriggerStore`, `FsbTriggerLifecycle`, content trigger message paths, and existing ownership validation patterns.
- Tests: extend parity/schema/route/smoke tests plus focused trigger runtime tests rather than relying on manual Chrome UAT.
</code_context>

<specifics>
## Specific Ideas

No user-specific corrections were supplied during this assumptions-mode run. The locked direction is the codebase-standard approach: shared registry first, direct dispatcher routes second, background-owned watcher, and queue-bypassing companions.
</specifics>

<deferred>
## Deferred Ideas

- Blocking-by-default `trigger()` wait loop, heartbeats, auto-convert-to-detached, detached TTL/reconnect grace, and structured fire/timeout event envelope -- Phase 19.
- Trigger cap UI, docs, CHANGELOG/README, version bump, co-located watch-mode conflict handling, and reload coalescing -- Phase 20.
- Cross-browser-restart trigger auto-resume via `chrome.storage.local` -- future SURV-FUTURE-01, out of v0.11 scope.
- Auto-act-on-fire, desktop/push/email/Slack notifications, and multi-element compound trigger conditions -- explicitly future scope in requirements.

### Reviewed Todos (not folded)

None -- no matching todos were found.
</deferred>

---

*Phase: 18-shared-tool-registry-dispatcher-wiring*
*Context gathered: 2026-06-16*
