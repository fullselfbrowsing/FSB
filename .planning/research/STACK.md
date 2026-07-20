# Stack Research

**Domain:** Angular i18n translation-completeness audit tooling + XLIFF drift-detection CI gate (showcase marketing site, v1.2.0)
**Researched:** 2026-07-07
**Confidence:** HIGH

> **Note:** This supersedes the prior v1.0.0 (OpenTabs Full App Catalog) `STACK.md` that occupied this path -- that research is unrelated to this milestone and has been overwritten per the current research task. Recover it from git history (`ARCHITECTURE-v1.0.0-OPENTABS-CATALOG.md` in this same directory preserves that milestone's architecture notes as a renamed sibling; the equivalent stack notes are recoverable from git log on this path if ever needed).

## Ground-Truth Finding (verified against live repo files, not hypothetical)

Before recommending tooling, I parsed the actual `showcase/angular/src/locale/messages*.xlf` files with a throwaway script to confirm the milestone's premise and validate the detection algorithm end-to-end. Results, run against the current working tree:

| Locale | Missing (never extracted+translated) | Orphaned (stale id, not in current `messages.xlf`) | Drifted (id matches, `<source>` text differs from current source) |
|--------|----|----|----|
| es | 0 | 54 | 5 |
| de | 0 | 54 | 5 |
| ja | 0 | 54 | 5 |
| zh-CN | 0 | 54 | 5 |
| zh-TW | 0 | 54 | 5 |

The 5 "drifted" units are a **live, reproducible instance of exactly the bug this milestone targets**: e.g. `trans-unit id="home.meta.description"` in `messages.xlf` currently reads *"Local-first Chrome automation and MCP browser layer for AI agents, with trigger watchers, real uploads, and guarded first-party API capability calls."* -- but `messages.es.xlf`'s matching trans-unit still carries the **old** English source text cached inline, and its `<target>` is a translation of that stale sentence, not the current one. No `state` attribute anywhere in the shipped locale files flags this (every unit reads `state="translated"`) -- so the existing pipeline is structurally blind to source drift. This confirms the gap is real, current, and exactly as described in `.planning/PROJECT.md`.

The 54 "orphaned" units per locale are pre-existing (`SHOWCASE_STATS_*` ids, matching the stats-page carry-forward debt) -- a secondary but related finding: orphaned units are a weaker signal than drift (they may reflect intentionally-excluded surfaces) but should still be visible in the audit report.

## Recommended Stack

### Core Technologies (already in place -- do not change)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Angular CLI `ng extract-i18n` | `^20.3.25` (`@angular/build`) | Source-of-truth extraction into `messages.xlf` | Already pinned; producing the XLIFF 1.2 files this milestone must audit. No version change needed or suggested. |
| XLIFF | `1.2` (OASIS) | Translation file format | Already the format in use (`xliff version="1.2"`); do not migrate to XLIFF 2.0 -- would touch all 6 files + Angular config for zero milestone-relevant benefit. |
| Node.js | `>=24.0.0` (repo `engines.node` floor) | Script runtime for new tooling | Matches root `package.json` engines constraint already enforced repo-wide. |

### New Tooling for This Milestone

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Custom Node script, `node:fs`/`node:path` only (no XML library) | n/a (write in-repo) | **CI drift-detection gate**: parse `messages.xlf` + all 5 translated locale files, classify every trans-unit id as `ok` / `missing` / `orphaned` / `drifted`, exit 1 on any `drifted` or `missing` (see Recommendation below for why `orphaned` is warn-only) | This repo already has 2 precedents for exactly this shape of tool -- `showcase/angular/scripts/verify-locale-sync.mjs` and `showcase/angular/scripts/verify-hreflang.mjs` -- both zero-dependency ESM scripts using regex/string parsing over structured text and `process.exit(0/1/2)`. XLIFF's `trans-unit`/`source`/`target` structure is simple enough (as demonstrated by the validated prototype above, directly portable to Node) that a real XML parser is unnecessary. This keeps the new gate dependency-free, consistent with the repo's existing no-build-system/eval-free-tooling posture, and avoids introducing `ng-extract-i18n-merge`'s `xmldoc`/`sax` dependency chain into `devDependencies` for what is fundamentally a read-only CI check. |
| (Optional, NOT required) `ng-extract-i18n-merge` | `3.4.0` (published 2026-06-06, actively maintained, 221 GitHub stars) | Local dev-time convenience: auto-syncs new/changed/removed trans-units into all 5 target files on `ng extract-i18n`, auto-marks drifted units `state="new"` | See "Alternatives Considered" below -- recommended as an optional future adoption for the human/AI translation workflow itself, but explicitly NOT required to satisfy this milestone's CI-gate requirement, and introducing it changes `angular.json`'s `extract-i18n` builder (see Pitfall below), which is a bigger footprint than the milestone's stated scope needs. |

### Supporting Reference (no new runtime dependency -- informs the script's logic)

| Reference | Version/Date | Purpose | When to Use |
|-----------|---------|---------|-------------|
| XLIFF 1.2 OASIS spec, `state`/`state-qualifier` attribute vocabulary | 1.2 (2008, still current for this format) | Defines the canonical values a `<target state="...">` may hold: `new`, `needs-translation`, `needs-review-translation`, `needs-adaptation`, `needs-l10n`, `translated`, `signed-off`, `final` | Use `state="needs-review-translation"` (not a made-up value) if the new gate or its companion fix-up script writes a `state` attribute onto locale files to flag drift -- this keeps output spec-compliant and compatible with any future translation-tool ingestion (e.g. if a paid TMS is adopted later, per the note below). |

## Installation

```bash
# No new npm install needed for the CI gate itself -- it is a plain Node ESM
# script added under showcase/angular/scripts/, invoked directly with `node`,
# exactly like the existing verify-locale-sync.mjs / verify-hreflang.mjs.

# OPTIONAL (not required for milestone completion) -- only if the team also
# wants the dev-time auto-merge convenience:
npm install -D ng-extract-i18n-merge --prefix showcase/angular
# then: npx ng add ng-extract-i18n-merge --prefix showcase/angular
# (rewrites angular.json's extract-i18n builder -- read the Pitfalls section
# below before doing this; it is a build-editing step, evaluate separately
# from the CI-gate work.)
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Custom zero-dependency Node script for the CI gate | `ng-extract-i18n-merge@3.4.0` as the CI gate itself | If the team wants ONE tool to do both dev-time merging AND CI drift-checking, and is willing to accept it rewriting `angular.json`'s `extract-i18n` builder (`@angular/build:extract-i18n` -> `ng-extract-i18n-merge:ng-extract-i18n-merge`). Its `resetTranslationState: true` default already does the "mark stale on source change" work by setting the target unit's `state` to `new` and, per its own merge logic, copies the new English `source` text into `target` as a placeholder (`syncTarget = syncSourceLang || isUntranslated(...)`) -- i.e. it doesn't just flag drift, it partially "fixes" it by giving an English fallback pending real translation. This is a legitimate choice but changes CI-02's existing `diff -u messages.xlf /tmp/extract-check/messages.xlf` semantics (see Pitfall below), which is a broader footprint than "add one CI gate." |
| `ng-extract-i18n-merge@3.4.0` | `ngx-i18nsupport` / `xliffmerge` | Never for new adoption in 2026 -- **confirmed dead**: last published to npm 2018-09-21 (8 years stale), predates Angular's builder-based extraction pipeline entirely, will not resolve against `@angular/build ^20.x`. Do not use, do not reference as a "standard" tool going forward; it surfaces in search results only because of historical popularity from the pre-Ivy Angular era. |
| Read-only source-drift CI check (custom script or wrapped `ng-extract-i18n-merge` in check-only mode) | Full commercial Translation Management System (Lokalise, Crowdin, Smartling, Phrase, doloc.io) | Only if the team decides ongoing translation-maintenance labor (not just drift *detection*) should be outsourced. `doloc.io` (built by the same author as `ng-extract-i18n-merge`, explicitly cross-promoted in its README) is a **paid per-source-text SaaS** with a 14-day trial and no stated indefinite free tier for production use. This milestone's explicit brief is "usable without a paid translation-management SaaS" -- do not adopt doloc.io or any TMS as part of this milestone. Flag as an explicit, separate decision if ever revisited, not a default. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `ngx-i18nsupport` (xliffmerge) | Unmaintained since 2018; predates the Angular CLI builder-based extraction model entirely; will not function correctly (if it even installs) against Angular 20's `@angular/build:extract-i18n` output shape. | `ng-extract-i18n-merge@3.4.0` if a merge tool is wanted at all; otherwise the custom script recommended above. |
| A full XML/DOM parser dependency (e.g. `xmldoc`, `fast-xml-parser`, `xml2js`) added solely for this one CI script | Overkill for a read-only structural check over a well-known, narrow XLIFF 1.2 shape (`<trans-unit id="..."><source>...</source></trans-unit>`), and this repo has an established zero-dependency precedent (`verify-locale-sync.mjs`, `verify-hreflang.mjs`) for exactly this class of script. Adding a parser dependency here is inconsistent with that precedent and adds supply-chain surface for no material robustness gain at this file's actual complexity. Note: if the same script also needs to *write* XLIFF (not just read/diff it), hand-rolled regex-based mutation of XML becomes materially riskier -- see Pitfall below. | Plain regex/string-based extraction (`<trans-unit id="([^"]+)"[^>]*>(.*?)</trans-unit>` block splitting, then `<source>` / `<target[^>]*>` sub-matches) for **read-only** comparison. This is the exact approach validated against the live files above. |
| A paid Translation Management SaaS (Lokalise, Crowdin, Smartling, Phrase, doloc.io) as a *requirement* of this milestone | Milestone brief explicitly requires a no-paid-SaaS solution; introducing a recurring per-source-text billing dependency for what is fundamentally a CI-gate + audit-script problem is disproportionate and would need explicit stakeholder sign-off as a new operating cost, not a research-driven default. | Custom script (drift detection) + the same AI-filled-XLIFF workflow already used in v0.9.63 (per `.planning/PROJECT.md`: "AI-filled XLIFFs") for the actual re-translation labor. |
| Writing ad-hoc, non-spec `state` values (e.g. `state="stale"`, `state="drifted"`) into the `.xlf` files if the drift-fix script also mutates locale files | XLIFF 1.2's `state` attribute has an OASIS-defined enumeration; non-spec values break interoperability with any XLIFF-aware tool (including Angular's own tooling, other CAT tools, or a future TMS import) and would need to be undone later. | `state="needs-review-translation"` (source changed, existing translation may still be partially valid and worth keeping as a starting point for a human/AI reviewer) or `state="needs-translation"` (no usable prior translation) -- both are OASIS-standard values already implicitly supported by tooling in this ecosystem, including `ng-extract-i18n-merge`'s own `initialTranslationState` concept (which defaults to the equivalent `'new'` for XLIFF 1.2). |

