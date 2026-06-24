#!/usr/bin/env node
/**
 * Phase 36 / Plan 03 (v1.0.0 Full App Catalog -- CGEN-02) -- side-effect
 * derived-vs-declared cross-check gate.
 *
 * THE TRAP THIS CLOSES: GraphQL/RPC mutations tunnel through POST (linear/github
 * `graphql(query)` is ALWAYS POST -- reads AND mutations both). "Class by HTTP
 * method alone" mislabels a mutation `read`, and under the shipped opt-out Auto
 * default a `read`-declared op runs with NO friction -- a fully-writable op with
 * no gate (Elevation of Privilege, threats T-36-08/09). This gate is the
 * import-time catch: for each emitted descriptor it RE-DERIVES the side-effect
 * class from the persisted provenance.signals (transportHelper + httpMethod +
 * opNameVerb) using the GraphQL/RPC carve-out + the named-verb map + the generic
 * api({method}) literal + an override-table FLOOR, MAX-merged (fail-safe-high:
 * read < write < destructive, disagreement -> the MAX), and FAILS THE BUILD when a
 * descriptor's DECLARED class is LOWER than the derived class (it under-states a
 * destructive/mutating op). It does NOT fail when the descriptor over-states
 * (declared >= derived is the safe direction). The runtime recipe-method backstop
 * (capability-router.js line 303, POST -> mutating) still guards at invoke; this
 * fails the PR BEFORE it ships.
 *
 * Derivation priority (RESEARCH Mechanic 2, read live across airtable/stripe/
 * linear/github):
 *   1. GraphQL/RPC carve-out (FIRST): transport in {graphql, gql, gqlRequest,
 *      persisted-query, rpc} -> the HTTP method is uninformative (always POST);
 *      classify by the OP-NAME VERB; an ambiguous GraphQL op fails-safe to WRITE;
 *      a GraphQL op is NEVER auto-classed read merely because no apiPost appears.
 *   2. Named verb helper: apiGet->read; apiPost/apiPut/apiPatch->write;
 *      apiDelete->destructive.
 *   3. Generic api({method}): GET/HEAD->read; POST/PUT/PATCH->write;
 *      DELETE->destructive; no literal -> default GET -> read (cross-checked vs
 *      the name verb, which is always also computed).
 *   4. Op-name verb prefix (ALWAYS computed; the cross-check partner): the read
 *      verb set and the write/destructive verb set (delete-family -> destructive).
 *   5. Override table (highest specificity, applied LAST as an UPGRADE-only FLOOR,
 *      never a downgrade): known-destructive / known-mutating ops.
 * deriveClass(signals) = MAX over every computed signal AND the override floor.
 *
 * DUAL EXPORT (mirrors scripts/verify-classification-gate.mjs):
 *   - export { crossCheck, deriveClass } -- the Phase-36 importer
 *     (scripts/import-opentabs-catalog.mjs) can call crossCheck inline BEFORE
 *     writing a descriptor; the CLI below reuses the SAME logic as the CI backstop.
 *   - CLI on direct invocation -- chained into validate:extension (-> ci) AFTER
 *     verify-classification-gate.mjs (registered by Plan 01). Sweeps the committed
 *     catalog/descriptors/*.json corpus and process.exit(1) on any under-stated op.
 *
 * ANALOG: scripts/verify-classification-gate.mjs (Node-builtins-only static gate;
 * dual-export; failures[] accumulator; process.exit(1) on fail / exit(0) + PASS
 * summary on pass; CLI runs only on direct invocation via the import.meta.url
 * pathToFileURL(process.argv[1]) guard). And scripts/verify-recipe-path-guard.mjs
 * (the CI-gate process.exit(1)-on-fail skeleton).
 *
 * Wall-1 discipline: build tooling (NOT shipped to the browser); kept FREE of
 * run-string-as-code / function-from-string / dynamic-module-loader constructs in
 * code AND comments, consistent with the recipe-path guard.
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// ---- Class lattice: read < write < destructive (fail-safe-high MAX-merge) -----
const ORDER = { read: 0, write: 1, destructive: 2 };
const BY_RANK = ['read', 'write', 'destructive'];

function rankOf(cls) {
  const r = ORDER[cls];
  return typeof r === 'number' ? r : 0; // unknown -> treat as read floor (the MAX of real signals dominates)
}

// Return the higher-severity of two classes (the MAX in the read<write<destructive lattice).
function maxClass(a, b) {
  return rankOf(a) >= rankOf(b) ? (BY_RANK[rankOf(a)]) : (BY_RANK[rankOf(b)]);
}

// ---- Verb sets (RESEARCH Mechanic 2, priority 1 + 4) --------------------------
// Read verbs: a pure data read.
const READ_VERBS = new Set(['list', 'get', 'search', 'read', 'fetch', 'find', 'query', 'load', 'show', 'view']);
// Destructive verbs: irreversible mutation (the delete-family).
const DESTRUCTIVE_VERBS = new Set(['delete', 'remove', 'destroy', 'purge', 'drop']);
// Write verbs: a reversible / additive mutation. (delete-family is split out above.)
const WRITE_VERBS = new Set([
  'create', 'update', 'add', 'set', 'void', 'archive', 'merge', 'move', 'finalize',
  'edit', 'patch', 'put', 'post', 'cancel', 'refund', 'send', 'close', 'reopen',
  'complete', 'assign', 'upload', 'write', 'insert', 'replace', 'enable', 'disable',
]);

/**
 * verbClass(opNameVerb) -> 'read' | 'write' | 'destructive' | null
 *
 * Maps the op-name verb prefix to a class. A delete-family verb -> destructive; a
 * read verb -> read; a known write verb -> write; an UNRECOGNIZED verb -> null (no
 * signal; the method/helper signals carry it, MAX-merged).
 */
