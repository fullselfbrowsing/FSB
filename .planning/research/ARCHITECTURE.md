# Architecture Research: v0.11.0 Trigger Tool (Reactive DOM Monitoring)

**Domain:** MV3 Chrome extension reactive DOM-watcher tool family (`trigger`) integrating into FSB's existing service-worker / content-script / offscreen / MCP-bridge architecture
**Milestone:** v0.11.0 (subsequent milestone; existing FSB architecture preserved, integrate WITH it)
**Researched:** 2026-06-15
**Confidence:** HIGH (grounded in direct reads of the FSB codebase; every named file/line verified against the working tree on branch `automation-worktree`)

> Scope note: This is an *integration* design, not an ecosystem survey. The question is "how does a standing `trigger` watcher bolt onto FSB's existing MV3 plumbing without violating INV-01/02/04?" Findings map every new piece to an existing precedent already shipping in the tree.

---

## Standard Architecture

### The load-bearing precedents (what we mirror, not invent)

Four shipping subsystems already solve every hard sub-problem of `trigger`. The design is "copy the shape, change the constants":

| Sub-problem | Existing precedent (verified) | What it proves |
|-------------|-------------------------------|----------------|
| Standing entity that survives SW eviction | `extension/utils/mcp-visual-session-lifecycle.js` — per-tab `chrome.alarms` named `mcpVisualDeath:<tabId>` + `chrome.storage.session` entry `mcpVisualSession:<tabId>` + SW-startup restore + `chrome.tabs.onRemoved` cleanup | A per-entity alarm+storage+restore lifecycle is already a proven FSB pattern |
| Persisted lifecycle snapshot map | `extension/utils/mcp-task-store.js` — versioned envelope `{v:1, records:{[id]:snapshot}}` under `chrome.storage.session` key `fsbRunTaskRegistry`; empty-map-removes-key discipline | The exact storage-helper module shape for a `trigger-store.js` |
| Blocking call that holds open with heartbeats + safety net | `extension/ws/mcp-bridge-client.js:_handleStartAutomation` (lines 979-1158) — 30s `setInterval` heartbeat, `settle()` single-resolve guard, 600s safety net, `partial_state` snapshot read | The exact blocking-return machinery for blocking `trigger()` |
| Live MutationObserver → SW reporting | `extension/content/dom-stream.js` — `startMutationStream()`/`stopMutationStream()`, `requestAnimationFrame` batch/debounce, `chrome.runtime.sendMessage`, message-driven `domStreamStart`/`domStreamStop` router | The exact content-script live-observe path |

Nothing about `trigger` requires a new architectural primitive. It requires assembling these four into a new tool family.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  MCP CLIENT (Claude Code / Codex / OpenClaw)                                  │
│      trigger() · stop_trigger() · get_trigger_status() · list_triggers()      │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                     │ JSON-RPC (stdio) + notifications/progress
┌────────────────────────────────────▼──────────────────────────────────────────┐
│  MCP SERVER (mcp/src)                                                          │
│   NEW  tools/trigger.ts  ── server.tool() x4 ── routes via bridge.sendAndWait  │
│   MOD  runtime.ts (add registerTriggerTools)  · queue.ts (read-only set +2)    │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                     │ WebSocket bridge  (mcp:trigger-* messages)
┌────────────────────────────────────▼──────────────────────────────────────────┐
│  SERVICE WORKER (extension/background.js + ws/ + utils/)                        │
│                                                                                │
│   MOD ai/tool-definitions.js  ── TOOL_REGISTRY += 4 tool defs (additive only)  │
│   MOD ws/mcp-tool-dispatcher.js ── route tables += trigger aliases+messages    │
│   NEW utils/trigger-store.js     ── chrome.storage.session envelope (snapshot) │
│   NEW utils/trigger-lifecycle.js ── chrome.alarms `fsbTrigger:<id>` + restore  │
│   NEW utils/trigger-manager.js   ── arm/evaluate/fire/stop + cap + tab binding │
│   MOD ws/mcp-bridge-client.js    ── blocking trigger() heartbeat/settle host   │
│   MOD background.js              ── onAlarm dispatch branch + SW-startup hook   │
│                                     + chrome.tabs.onRemoved trigger cleanup    │
│        ┌────────────── refresh-poll ──────────────┐  ┌──── live-observe ────┐  │
│        │ alarm tick → reload OWNED tab → re-read  │  │ tell content to watch │  │
│        │ element via existing read path → compare │  │ → receive change msgs │  │
│        └───────────────────────────────────────────┘  └──────────────────────┘ │
└──────────────┬───────────────────────────────────────────────┬────────────────┘
               │ chrome.tabs.sendMessage (read / observe / pulse) │
