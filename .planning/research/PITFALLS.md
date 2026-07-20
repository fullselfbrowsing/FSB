# Pitfalls Research

**Domain:** Closing an existing i18n completeness gap on a shipped, multi-locale Angular XLIFF site (reopened debt, not greenfield)
**Researched:** 2026-07-07
**Confidence:** HIGH (all findings grounded in direct repo inspection: actual diff of commit `6d3ad363`, actual CI workflow, actual eslint config, actual `verify-locale-sync.mjs` / `assemble-xliff-target.mjs` source, actual `angular.json` i18n block, and 11 prior commits showing the historical "safe" version of this pattern)

## Critical Pitfalls

### Pitfall 1: Treating "247 trans-units changed" as "247 translations need redoing"

**What goes wrong:**
The commit that reopened this milestone (`6d3ad363`, "chore(i18n): sync messages.xlf with showcase copy refinements") touched 247 `<trans-unit>` blocks in `messages.xlf`. Direct diff analysis shows **only 5 of those 247 blocks have an actual `<source>` text change** (`agents.meta.description`, `agents.schema.software.description`, `home.meta.description`, `support.faq.q.tools.a`, `support.schema.faq.tools.a`). The other **242 blocks changed only in `<context-group><context context-type="linenumber">`** — i.e. line numbers shifted because unrelated template edits (new markup, reordered elements) moved existing `i18n`-marked strings to different lines. `ng extract-i18n` regenerates location metadata for every trans-unit in the file on every run, so a single unrelated one-line template edit anywhere in the app can touch dozens of `context-group` blocks with zero copy impact.

**Why it happens:**
`ng extract-i18n` writes absolute line numbers into `<context-group>` blocks, and it re-walks the *entire* template tree on every extraction, not just the file that changed. A diff tool (or a human skimming `git diff --stat`) sees "247 lines changed" and reasonably assumes 247 units of translation work, when the true content-change count is off by ~50x. This repo has a documented history of exactly this shape of *harmless* commit — `e83cacad`, `652f02ab`, `ede446a0`, `65236ddb`, `3929e9d2`, `f3f8b756`, `9c97c70d`, and others are all prior "regenerate `messages.xlf` to match template line-number shifts" commits with **zero corresponding locale-file updates**, and none of them were bugs — because none of them changed any `<source>` text. Commit `6d3ad363` broke the streak by burying 5 real content edits inside what looked like (and mostly was) routine churn, and the team's learned pattern-match ("`messages.xlf`-only commit = safe, no locale files needed") fired incorrectly on this one instance.

**How to avoid:**
- Any resync/audit step in this milestone MUST diff `<source>` text content specifically (not line count, not byte count, not `<context-group>` metadata) between the current `messages.xlf` and the last-known-good `messages.xlf` per translated locale, to find the true ~5-and-growing set of stale trans-unit IDs. A one-off script comparing `<trans-unit id>` -> `<source>` text pairs (ignoring `<context-group>`) across the git history of `messages.xlf` is the correct tool, not `git diff --stat`.
- The new CI drift gate (target of this milestone) MUST diff on `<source>` **text content per `id`**, never on whole-file byte diff or trans-unit-count diff. A byte-diff gate would have failed (correctly, but unhelpfully) on all 11 prior pure-line-shift commits, training the team to treat gate failures as noise to bypass — which is precisely the failure mode to avoid (see Pitfall 6).
- Re-verify the "247" number is stale the moment any other unrelated template PR merges before this milestone starts — the real count drifts every time any showcase template changes, even for unrelated work.

**Warning signs:**
- A resync PR that shows large uniform diffs across all 5 locale `.xlf` files with no meaningful change in the actual translated `<target>` text — a sign the script/human touched `<context-group>` metadata instead of (or in addition to) verifying `<source>`-vs-`<target>` staleness.
- Effort estimates ("we need to re-translate 247 strings") that are wildly out of proportion to the actual diff — always re-derive the real count from `<source>`-only diffing before scoping the resync phase.

**Phase to address:**
Audit/resync phase (first phase of this milestone) — must start with a `<source>`-text-only diff script (not `git diff`) to establish the true stale-ID set before any translation work is commissioned.

---

### Pitfall 2: `i18n` attribute presence in a template is treated as proof of a correct, current translation

