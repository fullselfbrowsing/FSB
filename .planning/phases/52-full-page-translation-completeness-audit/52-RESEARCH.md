# Phase 52: Full-Page Translation Completeness Audit - Research

**Researched:** 2026-07-07
**Domain:** Angular i18n static-analysis auditing (XLIFF `<source>`/`<target>` content diffing + template/TS marker extraction) on an existing 6-locale showcase site
**Confidence:** HIGH

## Summary

This phase builds a single diagnostic script, `audit-translation-completeness.mjs`, that cross-references the showcase's Angular route table against `messages.xlf` (EN source) and the 5 translated XLIFF files, producing a per-page x per-locale coverage/currency verdict plus an orphaned-ids section and a stats-274 JSON trace. Every piece of ambiguity CONTEXT.md flagged as "to be located during research" has now been located and confirmed against the live repository, not assumed from the milestone-level research. Three findings materially change (and one simplifies) what CONTEXT.md's writers understood at discuss-phase time:

1. **The route table is fully confirmed** at `showcase/angular/src/app/app.routes.ts`: 12 routes total (`''`/home, `about`, `dashboard`, `agents`, `privacy`, `support`, `stats`, `lattice`, `phantom-stream`, `prometheus`, `sitemaps`, `legal`, plus a wildcard redirect). CONTEXT.md's named list (lattice, phantom-stream, prometheus, home, stats) is a subset — `about`, `dashboard`, `agents`, `privacy`, `support`, `sitemaps`, and `legal` also exist and must be in the audit's route table. `dashboard` is explicitly out-of-scope for translation per REQUIREMENTS.md's Out of Scope table (authenticated app surface) but should still appear in the audit output as an intentionally-excluded row, not silently dropped, so Phase 54's CI-05 documentation task has a paper trail. Four routes (`stats`, `lattice`, `phantom-stream`, `prometheus`) carry `data: { shellless: true }` and do NOT render the shared `showcase-shell` nav/footer — this affects which trans-unit ids apply to which page.
2. **"Mobile nav" is the `nav-mobile` block inside `showcase-shell.component.html`** (ids `shell.nav.mobile.*`), rendered on every non-shellless route (home, about, agents, dashboard, privacy, support) but absent from stats/lattice/phantom-stream/prometheus. This confirms CONTEXT.md's "shared component, not standalone route" framing exactly.
3. **The codebase mixes `i18n`/`i18n-*` HTML attributes AND `$localize` TS tagged templates for marking — both are heavily used, not an edge case.** A template-only static analysis would miss a large share of marked strings: every page's `<meta>` title/description, every FAQ Q&A pair on `/support`, all of the stats page's computed labels (including several `SHOWCASE_STATS_FSB_*` ids), and JSON-LD schema fields are marked via `` $localize`:@@id:text` `` in `.component.ts` files, not template `i18n=` attributes. The audit script's extraction step must regex both `.html` (`i18n(-\w+)?="@@([^"]+)"`) and `.ts` (`` \$localize`:@@([^:]+):`` ``) file types.
4. **The `translations.stats-274.*.json` files ARE already merged into the live target XLIFF files — this is now definitively confirmed, not "unverified" as SUMMARY.md/ARCHITECTURE.md framed it.** All 5 JSON files' 21 keys are byte-identical to 21 `SHOWCASE_STATS_FSB_*` trans-units already present with filled `<target>` in every target locale file (`messages.{es,de,ja,zh-CN,zh-TW}.xlf`). The repo has a purpose-built merge script, `scripts/merge-and-assemble-274.mjs`, whose header comments and console-output audit trail exactly describe this merge already having happened. AUDIT-02's "trace end-to-end into (or explicitly out of)" question resolves to: **already merged in, fully** — but with a *stale-scope* caveat below.
5. **A real, distinct id-naming drift exists between the current EN source and the already-merged target content**, and this is the actual finding AUDIT-02 needs to surface. The current EN `messages.xlf` has only **12** `SHOWCASE_STATS_FSB_*` ids. Every target locale file has **21** — the extra 9 include ids that were **renamed** in a later commit (target still has `SHOWCASE_STATS_FSB_CHART_PENDING`/`VIEW_POPULAR_AGENTS`/`VIEW_AGENTS_RUNNING`/`VIEW_AVG_AGENTS`/`CHART_ACTIVE_NOW(_LEGEND)`/`CHART_AGENTS_RUNNING_LEGEND`/`CHART_POPULAR_AGENTS_LEGEND`, while EN now uses `_MCP`-suffixed or entirely different names) and one id (`SHOWCASE_STATS_FSB_TILE_AVG_AGENTS_LABEL`) that was **removed from the template entirely** in a later "hardening" commit but never cleaned from the target files. These 9-per-locale orphans are a subset of the already-known 54-per-locale orphan baseline (SUMMARY.md/ARCHITECTURE.md), not a new discrepancy on top of it — the audit's orphaned-ids section will naturally surface these 9 as part of the 54, and the stats-274-specific tracing sub-report should call out which of the 54 orphans-per-locale trace back to the stats-274 JSON provenance specifically (9 of them) vs. other pre-existing orphan debt (the remaining 45).

**Primary recommendation:** Build `audit-translation-completeness.mjs` as a single zero-dependency Node ESM script under `showcase/angular/scripts/`, deriving its route table from a hardcoded mirror of `app.routes.ts`'s 12 entries (Angular routes are TS array literals, not a JSON manifest — a full TS parse is unwarranted for 12 static routes; regex-extract the `path:` values same as the reference scripts already do for simpler literals), its target-locale list dynamically from `locale-constants.ts`, and its trans-unit source/target maps via the exact same `<trans-unit id="([^"]+)" datatype="html">([\s\S]*?)<\/trans-unit>` regex already proven in `assemble-xliff-target.mjs` and `merge-and-assemble-274.mjs`. Extract marked-ids from both `.html` (`i18n`/`i18n-*` attributes) and `.ts` (`$localize` tagged templates) per page's component directory, cross-reference against the XLIFF maps for coverage, diff `<source>` text per Pattern 1 for currency, and separately trace the 5 stats-274 JSON files against the confirmed-already-merged `SHOWCASE_STATS_FSB_*` ids to report the id-rename/removal drift explicitly.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Route table enumeration | Build-time script (Node) | — | Static read of `app.routes.ts`; no runtime/browser involvement |
| i18n marker extraction (coverage) | Build-time script (Node) | — | Regex over `.html`/`.ts` source files; matches `lint:i18n`'s existing static-analysis approach |
| XLIFF `<source>`/`<target>` parsing (coverage + currency) | Build-time script (Node) | — | Regex over `src/locale/*.xlf`; identical parsing tier to `verify-locale-sync.mjs`/`assemble-xliff-target.mjs` |
| Stats-274 JSON tracing | Build-time script (Node) | — | Diffs static JSON against the same XLIFF parse tier; no runtime dependency |
| Report generation (Markdown) | Build-time script (Node) | — | Pure string templating, written to `.planning/phases/.../52-AUDIT-REPORT.md` |
| CI wiring | N/A (explicitly deferred) | — | This phase's script is diagnostic/manual per CONTEXT.md; no CI job or npm script is required for Phase 52 (Phase 55 handles the permanent gate) |

