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
 * Asserts (MED-01/MED-02 hardening, 37-REVIEW -- the metrics are GENUINE retrieval,
 * not exact-match tautologies):
 *   - STRUCTURAL / index-integrity smoke (NOT a retrieval measurement): EVERY emitted
 *     op is INDEXED (returns for its OWN first synonym, which the index stores
 *     verbatim) carrying >=3 intentSynonyms, a non-empty sideEffectClass, AND a
 *     backing field. This is clearly labeled as an indexability smoke -- it cannot
 *     fail short of a MiniSearch indexing bug.
 *   - GENUINE RETRIEVAL recall@5 >= 0.9 (MED-02): probed by a HELD-OUT paraphrase
 *     derived from each op's human description (a phrasing the boosted intentSynonyms
 *     field never stored verbatim), so a recall miss is observable. A guard asserts
 *     no held-out probe is a verbatim synonym.
 *   - wrong-invoke == 0 over the cross-app collision set, where EVERY query is a
 *     HELD-OUT PARAPHRASE (MED-01): "log a bug in linear" tops linear.create_issue;
 *     "add a new task to my asana list" tops asana.create_task; "create a new ticket
 *     in jira" tops jira.create_issue -- none cross-invokes a near-neighbor's op. A
 *     guard asserts no collision query is a verbatim member of its target's synonyms,
 *     so the proof cannot silently degrade into an exact-match check.
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
// sub-batch-2 apps clickup/jira/confluence/airtable + the sub-batch-3 code-hosting +
// deploy apps gitlab/bitbucket/vercel/netlify. These are the EXACT flat descriptors
// package-extension.mjs inlines; this test indexes the live shipped data, not a
// hand-written stand-in. The jira/confluence pair (both *.atlassian.net) is the
// STEM_OVERRIDES distinctness proof: each must top its OWN slug, never the sibling's.
// Sub-batch 4 (37-04) completes the category: cloudflare/circleci/datadog/sentry/
// posthog (cloud + observability + CI/analytics). cloudflare/datadog emit canonical
// stems via STEM_OVERRIDES (dash/datadoghq would be wrong); the whole dev/productivity
// batch is now present and this test indexes ALL of it.
const corpusFiles = fs.readdirSync(DESCRIPTORS_DIR)
  .filter(function (name) {
    return /^opentabs__(linear|asana|todoist|clickup|jira|confluence|airtable|gitlab|bitbucket|vercel|netlify|cloudflare|circleci|datadog|sentry|posthog)__/.test(name) && name.endsWith('.json');
  })
  .sort();

const corpus = corpusFiles.map(function (name) {
  return JSON.parse(fs.readFileSync(path.join(DESCRIPTORS_DIR, name), 'utf8'));
});

check(corpus.length >= 70,
  'loaded the REAL emitted dev/productivity corpus (got ' + corpus.length + ' descriptors: 5 linear + 4 asana + 7 todoist + 4 clickup + 5 jira + 4 confluence + 5 airtable + 4 gitlab + 4 bitbucket + 4 vercel + 4 netlify + 4 cloudflare + 4 circleci + 4 datadog + 4 sentry + 4 posthog -- the COMPLETE category)');

// Plant the build-time catalog global the module's buildOrRestore() reads.
global.FsbRecipeIndex = { descriptors: corpus, recipes: [] };

// Single source of truth: the runtime module's INDEX_OPTIONS + search.
const CapabilitySearch = require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-search.js'));
const { search, buildOrRestore } = CapabilitySearch;

