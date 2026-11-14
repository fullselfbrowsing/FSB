'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  HOSTILE_TEXT,
  createHarness,
  createEvent,
  assertImportantHostRule
} = require('./skopeo-shell-contract.test.js');

const ROOT = path.resolve(__dirname, '..');
const COMPOSER_PATH = path.join(ROOT, 'extension', 'content', 'skopeo-adaptive-composer.js');
const SHELL_PATH = path.join(ROOT, 'extension', 'content', 'skopeo-shell.js');
const HUD_SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-hud-schema.js');
const CONTENT_COMPOSER_MARKER = 'skopeo hud content composer contract';
const ASK_COMPOSER_MARKER = 'skopeo ask composer contract';

const GENRES = Object.freeze([
  'reader-knowledge',
  'communication',
  'document-editor',
  'worklist-record',
  'dashboard-admin',
  'transactional',
  'media-feed',
  'generic-app',
  'drive-docs-deep-pack'
]);

const ATOMS = Object.freeze([
  'section-heading',
  'status-row',
  'capability-row',
  'fact-list',
  'item-list',
  'compact-table',
  'timeline',
  'diff',
  'notice'
]);

const STATUS_COPY = Object.freeze({
  'guarded-fail-closed': 'Unavailable safely',
  blocked: 'Blocked by policy',
  'bridge-needed': 'Connection required',
  'uat-needed': 'Needs verification',
  'learn-pending': 'Learning pending',
  'discovery-pending': 'Capability discovery pending',
  degraded: 'Capability discovery pending',
  unsupported: 'Not supported in this view'
});

const EXPECTED_MODEL_KEYS = Object.freeze([
  'modelVersion',
  'authority',
  'attention',
  'primitives',
  'lens',
  'entity',
  'readyGroups',
  'unavailableSummary',
  'argumentCollection',
  'rendererRequest',
  'consequence'
].sort());

const FIXTURE_SCHEMA_DIGEST = 'sha256:' + 'a'.repeat(64);
const FIXTURE_CONSEQUENCE_DIGEST = 'sha256:' + 'b'.repeat(64);
const FORM_ARGUMENT_CONTRACT = deepFreeze({
  mode: 'form',
  fields: [{
    name: 'targetId',
    label: 'Target id',
    kind: 'string',
    required: true,
    choices: null,
    minLength: 1,
    maxLength: 80,
    minimum: null,
    maximum: null
  }],
  reason: null,
  schemaDigest: FIXTURE_SCHEMA_DIGEST
});
const UNSUPPORTED_ARGUMENT_CONTRACT = deepFreeze({
  mode: 'unsupported',
  fields: [],
  reason: 'argument-contract-unsupported',
  schemaDigest: FIXTURE_SCHEMA_DIGEST
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function mutableClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function capability(disposition, sideEffectClass, suffix, overrides = {}) {
  const sourceReady = disposition === 't1-ready';
  const consequential = sideEffectClass === 'write' || sideEffectClass === 'destructive';
  const consequenceCompatible = overrides.consequenceCompatible === undefined
    ? sourceReady && consequential
    : overrides.consequenceCompatible;
  const ready = sourceReady && (sideEffectClass === 'read' || consequenceCompatible === true);
  const evidence = {
    't1-ready': ['t1-ready', 't1-ready', 't1-ready'],
    'guarded-fail-closed': ['t1-guarded-fail-closed', 'guarded-fail-closed', 'guarded-fail-closed'],
    blocked: ['blocked', 'blocked-policy', 'blocked'],
    'bridge-needed': ['discovery-pending', 'pattern-d-bridge-blocked', 'bridge-needed'],
    'uat-needed': ['discovery-pending', 'live-uat-required', 'uat-needed'],
    'learn-pending': ['learn-pending', 'network-capture-required', 'degraded-discovery-pending'],
    'discovery-pending': ['discovery-pending', 'app-specific-proof-required', 'discovery-pending'],
    degraded: ['discovery-pending', 'same-origin-proof-required', 'degraded-discovery-pending'],
    unsupported: ['unsupported', 'unsupported', 'unsupported']
  }[disposition];
  assert.ok(evidence, 'fixture disposition is known');
  const stem = sideEffectClass === 'read' ? 'Review' : sideEffectClass === 'write' ? 'Update' : 'Delete';
  return Object.assign({
    slug: 'demo.' + suffix,
    actionLabel: stem + ' quarterly plan',
    effect: sideEffectClass === 'read' ? 'read-only' :
      sideEffectClass === 'write' ? 'changes-service-data' : 'removes-service-data',
    sideEffectClass,
    executionOrigin: 'https://demo.example.com',
    schemaDigest: FIXTURE_SCHEMA_DIGEST,
    executionBlockReason: ready ? null : 'source-not-ready',
    paramSummary: deepFreeze({ count: 1, required: ['targetId'], optional: [], truncated: false }),
    argumentContract: sourceReady ? FORM_ARGUMENT_CONTRACT : UNSUPPORTED_ARGUMENT_CONTRACT,
    consequenceCompatible,
    consequenceDigest: consequenceCompatible ? FIXTURE_CONSEQUENCE_DIGEST : null,
    actionabilityReason: sourceReady && consequential && !consequenceCompatible
      ? 'consequence-contract-missing'
      : sourceReady ? null : 'source-not-ready',
    sourceReadiness: evidence[0],
    sourceTerminalState: evidence[1],
    surfaceStatus: evidence[2],
    presentationDisposition: sourceReady && consequential && !consequenceCompatible
      ? 'unsupported' : disposition,
    executionEnabled: ready,
    invocable: ready
  }, overrides);
}

function allCapabilityGroups() {
  return [{
    id: 'review',
    label: 'Review',
    capabilities: [
      capability('t1-ready', 'read', 'review-plan'),
      capability('t1-ready', 'write', 'update-plan'),
      capability('t1-ready', 'destructive', 'delete-plan'),
      capability('guarded-fail-closed', 'write', 'guarded'),
      capability('blocked', 'write', 'blocked'),
      capability('bridge-needed', 'read', 'bridge'),
      capability('uat-needed', 'read', 'uat'),
      capability('learn-pending', 'read', 'learn'),
      capability('discovery-pending', 'read', 'discover'),
      capability('degraded', 'read', 'degraded'),
      capability('unsupported', 'read', 'unsupported')
    ]
  }];
}

function appNameFor(genre) {
  return ({
    'reader-knowledge': 'Knowledge Base',
    communication: 'Messages',
    'document-editor': 'Documents',
    'worklist-record': 'Issues',
    'dashboard-admin': 'Analytics',
    transactional: 'Orders',
    'media-feed': 'Media',
    'generic-app': 'Example App',
    'drive-docs-deep-pack': 'Google Drive'
  })[genre];
}

function contextFor(genre, options = {}) {
  const withEntity = options.withEntity !== undefined
    ? options.withEntity
    : !['generic-app', 'dashboard-admin'].includes(genre);
  const generation = options.generation || 7;
  const contextEpoch = options.contextEpoch || 3;
  const service = genre === 'drive-docs-deep-pack' ? 'drive.google.com' : 'demo.example.com';
  const exactOrigin = 'https://' + service;
  const semanticEntity = withEntity ? {
    kind: 'opaque-target',
    id: 'target-7',
    label: 'Quarterly plan'
  } : null;
  const anchorDescriptor = withEntity ? {
    anchorId: 'anchor-7',
    contextEpoch,
    semanticIdentity: { kind: 'opaque-target', id: 'target-7' },
    candidateLocators: [{ kind: 'opaque-target-key', value: 'target-7' }],
    validators: ['semantic-identity', 'connected', 'geometry']
  } : null;
  const evidence = withEntity ? [
    { signal: 'exact-origin', value: exactOrigin },
    { signal: 'opaque-target-key', value: 'target-7' }
  ] : [];
  const groups = (options.groups || allCapabilityGroups()).map(function(group) {
    return Object.assign({}, group, {
      capabilities: group.capabilities.map(function(row) {
        return Object.assign({}, row, { executionOrigin: exactOrigin });
      })
    });
  });
  const flat = groups.flatMap(group => group.capabilities);
  const counts = {
    readCount: flat.filter(row => row.sideEffectClass === 'read').length,
    writeCount: flat.filter(row => row.sideEffectClass === 'write').length,
    destructiveCount: flat.filter(row => row.sideEffectClass === 'destructive').length
  };
  const highest = counts.destructiveCount ? 'destructive' : counts.writeCount ? 'write' : 'read';
  return deepFreeze({
    status: 'recognized',
    generation,
    exactOrigin,
    profileId: 'profile-' + genre,
    profileVersion: '2026.07.16',
    contextEpoch,
    app: {
      appStem: genre === 'drive-docs-deep-pack' ? 'gdrive' : 'demo',
      service,
      displayName: options.displayName === undefined ? appNameFor(genre) : options.displayName,
      pageNoun: options.pageNoun === undefined ? 'view' : options.pageNoun
    },
    genre,
    lens: 'app-actions',
    semanticEntity,
    anchorDescriptor,
    capabilityGroups: groups,
    risk: Object.assign({ highest }, counts),
    reason: withEntity ? null : 'no-stable-entity',
    evidence
  });
}

function inputFor(context, options = {}) {
  return {
    context,
    intent: options.intent || { kind: 'initial', source: 'explicit-invocation' },
    selectedGroupId: options.selectedGroupId === undefined ? null : options.selectedGroupId,
    selectedActionSlug: options.selectedActionSlug === undefined ? null : options.selectedActionSlug,
    anomalyEvidence: options.anomalyEvidence === undefined ? null : options.anomalyEvidence,
    result: options.result === undefined ? null : options.result,
    consequence: options.consequence === undefined ? null : options.consequence,
    argumentCollection: options.argumentCollection === undefined ? null : options.argumentCollection
  };
}

function argumentCollection(overrides = {}) {
  return Object.assign({
    collectionEpoch: 4,
    errorField: null,
    errorMessage: null
  }, overrides);
}

function completeConsequence(actionSlug = 'demo.update-plan', actionLabel = 'Update quarterly plan') {
  return {
    actionSlug,
    actionLabel,
    target: 'quarterly plan',
    effect: 'This updates the plan for everyone who can open it.',
    parameterSummary: 'Status changes to approved.',
    gerund: 'Updating quarterly plan'
  };
}

function result(status, overrides = {}) {
  return Object.assign({
    status,
    actionLabel: null,
    recovery: null
  }, overrides);
}

function loadComposer() {
  assert.ok(fs.existsSync(COMPOSER_PATH), 'missing extension/content/skopeo-adaptive-composer.js');
  delete require.cache[require.resolve(COMPOSER_PATH)];
  return require(COMPOSER_PATH);
}

function loadComposerInVm() {
  const source = fs.readFileSync(COMPOSER_PATH, 'utf8');
  const sandbox = { URL, Object, Array, Set, Map, Reflect, Number, String, Boolean, RegExp };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'skopeo-adaptive-composer.js' });
  return sandbox.FSBSkopeoAdaptiveComposer;
}

