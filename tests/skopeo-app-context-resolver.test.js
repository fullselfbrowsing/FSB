'use strict';

const assert = require('node:assert/strict');

const profileIndex = require('../extension/catalog/skopeo-profile-index.generated.js');
const projector = require('../extension/utils/skopeo-capability-projector.js');
const deepRouter = require('../extension/content/skopeo-context-router.js');
const resolverApi = require('../extension/content/skopeo-app-context-resolver.js');

const RESULT_KEYS = Object.freeze([
  'status',
  'generation',
  'exactOrigin',
  'profileId',
  'profileVersion',
  'contextEpoch',
  'app',
  'genre',
  'lens',
  'semanticEntity',
  'anchorDescriptor',
  'capabilityGroups',
  'risk',
  'reason',
  'evidence',
]);

const CLOSED_INPUT_KEYS = Object.freeze([
  'generation',
  'exactOrigin',
  'service',
  'appStem',
  'profileId',
  'profileVersion',
  'contextEpoch',
  'url',
  'app',
  'genre',
  'requestedLens',
  'adapterEvidence',
  'capabilityGroups',
  'risk',
]);

const FORBIDDEN_RESULT_KEYS = new Set([
  'url',
  'rawUrl',
  'pageCopy',
  'node',
  'range',
  'selector',
  'cssSelector',
  'callback',
  'resolveAdapter',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function assertDeepFrozen(value, label = 'value') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, label + ' is frozen');
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, label + '.' + key);
  }
}

function assertExactKeys(value, keys, label) {
  assert.deepEqual(Object.keys(value).sort(), keys.slice().sort(), label);
}

