'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ADAPTER_PATH = path.join(ROOT, 'extension', 'content', 'skopeo-adapter-registry.js');
const RENDERER_PATH = path.join(ROOT, 'extension', 'content', 'skopeo-renderer-registry.js');
const ROUTER_PATH = path.join(ROOT, 'extension', 'content', 'skopeo-context-router.js');
const ANCHOR_PATH = path.join(ROOT, 'extension', 'content', 'skopeo-anchor-registry.js');
const ADAPTERS_ONLY = process.argv.includes('--adapters-only');

const profileSchema = require('../extension/utils/skopeo-profile-schema.js');
const deepRouter = require('../extension/content/skopeo-context-router.js');
const profileIndex = require('../extension/catalog/skopeo-profile-index.generated.js');
const projector = require('../extension/utils/skopeo-capability-projector.js');
const appContextResolver = require('../extension/content/skopeo-app-context-resolver.js');
const { GENRE_MATRIX } = require('./fixtures/skopeo-catalog/genre-matrix.js');

const ROUTER_SHA256 = '05ef0cdb0da5a5968edfe52b5d864c093d34b053f15461d60434183e7a4494fe';
const ANCHOR_SHA256 = 'e28fb1d493e42af502d16194e4e1a6a3a3ee750c1111e84afcf5eeeb949fcf37';
const APPROVED_ATOMS = new Set([
  'section-heading',
  'status-row',
  'capability-row',
  'fact-list',
  'item-list',
  'compact-table',
  'timeline',
  'diff',
  'notice',
]);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function assertDeepFrozen(value, label = 'value', seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, `${label} is recursively frozen`);
  for (const key of Reflect.ownKeys(value)) assertDeepFrozen(value[key], `${label}.${String(key)}`, seen);
}

function assertExactKeys(value, keys, label) {
  assert.deepEqual(Reflect.ownKeys(value).sort(), keys.slice().sort(), label);
}

