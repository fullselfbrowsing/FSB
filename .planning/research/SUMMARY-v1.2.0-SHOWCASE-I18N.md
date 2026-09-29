# Project Research Summary

**Project:** FSB (Full Self-Browsing)
**Milestone:** v1.2.0 Showcase i18n Completeness
**Domain:** Angular i18n translation-completeness audit + XLIFF drift-detection CI gate, on an existing 6-locale Express-prerendered marketing showcase site (reopened maintenance debt, not greenfield i18n)
**Researched:** 2026-07-07
**Confidence:** HIGH

## Executive Summary

This milestone closes a reopened i18n completeness gap on FSB's already-shipped (v0.9.63) 6-locale showcase site, and it does so with an existing, well-suited toolchain rather than new infrastructure. All four researchers converged, independently, on the same core finding and the same fix for it: **the milestone's own framing overstates the resync scope.** PROJECT.md and the original commit `6d3ad363` diff stat describe "247 trans-units" changed, but a trans-unit-`id`-keyed diff of that commit shows only **5 IDs have an actual `<source>` text change** (`agents.meta.description`, `agents.schema.software.description`, `home.meta.description`, `support.faq.q.tools.a`, `support.schema.faq.tools.a`); the other 242 are `<context-group><linenumber>` churn from unrelated template edits that `ng extract-i18n` rewrites on every run, regardless of whether any translatable copy changed. This is corroborated by 11+ prior commits in this repo's own history that are 100% pure line-shift noise with zero content change -- this project has a well-established "messages.xlf-only commit = safe" pattern that commit `6d3ad363` broke by burying 5 real edits inside otherwise-routine churn. The corrected framing materially changes scope: the resync phase is a small, bounded translation task (5 known units, plus whatever a full-page audit surfaces beyond that one commit), not a 247-unit re-translation effort.

The recommended approach is entirely additive to what's already in place: build two new zero-dependency Node scripts in the established `showcase/angular/scripts/verify-*.mjs` style (matching `verify-locale-sync.mjs` and `verify-hreflang.mjs` exactly) -- a temporary/diagnostic full-page audit script and a permanent, CI-wired `verify-translation-drift.mjs` gate that diffs `<source>` text keyed by trans-unit `id` (never whole-file byte/line diff) between `messages.xlf` and each of the 5 translated locale files. No XML parser dependency, no TMS, no `ng-extract-i18n-merge` adoption is required to satisfy this milestone (both are legitimate but explicitly optional future decisions, not defaults). Sequencing matters: the audit must run and the resync must land BEFORE the drift gate is wired hard-fail into CI, or the gate immediately goes red on pre-existing debt it didn't cause. The stats page's translation work must complete before the `lint:i18n` ignore-pattern for `stats/**` is removed, or that gate goes red too. A fully independent, parallelizable fix (WARNING-02: cookie should beat Accept-Language header on repeat visits) lives entirely in Express middleware and has zero shared surface with the XLIFF work.

The key risks are process risks, not technical risks, and this project has direct, repeated evidence of exactly the failure modes to guard against: (1) a coarse CI gate (whole-file/line-count diff instead of per-`id` `<source>`-text diff) will chronically false-positive on this repo's routine template churn and train engineers to bypass it -- exactly how WARNING-02 itself survived six-plus milestones as unaddressed debt; (2) treating `i18n`-marker presence, `state="translated"` (hardcoded unconditionally by `assemble-xliff-target.mjs`, carries zero real semantic weight), or a green `ng build` as proof of translation currency reproduces the precise blind spot this milestone exists to close -- none of those signals can detect a `<target>` that exists but is stale; (3) orphaned `translations.stats-274.*.json` artifacts under a disjoint ID namespace look like completed stats-page work but are unverified as ever having been merged into the live `messages.<locale>.xlf` files the build actually consumes. Mitigation for all three is the same: build the drift gate to compare only `<source>` inner-text per trans-unit `id` (ignoring context-group/linenumber metadata), back-test it against this repo's own git history (11 known-clean commits + `6d3ad363`) before merging it, and trace any "already translated" artifact end-to-end into the live XLIFF files before crediting it as done.

