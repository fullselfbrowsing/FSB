#!/usr/bin/env node
/**
 * Phase 36 / Plan 03 (v1.0.0 Full App Catalog -- CGEN-02) -- side-effect
 * derived-vs-declared cross-check ACCEPTANCE test (replaces the Plan-01 stub).
 *
 * Proves the fail-safe-high gate (RESEARCH Mechanic 2 "Acceptance test"):
 * each synthetic descriptor carries the importer's persisted provenance.signals
 * shape ({ transportHelper, httpMethod, opNameVerb }); the REAL crossCheck export
 * (NOT a re-implemented copy) re-derives the MAX side-effect class and flags any
 * descriptor whose DECLARED class is LOWER than the derived class.
 *
 * The four load-bearing cases (CGEN-02 / 36-VALIDATION.md):
 *   (a) stripe.void_invoice declared `read`, signals method POST + nameVerb `void`
 *       -> FAILURE (the override table + name verb floor it to destructive; the
 *       descriptor under-states a destructive op -- the headline threat T-36-09).
 *   (b) stripe.delete_customer declared `destructive`, signals method POST +
 *       nameVerb `delete` -> NO failure (correctly stated; the gate never
 *       false-fails a correctly-declared destructive op).
 *   (c) linear.issues declared `read`, signals transport `graphql` + method POST +
 *       nameVerb `list` -> NO failure (a GraphQL READ query stays read BY NAME; a
 *       POST is never force-promoted-to-write nor mislabeled -- the carve-out's
 *       safe direction).
 *   (d) linear.archiveIssue declared `read`, signals transport `graphql` + method
 *       POST + nameVerb `archive` -> FAILURE (a GraphQL MUTATION mislabeled read is
 *       caught -- the dangerous direction, threat T-36-08; method-alone would have
 *       auto-classed it read because every GraphQL op is POST).
 *
 * Zero-framework convention: PASS=/FAIL=, process.exit(1) on any failed assertion.
 * NO EMOJIS, ASCII-only source.
 */
'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

let passed = 0;
let failed = 0;
function check(cond, label) {
  if (cond) {
    passed++;
    console.log('  PASS ' + label);
  } else {
    failed++;
    console.error('  FAIL ' + label);
  }
}

const ROOT = path.resolve(__dirname, '..');

// Build a synthetic descriptor in the EXACT shape the importer persists
// (provenance.signals = { transportHelper, httpMethod, opNameVerb }).
function descriptor(slug, sideEffectClass, signals) {
  return {
    slug: slug,
    sideEffectClass: sideEffectClass,
    provenance: { signals: signals },
  };
}

// Does crossCheck flag THIS specific slug? (crossCheck returns { failures: [] }
// of descriptive strings that embed the slug; a flagged slug appears in one.)
function isFlagged(result, slug) {
  if (!result || !Array.isArray(result.failures)) return false;
  return result.failures.some((f) => typeof f === 'string' && f.indexOf(slug) !== -1);
}

async function main() {
  const gatePath = path.resolve(ROOT, 'scripts', 'verify-catalog-crosscheck.mjs');
  const gate = await import(pathToFileURL(gatePath).href);

  check(typeof gate.crossCheck === 'function', 'crossCheck is a named export of the real gate (not re-implemented here)');

  // ---- (a) under-stated destructive POST -> FAILURE -------------------------
  const a = gate.crossCheck([
    descriptor('stripe.void_invoice', 'read', { transportHelper: 'api', httpMethod: 'POST', opNameVerb: 'void' }),
  ]);
  check(Array.isArray(a.failures) && a.failures.length === 1, '(a) void_invoice declared read yields exactly one failure');
  check(isFlagged(a, 'stripe.void_invoice'), '(a) the failure names stripe.void_invoice (under-states destructive)');

  // ---- (b) correctly-stated destructive -> NO failure -----------------------
  const b = gate.crossCheck([
    descriptor('stripe.delete_customer', 'destructive', { transportHelper: 'api', httpMethod: 'POST', opNameVerb: 'delete' }),
  ]);
  check(Array.isArray(b.failures) && b.failures.length === 0, '(b) delete_customer declared destructive PASSES (correctly stated, no false-fail)');

  // ---- (c) GraphQL READ query -> stays read by NAME, NO failure -------------
  const c = gate.crossCheck([
    descriptor('linear.issues', 'read', { transportHelper: 'graphql', httpMethod: 'POST', opNameVerb: 'list' }),
  ]);
  check(Array.isArray(c.failures) && c.failures.length === 0, '(c) linear.issues (graphql POST, list verb) declared read PASSES -- a GraphQL READ is never force-promoted');

  // ---- (d) GraphQL MUTATION mislabeled read -> FAILURE ----------------------
  const d = gate.crossCheck([
    descriptor('linear.archiveIssue', 'read', { transportHelper: 'graphql', httpMethod: 'POST', opNameVerb: 'archive' }),
  ]);
  check(Array.isArray(d.failures) && d.failures.length === 1, '(d) linear.archiveIssue declared read yields exactly one failure (graphql mutation never mislabeled read)');
  check(isFlagged(d, 'linear.archiveIssue'), '(d) the failure names linear.archiveIssue (the dangerous direction is caught)');

  // ---- (e) batch sanity: only the two under-stated ops flag in a mixed set --
  const e = gate.crossCheck([
    descriptor('stripe.void_invoice', 'read', { transportHelper: 'api', httpMethod: 'POST', opNameVerb: 'void' }),
    descriptor('stripe.delete_customer', 'destructive', { transportHelper: 'api', httpMethod: 'POST', opNameVerb: 'delete' }),
    descriptor('linear.issues', 'read', { transportHelper: 'graphql', httpMethod: 'POST', opNameVerb: 'list' }),
    descriptor('linear.archiveIssue', 'read', { transportHelper: 'graphql', httpMethod: 'POST', opNameVerb: 'archive' }),
  ]);
  check(Array.isArray(e.failures) && e.failures.length === 2, '(e) a mixed batch flags exactly the two under-stated ops (void_invoice + archiveIssue)');
  check(isFlagged(e, 'stripe.void_invoice') && isFlagged(e, 'linear.archiveIssue'), '(e) the two flagged slugs are void_invoice and archiveIssue');
  check(!isFlagged(e, 'stripe.delete_customer') && !isFlagged(e, 'linear.issues'), '(e) the correctly-stated ops are NOT flagged');

  // ---- report ---------------------------------------------------------------
  if (failed > 0) {
    console.error('catalog-crosscheck.test: FAIL (' + failed + ' failure(s), ' + passed + ' passed)');
    process.exit(1);
  }
  console.log('catalog-crosscheck.test: PASS (' + passed + ' checks -- fail-safe-high derived-vs-declared cross-check)');
  process.exit(0);
}

main().catch((err) => {
  console.error('catalog-crosscheck.test: ERROR ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
