#!/usr/bin/env node
/**
 * Phase 39.5 / Code-review fix (39.5-REVIEW HI-02) -- the NO-ORPHAN-DESCRIPTOR CI gate.
 *
 * THE TRAP THIS CLOSES: the importer (scripts/import-opentabs-catalog.mjs) writes each
 * descriptor FLAT as catalog/descriptors/opentabs__<service-stem>__<op>.json. Before the
 * HI-02 fix it only writeFileSync'd the freshly-emitted files and NEVER deleted stale
 * ones, so when a vendored slice was swapped from an old hand-authored slice (e.g.
 * *://www.doordash.com/* with place_order/cancel_order/...) to the real apex slice
 * (*://*.doordash.com/* -> doordash.com with bookmark_store/get_order/...), the OLD
 * descriptors -- different stem/op -> different filename -- were ORPHANED, not
 * overwritten. The full-source import (39.5-04) left 77 such orphans on disk, ALL gates
 * GREEN, polluting the catalog + seed index + provenance with ops the current source no
 * longer defines. The importer now PRUNES-TO-MATCH; this gate is the build-time backstop
 * that turns a FUTURE non-pruning import (a hand-edit, a different generator, a reverted
 * prune) back into a BUILD FAILURE.
 *
 * AUTHORITATIVE, NO-DRIFT DETECTION: the gate re-derives the EXACT set of opentabs__*.json
 * filenames the importer WOULD emit -- by importing the importer's OWN enumerateBatchApps
 * + extractDescriptors (the same functions runImport uses) and computing each emitted
 * filename the same way (opentabs__<serviceStem>__<op>.json). Any committed opentabs__*.json
 * NOT in that set has NO backing in the current vendored corpus and is an ORPHAN -> FAIL.
 * This is immune to the sourcePath-string fragility that a naive "does provenance.sourcePath
 * exist" check suffers (a tool whose .ts filename differs from opFileBaseOf(tool.name) --
 * reddit.delete / teams.invite_to_channel / wikipedia.get_page_summary -- is legitimately
 * emitted yet its stamped sourcePath does not resolve; and the youtube-music slice uses
 * underscore filenames the importer kebab-cases). Driving the importer's real emit path is
 * the ONLY check that cannot disagree with what the importer writes.
 *
 * HAND-AUTHORED SLICES ARE VALID BACKING: the 13 hand-authored-only apps (amazon/etsy/
 * eventbrite/grubhub/kayak/lyft/mastodon/opentable/shopify/stubhub/threads/ticketmaster/
 * ubereats) + the hand-authored grafana.com slice have NO upstream OpenTabs source at the
 * pinned SHA, but their hand-authored src/tools/*.ts IS valid backing: enumerateBatchApps
 * re-emits them, so their filenames are IN the would-emit set and the gate treats them as
 * backed (never flags them orphan). The augment guarantee holds.
 *
 * REQUIRES tsx: extractDescriptors imports each plugin's TypeScript src/index.ts via
 * await import(), so this gate MUST run under the tsx loader. validate:extension invokes it
 * as `node --import tsx scripts/verify-no-orphan-descriptor.mjs`.
 *
 * DUAL EXPORT (mirrors scripts/verify-no-duplicate-stem.mjs):
 *   - export { computeEmittedFileNames, findOrphanDescriptors } -- driven by
 *     tests/no-orphan-descriptor.test.js.
 *   - CLI on direct invocation -- chained into validate:extension. Both reuse the SAME
 *     findOrphanDescriptors logic.
 *
 * Wall-1 discipline: build tooling (NOT shipped to the browser), kept FREE of
 * run-string-as-code / function-from-string / dynamic-module-loader constructs in code AND
 * comments. The `await import()` of the importer + the plugin metadata is the standard tsx
 * metadata loader (the same one the importer itself uses), not a dynamic code loader.
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  enumerateBatchApps,
  extractDescriptors,
} from './import-opentabs-catalog.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const DESCRIPTORS_DIR = resolve(ROOT, 'catalog/descriptors');

/**
 * computeEmittedFileNames() -> Promise<Set<string>>
 *
 * The AUTHORITATIVE set of opentabs__*.json filenames the importer would emit for the
 * current vendored corpus. Re-derived via the importer's OWN enumerateBatchApps +
 * extractDescriptors so it cannot drift from runImport. An app whose extraction throws
 * (a malformed slice) is surfaced via the returned `extractErrors` so a silently-dropped
 * app does not masquerade as "no orphans".
 */
