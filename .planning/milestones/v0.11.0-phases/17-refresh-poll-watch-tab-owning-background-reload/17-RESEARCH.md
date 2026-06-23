# Phase 17: Refresh-Poll Watch (Tab-Owning Background Reload) - Research

**Researched:** 2026-06-16  
**Domain:** Chrome MV3 trigger watch lifecycle, tab ownership, background reload, alarm-driven polling  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

All text in this section is copied from `.planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md`. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md]

### Locked Decisions

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

### Claude's Discretion

- Exact helper/module placement for refresh-poll glue: either extend `background.js` alongside the live-observe helpers or extract a small trigger watch helper, as long as existing file ownership and importScripts load order stay coherent.
- Exact jitter amount and whether it is deterministic in tests, as long as it is light and floor-safe.
- Exact internal status names for attention outcomes, as long as downstream tools can distinguish `element_not_found`, `blocked`, `parse_error`, and ordinary `no_fire`.

### Deferred Ideas (OUT OF SCOPE)

- Public `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` registration -- Phase 18.
- MCP blocking/detached return and structured notify-only fire envelope -- Phase 19.
- Same-tab `live-observe` vs `refresh-poll` conflict handling and co-located refresh-poll reload coalescing -- Phase 20.
- Cross-browser-restart resume -- SURV-FUTURE-01.
- Desktop/Chrome push notifications and auto-act-on-fire workflows -- future notify/action phases, explicitly out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WATCH-02 | User can choose `refresh-poll` mode; the trigger periodically reloads the element's tab and re-reads the value for static/server-rendered pages. | Use `background.js` refresh-poll helpers that reload `snapshot.target_tab_id`, send `triggerRead`, stage `reported_value`, and delegate to `FsbTriggerLifecycle.handleTriggerAlarm`. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: extension/background.js:3453-3549; VERIFIED: extension/utils/trigger-lifecycle.js:269-373] |
| WATCH-03 | Refresh-poll interval is configurable with a hard 30s floor and about 60s default; sub-floor requests are rejected with guidance to use `live-observe`. | Chrome limits production alarms to no more than once every 30 seconds, and `FsbTriggerLifecycle.TRIGGER_ALARM_MIN_PERIOD_MS` already exports `30000`. [CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms; VERIFIED: extension/utils/trigger-lifecycle.js:71-79] |
| WATCH-04 | Refresh-poll reloads target the trigger's own tab and never steal focus from the user or other agents. | Use registry ownership checks before `chrome.tabs.reload(target_tab_id)`, stamp agent navigation, and forbid `chrome.tabs.query({active:true})` / `tabs.update(...active:true)` in the refresh-poll path. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: extension/utils/agent-registry.js:573-587; VERIFIED: extension/ws/mcp-tool-dispatcher.js:771-804; CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs] |
</phase_requirements>

## Summary

Phase 17 should be implemented as additive service-worker glue around the Phase 14-16 seams: the poll tick belongs in `background.js`, the persisted state belongs in `FsbTriggerStore`, the comparison belongs in `FsbTriggerManager.evaluate()`, and terminal fire write-back remains owned by `FsbTriggerLifecycle.handleTriggerAlarm()`. [VERIFIED: extension/background.js:3453-3549; VERIFIED: extension/utils/trigger-store.js:22-44; VERIFIED: extension/utils/trigger-manager.js:11-20; VERIFIED: extension/utils/trigger-lifecycle.js:313-373]

The load-bearing external constraints are Chrome's MV3 service-worker lifecycle and alarms/tabs API behavior: extension service workers can shut down after inactivity and must persist state outside globals; Chrome 120+ aligns the minimum alarm period with the 30-second lifecycle; `chrome.tabs.reload(tabId)` reloads the supplied tab, while omitting `tabId` defaults to the selected tab. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle; CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms; CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs]

**Primary recommendation:** add a `refresh-poll` tick helper in the existing trigger helper block of `extension/background.js`, backed by small testable normalization/ownership/read helpers, and drive all outcomes through persisted snapshot fields rather than a new evaluator. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md; VERIFIED: extension/background.js:3398-3631]

## Project Constraints

No `AGENTS.md`, `CLAUDE.md`, `.claude/skills/`, or `.agents/skills/` project instructions were present in the workspace probe. [VERIFIED: workspace command output 2026-06-16]

Graphify is disabled in this workspace, so semantic graph relationships were not available for this research. [VERIFIED: `gsd-tools graphify query` output]

`workflow.nyquist_validation` is absent in `.planning/config.json`, so the Validation Architecture section is included under the GSD rule that absent means enabled. [VERIFIED: .planning/config.json]

