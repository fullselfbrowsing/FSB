# Phase 16: Live-Observe Watch & Analyzing Pulse - Pattern Map

**Mapped:** 2026-06-16
**Files analyzed:** 9 (2 NEW source + 4 MOD source + 1 SW-seam extend + 2 NEW tests, plus 2 test extensions)
**Analogs found:** 9 / 9 (every file has a verified in-tree analog)
**Provenance:** Every `file:line` below was re-opened on branch `automation` and verified against 16-RESEARCH.md § Sources. Drifted ranges are noted inline; none drifted materially.

> This consolidates 16-RESEARCH.md (which already nailed the clone sources) into the planner→executor file→analog table. The research did the derivation; this file is the verification + the per-file "mirror exactly these lines" map. No clone source moved since the research pass.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **NEW** `extension/content/trigger-observe.js` | content module (isolated-world observer) | event-driven → request-response (debounced report) | `extension/content/dom-stream.js` (`startMutationStream`/`stopMutationStream`/`flushMutations`) | role-match + flow-match (skeleton clone; rAF→setTimeout, body→container) |
| **MOD** `extension/content/visual-feedback.js` | content component (Shadow-DOM overlay) | render / transform | itself — `ActionGlowOverlay.show()` + `fsbActionGlow` keyframe + reduced-motion `@media` | exact (additive variant of the same class) |
| **MOD** `extension/content/messaging.js` | content router (message dispatch) | request-response (named-listener) | itself — `highlightElement` case + `return true` async pattern | exact (additive switch cases) |
| **MOD** `extension/content/overlay-state.js` | shared util (state builder) | transform (pure object build) | itself — `buildOverlayState` spread-guarded fields | exact (additive field) |
| **MOD** `extension/background.js` | service worker glue | event-driven (onMessage) + request-response (re-arm) + scheduled (watchdog) | itself — `domStreamMutations` onMessage case + idempotent `alarms.create` + `webNavigation.onCommitted` + `ensureContentScriptInjected` + `onAlarm` prefix dispatch | exact (additive case + bundle entry) |
| **EXTEND** `extension/utils/trigger-lifecycle.js` (SEAM; **no new fire logic**) | SW util (fire SEAM) | transform / event-driven | itself — `handleTriggerAlarm` SEAM (`reported_value` consume + atomic fired write-back); `armTrigger` for test-arm | exact (reuse; optional thin on-report entrypoint) |
| **NEW** `tests/trigger-observe.test.js` | test (Node-mock content sandbox) | test | `tests/overlay-stability-cadence.test.js` (vm.createContext) + `tests/change-report-builder.test.js` (StubObserver leak count) | role-match (compose both harnesses) |
| **NEW** `tests/trigger-observe-pulse.test.js` | test (vm-sandbox + source-grep) | test | `tests/overlay-stability-cadence.test.js` (vm `ActionGlowOverlay`) + `tests/dom-stream-perf.test.js` (`fs.readFileSync` source asserts) | role-match |
| **EXTEND** `tests/trigger-lifecycle.test.js` | test extension | test | itself — `setupSeamHarness` | exact |
| **EXTEND** `tests/test-overlay-state.js` | test extension | test | itself — additive-field assertions | exact |

> `extension/content/selectors.js`, `extension/content/lifecycle.js`, `extension/utils/trigger-store.js`, `extension/utils/trigger-manager.js`, `extension/utils/value-extractor.js`, `extension/manifest.json` are **reused unchanged** — APIs the new code calls, not files it edits. Their call-site lines are in Shared Patterns below.

---

## Pattern Assignments

### `extension/content/trigger-observe.js` (NEW — content module, event-driven→request-response)

**Analog:** `extension/content/dom-stream.js` — clone the construct/observe/debounce/`sendMessage`/`.disconnect()` skeleton; **scope to ONE stable container (not `document.body`)** and **swap `requestAnimationFrame` → trailing `setTimeout` (~150–300ms)** per D-06.

