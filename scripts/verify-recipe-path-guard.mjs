#!/usr/bin/env node
/**
 * Phase 26 / Plan 03 (v0.9.99 Native Capability Catalog) -- recipe-path CI guard.
 *
 * Wall-1 "no code fetched as data" enforced at BUILD time, forever. This guard
 * makes future drift that reintroduces dynamic code on the recipe path turn CI
 * red. It is build/CI tooling: it is NOT shipped to the browser and is NOT on
 * the recipe-path allowlist it scans, so it MAY itself use vm/require to load
 * the schema for the fixture check (the allowlist below deliberately excludes
 * this file -- it would otherwise self-flag on its own forbidden-pattern regex
 * literals and on the cfworker IIFE loader).
 *
 * Five checks (D-16 / D-17; Check 5 added Phase 29 / MED-01):
 *   1. ALLOWLIST GREP -- read each of the EXACTLY SIX hardcoded recipe-path
 *      files and fail on any /\beval\s*\(/, /\bnew\s+Function\b/, /\bimport\s*\(/
 *      match. NOT a glob, NOT a whole-extension/ walk (a broad grep would
 *      false-positive on FSB's three SANCTIONED MAIN-world execute_js sites).
 *      The precise word-boundary patterns avoid matching innocent minified
 *      substrings (e.g. "retrieval", "evaluate", "important") in the vendored
 *      libs.
 *   2. FIXTURE RUN -- load the cfworker IIFE so globalThis.CfworkerJsonSchema is
 *      set, require the recipe-schema module, and run validateRecipe over every
 *      JSON fixture in catalog/recipes/_fixtures/: valid-* MUST be accepted
 *      (success === true), reject-* MUST be rejected (success === false). This
 *      is a build-time proof that the closed vocabulary rejects out-of-vocab
 *      recipes (CAP-01/CAP-04), independent of the runtime test suite.
 *   3. NEGATIVE SELF-ASSERTION (D-17) -- assert NONE of the three known
 *      SANCTIONED sites (tool-executor.js, mcp-bridge-client.js,
 *      lattice-runtime-adapter.js) is on the allowlist. These legitimately use
 *      eval / new Function / import in MAIN world (a different trust class) and
 *      must NOT be flagged; this defends against allowlist drift ever adding
 *      one (which would break the build on sanctioned code).
 *   4. ALLOWLIST DRIFT / BYPASS-BY-OMISSION (LO-03) -- enumerate
 *      extension/utils/capability-*.js FROM DISK and fail if any such module is
 *      absent from RECIPE_PATH_ALLOWLIST. Without this, a new capability module
 *      that nobody remembers to add to the hardcoded list is simply never
 *      scanned and could reintroduce dynamic code undetected. The sanctioned
 *      sites live outside utils/, so they do not collide with this glob.
 *   5. HANDLER-DIR DRIFT (MED-01) -- the bundled-head analog of Check 4: enumerate
 *      catalog/handlers/*.js FROM DISK and fail if any handler is absent from
 *      RECIPE_PATH_ALLOWLIST. The credential-bearing T1a handlers (CSRF/xoxc
 *      scrapers) live OUTSIDE extension/utils/, so Check 4 never reached them; this
 *      closes the same bypass-by-omission gap for the head. Tolerates an absent dir.
 *
 * Test-only seam: FSB_RECIPE_GUARD_EXTRA_ALLOWLIST (a comma-separated path
 * list), when set, is appended to the allowlist BEFORE the grep. This exists
 * solely so tests/recipe-path-guard.test.js can point the guard at a temp
 * planted-eval fixture and assert the guard flips non-zero. It is NEVER set in
 * CI or normal operation.
 *
 * Analog: scripts/verify-store-listing.mjs (Node-builtins-only static gate;
 * failures[] accumulator; safeRead; process.exit(1) on fail / exit(0) on pass).
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const failures = [];

function safeRead(path, label) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    failures.push(`${label}: cannot read ${path} (${err.code || err.message})`);
    return null;
  }
}

// ---- The recipe-path file allowlist (D-17) ---------------------------------
//
// EXACTLY the six recipe-path files: the three capability modules + the three
// vendored runtime libs. Hardcoded -- NOT a glob, NOT a directory walk. This
// file (verify-recipe-path-guard.mjs) and the spawn test are intentionally
// ABSENT: they contain the literal forbidden patterns as regex/strings and
// would self-flag.
const RECIPE_PATH_ALLOWLIST = [
  'extension/utils/capability-recipe-schema.js',
  'extension/utils/capability-interpreter.js',
  'extension/utils/capability-auth-strategies.js',
  // Phase 27 (FETCH-01, D-02): registered AHEAD of the file's creation (Plan 02
  // creates capability-fetch.js). Safe -- Check 1 skips a not-yet-existent path
  // (safeRead null -> continue) and Check 4 only FAILS on a DISK file ABSENT from
  // the allowlist, so naming it now keeps the guard green and pre-arms the drift
  // check for when the file lands.
  'extension/utils/capability-fetch.js',
  // Phase 28 (SURF-04, D-04): the MiniSearch index + slug->recipe map module.
  // Added IN THE SAME PLAN that creates the file (Pitfall 5) -- Check 4 enumerates
  // extension/utils/capability-*.js from disk and FAILS CLOSED on any not on this
  // allowlist. The module is kept free of eval/new Function/import even in comments.
  'extension/utils/capability-search.js',
  // Phase 29 (CAT-01, D-01): the origin-biased tiered router + the slug->tier
  // catalog registry. Registered AHEAD of their creation (Plan 02 writes them),
  // the Phase-27/28 "pre-arm in the same milestone" precedent (Pitfall 4): Check 1
  // skips a not-yet-existent path (existsSync pre-check) so the guard stays green
  // now, and Check 4 fails CLOSED the moment either lands not on this allowlist.
  // Both modules are pure dispatch/registry logic kept free of eval/new Function/
  // import even in comments.
  'extension/utils/capability-router.js',
  'extension/utils/capability-catalog.js',
  // Phase 32 (HEAL-02/HEAL-04, D-16): the eval-free recipe-rot classifier
  // (classifyRecipeBroken + validateExpectedShape + the RECIPE_EXPIRED emission)
  // reached from capability-router.js after executeBoundSpec. Named capability-* so
  // Check 4's disk glob AUTO-covers it (Pitfall 5). Pre-armed AHEAD of its Plan-02
  // creation, the Phase-27/28/29/30/31 "register in the same milestone, ahead of
  // the file" precedent: Check 1's existsSync pre-check skips a not-yet-existent
  // path (the file lands in Plan 02) so the guard stays GREEN now, and Check 4 fails
  // CLOSED the moment the file lands NOT on this allowlist. The module is kept free
  // of eval/new Function/import even in comments.
  'extension/utils/capability-rot-detector.js',
  // Phase 29 (CAT-02, MED-01): the three credential-bearing T1a bundled-head
  // handlers. These are the MOST sensitive new code on the recipe path -- they
  // scrape CSRF/xoxc tokens and build credentialed mutation specs -- yet they live
  // under catalog/handlers/ (shipped to extension/catalog/handlers/), OUTSIDE
  // extension/utils/, so Check 4's utils-only glob never scanned them. Listing them
  // here makes Check 1 grep them for eval/new Function/import(); the handler-dir
  // disk-drift check below (the catalog/handlers/ analog of Check 4) fails CLOSED on
  // any new handler nobody adds here. The handlers are eval-free today (verified by
  // grep) -- this closes the guardrail gap on the exact files the charter says must
  // be eval-free-scanned.
  'catalog/handlers/github.js',
  'catalog/handlers/slack.js',
  'catalog/handlers/notion.js',
  // GitLab T1 head (same-origin gitlab.com/api/v4 reads + guarded fail-closed writes).
  // A credential-bearing T1a handler under catalog/handlers/ -- listed so Check 1 greps
  // it for eval/new Function/import() and the handler-dir disk-drift check (which
  // enumerates catalog/handlers/*.js FROM DISK and fails CLOSED on any unlisted handler)
  // stays green. gitlab.js is eval-free (same-origin reads; guarded writes scrape no token).
  'catalog/handlers/gitlab.js',
  'catalog/handlers/netlify.js',
  'catalog/handlers/bitbucket.js',
  'catalog/handlers/jira.js',
  'catalog/handlers/circleci.js',
  'catalog/handlers/vercel.js',
  'catalog/handlers/retool.js',
  'catalog/handlers/asana.js',
  'catalog/handlers/shortcut.js',
  'catalog/handlers/leetcode.js',
  'catalog/handlers/wikipedia.js',
  'catalog/handlers/hackernews.js',
  'catalog/handlers/instagram.js',
  'catalog/handlers/tiktok.js',
  'catalog/handlers/facebook.js',
  'catalog/handlers/reddit.js',
  'catalog/handlers/npm.js',
  'catalog/handlers/yelp.js',
  'catalog/handlers/tripadvisor.js',
  'catalog/handlers/zillow.js',
  'catalog/handlers/redfin.js',
  'catalog/handlers/bsky.js',
  'catalog/handlers/meticulous.js',
  'catalog/handlers/stripe.js',
  'catalog/handlers/coinbase.js',
  'catalog/handlers/x.js',
  'catalog/handlers/stackoverflow.js',
  'catalog/handlers/twilio.js',
  'catalog/handlers/cloudflare.js',
  'catalog/handlers/terraform.js',
  'catalog/handlers/twilio.js',
  'catalog/handlers/tumblr.js',
  'catalog/handlers/priceline.js',
  'catalog/handlers/airbnb.js',
  'catalog/handlers/airtable.js',
  'catalog/handlers/aws.js',
  'catalog/handlers/expedia.js',
  'catalog/handlers/booking.js',
  'catalog/handlers/kayak.js',
  'catalog/handlers/mongodb.js',
  'catalog/handlers/snowflake.js',
  'catalog/handlers/cockroachdb.js',
  'catalog/handlers/clickhouse.js',
  'catalog/handlers/lucid.js',
  'catalog/handlers/clickup.js',
  'catalog/handlers/msword.js',
  'catalog/handlers/excel.js',
  'catalog/handlers/pinterest.js',
  'catalog/handlers/amplitude.js',
  'catalog/handlers/starbucks.js',
  'catalog/handlers/medium.js',
  'catalog/handlers/dominos.js',
  'catalog/handlers/whatsapp.js',
  'catalog/handlers/telegram.js',
  'catalog/handlers/newrelic.js',
  'catalog/handlers/datadog.js',
  'catalog/handlers/chipotle.js',
  'catalog/handlers/pandaexpress.js',
  'catalog/handlers/grubhub.js',
  'catalog/handlers/discord.js',
  'catalog/handlers/target.js',
  'catalog/handlers/walmart.js',
  'catalog/handlers/homedepot.js',
  'catalog/handlers/amazon.js',
  'catalog/handlers/etsy.js',
  'catalog/handlers/costco.js',
  'catalog/handlers/instacart.js',
  'catalog/handlers/uber.js',
  'catalog/handlers/doordash.js',
  'catalog/handlers/hack2hire.js',
  'catalog/handlers/chatgpt.js',
  'catalog/handlers/claude.js',
  'catalog/handlers/gemini.js',
  'catalog/handlers/minimax.js',
  'catalog/handlers/figma.js',
  'catalog/handlers/gdrive.js',
  'catalog/handlers/gsheets.js',
  'catalog/handlers/outlook.js',
  'catalog/handlers/teams.js',
  'catalog/handlers/onenote.js',
  'catalog/handlers/powerpoint.js',
  'catalog/handlers/todoist.js',
  'catalog/handlers/webflow.js',
  'catalog/handlers/ynab.js',
  'catalog/handlers/calendly.js',
  'catalog/handlers/dockerhub.js',
  'catalog/handlers/tinder.js',
  'catalog/handlers/sentry.js',
  'catalog/handlers/supabase.js',
  'catalog/handlers/azure.js',
  'catalog/handlers/notebooklm.js',
  'catalog/handlers/craigslist.js',
  'catalog/handlers/eventbrite.js',
  'catalog/handlers/robinhood.js',
  'catalog/handlers/ticketmaster.js',
  'catalog/handlers/zendesk.js',
  'catalog/handlers/spotify.js',
  'catalog/handlers/twitch.js',
  'catalog/handlers/steam.js',
  'catalog/handlers/fiverr.js',
  'catalog/handlers/glama.js',
  'catalog/handlers/carta.js',
  'catalog/handlers/confluence.js',
  'catalog/handlers/ebay.js',
  'catalog/handlers/fidelity.js',
  'catalog/handlers/ganalytics.js',
  'catalog/handlers/gcal.js',
  'catalog/handlers/gcloud.js',
  'catalog/handlers/gdocs.js',
  'catalog/handlers/gmaps.js',
  'catalog/handlers/grafana.js',
  'catalog/handlers/linear.js',
  'catalog/handlers/linkedin.js',
  'catalog/handlers/lyft.js',
  'catalog/handlers/mastodon.js',
  'catalog/handlers/opentable.js',
  'catalog/handlers/posthog.js',
  'catalog/handlers/shopify.js',
  'catalog/handlers/stubhub.js',
  'catalog/handlers/temporal.js',
  'catalog/handlers/threads.js',
  'catalog/handlers/ubereats.js',
  // Phase 30 (SIGN-01, D-05): the JCS + Ed25519 verify module reached from
  // interpretRecipe. NAMED capability-* so Check 4's disk glob AUTO-covers it
  // (Pitfall 5). Registered AHEAD of its creation (Plan 03 writes it), the
  // "registered ahead of creation; Check 1 skips an absent path, Check 4 fails
  // closed when it lands" precedent -- so the guard stays green now and scans it
  // for dynamic-code constructs the moment it lands.
  'extension/utils/capability-signature.js',
  // Phase 30 (GOV-02, D-02): the per-origin consent store reached at the invoke
  // gate. Does NOT match the capability-* glob, so it MUST be listed explicitly
  // (Pitfall 6) -- Check 1 then scans it for dynamic-code constructs. Registered
  // ahead of creation (Plan 02 writes it); an absent path is skipped without a
  // failure (existsSync pre-check) and Check 4 is not in play for a non-glob name.
  'extension/utils/consent-policy-store.js',
  // Phase 30 (GOV-05, D-09): the append-only redacted audit ring reached at the
  // invoke gate. Does NOT match the capability-* glob, so listed explicitly
  // (Pitfall 6). Registered ahead of creation (Plan 02 writes it); same skip-when-
  // absent semantics as the consent store above.
  'extension/utils/audit-log.js',
  // Phase 30 (GOV-08, D-15): the service-denylist source-of-truth (isDenied +
  // classify). The consent gate reads it IMMEDIATELY ABOVE the interpret path
  // (Pitfall 6), so it is a DEFINITE allowlist entry -- not optional. Does NOT
  // match the capability-* glob, so listed explicitly; Check 1 scans it for
  // dynamic-code constructs. Registered ahead of creation (Plan 03 writes it),
  // cheap insurance matching the gate's position directly above interpretRecipe.
  'extension/utils/service-denylist.js',
  // Phase 31 (LEARN-01, D-12): the synthesizer turns a redacted ObservedCall into a
  // closed-vocab declarative recipe that is then BOUND/REPLAYED through the
  // interpreter -- so it is recipe-path-adjacent and MUST be eval-free-scanned. Does
  // NOT match the capability-* glob, so listed explicitly (Pitfall 6, the Phase-30
  // consent-store/audit-log/service-denylist precedent). Registered AHEAD of creation
  // (a later wave writes it): Check 1's existsSync pre-check skips an absent path
  // without a failure, and Check 4's capability-* disk glob is not in play for a
  // non-glob name -- so the guard stays GREEN now and scans it for eval/new Function/
  // import the moment it lands. The redactor + network-capture modules are NOT listed:
  // they never bind/execute a recipe (they are not recipe-path-adjacent).
  'extension/utils/recipe-synthesizer.js',
  // Phase 31 (LEARN-01, D-13): the per-origin learned-recipe store. A promoted
  // learned recipe is read back by the catalog and BOUND/EXECUTED on the T2 path, so
  // the store sits on the recipe path and MUST be eval-free-scanned. Same non-glob
  // explicit-listing + registered-ahead-of-creation semantics as the synthesizer above.
  'extension/utils/learned-recipe-store.js',
  'extension/lib/cfworker-json-schema.min.js',
  'extension/lib/jmespath.min.js',
  'extension/lib/minisearch.min.js',
];

// ---- The three SANCTIONED execute_js sites that must NOT be on the allowlist
//      (D-17). Verified whole-tree grep: exactly these three legitimately use
//      eval / new Function / import in MAIN world (a different trust class).
const SANCTIONED_SITES = [
  'extension/ai/tool-executor.js',        // eval(jsCode) -- MAIN-world execute_js
  'extension/ws/mcp-bridge-client.js',    // new Function(userCode) -- MAIN-world execute_js
  'extension/ai/lattice-runtime-adapter.js', // import('lattice') in a comment
];

// ---- Forbidden patterns. Precise word-boundary forms so the minified vendored
//      libs do not false-positive on innocent substrings ("retrieval",
//      "evaluate", "evaluation", "important"). ----------------------------------
const FORBIDDEN = [
  { re: /\beval\s*\(/, name: 'eval(' },
  { re: /\bnew\s+Function\b/, name: 'new Function' },
  { re: /\bimport\s*\(/, name: 'import(' },
];

// Test-only seam: append extra paths (comma-separated) before the grep.
const EXTRA = (process.env.FSB_RECIPE_GUARD_EXTRA_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const SCAN_LIST = RECIPE_PATH_ALLOWLIST.concat(EXTRA);

// ---- Check 1: allowlist grep -----------------------------------------------
for (const rel of SCAN_LIST) {
  // EXTRA paths may be absolute (temp dirs); allowlist paths are repo-relative.
  const abs = rel.startsWith('/') ? rel : resolve(ROOT, rel);
  // A recipe-path module may be REGISTERED on the allowlist ahead of its creation
  // (e.g. Phase 27 names extension/utils/capability-fetch.js before Plan 02 writes
  // it) so the disk-drift check (Check 4) is pre-armed and never silently skips a
  // capability module once it lands. An absent file trivially contains no forbidden
  // construct, so skip it here WITHOUT recording a failure (existsSync pre-check --
  // safeRead would otherwise push an ENOENT failure and fail the build). Check 4
  // independently FAILS on any on-disk capability module missing from the allowlist,
  // so this skip cannot mask an unscanned file that actually exists.
  if (!existsSync(abs)) continue;
  const text = safeRead(abs, `recipe-path allowlist (${rel})`);
  if (text === null) continue;
  for (const f of FORBIDDEN) {
    if (f.re.test(text)) {
      failures.push(
        `recipe-path file '${rel}' contains forbidden dynamic-code construct ` +
        `'${f.name}' -- Wall-1 forbids code fetched/executed as data on the ` +
        `recipe path. If this is a sanctioned MAIN-world execute_js site it must ` +
        `NOT be on the recipe-path allowlist.`
      );
    }
  }
}

// ---- Check 2: fixture run (closed-vocabulary rejection proof) ----------------
const CFWORKER_PATH = resolve(ROOT, 'extension/lib/cfworker-json-schema.min.js');
const SCHEMA_MODULE_PATH = resolve(ROOT, 'extension/utils/capability-recipe-schema.js');
const FIXTURE_DIR = resolve(ROOT, 'catalog/recipes/_fixtures');

function classifyFixture(filename) {
  if (/^valid-/.test(filename)) return 'accept';
  if (/^reject-/.test(filename)) return 'reject';
  return null; // unknown naming -> skip (only valid-*/reject-* are fixtures)
}

