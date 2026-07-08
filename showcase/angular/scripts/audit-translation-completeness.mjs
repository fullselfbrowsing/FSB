#!/usr/bin/env node
// Phase 52 / AUDIT-01 + AUDIT-02 -- Full-page translation completeness audit.
// Cross-references the showcase's 12-route table against messages.xlf (EN source)
// and the 5 translated XLIFF files, producing a per-route x per-locale coverage
// (marked + target exists) and currency (target matches current EN source) verdict,
// an orphaned-ids report, and a stats-274 JSON->XLIFF merge trace.
//
// This is a DIAGNOSTIC script, not a CI gate: it exits 0 whenever the report is
// successfully generated, regardless of what it finds (drift/missing/orphans are
// expected report CONTENT, not script errors). Exits non-zero only on a genuine
// tool failure (required source file missing, malformed XLIFF breaking the regex).
//
// Usage:
//   node scripts/audit-translation-completeness.mjs   (no args -- audits the full route table)
//
// Run from showcase/angular/ (matches verify-hreflang.mjs's cwd convention):
//   cd showcase/angular && node scripts/audit-translation-completeness.mjs

import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Paths (cwd is expected to be showcase/angular/ -- see Usage above).
// ---------------------------------------------------------------------------
const ROOT = process.cwd();
const APP_SRC = join(ROOT, 'src', 'app');
const LOCALE_DIR = join(ROOT, 'src', 'locale');
const LOCALE_CONSTANTS_PATH = join(APP_SRC, 'core', 'i18n', 'locale-constants.ts');
const SHELL_DIR = join(APP_SRC, 'layout', 'showcase-shell');
const PICKER_DIR = join(APP_SRC, 'layout', 'language-picker');
const REPO_ROOT = join(ROOT, '..', '..');
const PHASE_DIR = join(REPO_ROOT, '.planning', 'phases', '52-full-page-translation-completeness-audit');
const REPORT_OUT = join(PHASE_DIR, '52-AUDIT-REPORT.md');
const DATA_OUT = join(PHASE_DIR, '52-audit-data.json');

// ---------------------------------------------------------------------------
// Stage 2: ROUTE_TABLE -- hardcoded mirror of showcase/angular/src/app/app.routes.ts
// (12 entries; a 12-entry static table doesn't warrant a TS-AST parser).
// `shellless` mirrors the route's own `data: { shellless: true }` flag exactly --
// this is the SAME field ShowcaseShellComponent.updateShellMode() reads at runtime
// (`activeRoute.snapshot.data['shellless'] === true`), so shell/picker marker-union
// below is derived from this per-route flag rather than a separately-maintained
// route-name list (see SUMMARY.md for why: a hardcoded "6 non-shellless routes"
// list would have silently missed `sitemaps` and `legal`, which also lack the
// flag and therefore also render the shared shell nav/footer).
// `dashboard` carries an explicit outOfScope annotation (CI-05) rather than being
// omitted -- it is an authenticated app surface, not marketing content.
// Deliberately excludes the unrouted 13th subdirectory under src/app/pages/ (a
// dead scaffold dir with its own placeholder.* markers, zero matches in either
// routes file) -- since marker extraction below is scoped per-route to each
// route's own componentDir rather than a blanket walk of pages/, that directory
// is never visited and never needs an explicit entry here.
// ---------------------------------------------------------------------------
const ROUTE_TABLE = [
  { path: '', componentDir: 'pages/home', shellless: false, outOfScope: null },
  { path: 'about', componentDir: 'pages/about', shellless: false, outOfScope: null },
  {
    path: 'dashboard',
    componentDir: 'pages/dashboard',
    shellless: false,
    outOfScope: 'authenticated app surface, not marketing content -- see CI-05',
  },
  { path: 'agents', componentDir: 'pages/agents', shellless: false, outOfScope: null },
  { path: 'privacy', componentDir: 'pages/privacy', shellless: false, outOfScope: null },
  { path: 'support', componentDir: 'pages/support', shellless: false, outOfScope: null },
  { path: 'stats', componentDir: 'pages/stats', shellless: true, outOfScope: null },
  { path: 'lattice', componentDir: 'pages/lattice', shellless: true, outOfScope: null },
  { path: 'phantom-stream', componentDir: 'pages/phantom-stream', shellless: true, outOfScope: null },
  { path: 'prometheus', componentDir: 'pages/prometheus', shellless: true, outOfScope: null },
  { path: 'sitemaps', componentDir: 'pages/sitemaps', shellless: false, outOfScope: null },
  { path: 'legal', componentDir: 'pages/legal', shellless: false, outOfScope: null },
];