function assertNoForbiddenSurface(value, label = 'result', seen = new Set()) {
  if (value === null || value === undefined) return;
  assert.notEqual(typeof value, 'function', label + ' excludes executable data');
  if (typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  assert.ok(prototype === Object.prototype || prototype === Array.prototype || prototype === null,
    label + ' excludes host objects');
  for (const key of Reflect.ownKeys(value)) {
    assert.equal(typeof key, 'string', label + ' excludes symbol keys');
    assert.equal(FORBIDDEN_RESULT_KEYS.has(key), false, label + ' excludes forbidden key ' + key);
    assertNoForbiddenSurface(value[key], label + '.' + key, seen);
  }
}

function project(url, generation = 31) {
  const projection = projector.createProjection({ tabId: 7, generation, url }, profileIndex);
  assert.equal(projection.status, 'recognized', 'fixture projection is recognized');
  assert.equal(projector.validateProjection(projection), true, 'fixture projection validates');
  return projection;
}

function request(url, adapterEvidence = [], requestedLens = 'app-actions') {
  return { url, requestedLens, adapterEvidence };
}

function authorityFromInput(input) {
  return {
    generation: input.generation,
    exactOrigin: input.exactOrigin,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    contextEpoch: input.contextEpoch,
  };
}

function authorityFromResult(result) {
  return {
    generation: result.generation,
    exactOrigin: result.exactOrigin,
    profileId: result.profileId,
    profileVersion: result.profileVersion,
    contextEpoch: result.contextEpoch,
  };
}

function assertClosedFailure(result, expectedStatus, expectedReason, label) {
  assert.equal(result.status, expectedStatus, label + ': status');
  assert.equal(result.reason, expectedReason, label + ': reason');
  assert.equal(result.retryable, expectedStatus === 'uncertain', label + ': retryable');
  assert.ok(Number.isSafeInteger(result.generation) && result.generation > 0,
    label + ': generation is positive');
  assert.ok(Number.isSafeInteger(result.contextEpoch) && result.contextEpoch > 0,
    label + ': contextEpoch is positive');
  assertExactKeys(result,
    ['status', 'generation', 'contextEpoch', 'reason', 'retryable'],
    label + ': exact failure keys');
  assertDeepFrozen(result, label);
  assertNoForbiddenSurface(result, label);
}

function assertRecognized(result, projection, expected, label) {
  assert.equal(result.status, 'recognized', label + ': status');
  assert.equal(result.generation, projection.generation, label + ': generation');
  assert.equal(result.exactOrigin, projection.exactOrigin, label + ': exact origin');
  assert.equal(result.profileId, projection.profileId, label + ': profile id');
  assert.equal(result.profileVersion, projection.profileVersion, label + ': profile version');
  assert.ok(Number.isSafeInteger(result.contextEpoch) && result.contextEpoch > 0,
    label + ': contextEpoch is positive');
  assert.deepEqual(result.app, {
    appStem: projection.appStem,
    service: projection.service,
    displayName: projection.profile.displayName,
    pageNoun: projection.profile.pageNoun,
  }, label + ': exact app identity remains separate');
  assert.equal(result.genre, expected.genre, label + ': genre');
  assert.equal(result.lens, expected.lens, label + ': requested task lens');
  assert.deepEqual(result.semanticEntity, expected.semanticEntity, label + ': semantic entity');
  assert.deepEqual(result.anchorDescriptor, expected.anchorDescriptor, label + ': anchor descriptor');
  assert.equal(result.reason, expected.reason, label + ': closed reason');
  assert.deepEqual(result.evidence, expected.evidence, label + ': closed evidence');
  assert.deepEqual(result.capabilityGroups, projection.capabilityGroups,
    label + ': current-service capabilities remain a separate input');
  assertExactKeys(result, RESULT_KEYS, label + ': exact recognized keys');
  assertDeepFrozen(result, label);
  assertNoForbiddenSurface(result, label);
  assert.equal(resolverApi.validateResult(result, authorityFromResult(result)), true,
    label + ': public validator accepts current result');
}

function adapterResult(input, overrides = {}) {
  const semanticEntity = {
    kind: 'docs-document',
    id: 'doc-123',
    label: 'Document doc-123',
  };
  return deepFreeze({
    adapterId: 'drive-docs-deep-pack-v1',
    kind: 'drive-docs-deep-pack',
    generation: input.generation,
    exactOrigin: input.exactOrigin,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    contextEpoch: input.contextEpoch,
    genre: 'drive-docs-deep-pack',
    semanticEntity,
    anchorDescriptor: {
      anchorId: 'docs-document:doc-123',
      candidateLocators: [{ kind: 'docs-document-id', value: 'doc-123' }],
      validators: ['semantic-identity', 'connected', 'geometry'],
    },
    evidence: [
      { signal: 'exact-origin', value: 'https://docs.google.com' },
      { signal: 'trusted-context-kind', value: 'agreement-reading' },
      { signal: 'docs-document-id', value: 'doc-123' },
    ],
    ...overrides,
  });
}

function runGenericFailQuietOracle() {
  const projection = project('https://airbnb.com/rooms/123');
  const calls = [];
  const resolver = resolverApi.createResolver({
    generation: projection.generation,
    projection,
    resolveAdapter(adapterId, closedInput) {
      calls.push({ adapterId, closedInput });
      assert.equal(adapterId, projection.profile.adapterId,
        'only the profile allowlisted adapter ID is requested');
      assertExactKeys(closedInput, CLOSED_INPUT_KEYS, 'adapter receives exact closed input');
      assertDeepFrozen(closedInput, 'closed adapter input');
      assert.equal(closedInput.generation, projection.generation);
      assert.equal(closedInput.exactOrigin, projection.exactOrigin);
      assert.equal(closedInput.appStem, projection.appStem);
      assert.equal(closedInput.genre, projection.profile.defaultGenre);
      assert.equal(closedInput.requestedLens, 'app-actions');
      assert.deepEqual(closedInput.capabilityGroups, projection.capabilityGroups);
      assertExactKeys(closedInput.risk,
        ['highest', 'readCount', 'writeCount', 'destructiveCount'],
        'action risk remains a separate closed input');
      return null;
    },
  });

  const brittleEvidence = [
    { signal: 'url-path', value: '/rooms/123' },
    { signal: 'visible-heading', value: 'Ocean view apartment' },
    { signal: 'visible-label', value: 'Reservation 123' },
    { signal: 'css-selector', value: '[data-room-id="123"]' },
    { signal: 'css-class', value: 'room-card selected' },
    { signal: 'dom-shape', value: 'list > card > heading' },
    { signal: 'list-position', value: '4' },
  ];

  let previousEpoch = 0;
  for (const evidence of [[], ...brittleEvidence.map(item => [item]), brittleEvidence]) {
    const result = resolver.resolve(request('https://airbnb.com/rooms/123', evidence));
    assertRecognized(result, projection, {
      genre: 'generic-app',
      lens: 'app-actions',
      semanticEntity: null,
      anchorDescriptor: null,
      reason: 'no-stable-entity',
      evidence: [],
    }, 'generic brittle evidence ' + (evidence[0] ? evidence[0].signal : 'absent'));
    assert.ok(result.contextEpoch > previousEpoch, 'recognized attempt advances contextEpoch');
    previousEpoch = result.contextEpoch;
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('/rooms/123'), false, 'raw path is not emitted');
    assert.equal(serialized.includes('Ocean view apartment'), false, 'visible copy is not emitted');
  }
  assert.equal(calls.length, brittleEvidence.length + 2,
    'generic adapter seam is consulted once per valid resolve attempt');
  assert.equal(resolver.currentEpoch(), previousEpoch);
  return { resolver, projection, previousEpoch };
}

