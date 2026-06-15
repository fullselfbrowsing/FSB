# Roadmap: FSB (Full Self-Browsing)

## Milestones

- ✅ **v0.10.0 Autopilot via Lattice SDK** — Phases 01-13, 52 plans, shipped 2026-06-15.
- 📋 **Next milestone** — not yet scoped. Start with `$gsd-new-milestone`.

## Completed Milestone

<details>
<summary>✅ v0.10.0 Autopilot via Lattice SDK (Phases 01-13) — SHIPPED 2026-06-15</summary>

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
