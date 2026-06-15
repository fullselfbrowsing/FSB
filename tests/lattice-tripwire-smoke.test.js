'use strict';

/**
 * Phase 2 (v0.10.0-attempt-2) -- Lattice tripwire + public receipt smoke.
 *
 * Purpose: prove FSB consumes Phase 2's newly-shipped Lattice primitives
 * end-to-end via the public npm package. Exercises:
 *   (1) Capability Receipt mint with step-marker fields populated
 *   (2) Capability Receipt mint without step markers (field backward compat)
 *   (3) Tripwire band pipeline: 3-band ordering for one BEFORE_TOOL fire
 *   (4) Matcher regex: non-matching event does NOT invoke handler
 *   (5) pipeline.freeze() blocks subsequent register() with thrown error
 *   (6) Race-with-log: 50ms-budget handler that takes 200ms emits HOOK_TIMEOUT
 *
 * Coverage:
 *   - Phase 2 CONTEXT.md D-01 .. D-13 (all decisions exercised)
 *   - INV-06 (the primitives live in Lattice; FSB just consumes)
 *   - The FSB-side FINT-02 deliverable (D-18)
 *
 * Run: node tests/lattice-tripwire-smoke.test.js
 */

const { EXPECTED_PUBLIC_LATTICE } = require('./helpers/lattice-public-pin.js');

let passed = 0;
let failed = 0;

function passAssert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function passAssertEqual(actual, expected, msg) {
  passAssert(
    actual === expected,
    msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')'
  );
}