function runHostileInputOracle() {
  const projection = project('https://airbnb.com/');
  let adapterCalls = 0;
  const resolver = resolverApi.createResolver({
    generation: projection.generation,
    projection,
    resolveAdapter() {
      adapterCalls += 1;
      return null;
    },
  });

  const rawNode = { nodeType: 1, ownerDocument: { title: 'host document' } };
  const cases = [
    ['raw DOM node', [{ signal: 'dom-node', value: rawNode }]],
    ['function', [{ signal: 'visible-label', value() {} }]],
    ['oversized copy', [{ signal: 'visible-label', value: 'x'.repeat(513) }]],
    ['unknown evidence key', [{ signal: 'visible-label', value: 'Room', selector: '#room' }]],
  ];
  let previousEpoch = 0;
  for (const [label, evidence] of cases) {
    const result = resolver.resolve(request('https://airbnb.com/', evidence));
    assertClosedFailure(result, 'uncertain', 'adapter-evidence-invalid', label);
    assert.ok(result.contextEpoch > previousEpoch, label + ': contextEpoch advances');
    previousEpoch = result.contextEpoch;
  }
  assert.equal(adapterCalls, 0, 'hostile evidence never reaches the adapter callback');

  const mismatch = resolver.resolve(request('https://airbnb.com.evil.example/rooms/123'));
  assertClosedFailure(mismatch, 'unsupported', 'origin-mismatch', 'suffix-confused current URL');
  assert.ok(mismatch.contextEpoch > previousEpoch, 'unsupported attempt advances contextEpoch');
  assert.equal(adapterCalls, 0, 'origin mismatch never reaches adapter callback');

  const throwing = resolverApi.createResolver({
    generation: projection.generation,
    projection,
    resolveAdapter() { throw new Error('page copy and stack must not escape'); },
  }).resolve(request('https://airbnb.com/'));
  assertClosedFailure(throwing, 'uncertain', 'adapter-failed', 'adapter exception');
  assert.equal(JSON.stringify(throwing).includes('page copy'), false,
    'adapter exception text is not echoed');
}