`security_enforcement` is absent in `.planning/config.json`, so the Security Domain section is included under the GSD rule that absent means enabled. [VERIFIED: .planning/config.json]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Poll cadence normalization and jitter | Extension Service Worker | Chrome alarms API | The recurring wake is `fsbTrigger:<id>` and Chrome alarms are the survivable timer surface. [VERIFIED: extension/utils/trigger-lifecycle.js:60-79; CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms] |
| Own-tab reload | Extension Service Worker | Chrome tabs API | The SW can call `chrome.tabs.reload(target_tab_id)` after registry ownership validation; content scripts cannot call the tabs API. [VERIFIED: extension/ws/mcp-tool-dispatcher.js:771-804; CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs] |
| Element re-read | Content Script | Extension Service Worker | The content script resolves the selector and reads `{ text, attributes? }`; the SW requests the read and persists the report. [VERIFIED: extension/content/messaging.js:1280-1294; VERIFIED: extension/content/trigger-observe.js:21-43; VERIFIED: extension/background.js:3520-3528] |
| Fire-condition evaluation | Extension Service Worker | Trigger manager module | `FsbTriggerManager.evaluate()` is pure and `FsbTriggerLifecycle.handleTriggerAlarm()` owns storage write-back. [VERIFIED: extension/utils/trigger-manager.js:11-20; VERIFIED: extension/utils/trigger-lifecycle.js:342-373] |
| Attention/blocked state | Extension Service Worker | Trigger store | Missing/blocked outcomes must be persisted on the snapshot so Phase 18/19 status tools can report them. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md; VERIFIED: extension/utils/trigger-store.js:22-44] |
| Analyzing pulse reassertion | Extension Service Worker | Content Script | The SW sends `triggerPulseStart`; content resolves the selector and applies the pulse. [VERIFIED: extension/background.js:3471-3479; VERIFIED: extension/content/messaging.js:1296-1325] |

## Standard Stack

### Core

| Library / API | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| Chrome `chrome.alarms` | Chrome 120+ 30s minimum period behavior; docs last updated 2026-06-08 | Poll tick / SW wake for refresh-poll | Official MV3 timer surface that survives SW lifecycle events better than globals/timers. [CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms; CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle] |
| Chrome `chrome.tabs` | Chrome 88+ promise methods; docs last updated 2026-03-03 | Explicit background reload and main-frame messaging | `reload(tabId)` targets a supplied tab, and `sendMessage(...,{frameId:0})` targets one frame. [CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs] |
| Chrome `chrome.storage.session` | Existing MV3 extension storage API | Live trigger snapshot persistence | The existing trigger store uses session storage as the source of truth across SW eviction. [VERIFIED: extension/utils/trigger-store.js:15-22; CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle] |
| `FsbTriggerStore` / `FsbTriggerLifecycle` / `FsbTriggerManager` | Local v0.11.0 modules in extension 0.9.90 | Trigger persistence, alarm handling, pure evaluation | These are already wired and tested for storage-first evaluation and exactly-one fire semantics. [VERIFIED: extension/background.js:47-50; VERIFIED: tests/trigger-lifecycle.test.js baseline run 105/105 PASS] |
| `triggerRead` / `triggerPulseStart` content router | Local Phase 16 content API | Value read and pulse reassertion after reload | Existing router cases already expose the content-side read and pulse controls needed by refresh-poll. [VERIFIED: extension/content/messaging.js:1280-1325; VERIFIED: tests/trigger-observe.test.js baseline run 10/10 PASS] |

### Supporting

| Library / API | Version | Purpose | When to Use |
|---------------|---------|---------|-------------|
| `ensureContentScriptInjected(tabId)` | Local background helper | Re-inject/readiness after reload | Use after tab completion before `chrome.tabs.sendMessage(...,{frameId:0})`. [VERIFIED: extension/background.js:3226-3396] |
| `fsbAgentRegistryInstance` | Local agent registry | Own-tab validation and navigation stamping | Use before reload to reject other-agent tabs and stamp agent-initiated navigation. [VERIFIED: extension/utils/agent-registry.js:573-587; VERIFIED: extension/utils/agent-registry.js:987-1000] |
| Plain Node script tests | Node v24.14.1 available locally | Deterministic Chrome API mocks | Use for interval, ownership, reload/read, and no-focus source-shape tests. [VERIFIED: local environment probe; VERIFIED: package.json `scripts.test`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `chrome.alarms` | SW `setInterval` / standing `setTimeout` | Rejected because extension service-worker globals/timers are not durable across shutdown. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle; VERIFIED: .planning/research/PITFALLS.md:359-368] |
| Explicit `target_tab_id` reload | `chrome.tabs.query({active:true})` then reload | Rejected because it can select the user's foreground tab and violates WATCH-04. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md; CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs] |
| Trigger-specific send/read helper | `sendMessageWithRetry()` | Rejected because the generic BF-cache recovery branch can call `chrome.tabs.update(tabId,{active:true})`. [VERIFIED: extension/background.js:3998-4112] |
| Existing evaluator seam | A second refresh-poll evaluator | Rejected because Phase 15 already owns pure condition evaluation and Phase 14/15 lifecycle owns fire write-back. [VERIFIED: extension/utils/trigger-manager.js:11-20; VERIFIED: extension/utils/trigger-lifecycle.js:313-373] |