**Idempotent start + observe skeleton to mirror** (`dom-stream.js:743-767`):
```javascript
// dom-stream.js:744 — idempotent start (Phase 16: mirror PER trigger_id, disconnect any prior entry first)
function startMutationStream() {
  if (mutationObserver) { mutationObserver.disconnect(); }     // ◄ Phase 16: stop(triggerId) before re-observe
  pendingMutations = [];
  mutationObserver = new MutationObserver(function(mutations) {  // :750 — the construct to clone
    for (var i = 0; i < mutations.length; i++) { pendingMutations.push(mutations[i]); }
    if (batchTimer) cancelAnimationFrame(batchTimer);           // ◄ Phase 16 SWAPS → clearTimeout
    batchTimer = requestAnimationFrame(flushMutations);         // ◄ Phase 16 SWAPS → setTimeout(flush, DEBOUNCE_MS)
  });
  mutationObserver.observe(document.body, {                     // ◄ Phase 16: observe(container, optsFor(extract))
    childList: true, attributes: true, characterData: true,
    subtree: true, attributeOldValue: true                     // ◄ Phase 16: per D-05; *OldValue OFF
  });
}
```

**Guaranteed-disconnect teardown to mirror** (`dom-stream.js:802-816`):
```javascript
function stopMutationStream() {
  if (batchTimer) { cancelAnimationFrame(batchTimer); batchTimer = null; }   // ◄ Phase 16: clearTimeout
  if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }  // (trigger uses the SW alarm, not this)
  if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }  // ◄ the GUARANTEED .disconnect()
}
```

**Report wire to mirror** (`dom-stream.js:705-729` — the exact `sendMessage` shape, `.catch`, and `try/catch` context-invalidation guard):
```javascript
function flushMutations() {
  batchTimer = null;
  if (pendingMutations.length === 0) return;
  var batch = pendingMutations; pendingMutations = [];
  var diffs = processMutationBatch(batch);          // ◄ Phase 16: re-resolve leaf + readValue → {text, attributes?}
  if (diffs.length === 0) return;
  try {
    chrome.runtime.sendMessage({
      action: 'domStreamMutations',                 // ◄ Phase 16: 'triggerValueChanged' (D-discretion name)
      mutations: diffs, streamSessionId: streamSessionId || '', /* ... */
    }).catch(function(err){ /* rateLimitedWarn */ });
  } catch (e) { /* extension context invalidated */ }
}
```

**Module shape to mirror** — IIFE guard + `FSB.<module>` registration + `module.exports` test hook:
- IIFE + skip-guard: `dom-stream.js:6` `(function(){ if (window.__FSB_SKIP_INIT__) return; var FSB = window.FSB; ... })()`.
- onMessage router inside the module: `dom-stream.js:970-1053` (`chrome.runtime.onMessage.addListener`).
- Namespace registration: `dom-stream.js:1059` `FSB.domStream = {...}`.
- `module.exports` test hook: copy the pattern at `visual-feedback.js:2300-2306` (export the registry/`start`/`stop`/`optsFor`/`readValue` for the Node test).

**Per-trigger registry + idempotent-arm guard + per-batch re-resolve + disconnect-all** — the research operationalized this verbatim in 16-RESEARCH.md:500-545 (Pattern: registry/start/stop/disconnectAll/flush) and :547-555 (teardown wiring). Mirror that block. Load-bearing invariants for the executor:
- `start(triggerId, …)` calls `stop(triggerId)` FIRST (no stacking) → mirrors `dom-stream.js:744`.
- Idempotent-arm guard: `leaf.dataset.fsbTriggerArmed === triggerId` check at top of `start()`, set after `observe()` (D-04; name is D-discretion).
- Per-batch re-resolve via `FSB.querySelectorWithShadow(selector)` (selectors.js:497) **inside `flush`** (D-04 case 2), with the stale-cache bust `if (leaf && !leaf.isConnected) leaf = null;` (Pitfall 6 — selectors.js returns cached without an `isConnected` check, verified selectors.js:505-509).
- `disconnectAll()` on `beforeunload` + **non-persisted `pagehide`** + re-inject; **NOT** on `pagehide(persisted)` (BF-cache survival, D-04 case 1).

**observe-options-per-extract-kind (`optsFor`) and `readValue`** — research code-ready at 16-RESEARCH.md:472-497. text/number → `{childList:true, characterData:true, subtree:true}`; attribute → `{attributes:true, attributeFilter:[attrName]}`. `readValue` returns the locked `{text, attributes?}` contract (form controls → `.value`, else `.textContent`, trimmed).

---

### `extension/content/visual-feedback.js` (MOD — content component, render)

