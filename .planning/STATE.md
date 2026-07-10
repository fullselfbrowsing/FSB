---
gsd_state_version: 1.0
milestone: v0.9.91
milestone_name: MCP Clients as Providers
status: planning
last_updated: "2026-07-10T18:23:53.880Z"
last_activity: 2026-07-10
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

*Note: the `total_phases`/`completed_phases` counts above are scoped to the active v1.2.0 milestone (Phases 52-56) only. Some GSD tooling (`roadmap.analyze`, `phase.complete`) reports a noisy 14-phase/9-complete count and misidentifies "999.1" (an unrelated Backlog item) as the next phase -- both are artifacts of that tooling scanning the whole ROADMAP.md file, including the collapsed `## Completed Milestones` archive and `## Backlog` sections, rather than just the active milestone's phases. Phases 44-51 are archived v1.1.0 work; 999.1 is unrelated backlog. Treat this file's own numbers as authoritative for v1.2.0 progress.*

# Project State

## Project Reference

See: .planning/PROJECT.md (v1.2.0 Showcase i18n Completeness framing)
See: .planning/ROADMAP.md (v1.2.0 active, Phases 52-56; v1.1.0/v1.0.0/v0.9.99/etc. archived and collapsed)
See: .planning/REQUIREMENTS.md (13 v1 requirements, mapped to Phases 52-56, 0/13 complete)
See: .planning/research/SUMMARY.md (phase sequencing rationale, confirmed 5-drifted/54-orphaned baseline)
See: .planning/milestones/v1.1.0-ROADMAP.md, .planning/milestones/v1.1.0-REQUIREMENTS.md, .planning/milestones/v1.1.0-MILESTONE-AUDIT.md (archived T1 App Execution Expansion milestone)

**Core value:** Reliable single-attempt execution -- the AI decides correctly, the mechanics execute precisely. v1.2.0 does not touch the automation/T1 catalog surface; it closes a reopened i18n completeness gap on the showcase marketing site.
**Current focus:** v1.2.0 milestone complete — ready for audit/complete

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-07-10 — Milestone v0.9.91 started

## Roadmap At A Glance (v1.2.0, Phases 52-56)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 52 | Full-Page Translation Completeness Audit | AUDIT-01, AUDIT-02 | Complete (2026-07-08) |
| 53 | Trans-Unit Resync, Stats Translation & Transcreation Review | RESYNC-01, RESYNC-02, RESYNC-03, VISUAL-01 | Complete (2026-07-09; VISUAL-01 human_needed deferred) |
| 54 | Stats Lint Gate Flip & Dashboard Boundary Documentation | CI-01, CI-05 | Complete (2026-07-09) |
| 55 | CI Drift-Detection Gate | CI-02, CI-03, CI-04 | Complete (2026-07-09) |
| 56 | Locale-Cookie Redirect Fix (WARNING-02) | ROUTE-01, ROUTE-02 | Complete (2026-07-09) |

Coverage: 13/13 v1.2.0 requirements mapped, 0 orphaned. Dependency chain: 52 -> 53 -> 54 -> 55 (hard sequential dependency: each gate must land on the clean baseline the prior phase verified). Phase 56 is fully independent of 52-55 and could run in parallel if desired, but executes last in numeric order.

## Hard Invariants (v1.2.0)

- Supported locale list stays fixed at en (source) + es/de/ja/zh-CN/zh-TW -- not up for debate this milestone.
- No commercial TMS adoption (Lokalise, Crowdin, Smartling, Phrase, doloc.io) -- explicit no-paid-SaaS constraint.
- No `ng-extract-i18n-merge` adoption this milestone -- legitimate future option, not required to satisfy the CI-gate requirement.
- Dashboard page translation stays explicitly out of scope (authenticated app surface, not marketing content) -- Phase 54 documents this as permanent, not deferred.
- The new drift gate (Phase 55) must diff `<source>` text per trans-unit `id`, never whole-file/line-count, to avoid the false-positive/bypass-habit failure mode that let WARNING-02 (Phase 56) sit unaddressed for 6+ milestones.
- The drift gate must land only after Phases 52-54 verify a clean, drift-free baseline -- wiring it earlier guarantees either an immediately-red CI or a gate built loose enough to miss real drift.

## Accumulated Context

### Decisions

Full decision log for prior milestones (v0.9.99 Phase 26-34, v1.0.0, v1.1.0 T1/Wall/consent decisions) lives in PROJECT.md and the archived `.planning/milestones/v1.0.0-*` / `.planning/milestones/v1.1.0-*` files. Those decisions concern the T1 capability-catalog surface and have zero shared surface with v1.2.0's showcase-i18n work; not repeated here to keep this file a digest.

v1.2.0-specific decisions so far:

