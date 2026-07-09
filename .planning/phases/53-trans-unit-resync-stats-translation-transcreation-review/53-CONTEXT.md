# Phase 53: Trans-Unit Resync, Stats Translation & Transcreation Review - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning
**Mode:** Autonomous smart-discuss (yolo + assumptions) — recommended answers auto-accepted

<domain>
## Phase Boundary

Close every Phase-52-audit-flagged currency drift across es/de/ja/zh-CN/zh-TW, bring the stats page to a verified full-coverage state under the live XLIFF pipeline, apply a narrow transcreation-quality pass to hero/CTA marketing copy, and spot-check DE/CJK rendering on the highest-copy-density routes. This phase does **not** flip the stats `lint:i18n` ignore-pattern (Phase 54), does **not** wire the permanent drift CI gate (Phase 55), does **not** fix WARNING-02 cookie redirect (Phase 56), and does **not** migrate stats off any remaining JSON sidecar into a new pipeline architecture (v2 / I18N-FUTURE-01).

</domain>

<decisions>
## Implementation Decisions

### Resync Scope (RESYNC-01)
- Authoritative drift list is exactly the 5 currency-FAIL ids from `52-AUDIT-REPORT.md`: `agents.meta.description`, `agents.schema.software.description`, `home.meta.description`, `support.faq.q.tools.a`, `support.schema.faq.tools.a`. No additional currency failures were surfaced by the audit.
- Resync all 5 ids × 5 locales (es, de, ja, zh-CN, zh-TW) by updating `<target>` to match the current English `<source>` meaning, preserving `<x id=.../>` placeholder alignment and `DO-NOT-TRANSLATE.md` brand/term rules.
- Do **not** delete or rewrite the 54 orphaned-per-locale trans-unit ids (present in locale XLIFF, absent from current `messages.xlf`) — that judgment call is explicitly deferred to Phase 55 drift-gate design.
- Prefer editing live `messages.<locale>.xlf` targets in place (or via the existing `extract-targets-json.mjs` → translate → `assemble-xliff-target.mjs` loop) rather than inventing a new merge tool.

### Stats Coverage (RESYNC-02)
- Phase 52 already reports stats route coverage **100%** and currency **100%** across all 5 locales (52 marked ids). Treat live-XLIFF stats coverage as already complete for marked template strings.
- The 6 `translations.stats-274.*.json` keys reported as `missingFromXliff` (`SHOWCASE_STATS_FSB_CHART_AGENTS_RUNNING`, `SHOWCASE_STATS_FSB_CHART_AVG_AGENTS`, `SHOWCASE_STATS_FSB_CHART_AVG_AGENTS_LEGEND`, `SHOWCASE_STATS_FSB_SECTION_ARIA`, `SHOWCASE_STATS_FSB_SECTION_HEADING`, `SHOWCASE_STATS_FSB_SECTION_SUB`) are **dead template ids**: absent from current stats templates and from EN `messages.xlf`. Do **not** re-add them to XLIFF.
- Resolve the orphaned JSON artifacts by deleting (or clearly retiring) the five `translations.stats-274.*.json` files after documenting that their still-live keys are already merged and the 6 missing keys are obsolete — eliminates the false-completeness signal research warned about, without migrating architecture (I18N-FUTURE-01 stays deferred).
- Reconcile the audit's `idDriftFromTemplate=13` as a script-scoped data point over the JSON's full id set (including dead ids), not as 13 live strings needing translation. Document this reconciliation in the phase summary so Phase 54 inherits zero ambiguity.

### Transcreation Pass (RESYNC-03)
- Scope narrowly to ~10–20 hero headline + primary CTA strings (home hero/CTAs plus equivalent primary marketing CTAs on the densest marketing routes), not a wholesale re-translation of body/FAQ/docs copy.
- Apply a transcreation lens (natural, locale-appropriate marketing voice) while keeping `DO-NOT-TRANSLATE.md` brands verbatim and preserving placeholder/`<x id>` structure.
- AI-assisted rewrite is acceptable quality for this milestone (QA-01 native-speaker pass remains v2). Record which ids were touched so verification can spot-check them.