(async () => {
  console.log('\n--- Public Lattice receipt + tripwire bands smoke ---');

  let lattice;
  try {
    lattice = await import('lattice');
  } catch (err) {
    console.error('  FAIL: dynamic import("lattice") threw:', err && err.message ? err.message : err);
    console.error('         Did you run npm install?');
    process.exit(1);
  }

  // Surface presence checks for the NEW Phase 2 primitives.
  passAssertEqual(typeof lattice.createHookPipeline, 'function', 'lattice.createHookPipeline is a function (NEW in Phase 2)');
  // Re-confirm Phase 1 carryforward presence.
  passAssertEqual(typeof lattice.createReceipt, 'function', 'lattice.createReceipt still present (Phase 1 carryforward)');
  passAssertEqual(typeof lattice.verifyReceipt, 'function', 'lattice.verifyReceipt still present');
  passAssertEqual(typeof lattice.createInMemorySigner, 'function', 'lattice.createInMemorySigner still present');
  passAssertEqual(typeof lattice.generateEd25519KeyPairJwk, 'function', 'lattice.generateEd25519KeyPairJwk still present');
  passAssertEqual(typeof lattice.createMemoryKeySet, 'function', 'lattice.createMemoryKeySet still present');

  if (failed > 0) {
    console.log('\nLattice tripwire smoke: surface presence check failed; aborting.');
    process.exit(1);
  }

  // ---- Part 1: receipt round-trip with step-marker fields populated ----
  console.log('\n--- Part 1: public receipt mint + verify with step markers ---');

  const { privateKeyJwk: pk1, publicKeyJwk: vk1 } = await lattice.generateEd25519KeyPairJwk();
  const signer1 = lattice.createInMemorySigner(pk1, { kid: 'fsb-phase-2-smoke-key', publicKeyJwk: vk1 });

  const envelopeV11 = await lattice.createReceipt(
    {
      runId: 'fsb-phase-2-smoke-run-v11',
      model: { requested: 'fsb-smoke-stub-model', observed: null },
      route: { providerId: 'fsb-smoke', capabilityId: 'fsb-smoke/v11-round-trip', attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
      contractVerdict: 'success',
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      // Step-marker fields must round-trip under the public receipt schema.
      stepName: 'click-link',
      stepIndex: 3,
      parentStepName: 'parent-step',
      previousStepName: 'previous-step',
      sessionId: 'fsb-smoke-session-1',
      timestamp: '2026-05-24T18:00:00.000Z',
    },
    signer1
  );

  const keySet1 = lattice.createMemoryKeySet([
    { kid: 'fsb-phase-2-smoke-key', publicKeyJwk: vk1, state: 'active' }
  ]);
  const verifyV11 = await lattice.verifyReceipt(envelopeV11, keySet1);
  passAssertEqual(verifyV11.ok, true, 'step-marker receipt verifies (ok=true)');
  if (verifyV11.ok === true) {
    passAssertEqual(verifyV11.body.version, EXPECTED_PUBLIC_LATTICE.receiptVersion, 'receipt body.version matches public Lattice receipt schema');
    passAssertEqual(verifyV11.body.stepName, 'click-link', 'receipt body.stepName round-trips');
    passAssertEqual(verifyV11.body.stepIndex, 3, 'receipt body.stepIndex round-trips');
    passAssertEqual(verifyV11.body.parentStepName, 'parent-step', 'receipt body.parentStepName round-trips');
    passAssertEqual(verifyV11.body.previousStepName, 'previous-step', 'receipt body.previousStepName round-trips');
    passAssertEqual(verifyV11.body.sessionId, 'fsb-smoke-session-1', 'receipt body.sessionId round-trips');
    passAssertEqual(verifyV11.body.timestamp, '2026-05-24T18:00:00.000Z', 'receipt body.timestamp round-trips');
  }

  // ---- Part 2: receipt round-trip without step-marker fields ----
  console.log('\n--- Part 2: public receipt without step markers ---');

  const envelopeV1 = await lattice.createReceipt(
    {
      runId: 'fsb-phase-2-smoke-run-v1',
      model: { requested: 'fsb-smoke-stub-model', observed: null },
      route: { providerId: 'fsb-smoke', capabilityId: 'fsb-smoke/v1-round-trip', attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
      contractVerdict: 'success',
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      // NO step-marker fields -- the optional step fields should stay absent.
    },
    signer1
  );
  const verifyV1 = await lattice.verifyReceipt(envelopeV1, keySet1);
  passAssertEqual(verifyV1.ok, true, 'receipt without step markers verifies (ok=true)');
  if (verifyV1.ok === true) {
    passAssertEqual(verifyV1.body.version, EXPECTED_PUBLIC_LATTICE.receiptVersion, 'receipt body.version matches public Lattice receipt schema when no step markers');
    passAssertEqual(verifyV1.body.stepName, undefined, 'receipt body has no stepName field');
    passAssertEqual(verifyV1.body.sessionId, undefined, 'receipt body has no sessionId field');
  }

  // ---- Part 3: band pipeline ordering ----
  console.log('\n--- Part 3: band pipeline ordering ---');

  const pipe = lattice.createHookPipeline();
  passAssertEqual(pipe.kind, 'hook-pipeline', 'pipeline.kind === "hook-pipeline"');
  passAssertEqual(typeof pipe.isFrozen, 'function', 'pipeline.isFrozen is a function');
  passAssertEqual(pipe.isFrozen(), false, 'pipeline starts unfrozen');

  const callOrder = [];
  // EXTENSION band (2) registered first
  pipe.register('BEFORE_TOOL', () => { callOrder.push('extension'); }, { band: 2 });
  // SAFETY band (0) registered second
  pipe.register('BEFORE_TOOL', () => { callOrder.push('safety'); }, { band: 0 });
  // OBSERVABILITY band (1) registered third
  pipe.register('BEFORE_TOOL', () => { callOrder.push('observability'); }, { band: 1 });
  await pipe.run('BEFORE_TOOL', { tool: 'click' });
  passAssertEqual(callOrder.length, 3, 'all 3 handlers invoked');
  passAssertEqual(callOrder[0], 'safety', 'SAFETY (band 0) runs first regardless of registration order');
  passAssertEqual(callOrder[1], 'observability', 'OBSERVABILITY (band 1) runs second');
  passAssertEqual(callOrder[2], 'extension', 'EXTENSION (band 2) runs last');

  // ---- Part 4: matcher regex ----
  console.log('\n--- Part 4: matcher regex ---');

  const pipe2 = lattice.createHookPipeline();
  let matchedCalls = 0;
  let unmatchedCalls = 0;
  pipe2.register('BEFORE_TOOL', () => { matchedCalls++; }, { band: 2, matcher: /^BEFORE_/ });
  pipe2.register('AFTER_TOOL', () => { unmatchedCalls++; }, { band: 2, matcher: /^BEFORE_/ });
  await pipe2.run('BEFORE_TOOL', {});
  await pipe2.run('AFTER_TOOL', {});
  passAssertEqual(matchedCalls, 1, 'matcher-matched handler invoked on BEFORE_TOOL');
  passAssertEqual(unmatchedCalls, 0, 'matcher-non-matched handler NOT invoked on AFTER_TOOL');

  // ---- Part 5: freeze() blocks register() ----
  console.log('\n--- Part 5: freeze() semantics ---');

  const pipe3 = lattice.createHookPipeline();
  pipe3.register('BEFORE_TOOL', () => {}, { band: 0 });
  passAssertEqual(pipe3.isFrozen(), false, 'pipeline is unfrozen before freeze()');
  pipe3.freeze();
  passAssertEqual(pipe3.isFrozen(), true, 'pipeline.isFrozen() returns true after freeze()');
  let threw = false;
  let threwName = null;
  try {
    pipe3.register('BEFORE_TOOL', () => {}, { band: 0 });
  } catch (err) {
    threw = true;
    threwName = err && err.name ? err.name : null;
  }
  passAssertEqual(threw, true, 'register() throws after freeze()');
  passAssertEqual(threwName, 'PIPELINE_FROZEN', 'thrown error.name === "PIPELINE_FROZEN"');

  // ---- Part 6: race-with-log (uses real timers) ----
  console.log('\n--- Part 6: race-with-log HOOK_TIMEOUT ---');

  const traceEvents = [];
  const tracer = {
    kind: 'tracer',
    event(name, attributes) { traceEvents.push({ name: name, attributes: attributes }); }
  };
  const pipe4 = lattice.createHookPipeline({ tracer: tracer, sessionId: 'fsb-smoke-budget' });
  pipe4.register('BEFORE_TOOL', async () => {
    await new Promise((r) => setTimeout(r, 200));
  }, { band: 2, budgetMs: 50 });
  await pipe4.run('BEFORE_TOOL', {});
  const timeoutEvents = traceEvents.filter((e) => e.name === 'HOOK_TIMEOUT');
  passAssertEqual(timeoutEvents.length, 1, 'HOOK_TIMEOUT emitted exactly once');
  if (timeoutEvents.length === 1) {
    const attrs = timeoutEvents[0].attributes;
    passAssert(attrs && typeof attrs === 'object', 'HOOK_TIMEOUT payload exists');
    passAssertEqual(attrs && attrs.event, 'BEFORE_TOOL', 'HOOK_TIMEOUT payload.event === "BEFORE_TOOL"');
    passAssertEqual(attrs && attrs.band, 2, 'HOOK_TIMEOUT payload.band === 2 (EXTENSION)');
    passAssertEqual(attrs && attrs.budgetMs, 50, 'HOOK_TIMEOUT payload.budgetMs === 50');
    passAssertEqual(attrs && attrs.sessionId, 'fsb-smoke-budget', 'HOOK_TIMEOUT payload.sessionId round-trips');
    passAssert(attrs && typeof attrs.handlerIndex === 'number', 'HOOK_TIMEOUT payload.handlerIndex is a number');
    passAssert(attrs && typeof attrs.elapsedMs === 'number', 'HOOK_TIMEOUT payload.elapsedMs is a number');
  }

  console.log('\n--- Summary ---');
  console.log('passed:', passed);
  console.log('failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Tripwire smoke harness uncaught error:', err && err.stack ? err.stack : err);
  process.exit(1);
});