## Key Findings

### Recommended Stack

No new runtime dependency, no build-system change, no XLIFF-format migration. The milestone's tooling needs are fully satisfied by plain Node ESM scripts using `node:fs`/`node:path` only, following this repo's own established zero-dependency `verify-*.mjs` precedent. `ng-extract-i18n-merge@3.4.0` is a legitimate, actively-maintained (221 stars, published 2026-06-06) optional future adoption for reducing translator busywork at extraction time, but it rewrites `angular.json`'s `extract-i18n` builder and is explicitly NOT required to satisfy this milestone's CI-gate requirement -- treat it as a separate, later decision. `ngx-i18nsupport`/`xliffmerge` is confirmed dead (last published 2018) and must not be adopted. No commercial TMS (Lokalise, Crowdin, Smartling, Phrase, doloc.io) should be introduced; the milestone brief explicitly requires a no-paid-SaaS solution, and this site's scale (6 locales, ~942 trans-units, ~7 routes) doesn't warrant one per small-team i18n guidance.

**Core technologies:**
- Angular CLI `ng extract-i18n` (`@angular/build ^20.3.25`), XLIFF 1.2 (OASIS): already in place, producing the files this milestone audits -- no version change, no format migration.
- Custom zero-dependency Node script(s) under `showcase/angular/scripts/`: the CI drift gate and the diagnostic audit tool -- matches the existing `verify-locale-sync.mjs`/`verify-hreflang.mjs` pattern exactly (regex/text parse, `process.exit(0/1)`).
- Node `>=24.0.0`: already the repo-wide `engines.node` floor; no new runtime requirement.
- (Optional, explicitly NOT required) `ng-extract-i18n-merge@3.4.0`: dev-time auto-merge convenience for reducing hand-editing of 5 XLIFF files per template change -- a separate decision from this milestone's CI-gate requirement, deferred.

### Expected Features

This is a maintenance-completeness question, not a "how to internationalize" question -- the site already shipped i18n at v0.9.63. The scope splits cleanly into what's genuinely load-bearing for "staying complete" vs. gold-plating for a 6-locale, ~7-route marketing site.

