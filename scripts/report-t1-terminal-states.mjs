#!/usr/bin/env node
/**
 * Phase 51 -- terminal-state and UAT ledger report.
 *
 * This report is deliberately conservative. It accounts for every descriptor,
 * records why non-ready rows are not executable, and keeps bridge/write rows from
 * being mistaken for T1-ready runtime behavior.
 */

'use strict';

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

import { loadCatalog, reportReadiness, validateReadinessReport } from './report-t1-readiness.mjs';
import { buildTailWorklist, validateTailWorklist } from './report-t1-tail-worklist.mjs';
import { bridgeDecisionFor } from './verify-pattern-d-gapi-gate.mjs';
import { loadEvidence, validateWriteActivationEvidence } from './verify-write-activation-evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

export const PHASE_DIR = join(ROOT, '.planning', 'phases', '51-full-t1-tail-migration-across-remaining-catalog');
export const TERMINAL_JSON_OUT = join(PHASE_DIR, '51-T1-TERMINAL-STATES.json');
export const TERMINAL_MD_OUT = join(PHASE_DIR, '51-T1-TERMINAL-STATES.md');
export const WRITE_LEDGER_JSON_OUT = join(PHASE_DIR, '51-WRITE-UAT-LEDGER.json');
export const WRITE_LEDGER_MD_OUT = join(PHASE_DIR, '51-WRITE-UAT-LEDGER.md');

const APP_STATUS_PRIORITY = [
  'blocked',
  'bridge-needed',
  'uat-needed',
  'degraded-discovery-pending',
  'guarded-fail-closed',
  't1-ready',
];

function increment(map, key) {
  const k = String(key || 'unknown');
  map[k] = (map[k] || 0) + 1;
}

function isWriteLike(row) {
  return row && (row.sideEffectClass === 'write' || row.sideEffectClass === 'destructive');
}

function surfaceStatusFor(row, tailRow) {
  if (row.readiness === 't1-ready') return 't1-ready';
  if (row.readiness === 't1-guarded-fail-closed') return 'guarded-fail-closed';
  if (row.readiness === 'blocked' || (tailRow && tailRow.workstream === 'blocked-policy')) return 'blocked';
  if (tailRow && (tailRow.workstream === 'pattern-d' || tailRow.workstream === 'gapi-bridge')) return 'bridge-needed';
  if (tailRow && tailRow.workstream === 'write-destructive-uat') return 'uat-needed';
  return 'degraded-discovery-pending';
}

function terminalStateFor(row, tailRow) {
  if (row.readiness === 't1-ready') return 't1-ready';
  if (row.readiness === 't1-guarded-fail-closed') return 'guarded-fail-closed';
  if (!tailRow) return 'unknown-non-ready';
  if (tailRow.workstream === 'blocked-policy') return 'blocked-policy';
  if (tailRow.workstream === 'pattern-d') return 'pattern-d-bridge-blocked';
  if (tailRow.workstream === 'gapi-bridge') return 'gapi-bridge-blocked';
  if (tailRow.workstream === 'write-destructive-uat') return 'live-uat-required';
  if (tailRow.workstream === 'same-origin-read') return 'same-origin-proof-required';
  if (tailRow.workstream === 'network-capture-learn') return 'network-capture-required';
  return 'app-specific-proof-required';
}

function reasonFor(row, tailRow) {
  if (row.readiness === 't1-ready') return 'handler or recipe proof exists in the current resolver';
  if (row.readiness === 't1-guarded-fail-closed') return 'registered write handler remains guarded until live mutation-body evidence is recorded';
  return tailRow && tailRow.requiredProof ? tailRow.requiredProof : 'explicit proof is required before direct execution';
}

function appStatusFromCounts(counts) {
  for (const status of APP_STATUS_PRIORITY) {
    if ((counts[status] || 0) > 0) return status;
  }
  return 'unknown';
}

function sortedEntries(map) {
  return Object.entries(map || {}).sort(function(a, b) {
    return b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1];
  });
}

