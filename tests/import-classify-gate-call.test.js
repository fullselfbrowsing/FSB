#!/usr/bin/env node
/**
 * Phase 36 / Plan 01 (CGEN-01) -- the importer calls classifyGate() BEFORE emit.
 *
 * Proves the denylist-first floor (Pattern 3): the importer imports Phase-35's
 * classifyGate, calls await Denylist.load() first, and REFUSES to emit when an
 * unclassified sensitivity-suspect origin is present -- while the benign todoist
 * origin produces zero failures and is allowed to emit.
 *
 * Strategy:
 *   (a)+(b) import the importer module under plain node and exercise its exported
 *           gate wrapper `gateItems` (the EXACT call the per-emit path makes). This
 *           does NOT import the vendored TS plugin, so it runs without the tsx
 *           loader: feed an unclassified-sensitive item (REFUSE) and the benign
 *           todoist item (PASS).
 *   (c)     run the importer END-TO-END the documented way (`node --import tsx
 *           ./scripts/import-opentabs-catalog.mjs`, which transpiles the vendored
 *           TS) as a child process and assert it emitted >=1 flat todoist
 *           descriptor -- proving the benign path actually writes (the gate is
 *           wired BEFORE emit, not bypassed).
 *
 * Zero-framework convention: PASS=/FAIL=, process.exit(1) on any failure.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

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

async function main() {
  const importerPath = path.resolve(ROOT, 'scripts', 'import-opentabs-catalog.mjs');
  const importerUrl = pathToFileURL(importerPath).href;
  const importer = await import(importerUrl);

  check(typeof importer.gateItems === 'function', 'importer exports gateItems (the before-emit gate wrapper)');
  check(typeof importer.runImport === 'function', 'importer exports runImport (end-to-end emit)');

  // ---- (a) unclassified sensitive origin -> the gate REFUSES ----------------
  // A finance-suspect origin (the sensitivity heuristic's "billing"/"payment"
  // tokens) that is NOT on the committed denylist. classifyGate must fail-closed
  // and the importer's gate wrapper must surface a non-empty failures list.
  const suspect = await importer.gateItems([
    {
      origin: 'https://pay.unclassified-importer-fixture.test',
      service: 'pay.unclassified-importer-fixture.test',
      slug: 'pay.create_billing_charge',
      description: 'create a billing payment charge',
    },
  ]);
  check(Array.isArray(suspect.failures) && suspect.failures.length > 0, 'gate REFUSES an unclassified sensitive origin (fail-closed)');

  // ---- (b) benign todoist origin -> the gate PASSES -------------------------
  const benign = await importer.gateItems([
    {
      origin: 'https://app.todoist.com',
      service: 'app.todoist.com',
      slug: 'todoist.create_task',
      description: 'create a task in todoist',
    },
  ]);
  check(Array.isArray(benign.failures) && benign.failures.length === 0, 'gate PASSES the benign todoist origin');

  // ---- (c) end-to-end: the benign path actually emits (run under tsx) --------
  const run = spawnSync(process.execPath, ['--import', 'tsx', importerPath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  check(run.status === 0, 'importer (node --import tsx) exits 0');
  const descDir = path.resolve(ROOT, 'catalog', 'descriptors');
  const emitted = fs
    .readdirSync(descDir)
    .filter((n) => n.startsWith('opentabs__todoist__') && n.endsWith('.json'));
  check(emitted.length > 0, 'runImport emitted >=1 flat todoist descriptor (gate wired BEFORE emit, benign path writes)');

  // ---- report ---------------------------------------------------------------
  if (failed > 0) {
    console.error('import-classify-gate-call.test: FAIL (' + failed + ' failure(s), ' + passed + ' passed)');
    process.exit(1);
  }
  console.log('import-classify-gate-call.test: PASS (' + passed + ' checks)');
  process.exit(0);
}

main().catch((err) => {
  console.error('import-classify-gate-call.test: ERROR ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