**Analog:** itself — extend the **Shadow-DOM `ActionGlowOverlay`** (NOT inline `HighlightManager`, D-07). Add `showPulse()`/`clearPulse()` + a `@keyframes fsb-trigger-pulse` variant + a `.box-overlay.trigger-pulse` class to the SAME closed-Shadow `<style>` the class already injects.

**Closed-Shadow host + existing keyframe + `.box-overlay` + reduced-motion block** (the injection site — add the pulse ALONGSIDE `fsbActionGlow`):
```javascript
// visual-feedback.js:1508 — ActionGlowOverlay.show(element)
this.shadow = this.host.attachShadow({ mode: 'closed' });   // :1522 — the closed Shadow DOM
const style = document.createElement('style');
style.textContent = `
  @keyframes fsbActionGlow { ... box-shadow ... }            // :1527 — EXISTING run_task glow (static box-shadow)
  // ─── PHASE 16 ADD: @keyframes fsb-trigger-pulse { opacity/transform ONLY } ───
  .box-overlay {                                             // :1576 — EXISTING
    border: 2.5px solid rgba(255,140,0,0.8); border-radius: 10px;
    animation: fsbActionGlow 1.5s ease-in-out infinite;     // :1580 — amber, fast, box-shadow
    background: rgba(255,140,0,0.04);
  }
  // ─── PHASE 16 ADD: .box-overlay.trigger-pulse { distinct hue, slower, animation: fsb-trigger-pulse;
  //                   will-change: opacity, transform; } ───
  @media (prefers-reduced-motion: reduce) {                 // :1601 — EXISTING block, EXTEND
    .box-overlay, .text-highlight { transition: none; }     // :1604
    .box-overlay.active, .text-highlight.active { animation: none; }  // :1608
    // ─── PHASE 16 ADD: .box-overlay.trigger-pulse { animation: none; <static cue> } (VIS-04) ───
  }
`;
```
Existing `will-change` discipline to match: `.box-overlay`/`.text-highlight` already declare `will-change: top, left, width, height, opacity, transform;` (`:1574`) — the pulse class adds `will-change: opacity, transform;` only (D-08, GPU-composited).

**`showPulse()`/`clearPulse()` entrypoints to ADD** — reuse the full Shadow-DOM build + tracking, toggle the variant class on `this.boxOverlay`:
- `show()` already builds the overlay + calls `_startTracking()` (`:1641`) + `_updatePosition()` (`:1628`). `showPulse(el)` calls `this.show(el)` then adds `trigger-pulse` to `this.boxOverlay`.
- The box element is created in `_ensureBoxOverlay()` (`:1452-1458`, `className='box-overlay'`) and toggled active in `_setActiveState()` (`:1494-1499`). `_updatePosition()`'s box branch (`:1672-1686`) re-sets geometry every tick — **reapply `.trigger-pulse` in that branch** if `this._pulseMode` (the box element persists, but guard against any class reset).
- `clearPulse()` removes the class then calls `this.destroy()` — the guaranteed teardown at `:1795-1817` (nulls host/shadow/overlayRoot/boxOverlay, `_stopTracking`, `demoteFromTopLayer`).

**Orphan-clear teardown to extend** (`visual-feedback.js:2244-2266`) — the `beforeunload` block already destroys `actionGlowOverlay` (`:2252`). Phase 16: also clear the pulse here AND add a **non-persisted `pagehide`** path (the existing block only hooks `beforeunload`, unreliable on BF-cache; D-11/Pitfall 7). On `pagehide(persisted)` do NOT destroy (BF-cache survival).

**Test hook already present** (`visual-feedback.js:2300-2306`) — `module.exports` ALREADY exports `ActionGlowOverlay`. The pulse test (`trigger-observe-pulse.test.js`) consumes it via the existing vm-sandbox path; **no new export needed** for `ActionGlowOverlay`.

---

### `extension/content/messaging.js` (MOD — content router, request-response)

**Analog:** itself — the `highlightElement` case + the named-listener `return true` async pattern.

**`highlightElement` case to mirror** (`messaging.js:1229-1243`) — selector resolve → action → `sendResponse`, `return true` for async:
```javascript
case 'highlightElement':
  (async () => {
    try {
      const element = FSB.querySelectorWithShadow(request.selector);   // ◄ resolve pattern Phase 16 reuses
      if (element) {
        await FSB.highlightManager.show(element, { duration: request.duration || 2000 });
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Element not found' });
      }
    } catch (error) { sendResponse({ success: false, error: error.message }); }
  })();
  return true;                                                          // ◄ async sendResponse contract
```