(function runFixtures() {
  // Load the cfworker IIFE into the global so the schema module's typeof-guarded
  // accessor finds CfworkerJsonSchema (same loader the Plan 01 test uses).
  let cfworkerSrc;
  try {
    cfworkerSrc = readFileSync(CFWORKER_PATH, 'utf8');
  } catch (err) {
    failures.push(`fixture run: cannot read cfworker bundle ${CFWORKER_PATH} (${err.code || err.message})`);
    return;
  }
  try {
    vm.runInThisContext(cfworkerSrc, { filename: CFWORKER_PATH });
  } catch (err) {
    failures.push(`fixture run: failed to evaluate cfworker bundle (${err && err.message ? err.message : err})`);
    return;
  }
  if (typeof globalThis.CfworkerJsonSchema !== 'object' || !globalThis.CfworkerJsonSchema) {
    failures.push('fixture run: globalThis.CfworkerJsonSchema not populated after loading the bundle');
    return;
  }

  let schemaModule;
  try {
    schemaModule = require(SCHEMA_MODULE_PATH);
  } catch (err) {
    failures.push(`fixture run: cannot require recipe-schema module (${err && err.message ? err.message : err})`);
    return;
  }
  if (typeof schemaModule.validateRecipe !== 'function') {
    failures.push('fixture run: recipe-schema module does not export validateRecipe');
    return;
  }

  let files;
  try {
    files = readdirSync(FIXTURE_DIR).filter((n) => n.endsWith('.json'));
  } catch (err) {
    failures.push(`fixture run: cannot read fixture dir ${FIXTURE_DIR} (${err.code || err.message})`);
    return;
  }
  if (files.length === 0) {
    failures.push(`fixture run: no JSON fixtures found in ${FIXTURE_DIR}`);
    return;
  }

  let accepts = 0;
  let rejects = 0;
  for (const name of files) {
    const kind = classifyFixture(name);
    if (!kind) continue;
    let recipe;
    try {
      recipe = JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
    } catch (err) {
      failures.push(`fixture run: '${name}' is not valid JSON (${err.message})`);
      continue;
    }
    let result;
    try {
      result = schemaModule.validateRecipe(recipe);
    } catch (err) {
      failures.push(`fixture run: validateRecipe threw on '${name}' (${err && err.message ? err.message : err})`);
      continue;
    }
    const ok = result && result.success === true;
    if (kind === 'accept') {
      accepts++;
      if (!ok) {
        failures.push(
          `fixture run: accept fixture '${name}' was REJECTED ` +
          `(code ${result && result.code}) -- a valid recipe must validate.`
        );
      }
    } else { // reject
      rejects++;
      if (ok) {
        failures.push(
          `fixture run: reject fixture '${name}' was ACCEPTED -- an ` +
          `out-of-vocabulary / forbidden-field / bad-enum recipe must be rejected ` +
          `(closed-vocabulary proof, CAP-01/CAP-04).`
        );
      }
    }
  }
  if (accepts === 0) failures.push('fixture run: no accept (valid-*) fixtures were exercised');
  if (rejects === 0) failures.push('fixture run: no reject (reject-*) fixtures were exercised');
})();