## Stack Patterns by Variant

**If the milestone's drift-detection gate is read-only (recommended default):**
- Write one script, e.g. `showcase/angular/scripts/verify-translation-currency.mjs`, that:
  1. Parses `messages.xlf` into an `id -> sourceText` map (source of truth).
  2. For each of the 5 translated locale files, parses into `id -> {sourceText, targetText}`.
  3. Classifies every id into `ok` (present, source text matches), `missing` (present in current source, absent from locale file), `orphaned` (present in locale file, absent from current source), `drifted` (present in both, but `<source>` text differs between the two files).
  4. Hard-fails (`process.exit(1)`) on any `missing` or `drifted` count > 0 across any locale.
  5. Reports `orphaned` counts as a warning only (non-fatal) unless the milestone's stats-page resync work explicitly wants them to fail too -- these represent debt from previously-excluded surfaces, not newly-introduced drift, and conflating them with true drift will make the gate noisy on day one given the 54-per-locale baseline already present.
- Because: it adds zero new dependencies, mirrors the two existing verification scripts in this codebase exactly, and is trivially auditable (a reviewer can read the whole script in one sitting, same bar as `verify-locale-sync.mjs`).

**If the team ALSO wants to reduce translator busywork (separate decision from the CI gate, optional):**
- Adopt `ng-extract-i18n-merge@3.4.0` as a local `ng extract-i18n` builder replacement to auto-sync + auto-mark-stale trans-units across all 5 target files whenever `ng extract-i18n` runs.
- Because: it eliminates hand-editing 5 XLIFF files every time a template string changes, and its `resetTranslationState`/fuzzy-match behavior is exactly the "mark drifted units for re-translation" mechanic this milestone wants -- but as a *workflow* aid, not the CI gate itself.
- Do this only as an explicit, separate decision -- it changes `angular.json`'s existing `extract-i18n` architect target and interacts with CI-02 (see Pitfalls below); don't bundle it silently into "add a drift gate."

