# Phase 14: Trigger Survivability Foundation - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 5 (2 new modules + 1 modified glue file + 2 new tests)
**Analogs found:** 5 / 5 (every file has a named in-tree clone target)

> This phase is a near byte-for-byte clone of two shipping FSB modules. The analogs were
> pre-named in CONTEXT.md (canonical_refs) and RESEARCH.md (Clone-Target Source Analysis).
> This document extracts the VERBATIM excerpts (real lines from the tree, not paraphrase)
> the planner/executor copies, and states exactly what to change in each.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `extension/utils/trigger-store.js` (NEW) | utility / store | CRUD + event-driven (persisted state) | `extension/utils/mcp-task-store.js` | exact (clone) |
| `extension/utils/trigger-lifecycle.js` (NEW) | service / lifecycle | event-driven (alarm-tick) + batch (reconcile) | `extension/utils/mcp-visual-session-lifecycle.js` | exact (clone, minus overlay) |
| `extension/background.js` (MODIFIED) | config / SW glue | event-driven (dispatch/listener fan-out) | the same file's existing visual-lifecycle glue | self-analog (additive) |
| `tests/trigger-store.test.js` (NEW) | test | CRUD assertions (Node-mock storage) | `tests/mcp-task-store.test.js` | exact (10-case clone) |
| `tests/trigger-lifecycle.test.js` (NEW) | test | event-driven assertions (Node-mock alarms) | `tests/mcp-visual-tick-lifecycle.test.js` | exact (chrome-mock clone) |

**INV-04 guard (verified):** `extension/ai/agent-loop.js` is NOT in this list and MUST NOT appear in any
plan's modified-files set. Its `setTimeout`-chained iterator (lines 2003 / 2702 / 2771) stays byte-frozen.
The only mention of `agent-loop` in the phase docs is D-12 explaining why the Lattice `SurvivabilityAdapter`
(shaped for agent-loop state) is deliberately NOT used -- agent-loop is referenced only as a thing avoided.

**Pre-flight collision checks (verified this session, grep):**
- `fsbTriggerRegistry` storage key: zero existing usages in `extension/` or `tests/` -- safe.
- `fsbTrigger:` alarm prefix: zero existing usages -- distinct from `mcpVisualDeath:`, `fsb-telemetry-beat`, `fsb-domstream-watchdog`, `MCP_RECONNECT_ALARM`.
- `chrome.alarms.getAll()`: the ONLY occurrences in `extension/` are COMMENTED-OUT lines (`agent-scheduler.js:153,451`). No live `getAll()` call exists in the SW today -- confirms D-08's orphan sweep is genuinely new code.

---

## Pattern Assignments

### `extension/utils/trigger-store.js` (utility/store, CRUD)

**Analog:** `extension/utils/mcp-task-store.js` -- clone the WHOLE file (195 lines); change only constants, the snapshot doc-comment, one filter function, and the export/global names.

**Constants pattern** (`mcp-task-store.js:49-52`):
```javascript
  // ---- Constants ----------------------------------------------------------

  var FSB_RUN_TASK_REGISTRY_STORAGE_KEY = 'fsbRunTaskRegistry';
  var FSB_RUN_TASK_REGISTRY_PAYLOAD_VERSION = 1;
```
**CHANGE TO:** `FSB_TRIGGER_REGISTRY_STORAGE_KEY = 'fsbTriggerRegistry'` and `FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION = 1` (D-01).

**Lazy `_getChrome()`** (`mcp-task-store.js:59-61`) -- copy verbatim; the load-bearing Node-mock seam (resolves `chrome` at call time, not module-eval time, so tests inject a mock after `require()`):
```javascript
  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }
```

**`_readEnvelope` -- canonical-empty-on-anything-wrong** (`mcp-task-store.js:70-91`) -- copy verbatim, only swap the two constant names. Returns `{ v:1, records:{} }` (NOT null) on missing key / version mismatch / malformed / any error, so callers skip null-checks before reading `.records`:
```javascript
  async function _readEnvelope() {
    var c = _getChrome();
    if (!c || !c.storage || !c.storage.session || typeof c.storage.session.get !== 'function') {
      return { v: FSB_RUN_TASK_REGISTRY_PAYLOAD_VERSION, records: {} };
    }
    try {
      var stored = await c.storage.session.get([FSB_RUN_TASK_REGISTRY_STORAGE_KEY]);
      var payload = stored ? stored[FSB_RUN_TASK_REGISTRY_STORAGE_KEY] : null;
      if (!payload || typeof payload !== 'object') {
        return { v: FSB_RUN_TASK_REGISTRY_PAYLOAD_VERSION, records: {} };
      }
      if (payload.v !== FSB_RUN_TASK_REGISTRY_PAYLOAD_VERSION) {
        return { v: FSB_RUN_TASK_REGISTRY_PAYLOAD_VERSION, records: {} };
      }
      if (!payload.records || typeof payload.records !== 'object') {
        return { v: FSB_RUN_TASK_REGISTRY_PAYLOAD_VERSION, records: {} };
      }
      return payload;
    } catch (_e) {
      return { v: FSB_RUN_TASK_REGISTRY_PAYLOAD_VERSION, records: {} };
    }
  }
```

