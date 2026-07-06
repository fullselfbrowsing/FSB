# Phase 50: T1 Expansion Gate + Next-Batch Plan - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Close v1.1.0 with verifiable evidence for the expanded T1 execution surface. This phase does not add new handlers or recipes. It regenerates readiness evidence, runs the full regression gates, records before/after coverage, and ranks the next T1 work without claiming all 128 catalog apps are directly executable.

</domain>

<decisions>
## Implementation Decisions

### Closeout posture
- **D-01:** Treat Phase 50 as an evidence and planning gate only; runtime changes belong in the next milestone.
- **D-02:** The canonical readiness report remains `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md` and `.json`, regenerated at closeout.
- **D-03:** Phase 50 adds a small closeout snapshot so reviewers do not need to infer milestone deltas from raw JSON.

### Coverage language
- **D-04:** Say "128 app stems are catalog/search supported"; do not say "128 apps are direct API-ready."
- **D-05:** Say current direct invoke coverage is 45 executable descriptors plus 5 guarded fail-closed descriptors.
- **D-06:** Say the remaining 2,264 descriptors are still catalog tail: discovery-pending, blocked, or guarded.

### Next-batch ranking
- **D-07:** Rank by value, feasibility, and risk in that order, with fail-closed writes and bridge-dependent apps separated from straightforward same-origin reads.
- **D-08:** Prefer proven-app expansion first, then low-risk same-origin read-only app heads, then Pattern-D/GAPI architecture work, then guarded write activation.

### the agent's Discretion
- Exact wording and table layout for closeout evidence.
- Which representative slugs to include in the next-batch table, as long as rankings stay traceable to the regenerated readiness matrix.

</decisions>

<specifics>
## Specific Ideas

User intent from the session: close this milestone honestly, then begin a new milestone focused on making the remaining supported apps actually T1-ready where feasible.

</specifics>

<canonical_refs>
## Canonical References

### Milestone source
- `.planning/ROADMAP.md` - Phase 50 goal, success criteria, and milestone invariants.
- `.planning/REQUIREMENTS.md` - T1R requirements, especially closeout requirement T1R-12.

### Readiness and gates
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md` - regenerated readiness matrix and candidate list.
- `scripts/report-t1-readiness.mjs` - readiness report generator.
- `scripts/verify-t1-readiness-gate.mjs` - readiness status gate.
- `scripts/verify-t1-port-contract.mjs` - T1 handler/recipe contract gate.
- `scripts/verify-write-activation-evidence.mjs` - guarded write activation evidence gate.

### Prior phase evidence
- `.planning/phases/48-high-value-read-ports-second-batch/48-DEFERRED-APPS.md` - apps deferred by bridge, auth, sensitivity, or UAT blockers.
- `.planning/phases/49-guarded-writes-activation-pipeline/49-WRITE-ACTIVATION-STATUS.md` - active write and guarded write status.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/report-t1-readiness.mjs`: produces current counts, per-app rollups, and next-action candidate groups.
- `npm run validate:extension`: already includes the T1 readiness, port-contract, and write-activation evidence gates.
- `npm test`: full project regression suite required by Phase 50.

### Established Patterns
- Prior v1.1 phases use three small plan files, per-plan summaries, a phase summary, and a verification file.
- Readiness evidence is committed under `.planning/phases/44...`; Phase 50 can reference it and add closeout deltas without duplicating the 1.3 MB JSON.

### Integration Points
- `.planning/ROADMAP.md` progress table and Phase 50 plan checklist must be updated when the phase closes.
- No runtime file, storage key, schema, MCP surface, or version metadata changes are needed.

</code_context>

<deferred>
## Deferred Ideas

- New milestone for T1 conversion waves across the remaining catalog tail.
- Live UAT for Vercel/CircleCI/Netlify/Bitbucket expanded read heads.
- Pattern-D and GAPI bridge implementation once approved as a dedicated architecture phase.

</deferred>

---

*Phase: 50-t1-expansion-gate-next-batch-plan*
*Context gathered: 2026-06-29*
