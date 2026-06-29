#!/usr/bin/env node
/**
 * Phase 47 -- Pattern-D / GAPI bridge architecture gate.
 *
 * This is intentionally a rejection/hold gate, not an executor. The current
 * browser substrate has a hard same-origin active-tab credential boundary. Until a
 * page-bridge design is separately approved and tested, Pattern-D and GAPI
 * candidates must remain discovery-pending and must not gain handler/recipe proof.
 */

'use strict';

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

import { reportReadiness } from './report-t1-readiness.mjs';
import { classifyOriginPattern } from './verify-origin-classification.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

export const BRIDGE_DECISIONS = Object.freeze({
  PATTERN_D: Object.freeze({
    status: 'rejected-pending-explicit-bridge',
    executionEnabled: false,
    reason: 'separate-origin app APIs cannot receive active-tab credentials through the current same-origin bound-spec path'
  }),
  GAPI: Object.freeze({
    status: 'rejected-pending-gapi-consent-bridge',
    executionEnabled: false,
    reason: 'window.gapi/client-side OAuth requires a separate page-bridge consent and token-containment design'
  }),
});

const BRIDGE_ROUTES = new Set(['pattern-d-candidate', 'gapi-bridge-candidate']);

function loadCatalog() {
  return require(join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js'));
}

function isBridgeCandidate(row) {
  return !!row && BRIDGE_ROUTES.has(row.routeFeasibility);
}

export function bridgeDecisionFor(row) {
  const route = row && row.routeFeasibility;
  if (route === 'pattern-d-candidate') return BRIDGE_DECISIONS.PATTERN_D;
  if (route === 'gapi-bridge-candidate') return BRIDGE_DECISIONS.GAPI;
  return Object.freeze({
    status: 'not-a-bridge-candidate',
    executionEnabled: true,
    reason: 'row is not classified as Pattern-D or GAPI'
  });
}

export function validateBridgeRows(rows) {
  const failures = [];
  const list = Array.isArray(rows) ? rows : [];
  let patternD = 0;
  let gapi = 0;

  for (const row of list) {
    if (!isBridgeCandidate(row)) continue;
    if (row.routeFeasibility === 'pattern-d-candidate') patternD++;
    if (row.routeFeasibility === 'gapi-bridge-candidate') gapi++;

    const decision = bridgeDecisionFor(row);
    if (decision.executionEnabled !== false) {
      failures.push(row.slug + ' bridge decision must keep execution disabled');
    }
    if (row.readiness !== 'discovery-pending') {
      failures.push(row.slug + ' bridge candidate must remain discovery-pending, got ' + row.readiness);
    }
    if (row.hasHandlerProof || row.hasRecipeProof || row.proof === 'handler' || row.proof === 'recipe') {
      failures.push(row.slug + ' bridge candidate must not carry handler/recipe proof before bridge approval');
    }
    if (row.resolvedTier && row.resolvedTier !== 'T3' && row.resolvedTier !== 'null') {
      failures.push(row.slug + ' bridge candidate must resolve T3/null before bridge approval, got ' + row.resolvedTier);
    }
  }

  return { failures, counts: { patternD, gapi, total: patternD + gapi } };
}

export function validateSeparateOriginNegativeControls() {
  const failures = [];
  const controls = [
    ['linear', 'https://linear.app', 'https://client-api.linear.app/graphql'],
    ['datadog', 'https://app.datadoghq.com', 'https://api.datadoghq.com/api/v1'],
    ['jira', 'https://example.atlassian.net', 'https://api.atlassian.com/ex/jira/example'],
  ];

  for (const row of controls) {
    const label = row[0];
    const classified = classifyOriginPattern(row[1], row[2]);
    if (!classified || classified.sameOrigin !== false || classified.separate !== true ||
        typeof classified.reason !== 'string' ||
        classified.reason.indexOf('CORS_SEPARATE_ORIGIN') !== 0) {
      failures.push(label + ' separate-origin negative control did not fail closed: ' + JSON.stringify(classified));
    }
  }

  return { failures };
}

export function validateCurrentPatternDGate(catalog, opts = {}) {
  const idx = catalog || loadCatalog();
  const report = opts.report || reportReadiness(idx);
  const bridge = validateBridgeRows(report.rows);
  const negative = validateSeparateOriginNegativeControls();
  const failures = bridge.failures.concat(negative.failures);

  if (bridge.counts.patternD === 0) failures.push('no Pattern-D candidates found; gate is vacuous');
  if (bridge.counts.gapi === 0) failures.push('no GAPI bridge candidates found; gate is vacuous');

  return { failures, report, counts: bridge.counts };
}

function runCli() {
  const result = validateCurrentPatternDGate();
  if (result.failures.length) {
    console.error('verify-pattern-d-gapi-gate: FAIL (' + result.failures.length + ' failure' +
      (result.failures.length === 1 ? '' : 's') + ')');
    for (const failure of result.failures) console.error('  - ' + failure);
    process.exit(1);
  }
  console.log('verify-pattern-d-gapi-gate: PASS (' +
    result.counts.patternD + ' Pattern-D candidate rows; ' +
    result.counts.gapi + ' GAPI candidate rows; execution disabled; negative controls fail closed)');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli();
  } catch (err) {
    console.error('verify-pattern-d-gapi-gate: ERROR ' + (err && err.message ? err.message : String(err)));
    process.exit(1);
  }
}