function composeContractInClassicVm(projection, withHudSchema) {
  const sandbox = { URL, projectionJson: JSON.stringify(projection) };
  vm.createContext(sandbox);
  if (withHudSchema) {
    vm.runInContext(fs.readFileSync(HUD_SCHEMA_PATH, 'utf8'), sandbox, {
      filename: 'skopeo-hud-schema.js'
    });
  }
  vm.runInContext(fs.readFileSync(COMPOSER_PATH, 'utf8'), sandbox, {
    filename: 'skopeo-adaptive-composer.js'
  });
  vm.runInContext(
    'globalThis.contractModel = FSBSkopeoAdaptiveComposer.composeContractView(JSON.parse(projectionJson));',
    sandbox
  );
  return {
    composer: sandbox.FSBSkopeoAdaptiveComposer,
    model: sandbox.contractModel
  };
}

function loadShell() {
  assert.ok(fs.existsSync(SHELL_PATH), 'missing extension/content/skopeo-shell.js');
  delete require.cache[require.resolve(SHELL_PATH)];
  return require(SHELL_PATH);
}

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.ok(Object.isFrozen(value), 'render model data is recursively frozen');
  for (const key of Reflect.ownKeys(value)) assertDeepFrozen(value[key], seen);
}

function assertExactKeys(value, keys, label) {
  assert.deepStrictEqual(Reflect.ownKeys(value).sort(), Array.from(keys).sort(), label);
}

function assertNoUnsafeModelValue(value, label, seen = new Set(), pathName = '') {
  if (value === null || ['boolean', 'number'].includes(typeof value)) return;
  if (typeof value === 'string') {
    if (pathName === 'authority.exactOrigin') {
      assert.match(value, /^https:\/\/[a-z0-9.-]+$/, label);
      return;
    }
    assert.doesNotMatch(value, /<[^>]+>|(?:https?:\/\/)|(?:javascript:)|(?:data:)|\{[^}]+\}/i, label);
    return;
  }
  assert.notStrictEqual(typeof value, 'function', label);
  assert.ok(value && typeof value === 'object' && !seen.has(value), label);
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const nextPath = pathName ? pathName + '.' + key : String(key);
    assertNoUnsafeModelValue(value[key], label, seen, nextPath);
  }
}

function testExportsAndClosedModel(composer) {
  assert.strictEqual(composer.MODEL_VERSION, 1);
  assert.deepStrictEqual(Array.from(composer.ATOM), Array.from(ATOMS));
  assert.ok(Object.isFrozen(composer.ATOM));
  assert.strictEqual(typeof composer.compose, 'function');
  assert.strictEqual(typeof composer.validateRenderModel, 'function');
  assert.strictEqual(loadComposerInVm().MODEL_VERSION, 1, 'classic-script global export works in a VM');

  const model = composer.compose(inputFor(contextFor('reader-knowledge')));
  assert.ok(model);
  assertExactKeys(model, EXPECTED_MODEL_KEYS, 'model has the closed top-level shape');
  assert.ok(composer.validateRenderModel(model));
  assertDeepFrozen(model);
  assertNoUnsafeModelValue(model, 'model contains no HTML, remote address, callback, or raw template token');
}

function testGenreSparseComposition(composer) {
  for (const genre of GENRES) {
    const context = contextFor(genre);
    const model = composer.compose(inputFor(context));
    assert.ok(model, genre + ' composes');
    assert.strictEqual(model.rendererRequest.genre, genre);
    assert.ok(composer.validateRenderModel(model), genre + ' model validates');
    assert.ok(['ambient', 'anchored'].includes(model.attention), genre + ' starts Ambient/Anchored only');
    assert.strictEqual(model.primitives.includes('gate'), false, genre + ' never starts with a gate');
    assert.strictEqual(model.primitives.includes('ghost'), false, genre + ' never starts with ghosting');
    assert.ok(model.rendererRequest.requestedAtoms.every(atom => ATOMS.includes(atom)), genre + ' atoms are closed');
    if (context.semanticEntity && !['dashboard-admin'].includes(genre)) {
      assert.strictEqual(model.attention, 'anchored', genre + ' may truthfully anchor stable evidence');
      assert.deepStrictEqual(Array.from(model.primitives), ['anchor', 'chip', 'rail']);
    } else {
      assert.strictEqual(model.attention, 'ambient', genre + ' stays Ambient without an anchored default');
      assert.deepStrictEqual(Array.from(model.primitives), ['rail']);
    }
  }

  const genericWithForgedEntity = contextFor('generic-app', { withEntity: true });
  const generic = composer.compose(inputFor(genericWithForgedEntity));
  assert.strictEqual(generic.attention, 'ambient');
  assert.strictEqual(generic.entity, null);
  for (const forbidden of ['anchor', 'chip', 'halo']) {
    assert.strictEqual(generic.primitives.includes(forbidden), false, 'generic output omits ' + forbidden);
  }
}

function testExplicitAttentionAndAnomaly(composer) {
  const stable = contextFor('worklist-record');
  const anomaly = {
    validated: true,
    kind: 'anomaly',
    label: 'Deadline changed',
    evidenceId: 'anomaly-7'
  };
  const anchored = composer.compose(inputFor(stable, { anomalyEvidence: anomaly }));
  assert.deepStrictEqual(Array.from(anchored.primitives), ['anchor', 'chip', 'rail', 'halo']);

  const invalidAnomaly = composer.compose(inputFor(stable, {
    anomalyEvidence: Object.assign({}, anomaly, { validated: false })
  }));
  assert.strictEqual(invalidAnomaly.primitives.includes('halo'), false, 'unvalidated anomaly cannot create halo');

  const focused = composer.compose(inputFor(stable, {
    intent: { kind: 'open-actions', source: 'skopeo-control' }
  }));
  assert.strictEqual(focused.attention, 'focused');
  assert.deepStrictEqual(Array.from(focused.primitives), ['anchor', 'chip'], 'Focused remains sparse');
  assert.strictEqual(focused.primitives.includes('halo'), false);

  const genericFocused = composer.compose(inputFor(contextFor('generic-app'), {
    intent: { kind: 'open-actions', source: 'skopeo-control' }
  }));
  assert.strictEqual(genericFocused.attention, 'focused');
  assert.deepStrictEqual(Array.from(genericFocused.primitives), [], 'path/text-only generic Focused has no anchor/chip/halo');

  const automatic = composer.compose(inputFor(stable, {
    intent: { kind: 'open-actions', source: 'automatic' }
  }));
  assert.strictEqual(automatic, null, 'automatic Focused escalation is rejected');

  const readyWrite = composer.compose(inputFor(stable, {
    intent: { kind: 'select-action', source: 'skopeo-control' },
    selectedGroupId: 'review',
    selectedActionSlug: 'demo.update-plan',
    consequence: completeConsequence()
  }));
  assert.strictEqual(readyWrite.attention, 'interstitial',
    'source Ready write with exact consequence compatibility opens Interstitial');
  assert.ok(readyWrite.consequence, 'compatible write carries the one confirmation model');
  assert.strictEqual(readyWrite.readyGroups.flatMap(group => group.rows)
    .some(row => row.slug === 'demo.update-plan'), true, 'compatible write has one interactive control');
  assert.strictEqual(readyWrite.unavailableSummary.rows
    .some(row => row.label === 'Update quarterly plan' && row.disposition === 'unsupported'), false,
  'compatible write is not duplicated as unsupported status text');

  const staticWriteGroups = deepFreeze([{
    id: 'review',
    label: 'Review',
    capabilities: [capability('t1-ready', 'write', 'update-plan', {
      consequenceCompatible: false,
      consequenceDigest: null,
      presentationDisposition: 'unsupported',
      actionabilityReason: 'consequence-contract-missing',
      executionEnabled: false,
      invocable: false
    })]
  }]);
  const staticWrite = composer.compose(inputFor(contextFor('communication', { groups: staticWriteGroups }), {
    intent: { kind: 'select-action', source: 'skopeo-control' },
    selectedGroupId: 'review',
    selectedActionSlug: 'demo.update-plan',
    consequence: completeConsequence()
  }));
  assert.strictEqual(staticWrite.attention, 'focused',
    'source-Ready write without exact consequence compatibility remains static');
  assert.strictEqual(staticWrite.consequence, null,
    'forged content consequence cannot create an action without the projected digest');

  const readyRead = composer.compose(inputFor(stable, {
    intent: { kind: 'select-action', source: 'skopeo-control' },
    selectedGroupId: 'review',
    selectedActionSlug: 'demo.review-plan',
    consequence: completeConsequence('demo.review-plan', 'Review quarterly plan')
  }));
  assert.strictEqual(readyRead.attention, 'focused', 'ready reads do not open a consequence gate');
  assert.strictEqual(readyRead.consequence, null);

  const guarded = composer.compose(inputFor(stable, {
    intent: { kind: 'select-action', source: 'skopeo-control' },
    selectedGroupId: 'review',
    selectedActionSlug: 'demo.guarded',
    consequence: completeConsequence('demo.guarded', 'Update quarterly plan')
  }));
  assert.strictEqual(guarded.attention, 'focused', 'non-ready rows cannot open Interstitial');

  const incomplete = composer.compose(inputFor(stable, {
    intent: { kind: 'select-action', source: 'skopeo-control' },
    selectedGroupId: 'review',
    selectedActionSlug: 'demo.update-plan',
    consequence: Object.assign(completeConsequence(), { target: '' })
  }));
  assert.strictEqual(incomplete.attention, 'focused', 'incomplete consequence remains Focused');
  assert.strictEqual(incomplete.consequence, null);
}

