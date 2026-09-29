# Architecture Research: v1.2.0 Showcase i18n Completeness

**Domain:** Angular-i18n translation-completeness verification + drift detection, integrated into an existing Express-prerender showcase pipeline
**Milestone:** v1.2.0 Showcase i18n Completeness — SUBSEQUENT milestone; re-opens and closes a gap left as accepted debt by v0.9.63 (Showcase i18n). Does not redesign the existing locale-registry/build/CI substrate.
**Researched:** 2026-07-07
**Confidence:** HIGH (all findings verified directly against the repo's own source files, CI workflow, and git history — this is an internal-architecture question about an existing system, not an ecosystem-discovery question)

> Canonical-path note: per this directory's established convention (see `PITFALLS-EXCALIDRAW.md`, `PITFALLS-v0.9.69-TELEMETRY.md` as precedent), this document replaces the prior milestone's content at the canonical `ARCHITECTURE.md` path. The superseded v1.0.0 (Full App Catalog / OpenTabs Parity) architecture research is preserved on-disk at `ARCHITECTURE-v1.0.0-OPENTABS-CATALOG.md`.

---

## 0. Correction to Milestone Framing (read this first)

PROJECT.md states: *"Resync the 247 trans-units whose English source changed in commit `6d3ad363`."* I verified this directly by diffing `messages.xlf` at `6d3ad363~1` vs `6d3ad363` and matching trans-units **by `id`, not by line position**:

- Total trans-units in `messages.xlf`: 942 (996 in each target locale file — the small gap is target-file-only housekeeping units, irrelevant here)
- Trans-unit **IDs whose `<source>` text actually changed**: **5** (`agents.meta.description`, `agents.schema.software.description`, `home.meta.description`, `support.faq.q.tools.a`, `support.schema.faq.tools.a`)
- Trans-unit IDs added or removed: 0

The `247 insertions(+), 247 deletions(-)` git-diff stat is **XML line churn**, not trans-unit count: 242 of those line-pairs are `<context-group><context context-type="linenumber">` shifts caused by unrelated TS/HTML edits moving `$localize`/`i18n` call sites up or down in their source files (harmless location-metadata noise), and only 5 are genuine `<source>` text changes. A naive `git diff --stat` or line-count/hash-based drift check would overcount by roughly 48x, and would also false-positive on every future commit that merely reformats a component file without touching any translatable string.

**This has a direct architectural consequence:** the new drift-detection gate MUST diff `<source>` text keyed by `trans-unit id`, not do a raw-text/line-count/whole-file-hash comparison. This is elaborated in Pattern 1 below. The full-page audit (Phase 1 of this milestone) should re-derive the true scope from scratch — it will very likely surface MORE than these 5 units, since the milestone's own stated goal ("every translatable string on every showcase page... genuinely translated") is broader than the blast radius of one named commit. Treat "5" and "247" both as lower/upper bounds discovered so far, not as the audit's answer.

---

## 1. Standard Architecture

### System Overview

```
+-----------------------------------------------------------------------+
|                  SOURCE OF TRUTH (author-edited)                       |
+-----------------------------------------------------------------------+
|  Component .html/.ts (i18n / $localize markers)                       |
|  angular.json  i18n.locales{}         (locale -> file + subPath map)  |
|  locale-constants.ts (Angular) <-verify-locale-sync.mjs-> .js (Express)|
+------------------------------+------------------------------------------+
                               | ng extract-i18n
                               v
+-----------------------------------------------------------------------+
|              messages.xlf  (EN source-of-truth XLIFF)                 |
|              -- one <trans-unit id="..."><source> per marker            |
+------------------------------+------------------------------------------+
                               | (manual / AI-fill, historically)
                               v
+-----------------------------------------------------------------------+
|   messages.{es,de,ja,zh-CN,zh-TW}.xlf  (5 translated copies)          |
|   -- mirrors EN's <trans-unit id> set; <source> COPIED verbatim from   |
|      EN at fill-time, <target state="translated"> is the translation  |
|   PROBLEM: nothing re-syncs the mirrored <source> when EN's <source>  |
|   changes later -- these files silently go stale (this milestone's    |
|   core gap)                                                           |
+------------------------------+------------------------------------------+
                               |
        +----------------------+-----------------------------+
        |                  EXISTING CI GATES               |
        |  (structural / build-time correctness only)      |
        |  1. verify-locale-sync.mjs   -- registry parity   |
        |     (Angular LOCALES[] == Express LOCALES[])      |
        |     Does NOT touch messages.xlf content at all.   |
        |  2. lint:i18n (eslint)       -- every visible      |
        |     template string carries an i18n attribute      |
        |     Does NOT check translation content.            |
        |  3. "ng extract-i18n" + diff -u  ("extract-i18n-   |
        |     clean")  -- messages.xlf byte-equal to a fresh |
        |     extract. Verifies EN source is fully harvested;|
        |     says NOTHING about the 5 target files.         |
        |  4. ng build --localize (i18nMissingTranslation:   |
        |     error) -- fails if a target XLIFF is MISSING a |
        |     <target> for an id present in source. Does NOT |
        |     fail if <target> exists but is a STALE/WRONG   |
        |     translation of a since-changed <source>. This  |
        |     is the exact blind spot: all 5 locale files    |
        |     sit at 996/996 state="translated" today, and   |
        |     that number does not move even when 5 units    |
        |     drift.                                          |
        +------------------------+---------------------------+
                               |
                               v  (NEW, this milestone)
        +---------------------------------------------------+
        |  NEW GATE: verify-translation-drift.mjs             |
        |  Diffs EN <source> text (keyed by trans-unit id)   |
        |  against the <source> mirror embedded in each of   |
        |  the 5 target XLIFFs. Fails the build if any id's  |
        |  EN <source> != that id's mirrored <source> in ANY |
        |  target file. This is the ONLY gate in the whole   |
        |  chain that can catch semantic staleness, because  |
        |  it is the only one that compares SOURCE content   |
        |  across files rather than checking structural      |
        |  presence within one file.                         |
        +------------------------+---------------------------+
                               |
                               v
+-----------------------------------------------------------------------+
|  ng build --localize  emits per-locale prerendered HTML under          |
|  dist/showcase-angular/browser/{en-root,es,de,ja,zh-CN,zh-TW}/**        |
+------------------------------+------------------------------------------+
                               |
                               v
+-----------------------------------------------------------------------+
|  showcase/server/server.js (Express)                                   |
|  - Accept-Language middleware (bare `/` only) -- WARNING-02 lives here |
|  - express.static(dist) with redirect:false                            |
|  - marketingRoutes whitelist + locale subPath splitter                 |
+-----------------------------------------------------------------------+
```

### Component Responsibilities

| Component | Responsibility | Today's Implementation |
|-----------|-----------------|-------------------------|
| `angular.json` `i18n` block | Declares the 5 target locales + `subPath` + translation file path; drives `ng build --localize` fan-out | Static config, hand-edited; `sourceLocale.subPath` is `""`, each target locale's `subPath` matches its code exactly (`es`, `de`, `ja`, `zh-CN`, `zh-TW`) |
| `locale-constants.ts` / `.js` | Runtime-consumable locale list (`LOCALES`, `LOCALE_SUBPATHS`, native labels) for Angular UI + Express middleware | Two hand-mirrored files, kept honest by `verify-locale-sync.mjs` |
| `verify-locale-sync.mjs` | Registry parity ONLY — asserts the two `LOCALES` arrays match | Regex-extracts array literal, string-compares |
| `lint:i18n` (eslint) | Marking completeness — every visible template string has an `i18n`/`i18n-*` attribute | ESLint template-syntax rule, run via `npx eslint "src/**/*.html"` with 2 ignore-patterns (`dashboard/**`, `stats/**` — the latter is exactly what this milestone must remove) |
| `ng extract-i18n` + `diff -u` | EN-source completeness — `messages.xlf` matches what a fresh harvest of `i18n`-marked templates would produce | Shell pipeline in `ci.yml`, not a named npm script (nicknamed "extract-i18n-clean" in docs/plans; `showcase/angular/package.json` has no script literally named that — confirmed by the codebase's own Phase-275 discovery note) |
| `ng build --localize` (`i18nMissingTranslation: error`) | Per-locale structural completeness — every EN trans-unit id has a corresponding `<target>` in each target XLIFF | Angular CLI build-time i18n compiler flag in `angular.json` |
| **(NEW) `verify-translation-drift.mjs`** | Semantic freshness — every EN trans-unit id's `<source>` text matches its mirrored `<source>` in all 5 target XLIFFs | Does not exist yet; this milestone's job |
| `verify-hreflang.mjs` | Post-build SEO/HTML assertion (hreflang tags, canonical, `lang` attr) on emitted prerender output | Walks `dist/`, regex-checks tags |
| Accept-Language middleware (`server.js`) | Bare-`/` locale redirect for first-visit + returning users | Cookie short-circuits today (WARNING-02); needs a redirect-to-cookie-locale fix this milestone |

## Recommended Project Structure

```
showcase/angular/
├── scripts/
│   ├── verify-locale-sync.mjs          # existing -- registry parity (UNCHANGED)
│   ├── verify-hreflang.mjs             # existing -- post-build HTML assertions (UNCHANGED)
│   ├── verify-bundle-budgets.mjs       # existing -- gzip size gate (UNCHANGED)
│   ├── verify-translation-drift.mjs    # NEW -- source-text drift gate (this milestone, permanent)
│   └── audit-translation-completeness.mjs   # NEW, TEMPORARY -- one-shot full-page audit script
│                                        #   (see "Suggested Build Order" -- this is a diagnostic
│                                        #    tool for the audit phase of this milestone, not a
│                                        #    permanent CI gate; retire or demote to a manual
│                                        #    `npm run audit:i18n` script post-milestone)
├── src/locale/
│   ├── messages.xlf                    # EN source-of-truth (UNCHANGED structurally)
│   ├── messages.{es,de,ja,zh-CN,zh-TW}.xlf   # 5 target files -- CONTENT resync happens here,
│   │                                    #   not a new file format
│   └── DO-NOT-TRANSLATE.md             # existing -- machine-token allowlist (UNCHANGED)
├── package.json                        # ADD: "verify:translation-drift": "node scripts/verify-translation-drift.mjs"
│                                        # MODIFY: lint:i18n -- remove `--ignore-pattern "src/app/pages/stats/**"`
│                                        #   (only after stats-page translation work lands, see build order)
└── angular.json                        # UNCHANGED (no new locale, no new subPath)

showcase/server/
├── src/middleware/
│   └── accept-language.js              # MODIFY -- fix WARNING-02 cookie-short-circuit semantics
│                                        #   (see Pattern 2 below)
└── server.js                           # UNCHANGED mount point/order; same middleware, same
                                         #   position (before express.static)

tests/
├── server-accept-language.test.js      # MODIFY -- flip one existing assertion + add new ones for
│                                        #   the fixed cookie-redirect behavior
└── translation-drift.test.js           # NEW -- unit tests for verify-translation-drift.mjs's
                                         #   trans-unit-id-keyed diff logic (mirrors the existing
                                         #   test style: pure Node assert, in-repo fixtures)

.github/workflows/ci.yml                 # MODIFY -- insert one new step in the `website` job
```

### Structure Rationale

- **`verify-translation-drift.mjs` lives alongside the other `verify-*.mjs` scripts, not inside a new subfolder.** This repo's established convention (`verify-locale-sync.mjs`, `verify-hreflang.mjs`, `verify-bundle-budgets.mjs`) is one flat `scripts/verify-*.mjs` file per concern, each independently invocable via a matching `npm run verify:*` script, each wired as its own named step in `ci.yml`'s `website` job. A new script that follows this exact naming and invocation pattern is the path of least surprise for anyone who already knows this codebase's i18n tooling, and it keeps each gate single-purpose and independently debuggable (a red `verify:translation-drift` step in CI immediately tells you it's a semantic-drift failure, not a registry-parity or hreflang failure).
- **The full-page completeness audit is NOT the same artifact as the CI drift gate**, and should not be built as one script that tries to do both. The audit is a one-time (or infrequent, manually-invoked) diagnostic that answers "what is untranslated or drifted RIGHT NOW across the whole surface" — it needs to walk every showcase page/component and cross-reference against every `i18n`-marked template string (or the rendered per-locale output), and produce a human-readable report. The drift gate is a permanent, fast, CI-blocking check that answers a narrower question: "did this commit's EN source change leave any of the 5 target files' mirrored source out of sync." Conflating them either makes the audit too slow/heavy to run on every PR, or makes the permanent gate too broad and fragile (e.g. if it tries to also assert "target text differs meaningfully from source text" as a proxy for "was this ever actually translated," it will misfire on short EN loanwords that are legitimately identical across locales, like "FSB" or brand names already carved out in `DO-NOT-TRANSLATE.md`).
- **No new locale-registry file, no new XLIFF format, no new translation-storage layer.** The milestone's job is drift *detection* and *resync*, not a new translation pipeline. `angular.json`'s `i18n.locales` block and `locale-constants.{ts,js}` are correctly the single source of truth for "which locales exist" and stay untouched; this milestone only adds a new comparison over the *content* of files that already exist in that structure.
- **`accept-language.js` gets modified in place, not replaced.** The bug is a semantics change to one branch of existing logic (see Pattern 2), not a rewrite. The existing `pickBestLocale`, `parseCookieHeader`, and BCP-47 alias-matching logic (`aliasTag`, `ZH_HANS_TARGETS`/`ZH_HANT_TARGETS`) are correct and heavily tested (42 assertions in `server-accept-language.test.js`) — none of that needs to move.

## Architectural Patterns

### Pattern 1: ID-Keyed Source-Text Diff (the drift gate itself)

**What:** Parse `messages.xlf` and each of the 5 target XLIFFs into `Map<trans-unit id, source text>`. For every id present in the EN map, assert the corresponding entry in each target map has byte-identical `<source>` text (after whitespace normalization). Report every (`id`, `locale`) pair that fails, then exit 1 if any failures exist.

**When to use:** This is the correct check because XLIFF's `<trans-unit>` structure (per the XLIFF 1.2 spec, `urn:oasis:names:tc:xliff:document:1.2`, used here) mirrors the EN `<source>` into every target file as an audit trail — the whole point of that mirrored `<source>` field in a translated XLIFF is "this is what was translated FROM." When the real EN source changes but that mirror doesn't get refreshed, the mirror becomes evidence of drift, and this is exactly what to diff against. This is a well-known TMS (translation management system) pattern, often called "source drift" or "fuzzy-match invalidation" — professional i18n pipelines (Phrase, Lokalise, Crowdin, and similar) typically auto-flag or fuzzy-mark units whose source changed since last translation. This project has no TMS; a small custom script fills that exact role.

**Trade-offs:**
- Pro: Cheap (regex/text parse of 5 files, roughly 1MB each, sub-second), zero new dependencies — matching this repo's stated preference (`verify-hreflang.mjs`'s comment: "Zero new npm dependencies — regex-based, no jsdom"; `accept-language.js`'s comment: "Zero new dependencies — inline cookie parse + Node stdlib only").
- Pro: Catches exactly the failure mode this milestone cares about (5 real drifted units from the named commit, not 247 phantom ones — see the framing correction above), and generalizes correctly to whatever additional drift the full-page audit surfaces.
- Con: A pure text-diff cannot tell you the target *translation* is wrong, only that the EN source moved out from under it. It is necessarily a heuristic proxy for "needs re-review," not a semantic-correctness checker. This is fine and expected — closing the loop on translation *quality* is a human/AI-fill review step downstream of this gate, not something the gate itself can verify.
- Con (must design around): must be robust to legitimate structural/whitespace differences that XLIFF tooling introduces (e.g. `<x id="INTERPOLATION"/>` placeholder ordering should usually stay stable, but Angular's extractor can reformat attribute quoting or context-group ordering across regenerations). Normalize whitespace before comparing, and compare only the `<source>` inner content, not the full `<trans-unit>` block (which also contains `<context-group>` linenumber metadata that legitimately differs commit-to-commit and MUST be ignored — per the framing-correction finding above, 242 of 247 diff lines in the named commit were exactly this kind of noise).

**Example (regex-based parse matching the codebase's existing `verify-locale-sync.mjs` style, dependency-free):**
```javascript
// scripts/verify-translation-drift.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, SOURCE_LOCALE } from '../src/app/core/i18n/locale-constants.js';
// (Illustrative import path -- actual implementation should reuse whichever locale
// registry module is import-compatible from a .mjs script; derive TARGET_LOCALES
// from it rather than hardcoding, exactly per the WARNING-01 lesson below.)

const LOCALE_DIR = join(process.cwd(), 'src', 'locale');
const SOURCE_FILE = join(LOCALE_DIR, 'messages.xlf');
const TARGET_LOCALES = LOCALES.filter((l) => l !== SOURCE_LOCALE);

// Extracts { id -> raw inner-XML of <source>...</source> } keyed by trans-unit id.
// Deliberately ignores everything else in the <trans-unit> block (context-group,
// linenumber, notes) -- those legitimately churn on every unrelated code edit and
// MUST NOT be treated as drift (see the 242-line-noise finding in this document's
// framing-correction section: only 5 of 247 diff lines in commit 6d3ad363 were
// real source-text changes).
function extractSourceMap(xliffText) {
  const map = new Map();
  const unitRe = /<trans-unit id="([^"]+)"[^>]*>([\s\S]*?)<\/trans-unit>/g;
  let m;
  while ((m = unitRe.exec(xliffText)) !== null) {
    const [, id, body] = m;
    const sourceMatch = /<source>([\s\S]*?)<\/source>/.exec(body);
    if (sourceMatch) map.set(id, sourceMatch[1].trim());
  }
  return map;
}

const sourceMap = extractSourceMap(readFileSync(SOURCE_FILE, 'utf8'));
const failures = [];

for (const locale of TARGET_LOCALES) {
  const targetPath = join(LOCALE_DIR, `messages.${locale}.xlf`);
  const targetMap = extractSourceMap(readFileSync(targetPath, 'utf8'));
  for (const [id, enSource] of sourceMap) {
    const mirroredSource = targetMap.get(id);
    if (mirroredSource === undefined) {
      failures.push({ locale, id, reason: 'missing trans-unit (should already be caught by ng build)' });
    } else if (mirroredSource !== enSource) {
      failures.push({ locale, id, reason: 'source drift', en: enSource, mirrored: mirroredSource });
    }
  }
}

if (failures.length > 0) {
  console.error(`Translation drift detected: ${failures.length} (locale, id) pairs out of sync.`);
  for (const f of failures) console.error(`  [${f.locale}] ${f.id}: ${f.reason}`);
  process.exit(1);
}
console.log(`Translation drift check passed: ${sourceMap.size} trans-units x ${TARGET_LOCALES.length} locales, zero drift.`);
```

### Pattern 2: Cookie-Directed Redirect (WARNING-02 fix)

**What:** Change the Accept-Language middleware's cookie branch from "cookie present and valid -> `next()` (do nothing, let whatever static file exists at `/` serve)" to "cookie present, valid, and NOT the default locale -> actively 302 redirect to `/{cookieLocale}/`." Only fall through to Accept-Language-header-based detection when there is no usable cookie. The default-locale case (`cookieVal === defaultLocale`, i.e. `en`) still correctly falls through to `next()` since there's no redirect needed to reach the EN root.

**When to use:** This directly closes the gap documented in `v0.9.63-INTEGRATION-CHECK.md`'s WARNING-02 and the audit's own suggested follow-up: *"flip cookie-precedence semantics from 'skip middleware' to 'redirect to cookie locale.'"* The audit already flagged the one real risk this introduces — a **redirect loop** — and named its own mitigation requirement: *"opens T-267-02 redirect-loop surface, needs explicit `/{locale}/` skip guard."* That guard is already structurally present and must be preserved: the middleware only runs `if (req.path !== '/') return next();` (`accept-language.js` line 93), so a redirect to `/{locale}/` (any non-root path) can never re-enter this same middleware branch on the very next request — the loop-guard is the existing path check, not something that needs to be newly invented. The only new invariant to add explicitly is: never redirect if the cookie's locale IS the default locale (`en`), because `/en/` is not a valid subPath in this project's `subPath` scheme (EN's `subPath` is `""`, per `angular.json`'s `sourceLocale.subPath` and `locale-constants.js`'s `LOCALE_SUBPATHS.en === ''`) — redirecting to `/en/` would 404.

**Trade-offs:**
- Pro: Closes exactly the UX gap the milestone names (returning fresh-tab/shared-link visitors with a previously-set locale cookie now land on their locale, not EN).
- Pro: Minimal diff — this is a roughly 5-line change to one function (`createAcceptLanguageMiddleware`'s cookie-branch), not a new module. All the hard parsing/matching work (`pickBestLocale`, `aliasTag`, `parseCookieHeader`) is reused unchanged.
- Con (must test explicitly): the existing test `'GET / + Accept-Language ja + Cookie fsb-locale=de -> next() (cookie wins)'` at `tests/server-accept-language.test.js:81-85` currently asserts `nextCalled: true, redirectArgs: null` for this exact case and encodes the OLD (short-circuit) semantics. Under the fixed behavior this assertion must flip to `nextCalled: false, redirectArgs: { status: 302, location: '/de/' }`. This is a deliberate, expected test-behavior change and should be called out explicitly in the phase/plan doc, not silently altered. The adjacent test `'GET / + Cookie fsb-locale=en -> next() (cookie wins, even for default)'` (lines 87-91) keeps its current expected outcome unchanged — the default-locale case still correctly falls through to `next()`.
- Con: a returning visitor whose cookie locale no longer matches their live preference (e.g. they set `fsb-locale=de` once, months ago, but their browser's Accept-Language has since changed) will now be forced back to `/de/` on every bare-`/` visit, with no Accept-Language override, until they use the in-page picker again. This is the correct, intentional trade-off implied by "cookie wins" (matches how this repo's picker semantics have always been described), but is worth a one-line note in the phase's SUMMARY so a future WARNING doesn't reopen it as a new bug.

**Example:**
```javascript
// showcase/server/src/middleware/accept-language.js -- inside createAcceptLanguageMiddleware's
// returned function, replacing the current cookie branch (lines 95-98 today):

const cookieVal = parseCookieHeader(req.headers && req.headers.cookie, cookieName);
if (cookieVal && cookieVal !== defaultLocale && supportedSet.has(cookieVal)) {
  // WARNING-02 fix: cookie now actively redirects instead of short-circuiting.
  // Loop-safe: this middleware only ever runs on req.path === '/' (checked above),
  // and this redirect always targets a non-'/' subpath, so the redirected request
  // never re-enters this branch.
  return res.redirect(302, '/' + cookieVal + '/');
}
if (cookieVal && cookieVal === defaultLocale) {
  // Cookie explicitly says default locale (en) -- already at the right place; no redirect.
  return next();
}

const best = pickBestLocale(req.headers && req.headers['accept-language'], supported);
if (!best || best === defaultLocale) return next();
res.redirect(302, '/' + best + '/');
```

## Data Flow

### Drift-Gate Data Flow (new)

```
git commit changes showcase/angular/src/locale/messages.xlf (EN source)
    v
CI `website` job runs (existing steps, unchanged order):
    verify-locale-sync.mjs -> lint:i18n -> [ng extract-i18n + diff -u]
    v
NEW STEP inserted here (see Suggested Build Order for exact position):
    verify-translation-drift.mjs
    - reads messages.xlf -> Map<id, source>
    - reads each messages.{locale}.xlf -> Map<id, mirroredSource>
    - diffs by id; exit 1 on any mismatch
    v (pass)
ng build (i18nMissingTranslation: error) -- existing, unchanged
    v
verify:hreflang -> verify-bundle-budgets.mjs -- existing, unchanged
```

### Cookie-Redirect Data Flow (WARNING-02 fix)

```
Returning visitor, fresh tab / shared link, GET /
    v
Request headers carry Cookie: fsb-locale=de (set by picker in a prior session)
    v
accept-language middleware (mounted before express.static, server.js:175)
    v
    cookieVal = 'de'; cookieVal !== 'en' (default); supportedSet.has('de') -- TRUE
    v  (NEW behavior)
    res.redirect(302, '/de/')
    v
Browser re-requests GET /de/
    v
req.path !== '/' -> middleware calls next() immediately (loop-safe, existing guard)
    v
express.static serves dist/showcase-angular/browser/de/index.html (prerendered German)
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|---------------------------|
| Current (6 locales, ~942 trans-units, 5 target files) | The `Map`-based, single-pass regex parse in Pattern 1 runs in well under a second; no optimization needed. This is a build-time/CI-time script, not a runtime hot path — it never touches production request latency. |
| If locale count grows (e.g. adding a 7th/8th locale) | `TARGET_LOCALES` in the new script must be derived from `locale-constants.js`'s `LOCALES` array (filtered to exclude `SOURCE_LOCALE`), exactly the pattern `v0.9.63-INTEGRATION-CHECK.md`'s own WARNING-01 already recommended for `server.js` (`supported = LOCALES.filter(l => l !== SOURCE_LOCALE)`). Hardcoding the array in the new script would reproduce WARNING-01's exact mistake in a new file; the real implementation should import from the locale registry instead of hardcoding, keeping the single-source-of-truth property intact. |
| If trans-unit count grows by 10x (e.g. thousands of marketing strings) | Still trivially fast for a single-pass Map diff; no architectural change needed until file sizes reach tens of MB, which is far outside this project's marketing-copy scope. |
| If translation workflow moves to a real TMS (Phrase/Lokalise/Crowdin) in a future milestone | Those platforms have first-class "source changed since last translation" flagging built in, which would make this custom script redundant. Not a near-term concern; flagged here only so a future milestone doesn't have to rediscover this trade-off. |

### Scaling Priorities

1. **Not a scaling concern at this project's size.** The real risk this milestone's gate should optimize against is **false positives from the linenumber-churn noise already characterized above**, not runtime/CI performance. Keeping the diff strictly `<source>`-text-scoped (not whole-`<trans-unit>`-scoped) is the single most important design decision for this script's long-term reliability.
2. **Second-order risk: the audit script and the drift-gate script overlapping in scope over time.** If the one-time audit script (the diagnostic tool from the audit phase) accretes CI-gate-like assertions and never gets retired or demoted, the project ends up with two overlapping i18n-completeness checks that can disagree with each other. See Suggested Build Order for how to sequence these to avoid that outcome.

## Anti-Patterns

### Anti-Pattern 1: Whole-File Hash/Byte Comparison for Drift Detection

**What people do:** Compare a checksum or raw byte-diff of `messages.xlf` against a checksum of each target file, or treat any git diff on `messages.xlf` as "translations are now stale, re-review everything."
**Why it's wrong:** As demonstrated by the actual commit `6d3ad363` in this repo (247 diff lines, only 5 real source-text changes), the overwhelming majority of `messages.xlf` diffs are `<context-group><linenumber>` churn from unrelated code motion. A whole-file or byte-level check would flag 242 units of pure noise as "drifted," creating alert fatigue and, worse, sending false-positive re-translation work to the 5-locale AI-fill/translator pipeline for units that never actually changed.
**Instead:** Parse and compare only the `<source>` inner-text, keyed by `trans-unit id` (Pattern 1). This is the only comparison granularity that isolates true content drift from harmless structural churn.

### Anti-Pattern 2: Merging the One-Time Audit and the Permanent CI Gate Into One Script

**What people do:** Write a single "do everything i18n" script that both (a) walks every page/component to check completeness against the live DOM/render output, and (b) runs on every CI push as the hard-fail drift gate.
**Why it's wrong:** These have fundamentally different cost/frequency profiles. A full-page completeness audit that inspects every locale's output for every route is inherently heavier (potentially needs a built `dist/` to inspect, or headless-browser assertions) and is meant to run once (or occasionally, on-demand) to find the current gap — not on every commit. Baking it into the permanent CI gate either makes CI slow, or forces the audit logic to be watered down to something fast enough for every-push execution, defeating the audit's own purpose of being thorough. It also risks the exact trap PROJECT.md's milestone framing already fell into: conflating "247 lines changed" with "247 units need resync" — a heavier, less-precise tool is more likely to produce an inflated, misleading count.
**Instead:** Two artifacts with two different lifecycles (see Suggested Build Order): a temporary/manually-invoked audit script for the audit phase (find the current gap, including anything beyond the one named commit), and a small, fast, permanent `verify-translation-drift.mjs` for every subsequent commit (Pattern 1). The audit's findings feed the resync work; the gate prevents recurrence going forward.

### Anti-Pattern 3: Treating the Cookie Fix as "Just Flip a Boolean"

**What people do:** Change the cookie branch to always redirect whenever a cookie is present, without re-checking the default-locale case or the loop-safety invariant.
**Why it's wrong:** `en`'s `subPath` is `""` in this project's locale scheme (`LOCALE_SUBPATHS.en === ''`, `angular.json`'s `sourceLocale.subPath === ''`). A blind "always redirect to `/{cookieLocale}/`" would produce `res.redirect(302, '/en/')` when the cookie says `en`, and `/en/` is not a real subPath in this build's output — that would 404. The fix must special-case `cookieVal === defaultLocale` to still fall through to `next()` (already at the correct root), exactly as Pattern 2 shows.
**Instead:** Preserve the three-way branch: (1) cookie says default locale -> `next()`; (2) cookie says a valid non-default supported locale -> active redirect; (3) no usable cookie -> fall through to existing Accept-Language-header logic. Also explicitly re-verify (and update, not silently break) the existing test at `tests/server-accept-language.test.js:81-85`, which currently encodes the pre-fix "cookie short-circuits" behavior as the expected/passing result for the `cookie=de, header=ja` case.

## Integration Points

### External Services

None. This entire milestone's scope (i18n completeness audit, drift gate, cookie-redirect fix) is internal-repo tooling with zero new third-party services, npm dependencies, or external APIs. This matches the codebase's explicit stated preference across every relevant existing script (`verify-hreflang.mjs`: "Zero new npm dependencies"; `accept-language.js`: "Zero new dependencies — inline cookie parse + Node stdlib only").

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|-----------------|-------|
| `verify-translation-drift.mjs` (new) ↔ `src/locale/*.xlf` | Direct filesystem read, regex-based XML parse (no XML library dependency, matching existing script style) | Must read the locale registry's `LOCALES`/`SOURCE_LOCALE` to derive the target-locale list dynamically, not hardcode it (avoids reproducing WARNING-01) |
| `verify-translation-drift.mjs` (new) ↔ `ci.yml` `website` job | New named step, inserted into the existing linear step sequence | See Suggested Build Order for exact insertion point |
| Full-page audit script (new, temporary) ↔ showcase pages/components | Either static-analysis (walk `.html` templates + cross-reference `i18n` attributes against XLIFF ids, similar to how `lint:i18n`'s eslint rule already inspects templates) or post-build inspection of `dist/showcase-angular/browser/{locale}/**` prerendered HTML | Recommend static-analysis-first (cheaper, no build required) since the goal is finding gaps in marking/translation coverage, not verifying rendered pixel output; the existing `verify-hreflang.mjs` precedent shows post-build HTML inspection is also an available pattern in this repo if the audit needs to verify what's actually rendered per-locale, not just what's marked |
| `accept-language.js` (modified) ↔ `server.js` mount point | Unchanged — same `app.use(createAcceptLanguageMiddleware({...}))` call, same position (line 175, before `express.static` at line 182) | The fix is entirely internal to the middleware factory's returned function; the mount contract (options shape: `supported`, `defaultLocale`, `cookieName`) does not change |
| `lint:i18n` (modified) ↔ `stats/` page components | Remove `--ignore-pattern "src/app/pages/stats/**"` from the `lint:i18n` npm script once stats-page translation work lands | Must land AFTER the stats page's own translation work is complete (see Suggested Build Order), not before, or `lint:i18n` will immediately hard-fail CI on pre-existing untranslated stats-page markup |

## Suggested Build Order

This directly answers the "audit the existing gap first, then add the permanent drift gate" sequencing concern from the milestone context. The dependency chain is:

1. **Full-page completeness audit (temporary/diagnostic script or manual walkthrough).** Goal: enumerate every genuinely-untranslated-but-marked-translated string across all pages (lattice, phantom-stream, prometheus, home, mobile nav, stats, and anything else added since v0.9.63), not just the 5 units from commit `6d3ad363`. This step must run and complete BEFORE the permanent drift gate is wired into CI as hard-fail, because:
   - The audit will very likely surface MORE than the 5 known-drifted units (the milestone's own goal statement — "every translatable string on every showcase page" — is broader than one commit's blast radius).
   - If the permanent gate is wired hard-fail before this pre-existing debt is resolved, CI goes red immediately on the first commit that includes the new gate, for reasons unrelated to that commit (the classic "gate discovers pre-existing debt it didn't cause" problem).
2. **Resync all units found in step 1** across the 5 target locale files (the 5 units from `6d3ad363` at minimum, plus whatever the broader audit finds). This includes the stats-page translation work (currently `lint:i18n`-ignored) since that's explicitly named as in-scope this milestone.
3. **Un-ignore the stats page in `lint:i18n`** only after step 2's stats-page translation work is actually complete — removing `--ignore-pattern "src/app/pages/stats/**"` from `showcase/angular/package.json`'s `lint:i18n` script is itself a small, separate, ordered change that must come after the stats-page strings are marked and translated, not before.
4. **Add `verify-translation-drift.mjs`** (Pattern 1) and wire it into `ci.yml`'s `website` job now that the tree is drift-free — it will pass on first wiring instead of immediately failing on residual debt from steps 1-3.
   - Insertion point in `ci.yml`: after the "Verify ng extract-i18n produces no diff (CI-02)" step and before "Build Angular showcase" — this mirrors the existing ordering logic (cheap static-analysis / text-comparison gates run before the expensive `ng build` step) and matches the audit trail's own documented gate order (`verify-locale-sync → lint:i18n → extract-i18n-clean → ng build → verify:hreflang → verify-bundle-budgets`); the new gate slots in as `verify-locale-sync → lint:i18n → extract-i18n-clean → verify-translation-drift → ng build → verify:hreflang → verify-bundle-budgets`.
5. **WARNING-02 cookie-redirect fix (Pattern 2)** has no dependency on steps 1-4 and can be built in parallel / any order relative to them — it touches a completely different file (`accept-language.js`) and a completely different concern (runtime redirect behavior, not build-time translation content). Sequence it wherever convenient in the phase/plan breakdown; it does not need to wait on the audit or the drift gate.
6. **Retire or demote the audit script from step 1** once steps 1-4 are done. It served its purpose (finding and closing the gap); keeping it around as a stale, unmaintained "second i18n checker" that can silently diverge from the real permanent gate (`verify-translation-drift.mjs`) is the exact risk named in Anti-Pattern 2. Either delete it, or explicitly demote it to a manual/occasional `npm run audit:i18n` script with a comment clarifying it is NOT a CI gate and NOT guaranteed to stay in sync with `verify-translation-drift.mjs`'s logic.

## Sources

All findings in this document are verified directly against this repository's own source files and git history (internal-architecture research, not external-ecosystem research):

- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/.planning/PROJECT.md` (milestone goal, target features, key context, WARNING-02 history across 5+ milestone mentions)
- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/showcase/angular/package.json` (existing `lint:i18n` script, confirmed `stats/**` ignore-pattern currently present)
- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/showcase/angular/angular.json` (`i18n.locales` block, `i18nMissingTranslation: error` build option, `sourceLocale.subPath` = `""`)
- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/showcase/angular/scripts/verify-locale-sync.mjs` (confirmed scope: registry-parity only, no content diffing)
- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/showcase/angular/scripts/verify-hreflang.mjs` (existing script style/conventions precedent)
- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/showcase/server/server.js` (middleware mount order, lines 171-179; static-serving setup)
- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/showcase/server/src/middleware/accept-language.js` (full source of the WARNING-02 bug, cookie-branch logic)
- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/showcase/server/src/utils/locale-constants.js` and Angular's `.ts` mirror (locale registry single-source-of-truth)
- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/tests/server-accept-language.test.js` (42-assertion existing test coverage, including the exact assertion that must flip under the WARNING-02 fix)
- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/.github/workflows/ci.yml` (exact `website` job step order — this is the literal insertion point for the new gate)
- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/.planning/phases/v0.9.63-INTEGRATION-CHECK.md` (original WARNING-01/WARNING-02/WARNING-03 audit findings, E2E flow traces, requirements integration map)
- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/.planning/milestones/v0.9.63-*.md` and `.planning/MILESTONES.md` (audit trail confirming WARNING-02 was deliberately deferred as a design lock, not an oversight)
- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/.planning/milestones/v0.9.69-phases/275-privacy-policy-cws-listing-ci-guard-integration-smoke/275-SUMMARY.md` (confirms `extract-i18n-clean` is not a literal npm script name — it's shorthand for the CI shell pipeline)
- `/Users/lakshman/conductor/workspaces/fsb/san-antonio/showcase/angular/src/locale/messages*.xlf` (direct file inspection: confirmed 996/996 `state="translated"` in every target file today, proving the structural gate is fully green while semantic drift silently exists)
- Git commit `6d3ad363619a731336ffb5f4480a92346339201a` (`chore(i18n): sync messages.xlf with showcase copy refinements`) — directly diffed both as raw git-stat (247/247) and as an id-keyed trans-unit comparison (5 real changes), which is the basis for this document's central framing correction
- XLIFF 1.2 specification (OASIS, `urn:oasis:names:tc:xliff:document:1.2`) — background on the `<source>`/`<target>` mirroring convention that Pattern 1's diff logic exploits; general industry knowledge of TMS "source drift" / "fuzzy match invalidation" conventions (Phrase, Lokalise, Crowdin all implement variants of this), offered as context for why this pattern is a recognized approach rather than an ad hoc invention — MEDIUM confidence on the general industry-convention claim (not verified against those specific vendors' docs in this session), HIGH confidence on everything else in this document since it was verified directly against this repo's own files

---
*Architecture research for: Angular-i18n showcase site — translation-completeness verification and drift-detection CI gate design*
*Researched: 2026-07-07*
