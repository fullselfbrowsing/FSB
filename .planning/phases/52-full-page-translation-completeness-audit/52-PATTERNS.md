# Phase 52: Full-Page Translation Completeness Audit - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 2 (1 new script, 1 new report)
**Analogs found:** 2 / 2 (both strong role+data-flow matches; report also has a JSON-sidecar precedent)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `showcase/angular/scripts/audit-translation-completeness.mjs` | utility (build-time diagnostic script) | batch / transform (multi-file read -> in-memory diff -> single report write) | `showcase/angular/scripts/verify-hreflang.mjs` (structure/record-pattern) + `showcase/angular/scripts/assemble-xliff-target.mjs` (XLIFF regex) + `showcase/angular/scripts/merge-and-assemble-274.mjs` (stats-274 trace precedent) | exact (role) / composite (no single existing script does coverage+currency+orphan+stats-274 trace together, but every sub-pattern exists verbatim elsewhere) |
| `.planning/phases/52-full-page-translation-completeness-audit/52-AUDIT-REPORT.md` | config/report (generated markdown artifact, not source code) | transform (structured findings -> markdown tables) | `.planning/research/ARCHITECTURE.md` (Pattern 1 write-up style: tables + fenced code + confirmed-baseline table) + this phase's own `52-RESEARCH.md` (`Confirmed Baseline` table format) | role-match (no prior *diagnostic audit report* exists in this repo's phase artifacts, but the tables-first, per-item-verdict, "detail list only for failures" structure is directly modeled on RESEARCH.md's own `Confirmed Baseline` and `Phase Requirements` tables) |

## Pattern Assignments

### `showcase/angular/scripts/audit-translation-completeness.mjs` (utility, batch/transform)

This is a composite: no single existing script does coverage + currency + orphan + stats-274 trace together, so the new script should be assembled from four proven sub-patterns, each copied near-verbatim from a different existing file. Do not re-derive any of these from first principles — every regex below is already proven correct against this repo's live 942/996-trans-unit files.

**Analog 1 of 4 — CLI header/comment convention + Node-only imports** (from `showcase/angular/scripts/assemble-xliff-target.mjs` lines 1-24):
```javascript
#!/usr/bin/env node
// Phase 265 / Plan 01 -- Assemble a target XLIFF from messages.xlf + a translations
// JSON map. Reads translations as {id: "translated target string"}, walks the source
// XLIFF, and emits a target XLIFF byte-equal in <source> / <context-group> / attribute
// structure but with a <target state="translated"> inserted after each <source>.
//
// Usage:
//   node scripts/assemble-xliff-target.mjs <locale> <translations.json> > messages.<locale>.xlf

import { readFileSync } from 'node:fs';

const [, , locale, jsonPath] = process.argv;
if (!locale || !jsonPath) {
  console.error('Usage: assemble-xliff-target.mjs <locale> <translations.json>');
  process.exit(2);
}
```
Copy this header-comment style exactly (Phase/Plan attribution line, `Usage:` block, `node:fs`-only import). This script takes zero CLI args (it audits the whole route table in one shot), so the `process.argv` destructure block is not needed — but the "usage banner as a top-of-file comment" convention should still be followed for consistency with the script family.

