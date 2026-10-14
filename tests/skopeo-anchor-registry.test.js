/**
 * Phase 53 Plan 02 semantic-anchor authority contract.
 *
 * --self-test proves only the deterministic fixture and existing eleven-key
 * ledger. Normal mode deliberately requires the production registry.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CATEGORIES,
  SkopeoResourceLedger,
  assertCategoryTransition,
  assertExactZero,
  runSelfTest: runLedgerSelfTest
} = require('./helpers/skopeo-resource-ledger.js');
const {
  ABA_TRANSITION,
  createSemanticAnchorFixture,
  runFixtureSelfTest,
  semanticIdentity
} = require('./fixtures/skopeo-semantic-anchor-fixture.js');

const MODULE_PATH = path.resolve(__dirname, '..', 'extension', 'content', 'skopeo-anchor-registry.js');

function descriptor(overrides = {}) {
  return {
    anchorId: 'anchor-file-A',
    contextEpoch: 1,
    semanticIdentity: { kind: 'drive-file', id: 'file-A' },
    candidateLocators: [{ kind: 'drive-item-id', value: 'file-A' }],
    validators: ['semantic-identity', 'connected', 'geometry'],
    ...overrides
  };
}

function loadProductionApi() {
  assert.ok(
    fs.existsSync(MODULE_PATH),
    'production semantic-anchor registry module must exist; Task 1 intentionally leaves this RED'
  );
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

async function flush(fixture) {
  await fixture.flushAsync();
}

function commits(fixture) {
  return fixture.events.filter(event => event.type === 'commit');
}

function withdrawals(fixture) {
  return fixture.events.filter(event => event.type === 'withdraw');
}

function indexOfEvent(fixture, type, start = 0) {
  return fixture.events.findIndex((event, index) => index >= start && event.type === type);
}

async function settle(handle, candidates, fixture) {
  handle.settle(candidates);
  await flush(fixture);
}

async function createBoundRegistry(api, fixtureOptions = {}, registryOverrides = {}) {
  const fixture = createSemanticAnchorFixture(fixtureOptions);
  const registry = api.createRegistry(fixture.createRegistryOptions(registryOverrides));
  registry.setContext({ generation: 1, contextEpoch: 1 });
  registry.register(descriptor());
  assert.equal(registry.resolve('anchor-file-A'), true, 'explicit initial resolution starts');
  assert.equal(fixture.resolverHandles.length, 1, 'initial resolution creates one deferred handle');
  await settle(fixture.resolverHandles[0], [fixture.candidateForRow()], fixture);
  assert.equal(commits(fixture).length, 1, 'initial exact candidate commits');
  return { fixture, registry, initialCommit: commits(fixture)[0] };
}

function testExportsAndDescriptorContract(api) {
  assert.deepEqual(api.IDENTITY_KIND, {
    DRIVE_FOLDER: 'drive-folder',
    DRIVE_FILE: 'drive-file',
    DOCS_DOCUMENT: 'docs-document',
    OPAQUE_TARGET: 'opaque-target'
  });
  assert.deepEqual(api.LOCATOR_KIND, {
    DRIVE_ITEM_ID: 'drive-item-id',
    DOCS_DOCUMENT_ID: 'docs-document-id',
    OPAQUE_TARGET_KEY: 'opaque-target-key'
  });
  assert.ok(Object.isFrozen(api.IDENTITY_KIND));
  assert.ok(Object.isFrozen(api.LOCATOR_KIND));
  assert.ok(Object.isFrozen(api.BINDING_REASON));
  assert.equal(typeof api.normalizeDescriptor, 'function');
  assert.equal(typeof api.createRegistry, 'function');

  const input = descriptor();
  const normalized = api.normalizeDescriptor(input);
  assert.notStrictEqual(normalized, input, 'normalization creates an owned descriptor');
  assert.deepEqual(Object.keys(normalized), [
    'anchorId',
    'contextEpoch',
    'semanticIdentity',
    'candidateLocators',
    'validators'
  ], 'descriptor has exact ordered keys');
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.semanticIdentity));
  assert.ok(Object.isFrozen(normalized.candidateLocators));
  assert.ok(Object.isFrozen(normalized.candidateLocators[0]));
  assert.ok(Object.isFrozen(normalized.validators));
  input.semanticIdentity.id = 'file-B';
  assert.equal(normalized.semanticIdentity.id, 'file-A', 'caller mutation cannot alter stable meaning');

  assert.throws(() => api.normalizeDescriptor({ ...descriptor(), selector: '.host-selector' }), /unknown|key/i);
  assert.throws(() => api.normalizeDescriptor(descriptor({ contextEpoch: 0 })), /contextEpoch/i);
  assert.throws(() => api.normalizeDescriptor(descriptor({ anchorId: 'x'.repeat(513) })), /anchorId|512/i);
  assert.throws(() => api.normalizeDescriptor(descriptor({
    semanticIdentity: { kind: 'drive-file', id: 'x'.repeat(513) }
  })), /semanticIdentity|512/i);
  assert.throws(() => api.normalizeDescriptor(descriptor({
    candidateLocators: Array.from({ length: 9 }, (_, index) => ({ kind: 'drive-item-id', value: `file-${index}` }))
  })), /locator|8/i);
  assert.throws(() => api.normalizeDescriptor(descriptor({
    candidateLocators: [
      { kind: 'drive-item-id', value: 'file-A' },
      { kind: 'drive-item-id', value: 'file-A' }
    ]
  })), /duplicate/i);
  assert.throws(() => api.normalizeDescriptor(descriptor({
    candidateLocators: [{ kind: 'css-selector', value: '[data-id="file-A"]' }]
  })), /locator|kind/i);
  assert.throws(() => api.normalizeDescriptor(descriptor({ validators: ['connected', 'guess-from-text'] })), /validator/i);
  assert.throws(() => api.normalizeDescriptor(descriptor({
    candidateLocators: [{ kind: 'drive-item-id', value: 'file-A', node: { nodeType: 1 } }]
  })), /unknown|node|key/i);
  assert.throws(() => api.normalizeDescriptor(descriptor({
    semanticIdentity: { kind: 'drive-file', id: 'file-A', range: { getBoundingClientRect() {} } }
  })), /unknown|range|key/i);
}

async function testResourceOwnershipAndDispose(api) {
  const fixture = createSemanticAnchorFixture();
  const zero = fixture.ledger.snapshot();
  const registry = api.createRegistry(fixture.createRegistryOptions());
  const live = fixture.ledger.snapshot();
  assertCategoryTransition([zero, live], 'observers', [0, 1], 'registry observer ownership');
  assert.ok(live.listeners > 0, 'active registry visibly owns bounded listeners');
  assert.equal(fixture.observerInstances.length, 1, 'exactly one MutationObserver is installed');
  assert.strictEqual(fixture.observerInstances[0].root, fixture.observationRoot, 'observer uses injected narrow root');

  registry.setContext({ generation: 1, contextEpoch: 1 });
  registry.register(descriptor());
  assert.equal(registry.resolve('anchor-file-A'), true);
  const resolving = fixture.ledger.snapshot();
  assertCategoryTransition([zero, resolving], 'pendingRenders', [0, 1], 'resolver work is non-vacuous');

  registry.signal('mutation');
  const scheduled = fixture.ledger.snapshot();
  assertCategoryTransition([zero, scheduled], 'animationFrames', [0, 1], 'validation frame is non-vacuous');
  registry.signal('scroll');
  registry.signal('resize');
  registry.signal('zoom');
  registry.signal('navigation');
  assert.equal(fixture.frames.size, 1, 'mutation/scroll/resize/zoom/navigation coalesce into one owned frame');
  assert.equal(fixture.ledger.snapshot().animationFrames, 1, 'coalescing owns at most one frame handle');

  const leakedObserver = new SkopeoResourceLedger('observer-negative');
  leakedObserver.acquire('observers');
  assert.throws(() => leakedObserver.assertEmpty('deliberate leaked observer'), /observers=1/);
  const leakedFrame = new SkopeoResourceLedger('frame-negative');
  leakedFrame.acquire('animationFrames');
  assert.throws(() => leakedFrame.assertEmpty('deliberate leaked frame'), /animationFrames=1/);

  const firstDispose = registry.dispose();
  assertExactZero(fixture.ledger.snapshot(), 'dispose returns all eleven categories to exact zero');
  const secondDispose = registry.dispose();
  assertExactZero(fixture.ledger.snapshot(), 'repeated dispose remains exact zero');
  assert.ok(firstDispose && secondDispose, 'dispose is idempotently observable');
  assert.equal(fixture.frames.size, 0, 'dispose cancels the owned frame');
  assert.equal(fixture.window.listenerCount() + fixture.visualViewport.listenerCount(), 0, 'dispose removes listeners');
  assert.deepEqual(Object.keys(fixture.ledger.snapshot()), CATEGORIES, 'teardown retains exactly the canonical eleven keys');

  fixture.resolverHandles[0].settle([fixture.candidateForRow()]);
  await flush(fixture);
  assert.equal(commits(fixture).length, 0, 'pending work cannot commit after dispose');
}

async function testWithdrawFirstReuseDetachAndGeometry(api) {
  const reuse = await createBoundRegistry(api);
  reuse.fixture.clearEvents();
  reuse.fixture.reuseAs('file-B');
  const reuseSignalIndex = reuse.fixture.events.length;
  assert.equal(reuse.registry.signal('mutation'), true);
  assert.equal(reuse.fixture.events[reuseSignalIndex].type, 'validate', 'reuse is checked synchronously at the signal boundary');
  assert.equal(reuse.fixture.events[reuseSignalIndex + 1].type, 'withdraw', 'file-A -> file-B withdraws synchronously');
  assert.equal(indexOfEvent(reuse.fixture, 'resolver-settle'), -1, 'withdraw precedes resolver settlement');
  assert.equal(indexOfEvent(reuse.fixture, 'commit'), -1, 'wrong-row withdrawal precedes any next commit');
  reuse.fixture.frames.drainOne();
  assert.ok(indexOfEvent(reuse.fixture, 'resolve') > indexOfEvent(reuse.fixture, 'withdraw'), 're-resolution begins only after withdrawal and frame drain');
  await settle(reuse.fixture.resolverHandles.at(-1), [reuse.fixture.candidateForRow()], reuse.fixture);
  assert.equal(commits(reuse.fixture).length, 0, 'file-B cannot satisfy file-A meaning');
  reuse.registry.dispose();

  const detached = await createBoundRegistry(api);
  detached.fixture.clearEvents();
  detached.fixture.detach();
  const detachSignalIndex = detached.fixture.events.length;
  assert.equal(detached.registry.signal('scroll'), true);
  assert.equal(detached.fixture.events[detachSignalIndex].type, 'withdraw', 'detach withdraws before scheduled work');
  assert.equal(indexOfEvent(detached.fixture, 'frame-request') > 0, true, 'detach schedules only after withdrawal');
  detached.fixture.frames.drainOne();
  await settle(detached.fixture.resolverHandles.at(-1), [detached.fixture.candidateForRow()], detached.fixture);
  assert.equal(commits(detached.fixture).length, 0, 'detached node cannot recommit');
  detached.registry.dispose();

  for (const [label, unsafeRect] of [
    ['zero', { left: 100, top: 100, width: 0, height: 20 }],
    ['non-finite', { left: NaN, top: 100, width: 20, height: 20 }],
    ['outside-viewport', { left: 1100, top: 100, width: 20, height: 20 }]
  ]) {
    const geometry = await createBoundRegistry(api);
    geometry.fixture.clearEvents();
    geometry.fixture.setRect(unsafeRect);
    const geometrySignalIndex = geometry.fixture.events.length;
    assert.equal(geometry.registry.signal('resize'), true);
    assert.equal(geometry.fixture.events[geometrySignalIndex].type, 'validate', `${label} geometry is checked synchronously`);
    assert.equal(geometry.fixture.events[geometrySignalIndex + 1].type, 'withdraw', `${label} geometry withdraws synchronously`);
    assert.equal(indexOfEvent(geometry.fixture, 'commit'), -1, `${label} withdrawal precedes next commit`);
    geometry.fixture.frames.drainOne();
    await settle(geometry.fixture.resolverHandles.at(-1), [geometry.fixture.candidateForRow()], geometry.fixture);
    assert.equal(commits(geometry.fixture).length, 0, `${label} geometry cannot recommit`);
    geometry.registry.dispose();
  }
}

async function testABARequiresFreshBindingEpoch(api) {
  assert.deepEqual(ABA_TRANSITION, ['file-A', 'file-B', 'file-A']);
  const { fixture, registry, initialCommit } = await createBoundRegistry(api);
  const oldEpoch = initialCommit.bindingEpoch;
  fixture.clearEvents();

  fixture.reuseAs('file-B');
  registry.signal('mutation');
  const withdrawal = withdrawals(fixture)[0];
  assert.ok(withdrawal.bindingEpoch > oldEpoch, 'withdrawal advances authority beyond the old binding');
  fixture.frames.drainOne();
  await settle(fixture.resolverHandles.at(-1), [fixture.candidateForRow({ claimedId: 'file-A' })], fixture);
  assert.equal(commits(fixture).length, 0, 'forged old claim does not bind while row is file-B');

  fixture.reuseAs('file-A');
  registry.signal('mutation');
  assert.equal(fixture.frames.size, 1, 'ABA return requires a fresh scheduled resolution');
  fixture.frames.drainOne();
  const freshHandle = fixture.resolverHandles.at(-1);
  await settle(freshHandle, [fixture.candidateForRow()], fixture);
  const freshCommit = commits(fixture).at(-1);
  assert.ok(freshCommit, 'fresh proof may commit after ABA return');
  assert.ok(freshCommit.bindingEpoch > withdrawal.bindingEpoch, 'fresh binding epoch advances past withdrawal');
  assert.notEqual(freshCommit.bindingEpoch, oldEpoch, 'old and fresh bindingEpoch differ after ABA');
  registry.dispose();
}

async function testReverseCompletionAndAuthorityGates(api) {
  const fixture = createSemanticAnchorFixture();
  const registry = api.createRegistry(fixture.createRegistryOptions());
  registry.setContext({ generation: 1, contextEpoch: 1 });
  registry.register(descriptor());
  registry.resolve('anchor-file-A');
  const oldHandle = fixture.resolverHandles[0];

  registry.setContext({ generation: 1, contextEpoch: 2 });
  fixture.setAuthority({ contextEpoch: 2 });
  registry.register(descriptor({ contextEpoch: 2 }));
  registry.resolve('anchor-file-A');
  const freshHandle = fixture.resolverHandles[1];
  await settle(freshHandle, [fixture.candidateForRow()], fixture);
  assert.equal(commits(fixture).length, 1, 'new context completion commits first');
  assert.equal(commits(fixture)[0].contextEpoch, 2);
  await settle(oldHandle, [fixture.candidateForRow()], fixture);
  assert.equal(commits(fixture).length, 1, 'reversed old completion stays stale');

  registry.setContext({ generation: 2, contextEpoch: 3 });
  fixture.setAuthority({ generation: 2, contextEpoch: 3 });
  registry.register(descriptor({ contextEpoch: 3 }));
  registry.resolve('anchor-file-A');
  const generationHandle = fixture.resolverHandles.at(-1);
  fixture.setAuthority({ generation: 3 });
  await settle(generationHandle, [fixture.candidateForRow()], fixture);
  assert.equal(commits(fixture).length, 1, 'generation mismatch blocks commit');

  fixture.setAuthority({ generation: 2, semanticIdentity: semanticIdentity('drive-file', 'file-B') });
  registry.resolve('anchor-file-A');
  await settle(fixture.resolverHandles.at(-1), [fixture.candidateForRow()], fixture);
  assert.equal(commits(fixture).length, 1, 'semantic identity mismatch blocks commit');
  registry.dispose();

  const bindingFixture = createSemanticAnchorFixture();
  const bindingRegistry = api.createRegistry(bindingFixture.createRegistryOptions());
  bindingRegistry.setContext({ generation: 1, contextEpoch: 1 });
  bindingRegistry.register(descriptor());
  bindingRegistry.resolve('anchor-file-A');
  const bindingHandle = bindingFixture.resolverHandles[0];
  bindingRegistry.withdraw('anchor-file-A', 'manual');
  await settle(bindingHandle, [bindingFixture.candidateForRow()], bindingFixture);
  assert.equal(commits(bindingFixture).length, 0, 'binding epoch change blocks an old resolver');
  bindingRegistry.dispose();
}

async function testRejectedProjectionWithdrawsAndRecovers(api) {
  const fixture = createSemanticAnchorFixture();
  const defaults = fixture.createRegistryOptions();
  let commitResult;
  const registry = api.createRegistry({
    ...defaults,
    onCommit(projection) {
      defaults.onCommit(projection);
      return commitResult;
    }
  });
  registry.setContext({ generation: 1, contextEpoch: 1 });
  registry.register(descriptor());
  assert.equal(registry.resolve('anchor-file-A'), true);
  await settle(fixture.resolverHandles[0], [fixture.candidateForRow()], fixture);

  const initialCommit = commits(fixture).at(-1);
  assert.ok(initialCommit, 'notification-style undefined accepts the initial projection');
  assert.equal(registry.getSnapshot().anchors[0].bound, true, 'initial accepted projection is bound');

  commitResult = false;
  fixture.clearEvents();
  assert.equal(registry.signal('resize'), true, 'owned resize schedules projection revalidation');
  assert.equal(fixture.frames.drainOne(), true, 'owned validation frame runs deterministically');

  const rejection = commits(fixture).at(-1);
  const withdrawal = withdrawals(fixture).at(-1);
  const recoveringResolve = fixture.events.find(event => event.type === 'resolve');
  const rejectedSnapshot = registry.getSnapshot().anchors[0];
  assert.ok(rejection, 'callback observes the projection it explicitly rejects');
  assert.ok(withdrawal, 'explicit false synchronously withdraws rejected projection authority');
  assert.equal(withdrawal.reason, api.BINDING_REASON.CALLBACK_ERROR);
  assert.equal(rejectedSnapshot.bound, false, 'rejected projection cannot remain registry-bound');
  assert.ok(withdrawal.bindingEpoch > initialCommit.bindingEpoch, 'rejection advances withdrawal authority');
  assert.ok(recoveringResolve, 'same owned frame starts a fresh candidate resolution');
  assert.ok(recoveringResolve.bindingEpoch > withdrawal.bindingEpoch, 'fresh resolution owns a newer binding epoch');
  assert.equal(fixture.resolverHandles.length, 2, 'recovery creates exactly one additional resolver');

  commitResult = true;
  await settle(fixture.resolverHandles[1], [fixture.candidateForRow()], fixture);
  const recoveredCommit = commits(fixture).at(-1);
  const recoveredSnapshot = registry.getSnapshot().anchors[0];
  assert.equal(recoveredSnapshot.bound, true, 'accepted fresh resolution restores the binding');
  assert.ok(recoveredCommit.bindingEpoch > withdrawal.bindingEpoch, 'recovered projection uses fresh authority');
  assert.equal(recoveredSnapshot.bindingEpoch, recoveredCommit.bindingEpoch);
  registry.dispose();
}

async function testReorderRangeAbortAndHostileInputs(api) {
  const reordered = await createBoundRegistry(api);
  reordered.fixture.clearEvents();
  reordered.fixture.reorder(7);
  reordered.registry.signal('mutation');
  assert.equal(withdrawals(reordered.fixture).length, 0, 'reorder alone does not revoke exact meaning and geometry');
  assert.equal(reordered.fixture.frames.size, 1, 'reorder geometry validation waits for one owned frame');
  reordered.fixture.frames.drainOne();
  await flush(reordered.fixture);
  assert.ok(commits(reordered.fixture).length >= 1, 'safe reorder can refresh the current projection');
  reordered.registry.dispose();

  const rangeFixture = createSemanticAnchorFixture();
  const rangeRegistry = api.createRegistry(rangeFixture.createRegistryOptions());
  rangeRegistry.setContext({ generation: 1, contextEpoch: 1 });
  rangeRegistry.register(descriptor());
  rangeRegistry.resolve('anchor-file-A');
  await settle(rangeFixture.resolverHandles[0], [rangeFixture.candidateForRow({ range: true })], rangeFixture);
  assert.equal(commits(rangeFixture).length, 1, 'connected live Range-like candidate commits');
  rangeFixture.detach();
  rangeRegistry.signal('mutation');
  assert.equal(withdrawals(rangeFixture).length, 1, 'Range whose ancestor detaches withdraws synchronously');
  rangeRegistry.dispose();

  const abortFixture = createSemanticAnchorFixture();
  const abortRegistry = api.createRegistry(abortFixture.createRegistryOptions());
  abortRegistry.setContext({ generation: 1, contextEpoch: 1 });
  abortRegistry.register(descriptor());
  abortRegistry.resolve('anchor-file-A');
  const abortHandle = abortFixture.resolverHandles[0];
  abortFixture.abortController.abort('kill');
  abortRegistry.dispose();
  await settle(abortHandle, [abortFixture.candidateForRow()], abortFixture);
  assert.equal(commits(abortFixture).length, 0, 'abort/kill during pending work cannot commit');
  assertExactZero(abortFixture.ledger.snapshot(), 'abort/kill leaves exact zero resources');

  const hostileFixture = createSemanticAnchorFixture();
  const hostileRegistry = api.createRegistry(hostileFixture.createRegistryOptions({
    resolveCandidates() { return Promise.resolve([{ selector: '*', html: '<img onerror=boom>' }]); }
  }));
  hostileRegistry.setContext({ generation: 1, contextEpoch: 1 });
  hostileRegistry.register(descriptor());
  hostileRegistry.resolve('anchor-file-A');
  await flush(hostileFixture);
  assert.equal(commits(hostileFixture).length, 0, 'malformed hostile candidate remains withdrawn');
  assert.equal(hostileRegistry.signal('mystery'), false, 'unknown signal fails closed');
  hostileRegistry.dispose();
}

function testSourceContract() {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  assert.match(source, /generation/);
  assert.match(source, /contextEpoch/);
  assert.match(source, /semanticIdentity/);
  assert.match(source, /bindingEpoch/);
  assert.equal(/observe\(document\.body|querySelectorAll\(['"]\*|setInterval|history\.(pushState|replaceState)/.test(source), false);
  assert.equal(/\.innerHTML\s*=|insertAdjacentHTML|\beval\s*\(|new\s+Function/.test(source), false);

  const resolveStart = source.indexOf('    _resolveState(state) {');
  const resolveEnd = source.indexOf('    _cancelFrame() {', resolveStart);
  const resolveSource = source.slice(resolveStart, resolveEnd);
  const finalTupleGuard = 'if (!finalRect || !registry._tupleIsCurrent(state, tuple)) return;';
  const assertFinalTupleGuard = value => assert.ok(
    value.includes(finalTupleGuard),
    'final binding-epoch tuple guard must run immediately before binding'
  );
  assertFinalTupleGuard(resolveSource);
  const omittedFinalTuple = resolveSource.replace(finalTupleGuard, 'if (!finalRect) return;');
  assert.notEqual(omittedFinalTuple, resolveSource, 'final tuple negative control changes the owning source slice');
  assert.throws(
    () => assertFinalTupleGuard(omittedFinalTuple),
    /final binding-epoch tuple guard/,
    'negative control proves omission of the final authority check is detected'
  );

  const signalStart = source.indexOf('    signal(kind) {');
  const signalEnd = source.indexOf('    withdraw(anchorId, reason) {', signalStart);
  const signalSource = source.slice(signalStart, signalEnd);
  const withdrawStatement = 'if (!validation.ok) this._withdrawState(state, validation.reason, false);';
  const assertWithdrawFirst = value => {
    const validationIndex = value.indexOf('const validation = this._validateSync');
    const withdrawalIndex = value.indexOf(withdrawStatement);
    const scheduleIndex = value.indexOf('return this._scheduleFrame(kind);');
    assert.ok(validationIndex >= 0 && withdrawalIndex > validationIndex && scheduleIndex > withdrawalIndex,
      'synchronous withdraw-first guard must precede scheduled validation');
  };
  assertWithdrawFirst(signalSource);
  const skippedWithdrawal = signalSource.replace(withdrawStatement, '');
  assert.notEqual(skippedWithdrawal, signalSource, 'withdraw-first negative control changes the owning source slice');
  assert.throws(
    () => assertWithdrawFirst(skippedWithdrawal),
    /synchronous withdraw-first guard/,
    'negative control proves skipped synchronous withdrawal is detected'
  );
}

async function runProductionContract(api) {
  testExportsAndDescriptorContract(api);
  await testResourceOwnershipAndDispose(api);
  await testWithdrawFirstReuseDetachAndGeometry(api);
  await testABARequiresFreshBindingEpoch(api);
  await testReverseCompletionAndAuthorityGates(api);
  await testRejectedProjectionWithdrawsAndRecovers(api);
  await testReorderRangeAbortAndHostileInputs(api);
  testSourceContract();
  console.log('skopeo-anchor-registry: PASS');
}

async function runSelfTest() {
  runLedgerSelfTest();
  await runFixtureSelfTest();
  const fixture = createSemanticAnchorFixture();
  fixture.negativeControlReuse('file-B');
  assert.equal(fixture.frames.size, 0, 'negative control changes identity without dispatching a signal');
  fixture.reuseAs('file-A');
  fixture.setRect({ left: 20, top: 30, width: 40, height: 50 });
  assert.deepEqual(fixture.row.getBoundingClientRect(), {
    left: 20, top: 30, width: 40, height: 50, right: 60, bottom: 80, x: 20, y: 30
  });
  console.log('skopeo-anchor-registry fixture/ledger self-test: PASS');
}

if (require.main === module) {
  const operation = process.argv.includes('--self-test')
    ? runSelfTest()
    : runProductionContract(loadProductionApi());
  Promise.resolve(operation).catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  descriptor,
  runSelfTest,
  runProductionContract
};
