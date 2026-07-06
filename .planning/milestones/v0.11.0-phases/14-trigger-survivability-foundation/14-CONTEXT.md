# Phase 14: Trigger Survivability Foundation - Context

**Gathered:** 2026-06-15 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a storage-backed trigger registry and per-trigger alarm lifecycle so that an armed trigger survives MV3 service-worker eviction, wakes the SW to re-evaluate, and reconciles cleanly on SW restart -- the milestone crux, testable before any watch mechanism exists.

**In scope (the four requirements):** SURV-01 (survive SW eviction via `chrome.storage.session` + `chrome.alarms`), SURV-02 (fire evaluation in the SW against persisted state, no drop/duplicate across eviction), SURV-03 (reconcile persisted triggers on SW wake without duplicate fires or orphaned watchers), LIFE-05 (per-trigger TTL + reap).

**Explicitly NOT in this phase:** fire-condition engine + value extraction + concurrency cap (Phase 15), live-observe / refresh-poll watch mechanisms (Phases 16/17), tool registration (Phase 18), MCP blocking/detached return (Phase 19). Phase 14 ships the survivable scaffold those phases plug into; it must be testable in isolation.
</domain>

<decisions>
## Implementation Decisions

### Storage & Registry

- **D-01:** Trigger state persists in a single versioned-envelope key **`fsbTriggerRegistry`** in `chrome.storage.session`, shape `{v:1, records:{[trigger_id]: snapshot}}`, cloning `extension/utils/mcp-task-store.js` byte-for-byte (empty-records-removes-key discipline, lazy `_getChrome()` for Node-mock tests, one-shot `hydrate()` returning the whole envelope so reconcile needs no N round-trips). Per-trigger snapshot stores **flat scalars only**: `trigger_id, status, watch, condition, selector, target_tab_id, agent_id, baseline (initial_value), last_value, last_evaluated_at, armed_at, fired_at, deadline_at, alarm_name`. (NOT the per-entity-key pattern of the visual lifecycle.)
- **D-02:** SURV-02 deliverable for this phase is the **survivable evaluation harness**: any fire evaluation re-reads the snapshot from `chrome.storage.session` (never from SW heap) and writes back atomically, so an eviction between read and decision cannot drop or duplicate a fire. The actual condition-comparison operators are Phase 15 -- Phase 14 owns only the "in-SW, against-persisted-state, idempotent" plumbing the comparison plugs into.

### Alarm Lifecycle

- **D-03:** **One `chrome.alarms` alarm per trigger**, named `fsbTrigger:<trigger_id>` via a `TRIGGER_ALARM_PREFIX = 'fsbTrigger:'` constant -- mirroring the visual lifecycle's `mcpVisualDeath:<tabId>`. Arm with `chrome.alarms.create(name, ...)` (idempotent: same name replaces), clear with `chrome.alarms.clear(name)`. Dispatched inside the **existing** `background.js` `onAlarm` listener by `alarm.name.startsWith('fsbTrigger:')` with an early `return`. The 30s Chrome alarm-floor constant lives in the lifecycle module (enforced for refresh-poll in Phase 17).
- **D-04:** No shared sweep alarm in Phase 14 -- per-trigger alarms only (matches the locked "per-trigger alarm lifecycle" + the visual-lifecycle precedent).

### Module Decomposition

- **D-05:** Phase 14 creates **exactly two** new modules: `extension/utils/trigger-store.js` (storage envelope, clone of `mcp-task-store.js`) and `extension/utils/trigger-lifecycle.js` (alarm arm/clear/re-arm + `restoreTriggersFromStorage` + tab-close cleanup + `handleTriggerAlarm`, clone of `mcp-visual-session-lifecycle.js`). Both use the IIFE + `global.X = exportsObj` + `module.exports` dual-export pattern and are `importScripts`-loaded in `background.js` in the same region as their templates.
- **D-06:** `extension/utils/trigger-manager.js` (arm/evaluate/fire + concurrency cap) is **DEFERRED to Phase 15** and NOT built here. The concurrency cap (LIFE-04, typed `TRIGGER_CAP_REACHED`) and the `fsbTriggerCap` key in `chrome.storage.local` are Phase 15.
- **D-07:** `background.js` is modified at **exactly three glue points**: (1) the `onAlarm` `startsWith('fsbTrigger:')` branch; (2) a bootstrap `restoreTriggersFromStorage()` call beside `restoreVisualSessionLifecyclesFromStorage`; (3) a `chrome.tabs.onRemoved` listener calling `handleTriggerTabRemoved(tabId)`. **INV-04: `extension/ai/agent-loop.js` and its `setTimeout`-chained iterator are byte-untouched.**