**`_writeEnvelope` -- empty-records-REMOVES-the-key discipline** (`mcp-task-store.js:97-120`) -- copy verbatim, swap constant names. This is the "no stale envelope sitting in storage forever" rule (D-01) and the load-bearing reason the store passes the `delete_snapshot_removes_key_when_empty` test:
```javascript
  async function _writeEnvelope(envelope) {
    var c = _getChrome();
    if (!c || !c.storage || !c.storage.session) return;
    try {
      var nextRecords = (envelope && envelope.records && typeof envelope.records === 'object')
        ? envelope.records : {};
      if (Object.keys(nextRecords).length === 0) {
        if (typeof c.storage.session.remove === 'function') {
          await c.storage.session.remove(FSB_RUN_TASK_REGISTRY_STORAGE_KEY);
        }
        return;
      }
      var toWrite = {};
      toWrite[FSB_RUN_TASK_REGISTRY_STORAGE_KEY] = {
        v: FSB_RUN_TASK_REGISTRY_PAYLOAD_VERSION,
        records: nextRecords
      };
      if (typeof c.storage.session.set === 'function') {
        await c.storage.session.set(toWrite);
      }
    } catch (_e) {
      // best-effort; do not throw
    }
  }
```

**Public CRUD API** (`mcp-task-store.js:128-175`) -- copy `writeSnapshot` / `readSnapshot` / `deleteSnapshot` / `hydrate` verbatim (param renamed `taskId` -> `triggerId`). Note the V5 input-validation no-op posture (`!string`/`!object` returns silently, never throws):
```javascript
  async function writeSnapshot(taskId, snapshot) {
    if (!taskId || typeof taskId !== 'string') return;
    if (!snapshot || typeof snapshot !== 'object') return;
    var envelope = await _readEnvelope();
    envelope.records[taskId] = snapshot;
    await _writeEnvelope(envelope);
  }

  async function readSnapshot(taskId) {
    if (!taskId || typeof taskId !== 'string') return null;
    var envelope = await _readEnvelope();
    return envelope.records[taskId] || null;
  }

  async function deleteSnapshot(taskId) {
    if (!taskId || typeof taskId !== 'string') return;
    var envelope = await _readEnvelope();
    if (!envelope.records[taskId]) return;
    delete envelope.records[taskId];
    await _writeEnvelope(envelope);
  }

  async function hydrate() {
    return await _readEnvelope();   // one-shot whole-envelope read; reconcile needs no N round-trips
  }
```

**ONLY API behavior change -- the list filter** (`mcp-task-store.js:162-167`):
```javascript
  async function listInFlightSnapshots() {
    var envelope = await _readEnvelope();
    return Object.keys(envelope.records)
      .map(function(k) { return envelope.records[k]; })
      .filter(function(s) { return s && s.status === 'in_progress'; });
  }
```
**CHANGE TO:** rename `listInFlightSnapshots` -> `listArmedSnapshots`, filter `s.status === 'armed'` (D-01 / RESEARCH Clone-Target A table). Used by reconcile to enumerate live triggers.

**Dual-export IIFE footer** (`mcp-task-store.js:177-194`) -- copy the shape verbatim; swap the export keys, the global name, and the constant names:
```javascript
  var exportsObj = {
    writeSnapshot: writeSnapshot,
    readSnapshot: readSnapshot,
    deleteSnapshot: deleteSnapshot,
    listInFlightSnapshots: listInFlightSnapshots,
    hydrate: hydrate,
    FSB_RUN_TASK_REGISTRY_STORAGE_KEY: FSB_RUN_TASK_REGISTRY_STORAGE_KEY,
    FSB_RUN_TASK_REGISTRY_PAYLOAD_VERSION: FSB_RUN_TASK_REGISTRY_PAYLOAD_VERSION
  };

  global.FsbMcpTaskStore = exportsObj;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```
**CHANGE TO:** `global.FsbTriggerStore = exportsObj;`, export `listArmedSnapshots` + the two `FSB_TRIGGER_REGISTRY_*` constants. The IIFE header `(function(global) { 'use strict';` (line 1-2) is copied as-is.

**Snapshot schema to document in the header doc-comment** (D-01, flat scalars only; snake_case per `mcp-task-store.js` convention). The store WRITES/READS/REAPS these but interprets none of them (Phase 15 populates/evaluates `condition`/`selector`/`baseline`/`last_value`):
```javascript
// records[trigger_id] =
{
  trigger_id, status,            // status: 'armed'|'fired'|'stopped'|'error'|'partial'
  watch, condition, selector,    // reserved -- stored verbatim, consumed Phase 15/16/17
  target_tab_id, agent_id,       // target_tab_id = onRemoved reap key; agent_id stored faithfully (V4, Phase 18 enforces)
  baseline, last_value,          // reserved -- Phase 15 populates
  last_evaluated_at, armed_at, fired_at,
  deadline_at,                   // = armed_at + FSB_TRIGGER_DEFAULT_TTL_MS (TTL reap key)
  alarm_name                     // 'fsbTrigger:<trigger_id>' (denormalized for orphan matching)
}
```

