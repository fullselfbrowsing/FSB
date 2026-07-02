#!/usr/bin/env node
/**
 * Phase 36 / Plan 01 (v1.0.0 Full App Catalog -- CGEN-01) -- build-time OpenTabs
 * descriptor importer.
 *
 * RUN: node --import tsx ./scripts/import-opentabs-catalog.mjs
 *
 * BUILD-TIME ONLY. NO zod / @opentabs-dev/plugin-sdk / opentabs runtime is ever
 * shipped into the extension (Wall 1). This script mirrors the operation OpenTabs'
 * own `opentabs-plugin build` performs (platform/plugin-tools/src/commands/build.ts:746):
 * `z.toJSONSchema(tool.input)`. It reads a vendored metadata-only slice of the
 * pinned OpenTabs plugin (SHA 4b17021637d2cac12b8d84d21c40e765aa7b85e9) and emits
 * FLAT, provenance-stamped, closed-vocabulary `params` descriptors.
 *
 * The pipeline per op:
 *   1. read package.json.opentabs.urlPatterns -> service/origin
 *   2. import() the plugin index under tsx (handle() bodies are NEVER executed --
 *      only .name/.description/.input/.group/.summary metadata is read)
 *   3. params = z.toJSONSchema(tool.input); delete params.$schema
 *      (plain z.object() already emits additionalProperties:false -> the closed
 *      params contract for free)
 *   4. [Plan 01 Task 3 slots the recursive forbidden-field pre-scan HERE, between
 *      extraction and the gate/emit -- see preScanForbidden]
 *   5. infer sideEffectClass (verb-map + GraphQL/RPC carve-out + override table,
 *      fail-safe-high MAX) and persist the raw signals into provenance
 *   6. classifyGate([{origin,service,slug,description}]) AFTER Denylist.load()
 *      BEFORE any write -- refuse to emit if an unclassified sensitive origin is
 *      present (the denylist-first floor, Phase 35)
 *   7. write catalog/descriptors/opentabs__<service-stem>__<op>.json FLAT
 *      (readJsonDir is non-recursive; provenance is carried IN the descriptor, the
 *      `opentabs/` namespace is the filename prefix + provenance.source, NOT a subdir)
 *   8. fill catalog/descriptors/_fixtures/_provenance.json apps[] with per-app provenance
 *
 * Wall-1 discipline: build tooling (NOT shipped); kept FREE of run-string-as-code /
 * function-from-string / dynamic-module-loader constructs in code AND comments,
 * consistent with the recipe-path guard. (The `await import()` of the plugin module
 * is the standard tsx metadata loader; the recipe-path guard scans the SHIPPED
 * recipe-path files, not this build script.)
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { classifyGate } from './verify-classification-gate.mjs';
// THE single shared side-effect derivation (HI-02). The importer stamps the class
// with the SAME verb-map + GraphQL/RPC carve-out + override table + fail-safe-high
// floor the cross-check gate (scripts/verify-catalog-crosscheck.mjs) re-derives with
// -- imported from one module so the two can never diverge. verbPrefix is camelCase-
// aware here too (it is the importer's actionVerb + synonym seed).
import { verbPrefix, deriveClass } from './lib/side-effect-class.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// The denylist source-of-truth classifyGate consults (dual-export IIFE -> module.exports).
const Denylist = require('../extension/utils/service-denylist.js');

// The pinned OpenTabs provenance (hermetic, offline, auditable). MUST match the
// vendor pin at vendor/opentabs-snapshot/_provenance.json.
const OPENTABS_SHA = '4b17021637d2cac12b8d84d21c40e765aa7b85e9';
const OPENTABS_LICENSE = 'MIT';

const VENDOR_ROOT = resolve(ROOT, 'vendor/opentabs-snapshot/plugins');
// FSB_OUTPUT_DIR env-var seam: tests spawn the importer against a tmpdir so
// npm test never rewrites the tracked catalog/descriptors tree. Default resolves
// to the real catalog dir.
const OUTPUT_DIR = process.env.FSB_OUTPUT_DIR
  ? resolve(process.env.FSB_OUTPUT_DIR)
  : resolve(ROOT, 'catalog/descriptors');
const DESCRIPTORS_DIR = OUTPUT_DIR;
const PROVENANCE_PATH = resolve(OUTPUT_DIR, '_fixtures', '_provenance.json');
// The eval-indexed seed set (capability-search-eval.test.js buildIndexes this file
// but iterates intent-cases.json). feedSeedDescriptors() mirrors each emitted
// descriptor's searchable shape here so every intent-case expectedSlug the later
// plans add HAS an indexed descriptor (the eval recall/wrong-invoke gate stays
// satisfiable across 02/03/04). BRDTH-01 eval-gate fix (37-01).
const SEED_DESCRIPTORS_PATH = resolve(OUTPUT_DIR, '_fixtures', 'seed-descriptors.json');

// ---------------------------------------------------------------------------
// Batch enumeration (BRDTH-01) -- replaces the hardcoded Phase-36 smoke list.
// ---------------------------------------------------------------------------
// The importer ENUMERATES the vendored dev/productivity category from the pinned
// snapshot rather than carrying a hardcoded app list, EXCLUDING:
//   (i)   apps whose derived service already owns a shipped REGISTRY/head descriptor
//         (github.com / app.slack.com / www.notion.so -- the EXISTING_HEAD_SERVICES
//         set below). Breadth adds DATA behind the SAME 2 capability tools; it must
//         NOT duplicate or clobber an existing head/REGISTRY entry (INV-01).
//   (ii)  any OpenTabs CI fixture dir (e2e / prescript / *-test).
// todoist (the Phase-36 smoke slice) IS re-enumerated: re-emitting it is idempotent
// for its byte content EXCEPT the intentSynonyms, which are regenerated by the NEW
// MED-03 synthSynonyms so todoist participates honestly in the cross-app create_*
// collision proof (Task 4) alongside asana/linear. Re-running NEVER overwrites the
// github/notion/slack head descriptors (they are excluded by service).
//
// EXISTING_HEAD_SERVICES is the authoritative head-origin set (the exact hosts the
// T1a head descriptors ship under). Keyed by the urlPatterns host so a future
// vendored github/slack/notion slice is skipped by SERVICE, not just by dir name.
const EXISTING_HEAD_SERVICES = new Set(['github.com', 'app.slack.com', 'www.notion.so']);
// OpenTabs ships e2e/prescript test-fixture plugin dirs; never import those.
const FIXTURE_DIR_RE = /(^|[-_])(e2e|prescript)([-_]|$)|-test$/i;
// SKIP_APPS (BLOCKER C, Phase 39.5 -- full-corpus import): self-hosted apps that ship
// EMPTY urlPatterns (`package.json.opentabs.urlPatterns: []` + a runtime
// `configSchema.instanceUrl`) have NO static origin -- readPluginMeta derives
// service=='' for them, so they cannot be origin-classified by the denylist or
// search-keyed the way a fixed-host app is. At the pinned SHA the real `grafana` +
// `sqlpad` are the two such apps. enumerateBatchApps now skips SKIP_APPS AND any
// empty-service app with a CLEAN continue (instead of the historical
// extractDescriptors throw), so a self-hosted empty-origin app is skipped rather than
// aborting the whole batch. The hand-authored grafana slice (real origin grafana.com)
// is PRESERVED by Plan 39.5-01 and still imports normally -- only the real empty-origin
// apps are skipped. This is a skip-set + enumeration-filter extension, NOT a change to
// the load/transpile/extract/z.toJSONSchema/pre-scan/side-effect core path (INV-01 holds).
const SKIP_APPS = new Set(['sqlpad']);

export function enumerateBatchApps() {
  if (!existsSync(VENDOR_ROOT)) return [];
  const dirs = readdirSync(VENDOR_ROOT)
    .filter((name) => {
      try {
        return statSync(join(VENDOR_ROOT, name)).isDirectory();
      } catch (_e) {
        return false;
      }
    })
    .filter((name) => !FIXTURE_DIR_RE.test(name))
    // BLOCKER C: skip the explicit self-hosted skip-set up front.
    .filter((name) => !SKIP_APPS.has(name))
    // Skip any app whose derived service is an existing head/REGISTRY origin so the
    // importer never clobbers a shipped head descriptor, AND any app with an EMPTY
    // service (empty urlPatterns -> no static origin): BOTH are a clean continue, not
    // an abort. (Read the vendored package.json host; a missing/unreadable meta falls
    // through to an empty service and is skipped here -- the empty-origin self-hosted
    // app is dropped cleanly instead of throwing later in extractDescriptors.)
    .filter((name) => {
      let service = '';
      try {
        service = readPluginMeta(name).service;
      } catch (_e) {
        service = '';
      }
      if (!service) return false; // empty-origin self-hosted app (BLOCKER C) -> clean skip
      return !EXISTING_HEAD_SERVICES.has(service);
    })
    .sort();
  return dirs;
}

// ---------------------------------------------------------------------------
// serviceStem/displayService OVERRIDE (BRDTH-01) -- one-time machinery map.
// ---------------------------------------------------------------------------
// The frozen host-derived stem (`service.replace(/^app\./,'').split('.')[0]`) is
// WRONG or COLLIDING for several apps whose first host label is not the app name:
//   - jira       (*.atlassian.net  -> the subdomain; COLLIDES with confluence)
//   - confluence (*.atlassian.net  -> the subdomain; COLLIDES with jira)
//   - cloudflare (dash.cloudflare.com -> 'dash')
//   - datadog    (app.datadoghq.com   -> 'datadoghq')
//   - threads    (www.threads.net     -> 'www')  [Phase 38]
// STEM_OVERRIDES (keyed by the vendored DIR name) gives jira/confluence DISTINCT
// canonical stems and cloudflare/datadog/threads their brand stems. Every other
// dev/productivity app (linear/asana/clickup/airtable/gitlab/bitbucket/vercel/
// netlify/sentry/posthog/circleci) derives correctly and falls through unchanged.
// Without this, 02/04 cannot emit the slugs they assert and jira would be
// indistinguishable from confluence. The `service` field keeps the real host; only
// the stem/slug/filename is canonicalized.
//
// THREADS (Phase 38-02): the EXACT origin Plan 38-01 classified sensitive is
// https://www.threads.net (the bare apex https://threads.net is NOT classified --
// it would emit UNscreened). So the threads slice MUST vendor *://www.threads.net/*
// to keep the gate-checked origin = the screened origin. But www.threads.net derives
// the stem 'www', so the dir-name override 'threads' canonicalizes the slug to
// opentabs__threads__* (NOT opentabs__www__*). This is the SAME designed
// host-whose-first-label-isn't-the-app-name canonicalization cloudflare/datadog/jira/
// confluence already use -- a DATA-MAP extension (STEM_OVERRIDES is the per-app
// extension point Phase 37-01 built), NOT a logic change, so INV-01 holds.
//
// PHASE 39 (39-02, food-delivery + rideshare): the screened-sensitive origins 39-01
// classified are the www/apex forms of the payment-bearing commerce apps, whose
// frozen split('.')[0] is WRONG. doordash/ubereats/grubhub/instacart vendor
// *://www.<app>.com/* -> the host stem 'www'; uber/lyft vendor *://*.uber.com/* and
// *://*.lyft.com/* (the bare-apex wildcards the *.uber.com/*.lyft.com sensitive entries
// cover) whose readPluginMeta strips the leading '*.' to service 'uber.com'/'lyft.com'
// -> stem 'uber'/'lyft' (already correct), but they are pinned here too so the slug is
// canonical and stable regardless of the vendored host form. The dir-name-keyed
// override canonicalizes each slug to opentabs__<app>__* (0 opentabs__www__*) -- the
// SAME first-label-isn't-the-app-name canonicalization cloudflare/datadog/jira/
// confluence/threads already use (a DATA-MAP extension of the 37-01 per-app extension
// point, NOT a logic change, so INV-01 holds). The `service` field keeps the real host;
// only the stem/slug/filename is canonicalized. 39-01's classifications are NOT changed.
//
// PHASE 39 (39-03, retail + marketplace): the 7 retail/marketplace apps amazon/ebay/
// etsy/bestbuy/costco/walmart/target all vendor *://www.<app>.com/* (the EXACT www
// origins 39-01 classified SENSITIVE on the payment/money-movement axis -- each places
// PAID orders / binding bids), so readPluginMeta strips nothing and derives the host
// stem 'www' for EVERY one. The dir-name-keyed override canonicalizes each slug to
// opentabs__<app>__* (0 opentabs__www__*) -- the SAME first-label-isn't-the-app-name
// canonicalization as doordash/ubereats/grubhub/instacart (39-02) and cloudflare/
// datadog/threads (a DATA-MAP extension of the 37-01 per-app extension point, NOT a
// logic change, so INV-01 holds). The `service` field keeps the real www-host; only the
// stem/slug/filename is canonicalized. 39-01's classifications are NOT changed.
//
// PHASE 39 (39-04, travel + transport): the 5 travel/transport apps booking/airbnb/
// expedia/kayak/opentable all vendor *://www.<app>.com/* (the EXACT www origins 39-01
// classified SENSITIVE on the payment/money-movement axis -- each is a paid-booking /
// held-card travel origin; opentable UNCONDITIONALLY sensitive per 39-01), so
// readPluginMeta derives the host stem 'www' for EVERY one. The dir-name-keyed override
// canonicalizes each slug to opentabs__<app>__* (0 opentabs__www__*) -- the SAME
// first-label-isn't-the-app-name canonicalization as the 39-02/03 commerce apps and
// cloudflare/datadog/threads (a DATA-MAP extension of the 37-01 per-app extension point,
// NOT a logic change, so INV-01 holds). The `service` field keeps the real www-host;
// only the stem/slug/filename is canonicalized. 39-01's classifications are NOT changed.
//
// PHASE 39 (39-05, events + local-services/scheduling): the 6 apps span BOTH tiers. The
// PAYMENT-bearing event apps ticketmaster/stubhub/eventbrite vendor *://www.<app>.com/* (the
// EXACT www origins 39-05 screened SENSITIVE on the payment/money-movement axis -- buy_tickets/
// register_for_event move money) and derive the host stem 'www'. The READ-ONLY apps yelp/
// tripadvisor vendor *://www.<app>.com/* (left SAFE -- read-only reviews/listings) and also
// derive 'www'; calendly vendors the APEX *://calendly.com/* (like reddit -- the apex derives
// 'calendly' directly). The dir-name-keyed override canonicalizes each slug to opentabs__<app>__*
// (0 opentabs__www__*) -- the SAME first-label-isn't-the-app-name canonicalization as the
// 39-02/03/04 commerce/travel apps and cloudflare/datadog/threads (a DATA-MAP extension of the
// 37-01 per-app extension point, NOT a logic change, so INV-01 holds; calendly's apex already
// derives correctly but is pinned for slug stability, as reddit's apex pattern). The `service`
// field keeps the real host; only the stem/slug/filename is canonicalized. 39-01's
// classifications are NOT changed.
//
// PHASE 39 (39-06, COMPLETION -- remaining commerce + read-only misc): the final
// sub-batch closes real-app coverage. The PAYMENT-bearing commerce apps shopify
// (*.shopify.com) + dominos/chipotle (www.dominos.com/www.chipotle.com) were screened
// SENSITIVE by 39-01 (create_order/place_order move money); craigslist vendors
// *://www.craigslist.org/* (the screened origin -- the denylist host was WIDENED to the
// apex-suffix *.craigslist.org in 39-06 so apex+www are both sensitive). The READ-ONLY
// misc apps zillow (www.zillow.com) + grafana (grafana.com) emit ONLY reads and are
// left SAFE + added to verify-catalog-crosscheck.mjs READ_ONLY_SAFE_SERVICES. The
// www-hosted apps (craigslist/dominos/chipotle/zillow vendor *://www.<app>.<tld>/*)
// derive the stem 'www' -> the dir-name STEM_OVERRIDES {craigslist:'craigslist',
// dominos:'dominos',chipotle:'chipotle',zillow:'zillow'} canonicalizes each slug to
// opentabs__<app>__* (0 opentabs__www__*). shopify (*.shopify.com -> strip '*.' ->
// 'shopify') and grafana (grafana.com -> 'grafana') already derive correctly but are
// pinned for slug stability -- the SAME first-label-isn't-the-app-name canonicalization
// as the 39-02..05 commerce apps and cloudflare/datadog/threads (a DATA-MAP extension
// of the 37-01 per-app extension point, NOT a logic change, so INV-01 holds). The
// `service` field keeps the real host; only the stem/slug/filename is canonicalized.
const STEM_OVERRIDES = {
  jira: 'jira', confluence: 'confluence', cloudflare: 'cloudflare', datadog: 'datadog', threads: 'threads',
  doordash: 'doordash', ubereats: 'ubereats', grubhub: 'grubhub', instacart: 'instacart', uber: 'uber', lyft: 'lyft',
  amazon: 'amazon', ebay: 'ebay', etsy: 'etsy', bestbuy: 'bestbuy', costco: 'costco', walmart: 'walmart', target: 'target',
  booking: 'booking', airbnb: 'airbnb', expedia: 'expedia', kayak: 'kayak', opentable: 'opentable',
  ticketmaster: 'ticketmaster', stubhub: 'stubhub', eventbrite: 'eventbrite',
  yelp: 'yelp', tripadvisor: 'tripadvisor', calendly: 'calendly',
  shopify: 'shopify', craigslist: 'craigslist', dominos: 'dominos', chipotle: 'chipotle', zillow: 'zillow', grafana: 'grafana',
  // PHASE 39.5 (full-corpus import): the real ~117-plugin OpenTabs source vendors many
  // apps whose first host label is NOT the app name, so the frozen split('.')[0] derives
  // a WRONG or COLLIDING stem. SIX collision groups would emit DUPLICATE
  // opentabs__<stem>__*.json filenames that silently clobber each other -- the headline
  // data-correctness risk the no-duplicate-stem CI gate (scripts/verify-no-duplicate-stem.mjs)
  // now FAILS the build on. Each colliding group is disambiguated to DISTINCT canonical
  // brand stems below, and the ~20 single wrong-stem apps get their brand stem. This is the
  // SAME first-label-isn't-the-app-name canonicalization the 37-39 entries above already use
  // (a DATA-MAP extension of the 37-01 per-app extension point, NOT a logic change -- INV-01
  // holds); the `service` field keeps the real host, only the stem/slug/filename is
  // canonicalized. The denied apps (fidelity/spotify/steam/youtube-music) are still gated
  // denied at classifyGate -- they are pinned here only for slug stability + to keep the
  // ENUMERATED set (which the no-dup-stem gate sweeps) collision-free regardless of dispo.
  // ---- collision group `console` (4-way): aws-console/clickhouse/google-cloud/twilio ----
  'aws-console': 'aws', clickhouse: 'clickhouse', 'google-cloud': 'gcloud', twilio: 'twilio',
  // ---- collision group `www`: google-maps/npm/reddit (yelp already pinned above) ----
  'google-maps': 'gmaps', npm: 'npm', reddit: 'reddit',
  // ---- collision group `cloud`: mongodb-atlas/temporal-cloud ----
  'mongodb-atlas': 'mongodb', 'temporal-cloud': 'temporal',
  // ---- collision group `slack`: slack derives 'slack' (kept); slack-enterprise (app.slack.com
  //      is an EXISTING_HEAD so it is enumerate-skipped) pinned 'slackent' defensively ----
  'slack-enterprise': 'slackent',
  // ---- collision group `web`: telegram/whatsapp ----
  telegram: 'telegram', whatsapp: 'whatsapp',
  // ---- the ~20 single wrong-stem apps -> brand stem ----
  azure: 'azure', bluesky: 'bsky', cockroachdb: 'cockroachdb', 'docker-hub': 'dockerhub',
  'excel-online': 'excel', fidelity: 'fidelity', 'google-analytics': 'ganalytics',
  'google-calendar': 'gcal', 'google-docs': 'gdocs', 'google-drive': 'gdrive',
  hackernews: 'hackernews', 'microsoft-word': 'msword', 'minimax-agent': 'minimax',
  newrelic: 'newrelic', 'panda-express': 'pandaexpress', posthog: 'posthog',
  spotify: 'spotify', steam: 'steam', stripe: 'stripe', 'terraform-cloud': 'terraform',
  'youtube-music': 'ytmusic',
};

export function displayServiceStem(app, derivedStem) {
  return Object.prototype.hasOwnProperty.call(STEM_OVERRIDES, app) ? STEM_OVERRIDES[app] : derivedStem;
}

// ---------------------------------------------------------------------------
// Backing policy (BRDTH-03) -- per-app backing-status enum.
// ---------------------------------------------------------------------------
// Every imported descriptor carries a `backing` enum whose CANONICAL FIELD value is
// one of recipe/handler/learn/dom -- the value resolve() (capability-catalog.js:351)
// routes to a seam tier ('learn' -> T2, 'dom' -> T3) and no-dead-entry.test.js keys
// on. ('discovery-pending'/'learn-pending' is the search DISPLAY label only, never
// the field value -> no resolve() change.) The Phase-37 dev/productivity batch has
// NO hand-port (depth is Phases 40-41) and NO seed (discovery is Phase 42), so it is
// DOM-backed. backingFor() is the policy seam later batches extend.
function backingFor(_app, _service) {
  return 'dom';
}

// ---------------------------------------------------------------------------
// z.toJSONSchema -> closed `params` (Mechanic 1)
// ---------------------------------------------------------------------------
// Plain z.object() emits additionalProperties:false BY DEFAULT (the closed-vocab
// contract). We strip only $schema. Default target (draft-2020-12) + default
// cycles:'ref' ($ref/$defs for any recursive op). We set NO `unrepresentable`
// override so a `.transform()`/`.pipe()` THROWS loudly (the safe direction) rather
// than silently emitting {}.
export function toClosedParams(zodInputSchema) {
  const params = z.toJSONSchema(zodInputSchema);
  if (params && typeof params === 'object') {
    delete params.$schema;
  }
  return params;
}

// ---------------------------------------------------------------------------
// Wall-1 recursive forbidden-field pre-scan (Mechanic 1, Pitfall 4).
// z.toJSONSchema passes a property literally named script/expr/transform/code/fn/js
// straight through at whatever depth the source put it. The pre-scan RECURSES over
// the FLATTENED JSON Schema and rejects any descriptor carrying a forbidden field
// name at ANY depth (top / nested / array items / union anyOf branch / recursive
// $defs). The recipe-path guard scans the SHIPPED recipe-path FILES, not descriptor
// FIELD names -- so this is a SEPARATE, required guard.
// ---------------------------------------------------------------------------
const FORBIDDEN = new Set(['script', 'expr', 'transform', 'code', 'fn', 'js']);

export function collectPropertyNames(node, acc) {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    for (const x of node) collectPropertyNames(x, acc);
    return acc;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'properties' && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const pn of Object.keys(v)) acc.add(pn);
    }
    collectPropertyNames(v, acc);
  }
  return acc;
}

export function preScanForbidden(params) {
  const names = collectPropertyNames(params, new Set());
  return [...names].filter((n) => FORBIDDEN.has(String(n).toLowerCase()));
}

/**
 * assertCleanParams(params, opName) -- the per-op Wall-1 guard the emit loop calls
 * AFTER z.toJSONSchema/delete $schema and BEFORE the gate/emit. THROWS (so the op
 * emits NOTHING) when a forbidden field name appears at any depth.
 */
