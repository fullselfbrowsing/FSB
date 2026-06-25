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
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
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
const DESCRIPTORS_DIR = resolve(ROOT, 'catalog/descriptors');
const PROVENANCE_PATH = resolve(ROOT, 'catalog/descriptors/_fixtures/_provenance.json');
// The eval-indexed seed set (capability-search-eval.test.js buildIndexes this file
// but iterates intent-cases.json). feedSeedDescriptors() mirrors each emitted
// descriptor's searchable shape here so every intent-case expectedSlug the later
// plans add HAS an indexed descriptor (the eval recall/wrong-invoke gate stays
// satisfiable across 02/03/04). BRDTH-01 eval-gate fix (37-01).
const SEED_DESCRIPTORS_PATH = resolve(ROOT, 'catalog/descriptors/_fixtures/seed-descriptors.json');

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

function enumerateBatchApps() {
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
    // Skip any app whose derived service is an existing head/REGISTRY origin so the
    // importer never clobbers a shipped head descriptor (read the vendored
    // package.json host; a missing/unreadable meta just falls through to import-attempt
    // which throws a clear error later).
    .filter((name) => {
      let service = '';
      try {
        service = readPluginMeta(name).service;
      } catch (_e) {
        service = '';
      }
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
const STEM_OVERRIDES = {
  jira: 'jira', confluence: 'confluence', cloudflare: 'cloudflare', datadog: 'datadog', threads: 'threads',
  doordash: 'doordash', ubereats: 'ubereats', grubhub: 'grubhub', instacart: 'instacart', uber: 'uber', lyft: 'lyft',
  amazon: 'amazon', ebay: 'ebay', etsy: 'etsy', bestbuy: 'bestbuy', costco: 'costco', walmart: 'walmart', target: 'target',
  booking: 'booking', airbnb: 'airbnb', expedia: 'expedia', kayak: 'kayak', opentable: 'opentable',
};

function displayServiceStem(app, derivedStem) {
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
 * inferSideEffect(tool, signals) -> { sideEffectClass, signals }
 *
 * Stamps the side-effect class via the SHARED deriveClass() (the same logic the
 * cross-check gate runs). signals: { transportHelper, httpMethod, opNameVerb }
 * persisted into provenance so the Plan-03 cross-check re-derives without re-parsing
 * TS. The opNameVerb is the camelCase-aware verb token (so a GraphQL camelCase op
 * yields a live verb signal, not a dead whole-identifier token).
 */
export function inferSideEffect(tool, signals) {
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
  // override table + slug-recovered verb both resolve from the op-name). The slug
  // here is `<service>.<op>` so overrideFloor() and the camelCase verb recovery fire.
  const slug = opName ? '.' + opName : '';
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

function isPluralNoun(noun) {
  const n = String(noun || '').trim().toLowerCase();
  if (!n) return false;
  // Heuristic: a trailing 's' that is not 'ss'/'us'/'is' (status/bus/axis) reads as
  // plural for the op-name nouns we synthesize over (tasks/issues/cards/events).
  return /s$/.test(n) && !/(ss|us|is)$/.test(n);
}

function synthSynonyms(tool, serviceStem) {
  const out = [];
  const stem = String(serviceStem || '').trim();
  const stemRe = new RegExp('\\b' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  const push = (s) => {
    const v = String(s || '').trim().replace(/\s+/g, ' ');
    // Every phrase MUST carry the serviceStem token (app disambiguation, MED-03).
    if (v && stemRe.test(v) && !out.includes(v)) {
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
  for (const alt of verbAlts) {
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
  // 2. The canonical "<verb> <noun> in <service>" form (covers the literal op name).
  if (verb && noun) {
    push(`${verb} ${noun} in ${stem}`);
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
function readPluginMeta(app) {
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
  // Derive the host-based stem, then route it through the per-app OVERRIDE so the
  // four collision apps (jira/confluence/cloudflare/datadog) get canonical DISTINCT
  // stems before the stem is used to build the slug/filename (BRDTH-01).
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

    // Wall-1 recursive forbidden-field pre-scan, BETWEEN extraction and the
    // gate/emit: THROWS (emits nothing for this op) if a forbidden field name
    // (script/expr/transform/code/fn/js) appears at any schema depth.
    assertCleanParams(params, tool.name);

    const opFileBase = opFileBaseOf(tool.name);
    const rawSignals = extractTransportSignals(app, opFileBase);
    const { sideEffectClass, signals } = inferSideEffect(tool, rawSignals);

    const slug = `${serviceStem}.${tool.name}`;
    const descriptor = {
      slug,
      service,
      intentSynonyms: synthSynonyms(tool, serviceStem),
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
  const gateItemsList = [];
  const emittedDescriptors = []; // the emitted descriptor objects (for seed-feeding)

  // Drive the emit off the ENUMERATED vendored batch (BRDTH-01) -- no hardcoded list.
  const batchApps = enumerateBatchApps();
  for (const app of batchApps) {
    const rows = await extractDescriptors(app);
    for (const { serviceStem, descriptor } of rows) {
      gateItemsList.push({
        origin: `https://${descriptor.service}`,
        service: descriptor.service,
        slug: descriptor.slug,
        description: descriptor.description,
      });
      const opName = descriptor.slug.slice(serviceStem.length + 1);
      const fileName = `opentabs__${serviceStem}__${opName}.json`;
      toWrite.push({ path: join(DESCRIPTORS_DIR, fileName), json: descriptor });
      emittedDescriptors.push(descriptor);
      if (!emittedByApp.has(app)) emittedByApp.set(app, { service: descriptor.service, slugs: [] });
      emittedByApp.get(app).slugs.push(descriptor.slug);
    }
  }

  // MERGE-TIME BATCH-COVERAGE GATE (BRDTH-02, the per-batch gate 38/39 inherit):
  // EVERY enumerated batch origin MUST classify denied/sensitive/safe BEFORE any
  // write. classifyGate consults the (already-awaited) Denylist; an origin that trips
  // a sensitivity axis but is NOT classified is a failure -> the build ABORTS naming
  // the offender. This is the GATE-BEFORE-EMIT step (it doubles as the per-emit
  // denylist-first floor from Phase 36 -- the same call, now framed as the per-batch
  // coverage assertion the breadth contract requires).
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
  for (const { path, json } of toWrite) {
    writeFileSync(path, JSON.stringify(json, null, 2) + '\n', 'utf8');
  }

  // Fill catalog/descriptors/_fixtures/_provenance.json apps[] with per-app provenance.
  fillProvenance(emittedByApp);

  // EVAL SEED-FEEDING (BRDTH-01 eval-gate fix): mirror each emitted descriptor's
  // searchable shape into _fixtures/seed-descriptors.json so the eval harness (which
  // buildIndexes seed-descriptors.json but iterates intent-cases.json) has an indexed
  // descriptor for every emitted slug -> the intent-cases the later plans add resolve.
  feedSeedDescriptors(emittedDescriptors);

  return { emitted: toWrite.length, apps: [...emittedByApp.keys()] };
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

  const bySlug = new Map();
  for (const entry of seed) {
    if (entry && typeof entry.slug === 'string') bySlug.set(entry.slug, entry);
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
          `(closed params + provenance; gated by classifyGate before emit)`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('import-opentabs-catalog: ERROR ' + (err && err.message ? err.message : err));
      process.exit(1);
    });
}
