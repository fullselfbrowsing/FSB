# Phase 17: Refresh-Poll Watch (Tab-Owning Background Reload) - Pattern Map

**Mapped:** 2026-06-16  
**Files analyzed:** 10 target entries (9 likely required, 1 optional helper extraction)  
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `extension/background.js` | service worker controller/helper | event-driven + request-response + Chrome tab I/O | `extension/background.js` trigger helper block | exact |
| `extension/content/messaging.js` | content message router | request-response | `extension/content/messaging.js` `triggerRead` / pulse cases | exact |
| `extension/content/trigger-observe.js` | content utility | transform + DOM read + event-driven report | `extension/content/trigger-observe.js` `readValue` / `resolveLeaf` / `start` | exact |
| `extension/utils/trigger-lifecycle.js` | lifecycle service | event-driven + storage CRUD | `extension/utils/trigger-lifecycle.js` alarm lifecycle | exact |
| `extension/utils/trigger-manager.js` | service/model | transform + storage-backed arm CRUD | `extension/utils/trigger-manager.js` `evaluate` / `armTrigger` | exact |
| `extension/utils/trigger-store.js` | persistence model/service | CRUD | `extension/utils/trigger-store.js` versioned session envelope | exact |
| `extension/utils/trigger-refresh-poll.js` (optional) | utility/service | event-driven + request-response + Chrome tab I/O | `extension/utils/trigger-lifecycle.js` + `extension/background.js` helpers | role-match |
| `tests/trigger-refresh-poll.test.js` | test | event-driven + request-response + Chrome API mocks | `tests/trigger-lifecycle.test.js` + `tests/trigger-observe.test.js` + `tests/foreground-audit.test.js` | role-match |
| `tests/trigger-observe.test.js` | test | transform + content VM mocks | `tests/trigger-observe.test.js` | exact |
| `package.json` | config | batch | `package.json` explicit `node tests/*.test.js` chain | exact |

## Pattern Assignments

### `extension/background.js` (service worker controller/helper, event-driven + request-response + Chrome tab I/O)

**Analog:** `extension/background.js`

**ImportScripts/load-order pattern** (lines 35-50):
```javascript
try { importScripts('utils/value-extractor.js'); } catch (e) { console.error('[FSB] Failed to load value-extractor.js:', e.message); }
try { importScripts('utils/trigger-store.js'); } catch (e) { console.error('[FSB] Failed to load trigger-store.js:', e.message); }
try { importScripts('utils/trigger-manager.js'); } catch (e) { console.error('[FSB] Failed to load trigger-manager.js:', e.message); }
try { importScripts('utils/trigger-lifecycle.js'); } catch (e) { console.error('[FSB] Failed to load trigger-lifecycle.js:', e.message); }
```

**Content bundle ordering pattern** (lines 263-286):
```javascript
const CONTENT_SCRIPT_FILES = [
  'utils/diagnostics-ring-buffer.js',
  'utils/redactForLog.js',
  'utils/automation-logger.js',
  'content/init.js',
  'content/utils.js',
  'content/dom-state.js',
  'content/selectors.js',
  'content/badge-combine.js',
  'content/visual-feedback.js',
  'content/trigger-observe.js',
  'content/accessibility.js',
  'content/actions.js',
  'content/dom-analysis.js',
  'content/messaging.js',
  'content/lifecycle.js'
];
```

**Trigger helper placement and message shape** (lines 3398-3479):
```javascript
function fsbTriggerSnapshotId(snap) {
  return snap && typeof snap.trigger_id === 'string' && snap.trigger_id ? snap.trigger_id : null;
}

function fsbTriggerExtractKind(snap) {
  const condition = snap && snap.condition && typeof snap.condition === 'object' ? snap.condition : {};
  return snap.extract || condition.extract || 'text';
}

async function fsbTriggerSendTabMessage(tabId, payload) {
  if (!Number.isFinite(Number(tabId)) || !chrome.tabs || typeof chrome.tabs.sendMessage !== 'function') {
    return { ok: false, reason: 'tabs_unavailable' };
  }
  try {
    await chrome.tabs.sendMessage(Number(tabId), payload);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'send_failed', error: err && err.message ? err.message : String(err) };
  }
}

async function fsbTriggerStartObserveForSnapshot(snap, reason) {
  const triggerId = fsbTriggerSnapshotId(snap);
  const tabId = Number(snap && snap.target_tab_id);
  if (!triggerId || !Number.isFinite(tabId) || !snap.selector) {
    return { ok: false, reason: 'invalid_snapshot' };
  }
  await ensureContentScriptInjected(tabId);
  const observeResult = await fsbTriggerSendTabMessage(tabId, fsbTriggerObserveMessage(snap));
  const pulseResult = await fsbTriggerSendTabMessage(tabId, {
    action: 'triggerPulseStart',
    selector: snap.selector,
    reason: reason || 'trigger-watch'
  });
  await fsbTriggerArmObserveWatchdog(triggerId);
  return { ok: observeResult.ok !== false, observe: observeResult, pulse: pulseResult };
}
```