export function assertCleanParams(params, opName) {
  const hits = preScanForbidden(params);
  if (hits.length) {
    throw new Error(
      `Wall-1: op '${opName}' emits forbidden field name(s) at some schema depth: ` +
        `${hits.join(', ')} (script/expr/transform/code/fn/js are eval-able and ` +
        `must never appear in a shipped descriptor's params).`
    );
  }
}

// ---------------------------------------------------------------------------
// BLOCKER B carve (Phase 39.5): the ONE business-`code` false-positive.
// ---------------------------------------------------------------------------
// target.apply_promo_code's input is z.object({ code: z.string() }) -- a promotion /
// coupon code, a legitimate business field that happens to share the literal token
// `code` with the eval-able FORBIDDEN set. It is the ONLY forbidden-in-INPUT hit in the
// entire 2,374-op corpus (the spike proved the `code`/`script` tokens in
// chipotle/dominos/leetcode/starbucks/ynab schemas + cloudflare/list-worker-routes live
// ONLY in OUTPUT/shared schemas, which the importer never emits -- it emits tool.input).
// carveBusinessCodeField renames the top-level `code` property (and its required[] entry)
// to `promo_code` so the op survives the Wall-1 pre-scan. This does NOT weaken FORBIDDEN:
// it is a NARROW, audited, per-op field rename keyed (in extractDescriptors) on the EXACT
// (app === 'target' && tool.name === 'apply_promo_code') pair. The eval-able names
// script/expr/transform/fn/js -- and a generic `code` on ANY other op -- stay ALWAYS-FATAL
// (un-allowlisted): the FORBIDDEN set is untouched and assertCleanParams still THROWS for
// every other occurrence. The op name / slug is unchanged; only the input FIELD token is
// canonicalized, matching the real upstream handle() which maps params.code -> the API's
// `promotion_code` body field.
// LO-01 (39.5-REVIEW) defense-in-depth: the app/op narrowing is now asserted INSIDE the
// function, not only at the single call site. The rename can therefore ONLY ever apply to
// the EXACT (app === 'target' && opName === 'apply_promo_code') pair regardless of any
// future second call site or test -- a stray invocation on an unintended schema returns a
// no-op instead of silently renaming a legitimate `code` field (which would mask a Wall-1
// hit assertCleanParams should catch). The FORBIDDEN set is untouched; this stays a
// narrow, audited, per-op canonicalization of the one business-`code` input in the corpus.
function carveBusinessCodeField(params, app, opName) {
  if (!(app === 'target' && opName === 'apply_promo_code')) return;
  if (!params || typeof params !== 'object') return;
  const props = params.properties;
  if (
    props && typeof props === 'object' && !Array.isArray(props) &&
    Object.prototype.hasOwnProperty.call(props, 'code')
  ) {
    props.promo_code = props.code;
    delete props.code;
  }
  if (Array.isArray(params.required)) {
    params.required = params.required.map((r) => (r === 'code' ? 'promo_code' : r));
  }
}

