#!/usr/bin/env node
/**
 * Phase 36 / Plan 03 (v1.0.0 Full App Catalog -- CGEN-02) -- side-effect
 * derived-vs-declared cross-check gate.
 *
 * THE TRAP THIS CLOSES: GraphQL/RPC mutations tunnel through POST (linear/github
 * `graphql(query)` is ALWAYS POST -- reads AND mutations both). "Class by HTTP
 * method alone" mislabels a mutation `read`, and under the shipped opt-out Auto
 * default a `read`-declared op runs with NO friction -- a fully-writable op with
 * no gate (Elevation of Privilege, threats T-36-08/09). This gate is the
 * import-time catch: for each emitted descriptor it RE-DERIVES the side-effect
 * class from the persisted provenance.signals (transportHelper + httpMethod +
 * opNameVerb) using the GraphQL/RPC carve-out + the named-verb map + the generic
 * api({method}) literal + an override-table FLOOR, MAX-merged (fail-safe-high:
 * read < write < destructive, disagreement -> the MAX), and FAILS THE BUILD when a
 * descriptor's DECLARED class is LOWER than the derived class (it under-states a
 * destructive/mutating op). It does NOT fail when the descriptor over-states
 * (declared >= derived is the safe direction). The runtime recipe-method backstop
 * (capability-router.js line 303, POST -> mutating) still guards at invoke; this
 * fails the PR BEFORE it ships.
 *
 * Derivation priority (RESEARCH Mechanic 2, read live across airtable/stripe/
 * linear/github):
 *   1. GraphQL/RPC carve-out (FIRST): transport in {graphql, gql, gqlRequest,
 *      persisted-query, rpc} -> the HTTP method is uninformative (always POST);
 *      classify by the OP-NAME VERB; an ambiguous GraphQL op fails-safe to WRITE;
 *      a GraphQL op is NEVER auto-classed read merely because no apiPost appears.
 *   2. Named verb helper: apiGet->read; apiPost/apiPut/apiPatch->write;
 *      apiDelete->destructive.
 *   3. Generic api({method}): GET/HEAD->read; POST/PUT/PATCH->write;
 *      DELETE->destructive; no literal -> default GET -> read (cross-checked vs
 *      the name verb, which is always also computed).
 *   4. Op-name verb prefix (ALWAYS computed; the cross-check partner; camelCase-
 *      aware): the read verb set and the write/destructive verb set (delete-family
 *      + void/cancel/archive -> destructive).
 *   5. Override table (highest specificity, applied LAST as an UPGRADE-only FLOOR,
 *      never a downgrade): known-destructive / known-mutating ops.
 *   6. Fail-safe-high floor (HI-01): a generic mutating-capable api/apiVoid helper
 *      with NO usable signal derives at least WRITE -- never the read floor.
 * deriveClass(signals) = MAX over every computed signal AND the override floor AND
 * the no-signal fail-safe-high floor.
 *
 * SHARED DERIVATION (HI-02): the verb sets, the lattice MAX, the helper/method/verb
 * classifiers, the GraphQL/RPC carve-out, the override table, AND the no-signal
 * fail-safe-high floor all live in ONE module -- scripts/lib/side-effect-class.mjs --
 * imported by BOTH this gate AND the importer (scripts/import-opentabs-catalog.mjs).
 * Previously each carried its own divergent copy (the importer treated void/cancel as
 * destructive while the gate treated them as mere write; the importer's verb-prefix
 * could not split camelCase). A gate that re-derives from a DIFFERENT map than the
 * importer is a check that can silently disagree with what it checks. With the single
 * shared module the gate is a true SECOND evaluation of the SAME logic over the
 * persisted signals -- so an importer mis-stamp (a different generator, a hand-edit)
 * is caught because both sides agree on what the signals imply.
 *
 * DUAL EXPORT (mirrors scripts/verify-classification-gate.mjs):
 *   - export { crossCheck, deriveClass, verbClass } -- the Phase-36 importer can call
 *     crossCheck inline BEFORE writing a descriptor; the CLI below reuses the SAME
 *     logic as the CI backstop. deriveClass/verbClass are re-exported from the shared
 *     module for the existing tests.
 *   - CLI on direct invocation -- chained into validate:extension (-> ci) AFTER
 *     verify-classification-gate.mjs (registered by Plan 01). Sweeps the committed
 *     catalog/descriptors/*.json corpus and process.exit(1) on any under-stated op.
 *
 * ANALOG: scripts/verify-classification-gate.mjs (Node-builtins-only static gate;
 * dual-export; failures[] accumulator; process.exit(1) on fail / exit(0) + PASS
 * summary on pass; CLI runs only on direct invocation via the import.meta.url
 * pathToFileURL(process.argv[1]) guard). And scripts/verify-recipe-path-guard.mjs
 * (the CI-gate process.exit(1)-on-fail skeleton).
 *
 * Wall-1 discipline: build tooling (NOT shipped to the browser); kept FREE of
 * run-string-as-code / function-from-string / dynamic-module-loader constructs in
 * code AND comments, consistent with the recipe-path guard.
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// THE single shared side-effect derivation (HI-02). Both this gate AND the importer
// (scripts/import-opentabs-catalog.mjs) import from here, so they cannot diverge:
// the gate re-derives with the SAME verb-map + carve-out + override table + fail-
// safe-high floor the importer stamped with.
import {
  SIDE_EFFECT_ORDER as ORDER,
  rankOf,
  deriveClass,
  verbClass,
  verbPrefix,
  opNameFromSlug,
} from './lib/side-effect-class.mjs';

import { createRequire } from 'node:module';

// Re-export the shared derivation so existing tests importing { deriveClass,
// verbClass } from THIS gate keep working (and so the gate's public surface is
// unchanged after the HI-02 hoist).
export { deriveClass, verbClass };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

/**
 * crossCheck(descriptors) -> { failures: string[] }
 *
 * For each descriptor: re-derive the class from provenance.signals (the persisted
 * raw signals) and compare vs the descriptor's declared sideEffectClass. Push a
 * descriptive failure (slug + declared + derived) when the DECLARED class is LOWER
 * than the derived class (it under-states the op). A descriptor declaring a class
 * >= derived PASSES (over-stating is the safe direction).
 *
 * descriptors: array of emitted descriptors
 *   ({ slug, sideEffectClass, provenance:{ signals:{...} } }).
 * A descriptor missing provenance.signals derives the `read` floor from the slug-
 * keyed override alone -- a declared `read` for a known-destructive slug still fails.
 */
