#!/usr/bin/env node
/**
 * Phase 35 / Plan 02 (v1.0.0 Full App Catalog -- DENY-03) -- fail-closed
 * import-time / CI classification gate.
 *
 * THE TRAP THIS CLOSES: under the shipped opt-out Auto default the
 * service-denylist is the ONE hard floor. The moment a descriptor for a
 * finance/health/social origin lands, that origin becomes writable -- and "a gap
 * in the service-denylist.json array is indistinguishable from an allow
 * decision." This gate turns that gap into a BUILD FAILURE, not a silent allow:
 * for every origin a descriptor corpus would emit, it consults
 * service-denylist.js classify(origin); if the origin trips a sensitivity
 * heuristic (finance/payment, health, social/messaging, media, adult/dating,
 * government) but is NOT explicitly classified denied or sensitive, the gate
 * exits NON-ZERO naming the offending origin and the matched axis. Genuinely
 * benign unclassified origins default to safe (no false-fail).
 *
 * DUAL EXPORT (the idiom Phase 36 consumes):
 *   - export { classifyGate, sensitivityHeuristic } -- the Phase-36 importer
 *     (scripts/import-opentabs-catalog.mjs, does not exist yet) imports
 *     classifyGate and calls it on the full extracted descriptor set BEFORE
 *     writing any descriptor JSON, refusing to emit a descriptor for an
 *     unclassified sensitive origin.
 *   - CLI on direct invocation -- chained into validate:extension (-> ci), it
 *     sweeps the committed descriptor corpus + the named roster as the CI
 *     backstop. Both paths reuse the SAME classifyGate logic.
 *
 * ANALOG: scripts/verify-recipe-path-guard.mjs (Node-builtins-only static gate;
 * ROOT via fileURLToPath; createRequire to load an extension module; failures[]
 * accumulator; process.exit(1) on fail / exit(0) + PASS summary on pass).
 *
 * Wall-1 discipline: this is build tooling (NOT shipped to the browser), but it
 * is kept FREE of run-string-as-code / function-from-string / dynamic-module
 * loader constructs in code AND comments, consistent with the recipe-path guard.
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// ---- Load the single source of truth: service-denylist.js classify() --------
// Verified contract (extension/utils/service-denylist.js, read live):
//   classify(origin) -> { sensitive, denied, reason? }   denied implies sensitive
//   load() -> Promise<void>   reads ../config/service-denylist.json
const Denylist = require('../extension/utils/service-denylist.js');

// ---- The sensitivity heuristic (one case-insensitive RegExp per axis) --------
//
// Vocabulary is taken from 35-RESEARCH Q3: per-axis category keywords PLUS the
// named-brand tokens (Pitfall 5) so a brand-only host (e.g. carta.com) is caught
// even when it contains no generic category word. Matched against
// host.toLowerCase() + ' ' + slug + ' ' + description, case-insensitively.
//
// FAIL-CLOSED POSTURE: a benign false-positive is fixed by adding the origin to
// SAFE_ALLOWLIST (or classifying it safe), NEVER by weakening the heuristic.
// The tokens are deliberately specific (brand + category nouns) and avoid
// over-generic words like a bare "message"/"inbox" so benign already-shipped
// descriptors (reddit.inbox, github.notifications, slack reads) are not
// false-failed -- only the brand token "slack" trips, and slack is explicitly
// classified sensitive, so the gate continues past it.
const AXES = [
  {
    axis: 'finance/payment',
    re: /\b(bank|pay|payment|payments|wallet|invoice|billing|card|stripe|coinbase|crypto|broker|brokerage|trade|trading|fund|portfolio|tax|budget|ynab|venmo|paypal|wise|fidelity|robinhood|schwab|carta|treasury)\b/i,
  },
  {
    axis: 'health',
    re: /\b(health|clinic|patient|medical|pharmacy|rx|insur|insurance|dental|therapy|medicare|medicaid)\b/i,
  },
  {
    axis: 'social/messaging',
    re: /\b(instagram|facebook|tiktok|twitter|whatsapp|telegram|messenger|snapchat|discord|linkedin|direct-message|slack|signal)\b/i,
  },
  {
    axis: 'media',
    re: /\b(netflix|spotify|twitch|youtube|steam|hulu|disney|primevideo|hbo)\b/i,
  },
  {
    axis: 'adult/dating',
    re: /\b(onlyfans|tinder|bumble|hinge|grindr|adult|nsfw|dating|escort)\b/i,
  },
  {
    axis: 'government',
    re: /\b(irs|dmv|ssa|uscis|medicare|passport)\b/i,
  },
];

/**
 * sensitivityHeuristic(host, slug, description) -> { suspect, axis, keyword } | { suspect:false }
 *
 * Tests host + slug + description against each axis RegExp. The government axis
 * ALSO returns true when host endsWith '.gov' (a host-suffix signal no keyword
 * captures). Returns the FIRST matched axis + keyword for a precise failure
 * message; suspect:false when nothing matches.
 */