**Storage-first evaluation seam** (lines 3502-3549):
```javascript
async function fsbTriggerHandleValueReport(request, sender) {
  const triggerId = request && typeof request.trigger_id === 'string' ? request.trigger_id : null;
  if (!triggerId) return { ok: false, reason: 'invalid_trigger_id' };

  const snap = await FsbTriggerStore.readSnapshot(triggerId);
  if (!snap || snap.status !== 'armed') {
    return { ok: true, ignored: true };
  }

  const value = request.value && typeof request.value === 'object' ? request.value : {};
  const now = Date.now();
  snap.reported_value = (typeof value.text === 'string')
    ? value.text.slice(0, FSB_TRIGGER_REPORTED_TEXT_MAX)
    : snap.last_value;
  const attrs = fsbTriggerCopyReportedAttributes(value.attributes);
  if (attrs) snap.reported_attributes = attrs;
  snap.last_reported_at = now;
  await FsbTriggerStore.writeSnapshot(triggerId, snap);

  let seamResult = { ok: false, reason: 'lifecycle_unavailable' };
  if (typeof FsbTriggerLifecycle !== 'undefined'
      && FsbTriggerLifecycle
      && typeof FsbTriggerLifecycle.handleTriggerAlarm === 'function'
      && FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX) {
    seamResult = await FsbTriggerLifecycle.handleTriggerAlarm({
      name: FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX + triggerId
    });
  }

  return { ok: true, result: seamResult };
}
```

**Alarm fan-out pattern** (lines 13595-13643):
```javascript
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (typeof FsbTriggerLifecycle !== 'undefined'
      && alarm
      && typeof alarm.name === 'string'
      && alarm.name.startsWith(FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX)) {
    try {
      await FsbTriggerLifecycle.handleTriggerAlarm(alarm);
    } catch (err) {
      console.warn('[FSB TRG] handleTriggerAlarm failed (non-blocking):', err && err.message);
    }
    return;
  }

  if (alarm
      && typeof alarm.name === 'string'
      && alarm.name.startsWith(FSB_TRIGGER_OBSERVE_WATCHDOG_PREFIX)) {
    try {
      await fsbTriggerHandleObserveWatchdog(alarm);
    } catch (err) {
      console.warn('[FSB TRG] live-observe watchdog failed (non-blocking):', err && err.message);
    }
    return;
  }
});
```

**Blocked/restricted URL classifier** (lines 2974-3020):
```javascript
function isRestrictedURL(url) {
  if (!url) return true;

  const restrictedProtocols = [
    'chrome://',
    'chrome-extension://',
    'moz-extension://',
    'edge://',
    'about:',
    'file://'
  ];

  const restrictedPages = [
    'chrome://extensions/',
    'chrome://settings/',
    'chrome://newtab/',
    'chrome://history/',
    'chrome://bookmarks/',
    'chrome://downloads/',
    'chrome://flags/',
    'chrome://version/',
    'chrome://webstore/',
    'edge://extensions/',
    'edge://settings/',
    'about:blank',
    'about:newtab'
  ];

  if (restrictedPages.some(page => url.startsWith(page))) {
    return true;
  }

  return restrictedProtocols.some(protocol => url.startsWith(protocol));
}
```

**Anti-pattern to avoid: generic retry focuses tabs** (lines 3998-4090):
```javascript
async function sendMessageWithRetry(tabId, message, maxRetries = 3) {
  // ...
  if (failureType === FAILURE_TYPES.BF_CACHE) {
    // ...
    try {
      await chrome.tabs.update(tabId, { active: true });
      const wakeResult = await pageLoadWatcher.waitForPageReady(tabId, {
        maxWait: 2000,
        requireDOMStable: false
      });
      automationLogger.logRecovery(null, 'bfcache', 'wake_tab', wakeResult.success ? 'success' : 'failed', { tabId, waitTime: wakeResult.waitTime, method: wakeResult.method });
    } catch (e) {
      automationLogger.logRecovery(null, 'bfcache', 'wake_tab', 'failed', { tabId, error: e.message });
    }
    await ensureContentScriptInjected(tabId);
  }
}
```

Apply to Phase 17:
- Add refresh-poll helpers beside the existing `fsbTrigger*` block unless extracting the optional helper module.
- Use `chrome.tabs.sendMessage(tabId, payload, { frameId: 0 })` in the refresh-poll read helper; do not use `sendMessageWithRetry()`.
- Route `fsbTrigger:<id>` alarms through a refresh-poll branch before plain `handleTriggerAlarm()` when `snapshot.watch` is refresh-poll.
- Always pass `snapshot.target_tab_id` to `chrome.tabs.reload(tabId)` and never call `chrome.tabs.query({ active:true })` in the poll path.