**What goes wrong:**
The existing `lint:i18n` gate is `@angular-eslint/template/i18n` with `checkId`/`checkText`/`checkAttributes` — it verifies that every user-facing string and listed attribute in a `.html` template carries an `i18n` / `i18n-*` marker. It says **nothing about the 5 translated locale `.xlf` files**: not whether a `<trans-unit>` with a matching `id` exists in each of `messages.es.xlf` / `.de.xlf` / `.ja.xlf` / `.zh-CN.xlf` / `.zh-TW.xlf`, not whether the `<target>` text is a real translation vs. a placeholder, and critically **not whether the `<target>` is still faithful to the current `<source>`**. A page can pass `lint:i18n` cleanly while every one of its translations is stale, wrong, or a copy-paste of the English source. This is the exact false-confidence trap the milestone must avoid repeating.
Separately, `i18nMissingTranslation: "error"` in `angular.json` (the Angular build-time gate) only fails the build if a trans-unit ID referenced by a template is **entirely absent** from a locale file — a translation that exists but is now stale/wrong relative to a changed `<source>` satisfies the builder with zero warning, because Angular has no concept of "this target no longer matches this source" at build time.

**Why it happens:**
Angular's i18n tooling (both the eslint template rule and the build-time `i18nMissingTranslation` flag) was designed to catch **coverage** gaps (untranslated/missing strings), not **staleness** gaps (translated-but-now-wrong strings). Every existing CI gate in this repo (`lint:i18n`, `verify-locale-sync.mjs`, the `ng extract-i18n --output-path ... | diff` step, `verify:hreflang`) checks a different axis of "does this look complete," and none of the four checks translation *content correctness or currency*. It is easy to audit a page, see `i18n="@@foo.bar"` on every element, see the page render in Spanish/German/Japanese without console errors, and conclude "this page is translated" — without ever comparing the *meaning* of the current English `<source>` against the *current* `<target>` in each locale file.

**How to avoid:**
- The full-page audit (this milestone's Target Feature 1) must explicitly separate two checks per string: (a) "is there an `i18n` marker + a `<trans-unit>` with a `<target>` in every locale" (coverage — what today's tooling already checks) and (b) "does that `<target>` still correspond to the *current* `<source>` text" (currency — what today's tooling does NOT check). Only (b) proves the translation is genuinely up to date.
- Build the currency check as a scripted `<source>`-text-fingerprint comparison (e.g., hash the `<source>` at time of last known-good translation vs. hash of current `<source>`, per `id`, per locale file) rather than a manual "spot check a few strings" pass — manual spot-checks will not catch every stale ID across ~940+ trans-units x 5 locales.
- Explicitly do NOT accept "renders without error in all locales" or "eslint passes" as evidence of translation currency during the audit — both are necessary but insufficient signals.

**Warning signs:**
- An audit report that lists pages as "done" based solely on `lint:i18n` passing or the page rendering visually in each locale, with no `<source>`-vs-`<target>` text comparison performed.
- Any claim that "the stats page just needs to come off the ignore-pattern list" without first checking whether its `stats.*` trans-units in the 5 locale files are current AND whether the orphaned `translations.stats-274.{locale}.json` artifacts (see Pitfall 4) were ever actually merged in.

**Phase to address:**
Full-page audit phase — must produce, for every showcase page, a per-locale per-trans-unit currency verdict (not just a coverage verdict) before the resync phase begins.

---

### Pitfall 3: The `state="translated"` XLIFF attribute is present but never used as a staleness signal, so it's easy to assume it means "verified current"

**What goes wrong:**
Every `<target>` element in the 5 translated locale files (verified: 996 occurrences in `messages.es.xlf` alone) carries `state="translated"`. In the XLIFF 1.2 spec, `state="translated"` means only "a translation exists for this unit" — it is set once at translation time and is **never automatically flipped** by Angular's tooling (extraction, build, or otherwise) to `needs-review-translation` or `needs-translation` when the corresponding `<source>` subsequently changes. Nothing in this repo's tooling reads or writes this attribute as a drift signal. A reviewer or future audit script that sees `state="translated"` on every single trans-unit in all 5 locale files could easily (and wrongly) read that as "confirmed current" rather than "a translation was assigned at some point in the past, possibly against different English source text."

**Why it happens:**
`assemble-xliff-target.mjs` (the tool that produces each `messages.<locale>.xlf`) hardcodes `state="translated"` on every `<target>` it writes, with no state-machine logic for source-changed-since-translation. Angular's own build pipeline doesn't consume or validate this attribute either — it only checks for the `<target>`'s *existence*. So the attribute exists structurally (it's part of the XLIFF schema Angular emits) but carries zero semantic weight in this codebase's actual workflow, making it a plausible-looking but false signal of currency.

**How to avoid:**
- Do NOT rely on `state="translated"` (or its absence) as evidence of translation currency in the audit — it is currently meaningless in this repo's pipeline (always the same value, written unconditionally).
- If the new CI gate or resync tooling wants a persistent "last verified against source hash X" signal, that needs to be a **new** field/mechanism this milestone introduces (e.g., a stamp file mapping `id` -> `source`-text-hash-at-last-verification per locale, checked into the repo alongside the locale files) — not a repurposing of the existing always-`"translated"` XLIFF `state` attribute, since retrofitting real semantics onto that attribute would require rewriting `assemble-xliff-target.mjs`'s state logic and is a larger, riskier change than a sidecar tracking file.
- If the milestone *does* choose to start using `state="needs-review-translation"` as the drift signal (the more "correct" XLIFF-native approach), that decision must be made explicitly and the assembly script + CI gate updated together — not partially, or the two will disagree about what "stale" means.

