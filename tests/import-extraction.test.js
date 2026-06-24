#!/usr/bin/env node
/**
 * Phase 36 / Plan 01 (CGEN-01) -- importer zod->closed-params extraction.
 *
 * Drives z.toJSONSchema over a small fixture Zod schema and asserts the
 * EMPIRICALLY-VERIFIED Mechanic-1 shapes the importer relies on:
 *   - z.object() emits additionalProperties:false BY DEFAULT (the closed contract)
 *   - an optional key DROPS from `required`
 *   - z.union -> anyOf
 *   - z.enum -> { type:string, enum:[...] }
 *   - z.string().default('x') emits "default":"x" AND the key STAYS in required
 *   - $schema is stripped by the importer's normalizer
 *
 * Also imports the importer module (scripts/import-opentabs-catalog.mjs) and
 * exercises its exported `toClosedParams` helper to prove the importer's own
 * normalization (z.toJSONSchema + delete $schema) yields the closed shape.
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

async function main() {
  // zod is a devDependency (build-time); this is a build-time test, so importing
  // it here is fine (the test never ships to the browser).
  const { z } = await import('zod');
  const importerUrl = pathToFileURL(
    path.resolve(__dirname, '..', 'scripts', 'import-opentabs-catalog.mjs')
  ).href;
  const importer = await import(importerUrl);

  check(typeof importer.toClosedParams === 'function', 'importer exports toClosedParams');

  // ---- 1. z.object closed-by-default + optional drops from required ----------
  const objSchema = z.object({
    title: z.string().min(1),
    body: z.string().optional(),
  });
  const objParams = importer.toClosedParams(objSchema);
  check(objParams.type === 'object', 'object -> type:object');
  check(objParams.additionalProperties === false, 'object -> additionalProperties:false by default');
  check(Array.isArray(objParams.required) && objParams.required.includes('title'), 'required includes title');
  check(Array.isArray(objParams.required) && !objParams.required.includes('body'), 'optional body drops from required');
  check(objParams.$schema === undefined, '$schema is stripped');

  // ---- 2. z.union -> anyOf --------------------------------------------------
  const unionParams = importer.toClosedParams(z.object({ v: z.union([z.string(), z.number()]) }));
  const vSchema = unionParams.properties && unionParams.properties.v;
  check(!!vSchema && Array.isArray(vSchema.anyOf), 'union -> anyOf');
  check(
    !!vSchema && Array.isArray(vSchema.anyOf) &&
      vSchema.anyOf.some((b) => b.type === 'string') &&
      vSchema.anyOf.some((b) => b.type === 'number'),
    'anyOf carries string + number branches'
  );

  // ---- 3. z.enum -> { type:string, enum:[...] } -----------------------------
  const enumParams = importer.toClosedParams(z.object({ state: z.enum(['open', 'closed', 'all']) }));
  const stateSchema = enumParams.properties && enumParams.properties.state;
  check(!!stateSchema && stateSchema.type === 'string', 'enum -> type:string');
  check(
    !!stateSchema && Array.isArray(stateSchema.enum) &&
      stateSchema.enum.length === 3 && stateSchema.enum.includes('open'),
    'enum -> enum:[open,closed,all]'
  );

  // ---- 4. default emits "default" AND stays required ------------------------
  const defParams = importer.toClosedParams(z.object({ mode: z.string().default('hi') }));
  const modeSchema = defParams.properties && defParams.properties.mode;
  check(!!modeSchema && modeSchema.default === 'hi', 'default value emitted');
  check(Array.isArray(defParams.required) && defParams.required.includes('mode'), 'defaulted key STAYS in required');

  // ---- report ---------------------------------------------------------------
  if (failed > 0) {
    console.error('import-extraction.test: FAIL (' + failed + ' failure(s), ' + passed + ' passed)');
    process.exit(1);
  }
  console.log('import-extraction.test: PASS (' + passed + ' checks)');
  process.exit(0);
}

main().catch((err) => {
  console.error('import-extraction.test: ERROR ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