**Additive cases to ADD** (D-01/D-10; action names are D-discretion, follow `domStream*`/`highlightElement` naming):
- `triggerObserveStart` → `FSB.triggerObserve.start(trigger_id, selector, extract, attrName)`; `triggerObserveStop` → `FSB.triggerObserve.stop(trigger_id)`.
- `triggerRead` → resolve + `readValue` + `sendResponse({value})` (synchronous read path for the test-arm / watchdog).
- `triggerPulseStart` → `FSB.querySelectorWithShadow(selector)` then `FSB.actionGlowOverlay.showPulse(el)`; `triggerPulseStop` → `FSB.actionGlowOverlay.clearPulse()`.
- All mirror the `(async()=>{ ... })(); return true;` shape; all guard with the same `try/catch → sendResponse({success:false, error})`.

**Listener registration shape** (`messaging.js:1424-1432`) — the switch ends with `default: sendResponse({error:'Unknown action'})` + `return true` (`:1424-1428`); registered via the NAMED function `chrome.runtime.onMessage.addListener(handleBackgroundMessage)` (`:1432`, Chrome dedups identical refs). New cases go inside this switch.

**Single-overlay watchdog to respect** (`messaging.js:1196-1209`) — the orphan-timer block (`:1199-1209`) destroys `actionGlowOverlay`/`viewportGlow`/`progressOverlay` on extended silence; `:1196` hides `actionGlowOverlay` before showing `viewportGlow`. The pulse is a **state of the single `actionGlowOverlay`**, never a second overlay (one-owner-per-tab, D-10) — gate `showPulse` against an active `run_task` glow.

---

### `extension/content/overlay-state.js` (MOD — shared util, transform)

**Analog:** itself — add `mode:'trigger-watch'` as a spread-guarded additive field in the `buildOverlayState` return, exactly like the existing `agentIdShort` field. **No existing field changes** (D-09; dashboard mirror consumes this object).

**Return block to extend** (`overlay-state.js:379-393`):
```javascript
return {
  ...(sessionToken ? { sessionToken: sessionToken } : {}),     // :380
  ...(version !== null ? { version: version } : {}),
  ...(clientLabel ? { clientLabel: clientLabel } : {}),
  ...(agentIdShort ? { agentIdShort: agentIdShort } : {}),     // :383 — the spread-guard TEMPLATE to copy
  // ─── PHASE 16 ADD: ...(statusData && statusData.mode ? { mode: String(statusData.mode) } : {}), ───
  lifecycle: lifecycle, result: result,                        // :384 — UNCHANGED
  phase: lifecycle === 'cleared' ? 'cleared' : normalizedPhase,
  display: buildOverlayDisplay(...), progress: buildOverlayProgress(...),
  actionCount: null,
  highlight: { animated: ... }
};
```

**Label string** — belongs in this shared util (the dashboard mirror also consumes it), NOT hard-coded in the content script. Add a `mode==='trigger-watch'` → `"Watching a trigger"` entry alongside `humanizeOverlayPhase` (exported at `:438`; the phase-humanizer the overlay surface already calls). Export object is at `:432-444` (`global.FSBOverlayStateUtils` + `module.exports` at `:446-448`).

---

### `extension/background.js` (MOD — service worker glue)

**Analog:** itself — four additive seams, each beside a verified precedent.

**1. Value-report onMessage case** — model on `domStreamMutations` (`background.js:6346-6375`), inside the listener at `:5436` (sender-guarded, `sender.tab.id` available):
```javascript
// background.js:5436 — the listener + sender guard the new case lives under
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {                    // :5438 — KEEP this guard (V4/Spoofing mitigation)
    sendResponse({ success: false, error: 'Unauthorized sender' }); return;
  }
  ...
  switch (request.action) {                                 // :5448
    // ─── PHASE 16 ADD case 'triggerValueChanged'/'triggerValueReport': ───
    //   const triggerId = request.trigger_id; const value = request.value || {};
    //   (async () => { snap = await FsbTriggerStore.readSnapshot(triggerId);
    //     if (!snap || snap.status !== 'armed') { sendResponse({ok:true, ignored:true}); return; }
    //     snap.reported_value = (typeof value.text === 'string') ? value.text : snap.last_value;  // V5 type-validate
    //     if (value.attributes) snap.reported_attributes = value.attributes;
    //     await FsbTriggerStore.writeSnapshot(triggerId, snap);
    //     await FsbTriggerLifecycle.handleTriggerAlarm({ name: FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX + triggerId });
    //     <idempotent watchdog create — see below>; sendResponse({ok:true});
    //   })(); return true;   // async sendResponse (mirror highlightElement / messaging.js:1243)
```
> **Why this is minimal:** the SEAM at `trigger-lifecycle.js:335-339` ALREADY builds `reportedValue = {text: snap.reported_value ?? snap.last_value}` and calls `manager.evaluate`; `:353-359` does the atomic fired write-back + `clearAlarm`. Writing `reported_value` then invoking `handleTriggerAlarm` reuses 100% of the shipped fire path with zero duplicated fire-path I/O (RESEARCH A1; OQ-1). The comment at `trigger-lifecycle.js:330-334` literally names "the Phase 16/17 watch layer will supply" this input.

