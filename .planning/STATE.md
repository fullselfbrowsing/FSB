---
gsd_state_version: 1.0
milestone: v0.10.0
milestone_name: milestone
status: executing
stopped_at: Completed 17-02-PLAN.md
last_updated: "2026-06-16T18:11:00.522Z"
last_activity: 2026-06-16
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 14
  completed_plans: 14
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-15 -- v0.11.0 Trigger Tool milestone active; invariants INV-01..06)
See: .planning/ROADMAP.md (v0.11.0 = Phases 14-20; v0.10.0 archived under <details>)
See: .planning/REQUIREMENTS.md (39 v1 requirements, all mapped to Phases 14-20)
See: .planning/research/SUMMARY.md (synthesized research -- convergent 7-phase build order, MV3-survivability crux)
See: .planning/MILESTONES.md (v0.10.0 entry added; prior milestones retained)

**Core value:** Reliable single-attempt execution -- the AI decides correctly, the mechanics execute precisely. The trigger family extends this to reactive watching.
**Current focus:** Phase 17 — Refresh-Poll Watch (Tab-Owning Background Reload)

## Current Position

Phase: 17 (Refresh-Poll Watch (Tab-Owning Background Reload)) — EXECUTING
Plan: 3 of 4
Status: Ready to execute
Last activity: 2026-06-16

Progress: [████······] 38% (3/8 phases)

## Roadmap At A Glance (v0.11.0)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 14 | Trigger Survivability Foundation | SURV-01..03, LIFE-05 (4) | Complete |
| 15 | Fire-Condition Engine & Value Extraction | TRIG-02..07, EXTRACT-01..04, LIFE-04 (11) | Complete |
| 16 | Live-Observe Watch & Analyzing Pulse | WATCH-01, WATCH-05, VIS-01..04 (6) | Complete |
| 17 | Refresh-Poll Watch (Tab-Owning Background Reload) | WATCH-02..04 (3) | In Progress |
| 18 | Shared Tool Registry & Dispatcher Wiring | TRIG-01, REG-01..04, LIFE-01..03 (8) | Not started |
| 19 | MCP Tools & Blocking/Detached Reporting | REPORT-01..07 (7) | Not started |
| 20 | Integration, Cap UI, Docs & Edge Cases | composition (0 net-new) | Not started |

Coverage: 39/39 v1 requirements mapped, 0 orphaned.

## Performance Metrics

**Velocity:**

- Total plans completed (this milestone): 11 (Phase 14: 3, Phase 15: 3, Phase 16: 4, Phase 17: 1)
- Most recent shipped milestone: v0.10.0 (13 phases, 52 plans, 123 tasks; audit `acknowledged closeout debt`).

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 14 | 3 | - | - |
| 15 | 3 | - | - |
| 16 | 4 | 12min | 3min |

*Updated after each plan completion.*
| Phase 14 P01 | 5min | 2 tasks | 4 files |
| Phase 14 P02 | 7min | 2 tasks | 3 files |
| Phase 14 P03 | 5min | 1 tasks | 3 files |
| Phase 15 P01 | 7min | 2 tasks | 3 files |
| Phase 15 P02 | 9min | 3 tasks | 4 files |
| Phase 15 P3 | 9min | 3 tasks | 4 files |
| Phase 16 P01 | 3 min | 2 tasks | 3 files |
| Phase 16 P02 | 3 min | 2 tasks | 4 files |
| Phase 16 P03 | 1 min | 1 tasks | 1 files |
| Phase 16 P04 | 5 min | 2 tasks | 3 files |
| Phase 17 P01 | 8 min | 2 tasks | 4 files |
| Phase 17 P02 | 2 min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Full decision log lives in PROJECT.md. Carried-forward invariants binding this milestone:

