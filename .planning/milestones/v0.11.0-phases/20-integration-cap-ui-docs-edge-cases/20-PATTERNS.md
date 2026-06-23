# Phase 20: Integration, Cap UI, Docs & Edge Cases - Pattern Map

**Mapped:** 2026-06-17
**Files analyzed:** 22
**Analogs found:** 22 / 22

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `extension/ui/control_panel.html` | component | event-driven settings UI | `extension/ui/control_panel.html` Agent Concurrency card | exact |
| `extension/ui/options.js` | component/controller | event-driven + storage CRUD | `extension/ui/options.js` Agent Cap wiring | exact |
| `extension/ui/cap-counter-helpers.js` | utility | transform | `extension/ui/cap-counter-helpers.js` Agent counter helpers | exact |
| `extension/background.js` | service/controller | event-driven + request-response + batch | `extension/background.js` trigger arm and refresh-poll helpers | exact |
| `tests/trigger-cap-settings-ui.test.js` | test | source-shape + transform | `tests/cap-counter-live.test.js`, `tests/agent-cap-ui.test.js`, `tests/change-report-settings-ui.test.js` | exact |
| `tests/trigger-tool-dispatcher.test.js` | test | VM request-response | `tests/trigger-tool-dispatcher.test.js` trigger arm/list cases | exact |
| `tests/trigger-refresh-poll.test.js` | test | VM event-driven | `tests/trigger-refresh-poll.test.js` refresh-poll source guards | exact |
| `tests/mcp-version-parity.test.js` | test | source-shape + command parity | `tests/mcp-version-parity.test.js` canonical version checks | exact |
| `package.json` | config | batch test orchestration | `package.json` root `test` and MCP smoke scripts | exact |
| `mcp/package.json` | config | package metadata | `mcp/package.json` current version/script shape | exact |
| `mcp/package-lock.json` | config | package metadata lock | `mcp/package-lock.json` root package metadata | exact |
| `mcp/src/version.ts` | config | constant export | `mcp/src/version.ts` version constant | exact |
| `mcp/build/version.js` | generated config | build artifact | `mcp/build/version.js` compiled version constant | exact |
| `mcp/server.json` | config | package registry metadata | `mcp/server.json` server/package version fields | exact |
| `mcp/CHANGELOG.md` | docs | release notes | `mcp/CHANGELOG.md` v0.9.x release entries | exact |
| `mcp/README.md` | docs | public reference | `mcp/README.md` tools, diagnostics, multi-agent docs | exact |
| `README.md` | docs | public overview | `README.md` MCP quick-start and usage guidance | exact |
| `.planning/phases/20-integration-cap-ui-docs-edge-cases/20-HUMAN-UAT.md` | docs/test artifact | manual UAT evidence | `.planning/phases/16-live-observe-watch-analyzing-pulse/16-HUMAN-UAT.md` | exact |
| `.planning/phases/16-live-observe-watch-analyzing-pulse/16-HUMAN-UAT.md` | docs/test artifact | manual UAT evidence | same file current pending shape | exact |
| `.planning/phases/16-live-observe-watch-analyzing-pulse/16-VERIFICATION.md` | docs/test artifact | verification summary | same file human-needed carry-forward shape | exact |
| `.planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-HUMAN-UAT.md` | docs/test artifact | manual UAT evidence | same file deferred-to-Phase-20 shape | exact |
| `.planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-VERIFICATION.md` | docs/test artifact | verification summary | same file deferred evidence table | exact |

## Pattern Assignments

### `extension/ui/control_panel.html` (component, event-driven settings UI)

**Analog:** `extension/ui/control_panel.html` Agent Concurrency card.

**Card markup pattern** (lines 412-447):
```html
<div class="settings-card">
  <div class="settings-card-header">
    <div class="settings-card-icon">
      <i class="fas fa-users"></i>
    </div>
    <div class="settings-card-title">
      <h3>Agent Concurrency</h3>
      <p>Maximum simultaneous agents</p>
    </div>
  </div>
  <div class="settings-card-content">
    <div class="setting-item">
      <div class="setting-label">
        <span>Concurrency Cap</span>
        <span class="setting-value-display" id="fsbAgentCapDisplay">8</span>
      </div>
      <input type="number" id="fsbAgentCap" class="form-input"
             min="1" max="64" step="1" value="8">
      <button type="button" class="form-secondary-btn" id="fsbAgentCapReset" style="margin-top: 8px;">
        Reset to default (8)
      </button>
      <div class="setting-hint">Default 8. Range 1 to 64...</div>
      <div class="setting-hint" id="fsbAgentCapValidation"
           style="color: #ff6b6b; display: none; margin-top: 4px;">
        Must be between 1 and 64
      </div>
      <div class="setting-hint" id="fsbAgentCapCurrentActive" style="margin-top: 4px;">
        0 of 8 active
      </div>
    </div>
  </div>
</div>
```

**Apply to Trigger Concurrency:** clone this card immediately after the Agent Concurrency card in `advanced-settings-grid`; replace icon with `fas fa-bolt`, title/subtitle/copy from `20-UI-SPEC.md`, and IDs with `fsbTriggerCap`, `fsbTriggerCapDisplay`, `fsbTriggerCapReset`, `fsbTriggerCapValidation`, `fsbTriggerCapCurrentActive`.

---

### `extension/ui/options.js` (component/controller, event-driven + storage CRUD)

**Analog:** `extension/ui/options.js` Agent Cap wiring.

**Default settings pattern** (lines 30-36):
```javascript
// Phase 241 D-05 / POOL-05: max simultaneous agents (range 1-64, default 8).
fsbAgentCap: 8,
// Phase 245 D-07: global toggle for action change_report emission.
fsbChangeReportsEnabled: true
```

**Element cache pattern** (lines 157-163):
```javascript
elements.fsbAgentCap = document.getElementById('fsbAgentCap');
elements.fsbAgentCapDisplay = document.getElementById('fsbAgentCapDisplay');
elements.fsbAgentCapReset = document.getElementById('fsbAgentCapReset');
elements.fsbAgentCapValidation = document.getElementById('fsbAgentCapValidation');
elements.fsbAgentCapCurrentActive = document.getElementById('fsbAgentCapCurrentActive');
```