**Analog 2 of 4 — trans-unit / source / target extraction regex** (from `showcase/angular/scripts/merge-and-assemble-274.mjs` lines 37-49, identical regex also in `assemble-xliff-target.mjs` line 36 and ARCHITECTURE.md's Pattern 1):
```javascript
const transUnitRe = /<trans-unit id="([^"]+)" datatype="html">([\s\S]*?)<\/trans-unit>/g;
let m;
while ((m = transUnitRe.exec(existingXlf)) !== null) {
  const id = m[1];
  const body = m[2];
  const tgtMatch = body.match(/<target[^>]*>([\s\S]*?)<\/target>/);
  if (tgtMatch) {
    existingTargets[id] = tgtMatch[1];
  }
}
```
Extend this to also capture `<source>` (needed for the currency check, not just target-presence for coverage):
```javascript
// Composite of the above + ARCHITECTURE.md's extractSourceMap (see Analog 3) --
// produces { id -> { source, target } } in one pass instead of two separate maps.
function extractTransUnits(xliffText) {
  const map = new Map();
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
```
This exact regex (`<trans-unit id="([^"]+)" datatype="html">([\s\S]*?)<\/trans-unit>`) is already proven against all 942/996 real trans-units in this repo per RESEARCH.md's Confirmed Baseline table — do not invent a different shape or add XML-attribute-order assumptions.

**Analog 3 of 4 — currency diff (`extractSourceMap`, ARCHITECTURE.md lines 204-214, direct-reuse mandate per CONTEXT.md):**
```javascript
// Deliberately ignores everything else in the <trans-unit> block (context-group,
// linenumber, notes) -- those legitimately churn on every unrelated code edit and
// MUST NOT be treated as drift.
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
```
Note this is subsumed by the combined `extractTransUnits` above (Analog 2) — `.source` on each map entry already gives the currency comparison directly: `localeEntry.source === enEntry.source`. Do not maintain two separate extraction passes over the same file; one combined map (id -> {source, target}) covers both coverage and currency, per the Coverage+Currency verdict function already specified in RESEARCH.md's Code Examples section (verbatim, reuse as-is):
```javascript
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

**Analog 4 of 4 — pass/fail accumulator + reporting style** (from `showcase/angular/scripts/verify-hreflang.mjs` lines 28-37):
```javascript
const failures = [];
const passes = [];

function record(passed, label, detail) {
  const entry = { label, detail };
  if (passed) passes.push(entry); else failures.push(entry);
  const tag = passed ? 'PASS' : 'FAIL';
  const suffix = detail ? ` -- ${detail}` : '';
  console.log(`${tag}: ${label}${suffix}`);
}
```
Adapt `record()`'s shape for the audit's own accumulator (route x locale x id -> verdict), but keep the `{label, detail}` entry shape and the immediate `console.log` echo — this gives a streaming progress log during the run in addition to the final markdown report.

**Locale-list derivation pattern** (from `showcase/angular/scripts/verify-locale-sync.mjs` lines 3-20 — this is the "don't hardcode locales" precedent CONTEXT.md explicitly calls out avoiding, WARNING-01):
```javascript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const NG = join(ROOT, 'showcase/angular/src/app/core/i18n/locale-constants.ts');

function extractLocales(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const match = text.match(/LOCALES\s*[:=]\s*\[([^\]]+)\]/);
  if (!match) {
    throw new Error(`Could not find LOCALES array literal in ${filePath}`);
  }
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}
```
Because `.mjs` cannot natively `import` a `.ts` file's named exports, the new script MUST use this exact regex-extraction approach against `showcase/angular/src/app/core/i18n/locale-constants.ts` (not a TS-transpile import) to derive `TARGET_LOCALES` dynamically — this is precisely how `verify-locale-sync.mjs` already solves the identical `.mjs`-reads-`.ts`-constants problem. `locale-constants.ts`'s live content (confirmed, full file):
```typescript
export const SOURCE_LOCALE = 'en' as const;
export const LOCALES = ['en', 'es', 'de', 'ja', 'zh-CN', 'zh-TW'] as const;
```
Filter `LOCALES` by `!== SOURCE_LOCALE` to get the 5 target locales, exactly as ARCHITECTURE.md's Pattern 1 example already does (`const TARGET_LOCALES = LOCALES.filter((l) => l !== SOURCE_LOCALE);`).

**Route table** (hardcode as a mirror of the confirmed, full, 17-line `showcase/angular/src/app/app.routes.ts` — regex-extraction is unwarranted per RESEARCH.md's Alternatives Considered table, but the route list must exactly match this live content, including the two `shellless` and one out-of-scope flags):
```typescript
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home-page.component').then(m => m.HomePageComponent) },
  { path: 'about', loadComponent: () => import('./pages/about/about-page.component').then(m => m.AboutPageComponent) },
  { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard-page.component').then(m => m.DashboardPageComponent) },
  { path: 'agents', loadComponent: () => import('./pages/agents/agents-page.component').then(m => m.AgentsPageComponent) },
  { path: 'privacy', loadComponent: () => import('./pages/privacy/privacy-page.component').then(m => m.PrivacyPageComponent) },
  { path: 'support', loadComponent: () => import('./pages/support/support-page.component').then(m => m.SupportPageComponent) },
  { path: 'stats', loadComponent: () => import('./pages/stats/stats-page.component').then(m => m.StatsPageComponent), data: { shellless: true } },
  { path: 'lattice', loadComponent: () => import('./pages/lattice/lattice-page.component').then(m => m.LatticePageComponent), data: { shellless: true } },
  { path: 'phantom-stream', loadComponent: () => import('./pages/phantom-stream/phantom-stream-page.component').then(m => m.PhantomStreamPageComponent), data: { shellless: true } },
  { path: 'prometheus', loadComponent: () => import('./pages/prometheus/prometheus-page.component').then(m => m.PrometheusPageComponent), data: { shellless: true } },
  { path: 'sitemaps', loadComponent: () => import('./pages/sitemaps/sitemaps-page.component').then(m => m.SiteMapsPageComponent) },
  { path: 'legal', loadComponent: () => import('./pages/legal/legal-page.component').then(m => m.LegalPageComponent) },
  { path: '**', redirectTo: '' },
];
```
Component directory for each route (for marker extraction) is `showcase/angular/src/app/pages/<name>/` where `<name>` is the segment before `-page.component` in the `loadComponent` import path (e.g. `pages/home/`, `pages/phantom-stream/`, `pages/sitemaps/`). `dashboard` must be included in the route table with an explicit "excluded — authenticated app surface" annotation, not omitted (per RESEARCH.md's Anti-Patterns section and Confirmed Baseline table).

**Dual-file-type marker extraction** (NEW pattern this phase adds — no existing script does this; specified verbatim in RESEARCH.md's Architecture Patterns "Pattern 2", reuse as-is):
```javascript
// HTML template attributes -- covers i18n="@@id" and i18n-aria-label="@@id" etc.
// Confirmed live example: showcase-shell.component.html line 36:
//   <a routerLink="/" ... i18n="@@shell.nav.mobile.home">Home</a>
const HTML_MARKER_RE = /i18n(?:-[\w-]+)?="@@([^"]+)"/g;