function testReadinessAndCopy(composer) {
  const focused = composer.compose(inputFor(contextFor('communication'), {
    intent: { kind: 'open-actions', source: 'skopeo-control' }
  }));
  assert.strictEqual(focused.lens.label, 'Skopeo · Messages');
  assert.strictEqual(focused.lens.actionLabel, 'Open Messages actions');
  assert.strictEqual(focused.rendererRequest.copy.focusedTitle, 'Message: Quarterly plan');
  assert.strictEqual(focused.rendererRequest.copy.backLabel, 'Back to Messages overview');
  assert.strictEqual(focused.rendererRequest.copy.turnOffLabel, 'Turn off Skopeo in this tab');
  assert.strictEqual(focused.unavailableSummary.heading, 'Unavailable actions');
  assert.strictEqual(focused.readyGroups.flatMap(group => group.rows).length, 3,
    'collector-justified reads and exact consequence-compatible writes are actionable');
  assert.ok(focused.readyGroups.flatMap(group => group.rows).every(row =>
    row.kind === 'capability-row' && row.status === 'Ready' && row.interactive === true));
  const unavailable = focused.unavailableSummary.rows;
  assert.strictEqual(unavailable.length, Object.keys(STATUS_COPY).length,
    'only genuinely unavailable dispositions remain static status rows');
  assert.ok(unavailable.every(row => row.kind === 'status-row' && row.interactive === false));
  for (const [disposition, copy] of Object.entries(STATUS_COPY)) {
    assert.strictEqual(unavailable.find(row => row.disposition === disposition).status, copy);
  }
  const riskOrder = focused.readyGroups.map(group => group.sideEffectClass);
  assert.deepStrictEqual(riskOrder, ['read', 'write', 'destructive'],
    'ready controls preserve read, write, destructive risk ordering');
  assert.strictEqual(focused.readyGroups[0].rows[0].primary, true, 'one ready primary is selected');
  assert.strictEqual(focused.readyGroups.flatMap(group => group.rows).filter(row => row.primary).length, 1);

  const emptyGroups = deepFreeze([{ id: 'empty', label: 'Review', capabilities: [] }]);
  const empty = composer.compose(inputFor(contextFor('generic-app', { groups: emptyGroups }), {
    intent: { kind: 'open-actions', source: 'skopeo-control' }
  }));
  assert.strictEqual(empty.rendererRequest.copy.emptyHeading, 'No verified actions here');
  assert.strictEqual(
    empty.rendererRequest.copy.emptyBody,
    'Skopeo found no ready capabilities for this view. Change the task lens or open another supported view.'
  );

  for (const failure of [
    result('uncertain'),
    result('unsupported'),
    result('target-withdrawn'),
    result('error', { actionLabel: 'Review quarterly plan', recovery: 'Open the plan and try the action again.' })
  ]) {
    const model = composer.compose(inputFor(contextFor('communication'), {
      intent: { kind: 'open-actions', source: 'skopeo-control' },
      result: failure
    }));
    assert.ok(model.rendererRequest.copy.resultMessage, failure.status + ' has fail-quiet copy');
    assert.doesNotMatch(model.rendererRequest.copy.resultMessage, /\{[^}]+\}/);
  }
  const withdrawn = composer.compose(inputFor(contextFor('communication'), {
    intent: { kind: 'open-actions', source: 'skopeo-control' },
    result: result('target-withdrawn')
  }));
  assert.strictEqual(
    withdrawn.rendererRequest.copy.resultMessage,
    'Skopeo can’t verify this message anymore. Entity actions were removed.'
  );

  const missingTokens = composer.compose(inputFor(contextFor('generic-app', {
    displayName: '',
    pageNoun: ''
  }), {
    intent: { kind: 'open-actions', source: 'skopeo-control' },
    result: result('error', { actionLabel: '', recovery: '' })
  }));
  assert.ok(missingTokens, 'missing copy tokens reduce to complete generic sentences');
  assert.strictEqual(missingTokens.lens.label, 'Skopeo');
  assert.strictEqual(
    missingTokens.rendererRequest.copy.resultMessage,
    'The action didn’t finish. Review the target and try the action again.'
  );
  assertNoUnsafeModelValue(missingTokens, 'generic copy has no raw host, slug, braces, or remote text');
}

function testClosedValidationAndMutations(composer) {
  const initial = composer.compose(inputFor(contextFor('reader-knowledge')));
  const focused = composer.compose(inputFor(contextFor('reader-knowledge'), {
    intent: { kind: 'open-actions', source: 'skopeo-control' }
  }));
  const mutations = [
    ['illegal primitive combination', initial, model => { model.primitives = ['rail', 'gate']; }],
    ['unknown seventh primitive', initial, model => { model.primitives = ['rail', 'toast']; }],
    ['automatic-looking Focused policy breach', focused, model => { model.primitives = ['rail']; }],
    ['ghost outside Focused', initial, model => { model.primitives = ['rail', 'ghost']; }],
    ['halo without entity', composer.compose(inputFor(contextFor('generic-app'))), model => {
      model.primitives = ['rail', 'halo'];
    }],
    ['unknown renderer atom', initial, model => { model.rendererRequest.requestedAtoms = ['toast']; }],
    ['unbounded renderer list', initial, model => { model.rendererRequest.requestedAtoms = Array(40).fill('notice'); }],
    ['HTML in the render model', initial, model => { model.lens.label = '<img src=x onerror=alert(1)>'; }],
    ['remote content in the render model', initial, model => { model.lens.label = 'https://evil.example/asset'; }]
  ];
  const weakenedValidator = value => value && value.modelVersion === 1;
  for (const [name, source, mutate] of mutations) {
    const value = mutableClone(source);
    mutate(value);
    deepFreeze(value);
    assert.strictEqual(weakenedValidator(value), true, name + ' mutation is non-vacuous under a weakened oracle');
    assert.strictEqual(composer.validateRenderModel(value), false, name + ' is rejected');
  }

  const withFunction = mutableClone(initial);
  withFunction.rendererRequest.callback = function () {};
  deepFreeze(withFunction);
  assert.strictEqual(composer.validateRenderModel(withFunction), false, 'callbacks cannot enter a model');

  const wrongInput = inputFor(contextFor('reader-knowledge'));
  wrongInput.automatic = true;
  assert.strictEqual(composer.compose(wrongInput), null, 'input uses exact keys and rejects automatic chrome');

  const hostileContext = mutableClone(contextFor('reader-knowledge'));
  hostileContext.app.displayName = '<img src=x onerror=globalThis.__skopeoPwned=1>';
  deepFreeze(hostileContext);
  const hostileModel = composer.compose(inputFor(hostileContext));
  assert.ok(hostileModel, 'hostile copy fails quiet instead of becoming executable UI');
  assert.strictEqual(hostileModel.lens.label, 'Skopeo');
  assert.strictEqual(JSON.stringify(hostileModel).includes('<img'), false);
}

function testArgumentCollectionModel(composer) {
  const context = contextFor('communication');
  const collecting = composer.compose(inputFor(context, {
    intent: { kind: 'collect-arguments', source: 'skopeo-control' },
    selectedGroupId: 'review',
    selectedActionSlug: 'demo.review-plan',
    argumentCollection: argumentCollection()
  }));
  assert.ok(collecting, 'a current collectable Ready read composes one collector');
  assert.strictEqual(collecting.attention, 'focused');
  assert.ok(collecting.argumentCollection, 'Focused model carries one argument collection state');
  assertExactKeys(collecting.argumentCollection, [
    'collectionEpoch', 'groupId', 'actionSlug', 'argumentContract',
    'submitLabel', 'cancelLabel', 'errorField', 'errorMessage'
  ], 'collector model has a closed shape');
  assert.strictEqual(collecting.argumentCollection.collectionEpoch, 4);
  assert.strictEqual(collecting.argumentCollection.groupId, 'review');
  assert.strictEqual(collecting.argumentCollection.actionSlug, 'demo.review-plan');
  assert.strictEqual(collecting.argumentCollection.argumentContract.mode, 'form');
  assert.deepStrictEqual(
    collecting.argumentCollection.argumentContract.fields.map(field => field.name),
    ['targetId']
  );
  assert.strictEqual(collecting.argumentCollection.errorField, null);
  assert.strictEqual(collecting.argumentCollection.errorMessage, null);
  assert.strictEqual(JSON.stringify(collecting.argumentCollection).includes('placeholder'), false);
  assert.strictEqual(JSON.stringify(collecting.argumentCollection).includes('default'), false);
  assert.strictEqual(JSON.stringify(collecting.argumentCollection).includes('examples'), false);

  const invalid = composer.compose(inputFor(context, {
    intent: { kind: 'collect-arguments', source: 'skopeo-control' },
    selectedGroupId: 'review',
    selectedActionSlug: 'demo.review-plan',
    argumentCollection: argumentCollection({
      errorField: 'targetId',
      errorMessage: 'Check the highlighted field.'
    })
  }));
  assert.strictEqual(invalid.argumentCollection.errorField, 'targetId');
  assert.strictEqual(invalid.argumentCollection.errorMessage, 'Check the highlighted field.');

  const writeCollection = composer.compose(inputFor(context, {
    intent: { kind: 'collect-arguments', source: 'skopeo-control' },
    selectedGroupId: 'review',
    selectedActionSlug: 'demo.update-plan',
    argumentCollection: argumentCollection()
  }));
  assert.ok(writeCollection.argumentCollection,
    'consequence-compatible writes use the bounded argument collector before confirmation');
  assert.strictEqual(writeCollection.argumentCollection.actionSlug, 'demo.update-plan');

  const mutated = mutableClone(collecting);
  mutated.argumentCollection.argumentContract.fields[0].placeholder = 'forged default';
  deepFreeze(mutated);
  assert.strictEqual(composer.validateRenderModel(mutated), false,
    'collector model rejects default/placeholder field injection');
}

function renderedAtoms() {
  return deepFreeze([
    { type: 'section-heading', text: 'Verified result' },
    { type: 'status-row', label: 'Review state', status: 'Ready', detail: null },
    { type: 'capability-row', label: 'Review quarterly plan', status: 'Ready', detail: 'Read only' },
    { type: 'fact-list', heading: 'Plan facts', items: [{ label: 'Owner', value: 'Procurement' }] },
    { type: 'item-list', heading: 'Related items', items: [{ text: HOSTILE_TEXT, metadata: 'Literal textContent' }] },
    { type: 'compact-table', heading: 'Milestones', columns: ['Date', 'State'], rows: [['July 31', 'Open']] },
    { type: 'timeline', heading: 'History', events: [{ time: '09:00', text: 'Plan opened' }] },
    {
      type: 'diff',
      heading: 'Change',
      beforeLabel: 'Before',
      before: 'Draft',
      afterLabel: 'After',
      after: 'Approved'
    },
    {
      type: 'notice',
      tone: 'info',
      heading: 'Next step',
      message: 'Review the target.',
      nextStep: 'Keep reviewing.'
    }
  ]);
}

function mountHarness(shellApi, options = {}) {
  const harness = createHarness(shellApi, options);
  const prepared = harness.shell.prepareAmbient();
  assert.ok(prepared, 'adaptive harness prepares');
  assert.strictEqual(harness.shell.mountAmbient(prepared), true, 'adaptive harness mounts the sole shell');
  return harness;
}

function assertZero(snapshot, shellApi) {
  assert.deepStrictEqual(Object.assign({}, snapshot), Object.assign({}, shellApi.zeroSnapshot()));
}

