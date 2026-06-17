---
gsd_state_version: 1.0
milestone: v0.12.0
milestone_name: PhantomStream Package Migration
status: phase_complete
stopped_at: Completed Phase 22
last_updated: "2026-06-17T18:03:40.000Z"
last_activity: 2026-06-17 - Completed Phase 22 capture adapter migration
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 19
  completed_plans: 7
  percent: 37
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-17 -- v0.12.0 PhantomStream Package Migration active; invariants INV-01..06)
See: .planning/ROADMAP.md (v0.12.0 = Phases 21-25; v0.11.0 summarized under completed milestones)
See: .planning/REQUIREMENTS.md (24 v1 requirements, all mapped to Phases 21-25)
See: .planning/research/PHANTOMSTREAM-PACKAGE.md (package intake facts, npm 404, migration risks)
See: .planning/MILESTONES.md (v0.10.0 entry added; prior milestones retained)

**Core value:** Reliable single-attempt execution -- the AI decides correctly, the mechanics execute precisely. The dashboard preview must preserve that value while PhantomStream owns the generic DOM-mirroring engine.
**Current focus:** Phase 22 — migrate content-side capture through a PhantomStream-backed adapter while preserving FSB control messages, overlays, diagnostics, masking, and readiness.

## Current Position

Phase: 22 (Capture Adapter Migration) — COMPLETE
Plan: Phase 22 review and next-phase handoff
Status: Capture adapter migration complete; dom-stream is package-backed with legacy dashboard identity bridge, side channels, diagnostics, and masking/sanitization guarded
Last activity: 2026-06-17 - Completed Phase 22 capture adapter migration

Progress: [████░░░░░░] 37% (7/19 milestone plans)

## Roadmap At A Glance (v0.12.0)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 21 | Package Intake & Contract Mapping | PKG-01..04 (4) | Complete |
| 22 | Capture Adapter Migration | CAP-01..04 (4) | Complete |
| 23 | Dashboard Renderer Migration | VIEW-01..04 (4) | Pending |
| 24 | Transport, Relay & Remote Control Integration | RELAY-01..04, CTRL-01..03 (7) | Pending |
| 25 | Parity Removal, Docs & Browser UAT | PARITY-01..05 (5) | Pending |

Coverage: 24/24 v1 requirements mapped, 0 orphaned.

## Performance Metrics

**Velocity:**

- Total plans completed (this milestone): 7 (Phase 21: 3/3, Phase 22: 4/4, Phase 23: 0/4, Phase 24: 0/4, Phase 25: 0/4)
- Most recent completed milestone: v0.11.0 Trigger Tool (7 phases, 26 plans; live-browser UAT and release actions user-gated).

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 21 | 3/3 | - | - |
| 22 | 4/4 | - | - |
| 23 | 0/4 | - | - |
| 24 | 0/4 | - | - |
| 25 | 0/4 | - | - |

*Updated after each plan completion.*

## Accumulated Context

### Decisions

Full decision log lives in PROJECT.md. Carried-forward invariants binding this milestone:

