#!/usr/bin/env node
/**
 * Phase 51 -- full T1 tail migration worklist.
 *
 * This report derives from the Phase 44 readiness matrix. It lists every
 * descriptor that is not currently executable T1 or guarded fail-closed, then
 * assigns a migration workstream. It is a planning/verification artifact only;
 * it does not mark descriptors ready and does not change invoke behavior.
 */

'use strict';

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

import {
  reportReadiness,
  validateReadinessReport,
} from './report-t1-readiness.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

export const PHASE_DIR = join(ROOT, '.planning', 'phases', '51-full-t1-tail-migration-across-remaining-catalog');
export const JSON_OUT = join(PHASE_DIR, '51-T1-TAIL-WORKLIST.json');
export const MD_OUT = join(PHASE_DIR, '51-T1-TAIL-WORKLIST.md');

const READY_OR_GUARDED = new Set(['t1-ready', 't1-guarded-fail-closed']);

function increment(map, key) {
  const k = String(key || 'unknown');
  map[k] = (map[k] || 0) + 1;
}

function workstreamFor(row) {
  if (!row || row.readiness === 'blocked' || row.originClass === 'denied') return 'blocked-policy';
  if (row.sideEffectClass === 'write' || row.sideEffectClass === 'destructive') return 'write-destructive-uat';
  if (row.nextAction === 'GAPI bridge candidate') return 'gapi-bridge';
  if (row.nextAction === 'Pattern-D candidate') return 'pattern-d';
  if (row.nextAction === 'same-origin read candidate') return 'same-origin-read';
  if (row.readiness === 'learn-pending' || row.routeFeasibility === 'capture-required') return 'network-capture-learn';
  return 'dom-discovery-port';
}

function requiredProofFor(row, workstream) {
  if (workstream === 'blocked-policy') {
    return 'denylist/product/legal policy change before activation';
  }
  if (workstream === 'write-destructive-uat') {
    return 'live mutation-body UAT, consent/audit proof, no-secret log proof, and write evidence record';
  }
  if (workstream === 'gapi-bridge') {
    return 'approved page-bound GAPI bridge plus negative controls and handler tests';
  }
  if (workstream === 'pattern-d') {
    return 'approved Pattern-D bridge plus origin/auth/shape tests and negative controls';
  }
  if (workstream === 'same-origin-read') {
    return 'same-origin handler or recipe tests proving origin pin, logged-out guard, shape guard, and no-secret logging';
  }
  if (workstream === 'network-capture-learn') {
    return 'consent-gated live capture, replay promotion, and learned recipe verification';
  }
  return 'app-specific runtime proof before direct execution';
}

function terminalTargetFor(row, workstream) {
  if (workstream === 'blocked-policy') return 'blocked';
  if (row.sideEffectClass === 'write' || row.sideEffectClass === 'destructive') return 't1-ready-or-guarded-fail-closed';
  return 't1-ready';
}

function summarizeRows(rows) {
  const totals = {
    tail: rows.length,
    actionable: 0,
    blocked: 0,
    read: 0,
    write: 0,
    destructive: 0,
    byWorkstream: Object.create(null),
    byApp: Object.create(null),
    byOriginClass: Object.create(null),
    byRouteFeasibility: Object.create(null),
  };

  for (const row of rows) {
    if (row.workstream === 'blocked-policy') totals.blocked += 1;
    else totals.actionable += 1;

    if (row.sideEffectClass === 'destructive') totals.destructive += 1;
    else if (row.sideEffectClass === 'write') totals.write += 1;
    else totals.read += 1;

    increment(totals.byWorkstream, row.workstream);
    increment(totals.byApp, row.app);
    increment(totals.byOriginClass, row.originClass);
    increment(totals.byRouteFeasibility, row.routeFeasibility);
  }

  return totals;
}

function topEntries(map, limit) {
  return Object.entries(map || {})
    .sort(function(a, b) {
      return b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1];
    })
    .slice(0, limit || 20);
}

export function buildTailWorklist(readinessReport) {
  const sourceRows = readinessReport && Array.isArray(readinessReport.rows) ? readinessReport.rows : [];
  const rows = sourceRows
    .filter(function(row) { return row && !READY_OR_GUARDED.has(row.readiness); })
    .map(function(row) {
      const workstream = workstreamFor(row);
      return {
        slug: row.slug,
        app: row.app,
        service: row.service,
        sideEffectClass: row.sideEffectClass,
        readiness: row.readiness,
        originClass: row.originClass,
        routeFeasibility: row.routeFeasibility,
        nextAction: row.nextAction,
        workstream,
        terminalTarget: terminalTargetFor(row, workstream),
        requiredProof: requiredProofFor(row, workstream),
      };
    })
    .sort(function(a, b) {
      if (a.workstream !== b.workstream) return a.workstream.localeCompare(b.workstream);
      if (a.app !== b.app) return a.app.localeCompare(b.app);
      return a.slug.localeCompare(b.slug);
    });

  return {
    generatedAt: new Date().toISOString(),
    source: 'scripts/report-t1-readiness.mjs',
    descriptorCount: readinessReport ? readinessReport.descriptorCount : 0,
    currentReady: readinessReport && readinessReport.totals ? readinessReport.totals.ready : 0,
    currentGuarded: readinessReport && readinessReport.totals ? readinessReport.totals.guarded : 0,
    rows,
    totals: summarizeRows(rows),
  };
}