---

### `extension/content/messaging.js` (content message router, request-response)

**Analog:** `extension/content/messaging.js`

**`triggerRead` route pattern** (lines 1280-1294):
```javascript
case 'triggerRead':
  (async () => {
    try {
      if (!FSB.triggerObserve || typeof FSB.triggerObserve.readValue !== 'function') {
        sendResponse({ success: false, error: 'triggerObserve unavailable' });
        return;
      }
      const leaf = FSB.querySelectorWithShadow(request.selector);
      const value = FSB.triggerObserve.readValue(leaf, request.extract, request.attrName || request.attribute);
      sendResponse({ value });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
```

**Pulse start pattern** (lines 1296-1325):
```javascript
case 'triggerPulseStart':
  (async () => {
    try {
      if (!FSB.actionGlowOverlay || typeof FSB.actionGlowOverlay.showPulse !== 'function') {
        sendResponse({ success: false, error: 'actionGlowOverlay pulse unavailable' });
        return;
      }
      const el = FSB.querySelectorWithShadow(request.selector);
      if (el) {
        FSB.actionGlowOverlay.showPulse(el);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Element not found' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
```

Apply to Phase 17:
- Keep `return true` for async router cases.
- Extend `triggerRead` or wrap its response so `leaf === null` returns an explicit typed outcome such as `{ success:false, code:'ELEMENT_NOT_FOUND', selector }`.
- Preserve the shared selector/read path: `FSB.querySelectorWithShadow(...)` then `FSB.triggerObserve.readValue(...)`.

---

### `extension/content/trigger-observe.js` (content utility, transform + DOM read + event-driven report)

**Analog:** `extension/content/trigger-observe.js`

**Value-shape pattern** (lines 21-43):
```javascript
function readValue(leaf, extract, attrName) {
  if (!leaf) return { text: '' };

  if (extract === 'attribute' && attrName) {
    var rawAttr = '';
    if (typeof leaf.getAttribute === 'function') {
      rawAttr = leaf.getAttribute(attrName) || '';
    }
    var attrValue = String(rawAttr).trim();
    var attrs = {};
    attrs[attrName] = attrValue;
    return { text: attrValue, attributes: attrs };
  }

  var raw = '';
  var tag = leaf.tagName ? String(leaf.tagName).toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    raw = leaf.value == null ? '' : leaf.value;
  } else {
    raw = leaf.textContent == null ? '' : leaf.textContent;
  }
  return { text: String(raw).trim() };
}
```

**Selector re-resolution pattern** (lines 73-85):
```javascript
function resolveLeaf(selector) {
  if (!FSB || typeof FSB.querySelectorWithShadow !== 'function') return null;
  var leaf = FSB.querySelectorWithShadow(selector);
  if (leaf && leaf.isConnected === false) {
    var key = cacheKeyFor(selector);
    if (FSB.elementCache && key && typeof FSB.elementCache.delete === 'function') {
      try { FSB.elementCache.delete(key); } catch (_e) { /* non-blocking */ }
    }
    leaf = FSB.querySelectorWithShadow(selector);
    if (leaf && leaf.isConnected === false) leaf = null;
  }
  return leaf || null;
}
```

**Existing not-found precedent** (lines 126-136):
```javascript
function start(triggerId, selector, extract, attrName) {
  if (!triggerId || !selector) {
    return { ok: false, reason: 'invalid_request' };
  }

  stop(triggerId);

  var leaf = resolveLeaf(selector);
  if (!leaf) {
    return { ok: false, reason: 'not_found' };
  }
```

Apply to Phase 17:
- Do not change the locked `{ text, attributes? }` shape for successful reads.
- Add a read wrapper or an additional return path so refresh-poll can distinguish missing element from legitimate empty text.
- If changing `readValue(null)`, verify live-observe tests and semantics; safer path is to let `triggerRead` detect null before calling `readValue`.

---

### `extension/utils/trigger-lifecycle.js` (lifecycle service, event-driven + storage CRUD)

**Analog:** `extension/utils/trigger-lifecycle.js`

**Dual-export IIFE and constants** (lines 1-79):
```javascript
(function(global) {
  'use strict';

  var TRIGGER_ALARM_PREFIX = 'fsbTrigger:';
  var FSB_TRIGGER_DEFAULT_TTL_MS = 21600000; // 6h
  var TRIGGER_ALARM_MIN_PERIOD_MS = 30000;
  var TRIGGER_ALARM_MIN_PERIOD_MINUTES = 0.5;
```