**Installation:**
```bash
# No new npm package is recommended for Phase 17.
```

**Version verification:** No new npm package is recommended, so `npm view` package verification is not applicable. Existing local dependencies are `axios ^1.6.0`, `lattice` aliasing `@full-self-browsing/lattice@1.3.0`, `@full-self-browsing/lattice-cli 1.3.0`, and `esbuild ^0.24.0`. [VERIFIED: package.json]

## Architecture Patterns

### System Architecture Diagram

```text
Chrome alarm: fsbTrigger:<trigger_id>
  -> Extension SW onAlarm branch
    -> read snapshot from chrome.storage.session
    -> if watch != refresh-poll: existing lifecycle/watchdog paths
    -> validate TTL/deadline and status
    -> validate snapshot.agent_id owns snapshot.target_tab_id
      -> reject TAB_NOT_OWNED attention state before Chrome side effects
    -> stamp agent navigation
    -> chrome.tabs.reload(snapshot.target_tab_id)
    -> wait for tab complete/readiness
    -> ensure content scripts injected
    -> chrome.tabs.sendMessage(tabId, { action:'triggerRead', ... }, { frameId:0 })
      -> content re-resolves selector and reads { text, attributes? }
      -> if element missing: explicit not_found
      -> if blocked/challenge/login: explicit blocked/needs_attention
    -> stage reported_value / reported_attributes on snapshot
    -> FsbTriggerLifecycle.handleTriggerAlarm({ name:'fsbTrigger:<id>' })
      -> FsbTriggerManager.evaluate(snapshot, reportedValue)
      -> lifecycle writes fired/no_fire/parse_error state
    -> if still armed: schedule next jittered poll and re-send triggerPulseStart
```

This flow keeps Chrome API side effects in the SW, DOM reads in content, and terminal fire write-back in the lifecycle seam. [VERIFIED: extension/background.js:3453-3549; VERIFIED: extension/content/messaging.js:1280-1325; VERIFIED: extension/utils/trigger-lifecycle.js:269-373]

### Recommended Project Structure

```text
extension/
+-- background.js                  # Add refresh-poll helpers beside Phase-16 trigger helpers.
+-- content/
|   +-- messaging.js               # Make triggerRead return explicit not_found metadata.
|   +-- trigger-observe.js         # Optionally expose resolve/read helper shape without changing evaluator.
+-- utils/
    +-- trigger-lifecycle.js       # Extend alarm scheduling only if needed; keep fire write-back here.
    +-- trigger-manager.js         # Persist poll_interval_ms at arm-time if arming path is touched.

tests/
+-- trigger-refresh-poll.test.js   # New focused Node mock tests for Phase 17.
```

This placement is the lowest-risk option because `background.js` already owns `fsbTriggerHandleValueReport`, observe watchdogs, content injection, and tab alarm routing. [VERIFIED: extension/background.js:3398-3631; VERIFIED: extension/background.js:13595-13643]

### Pattern 1: Normalize Interval Once, Persist Milliseconds

**What:** Validate `refresh-poll` interval at arm time and store `poll_interval_ms` on the snapshot. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md]

**When to use:** Use before `FsbTriggerLifecycle.armTrigger(snapshot)` or inside a refresh-poll-specific test arm helper. [VERIFIED: extension/utils/trigger-manager.js:599-617]

**Example:**
```javascript
// Source: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md D-03..D-05
function normalizeRefreshPollInterval(inputMs) {
  const floor = FsbTriggerLifecycle.TRIGGER_ALARM_MIN_PERIOD_MS;
  const defaultMs = 60000;
  const ms = inputMs == null ? defaultMs : Number(inputMs);
  if (!Number.isFinite(ms) || ms < floor) {
    return {
      ok: false,
      code: 'REFRESH_POLL_INTERVAL_TOO_LOW',
      min_interval_ms: floor,
      guidance: 'Use live-observe for sub-30s changes.'
    };
  }
  return { ok: true, poll_interval_ms: Math.floor(ms) };
}
```

