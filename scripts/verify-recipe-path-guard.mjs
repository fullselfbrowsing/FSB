#!/usr/bin/env node
/**
 * Phase 26 / Plan 03 (v0.9.99 Native Capability Catalog) -- recipe-path CI guard.
 *
 * Wall-1 "no code fetched as data" enforced at BUILD time, forever. This guard
 * makes future drift that reintroduces dynamic code on the recipe path turn CI
 * red. It is build/CI tooling: it is NOT shipped to the browser and is NOT on
 * the recipe-path allowlist it scans, so it MAY itself use vm/require to load
 * the schema for the fixture check (the allowlist below deliberately excludes
 * this file -- it would otherwise self-flag on its own forbidden-pattern regex
 * literals and on the cfworker IIFE loader).
 *
 * Four checks (D-16 / D-17):
 *   1. ALLOWLIST GREP -- read each of the EXACTLY SIX hardcoded recipe-path
 *      files and fail on any /\beval\s*\(/, /\bnew\s+Function\b/, /\bimport\s*\(/
 *      match. NOT a glob, NOT a whole-extension/ walk (a broad grep would
 *      false-positive on FSB's three SANCTIONED MAIN-world execute_js sites).
 *      The precise word-boundary patterns avoid matching innocent minified
 *      substrings (e.g. "retrieval", "evaluate", "important") in the vendored
 *      libs.
 *   2. FIXTURE RUN -- load the cfworker IIFE so globalThis.CfworkerJsonSchema is
 *      set, require the recipe-schema module, and run validateRecipe over every
 *      JSON fixture in catalog/recipes/_fixtures/: valid-* MUST be accepted
 *      (success === true), reject-* MUST be rejected (success === false). This
 *      is a build-time proof that the closed vocabulary rejects out-of-vocab
 *      recipes (CAP-01/CAP-04), independent of the runtime test suite.
 *   3. NEGATIVE SELF-ASSERTION (D-17) -- assert NONE of the three known
 *      SANCTIONED sites (tool-executor.js, mcp-bridge-client.js,
 *      lattice-runtime-adapter.js) is on the allowlist. These legitimately use
 *      eval / new Function / import in MAIN world (a different trust class) and
 *      must NOT be flagged; this defends against allowlist drift ever adding
 *      one (which would break the build on sanctioned code).
 *   4. ALLOWLIST DRIFT / BYPASS-BY-OMISSION (LO-03) -- enumerate
 *      extension/utils/capability-*.js FROM DISK and fail if any such module is
 *      absent from RECIPE_PATH_ALLOWLIST. Without this, a new capability module
 *      that nobody remembers to add to the hardcoded list is simply never
 *      scanned and could reintroduce dynamic code undetected. The sanctioned
 *      sites live outside utils/, so they do not collide with this glob.
 *
 * Test-only seam: FSB_RECIPE_GUARD_EXTRA_ALLOWLIST (a comma-separated path
 * list), when set, is appended to the allowlist BEFORE the grep. This exists
 * solely so tests/recipe-path-guard.test.js can point the guard at a temp
 * planted-eval fixture and assert the guard flips non-zero. It is NEVER set in
 * CI or normal operation.
 *
 * Analog: scripts/verify-store-listing.mjs (Node-builtins-only static gate;
 * failures[] accumulator; safeRead; process.exit(1) on fail / exit(0) on pass).
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const failures = [];

function safeRead(path, label) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    failures.push(`${label}: cannot read ${path} (${err.code || err.message})`);
    return null;
  }
}

// ---- The recipe-path file allowlist (D-17) ---------------------------------
//
// EXACTLY the six recipe-path files: the three capability modules + the three
// vendored runtime libs. Hardcoded -- NOT a glob, NOT a directory walk. This
// file (verify-recipe-path-guard.mjs) and the spawn test are intentionally
// ABSENT: they contain the literal forbidden patterns as regex/strings and
// would self-flag.
const RECIPE_PATH_ALLOWLIST = [
  'extension/utils/capability-recipe-schema.js',
  'extension/utils/capability-interpreter.js',
  'extension/utils/capability-auth-strategies.js',
  'extension/lib/cfworker-json-schema.min.js',
  'extension/lib/jmespath.min.js',
  'extension/lib/minisearch.min.js',
];

// ---- The three SANCTIONED execute_js sites that must NOT be on the allowlist
//      (D-17). Verified whole-tree grep: exactly these three legitimately use
//      eval / new Function / import in MAIN world (a different trust class).
const SANCTIONED_SITES = [
  'extension/ai/tool-executor.js',        // eval(jsCode) -- MAIN-world execute_js
  'extension/ws/mcp-bridge-client.js',    // new Function(userCode) -- MAIN-world execute_js
  'extension/ai/lattice-runtime-adapter.js', // import('lattice') in a comment
];

// ---- Forbidden patterns. Precise word-boundary forms so the minified vendored
//      libs do not false-positive on innocent substrings ("retrieval",
//      "evaluate", "evaluation", "important"). ----------------------------------
const FORBIDDEN = [
  { re: /\beval\s*\(/, name: 'eval(' },
  { re: /\bnew\s+Function\b/, name: 'new Function' },
  { re: /\bimport\s*\(/, name: 'import(' },
];

// Test-only seam: append extra paths (comma-separated) before the grep.
const EXTRA = (process.env.FSB_RECIPE_GUARD_EXTRA_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const SCAN_LIST = RECIPE_PATH_ALLOWLIST.concat(EXTRA);

// ---- Check 1: allowlist grep -----------------------------------------------
for (const rel of SCAN_LIST) {
  // EXTRA paths may be absolute (temp dirs); allowlist paths are repo-relative.
  const abs = rel.startsWith('/') ? rel : resolve(ROOT, rel);
  const text = safeRead(abs, `recipe-path allowlist (${rel})`);
  if (text === null) continue;
  for (const f of FORBIDDEN) {
    if (f.re.test(text)) {
      failures.push(
        `recipe-path file '${rel}' contains forbidden dynamic-code construct ` +
        `'${f.name}' -- Wall-1 forbids code fetched/executed as data on the ` +
        `recipe path. If this is a sanctioned MAIN-world execute_js site it must ` +
        `NOT be on the recipe-path allowlist.`
      );
    }
  }
}

// ---- Check 2: fixture run (closed-vocabulary rejection proof) ----------------
const CFWORKER_PATH = resolve(ROOT, 'extension/lib/cfworker-json-schema.min.js');
const SCHEMA_MODULE_PATH = resolve(ROOT, 'extension/utils/capability-recipe-schema.js');
const FIXTURE_DIR = resolve(ROOT, 'catalog/recipes/_fixtures');

function classifyFixture(filename) {
  if (/^valid-/.test(filename)) return 'accept';
  if (/^reject-/.test(filename)) return 'reject';
  return null; // unknown naming -> skip (only valid-*/reject-* are fixtures)
}

