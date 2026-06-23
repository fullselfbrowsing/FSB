# Phase 14: Trigger Survivability Foundation - Research

**Researched:** 2026-06-15
**Domain:** MV3 service-worker-survivable trigger registry (`chrome.storage.session` envelope + per-trigger `chrome.alarms` lifecycle + SW-wake reconcile + TTL/reap), cloning two shipping FSB modules
**Confidence:** HIGH (grounded in direct reads of the two clone-target modules, the three `background.js` glue points verified at current line numbers, the existing Node-mock test harnesses, and CONTEXT.md's 12 locked decisions; one external doc fetch confirms the 30s alarm floor)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

> Copied verbatim from `14-CONTEXT.md` `<decisions>`. These are LOCKED. Research these, not alternatives.

**Storage & Registry**

- **D-01:** Trigger state persists in a single versioned-envelope key **`fsbTriggerRegistry`** in `chrome.storage.session`, shape `{v:1, records:{[trigger_id]: snapshot}}`, cloning `extension/utils/mcp-task-store.js` byte-for-byte (empty-records-removes-key discipline, lazy `_getChrome()` for Node-mock tests, one-shot `hydrate()` returning the whole envelope so reconcile needs no N round-trips). Per-trigger snapshot stores **flat scalars only**: `trigger_id, status, watch, condition, selector, target_tab_id, agent_id, baseline (initial_value), last_value, last_evaluated_at, armed_at, fired_at, deadline_at, alarm_name`. (NOT the per-entity-key pattern of the visual lifecycle.)
- **D-02:** SURV-02 deliverable for this phase is the **survivable evaluation harness**: any fire evaluation re-reads the snapshot from `chrome.storage.session` (never from SW heap) and writes back atomically, so an eviction between read and decision cannot drop or duplicate a fire. The actual condition-comparison operators are Phase 15 -- Phase 14 owns only the "in-SW, against-persisted-state, idempotent" plumbing the comparison plugs into.

**Alarm Lifecycle**

- **D-03:** **One `chrome.alarms` alarm per trigger**, named `fsbTrigger:<trigger_id>` via a `TRIGGER_ALARM_PREFIX = 'fsbTrigger:'` constant -- mirroring the visual lifecycle's `mcpVisualDeath:<tabId>`. Arm with `chrome.alarms.create(name, ...)` (idempotent: same name replaces), clear with `chrome.alarms.clear(name)`. Dispatched inside the **existing** `background.js` `onAlarm` listener by `alarm.name.startsWith('fsbTrigger:')` with an early `return`. The 30s Chrome alarm-floor constant lives in the lifecycle module (enforced for refresh-poll in Phase 17).
- **D-04:** No shared sweep alarm in Phase 14 -- per-trigger alarms only (matches the locked "per-trigger alarm lifecycle" + the visual-lifecycle precedent).

**Module Decomposition**

- **D-05:** Phase 14 creates **exactly two** new modules: `extension/utils/trigger-store.js` (storage envelope, clone of `mcp-task-store.js`) and `extension/utils/trigger-lifecycle.js` (alarm arm/clear/re-arm + `restoreTriggersFromStorage` + tab-close cleanup + `handleTriggerAlarm`, clone of `mcp-visual-session-lifecycle.js`). Both use the IIFE + `global.X = exportsObj` + `module.exports` dual-export pattern and are `importScripts`-loaded in `background.js` in the same region as their templates.
- **D-06:** `extension/utils/trigger-manager.js` (arm/evaluate/fire + concurrency cap) is **DEFERRED to Phase 15** and NOT built here. The concurrency cap (LIFE-04, typed `TRIGGER_CAP_REACHED`) and the `fsbTriggerCap` key in `chrome.storage.local` are Phase 15.
- **D-07:** `background.js` is modified at **exactly three glue points**: (1) the `onAlarm` `startsWith('fsbTrigger:')` branch; (2) a bootstrap `restoreTriggersFromStorage()` call beside `restoreVisualSessionLifecyclesFromStorage`; (3) a `chrome.tabs.onRemoved` listener calling `handleTriggerTabRemoved(tabId)`. **INV-04: `extension/ai/agent-loop.js` and its `setTimeout`-chained iterator are byte-untouched.**

**SW-Wake Reconcile**

- **D-08:** `restoreTriggersFromStorage()` is the reconcile core: `hydrate()` the envelope, then **two-way reconcile against `chrome.alarms.getAll()`** -- for each `status:'armed'` snapshot whose `deadline_at` has NOT elapsed, re-arm `fsbTrigger:<id>` with the ORIGINAL schedule (idempotent `create`); drop `fired`/`stopped`/expired snapshots (delete entry + clear alarm); and clear any orphan `fsbTrigger:*` alarm returned by `getAll()` that has no backing snapshot (kills "alarm into the void"). The explicit `getAll()` orphan sweep is genuinely new code (`chrome.alarms.getAll` is used nowhere else in the SW today) -- chosen over storage-only re-arm because ROADMAP success criterion 3 names `getAll()` explicitly.
- **D-09:** `handleTriggerAlarm(alarm)` re-reads the snapshot from storage on every tick (never trusts SW memory) and **no-ops if the snapshot is missing or already `fired`** -- the idempotent fire-guard against duplicate fire / double-clear (mirrors `mcp-visual-session-lifecycle.js` `noop_no_entry`).

**Lifetime & Reap (TTL)**

- **D-10:** Every trigger carries an absolute `deadline_at = armed_at + TTL` (persisted). Reaped on three paths: (a) alarm tick where `now >= deadline_at` -> clear entry + alarm; (b) `restoreTriggersFromStorage` drops elapsed-deadline triggers on wake/restart; (c) `chrome.tabs.onRemoved` -> `handleTriggerTabRemoved(tabId)` reaps every trigger bound to that `target_tab_id`.
- **D-11:** The TTL **mechanism** ships in Phase 14; the default **value** is a named constant `FSB_TRIGGER_DEFAULT_TTL_MS` with a recommended **~6h** placeholder (watches run for hours), to be finalized in planning. Phase 19 owns the detached-TTL / blocking-ceiling reconciliation, so this value may be revisited then -- keep it a single named constant so that reconciliation is a one-line change.

**Survivability Substrate**

- **D-12:** Triggers use `chrome.storage.session` **directly** for survivability -- NOT the Lattice `SurvivabilityAdapter`. **Session-only:** a full Chrome quit ends watches; cross-browser-restart auto-resume is deferred (SURV-FUTURE-01).

### Claude's Discretion

- Exact snapshot field naming/casing -- follow the conventions already in `mcp-task-store.js`.
- Unit-test harness shape -- mirror the existing Node-mock storage tests for the store/lifecycle modules (lazy `_getChrome()` enables this).
- Whether `trigger-lifecycle.js` exposes `armTrigger`/`stopTrigger` helper signatures now or only the restore/alarm/reap surface -- planner's call, as long as no fire-condition logic leaks in (that is Phase 15).

### Deferred Ideas (OUT OF SCOPE)

- **Trigger manager (arm/evaluate/fire) + concurrency cap (LIFE-04, `TRIGGER_CAP_REACHED`, `fsbTriggerCap`)** -- Phase 15.
- **Fire-condition engine + value extraction** -- Phase 15.
- **Live-observe (MutationObserver) and refresh-poll watch mechanisms** -- Phases 16 / 17.
- **Shared tool registry + dispatcher wiring (the 4 tools)** -- Phase 18.
- **MCP blocking/detached return + structured fire envelope** -- Phase 19; also owns finalizing the concrete TTL / blocking-ceiling numbers.
- **Cross-browser-restart auto-resume** -- SURV-FUTURE-01 (session-only chosen for v0.11.0).
- **Lattice SurvivabilityAdapter for triggers** -- not used; `chrome.storage.session` directly.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SURV-01 | An armed trigger survives SW eviction -- state in `chrome.storage.session`, watch re-arms on SW wake via `chrome.alarms`; no keepalive antipatterns; INV-04 setTimeout iterator untouched. | `trigger-store.js` (clone of `mcp-task-store.js`) holds state outside the SW heap; `chrome.alarms` named `fsbTrigger:<id>` survives eviction and wakes the SW (verified against the visual-lifecycle precedent + Chrome alarms docs). INV-04 iterator lines 2003/2702/2771 confirmed untouched by the 3-glue-point design. |
| SURV-02 | Fire evaluation happens in the SW against persisted state, so eviction between read and decision cannot drop/duplicate a fire. | `handleTriggerAlarm` re-reads the snapshot from storage on every tick and no-ops if missing/fired (D-09); Phase 14 ships the idempotent re-read/write-back harness, the comparison operators are Phase 15. |
| SURV-03 | On SW wake, the registry reconciles persisted triggers without duplicate fires or orphaned watchers. | `restoreTriggersFromStorage` (clone of `restoreVisualSessionLifecyclesFromStorage`) re-arms non-elapsed `armed`, drops `fired`/`stopped`/expired, AND sweeps orphan `fsbTrigger:*` alarms via `chrome.alarms.getAll()` (D-08). |
| LIFE-05 | A trigger has a max lifetime (TTL); orphaned/expired triggers are reaped (alarm + registry entry released; tab-closed reaped via `chrome.tabs.onRemoved`). | Absolute `deadline_at = armed_at + FSB_TRIGGER_DEFAULT_TTL_MS`; three reap paths (alarm tick, restore, tab-removed) per D-10. |

**Out of this phase (verify the planner does NOT pull these in):** fire-condition operators / value extraction (Phase 15), concurrency cap + `fsbTriggerCap` + `trigger-manager.js` (Phase 15), watch mechanisms (16/17), tool registration (18), MCP return (19).
</phase_requirements>

## Summary

Phase 14 is a near byte-for-byte **clone of two shipping FSB modules**, with new constants and a trigger-specific snapshot schema. It builds the survivable scaffold the rest of the milestone (Phases 15-20) plugs into, and is fully testable in isolation with Node-mock `chrome.storage.session` + `chrome.alarms` -- before any fire-condition logic, watch mechanism, or MCP surface exists. The two clone targets were read in full this session and their public API, dual-export IIFE pattern, storage-envelope discipline, and alarm arm/clear/restore/handler shapes are documented below verbatim.

- `extension/utils/trigger-store.js` clones `extension/utils/mcp-task-store.js`: a single versioned envelope `{v:1, records:{[id]:snapshot}}` under `chrome.storage.session` key `fsbTriggerRegistry`, with empty-records-removes-key discipline, lazy `_getChrome()`, and a one-shot `hydrate()`.
- `extension/utils/trigger-lifecycle.js` clones `extension/utils/mcp-visual-session-lifecycle.js`: per-trigger `chrome.alarms` named `fsbTrigger:<id>`, an idempotent `handleTriggerAlarm` (re-read storage every tick, no-op if missing/fired), a `restoreTriggersFromStorage` reconcile (re-arm survivors with ORIGINAL deadline, drop terminal/expired, **plus** an explicit `chrome.alarms.getAll()` orphan sweep that the visual lifecycle does NOT have), and a `handleTriggerTabRemoved` reap.

The single design departure from the visual-lifecycle template is the **`chrome.alarms.getAll()` orphan-alarm sweep** in restore (D-08) -- `getAll()` is used nowhere else in the SW today and is the concrete mechanism that makes "alarm into the void" impossible (ROADMAP criterion 3). The other notable departure from BOTH templates is the snapshot shape: the trigger store uses the **flat-scalar `records` map keyed by `trigger_id`** (the `mcp-task-store.js` shape, NOT the per-entity storage-key-per-tab shape the visual lifecycle uses).

**Primary recommendation:** Clone `mcp-task-store.js` -> `trigger-store.js` (new key/constants/snapshot fields, identical envelope discipline) and `mcp-visual-session-lifecycle.js` -> `trigger-lifecycle.js` (new prefixes, add the `getAll()` orphan sweep, replace the 60s death TTL with `FSB_TRIGGER_DEFAULT_TTL_MS = 6h`, strip all the v0.9.36-overlay-broadcast coupling since Phase 14 ships no visual feedback). Wire exactly the three `background.js` glue points (verified line numbers below). Set `FSB_TRIGGER_DEFAULT_TTL_MS = 21_600_000` (6h). Test with a clone of the `mcp-visual-tick-lifecycle.test.js` chrome mock (which already fakes `chrome.alarms.create/clear/getAll`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Persist trigger snapshot (survive eviction) | SW utils (`trigger-store.js` -> `chrome.storage.session`) | Chrome platform (storage) | State must live OUTSIDE the SW heap; `chrome.storage.session` survives SW eviction but is wiped on browser restart (intentional, D-12) |
| Per-trigger wake clock | SW utils (`trigger-lifecycle.js` -> `chrome.alarms`) | Chrome platform (alarms) | `chrome.alarms` persists across SW lifetime and wakes the SW; the SW itself is NOT the survival mechanism |
| SW-wake reconcile (re-arm / drop / orphan-sweep) | SW utils (`restoreTriggersFromStorage`) + SW glue (`background.js` bootstrap) | Chrome platform (`alarms.getAll`) | Reconcile reads persisted truth and aligns the alarm set to it on every cold boot |
| Idempotent fire-decision plumbing (re-read + write-back) | SW (`handleTriggerAlarm` re-reads snapshot) | Chrome platform (storage) | Fire decision must be backed by persisted `last_value`, never SW memory (SURV-02); operators themselves are Phase 15 |
| TTL / reap | SW utils (`trigger-lifecycle.js` reap paths) + SW glue (`onAlarm`, `onRemoved`) | Chrome platform (tabs/alarms) | Three reap paths owned by the lifecycle module + driven by the SW glue listeners |
| Alarm dispatch fan-out | SW glue (`background.js` `onAlarm` `startsWith` branch) | -- | The single `onAlarm` listener fans out by name prefix with early returns; `fsbTrigger:` joins existing prefixes |
| Tab-close fan-out | SW glue (`background.js` `chrome.tabs.onRemoved`) | -- | A new per-concern `onRemoved` listener (FSB uses multiple independent listeners per concern) |
| Fire-condition evaluation, value extraction, cap, watch, MCP return | **OUT OF PHASE** (15-19) | -- | Phase 14 ships only the survivable scaffold; do not build these |

## Standard Stack

No external packages. Phase 14 is pure FSB-internal code cloning two in-tree modules, using only Chrome extension platform APIs already granted by `manifest.json`.

### Core

| API / Module | Version | Purpose | Why Standard |
|--------------|---------|---------|--------------|
| `chrome.storage.session` | MV3 platform | Persisted trigger snapshot envelope (survives SW eviction, wiped on browser restart) | Both clone targets use it; `mcp-task-store.js` envelope discipline is the exact template `[CITED: extension/utils/mcp-task-store.js:70-120]` |
| `chrome.alarms` | MV3 platform | Per-trigger wake clock; persists across SW lifetime | The visual lifecycle proves alarm survival; `create` is idempotent (same name replaces) `[CITED: extension/utils/mcp-visual-session-lifecycle.js:192-200]` |
| `chrome.tabs.onRemoved` | MV3 platform | Tab-close reap trigger | Existing per-concern listener pattern at `background.js:13169` `[VERIFIED: extension/background.js:13169-13176]` |
| `chrome.alarms.getAll` | MV3 platform | Orphan-alarm sweep in reconcile (D-08) | **NEW to the SW** -- used nowhere else today; the concrete mechanism for ROADMAP criterion 3 `[ASSUMED — confirm grep finds no other getAll() usage]` |

### Supporting

| Module (reference only, unchanged) | Purpose | When to Use |
|------------------------------------|---------|-------------|
| `extension/utils/mcp-task-store.js` | The `trigger-store.js` clone template | Read in full; replicate envelope discipline + dual-export |
| `extension/utils/mcp-visual-session-lifecycle.js` | The `trigger-lifecycle.js` clone template | Read in full; replicate alarm/restore/tab-close shapes (minus overlay broadcast) |
| `extension/utils/agent-registry.js` | Cap precedent (Phase 15, NOT 14) | Do not consume in Phase 14 -- cap is deferred |
| `tests/mcp-visual-tick-lifecycle.test.js` | The trigger-lifecycle TEST template (chrome.alarms mock) | Clone its `createChromeMock()` -- it already fakes `alarms.create/clear/getAll` |
| `tests/mcp-task-store.test.js` | The trigger-store TEST template (storage envelope) | Clone its 10-case structure + `freshRequireStore()` cache-bust idiom |

**Installation:** None. No `npm install`, no `manifest.json` change. `manifest.json` already grants `alarms`, `storage`, `unlimitedStorage`, `tabs`, `scripting`, `webNavigation`, `offscreen` `[CITED: 14-CONTEXT.md canonical_refs — manifest.json lines 9-19]`.

**Version verification:** N/A -- no external dependencies. Chrome platform API behavior verified against official docs (see Common Pitfalls -> 30s floor).

## Package Legitimacy Audit

> **Not applicable.** Phase 14 installs zero external packages. It clones two in-tree FSB modules and uses Chrome platform APIs already permissioned in `manifest.json`. No registry lookup, no slopcheck, no postinstall risk. (If the planner discovers a need for a new dependency, that is a scope violation -- escalate.)

## Clone-Target Source Analysis

This is the load-bearing section for the planner. Both modules were read in full this session.

### Clone Target A: `extension/utils/mcp-task-store.js` -> `trigger-store.js`

**Public API (5 functions + 2 constants), `[VERIFIED: extension/utils/mcp-task-store.js:179-187]`:**

| Export | Signature | Behavior | Trigger-store equivalent |
|--------|-----------|----------|--------------------------|
| `writeSnapshot` | `async (id, snapshot) -> void` | No-op on bad inputs (`!string`/`!object`); read envelope, set `records[id]`, write back `[VERIFIED: :128-134]` | Same; `id` = `trigger_id` |
| `readSnapshot` | `async (id) -> snapshot\|null` | Returns `null` for unknown `[VERIFIED: :139-143]` | Same |
| `deleteSnapshot` | `async (id) -> void` | Idempotent; when records map empties, `_writeEnvelope` removes the storage key `[VERIFIED: :149-155]` | Same |
| `listInFlightSnapshots` | `async () -> snapshot[]` | Filters `status === 'in_progress'` `[VERIFIED: :162-167]` | Rename to `listArmedSnapshots`, filter `status === 'armed'` |
| `hydrate` | `async () -> {v:1, records:{...}}` | One-shot whole-envelope read so reconcile needs no N round-trips `[VERIFIED: :173-175]` | **Identical** -- the reconcile-without-N-round-trips primitive (D-01) |
| `FSB_RUN_TASK_REGISTRY_STORAGE_KEY` | const = `'fsbRunTaskRegistry'` | Storage key `[VERIFIED: :51]` | `FSB_TRIGGER_REGISTRY_STORAGE_KEY = 'fsbTriggerRegistry'` |
| `FSB_RUN_TASK_REGISTRY_PAYLOAD_VERSION` | const = `1` | Envelope version `[VERIFIED: :52]` | `FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION = 1` |

**Envelope discipline (the load-bearing patterns to clone exactly):**

1. **Lazy `_getChrome()`** `[VERIFIED: :59-61]` -- resolves `globalThis.chrome` at call time, not module-eval time, so Node tests can inject a mock AFTER `require()`:
   ```javascript
   function _getChrome() {
     return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
   }
   ```
2. **`_readEnvelope` returns canonical empty `{v:1, records:{}}`** on missing key / version mismatch / malformed / any error -- NOT `null` -- so callers skip null-checks before reading `.records` `[VERIFIED: :70-91]`. This differs deliberately from `agent-registry.js` (which returns null).
3. **`_writeEnvelope` removes the key entirely when records is empty** `[VERIFIED: :97-120]` -- "no stale envelope sitting in storage forever":
   ```javascript
   if (Object.keys(nextRecords).length === 0) {
     if (typeof c.storage.session.remove === 'function') {
       await c.storage.session.remove(FSB_TRIGGER_REGISTRY_STORAGE_KEY);
     }
     return;
   }
   ```
4. **Best-effort no-throw posture** -- every storage call wrapped in try/catch; a persistence failure must NEVER crash the SW `[VERIFIED: :88-90, :117-119]`.
5. **Dual-export IIFE** `[VERIFIED: :1, :179-194]`:
   ```javascript
   (function(global) {
     'use strict';
     // ... constants, _getChrome, _readEnvelope, _writeEnvelope, public fns ...
     var exportsObj = { writeSnapshot, readSnapshot, deleteSnapshot, listArmedSnapshots, hydrate,
                        FSB_TRIGGER_REGISTRY_STORAGE_KEY, FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION };
     global.FsbTriggerStore = exportsObj;                              // SW importScripts consumer
     if (typeof module !== 'undefined' && module.exports) {
       module.exports = exportsObj;                                    // Node test consumer
     }
   })(typeof globalThis !== 'undefined' ? globalThis : this);
   ```

**Trigger snapshot schema (D-01, flat scalars only).** The planner should specify this exact field set (casing follows `mcp-task-store.js` snake_case convention per Claude's-Discretion note):

```javascript
// records[trigger_id] =
{
  trigger_id,            // string, also the records map key
  status,                // 'armed' | 'fired' | 'stopped' | 'error' | 'partial'
  watch,                 // 'refresh-poll' | 'live-observe' (stored now, consumed Phase 16/17)
  condition,             // opaque object stored verbatim; operators are Phase 15 (do NOT evaluate here)
  selector,              // uniqueness-scored selector string (stored; resolved Phase 15/16)
  target_tab_id,         // number; the tab this trigger is bound to (reap key for onRemoved)
  agent_id,              // string; owner (ownership gate is Phase 18, stored now)
  baseline,              // initial_value captured at arm time (Phase 15 populates; field reserved now)
  last_value,            // last extracted value (Phase 15 populates; field reserved now)
  last_evaluated_at,     // ms epoch of last evaluation tick
  armed_at,              // ms epoch
  fired_at,              // ms epoch, null until fired
  deadline_at,           // ms epoch = armed_at + FSB_TRIGGER_DEFAULT_TTL_MS (TTL reap key)
  alarm_name             // 'fsbTrigger:<trigger_id>' (denormalized for convenience / orphan matching)
}
```

> Phase 14 writes/reads/reaps these scalars but does NOT interpret `condition`, `selector`, `baseline`, or `last_value` -- those are reserved fields the Phase 15 trigger-manager populates and evaluates. Keep them in the schema now so the envelope shape is stable across phases.

### Clone Target B: `extension/utils/mcp-visual-session-lifecycle.js` -> `trigger-lifecycle.js`

**Public API (3 constants + 5 functions), `[VERIFIED: extension/utils/mcp-visual-session-lifecycle.js:632-643]`:**

| Visual-lifecycle export | Trigger-lifecycle equivalent | Notes |
|-------------------------|------------------------------|-------|
| `MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX = 'mcpVisualSession:'` | **DROP** -- trigger-store uses a single envelope key, not a per-entity key | Key difference: the visual lifecycle stores one storage key PER tab (`mcpVisualSession:<tabId>`); the trigger store uses the `mcp-task-store.js` single-envelope-`records`-map shape instead (D-01) |
| `MCP_VISUAL_LIFECYCLE_ALARM_PREFIX = 'mcpVisualDeath:'` | `TRIGGER_ALARM_PREFIX = 'fsbTrigger:'` | One alarm per trigger (D-03) |
| `MCP_VISUAL_LIFECYCLE_DEATH_MS = 60000` | `FSB_TRIGGER_DEFAULT_TTL_MS = 21600000` (6h, D-11) | The TTL constant; see Default TTL section |
| `alarmNameForTab(tabId)` | `alarmNameForTrigger(triggerId)` -> `'fsbTrigger:' + triggerId` | Returns null on invalid id (mirror the finite-positive-integer guard, adapted to string ids) `[VERIFIED: :97-101]` |
| `recordVisualSessionTick(...)` | **DROP** for Phase 14 (this is the arm path; arming lives in Phase 15's trigger-manager per D-06) | Or expose a thin `armTrigger`/`stopTrigger` helper -- planner's discretion (Claude's-Discretion note), as long as NO fire logic leaks in |
| `handleVisualSessionLifecycleAlarm(alarm)` | `handleTriggerAlarm(alarm)` | The idempotent tick handler (D-09); see below |
| `handleVisualSessionLifecycleTabRemoved(tabId)` | `handleTriggerTabRemoved(tabId)` | Reap every trigger bound to `target_tab_id === tabId` (D-10c); see below |
| `restoreVisualSessionLifecyclesFromStorage()` | `restoreTriggersFromStorage()` | The reconcile core (D-08); see below |
| `clearVisualSession(tabId, options)` | `clearTrigger(triggerId, options)` or inline | The clear/reap primitive (delete entry + clear alarm); strip the overlay broadcast |

**Alarm helper wrappers to clone (best-effort no-throw), `[VERIFIED: :176-200]`:**
```javascript
async function clearAlarm(name)  { /* chrome.alarms.clear(name); try/catch -> bool */ }
async function createAlarm(name, alarmInfo) { /* chrome.alarms.create(name, alarmInfo); try/catch -> bool */ }
```
Pass `{ when: deadline_at }` for a one-shot TTL alarm (visual-lifecycle uses `{ when: deadlineAt }` `[VERIFIED: :399]`). For refresh-poll's periodic clock, Phase 17 will pass `{ periodInMinutes }` honoring the 30s floor -- Phase 14 ships the constant but only needs the one-shot TTL/wake alarm.

**STRIP all of this from the clone (it is visual-overlay coupling, out of Phase 14 scope):**
- `getVisualSessionUtils()` / the `MCPVisualSessionUtils` dependency `[VERIFIED: :114-120]`
- `composeSessionShapeFromEntry` / `broadcastRunningStatus` / `broadcastClearStatus` / `sendSessionStatus` `[VERIFIED: :212-283]`
- `normalizeVisualReason`, `client`/`visualReason` fields, the agent-mismatch belt-and-suspenders in the tick path
- Visual feedback / pulse is Phase 16 (VIS-01..04). Phase 14 ships zero overlay code.

**Lazy chrome reference nuance:** the visual lifecycle reads `chrome` directly via `typeof chrome === 'undefined'` guards inside each wrapper `[VERIFIED: :127-128, :145, :162, :177, :193]`, NOT via a `_getChrome()` helper like `mcp-task-store.js`. For the trigger STORE, use the `mcp-task-store.js` `_getChrome()` idiom (D-01 says so). For the trigger LIFECYCLE, either idiom works under the Node mock; recommend matching `mcp-task-store.js`'s `_getChrome()` for consistency across the two new modules. Both are Node-mock-testable.

## Architecture Patterns

### System Architecture Diagram

```
                    ARM (Phase 15 trigger-manager — NOT this phase)
                              │  writes 'armed' snapshot + creates alarm
                              ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  chrome.storage.session  key 'fsbTriggerRegistry'                     │
   │  { v:1, records: { <trigger_id>: {status, deadline_at, alarm_name…} } }│   ← survives SW eviction
   └─────────────────────────────────────────────────────────────────────┘
                              ▲                         ▲
              hydrate()       │  re-read every tick     │  drop / write-back
                              │                         │
   ┌──────────────────────────┴─────────────────────────┴────────────────┐
   │  extension/utils/trigger-lifecycle.js  (SW, importScripts-loaded)    │
   │                                                                       │
   │  restoreTriggersFromStorage()        handleTriggerAlarm(alarm)        │
   │   1. hydrate() envelope               1. parse trigger_id from name   │
   │   2. chrome.alarms.getAll() ──┐       2. readSnapshot(id)             │
   │   3. armed & !elapsed →        │      3. missing/fired → NO-OP (D-09) │
   │      createAlarm(ORIGINAL)     │      4. now>=deadline_at → reap      │
   │   4. fired/stopped/expired →   │      5. (Phase 15: evaluate+fire)    │
   │      delete + clearAlarm       │                                       │
   │   5. orphan alarm (in getAll,  │      handleTriggerTabRemoved(tabId)  │
   │      no snapshot) → clearAlarm ◄┘      → reap all where target_tab_id │
   │      ("alarm into the void"=∅)         === tabId                      │
   └───────────────────────────────────────────────────────────────────────┘
            ▲                          ▲                          ▲
            │ bootstrap call           │ onAlarm fan-out          │ onRemoved
   ┌────────┴──────────────────────────┴──────────────────────────┴────────┐
   │  extension/background.js  (3 GLUE POINTS — verified line numbers)      │
   │   :2485  restoreTriggersFromStorage().catch(…)   (beside visual restore)│
   │   :13284 onAlarm: if name.startsWith('fsbTrigger:') → handleTriggerAlarm│
   │   :13169 onRemoved (NEW sibling listener) → handleTriggerTabRemoved     │
   │   :22-34 importScripts region: load trigger-store.js + trigger-lifecycle│
   └───────────────────────────────────────────────────────────────────────┘
                              │
   chrome.alarms 'fsbTrigger:<id>'  ← persists across SW lifetime; tick WAKES the SW
                                      (the SW is NOT the survival mechanism)

   NOT TOUCHED: extension/ai/agent-loop.js setTimeout iterator (INV-04, lines 2003/2702/2771)
```

A reader can trace SURV-01 (alarm tick wakes SW -> `handleTriggerAlarm` re-hydrates -> re-evaluate), SURV-03 (cold boot -> `restoreTriggersFromStorage` re-arms/drops/orphan-sweeps), and LIFE-05 (three reap paths converge on delete-entry + clear-alarm) by following the arrows.

### Recommended Project Structure

```
extension/
├── utils/
│   ├── trigger-store.js              # NEW — clone of mcp-task-store.js (key fsbTriggerRegistry)
│   ├── trigger-lifecycle.js          # NEW — clone of mcp-visual-session-lifecycle.js (alarm fsbTrigger:<id>)
│   ├── mcp-task-store.js             # template — UNCHANGED
│   └── mcp-visual-session-lifecycle.js  # template — UNCHANGED
├── background.js                     # MODIFIED — 3 glue points + importScripts region
└── ai/agent-loop.js                  # NOT TOUCHED (INV-04)

tests/
├── trigger-store.test.js             # NEW — clone of mcp-task-store.test.js (10-case structure)
└── trigger-lifecycle.test.js         # NEW — clone of mcp-visual-tick-lifecycle.test.js chrome mock
                                       #        (must be appended to package.json "test" chain)
```

### Pattern 1: Storage-is-truth, re-read every tick (SURV-02)

**What:** The SW never trusts its own heap for trigger state. Every alarm tick re-reads the snapshot from `chrome.storage.session` via `readSnapshot(trigger_id)`, and every state transition writes back atomically via `writeSnapshot`.
**When to use:** Always -- this is the eviction-transparency core (D-02).
**Example (the idempotent fire-guard, mirroring the visual lifecycle's `noop_no_entry`):**
```javascript
// trigger-lifecycle.js — handleTriggerAlarm
// Source pattern: extension/utils/mcp-visual-session-lifecycle.js:494-539 [VERIFIED]
async function handleTriggerAlarm(alarm) {
  if (!alarm || typeof alarm.name !== 'string') return { ok: false, reason: 'not_our_alarm' };
  if (alarm.name.indexOf(TRIGGER_ALARM_PREFIX) !== 0)  return { ok: false, reason: 'not_our_alarm' };

  var triggerId = alarm.name.slice(TRIGGER_ALARM_PREFIX.length);
  if (!triggerId) return { ok: false, reason: 'malformed_alarm_name' };

  var snap = await FsbTriggerStore.readSnapshot(triggerId);   // re-read storage, NOT SW memory
  if (!snap) return { ok: true, action: 'noop_no_entry' };    // D-09: already cleared by another path
  if (snap.status === 'fired' || snap.status === 'stopped') {
    return { ok: true, action: 'noop_terminal' };             // D-09: idempotent fire-guard
  }

  var now = Date.now();
  if (Number.isFinite(snap.deadline_at) && now >= snap.deadline_at) {
    await FsbTriggerStore.deleteSnapshot(triggerId);          // LIFE-05 reap path (a)
    await clearAlarm(alarm.name);
    return { ok: true, action: 'reaped_ttl' };
  }
  // Phase 15 plugs the evaluate-and-fire step in HERE (read element, compare, write 'fired').
  // Phase 14 ships the survivable re-read/re-arm scaffold only.
  return { ok: true, action: 'evaluated_noop' };
}
```

### Pattern 2: Two-way reconcile with orphan sweep (SURV-03, the one design departure)

**What:** On SW cold boot, `restoreTriggersFromStorage` hydrates the envelope AND enumerates `chrome.alarms.getAll()`, then reconciles in both directions: snapshot-with-no-alarm gets re-armed; alarm-with-no-snapshot gets cleared.
**When to use:** Once per SW startup, from the `background.js` bootstrap (D-07.2).
**Example (extending the visual-lifecycle restore with the getAll() sweep):**
```javascript
// trigger-lifecycle.js — restoreTriggersFromStorage
// Base pattern: extension/utils/mcp-visual-session-lifecycle.js:564-628 [VERIFIED]
// DEPARTURE (D-08): add the chrome.alarms.getAll() orphan sweep — getAll() is used
// nowhere else in the SW today.
async function restoreTriggersFromStorage() {
  var counters = { restored: 0, reaped: 0, dropped: 0, orphans_cleared: 0 };
  var envelope = await FsbTriggerStore.hydrate();               // {v:1, records:{...}} — one round-trip
  var now = Date.now();

  var liveAlarmNames = new Set();                               // for orphan detection
  var alarms = [];
  try { alarms = await chrome.alarms.getAll(); } catch (_e) { alarms = []; }
  alarms.forEach(function (a) { if (a && typeof a.name === 'string') liveAlarmNames.add(a.name); });

  var snapshotAlarmNames = new Set();
  var ids = Object.keys(envelope.records);
  for (var i = 0; i < ids.length; i++) {
    var snap = envelope.records[ids[i]];
    var alarmName = TRIGGER_ALARM_PREFIX + ids[i];
    snapshotAlarmNames.add(alarmName);

    var malformed = !snap || typeof snap !== 'object' || !Number.isFinite(Number(snap.deadline_at));
    if (malformed) { await FsbTriggerStore.deleteSnapshot(ids[i]); await clearAlarm(alarmName); counters.dropped++; continue; }

    if (snap.status !== 'armed' || now >= Number(snap.deadline_at)) {
      await FsbTriggerStore.deleteSnapshot(ids[i]);             // drop fired/stopped/expired (D-08)
      await clearAlarm(alarmName);
      counters.reaped++;
    } else {
      await createAlarm(alarmName, { when: Number(snap.deadline_at) });   // re-arm ORIGINAL schedule (D-08)
      counters.restored++;
    }
  }

  // Orphan sweep: any fsbTrigger:* alarm with no backing snapshot → clear it (D-08; kills "alarm into the void")
  liveAlarmNames.forEach(function (name) {
    if (name.indexOf(TRIGGER_ALARM_PREFIX) === 0 && !snapshotAlarmNames.has(name)) {
      clearAlarm(name); counters.orphans_cleared++;
    }
  });

  return Object.assign({ ok: true }, counters);
}
```
> Note the `await` in a `forEach` callback above is illustrative; the planner should use a `for` loop for the orphan sweep too if it needs ordered awaits, matching the visual-lifecycle's `for`-loop style `[VERIFIED: :584-625]`.

### Pattern 3: Per-concern SW glue with early-return fan-out

**What:** `background.js` already fans out `chrome.alarms.onAlarm` by name prefix with an early `return` per concern, and registers multiple independent `chrome.tabs.onRemoved` listeners. The trigger glue slots in beside the existing concerns -- additive, no edits to existing branches.
**When to use:** The three glue points (D-07).

### Anti-Patterns to Avoid

- **In-SW `setInterval`/`setTimeout` watch loop** -- dies on every ~30s eviction; the headline bug (Pitfall 2/3). State MUST live in storage, wake MUST be `chrome.alarms`. Never add a keepalive ping.
- **Trusting SW memory for the fire decision** -- re-read the snapshot every tick (D-09). Content/heap state is not durable.
- **Storage-only re-arm without the `getAll()` orphan sweep** -- leaves "alarm into the void" possible; D-08 requires the explicit sweep.
- **Touching `agent-loop.js` / `activeSessions` / the `setTimeout` iterator** -- INV-04 violation. The trigger registry is a PARALLEL sibling (third of `fsbMcpVisualSessions`, `fsbRunTaskRegistry`, `fsbTriggerRegistry`), never grafted onto run_task.
- **Per-entity storage key (`fsbTrigger:<id>` as a storage key)** -- D-01 mandates the single-envelope `records` map (the `mcp-task-store.js` shape), NOT the per-tab-key shape the visual lifecycle uses. Do not copy that part of the visual lifecycle.
- **Cloning the overlay-broadcast machinery** -- `sendSessionStatus`/`buildMcpVisualSession*`/`composeSessionShapeFromEntry` are visual-feedback coupling; Phase 14 ships no overlay (that is Phase 16). Strip them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Versioned storage envelope | A bespoke `chrome.storage` wrapper | Clone `mcp-task-store.js` verbatim (new key) | Empty-removes-key, version-mismatch-returns-empty, best-effort no-throw, lazy `_getChrome()` are all already solved and battle-tested |
| SW-eviction-survivable alarm lifecycle | A new alarm scheme | Clone `mcp-visual-session-lifecycle.js` (new prefix) | Re-arm-with-ORIGINAL-deadline, clock-skew reschedule, idempotent `noop_no_entry` are already solved |
| Node-mock chrome.alarms for tests | A new fake | Clone `createChromeMock()` from `mcp-visual-tick-lifecycle.test.js` | Already fakes `create`/`clear`/`getAll` + `_created()`/`_createHistory()`/`_cleared()` introspection |
| Node-mock chrome.storage for tests | A new fake | Clone `createStorageArea()` from `mcp-task-store.test.js` / `run-task-harness.js` | Async `get`/`set`/`remove`/`clear` + `_dump()` already match the envelope discipline |
| Idempotent alarm create | A "does it exist?" check before create | Just call `chrome.alarms.create(name, …)` | Same name replaces atomically (idempotent) -- documented + used at `background.js:13481` |

**Key insight:** The entire phase is a clone-and-rename exercise plus ONE genuinely-new piece (the `getAll()` orphan sweep). Resist re-deriving any envelope or alarm primitive -- the two templates encode hard-won MV3 survivability discipline (empty-removes-key, original-deadline re-arm, no-throw posture, lazy chrome ref) that a from-scratch rewrite would get subtly wrong.

## Runtime State Inventory

> Phase 14 is greenfield-additive (two NEW modules + additive glue), not a rename/refactor. There is NO existing trigger state to migrate. The relevant "runtime state" question is the inverse: what runtime state does this phase CREATE, and how is it reconciled on restart? Answered explicitly below.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | NEW: `chrome.storage.session` key `fsbTriggerRegistry` (the envelope). No pre-existing trigger data exists (greenfield). | None to migrate. Verify the key name `fsbTriggerRegistry` does not collide with any existing key. **Verified:** distinct from `fsbRunTaskRegistry`, `fsbMcpVisualSessions`, `mcpVisualSession:*`. `[VERIFIED: grep — no existing fsbTriggerRegistry usage]` |
| Live service config | NEW: `chrome.alarms` named `fsbTrigger:<id>`. No pre-existing trigger alarms. | None to migrate. Prefix `fsbTrigger:` verified distinct from `mcpVisualDeath:`, `fsb-telemetry-beat`, `fsb-domstream-watchdog`, `MCP_RECONNECT_ALARM`. The `getAll()` orphan sweep (D-08) is the reconcile mechanism for stale alarms after a code reload. |
| OS-registered state | None. Triggers are in-browser only; no Task Scheduler / launchd / pm2 / systemd involvement. | None — verified by domain (MV3 in-browser extension, no OS registration surface). |
| Secrets/env vars | None. No new secrets, no env vars, no SOPS keys. | None — verified by domain. |
| Build artifacts | None. Two new plain `.js` modules loaded via `importScripts`; no bundler, no `.egg-info`, no compiled output. (The `mcp/` TypeScript build is untouched in Phase 14.) | None — verified by domain (extension JS is unbundled; `package.json` "test" runs raw `node tests/*.js`). |

**Nothing to migrate:** This phase introduces survivable state; it does not rename or relocate existing state. The reconcile-on-restart logic (`restoreTriggersFromStorage`, D-08) is the runtime-state-consistency mechanism, and it is the phase deliverable itself.

## Common Pitfalls

> The four Phase-14-owned pitfalls from `.planning/research/PITFALLS.md` (2, 3, 12, 15, 16), distilled to this phase's scope. Full detail: `PITFALLS.md`.

### Pitfall 1 (PITFALLS #2): SW eviction silently kills the watch (~30s idle)
**What goes wrong:** State in an in-SW closure/`setInterval` is lost when the SW is evicted after ~30s idle; monitoring silently stops.
**Why it happens:** Devtools-open testing keeps the SW alive; "works on my machine" then dies in the field. **Unpacked extensions are exempt from the alarm floor** per Chrome docs -- another reason local testing hides this.
**How to avoid:** State in `chrome.storage.session` (`trigger-store.js`); wake via `chrome.alarms` (`trigger-lifecycle.js`). The SW is NOT the survival mechanism. `[CITED: developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle]`
**Warning signs:** Triggers fire reliably ~30s then never; `last_evaluated_at` stops advancing.
**Phase 14 test:** Simulate eviction by NOT calling the handler for a window, then fire the alarm handler against persisted state and assert it re-hydrates and re-evaluates (deterministic in Node-mock; see Validation Architecture).

### Pitfall 2 (PITFALLS #3): Keepalive antipattern
**What goes wrong:** A self-pinging `setInterval` to keep the SW alive 24/7 -- battery drain + Chrome Web Store rejection + INV-04 spirit violation.
**How to avoid:** Design FOR eviction, not against it. Alarm + storage resume is the ONLY sanctioned long-running pattern. Add NO keepalive of any kind. Do not rely on the MCP WebSocket activity to keep the SW alive (incidental, and absent for autopilot/detached triggers).
**Warning signs:** SW permanently "active" in `chrome://serviceworker-internals`.
**Phase 14 test:** Assert the two new modules contain no `setInterval`/keepalive; the only timer surface is `chrome.alarms`.

### Pitfall 3 (PITFALLS #15): Inconsistent behavior on SW reload / restart
**What goes wrong:** After a code reload, alarms persist but the SW didn't rehydrate the registry on startup -> alarm fires into the void (no snapshot) OR a stale `fired` snapshot re-arms spuriously.
**How to avoid:** `restoreTriggersFromStorage` on bootstrap (D-07.2): hydrate, reconcile against `getAll()`, re-arm non-elapsed `armed`, drop fired/expired, clear orphan alarms (D-08). Mirror the visual lifecycle's `restoreVisualSessionLifecyclesFromStorage`. `[VERIFIED: extension/utils/mcp-visual-session-lifecycle.js:564-628]`
**Warning signs:** Post-reload `list` empty though triggers were armed; alarm logs with no matching snapshot; a fired trigger re-fires.
**Phase 14 test:** Pre-seed storage + alarms in mismatched states (armed-no-alarm, alarm-no-snapshot, fired-with-alarm, expired-armed) and assert reconcile converges correctly.

### Pitfall 4 (PITFALLS #16): Duplicate fires (double-delivery)
**What goes wrong:** Two paths (e.g. alarm safety-net + a future content report) both deliver the same fire because the `fired` flag wasn't written before delivery.
**How to avoid (Phase 14 scope):** Single source of truth = the persisted `status` field, written before any delivery. `handleTriggerAlarm` no-ops if `status` is already `fired`/`stopped` (D-09), exactly like the visual lifecycle's `noop_no_entry`. `chrome.alarms.create` is idempotent (same name replaces). Fire-once edge semantics and the dedupe key are Phase 15, but Phase 14 provides the idempotent-status-guard substrate they depend on.
**Warning signs:** Two identical fire outcomes with the same value/timestamp.
**Phase 14 test:** Call `handleTriggerAlarm` twice on a `fired` snapshot; assert the second is a `noop_terminal` with no second delete/clear.

### Pitfall 5 (PITFALLS #12): Orphaned trigger / zombie alarm (TTL reap)
**What goes wrong:** A trigger whose owner disconnected or whose tab closed keeps its alarm ticking forever -- a zombie (in Phase 15 it would count against the cap).
**How to avoid (Phase 14 scope):** Absolute `deadline_at` TTL with three reap paths (D-10): alarm-tick reap (`now >= deadline_at`), restore reap (drop elapsed on boot), and `chrome.tabs.onRemoved` reap (every trigger bound to the closed tab). `[CITED: 14-CONTEXT.md D-10]`
**Warning signs:** Alarms firing for tabs that no longer exist; snapshots with a long-past `deadline_at`.
**Phase 14 test:** (a) tick past `deadline_at` -> entry+alarm gone; (b) restore with an expired snapshot -> dropped; (c) `handleTriggerTabRemoved(tabId)` with two triggers on that tab + one on another -> only the two reaped.

## Code Examples

### Tab-close reap (mirroring the visual lifecycle's tab-removed hook)
```javascript
// trigger-lifecycle.js — handleTriggerTabRemoved
// Base pattern: extension/utils/mcp-visual-session-lifecycle.js:464-466 [VERIFIED]
// Departure: the visual lifecycle clears ONE entry by tabId (its storage key IS the tabId);
// the trigger store must SCAN the records map for every snapshot whose target_tab_id matches.
async function handleTriggerTabRemoved(tabId) {
  var numericTabId = Number(tabId);
  if (!Number.isFinite(numericTabId)) return { ok: true, reaped: 0 };
  var envelope = await FsbTriggerStore.hydrate();
  var reaped = 0;
  var ids = Object.keys(envelope.records);
  for (var i = 0; i < ids.length; i++) {
    var snap = envelope.records[ids[i]];
    if (snap && Number(snap.target_tab_id) === numericTabId) {
      await FsbTriggerStore.deleteSnapshot(ids[i]);
      await clearAlarm(TRIGGER_ALARM_PREFIX + ids[i]);
      reaped++;
    }
  }
  return { ok: true, reaped: reaped };
}
```

### background.js glue point 1 — importScripts (region :22-34)
```javascript
// extension/background.js — beside the existing utils/mcp-task-store.js + mcp-visual-session-lifecycle.js loads
// CURRENT (verified): line 23 loads mcp-visual-session-lifecycle.js; line 34 loads mcp-task-store.js.
// ADD (load order: store BEFORE lifecycle, since lifecycle calls FsbTriggerStore):
try { importScripts('utils/trigger-store.js'); }     catch (e) { console.error('[FSB] Failed to load trigger-store.js:', e.message); }
try { importScripts('utils/trigger-lifecycle.js'); } catch (e) { console.error('[FSB] Failed to load trigger-lifecycle.js:', e.message); }
```

### background.js glue point 2 — onAlarm branch (insert in listener at :13284)
```javascript
// extension/background.js — inside the single chrome.alarms.onAlarm listener (line 13284),
// as a new prefix branch with an early return. Place it BEFORE the telemetry/reconnect/watchdog
// branches, mirroring the mcpVisualDeath branch at :13291-13301 [VERIFIED].
if (typeof FsbTriggerLifecycle !== 'undefined'
    && alarm && typeof alarm.name === 'string'
    && alarm.name.startsWith(FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX)) {       // 'fsbTrigger:'
  try { await FsbTriggerLifecycle.handleTriggerAlarm(alarm); }
  catch (err) { console.warn('[FSB TRG] handleTriggerAlarm failed (non-blocking):', err && err.message); }
  return;
}
```

### background.js glue point 3 — bootstrap restore (insert at :2485) and onRemoved (new listener near :13169)
```javascript
// (3a) extension/background.js — in restoreSessionsFromStorage(), beside the visual-lifecycle
// restore at :2492-2498 [VERIFIED]:
if (typeof FsbTriggerLifecycle !== 'undefined'
    && typeof FsbTriggerLifecycle.restoreTriggersFromStorage === 'function') {
  FsbTriggerLifecycle.restoreTriggersFromStorage()
    .catch((err) => console.warn('[FSB TRG] restoreTriggersFromStorage failed (non-blocking):', err && err.message));
}

// (3b) extension/background.js — a NEW per-concern chrome.tabs.onRemoved listener beside the
// visual-lifecycle one at :13169-13176 [VERIFIED] (FSB registers multiple independent listeners):
chrome.tabs.onRemoved.addListener((tabId) => {
  if (typeof FsbTriggerLifecycle === 'undefined') return;
  if (typeof FsbTriggerLifecycle.handleTriggerTabRemoved !== 'function') return;
  Promise.resolve(FsbTriggerLifecycle.handleTriggerTabRemoved(tabId))
    .catch((err) => console.warn('[FSB TRG] handleTriggerTabRemoved failed (non-blocking):', err && err.message));
});
```

> **Global namespace names** (`FsbTriggerStore`, `FsbTriggerLifecycle`) are recommendations matching the `Fsb*`/`*Utils` convention; the planner may pick final names but MUST keep `global.X = exportsObj` so the SW `importScripts` consumers and the glue points resolve them. Match the chosen store global name across both new modules.

## Default TTL Recommendation

**`FSB_TRIGGER_DEFAULT_TTL_MS = 21_600_000` (6 hours).** `[ASSUMED — D-11 flags ~6h for confirmation; Phase 19 may revise]`

Rationale:
- **Watches run for hours.** A price/stock/availability watch is the canonical use case; the requirement framing (REPORT-01 "~30s heartbeats... blocking", REPORT-03 "auto-convert to detached past a safety ceiling") explicitly anticipates multi-hour watches. A TTL shorter than a few hours would reap legitimate long watches.
- **6h is the CONTEXT.md placeholder (D-11)** and is a sensible upper bound for a single session-scoped watch -- long enough for "watch this all afternoon," short enough that a forgotten detached trigger self-reaps the same business day rather than living until the next browser quit.
- **Single named constant (D-11)** so Phase 19's detached-TTL / blocking-ceiling reconciliation is a one-line edit. Keep it as a module-level `var FSB_TRIGGER_DEFAULT_TTL_MS = 21600000;` exported from `trigger-lifecycle.js` (mirroring how `MCP_VISUAL_LIFECYCLE_DEATH_MS = 60000` is a module const `[VERIFIED: extension/utils/mcp-visual-session-lifecycle.js:79]`).
- **Session-scoped reaping context (D-12):** because triggers are wiped on full browser restart anyway, the TTL is the only mechanism that reaps a forgotten trigger WITHIN a long-running browser session. 6h balances "don't reap a real watch" against "don't let a zombie live for days of uptime."

**Confidence: MEDIUM.** The 6h figure is a reasoned placeholder, not an empirically-validated value. The planner should keep it a single constant and flag to the user (and to Phase 19) that the concrete number is provisional. Acceptable alternatives the user might prefer: 4h (tighter zombie reaping), 12h (full-workday watch), or 24h (set-and-forget). All are one-constant changes.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Persistent background page for "always-on" | MV3 SW + `chrome.alarms` + `chrome.storage` resume | MV3 (2021+) | No persistent context allowed; alarm+storage IS the MV3-correct "always-on". Phase 14 is built on this. |
| `setInterval` keepalive to dodge eviction | Design FOR eviction (alarm wake) | Ongoing Chrome enforcement | Keepalive risks store rejection; alarm-resume is sanctioned. |
| `chrome.alarms` sub-minute polling | 30s hard floor (`periodInMinutes`/`delayInMinutes` < 0.5 warns; `when` < 30s won't fire for 30s) | Chrome 120+ | Phase 14 ships the floor constant; refresh-poll (Phase 17) enforces it. `[CITED: developer.chrome.com/docs/extensions/reference/api/alarms]` |

**Deprecated/outdated for this phase:**
- The visual lifecycle's **per-tab storage key** pattern (`mcpVisualSession:<tabId>`) -- superseded for triggers by the `mcp-task-store.js` single-envelope `records` map (D-01). Clone the alarm/restore shape from the visual lifecycle but the STORAGE shape from the task store.
- The visual lifecycle's **overlay broadcast** coupling (`sendSessionStatus`, `buildMcpVisualSession*`) -- out of Phase 14 scope (visual feedback is Phase 16); strip entirely.

## Assumptions Log

> Claims tagged `[ASSUMED]` that need user/planner confirmation before becoming locked.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `FSB_TRIGGER_DEFAULT_TTL_MS = 6h` is the right default | Default TTL Recommendation | LOW — single named constant; a forgotten trigger lives too long (too high) or a real watch is reaped early (too low). One-line fix. D-11 already flags this for confirmation. |
| A2 | `chrome.alarms.getAll()` is used nowhere else in the SW today | Standard Stack; Runtime State Inventory | LOW — if it IS used elsewhere, the orphan sweep must scope strictly to the `fsbTrigger:` prefix (which the example already does), so no behavioral risk; only the "genuinely new code" framing changes. Planner should grep to confirm. |
| A3 | Recommended global names `FsbTriggerStore` / `FsbTriggerLifecycle` | Code Examples | NONE — naming is Claude's-discretion; any names work if `global.X = exportsObj` is kept and the glue points reference the same names. |
| A4 | The `mcp-visual-tick-lifecycle.test.js` `createChromeMock()` is the right test-mock template (already fakes alarms.getAll) | Validation Architecture | NONE — verified by direct read; the mock already implements `create`/`clear`/`getAll`/`_created`/`_createHistory`/`_cleared`. |

## Open Questions

1. **Does `trigger-lifecycle.js` expose an `armTrigger`/`stopTrigger` helper in Phase 14, or only the restore/alarm/reap surface?**
   - What we know: CONTEXT.md Claude's-Discretion explicitly leaves this to the planner, as long as no fire-condition logic leaks in.
   - What's unclear: Whether Phase 15's trigger-manager will call a Phase-14 `armTrigger(snapshot)` helper (write snapshot + create alarm) or do the write+create itself.
   - Recommendation: Expose a thin `armTrigger(snapshot)` (writeSnapshot + createAlarm with `{when: deadline_at}`) and `clearTrigger(triggerId)` (deleteSnapshot + clearAlarm) in `trigger-lifecycle.js` now. They are pure plumbing (no fire logic), testable in isolation, and give Phase 15 a clean seam. This keeps the alarm-name composition and the empty-removes-key discipline encapsulated in the lifecycle module rather than duplicated in the manager.

2. **`when` (one-shot) vs `periodInMinutes` (recurring) for the Phase-14 alarm.**
   - What we know: Phase 14's job is survive-eviction + wake + reconcile + TTL-reap. The TTL deadline is a one-shot `{when: deadline_at}` alarm (like the visual lifecycle). Refresh-poll's recurring poll clock is Phase 17.
   - What's unclear: Whether Phase 14 should ship only the one-shot TTL alarm, or also the recurring-alarm helper signature for Phase 17 to fill in.
   - Recommendation: Ship the one-shot `{when}` TTL/wake alarm only (it satisfies SURV-01/02/03 + LIFE-05 testably). Ship the 30s-floor constant (D-03) as an exported `var` so Phase 17 can import it, but do NOT build the periodic-clock arming in Phase 14 -- that is Phase 17's deliverable and would be untestable here (no fire condition to poll).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Running the Node-mock unit tests | ✓ | (project standard) | — |
| `chrome.storage.session` | Trigger snapshot persistence | ✓ (granted) | MV3 | — (mocked in tests) |
| `chrome.alarms` | Per-trigger wake clock | ✓ (granted) | MV3 | — (mocked in tests) |
| `chrome.tabs` | Tab-close reap | ✓ (granted) | MV3 | — (mocked in tests) |
| `manifest.json` permissions | All of the above | ✓ | — | NO manifest change needed `[CITED: 14-CONTEXT.md — manifest.json:9-19 grants alarms/storage/tabs]` |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None. All Chrome APIs are already permissioned; all are mocked in the existing Node test harnesses, so Phase 14 is fully testable without a browser.

## Validation Architecture

> `workflow.nyquist_validation` is not disabled in config (no `.planning/config.json` override found). Section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **None** — plain `node tests/<name>.test.js` files, hand-rolled `assert` + pass/fail counters + `process.exit(failed>0?1:0)`. No Jest/Mocha/Vitest. `[VERIFIED: package.json "test" script — chains ~150 node tests/*.js invocations]` |
| Config file | none — tests are self-contained scripts |
| Quick run command (this phase) | `node tests/trigger-store.test.js && node tests/trigger-lifecycle.test.js` |
| Full suite command | `npm test` (and `npm run ci` for the full gate) — **the two new test files MUST be appended to the `"test"` chain in `package.json`** so CI runs them |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SURV-01 | Snapshot persists in `chrome.storage.session`; survives a simulated eviction (handler re-reads from storage, not heap) | unit | `node tests/trigger-store.test.js` + `node tests/trigger-lifecycle.test.js` | ❌ Wave 0 |
| SURV-01 | No keepalive present in either module (only `chrome.alarms`, no `setInterval`) | unit (static assert) | `node tests/trigger-lifecycle.test.js` | ❌ Wave 0 |
| SURV-02 | `handleTriggerAlarm` re-reads snapshot every tick; no-op if missing/fired | unit | `node tests/trigger-lifecycle.test.js` | ❌ Wave 0 |
| SURV-02 | Eviction between read and decision drops/duplicates nothing (idempotent re-read/write-back) | unit | `node tests/trigger-lifecycle.test.js` | ❌ Wave 0 |
| SURV-03 | Reconcile: re-arm non-elapsed armed with ORIGINAL deadline | unit | `node tests/trigger-lifecycle.test.js` | ❌ Wave 0 |
| SURV-03 | Reconcile: drop fired/stopped/expired (delete entry + clear alarm) | unit | `node tests/trigger-lifecycle.test.js` | ❌ Wave 0 |
| SURV-03 | Reconcile: clear orphan `fsbTrigger:*` alarm with no backing snapshot (`getAll()` sweep) | unit | `node tests/trigger-lifecycle.test.js` | ❌ Wave 0 |
| LIFE-05 | TTL reap via alarm tick (`now >= deadline_at`) | unit | `node tests/trigger-lifecycle.test.js` | ❌ Wave 0 |
| LIFE-05 | TTL reap via restore (drop elapsed on boot) | unit | `node tests/trigger-lifecycle.test.js` | ❌ Wave 0 |
| LIFE-05 | Tab-close reap via `handleTriggerTabRemoved` (only triggers on that tab) | unit | `node tests/trigger-lifecycle.test.js` | ❌ Wave 0 |
| (store) | Envelope shape `{v:1,records}`; empty-removes-key; version-mismatch-empty; round-trip; hydrate; chrome-unavailable-no-throw | unit | `node tests/trigger-store.test.js` | ❌ Wave 0 |

### How to simulate the MV3 hard parts deterministically (Node-mock, no browser)

- **SW eviction:** there is no SW heap in the Node test — that IS the simulation. Write a snapshot via `FsbTriggerStore.writeSnapshot`, discard any in-memory references, then call `handleTriggerAlarm({name:'fsbTrigger:<id>'})` and assert it reads state purely from the mock storage. To prove "between read and decision," mutate the mock storage between two handler calls and assert the second call sees the new state (no stale-heap read).
- **Alarm-wake + reconcile:** pre-seed the mock with `createChromeMock()` (storage `records` + an `alarms` Map), then call `restoreTriggersFromStorage()` and assert via `chrome.alarms._created()` / `_cleared()` / `getAll()` that survivors were re-armed with the ORIGINAL `when`, terminals were cleared, and orphan `fsbTrigger:*` alarms (seeded into the alarm Map with no matching snapshot) were cleared.
- **Duplicate-fire prevention:** seed a `fired` snapshot, call `handleTriggerAlarm` twice, assert the second returns `noop_terminal` and that `_cleared()` / delete-calls did not double-fire.
- **TTL boundary:** seed a snapshot with `deadline_at = now - 1`, call `handleTriggerAlarm` (assert `reaped_ttl`) and separately call `restoreTriggersFromStorage` (assert it's in the `reaped`/`dropped` counter). Use explicit epoch numbers (no real timers needed; `Date.now()` is the only clock and can be stubbed if a test needs determinism, mirroring `installVirtualClock` in `run-task-harness.js`).
- **Tab-close reap:** seed three snapshots (two with `target_tab_id:42`, one with `:99`), call `handleTriggerTabRemoved(42)`, assert exactly two reaped and the `:99` survives.

### Sampling Rate
- **Per task commit:** `node tests/trigger-store.test.js && node tests/trigger-lifecycle.test.js` (sub-second; pure Node-mock).
- **Per wave merge:** `npm test` (full suite, ~150 files — confirms no regression and that the new files are wired into the chain).
- **Phase gate:** `npm run ci` green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/trigger-store.test.js` — covers the envelope discipline (clone the 10-case structure of `tests/mcp-task-store.test.js`, swap key/fns/snapshot). Covers store-side of SURV-01.
- [ ] `tests/trigger-lifecycle.test.js` — covers `handleTriggerAlarm` (SURV-02, duplicate-fire guard, TTL tick), `restoreTriggersFromStorage` (SURV-03 re-arm/drop/orphan-sweep, TTL restore-reap), `handleTriggerTabRemoved` (LIFE-05 tab reap). Clone the `createChromeMock()` (storage + alarms `create`/`clear`/`getAll`/`_created`/`_createHistory`/`_cleared`) from `tests/mcp-visual-tick-lifecycle.test.js`.
- [ ] **Wire both new test files into `package.json` `"test"`** — the chain is an explicit `&&` list; a new file not appended is silently never run by CI. (This is a real gap-trap given the ~150-entry chain.)
- [ ] Framework install: **none needed** — `node` + built-in `assert` only.

## Security Domain

> `security_enforcement` is not disabled (no `.planning/config.json` found). Section included. Phase 14 is a storage/alarms plumbing phase with no network, no auth, no user-supplied input parsing (operators are Phase 15), so the applicable surface is narrow.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in this phase; ownership gate (`agent_id`) is stored but enforced in Phase 18 |
| V3 Session Management | no | No sessions; `chrome.storage.session` is a Chrome storage area, not a web session |
| V4 Access Control | partial | `agent_id` is persisted in the snapshot now (reserved); cross-agent `stop`/ownership enforcement is Phase 18. Phase 14 must not weaken it — store `agent_id` faithfully. |
| V5 Input Validation | yes | Mirror `mcp-task-store.js`: silently no-op on bad `trigger_id`/snapshot inputs (`!string`/`!object`) rather than throw `[VERIFIED: extension/utils/mcp-task-store.js:128-130]`. `restore`/handlers guard malformed entries (drop, don't crash) like the visual lifecycle `[VERIFIED: extension/utils/mcp-visual-session-lifecycle.js:590-608]`. |
| V6 Cryptography | no | No crypto; no secrets touched. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/poisoned snapshot in storage (e.g. non-finite `deadline_at`) causing a crash loop on every alarm tick | Denial of Service | Drop malformed entries in `restore` and best-effort-clear in `handleTriggerAlarm` (mirror visual lifecycle's `malformed_entry`/`malformed_alarm_name` handling `[VERIFIED: :504-526, :590-608]`); never throw out of the SW glue (all glue points `.catch` non-blocking). |
| Orphan alarm firing into the void after a code reload (resource leak / log noise) | Denial of Service | `getAll()` orphan sweep on restore (D-08) clears any `fsbTrigger:*` alarm with no backing snapshot. |
| Zombie trigger consuming resources indefinitely | Denial of Service | Absolute `deadline_at` TTL + three reap paths (D-10). |
| State persistence failure crashing the SW or blocking a future resolve | Denial of Service | Best-effort no-throw posture on every storage/alarms call (clone from both templates). |
| Cross-agent state tampering (one agent mutating another's trigger) | Tampering | `agent_id` stored faithfully now; ownership ENFORCEMENT is Phase 18 — Phase 14 must not drop or normalize the field away. |

> Note: ReDoS / locale-parse / challenge-page-fire and the MCP-queue-starvation threats from PITFALLS.md belong to Phases 15/17/18/19 (fire conditions, watch, MCP surface) and are explicitly NOT Phase 14 surface — do not implement guards for them here.

## Sources

### Primary (HIGH confidence — direct reads this session)
- `extension/utils/mcp-task-store.js` (full) — the `trigger-store.js` clone template: envelope discipline, 5-fn API, dual-export IIFE, lazy `_getChrome()`, empty-removes-key
- `extension/utils/mcp-visual-session-lifecycle.js` (full) — the `trigger-lifecycle.js` clone template: alarm prefix/helpers, idempotent `handle...Alarm` (`:494-539`), `restore...FromStorage` re-arm-with-original-deadline (`:564-628`), tab-close cleanup (`:464-466`), TTL const (`:79`)
- `extension/background.js` — three glue points verified at current line numbers: importScripts region (`:22-34`, store at `:34`, lifecycle at `:23`), bootstrap restore (`:2485`, visual restore `:2492-2498`), `chrome.tabs.onRemoved` per-concern listener (`:13169-13176`), `chrome.alarms.onAlarm` `startsWith` dispatch (`:13284-13301`)
- `extension/ai/agent-loop.js` — INV-04 `setTimeout`-chained iterator verified at lines `2003`, `2702`, `2771` (NOT touched by this phase)
- `tests/mcp-task-store.test.js` (full) — the `trigger-store.test.js` template: 10-case structure, `freshRequireStore()` cache-bust, `makeSnapshot` factory
- `tests/mcp-visual-tick-lifecycle.test.js` (`:1-120`) — the `trigger-lifecycle.test.js` template: `createChromeMock()` already fakes `chrome.alarms.create/clear/getAll` + `_created()`/`_createHistory()`/`_cleared()`
- `tests/fixtures/run-task-harness.js` (`:1-140`) — `createStorageArea()` async storage mock + `installVirtualClock()` for deterministic time
- `package.json` `"test"`/`"ci"` scripts — confirms no test framework (plain `node tests/*.js` chain); new files must be appended
- `.planning/phases/14-trigger-survivability-foundation/14-CONTEXT.md` — the 12 locked decisions D-01..D-12
- `.planning/REQUIREMENTS.md` — SURV-01/02/03, LIFE-05 definitions + traceability
- `.planning/research/ARCHITECTURE.md` — Pattern 1 (parallel registry), Pattern 2 (alarm-tick survival), NEW/MODIFIED file map
- `.planning/research/PITFALLS.md` — Pitfalls 2, 3, 12, 15, 16 (Phase-14-owned)

### Secondary (HIGH-MEDIUM confidence — official docs)
- Chrome for Developers, Alarms API reference (30s floor: `periodInMinutes`/`delayInMinutes` < 0.5 warns; `when` < 30s won't fire for 30s; unpacked extensions exempt) — https://developer.chrome.com/docs/extensions/reference/api/alarms
- Chrome for Developers, SW lifecycle (30s idle eviction, alarms wake the SW) — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle (via PITFALLS.md citation)

### Tertiary (LOW confidence — flagged)
- None. All claims in this research are verified against in-tree source or cited to official Chrome docs. The only `[ASSUMED]` items are the TTL value (A1, flagged by D-11) and the "getAll used nowhere else" framing (A2, planner-confirmable by grep) — neither carries behavioral risk.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no external deps; both clone templates and all three glue points read directly this session.
- Architecture: HIGH — the parallel-registry + alarm-survival patterns are proven in the two shipping templates; the one departure (`getAll()` orphan sweep) is small, additive, and explicitly specified by D-08.
- Pitfalls: HIGH — distilled from PITFALLS.md (HIGH-confidence Chrome-lifecycle + FSB-source basis) to this phase's scope.
- Default TTL: MEDIUM — 6h is a reasoned placeholder per D-11, not empirically validated; single constant, easy to revise.

**Research date:** 2026-06-15
**Valid until:** ~2026-07-15 (30 days; stable in-tree clone targets and a stable Chrome platform API). Re-verify the three `background.js` line numbers if the file changes before planning — they were exact as of this session on branch `automation-worktree`.