## Integration with Existing CI Gates (avoiding duplication)

This repo's existing i18n-related CI steps, verified directly from `.github/workflows/ci.yml` and `showcase/angular/package.json`:

| Existing gate | What it actually checks | Overlap risk with new drift gate |
|---|---|---|
| `lint:i18n` (`eslint "src/**/*.html" --ignore-pattern ... @angular-eslint/template/i18n`) | Every translatable template node/attribute in `.html` files carries an `i18n`/`i18n-*` marker. Operates purely on `.html` source; has no knowledge of `.xlf` file contents. | **None.** Confirmed via the rule's own docs/source that it never reads `.xlf` files. A string can pass `lint:i18n` (properly marked) while still being unextracted or drifted in `.xlf` -- these are genuinely separate failure modes, not the same check twice. |
| CI-02, "Verify `ng extract-i18n` produces no diff" (`ng extract-i18n --output-path /tmp/extract-check && diff -u messages.xlf /tmp/extract-check/messages.xlf`) | Catches new/removed/changed `i18n`-marked strings in templates that were never re-extracted into the committed `messages.xlf` (source-file-only omission). Note: `.planning/PROJECT.md` calls this `extract-i18n-clean`, but there is no npm script by that literal name in `showcase/angular/package.json` -- the check is an inline shell step in `.github/workflows/ci.yml`; treat "extract-i18n-clean" as descriptive shorthand for this diff step, not a script to `grep` for. | **Adjacent, not overlapping.** CI-02 only ever compares `messages.xlf` (source) against a freshly regenerated copy of itself -- it never looks at the 5 translated locale files at all. It catches (a) from the research question (new strings never extracted); the new gate this milestone needs must specifically catch (b) (translated-locale drift) plus close the remaining gap in (a) (strings extracted into `messages.xlf` correctly, per CI-02, but never actually propagated/re-translated into the 5 target files -- the "missing" classification above). |
| `verify-locale-sync.mjs` | Confirms the locale-constants TS module and `angular.json`'s locale list agree (registry parity, not content parity). | **None** -- entirely different concern (which locales exist, not whether their content is current). |
| `i18nMissingTranslation: "error"` (Angular compiler option in `angular.json`) | Fails the Angular *build* if a trans-unit id referenced by a template has **no** `<target>` at all in a locale file. | **Partial overlap on "missing", none on "drifted".** This compiler option already hard-fails on completely absent translations at build time -- so a pure "missing" check in the new CI gate is somewhat redundant with what a full `ng build` would already catch per-locale. The genuinely new value this milestone's gate adds is the **drift** case: a `<target>` exists, is non-empty, and the build succeeds, yet it translates *stale* source text that no longer matches -- something `i18nMissingTranslation` structurally cannot detect (it only checks presence/absence, never content-equivalence against source). Recommendation: keep the new gate's primary value proposition framed as "source-drift detection" (the "b" case in the research question) and treat "missing" reporting as a bonus/earlier-signal (catching it as a fast standalone script is cheaper than waiting for a full per-locale `ng build` to fail), not the headline feature.

