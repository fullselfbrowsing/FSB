# Phase 17: Refresh-Poll Watch (Tab-Owning Background Reload) - Context

**Gathered:** 2026-06-16 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the `refresh-poll` watch mechanism for static / server-rendered pages: a trigger reloads its own persisted tab on an alarm cadence, re-reads the watched element through the shared selector/value-read path, and evaluates in the service worker. This phase owns WATCH-02, WATCH-03, and WATCH-04 only.

**In scope:** configurable refresh-poll interval with a hard 30s floor and ~60s default; background reload of the trigger's own tab; no focus theft; post-reload read/evaluate; element-not-found and blocked-page states; pulse re-assertion after reload.

**Explicitly NOT in this phase:** public `trigger` / companion tool registration (Phase 18), MCP blocking/detached return and fire envelope (Phase 19), same-tab watch-mode conflict and reload coalescing across colocated refresh-poll triggers (Phase 20), cross-browser-restart resume (SURV-FUTURE-01), and any change to `extension/ai/agent-loop.js` (INV-04).
</domain>

<decisions>
## Implementation Decisions

### Evaluation Seam
- **D-01:** Refresh-poll uses the existing storage-first evaluation seam: content reads the watched value as `{ text, attributes? }`, the service worker stages it on the trigger snapshot as `reported_value` / `reported_attributes`, then calls `FsbTriggerLifecycle.handleTriggerAlarm({ name: 'fsbTrigger:<id>' })` so `FsbTriggerManager.evaluate()` remains pure and `trigger-lifecycle.js` remains the only owner of terminal fire write-back.
- **D-02:** Do not add a second evaluator, do not evaluate in the content script, and do not write `status:'fired'` from refresh-poll glue. Missing, blocked, parse-error, no-fire, and fired outcomes all flow through the existing lifecycle/manager contracts.

### Alarm Cadence
- **D-03:** Refresh-poll reuses the existing per-trigger `fsbTrigger:<trigger_id>` alarm namespace for poll ticks, but Phase 17 must extend the snapshot/alarm behavior from one-shot TTL-only wakeups to recurring poll cadence. `deadline_at` remains the absolute TTL/reap boundary; a persisted normalized poll interval drives repeat checks.
- **D-04:** The refresh interval is normalized at arm time and persisted on the snapshot (recommended field: `poll_interval_ms`). Default is ~60s. Any interval below `FsbTriggerLifecycle.TRIGGER_ALARM_MIN_PERIOD_MS` (30s) is rejected with guidance to use `live-observe` instead of silently clamping.
- **D-05:** Add light jitter to scheduled refresh-poll wakeups so multiple watches do not reload on an exact metronome. Jitter must not violate the 30s floor or the absolute `deadline_at`.

### Tab Ownership & Background Reload
- **D-06:** A refresh-poll tick reloads only `snapshot.target_tab_id`; it never calls `chrome.tabs.query({ active:true })`, never falls back to the active tab, and never calls `chrome.tabs.update(..., { active:true })`.
- **D-07:** Before any reload, validate that `snapshot.agent_id` still owns `snapshot.target_tab_id` through `globalThis.fsbAgentRegistryInstance` (`hasAgent`, `getOwner`, `isOwnedBy` where available). If another agent owns the tab, return a typed `TAB_NOT_OWNED` / ownership outcome and do not call `chrome.tabs.reload`.
- **D-08:** Stamp `fsbAgentRegistryInstance.stampAgentNavigation(target_tab_id)` before `chrome.tabs.reload(target_tab_id)` so the existing agent-navigation suppression treats the reload as agent-driven, mirroring MCP/autopilot refresh paths.
- **D-09:** Refresh-poll must use a trigger-specific background-safe send/read path, not `sendMessageWithRetry()`, because the generic BF-cache recovery branch can activate the tab. It may reuse `ensureContentScriptInjected(tabId)` and `chrome.tabs.sendMessage(tabId, ..., { frameId: 0 })`, but it must not use recovery code that focuses or activates the tab.

### Post-Reload Read, Attention States & Pulse
- **D-10:** After reload, wait for tab completion / content readiness, inject the content bundle if needed, then read through the shared `triggerRead` selector/value path so refresh-poll consumes the Phase-16 selector re-resolution and value-shape contract.
- **D-11:** Extend `triggerRead` or wrap it so element-not-found is explicit. Current `readValue(null)` returns `{ text: '' }`; refresh-poll must not feed missing-element empty text to `evaluate()`. A missing watched element becomes `needs_attention` and stays non-fired.
- **D-12:** If reload lands on a restricted URL, login/auth wall, CAPTCHA/challenge, or other blocker, mark the trigger `blocked` or `needs_attention` and do not evaluate challenge-page content as the watched element. This status should preserve enough snapshot context for Phase 18/19 status tools to report it later.
- **D-13:** Re-assert the analyzing pulse after each successful reload/read while the trigger remains armed, using the existing `triggerPulseStart` path. Clear behavior remains owned by the existing fire/stop/timeout/reap paths.