// TS tagged-template literals -- covers $localize`:@@id:text` (meta tags, FAQ content,
// computed chart labels). Confirmed live example: stats-page.component.ts line 109:
//   { id: 'fsb-active-now', label: $localize`:@@SHOWCASE_STATS_FSB_VIEW_ACTIVE_NOW:Active right now` },
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
Must be run against every route's own `pages/<name>/` directory AND (for the 6 non-shellless routes: home, about, agents, dashboard, privacy, support) additionally against `layout/showcase-shell/` and `layout/language-picker/` for the shared `shell.nav.*`/`shell.footer.*`/`picker.*` ids. Confirmed shell markup convention (`showcase-shell.component.html`, live content, desktop nav lines 16-24, mobile nav lines 35-42):
```html
<a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" i18n="@@shell.nav.desktop.home">Home</a>
...
<div class="nav-mobile" [class.active]="mobileMenuOpen">
  <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" (click)="closeMobileMenu()" i18n="@@shell.nav.mobile.home">Home</a>
```
This confirms `shell.nav.desktop.*` and `shell.nav.mobile.*` are two distinct, separately-marked id sets (not the same id rendered twice) — both must appear in the shell's marker-extraction pass. `@if (!shellless)` wraps the entire nav block at the top of the shell template, matching the route table's `shellless` flag exactly.

**Walk-directory helper** (from `showcase/angular/scripts/verify-hreflang.mjs` lines 99-112, adapt filename filter from `index.html`-only to the `['.html', '.ts']` extension list needed here):
```javascript
function findIndexHtmlFiles(root) {
  const out = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (entry === 'index.html') out.push(p);
    }
  }
  walk(root);
  return out;
}
```