**Input clamp + reset pattern** (lines 307-347):
```javascript
if (elements.fsbAgentCap) {
  elements.fsbAgentCap.addEventListener('input', (e) => {
    const rawValue = e.target.value;
    const validationEl = elements.fsbAgentCapValidation;
    if (validationEl && typeof isCapInputInvalid === 'function') {
      validationEl.style.display = isCapInputInvalid(rawValue) ? 'block' : 'none';
    }

    let raw = parseInt(rawValue, 10);
    if (!Number.isFinite(raw)) raw = 8;
    if (raw < 1) raw = 1;
    if (raw > 64) raw = 64;
    if (e.target.value !== String(raw)) e.target.value = String(raw);
    if (elements.fsbAgentCapDisplay) {
      elements.fsbAgentCapDisplay.textContent = String(raw);
    }
    if (typeof refreshActiveAgentCount === 'function') {
      refreshActiveAgentCount();
    }
    markUnsavedChanges();
  });
}
if (elements.fsbAgentCapReset) {
  elements.fsbAgentCapReset.addEventListener('click', () => {
    if (elements.fsbAgentCap) elements.fsbAgentCap.value = '8';
    if (elements.fsbAgentCapDisplay) elements.fsbAgentCapDisplay.textContent = '8';
    if (elements.fsbAgentCapValidation) {
      elements.fsbAgentCapValidation.style.display = 'none';
    }
    if (typeof refreshActiveAgentCount === 'function') {
      refreshActiveAgentCount();
    }
    markUnsavedChanges();
  });
}
```

**Storage listener debounce pattern** (lines 359-373):
```javascript
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged
    && typeof chrome.storage.onChanged.addListener === 'function') {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes && changes.fsbAgentRegistry) {
      scheduleRefreshActiveAgentCount();
    } else if (area === 'local' && changes && changes.fsbAgentCap) {
      scheduleRefreshActiveAgentCount();
    }
  });
}
```

**Load clamp pattern** (lines 872-890):
```javascript
if (elements.fsbAgentCap) {
  let capValue = (typeof settings.fsbAgentCap === 'number' && Number.isFinite(settings.fsbAgentCap))
    ? settings.fsbAgentCap
    : 8;
  if (capValue < 1) capValue = 1;
  if (capValue > 64) capValue = 64;
  capValue = Math.floor(capValue);
  elements.fsbAgentCap.value = String(capValue);
  if (elements.fsbAgentCapDisplay) {
    elements.fsbAgentCapDisplay.textContent = String(capValue);
  }
}
if (typeof refreshActiveAgentCount === 'function') {
  refreshActiveAgentCount();
}
```

**Counter function pattern** (lines 942-985):
```javascript
let _capCounterDebounceHandle = null;

function scheduleRefreshActiveAgentCount() {
  if (_capCounterDebounceHandle !== null) {
    clearTimeout(_capCounterDebounceHandle);
  }
  _capCounterDebounceHandle = setTimeout(() => {
    _capCounterDebounceHandle = null;
    refreshActiveAgentCount();
  }, 100);
}

function refreshActiveAgentCount() {
  const counterEl = elements.fsbAgentCapCurrentActive;
  if (!counterEl) return;
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session
      || typeof chrome.storage.session.get !== 'function') {
    return;
  }
  try {
    chrome.storage.session.get('fsbAgentRegistry', (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        return;
      }
      const envelope = result && result.fsbAgentRegistry;
      const active = (typeof computeActiveAgentCount === 'function')
        ? computeActiveAgentCount(envelope)
        : 0;
      let cap = parseInt(elements.fsbAgentCap && elements.fsbAgentCap.value, 10);
      if (!Number.isFinite(cap)) cap = 8;
      const text = (typeof formatCounterText === 'function')
        ? formatCounterText(active, cap)
        : (active + ' of ' + cap + ' active');
      counterEl.textContent = text;
    });
  } catch (_e) {
    // Swallow -- counter is purely informational and must never throw into
    // the options page.
  }
}
```

**Save clamp pattern** (lines 1012-1023):
```javascript
fsbAgentCap: (function() {
  var raw = parseInt(elements.fsbAgentCap?.value, 10);
  if (!Number.isFinite(raw)) return 8;
  if (raw < 1) return 1;
  if (raw > 64) return 64;
  return raw;
})(),
```

**Apply to Trigger Concurrency:** duplicate the wiring with `fsbTriggerCap`, default `8`, range `1..64`, local storage key `fsbTriggerCap`, session registry key `fsbTriggerRegistry`, and function names such as `refreshActiveTriggerCount` / `scheduleRefreshActiveTriggerCount`.

---

### `extension/ui/cap-counter-helpers.js` (utility, transform)

**Analog:** same file's pure helper + dual export pattern.

**Pure helper/export pattern** (lines 27-70):
```javascript
function computeActiveAgentCount(envelope) {
  if (!envelope || typeof envelope !== 'object') return 0;
  var records = envelope.records;
  if (!records || typeof records !== 'object') return 0;
  var keys = Object.keys(records);
  var count = 0;
  for (var i = 0; i < keys.length; i++) {
    var id = keys[i];
    if (typeof id !== 'string') continue;
    if (id.indexOf('legacy:') === 0) continue;
    count++;
  }
  return count;
}

function formatCounterText(active, cap) {
  var a = (typeof active === 'number' && Number.isFinite(active)) ? active : 0;
  var c = (typeof cap === 'number' && Number.isFinite(cap)) ? cap : 8;
  return a + ' of ' + c + ' active';
}

function isCapInputInvalid(raw) {
  if (raw === null || raw === undefined || raw === '') return true;
  var n = Number(raw);
  if (!Number.isFinite(n)) return true;
  if (!Number.isInteger(n)) return true;
  if (n < 1 || n > 64) return true;
  return false;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeActiveAgentCount: computeActiveAgentCount,
    formatCounterText: formatCounterText,
    isCapInputInvalid: isCapInputInvalid
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.computeActiveAgentCount = computeActiveAgentCount;
  globalThis.formatCounterText = formatCounterText;
  globalThis.isCapInputInvalid = isCapInputInvalid;
}
```

**Apply to Trigger Concurrency:** add trigger-specific count helper in this same dual-export style. The trigger helper must count only records whose `status` is `armed`, `needs_attention`, or `blocked`; skip terminal `fired`, `timed_out`, `stopped`, and malformed records. Reuse `formatCounterText` and `isCapInputInvalid` unless namespacing is needed for test clarity.

---

### `extension/background.js` (service/controller, event-driven + request-response + batch)

**Analog:** same file's trigger arm, list/status, ownership, and refresh-poll helpers.