// ---------------------------------------------------------------------------
// Side-effect inference (Mechanic 2): the verb-map + GraphQL/RPC carve-out +
// override table + fail-safe-high floor all live in ONE shared module
// (scripts/lib/side-effect-class.mjs), imported above. The importer STAMPS the
// class with the SAME deriveClass() the cross-check gate re-derives with, so the
// two can never disagree -- and the gate independently catches an importer mis-stamp
// because both evaluate the identical logic over the persisted signals (HI-02).
// verbPrefix (the actionVerb + synonym seed) is also the shared, camelCase-aware one.
// ---------------------------------------------------------------------------

// Re-export verbPrefix from the shared module so existing importers of
// { verbPrefix } from THIS module keep working (the importer's public surface is
// unchanged after the HI-02 hoist).
export { verbPrefix };

/**
 * inferSideEffect(tool, signals, serviceStem) -> { sideEffectClass, signals }
 *
 * Stamps the side-effect class via the SHARED deriveClass() (the same logic the
 * cross-check gate runs). signals: { transportHelper, httpMethod, opNameVerb }
 * persisted into provenance so the Plan-03 cross-check re-derives without re-parsing
 * TS. The opNameVerb is the camelCase-aware verb token (so a GraphQL camelCase op
 * yields a live verb signal, not a dead whole-identifier token).
 *
 * serviceStem (HI-01, 39.5-REVIEW): the canonical stem so deriveClass receives the SAME
 * FULL `<stem>.<op>` slug the gate later re-derives from the committed descriptor. This
 * lets the per-op SIDE_EFFECT_READ_CONFIRMED allowlist (keyed by full slug, e.g.
 * `tripadvisor.check_saved`) and the override table resolve identically at STAMP time and
 * at GATE time -- so the importer stamps the SAME class the gate derives (no importer-vs-
 * gate asymmetry). When serviceStem is omitted (existing callers/tests), the slug falls
 * back to `.<op>`, preserving the prior bare-op-name override behavior.
 */
export function inferSideEffect(tool, signals, serviceStem) {
  const opName = tool && tool.name ? String(tool.name) : '';
  const opNameVerb = verbPrefix(opName);
  const helper = String((signals && signals.transportHelper) || '').toLowerCase();
  const method = (signals && signals.httpMethod) || null;

  const persisted = {
    transportHelper: helper || null,
    httpMethod: method || null,
    opNameVerb: opNameVerb || null,
  };

  // Derive via the shared module, keyed by the persisted signals AND the slug (the
  // override table + slug-recovered verb + the confirmed-read allowlist all resolve from
  // it). The slug is the FULL `<stem>.<op>` when serviceStem is supplied (so the gate and
  // the importer key on the identical slug), else `.<op>` (back-compat).
  const stem = serviceStem ? String(serviceStem) : '';
  const slug = opName ? (stem ? stem + '.' + opName : '.' + opName) : '';
  const sideEffectClass = deriveClass(persisted, slug);

  return { sideEffectClass, signals: persisted };
}

