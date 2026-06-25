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
 * on a REAL emitted PAYMENT descriptor (opentabs__doordash__place_order.json --
 * service www.doordash.com, sideEffectClass write, backing dom). The 39-01 screening
 * classified www.doordash.com SENSITIVE (a payment origin), so its writes flow through
 * the SAME posture-B re-gate. The block proves: the read (list_orders) runs under Auto;
 * the payment WRITE (place_order) WITHOUT the mutating flag -> RECIPE_CONSENT_MUTATING_
 * REQUIRED (dual-field byte-exact) -- NO money moves, no order placed under Auto; the
 * per-origin mutating flag elevates it. This is the money-no-movement-under-Auto
 * mitigation proven on the descriptor that ACTUALLY SHIPS for the payment-bearing
 * category -- the most catastrophic threat of the commerce/travel batch (T-39-01). The
 * discord block stays the comms/social canary; the two blocks share the EXACT shape.
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
  const readPath = path.join(DESCRIPTORS_DIR, 'opentabs__discord__list_messages.json');
  check(fs.existsSync(sendPath), 'the REAL emitted opentabs__discord__send_message.json exists on disk (the shipped write descriptor)');
  check(fs.existsSync(readPath), 'the REAL emitted opentabs__discord__list_messages.json exists on disk (the shipped read descriptor)');

  const sendDescriptor = JSON.parse(fs.readFileSync(sendPath, 'utf8'));
  const readDescriptor = JSON.parse(fs.readFileSync(readPath, 'utf8'));

  check(sendDescriptor.slug === 'discord.send_message',
    'send descriptor slug is discord.send_message (the real emitted slug)');
  check(sendDescriptor.service === 'discord.com',
    'send descriptor service is discord.com (the SENSITIVE screened origin)');
  check(sendDescriptor.sideEffectClass === 'write',
    'send descriptor sideEffectClass is write (the emitted class crosscheck verified -- drives the re-gate)');
  check(sendDescriptor.backing === 'dom',
    'send descriptor backing is dom (BRDTH-03: DOM-only, invocable=false -- AND its write is posture-B gated)');
  check(readDescriptor.service === 'discord.com' && readDescriptor.sideEffectClass === 'read',
    'read descriptor (list_messages) is service discord.com + sideEffectClass read (the emitted read op)');

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
    'the REAL discord.list_messages (read) on discord.com (sensitive, Auto) -> allow (reads run under Auto; the re-gate is write-only)');

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
  // REAL emitted PAYMENT descriptor (opentabs__doordash__place_order). Mirrors the
  // discord block EXACTLY, swapping in a SHIPPED money-moving write -- the most
  // catastrophic threat of the commerce/travel batch (T-39-01). The discord block
  // above stays the comms/social canary; this block proves money-no-movement-under-
  // Auto on the descriptor that ACTUALLY SHIPS for the payment-bearing category.
  // The committed roster (loaded above) classifies www.doordash.com sensitive (39-01),
  // so its writes flow through the SAME posture-B re-gate; the descriptor's REAL
  // sideEffectClass ('write', read from the loaded JSON) is what fires the re-gate.
  // ===========================================================================
  console.log('\n--- BRDTH-02 (Phase 39-07): END-TO-END payment-write proof on the REAL emitted doordash place_order descriptor ---');

  const DOORDASH_ORIGIN = 'https://www.doordash.com';
  const doordashClass = Denylist.classify(DOORDASH_ORIGIN);
  check(doordashClass && doordashClass.sensitive === true && doordashClass.denied === false,
    'classify(https://www.doordash.com) -> { sensitive:true, denied:false } in the LIVE roster (the 39-01 payment screening governs doordash) -- the write-gating precondition');

  // Load the REAL emitted payment WRITE + read descriptors FROM DISK (the ACTUAL
  // shipped descriptors the 39-02 import produced, not hand-built).
  const payWritePath = path.join(DESCRIPTORS_DIR, 'opentabs__doordash__place_order.json');
  const payReadPath = path.join(DESCRIPTORS_DIR, 'opentabs__doordash__list_orders.json');
  check(fs.existsSync(payWritePath), 'the REAL emitted opentabs__doordash__place_order.json exists on disk (the shipped PAYMENT write descriptor)');
  check(fs.existsSync(payReadPath), 'the REAL emitted opentabs__doordash__list_orders.json exists on disk (the shipped read descriptor)');

  const payWriteDescriptor = JSON.parse(fs.readFileSync(payWritePath, 'utf8'));
  const payReadDescriptor = JSON.parse(fs.readFileSync(payReadPath, 'utf8'));

  check(payWriteDescriptor.slug === 'doordash.place_order',
    'payment write descriptor slug is doordash.place_order (the real emitted slug)');
  check(payWriteDescriptor.service === 'www.doordash.com',
    'payment write descriptor service is www.doordash.com (the SENSITIVE screened payment origin)');
  check(payWriteDescriptor.sideEffectClass === 'write',
    'payment write descriptor sideEffectClass is write (the emitted class crosscheck verified -- drives the re-gate; a money-moving order placement)');
  check(payWriteDescriptor.backing === 'dom',
    'payment write descriptor backing is dom (BRDTH-03: DOM-only on a sensitive origin -- the payment-op CI guard PASSES -- AND its write is posture-B gated)');
  check(payReadDescriptor.service === 'www.doordash.com' && payReadDescriptor.sideEffectClass === 'read',
    'read descriptor (list_orders) is service www.doordash.com + sideEffectClass read (the emitted read op)');

  // Route the REAL payment descriptors through the LIVE gate.
  if (typeof Store._reset === 'function') Store._reset();
  await Store.setOriginMode(DOORDASH_ORIGIN, 'auto');     // Auto, mutating flag false

  // The READ op (list_orders, sideEffectClass read from the loaded JSON) -> allow.
  const payReadGate = await Gate.evaluate({
    origin: DOORDASH_ORIGIN,
    slug: payReadDescriptor.slug,
    entry: { tier: 'T3', descriptor: { sideEffectClass: payReadDescriptor.sideEffectClass } }
  });
  check(payReadGate && payReadGate.decision === 'allow',
    'the REAL doordash.list_orders (read) on www.doordash.com (sensitive, Auto) -> allow (reads run under Auto; the re-gate is write-only)');

  // The payment WRITE op WITHOUT the per-origin mutating flag -> re-gated. The
  // descriptor's REAL sideEffectClass ('write', read from the loaded JSON) triggers
  // the re-gate even with NO method -- NO money moves under Auto.
  const payWriteNoFlag = await Gate.evaluate({
    origin: DOORDASH_ORIGIN,
    slug: payWriteDescriptor.slug,
    entry: { tier: 'T3', descriptor: { sideEffectClass: payWriteDescriptor.sideEffectClass } }
  });
  check(payWriteNoFlag && payWriteNoFlag.decision !== 'allow',
    'the REAL doordash.place_order (payment write) on www.doordash.com (no flag) -> NOT allow (posture B re-gates the SHIPPED sensitive payment write -- no order placed under Auto)');
  // INV-03 dual-field byte-equality: the typed reason on code AND errorCode AND error.
  check(payWriteNoFlag && payWriteNoFlag.error && payWriteNoFlag.error.code === MUTATING_REQUIRED,
    'shipped doordash payment write -> error.code === RECIPE_CONSENT_MUTATING_REQUIRED (byte-exact)');
  check(payWriteNoFlag && payWriteNoFlag.error && payWriteNoFlag.error.errorCode === MUTATING_REQUIRED,
    'shipped doordash payment write -> error.errorCode === RECIPE_CONSENT_MUTATING_REQUIRED (dual-field, INV-03)');
  check(payWriteNoFlag && payWriteNoFlag.error && payWriteNoFlag.error.error === MUTATING_REQUIRED,
    'shipped doordash payment write -> error.error === RECIPE_CONSENT_MUTATING_REQUIRED (dual-field, INV-03)');

  // The per-origin mutating flag ELEVATES the shipped sensitive payment write to allow.
  await Store.setOriginMutating(DOORDASH_ORIGIN, true);
  const payWriteElevated = await Gate.evaluate({
    origin: DOORDASH_ORIGIN,
    slug: payWriteDescriptor.slug,
    entry: { tier: 'T3', descriptor: { sideEffectClass: payWriteDescriptor.sideEffectClass } }
  });
  check(payWriteElevated && payWriteElevated.decision === 'allow',
    'the REAL doordash.place_order WITH the per-origin mutating flag -> allow (the flag elevates the SHIPPED sensitive payment write -- the headline money-no-movement-under-Auto mitigation, proven on a shipped payment descriptor)');

  console.log('\nsensitive-write-import-gate: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: sensitive-write-import-gate threw:', err && err.message ? err.message : err);
  process.exit(1);
});