**2. Idempotent watchdog `alarms.create`** — model `domStreamMutations` (`background.js:6358-6366`):
```javascript
// background.js:6361 — idempotent: recreating same name replaces the schedule (safe every dispatch)
var armResult = alarmsApi.create('fsb-domstream-watchdog', { periodInMinutes: 1 });
// ─── PHASE 16: chrome.alarms.create('fsbTriggerObserveWatchdog:' + triggerId, { periodInMinutes: 1 }) ───
```
Use a **NEW recurring name** `fsbTriggerObserveWatchdog:<id>` (or one shared name) — do NOT overload the one-shot `fsbTrigger:<id>` TTL alarm (`{when:deadline_at}`) which has different semantics (OQ-3). 30s alarm floor (Chrome 120).

**3. SW-side re-arm on full reload** — `webNavigation.onCommitted` (`:2677`) / `tabs.onUpdated status==='complete'` → `ensureContentScriptInjected(tabId)` (`:3208`, status gate `:3213/:3217`) → re-send `triggerObserveStart`. For the trigger's OWNED tab only. The fresh script has no idempotent-arm flag → arms cleanly (D-04 case 3).
```javascript
// background.js:3208 — ensureContentScriptInjected gates on tab.status === 'loading' then waits for 'complete'
async function ensureContentScriptInjected(tabId, maxRetries = 3) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'loading') {                           // :3213
    await new Promise(resolve => {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {  // :3217 — the re-arm trigger point
          chrome.tabs.onUpdated.removeListener(listener); resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener); ...
    });
  }
  ... // port/ready/health checks → returns true when injected
}
```

**4. Watchdog alarm dispatch branch** — `onAlarm` dispatcher (`background.js:13330`) already routes `alarm.name.startsWith(TRIGGER_ALARM_PREFIX)` → `handleTriggerAlarm` (`:13359-13361`). Add a sibling branch: `alarm.name.startsWith('fsbTriggerObserveWatchdog:')` → re-issue `triggerObserveStart` to the owned tab if the snapshot is armed-but-stale.
```javascript
// background.js:13359 — the existing prefix dispatch to mirror with a new branch
if (FsbTriggerLifecycle && typeof FsbTriggerLifecycle.handleTriggerAlarm === 'function'
    && alarm.name.startsWith(FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX)) {
  await FsbTriggerLifecycle.handleTriggerAlarm(alarm);      // :13361
}
// ─── PHASE 16 ADD: else if (alarm.name.startsWith('fsbTriggerObserveWatchdog:')) { ...re-issue observe... } ───
```

**5. Register the new content module** — `CONTENT_SCRIPT_FILES` (`background.js:267-285`, injected at `:3313`/`:11818`). Insert `'content/trigger-observe.js'` AFTER `'content/selectors.js'` (`:277`) and `'content/visual-feedback.js'` (`:279`) — it depends on `FSB.querySelectorWithShadow` and `FSB.actionGlowOverlay` — and BEFORE `'content/messaging.js'` (`:283`) so the router can reference it:
```javascript
const CONTENT_SCRIPT_FILES = [                              // :267
  ...'content/selectors.js',                               // :277
  'content/badge-combine.js',
  'content/visual-feedback.js',                            // :279
  // ─── PHASE 16 ADD: 'content/trigger-observe.js', (after visual-feedback, before messaging) ───
  'content/accessibility.js', 'content/actions.js', 'content/dom-analysis.js',
  'content/messaging.js',                                  // :283
  'content/lifecycle.js'                                   // :284
];
```

