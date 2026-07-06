'use strict';

/**
 * Phase 38 / Plan 03 (v1.0.0 Full App Catalog -- BRDTH-02, the headline mitigation)
 * -- the END-TO-END sensitive-write-import proof on a REAL SHIPPED descriptor.
 *
 * The screening contract (38-01) classified discord.com SENSITIVE so its WRITES
 * flow through the posture-B (DENY-04) consent re-gate. tests/consent-mutation-gate
 * .test.js already proves that gate on a HAND-BUILT discord call (slug
 * 'discord.messages.create', a literal sideEffectClass 'write'). THIS test closes the
 * loop the hand-built proof opened: it loads the REAL EMITTED
 * opentabs__discord__send_message.json descriptor FROM DISK (the actual shipped
 * descriptor the 38-03 import produced -- service discord.com, sideEffectClass write,
 * backing dom) and routes IT through the LIVE consent gate over the COMMITTED roster.
 * The proof is that the descriptor that ACTUALLY SHIPS is write-gated -- not a
 * fabricated stand-in. (T-38-01: the headline Elevation-of-Privilege threat -- the
 * real shipped discord write descriptor executing under Auto without the mutating
 * opt-in -> a message posted on someone's account -- proven mitigated end-to-end.)
 *
 * Mirrors tests/consent-mutation-gate.test.js exactly:
 *   - installChromeStorageStub(): the in-memory chrome.storage.local the
 *     consent-policy-store reads (copied verbatim from consent-mutation-gate.test.js).
 *   - require the consent-policy-store + capability-router so FsbConsentGate is
 *     planted on the global; await Denylist.load() against the COMMITTED roster (NOT a
 *     hand-stubbed classify) and re-point the live gate accessor at the real module --
 *     so classify('https://discord.com').sensitive === true is the ACTUAL screening
 *     this batch landed, the live-roster pattern from tests/breadth-batch-gate.test.js.
 *   - the gate reads the LIVE global FsbServiceDenylist at call time (_denylist()), so
 *     assigning the loaded module to globalThis re-points it without a re-require.
 *
 * The descriptor's REAL sideEffectClass is READ FROM THE LOADED JSON and driven into
 * the gate's entry.descriptor -- so the proof exercises the genuinely-emitted class,
 * not a hardcoded literal. The gate's _isMutatingSideEffect() treats 'write' as
 * mutating; the descriptor carries no method, so the re-gate fires on the
 * sideEffectClass alone (the emitted class is what gates).
 *
 * Phase 39-07 (BRDTH-02, THE HEADLINE) EXTENDS this with a SECOND end-to-end block
 * on a REAL emitted PAYMENT descriptor (opentabs__amazon__place_order.json -- service
 * www.amazon.com, sideEffectClass write, backing dom). The 39-01 screening classified
 * www.amazon.com SENSITIVE (a payment origin), so its writes flow through the SAME
 * posture-B re-gate. The block proves: the read (list_orders) runs under Auto; the
 * payment WRITE (place_order) WITHOUT the mutating flag -> RECIPE_CONSENT_MUTATING_
 * REQUIRED (dual-field byte-exact) -- NO money moves, no order placed under Auto; the
 * per-origin mutating flag elevates it. This is the money-no-movement-under-Auto
 * mitigation proven on the descriptor that ACTUALLY SHIPS for the payment-bearing
 * category -- the most catastrophic threat of the commerce/travel batch (T-39-01). The
 * discord block stays the comms/social canary; the two blocks share the EXACT shape.
 * (39.5-REVIEW HI-02: this block originally used doordash.place_order, but that was a
 * stale ORPHAN from the old hand slice -- the real upstream doordash plugin has no
 * place_order op; swapped to the genuinely-shipped amazon.place_order.)
 *
 * Zero-framework FSB convention: a check(cond,msg) counter, PASS=/FAIL= summary,
 * process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/sensitive-write-import-gate.test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// ---- installChromeStorageStub() -- copied verbatim from consent-mutation-gate.test.js
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

const REPO_ROOT = path.resolve(__dirname, '..');
const DESCRIPTORS_DIR = path.join(REPO_ROOT, 'catalog', 'descriptors');
const MUTATING_REQUIRED = 'RECIPE_CONSENT_MUTATING_REQUIRED';

(async () => {
  console.log('--- BRDTH-02 (Phase 38-03): END-TO-END sensitive-write-import proof on the REAL emitted discord descriptor ---');
  installChromeStorageStub();

  // ---- (a) plant the live gate + load the COMMITTED denylist roster ----------
  const STORE_PATH = path.resolve(REPO_ROOT, 'extension', 'utils', 'consent-policy-store.js');
  const Store = require(STORE_PATH);
  if (typeof Store._reset === 'function') Store._reset();

  const ROUTER_PATH = path.resolve(REPO_ROOT, 'extension', 'utils', 'capability-router.js');
  try { require(ROUTER_PATH); } catch (_e) { /* the gate global is the real assertion below */ }

  const Gate = globalThis.FsbConsentGate;
  check(Gate && typeof Gate.evaluate === 'function', 'FsbConsentGate.evaluate is planted on the global');
  if (!Gate || typeof Gate.evaluate !== 'function') {
    console.error('\nPASS=' + passed + ' FAIL=' + (failed + 1) + ' (FsbConsentGate absent)');
    process.exit(1);
  }

  // Load the REAL committed roster (NOT a hand-stubbed classify) so discord.com
  // genuinely classifies sensitive -- the live-roster pattern (breadth-batch-gate.test.js).
  const DENYLIST_MODULE = path.resolve(REPO_ROOT, 'extension', 'utils', 'service-denylist.js');
  const Denylist = require(DENYLIST_MODULE);
  await Denylist.load();
  check(Denylist.isLoaded() === true,
    'the REAL committed service-denylist roster is loaded (NOT a hand-stubbed classify)');
  globalThis.FsbServiceDenylist = Denylist; // re-point the live gate accessor at the real module

  const DISCORD_ORIGIN = 'https://discord.com';
  const discordClass = Denylist.classify(DISCORD_ORIGIN);
  check(discordClass && discordClass.sensitive === true && discordClass.denied === false,
    'classify(https://discord.com) -> { sensitive:true, denied:false } in the LIVE roster (the 38-01 screening governs discord) -- the write-gating precondition');

  // ---- (b) load the REAL emitted descriptors FROM DISK -----------------------
  // These are the ACTUAL shipped descriptors the 38-03 import produced, not hand-built.
  const sendPath = path.join(DESCRIPTORS_DIR, 'opentabs__discord__send_message.json');
  // 39.5-REVIEW HI-02: the prune removed the stale orphan opentabs__discord__list_messages.json
  // (the real discord slice exposes read_messages, not list_messages). Use the live read op.
  const readPath = path.join(DESCRIPTORS_DIR, 'opentabs__discord__read_messages.json');
  check(fs.existsSync(sendPath), 'the REAL emitted opentabs__discord__send_message.json exists on disk (the shipped write descriptor)');
  check(fs.existsSync(readPath), 'the REAL emitted opentabs__discord__read_messages.json exists on disk (the shipped read descriptor)');

  const sendDescriptor = JSON.parse(fs.readFileSync(sendPath, 'utf8'));
  const readDescriptor = JSON.parse(fs.readFileSync(readPath, 'utf8'));

  check(sendDescriptor.slug === 'discord.send_message',
    'send descriptor slug is discord.send_message (the real emitted slug)');
  check(sendDescriptor.service === 'discord.com',
    'send descriptor service is discord.com (the SENSITIVE screened origin)');
  check(sendDescriptor.sideEffectClass === 'write',
    'send descriptor sideEffectClass is write (the emitted class crosscheck verified -- drives the re-gate)');
  check(sendDescriptor.backing === 'handler',
    'send descriptor backing is handler (promoted to handler in 742796ed; invocable at T1a but its write is STILL posture-B re-gated -- proven by the gate checks below, mirroring the T1a slack canary)');
  check(readDescriptor.service === 'discord.com' && readDescriptor.sideEffectClass === 'read',
    'read descriptor (read_messages) is service discord.com + sideEffectClass read (the emitted read op)');

  // ---- (c) route the REAL descriptors through the LIVE gate -------------------
  if (typeof Store._reset === 'function') Store._reset();
  await Store.setOriginMode(DISCORD_ORIGIN, 'auto');     // Auto, mutating flag false

  // The READ op (sideEffectClass read, driven from the loaded JSON) -> allow under Auto.
  const readGate = await Gate.evaluate({
    origin: DISCORD_ORIGIN,
    slug: readDescriptor.slug,
    entry: { tier: 'T3', descriptor: { sideEffectClass: readDescriptor.sideEffectClass } }
  });
  check(readGate && readGate.decision === 'allow',
    'the REAL discord.read_messages (read) on discord.com (sensitive, Auto) -> allow (reads run under Auto; the re-gate is write-only)');

  // The WRITE op WITHOUT the per-origin mutating flag -> re-gated. The descriptor's
  // REAL sideEffectClass ('write', read from the loaded JSON) triggers the re-gate
  // even with NO method.
  const writeGateNoFlag = await Gate.evaluate({
    origin: DISCORD_ORIGIN,
    slug: sendDescriptor.slug,
    entry: { tier: 'T3', descriptor: { sideEffectClass: sendDescriptor.sideEffectClass } }
  });
  check(writeGateNoFlag && writeGateNoFlag.decision !== 'allow',
    'the REAL discord.send_message (write) on discord.com (no flag) -> NOT allow (posture B re-gates the SHIPPED sensitive write)');
  // INV-03 dual-field byte-equality: the typed reason on code AND errorCode AND error.
  check(writeGateNoFlag && writeGateNoFlag.error && writeGateNoFlag.error.code === MUTATING_REQUIRED,
    'shipped discord write -> error.code === RECIPE_CONSENT_MUTATING_REQUIRED (byte-exact)');
  check(writeGateNoFlag && writeGateNoFlag.error && writeGateNoFlag.error.errorCode === MUTATING_REQUIRED,
    'shipped discord write -> error.errorCode === RECIPE_CONSENT_MUTATING_REQUIRED (dual-field, INV-03)');
  check(writeGateNoFlag && writeGateNoFlag.error && writeGateNoFlag.error.error === MUTATING_REQUIRED,
    'shipped discord write -> error.error === RECIPE_CONSENT_MUTATING_REQUIRED (dual-field, INV-03)');

  // The per-origin mutating flag ELEVATES the shipped sensitive write back to allow.
  await Store.setOriginMutating(DISCORD_ORIGIN, true);
  const writeGateElevated = await Gate.evaluate({
    origin: DISCORD_ORIGIN,
    slug: sendDescriptor.slug,
    entry: { tier: 'T3', descriptor: { sideEffectClass: sendDescriptor.sideEffectClass } }
  });
  check(writeGateElevated && writeGateElevated.decision === 'allow',
    'the REAL discord.send_message WITH the per-origin mutating flag -> allow (the flag elevates the SHIPPED sensitive write)');

  // ===========================================================================
  // Phase 39-07 (BRDTH-02, THE HEADLINE): the END-TO-END payment-write proof on a
  // REAL emitted PAYMENT descriptor. Mirrors the discord block EXACTLY, swapping in a
  // SHIPPED money-moving write -- the most catastrophic threat of the commerce/travel
  // batch (T-39-01). The discord block above stays the comms/social canary; this block
  // proves money-no-movement-under-Auto on the descriptor that ACTUALLY SHIPS for the
  // payment-bearing category.
  //
  // 39.5-REVIEW HI-02: the prune removed the stale orphan opentabs__doordash__place_order.json
  // -- the REAL upstream doordash slice (apex *://*.doordash.com/*) has NO place_order op
  // (it emits bookmark_store/update_profile/get_order/...); place_order was a leftover from
  // the OLD hand-authored www.doordash.com slice and was NOT actually backed by the real
  // source (the 39.5-04 claim that "doordash's place_order is regenerated from real source"
  // was the orphan masquerading as live -- exactly HI-02). The genuine SHIPPED payment write
  // at this SHA is amazon.place_order (the hand-authored amazon slice, service www.amazon.com,
  // sensitive via '*.amazon.com', class write, backing dom) -- swap to it so this proves the
  // re-gate on a payment descriptor that REALLY exists in the corpus. amazon.list_orders is
  // its read counterpart on the SAME origin.
  // ===========================================================================
  console.log('\n--- BRDTH-02 (Phase 39-07): END-TO-END payment-write proof on the REAL emitted amazon place_order descriptor ---');

  const AMAZON_ORIGIN = 'https://www.amazon.com';
  const amazonClass = Denylist.classify(AMAZON_ORIGIN);
  check(amazonClass && amazonClass.sensitive === true && amazonClass.denied === false,
    'classify(https://www.amazon.com) -> { sensitive:true, denied:false } in the LIVE roster (the 39-01 payment screening governs amazon) -- the write-gating precondition');

  // Load the REAL emitted payment WRITE + read descriptors FROM DISK (the ACTUAL
  // shipped descriptors the import produced, not hand-built).
  const payWritePath = path.join(DESCRIPTORS_DIR, 'opentabs__amazon__place_order.json');
  const payReadPath = path.join(DESCRIPTORS_DIR, 'opentabs__amazon__list_orders.json');
  check(fs.existsSync(payWritePath), 'the REAL emitted opentabs__amazon__place_order.json exists on disk (the shipped PAYMENT write descriptor)');
  check(fs.existsSync(payReadPath), 'the REAL emitted opentabs__amazon__list_orders.json exists on disk (the shipped read descriptor)');

  const payWriteDescriptor = JSON.parse(fs.readFileSync(payWritePath, 'utf8'));
  const payReadDescriptor = JSON.parse(fs.readFileSync(payReadPath, 'utf8'));

  check(payWriteDescriptor.slug === 'amazon.place_order',
    'payment write descriptor slug is amazon.place_order (the real emitted slug)');
  check(payWriteDescriptor.service === 'www.amazon.com',
    'payment write descriptor service is www.amazon.com (the SENSITIVE screened payment origin)');
  check(payWriteDescriptor.sideEffectClass === 'write',
    'payment write descriptor sideEffectClass is write (the emitted class crosscheck verified -- drives the re-gate; a money-moving order placement)');
  check(payWriteDescriptor.backing === 'dom',
    'payment write descriptor backing is dom (BRDTH-03: DOM-only on a sensitive origin -- the payment-op CI guard PASSES -- AND its write is posture-B gated)');
  // Assert the read op is a SENSITIVE amazon origin + read (host-agnostic so an apex/www
  // re-vendor split would not be brittle).
  const payReadClass = Denylist.classify('https://' + payReadDescriptor.service);
  check(/(^|\.)amazon\.com$/.test(payReadDescriptor.service) && payReadClass && payReadClass.sensitive === true && payReadDescriptor.sideEffectClass === 'read',
    'read descriptor (list_orders) is a SENSITIVE amazon origin (' + payReadDescriptor.service + ') + sideEffectClass read (the emitted read op)');

  // Route the REAL payment descriptors through the LIVE gate.
  if (typeof Store._reset === 'function') Store._reset();
  await Store.setOriginMode(AMAZON_ORIGIN, 'auto');     // Auto, mutating flag false

  // The READ op (list_orders, sideEffectClass read from the loaded JSON) -> allow.
  // Route through the read descriptor's OWN sensitive origin under Auto.
  const PAY_READ_ORIGIN = 'https://' + payReadDescriptor.service;
  await Store.setOriginMode(PAY_READ_ORIGIN, 'auto');     // Auto, mutating flag false
  const payReadGate = await Gate.evaluate({
    origin: PAY_READ_ORIGIN,
    slug: payReadDescriptor.slug,
    entry: { tier: 'T3', descriptor: { sideEffectClass: payReadDescriptor.sideEffectClass } }
  });
  check(payReadGate && payReadGate.decision === 'allow',
    'the REAL amazon.list_orders (read) on ' + payReadDescriptor.service + ' (sensitive, Auto) -> allow (reads run under Auto; the re-gate is write-only)');

  // The payment WRITE op WITHOUT the per-origin mutating flag -> re-gated. The
  // descriptor's REAL sideEffectClass ('write', read from the loaded JSON) triggers
  // the re-gate even with NO method -- NO money moves under Auto.
  const payWriteNoFlag = await Gate.evaluate({
    origin: AMAZON_ORIGIN,
    slug: payWriteDescriptor.slug,
    entry: { tier: 'T3', descriptor: { sideEffectClass: payWriteDescriptor.sideEffectClass } }
  });
  check(payWriteNoFlag && payWriteNoFlag.decision !== 'allow',
    'the REAL amazon.place_order (payment write) on www.amazon.com (no flag) -> NOT allow (posture B re-gates the SHIPPED sensitive payment write -- no order placed under Auto)');
  // INV-03 dual-field byte-equality: the typed reason on code AND errorCode AND error.
  check(payWriteNoFlag && payWriteNoFlag.error && payWriteNoFlag.error.code === MUTATING_REQUIRED,
    'shipped amazon payment write -> error.code === RECIPE_CONSENT_MUTATING_REQUIRED (byte-exact)');
  check(payWriteNoFlag && payWriteNoFlag.error && payWriteNoFlag.error.errorCode === MUTATING_REQUIRED,
    'shipped amazon payment write -> error.errorCode === RECIPE_CONSENT_MUTATING_REQUIRED (dual-field, INV-03)');
  check(payWriteNoFlag && payWriteNoFlag.error && payWriteNoFlag.error.error === MUTATING_REQUIRED,
    'shipped amazon payment write -> error.error === RECIPE_CONSENT_MUTATING_REQUIRED (dual-field, INV-03)');

  // The per-origin mutating flag ELEVATES the shipped sensitive payment write to allow.
  await Store.setOriginMutating(AMAZON_ORIGIN, true);
  const payWriteElevated = await Gate.evaluate({
    origin: AMAZON_ORIGIN,
    slug: payWriteDescriptor.slug,
    entry: { tier: 'T3', descriptor: { sideEffectClass: payWriteDescriptor.sideEffectClass } }
  });
  check(payWriteElevated && payWriteElevated.decision === 'allow',
    'the REAL amazon.place_order WITH the per-origin mutating flag -> allow (the flag elevates the SHIPPED sensitive payment write -- the headline money-no-movement-under-Auto mitigation, proven on a shipped payment descriptor)');

  // ===========================================================================
  // Phase 41 (DEPTH-02) SC2: a hand-ported T1a WRITE on the SENSITIVE app.slack.com
  // origin honors the DENY-04 per-origin mutating opt-in -- through the LIVE roster.
  // ---------------------------------------------------------------------------
  // The discord + amazon blocks above route a T3-DOM descriptor (entry.tier:'T3')
  // through the gate. THIS block proves the SC2 nuance: a hand-ported T1a HEAD entry
  // (entry.tier:'T1a') on a sensitive origin is gated IDENTICALLY -- because the consent
  // gate runs BEFORE tier dispatch (capability-router.js:720 before :743), the gate
  // sees the sideEffectClass + sensitivity and re-gates the write regardless of tier.
  // The vehicle is the SHIPPED slack.send_message descriptor (write/dom, service
  // slack.com) -- app.slack.com is sensitive via 'https://*.slack.com' in the COMMITTED
  // roster (already loaded above as Denylist) -- so NO new risky social/payment write
  // head is shipped just to prove the gate. The handler itself then fail-closes on the
  // [ASSUMED] body (a DISTINCT concern, proven in guarded-write-failclosed.test.js); this
  // block proves only the CONSENT posture.
  console.log('\n--- DEPTH-02 (Phase 41): SC2 -- T1a slack.send_message write on the SENSITIVE app.slack.com origin honors the mutating opt-in (LIVE roster) ---');

  const SLACK_ORIGIN = 'https://app.slack.com';
  const slackClass = Denylist.classify(SLACK_ORIGIN);
  check(slackClass && slackClass.sensitive === true && slackClass.denied === false,
    'classify(https://app.slack.com) -> { sensitive:true, denied:false } in the LIVE roster (https://*.slack.com governs slack) -- the write-gating precondition');

  if (typeof Store._reset === 'function') Store._reset();
  await Store.setOriginMode(SLACK_ORIGIN, 'auto');     // Auto, mutating flag false

  // A READ entry on app.slack.com under Auto -> allow (reads stay open everywhere; the
  // re-gate is write-only). slack.list_channels is a real read slug (sideEffectClass read).
  const slackReadGate = await Gate.evaluate({
    origin: SLACK_ORIGIN,
    slug: 'slack.list_channels',
    entry: { tier: 'T1a', descriptor: { sideEffectClass: 'read' } }
  });
  check(slackReadGate && slackReadGate.decision === 'allow',
    'the T1a slack.list_channels (read) on app.slack.com (sensitive, Auto) -> allow (reads run under Auto; the re-gate is write-only)');

  // The T1a WRITE (slack.send_message, sideEffectClass write) WITHOUT the per-origin
  // mutating flag -> re-gated. entry.tier:'T1a' is the SC2 nuance (the discord/amazon
  // blocks used tier:'T3'): the gate gates a hand-ported T1a write identically because it
  // runs BEFORE tier dispatch.
  const slackWriteNoFlag = await Gate.evaluate({
    origin: SLACK_ORIGIN,
    slug: 'slack.send_message',
    entry: { tier: 'T1a', descriptor: { sideEffectClass: 'write' } }
  });
  check(slackWriteNoFlag && slackWriteNoFlag.decision !== 'allow',
    'the T1a slack.send_message (write) on app.slack.com (no flag) -> NOT allow (posture B re-gates the sensitive-origin T1a write identically to a DOM write)');
  // INV-03 dual-field byte-equality: the typed reason on code AND errorCode AND error.
  check(slackWriteNoFlag && slackWriteNoFlag.error && slackWriteNoFlag.error.code === MUTATING_REQUIRED,
    'sensitive T1a slack write -> error.code === RECIPE_CONSENT_MUTATING_REQUIRED (byte-exact)');
  check(slackWriteNoFlag && slackWriteNoFlag.error && slackWriteNoFlag.error.errorCode === MUTATING_REQUIRED,
    'sensitive T1a slack write -> error.errorCode === RECIPE_CONSENT_MUTATING_REQUIRED (dual-field, INV-03)');
  check(slackWriteNoFlag && slackWriteNoFlag.error && slackWriteNoFlag.error.error === MUTATING_REQUIRED,
    'sensitive T1a slack write -> error.error === RECIPE_CONSENT_MUTATING_REQUIRED (dual-field, INV-03)');

  // The per-origin mutating flag ELEVATES the sensitive T1a write back to allow (the gate
  // allows; the handler then fail-closes on the [ASSUMED] body -- a distinct concern).
  await Store.setOriginMutating(SLACK_ORIGIN, true);
  const slackWriteElevated = await Gate.evaluate({
    origin: SLACK_ORIGIN,
    slug: 'slack.send_message',
    entry: { tier: 'T1a', descriptor: { sideEffectClass: 'write' } }
  });
  check(slackWriteElevated && slackWriteElevated.decision === 'allow',
    'the T1a slack.send_message WITH the per-origin mutating flag -> allow (the flag elevates the sensitive T1a write; the handler then fail-closes on [ASSUMED] -- SC2 proven, gate-allow and handler-fail-close are distinct concerns)');

  console.log('\nsensitive-write-import-gate: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: sensitive-write-import-gate threw:', err && err.message ? err.message : err);
  process.exit(1);
});
