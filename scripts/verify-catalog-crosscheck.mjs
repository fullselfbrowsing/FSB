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
 *   4. Op-name verb prefix (ALWAYS computed; the cross-check partner; camelCase-
 *      aware): the read verb set and the write/destructive verb set (delete-family
 *      + void/cancel/archive -> destructive).
 *   5. Override table (highest specificity, applied LAST as an UPGRADE-only FLOOR,
 *      never a downgrade): known-destructive / known-mutating ops.
 *   6. Fail-safe-high floor (HI-01): a generic mutating-capable api/apiVoid helper
 *      with NO usable signal derives at least WRITE -- never the read floor.
 * deriveClass(signals) = MAX over every computed signal AND the override floor AND
 * the no-signal fail-safe-high floor.
 *
 * SHARED DERIVATION (HI-02): the verb sets, the lattice MAX, the helper/method/verb
 * classifiers, the GraphQL/RPC carve-out, the override table, AND the no-signal
 * fail-safe-high floor all live in ONE module -- scripts/lib/side-effect-class.mjs --
 * imported by BOTH this gate AND the importer (scripts/import-opentabs-catalog.mjs).
 * Previously each carried its own divergent copy (the importer treated void/cancel as
 * destructive while the gate treated them as mere write; the importer's verb-prefix
 * could not split camelCase). A gate that re-derives from a DIFFERENT map than the
 * importer is a check that can silently disagree with what it checks. With the single
 * shared module the gate is a true SECOND evaluation of the SAME logic over the
 * persisted signals -- so an importer mis-stamp (a different generator, a hand-edit)
 * is caught because both sides agree on what the signals imply.
 *
 * DUAL EXPORT (mirrors scripts/verify-classification-gate.mjs):
 *   - export { crossCheck, deriveClass, verbClass } -- the Phase-36 importer can call
 *     crossCheck inline BEFORE writing a descriptor; the CLI below reuses the SAME
 *     logic as the CI backstop. deriveClass/verbClass are re-exported from the shared
 *     module for the existing tests.
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

// THE single shared side-effect derivation (HI-02). Both this gate AND the importer
// (scripts/import-opentabs-catalog.mjs) import from here, so they cannot diverge:
// the gate re-derives with the SAME verb-map + carve-out + override table + fail-
// safe-high floor the importer stamped with.
import {
  SIDE_EFFECT_ORDER as ORDER,
  rankOf,
  deriveClass,
  verbClass,
} from './lib/side-effect-class.mjs';

// Re-export the shared derivation so existing tests importing { deriveClass,
// verbClass } from THIS gate keep working (and so the gate's public surface is
// unchanged after the HI-02 hoist).
export { deriveClass, verbClass };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

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
