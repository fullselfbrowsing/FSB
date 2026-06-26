#!/usr/bin/env node
'use strict';

/**
 * Phase 39.5 / Code-review fix (39.5-REVIEW HI-02) -- the NO-ORPHAN-DESCRIPTOR gate proof.
 *
 * THE CORRECTNESS RISK THIS CLOSES: the importer writes each descriptor FLAT as
 * catalog/descriptors/opentabs__<service-stem>__<op>.json. Before the HI-02 fix it never
 * deleted stale descriptors, so a vendored-slice swap (old hand slice -> real apex slice,
 * different stem/op -> different filename) left ORPHAN descriptors on disk for ops the
 * source no longer defines. The full-source import (39.5-04) left 77 such orphans, ALL
 * gates GREEN, polluting the catalog + seed index + provenance. The importer now
 * prunes-to-match; scripts/verify-no-orphan-descriptor.mjs is the build-time backstop that
 * turns a future non-pruning import back into a BUILD FAILURE.
 *
 * This drives the REAL exports of the gate (NOT a re-implemented copy; mirrors
 * tests/no-duplicate-stem.test.js's real-export pattern):
 *   (1) the REAL committed corpus has 0 orphans (the importer prunes-to-match; also the
 *       CLI PASS path) AND no app fails extraction.
 *   (2) a SYNTHETIC on-disk set with a file the would-emit set lacks yields that file as an
 *       orphan (the gate detects -- it is real, not a no-op).
 *   (3) a SYNTHETIC on-disk set fully covered by the would-emit set yields 0 orphans (no
 *       false-positive).
 *   (4) the 13 hand-authored-only apps' descriptors are NOT flagged orphan -- the importer
 *       re-emits them (their hand-authored src/tools/*.ts is valid backing), so the augment
 *       guarantee holds and the gate never deletes a preserved hand-only descriptor.
 *
 * REQUIRES tsx (findOrphanDescriptors -> extractDescriptors imports each plugin's .ts).
 * The test chain invokes it as `node --import tsx tests/no-orphan-descriptor.test.js`.
 *
 * Zero-framework node test: a check(cond,msg) counter, PASS=/FAIL= summary,
 * process.exit(failed>0?1:0). ASCII-only, NO emojis.
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

(async () => {
  console.log('--- HI-02 no-orphan-descriptor gate (no stale descriptor for a removed source op) ---');

  const ROOT = path.resolve(__dirname, '..');
  const gateUrl = pathToFileURL(path.join(ROOT, 'scripts', 'verify-no-orphan-descriptor.mjs')).href;
  const gate = await import(gateUrl);

  check(typeof gate.findOrphanDescriptors === 'function',
    'findOrphanDescriptors is a named export of the real gate (not re-implemented here)');
  check(typeof gate.orphansOf === 'function',
    'orphansOf (the pure set-difference) is a named export');
  check(typeof gate.listOnDiskOpentabsDescriptors === 'function',
    'listOnDiskOpentabsDescriptors is a named export');

  // ---- (1) the REAL committed corpus has 0 orphans (also the CLI PASS path) ----
  const real = await gate.findOrphanDescriptors();
  check(real && Array.isArray(real.extractErrors) && real.extractErrors.length === 0,
    '(1) every enumerated app extracts cleanly -- the would-emit set is complete ['
      + (real && real.extractErrors && real.extractErrors.length ? real.extractErrors.join(' | ') : 'no extract errors') + ']');
  check(real && Array.isArray(real.orphans) && real.orphans.length === 0,
    '(1) the real committed corpus yields 0 orphans -- the importer prunes-to-match ['
      + (real && real.orphans && real.orphans.length ? real.orphans.slice(0, 20).join(', ') : 'orphan-free') + ']');
  check(real && real.onDiskCount === real.emittedCount,
    '(1) on-disk opentabs descriptor count (' + (real ? real.onDiskCount : '?') + ') == would-emit count (' + (real ? real.emittedCount : '?') + ')');

  // ---- (2) a SYNTHETIC orphan is detected (the gate is real) ----
  const emittedSet = new Set(['opentabs__alpha__create_thing.json', 'opentabs__beta__list_things.json']);
  const onDiskWithOrphan = [
    'opentabs__alpha__create_thing.json',
    'opentabs__beta__list_things.json',
    'opentabs__alpha__place_order.json', // stale: a removed source op -> no longer emitted
  ];
  const detected = gate.orphansOf(onDiskWithOrphan, emittedSet);
  check(Array.isArray(detected) && detected.length === 1 && detected[0] === 'opentabs__alpha__place_order.json',
    '(2) a synthetic on-disk file absent from the would-emit set is flagged orphan (the gate detects)');

  // ---- (3) a fully-covered on-disk set yields 0 orphans (no false-positive) ----
  const clean = gate.orphansOf(['opentabs__alpha__create_thing.json'], emittedSet);
  check(Array.isArray(clean) && clean.length === 0,
    '(3) an on-disk set fully covered by the would-emit set yields 0 orphans (no false-positive)');

  // ---- (4) the 13 hand-authored-only apps are re-emitted -> never flagged orphan ----
  // The augment guarantee: these apps have NO upstream OpenTabs source but DO have
  // hand-authored src/tools/*.ts (valid backing), so the importer re-emits them and the
  // gate must not flag any of their committed descriptors. Prove it from the real run:
  // every on-disk hand-only descriptor is in the would-emit set (i.e. NOT an orphan).
  const HAND_ONLY_STEMS = new Set([
    'amazon', 'etsy', 'eventbrite', 'grubhub', 'kayak', 'lyft', 'mastodon',
    'opentable', 'shopify', 'stubhub', 'threads', 'ticketmaster', 'ubereats', 'grafana',
  ]);
  const onDisk = gate.listOnDiskOpentabsDescriptors();
  const handOnlyOnDisk = onDisk.filter((n) => {
    const stem = n.replace(/^opentabs__/, '').split('__')[0];
    return HAND_ONLY_STEMS.has(stem);
  });
  const handOnlyOrphans = handOnlyOnDisk.filter((n) => real.orphans.includes(n));
  check(handOnlyOnDisk.length > 0,
    '(4) the hand-authored-only apps have committed descriptors on disk (' + handOnlyOnDisk.length + ')');
  check(handOnlyOrphans.length === 0,
    '(4) NONE of the 13 hand-only apps descriptors is flagged orphan -- the augment is preserved ['
      + (handOnlyOrphans.length ? handOnlyOrphans.join(', ') : 'all preserved') + ']');

  console.log('\nno-orphan-descriptor: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: no-orphan-descriptor test threw:', err && err.message ? err.message : err);
  process.exit(1);
});
