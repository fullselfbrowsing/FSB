---
gsd_state_version: 1.0
milestone: v0.11.0
milestone_name: Trigger Tool (Reactive DOM Monitoring)
status: executing
stopped_at: Phase 15 context gathered (assumptions mode)
last_updated: "2026-06-16T06:13:17.615Z"
last_activity: 2026-06-16 -- Phase 15 planning complete
progress:
  total_phases: 8
  completed_phases: 1
  total_plans: 6
  completed_plans: 5
  percent: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-15 -- v0.11.0 Trigger Tool milestone active; invariants INV-01..06)
See: .planning/ROADMAP.md (v0.11.0 = Phases 14-20; v0.10.0 archived under <details>)
See: .planning/REQUIREMENTS.md (39 v1 requirements, all mapped to Phases 14-20)
See: .planning/research/SUMMARY.md (synthesized research -- convergent 7-phase build order, MV3-survivability crux)
See: .planning/MILESTONES.md (v0.10.0 entry added; prior milestones retained)

**Core value:** Reliable single-attempt execution -- the AI decides correctly, the mechanics execute precisely. The trigger family extends this to reactive watching.
**Current focus:** Phase 999.1 — mcp tool gaps click heuristics

## Current Position

Phase: 999.1
Plan: Not started
Status: Ready to execute
Last activity: 2026-06-16 -- Phase 15 planning complete

Progress: [██████████] 100%

## Roadmap At A Glance (v0.11.0)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 14 | Trigger Survivability Foundation | SURV-01..03, LIFE-05 (4) | Not started |
| 15 | Fire-Condition Engine & Value Extraction | TRIG-02..07, EXTRACT-01..04, LIFE-04 (11) | Not started |
| 16 | Live-Observe Watch & Analyzing Pulse | WATCH-01, WATCH-05, VIS-01..04 (6) | Not started |
| 17 | Refresh-Poll Watch (Tab-Owning Background Reload) | WATCH-02..04 (3) | Not started |
| 18 | Shared Tool Registry & Dispatcher Wiring | TRIG-01, REG-01..04, LIFE-01..03 (8) | Not started |
| 19 | MCP Tools & Blocking/Detached Reporting | REPORT-01..07 (7) | Not started |
| 20 | Integration, Cap UI, Docs & Edge Cases | composition (0 net-new) | Not started |

Coverage: 39/39 v1 requirements mapped, 0 orphaned.

## Performance Metrics

**Velocity:**

- Total plans completed (this milestone): 2 (Phase 14: 14-01 trigger-store, 14-02 trigger-lifecycle)
- Most recent shipped milestone: v0.10.0 (13 phases, 52 plans, 123 tasks; audit `acknowledged closeout debt`).

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 14 | 3 | - | - |

*Updated after each plan completion.*
| Phase 14 P01 | 5min | 2 tasks | 4 files |
| Phase 14 P02 | 7min | 2 tasks | 3 files |
| Phase 14 P03 | 5min | 1 tasks | 3 files |

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

Carry-forward publish/tag gates (pre-existing, user-gated): `npm publish fsb-mcp-server@0.9.0`; branch + tag pushes for v0.9.62 / v0.9.63 / v0.9.69 / v0.10.0; `clawhub publish "skills/FSB Skill"`; 4 live-OpenClaw runtime UAT items.

## Lattice Integration State (carried, INV-06)

- Active Lattice runtime: public npm package `@full-self-browsing/lattice@1.3.0` via the bare specifier alias `lattice`; CLI `@full-self-browsing/lattice-cli@1.3.0`.
- Source audit pin: tag `v1.3.0`, source SHA `069c9aea4b5875393c96ad7e6ffeec4afbe70f34`, package integrity `sha512-w7cm8b+FFLcN9e1kRWDL0LaDZunAdMhlBFOrsIrryYV5cQifBKfjd0mlStYqwaHYhgm1TQvyw8BIac0lN4JszA==`.
- Guardrail: `tests/lattice-public-package.test.js` + package-lock/LATTICE-PIN validation prevent drift. The trigger family deliberately does NOT route snapshots through the Lattice survivability adapter (uses `chrome.storage.session` directly via a `trigger-store.js` clone of `mcp-task-store.js`).

## Session Continuity

Last session: 2026-06-16T05:26:53.771Z
Stopped at: Phase 15 context gathered (assumptions mode)
Resume file: .planning/phases/15-fire-condition-engine-value-extraction/15-CONTEXT.md

## Next Actions

1. `/gsd:plan-phase 14` -- decompose the Trigger Survivability Foundation into plans (in-tree patterns well-documented; research-phase can be skipped per SUMMARY).
2. Phases flagged for `--research-phase` during planning: 16 (live-observe re-arm), 19 (blocking ceiling / detached TTL + fire-envelope shape), 14/17 (cross-browser-restart resume semantics).