**Warning signs:**
- Any CI gate design or audit heuristic that checks `state=` values in the locale `.xlf` files and treats `state="translated"` as a pass condition — today that's true of 100% of trans-units regardless of actual currency, so it would never fire.

**Phase to address:**
CI drift-gate design phase — must pick one canonical staleness signal (source-hash sidecar file is lower-risk than repurposing XLIFF `state=`) and use it consistently across the resync verification and the new CI gate.

---

### Pitfall 4: Orphaned "already translated" artifacts create false completeness signals during the audit

**What goes wrong:**
`showcase/angular/src/locale/` already contains `translations.stats-274.{de,es,ja,zh-CN,zh-TW}.json` files — per-locale JSON translation maps for a `SHOWCASE_STATS_FSB_*` trans-unit prefix, produced during a prior "Phase 274" stats-page work item, each carrying a `_comment` documenting brand-name preservation rules. These are a **different, disjoint ID namespace** from the `stats.*` prefix already present in the 40 existing `stats.*` trans-units inside `messages.xlf`. It is not verified whether these JSON files were ever run through `assemble-xliff-target.mjs` / `merge-and-assemble-274.mjs` and merged into the live `messages.<locale>.xlf` files, or whether they are stranded artifacts from an incomplete prior attempt. An auditor who finds these files could reasonably (and wrongly) conclude "the stats page already has translations ready to go, just flip the ignore-pattern" without checking whether those translations ever made it into the actual locale files the build consumes, or whether the `stats.*` namespace (already in the live XLF) duplicates/conflicts with the `SHOWCASE_STATS_FSB_*` namespace (only in the orphaned JSON).
More generally: on a project with this much accumulated debt, expect other half-finished artifacts (scratch translation JSONs, one-off merge scripts, prior draft XLF files) that look like progress but were never wired into the build.

**Why it happens:**
The translation pipeline in this repo is manual and script-driven (`extract-translation-skeleton.mjs` -> external AI/human translation -> `assemble-xliff-target.mjs` or `merge-and-assemble-274.mjs` -> commit the regenerated `messages.<locale>.xlf`), with no single command that does the whole round-trip atomically and no CI check verifying that every `translations.*.json` file in the locale directory has actually been consumed. It is entirely possible to generate translation JSON, get interrupted (a milestone boundary, a pivot), and leave the JSON sitting in the repo unconsumed indefinitely — exactly matching the `dashboard`/`stats` deferred-debt pattern already seen twice in this project's history.

**How to avoid:**
- Before scoping the stats-page translation work, explicitly check: (a) do the `stats.*` IDs already in `messages.xlf` cover everything the stats page template currently marks with `i18n`, or is the template now using `SHOWCASE_STATS_FSB_*` IDs that were extracted later and never merged? (b) are the `translations.stats-274.*.json` values actually reflected in the current `messages.<locale>.xlf` `<target>` text for those specific IDs, or are they still sitting unmerged?
- Treat every "already translated" artifact found during the audit as **unverified** until traced end-to-end into the live `messages.<locale>.xlf` files that the Angular build actually consumes at `angular.json`'s `i18n.locales` paths — artifacts elsewhere in the tree (JSON maps, scratch files) are not proof of shipped translation.
- Once the stats page is fully resolved this milestone, consider whether the orphaned JSON files should be deleted (if superseded) or documented as the canonical source for those specific IDs, to prevent a third stranded-artifact discovery in a future milestone.

**Warning signs:**
- Any audit conclusion that a page/namespace is "already translated, just needs the ignore-pattern dropped" based on finding translation-shaped files anywhere in `src/locale/`, without confirming those exact strings appear as `<target>` in the live `messages.<locale>.xlf`.
- Trans-unit ID namespace mismatches between what a template currently marks (post-refactor IDs) and what old translation artifacts cover (pre-refactor IDs) — a silent gap that "the files exist" audits will miss.

**Phase to address:**
Full-page audit phase, specifically the stats-page sub-scope — verify live-XLF coverage by ID before assuming any pre-existing JSON artifact represents completed work.

---

### Pitfall 5: A CI drift gate that fires on `messages.xlf` file changes (not `<source>` text changes) will chronically false-positive on legitimate churn and get bypassed

