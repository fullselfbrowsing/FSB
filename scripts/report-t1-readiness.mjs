#!/usr/bin/env node
/**
 * Phase 44 / Plan 01 (v1.1.0 T1 App Execution Expansion) -- T1 readiness
 * matrix generator.
 *
 * The report is generated from the shipped catalog plus the same capability
 * resolver used by invoke_capability. It is intentionally conservative: a row is
 * t1-ready only when resolve() reaches a T0/T1a/T1b recipe or handler proof, and
 * known guarded writes stay fail-closed until live mutation-body UAT promotes them.
 *
 * Run: node scripts/report-t1-readiness.mjs
 */

'use strict';

import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

export const PHASE_DIR = join(ROOT, '.planning', 'phases', '44-t1-readiness-inventory-status-surface');
export const JSON_OUT = join(PHASE_DIR, '44-T1-READINESS.json');
export const MD_OUT = join(PHASE_DIR, '44-T1-READINESS.md');

export const READINESS_STATUSES = [
  't1-ready',
  't1-guarded-fail-closed',
  'learn-pending',
  'discovery-pending',
  'blocked',
  'unknown',
];

export const GUARDED_FAIL_CLOSED_SLUGS = [
  'github.issues.create',
  'gitlab.create_issue',
  'gitlab.create_merge_request',
  'gitlab.create_note',
  'slack.send_message',
  'robinhood.create_watchlist',
  'robinhood.delete_watchlist',
  'ubereats.place_order',
  'ubereats.cancel_order',
];

const HANDLER_MODULES = [
  'github.js',
  'slack.js',
  'notion.js',
  'gitlab.js',
  'netlify.js',
  'bitbucket.js',
  'circleci.js',
  'vercel.js',
  'retool.js',
  'asana.js',
  'robinhood.js',
  'doordash.js',
  'ubereats.js',
];
const EXECUTABLE_TIERS = new Set(['T0', 'T1a', 'T1b']);
const GUARDED_SET = new Set(GUARDED_FAIL_CLOSED_SLUGS);

function normalizeBacking(value) {
  const b = String(value || '').toLowerCase();
  if (b === 'recipe' || b === 'handler' || b === 'learn' || b === 'dom') return b;
  return 'dom';
}

function normalizeSideEffectClass(value) {
  const c = String(value || '').toLowerCase();
  if (c === 'destructive' || c === 'delete') return 'destructive';
  if (c === 'mutate' || c === 'mutating' || c === 'write' || c === 'writes') return 'write';
  return 'read';
}

function appFromSlug(slug) {
  const s = String(slug || '');
  if (s.indexOf('opentabs__') === 0) {
    const parts = s.split('__');
    return parts[1] || s;
  }
  const dot = s.indexOf('.');
  return dot === -1 ? s : s.slice(0, dot);
}

