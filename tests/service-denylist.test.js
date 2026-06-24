'use strict';

/**
 * Phase 30 plan 01 (v0.9.99 -- GOV-08 + D-14) -- service-denylist RED contract.
 *
 * Wave 0 RED test: extension/utils/service-denylist.js, extension/config/
 * service-denylist.json, and docs/LEGAL.md do NOT exist yet (Plan 03 ships them).
 * Fails loudly today; turns GREEN when Plan 03 lands. NEVER silently passes -- a
 * == 0 assertion is never run over unfiltered/empty data; every check asserts a
 * concrete present value.
 *
 * LOCKED interface (30-01-PLAN.md <interfaces>) -- FsbServiceDenylist is the single
 * source of truth for "is this origin denied/sensitive" (D-14):
 *   isDenied(origin) -> { denied, reason? }
 *   classify(origin) -> { sensitive, denied, reason? }   // denied implies sensitive;
 *     sensitive also true on a seeded banking/primary-email/*.gov match
 *   load() -> Promise<void>   // reads extension/config/service-denylist.json
 *
 * Sampled:
 *   - service-denylist.json has { v, deniedOrigins, sensitiveOrigins, deniedReason }
 *     with a NON-EMPTY conservative seed for BOTH lists,
 *   - isDenied(a-seeded-denied-origin).denied === true,
 *   - classify(a-denied-origin) -> { sensitive:true, denied:true },
 *   - classify(a-seeded-sensitive-not-denied) -> { sensitive:true, denied:false },
 *   - classify('https://github.com') -> { sensitive:false, denied:false },
 *   - the gate returns RECIPE_CONSENT_BLOCKED for a denylisted origin BEFORE any
 *     per-origin policy is consulted (GOV-08, checked-first),
 *   - docs/LEGAL.md exists and contains a retention section + a consent section.
 *
 * Run: node tests/service-denylist.test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const REPO_ROOT = path.resolve(__dirname, '..');
const DENYLIST_JSON = path.join(REPO_ROOT, 'extension', 'config', 'service-denylist.json');
const DENYLIST_MODULE = path.join(REPO_ROOT, 'extension', 'utils', 'service-denylist.js');
const LEGAL_MD = path.join(REPO_ROOT, 'docs', 'LEGAL.md');

function installChromeStorageStub() {
  const store = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        get(keys, cb) {
          const out = {};
          const list = Array.isArray(keys) ? keys : (keys == null ? Array.from(store.keys()) : [keys]);
          for (const k of list) { if (store.has(k)) out[k] = store.get(k); }
          if (typeof cb === 'function') { cb(out); return; }
          return Promise.resolve(out);
        },
        set(obj, cb) {
          for (const k of Object.keys(obj)) { store.set(k, obj[k]); }
          if (typeof cb === 'function') { cb(); return; }
          return Promise.resolve();
        }
      }
    },
    runtime: { lastError: null }
  };
  return store;
}

(async () => {
  console.log('--- GOV-08 + D-14 service denylist (RED until Plan 03) ---');
  installChromeStorageStub();

  // ---- service-denylist.json shape + non-empty seed (Plan 03) ----
  // readFileSync THROWS if the file is absent -> the catch fails loudly (RED).
  const raw = fs.readFileSync(DENYLIST_JSON, 'utf8');
  const json = JSON.parse(raw);
  check(json && json.v === 1, 'service-denylist.json has v:1');
  check(Array.isArray(json.deniedOrigins) && json.deniedOrigins.length > 0,
    'deniedOrigins is a NON-empty array (conservative seed, D-16)');
  check(Array.isArray(json.sensitiveOrigins) && json.sensitiveOrigins.length > 0,
    'sensitiveOrigins is a NON-empty array (D-14 seed)');
  check(typeof json.deniedReason === 'string' && json.deniedReason.length > 0,
    'deniedReason is a non-empty string');

  // ---- the module: load() then isDenied/classify ----
  const Denylist = require(DENYLIST_MODULE);
  check(typeof Denylist.isDenied === 'function', 'exports isDenied');
  check(typeof Denylist.classify === 'function', 'exports classify');
  check(typeof Denylist.load === 'function', 'exports load');
  check(typeof Denylist.isLoaded === 'function', 'exports isLoaded readiness helper');
  await Denylist.load();
  check(Denylist.isLoaded() === true, 'load() marks the denylist ready');

  // A denied origin and a sensitive-but-not-denied origin are picked FROM the
  // on-disk seed so the test tracks whatever conservative seed Plan 03 ships.
  // The seed entries may be glob patterns (e.g. https://*.chase.com); derive a
  // concrete origin from the first denied + first sensitive seed entry.
  function concreteFromPattern(p) {
    // turn https://*.chase.com into https://www.chase.com; leave a bare origin as-is.
    return String(p).replace('*.', 'www.').replace('*', 'www');
  }
  const deniedSeed = concreteFromPattern(json.deniedOrigins[0]);
  // pick a sensitiveOrigins entry that is NOT also in deniedOrigins (so denied:false holds)
  const sensitiveOnlySeedRaw = json.sensitiveOrigins.find((s) => json.deniedOrigins.indexOf(s) === -1) || json.sensitiveOrigins[0];
  const sensitiveSeed = concreteFromPattern(sensitiveOnlySeedRaw);

  check(Denylist.isDenied(deniedSeed).denied === true,
    'isDenied(a seeded denied origin) -> denied true (' + deniedSeed + ')');

  const cDenied = Denylist.classify(deniedSeed);
  check(cDenied && cDenied.sensitive === true && cDenied.denied === true,
    'classify(a denied origin) -> { sensitive:true, denied:true } (denied implies sensitive)');

  const cSensitive = Denylist.classify(sensitiveSeed);
  check(cSensitive && cSensitive.sensitive === true && cSensitive.denied === false,
    'classify(a seeded sensitive-not-denied origin) -> { sensitive:true, denied:false } (' + sensitiveSeed + ')');

  const cSafe = Denylist.classify('https://github.com');
  check(cSafe && cSafe.sensitive === false && cSafe.denied === false,
    "classify('https://github.com') -> { sensitive:false, denied:false } (the D-14 source-of-truth)");

  // ---- the gate returns RECIPE_CONSENT_BLOCKED for a denylisted origin BEFORE
  //      any per-origin policy (GOV-08, checked-first) ----
  // Wire the (Plan-02) consent store + gate. The denylist global is the real
  // FsbServiceDenylist module loaded above. Even if the denied origin were set to
  // Auto, the gate must return BLOCKED because the denylist is consulted first.
  globalThis.FsbServiceDenylist = Denylist;
  const Store = require(path.join(REPO_ROOT, 'extension', 'utils', 'consent-policy-store.js'));
  if (typeof Store._reset === 'function') Store._reset();
  await Store.setOriginMode(deniedSeed, 'auto'); // even Auto must NOT override a denylist

  try { require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-router.js')); } catch (_e) { /* gate global is the assertion */ }
  const Gate = globalThis.FsbConsentGate;
  check(Gate && typeof Gate.evaluate === 'function', 'FsbConsentGate.evaluate exists (Plan 02; RED until then)');
  if (Gate && typeof Gate.evaluate === 'function') {
    const g = await Gate.evaluate({
      origin: deniedSeed, slug: 'some.capability', method: 'GET',
      entry: { tier: 'T1b', sideEffectClass: 'read' }
    });
    check(g && g.decision !== 'allow', 'denylisted origin -> NOT allow (even under Auto)');
    check(g && g.error && g.error.code === 'RECIPE_CONSENT_BLOCKED',
      'denylisted origin -> RECIPE_CONSENT_BLOCKED (checked BEFORE per-origin policy)');
    check(g && (g.decision === 'blocked' || g.consentDecision === 'blocked'),
      "denylisted origin -> decision/consentDecision 'blocked'");

    let gateLoadCalls = 0;
    let gateLoadResolved = false;
    globalThis.FsbServiceDenylist = {
      load() {
        gateLoadCalls++;
        return Promise.resolve().then(() => { gateLoadResolved = true; });
      },
      isDenied(origin) {
        return {
          denied: gateLoadResolved && origin === 'https://startup-race.example.com',
          reason: 'loaded-before-check'
        };
      },
      classify() { return { sensitive: false, denied: false }; }
    };
    await Store.setOriginMode('https://startup-race.example.com', 'auto');
    const race = await Gate.evaluate({
      origin: 'https://startup-race.example.com',
      slug: 'some.capability',
      method: 'GET',
      entry: { tier: 'T1b', sideEffectClass: 'read' }
    });
    check(gateLoadCalls === 1, 'gate awaits denylist.load() before evaluating a present denylist module');
    check(race && race.error && race.error.code === 'RECIPE_CONSENT_BLOCKED',
      'gate blocks using denylist data loaded during evaluation (startup race closed)');
  } else {
    check(false, 'gate absent -- cannot assert the checked-first BLOCKED path (Wave-0 RED)');
  }

  // ---- docs/LEGAL.md exists with retention + consent sections (GOV-08/D-15) ----
  const legal = fs.readFileSync(LEGAL_MD, 'utf8');
  check(/retention/i.test(legal), 'docs/LEGAL.md contains a retention section');
  check(/consent/i.test(legal), 'docs/LEGAL.md contains a consent section');

  // ======================================================================
  // Phase 35 plan 01 (v1.0.0 -- DENY-01/02) -- per-origin roster classify()
  // assertions over the FULL denied + sensitive roster. RED until Plan 35-01
  // Task 2 expands service-denylist.json; the concrete origins below are taken
  // VERBATIM from 35-RESEARCH Q2 (Roster -> Origins), each at OpenTabs' own
  // urlPattern host scope so the EXACT-host forms (digital.fidelity.com,
  // dashboard.stripe.com, music.youtube.com, ...) match only their exact host
  // and never over-broaden to the whole domain. Re-uses the Denylist module +
  // the awaited load() above; no second require/load.
  //
  // Matcher reminder (service-denylist.js _parsePattern, LOCKED): 'https://*.h'
  // = suffix (apex + any subdomain); 'https://h' (no '*') = exact origin.
  // ======================================================================

  // DENY-01 -- categorically prohibited. Each CONCRETE origin must classify
  // denied:true. Brokerage/trading (robinhood/fidelity/carta) + ToS-hostile
  // media/social (netflix/spotify/twitch/steam/youtube-music/tinder/onlyfans).
  const deniedRoster = [
    'https://robinhood.com',             // via https://*.robinhood.com (suffix; apex)
    'https://digital.fidelity.com',      // exact -- NOT *.fidelity.com
    'https://app.carta.com',             // exact
    'https://www.netflix.com',           // via https://*.netflix.com (suffix)
    'https://open.spotify.com',          // exact
    'https://www.twitch.tv',             // via https://*.twitch.tv (suffix)
    'https://store.steampowered.com',    // exact
    'https://music.youtube.com',         // exact -- NOT *.youtube.com (would catch youtube proper)
    'https://www.tinder.com',            // via https://*.tinder.com (suffix)
    'https://www.onlyfans.com'           // via https://*.onlyfans.com (suffix)
  ];
  for (const origin of deniedRoster) {
    const c = Denylist.classify(origin);
    check(c && c.denied === true,
      'DENY-01 denied roster: classify(' + origin + ').denied === true');
  }

  // DENY-02 -- allowed-but-sensitive. Each CONCRETE origin must classify
  // { sensitive:true, denied:false }: payments (stripe/coinbase/twilio),
  // budgeting (ynab), the IG/FB/TikTok/X social set (sensitive NOT denied --
  // reads under Auto, writes mutating-gated by Plan 03), and the messaging set.
  const sensitiveRoster = [
    'https://dashboard.stripe.com',      // exact -- the dashboard origin, NOT api.stripe.com
    'https://www.coinbase.com',          // via https://*.coinbase.com (suffix)
    'https://console.twilio.com',        // exact
    'https://app.ynab.com',              // exact
    'https://www.instagram.com',         // via https://*.instagram.com (suffix)
    'https://www.facebook.com',          // via https://*.facebook.com (suffix)
    'https://www.tiktok.com',            // via https://*.tiktok.com (suffix)
    'https://x.com',                     // via https://*.x.com (suffix; apex)
    'https://web.whatsapp.com',          // exact
    'https://web.telegram.org',          // exact
    'https://www.slack.com',             // via https://*.slack.com (suffix)
    'https://discord.com',               // exact
    'https://teams.microsoft.com'        // exact (one of the three teams origins)
  ];
  for (const origin of sensitiveRoster) {
    const c = Denylist.classify(origin);
    check(c && c.sensitive === true && c.denied === false,
      'DENY-02 sensitive roster: classify(' + origin + ') -> { sensitive:true, denied:false }');
  }

  // Exact-host discrimination (T-35-03 anti-over-broadening proof): the exact
  // forms must NOT collapse to whole-domain wildcards.
  check(Denylist.classify('https://api.stripe.com').sensitive === false,
    "exact-host: classify('https://api.stripe.com').sensitive === false (dashboard.stripe.com did NOT over-broaden to *.stripe.com)");
  check(Denylist.classify('https://www.youtube.com').denied === false,
    "exact-host: classify('https://www.youtube.com').denied === false (music.youtube.com did NOT over-broaden to *.youtube.com)");
  check(Denylist.classify('https://digital.fidelity.com').denied === true,
    "exact-host: classify('https://digital.fidelity.com').denied === true (fidelity is exact digital.fidelity.com only)");

  // Negative controls: fidelity is exact-host, so a different fidelity subdomain
  // is allowed to be non-denied; a benign non-roster origin stays fully clean.
  check(Denylist.classify('https://www.fidelity.com').denied === false,
    "negative control: classify('https://www.fidelity.com').denied === false (only digital.fidelity.com is denied)");
  const cBenign = Denylist.classify('https://github.com');
  check(cBenign && cBenign.sensitive === false && cBenign.denied === false,
    "negative control: a benign non-roster origin (github.com) stays { sensitive:false, denied:false }");

  // Regression guard: the existing FSB seed survived the expansion.
  check(Denylist.classify('https://www.chase.com').denied === true,
    'seed regression: classify(a concrete chase origin) -> denied:true (the FSB seed was not dropped)');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('service-denylist.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