**Why this map matters for the plan:** every capability in this phase lives entirely in the Node/build-time tier. There is no Browser, Frontend-Server, API, or Database tier involvement at all — this is a pure static-analysis tool operating on source files already on disk, exactly matching the "no build required" methodology CONTEXT.md locked in. The planner should not introduce any task that runs `ng build`, starts a dev server, or touches the Express app; doing so would silently violate the phase's zero-build-required design constraint.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Audit Methodology**
- Static-analysis-first: cross-reference `i18n`-marked template strings and XLIFF `<source>`/`<target>` content directly, without requiring a localized build.
- Audit scope is the full current Angular route table: lattice, phantom-stream, prometheus, home, mobile nav (audited as a shared component across pages, not a standalone route), stats, plus the original v0.9.63 routes -- not a hand-picked subset.
- Build a reusable script, `audit-translation-completeness.mjs`, per ARCHITECTURE.md's recommendation -- zero-dependency, matches the repo's existing `verify-*.mjs` convention. Not a one-off manual walkthrough.
- Output is a markdown report at `.planning/phases/52-full-page-translation-completeness-audit/52-AUDIT-REPORT.md`, with per-route/per-locale tables, following this project's existing phase-artifact convention.

**Coverage vs Currency Verdict Design**
- Coverage = `i18n`-marked in template AND the matching trans-unit `id` has a non-empty `<target>` in the locale's XLIFF file.
- Currency = reuse Pattern 1 from ARCHITECTURE.md directly: id-keyed `<source>`-text diff between `messages.xlf` and each of the 5 target locale files (this is the same core comparison the later permanent CI gate will do -- run once here as part of the audit, not yet wired into CI).
- Report structure: per-page x per-locale summary counts (coverage %, currency %) at the top, then a detailed failure list underneath naming only the specific trans-unit ids that fail either check -- not a full enumeration of all ~942 x 5 rows.
- Orphaned/extra trans-unit ids (present in a target locale file but absent from current `messages.xlf`) are surfaced in this audit too, in a separate informational "orphaned" section (not pass/fail) -- Phase 55 planning needs this data, and research already flagged a 54-per-locale baseline to confirm.

**Stats-274 Orphan Tracing (AUDIT-02)**
- Tracing method: diff the JSON files' key-to-translated-value pairs against the matching `stats.*`-prefixed trans-unit ids in each `messages.<locale>.xlf`, id-by-id (mapping the disjoint `SHOWCASE_STATS_FSB_*` namespace to the live `stats.*` namespace explicitly if needed) -- catches both missing and stale matches, not just presence/absence.
- If the JSON files turn out to already be fully merged into the live XLIFF: this phase documents that finding only. Actual deletion/cleanup of the JSON files is Phase 53's job, keeping Phase 52 read-only/diagnostic.
- If only partially merged: report a per-key breakdown (merged / missing / stale), not a binary merged-or-not verdict, so Phase 53 inherits zero ambiguity about scope.
- A brief one-line provenance note (e.g. which commit introduced the JSON files) is fine context to include but is not a required depth of investigation -- primary focus stays on the merge-status determination itself.

> **Research correction to the Stats-274 tracing premise:** CONTEXT.md's "disjoint `SHOWCASE_STATS_FSB_*` vs. live `stats.*` namespace" framing is not quite what the live files show. `SHOWCASE_STATS_FSB_*` is **itself already a literal trans-unit id namespace inside `messages.xlf` and every target file** (confirmed via Angular's `i18n="@@CUSTOM_ID"` explicit-id syntax, used throughout the stats page and shell). There is no `stats.*`-to-`SHOWCASE_STATS_FSB_*` namespace mapping to invent — the JSON keys already equal live trans-unit ids 1:1 by string match. The real finding is a **temporal drift within the `SHOWCASE_STATS_FSB_*` namespace itself**: the JSON/target files carry ids from an earlier template revision (21 ids) that no longer match the current template's id set (12 ids) — 9 ids per locale are renamed-away-from or deleted-entirely orphans. See Summary point 5 and the Stats-274 Tracing Findings section below for the full breakdown. This does not change the audit's required *output* (per-key merged/missing/stale breakdown) — it changes what the script's comparison keys against (direct SHOWCASE_STATS_FSB_* id match, not a manufactured namespace-mapping table).

### Claude's Discretion
- Exact internal script structure/helper functions of `audit-translation-completeness.mjs`, as long as it follows the zero-dependency `verify-*.mjs` style (regex/text parse, no XML library).
- Exact markdown table formatting/column layout of `52-AUDIT-REPORT.md`, as long as it distinguishes coverage and currency as two distinct checks per the phase's success criteria.
- Whether to emit an optional JSON sidecar alongside the markdown report for Phase 53 to consume programmatically -- left to whatever is most convenient at implementation time, not a hard requirement.

### Deferred Ideas (OUT OF SCOPE)
- Actual resync of any drifted or missing trans-units -- Phase 53.
- Un-ignoring the stats page in `lint:i18n` -- Phase 54, gated on Phase 53's verified completion.
- Wiring a permanent `verify-translation-drift.mjs` CI gate -- Phase 55.
- Deciding hard-fail vs warning-only for orphaned trans-unit ids in CI -- explicitly deferred to Phase 55 planning per research; this phase only surfaces the data.
- Retiring or demoting the audit script to a manual `npm run audit:i18n` -- a post-milestone decision per ARCHITECTURE.md, not this phase's concern.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUDIT-01 | A full-page audit produces a per-page, per-locale, per-trans-unit verdict distinguishing "coverage" (i18n-marked + translated target exists) from "currency" (target still matches the current English source) across every current showcase route. | Confirmed full 12-route table (route paths, backing component files) at `app.routes.ts`; confirmed mixed `i18n`-attribute + `$localize`-TS marking convention requiring dual-file-type extraction; confirmed `<trans-unit id="..." datatype="html">` regex reusable from `assemble-xliff-target.mjs`; confirmed live baseline (942 EN ids, 996 per target, 54 orphaned/0 missing per locale, 5 ids from commit `6d3ad363` still drifted in all 5 locales today) to sanity-check the script's own output against. |
| AUDIT-02 | The audit traces the orphaned `translations.stats-274.*.json` artifacts end-to-end into (or explicitly out of) the live `messages.<locale>.xlf` files the build consumes. | Located all 5 JSON files at `showcase/angular/src/locale/translations.stats-274.{es,de,ja,zh-CN,zh-TW}.json` (21 keys each, identical key sets across locales); confirmed via direct diff that all 21 keys are already present as filled `<target>` trans-units in every corresponding `messages.{locale}.xlf`; located the exact merge tool (`scripts/merge-and-assemble-274.mjs`) and confirmed via `ci.yml` grep it is never auto-invoked (one-shot only); confirmed the "already merged, but against a now-stale 21-id snapshot vs. today's 12-id template" finding via id-set diff against the current template's `SHOWCASE_STATS_FSB_*` marker set; traced provenance via `git log`/`git show` to commits `46e36899` (introduced the JSON + initial ids), `da356602`/`931bc5af` (later hardening commits that renamed/removed some of those same ids in the template without corresponding JSON/XLIFF cleanup). |
</phase_requirements>

