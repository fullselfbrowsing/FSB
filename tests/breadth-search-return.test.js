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
// Sub-batch 4 (37-04) completes the dev/productivity category: cloudflare/circleci/
// datadog/sentry/posthog (cloud + observability + CI/analytics). cloudflare/datadog
// emit canonical stems via STEM_OVERRIDES (dash/datadoghq would be wrong).
// Phase 38 batch B sub-batch 1 (38-02) GROWS the corpus with the AI-chat + microblog/
// fediverse apps -- chatgpt/claude (AI-chat) + bsky/mastodon/threads (microblog) --
// ALL screened SENSITIVE by 38-01 and ALL backing:'dom' (DOM-only). The bluesky DIR
// emits the `bsky` HOST stem; threads vendors *://www.threads.net/* (the screened
// origin) and canonicalizes to the `threads` stem via STEM_OVERRIDES (the host-derived
// 'www' would be wrong), so the slug is opentabs__threads__* (NOT opentabs__www__*).
// Phase 38 batch B sub-batch 2 (38-03) COMPLETES the comms/social/content category
// with the messaging + content-read apps -- discord (4 ops: list_channels/list_messages
// reads + send_message WRITE + delete_message DESTRUCTIVE; discord.com classified
// SENSITIVE) + reddit (3 read-only content ops: list_subreddit_posts/get_post/
// search_posts; reddit.com is the SAFE content tier). Both backing:'dom'. The
// discord-vs-slack messaging collision (both have a "send a message to a channel" op)
// is the new wrong-invoke=0 probe in COLLISION_SET. reddit vendors *://reddit.com/* (the
// apex) so the stem is 'reddit' (not 'www') -> opentabs__reddit__*; this is DISTINCT from
// the hand-authored reddit-inbox.json (slug reddit.inbox, backing recipe), which this
// corpus regex does NOT match (it is not an opentabs__reddit__* file -- no clobber).
// Phase 39 batch C sub-batch 1 (39-02) GROWS the corpus with the food-delivery +
// rideshare apps -- doordash/ubereats/grubhub/instacart (food/grocery delivery) +
// uber/lyft (rideshare) -- the MOST-sensitive PAYMENT-bearing category, ALL screened
// SENSITIVE by 39-01 and ALL backing:'dom' (DOM-only, invocable=false). The
// www-hosted apps (doordash/ubereats/grubhub/instacart vendor *://www.<app>.com/*)
// derive the stem 'www' and canonicalize to the brand stem via STEM_OVERRIDES, so the
// slug is opentabs__<app>__* (NOT opentabs__www__*); uber/lyft vendor *://*.uber.com/*
// and *://*.lyft.com/* -> stem 'uber'/'lyft' (pinned in STEM_OVERRIDES). The PAYMENT
// ops place_order/checkout/request_ride class WRITE and cancel_order/cancel_ride class
// DESTRUCTIVE, all backing:'dom' on a sensitive origin (the payment-op guard PASSES).
// The cross-app place_order (doordash/grubhub/ubereats) + request_ride (uber/lyft)
// collisions are the new wrong-invoke=0 probes in COLLISION_SET.
// Phase 39 batch C sub-batch 2 (39-03, retail + marketplace) GROWS the corpus with the
// retail/marketplace apps -- amazon/bestbuy/costco/walmart/target (big-box retail) +
// ebay/etsy (marketplaces) -- the MOST-sensitive PAYMENT-bearing category, ALL screened
// SENSITIVE by 39-01 and ALL backing:'dom' (DOM-only, invocable=false). All 7 vendor
// *://www.<app>.com/* and derive the stem 'www', canonicalized to the brand stem via
// STEM_OVERRIDES, so the slug is opentabs__<app>__* (NOT opentabs__www__*). The PAYMENT
// ops place_order/buy_now/checkout/place_bid class WRITE and cancel_order class
// DESTRUCTIVE, all backing:'dom' on a sensitive origin (the payment-op guard PASSES).
// The cross-app place_order (amazon/walmart/target/bestbuy/costco) collision + the
// marketplace buy/bid (ebay) vs cart-checkout (etsy) probes are the new wrong-invoke=0
// probes in COLLISION_SET. This test indexes the dev/productivity batch, the COMPLETE
// comms/social/content category, the food-delivery/rideshare sub-batch, AND the
// retail/marketplace sub-batch.
const corpusFiles = fs.readdirSync(DESCRIPTORS_DIR)
  .filter(function (name) {
    return /^opentabs__(linear|asana|todoist|clickup|jira|confluence|airtable|gitlab|bitbucket|vercel|netlify|cloudflare|circleci|datadog|sentry|posthog|chatgpt|claude|bsky|mastodon|threads|discord|reddit|doordash|ubereats|grubhub|instacart|uber|lyft|amazon|ebay|etsy|bestbuy|costco|walmart|target)__/.test(name) && name.endsWith('.json');
  })
  .sort();