function testAdaptiveShell(composer, shellApi) {
  assert.strictEqual(typeof shellApi.SkopeoShell.prototype.renderAdaptive, 'function', 'renderAdaptive exists on the sole shell');
  const hostControl = { tagName: 'button', 'aria-label': 'Host control' };
  const harness = mountHarness(shellApi, { popoverSupported: true, generation: 7 });
  const adaptiveActions = [];
  harness.shell.onAdaptiveAction = payload => adaptiveActions.push(payload);
  harness.addHostControl({ left: 400, top: 300, width: 80, height: 32 }, hostControl);
  const hostBefore = harness.document.body.textContent;

  const stable = contextFor('drive-docs-deep-pack');
  const initial = composer.compose(inputFor(stable));
  const hostFocus = harness.addHostControl({ left: 32, top: 240, width: 80, height: 32 }, {
    tagName: 'button',
    'aria-label': 'Original host focus'
  });
  hostFocus.focus();
  assert.strictEqual(harness.shell.renderAdaptive(initial, []), true);
  assert.strictEqual(harness.document.activeElement, hostFocus, 'Ambient/Anchored never steals host focus');
  assert.strictEqual(harness.shadow().querySelector('.skopeo-lens-label').textContent, 'Skopeo · Google Drive');
  assert.strictEqual(harness.shadow().querySelector('[role="region"]').getAttribute('aria-label'), 'Skopeo for Google Drive');
  assert.strictEqual(harness.shadow().querySelectorAll('[aria-live]').length, 1, 'one atomic live region');
  assert.ok(harness.shadow().querySelector('[data-skopeo-primitive="anchor"]'));
  assert.ok(harness.shadow().querySelector('[data-skopeo-primitive="chip"]'));
  const openActions = harness.shadow().querySelector('.skopeo-lens-open');
  openActions.dispatchEvent(createEvent('click', { target: openActions, isTrusted: false }));
  assert.strictEqual(adaptiveActions.length, 0,
    'a hostile synthetic click cannot open the action surface');
  openActions.dispatchEvent(createEvent('click', { target: openActions }));
  assert.strictEqual(adaptiveActions[0].kind, 'open-actions', 'only the explicit Skopeo CTA requests Focused');

  const focused = composer.compose(inputFor(stable, {
    intent: { kind: 'open-actions', source: 'skopeo-control' }
  }));
  assert.strictEqual(harness.shell.renderAdaptive(focused, renderedAtoms()), true);
  const title = harness.shadow().querySelector('.skopeo-focused-title');
  assert.strictEqual(harness.shadow().activeElement, title, 'Focused title receives focus');
  assert.strictEqual(title.textContent, 'Target: Quarterly plan');
  assert.strictEqual(harness.shadow().querySelector('.skopeo-back').textContent, 'Back to Google Drive overview');
  assert.strictEqual(harness.shadow().querySelector('.skopeo-turn-off').textContent, 'Turn off Skopeo in this tab');
  assert.strictEqual(harness.shadow().querySelectorAll('button[data-skopeo-capability]').length, 3,
    'collector-justified reads and consequence-compatible writes are buttons');
  assert.strictEqual(harness.shadow().querySelectorAll('.skopeo-status-row').length,
    Object.keys(STATUS_COPY).length, 'only unavailable dispositions remain static status rows');
  assert.ok(harness.shadow().querySelectorAll('.skopeo-status-row').every(row => row.localName !== 'button'));
  assert.strictEqual(harness.shadow().querySelectorAll('.skopeo-ready-primary').length, 1, 'only one orange ready primary');
  const firstCapability = harness.shadow().querySelector('button[data-skopeo-capability]');
  firstCapability.dispatchEvent(createEvent('click', { target: firstCapability, isTrusted: false }));
  assert.strictEqual(adaptiveActions.length, 1,
    'a hostile synthetic click cannot select a capability');
  firstCapability.dispatchEvent(createEvent('click', { target: firstCapability }));
  assert.strictEqual(adaptiveActions[1].kind, 'select-action', 'only a ready Skopeo button selects an action');
  assert.strictEqual(harness.shadow().querySelector('img'), null, 'hostile atom text never creates markup');
  assert.ok(harness.shadow().textContent.includes(HOSTILE_TEXT), 'hostile atom remains literal textContent');

  const gate = composer.compose(inputFor(stable, {
    intent: { kind: 'select-action', source: 'skopeo-control' },
    selectedGroupId: 'review',
    selectedActionSlug: 'demo.update-plan',
    consequence: completeConsequence()
  }));
  assert.strictEqual(harness.shell.renderAdaptive(gate, []), true, 'trusted write model opens one Gate');
  const confirm = harness.shadow().querySelector('.skopeo-gate-continue');
  confirm.dispatchEvent(createEvent('click', { target: confirm, isTrusted: false }));
  assert.strictEqual(adaptiveActions.filter(payload => payload.kind === 'confirm-consequence').length, 0,
    'a hostile synthetic click cannot confirm a write');
  confirm.dispatchEvent(createEvent('click', { target: confirm }));
  assert.strictEqual(adaptiveActions.filter(payload => payload.kind === 'confirm-consequence').length, 1,
    'a trusted confirmation boundary emits exactly one write confirmation');
  assert.strictEqual(harness.shell.back(), true, 'Gate returns to its exact Focused scope');

  assert.strictEqual(harness.shell.back(), true, 'Focused restores the exact Anchored scope');
  assert.strictEqual(harness.document.activeElement, hostFocus, 'Focused back restores host focus without scrolling');
  assert.strictEqual(harness.document.body.textContent, hostBefore, 'host text remains unchanged');

  const css = harness.shadow().querySelector('style').textContent;
  assertImportantHostRule(css);
  assert.match(css, /\.skopeo-focused-card[\s\S]*width:\s*320px/);
  assert.match(css, /\.skopeo-gate[\s\S]*width:\s*360px/);
  assert.match(css, /@media\s*\(max-width:\s*479px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /forced-colors:\s*active/);
  assert.match(css, /max-width:\s*calc\(100vw\s*-\s*32px\)/);
  assert.match(css, /16px/);
  assert.match(css, /8px/);

  assertZero(harness.shell.destroy('adaptive-oracle'), shellApi);
  assert.strictEqual(harness.host(), null, 'Off removes the sole shell');
}

function testArgumentCollectorShell(composer, shellApi) {
  const collectorContract = deepFreeze({
    mode: 'form',
    fields: [
      {
        name: 'query', label: 'Query', kind: 'string', required: true, choices: null,
        minLength: 1, maxLength: 80, minimum: null, maximum: null
      },
      {
        name: 'include_archived', label: 'Include archived', kind: 'boolean', required: false,
        choices: null, minLength: null, maxLength: null, minimum: null, maximum: null
      },
      {
        name: 'limit', label: 'Limit', kind: 'integer', required: true, choices: null,
        minLength: null, maxLength: null, minimum: 1, maximum: 100
      },
      {
        name: 'mode', label: 'Mode', kind: 'choice', required: true,
        choices: ['recent', 'popular'], minLength: null, maxLength: null, minimum: null, maximum: null
      }
    ],
    reason: null,
    schemaDigest: FIXTURE_SCHEMA_DIGEST
  });
  const groups = [{
    id: 'review',
    label: 'Review',
    capabilities: [
      capability('t1-ready', 'read', 'collect-plan', {
        actionLabel: 'Collect plan facts',
        argumentContract: collectorContract,
        paramSummary: deepFreeze({
          count: 4,
          required: ['limit', 'mode', 'query'],
          optional: ['include_archived'],
          truncated: false
        })
      }),
      capability('unsupported', 'read', 'required-object', {
        actionLabel: 'Required object fixture'
      })
    ]
  }];
  const context = contextFor('communication', { groups });
  const initial = composer.compose(inputFor(context));
  const focused = composer.compose(inputFor(context, {
    intent: { kind: 'open-actions', source: 'skopeo-control' }
  }));
  const collecting = composer.compose(inputFor(context, {
    intent: { kind: 'collect-arguments', source: 'skopeo-control' },
    selectedGroupId: 'review',
    selectedActionSlug: 'demo.collect-plan',
    argumentCollection: argumentCollection({ collectionEpoch: 9 })
  }));
  const invalid = composer.compose(inputFor(context, {
    intent: { kind: 'collect-arguments', source: 'skopeo-control' },
    selectedGroupId: 'review',
    selectedActionSlug: 'demo.collect-plan',
    argumentCollection: argumentCollection({
      collectionEpoch: 9,
      errorField: 'query',
      errorMessage: 'Check the highlighted field.'
    })
  }));
  assert.ok(collecting && invalid, 'collector fixture composes production models');

  const harness = mountHarness(shellApi, { generation: 7 });
  const actions = [];
  harness.shell.onAdaptiveAction = payload => actions.push(payload);
  assert.strictEqual(harness.shell.renderAdaptive(initial, []), true);
  assert.strictEqual(harness.shell.renderAdaptive(focused, []), true);
  const focusedListenerPlateau = harness.shell.getResourceSnapshot().listeners;
  assert.strictEqual(harness.shadow().querySelectorAll('button[data-skopeo-capability]').length, 1,
    'unsupported required object is status text, not a button');
  assert.strictEqual(harness.shadow().querySelectorAll('.skopeo-status-row').length, 1);

  assert.strictEqual(harness.shell.renderAdaptive(collecting, []), true);
  let form = harness.shadow().querySelector('[data-skopeo-argument-form="true"]');
  assert.ok(form, 'argument form is inside the existing Focused card');
  assert.ok(form.closest('.skopeo-focused-card'));
  assert.strictEqual(harness.shadow().querySelectorAll('[data-skopeo-argument-form="true"]').length, 1,
    'one shared collector form exists');

  const query = form.querySelector('[name="query"]');
  const checkbox = form.querySelector('[name="include_archived"]');
  const limit = form.querySelector('[name="limit"]');
  const mode = form.querySelector('[name="mode"]');
  for (const control of [query, checkbox, limit, mode]) {
    assert.ok(control && control.id, control && control.name + ' control has an id');
    const label = form.querySelector('label[for="' + control.id + '"]');
    assert.ok(label, control.name + ' has a programmatic native label');
  }
  assert.strictEqual(query.value, '', 'text control begins blank');
  assert.strictEqual(limit.value, '', 'numeric control begins blank');
  assert.strictEqual(mode.value, '', 'choice begins on its empty option');
  assert.strictEqual(mode.firstElementChild.value, '', 'choice has an empty first option');
  assert.strictEqual(mode.firstElementChild.disabled, true, 'empty choice option cannot become a submitted value');
  assert.strictEqual(checkbox.checked, false, 'boolean begins unchecked');
  assert.strictEqual(query.hasAttribute('placeholder'), false, 'no placeholder prefill is rendered');
  assert.equal(['off', 'new-password'].includes(query.getAttribute('autocomplete')), true,
    'collector uses a safe non-prefill autocomplete policy');
  assert.strictEqual(form.textContent.includes('PAGE DEFAULT MUST NOT PREFILL'), false);
  assert.strictEqual(form.textContent.includes('PAGE EXAMPLE MUST NOT PREFILL'), false);

  query.value = 'SECRET-SENTINEL-MUST-CLEAR';
  assert.strictEqual(harness.shell.renderAdaptive(focused, []), true, 'same-origin route-style recompose withdraws the form');
  assert.strictEqual(query.value, '', 'route withdrawal clears entered values synchronously');
  assert.strictEqual(form.isConnected, false, 'route withdrawal removes the old form');
  assert.strictEqual(harness.shell.getResourceSnapshot().listeners, focusedListenerPlateau,
    'route withdrawal returns listeners to the Focused plateau');

  assert.strictEqual(harness.shell.renderAdaptive(collecting, []), true);
  form = harness.shadow().querySelector('[data-skopeo-argument-form="true"]');
  const hostileSubmit = createEvent('submit', { target: form, isTrusted: false });
  form.dispatchEvent(hostileSubmit);
  assert.strictEqual(hostileSubmit.defaultPrevented, true,
    'an untrusted submit is consumed without navigating the host page');
  assert.strictEqual(actions.filter(payload => payload.kind === 'submit-arguments').length, 0,
    'a hostile synthetic submit cannot emit collected values');
  const blankSubmit = createEvent('submit', { target: form });
  form.dispatchEvent(blankSubmit);
  assert.strictEqual(blankSubmit.defaultPrevented, true, 'native submit never navigates the host page');
  const blankEvents = actions.filter(payload => payload.kind === 'submit-arguments');
  assert.strictEqual(blankEvents.length, 1, 'first invalid submit emits one bounded parser request');
  assert.deepStrictEqual(blankEvents[0].values, {
    query: '', include_archived: false, limit: '', mode: ''
  }, 'shell sends raw own-key values and performs no coercion');
  assert.strictEqual(blankEvents[0].collectionEpoch, 9);

  assert.strictEqual(harness.shell.renderAdaptive(invalid, []), true,
    'runtime parser error recomposes the same Focused collector');
  form = harness.shadow().querySelector('[data-skopeo-argument-form="true"]');
  assert.strictEqual(harness.shadow().activeElement, form.querySelector('[name="query"]'),
    'first invalid field receives focus after parser error');
  assert.strictEqual(form.querySelector('[role="status"]').textContent, 'Check the highlighted field.');

  const tab = createEvent('keydown', { key: 'Tab', target: form.querySelector('[name="query"]') });
  form.dispatchEvent(tab);
  assert.strictEqual(tab.defaultPrevented, false, 'Tab follows the existing non-modal Focused contract');
  const shiftTab = createEvent('keydown', {
    key: 'Tab', shiftKey: true, target: form.querySelector('[name="query"]')
  });
  form.dispatchEvent(shiftTab);
  assert.strictEqual(shiftTab.defaultPrevented, false, 'Shift+Tab follows the existing non-modal Focused contract');

  const validQuery = form.querySelector('[name="query"]');
  validQuery.value = 'quarterly';
  form.querySelector('[name="include_archived"]').checked = true;
  form.querySelector('[name="limit"]').value = '7';
  form.querySelector('[name="mode"]').value = 'recent';
  const validSubmit = createEvent('submit', { target: form });
  form.dispatchEvent(validSubmit);
  form.dispatchEvent(createEvent('submit', { target: form }));
  const submitEvents = actions.filter(payload => payload.kind === 'submit-arguments');
  assert.strictEqual(submitEvents.length, 2,
    'double submit is consumed: one blank parser attempt plus exactly one accepted-form attempt');
  assert.deepStrictEqual(submitEvents[1].values, {
    query: 'quarterly', include_archived: true, limit: '7', mode: 'recent'
  });
  assert.strictEqual(form.querySelector('[type="submit"]').disabled, true,
    'submit is disabled synchronously before async dispatch');

  assert.strictEqual(harness.shell.renderAdaptive(collecting, []), true);
  form = harness.shadow().querySelector('[data-skopeo-argument-form="true"]');
  const escape = createEvent('keydown', { key: 'Escape', target: form.querySelector('[name="query"]') });
  form.dispatchEvent(escape);
  assert.strictEqual(escape.defaultPrevented, true, 'Escape is consumed by the collector before Focused back');
  assert.strictEqual(actions.filter(payload => payload.kind === 'cancel-arguments').length, 1,
    'Escape emits one cancel-arguments event');

  assert.strictEqual(harness.shell.renderAdaptive(collecting, []), true);
  form = harness.shadow().querySelector('[data-skopeo-argument-form="true"]');
  const killValue = form.querySelector('[name="query"]');
  killValue.value = 'SECRET-SENTINEL-MUST-CLEAR';
  assertZero(harness.shell.destroy('argument-collector-kill'), shellApi);
  assert.strictEqual(killValue.value, '', 'kill clears form values before exact-zero teardown');
  assert.strictEqual(form.isConnected, false, 'kill removes the form');
}

function testNarrowTableFallback(composer, shellApi) {
  const harness = mountHarness(shellApi, { width: 420, height: 700, generation: 7 });
  const context = contextFor('dashboard-admin');
  assert.strictEqual(harness.shell.renderAdaptive(composer.compose(inputFor(context)), []), true);
  const focused = composer.compose(inputFor(context, {
    intent: { kind: 'open-actions', source: 'skopeo-control' }
  }));
  const atoms = deepFreeze([{
    type: 'compact-table',
    heading: 'Metrics',
    columns: ['Name', 'Value'],
    rows: [['Latency', '18 ms'], ['Errors', '0']]
  }]);
  assert.strictEqual(harness.shell.renderAdaptive(focused, atoms), true);
  assert.strictEqual(harness.shadow().querySelector('.skopeo-compact-table'), null, 'below 480 compact-table is omitted');
  assert.strictEqual(harness.shadow().querySelectorAll('.skopeo-table-fact-list').length, 2, 'below 480 rows become labelled fact lists');
  assert.ok(harness.shadow().querySelectorAll('.skopeo-actions-stacked').length >= 1, 'narrow actions stack');
  assertZero(harness.shell.destroy('narrow-oracle'), shellApi);
}

function testShellFailClosed(composer, shellApi) {
  const harness = mountHarness(shellApi, { generation: 7 });
  const context = contextFor('reader-knowledge');
  const initial = composer.compose(inputFor(context));
  assert.strictEqual(harness.shell.renderAdaptive(initial, []), true);
  const before = harness.shadow().textContent;

  const stale = mutableClone(composer.compose(inputFor(context, {
    intent: { kind: 'open-actions', source: 'skopeo-control' }
  })));
  stale.authority.generation += 1;
  deepFreeze(stale);
  assert.strictEqual(harness.shell.renderAdaptive(stale, []), false, 'stale generation fails before commit');
  assert.strictEqual(harness.shadow().textContent, before, 'failed staged render rolls back exactly');

  const illegalAtoms = deepFreeze([{ type: 'remote-image', url: 'https://evil.example/pixel' }]);
  const focused = composer.compose(inputFor(context, {
    intent: { kind: 'open-actions', source: 'skopeo-control' }
  }));
  assert.strictEqual(harness.shell.renderAdaptive(focused, illegalAtoms), false, 'unknown atoms fail closed');
  assert.strictEqual(harness.shadow().textContent, before, 'illegal atom render leaves prior scope intact');
  assertZero(harness.shell.destroy('fail-closed-oracle'), shellApi);
}

function contractProjection(mode, body, overrides = {}) {
  return Object.assign({
    version: 'skopeo-hud-projection/1',
    generation: 57,
    exactOrigin: mode === 'reading' ? 'https://docs.google.com' : 'https://drive.google.com',
    profileVersion: 'profile-v57',
    contextEpoch: 12,
    semanticEntityToken: mode === 'reading' ? 'docs-document:opaque-current' : 'drive-folder:opaque-current',
    requestActionToken: 'request-opaque-current',
    projectionToken: 'projection-opaque-current',
    mode,
    currentness: mode === 'contract-closed' ? 'closed' : 'current',
    result: mode === 'contract-closed' ? 'closed' : 'complete',
    body
  }, overrides);
}

function materialDate(type, civilDate, displayDate, trustState = 'accepted') {
  return { state: 'accepted', type, civilDate, displayDate, trustState };
}

function consequence(text) {
  return { state: text === null ? 'not-evaluated' : 'accepted', text };
}

function alertStatus(state = 'scheduled', action = null) {
  return {
    version: 'skopeo-alert-public-status/1',
    state,
    summary: state === 'scheduled' ? 'Local alert scheduled' : 'Not locally deliverable',
    detail: state === 'scheduled'
      ? 'Skopeo will recheck current evidence before showing this local alert.'
      : 'Map the current owner to this Chrome user to enable a local alert.',
    deadlineCivilDate: state === 'not-locally-deliverable' ? null : '2027-05-01',
    alertCivilDate: state === 'not-locally-deliverable' ? null : '2027-04-01',
    action
  };
}

function vendor(index, overrides = {}) {
  const token = 'vendor-opaque-' + String(index).padStart(2, '0');
  return Object.assign({
    vendorToken: token,
    label: index === 1 ? 'Aster " onclick=alert(1)' : 'Vendor ' + String(index).padStart(2, '0'),
    owner: { state: 'assigned', label: 'Owner ' + index },
    documents: {
      indexState: 'complete', total: 2, ready: 2, pending: 0,
      unreadable: 0, downloadBlocked: 0, inaccessible: 0, missing: 0
    },
    governingState: index === 2 ? 'review-required' : 'governing',
    nextMaterialDate: materialDate('renewal', '2027-08-0' + Math.min(index, 9), 'Aug ' + index + ', 2027'),
    consequence: consequence('The current term renews unless accepted notice is delivered.'),
    memoEvidence: 'not-evaluated',
    policyDocument: 'not-evaluated',
    memoRequirement: 'not-evaluated',
    notificationDelivery: 'not-available',
    gaps: [],
    gapOverflow: 0
  }, overrides);
}

function folderProjection() {
  const vendors = Array.from({ length: 10 }, (_, index) => vendor(index + 1));
  vendors[0] = vendor(1, {
    nextMaterialDate: materialDate('expiration', '2027-05-01', 'May 1, 2027'),
    consequence: consequence('The accepted term expires.'),
    memoEvidence: 'on-file',
    policyDocument: 'on-file',
    notificationDelivery: alertStatus('scheduled', {
      actionId: 'alert-remove-owner-opaque',
      kind: 'remove-current-owner-mapping',
      label: 'Remove current owner mapping',
      requiresConfirmation: true
    }),
    gaps: [
      { type: 'unreadable-scan', priority: 'urgent' },
      { type: 'owner-gap', priority: 'urgent' },
      { type: 'version-conflict', priority: 'normal' }
    ]
  });
  vendors[1] = vendor(2, {
    owner: { state: 'unassigned', label: null },
    documents: {
      indexState: 'incomplete', total: 4, ready: 1, pending: 1,
      unreadable: 1, downloadBlocked: 1, inaccessible: 0, missing: 0
    },
    nextMaterialDate: materialDate('notice-deadline', '2027-05-01', 'May 1, 2027'),
    consequence: consequence('The agreement renews unless notice is delivered.'),
    policyDocument: 'missing',
    gaps: [
      { type: 'missing-final', priority: 'urgent' },
      { type: 'policy-document-missing', priority: 'normal' }
    ]
  });
  vendors[2] = vendor(3, {
    owner: { state: 'not-evaluated', label: null },
    nextMaterialDate: { state: 'not-evaluated', type: null, civilDate: null, displayDate: null, trustState: null },
    consequence: consequence(null)
  });
  return contractProjection('folder', {
    manifestState: 'complete',
    vendorCount: 10,
    vendors,
    vendorOverflow: 0,
    nextMaterialDates: [
      {
        vendorToken: vendors[0].vendorToken,
        vendorLabel: vendors[0].label,
        date: vendors[0].nextMaterialDate,
        consequence: vendors[0].consequence
      },
      {
        vendorToken: vendors[1].vendorToken,
        vendorLabel: vendors[1].label,
        date: vendors[1].nextMaterialDate,
        consequence: vendors[1].consequence
      },
      {
        vendorToken: vendors[3].vendorToken,
        vendorLabel: vendors[3].label,
        date: materialDate('termination', '2027-04-01', 'Apr 1, 2027'),
        consequence: consequence('Service ends on the accepted termination date.')
      }
    ],
    nextMaterialDateOverflow: 2,
    urgentGaps: [
      { vendorToken: vendors[1].vendorToken, vendorLabel: vendors[1].label, gap: vendors[1].gaps[0] },
      { vendorToken: vendors[0].vendorToken, vendorLabel: vendors[0].label, gap: vendors[0].gaps[0] },
      { vendorToken: vendors[0].vendorToken, vendorLabel: vendors[0].label, gap: vendors[0].gaps[1] }
    ],
    urgentGapOverflow: 0,
    emptyState: 'not-empty'
  });
}

function readingProjection(readingState = 'historical', governingActionState = 'clause') {
  const governingActionToken = governingActionState === 'not-available'
    ? null : 'citation-primary-opaque';
  return contractProjection('reading', {
    documentLabel: 'Agreement " aria-label=forged',
    sourceState: readingState === 'access-unavailable' ? 'inaccessible' : 'ready',
    readingState,
    governingAction: { state: governingActionState, actionToken: governingActionToken },
    facts: [
      {
        type: 'effective', value: 'Effective January 1, 2026', evidenceRole: 'governing',
        trustState: 'accepted', citationLabel: 'Section 2, page 3',
        actionToken: 'citation-fact-effective-opaque'
      },
      {
        type: 'renewal', value: 'Renews July 1, 2027', evidenceRole: 'governing',
        trustState: 'extracted', citationLabel: 'Section 8, page 9',
        actionToken: 'citation-fact-renewal-opaque'
      },
      {
        type: 'signed', value: 'Signed December 18, 2025', evidenceRole: 'history',
        trustState: 'accepted', citationLabel: 'Signature page', actionToken: null
      }
    ],
    factOverflow: 0,
    gaps: [
      { type: 'version-conflict', priority: 'urgent' },
      { type: 'ambiguous', priority: 'normal' }
    ],
    gapOverflow: 0,
    policyDocument: 'on-file',
    memoRequirement: 'not-evaluated',
    notificationDelivery: 'not-available',
    emptyState: 'not-empty'
  });
}

function closedProjection(reason = 'access-unavailable') {
  return contractProjection('contract-closed', { reason });
}

function askProjection(state = 'editing', overrides = {}) {
  const error = state === 'error' ? 'provider-unavailable' : null;
  return contractProjection('ask', Object.assign({
    scope: { kind: 'agreement', label: 'Current agreement · Acme', scopeToken: 'scope-ask-opaque' },
    question: state === 'editing' ? null : 'When does this agreement renew?',
    state,
    error
  }, overrides));
}

function answerProjection(overrides = {}) {
  const body = {
    question: 'When does this agreement renew?',
    scope: { kind: 'agreement', label: 'Current agreement · Acme', scopeToken: 'scope-answer-opaque' },
    answer: {
      outcome: 'answered',
      evidenceComplete: true,
      conclusion: 'The agreement renews on July 1, 2027.',
      trust: {
        state: 'accepted',
        explanation: 'The conclusion is supported by current governing evidence.'
      },
      governingEvidence: [{
        claim: 'Renewal date', value: 'July 1, 2027', trustState: 'accepted',
        citationLabel: 'Section 8, page 9', actionToken: 'answer-governing-opaque'
      }],
      historyEvidence: [{
        claim: 'Prior renewal date', value: 'July 1, 2026', trustState: 'extracted',
        citationLabel: 'Prior amendment, page 2', actionToken: 'answer-history-opaque'
      }],
      conflicts: [],
      gaps: [],
      sources: [
        { label: 'Section 8, page 9', evidenceRole: 'governing', actionToken: 'answer-governing-opaque' },
        { label: 'Prior amendment, page 2', evidenceRole: 'history', actionToken: 'answer-history-opaque' }
      ],
      sourceOverflow: 0
    },
    policy: {
      clearance: 'cleared', reasons: [],
      document10: { state: 'current', reviewed: true }
    },
    policyActions: []
  };
  return contractProjection('answer', Object.assign(body, overrides));
}

function testAskEntryComposition(composer) {
  const schema = require(HUD_SCHEMA_PATH);
  const folder = folderProjection();
  folder.body.askScopes = [
    { kind: 'corpus', label: 'Enrolled accessible corpus', scopeToken: 'folder-corpus-opaque' },
    { kind: 'vendor', label: 'Acme', scopeToken: 'folder-vendor-opaque' }
  ];
  const folderModel = composer.composeContractView(schema.parseProjection(folder));
  assert.deepStrictEqual(folderModel.askEntries.map(entry => [entry.kind, entry.label, entry.action.label]), [
    ['corpus', 'Enrolled accessible corpus', 'Ask enrolled corpus'],
    ['vendor', 'Acme', 'Ask about Acme']
  ], 'certified folder scopes expose only explicit local ask entries');

  const reading = readingProjection();
  reading.body.askScopes = [{
    kind: 'agreement', label: 'Current agreement · Acme', scopeToken: 'reading-agreement-opaque'
  }];
  const readingModel = composer.composeContractView(schema.parseProjection(reading));
  assert.strictEqual(readingModel.askEntries[0].action.label, 'Ask about this agreement');
  assert.deepStrictEqual(composer.composeContractView(schema.parseProjection(folderProjection())).askEntries, [],
    'a projection without a certified scope exposes no disabled or inferred ask entry');
}

function testAskAndAnswerComposition(composer) {
  const schema = require(HUD_SCHEMA_PATH);
  assert.strictEqual(composer.ASK_MODEL_VERSION, 'skopeo-contract-ask/1');
  assert.strictEqual(typeof composer.composeContractAsk, 'function');
  assert.strictEqual(typeof composer.validateContractAskModel, 'function');

  const editing = composer.composeContractAsk(schema.parseProjection(askProjection()));
  assert.ok(editing && composer.validateContractAskModel(editing));
  assert.deepStrictEqual(Reflect.ownKeys(editing).sort(), [
    'actionIds', 'answer', 'askModelVersion', 'attention', 'authority', 'composer',
    'confirmation', 'mode', 'scope', 'sectionOrder', 'title'
  ].sort());
  assert.strictEqual(editing.mode, 'ask');
  assert.strictEqual(editing.attention, 'focused');
  assert.strictEqual(editing.title, 'Ask contract evidence');
  assert.deepStrictEqual(Array.from(editing.sectionOrder), [
    'back', 'heading', 'scope', 'question', 'scope-choices', 'actions', 'privacy'
  ]);
  assert.strictEqual(editing.composer.eyebrow, 'ASK CONTRACT EVIDENCE');
  assert.strictEqual(editing.composer.fieldLabel, 'Question');
  assert.strictEqual(editing.composer.helper,
    'Ask about governing terms, exact dates, conflicts, or accessible history.');
  assert.strictEqual(editing.composer.primaryAction.label, 'Ask contract question');
  assert.strictEqual(editing.composer.privacy,
    'Skopeo uses only currently accessible evidence for this scope.');
  assert.strictEqual(editing.composer.clearAction, null);

  const checking = composer.composeContractAsk(schema.parseProjection(askProjection('checking')));
  assert.strictEqual(checking.composer.status, 'Checking accessible evidence…');
  assert.strictEqual(checking.composer.readOnly, true);
  assert.strictEqual(checking.composer.cancelAction.label, 'Cancel current question');
  const providerError = composer.composeContractAsk(schema.parseProjection(askProjection('error')));
  assert.strictEqual(providerError.composer.error.message,
    'Skopeo couldn’t evaluate this question with the configured provider. Check provider settings and ask again.');

  const answer = composer.composeContractAsk(schema.parseProjection(answerProjection()));
  assert.ok(answer && composer.validateContractAskModel(answer));
  assert.deepStrictEqual(Array.from(answer.sectionOrder), [
    'answer-state', 'conclusion', 'governing-evidence', 'relevant-history',
    'conflicts-and-gaps', 'policy-safeguards', 'sources', 'result-actions'
  ]);
  assert.strictEqual(answer.answer.banner.label, 'Answered');
  assert.strictEqual(answer.answer.banner.explanation,
    'The conclusion below is supported by the complete current accessible evidence for this scope.');
  assert.strictEqual(answer.answer.governingEvidence[0].evidenceLabel, 'Governing evidence');
  assert.strictEqual(answer.answer.relevantHistory[0].evidenceLabel, 'Relevant history');
  assert.strictEqual(answer.answer.governingEvidence[0].trustLabel, 'Accepted');
  assert.strictEqual(answer.answer.policySafeguards.clearance.label, 'Cleared');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(answer.answer.policySafeguards, 'memo'), false,
    'routine agreements structurally omit the memo safeguard');
  assert.deepStrictEqual(Array.from(answer.actionIds), [
    'answer-governing-opaque', 'answer-history-opaque'
  ]);
  assertDeepFrozen(answer);

  const complexBody = mutableClone(answerProjection().body);
  complexBody.answer.outcome = 'review-required';
  complexBody.answer.conclusion = 'The current renewal term is cited, but clearance requires review.';
  complexBody.answer.trust = { state: 'review-required', explanation: 'A policy safeguard remains open.' };
  complexBody.policy = {
    clearance: 'blocked', reasons: ['document-10-unreviewed', 'memo-missing'],
    document10: { state: 'current', reviewed: false },
    memo: { state: 'proven-missing', satisfied: false }
  };
  complexBody.policyActions = [
    { actionId: 'review-document-opaque', label: 'review-document-10', requiresConfirmation: false },
    { actionId: 'complex-policy-opaque', label: 'classify-routine', requiresConfirmation: true }
  ];
  const complex = composer.composeContractAsk(schema.parseProjection(answerProjection(complexBody)));
  assert.strictEqual(complex.answer.banner.label, 'Review required');
  assert.strictEqual(complex.answer.policySafeguards.clearance.label, 'Blocked');
  assert.strictEqual(complex.answer.policySafeguards.document10.label,
    'Decision blocked · Review Document 10');
  assert.strictEqual(complex.answer.policySafeguards.memo.label,
    'Decision blocked · Required human-authored memo is missing');
  assert.deepStrictEqual(complex.answer.policySafeguards.actions.map(action => action.label), [
    'Review Document 10', 'Remove complex classification'
  ]);

  const abstainedBody = mutableClone(answerProjection().body);
  abstainedBody.answer.outcome = 'abstained';
  abstainedBody.answer.evidenceComplete = false;
  abstainedBody.answer.conclusion = null;
  abstainedBody.answer.trust = { state: 'ambiguous', explanation: 'The accessible evidence is incomplete.' };
  abstainedBody.answer.gaps = [{ type: 'index-incomplete', detail: 'One enrolled source is still indexing.' }];
  abstainedBody.policy = null;
  const abstained = composer.composeContractAsk(schema.parseProjection(answerProjection(abstainedBody)));
  assert.strictEqual(abstained.answer.banner.label, 'Abstained');
  assert.strictEqual(abstained.answer.conclusion, null);
  assert.strictEqual(abstained.answer.conflictsAndGaps[0].label, 'Index incomplete');
  assert.strictEqual(abstained.answer.policySafeguards, null);
  assert.strictEqual(JSON.stringify(abstained).includes('index-incomplete'), false,
    'raw reason codes never reach the display model');

  for (const mutation of [
    value => { value.providerId = 'raw-provider'; },
    value => { value.answer.conclusion = { heading: 'Summary', text: 'Forged' }; },
    value => { value.answer.policySafeguards.memo = { label: 'Not required' }; },
    value => { value.actionIds.push(value.actionIds[0]); }
  ]) {
    const changed = mutableClone(answer);
    mutation(changed);
    deepFreeze(changed);
    assert.strictEqual(composer.validateContractAskModel(changed), false,
      'ask validator rejects raw fields, forged conclusions, routine memo rows, and duplicate actions');
  }
}

