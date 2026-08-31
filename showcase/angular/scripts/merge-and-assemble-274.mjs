#!/usr/bin/env node
// Phase 274 / Plan 02 -- assemble messages.{lang}.xlf for a locale by:
//
//  1. Extracting existing targets from the current messages.{lang}.xlf.
//  2. Merging the new translations.stats-274.{lang}.json on top
//     (additive only; existing ids are NOT overridden).
//  3. Removing the _comment audit key so it never reaches the XLF.
//  4. Calling assemble-xliff-target.mjs's logic inline against the
//     refreshed messages.xlf so the output reflects ALL trans-units
//     (existing + the new 24).
//
// The script writes its output to a temp file then atomically moves it
// over messages.{lang}.xlf -- if the assemble step throws (a missing
// key in the merged JSON), the existing file is left intact.
//
// Phase 53 note: the translations.stats-274.*.json inputs were retired after
// live-XLIFF stats coverage was verified complete (see 53-STATS-RECONCILIATION.md).
// This helper is kept as historical tooling; re-running it will fail until those
// JSON sidecars are restored (not expected).
//
// Usage:
//   node scripts/merge-and-assemble-274.mjs es
//   node scripts/merge-and-assemble-274.mjs de
//   node scripts/merge-and-assemble-274.mjs ja
//   node scripts/merge-and-assemble-274.mjs zh-CN
//   node scripts/merge-and-assemble-274.mjs zh-TW

import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const [, , locale] = process.argv;
if (!locale) {
  console.error('Usage: merge-and-assemble-274.mjs <locale>');
  process.exit(2);
}

const SRC_XLIFF = 'src/locale/messages.xlf';
const EXISTING_XLF = `src/locale/messages.${locale}.xlf`;
const NEW_JSON = `src/locale/translations.stats-274.${locale}.json`;
const TMP_OUT = `src/locale/.tmp.messages.${locale}.xlf`;
const FINAL_OUT = EXISTING_XLF;

// --- Step 1: extract existing targets from current messages.{lang}.xlf. ---
const existingXlf = readFileSync(EXISTING_XLF, 'utf8');
const existingTargets = {};
const transUnitRe = /<trans-unit id="([^"]+)" datatype="html">([\s\S]*?)<\/trans-unit>/g;
let m;
while ((m = transUnitRe.exec(existingXlf)) !== null) {
  const id = m[1];
  const body = m[2];
  const tgtMatch = body.match(/<target[^>]*>([\s\S]*?)<\/target>/);
  if (tgtMatch) {
    existingTargets[id] = tgtMatch[1];
  }
}
console.error(`[${locale}] existing targets: ${Object.keys(existingTargets).length}`);

// --- Step 2: merge translations.stats-274.{lang}.json on top. ---
const newJson = JSON.parse(readFileSync(NEW_JSON, 'utf8'));
delete newJson._comment;  // never reaches the XLF
const merged = { ...existingTargets, ...newJson };
console.error(`[${locale}] new SHOWCASE_STATS_FSB_* keys: ${Object.keys(newJson).length}`);
console.error(`[${locale}] merged total: ${Object.keys(merged).length}`);

// --- Step 3: walk the refreshed messages.xlf and inject targets. ---
const source = readFileSync(SRC_XLIFF, 'utf8');
let out = source.replace(
  /<file\s+source-language="en"\s+datatype="plaintext"\s+original="ng2\.template">/,
  `<file source-language="en" target-language="${locale}" datatype="plaintext" original="ng2.template">`
);

const missing = [];
const extra = new Set(Object.keys(merged));
out = out.replace(
  /<trans-unit id="([^"]+)" datatype="html">([\s\S]*?)<\/trans-unit>/g,
  (match, id, body) => {
    const target = merged[id];
    extra.delete(id);
    if (target === undefined) {
      missing.push(id);
      return match;
    }
    const patched = body.replace(
      /(<\/source>)/,
      `$1\n        <target state="translated">${target}</target>`
    );
    return `<trans-unit id="${id}" datatype="html">${patched}</trans-unit>`;
  }
);

if (missing.length > 0) {
  console.error(`FATAL [${locale}]: ${missing.length} trans-units missing translation:`);
  for (const id of missing.slice(0, 20)) console.error(`  - ${id}`);
  if (missing.length > 20) console.error(`  ... and ${missing.length - 20} more`);
  process.exit(1);
}
if (extra.size > 0) {
  console.error(`WARNING [${locale}]: ${extra.size} merged keys have no matching trans-unit (orphan ids):`);
  for (const id of [...extra].slice(0, 10)) console.error(`  - ${id}`);
}

// --- Step 4: atomic write. ---
writeFileSync(TMP_OUT, out, 'utf8');
renameSync(TMP_OUT, FINAL_OUT);
console.error(`[${locale}] wrote ${FINAL_OUT} (${out.length} bytes)`);
