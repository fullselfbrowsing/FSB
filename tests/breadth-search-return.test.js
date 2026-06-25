'use strict';

/**
 * Phase 37 / Plan 01 (v1.0.0 Full App Catalog -- BRDTH-01) -- the GENUINE MED-03
 * collision proof over the REAL emitted descriptor corpus.
 *
 * The breadth contract claim is: EVERY imported op returns from search_capabilities
 * with rich intent synonyms (>=3), a side-effect class, AND a backing-status enum,
 * and the cross-app create_* near-neighbors (linear/asana/todoist) disambiguate by
 * app/origin with wrong-invoke=0. The eval (tests/capability-search-eval.test.js)
 * proves recall/wrong-invoke over a SEED fixture set; THIS test proves it over the
 * REAL emitted opentabs__linear__, opentabs__asana__, and opentabs__todoist__ JSON
 * descriptors -- the load-bearing collision proof (the eval-side intent-cases are a
 * redundant secondary signal; this is the one that fails if the importer's MED-03
 * synonym rewrite regresses or a serviceStem override swaps an app's slug).
 *
 * Harness pattern (mirrors tests/capability-search-eval.test.js): plant the
 * MiniSearch UMD constructor + a FsbRecipeIndex catalog global from the REAL emitted
 * corpus, require capability-search.js (single source of truth for INDEX_OPTIONS +
 * search), await buildOrRestore() so the module's internal index is built from the
 * planted catalog, then exercise the module's search().
 *
 * Asserts:
 *   - EVERY emitted op returns from search (via its own first synonym) carrying
 *     >=3 intentSynonyms (on the descriptor), a non-empty sideEffectClass, AND a
 *     backing field on the search hit.
 *   - recall@5 >= 0.9 over the per-op "first synonym -> own slug" set.
 *   - wrong-invoke == 0 over the cross-app create_* near-neighbor set: "create an
 *     issue in linear" tops linear.create_issue; "create a task in asana" tops
 *     asana.create_task; "create a task in todoist" tops todoist.create_task --
 *     none cross-invokes the other app's create_*.
 *   - prints a "recall@5=... wrong-invoke=..." METRICS line.
 *
 * Zero-framework FSB convention: module-level passed/failed counters, synchronous
 * check(cond,msg), process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/breadth-search-return.test.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const DESCRIPTORS_DIR = path.join(REPO_ROOT, 'catalog', 'descriptors');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// ---- Plant the MiniSearch UMD constructor (the module's _getMiniSearch finds it) ---
const MiniSearch = require(path.join(REPO_ROOT, 'extension', 'lib', 'minisearch.min.js'));
global.MiniSearch = MiniSearch;

// ---- Load the REAL emitted dev/productivity collision corpus ----------------
// linear (GraphQL/camelCase -- the MED-03 collision app) + asana (create_task --
// the cross-app near-neighbor) + todoist (the Phase-36 smoke slice) + the Phase-37
// sub-batch-2 apps clickup/jira/confluence/airtable. These are the EXACT flat
// descriptors package-extension.mjs inlines; this test indexes the live shipped data,
// not a hand-written stand-in. The jira/confluence pair (both *.atlassian.net) is the
// STEM_OVERRIDES distinctness proof: each must top its OWN slug, never the sibling's.
const corpusFiles = fs.readdirSync(DESCRIPTORS_DIR)
  .filter(function (name) {
    return /^opentabs__(linear|asana|todoist|clickup|jira|confluence|airtable)__/.test(name) && name.endsWith('.json');
  })
  .sort();

const corpus = corpusFiles.map(function (name) {
  return JSON.parse(fs.readFileSync(path.join(DESCRIPTORS_DIR, name), 'utf8'));
});

check(corpus.length >= 34,
  'loaded the REAL emitted dev/productivity corpus (got ' + corpus.length + ' descriptors: 5 linear + 4 asana + 7 todoist + 4 clickup + 5 jira + 4 confluence + 5 airtable)');

// Plant the build-time catalog global the module's buildOrRestore() reads.
global.FsbRecipeIndex = { descriptors: corpus, recipes: [] };

// Single source of truth: the runtime module's INDEX_OPTIONS + search.
const CapabilitySearch = require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-search.js'));
const { search, buildOrRestore } = CapabilitySearch;

// ---- The cross-app create_* near-neighbor collision set (the MED-03 proof) ---
// Each query MUST top its OWN app's create_* slug -- never cross-invoke another
// app's create_*. A swapped serviceStem override or a synonym that drops the app
// token would make one of these cross-invoke (wrong-invoke > 0) -> the build fails.
const COLLISION_SET = [
  { query: 'create an issue in linear', expected: 'linear.create_issue' },
  { query: 'create a task in asana', expected: 'asana.create_task' },
  { query: 'create a task in todoist', expected: 'todoist.create_task' },
  // Phase-37 sub-batch-2 cross-app create_* near-neighbors (clickup vs the other
  // task apps; airtable.create_record vs the create_task family).
  { query: 'create a task in clickup', expected: 'clickup.create_task' },
  { query: 'create a record in airtable', expected: 'airtable.create_record' },
  // The STEM_OVERRIDES distinctness proof: jira AND confluence both host on
  // *.atlassian.net. Without the per-dir-name stem override they would collapse to
  // one indistinguishable service; each MUST top its OWN slug here (T-37-08).
  { query: 'create an issue in jira', expected: 'jira.create_issue' },
  { query: 'create a page in confluence', expected: 'confluence.create_page' },
];

(async function run() {
  console.log('--- BRDTH-01 breadth search-return over the REAL emitted corpus (MED-03 collision proof) ---');

  // Build the module's internal index from the planted catalog.
  const built = await buildOrRestore();
  check(built === true, 'buildOrRestore() built the index over the planted real corpus');

  // ---- Per-op: every emitted op returns from search with synonyms + class + backing
  let everyOpReturns = true;
  let everyOpHasSynonyms = true;
  let everyHitHasClass = true;
  let everyHitHasBacking = true;
  let recallHits = 0;

  for (const d of corpus) {
    // The descriptor itself must carry >=3 intent synonyms (the breadth contract).
    if (!(Array.isArray(d.intentSynonyms) && d.intentSynonyms.length >= 3)) {
      everyOpHasSynonyms = false;
      console.error('    - ' + d.slug + ' has < 3 intentSynonyms (' + (d.intentSynonyms ? d.intentSynonyms.length : 0) + ')');
    }
    // Query by the op's own first synonym; the op MUST return within the top 5.
    const probe = (d.intentSynonyms && d.intentSynonyms[0]) || d.description || d.slug;
    const hits = search(probe, null, 5);
    const ownHit = hits.find(function (h) { return h.slug === d.slug; });
    if (ownHit) {
      recallHits++;
    } else {
      everyOpReturns = false;
      console.error('    - ' + d.slug + ' did NOT return in top5 for "' + probe + '" (got [' + hits.map(function (h) { return h.slug; }).join(', ') + '])');
    }
    // The returned hit carries a non-empty side-effect class + a backing enum.
    if (!(ownHit && typeof ownHit.sideEffectClass === 'string' && ownHit.sideEffectClass.length > 0)) {
      everyHitHasClass = false;
    }
    if (!(ownHit && typeof ownHit.backing === 'string' && ownHit.backing.length > 0)) {
      everyHitHasBacking = false;
    }
  }

  check(everyOpHasSynonyms, 'EVERY emitted descriptor carries >=3 intentSynonyms');
  check(everyOpReturns, 'EVERY emitted op returns from search() within the top 5 (via its own first synonym)');
  check(everyHitHasClass, 'EVERY returned hit carries a non-empty sideEffectClass');
  check(everyHitHasBacking, 'EVERY returned hit carries a backing field (BRDTH-03 surfaced in the hit)');

  const recall = recallHits / corpus.length;

  // ---- The cross-app create_* collision proof: wrong-invoke == 0 --------------
  let wrongInvoke = 0;
  for (const c of COLLISION_SET) {
    const hits = search(c.query, null, 5);
    const top1 = hits[0] ? hits[0].slug : 'none';
    const topOk = top1 === c.expected;
    check(topOk,
      'collision: "' + c.query + '" tops ' + c.expected + ' (got ' + top1 + ')');
    if (!topOk) { wrongInvoke++; }
  }
  const wrongRate = wrongInvoke / COLLISION_SET.length;

  // ---- jira != confluence STEM_OVERRIDES distinctness proof (T-37-08) ----------
  // jira and confluence both derive from the shared *.atlassian.net host. The
  // importer canonicalizes each app's slug stem from its vendored DIR NAME via
  // STEM_OVERRIDES, so they MUST emit two distinct slug families and a jira-intent
  // must NEVER top a confluence slug (or vice versa) -- otherwise an intent for one
  // would route to the other's authenticated op on the same host.
  const jiraSlugs = corpus.map(function (d) { return d.slug; }).filter(function (s) { return s.indexOf('jira.') === 0; });
  const confluenceSlugs = corpus.map(function (d) { return d.slug; }).filter(function (s) { return s.indexOf('confluence.') === 0; });
  check(jiraSlugs.length >= 5 && confluenceSlugs.length >= 4,
    'jira and confluence emit DISTINCT slug families despite the shared *.atlassian.net host (jira: ' + jiraSlugs.length + ', confluence: ' + confluenceSlugs.length + ')');
  const jiraCreateTop = (search('create an issue in jira', null, 5)[0] || {}).slug || 'none';
  const confluenceCreateTop = (search('create a page in confluence', null, 5)[0] || {}).slug || 'none';
  check(jiraCreateTop.indexOf('jira.') === 0 && confluenceCreateTop.indexOf('confluence.') === 0,
    'jira-intent tops a jira.* slug (' + jiraCreateTop + ') and confluence-intent tops a confluence.* slug (' + confluenceCreateTop + ') -- never cross-invoke on the shared host (STEM_OVERRIDES)');

  // The METRICS line (mirrors the eval's grep-able format).
  console.log('  METRICS: recall@5=' + recall.toFixed(3) + ' wrong-invoke=' + wrongRate.toFixed(3)
    + ' over ' + corpus.length + ' ops / ' + COLLISION_SET.length + ' collision probes');

  check(recall >= 0.9, 'recall@5 ' + recall.toFixed(3) + ' >= 0.9 over the real emitted corpus');
  check(wrongRate === 0, 'wrong-invoke ' + wrongRate.toFixed(3) + ' === 0 on the cross-app create_* collision set (MED-03, non-negotiable)');

  console.log('\nbreadth-search-return: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (err) {
  console.error('  FAIL: breadth-search-return threw:', err && err.message ? err.message : err);
  process.exit(1);
});
