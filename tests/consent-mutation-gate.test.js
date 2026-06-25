'use strict';

/**
 * Phase 30 plan 01 (GOV-03, relaxed) -- mutation-gate under the OPT-OUT posture.
 *
 * Under the "fully open" (opt-out) default, read-Auto == write-Auto: the former
 * mutating-elevation gate (GOV-03/D-04) is NO LONGER applied at the invoke gate.
 * On an origin under mode 'auto' (or the global 'auto' default):
 *   - a GET slug is allowed,
 *   - a POST/PUT/PATCH/DELETE slug is ALSO allowed (no separate opt-in),
 *   - the per-origin `mutating` flag is retained in storage but inert at the gate,
 *   - but an explicitly Off origin still blocks (the per-origin opt-out path).
 * The denylist remains the one hard block.
 *
 * Stubs: in-memory chrome.storage.local + injected non-sensitive FsbServiceDenylist.
 *
 * Zero-framework: passed/failed counters + check(cond,msg) + process.exit.
 *
 * Run: node tests/consent-mutation-gate.test.js
 */

const path = require('path');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

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
  console.log('--- GOV-03 (relaxed): read-Auto == write-Auto under opt-out ---');
  installChromeStorageStub();

  const STORE_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'consent-policy-store.js');
  const Store = require(STORE_PATH);
  if (typeof Store._reset === 'function') Store._reset();

  // Non-sensitive, non-denied origin so only the mutation step gates it.
  globalThis.FsbServiceDenylist = {
    classify() { return { sensitive: false, denied: false }; },
    isDenied() { return { denied: false }; },
    load() { return Promise.resolve(); }
  };

  const ROUTER_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'capability-router.js');
  try { require(ROUTER_PATH); } catch (_e) { /* gate global is the real assertion */ }

  const Gate = globalThis.FsbConsentGate;
  check(Gate && typeof Gate.evaluate === 'function',
    'FsbConsentGate.evaluate exists (Plan 02 wires the mutation step; RED until then)');
  if (!Gate || typeof Gate.evaluate !== 'function') {
    console.error('\nPASS=' + passed + ' FAIL=' + (failed + 1) + ' (FsbConsentGate absent -- Wave-0 RED)');
    process.exit(1);
  }

  const ORIGIN = 'https://github.com';
  await Store.setOriginMode(ORIGIN, 'auto'); // read-Auto, mutating still false

  // ---- a GET on read-Auto is allowed ----
  const getGate = await Gate.evaluate({
    origin: ORIGIN, slug: 'github.notifications', method: 'GET',
    entry: { tier: 'T1b', sideEffectClass: 'read' }
  });
  check(getGate && getGate.decision === 'allow', 'GET on read-Auto origin -> allow');

  // ---- a POST on Auto is now ALLOWED (write-Auto == read-Auto under opt-out) ----
  const postGate = await Gate.evaluate({
    origin: ORIGIN, slug: 'github.issues.create', method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'mutating' }
  });
  check(postGate && postGate.decision === 'allow',
    'POST on Auto origin -> allow (mutating-elevation no longer gates invoke)');

  // ---- a T1a 'write' descriptor on Auto is also ALLOWED now ----
  const writeDescriptorGate = await Gate.evaluate({
    origin: ORIGIN, slug: 'slack.chat.postMessage',
    entry: { tier: 'T1a', descriptor: { sideEffectClass: 'write' } }
  });
  check(writeDescriptorGate && writeDescriptorGate.decision === 'allow',
    "T1a 'write' descriptor on Auto origin -> allow (write no longer requires elevation)");

  // ---- the per-origin mutating flag is now inert: setting it does not change the
  //      decision (the POST was already allowed) ----
  await Store.setOriginMutating(ORIGIN, true);
  const postGate2 = await Gate.evaluate({
    origin: ORIGIN, slug: 'github.issues.create', method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'mutating' }
  });
  check(postGate2 && postGate2.decision === 'allow',
    'POST stays allowed regardless of the (now-inert) per-origin mutating flag');

  // ---- every MUTATING_METHODS verb is ALLOWED under Auto (opt-out) ----
  await Store.setOriginMutating(ORIGIN, false); // even with the flag false
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const g = await Gate.evaluate({
      origin: ORIGIN, slug: 'github.issues.mutate', method: m,
      entry: { tier: 'T1a', sideEffectClass: 'mutating' }
    });
    check(g && g.decision === 'allow',
      m + ' on Auto origin -> allow (writes no longer gated under the opt-out default)');
  }

  // ---- but an explicitly Off origin still blocks writes (the opt-out path) ----
  await Store.setOriginMode(ORIGIN, 'off');
  const offPost = await Gate.evaluate({
    origin: ORIGIN, slug: 'github.issues.create', method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'mutating' }
  });
  check(offPost && offPost.decision !== 'allow' && offPost.error && offPost.error.code === 'RECIPE_CONSENT_REQUIRED',
    'an explicitly Off origin still blocks writes (per-origin opt-out)');

  // =====================================================================
  // Posture B (DENY-04): the SENSITIVE-origin sensitive-write re-gate.
  // ---------------------------------------------------------------------
  // The block above is the NON-SENSITIVE regression canary (github.com,
  // classify() -> {sensitive:false}): writes stay fully open under Auto,
  // proving posture B does NOT revert the 68ceea90 opt-out base.
  //
  // Below: with a SENSITIVE classify stub ({sensitive:true, denied:false}),
  // a WRITE without the per-origin mutating flag is re-gated to
  // RECIPE_CONSENT_MUTATING_REQUIRED; reads still pass under Auto; the
  // per-origin mutating flag elevates the sensitive write back to allow.
  // The gate reads the LIVE global FsbServiceDenylist at call time
  // (_denylist()), so swapping the stub here re-points it without a
  // re-require. RED until Task 2 inserts the step-(3.5) branch.
  // =====================================================================
  console.log('\n--- DENY-04 (posture B): sensitive-origin write re-gate ---');

  globalThis.FsbServiceDenylist = {
    classify() { return { sensitive: true, denied: false }; },
    isDenied() { return { denied: false }; },
    load() { return Promise.resolve(); }
  };

  if (typeof Store._reset === 'function') Store._reset();
  const SENSITIVE_ORIGIN = 'https://dashboard.stripe.com';
  await Store.setOriginMode(SENSITIVE_ORIGIN, 'auto'); // Auto, mutating flag false

  // ---- a GET (read) on a sensitive Auto origin still passes (write-only re-gate) ----
  const sensGet = await Gate.evaluate({
    origin: SENSITIVE_ORIGIN, slug: 'stripe.balance.read', method: 'GET',
    entry: { tier: 'T1b', sideEffectClass: 'read' }
  });
  check(sensGet && sensGet.decision === 'allow',
    'GET on a SENSITIVE Auto origin -> allow (reads run under Auto everywhere; re-gate is write-only)');

  // ---- a POST (mutating) on a sensitive Auto origin WITHOUT the flag is re-gated ----
  const sensPost = await Gate.evaluate({
    origin: SENSITIVE_ORIGIN, slug: 'stripe.payouts.create', method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'mutating' }
  });
  check(sensPost && sensPost.decision !== 'allow',
    'POST on a SENSITIVE Auto origin (no flag) -> NOT allow (posture B re-gates the sensitive write)');
  // INV-03 dual-field byte-equality: the typed reason surfaces on code AND errorCode AND error.
  check(sensPost && sensPost.error && sensPost.error.code === 'RECIPE_CONSENT_MUTATING_REQUIRED',
    'sensitive POST -> error.code === RECIPE_CONSENT_MUTATING_REQUIRED (byte-exact)');
  check(sensPost && sensPost.error && sensPost.error.errorCode === 'RECIPE_CONSENT_MUTATING_REQUIRED',
    'sensitive POST -> error.errorCode === RECIPE_CONSENT_MUTATING_REQUIRED (dual-field, INV-03)');
  check(sensPost && sensPost.error && sensPost.error.error === 'RECIPE_CONSENT_MUTATING_REQUIRED',
    'sensitive POST -> error.error === RECIPE_CONSENT_MUTATING_REQUIRED (dual-field, INV-03)');

  // ---- a T1a 'write' descriptor (sideEffectClass write, no method) on sensitive is re-gated ----
  const sensWriteDescriptor = await Gate.evaluate({
    origin: SENSITIVE_ORIGIN, slug: 'stripe.invoice.send',
    entry: { tier: 'T1a', descriptor: { sideEffectClass: 'write' } }
  });
  check(sensWriteDescriptor && sensWriteDescriptor.decision !== 'allow'
    && sensWriteDescriptor.error && sensWriteDescriptor.error.code === 'RECIPE_CONSENT_MUTATING_REQUIRED',
    "T1a 'write' descriptor on a SENSITIVE Auto origin -> RECIPE_CONSENT_MUTATING_REQUIRED");

  // ---- the per-origin mutating flag ELEVATES the sensitive write back to allow ----
  await Store.setOriginMutating(SENSITIVE_ORIGIN, true);
  const sensPostElevated = await Gate.evaluate({
    origin: SENSITIVE_ORIGIN, slug: 'stripe.payouts.create', method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'mutating' }
  });
  check(sensPostElevated && sensPostElevated.decision === 'allow',
    'POST on a SENSITIVE Auto origin WITH the per-origin mutating flag -> allow (the flag elevates)');

  // =====================================================================
  // BRDTH-02 (Phase 38): the sensitive-write re-gate on a REAL SCREENED
  // comms/social origin -- discord.com, classified sensitive in Phase 35 and
  // confirmed by Phase-38 plan 01 Task 1.
  // ---------------------------------------------------------------------
  // The stripe block above uses a HAND-STUBBED classify() ({sensitive:true})
  // to exercise the gate branch in isolation. THIS block loads the REAL
  // committed roster (require service-denylist.js + await Denylist.load())
  // and asserts classify('https://discord.com').sensitive === true BEFORE the
  // gate calls -- so the proof exercises the actual classification this batch
  // landed, not a fabricated verdict (mirrors the live-roster pattern in
  // tests/breadth-batch-gate.test.js). The gate reads the LIVE global
  // FsbServiceDenylist at call time (_denylist()), so assigning the loaded
  // module to globalThis re-points it without a re-require.
  // =====================================================================
  console.log('\n--- BRDTH-02 (Phase 38): discord.com sensitive-write re-gate (LIVE committed roster) ---');

  const DENYLIST_MODULE = path.resolve(__dirname, '..', 'extension', 'utils', 'service-denylist.js');
  const Denylist = require(DENYLIST_MODULE);
  await Denylist.load();
  check(Denylist.isLoaded() === true,
    'the REAL committed service-denylist roster is loaded (NOT a hand-stubbed classify)');
  globalThis.FsbServiceDenylist = Denylist; // re-point the live gate accessor at the real module

  const DISCORD_ORIGIN = 'https://discord.com';
  const discordClass = Denylist.classify(DISCORD_ORIGIN);
  check(discordClass && discordClass.sensitive === true && discordClass.denied === false,
    'classify(https://discord.com) -> { sensitive:true, denied:false } in the LIVE roster (the screening this plan landed governs discord)');

  if (typeof Store._reset === 'function') Store._reset();
  await Store.setOriginMode(DISCORD_ORIGIN, 'auto'); // Auto, mutating flag false

  // ---- a READ on the screened sensitive origin passes under Auto ----
  const discordGet = await Gate.evaluate({
    origin: DISCORD_ORIGIN, slug: 'discord.messages.read', method: 'GET',
    entry: { tier: 'T1b', sideEffectClass: 'read' }
  });
  check(discordGet && discordGet.decision === 'allow',
    'GET on discord.com (sensitive, Auto) -> allow (reads run under Auto; the re-gate is write-only)');

  // ---- a WRITE (POST) WITHOUT the per-origin mutating flag is re-gated ----
  const discordPost = await Gate.evaluate({
    origin: DISCORD_ORIGIN, slug: 'discord.messages.create', method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'write' }
  });
  check(discordPost && discordPost.decision !== 'allow',
    'POST on discord.com (no flag) -> NOT allow (posture B re-gates the screened sensitive write)');
  // INV-03 dual-field byte-equality: the typed reason on code AND errorCode AND error.
  check(discordPost && discordPost.error && discordPost.error.code === 'RECIPE_CONSENT_MUTATING_REQUIRED',
    'discord write -> error.code === RECIPE_CONSENT_MUTATING_REQUIRED (byte-exact)');
  check(discordPost && discordPost.error && discordPost.error.errorCode === 'RECIPE_CONSENT_MUTATING_REQUIRED',
    'discord write -> error.errorCode === RECIPE_CONSENT_MUTATING_REQUIRED (dual-field, INV-03)');
  check(discordPost && discordPost.error && discordPost.error.error === 'RECIPE_CONSENT_MUTATING_REQUIRED',
    'discord write -> error.error === RECIPE_CONSENT_MUTATING_REQUIRED (dual-field, INV-03)');

  // ---- the per-origin mutating flag ELEVATES the discord write back to allow ----
  await Store.setOriginMutating(DISCORD_ORIGIN, true);
  const discordPostElevated = await Gate.evaluate({
    origin: DISCORD_ORIGIN, slug: 'discord.messages.create', method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'write' }
  });
  check(discordPostElevated && discordPostElevated.decision === 'allow',
    'POST on discord.com WITH the per-origin mutating flag -> allow (the flag elevates the screened sensitive write)');

  // =====================================================================
  // MD-01 regression: the re-gate FAILS CLOSED on a classify() error.
  // ---------------------------------------------------------------------
  // If the denylist IS present but its classify() THROWS for a mutating,
  // non-flagged call, the sensitivity is UNKNOWN -- and an unknown
  // sensitivity on a WRITE must NOT fall through to allow (the asymmetry
  // MD-01 closes). It must re-gate to RECIPE_CONSENT_MUTATING_REQUIRED,
  // exactly like a known-sensitive write, mirroring the fail-closed posture
  // of every other degradation in the gate. A throwing isDenied() at step 1
  // is caught and treated as non-match by design, so this origin still
  // reaches step (3.5); the classify() throw is what we exercise here.
  // =====================================================================
  console.log('\n--- MD-01: re-gate fails CLOSED when classify() throws ---');

  globalThis.FsbServiceDenylist = {
    classify() { throw new Error('classify boom (sensitivity probe failure)'); },
    isDenied() { return { denied: false }; },
    load() { return Promise.resolve(); }
  };

  if (typeof Store._reset === 'function') Store._reset();
  const THROW_ORIGIN = 'https://probe-fails.example.com';
  await Store.setOriginMode(THROW_ORIGIN, 'auto'); // Auto, mutating flag false

  // a READ is unaffected: it never reaches the mutating re-gate, so a throwing
  // classify() does not block a non-mutating call.
  const throwGet = await Gate.evaluate({
    origin: THROW_ORIGIN, slug: 'svc.read', method: 'GET',
    entry: { tier: 'T1b', sideEffectClass: 'read' }
  });
  check(throwGet && throwGet.decision === 'allow',
    'GET stays allowed when classify() throws (read never reaches the mutating re-gate)');

  // a WRITE with a throwing classify() FAILS CLOSED to RECIPE_CONSENT_MUTATING_REQUIRED
  // (NOT allow) -- the core MD-01 fix.
  const throwPost = await Gate.evaluate({
    origin: THROW_ORIGIN, slug: 'svc.mutate', method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'mutating' }
  });
  check(throwPost && throwPost.decision !== 'allow',
    'POST with a THROWING classify() (no flag) -> NOT allow (MD-01: fail closed, never fall through)');
  check(throwPost && throwPost.error && throwPost.error.code === 'RECIPE_CONSENT_MUTATING_REQUIRED',
    'throwing-classify POST -> RECIPE_CONSENT_MUTATING_REQUIRED (re-gated, not allowed)');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('consent-mutation-gate.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
