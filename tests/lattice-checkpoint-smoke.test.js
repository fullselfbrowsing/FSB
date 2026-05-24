'use strict';

/**
 * Phase 3 (v0.10.0-attempt-2) -- Lattice checkpoint-hook end-to-end smoke.
 *
 * Purpose: prove FSB consumes Phase 3's createCheckpointHook factory
 * end-to-end via the existing file: dependency. Exercises:
 *   (1) Surface presence: createCheckpointHook + STEP_TRANSITION_EVENT_NAME
 *       + DEFAULT_CHECKPOINT_BAND reachable via bare specifier.
 *   (2) HookPipeline registration: register the checkpoint handler at
 *       BAND.OBSERVABILITY on the AFTER_TOOL lifecycle event.
 *   (3) 3-step fake sequence (CONTEXT.md D-13):
 *         step-1: initial         parent=undefined, previous=undefined, idx=0
 *         step-2: linear sibling  parent=undefined, previous='step-1',  idx=1
 *         step-3: nested child    parent='step-1',  previous='step-2',  idx=2
 *   (4) Tracer event capture: exactly 3 step.transition events, monotonic
 *       stepIndex, threading fields preserved.
 *   (5) Receipt mint + verify: 3 v1.1 envelopes minted, all 3 verify via
 *       verifyReceipt with result.ok === true, all 6 step-marker fields
 *       round-trip through canonical+sign+verify.
 *   (6) Phase 2 baseline carryforward smoke check: pipeline.freeze() still
 *       blocks subsequent register() with PIPELINE_FROZEN.
 *
 * Coverage:
 *   - Phase 3 CONTEXT.md D-01 .. D-15 (all decisions exercised)
 *   - INV-06 (the primitive lives in Lattice; FSB just consumes)
 *   - Phase 2 byte-frozen baseline (29 PASS lattice-smoke + 39 PASS
 *     lattice-tripwire-smoke remain unchanged; this smoke is ADDITIVE)
 *
 * Run: node tests/lattice-checkpoint-smoke.test.js
 */

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
  console.log('\n--- Lattice Phase 3 checkpoint-hook smoke ---');

  let lattice;
  try {
    lattice = await import('lattice');
  } catch (err) {
    console.error('  FAIL: dynamic import("lattice") threw:', err && err.message ? err.message : err);
    console.error('         Did you run `cd lattice && pnpm install && pnpm build` after Phase 3 commits?');
    process.exit(1);
  }

  // ---- Part 1: surface presence checks (Phase 3 + carryforward) ----
  console.log('\n--- Part 1: surface presence ---');

  passAssertEqual(typeof lattice.createCheckpointHook, 'function', 'lattice.createCheckpointHook is a function (NEW in Phase 3)');
  passAssertEqual(lattice.STEP_TRANSITION_EVENT_NAME, 'step.transition', 'lattice.STEP_TRANSITION_EVENT_NAME === "step.transition"');
  passAssertEqual(lattice.DEFAULT_CHECKPOINT_BAND, 1, 'lattice.DEFAULT_CHECKPOINT_BAND === 1 (BAND.OBSERVABILITY)');
  passAssertEqual(typeof lattice.createHookPipeline, 'function', 'lattice.createHookPipeline still present (Phase 2 carryforward)');
  passAssertEqual(typeof lattice.createReceipt, 'function', 'lattice.createReceipt still present (Phase 1 carryforward)');
  passAssertEqual(typeof lattice.verifyReceipt, 'function', 'lattice.verifyReceipt still present');
  passAssertEqual(typeof lattice.createInMemorySigner, 'function', 'lattice.createInMemorySigner still present');
  passAssertEqual(typeof lattice.generateEd25519KeyPairJwk, 'function', 'lattice.generateEd25519KeyPairJwk still present');
  passAssertEqual(typeof lattice.createMemoryKeySet, 'function', 'lattice.createMemoryKeySet still present');

  if (failed > 0) {
    console.log('\nLattice checkpoint smoke: surface presence check failed; aborting.');
    process.exit(1);
  }

  // ---- Part 2: build the test harness ----
  console.log('\n--- Part 2: build pipeline + signer + tracer ---');

  // Ephemeral keypair per run -- D-15 (no hardcoded keys; Phase 1 + Phase 2 pattern).
  const { privateKeyJwk, publicKeyJwk } = await lattice.generateEd25519KeyPairJwk();
  const signer = lattice.createInMemorySigner(privateKeyJwk, {
    kid: 'fsb-phase-3-smoke-key',
    publicKeyJwk: publicKeyJwk
  });
  const keySet = lattice.createMemoryKeySet([
    { kid: 'fsb-phase-3-smoke-key', publicKeyJwk: publicKeyJwk, state: 'active' }
  ]);

  // Recording tracer -- captures every step.transition event the handler
  // emits so we can assert metadata.
  const traceEvents = [];
  const tracer = {
    kind: 'tracer',
    event(name, attributes) {
      traceEvents.push({ name: name, attributes: attributes });
    }
  };

  // Build the checkpoint hook factory + register it on a pipeline at BAND.OBSERVABILITY.
  const handler = lattice.createCheckpointHook({
    runId: 'fsb-phase-3-smoke-run',
    tracer: tracer,
    signer: signer,
    sessionId: 'fsb-smoke-session-3'
  });
  passAssertEqual(typeof handler, 'function', 'createCheckpointHook returned a function (the handler)');

  const pipe = lattice.createHookPipeline();
  passAssertEqual(pipe.kind, 'hook-pipeline', 'pipeline.kind === "hook-pipeline" (Phase 2 carryforward)');
  passAssertEqual(pipe.isFrozen(), false, 'pipeline starts unfrozen');

  let registerThrew = false;
  try {
    pipe.register('AFTER_TOOL', handler, { band: lattice.DEFAULT_CHECKPOINT_BAND });
  } catch (err) {
    registerThrew = true;
    console.error('  pipeline.register threw unexpectedly:', err && err.message ? err.message : err);
  }
  passAssertEqual(registerThrew, false, 'pipeline.register accepts the checkpoint handler at BAND.OBSERVABILITY');

  // ---- Part 3: 3-step fake sequence (D-13) ----
  console.log('\n--- Part 3: 3-step fake sequence ---');

  // step-1: initial -- no parent, no previous
  await pipe.run('AFTER_TOOL', {
    stepName: 'step-1',
    stepIndex: 0,
    timestamp: '2026-05-24T20:00:00.000Z'
  });

  // step-2: linear sibling of step-1 -- previous='step-1', no parent
  await pipe.run('AFTER_TOOL', {
    stepName: 'step-2',
    stepIndex: 1,
    previousStepName: 'step-1',
    timestamp: '2026-05-24T20:00:01.000Z'
  });

  // step-3: nested child of step-1 -- parent='step-1', previous='step-2'
  await pipe.run('AFTER_TOOL', {
    stepName: 'step-3',
    stepIndex: 2,
    parentStepName: 'step-1',
    previousStepName: 'step-2',
    timestamp: '2026-05-24T20:00:02.000Z'
  });

  passAssertEqual(traceEvents.length, 3, 'tracer captured exactly 3 events after 3 pipeline.run calls');

  // ---- Part 4: tracer event metadata shape ----
  console.log('\n--- Part 4: tracer event metadata ---');

  for (let i = 0; i < traceEvents.length; i++) {
    passAssertEqual(traceEvents[i].name, 'step.transition', 'event[' + i + '].name === "step.transition"');
  }

  // stepIndex monotonic
  passAssertEqual(traceEvents[0].attributes && traceEvents[0].attributes.stepIndex, 0, 'event[0].metadata.stepIndex === 0');
  passAssertEqual(traceEvents[1].attributes && traceEvents[1].attributes.stepIndex, 1, 'event[1].metadata.stepIndex === 1');
  passAssertEqual(traceEvents[2].attributes && traceEvents[2].attributes.stepIndex, 2, 'event[2].metadata.stepIndex === 2');

  // stepName sequence
  passAssertEqual(traceEvents[0].attributes && traceEvents[0].attributes.stepName, 'step-1', 'event[0].metadata.stepName === "step-1"');
  passAssertEqual(traceEvents[1].attributes && traceEvents[1].attributes.stepName, 'step-2', 'event[1].metadata.stepName === "step-2"');
  passAssertEqual(traceEvents[2].attributes && traceEvents[2].attributes.stepName, 'step-3', 'event[2].metadata.stepName === "step-3"');

  // parentStepName threading
  passAssertEqual(traceEvents[0].attributes && traceEvents[0].attributes.parentStepName, undefined, 'event[0].metadata.parentStepName is undefined (initial step has no parent)');
  passAssertEqual(traceEvents[1].attributes && traceEvents[1].attributes.parentStepName, undefined, 'event[1].metadata.parentStepName is undefined (sibling, not nested)');
  passAssertEqual(traceEvents[2].attributes && traceEvents[2].attributes.parentStepName, 'step-1', 'event[2].metadata.parentStepName === "step-1" (nested child)');

  // previousStepName threading
  passAssertEqual(traceEvents[0].attributes && traceEvents[0].attributes.previousStepName, undefined, 'event[0].metadata.previousStepName is undefined (first step)');
  passAssertEqual(traceEvents[1].attributes && traceEvents[1].attributes.previousStepName, 'step-1', 'event[1].metadata.previousStepName === "step-1"');
  passAssertEqual(traceEvents[2].attributes && traceEvents[2].attributes.previousStepName, 'step-2', 'event[2].metadata.previousStepName === "step-2"');

  // runId + sessionId on every event
  for (let i = 0; i < traceEvents.length; i++) {
    passAssertEqual(traceEvents[i].attributes && traceEvents[i].attributes.runId, 'fsb-phase-3-smoke-run', 'event[' + i + '].metadata.runId === "fsb-phase-3-smoke-run"');
    passAssertEqual(traceEvents[i].attributes && traceEvents[i].attributes.sessionId, 'fsb-smoke-session-3', 'event[' + i + '].metadata.sessionId === "fsb-smoke-session-3"');
  }

  // receiptId on every event (mint succeeded for all 3); mintError absent
  for (let i = 0; i < traceEvents.length; i++) {
    passAssert(
      traceEvents[i].attributes && typeof traceEvents[i].attributes.receiptId === 'string' && traceEvents[i].attributes.receiptId.length > 0,
      'event[' + i + '].metadata.receiptId is a non-empty string (mint succeeded)'
    );
    passAssertEqual(traceEvents[i].attributes && traceEvents[i].attributes.mintError, undefined, 'event[' + i + '].metadata.mintError is undefined');
  }

  // ---- Part 5: receipt round-trip verification (3 receipts) ----
  console.log('\n--- Part 5: 3 receipt round-trip ---');

  const verifiedBodies = [];
  for (let i = 0; i < 3; i++) {
    const env = traceEvents[i].attributes && traceEvents[i].attributes.envelope;
    passAssert(env && typeof env === 'object' && env.payloadType === 'application/vnd.lattice.receipt+json', 'event[' + i + '].metadata.envelope is a valid DSSE envelope');
    if (env) {
      const result = await lattice.verifyReceipt(env, keySet);
      passAssertEqual(result.ok, true, 'receipt[' + i + '] verifies (verifyReceipt result.ok === true)');
      if (result.ok === true) {
        verifiedBodies.push(result.body);
        passAssertEqual(result.body.version, 'lattice-receipt/v1.1', 'receipt[' + i + '].version === "lattice-receipt/v1.1"');
      } else {
        // Surface the typed error so a failure is debuggable from CI logs.
        console.error('  receipt[' + i + '] verify failed with error:', JSON.stringify(result.error));
      }
    }
  }

  passAssertEqual(verifiedBodies.length, 3, 'all 3 verifiedBodies collected');

  // ---- Part 6: step-marker field round-trip per receipt ----
  console.log('\n--- Part 6: step-marker round-trip ---');

  if (verifiedBodies.length === 3) {
    // Receipt 1 spot-checks
    passAssertEqual(verifiedBodies[0].stepName, 'step-1', 'receipt[0].stepName === "step-1"');
    passAssertEqual(verifiedBodies[0].stepIndex, 0, 'receipt[0].stepIndex === 0');
    passAssertEqual(verifiedBodies[0].parentStepName, undefined, 'receipt[0].parentStepName is undefined (initial)');
    passAssertEqual(verifiedBodies[0].previousStepName, undefined, 'receipt[0].previousStepName is undefined (first)');
    passAssertEqual(verifiedBodies[0].timestamp, '2026-05-24T20:00:00.000Z', 'receipt[0].timestamp round-trips');

    // Receipt 2 spot-checks
    passAssertEqual(verifiedBodies[1].stepName, 'step-2', 'receipt[1].stepName === "step-2"');
    passAssertEqual(verifiedBodies[1].stepIndex, 1, 'receipt[1].stepIndex === 1');
    passAssertEqual(verifiedBodies[1].previousStepName, 'step-1', 'receipt[1].previousStepName === "step-1"');

    // Receipt 3 spot-checks
    passAssertEqual(verifiedBodies[2].stepName, 'step-3', 'receipt[2].stepName === "step-3"');
    passAssertEqual(verifiedBodies[2].stepIndex, 2, 'receipt[2].stepIndex === 2');
    passAssertEqual(verifiedBodies[2].parentStepName, 'step-1', 'receipt[2].parentStepName === "step-1" (nested child)');
    passAssertEqual(verifiedBodies[2].previousStepName, 'step-2', 'receipt[2].previousStepName === "step-2"');

    // sessionId on every receipt
    for (let i = 0; i < 3; i++) {
      passAssertEqual(verifiedBodies[i].sessionId, 'fsb-smoke-session-3', 'receipt[' + i + '].sessionId === "fsb-smoke-session-3"');
    }

    // ---- Part 7: threading round-trip (linked-list) ----
    console.log('\n--- Part 7: linked-list threading round-trip ---');

    passAssertEqual(verifiedBodies[1].previousStepName, verifiedBodies[0].stepName, 'receipt[1].previousStepName === receipt[0].stepName (linear linkage)');
    passAssertEqual(verifiedBodies[2].parentStepName, verifiedBodies[0].stepName, 'receipt[2].parentStepName === receipt[0].stepName (nested-child linkage)');
    passAssertEqual(verifiedBodies[2].previousStepName, verifiedBodies[1].stepName, 'receipt[2].previousStepName === receipt[1].stepName (chained-previous linkage)');
  }

  // ---- Part 8: Phase 2 carryforward smoke -- freeze() still blocks register() ----
  console.log('\n--- Part 8: Phase 2 freeze() carryforward ---');

  pipe.freeze();
  passAssertEqual(pipe.isFrozen(), true, 'pipeline.freeze() flips isFrozen() to true');

  let freezeThrew = false;
  let freezeThrowName = null;
  try {
    pipe.register('AFTER_TOOL', handler, { band: 1 });
  } catch (err) {
    freezeThrew = true;
    freezeThrowName = err && err.name ? err.name : null;
  }
  passAssertEqual(freezeThrew, true, 'pipeline.register throws after freeze() (Phase 2 carryforward)');
  passAssertEqual(freezeThrowName, 'PIPELINE_FROZEN', 'thrown error.name === "PIPELINE_FROZEN"');

  console.log('\n--- Summary ---');
  console.log('passed:', passed);
  console.log('failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Checkpoint smoke harness uncaught error:', err && err.stack ? err.stack : err);
  process.exit(1);
});
