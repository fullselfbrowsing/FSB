# Phase 55: CI Drift-Detection Gate - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning
**Mode:** Autonomous

<domain>
## Phase Boundary

Add permanent `verify-translation-drift.mjs`, back-test against clean churn + `6d3ad363`, wire hard-fail into CI with dynamic locale list. Orphans warning-only. Does not fix WARNING-02 (Phase 56).
</domain>

<decisions>
## Implementation Decisions
- Pattern 1 id-keyed `<source>` diff (ARCHITECTURE.md)
- Locales from `locale-constants.ts` via regex (same as audit/verify-locale-sync)
- Orphans: warning-only (54-per-locale baseline)
- npm script `verify:translation-drift`; CI step after lint:i18n
</decisions>