**Net conclusion:** none of the 4 existing gates read `<source>` text in the 5 translated locale files and compare it against the current `messages.xlf` `<source>` for the same id. This is a genuine, unfilled gap -- the new gate is additive, not duplicative, provided it's scoped to this specific check.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `ng-extract-i18n-merge@3.4.0` | `@angular/build ^20.0.0 || ^21.0.0 || ^22.0.0` | This repo pins `@angular/build@^20.3.25` -- within range. `engines.node >=20.19.0` required by the package; this repo's floor is `>=24.0.0`, comfortably above. |
| `ng-extract-i18n-merge@3.4.0` | `xmldoc@^1.1.3` (transitive dep pinned in its own `package.json`, distinct from the newer `xmldoc@3.0.0` on npm's `latest` tag) | `xmldoc` itself depends only on `sax@^1.6.0`, a long-established pure-JS SAX parser with no native bindings and no `eval`/`new Function` usage -- acceptable supply-chain profile if this path is chosen, but still a net-new dependency the zero-dependency custom-script approach avoids entirely. |
| Custom drift-detection script (recommended) | Node `>=24.0.0` (already the repo floor) | Uses only `node:fs`/`node:path`; no version sensitivity. |

## Sources

- Live repository inspection (HIGH confidence, ground truth): `showcase/angular/src/locale/messages.xlf` and `messages.{es,de,ja,zh-CN,zh-TW}.xlf`, `showcase/angular/package.json`, `showcase/angular/angular.json`, `showcase/angular/scripts/verify-locale-sync.mjs`, `showcase/angular/scripts/verify-hreflang.mjs`, `showcase/angular/eslint.config.js`, `.github/workflows/ci.yml` -- confirmed exact CI-02 mechanism is a raw shell step (`ng extract-i18n --output-path /tmp/extract-check && diff -u messages.xlf /tmp/extract-check/messages.xlf`) in `ci.yml`, not an npm script literally named `extract-i18n-clean`; confirmed live drift instances (5 units x 5 locales) and orphan baseline (54 units x 5 locales) via direct XLIFF parsing against the actual files.
- npm registry API (`registry.npmjs.org`), HIGH confidence: `ng-extract-i18n-merge@3.4.0` published 2026-06-06T19:31:58Z, `peerDependencies: {"@angular/build": "^20.0.0 || ^21.0.0 || ^22.0.0"}`, `engines: {"node": ">=20.19.0"}`; `ngx-i18nsupport@0.17.1` last published 2018-09-21T11:05:09Z (confirms dead/abandoned).
- GitHub repo metadata + raw source (`daniel-sc/ng-extract-i18n-merge`, `master` branch), HIGH confidence: `README.md` (options table, upgrade notes, doloc.io cross-promotion), `src/merger.ts` (confirmed `state: isSourceLang ? 'final' : (onlyWhitespaceChanged ? destUnit.state : this.initialTranslationState)` -- the exact drift-marking mechanic), `src/builder.ts` (confirmed `STATE_INITIAL_XLF_1_2 = 'new'` literal and that the builder mutates files on disk, i.e. it's a write path not a read-only checker), `schematics/ng-add/index.ts` (confirmed `target.builder = 'ng-extract-i18n-merge:ng-extract-i18n-merge'` overwrite of the `extract-i18n` architect target in `angular.json`); repo health: not archived, pushed 2026-06-06, 221 stars, 14 open issues -- actively maintained.
- `angular.dev/guide/i18n/merge` (official Angular docs, fetched via WebFetch), HIGH confidence: confirmed Angular's first-party i18n merge guide has **no built-in mechanism** for detecting stale/drifted translations when source text changes -- this is an acknowledged gap in core tooling, not something this research overlooked.
- WebSearch (multiple queries, cross-referenced against the primary sources above for MEDIUM->HIGH confidence upgrade): XLIFF 1.2 OASIS `state` attribute vocabulary (`new`, `needs-translation`, `needs-review-translation`, `needs-adaptation`, `needs-l10n`, `translated`, `signed-off`, `final`) -- corroborated directly by the `oasis-open.org` spec reference in search results and independently by the `STATE_INITIAL_XLF_1_2` constant found in `ng-extract-i18n-merge`'s own source.
- WebSearch, MEDIUM confidence (single-source via search snippet, doloc.io's pricing page not independently fetched in full): doloc.io is a paid-tier SaaS (per-source-text pricing, 14-day trial, no stated indefinite free tier) -- sufficient confidence to flag it as "do not adopt as part of this milestone" per the explicit brief constraint, but if a future milestone considers doloc.io seriously, re-verify current pricing directly against `doloc.io/pricing/`.
- `@angular-eslint/template/i18n` rule docs + GitHub issues (WebSearch, MEDIUM confidence, corroborated by direct inspection of this repo's own `eslint.config.js`): confirmed this rule operates purely on `.html` template source (checks for missing `i18n`/`i18n-*` markers) and has no awareness of `.xlf` file contents -- no overlap/duplication risk with a new XLIFF-drift gate.

---
*Stack research for: Angular i18n / XLIFF translation-completeness auditing and drift-detection tooling*
*Researched: 2026-07-07*