---

### `extension/utils/trigger-lifecycle.js` (EXTEND — SW SEAM, NO new fire logic)

**Analog:** itself (the Phase-15 SEAM). Phase 16 adds **no comparison logic** — it reuses the shipped fire path.

**The SEAM the value-report case feeds** (`trigger-lifecycle.js:289-360`) — re-read snapshot → guards → `reported_value` consume → `evaluate` → atomic fired write-back:
```javascript
async function handleTriggerAlarm(alarm) {                  // :269
  ...
  var snap = await store.readSnapshot(triggerId);           // :290 — re-reads STORAGE (incl. reported_value)
  if (snap.status === 'fired' || snap.status === 'stopped') // :298 — noop_terminal (storage-backed dedupe)
    return { ok: true, action: 'noop_terminal' };
  if (Number.isFinite(Number(snap.deadline_at)) && now >= Number(snap.deadline_at)) {  // :307 — TTL reap
    await store.deleteSnapshot(triggerId); await clearAlarm(alarm.name);
    return { ok: true, action: 'reaped_ttl' };
  }
  var reportedValue = {                                     // :335 — Phase 16 SUPPLIES snap.reported_value
    text: (snap.reported_value != null ? snap.reported_value : snap.last_value)  // :336 (comment :330-334 names Phase 16/17)
  };
  var outcome = manager.evaluate(snap, reportedValue, now); // :339 — the pure decision
  if (outcome.outcome === 'fired') {                        // :350 — ATOMIC terminal write-back
    snap.status = 'fired'; snap.fired_at = now;             // :353-354
    ...fold next_state...
    await store.writeSnapshot(triggerId, snap);             // :358
    await clearAlarm(alarm.name);                           // :359
    return { ok: true, action: 'fired', outcome: outcome };
  }
  ... // non-fire: persist edge state, STAY armed (:366-368)
}
```
> **Planner choice (OQ-1 / A1):** Default — invoke `handleTriggerAlarm({name})` from the SW case (reuses the entire path incl. TTL-reap + terminal guard). If on-every-report TTL is unwanted, extract a thin `evaluateReportedValue(triggerId, value, now)` that runs the SAME `:289-360` block minus the TTL check — but **do NOT add a second copy of the fired write-back** (`:353-359` is the sole owner of fire-path I/O).

**Test-arm path** — `armTrigger(snapshot)` (`trigger-lifecycle.js:195-215`): writes the snapshot (`:208`) then arms the one-shot `{when: deadline_at}` alarm (`:212`). The D-03 test-only arm helper builds an `armed` snapshot (status/selector/extract/deadline_at/target_tab_id), calls `armTrigger`, then sends `triggerObserveStart` + `triggerPulseStart` to the tab.

**Constant:** `TRIGGER_ALARM_PREFIX = 'fsbTrigger:'` (`:60`) — used to synthesize the alarm name in the SW case.

---

### `tests/trigger-observe.test.js` (NEW — Node-mock content sandbox)

**Analogs:** `tests/overlay-stability-cadence.test.js` (vm.createContext content sandbox) + `tests/change-report-builder.test.js` (StubObserver observe/disconnect-count leak assertion).

**vm.createContext sandbox to clone** (`overlay-stability-cadence.test.js`):
```javascript
const vm = require('vm');                                   // :21
// fake document with attachShadow + createElement stubs:
//   makeElement(...) with attachShadow(opts) (:135), createElement(tag) (:187)
const ctx = vm.createContext(sandbox);                      // :235 — load the content module under this ctx
const { /* exports */ } = sandbox.module.exports;           // :242 — destructure the module's test-hook exports
```
For `trigger-observe.js` the sandbox needs: fake `document` (`querySelector`/`createElement`), a stub `MutationObserver` (below), fake `setTimeout`/`clearTimeout` (controllable), a fake `chrome.runtime.sendMessage` recorder, and a fake `window.FSB.querySelectorWithShadow`.

**StubObserver (observe/disconnect counting) to clone** (`change-report-builder.test.js:31-33`):
```javascript
global.MutationObserver = global.MutationObserver || function StubObserver() {
  this.observe = () => {};          // ◄ Phase 16: count calls + record (target, options) for the opts-per-kind assert
  this.disconnect = () => {};       // ◄ Phase 16: count calls — the LEAK assert (observe count === disconnect count)
};
```

