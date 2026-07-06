'use strict';

/**
 * Phase 38 / Plan 01 (v1.0.0 Full App Catalog -- BRDTH-03) -- the conservative
 * DOM-only-default guarantee for the comms/social/content batch.
 *
 * The CONTEXT 4-tier routing requires every imported comms/social/AI app to be
 * DOM-only (T3): surfaced as a discovery-pending hit, NEVER a confident API-
 * invocable hit, and NEVER learn-seeded -- so a ToS-hostile or AI-chat app is
 * never auto-driven through a fabricated API call from guessed auth (the research
 * anti-pattern). This is the conservative default the user accepted.
 *
 * THE "NO MACHINERY EDIT NEEDED" DECISION (recorded here as the proof):
 * scripts/import-opentabs-catalog.mjs backingFor(_app, _service) IGNORES its args
 * and RETURNS 'dom' for EVERY data-batch app. So every comms/social/content
 * descriptor plans 02/03 emit carries backing:'dom' by the FROZEN importer default
 * -- DOM-only routing is the default, not an added marker. capability-search.js
 * then annotates a backing:'dom' hit invocable=false / backingStatus='discovery-
 * pending' (isInvocableBacking is true IFF backing is 'handler' or 'recipe'). This
 * test plants a backing:'dom' comms/social descriptor and proves that annotation,
 * so the conservative DOM-only default is guaranteed WITHOUT any importer edit.
 *
 * Proof (mirrors tests/backing-status-annotation.test.js): plant the MiniSearch
 * UMD + a FsbRecipeIndex carrying a backing:'dom' AI-chat descriptor (chatgpt.com,
 * a write-shaped slug) with NO paired recipe, require capability-search.js,
 * buildOrRestore(), search() for its synonym, and assert the hit:
 *   - RETURNS from search (discoverable), but
 *   - invocable === false       (NOT a confident invocable hit; T-37-02 / T-38-03)
 *   - backing === 'dom'         (the frozen importer default)
 *   - backingStatus === 'discovery-pending'   (the DISPLAY label; never learn-seeded)
 *
 * Zero-framework FSB convention: module-level passed/failed counters, synchronous
 * check(cond,msg), process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/dom-only-default.test.js
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

// ---- A backing:'dom' comms/social (AI-chat) descriptor ----------------------
// This is the shape the FROZEN importer stamps for every Phase-38 comms/social/
// content app: backingFor() returns 'dom' regardless of the app, so an imported
// chatgpt/claude/bluesky/mastodon/threads descriptor is backing:'dom'. A WRITE
// side-effect (send_message) -- the exact op that must NOT become a confident
// invocable hit. A DISTINCT service/op so it never collides with any other test.
const DOM_SOCIAL_DESCRIPTOR = {
  slug: 'chatgpt.send_message',
  service: 'chatgpt.com',
  intentSynonyms: [
    'send a message in chatgpt',
    'post a chatgpt message',
    'message chatgpt'
  ],
  description: 'Send a message in ChatGPT (comms/social/AI descriptor-only, DOM-fallback pending -- the frozen backing:dom default)',
  actionVerb: 'send',
  sideEffectClass: 'write',
  backing: 'dom'
};

// Plant the build-time catalog the module reads. NO recipes -> the slug is NOT
// recipe-backed, so the descriptor's OWN backing enum ('dom') drives the
// annotation. (A paired recipe would override to 'recipe'; intentionally absent
// -- a DOM-only comms/social app is never auto-paired with a fabricated recipe.)
global.FsbRecipeIndex = { descriptors: [DOM_SOCIAL_DESCRIPTOR], recipes: [] };

const CapabilitySearch = require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-search.js'));
const { search, buildOrRestore } = CapabilitySearch;

(async function run() {
  console.log('--- BRDTH-03 conservative DOM-only default (comms/social/content) ---');

  const built = await buildOrRestore();
  check(built === true, 'buildOrRestore() built the index over the planted backing:dom comms/social descriptor');

  // ---- The backing:'dom' comms/social hit: RETURNS but is NOT invocable ------
  const hits = search('send a message in chatgpt', null, 5);
  const domHit = hits.find(function (h) { return h.slug === 'chatgpt.send_message'; });
  check(!!domHit, 'the backing:dom comms/social descriptor RETURNS from search (discoverable)');
  check(domHit && domHit.invocable === false,
    'the comms/social hit is NOT a confident invocable hit (invocable === false) -- DOM-only, never auto-driven via a fabricated API call (T-38-03)');
  check(domHit && domHit.backing === 'dom',
    "the hit carries the canonical backing enum 'dom' (the FROZEN backingFor() default for every data-batch app -- no importer machinery edit)");
  check(domHit && domHit.backingStatus === 'discovery-pending',
    "the hit's backingStatus DISPLAY label === 'discovery-pending' (not learn-pending -> never learn-seeded; not invocable)");

  // ---- The guarantee restated: a write-shaped comms/social op is NOT invocable
  // by the conservative default, so it cannot become writable-under-Auto by
  // landing as a confident invocable hit (the headline T-38-01 threat). search()
  // normalizes the descriptor's sideEffectClass:'write' to the canonical 'mutate'
  // write-family value -- so assert on the mutate (write) family, NOT the raw word.
  check(domHit && domHit.sideEffectClass === 'mutate' && domHit.invocable === false,
    'a WRITE-family (mutate) comms/social op stays NON-invocable by the conservative default (cannot become writable-under-Auto via a confident invocable hit)');

  console.log('\ndom-only-default: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (err) {
  console.error('  FAIL: dom-only-default threw:', err && err.message ? err.message : err);
  process.exit(1);
});
