# Requirements: FSB v0.11.0 Trigger Tool (Reactive DOM Monitoring)

**Defined:** 2026-06-15
**Core Value:** Reliable single-attempt execution -- the AI decides correctly; the mechanics execute precisely. The trigger family extends this to *reactive* watching: FSB reliably watches one element and reports exactly what happened; the AI decides any follow-up.

## v1 Requirements

Requirements for milestone v0.11.0. Each maps to exactly one roadmap phase (see Traceability). Research basis: `.planning/research/{STACK,FEATURES,ARCHITECTURE,PITFALLS,SUMMARY}.md`.

### TRIG -- Core trigger tool & fire conditions

- [x] **TRIG-01**: User can arm a trigger on one targeted DOM element (via FSB's uniqueness-scored selector) by specifying a fire condition.
- [x] **TRIG-02**: A trigger supports the `changed` condition -- fires when the element's value differs from the baseline captured at arm time.
- [x] **TRIG-03**: A trigger supports the `threshold` condition with operators `>=`, `<=`, `>`, `<` against a numeric target.
- [x] **TRIG-04**: A trigger supports the `equals` / `regex` condition -- exact value match or a caller-supplied regular expression (compiled once, guarded against catastrophic backtracking).
- [x] **TRIG-05**: A trigger supports the `contains` condition -- fires when the extracted text contains a substring (case-insensitive by default).
- [x] **TRIG-06**: A trigger supports the `percent_change` condition -- fires when the value moves +/- N% from the arm-time baseline.
- [x] **TRIG-07**: A trigger supports compound conditions -- multiple conditions on the same element combined with explicit AND / OR semantics in a single trigger.

### WATCH -- Watch mechanisms

- [x] **WATCH-01**: User can choose `live-observe` mode -- the trigger watches the element in place via MutationObserver and fires with no page reload (for live pages / SPAs / tickers).
- [x] **WATCH-02**: User can choose `refresh-poll` mode -- the trigger periodically reloads the element's tab and re-reads the value (for static, server-rendered pages).
- [x] **WATCH-03**: Refresh-poll interval is configurable with a hard floor of 30s (Chrome `chrome.alarms` minimum) and a ~60s default; a sub-floor interval is rejected with guidance to use live-observe.
- [x] **WATCH-04**: Refresh-poll reloads target the trigger's OWN tab and never steal focus from the user or other agents (reuses v0.9.60 agent-scoped tab resolution / background-tab defaults).
- [x] **WATCH-05**: Live-observe re-establishes its observer and baseline after in-page navigation / BF-cache restore / SPA soft-navigation so a watched element keeps firing correctly (re-resolve the selector via uniqueness scoring on re-attach).

### EXTRACT -- Value extraction

- [x] **EXTRACT-01**: For `threshold` / `equals` / `percent_change`, the trigger auto-parses a number from the element (strips currency symbols, thousands separators, whitespace) with locale-aware decimal/group handling.
- [x] **EXTRACT-02**: For `changed` / `contains`, the trigger compares raw extracted text.
- [x] **EXTRACT-03**: User can override extraction with `extract: text | number | attribute` (plus an attribute name) to read a specific source (e.g. `data-price`, `aria-valuenow`).
- [x] **EXTRACT-04**: A failed numeric parse yields a distinct `parse_error` outcome and never fires the trigger (no firing on NaN).

### REPORT -- Reporting & fire semantics

- [x] **REPORT-01**: `trigger()` is blocking by default -- the call holds open with ~30s heartbeats and returns when the condition fires or the timeout elapses (mirrors the `run_task` lifecycle-return contract).
- [x] **REPORT-02**: User can arm a trigger in detached mode -- `trigger()` returns a `trigger_id` immediately and the caller polls for status.
- [x] **REPORT-03**: A blocking trigger auto-converts to detached past a configurable safety ceiling (returns the `trigger_id`) so it never holds an MCP request open indefinitely.
- [x] **REPORT-04**: A fire returns a structured event -- matched condition, old value, new value, URL, timestamp -- as notify-only output; the caller/AI decides any follow-up action.
- [x] **REPORT-05**: Triggers fire once (edge-fire) by default and become terminal after firing.
- [x] **REPORT-06**: A timeout returns a distinct `timed_out` outcome (not an error, not a fire) so the AI can choose to re-arm.
- [ ] **REPORT-07**: User can opt a trigger into re-arm-on-fire -- after firing it re-arms and keeps watching, with de-dup / hysteresis so it does not fire repeatedly on the same crossing.

### LIFE -- Lifecycle & concurrency (companion tools)

- [x] **LIFE-01**: User can stop an active trigger with `stop_trigger`, which tears down the observer / cancels the poll alarm and clears the visual pulse.
- [x] **LIFE-02**: User can query a trigger with `get_trigger_status` -- state, current vs initial value, condition, watch mode, elapsed / remaining, last-check time.
- [x] **LIFE-03**: User can list all active triggers with `list_triggers`.
- [x] **LIFE-04**: Multiple triggers can be active concurrently under a configurable cap (mirrors the v0.9.60 agent cap, 1-64); exceeding the cap fails loudly with a typed error.
- [x] **LIFE-05**: A trigger has a maximum lifetime (TTL); orphaned / expired triggers are reaped and their resources (observer, alarm, pulse, registry entry) released.

### SURV -- MV3 survivability (session-scoped)

- [x] **SURV-01**: An armed trigger survives service-worker eviction -- trigger state persists in `chrome.storage.session` and the watch re-arms on SW wake via `chrome.alarms` (no keepalive antipatterns; the load-bearing `setTimeout` agent-loop iterator is untouched, INV-04).
- [x] **SURV-02**: Fire evaluation (compare + fire decision) happens in the service worker against persisted state, so an eviction between read and decision cannot drop or duplicate a fire.
- [x] **SURV-03**: On SW wake, the trigger registry reconciles persisted triggers (re-attach observers / reschedule polls) without duplicate fires or orphaned watchers.

### VIS -- Visual feedback

- [x] **VIS-01**: While a trigger is active, its watched element shows a gentle "analyzing" pulse -- visually distinct from the steady `run_task` glow -- reusing FSB's Shadow DOM overlay.
- [x] **VIS-02**: The visual monitor explicitly labels itself as "watching a trigger" while one or more triggers are active.
- [x] **VIS-03**: The pulse clears when the trigger fires, is stopped, times out, or is reaped (no stuck glow, including across a refresh-poll reload).
- [x] **VIS-04**: The analyzing pulse respects the user's reduced-motion preference.

### REG -- Registry parity & contract safety

- [x] **REG-01**: `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` are registered once in the shared tool registry and exposed to BOTH FSB autopilot and the MCP server (INV-02).
- [x] **REG-02**: The companion tools (`stop_trigger` / `get_trigger_status` / `list_triggers`) are in the MCP read-only bypass set, and the long-running watcher runs in `background.js` (not the MCP handler), so a blocking `trigger()` never starves the single-slot task queue or deadlocks its own `stop_trigger`.
- [x] **REG-03**: All existing MCP tool schemas remain byte-identical; the trigger family is purely additive (INV-01), verified by the existing schema-lock CI gate.
- [x] **REG-04**: The trigger tools behave identically across all 7 AI providers when driven by autopilot (INV-03; trigger logic is provider-agnostic).

## Future Requirements (deferred -- tracked, not in this roadmap)

### COND-FUTURE -- Advanced conditions

- **COND-FUTURE-01**: Compound conditions across DIFFERENT elements in one trigger (e.g. "price < X AND stock = In Stock" spanning two elements). v0.11.0 compounds on a single element only.

### SURV-FUTURE -- Cross-restart persistence

- **SURV-FUTURE-01**: Armed triggers persist to `chrome.storage.local` and auto-resume when Chrome relaunches after a full quit. v0.11.0 is session-only by decision (watch lives while Chrome stays open).

### NOTIFY-FUTURE -- Delivery & action

- **NOTIFY-FUTURE-01**: Desktop / Chrome push notification on fire (relaxes the notify-only boundary deliberately).
- **NOTIFY-FUTURE-02**: Auto-act-on-fire workflows with explicit human-in-the-loop guardrails.

### HIST-FUTURE -- History

- **HIST-FUTURE-01**: Change history / diff timeline for a trigger (a storage + UI product surface).

## Out of Scope

Explicitly excluded for v0.11.0. Anti-features carried from `FEATURES.md` with rationale.

| Feature | Reason |
|---------|--------|
| Server-side / cloud hosting | FSB is a local in-browser MV3 extension; a monitoring backend is a different product and contradicts the privacy/local model. Watch lives while Chrome is open ("browser must be open" is an honest, documented limitation). |
| Own notification channel (email / SMS / desktop push / Slack) | Notify-only by design -- the trigger reports the fire to the driving AI/MCP caller, which already has its own surfacing. Building delivery is a whole product surface. (Push deferred to NOTIFY-FUTURE-01.) |
| Auto-act-on-fire (auto-buy, auto-add-to-cart, auto-submit) | Destroys the Core Value ("the AI decides") and is a dangerous autonomous-action footgun. The AI decides the follow-up after a notify-only fire. (Deferred with guardrails to NOTIFY-FUTURE-02.) |
| Whole-page visual / screenshot diffing | FSB targets ONE element via precise selectors; full-page pixel diff is noisy (ads, timestamps, carousels) and heavy. Uniqueness-scored targeting is more precise. |
| Macro / multi-step pre-check on every poll | Re-running a multi-step macro per poll is fragile and conflates monitoring with automation. Caller uses existing action tools to navigate/auth/reveal the element first, then arms a trigger. |
| Sub-30s refresh-poll cadence | Chrome 120+ `chrome.alarms` minimum period is 30s; sub-minute hammering risks rate-limiting / IP bans. For truly live data use `live-observe` (fires instantly). |
| Cross-browser-restart auto-resume | Session-only chosen for v0.11.0 (simpler, honest limit). Tracked as SURV-FUTURE-01 for a later milestone. |

## Traceability

Which phase covers which requirement. Phase numbering continues from v0.10.0 (Phases 01-13); this milestone is Phases 14-20.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRIG-01 | Phase 18 | Complete |
| TRIG-02 | Phase 15 | Complete |
| TRIG-03 | Phase 15 | Complete |
| TRIG-04 | Phase 15 | Complete |
| TRIG-05 | Phase 15 | Complete |
| TRIG-06 | Phase 15 | Complete |
| TRIG-07 | Phase 15 | Complete |
| WATCH-01 | Phase 16 | Complete |
| WATCH-02 | Phase 17 | Complete |
| WATCH-03 | Phase 17 | Complete |
| WATCH-04 | Phase 17 | Complete |
| WATCH-05 | Phase 16 | Complete |
| EXTRACT-01 | Phase 15 | Complete |
| EXTRACT-02 | Phase 15 | Complete |
| EXTRACT-03 | Phase 15 | Complete |
| EXTRACT-04 | Phase 15 | Complete |
| REPORT-01 | Phase 19 | Complete |
| REPORT-02 | Phase 19 | Complete |
| REPORT-03 | Phase 19 | Complete |
| REPORT-04 | Phase 19 | Complete |
| REPORT-05 | Phase 19 | Complete |
| REPORT-06 | Phase 19 | Complete |
| REPORT-07 | Phase 19 | Pending |
| LIFE-01 | Phase 18 | Complete |
| LIFE-02 | Phase 18 | Complete |
| LIFE-03 | Phase 18 | Complete |
| LIFE-04 | Phase 15 | Complete |
| LIFE-05 | Phase 14 | Complete |
| SURV-01 | Phase 14 | Complete |
| SURV-02 | Phase 14 | Complete |
| SURV-03 | Phase 14 | Complete |
| VIS-01 | Phase 16 | Complete |
| VIS-02 | Phase 16 | Complete |
| VIS-03 | Phase 16 | Complete |
| VIS-04 | Phase 16 | Complete |
| REG-01 | Phase 18 | Complete |
| REG-02 | Phase 18 | Complete |
| REG-03 | Phase 18 | Complete |
| REG-04 | Phase 18 | Complete |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 39 (Phases 14-20; Phase 20 is the integration/composition phase carrying no net-new requirement)
- Unmapped: 0

**Per-phase requirement counts:**
- Phase 14 (Trigger Survivability Foundation): SURV-01, SURV-02, SURV-03, LIFE-05 (4)
- Phase 15 (Fire-Condition Engine & Value Extraction): TRIG-02, TRIG-03, TRIG-04, TRIG-05, TRIG-06, TRIG-07, EXTRACT-01, EXTRACT-02, EXTRACT-03, EXTRACT-04, LIFE-04 (11)
- Phase 16 (Live-Observe Watch & Analyzing Pulse): WATCH-01, WATCH-05, VIS-01, VIS-02, VIS-03, VIS-04 (6)
- Phase 17 (Refresh-Poll Watch): WATCH-02, WATCH-03, WATCH-04 (3)
- Phase 18 (Shared Tool Registry & Dispatcher Wiring): TRIG-01, REG-01, REG-02, REG-03, REG-04, LIFE-01, LIFE-02, LIFE-03 (8)
- Phase 19 (MCP Tools & Blocking/Detached Reporting): REPORT-01, REPORT-02, REPORT-03, REPORT-04, REPORT-05, REPORT-06, REPORT-07 (7)
- Phase 20 (Integration, Cap UI, Docs & Edge Cases): composition phase (0 net-new)

---
*Requirements defined: 2026-06-15*
*Last updated: 2026-06-15 after roadmap creation for milestone v0.11.0 Trigger Tool (Reactive DOM Monitoring) -- all 39 v1 requirements mapped to Phases 14-20*