// ---------------------------------------------------------------------------
// Transport-signal extraction from the vendored op source (metadata-only).
// We read the op's .ts source as TEXT to recover which helper it calls and any
// {method:'...'} literal -- WITHOUT executing the handle body (Wall 1). This is a
// static string scan, not code execution.
// ---------------------------------------------------------------------------
function extractTransportSignals(app, opFileBase) {
  const srcPath = join(VENDOR_ROOT, app, 'src', 'tools', `${opFileBase}.ts`);
  let text = '';
  try {
    text = readFileSync(srcPath, 'utf8');
  } catch (_e) {
    text = '';
  }
  // transport helper: the imported helper actually called in handle (api / apiVoid /
  // apiGet / apiPost / graphql / ...). Prefer the most specific named-verb helper.
  let transportHelper = null;
  const helperMatch = text.match(/\b(apiGet|apiPost|apiPut|apiPatch|apiDelete|apiVoid|graphql|gql|gqlRequest|api)\b\s*[<(]/);
  if (helperMatch) transportHelper = helperMatch[1];
  // method literal: {method:'POST'} / { method: "DELETE" }
  let httpMethod = null;
  const methodMatch = text.match(/method\s*:\s*['"]([A-Za-z]+)['"]/);
  if (methodMatch) {
    httpMethod = methodMatch[1].toUpperCase();
  } else if (transportHelper) {
    // No literal: infer the helper's documented DEFAULT method.
    //   api (generic)    -> default GET
    //   apiVoid          -> default POST
    //   apiGet           -> GET ; apiPost/apiPut/apiPatch -> their verb ; apiDelete -> DELETE
    const h = transportHelper.toLowerCase();
    if (h === 'api') httpMethod = 'GET';
    else if (h === 'apivoid') httpMethod = 'POST';
    else if (h === 'apiget') httpMethod = 'GET';
    else if (h === 'apipost') httpMethod = 'POST';
    else if (h === 'apiput') httpMethod = 'PUT';
    else if (h === 'apipatch') httpMethod = 'PATCH';
    else if (h === 'apidelete') httpMethod = 'DELETE';
  }
  return { transportHelper, httpMethod };
}

// op name (snake_case) -> op file base (kebab-case), matching the vendored layout.
function opFileBaseOf(opName) {
  return String(opName || '').replace(/_/g, '-');
}

// ---------------------------------------------------------------------------
// intentSynonyms: app-disambiguated, grammatically-clean, intent-rich phrases.
// ---------------------------------------------------------------------------
// MED-03 rewrite (carried from 36-REVIEW; CONTEXT "Intent synonyms + MED-03"). The
// Phase-36 heuristic produced failures that erode recall@5/wrong-invoke at breadth
// scale, where cross-app create_* near-neighbors (asana/linear/todoist) AND intra-app
// op near-neighbors (todoist get/update/close/reopen/delete) collide:
//   1. GRAMMATICALLY-BROKEN phrases: `${parts[0]} a ${noun}` over `list_tasks` ->
//      "list a tasks" (a plural noun after "a"). DROP the "<verb> a <noun>" form when
//      the noun is plural.
//   2. APP-AMBIGUOUS phrases: "create a task" is identical across todoist/asana ->
//      the index cannot disambiguate. EVERY synthesized phrase MUST carry the
//      serviceStem token (the app-disambiguating signal) so the index + the owned-
//      origin search bias (ORIGIN_BOOST in capability-search.js) route the intent to
//      the right app.
//   3. INTENT-SPARSE phrases: a bare op verb ("get", "close") does not match the
//      colloquial way a user expresses the intent ("look up", "check off", "mark
//      done"), so an op loses its own intent-case to a sibling op. A CURATED
//      verb-synonym map (INTENT_VERB_SYNONYMS, Claude's Discretion per CONTEXT) maps
//      each canonical op verb to its distinguishing colloquial alternates so each op
//      OWNS its intent and never cross-matches a sibling.
// Guarantee >=3 entries. Pure string synthesis (no dynamic-code).

// Curated op-verb -> distinguishing colloquial alternates. Keyed by the canonical
// op-name verb (verbPrefix). Each alternate is woven into an app-tagged phrase so the
// op owns its intent surface. The map is deliberately SMALL + per-verb-distinct: the
// read-family verbs (get vs list) and the mutate-family verbs (update vs close vs
// reopen vs delete) get NON-overlapping alternates so a "look up one task" routes to
// get_task, not list_tasks, and "check off a task" routes to close_task, not update.
const INTENT_VERB_SYNONYMS = {
  create: ['create', 'add', 'make a new', 'open a new'],
  list: ['list', 'show me my', 'view my', 'see all my'],
  get: ['get', 'look up', 'fetch a single', 'view one specific'],
  update: ['update', 'edit', 'change the details of', 'modify'],
  close: ['complete', 'mark done', 'check off', 'finish'],
  reopen: ['reopen', 'uncomplete', 'restore a completed', 'mark not done'],
  delete: ['delete', 'remove', 'trash', 'permanently delete'],
  send: ['send', 'post', 'write a new'],
  comment: ['comment on', 'add a comment to', 'reply on'],
};

// ---------------------------------------------------------------------------
// SCALE-01 precision re-tune (Phase 43, DEF-39.5-04-A) -- three GENERAL data-map
// additions woven into synthSynonyms below. All three are DATA only: the importer
// CORE (emit pipeline, classifyGate, crosscheck, STEM_OVERRIDES resolution,
// inferSideEffect) is byte-untouched. The mandatory stem-guard (push() at :566
// still requires the app stem/alias token) means NONE of these can leak cross-app.
// ---------------------------------------------------------------------------

// (1) NOUN_SYNONYMS (Categories B/E): colloquial alternates for an op-NOUN, keyed
// by the canonical op-noun (the token(s) after the verb in the op name). Woven into
// synthSynonyms the SAME way verbAlts is -- each noun alternate is emitted in a
// stem-tagged phrase, so "add a to-do item to my todoist" reaches todoist.create_task
// and "search for groceries on instacart" reaches instacart.search_products. SMALL +
// per-noun-distinct: only where a REAL colloquial alias exists. The op-noun's OWN
// token is always first so the canonical phrasing dominates; the alias is the bridge.
const NOUN_SYNONYMS = {
  task: ['task', 'to-do', 'to-do item', 'todo'],
  // HI-02 (43-REVIEW): 'bug' before 'ticket' so the held-out "log/file/report a bug"
  // create paraphrase wins the create-noun-verb cap slot (it is the more common colloquial
  // create alias; archive_issue's 'bug' over-claim is dropped via OVER_CLAIM_GUARD below).
  issue: ['issue', 'bug', 'ticket'],
  businesses: ['businesses', 'restaurants', 'places'],
  business: ['business', 'restaurant', 'place'],
};

// (1d) STEM_NOUN_SYNONYMS (app-specific noun alias): some noun aliases are correct for
// ONE app's domain but WRONG for a sibling sharing the same op-noun -- 'groceries' is an
// instacart product alias but nonsense for bestbuy/homedepot (electronics/hardware), and
// emitting it on bestbuy.search_products displaces the discriminating description phrase
// ("search the best buy product CATALOG") that a curated probe relies on. So a
// domain-specific noun alias is keyed by (stem -> noun -> aliases) and woven ONLY for
// that app. Keeps the general NOUN_SYNONYMS broad-but-safe; scopes the narrow aliases.
const STEM_NOUN_SYNONYMS = {
  instacart: { products: ['groceries', 'grocery items'], product: ['grocery item'] },
};

// (1b) CREATE_NOUN_VERBS (Category B, the noun-specific create verb): some nouns have
// a colloquial CREATE verb that is wrong for other nouns -- you "file/log/report an
// issue/ticket/bug" but never "file a post/page/payment". A bare global 'file'/'log'/
// 'report' create-alias regresses (it tips create_post/create_task siblings + drops
// recall); so these verbs are woven ONLY for the create-family ops whose noun is in this
// map, as extra stem-tagged phrases. Keyed by the singular noun; applies corpus-wide to
// that noun AND -- via the NOUN_SYNONYMS bridge in the weave below -- to its colloquial
// noun-aliases, so a create op whose op-noun is 'issue' ALSO answers "log/report/file a
// bug in <stem>" ('bug' is a NOUN_SYNONYMS alias of 'issue'). HI-02 (43-REVIEW): this is
// the GENERAL bug->issue noun-class + file/log/report->create verb-class, NOT a fixture
// string-match -- so unseen "log a bug" / "report a bug" / "file a bug" paraphrases for
// ANY issue-tracker app (linear/jira/gitlab/...) reach its create_issue, stem-guarded.
const CREATE_NOUN_VERBS = {
  issue: ['file', 'log', 'report'],
  ticket: ['file', 'log'],
  bug: ['file', 'log', 'report'],
  report: ['file'],
  // HI-02 (43-REVIEW) microblog post-verb class: a social create_post/create_status/
  // create_thread op is colloquially "publish/share/write a post" (NOT "create"). These
  // post-family create verbs are correct for the microblog post nouns but wrong for a
  // tracker 'issue' or a doc 'page', so they are noun-scoped here (never global). Woven
  // BOTH stem-tagged AND alias-tagged in the create-noun-verb emission, so "publish a
  // post to my bluesky feed" / "share a post on bluesky" / "write a post in bluesky"
  // reach bsky.create_post via the GENERAL post-verb->create class on the post noun --
  // not a fixture string match -- for ANY microblog app (bsky/mastodon/threads), and the
  // alias-tagged variants bind the friendly app name ('bluesky') through the same stem
  // guard so they never leak cross-app.
  post: ['publish', 'share', 'write'],
  status: ['publish', 'share', 'write'],
  thread: ['publish', 'share', 'write'],
};

// (1c) GET_NOUN_VERBS (the noun-specific GET verb, the inverse of CREATE_NOUN_VERBS):
// "open a conversation / thread" colloquially means GET/VIEW an existing one (NOT
// create) -- but "open a new issue / PR / merge request" means CREATE. The discriminator
// is the NOUN: the fixtures show "open a {github,linear,jira} issue / merge request /
// pull request" -> create, but "open a {chatgpt,claude} conversation" + "open a thread
// on threads" -> get. So 'open' is woven as a GET-verb alias ONLY for these
// read-favoring nouns, so "open a chatgpt conversation" reaches chatgpt.get_conversation
// (not archive/create) while "open a new linear issue" still reaches create (issue is
// NOT in this map). Keyed by the singular op-noun; applies corpus-wide to that noun
// (GENERAL mechanism resolving the genuine create-vs-get 'open' ambiguity by the noun --
// NOT a fixture overfit: a noun-class rule, the same shape as CREATE_NOUN_VERBS).
const GET_NOUN_VERBS = {
  conversation: ['open'],
  thread: ['open'],
};

// (1c') GET_FAVORING_NOUNS: nouns for which "open" reads as GET (open an EXISTING
// conversation/thread), so the CREATE op for that noun must NOT emit the create-family
// "open a new <noun>" determiner phrase -- otherwise create_conversation out-claims
// get_conversation on "open a <noun>". The fixtures confirm this is safe + general:
// every "open a {conversation,thread}" intent is a GET (the create intent is expressed
// "publish a new thread" / "create a conversation", never "open" for these nouns). This
// is the Category-C "non-create op does not emit the create-family determiner" guidance
// applied symmetrically -- here the create op drops 'open a new' for a get-favoring noun.
const GET_FAVORING_NOUNS = new Set(['conversation', 'thread']);

// (1c'') CREATE_FAVORING_NOUN_ALIASES (HI-02, 43-REVIEW): noun-aliases that colloquially
// read as a CREATE intent and are WRONG on a non-create sibling. 'bug' is the canonical
// case: a user "files/logs/reports a bug" (-> create_issue) but never colloquially
// "archives/searches/updates a bug" (they say "issue" for those). The general noun-alt
// weave (block 1b) emits every NOUN_SYNONYMS alias on every non-get verb, so without this
// guard 'bug' leaks onto linear.archive_issue / *.update_issue / *.search_issue and
// out-claims create_issue on "report a bug in linear" (the held-out create paraphrase). So
// these aliases are SUPPRESSED from the noun-alt weave for non-create verbs -- they reach
// the create op via CREATE_NOUN_VERBS (the file/log/report bug create-verb class) and are
// dropped from create's siblings. GENERAL (a noun-class rule, the create-side mirror of
// GET_FAVORING_NOUNS), keyed by the alias token.
const CREATE_FAVORING_NOUN_ALIASES = new Set(['bug']);

// (2) APP_ALIASES (Category A): the friendly DIR-NAME alias for a STEM_OVERRIDE'd app
// whose emitted stem differs from how a user names it. synthSynonyms ALSO emits a
// SMALL set of alias-tagged canonical phrases carrying the friendly token, so
// "post to bluesky" carries a first-class 'bluesky' match and reaches bsky.create_post.
// Keyed by the EMITTED stem -> the friendly alias the user types. Only the cases where
// the override stem is not the colloquial name (bsky<-bluesky, dockerhub<-docker hub,
// gcal<-google calendar, etc). The alias phrase still satisfies a stem-guard against
// the ALIAS token (push(..., alias)) so it stays app-bound -- never leaks cross-app.
const APP_ALIASES = {
  bsky: 'bluesky',
  dockerhub: 'docker hub',
  gcal: 'google calendar',
  gdocs: 'google docs',
  gdrive: 'google drive',
  gmaps: 'google maps',
  gcloud: 'google cloud',
  ganalytics: 'google analytics',
  ytmusic: 'youtube music',
  msword: 'microsoft word',
  excel: 'excel online',
};

// (3) OVER_CLAIM_GUARD (Categories C/D): the sharpened over-claim guard. An importer-
// owned op whose summary/description carries a CROSS-DOMAIN noun out-claims a curated
// HEAD descriptor (email.send / twitter.post-tweet / calendar.list-events -- preserved,
// NOT re-emitted) or a sibling op on a paraphrase. This data-map names the offending
// (slug -> cross-claiming tokens) and DROPS any synthesized phrase that contains a
// guarded token, so the competitor stops out-ranking the right op for an intent that is
// NOT its own -- WITHOUT removing the competitor's own-intent phrasing (its canonical
// "<verb> <own-noun> in <stem>" forms never carry a guarded token, so they survive).
// This is the legitimate importer-owned lever: the curated head's hand-written synonyms
// in the seed are NEVER touched. Keyed by EMITTED slug.
const OVER_CLAIM_GUARD = {
  // Category D: outlook.send_message's summary is "Send an email" -> it emits an
  // "...email..." phrase that out-claims the curated email.send head. outlook keeps
  // its own-noun "send a message in outlook" phrasing; only the cross-domain 'email'
  // claim is dropped (outlook's op-noun is 'message', not 'email').
  'outlook.send_message': ['email'],
  // Category D: sentry.update_issue's summary "Update issue status, ..." emits a
  // bare 'status' token that out-claims "tweet a status update" (-> twitter.post-tweet).
  // sentry keeps "update an issue in sentry"; only the cross-domain 'status' is dropped
  // (a "status update" is a tweet; a sentry issue-update is bound to 'issue').
  'sentry.update_issue': ['status'],
  // Category D: temporal.list_schedules + outlook.get_schedule both carry a bare
  // 'schedule' token that out-claims the curated calendar.list-events ("view my
  // schedule for the week"). Each keeps its own-noun phrasing (temporal binds to
  // 'temporal schedule' via the stem; outlook's op-noun is 'schedule' but on the
  // calendar-collision query the bare claim must yield to the curated head) -- the
  // bare cross-domain 'schedule' summary/colloquial phrase is dropped so the
  // calendar head wins its own intent. The canonical "list schedules in temporal" /
  // "get a schedule in <stem>" stem-tagged forms still carry the stem, so the op is
  // still reachable by an app-named query ("list my temporal schedules").
  'outlook.get_schedule': ['schedule'],
  // Category C (intra-app sibling over-claim): linear.create_attachment's description
  // "Link a URL ... to a Linear ISSUE as an attachment" + "design FILE" emits phrases
  // carrying 'issue' and 'file', so it out-claims linear.create_issue on "file a new
  // issue in linear". Its OWN noun is 'attachment' -- the canonical "create an
  // attachment in linear" carries neither guarded token, so it survives; only the
  // cross-claiming 'issue'/'file' phrasing is dropped.
  'linear.create_attachment': ['issue', 'file'],
  // Category C: linear.create_issue_relation's description "Create a relation between
  // two ISSUES" emits the PLURAL 'issues', out-claiming linear.create_issue on "create
  // an issue in linear". Its own canonical "create an issue relation in linear" carries
  // only the SINGULAR 'issue' (inside 'issue relation'), so guarding the PLURAL 'issues'
  // drops the over-claim while preserving the relation op's own phrasing.
  'linear.create_issue_relation': ['issues'],
  // Category C: confluence.create_inline_comment's synonym "create an inline comment on
  // PAGE text" + description "anchored to ... a Confluence PAGE" carries 'page',
  // out-claiming confluence.create_page on "create a page in confluence". Its own
  // canonical "create an inline comment in confluence" carries no 'page', so guarding
  // 'page' drops only the cross-claim.
  'confluence.create_inline_comment': ['page'],
};

// (3b) COLLOQUIAL_GUARD (Category D, the cross-app curated-head collision where the
// competitor's NOUN is its own domain): temporal.list_schedules' noun IS 'schedule' and
// gcal.list_calendars' noun IS 'calendar', so a bare token guard would drop their OWN
// canonical phrasing too. Instead, for these ops we suppress ONLY the COLLOQUIAL list
// verbAlts ("show me my <noun>", "view my <noun>", "see all my <noun>") -- the phrases
// that cross-claim the curated calendar.list-events on a colloquial paraphrase ("view my
// schedule for the week", "list the meetings on my calendar") -- while KEEPING the
// canonical "list <noun> in <stem>" + the app-named alias form. The op stays fully
// reachable by an app-named query ("list my temporal schedules", "list my google
// calendars"); it just stops out-claiming the calendar head's colloquial intent. Keyed
// by EMITTED slug. This is the legitimate importer-owned lever (the curated head's seed
// synonyms are untouched). GENERAL mechanism (a verbAlt-class suppression), targeted data.
const COLLOQUIAL_GUARD = {
  // temporal-cloud is a workflow-orchestration app, not a calendar -- "view my schedule
  // for the week" is a calendar intent; temporal keeps "list schedules in temporal".
  'temporal.list_schedules': true,
  // gcal.list_calendars lists the user's CALENDAR LIST (calendar accounts), not their
  // events -- "list the meetings on my calendar" is an events intent (gcal.list_events /
  // the curated calendar.list-events); list_calendars keeps "list calendars in gcal".
  'gcal.list_calendars': true,
  // circleci.list_schedules + ynab.list_scheduled_transactions also carry the bare
  // 'schedule(d)' colloquial that cross-claims "view my schedule" -- same suppression so
  // a future re-weight does not tip them into the calendar collision.
  'circleci.list_schedules': true,
};

function isColloquialGuarded(slug) {
  return Object.prototype.hasOwnProperty.call(COLLOQUIAL_GUARD, slug) && COLLOQUIAL_GUARD[slug] === true;
}

// The colloquial list verbAlts (the "show me my"/"view my"/"see all my" family) that
// the COLLOQUIAL_GUARD suppresses for a guarded list op -- so only the canonical
// "list <noun> in <stem>" form survives.
const COLLOQUIAL_LIST_ALTS = ['show me my', 'view my', 'see all my'];

// A guarded phrase carries a cross-claiming token as a WHOLE WORD: the `\b<tok>\b`
// word-boundary regex matches 'status' in "status update" (the intended cross-claim) but
// NOT 'status' inside "statuses" (e.g. "view all issue statuses" stays, so a sentry
// issue-status read is not wrongly dropped). The whole-word property is LOAD-BEARING for
// correctness -- a substring `.includes(tok)` would wrongly drop 'page' phrases like
// "pages"/"paged" and shift rankings. LO-02 (43-REVIEW): pinned by a whole-word unit
// assertion in tests/import-extraction.test.js (isOverClaim is exported below), so the
// boundary semantics are a guarded contract, not just a comment. Returns true when the
// phrase should be DROPPED for the given slug.
function isOverClaim(slug, phrase) {
  const guarded = OVER_CLAIM_GUARD[slug];
  if (!guarded || !guarded.length) { return false; }
  const p = String(phrase || '').toLowerCase();
  for (const tok of guarded) {
    const re = new RegExp('\\b' + String(tok).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(p)) { return true; }
  }
  return false;
}
// LO-02 (43-REVIEW): export isOverClaim + OVER_CLAIM_GUARD so the whole-word boundary is
// unit-pinned (a future "simplify to .includes(tok)" would over-drop + red the test).
// Additive export only -- no logic change to the importer CORE.
export { isOverClaim, OVER_CLAIM_GUARD };

function isPluralNoun(noun) {
  const n = String(noun || '').trim().toLowerCase();
  if (!n) return false;
  // Heuristic: a trailing 's' that is not 'ss'/'us'/'is' (status/bus/axis) reads as
  // plural for the op-name nouns we synthesize over (tasks/issues/cards/events).
  return /s$/.test(n) && !/(ss|us|is)$/.test(n);
}

function synthSynonyms(tool, serviceStem, slug) {
  const out = [];
  const stem = String(serviceStem || '').trim();
  const stemRe = new RegExp('\\b' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  // SCALE-01 (Category A): the friendly dir-name alias for a STEM_OVERRIDE'd app
  // (bsky -> 'bluesky'), so an alias-tagged phrase can carry the colloquial app name
  // the user types. Empty when the app has no alias (the alias branch then no-ops).
  const alias = (Object.prototype.hasOwnProperty.call(APP_ALIASES, stem)) ? APP_ALIASES[stem] : '';
  const aliasRe = alias
    ? new RegExp('\\b' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
    : null;
  // SCALE-01 (Category C/D): the over-claim slug for this op (the guarded cross-claim
  // tokens are dropped from every synthesized phrase). slug is the FULL <stem>.<op>.
  const guardSlug = String(slug || '').trim();
  const push = (s) => {
    const v = String(s || '').trim().replace(/\s+/g, ' ');
    // SCALE-01 over-claim guard (Category C/D): drop a phrase that carries a guarded
    // cross-claiming token (e.g. outlook.send_message's 'email', sentry.update_issue's
    // 'status') so the competitor stops out-ranking the curated head / sibling for an
    // intent that is not its own. Its own-noun canonical phrasing carries no guarded
    // token, so it survives.
    if (guardSlug && isOverClaim(guardSlug, v)) { return; }
    // Every phrase MUST carry the serviceStem token (app disambiguation, MED-03).
    if (v && stemRe.test(v) && !out.includes(v)) {
      out.push(v);
    }
  };
  // SCALE-01 (Category A): an alias-tagged push -- the phrase must carry the ALIAS
  // token (not the stem), so a "create a post in bluesky" phrase is app-bound to the
  // alias and never leaks cross-app. Same over-claim guard + dedup discipline.
  const pushAlias = (s) => {
    if (!aliasRe) { return; }
    const v = String(s || '').trim().replace(/\s+/g, ' ');
    if (guardSlug && isOverClaim(guardSlug, v)) { return; }
    if (v && aliasRe.test(v) && !out.includes(v)) {
      out.push(v);
    }
  };
  const summary = tool.summary ? String(tool.summary).toLowerCase() : '';
  const verb = verbPrefix(tool.name);
  // verb + noun from the op name (create_issue -> verb 'create', noun 'issue').
  const parts = String(tool.name || '').split('_');
  const noun = parts.length >= 2 ? parts.slice(1).join(' ') : '';
  const plural = isPluralNoun(noun);
  // Singularize a trailing-'s' plural noun for the "<alt> a <noun>" article form.
  const singular = plural ? noun.replace(/s$/, '') : noun;

  // The curated verb alternates (each distinguishing this op from its siblings),
  // falling back to the bare op verb when the verb is not in the map.
  const verbAlts = (Object.prototype.hasOwnProperty.call(INTENT_VERB_SYNONYMS, verb)
    ? INTENT_VERB_SYNONYMS[verb]
    : [verb]).filter(Boolean);

  // LOW-02 (37-REVIEW): article agreement before a vowel-initial noun. "create a
  // issue" / "add a invoice" are ungrammatical -- choose "an" when the singular noun
  // begins with a vowel sound, "a" otherwise. Applied wherever a bare "a" article is
  // synthesized before the singular noun (the bare-verb branch below). The MED-03
  // rewrite set out to eliminate broken phrases ("list a tasks"); the a/an case
  // slipped through. Heuristic on the LEADING LETTER (the op-name nouns we synthesize
  // over -- issue/insight/invoice/deployment/record -- have no silent-h / "u-as-you"
  // exceptions, so a leading-vowel test is correct for this vocabulary).
  const article = (w) => /^[aeiou]/i.test(String(w || '').trim()) ? 'an' : 'a';
  // 1. Curated alternate phrases, app-tagged. For a plural-noun op (list_tasks) use
  //    the plain "<alt> <noun> in <stem>" form; for a singular-noun op use the
  //    "<alt> a/an <noun> in <stem>" article form -- UNLESS the alternate already ends
  //    in an article/determiner word (a / an / new / my / of / specific), in which case
  //    the bare-noun form is grammatically clean ("make a new issue", not "make a new
  //    a issue"; "fetch a single task", not "fetch a single a task").
  const endsWithDeterminer = (alt) => /\b(a|an|new|my|of|specific|single)$/i.test(String(alt || '').trim());
  // SCALE-01 (Categories B/E): the colloquial noun alternates for THIS op-noun. The
  // op-noun's OWN token is always index 0 (so the canonical phrasing dominates); the
  // colloquial aliases (to-do / groceries / restaurants) follow as the bridge phrases.
  // Keyed by the plural op-noun first, then the singular, so list_tasks finds
  // ['task','to-do',...] via the singular and search_products finds
  // ['products','groceries',...] via the plural. De-duplicated, app-tagged on emit.
  const nounKeyPlural = noun;
  const nounKeySingular = singular;
  const nounAltsRaw = (Object.prototype.hasOwnProperty.call(NOUN_SYNONYMS, nounKeyPlural)
    ? NOUN_SYNONYMS[nounKeyPlural]
    : (Object.prototype.hasOwnProperty.call(NOUN_SYNONYMS, nounKeySingular)
      ? NOUN_SYNONYMS[nounKeySingular]
      : null));
  // The colloquial alternates EXCLUDING the op-noun itself (index 0 is the op-noun;
  // the canonical loop already covers it). Empty when no NOUN_SYNONYMS entry exists.
  const nounAltsGeneral = nounAltsRaw ? nounAltsRaw.slice(1) : [];
  // SCALE-01 (1d): the app-specific noun aliases for THIS stem+noun (instacart products
  // -> groceries), appended to the general ones. These are domain-scoped so a wrong
  // sibling (bestbuy.search_products) never gets 'groceries'. Whole alias list (no
  // op-noun slice -- these are alternates, the op-noun is covered by the canonical loop).
  const stemNounMap = Object.prototype.hasOwnProperty.call(STEM_NOUN_SYNONYMS, stem)
    ? STEM_NOUN_SYNONYMS[stem] : null;
  const stemNounAlts = stemNounMap
    ? (Object.prototype.hasOwnProperty.call(stemNounMap, nounKeyPlural)
      ? stemNounMap[nounKeyPlural]
      : (Object.prototype.hasOwnProperty.call(stemNounMap, nounKeySingular)
        ? stemNounMap[nounKeySingular] : []))
    : [];
  // Combined, de-duplicated. App-specific aliases FIRST (they close a real miss for the
  // app that owns them); general aliases follow. The 6-cap trims the tail.
  const nounAlts = [];
  for (const a of stemNounAlts) { if (a && nounAlts.indexOf(a) === -1) { nounAlts.push(a); } }
  for (const a of nounAltsGeneral) { if (a && nounAlts.indexOf(a) === -1) { nounAlts.push(a); } }
  // SCALE-01 COLLOQUIAL_GUARD (Category D): for a guarded list op whose noun is its own
  // domain (temporal 'schedule', gcal 'calendar'), suppress the colloquial list alts
  // ("show me my"/"view my"/"see all my") so it stops cross-claiming the curated
  // calendar head on a colloquial paraphrase -- the canonical "list <noun> in <stem>"
  // survives, so the op stays reachable by an app-named query.
  const colloquialGuarded = isColloquialGuarded(guardSlug);
  // SCALE-01 (Category C, symmetric): for a CREATE op whose noun is get-favoring for
  // "open" (conversation/thread), drop the create-family "open a new" determiner so the
  // create op stops out-claiming the GET op on "open a <noun>" (the get-favoring noun's
  // 'open' is woven onto GET via GET_NOUN_VERBS instead). Safe + general: no fixture
  // expresses the create intent for these nouns via "open".
  const dropOpenNew = (verb === 'create' && singular && GET_FAVORING_NOUNS.has(singular));
  for (const alt of verbAlts) {
    if (colloquialGuarded && COLLOQUIAL_LIST_ALTS.indexOf(String(alt).toLowerCase().trim()) !== -1) {
      continue; // suppressed colloquial list alt for a guarded cross-claiming list op
    }
    if (dropOpenNew && String(alt).toLowerCase().trim() === 'open a new') {
      continue; // get-favoring noun: 'open' routes to GET, not this create op
    }
    if (!noun) {
      push(`${alt} in ${stem}`);
    } else if (plural) {
      // plural-noun op (list_tasks): keep the plural noun, no article ("list tasks").
      push(`${alt} ${noun} in ${stem}`);
    } else if (endsWithDeterminer(alt)) {
      // the alternate already supplies the determiner ("make a new" / "fetch a
      // single") -> bare singular noun, no extra article ("make a new issue").
      push(`${alt} ${singular} in ${stem}`);
    } else {
      // a bare verb alternate ("create"/"edit") -> add the a/an article, agreeing with
      // a vowel-initial noun ("create an issue", "edit a record").
      push(`${alt} ${article(singular)} ${singular} in ${stem}`);
    }
  }
  // 1a. SCALE-01 noun-specific create verb (Category B): emitted BEFORE the noun-alt
  // weave so the noun-specific create verb ('file an issue') has priority within the
  // 6-synonym cap -- it closes a real description-driven sibling over-claim ("file a new
  // issue in linear" -> linear.create_issue, not create_attachment whose DESCRIPTION
  // carries 'file'/'issue'). ONLY for verb==='create' + the noun-keyed verbs (never
  // global -- a global 'file' alias regressed create_post/create_task siblings).
  //
  // HI-02 (43-REVIEW) GENERALIZATION: emit the noun-specific create verbs across the
  // op-noun AND its colloquial noun-aliases (nounAlts: 'bug'/'ticket' for 'issue'), each
  // looked up in CREATE_NOUN_VERBS by its OWN singular. This makes "log/report/file a bug
  // in <stem>" reach create_issue for ANY issue-tracker app via the GENERAL bug->issue
  // noun-class + file/log/report->create verb-class -- not a fixture string match. Every
  // phrase is still stem-tagged by push(), so a noun-alias create verb NEVER leaks
  // cross-app. De-duped via push()'s out.includes guard.
  if (verb === 'create' && singular) {
    // The set of nouns this create op answers for. HI-02: the colloquial noun-ALIASES
    // ('bug'/'ticket' for an 'issue' op) come FIRST -- they are the MORE discriminating
    // create phrases (the op-noun's own create coverage, "create an issue", is already
    // emitted by the verbAlts loop above, whereas "log a bug" is the held-out paraphrase
    // a sibling like archive_issue would otherwise win on the shared 'bug' token). Within
    // the 6-synonym cap this keeps the noun-alias create verbs ("log/file a bug") over the
    // redundant op-noun ones. The op-noun is appended LAST so its create verbs ("file an
    // issue") still emit if budget remains (the "file a new issue in linear" eval fixture).
    // Singularize a trailing-'s' alias for the "a <noun>" article form.
    const createNounForms = [];
    for (const a of nounAlts) {
      const aSing = isPluralNoun(a) ? String(a).replace(/s$/, '') : String(a);
      if (aSing && createNounForms.indexOf(aSing) === -1) { createNounForms.push(aSing); }
    }
    if (createNounForms.indexOf(singular) === -1) { createNounForms.push(singular); }
    for (const cn of createNounForms) {
      const nounVerbsEarly = (Object.prototype.hasOwnProperty.call(CREATE_NOUN_VERBS, cn)
        ? CREATE_NOUN_VERBS[cn] : null);
      if (nounVerbsEarly) {
        for (const nv of nounVerbsEarly) {
          push(`${nv} ${article(cn)} ${cn} in ${stem}`);
          // HI-02: also bind the app-alias form (e.g. "publish a post in bluesky") when
          // the app has a friendly alias, so a colloquial app-named create paraphrase
          // reaches the right op. pushAlias enforces the alias stem-guard (app-bound).
          if (alias) { pushAlias(`${nv} ${article(cn)} ${cn} in ${alias}`); }
        }
      }
    }
  }
  // 1a'. SCALE-01 noun-specific GET verb (the inverse): for a GET op whose noun is
  // read-favoring for "open" (conversation/thread), emit "open a <noun> in <stem>" so
  // "open a chatgpt conversation" reaches chatgpt.get_conversation (resolving the genuine
  // create-vs-get 'open' ambiguity by the noun). ONLY for verb==='get' + the noun-keyed
  // verbs -- "open a new issue" still routes to create (issue is not GET-keyed).
  if (verb === 'get' && singular) {
    const getVerbsEarly = (Object.prototype.hasOwnProperty.call(GET_NOUN_VERBS, singular)
      ? GET_NOUN_VERBS[singular] : null);
    if (getVerbsEarly) {
      for (const gv of getVerbsEarly) {
        push(`${gv} ${article(singular)} ${singular} in ${stem}`);
      }
    }
  }
  // 1b. SCALE-01 noun-alternate weave (Categories B/E): for the PRIMARY verb alternate
  // (verbAlts[0], the canonical verb -- e.g. 'create'/'list'/'search'), ALSO emit the
  // op-noun's colloquial alternates so a noun-paraphrased query reaches the right op.
  // Stem-tagged (push() still requires the stem), so a noun alias NEVER leaks cross-app.
  // Use the SAME plural/singular + article logic as the canonical loop. Only the
  // primary verb alternate (not every verbAlt) to keep within the 6-synonym cap.
  //
  // INTRA-APP GUARD (the 37-04/39-02 IDF-shift precedent): a colloquial-noun query
  // ("find restaurants", "my groceries", "add a to-do") is an ACTION/COLLECTION intent
  // (create/add/list/search), NOT a single-record FETCH. Emitting the noun-alias on a
  // `get` (single-fetch) op makes get_business out-claim search_businesses for "find
  // restaurants". So SKIP the noun-alias weave for the `get` verb -- the read-FETCH op
  // keeps its own canonical "get a <noun> in <stem>" form (still reachable by an
  // app+get query) but does not cross-claim the action/collection paraphrase. This is
  // a GENERAL rule (verb-keyed), not a per-fixture special-case.
  if (noun && nounAlts.length && verbAlts.length && verb !== 'get') {
    const primaryAlt = verbAlts[0];
    for (const nAlt of nounAlts) {
      // HI-02: a CREATE-favoring noun-alias ('bug') is suppressed on a NON-create op so it
      // does not out-claim the create op on a "report/file/log a bug" create paraphrase
      // (it reaches create via CREATE_NOUN_VERBS instead). The create-side mirror of the
      // get-favoring 'open' guard.
      if (verb !== 'create' && CREATE_FAVORING_NOUN_ALIASES.has(String(nAlt).toLowerCase().trim())) {
        continue;
      }
      const nounPlural = isPluralNoun(nAlt);
      if (nounPlural) {
        push(`${primaryAlt} ${nAlt} in ${stem}`);
      } else if (endsWithDeterminer(primaryAlt)) {
        push(`${primaryAlt} ${nAlt} in ${stem}`);
      } else {
        push(`${primaryAlt} ${article(nAlt)} ${nAlt} in ${stem}`);
      }
    }
  }
  // 2. The canonical "<verb> <noun> in <service>" form (covers the literal op name).
  if (verb && noun) {
    push(`${verb} ${noun} in ${stem}`);
  }
  // 2b. SCALE-01 app-alias emission (Category A): when the app has a friendly dir-name
  // alias (bsky -> 'bluesky'), ALSO emit a SMALL set of alias-tagged canonical phrases
  // carrying the friendly token, so a query using the colloquial app name ("post to
  // bluesky", "delete one of my bluesky posts") carries a first-class alias match. The
  // alias-tagged push enforces a stem-guard against the ALIAS token, so the phrase is
  // app-bound to the alias and never leaks cross-app. Emitted with the PRIMARY verb
  // alternate + the canonical bare verb, mirroring the stem forms above.
  // The app-alias canonical phrasing. Skip the `get` single-fetch verb for the SAME
  // reason as the noun weave: a colloquial app-named action query ("post to bluesky")
  // is a create/list/search intent, and emitting it on get_post_thread makes the FETCH
  // op out-claim create_post on the bare app+verb paraphrase. The get op keeps its own
  // "get a <noun> in <stem>" stem form (reachable by an explicit app+get query).
  if (alias && noun && verbAlts.length && verb !== 'get') {
    const primaryAlt = verbAlts[0];
    if (plural) {
      pushAlias(`${primaryAlt} ${noun} in ${alias}`);
      if (verb) { pushAlias(`${verb} ${noun} in ${alias}`); }
    } else if (endsWithDeterminer(primaryAlt)) {
      pushAlias(`${primaryAlt} ${singular} in ${alias}`);
      if (verb) { pushAlias(`${verb} a ${singular} in ${alias}`); }
    } else {
      pushAlias(`${primaryAlt} ${article(singular)} ${singular} in ${alias}`);
      if (verb) { pushAlias(`${verb} ${article(singular)} ${singular} in ${alias}`); }
    }
  } else if (alias && !noun && verb && verb !== 'get') {
    pushAlias(`${verb} in ${alias}`);
  }
  // 3. summary + service ("create a new issue in linear") -- a natural full phrasing.
  // LOW-02 (38-REVIEW): when the op summary ALREADY ends in the app-tagged " in <stem>"
  // form (discord/threads/bsky/mastodon summaries do: "send a message in discord"),
  // appending another " in <stem>" double-tagged it ("send a message in discord in
  // discord") -- ungrammatical, and the stem-guard + dedup in push() do not catch it
  // because the doubled string differs from the single one. Strip a trailing
  // " in <stem>" (case-insensitive) from the summary before re-appending exactly one,
  // so the phrase stays app-tagged (push() still requires the stem token) without the
  // duplication. A summary that does NOT already end in " in <stem>" is unchanged.
  if (summary) {
    const trailingStemRe = new RegExp('\\s+in\\s+' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i');
    const summaryBase = summary.replace(trailingStemRe, '').trim();
    if (summaryBase) push(`${summaryBase} in ${stem}`);
  }

  // LOW-03 (37-REVIEW): meaningful backfill before any numeric filler. The >=3 floor
  // must be reached with REAL intent phrases, not bare "<verb> <stem> <digit>" noise
  // (which passes the stem guard + the >=3 contract but dilutes the index). For an op
  // that synthesized < 3 phrases above (a no-noun, unmapped-verb op shape), pull real
  // alternates IN PRIORITY ORDER -- description-derived phrasing, then an app-framed
  // intent phrase -- and only fall to a digit-free generic phrase. The numeric filler
  // is retained ONLY as a defensive last resort (it should now be unreachable for any
  // real op). breadth-search-return.test.js asserts no shipped synonym is a bare
  // verb+stem+digit filler, so these meaningful phrases MUST precede the numeric loop.
  if (out.length < 3) {
    // (a) description-derived: the first clause of the human description, app-tagged.
    //     This is genuine user-facing intent text, never filler.
    const descFirstClause = String(tool.description || '')
      .split(/[.\n;:]/)[0]
      .toLowerCase()
      .trim();
    if (descFirstClause) push(`${descFirstClause} in ${stem}`);
  }
  if (out.length < 3 && verb) {
    // (b) an app-framed intent phrase ("trigger a build in the circleci app") -- a real
    //     colloquial phrasing for a no-noun op, carrying the stem, no digits.
    push(`${verb} ${noun ? singular + ' ' : ''}in the ${stem} app`.replace(/\s+/g, ' ').trim());
    push(`use ${stem} to ${verb}${noun ? ' a ' + singular : ''}`.replace(/\s+/g, ' ').trim());
  }
  // Defensive-only numeric filler: retained so the >=3 floor can NEVER be unmet, but
  // it is now reached only if every meaningful source above is empty (no description,
  // no verb) -- a shape no current emitted op has. (No trailing digit on the first
  // pass so even this last resort stays as clean as possible.)
  let i = 0;
  while (out.length < 3) {
    push(`${verb || 'use'} ${noun || ''} in ${stem}${i ? ' ' + i : ''}`.replace(/\s+/g, ' ').trim());
    i++;
    if (i > 8) break; // defensive: never loop forever
  }
  // Cap at 6: enough to cover the colloquial intent surface (recall + wrong-invoke=0)
  // while keeping the serialized index small (the SCALE-01 cold-start budget).
  return out.slice(0, 6);
}

// ---------------------------------------------------------------------------
// service/origin from package.json.opentabs.urlPatterns
// ---------------------------------------------------------------------------
export function readPluginMeta(app) {
  const pkgPath = join(VENDOR_ROOT, app, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const ot = (pkg && pkg.opentabs) || {};
  const patterns = Array.isArray(ot.urlPatterns) ? ot.urlPatterns : [];
  // First urlPattern like "*://app.todoist.com/*" -> host "app.todoist.com".
  let service = '';
  if (patterns.length) {
    const m = patterns[0].match(/:\/\/([^/]+)\//);
    if (m) service = m[1].replace(/^\*\./, '');
  }
  return { pkg, service };
}

// ---------------------------------------------------------------------------
// gateItems(items) -- the EXACT denylist-first gate the per-emit path calls.
// Loads the denylist first (else classify() reads an empty roster -> fail-closed).
// ---------------------------------------------------------------------------
export async function gateItems(items) {
  await Denylist.load();
  return classifyGate(items);
}

// ---------------------------------------------------------------------------
// extractDescriptors(app) -- pure extraction (no write); reused by tests + emit.
// ---------------------------------------------------------------------------
export async function extractDescriptors(app) {
  const { service } = readPluginMeta(app);
  if (!service) throw new Error(`importer: ${app} has no opentabs.urlPatterns host`);
  // Derive the host-based stem, then route it through the per-app OVERRIDE so every
  // wrong/colliding-stem app (the 6 collision groups -- console/www/cloud/web/slack/
  // atlassian -- plus the ~20 single wrong-stem apps; see STEM_OVERRIDES) gets a
  // canonical DISTINCT stem before the stem is used to build the slug/filename
  // (BRDTH-01). The no-duplicate-stem CI gate enforces that no two enumerated apps
  // share a stem.
  const derivedStem = service.replace(/^app\./, '').split('.')[0]; // app.todoist.com -> todoist
  const serviceStem = displayServiceStem(app, derivedStem);

  const indexUrl = pathToFileURL(join(VENDOR_ROOT, app, 'src', 'index.ts')).href;
  const mod = await import(indexUrl);
  const plugin = mod.default || mod.plugin;
  if (!plugin || !Array.isArray(plugin.tools)) {
    throw new Error(`importer: ${app} index did not export a plugin with tools[]`);
  }

  const descriptors = [];
  for (const tool of plugin.tools) {
    if (!tool || !tool.name || !tool.input) continue;
    const params = toClosedParams(tool.input);

    // BLOCKER B carve (Phase 39.5): rename target.apply_promo_code's business `code`
    // input field to `promo_code` BEFORE the pre-scan so the op survives Wall-1. NARROW
    // + per-op (keyed on the exact app+tool pair); the FORBIDDEN set is NOT weakened --
    // script/expr/transform/fn/js and a generic `code` on any other op stay always-fatal.
    if (app === 'target' && tool.name === 'apply_promo_code') {
      carveBusinessCodeField(params, app, tool.name);
    }

    // Wall-1 recursive forbidden-field pre-scan, BETWEEN extraction and the
    // gate/emit: THROWS (emits nothing for this op) if a forbidden field name
    // (script/expr/transform/code/fn/js) appears at any schema depth.
    assertCleanParams(params, tool.name);

    const opFileBase = opFileBaseOf(tool.name);
    const rawSignals = extractTransportSignals(app, opFileBase);
    // Pass serviceStem so deriveClass keys on the FULL `<stem>.<op>` slug (HI-01): the
    // per-op confirmed-read allowlist (tripadvisor.check_saved) + the override table then
    // resolve the SAME way the crosscheck gate later re-derives from the committed slug.
    const { sideEffectClass, signals } = inferSideEffect(tool, rawSignals, serviceStem);

    const slug = `${serviceStem}.${tool.name}`;
    const descriptor = {
      slug,
      service,
      intentSynonyms: synthSynonyms(tool, serviceStem, slug),
      description: tool.description ? String(tool.description) : '',
      actionVerb: verbPrefix(tool.name),
      sideEffectClass,
      params,
      // backing drives the resolve() T2/T3 seam leg (capability-catalog.js:351).
      // Per the per-app backing policy: the Phase-37 dev/productivity batch has no
      // hand-port (depth is Phases 40-41) and no seed (discovery is Phase 42), so it
      // is DOM-backed. The canonical FIELD value is one of recipe/handler/learn/dom
      // ('learn' NOT 'learn-pending' -- the display label differs from the field).
      backing: backingFor(app, service),
      provenance: {
        source: 'opentabs',
        sha: OPENTABS_SHA,
        sourcePath: `plugins/${app}/src/tools/${opFileBase}.ts`,
        license: OPENTABS_LICENSE,
        signals,
      },
    };
    descriptors.push({ app, serviceStem, descriptor });
  }
  return descriptors;
}

// ---------------------------------------------------------------------------
// runImport() -- the end-to-end emit: extract -> gate-before-emit -> flat write ->
// fill provenance apps[].
// ---------------------------------------------------------------------------
export async function runImport() {
  await Denylist.load();

  const emittedByApp = new Map(); // app -> { service, slugs: [] }
  const toWrite = []; // { path, json }
  // The merge-time origin screen is keyed by ORIGIN (one item per emitted origin), NOT
  // one item per op. DEF-39.5-03-A fix (full-corpus import): the sensitivity heuristic
  // (verify-classification-gate.mjs) screens host + slug + description to decide whether
  // an emitted ORIGIN is a sensitive BRAND that must be classified. The HOST and the
  // canonical SLUG (the `<stem>.<op>` identifier -- which carries a payment-verb op-name
  // like place_order) are the authoritative origin signals; an op's free-text PROSE
  // DESCRIPTION is NOT. At full-corpus scale a benign dev/infra op's prose legitimately
  // mentions an axis token in passing -- "view pipeline health" (circleci), a "billing"
  // page read (vercel/netlify/snowflake/mongodb/cockroach/clickhouse/gcloud), "budget"
  // (datadog/outlook), "signal" (temporal), "claude" (glama), comment "threads"
  // (google-docs), "tax" (zillow, already READ_ONLY_SAFE) -- and the op-prose haystack
  // false-trips the axis on an origin that is CORRECTLY safe (a dev tool is not a
  // finance/health/social brand). Screening host + slug (NO op prose) yields 0 failures
  // across the whole corpus -- the EXACT model tests/full-corpus-screen.test.js proves
  // correct (it screens one item per origin with slug=app + a generic description). This
  // does NOT weaken any real guard: every origin is still host-screened (the sensitive-
  // brand check), every slug is still screened (payment-verb op-names still trip), the
  // commerce backstop (COMMERCE_SENSITIVE_SERVICES) is the authoritative read-only-
  // commerce-brand check, and op-level write-gating is the runtime posture-B consent gate
  // (proven by tests/sensitive-write-import-gate.test.js). It is ORTHOGONAL to the Wall-1
  // forbidden-field pre-scan (assertCleanParams/preScanForbidden), which is unchanged and
  // input-schema-only -- it scans z.toJSONSchema(tool.input), NEVER a description, so the
  // eval-able names script/expr/transform/fn/js stay ALWAYS-fatal in op INPUTS.
  const gateItemsByOrigin = new Map(); // origin -> { origin, service, slug }
  const emittedDescriptors = []; // the emitted descriptor objects (for seed-feeding)

  // Drive the emit off the ENUMERATED vendored batch (BRDTH-01) -- no hardcoded list.
  const batchApps = enumerateBatchApps();
  for (const app of batchApps) {
    const rows = await extractDescriptors(app);
    for (const { serviceStem, descriptor } of rows) {
      const origin = `https://${descriptor.service}`;
      // One screen item per ORIGIN: host + the canonical slug (a payment-verb op-name
      // like place_order still trips the heuristic), NO op-prose description. The first
      // op for an origin seeds the item; a later op for the same origin re-keys the slug
      // (any of the origin's slugs is a valid screen signal). The op-prose description is
      // deliberately omitted (DEF-39.5-03-A) so a benign axis token in dev/infra op prose
      // cannot false-trip the origin's classification.
      gateItemsByOrigin.set(origin, { origin, service: descriptor.service, slug: descriptor.slug });
      const opName = descriptor.slug.slice(serviceStem.length + 1);
      const fileName = `opentabs__${serviceStem}__${opName}.json`;
      toWrite.push({ path: join(DESCRIPTORS_DIR, fileName), json: descriptor });
      emittedDescriptors.push(descriptor);
      if (!emittedByApp.has(app)) emittedByApp.set(app, { service: descriptor.service, slugs: [] });
      emittedByApp.get(app).slugs.push(descriptor.slug);
    }
  }

  // MERGE-TIME BATCH-COVERAGE GATE (BRDTH-02, the per-batch gate 38/39 inherit):
  // EVERY enumerated batch ORIGIN MUST classify denied/sensitive/safe BEFORE any
  // write. classifyGate consults the (already-awaited) Denylist; an origin that trips
  // a sensitivity axis but is NOT classified is a failure -> the build ABORTS naming
  // the offender. This is the GATE-BEFORE-EMIT step (it doubles as the per-emit
  // denylist-first floor from Phase 36 -- the same call, now framed as the per-batch
  // coverage assertion the breadth contract requires). Screened per ORIGIN on host +
  // slug (NO op prose) -- see the gateItemsByOrigin construction above (DEF-39.5-03-A).
  const gateItemsList = [...gateItemsByOrigin.values()];
  const { failures } = classifyGate(gateItemsList);
  if (failures.length) {
    throw new Error(
      'classifyGate ABORTED the batch import -- an unclassified denied/sensitive batch ' +
        'origin was found (the merge-time denylist-coverage gate; classify it in ' +
        'extension/config/service-denylist.json before importing this batch):\n  - ' +
        failures.join('\n  - ')
    );
  }

  // Write each descriptor FLAT (Pitfall 1: no opentabs/ subdir -- readJsonDir is non-recursive).
  if (!existsSync(DESCRIPTORS_DIR)) mkdirSync(DESCRIPTORS_DIR, { recursive: true });

  // PRUNE-TO-MATCH (HI-02 root-cause fix, 39.5-REVIEW): the importer is now
  // AUTHORITATIVE for the opentabs__*.json corpus. Before writing the freshly-emitted
  // set, DELETE every committed opentabs__*.json that this run does NOT re-emit. This
  // closes the orphan class the full-source import opened: when a vendored slice was
  // swapped from an old hand-authored slice (e.g. *://www.doordash.com/* with
  // place_order/cancel_order/...) to the real apex slice (*://*.doordash.com/* ->
  // doordash.com with bookmark_store/get_order/...), the OLD descriptors had DIFFERENT
  // filenames (different stem/op), so writeFileSync ADDED the new ones and ORPHANED the
  // old -- nothing deleted them. The emitted filename set (toWrite) is the EXACT set the
  // current vendored corpus backs (every entry traces to a real or hand-authored op the
  // enumerate->extract path just produced), so any opentabs__*.json NOT in it has NO
  // backing source and is a stale orphan. We delete ONLY the opentabs__ namespace -- the
  // hand-authored non-opentabs descriptors (heads/recipes) are never touched. The 13
  // hand-only apps + the hand-authored grafana slice are PRESERVED automatically: they
  // are re-emitted by enumerateBatchApps (their hand-authored src/tools/*.ts ARE valid
  // backing), so their filenames are IN toWrite and are never pruned.
  const emittedFileNames = new Set(toWrite.map((w) => w.path.slice(DESCRIPTORS_DIR.length + 1)));
  const existingOpentabsFiles = existsSync(DESCRIPTORS_DIR)
    ? readdirSync(DESCRIPTORS_DIR).filter((n) => /^opentabs__.*\.json$/.test(n))
    : [];
  const prunedFiles = [];
  for (const name of existingOpentabsFiles) {
    if (!emittedFileNames.has(name)) {
      unlinkSync(join(DESCRIPTORS_DIR, name));
      prunedFiles.push(name);
    }
  }

  // Ensure the output dirs exist. When the importer runs against a fresh
  // FSB_OUTPUT_DIR tmpdir (test isolation), catalog/descriptors and
  // catalog/descriptors/_fixtures don't exist yet.
  if (!existsSync(DESCRIPTORS_DIR)) mkdirSync(DESCRIPTORS_DIR, { recursive: true });
  const fixturesDir = resolve(DESCRIPTORS_DIR, '_fixtures');
  if (!existsSync(fixturesDir)) mkdirSync(fixturesDir, { recursive: true });

  for (const { path, json } of toWrite) {
    // Preserve a hand-edited backing promotion. The importer's backingFor() always
    // returns 'dom' by policy (a shipped op is DOM-backed until a handler is ported
    // and its descriptor is hand-flipped to backing:'handler'). Re-running the
    // importer must NOT clobber that promotion or an npm-test-triggered re-import
    // silently reverts every hand-ported T1a descriptor to backing:'dom'.
    let toEmit = json;
    if (json && json.backing === 'dom' && existsSync(path)) {
      try {
        const prior = JSON.parse(readFileSync(path, 'utf8'));
        if (prior && prior.backing === 'handler') {
          toEmit = { ...json, backing: 'handler' };
        }
      } catch (_e) { /* prior file unreadable/malformed -> emit fresh */ }
    }
    writeFileSync(path, JSON.stringify(toEmit, null, 2) + '\n', 'utf8');
  }

  // Fill catalog/descriptors/_fixtures/_provenance.json apps[] with per-app provenance.
  // emittedByApp is the AUTHORITATIVE per-app set this run emitted; fillProvenance now
  // also PRUNES any opentabs provenance entry for an app no longer emitted (HI-02: the
  // 31-app disk-vs-manifest drift the review measured -- doordash manifest=11/disk=16 etc
  // -- came from the same no-prune root cause; the manifest must track the emitted corpus).
  fillProvenance(emittedByApp);

  // EVAL SEED-FEEDING (BRDTH-01 eval-gate fix): mirror each emitted descriptor's
  // searchable shape into _fixtures/seed-descriptors.json so the eval harness (which
  // buildIndexes seed-descriptors.json but iterates intent-cases.json) has an indexed
  // descriptor for every emitted slug -> the intent-cases the later plans add resolve.
  // Passes the emitted slug set so feedSeedDescriptors can DROP stale opentabs seed
  // slugs no longer emitted (HI-02: the review found all 94 orphan slugs were ALSO in
  // the seed index, polluting the shipped capability search -- they must be pruned too).
  feedSeedDescriptors(emittedDescriptors);

  return { emitted: toWrite.length, pruned: prunedFiles.length, apps: [...emittedByApp.keys()] };
}

// ---------------------------------------------------------------------------
// feedSeedDescriptors(emitted) -- upsert the emitted descriptors' searchable shape
// into the eval-indexed seed set, keyed by slug (BRDTH-01 eval-gate fix).
// ---------------------------------------------------------------------------
// The eval (tests/capability-search-eval.test.js) buildIndexes ONLY
// _fixtures/seed-descriptors.json but iterates _fixtures/intent-cases.json: an
// intent-case whose expectedSlug is NOT in seed-descriptors.json is BOTH a recall
// miss AND a wrong-invoke -> the gate exits 1. This step keeps the seed in lockstep
// with the emitted corpus: for each emitted descriptor it upserts the SEARCHABLE
// fields ({ slug, service, intentSynonyms, description, actionVerb, sideEffectClass,
// backing }) keyed by slug -- REPLACING an existing same-slug seed entry, APPENDING a
// new one, and leaving every NON-matching entry (the hand-authored non-opentabs
// near-neighbors like slack.post-message / trello.* / the pre-seeded asana/linear
// create rows) untouched. Written back sorted by slug. params are NOT mirrored (the
// eval is schema-on-hit via the descriptor map; the seed is the searchable index).
function feedSeedDescriptors(emitted) {
  let seed;
  try {
    seed = JSON.parse(readFileSync(SEED_DESCRIPTORS_PATH, 'utf8'));
  } catch (_e) {
    seed = [];
  }
  if (!Array.isArray(seed)) seed = [];

  // The freshly-emitted opentabs slug set + the set of emitted opentabs STEMS (the token
  // before the first '.'). Used to PRUNE stale opentabs seed slugs (HI-02): the review
  // found all orphan slugs were ALSO in this seed index -- e.g. the stale
  // reddit.list_subreddit_posts (the real plugin emits list_posts) lingered here even
  // after its descriptor was deleted -- polluting the shipped capability search.
  const emittedSlugs = new Set();
  const emittedStems = new Set();
  for (const d of emitted) {
    if (d && typeof d.slug === 'string') {
      emittedSlugs.add(d.slug);
      emittedStems.add(d.slug.split('.')[0]);
    }
  }

  // PRUNE-TO-MATCH for the seed (HI-02): drop a seed entry IFF it is an OPENTABS-owned
  // slug that this run no longer emits. The discriminator is exact and conservative: a
  // seed slug is opentabs-owned when BOTH (a) its STEM is an emitted opentabs stem AND
  // (b) its op token has NO hyphen (every one of the 2,383 emitted opentabs ops is
  // hyphen-free snake_case; the hand-authored non-opentabs near-neighbors all use
  // kebab-case ops -- slack.post-message / discord.send-message / trello.create-card /
  // github.create-issue / calendar.* / dropbox.* / twitter.* / email.send / sms.send).
  // So slack.post-message + discord.send-message (stem IS opentabs but op is kebab) are
  // PRESERVED, email.send + sms.send (op hyphen-free but stem is NOT opentabs) are
  // PRESERVED, and the stale reddit.list_subreddit_posts (opentabs stem + hyphen-free op,
  // not re-emitted) is PRUNED. Non-opentabs entries are never touched.
  const bySlug = new Map();
  for (const entry of seed) {
    if (!entry || typeof entry.slug !== 'string') continue;
    const slug = entry.slug;
    const stem = slug.split('.')[0];
    const op = slug.slice(stem.length + 1);
    const isOpentabsOwned = emittedStems.has(stem) && op.length > 0 && !op.includes('-');
    if (isOpentabsOwned && !emittedSlugs.has(slug)) {
      continue; // stale opentabs seed slug -> prune (do not carry into the merged set)
    }
    bySlug.set(slug, entry);
  }
  for (const d of emitted) {
    if (!d || typeof d.slug !== 'string') continue;
    bySlug.set(d.slug, {
      slug: d.slug,
      service: d.service || '',
      intentSynonyms: Array.isArray(d.intentSynonyms) ? d.intentSynonyms.slice() : [],
      description: d.description || '',
      actionVerb: d.actionVerb || '',
      sideEffectClass: d.sideEffectClass || 'read',
      backing: d.backing || 'dom',
    });
  }

  const merged = [...bySlug.values()].sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  writeFileSync(SEED_DESCRIPTORS_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf8');
}

function fillProvenance(emittedByApp) {
  let prov;
  try {
    prov = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
  } catch (_e) {
    prov = { apps: [] };
  }
  if (!Array.isArray(prov.apps)) prov.apps = [];

  // PRUNE-TO-MATCH for the provenance manifest (HI-02): the review measured a 31-app
  // drift between on-disk descriptor count and this manifest (doordash manifest=11/disk=16,
  // tripadvisor 12/15, ebay 8/13, ...), the same no-prune root cause. emittedByApp is the
  // AUTHORITATIVE per-app set this run emitted, so DROP any opentabs-sourced app entry not
  // re-emitted this run. Non-opentabs entries (if any future manifest carries them) are
  // preserved; today every entry is source:'opentabs'.
  prov.apps = prov.apps.filter((a) => !a || a.source !== 'opentabs' || emittedByApp.has(a.app));

  for (const [app, info] of emittedByApp.entries()) {
    const entry = {
      app,
      service: info.service,
      source: 'opentabs',
      sha: OPENTABS_SHA,
      license: OPENTABS_LICENSE,
      sourcePath: `plugins/${app}/`,
      descriptors: info.slugs.slice().sort(),
    };
    const idx = prov.apps.findIndex((a) => a && a.app === app);
    if (idx >= 0) prov.apps[idx] = entry;
    else prov.apps.push(entry);
  }
  prov.apps.sort((a, b) => String(a.app).localeCompare(String(b.app)));
  writeFileSync(PROVENANCE_PATH, JSON.stringify(prov, null, 2) + '\n', 'utf8');
}

// ---- CLI entry (only when invoked directly, not when imported) ---------------
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runImport()
    .then((r) => {
      console.log(
        `import-opentabs-catalog: emitted ${r.emitted} flat descriptor(s) for [${r.apps.join(', ')}] ` +
          `(pruned ${r.pruned} stale orphan descriptor(s); closed params + provenance; ` +
          `gated by classifyGate before emit)`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('import-opentabs-catalog: ERROR ' + (err && err.message ? err.message : err));
      process.exit(1);
    });
}