**Arm-trigger storage/alarm pattern** (lines 195-214):
```javascript
async function armTrigger(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { ok: false, reason: 'invalid_snapshot' };
  }
  var triggerId = snapshot.trigger_id;
  var alarmName = alarmNameForTrigger(triggerId);
  if (!alarmName) {
    return { ok: false, reason: 'invalid_trigger_id' };
  }
  var store = _getStore();
  if (!store) {
    return { ok: false, reason: 'store_unavailable' };
  }
  await store.writeSnapshot(triggerId, snapshot);
  var deadlineAt = Number(snapshot.deadline_at);
  var armed = false;
  if (Number.isFinite(deadlineAt)) {
    armed = await createAlarm(alarmName, { when: deadlineAt });
  }
  return { ok: true, armed: armed };
}
```

**Storage-first alarm/evaluate seam** (lines 269-373):
```javascript
async function handleTriggerAlarm(alarm) {
  if (!alarm || typeof alarm !== 'object' || typeof alarm.name !== 'string') {
    return { ok: false, reason: 'not_our_alarm' };
  }
  if (alarm.name.indexOf(TRIGGER_ALARM_PREFIX) !== 0) {
    return { ok: false, reason: 'not_our_alarm' };
  }

  var triggerId = alarm.name.slice(TRIGGER_ALARM_PREFIX.length);
  if (!triggerId) {
    return { ok: false, reason: 'malformed_alarm_name' };
  }

  var snap = await store.readSnapshot(triggerId);
  if (!snap) {
    return { ok: true, action: 'noop_no_entry' };
  }

  if (snap.status === 'fired' || snap.status === 'stopped') {
    return { ok: true, action: 'noop_terminal' };
  }

  if (Number.isFinite(Number(snap.deadline_at)) && now >= Number(snap.deadline_at)) {
    await store.deleteSnapshot(triggerId);
    await clearAlarm(alarm.name);
    return { ok: true, action: 'reaped_ttl' };
  }

  var reportedValue = {
    text: (snap.reported_value != null ? snap.reported_value : snap.last_value)
  };
  if (snap.reported_attributes && typeof snap.reported_attributes === 'object') {
    reportedValue.attributes = snap.reported_attributes;
  }

  var outcome = manager.evaluate(snap, reportedValue, now);

  if (outcome.outcome === 'fired') {
    snap.status = 'fired';
    snap.fired_at = now;
    await store.writeSnapshot(triggerId, snap);
    await clearAlarm(alarm.name);
    return { ok: true, action: 'fired', outcome: outcome };
  }

  await store.writeSnapshot(triggerId, snap);
  return { ok: true, action: outcome.outcome, outcome: outcome };
}
```

**Restore/reconcile pattern** (lines 438-510):
```javascript
async function restoreTriggersFromStorage() {
  var counters = { restored: 0, reaped: 0, dropped: 0, orphans_cleared: 0 };
  var envelope = await store.hydrate();
  var records = (envelope && envelope.records && typeof envelope.records === 'object')
    ? envelope.records : {};
  var now = Date.now();

  var liveAlarmNames = [];
  var c = _getChrome();
  if (c && c.alarms && typeof c.alarms.getAll === 'function') {
    try {
      var alarms = await c.alarms.getAll();
      if (Array.isArray(alarms)) {
        for (var a = 0; a < alarms.length; a++) {
          if (alarms[a] && typeof alarms[a].name === 'string') {
            liveAlarmNames.push(alarms[a].name);
          }
        }
      }
    } catch (_e) {
      liveAlarmNames = [];
    }
  }

  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var snap = records[id];
    var alarmName = TRIGGER_ALARM_PREFIX + id;
    if (snap.status !== 'armed' || now >= Number(snap.deadline_at)) {
      await store.deleteSnapshot(id);
      await clearAlarm(alarmName);
      counters.reaped++;
    } else {
      await createAlarm(alarmName, { when: Number(snap.deadline_at) });
      counters.restored++;
    }
  }

  return Object.assign({ ok: true }, counters);
}
```

Apply to Phase 17:
- Keep terminal fire write-back in `handleTriggerAlarm()`; refresh-poll glue should only stage `reported_value` / `reported_attributes` and then call this seam.
- Extend alarm scheduling without breaking `deadline_at` as the absolute TTL/reap boundary.
- Use `TRIGGER_ALARM_MIN_PERIOD_MS` as the refresh-poll hard floor.

---

### `extension/utils/trigger-manager.js` (service/model, transform + storage-backed arm CRUD)

**Analog:** `extension/utils/trigger-manager.js`