export function verbClass(opNameVerb) {
  const v = String(opNameVerb || '').toLowerCase().trim();
  if (!v) return null;
  if (DESTRUCTIVE_VERBS.has(v)) return 'destructive';
  if (READ_VERBS.has(v)) return 'read';
  if (WRITE_VERBS.has(v)) return 'write';
  return null;
}

// ---- Transport classification: GraphQL/RPC carve-out + named-verb helper ------
// A GraphQL/RPC transport is ALWAYS POST -> the method is uninformative.
const GRAPHQL_TRANSPORT_RE = /(graphql|gql|gqlrequest|persisted-?query|\brpc\b)/i;

function isGraphqlTransport(transportHelper) {
  return GRAPHQL_TRANSPORT_RE.test(String(transportHelper || ''));
}

/**
 * helperClass(transportHelper) -> 'read' | 'write' | 'destructive' | null
 *
 * The named-verb helper signal (airtable convention): apiGet->read; apiPost/
 * apiPut/apiPatch->write; apiDelete->destructive. The helper name is matched
 * case-insensitively as a SUFFIX-ish token so a normalized "apidelete" / "apiPost"
 * both resolve. An unrecognized helper (e.g. a bare generic "api") -> null (the
 * method literal carries it). Checked delete-FIRST so "apiDelete" is not shadowed
 * by a substring match.
 */
function helperClass(transportHelper) {
  const h = String(transportHelper || '').toLowerCase();
  if (!h) return null;
  // Order matters: delete before the generic post/put/patch checks so an
  // "apidelete" helper is not shadowed. Tolerates api_delete / api-delete forms.
  if (/api[_-]?delete/.test(h)) return 'destructive';
  if (/api[_-]?(post|put|patch)/.test(h)) return 'write';
  if (/api[_-]?get/.test(h)) return 'read';
  return null;
}

// ---- Generic api({method}) literal (stripe convention) ------------------------
function methodClass(httpMethod) {
  const m = String(httpMethod || '').toUpperCase().trim();
  if (!m) return null;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return 'read';
  if (m === 'POST' || m === 'PUT' || m === 'PATCH') return 'write';
  if (m === 'DELETE') return 'destructive';
  return null;
}