- [Roadmap]: Phase ordering follows the audit -> resync -> gate-flip -> drift-gate -> cookie-fix chain all 4 independent researchers converged on. The drift gate (Phase 55) is sequenced after Phases 52-54, not before, so it lands clean rather than immediately red.
- [Roadmap]: VISUAL-01 (DE/CJK visual spot-check) is folded into Phase 53's success criteria rather than given its own phase, since it has a hard content dependency on RESYNC-01/02 landing first (needs final translated copy to visually check) and is small enough not to warrant a standalone phase.
- [Roadmap]: The milestone brief's original "247 trans-units changed" framing is explicitly corrected in ROADMAP.md -- research confirmed only 5 of 247 touched blocks have real `<source>` drift; the true count is whatever Phase 52's audit finds, not a number fixed in advance.
- [Phase 52]: Corrected the plan's stated 6 non-shellless routes to the verified-correct 8 (sitemaps and legal also render the shared shell); derived dynamically per-route from ROUTE_TABLE.shellless rather than a hardcoded route-name list
- [Phase 52]: traceStats274's idDriftFromTemplate implemented exactly as specified (produces 13/locale); reported as explicitly unreconciled against 52-RESEARCH.md Open Questions #3's disputed 7/9/13 candidates rather than silently picking one

### Pending Todos

None yet.

### Blockers/Concerns

None yet. Two open judgment calls flagged by research to resolve during Phase 52/55 planning (not blockers, but decisions to make explicitly rather than let default-implicitly):

- Whether "orphaned" trans-unit IDs (present in a locale file but absent from current `messages.xlf`) should be hard-fail or warning-only in the Phase 55 drift gate.
- Which canonical staleness-tracking mechanism to use (source-hash sidecar vs. XLIFF `state=` attribute vs. the drift gate's own commit-to-commit diff) -- research recommends deciding this explicitly during Phase 55, not implicitly.

## Deferred Items

Items acknowledged and carried forward from previous milestone closes (Chrome MV3/manual UAT evidence gaps, not fabricated passes; procedures archived under `.planning/milestones/*/` and `.planning/phases/*/`). None of this debt blocks v1.2.0, which does not touch the automation/T1 surface.

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| uat_gap | Phase 27 / 27-HUMAN-UAT.md (live FETCH-05 logged-in-shape UAT-27-01 + contrast + origin-pin) | human_needed; 3 scenarios | v0.9.99 Phase 27 |
| uat_gap | Phase 29 / 29-HUMAN-UAT.md ([ASSUMED] internal-endpoint live capture) | human_needed | v0.9.99 Phase 29 |
| uat_gap | Phase 30 / 30-HUMAN-UAT.md (UAT-30-01 live render/Grant/badge smoke) | human_needed | v0.9.99 Phase 30 |
| uat_gap | Phase 31 / live discovery UAT | human_needed | v0.9.99 Phase 31 |
| uat_gap | Phase 32 / 32-HUMAN-UAT.md (UAT-32-01 live self-healing) | human_needed; partial | v0.9.99 Phase 32 |
| uat_gap | Phase 33 / 33-HUMAN-UAT.md (live media playback fidelity) | human_needed | v0.9.99 Phase 33 |
| uat_gap | Phase 34 / 34-HUMAN-UAT.md (live upload fidelity) | partial: UAT-34-02 pass; UAT-34-01 MCP text-file smoke pass, binary/submit checks still human_needed; UAT-34-03/04 still human_needed | v0.9.99 Phase 34 |
| uat_gap | Phases 01/16/20/25 (v0.10/v0.11/v0.12 live-browser) | human_needed/partial | prior closes |
| i18n_debt | WARNING-02 picker-cookie short-circuits bare-`/` Accept-Language redirect | closed in v1.2.0 Phase 56 (ROUTE-01/02) | v0.9.63, carried 6+ milestones |

Carry-forward publish/tag gates (pre-existing, user-gated): `npm publish fsb-mcp-server@0.9.0`; `npm publish fsb-mcp-server@0.10.0`; branch + tag pushes for v0.9.62 / v0.9.63 / v0.9.69 / v0.10.0 / v0.11.0 / v0.12.0; `clawhub publish "skills/FSB Skill"`; public package publication. None of this blocks v1.2.0.

v2 deferred (see REQUIREMENTS.md v1.2.0 v2 section): QA-01 (native-speaker/bilingual QA pass), I18N-FUTURE-01 (migrate stats page off ad hoc JSON mechanism), I18N-FUTURE-02 (automated visual regression pipeline), I18N-FUTURE-03 (translation-freshness reporting).

## Session Continuity

Last session: 2026-07-09
Stopped at: Phase 53 complete — 5 drifted units resynced, stats-274 JSON retired, 19 hero/CTA strings transcreated; VISUAL-01 browser UAT deferred as human_needed. Continuing autonomously into Phase 54.
Resume file: None

## Next Actions

v1.2.0 complete and archived. Optional: finish VISUAL-01 human UAT. Start next milestone with `/gsd-new-milestone`.