export function validateTailWorklist(worklist, readinessReport) {
  const failures = [];
  if (!worklist || typeof worklist !== 'object') return { failures: ['worklist is not an object'] };
  if (!Array.isArray(worklist.rows)) failures.push('worklist.rows is missing or not an array');
  if (!worklist.totals || typeof worklist.totals !== 'object') failures.push('worklist.totals is missing');
  if (failures.length) return { failures };

  const rows = worklist.rows;
  const reportTotals = readinessReport && readinessReport.totals ? readinessReport.totals : null;
  if (reportTotals) {
    const expectedTail = reportTotals.learnPending + reportTotals.discoveryPending + reportTotals.blocked;
    if (rows.length !== expectedTail) {
      failures.push('tail row count ' + rows.length + ' does not match readiness tail ' + expectedTail);
    }
    if (worklist.currentReady !== reportTotals.ready) {
      failures.push('currentReady ' + worklist.currentReady + ' does not match readiness ready ' + reportTotals.ready);
    }
    if (worklist.currentGuarded !== reportTotals.guarded) {
      failures.push('currentGuarded ' + worklist.currentGuarded + ' does not match readiness guarded ' + reportTotals.guarded);
    }
  }

  const seen = new Set();
  let blocked = 0;
  let actionable = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      failures.push('tail row is not an object');
      continue;
    }
    if (!row.slug) failures.push('tail row missing slug');
    if (seen.has(row.slug)) failures.push('duplicate tail slug ' + row.slug);
    seen.add(row.slug);
    if (READY_OR_GUARDED.has(row.readiness)) {
      failures.push(row.slug + ' is already ready/guarded and should not be in the tail worklist');
    }
    if (!row.workstream) failures.push(row.slug + ' missing workstream');
    if (!row.requiredProof) failures.push(row.slug + ' missing requiredProof');
    if (!row.terminalTarget) failures.push(row.slug + ' missing terminalTarget');
    if (row.workstream === 'blocked-policy') blocked += 1;
    else actionable += 1;
  }

  if (worklist.totals.tail !== rows.length) {
    failures.push('totals.tail ' + worklist.totals.tail + ' does not match rows length ' + rows.length);
  }
  if (worklist.totals.blocked !== blocked) {
    failures.push('totals.blocked ' + worklist.totals.blocked + ' does not match blocked rows ' + blocked);
  }
  if (worklist.totals.actionable !== actionable) {
    failures.push('totals.actionable ' + worklist.totals.actionable + ' does not match actionable rows ' + actionable);
  }

  return { failures };
}

function renderCountTable(map) {
  const rows = topEntries(map, 50);
  if (!rows.length) return '| Item | Count |\n|------|------:|\n| None | 0 |';
  return [
    '| Item | Count |',
    '|------|------:|',
    ...rows.map(function(entry) { return '| `' + entry[0] + '` | ' + entry[1] + ' |'; }),
  ].join('\n');
}

export function renderMarkdown(worklist) {
  const totals = worklist.totals;
  return [
    '# Phase 51 T1 Tail Worklist',
    '',
    '**Generated:** ' + worklist.generatedAt,
    '',
    'This worklist is generated from the Phase 44 readiness report and covers every descriptor that is not currently executable T1 or guarded fail-closed. It is a migration target list, not an execution claim.',
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|--------|------:|',
    '| Total descriptors | ' + worklist.descriptorCount + ' |',
    '| Current T1-ready descriptors | ' + worklist.currentReady + ' |',
    '| Current guarded fail-closed writes | ' + worklist.currentGuarded + ' |',
    '| Tail rows in this worklist | ' + totals.tail + ' |',
    '| Actionable non-denied tail rows | ' + totals.actionable + ' |',
    '| Blocked policy rows | ' + totals.blocked + ' |',
    '| Read rows | ' + totals.read + ' |',
    '| Write rows | ' + totals.write + ' |',
    '| Destructive rows | ' + totals.destructive + ' |',
    '',
    '## Workstreams',
    '',
    renderCountTable(totals.byWorkstream),
    '',
    '## Largest App Buckets',
    '',
    renderCountTable(totals.byApp),
    '',
    '## Route Feasibility',
    '',
    renderCountTable(totals.byRouteFeasibility),
    '',
    '## Origin Class',
    '',
    renderCountTable(totals.byOriginClass),
    '',
    '## Machine-Readable Rows',
    '',
    'The full per-descriptor worklist is written to `51-T1-TAIL-WORKLIST.json`.',
    '',
  ].join('\n');
}

export function writeTailWorklist(worklist, paths) {
  const jsonPath = paths && paths.jsonPath ? paths.jsonPath : JSON_OUT;
  const mdPath = paths && paths.mdPath ? paths.mdPath : MD_OUT;
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(worklist, null, 2) + '\n');
  writeFileSync(mdPath, renderMarkdown(worklist));
}

function runCli() {
  const readiness = reportReadiness();
  const readinessValidation = validateReadinessReport(readiness);
  if (readinessValidation.failures.length) {
    console.error('t1-tail-worklist: readiness FAIL (' + readinessValidation.failures.length + ' failure' +
      (readinessValidation.failures.length === 1 ? '' : 's') + ')');
    for (const failure of readinessValidation.failures) console.error('  - ' + failure);
    process.exit(1);
  }

  const worklist = buildTailWorklist(readiness);
  const validation = validateTailWorklist(worklist, readiness);
  writeTailWorklist(worklist);

  if (validation.failures.length) {
    console.error('t1-tail-worklist: FAIL (' + validation.failures.length + ' failure' +
      (validation.failures.length === 1 ? '' : 's') + ')');
    for (const failure of validation.failures) console.error('  - ' + failure);
    process.exit(1);
  }

  console.log('t1-tail-worklist: PASS (' + worklist.totals.tail + ' tail rows; ' +
    worklist.totals.actionable + ' actionable; ' + worklist.totals.blocked + ' blocked)');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli();
  } catch (err) {
    console.error('t1-tail-worklist: ERROR ' + (err && err.message ? err.message : String(err)));
    process.exit(1);
  }
}
