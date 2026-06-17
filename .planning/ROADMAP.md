# Roadmap: FSB (Full Self-Browsing)

## Milestones

- **v0.10.0 Autopilot via Lattice SDK** — Phases 01-13, 52 plans, shipped 2026-06-15.
- **v0.11.0 Trigger Tool (Reactive DOM Monitoring)** — Phases 14-20 (in progress).

## Overview (v0.11.0)

v0.11.0 adds a `trigger` tool family that turns FSB from a "do a task and stop" automaton into a *reactive watcher*: arm a watch on one uniqueness-scored DOM element, get notified when its value changes / crosses a threshold / equals a target / contains text, and let the AI decide the follow-up (notify-only). The build is dependency-ordered around the stated crux — **MV3 service-worker-eviction survival** — because a watch that dies on eviction is broken. The journey: first build the storage-backed registry + lifecycle + SW-wake survival (the foundation everything else is tested against); then the pure, unit-testable fire-condition engine + locale-aware value extraction + concurrency cap; then the two watch mechanisms (the high-risk in-place `live-observe` MutationObserver with its analyzing pulse, then the tab-owning background `refresh-poll`); then the single shared tool registry + dispatcher that exposes the family to BOTH autopilot and MCP (the INV-01/INV-02 verification point, where queue-starvation is structurally prevented); then the MCP tools with blocking/detached dual-mode return (a near-clone of the proven `run_task` lifecycle); and finally an integration/UX phase that composes the cap UI, docs, and the cross-mode edge cases. Zero new runtime dependencies, zero new architectural primitives, zero `manifest.json` changes — every piece copies the shape of a shipping FSB subsystem and changes the constants.

## Phases