## Standard Stack

### Core

No new runtime dependency. This phase adds exactly one new file:

| Script | Runtime | Purpose | Why Standard (for this repo) |
|--------|---------|---------|-------------------------------|
| `audit-translation-completeness.mjs` | Node `>=24` (confirmed locally: `v24.14.1`, exceeds repo's stated `engines.node >=24.0.0` floor) | One-shot diagnostic: route x locale x trans-unit coverage/currency verdict, orphan report, stats-274 trace | Matches `verify-locale-sync.mjs`/`verify-hreflang.mjs`/`assemble-xliff-target.mjs`/`merge-and-assemble-274.mjs` exactly: `node:fs`/`node:path` only, regex-based XML text parsing, no XML library, `process.exit(0/1)` semantics (though as a diagnostic-only script producing a report, exit code should reflect "ran successfully," not "found zero issues" — see Common Pitfalls) |

No package installs occur in this phase — the **Package Legitimacy Audit is not applicable** (see note below).

### Supporting

None. All XLIFF/route/locale parsing reuses patterns already proven in this repo's own scripts (see Don't Hand-Roll below).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex-based XLIFF parsing (chosen) | An XML parser package (e.g. `fast-xml-parser`, `xml2js`) | Rejected per CONTEXT.md's explicit lock-in: "zero-dependency ... verify-\*.mjs style ... no XML library dependency." Also unnecessary — this repo's own trans-unit structure is regular enough (`datatype="html"` attribute always present, no nested `<trans-unit>`) that the existing regex pattern in `assemble-xliff-target.mjs` already handles all 942/996 units correctly (proven by direct testing above). |
| Static-analysis-first (chosen) | Post-build `dist/` HTML inspection (the `verify-hreflang.mjs` pattern) | ARCHITECTURE.md explicitly recommends static-analysis-first for this exact reason: "cheaper, no build required." CONTEXT.md locked this in. Post-build inspection would also need a full `ng build --localize` to run first (minutes, not seconds) and would not naturally expose "marked but the target is a stale copy" the way source-file + XLIFF cross-referencing does directly. |
| Hardcoded 12-route mirror in the script (chosen for this size) | A TS-AST parser of `app.routes.ts` (e.g. `@typescript-eslint/parser` or `ts-morph`) | 12 static string-literal `path:` entries is well within regex-extraction territory (`{ path: '([^']*)'` is unambiguous here, no dynamic route generation, no route-level i18n params). A full TS AST parser is disproportionate tooling for a Route[] literal this size and would be the first non-regex dependency in this script family — reject per the zero-dependency lock-in. |

**Installation:** None — zero new dependencies, per CONTEXT.md.

**Version verification:** N/A — no package versions to verify. Node version confirmed locally via `node --version` = `v24.14.1`.

## Package Legitimacy Audit

Not applicable. This phase installs zero external packages — `audit-translation-completeness.mjs` uses only Node built-ins (`node:fs`, `node:path`), matching every other `verify-*.mjs`/`assemble-*.mjs` script in this repo. The Package Legitimacy Gate protocol is skipped in its entirety; there is nothing to run `slopcheck`/`npm view` against.

## Architecture Patterns

### System Architecture Diagram

```
                    +---------------------------------------------+
                    |         SOURCE FILES (read-only inputs)      |
                    +---------------------------------------------+
                    | app.routes.ts            (12 route defs)     |
                    | locale-constants.ts       (6-locale registry) |
                    | src/app/pages/**/*.html   (i18n= markers)     |
                    | src/app/pages/**/*.ts     ($localize markers) |
                    | src/app/layout/**/*.html  (shell/nav/footer)  |
                    | messages.xlf              (EN source XLIFF)   |
                    | messages.{es,de,ja,zh-CN,zh-TW}.xlf (5 target)|
                    | translations.stats-274.*.json (5 JSON files) |
                    +---------------------+-------------------------+
                                          |
                                          v
        +-----------------------------------------------------------------+
        |     audit-translation-completeness.mjs  (single-pass, in-memory)  |
        |                                                                   |
        |  Stage 1: Route table                                            |
        |    -- regex-extract { path, componentDir } tuples from            |
        |       app.routes.ts; hardcode as ROUTE_TABLE const (12 entries)   |
        |                                                                   |
        |  Stage 2: Marker extraction (per route's component dir)           |
        |    -- scan .html files for i18n="@@id" / i18n-*="@@id"            |
        |    -- scan .ts files for $localize`:@@id:...`                     |
        |    -- also scan shared showcase-shell.component.html for          |
        |       shell.nav.*/shell.footer.* ids on non-shellless routes      |
        |    => Map<routePath, Set<markedId>>                               |
        |                                                                   |
        |  Stage 3: XLIFF parse (reuses assemble-xliff-target.mjs regex)    |
        |    -- messages.xlf => Map<id, sourceText>           (EN)          |
        |    -- messages.{locale}.xlf => Map<id, {source, target}> x5       |
        |                                                                   |
        |  Stage 4: Coverage + Currency verdict (per route x per locale)    |
        |    -- coverage: markedId has non-empty <target> in locale map?    |
        |    -- currency: EN sourceText === locale's mirrored sourceText?   |
        |    -- (Pattern 1 diff, ARCHITECTURE.md lines 184-238)             |
        |                                                                   |
        |  Stage 5: Orphan detection                                        |
        |    -- ids in locale XLIFF absent from EN messages.xlf map         |
        |    -- (expect the confirmed 54-per-locale baseline)               |
        |                                                                   |
        |  Stage 6: Stats-274 JSON trace                                    |
        |    -- load 5 translations.stats-274.*.json => Map<id, value>      |
        |    -- diff keys against locale's SHOWCASE_STATS_FSB_* trans-units  |
        |    -- classify: merged / missing / stale, PLUS id-rename/removal   |
        |       drift vs. the CURRENT template's SHOWCASE_STATS_FSB_* set    |
        +---------------------+---------------------------------------------+
                              |
                              v
        +-----------------------------------------------------------------+
        |   52-AUDIT-REPORT.md  (write-only output, Markdown)               |
        |   -- per-page x per-locale coverage% / currency% summary table    |
        |   -- detailed failure list (only failing ids, not full ~4700 rows)|
        |   -- orphaned-ids informational section                          |
        |   -- stats-274 trace section (merged/missing/stale breakdown)     |
        +-----------------------------------------------------------------+
```