### Tests & Verification Shape
- **D-14:** Add focused Node tests following the existing plain-script pattern: interval floor/default/jitter normalization, no active-tab query / no activation, ownership rejection before reload, post-reload not-found does not fire, blocked-page classification does not fire, and pulse re-start after reload.
- **D-15:** Live-browser UAT for real background reload/no-focus behavior can be tracked for Phase 20 integration, matching the Phase 16 live-UAT deferral pattern. Phase 17 should still have deterministic Node coverage for the logic and Chrome API call shape.

### the agent's Discretion
- Exact helper/module placement for refresh-poll glue: either extend `background.js` alongside the live-observe helpers or extract a small trigger watch helper, as long as existing file ownership and importScripts load order stay coherent.
- Exact jitter amount and whether it is deterministic in tests, as long as it is light and floor-safe.
- Exact internal status names for attention outcomes, as long as downstream tools can distinguish `element_not_found`, `blocked`, `parse_error`, and ordinary `no_fire`.

### Folded Todos
None -- no pending todos matched this phase.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope
- `.planning/ROADMAP.md` -- Phase 17 goal and success criteria for refresh-poll reload, 30s floor, own-tab/no-focus behavior, blocked-page handling, and pulse re-assertion.
- `.planning/REQUIREMENTS.md` -- WATCH-02, WATCH-03, WATCH-04.
- `.planning/phases/14-trigger-survivability-foundation/14-CONTEXT.md` -- locked trigger store/lifecycle, `fsbTrigger:<id>` alarm namespace, storage-is-truth, TTL/reap behavior, and INV-04 constraint.
- `.planning/phases/15-fire-condition-engine-value-extraction/15-CONTEXT.md` -- locked pure `evaluate(snapshot, reportedValue, now?)` contract and `{ text, attributes? }` reported-value shape.
- `.planning/phases/16-live-observe-watch-analyzing-pulse/16-CONTEXT.md` -- locked selector re-resolution/read layer, pulse path, content/SW value-report contract, and deferred refresh-poll boundary.

### Source Integration Points
- `extension/utils/trigger-lifecycle.js` -- `TRIGGER_ALARM_PREFIX`, `TRIGGER_ALARM_MIN_PERIOD_MS`, `armTrigger`, `handleTriggerAlarm`, TTL reap, and the Phase-15 evaluation seam.
- `extension/utils/trigger-store.js` -- persisted snapshot schema (`selector`, `target_tab_id`, `agent_id`, `watch`, `deadline_at`, `reported_value`, `reported_attributes`) and `listArmedSnapshots()`.
- `extension/utils/trigger-manager.js` -- pure `evaluate()` and `armTrigger()` snapshot creation/cap gate; refresh-poll must not duplicate its comparison logic.
- `extension/background.js` -- existing live-observe trigger helpers around `fsbTriggerHandleValueReport`, `fsbTriggerStartObserveForSnapshot`, `fsbTriggerSendTabMessage`, `ensureContentScriptInjected`, `chrome.alarms.onAlarm`, `webNavigation`/`tabs.onUpdated` re-arm, and `sendMessageWithRetry` focus-stealing BF-cache branch to avoid.
- `extension/content/messaging.js` -- `triggerRead`, `triggerPulseStart`, `triggerPulseStop` router cases.
- `extension/content/trigger-observe.js` -- shared `readValue()` value-shape contract; current missing-element behavior to fix/wrap.
- `extension/content/selectors.js` -- `FSB.querySelectorWithShadow` and uniqueness validation APIs.
- `extension/utils/agent-registry.js` -- tab ownership (`getOwner`, `isOwnedBy`, `hasAgent`, `stampAgentNavigation`) and persisted selected/owned tab state.
- `extension/utils/agent-tab-resolver.js` -- agent-scoped tab resolution precedent; Phase 17 should not resolve from active tab during a poll tick.
- `extension/ws/mcp-tool-dispatcher.js` and `extension/ai/tool-executor.js` -- existing background-safe reload/refresh patterns and agent-navigation stamping.
- `tests/trigger-lifecycle.test.js`, `tests/trigger-observe.test.js`, `tests/trigger-observe-pulse.test.js`, `tests/agent-tab-resolver.test.js`, `tests/open-tab-background-default.test.js` -- Node test harness patterns for this phase.

