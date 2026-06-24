#!/usr/bin/env node
/**
 * Phase 36 / Plan 01 (CGEN-01) -- the Wall-1 recursive forbidden-field pre-scan.
 *
 * z.toJSONSchema does NOT strip a property literally named script/expr/transform/
 * code/fn/js -- it passes the name through at whatever depth the source put it. The
 * pre-scan must RECURSE over the FLATTENED JSON Schema and reject any descriptor
 * carrying a forbidden field name at ANY depth (top / nested / array items / union
 * anyOf branch / recursive $defs), with zero false-positives on a clean schema.
 *
 * This imports the REAL collectPropertyNames / preScanForbidden from the importer
 * module and asserts the 6 EMPIRICALLY-VERIFIED fixture rows (RESEARCH Mechanic 1):
 *   clean-create-issue (owner/repo/title/body) -> []
 *   forbidden-top       (script)               -> [script]
 *   forbidden-nested    (config/code/name)     -> [code]
 *   forbidden-in-array  (steps/fn)             -> [fn]
 *   forbidden-in-union  (payload/expr/safe)    -> [expr]
 *   forbidden-in-defs   (root/js/kids)         -> [js]
 *
 * It also proves the importer THROWS (emits nothing) when a hand-planted forbidden
 * field is fed through the per-op guard helper.
 *
 * Zero-framework convention: PASS=/FAIL=, process.exit(1) on any failure.
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

function sameSet(a, b) {
  if (!Array.isArray(a)) return false;
  const sa = new Set(a.map((x) => String(x).toLowerCase()));
  const sb = new Set(b.map((x) => String(x).toLowerCase()));
  if (sa.size !== sb.size) return false;
  for (const x of sb) if (!sa.has(x)) return false;
  return true;
}

// The 6 EMPIRICALLY-VERIFIED flattened-JSON-Schema fixtures (post z.toJSONSchema).
const FIXTURES = {
  // clean: top-level object, no forbidden names.
  cleanCreateIssue: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      title: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['owner', 'repo', 'title'],
    additionalProperties: false,
  },
  // forbidden-top: a top-level property literally named `script`.
  forbiddenTop: {
    type: 'object',
    properties: {
      script: { type: 'string' },
      title: { type: 'string' },
    },
    additionalProperties: false,
  },
  // forbidden-nested: `code` nested inside a `config` object's properties.
  forbiddenNested: {
    type: 'object',
    properties: {
      config: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
  },
  // forbidden-in-array: `fn` inside an array items object's properties.
  forbiddenInArray: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            fn: { type: 'string' },
          },
        },
      },
    },
  },
  // forbidden-in-union: `expr` inside a z.union -> anyOf branch's properties.
  forbiddenInUnion: {
    type: 'object',
    properties: {
      payload: {
        anyOf: [
          { type: 'object', properties: { expr: { type: 'string' } } },
          { type: 'object', properties: { safe: { type: 'string' } } },
        ],
      },
    },
  },
  // forbidden-in-defs: `js` inside a recursive $defs branch's properties.
  forbiddenInDefs: {
    type: 'object',
    properties: {
      root: { $ref: '#/$defs/__schema0' },
    },
    $defs: {
      __schema0: {
        type: 'object',
        properties: {
          js: { type: 'string' },
          kids: { type: 'array', items: { $ref: '#/$defs/__schema0' } },
        },
      },
    },
  },
};

async function main() {
  const importerUrl = pathToFileURL(
    path.resolve(__dirname, '..', 'scripts', 'import-opentabs-catalog.mjs')
  ).href;
  const importer = await import(importerUrl);

  check(typeof importer.collectPropertyNames === 'function', 'importer exports collectPropertyNames');
  check(typeof importer.preScanForbidden === 'function', 'importer exports preScanForbidden');

  // ---- the 6 verified rows --------------------------------------------------
  check(sameSet(importer.preScanForbidden(FIXTURES.cleanCreateIssue), []), 'clean-create-issue -> [] (no false positive)');
  check(sameSet(importer.preScanForbidden(FIXTURES.forbiddenTop), ['script']), 'forbidden-top -> [script]');
  check(sameSet(importer.preScanForbidden(FIXTURES.forbiddenNested), ['code']), 'forbidden-nested -> [code]');
  check(sameSet(importer.preScanForbidden(FIXTURES.forbiddenInArray), ['fn']), 'forbidden-in-array -> [fn]');
  check(sameSet(importer.preScanForbidden(FIXTURES.forbiddenInUnion), ['expr']), 'forbidden-in-union -> [expr]');
  check(sameSet(importer.preScanForbidden(FIXTURES.forbiddenInDefs), ['js']), 'forbidden-in-defs -> [js]');

  // ---- collectPropertyNames sanity: collects names at every depth -----------
  const allNames = [...importer.collectPropertyNames(FIXTURES.forbiddenInDefs, new Set())];
  check(allNames.includes('js') && allNames.includes('kids') && allNames.includes('root'), 'collectPropertyNames recurses into $defs');

  // ---- the importer throws (emits nothing) on a planted forbidden field -----
  // assertCleanParams is the per-op guard the emit loop calls; it MUST throw.
  check(typeof importer.assertCleanParams === 'function', 'importer exports assertCleanParams (the per-op guard)');
  let threw = false;
  try {
    importer.assertCleanParams(FIXTURES.forbiddenTop, 'planted_op');
  } catch (_e) {
    threw = true;
  }
  check(threw, 'assertCleanParams THROWS on a planted forbidden field (emit aborts for that op)');
  // and does NOT throw on a clean schema
  let cleanThrew = false;
  try {
    importer.assertCleanParams(FIXTURES.cleanCreateIssue, 'clean_op');
  } catch (_e) {
    cleanThrew = true;
  }
  check(!cleanThrew, 'assertCleanParams passes a clean schema (no false abort)');

  if (failed > 0) {
    console.error('import-forbidden-prescan.test: FAIL (' + failed + ' failure(s), ' + passed + ' passed)');
    process.exit(1);
  }
  console.log('import-forbidden-prescan.test: PASS (' + passed + ' checks)');
  process.exit(0);
}

main().catch((err) => {
  console.error('import-forbidden-prescan.test: ERROR ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