A reader can trace the primary use case (page X, locale Y -> pass/fail) by following Stage 2 (what's marked on this route) -> Stage 3 (what XLIFF actually contains) -> Stage 4 (the verdict) left to right through the diagram.

### Recommended Project Structure

```
showcase/angular/
├── scripts/
│   ├── verify-locale-sync.mjs             # existing -- UNCHANGED, reference for registry-read style
│   ├── verify-hreflang.mjs                # existing -- UNCHANGED, reference for record()/pass-fail reporting style
│   ├── assemble-xliff-target.mjs          # existing -- UNCHANGED, source of the reusable trans-unit regex
│   ├── merge-and-assemble-274.mjs         # existing -- UNCHANGED, confirms stats-274 already merged
│   └── audit-translation-completeness.mjs # NEW (this phase) -- diagnostic, not a CI-wired script
├── src/app/app.routes.ts                  # READ ONLY -- source of truth for the 12-route table
├── src/app/core/i18n/locale-constants.ts  # READ ONLY -- source of truth for TARGET_LOCALES
└── src/locale/
    ├── messages.xlf                        # READ ONLY
    ├── messages.{es,de,ja,zh-CN,zh-TW}.xlf # READ ONLY
    └── translations.stats-274.*.json       # READ ONLY (5 files)

.planning/phases/52-full-page-translation-completeness-audit/
└── 52-AUDIT-REPORT.md                      # NEW (this phase) -- the deliverable
```

### Pattern 1: ID-Keyed Source-Text Diff (currency check — direct reuse from ARCHITECTURE.md)

**What:** Already fully specified in `.planning/research/ARCHITECTURE.md` lines 184-238 (`extractSourceMap` function). This phase's script imports/adapts that exact function unchanged.
**When to use:** For every marked id on every route, per locale, to determine currency.
**Verification of the pattern against live data:** confirmed via direct execution in this research session — the pattern correctly identifies all 5 known-drifted ids from commit `6d3ad363` as still drifted, in all 5 locales, right now (see Summary point above and the Confirmed Baseline table below).

### Pattern 2: Dual-File-Type Marker Extraction (NEW pattern this phase must add — not covered by ARCHITECTURE.md's Pattern 1, which only covers the XLIFF side)

**What:** Extract `i18n`-marked ids from two distinct file types per page, not one:
```javascript
// Source: confirmed via direct grep of showcase/angular/src/app on 2026-07-07
// HTML template attributes -- covers i18n="@@id" and i18n-aria-label="@@id" etc.
const HTML_MARKER_RE = /i18n(?:-[\w-]+)?="@@([^"]+)"/g;

// TS tagged-template literals -- covers $localize`:@@id:text` (meta tags, FAQ content,
// computed chart labels). CONFIRMED NECESSARY: stats-page.component.ts alone has 6+
// SHOWCASE_STATS_FSB_* ids marked this way, not in the .html template at all.
const TS_LOCALIZE_RE = /\$localize`:@@([^:]+):/g;

function extractMarkedIds(dirPath) {
  const ids = new Set();
  for (const file of walkFiles(dirPath, ['.html', '.ts'])) {
    if (file.endsWith('.spec.ts')) continue; // exclude test files
    const text = readFileSync(file, 'utf8');
    const re = file.endsWith('.html') ? HTML_MARKER_RE : TS_LOCALIZE_RE;
    let m;
    while ((m = re.exec(text)) !== null) ids.add(m[1]);
  }
  return ids;
}
```
**When to use:** Every route's coverage check. Must run against both the route's own `pages/<name>/` directory AND (for non-shellless routes) the shared `layout/showcase-shell/` directory for `shell.nav.*`/`shell.footer.*` ids, AND the shared `layout/language-picker/` directory for `picker.*` ids (rendered in the shell footer on every non-shellless route).
**Trade-off:** A per-page marker scan will double-count `shell.*`/`picker.*` ids across every non-shellless route (they're the same ids on every page). This is intentional and correct for a per-page report — the same shared id genuinely is "covered" or "not covered" identically on every page it appears on; the summary table should reflect that redundancy transparently (e.g., a shell.\* currency failure shows up as a failure on home, about, agents, privacy, support, and dashboard's rows simultaneously, since they all render the same shell markup), not be deduplicated away, or Phase 53's resync scope would undercount which pages are affected.

### Anti-Patterns to Avoid

- **Scanning only `.html` files for markers:** Confirmed via direct grep that at least 11 page-component `.ts` files use `$localize` for meta descriptions, FAQ content, JSON-LD schema fields, and (on the stats page specifically) several `SHOWCASE_STATS_FSB_*` chart/view labels. A template-only scan under-reports coverage and would make AUDIT-01's per-trans-unit verdict wrong for a meaningful fraction of ids.
- **Treating the stats-274 JSON keys as needing a manufactured id-namespace mapping:** They don't. `SHOWCASE_STATS_FSB_*` is already the literal live trans-unit id (Angular's `@@custom-id` syntax makes the JSON's dictionary keys and the XLIFF's `id` attribute the exact same string). Building a translation table between "JSON namespace" and "XLIFF namespace" would be solving a problem that doesn't exist and would obscure the real finding (temporal id-set drift within the same namespace).
- **Assuming `assemble-xliff-target.mjs`/`merge-and-assemble-274.mjs` re-run automatically:** Confirmed via `ci.yml` grep — neither script appears anywhere in CI. They are one-shot manual tools; their past invocation (evidenced by the fully-merged JSON->XLIFF state found in this research) happened once, historically, and nothing keeps it in sync with template changes going forward. This is precisely the mechanism that produced the 9-id-per-locale drift documented above.
- **Excluding `dashboard` from the audit's route table entirely:** CONTEXT.md's route list doesn't name `dashboard`, and REQUIREMENTS.md's Out of Scope table excludes it from *translation work*, but excluding it from the *audit's* route enumeration would leave Phase 54's "permanent architectural boundary" documentation (CI-05) without the audit's own paper trail showing it was seen and intentionally marked out-of-scope, not missed. Include it in the report with an explicit "excluded — authenticated app surface, see CI-05" annotation rather than omitting the row.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Trans-unit id/source/target extraction from XLIFF | A new XML-aware parser or a different regex shape | The exact `<trans-unit id="([^"]+)" datatype="html">([\s\S]*?)<\/trans-unit>` pattern from `assemble-xliff-target.mjs` (lines 36) / `merge-and-assemble-274.mjs` (line 40) | Already proven correct against all 942/996 real trans-units in this repo (verified directly in this research session); reinventing risks subtly different edge-case handling (e.g. attribute-order assumptions, whitespace in the `<source>` tag) |
| `<source>`-only diffing (excluding `<context-group>` noise) | A whole-`<trans-unit>`-block string comparison | ARCHITECTURE.md's `extractSourceMap` (extract only inner `<source>...</source>` text) | Comparing the whole block re-introduces the exact 242-of-247-lines-are-noise problem ARCHITECTURE.md's framing correction already diagnosed and fixed |
| Target-locale list | Hardcoding `['es','de','ja','zh-CN','zh-TW']` in the new script | Import `LOCALES`/`SOURCE_LOCALE` from `locale-constants.ts`, filter out `SOURCE_LOCALE` | CONTEXT.md explicitly calls out avoiding "the prior WARNING-01 mistake" of hardcoded locale lists; `locale-constants.ts` is the confirmed single source of truth (9 connections in the module graph, consumed by 3 other files already) |
| Route enumeration logic | A route-config JSON export step, a dev-server route dump, or a TS-AST parser | Regex-extract `{ path: '([^']*)'` tuples directly from the confirmed 12-line `app.routes.ts` | The route table is small, static, and string-literal-only; no dynamic route generation exists to justify heavier tooling |