---

### `extension/utils/trigger-lifecycle.js` (service/lifecycle, event-driven + batch)

**Analog:** `extension/utils/mcp-visual-session-lifecycle.js` (643 lines) -- clone the alarm/restore/reap/handler SHAPE; **STRIP all overlay-broadcast coupling**; add the `getAll()` orphan sweep; swap the per-tab-storage-key shape for `FsbTriggerStore` calls.

> **CRITICAL STRIP LIST (visual feedback is Phase 16, NOT 14 -- ship zero overlay code):**
> Do NOT copy any of these from the template:
> - `getVisualSessionUtils()` / the `MCPVisualSessionUtils` dependency (`:114-120`)
> - `composeSessionShapeFromEntry` (`:212-231`), `broadcastRunningStatus` (`:241-256`), `broadcastClearStatus` (`:268-283`)
> - `normalizeVisualReason` (`:290-292`), and every `sendSessionStatus` call site
> - the `client` / `visualReason` / `isFinal` / `driver` fields and the agent-mismatch belt-and-suspenders in the tick path
> - `recordVisualSessionTick` itself (the ARM path) -- arming lives in Phase 15's trigger-manager (D-06); planner may instead expose a thin fire-logic-free `armTrigger`/`clearTrigger` (Claude's discretion, see Open Q1)

**Constants + 30s-floor note** (`mcp-visual-session-lifecycle.js:58-79`):
```javascript
  var MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX = 'mcpVisualSession:';   // DROP -- trigger uses single envelope key, not per-entity key (D-01)
  var MCP_VISUAL_LIFECYCLE_ALARM_PREFIX = 'mcpVisualDeath:';            // -> TRIGGER_ALARM_PREFIX = 'fsbTrigger:' (D-03)
  var MCP_VISUAL_LIFECYCLE_DEATH_MS = 60000;                           // -> FSB_TRIGGER_DEFAULT_TTL_MS = 21600000 (6h, D-11)
```
**CHANGE:** DROP the storage-key prefix entirely (the trigger store owns the key). Keep `TRIGGER_ALARM_PREFIX = 'fsbTrigger:'`. Replace the 60s death constant with `FSB_TRIGGER_DEFAULT_TTL_MS = 21600000` (6h, single named const per D-11). Also ship a `TRIGGER_ALARM_MIN_PERIOD_*` 30s-floor const (exported `var`) per D-03 -- Phase 17 enforces it; Phase 14 only declares it.

**Alarm-name composer** (`mcp-visual-session-lifecycle.js:97-101`) -- clone, adapt the guard from finite-positive-INTEGER to non-empty STRING id:
```javascript
  function alarmNameForTab(tabId) {
    var numericTabId = Number(tabId);
    if (!Number.isFinite(numericTabId) || numericTabId <= 0) return null;
    return MCP_VISUAL_LIFECYCLE_ALARM_PREFIX + String(numericTabId);
  }
```
**CHANGE TO:** `alarmNameForTrigger(triggerId)` -> returns `null` on non-string/empty id, else `TRIGGER_ALARM_PREFIX + triggerId`. DROP `storageKeyForTab` (`:86-90`) -- not needed; the store owns keying.

**Alarm wrappers (best-effort no-throw)** (`mcp-visual-session-lifecycle.js:176-200`) -- copy `clearAlarm` + `createAlarm` VERBATIM. These are the only alarm surface (no `setInterval` -- SURV-01/Pitfall 2&3):
```javascript
  async function clearAlarm(name) {
    if (typeof chrome === 'undefined' || !chrome.alarms || typeof chrome.alarms.clear !== 'function') return false;
    try {
      await chrome.alarms.clear(name);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function createAlarm(name, alarmInfo) {
    if (typeof chrome === 'undefined' || !chrome.alarms || typeof chrome.alarms.create !== 'function') return false;
    try {
      await chrome.alarms.create(name, alarmInfo);   // pass { when: deadline_at } for one-shot TTL/wake (see :399)
      return true;
    } catch (_error) {
      return false;
    }
  }
```
> The arm call shape to use is `{ when: deadline_at }` -- a one-shot TTL/wake alarm, exactly as the
> template arms it at `mcp-visual-session-lifecycle.js:399` (`createAlarm(alarmName, { when: deadlineAt })`).
> Phase 17 (refresh-poll) will later pass `{ periodInMinutes }` honoring the 30s floor; Phase 14 ships only the one-shot.

> **chrome-ref idiom note:** the visual lifecycle reads `chrome` directly via `typeof chrome === 'undefined'`
> guards inside each wrapper (`:127-128, :145, :162, :177, :193`), NOT via `_getChrome()`. Recommend the
> trigger LIFECYCLE match the STORE's `_getChrome()` idiom for cross-module consistency (both Node-mock-testable).