**Active status source pattern** (lines 4207-4221):
```javascript
function fsbTriggerNormalizeListStatuses(params) {
  const input = params && (params.statuses || params.status);
  if (Array.isArray(input)) {
    const filtered = input.map((value) => fsbTriggerFirstString(value)).filter(Boolean);
    if (filtered.length) return new Set(filtered);
  }
  const one = fsbTriggerFirstString(input);
  if (one) return new Set([one]);
  const defaults = new Set(['armed', 'needs_attention', 'blocked']);
  if (params && params.include_terminal === true) {
    defaults.add('fired');
    defaults.add('timed_out');
    defaults.add('stopped');
  }
  return defaults;
}
```

**Registry hydrate/list pattern** (lines 4270-4310):
```javascript
async function fsbTriggerHandleToolList(params, context) {
  let ownerContext = await fsbTriggerOwnerContext(
    fsbTriggerMergeParamsAndContext(params, context),
    context && context.sender
  );
  if (ownerContext && ownerContext.accessDenied) {
    return { success: false, errorCode: 'TRIGGER_ACCESS_DENIED', triggers: [] };
  }

  if (typeof FsbTriggerStore === 'undefined'
      || !FsbTriggerStore
      || typeof FsbTriggerStore.hydrate !== 'function') {
    return { success: false, errorCode: 'TRIGGER_STORE_UNAVAILABLE', triggers: [] };
  }

  const wanted = fsbTriggerNormalizeListStatuses(params);
  const envelope = await FsbTriggerStore.hydrate();
  const records = (envelope && envelope.records && typeof envelope.records === 'object') ? envelope.records : {};
  const triggers = [];
  const keys = Object.keys(records);
  for (let i = 0; i < keys.length; i++) {
    const snap = records[keys[i]];
    if (!snap || !wanted.has(snap.status)) continue;
    if (fsbTriggerSnapshotVisibleToContext(snap, perSnapshotContext)) {
      triggers.push(fsbTriggerProjectTriggerSummary(snap, now, summaryOptions));
    }
  }
}
```

**Arm ordering pattern** (lines 4576-4686):
```javascript
async function fsbTriggerHandleToolArm(params, context) {
  const safeParams = (params && typeof params === 'object') ? params : {};
  const tabId = fsbTriggerFirstFiniteTabId(...);

  const ownerContext = await fsbTriggerOwnerContext(...);
  if (ownerContext && ownerContext.accessDenied) {
    return { success: false, errorCode: 'TRIGGER_ACCESS_DENIED' };
  }

  const selector = fsbTriggerFirstString(safeParams.selector);
  if (!selector) return { success: false, errorCode: 'TRIGGER_SELECTOR_INVALID' };
  if (!Number.isFinite(Number(tabId))) return { success: false, errorCode: 'INVALID_TAB_ID' };

  const condition = fsbTriggerNormalizeToolCondition(safeParams.condition);
  const conditionValidation = fsbTriggerValidateToolCondition(condition);
  if (!conditionValidation.ok) return Object.assign({ success: false }, conditionValidation);

  const watch = fsbTriggerNormalizeToolWatch(safeParams.watch || safeParams.mode);
  if (!watch) return { success: false, errorCode: 'TRIGGER_WATCH_INVALID' };

  const readResult = await fsbTriggerSendRefreshPollRead(Number(tabId), readShape);
  ...
  const armResult = await FsbTriggerManager.armTrigger(spec);
  ...
  if (fsbTriggerIsLiveObserveSnapshot(snapshot)) {
    await fsbTriggerStartObserveForSnapshot(snapshot, 'trigger-arm');
  } else if (fsbTriggerIsRefreshPollSnapshot(snapshot)) {
    await fsbTriggerSendTabMessage(Number(tabId), {
      action: 'triggerPulseStart',
      selector: snapshot.selector,
      reason: 'trigger-arm'
    });
  }
}
```

**Apply conflict check here:** insert `TRIGGER_TAB_WATCH_CONFLICT` after watch normalization and before `fsbTriggerSendRefreshPollRead`, `FsbTriggerManager.armTrigger`, `fsbTriggerStartObserveForSnapshot`, or `triggerPulseStart`. Use `FsbTriggerStore.hydrate().records`, compare same `target_tab_id`, active statuses `armed`/`needs_attention`/`blocked`, normalized watch mode, and reject opposite mode only.

**Ownership helper pattern** (lines 3416-3448 and 4036-4084):
```javascript
function fsbTriggerValidateRefreshPollOwnership(snap) {
  const tabId = Number(snap && snap.target_tab_id);
  const rawAgentId = snap && snap.agent_id;
  const agentId = (typeof rawAgentId === 'string') ? rawAgentId.trim() : '';
  ...
  const registry = globalThis && globalThis.fsbAgentRegistryInstance;
  if (!registry) {
    return Object.assign({ ok: false, code: 'AGENT_REGISTRY_UNAVAILABLE' }, base, {
      requestedTabId: tabId,
      requestingAgentId: agentId
    });
  }
  if (typeof registry.hasAgent === 'function' && registry.hasAgent(agentId) === false) {
    return {
      ok: false,
      code: 'AGENT_NOT_REGISTERED',
      requestedTabId: tabId,
      requestingAgentId: agentId
    };
  }
}
```

**Refresh-poll read + blocked attention pattern** (lines 3616-3678):
```javascript
async function fsbTriggerSendRefreshPollRead(tabId, snap) {
  if (!Number.isFinite(Number(tabId)) || !chrome.tabs || typeof chrome.tabs.sendMessage !== 'function') {
    return { ok: false, success: false, reason: 'tabs_unavailable' };
  }
  const numericTabId = Number(tabId);
  await ensureContentScriptInjected(tabId);
  return chrome.tabs.sendMessage(numericTabId, {
    action: 'triggerRead',
    selector: snap.selector,
    extract: fsbTriggerExtractKind(snap),
    attrName: fsbTriggerAttrName(snap)
  }, { frameId: 0 });
}

function fsbTriggerBuildBlockedAttention(snap, blockedReason, url, extra) {
  return Object.assign({
    selector: snap && snap.selector,
    code: 'TRIGGER_PAGE_BLOCKED',
    blocked_reason: blockedReason || 'challenge',
    url: typeof url === 'string' ? url : ''
  }, extra || {});
}

async function fsbTriggerMarkRefreshPollAttention(triggerId, snap, reason, extra) {
  if (reason === 'blocked') {
    snap.status = 'blocked';
  } else {
    snap.status = 'needs_attention';
  }
  snap.attention_reason = reason;
  snap.attention_at = now;
  snap.last_attention = Object.assign({ reason, at: now }, extra || {});
  await FsbTriggerStore.writeSnapshot(triggerId, snap);
  return { ok: true, action: snap.status, reason };
}
```

