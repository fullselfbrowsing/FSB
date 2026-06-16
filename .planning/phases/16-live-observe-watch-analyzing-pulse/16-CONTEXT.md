# Phase 16: Live-Observe Watch & Analyzing Pulse - Context

**Gathered:** 2026-06-16 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the **in-place, single-element MutationObserver** watch mechanism (no page reload) plus the **gentle "analyzing" pulse** on the watched element. The content script reads-and-reports raw values; the **SW owns the fire decision** via the Phase-15 `trigger-manager.evaluate()` SEAM. This is FSB's genuine moat and the milestone's highest-risk runtime piece (flagged for phase-level research; the two flagged open questions are resolved below).

**In scope (6 requirements):**
- **WATCH-01** — `live-observe` mode: watch the element in place via MutationObserver, fire with no reload (live pages / SPAs / tickers); observe the narrowest node, not `document.body`.
- **WATCH-05** — re-establish observer + baseline after in-page nav / BF-cache restore / SPA soft-navigation; re-resolve the selector via uniqueness scoring on re-attach (a **reusable** selector-re-resolution layer that Phase 17 also consumes).
- **VIS-01** — gentle "analyzing" pulse on the watched element, a **Shadow-DOM glow variant**, visually distinct from the steady `run_task` glow.
- **VIS-02** — the visual monitor labels itself "watching a trigger" while one or more triggers are active.
- **VIS-03** — pulse clears on fire / stop / timeout / reap (no stuck glow, incl. across nav); storage-backed clear deadline so a dead SW can't strand it; one overlay owner per tab.
- **VIS-04** — pulse honors `prefers-reduced-motion`.

