# Phase 16: Live-Observe Watch & Analyzing Pulse - Research

**Researched:** 2026-06-16
**Domain:** MV3 content-script single-element MutationObserver watch + Shadow-DOM analyzing-pulse overlay, wired to the Phase-15 SW fire SEAM
**Confidence:** HIGH (every clone source read directly from the working tree on branch `automation`; external BF-cache/MutationObserver facts settled in 16-CONTEXT.md at HIGH and reconfirmed against in-tree code)

> This is an INTEGRATION research, not an ecosystem survey. Zero new packages (STACK.md confirmed). Every new line either clones a verified in-tree skeleton (`dom-stream.js`, `visual-feedback.js`, `messaging.js`, the Phase-14/15 trigger SW modules) or adds an additive case beside an existing one. The two flagged open questions (BF-cache observer survival; characterData-misses-node-swap) are research-RESOLVED in 16-CONTEXT.md D-04/D-05 — this file OPERATIONALIZES them into exact code patterns with `file:line`, it does NOT re-derive them.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**A. Module Decomposition & SW Value-Report Ingress**
- **D-01:** Exactly ONE new content module `extension/content/trigger-observe.js` (single-element debounced MutationObserver, isolated world, reports raw value deltas to SW). MODIFY three existing files: `content/messaging.js` (additive router cases only), `content/visual-feedback.js` (analyzing-pulse variant + "watching" label), `extension/background.js` (new `onMessage` case ingesting the value report). Add `trigger-observe.js` to the isolated-world injection bundle `CONTENT_SCRIPT_FILES` (background.js ~267-285). NOT bolted into `dom-stream.js`. No new SW util module (reuse the Phase-14/15 SEAM). `manifest.json` unchanged.
- **D-02:** Live-observe fire is evaluated **on the content value-report message, not on an alarm tick**. Content reports via `chrome.runtime.sendMessage({ action:'triggerValueChanged'|'triggerValueReport', trigger_id, value:{ text, attributes? } })`; a new `background.js onMessage` case (modeled on `domStreamMutations`, background.js:6346, with `sender.tab.id`) re-reads the snapshot from `chrome.storage.session` and drives `FsbTriggerManager.evaluate(snapshot, value, now)` through the Phase-15 `trigger-lifecycle.js` SEAM (the SOLE owner of fire-path storage I/O; `evaluate()` stays pure). Reported `value` is exactly `{ text, attributes? }`.
- **D-03:** Add the low-frequency live-observe **watchdog alarm now** (armed idempotently from the value-report case; tick re-issues `triggerObserveStart` when the observer should be running but no recent report arrived — covers SW-eviction-while-page-observer-lives + undetected nav). Add a **test-only arm path** (writes an `armed` snapshot via `trigger-lifecycle.armTrigger(snapshot)` / `trigger-manager.armTrigger(spec)` + sends `triggerObserveStart` + `triggerPulseStart`) — NOT an MCP/autopilot tool (Phase 18).

**B. Live-Observe Re-Arm & Selector Re-Resolution (WATCH-05)**
- **D-04 (trifurcated re-arm; research-RESOLVED, HIGH):**
  1. **BF-cache restore** (`pageshow` with `event.persisted === true`): observer SURVIVED (JS heap frozen/resumed, content NOT re-injected) → **DO NOT re-observe** (re-arming double-fires). Only reconnect a held persistent port (Chrome 123+ closes the port on BF-cache entry; one-shot `sendMessage` needs no reconnect).
  2. **SPA node-swap**: observe a **stable container ancestor** (never the leaf) + **re-resolve the target by uniqueness-scored selector each batch** before reading. No re-observe (container stable). `childList` catches the node-swap that `characterData` misses.
  3. **Full reload**: content re-injected → re-arm driven SW-side off `chrome.webNavigation`/`chrome.tabs.onUpdated` for the trigger's OWNED tab (`ensureContentScriptInjected(tabId)`, background.js ~3208, gated on `status==='complete'` ~3217) → re-send `triggerObserveStart`.
  - **Idempotent-arm guard** (e.g. `data-fsb-trigger-armed` node flag, checked before `observe()`) makes arming safe across ALL three cases.
  - ⚠️ `lifecycle.js` pushState/replaceState/popstate hooks are **google.com-ONLY** (gated at lifecycle.js:454) — NOT a universal re-arm signal. The universal BF-cache `pageshow(persisted)` handler (lifecycle.js:623) IS reused for case 1.
- **D-05:** Observe options matched to `extract` kind: text/number → `{ childList:true, characterData:true, subtree:true }` on the stable container; attribute → `{ attributes:true, attributeFilter:[attr] }`. `attributeOldValue`/`characterDataOldValue` stay **OFF**.
- **D-06:** Callback debounced with a **trailing in-page `setTimeout` (~150–300ms), NOT `requestAnimationFrame`**. Clone the `dom-stream.js` start/stop/sendMessage skeleton (~744-816) but **swap rAF for the trailing-setTimeout debounce**. Exact ms within 150–300 is the planner's tuning call.

**C. Analyzing Pulse, "Watching" Label & Clear Lifecycle (VIS-01..04)**
- **D-07 (USER-confirmed):** Pulse hosted in the **Shadow-DOM element-glow overlay** (visual-feedback.js `ActionGlowOverlay` ~1508+ with `attachShadow`), as a NEW pulse keyframe/variant — **NOT** the inline-style `HighlightManager.show()` (visual-feedback.js:25-88). Inline styles on a live SPA node get wiped by re-renders AND mutate the page element's `style` (which the `characterData`+`childList` observer could itself see → self-trigger feedback loop). The architecture-doc literal `HighlightManager.show()` extension is OVERRIDDEN.
- **D-08:** Pulse is a `@keyframes fsb-trigger-pulse` animation toggled by `{ pulse:true }` / `showPulse()`, animating **GPU-composited `opacity`/`transform` ONLY — never layout properties** (no box-shadow/top/left/width animation). Visually distinct from the steady action/`run_task` glow (static box-shadow). Reuse the `@media (prefers-reduced-motion: reduce)` block (visual-feedback.js:1601) → animation off, static cue kept (VIS-04).
- **D-09:** "watching a trigger" label rides an **additive `overlayState.mode = 'trigger-watch'`** field (overlay-state.js `buildOverlayState` ~366 / `FSBOverlayStateUtils` ~444), rendered by the `ViewportGlow` state machine (visual-feedback.js `state-thinking` ~1100). **Additive only — no existing overlay-state field changes** (dashboard mirror consumes this object).
- **D-10:** SW sends `triggerPulseStart{selector}` on arm (content resolves + applies pulse, mirroring `highlightElement`, messaging.js ~1229-1243) and `triggerPulseStop` on fire/stop. Clear guaranteed even with a dead SW: fire SEAM clears atomically (trigger-lifecycle.js ~350-360); content `beforeunload`/`pagehide` clears orphans; `deadline_at` TTL reap (trigger-lifecycle.js ~307) deletes the snapshot. **One overlay owner per tab** — the pulse is a *state* of the single overlay, gated against the `run_task` glow (single-overlay watchdog, messaging.js ~1196-1209), never a second overlay.

**D. Teardown Discipline, Multiplexing & Tests**
- **D-11:** One observer registry per content-script instance (`Map<trigger_id, { observer, debounceTimer, container, selector }>`), **idempotent start** (disconnect prior observer for same `trigger_id` before observing), **guaranteed disconnect-all on every teardown path**: fire, `triggerObserveStop`, `beforeunload`, **`pagehide`** (added), and re-injection. **Independent observer per trigger** (narrowest node) — NOT a single multiplexed `document.body` observer. A dedicated "every observer created is disconnected" leak test is required.
- **D-12:** Node-mock content-module unit tests (mock `MutationObserver`, `chrome.runtime.sendMessage`, `document`), mirroring the existing trigger-store/lifecycle Node tests + the visual-feedback node test hook (~2300). Assert: observe-options-per-extract-kind, trailing-debounce report shape `{ text, attributes? }`, idempotent start, the leak test. **Live-Chrome UAT deferred to Phase 20** (real-SPA/BF-cache re-arm timing; busy-ticker frame budget).

### Claude's Discretion
- Exact debounce value within 150–300ms (D-06) — tune to ticker fixtures.
- The exact `data-*` flag name/mechanism for the idempotent-arm guard (D-04) — any persisted-on-node marker that survives a surviving observer and is absent on a fresh re-inject.
- The exact `action` string names (`triggerValueChanged` vs `triggerValueReport`, etc.) — follow `domStream*` / `highlightElement` naming.
- Whether the stable-container ancestor is `parentElement`, a configured nearest-stable ancestor, or a heuristic climb — planner's call, as long as it is re-resolution-stable across SPA re-render.
- Node-mock harness shape — mirror existing content/util Node tests.