**Current single-trigger refresh-poll tick pattern to preserve inside coalescing** (lines 3681-3811):
```javascript
async function fsbTriggerRunRefreshPollTick(triggerId, snap) {
  if (!fsbTriggerIsRefreshPollSnapshot(snap)) return { ok: true, ignored: true };
  ...
  const ownership = fsbTriggerValidateRefreshPollOwnership(snap);
  if (!ownership || ownership.ok !== true) {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'ownership_failed', ownership || { code: 'OWNERSHIP_VALIDATION_FAILED' });
  }
  const tabId = ownership.tabId;
  ...
  const preReloadTab = await fsbTriggerGetRefreshPollTabState(tabId);
  if (preReloadTab && preReloadTab.blocked) {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'blocked',
      fsbTriggerBuildBlockedAttention(snap, 'restricted_url', preReloadTab.url, { error: preReloadTab.error }));
  }
  if (registry && typeof registry.stampAgentNavigation === 'function') {
    try { registry.stampAgentNavigation(tabId); } catch (_err) {}
  }
  await chrome.tabs.reload(tabId);
  await fsbTriggerWaitForRefreshPollReady(tabId);
  ...
  readResult = await fsbTriggerSendRefreshPollRead(tabId, snap);
  ...
  snap.reported_value = (typeof value.text === 'string') ? value.text.slice(0, FSB_TRIGGER_REPORTED_TEXT_MAX) : snap.last_value;
  await FsbTriggerStore.writeSnapshot(triggerId, snap);
  seamResult = await FsbTriggerLifecycle.handleTriggerAlarm({ name: FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX + triggerId });
  ...
  const latestSnap = await FsbTriggerStore.readSnapshot(triggerId);
  if (fsbTriggerIsRefreshPollSnapshot(latestSnap) && latestSnap.status === 'armed') {
    await fsbTriggerSendTabMessage(tabId, { action: 'triggerPulseStart', selector: latestSnap.selector, reason: 'refresh-poll' });
    await FsbTriggerLifecycle.scheduleNextRefreshPollAlarm(latestSnap, Date.now());
    await FsbTriggerStore.writeSnapshot(triggerId, latestSnap);
  }
}
```

**Alarm routing pattern** (lines 3814-3839 and 14741-14749):
```javascript
async function fsbTriggerHandleRefreshPollAlarm(alarm) {
  const triggerId = alarm.name.slice(FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX.length);
  const snap = await FsbTriggerStore.readSnapshot(triggerId);
  if (!fsbTriggerIsRefreshPollSnapshot(snap)) {
    return { handled: false };
  }
  const result = await fsbTriggerRunRefreshPollTick(triggerId, snap);
  return Object.assign({ handled: true }, result || {});
}

const refreshPoll = await fsbTriggerHandleRefreshPollAlarm(alarm);
if (refreshPoll && refreshPoll.handled) return;
await FsbTriggerLifecycle.handleTriggerAlarm(alarm);
```

**Test hook pattern** (lines 4710-4750):
```javascript
globalThis.fsbTriggerToolHandlersForTest = { ... fsbTriggerHandleToolArm: fsbTriggerHandleToolArm, fsbTriggerDispatchToolRequest: fsbTriggerDispatchToolRequest };
globalThis.fsbTriggerHandleRefreshPollForTest = fsbTriggerHandleRefreshPollAlarm;
```

**Apply refresh-poll coalescing:** keep alarm ownership in `fsbTriggerHandleRefreshPollAlarm`, but replace per-trigger reload work with a per-tab due batch/lock. One tab batch should do one `chrome.tabs.reload(tabId)` and then per-trigger read/stage/evaluate/schedule using the same blocked/attention/ownership semantics above. Other tabs remain independent.

---

### `tests/trigger-cap-settings-ui.test.js` (test, source-shape + transform)

**Analogs:** `tests/cap-counter-live.test.js`, `tests/agent-cap-ui.test.js`, `tests/change-report-settings-ui.test.js`.

**Source-shape + helper invocation pattern** from `tests/cap-counter-live.test.js` (lines 27-38, 44-109):
```javascript
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const HELPERS_PATH = path.resolve(__dirname, '..', 'extension', 'ui', 'cap-counter-helpers.js');
const CONTROL_PANEL_HTML_PATH = path.resolve(__dirname, '..', 'extension', 'ui', 'control_panel.html');
const OPTIONS_JS_PATH = path.resolve(__dirname, '..', 'extension', 'ui', 'options.js');

function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

test('formatCounterText returns "N of M active"', () => {
  const helpers = require(HELPERS_PATH);
  assert.strictEqual(helpers.formatCounterText(3, 8), '3 of 8 active');
});
```

**DOM/script ordering source checks** from `tests/cap-counter-live.test.js` (lines 115-147):
```javascript
test('control_panel.html contains fsbAgentCapValidation and fsbAgentCapCurrentActive ids', () => {
  const html = readFile(CONTROL_PANEL_HTML_PATH);
  assert.ok(html.indexOf('id="fsbAgentCapValidation"') !== -1);
  assert.ok(html.indexOf('id="fsbAgentCapCurrentActive"') !== -1);
});

test('control_panel.html loads cap-counter-helpers.js BEFORE options.js', () => {
  const html = readFile(CONTROL_PANEL_HTML_PATH);
  const helperIdx = html.indexOf('<script src="cap-counter-helpers.js"></script>');
  const optionsIdx = html.indexOf('<script src="options.js"></script>');
  assert.ok(helperIdx < optionsIdx);
});
```