export function crossCheck(descriptors) {
  const failures = [];
  const list = Array.isArray(descriptors) ? descriptors : [];

  for (const d of list) {
    if (!d || typeof d !== 'object') continue;
    const slug = d.slug || '(unknown-slug)';
    const declared = d.sideEffectClass;
    const signals = d.provenance && d.provenance.signals ? d.provenance.signals : null;

    // A descriptor that declares no class at all is a defect: treat as `read`
    // (the lowest) so any non-read derivation flags it (fail-safe direction).
    const declaredCls = ORDER[declared] !== undefined ? declared : 'read';
    const derived = deriveClass(signals, slug);

    if (rankOf(declaredCls) < rankOf(derived)) {
      failures.push(
        slug + ' UNDER-states its side-effect class: declared "' +
        String(declared) + '" but derived "' + derived + '" from signals ' +
        JSON.stringify(signals || {}) +
        ' (fail-safe-high: a GraphQL/RPC POST or a destructive verb is never ' +
        'classed read). Raise sideEffectClass to "' + derived + '" (or higher).'
      );
    }
  }

  return { failures };
}

// ---- MED-02 (38-REVIEW): the "safe-because-read-only" INVARIANT --------------
// Several social/content origins are deliberately classified SAFE (absent from
// service-denylist.json sensitiveOrigins) ONLY because the vendored slice happens to
// expose read ops alone -- reddit is the canonical case (get_post / list_subreddit_
// posts / search_posts, all GET reads). That safety is coupled to the CONTENT of the
// vendored snapshot, not enforced anywhere: a future re-vendor that adds a reddit
// write op (submit_post / reply / vote / send_message) would emit it under
// service:reddit.com, which classifies NOT sensitive (writes run under Auto with no
// mutating re-gate) AND is NOT caught by the classification heuristic (reddit is in no
// axis, and post/submit are not -- and deliberately must not be -- axis tokens). So a
// reddit write would ship writable-under-Auto silently (threat parallel to MED-01 but
// for the intentionally-safe origin).
//
// This gate turns the "reddit is read-only" assumption into a CHECKED INVARIANT: every
// emitted descriptor whose `service` is in READ_ONLY_SAFE_SERVICES MUST be
// sideEffectClass 'read'. A re-vendored write/destructive op for one of these services
// FAILS THE BUILD, forcing an explicit re-classification decision (add the origin to
// sensitiveOrigins so its writes are posture-B gated) rather than shipping it
// writable-under-Auto. The set is intentionally SMALL + curated: an origin earns a
// place here ONLY when it is left safe SPECIFICALLY because it is content-read-only.
//
// Phase 39-05 (BRDTH-02) extends the set with the genuinely-read-only local-services /
// scheduling apps the events sub-batch imports -- www.yelp.com + www.tripadvisor.com
// (local/travel reviews + listings: search_*/get_*/list_reviews, all GET reads) and
// calendly.com (scheduling availability: list_event_types/get_availability/
// list_scheduled_events, all GET reads). Each is left SAFE (absent from
// sensitiveOrigins) SPECIFICALLY because its vendored ops are read-only -- so a FUTURE
// re-vendor that adds a write op for one (a yelp/tripadvisor review POST, a calendly
// booking, a partner hotel-booking) would emit it under that service, classify NOT
// sensitive, and ship writable-under-Auto. Listing them here turns that into a CHECKED
// invariant: any non-read op for these origins FAILS the build, forcing an explicit
// re-classification (add the origin to sensitiveOrigins) rather than a silent
// writable-under-Auto ship. The hosts are the EXACT services each app vendors,
// lowercased (www.yelp.com / www.tripadvisor.com / calendly.com).
//
// Phase 39-06 (BRDTH-02) extends the set with the genuinely-read-only misc apps the
// completion sub-batch imports -- www.zillow.com (real-estate: search_listings/
// get_listing/get_home_value, all GET reads) and grafana.com (observability:
// list_dashboards/get_dashboard/query_metrics, all GET reads). Each is left SAFE
// (absent from sensitiveOrigins) SPECIFICALLY because its vendored ops are read-only --
// so a FUTURE re-vendor that adds a write op for one (a zillow saved-search POST, a
// grafana dashboard create/update) would emit it under that service, classify NOT
// sensitive, and ship writable-under-Auto. Listing them here turns that into a CHECKED
// invariant: any non-read op for these origins FAILS the build, forcing an explicit
// re-classification (add the origin to sensitiveOrigins) rather than a silent
// writable-under-Auto ship. The hosts are the EXACT services each app vendors,
// lowercased (www.zillow.com / grafana.com). Because every emitted op carries NO
// payment verb, the payment-op guard never keys on zillow/grafana either.
const READ_ONLY_SAFE_SERVICES = new Set([
  'reddit.com', 'www.reddit.com',
  'www.yelp.com', 'www.tripadvisor.com', 'calendly.com',
  'www.zillow.com', 'grafana.com',
]);