**What goes wrong:**
Given Pitfall 1's evidence (242 of 247 changed trans-units in the triggering commit were pure line-number churn, and 11 prior commits in this repo's history were 100% pure churn with zero content change), a CI gate defined as "fail the build if `messages.xlf` changes without all 5 locale files changing in the same commit/PR" will fire on essentially every PR that touches any showcase template, even when zero translatable copy changed. This is the downstream_consumer's named risk ("a gate so strict it blocks legitimate small English copy tweaks, or so loose it never fires") materializing in its strict form. A gate that fires on every trivial refactor trains engineers to either (a) always touch all 5 locale files cosmetically to satisfy the gate (defeating its purpose — a rubber-stamp commit doesn't mean anyone verified/updated the actual translation), or (b) add a bypass/override habit, which is exactly how WARNING-02 and the dashboard exclusion have survived 6+ milestones already — this project has a demonstrated pattern of long-lived "we'll fix it later" carve-outs once a gate becomes annoying enough to route around.

**Why it happens:**
It is much easier to implement a gate as a coarse "did file X change without file Y changing" check than to implement true per-trans-unit `<source>`-text diffing. The coarse version is a natural first design, especially under time pressure, but this specific repo's `ng extract-i18n` behavior (rewriting `<context-group>` line numbers on every single trans-unit for any unrelated template edit) makes the coarse version fail almost immediately in practice — not a hypothetical edge case, but the *normal* case for this codebase given how frequently showcase templates change.

**How to avoid:**
- Design the CI gate to diff **only `<source>` text per trans-unit `id`**, ignoring `<context-group>`/line-number/attribute-order churn entirely. Concretely: for each `id` present in both the base and head `messages.xlf`, compare the `<source>...</source>` inner text (and inline `<x id=.../>` placeholder structure, since a placeholder reorder is also a real semantic change) — only IDs where this text differs are "real" drift candidates.
- Once real per-ID drift is detected, the gate should check that each of the 5 locale files has a **correspondingly updated** `<target>` for that specific `id` (via the source-hash-sidecar approach from Pitfall 3, or equivalent) — not merely "the locale file changed at all" (a locale file could change for unrelated IDs and still miss the one that actually drifted).
- New trans-unit `id`s (a string added for the first time) need the same treatment as changed ones — the gate must also catch "brand-new English string with `i18n` marker, but no corresponding `<target>` was ever assembled into the 5 locale files," not just "existing string whose meaning changed." (This is the coverage-gap side of the gate, complementary to the currency-gap side.)
- Pilot the gate against this repo's own git history (the 11 prior pure-churn commits + `6d3ad363` itself) before merging it — if it doesn't correctly stay silent on all 11 pure-churn commits and correctly fire on `6d3ad363`'s 5 real changes, the design is wrong. This is a uniquely available, free regression-test corpus for this exact gate.

**Warning signs:**
- Gate implementation PR review that doesn't include a "ran against N historical commits, X true positives, Y false positives" validation table.
- Any showcase-template-only PR (no locale-file changes intended) failing the new gate in its first few weeks of operation — that's the gate mis-firing on churn, not real drift, and needs to be caught before it trains the team to distrust/route around it the way WARNING-02 was routed around.
- A gate bypass label, `--no-verify`, or "skip i18n check" annotation appearing in any PR within the first month post-launch — early warning that the gate is already being treated as noise.

**Phase to address:**
CI drift-gate phase (the "New CI drift-detection gate" target feature) — must be built and back-tested against this repo's actual commit history (both the 11 clean-churn commits and the one dirty `6d3ad363` commit) before being wired into `.github/workflows/ci.yml`'s `website` job as a hard-fail step, matching the existing pattern used by `verify-locale-sync.mjs` and the `ng extract-i18n | diff` step.

---

### Pitfall 6: Normalization of deviance — "we'll fix it in the next milestone" carve-outs have a proven multi-milestone half-life in this exact project

**What goes wrong:**
This project has direct, repeated evidence that scope explicitly deferred as "coming in the next milestone" does not come back on schedule: WARNING-02 (locale-cookie short-circuit on the bare-`/` Accept-Language redirect) was deferred at v0.9.63 (shipped 2026-05-13) as a "v0.9.64+ UX revisit" candidate, and has now been carried, unfixed, across v0.9.69, v0.10.0 (attempt-1 and attempt-2), v0.11.0, v0.12.0, v1.0.0, and v1.1.0 — six-plus milestones and roughly two months of shipping cadence — before finally being picked up in v1.2.0. Similarly, the dashboard page was excluded from `lint:i18n` at v0.9.63 with an explicit "v0.9.65" target that never shipped as a milestone at all; a second page (`stats`) has since been added to that same permanent-feeling ignore-pattern list. A milestone that "closes" this i18n gap by fixing the currently-known issues but leaving any *new* carve-out (e.g., "we'll get to the newly-discovered X in the next milestone") risks reproducing the exact same multi-milestone-limbo pattern this milestone was created to fix.