// ---- Check 3: negative self-assertion (sanctioned sites NOT on allowlist) ----
for (const site of SANCTIONED_SITES) {
  if (RECIPE_PATH_ALLOWLIST.indexOf(site) !== -1) {
    failures.push(
      `allowlist drift: sanctioned execute_js site '${site}' is on the recipe-path ` +
      `allowlist -- it legitimately uses dynamic code in MAIN world (a different ` +
      `trust class) and must NEVER be on the allowlist, or the build breaks on ` +
      `sanctioned code.`
    );
  }
}

// ---- Check 4: allowlist drift / bypass-by-omission (LO-03) ------------------
//
// The hardcoded allowlist's correctness depends on humans remembering to append
// every new capability module to it; a future extension/utils/capability-foo.js
// that introduces eval/new Function/import() would simply not be scanned. Close
// that gap by enumerating extension/utils/capability-*.js FROM DISK and failing
// if any such file is absent from RECIPE_PATH_ALLOWLIST. The three sanctioned
// MAIN-world sites live OUTSIDE utils/ (ai/, ws/), so they cannot collide with
// this glob. Fails closed if the directory cannot be read.
const CAPABILITY_DIR_REL = 'extension/utils';
const CAPABILITY_DIR_ABS = resolve(ROOT, CAPABILITY_DIR_REL);
let capabilityFiles;
try {
  capabilityFiles = readdirSync(CAPABILITY_DIR_ABS)
    .filter((n) => /^capability-.*\.js$/.test(n))
    .map((n) => `${CAPABILITY_DIR_REL}/${n}`);
} catch (err) {
  failures.push(
    `allowlist drift check: cannot read ${CAPABILITY_DIR_REL} ` +
    `(${err.code || err.message}) -- cannot prove the allowlist covers every ` +
    `capability module.`
  );
  capabilityFiles = [];
}
for (const f of capabilityFiles) {
  if (RECIPE_PATH_ALLOWLIST.indexOf(f) === -1) {
    failures.push(
      `allowlist drift: '${f}' exists on disk but is NOT on the recipe-path ` +
      `allowlist -- a capability module that the guard does not scan can ` +
      `reintroduce dynamic code undetected (bypass-by-omission). Add it to ` +
      `RECIPE_PATH_ALLOWLIST.`
    );
  }
}