### Pattern 2: Own-Tab Reload Before Read

**What:** Reload only `snapshot.target_tab_id` after synchronous registry checks and agent-navigation stamping. [VERIFIED: extension/utils/agent-registry.js:573-587; VERIFIED: extension/utils/agent-registry.js:987-1000]

**When to use:** Use on every refresh-poll alarm tick before `chrome.tabs.reload`. [VERIFIED: extension/ws/mcp-tool-dispatcher.js:771-804; VERIFIED: extension/ai/tool-executor.js:266-275]

**Example:**
```javascript
// Source: extension/ws/mcp-tool-dispatcher.js:771-804 + extension/utils/agent-registry.js:573-587
function checkRefreshPollOwnership(snap) {
  const reg = globalThis.fsbAgentRegistryInstance;
  const tabId = Number(snap && snap.target_tab_id);
  const agentId = snap && snap.agent_id;
  if (!reg || !Number.isFinite(tabId) || !agentId || (reg.hasAgent && !reg.hasAgent(agentId))) {
    return { ok: false, code: 'AGENT_NOT_REGISTERED', tabId, agentId };
  }
  const ownerAgentId = reg.getOwner ? reg.getOwner(tabId) : null;
  if (ownerAgentId && ownerAgentId !== agentId) {
    return { ok: false, code: 'TAB_NOT_OWNED', ownerAgentId, requestedTabId: tabId, requestingAgentId: agentId };
  }
  if (reg.isOwnedBy && !reg.isOwnedBy(tabId, agentId)) {
    return { ok: false, code: 'TAB_NOT_OWNED', ownerAgentId, requestedTabId: tabId, requestingAgentId: agentId };
  }
  return { ok: true, tabId };
}
```

### Pattern 3: Explicit Missing/Blocked Outcomes Before Evaluation

**What:** Do not call `evaluate()` when the selected element is absent or the reloaded tab is blocked/challenged. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md; VERIFIED: extension/content/trigger-observe.js:21-23]

**When to use:** Use after content readiness and before staging `reported_value`. [VERIFIED: extension/background.js:3520-3537]

**Example:**
```javascript
// Source: extension/content/messaging.js:1280-1294 + Phase 17 D-11/D-12
// Content response should become one of:
{ ok: true, value: { text: '$42', attributes: { 'data-price': '$42' } } }
{ ok: false, code: 'ELEMENT_NOT_FOUND', selector: '#price' }
{ ok: false, code: 'TRIGGER_PAGE_BLOCKED', reason: 'captcha', url: 'https://example.com/challenge' }
```

### Anti-Patterns to Avoid

- **Active-tab fallback:** never call `chrome.tabs.query({ active:true })` in refresh-poll tick handling because WATCH-04 requires the trigger's persisted tab, not the user's current tab. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md; CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs]
- **Generic retry helper:** do not use `sendMessageWithRetry()` because its BF-cache recovery path can activate the tab. [VERIFIED: extension/background.js:4052-4090]
- **Silent empty read:** do not interpret `readValue(null) -> { text:'' }` as a legitimate value for refresh-poll. [VERIFIED: extension/content/trigger-observe.js:21-23]
- **Direct `status:'fired'` write:** refresh-poll glue must not write terminal fire state; lifecycle owns that transition. [VERIFIED: extension/utils/trigger-lifecycle.js:353-373; VERIFIED: tests/trigger-lifecycle.test.js baseline run 105/105 PASS]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fire-condition comparison | New refresh-poll evaluator | `FsbTriggerManager.evaluate()` via `FsbTriggerLifecycle.handleTriggerAlarm()` | Existing evaluator is pure and already handles `fired`, `no_fire`, `parse_error`, and `pattern_error`. [VERIFIED: extension/utils/trigger-manager.js:11-20; VERIFIED: extension/utils/trigger-lifecycle.js:342-373] |
| Storage lifecycle | New in-memory trigger registry | `FsbTriggerStore` snapshot envelope | Existing store is session-backed and already used by lifecycle reconcile. [VERIFIED: extension/utils/trigger-store.js:22-44; VERIFIED: extension/utils/trigger-lifecycle.js:438-510] |
| Tab selection | Active-tab query or custom resolver | Persisted `target_tab_id` + `fsbAgentRegistryInstance` checks | Existing agent registry exposes `hasAgent`, `getOwner`, and `isOwnedBy`. [VERIFIED: extension/utils/agent-registry.js:573-587; VERIFIED: extension/utils/agent-registry.js:1011-1033] |
| Background messaging retry | `sendMessageWithRetry()` | A narrow `ensureContentScriptInjected(tabId)` + `chrome.tabs.sendMessage(tabId, payload, { frameId:0 })` helper | Generic recovery can focus the tab; `tabs.sendMessage` supports explicit `frameId`. [VERIFIED: extension/background.js:3998-4112; CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs] |
| CAPTCHA detection primitives | Brand-new solver or auto-solve flow | Lightweight blocker classifier using restricted URL, login URL, and existing CAPTCHA selectors | Existing code already detects reCAPTCHA, hCaptcha, and Turnstile selectors for solve flows; Phase 17 only needs classify-and-do-not-fire. [VERIFIED: extension/content/actions.js:3441-3508; VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md] |