**Phase Numbering:**
- Integer phases (14, 15, 16): Planned milestone work (continues from v0.10.0's Phase 13 — no reset).
- Decimal phases (15.1, 15.2): Urgent insertions (marked with INSERTED).

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 14: Trigger Survivability Foundation** — Storage-backed trigger registry + per-trigger alarm lifecycle that survives SW eviction and reconciles on wake/restart.
- [ ] **Phase 15: Fire-Condition Engine & Value Extraction** — The six fire conditions + compound AND/OR, locale-aware number/text extraction, edge-fire + cap, all SW-side and unit-testable.
- [ ] **Phase 16: Live-Observe Watch & Analyzing Pulse** — In-place single-element MutationObserver (no reload) with SPA/BF-cache re-arm, plus the gentle "analyzing" pulse on the watched element.
- [x] **Phase 17: Refresh-Poll Watch (Tab-Owning Background Reload)** — Alarm-driven background reload of the trigger's own tab with a 30s floor, no focus theft. (completed 2026-06-16)
- [x] **Phase 18: Shared Tool Registry & Dispatcher Wiring** — Register `trigger` + 3 companions once for autopilot AND MCP; companions in the read-only bypass; watcher in background.js; INV-01 schema-lock stays green. (completed 2026-06-17)
- [ ] **Phase 19: MCP Tools & Blocking/Detached Reporting** — The 4 MCP `server.tool()` registrations with blocking-by-default (heartbeats + auto-convert-to-detached) and detached opt-in, returning structured notify-only fire events.
- [ ] **Phase 20: Integration, Cap UI, Docs & Edge Cases** — Compose the full system: trigger-cap control, watch-mode conflict + reload coalescing, CHANGELOG/README docs, `fsb-mcp-server@0.10.0` bump.

## Phase Details

### Phase 14: Trigger Survivability Foundation
**Goal**: A storage-backed trigger registry and per-trigger alarm lifecycle exist so that an armed trigger survives MV3 service-worker eviction, wakes the SW to re-evaluate, and reconciles cleanly on browser restart — the milestone crux, testable before any watch mechanism exists.
**Depends on**: Phase 13 (v0.10.0 complete; reuses shipped `mcp-task-store.js` + `mcp-visual-session-lifecycle.js` patterns)
**Requirements**: SURV-01, SURV-02, SURV-03, LIFE-05
**Success Criteria** (what must be TRUE):
  1. An armed trigger's state (spec, baseline, last value, status) persists in `chrome.storage.session` and is re-read from storage — not SW heap — on every evaluation, so the SW can be evicted between read and fire-decision without dropping or duplicating a fire.
  2. After the service worker is evicted for >30s (devtools closed), a `chrome.alarms` tick wakes it, re-hydrates the trigger registry from storage, and re-evaluates — with no keepalive antipattern present (the SW is allowed to idle to eviction; the load-bearing `setTimeout` agent-loop iterator is byte-untouched, INV-04).
  3. On SW startup / browser restart, the registry reconciles persisted triggers against `chrome.alarms.getAll()`, re-arms `armed` triggers, and drops `fired`/expired ones with no duplicate fires or orphaned watchers (alarm-into-the-void is impossible).
  4. A trigger has a maximum lifetime (TTL); expired or orphaned triggers are reaped and their alarm + registry entry released (a trigger whose tab closed is reaped via `chrome.tabs.onRemoved`).
**Plans**: 3 plans (1 per wave)
- [x] 14-01-PLAN.md — trigger-store.js (chrome.storage.session envelope, clone of mcp-task-store.js) + Node-mock test + npm test wiring [SURV-01]
- [x] 14-02-PLAN.md — trigger-lifecycle.js (alarm handler, reconcile + getAll() orphan sweep, TTL/tab-close reap; overlay stripped) + Node-mock test + npm test wiring [SURV-02, SURV-03, LIFE-05]
- [x] 14-03-PLAN.md — background.js 4 additive glue points (importScripts, bootstrap restore, onAlarm branch, tabs.onRemoved) + live-Chrome survival checkpoint [SURV-01, SURV-03, LIFE-05]

### Phase 15: Fire-Condition Engine & Value Extraction
**Goal**: A pure, SW-side trigger manager can evaluate every fire condition against a persisted baseline with locale-correct value extraction, edge-fire semantics, and a configurable concurrency cap — the genuinely-new comparison logic, unit-testable in isolation.
**Depends on**: Phase 14
**Requirements**: TRIG-02, TRIG-03, TRIG-04, TRIG-05, TRIG-06, TRIG-07, EXTRACT-01, EXTRACT-02, EXTRACT-03, EXTRACT-04, LIFE-04
**Success Criteria** (what must be TRUE):
  1. A trigger fires correctly for each condition kind: `changed` (any delta from arm-time baseline), `threshold` (`>=`/`<=`/`>`/`<` numeric), `equals`/`regex` (exact value or caller regex compiled once and guarded against catastrophic backtracking), `contains` (case-insensitive substring), and `percent_change` (+/- N% from baseline) — and multiple conditions on one element combine with explicit AND/OR.
  2. Numeric extraction parses `$1,234.56`, `1.234,56` (DE), `1 234,56` (FR/NBSP), parentheses-negatives and `%` correctly via locale-aware normalize-then-parse (both sides parsed to Number before any comparison — never a string-vs-number compare); raw trimmed text is used for `changed`/`contains`.
  3. A caller can override extraction with `extract: text | number | attribute` (plus attribute name) to read a specific source such as `data-price` or `aria-valuenow`.
  4. A failed numeric parse yields a distinct `parse_error` outcome and NEVER fires (no firing on NaN, never treated as 0); an oscillating value at the threshold yields exactly one fire (edge-trigger + fire-once default + hysteresis), not a storm, and a single change yields exactly one delivered fire (atomic disarm + dedupe key).
  5. Multiple triggers run concurrently under a configurable cap (1-64, default 8, mirroring the agent cap); arming past the cap fails loudly with a typed `TRIGGER_CAP_REACHED` error.
**Plans**: 3 plans (1 per wave)
- [x] 15-01-PLAN.md — value-extractor.js (locale-aware numeric parse via Intl.formatToParts + text/number/attribute extract) + test [EXTRACT-01..04]
- [x] 15-02-PLAN.md — trigger-manager.js (6 condition kinds + compound AND/OR + edge/fire-once/hysteresis + ReDoS-guarded regex + storage-first concurrency cap) + tests [TRIG-02..07, LIFE-04]
- [x] 15-03-PLAN.md — wire evaluate() into the trigger-lifecycle SEAM (atomic fired write-back) + background.js importScripts glue + extended lifecycle test [TRIG-02..07, EXTRACT-01..04, LIFE-04]

### Phase 16: Live-Observe Watch & Analyzing Pulse
**Goal**: A trigger can watch a live-updating element in place (no reload) via a debounced single-element MutationObserver that re-arms across SPA/BF-cache navigation, while the watched element shows a gentle "analyzing" pulse distinct from the `run_task` glow — FSB's genuine moat and the highest-risk runtime piece.
**Depends on**: Phase 15 (SW receives value reports and owns the fire decision), Phase 14 (survival)
**Requirements**: WATCH-01, WATCH-05, VIS-01, VIS-02, VIS-03, VIS-04
**Success Criteria** (what must be TRUE):
  1. A user can choose `live-observe` mode and the trigger fires on a live page / SPA / ticker with NO page reload, observing the narrowest node (not `document.body`) so a busy ticker does not jank the page; the content script reads-and-reports raw values and the SW owns the fire decision.
  2. After in-page navigation / BF-cache restore / SPA soft-navigation the observer re-establishes itself and re-resolves the element via uniqueness scoring (against a stable container) so a watched element keeps firing; every observer is guaranteed-disconnected on fire/stop/`beforeunload`/re-injection (no leak, verified by an "every observer disconnected" test).
  3. While a trigger is active its watched element shows a gentle analyzing pulse (a Shadow-DOM glow variant, GPU-composited) that is visually distinct from the steady `run_task` glow, and the visual monitor labels itself "watching a trigger."
  4. The pulse clears on fire / stop / timeout / reap with no stuck glow (storage-backed clear deadline so a dead SW cannot strand it), does not collide with the `run_task` glow (one overlay owner per tab), and honors `prefers-reduced-motion` (animation off, static cue kept).
**Plans**: 4 plans (Wave 1: 16-01, 16-02 parallel; Wave 2: 16-03, 16-04 parallel)
- [x] 16-01-PLAN.md — trigger-observe.js: isolated-world single-element MutationObserver (clone dom-stream, rAF→trailing-setTimeout, narrowest container) + per-batch selector re-resolve + registry-authoritative idempotent restart + disconnect-all leak test + Node-mock tests [WATCH-01, WATCH-05]
- [x] 16-02-PLAN.md — analyzing pulse: ActionGlowOverlay @keyframes fsb-trigger-pulse Shadow-DOM variant (opacity/transform only, distinct from run_task glow) + reduced-motion + additive overlayState.mode='trigger-watch' label + pulse/overlay-state tests [VIS-01, VIS-02, VIS-03, VIS-04]
- [x] 16-03-PLAN.md — messaging.js router: 5 additive cases (triggerObserveStart/Stop, triggerRead, triggerPulseStart/Stop) wiring the observer + pulse APIs, one-overlay-per-tab gate [WATCH-01, VIS-01, VIS-03]
- [x] 16-04-PLAN.md — background.js SW glue: value-report onMessage ingress (writes reported_value → drives shipped Phase-15 SEAM) + idempotent watchdog alarm + SW-side full-reload re-arm + onAlarm watchdog branch + CONTENT_SCRIPT_FILES registration + test-arm path + extended SEAM test [WATCH-01, WATCH-05]
**UI hint**: yes

### Phase 17: Refresh-Poll Watch (Tab-Owning Background Reload)
**Goal**: A trigger can periodically reload its OWN tab in the background and re-read the element for static / server-rendered pages, respecting a hard alarm floor and never stealing focus or disrupting other agents.
**Depends on**: Phase 14 (SW alarm glue + reconcile), Phase 15 (evaluate), Phase 16 (shared selector re-resolution layer)
**Requirements**: WATCH-02, WATCH-03, WATCH-04
**Success Criteria** (what must be TRUE):
  1. A user can choose `refresh-poll` mode; the trigger reloads the element's tab on an alarm tick, re-reads via uniqueness-scored re-resolution, and evaluates SW-side — distinguishing value-unchanged from value-changed from element-not-found (not-found escalates to `needs_attention`, never a silent non-fire or wrong-element fire).
  2. The refresh interval is configurable with a hard 30s floor (the Chrome alarm minimum) and a ~60s default; a sub-floor request is rejected with guidance to use `live-observe`, and light jitter avoids metronomic reloads.
  3. Reloads target the trigger's OWN tab resolved via the v0.9.60 agent-scoped resolver and run in the background — never `chrome.tabs.query({active:true})`, never activating the tab; a reload of a tab owned by another agent rejects with `TAB_NOT_OWNED`, and the user's foreground tab and parallel `run_task`s are never disrupted.
  4. After a reload that lands on a challenge / CAPTCHA / login-redirect page the trigger surfaces `blocked` / `needs_attention` and does NOT fire on the challenge content, and the analyzing pulse is re-asserted after each reload so it survives the reload.
**Plans**: 4 plans (Wave 1: 17-01, 17-02 parallel; Wave 2: 17-03; Wave 3: 17-04)
- [x] 17-01-PLAN.md — Wave 0 validation harness + refresh-poll cadence normalization/scheduling [WATCH-03]
- [x] 17-02-PLAN.md — explicit triggerRead missing-element outcome before refresh-poll reads [WATCH-02]
- [x] 17-03-PLAN.md — own-tab background reload/read/evaluate alarm handling [WATCH-02, WATCH-04]
- [x] 17-04-PLAN.md — blocked-page attention states, pulse reassertion, and live-UAT tracking [WATCH-02, WATCH-04]

### Phase 18: Shared Tool Registry & Dispatcher Wiring
**Goal**: `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` are registered exactly once in the shared registry and exposed to BOTH autopilot and MCP, with the companions in the read-only bypass and the watcher in background.js so a blocking trigger can never starve the queue — the INV-01 / INV-02 verification point.
**Depends on**: Phase 15, Phase 16, Phase 17 (the watcher must work before registration is meaningful)
**Requirements**: TRIG-01, REG-01, REG-02, REG-03, REG-04, LIFE-01, LIFE-02, LIFE-03
**Success Criteria** (what must be TRUE):
  1. A caller (autopilot or MCP) can arm a trigger on one uniqueness-scored DOM element by specifying a fire condition, and the four trigger tools are defined once in `tool-definitions.js` (+ `.cjs` mirror) so autopilot and MCP see byte-identical definitions (INV-02; no autopilot-only path).
  2. `stop_trigger` tears down the observer / cancels the poll alarm and clears the pulse; `get_trigger_status` returns state, current vs initial value, condition, watch mode, elapsed/remaining, and last-check time; `list_triggers` lists all active triggers with age and owner.
  3. While a blocking `trigger()` is outstanding, a second tool call AND `stop_trigger` on that same trigger both return promptly — `stop_trigger` / `get_trigger_status` / `list_triggers` are in the MCP read-only bypass set and the long-running watcher runs in `background.js`, not the MCP handler, so the single-slot task queue is never deadlocked (a caller can always cancel a trigger it is blocked on).
  4. The existing MCP tool schemas remain byte-identical (the trigger family is purely additive, INV-01) — the existing schema-lock CI gate stays green — and the trigger tools behave identically across all 7 AI providers when driven by autopilot (INV-03).
**Plans**: 4 plans (Wave 1: 18-01, 18-02 parallel; Wave 2: 18-03; Wave 3: 18-04)
- [x] 18-01-PLAN.md — shared trigger tool registry definitions, MCP mirror, parity/provider schema tests [REG-01, REG-03, REG-04, TRIG-01]
- [x] 18-02-PLAN.md — background trigger arm/stop/status/list handlers and Wave 0 dispatcher tests [TRIG-01, LIFE-01, LIFE-02, LIFE-03, REG-02]
- [x] 18-03-PLAN.md — MCP trigger registrar, runtime/manual queue-bypass wiring, smoke tests [REG-01, REG-02, LIFE-01, LIFE-02, LIFE-03]
- [x] 18-04-PLAN.md — extension MCP route contracts, autopilot executor wiring, full integration gate [REG-01, REG-02, REG-03, REG-04]

### Phase 19: MCP Tools & Blocking/Detached Reporting
**Goal**: The MCP server exposes the trigger family end-to-end with blocking-by-default reporting (periodic heartbeats, auto-convert to detached past a safety ceiling) and detached opt-in, returning structured notify-only fire events — reusing the proven `run_task` blocking-return machinery as a parallel envelope.
**Depends on**: Phase 18 (registry + dispatcher routing in place)
**Requirements**: REPORT-01, REPORT-02, REPORT-03, REPORT-04, REPORT-05, REPORT-06, REPORT-07
**Success Criteria** (what must be TRUE):
  1. `trigger()` is blocking by default — the call holds open with ~30s heartbeats and returns on fire or timeout, mirroring the `run_task` lifecycle-return contract — and a caller can instead arm in detached mode, getting a `trigger_id` back immediately to poll via `get_trigger_status` / `list_triggers`.
  2. A blocking trigger auto-converts to detached past a configurable safety ceiling (returns the `trigger_id`, watcher keeps running) so it never holds an MCP request open indefinitely or past Chrome's 5-minute single-request ceiling; on SW eviction mid-block the call resolves with the persisted last-value/`armed` state rather than erroring.
  3. A fire returns a structured event — matched condition, old value, new value, URL, timestamp — as notify-only output (the caller/AI decides any follow-up; no auto-act), and a timeout returns a distinct `timed_out` outcome (not an error, not a fire) so the AI can choose to re-arm.
  4. Triggers fire once (edge-fire) by default and become terminal after firing; a caller can opt into re-arm-on-fire, after which the trigger keeps watching with de-dup / hysteresis so it does not re-fire on the same crossing.
  5. A detached trigger is bound to its owner with a TTL and is auto-reaped on owner disconnect (past reconnect grace), tab close, or TTL expiry so it cannot zombie a cap slot.
**Plans**: TBD

### Phase 20: Integration, Cap UI, Docs & Edge Cases
**Goal**: Compose the full trigger system end-to-end — surface the concurrency cap in the UI, resolve the cross-watch-mode edge cases that need the whole system, document the new surface, and ship the knock-on version bump.
**Depends on**: Phase 19 (end-to-end MCP path closed)
**Requirements**: (integration/composition phase — no net-new requirements; composes TRIG/WATCH/EXTRACT/REPORT/LIFE/SURV/VIS/REG delivered in Phases 14-19)
**Success Criteria** (what must be TRUE):
  1. The control panel exposes a trigger-concurrency-cap control next to the existing agent-cap control, reflecting active-trigger context and clamping to 1-64.
  2. Arming a `refresh-poll` trigger on a tab that hosts a `live-observe` trigger (or vice-versa) is rejected with a typed `TRIGGER_TAB_WATCH_CONFLICT` and steered to a separate background tab; co-located refresh-poll triggers coalesce to one reload per tab per cadence (no reload storms at scale).
  3. CHANGELOG and `mcp/README` document the trigger family — the four tools, blocking-vs-detached guidance, the refresh-poll-vs-live-observe choice, and the honest "browser must be open" / notify-only limitations.
  4. `fsb-mcp-server` is prepared at `@0.10.0` (additive minor bump for the new tool surface; `dependencies` block unchanged), with the full CI suite (`ci / all-green` incl. schema-lock) green.
**Plans**: TBD
**UI hint**: yes

## Progress (v0.11.0)

**Execution Order:**
Phases execute in numeric order: 14 → 15 → 16 → 17 → 18 → 19 → 20

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 14. Trigger Survivability Foundation | v0.11.0 | 3/3 | Complete    | 2026-06-16 |
| 15. Fire-Condition Engine & Value Extraction | v0.11.0 | 3/3 | Complete    | 2026-06-16 |
| 16. Live-Observe Watch & Analyzing Pulse | v0.11.0 | 4/4 | Complete   | 2026-06-16 |
| 17. Refresh-Poll Watch (Tab-Owning Background Reload) | v0.11.0 | 4/4 | Complete    | 2026-06-16 |
| 18. Shared Tool Registry & Dispatcher Wiring | v0.11.0 | 4/4 | Complete    | 2026-06-17 |
| 19. MCP Tools & Blocking/Detached Reporting | v0.11.0 | 1/3 | In Progress|  |
| 20. Integration, Cap UI, Docs & Edge Cases | v0.11.0 | 0/TBD | Not started | - |

## Research Flags (v0.11.0)

Phases flagged by research as likely needing deeper per-phase research (`/gsd:plan-phase --research-phase <N>`):

- **Phase 16 (live-observe):** highest-cost / highest-risk. Open questions: exact re-arm mechanism after BF-cache/SPA navigation (observer re-attach + fire redelivery to a possibly-evicted SW); stable-container + per-batch selector re-resolution detail.
- **Phase 19 (MCP blocking return):** concrete blocking safety-ceiling value + detached absolute TTL + reconnect grace (PROJECT.md "a few minutes" → exact numbers); whether the fire envelope is a flat record or borrows the Lattice Capability-Receipt shape (recommend flat for v0.11.0).
- **Phase 14 / Phase 17 (survivability + refresh-poll):** cross-browser-restart resume semantics (auto-resume refresh-poll if tab/URL re-establishable vs `needs_attention`; live-observe needs the tab present).

Phases with well-documented in-tree patterns (research-phase can be skipped): 14 (near byte-for-byte clones of `mcp-task-store.js` + `mcp-visual-session-lifecycle.js`), 15 (cap mirrors `agent-registry.js`; locale-parse recipe fully written in STACK.md), 18 (additive registration is the exact pattern every prior tool family used, guarded by schema-lock CI).

## Completed Milestone

<details>
<summary>v0.10.0 Autopilot via Lattice SDK (Phases 01-13) — SHIPPED 2026-06-15</summary>

Archive files:

- `.planning/milestones/v0.10.0-ROADMAP.md`
- `.planning/milestones/v0.10.0-REQUIREMENTS.md`
- `.planning/milestones/v0.10.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v0.10.0-phases/`

Phase summary:

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 01 | Lattice SDK gap survey + integration scaffolding | 2/2 | Complete |
| 02 | Lattice tripwire + receipt primitives extension | 5/5 | Complete |
| 03 | Observability + step-markers extension | 3/3 | Complete |
| 04 | Provider adapter alignment | 5/5 | Complete |
| 05 | MV3-survivability adapter contract + bundler infra + hybrid offscreen Lattice host | 6/6 | Complete |
| 06 | FSB engine consumes Lattice provider abstraction | 7/7 | Complete |
| 07 | Archive FSB custom provider stack | 4/4 | Complete |
| 08 | FSB agent brain on Lattice runtime | 3/3 | Complete |
| 09 | FSB SurvivabilityAdapter activated for MV3 SW eviction resumption | 3/3 | Complete |
| 10 | MCP-philosophy parity for autopilot driver | 3/3 | Complete |
| 11 | Tab-aware side panel surface | 5/5 | Complete |
| 12 | Side panel follows automation | 5/5 | Complete |
| 13 | Public Lattice package integration | 1/1 | Complete |

Known deferred closeout evidence: 11 human-gated Chrome MV3/UAT verification items were acknowledged at close. See `.planning/STATE.md` `## Deferred Items`.

</details>

## Carry-Forward Candidates

- **Delegation primitive (v0.11.0+ candidate):** Parked from v0.10.0 because Lattice's multi-agent policy did not change during the milestone. Re-scope as either a Lattice-owned primitive or an FSB-only consumer of Lattice receipt + tripwire surfaces.
- **FSB-side tripwire band adapter:** Carry forward the `FINT-MM..K` placeholder from archived requirements.
- **Sidepanel Agent State Inspector:** Carry forward the `FINT-LL..P` placeholder from archived requirements.
- **Consolidated Chrome MV3 UAT debt:** Run and capture the archived procedures for UAT-08, UAT-09, UAT-10, UAT-11, and UAT-12 if release policy requires post-close browser evidence.

## Backlog

### Phase 999.1: MCP tool gaps — click heuristics

**Status:** Completed historical backlog work retained outside milestone archival.

- `999.1-01`: Route-aware MCP bridge dispatch + `execute_js` background handler.
- `999.1-02`: Text-based click targeting with TreeWalker visible-text matching.

Artifacts remain in `.planning/phases/999.1-mcp-tool-gaps-click-heuristics/`.