**Assertions (from RESEARCH Test Map):** `optsFor` per extract kind (D-05); one debounced `sendMessage({action:'triggerValueChanged', value:{text}})` per burst, coalesces N→1 (D-06); report shape exactly `{text, attributes?}`; idempotent start (2nd `start(same_id)` → disconnect prior); **leak test** (every observer disconnected, registry empty, disconnect===observe); `pagehide(persisted)` does NOT disconnect, non-persisted DOES; per-batch re-resolve calls `querySelectorWithShadow` + busts stale `!isConnected` hit (Pitfall 6); source-grep (`dom-stream-perf.test.js` style, below) that re-arm is wired off `webNavigation`/`ensureContentScriptInjected` and NOT the google-gated SPA hooks.

---

### `tests/trigger-observe-pulse.test.js` (NEW — vm-sandbox + source-grep)

**Analogs:** `tests/overlay-stability-cadence.test.js` (vm `ActionGlowOverlay` — already imports it) + `tests/dom-stream-perf.test.js` (source-grep static invariants).

**vm-sandbox `ActionGlowOverlay`** — reuse the SAME sandbox at `overlay-stability-cadence.test.js:235/242` and construct `new ActionGlowOverlay()` (`:517`). Assert `showPulse(el)` adds `trigger-pulse` to `boxOverlay`; `clearPulse()` removes it + destroys. `ActionGlowOverlay` is already in `visual-feedback.js`'s `module.exports` (`:2300-2306`) — no new export.

**Source-grep static invariants to clone** (`dom-stream-perf.test.js:32-50`):
```javascript
const src = fs.readFileSync(<visual-feedback.js path>, 'utf8');     // :32 pattern
assert(src.includes('@keyframes fsb-trigger-pulse'), 'pulse keyframe present');           // VIS-01
assert(!/fsb-trigger-pulse[\s\S]*?box-shadow/.test(<keyframe block>), 'opacity/transform only');  // VIS-01/D-08
assert(src.includes('.box-overlay.trigger-pulse'), 'distinct variant class');             // VIS-01
// reduced-motion: .box-overlay.trigger-pulse { animation: none } inside the @media block  // VIS-04
```

---

### `tests/trigger-lifecycle.test.js` (EXTEND) & `tests/test-overlay-state.js` (EXTEND)

- **`trigger-lifecycle.test.js`** — reuse `setupSeamHarness()` (`:183`; built on `createStorageArea` `:80` + `createChromeMock` `:116`). Add a case: write `reported_value` into the armed snapshot, call `handleTriggerAlarm({name:'fsbTrigger:<id>'})`, assert it fires on edge-true and disarms (status `fired` + alarm cleared). Mirrors the existing Case C/D/E structure (`:245+`).
- **`test-overlay-state.js`** — assert `buildOverlayState({mode:'trigger-watch'}, …)` includes `mode:'trigger-watch'` AND no existing field (`lifecycle`/`result`/`phase`/`display`/`progress`) regressed.
- **`package.json` test chain** — append `node tests/trigger-observe.test.js && node tests/trigger-observe-pulse.test.js` at the TAIL, after `node tests/trigger-cap.test.js` (the last entry in the trigger cluster: `trigger-store → trigger-lifecycle → value-extractor → trigger-manager → trigger-cap`).

---

## Shared Patterns

### Sender-origin trust boundary (apply to the SW value-report case)
**Source:** `extension/background.js:5438` (the `:5436` listener).
```javascript
if (sender.id !== chrome.runtime.id) {                      // reject forged value reports (V4 / Spoofing)
  sendResponse({ success: false, error: 'Unauthorized sender' }); return;
}
```
The new `triggerValueChanged` case lives UNDER this guard automatically (same listener). Additionally **type-validate** `value.text` (`typeof value.text === 'string'`) before writing `reported_value` (V5 — untrusted page content); the ReDoS/size caps are downstream in `FsbTriggerManager` (shipped Phase 15) — do NOT compile/match regex in the content script.

### Selector resolution + uniqueness (apply to trigger-observe per-batch re-resolve, and the pulse/observe/read router cases)
**Source:** `extension/content/selectors.js`.
- `FSB.querySelectorWithShadow(selector)` (`:497`) — shadow-pierce + XPath + cache. **Cache caveat (Pitfall 6):** returns `cached` at `:505-509` WITHOUT an `isConnected` check → after an SPA swap it may hand back the detached node. Bust with `if (cached && !cached.isConnected)` before trusting it.
- `FSB.validateSelectorUniqueness(selector, root)` (`:22`) — typed `{isValid, isUnique, count, error?}` for classifying a re-resolution as hit/ambiguous/miss (calls `querySelectorAll` LIVE, not the cache).