function displayName(routePath) {
  return routePath === '' ? 'home' : routePath;
}

// ---------------------------------------------------------------------------
// Locale-list derivation (from verify-locale-sync.mjs's extractLocales pattern).
// Never hardcode the target-locale array -- this is the WARNING-01 mistake
// CONTEXT.md explicitly calls out avoiding.
// ---------------------------------------------------------------------------
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

function extractSourceLocale(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const match = text.match(/SOURCE_LOCALE\s*=\s*['"]([^'"]+)['"]/);
  if (!match) {
    throw new Error(`Could not find SOURCE_LOCALE literal in ${filePath}`);
  }
  return match[1];
}

function getTargetLocales() {
  const sourceLocale = extractSourceLocale(LOCALE_CONSTANTS_PATH);
  const all = extractLocales(LOCALE_CONSTANTS_PATH);
  return all.filter((l) => l !== sourceLocale);
}

// ---------------------------------------------------------------------------
// Stage 3: combined trans-unit extractor -- Map<id, {source, target}> per XLIFF.
// This exact regex is proven against all 942/996 live trans-units in this repo
// (assemble-xliff-target.mjs line 36 / merge-and-assemble-274.mjs line 40) --
// do not alter the shape or add attribute-order assumptions.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Stage 5: coverage + currency verdict for a single id.
// ---------------------------------------------------------------------------
function verdictForId(id, enMap, localeMap) {
  const enEntry = enMap.get(id);
  const localeEntry = localeMap.get(id);
  if (!enEntry) return { coverage: null, currency: null, reason: 'id not in EN messages.xlf' };
  if (!localeEntry) return { coverage: 'FAIL', currency: null, reason: 'id missing from target XLIFF entirely' };
  const coverage = (localeEntry.target && localeEntry.target.length > 0) ? 'PASS' : 'FAIL';
  const currency = (localeEntry.source === enEntry.source) ? 'PASS' : 'FAIL';
  return { coverage, currency, reason: null };
}

