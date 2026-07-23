#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');

const REPO_ROOT = path.resolve(__dirname, '..');
const requireFromRoot = createRequire(path.join(REPO_ROOT, 'package.json'));

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

(async function run() {
  console.log('--- Phase 49: write activation evidence gate ---');

  const gate = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'verify-write-activation-evidence.mjs')).href);
  const readiness = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'report-t1-readiness.mjs')).href);
  const catalog = requireFromRoot('./extension/catalog/recipe-index.generated.js');
  const report = readiness.reportReadiness(catalog);
  const evidence = gate.loadEvidence();

  check(typeof gate.validateWriteActivationEvidence === 'function',
    'validateWriteActivationEvidence() is exported');
  check(typeof gate.writeRowsFromReport === 'function',
    'writeRowsFromReport() is exported');

  const rows = gate.writeRowsFromReport(report);
  check(rows.activeWrites.length === 5,
    'current readiness report has exactly 5 active write rows');
  check(rows.guardedWrites.length === 560,
    'current readiness report has exactly 560 guarded fail-closed write rows');

  const current = gate.validateWriteActivationEvidence(evidence, report);
  check(current.failures.length === 0,
    'committed write activation evidence passes' +
    (current.failures.length ? ': ' + current.failures.join(' | ') : ''));

  const missingGuarded = clone(evidence);
  missingGuarded.guardedWrites = missingGuarded.guardedWrites.filter(function(record) {
    return record.slug !== 'slack.send_message';
  });
  const missingGuardedResult = gate.validateWriteActivationEvidence(missingGuarded, report);
  check(missingGuardedResult.failures.some(function(failure) {
    return failure.indexOf('slack.send_message is guarded fail-closed but has no guarded evidence record') !== -1;
  }), 'missing guarded-write evidence fails closed');

  const missingActive = clone(evidence);
  missingActive.activeWrites = missingActive.activeWrites.filter(function(record) {
    return record.slug !== 'notion.create_page';
  });
  const missingActiveResult = gate.validateWriteActivationEvidence(missingActive, report);
  check(missingActiveResult.failures.some(function(failure) {
    return failure.indexOf('notion.create_page is t1-ready write/destructive but has no active evidence record') !== -1;
  }), 'missing active-write evidence fails closed');

  const wrongStatus = clone(evidence);
  wrongStatus.guardedWrites[0].status = 'active';
  const wrongStatusResult = gate.validateWriteActivationEvidence(wrongStatus, report);
  check(wrongStatusResult.failures.some(function(failure) {
    return failure.indexOf('guarded evidence status must be guarded-fail-closed') !== -1;
  }), 'a guarded write cannot be marked active in the evidence ledger');

  const secretLiteral = clone(evidence);
  secretLiteral.activeWrites[0].bodyShape = 'token=xoxc-secretvalue';
  const secretLiteralResult = gate.validateWriteActivationEvidence(secretLiteral, report);
  check(secretLiteralResult.failures.some(function(failure) {
    return failure.indexOf('possible xox token literal') !== -1;
  }), 'secret-like literals in evidence are rejected');

  console.log('\nwrite-activation-evidence: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('  FAIL: write activation evidence test threw:', err && err.message ? err.message : err);
  process.exit(1);
});