export async function computeEmittedFileNames() {
  const emitted = new Set();
  const extractErrors = [];
  const apps = enumerateBatchApps();
  for (const app of apps) {
    let rows;
    try {
      rows = await extractDescriptors(app);
    } catch (e) {
      extractErrors.push(app + ': ' + (e && e.message ? e.message : String(e)));
      continue;
    }
    for (const { serviceStem, descriptor } of rows) {
      const opName = descriptor.slug.slice(serviceStem.length + 1);
      emitted.add('opentabs__' + serviceStem + '__' + opName + '.json');
    }
  }
  return { emitted, apps, extractErrors };
}

/**
 * listOnDiskOpentabsDescriptors() -> string[]
 *
 * The committed opentabs__*.json descriptor filenames (TOP-LEVEL only, mirroring the
 * importer's flat layout / readJsonDir non-recursion -- _fixtures/ is naturally excluded).
 */
export function listOnDiskOpentabsDescriptors() {
  if (!existsSync(DESCRIPTORS_DIR)) return [];
  return readdirSync(DESCRIPTORS_DIR)
    .filter((n) => /^opentabs__.*\.json$/.test(n))
    .sort();
}

/**
 * orphansOf(onDiskFiles, emittedSet) -> string[]
 *
 * The pure set-difference at the heart of the gate: the on-disk opentabs descriptor
 * filenames NOT present in the would-emit set, sorted. Factored out (no I/O) so the test
 * can prove orphan detection synthetically without driving the full importer.
 */
export function orphansOf(onDiskFiles, emittedSet) {
  const emitted = emittedSet instanceof Set ? emittedSet : new Set(Array.isArray(emittedSet) ? emittedSet : []);
  const list = Array.isArray(onDiskFiles) ? onDiskFiles : [];
  return list.filter((n) => !emitted.has(n)).sort();
}

/**
 * findOrphanDescriptors() -> Promise<{ orphans: string[], emittedCount, onDiskCount, extractErrors }>
 *
 * orphans = the committed opentabs__*.json files NOT in the importer's would-emit set
 * (no backing in the current vendored corpus). A non-empty list is a BUILD FAILURE.
 */
export async function findOrphanDescriptors() {
  const { emitted, extractErrors } = await computeEmittedFileNames();
  const onDisk = listOnDiskOpentabsDescriptors();
  const orphans = orphansOf(onDisk, emitted);
  return { orphans, emittedCount: emitted.size, onDiskCount: onDisk.length, extractErrors };
}

// ---- CLI entry (only on direct invocation, never on import) ------------------
async function runCli() {
  const { orphans, emittedCount, onDiskCount, extractErrors } = await findOrphanDescriptors();

  if (extractErrors.length > 0) {
    console.error(
      'verify-no-orphan-descriptor: ERROR -- ' + extractErrors.length + ' app(s) failed ' +
      'extraction, so the would-emit set is incomplete and orphan detection cannot be ' +
      'trusted. Fix the vendored slice(s):'
    );
    for (const e of extractErrors) console.error('  - ' + e);
    process.exit(1);
  }

  if (orphans.length > 0) {
    console.error(
      'verify-no-orphan-descriptor: FAIL (' + orphans.length + ' orphan descriptor(s) on ' +
      'disk with NO backing in the current vendored OpenTabs corpus -- the importer would ' +
      'not re-emit them). A non-pruning import left stale descriptors for ops the source no ' +
      'longer defines (catalog + seed index + provenance drift). FIX: re-run the importer ' +
      '(node --import tsx ./scripts/import-opentabs-catalog.mjs) -- it prunes-to-match -- ' +
      'then regenerate the catalog (node scripts/package-extension.mjs), or delete these ' +
      'files if their backing slice was intentionally removed:'
    );
    for (const f of orphans) console.error('  - ' + f);
    process.exit(1);
  }

  console.log(
    'verify-no-orphan-descriptor: PASS (' + onDiskCount + ' committed opentabs descriptor(s) ' +
    '== ' + emittedCount + ' the importer would emit; 0 orphans -- every descriptor is backed ' +
    'by a current vendored or hand-authored source op)'
  );
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runCli().catch((err) => {
    console.error('verify-no-orphan-descriptor: ERROR ' + (err && err.message ? err.message : err));
    process.exit(1);
  });
}
