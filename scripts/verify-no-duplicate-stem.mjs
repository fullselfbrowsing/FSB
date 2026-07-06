#!/usr/bin/env node
/**
 * Phase 39.5 / Plan 02 (v1.0.0 Full App Catalog -- BRDTH-01) -- the
 * NO-DUPLICATE-STEM CI gate (BLOCKER A correctness backstop).
 *
 * THE TRAP THIS CLOSES: the importer (scripts/import-opentabs-catalog.mjs) writes each
 * descriptor FLAT as catalog/descriptors/opentabs__<service-stem>__<op>.json. The
 * frozen host-derived stem (service.replace(/^app./,'').split('.')[0]) is WRONG or
 * COLLIDING for ~40 of the real ~117 plugins -- six collision groups (the 4-way
 * `console`: aws-console/clickhouse/google-cloud/twilio; `www`; `cloud`; `web`;
 * `slack`; `atlassian`) would emit the SAME opentabs__<stem>__*.json filename and
 * SILENTLY CLOBBER each other. That is DATA CORRUPTION (a lost descriptor), not a crash
 * -- nothing surfaces it at runtime. STEM_OVERRIDES gives each app a DISTINCT canonical
 * stem; this gate turns a MISSING override (a re-introduced collision) into a BUILD
 * FAILURE: it enumerates the real vendored set and FAILS (exit != 0) naming both apps
 * if any two would emit the same opentabs__<stem>__ filename prefix.
 *
 * NO-DRIFT GUARANTEE: the gate re-derives each app's stem by importing the importer's
 * OWN enumerateBatchApps / readPluginMeta / displayServiceStem -- the SAME functions
 * extractDescriptors uses to build the filename prefix -- so the gate computes the
 * EXACT prefix the importer writes and can never disagree with it.
 *
 * DUAL EXPORT (mirrors scripts/verify-classification-gate.mjs):
 *   - export { checkNoDuplicateStem } -- driven by tests/no-duplicate-stem.test.js.
 *   - CLI on direct invocation -- chained into validate:extension (-> ci) as the
 *     committed-corpus backstop. Both paths reuse the SAME checkNoDuplicateStem logic.
 *
 * Wall-1 discipline: this is build tooling (NOT shipped to the browser), kept FREE of
 * run-string-as-code / function-from-string / dynamic-module-loader constructs in code
 * AND comments, consistent with the recipe-path guard. The static `import ... from`
 * below is the ESM module graph, not a dynamic loader.
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  enumerateBatchApps,
  readPluginMeta,
  displayServiceStem,
} from './import-opentabs-catalog.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// ---- Derive the EXACT filename-prefix stem the importer emits ----------------
// This MUST mirror extractDescriptors:
//   derivedStem = service.replace(/^app./, '').split('.')[0]
//   serviceStem = displayServiceStem(app, derivedStem)
// displayServiceStem is imported from the importer (not re-implemented) so a future
// STEM_OVERRIDES edit is honored here automatically.
function deriveStem(app, service) {
  const derivedStem = service ? service.replace(/^app\./, '').split('.')[0] : '';
  if (!derivedStem) return '';
  return displayServiceStem(app, derivedStem);
}

// Normalize one input item into { app, stem }. Accepts:
//   - a string app dir name -> read its vendored package.json host, derive the stem
//   - an object { app, service } -> derive the stem from the provided host (the
//     synthetic-collision shape the test uses; exercises the REAL derivation path)
//   - an object { app, stem } -> use the provided stem verbatim (explicit override)
function resolveItem(item) {
  if (typeof item === 'string') {
    let service = '';
    try {
      service = readPluginMeta(item).service;
    } catch (_e) {
      service = '';
    }
    return { app: item, stem: deriveStem(item, service) };
  }
  if (item && typeof item === 'object') {
    const app = String(item.app || '');
    if (typeof item.stem === 'string' && item.stem) {
      return { app, stem: item.stem };
    }
    let service = typeof item.service === 'string' ? item.service : '';
    if (!service && app) {
      try {
        service = readPluginMeta(app).service;
      } catch (_e) {
        service = '';
      }
    }
    return { app, stem: deriveStem(app, service) };
  }
  return { app: '', stem: '' };
}

/**
 * checkNoDuplicateStem(apps) -> { failures: string[] }
 *
 * apps: an array of app dir names (the importer's enumerated set) OR { app, service }
 * / { app, stem } items (the test's synthetic sets). Groups apps by the EXACT
 * opentabs__<stem>__ filename prefix each would emit and pushes a failure -- naming ALL
 * colliding apps + the shared stem -- for any stem owned by more than one app. An
 * empty stem (an empty-origin self-hosted app, BLOCKER C) is skipped, exactly as the
 * importer skips it, so the gate never false-fails on a clean skip.
 */
export function checkNoDuplicateStem(apps) {
  const failures = [];
  const list = Array.isArray(apps) ? apps : [];
  const byStem = new Map();
  for (const item of list) {
    const { app, stem } = resolveItem(item);
    if (!stem) continue; // empty-origin app -> the importer skips it too (BLOCKER C)
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(app);
  }
  for (const [stem, owners] of byStem) {
    if (owners.length > 1) {
      const named = owners.slice().sort().join(', ');
      failures.push(
        'duplicate stem "' + stem + '": ' + owners.length + ' apps [' + named + '] all ' +
        'emit the opentabs__' + stem + '__*.json filename prefix and would SILENTLY ' +
        'CLOBBER each other. Give each a DISTINCT STEM_OVERRIDES entry in ' +
        'scripts/import-opentabs-catalog.mjs (keyed by the vendored dir name).'
      );
    }
  }
  return { failures };
}

// ---- CLI entry (only on direct invocation, never on import) ------------------
function runCli() {
  const apps = enumerateBatchApps();
  const { failures } = checkNoDuplicateStem(apps);
  if (failures.length > 0) {
    console.error(
      'verify-no-duplicate-stem: FAIL (' + failures.length + ' colliding stem(s) -- a ' +
      'missing STEM_OVERRIDE would silently clobber a descriptor):'
    );
    for (const f of failures) {
      console.error('  - ' + f);
    }
    process.exit(1);
  }
  const distinct = new Set(apps.map((a) => resolveItem(a).stem).filter(Boolean));
  console.log(
    'verify-no-duplicate-stem: PASS (' + apps.length + ' enumerated vendored apps -> ' +
    distinct.size + ' distinct opentabs__<stem>__ filename prefixes; 0 collisions)'
  );
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli();
  } catch (err) {
    console.error('verify-no-duplicate-stem: ERROR ' + (err && err.message ? err.message : err));
    process.exit(1);
  }
}