**Pure evaluator contract** (lines 11-20, 374-434):
```javascript
function evaluate(snapshot, reportedValue, now) {
  var ts = (typeof now === 'number') ? now : Date.now();
  var safeSnap = (snapshot && typeof snapshot === 'object') ? snapshot : {};
  var condition = safeSnap.condition || {};

  var result;
  if (condition && condition.combinator && Array.isArray(condition.conditions)) {
    result = evaluateCompound(condition, safeSnap, reportedValue, opts);
  } else {
    result = evaluateOne(condition, safeSnap, reportedValue, opts);
  }

  if (result.error) {
    return {
      outcome: result.error,
      matched_condition: undefined,
      old_value: safeSnap.baseline,
      new_value: rawOnError,
      next_state: {
        last_value: rawOnError,
        was_satisfied: safeSnap.was_satisfied === true,
        last_evaluated_at: ts
      }
    };
  }

  return {
    outcome: isEdge ? 'fired' : 'no_fire',
    matched_condition: (isEdge && result.matched_condition) ? result.matched_condition : (isEdge ? condition : undefined),
    old_value: result.old_value,
    new_value: newValue,
    next_state: {
      last_value: newValue,
      was_satisfied: satisfiedNow,
      last_evaluated_at: ts
    }
  };
}
```

**Arm snapshot creation pattern** (lines 580-620):
```javascript
function armTrigger(spec) {
  return _withArmLock(async function() {
    var safeSpec = (spec && typeof spec === 'object') ? spec : {};
    var armed = (store && typeof store.listArmedSnapshots === 'function')
      ? await store.listArmedSnapshots()
      : [];
    var active = Array.isArray(armed) ? armed.length : 0;
    var cap = getCap();
    if (active >= cap) {
      return { error: 'TRIGGER_CAP_REACHED', code: 'TRIGGER_CAP_REACHED', cap: cap, active: active };
    }

    var now = (typeof safeSpec.now === 'number') ? safeSpec.now : Date.now();
    var snapshot = {
      trigger_id: safeSpec.trigger_id,
      status: 'armed',
      condition: safeSpec.condition,
      baseline: (safeSpec.baseline === undefined) ? null : safeSpec.baseline,
      last_value: (safeSpec.baseline === undefined) ? null : safeSpec.baseline,
      was_satisfied: false,
      selector: safeSpec.selector,
      target_tab_id: safeSpec.target_tab_id,
      agent_id: safeSpec.agent_id,
      armed_at: now,
      deadline_at: now + ttl
    };

    var armedResult = await lifecycle.armTrigger(snapshot);
    var merged = (armedResult && typeof armedResult === 'object') ? armedResult : {};
    merged.trigger_id = snapshot.trigger_id;
    return merged;
  });
}
```

Apply to Phase 17:
- Normalize and persist `poll_interval_ms` at arm time for refresh-poll snapshots.
- Reject sub-floor intervals with a typed error; do not clamp silently.
- Do not add fire-condition comparison to refresh-poll code.

---

### `extension/utils/trigger-store.js` (persistence model/service, CRUD)

**Analog:** `extension/utils/trigger-store.js`

**Flat envelope/schema pattern** (lines 22-49):
```javascript
 * Storage shape (under chrome.storage.session, key `fsbTriggerRegistry`):
 *
 *   {
 *     v: 1,
 *     records: {
 *       [trigger_id]: {
 *         trigger_id,
 *         status,
 *         watch,
 *         condition,
 *         selector,
 *         target_tab_id,
 *         agent_id,
 *         baseline,
 *         last_value,
 *         last_evaluated_at,
 *         armed_at,
 *         fired_at,
 *         deadline_at,
 *         alarm_name
 *       }
 *     }
 *   }
```

**CRUD pattern** (lines 134-180):
```javascript
async function writeSnapshot(triggerId, snapshot) {
  if (!triggerId || typeof triggerId !== 'string') return;
  if (!snapshot || typeof snapshot !== 'object') return;
  var envelope = await _readEnvelope();
  envelope.records[triggerId] = snapshot;
  await _writeEnvelope(envelope);
}

async function readSnapshot(triggerId) {
  if (!triggerId || typeof triggerId !== 'string') return null;
  var envelope = await _readEnvelope();
  return envelope.records[triggerId] || null;
}

async function listArmedSnapshots() {
  var envelope = await _readEnvelope();
  return Object.keys(envelope.records)
    .map(function(k) { return envelope.records[k]; })
    .filter(function(s) { return s && s.status === 'armed'; });
}
```

Apply to Phase 17:
- Store refresh-poll fields as flat snapshot properties: `poll_interval_ms`, optional `attention_reason`, `attention_at`, and `last_attention`.
- Prefer no new storage abstraction unless repeated attention-state writes justify a tiny helper.

---

### `extension/utils/trigger-refresh-poll.js` (optional utility/service, event-driven + request-response + Chrome tab I/O)

**Analog:** `extension/utils/trigger-lifecycle.js` + `extension/background.js`

Use this optional file only if the refresh-poll glue becomes too large to keep in `background.js`. If created, copy the module shell from `trigger-lifecycle.js` and keep Chrome-dependent tab operations guarded like background helpers.