/**
 * checkReadOnlySafeOrigins(descriptors) -> { failures: string[] }
 *
 * For each emitted descriptor whose `service` is in READ_ONLY_SAFE_SERVICES, assert
 * sideEffectClass === 'read'. Any write/destructive (or missing/other) class is a
 * failure naming the slug + service + class -- the "safe is correct only while
 * read-only" assumption, enforced. Operates on the DECLARED sideEffectClass over the
 * committed corpus (the field crosscheck already proves is not understated), so a
 * re-vendor adding a reddit write trips it regardless of signal shape.
 */
export function checkReadOnlySafeOrigins(descriptors) {
  const failures = [];
  const list = Array.isArray(descriptors) ? descriptors : [];
  for (const d of list) {
    if (!d || typeof d !== 'object') continue;
    const service = typeof d.service === 'string' ? d.service.toLowerCase() : '';
    if (!READ_ONLY_SAFE_SERVICES.has(service)) continue;
    const slug = d.slug || '(unknown-slug)';
    const cls = d.sideEffectClass;
    if (cls !== 'read') {
      failures.push(
        slug + ' (service ' + service + ') has sideEffectClass "' + String(cls) +
        '" but ' + service + ' is in the READ_ONLY_SAFE set -- it is classified SAFE ' +
        '(reads run under Auto, NO mutating re-gate) ONLY because it was read-only. A ' +
        'non-read op for this origin would ship writable-under-Auto silently. Either ' +
        'classify ' + service + ' sensitive in extension/config/service-denylist.json ' +
        '(so its writes are posture-B gated) and remove it from READ_ONLY_SAFE_SERVICES, ' +
        'or do not emit this write op.'
      );
    }
  }
  return { failures };
}

