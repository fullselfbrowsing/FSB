---
phase: 52-full-page-translation-completeness-audit
reviewed: 2026-07-08T20:56:19Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - showcase/angular/scripts/audit-translation-completeness.mjs
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 52: Code Review Report

**Reviewed:** 2026-07-08T20:56:19Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Reviewed the single diagnostic script `showcase/angular/scripts/audit-translation-completeness.mjs` (668 lines) at standard depth. Because the file's own comments make specific, checkable factual claims about other files (the `app.routes.ts` route table and `shellless` flags, `locale-constants.ts`'s `LOCALES`/`SOURCE_LOCALE`, "proven" regex behavior against live XLIFF data, and a claimed-dead `reference-placeholder` scaffold directory), those claims were independently verified against the live repo state and against the already-generated `52-AUDIT-REPORT.md` / `52-audit-data.json` artifacts, rather than taken at face value.

No security issues apply: this is a local, read-only-except-for-its-own-report-output CLI script operating on version-controlled files, with no user input, no network/auth surface, and no `eval`/`exec`/shell-out.

Verification results: the hardcoded `ROUTE_TABLE` (paths, `componentDir`s, and `shellless` flags) currently matches the live `app.routes.ts` exactly; the locale-derivation regexes correctly extract `SOURCE_LOCALE`/`LOCALES` from the live `locale-constants.ts`; the `extractTransUnits` regex currently matches 100% of real `<trans-unit>` tags in all 6 XLIFF files (942/942 EN, 996/996 per locale — the widely-quoted "942/996" in the file's own comment refers to EN-vs-locale totals, not a partial-match rate, and was confirmed to be an exact match, not an under-match); no self-closing `<target/>` tags exist in any locale file; no `$localize` usage in the codebase uses the unsupported `:meaning|description@@id:` metadata form; and the `reference-placeholder` directory's 4 marker ids were confirmed absent from `messages.xlf`, validating the comment's claim that it is genuinely dead content safe to exclude.

The issues below are latent robustness/precision gaps in the script itself rather than currently-wrong report output: the script has no defenses against its own core assumptions (route table accuracy, regex attribute-order/format assumptions) silently drifting from reality in a future change, and one categorization bug in the stats-274 trace conflates two distinct "untranslated" states under a misleading label. All are classified Warning (correctness/robustness risk for a tool whose stated purpose is precisely to catch this class of drift) or Info (cosmetic/log-noise inconsistency); there are no Critical findings.

## Narrative Findings (AI reviewer)

### Warnings

#### WR-01: Hardcoded route table and marker-directory walk have no drift detection — a mistyped/renamed path silently produces a vacuous "PASS"

**File:** `showcase/angular/scripts/audit-translation-completeness.mjs:159-172` (`walkFiles`), `54-72` (`ROUTE_TABLE`), `193-204` (`buildRouteMarkedIds`)
**Issue:** `walkFiles()` returns an empty array whenever `existsSync(dir)` is false (line 162), with no warning or error. `ROUTE_TABLE` is explicitly documented (lines 37-52) as a "hardcoded mirror of showcase/angular/src/app/app.routes.ts" that must be kept in sync by hand, and `buildRouteMarkedIds` / `extractMarkedIds` walk each route's `componentDir` (plus `SHELL_DIR`/`PICKER_DIR` for non-shellless routes) via `walkFiles`. If any of these paths is ever mistyped, or a route/component directory is renamed or removed in a future change without updating this script, the affected route resolves to 0 marked ids. `computeVerdicts` (lines 302-329) then computes `covPass === covTotal` and `curPass === curTotal` as `0 === 0`, i.e. `true`, so `record()` reports that route as a **PASS** with "coverage 0/0, currency 0/0" instead of failing loudly. For a tool whose entire stated purpose (lines 8-11) is to catch exactly this class of drift — and which already does so carefully for orphaned ids and currency — silently going blind on its own route table undermines that purpose.
**Fix:**
```js
for (const route of ROUTE_TABLE) {
  const ids = routeMarkedIds.get(route.path);
  if (ids.size === 0 && !route.outOfScope) {
    console.error(`FATAL: route [${displayName(route.path)}] resolved to 0 marked ids -- componentDir typo or ROUTE_TABLE drift from app.routes.ts?`);
    process.exit(2);
  }
}
```

#### WR-02: `traceStats274` mislabels "no `<target>` element at all" as `staleValue`

**File:** `showcase/angular/scripts/audit-translation-completeness.mjs:233-251`
**Issue:** `extractTransUnits`'s own comment (line 126) defines `target: null` as meaning "no `<target>` at all" for a given trans-unit. `traceStats274`'s guard `if (!xliffEntry)` (line 240) only catches the case where the *id* is entirely absent from the locale's XLIFF map; when the id exists but its trans-unit has `target === null`, execution falls through to `const merged = xliffEntry.target === json[id];` (line 244) — `null === "<some string>"` is always `false` — and the id is pushed into `report.staleValue` (line 245) alongside ids whose target genuinely differs from the JSON's recorded value. This conflates "never translated at all" with "translated to a different value than the JSON expects" under a bucket name (`staleValue`) that specifically implies the latter. Verified against the already-generated `52-AUDIT-REPORT.md`: current live data happens to produce 0 `staleValue` entries in every locale, so this has not yet produced a misleading report, but the code path is live and reachable — the next trans-unit that has an empty/no-`<target>` element while its id also appears in a `translations.stats-274.*.json` file will be silently misreported as "stale" rather than "untranslated," which is exactly the distinction Phase 53 (the stated consumer of this data, per the surrounding comments) needs to make correctly.
**Fix:**
```js
if (!xliffEntry || xliffEntry.target === null) {
  report.missingFromXliff.push(id); // covers "id absent" AND "id present but has no <target> at all"
  continue;
}
const merged = xliffEntry.target === json[id];
(merged ? report.merged : report.staleValue).push(id);
```
(or introduce a distinct fourth bucket, e.g. `noTargetElement`, if the report needs to keep the two "missing" cases separately visible.)

#### WR-03: No validation that regex-based extraction captured every trans-unit/marker — silent partial-match failure mode

**File:** `showcase/angular/scripts/audit-translation-completeness.mjs:116-130` (`extractTransUnits`), `156-157` (`HTML_MARKER_RE` / `TS_LOCALIZE_RE`), `581-601` (`readXliffOrExit`)
**Issue:** `extractTransUnits`'s regex hard-codes the exact attribute sequence `id="([^"]+)" datatype="html"` (line 118), and `readXliffOrExit` only guards the all-or-nothing case of `map.size === 0` (lines 596-599) — it never cross-checks `map.size` against the actual number of `<trans-unit` occurrences in the source text. Similarly, `TS_LOCALIZE_RE` (line 157) only supports the bare `` $localize`:@@id:` `` form and has no handling for Angular's `` $localize`:meaning|description@@id:` `` metadata form. Both regexes are explicitly documented as "proven against" today's live data (comments at lines 112-114 and 146-154) — and that claim does hold today (verified: 100% trans-unit match rate across all 6 XLIFF files; zero `$localize` usages in the codebase use the meaning/description-prefix form) — but neither extraction path has a self-check that would catch a *future* format drift where only some trans-units/markers fail to match, as opposed to the zero-match case that is already guarded. A partial silent mismatch would make the coverage/currency verdicts quietly wrong for only the affected ids, with no error surfaced anywhere, undermining the script's core purpose as a completeness auditor.
**Fix:**
```js
const tagCount = (xliffText.match(/<trans-unit /g) || []).length;
if (map.size !== tagCount) {
  console.error(`FATAL: extracted ${map.size} trans-units but found ${tagCount} <trans-unit> tags in ${label} -- regex/attribute-order mismatch.`);
  process.exit(2);
}
```

### Info

#### IN-01: Out-of-scope `dashboard` route still pollutes the console pass/fail tally

**File:** `showcase/angular/scripts/audit-translation-completeness.mjs:302-329` (`computeVerdicts`), contrast with `362-374` (`buildFailureIndex`)
**Issue:** `computeVerdicts`'s `for (const route of routeTable)` loop (line 304) does not skip `route.outOfScope` routes, so it still computes and `record()`s (lines 321-325) an aggregate PASS/FAIL plus a console line for `dashboard` on every locale, even though `dashboard` is explicitly declared out of scope (`ROUTE_TABLE` comment, lines 46-47: "authenticated app surface, not marketing content") and is excluded from both the rendered per-route table (lines 435-438) and the Detailed Failure List (`buildFailureIndex`, line 365: `if (e.route === 'dashboard') continue;`). The final `Progress-log tally: N pass, M fail` console line (line 663) therefore silently includes out-of-scope results. Impact is limited — the script itself labels that tally non-authoritative ("see report for authoritative per-id verdicts") — but it's a one-line fix for an easy-to-miss inconsistency.
**Fix:**
```js
for (const route of routeTable) {
  if (route.outOfScope) continue;
  // ...existing per-locale loop...
}
```

---

_Reviewed: 2026-07-08T20:56:19Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