**Module shell pattern** (from `extension/utils/trigger-lifecycle.js` lines 1-2, 527-531):
```javascript
(function(global) {
  'use strict';
  // ...
  global.FsbTriggerLifecycle = exportsObj;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

**No-throw Chrome API wrapper pattern** (from `extension/utils/trigger-lifecycle.js` lines 153-168):
```javascript
async function createAlarm(name, alarmInfo) {
  var c = _getChrome();
  if (!c || !c.alarms || typeof c.alarms.create !== 'function') return false;
  try {
    await c.alarms.create(name, alarmInfo);
    return true;
  } catch (_error) {
    return false;
  }
}
```

**Direct background-safe send pattern to adapt** (from `extension/background.js` lines 3453-3462):
```javascript
async function fsbTriggerSendTabMessage(tabId, payload) {
  if (!Number.isFinite(Number(tabId)) || !chrome.tabs || typeof chrome.tabs.sendMessage !== 'function') {
    return { ok: false, reason: 'tabs_unavailable' };
  }
  try {
    await chrome.tabs.sendMessage(Number(tabId), payload);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'send_failed', error: err && err.message ? err.message : String(err) };
  }
}
```

Apply to Phase 17:
- Export pure/testable helpers such as `normalizeRefreshPollInterval`, `computeRefreshPollDelay`, `checkRefreshPollOwnership`, and `isRefreshPollSnapshot` if needed.
- Keep reload/read orchestration in background if it needs `ensureContentScriptInjected()` or `pageLoadWatcher`, unless those dependencies are passed in.

---

### `tests/trigger-refresh-poll.test.js` (test, event-driven + request-response + Chrome API mocks)

**Analogs:** `tests/trigger-lifecycle.test.js`, `tests/trigger-observe.test.js`, `tests/foreground-audit.test.js`, `tests/ownership-error-codes.test.js`, `tests/agent-tab-user-navigation.test.js`

**Plain script harness pattern** (from `tests/trigger-lifecycle.test.js` lines 61-70):
```javascript
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
```

**Chrome storage/alarm mock pattern** (from `tests/trigger-lifecycle.test.js` lines 80-120):
```javascript
function createStorageArea(initial) {
  const store = Object.assign({}, initial || {});
  return {
    async get(keys) {
      if (keys == null) return Object.assign({}, store);
      if (Array.isArray(keys)) {
        const out = {};
        keys.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(store, key)) out[key] = store[key];
        });
        return out;
      }
      return Object.assign({}, store);
    },
    async set(values) {
      Object.assign(store, values);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => { delete store[key]; });
    },
    _dump() { return Object.assign({}, store); }
  };
}
```

**Ownership mock pattern** (from `tests/ownership-error-codes.test.js` lines 53-99):
```javascript
function buildRegistryMock(opts) {
  opts = opts || {};
  const knownAgents = new Set(opts.knownAgents || []);
  const tabOwners = new Map(opts.tabOwners || []);
  return {
    hasAgent(agentId) {
      return typeof agentId === 'string' && knownAgents.has(agentId);
    },
    isOwnedBy(tabId, agentId, ownershipToken) {
      if (tabOwners.get(tabId) !== agentId) return false;
      if (ownershipToken === undefined) return true;
      const meta = tabMetadata.get(tabId);
      if (!meta) return false;
      return meta.ownershipToken === ownershipToken;
    },
    getOwner(tabId) {
      return tabOwners.get(tabId) || null;
    }
  };
}
```

**Source invariant audit pattern** (from `tests/foreground-audit.test.js` lines 109-131):
```javascript
const src = readSafe(DISPATCHER_PATH) || '';
const lines = src.split('\n');
const offenders = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/chrome\.tabs\.update\s*\(/.test(line) && /active\s*:\s*true/.test(line)) {
    const start = Math.max(0, i - 30);
    const window = lines.slice(start, i + 1).join('\n');
    if (!/_forceForeground/.test(window)) {
      offenders.push((i + 1) + ': ' + line.trim());
    }
  }
}
assert(offenders.length === 0,
  'no unguarded chrome.tabs.update({active:true}) in mcp-tool-dispatcher.js');
```

**Agent-navigation stamp test pattern** (from `tests/agent-tab-user-navigation.test.js` lines 45-71):
```javascript
delete require.cache[REGISTRY_MODULE_PATH];
const { AgentRegistry } = require(REGISTRY_MODULE_PATH);
const registry = new AgentRegistry();

const tabId = 4242;
registry._tabMetadata.set(tabId, {
  ownershipToken: 'tok_test',
  incognito: false,
  windowId: 1,
  boundAt: Date.now(),
  forced: false
});
const before = Date.now();
registry.stampAgentNavigation(tabId);
const after = Date.now();

