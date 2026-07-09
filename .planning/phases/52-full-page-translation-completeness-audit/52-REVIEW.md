---
phase: 52-full-page-translation-completeness-audit
reviewed: 2026-07-08T21:41:44Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - showcase/angular/scripts/audit-translation-completeness.mjs
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 52: Code Review Report

**Reviewed:** 2026-07-08T21:41:44Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

This is iteration 3 (final — auto-fix loop capped at 3 iterations) of re-review of `showcase/angular/scripts/audit-translation-completeness.mjs` (695 lines), after two prior fix passes. This pass had two objectives: (1) confirm the two findings from the iteration-2 re-review (WR-01, WR-02) are genuinely resolved by the two new commits, and (2) run a normal full adversarial pass over the entire file, not just the two touched regions, to catch anything new.

**Resolution verdict on the two prior findings — both independently re-derived, not just trusted from the fix report:**

- **WR-01 (route's own `componentDir` marker count masked by shell/picker union): confirmed genuinely resolved.** Traced commit `91ef9fc1` directly. `buildRouteMarkedIds` (lines 193-212) now captures `ownCounts.set(route.path, ids.size)` at line 204 — immediately after `extractMarkedIds(join(APP_SRC, route.componentDir))` and *before* the `if (!route.shellless)` union block at lines 205-208 — so `ownCounts` reflects each route's own directory in total isolation from the shared `SHELL_DIR`/`PICKER_DIR` fallback. `main()` (lines 651-665) destructures `{ map: routeMarkedIds, ownCounts: routeOwnMarkedIdCounts }` and the fail-fast at line 661 now gates on `routeOwnMarkedIdCounts.get(route.path) === 0`, not the merged `ids.size`. This closes the exact gap iteration 2 found: all 11 in-scope routes (not just the 4 `shellless: true` ones) now independently trip the fail-fast if their own `componentDir` resolves to zero markers, regardless of what the shell/picker union would otherwise contribute. `dashboard` remains correctly excluded via the pre-existing `!route.outOfScope` guard (unaffected by this change). No collateral changes: every other consumer of `routeMarkedIds` (`computeVerdicts`, `buildReport`, `buildDataSidecar`) still receives the exact same `Map<routePath, Set<id>>` shape as before — verified by re-reading each call site.
- **WR-02 (`traceStats274` present-but-empty `<target>` miscategorization): confirmed genuinely resolved.** Traced commit `e2ddc124` directly. The guard in `traceStats274` (line 253) changed from `xliffEntry.target === null` to `!xliffEntry.target`. Per `extractTransUnits` (line 126), `target` is only ever `null` (no `<target>` element) or a `.trim()`'d string (which can be `''` for a present-but-empty `<target></target>`) — there is no other falsy value it can take (never `0`, `false`, `undefined`). So `!xliffEntry.target` is `true` in exactly the two cases that should be treated as "not translated" (absent entirely, or present-but-empty), and is otherwise identical to the old `=== null` check for every non-empty string. This precisely mirrors `verdictForId`'s own truthiness-based coverage check (line 140: `localeEntry.target && localeEntry.target.length > 0`). The `merged`/`staleValue` branch immediately below (lines 257-258) is unaffected for every case that previously worked correctly. No new bug introduced.

**No new defects were introduced by either of the two fix diffs themselves** — both are minimal and scoped exactly as `52-REVIEW-FIX.md` describes (re-confirmed via `git show` on both commits independently, not by trusting the fix report's narrative).

**A fresh full pass over the whole file (not limited to the two touched regions) found one new Warning and two new Info items**, plus the three Info items from the iteration-2 review that were explicitly deferred (`fix_scope=critical_warning` excluded Info from both fix passes) are confirmed still present, unchanged, and are restated below for completeness of this final-iteration record. No Critical/security findings: this remains a local, read-only-except-for-its-own-report-output diagnostic CLI script with no user input, no network/auth surface, no `eval`/`exec`/shell-out, and no hardcoded secrets.

## Narrative Findings (AI reviewer)

### Warnings

#### WR-01: `SHELL_DIR`/`PICKER_DIR`'s own marked-id count is never independently validated — the same "silent zero" failure mode the just-fixed WR-01 addressed for routes, still open at the shared-directory level

**File:** `showcase/angular/scripts/audit-translation-completeness.mjs:193-212` (`buildRouteMarkedIds`), `651-665` (`main()`'s fail-fast block)
**Issue:** The just-verified WR-01 fix correctly guards against a route's own `componentDir` silently resolving to 0 ids by capturing `ownCounts` before the shell/picker union is applied (lines 202-208). However, `SHELL_DIR` and `PICKER_DIR` themselves (module-level path constants at lines 29-30, consumed at lines 206-207) have no equivalent independent check anywhere in the file. If `SHELL_DIR` or `PICKER_DIR` ever silently resolves to zero marked ids — the shared shell/nav/footer or language-picker templates get their `i18n="@@..."` markers stripped, the directory gets renamed without updating the `SHELL_DIR`/`PICKER_DIR` constants, or a future refactor moves `layout/showcase-shell` or `layout/language-picker` elsewhere — every one of the 7 in-scope, non-`shellless` routes (`home`, `about`, `agents`, `privacy`, `support`, `sitemaps`, `legal`) would silently lose that contribution from its `ids` Set. Each such route's `ownCounts` entry (its own `componentDir` count) stays non-zero — since that part of the drift didn't happen — so the just-fixed fail-fast at line 661 would not fire for any of them. The script would exit 0, produce a "successful" report, and simply never check the ~40 shell ids' and ~2 picker ids' coverage/currency on any of those 7 routes again — exactly the "plausible-looking report silently omits what actually broke" failure mode the original and iteration-2 WR-01 findings both targeted, just one level up the same call graph (the shared directories rather than the per-route directories).
**Fix:** Capture and validate `SHELL_DIR`/`PICKER_DIR`'s own extraction counts once, independently of any per-route union, and fail fast if either is zero (mirroring the existing `ownCounts` pattern):
```js
function buildRouteMarkedIds(routeTable) {
  const map = new Map();
  const ownCounts = new Map();
  const shellIds = extractMarkedIds(SHELL_DIR);
  const pickerIds = extractMarkedIds(PICKER_DIR);
  for (const route of routeTable) {
    const ids = extractMarkedIds(join(APP_SRC, route.componentDir));
    ownCounts.set(route.path, ids.size);
    if (!route.shellless) {
      for (const id of shellIds) ids.add(id);
      for (const id of pickerIds) ids.add(id);
    }
    map.set(route.path, ids);
  }
  return { map, ownCounts, shellCount: shellIds.size, pickerCount: pickerIds.size };
}

// in main(), right after destructuring buildRouteMarkedIds's return value:
const { map: routeMarkedIds, ownCounts: routeOwnMarkedIdCounts, shellCount, pickerCount } = buildRouteMarkedIds(ROUTE_TABLE);
if (shellCount === 0) {
  console.error(`FATAL: SHELL_DIR (${SHELL_DIR}) resolved to 0 marked ids -- shared shell nav/footer i18n markers missing or directory drifted?`);
  process.exit(2);
}
if (pickerCount === 0) {
  console.error(`FATAL: PICKER_DIR (${PICKER_DIR}) resolved to 0 marked ids -- language-picker i18n markers missing or directory drifted?`);
  process.exit(2);
}
```
(This also removes the current 8x-per-run redundant re-walk of `SHELL_DIR`/`PICKER_DIR` — one for every non-`shellless` route — as a side benefit, though performance is out of scope for this review.)

### Info

#### IN-01: Out-of-scope `dashboard` route still pollutes the console pass/fail tally (carried over from iteration 2, unfixed by design — Info excluded from both fix passes)

**File:** `showcase/angular/scripts/audit-translation-completeness.mjs:315-342` (`computeVerdicts`), contrast with `375-386` (`buildFailureIndex`, which does exclude it)
**Issue:** Unchanged since iteration 2's review — confirmed neither of the two new commits (`91ef9fc1`, `e2ddc124`) touches this function. The `for (const route of routeTable)` loop (line 317) still does not skip `route.outOfScope` routes, so it still computes and `record()`s an aggregate PASS/FAIL plus a console line for `dashboard` on every locale, even though `dashboard` is explicitly out of scope and already excluded from both the rendered per-route table (`buildReport`, via the `route.outOfScope` branch) and the Detailed Failure List (`buildFailureIndex` line 378). The final `Progress-log tally: N pass, M fail` console line (line 690) therefore still silently includes 5 out-of-scope `dashboard` results (one per locale). Restated here for completeness of this final-iteration record, not as a new discovery.
**Fix:**
```js
for (const route of routeTable) {
  if (route.outOfScope) continue;
  // ...existing per-locale loop...
}
```

#### IN-02: `getTargetLocales()` resolving to an empty array has no explicit guard (carried over from iteration 2, unfixed by design)

**File:** `showcase/angular/scripts/audit-translation-completeness.mjs:104-108` (`getTargetLocales`)
**Issue:** Unchanged since iteration 2's review. `getTargetLocales()` filters `LOCALES` down to everything that isn't `SOURCE_LOCALE` with no minimum-length check. If a future edit to `locale-constants.ts` ever left `LOCALES` containing only the source locale, `targetLocales` would silently be `[]`, and every downstream per-locale loop would just iterate zero times — the script would still exit 0 and write a "successful" report describing zero locales. Impact remains limited (the very next line prints the empty list directly to the console, making the problem self-evident to a human running the script), hence Info rather than Warning.
**Fix:**
```js
function getTargetLocales() {
  const sourceLocale = extractSourceLocale(LOCALE_CONSTANTS_PATH);
  const all = extractLocales(LOCALE_CONSTANTS_PATH);
  const targets = all.filter((l) => l !== sourceLocale);
  if (targets.length === 0) {
    throw new Error(`LOCALES resolved to zero target locales (source=${sourceLocale}, all=[${all.join(', ')}])`);
  }
  return targets;
}
```

#### IN-03: `buildReport` is a 161-line, multi-concern function (carried over from iteration 2, unfixed by design)

**File:** `showcase/angular/scripts/audit-translation-completeness.mjs:389-550`
**Issue:** Unchanged since iteration 2's review. `buildReport` builds all six report sections (ground-truth baseline, shell-rendering note, per-route summary table, detailed failure list, orphaned ids, stats-274 trace) inline via sequential `lines.push(...)` calls in one function body — well past the ~50-line code-smell threshold, mixing six independent concerns. Not deeply nested or high-cyclomatic-complexity, so this remains a maintainability note rather than a correctness risk.
**Fix:** Extract each `## ...` section into its own `buildXxxSection(ctx)` helper returning an array of lines, mirroring the existing `buildRouteLocaleStats`/`buildFailureIndex` helper pattern already used elsewhere in this file:
```js
function buildReport(ctx) {
  return [
    ...buildHeaderLines(ctx),
    ...buildBaselineSection(ctx),
    ...buildShellNoteSection(ctx),
    ...buildRouteSummarySection(ctx),
    ...buildFailureListSection(ctx),
    ...buildOrphansSection(ctx),
    ...buildStats274Section(ctx),
  ].join('\n') + '\n';
}
```

#### IN-04: `buildFailureIndex` hardcodes the string literal `'dashboard'` instead of deriving out-of-scope exclusion from `ROUTE_TABLE`'s own `outOfScope` flag

**File:** `showcase/angular/scripts/audit-translation-completeness.mjs:375-386`, specifically line 378
**Issue:** `buildFailureIndex` excludes the out-of-scope route with `if (e.route === 'dashboard') continue;` (line 378) — a bare string literal — whereas `buildReport`'s per-route summary loop correctly derives the same exclusion from `route.outOfScope` read directly off `ROUTE_TABLE` (the canonical source of truth for scope). `verdictEntries` (the input to `buildFailureIndex`) only carries `route: route.path`, not the `outOfScope` flag itself, so this function cannot currently check the flag directly without also threading it through `computeVerdicts`'s entries — but hardcoding the path string instead means this exclusion silently stops tracking `ROUTE_TABLE` if `dashboard`'s path ever changes, or if a second `outOfScope` route is ever added elsewhere in `ROUTE_TABLE` (it would not be excluded here, only in `buildReport`'s summary table, producing an inconsistent report where an out-of-scope route is correctly marked "excluded" in one section but still appears in the Detailed Failure List in another). Currently correct — this is a fragility/maintainability risk, not a live bug, since `ROUTE_TABLE` today has exactly one `outOfScope` entry and its path (`'dashboard'`) matches the hardcoded literal.
**Fix:** Derive the exclusion set once from `ROUTE_TABLE`, the same source of truth every other out-of-scope check uses:
```js
const OUT_OF_SCOPE_ROUTE_PATHS = new Set(ROUTE_TABLE.filter((r) => r.outOfScope).map((r) => r.path));

function buildFailureIndex(verdictEntries) {
  const index = new Map();
  for (const e of verdictEntries) {
    if (OUT_OF_SCOPE_ROUTE_PATHS.has(e.route)) continue;
    // ...unchanged...
  }
  return index;
}
```

#### IN-05: `writeFileSync` calls in `main()` (and `readdirSync`/`statSync` in `walkFiles`) are not wrapped in try/catch, unlike every other I/O boundary in this file

**File:** `showcase/angular/scripts/audit-translation-completeness.mjs:682` and `686` (`writeFileSync` calls in `main()`), `159-172` (`walkFiles`, specifically `readdirSync` at line 163 and `statSync` at line 165)
**Issue:** This file explicitly commits to a "clean `FATAL: ...` message + `exit(2)`" convention for every precondition it checks (per the Stage 9 comment block and the T-52-02 threat-model comment above `readXliffOrExit`), and applies it consistently to every XLIFF read/parse and to `getTargetLocales()`. It does not apply the same treatment to its own report/data-sidecar writes: `writeFileSync(REPORT_OUT, ...)` (line 682) and `writeFileSync(DATA_OUT, ...)` (line 686) run unguarded at the very end of `main()`. Unlike every file `requireFile()` checks (`LOCALE_CONSTANTS_PATH`, `messages.xlf`, per-locale XLIFFs — all under `APP_SRC`/`LOCALE_DIR`), `PHASE_DIR` (`REPO_ROOT/.planning/phases/52-full-page-translation-completeness-audit`, an entirely separate part of the repo tree, two directories up from `cwd`) is never existence-checked before these writes. If that directory is ever missing or unwritable (e.g., removed during a future phase-archival cleanup, independent of whether `showcase/angular/`'s own source tree is intact) the script would crash with a raw unhandled `ENOENT`/`EACCES` stack trace instead of its own established clean-FATAL convention. Similarly, `walkFiles`'s `readdirSync`/`statSync` calls have no try/catch, so a permissions error on any subdirectory under `APP_SRC` would also produce a raw crash. In every case the failure is loud and immediately non-zero-exit (no risk of a silent false-success, unlike WR-01 above), so this is a consistency/polish gap rather than a functional-correctness risk — Info, not Warning.
**Fix:** Add a small write helper mirroring `readXliffOrExit`'s pattern and use it for both output writes:
```js
function writeOutputOrExit(path, content, label) {
  try {
    writeFileSync(path, content, 'utf8');
  } catch (err) {
    console.error(`FATAL: could not write ${label} (${path}): ${(err && err.message) || err}`);
    process.exit(2);
  }
}
// main(): writeOutputOrExit(REPORT_OUT, reportMd, 'audit report'); / writeOutputOrExit(DATA_OUT, JSON.stringify(dataJson, null, 2), 'data sidecar');
```

---

_Reviewed: 2026-07-08T21:41:44Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
