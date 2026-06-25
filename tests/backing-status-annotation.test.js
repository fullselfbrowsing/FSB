'use strict';

/**
 * Phase 37 / Plan 01 (v1.0.0 Full App Catalog -- BRDTH-03) -- the backing-status
 * invocability-annotation proof.
 *
 * The breadth contract requires search_capabilities to annotate each hit by its
 * backing-status so a user/agent distinguishes a day-one-invocable app (a bundled
 * recipe or a registered handler) from a discovery-pending one (a DOM/learn-backed
 * descriptor with no recipe yet). T-37-02: a pending-only descriptor must NEVER be
 * surfaced as a confident invocable hit.
 *
 * The annotation fields were added to extension/utils/capability-search.js:
 *   - backing       -- the canonical seam enum (recipe/handler/learn/dom)
 *   - backingStatus -- the DISPLAY label (handler/recipe carry the enum; dom ->
 *                      'discovery-pending'; learn -> 'learn-pending')
 *   - invocable     -- a boolean, true IFF backing is 'handler' or 'recipe'
 *
 * Proof: plant the MiniSearch UMD constructor + a FsbRecipeIndex catalog carrying a
 * backing:'handler' descriptor (a github head slug) and a backing:'dom' descriptor
 * (an opentabs__ slug), require capability-search.js, buildOrRestore(), then assert:
 *   - the handler-backed hit -> invocable === true, backing === 'handler',
 *     backingStatus === 'handler' (a confident invocable hit).
 *   - the dom-backed hit RETURNS from search (discoverable) but -> invocable ===
 *     false, backing === 'dom', backingStatus === 'discovery-pending' (returned but
 *     NOT a confident invocable hit).
 *
 * Zero-framework FSB convention: module-level passed/failed counters, synchronous
 * check(cond,msg), process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/backing-status-annotation.test.js
 */

const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// ---- Plant the MiniSearch UMD constructor -----------------------------------
const MiniSearch = require(path.join(REPO_ROOT, 'extension', 'lib', 'minisearch.min.js'));
global.MiniSearch = MiniSearch;

// ---- Two contrasting descriptors: a handler head + a dom-backed opentabs slug
// HANDLER (a github head, day-one invocable -> a confident invocable hit).
const HANDLER_DESCRIPTOR = {
  slug: 'github.issues.list',
  service: 'github.com',
  intentSynonyms: [
    'list my github issues',
    'show issues assigned to me on github',
    'view my open github issues'
  ],
  description: 'List your assigned GitHub issues (T1a persisted-query handler, read)',
  actionVerb: 'list',
  sideEffectClass: 'read',
  backing: 'handler'
};

// DOM (an opentabs descriptor-only slug, discovery-pending -> returns but NOT a
// confident invocable hit). A DISTINCT service/op so the two never collide.
const DOM_DESCRIPTOR = {
  slug: 'linear.create_issue',
  service: 'linear.app',
  intentSynonyms: [
    'create a issue in linear',
    'add a issue in linear',
    'open a new issue in linear'
  ],
  description: 'Create a new issue in Linear (descriptor-only, DOM-fallback pending)',
  actionVerb: 'create',
  sideEffectClass: 'write',
  backing: 'dom'
};

// Plant the build-time catalog the module reads. NO recipes -> neither slug is
// recipe-backed, so each descriptor's OWN backing enum drives the annotation (a
// paired recipe would override to 'recipe' -- intentionally absent here).
global.FsbRecipeIndex = { descriptors: [HANDLER_DESCRIPTOR, DOM_DESCRIPTOR], recipes: [] };

const CapabilitySearch = require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-search.js'));
const { search, buildOrRestore } = CapabilitySearch;

(async function run() {
  console.log('--- BRDTH-03 backing-status invocability annotation ---');

  const built = await buildOrRestore();
  check(built === true, 'buildOrRestore() built the index over the planted handler+dom descriptors');

  // ---- The handler-backed hit: a CONFIDENT invocable hit --------------------
  const handlerHits = search('list my github issues', null, 5);
  const handlerHit = handlerHits.find(function (h) { return h.slug === 'github.issues.list'; });
  check(!!handlerHit, 'the handler-backed github head slug returns from search');
  check(handlerHit && handlerHit.invocable === true,
    "the handler-backed hit is a CONFIDENT invocable hit (invocable === true)");
  check(handlerHit && handlerHit.backing === 'handler',
    "the handler-backed hit carries backing === 'handler'");
  check(handlerHit && handlerHit.backingStatus === 'handler',
    "the handler-backed hit's backingStatus === 'handler' (no pending label)");

  // ---- The dom-backed hit: RETURNS but is NOT a confident invocable hit ------
  const domHits = search('create a issue in linear', null, 5);
  const domHit = domHits.find(function (h) { return h.slug === 'linear.create_issue'; });
  check(!!domHit, 'the dom-backed opentabs descriptor RETURNS from search (discoverable)');
  check(domHit && domHit.invocable === false,
    "the dom-backed hit is NOT a confident invocable hit (invocable === false) -- discovery-pending (T-37-02)");
  check(domHit && domHit.backing === 'dom',
    "the dom-backed hit carries the canonical backing enum 'dom'");
  check(domHit && domHit.backingStatus === 'discovery-pending',
    "the dom-backed hit's backingStatus DISPLAY label === 'discovery-pending'");

  // ---- The distinction is real: the two annotations differ ------------------
  check(handlerHit && domHit && handlerHit.invocable !== domHit.invocable,
    'the annotation DISTINGUISHES the two: handler invocable=true vs dom invocable=false');

  console.log('\nbacking-status-annotation: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (err) {
  console.error('  FAIL: backing-status-annotation threw:', err && err.message ? err.message : err);
  process.exit(1);
});