// ---- Override table (RESEARCH Mechanic 2, priority 5) -------------------------
// Keyed by op-name (or a slug ending in the op-name), value is the FLOOR class
// (max-merged -- it can only ESCALATE, never downgrade). Membership exactly as
// RESEARCH lists: the CONTEXT exemplars (void_invoice, delete_customer) + the
// obvious destructive siblings + one known-mutating GraphQL op a name-verb
// heuristic might miss.
const SIDE_EFFECT_OVERRIDES = {
  void_invoice: 'destructive',
  delete_customer: 'destructive',
  cancel_subscription: 'destructive',
  refund_charge: 'destructive',
  delete_record: 'destructive',
  archive_project: 'destructive',
  merge_pull_request: 'write',
};

/**
 * overrideFloor(opName, slug) -> 'read' | 'write' | 'destructive' | null
 *
 * The override is keyed by the op-name. We also match when the slug ENDS WITH the
 * op-name (the importer's slugs are `<service>.<op>` e.g. `stripe.void_invoice`),
 * so feeding either the bare op-name OR the dotted slug resolves the floor.
 */
function overrideFloor(opName, slug) {
  const name = String(opName || '').toLowerCase();
  if (name && Object.prototype.hasOwnProperty.call(SIDE_EFFECT_OVERRIDES, name)) {
    return SIDE_EFFECT_OVERRIDES[name];
  }
  const s = String(slug || '').toLowerCase();
  if (s) {
    for (const key of Object.keys(SIDE_EFFECT_OVERRIDES)) {
      // slug ends with the op-name (after the service dot) -> the override applies.
      if (s === key || s.endsWith('.' + key) || s.endsWith('__' + key)) {
        return SIDE_EFFECT_OVERRIDES[key];
      }
    }
  }
  return null;
}

/**
 * deriveClass(signals, slug) -> 'read' | 'write' | 'destructive'
 *
 * The MAX over every computed signal AND the override floor (fail-safe-high).
 * Applies the GraphQL/RPC carve-out FIRST (per Mechanic 2): for a GraphQL/RPC
 * transport the method is discarded and the op-name verb decides, with an
 * ambiguous GraphQL op failing safe to WRITE (never auto-read). For a non-GraphQL
 * transport, the named-verb helper, the generic method literal, AND the op-name
 * verb are all computed and MAX-merged. The override table is the last UPGRADE.
 *
 * signals: { transportHelper, httpMethod, opNameVerb } (the importer's persisted
 * shape). A missing signals object derives `read` floor BUT the override (keyed by
 * slug) can still escalate -- so a known-destructive op with no signals is still
 * caught.
 */
export function deriveClass(signals, slug) {
  const s = signals && typeof signals === 'object' ? signals : {};
  const transportHelper = s.transportHelper;
  const httpMethod = s.httpMethod;
  const opNameVerb = s.opNameVerb;

  const nameVerbCls = verbClass(opNameVerb);

  let derived = 'read'; // floor

  if (isGraphqlTransport(transportHelper)) {
    // CARVE-OUT: the HTTP method is uninformative (GraphQL/RPC is always POST).
    // Classify by the op-name verb; an ambiguous GraphQL op (no recognized verb)
    // fails-safe to WRITE -- it is NEVER auto-classed read because the method is POST.
    if (nameVerbCls) {
      derived = maxClass(derived, nameVerbCls);
    } else {
      derived = maxClass(derived, 'write');
    }
  } else {
    // Non-GraphQL: combine the named-verb helper, the generic method literal, and
    // the op-name verb -- MAX-merged so the most-severe signal wins.
    const hCls = helperClass(transportHelper);
    const mCls = methodClass(httpMethod);
    if (hCls) derived = maxClass(derived, hCls);
    if (mCls) derived = maxClass(derived, mCls);
    if (nameVerbCls) derived = maxClass(derived, nameVerbCls);
  }

  // Override table: an UPGRADE-only FLOOR applied LAST (never a downgrade).
  // Keyed by the op-name; the overrideFloor() also matches when the slug ends with
  // a listed op-name (e.g. 'stripe.void_invoice'), so feeding either resolves it.
  const floor = overrideFloor(opNameVerb, slug);
  if (floor) derived = maxClass(derived, floor);

  return derived;
}