**Agent cap UI behavior checks** from `tests/agent-cap-ui.test.js` (lines 43-58, 116-137):
```javascript
assert.ok(html.indexOf('id="fsbAgentCap"') !== -1);
assert.ok(html.indexOf('id="fsbAgentCapDisplay"') !== -1);
assert.ok(html.indexOf('id="fsbAgentCapReset"') !== -1);
assert.ok(html.indexOf('min="1"') !== -1);
assert.ok(html.indexOf('max="64"') !== -1);
assert.ok(html.indexOf('step="1"') !== -1);
assert.ok(/id="fsbAgentCap"[^>]*value="8"|value="8"[^>]*id="fsbAgentCap"/.test(html));

function attachHandlers(elements, markUnsavedChanges) {
  if (elements.fsbAgentCap) {
    elements.fsbAgentCap.addEventListener('input', function(e) {
      let raw = parseInt(e.target.value, 10);
      if (!Number.isFinite(raw)) raw = 8;
      if (raw < 1) raw = 1;
      if (raw > 64) raw = 64;
      if (e.target.value !== String(raw)) e.target.value = String(raw);
      if (elements.fsbAgentCapDisplay) elements.fsbAgentCapDisplay.textContent = String(raw);
      markUnsavedChanges();
    });
  }
}
```

**Settings source-shape pattern** from `tests/change-report-settings-ui.test.js` (lines 21-76):
```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const opts = fs.readFileSync(optsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
ok(/fsbChangeReportsEnabled\s*:\s*true/.test(opts), 'defaultSettings.fsbChangeReportsEnabled = true');
ok(/elements\.fsbChangeReportsEnabled\s*=\s*document\.getElementById/.test(opts), 'cacheElements wires toggle');
ok(/elements\.fsbChangeReportsEnabled[\s\S]{0,200}addEventListener\(['"]change['"]/.test(opts), 'listener attached');
```

**Apply to new test:** assert Trigger Concurrency card copy/IDs/range/default/reset/counter, options default/cache/load/save/listener/reset wiring, helper counts active statuses only (`armed`, `needs_attention`, `blocked`), and excludes terminal/malformed records.

---

### `tests/trigger-tool-dispatcher.test.js` (test, VM request-response)

**Analog:** existing trigger VM harness in the same file.

**VM slice loader pattern** (lines 67-106):
```javascript
function loadToolHandlers(extraGlobals) {
  const src = readSource(BACKGROUND_PATH);
  const start = src.indexOf('function fsbTriggerFirstString');
  const marker = 'globalThis.fsbTriggerToolHandlersForTest';
  const markerIndex = src.indexOf(marker, start);
  const assignmentEnd = src.indexOf('\n', markerIndex);
  const slice = src.slice(start, assignmentEnd > 0 ? assignmentEnd : src.length);
  const context = Object.assign({
    console,
    Date,
    Number,
    Object,
    Array,
    String,
    Promise,
    Math,
    crypto: { randomUUID: () => 'test-random-uuid' },
    fsbTriggerIsLiveObserveSnapshot(snap) {
      return snap && snap.status === 'armed' && (snap.watch === 'live-observe' || snap.watch === 'live_observe');
    },
    fsbTriggerIsRefreshPollSnapshot(snap) {
      return snap && snap.status === 'armed' && (snap.watch === 'refresh-poll' || snap.watch === 'refresh_poll');
    }
  }, extraGlobals || {});
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(slice, context, { filename: 'background-trigger-tool-slice.js' });
  return context.fsbTriggerToolHandlersForTest;
}
```

**Ordering assertions pattern** (lines 302-316):
```javascript
const armSrc = functionSource(src, 'fsbTriggerHandleToolArm');
assertOrdered(armSrc, 'fsbTriggerOwnerContext', 'FsbTriggerManager.armTrigger', 'ownership context is resolved before armTrigger');
assertOrdered(armSrc, 'fsbTriggerValidateToolCondition', 'FsbTriggerManager.armTrigger', 'condition validation precedes armTrigger');
assertOrdered(armSrc, 'fsbTriggerSendRefreshPollRead', 'FsbTriggerManager.armTrigger', 'initial triggerRead precedes armTrigger');
assertOrdered(armSrc, 'FsbTriggerManager.armTrigger', 'fsbTriggerStartObserveForSnapshot', 'live observe startup happens after armTrigger');
assertOrdered(armSrc, 'FsbTriggerManager.armTrigger', 'triggerPulseStart', 'refresh-poll pulse startup happens after armTrigger');
```

**List active attention states test pattern** (lines 365-383):
```javascript
const records = {
  active: makeSnapshot({ trigger_id: 'active', status: 'armed' }),
  attention: makeSnapshot({ trigger_id: 'attention', status: 'needs_attention' }),
  blocked: makeSnapshot({ trigger_id: 'blocked', status: 'blocked' }),
  fired: makeSnapshot({ trigger_id: 'fired', status: 'fired' }),
  timeout: makeSnapshot({ trigger_id: 'timeout', status: 'timed_out' }),
  stopped: makeSnapshot({ trigger_id: 'stopped', status: 'stopped' })
};
const handlers = loadToolHandlers({
  FsbTriggerStore: { async hydrate() { return { v: 1, records }; } }
});
const result = await handlers.fsbTriggerHandleToolList({}, {});
assert.deepStrictEqual(Array.from(result.triggers.map(t => t.trigger_id).sort()), ['active', 'attention', 'blocked']);
```

**Side-effect ordering behavior pattern** (lines 560-581, 584-624):
```javascript
const calls = [];
const handlers = loadToolHandlers({
  async fsbTriggerSendRefreshPollRead() {
    calls.push('read');
    return { success: true, value: { text: '10' } };
  },
  FsbTriggerManager: {
    async armTrigger() {
      calls.push('arm');
      return { ok: true };
    }
  }
});
const result = await handlers.fsbTriggerHandleToolArm({ selector: '#price', target_tab_id: 10, condition: invalid }, {});
assert.strictEqual(result.success, false);
assert.deepStrictEqual(calls, [], 'invalid condition does not read DOM or arm trigger');
```

**Apply conflict tests:** use `loadToolHandlers` with a mocked `FsbTriggerStore.hydrate` returning active same-tab opposite watch snapshots. Assert `TRIGGER_TAB_WATCH_CONFLICT` returns before calls to `fsbTriggerSendRefreshPollRead`, `FsbTriggerManager.armTrigger`, `fsbTriggerStartObserveForSnapshot`, or pulse. Add same-mode live/live and refresh/refresh pass cases.

---

### `tests/trigger-refresh-poll.test.js` (test, VM event-driven)

**Analog:** existing refresh-poll source guards in the same file.