// ---- The cross-app near-neighbor collision set (the MED-03 proof) ------------
// MED-01 (37-REVIEW): every query is a HELD-OUT PARAPHRASE -- a natural user
// phrasing that is NOT a verbatim copy of the target descriptor's indexed
// intentSynonyms. The earlier set used queries byte-identical to an indexed synonym
// (e.g. "create a task in asana"), which MiniSearch tops almost by construction
// (exact match of a boosted synonym carrying the app token) -- a far weaker claim
// than disambiguating a paraphrase. With paraphrases the wrong-invoke=0 result is a
// GENUINE retrieval measurement: each query MUST top its OWN app's slug purely from
// the index's fuzzy/prefix match over the synonyms+description, never cross-invoking
// a near-neighbor. The NO-VERBATIM-MEMBER assertion below (over this set) guarantees
// the proof cannot silently degrade back into an exact-match check as synonyms
// evolve. The load-bearing create_issue cluster (linear/jira/gitlab) is retained.
const COLLISION_SET = [
  // The load-bearing create_issue cluster (linear/jira/gitlab) + the create_* family,
  // probed by held-out paraphrases ("log a bug", "create a new ticket", "file a new
  // issue" -- none is an indexed synonym; "ticket"/"bug"/"row" are held-out nouns).
  { query: 'log a bug in linear', expected: 'linear.create_issue' },
  { query: 'add a new task to my asana list', expected: 'asana.create_task' },
  { query: 'start a new task in todoist', expected: 'todoist.create_task' },
  // Phase-37 sub-batch-2 cross-app create_* near-neighbors (clickup vs the other
  // task apps; airtable.create_record vs the create_task family).
  { query: 'file a new task in clickup', expected: 'clickup.create_task' },
  { query: 'insert a row into airtable', expected: 'airtable.create_record' },
  // The STEM_OVERRIDES distinctness proof: jira AND confluence both host on
  // *.atlassian.net. Without the per-dir-name stem override they would collapse to
  // one indistinguishable service; each MUST top its OWN slug here (T-37-08). "ticket"
  // is a held-out paraphrase of jira's indexed "issue".
  { query: 'create a new ticket in jira', expected: 'jira.create_issue' },
  { query: 'start a new page in confluence', expected: 'confluence.create_page' },
  // Phase-37 sub-batch-3 (code-hosting + deploy) cross-app create_* near-neighbors.
  // gitlab.create_issue is a direct near-neighbor of linear.create_issue AND
  // jira.create_issue (all tracker "issues"); the app token MUST disambiguate.
  { query: 'file a new issue on gitlab', expected: 'gitlab.create_issue' },
  // merge-request (gitlab) vs pull-request (bitbucket): the two code-review write ops
  // -- distinct nouns + distinct stems must each top their OWN slug, never cross.
  { query: 'raise a merge request on gitlab', expected: 'gitlab.create_merge_request' },
  { query: 'raise a new pull request on bitbucket', expected: 'bitbucket.create_pull_request' },
  // deployment (vercel) vs deploy (netlify): the two deploy-trigger write ops -- the
  // closest cross-app near-neighbor pair in this sub-batch; each must top its own slug.
  { query: 'kick off a new deployment on vercel', expected: 'vercel.create_deployment' },
  { query: 'ship a new deploy on netlify', expected: 'netlify.create_deploy' },
  // Phase-37 sub-batch-4 (cloud + observability + CI/analytics) cross-app near-neighbors.
  // list_dashboards is emitted by BOTH datadog AND posthog (identical op name, different
  // app) -- the closest same-op collision in this sub-batch; the app token MUST keep
  // each on its OWN slug (a swapped/colliding stem would cross-invoke).
  { query: 'show me the dashboards on datadog', expected: 'datadog.list_dashboards' },
  { query: 'pull up the dashboards on posthog', expected: 'posthog.list_dashboards' },
  // query_* near-neighbors: datadog.query_metrics vs posthog.query_events.
  { query: 'fetch metric timeseries from datadog', expected: 'datadog.query_metrics' },
  { query: 'pull captured events from posthog', expected: 'posthog.query_events' },
  // sentry.list_issues / get_issue are error-tracking "issues" -- direct near-neighbors
  // of the gitlab/linear/jira tracker "issues"; the app token must disambiguate.
  { query: 'show me the open issues on sentry', expected: 'sentry.list_issues' },
  // The sub-batch-4 write/destructive ops must top their OWN slug (T-37-06 routing).
  { query: 'kick off a pipeline on circleci', expected: 'circleci.trigger_pipeline' },
  { query: 'mark a sentry issue resolved', expected: 'sentry.resolve_issue' },
  // cloudflare.purge_cache: the sub-batch-4 DESTRUCTIVE op -- its own canonical
  // (STEM_OVERRIDES) slug, never opentabs__dash__purge_cache.
  { query: 'clear the cloudflare cache', expected: 'cloudflare.purge_cache' },
];

// Build a slug -> lowercased-intentSynonyms map for the held-out guards (MED-01/MED-02).
const SYNS_BY_SLUG = {};
for (const d of corpus) {
  SYNS_BY_SLUG[d.slug] = (d.intentSynonyms || []).map(function (s) { return String(s).toLowerCase().trim(); });
}

