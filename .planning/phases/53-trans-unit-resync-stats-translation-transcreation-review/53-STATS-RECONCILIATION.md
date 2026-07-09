# Phase 53 Stats Coverage Reconciliation (RESYNC-02)

**Date:** 2026-07-09  
**Status:** Resolved — no new stats `<target>` authorship required

## Live XLIFF verdict (authoritative)

Phase 52 audit (and re-run after Phase 53-01 resync) reports the **stats** route at:

- **Coverage:** 100% (52/52 marked ids) × all 5 locales  
- **Currency:** 100% (52/52) × all 5 locales  

Dashboard remains excluded (authenticated app surface; CI-05 / Phase 54).

## `translations.stats-274.*.json` disposition

| Finding | Resolution |
|---------|------------|
| 15/21 JSON keys already present as filled `<target>` in live `messages.<locale>.xlf` | Historical merge complete — no action |
| 6 keys `missingFromXliff` | **Obsolete dead template ids** — absent from current stats templates **and** EN `messages.xlf`. Do **not** re-add to XLIFF |
| `idDriftFromTemplate=13` | Script-scoped over the JSON’s full id set (including dead ids), **not** 13 live strings needing translation. Reconciled as a Phase-52 data point, not live debt |
| Five JSON sidecar files | **Deleted** in Phase 53 — they were not Angular build/runtime inputs (only referenced by `merge-and-assemble-274.mjs` and the audit tracer) |

### Obsolete ids (do not restore)

- `SHOWCASE_STATS_FSB_CHART_AGENTS_RUNNING`
- `SHOWCASE_STATS_FSB_CHART_AVG_AGENTS`
- `SHOWCASE_STATS_FSB_CHART_AVG_AGENTS_LEGEND`
- `SHOWCASE_STATS_FSB_SECTION_ARIA`
- `SHOWCASE_STATS_FSB_SECTION_HEADING`
- `SHOWCASE_STATS_FSB_SECTION_SUB`

## Explicitly deferred

- **54 orphaned XLIFF ids** per locale (present in locale files, absent from EN) — leave for Phase 55 drift-gate design (hard-fail vs warning).
- Removing `lint:i18n` ignore for `src/app/pages/stats/**` — Phase 54 (CI-01), now unblocked by this reconciliation.
- Migrating any remaining dual-mechanism concerns into a single pipeline — v2 / I18N-FUTURE-01.

## Conclusion

**RESYNC-02 is satisfied:** the stats page already has full live-XLIFF coverage across all 5 non-English locales. Phase 53’s job was to remove the false-completeness JSON artifacts and document the obsolete-key reconciliation so Phase 54 can flip the lint gate without ambiguity.