### Visual Spot-Check (VISUAL-01)
- Manual spot-check locales: **de** (text expansion) and **zh-CN** + **zh-TW** (CJK wrap). Skip es/ja for the visual pass unless a layout issue is accidentally noticed while editing.
- Highest-copy-density routes to check (from Phase 52 marked-id counts): **privacy** (180), **phantom-stream** (174), **about** (158), plus **home** (hero/CTA surface). Agents/support only as needed to confirm the 5 resynced meta/FAQ strings render.
- Method: load prerendered or local-dev locale routes and check for truncation, overflow, broken buttons/cards — no new visual-regression harness (I18N-FUTURE-02 stays deferred). Capture findings in a short `53-VISUAL-QA.md` (pass/fail per route×locale) rather than screenshots-as-artifacts unless a failure needs evidence.

### Claude's Discretion
- Exact translation wording for the 5 drifted units and the transcreation set, as long as meaning matches EN source, brands stay protected, and placeholders align.
- Whether to use in-place XLIFF edits vs. the extract/assemble JSON loop for mechanical updates.
- Exact list of ~10–20 hero/CTA ids within the narrow marketing surface above.
- Whether visual QA is done against `ng serve` locale builds or existing prerender output, whichever is faster and reliable in this workspace.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `52-AUDIT-REPORT.md` + `52-audit-data.json` — authoritative drift/coverage verdicts for this phase's scope.
- `showcase/angular/scripts/assemble-xliff-target.mjs`, `extract-targets-json.mjs`, `extract-translation-skeleton.mjs` — established XLIFF round-trip tooling.
- `showcase/angular/src/locale/DO-NOT-TRANSLATE.md` — brand/term rules that must hold after every rewrite.
- `showcase/angular/scripts/audit-translation-completeness.mjs` — re-run after resync to prove currency FAILs are gone (diagnostic only; still not CI-wired).

### Established Patterns
- Compare/update by trans-unit `id` and `<source>`/`<target>` inner text only — ignore `<context-group>` linenumber churn.
- Stats page already uses live `SHOWCASE_STATS_FSB_*` / `stats.*` markers in templates + XLIFF; the parallel JSON files are leftover artifacts, not the runtime source of truth.
- Dashboard remains out of scope (CI-05 / Phase 54 documents the permanent boundary).

### Integration Points
- `showcase/angular/src/locale/messages.{es,de,ja,zh-CN,zh-TW}.xlf` — primary write targets.
- `showcase/angular/src/locale/translations.stats-274.*.json` — retire after documenting merge/obsolete status.
- Home/agents/support templates supply the EN source strings for the 5 drifted ids and the hero/CTA set.
- Phase 54 depends on this phase proving stats coverage is complete before removing `lint:i18n`'s stats ignore-pattern.

</code_context>

<specifics>
## Specific Ideas

- Auto-accepted in autonomous mode from Phase 52 audit evidence + research (FEATURES/SUMMARY): narrow transcreation, delete obsolete stats-274 JSON, leave 54 orphans for Phase 55, manual DE/CJK spot-check on densest routes.
- Re-run `audit-translation-completeness.mjs` at phase end as the mechanical proof that the 5 currency FAILs are cleared and stats remains 100%/100%.

</specifics>

<deferred>
## Deferred Ideas

- Stats `lint:i18n` ignore-pattern removal — Phase 54 (CI-01).
- Dashboard exclusion documentation — Phase 54 (CI-05).
- Permanent `verify-translation-drift.mjs` CI gate + orphan hard-fail vs warning — Phase 55.
- WARNING-02 locale-cookie redirect — Phase 56.
- Native-speaker QA (QA-01), full XLIFF migration of any remaining stats mechanism (I18N-FUTURE-01), automated visual regression (I18N-FUTURE-02) — v2.

</deferred>