**Stats-274 JSON trace** (composite of `merge-and-assemble-274.mjs`'s merge logic, lines 37-57, reframed as a read-only trace instead of a write — plus RESEARCH.md's Code Examples `traceStats274` function, reuse verbatim):
```javascript
// merge-and-assemble-274.mjs's existing merge-detection shape (already-proven read path):
const existingXlf = readFileSync(EXISTING_XLF, 'utf8');
const existingTargets = {};
const transUnitRe = /<trans-unit id="([^"]+)" datatype="html">([\s\S]*?)<\/trans-unit>/g;
let m;
while ((m = transUnitRe.exec(existingXlf)) !== null) {
  const id = m[1];
  const body = m[2];
  const tgtMatch = body.match(/<target[^>]*>([\s\S]*?)<\/target>/);
  if (tgtMatch) existingTargets[id] = tgtMatch[1];
}
const newJson = JSON.parse(readFileSync(NEW_JSON, 'utf8'));
delete newJson._comment;  // never reaches the XLF -- same convention applies to the trace read
```
Extend into a read-only trace (do NOT write/merge anything — this phase is diagnostic only, unlike `merge-and-assemble-274.mjs` which writes):
```javascript
function traceStats274(locale, jsonPath, xliffMap, currentTemplateIds) {
  const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
  delete json._comment;
  const jsonIds = new Set(Object.keys(json));

  const report = { merged: [], missingFromXliff: [], staleValue: [], idDriftFromTemplate: [] };

  for (const id of jsonIds) {
    const xliffEntry = xliffMap.get(id);
    if (!xliffEntry) {
      report.missingFromXliff.push(id);
      continue;
    }
    const merged = xliffEntry.target === json[id];
    (merged ? report.merged : report.staleValue).push(id);
  }

  for (const id of jsonIds) {
    if (!currentTemplateIds.has(id)) report.idDriftFromTemplate.push(id);
  }

  return report;
}
```
JSON file paths: `showcase/angular/src/locale/translations.stats-274.{es,de,ja,zh-CN,zh-TW}.json` (5 files, 21 keys each per RESEARCH.md's Confirmed Baseline). `currentTemplateIds` is the `SHOWCASE_STATS_FSB_*`-prefixed subset of the EN `messages.xlf` id set (12 ids currently, per Confirmed Baseline table) — filter the full EN map's keys by prefix, do not build a separate extraction pass.

**Known issue (see 52-RESEARCH.md Open Questions #3):** the `idDriftFromTemplate` loop above scans all `jsonIds`, not just the merged subset — a real run produces 13 drifted ids per locale, not 7 (what the loop's own intent implies) nor 9 (used as ground truth elsewhere in this phase). Do not treat any of these three as confirmed; re-derive and decide during Task 2.

**Exit-code semantics — deliberate deviation from every analog script's convention:**
All four analog scripts (`verify-locale-sync.mjs`, `verify-hreflang.mjs`, `assemble-xliff-target.mjs`, `merge-and-assemble-274.mjs`) use `process.exit(1)` to mean "found a problem, CI should fail." This new script must NOT copy that semantic. Per RESEARCH.md's Pitfall 1: exit 0 whenever the report is successfully generated, regardless of findings (coverage/currency failures, orphans, stats-274 drift are all *expected report content*). Exit non-zero (e.g. `process.exit(2)`, matching `assemble-xliff-target.mjs`'s convention for a usage/fatal-precondition error, not a findings-related one) only for genuine tool failure — a required source file missing, or a malformed XLIFF that breaks the regex. Wrap each file read in try/catch per RESEARCH.md's Security Domain guidance (defensive parsing, not a hard input-validation library).

---

### `.planning/phases/52-full-page-translation-completeness-audit/52-AUDIT-REPORT.md` (report, transform)

No prior *diagnostic audit report* artifact exists in this repo's `.planning/phases/` tree to copy verbatim (this is the first phase whose primary deliverable is a findings report rather than a code change) — but the tables-first, per-item-verdict, "detail list only for failures" structure has a direct, ready-to-copy model in this milestone's own research documents.

**Structural analog — RESEARCH.md's own `Confirmed Baseline` table** (`.planning/phases/52-full-page-translation-completeness-audit/52-RESEARCH.md` lines 451-470): a flat `| Metric | Value | How confirmed |` table is the exact shape for the audit report's top-level summary section — swap columns for `| Route | Locale | Coverage % | Currency % |`.

**Structural analog — RESEARCH.md's `Phase Requirements` table** (lines 73-77): the `| ID | Description | Research Support |` shape models the audit report's failure-list section — one row per failing trans-unit id, columns `| Trans-unit ID | Locale(s) Failing | Failure Type (coverage/currency) | EN Source (truncated) |`.

**Content-shape analog — ARCHITECTURE.md's Pattern-1 write-up** (`.planning/research/ARCHITECTURE.md` lines 172-183): prose explanation immediately followed by a fenced code block, immediately followed by a trade-offs/caveats list — mirror this for the report's stats-274 section (prose finding statement, then the per-locale merged/missing/stale/idDriftFromTemplate breakdown table, then the provenance one-liner).

**Required report sections** (per CONTEXT.md's locked decisions, all must appear):
1. Per-page x per-locale summary table (coverage %, currency %) at the top — NOT a full ~942x5 row enumeration.
2. Detailed failure list underneath, naming only the specific trans-unit ids that fail either check.
3. A separate informational "orphaned ids" section (present in target, absent from EN) — not pass/fail framed. Expected baseline to reproduce: 54 per locale, identical across all 5 (RESEARCH.md Confirmed Baseline).
4. A stats-274 trace section: per-locale merged/missing/stale breakdown PLUS the id-drift-from-current-template classification (expected: 15/21 merged, 6 missing, 0 stale; id-drift-from-template count not yet re-verified, see 52-RESEARCH.md Open Questions #3).
5. `dashboard` route row present with an explicit "excluded — authenticated app surface, see CI-05" annotation, not omitted.
6. Optional JSON sidecar (Claude's Discretion, per CONTEXT.md) — if emitted, write it alongside the markdown at e.g. `.planning/phases/52-full-page-translation-completeness-audit/52-audit-data.json` so Phase 53 can consume it programmatically without re-parsing the markdown tables.

## Shared Patterns

### Trans-unit id/source/target extraction from XLIFF
**Source:** `showcase/angular/scripts/assemble-xliff-target.mjs` line 36 and `showcase/angular/scripts/merge-and-assemble-274.mjs` line 40 (identical regex in both)
**Apply to:** All XLIFF-reading logic in the new script (coverage map, currency map, stats-274 xliffMap)
```javascript
/<trans-unit id="([^"]+)" datatype="html">([\s\S]*?)<\/trans-unit>/g
```
Never build a different regex shape or add attribute-order assumptions — this exact pattern is proven against all 942/996 live trans-units.

### Locale registry single source of truth
**Source:** `showcase/angular/src/app/core/i18n/locale-constants.ts` (full file, 33 lines) via the regex-extraction technique in `showcase/angular/scripts/verify-locale-sync.mjs` lines 10-20
**Apply to:** Deriving `TARGET_LOCALES` for the new script — never hardcode `['es','de','ja','zh-CN','zh-TW']` (explicit WARNING-01 anti-pattern called out in both CONTEXT.md and RESEARCH.md's Don't Hand-Roll table).

### Pass/fail accumulator with streaming console echo
**Source:** `showcase/angular/scripts/verify-hreflang.mjs` lines 28-37 (`record()` function)
**Apply to:** The audit script's per-route/per-locale/per-id verdict logging, adapted so console output streams progress while results simultaneously accumulate into the in-memory structure the markdown-report writer consumes at the end.

### CLI header-comment convention
**Source:** All four analog scripts share this shape (see e.g. `assemble-xliff-target.mjs` lines 1-13)
**Apply to:** Top of `audit-translation-completeness.mjs` — `#!/usr/bin/env node` shebang, `// Phase 52 / AUDIT-01+AUDIT-02 --` attribution comment, a `Usage:` block (even though this script takes no CLI args, state that explicitly: `// Usage: node scripts/audit-translation-completeness.mjs (no args -- audits the full route table)`).

### npm-script wiring — explicitly NOT applicable this phase
**Source:** `showcase/angular/package.json` scripts block (only `lint:i18n` and `verify:hreflang` are npm-scripted; `verify-locale-sync.mjs`, `verify-bundle-budgets.mjs`, `assemble-xliff-target.mjs`, `merge-and-assemble-274.mjs` are all invoked directly via `node scripts/...`, not npm-scripted)
**Apply to:** Do NOT add a `package.json` scripts entry for `audit-translation-completeness.mjs` in this phase — CONTEXT.md and RESEARCH.md both confirm this is diagnostic/temporary, invoked directly (`node showcase/angular/scripts/audit-translation-completeness.mjs`), with npm-script wiring explicitly deferred (Phase 55's `verify-translation-drift.mjs` is the one that gets a permanent CI/npm-script slot).

## No Analog Found

None. Both files in scope have at least a role-match analog; the script has 4 strong composite analogs (exceeding the 3-5 target), and the report has 2 structural analogs within this same milestone's own research documents (no prior audit-report artifact exists in this repo, but the RESEARCH.md/ARCHITECTURE.md table-and-fenced-code convention is directly reusable).

## Metadata

**Analog search scope:** `showcase/angular/scripts/` (all 12 existing `.mjs` files, 5 read in full), `showcase/angular/src/app/core/i18n/` (locale-constants.ts, full), `showcase/angular/src/app/app.routes.ts` (full, 17 lines), `showcase/angular/src/app/layout/showcase-shell/` (nav/mobile markers grepped), `showcase/angular/src/app/pages/stats/` ($localize usage grepped), `showcase/angular/package.json` (scripts block), `.planning/research/ARCHITECTURE.md` (Pattern 1, lines 170-238), `.planning/phases/52-full-page-translation-completeness-audit/52-RESEARCH.md` (Confirmed Baseline + Code Examples sections)
**Files scanned:** 10 read in full or targeted-grepped (5 scripts, 2 source-of-truth TS files, 1 HTML template, 1 package.json, 2 research markdown documents)
**Pattern extraction date:** 2026-07-07