(function runFixtures() {
  // Load the cfworker IIFE into the global so the schema module's typeof-guarded
  // accessor finds CfworkerJsonSchema (same loader the Plan 01 test uses).
  let cfworkerSrc;
  try {
    cfworkerSrc = readFileSync(CFWORKER_PATH, 'utf8');
  } catch (err) {
    failures.push(`fixture run: cannot read cfworker bundle ${CFWORKER_PATH} (${err.code || err.message})`);
    return;
  }
  try {
    vm.runInThisContext(cfworkerSrc, { filename: CFWORKER_PATH });
  } catch (err) {
    failures.push(`fixture run: failed to evaluate cfworker bundle (${err && err.message ? err.message : err})`);
    return;
  }
  if (typeof globalThis.CfworkerJsonSchema !== 'object' || !globalThis.CfworkerJsonSchema) {
    failures.push('fixture run: globalThis.CfworkerJsonSchema not populated after loading the bundle');
    return;
  }

  let schemaModule;
  try {
    schemaModule = require(SCHEMA_MODULE_PATH);
  } catch (err) {
    failures.push(`fixture run: cannot require recipe-schema module (${err && err.message ? err.message : err})`);
    return;
  }
  if (typeof schemaModule.validateRecipe !== 'function') {
    failures.push('fixture run: recipe-schema module does not export validateRecipe');
    return;
  }

  let files;
  try {
    files = readdirSync(FIXTURE_DIR).filter((n) => n.endsWith('.json'));
  } catch (err) {
    failures.push(`fixture run: cannot read fixture dir ${FIXTURE_DIR} (${err.code || err.message})`);
    return;
  }
  if (files.length === 0) {
    failures.push(`fixture run: no JSON fixtures found in ${FIXTURE_DIR}`);
    return;
  }

  let accepts = 0;
  let rejects = 0;
  for (const name of files) {
    const kind = classifyFixture(name);
    if (!kind) continue;
    let recipe;
    try {
      recipe = JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
    } catch (err) {
      failures.push(`fixture run: '${name}' is not valid JSON (${err.message})`);
      continue;
    }
    let result;
    try {
      result = schemaModule.validateRecipe(recipe);
    } catch (err) {
      failures.push(`fixture run: validateRecipe threw on '${name}' (${err && err.message ? err.message : err})`);
      continue;
    }
    const ok = result && result.success === true;
    if (kind === 'accept') {
      accepts++;
      if (!ok) {
        failures.push(
          `fixture run: accept fixture '${name}' was REJECTED ` +
          `(code ${result && result.code}) -- a valid recipe must validate.`
        );
      }
    } else { // reject
      rejects++;
      if (ok) {
        failures.push(
          `fixture run: reject fixture '${name}' was ACCEPTED -- an ` +
          `out-of-vocabulary / forbidden-field / bad-enum recipe must be rejected ` +
          `(closed-vocabulary proof, CAP-01/CAP-04).`
        );
      }
    }
  }
  if (accepts === 0) failures.push('fixture run: no accept (valid-*) fixtures were exercised');
  if (rejects === 0) failures.push('fixture run: no reject (reject-*) fixtures were exercised');
})();

