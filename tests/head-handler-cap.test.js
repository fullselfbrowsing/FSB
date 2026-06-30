#!/usr/bin/env node
'use strict';

/**
 * Phase 36 Plan 04 (CGEN-04 guard) -- HEAD_HANDLER_MODULES length <= CAP.
 *
 * Makes "breadth = descriptors-only; the head never sprawls into 2,523 imperative
 * handlers" a CI failure, not a hope (T-36-13: Elevation -> MV3 ban via cloned
 * imperative model). HEAD_HANDLER_MODULES is the authoritative, declarative manifest
 * of which T1a head-handler globals the catalog seeds (capability-catalog.js, line
 * 241-245). It is a PRIVATE `var` inside the catalog IIFE (not exported), so this
 * suite parses the array literal from the source -- which is the stronger freeze: it
 * locks the SOURCE declaration the head is built against, immune to any runtime
 * registration path.
 *
 * Phase 36 added ZERO head handlers (it was pipeline + descriptors only). Later
 * depth phases may add reviewed heads, but this gate still locks the exact current
 * globals and keeps the total under the cap.
 *
 * CAP = 30 (milestone "the head stays 15-30").
 *
 * Zero-framework FSB convention: module-level passed/failed counters, check(cond,msg),
 * process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/head-handler-cap.test.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CATALOG_MODULE_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-catalog.js');

const CAP = 30;
// The head globals expected today. Locking the identities (not just the count)
// catches a silent SWAP that keeps the count stable but changes which handlers ship.
const EXPECTED_HEAD_GLOBALS = [
  'FsbHandlerGithub',
  'FsbHandlerSlack',
  'FsbHandlerNotion',
  'FsbHandlerGitlab',
  'FsbHandlerNetlify',
  'FsbHandlerBitbucket',
  'FsbHandlerCircleci',
  'FsbHandlerVercel',
  'FsbHandlerRetool',
  'FsbHandlerAsana',
];

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

check(fs.existsSync(CATALOG_MODULE_PATH), 'extension/utils/capability-catalog.js exists');
const source = fs.existsSync(CATALOG_MODULE_PATH) ? fs.readFileSync(CATALOG_MODULE_PATH, 'utf8') : '';

// ---- Extract the HEAD_HANDLER_MODULES array literal from the source --------------
//
// Match `var HEAD_HANDLER_MODULES = [ ... ];` non-greedily up to the closing `];`.
// The manifest is a flat array of object literals -- no nested `]` inside, so the
// first `]` closes it.
const declMatch = source.match(/var\s+HEAD_HANDLER_MODULES\s*=\s*\[([\s\S]*?)\]\s*;/);
check(!!declMatch, 'HEAD_HANDLER_MODULES array literal found in capability-catalog.js');

let headEntryCount = 0;
let foundGlobals = [];
if (declMatch) {
  const body = declMatch[1];
  // Each entry is an object with a `global: '...'` field; count those identifiers.
  const globalMatches = body.match(/global\s*:\s*'([^']+)'/g) || [];
  foundGlobals = globalMatches.map((m) => m.replace(/global\s*:\s*'([^']+)'/, '$1'));
  headEntryCount = foundGlobals.length;
}

console.log(`  METRICS: HEAD_HANDLER_MODULES.length=${headEntryCount} CAP=${CAP} globals=[${foundGlobals.join(', ')}]`);

// ---- The cap assertion (the CI gate) --------------------------------------------
check(headEntryCount <= CAP,
  `HEAD_HANDLER_MODULES.length ${headEntryCount} <= CAP ${CAP} (the head stays descriptors-only; breadth never sprawls)`);

// ---- Today's exact head -- breadth adds DATA, depth adds narrow same-origin heads --
check(headEntryCount === 10,
  `HEAD_HANDLER_MODULES has exactly 10 entries (Phase 51 adds the Retool and Asana read heads; the head stays <=30); got ${headEntryCount}`);
const missingGlobals = EXPECTED_HEAD_GLOBALS.filter((g) => !foundGlobals.includes(g));
check(missingGlobals.length === 0,
  `the expected head globals are present (missing: [${missingGlobals.join(', ') || 'none'}])`);

// ---- Exit convention --------------------------------------------------------
console.log(`\nhead-handler-cap: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
