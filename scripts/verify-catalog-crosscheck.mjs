#!/usr/bin/env node
/**
 * Phase 36 / Plan 03 (v1.0.0 Full App Catalog -- CGEN-02) -- side-effect
 * derived-vs-declared cross-check gate.
 *
 * STUB (Plan 01 Task 1): this file is REGISTERED into validate:extension now so
 * CI stays green across every Phase-36 wave; Plan 03 replaces the body below with
 * the real derived-vs-declared, fail-safe-high gate (for each emitted descriptor,
 * recompute the derived side-effect class from the persisted provenance.signals
 * --transportHelper, httpMethod, opNameVerb-- plus the GraphQL/RPC carve-out +
 * override table, and FAIL the build when the descriptor's declared class is LOWER
 * than the derived class, i.e. it UNDER-states a destructive op).
 *
 * DUAL EXPORT (the idiom Plan 03 fills + the importer may call inline):
 *   - export { crossCheck } -- a no-op stub today; Plan 03 makes it the real
 *     derived-vs-declared comparator so the importer can call it inline before
 *     writing AND the CLI below reuses the SAME logic for the CI backstop.
 *   - CLI on direct invocation -- chained into validate:extension (-> ci). Exits 0
 *     today (no descriptor under-states its class because the gate is a stub);
 *     Plan 03 sweeps the committed descriptor corpus and exits non-zero on any
 *     under-stated destructive op.
 *
 * ANALOG: scripts/verify-classification-gate.mjs (Node-builtins-only static gate;
 * dual-export; failures[] accumulator; process.exit(1) on fail / exit(0) + PASS
 * summary on pass; CLI runs only on direct invocation via the import.meta.url
 * pathToFileURL(process.argv[1]) guard).
 *
 * Wall-1 discipline: build tooling (NOT shipped to the browser); kept FREE of
 * run-string-as-code / function-from-string / dynamic-module-loader constructs in
 * code AND comments, consistent with the recipe-path guard.
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

import { pathToFileURL } from 'node:url';

/**
 * crossCheck(items) -> { failures: string[] }
 *
 * STUB: returns no failures. Plan 03 replaces this with the real fail-safe-high
 * derived-vs-declared comparator (read the persisted provenance.signals, derive
 * the MAX side-effect class, and push a failure when declared < derived).
 *
 * items: array of emitted descriptors (or { slug, declared, signals } shapes).
 */
export function crossCheck(items) {
  void items; // Plan 03 consumes this; the stub intentionally does not.
  return { failures: [] };
}

// ---- CLI entry (only when invoked directly, not when imported) ---------------
function runCli() {
  // Plan 03 will read the committed descriptor corpus and run crossCheck over it;
  // the stub reports a clean pass so validate:extension stays green from Wave 1.
  const { failures } = crossCheck([]);
  if (failures.length > 0) {
    console.error('verify-catalog-crosscheck: FAIL (a descriptor under-states its side-effect class)');
    for (const f of failures) {
      console.error('  - ' + f);
    }
    process.exit(1);
  }
  console.log('verify-catalog-crosscheck: PASS (stub -- the real derived-vs-declared gate lands in Plan 36-03)');
  process.exit(0);
}

// Dual-export idiom: run the CLI only on direct invocation, never on import.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runCli();
}