**Key insight:** custom solutions are worse here because the expensive correctness properties already exist in separate seams: storage survives SW eviction, evaluation is pure, ownership is registry-backed, and content reads have a shared selector path. [VERIFIED: extension/utils/trigger-store.js; VERIFIED: extension/utils/trigger-manager.js; VERIFIED: extension/utils/agent-registry.js; VERIFIED: extension/content/messaging.js]

## Common Pitfalls

### Pitfall 1: Alarm Floor Drift
**What goes wrong:** A caller requests a sub-30s refresh interval and expects fast polling. [CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms]  
**Why it happens:** Chrome production alarms do not honor `delayInMinutes` or `periodInMinutes` below `0.5`. [CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms]  
**How to avoid:** reject sub-floor requests with guidance to use `live-observe`; do not silently clamp. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md]  
**Warning signs:** tests show accepted `poll_interval_ms < 30000` or generated alarms with `periodInMinutes < 0.5`. [VERIFIED: extension/utils/trigger-lifecycle.js:71-79]

### Pitfall 2: Focus Theft
**What goes wrong:** A background watch brings a tab to the foreground or reloads the active user tab. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md]  
**Why it happens:** code reuses active-tab resolver paths or `sendMessageWithRetry()` BF-cache recovery. [VERIFIED: extension/background.js:3998-4112]  
**How to avoid:** source-audit refresh-poll helpers for no `tabs.query({active:true})`, no `tabs.update(...active:true)`, and no `sendMessageWithRetry`. [VERIFIED: tests/foreground-audit.test.js:103-164; VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md]  
**Warning signs:** mock Chrome logs include `tabs.update` calls or no explicit `tabId` passed to `tabs.reload`. [CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs]

### Pitfall 3: Missing Element Becomes Empty Text
**What goes wrong:** a missing watched element is evaluated as an empty string, causing silent non-fire or a wrong fire. [VERIFIED: extension/content/trigger-observe.js:21-23; VERIFIED: .planning/research/PITFALLS.md:397-408]  
**Why it happens:** existing `readValue(null)` returns `{ text:'' }` for live-observe compatibility. [VERIFIED: extension/content/trigger-observe.js:21-23]  
**How to avoid:** make `triggerRead` return explicit `ELEMENT_NOT_FOUND` metadata, and have SW persist `needs_attention` without calling `evaluate()`. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md]  
**Warning signs:** refresh-poll tests pass a null element and still see `FsbTriggerLifecycle.handleTriggerAlarm()` called. [VERIFIED: extension/background.js:3530-3537]

### Pitfall 4: Challenge/Login Content False Fire
**What goes wrong:** a CAPTCHA or login redirect page contains text that satisfies the trigger condition. [VERIFIED: .planning/research/PITFALLS.md:397-408]  
**Why it happens:** reload changes the page context but the code evaluates whatever content is present. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md]  
**How to avoid:** classify restricted URLs, common auth redirect URLs, password/login pages, and CAPTCHA selectors before staging `reported_value`. [VERIFIED: extension/background.js:2974-3020; VERIFIED: extension/background.js:10741-10790; VERIFIED: extension/content/actions.js:3441-3508]  
**Warning signs:** blocked-page tests call the lifecycle seam or set `reported_value` to challenge page text. [VERIFIED: extension/background.js:3520-3537]