### External API References
- `https://developer.chrome.com/docs/extensions/reference/api/alarms` -- Chrome alarms production floor: alarms are limited to at most once every 30 seconds; sub-0.5-minute `delayInMinutes` / `periodInMinutes` is not honored.
- `https://developer.chrome.com/docs/extensions/reference/api/tabs#method-reload` -- `chrome.tabs.reload(tabId, reloadProperties)` reloads the supplied tab ID; omitting `tabId` defaults to the selected tab, so Phase 17 must always pass `target_tab_id`.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FsbTriggerLifecycle.handleTriggerAlarm()` already re-reads the snapshot from `chrome.storage.session`, builds `reportedValue` from staged snapshot fields, calls `FsbTriggerManager.evaluate()`, and performs atomic fired/no-fire storage writes.
- `background.js` Phase-16 trigger helpers already know how to stage value reports, call the lifecycle seam, send `triggerPulseStart`, and send tab messages without routing through public MCP tools.
- `content/messaging.js` already exposes `triggerRead` and pulse controls; `content/trigger-observe.js` already centralizes the value extraction shape.
- `agent-registry.js` and MCP dispatcher ownership helpers provide the exact ownership semantics and error vocabulary Phase 17 needs to mirror.
- `pageLoadWatcher`, `ensureContentScriptInjected`, `chrome.tabs.onUpdated`, and `webNavigation` handling already provide readiness/injection primitives.

### Established Patterns
- **Storage is truth:** trigger status, reported values, edge state, TTL, and ownership fields live in the snapshot, not SW heap.
- **Content reads, SW decides:** content script reads raw values only; service worker evaluates and writes terminal state.
- **Background-tab posture:** reload/history actions can target an explicit tab ID without activating it; explicit activation APIs are opt-in and must not be used by refresh-poll.
- **Ownership before side effect:** cross-agent side effects reject before touching Chrome APIs.
- **Plain Node tests:** repository uses direct `node tests/*.test.js` scripts with hand-rolled Chrome/content mocks.

### Integration Points
- Add refresh-poll detection near the trigger alarm handling path so `watch:'refresh-poll'` snapshots run reload/read/evaluate instead of the live-observe watchdog path or plain TTL-only evaluation.
- Add a background-safe reload helper that validates ownership, stamps agent navigation, calls `chrome.tabs.reload(target_tab_id)`, waits for completion/readiness, injects content scripts, and sends `triggerRead`.
- Stage the read value on the snapshot and delegate evaluation to `FsbTriggerLifecycle.handleTriggerAlarm()`.
- Update or wrap `triggerRead` so missing selector is visible to the SW.
- Re-start `triggerPulseStart` after each reload while armed.
- Add tests to `package.json` only if a new test file is created; follow the existing explicit script chain pattern.
</code_context>

<specifics>
## Specific Ideas

- The generic `sendMessageWithRetry()` helper is unsafe for refresh-poll because its BF-cache recovery branch can call `chrome.tabs.update(tabId, { active:true })`. Refresh-poll needs a narrower read helper.
- Chrome's docs confirm the 30s alarms floor. Rejecting sub-floor refresh-poll intervals is better than clamping because the caller may actually need `live-observe`.
- The no-focus reload conclusion is an inference from the official `tabs.reload(tabId)` shape plus FSB's existing background-tab refresh code: reload accepts no `active` option, while focus-stealing is handled by separate `tabs.update(..., { active:true })` / `windows.update` APIs.
- `triggerRead` currently cannot distinguish missing element from empty text; this is the most important false-fire trap in the phase.
</specifics>

<deferred>
## Deferred Ideas

- Public `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` registration -- Phase 18.
- MCP blocking/detached return and structured notify-only fire envelope -- Phase 19.
- Same-tab `live-observe` vs `refresh-poll` conflict handling and co-located refresh-poll reload coalescing -- Phase 20.
- Cross-browser-restart resume -- SURV-FUTURE-01.
- Desktop/Chrome push notifications and auto-act-on-fire workflows -- future notify/action phases, explicitly out of scope.

### Reviewed Todos (not folded)
None -- no pending todos matched this phase.
</deferred>

---

*Phase: 17-refresh-poll-watch-tab-owning-background-reload*
*Context gathered: 2026-06-16*