**Why it happens:**
Deferred debt with no forcing function (no failing CI check, no blocking gate, just a line item in a planning doc) reliably loses priority to whatever the *next* milestone's headline feature is — and headline features keep arriving faster than backlog items get promoted. The `lint:i18n` ignore-pattern is a uniquely dangerous mechanism here because it is *itself* a silence mechanism: once a page is on the ignore list, the CI system that would otherwise nag about missing `i18n` markers goes quiet on that surface, removing the visibility that might otherwise prompt someone to revisit it. The same applies to WARNING-02: as a "closeout caveat" living in prose inside `PROJECT.md` rather than as a failing test or gate, there was no mechanical pressure forcing it back onto anyone's plate.

**How to avoid:**
- Any residual gap this milestone chooses NOT to close (if one is found) should not be recorded as prose-only deferred debt. At minimum, add a lightweight automated check (even a soft warning, or a dated TODO with a script that fails after N days/milestones) so the gap has some mechanical visibility rather than relying purely on someone remembering to read old milestone notes.
- Specifically for the ignore-pattern mechanism: once `stats` (and previously `dashboard`) is fully translated and removed from `--ignore-pattern` in `lint:i18n`, do not add any *new* page to that ignore list without an explicit, tracked, time-boxed justification — the ignore-pattern has now demonstrated it can silently absorb debt for 14+ months of project history (dashboard since v0.9.63, stats added at some point after) with no automatic re-surfacing.
- Given the milestone explicitly reaffirms "dashboard stays excluded -- app surface, not marketing content, out of scope for this milestone," make sure that decision is captured as an explicit, permanent architectural boundary (dashboard is genuinely a different content class, not marketing copy) rather than another "deferred, will revisit" placeholder — otherwise this milestone risks becoming milestone #7 in the WARNING-02-style limbo pattern, just for a different item.

**Warning signs:**
- Any closeout note for this milestone that reads like "X remains deferred to a future milestone" without an accompanying automated check, test, or CI gate that will make X visible again on its own.
- A `lint:i18n` ignore-pattern list that grows a third entry in some future milestone without an explicit, reviewed justification distinguishing it from "marketing content we just haven't gotten to yet."

**Phase to address:**
Milestone closeout/audit phase — the milestone audit should explicitly check whether any newly-identified-but-unaddressed item is captured with a mechanical forcing function (test, CI gate, or dated tripwire) rather than prose-only deferral, given this project's demonstrated multi-milestone deferral pattern.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems, specific to this resync/gate effort.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Resyncing only the ~5 real content changes found in `6d3ad363` and skipping a full re-verification of all ~940 trans-units across 5 locales | Much faster turnaround | Any *other* pre-existing stale translation (from an earlier, unnoticed churn-plus-content commit) stays hidden — the milestone's stated goal is "full, drift-free coverage," which a scoped-to-one-commit fix does not achieve | Never, given the milestone's explicit stated goal is full completeness, not just fixing the one known commit |
| Wiring the new CI gate as a whole-file byte/line diff instead of per-ID `<source>`-text diff | Ships in hours instead of days | Chronic false positives (Pitfall 5) that train bypass habits within weeks, given this repo's demonstrated churn rate | Never for the permanent gate; acceptable only as a very short-lived placeholder explicitly labeled "temporary, coarse, to be replaced" with a tracked follow-up |
| Machine-translating the 5 (or more) drifted strings without human/native-speaker review, matching whatever process produced the original v0.9.63 AI-filled XLIFFs | Fast, no new tooling needed | Risk of subtly wrong brand/product terminology (e.g., the real diff shows nuanced positioning language changes like "polished OpenClaw skill and 66 MCP tools" -> "skill plus 66 MCP tools" and a full home-meta-description rewrite — these are marketing-voice changes, not mechanical substitutions, and deserve the same quality bar as the original translation pass) | Acceptable only if v0.9.63 already established AI-filled XLIFFs as the accepted quality bar for this project (verify against `.planning/milestones/v0.9.63-*` before assuming) |
| Leaving `translations.stats-274.*.json` in the repo unresolved (neither merged nor deleted) after this milestone ships | Avoids a decision this milestone doesn't strictly require | Sets up a third stranded-artifact discovery in some future milestone, identical in shape to Pitfall 4 | Never — resolve one way or the other (merge or delete) as part of closing the stats-page scope |
| Treating `state="translated"` as sufficient and not introducing any new staleness-tracking mechanism | No new file/schema to design | The new CI gate has no persistent memory of "which source-hash was this translation last verified against," forcing it to always compare against the immediately-prior commit only — which fails to catch drift that accumulated silently over multiple untracked commits before the gate existed | Only acceptable if the gate's first version explicitly diffs against the CI-gate's own launch-commit `messages.xlf` snapshot (a fixed baseline) rather than "previous commit," to avoid missing already-accumulated-but-uncaught drift |

## Integration Gotchas