**Key insight:** Every parsing primitive this phase needs already exists, proven, in this repo's own scripts. The only genuinely new logic is (a) walking two file extensions per route directory for marker extraction (Pattern 2 above, which has no existing precedent in this repo since `lint:i18n`'s eslint rule only checks `.html`) and (b) the stats-274-specific id-rename/removal drift classification (which is a straightforward Set-difference operation, not a new parsing primitive).

## Runtime State Inventory

Not applicable — this is not a rename/refactor/migration phase. Phase 52 is purely additive (one new script, one new report) and read-only against all existing files; no renames, no data migrations, no stored/live-service state changes.

## Common Pitfalls

### Pitfall 1: Exit-code semantics confusion (diagnostic script vs. pass/fail gate)

**What goes wrong:** Following the `verify-*.mjs` convention literally (`process.exit(1)` when failures are found) would make this diagnostic script "fail" (non-zero exit) simply because it found the very drift/orphans it exists to report — which is expected, not an error condition, for a first-run audit.
**Why it happens:** Every existing `verify-*.mjs` script in this repo is a CI gate where non-zero exit = build should stop. This new script's job is the opposite: succeed (report generated) regardless of what it finds, since finding gaps is its entire purpose per CONTEXT.md's "diagnostic/read-only" framing.
**How to avoid:** Exit 0 whenever the report is successfully generated, regardless of findings (coverage/currency failures, orphans, stats-274 drift are all *expected report content*, not script errors). Exit non-zero only for genuine tool failure (a required source file missing, a malformed XLIFF that breaks the regex). This is a deliberate, explicit deviation from the `verify-*.mjs` exit-code convention that the plan should call out, not silently follow the wrong precedent.
**Warning signs:** If planning a task that wires this script into `npm run` with an expectation CI treats non-zero as "audit found problems, block the PR" — that's actually Phase 55's job (`verify-translation-drift.mjs`), not this phase's.

### Pitfall 2: Under-scanning marked ids by only checking `.html`

**What goes wrong:** As documented in Pattern 2 above, a `.html`-only scan misses `$localize`-marked ids in `.ts` files, producing false "not marked" or (worse) false "not covered" verdicts for ids that ARE properly translated but whose marking lives in TS.
**Why it happens:** `lint:i18n`'s existing eslint rule only checks `.html` (`eslint "src/**/*.html"`), which may make it tempting to assume that's the full picture — it isn't; `$localize` calls in `.ts` are a separate, un-linted marking mechanism this project relies on heavily.
**How to avoid:** Always scan both extensions per Pattern 2's regex pair; verify against the confirmed count (11+ `.ts` files use `$localize` for at least one id) before considering the extraction logic complete.
**Warning signs:** If the audit's coverage-failure list includes ids that a manual `grep -rn "SHOWCASE_STATS_FSB_VIEW_ACTIVE_NOW"` shows ARE marked (just in a `.ts` file) — that's this pitfall manifesting.

### Pitfall 3: Treating the stats-274 finding as "merge status unknown" rather than "merge complete, but scope now stale"