**Explicitly NOT in this phase:**
- `refresh-poll` tab-owning background reload (Phase 17 — but it **depends on** this phase's shared selector-re-resolution layer).
- Shared tool registry + dispatcher wiring of the 4 MCP tools (Phase 18). **There is no `trigger` MCP/autopilot tool yet in Phase 16** — arming for test is a minimal internal/test-only path (D-03).
- MCP blocking/detached return + structured fire envelope, and the final detached-TTL / blocking-ceiling numbers (Phase 19).
- Refresh-poll-vs-live-observe same-tab conflict (`TRIGGER_TAB_WATCH_CONFLICT`) and reload coalescing (Phase 20).

**Invariants held:** INV-01 (MCP tool schemas byte-identical — no tool registration here), INV-02 (shared registry — deferred to Phase 18), INV-03 (provider-agnostic), **INV-04 (`extension/ai/agent-loop.js` setTimeout iterator byte-FROZEN — do not touch)**, INV-06 (Lattice package pinned; triggers do not route through the Lattice adapter).
</domain>

<decisions>
## Implementation Decisions

### A. Module Decomposition & SW Value-Report Ingress

- **D-01:** Phase 16 creates **exactly one new content module** `extension/content/trigger-observe.js` (single-element debounced MutationObserver, **isolated world**, reports raw value deltas to the SW) and **modifies three existing files**: `content/messaging.js` (additive router cases only), `content/visual-feedback.js` (analyzing-pulse variant + "watching" label), and `extension/background.js` (a new `chrome.runtime.onMessage` case that ingests the value report — see D-02). `trigger-observe.js` is added to the isolated-world programmatic injection bundle (`CONTENT_SCRIPT_FILES`, background.js ~267-285). It is a **new module, NOT bolted into `dom-stream.js`** (dom-stream is whole-page for the dashboard; its `fsb-domstream-watchdog` + `ext:dom-mutations` wire shape are LOCKED). No new SW util module — the fire decision reuses the Phase-14/15 SEAM, not a fresh evaluator. `manifest.json` is unchanged (all permissions already granted).
- **D-02:** Live-observe fire is evaluated **on the content value-report message, not on an alarm tick**. The content script reports via `chrome.runtime.sendMessage({ action:'triggerValueChanged'|'triggerValueReport', trigger_id, value:{ text, attributes? } })`; a **new `background.js onMessage` case** (modeled on the existing `domStreamMutations` case, background.js:6346, with `sender.tab.id` available) re-reads the snapshot from `chrome.storage.session` and drives `FsbTriggerManager.evaluate(snapshot, value, now)` through the **Phase-15 lifecycle SEAM** (`trigger-lifecycle.js` — the SOLE owner of fire-path storage I/O: on `'fired'` it writes `status:'fired'+fired_at` atomically then clears the alarm; `evaluate()` stays pure). The reported `value` shape is exactly the locked `{ text, attributes? }` contract `value-extractor.extractValue` / `evaluate()` consume.
- **D-03:** Phase 16 **adds the low-frequency live-observe watchdog alarm now** and a **test-only arm path**:
  - **Watchdog:** armed idempotently (`chrome.alarms.create`, same-name-replaces) from the value-report case; the watchdog tick is the **backstop** that re-issues `triggerObserveStart` when "the observer should be running but the SW saw no recent report" (covers SW-eviction-while-the-page-observer-lives, and an undetected nav). This is the two-tier pattern already shipped for DOM streaming (Phase 211): content observer + SW alarm safety re-arm.
  - **Test-only arm:** a minimal internal helper / message path that writes an `armed` snapshot (built on the existing `trigger-lifecycle.armTrigger(snapshot)` seam, ~:195) + sends `triggerObserveStart` + `triggerPulseStart` — **NOT** an MCP/autopilot tool (those are Phase 18). Keeps Phase 16 "testable in isolation," matching Phases 14/15.

### B. Live-Observe Re-Arm & Selector Re-Resolution (WATCH-05) — research-settled

- **D-04:** Re-arm is **trifurcated by navigation type** (a naïve "re-arm on every `pageshow`" would double-fire — corrected by research):
  1. **BF-cache restore** (`pageshow` with `event.persisted === true`): the page-resident observer **survived** (BF-cache freezes/resumes the JS heap; the content script is **NOT** re-injected; load/DOMContentLoaded do not re-fire) → **DO NOT re-observe** (re-arming would create a duplicate observer → double fire). Only re-establish the SW message port **if** a persistent `chrome.runtime.connect()` port is held (Chrome 123+ proactively closes the port on BF-cache entry; one-shot `sendMessage` reporting needs no reconnect). *(web.dev/articles/bfcache; developer.chrome.com/blog/back-forward-cache; .../bfcache-extension-messaging-changes — HIGH.)*
  2. **SPA soft-nav / framework re-render that REPLACES the watched node**: observe a **stable container ancestor** (never the leaf — a replaced leaf detaches the observer) and **re-resolve the target by its uniqueness-scored selector each mutation batch** before reading. No re-observe needed (container is stable). `childList` on the container catches the node-swap that `characterData` alone misses.
  3. **Full reload / hard navigation**: content script is re-injected → re-arm is driven **SW-side** off `chrome.webNavigation` / `chrome.tabs.onUpdated` for the trigger's OWN owned tab (`ensureContentScriptInjected(tabId)` already exists, background.js ~3208, gated on status==='complete' ~3217), which re-sends `triggerObserveStart`.
  - An **idempotent-arm guard** (e.g. a `data-fsb-trigger-armed` flag on the resolved node, checked before `observe()`) makes arming safe across ALL three cases — a genuinely re-injected script never double-arms, and a surviving observer is never stacked.
  - ⚠️ The `lifecycle.js` `pushState`/`replaceState`/`popstate` hooks are **google.com-ONLY** (gated by `if (hostname.includes('google.com'))` at lifecycle.js:454) — they are **NOT** a universal re-arm signal. The universal BF-cache `pageshow(persisted)` handler (lifecycle.js:623) IS reused for case 1.
- **D-05:** **Observe options are matched to the `extract` kind** (research-confirmed catch-all):
  - text / number → `{ childList:true, characterData:true, subtree:true }` on the stable container (`childList` = node add/remove/swap; `characterData` = in-place text edit; together = the catch-all). *(MDN MutationObserverInit; WHATWG DOM §4.3 — HIGH.)*
  - attribute → `{ attributes:true, attributeFilter:[attrName] }` (e.g. `data-price`, `aria-valuenow`) to cut record volume.
  - `attributeOldValue` / `characterDataOldValue` stay **OFF** (not needed; the durable `last_value` lives in the snapshot).
- **D-06:** The MutationObserver callback is **debounced with a trailing in-page `setTimeout` (~150–300ms), NOT `requestAnimationFrame`** — a ticker mutating dozens of times/sec must coalesce to **one** value read + one report (rAF would wake the SW ~60×/sec). The new module clones the `dom-stream.js` `startMutationStream`/`stopMutationStream`/`sendMessage` skeleton (~744-816) but **swaps rAF for the trailing-setTimeout debounce**. Exact debounce ms within 150–300 is the planner's tuning call.

### C. Analyzing Pulse, "Watching" Label & Clear Lifecycle (VIS-01..04)

- **D-07:** **The pulse is hosted in the Shadow-DOM element-glow overlay** (visual-feedback.js ~1508+, the real `run_task` element glow with `attachShadow` + position tracking), as a **new pulse keyframe/variant** — **NOT** the inline-style `HighlightManager.show()` (visual-feedback.js:41-88, which writes `box-shadow` directly on the page element). **(User-confirmed decision, 2026-06-16.)** Rationale: VIS-01 requires a "Shadow-DOM glow variant"; inline styles on a live SPA node (a) get wiped by framework re-renders mid-watch and (b) mutate the page element's own `style`, which the `characterData`+`childList` observer could itself observe → a self-trigger feedback loop. The Shadow-DOM overlay (separate from page DOM, tracks the element) avoids both. The architecture doc's literal `HighlightManager.show()` extension is **overridden** by this decision.
- **D-08:** The pulse is a `@keyframes fsb-trigger-pulse` animation toggled by a `{ pulse:true }` / `showPulse()` flag, animating **GPU-composited `opacity`/`transform` ONLY — never layout properties** (no `box-shadow`/`top`/`left`/`width` animation), so it does not jank the busy ticker it watches. It is visually **distinct from the steady action/`run_task` glow** (which uses a static box-shadow). Reuse the existing `@media (prefers-reduced-motion: reduce)` block (visual-feedback.js:1601) → animation off, static cue kept (VIS-04).
- **D-09:** The **"watching a trigger" label** rides an **additive `overlayState.mode = 'trigger-watch'`** field on the overlay-state object (overlay-state.js `buildOverlayState` ~:366 / `FSBOverlayStateUtils` ~:444), rendered by the `ViewportGlow` state machine (visual-feedback.js `state-thinking` ~:1100). **Additive only — no existing overlay-state field changes** (the dashboard mirror consumes this object; INV-01-style discipline).
- **D-10:** **Pulse drive + clear:** the SW sends `triggerPulseStart{selector}` on arm (content resolves the element and applies the pulse, mirroring the `highlightElement` router case, messaging.js ~1229-1243) and `triggerPulseStop` on fire/stop. Clear is **guaranteed even with a dead SW** via the existing storage-backed reap: the fire SEAM clears atomically (trigger-lifecycle.js ~350-360); content `beforeunload`/`pagehide` clears any orphan; and the `deadline_at` TTL reap (trigger-lifecycle.js ~307) deletes the snapshot so nothing re-asserts the pulse (VIS-03). **One overlay owner per tab** — the trigger pulse is a *state* of the single overlay, gated against the `run_task` glow (reuse the single-overlay watchdog, messaging.js ~1196-1209), never a second overlay.

### D. Teardown Discipline, Multiplexing & Tests

- **D-11:** `trigger-observe.js` keeps **one observer registry per content-script instance** (`Map<trigger_id, { observer, debounceTimer, container, selector }>`) with **idempotent start** (disconnect any prior observer for the same `trigger_id` before observing) and **guaranteed disconnect-all on every teardown path**: fire, `triggerObserveStop`, `beforeunload`, **`pagehide`** (added — the existing code only hooks `beforeunload` at visual-feedback.js:2244/2258, which is unreliable on BF-cache entry where `pagehide` is the correct event), and re-injection. **Independent observer per trigger** (one per watched element, narrowest node) — NOT a single multiplexed `document.body` observer (which reintroduces the ticker flood, Pitfall 5). A **dedicated "every observer created is disconnected" leak test** is required (Pitfall 4).
- **D-12:** Tests are **Node-mock content-module unit tests** (mock `MutationObserver`, `chrome.runtime.sendMessage`, `document`), mirroring the existing trigger-store/lifecycle Node tests and reusing the established lazy-`_getChrome()` / `module.exports` test-hook idiom (visual-feedback.js already has a node test hook ~:2300). They assert: observe-options-per-extract-kind (D-05), trailing-debounce report shape `{ text, attributes? }` (D-02/D-06), idempotent start, and the "every observer disconnected" leak test (D-11). **Live-Chrome UAT is deferred** to the Phase-20 integration pass (consistent with the Phase-14/15 / v0.10.0 deferred-closeout pattern) — specifically the real-SPA/BF-cache re-arm timing (D-04) and the busy-ticker frame-budget behavior, which Node mocks cannot fully exercise.

### Claude's Discretion
- Exact debounce value within the 150–300ms band (D-06) — tune to ticker fixtures.
- The exact `data-*` flag name / mechanism for the idempotent-arm guard (D-04) — any persisted-on-node marker that survives a surviving observer and is absent on a fresh re-inject.
- The exact `action` string names for the new router/report messages (`triggerValueChanged` vs `triggerValueReport`, etc.) — follow the existing `domStream*` / `highlightElement` naming.
- Whether the stable-container ancestor is the resolved element's `parentElement`, a configured nearest-stable ancestor, or a heuristic climb — planner's call, as long as it is re-resolution-stable across SPA re-render.
- Node-mock harness shape — mirror the existing content/util Node tests.

### Folded Todos
None — no pending todos matched this phase (`todo.match-phase 16` → 0).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/ROADMAP.md` lines 59-69 — Phase 16 goal + the 4 success criteria (live-observe no-reload + narrowest-node; re-arm + selector re-resolution; analyzing pulse distinct from run_task glow + "watching" label; clear-on-fire/stop/timeout + storage-backed deadline + one-owner + reduced-motion).
- `.planning/REQUIREMENTS.md` — WATCH-01, WATCH-05, VIS-01, VIS-02, VIS-03, VIS-04 (lines ~22, 25, 61-64).
- `.planning/phases/14-trigger-survivability-foundation/14-CONTEXT.md` — LOCKED: snapshot shape (flat scalars incl. `selector`, `target_tab_id`, `agent_id`, `baseline`, `last_value`, `watch`, `deadline_at`, `alarm_name`); the `fsbTrigger:<id>` alarm + `noop_terminal` guard; `restoreTriggersFromStorage`; tab-close reap.
- `.planning/phases/15-fire-condition-engine-value-extraction/15-CONTEXT.md` — LOCKED: the pure `evaluate(snapshot, reportedValue, now?)` contract; the **reportedValue `{ text, attributes? }` shape this phase's watch layer must produce**; the trigger-lifecycle SEAM as the sole owner of fire-path storage I/O.
- `.planning/research/ARCHITECTURE.md` — the watch-layer file map (`trigger-observe.js` NEW :60-62,79,448; `messaging.js`/`visual-feedback.js` MOD :84,456-457); **Pattern 3** live-observe survival + SW-side re-arm on `webNavigation`/`tabs.onUpdated` (:210-212); **Pattern 4** analyzing pulse + "watching" label via additive `overlayState.mode` (:214-232); the value-report SW ingress (`onMessage → evaluate`, :324-327,406); Anti-Pattern 2 (evaluate in SW, not content, :378-382); Build-Sequence step 4 (:430).
- `.planning/research/PITFALLS.md` — Pitfall 4 observer leak / disconnect-all-on-teardown + leak test (:88-100); Pitfall 5 broad-subtree perf → narrowest-node + `attributeFilter` + coalesce (:112-126); Pitfall 6 SPA node-replacement → stable-container + per-batch re-resolution (:130-146); Pitfall 8 stale-selector re-resolution (:175); the UX/overlay table — GPU-composited, reduced-motion `:1601`, storage-backed clear, one-owner-per-tab, no run_task collision (:414-418).
- `.planning/research/STACK.md` — observe-options + **trailing-setTimeout debounce ~150-300ms** (:114-116); isolated-world (not main-world) observer (:108); the analyzing-pulse asset map (Shadow-DOM overlay + keyframes + reduced-motion + ViewportGlow, :143); re-resolve selector after nav (:159).
- `.planning/research/FEATURES.md` — live-observe as the moat + MutationObserver survives SW eviction (:49,117); in-page analyzing pulse reuses the overlay (:50); the flagged MutationObserver-fire-delivery-across-eviction research note (:203).
- `.planning/research/SUMMARY.md` — convergent build order (research "Phase 4" == roadmap Phase 16, :106-109); live-observe hazards summary (:82); flagged open questions (:142,168).
- `extension/content/dom-stream.js` (~744-816, 757-758, 802-816) — the live-observe **template**: `startMutationStream`/`stopMutationStream`, batch/debounce, `chrome.runtime.sendMessage`, guaranteed `.disconnect()`. Clone the skeleton; swap rAF→trailing-setTimeout.
- `extension/content/visual-feedback.js` — Shadow-DOM element glow `show(element)` + `attachShadow` + `@keyframes` + composited `will-change` (~1508-1601); reduced-motion block (~1601); `beforeunload` observer-disconnect (~2244,2258); `ViewportGlow` `state-thinking` (~1100); node test hook (~2300). The inline-style `HighlightManager` (~25-88) is the path **NOT** chosen for the pulse (D-07).
- `extension/content/messaging.js` — the content router + `highlightElement` precedent (~1229-1243) for the new `triggerObserveStart/Stop`, `triggerRead`, `triggerPulseStart/Stop` cases; the single-overlay watchdog (~1196-1209).
- `extension/content/selectors.js` — uniqueness-scored re-resolution API to call each batch: `FSB.querySelectorWithShadow(selector)` (~497,1090) + `FSB.validateSelectorUniqueness` (~22,1093).
- `extension/content/lifecycle.js` — ⚠️ `pushState`/`replaceState`/`popstate` hooks are **google.com-gated** (:454-513, NOT universal); the universal BF-cache `pageshow(persisted)` handler (:623); `pagehide` port handler (:640).
- `extension/content/overlay-state.js` — `buildOverlayState` (~:366) / `FSBOverlayStateUtils` (~:444); add the `mode:'trigger-watch'` field here (D-09).
- `extension/utils/trigger-lifecycle.js` — the Phase-15 fire SEAM + atomic `fired` write-back (~350-360); `armTrigger(snapshot)` (~195) for the test-arm path; `handleTriggerAlarm` (~269) + `restoreTriggersFromStorage` (~435) + TTL reap (~307) for the watchdog branch.
- `extension/utils/trigger-store.js` — snapshot read/write + fields (`selector`/`target_tab_id`/`deadline_at` ~:40); `listArmedSnapshots()`.
- `extension/utils/trigger-manager.js` — the pure `evaluate()` the SW ingress calls; the reportedValue contract.
- `extension/background.js` — the glue regions: `chrome.runtime.onMessage` switch (~5436) + `domStreamMutations` precedent (~6346) + watchdog `create` precedent (~6361); `onAlarm` dispatcher (~13284); `chrome.webNavigation.onCommitted` (~2677) + `ensureContentScriptInjected` (~3208) gated on `tabs.onUpdated` status==='complete' (~3217); `CONTENT_SCRIPT_FILES` injection bundle (~267-285).
- `extension/manifest.json` lines 9-19, 49-56 — `alarms`/`storage`/`tabs`/`scripting`/`webNavigation` already granted; `canvas-interceptor.js` is the only MAIN-world static content script (the trigger observer is isolated-world). **No manifest change.**
- **External (research-resolved, HIGH confidence):** BF-cache observer survival + no re-injection + Chrome-123 port closure — https://web.dev/articles/bfcache , https://developer.chrome.com/blog/back-forward-cache , https://developer.chrome.com/blog/bfcache-extension-messaging-changes . characterData-misses-node-swap → stable-container `childList`+`characterData`+`subtree` + re-query each batch — https://developer.mozilla.org/en-US/docs/Web/API/MutationObserverInit , https://dom.spec.whatwg.org/#mutationobserver .
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/content/dom-stream.js` — the MutationObserver start/stop + debounce + `sendMessage` + guaranteed-disconnect template (clone the skeleton; swap rAF→trailing-setTimeout, scope to ONE element not whole page).
- `extension/content/visual-feedback.js` — the Shadow-DOM element glow (`attachShadow`, `@keyframes`, composited `will-change`), the reduced-motion `@media` block, the `beforeunload` observer-disconnect discipline, and the `ViewportGlow` state machine — all extended for the pulse + label.
- `extension/content/messaging.js` — the content router + `highlightElement` case (the pulse-message precedent) + the single-overlay watchdog.
- `extension/content/selectors.js` — uniqueness-scored selector resolution (`querySelectorWithShadow` + `validateSelectorUniqueness`) for per-batch re-resolution.
- `extension/utils/trigger-lifecycle.js` / `trigger-store.js` / `trigger-manager.js` — the Phase-14/15 survivable scaffold + pure `evaluate()` the SW ingress drives.
- `extension/background.js` — the `onMessage` switch (`domStreamMutations` precedent), idempotent watchdog-alarm `create`, `webNavigation`/`ensureContentScriptInjected` re-arm machinery, and the `CONTENT_SCRIPT_FILES` injection bundle.
- **NET-NEW (no precedent):** `extension/content/trigger-observe.js` (single-element observer + per-batch re-resolution + idempotent-arm guard); the analyzing-pulse keyframe variant; the SW value-report `onMessage` case.

### Established Patterns
- **Content reports raw, SW decides:** content reads + reports the `{ text, attributes? }` value; the SW (`trigger-manager.evaluate` via the lifecycle SEAM) owns the fire decision against the persisted `last_value` (mirrors dom-stream: content sends mutations, SW/dashboard interprets). Anti-Pattern 2 forbids evaluating in the content script.
- **Two-tier survival:** page-resident observer (survives SW eviction) + low-freq SW watchdog alarm (re-issues `triggerObserveStart` after eviction/undetected-nav) — the Phase-211 DOM-stream pattern.
- **Disconnect-all discipline:** every `.observe()` paired with a guaranteed `.disconnect()` on all teardown paths; idempotent start; leak test.
- **Additive overlay state:** add `mode:'trigger-watch'`, never mutate an existing overlay-state field (dashboard mirror consumes it).
- **Storage-backed overlay clear:** the `deadline_at` reap guarantees the pulse clears even if the SW is dead.

### Integration Points
- `background.js onMessage` (~5436, beside `domStreamMutations` ~6346) — NEW value-report case → `evaluate()` via the lifecycle SEAM; idempotent watchdog `create` (~6361 precedent).
- `background.js webNavigation/onUpdated` (~2677, 3208, 3217) — SW-side re-arm (`ensureContentScriptInjected` → `triggerObserveStart`) for full-reload/hard-nav.
- `background.js CONTENT_SCRIPT_FILES` (~267-285) — register `trigger-observe.js` in the isolated-world injection bundle.
- `trigger-lifecycle.js` fire SEAM (~350-360) + `armTrigger` (~195) + alarm handler (~269) — fire write-back, test-arm path, watchdog branch.
- `content/messaging.js` router (~1229) — new observe/read/pulse cases.
- `content/visual-feedback.js` (~1508, 1601, 2244) + `content/overlay-state.js` (~366,444) — pulse variant, reduced-motion, teardown, `mode` field.
- `content/lifecycle.js` (~623 BF-cache `pageshow`; ⚠️ ~454 google-gated SPA hooks) — BF-cache case reuse; do NOT rely on the google-gated hooks.
- `extension/ai/agent-loop.js` — **do not touch** (INV-04). No MCP tool-schema / registration changes (INV-01 / Phase 18).
</code_context>

<specifics>
## Specific Ideas

- **Re-arm is trifurcated, and BF-cache is the trap:** on BF-cache restore the observer **survived** — re-arming would **double-fire**. Only re-establish a persistent SW port if one is held; one-shot `sendMessage` needs nothing. (web.dev/bfcache + Chrome 123 port-closure docs.)
- **The `lifecycle.js` SPA hooks are google.com-only** (hostname-gated at :454) — re-arm on full-reload/hard-nav is driven **SW-side** off `webNavigation`/`tabs.onUpdated`, not those content hooks.
- **Observe the stable CONTAINER, not the leaf** — a framework that replaces the watched node detaches a leaf-bound observer (`characterData` misses node-swaps; `childList` catches them). Re-resolve the target by selector each batch; the container observer stays put (no re-observe).
- **Pulse lives in the Shadow-DOM overlay, not inline `HighlightManager`** (user-confirmed) — avoids re-render wipe AND a self-trigger feedback loop where the observer sees the pulse's own inline `style` mutation.
- **GPU-composited `opacity`/`transform` only** for the pulse — never animate layout, or it janks the very ticker it watches.
- **Debounce is trailing `setTimeout` ~150-300ms, not rAF** — coalesce a 500-mutation burst into one read + one report, not one-per-frame.
- **Evaluate fires on the value-report message** (instant), with the alarm as a low-freq watchdog backstop — not the other way around.

## Flagged for Phase-Level Research / Live-UAT (Phase 20)
The two highest-risk items are research-resolved at HIGH confidence (above) but warrant live-Chrome confirmation, NOT re-derivation:
1. Exact BF-cache restore behavior in the installed Chrome (observer-survives vs context-recreated) and the idempotent-arm guard holding across both — the design (survive→reconnect-only; fresh-inject→SW-re-arm; guard prevents double-arm) is settled; verify timing live.
2. `{ childList, characterData, subtree }` on a stable container catching real React/Vue/Angular text-node swaps on a live ticker fixture — settled by MDN/WHATWG; verify on a real SPA.
</specifics>

<deferred>
## Deferred Ideas

- **Refresh-poll (tab-owning background reload)** — Phase 17 (consumes this phase's shared selector-re-resolution layer).
- **Shared tool registry + dispatcher wiring (the 4 MCP/autopilot tools)** — Phase 18 (Phase 16 arms via a test-only path; INV-02 registration is Phase 18).
- **MCP blocking/detached return + structured fire envelope + final detached-TTL / blocking-ceiling numbers** — Phase 19.
- **Refresh-poll-vs-live-observe same-tab conflict (`TRIGGER_TAB_WATCH_CONFLICT`) + co-located reload coalescing** — Phase 20.
- **Multiplexed single observer over multiple elements per tab** — out of scope; Phase 16 uses independent observers per trigger (multiplexing is a later perf optimization if 8-64 concurrent live-observe triggers on one tab ever materializes).
- **Cross-browser-restart auto-resume for live-observe** — SURV-FUTURE-01 (live-observe needs the tab present; a gone tab → `needs_attention`, not auto-resume).
- **Live-Chrome UAT** for re-arm timing + busy-ticker frame budget — deferred to the Phase-20 integration pass (Phase-14/15 / v0.10.0 pattern).

### Reviewed Todos (not folded)
None — no pending todos matched this phase.
</deferred>