const corpus = corpusFiles.map(function (name) {
  return JSON.parse(fs.readFileSync(path.join(DESCRIPTORS_DIR, name), 'utf8'));
});

check(corpus.length >= 159,
  'loaded the REAL emitted dev/productivity + COMPLETE comms/social/content + food-delivery/rideshare + retail/marketplace corpus (got ' + corpus.length + ' descriptors: 70 dev/productivity [5 linear + 4 asana + 7 todoist + 4 clickup + 5 jira + 4 confluence + 5 airtable + 4 gitlab + 4 bitbucket + 4 vercel + 4 netlify + 4 cloudflare + 4 circleci + 4 datadog + 4 sentry + 4 posthog] + 24 comms/social/content [3 chatgpt + 3 claude + 4 bsky + 4 mastodon + 3 threads + 4 discord + 3 reddit] + 31 food-delivery/rideshare [6 doordash + 5 ubereats + 5 grubhub + 5 instacart + 5 uber + 5 lyft] + 34 retail/marketplace [6 amazon + 5 ebay + 5 etsy + 5 bestbuy + 4 costco + 5 walmart + 4 target -- Phase-39 batch C sub-batch 2, all backing:dom on SENSITIVE payment origins])');

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
  // Phase-38 batch B sub-batch 1 (AI-chat + microblog/fediverse) cross-app near-neighbors.
  // chatgpt.send_message vs claude.send_message: IDENTICAL op name across two AI-chat
  // apps -- the app token MUST keep each on its OWN slug (a swapped stem would route a
  // ChatGPT prompt to the Claude account, or vice versa, on a SENSITIVE origin).
  { query: 'fire off a message in chatgpt', expected: 'chatgpt.send_message' },
  { query: 'send a message to claude not chatgpt', expected: 'claude.send_message' },
  // The 3-way microblog create_* near-neighbors (bsky/mastodon/threads all "post"):
  // each social WRITE op must top its OWN slug, never cross-post to a sibling network.
  { query: 'publish a post to my bluesky feed', expected: 'bsky.create_post' },
  { query: 'publish a status on mastodon', expected: 'mastodon.create_status' },
  { query: 'publish a new thread on threads', expected: 'threads.create_thread' },
  // The microblog DESTRUCTIVE ops (bsky.delete_post / mastodon.delete_status): held-out
  // paraphrases ("for good"/"permanently") must each top their OWN destructive slug.
  { query: 'remove one of my bluesky posts for good', expected: 'bsky.delete_post' },
  { query: 'take down a mastodon toot permanently', expected: 'mastodon.delete_status' },
  // The 3-way microblog list_timeline near-neighbors -- "scroll my <app> home feed" is
  // the closest same-op collision across the three networks; the app token disambiguates.
  { query: 'scroll my bluesky home feed', expected: 'bsky.list_timeline' },
  { query: 'scroll my mastodon home feed', expected: 'mastodon.list_timeline' },
  { query: 'scroll my threads home feed', expected: 'threads.list_timeline' },
  // Phase-38 batch B sub-batch 2 (38-03, COMPLETING comms/social/content): the
  // discord-vs-slack messaging collision -- discord.send_message is a "send a message to
  // a channel" op, the DIRECT near-neighbor of slack's chat.postMessage AND the
  // chatgpt/claude send_message ops. A held-out paraphrase ("send a message to my team in
  // discord" -- "to my team" is the colloquial slack/messaging phrasing, NOT an indexed
  // discord synonym) MUST top discord.send_message and NEVER cross-invoke a sibling
  // messaging/AI-chat send op (a cross-invoke would post to the wrong SENSITIVE account).
  { query: 'send a message to my team in discord', expected: 'discord.send_message' },
  // discord.list_messages (read a channel's messages) vs the discord WRITE -- the
  // read/write split within the same app must keep "catch up on" reading, not sending.
  { query: 'catch up on the messages in my discord channel', expected: 'discord.list_messages' },
  // reddit content reads (the SAFE tier): "browse" a subreddit tops list_subreddit_posts
  // (a held-out paraphrase of the indexed "show posts in a subreddit"), and a reddit
  // KEYWORD SEARCH tops search_posts -- the "search ... for a keyword" intent token keeps
  // it off get_post (whose verbs are get/look-up/fetch/read), so neither reddit read op
  // cross-invokes the other.
  { query: 'browse the posts in a subreddit on reddit', expected: 'reddit.list_subreddit_posts' },
  { query: 'search reddit posts for a keyword', expected: 'reddit.search_posts' },
  // Phase-39 batch C sub-batch 1 (39-02, food-delivery + rideshare): the cross-app
  // PAYMENT-op collisions are the headline disambiguation probes for the most-sensitive
  // category. place_order is emitted by doordash AND grubhub AND ubereats (IDENTICAL
  // op name across three food-delivery apps) -- the app token MUST keep each paid order
  // on its OWN slug (a swapped stem would charge a card on the WRONG account/origin). The
  // queries are HELD-OUT paraphrases ("submit my cart"/"for delivery"/"to my address"
  // are NOT indexed synonyms -- the indexed forms are "place an order in <app>" / "order
  // food on <app> in <app>"), so wrong-invoke=0 is a genuine retrieval measurement.
  { query: 'submit my food cart for delivery on doordash', expected: 'doordash.place_order' },
  { query: 'submit my food cart for delivery on grubhub', expected: 'grubhub.place_order' },
  { query: 'submit my food cart for delivery on ubereats', expected: 'ubereats.place_order' },
  // request_ride is emitted by uber AND lyft (IDENTICAL op name across the two rideshare
  // apps) -- the closest same-op cross-app collision in this sub-batch; the app token must
  // keep each paid ride on its OWN slug (a cross-invoke would book a ride on the wrong
  // account). Held-out paraphrases ("request a car"/"pick me up" are NOT indexed synonyms
  // -- the indexed forms are "request a ride in <app>" / "request a <app> ride in <app>");
  // both top their OWN request_ride at a ~1.9x margin over the within-app read ops.
  { query: 'request a car to pick me up on uber', expected: 'uber.request_ride' },
  { query: 'request a car to pick me up on lyft', expected: 'lyft.request_ride' },
  // instacart.checkout (the grocery PAYMENT op) vs the food-delivery place_order family:
  // "check out my groceries" must top instacart.checkout, never a food-delivery order op.
  { query: 'pay for my groceries and check out on instacart', expected: 'instacart.checkout' },
  // Phase-39 batch C sub-batch 2 (39-03, retail + marketplace): the cross-app PAYMENT-op
  // collisions are the headline disambiguation probes for the retail category. place_order
  // is emitted by amazon AND walmart AND target AND bestbuy AND costco (IDENTICAL op name
  // across five big-box retailers) -- the app token MUST keep each paid order on its OWN
  // slug (a swapped stem would charge a card on the WRONG account/origin). The queries are
  // HELD-OUT paraphrases ("submit my shopping cart and place the order" is NOT an indexed
  // synonym -- the indexed forms are "place an order in <app>" / "order this on <app> in
  // <app>"), so wrong-invoke=0 is a genuine retrieval measurement. (The paraphrase avoids
  // the token "buy" so it never leaks toward the eBay buy_now payment op -- the cross-app
  // disambiguation is on the retailer name + the place-order intent, not a shared verb.)
  { query: 'submit my shopping cart and place the order on amazon', expected: 'amazon.place_order' },
  { query: 'submit my shopping cart and place the order on walmart', expected: 'walmart.place_order' },
  { query: 'submit my shopping cart and place the order on target', expected: 'target.place_order' },
  { query: 'submit my shopping cart and place the order on bestbuy', expected: 'bestbuy.place_order' },
  { query: 'submit my shopping cart and place the order on costco', expected: 'costco.place_order' },
  // The marketplace PAYMENT ops: ebay.buy_now (a fixed-price immediate purchase) vs
  // ebay.place_bid (an auction bid) -- the two eBay payment ops must each top their OWN
  // slug (held-out paraphrases: "purchase this listing right away" / "put the top bid on an
  // auction" are NOT indexed synonyms). etsy.checkout (the marketplace cart payment) must
  // top its OWN slug ("pay for my etsy basket" is held-out), never an ebay payment op.
  { query: 'purchase this listing right away on ebay', expected: 'ebay.buy_now' },
  { query: 'put the top bid on an auction listing on ebay', expected: 'ebay.place_bid' },
  { query: 'pay for my etsy basket and check out', expected: 'etsy.checkout' },
  // etsy.add_to_cart (a non-payment WRITE -- stages an item) vs etsy.checkout (the payment):
  // "put this etsy item in my basket" must top add_to_cart, never the checkout payment op
  // (the read/write/payment split within the same app must route correctly).
  { query: 'put this etsy item in my basket', expected: 'etsy.add_to_cart' },
  // search_products is emitted by amazon AND walmart AND target AND bestbuy AND costco
  // (IDENTICAL op name across the big-box retailers) -- a catalog search must top its OWN
  // app's slug ("find me a product in the <app> catalog" is a held-out paraphrase).
  { query: 'find me a product in the amazon catalog', expected: 'amazon.search_products' },
  { query: 'find me a product in the bestbuy catalog', expected: 'bestbuy.search_products' },
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