**Harness utilities** (lines 14-130):
```javascript
const fs = require('fs');
const path = require('path');

function readSource(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function sourceSliceBetween(src, startNeedle, endNeedles) {
  const start = src.indexOf(startNeedle);
  if (start < 0) return '';
  let end = src.length;
  (endNeedles || []).forEach((needle) => {
    const idx = src.indexOf(needle, start + startNeedle.length);
    if (idx >= 0 && idx < end) end = idx;
  });
  return src.slice(start, end);
}

function createChromeMock() {
  const session = createStorageArea();
  const local = createStorageArea();
  const alarms = new Map();
  return {
    storage: { session, local },
    alarms: { async create(name, options) { ... } }
  };
}
```

**Refresh-poll source guard pattern** (lines 397-448):
```javascript
check(/function\s+fsbTriggerValidateRefreshPollOwnership\s*\(/.test(src), 'ownership helper exists');
check(/TAB_NOT_OWNED/.test(src), 'TAB_NOT_OWNED ownership rejection exists');
check(/hasAgent/.test(block) && /getOwner/.test(block) && /isOwnedBy/.test(block),
  'ownership helper consults hasAgent, getOwner, and isOwnedBy');
check(!/chrome\.tabs\.query\s*\([\s\S]{0,140}active\s*:\s*true/.test(block),
  'refresh-poll helper block does not query active tab');
check(!/chrome\.tabs\.update\s*\([\s\S]{0,180}active\s*:\s*true/.test(block),
  'refresh-poll helper block does not activate tabs');
check(validateIdx >= 0 && reloadIdx >= 0 && validateIdx < reloadIdx,
  'ownership validation appears before chrome.tabs.reload');
check(/chrome\.tabs\.reload\s*\(\s*(tabId|Number\s*\(\s*tabId\s*\))/.test(block),
  'chrome.tabs.reload is called with explicit tabId');
check(/frameId\s*:\s*0/.test(block), 'triggerRead message targets frameId: 0');
check(reportedIdx >= 0 && handleIdx >= 0 && reportedIdx < handleIdx,
  'reported_value is staged before handleTriggerAlarm');
```

**Blocked/pulse/alarm guard pattern** (lines 451-518):
```javascript
check(/TRIGGER_PAGE_BLOCKED/.test(src), 'TRIGGER_PAGE_BLOCKED handling exists');
check(/status\s*=\s*['"]blocked['"]/.test(block) || /status\s*:\s*['"]blocked['"]/.test(block),
  'blocked handling writes status blocked');
check(restrictedIdx >= 0 && reloadIdx >= 0 && restrictedIdx < reloadIdx,
  'restricted URL check appears before chrome.tabs.reload');
check(blockedIdx >= 0 && reportedIdx >= 0 && blockedIdx < reportedIdx,
  'blocked response is handled before staging reported_value');
check(armedIdx >= 0 && pulseIdx >= 0 && armedIdx < pulseIdx,
  'status armed check appears before pulse restart');
check(refreshIdx >= 0 && fallbackIdx >= 0 && refreshIdx < fallbackIdx,
  'refresh-poll handling appears before lifecycle fallback');
check(/fsbTriggerHandleRefreshPollForTest/.test(src), 'test-only refresh-poll alarm hook exists');
```

**Apply coalescing tests:** extend this file with behavior tests around the test hook or source assertions proving same-tab due refresh-poll records lead to one `chrome.tabs.reload`, other-tab records reload separately, and per-trigger ownership/status handling remains independent.

---

### MCP Version, Package, Docs, And Parity Files

**Files:** `mcp/package.json`, `mcp/package-lock.json`, `mcp/src/version.ts`, `mcp/build/version.js`, `mcp/server.json`, `tests/mcp-version-parity.test.js`, `mcp/README.md`, `mcp/CHANGELOG.md`, `README.md`, `package.json`.

**Package metadata pattern** from `mcp/package.json` (lines 1-4, 42-51):
```json
{
  "name": "fsb-mcp-server",
  "version": "0.9.2",
  "description": "FSB Browser Automation MCP Server",
  "scripts": {
    "build": "npm run clean && tsc && cp ../extension/ai/tool-definitions.js ai/tool-definitions.cjs",
    "doctor": "node build/index.js doctor",
    "status": "node build/index.js status",
    "prepublishOnly": "npm run build"
  }
}
```

**Lockfile metadata pattern** from `mcp/package-lock.json` (lines 1-10):
```json
{
  "name": "fsb-mcp-server",
  "version": "0.8.0",
  "lockfileVersion": 3,
  "packages": {
    "": {
      "name": "fsb-mcp-server",
      "version": "0.8.0",
      "license": "BUSL-1.1"
    }
  }
}
```

**Runtime/build version pattern** from `mcp/src/version.ts` and `mcp/build/version.js` (both lines 1-7):
```typescript
export const FSB_SERVER_NAME = 'fsb';
export const FSB_MCP_VERSION = '0.9.2';
export const FSB_EXTENSION_BRIDGE_PORT = 7225;
export const FSB_EXTENSION_BRIDGE_URL = `ws://localhost:${FSB_EXTENSION_BRIDGE_PORT}`;
export const DEFAULT_HTTP_HOST = '127.0.0.1';
export const DEFAULT_HTTP_PORT = 7226;
export const FSB_REGISTRY_NAME = 'io.github.lakshmanturlapati/fsb-mcp-server';
```

**Server registry metadata pattern** from `mcp/server.json` (lines 1-16):
```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.lakshmanturlapati/fsb-mcp-server",
  "title": "FSB MCP Server",
  "description": "Control the FSB browser extension from any MCP client using a local stdio or Streamable HTTP companion runtime.",
  "version": "0.9.2",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "fsb-mcp-server",
      "version": "0.9.2",
      "transport": { "type": "stdio" }
    }
  ]
}
```

**Version parity test pattern** from `tests/mcp-version-parity.test.js` (lines 24-88):
```javascript
const repoRoot = path.resolve(__dirname, '..');
const canonicalVersion = '0.9.2';

function extractRuntimeVersion(versionSource) {
  const match = versionSource.match(/FSB_MCP_VERSION = '([^']+)'/);
  return match ? match[1] : null;
}

