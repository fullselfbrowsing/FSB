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
 * Plus the hardening cases the deep review (36-REVIEW.md HI-01/HI-02) demanded:
 *   (f) HI-01 -- the headline false-negative: an `api` helper with NO method literal
 *       and an UNRECOGNIZED verb (process/submit/execute) declared `read` formerly
 *       floated at the read floor and PASSED. The shared fail-safe-high floor now
 *       derives at least `write` for a generic mutating-capable transport with no
 *       usable signal, so all 3 of the review's adversarial under-stated mutations
 *       FAIL (was 0 of 3 caught). The same shape declared `write` still PASSES.
 *   (g) HI-02 -- the GraphQL camelCase surface (linear/github, Phases 37-39): a
 *       camelCase destructive verb NOT in the override table (purgeRepository,
 *       dropDatabase, voidInvoice) is now recognized destructive via the camelCase-
 *       aware verb split (recovered from the slug when the persisted verb is absent),
 *       so a declared `write` UNDER-states it and FAILS; a camelCase READ verb
 *       (getCurrentUser) declared `read` still PASSES (no over-escalation).
 *
 * Zero-framework convention: PASS=/FAIL=, process.exit(1) on any failed assertion.
 * NO EMOJIS, ASCII-only source.
 */
'use strict';

const fs = require('node:fs');
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

  // ---- (f) HI-01: api-helper / no-method / unknown-verb declared `read` FAILS -
  // The headline false-negative the review proved: signals {transportHelper:'api',
  // httpMethod:null, opNameVerb:<unrecognized>} formerly returned the read FLOOR
  // (helper null, method null, verb null -> read), so a writable-capable op declared
  // `read` PASSED -- a fully-writable op running ungated under the opt-out Auto
  // default. With the shared fail-safe-high floor a generic mutating-capable
  // transport with NO usable signal derives at least `write`, so all three of the
  // review's adversarial under-stated mutations are now CAUGHT.
  const fAdversarial = [
    descriptor('evil.process_payment', 'read', { transportHelper: 'api', httpMethod: null, opNameVerb: 'process' }),
    descriptor('evil.submit_order', 'read', { transportHelper: 'api', httpMethod: null, opNameVerb: 'submit' }),
    descriptor('evil.execute_trade', 'read', { transportHelper: 'api', httpMethod: null, opNameVerb: 'execute' }),
  ];
  const f = gate.crossCheck(fAdversarial);
  check(Array.isArray(f.failures) && f.failures.length === 3, '(f) HI-01: all 3 api/no-method/unknown-verb ops declared read FAIL (gate catches 3 of 3, was 0 of 3)');
  check(isFlagged(f, 'evil.process_payment'), '(f) process_payment (api, no method, verb `process`) declared read is CAUGHT');
  check(isFlagged(f, 'evil.submit_order'), '(f) submit_order (api, no method, verb `submit`) declared read is CAUGHT');
  check(isFlagged(f, 'evil.execute_trade'), '(f) execute_trade (api, no method, verb `execute`) declared read is CAUGHT');
  // The same shape declared `write` (the floor) PASSES -- the floor is write, not an
  // over-escalation to destructive (no destructive signal is present).
  const fOk = gate.crossCheck([
    descriptor('evil.process_payment', 'write', { transportHelper: 'api', httpMethod: null, opNameVerb: 'process' }),
  ]);
  check(Array.isArray(fOk.failures) && fOk.failures.length === 0, '(f) the same op declared `write` PASSES (the fail-safe floor is write, no false-escalation)');

  // ---- (g) HI-02: camelCase destructive verb (GraphQL) is recognized ----------
  // The GraphQL camelCase surface (linear/github) was the motivating Phase 37-39
  // case. A camelCase destructive op NOT in the override table (purgeRepository,
  // dropDatabase) formerly fell through every verb set to merely `write`; the
  // camelCase-aware verb split now classes it `destructive`, so a declared `write`
  // UNDER-states it and FAILS. The verb token is recovered even when the persisted
  // opNameVerb is absent (from the slug's trailing op-name).
  const g = gate.crossCheck([
    descriptor('github.purgeRepository', 'write', { transportHelper: 'graphql', httpMethod: 'POST', opNameVerb: null }),
    descriptor('github.dropDatabase', 'write', { transportHelper: 'graphql', httpMethod: 'POST', opNameVerb: null }),
    descriptor('linear.voidInvoice', 'write', { transportHelper: 'graphql', httpMethod: 'POST', opNameVerb: 'void' }),
  ]);
  check(Array.isArray(g.failures) && g.failures.length === 3, '(g) HI-02: camelCase destructive verbs (purge/drop/void) declared write all FAIL (destructive recognized)');
  check(isFlagged(g, 'github.purgeRepository') && isFlagged(g, 'github.dropDatabase'), '(g) purgeRepository/dropDatabase recovered from the slug (no persisted verb) and classed destructive');
  // A camelCase READ verb (getCurrentUser) over a GraphQL POST correctly stays read
  // (declared read PASSES) -- the carve-out does not over-escalate a genuine read.
  const gRead = gate.crossCheck([
    descriptor('github.getCurrentUser', 'read', { transportHelper: 'graphql', httpMethod: 'POST', opNameVerb: 'get' }),
  ]);
  check(Array.isArray(gRead.failures) && gRead.failures.length === 0, '(g) getCurrentUser (camelCase read verb, graphql) declared read PASSES (no false-fail)');

  // ---- (h) MED-02: the read-only-safe-origin invariant ----------------------
  // reddit.com is classified SAFE only because the vendored slice is read-only. The
  // new checkReadOnlySafeOrigins gate makes that a checked invariant: a non-read op
  // under reddit.com FAILS the build (forcing a re-classification to sensitive) so a
  // future re-vendor that adds a reddit write cannot ship writable-under-Auto silently.
  check(typeof gate.checkReadOnlySafeOrigins === 'function',
    '(h) checkReadOnlySafeOrigins is a named export of the real gate (MED-02 safe-origin invariant)');

  // The fixture: a HYPOTHETICAL reddit write descriptor (service reddit.com,
  // sideEffectClass write). Loaded from disk so the proof is the real gate over the
  // real fixture shape, not a fabricated inline object.
  const SAFE_WRITE_FIXTURE = path.join(ROOT, 'catalog', 'descriptors', '_fixtures', 'safe-origin-write.fixture.json');
  check(fs.existsSync(SAFE_WRITE_FIXTURE), '(h) the safe-origin-write fixture exists on disk (a hypothetical reddit write)');
  const safeWriteFixture = JSON.parse(fs.readFileSync(SAFE_WRITE_FIXTURE, 'utf8'));
  check(safeWriteFixture.service === 'reddit.com' && safeWriteFixture.sideEffectClass === 'write',
    '(h) the fixture is service reddit.com + sideEffectClass write (a read-only-safe origin gaining a write)');
  const hFail = gate.checkReadOnlySafeOrigins([safeWriteFixture]);
  check(Array.isArray(hFail.failures) && hFail.failures.length === 1,
    '(h) checkReadOnlySafeOrigins([reddit write]) yields exactly one failure -> the build ABORTS (the safe-because-read-only assumption, enforced)');
  check(hFail.failures.length > 0 && hFail.failures[0].indexOf('reddit.submit_post') !== -1 && /reddit\.com/.test(hFail.failures[0]),
    '(h) the failure NAMES the offending slug reddit.submit_post and its service reddit.com');

  // A destructive op under the safe origin is ALSO caught (not only write).
  const hDestructive = gate.checkReadOnlySafeOrigins([
    { slug: 'reddit.delete_post', service: 'reddit.com', sideEffectClass: 'destructive' },
  ]);
  check(Array.isArray(hDestructive.failures) && hDestructive.failures.length === 1,
    '(h) a destructive op under reddit.com is ALSO flagged (write AND destructive trip the invariant)');

  // (i) NO FALSE-FAIL: the REAL emitted reddit READ descriptors PASS (they ARE
  // read-only, the genuine current state). Loaded from disk -- the actual shipped ops.
  const redditReads = ['opentabs__reddit__get_post.json', 'opentabs__reddit__list_subreddit_posts.json', 'opentabs__reddit__search_posts.json'];
  const redditReadDescriptors = redditReads.map((n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'descriptors', n), 'utf8')));
  const iPass = gate.checkReadOnlySafeOrigins(redditReadDescriptors);
  check(Array.isArray(iPass.failures) && iPass.failures.length === 0,
    '(i) the 3 REAL emitted reddit READ descriptors PASS checkReadOnlySafeOrigins (no false-fail -- reddit is genuinely read-only today)');

  // (j) a descriptor for an origin NOT in the read-only-safe set is ignored by this
  // invariant (a discord write is governed by classification/crosscheck, not here).
  const jIgnored = gate.checkReadOnlySafeOrigins([
    { slug: 'discord.send_message', service: 'discord.com', sideEffectClass: 'write' },
  ]);
  check(Array.isArray(jIgnored.failures) && jIgnored.failures.length === 0,
    '(j) a write under a NON-read-only-safe origin (discord.com, sensitive) is NOT flagged by this invariant (scoped to the curated safe set)');

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