function originForService(service) {
  const raw = String(service || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return safeOrigin(raw);
  return safeOrigin('https://' + raw);
}

function safeOrigin(value) {
  try { return new URL(String(value || '')).origin; } catch (_e) { return ''; }
}

function safeHost(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch (_e) { return ''; }
}

function sameSiteHost(a, b) {
  const ah = safeHost(a);
  const bh = safeHost(b);
  if (!ah || !bh) return false;
  return ah === bh || ah.endsWith('.' + bh) || bh.endsWith('.' + ah);
}

function loadCatalog() {
  return require(join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js'));
}

function buildResolver(catalog) {
  globalThis.FsbRecipeIndex = catalog;

  for (const mod of HANDLER_MODULES) {
    try {
      require(join(ROOT, 'extension', 'catalog', 'handlers', mod));
    } catch (_e) {
      // Best-effort. Missing handler modules cause their slugs to fail the gate
      // instead of being reported ready.
    }
  }

  const CAT = require(join(ROOT, 'extension', 'utils', 'capability-catalog.js'));
  if (CAT && typeof CAT.seedHeadHandlers === 'function') {
    try { CAT.seedHeadHandlers(); } catch (_e) { /* reported by validation later */ }
  }
  return CAT && typeof CAT.resolve === 'function' ? CAT.resolve : null;
}

function buildOriginClassifier() {
  try {
    const denylist = require(join(ROOT, 'extension', 'utils', 'service-denylist.js'));
    const config = require(join(ROOT, 'extension', 'config', 'service-denylist.json'));
    if (denylist && typeof denylist._setForTest === 'function') {
      denylist._setForTest(config);
    }
    if (denylist && typeof denylist.classify === 'function') {
      return function classify(origin) {
        return denylist.classify(origin);
      };
    }
  } catch (_e) {
    // Fall through to unknown.
  }
  return function classifyUnknown() {
    return null;
  };
}

function classifyOrigin(origin, classifyFn) {
  let cls = null;
  try { cls = classifyFn ? classifyFn(origin) : null; } catch (_e) { cls = null; }
  if (!cls || typeof cls !== 'object') return { originClass: 'unknown', denied: false, sensitive: false };
  if (cls.denied) return { originClass: 'denied', denied: true, sensitive: true };
  if (cls.sensitive) return { originClass: 'sensitive', denied: false, sensitive: true };
  return { originClass: 'standard', denied: false, sensitive: false };
}

function proofForResolved(resolved) {
  if (!resolved || typeof resolved !== 'object') return { proof: 'none', hasHandlerProof: false, hasRecipeProof: false };
  if (resolved.tier === 'T1a' && resolved.handler && typeof resolved.handler.handle === 'function') {
    return { proof: 'handler', hasHandlerProof: true, hasRecipeProof: false };
  }
  if ((resolved.tier === 'T0' || resolved.tier === 'T1b') && resolved.recipe) {
    return { proof: 'recipe', hasHandlerProof: false, hasRecipeProof: true };
  }
  return { proof: 'none', hasHandlerProof: false, hasRecipeProof: false };
}

function authPatternFor(desc, resolved, backing, proof) {
  if (resolved && resolved.recipe && resolved.recipe.authStrategy) return resolved.recipe.authStrategy;
  if (proof === 'handler') return 'bound-handler';
  if (backing === 'learn' || (resolved && resolved.tier === 'T2')) return 'network-capture';
  if (backing === 'dom' || (resolved && resolved.tier === 'T3')) return 'dom-discovery';
  return 'unknown';
}

function isGapiCandidate(row) {
  const app = row.app;
  const service = String(row.service || '').toLowerCase();
  return app === 'gmail' || app === 'gdrive' || app === 'gdocs' || app === 'gsheets' ||
    app === 'gcalendar' || service.indexOf('google.com') !== -1 ||
    service.indexOf('googleapis.com') !== -1;
}

function isPatternDCandidate(row) {
  const app = row.app;
  const service = String(row.service || '').toLowerCase();
  const patternApps = new Set([
    'airtable', 'asana', 'aws', 'azure', 'clickup', 'confluence', 'datadog',
    'jira', 'linear', 'posthog', 'salesforce', 'sentry', 'shopify', 'zendesk',
  ]);
  return patternApps.has(app) ||
    service.indexOf('atlassian.net') !== -1 ||
    service.indexOf('myshopify.com') !== -1 ||
    service.indexOf('force.com') !== -1;
}

function routeFeasibilityFor(row, descriptorOrigin, runtimeOrigin) {
  if (row.readiness === 'blocked') return 'blocked';
  if (row.readiness === 'learn-pending') return 'capture-required';
  if (row.readiness === 't1-ready' || row.readiness === 't1-guarded-fail-closed') {
    if (runtimeOrigin && descriptorOrigin && runtimeOrigin === descriptorOrigin) return 'same-origin-proven';
    if (runtimeOrigin && descriptorOrigin && sameSiteHost(runtimeOrigin, descriptorOrigin)) return 'same-site-subdomain-proven';
    return 'separate-origin-proven';
  }
  if (isGapiCandidate(row)) return 'gapi-bridge-candidate';
  if (isPatternDCandidate(row)) return 'pattern-d-candidate';
  if (row.sideEffectClass === 'read') return 'same-origin-read-candidate';
  return 'dom-discovery-only';
}

function nextActionFor(row) {
  if (row.readiness === 'blocked') return 'keep blocked';
  if (row.readiness === 't1-guarded-fail-closed') return 'live mutation-body UAT';
  if (row.readiness === 't1-ready') return 'already executable';
  if (row.readiness === 'learn-pending') return 'learn via network capture';
  if (row.routeFeasibility === 'gapi-bridge-candidate') return 'GAPI bridge candidate';
  if (row.routeFeasibility === 'pattern-d-candidate') return 'Pattern-D candidate';
  if (row.routeFeasibility === 'same-origin-read-candidate') return 'same-origin read candidate';
  return 'keep DOM/discovery';
}

function readinessFor(desc, resolved, originInfo, proof) {
  if (originInfo.denied) return 'blocked';
  if (GUARDED_SET.has(desc.slug)) return 't1-guarded-fail-closed';
  if (resolved && EXECUTABLE_TIERS.has(resolved.tier) && (proof.hasHandlerProof || proof.hasRecipeProof)) {
    return 't1-ready';
  }
  if ((resolved && resolved.tier === 'T2') || normalizeBacking(desc.backing) === 'learn') return 'learn-pending';
  if (resolved && resolved.tier === 'T3') return 'discovery-pending';
  if (normalizeBacking(desc.backing) === 'dom') return 'discovery-pending';
  return 'unknown';
}

function emptyRollup() {
  return {
    descriptors: 0,
    ready: 0,
    guarded: 0,
    learnPending: 0,
    discoveryPending: 0,
    blocked: 0,
    unknown: 0,
    read: 0,
    write: 0,
    destructive: 0,
  };
}

function addRollup(rollup, row) {
  rollup.descriptors += 1;
  if (row.readiness === 't1-ready') rollup.ready += 1;
  else if (row.readiness === 't1-guarded-fail-closed') rollup.guarded += 1;
  else if (row.readiness === 'learn-pending') rollup.learnPending += 1;
  else if (row.readiness === 'discovery-pending') rollup.discoveryPending += 1;
  else if (row.readiness === 'blocked') rollup.blocked += 1;
  else rollup.unknown += 1;

  if (row.sideEffectClass === 'destructive') rollup.destructive += 1;
  else if (row.sideEffectClass === 'write') rollup.write += 1;
  else rollup.read += 1;
}

function summarizeRows(rows) {
  const totals = emptyRollup();
  const byApp = Object.create(null);
  const byService = Object.create(null);
  const appStems = new Set();
  const services = new Set();
  const tiers = Object.create(null);
  const backings = Object.create(null);

  for (const row of rows) {
    addRollup(totals, row);
    appStems.add(row.app);
    services.add(row.service);
    tiers[row.resolvedTier] = (tiers[row.resolvedTier] || 0) + 1;
    backings[row.backing] = (backings[row.backing] || 0) + 1;
    if (!byApp[row.app]) byApp[row.app] = emptyRollup();
    if (!byService[row.service]) byService[row.service] = emptyRollup();
    addRollup(byApp[row.app], row);
    addRollup(byService[row.service], row);
  }

  totals.appStems = appStems.size;
  totals.services = services.size;
  return { totals, byApp, byService, tiers, backings };
}

function topRows(rows, predicate, limit) {
  return rows.filter(predicate).slice(0, limit || 25).map(function(row) {
    return row.slug + ' (' + row.service + ')';
  });
}

function buildCandidates(rows) {
  return {
    sameOriginReads: topRows(rows, function(row) {
      return row.readiness === 'discovery-pending' && row.nextAction === 'same-origin read candidate';
    }, 30),
    patternD: topRows(rows, function(row) {
      return row.readiness === 'discovery-pending' && row.nextAction === 'Pattern-D candidate';
    }, 30),
    gapiBridge: topRows(rows, function(row) {
      return row.readiness === 'discovery-pending' && row.nextAction === 'GAPI bridge candidate';
    }, 30),
    guardedWrites: topRows(rows, function(row) {
      return row.readiness === 't1-guarded-fail-closed';
    }, 30),
  };
}

export function reportReadiness(catalog, opts) {
  const idx = catalog && typeof catalog === 'object' ? catalog : loadCatalog();
  const descriptors = Array.isArray(idx.descriptors) ? idx.descriptors : [];
  const resolveFn = (opts && opts.resolveFn) || buildResolver(idx);
  const classifyFn = (opts && opts.classifyOrigin) || buildOriginClassifier();

  const rows = [];
  for (const desc of descriptors) {
    if (!desc || typeof desc.slug !== 'string') continue;
    const descriptorOrigin = originForService(desc.service);
    let resolved = null;
    try { resolved = resolveFn ? resolveFn(desc.slug, descriptorOrigin) : null; } catch (_e) { resolved = null; }

    const proof = proofForResolved(resolved);
    const runtimeOrigin = safeOrigin(
      (resolved && resolved.origin) ||
      (resolved && resolved.recipe && resolved.recipe.origin) ||
      descriptorOrigin
    );
    const originInfo = classifyOrigin(runtimeOrigin || descriptorOrigin, classifyFn);
    const row = {
      slug: desc.slug,
      app: appFromSlug(desc.slug),
      service: String(desc.service || ''),
      sideEffectClass: normalizeSideEffectClass(desc.sideEffectClass),
      backing: normalizeBacking(desc.backing),
      resolvedTier: resolved && typeof resolved.tier === 'string' ? resolved.tier : 'null',
      readiness: 'unknown',
      runtimeOrigin: runtimeOrigin || descriptorOrigin,
      originClass: originInfo.originClass,
      authPattern: authPatternFor(desc, resolved, normalizeBacking(desc.backing), proof.proof),
      routeFeasibility: 'unknown',
      nextAction: 'unknown',
      proof: proof.proof,
      hasHandlerProof: proof.hasHandlerProof,
      hasRecipeProof: proof.hasRecipeProof,
    };

    row.readiness = readinessFor(desc, resolved, originInfo, proof);
    row.routeFeasibility = routeFeasibilityFor(row, descriptorOrigin, runtimeOrigin || descriptorOrigin);
    row.nextAction = nextActionFor(row);
    rows.push(row);
  }

  rows.sort(function(a, b) {
    return a.slug === b.slug ? a.service.localeCompare(b.service) : a.slug.localeCompare(b.slug);
  });

  const summary = summarizeRows(rows);
  return {
    generatedAt: new Date().toISOString(),
    descriptorCount: descriptors.length,
    rowCount: rows.length,
    rows,
    totals: summary.totals,
    tiers: summary.tiers,
    backings: summary.backings,
    byApp: summary.byApp,
    byService: summary.byService,
    candidates: buildCandidates(rows),
  };
}

export function validateReadinessRows(rows, opts) {
  const failures = [];
  const list = Array.isArray(rows) ? rows : [];
  const expectedDescriptorCount = opts && Number.isFinite(opts.expectedDescriptorCount)
    ? opts.expectedDescriptorCount
    : null;
  const allowed = new Set(READINESS_STATUSES);
  const seen = new Set();
  const required = [
    'slug',
    'app',
    'service',
    'sideEffectClass',
    'backing',
    'resolvedTier',
    'readiness',
    'originClass',
    'authPattern',
    'routeFeasibility',
    'nextAction',
  ];

  if (expectedDescriptorCount !== null && list.length !== expectedDescriptorCount) {
    failures.push('row count ' + list.length + ' does not equal descriptor count ' + expectedDescriptorCount);
  }

  for (const row of list) {
    if (!row || typeof row !== 'object') {
      failures.push('row is not an object');
      continue;
    }
    for (const field of required) {
      if (row[field] === undefined || row[field] === null || row[field] === '') {
        failures.push(String(row.slug || '(unknown)') + ' missing required field ' + field);
      }
    }
    if (typeof row.slug === 'string') {
      if (seen.has(row.slug)) failures.push('duplicate slug in readiness rows: ' + row.slug);
      seen.add(row.slug);
    }
    if (!allowed.has(row.readiness)) {
      failures.push(row.slug + ' has invalid readiness status ' + String(row.readiness));
    }
    if (row.readiness === 't1-ready') {
      if (!EXECUTABLE_TIERS.has(row.resolvedTier)) {
        failures.push(row.slug + ' is t1-ready but resolvedTier is ' + row.resolvedTier);
      }
      if (!(row.hasHandlerProof || row.hasRecipeProof)) {
        failures.push(row.slug + ' is t1-ready but has no handler/recipe proof');
      }
    }
    if (GUARDED_SET.has(row.slug) && row.readiness !== 't1-guarded-fail-closed') {
      failures.push(row.slug + ' is a guarded fail-closed write but readiness is ' + row.readiness);
    }
    if (row.backing === 'handler' && row.originClass !== 'denied' && row.resolvedTier !== 'T1a') {
      failures.push(row.slug + ' is handler-backed but did not resolve to T1a');
    }
    if (row.backing === 'recipe' && row.originClass !== 'denied' &&
        row.resolvedTier !== 'T0' && row.resolvedTier !== 'T1b') {
      failures.push(row.slug + ' is recipe-backed but did not resolve to T0/T1b');
    }
    if (row.readiness === 'unknown') {
      failures.push(row.slug + ' has unknown readiness');
    }
  }

  return { failures };
}

export function validateReadinessReport(report, catalog) {
  const expected = catalog && Array.isArray(catalog.descriptors) ? catalog.descriptors.length : null;
  const failures = [];
  if (!report || typeof report !== 'object') {
    return { failures: ['report is not an object'] };
  }
  if (!Array.isArray(report.rows)) {
    return { failures: ['report.rows is missing or not an array'] };
  }
  failures.push(...validateReadinessRows(report.rows, { expectedDescriptorCount: expected }).failures);
  if (report.rowCount !== report.rows.length) {
    failures.push('report.rowCount ' + report.rowCount + ' does not match rows length ' + report.rows.length);
  }
  if (expected !== null && report.descriptorCount !== expected) {
    failures.push('report.descriptorCount ' + report.descriptorCount + ' does not match catalog descriptors ' + expected);
  }
  return { failures };
}

function markdownList(items) {
  if (!items || !items.length) return '- None in current report.';
  return items.map(function(item) { return '- `' + item.replace(/ \(/, '` ('); }).join('\n');
}

function rollupRows(byApp) {
  return Object.keys(byApp).sort().map(function(app) {
    const r = byApp[app];
    return '| `' + app + '` | ' + r.descriptors + ' | ' + r.ready + ' | ' + r.guarded +
      ' | ' + r.learnPending + ' | ' + r.discoveryPending + ' | ' + r.blocked + ' |';
  }).join('\n');
}

export function renderMarkdown(report) {
  const t = report.totals;
  const tierT1 = (report.tiers.T0 || 0) + (report.tiers.T1a || 0) + (report.tiers.T1b || 0);
  const catalogTail = t.discoveryPending + t.learnPending + t.blocked;
  return [
    '# Phase 44 T1 Readiness Matrix',
    '',
    '**Generated:** ' + report.generatedAt,
    '',
    'This report is generated from `extension/catalog/recipe-index.generated.js` plus the live `capability-catalog.js` resolver. It is the v1.1.0 truth surface: catalog/search support means a capability is searchable and routable, not that every app has direct API execution today.',
    '',
    '## Baseline',
    '',
    '| Metric | Count |',
    '|--------|------:|',
    '| Total descriptors | ' + t.descriptors + ' |',
    '| App stems | ' + t.appStems + ' |',
    '| Distinct service hosts | ' + t.services + ' |',
    '| T0/T1a/T1b resolved descriptors | ' + tierT1 + ' |',
    '| T1 ready executable descriptors | ' + t.ready + ' |',
    '| T1 guarded fail-closed writes | ' + t.guarded + ' |',
    '| Learn-pending descriptors | ' + t.learnPending + ' |',
    '| DOM/discovery-pending descriptors | ' + t.discoveryPending + ' |',
    '| Blocked descriptors | ' + t.blocked + ' |',
    '| Catalog tail not direct API-ready | ' + catalogTail + ' |',
    '',
    '## What This Means',
    '',
    'The catalog spans ' + t.appStems + ' app stems. That 128-app breadth is catalog/search support, not direct API execution for every app. `invoke_capability` executes only proven T0/T1a/T1b handlers or recipes today; guarded writes return fail-closed pending UAT; the remaining ' + catalogTail + '-descriptor tail stays DOM/discovery, learn-pending, or blocked by denylist.',
    '',
    'Non-denied origins are allowed under Auto for ordinary capability invoke. Denylisted origins remain blocked. Sensitive origins are flagged in UI/audit records, while extra confirmation remains scoped to network-capture discovery.',
    '',
    '## Readiness Totals',
    '',
    '| Status | Count |',
    '|--------|------:|',
    '| t1-ready | ' + t.ready + ' |',
    '| t1-guarded-fail-closed | ' + t.guarded + ' |',
    '| learn-pending | ' + t.learnPending + ' |',
    '| discovery-pending | ' + t.discoveryPending + ' |',
    '| blocked | ' + t.blocked + ' |',
    '| unknown | ' + t.unknown + ' |',
    '',
    '## Per-App Rollup',
    '',
    '| App | Total | Ready | Guarded | Learn | Discovery | Blocked |',
    '|-----|------:|------:|--------:|------:|----------:|--------:|',
    rollupRows(report.byApp),
    '',
    '## Next-Batch Candidates',
    '',
    '### Same-Origin Reads',
    markdownList(report.candidates.sameOriginReads),
    '',
    '### Pattern-D Candidates',
    markdownList(report.candidates.patternD),
    '',
    '### GAPI Bridge Candidates',
    markdownList(report.candidates.gapiBridge),
    '',
    '### Guarded Writes',
    markdownList(report.candidates.guardedWrites),
    '',
    '## Machine-Readable Matrix',
    '',
    'The full per-descriptor matrix is written to `44-T1-READINESS.json` with one row per descriptor.',
    '',
  ].join('\n');
}

export function writeReport(report, paths) {
  const jsonPath = (paths && paths.jsonPath) || JSON_OUT;
  const mdPath = (paths && paths.mdPath) || MD_OUT;
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(mdPath, renderMarkdown(report));
}

function printSummary(report) {
  const t = report.totals;
  console.log('t1-readiness-report: descriptors=' + t.descriptors +
    ' apps=' + t.appStems +
    ' ready=' + t.ready +
    ' guarded=' + t.guarded +
    ' learn=' + t.learnPending +
    ' discovery=' + t.discoveryPending +
    ' blocked=' + t.blocked);
}

function runCli() {
  const catalog = loadCatalog();
  const report = reportReadiness(catalog);
  const validation = validateReadinessReport(report, catalog);
  writeReport(report);
  printSummary(report);
  if (validation.failures.length) {
    console.error('t1-readiness-report: FAIL (' + validation.failures.length + ' validation failures)');
    for (const failure of validation.failures) console.error('  - ' + failure);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli();
  } catch (err) {
    console.error('t1-readiness-report: ERROR ' + (err && err.message ? err.message : String(err)));
    process.exit(1);
  }
}