┌───────────────▼───────────────────────────────────────────────▼────────────────┐
│  CONTENT SCRIPT (isolated world; extension/content/*)                          │
│   MOD content/messaging.js     ── router: triggerObserveStart/Stop, triggerRead │
│   NEW content/trigger-observe.js ── MutationObserver on ONE element (debounced) │
│   MOD content/visual-feedback.js ── HighlightManager analyzing-PULSE variant +  │
│                                      ViewportGlow "watching a trigger" label    │
└────────────────────────────────────────────────────────────────────────────────┘

  OFFSCREEN (extension/offscreen/lattice-host.js) — NOT on the trigger path.
  Lattice survivability adapter is consulted as a pattern reference only (see §
  "State management"). Trigger snapshots use chrome.storage.session directly,
  exactly like mcp-task-store.js does today.
```

### Component Responsibilities

| Component | Responsibility | Existing precedent it mirrors |
|-----------|----------------|-------------------------------|
| `utils/trigger-store.js` (NEW) | Versioned `chrome.storage.session` envelope `{v:1, records:{[trigger_id]:snapshot}}`; CRUD + `listActive()` | `utils/mcp-task-store.js` (near byte-for-byte clone, new constants) |
| `utils/trigger-lifecycle.js` (NEW) | Per-trigger `chrome.alarms` (`fsbTrigger:<id>`), arm/clear/re-arm, SW-startup restore, tab-close cleanup | `utils/mcp-visual-session-lifecycle.js` |
| `utils/trigger-manager.js` (NEW) | Domain logic: arm a trigger, evaluate fire conditions (changed/threshold/equals/contains), smart value extraction, cap enforcement, tab-binding decision, emit fire | new — cap logic mirrors `utils/agent-registry.js` (1-64, default 8) |
| `content/trigger-observe.js` (NEW) | Live-observe: MutationObserver scoped to ONE element, debounced, reports value deltas to SW | `content/dom-stream.js` (start/stop + rAF batch + `chrome.runtime.sendMessage`) |
| `ws/mcp-bridge-client.js` (MOD) | Host the *blocking* `trigger()` promise: heartbeats, `settle()`, fire/timeout resolve | its own `_handleStartAutomation` (lines 979-1158) |
| `ws/mcp-tool-dispatcher.js` (MOD) | Route `trigger`/`stop_trigger`/`get_trigger_status`/`list_triggers` + `mcp:trigger-*` messages | existing `run_task`/`mcp:start-automation` route-table rows (lines 62-91) |
| `ai/tool-definitions.js` (MOD) | Add 4 tool defs to `TOOL_REGISTRY` (additive; existing 52 untouched → INV-01/02) | the registry array itself (line 94) |
| `mcp/src/tools/trigger.ts` (NEW) | 4 `server.tool()` registrations; `trigger` is blocking-capable (progress notifications), companions read-only | `mcp/src/tools/autopilot.ts` (run_task family) + `observability.ts` (read-only family) |
| `content/visual-feedback.js` (MOD) | "Analyzing pulse" glow variant on the watched element; `ViewportGlow` "watching a trigger" label | `HighlightManager.show()` + `ViewportGlow` `state-thinking` |

---

## Recommended Project Structure

NEW files (5) + MODIFIED files (8). No existing schema changes.

```
extension/
├── utils/
│   ├── trigger-store.js          # NEW  — chrome.storage.session snapshot envelope
│   │                             #        (clone of mcp-task-store.js; key fsbTriggerRegistry)
│   ├── trigger-lifecycle.js      # NEW  — chrome.alarms fsbTrigger:<id> + restore + tab cleanup
│   │                             #        (clone of mcp-visual-session-lifecycle.js shape)
│   ├── trigger-manager.js        # NEW  — arm/evaluate/fire/stop, fire-condition eval,
│   │                             #        value extraction, cap enforcement, tab binding
│   ├── mcp-task-store.js         #  (reference template — unchanged)
│   ├── mcp-visual-session-lifecycle.js  # (reference template — unchanged)
│   └── agent-registry.js         #  (cap precedent — unchanged; trigger cap mirrors it)
├── content/
│   ├── trigger-observe.js        # NEW  — single-element MutationObserver (live-observe)
│   ├── messaging.js              # MOD  — router cases: triggerObserveStart/Stop/Read + pulse
│   └── visual-feedback.js        # MOD  — analyzing-pulse glow variant + "watching" label
├── ws/
│   ├── mcp-tool-dispatcher.js    # MOD  — route tables (+4 tool aliases, +N message routes)
│   └── mcp-bridge-client.js      # MOD  — blocking trigger() heartbeat/settle handler
├── ai/
│   └── tool-definitions.js       # MOD  — TOOL_REGISTRY += 4 defs (additive) + .cjs mirror
├── background.js                 # MOD  — onAlarm branch, SW-startup restore, tab cleanup hook
└── manifest.json                 #  (NO CHANGE — alarms/storage/tabs/scripting/webNavigation granted)

mcp/src/
├── tools/
│   └── trigger.ts                # NEW  — server.tool() x4 (1 blocking + 3 read-only/mutation)
├── runtime.ts                    # MOD  — import + call registerTriggerTools(...)
└── queue.ts                      # MOD  — readOnlyTools += get_trigger_status, list_triggers
```

### Structure Rationale

- **`utils/` gets the three new SW-side modules** because that is where every other SW-survivable lifecycle helper already lives (`mcp-task-store.js`, `mcp-visual-session-lifecycle.js`, `agent-registry.js`, `agent-tab-resolver.js`). The SW glue (`background.js`) imports them via `importScripts` and drives them — exactly the boot-order note documented at the top of `mcp-visual-session-lifecycle.js`.
- **`content/trigger-observe.js` is a new module, not bolted into `dom-stream.js`**, because `dom-stream.js` is a whole-page observer feeding the remote-control dashboard; trigger live-observe is single-element and notify-only. Sharing would risk the streaming watchdog (`fsb-domstream-watchdog`) and the `ext:dom-mutations` wire shape, both locked. New module, same proven internals.
- **`mcp/src/tools/trigger.ts` is one new file** registered from `runtime.ts` (the single registration call site at lines 35-41). This is precisely how every existing family was added; no `index.ts` change needed beyond what `runtime.ts` already centralizes.

---

## Architectural Patterns

### Pattern 1: Trigger Registry as a parallel-but-analogous lifecycle (NOT reuse of run_task machinery)

**What:** A dedicated trigger registry (`trigger-store.js` + `trigger-lifecycle.js` + `trigger-manager.js`) that *mirrors* the run_task lifecycle shape but does not share its code paths or storage key.

**When to use:** Always, for v0.11.0.

**Recommendation: BUILD PARALLEL-BUT-ANALOGOUS. Do NOT graft onto `run_task`/`activeSessions`.** Rationale:

1. **Semantic mismatch.** `run_task` is a finite agent loop driven by `agent-loop.js`'s `setTimeout`-chained iterator (INV-04, byte-frozen at lines 2003/2702/2771). A trigger is a *standing* watcher with no AI loop, no iteration count, no completion scoring. Forcing it through `activeSessions` would pollute the session schema and risk the frozen iterator.
2. **Lifetime mismatch.** `run_task` has a 600s safety net; a price watch runs for hours. The trigger's persistence cadence is alarm-tick-driven (refresh-poll) or event-driven (live-observe), not a 30s heartbeat loop.
3. **INV-04 protection.** Keeping triggers out of `agent-loop.js` entirely means zero risk to the load-bearing iterator. The blocking-*return* mechanics (heartbeat/settle) are reused from `mcp-bridge-client.js`, but the *watcher* itself never touches the agent loop.
4. **Precedent says parallel.** v0.9.36 visual sessions and v0.9.60 run_task tracking are *separate* registries (`fsbMcpVisualSessions`, `fsbRunTaskRegistry`) by deliberate decision (PROJECT.md Key Decisions: "Keep client-owned visual sessions separate from autopilot `activeSessions`"). The trigger registry is the third sibling: `fsbTriggerRegistry`.

What IS reused: the *return* machinery (heartbeat/settle/safety-net from `mcp-bridge-client.js`) and the *storage/alarm/restore* shapes (from `mcp-task-store.js` + `mcp-visual-session-lifecycle.js`). What is NOT reused: `activeSessions`, the agent loop, the run_task storage key.

**Example (storage envelope, mirroring `mcp-task-store.js`):**
```javascript
// utils/trigger-store.js — chrome.storage.session key 'fsbTriggerRegistry'
// snapshot shape per trigger_id:
{
  trigger_id, status,            // 'armed' | 'fired' | 'stopped' | 'error' | 'partial'
  watch: 'refresh-poll' | 'live-observe',
  condition: { kind, op, value, extract },   // changed|threshold|equals|contains
  selector, target_tab_id, agent_id,
  initial_value, last_value, last_evaluated_at,
  poll_interval_ms, armed_at, fired_at,
  fire_envelope                  // populated on fire (the "what happened" payload)
}
```

### Pattern 2: SW-eviction survival via chrome.alarms tick → wake → re-evaluate (generalizes run_task partial_state)

**What:** Each trigger owns a `chrome.alarms` alarm. For refresh-poll, the alarm IS the poll clock (`periodInMinutes`). For live-observe, the alarm is a low-frequency *watchdog* (re-arm/re-attach the observer after SW wake, since the content observer survives but the SW that receives its messages may have evicted).

**When to use:** Always — this is the crux of the milestone (PROJECT.md: "MV3 survivability is the crux").

**Mapping to the run_task partial_state pattern (explicit):**

| run_task (Phase 239, shipped) | trigger (v0.11.0, proposed) |
|-------------------------------|------------------------------|
| 30s `setInterval` heartbeat writes `in_progress` snapshot to `fsbRunTaskRegistry` | Alarm tick (refresh-poll) OR observe-event (live-observe) writes `armed` snapshot to `fsbTriggerRegistry` after each evaluation |
| SW eviction → WebSocket drops → bridge `sendAndWait` rejects `Bridge disconnected` → server reads persisted `partial_state` | SW eviction → alarm persists in `chrome.alarms` (NOT SW memory) → next tick wakes SW → `background.js` onAlarm branch re-hydrates trigger from `trigger-store.js` → re-evaluates |
| `chrome.storage.session` snapshot is source of truth across eviction | identical |
| 600s safety net resolves blocking call | blocking `trigger()` has a configurable timeout with a safety ceiling (PROJECT.md: "recommend detached beyond a few minutes"); detached triggers simply persist and keep ticking |
| `_reconcileInFlightTasksOnConnect` on bridge reconnect | SW-startup `restoreTriggersFromStorage()` (mirrors `restoreVisualSessionLifecyclesFromStorage`) re-arms every `status:'armed'` trigger's alarm on cold boot |

The key insight: **`chrome.alarms` is the eviction-survival mechanism, not the SW.** The visual-session lifecycle already proves this — its `mcpVisualDeath:<tabId>` alarm "survives MV3 SW eviction because chrome.alarms persists across SW lifetime" (background.js:13288-13289). A trigger alarm with `periodInMinutes` keeps firing and waking the SW even after eviction; each wake re-reads the snapshot and re-evaluates. No offscreen document or Lattice adapter is needed for survival — `chrome.storage.session` + `chrome.alarms` is sufficient and is the lower-risk path.

> Note on `chrome.storage.session` vs `local`: `session` is wiped on browser restart (not on SW eviction). `mcp-task-store.js` and the visual lifecycle both use `session` deliberately — a trigger should not silently resurrect across a full browser restart with a stale tab id. RECOMMEND `chrome.storage.session` for the live snapshot (consistent with both precedents). The trigger *cap* setting mirrors `agent-registry.js` which uses `chrome.storage.local` (a user preference that SHOULD persist) — keep that split.

**Example (onAlarm dispatch branch, mirroring background.js:13284-13301):**
```javascript
// background.js — inside the single chrome.alarms.onAlarm listener, ADD a branch
// BEFORE the existing mcpVisualDeath / telemetry / reconnect branches:
if (typeof TriggerLifecycleUtils !== 'undefined'
    && alarm?.name?.startsWith(TriggerLifecycleUtils.TRIGGER_ALARM_PREFIX)) {   // 'fsbTrigger:'
  try { await TriggerLifecycleUtils.handleTriggerAlarm(alarm); }                // re-hydrate + re-evaluate
  catch (err) { console.warn('[FSB TRG] trigger alarm failed (non-blocking):', err?.message); }
  return;
}
```

### Pattern 3: Two watch paths, explicit layer placement

**What:** `refresh-poll` and `live-observe` are different data flows that run in different layers.

**When to use:** Per-trigger selectable (PROJECT.md target feature).

| Step | refresh-poll | live-observe |
|------|--------------|--------------|
| Clock | SW `chrome.alarms` `fsbTrigger:<id>` (`periodInMinutes`, default ~60s, hard floor ~30s — Chrome MV3 prod alarm minimum is 30s, same constraint the visual lifecycle documents) | Content MutationObserver fires on DOM change; SW alarm is a low-freq watchdog only |
| Page reload | SW reloads the OWNED tab via the existing background reload path (same path the `refresh` tool uses), background-tab, no focus steal | none — element watched in place |
| Element read | SW → `chrome.tabs.sendMessage(tabId, {action:'triggerRead', selector, extract})` → content reads via existing selector/extraction utilities | content reads on each mutation; debounced |
| Value extraction | content (reuse `selectors.js` / `dom-analysis.js` value reads) | content (same) |
| Comparison / fire decision | **SW** (`trigger-manager.evaluate`) — keeps fire logic in one place, survivable | **SW** — content sends raw value deltas; SW evaluates (so eviction can't drop the fire decision) |
| Reporting | SW writes snapshot + (if blocking) resolves the held promise | identical |

**Critical placement decision: fire evaluation lives in the SW, not the content script.** Content scripts die on navigation and are not persisted; the SW (re-hydratable from `chrome.storage.session`) is the durable authority. Content's job is narrow: read the element value and report it. This mirrors how `dom-stream.js` content sends raw mutations and the SW/dashboard interprets them.

**Live-observe survival nuance:** the content MutationObserver survives SW eviction (it lives in the page), but its `chrome.runtime.sendMessage` calls will *wake* the SW. If the page is reloaded/navigated, the observer dies — so live-observe triggers MUST re-arm the observer on `chrome.webNavigation`/`chrome.tabs.onUpdated` for their owned tab (FSB already re-injects content scripts after navigation per the BF-cache resilience work in v0.9.11). The low-freq watchdog alarm is the backstop that detects "observer should be running but the SW has no record of a recent report" and re-issues `triggerObserveStart`.

### Pattern 4: Visual feedback — analyzing pulse + "watching a trigger" label

**What:** While a trigger is armed, the watched element shows a *gentle analyzing pulse* (a variant of the existing orange glow), and the viewport monitor labels itself "watching a trigger."

**When to use:** On arm; stop on fire/cancel; survive reload in refresh-poll mode.

**Wiring (grounded in `visual-feedback.js`):**
- The orange glow is `HighlightManager.show(element, {glowColor, duration})` (visual-feedback.js:33-72). The steady glow uses a static `box-shadow`. The analyzing pulse is a **new glow variant** — a CSS keyframe animation toggled by a flag (e.g. `HighlightManager.showPulse(element)` or a `{pulse:true}` option) so it visually differs from the action-targeting glow.
- The element pulse is triggered exactly like the existing `highlightElement` content-router case (messaging.js:1229-1243): SW sends `chrome.tabs.sendMessage(tabId, {action:'triggerPulseStart', selector})`; content resolves the element and applies the pulse. `triggerPulseStop` clears it.
- The "watching a trigger" label rides on the existing `overlayState` contract (`overlay-state.js` + `ViewportGlow`). `ViewportGlow` already has `state-thinking` (orange, "AI analyzing page") at visual-feedback.js:884-1108. ADD a `mode`/`phase`-style field (e.g. `overlayState.mode = 'trigger-watch'`) so the monitor renders "Watching a trigger" instead of a task phase. This is additive to the overlay state object — no existing field changes.
- **Lifecycle:** pulse starts when `trigger-manager.arm()` succeeds; stops on fire or `stop_trigger`. In **refresh-poll mode the pulse must survive reload** — so on each poll tick after the tab reloads and content re-injects, the SW re-issues `triggerPulseStart` (same way the dashboard re-issues `dash:dom-stream-start` after navigation, dom-stream.js:1073-1075). In live-observe mode the pulse persists with the page until navigation, then re-arms with the observer.

**Example (pulse glow variant, extending HighlightManager):**
```javascript
// content/visual-feedback.js — HighlightManager gets a pulse variant.
// Steady glow (existing): static box-shadow. Pulse (new): animated, distinct.
showPulse(element) {
  element.style.setProperty('animation', 'fsb-trigger-pulse 1.8s ease-in-out infinite', 'important');
  // @keyframes fsb-trigger-pulse cycles box-shadow opacity — gentle, not the
  // steady action glow. Injected into the same Shadow DOM style sheet so it
  // inherits the existing CSS isolation (Shadow DOM decision, PROJECT.md).
}
```

### Pattern 5: Concurrency cap mirroring the agent cap

**What:** A configurable cap on concurrent armed triggers (1-64, sensible default), enforced at arm time with a fail-loud typed error.

**When to use:** Always (PROJECT.md target feature: "mirrors the v0.9.60 agent/tab cap: 1-64, sensible default").

**Recommendation:** Mirror `agent-registry.js` cap machinery exactly (lines 52-76, 302-308): a `chrome.storage.local` key `fsbTriggerCap`, `FSB_TRIGGER_CAP_DEFAULT` (recommend 8 to match the agent cap), `MIN=1`, `MAX=64`, clamp helper, and a typed reject `{error:'TRIGGER_CAP_REACHED', code:'TRIGGER_CAP_REACHED', cap, active}` when arming the (N+1)th trigger. Grandfather active triggers when the cap is lowered (same as agents). Surface the control in `control_panel.html` next to the existing Concurrency Cap control.

**Tab ownership interaction (the subtle part):**

- **Each trigger binds to exactly one tab** (the tab it was armed against), resolved via the existing agent-scoped tab resolver (`utils/agent-tab-resolver.js`, `resolveAgentTabOrError`). A trigger does NOT *exclusively lock* the tab — locking is wrong because the user (or another agent) may keep using that tab.
- **Multiple triggers CAN share a tab.** Two live-observe triggers watching two elements on the same crypto dashboard is a legitimate case. They register independent MutationObservers, or (preferable for perf) the content module multiplexes one observer over multiple target elements.
- **refresh-poll + live-observe on the SAME tab is a conflict** and must be rejected or coordinated: a refresh-poll trigger *reloads* the tab, which would destroy a co-located live-observe trigger's observer. RECOMMEND: at arm time, `trigger-manager.js` checks the target tab's existing triggers; if a refresh-poll trigger would reload a tab that hosts a live-observe trigger (or vice versa), reject with a typed `TRIGGER_TAB_WATCH_CONFLICT` and steer the caller to a separate tab (FSB's forced-new-tab pooling from v0.9.60 already supports background tab creation). Two refresh-poll triggers on one tab must *coordinate their reload cadence* (one reload serves both reads) rather than reload twice.
- **Ownership is reused, not reinvented:** trigger arm/stop/status go through the same `dispatchMcpToolRoute` ownership gate as every other MCP tool (mcp-tool-dispatcher.js:389 inline gate). Cross-agent `stop_trigger` on a trigger you don't own rejects with `TAB_NOT_OWNED`, consistent with INV-01 error vocabulary.

### Pattern 6: Blocking vs detached return (reuse the run_task return machinery)

**What:** `trigger()` blocks by default (holds the MCP call open with `notifications/progress` heartbeats, resolves on fire or timeout); a `block:false` flag returns a `trigger_id` immediately for polling via `get_trigger_status`/`list_triggers`.

**Recommendation:** **Reuse the `_handleStartAutomation` return pattern** (mcp-bridge-client.js:1014-1158) for the blocking path — this is the one place run_task machinery IS reused, because the blocking-hold-with-heartbeats problem is identical. The blocking `trigger()` handler:
1. Arms the trigger (`trigger-manager.arm()` → writes `armed` snapshot, sets alarm or starts observer, starts pulse).
2. Returns a Promise with the same `settle()` single-resolve guard + 30s heartbeat `setInterval` (heartbeat payload = `{trigger_id, alive, last_value, evaluated_count, elapsed_ms}`) + a configurable timeout (NOT a hard 600s — triggers legitimately run longer, but blocking ones get a safety ceiling per PROJECT.md).
3. Resolves when `trigger-manager` emits a fire event (via a dedicated `globalThis.fsbTriggerLifecycleBus`, mirroring the `globalThis.fsbAutomationLifecycleBus` run_task uses) OR on timeout (resolving with the persisted `partial_state` / "still armed" snapshot, mirroring run_task's `partial_outcome:'timeout'`).
4. On SW eviction during a blocking call: bridge drops → server catches `Bridge disconnected` → reads persisted snapshot (mirror autopilot.ts:144-197 `sw_evicted` shape) → returns the armed/last-value state. The trigger keeps running (its alarm survives); the caller can re-poll with `get_trigger_status`.

The detached path is trivial: arm and return `{trigger_id, status:'armed'}` immediately; no held promise. `get_trigger_status(trigger_id)` and `list_triggers()` are read-only reads of `trigger-store.js` (mirror `get_task_status` / `list_sessions`). `stop_trigger` is a mutation (clears alarm/observer/pulse), so it goes through the queue like `stop_task`.

**MCP-side shape (mirroring autopilot.ts + observability.ts):**
```typescript
// mcp/src/tools/trigger.ts
server.tool('trigger', '<desc>', { selector: z.string(), condition: <z schema>, watch: <enum>,
            extract: z.enum(['text','number','attribute']).optional(),
            block: z.boolean().optional() /* default true */ },
  async (args, extra) => {
    if (!bridge.isConnected) return mapFSBError({success:false, error:'extension_not_connected'});
    return queue.enqueue('trigger', async () =>
      sendAgentScopedBridgeMessage(bridge, agentScope, 'mcp:arm-trigger', args,
        { timeout: <configurable safety ceiling>, onProgress /* reshape heartbeats, like run_task */ }));
  });