- **INV-01:** existing MCP tool schemas stay byte-identical; trigger family is purely additive (schema-lock CI must stay green).
- **INV-02:** autopilot uses the SAME shared tool registry MCP exposes (no autopilot-only trigger stack).
- **INV-03:** trigger logic is provider-agnostic; autopilot integration works across all 7 providers.
- **INV-04:** the load-bearing `setTimeout`-chained agent-loop iterator stays byte-frozen; trigger machinery is a PARALLEL registry, never grafted onto run_task/activeSessions/agent-loop.js.
- **INV-06:** Lattice public package stays pinned and audited (`.planning/LATTICE-PIN.md` + `package-lock.json` + tests agree).
- [Phase ?]: Phase 14 Plan 01: trigger-store.js is a verbatim clone of mcp-task-store.js (6 enumerated changes only; code body byte-identical after inverse-rename). chrome.storage.session direct per D-12; agent_id stored faithfully (V4); only behavioral change is listArmedSnapshots filtering status==='armed'.
- [Phase ?]: Phase 14 Plan 02: trigger-lifecycle.js clones mcp-visual-session-lifecycle.js with overlay STRIPPED, over FsbTriggerStore (storage-is-truth, re-read every tick). handleTriggerAlarm adds a noop_terminal idempotent fire-guard (D-09); restoreTriggersFromStorage adds the getAll() orphan sweep scoped to fsbTrigger: (D-08); three reap paths via absolute deadline_at (LIFE-05). FSB_TRIGGER_DEFAULT_TTL_MS=21600000 (6h, D-11) + 30s alarm-floor declared for Phase 17. evaluated_noop + armTrigger/clearTrigger are the fire-free Phase 15 seam.
- [Phase ?]: Phase 14 Plan 03: wired the two trigger modules into background.js at four ADDITIVE glue points (importScripts store-before-lifecycle, bootstrap restoreTriggersFromStorage, onAlarm fsbTrigger: branch with early return, new tabs.onRemoved sibling), each mirroring its verified visual-lifecycle sibling. SURV-01/SURV-03/LIFE-05 now live in the SW; INV-04 held (agent-loop.js byte-untouched, setTimeout=8).
- [Phase ?]: Phase 14 Plan 03: live-Chrome MV3 SW-eviction survival (Task 2 checkpoint:human-verify) DEFERRED to milestone-end Chrome MV3 UAT per 14-VALIDATION.md Manual-Only Verifications + the v0.10.0 UAT-debt pattern; autonomous code 100% complete and committed (06a241e3), all trigger logic has deterministic Node-mock coverage.
- [Phase ?]: Phase 15 Plan 01: value-extractor.js is a pure dual-export IIFE (FsbValueExtractor, no browser-API resolver) exposing exactly parseLocaleNumber + extractValue. parseLocaleNumber uses Intl.NumberFormat formatToParts separator discovery memoized per locale; literal split/join (never a separator-built RegExp); % kept raw with isPercent (never /100); NaN -> distinct parse_error (never 0, EXTRACT-04); decimal_separator override wins over locale (D-04). extractValue selects text|number|attribute over { text, attributes? } (EXTRACT-03/D-05) -- that shape is the Phase 16/17 watch-layer report contract.
- [Phase ?]: Phase 15 Plan 02: trigger-manager.js evaluate(snapshot, reportedValue, now?) is STRUCTURALLY pure (D-02), proven by a brace-matched source-grep (no storage access / no chrome resolver in the evaluate() body even after the durable-local cap is added to the same file). Implements all 6 kinds + compound { combinator:'AND'|'OR', conditions[] } with error short-circuit (Pitfall 5) + edge-trigger/fire-once via persisted was_satisfied. Regex flag policy is default-flags-only (no /g lastIndex footgun); caps PATTERN_MAX_LEN=1000 / TEXT_MAX_LEN_ELEMENT=10000 / TEXT_MAX_LEN_PAGE=100000 are the hard CPU bound, EVIL_SHAPES heuristic is defense-in-depth. The inline cap (D-09) counts listArmedSnapshots() (storage-first, survives SW eviction) NOT a heap set, and serializes concurrent arms via a _withArmLock module-scope mutex (TOCTOU fix); Plan 03/Phase 18 inherit a serialized arm path.
- [Phase ?]: Phase 15 Plan 03: the Phase-14 evaluated_noop SEAM in trigger-lifecycle.js is replaced with FsbTriggerManager.evaluate(snap, reportedValue, now) + an atomic terminal write-back -- on outcome 'fired' it sets status:'fired'+fired_at, folds next_state, writes in one writeSnapshot, then clearAlarm (disarm); on no_fire/parse_error/pattern_error it merges next_state and stays armed. The SEAM is the SOLE owner of fire-path storage I/O (D-02); evaluate() stays pure. parse_error/pattern_error NEVER write status:'fired' (EXTRACT-04). The preserved noop_terminal guard + the atomic write together give exactly-one-fire across SW eviction (D-07). reportedValue contract { text, attributes? } sourced from snap.reported_value ?? snap.last_value until Phase 16/17 supplies a live scrape. background.js loads value-extractor.js + trigger-manager.js in load-bearing order value-extractor->store->manager->lifecycle. Phase 15 closed with full automated coverage, no live-Chrome UAT. INV-01/INV-04 held.
- [Phase ?]: Phase 16 wires live-observe end-to-end without adding public tool schemas: `content/trigger-observe.js` emits `triggerValueChanged` `{text, attributes?}` from a single stable-container MutationObserver; `messaging.js` exposes triggerObserveStart/Stop, triggerRead, triggerPulseStart/Stop; `background.js` validates and stages reports then delegates fire decisions to `FsbTriggerLifecycle.handleTriggerAlarm` (no duplicate fire writer). Re-arm is owned-tab only (`target_tab_id` + `ensureContentScriptInjected`), backed by `fsbTriggerObserveWatchdog:<id>` (1 min period, stale after 2 min). The in-memory observer registry is authoritative; stale DOM `data-fsb-trigger-armed` markers never block fresh-context re-arm (fixed in `87403c77`). Live-browser UAT is tracked in 16-HUMAN-UAT.md for Phase 20.
- [Phase 17]: Plan 01: Refresh-poll interval validation runs before snapshot persistence or lifecycle delegation so invalid sub-floor requests cannot consume cap slots or create alarms.
- [Phase 17]: Plan 01: Refresh-poll cadence uses next_poll_at while deadline_at remains the absolute TTL/reap boundary.
- [Phase 17]: Plan 02: triggerRead returns ELEMENT_NOT_FOUND before the successful readValue extraction so refresh-poll can distinguish missing selectors from legitimate empty text.
- [Phase 17]: Plan 02: the missing-module guard avoids a literal readValue token before the missing-element branch so the source-invariant test protects extraction order.