function runDriveDelegationOracle() {
  const projection = project('https://docs.google.com/document/d/doc-123/edit');
  const evidence = [
    { signal: 'exact-origin', value: 'https://docs.google.com' },
    { signal: 'trusted-context-kind', value: 'agreement-reading' },
    { signal: 'docs-document-id', value: 'doc-123' },
  ];
  const calls = [];
  const resolver = resolverApi.createResolver({
    generation: projection.generation,
    projection,
    resolveAdapter(adapterId, closedInput) {
      calls.push({ adapterId, closedInput });
      assert.equal(adapterId, 'drive-docs-deep-pack-v1');
      assertExactKeys(closedInput, CLOSED_INPUT_KEYS, 'Drive delegation receives closed input');
      assertDeepFrozen(closedInput, 'Drive delegation input');
      const bySignal = new Map(closedInput.adapterEvidence.map(item => [item.signal, item.value]));
      const routed = deepRouter.createRouter({ generation: closedInput.generation }).route({
        url: closedInput.url,
        contextKind: bySignal.get('trusted-context-kind'),
        semanticIdentity: { kind: 'docs-document', id: bySignal.get('docs-document-id') },
        evidence: closedInput.adapterEvidence,
      });
      assert.equal(routed.status, 'recognized', 'unchanged Phase 53 Drive/Docs router recognizes input');
      return adapterResult(closedInput, {
        semanticEntity: {
          kind: routed.semanticIdentity.kind,
          id: routed.semanticIdentity.id,
          label: 'Document ' + routed.semanticIdentity.id,
        },
        evidence: routed.evidence,
      });
    },
  });

  const result = resolver.resolve(request(
    'https://docs.google.com/document/d/doc-123/edit',
    evidence,
    'agreement-reading'
  ));
  assert.equal(calls.length, 1, 'Drive deep adapter delegates exactly once');
  const expectedAnchor = {
    anchorId: 'docs-document:doc-123',
    contextEpoch: result.contextEpoch,
    semanticIdentity: { kind: 'docs-document', id: 'doc-123' },
    candidateLocators: [{ kind: 'docs-document-id', value: 'doc-123' }],
    validators: ['semantic-identity', 'connected', 'geometry'],
  };
  assertRecognized(result, projection, {
    genre: 'drive-docs-deep-pack',
    lens: 'agreement-reading',
    semanticEntity: { kind: 'docs-document', id: 'doc-123', label: 'Document doc-123' },
    anchorDescriptor: expectedAnchor,
    reason: null,
    evidence,
  }, 'Drive/Docs deep-pack delegation');

  for (const [label, overrides] of [
    ['forged adapter ID', { adapterId: 'forged-adapter-v1' }],
    ['stale generation', { generation: projection.generation + 1 }],
    ['mismatched origin', { exactOrigin: 'https://drive.google.com' }],
    ['mismatched profile', { profileId: 'forged-profile-v1' }],
    ['mismatched profile version', { profileVersion: 'skopeo-profiles-forged-v9' }],
    ['stale context epoch', { contextEpoch: 999 }],
  ]) {
    const hostileResolver = resolverApi.createResolver({
      generation: projection.generation,
      projection,
      resolveAdapter(_adapterId, closedInput) {
        return adapterResult(closedInput, overrides);
      },
    });
    const failure = hostileResolver.resolve(request(
      'https://docs.google.com/document/d/doc-123/edit', evidence, 'agreement-reading'
    ));
    assertClosedFailure(failure, 'uncertain', 'adapter-result-invalid', label);
  }

  const weakIdentity = resolverApi.createResolver({
    generation: projection.generation,
    projection,
    resolveAdapter(_adapterId, closedInput) {
      return adapterResult(closedInput, {
        evidence: [{ signal: 'visible-label', value: 'Document doc-123' }],
      });
    },
  }).resolve(request('https://docs.google.com/document/d/doc-123/edit', evidence));
  assertClosedFailure(weakIdentity, 'uncertain', 'no-stable-entity',
    'visible evidence cannot manufacture a semantic entity');

  return result;
}