// ---- Check 5: handler-dir drift (MED-01, the bundled-head analog of Check 4) -
//
// The T1a bundled-head handlers (catalog/handlers/*.js) are credential-bearing
// reviewed CODE on the recipe path -- the charter requires them eval-free-scanned --
// but they live OUTSIDE extension/utils/, so Check 4's utils glob never reaches them.
// Enumerate catalog/handlers/*.js FROM DISK and fail closed on any handler absent
// from RECIPE_PATH_ALLOWLIST, so a NEW token-scraping handler that nobody allowlists
// is never silently unscanned (the same bypass-by-omission Check 4 closes for utils/).
// The directory may not exist before Plan 03 authors the head -- tolerate its absence
// exactly as readJsonDir tolerates an absent recipes/ dir (an absent dir => no
// handlers => nothing to scan, not a failure).
const HANDLER_DIR_REL = 'catalog/handlers';
const HANDLER_DIR_ABS = resolve(ROOT, HANDLER_DIR_REL);
let handlerFiles = [];
if (existsSync(HANDLER_DIR_ABS)) {
  try {
    handlerFiles = readdirSync(HANDLER_DIR_ABS)
      .filter((n) => n.endsWith('.js'))
      .map((n) => `${HANDLER_DIR_REL}/${n}`);
  } catch (err) {
    failures.push(
      `handler drift check: cannot read ${HANDLER_DIR_REL} ` +
      `(${err.code || err.message}) -- cannot prove the allowlist covers every ` +
      `bundled-head handler.`
    );
    handlerFiles = [];
  }
}
for (const f of handlerFiles) {
  if (RECIPE_PATH_ALLOWLIST.indexOf(f) === -1) {
    failures.push(
      `allowlist drift: bundled-head handler '${f}' exists on disk but is NOT on ` +
      `the recipe-path allowlist -- a token-scraping handler the guard does not scan ` +
      `can reintroduce dynamic code undetected (bypass-by-omission). Add it to ` +
      `RECIPE_PATH_ALLOWLIST.`
    );
  }
}

// ---- Exit convention (clone of verify-store-listing.mjs) --------------------
if (failures.length > 0) {
  console.error('verify-recipe-path-guard: FAIL');
  for (const f of failures) {
    console.error('  - ' + f);
  }
  process.exit(1);
}

console.log(
  'verify-recipe-path-guard: PASS (' +
  RECIPE_PATH_ALLOWLIST.length + ' recipe-path files clean, fixtures validated, ' +
  SANCTIONED_SITES.length + ' sanctioned sites excluded, ' +
  capabilityFiles.length + ' on-disk capability modules all on the allowlist, ' +
  handlerFiles.length + ' bundled-head handlers all on the allowlist)'
);
process.exit(0);
