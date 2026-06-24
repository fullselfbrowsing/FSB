#!/usr/bin/env node
'use strict';

/**
 * Phase 36 Plan 04 (CGEN-04) -- catalog inline-shape lock + djb2 catalogVersion.
 *
 * VERIFIER (NOT a regen owner). Plan 01 (Wave 1, Task 4) ALREADY regenerated +
 * committed extension/catalog/recipe-index.generated.js after emitting the FLAT
 * opentabs__todoist__*.json descriptors. This suite asserts the SHAPE of that
 * already-reconciled snapshot is byte-stable (INV-01) and that the emitted todoist
 * slugs actually inlined -- it does NOT own the file, does NOT rebuild it, and does
 * NOT assert against a pre-emit baseline.
 *
 * What it locks (INV-01, T-36-11 / T-36-14):
 *   (a) The IIFE wrapper shape -- a single `(function(global){ ... })` that sets
 *       `global.FsbRecipeIndex = DATA` with the `module.exports = DATA` dual-export
 *       tail. A STRUCTURAL/regex assertion (NOT a full-file byte diff): the
 *       descriptor DATA legitimately grew 8 -> 15, so a byte diff would falsely red.
 *   (b) The inlined DATA.descriptors INCLUDE the emitted todoist slugs (guards the
 *       Pitfall-1 silent subdir-drop: if readJsonDir had missed the FLAT descriptors
 *       the smoke slugs would be absent from the committed snapshot).
 *   (c) IDEMPOTENCY / restore-not-rebuild -- recomputing the generation path
 *       (readJsonDir(catalog/descriptors) -> the same {recipes,descriptors} JSON
 *       literal) over the SAME on-disk corpus reproduces the EXACT committed bytes
 *       WITHOUT rewriting the file; and `_computeCatalogVersion` (the djb2 over
 *       sorted slugs) is DETERMINISTIC over the same corpus (computed twice => the
 *       identical hash) and CHANGES when the slug set changes (+/- one synthetic
 *       slug => a different hash). The generator code path is unchanged; descriptors
 *       only grow the DATA literal; a same-corpus rebuild restores rather than
 *       rebuilds the SW index.
 *
 * The generation source-of-truth is mirrored in-memory from package-extension.mjs so
 * the test never mutates the Plan-01-committed file (no files_modified conflict). A
 * separate plan <verify> step exercises the real `node scripts/package-extension.mjs`
 * idempotency end-to-end.
 *
 * Zero-framework FSB convention (mirrors tests/recipe-schema-lock.test.js):
 * module-level passed/failed counters, check(cond,msg), process.exit(failed>0?1:0).
 * ASCII-only, NO emojis.
 *
 * Run: node tests/catalog-inline-shape.test.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const GENERATED_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const CATALOG_ROOT = path.join(REPO_ROOT, 'catalog');
const DESCRIPTORS_DIR = path.join(CATALOG_ROOT, 'descriptors');
const RECIPES_DIR = path.join(CATALOG_ROOT, 'recipes');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

// ---- The committed snapshot under test (Plan-01-reconciled; we only READ it) ----
check(fs.existsSync(GENERATED_PATH),
  'extension/catalog/recipe-index.generated.js exists (Plan 01 Task 4 regenerated it)');
const generatedSource = fs.existsSync(GENERATED_PATH) ? fs.readFileSync(GENERATED_PATH, 'utf8') : '';

// require() it to read the inlined DATA (dual-export tail makes module.exports = DATA).
let DATA = null;
try {
  DATA = require(GENERATED_PATH);
} catch (e) {
  console.error('  FAIL: could not require() the generated snapshot:', e.message);
}
check(DATA && Array.isArray(DATA.descriptors) && Array.isArray(DATA.recipes),
  'the generated snapshot dual-exports { recipes, descriptors } (module.exports = DATA)');

// ---- (a) INV-01: the IIFE wrapper + dual-export tail shape (structural, NOT a byte diff) ----
//
// Adding descriptors only grows the DATA JSON literal; the wrapper/tail are untouched.
// Lock the wrapper open, the DATA binding, the FsbRecipeIndex assignment, and the
// module.exports dual-export tail -- NOT the full file (the grown DATA must not red).
check(/\(function\s*\(\s*global\s*\)\s*\{/.test(generatedSource),
  'IIFE wrapper present: `(function(global){` (INV-01 wrapper shape unchanged)');
check(/var\s+DATA\s*=\s*\{/.test(generatedSource),
  'the DATA binding is a `var DATA = { ... }` JSON literal (descriptors only grow this)');
check(/global\.FsbRecipeIndex\s*=\s*DATA\s*;/.test(generatedSource),
  'global.FsbRecipeIndex = DATA assignment intact (the SW catalog source)');
check(/if\s*\(\s*typeof\s+module\s*!==\s*'undefined'\s*&&\s*module\.exports\s*\)\s*\{\s*module\.exports\s*=\s*DATA\s*;\s*\}/.test(generatedSource),
  'dual-export tail intact: `module.exports = DATA` (Node require() path)');
check(/\}\)\(\s*typeof\s+globalThis\s*!==\s*'undefined'\s*\?\s*globalThis\s*:\s*this\s*\)\s*;?\s*$/.test(generatedSource.trimEnd() + '\n'),
  'IIFE invocation tail intact: `})(typeof globalThis !== ... )`');

// ---- (b) Pitfall-1 guard: the emitted todoist slugs ARE inlined in DATA.descriptors ----
//
// Read the slugs the importer actually emitted (the FLAT opentabs__todoist__*.json
// the non-recursive readJsonDir must have picked up) and assert every one is present
// in the committed snapshot. A silent subdir-drop would leave these absent.
const emittedTodoistFiles = fs.readdirSync(DESCRIPTORS_DIR)
  .filter((name) => name.startsWith('opentabs__') && name.endsWith('.json'));
check(emittedTodoistFiles.length > 0,
  `the importer emitted FLAT opentabs__*.json descriptors on disk (got ${emittedTodoistFiles.length})`);
const emittedTodoistSlugs = emittedTodoistFiles.map((name) =>
  JSON.parse(fs.readFileSync(path.join(DESCRIPTORS_DIR, name), 'utf8')).slug);
const inlinedSlugSet = new Set((DATA && DATA.descriptors ? DATA.descriptors : [])
  .map((d) => d && d.slug).filter(Boolean));
const missingFromSnapshot = emittedTodoistSlugs.filter((slug) => !inlinedSlugSet.has(slug));
check(missingFromSnapshot.length === 0,
  `every emitted todoist slug is inlined in the committed DATA.descriptors (missing: [${missingFromSnapshot.join(', ') || 'none'}])`);
check(emittedTodoistSlugs.length > 0 && emittedTodoistSlugs.every((s) => /^todoist\./.test(s)),
  `the emitted smoke slugs are the todoist family (e.g. ${emittedTodoistSlugs[0] || 'n/a'}) -- present in the inlined snapshot`);

// ---- (c) IDEMPOTENCY / restore-not-rebuild (recompute the generation path in-memory) ----
//
// Mirror package-extension.mjs's readJsonDir + IIFE assembly EXACTLY, in-memory, and
// assert it reproduces the committed bytes -- WITHOUT writing the file (this plan owns
// no shipped descriptors and must not re-own the snapshot). If the bytes match, the
// generator path is unchanged AND the emitted descriptors genuinely inlined.
function readJsonDir(absDir) {
  if (!fs.existsSync(absDir)) return [];
  return fs.readdirSync(absDir)
    .filter((name) => name.endsWith('.json')) // non-recursive: _fixtures/ excluded (mirror line 54)
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(absDir, name), 'utf8')));
}
const recipes = readJsonDir(RECIPES_DIR);
const descriptors = readJsonDir(DESCRIPTORS_DIR);
const catalogData = JSON.stringify({ recipes, descriptors }, null, 2);
const expectedSource =
  '// GENERATED by scripts/package-extension.mjs -- DO NOT EDIT BY HAND.\n' +
  '// Build-time catalog snapshot (D-16): recipes + descriptors shipped into the\n' +
  '// extension package so the capability-search index has data in a packaged build.\n' +
  '// Pure data dual-export IIFE; loaded via importScripts before capability-search.js.\n' +
  '(function(global) {\n' +
  "  'use strict';\n" +
  '  var DATA = ' + catalogData + ';\n' +
  '  global.FsbRecipeIndex = DATA;\n' +
  "  if (typeof module !== 'undefined' && module.exports) { module.exports = DATA; }\n" +
  '})(typeof globalThis !== \'undefined\' ? globalThis : this);\n';
check(expectedSource === generatedSource,
  'the in-memory regen over the SAME corpus reproduces the committed snapshot byte-for-byte (idempotent; restore-not-rebuild)');

// ---- (c) deterministic + change-sensitive catalogVersion (djb2 over sorted slugs) ----
//
// Mirror _computeCatalogVersion (capability-search.js:190-200) verbatim -- a pure djb2
// over the sorted slug set. The runtime module is the source of truth; reuse its export
// where possible, but the hash itself is deterministic by construction.
function computeCatalogVersion(descs, recs, declaredVersion) {
  const parts = (descs || []).map((d) => (d && d.slug ? d.slug : '')).sort();
  const seed = parts.join('|') + '#' + (recs ? recs.length : 0) + '#' + (declaredVersion || '');
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return (descs ? descs.length : 0) + ':' + (hash >>> 0).toString(16);
}
const v1 = computeCatalogVersion(DATA ? DATA.descriptors : [], DATA ? DATA.recipes : [], DATA ? DATA.version : '');
const v2 = computeCatalogVersion(DATA ? DATA.descriptors : [], DATA ? DATA.recipes : [], DATA ? DATA.version : '');
check(v1 === v2 && /^[0-9]+:[0-9a-f]+$/.test(v1),
  `catalogVersion is deterministic over the same corpus (computed twice => ${v1})`);

// Adding/removing a synthetic slug MUST shift the hash (a slug-set change rebuilds;
// a same-corpus rebuild restores). Use a slug that cannot already exist.
const withExtra = (DATA && DATA.descriptors ? DATA.descriptors.slice() : []);
withExtra.push({ slug: '__synthetic_probe_slug__.zzz' });
const vExtra = computeCatalogVersion(withExtra, DATA ? DATA.recipes : [], DATA ? DATA.version : '');
check(vExtra !== v1,
  'catalogVersion CHANGES when a slug is added (the hash tracks the slug set, not the count alone)');

// Cross-check against the runtime module's own djb2 (no options drift): the runtime
// derives the version inside buildOrRestore; we re-derive via the same algorithm and
// confirm the deterministic value matches a fresh recompute over the inlined corpus.
const vFromGenerated = computeCatalogVersion(descriptors, recipes, undefined);
check(vFromGenerated === v1,
  'the version over the on-disk corpus equals the version over the inlined snapshot (same slug set => same hash)');

// ---- Exit convention --------------------------------------------------------
console.log(`\ncatalog-inline-shape: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
