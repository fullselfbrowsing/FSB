# Feature Research

**Domain:** Multi-locale marketing/showcase website -- ongoing i18n completeness maintenance (post-launch, not first-ship)
**Researched:** 2026-07-07
**Confidence:** HIGH (grounded in direct codebase inspection + Google's own international-SEO guidance + multiple independent i18n-tooling sources)

> Supersedes the prior v1.0.0 FEATURES.md (App Catalog / OpenTabs Parity research, archived milestone -- unrelated domain). This file is the active v1.2.0 Showcase i18n Completeness research.

## Scope Note

This is NOT a "how do we internationalize a site" research doc -- FSB's showcase already shipped i18n at v0.9.63 (7 phases, 420 trans-units, 30 prerendered HTMLs, hard-fail CI gates, Accept-Language middleware). This research answers a narrower question: **for a site that already has i18n infrastructure, what does "staying complete" look like as an ongoing maintenance discipline**, and which of the many things a team *could* do for v1.2.0 are actually load-bearing vs. gold-plating vs. actively harmful for a 6-locale marketing site of this size (420-ish trans-units, ~7 routes).

Every item below is tagged with its dependency on the existing v0.9.63 foundation -- what's already built vs. what's genuinely new work.

## Feature Landscape

### Table Stakes (Users Expect These)

Features/behaviors that, if broken, make the site feel broken or untrustworthy to a non-English visitor -- or make Google misattribute/penalize the site's international signals. These are exactly the class of bug this milestone exists to close.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Every visible string on every marketing page is genuinely translated (not just marked `i18n`) | A mixed-language page (English sentence stranded in a German page) reads as broken/untrustworthy, not "partially localized" -- users don't grade on a curve | MEDIUM | **This is the milestone's core deliverable.** Confirmed gap in current tooling (see Pitfalls note below): `i18nMissingTranslation: "error"` in `angular.json` catches an *absent* `<target>`, but nothing in the existing scripts (`verify-locale-sync.mjs`, `verify-hreflang.mjs`, `verify-bundle-budgets.mjs`) detects a `<target>` that is *present* but identical to `<source>` (a silently-failed/skipped translation) or a target with leftover English fragments. Full-page audit must check rendered output per locale, not just XLIFF structural validity. |
| Locale switcher works identically on every page, in every locale, and preserves the current route | Users expect "switch language" to feel like a toggle, not a reset-to-homepage; broken on even one page (e.g., the newly-added stats page) reads as an afterthought | LOW-MEDIUM | Depends on `LocaleService` + `LOCALE_SUBPATHS` (already built, v0.9.63). New work is verifying it against pages added in the ~1030 commits since (lattice, phantom-stream, prometheus, mobile nav rework) plus the stats page. |
| hreflang + canonical tags present, self-referencing, reciprocal, and correct on every route including new ones | Google's own guidance emphasizes hreflang correctness for international rankings; industry sources cite a high error rate on this exact failure mode across international sites (MEDIUM confidence, single-source stat, but directionally consistent with Google's documented emphasis) | LOW | `verify:hreflang` (`showcase/angular/scripts/verify-hreflang.mjs`) already exists and is CI-wired. Task is extending its route list to cover pages added since v0.9.63, not building new tooling. |
| Canonical tag on each locale variant points to *itself*, not to the English root | Google explicitly documents this exact anti-pattern: canonicals pointing all language versions at the English page tells Google to ignore every non-English variant entirely | LOW | Already implemented via `locale-seo.ts` per v0.9.63; audit-only work this milestone (confirm it holds for new routes). |
| No IP-based or hard client-redirect language guessing -- explicit signals only (Accept-Language header, URL path, cookie), never geo-IP | Google explicitly warns IP location analysis is "difficult and generally not reliable" for content adaptation (HIGH confidence -- direct from Google's own international-SEO docs, fetched and verified) | N/A (already correct) | FSB's existing implementation is Accept-Language + cookie based, not IP-based -- already aligned with best practice. Nothing new required here; noted only so nobody "fixes" this into an anti-pattern while touching the redirect code for WARNING-02. |
| Returning visitor's explicit locale choice (cookie) is honored, not silently overridden by header-sniffing on every fresh tab/shared link | This is WARNING-02. Locale-detection literature is consistent: cookie (explicit past choice) should outrank Accept-Language (implicit signal) for repeat visits | LOW-MEDIUM | Confirmed real bug, not cosmetic: current behavior lets the Accept-Language redirect middleware run before checking the `fsb-locale` cookie on bare `/`, so a user who explicitly picked (e.g.) `es` earlier gets redirected back to whatever their browser's header says on a fresh tab or shared link. Fix is a priority-ordering change in the existing Express middleware (`showcase/server/`), not new infrastructure. |
| Source-of-truth drift is caught automatically, not manually | Any team maintaining >1 locale over time (not just at launch) needs this or content silently rots -- this is the single most consistently cited maintenance failure mode across researched sources | MEDIUM | **This is the "247 trans-units drifted" bug plus the new CI gate.** `verify-locale-sync.mjs` today only diffs the *locale list* between Angular and Express config files -- it does NOT diff XLIFF trans-unit content between `messages.xlf` (source, 6,633 lines) and the 5 translated files (8,026 lines each). The new gate is genuinely new logic, not an extension of existing logic. |
| Placeholders / interpolated values (`<x id="...">`, ICU plurals, brand names wrapped in `translate="no"`) are preserved byte-identical across all 5 translated locales | A broken placeholder either crashes rendering or displays a literal `{0}` / raw XML id to the user -- worse than an untranslated string because it looks like a bug, not a missing feature | LOW (verification) / MEDIUM (fix if broken) | `DO-NOT-TRANSLATE.md` convention already exists and is well-specified (brand names, code identifiers, `<span translate="no">` wrapping, `[attr.translate]="'no'"` binding form). Audit should re-verify this holds across the 247 drifted trans-units and the stats page's separate translation format (see Anti-Feature/Pitfall below on the parallel `translations.stats-274.*.json` mechanism). |
| The stats page is genuinely folded into the same coverage bar as the rest of the marketing site (removed from `lint:i18n` ignore-pattern) | A page that's excluded from the lint gate is invisible to every future drift check -- it will silently degrade even if today's audit fixes it | LOW-MEDIUM | Confirmed: `showcase/angular/package.json`'s `lint:i18n` script currently reads `eslint "src/**/*.html" --ignore-pattern "src/app/pages/dashboard/**" --ignore-pattern "src/app/pages/stats/**"`. Removing the stats ignore-pattern is a one-line change, but only safe *after* the stats page's actual translation coverage is verified complete (currently uses ad hoc `translations.stats-274.*.json` files per locale, NOT the main `messages.xlf` pipeline -- see Pitfall). |

### Differentiators (Competitive Advantage)

Not required for "complete" -- these are things a *more* mature i18n maintenance program does, valuable but explicitly optional for a 6-locale, ~7-route marketing site at this size. Flagged so the roadmap can consciously decide to defer them rather than silently skip them.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Native-speaker (or at least bilingual-fluent) QA review pass on the 247 resynced trans-units + stats page, beyond AI-filled XLIFF | Catches the class of error automated tooling structurally cannot see: correct grammar/placeholder handling but wrong register, awkward phrasing, or a culturally off idiom. Sources consistently flag "technically correct but wrong tone" as the residual risk category machine translation can't self-detect | MEDIUM (if scoped to only the 247 drifted units + stats page, not the full 420) | v0.9.63 already used "AI-filled XLIFF" for the original 420 units with no stated native-review pass -- so this would be a *new* quality bar, not a re-application of an existing one. Reasonable differentiator to scope narrowly to the delta (247 units + stats page) rather than a full-site re-review, given the site's size. |
| Per-locale automated visual regression / screenshot diffing to catch text-expansion overflow in German or CJK line-wrapping issues | Catches UI-level bugs invisible to a string-level audit: a correctly-translated German string that's 30-40% longer than English can overflow a button or break a card layout even though the *translation itself* is perfect | MEDIUM-HIGH | Genuinely new tooling/infrastructure (no existing visual-regression harness found in the repo). For a marketing site with a small, relatively stable set of ~7 routes and a static-prerender model (not a dynamic app), a **cheaper substitute** exists: manually spot-check the 2-3 highest-risk locales (German for expansion, zh-CN/zh-TW for CJK line-wrap/no-space-between-words wrapping) on the routes with the densest copy, rather than standing up a full per-commit visual-regression pipeline. Full automation is a defensible v1.3+ candidate if the page count grows. |
| Transcreation (not literal translation) applied specifically to taglines/hero copy/CTAs, vs. literal translation for body/documentation-style copy | Marketing headlines and calls-to-action are exactly the content class where literal translation famously fails (the industry's canonical cautionary examples are always tagline-class copy, never body copy) -- HIGH confidence this distinction is real and well-established in translation industry practice | MEDIUM (as a *review criterion* applied selectively) / HIGH (if applied as a full re-transcreation of all hero/CTA copy) | Cheapest version: apply this lens only to hero headlines + primary CTAs across the 6 marketing pages (small surface, maybe 10-20 strings total) during the QA pass above, not a wholesale rewrite. FSB's brand-name-preservation convention (`DO-NOT-TRANSLATE.md`) already shows the team cares about this distinction for terms; extending the same instinct to taglines is a natural, low-cost differentiator, not a new program. |
| A lightweight "translation freshness" report (e.g., per-trans-unit "last synced" marker, surfaced somewhere reviewable) | Turns "is this locale stale?" from an ad hoc git-archaeology exercise into a one-glance check; treated as standard practice once continuous-localization tooling exists | LOW-MEDIUM | Not required for CI gating (the hard-fail drift gate below is sufficient for *blocking bad merges*), but a nice-to-have for *visibility* between audits. Could piggyback on the new drift-detection script's diff output rather than requiring separate infrastructure. |
| Formalizing the stats page's translation format into the main XLIFF pipeline (retire the ad hoc `translations.stats-274.*.json` per-locale files) | Two parallel translation mechanisms for one site (structured XLIFF for 6 routes + loose per-key JSON for stats) is exactly the kind of drift-prone fork the new CI gate is supposed to prevent -- and the JSON format isn't covered by the new drift gate unless the gate is explicitly taught about it | MEDIUM | This is architecturally the "right" fix long-term, but the milestone's stated goal is narrower ("bring the stats page into full translation and drop it from the ignore-pattern") -- it does NOT require migrating the underlying mechanism, only completing coverage under whatever mechanism is in place. Worth flagging as a differentiator/cleanup candidate for this milestone or the next, not a blocking requirement. |

### Anti-Features (Commonly Requested, Often Problematic)

Things that sound like "more thorough i18n maintenance" but are wrong-sized or actively counterproductive for a 6-locale, small-route-count marketing site in ongoing-maintenance mode.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Standing up a full commercial TMS (translator-portal workflows, string-level assignment, vendor integration) | "We should have proper localization infrastructure" instinct once a drift bug surfaces | Small-team i18n guidance is explicit that this advice is written for teams with a dedicated localization manager and large content volume; for a small team maintaining 6 languages on a marketing site, a TMS is scope-inflation that creates a second system to keep in sync with the git-based XLIFF source of truth FSB already has. The existing git + XLIFF + `ng extract-i18n` + CI-gate model IS the "simplest workflow that doesn't create problems you'll have to undo later" -- exactly what small-team guidance recommends | Extend the existing lightweight tooling (drift-detection script, `verify-locale-sync.mjs`-style CI gates) rather than replacing it with an external platform. Revisit only if locale count or content volume grows an order of magnitude. |
| Auto-translating dynamically-generated content (e.g., the stats page's live GitHub/telemetry numbers, "most popular agent" labels, timestamps) with no review, on every deploy | Feels consistent with "everything should be localized" | Numeric/live data typically doesn't need translation (numbers are numbers); auto-translating labels around live data with zero review risk is exactly the "machine translation with no human-in-the-loop for customer-facing content" pattern that quality-assurance sources flag as highest-risk -- errors compound silently because nobody re-reads auto-generated output after the first pass | Translate the *static* UI chrome around the stats page (labels, headings, units) through the normal reviewed pipeline; leave live numeric values as locale-formatted numbers (respecting locale number formatting, e.g., decimal/thousands separators) rather than routing them through a translation step at all. |
| A hard client-side or geo-IP redirect that forces a locale based on inferred location, replacing the current Accept-Language + cookie model | Feels like it would "solve" locale detection more thoroughly | Google explicitly documents IP-based content adaptation as unreliable and discourages hard auto-redirects entirely, preferring explicit signals (header/cookie/URL) with an easy manual override -- adopting IP-geolocation while fixing WARNING-02 would trade a real fix for a worse anti-pattern | Keep (and fix, not replace) the existing Accept-Language + cookie model; the WARNING-02 fix is a priority-ordering correction (cookie beats header on repeat visits), not an architecture change. |
| Full per-locale, per-commit automated visual regression testing for every route across all 6 locales | "We should never risk a layout break in any language" | For a static-prerendered marketing site with ~7 routes and infrequent content changes, a full CI-wired screenshot-diffing pipeline (browser automation + baseline management + flake tolerance) is meaningfully more infrastructure than the problem currently justifies -- it's the kind of investment that pays off at app-scale (frequent releases, many dynamic screens), not at showcase-site scale | Targeted manual spot-check of the highest-risk locale/route combinations (German expansion, CJK wrapping) as part of the audit pass; revisit full automation only if page count or release cadence grows substantially. |
| Re-deriving or renegotiating the supported-locale list (adding/dropping a locale) as part of this milestone | Comes up naturally when auditing "is our i18n complete" | Explicitly out of scope per the milestone's own framing -- the 6-locale list (en + es/de/ja/zh-CN/zh-TW) is fixed, carried over from v0.9.63's `LocaleService` + locale-constants module, "not up for debate" | N/A -- audit within the fixed 6-locale set only. |
| Translating the dashboard page as part of "closing the i18n gap" | Feels inconsistent to leave one page untranslated while auditing everything else for completeness | Explicitly and deliberately out of scope this milestone -- the dashboard is an authenticated app surface, not marketing content, and the milestone's own goal statement calls this out by name as staying excluded | Leave `--ignore-pattern "src/app/pages/dashboard/**"` in place in `lint:i18n`; this is intentional scope, not an oversight to "complete." |
| Treating "has a `<target>` element in the XLIFF" as equivalent to "genuinely translated" when building the CI drift gate | The obvious/cheap way to build a completeness check is to assert every `<trans-unit>` has a non-empty `<target>` | This exactly reproduces the bug this milestone exists to fix: `i18nMissingTranslation: "error"` already catches *absent* targets; the actual failure mode the audit uncovered is a target that *exists* but is stale/copy-of-source/drifted. A completeness gate built only on "target exists" would pass today's 247-unit drift silently | The new CI drift gate must diff trans-unit *content* (hash or text comparison) between `messages.xlf` (source) and each translated file per commit that touches source content -- not merely assert structural presence of targets. |

## Feature Dependencies

```
[Full-page audit: genuine translation vs. i18n-marked]
    |--requires--> [Existing v0.9.63 XLIFF pipeline + LocaleService] (already built)
    |--requires--> [New: content-level (not structural) verification logic]

[247 trans-unit resync across 5 locales]
    |--requires--> [Full-page audit findings] (audit identifies exact drifted units)
    |--enhances--> [New CI drift-detection gate] (resync is the one-time catch-up; gate prevents recurrence)

[Stats page full translation]
    |--requires--> [Existing DO-NOT-TRANSLATE.md conventions] (brand/code-identifier wrapping rules apply unchanged)
    |--requires--> [Decision: fold into main XLIFF pipeline OR complete under existing translations.stats-274.*.json mechanism]
    |--gates--> [Removing "src/app/pages/stats/**" from lint:i18n ignore-pattern] (must NOT flip before coverage is verified complete, or CI starts red)

[New CI drift-detection gate]
    |--requires--> [Full-page audit + 247-unit resync landed first] (gate should activate on a clean baseline, not while known drift exists)
    |--conflicts-if-built-wrong--> [Anti-feature: "target exists" as the completeness check] (must diff content, not structure)

[WARNING-02 fix: cookie beats Accept-Language header on repeat visits]
    |--requires--> [Existing Express Accept-Language middleware + fsb-locale cookie] (already built, v0.9.63)
    |--independent-of--> [Everything else in this list] (isolated priority-ordering fix in showcase/server/, no shared surface with the XLIFF/translation work)

[Native-speaker QA pass on delta] (differentiator)
    |--enhances--> [247 trans-unit resync + stats page translation]
    |--NOT required for--> [CI drift gate to function] (gate checks sync, not linguistic quality)

[Transcreation review of hero/CTA copy] (differentiator)
    |--enhances--> [Native-speaker QA pass]
    |--scoped-to--> [~10-20 tagline/CTA strings, not full 420-unit re-review]

[Per-locale visual regression testing] (differentiator, likely deferred)
    |--independent-of--> [Translation-content correctness] (catches layout bugs, not translation bugs -- orthogonal failure mode)
```

### Dependency Notes

- **CI drift gate must land AFTER the audit + resync, not before:** Building the gate first against a codebase with known 247-unit drift means either the gate is broken (passes despite real drift) or CI goes red on day one. Sequence: audit -> resync -> stats-page completion -> flip `lint:i18n` ignore-pattern -> THEN add the drift gate on a clean baseline.
- **Stats page completion gates the ignore-pattern removal, not the reverse:** Flipping `--ignore-pattern "src/app/pages/stats/**"` off before the stats page's translation coverage is actually verified complete will just turn CI red immediately (or, worse, pass falsely if the existing `translations.stats-274.*.json` mechanism isn't wired into whatever `lint:i18n`'s eslint rule actually checks -- this needs explicit verification since the stats page's translation storage format visibly differs from every other page's).
- **WARNING-02 fix is fully independent** of the translation-content work -- it lives entirely in `showcase/server/` Express middleware and touches cookie/header priority ordering, not any XLIFF or Angular i18n surface. Safe to parallelize or sequence in either order relative to the translation-content phases.
- **Differentiators enhance but do not gate the table-stakes deliverables:** none of native-speaker QA, transcreation review, or visual regression testing are prerequisites for the CI drift gate, the resync, or the stats-page completion to be considered "done." They're additive quality investments layered on top, appropriate to schedule as stretch goals within this milestone or explicitly deferred.

## MVP Definition

### Launch With (v1.2.0 -- this milestone)

Minimum to close the reopened gap and prevent recurrence -- everything in Table Stakes above.

- [ ] Full-page translation audit across all current marketing routes (lattice, phantom-stream, prometheus, home, mobile nav, plus original 6) -- verifies genuine translation, not just `i18n`-attribute presence
- [ ] Resync of the 247 drifted trans-units across es/de/ja/zh-CN/zh-TW
- [ ] Stats page brought to full translation coverage; `--ignore-pattern "src/app/pages/stats/**"` removed from `lint:i18n`
- [ ] WARNING-02 fixed: cookie-set locale preference takes priority over Accept-Language header on the bare-`/` redirect
- [ ] New CI gate: fails build if `messages.xlf` source content changes without corresponding updates to all 5 translated files (content-diff based, not structural-presence based)

### Add After Validation (v1.2.x / near-term follow-up)

- [ ] Native-speaker/bilingual-fluent QA pass scoped to the 247 resynced units + stats page (not a full 420-unit re-review)
- [ ] Transcreation-lens review applied narrowly to hero headlines + primary CTAs (~10-20 strings) across the 6 marketing pages
- [ ] Targeted manual visual spot-check: German (expansion) + zh-CN/zh-TW (CJK wrapping) on the highest-copy-density routes

### Future Consideration (v1.3+ or only if scale changes)

- [ ] Full automated per-locale visual regression / screenshot-diffing pipeline -- defer unless route count or release cadence grows substantially
- [ ] Migrating the stats page off its ad hoc `translations.stats-274.*.json` mechanism into the main XLIFF pipeline -- worth doing eventually to eliminate the "two translation systems" risk, but not required to satisfy this milestone's narrower goal
- [ ] Lightweight translation-freshness/"last synced" reporting -- nice visibility layer, not required once the hard CI gate exists
- [ ] Full commercial TMS adoption -- explicitly not warranted at this locale count/content volume; revisit only if both grow an order of magnitude

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Full-page genuine-translation audit | HIGH | MEDIUM | P1 |
| 247 trans-unit resync | HIGH | MEDIUM | P1 |
| Stats page full translation + ignore-pattern removal | HIGH | LOW-MEDIUM | P1 |
| WARNING-02 cookie-priority fix | MEDIUM-HIGH | LOW-MEDIUM | P1 |
| CI drift-detection gate (content-diff based) | HIGH (prevents recurrence) | MEDIUM | P1 |
| Native-speaker QA pass on delta | MEDIUM | MEDIUM | P2 |
| Transcreation review of hero/CTA copy | MEDIUM | LOW-MEDIUM | P2 |
| Targeted visual spot-check (DE + CJK) | MEDIUM | LOW | P2 |
| Full automated visual regression pipeline | LOW-MEDIUM (at current scale) | HIGH | P3 |
| Stats-page pipeline migration/unification | LOW (cosmetic/architectural) | MEDIUM | P3 |
| Translation-freshness reporting | LOW | LOW-MEDIUM | P3 |
| Commercial TMS adoption | NEGATIVE at this scale | HIGH | Anti-feature (do not build) |

**Priority key:**
- P1: Must have to close the reopened gap and stop recurrence -- this milestone's actual scope
- P2: Should have if time allows within this milestone; otherwise clean near-term follow-up
- P3: Defer until locale count, route count, or release cadence materially changes

## Reference-Practice Analysis

Not a competitor-feature comparison in the traditional sense (this is an internal completeness audit, not a new product), but a comparison against documented industry practice for "what good ongoing i18n maintenance looks like" at comparable scale.

| Practice | Industry Norm (small/mid marketing sites) | FSB's Current State | Gap This Milestone Closes |
|----------|-------------------------------------------|----------------------|----------------------------|
| Detect source-content drift automatically | Widely cited as the #1 differentiator between sites that stay in-sync and sites that silently rot; "quarterly audits" cited as a manual fallback where no automation exists | `verify-locale-sync.mjs` exists but only checks the *locale list*, not trans-unit content | New content-diff CI gate closes this exactly |
| hreflang self-referencing + reciprocal + canonical-matching | Industry-standard checklist item; sources report a high error rate on this exact failure mode across international sites (MEDIUM confidence, single-source stat) | Already implemented and CI-gated (`verify:hreflang`) since v0.9.63 | Audit-only: extend route coverage to pages added since v0.9.63 |
| Explicit-signal locale detection, no IP-geolocation, cookie beats header on repeat visits | Google's own documented guidance; cookie/header priority ordering matches published locale-detection-strategy consensus | Correct architecture (no IP-geo), but priority-ordering bug (WARNING-02) inverts cookie/header precedence | WARNING-02 fix aligns implementation with already-correct architecture |
| Human review layered on machine translation for customer-facing/brand-voice content | Consistently recommended as risk-tiered (not blanket) -- apply to customer-facing/brand content, skip for low-risk internal content | v0.9.63 shipped "AI-filled XLIFF" with no stated native-review layer | Differentiator candidate (P2), scoped to the delta rather than a full re-review |
| Avoid TMS/tooling scope inflation at small locale/content-volume scale | Explicit small-team guidance: use the simplest workflow that doesn't create future problems | Git + XLIFF + CI-gate model already matches this recommendation | None -- confirm by NOT introducing a TMS this milestone |

## Sources

- [Google Search Central -- Managing Multi-Regional and Multilingual Sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites) -- HIGH confidence (primary source, fetched directly; explicit guidance on avoiding auto-redirects, avoiding IP-based content adaptation, canonical + hreflang usage)
- [Weglot -- The Ultimate Guide to Hreflang Tag: Best Practices for SEO](https://www.weglot.com/guides/hreflang-tag) -- MEDIUM confidence (industry practice, not primary Google doc)
- [SimpleLocalize -- Locale detection strategies: URL, Cookie, or Header?](https://simplelocalize.io/blog/posts/locale-detection-strategies/) -- MEDIUM confidence (cross-checked against Google's own guidance, consistent)
- [Smashing Magazine -- Designing A Perfect Language Selector UX](https://www.smashingmagazine.com/2022/05/designing-better-language-selector/) -- MEDIUM confidence
- [Smartling -- Six Ways Transcreation Differs from Translation](https://www.smartling.com/blog/six-ways-transcreation-differs-from-translation) -- MEDIUM confidence
- [Translated -- Transcreation vs. Translation vs. Copywriting](https://translated.com/resources/transcreation-vs-translation-vs-copywriting) -- MEDIUM confidence
- [Better i18n (dev.to) -- i18n Testing: A Practical Guide for QA Engineers](https://dev.to/anton_antonov/i18n-testing-a-practical-guide-for-qa-engineers-f7h) -- MEDIUM confidence
- [i18nagent.ai -- Text Expansion in i18n: Prevent Layout Breakage](https://i18nagent.ai/zh-Hant-TW/guides/text-expansion-testing) -- MEDIUM confidence (German ~30%/Finnish ~40% expansion figures; consistent with multiple other sources)
- [SimpleLocalize -- How to pick a translation workflow for small teams and solo devs](https://simplelocalize.io/blog/posts/translation-workflow-small-teams/) -- MEDIUM confidence (explicit small-team/TMS-scope-inflation guidance)
- [Locize -- Missing Translations in i18next: Fallbacks, Detection & Fixes](https://www.locize.com/blog/missing-translations) -- MEDIUM confidence (build-time vs. runtime detection distinction; cross-checked against Angular's own `i18nMissingTranslation` behavior)
- [Locize -- What is a Translation Management System (TMS)?](https://www.locize.com/blog/tms) -- MEDIUM confidence
- [Cobbai -- Quality at Scale: Best Practices for MT and Human-in-the-Loop Translation Workflows](https://cobbai.com/blog/translation-quality-support) -- MEDIUM confidence (risk-tiering of human review by content class)
- Direct codebase inspection (`showcase/angular/package.json`, `showcase/angular/angular.json`, `showcase/angular/scripts/verify-locale-sync.mjs`, `showcase/angular/src/locale/DO-NOT-TRANSLATE.md`, `showcase/angular/src/app/core/i18n/locale-constants.ts`, `showcase/angular/src/locale/translations.stats-274.*.json`, git log for commit `6d3ad363`) -- HIGH confidence (primary source, ground truth for what's actually built vs. what needs building)

---
*Feature research for: multi-locale marketing/showcase site, ongoing i18n completeness maintenance*
*Researched: 2026-07-07*