**Must have (table stakes, this milestone's actual P1 scope):**
- Full-page audit verifying every translatable string on every current showcase route is genuinely translated (not just `i18n`-marked) -- the core deliverable, since no existing tool checks translation content currency.
- Resync of the trans-units with real `<source>` drift (5 confirmed from commit `6d3ad363`, likely more once the full-page audit runs beyond that one commit's blast radius) across all 5 translated locales.
- Stats page brought to full translation coverage, with `--ignore-pattern "src/app/pages/stats/**"` removed from `lint:i18n` only AFTER coverage is verified (not before).
- WARNING-02 fix: cookie-set locale preference beats Accept-Language header on the bare-`/` redirect for returning visitors.
- New CI drift-detection gate: content-diff based (per trans-unit `id`, `<source>`-text only), not structural-presence based; must land on a clean baseline (after audit + resync + stats-page work), not before.

**Should have (differentiators, P2/near-term follow-up, do not gate the above):**
- Native-speaker/bilingual-fluent QA pass scoped narrowly to the confirmed-drifted units + stats page (not a full 420+-unit re-review) -- v0.9.63 shipped AI-filled XLIFF with no stated native-review layer, so this is a new quality bar, not reapplication of an existing one.
- Transcreation-lens review applied only to hero headlines + primary CTAs (~10-20 strings), where literal translation most commonly fails.
- Targeted manual visual spot-check of German (text expansion) and zh-CN/zh-TW (CJK line-wrap) on the highest-copy-density routes -- a cheap substitute for full visual regression at this site's size.

**Defer (v1.3+ or only if scale changes):**
- Full automated per-locale visual regression/screenshot-diffing pipeline.
- Migrating the stats page off its ad hoc `translations.stats-274.*.json` mechanism into the main XLIFF pipeline (worth doing eventually, not required this milestone).
- Lightweight translation-freshness/"last synced" reporting.
- Full commercial TMS adoption, re-deriving the supported-locale list, or translating the dashboard page (explicitly out of scope; dashboard is an authenticated app surface, not marketing content).

### Architecture Approach

The system is a linear pipeline: component templates carry `i18n` markers -> `ng extract-i18n` produces `messages.xlf` (EN source of truth) -> 5 translated XLIFF files mirror the EN `<source>` at fill-time and carry the `<target>` translation -> `ng build --localize` emits per-locale prerendered HTML -> Express serves it with an Accept-Language/cookie-based locale redirect. Four existing CI gates each check a different, narrow, non-overlapping axis of "looks complete" (locale-registry parity, template-marker presence, EN-source extraction completeness, per-locale target *presence*) -- none of them compares `<source>` content across the EN file and the 5 translated files, which is exactly the gap this milestone closes. The new drift gate is genuinely additive, not duplicative.

**Major components:**
1. `verify-translation-drift.mjs` (NEW, permanent) -- parses `messages.xlf` and each of the 5 target XLIFFs into `Map<trans-unit id, source text>`; fails the build if any id's EN `<source>` doesn't byte-match its mirrored `<source>` in any target file. Lives alongside the other `verify-*.mjs` scripts, wired as a new named CI step inserted after the existing "extract-i18n-clean" diff step and before `ng build`.
2. `audit-translation-completeness.mjs` (NEW, temporary/diagnostic) -- one-shot script (or manual walkthrough) to enumerate the true full scope of untranslated/drifted strings across all current showcase routes; NOT the same artifact as the CI gate (different cost/frequency profile -- heavier, infrequent, human-report-producing vs. fast/permanent/CI-blocking) and should be retired or demoted to a manual `npm run audit:i18n` script once its findings are resolved.
3. `accept-language.js` middleware (MODIFIED in place, not replaced) -- WARNING-02 fix is a ~5-line change to the cookie branch (redirect instead of short-circuit), reusing all existing parsing/matching logic unchanged; the existing `req.path !== '/'` loop guard already prevents any redirect loop.
4. Existing, unchanged: `angular.json`'s `i18n.locales` block, `locale-constants.{ts,js}`, `verify-locale-sync.mjs`, `verify-hreflang.mjs`, `DO-NOT-TRANSLATE.md` -- no new locale registry, no new XLIFF format, no new translation-storage layer.

### Critical Pitfalls

1. **Treating "247 trans-units changed" as "247 translations need redoing"** -- the single most important corrected fact from this research. Only 5 of 247 changed blocks have real `<source>` text drift; 242 are harmless `<context-group><linenumber>` churn. Avoid by deriving the true stale-ID count from an `id`-keyed `<source>`-text diff before any translation work is scoped or estimated, and by re-verifying the count is still accurate the moment any other template PR merges before this milestone starts (the number drifts with any unrelated commit).
2. **`i18n`-marker presence, a green `ng build`, or `state="translated"` treated as proof of a current translation** -- none of the four existing CI gates, nor the XLIFF `state` attribute (hardcoded unconditionally by `assemble-xliff-target.mjs`), detect a `<target>` that exists but is stale relative to a changed `<source>`. Avoid by building the audit to explicitly separate "coverage" (marker + target exists) from "currency" (target still matches current source) as two distinct verdicts per string, and by never accepting "renders without error" or "eslint passes" as evidence of currency.
3. **A coarse (whole-file or line-count) CI gate will chronically false-positive and get bypassed** -- given this repo's demonstrated churn rate (11+ prior pure-line-shift commits), a gate that fires on file-changed rather than `<source>`-text-changed will train engineers to route around it, exactly how WARNING-02 itself went unaddressed for six-plus milestones. Avoid by diffing only `<source>` inner-text per `id` (ignoring context-group/linenumber), and by back-testing the gate against this repo's own git history before wiring it into CI.
4. **Orphaned "already translated" artifacts (`translations.stats-274.*.json`) create false completeness signals** -- these files exist under a disjoint ID namespace (`SHOWCASE_STATS_FSB_*` vs. the live `stats.*` prefix already in `messages.xlf`) and it is unverified whether they were ever merged into the live locale files the build consumes. Avoid by tracing any such artifact end-to-end into the live `messages.<locale>.xlf` before crediting it as done, and by resolving (merge or delete) rather than leaving it stranded.
5. **Normalization of deviance -- deferred debt in this project has a proven multi-milestone half-life.** WARNING-02 was deferred at v0.9.63 and carried unfixed across six-plus subsequent milestones with no mechanical forcing function; the `dashboard`/`stats` `lint:i18n` ignore-pattern is the same silence mechanism. Avoid by never recording a residual gap as prose-only deferred debt -- any newly-discovered-but-unaddressed item needs an automated check, failing test, or CI gate that makes it visible again on its own, not reliance on someone rereading old milestone notes.

## Implications for Roadmap

Based on research, the phase structure should follow the dependency chain all four researchers converged on independently: **audit first (establish true scope) -> resync (close the known + newly-found gap) -> stats-page completion (gate the ignore-pattern flip) -> drift gate (land on a clean baseline) -> WARNING-02 fix (fully independent, any time)**. Building the permanent CI gate before the audit/resync lands means it either fails on day one (pre-existing debt) or is built loose enough to miss real drift, defeating its purpose.

### Phase 1: Full-Page Translation Completeness Audit
**Rationale:** Must run first to establish the TRUE scope of drift and missing coverage -- the milestone's own corrected framing shows the named commit's "247" figure is not the real number (it's 5, confirmed), and the audit's job is explicitly to find whatever additional drift exists beyond that one commit, since the milestone's stated goal ("every translatable string on every showcase page genuinely translated") is broader than one commit's blast radius.
**Delivers:** A per-page, per-locale, per-trans-unit currency verdict (coverage AND currency, as two distinct checks) across all current showcase routes (lattice, phantom-stream, prometheus, home, mobile nav, stats, plus the original 6 from v0.9.63); a temporary diagnostic script (`audit-translation-completeness.mjs`) that is later retired or demoted, not left running alongside the permanent gate; an explicit trace of the orphaned `translations.stats-274.*.json` artifacts into (or out of) the live `messages.<locale>.xlf` files.
**Addresses:** Full-page audit target feature; stats-page sub-scope verification.
**Avoids:** Pitfall 1 (247 != real drift count), Pitfall 2 (marker presence != currency), Pitfall 4 (orphaned artifacts).

### Phase 2: Trans-Unit Resync (Known + Audit-Discovered Drift)
**Rationale:** Must follow the audit directly -- the resync's scope is exactly the audit's findings (5 confirmed units from `6d3ad363` at minimum, plus whatever else surfaces), not a number fixed in advance from the original miscounted commit stat.
**Delivers:** All drifted trans-units resynced across es/de/ja/zh-CN/zh-TW, with `<x id=.../>` placeholder alignment and `DO-NOT-TRANSLATE.md` brand/term rules re-verified for each resynced string (several of the known 5 involve substantive marketing-voice rewrites, not mechanical word-swaps, and deserve the same quality bar as the original v0.9.63 translation pass); stats-page translation work completed under whichever mechanism currently applies (existing `stats.*` XLIFF namespace, formalizing the JSON mechanism is explicitly out of scope this milestone).
**Addresses:** Trans-unit resync target feature; stats-page full translation coverage.
**Avoids:** Pitfall 1 (scoping the real, audit-derived count), the security-mistake in PITFALLS.md around placeholder/brand-term preservation during resync.

### Phase 3: Stats Page Ignore-Pattern Removal
**Rationale:** A small, explicitly separate, ordered change that must come strictly after Phase 2's stats-page translation work is verified complete -- flipping the ignore-pattern before coverage is confirmed either turns CI red immediately or passes falsely.
**Delivers:** `--ignore-pattern "src/app/pages/stats/**"` removed from `lint:i18n` in `showcase/angular/package.json`; dashboard's ignore-pattern remains untouched and is captured as a permanent, intentional architectural boundary (not another "deferred, will revisit" placeholder).
**Addresses:** Stats-page target feature (ignore-pattern half).
**Avoids:** Pitfall 6 (normalization of deviance) for the dashboard-exclusion decision specifically -- document it as permanent, not prose-deferred.

### Phase 4: New CI Drift-Detection Gate
**Rationale:** Must land only once the tree is drift-free (after Phases 1-3), so it passes on first wiring instead of immediately failing on residual pre-existing debt -- the classic "gate discovers debt it didn't cause" trap this project has direct history of falling into with prior gates.
**Delivers:** `verify-translation-drift.mjs`, following the existing `verify-locale-sync.mjs`/`verify-hreflang.mjs` zero-dependency style; diffs `<source>` text keyed by trans-unit `id` only (never whole-file/line-count); derives the target-locale list dynamically from the existing locale registry (not hardcoded, avoiding a repeat of the prior WARNING-01 mistake); back-tested against this repo's own git history (11+ known-clean churn commits plus `6d3ad363`) before being wired hard-fail into `.github/workflows/ci.yml`'s `website` job, inserted after the existing extract-i18n-clean diff step and before `ng build`.
**Uses:** Node `>=24.0.0`, `node:fs`/`node:path` only -- no new dependency (from STACK.md).
**Implements:** Pattern 1 (ID-keyed source-text diff) from ARCHITECTURE.md.
**Avoids:** Pitfall 3 (unused `state=` attribute as a false signal -- pick a canonical staleness mechanism, e.g. `<source>`-text diff itself, explicitly, not implicitly), Pitfall 5 (coarse-gate false positives and bypass habit).

### Phase 5: WARNING-02 Cookie-Redirect Fix
**Rationale:** Fully independent of Phases 1-4 -- touches a completely different file (`accept-language.js`) and concern (runtime redirect behavior vs. build-time translation content); zero shared surface with the XLIFF/translation work, so it can be sequenced in parallel or in any order relative to the other phases without blocking or being blocked by them.
**Delivers:** Cookie branch changed from short-circuit (`next()`) to active redirect (`302` to `/{cookieLocale}/`) when the cookie names a valid, non-default supported locale; default-locale case (`cookieVal === 'en'`) still correctly falls through to `next()` (redirecting to `/en/` would 404, since EN's `subPath` is `""`); existing loop-guard (`req.path !== '/'`) preserved unchanged; the one existing test asserting the old short-circuit semantics (`tests/server-accept-language.test.js:81-85`) deliberately flipped to assert the new redirect behavior, called out explicitly as an intentional behavior change.
**Uses:** Existing `pickBestLocale`, `parseCookieHeader`, alias-matching logic -- all reused unchanged.
**Implements:** Pattern 2 (Cookie-Directed Redirect) from ARCHITECTURE.md.
**Avoids:** Anti-Pattern 3 in ARCHITECTURE.md ("just flip a boolean" without the default-locale special case); the UX pitfall of not re-running `verify:hreflang` after a redirect-logic change.

### Phase Ordering Rationale

- Audit-then-resync-then-gate is a hard dependency chain, not a stylistic preference: wiring the permanent drift gate before the tree is drift-free guarantees either an immediately-red CI or a gate built loose enough to miss what it's supposed to catch -- this project has already lived through the cost of gates nobody trusts (WARNING-02's own multi-milestone limbo).
- The stats-page ignore-pattern removal is sequenced as its own phase (3) rather than folded into Phase 2's resync work, because it is explicitly a distinct, ordered "flip after verify" step per multiple researchers' independent Suggested Build Order sections -- conflating translation completion with the lint-gate flip risks shipping the flip before coverage is actually confirmed.
- WARNING-02 (Phase 5) is placed last only for narrative completeness; all four research files agree it has no dependency relationship with Phases 1-4 and can be executed in parallel with any of them if the roadmap wants to parallelize work.
- This ordering directly avoids Anti-Pattern 2 from ARCHITECTURE.md (merging the one-time audit and the permanent CI gate into one script) by keeping them as two separate phases with two separate artifacts and lifecycles.

### Research Flags

Phases likely needing deeper research during planning (`/gsd-plan-phase --research-phase <N>`):
- **Phase 1 (audit):** the exact audit methodology (static-analysis over templates vs. post-build inspection of prerendered `dist/` HTML per locale) is a design choice ARCHITECTURE.md flags as recommend-static-first but not fully settled; also needs explicit tracing logic for the `translations.stats-274.*.json` -> live-XLIFF verification.
- **Phase 4 (drift gate):** the exact back-testing protocol against this repo's own git history (which commits, what "silent on clean / fires on `6d3ad363`" acceptance criteria look like as a concrete test) should be worked out during phase planning, not assumed obvious.

Phases with standard/well-documented patterns (lighter research, can largely follow the codebase's own precedent scripts):
- **Phase 2 (resync):** mechanical translation-merge work using existing tools (`assemble-xliff-target.mjs`/`merge-and-assemble-274.mjs`), re-run against current `messages.xlf`, not new tooling.
- **Phase 3 (ignore-pattern removal):** a one-line `package.json` change, gated on Phase 2's completion -- no research needed beyond sequencing discipline.
- **Phase 5 (WARNING-02 fix):** architecture research (Pattern 2) already specifies the exact ~5-line code change, the loop-safety invariant, and the specific test assertion that must flip -- this is close to plan-ready as-is.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against live repo files (actual `messages.xlf` + 5 locale files parsed with a throwaway script, confirming the 5-drifted/54-orphaned baseline firsthand), the npm registry, and the `ng-extract-i18n-merge` GitHub source directly -- not inferred from documentation alone. |
| Features | HIGH | Grounded in direct codebase inspection (existing scripts, `DO-NOT-TRANSLATE.md`, locale-constants, git log for `6d3ad363`) plus Google's own primary international-SEO documentation (fetched directly) for the table-stakes SEO items; secondary sources (transcreation, TMS-scope-inflation guidance) are MEDIUM confidence industry practice, appropriately used only for the differentiator/anti-feature tiers, not the core P1 scope. |
| Architecture | HIGH | Every integration seam (CI job order, middleware mount point, locale registry, existing test assertions) verified by direct file read against this repo's own source, not inferred from general Angular-i18n patterns. |
| Pitfalls | HIGH | All findings grounded in direct repo inspection: the actual `git show 6d3ad363` diff, 11+ prior commit history establishing the "safe churn" baseline, actual eslint config, actual `assemble-xliff-target.mjs` source. |

**Overall confidence:** HIGH. All four researchers independently verified the same corrected fact (5 real drifted units, not 247) from the primary source (the actual commit diff and the actual live XLIFF files), which is the strongest available signal that this framing correction is accurate and that the roadmap should scope the resync phase to the true, audit-derived count rather than the milestone's original "247 trans-units" language.

### Gaps to Address

- **The true final drift/missing count is not yet fully known.** 5 units are confirmed from commit `6d3ad363` specifically, and 54-per-locale orphaned units (pre-existing, `SHOWCASE_STATS_*`-style, likely stats-page carry-forward debt) are a known baseline -- but the milestone's own goal statement is broader than one commit's blast radius. Handle: Phase 1 (the full-page audit) is explicitly designed to surface the complete true count before Phase 2's resync work is scoped or estimated; do not fix a number in the roadmap/requirements ahead of that audit completing.
- **Whether the orphaned `translations.stats-274.*.json` files were ever merged into the live `messages.<locale>.xlf` files is unverified.** Handle: Phase 1's audit must explicitly trace this artifact end-to-end before crediting any stats-page translation work as already done.
- **No canonical staleness-tracking mechanism decision has been made yet** (source-hash sidecar file vs. repurposing the XLIFF `state=` attribute vs. relying purely on the drift gate's own commit-to-commit `<source>`-text diff). Handle: PITFALLS.md recommends this be an explicit, written decision made once during the CI drift-gate design phase (Phase 4), not something implicitly decided by whatever the first implementation happens to do -- and if the gate diffs only against the immediately-prior commit rather than a fixed baseline, it may miss already-accumulated-but-uncaught drift that predates the gate's own launch.
- **Whether "orphaned" (id present in a locale file but absent from current `messages.xlf`) should be a hard-fail or warning-only condition in the new gate is a judgment call, not yet settled.** STACK.md recommends warning-only (since the 54-per-locale baseline is pre-existing debt, not newly-introduced drift, and conflating the two would make the gate noisy on day one) -- this should be confirmed as an explicit design decision during Phase 4 planning, not assumed.

## Sources

### Primary (HIGH confidence)
- Direct repository inspection across all four research files: `showcase/angular/src/locale/messages.xlf` + `messages.{es,de,ja,zh-CN,zh-TW}.xlf` (parsed directly to confirm 5-drifted/54-orphaned baseline), `showcase/angular/package.json`, `showcase/angular/angular.json`, `showcase/angular/scripts/verify-locale-sync.mjs`, `showcase/angular/scripts/verify-hreflang.mjs`, `showcase/angular/scripts/assemble-xliff-target.mjs`, `showcase/angular/eslint.config.js`, `showcase/angular/src/locale/DO-NOT-TRANSLATE.md`, `showcase/server/server.js`, `showcase/server/src/middleware/accept-language.js`, `tests/server-accept-language.test.js`, `.github/workflows/ci.yml`, `.planning/PROJECT.md`, `.planning/phases/v0.9.63-INTEGRATION-CHECK.md`, git commit `6d3ad363619a731336ffb5f4480a92346339201a` (full diff, both raw git-stat and id-keyed comparison), `git log --oneline -- showcase/angular/src/locale/messages.xlf` (11+ prior pure-churn commits).
- npm registry API (`registry.npmjs.org`) -- `ng-extract-i18n-merge@3.4.0` (published 2026-06-06), `ngx-i18nsupport@0.17.1` (confirmed dead, last published 2018).
- GitHub repo metadata + raw source, `daniel-sc/ng-extract-i18n-merge` -- confirmed the exact drift-marking mechanic, actively maintained, not archived.
- `angular.dev/guide/i18n/merge` (official Angular docs, fetched directly) -- confirmed Angular's first-party i18n tooling has no built-in stale-translation detection mechanism.
- [Google Search Central -- Managing Multi-Regional and Multilingual Sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites) -- primary source, fetched directly; basis for the no-IP-geolocation, canonical/hreflang guidance.
- XLIFF 1.2 OASIS specification (`urn:oasis:names:tc:xliff:document:1.2`) -- `state`/`state-qualifier` attribute vocabulary and `<source>`/`<target>` mirroring convention.

### Secondary (MEDIUM confidence)
- Industry i18n-practice sources (Weglot, SimpleLocalize, Smashing Magazine, Smartling, Translated, Locize, Cobbai, i18nagent.ai) -- used to corroborate hreflang error-rate norms, locale-detection cookie/header precedence conventions, transcreation-vs-translation distinctions, small-team TMS-scope-inflation guidance, and text-expansion percentage figures for German/CJK. Appropriately weighted to inform only the differentiator/anti-feature tiers of FEATURES.md, not the core table-stakes scope.
- doloc.io pricing/tier claim (single search-snippet source, not independently fetched in full) -- sufficient to flag as "do not adopt this milestone" per the explicit no-paid-SaaS brief constraint; re-verify directly if a future milestone reconsiders it.
- General industry TMS "source drift"/"fuzzy-match invalidation" convention claim (Phrase, Lokalise, Crowdin) -- offered as context for why the recommended architecture pattern is an established approach, not independently verified against those vendors' specific docs in this research session.

---
*Research completed: 2026-07-07*
*Ready for roadmap: yes*