function runProjectionAndResultReplayOracle(recognized) {
  const projection = project('https://airbnb.com/');
  for (const [label, mutate, expectedReason] of [
    ['generation mismatch', value => { value.generation += 1; }, 'projection-stale'],
    ['origin mismatch', value => { value.exactOrigin = 'https://evil.example'; }, 'projection-invalid'],
    ['profile mismatch', value => { value.profileId = 'forged-profile-v1'; }, 'projection-invalid'],
  ]) {
    const candidate = clone(projection);
    mutate(candidate);
    deepFreeze(candidate);
    const resolver = resolverApi.createResolver({
      generation: projection.generation,
      projection: candidate,
      resolveAdapter() { return null; },
    });
    const failure = resolver.resolve(request('https://airbnb.com/'));
    assertClosedFailure(failure, 'unsupported', expectedReason, label);
  }

  for (const [label, mutate] of [
    ['replayed generation', value => { value.generation += 1; }],
    ['replayed origin', value => { value.exactOrigin = 'https://drive.google.com'; }],
    ['replayed profile', value => { value.profileId = 'drive-deep-pack-v1'; }],
    ['replayed profile version', value => { value.profileVersion = 'forged-v9'; }],
    ['replayed contextEpoch', value => { value.contextEpoch += 1; }],
    ['replayed capability block reason', value => {
      value.capabilityGroups[0].capabilities[0].executionBlockReason = null;
    }],
    ['forged consequence compatibility', value => {
      value.capabilityGroups[0].capabilities[0].consequenceCompatible = true;
    }],
    ['forged consequence digest', value => {
      value.capabilityGroups[0].capabilities[0].consequenceDigest = 'sha256:' + 'a'.repeat(64);
    }],
    ['projected parameter schema leak', value => {
      value.capabilityGroups[0].capabilities[0].paramSchema = { type: 'object' };
    }],
  ]) {
    const replay = clone(recognized);
    mutate(replay);
    deepFreeze(replay);
    assert.equal(resolverApi.validateResult(replay, authorityFromResult(recognized)), false, label);
  }
}

function runEpochAndDisposeOracle(state) {
  const { resolver, previousEpoch } = state;
  assert.equal(resolver.dispose(), true, 'dispose succeeds');
  assert.equal(resolver.dispose(), true, 'dispose is idempotent');
  const disposed = resolver.resolve(request('https://airbnb.com/'));
  assertClosedFailure(disposed, 'unsupported', 'resolver-disposed', 'post-disposal attempt');
  assert.ok(disposed.contextEpoch > previousEpoch, 'post-disposal attempt advances contextEpoch');
  assert.equal(resolver.currentEpoch(), disposed.contextEpoch);
  assert.equal(Object.isFrozen(resolver), true, 'resolver surface is frozen');
}

function main() {
  assert.deepEqual(resolverApi.STATUS, {
    RECOGNIZED: 'recognized',
    UNCERTAIN: 'uncertain',
    UNSUPPORTED: 'unsupported',
  });
  assert.equal(resolverApi.REASON.NO_STABLE_ENTITY, 'no-stable-entity');
  assert.equal(resolverApi.REASON.RESOLVER_DISPOSED, 'resolver-disposed');
  assert.equal(typeof resolverApi.createResolver, 'function');
  assert.equal(typeof resolverApi.validateResult, 'function');
  assert.equal(Object.isFrozen(resolverApi), true);
  assert.equal(Object.isFrozen(resolverApi.STATUS), true);
  assert.equal(Object.isFrozen(resolverApi.REASON), true);
  assert.equal(globalThis.FSBSkopeoAppContextResolver, resolverApi,
    'classic-script and CommonJS exports share one resolver');

  const genericState = runGenericFailQuietOracle();
  runHostileInputOracle();
  const driveResult = runDriveDelegationOracle();
  runProjectionAndResultReplayOracle(driveResult);
  runEpochAndDisposeOracle(genericState);

  assert.throws(() => resolverApi.createResolver({
    generation: 0,
    projection: genericState.projection,
    resolveAdapter() {},
  }), TypeError, 'invalid generation fails at construction');
  assert.throws(() => resolverApi.createResolver({
    generation: genericState.projection.generation,
    projection: genericState.projection,
    resolveAdapter() {},
    extra: true,
  }), TypeError, 'unknown construction keys fail closed');

  console.log('skopeo app context resolver tests: PASS');
}

main();
