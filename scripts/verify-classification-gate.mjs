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
    // MD-02: include the common inflected finance forms (`banking`, `funds`)
    // alongside their singular stems. The `\b...\b` anchoring means `\bbank\b`
    // does NOT match inside "banking" and `\bfund\b` does NOT match inside
    // "funds" -- so a brand-only finance host whose descriptor metadata reads
    // "online banking" or "manage your funds" would otherwise slip the gate as
    // safe (the exact false-negative class DENY-03 must prevent). Adding the
    // inflections only WIDENS the net (fail-closed direction); a benign
    // false-positive is fixed via SAFE_ALLOWLIST per this module's stated policy.
    //
    // PHASE 39 (the commerce/payment backstop, mirroring the MED-01 social-axis
    // widening): ADD commerce/payment tokens so the heuristic INDEPENDENTLY flags
    // the commerce/payment category on host/slug/description alone -- the explicit
    // service-denylist.json classification of a commerce/payment origin is no
    // longer a SINGLE POINT OF FAILURE (an accidentally-dropped classification for
    // a checkout/cart/place-order origin still trips classifyGate, the exact
    // "gap == allow" failure the gate exists to prevent). The added tokens are
    // deliberately SPECIFIC -- checkout / cart / basket / place-order / purchase /
    // charge[s] / deposit / withdraw / remittance / money-transfer / cashapp /
    // escrow -- chosen over a bare generic 'order'/'orders'/'buy'/'book'/'reserve':
    // a bare 'order' would FALSE-TRIP a benign 'list_orders'/'get_order' READ op (a
    // latent false-positive), so the COMPOUND 'place-order' is added instead -- a
    // paid order op (place_order / place-order / "place order") trips while a
    // list/get_order read does not, and a calendly availability read or a yelp
    // business search (no payment token) stays safe. The compound tokens
    // 'place-order' and 'money-transfer' match across the '-' / '_' / ' ' separators
    // ([-_ ]) so they fire on a slug (place_order), a hyphenated host, OR a prose
    // description equally -- the separator, not a bare 'order', is what distinguishes
    // a paid-order op from a benign orders read. The fail-closed policy stands:
    // widen never weaken; a benign false-positive is fixed via SAFE_ALLOWLIST, NEVER
    // by removing a token. EVERY existing token and the \b...\b anchoring (each new
    // token anchored) is kept.
    axis: 'finance/payment',
    re: /\b(bank|banking|pay|payment|payments|wallet|invoice|billing|card|stripe|coinbase|crypto|broker|brokerage|trade|trading|fund|funds|portfolio|tax|budget|ynab|venmo|paypal|wise|fidelity|robinhood|schwab|carta|treasury|checkout|cart|basket|place[-_ ]order|purchase|charge|charges|deposit|withdraw|remittance|money[-_ ]transfer|cashapp|escrow)\b/i,
  },
  {
    axis: 'health',
    re: /\b(health|clinic|patient|medical|pharmacy|rx|insur|insurance|dental|therapy|medicare|medicaid)\b/i,
  },
  {
    // MED-01 (38-REVIEW): widen the social/messaging vocabulary so the heuristic
    // INDEPENDENTLY backstops the Phase-38 comms/social write category -- the AI-chat
    // (chatgpt/claude), microblog/fediverse (bluesky/bsky/mastodon/threads), and the
    // general-class (fediverse/microblog/ai-assistant) tokens. Before this, only
    // `discord` of the 6 new write origins tripped the axis, so the explicit
    // sensitiveOrigins line was a SINGLE POINT OF FAILURE: an accidentally-dropped
    // classification for chatgpt/claude/bsky/mastodon/threads would have PASSED the
    // gate and shipped that app's send_message/create_post/create_status/create_thread
    // writable-under-Auto -- the exact "gap == allow" failure the gate exists to
    // prevent. The added tokens are deliberately BRAND-SPECIFIC (+ two general-class
    // nouns) and were verified against the full corpus to trip ALL 6 social write
    // origins WITHOUT false-positiving benign dev apps: a bare `post`/`feed`/`dm` was
    // REJECTED because reddit's READ descriptors ("reddit post", "posts in a
    // subreddit") would have falsely tripped -- reddit stays safe-by-default (it is in
    // no axis), per this module's fail-closed policy (widen, never weaken; a benign
    // false-positive is fixed via SAFE_ALLOWLIST). slack.chat.postMessage is already
    // classified sensitive, so the gate continues past it before the heuristic runs.
    axis: 'social/messaging',
    re: /\b(instagram|facebook|tiktok|twitter|whatsapp|telegram|messenger|snapchat|discord|linkedin|direct-message|slack|signal|chatgpt|claude|ai-assistant|bluesky|bsky|mastodon|threads|fediverse|microblog)\b/i,
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
// roster too. Plan 35-01's data classifies all of them, so they prove the
// "explicitly classified -> OK" path over real origins: each hits the
// classify()-matched `continue` BEFORE the heuristic runs.
//
// LO-01: this sweep proves CLASSIFICATION, not heuristic-coverage of every host.
// With slug/description empty (as these roster items are), the HOST alone does
// NOT trip any axis for 4 of the 23 entries -- store.steampowered.com
// ("steampowered" is not "steam" under \bsteam\b), console.twilio.com ("twilio"
// is in no axis), x.com (the social axis has "twitter", not "x"), and
// teams.microsoft.com ("teams" is no token). They pass today ONLY because they
// are explicitly classified. So if a future edit dropped one of THOSE from
// service-denylist.json, this host-only sweep would NOT catch it on the
// heuristic alone -- the sweep is a classification proof, not a per-host
// regression net for brand-only hosts the vocabulary lacks.
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