export function sensitivityHeuristic(host, slug, description) {
  const h = String(host || '').toLowerCase();
  const haystack = h + ' ' + String(slug || '').toLowerCase() + ' ' + String(description || '').toLowerCase();
  // Host-suffix government signal (no keyword captures a bare .gov TLD).
  if (h.endsWith('.gov')) {
    return { suspect: true, axis: 'government', keyword: '.gov' };
  }
  for (const a of AXES) {
    const m = a.re.exec(haystack);
    if (m) {
      return { suspect: true, axis: a.axis, keyword: m[1] || m[0] };
    }
  }
  return { suspect: false };
}

// ---- origin -> host (no throw; an unparseable origin yields '') --------------
function hostOf(origin) {
  try {
    return new URL(String(origin)).hostname;
  } catch (_e) {
    return '';
  }
}

/**
 * classifyGate(items, opts) -> { failures: string[] }
 *
 * items: array of { origin, service?, slug?, description? }.
 * opts.safeAllowlist: optional Set/array of origins curated benign (defaults
 *   empty -> "safe by default" for any origin the heuristic does NOT flag).
 *
 * For each item:
 *   c = classify(origin)
 *   if (c.denied || c.sensitive) -> explicitly classified, OK (continue)
 *   else suspect = sensitivityHeuristic(host, slug, description)
 *        if suspect && origin not in safeAllowlist -> push a failure naming the
 *        origin, the matched axis/keyword, and the suggested fix.
 *
 * NOTE: call Denylist.load() (await) before classifyGate so classify() reads the
 * committed roster; the CLI below does this. A caller (Phase 36) that has not
 * loaded will see an empty denylist (everything unclassified) -> fail-closed,
 * which is the safe direction.
 */
export function classifyGate(items, opts) {
  const failures = [];
  const list = Array.isArray(items) ? items : [];
  const allowRaw = (opts && opts.safeAllowlist) || [];
  const safeAllowlist = allowRaw instanceof Set ? allowRaw : new Set(allowRaw);

  for (const item of list) {
    if (!item || typeof item.origin !== 'string' || item.origin.length === 0) {
      failures.push(
        'classification gate: an item is missing a string "origin" -- every ' +
        'descriptor must declare the origin it would emit so it can be classified.'
      );
      continue;
    }
    const origin = item.origin;
    let c;
    try {
      c = Denylist.classify(origin);
    } catch (_e) {
      c = null;
    }
    // Explicitly classified denied OR sensitive -> OK, this origin is governed.
    if (c && (c.denied === true || c.sensitive === true)) {
      continue;
    }
    if (safeAllowlist.has(origin)) {
      continue; // curated benign override
    }
    const host = hostOf(origin);
    const verdict = sensitivityHeuristic(host, item.slug, item.description);
    if (verdict.suspect) {
      const svc = item.service ? ' (' + item.service + ')' : '';
      failures.push(
        'origin ' + origin + svc + ' trips the ' + verdict.axis +
        ' sensitivity heuristic [matched "' + verdict.keyword + '"] but is NOT ' +
        'classified denied/sensitive. Add it to deniedOrigins or sensitiveOrigins ' +
        'in extension/config/service-denylist.json, or to the safe allowlist if ' +
        'it is genuinely benign.'
      );
    }
  }
  return { failures };
}