**Idempotent tick handler -- the SURV-02 / duplicate-fire guard** (`mcp-visual-session-lifecycle.js:494-539`). This is the core re-read-storage-every-tick pattern (D-09); copy the prefix-guard + slice + read + `noop_no_entry` + malformed-best-effort-clear + reschedule shape:
```javascript
  async function handleVisualSessionLifecycleAlarm(alarm) {
    if (!alarm || typeof alarm !== 'object' || typeof alarm.name !== 'string') {
      return { ok: false, reason: 'not_our_alarm' };
    }
    if (alarm.name.indexOf(MCP_VISUAL_LIFECYCLE_ALARM_PREFIX) !== 0) {
      return { ok: false, reason: 'not_our_alarm' };
    }

    var suffix = alarm.name.slice(MCP_VISUAL_LIFECYCLE_ALARM_PREFIX.length);
    var tabId = Number(suffix);
    if (!Number.isFinite(tabId) || tabId <= 0) {
      return { ok: false, reason: 'malformed_alarm_name' };
    }

    var storageKey = storageKeyForTab(tabId);
    if (!storageKey) {
      return { ok: false, reason: 'malformed_alarm_name' };
    }

    var entry = await readStorageEntry(storageKey);
    if (!entry) {
      // stale alarm with no backing storage entry; the clear path ran via another route
      return { ok: true, action: 'noop_no_entry' };
    }

    var now = Date.now();
    var deadlineAt = Number(entry.deadlineAt);
    if (!Number.isFinite(deadlineAt)) {
      await clearVisualSession(tabId, { reason: 'malformed_entry' });
      return { ok: true, action: 'cleared', entry: entry, reason: 'malformed_entry' };
    }

    if (now >= deadlineAt) {
      await clearVisualSession(tabId, { reason: 'timeout' });
      return { ok: true, action: 'cleared', entry: entry };
    }

    var alarmName = alarmNameForTab(tabId);
    await createAlarm(alarmName, { when: deadlineAt });
    return { ok: true, action: 'rescheduled', entry: entry, remainingMs: deadlineAt - now };
  }
```
**CHANGE TO `handleTriggerAlarm(alarm)`:**
- parse `triggerId = alarm.name.slice(TRIGGER_ALARM_PREFIX.length)`; guard `!triggerId` -> `malformed_alarm_name` (string id, not numeric tab parse).
- `snap = await FsbTriggerStore.readSnapshot(triggerId)` (re-read STORAGE, never SW heap).
- `if (!snap) return { ok:true, action:'noop_no_entry' }` (D-09).
- **ADD a terminal-status guard the visual template lacks:** `if (snap.status === 'fired' || snap.status === 'stopped') return { ok:true, action:'noop_terminal' }` -- the idempotent fire-guard (D-09, Pitfall #16; mirrors `noop_no_entry`).
- TTL reap: `if (Number.isFinite(snap.deadline_at) && now >= snap.deadline_at) { await FsbTriggerStore.deleteSnapshot(triggerId); await clearAlarm(alarm.name); return { ok:true, action:'reaped_ttl' }; }` (LIFE-05 reap path a).
- where the template returns `'rescheduled'`, the trigger handler returns `{ ok:true, action:'evaluated_noop' }` -- **Phase 15 plugs the evaluate-and-fire step in HERE.** Phase 14 ships only the survivable re-read scaffold; do NOT add comparison operators.

**Clear/reap primitive** (`mcp-visual-session-lifecycle.js:427-453`) -- clone the structure but STRIP the `broadcastClearStatus` call (`:445-447`); the trigger clear is delete-entry + clear-alarm only:
```javascript
  async function clearVisualSession(tabId, options) {
    var storageKey = storageKeyForTab(tabId);
    var alarmName = alarmNameForTab(tabId);
    if (!storageKey || !alarmName) {
      return { ok: false, reason: 'invalid_tab_id' };
    }
    // ... reason/skipBroadcast parsing ...
    var entry = await readStorageEntry(storageKey);
    if (!entry) {
      await clearAlarm(alarmName);          // safety: clear alarm even when entry already gone
      return { ok: true, action: 'noop' };
    }
    if (!skipBroadcast) {
      await broadcastClearStatus(entry, reason);   // <-- STRIP THIS for triggers (Phase 16 owns broadcast)
    }
    await deleteStorageEntry(storageKey);
    await clearAlarm(alarmName);
    return { ok: true, action: 'cleared', entry: entry };
  }
```
**CHANGE TO `clearTrigger(triggerId)` (or inline):** `await FsbTriggerStore.deleteSnapshot(triggerId); await clearAlarm(TRIGGER_ALARM_PREFIX + triggerId);` -- no broadcast, no reason-string ceremony.

**Tab-close reap** (`mcp-visual-session-lifecycle.js:464-466`). KEY DIVERGENCE: the visual lifecycle clears ONE entry because its storage key IS the tabId; the trigger store must SCAN `records` for every snapshot whose `target_tab_id` matches (D-10c):
```javascript
  async function handleVisualSessionLifecycleTabRemoved(tabId) {
    return clearVisualSession(tabId, { reason: 'tab_closed', skipBroadcast: true });
  }
```
**CHANGE TO `handleTriggerTabRemoved(tabId)`** -- hydrate, scan, reap-all-matching (per RESEARCH Code Examples):
```javascript
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

**Reconcile core -- re-arm-with-ORIGINAL-deadline** (`mcp-visual-session-lifecycle.js:564-628`). This is the SURV-03 base. Note it uses `chrome.storage.session.get(null)` + per-tab-key iteration -- the trigger version REPLACES that with a single `FsbTriggerStore.hydrate()` and adds the `getAll()` orphan sweep:
```javascript
  async function restoreVisualSessionLifecyclesFromStorage() {
    var counters = { restored: 0, cleared: 0, dropped: 0 };
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session) {
      return Object.assign({ ok: true }, counters);
    }
    var bag = null;
    try {
      bag = await chrome.storage.session.get(null);          // <-- trigger version: FsbTriggerStore.hydrate() instead
    } catch (_error) {
      return Object.assign({ ok: false, reason: 'storage_read_failed' }, counters);
    }
    // ...
    var now = Date.now();
    var keys = Object.keys(bag);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key.indexOf(MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX) !== 0) continue;   // <-- trigger version: iterate envelope.records
      var entry = bag[key];
      // ... malformed-detection block (:592-602) -> drop via deleteStorageEntry, counters.dropped++ ...
      if (malformed) {
        await deleteStorageEntry(key);
        counters.dropped += 1;
        continue;
      }
      var entryDeadlineAt = Number(entry.deadlineAt);
      var entryTabIdNumber = Number(entry.tabId);
      if (now >= entryDeadlineAt) {
        await clearVisualSession(entryTabIdNumber, { reason: 'timeout' });   // <-- trigger: deleteSnapshot + clearAlarm (no broadcast)
        counters.cleared += 1;
      } else {
        var alarmNameRestore = alarmNameForTab(entryTabIdNumber);
        await createAlarm(alarmNameRestore, { when: entryDeadlineAt });      // re-arm ORIGINAL deadline (TIMEOUT-04 / SURV-03)
        counters.restored += 1;
      }
    }
    return Object.assign({ ok: true }, counters);
  }