function renderCountTable(map) {
  const rows = sortedEntries(map);
  if (!rows.length) return '| Item | Count |\n|------|------:|\n| None | 0 |';
  return [
    '| Item | Count |',
    '|------|------:|',
    ...rows.map(function(entry) { return '| `' + entry[0] + '` | ' + entry[1] + ' |'; }),
  ].join('\n');
}

function renderAppTable(apps, limit = 60) {
  const rows = apps.slice(0, limit);
  if (!rows.length) return '| App | Status | Ready | Guarded | Bridge | UAT | Blocked | Degraded |\n|-----|--------|------:|--------:|-------:|----:|--------:|---------:|\n| None | none | 0 | 0 | 0 | 0 | 0 | 0 |';
  return [
    '| App | Status | Ready | Guarded | Bridge | UAT | Blocked | Degraded |',
    '|-----|--------|------:|--------:|-------:|----:|--------:|---------:|',
    ...rows.map(function(app) {
      const c = app.counts || {};
      return '| `' + app.app + '` | `' + app.appStatus + '` | ' +
        (c['t1-ready'] || 0) + ' | ' +
        (c['guarded-fail-closed'] || 0) + ' | ' +
        (c['bridge-needed'] || 0) + ' | ' +
        (c['uat-needed'] || 0) + ' | ' +
        (c.blocked || 0) + ' | ' +
        (c['degraded-discovery-pending'] || 0) + ' |';
    }),
  ].join('\n');
}

export function buildTerminalStateReport(opts = {}) {
  const readiness = opts.readiness || reportReadiness();
  const worklist = opts.worklist || buildTailWorklist(readiness);
  const tailBySlug = new Map(worklist.rows.map(function(row) { return [row.slug, row]; }));
  const rows = [];
  const totals = {
    descriptors: 0,
    byReadiness: Object.create(null),
    bySurfaceStatus: Object.create(null),
    byTerminalState: Object.create(null),
    byWorkstream: Object.create(null),
  };
  const appMap = new Map();

  for (const row of readiness.rows || []) {
    const tailRow = tailBySlug.get(row.slug) || null;
    const surfaceStatus = surfaceStatusFor(row, tailRow);
    const terminalState = terminalStateFor(row, tailRow);
    const bridgeDecision = tailRow && (tailRow.workstream === 'pattern-d' || tailRow.workstream === 'gapi-bridge')
      ? bridgeDecisionFor(row)
      : null;
    const terminalRow = {
      slug: row.slug,
      app: row.app,
      service: row.service,
      sideEffectClass: row.sideEffectClass,
      readiness: row.readiness,
      originClass: row.originClass,
      routeFeasibility: row.routeFeasibility,
      workstream: tailRow ? tailRow.workstream : 'ready-or-guarded',
      surfaceStatus,
      terminalState,
      requiredProof: reasonFor(row, tailRow),
      executionEnabled: row.readiness === 't1-ready',
      bridgeDecisionStatus: bridgeDecision ? bridgeDecision.status : null,
    };
    rows.push(terminalRow);

    totals.descriptors += 1;
    increment(totals.byReadiness, terminalRow.readiness);
    increment(totals.bySurfaceStatus, surfaceStatus);
    increment(totals.byTerminalState, terminalState);
    increment(totals.byWorkstream, terminalRow.workstream);

    if (!appMap.has(row.app)) {
      appMap.set(row.app, { app: row.app, service: row.service, descriptorCount: 0, counts: Object.create(null) });
    }
    const app = appMap.get(row.app);
    app.descriptorCount += 1;
    increment(app.counts, surfaceStatus);
  }

  const apps = Array.from(appMap.values()).map(function(app) {
    return Object.assign(app, { appStatus: appStatusFromCounts(app.counts) });
  }).sort(function(a, b) {
    if (a.appStatus !== b.appStatus) {
      return APP_STATUS_PRIORITY.indexOf(a.appStatus) - APP_STATUS_PRIORITY.indexOf(b.appStatus);
    }
    return b.descriptorCount === a.descriptorCount
      ? a.app.localeCompare(b.app)
      : b.descriptorCount - a.descriptorCount;
  });

  return {
    generatedAt: new Date().toISOString(),
    source: 'scripts/report-t1-readiness.mjs + scripts/report-t1-tail-worklist.mjs',
    policy: 'Descriptors are executable only with current handler/recipe proof. Bridge, write, blocked, and discovery rows remain non-invocable until their required proof is satisfied.',
    totals,
    apps,
    rows: rows.sort(function(a, b) { return a.slug.localeCompare(b.slug); }),
  };
}