// MED-02 held-out recall probe: a paraphrase derived from the descriptor's HUMAN
// description (the first clause), app-tagged with the service stem. The description
// text is indexed only in the weak `description` field (boost 1), NOT in the boosted
// `intentSynonyms` (boost 3), so this is a GENUINE retrieval probe -- a user phrasing
// the index never saw as a verbatim synonym. If a description clause happens to
// coincide with an indexed synonym, we append an account-scoped tail so the probe is
// still a distinct (held-out) phrasing that faithfully expresses the same intent.
function heldOutParaphrase(d) {
  var stem = String(d.slug || '').split('.')[0];
  var clause = String(d.description || '').split(/[.\n;:]/)[0].toLowerCase().trim();
  if (!clause) { return ''; }
  var syns = SYNS_BY_SLUG[d.slug] || [];
  var probe = (clause.indexOf(stem) !== -1) ? clause : (clause + ' in ' + stem);
  if (syns.indexOf(probe) !== -1) {
    probe = clause + ' for my ' + stem + ' account';
  }
  return probe;
}

(async function run() {
  console.log('--- BRDTH-01 breadth search-return over the REAL emitted corpus (MED-03 collision proof) ---');

  // Build the module's internal index from the planted catalog.
  const built = await buildOrRestore();
  check(built === true, 'buildOrRestore() built the index over the planted real corpus');

  // ---- Per-op assertions, split into two CLEARLY-LABELED checks ---------------
  // (1) STRUCTURAL / index-integrity smoke (NOT a retrieval measurement): every op is
  //     indexed + carries >=3 synonyms, a class, and a backing -- probed by its OWN
  //     first synonym, which the index stores verbatim (so this confirms indexability,
  //     not retrieval quality -- it cannot fail short of a MiniSearch indexing bug).
  // (2) GENUINE RETRIEVAL recall@5 (MED-02): probed by a HELD-OUT paraphrase derived
  //     from the description (see heldOutParaphrase) -- a phrasing NOT copied from the
  //     boosted synonyms, so a recall miss is observable. THIS is the breadth-recall
  //     measurement; (1) is only the "every op is indexed" smoke.
  let everyOpIndexed = true;       // (1) structural
  let everyOpHasSynonyms = true;   // (1) structural
  let everyHitHasClass = true;     // (1) structural
  let everyHitHasBacking = true;   // (1) structural
  let heldOutRecallHits = 0;       // (2) genuine retrieval
  let noVerbatimProbe = true;      // (2) the held-out guard: no probe is a synonym
  const heldOutMisses = [];

  for (const d of corpus) {
    // (1) The descriptor itself must carry >=3 intent synonyms (the breadth contract).
    if (!(Array.isArray(d.intentSynonyms) && d.intentSynonyms.length >= 3)) {
      everyOpHasSynonyms = false;
      console.error('    - ' + d.slug + ' has < 3 intentSynonyms (' + (d.intentSynonyms ? d.intentSynonyms.length : 0) + ')');
    }
    // (1) Structural smoke: query by the op's OWN first synonym (indexed verbatim) ->
    //     it must return + the hit must carry a class + a backing enum.
    const smokeProbe = (d.intentSynonyms && d.intentSynonyms[0]) || d.description || d.slug;
    const smokeHits = search(smokeProbe, null, 5);
    const smokeHit = smokeHits.find(function (h) { return h.slug === d.slug; });
    if (!smokeHit) {
      everyOpIndexed = false;
      console.error('    - ' + d.slug + ' NOT indexed: absent from top5 for its own first synonym "' + smokeProbe + '"');
    }
    if (!(smokeHit && typeof smokeHit.sideEffectClass === 'string' && smokeHit.sideEffectClass.length > 0)) {
      everyHitHasClass = false;
    }
    if (!(smokeHit && typeof smokeHit.backing === 'string' && smokeHit.backing.length > 0)) {
      everyHitHasBacking = false;
    }

    // (2) GENUINE retrieval: query by a HELD-OUT description-derived paraphrase. The
    //     probe must NOT be a verbatim synonym (else it degrades to an exact match),
    //     and the op MUST still return within the top 5 from the fuzzy/prefix match.
    const paraphrase = heldOutParaphrase(d);
    if ((SYNS_BY_SLUG[d.slug] || []).indexOf(paraphrase) !== -1) {
      noVerbatimProbe = false;
      console.error('    - ' + d.slug + ' held-out recall probe "' + paraphrase + '" IS a verbatim synonym (would be an exact-match tautology)');
    }
    const paraHits = search(paraphrase, null, 5);
    if (paraHits.find(function (h) { return h.slug === d.slug; })) {
      heldOutRecallHits++;
    } else {
      heldOutMisses.push(d.slug + ' <- "' + paraphrase + '" got [' + paraHits.map(function (h) { return h.slug; }).join(', ') + ']');
    }
  }

  // (1) STRUCTURAL / index-integrity smoke assertions (NOT a retrieval measurement).
  check(everyOpHasSynonyms, 'STRUCTURAL: EVERY emitted descriptor carries >=3 intentSynonyms');
  check(everyOpIndexed, 'STRUCTURAL: EVERY emitted op is INDEXED (returns for its own first synonym -- an index-integrity smoke, not a retrieval measurement)');
  check(everyHitHasClass, 'STRUCTURAL: EVERY returned hit carries a non-empty sideEffectClass');
  check(everyHitHasBacking, 'STRUCTURAL: EVERY returned hit carries a backing field (BRDTH-03 surfaced in the hit)');

  // (2) GENUINE RETRIEVAL recall@5 over the held-out paraphrase set (MED-02).
  if (heldOutMisses.length) {
    console.error('  held-out recall misses:');
    heldOutMisses.forEach(function (m) { console.error('    - ' + m); });
  }
  check(noVerbatimProbe,
    'RETRIEVAL: no held-out recall probe is a verbatim member of its op\'s intentSynonyms (the measurement is genuine retrieval, not exact match)');
  const recall = heldOutRecallHits / corpus.length;

  // ---- The cross-app collision proof: wrong-invoke == 0 over PARAPHRASES -------
  // MED-01: each collision query is a held-out paraphrase. First assert NO collision
  // query is a verbatim member of its target's intentSynonyms -- this is what keeps
  // the wrong-invoke=0 result a GENUINE retrieval measurement (it cannot silently
  // degrade into an exact-match check as the synonyms evolve). Then assert each
  // paraphrase tops its OWN slug (never cross-invokes a near-neighbor's op).
  let collisionVerbatim = 0;
  for (const c of COLLISION_SET) {
    const isVerbatim = (SYNS_BY_SLUG[c.expected] || []).indexOf(String(c.query).toLowerCase().trim()) !== -1;
    if (isVerbatim) { collisionVerbatim++; }
  }
  check(collisionVerbatim === 0,
    'MED-01: NO collision query is a verbatim member of its target\'s intentSynonyms (' + collisionVerbatim + ' verbatim) -- every probe is a held-out paraphrase, so wrong-invoke=0 is a genuine retrieval measurement, not an exact-match tautology');

  let wrongInvoke = 0;
  for (const c of COLLISION_SET) {
    const hits = search(c.query, null, 5);
    const top1 = hits[0] ? hits[0].slug : 'none';
    const topOk = top1 === c.expected;
    check(topOk,
      'collision (paraphrase): "' + c.query + '" tops ' + c.expected + ' (got ' + top1 + ')');
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
  // Held-out paraphrases (MED-01): "create a new ticket"/"start a new page" are NOT
  // verbatim synonyms, so this distinctness proof is also a genuine retrieval check.
  const jiraCreateTop = (search('create a new ticket in jira', null, 5)[0] || {}).slug || 'none';
  const confluenceCreateTop = (search('start a new page in confluence', null, 5)[0] || {}).slug || 'none';
  check(jiraCreateTop.indexOf('jira.') === 0 && confluenceCreateTop.indexOf('confluence.') === 0,
    'jira-intent tops a jira.* slug (' + jiraCreateTop + ') and confluence-intent tops a confluence.* slug (' + confluenceCreateTop + ') -- never cross-invoke on the shared host (STEM_OVERRIDES)');

  // The METRICS line (mirrors the eval's grep-able format). recall@5 is now measured
  // over HELD-OUT description-derived paraphrases (MED-02), and wrong-invoke over the
  // HELD-OUT collision paraphrases (MED-01) -- both genuine retrieval measurements.
  console.log('  METRICS: recall@5=' + recall.toFixed(3) + ' wrong-invoke=' + wrongRate.toFixed(3)
    + ' over ' + corpus.length + ' ops (held-out paraphrases) / ' + COLLISION_SET.length + ' collision paraphrase probes');

  check(recall >= 0.9, 'RETRIEVAL: recall@5 ' + recall.toFixed(3) + ' >= 0.9 over HELD-OUT description-derived paraphrases (MED-02 -- genuine retrieval, not the indexed first synonym)');
  check(wrongRate === 0, 'RETRIEVAL: wrong-invoke ' + wrongRate.toFixed(3) + ' === 0 on the cross-app collision PARAPHRASES (MED-01/MED-03, non-negotiable)');

  console.log('\nbreadth-search-return: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (err) {
  console.error('  FAIL: breadth-search-return threw:', err && err.message ? err.message : err);
  process.exit(1);
});