```
**CHANGE TO `restoreTriggersFromStorage()` (D-08 -- the ONE genuinely-new piece):**
- `var envelope = await FsbTriggerStore.hydrate();` instead of `get(null)` + prefix-filter; iterate `Object.keys(envelope.records)`.
- counters `{ restored, reaped, dropped, orphans_cleared }`.
- malformed = `!snap || typeof snap !== 'object' || !Number.isFinite(Number(snap.deadline_at))` -> `deleteSnapshot` + `clearAlarm` + `dropped++`.
- drop terminal/expired: `if (snap.status !== 'armed' || now >= Number(snap.deadline_at))` -> `deleteSnapshot` + `clearAlarm` + `reaped++`.
- else re-arm: `await createAlarm(TRIGGER_ALARM_PREFIX + id, { when: Number(snap.deadline_at) })` + `restored++` (ORIGINAL deadline).
- **ADD the orphan sweep (no template equivalent):** before/around the loop, `var alarms = []; try { alarms = await chrome.alarms.getAll(); } catch(_e){}`; collect `liveAlarmNames`; build `snapshotAlarmNames` while iterating; then for each live alarm whose name `startsWith(TRIGGER_ALARM_PREFIX)` AND is not in `snapshotAlarmNames` -> `clearAlarm(name)` + `orphans_cleared++`. Use a `for` loop (not `forEach` with `await`) to match the template's ordered-await style (`:584-625`). This kills "alarm into the void" (ROADMAP criterion 3).

**Export footer** (`mcp-visual-session-lifecycle.js:630-642`) -- clone the dual-export shape; swap names; DROP `recordVisualSessionTick` (unless exposing a fire-free `armTrigger`); add the new constants:
```javascript
  var exportsObj = {
    MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX: MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX,
    MCP_VISUAL_LIFECYCLE_ALARM_PREFIX: MCP_VISUAL_LIFECYCLE_ALARM_PREFIX,
    MCP_VISUAL_LIFECYCLE_DEATH_MS: MCP_VISUAL_LIFECYCLE_DEATH_MS,
    recordVisualSessionTick: recordVisualSessionTick,
    clearVisualSession: clearVisualSession,
    handleVisualSessionLifecycleTabRemoved: handleVisualSessionLifecycleTabRemoved,
    handleVisualSessionLifecycleAlarm: handleVisualSessionLifecycleAlarm,
    restoreVisualSessionLifecyclesFromStorage: restoreVisualSessionLifecyclesFromStorage
  };
