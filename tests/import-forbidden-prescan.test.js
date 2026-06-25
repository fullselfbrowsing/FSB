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
const { execFileSync } = require('node:child_process');

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

  // ---- Phase 39.5 carve proof: target.apply_promo_code code -> promo_code -----
  // The importer renames target.apply_promo_code's BUSINESS `code` input field to
  // `promo_code` BEFORE the pre-scan (a promo/coupon code, a false-positive of the
  // eval-able FORBIDDEN token set). These rows prove the carve is NARROW + per-op: a
  // generic `code` and the eval-able names stay ALWAYS-fatal; only this one op renames.

  // (1) a generic top-level `code` field STILL trips preScanForbidden (FORBIDDEN intact).
  const genericCode = {
    type: 'object',
    properties: { code: { type: 'string' }, title: { type: 'string' } },
    additionalProperties: false,
  };
  check(sameSet(importer.preScanForbidden(genericCode), ['code']),
    'carve is narrow: a generic top-level code field STILL trips preScanForbidden');
  let genericThrew = false;
  try {
    importer.assertCleanParams(genericCode, 'generic_code_op');
  } catch (_e) {
    genericThrew = true;
  }
  check(genericThrew, 'carve is narrow: assertCleanParams STILL throws on a generic code op (not allowlisted)');

  // (2) the eval-able names script/expr/transform/fn/js EACH still trip the pre-scan
  //     (the carve did NOT weaken them -- they remain ALWAYS-fatal).
  for (const evil of ['script', 'expr', 'transform', 'fn', 'js']) {
    const planted = { type: 'object', properties: { [evil]: { type: 'string' } }, additionalProperties: false };
    check(sameSet(importer.preScanForbidden(planted), [evil]),
      'eval-able name "' + evil + '" STILL trips the pre-scan (always-fatal preserved)');
  }

  // (3) the REAL target.apply_promo_code descriptor emits promo_code (renamed) and NO
  //     code, passing the pre-scan. extractDescriptors("target") imports the real plugin
  //     .ts (which resolves sibling ".js" specifiers to ".ts"), so it runs under the tsx
  //     loader -- the SAME `node --import tsx` run mode the importer documents. We spawn it
  //     in a tsx subprocess so THIS test stays runnable under plain `node` (the npm chain).
  //     (importerUrl is already declared above and points at the same importer module.)
  const evalSrc =
    'import(' + JSON.stringify(importerUrl) + ').then(function(m){return m.extractDescriptors("target");})' +
    '.then(function(rows){var d=rows.find(function(r){return r.descriptor.slug==="target.apply_promo_code";});' +
    'process.stdout.write(JSON.stringify(d?d.descriptor.params:null));})' +
    '.catch(function(e){process.stderr.write(String(e&&e.message?e.message:e));process.exit(7);});';
  let promoParams = null;
  let spawnErr = '';
  try {
    const out = execFileSync('node', ['--import', 'tsx', '-e', evalSrc], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    promoParams = JSON.parse(out);
  } catch (e) {
    spawnErr = (e && e.stderr ? String(e.stderr) : '') || (e && e.message ? e.message : String(e));
  }
  check(spawnErr === '' && !!promoParams && typeof promoParams === 'object',
    'extractDescriptors("target") emits the apply_promo_code descriptor WITHOUT throwing (the carve unblocks the op)'
      + (spawnErr ? ' [' + spawnErr.trim() + ']' : ''));
  check(!!(promoParams && promoParams.properties && promoParams.properties.promo_code),
    'the carved descriptor exposes a promo_code property (renamed from code)');
  check(!(promoParams && promoParams.properties && promoParams.properties.code),
    'the carved descriptor has NO code property (the business token was renamed, not duplicated)');
  check(!!(promoParams && Array.isArray(promoParams.required)
      && promoParams.required.indexOf('promo_code') !== -1
      && promoParams.required.indexOf('code') === -1),
    'the carved required[] lists promo_code and not code');
  check(!!promoParams && importer.preScanForbidden(promoParams).length === 0,
    'the carved target.apply_promo_code params pass preScanForbidden (0 forbidden fields remain)');

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
