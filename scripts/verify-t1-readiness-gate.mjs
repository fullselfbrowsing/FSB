#!/usr/bin/env node
/**
 * Phase 44 / Plan 03 -- CI gate for T1 readiness claims.
 *
 * This verifier reuses scripts/report-t1-readiness.mjs so the CI rule and the
 * human-readable report cannot drift apart.
 *
 * Run: node scripts/verify-t1-readiness-gate.mjs
 */

'use strict';

import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

import {
  reportReadiness,
  validateReadinessReport,
  validateReadinessRows,
} from './report-t1-readiness.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

export function validateReadinessGate(catalog) {
  const idx = catalog && typeof catalog === 'object'
    ? catalog
    : require(join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js'));
  const report = reportReadiness(idx);
  const validation = validateReadinessReport(report, idx);
  return { report, failures: validation.failures };
}

export { validateReadinessRows };

function runCli() {
  const { report, failures } = validateReadinessGate();
  if (failures.length) {
    console.error('verify-t1-readiness-gate: FAIL (' + failures.length + ' failure' +
      (failures.length === 1 ? '' : 's') + ')');
    for (const failure of failures) console.error('  - ' + failure);
    process.exit(1);
  }
  console.log('verify-t1-readiness-gate: PASS (' + report.rows.length + ' rows; ' +
    report.totals.ready + ' ready; ' + report.totals.guarded + ' guarded fail-closed)');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli();
  } catch (err) {
    console.error('verify-t1-readiness-gate: ERROR ' + (err && err.message ? err.message : String(err)));
    process.exit(1);
  }
}