// ---- Check 3: negative self-assertion (sanctioned sites NOT on allowlist) ----
for (const site of SANCTIONED_SITES) {
  if (RECIPE_PATH_ALLOWLIST.indexOf(site) !== -1) {
    failures.push(
      `allowlist drift: sanctioned execute_js site '${site}' is on the recipe-path ` +
      `allowlist -- it legitimately uses dynamic code in MAIN world (a different ` +
      `trust class) and must NEVER be on the allowlist, or the build breaks on ` +
      `sanctioned code.`
    );
  }
}

// ---- Check 4: allowlist drift / bypass-by-omission (LO-03) ------------------
//
// The hardcoded allowlist's correctness depends on humans remembering to append
// every new capability module to it; a future extension/utils/capability-foo.js
// that introduces eval/new Function/import() would simply not be scanned. Close
// that gap by enumerating extension/utils/capability-*.js FROM DISK and failing
// if any such file is absent from RECIPE_PATH_ALLOWLIST. The three sanctioned
// MAIN-world sites live OUTSIDE utils/ (ai/, ws/), so they cannot collide with
// this glob. Fails closed if the directory cannot be read.
const CAPABILITY_DIR_REL = 'extension/utils';
const CAPABILITY_DIR_ABS = resolve(ROOT, CAPABILITY_DIR_REL);
let capabilityFiles;
try {
  capabilityFiles = readdirSync(CAPABILITY_DIR_ABS)
    .filter((n) => /^capability-.*\.js$/.test(n))
    .map((n) => `${CAPABILITY_DIR_REL}/${n}`);
} catch (err) {
  failures.push(
    `allowlist drift check: cannot read ${CAPABILITY_DIR_REL} ` +
    `(${err.code || err.message}) -- cannot prove the allowlist covers every ` +
    `capability module.`
  );
  capabilityFiles = [];
}
for (const f of capabilityFiles) {
  if (RECIPE_PATH_ALLOWLIST.indexOf(f) === -1) {
    failures.push(
      `allowlist drift: '${f}' exists on disk but is NOT on the recipe-path ` +
      `allowlist -- a capability module that the guard does not scan can ` +
      `reintroduce dynamic code undetected (bypass-by-omission). Add it to ` +
      `RECIPE_PATH_ALLOWLIST.`
    );
  }
}

// ---- Exit convention (clone of verify-store-listing.mjs) --------------------
if (failures.length > 0) {
  console.error('verify-recipe-path-guard: FAIL');
  for (const f of failures) {
    console.error('  - ' + f);
  }
  process.exit(1);
}

console.log(
  'verify-recipe-path-guard: PASS (' +
  RECIPE_PATH_ALLOWLIST.length + ' recipe-path files clean, fixtures validated, ' +
  SANCTIONED_SITES.length + ' sanctioned sites excluded, ' +
  capabilityFiles.length + ' on-disk capability modules all on the allowlist)'
);
process.exit(0);