### SW-Wake Reconcile

- **D-08:** `restoreTriggersFromStorage()` is the reconcile core: `hydrate()` the envelope, then **two-way reconcile against `chrome.alarms.getAll()`** -- for each `status:'armed'` snapshot whose `deadline_at` has NOT elapsed, re-arm `fsbTrigger:<id>` with the ORIGINAL schedule (idempotent `create`); drop `fired`/`stopped`/expired snapshots (delete entry + clear alarm); and clear any orphan `fsbTrigger:*` alarm returned by `getAll()` that has no backing snapshot (kills "alarm into the void"). The explicit `getAll()` orphan sweep is genuinely new code (`chrome.alarms.getAll` is used nowhere else in the SW today) -- chosen over storage-only re-arm because ROADMAP success criterion 3 names `getAll()` explicitly.
- **D-09:** `handleTriggerAlarm(alarm)` re-reads the snapshot from storage on every tick (never trusts SW memory) and **no-ops if the snapshot is missing or already `fired`** -- the idempotent fire-guard against duplicate fire / double-clear (mirrors `mcp-visual-session-lifecycle.js` `noop_no_entry`).

### Lifetime & Reap (TTL)

- **D-10:** Every trigger carries an absolute `deadline_at = armed_at + TTL` (persisted). Reaped on three paths: (a) alarm tick where `now >= deadline_at` -> clear entry + alarm; (b) `restoreTriggersFromStorage` drops elapsed-deadline triggers on wake/restart; (c) `chrome.tabs.onRemoved` -> `handleTriggerTabRemoved(tabId)` reaps every trigger bound to that `target_tab_id`.
- **D-11:** The TTL **mechanism** ships in Phase 14; the default **value** is a named constant `FSB_TRIGGER_DEFAULT_TTL_MS` with a recommended **~6h** placeholder (watches run for hours), to be finalized in planning. Phase 19 owns the detached-TTL / blocking-ceiling reconciliation, so this value may be revisited then -- keep it a single named constant so that reconciliation is a one-line change.

### Survivability Substrate

- **D-12:** Triggers use `chrome.storage.session` **directly** for survivability -- NOT the Lattice `SurvivabilityAdapter` (per `.planning/research/ARCHITECTURE.md`: the adapter is shaped for agent-loop state and its offscreen host evicts before the SW, i.e. worse survivability). **Session-only:** a full Chrome quit ends watches; cross-browser-restart auto-resume is deferred (SURV-FUTURE-01).

### Claude's Discretion

- Exact snapshot field naming/casing -- follow the conventions already in `mcp-task-store.js`.
- Unit-test harness shape -- mirror the existing Node-mock storage tests for the store/lifecycle modules (lazy `_getChrome()` enables this).
- Whether `trigger-lifecycle.js` exposes `armTrigger`/`stopTrigger` helper signatures now or only the restore/alarm/reap surface -- planner's call, as long as no fire-condition logic leaks in (that is Phase 15).

### Folded Todos

None -- no pending todos matched this phase.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/research/ARCHITECTURE.md` -- integration design; Pattern 1 (parallel registry), Pattern 2 (alarm-tick survival), the NEW(5)/MODIFIED(8) file map, Build Sequence steps 1-3 (Phase-14 scope).
- `.planning/research/PITFALLS.md` -- Pitfalls 2 (SW eviction), 3 (keepalive antipattern), 12 (detached orphan/TTL), 15 (restart reconcile), 16 (duplicate fires) are Phase-14-owned.
- `.planning/ROADMAP.md` lines 30-39 -- Phase 14 goal + the four success criteria (note: the concurrency cap lives in Phase 15, lines 41-51).
- `extension/utils/mcp-task-store.js` -- the `trigger-store.js` clone target: `{v:1,records}` envelope, empty-removes-key (`:97-120`), `hydrate()` (`:173-175`), dual-export (`:179-194`).
- `extension/utils/mcp-visual-session-lifecycle.js` -- the `trigger-lifecycle.js` clone target: alarm/storage key prefixes + 30s-floor note (`:58-79`), `handle...Alarm` idempotent re-read (`:494-539`), `restore...FromStorage` reconcile / re-arm-with-original-deadline (`:564-628`), tab-close cleanup (`:464-466`).
- `extension/background.js` -- the three glue insertion points: bootstrap restore call site (`:2485-2498`), `chrome.tabs.onRemoved` per-concern listener (`:13169-13176`), `chrome.alarms.onAlarm` `startsWith`-prefix dispatch with early-return (`:13284-13301`), and `importScripts` ordering region (`:22-34`).
- `extension/utils/agent-registry.js` -- cap precedent for Phase 15 (storage-area split: `fsbAgentCap` in `chrome.storage.local` `:52,847-857`; typed reject `:308`) and the lazy `_getChrome` storage-helper idiom (`:87-129`).
- `extension/manifest.json` lines 9-19 -- confirms `alarms` / `storage` / `unlimitedStorage` / `tabs` / `scripting` / `webNavigation` / `offscreen` already granted (no manifest change in Phase 14).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/utils/mcp-task-store.js` -- versioned-envelope `chrome.storage` store (the storage clone target for `trigger-store.js`).
- `extension/utils/mcp-visual-session-lifecycle.js` -- `chrome.alarms`-driven per-entity lifecycle with storage-backed restore + idempotent alarm handler + tab-close cleanup (the clone target for `trigger-lifecycle.js`).
- `extension/utils/agent-registry.js` -- concurrency-cap + storage-area-split precedent (consumed in Phase 15, not 14).
- `extension/background.js` -- existing multi-alarm `onAlarm` dispatcher, bootstrap restore region, and per-concern `tabs.onRemoved` listeners (the three glue points).