// ---------------------------------------------------------------------------
// Stage 4: dual-file-type ($$-marked HTML attribute + $localize TS template)
// marker extraction. Confirmed live examples:
//   showcase-shell.component.html line 36:  i18n="@@shell.nav.mobile.home"
//   stats-page.component.ts line 109:       $localize`:@@SHOWCASE_STATS_FSB_VIEW_ACTIVE_NOW:...`
// The TS regex is non-greedy up to the first `:` after `@@`, which correctly
// captures ids even in parameterized forms like
// $localize`:@@stats.metric.topNamed:top: ${top.label}:entityLabel:` (captures
// just "stats.metric.topNamed"; the placeholder/formatting text after it is
// irrelevant to the coverage/currency check).
// ---------------------------------------------------------------------------
const HTML_MARKER_RE = /i18n(?:-[\w-]+)?="@@([^"]+)"/g;
const TS_LOCALIZE_RE = /\$localize`:@@([^:]+):/g;

function walkFiles(root, extensions) {
  const out = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (extensions.some((ext) => entry.endsWith(ext))) out.push(p);
    }
  }
  walk(root);
  return out;
}

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

// For every route: scan its own component_dir. For every route whose OWN
// `shellless` flag is not true, additionally union in the shared shell +
// language-picker marker sets (a shell/picker id is "covered on this page"
// exactly when the page renders the shell -- which app.component.html shows is
// every route except the 4 explicitly flagged shellless: true; see ROUTE_TABLE
// comment above for why this must be derived per-route, not from a separate
// hardcoded route-name list).
function buildRouteMarkedIds(routeTable) {
  const map = new Map(); // routePath -> Set<id>
  for (const route of routeTable) {
    const ids = extractMarkedIds(join(APP_SRC, route.componentDir));
    if (!route.shellless) {
      for (const id of extractMarkedIds(SHELL_DIR)) ids.add(id);
      for (const id of extractMarkedIds(PICKER_DIR)) ids.add(id);
    }
    map.set(route.path, ids);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Stage 6: orphan detection -- ids present in a target XLIFF but absent from
// the current EN messages.xlf. Computed fresh each run (not hardcoded); the
// 54-per-locale figure is only this phase's answer-key expectation, not an
// assumption baked into the script.
// ---------------------------------------------------------------------------
function computeOrphans(enMap, localeMaps, targetLocales) {
  const orphansByLocale = new Map();
  const enIds = new Set(enMap.keys());
  for (const locale of targetLocales) {
    const localeMap = localeMaps.get(locale);
    const orphans = [...localeMap.keys()].filter((id) => !enIds.has(id)).sort();
    orphansByLocale.set(locale, orphans);
  }
  return orphansByLocale;
}

// ---------------------------------------------------------------------------
// Stage 7: read-only stats-274 JSON -> live-XLIFF trace (verbatim per plan's
// <interfaces> block -- do NOT write/merge anything, diagnostic only).
// Known issue (52-RESEARCH.md Open Questions #3): this loop scans ALL jsonIds
// (not just the merged subset), which on a real run produces a DIFFERENT count
// than either of the two other candidate numbers debated during research (7 or
// 9). This is intentional: implemented exactly as specified rather than
// "fixed" to match one of the disputed candidates, and the report explicitly
// flags the resulting count as unreconciled for Phase 53 to resolve.
// ---------------------------------------------------------------------------
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

function getStatsTemplateIds(enMap) {
  return new Set([...enMap.keys()].filter((id) => id.startsWith('SHOWCASE_STATS_FSB_')));
}

function runStats274Trace(targetLocales, localeMaps, enMap) {
  const currentTemplateIds = getStatsTemplateIds(enMap);
  const results = new Map();
  for (const locale of targetLocales) {
    const jsonPath = join(LOCALE_DIR, `translations.stats-274.${locale}.json`);
    try {
      const report = traceStats274(locale, jsonPath, localeMaps.get(locale), currentTemplateIds);
      results.set(locale, { ok: true, ...report });
      record(
        true,
        `stats-274 trace [${locale}]`,
        `merged=${report.merged.length} missingFromXliff=${report.missingFromXliff.length} staleValue=${report.staleValue.length} idDriftFromTemplate=${report.idDriftFromTemplate.length}`
      );
    } catch (err) {
      const message = (err && err.message) || String(err);
      results.set(locale, { ok: false, error: message });
      record(false, `stats-274 trace [${locale}]`, message);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Pass/fail accumulator with streaming console echo (verify-hreflang.mjs
// lines 28-37 pattern). Used for high-level progress milestones (per-route,
// per-locale, per-stage), not one call per individual id -- the full per-id
// verdict detail lives in `verdictEntries` / the generated report instead, to
// keep terminal output proportional to a single diagnostic run.
// ---------------------------------------------------------------------------
const failures = [];
const passes = [];
function record(passed, label, detail) {
  const entry = { label, detail };
  if (passed) passes.push(entry); else failures.push(entry);
  const tag = passed ? 'PASS' : 'FAIL';
  const suffix = detail ? ` -- ${detail}` : '';
  console.log(`${tag}: ${label}${suffix}`);
}

// ---------------------------------------------------------------------------
// Stage 5 (continued): verdict computation across every route x every target
// locale x every marked id on that route. Entries carry {route, locale, id,
// coverage, currency} so the report writer can group by route and by failure
// type (and de-duplicate shared shell/picker ids across routes, per Pitfall 4).
// ---------------------------------------------------------------------------
function computeVerdicts(routeTable, routeMarkedIds, enMap, localeMaps, targetLocales) {
  const entries = [];
  for (const route of routeTable) {
    const ids = routeMarkedIds.get(route.path);
    for (const locale of targetLocales) {
      const localeMap = localeMaps.get(locale);
      let covTotal = 0, covPass = 0, curTotal = 0, curPass = 0;
      for (const id of ids) {
        const verdict = verdictForId(id, enMap, localeMap);
        entries.push({ route: route.path, locale, id, coverage: verdict.coverage, currency: verdict.currency });
        if (verdict.coverage !== null) {
          covTotal += 1;
          if (verdict.coverage === 'PASS') covPass += 1;
        }
        if (verdict.currency !== null) {
          curTotal += 1;
          if (verdict.currency === 'PASS') curPass += 1;
        }
      }
      record(
        covPass === covTotal && curPass === curTotal,
        `[${displayName(route.path)}] locale=${locale}`,
        `coverage ${covPass}/${covTotal}, currency ${curPass}/${curTotal}`
      );
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Stage 8: report writer helpers.
// ---------------------------------------------------------------------------
function pct(pass, total) {
  if (total === 0) return 'n/a';
  return `${((pass / total) * 100).toFixed(1)}%`;
}

function buildRouteLocaleStats(verdictEntries) {
  const stats = new Map(); // `${route}::${locale}` -> {covTotal, covPass, curTotal, curPass}
  for (const e of verdictEntries) {
    const key = `${e.route}::${e.locale}`;
    if (!stats.has(key)) stats.set(key, { covTotal: 0, covPass: 0, curTotal: 0, curPass: 0 });
    const s = stats.get(key);
    if (e.coverage !== null) {
      s.covTotal += 1;
      if (e.coverage === 'PASS') s.covPass += 1;
    }
    if (e.currency !== null) {
      s.curTotal += 1;
      if (e.currency === 'PASS') s.curPass += 1;
    }
  }
  return stats;
}

// Groups failing entries by id (not by route) so a shared shell/picker id that
// fails shows up ONCE with every affected route listed, rather than as N
// separate "failures" for what is a single underlying fact (Pitfall 4).
// `dashboard` is excluded here -- it is out of scope for translation and gets
// its own explicit excluded row in the summary table instead.
function buildFailureIndex(verdictEntries) {
  const index = new Map();
  for (const e of verdictEntries) {
    if (e.route === 'dashboard') continue;
    const isFailure = e.coverage === 'FAIL' || e.currency === 'FAIL';
    if (!isFailure) continue;
    if (!index.has(e.id)) index.set(e.id, { routes: new Set(), locales: new Map() });
    const entry = index.get(e.id);
    entry.routes.add(displayName(e.route));
    entry.locales.set(e.locale, { coverage: e.coverage, currency: e.currency });
  }
  return index;
}

function buildReport(ctx) {
  const { targetLocales, enMap, localeMaps, routeMarkedIds, verdictEntries, orphansByLocale, stats274Results } = ctx;
  const lines = [];
  const now = new Date().toISOString();

  lines.push('# Phase 52 Audit Report: Full-Page Translation Completeness');
  lines.push('');
  lines.push(`Generated: ${now}`);
  lines.push('');
  lines.push(
    'Generated by `showcase/angular/scripts/audit-translation-completeness.mjs` ' +
    '(diagnostic, read-only; no npm-script or CI wiring this phase). Satisfies ' +
    'AUDIT-01 (per-page/per-locale/per-trans-unit coverage vs. currency verdict, ' +
    'distinguished as two separate checks) and AUDIT-02 (stats-274 JSON -> XLIFF ' +
    'merge trace).'
  );
  lines.push('');

  lines.push('## Ground-Truth Baseline (`messages.xlf` family)');
  lines.push('');
  lines.push(`- EN \`messages.xlf\`: ${enMap.size} trans-units.`);
  for (const locale of targetLocales) {
    lines.push(`- \`messages.${locale}.xlf\`: ${localeMaps.get(locale).size} trans-units.`);
  }
  const totalMarkedUnion = new Set();
  for (const ids of routeMarkedIds.values()) for (const id of ids) totalMarkedUnion.add(id);
  lines.push(
    `- Union of marked ids across all 12 routes (incl. shared shell/picker ids, deduplicated): ` +
    `${totalMarkedUnion.size} (a subset of EN's ${enMap.size} total, since messages.xlf also covers ` +
    'any i18n-marked strings outside these 12 routes\' own component dirs / shared shell / picker).'
  );
  lines.push('');

  lines.push('## Route x Shell-Rendering Note (deviation from initial ground truth)');
  lines.push('');
  lines.push(
    'Shell/language-picker marker union is derived dynamically per route from that ' +
    'route\'s own `shellless` flag in `app.routes.ts` (every route where `shellless ' +
    '!== true`), matching exactly how `ShowcaseShellComponent.updateShellMode()` ' +
    'computes it at runtime (`activeRoute.snapshot.data[\'shellless\'] === true`, ' +
    'confirmed by direct read of `showcase-shell.component.ts`). `app.component.html` ' +
    'wraps every route\'s `<router-outlet>` in `<app-showcase-shell>` unconditionally, ' +
    'so shell membership is controlled entirely by the `shellless` route-data flag, not ' +
    'by which routes happen to be named in prior planning documents. This yields **8** ' +
    'shell-rendering routes -- home, about, dashboard, agents, privacy, support, ' +
    '`sitemaps`, and `legal` -- not 6; `sitemaps` and `legal` also lack `shellless: true` ' +
    'in `app.routes.ts` and therefore also render the shared nav/footer (and hence the ' +
    '`shell.*`/`picker.*` marker set). See 52-01-SUMMARY.md for the full deviation note.'
  );
  lines.push('');

  lines.push('## Per-Route x Per-Locale Summary');
  lines.push('');
  lines.push('| Route | Locale | Coverage % | Currency % | Marked IDs on route |');
  lines.push('|---|---|---|---|---|');
  const routeStats = buildRouteLocaleStats(verdictEntries);
  for (const route of ROUTE_TABLE) {
    const name = displayName(route.path);
    const markedCount = routeMarkedIds.get(route.path).size;
    if (route.outOfScope) {
      lines.push(`| ${name} | ALL | excluded -- ${route.outOfScope} | n/a | ${markedCount} |`);
      continue;
    }
    for (const locale of targetLocales) {
      const s = routeStats.get(`${route.path}::${locale}`) || { covTotal: 0, covPass: 0, curTotal: 0, curPass: 0 };
      lines.push(
        `| ${name} | ${locale} | ${pct(s.covPass, s.covTotal)} (${s.covPass}/${s.covTotal}) | ` +
        `${pct(s.curPass, s.curTotal)} (${s.curPass}/${s.curTotal}) | ${markedCount} |`
      );
    }
  }
  lines.push('');

  lines.push('## Detailed Failure List');
  lines.push('');
  lines.push(
    'One entry per failing trans-unit id (coverage FAIL or currency FAIL in at least ' +
    'one locale) -- not a full enumeration of every passing id. `dashboard` is excluded ' +
    '(out of scope for translation, see summary table above). Shared shell/picker ids ' +
    'that fail are listed once here even though they render on multiple routes; the ' +
    '`Routes` line names every affected route so this is not mistaken for N separate bugs.'
  );
  lines.push('');
  const failureIndex = buildFailureIndex(verdictEntries);
  const sortedFailIds = [...failureIndex.keys()].sort();
  if (sortedFailIds.length === 0) {
    lines.push('No coverage or currency failures found.');
    lines.push('');
  } else {
    for (const id of sortedFailIds) {
      const entry = failureIndex.get(id);
      lines.push(`### \`${id}\``);
      lines.push(`Routes: ${[...entry.routes].sort().join(', ')}`);
      for (const locale of targetLocales) {
        const v = entry.locales.get(locale);
        if (!v) continue;
        const curDisplay = v.currency === null ? 'N/A (id missing from target XLIFF)' : v.currency;
        lines.push(`- ${locale}: coverage=${v.coverage} currency=${curDisplay}`);
      }
      lines.push('');
    }
  }

  lines.push('## Orphaned IDs (present in target XLIFF, absent from current EN `messages.xlf`)');
  lines.push('');
  lines.push(
    'Informational only -- not a pass/fail check. These ids exist in a locale\'s XLIFF ' +
    'file but have no corresponding trans-unit in the current `messages.xlf`, meaning the ' +
    'EN source string was renamed/removed since the locale file was last generated (or the ' +
    'id is otherwise stale from a prior template revision).'
  );
  lines.push('');
  for (const locale of targetLocales) {
    const orphans = orphansByLocale.get(locale);
    lines.push(`### ${locale} (${orphans.length} orphaned ids)`);
    lines.push('');
    for (const id of orphans) lines.push(`- \`${id}\``);
    lines.push('');
  }

  lines.push('## Stats-274 Trace (AUDIT-02)');
  lines.push('');
  lines.push(
    'Provenance: `translations.stats-274.*.json` files introduced in commit `46e36899`; ' +
    'some of their ids were later renamed/removed from the live template in hardening ' +
    'commits `da356602` and `931bc5af`, without corresponding JSON/XLIFF cleanup.'
  );
  lines.push('');
  for (const locale of targetLocales) {
    const r = stats274Results.get(locale);
    lines.push(`### ${locale}`);
    lines.push('');
    if (!r.ok) {
      lines.push(`ERROR: ${r.error}`);
      lines.push('');
      continue;
    }
    const totalKeys = r.merged.length + r.missingFromXliff.length + r.staleValue.length;
    lines.push(
      `COMPLETE: ${r.merged.length}/${totalKeys} keys present as filled \`<target>\` ` +
      `(${r.missingFromXliff.length} missing entirely, ${r.staleValue.length} stale-value).`
    );
    lines.push('');
    lines.push(
      `id-drift-from-template count: ${r.idDriftFromTemplate.length} -- NOT reconciled with ` +
      'prior research (52-RESEARCH.md Open Questions #3 found 3 disputed candidate values -- 7, ' +
      '9, or 13 -- depending on which subset of the JSON\'s ids the drift computation is scoped ' +
      'to). This script implements the trace loop exactly as specified in the plan\'s ' +
      '`<interfaces>` block, scanning ALL of the JSON\'s ids against the current EN template\'s ' +
      '`SHOWCASE_STATS_FSB_*` set. Treat this number as a script-computed data point for Phase 53 ' +
      'to reconcile, not a settled fact.'
    );
    lines.push('');
    lines.push(`- merged (${r.merged.length}): ${r.merged.slice().sort().join(', ') || 'none'}`);
    lines.push(`- missingFromXliff (${r.missingFromXliff.length}): ${r.missingFromXliff.slice().sort().join(', ') || 'none'}`);
    lines.push(`- staleValue (${r.staleValue.length}): ${r.staleValue.slice().sort().join(', ') || 'none'}`);
    lines.push(`- idDriftFromTemplate (${r.idDriftFromTemplate.length}): ${r.idDriftFromTemplate.slice().sort().join(', ') || 'none'}`);
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

function buildDataSidecar(ctx) {
  const { targetLocales, routeMarkedIds, verdictEntries, orphansByLocale, stats274Results } = ctx;
  return {
    generatedAt: new Date().toISOString(),
    targetLocales,
    routes: ROUTE_TABLE.map((r) => ({
      path: r.path,
      componentDir: r.componentDir,
      shellless: r.shellless,
      outOfScope: r.outOfScope,
      markedIdCount: routeMarkedIds.get(r.path).size,
    })),
    verdicts: verdictEntries,
    orphansByLocale: Object.fromEntries(orphansByLocale),
    stats274: Object.fromEntries(stats274Results),
  };
}

// ---------------------------------------------------------------------------
// Stage 9: exit-code semantics -- deliberate deviation from every verify-*.mjs
// analog. Those scripts exit(1) when they find a problem (CI should block).
// This script's job is the opposite: succeed (exit 0) whenever the report is
// successfully generated, regardless of what stages 5-7 found -- coverage /
// currency failures, orphans, and stats-274 drift are all EXPECTED report
// CONTENT (this script's entire purpose is to surface them), not tool errors.
// Exit 2 (matching assemble-xliff-target.mjs's fatal-precondition convention)
// only when a required source file is missing or an XLIFF is malformed enough
// to yield zero trans-units where hundreds are expected.
// ---------------------------------------------------------------------------
function requireFile(path, label) {
  if (!existsSync(path)) {
    console.error(`FATAL: required file missing: ${label} (${path})`);
    process.exit(2); // fatal precondition -- NOT a "findings" exit, see Stage 9 comment above.
  }
}

function main() {
  console.log('Phase 52 / AUDIT-01 + AUDIT-02 -- audit-translation-completeness.mjs starting...');
  console.log('');

  requireFile(LOCALE_CONSTANTS_PATH, 'locale-constants.ts');
  let targetLocales;
  try {
    targetLocales = getTargetLocales();
  } catch (err) {
    console.error(`FATAL: ${(err && err.message) || err}`);
    process.exit(2); // fatal precondition -- see Stage 9 comment above.
  }
  console.log(`Target locales (derived from locale-constants.ts, never hardcoded): ${targetLocales.join(', ')}`);
  console.log('');

  const enXliffPath = join(LOCALE_DIR, 'messages.xlf');
  requireFile(enXliffPath, 'messages.xlf (EN source)');
  const enMap = extractTransUnits(readFileSync(enXliffPath, 'utf8'));
  if (enMap.size === 0) {
    console.error('FATAL: extracted zero trans-units from messages.xlf -- regex/file mismatch.');
    process.exit(2); // fatal precondition -- see Stage 9 comment above.
  }
  console.log(`messages.xlf (EN): ${enMap.size} trans-units.`);

  const localeMaps = new Map();
  for (const locale of targetLocales) {
    const p = join(LOCALE_DIR, `messages.${locale}.xlf`);
    requireFile(p, `messages.${locale}.xlf`);
    const map = extractTransUnits(readFileSync(p, 'utf8'));
    if (map.size === 0) {
      console.error(`FATAL: extracted zero trans-units from messages.${locale}.xlf -- regex/file mismatch.`);
      process.exit(2); // fatal precondition -- see Stage 9 comment above.
    }
    localeMaps.set(locale, map);
    console.log(`messages.${locale}.xlf: ${map.size} trans-units.`);
  }
  console.log('');

  const routeMarkedIds = buildRouteMarkedIds(ROUTE_TABLE);
  for (const route of ROUTE_TABLE) {
    const ids = routeMarkedIds.get(route.path);
    const scopeNote = route.outOfScope ? ` (OUT OF SCOPE: ${route.outOfScope})` : '';
    console.log(`Route [${displayName(route.path)}]: ${ids.size} marked ids${scopeNote}`);
  }
  console.log('');

  const verdictEntries = computeVerdicts(ROUTE_TABLE, routeMarkedIds, enMap, localeMaps, targetLocales);
  console.log('');

  const orphansByLocale = computeOrphans(enMap, localeMaps, targetLocales);
  for (const locale of targetLocales) {
    const orphans = orphansByLocale.get(locale);
    record(orphans.length === 0, `orphan-check [${locale}]`, `${orphans.length} ids in target absent from EN`);
  }
  console.log('');

  const stats274Results = runStats274Trace(targetLocales, localeMaps, enMap);
  console.log('');

  const reportMd = buildReport({ targetLocales, enMap, localeMaps, routeMarkedIds, verdictEntries, orphansByLocale, stats274Results });
  writeFileSync(REPORT_OUT, reportMd, 'utf8');
  console.log(`Wrote report: ${REPORT_OUT}`);

  const dataJson = buildDataSidecar({ targetLocales, routeMarkedIds, verdictEntries, orphansByLocale, stats274Results });
  writeFileSync(DATA_OUT, JSON.stringify(dataJson, null, 2), 'utf8');
  console.log(`Wrote data sidecar: ${DATA_OUT}`);

  console.log('');
  console.log(`Progress-log tally: ${passes.length} pass, ${failures.length} fail (see report for authoritative per-id verdicts).`);
  console.log('Report generated successfully -- exiting 0 regardless of findings (diagnostic script, not a CI gate; see Stage 9 comment above).');
  process.exit(0); // success = "report generated", not "zero findings" -- see Stage 9 comment above.
}

main();