### Pitfall 5: Alarm Namespace Collision
**What goes wrong:** refresh-poll overwrites TTL/reap scheduling or live-observe watchdog behavior. [VERIFIED: extension/utils/trigger-lifecycle.js:60-79; VERIFIED: extension/background.js:3431-3451]  
**Why it happens:** `fsbTrigger:<id>` is already the trigger alarm namespace and `deadline_at` is already the TTL boundary. [VERIFIED: extension/utils/trigger-lifecycle.js:180-214; VERIFIED: extension/utils/trigger-lifecycle.js:302-310]  
**How to avoid:** persist `poll_interval_ms` separately, keep `deadline_at` absolute, and have each tick schedule the next floor-safe jittered wake before returning if the trigger remains armed. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md]  
**Warning signs:** restore logic re-arms refresh-poll snapshots only at the 6h deadline instead of next poll time. [VERIFIED: extension/utils/trigger-lifecycle.js:487-495]

## Code Examples

### Background-Safe Read Helper

```javascript
// Source: extension/background.js:3226-3396 and Chrome tabs.sendMessage docs
async function fsbTriggerSendReadMessage(tabId, snap) {
  await ensureContentScriptInjected(tabId);
  return chrome.tabs.sendMessage(tabId, {
    action: 'triggerRead',
    selector: snap.selector,
    extract: fsbTriggerExtractKind(snap),
    attrName: fsbTriggerAttrName(snap)
  }, { frameId: 0 });
}
```

### Attention State Snapshot Patch

```javascript
// Source: Phase 17 D-11/D-12 and trigger-store flat snapshot schema
async function fsbTriggerMarkAttention(triggerId, snap, reason, extra) {
  snap.status = reason === 'blocked' ? 'blocked' : 'needs_attention';
  snap.attention_reason = reason;
  snap.attention_at = Date.now();
  snap.last_attention = Object.assign({ reason }, extra || {});
  await FsbTriggerStore.writeSnapshot(triggerId, snap);
  return { ok: true, action: snap.status, reason };
}
```

### Post-Read Evaluation Delegation