async function run() {
  const packageJson = readJson('mcp/package.json');
  const serverJson = readJson('mcp/server.json');
  const versionSource = readText('mcp/src/version.ts');
  const packageReadme = readText('mcp/README.md');
  const rootReadme = readText('README.md');

  assertEqual(packageJson.version, canonicalVersion, 'mcp/package.json version stays on canonical version parity target');
  assertEqual(extractRuntimeVersion(versionSource), canonicalVersion, 'FSB_MCP_VERSION matches canonical package version');
  assertEqual(serverJson.version, canonicalVersion, 'server.json top-level version matches canonical package version');
  assertEqual(serverJson.packages[0].version, canonicalVersion, 'server.json package version matches canonical package version');

  const helpOutput = runCommand('node mcp/build/index.js help');
  const installOutput = runCommand('node mcp/build/index.js install');
  assert(helpOutput.includes(`FSB MCP Server ${canonicalVersion}`), 'help output prints canonical MCP version');
  assert(installOutput.includes(`FSB MCP Server ${canonicalVersion}`), 'install output prints canonical MCP version');

  assert(packageReadme.includes('doctor'), 'mcp README mentions doctor');
  assert(packageReadme.includes('status --watch'), 'mcp README mentions status --watch');
  assert(rootReadme.includes('doctor'), 'root README mentions doctor');
  assert(rootReadme.includes('status --watch'), 'root README mentions status --watch');
}
```

**Trigger registrar docs source pattern** from `mcp/src/tools/triggers.ts` (lines 11-36, 71-74, 77-113, 183-259):
```typescript
export const TRIGGER_TOOL_NAMES = [
  'trigger',
  'stop_trigger',
  'get_trigger_status',
  'list_triggers',
] as const;

const TRIGGER_BLOCKING_TIMEOUT_DEFAULT_MS = 120_000;
const TRIGGER_BLOCKING_SAFETY_CEILING_MS = 240_000;

function blockingWaitMs(params: Record<string, unknown>): number {
  const requested = finitePositiveMs(params.timeout_ms) ?? TRIGGER_BLOCKING_TIMEOUT_DEFAULT_MS;
  const safety = finitePositiveMs(params.safety_ceiling_ms) ?? TRIGGER_BLOCKING_MAX_WAIT_MS;
  return Math.min(requested, safety, TRIGGER_BLOCKING_MAX_WAIT_MS);
}

if (toolName !== 'trigger') {
  const result = await sendAgentScopedBridgeMessage(...);
  return mapFSBError(result);
}

const triggerPayload = ensureTriggerId(params);
const detached = isDetached(triggerPayload);
result = await sendAgentScopedBridgeMessage(..., {
  timeout: detached ? TRIGGER_TIMEOUTS.trigger : blockingWaitMs(triggerPayload) + TRIGGER_BRIDGE_SETTLE_GRACE_MS,
  targetTabId,
  onProgress: detached ? undefined : (progress) => triggerProgressToNotification(server, extra, progress),
});

if (detached && result && result.success && result.outcome === undefined) {
  return mapFSBError({ ...result, outcome: 'detached', detached: true });
}
```

**Shared tool definition docs source** from `extension/ai/tool-definitions.js` / `mcp/ai/tool-definitions.cjs` (lines 1215-1361):
```javascript
{
  name: 'trigger',
  description: 'Arm a reactive DOM trigger on one selector...',
  inputSchema: {
    properties: {
      detached: { description: 'When true, arm and return trigger_id immediately instead of blocking.' },
      timeout_ms: { description: 'Blocking wait timeout in ms. Default 120000. Timeout returns timed_out.' },
      safety_ceiling_ms: { description: 'Maximum blocking wait before auto-detach. Default/max 240000.' },
      rearm_on_fire: { description: 'When true, keep watching after a fire...' },
      watch: { description: 'Optional watch mechanism. live-observe uses in-page mutation observation; refresh-poll periodically reloads...' }
    }
  }
}
```

**Changelog release-entry pattern** from `mcp/CHANGELOG.md` (lines 5-21):
```markdown
<a id="v0.9.2"></a>

## 0.9.2 (2026-05-16)

Milestone: FSB v0.9.69 follow-up. Patch release...

### Fixes

- **Coerce string-encoded numeric params.** ...

### Anti-scope (NOT in 0.9.2)

- No dependency bumps...
- Final `npm publish fsb-mcp-server@0.9.2` remains user-gated post-merge...
```

**README public docs placement patterns:**

- `mcp/README.md` link/tool-count summary currently uses the first viewport pattern (lines 16-20) and should keep a concise top-level pointer.
- `mcp/README.md` detailed tool guidance sections sit near Manual Tool Selection / Queueing / Multi-Agent Contract (lines 305-360). Add Trigger Watchers near this area or before/after Multi-Agent Contract.
- Root `README.md` concise user overview uses bullets in What It Does (lines 73-84) and MCP Usage Guidance (lines 327-340). Add only a short trigger watcher mention and local/browser-open limit here.

**Apply version target:** update all explicit version constants to `0.10.0`, rebuild MCP so `mcp/build/version.js` matches, and keep dependency versions unchanged. If `mcp/package-lock.json` is touched, update metadata only (`version` lines 3 and 9 shape) without dependency upgrades.

---

### UAT And Deferred Evidence Artifacts

**Files:** `20-HUMAN-UAT.md`, `16-HUMAN-UAT.md`, `16-VERIFICATION.md`, `17-HUMAN-UAT.md`, `17-VERIFICATION.md`.

**Human UAT artifact pattern** from `16-HUMAN-UAT.md` (lines 1-52):
```markdown
---
status: partial
phase: 16-live-observe-watch-analyzing-pulse
source: [16-VERIFICATION.md, 16-VALIDATION.md]
started: 2026-06-16T16:54:39Z
updated: 2026-06-16T16:54:39Z
---

# Phase 16 Human UAT

## Current Test

Awaiting Phase 20 live-browser UAT.

## Tests

### 1. Live SPA Ticker Fires With No Reload

expected: Arm a live-observe trigger on a real React/Vue/Angular ticker...

result: pending

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0
```

**Deferred-to-Phase-20 pattern** from `17-HUMAN-UAT.md` (lines 1-28):
```markdown
---
status: deferred_to_phase_20
phase: 17-refresh-poll-watch-tab-owning-background-reload
source: [17-VALIDATION.md, 17-04-PLAN.md]
created: 2026-06-16T18:27:52Z
---

## Test: Refresh-Poll Background Tab Does Not Steal Focus

1. Install the extension in Chrome with the Phase 17 build.
2. Open a static/server-rendered page in an owned background tab and arm a refresh-poll trigger at `poll_interval_ms:60000`.
3. Keep a different tab foregrounded.
4. Wait for one poll tick.
5. Confirm the watched tab reloads and the foreground tab remains active.

expected: the watched tab reloads and the background tab remains background.