Common mistakes when connecting the new gate/resync work to this repo's existing i18n tooling.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `ng extract-i18n --output-path ... | diff` (existing CI-02 gate) | Assuming this gate already catches source/locale drift because it's "the i18n CI check" — it only verifies that `messages.xlf` (the English source file) matches what the current templates would extract; it has no visibility into the 5 translated locale files at all | Keep CI-02 as-is (it correctly guards against stale English source vs. templates) and add the new drift gate as an *additional*, separate step that specifically compares `messages.xlf` against the 5 `messages.<locale>.xlf` files — don't try to fold drift detection into CI-02, which serves a different, narrower purpose |
| `verify-locale-sync.mjs` (existing locale-registry gate) | Assuming this script's name implies it checks translation content sync — it only asserts that the `LOCALES` array literal is textually identical between `locale-constants.ts` and `locale-constants.js` (Angular vs. Express locale *list* parity), nothing about `.xlf` content | Do not extend this script's scope to cover translation-content drift; build the new gate as a separate script (e.g., `verify-locale-content-sync.mjs`) so each gate keeps one clear, narrow responsibility, matching this repo's existing pattern of one script per concern |
| `lint:i18n` (`@angular-eslint/template/i18n`) | Assuming adding `stats/**` removal from the ignore-pattern automatically means the stats page's translations are also current — the eslint rule only checks that templates carry markers, it doesn't touch the locale `.xlf` files at all | Sequence the work so the stats page's actual translations (in all 5 locale files) are verified current *before* dropping it from the ignore-pattern, otherwise the ignore-pattern removal is cosmetic and the eslint gate will pass regardless of whether the translations are real |
| `assemble-xliff-target.mjs` / `merge-and-assemble-274.mjs` (manual translation-merge tools) | Running these tools without first confirming they still handle every current `<x id=.../>` inline-placeholder shape correctly — the tool does a source-XLIFF-body regex walk and injects `<target>` after `</source>`; if the current `messages.xlf`'s placeholder structure for a given ID has changed (e.g., a link wrapped a different substring since the tool was last exercised), the mechanical injection could silently produce a target with placeholders that don't align 1:1 with the current source's `<x>` tags | Re-run these tools against the *current* `messages.xlf` for every resync (never reuse an old generated `messages.<locale>.xlf` as a base) and spot-check inline placeholder (`<x id="START_TAG_SPAN">` etc.) alignment between `<source>` and `<target>` for any trans-unit that had placeholder-adjacent copy changes, not just plain-text changes |
| `i18nMissingTranslation: "error"` (Angular build-time gate in `angular.json`) | Assuming a green production build after resync proves the resync is complete and correct — this flag only fails on *missing* trans-unit IDs, and will happily build successfully with every one of the 5 real changed strings still showing stale (pre-`6d3ad363`) translations, since the IDs still exist, just with outdated `<target>` text | Never use "the Angular build succeeded" as evidence of translation currency; only the new source-text-diff gate (or an equivalent manual `<source>`-vs-`<target>` review) proves currency |
| CI job ordering in `.github/workflows/ci.yml`'s `website` job | Inserting the new drift gate step in the wrong position relative to `npm --prefix showcase/angular run build` — if it runs after the build, a drift failure won't prevent a broken/stale deploy from being produced as a build artifact even if the job ultimately reports failure | Insert the new gate step alongside the other pre-build i18n checks (`verify-locale-sync.mjs`, `lint:i18n`, the `ng extract-i18n` diff step) — all currently run *before* `npm run build` in the `website` job — so a drift failure blocks the build step from even running, consistent with the existing gate ordering |

## Performance Traps

Not primarily a performance-sensitive domain for this milestone (a resync + CI gate on a moderate-size XLIFF corpus), but scale is still worth naming given the corpus size already observed.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-trans-unit `<source>`-text diff implemented as an O(n squared) nested-loop ID lookup across ~940+ trans-units x 5 locale files x every CI run | CI job for the `website` build noticeably slower after the new gate lands | Parse each XLIFF once into an `id -> sourceText` map (single pass, O(n)), then do map lookups for comparison — this is the natural approach anyway and avoids any real risk, but worth stating explicitly since a naive regex-per-ID-per-file implementation could be written accidentally | Would only become noticeable well past 940 trans-units x 5 locales (~4,700 lookups) — unlikely to bite at current scale, but avoid the O(n squared) version from the start rather than optimizing later |
| Full XLIFF file re-parse per locale on every CI run, when only `messages.xlf` (the source) typically changes | Marginal CI time increase | Not worth optimizing away — the existing `ng extract-i18n | diff` step already does a comparable full-file operation, and correctness (catching all drift) matters far more than shaving seconds off this specific check | Not currently a real threshold; flagged only for completeness |

## Security Mistakes