function assertNoForbiddenContractSurface(model) {
  const serialized = JSON.stringify(model);
  for (const forbidden of [
    'https://drive.google.com/file', 'https://docs.google.com/document', 'sourceFileId',
    'rootFileId', 'tabId', 'raw page text', 'Ask Skopeo', 'Draft notice', 'Send notice',
    'Approval', 'Document 10', 'missing required', 'per-row-badge', 'innerHTML'
  ]) {
    assert.strictEqual(serialized.includes(forbidden), false, `model excludes ${forbidden}`);
  }
}

function testFolderContractComposition(composer) {
  const schema = require(HUD_SCHEMA_PATH);
  const projection = schema.parseProjection(folderProjection());
  assert.ok(projection, 'folder fixture is a Plan 57 projection');
  const model = composer.composeContractView(projection);
  assert.ok(model && composer.validateContractViewModel(model), 'folder model is closed and valid');
  assert.strictEqual(model.contractModelVersion, 'skopeo-contract-view/1');
  assert.strictEqual(model.mode, 'folder');
  assert.strictEqual(model.attention, 'anchored');
  assert.strictEqual(model.title, 'Vendor agreements');
  assert.deepStrictEqual(Array.from(model.sectionOrder), [
    'header', 'blocker', 'next-material-dates', 'urgent-gaps',
    'vendors', 'vendor-page-controls', 'overflow'
  ]);
  assert.strictEqual(model.folder.vendors.length, 10, 'all projected vendor slots remain in the frozen model');
  assert.deepStrictEqual(model.folder.paging, { pageSize: 8, pageCount: 2, initialPage: 1 });
  assert.strictEqual(model.folder.vendors[0].label, 'Aster " onclick=alert(1)',
    'hostile-but-schema-valid metadata remains literal text');
  assert.deepStrictEqual(Array.from(model.folder.vendors[0].slotOrder), [
    'owner', 'documents-and-index', 'governing-status', 'next-material-date',
    'consequence', 'memo-evidence', 'policy-document', 'memo-requirement',
    'notification-delivery', 'urgent-gaps'
  ]);
  assert.strictEqual(model.folder.vendors[1].owner.value, 'Owner not assigned',
    'complete-set owner absence is explicit');
  assert.strictEqual(model.folder.vendors[2].owner.value, 'Not evaluated',
    'incomplete owner evidence never becomes absence');
  assert.strictEqual(model.folder.vendors[2].nextMaterialDate.value, 'Not evaluated');
  assert.strictEqual(model.folder.vendors[2].consequence.value, 'Consequence not evaluated');
  assert.deepStrictEqual(model.folder.nextMaterialDates.map(row => [row.typeLabel, row.civilDate]), [
    ['Termination', '2027-04-01'],
    ['Notice deadline', '2027-05-01'],
    ['Expiration', '2027-05-01']
  ], 'dates sort by civil date then the fixed date-type precedence');
  assert.strictEqual(model.folder.nextMaterialDates[1].consequenceLabel, 'If no action');
  assert.notStrictEqual(model.folder.nextMaterialDates[1].dateLabel,
    model.folder.nextMaterialDates[1].consequence,
    'typed date and consequence remain separate fields');
  assert.strictEqual(model.folder.nextMaterialDateOverflowText,
    '+2 more material dates appear in vendor rows');
  assert.strictEqual(model.folder.urgentGapOverflowText, null);
  assert.deepStrictEqual(model.folder.urgentGaps.map(row => row.label), [
    'Final agreement missing', 'Scan unreadable', 'Owner not assigned'
  ], 'urgent gap order remains projector-owned and labels remain typed');
  assert.strictEqual(model.folder.vendors[0].memoEvidence.value, 'Memo on file');
  assert.strictEqual(model.folder.vendors[0].policyDocument.value, 'Policy document on file');
  assert.strictEqual(model.folder.vendors[0].memoRequirement.value, 'Not evaluated');
  assert.strictEqual(model.folder.vendors[0].notificationDelivery.value, 'Local alert scheduled');
  assert.strictEqual(model.folder.vendors[0].notificationDelivery.detail,
    'Skopeo will recheck current evidence before showing this local alert.');
  assert.strictEqual(model.folder.vendors[1].notificationDelivery, null,
    'unavailable alert state is omitted instead of rendered as a permanent placeholder');
  assert.deepStrictEqual(Array.from(model.actionIds), ['alert-remove-owner-opaque']);
  assertDeepFrozen(model);
  assertNoForbiddenContractSurface(model);

  const schemaAbsent = composeContractInClassicVm(folderProjection(), false);
  assert.strictEqual(schemaAbsent.model, null,
    'classic content-script composer fails closed when its schema dependency is absent');
  const classic = composeContractInClassicVm(folderProjection(), true);
  assert.ok(classic.model && classic.composer.validateContractViewModel(classic.model),
    'classic content-script composer consumes the injected content-safe schema global');
  const classicInvalid = folderProjection();
  classicInvalid.body.extra = 'page-derived-field';
  assert.strictEqual(composeContractInClassicVm(classicInvalid, true).model, null,
    'injected schema rejects projection keys outside the Plan 57 contract');
}