```javascript
// Source: extension/background.js:3502-3549
snap.reported_value = value.text.slice(0, FSB_TRIGGER_REPORTED_TEXT_MAX);
snap.reported_attributes = fsbTriggerCopyReportedAttributes(value.attributes) || undefined;
snap.last_reported_at = Date.now();
await FsbTriggerStore.writeSnapshot(triggerId, snap);

const result = await FsbTriggerLifecycle.handleTriggerAlarm({
  name: FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX + triggerId
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Extension SW standing timers | `chrome.alarms` plus persisted state | Chrome MV3 lifecycle guidance and Chrome 120 30s alarm floor | The watch loop must survive SW shutdown by persisting snapshots and relying on alarm events. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle; CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms] |
| Active-tab default browsing tools | Agent-scoped tab resolver and background-tab defaults | v0.9.60 local architecture | Refresh-poll must use persisted `target_tab_id` and ownership checks, not active-tab resolution. [VERIFIED: extension/utils/agent-tab-resolver.js:42-87; VERIFIED: tests/agent-tab-resolver.test.js baseline run 30/30 PASS] |
| Generic message retry for all content work | Narrow no-focus helper for refresh-poll | Phase 17 decision | Refresh-poll must bypass the generic recovery branch that can activate tabs. [VERIFIED: extension/background.js:4052-4090; VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md] |
| Frozen selector read after reload | Re-resolve through `triggerRead` / selector helpers | Phase 16 shared read layer | Refresh-poll must distinguish missing from valid empty values. [VERIFIED: extension/content/messaging.js:1280-1294; VERIFIED: extension/content/selectors.js:497-595] |

**Deprecated/outdated:**
- `setInterval` as a standing MV3 watch loop is not acceptable for this phase. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle; VERIFIED: .planning/research/PITFALLS.md:359-368]
- Omitting `tabId` from `chrome.tabs.reload()` is not acceptable for this phase because Chrome defaults to the selected tab of the current window. [CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs]
- Using `persistAcrossSessions` as the main compatibility strategy is not acceptable because Chrome docs recommend recreating important alarms at SW startup for unsupported browsers/older Chrome. [CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Research should be revalidated after 2026-07-16 if implementation has not started. [ASSUMED] | Metadata | Chrome docs or local phase decisions may change after the research window. |

## Open Questions (RESOLVED)

1. **Exact attention field names (RESOLVED)**
   - What we know: downstream tools must distinguish `element_not_found`, `blocked`, `parse_error`, and ordinary `no_fire`. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md]
   - RESOLVED: use `status:'needs_attention'` for a missing watched element, `status:'blocked'` for challenge/auth/restricted pages, and always store `attention_reason`. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md]

2. **Helper extraction boundary (RESOLVED)**
   - What we know: helper placement is discretionary if importScripts load order stays coherent. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md]
   - RESOLVED: keep the first refresh-poll implementation in `extension/background.js` beside Phase-16 helpers; defer extraction unless implementation pressure later proves a helper module is necessary. [VERIFIED: extension/background.js:3398-3631]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Plain Node tests | yes | v24.14.1 | none needed. [VERIFIED: local environment probe] |
| npm / npx | Package scripts and optional docs tooling | yes | 11.11.0 | none needed. [VERIFIED: local environment probe] |
| Google Chrome app | Live-browser UAT / extension runtime | yes | app bundle present, version not probed | Phase 17 deterministic logic can be covered by Node mocks; live UAT may remain Phase 20. [VERIFIED: local environment probe; VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md] |
| Chrome extension APIs | Refresh-poll runtime | browser-only | Chrome APIs documented current as of 2026-06-08 alarms / 2026-03-03 tabs | Use mocked `chrome` objects in Node tests. [CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms; CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs; VERIFIED: tests/trigger-lifecycle.test.js] |

**Missing dependencies with no fallback:** None found for planning or deterministic implementation tests. [VERIFIED: local environment probe]

**Missing dependencies with fallback:** Live Chrome UAT automation is not required for Phase 17 completion because D-15 defers live-browser no-focus UAT to Phase 20-style tracking while requiring deterministic Node coverage now. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Plain Node.js scripts with `assert` / custom `check` helpers. [VERIFIED: tests/trigger-lifecycle.test.js; VERIFIED: tests/trigger-observe.test.js] |
| Config file | none; root `package.json` chains individual `node tests/*.test.js` commands. [VERIFIED: package.json] |
| Quick run command | `node tests/trigger-refresh-poll.test.js && node tests/trigger-lifecycle.test.js && node tests/trigger-observe.test.js` [VERIFIED: existing test patterns; VERIFIED: package.json] |
| Full suite command | `npm test` [VERIFIED: package.json] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| WATCH-02 | Alarm tick reloads own tab, reads via `triggerRead`, stages report, and delegates to lifecycle; value unchanged/change/not-found are distinct. | unit/integration with Chrome mocks | `node tests/trigger-refresh-poll.test.js` | No, Wave 0 gap. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: tests pattern inspection] |
| WATCH-03 | Default interval ~60s; sub-30s interval rejects; jitter is floor-safe and deadline-safe. | unit | `node tests/trigger-refresh-poll.test.js` | No, Wave 0 gap. [VERIFIED: .planning/REQUIREMENTS.md; CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms] |
| WATCH-04 | Cross-agent tab returns `TAB_NOT_OWNED` before reload; helper never queries active tab or activates a tab. | unit + source invariant | `node tests/trigger-refresh-poll.test.js && node tests/foreground-audit.test.js` | Partially; new refresh test needed, foreground audit exists. [VERIFIED: tests/foreground-audit.test.js; VERIFIED: .planning/REQUIREMENTS.md] |

### Sampling Rate

- **Per task commit:** `node tests/trigger-refresh-poll.test.js` plus the nearest touched existing test. [VERIFIED: existing GSD phase test pattern in package.json]
- **Per wave merge:** `node tests/trigger-refresh-poll.test.js && node tests/trigger-lifecycle.test.js && node tests/trigger-observe.test.js && node tests/agent-tab-resolver.test.js && node tests/open-tab-background-default.test.js`. [VERIFIED: baseline runs on 2026-06-16]
- **Phase gate:** `npm test` before `/gsd-verify-work`, with live no-focus UAT documented as Phase 20 deferral if not human-run. [VERIFIED: package.json; VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md]

### Wave 0 Gaps

- [ ] `tests/trigger-refresh-poll.test.js` -- covers WATCH-02, WATCH-03, WATCH-04. [VERIFIED: tests directory listing]
- [ ] `package.json` test chain entry -- add the new test near existing trigger tests. [VERIFIED: package.json]
- [ ] `triggerRead` missing-element test -- extend `tests/trigger-observe.test.js` or add content-router coverage in the new refresh-poll test. [VERIFIED: extension/content/messaging.js:1280-1294; VERIFIED: extension/content/trigger-observe.js:21-23]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | This phase does not authenticate users; it classifies auth walls as blocker states. [VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md] |
| V3 Session Management | no | This phase does not create web sessions; it preserves browser sessions by avoiding cookie/session mutation. [VERIFIED: .planning/REQUIREMENTS.md] |
| V4 Access Control | yes | Enforce agent tab ownership via `fsbAgentRegistryInstance.hasAgent/getOwner/isOwnedBy` before reload. [VERIFIED: extension/utils/agent-registry.js:573-587; VERIFIED: extension/ws/mcp-tool-dispatcher.js:189-204] |
| V5 Input Validation | yes | Validate interval floor, finite tab IDs, string trigger IDs, selector presence, and content response shape before staging values. [VERIFIED: extension/utils/trigger-lifecycle.js:195-214; VERIFIED: extension/background.js:3465-3479] |
| V6 Cryptography | no | No cryptographic primitive is introduced by Phase 17. [VERIFIED: .planning/REQUIREMENTS.md] |

### Known Threat Patterns for MV3 Refresh-Poll

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-agent tab reload | Tampering / Denial of Service | Reject with `TAB_NOT_OWNED` before `chrome.tabs.reload`. [VERIFIED: extension/ws/mcp-tool-dispatcher.js:189-204; VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md] |
| Challenge/login page false fire | Spoofing / Tampering | Persist `blocked` / `needs_attention` and do not stage challenge content for evaluation. [VERIFIED: .planning/research/PITFALLS.md:397-408; VERIFIED: extension/content/actions.js:3441-3508] |
| Sub-floor reload hammering | Denial of Service | Reject intervals below 30s and add light jitter. [CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms; VERIFIED: .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md] |
| Stale selector / wrong element | Tampering | Re-resolve through existing selector path and treat missing as attention, not empty value. [VERIFIED: extension/content/selectors.js:497-595; VERIFIED: extension/content/trigger-observe.js:21-23] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md` -- locked Phase 17 decisions, scope, and deferrals. [VERIFIED: local file read]
- `.planning/REQUIREMENTS.md` -- WATCH-02, WATCH-03, WATCH-04 requirement text. [VERIFIED: local file read]
- `.planning/STATE.md` and `.planning/ROADMAP.md` -- milestone invariants, Phase 14-16 shipped state, Phase 17 success criteria. [VERIFIED: local file read]
- `extension/utils/trigger-lifecycle.js` -- alarm prefix, 30s floor constant, storage-first evaluation seam, restore/reap behavior. [VERIFIED: local source read]
- `extension/utils/trigger-store.js` -- persisted trigger snapshot envelope. [VERIFIED: local source read]
- `extension/utils/trigger-manager.js` -- pure `evaluate()` and cap-gated `armTrigger()`. [VERIFIED: local source read]
- `extension/background.js` -- content injection, Phase-16 trigger helpers, unsafe generic retry helper, alarm routing. [VERIFIED: local source read]
- `extension/content/messaging.js`, `extension/content/trigger-observe.js`, `extension/content/selectors.js` -- content read/pulse/selector behavior. [VERIFIED: local source read]
- `extension/utils/agent-registry.js`, `extension/utils/agent-tab-resolver.js`, `extension/ws/mcp-tool-dispatcher.js`, `extension/ai/tool-executor.js` -- ownership and background reload precedents. [VERIFIED: local source read]
- Chrome alarms docs -- 30s floor, persistence guidance, alarm creation semantics. [CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms]
- Chrome tabs docs -- `reload(tabId)`, `sendMessage(...frameId)`, `onUpdated` completion signals, update semantics. [CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs]
- Chrome extension service-worker lifecycle docs -- 30s inactivity, 5-minute request cap, storage-over-globals guidance, Chrome 120 alarm floor. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle]

### Secondary (MEDIUM confidence)

- `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/SUMMARY.md` -- prior milestone research on refresh-poll pitfalls, watch architecture, and anti-patterns. [VERIFIED: local file read]

### Tertiary (LOW confidence)

- None used. [VERIFIED: source list]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new package choices; Chrome APIs and local modules were verified against official docs and source. [CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms; CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs; VERIFIED: local source reads]
- Architecture: HIGH -- Phase 14-16 source already contains the storage/evaluation/read/pulse seams, and baseline tests passed. [VERIFIED: tests/trigger-lifecycle.test.js baseline run 105/105 PASS; VERIFIED: tests/trigger-observe.test.js baseline run 10/10 PASS]
- Pitfalls: HIGH -- focus theft, missing element, alarm floor, and blocked-page risks are all tied to concrete source behavior or official docs. [VERIFIED: extension/background.js:3998-4112; VERIFIED: extension/content/trigger-observe.js:21-23; CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms]

**Baseline checks run:** `node tests/trigger-lifecycle.test.js` passed 105/105, `node tests/trigger-observe.test.js` passed 10/10, `node tests/agent-tab-resolver.test.js` passed 30/30, and `node tests/open-tab-background-default.test.js` passed 10/10. [VERIFIED: local command output 2026-06-16]

**Research date:** 2026-06-16  
**Valid until:** 2026-07-16, then re-check Chrome alarms/tabs docs before planning implementation. [ASSUMED]