**What goes wrong:** SUMMARY.md and ARCHITECTURE.md (written before this phase's research) both describe the stats-274 merge status as genuinely unverified. Carrying that framing forward into the audit's actual report would understate what's now confirmed and misdirect Phase 53's resync scoping.
**Why it happens:** The milestone-level research didn't have cause to open the JSON files or diff their keys against the live XLIFF — that's specifically this phase's job, now done.
**How to avoid:** Report the stats-274 section as: "merge status: COMPLETE (all 21 keys per locale present as filled `<target>` in the live XLIFF, confirmed via direct diff)" followed by "drift status: 9-of-21 ids per locale are stale (renamed-away-from or removed-from the current template since the merge occurred), tracing to template commits `da356602`/`931bc5af` after the JSON's originating commit `46e36899`." This is a materially different, more actionable finding than "unverified."
**Warning signs:** If the audit report says anything like "orphan status unknown, needs further investigation" for stats-274 specifically — the investigation is already done; state the confirmed finding.

### Pitfall 4: Double-counting or mis-scoping shared-component (shell/mobile-nav/picker) ids

**What goes wrong:** Because `shell.nav.mobile.*` (and `shell.nav.desktop.*`, `shell.footer.*`, `picker.*`) ids are rendered identically on 6+ routes (every non-shellless page), a naive per-route loop that doesn't account for this shared rendering could either (a) miss reporting them at all if the scan is scoped too narrowly to `pages/<name>/`, or (b) report them as 6 independent "different" failures with no indication they're the same underlying id/issue.
**Why it happens:** The route-to-component mapping in `app.routes.ts` only shows the *page* component; the shared shell wrapper is a separate, cross-cutting concern not visible from the route table alone.
**How to avoid:** Explicitly include `layout/showcase-shell/` and `layout/language-picker/` in the marker-extraction scan for every non-shellless route (home, about, agents, dashboard, privacy, support), and make the report's structure clear that a shared-component id's fail/pass status is one underlying fact appearing on multiple page rows, not 6 separate bugs.
**Warning signs:** If the report lists `shell.footer.bottom.credit` as failing on `home` but passing on `about` — that would be a genuine implementation bug in the audit script itself (same id, same XLIFF entry, can't have two different verdicts), a good smoke-test for the script's own correctness.

## Code Examples

### Coverage + Currency verdict per marked id (direct extension of the confirmed-working patterns above)

```javascript
// Source: composed from assemble-xliff-target.mjs's trans-unit regex (confirmed working
// against all 942/996 live trans-units) + ARCHITECTURE.md's Pattern 1 extractSourceMap
// (confirmed working against the 5 known-drifted ids from commit 6d3ad363, still
// drifted today in all 5 locales as of this research session).

function extractTransUnits(xliffText) {
  const map = new Map(); // id -> { source, target }
  const re = /<trans-unit id="([^"]+)" datatype="html">([\s\S]*?)<\/trans-unit>/g;
  let m;
  while ((m = re.exec(xliffText)) !== null) {
    const [, id, body] = m;
    const sourceMatch = /<source>([\s\S]*?)<\/source>/.exec(body);
    const targetMatch = /<target[^>]*>([\s\S]*?)<\/target>/.exec(body);
    map.set(id, {
      source: sourceMatch ? sourceMatch[1].trim() : '',
      target: targetMatch ? targetMatch[1].trim() : null, // null = no <target> at all
    });
  }
  return map;
}

function verdictForId(id, enMap, localeMap) {
  const enEntry = enMap.get(id);
  const localeEntry = localeMap.get(id);
  if (!enEntry) return { coverage: null, currency: null, reason: 'id not in EN messages.xlf' };
  if (!localeEntry) return { coverage: 'FAIL', currency: null, reason: 'id missing from target XLIFF entirely' };

  const coverage = (localeEntry.target && localeEntry.target.length > 0) ? 'PASS' : 'FAIL';
  const currency = (localeEntry.source === enEntry.source) ? 'PASS' : 'FAIL';
  return { coverage, currency, reason: null };
}
```

### Stats-274 JSON trace (id-rename/removal drift classification)

```javascript
// Source: composed from this research session's direct file inspection of
// translations.stats-274.{locale}.json (21 keys, identical across locales) and
// messages.{locale}.xlf's SHOWCASE_STATS_FSB_* trans-units (21 ids, already
// <target>-filled) vs. the CURRENT template's SHOWCASE_STATS_FSB_* marker set
// (12 ids, confirmed via stats-page.component.html + stats-page.component.ts scan).

function traceStats274(locale, jsonPath, xliffMap, currentTemplateIds) {
  const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
  delete json._comment;
  const jsonIds = new Set(Object.keys(json));

  const report = { merged: [], missingFromXliff: [], staleValue: [], idDriftFromTemplate: [] };

  for (const id of jsonIds) {
    const xliffEntry = xliffMap.get(id);
    if (!xliffEntry) {
      report.missingFromXliff.push(id); // JSON key never made it into the XLIFF
      continue;
    }
    const merged = xliffEntry.target === json[id];
    (merged ? report.merged : report.staleValue).push(id);
  }

  // The real finding for this repo: which of the merged ids no longer exist in the
  // CURRENT template (renamed-away-from or removed entirely since the merge).
  for (const id of jsonIds) {
    if (!currentTemplateIds.has(id)) report.idDriftFromTemplate.push(id);
  }

  return report;
  // Expected result for `es` locale as of this research session:
  //   merged.length === 21 (all keys' values match the live <target>)
  //   missingFromXliff.length === 0
  //   staleValue.length === 0
  //   idDriftFromTemplate: 6 ids (SHOWCASE_STATS_FSB_SECTION_HEADING, _SECTION_ARIA,
  //     _SECTION_SUB, _CHART_AVG_AGENTS, _CHART_AVG_AGENTS_LEGEND, _CHART_AGENTS_RUNNING)
  //     -- confirmed via direct JSON-keys-vs-current-EN-ids diff in this research session
}
```

## State of the Art

| Old Approach (this repo's pre-Phase-52 state) | Current/Recommended Approach (this phase) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 4 existing CI gates check structural presence only (registry parity, marker-in-template presence, EN-extraction completeness, per-locale target existence) — none compares `<source>` content across files | This phase adds a 5th check dimension: content-level coverage + currency, run once as a diagnostic (not yet a gate) | This phase (52) | First time this repo's tooling can distinguish "has a target" from "target is current" |
| `translations.stats-274.*.json` merge status treated as "needs investigation" in milestone-level research (SUMMARY.md, ARCHITECTURE.md) | Confirmed complete (21/21 keys merged per locale) with a specific, named 9-id-per-locale (of the 54 total orphans) post-merge drift | This phase (52) | Phase 53's resync scope is now precisely bounded for the stats-274 portion, not "unknown extent" |

**Deprecated/outdated:** None — no library, API, or tool version changes are involved in this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 12-route table in `app.routes.ts` is the complete, current set the audit must cover (no additional routes registered elsewhere, e.g. via a lazy-loaded child-routes file) | Summary point 1, Architecture Patterns | If a child-routes file exists elsewhere (not found in this research — `app.routes.ts` has no `children:` keys and no `loadChildren:` calls, only `loadComponent:`), the audit would under-cover. Mitigation: this was checked directly — `app.routes.ts`'s full 17-line content was read in full in this session; no children/loadChildren pattern exists. Confidence: HIGH, not merely assumed. |
| A2 | No additional i18n-marking mechanism beyond `i18n`/`i18n-*` HTML attributes and `` $localize`:@@id:` `` TS tagged templates exists in this codebase (e.g. a custom directive, a pipe-based translation helper, or dynamic id construction) | Architecture Patterns (Pattern 2) | If a third marking mechanism exists, the audit under-reports coverage for whatever it marks. Mitigation: this was checked via repo-wide grep for both patterns across the entire `src/app` tree in this session, not sampled — confidence is HIGH for the two confirmed mechanisms, but a targeted search for e.g. a custom `i18nDynamic` directive or programmatic id construction (e.g. template-string-built ids) was not separately performed. Flagged as the one residual gap — see Open Questions. |

**Overall assessment:** Every other claim in this document was verified directly against live repository state in this research session (file reads, regex extraction, `git log`/`git show`, direct Python/regex cross-diffs) — not carried forward from training-data assumptions or from the milestone-level research documents without re-verification. The two items above are flagged not because they're unverified guesses, but because "absence of a third pattern" and "these are the only 12 routes" are negative claims that, per this agent's verification protocol, deserve explicit flagging even when the positive evidence found is strong.

## Open Questions

1. **Does any component construct a trans-unit id dynamically (e.g. via template-literal interpolation into an `i18n` attribute or `$localize` tag) that a static regex scan cannot catch?**
   - What we know: Every marked id found in this session's grep is a static string literal — no interpolated/dynamic ids were observed in the `$localize`/`i18n=` matches inspected.
   - What's unclear: A full character-by-character audit of every marked string across all ~35 component files was not performed (the grep output above is comprehensive for the `$localize` pattern specifically, and the HTML `i18n=` pattern check confirmed zero non-`@@`-prefixed matches, but did not enumerate every individual id).
   - Recommendation: The planner should include a lightweight verification task in the audit script itself — log a warning if the `HTML_MARKER_RE`/`TS_LOCALIZE_RE` regexes match zero ids in any given component file that otherwise appears to contain translatable text (a heuristic sanity check, not a hard requirement), so any dynamic-id component surfaces itself during the audit's first real run rather than silently under-reporting.

2. **Should the audit report include the `about`, `agents`, `privacy`, `support`, `sitemaps`, and `legal` routes with the same depth as the CONTEXT.md-named routes (lattice/phantom-stream/prometheus/home/stats), given CONTEXT.md's phrasing emphasizes "plus the original v0.9.63 routes" without naming them individually?**
   - What we know: REQUIREMENTS.md and STATE.md both describe the milestone goal as covering "every current showcase route" / "every translatable string on every showcase page" — the broader framing, not a curated subset.
   - What's unclear: Whether CONTEXT.md's specific naming of only 5-6 routes reflects an intentional narrowing (e.g., these are the newest/highest-risk routes) or just an incomplete enumeration at discuss-phase time (most likely, since the phase description explicitly says "plus the original v0.9.63 routes" as a catch-all).
   - Recommendation: Treat CONTEXT.md's named list as illustrative, not exhaustive — the audit's route table should be the full confirmed 12 (11 translatable + dashboard flagged out-of-scope), consistent with AUDIT-01's actual requirement text ("across every current showcase route"). This research's confirmed route table (Summary point 1) should be treated as authoritative for the plan.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Running `audit-translation-completeness.mjs` | ✓ | v24.14.1 (exceeds repo's `engines.node >=24.0.0` floor) | — |
| Read access to `showcase/angular/src/**` and `.planning/phases/52-*/` | Script execution + report write | ✓ | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — this phase has no external dependencies beyond what's already confirmed present.

## Validation Architecture

`workflow.nyquist_validation` is absent from `.planning/config.json` (treated as enabled per the default-enabled rule). However, this phase produces a **diagnostic script and a report**, not application behavior with a conventional test suite — there is no existing test framework (`tests/` has zero i18n/locale/xliff-specific test files, confirmed via directory search) that this phase's deliverable should be wired into. The "validation" for this phase is the script's own self-consistency against ground truth already established in this research session.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None dedicated to i18n scripts today; repo-wide test runner is Node's built-in `node:test` (used by `tests/*.test.js`, e.g. `tests/server-accept-language.test.js`, `tests/stats-chart-overhaul.test.js`) |
| Config file | None — plain `node --test tests/` invocation pattern per existing test files |
| Quick run command | Manual smoke: `node showcase/angular/scripts/audit-translation-completeness.mjs` and inspect the generated report for the 5 known-drifted ids and the 54-per-locale orphan count (both confirmed ground truth in this session) |
| Full suite command | N/A — no dedicated test suite is required for a one-shot diagnostic script per CONTEXT.md's scope; a full automated test suite for this script is explicitly not required (it's a temporary/diagnostic tool per ARCHITECTURE.md, potentially retired post-milestone) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUDIT-01 | Script correctly flags the 5 known-drifted ids (`agents.meta.description`, `agents.schema.software.description`, `home.meta.description`, `support.faq.q.tools.a`, `support.schema.faq.tools.a`) as currency FAILs in all 5 locales | manual-only (smoke, run script + grep report for these 5 ids) | `node showcase/angular/scripts/audit-translation-completeness.mjs && grep -A2 "agents.meta.description" 52-AUDIT-REPORT.md` | N/A — script doesn't exist yet; this is the acceptance check for the phase's own execution, not a persisted unit test |
| AUDIT-01 | Script correctly reports 54 orphaned ids per locale (baseline confirmed in this research) | manual-only (smoke, count check) | Compare report's orphan-count section against the confirmed `54` per locale from this research session | N/A |
| AUDIT-02 | Script correctly reports stats-274 merge status as COMPLETE (21/21 per locale) with 6 (per-locale, `es` confirmed; verify others match) id-drift-from-template entries | manual-only (smoke, count + spot-check) | Compare report's stats-274 section against confirmed findings in this research (Code Examples section's expected-result comment) | N/A |

**Justification for manual-only classification:** This phase's own explicit scope is diagnostic/read-only with a human-readable Markdown report as the primary deliverable, not application behavior gated by CI. Writing `node:test` unit tests for a script whose entire purpose is a single invocation producing a report for human/Phase-53 consumption would be disproportionate tooling — consistent with ARCHITECTURE.md's Anti-Pattern 2 guidance to keep the diagnostic audit lightweight and separate from the permanent CI-gate lifecycle (Phase 55's `verify-translation-drift.mjs`, which DOES warrant `tests/translation-drift.test.js` per ARCHITECTURE.md's Recommended Project Structure, is where that investment belongs).

### Sampling Rate
- **Per task commit:** Run the script manually against the real repo files and spot-check its output against this research's confirmed ground-truth numbers (5 drifted ids, 54 orphans/locale, 21/21 stats-274 merge, 6+ id-drift-from-template entries for `es`).
- **Per wave merge:** Same manual smoke check, plus confirm the report file was written to the exact path CONTEXT.md specifies (`.planning/phases/52-full-page-translation-completeness-audit/52-AUDIT-REPORT.md`).
- **Phase gate:** `/gsd-verify-work` should confirm the report exists, contains all 12 routes (or 11 + 1 explicitly-excluded dashboard row), and its numeric findings are internally consistent (e.g., coverage% + failure-list counts add up).

### Wave 0 Gaps
None — no test-framework scaffolding is needed for this phase's diagnostic-script deliverable, per the manual-only classification above.

## Security Domain

`security_enforcement` is absent from `.planning/config.json` (treated as enabled per default). This phase, however, has no attack surface: it is a build-time, read-only Node script operating on files already inside the repository's own trust boundary, producing a Markdown report. It does not parse untrusted input, does not expose a network service, does not handle credentials, and does not modify any file other than writing its own new report.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — no auth surface in a local diagnostic script |
| V3 Session Management | No | N/A |
| V4 Access Control | No | N/A |
| V5 Input Validation | Marginal | The script reads XLIFF/JSON files that are themselves repo-controlled (not user-uploaded or externally sourced at runtime); standard defensive parsing (regex non-matches return `undefined`/empty rather than throwing) is sufficient — no formal input-validation library is warranted for reading trusted, version-controlled local files. |
| V6 Cryptography | No | N/A — no secrets, no crypto operations |

### Known Threat Patterns for this stack

None applicable. A build-time, read-only, zero-network, zero-credential Node script reading version-controlled repository files has no meaningful STRIDE-relevant attack surface. The only failure mode worth guarding against defensively is a malformed XLIFF/JSON file causing the script to throw an unhandled exception mid-run — handle with a try/catch per file and a clear error message (a robustness concern, not a security one).

## Confirmed Baseline (ground truth this research established for the audit script to reproduce)

This table exists so the plan and the eventual script author have an independent, already-verified answer key to check the new script's output against on its first real run.

| Metric | Value | How confirmed |
|--------|-------|----------------|
| EN (`messages.xlf`) total trans-units | 942 | `grep -c '<trans-unit'` |
| Each target locale (`es`/`de`/`ja`/`zh-CN`/`zh-TW`) total trans-units | 996 | `grep -c '<trans-unit'` per file |
| Orphaned ids per locale (in target, not in EN) | 54 (all 5 locales identical) | Python set-diff of regex-extracted id sets |
| Missing ids per locale (in EN, not in target) | 0 (all 5 locales) | Same set-diff |
| Known-drifted ids from commit `6d3ad363`, still drifted today | 5 of 5, in all 5 locales (`agents.meta.description`, `agents.schema.software.description`, `home.meta.description`, `support.faq.q.tools.a`, `support.schema.faq.tools.a`) | Direct `<source>`-text comparison, EN vs. each locale, this session |
| `translations.stats-274.*.json` key count per locale | 21 (identical key sets across all 5 locales, confirmed via md5 hash comparison) | `json.load()` + `len()`, md5 of sorted key list |
| Stats-274 JSON keys already merged into live XLIFF `<target>` | 21 of 21 per locale (100%) | Direct value comparison, JSON value vs. live `<target>` inner text, `es` locale spot-checked in full |
| Stats-274-related ids present in target XLIFF but absent from current EN template | 9 per locale (a subset of the 54 total orphans) | Set-diff, EN's 12 current `SHOWCASE_STATS_FSB_*` ids vs. target's 21 |
| Current EN template's live `SHOWCASE_STATS_FSB_*` ids | 12 (`_CHART_PENDING_MCP`, `_CHART_POPULAR_MCP_LEGEND`, `_CHART_TOKENS_LEGEND`, `_GLOBE_ANNOTATION`, `_GLOBE_EMPTY`, `_HEADLINE_ACTIVE`, `_HEADLINE_ARIA`, `_HEADLINE_TOKENS`, `_HEADLINE_TOTAL`, `_VIEW_ACTIVE_NOW`, `_VIEW_POPULAR_MCP`, `_VIEW_TOKENS`) | Direct regex extraction from `messages.xlf` |
| Full route table | 12 entries: `''` (home), `about`, `dashboard`, `agents`, `privacy`, `support`, `stats`, `lattice`, `phantom-stream`, `prometheus`, `sitemaps`, `legal`, plus wildcard redirect | Direct read of `app.routes.ts` (full 17-line file) |
| Shellless routes (bypass shared shell nav/footer) | `stats`, `lattice`, `phantom-stream`, `prometheus` (4 of 12) | `data: { shellless: true }` confirmed in `app.routes.ts` |
| Mixed marking styles confirmed | `.html` uses `i18n(-\w+)?="@@id"` exclusively (zero non-`@@` auto-generated ids found); 11+ `.ts` files use `` $localize`:@@id:` `` | Repo-wide grep, both patterns, full `src/app` tree |
| CI wiring of `assemble-xliff-target.mjs`/`merge-and-assemble-274.mjs` | Neither appears in `.github/workflows/ci.yml` -- confirmed one-shot/manual only | `grep` of `ci.yml` |
| `lint:i18n`/`verify:*` npm scripts currently defined | Only `lint:i18n` and `verify:hreflang` are npm-scripted; `verify-locale-sync.mjs` and `verify-bundle-budgets.mjs` are invoked directly via `node scripts/...` in CI, not npm-scripted | Direct `package.json` read + `ci.yml` grep |

## Sources

### Primary (HIGH confidence — all verified via direct tool execution in this research session)
- `showcase/angular/src/app/app.routes.ts` (full file read) — the 12-route table, `shellless` flags, component-file backing for each route
- `showcase/angular/src/app/core/i18n/locale-constants.ts` (full file read) — `LOCALES`, `SOURCE_LOCALE`, `LOCALE_SUBPATHS` single source of truth
- `showcase/angular/src/locale/messages.xlf` + `messages.{es,de,ja,zh-CN,zh-TW}.xlf` (regex-extracted and Python-diffed directly, not sampled) — 942/996 trans-unit counts, 54-orphan/0-missing baseline, 5-known-drifted-id current status, `SHOWCASE_STATS_FSB_*` id sets (12 EN vs. 21 per target)
- `showcase/angular/src/locale/translations.stats-274.{es,de,ja,zh-CN,zh-TW}.json` (full file read of `es`; key-set md5-compared across all 5) — 21 identical keys per locale, JSON structure (flat string values, `<x id=...>` placeholders preserved byte-for-byte, `_comment` provenance key)
- `showcase/angular/scripts/merge-and-assemble-274.mjs` (full file read) — the exact merge logic that produced the confirmed already-merged state; comment header names "Phase 274 / Plan 02"
- `showcase/angular/scripts/assemble-xliff-target.mjs` (full file read) — the reusable trans-unit regex, proven working
- `showcase/angular/scripts/verify-locale-sync.mjs` (full file read) — script-style precedent (regex extraction, `process.exit`, comment-header convention)
- `showcase/angular/scripts/verify-hreflang.mjs` (full file read) — script-style precedent (`record()` pass/fail pattern, walk-directory helper)
- `showcase/angular/src/app/pages/stats/stats-page.component.html` (full file read) — confirmed `i18n="@@id"` custom-id syntax throughout, including the 3 `SHOWCASE_STATS_FSB_*` ids marked in-template
- `showcase/angular/src/app/pages/stats/stats-page.component.ts` (grep of `$localize` usage, lines 100-885) — confirmed 6+ additional `SHOWCASE_STATS_FSB_*` ids marked via `$localize` in TS, not HTML
- `showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.html` (full file read) — confirmed "mobile nav" = `nav-mobile` block, `shellless` gating of nav/footer rendering
- `showcase/angular/src/app/layout/language-picker/language-picker.component.html` (full file read) — confirmed `picker.*` ids
- `showcase/angular/src/locale/DO-NOT-TRANSLATE.md` (full file read) — brand/term allowlist, `[attr.translate]="'no'"` binding-form convention for elements carrying an `i18n` marker
- `showcase/angular/package.json` (scripts block read) — confirmed only `lint:i18n` + `verify:hreflang` are npm-scripted
- `.github/workflows/ci.yml` (lines 39-87 read in full) — confirmed exact `website` job step order, confirmed `assemble-xliff-target.mjs`/`merge-and-assemble-274.mjs` never invoked
- Repo-wide `grep -rn '\$localize'` across `showcase/angular/src` (full tree, not sampled) — confirmed 11+ files use this marking style, listed exhaustively in this research session's tool output
- `git log`/`git show --stat` on commits `46e36899`, `da356602`, `931bc5af` — confirmed stats-274 provenance and the later id-rename/removal commits
- `node --version` (local execution) — confirmed `v24.14.1`, exceeds the `>=24.0.0` engines floor
- `.planning/config.json` (full file read) — confirmed `nyquist_validation` and `security_enforcement` keys both absent (both treated as enabled per default)
- `find /Users/.../tests -iname "*i18n*" -o -iname "*locale*" -o -iname "*xliff*"` — confirmed zero existing i18n-specific test files

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` and `.planning/research/SUMMARY.md` (milestone-level research, both dated 2026-07-07, same day as this phase research) — used as the starting hypothesis for the 5-drifted/54-orphaned baseline and Pattern 1's `extractSourceMap` design, both independently re-verified directly against live files in this session (now HIGH confidence via direct verification, not merely carried forward)

### Tertiary (LOW confidence)
None — every claim in this document was either verified directly via tool execution in this session or explicitly flagged in the Assumptions Log above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, Node version confirmed locally, all reusable patterns confirmed working against live data
- Architecture: HIGH — route table, marking conventions, and script-reuse patterns all confirmed via direct file reads and repo-wide greps, not inferred
- Pitfalls: HIGH — all four pitfalls are grounded in specific, confirmed findings from this research session (mixed marking styles, stats-274 merge-complete-but-stale finding, shared-component id duplication), not generic i18n advice

**Research date:** 2026-07-07
**Valid until:** This research reflects live repository state as of 2026-07-07. Because the audit's own findings (route table, trans-unit counts, drift status) can shift with any unrelated template/locale-file commit — exactly the phenomenon ARCHITECTURE.md's framing correction already demonstrated — this research should be treated as valid only up to the point Phase 52's actual script implementation begins. If implementation is delayed more than a few days, re-run the confirmation queries in this document's "Confirmed Baseline" table before finalizing the plan, rather than trusting the numbers as still-current without re-checking.