Not a primary security-sensitive surface for this milestone; the one relevant item concerns brand-name/URL integrity across resync.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Machine-resyncing the 5 real drifted strings without checking `DO-NOT-TRANSLATE.md` (already present in `src/locale/`) | Brand terms, product names, or functional URLs could get incorrectly translated/altered during the resync pass — this repo has direct history of a prior commit (`6ac4d210`, "chore(i18n): rewrite functional URLs in locale files, preserve attribution") specifically fixing exactly this kind of mistake | Re-check every resynced string against `DO-NOT-TRANSLATE.md`'s rules (verified in this research to already document brand/MCP-term preservation, per the stats-274 JSON `_comment` fields) before merging any new translated `<target>` text |
| Introducing a new inline `<x id=.../>` placeholder in a resynced `<source>` (e.g., the `home.hero`/`agents.meta.description` changes reference new product terms like "Hermes") without verifying the corresponding `<target>` in all 5 locales preserves the exact placeholder ID and count | A mismatched or dropped placeholder in a translated XLIFF can break Angular's i18n interpolation at build time (or silently drop the wrapped markup, e.g. a `<span translate="no">` brand wrapper) | When any resynced string contains `<x id=.../>` placeholders, verify placeholder count and IDs match exactly between `<source>` and every locale's `<target>` before considering that trans-unit resolved |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|------------------|
| Fixing WARNING-02 (cookie short-circuit on bare-`/` Accept-Language redirect) without re-testing interaction with the *other* 4 CI-verified i18n surfaces (prerendered per-locale HTML with hreflang/canonical fan-out, verified by `verify:hreflang`) | A redirect-logic change could alter which locale's prerendered HTML a bot/crawler or fresh visitor lands on first, potentially disturbing the hreflang fan-out assumptions `verify:hreflang` was built to check | Re-run `verify:hreflang` (and ideally add a targeted regression test for the specific cookie-vs-Accept-Language interaction) as part of the WARNING-02 fix, not just a manual "the redirect now respects the cookie" smoke check |
| Resyncing translated marketing copy (the 5 real drifted strings) via literal/mechanical translation of the new English wording without re-reading it in context of the whole page's marketing narrative | A drifted string like the `home.meta.description` rewrite ("Local-first Chrome automation and MCP browser layer for AI agents, with trigger watchers, real uploads, and guarded first-party API capability calls") is a substantive repositioning of the product description, not a word-swap — a purely mechanical re-translation risks losing marketing intent/tone that a human reviewer would catch | Treat the ~5 (or more, once fully audited) real content-drift strings as requiring the same translation-quality process used for the original v0.9.63 work (whatever AI-filled + review process that was), not a lighter-weight "just patch the diff" pass |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces, specific to this milestone.