function testReadingContractComposition(composer) {
  const schema = require(HUD_SCHEMA_PATH);
  const readingCopy = {
    governing: ['Governing', 'This document governs the facts shown below.'],
    'partially-governing': ['Partially governing', 'This document governs only the cited clauses. Other terms come from the governing sources named below.'],
    historical: ['Historical', 'This document is relevant history. It does not govern the facts shown below.'],
    superseded: ['Superseded', 'This document has been superseded. It does not govern the facts shown below.'],
    'review-required': ['Review required', 'Skopeo can’t determine what governs. Review the cited conflict before acting.'],
    'not-evaluated': ['Not evaluated', 'Governing status isn’t available from the current complete evidence.'],
    'access-unavailable': ['Access unavailable', 'Skopeo can’t confirm this document under the current Drive access.']
  };
  for (const [state, copy] of Object.entries(readingCopy)) {
    const projection = schema.parseProjection(readingProjection(state));
    assert.ok(projection, `${state} fixture is schema-valid`);
    const model = composer.composeContractView(projection);
    assert.ok(model && composer.validateContractViewModel(model), `${state} composes`);
    assert.strictEqual(model.mode, 'reading');
    assert.strictEqual(model.reading.banner.label, copy[0]);
    assert.strictEqual(model.reading.banner.explanation, copy[1]);
    if (state === 'review-required' || state === 'not-evaluated' || state === 'access-unavailable') {
      assert.strictEqual(model.reading.banner.definitive, false, `${state} never becomes definitive`);
    }
  }

  const clause = composer.composeContractView(schema.parseProjection(readingProjection('historical', 'clause')));
  assert.deepStrictEqual(Array.from(clause.sectionOrder), [
    'banner', 'governing-facts', 'relevant-history', 'conflicts-and-gaps',
    'policy-and-delivery-status', 'overflow'
  ]);
  assert.strictEqual(clause.reading.banner.action.label, 'Open governing clause');
  assert.deepStrictEqual(clause.reading.governingFacts.map(row => row.typeLabel), ['Effective', 'Renewal']);
  assert.deepStrictEqual(clause.reading.relevantHistory.map(row => row.typeLabel), ['Signed']);
  assert.deepStrictEqual(clause.reading.governingFacts.map(row => row.evidenceLabel), [
    'Governing evidence', 'Governing evidence'
  ]);
  assert.strictEqual(clause.reading.relevantHistory[0].evidenceLabel, 'Relevant history');
  assert.deepStrictEqual(clause.reading.governingFacts.map(row => row.action.label), [
    'Open source for Effective', 'Open source for Renewal'
  ]);
  assert.deepStrictEqual(Array.from(clause.actionIds), [
    'citation-primary-opaque',
    'citation-fact-effective-opaque',
    'citation-fact-renewal-opaque'
  ], 'primary and every eligible fact retain distinct opaque actions');
  assert.strictEqual(new Set(clause.actionIds).size, clause.actionIds.length);
  assert.deepStrictEqual(clause.reading.gaps.map(row => row.label), [
    'Agreement version conflict — review required', 'Evidence ambiguous'
  ]);
  assert.deepStrictEqual(clause.reading.policyAndDelivery.map(row => [row.label, row.value]), [
    ['Policy document', 'Policy document on file'],
    ['Memo requirement', 'Not evaluated']
  ]);
  assertNoForbiddenContractSurface(clause);

  const documentAction = composer.composeContractView(
    schema.parseProjection(readingProjection('superseded', 'document'))
  );
  assert.strictEqual(documentAction.reading.banner.action.label, 'Open governing document');
  const unavailable = composer.composeContractView(
    schema.parseProjection(readingProjection('historical', 'not-available'))
  );
  assert.strictEqual(unavailable.reading.banner.action, null);
  assert.strictEqual(unavailable.reading.banner.actionStatus, 'Governing source not available');

  const alertProjection = readingProjection('historical', 'not-available');
  alertProjection.body.notificationDelivery = alertStatus('not-locally-deliverable', {
    actionId: 'alert-map-owner-opaque',
    kind: 'map-current-owner',
    label: 'Map current owner to this Chrome user',
    requiresConfirmation: true
  });
  const alert = composer.composeContractView(schema.parseProjection(alertProjection));
  assert.strictEqual(alert.reading.policyAndDelivery[2].value, 'Not locally deliverable');
  assert.strictEqual(alert.reading.policyAndDelivery[2].action.label,
    'Map current owner to this Chrome user');
  assert.deepStrictEqual(Array.from(alert.actionIds), [
    'citation-fact-effective-opaque',
    'citation-fact-renewal-opaque',
    'alert-map-owner-opaque'
  ]);
  const alertCopy = {
    scheduled: 'Local alert scheduled',
    attempted: 'Local alert attempt recorded',
    delivered: 'Local alert delivered',
    failed: 'Local alert failed',
    missed: 'Local alert missed'
  };
  for (const [state, expected] of Object.entries(alertCopy)) {
    const stateProjection = readingProjection('historical', 'not-available');
    stateProjection.body.notificationDelivery = alertStatus(state);
    const stateModel = composer.composeContractView(schema.parseProjection(stateProjection));
    assert.strictEqual(stateModel.reading.policyAndDelivery[2].value, expected,
      `${state} uses closed local alert copy`);
  }
}