// get_trigger_status + list_triggers: read-only → ALSO added to queue.ts readOnlyTools set.
// stop_trigger: mutation → goes through the queue like stop_task.
```

---

## Data Flow

### Arm flow (blocking, refresh-poll)

```
MCP trigger(selector, threshold>=100, watch=refresh-poll, block=true)
   ↓ JSON-RPC
trigger.ts server.tool → queue.enqueue → sendAgentScopedBridgeMessage('mcp:arm-trigger')
   ↓ WebSocket
mcp-tool-dispatcher route 'mcp:arm-trigger' → ownership gate → trigger-manager.arm()
   ↓
trigger-manager: cap check → resolve owned tab → read INITIAL value (content) →
   write 'armed' snapshot (trigger-store) → set chrome.alarms fsbTrigger:<id> →
   send triggerPulseStart to content (analyzing pulse)
   ↓
mcp-bridge-client blocking handler: hold promise + 30s heartbeats (notifications/progress)
   ⋮ (SW may evict here — alarm survives, promise's bridge drops, server reads snapshot)
[alarm tick] → background.js onAlarm 'fsbTrigger:<id>' → trigger-lifecycle.handleTriggerAlarm
   ↓
reload owned tab (background) → re-read element (content triggerRead) →
   trigger-manager.evaluate(last, current, condition)
   ↓ condition met
emit fire → fsbTriggerLifecycleBus → blocking promise settle(fire_envelope) →
   write 'fired' snapshot → clear alarm → triggerPulseStop
   ↓ JSON-RPC result
MCP client receives fire_envelope ("what happened": old→new value, url, timestamp)
```

### Arm flow (detached, live-observe)

```
MCP trigger(selector, contains="In Stock", watch=live-observe, block=false)
   ↓
... same path to trigger-manager.arm() ...
   ↓
trigger-manager: send triggerObserveStart(selector, extract) to content →
   content/trigger-observe.js starts MutationObserver on the element (debounced) →
   write 'armed' snapshot → low-freq watchdog alarm → triggerPulseStart
   ↓ returns immediately
MCP client gets { trigger_id, status:'armed' }
   ⋮ later, page DOM mutates
content observer (debounced) → chrome.runtime.sendMessage('triggerValueChanged', {trigger_id, value})
   ↓ (wakes SW if evicted)
background.js onMessage → trigger-manager.evaluate → condition met → fire →
   write 'fired' snapshot → clear observer + alarm + pulse
   ↓
MCP client later calls get_trigger_status(trigger_id) → reads 'fired' snapshot → fire_envelope
```

### State management (where state lives)

```
chrome.storage.session  'fsbTriggerRegistry'  → live trigger snapshots (survives SW evict,
                                                 wiped on browser restart — intentional)
chrome.alarms           'fsbTrigger:<id>'      → poll clock (refresh-poll) / watchdog (live)
chrome.storage.local    'fsbTriggerCap'        → user cap preference (survives restart)
SW memory (ephemeral)   in-flight blocking promises, heartbeat timers (rebuilt from snapshot
                                                 on SW restart via restoreTriggersFromStorage)
content (page memory)   the MutationObserver instance (live-observe; dies on navigation,
                                                 re-armed by SW watchdog)
```

**On reusing the Lattice survivability adapter (explicit answer):** `extension/ai/lattice-runtime-adapter.js` implements Lattice's `SurvivabilityAdapter<TState>` over `chrome.storage.session` (serialize/deserialize/onEviction/resume). It is *available* and conceptually aligned, BUT it is keyed and shaped for **agent-loop session state** (the `run_task` runtime), and INV-06 pins the Lattice package. RECOMMEND: **do NOT route trigger snapshots through the Lattice adapter for v0.11.0.** Use `chrome.storage.session` directly via `trigger-store.js`, exactly as `mcp-task-store.js` does today (which also did not route through Lattice). Rationale: (1) lower risk — no coupling to the pinned Lattice contract or the offscreen host lifetime (the offscreen page "evicts before the SW" per lattice-host.js:71-72, which is *worse* survivability than a direct alarm); (2) the trigger snapshot is a flat record, not a Lattice `TState`; (3) keeps the offscreen document off the trigger hot path entirely. The Lattice *Capability Receipt* shape MAY inform the `fire_envelope` ("what happened") payload as a design reference, but generating a signed receipt is a deferred candidate, not v0.11.0 scope.

### Key data flows

1. **Tool registration (INV-01/02):** `tool-definitions.js TOOL_REGISTRY` += 4 additive defs → the `.cjs` mirror (`ai/tool-definitions.cjs`, consumed by `queue.ts`) regenerates → `runtime.ts` calls `registerTriggerTools` alongside the existing 5 registrars. Existing 52 tool schemas stay byte-identical (INV-01). Same registry feeds autopilot and MCP (INV-02): autopilot's `agent-loop.js getPublicTools()` reads the same `TOOL_REGISTRY`, so the AI can arm triggers too.
2. **Fire decision durability:** value reads happen in content; the compare/fire decision happens in the SW (`trigger-manager.evaluate`) backed by `chrome.storage.session`, so an eviction between "value read" and "fire decision" cannot drop a fire — the next alarm tick re-reads and re-evaluates against the persisted `last_value`.
3. **Visual lifecycle:** arm → `triggerPulseStart`; each refresh-poll reload → re-issue `triggerPulseStart` (survive reload); fire/stop → `triggerPulseStop`; overlay `mode:'trigger-watch'` drives the "watching a trigger" label.

---

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| 1-8 triggers (default cap) | Each refresh-poll trigger = one alarm; live-observe = one observer + one watchdog alarm. No concern. Chrome alarms are cheap. |
| 8-64 triggers (max cap) | Coordinate co-located refresh-poll reloads (one reload per tab per cadence, not per trigger) to avoid hammering a site and tripping rate limits (PROJECT.md "hard floor; avoid hammering sites"). Multiplex live-observe onto one observer per tab. |
| >64 | Rejected by cap (fail-loud `TRIGGER_CAP_REACHED`). No silent backpressure — same posture as the agent cap (PROJECT.md decision: "fail-loud on cap"). |

### Scaling priorities

1. **First bottleneck: refresh-poll reload storms.** N triggers on one site reloading independently. Fix: per-tab reload coalescing in `trigger-manager` (one reload serves all refresh-poll triggers on that tab; hard floor on interval). This is the single most important perf guard.
2. **Second bottleneck: alarm minimum granularity.** Chrome MV3 production alarms fire at minimum 30s (`mcp-visual-session-lifecycle.js:64-67` documents this). Sub-30s polling is impossible via alarms — enforce a ~30s hard floor and document it. Live-observe (event-driven, no alarm floor) is the answer for truly real-time tickers.

---

## Anti-Patterns

### Anti-Pattern 1: Running the watcher inside the agent loop / `activeSessions`

**What people do:** Reuse `agent-loop.js`'s iterator or the `activeSessions` map to "host" the standing trigger.
**Why it's wrong:** INV-04 freezes the `setTimeout`-chained iterator (lines 2003/2702/2771). A standing watcher has no AI iteration, no completion scoring, and a far longer lifetime. Grafting it on risks the load-bearing iterator and pollutes the session schema.
**Do this instead:** A parallel trigger registry (`trigger-store.js`/`trigger-lifecycle.js`/`trigger-manager.js`), exactly as v0.9.36 visual sessions and v0.9.60 run_task tracking are kept separate from `activeSessions`.

### Anti-Pattern 2: Evaluating fire conditions in the content script

**What people do:** Let the content MutationObserver decide "threshold crossed → fire."
**Why it's wrong:** Content scripts die on navigation and aren't persisted; an eviction or reload mid-evaluation drops the fire. The "did it cross?" decision needs the durable `last_value` in `chrome.storage.session`.
**Do this instead:** Content reads and reports raw values; the SW (`trigger-manager.evaluate`) owns the fire decision backed by the persisted snapshot — mirroring `dom-stream.js` (content sends mutations, SW/dashboard interprets).

### Anti-Pattern 3: A refresh-poll trigger reloading a tab that hosts a live-observe trigger

**What people do:** Allow any mix of watch modes on one tab.
**Why it's wrong:** The refresh-poll reload destroys the co-located observer; the live-observe trigger silently stops watching.
**Do this instead:** Detect the conflict at arm time and reject with a typed `TRIGGER_TAB_WATCH_CONFLICT`, steering to a separate (background) tab via the existing forced-new-tab pooling.

### Anti-Pattern 4: New manifest permissions or a new background context

**What people do:** Add permissions or spin up a new persistent worker for "always-on" watching.
**Why it's wrong:** `manifest.json` already grants `alarms`, `storage`, `unlimitedStorage`, `tabs`, `scripting`, `webNavigation`, `offscreen` — everything trigger needs. MV3 forbids persistent background pages; the alarm+storage+restore pattern IS the MV3-correct "always-on."
**Do this instead:** Zero manifest changes. Reuse `chrome.alarms` + `chrome.storage.session` + SW-startup restore, exactly like the visual-session lifecycle.

---

## Integration Points

### External boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| MCP client ↔ MCP server | JSON-RPC stdio + `notifications/progress` | Blocking `trigger()` streams heartbeats exactly like `run_task`; INV-01 keeps existing tool wires byte-identical |
| MCP server ↔ SW | WebSocket bridge, `mcp:trigger-*` messages | New message types only; existing `mcp:*` routes untouched |
| SW ↔ content | `chrome.tabs.sendMessage` (read/observe/pulse) + `chrome.runtime.sendMessage` (value reports) | New `action` cases in `content/messaging.js` router; existing cases untouched |
| SW ↔ Chrome platform | `chrome.alarms`, `chrome.storage.session/local`, `chrome.tabs`, `chrome.webNavigation` | All already permissioned |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `tool-definitions.js` ↔ autopilot + MCP | shared `TOOL_REGISTRY` array | INV-02: one registry, both consumers; `.cjs` mirror feeds `queue.ts` |
| `trigger-manager` ↔ `trigger-store` ↔ `trigger-lifecycle` | direct function calls in SW | three new `utils/` modules, importScripts-loaded like the visual lifecycle |
| `mcp-bridge-client` ↔ `trigger-manager` | `globalThis.fsbTriggerLifecycleBus` (fire events) | mirrors `globalThis.fsbAutomationLifecycleBus` used by run_task |
| `trigger-manager` ↔ tab ownership | `agent-tab-resolver.js` + `agent-registry.js` ownership gate | reuse, do not reinvent (INV consistency) |

---

## Dependency-Ordered Build Sequence

Ordered so each phase's output feeds the next (the project's established "data dependency chain for phases" discipline). Each phase is independently testable.

1. **Storage + lifecycle primitives (foundation).** `utils/trigger-store.js` (clone `mcp-task-store.js`, new key/constants) + `utils/trigger-lifecycle.js` (clone `mcp-visual-session-lifecycle.js` shape: `fsbTrigger:<id>` alarm, restore, tab-close cleanup). Pure modules, Node-testable with mocked `chrome`. *No behavior wired yet — exactly like the visual lifecycle's boot-order note.*

2. **Trigger manager + fire-condition engine + value extraction + cap.** `utils/trigger-manager.js`: `arm`/`stop`/`evaluate`/`fire`; the four conditions (changed/threshold/equals/contains); smart extraction (strip `$`,`,`,whitespace for number; raw for text; `extract` override); cap enforcement mirroring `agent-registry.js`. Depends on (1). Unit-testable in isolation.

3. **SW glue: onAlarm branch + SW-startup restore + tab-close cleanup.** `background.js`: add the `fsbTrigger:` branch to the single `chrome.alarms.onAlarm` listener (before existing branches), call `restoreTriggersFromStorage()` in the bootstrap pipeline, add `chrome.tabs.onRemoved` trigger cleanup. Depends on (1)+(2). This makes refresh-poll *survive eviction* — the milestone crux — verifiable via alarm-tick tests.

4. **Content live-observe + read + pulse.** `content/trigger-observe.js` (single-element MutationObserver, debounced, reports to SW) + `content/messaging.js` router cases (`triggerObserveStart/Stop`, `triggerRead`, `triggerPulseStart/Stop`) + `content/visual-feedback.js` analyzing-pulse glow variant + `ViewportGlow` "watching" label. Depends on (2)+(3) for the SW side to receive reports and drive pulses.

5. **Tool registry + dispatcher routing (INV-01/02).** `ai/tool-definitions.js` += 4 additive defs; regenerate `.cjs` mirror; `ws/mcp-tool-dispatcher.js` route tables += trigger aliases + `mcp:trigger-*` message routes (with ownership gate). Verifies existing 52 schemas unchanged (schema-lock test) and that autopilot can arm triggers (INV-02). Depends on (2)-(4).

6. **MCP server tools + blocking return.** `mcp/src/tools/trigger.ts` (4 `server.tool()`), `runtime.ts` registration, `queue.ts` read-only set += `get_trigger_status`/`list_triggers`; `ws/mcp-bridge-client.js` blocking `trigger()` heartbeat/settle handler (clone `_handleStartAutomation` shape; trigger-specific timeout ceiling + `partial_state` on eviction). Depends on (5). End-to-end MCP path now closes.

7. **Cap UI + polish + docs.** `control_panel.html` trigger-cap control next to the agent cap; CHANGELOG + mcp/README trigger tool docs; concurrency/conflict edge cases (refresh-poll vs live-observe on same tab → `TRIGGER_TAB_WATCH_CONFLICT`, co-located reload coalescing). Knock-on `fsb-mcp-server@0.10.0` minor bump. Depends on (6).

**Rationale for this order:** survivability primitives (1-3) must exist before anything can be tested for eviction-survival (the milestone's stated crux). Content (4) needs the SW to receive its reports. Registration/MCP (5-6) is meaningless until the watcher works. The blocking-return machinery (6) reuses the most code (`_handleStartAutomation`) and is therefore lowest-risk *last*, after the watcher itself is proven. This matches FSB's prior milestone discipline (e.g. v0.9.60: lifecycle/ownership primitives before MCP surface; v0.9.69: pipeline before consumption surface).

---

## NEW vs MODIFIED Summary

**NEW (5):**
- `extension/utils/trigger-store.js` — snapshot envelope (clone of `mcp-task-store.js`)
- `extension/utils/trigger-lifecycle.js` — alarm + restore + cleanup (clone of `mcp-visual-session-lifecycle.js`)
- `extension/utils/trigger-manager.js` — arm/evaluate/fire/stop + cap + tab binding
- `extension/content/trigger-observe.js` — single-element MutationObserver (live-observe)
- `mcp/src/tools/trigger.ts` — 4 `server.tool()` registrations

**MODIFIED (8):**
- `extension/ai/tool-definitions.js` — `TOOL_REGISTRY` += 4 additive defs (+ regenerate `.cjs` mirror)
- `extension/ws/mcp-tool-dispatcher.js` — route tables (tool aliases + `mcp:trigger-*` messages)
- `extension/ws/mcp-bridge-client.js` — blocking `trigger()` heartbeat/settle handler
- `extension/background.js` — onAlarm branch, SW-startup restore, `chrome.tabs.onRemoved` cleanup
- `extension/content/messaging.js` — router cases (observe/read/pulse)
- `extension/content/visual-feedback.js` — analyzing-pulse glow variant + "watching" label
- `mcp/src/runtime.ts` — call `registerTriggerTools(...)`
- `mcp/src/queue.ts` — `readOnlyTools` += `get_trigger_status`, `list_triggers`

**NO CHANGE:** `manifest.json` (permissions sufficient), all existing 52 tool schemas (INV-01), `agent-loop.js` iterator (INV-04), Lattice package/adapter (INV-06).

---

## Sources

- `extension/utils/mcp-task-store.js` — `chrome.storage.session` versioned envelope; the `trigger-store.js` template (HIGH — direct read)
- `extension/utils/mcp-visual-session-lifecycle.js` — per-entity `chrome.alarms` + storage + SW-startup restore + tab-close cleanup; the `trigger-lifecycle.js` template (HIGH — direct read)
- `extension/ws/mcp-bridge-client.js:979-1158` — blocking heartbeat/`settle()`/600s safety-net/`partial_state` pattern; the blocking `trigger()` template (HIGH — direct read)
- `extension/background.js:13283-13360` — single `chrome.alarms.onAlarm` listener with per-prefix branches; the onAlarm dispatch insertion point (HIGH — direct read)
- `extension/content/dom-stream.js:740-1075` — MutationObserver start/stop + rAF debounce + `chrome.runtime.sendMessage` reporting + message-driven router; the live-observe template (HIGH — direct read)
- `extension/content/visual-feedback.js:33-72, 884-1108` — `HighlightManager` orange glow + `ViewportGlow` thinking/acting states; the analyzing-pulse + "watching" label wiring (HIGH — direct read)
- `extension/content/messaging.js:1229-1432` — content router + `highlightElement` precedent; pulse message entry (HIGH — direct read)
- `extension/ai/tool-definitions.js:36-120, 94, 1213-1254` — shared `TOOL_REGISTRY` + `withVisualSessionFields` + read-only filter; INV-01/02 additive-registration surface (HIGH — direct read)
- `extension/ws/mcp-tool-dispatcher.js:62-91, 389, 447` — tool-alias + message route tables + inline ownership gate; the routing insertion point (HIGH — direct read)
- `extension/utils/agent-registry.js:52-76, 302-308, 810-891` — cap machinery (1-64, default 8, fail-loud, grandfather-on-lower); the trigger-cap template (HIGH — direct read)
- `extension/utils/agent-tab-resolver.js` — `resolveAgentTabOrError`; tab-binding reuse (HIGH — direct read)
- `extension/ai/lattice-runtime-adapter.js:1-199` — Lattice `SurvivabilityAdapter<TState>` over `chrome.storage.session`; evaluated and deliberately NOT used for trigger snapshots (HIGH — direct read)
- `extension/offscreen/lattice-host.js:60-72, 240-243` — offscreen host lifetime ("evicts before SW"); rationale for keeping triggers off the offscreen path (HIGH — direct read)
- `mcp/src/tools/autopilot.ts` — `run_task`/`stop_task`/`get_task_status` family + `sw_evicted` resolve shape; the `trigger.ts` template (HIGH — direct read)
- `mcp/src/tools/observability.ts` — read-only tool registration shape; the `get_trigger_status`/`list_triggers` template (HIGH — direct read)
- `mcp/src/runtime.ts:33-41` — single `register*Tools` call site (HIGH — direct read)
- `mcp/src/queue.ts:30-64` — `readOnlyTools` set + `.cjs` registry bridge (HIGH — direct read)
- `extension/manifest.json` — `alarms`/`storage`/`unlimitedStorage`/`tabs`/`scripting`/`webNavigation`/`offscreen` permissions already granted (HIGH — direct read)
- `.planning/PROJECT.md` — v0.11.0 Trigger Tool milestone + invariants INV-01/02/03/04/06 (HIGH — direct read)

---
*Architecture research for: FSB `trigger` tool family MV3 integration*
*Researched: 2026-06-15*