// ---- THE PAYMENT-OP GUARD (Phase 39, BRDTH-02; the headline money-no-movement- --
//      under-Auto CI assertion) --------------------------------------------------
//
// THE TRAP THIS CLOSES: the commerce/travel/misc batch is the most-sensitive --
// a payment-bearing op (place_order / checkout / charge / complete_booking /
// buy_tickets / book_flight / request_ride / place_bid / create_order / ...) that
// is ever classified safe-AND-API-invocable would run under the shipped opt-out
// Auto default = MONEY MOVED without consent (an order placed, a card charged, a
// paid reservation booked). This guard FAILS THE BUILD if any payment op is
// safe-and-invocable. It is the third leg of the TRIPLE mitigation (the frozen
// backing:'dom' default + payment origins sensitive/denied are the other two).
//
// DUAL-PATH DETECTION (the blocker fix -- the guard must cover ALL 12 payment
// op-names this phase emits, not just the three that are literal keys): a
// descriptor's op is a PAYMENT op if EITHER path matches --
//
//   PATH 1 -- a payment-VERB set matched via verbPrefix(opNameFromSlug(slug)).
//     verbPrefix is the shared snake_case/camelCase verb splitter from
//     side-effect-class.mjs. CRITICAL: these verbs are NOT in WRITE_VERBS (a
//     'place_order' classes write via {method:'POST'}, NOT via its verb), so this
//     set MUST be enumerated HERE -- the guard cannot reuse WRITE_VERBS to find
//     payment ops. So verbPrefix('place_order')='place' (HIT), 'buy_now'='buy'
//     (HIT), 'book_flight'/'book_stay'/'book_hotel'='book' (HIT),
//     'buy_tickets'='buy' (HIT), 'request_ride'='request' (HIT),
//     'place_bid'='place' (HIT), 'register_for_event'='register' (HIT). NOTE
//     'create_order' -> verbPrefix 'create' is BENIGN (create is not a payment
//     verb) -- it is caught by PATH 2 below.
//
//   PATH 2 -- a literal PAYMENT_OP op-name set matched against opNameFromSlug(slug),
//     for op-names whose VERB is benign but whose FULL op-name moves money
//     (create_order is the key case PATH 1 misses).
//
// SCOPE: the guard fails ONLY a payment op on a safe-AND-API-invocable origin. A
// payment op that is backing:'dom' on a sensitive/denied origin PASSES (DOM-only on
// a gated origin = no money movement under Auto; e.g. reserve_table on opentable --
// opentable is sensitive per Task 1, so reserve_table DOM-only-on-sensitive PASSES).
// The read-only-safe apps (calendly/zillow/yelp/tripadvisor/grafana) emit ONLY read
// ops (search/list/get/query) -- none of those verbs/op-names is a payment verb/op,
// so NONE of their ops is a payment op and the guard never keys on them.
//
// SAFE-AND-INVOCABLE (a FAILURE) = a payment op for which EITHER
//   (i) backing is 'recipe' or 'handler' (promoted to API-invocable -- a payment op
//       must NEVER be invocable from breadth), OR
//   (ii) classifyFn('https://'+service) returns NOT sensitive AND NOT denied (the
//        origin is safe -> the payment op would run under Auto with no re-gate).