function testClosedAndMutationContract(composer) {
  const schema = require(HUD_SCHEMA_PATH);
  for (const reason of schema.CLOSED_REASONS) {
    const model = composer.composeContractView(schema.parseProjection(closedProjection(reason)));
    assert.ok(model && composer.validateContractViewModel(model), `${reason} composes one closed blocker`);
    assert.strictEqual(model.mode, 'contract-closed');
    assert.strictEqual(model.attention, 'anchored');
    assert.strictEqual(model.blocker.body,
      'Skopeo can’t verify this contract view. Reopen the folder or document and invoke Skopeo again.');
    assert.deepStrictEqual(Array.from(model.actionIds), []);
  }
  assert.strictEqual(composer.composeContractView(null), null,
    'missing authority never manufactures contract-closed');
  assert.strictEqual(composer.composeContractView({}), null,
    'unsupported/unverified input bypasses composition');
  const projection = schema.parseProjection(readingProjection());
  const model = composer.composeContractView(projection);
  for (const mutation of [
    value => { value.contractModelVersion = 'forged'; },
    value => { value.mode = 'ask'; },
    value => { value.actionIds.push('duplicate'); },
    value => { value.reading.governingFacts[0].action.actionId = 'citation-primary-opaque'; },
    value => { value.reading.banner.action.label = 'Open'; },
    value => { value.rawHtml = '<button>Send</button>'; }
  ]) {
    const changed = mutableClone(model);
    mutation(changed);
    deepFreeze(changed);
    assert.strictEqual(composer.validateContractViewModel(changed), false,
      'closed validator rejects mutated keys, modes, actions, labels, and cardinality');
  }
  const invalidProjection = mutableClone(readingProjection());
  invalidProjection.body.facts[1].actionToken = invalidProjection.body.facts[0].actionToken;
  assert.strictEqual(composer.composeContractView(invalidProjection), null,
    'duplicate projection actions fail at the Plan 57 schema boundary');
}