export function buildWriteUatLedger(opts = {}) {
  const readiness = opts.readiness || reportReadiness();
  const worklist = opts.worklist || buildTailWorklist(readiness);
  const evidence = opts.evidence || loadEvidence();
  const evidenceBySlug = new Map();
  for (const record of (evidence.activeWrites || [])) evidenceBySlug.set(record.slug, record);
  for (const record of (evidence.guardedWrites || [])) evidenceBySlug.set(record.slug, record);
  const tailBySlug = new Map(worklist.rows.map(function(row) { return [row.slug, row]; }));

  const rows = [];
  for (const row of readiness.rows || []) {
    if (!isWriteLike(row)) continue;
    const evidenceRecord = evidenceBySlug.get(row.slug) || null;
    const tailRow = tailBySlug.get(row.slug) || null;
    let status = 'not-activated-live-uat-required';
    if (row.readiness === 't1-ready') status = 'active-evidence-recorded';
    if (row.readiness === 't1-guarded-fail-closed') status = 'guarded-fail-closed';
    if (row.readiness === 'blocked') status = 'blocked-policy';
    rows.push({
      slug: row.slug,
      app: row.app,
      service: row.service,
      sideEffectClass: row.sideEffectClass,
      readiness: row.readiness,
      originClass: row.originClass,
      routeFeasibility: row.routeFeasibility,
      status,
      evidenceRef: evidenceRecord ? evidenceRecord.evidenceRef || evidenceRecord.templateRef || null : null,
      requiredEvidence: evidenceRecord && Array.isArray(evidenceRecord.requiredEvidence)
        ? evidenceRecord.requiredEvidence
        : ['method', 'pathShape', 'bodyShape', 'authShape', 'consentProof', 'auditRedactionProof'],
      activationAllowed: status === 'active-evidence-recorded',
      requiredProof: tailRow ? tailRow.requiredProof : reasonFor(row, tailRow),
    });
  }

  const totals = {
    writeRows: rows.length,
    byStatus: Object.create(null),
    bySideEffectClass: Object.create(null),
    byOriginClass: Object.create(null),
  };
  for (const row of rows) {
    increment(totals.byStatus, row.status);
    increment(totals.bySideEffectClass, row.sideEffectClass);
    increment(totals.byOriginClass, row.originClass);
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'catalog/write-activation-evidence.json + Phase 51 tail worklist',
    policy: 'Write and destructive descriptors are not activated from guessed endpoints. Activation requires live mutation-body UAT and redacted evidence.',
    totals,
    rows: rows.sort(function(a, b) { return a.slug.localeCompare(b.slug); }),
  };
}