// The payment-VERB set (PATH 1). Enumerated HERE because these verbs are deliberately
// NOT in side-effect-class.mjs WRITE_VERBS (a payment op classes write by method, not
// by an intrinsically-"write" verb). verbPrefix() recovers the leading verb token.
const PAYMENT_VERBS = new Set([
  'buy', 'book', 'place', 'reserve', 'checkout', 'pay', 'purchase', 'charge', 'order', 'request', 'register',
]);

// The literal PAYMENT_OP op-name set (PATH 2) for op-names whose leading verb is
// benign but whose full name moves money (create_order -> verb 'create' is benign).
const PAYMENT_OP_NAMES = new Set([
  'place_order', 'checkout', 'checkout_cart', 'complete_booking', 'submit_payment',
  'add_payment_method', 'confirm_order', 'create_order', 'buy_now', 'buy_tickets',
  'place_bid', 'book_stay', 'book_flight', 'book_hotel', 'register_for_event',
  'request_ride', 'purchase_tickets',
]);

/**
 * isPaymentOp(slug) -> { hit: boolean, via: 'verb'|'op-name'|null, verb, opName }
 *
 * An op is a PAYMENT op if EITHER verbPrefix(opName) is in PAYMENT_VERBS (PATH 1)
 * OR opNameFromSlug(slug) is in PAYMENT_OP_NAMES (PATH 2). Returns which path matched
 * for a precise failure message (the verb is reported when PATH 1 hits).
 */
function isPaymentOp(slug) {
  const opName = opNameFromSlug(slug);
  const verb = verbPrefix(opName);
  if (verb && PAYMENT_VERBS.has(verb)) {
    return { hit: true, via: 'verb', verb: verb, opName: opName };
  }
  if (opName && PAYMENT_OP_NAMES.has(opName)) {
    return { hit: true, via: 'op-name', verb: verb, opName: opName };
  }
  return { hit: false, via: null, verb: verb, opName: opName };
}

/**
 * checkPaymentOpsNotSafeInvocable(descriptors, classifyFn) -> { failures: string[] }
 *
 * For each descriptor whose op is a payment op (dual-path), push a failure when it is
 * SAFE-AND-INVOCABLE: (i) backing 'recipe'/'handler' (promoted to invocable), OR
 * (ii) classifyFn('https://'+service) is NOT sensitive AND NOT denied (a safe origin).
 * A backing:'dom' payment op on a sensitive/denied origin PASSES. classifyFn is the
 * service-denylist classify() (the gate is build-time; runCli awaits Denylist.load()).
 */
export function checkPaymentOpsNotSafeInvocable(descriptors, classifyFn) {
  const failures = [];
  const list = Array.isArray(descriptors) ? descriptors : [];
  const classify = typeof classifyFn === 'function' ? classifyFn : null;

  for (const d of list) {
    if (!d || typeof d !== 'object') continue;
    const slug = d.slug || '(unknown-slug)';
    const pay = isPaymentOp(slug);
    if (!pay.hit) continue; // not a payment op -> the guard does not key on it

    const service = typeof d.service === 'string' ? d.service : '';
    const backing = d.backing;
    const promoted = backing === 'recipe' || backing === 'handler';

    // The origin classification (a missing classifyFn -> treat as UNCLASSIFIED ==
    // safe, the fail-closed direction: a payment op then fails on the safe-origin leg).
    let cls = { sensitive: false, denied: false };
    if (classify) {
      try { cls = classify('https://' + service) || cls; } catch (_e) { /* treat as safe */ }
    }
    const safeOrigin = !(cls && (cls.sensitive === true || cls.denied === true));

    if (promoted || safeOrigin) {
      const matchedBy = pay.via === 'verb'
        ? ('payment VERB "' + pay.verb + '" (verbPrefix)')
        : ('payment OP-NAME "' + pay.opName + '"');
      const reason = promoted
        ? ('promoted to backing "' + String(backing) + '" (API-invocable -- a payment op must NEVER be invocable from breadth)')
        : ('on the SAFE origin ' + service + ' (NOT sensitive/denied -> it would run under Auto with no mutating re-gate)');
      failures.push(
        'payment op ' + slug + ' [matched ' + matchedBy + '] is SAFE-AND-API-INVOCABLE: ' + reason +
        '. A payment-bearing op writable under Auto = money moved without consent. FIX: classify ' +
        (service || 'the origin') + ' sensitive (or denied) in extension/config/service-denylist.json AND keep ' +
        'this op backing:"dom" (DOM-only on a gated origin), OR do not emit this payment op.'
      );
    }
  }
  return { failures };
}