// ---- The named roster origins (35-RESEARCH Q2) -------------------------------
// Appended to the CLI item list so the gate sweeps the explicitly-classified
// roster too: every one of these trips a heuristic axis, and Plan 35-01's data
// classifies all of them, so they prove the "explicitly classified -> OK" path
// over real origins (and would catch a regression that dropped a roster entry).
const ROSTER_ITEMS = [
  // DENY-01 denied (brokerage/trading + ToS-hostile media/social)
  { origin: 'https://robinhood.com', service: 'robinhood' },
  { origin: 'https://digital.fidelity.com', service: 'fidelity' },
  { origin: 'https://app.carta.com', service: 'carta' },
  { origin: 'https://www.netflix.com', service: 'netflix' },
  { origin: 'https://open.spotify.com', service: 'spotify' },
  { origin: 'https://www.twitch.tv', service: 'twitch' },
  { origin: 'https://store.steampowered.com', service: 'steam' },
  { origin: 'https://music.youtube.com', service: 'youtube-music' },
  { origin: 'https://www.tinder.com', service: 'tinder' },
  { origin: 'https://www.onlyfans.com', service: 'onlyfans' },
  // DENY-02 sensitive (payments/budgeting + IG/FB/TikTok/X + messaging)
  { origin: 'https://dashboard.stripe.com', service: 'stripe' },
  { origin: 'https://www.coinbase.com', service: 'coinbase' },
  { origin: 'https://console.twilio.com', service: 'twilio' },
  { origin: 'https://app.ynab.com', service: 'ynab' },
  { origin: 'https://www.instagram.com', service: 'instagram' },
  { origin: 'https://www.facebook.com', service: 'facebook' },
  { origin: 'https://www.tiktok.com', service: 'tiktok' },
  { origin: 'https://x.com', service: 'x' },
  { origin: 'https://web.whatsapp.com', service: 'whatsapp' },
  { origin: 'https://web.telegram.org', service: 'telegram' },
  { origin: 'https://www.slack.com', service: 'slack' },
  { origin: 'https://discord.com', service: 'discord' },
  { origin: 'https://teams.microsoft.com', service: 'teams' },
];

// ---- service -> origin (mirror the descriptor convention: '<service>' becomes
//      'https://<service>'). A descriptor's `service` is a bare host. ----------
function originFromService(service) {
  const s = String(service || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return 'https://' + s;
}

// ---- Build the CLI item list from the committed descriptor corpus ------------
// Read catalog/descriptors/*.json TOP-LEVEL ONLY (mirroring readJsonDir's
// non-recursion; do NOT descend into _fixtures/, so the proof fixture and the
// seed fixtures are excluded exactly as they are from the shipped catalog).
function readCorpusItems() {
  const items = [];
  const dir = resolve(ROOT, 'catalog/descriptors');
  if (!existsSync(dir)) return items;
  const names = readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort();
  for (const name of names) {
    let d;
    try {
      d = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch (_e) {
      // A malformed descriptor is validate-extension's concern; skip here so the
      // gate reports classification failures, not JSON syntax (separation of gates).
      continue;
    }
    const origin = originFromService(d && d.service);
    if (!origin) continue;
    items.push({ origin: origin, service: d.service, slug: d.slug, description: d.description });
  }
  return items;
}

// ---- CLI entry (only when invoked directly, not when imported) ---------------
async function runCli() {
  await Denylist.load(); // populate classify() from the committed roster
  const corpus = readCorpusItems();
  const items = corpus.concat(ROSTER_ITEMS);
  const { failures } = classifyGate(items);
  if (failures.length > 0) {
    console.error('verify-classification-gate: FAIL (fail-closed: an unclassified sensitivity-suspect origin was found)');
    for (const f of failures) {
      console.error('  - ' + f);
    }
    process.exit(1);
  }
  console.log(
    'verify-classification-gate: PASS (' +
    corpus.length + ' corpus origins + ' + ROSTER_ITEMS.length +
    ' roster origins all classified or benign; no unclassified sensitivity-suspect origin)'
  );
  process.exit(0);
}

// Dual-export idiom: run the CLI only on direct invocation, never on import.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runCli().catch((err) => {
    console.error('verify-classification-gate: ERROR ' + (err && err.message ? err.message : err));
    process.exit(1);
  });
}