export function validateTerminalStateReport(report, readiness, worklist) {
  const failures = [];
  if (!report || typeof report !== 'object') return { failures: ['terminal report is not an object'] };
  if (!Array.isArray(report.rows)) failures.push('terminal report rows missing');
  if (!Array.isArray(report.apps)) failures.push('terminal report apps missing');
  if (failures.length) return { failures };

  const readinessRows = readiness && Array.isArray(readiness.rows) ? readiness.rows : [];
  if (report.rows.length !== readinessRows.length) {
    failures.push('terminal report row count ' + report.rows.length + ' does not match readiness rows ' + readinessRows.length);
  }

  const seen = new Set();
  for (const row of report.rows) {
    if (!row.slug) failures.push('terminal row missing slug');
    if (seen.has(row.slug)) failures.push('duplicate terminal row ' + row.slug);
    seen.add(row.slug);
    if (!row.surfaceStatus) failures.push(row.slug + ' missing surfaceStatus');
    if (!row.terminalState) failures.push(row.slug + ' missing terminalState');
    if (!row.requiredProof) failures.push(row.slug + ' missing requiredProof');
    if (row.surfaceStatus === 'bridge-needed' && row.executionEnabled !== false) {
      failures.push(row.slug + ' bridge-needed row must not have execution enabled');
    }
    if (row.surfaceStatus === 'blocked' && row.terminalState !== 'blocked-policy') {
      failures.push(row.slug + ' blocked row must have blocked-policy terminal state');
    }
  }

  const tailRows = worklist && Array.isArray(worklist.rows) ? worklist.rows : [];
  const tailSet = new Set(tailRows.map(function(row) { return row.slug; }));
  for (const row of report.rows) {
    if (row.readiness !== 't1-ready' && row.readiness !== 't1-guarded-fail-closed' && !tailSet.has(row.slug)) {
      failures.push(row.slug + ' non-ready row missing from tail worklist');
    }
  }

  for (const app of report.apps) {
    if (!APP_STATUS_PRIORITY.includes(app.appStatus)) {
      failures.push(app.app + ' has unknown appStatus ' + app.appStatus);
    }
  }

  return { failures };
}

export function validateWriteUatLedger(ledger, readiness, evidence) {
  const failures = [];
  if (!ledger || typeof ledger !== 'object') return { failures: ['write ledger is not an object'] };
  if (!Array.isArray(ledger.rows)) return { failures: ['write ledger rows missing'] };

  const writeRows = (readiness.rows || []).filter(isWriteLike);
  if (ledger.rows.length !== writeRows.length) {
    failures.push('write ledger row count ' + ledger.rows.length + ' does not match write/destructive rows ' + writeRows.length);
  }

  const evidenceValidation = validateWriteActivationEvidence(evidence || loadEvidence(), readiness);
  failures.push(...evidenceValidation.failures);

  const activeWithoutEvidence = ledger.rows.filter(function(row) {
    return row.status === 'active-evidence-recorded' && !row.evidenceRef;
  });
  for (const row of activeWithoutEvidence) {
    failures.push(row.slug + ' active write row missing evidenceRef');
  }

  for (const row of ledger.rows) {
    if ((row.status === 'not-activated-live-uat-required' || row.status === 'guarded-fail-closed') &&
        row.activationAllowed !== false) {
      failures.push(row.slug + ' non-active write row must not allow activation');
    }
    if (!Array.isArray(row.requiredEvidence) || row.requiredEvidence.length === 0) {
      failures.push(row.slug + ' missing requiredEvidence');
    }
  }

  return { failures };
}

export function renderTerminalMarkdown(report) {
  return [
    '# Phase 51 T1 Terminal States',
    '',
    '**Generated:** ' + report.generatedAt,
    '',
    report.policy,
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|--------|------:|',
    '| Total descriptors | ' + report.totals.descriptors + ' |',
    '| T1-ready rows | ' + (report.totals.bySurfaceStatus['t1-ready'] || 0) + ' |',
    '| Guarded fail-closed rows | ' + (report.totals.bySurfaceStatus['guarded-fail-closed'] || 0) + ' |',
    '| Bridge-needed rows | ' + (report.totals.bySurfaceStatus['bridge-needed'] || 0) + ' |',
    '| UAT-needed rows | ' + (report.totals.bySurfaceStatus['uat-needed'] || 0) + ' |',
    '| Blocked rows | ' + (report.totals.bySurfaceStatus.blocked || 0) + ' |',
    '| Degraded/discovery-pending rows | ' + (report.totals.bySurfaceStatus['degraded-discovery-pending'] || 0) + ' |',
    '',
    '## Surface Status Counts',
    '',
    renderCountTable(report.totals.bySurfaceStatus),
    '',
    '## Terminal State Counts',
    '',
    renderCountTable(report.totals.byTerminalState),
    '',
    '## App Readiness Rollup',
    '',
    renderAppTable(report.apps),
    '',
    '## Machine-Readable Rows',
    '',
    'The full descriptor-level report is written to `51-T1-TERMINAL-STATES.json`.',
    '',
  ].join('\n');
}

