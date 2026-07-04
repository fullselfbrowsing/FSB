#!/usr/bin/env node
'use strict';

/**
 * Phase 36 / Plan 02 (CGEN-03) -- the no-dead-entry invariant harness.
 *
 * THE quality gate of Phase 36: every slug `search_capabilities` can surface MUST
 * resolve to a non-null SEAM tier, so `invoke` NEVER returns RECIPE_NOT_FOUND for a
 * searchable slug (the discoverable-but-uninvocable dead-entry risk -- T-36-05).
 *
 * The proof (Mechanic 3): the descriptors capability-search.js indexes live on the
 * build-time generated FsbRecipeIndex.descriptors global. We load the REAL emitted
 * smoke-category corpus (the SAME catalog/descriptors/opentabs__todoist__*.json set
 * package-extension.mjs inlines -- not a hand-written stand-in, so this proves the
 * LIVE invariant) plus one synthetic backing:'learn' descriptor to exercise the T2
 * leg, set globalThis.FsbRecipeIndex, require capability-catalog.js, and assert:
 *
 *   - for EVERY corpus descriptor d: resolve(d.slug, 'https://' + d.service) !== null
 *     AND the returned tier is in {T0,T1a,T1b,T2,T3} AND tier !== undefined.
 *   - a backing:'dom' (or absent) descriptor resolves to tier 'T3'
 *     (-> the router's RECIPE_DOM_FALLBACK_PENDING leg).
 *   - a backing:'learn' descriptor resolves to tier 'T2' with NO recipe
 *     (-> the router's RECIPE_LEARN_PENDING leg; we NEVER fabricate a recipe).
 *   - NEGATIVE CONTROL: a slug in NEITHER REGISTRY NOR descriptors resolves to null
 *     (the genuinely-unknown -> correct RECIPE_NOT_FOUND).
 *
 * Zero-framework FSB convention (mirrors tests/capability-router.test.js):
 * module-level passed/failed counters, synchronous check(cond,msg),
 * process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/no-dead-entry.test.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const DESCRIPTORS_DIR = path.join(REPO_ROOT, 'catalog', 'descriptors');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-catalog.js');

const SEAM_TIERS = ['T0', 'T1a', 'T1b', 'T2', 'T3'];

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

// ---- Load the REAL emitted opentabs corpus (GENERALIZED loader) ------------
// The opentabs__*.json descriptors are the EXACT flat set package-extension.mjs's
// readJsonDir inlines into recipe-index.generated.js, so the harness checks the live
// shipped invariant -- not a hand-written stub. (The _fixtures/ subdir is excluded by
// readJsonDir's non-recursion AND by the prefix filter below.)
//
// CGEN-03-at-breadth (37-01): the loader matches ALL opentabs__*.json (not just
// opentabs__todoist__) so EVERY batch's new descriptor-only slugs (todoist + linear +
// asana, and every later batch) are genuinely checked for non-null T3/T2 resolution.
// The Phase-36-only `opentabs__todoist__` filter was a false-green for every new app:
// it never checked linear/asana. This generalization is what makes 02/03/04's per-wave
// no-dead-entry assertion real.
const opentabsFiles = fs.readdirSync(DESCRIPTORS_DIR)
  .filter(function (name) { return name.indexOf('opentabs__') === 0 && name.endsWith('.json'); })
  .sort();

const corpus = opentabsFiles.map(function (name) {
  return JSON.parse(fs.readFileSync(path.join(DESCRIPTORS_DIR, name), 'utf8'));
});

check(corpus.length > 0,
  'corpus loaded the REAL emitted opentabs descriptors (got ' + corpus.length + ' opentabs__*.json -- all batches, not just todoist)');
check(corpus.every(function (d) { return d && typeof d.slug === 'string' && typeof d.service === 'string'; }),
  'every loaded descriptor carries a string slug + service');
// Widened backing assertion: the grown corpus may carry non-dom backings as later
// batches add head/seed-backed descriptors. The invariant under test is NON-NULL seam
// resolution, not a single backing value -> tolerate dom/handler/learn/absent.
check(corpus.every(function (d) {
    return d.backing === 'dom' || d.backing === 'handler' || d.backing === 'learn' || d.backing === undefined;
  }),
  "every emitted opentabs descriptor's backing is in {'dom','handler','learn',absent} (the Phase-37 dev/productivity batch is all 'dom' -> the T3 leg)");

// One SYNTHETIC backing:'learn' descriptor to exercise the T2 (learn-pending) leg.
// (No real 'learn' descriptor ships this phase; the T2 path is proven by this fixture
// so the invariant covers BOTH seam legs.)
const SYNTHETIC_LEARN = {
  slug: 'todoist.__synthetic_learn__',
  service: 'app.todoist.com',
  backing: 'learn',
  description: 'synthetic backing:learn descriptor (T2 leg fixture; not shipped)',
  sideEffectClass: 'read'
};

// ---- Install the generated-global the catalog reads, then require it -------
globalThis.FsbRecipeIndex = { recipes: [], descriptors: corpus.concat([SYNTHETIC_LEARN]) };

let CATALOG = null;
let catalogLoadError = null;
try {
  CATALOG = require(CATALOG_PATH);
} catch (err) {
  catalogLoadError = err;
}

if (!CATALOG || typeof CATALOG.resolve !== 'function') {
  check(false, 'CGEN-03: capability-catalog.js failed to load / export resolve() ('
    + (catalogLoadError && catalogLoadError.message ? catalogLoadError.message : 'no export') + ')');
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
}

// ===========================================================================
// THE invariant: every searchable slug -> a non-null seam tier.
// ===========================================================================
let everyNonNull = true;
let everySeamTier = true;
for (let i = 0; i < corpus.length; i++) {
  const d = corpus[i];
  const r = CATALOG.resolve(d.slug, 'https://' + d.service);
  if (r === null || r === undefined) { everyNonNull = false; }
  if (!(r && typeof r.tier === 'string' && SEAM_TIERS.indexOf(r.tier) !== -1)) { everySeamTier = false; }
}
check(everyNonNull,
  'NO DEAD ENTRY: every emitted smoke slug resolves to a NON-NULL result (none returns null -> none re-introduces RECIPE_NOT_FOUND)');
check(everySeamTier,
  'every emitted smoke slug resolves to a real SEAM tier in {T0,T1a,T1b,T2,T3} (a router-dispatchable tier, tier !== undefined)');

// The backing:'dom' leg -> T3 (RECIPE_DOM_FALLBACK_PENDING). Use a concrete slug.
const domR = CATALOG.resolve('todoist.create_task', 'https://app.todoist.com');
check(domR && domR.tier === 'T3' && !domR.recipe,
  "a backing:'dom' descriptor-only slug (todoist.create_task) -> {tier:'T3'} with NO recipe (the DOM-fallback seam)");
check(domR && domR.descriptor && domR.descriptor.slug === 'todoist.create_task',
  'the T3 result carries the matched descriptor (descriptor.slug === the looked-up slug)');

// The backing:'learn' leg -> T2 (RECIPE_LEARN_PENDING), NO recipe (never fabricated).
const learnR = CATALOG.resolve(SYNTHETIC_LEARN.slug, 'https://' + SYNTHETIC_LEARN.service);
check(learnR && learnR.tier === 'T2' && !learnR.recipe,
  "a backing:'learn' descriptor-only slug -> {tier:'T2'} with NO recipe (the learn-pending seam; we never fabricate a recipe)");

// ---- NEGATIVE CONTROL: a genuinely-unknown slug -> null --------------------
// (not in REGISTRY, not in descriptors) -> the router's CORRECT RECIPE_NOT_FOUND.
const unknown = CATALOG.resolve('nonexistent.slug', 'https://x.com');
check(unknown === null,
  'NEGATIVE CONTROL: an out-of-corpus slug (nonexistent.slug) -> null (the genuinely-unknown -> correct RECIPE_NOT_FOUND, NOT masked as a seam tier)');

// ===========================================================================
// HEAL-03 / D-11: a SESSION-quarantined REGISTRY slug resolves to the T3 seam
// (the promised DOM fallback), NOT null (which the router maps to the
// RECIPE_NOT_FOUND default -- the bug this guards against).
// ===========================================================================
const Q_SLUG = 'todoist.__synthetic_head__';
CATALOG.registerHandler(Q_SLUG, {
  tier: 'T1a',
  handler: { handle: function () { return { success: true }; } },
  origin: 'https://app.todoist.com'
});
const preQuarantine = CATALOG.resolve(Q_SLUG, 'https://app.todoist.com');
check(preQuarantine && preQuarantine.tier === 'T1a',
  'quarantine fixture: a registered bundled head slug resolves T1a before quarantine');

CATALOG.quarantineBundled(Q_SLUG);
const quarantined = CATALOG.resolve(Q_SLUG, 'https://app.todoist.com');
check(quarantined !== null && quarantined !== undefined,
  'a session-quarantined REGISTRY slug resolves NON-NULL (never falls into the router RECIPE_NOT_FOUND default)');
check(quarantined && quarantined.tier === 'T3' && !quarantined.recipe && !quarantined.handler,
  "a session-quarantined REGISTRY slug resolves {tier:'T3'} with NO recipe/handler (the DOM-fallback seam, D-11)");

CATALOG.clearBundledQuarantine(Q_SLUG);
const healed = CATALOG.resolve(Q_SLUG, 'https://app.todoist.com');
check(healed && healed.tier === 'T1a',
  'clearing the session quarantine restores the original bundled tier (heal loop closes)');

// ===========================================================================
// HEAL-03 / D-11 (index-sourced no-REGISTRY path): a SESSION-quarantined bundled
// slug that resolves via the generated-index fallback must ALSO demote to the T3
// seam. The entry-truthy skip never runs on this !entry path, so a missing guard
// would keep re-attaching the rotted T1b recipe (re-fired on every invoke).
// ===========================================================================
const IDX_SLUG = '__synthetic_index_head__.get_thing';
globalThis.FsbRecipeIndex.recipes.push({
  id: IDX_SLUG,
  origin: 'https://example.com',
  endpoint: '/api/thing',
  method: 'GET',
  authStrategy: 'cookie'
});
const preIdxQ = CATALOG.resolve(IDX_SLUG, 'https://example.com');
check(preIdxQ && preIdxQ.tier === 'T1b' && !!preIdxQ.recipe,
  'index-sourced (no-REGISTRY) bundled slug resolves T1b WITH a recipe before quarantine');

CATALOG.quarantineBundled(IDX_SLUG);
const idxQuarantined = CATALOG.resolve(IDX_SLUG, 'https://example.com');
check(idxQuarantined && idxQuarantined.tier === 'T3' && !idxQuarantined.recipe,
  "a session-quarantined index-sourced slug resolves {tier:'T3'} with NO recipe (DOM-fallback seam, D-11) -- not the rotted T1b re-attach");

CATALOG.clearBundledQuarantine(IDX_SLUG);
const idxHealed = CATALOG.resolve(IDX_SLUG, 'https://example.com');
check(idxHealed && idxHealed.tier === 'T1b' && !!idxHealed.recipe,
  'clearing the quarantine restores the index-sourced T1b recipe (heal loop closes on the no-entry path)');

console.log('  passed:', passed);
console.log('  failed:', failed);
process.exit(failed > 0 ? 1 : 0);