/**
 * crossCheck(descriptors) -> { failures: string[] }
 *
 * For each descriptor: re-derive the class from provenance.signals (the persisted
 * raw signals) and compare vs the descriptor's declared sideEffectClass. Push a
 * descriptive failure (slug + declared + derived) when the DECLARED class is LOWER
 * than the derived class (it under-states the op). A descriptor declaring a class
 * >= derived PASSES (over-stating is the safe direction).
 *
 * descriptors: array of emitted descriptors
 *   ({ slug, sideEffectClass, provenance:{ signals:{...} } }).
 * A descriptor missing provenance.signals derives the `read` floor from the slug-
 * keyed override alone -- a declared `read` for a known-destructive slug still fails.
 */
export function crossCheck(descriptors) {
  const failures = [];
  const list = Array.isArray(descriptors) ? descriptors : [];

  for (const d of list) {
    if (!d || typeof d !== 'object') continue;
    const slug = d.slug || '(unknown-slug)';
    const declared = d.sideEffectClass;
    const signals = d.provenance && d.provenance.signals ? d.provenance.signals : null;

    // A descriptor that declares no class at all is a defect: treat as `read`
    // (the lowest) so any non-read derivation flags it (fail-safe direction).
    const declaredCls = ORDER[declared] !== undefined ? declared : 'read';
    const derived = deriveClass(signals, slug);

    if (rankOf(declaredCls) < rankOf(derived)) {
      failures.push(
        slug + ' UNDER-states its side-effect class: declared "' +
        String(declared) + '" but derived "' + derived + '" from signals ' +
        JSON.stringify(signals || {}) +
        ' (fail-safe-high: a GraphQL/RPC POST or a destructive verb is never ' +
        'classed read). Raise sideEffectClass to "' + derived + '" (or higher).'
      );
    }
  }

  return { failures };
}

// ---- Build the CLI corpus from the committed descriptor set -------------------
// Read catalog/descriptors/*.json TOP-LEVEL ONLY (mirroring readJsonDir's
// non-recursion; do NOT descend into _fixtures/, so seed/proof fixtures are
// excluded exactly as they are from the shipped catalog).
function readCorpusDescriptors() {
  const out = [];
  const dir = resolve(ROOT, 'catalog/descriptors');
  if (!existsSync(dir)) return out;
  const names = readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort();
  for (const name of names) {
    let d;
    try {
      d = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch (_e) {
      // A malformed descriptor is validate-extension's concern; skip here so this
      // gate reports class mismatches, not JSON syntax (separation of gates).
      continue;
    }
    if (d && typeof d === 'object') out.push(d);
  }
  return out;
}

// ---- CLI entry (only when invoked directly, not when imported) ---------------
function runCli() {
  const corpus = readCorpusDescriptors();
  // Only descriptors carrying provenance.signals participate in the derived-vs-
  // declared comparison (hand-authored recipes without OpenTabs signals are not
  // re-derivable from this gate -- they are governed elsewhere). The override
  // floor still applies via the slug for any with a known-destructive op-name.
  const checked = corpus.filter(
    (d) => d && d.provenance && d.provenance.signals && typeof d.sideEffectClass === 'string'
  );
  const { failures } = crossCheck(checked);
  if (failures.length > 0) {
    console.error('verify-catalog-crosscheck: FAIL (a descriptor UNDER-states its side-effect class -- fail-safe-high)');
    for (const f of failures) {
      console.error('  - ' + f);
    }
    process.exit(1);
  }
  console.log(
    'verify-catalog-crosscheck: PASS (' + checked.length +
    ' descriptors with signals; every declared sideEffectClass >= its derived ' +
    'fail-safe-high class -- no under-stated destructive/mutating op)'
  );
  process.exit(0);
}

// Dual-export idiom: run the CLI only on direct invocation, never on import.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runCli();
}