function assertNoExecutableOrRemote(value, label = 'value', seen = new Set()) {
  if (value === null || value === undefined) return;
  assert.notEqual(typeof value, 'function', `${label} contains no function`);
  if (typeof value === 'string') {
    assert.doesNotMatch(value, /(?:https?:\/\/[^\s]+)|(?:data:)|(?:javascript:)/i,
      `${label} contains no remote asset or executable URL`);
    assert.doesNotMatch(value, /[\u202a-\u202e\u2066-\u2069]/,
      `${label} contains no Unicode direction control`);
    assert.ok(value.length <= 512, `${label} text is bounded`);
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal('nodeType' in value, false, `${label} contains no DOM node`);
  for (const key of Reflect.ownKeys(value)) {
    assert.equal(typeof key, 'string', `${label} contains no symbol key`);
    assertNoExecutableOrRemote(value[key], `${label}.${key}`, seen);
  }
}

function loadRegistries() {
  const required = ADAPTERS_ONLY ? [ADAPTER_PATH] : [ADAPTER_PATH, RENDERER_PATH];
  const missing = required.filter(filePath => !fs.existsSync(filePath));
  assert.equal(
    missing.length,
    0,
    `missing ${missing.map(filePath => path.basename(filePath)).join(' and ')}`
  );
  delete require.cache[require.resolve(ADAPTER_PATH)];
  const adapters = require(ADAPTER_PATH);
  assert.strictEqual(globalThis.FSBSkopeoAdapterRegistry, adapters,
    'classic-script adapter export matches CommonJS');
  let renderers = null;
  if (!ADAPTERS_ONLY) {
    delete require.cache[require.resolve(RENDERER_PATH)];
    renderers = require(RENDERER_PATH);
    assert.strictEqual(globalThis.FSBSkopeoRendererRegistry, renderers,
      'classic-script renderer export matches CommonJS');
  }
  return { adapters, renderers };
}

function assertFixtureMatrix() {
  assert.equal(GENRE_MATRIX.length, 9, 'all nine approved genre rows exist');
  assert.deepEqual(GENRE_MATRIX.map(row => row.genre), Array.from(profileSchema.GENRES),
    'fixture genre order matches the profile schema allowlist');
  assertDeepFrozen(GENRE_MATRIX, 'genre matrix');
  const ids = new Set();
  for (const fixture of GENRE_MATRIX) {
    assert.equal(ids.has(fixture.id), false, `${fixture.id} is distinct`);
    ids.add(fixture.id);
    assert.equal(fixture.evidenceState, 'automated-fixture', `${fixture.id} is automated evidence`);
    assert.notEqual(fixture.liveApproval, 'live-approved', `${fixture.id} does not claim live approval`);
    assert.equal(fixture.projection.genre, fixture.genre, `${fixture.id} keeps genre separate`);
    assert.equal(fixture.projection.adapterId, fixture.adapterId, `${fixture.id} keeps adapter separate`);
    assert.equal(fixture.projection.rendererId, fixture.rendererId, `${fixture.id} keeps renderer separate`);
    assert.ok(fixture.requestedLens, `${fixture.id} carries a separate requested lens`);
    assert.ok(Array.isArray(fixture.readyCapabilities) && fixture.readyCapabilities.length > 0,
      `${fixture.id} carries ready capabilities`);
    assert.ok(Array.isArray(fixture.nonReadyCapabilities) && fixture.nonReadyCapabilities.length > 0,
      `${fixture.id} carries non-ready capabilities`);
    assert.ok(['read', 'write', 'destructive'].includes(fixture.risk.highest),
      `${fixture.id} carries separate risk`);
    assert.ok(['ambient', 'anchored'].includes(fixture.expected.firstAttention),
      `${fixture.id} has a deterministic first state`);
    assert.deepEqual(fixture.expected.off, {
      shellPresent: false,
      primitives: [],
      ownedResourceTotal: 0,
    }, `${fixture.id} has deterministic Off expectations`);
    assert.equal(fixture.expected.normalWidth.width >= 480, true, `${fixture.id} has normal-width evidence`);
    assert.equal(fixture.expected.narrow.width < 480, true, `${fixture.id} has below-480 evidence`);
  }
}

function closedInput(fixture, evidence = fixture.adapterEvidence) {
  const projection = fixture.projection;
  const capabilityGroups = [{
    id: 'fixture-actions',
    label: 'Fixture actions',
    capabilities: fixture.readyCapabilities.concat(fixture.nonReadyCapabilities),
  }];
  return deepFreeze({
    generation: projection.generation,
    exactOrigin: projection.exactOrigin,
    service: projection.service,
    appStem: projection.appStem,
    profileId: projection.profileId,
    profileVersion: projection.profileVersion,
    contextEpoch: projection.contextEpoch,
    url: fixture.id === 'drive-docs-deep-pack'
      ? 'https://docs.google.com/document/d/doc-123/edit'
      : projection.url,
    app: projection.app,
    genre: projection.genre,
    requestedLens: fixture.requestedLens,
    adapterEvidence: evidence,
    capabilityGroups,
    risk: fixture.risk,
  });
}

function expectedAdapterKeys() {
  return [
    'adapterId', 'kind', 'generation', 'exactOrigin', 'profileId', 'profileVersion',
    'contextEpoch', 'genre', 'semanticEntity', 'anchorDescriptor', 'evidence',
  ];
}

function testAdapterAllowlistAndStableEvidence(adapters) {
  assert.deepEqual(Array.from(adapters.ADAPTER_IDS), Array.from(profileSchema.ADAPTER_IDS),
    'adapter allowlist has exact schema parity');
  assert.equal(Object.isFrozen(adapters.ADAPTER_IDS), true, 'adapter allowlist is frozen');
  assert.equal(adapters.resolve('unknown-adapter-v1', closedInput(GENRE_MATRIX[0])), null,
    'unknown adapter fails closed');
  assert.equal(adapters.resolve('__proto__', closedInput(GENRE_MATRIX[0])), null,
    'prototype-shaped unknown adapter fails closed');

  const generic = GENRE_MATRIX.find(row => row.genre === 'generic-app');
  assert.equal(adapters.resolve(generic.adapterId, closedInput(generic)), null,
    'generic adapter remains intentionally unanchored');

  for (const fixture of GENRE_MATRIX.filter(row =>
    !['generic-app', 'drive-docs-deep-pack', 'dashboard-admin'].includes(row.genre))) {
    const input = closedInput(fixture);
    const resolved = adapters.resolve(fixture.adapterId, input);
    assert.ok(resolved, `${fixture.id} stable evidence resolves`);
    assertExactKeys(resolved, expectedAdapterKeys(), `${fixture.id} adapter result is exact-key`);
    assert.equal(resolved.adapterId, fixture.adapterId, `${fixture.id} adapter ID is exact`);
    assert.equal(resolved.kind, 'stable-entity', `${fixture.id} uses the stable entity contract`);
    assert.equal(resolved.generation, input.generation, `${fixture.id} generation is unchanged`);
    assert.equal(resolved.exactOrigin, input.exactOrigin, `${fixture.id} origin is unchanged`);
    assert.equal(resolved.profileId, input.profileId, `${fixture.id} profile is unchanged`);
    assert.equal(resolved.profileVersion, input.profileVersion, `${fixture.id} profile version is unchanged`);
    assert.equal(resolved.contextEpoch, input.contextEpoch, `${fixture.id} context epoch is unchanged`);
    assert.deepEqual(resolved.semanticEntity, {
      kind: 'opaque-target',
      id: fixture.entity.id,
      label: fixture.entity.label,
    }, `${fixture.id} propagates the app-native entity label`);
    assert.deepEqual(resolved.anchorDescriptor, {
      anchorId: `opaque-target:${fixture.entity.id}`,
      candidateLocators: [{ kind: 'opaque-target-key', value: fixture.entity.id }],
      validators: ['semantic-identity', 'connected', 'geometry'],
    }, `${fixture.id} emits only the closed stable locator`);
    assert.ok(resolved.evidence.length <= 8, `${fixture.id} evidence is bounded`);
    assertDeepFrozen(resolved, `${fixture.id} adapter result`);

    const unstableSets = [
      [],
      [{ signal: 'url-path', value: `/records/${fixture.entity.id}` }],
      [{ signal: 'visible-label', value: fixture.entity.label }],
      [{ signal: 'css-class', value: 'selected-row' }],
      [{ signal: 'list-position', value: '4' }],
      [
        { signal: 'exact-origin', value: input.exactOrigin },
        { signal: 'visible-label', value: fixture.entity.label },
      ],
    ];
    for (const evidence of unstableSets) {
      assert.equal(adapters.resolve(fixture.adapterId, closedInput(fixture, evidence)), null,
        `${fixture.id} path/text/CSS/list evidence remains unanchored`);
    }

    for (const [label, mutate] of [
      ['generation', value => { value.generation = 0; }],
      ['exact origin', value => { value.exactOrigin = 'https://evil.example'; }],
      ['profile ID', value => { value.profileId = 'forged/profile'; }],
      ['profile version', value => { value.profileVersion = ''; }],
      ['genre', value => { value.genre = 'generic-app'; }],
    ]) {
      const forged = clone(input);
      mutate(forged);
      deepFreeze(forged);
      assert.equal(adapters.resolve(fixture.adapterId, forged), null,
        `${fixture.id} forged ${label} fails closed`);
    }
  }

  const dashboard = GENRE_MATRIX.find(row => row.genre === 'dashboard-admin');
  assert.equal(adapters.resolve(dashboard.adapterId, closedInput(dashboard)), null,
    'dashboard without stable evidence remains app-level and unanchored');
}

function testGenericAppContextIntegration(adapters) {
  const projection = projector.createProjection({
    tabId: 71,
    generation: 23,
    url: 'https://airbnb.com/rooms/123',
  }, profileIndex);
  assert.equal(projection.status, 'recognized', 'generic integration projection is recognized');
  const resolver = appContextResolver.createResolver({
    generation: projection.generation,
    projection,
    resolveAdapter: adapters.resolve,
  });
  const result = resolver.resolve({
    url: 'https://airbnb.com/rooms/123',
    requestedLens: 'app-actions',
    adapterEvidence: [
      { signal: 'url-path', value: '/rooms/123' },
      { signal: 'visible-label', value: 'Room 123' },
      { signal: 'css-selector', value: '[data-room-id="123"]' },
    ],
  });
  assert.equal(result.status, 'recognized', 'generic app resolves fail-quiet');
  assert.equal(result.genre, 'generic-app');
  assert.equal(result.semanticEntity, null, 'generic app invents no entity');
  assert.equal(result.anchorDescriptor, null, 'generic app invents no anchor');
  assert.equal(result.reason, 'no-stable-entity');
  assert.deepEqual(result.evidence, [], 'generic brittle evidence is not propagated');
}

function testDriveDelegation(adapters) {
  const fixture = GENRE_MATRIX.find(row => row.genre === 'drive-docs-deep-pack');
  const input = closedInput(fixture);
  let createCalls = 0;
  let routeCalls = 0;
  const previous = globalThis.FSBSkopeoContextRouter;
  globalThis.FSBSkopeoContextRouter = Object.freeze({
    createRouter(options) {
      createCalls += 1;
      const router = deepRouter.createRouter(options);
      return Object.freeze({
        route(value) {
          routeCalls += 1;
          return router.route(value);
        },
        currentEpoch: router.currentEpoch,
        dispose: router.dispose,
      });
    },
  });
  try {
    const resolved = adapters.resolve(fixture.adapterId, input);
    assert.equal(createCalls, 1, 'Drive/Docs creates the existing router exactly once');
    assert.equal(routeCalls, 1, 'Drive/Docs delegates to the existing router exactly once');
    assert.ok(resolved, 'Drive/Docs recognized result crosses the registry seam');
    assert.equal(resolved.kind, 'drive-docs-deep-pack');
    assert.deepEqual(resolved.semanticEntity, {
      kind: 'docs-document',
      id: 'doc-123',
      label: 'Vendor agreement',
    }, 'Drive/Docs identity is not reinterpreted');
    assert.deepEqual(resolved.evidence, input.adapterEvidence.slice(0, 3),
      'Drive/Docs stable router evidence passes through exactly');
    assertDeepFrozen(resolved, 'Drive/Docs adapter result');
  } finally {
    globalThis.FSBSkopeoContextRouter = previous;
  }

  const missingStable = closedInput(fixture, [
    { signal: 'exact-origin', value: 'https://docs.google.com' },
    { signal: 'trusted-context-kind', value: 'agreement-reading' },
  ]);
  const expectedFailure = deepRouter.createRouter({ generation: missingStable.generation }).route({
    url: missingStable.url,
    contextKind: 'agreement-reading',
    semanticIdentity: null,
    evidence: missingStable.adapterEvidence,
  });
  const actualFailure = adapters.resolve(fixture.adapterId, missingStable);
  assert.deepEqual(actualFailure, expectedFailure,
    'Drive/Docs uncertain result passes through without a guessed fallback');
}

function testAdapterSourceSafety(adapters) {
  const source = fs.readFileSync(ADAPTER_PATH, 'utf8');
  assert.equal(/querySelector|MutationObserver|innerHTML|fetch\s*\(|XMLHttpRequest/.test(source), false,
    'adapter registry contains no DOM observer, HTML sink, or remote call');
  assert.equal(/\beval\s*\(|new\s+Function/.test(source), false,
    'adapter registry contains no dynamic code execution');
  assert.equal(typeof adapters.resolve, 'function');
}

function testRendererAllowlistAndFixtures(renderers) {
  assert.deepEqual(Array.from(renderers.RENDERER_IDS), Array.from(profileSchema.RENDERER_IDS),
    'renderer allowlist has exact schema parity');
  assert.equal(Object.isFrozen(renderers.RENDERER_IDS), true, 'renderer allowlist is frozen');
  assert.equal(renderers.render('unknown-renderer-v1', GENRE_MATRIX[0].typedResult, { width: 1024 }), null,
    'unknown renderer fails closed');
  assert.equal(renderers.render('constructor', GENRE_MATRIX[0].typedResult, { width: 1024 }), null,
    'prototype-shaped unknown renderer fails closed');

  for (const fixture of GENRE_MATRIX) {
    const normal = renderers.render(fixture.rendererId, fixture.typedResult, { width: 1024 });
    assert.ok(Array.isArray(normal), `${fixture.id} renders an atom array`);
    assert.deepEqual(normal.map(atom => atom.type), fixture.expected.atoms,
      `${fixture.id} renders deterministic approved atoms`);
    assert.equal(renderers.validateAtoms(normal), true, `${fixture.id} atoms validate`);
    assert.ok(normal.every(atom => APPROVED_ATOMS.has(atom.type)), `${fixture.id} uses the closed nine atoms`);
    assert.ok(normal.length <= 12, `${fixture.id} sections are bounded`);
    assertDeepFrozen(normal, `${fixture.id} rendered atoms`);
  }

  const clonedResult = clone(GENRE_MATRIX[0].typedResult);
  assert.equal(Object.isFrozen(clonedResult), false, 'message-shaped result clone is mutable input data');
  const clonedAtoms = renderers.render('reader-knowledge-v1', clonedResult, { width: 1024 });
  assert.deepEqual(clonedAtoms.map(atom => atom.type), ['fact-list'],
    'message-shaped exact result data renders without inherited freeze state');
  assertDeepFrozen(clonedAtoms, 'message-shaped rendered atoms');

  const dashboard = GENRE_MATRIX.find(row => row.genre === 'dashboard-admin');
  const normalTable = renderers.render(dashboard.rendererId, dashboard.typedResult, { width: 480 });
  assert.equal(normalTable[0].type, 'compact-table', 'normal-width table stays compact-table');
  const narrow = renderers.render(dashboard.rendererId, dashboard.typedResult, { width: 479 });
  assert.equal(narrow.some(atom => atom.type === 'compact-table'), false,
    'narrow rendering removes compact-table');
  assert.ok(narrow.length > 0 && narrow.every(atom => atom.type === 'fact-list'),
    'narrow table rows become labelled fact-list atoms');
  assert.deepEqual(narrow[0].items, [
    { label: 'Metric', value: 'Latency' },
    { label: 'Value', value: '18 ms' },
  ], 'narrow fact-list labels retain column meaning');
}

function testRendererBoundsAndHostileText(renderers) {
  const rendererId = 'drive-docs-deep-pack-v1';
  const HTML = '<img src=x onerror=globalThis.__pwned=1>';
  const hostile = deepFreeze({
    status: 'success',
    actionLabel: 'Open document',
    sections: [{
      kind: 'items',
      heading: 'Hostile values',
      items: [{
        text: `${HTML}\u202Ehttps://evil.example/pixel`,
        metadata: 'x'.repeat(900),
      }],
    }],
  });
  const atoms = renderers.render(rendererId, hostile, { width: 1024 });
  assert.equal(renderers.validateAtoms(atoms), true, 'hostile text normalizes to valid atoms');
  assertNoExecutableOrRemote(atoms, 'hostile rendered output');
  assert.equal(JSON.stringify(atoms).includes('<img'), true,
    'HTML-looking text remains inert bounded text rather than defining structure');

  const tooManySections = deepFreeze({
    status: 'success',
    actionLabel: 'Open document',
    sections: Array.from({ length: 13 }, (_, index) => ({
      kind: 'heading',
      text: `Section ${index + 1}`,
    })),
  });
  const sectionFailure = renderers.render(rendererId, tooManySections, { width: 1024 });
  assert.deepEqual(sectionFailure.map(atom => atom.type), ['notice'],
    'more than 12 sections returns one bounded typed notice');

  const tooManyRows = clone(GENRE_MATRIX.find(row => row.genre === 'dashboard-admin').typedResult);
  tooManyRows.sections[0].rows = Array.from({ length: 51 }, (_, index) => [`Row ${index}`, 'Value']);
  deepFreeze(tooManyRows);
  const rowFailure = renderers.render('dashboard-admin-v1', tooManyRows, { width: 1024 });
  assert.deepEqual(rowFailure.map(atom => atom.type), ['notice'],
    'more than 50 table rows returns one bounded typed notice');

  const tooManyColumns = clone(GENRE_MATRIX.find(row => row.genre === 'dashboard-admin').typedResult);
  tooManyColumns.sections[0].columns = Array.from({ length: 9 }, (_, index) => `Column ${index}`);
  tooManyColumns.sections[0].rows = [Array.from({ length: 9 }, () => 'Value')];
  deepFreeze(tooManyColumns);
  assert.deepEqual(
    renderers.render('dashboard-admin-v1', tooManyColumns, { width: 1024 }).map(atom => atom.type),
    ['notice'],
    'more than eight columns returns one bounded typed notice'
  );

  const callbackResult = clone(GENRE_MATRIX[0].typedResult);
  callbackResult.callback = function callback() {};
  deepFreeze(callbackResult);
  assert.deepEqual(
    renderers.render('reader-knowledge-v1', callbackResult, { width: 1024 }).map(atom => atom.type),
    ['notice'],
    'functions and unsupported structure reduce to a typed notice'
  );

  const typedError = deepFreeze({
    status: 'error',
    actionLabel: 'Open document',
    errorCode: 'TARGET_STALE',
  });
  const errorAtoms = renderers.render(rendererId, typedError, { width: 1024 });
  assert.equal(errorAtoms[0].type, 'notice');
  assert.equal(errorAtoms[0].message,
    'Open document didn’t finish. Review the target and try the action again.',
  'typed error follows the exact action-name and safe-recovery grammar');
  assert.equal(JSON.stringify(errorAtoms).includes('TARGET_STALE'), false,
    'raw typed/internal errors are not shown');

  const malformed = renderers.render(rendererId, { exception: 'secret stack' }, { width: 1024 });
  assert.equal(malformed[0].message,
    'The action didn’t finish. Review the target and try the action again.',
  'malformed results use generic safe recovery copy');
  assert.equal(JSON.stringify(malformed).includes('secret stack'), false, 'raw exceptions and secrets are dropped');

  const badAtoms = deepFreeze([{ type: 'notice', tone: 'info', heading: 'Notice', message: 'Safe', nextStep: 'Review', html: '<b>x</b>' }]);
  assert.equal(renderers.validateAtoms(badAtoms), false, 'atom validation rejects unsupported HTML keys');
  assert.equal(renderers.validateAtoms(deepFreeze([{ type: 'remote-image', url: 'https://evil.example' }])), false,
    'atom validation rejects remote assets and unknown atoms');
}

function testRendererSourceSafety() {
  const source = fs.readFileSync(RENDERER_PATH, 'utf8');
  assert.equal(/innerHTML|Markdown|iframe|svg|createElement|querySelector|fetch\s*\(/.test(source), false,
    'renderer registry contains no executable, DOM, Markdown, SVG, iframe, or remote path');
  assert.equal(/\beval\s*\(|new\s+Function/.test(source), false,
    'renderer registry contains no dynamic execution');
}

function testDriveSourcesRemainByteExact() {
  assert.equal(sha256(ROUTER_PATH), ROUTER_SHA256,
    'the existing Phase 53 Drive/Docs router remains byte-for-byte unchanged');
  assert.equal(sha256(ANCHOR_PATH), ANCHOR_SHA256,
    'the existing Phase 53 anchor registry remains byte-for-byte unchanged');
}

function main() {
  assertFixtureMatrix();
  const { adapters, renderers } = loadRegistries();
  testAdapterAllowlistAndStableEvidence(adapters);
  testGenericAppContextIntegration(adapters);
  testDriveDelegation(adapters);
  testAdapterSourceSafety(adapters);
  testDriveSourcesRemainByteExact();
  console.log('skopeo genre adapters: PASS');
  if (ADAPTERS_ONLY) return;
  testRendererAllowlistAndFixtures(renderers);
  testRendererBoundsAndHostileText(renderers);
  testRendererSourceSafety();
  console.log('skopeo genre renderers: PASS');
  console.log('skopeo-genre-adapters: PASS');
}

main();