```
**CHANGE TO:** export `TRIGGER_ALARM_PREFIX`, `FSB_TRIGGER_DEFAULT_TTL_MS`, (30s-floor const), `alarmNameForTrigger`, `handleTriggerAlarm`, `handleTriggerTabRemoved`, `restoreTriggersFromStorage`, plus optional `armTrigger`/`clearTrigger`. Then `global.FsbTriggerLifecycle = exportsObj;` + the `if (typeof module !== 'undefined' && module.exports)` block. The glue points (below) reference `FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX`, `.handleTriggerAlarm`, `.restoreTriggersFromStorage`, `.handleTriggerTabRemoved` -- keep these names aligned.

---

### `extension/background.js` (config/SW glue, event-driven) -- 3 glue points, ALL additive

> All four edits are ADDITIVE -- no existing branch is modified. Each new branch mirrors the
> verified visual-lifecycle sibling exactly. Load order matters: store BEFORE lifecycle.

**Glue point 0 -- importScripts region** (`background.js:22-34`, verified). The visual lifecycle loads at `:23`, the task store at `:34`:
```javascript
importScripts('utils/mcp-visual-session.js');
importScripts('utils/mcp-visual-session-lifecycle.js');                                                       // :23
try { importScripts('utils/agent-registry.js'); } catch (e) { console.error('[FSB] Failed to load agent-registry.js:', e.message); }
// ...
try { importScripts('utils/mcp-task-store.js'); } catch (e) { console.error('[FSB] Failed to load mcp-task-store.js:', e.message); }   // :34
```
**ADD (store first, since lifecycle calls `FsbTriggerStore`):**
```javascript
try { importScripts('utils/trigger-store.js'); }     catch (e) { console.error('[FSB] Failed to load trigger-store.js:', e.message); }
try { importScripts('utils/trigger-lifecycle.js'); } catch (e) { console.error('[FSB] Failed to load trigger-lifecycle.js:', e.message); }
```

**Glue point 1 -- bootstrap restore** (`background.js:2485-2498`, verified). The visual restore sits inside the bootstrap async fn right after `restorePersistedMcpVisualSessions()` (`:2485`):
```javascript
    await restorePersistedMcpVisualSessions();

    // Phase 256 Plan 03 -- restore implicit visual-session lifecycles after MV3 SW eviction. [...]
    if (typeof MCPVisualSessionLifecycleUtils !== 'undefined'
        && typeof MCPVisualSessionLifecycleUtils.restoreVisualSessionLifecyclesFromStorage === 'function') {
      MCPVisualSessionLifecycleUtils.restoreVisualSessionLifecyclesFromStorage()
        .catch((err) => {
          console.warn('[FSB MCP] restoreVisualSessionLifecyclesFromStorage failed (non-blocking):', err && err.message);
        });
    }
```
**ADD beside it** (same guard-then-call-then-non-blocking-catch shape, D-07.2):
```javascript
    if (typeof FsbTriggerLifecycle !== 'undefined'
        && typeof FsbTriggerLifecycle.restoreTriggersFromStorage === 'function') {
      FsbTriggerLifecycle.restoreTriggersFromStorage()
        .catch((err) => console.warn('[FSB TRG] restoreTriggersFromStorage failed (non-blocking):', err && err.message));
    }
```

**Glue point 2 -- onAlarm prefix branch** (`background.js:13284-13301`, verified). The single `onAlarm` listener fans out by `alarm.name.startsWith(<PREFIX>)` with an early `return` per concern; the `mcpVisualDeath:` branch is the exact template:
```javascript
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Phase 256 Plan 03 -- visual-session sliding-window death-timer alarm. [...]
  if (typeof MCPVisualSessionLifecycleUtils !== 'undefined'
      && alarm
      && typeof alarm.name === 'string'
      && alarm.name.startsWith(MCPVisualSessionLifecycleUtils.MCP_VISUAL_LIFECYCLE_ALARM_PREFIX)) {
    try {
      await MCPVisualSessionLifecycleUtils.handleVisualSessionLifecycleAlarm(alarm);
    } catch (err) {
      console.warn('[FSB MCP] handleVisualSessionLifecycleAlarm failed (non-blocking):', err && err.message);
    }
    return;
  }
  // ... telemetry-beat / reconnect / dom-stream-watchdog branches follow ...
```
**ADD as a new branch with an early `return`** (place it beside the visual branch; `fsbTrigger:` joins the existing prefixes -- D-03 / D-07.1):
```javascript
  if (typeof FsbTriggerLifecycle !== 'undefined'
      && alarm && typeof alarm.name === 'string'
      && alarm.name.startsWith(FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX)) {       // 'fsbTrigger:'
    try { await FsbTriggerLifecycle.handleTriggerAlarm(alarm); }
    catch (err) { console.warn('[FSB TRG] handleTriggerAlarm failed (non-blocking):', err && err.message); }
    return;
  }