### Pure fire decision (driven only via the SEAM, never called direct from the new case)
**Source:** `extension/utils/trigger-manager.js:374` `evaluate(snapshot, reportedValue, now)` — all 6 kinds + compound + edge-fire + locale-safe numeric + ReDoS caps. **Anti-Pattern 2:** NEVER evaluate in the content script. The SW case feeds it via `reported_value` + `handleTriggerAlarm` (trigger-lifecycle.js:339), it does not import `evaluate`.

### Reported-value contract (apply to trigger-observe `readValue` + the SW case)
**Source:** `extension/utils/value-extractor.js:185-229` `extractValue(reportedValue, descriptor)` — the exact `{ text?, attributes?: {[name]: string} }` shape the SEAM consumes. trigger-observe MUST produce exactly this; the SW case writes `snap.reported_value = value.text` (+ `reported_attributes`).

### Snapshot store (the `reported_value` field; NO store code change)
**Source:** `extension/utils/trigger-store.js` — `readSnapshot`/`writeSnapshot`/`deleteSnapshot` persist fields verbatim (flat scalars `selector`/`target_tab_id`/`deadline_at`). Phase 16 ADDS a `reported_value` (+ optional `reported_attributes`) scalar written by the SW case, read by the SEAM (`trigger-lifecycle.js:336`) — no store edit; existing snapshots gain the field on next report; the SEAM falls back to `last_value` when absent.

### BF-cache survival (apply to trigger-observe teardown + lifecycle reuse)
**Source:** `extension/content/lifecycle.js`.
- BF-cache restore `pageshow` `event.persisted===true` (`:623-624`) → reconnect port ONLY; observer SURVIVED → **do NOT re-observe** (Pitfall 1 double-fire).
- BF-cache entry `pagehide` `event.persisted===true` (`:640-641`) → **KEEP observers** (heap frozen).
- ⚠️ pushState/replaceState/popstate hooks are **google.com-ONLY** (`if (window.location.hostname.includes('google.com'))` `:454`) — NOT a universal re-arm signal. Full-reload re-arm is SW-side (background.js, above).

### Guaranteed overlay clear (apply to the pulse — VIS-03)
Three storage-backed clears, all shipped: (1) fire SEAM atomic disarm (`trigger-lifecycle.js:353-359`) → SW sends `triggerPulseStop`; (2) content `beforeunload`/non-persisted `pagehide` (`visual-feedback.js:2244`) clears orphans; (3) `deadline_at` TTL reap (`trigger-lifecycle.js:307`) deletes the snapshot so nothing re-asserts the pulse. One overlay owner per tab (`messaging.js:1196-1209`).

---

## No Analog Found

None. Every Phase-16 file maps to a verified in-tree analog (the phase is "new wiring, not new algorithms" — RESEARCH § Don't Hand-Roll key insight). The only genuinely net-new *logic* (per-batch leaf re-resolution loop, idempotent-arm guard) is assembled from existing primitives (`querySelectorWithShadow` + a `dataset` flag) inside the cloned `dom-stream.js` skeleton — no missing-pattern fallback to RESEARCH.md generic examples is required.

---

## Metadata

**Analog search scope:** `extension/content/` (dom-stream, visual-feedback, messaging, overlay-state, selectors, lifecycle), `extension/utils/` (trigger-lifecycle, trigger-store, trigger-manager, value-extractor, overlay-state), `extension/background.js`, `tests/` (overlay-stability-cadence, change-report-builder, trigger-lifecycle, dom-stream-perf, test-overlay-state), `package.json`.
**Files scanned (read or grepped):** 14.
**Line-range verification:** all RESEARCH § Sources ranges re-opened on branch `automation`; confirmed accurate. Minor clarifications recorded inline (e.g. the `messaging.js` single-overlay watchdog block is precisely `:1199-1209` with the `actionGlowOverlay.hide()` gate at `:1196`; the `background.js` onMessage *listener* is `:5436` and the *switch* is `:5448`).
**Pattern extraction date:** 2026-06-16