- **PSTR-D-01:** v0.12.0 starts with a package intake gate because `@fullselfbrowsing/phantom-stream` returned npm `E404` on 2026-06-17 despite upstream package metadata declaring `0.1.0`.
- **PSTR-D-02:** PhantomStream becomes the source of truth for generic DOM mirroring; FSB keeps product-specific adapters for pairing, task/status traffic, overlay identity, diagnostics, and remote-control ownership.
- **PSTR-D-03:** Static and Angular dashboard viewers must share a wrapper or contract tests strong enough to prevent drift.
- **PSTR-D-04:** Browser UAT is required before close; Node parity tests cannot prove live visual fidelity or remote-control usability alone.
- **INV-01:** existing MCP tool schemas stay byte-identical; DOM-stream internals are not a schema change.
- **INV-02:** autopilot uses the SAME shared tool registry MCP exposes where tool routing is involved.
- **INV-03:** provider parity remains unchanged; stream internals are provider-agnostic.
- **INV-04:** MV3-survivability and stream recovery paths stay preserved; package migration is additive runtime adaptation.
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
- [Phase 17]: Plan 03: Refresh-poll ownership validation returns typed TAB_NOT_OWNED before any chrome.tabs.reload side effect.
- [Phase 17]: Plan 03: Refresh-poll reads use direct frame-0 chrome.tabs.sendMessage instead of sendMessageWithRetry.
- [Phase 17]: Plan 03: Background refresh-poll stages values and delegates fired/no-fire decisions to FsbTriggerLifecycle.handleTriggerAlarm.
- [Phase 17]: Plan 04: triggerRead blocks obvious login/auth/challenge/verify/CAPTCHA pages before selector resolution or readValue extraction.
- [Phase 17]: Plan 04: Refresh-poll blocked outcomes persist status blocked with attention_reason blocked and last_attention context instead of staging challenge text.
- [Phase 17]: Plan 04: Refresh-poll restarts triggerPulseStart only after lifecycle evaluation and only if the latest snapshot remains armed refresh-poll.
- [Phase 17]: Plan 04: Real inactive-tab focus retention is deferred_to_phase_20 live-browser UAT, not marked as automated proof.
- [Phase 18-shared-tool-registry-dispatcher-wiring]: Plan 18-01: trigger tools are plain background-routed registry entries, not visual-session action tools.
- [Phase 18-shared-tool-registry-dispatcher-wiring]: Plan 18-01: stop_trigger, get_trigger_status, and list_triggers are _readOnly:true so queue bypass can derive from the shared registry.
- [Phase 18-shared-tool-registry-dispatcher-wiring]: Plan 18-01: trigger.condition stays a JSON Schema object; nested condition validation remains in the trigger runtime.
- [Phase 18-shared-tool-registry-dispatcher-wiring]: Plan 18-02: trigger status/list responses project from FsbTriggerStore snapshots, not activeSessions or alarm names.
- [Phase 18-shared-tool-registry-dispatcher-wiring]: Plan 18-02: stop_trigger is idempotent for missing or terminal snapshots but rejects cross-agent access before cleanup side effects.
- [Phase 18-shared-tool-registry-dispatcher-wiring]: Plan 18-02: autopilot trigger arms derive legacy:autopilot and ownershipToken from fsbAgentRegistryInstance instead of trusting caller-supplied identity.
- [Phase 18-shared-tool-registry-dispatcher-wiring]: Plan 18-02: trigger returns a bounded arm result after validation, baseline read, persistence, and watcher startup; Phase 19 owns blocking/detached reporting.
- [Phase 18-shared-tool-registry-dispatcher-wiring]: Plan 18-03: MCP trigger tools are registered by a trigger-specific registrar from TOOL_REGISTRY rather than through manual visual-session actions.
- [Phase 18-shared-tool-registry-dispatcher-wiring]: Plan 18-03: trigger returns a bounded arm response through mcp:trigger; Phase 19 owns blocking wait, heartbeat, detached mode, and fire/timeout envelopes.
- [Phase 18-shared-tool-registry-dispatcher-wiring]: Plan 18-03: stop_trigger, get_trigger_status, and list_triggers dispatch directly and are also proven to bypass TaskQueue when a mutation is pending.
- [Phase 18-shared-tool-registry-dispatcher-wiring]: MCP trigger messages delegate to fsbTriggerDispatchToolRequest instead of owning trigger runtime work in dispatcher routes.
- [Phase 18-shared-tool-registry-dispatcher-wiring]: Autopilot trigger execution strips caller supplied identity and ownership fields and uses background derived legacy autopilot ownership.
- [Phase 18-shared-tool-registry-dispatcher-wiring]: Autopilot targetTabId is normalized to target_tab_id before background trigger dispatch.
- [Phase 19-mcp-tools-blocking-detached-reporting]: Plan 19-01: MCP trigger calls are blocking by default with 30s heartbeats, generated trigger_id correlation, detached opt-in, safety auto-detach at 240s, and bridge-disconnect partial recovery from persisted status.
- [Phase 19-mcp-tools-blocking-detached-reporting]: Plan 19-02: fire events are flat notify-only records persisted atomically with status:'fired'; blocking timeouts become terminal status:'timed_out' via runtime cleanup; safety auto-detach remains non-terminal and keeps the watcher armed.
- [Phase 19-mcp-tools-blocking-detached-reporting]: Plan 19-02: get_trigger_status/list_triggers expose terminal fired/timed_out fields after ownership filtering; default list remains armed/needs_attention/blocked, while include_terminal adds fired/timed_out/stopped.
- [Phase 19-mcp-tools-blocking-detached-reporting]: Plan 19-03: rearm_on_fire keeps snapshots armed after fire with fire_count/last_event evidence; blocking waiters settle on that first rearmed fire with still_armed:true.
- [Phase 19-mcp-tools-blocking-detached-reporting]: Plan 19-03: numeric hysteresis reset is pure manager logic for threshold and percent_change conditions, preserving edge-fire until the reset band is crossed.
- [Phase 19-mcp-tools-blocking-detached-reporting]: Plan 19-03: reconnect grace expiry calls FsbTriggerLifecycle.handleTriggerOwnerReleased(agentId) best-effort after registry release; fast reconnect cancellation suppresses trigger reap.
- [Phase 20]: Trigger Concurrency UI clones Agent Concurrency and uses fsbTriggerCap with clamp-on-input/load/save.
- [Phase 20]: Active trigger count includes armed, needs_attention, and blocked while excluding terminal trigger records.
- [Phase 20]: Cross-watch conflicts are rejected in background before read, persistence, observe startup, or pulse startup.
- [Phase 20]: Conflict scans filter snapshots through owner visibility to avoid leaking another owner's trigger metadata.
- [Phase 20]: Same-tab refresh-poll alarms now join a per-tab lock and share one explicit tab reload per due batch.
- [Phase 20]: Refresh-poll batches still validate ownership and blocked-page state before reload, then re-read each snapshot before per-trigger lifecycle evaluation.
- [Phase 20]: MCP release metadata, generated build version, server registry metadata, lockfile root metadata, and parity target now agree on 0.10.0.
- [Phase 20]: Trigger Watchers docs describe local browser-open notify-only behavior and explicitly exclude push delivery, server monitoring, and auto-act workflows.
- [Phase 20]: Phase 20 final automated release-readiness gates passed; live browser UAT remains human_needed and is recorded without fabricated proof. — 20-HUMAN-UAT.md carries Phase 16 and Phase 20 browser scenarios as human_needed, while 20-RELEASE-READINESS.md records the full automated gate set.
- [Phase 20]: Release actions for fsb-mcp-server@0.10.0 remain user-gated and were not run. — npm publish, git tag creation/push, branch push, ClawHub publish, and public package publication require explicit user instruction.

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

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260617-e2w | Fix review findings: provider bridge timeout/offscreen recovery and trigger attribute extraction | 2026-06-17 | 3052e794 | [260617-e2w-fix-review-findings-provider-bridge-time](./quick/260617-e2w-fix-review-findings-provider-bridge-time/) |
| 260617-eic | Fix trigger manager to persist live-observe watch metadata and trigger extraction fields | 2026-06-17 | 2d3b6979 | [260617-eic-fix-trigger-manager-to-persist-live-obse](./quick/260617-eic-fix-trigger-manager-to-persist-live-obse/) |
| 260617-g1w | Upgrade Lattice runtime and CLI packages to 1.4.0 | 2026-06-17 | 2be7a4db | [260617-g1w-upgrade-lattice-runtime-and-cli-packages](./quick/260617-g1w-upgrade-lattice-runtime-and-cli-packages/) |

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
| uat_gap | Phase 20 / 20-HUMAN-UAT.md | human_needed; 12 live-browser/composed trigger scenarios | v0.11.0 Phase 20 close |

Carry-forward publish/tag gates (pre-existing and current, user-gated): `npm publish fsb-mcp-server@0.9.0`; `npm publish fsb-mcp-server@0.10.0`; branch + tag pushes for v0.9.62 / v0.9.63 / v0.9.69 / v0.10.0 / v0.11.0; `clawhub publish "skills/FSB Skill"`; public package publication; 4 live-OpenClaw runtime UAT items; 12 Phase 20 live-browser/composed trigger UAT items.

## Lattice Integration State (carried, INV-06)

Runtime is `@full-self-browsing/lattice@1.4.0` via `lattice`; pin/guardrails remain `.planning/LATTICE-PIN.md`, package-lock integrity, and `tests/lattice-public-package.test.js`.

## Session Continuity

Last session: 2026-06-17T18:03:40.000Z
Stopped at: Completed Phase 22
Resume file: None

## Next Actions

Complete the Phase 22 review artifact, then continue autonomous execution with Phase 23 Dashboard Renderer Migration. Existing v0.11 live-browser UAT and release actions remain carried-forward, user-gated debt.