### Established Patterns
- **Dual-export IIFE:** `(function(global){ ... global.X = exports; })(self); if (typeof module !== 'undefined') module.exports = ...` -- both template modules use it; new modules must too.
- **Lazy `_getChrome()`:** storage helpers resolve `chrome`/`self.chrome` lazily so Node mocks can inject a fake -- enables unit tests without a browser.
- **Alarm-prefix dispatch:** `onAlarm` fans out by `alarm.name.startsWith('<prefix>:')` with an early `return` per concern; `fsbTrigger:` joins `mcpVisualDeath:`, `fsb-telemetry-beat`, `fsb-domstream-watchdog`, `MCP_RECONNECT_ALARM`.
- **Storage-is-truth reconcile:** restore enumerates persisted entries, drops malformed/elapsed, re-arms survivors with their ORIGINAL deadline -- the eviction-transparent window pattern.
- **Idempotent alarm handler:** re-read storage on tick; `noop` when the entry is gone/already-terminal.

### Integration Points
- `background.js:2485-2498` -- bootstrap async fn; add `restoreTriggersFromStorage().catch(...)` beside `restoreVisualSessionLifecyclesFromStorage`.
- `background.js:13284-13301` -- `chrome.alarms.onAlarm`; add the `startsWith('fsbTrigger:')` branch with early return.
- `background.js:13169-13176` -- per-concern `chrome.tabs.onRemoved`; add `handleTriggerTabRemoved(tabId)`.
- `background.js:22-34` -- `importScripts` region; load `trigger-store.js` + `trigger-lifecycle.js` beside their templates.
- `extension/ai/agent-loop.js` -- **do not touch** (INV-04; the `setTimeout`-chained iterator stays byte-frozen).
</code_context>

<specifics>
## Specific Ideas

- The reconcile MUST include the explicit `chrome.alarms.getAll()` orphan-alarm sweep (D-08), not just storage-based re-arm -- this is the concrete way ROADMAP criterion 3 ("alarm-into-the-void is impossible") is satisfied.
- Default TTL recommendation: `FSB_TRIGGER_DEFAULT_TTL_MS` ~= 6 hours, as a single named constant (D-11) so Phase 19 can reconcile it against the detached-TTL/ceiling in one edit.
</specifics>

<deferred>
## Deferred Ideas

- **Trigger manager (arm/evaluate/fire) + concurrency cap (LIFE-04, `TRIGGER_CAP_REACHED`, `fsbTriggerCap`)** -- Phase 15.
- **Fire-condition engine + value extraction** -- Phase 15.
- **Live-observe (MutationObserver) and refresh-poll watch mechanisms** -- Phases 16 / 17.
- **Shared tool registry + dispatcher wiring (the 4 tools)** -- Phase 18.
- **MCP blocking/detached return + structured fire envelope** -- Phase 19; also owns finalizing the concrete TTL / blocking-ceiling numbers.
- **Cross-browser-restart auto-resume** -- SURV-FUTURE-01 (session-only chosen for v0.11.0).
- **Lattice SurvivabilityAdapter for triggers** -- not used; `chrome.storage.session` directly (architecture research).

### Reviewed Todos (not folded)
None -- no pending todos matched this phase.
</deferred>