### Top Risks (from research -- bake into phase planning)

- **REG-02 / MCP queue starvation (#1 risk):** the long-running watcher MUST run in background.js, NOT in the MCP tool handler; `stop_trigger`/`get_trigger_status`/`list_triggers` MUST be in the MCP read-only bypass set -- else a blocking `trigger()` deadlocks the single-slot task queue incl. its own `stop_trigger`. (Phase 18.)
- **SW eviction kills the watch (Phase 14 crux):** state lives in `chrome.storage.session`; wake via `chrome.alarms`; no keepalive antipatterns.
- **Live-observe re-arm after BF-cache/SPA nav (Phase 16):** highest-cost/highest-risk; flagged for phase-level research.
- **Blocking transport timeout (Phase 19):** 30s heartbeats + auto-convert blocking->detached past a safety ceiling.
- **Locale numeric parse / flapping / duplicate fires (Phase 15):** parse both sides to Number, NaN -> `parse_error`; edge-trigger + fire-once + hysteresis; atomic disarm + dedupe key.

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Deferred Items

Items acknowledged and deferred at v0.10.0 milestone close on 2026-06-15 (Chrome MV3/manual UAT evidence gaps, not fabricated passes; procedures archived under `.planning/milestones/v0.10.0-phases/`):

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| uat_gap | Phase 01 / 01-HUMAN-UAT.md | partial; 1 pending scenario | v0.10.0 close |
| verification_gap | Phase 01 / 01-VERIFICATION.md | human_needed | v0.10.0 close |
| verification_gap | Phase 02 / 02-VERIFICATION.md | human_needed | v0.10.0 close |
| verification_gap | Phase 03 / 03-VERIFICATION.md | human_needed | v0.10.0 close |
| verification_gap | Phase 04 / 04-VERIFICATION.md | human_needed | v0.10.0 close |
| verification_gap | Phase 05 / 05-VERIFICATION.md | human_needed | v0.10.0 close |
| verification_gap | Phase 08 / 08-VERIFICATION.md | human_needed | v0.10.0 close |
| verification_gap | Phase 09 / 09-VERIFICATION.md | human_needed | v0.10.0 close |
| verification_gap | Phase 10 / 10-VERIFICATION.md | human_needed | v0.10.0 close |
| verification_gap | Phase 11 / 11-VERIFICATION.md | human_needed | v0.10.0 close |
| verification_gap | Phase 12 / 12-VERIFICATION.md | human_needed | v0.10.0 close |
| uat_gap | Phase 16 / 16-HUMAN-UAT.md | partial; 4 pending live-browser scenarios | v0.11.0 Phase 16 close |

Carry-forward publish/tag gates (pre-existing, user-gated): `npm publish fsb-mcp-server@0.9.0`; branch + tag pushes for v0.9.62 / v0.9.63 / v0.9.69 / v0.10.0; `clawhub publish "skills/FSB Skill"`; 4 live-OpenClaw runtime UAT items.

## Lattice Integration State (carried, INV-06)

Runtime remains `@full-self-browsing/lattice@1.3.0` via `lattice`; pin/guardrails remain `.planning/LATTICE-PIN.md`, package-lock integrity, and `tests/lattice-public-package.test.js`.

## Session Continuity

Last session: 2026-06-16T18:11:00.518Z
Stopped at: Completed 17-02-PLAN.md
Resume file: None

## Next Actions

Execute `17-02-PLAN.md`; carry Phase 16 live-browser UAT to Phase 20 integration.