- [ ] **"messages.xlf and all 5 locale files were touched in the same PR":** Often means only line-number churn was mechanically propagated — verify the actual `<source>` text diff per trans-unit `id`, not just that all 6 files show git changes.
- [ ] **"Page X passes `lint:i18n`":** Often means every string has an `i18n` marker, not that its translations in the 5 locale files are current — verify per-ID `<source>`-vs-`<target>` currency separately.
- [ ] **"Stats page dropped from the `lint:i18n` ignore-pattern":** Often means the eslint gate alone was satisfied — verify the `stats.*` (and/or `SHOWCASE_STATS_FSB_*`, see Pitfall 4) trans-units actually have current, non-placeholder `<target>` text in all 5 `messages.<locale>.xlf` files, and that the orphaned `translations.stats-274.*.json` files were either merged or deliberately superseded/removed.
- [ ] **"Angular production build succeeds with `i18nMissingTranslation: error`":** Often means every referenced ID exists somewhere in each locale file — verify it does NOT mean those existing translations are current against today's `<source>`.
- [ ] **"New CI drift gate added to `.github/workflows/ci.yml`":** Often means a coarse file-changed check was wired in — verify it specifically diffs `<source>` text per trans-unit `id` (ignoring `<context-group>`/line-number churn) and back-test it against this repo's own commit history (the 11 prior pure-churn commits plus `6d3ad363`) before trusting it in production.
- [ ] **"WARNING-02 fixed: cookie now respected on bare-`/` redirect":** Often means the happy-path (cookie present, matches a supported locale) was verified — check the edge cases too: cookie present but set to an unsupported/stale locale value, cookie present alongside a conflicting `Accept-Language` header, and interaction with bot/crawler user agents (which the original Accept-Language middleware was explicitly built to treat specially, per the v0.9.63 "bot-safe" requirement).

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| New CI gate ships too strict and starts blocking unrelated legitimate PRs on false-positive drift | LOW | Gate is newly added and isolated (a single CI step) — revert to warning-only (non-blocking) mode for a short window, collect false-positive examples from real PRs, tighten the `<source>`-text-diff logic (e.g., exclude context-group-only diffs, which should already be excluded by design per Pitfall 5's prevention — a false-positive here signals the implementation didn't correctly ignore line-number churn) |
| Audit discovers additional real content drift beyond the known 5 strings (likely, since the audit is meant to be comprehensive, not scoped to one commit) | MEDIUM | Extend the resync phase's scope to cover the newly-discovered set before closing the milestone — do not ship the milestone claiming "drift-free coverage" while known additional drift remains unaddressed (directly ties to Pitfall 6's normalization-of-deviance risk) |
| Orphaned `translations.stats-274.*.json` turn out to conflict with (rather than complement) the existing `stats.*` namespace already in `messages.xlf` | MEDIUM | Treat as a namespace consolidation task: decide canonical IDs for the stats page's strings, regenerate `messages.xlf` via `ng extract-i18n` against the current stats template, then re-run the assembly tooling fresh against the current source rather than trying to reconcile two divergent translation sets by hand |
| A resynced translation later turns out to have mistranslated a brand/product term missed during `DO-NOT-TRANSLATE.md` review | LOW | Single targeted fix commit updating just that trans-unit's `<target>` in the affected locale file(s) — the XLIFF format's per-ID structure makes surgical fixes cheap once found; the harder problem is *finding* it, which argues for a `DO-NOT-TRANSLATE.md` term-list automated grep check as part of the resync verification, not just manual review |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|---------------|
| Pitfall 1 (247 != 247 real changes) | Audit/resync phase (start) | A `<source>`-text-only diff script run first, producing the true stale-ID count, before any translation work is commissioned or estimated |
| Pitfall 2 (i18n-marker presence != currency) | Full-page audit phase | Audit output includes a per-page, per-locale, per-trans-unit currency verdict (not just a coverage verdict), distinct from what `lint:i18n` already reports |
| Pitfall 3 (unused `state=` attribute) | CI drift-gate design phase | Explicit written decision on the staleness-tracking mechanism (source-hash sidecar vs. repurposed XLIFF `state=`) documented before the gate is implemented, not decided implicitly by whatever the first implementation happens to do |
| Pitfall 4 (orphaned stats-274 JSON artifacts) | Full-page audit phase, stats-page sub-scope | Explicit trace of `translations.stats-274.*.json` -> live `messages.<locale>.xlf` `<target>` content, resolved (merged or deleted) before the stats page is dropped from `lint:i18n`'s ignore-pattern |
| Pitfall 5 (coarse gate false-positives) | CI drift-gate phase | Gate back-tested against the 11 known pure-churn commits (expect: silent) and `6d3ad363` (expect: fires on exactly the 5 real IDs) before merging into `.github/workflows/ci.yml` |
| Pitfall 6 (normalization of deviance / multi-milestone deferral) | Milestone closeout/audit phase | Closeout audit explicitly checks that any remaining known gap has a mechanical forcing function (CI check, failing test, or dated tripwire), not prose-only deferral, given this project's demonstrated pattern |

## Sources

- Direct repository inspection (all findings HIGH confidence, grounded in actual source, not general i18n advice):
  - `git show 6d3ad363` (full diff of the triggering drift commit) — 247 trans-units touched, 5 with real `<source>` changes, 242 with only `<context-group>` linenumber churn
  - `git log --oneline -- showcase/angular/src/locale/messages.xlf` — 11+ prior "messages.xlf-only, pure line-shift" commits establishing the historical "safe" pattern this milestone's triggering commit broke
  - `showcase/angular/package.json` (`lint:i18n` script) — confirms both `dashboard/**` and `stats/**` are currently ignore-patterned
  - `showcase/angular/eslint.config.js` — confirms `@angular-eslint/template/i18n` scope (checkId/checkText/checkAttributes; marker-presence only, no translation-content verification)
  - `showcase/angular/angular.json` — confirms `i18nMissingTranslation: "error"` / `i18nDuplicateTranslation: "error"` build flags (presence-only, not currency) and the 5-locale `i18n.locales` registry
  - `showcase/angular/scripts/verify-locale-sync.mjs` — confirms this script checks only `LOCALES` array-literal parity between Angular/Express, not translation content
  - `showcase/angular/scripts/assemble-xliff-target.mjs` — confirms the manual, ID-keyed, regex-based translation-merge mechanism and its unconditional `state="translated"` write
  - `.github/workflows/ci.yml` (`website` job) — confirms the 4 existing i18n-adjacent CI gates and their ordering (all pre-build)
  - `showcase/angular/src/locale/` directory listing — confirms `messages.xlf` + 5 locale `.xlf` files + `DO-NOT-TRANSLATE.md` + orphaned `translations.stats-274.*.json` artifacts
  - `.planning/PROJECT.md` — v1.2.0 current-milestone section and v0.9.63/v0.9.69/v0.10.0-attempt-1 previous-milestone sections, establishing the WARNING-02 and dashboard-i18n multi-milestone deferral timeline

---
*Pitfalls research for: closing a reopened i18n completeness gap + building CI drift-detection on an existing multi-locale Angular XLIFF showcase site*
*Researched: 2026-07-07*