const meta = registry.getTabMetadata(tabId);
assert.ok(typeof meta.lastAgentNavigationAt === 'number');
assert.ok(meta.lastAgentNavigationAt >= before && meta.lastAgentNavigationAt <= after);
```

Apply to Phase 17:
- Add focused cases for interval default/floor/jitter, ownership rejection before reload, no active-tab query/no activation source invariant, element-not-found no evaluate, blocked-page no evaluate, successful reload/read/evaluate, and pulse restart.
- If helpers remain in `background.js`, prefer source-slice/invariant tests for the Chrome call-shape and use extracted pure helpers for interval/ownership where possible.

---

### `tests/trigger-observe.test.js` (test, transform + content VM mocks)

**Analog:** `tests/trigger-observe.test.js`

**Content VM harness pattern** (lines 1-21, 96-154):
```javascript
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function check(label, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS:', label);
  } catch (err) {
    failed++;
    console.error('  FAIL:', label);
    console.error('    ', err && err.message ? err.message : err);
  }
}

const FSB = {
  _modules: {},
  elementCache: new Map(),
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  sanitizeSelector(selector) { return selector; },
  querySelectorWithShadow(selector) {
    queryCalls++;
    return queryResolver(selector);
  }
};

vm.runInContext(fs.readFileSync(modulePath, 'utf8'), vm.createContext(sandbox), {
  filename: 'trigger-observe.js'
});
```

**Value shape assertions** (lines 174-184):
```javascript
check('readValue emits the locked text and attribute shapes', () => {
  const textNode = makeNode({ text: '  $42  ' });
  assert.deepEqual(plain(triggerObserve.readValue(textNode, 'text')), { text: '$42' });
  const input = makeNode({ tag: 'input', value: '  17  ' });
  assert.deepEqual(plain(triggerObserve.readValue(input, 'number')), { text: '17' });
  const attrNode = makeNode({ attrs: { 'data-price': '  99  ' } });
  assert.deepEqual(plain(triggerObserve.readValue(attrNode, 'attribute', 'data-price')), {
    text: '99',
    attributes: { 'data-price': '99' }
  });
});
```

Apply to Phase 17:
- Extend this file only if changing `readValue` itself.
- If the not-found behavior is handled in `content/messaging.js`, put the router response test in `tests/trigger-refresh-poll.test.js` or a new content-router-focused slice, not here.

---

### `package.json` (config, batch)

**Analog:** `package.json`

**Explicit test chain pattern** (lines 14-17):
```json
"scripts": {
  "build": "node esbuild.config.js",
  "test": "node tests/test-overlay-state.js && node tests/cost-tracker-ordering.test.js && node tests/runtime-contracts.test.js && ... && node tests/trigger-store.test.js && node tests/trigger-lifecycle.test.js && node tests/value-extractor.test.js && node tests/trigger-manager.test.js && node tests/trigger-cap.test.js && node tests/trigger-observe.test.js && node tests/trigger-observe-pulse.test.js",
  "test:lattice": "node tests/lattice-public-package.test.js && node tests/lattice-smoke.test.js && ..."
}
```

Apply to Phase 17:
- If `tests/trigger-refresh-poll.test.js` is created, add `node tests/trigger-refresh-poll.test.js` near the existing trigger tests in the `test` script.
- Keep the repo's explicit chained script style; do not introduce a new test runner.

## Shared Patterns

### Storage-First Evaluation
**Source:** `extension/background.js` lines 3502-3549 and `extension/utils/trigger-lifecycle.js` lines 330-373  
**Apply to:** `extension/background.js`, optional `extension/utils/trigger-refresh-poll.js`, tests
```javascript
snap.reported_value = (typeof value.text === 'string')
  ? value.text.slice(0, FSB_TRIGGER_REPORTED_TEXT_MAX)
  : snap.last_value;
const attrs = fsbTriggerCopyReportedAttributes(value.attributes);
if (attrs) snap.reported_attributes = attrs;
await FsbTriggerStore.writeSnapshot(triggerId, snap);

seamResult = await FsbTriggerLifecycle.handleTriggerAlarm({
  name: FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX + triggerId
});
```

### Ownership Before Side Effect
**Source:** `extension/ws/mcp-tool-dispatcher.js` lines 175-204 and `extension/utils/agent-registry.js` lines 573-587, 1011-1013  
**Apply to:** refresh-poll reload helper, tests
```javascript
function createMcpOwnershipError(code, extra = {}) {
  return {
    success: false,
    code,
    errorCode: code,
    error: code,
    ...extra
  };
}