```

**Glue point 3 -- new tabs.onRemoved listener** (`background.js:13169-13176`, verified). FSB registers MULTIPLE independent `onRemoved` listeners per concern (the comment cites siblings at lines 2526, 2584, 12826); add a new one:
```javascript
chrome.tabs.onRemoved.addListener((tabId) => {
  if (typeof MCPVisualSessionLifecycleUtils === 'undefined') return;
  if (typeof MCPVisualSessionLifecycleUtils.handleVisualSessionLifecycleTabRemoved !== 'function') return;
  Promise.resolve(MCPVisualSessionLifecycleUtils.handleVisualSessionLifecycleTabRemoved(tabId))
    .catch((err) => {
      console.warn('[FSB MCP] handleVisualSessionLifecycleTabRemoved failed (non-blocking):', err && err.message);
    });
});
```
**ADD a sibling listener** (same guard-then-promise-then-non-blocking-catch shape -- D-07.3 / D-10c):
```javascript
chrome.tabs.onRemoved.addListener((tabId) => {
  if (typeof FsbTriggerLifecycle === 'undefined') return;
  if (typeof FsbTriggerLifecycle.handleTriggerTabRemoved !== 'function') return;
  Promise.resolve(FsbTriggerLifecycle.handleTriggerTabRemoved(tabId))
    .catch((err) => console.warn('[FSB TRG] handleTriggerTabRemoved failed (non-blocking):', err && err.message));
});
```

---

### `tests/trigger-store.test.js` (test, CRUD assertions)

**Analog:** `tests/mcp-task-store.test.js` (207 lines, 10 cases) -- clone the structure; swap module path, key, fns, snapshot factory.

**Scaffolding to clone** (`mcp-task-store.test.js:16-54`):
- `const harness = require('./fixtures/run-task-harness');` + `harness.installChromeMock()` / `.restore()` per case (the storage mock).
- `freshRequireStore()` (`:35-40`) -- the cache-bust idiom that makes the lazy `_getChrome()` resolve against the freshly-installed mock:
```javascript
function freshRequireStore() {
  try { delete require.cache[require.resolve(STORE_MODULE_PATH)]; } catch (_e) { /* not yet exists */ }
  return require(STORE_MODULE_PATH);
}
```
- `makeSnapshot(overrides)` factory (`:42-54`) -- rebuild with the trigger schema (`trigger_id`, `status:'armed'`, `target_tab_id`, `deadline_at`, ...).
- `runTest(name, fn)` + `passed`/`failed` counters + `process.exit(failed > 0 ? 1 : 0)` (`:25-33`, `:199-206`).

**10-case structure to mirror** (`:59-197`), trigger-adapted:
| Template case | Trigger equivalent |
|---------------|--------------------|
| `module_exports` (:59) | assert `writeSnapshot/readSnapshot/deleteSnapshot/listArmedSnapshots/hydrate` fns + `FSB_TRIGGER_REGISTRY_STORAGE_KEY === 'fsbTriggerRegistry'` + version `1` |
| `write_envelope_v1` (:75) | assert stored shape `{ fsbTriggerRegistry: { v:1, records:{ <id>: snap } } }` |
| `read_unknown_returns_null` (:90) | unchanged semantics |
| `read_round_trip` (:101) | unchanged semantics |
| `list_in_flight` (:114) | rename `list_armed`; seed `armed`/`fired`/`stopped`; assert only `armed` returned |
| `delete_snapshot_removes_key_when_empty` (:129) | THE empty-removes-key assertion (`stored deepStrictEqual {}`) |
| `delete_snapshot_keeps_key_when_others_exist` (:142) | unchanged semantics |
| `hydrate_returns_records` (:157) | unchanged semantics |
| `version_mismatch_returns_empty` (:171) | seed `{v:99,...}`; assert canonical empty `{v:1,records:{}}` |
| `chrome_unavailable_no_throw` (:184) | delete `globalThis.chrome`; assert no-throw + `readSnapshot` returns null |

---

### `tests/trigger-lifecycle.test.js` (test, event-driven assertions)

**Analog:** `tests/mcp-visual-tick-lifecycle.test.js` -- clone the `createChromeMock()` (already fakes `alarms.create/clear/getAll` + introspection) and the harness; cover the lifecycle behaviors.

**`createStorageArea()` + `createChromeMock()` to clone VERBATIM** (`mcp-visual-tick-lifecycle.test.js:58-124`). Critically, the alarm mock ALREADY implements `getAll()`, `_created()`, `_createHistory()`, `_cleared()` -- exactly what the orphan-sweep + re-arm + duplicate-fire assertions need:
```javascript
function createChromeMock() {
  const session = createStorageArea();
  const alarms = new Map();
  const cleared = [];
  const createHistory = [];
  return {
    storage: { session },
    alarms: {
      async create(name, options) {
        const record = Object.assign({ name }, options || {});
        alarms.set(name, record);
        createHistory.push(record);
      },
      async clear(name) {
        cleared.push(name);
        alarms.delete(name);
        return true;
      },
      async getAll() {
        return Array.from(alarms.values());
      },
      _created() { return Array.from(alarms.values()); },
      _createHistory() { return createHistory.slice(); },
      _cleared() { return cleared.slice(); }
    }
  };
}
```
> The template's harness also installs a fake `sendSessionStatus` on the Node global (`:126-130+`) so the
> overlay broadcast doesn't crash -- the trigger tests DROP that entirely (no broadcast in Phase 14).
> Time is `Date.now()` only; use explicit epoch numbers, or stub via `installVirtualClock` from
> `tests/fixtures/run-task-harness.js` if a case needs deterministic time.

**Cases to cover** (per RESEARCH Validation Architecture -> Wave 0; the analog's case map A-L is the shape to follow):
- `handleTriggerAlarm`: missing-snapshot -> `noop_no_entry`; `fired`/`stopped` snapshot -> `noop_terminal` (call twice, assert second is no-op, `_cleared()` did not double-fire -> Pitfall #16); `now >= deadline_at` -> `reaped_ttl` (LIFE-05 a); armed-not-elapsed -> `evaluated_noop`.
- `restoreTriggersFromStorage`: armed-not-elapsed re-armed with ORIGINAL `when` (assert via `_created()`/`getAll()`); `fired`/`stopped`/expired dropped (delete + `_cleared()`); **orphan `fsbTrigger:*` alarm seeded with no backing snapshot -> cleared** (SURV-03 / D-08); expired-armed dropped on boot (LIFE-05 b).
- `handleTriggerTabRemoved`: seed three snapshots (two `target_tab_id:42`, one `:99`), call with `42`, assert exactly two reaped and `:99` survives (LIFE-05 c).
- static assert: the lifecycle module source contains NO `setInterval`/keepalive (SURV-01 / Pitfall #3) -- only `chrome.alarms`.

**Wire into CI:** append BOTH `node tests/trigger-store.test.js` and `node tests/trigger-lifecycle.test.js` to the `"test"` `&&` chain in `package.json` -- a new file not appended is silently never run by CI (~150-entry chain).

---

## Shared Patterns

### Dual-export IIFE (applies to BOTH new modules)
**Source:** `extension/utils/mcp-task-store.js:1-2, 189-194` and `mcp-visual-session-lifecycle.js:51-52, 632-642`
```javascript
(function(global) {
  'use strict';
  // ... constants + private helpers + public fns ...
  var exportsObj = { /* public surface */ };
  global.FsbTriggerStore = exportsObj;          // (or FsbTriggerLifecycle) -- SW importScripts consumer
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                 // Node test consumer
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```
The `global.X = exportsObj` name MUST match what the `background.js` glue points reference
(`FsbTriggerStore`, `FsbTriggerLifecycle`) and what the lifecycle module calls on the store.

### Best-effort no-throw posture (applies to both modules + all glue)
**Source:** `mcp-task-store.js:88-90, 117-119`; `mcp-visual-session-lifecycle.js:127-200`; glue `.catch` at `background.js:2495, 13174, 13298`
Every storage/alarm call is wrapped in try/catch; a persistence/alarm failure must NEVER crash the SW or
block a resolve path. Every glue-point invocation ends in a non-blocking `.catch((err) => console.warn(...))`.

### Storage-is-truth, re-read every tick (SURV-02)
**Source:** `mcp-visual-session-lifecycle.js:494-539` (the re-read-then-decide handler)
**Apply to:** `handleTriggerAlarm`, `handleTriggerTabRemoved`, `restoreTriggersFromStorage` -- always read from
`chrome.storage.session` (via `FsbTriggerStore`), never trust SW heap. The Node test simulates eviction simply
by discarding in-memory refs between handler calls.

### V5 input-validation no-op (applies to store + handlers)
**Source:** `mcp-task-store.js:128-130` (silently return on `!string`/`!object`); `mcp-visual-session-lifecycle.js:495-506` (typed `not_our_alarm`/`malformed_alarm_name`); `:590-608` (drop malformed entries in restore)
**Apply to:** all public store fns + the three lifecycle entrypoints. Drop/no-op on bad input; never throw out
of the SW glue. Store `agent_id` faithfully (V4 -- Phase 18 enforces ownership; Phase 14 must not normalize it away).

---

## No Analog Found

None. Every Phase-14 file has a named, in-tree clone target read in full this session.

The ONE piece without a direct template excerpt is the **`chrome.alarms.getAll()` orphan-alarm sweep** inside
`restoreTriggersFromStorage` (D-08). It is genuinely new code (verified: no live `getAll()` call exists in the
SW today -- only commented-out references at `agent-scheduler.js:153,451`). RESEARCH.md "Pattern 2" supplies the
exact algorithm: build `liveAlarmNames` from `getAll()`, build `snapshotAlarmNames` while iterating the envelope,
then clear any `fsbTrigger:*` alarm present in the former but absent from the latter. It grafts onto the
verified visual-lifecycle restore skeleton (`:564-628`); only the sweep itself is new.

---

## Metadata

**Analog search scope:** `extension/utils/` (clone targets), `extension/background.js` (glue), `tests/` (test templates) -- all pre-named in CONTEXT.md canonical_refs; no broad search needed (early-stop at the 5 named analogs).
**Files scanned/read this session:** `mcp-task-store.js` (full), `mcp-task-store.test.js` (full), `mcp-visual-session-lifecycle.js` (full, in non-overlapping targeted reads), `mcp-visual-tick-lifecycle.test.js` (:1-130), `background.js` (4 targeted glue ranges) + 3 grep verifications (getAll novelty, key/prefix collision, INV-04).
**All line numbers verified** against branch `automation-worktree` this session and match RESEARCH.md.
**Pattern extraction date:** 2026-06-15