// ---- Build the CLI corpus from the committed descriptor set -------------------
// Read catalog/descriptors/*.json TOP-LEVEL ONLY (mirroring readJsonDir's
// non-recursion; do NOT descend into _fixtures/, so seed/proof fixtures are
// excluded exactly as they are from the shipped catalog).
function readCorpusDescriptors() {
  const out = [];
  const dir = resolve(ROOT, 'catalog/descriptors');
  if (!existsSync(dir)) return out;
  const names = readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort();
  for (const name of names) {
    let d;
    try {
      d = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch (_e) {
      // A malformed descriptor is validate-extension's concern; skip here so this
      // gate reports class mismatches, not JSON syntax (separation of gates).
      continue;
    }
    if (d && typeof d === 'object') out.push(d);
  }
  return out;
}

// ---- CLI entry (only when invoked directly, not when imported) ---------------
// async: the payment-op guard (Phase 39) consults the service-denylist classify(),
// which requires an awaited Denylist.load() (the gate is build-time, so an await is
// fine). Mirrors verify-classification-gate.mjs runCli's await Denylist.load().
async function runCli() {
  const corpus = readCorpusDescriptors();
  // Only descriptors carrying provenance.signals participate in the derived-vs-
  // declared comparison (hand-authored recipes without OpenTabs signals are not
  // re-derivable from this gate -- they are governed elsewhere). The override
  // floor still applies via the slug for any with a known-destructive op-name.
  const checked = corpus.filter(
    (d) => d && d.provenance && d.provenance.signals && typeof d.sideEffectClass === 'string'
  );
  const { failures } = crossCheck(checked);
  // MED-02: the read-only-safe-origin invariant runs over the WHOLE corpus (not just
  // the signal-bearing subset) -- a re-vendored reddit write is caught by its declared
  // class regardless of signal shape. Merge its failures into the same fail set.
  const safeOnly = checkReadOnlySafeOrigins(corpus);

  // Phase 39 PAYMENT-OP GUARD (the headline): no payment-bearing op may be safe-and-
  // API-invocable. Consult the committed service-denylist classify() (await load()
  // first). Runs over the WHOLE corpus (a payment op is keyed by slug, not by signal
  // shape). Merge its failures into the same exit-decision set.
  const require = createRequire(import.meta.url);
  const Denylist = require('../extension/utils/service-denylist.js');
  await Denylist.load();
  const paymentOnly = checkPaymentOpsNotSafeInvocable(corpus, Denylist.classify);

  const allFailures = failures.concat(safeOnly.failures, paymentOnly.failures);
  if (allFailures.length > 0) {
    console.error('verify-catalog-crosscheck: FAIL (an under-stated side-effect class, a non-read op on a read-only-safe origin, or a payment op that is safe-and-API-invocable)');
    for (const f of allFailures) {
      console.error('  - ' + f);
    }
    process.exit(1);
  }
  console.log(
    'verify-catalog-crosscheck: PASS (' + checked.length +
    ' descriptors with signals; every declared sideEffectClass >= its derived ' +
    'fail-safe-high class -- no under-stated destructive/mutating op; every ' +
    'read-only-safe origin (reddit) emits read-only ops, MED-02; and no payment-bearing ' +
    'op is safe-and-API-invocable -- the money-no-movement-under-Auto guard, Phase 39)'
  );
  process.exit(0);
}

// Dual-export idiom: run the CLI only on direct invocation, never on import.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runCli().catch((err) => {
    console.error('verify-catalog-crosscheck: ERROR ' + (err && err.message ? err.message : err));
    process.exit(1);
  });
}