function checkClaimableTargetBeforeSideEffect({ tool, tabId, agentId, ownershipToken }) {
  const reg = (typeof globalThis !== 'undefined') ? globalThis.fsbAgentRegistryInstance : null;
  if (!reg || !Number.isFinite(tabId)) return null;
  if (!agentId || (typeof reg.hasAgent === 'function' && !reg.hasAgent(agentId))) {
    return createMcpOwnershipError('AGENT_NOT_REGISTERED', { requestingAgentId: agentId || null });
  }
  const ownerAgentId = getRegistryOwner(reg, tabId);
  if (ownerAgentId && ownerAgentId !== agentId) {
    return createMcpOwnershipError('TAB_NOT_OWNED', { ownerAgentId, requestedTabId: tabId, requestingAgentId: agentId });
  }
  if (ownerAgentId === agentId
      && typeof reg.isOwnedBy === 'function'
      && !reg.isOwnedBy(tabId, agentId, ownershipToken)) {
    return createMcpOwnershipError('TAB_NOT_OWNED', { ownerAgentId, requestedTabId: tabId, requestingAgentId: agentId });
  }
  return null;
}
```

### Agent Navigation Stamping Before Reload
**Source:** `extension/ws/mcp-tool-dispatcher.js` lines 786-804 and `extension/ai/tool-executor.js` lines 266-275  
**Apply to:** refresh-poll reload helper
```javascript
try {
  if (typeof globalThis !== 'undefined'
      && globalThis.fsbAgentRegistryInstance
      && typeof globalThis.fsbAgentRegistryInstance.stampAgentNavigation === 'function') {
    globalThis.fsbAgentRegistryInstance.stampAgentNavigation(targetTabId);
  }
} catch (_e) { /* best-effort */ }
await chrome.tabs.reload(targetTabId);
```

### Main-Frame Content Read
**Source:** `extension/background.js` lines 3310-3335 and 3999-4021  
**Apply to:** refresh-poll read helper
```javascript
await chrome.scripting.executeScript({
  target: { tabId, frameIds: [0] },
  files: CONTENT_SCRIPT_FILES,
  world: 'ISOLATED',
  injectImmediately: true
});

const response = await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
```

### No-Focus Source Invariants
**Source:** `tests/foreground-audit.test.js` lines 109-164  
**Apply to:** `tests/trigger-refresh-poll.test.js`
```javascript
if (/chrome\.tabs\.update\s*\(/.test(line) && /active\s*:\s*true/.test(line)) {
  const start = Math.max(0, i - 30);
  const window = lines.slice(start, i + 1).join('\n');
  if (!/_forceForeground/.test(window)) {
    offenders.push((i + 1) + ': ' + line.trim());
  }
}
```

For Phase 17, add stricter refresh-poll-specific checks:
- No `chrome.tabs.query({ active:true })` in refresh-poll helpers.
- No `chrome.tabs.update(..., { active:true })` in refresh-poll helpers.
- No `sendMessageWithRetry(` in refresh-poll helpers.
- `chrome.tabs.reload(` is always called with an explicit tab ID.

### Blocked/Attention States
**Source:** `extension/background.js` lines 2974-3020, 10741-10790 and `extension/content/actions.js` lines 3457-3504  
**Apply to:** refresh-poll post-reload blocker classification
```javascript
const intermediatePagePatterns = [
  /accounts\.google\.com\/RotateCookiesPage/i,
  /accounts\.google\.com\/ServiceLogin/i,
  /consent\.google\.com/i,
  /accounts\.google\.com\/signin\/oauth/i,
  /login\.microsoftonline\.com\/common\/oauth2/i,
  /www\.google\.com\/url\?/i
];

const recaptchaEl = document.querySelector('.g-recaptcha, [data-sitekey]');
const hcaptchaEl = document.querySelector('.h-captcha, [data-hcaptcha-sitekey]');
const turnstileEl = document.querySelector('.cf-turnstile, [data-turnstile-sitekey]');
```

Use these as classification precedents only. Refresh-poll should mark the trigger `blocked` or `needs_attention` and should not attempt CAPTCHA solving or login handling.

### Plain Node Test Style
**Source:** `tests/trigger-lifecycle.test.js` lines 61-70 and `tests/trigger-observe.test.js` lines 1-21  
**Apply to:** `tests/trigger-refresh-poll.test.js`, `tests/trigger-observe.test.js`
```javascript
let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
```

## No Analog Found

No target file is completely without an analog. The exact recurring refresh-poll tick has no exact in-repo implementation, but these role-match sources cover the required pieces:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `extension/utils/trigger-refresh-poll.js` (optional) | utility/service | event-driven + request-response + Chrome tab I/O | No existing module combines ownership-gated background reload, post-reload `triggerRead`, and lifecycle evaluation; use `trigger-lifecycle.js`, `background.js`, and MCP navigation reload patterns together. |
| `tests/trigger-refresh-poll.test.js` | test | event-driven + request-response + Chrome API mocks | No existing single test covers refresh-poll; compose storage/alarm mocks, ownership mocks, content VM/read tests, and source invariant audits. |

## Metadata

**Analog search scope:** `extension/`, `tests/`, `package.json`  
**Files scanned:** 180+ source/test files via `rg --files` and targeted `rg` pattern search  
**Pattern extraction date:** 2026-06-16  
**Project instructions:** No `CLAUDE.md`, `.claude/skills/`, or `.agents/skills/` files were present in the workspace.