export function renderWriteLedgerMarkdown(ledger) {
  return [
    '# Phase 51 Write/Destructive UAT Ledger',
    '',
    '**Generated:** ' + ledger.generatedAt,
    '',
    ledger.policy,
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|--------|------:|',
    '| Write/destructive descriptors | ' + ledger.totals.writeRows + ' |',
    '| Active with evidence | ' + (ledger.totals.byStatus['active-evidence-recorded'] || 0) + ' |',
    '| Guarded fail-closed | ' + (ledger.totals.byStatus['guarded-fail-closed'] || 0) + ' |',
    '| Live UAT required | ' + (ledger.totals.byStatus['not-activated-live-uat-required'] || 0) + ' |',
    '| Blocked policy | ' + (ledger.totals.byStatus['blocked-policy'] || 0) + ' |',
    '',
    '## Status Counts',
    '',
    renderCountTable(ledger.totals.byStatus),
    '',
    '## Origin Class Counts',
    '',
    renderCountTable(ledger.totals.byOriginClass),
    '',
    '## Machine-Readable Rows',
    '',
    'The full write/destructive UAT ledger is written to `51-WRITE-UAT-LEDGER.json`.',
    '',
  ].join('\n');
}

export function writeReports(opts = {}) {
  const readiness = opts.readiness || reportReadiness();
  const readinessValidation = validateReadinessReport(readiness, loadCatalog());
  if (readinessValidation.failures.length) {
    return { failures: readinessValidation.failures, readiness };
  }
  const worklist = opts.worklist || buildTailWorklist(readiness);
  const worklistValidation = validateTailWorklist(worklist, readiness);
  if (worklistValidation.failures.length) {
    return { failures: worklistValidation.failures, readiness, worklist };
  }
  const evidence = opts.evidence || loadEvidence();
  const terminal = buildTerminalStateReport({ readiness, worklist });
  const ledger = buildWriteUatLedger({ readiness, worklist, evidence });
  const failures = validateTerminalStateReport(terminal, readiness, worklist).failures
    .concat(validateWriteUatLedger(ledger, readiness, evidence).failures);
  if (failures.length) return { failures, readiness, worklist, terminal, ledger };

  mkdirSync(PHASE_DIR, { recursive: true });
  writeFileSync(TERMINAL_JSON_OUT, JSON.stringify(terminal, null, 2) + '\n', 'utf8');
  writeFileSync(TERMINAL_MD_OUT, renderTerminalMarkdown(terminal), 'utf8');
  writeFileSync(WRITE_LEDGER_JSON_OUT, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  writeFileSync(WRITE_LEDGER_MD_OUT, renderWriteLedgerMarkdown(ledger), 'utf8');
  return { failures: [], readiness, worklist, terminal, ledger };
}

function runCli() {
  const result = writeReports();
  if (result.failures.length) {
    console.error('t1-terminal-states: FAIL (' + result.failures.length + ' failure' +
      (result.failures.length === 1 ? '' : 's') + ')');
    for (const failure of result.failures) console.error('  - ' + failure);
    process.exit(1);
  }
  console.log('t1-terminal-states: PASS (' +
    result.terminal.totals.descriptors + ' descriptors; ' +
    (result.terminal.totals.bySurfaceStatus['t1-ready'] || 0) + ' ready; ' +
    (result.terminal.totals.bySurfaceStatus['bridge-needed'] || 0) + ' bridge-needed; ' +
    (result.ledger.totals.byStatus['not-activated-live-uat-required'] || 0) + ' write/destructive rows need live UAT)');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli();
  } catch (err) {
    console.error('t1-terminal-states: ERROR ' + (err && err.stack ? err.stack : String(err)));
    process.exit(1);
  }
}
