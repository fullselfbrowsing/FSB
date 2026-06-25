'use strict';

/**
 * Phase 35 plan 04 (v1.0.0 -- criterion 5) -- OpenTabs provenance + legal scaffold.
 *
 * Asserts the Phase-35 provenance/legal SCAFFOLD that makes the Phase-36 OpenTabs
 * metadata import hermetic, offline, and auditable WITHOUT shipping any OpenTabs
 * runtime (Wall 1). Zero-framework: a check(cond,msg) counter + PASS=/FAIL= summary
 * + process.exit(1) on any failure (the FSB test convention; NOT Jest).
 *
 * Sampled:
 *   - vendor/opentabs-snapshot/PIN.md exists and pins the OpenTabs SHA
 *     4b17021637d2cac12b8d84d21c40e765aa7b85e9 + embeds the verbatim MIT license
 *     ("MIT", the permission grant, the "AS IS" disclaimer) + the exact copyright
 *     line "Copyright (c) 2026-present OpenTabs Contributors";
 *   - the vendor-side _provenance.json and the catalog-side provenance scaffold
 *     BOTH carry sha == the pinned SHA (they MATCH) + license "MIT" + apps == [];
 *   - docs/LEGAL.md gained the "Categorization Axes" subsection naming the three
 *     distinct axes (finance/government denial, ToS-hostility denial, sensitivity)
 *     AND at least the named ToS-hostile denied roster apps (robinhood ... onlyfans);
 *   - vendor/opentabs-snapshot/ contains NO runtime .js file (the Wall-1 no-runtime
 *     guarantee: only metadata/provenance is ever vendored).
 *
 * Run: node tests/provenance-scaffold.test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const REPO_ROOT = path.resolve(__dirname, '..');
const SHA = '4b17021637d2cac12b8d84d21c40e765aa7b85e9';

const VENDOR_DIR = path.join(REPO_ROOT, 'vendor', 'opentabs-snapshot');
const PIN_MD = path.join(VENDOR_DIR, 'PIN.md');
const VENDOR_PROV = path.join(VENDOR_DIR, '_provenance.json');
const CATALOG_PROV = path.join(REPO_ROOT, 'catalog', 'descriptors', '_fixtures', '_provenance.json');
const LEGAL_MD = path.join(REPO_ROOT, 'docs', 'LEGAL.md');

console.log('--- criterion 5: OpenTabs provenance + legal scaffold (Phase 35-04) ---');

// ---- vendor/opentabs-snapshot/PIN.md: SHA + verbatim MIT + copyright ----
// readFileSync THROWS if PIN.md is absent -> the outer catch fails loudly.
const pin = fs.readFileSync(PIN_MD, 'utf8');
check(pin.includes(SHA),
  'PIN.md pins the OpenTabs SHA ' + SHA);
check(/MIT/.test(pin),
  'PIN.md names the MIT license');
check(/Copyright \(c\) 2026-present OpenTabs Contributors/.test(pin),
  'PIN.md embeds the exact copyright line "Copyright (c) 2026-present OpenTabs Contributors"');
check(/Permission is hereby granted, free of charge/.test(pin),
  'PIN.md embeds the verbatim MIT permission grant');
check(/THE SOFTWARE IS PROVIDED "AS IS"/.test(pin),
  'PIN.md embeds the verbatim MIT "AS IS" warranty disclaimer');

// ---- the two _provenance.json scaffolds MATCH on the pinned SHA ----
const vprov = JSON.parse(fs.readFileSync(VENDOR_PROV, 'utf8'));
check(vprov.sha === SHA && vprov.license === 'MIT' && Array.isArray(vprov.apps),
  'vendor _provenance.json: { sha: pinned, license: "MIT", apps: [...] }');
check(vprov.source === 'opentabs',
  'vendor _provenance.json source === "opentabs"');
// Phase 39.5-01 (BRDTH-01) AUGMENT: the vendor-side provenance now records the 13
// hand-authored-only apps (NO upstream at the pinned SHA) as explicit no-upstream
// markers (source: 'hand-authored') so a future full import never mistakes them for
// real-source. Real opentabs apps are NOT pre-populated here -- the importer's
// fillProvenance() fills the CATALOG-side provenance
// (catalog/descriptors/_fixtures/_provenance.json) at import time (Plan 39.5-04).
const vHandOnly = vprov.apps.filter((a) => a && /hand/i.test(String(a.source || '')));
check(vHandOnly.length >= 13,
  'vendor _provenance.json records >= 13 hand-authored-only (no-upstream@SHA) app markers (the augment preserve set)');
check(vHandOnly.every((a) => a && (a.upstreamSha === SHA || a.upstream === 'none')),
  'each hand-only marker pins the no-upstream@SHA provenance (auditable)');
check(vprov.apps.every((a) => a && a.source !== 'opentabs'),
  'vendor _provenance.json does NOT pre-populate any real-source (opentabs) app (the importer fills the catalog-side provenance at Plan 39.5-04)');

const cprov = JSON.parse(fs.readFileSync(CATALOG_PROV, 'utf8'));
// Phase 36 (CGEN-01) FILLS the catalog-side scaffold's apps[] with per-app
// provenance (which emitted descriptors came from which upstream app). The top-level
// pin fields stay; apps[] is now non-empty and every entry carries the pinned SHA +
// source 'opentabs'. (The VENDOR-side _provenance.json above remains the authoritative
// pin and keeps apps: []; only this catalog scaffold is extended.)
check(cprov.sha === SHA && cprov.license === 'MIT' && Array.isArray(cprov.apps) && cprov.apps.length > 0,
  'catalog _provenance.json: { sha: pinned, license: "MIT", apps: [filled by Phase 36] }');
check(
  cprov.apps.every((a) => a && a.sha === SHA && a.source === 'opentabs' && Array.isArray(a.descriptors) && a.descriptors.length > 0),
  'catalog _provenance.json apps[]: every entry pins the SHA + source opentabs + names >=1 emitted descriptor');

check(vprov.sha === cprov.sha,
  'the vendor-side and catalog-side provenance scaffolds pin the SAME OpenTabs SHA (they match)');

// ---- docs/LEGAL.md: Categorization Axes + the three axis labels + named roster ----
const legal = fs.readFileSync(LEGAL_MD, 'utf8');
check(/Categorization Axes/.test(legal),
  'docs/LEGAL.md contains the "Categorization Axes" subsection');
check(/[Ff]inance\s*\/\s*[Gg]overnment denial/.test(legal),
  'LEGAL.md names axis 1: finance / government denial');
check(/ToS-hostility denial/.test(legal),
  'LEGAL.md names axis 2: ToS-hostility denial');
check(/Sensitivity \(Ask \/ mutating-gated\)/.test(legal),
  'LEGAL.md names axis 3: Sensitivity (Ask / mutating-gated)');
check(/robinhood/.test(legal),
  'LEGAL.md names a brokerage denied-roster app (robinhood) on the ToS-hostility axis');
check(/onlyfans/.test(legal),
  'LEGAL.md names a ToS-hostile denied-roster app (onlyfans) on the ToS-hostility axis');

// ---- Wall 1: vendor/opentabs-snapshot/ holds NO runtime .js ----
// Recursively walk the vendor dir and assert zero .js files (no OpenTabs dist/ or
// handle() runtime can slip in -- only metadata/provenance is ever vendored).
function findJs(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push.apply(out, findJs(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}
const jsFiles = findJs(VENDOR_DIR);
check(jsFiles.length === 0,
  'Wall 1: vendor/opentabs-snapshot/ contains no runtime .js (no OpenTabs dist/ or handle() shipped)'
  + (jsFiles.length ? ' -- found: ' + jsFiles.join(', ') : ''));

console.log('\nPASS=' + passed + ' FAIL=' + failed);
if (failed > 0) process.exit(1);