result: pending
```

**Verification carry-forward pattern** from `16-VERIFICATION.md` (lines 1-19, 78-87):
```markdown
status: human_needed
human_verification:
  - test: "Live React/Vue/Angular ticker fires with no reload"
    expected: "Arm a live-observe trigger..."
    why_human: "Node mocks cannot exercise real framework re-render timing..."

## Human Verification Required

These items are deferred per `16-VALIDATION.md` and `16-CONTEXT.md`...
Saved to `16-HUMAN-UAT.md`.
```

**Verification deferred item pattern** from `17-VERIFICATION.md` (lines 7-10, 36-43):
```markdown
deferred:
  - truth: "Real installed-Chrome inactive-tab refresh-poll reload does not steal focus"
    addressed_in: "Phase 20"
    evidence: "17-HUMAN-UAT.md records status deferred_to_phase_20..."

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | Real installed-Chrome inactive-tab refresh-poll reload does not steal focus | Phase 20 | `17-HUMAN-UAT.md` ... |
```

**Apply to Phase 20:** create `20-HUMAN-UAT.md` with explicit status per scenario (`passed`, `blocked`, or `human_needed`) and evidence fields. Then update Phase 16/17 deferred artifacts only to point to Phase 20 results; do not fabricate browser proof.

## Shared Patterns

### Trigger Cap UI Storage Contract
**Source:** `extension/utils/trigger-manager.js` lines 472-491, 547-627, 668-682.
**Apply to:** `control_panel.html`, `options.js`, `cap-counter-helpers.js`, `trigger-cap-settings-ui.test.js`.
```javascript
var FSB_TRIGGER_CAP_STORAGE_KEY = 'fsbTriggerCap';
var FSB_TRIGGER_CAP_DEFAULT = 8;
var FSB_TRIGGER_CAP_MIN = 1;
var FSB_TRIGGER_CAP_MAX = 64;

function _clampCap(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return FSB_TRIGGER_CAP_DEFAULT;
  var i = Math.floor(v);
  if (i < FSB_TRIGGER_CAP_MIN) return FSB_TRIGGER_CAP_MIN;
  if (i > FSB_TRIGGER_CAP_MAX) return FSB_TRIGGER_CAP_MAX;
  return i;
}
```

### Trigger Registry Envelope
**Source:** `extension/utils/trigger-store.js` lines 22-44, 76-96, 168-180.
**Apply to:** active counter, conflict scan, coalescing due scan.
```javascript
var FSB_TRIGGER_REGISTRY_STORAGE_KEY = 'fsbTriggerRegistry';

async function _readEnvelope() {
  var stored = await c.storage.session.get([FSB_TRIGGER_REGISTRY_STORAGE_KEY]);
  var payload = stored ? stored[FSB_TRIGGER_REGISTRY_STORAGE_KEY] : null;
  if (!payload || typeof payload !== 'object') return { v: 1, records: {} };
  if (!payload.records || typeof payload.records !== 'object') return { v: 1, records: {} };
  return payload;
}

async function hydrate() {
  return await _readEnvelope();
}
```

### Background Conflict Error Shape
**Source:** current background typed-error style from `fsbTriggerHandleToolArm`, `fsbTriggerHandleToolList`, and refresh-poll errors.
**Apply to:** `TRIGGER_TAB_WATCH_CONFLICT`.
```javascript
return {
  success: false,
  error: 'TRIGGER_TAB_WATCH_CONFLICT',
  code: 'TRIGGER_TAB_WATCH_CONFLICT',
  errorCode: 'TRIGGER_TAB_WATCH_CONFLICT',
  target_tab_id: Number(tabId),
  existing_trigger_id: conflict.trigger_id || conflict.id || null,
  existing_watch: conflict.watch || conflict.mode || null,
  requested_watch: watch
};
```

### Refresh-Poll No-Focus Contract
**Source:** `extension/background.js` lines 3698-3735 and `tests/trigger-refresh-poll.test.js` lines 397-448.
**Apply to:** coalesced reload implementation and tests.
```javascript
const ownership = fsbTriggerValidateRefreshPollOwnership(snap);
if (!ownership || ownership.ok !== true) {
  return fsbTriggerMarkRefreshPollAttention(...);
}
const tabId = ownership.tabId;
if (registry && typeof registry.stampAgentNavigation === 'function') {
  try { registry.stampAgentNavigation(tabId); } catch (_err) {}
}
await chrome.tabs.reload(tabId);
```
Tests must continue asserting no active-tab query/update and explicit `chrome.tabs.reload(tabId)`.

### Plain Node Test Style
**Source:** `tests/change-report-settings-ui.test.js` lines 21-80 and `tests/trigger-refresh-poll.test.js` lines 23-31.
**Apply to:** all new/extended focused tests.
```javascript
let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}
```

### MCP Release Parity Bundle
**Source:** `tests/mcp-version-parity.test.js`, `mcp/package.json`, `mcp/src/version.ts`, `mcp/server.json`, `mcp/build/version.js`, `mcp/README.md`, `README.md`.
**Apply to:** version prep and docs updates.
```javascript
const canonicalVersion = '0.10.0';
assertEqual(packageJson.version, canonicalVersion, 'mcp/package.json version stays on canonical version parity target');
assertEqual(extractRuntimeVersion(versionSource), canonicalVersion, 'FSB_MCP_VERSION matches canonical package version');
assertEqual(serverJson.version, canonicalVersion, 'server.json top-level version matches canonical package version');
assert(helpOutput.includes(`FSB MCP Server ${canonicalVersion}`), 'help output prints canonical MCP version');
```

## No Analog Found

None. Every file has an exact or role-equivalent local analog. The main implementation novelty is refresh-poll same-tab coalescing, but it should be built by preserving the existing refresh-poll alarm/tick ownership, blocked-page, reload, read, lifecycle, and reschedule patterns listed above.

## Metadata

**Analog search scope:** `extension/ui`, `extension/background.js`, `extension/utils/trigger-*`, `tests`, `mcp`, `README.md`, `.planning/phases/*HUMAN-UAT.md`, `.planning/phases/*VERIFICATION.md`.
**Files scanned:** 713 tracked/repo files via `rg --files` count, plus required phase artifacts.
**Pattern extraction date:** 2026-06-17
**Project guidance:** no `CLAUDE.md`, `AGENTS.md`, `.claude/skills`, or `.agents/skills` files were present in the workspace.