### Deferred Ideas (OUT OF SCOPE)
- **Refresh-poll (tab-owning background reload)** — Phase 17 (consumes this phase's shared selector-re-resolution layer).
- **Shared tool registry + dispatcher wiring (the 4 MCP/autopilot tools)** — Phase 18 (Phase 16 arms via a test-only path; INV-02 registration is Phase 18).
- **MCP blocking/detached return + structured fire envelope + final detached-TTL/blocking-ceiling numbers** — Phase 19.
- **Refresh-poll-vs-live-observe same-tab conflict (`TRIGGER_TAB_WATCH_CONFLICT`) + reload coalescing** — Phase 20.
- **Multiplexed single observer over multiple elements per tab** — out of scope; Phase 16 uses independent observers per trigger.
- **Cross-browser-restart auto-resume for live-observe** — SURV-FUTURE-01.
- **Live-Chrome UAT** for re-arm timing + busy-ticker frame budget — Phase-20 integration pass.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **WATCH-01** | `live-observe` mode: watch element in place via MutationObserver, fire with no reload; observe the narrowest node, not `document.body`. | Clone `dom-stream.js` `startMutationStream`/`stopMutationStream` (lines 743-840), swap rAF→trailing-setTimeout (D-06), scope to ONE stable container not `document.body`; report `{text, attributes?}` via `sendMessage` (line 716 precedent); SW `onMessage` case (background.js:6346 precedent) drives `evaluate()` through the lifecycle SEAM (trigger-lifecycle.js:314-360). |
| **WATCH-05** | Re-establish observer + baseline after in-page nav / BF-cache / SPA soft-nav; re-resolve selector via uniqueness scoring on re-attach (reusable layer Phase 17 consumes). | Trifurcated re-arm (D-04): BF-cache `pageshow(persisted)` survives (lifecycle.js:623); SPA → stable-container + per-batch `FSB.querySelectorWithShadow` (selectors.js:497) re-resolve, validated by `FSB.validateSelectorUniqueness` (selectors.js:22); full reload → SW-side `webNavigation.onCommitted` (background.js:2677) + `ensureContentScriptInjected` (background.js:3208) → re-send `triggerObserveStart`. Idempotent-arm guard (node dataset flag). |
| **VIS-01** | Gentle "analyzing" pulse on watched element, a Shadow-DOM glow variant, distinct from steady `run_task` glow. | New `@keyframes fsb-trigger-pulse` + `.box-overlay.trigger-pulse` class in the `ActionGlowOverlay` closed Shadow DOM (visual-feedback.js:1525-1610), GPU-composited `opacity`/`transform` only; `run_task` glow is `fsbActionGlow` static box-shadow (line 1527) — visually distinct. |
| **VIS-02** | Visual monitor labels itself "watching a trigger" while ≥1 trigger active. | Additive `overlayState.mode='trigger-watch'` in `buildOverlayState` return (overlay-state.js:379-393) + a `humanizeOverlayPhase`/label entry; rendered via the `ViewportGlow`/overlay surface. |
| **VIS-03** | Pulse clears on fire/stop/timeout/reap (no stuck glow incl. across nav); storage-backed clear deadline; one overlay owner per tab. | Fire SEAM atomic disarm (trigger-lifecycle.js:350-360) → `triggerPulseStop`; `beforeunload` (visual-feedback.js:2244) + `pagehide` orphan clear; `deadline_at` TTL reap (trigger-lifecycle.js:307); single-overlay watchdog (messaging.js:1196-1209). |
| **VIS-04** | Pulse honors `prefers-reduced-motion`. | Reuse the existing `@media (prefers-reduced-motion: reduce)` block (visual-feedback.js:1601-1610) — extend it to set `animation:none` on `.box-overlay.trigger-pulse`, keep a static border cue. |
</phase_requirements>

## Summary

Phase 16 is the FSB moat: a single-element MutationObserver in the content script that reports raw `{text, attributes?}` deltas to the SW, while the SW (via the already-shipped Phase-15 `trigger-lifecycle.js` SEAM) owns the fire decision. The mechanical skeleton already exists in two places and is **cloned, not invented**: `extension/content/dom-stream.js:743-840` provides the verbatim MutationObserver construct/observe-options/debounce/`sendMessage`/guaranteed-`.disconnect()` shape (swap its rAF batch for a trailing `setTimeout` per D-06, and scope it to ONE stable container instead of `document.body`); `extension/content/visual-feedback.js:1508-1817` provides the closed-Shadow-DOM `ActionGlowOverlay` with `attachShadow`, a `@keyframes fsbActionGlow`, GPU-composited tracking, a reduced-motion `@media` block, and a `destroy()` — the analyzing pulse is a new `@keyframes fsb-trigger-pulse` + variant class added alongside, animating only `opacity`/`transform`.

The SW ingress is the single genuinely-new SW glue point: a `chrome.runtime.onMessage` case (background.js:5448 switch, modeled on the `domStreamMutations` case at 6346) reads `sender.tab.id`, re-reads the snapshot from `chrome.storage.session`, and drives the fire decision. **The cleanest wiring is to write `snapshot.reported_value = value.text` (+ attributes) and let the existing SEAM consume it** — because `trigger-lifecycle.js:330-339` ALREADY constructs `reportedValue = { text: snap.reported_value ?? snap.last_value }` and calls `FsbTriggerManager.evaluate(snap, reportedValue, now)` with full atomic fired write-back at lines 350-360. Phase 16 supplies the live scrape the Phase-15 SEAM was built to receive. The watchdog alarm (D-03) is the two-tier backstop (page observer survives SW eviction; a low-freq alarm re-issues `triggerObserveStart` if the SW saw no recent report).

The two hard runtime questions are research-settled and operationalized below: (1) **BF-cache restore must NOT re-observe** — the JS heap (and the live observer) survives, confirmed by the `pageshow(event.persisted)` handler at lifecycle.js:623 which only reconnects the port; re-arming would stack a second observer and double-fire. (2) **SPA node-swap is caught by observing a stable CONTAINER with `childList` + re-resolving the leaf each batch**, not by binding to the leaf. An idempotent-arm guard (a `data-*` flag on the node) makes arming safe across all three nav classes.

**Primary recommendation:** Clone `dom-stream.js:743-840` into `trigger-observe.js` (swap rAF→trailing-`setTimeout`, scope to a stable container, add the per-batch `FSB.querySelectorWithShadow` re-resolve + idempotent-arm guard + per-trigger registry with disconnect-all); add a `@keyframes fsb-trigger-pulse` variant to `ActionGlowOverlay`; add the `triggerObserveStart/Stop`/`triggerRead`/`triggerPulseStart/Stop` router cases to `messaging.js` (mirror `highlightElement`); add the value-report `onMessage` case to `background.js` that writes `reported_value` and invokes the existing lifecycle SEAM. Test with the `vm.createContext` content-module sandbox (overlay-stability-cadence.test.js precedent) + the trigger-lifecycle Node-mock harness, including the leak test.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Observe a live DOM element + read raw value | Content script (isolated world) | — | Only the page context sees DOM mutations; the SW dies on nav and cannot hold a live observer. STACK.md: isolated-world, never main-world. |
| Debounce/coalesce a mutation burst | Content script | — | rAF/`setTimeout` are page-context timers; coalescing must happen before crossing the message boundary (D-06). |
| **Fire decision (compare vs baseline, edge-trigger)** | **Service worker** | — | Durable `last_value`/`was_satisfied` live in `chrome.storage.session`; an eviction between read and decision cannot drop/dup a fire (SURV-02). Anti-Pattern 2: NEVER evaluate in content. Already implemented (trigger-lifecycle.js SEAM + trigger-manager.evaluate). |
| Atomic fired write-back + disarm | Service worker (lifecycle SEAM) | — | Sole owner of fire-path storage I/O (trigger-lifecycle.js:350-360). Phase 16 does not touch this. |
| Selector re-resolution per batch | Content script (`selectors.js`) | — | `querySelectorWithShadow` runs in the page; the SW has no DOM. Reusable layer Phase 17 consumes. |
| Re-arm after full reload | Service worker (`webNavigation`/`onUpdated`) | Content (receives `triggerObserveStart`) | Content script is destroyed on reload; only the SW persists across the navigation to re-inject + re-send. |
| Re-arm after BF-cache | Content script (`pageshow` — NO-OP for observer) | — | Heap survives; SW involvement would double-arm. Only the held port reconnects (lifecycle.js:623). |
| Analyzing pulse render + position tracking | Content script (Shadow-DOM overlay) | — | Overlay tracks the live element via rAF; lives in the page DOM (D-07). |
| Pulse drive/clear command | Service worker → content | Storage-backed deadline | SW sends `triggerPulseStart/Stop`; `deadline_at` reap guarantees clear even if the SW is dead (VIS-03). |
| "watching a trigger" label state | `overlay-state.js` (shared util) | Dashboard mirror | Additive `mode` field consumed by both the in-page overlay and the dashboard mirror (D-09). |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `MutationObserver` (Web API) | Built-in (all MV3 Chrome) | The live-observe watch mechanism | Push-based, zero polling CPU. Already used by `dom-stream.js`/`dom-state.js`/`actions.js`/`visual-feedback.js`. [VERIFIED: codebase grep — `new MutationObserver` at dom-stream.js:750] |
| `chrome.runtime.sendMessage` / `chrome.runtime.onMessage` | Built-in | Content→SW value report + SW→content observe/pulse commands | The exact wire `dom-stream.js`↔`background.js` already uses (`domStreamMutations`). [VERIFIED: codebase — dom-stream.js:716, background.js:6346] |
| `chrome.storage.session` (via `FsbTriggerStore`) | Built-in + Phase-14 module | Durable snapshot the SW re-reads each report/tick | Survives SW eviction; sole source of `last_value`. [VERIFIED: trigger-store.js:76-149, shipped Phase 14] |
| `chrome.alarms` (via `FsbTriggerLifecycle`) | Built-in + Phase-14 module | Low-freq live-observe watchdog (D-03) | Survives eviction, wakes SW; the two-tier backstop. [VERIFIED: trigger-lifecycle.js:159-168; alarm dispatcher background.js:13330-13366] |
| `attachShadow({mode:'closed'})` | Built-in | The analyzing-pulse overlay host | The exact isolation `ActionGlowOverlay` already uses. [VERIFIED: visual-feedback.js:1522] |

### Supporting (already in-tree, reused not added)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `FSB.querySelectorWithShadow(selector)` (selectors.js:497) | Per-batch leaf re-resolution (shadow-piercing + XPath + cache) | Each debounced batch, before reading the value (D-04 case 2). **CAVEAT: it caches via `FSB.elementCache` — see Pitfall 6.** |
| `FSB.validateSelectorUniqueness(selector, root)` (selectors.js:22) | Detect unique vs ambiguous vs missing match | To classify a re-resolution as hit/ambiguous/miss; returns `{isValid, isUnique, count, selector, error?}`. |
| `FsbTriggerManager.evaluate(snapshot, reportedValue, now)` (trigger-manager.js:374) | Pure fire decision over `{text, attributes?}` | Driven by the SW SEAM, not called directly from the new onMessage case (D-02). |
| `FsbTriggerLifecycle.handleTriggerAlarm(alarm)` (trigger-lifecycle.js:269) | Watchdog tick + SEAM evaluate path | The watchdog alarm branch (already wired background.js:13356). |
| `FsbTriggerManager.armTrigger(spec)` (trigger-manager.js:580) | Cap-gated test-arm path (D-03) | The test-only arm helper builds an `armed` snapshot and delegates to the lifecycle. |
| `ActionGlowOverlay` (visual-feedback.js:1200) | Host class for the pulse variant | Extend with `showPulse()`/`{pulse:true}` + the new keyframe. |
| `FSBOverlayStateUtils.buildOverlayState` (overlay-state.js:366) | The overlay-state object | Add the additive `mode:'trigger-watch'` field. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `trigger-observe.js` module | Bolt live-observe into `dom-stream.js` | REJECTED by D-01: `dom-stream.js` is whole-page for the dashboard; sharing risks the locked `fsb-domstream-watchdog` + `ext:dom-mutations` wire. New module, same internals. |
| Shadow-DOM `ActionGlowOverlay` pulse | Inline-style `HighlightManager.show()` | REJECTED by D-07: inline `style` on a live SPA node gets wiped by re-renders AND is itself observable by the `characterData`+`childList` observer → self-trigger feedback loop. |
| Trailing `setTimeout` debounce | `requestAnimationFrame` (what dom-stream uses) | REJECTED by D-06: rAF wakes the SW ~60×/sec on a ticker; trailing `setTimeout` coalesces a 500-mutation burst into one read + one report. |
| Write `reported_value` + reuse the SEAM | New SW evaluator on the value-report path | REJECTED by D-01/D-02: no fresh evaluator — the SEAM already constructs `reportedValue` from `snap.reported_value` and owns the atomic write-back. |
| Independent observer per trigger | Single multiplexed `document.body` observer | REJECTED by D-11 / Pitfall 5: a broad subtree observer reintroduces the ticker flood. Narrowest-node per trigger. |

**Installation:**
```bash
# ZERO new packages. The only filesystem addition is the new source file:
#   extension/content/trigger-observe.js   (isolated-world single-element observer)
# plus additive edits to messaging.js, visual-feedback.js, overlay-state.js, background.js.
# No package.json change, no manifest.json change (INV-01-adjacent; all perms granted).
```

**Version verification:** N/A — no external packages installed. STACK.md already verified (`npm view @modelcontextprotocol/sdk version` → 1.29.0, zod 3.x) for the milestone; Phase 16 adds none. [VERIFIED: STACK.md:16-34 "Net package.json delta for this milestone: ZERO"]

## Package Legitimacy Audit

**Not applicable.** Phase 16 installs ZERO external packages. All capabilities are platform built-ins (`MutationObserver`, `chrome.*`, `attachShadow`) or already-shipped in-tree modules (`FsbTriggerStore`, `FsbTriggerManager`, `FsbTriggerLifecycle`, `ActionGlowOverlay`, `selectors.js`). No registry surface to audit; no slopcheck needed.

## Architecture Patterns

### System Architecture Diagram

```
                      ┌─────────────────────────────────────────────────┐
  TEST-ARM (D-03) ───►│  SERVICE WORKER (background.js + utils/*)         │
  triggerManager      │                                                  │
  .armTrigger(spec)   │  armTrigger → writeSnapshot(status:'armed') →     │
                      │     chrome.tabs.sendMessage(tabId,               │
                      │        {action:'triggerObserveStart', selector,  │
                      │         extract, trigger_id})                    │
                      │        + {action:'triggerPulseStart', selector}  │
                      │                                                  │
   full reload ──────►│  webNavigation.onCommitted (:2677) /             │
   (D-04 case 3)      │     tabs.onUpdated status==='complete' (:3217)   │
                      │     → ensureContentScriptInjected(tabId) (:3208) │
                      │     → re-send triggerObserveStart                 │
                      │                                                  │
                      │  ┌──────────────── value-report onMessage ────┐  │
                      │  │ NEW case (model: domStreamMutations :6346) │  │
                      │  │ sender.tab.id → readSnapshot →             │  │
                      │  │ snap.reported_value = value.text +         │  │
                      │  │   (value.attributes) → writeSnapshot →     │  │
                      │  │ FsbTriggerLifecycle SEAM evaluate path ────┼──┼─► evaluate(snap, {text,attrs}, now)
                      │  │   (trigger-lifecycle.js :314-360)          │  │     ├─ 'fired' → status:'fired'+fired_at
                      │  │ idempotent watchdog alarm.create (D-03)    │  │     │   atomic write + clearAlarm
                      │  └────────────────────────────────────────────┘  │     │   → triggerPulseStop
                      │                                                  │     └─ 'no_fire'/'parse_error' → stay armed
                      └───────────┬──────────────────────────▲──────────┘
                       sendMessage(observe/pulse/read)        │ sendMessage({action:'triggerValueChanged',
                                  │                           │   trigger_id, value:{text, attributes?}})
   ┌──────────────────────────────▼───────────────────────────┴─────────────────────────────┐
   │  CONTENT SCRIPT (isolated world; extension/content/*)                                    │
   │                                                                                          │
   │  NEW trigger-observe.js:                                                                 │
   │    registry: Map<trigger_id,{observer,debounceTimer,container,selector,extract}>         │
   │    start(trigger_id,selector,extract):                                                   │
   │       leaf = FSB.querySelectorWithShadow(selector)  (selectors.js:497)                   │
   │       if leaf.dataset.fsbTriggerArmed → return  (idempotent-arm guard, D-04)             │
   │       container = stableAncestor(leaf)                                                    │
   │       observer = new MutationObserver(debouncedFlush)   ◄── clone dom-stream.js:750      │
   │       observer.observe(container, optsFor(extract))     ◄── D-05 options                 │
   │       leaf.dataset.fsbTriggerArmed = trigger_id                                           │
   │    debouncedFlush (trailing setTimeout ~150-300ms, D-06):                                 │
   │       leaf = FSB.querySelectorWithShadow(selector)  (re-resolve each batch, D-04 case 2) │
   │       value = readValue(leaf, extract)  → {text, attributes?}                            │
   │       chrome.runtime.sendMessage({action:'triggerValueChanged', trigger_id, value})      │
   │    stop / fire / beforeunload / pagehide(NON-persisted) / re-inject → disconnectAll()    │
   │    pagehide(persisted=BF-cache) → KEEP observer (D-04 case 1, do NOT disconnect)          │
   │                                                                                          │
   │  messaging.js router (additive cases, mirror highlightElement :1229):                     │
   │    triggerObserveStart/Stop · triggerRead · triggerPulseStart/Stop                        │
   │                                                                                          │
   │  visual-feedback.js ActionGlowOverlay.showPulse(): @keyframes fsb-trigger-pulse           │
   │    (opacity/transform only) in the closed Shadow DOM (:1525-1610)                         │
   │                                                                                          │
   │  lifecycle.js pageshow(persisted) (:623) → reconnect port ONLY (observer survived)        │
   └──────────────────────────────────────────────────────────────────────────────────────┘
```
Trace the moat use case: arm → observer on container → DOM mutates → debounce coalesces → re-resolve leaf → report `{text}` → SW writes `reported_value` → SEAM `evaluate()` → edge true → atomic `fired` + `triggerPulseStop`.

### Recommended Project Structure
```
extension/
├── content/
│   ├── trigger-observe.js     # NEW — single-element observer + per-batch re-resolve
│   │                          #       + idempotent-arm guard + registry + disconnect-all
│   ├── messaging.js           # MOD — +triggerObserveStart/Stop, triggerRead, triggerPulseStart/Stop
│   ├── visual-feedback.js     # MOD — ActionGlowOverlay.showPulse() + @keyframes fsb-trigger-pulse
│   ├── selectors.js           # (reused unchanged — querySelectorWithShadow / validateSelectorUniqueness)
│   └── lifecycle.js           # (reused unchanged — pageshow(persisted) :623; google-gated SPA hooks :454)
├── utils/
│   ├── overlay-state.js       # MOD — additive mode:'trigger-watch' in buildOverlayState
│   ├── trigger-store.js       # (reused — +reported_value field written by the SW case; flat scalar)
│   ├── trigger-manager.js     # (reused unchanged — evaluate() consumes {text, attributes?})
│   └── trigger-lifecycle.js   # (reused unchanged — SEAM already reads snap.reported_value :336)
└── background.js              # MOD — value-report onMessage case (+watchdog create),
                               #       trigger-observe.js added to CONTENT_SCRIPT_FILES :267-285,
                               #       SW-side re-arm off webNavigation/onUpdated for owned tab
```

### Pattern 1: Clone the dom-stream MutationObserver skeleton, swap rAF→trailing-setTimeout
**What:** `trigger-observe.js` mirrors the exact construct/observe/teardown shape of `dom-stream.js`, scoped to ONE container, with a trailing-`setTimeout` debounce instead of rAF.
**When to use:** The core of WATCH-01.
**Clone source (verbatim shape to mirror) — `extension/content/dom-stream.js:743-816`:**
```javascript
// dom-stream.js:743 — START (the skeleton trigger-observe.js clones)
function startMutationStream() {
  if (mutationObserver) { mutationObserver.disconnect(); }   // idempotent start (mirror per trigger_id)
  pendingMutations = [];
  mutationObserver = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) { pendingMutations.push(mutations[i]); }
    if (batchTimer) cancelAnimationFrame(batchTimer);        // ◄── Phase 16 SWAPS: clearTimeout
    batchTimer = requestAnimationFrame(flushMutations);      // ◄── Phase 16 SWAPS: setTimeout(flush, 150-300)
  });
  mutationObserver.observe(document.body, {                  // ◄── Phase 16: observe(container, optsFor(extract))
    childList: true, attributes: true, characterData: true,
    subtree: true, attributeOldValue: true                   // ◄── Phase 16: per D-05; *OldValue OFF
  });
  // ...content self-watchdog setTimeout chain (dom-stream keeps its own; trigger uses the SW alarm)...
}

// dom-stream.js:802 — STOP (guaranteed teardown trigger-observe.js mirrors per trigger_id)
function stopMutationStream() {
  if (batchTimer) { cancelAnimationFrame(batchTimer); batchTimer = null; }   // Phase 16: clearTimeout
  if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
  if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }  // ◄── the guaranteed .disconnect()
  // ...final flush...
}
```
**Report call to mirror — `extension/content/dom-stream.js:705-727`:**
```javascript
function flushMutations() {
  batchTimer = null;
  if (pendingMutations.length === 0) return;
  var batch = pendingMutations; pendingMutations = [];
  var diffs = processMutationBatch(batch);          // ◄── Phase 16: re-resolve leaf + read {text, attributes?}
  if (diffs.length === 0) return;
  try {
    chrome.runtime.sendMessage({                    // ◄── the exact report wire to mirror
      action: 'domStreamMutations',                 // ◄── Phase 16: 'triggerValueChanged'
      mutations: diffs, streamSessionId: streamSessionId || '', /* ... */
    }).catch(function(err){ /* rateLimitedWarn */ });
  } catch (e) { /* extension context invalidated */ }
}
```
**Module shape to mirror (IIFE + `FSB.<module>` registration + `module.exports` test hook):** `dom-stream.js:6` `(function(){ if (window.__FSB_SKIP_INIT__) return; var FSB = window.FSB; ... })()`, registration `FSB.domStream = {...}` at :1059, listener `chrome.runtime.onMessage.addListener(...)` at :970-1053. `trigger-observe.js` mirrors this and adds a `module.exports` test hook like visual-feedback.js:2300.

### Pattern 2: SW value-report ingress — write `reported_value`, reuse the Phase-15 SEAM
**What:** The new `background.js onMessage` case writes the reported value into the snapshot, then invokes the lifecycle SEAM evaluate path (which already constructs `reportedValue` from `snap.reported_value`).
**When to use:** Every live-observe value report (D-02).
**Why this is the minimal wiring — `extension/utils/trigger-lifecycle.js:330-360` ALREADY does the consume + fire:**
```javascript
// trigger-lifecycle.js:330 — the SEAM the SW case feeds (NO new evaluator needed)
var reportedValue = {
  text: (snap.reported_value != null ? snap.reported_value : snap.last_value)   // ◄── Phase 16 supplies snap.reported_value
};
var outcome = manager.evaluate(snap, reportedValue, now);
// ...:350 — atomic fired write-back the SW case does NOT duplicate...
if (outcome.outcome === 'fired') {
  snap.status = 'fired'; snap.fired_at = now;
  /* fold next_state */ await store.writeSnapshot(triggerId, snap); await clearAlarm(alarm.name);
}
```
**SW case to ADD (model: `domStreamMutations`, background.js:6346, inside the 5448 switch which has `sender.tab.id` and the `sender.id === chrome.runtime.id` guard at :5438):**
```javascript
// background.js — additive case in the chrome.runtime.onMessage switch (:5448)
case 'triggerValueChanged':       // (or 'triggerValueReport' — D-discretion)
case 'triggerValueReport': {
  const triggerId = request.trigger_id;
  const value = request.value || {};                         // {text, attributes?}
  (async () => {
    try {
      if (typeof FsbTriggerStore === 'undefined') { sendResponse({ ok:false }); return; }
      const snap = await FsbTriggerStore.readSnapshot(triggerId);
      if (!snap || snap.status !== 'armed') { sendResponse({ ok:true, ignored:true }); return; }
      snap.reported_value = (typeof value.text === 'string') ? value.text : snap.last_value;
      if (value.attributes) snap.reported_attributes = value.attributes;   // attribute extract path
      await FsbTriggerStore.writeSnapshot(triggerId, snap);
      // Drive the fire decision through the SAME SEAM the alarm uses. Easiest: synthesize the
      // alarm-shaped call. Option A — call a thin lifecycle helper that runs the evaluate path
      // on demand; Option B — invoke handleTriggerAlarm with the trigger's alarm name (it re-reads
      // the snapshot we just wrote, including reported_value). Planner picks; B reuses 100% of the
      // shipped fire path with zero new fire-path I/O.
      await FsbTriggerLifecycle.handleTriggerAlarm({ name: FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX + triggerId });
      // idempotent watchdog (D-03) — model: domStreamMutations alarm.create :6361
      try { chrome.alarms.create('fsbTriggerObserveWatchdog:' + triggerId, { periodInMinutes: 1 }); } catch (_e) {}
      // on fired, the SEAM cleared the alarm; the SW separately sends triggerPulseStop to sender.tab.id.
      sendResponse({ ok:true });
    } catch (e) { sendResponse({ ok:false, error: e.message }); }
  })();
  return true;                    // async sendResponse
}
```
> **NOTE for planner:** `handleTriggerAlarm` re-reads the snapshot and applies the TTL-reap + terminal guard + SEAM in one shot, so feeding it the value via `reported_value` reuses the entire shipped fire path (atomic write-back, disarm, dedupe) with no duplicated fire-path I/O. If the planner prefers an explicit on-report evaluate entrypoint, add a thin `FsbTriggerLifecycle.evaluateReportedValue(triggerId, value, now)` that performs the same `readSnapshot → guard → evaluate → atomic write` as :289-371 (a refactor-extract of that block) — but do NOT add a second copy of the fired write-back.

### Pattern 3: Analyzing pulse as a keyframe variant inside the closed Shadow DOM
**What:** A new `@keyframes fsb-trigger-pulse` + `.box-overlay.trigger-pulse` class injected into the same `<style>` `ActionGlowOverlay` already builds, animating `opacity`/`transform` only.
**When to use:** VIS-01/VIS-04.
**Clone source — `extension/content/visual-feedback.js:1525-1610` (the existing closed-Shadow style block; the pulse is added ALONGSIDE `fsbActionGlow`):**
```javascript
// visual-feedback.js:1522 — closed Shadow DOM host (ActionGlowOverlay.show)
this.shadow = this.host.attachShadow({ mode: 'closed' });
const style = document.createElement('style');
style.textContent = `
  @keyframes fsbActionGlow {            /* EXISTING run_task glow — static box-shadow pulse (line 1527) */
    0%,100% { box-shadow: 0 0 6px 2px rgba(255,140,0,.55), ...; border-color: rgba(255,140,0,.77); }
    50%     { box-shadow: 0 0 10px 2px rgba(255,140,0,.77), ...; border-color: rgba(255,140,0,1); }
  }
  /* ─── PHASE 16 ADD: gentle analyzing pulse — GPU-composited opacity+transform ONLY ─── */
  @keyframes fsb-trigger-pulse {
    0%,100% { opacity: .45; transform: scale(1.00); }
    50%     { opacity: .90; transform: scale(1.025); }
  }
  .box-overlay {                        /* EXISTING (line 1576) */
    border: 2.5px solid rgba(255,140,0,.8); border-radius: 10px;
    animation: fsbActionGlow 1.5s ease-in-out infinite;  /* run_task: amber, fast, box-shadow */
  }
  /* ─── PHASE 16 ADD: trigger-watch variant — cyan/teal, slow, transform/opacity ─── */
  .box-overlay.trigger-pulse {
    border-color: rgba(0,180,200,.85);                    /* distinct HUE from amber run_task */
    background: rgba(0,180,200,.05);
    animation: fsb-trigger-pulse 2.4s ease-in-out infinite;   /* slower = "analyzing", not "acting" */
    will-change: opacity, transform;                      /* GPU-composited (matches line 1574 discipline) */
  }
  @media (prefers-reduced-motion: reduce) {               /* EXISTING block (line 1601) — EXTEND */
    .box-overlay, .text-highlight { transition: none; }
    .box-overlay.active, .text-highlight.active { animation: none; }
    .box-overlay.trigger-pulse { animation: none; opacity: .7; }  /* VIS-04: static cue kept */
  }
`;
```
**Variant entrypoint to ADD (mirror `_ensureBoxOverlay` :1452 + `_setActiveState` :1494):**
```javascript
// ActionGlowOverlay — new method; reuses the SAME boxOverlay + tracking, toggles the variant class
showPulse(element) {
  this.show(element);                 // reuse the full Shadow-DOM build + _startTracking + _updatePosition
  this._pulseMode = true;
  if (this.boxOverlay) this.boxOverlay.classList.add('trigger-pulse');
}
clearPulse() {
  this._pulseMode = false;
  if (this.boxOverlay) this.boxOverlay.classList.remove('trigger-pulse');
  this.destroy();                     // guaranteed teardown (mirror :1795)
}
```
> Note: `_updatePosition` (:1672-1686) toggles `.active` and re-sets `box-overlay` geometry every tick; ensure the `.trigger-pulse` class is reapplied after a mode='box' re-render (add `if (this._pulseMode) this.boxOverlay.classList.add('trigger-pulse')` inside the box branch).

### Pattern 4: "watching a trigger" label via additive `overlayState.mode`
**What:** Add a `mode:'trigger-watch'` field to the overlay-state object — no existing field changes.
**Clone source — `extension/utils/overlay-state.js:379-393` (the `buildOverlayState` return):**
```javascript
// overlay-state.js:379 — ADD the mode field additively (spread-guarded, like agentIdShort :383)
return {
  ...(sessionToken ? { sessionToken } : {}),
  ...(clientLabel ? { clientLabel } : {}),
  ...(agentIdShort ? { agentIdShort } : {}),
  ...(statusData && statusData.mode ? { mode: String(statusData.mode) } : {}),   // ◄── PHASE 16 ADD (e.g. 'trigger-watch')
  lifecycle, result, phase: lifecycle === 'cleared' ? 'cleared' : normalizedPhase,
  display: buildOverlayDisplay(...), progress: buildOverlayProgress(...),
  actionCount: null, highlight: { animated: ... }
};
```
And a label entry in `humanizeOverlayPhase` (:131-144) OR a dedicated label the overlay surface renders when `mode==='trigger-watch'` → `"Watching a trigger"`. **The label string belongs in `overlay-state.js`** (the shared util the dashboard mirror also consumes), not hard-coded in the content script.

### Pattern 5: Idempotent-arm guard + trifurcated re-arm (D-04)
**What:** A `data-*` node flag prevents double-arming; the three nav classes route to three different handlers.
**Wiring (which listener fires which path):**
| Nav class | Signal | Where | Action |
|-----------|--------|-------|--------|
| BF-cache restore | `pageshow` `event.persisted===true` | content (lifecycle.js:623 — reused) | Reconnect port ONLY. Observer survived → **do NOT re-observe.** Guard flag still on the node → a stray `triggerObserveStart` no-ops. |
| BF-cache entry | `pagehide` `event.persisted===true` | content (lifecycle.js:640 — reused) | **KEEP observer** (do not disconnect — the heap is frozen, restored intact). |
| Real unload / re-inject | `pagehide` non-persisted / `beforeunload` | content (visual-feedback.js:2244 precedent) | `disconnectAll()` — guaranteed teardown. |
| SPA node-swap | mutation `childList` on the container | content (trigger-observe debouncedFlush) | Re-resolve leaf via `querySelectorWithShadow` each batch; container observer unchanged. |
| Full reload | `webNavigation.onCommitted` (:2677) / `tabs.onUpdated status==='complete'` (:3217) | SW | `ensureContentScriptInjected(tabId)` (:3208) → re-send `triggerObserveStart`. The fresh script has NO guard flag → arms cleanly. |
**The guard flag (planner picks the name):** `leaf.dataset.fsbTriggerArmed = trigger_id` set after `observe()`; checked at the top of `start()`. A surviving observer carries its flag (BF-cache) → re-arm no-ops; a re-injected script has no flag → arms. ⚠️ The flag lives on the *leaf*; if the leaf is replaced by SPA re-render the flag is gone with it, but the *container* observer survives so no re-observe is needed — re-resolution handles the new leaf.

### Anti-Patterns to Avoid
- **Re-observing on `pageshow(persisted)`** → stacks a second observer on the surviving one → double-fire (Anti-Pattern; D-04 case 1).
- **Binding the observer to the leaf** → a replaced leaf detaches the observer; `characterData` alone misses node-swaps (Pitfall 6; observe the container).
- **Evaluating the fire condition in the content script** → an eviction/nav drops the fire (Anti-Pattern 2, ARCHITECTURE.md:378).
- **Animating `box-shadow`/layout for the pulse** → janks the very ticker it watches (D-08; opacity/transform only).
- **A second overlay for the pulse** → fights the `run_task` glow (Pitfall UX; one overlay owner per tab, pulse is a *state*).
- **Disconnecting the observer on `pagehide(persisted)`** → kills the BF-cache survival the whole design relies on (disconnect only on NON-persisted pagehide/beforeunload).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resolve a selector across shadow DOM / XPath | A bespoke `querySelector` | `FSB.querySelectorWithShadow` (selectors.js:497) | Already handles `>>>` shadow-piercing, XPath, sanitization, caching. |
| Decide unique vs ambiguous vs missing | Counting `querySelectorAll().length` inline | `FSB.validateSelectorUniqueness` (selectors.js:22) | Returns the typed `{isValid,isUnique,count,error?}` the re-resolution policy needs. |
| Compare value vs baseline / edge-trigger / locale parse | A new comparator in the content script | `FsbTriggerManager.evaluate` via the SEAM | Shipped Phase 15: all 6 kinds + compound + edge-fire + locale-safe numeric + ReDoS caps. Pure. |
| Atomic fired write-back + disarm + dedupe | Writing `status:'fired'` from the new SW case | `FsbTriggerLifecycle` SEAM (trigger-lifecycle.js:350-360) | Sole owner of fire-path I/O; `noop_terminal` guard gives exactly-one-fire across eviction. |
| Survive SW eviction | A keepalive / `setInterval` watch loop | `chrome.alarms` watchdog (D-03) + page observer | The two-tier pattern; keepalive is a Web-Store-flag antipattern (Pitfall 3). |
| Shadow-DOM overlay + position tracking + reduced-motion | A new overlay | `ActionGlowOverlay` (visual-feedback.js:1200) | `attachShadow`, rAF tracking, `@media` reduced-motion, top-layer promotion all done. |
| Re-inject content after reload | Custom injection | `ensureContentScriptInjected` (background.js:3208) | Already gates on `status==='complete'`, retries, port-health-checks. |

**Key insight:** Phase 16 writes almost no new *logic* — it writes new *wiring*. The observer skeleton, the fire engine, the survival scaffold, the overlay, the selector layer, and the re-injection machinery all exist and are verified shipping. The risk is in the seams (BF-cache double-arm, leak, self-trigger), not the algorithms.

## Common Pitfalls

### Pitfall 1: BF-cache double-fire (re-arming a surviving observer)
**What goes wrong:** On `pageshow(persisted)` the script re-runs `triggerObserveStart`, creating a SECOND observer on top of the one that survived the BF-cache freeze → every mutation fires twice.
**Why it happens:** The instinct is "page shown again → re-arm," but BF-cache does NOT re-inject the content script; the heap (and observer) is frozen and resumed intact.
**How to avoid:** Reuse lifecycle.js:623 `pageshow(persisted)` to reconnect the port ONLY. Never call `observe()` from it. The idempotent-arm guard (`leaf.dataset.fsbTriggerArmed`) makes a stray re-arm a no-op. Disconnect only on NON-persisted pagehide/beforeunload.
**Warning signs:** Duplicate fire reports after a back/forward navigation; two `triggerValueChanged` messages per mutation.

### Pitfall 2: Observer leak across re-injection / nav
**What goes wrong:** A `triggerObserveStart` after a full reload (fresh script) leaves the prior observer connected against detached DOM → memory climb + callbacks on stale nodes.
**Why it happens:** Teardown paths are easy to miss (SW eviction, re-inject, SPA route change).
**How to avoid:** One registry per content instance; **idempotent start** (disconnect any prior observer for the same `trigger_id` before observing — mirror dom-stream.js:744); disconnect-all on fire/`triggerObserveStop`/`beforeunload`/non-persisted-`pagehide`/re-inject. **The leak test (D-11) is mandatory** (see Test Strategy).
**Warning signs:** Memory grows over a multi-hour watch; callbacks fire after `stop`.

### Pitfall 3: Self-trigger feedback loop (the pulse mutates an observed node)
**What goes wrong:** If the pulse wrote inline `style` on the watched element, the `characterData`/`childList`/`attributes` observer could see that mutation → report → re-pulse → infinite loop.
**Why it happens:** Inline-style highlight on the page element (the rejected `HighlightManager` path).
**How to avoid:** D-07 — the pulse lives in a SEPARATE closed Shadow-DOM overlay host appended to `documentElement`, never on the watched node. The observer never sees the overlay. (Also: attribute-mode uses `attributeFilter:[attr]` so even attribute writes elsewhere are ignored.)
**Warning signs:** A trigger that fires continuously the instant the pulse appears.

### Pitfall 4: Broad-subtree perf collapse on a busy ticker
**What goes wrong:** Observing `document.body` (or a huge container) with `subtree:true` on a crypto ticker floods the callback thousands of times/sec → main-thread jank on the very page live-observe targets.
**Why it happens:** Copy-pasting dom-stream's whole-page `observe(document.body, ...)`.
**How to avoid:** Observe the NARROWEST stable container (D-05/D-11); match options to extract kind (attribute → `attributeFilter`); **coalesce with the trailing-`setTimeout` debounce** (D-06) — read the current value ONCE per batch, never per record.
**Warning signs:** Page janky only while a trigger is active; thousands of callbacks/sec.

### Pitfall 5: SPA node-swap miss (`characterData` on a replaced node)
**What goes wrong:** React/Vue replaces the watched `<span>`; a `characterData` observer bound to the old text node sees nothing → value visibly changes, trigger never fires.
**Why it happens:** MutationObserver observes node instances, not logical elements.
**How to avoid:** D-04 case 2 — observe a STABLE CONTAINER with `childList:true` (catches the swap) + re-resolve the leaf via `querySelectorWithShadow` each batch before reading. The container observer never moves.
**Warning signs:** Fires on static pages, never on a React dashboard; `last_value` frozen while the page changes.

### Pitfall 6: Stale element cache hides the new leaf (`FSB.elementCache`)
**What goes wrong:** `querySelectorWithShadow` caches the resolved element in `FSB.elementCache` (selectors.js:506-509). After an SPA swap, the cache may return the OLD detached node, so the re-resolve reads stale/empty.
**Why it happens:** The cache is built for read-once performance, not a live re-resolution loop.
**How to avoid:** Before each batch re-resolve, either (a) check `leaf.isConnected` and bust the cache if detached, or (b) call `FSB.elementCache.clear()`/the specific invalidation before re-resolving, or (c) re-validate with `validateSelectorUniqueness` (which calls `querySelectorAll` live, not the cache). Planner picks; **(a) is cheapest** — `if (cached && !cached.isConnected) re-query`. [VERIFIED: selectors.js:505-509 cache-first behavior]
**Warning signs:** Re-resolution returns a node whose `textContent` never updates post-swap.

### Pitfall 7: Stuck pulse on a dead SW
**What goes wrong:** SW evicts mid-watch; the `triggerPulseStop` command never arrives; the overlay shows "watching" forever.
**Why it happens:** The clear command is SW-driven, but the SW can die.
**How to avoid:** D-10 / VIS-03 — three guaranteed clears: (1) fire SEAM disarms atomically (trigger-lifecycle.js:350); (2) content `beforeunload`/`pagehide(non-persisted)` clears any orphan overlay (visual-feedback.js:2244 precedent — add the pulse to that block); (3) `deadline_at` TTL reap (trigger-lifecycle.js:307) deletes the snapshot so nothing re-asserts the pulse. The pulse should also self-expire on a content-side deadline read from the snapshot so a never-restored tab clears.
**Warning signs:** Overlay lingers after the trigger is gone from `chrome.storage.session`.

### Pitfall 8: pulse survives navigation as a ghost on the wrong page
**What goes wrong:** The overlay lingers after a same-tab navigation to an unrelated page.
**How to avoid:** Tie the overlay to the content-script lifecycle; `beforeunload`/non-persisted `pagehide` destroys it (visual-feedback.js:2244). Re-assert ONLY if the trigger is still armed for that tab (the SW re-sends `triggerPulseStart` after re-injection, like the `triggerObserveStart` re-arm). Do NOT persist the overlay across the page transition.

## Code Examples

### Observe-options per extract kind (D-05) — `optsFor(extract)`
```javascript
// Source: D-05 + MDN MutationObserverInit (CITED: developer.mozilla.org/.../MutationObserverInit)
function optsFor(extract, attrName) {
  if (extract === 'attribute' && attrName) {
    return { attributes: true, attributeFilter: [attrName] };   // cut record volume; *OldValue OFF
  }
  // text / number: childList catches node-swap, characterData catches in-place edit
  return { childList: true, characterData: true, subtree: true };
}
```

### Read value → `{text, attributes?}` (the locked contract evaluate() consumes)
```javascript
// Source: value-extractor.js:203 extractValue contract — reportedValue:{text?, attributes?:{[name]:string}}
function readValue(leaf, extract, attrName) {
  if (!leaf) return { text: '' };                                // miss → empty (SW treats per policy)
  if (extract === 'attribute' && attrName) {
    var v = leaf.getAttribute(attrName);
    return { text: (typeof v === 'string' ? v : ''), attributes: { [attrName]: v == null ? '' : v } };
  }
  // form controls → .value; else textContent (mirrors STACK.md read precedence)
  var tag = leaf.tagName ? leaf.tagName.toLowerCase() : '';
  var text = (tag === 'input' || tag === 'textarea' || tag === 'select')
    ? (leaf.value || '') : (leaf.textContent || '');
  return { text: String(text).trim() };
}
```

### Per-trigger registry + idempotent start + disconnect-all (D-11)
```javascript
// Source: dom-stream.js:744 idempotent-start + :813 disconnect discipline, generalized per trigger_id
var registry = new Map();   // trigger_id -> { observer, debounceTimer, container, selector, extract, attrName }

function start(triggerId, selector, extract, attrName) {
  stop(triggerId);                                              // idempotent: tear down any prior (no stacking)
  var leaf = FSB.querySelectorWithShadow(selector);
  if (!leaf) { return { ok:false, reason:'not_found' }; }
  if (leaf.dataset && leaf.dataset.fsbTriggerArmed === triggerId) { return { ok:true, already:true }; } // guard
  var container = stableAncestor(leaf);                         // planner's heuristic (D-discretion)
  var entry = { observer:null, debounceTimer:null, container, selector, extract, attrName };
  entry.observer = new MutationObserver(function() {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(function(){ flush(triggerId); }, DEBOUNCE_MS);  // 150-300ms, D-06
  });
  entry.observer.observe(container, optsFor(extract, attrName));
  if (leaf.dataset) leaf.dataset.fsbTriggerArmed = triggerId;   // idempotent-arm flag
  registry.set(triggerId, entry);
  return { ok:true };
}

function stop(triggerId) {
  var e = registry.get(triggerId);
  if (!e) return;
  if (e.debounceTimer) clearTimeout(e.debounceTimer);
  if (e.observer) e.observer.disconnect();                      // the GUARANTEED .disconnect()
  registry.delete(triggerId);
}

function disconnectAll() { for (var id of registry.keys()) stop(id); }   // beforeunload / non-persisted pagehide / re-inject

function flush(triggerId) {
  var e = registry.get(triggerId);
  if (!e) return;
  e.debounceTimer = null;
  var leaf = FSB.querySelectorWithShadow(e.selector);           // re-resolve EACH batch (D-04 case 2)
  if (leaf && !leaf.isConnected) leaf = null;                   // Pitfall 6: bust stale cache hit
  if (!leaf) leaf = FSB.querySelectorWithShadow(e.selector);    // (after cache-clear) — planner refines
  var value = readValue(leaf, e.extract, e.attrName);
  try {
    chrome.runtime.sendMessage({ action:'triggerValueChanged', trigger_id: triggerId, value })
      .catch(function(){ /* SW asleep — woken by this very message; watchdog re-issues if needed */ });
  } catch (_e) { /* extension context invalidated */ }
}
```

### Teardown wiring — disconnect ONLY on real unload (preserve BF-cache survival)
```javascript
// Source: lifecycle.js:623/640 (pageshow/pagehide persisted) + visual-feedback.js:2244 (beforeunload disconnect)
window.addEventListener('beforeunload', disconnectAll);
window.addEventListener('pagehide', function(e) {
  if (!e.persisted) disconnectAll();    // real unload/re-inject → tear down
  // e.persisted === true → BF-cache freeze: KEEP observers (D-04 case 1). pageshow(persisted) reconnects port only.
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pageshow` → re-init everything | BF-cache freezes/restores the JS heap; content NOT re-injected; only re-establish ports | Chrome 96+ (BF-cache GA), port-closure Chrome 123 | Re-arming the observer on `pageshow(persisted)` DOUBLE-FIRES — must no-op (D-04). [CITED: web.dev/articles/bfcache; developer.chrome.com/blog/bfcache-extension-messaging-changes] |
| `characterData` observer on the value node | Stable-container `childList`+`characterData`+`subtree` + per-batch re-query | Long-settled MDN/WHATWG guidance | Catches SPA node-swaps `characterData` alone misses (D-05). [CITED: developer.mozilla.org/.../MutationObserverInit; dom.spec.whatwg.org/#mutationobserver] |
| `chrome.alarms` 1-min floor | 30s floor since Chrome 120 | Dec 2023 | The watchdog floor is 30s; live-observe is event-driven (no floor) — that's its advantage. [CITED: developer.chrome.com/blog/chrome-120-beta] |
| rAF batch (dom-stream) | Trailing `setTimeout` debounce for single-element watch | This phase (D-06) | rAF wakes the SW ~60×/s on a ticker; trailing setTimeout coalesces to one report. |

**Deprecated/outdated:** None new. The architecture-doc literal `HighlightManager.show()` pulse extension is OVERRIDDEN by D-07 (Shadow-DOM overlay instead).

## Runtime State Inventory

> Phase 16 is additive feature code, not a rename/refactor. Included for the storage-shape touchpoint only.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `chrome.storage.session` key `fsbTriggerRegistry` — Phase 16 ADDS a `reported_value` (and optional `reported_attributes`) flat scalar to the per-trigger snapshot, WRITTEN by the new SW case, READ by the SEAM (trigger-lifecycle.js:336). The store persists fields verbatim (trigger-store.js:46) — no store code change needed beyond writing the new field. | Code edit only (SW case writes the field). No data migration: existing Phase-15 snapshots simply gain the field on next report; the SEAM already falls back to `last_value` when `reported_value` is absent. |
| Live service config | None — no external service config carries Phase-16 state. | None — verified by scope (in-browser only). |
| OS-registered state | None — no OS scheduler/registry involvement. | None — verified (live-observe needs the tab present; SURV-FUTURE-01 excludes cross-restart). |
| Secrets/env vars | None. | None — verified. |
| Build artifacts | None — extension ships raw JS via `importScripts`/`CONTENT_SCRIPT_FILES`; no compile step for the new content module. The MCP `.cjs` registry mirror is Phase 18, not Phase 16. | None — `trigger-observe.js` is added to the `CONTENT_SCRIPT_FILES` array (background.js:267-285), a source edit, not an artifact. |

**Nothing found in category:** Live service config, OS-registered state, secrets, build artifacts — stated explicitly above.

## Validation Architecture

> nyquist_validation is enabled (config.json has no `workflow.nyquist_validation:false`; key absent = enabled). Live-Chrome UAT is deferred to Phase 20 per D-12 — those behaviors are listed as manual-only below.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in (`node tests/<name>.test.js`), plain assertions + `vm.createContext` sandbox for content modules. No jest/mocha. [VERIFIED: package.json `test` script is a flat `node tests/*.test.js` chain] |
| Config file | none — each test is a standalone Node script appended to the `npm test` chain in package.json |
| Quick run command | `node tests/trigger-observe.test.js` (NEW) ; `node tests/trigger-observe-pulse.test.js` (NEW) |
| Full suite command | `npm test` (append the new files to the chain, beside `trigger-cap.test.js`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WATCH-01 | `optsFor(extract)` returns `{childList,characterData,subtree}` for text/number and `{attributes,attributeFilter:[attr]}` for attribute (D-05) | unit (Node-mock) | `node tests/trigger-observe.test.js` | ❌ Wave 0 |
| WATCH-01 | A mutation → debounced single `sendMessage({action:'triggerValueChanged', value:{text}})` (one report per burst, D-06); coalesces N mutations to 1 | unit (mock `MutationObserver`+`setTimeout`+`sendMessage`) | `node tests/trigger-observe.test.js` | ❌ Wave 0 |
| WATCH-01 | Value report shape is exactly `{text, attributes?}` (the evaluate() contract) | unit | `node tests/trigger-observe.test.js` | ❌ Wave 0 |
| WATCH-01 | SW value-report case writes `reported_value` then the SEAM fires on edge true | unit (extend trigger-lifecycle harness) | `node tests/trigger-lifecycle.test.js` (extend) | ✅ extend |
| WATCH-05 | Idempotent start: second `start(same_id)` disconnects the prior observer (no stacking) | unit (assert observe/disconnect counts) | `node tests/trigger-observe.test.js` | ❌ Wave 0 |
| WATCH-05 | **Leak test:** every observer created is disconnected after stop/disconnectAll (registry empty, disconnect count === observe count) | unit | `node tests/trigger-observe.test.js` | ❌ Wave 0 |
| WATCH-05 | `pagehide(persisted)` does NOT disconnect; non-persisted DOES (BF-cache survival, D-04) | unit (fire fake events, assert disconnect count) | `node tests/trigger-observe.test.js` | ❌ Wave 0 |
| WATCH-05 | Per-batch re-resolve calls `querySelectorWithShadow`; stale (`!isConnected`) cache hit is busted (Pitfall 6) | unit (mock selectors + a swapped node) | `node tests/trigger-observe.test.js` | ❌ Wave 0 |
| WATCH-05 | SOURCE: full-reload re-arm wired off `webNavigation.onCommitted`/`ensureContentScriptInjected`; google-gated SPA hooks NOT relied on | static-grep | `node tests/trigger-observe.test.js` (source assertions, dom-stream-perf.test.js style) | ❌ Wave 0 |
| VIS-01 | SOURCE: `@keyframes fsb-trigger-pulse` present, animates opacity/transform only (no box-shadow/top/left in its block); distinct class `.box-overlay.trigger-pulse` | static-grep on visual-feedback.js | `node tests/trigger-observe-pulse.test.js` | ❌ Wave 0 |
| VIS-01 | `ActionGlowOverlay.showPulse(el)` adds `trigger-pulse` class to boxOverlay (vm-sandbox, mirror overlay-stability-cadence.test.js) | unit (vm sandbox) | `node tests/trigger-observe-pulse.test.js` | ❌ Wave 0 |
| VIS-02 | `buildOverlayState({mode:'trigger-watch'})` includes `mode:'trigger-watch'`; no existing field changed | unit | `node tests/test-overlay-state.js` (extend) or `node tests/trigger-observe-pulse.test.js` | ✅ extend |
| VIS-03 | `clearPulse()` removes the class + destroys overlay; `beforeunload`/non-persisted `pagehide` clears it | unit (vm sandbox) | `node tests/trigger-observe-pulse.test.js` | ❌ Wave 0 |
| VIS-03 | SOURCE: fire SEAM path + `deadline_at` reap delete the snapshot (already covered) so nothing re-asserts the pulse | (covered) | `node tests/trigger-lifecycle.test.js` | ✅ exists |
| VIS-04 | SOURCE: the `@media (prefers-reduced-motion: reduce)` block sets `animation:none` on `.box-overlay.trigger-pulse` and keeps a static cue | static-grep | `node tests/trigger-observe-pulse.test.js` | ❌ Wave 0 |
| INV-04 | SOURCE: `extension/ai/agent-loop.js` byte-unchanged | static (diff/grep `setTimeout` count) | existing `node tests/agent-loop-empty-contents.test.js` + manual diff guard | ✅ exists |
| WATCH-01/05 (real) | Live React/Vue ticker fires with no reload; BF-cache re-arm timing; busy-ticker frame budget | **manual-only (Phase 20 UAT)** | deferred — Node mocks cannot exercise real layout/BF-cache (D-12) | n/a |

### Sampling Rate
- **Per task commit:** `node tests/trigger-observe.test.js && node tests/trigger-observe-pulse.test.js` (the two new files; < 2s)
- **Per wave merge:** `npm test` (full chain with the two new files appended beside `trigger-cap.test.js`)
- **Phase gate:** Full suite green before `/gsd-verify-work`; the deferred live-Chrome items recorded in 16-VALIDATION.md Manual-Only Verifications (Phase-14/15 / v0.10.0 deferred-closeout pattern).

### Wave 0 Gaps
- [ ] `tests/trigger-observe.test.js` — covers WATCH-01, WATCH-05 (observe-options, debounce-coalesce, report shape, idempotent start, **leak test**, BF-cache pagehide nuance, per-batch re-resolve + stale-cache bust, source re-arm wiring). Harness: `vm.createContext` content sandbox (mirror overlay-stability-cadence.test.js:211-242) with a stub `MutationObserver` recording observe/disconnect pairs (mirror change-report-builder.test.js:31), fake `document`/`setTimeout`/`chrome.runtime.sendMessage`.
- [ ] `tests/trigger-observe-pulse.test.js` — covers VIS-01, VIS-03, VIS-04 (showPulse/clearPulse class toggle via the vm-sandbox `ActionGlowOverlay`; source-grep the keyframe/opacity-only/reduced-motion invariants). Harness: the overlay-stability-cadence.test.js vm sandbox + `module.exports` test hook (visual-feedback.js:2300 — **add `ActionGlowOverlay` is already exported there**).
- [ ] Extend `tests/trigger-lifecycle.test.js` — add a case: SW writes `reported_value`, `handleTriggerAlarm` (the on-report path) fires on edge true and disarms (reuse `setupSeamHarness`).
- [ ] Extend `tests/test-overlay-state.js` — assert `mode:'trigger-watch'` additive field; no existing field regressed.
- [ ] Append both new files to the `package.json` `test` chain (beside `trigger-cap.test.js`).
- [ ] Framework install: none — Node built-in test pattern already in place.

## Security Domain

> `security_enforcement` key absent in config.json → treated as enabled. Phase 16 is a DOM-observer reading untrusted page content and crossing the content↔SW message boundary; the relevant ASVS categories are input validation and the message-origin trust boundary.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Content reads/reports only; SW owns the fire decision (Anti-Pattern 2). Isolated-world observer, never main-world (STACK.md) — page script cannot tamper with the observer. |
| V2 Authentication | no | No auth surface in Phase 16 (tool-ownership enforcement is Phase 18, INV-02). |
| V4 Access Control | partial | The SW `onMessage` case MUST keep the existing `sender.id === chrome.runtime.id` guard (background.js:5438) — reject value reports from foreign senders. Per-trigger ownership (agent scoping) is Phase 18; Phase 16's test-arm path is internal-only. |
| V5 Input Validation | **yes** | The reported `value.text` is **untrusted page content**. The SW case validates types (`typeof value.text === 'string'`) before writing `reported_value`; the size cap + ReDoS guard live downstream in `FsbTriggerManager` (PATTERN_MAX_LEN/TEXT_MAX_LEN_* already shipped Phase 15). Do NOT eval/innerHTML the reported text anywhere. |
| V6 Cryptography | no | No crypto in scope. |

### Known Threat Patterns for {MV3 content-observer + SW ingress}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged value-report from a malicious page script | Spoofing | `sender.id === chrome.runtime.id` guard (background.js:5438, already present in the 5436 listener); content-script messages carry the trusted extension id. |
| ReDoS via attacker-controlled DOM text fed to a `regex` condition | DoS | Already mitigated in `FsbTriggerManager.guardAndCompile`/`PATTERN_MAX_LEN=1000`/`TEXT_MAX_LEN_*` (shipped Phase 15). Phase 16 must NOT bypass the SEAM (do not compile/match regex in the content script). [VERIFIED: trigger-manager.js exports guardAndCompile + caps] |
| Unbounded reported text → storage quota / slow rehydrate | DoS | Cap the reported `text` length before `writeSnapshot` (mirror Phase-15 TEXT_MAX_LEN_ELEMENT=10000); store only the extracted scalar, not DOM (PITFALLS.md Performance Traps). |
| Observer flood (self-DoS) on a busy ticker | DoS | Narrowest-node observe + `attributeFilter` + trailing-debounce coalesce (D-05/D-06). |
| Self-trigger feedback loop (pulse mutates observed node) | Tampering/DoS | Shadow-DOM overlay off the watched node (D-07) — observer never sees the overlay. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Feeding the value via `snap.reported_value` + invoking `handleTriggerAlarm({name})` reuses the entire shipped fire path with no duplicated I/O. The SEAM re-reads the snapshot (incl. `reported_value`) and applies TTL-reap+terminal-guard+evaluate+atomic-write. | Pattern 2 | If the planner wants on-report evaluation decoupled from the alarm semantics (e.g. to avoid the TTL-reap check on every report), extract a thin `evaluateReportedValue(triggerId, value, now)` from trigger-lifecycle.js:289-371 instead. Low risk — both reuse the same atomic write-back; this is a wiring choice, not a logic change. [ASSUMED — based on reading trigger-lifecycle.js:269-371; not yet exercised] |
| A2 | A `data-*` flag on the leaf is a sufficient idempotent-arm guard across all three nav classes. | Pattern 5 | If a site strips `data-*` attributes (rare; some sanitizers do), the guard fails open → potential double-arm on BF-cache. Mitigation fallback: also track an in-registry `armed` set keyed by `trigger_id` (a surviving heap keeps the registry too). [ASSUMED — D-04 endorses a node flag; CONTEXT leaves the mechanism to discretion] |
| A3 | The pulse hue (cyan/teal) and timing (2.4s, opacity .45–.90, scale 1.0–1.025) read as "gentle analyzing, distinct from amber run_task." | Pattern 3 / Pulse spec | Purely cosmetic; if it reads too similar to the amber glow, adjust hue/period. No functional risk. Final visual confirmation is the Phase-20 live UAT. [ASSUMED — grounded in fsbActionGlow but not visually verified] |
| A4 | `stableAncestor(leaf)` heuristic (planner's choice) yields a container that survives SPA re-render. | Pattern 5 | If the chosen ancestor is itself re-rendered, the observer detaches → missed fires. Mitigation: prefer an ARIA/role/`data-testid`-anchored ancestor (PITFALLS.md:141); the SW watchdog re-issues `triggerObserveStart` as a backstop. [ASSUMED — D-discretion explicitly defers the heuristic] |
| A5 | The MCP `.cjs` registry mirror and any tool-schema work are entirely Phase 18 — Phase 16 touches no schema, so INV-01 schema-lock stays green trivially. | Runtime State Inventory | If any Phase-16 edit accidentally touches `tool-definitions.js`, the schema-lock CI catches it. Low risk — Phase 16 scope (D-01) excludes it. [ASSUMED — consistent with REQUIREMENTS traceability: REG-* all Phase 18] |

**If this table is empty:** it is not — 5 assumptions flagged. A1 and A2 are the load-bearing ones; the planner should confirm the SW-ingress wiring choice (A1) and the guard mechanism (A2) during plan authoring.

## Open Questions

1. **On-report evaluate: reuse `handleTriggerAlarm` or add `evaluateReportedValue`?**
   - What we know: The SEAM (trigger-lifecycle.js:289-371) already does readSnapshot→guard→evaluate→atomic-write and reads `snap.reported_value`. Feeding it via the alarm-shaped call reuses 100% of the fire path.
   - What's unclear: Whether running the TTL-reap branch (:307) on every value report is desirable, or whether the report path should skip TTL and only check terminal+evaluate.
   - Recommendation: Default to invoking `handleTriggerAlarm` (simplest, fully reuses the dedupe). If TTL-on-every-report is unwanted, extract a sibling `evaluateReportedValue` that runs the same block minus the TTL check. Decide at plan time (A1).

2. **Stable-container heuristic (`stableAncestor`).**
   - What we know: Must survive SPA re-render; D-discretion leaves it to the planner; PITFALLS.md prefers ARIA/role/`data-testid` anchors.
   - What's unclear: `parentElement` vs nearest-stable-ancestor climb vs a fixed depth — site-dependent.
   - Recommendation: Start with a small heuristic climb to the nearest ancestor with a stable id/role/`data-testid` (fall back to `parentElement`); the SW watchdog backstops a wrong guess. Confirm on real SPA fixtures in Phase 20 (A4).

3. **Watchdog alarm naming + re-issue policy (D-03).**
   - What we know: D-03 wants a low-freq watchdog that re-issues `triggerObserveStart` when "the observer should be running but the SW saw no recent report." The existing `fsbTrigger:<id>` alarm already exists for TTL; a SEPARATE `fsbTriggerObserveWatchdog:<id>` (periodInMinutes≥0.5) avoids overloading the TTL alarm's one-shot `when` semantics.
   - What's unclear: Whether to reuse the per-trigger `fsbTrigger:` alarm (currently one-shot `{when:deadline_at}`) or a new recurring watchdog name; and the "no recent report" staleness threshold.
   - Recommendation: Use a NEW recurring `fsbTriggerObserveWatchdog:<id>` (or a single shared one) so the TTL one-shot alarm semantics stay clean; track `last_evaluated_at` and re-issue if `now - last_evaluated_at > N×period`. The 30s alarm floor applies (Chrome 120). Planner finalizes N.

## Environment Availability

> Phase 16 has no NEW external dependencies — all are platform built-ins already permissioned or already-shipped in-tree modules. Probe is informational.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node (test harness) | Node-mock unit tests | ✓ | v24.14.1 | — |
| `chrome.alarms` / `chrome.storage.session` / `chrome.tabs` / `chrome.scripting` / `chrome.webNavigation` | watchdog, snapshot, observe/pulse messaging, re-inject | ✓ (manifest-granted) | Chrome ≥120 | — |
| `MutationObserver` / `attachShadow` (Web API) | the observer + the pulse overlay | ✓ | all MV3 Chrome | — |
| `FsbTriggerStore` / `FsbTriggerManager` / `FsbTriggerLifecycle` | snapshot, evaluate, SEAM | ✓ (shipped Phases 14-15) | in-tree | — |
| `ActionGlowOverlay` / `selectors.js` / `overlay-state.js` | pulse, re-resolve, label | ✓ (shipped) | in-tree | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Sources

### Primary (HIGH confidence — direct working-tree reads, branch `automation`)
- `extension/content/dom-stream.js:6, 705-840, 970-1083` — the MutationObserver start/stop/flush/`sendMessage`/`.disconnect()` clone skeleton; module IIFE + registration + onMessage router shape.
- `extension/content/visual-feedback.js:1200, 1452-1822, 1525-1610, 1601, 2244-2266, 2300-2306` — `ActionGlowOverlay` closed Shadow-DOM glow, `fsbActionGlow` keyframe, reduced-motion `@media`, `_ensureBoxOverlay`, `destroy()`, `beforeunload` disconnect, `module.exports` test hook.
- `extension/content/messaging.js:734, 1087, 1196-1209, 1229-1243, 1424-1432` — the two router switches, single-overlay watchdog, `highlightElement` precedent, named-listener registration + `return true` async pattern.
- `extension/content/selectors.js:22-41, 497-509, 1090-1093` — `validateSelectorUniqueness` return shape; `querySelectorWithShadow` (shadow-pierce/XPath/cache); the cache-first caveat.
- `extension/content/lifecycle.js:454-520, 623-648` — google-gated SPA hooks (NOT universal); BF-cache `pageshow(persisted)`/`pagehide(persisted)` handlers.
- `extension/utils/overlay-state.js:131-144, 366-394, 432-448` — `humanizeOverlayPhase`, `buildOverlayState` return (additive `mode` site), exports.
- `extension/utils/trigger-lifecycle.js:159-168, 195-215, 269-371, 435-507` — alarm helpers, `armTrigger`, the SEAM (`reported_value` consume + atomic fired write-back), restore/orphan-sweep.
- `extension/utils/trigger-store.js:22-49, 76-200` — snapshot field doc (flat scalars), read/write/delete/list API.
- `extension/utils/trigger-manager.js:188-216(extractor), 248-260, 374-434, 580-642` — `evaluate()` contract + `{text, attributes?}` consume; `armTrigger(spec)` test-arm path; exports.
- `extension/utils/value-extractor.js:185-229` — `extractValue(reportedValue, descriptor)` — the exact `{text?, attributes?:{[name]:string}}` shape.
- `extension/background.js:267-285, 2677-2716, 3208-3260, 5436-5448, 6346-6375, 13330-13418` — `CONTENT_SCRIPT_FILES` (no `trigger-observe.js` yet — add it), `webNavigation.onCommitted`, `ensureContentScriptInjected`, the onMessage switch + sender guard, `domStreamMutations` + idempotent watchdog `create`, the alarm dispatcher with the shipped `fsbTrigger:` branch.
- `tests/overlay-stability-cadence.test.js:115-264` — the `vm.createContext` content-module sandbox (fake `document`/`attachShadow`/`createElement`) loading visual-feedback.js via `module.exports`.
- `tests/trigger-lifecycle.test.js:80-189` — `createStorageArea`/`createChromeMock`/`setupSeamHarness` Node-mock harness; the SEAM end-to-end cases.
- `tests/change-report-builder.test.js:31` — the `global.MutationObserver = function StubObserver(){ this.observe=()=>{}; ... }` stub pattern.
- `tests/dom-stream-perf.test.js:32-70` — the source-grep static-invariant test style.
- `.planning/research/{ARCHITECTURE,PITFALLS,STACK,SUMMARY}.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md:59-69`, `16-CONTEXT.md` — milestone research + locked decisions + success criteria.

### Secondary (CITED — settled in 16-CONTEXT.md at HIGH, external docs)
- web.dev/articles/bfcache ; developer.chrome.com/blog/back-forward-cache ; developer.chrome.com/blog/bfcache-extension-messaging-changes — BF-cache heap survival + Chrome-123 port closure.
- developer.mozilla.org/en-US/docs/Web/API/MutationObserverInit ; dom.spec.whatwg.org/#mutationobserver — `childList`+`characterData`+`subtree` catch-all + node-swap behavior.
- developer.chrome.com/blog/chrome-120-beta — 30s alarms floor.

### Tertiary (LOW confidence)
- None — every Phase-16 claim is grounded in a direct in-tree read or a CONTEXT-settled external citation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; every reused module read directly and verified shipping.
- Architecture / clone sources: HIGH — exact `file:line` for every skeleton the planner hands the executor; the SEAM consume-point (trigger-lifecycle.js:336) and the report contract (value-extractor.js:190) verified.
- Re-arm trifurcation (D-04): HIGH — operationalized from CONTEXT (research-settled) and reconfirmed against lifecycle.js:623/454, background.js:2677/3208.
- Pulse visual spec: MEDIUM — grounded in `fsbActionGlow`; exact hue/timing is a cosmetic recommendation pending Phase-20 visual UAT (A3).
- Pitfalls / Security: HIGH — each maps to a verified in-tree control (sender guard, ReDoS caps, disconnect discipline) or a CONTEXT-settled hazard.
- Test strategy: HIGH — both harness precedents (`vm` content sandbox + Node-mock chrome) read directly; leak-test assertion concrete.

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stable — in-tree clone sources change only if those files are refactored; re-verify line numbers if `dom-stream.js`/`visual-feedback.js`/`background.js`/`trigger-lifecycle.js` are edited before planning).