function testContractStateCopyAndEmptySemantics(composer) {
  const schema = require(HUD_SCHEMA_PATH);
  const gapCopy = {
    'missing-final': 'Final agreement missing',
    'unreadable-scan': 'Scan unreadable',
    'incomplete-indexing': 'Index incomplete',
    'owner-gap': 'Owner not assigned',
    'version-conflict': 'Agreement version conflict — review required',
    'policy-document-missing': 'Policy document missing',
    pending: 'Pending',
    'download-blocked': 'Download blocked',
    inaccessible: 'Access unavailable',
    ambiguous: 'Evidence ambiguous',
    'not-evaluated': 'Not evaluated'
  };
  for (const [type, expected] of Object.entries(gapCopy)) {
    const candidate = readingProjection('not-evaluated', 'not-available');
    candidate.body.gaps = [{ type, priority: 'normal' }];
    const model = composer.composeContractView(schema.parseProjection(candidate));
    assert.strictEqual(model.reading.gaps[0].label, expected, `${type} retains exact typed copy`);
  }

  const sourceCopy = {
    ready: 'Current source available',
    pending: 'Pending',
    unreadable: 'Scan unreadable',
    'download-blocked': 'Download blocked',
    inaccessible: 'Access unavailable',
    missing: 'Final agreement missing'
  };
  for (const [sourceState, expected] of Object.entries(sourceCopy)) {
    const candidate = readingProjection(
      sourceState === 'inaccessible' ? 'access-unavailable' : 'not-evaluated',
      'not-available'
    );
    candidate.body.sourceState = sourceState;
    const model = composer.composeContractView(schema.parseProjection(candidate));
    assert.strictEqual(model.reading.banner.sourceLabel, expected,
      `${sourceState} remains distinct instead of collapsing to unknown`);
  }

  const trustCopy = {
    accepted: 'Accepted',
    extracted: 'Extracted',
    inferred: 'Inferred',
    ambiguous: 'Ambiguous',
    unreadable: 'Unreadable',
    'review-required': 'Review required'
  };
  for (const [trustState, expected] of Object.entries(trustCopy)) {
    const candidate = readingProjection('review-required');
    candidate.body.facts[0].trustState = trustState;
    const model = composer.composeContractView(schema.parseProjection(candidate));
    assert.strictEqual(model.reading.governingFacts[0].trustLabel, expected,
      `${trustState} retains exact evidence trust copy`);
  }

  const emptyFolder = folderProjection();
  emptyFolder.result = 'empty';
  emptyFolder.body.vendorCount = 0;
  emptyFolder.body.vendors = [];
  emptyFolder.body.nextMaterialDates = [];
  emptyFolder.body.nextMaterialDateOverflow = 0;
  emptyFolder.body.urgentGaps = [];
  emptyFolder.body.emptyState = 'complete-empty';
  const emptyFolderModel = composer.composeContractView(schema.parseProjection(emptyFolder));
  assert.deepStrictEqual(emptyFolderModel.folder.empty, {
    state: 'complete-empty',
    heading: 'No vendor agreements to show',
    body: 'Skopeo found no accessible vendor folders in the complete enrolled corpus. Check the Drive folder or turn off Skopeo.'
  }, 'folder absence copy is reserved for a complete authoritative zero set');

  const emptyReading = readingProjection('not-evaluated', 'not-available');
  emptyReading.result = 'empty';
  emptyReading.body.facts = [];
  emptyReading.body.gaps = [];
  emptyReading.body.emptyState = 'complete-empty';
  const emptyReadingModel = composer.composeContractView(schema.parseProjection(emptyReading));
  assert.deepStrictEqual(emptyReadingModel.reading.empty, {
    state: 'complete-empty',
    heading: 'No cited facts available',
    body: 'Skopeo found no exact facts it can support from the current accessible evidence.'
  });

  const partialFolder = folderProjection();
  partialFolder.currentness = 'partial';
  partialFolder.result = 'partial';
  partialFolder.body.manifestState = 'partial';
  partialFolder.body.emptyState = 'not-evaluated';
  const partialModel = composer.composeContractView(schema.parseProjection(partialFolder));
  assert.strictEqual(partialModel.mode, 'contract-closed',
    'schema-valid admitted incomplete authority becomes the neutral blocker, not partial facts');
  assert.strictEqual(partialModel.blocker.reason, 'partial-authority');
}

function runContractComposerContract(composer) {
  assert.strictEqual(composer.CONTRACT_MODEL_VERSION, 'skopeo-contract-view/1');
  assert.strictEqual(typeof composer.composeContractView, 'function');
  assert.strictEqual(typeof composer.validateContractViewModel, 'function');
  testFolderContractComposition(composer);
  testReadingContractComposition(composer);
  testClosedAndMutationContract(composer);
  testContractStateCopyAndEmptySemantics(composer);
  testAskEntryComposition(composer);
  testAskAndAnswerComposition(composer);
  console.log('skopeo-adaptive-composer contract-view: PASS');
}

function runComposerContract(composer) {
  testExportsAndClosedModel(composer);
  testGenreSparseComposition(composer);
  testExplicitAttentionAndAnomaly(composer);
  testReadinessAndCopy(composer);
  testClosedValidationAndMutations(composer);
  testArgumentCollectionModel(composer);
  console.log('skopeo-adaptive-composer composer-only: PASS');
}

function runShellContract(composer) {
  const shellApi = loadShell();
  testAdaptiveShell(composer, shellApi);
  testArgumentCollectorShell(composer, shellApi);
  testNarrowTableFallback(composer, shellApi);
  testShellFailClosed(composer, shellApi);
  console.log('skopeo-adaptive-composer shell: PASS');
}

function run() {
  const composer = loadComposer();
  runComposerContract(composer);
  if (process.env.SKOPEO_ASK_EXPECT_CONTENT_RED === '1') {
    assert.strictEqual(typeof composer.composeContractAsk, 'undefined',
      'controlled ask-composer RED is valid only while composeContractAsk is absent');
    assert.strictEqual(typeof composer.validateContractAskModel, 'undefined',
      'controlled ask-composer RED is valid only while its validator is absent');
    console.log(`${ASK_COMPOSER_MARKER}: RED`);
    return;
  }
  if (process.env.SKOPEO_HUD_EXPECT_CONTENT_RED === '1') {
    assert.strictEqual(typeof composer.composeContractView, 'undefined',
      'controlled content-composer RED is valid only while composeContractView is absent');
    assert.strictEqual(typeof composer.validateContractViewModel, 'undefined',
      'controlled content-composer RED is valid only while its validator is absent');
    console.log(`${CONTENT_COMPOSER_MARKER}: RED`);
    return;
  }
  runContractComposerContract(composer);
  if (!process.argv.includes('--composer-only')) runShellContract(composer);
  console.log('skopeo-adaptive-composer: PASS');
}

if (require.main === module) run();

module.exports = {
  GENRES,
  ATOMS,
  contextFor,
  inputFor,
  completeConsequence,
  renderedAtoms,
  runComposerContract,
  runContractComposerContract,
  runShellContract
};
