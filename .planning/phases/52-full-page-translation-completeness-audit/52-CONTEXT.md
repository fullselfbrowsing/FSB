# Phase 52: Full-Page Translation Completeness Audit - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Every current showcase route gets an authoritative, per-locale, per-trans-unit verdict that distinguishes "coverage" (marked + target exists) from "currency" (target still matches the current English source) -- and the orphaned `translations.stats-274.*.json` artifacts are traced end-to-end into (or explicitly out of) the live XLIFF files the build consumes. This phase is diagnostic/read-only: it produces a report and a temporary audit script. It does not resync any trans-units, does not touch the stats `lint:i18n` ignore-pattern, and does not build the permanent CI drift gate -- those are Phases 53-55.

</domain>

<decisions>
## Implementation Decisions

### Audit Methodology
- Static-analysis-first: cross-reference `i18n`-marked template strings and XLIFF `<source>`/`<target>` content directly, without requiring a localized build.
- Audit scope is the full current Angular route table: lattice, phantom-stream, prometheus, home, mobile nav (audited as a shared component across pages, not a standalone route), stats, plus the original v0.9.63 routes -- not a hand-picked subset.
- Build a reusable script, `audit-translation-completeness.mjs`, per ARCHITECTURE.md's recommendation -- zero-dependency, matches the repo's existing `verify-*.mjs` convention. Not a one-off manual walkthrough.
- Output is a markdown report at `.planning/phases/52-full-page-translation-completeness-audit/52-AUDIT-REPORT.md`, with per-route/per-locale tables, following this project's existing phase-artifact convention.

### Coverage vs Currency Verdict Design
- Coverage = `i18n`-marked in template AND the matching trans-unit `id` has a non-empty `<target>` in the locale's XLIFF file.
- Currency = reuse Pattern 1 from ARCHITECTURE.md directly: id-keyed `<source>`-text diff between `messages.xlf` and each of the 5 target locale files (this is the same core comparison the later permanent CI gate will do -- run once here as part of the audit, not yet wired into CI).
- Report structure: per-page x per-locale summary counts (coverage %, currency %) at the top, then a detailed failure list underneath naming only the specific trans-unit ids that fail either check -- not a full enumeration of all ~942 x 5 rows.
- Orphaned/extra trans-unit ids (present in a target locale file but absent from current `messages.xlf`) are surfaced in this audit too, in a separate informational "orphaned" section (not pass/fail) -- Phase 55 planning needs this data, and research already flagged a 54-per-locale baseline to confirm.

### Stats-274 Orphan Tracing (AUDIT-02)
- Tracing method: diff the JSON files' key-to-translated-value pairs against the matching `stats.*`-prefixed trans-unit ids in each `messages.<locale>.xlf`, id-by-id (mapping the disjoint `SHOWCASE_STATS_FSB_*` namespace to the live `stats.*` namespace explicitly if needed) -- catches both missing and stale matches, not just presence/absence.
- If the JSON files turn out to already be fully merged into the live XLIFF: this phase documents that finding only. Actual deletion/cleanup of the JSON files is Phase 53's job, keeping Phase 52 read-only/diagnostic.
- If only partially merged: report a per-key breakdown (merged / missing / stale), not a binary merged-or-not verdict, so Phase 53 inherits zero ambiguity about scope.
- A brief one-line provenance note (e.g. which commit introduced the JSON files) is fine context to include but is not a required depth of investigation -- primary focus stays on the merge-status determination itself.

### Claude's Discretion
- Exact internal script structure/helper functions of `audit-translation-completeness.mjs`, as long as it follows the zero-dependency `verify-*.mjs` style (regex/text parse, no XML library).
- Exact markdown table formatting/column layout of `52-AUDIT-REPORT.md`, as long as it distinguishes coverage and currency as two distinct checks per the phase's success criteria.
- Whether to emit an optional JSON sidecar alongside the markdown report for Phase 53 to consume programmatically -- left to whatever is most convenient at implementation time, not a hard requirement.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `showcase/angular/scripts/verify-locale-sync.mjs` and `verify-hreflang.mjs` -- established zero-dependency script style/conventions to follow exactly (regex-based parse, `process.exit(0/1)`, no XML library dependency).
- `locale-constants.ts`/`.js` -- the single source of truth for the locale list; the audit script should derive its target-locale list from here dynamically, not hardcode it (avoids repeating the prior WARNING-01 mistake).
- ARCHITECTURE.md's Pattern 1 (`extractSourceMap` regex, `Map<trans-unit id, source text>` diff) is a ready-to-adapt reference implementation for the currency check -- see `.planning/research/ARCHITECTURE.md` lines 184-238.

### Established Patterns
- This repo's `verify-*.mjs` scripts are invoked via matching `npm run verify:*` scripts and wired as named CI steps; the new audit script does not need a matching npm script or CI step yet since it is diagnostic/temporary, not the permanent gate (that's Phase 55).
- Trans-unit blocks contain `<context-group><linenumber>` metadata that legitimately churns on unrelated template edits and must be excluded from any drift/currency comparison -- compare only `<source>` inner text, never the whole `<trans-unit>` block.

### Integration Points
- `messages.xlf` (EN source-of-truth) and `messages.{es,de,ja,zh-CN,zh-TW}.xlf` (5 target files) under `showcase/angular/src/locale/` -- the audit's primary read targets.
- `translations.stats-274.*.json` artifacts (exact path to be located during planning/research) -- must be traced against the `stats.*`-prefixed trans-units in the same locale XLIFF files.
- Angular router config -- source of truth for the full current route list the audit must cover.

</code_context>

<specifics>
## Specific Ideas

No additional specifics beyond the decisions captured above -- all three grey areas were accepted as recommended, grounded directly in `.planning/research/ARCHITECTURE.md` and `.planning/research/SUMMARY.md` (both produced specifically for this milestone).

</specifics>

<deferred>
## Deferred Ideas

- Actual resync of any drifted or missing trans-units -- Phase 53.
- Un-ignoring the stats page in `lint:i18n` -- Phase 54, gated on Phase 53's verified completion.
- Wiring a permanent `verify-translation-drift.mjs` CI gate -- Phase 55.
- Deciding hard-fail vs warning-only for orphaned trans-unit ids in CI -- explicitly deferred to Phase 55 planning per research; this phase only surfaces the data.
- Retiring or demoting the audit script to a manual `npm run audit:i18n` -- a post-milestone decision per ARCHITECTURE.md, not this phase's concern.

</deferred>
