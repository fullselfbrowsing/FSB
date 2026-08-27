'use strict';

/**
 * Consequence gate authority and one-shot dispatch verification.
 *
 * These tests use the five installed write descriptors, generated background
 * capabilities, bounded content projections, and the production validators.
 * The router dispatch itself is stubbed so this suite cannot perform a write.
 */

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const GATE_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-consequence-gate.js');
const BACKGROUND_PATH = path.join(ROOT, 'extension', 'background.js');

if (!globalThis.crypto) {
  globalThis.crypto = require('crypto').webcrypto;
}
vm.runInThisContext(fs.readFileSync(
  path.join(ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js'),
  'utf8'
));

const RealRouter = require(path.join(ROOT, 'extension', 'utils', 'capability-router.js'));
globalThis.FsbCapabilityRouter = RealRouter;

const Gate = require(GATE_PATH);
const ActionAuthority = require(path.join(ROOT, 'extension', 'utils', 'skopeo-action-authority.js'));
const Composer = require(path.join(ROOT, 'extension', 'content', 'skopeo-adaptive-composer.js'));
const Shell = require(path.join(ROOT, 'extension', 'content', 'skopeo-shell.js'));
const { createHarness: createShellHarness } = require('./skopeo-shell-contract.test.js');
const Projector = require(path.join(ROOT, 'extension', 'utils', 'skopeo-capability-projector.js'));
const ProfileIndex = require(path.join(ROOT, 'extension', 'catalog', 'skopeo-profile-index.generated.js'));
const ConsequenceTargets = require(path.join(ROOT, 'extension', 'catalog', 'skopeo-consequence-targets.js'));
const SlackHandlers = require(path.join(ROOT, 'extension', 'catalog', 'handlers', 'slack.js'));
const NotionHandlers = require(path.join(ROOT, 'extension', 'catalog', 'handlers', 'notion.js'));

const FIVE_READY_WRITE_CASES = Object.freeze([
  Object.freeze({
    slug: 'slack.chat.postMessage',
    url: 'https://app.slack.com/client/T123/C456',
    args: Object.freeze({ channel: 'C456', text: 'Review the renewal today' }),
    target: 'Slack channel: C456',
    effect: 'Send one message',
    parameterSummary: 'Message: Review the renewal today.',
    progress: 'Sending one message'
  }),
  Object.freeze({
    slug: 'notion.create_page',
    url: 'https://app.notion.com/workspace',
    args: Object.freeze({
      title: 'Renewal brief',
      parent_page_id: 'parent-123',
      icon: 'contract-icon',
      content: 'Review renewal terms'
    }),
    target: 'New page title: Renewal brief; Parent page ID: parent-123',
    effect: 'Create one page',
    parameterSummary: 'Page title: Renewal brief; Page icon: contract-icon; Page content: Review renewal terms.',
    progress: 'Creating one page'
  }),
  Object.freeze({
    slug: 'notion.update_page',
    url: 'https://app.notion.com/workspace',
    args: Object.freeze({
      page_id: 'page-123',
      title: 'Updated renewal brief',
      icon: 'updated-icon',
      cover: 'updated-cover'
    }),
    target: 'Page ID: page-123',
    effect: 'Update one page',
    parameterSummary: 'Updated page ID: page-123; New title: Updated renewal brief; Page icon: updated-icon; Page cover: updated-cover.',
    progress: 'Updating one page'
  }),
  Object.freeze({
    slug: 'notion.create_database',
    url: 'https://app.notion.com/workspace',
    args: Object.freeze({ parent_page_id: 'parent-123', title: 'Renewal tracker' }),
    target: 'Parent page ID: parent-123',
    effect: 'Create one database',
    parameterSummary: 'Database title: Renewal tracker.',
    progress: 'Creating one database'
  }),
  Object.freeze({
    slug: 'notion.create_database_item',
    url: 'https://app.notion.com/workspace',
    args: Object.freeze({ database_id: 'database-123', title: 'Priceline renewal' }),
    target: 'Database ID: database-123',
    effect: 'Create one database item',
    parameterSummary: 'Item title: Priceline renewal.',
    progress: 'Creating one database item'
  })
]);

const OPTIONAL_CANARIES = Object.freeze([
  Object.freeze({ slug: 'notion.create_page', field: 'parent_page_id', args: { title: 'Create canary', parent_page_id: 'parent-canary' }, label: 'Parent page ID', value: 'parent-canary' }),
  Object.freeze({ slug: 'notion.create_page', field: 'icon', args: { title: 'Create canary', icon: 'create-icon-canary' }, label: 'Page icon', value: 'create-icon-canary' }),
  Object.freeze({ slug: 'notion.create_page', field: 'content', args: { title: 'Create canary', content: 'create-content-canary' }, label: 'Page content', value: 'create-content-canary' }),
  Object.freeze({ slug: 'notion.update_page', field: 'title', args: { page_id: 'page-canary', title: 'update-title-canary' }, label: 'New title', value: 'update-title-canary' }),
  Object.freeze({ slug: 'notion.update_page', field: 'icon', args: { page_id: 'page-canary', icon: 'update-icon-canary' }, label: 'Page icon', value: 'update-icon-canary' }),
  Object.freeze({ slug: 'notion.update_page', field: 'cover', args: { page_id: 'page-canary', cover: 'update-cover-canary' }, label: 'Page cover', value: 'update-cover-canary' })
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Reflect.ownKeys(value).forEach(function(key) { deepFreeze(value[key]); });
  return Object.freeze(value);
}

function rowsOf(projection) {
  return projection.capabilityGroups.flatMap(function(group) { return group.capabilities; });
}

function testCaseFor(slug) {
  const testCase = FIVE_READY_WRITE_CASES.find(function(candidate) { return candidate.slug === slug; });
  assert.ok(testCase, slug + ' is in the five-write matrix');
  return testCase;
}

function installedHandler(slug) {
  const handler = SlackHandlers[slug] || NotionHandlers[slug];
  assert.ok(handler, slug + ' installed handler exists');
  return handler;
}

let harnessSerial = 0;

function createHarness(slug, args) {
  const testCase = testCaseFor(slug);
  const tabId = 600 + harnessSerial;
  const generation = 30 + harnessSerial;
  const contextEpoch = 70 + harnessSerial;
  harnessSerial += 1;

  const projection = Projector.createProjection({ tabId, generation, url: testCase.url }, ProfileIndex);
  const full = ProfileIndex.capabilities.find(function(row) { return row.slug === slug; });
  const projected = rowsOf(projection).find(function(row) { return row.slug === slug; });
  const sourceHandler = installedHandler(slug);
  assert.equal(projection.status, 'recognized', slug + ' origin is recognized');
  assert.ok(full && projected, slug + ' has full and projected authority');

  const state = {
    authority: deepFreeze({
      tabId,
      generation,
      exactOrigin: projection.exactOrigin,
      profileVersion: projection.profileVersion,
      contextEpoch,
      semanticEntity: null
    }),
    projection,
    full,
    schema: clone(sourceHandler.params),
    contract: ConsequenceTargets.getContract(slug),
    descriptorClass: sourceHandler.sideEffectClass,
    handlerClass: sourceHandler.sideEffectClass,
    descriptorService: full.service,
    resolvedOrigin: sourceHandler.origin,
    handlerOrigin: sourceHandler.origin,
    resolverEnabled: true,
    materializer: ActionAuthority.materializeConsequence,
    deferInvoke: false,
    resolveInvoke: null
  };
  const calls = [];

  function resolvedEntry(requestedSlug, requestedOrigin) {
    if (!state.resolverEnabled || requestedSlug !== slug ||
        requestedOrigin !== state.full.executionAuthority.executionOrigin) {
      return null;
    }
    const schema = clone(state.schema);
    return {
      tier: 'T1a',
      origin: state.resolvedOrigin,
      handler: {
        origin: state.handlerOrigin,
        sideEffectClass: state.handlerClass,
        params: schema,
        async handle() { return { success: true }; }
      },
      descriptor: {
        slug,
        service: state.descriptorService,
        sideEffectClass: state.descriptorClass,
        params: clone(schema)
      }
    };
  }

  const router = {
    getResolvedParamsSchema: RealRouter.getResolvedParamsSchema,
    validateResolvedArgs: RealRouter.validateResolvedArgs,
    async invoke(invokedSlug, invokedArgs, context) {
      calls.push({ slug: invokedSlug, args: clone(invokedArgs), context: clone(context) });
      if (state.deferInvoke) {
        return await new Promise(function(resolve) { state.resolveInvoke = resolve; });
      }
      return { success: true, code: 'REAL_WRITE_STUB_OK' };
    }
  };
  const consequenceTargets = {
    getContract(requestedSlug) {
      return requestedSlug === slug ? state.contract : null;
    }
  };
  const gate = Gate.createGateManager({
    getCurrentAuthority: function() { return state.authority; },
    getCurrentProjection: function() { return state.projection; },
    getCurrentCapabilityAuthority: function(requestedSlug) {
      return requestedSlug === slug ? state.full : null;
    },
    resolveCapability: resolvedEntry,
    router,
    actionAuthority: ActionAuthority,
    consequenceTargets,
    materializeConsequence: function(compiled, suppliedArgs) {
      return state.materializer(compiled, suppliedArgs);
    }
  });
  const request = {
    generation,
    exactOrigin: projection.exactOrigin,
    profileVersion: projection.profileVersion,
    contextEpoch,
    semanticEntity: null,
    slug,
    args: clone(args || testCase.args)
  };
  return { slug, tabId, projected, state, calls, gate, request, resolvedEntry };
}

function confirmRequest(harness, opened, overrides) {
  return Object.assign({}, clone(harness.request), {
    actionToken: opened.actionToken
  }, overrides || {});
}

async function expectNoOpen(harness, label, request) {
  const result = await harness.gate.open(request || harness.request, { tabId: harness.tabId });
  assert.notEqual(result.status, 'open', label + ' fails closed');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'actionToken'), false,
    label + ' mints no token');
  assert.equal(harness.calls.length, 0, label + ' makes zero router calls');
  return result;
}

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise(function(resolve) { setImmediate(resolve); });
  }
  assert.fail(label + ' did not occur');
}

async function compileSchema(slug, schema, rawContract) {
  const testCase = testCaseFor(slug);
  const handler = installedHandler(slug);
  const full = ProfileIndex.capabilities.find(function(row) { return row.slug === slug; });
  const executionAuthority = {
    tier: 'T1a',
    executionOrigin: handler.origin,
    sideEffectClass: handler.sideEffectClass,
    paramSchema: clone(schema),
    schemaDigest: await ActionAuthority.schemaDigest(schema)
  };
  const resolved = {
    tier: 'T1a',
    origin: handler.origin,
    handler: {
      origin: handler.origin,
      sideEffectClass: handler.sideEffectClass,
      params: clone(schema),
      async handle() { return { success: true }; }
    },
    descriptor: {
      slug,
      service: full.service,
      sideEffectClass: handler.sideEffectClass,
      params: clone(schema)
    }
  };
  const argumentContract = ActionAuthority.analyzeArgumentSchema(resolved, executionAuthority);
  const compiled = ActionAuthority.compileConsequenceContract(
    slug,
    rawContract || ConsequenceTargets.getContract(slug),
    executionAuthority,
    argumentContract
  );
  const consequenceDigest = compiled.compatible
    ? await ActionAuthority.schemaDigest(compiled)
    : null;
  return { testCase, schema, executionAuthority, argumentContract, compiled, consequenceDigest };
}

function installCompiledAuthority(harness, built) {
  const full = clone(harness.state.full);
  full.executionAuthority = clone(built.executionAuthority);
  full.argumentContract = clone(built.compiled.effectiveArgumentContract);
  full.consequenceContract = clone(built.compiled);
  full.consequenceDigest = built.consequenceDigest;
  full.consequenceCompatible = true;
  full.acceptedConsequenceFields = clone(built.compiled.acceptedConsequenceFields);
  full.excludedConsequenceFields = clone(built.compiled.excludedConsequenceFields);

  const projection = clone(harness.state.projection);
  const row = rowsOf(projection).find(function(candidate) { return candidate.slug === harness.slug; });
  row.argumentContract = clone(built.compiled.effectiveArgumentContract);
  row.schemaDigest = built.executionAuthority.schemaDigest;
  row.consequenceDigest = built.consequenceDigest;
  row.consequenceCompatible = true;

  harness.state.schema = clone(built.schema);
  harness.state.full = deepFreeze(full);
  harness.state.projection = deepFreeze(projection);
}

async function assertFiveWriteMatrix() {
  let openedCount = 0;
  let confirmedCount = 0;
  for (const testCase of FIVE_READY_WRITE_CASES) {
    const cancelledHarness = createHarness(testCase.slug, testCase.args);
    assert.equal(cancelledHarness.projected.consequenceCompatible, true,
      testCase.slug + ' projects trusted consequence compatibility');
    assert.equal(cancelledHarness.projected.consequenceDigest,
      cancelledHarness.state.full.consequenceDigest,
      testCase.slug + ' projects the background consequenceDigest only');
    assert.equal(Object.prototype.hasOwnProperty.call(cancelledHarness.projected, 'consequenceContract'), false,
      testCase.slug + ' does not project trusted role metadata');

    const opened = await cancelledHarness.gate.open(cancelledHarness.request, {
      tabId: cancelledHarness.tabId
    });
    assert.equal(opened.status, 'open', testCase.slug + ' opens exact confirmation: ' + JSON.stringify(opened));
    openedCount += 1;
    assert.equal(cancelledHarness.calls.length, 0, testCase.slug + ' open makes zero calls');
    assert.deepEqual(opened.confirmation, {
      actionSlug: testCase.slug,
      actionLabel: cancelledHarness.projected.actionLabel,
      target: testCase.target,
      effect: testCase.effect,
      parameterSummary: testCase.parameterSummary,
      gerund: testCase.progress
    }, testCase.slug + ' uses exact trusted target/effect/material/progress');
    assert.equal(Object.prototype.hasOwnProperty.call(opened, 'renderedFields'), false,
      testCase.slug + ' keeps renderedFields background-only');
    assert.equal(JSON.stringify(opened).includes('targetRoles'), false,
      testCase.slug + ' keeps the role registry background-only');

    const cancelled = cancelledHarness.gate.cancel(
      confirmRequest(cancelledHarness, opened),
      { tabId: cancelledHarness.tabId }
    );
    assert.equal(cancelled.status, 'cancelled', testCase.slug + ' cancel consumes the token');
    assert.equal(cancelledHarness.calls.length, 0, testCase.slug + ' cancel makes zero calls');

    const confirmedHarness = createHarness(testCase.slug, testCase.args);
    const confirmedOpen = await confirmedHarness.gate.open(confirmedHarness.request, {
      tabId: confirmedHarness.tabId
    });
    const confirmation = confirmRequest(confirmedHarness, confirmedOpen);
    const first = confirmedHarness.gate.confirm(confirmation, { tabId: confirmedHarness.tabId });
    const parallel = await confirmedHarness.gate.confirm(confirmation, { tabId: confirmedHarness.tabId });
    const result = await first;
    assert.equal(result.success, true, testCase.slug + ' explicit confirm succeeds');
    assert.equal(parallel.status, 'stale', testCase.slug + ' parallel/double confirm is stale');
    const replay = await confirmedHarness.gate.confirm(confirmation, { tabId: confirmedHarness.tabId });
    assert.equal(replay.status, 'stale', testCase.slug + ' repeated/replayed confirm is stale');
    assert.equal(confirmedHarness.calls.length, 1,
      testCase.slug + ' confirms exactly once across double/parallel/replay');
    confirmedCount += confirmedHarness.calls.length;
    assert.deepEqual(confirmedHarness.calls[0], {
      slug: testCase.slug,
      args: clone(testCase.args),
      context: {
        origin: confirmedHarness.state.full.executionAuthority.executionOrigin,
        tabId: confirmedHarness.tabId,
        source: 'skopeo'
      }
    }, testCase.slug + ' routes exact args at installed execution origin');
  }
  assert.equal(openedCount, 5, 'five writes opened');
  assert.equal(confirmedCount, 5, 'five writes confirmed exactly once');
  console.log('five-write report: attempted 5, opened 5, confirmed exactly once 5, compatibility failures 0');
}

async function assertOptionalCoverage() {
  const represented = new Set();
  for (const canary of OPTIONAL_CANARIES) {
    const harness = createHarness(canary.slug, canary.args);
    const opened = await harness.gate.open(harness.request, { tabId: harness.tabId });
    assert.equal(opened.status, 'open', canary.slug + ' ' + canary.field + ' opens');
    const reviewText = opened.confirmation.target + '; ' + opened.confirmation.parameterSummary;
    assert.equal(reviewText.includes(canary.label + ': ' + canary.value), true,
      canary.slug + ' shows complete supplied ' + canary.label);
    const materialized = ActionAuthority.materializeConsequence(
      harness.state.full.consequenceContract,
      canary.args
    );
    assert.deepEqual(materialized.renderedFields, Object.keys(canary.args).sort(),
      canary.slug + ' suppliedFields equal renderedFields for ' + canary.field);
    const total = materialized.target.length + materialized.effect.length +
      materialized.parameterSummary.length + materialized.gerund.length;
    assert.ok(total <= 1024, canary.slug + ' confirmation stays within the 1024 bound');
    represented.add(canary.slug + '.' + canary.field);
  }

  for (const slug of ['notion.create_page', 'notion.update_page']) {
    const testCase = testCaseFor(slug);
    const harness = createHarness(slug, testCase.args);
    const opened = await harness.gate.open(harness.request, { tabId: harness.tabId });
    assert.equal(opened.status, 'open', slug + ' opens with all three optionals together');
    const rendered = ActionAuthority.materializeConsequence(
      harness.state.full.consequenceContract,
      testCase.args
    ).renderedFields;
    assert.deepEqual(rendered, Object.keys(testCase.args).sort(),
      slug + ' all supplied own keys equal renderedFields');
  }
  assert.deepEqual(Array.from(represented).sort(), [
    'notion.create_page.content',
    'notion.create_page.icon',
    'notion.create_page.parent_page_id',
    'notion.update_page.cover',
    'notion.update_page.icon',
    'notion.update_page.title'
  ], 'all six safe Notion optional fields are represented');
  console.log('optional report: all six optional fields represented; supplied/rendered coverage mismatches 0');
}

function boundarySubmission(contract, boundary) {
  const values = {};
  for (const field of contract.fields) {
    if (boundary === 'minimum' && !field.required) continue;
    if (field.kind === 'string') {
      const length = boundary === 'maximum' ? field.maxLength : Math.max(1, field.minLength);
      values[field.name] = 'x'.repeat(length);
    } else if (field.kind === 'boolean') {
      values[field.name] = boundary === 'maximum';
    } else if (field.kind === 'integer' || field.kind === 'number') {
      values[field.name] = String(boundary === 'maximum' ? field.maximum : field.minimum);
    } else if (field.kind === 'choice') {
      values[field.name] = boundary === 'maximum' ? field.choices.at(-1) : field.choices[0];
    }
  }
  return values;
}

function composerContext(projection) {
  const rows = rowsOf(projection);
  const readCount = rows.filter(function(row) { return row.sideEffectClass === 'read'; }).length;
  const writeCount = rows.filter(function(row) { return row.sideEffectClass === 'write'; }).length;
  const destructiveCount = rows.filter(function(row) { return row.sideEffectClass === 'destructive'; }).length;
  return deepFreeze({
    status: 'recognized',
    generation: projection.generation,
    exactOrigin: projection.exactOrigin,
    profileId: projection.profileId,
    profileVersion: projection.profileVersion,
    contextEpoch: 1,
    app: {
      appStem: projection.appStem,
      service: projection.service,
      displayName: projection.profile.displayName,
      pageNoun: projection.profile.pageNoun
    },
    genre: projection.profile.defaultGenre,
    lens: 'app-actions',
    semanticEntity: null,
    anchorDescriptor: null,
    capabilityGroups: projection.capabilityGroups,
    risk: {
      highest: destructiveCount ? 'destructive' : writeCount ? 'write' : 'read',
      readCount,
      writeCount,
      destructiveCount
    },
    reason: 'no-stable-entity',
    evidence: []
  });
}

function composeInput(context, kind, groupId, slug, confirmation) {
  return {
    context,
    intent: { kind, source: kind === 'initial' ? 'explicit-invocation' : 'skopeo-control' },
    selectedGroupId: groupId || null,
    selectedActionSlug: slug || null,
    anomalyEvidence: null,
    result: null,
    consequence: confirmation || null,
    argumentCollection: null
  };
}

function assertConfirmationRendersInShell(projection, slug, confirmation, label) {
  const context = composerContext(projection);
  const group = projection.capabilityGroups.find(function(candidate) {
    return candidate.capabilities.some(function(row) { return row.slug === slug; });
  });
  assert.ok(group, label + ' projected group exists');
  const initial = Composer.compose(composeInput(context, 'initial'));
  const focused = Composer.compose(composeInput(context, 'open-actions'));
  const interstitial = Composer.compose(composeInput(
    context, 'select-action', group.id, slug, confirmation
  ));
  assert.ok(interstitial && interstitial.attention === 'interstitial' && interstitial.consequence,
    label + ' composes one complete Interstitial model');
  assert.equal(Composer.validateRenderModel(interstitial), true,
    label + ' passes the production render-model validator');

  const shellHarness = createShellHarness(Shell, { generation: projection.generation });
  const prepared = shellHarness.shell.prepareAmbient();
  assert.ok(prepared && shellHarness.shell.mountAmbient(prepared), label + ' mounts the actual shell');
  assert.equal(shellHarness.shell.renderAdaptive(initial, []), true, label + ' renders initial state');
  assert.equal(shellHarness.shell.renderAdaptive(focused, []), true, label + ' renders Focused state');
  assert.equal(shellHarness.shell.renderAdaptive(interstitial, []), true,
    label + ' renders the actual alertdialog');
  const dialog = shellHarness.shadow().querySelector('[role="alertdialog"]');
  assert.ok(dialog, label + ' owns one visible alertdialog');
  assert.equal(dialog.textContent.includes(confirmation.actionLabel), true,
    label + ' alertdialog includes the exact action label');
  const synthetic = shellHarness.dispatchKey('Escape', { isTrusted: false });
  assert.equal(synthetic.defaultPrevented, false,
    label + ' rejects a page-created Escape at the shell boundary');
  assert.equal(shellHarness.calls.adaptive.length, 0,
    label + ' synthetic Escape emits no adaptive action');
  assert.equal(shellHarness.shell._attention, 'interstitial',
    label + ' synthetic Escape leaves the alertdialog mounted');

  const safe = shellHarness.shadow().querySelector('.skopeo-gate-return');
  if (label.endsWith('maximum')) {
    const trusted = shellHarness.dispatchKey('Escape', { isTrusted: true });
    assert.equal(trusted.defaultPrevented, true,
      label + ' trusted Escape is consumed by the shell');
    shellHarness.dispatchKey('Escape', { isTrusted: true });
  } else {
    safe.click();
    safe.click();
  }
  assert.equal(shellHarness.calls.adaptive.length, 1,
    label + ' trusted Interstitial exit emits exactly one generation-owned action');
  assert.equal(shellHarness.calls.adaptive[0].kind, 'cancel-consequence',
    label + ' trusted Interstitial exit routes through consequence cancellation');
  assert.equal(shellHarness.calls.adaptive[0].actionSlug, slug,
    label + ' cancellation remains bound to the selected write');
  assert.equal(shellHarness.shell._attention, 'interstitial',
    label + ' shell does not restore Focused before runtime acknowledges cancellation');
  assert.equal(shellHarness.shell.back(), true,
    label + ' runtime-owned post-cancel restoration can return to Focused');
  assert.equal(shellHarness.shell._attention, 'focused',
    label + ' acknowledged cancellation restores Focused');
  const zero = shellHarness.shell.destroy('consequence-boundary');
  assert.equal(Object.values(zero).every(function(value) { return value === 0; }), true,
    label + ' actual shell returns to exact zero');
}

async function assertFiveWriteRenderBoundaries() {
  assert.deepEqual(ActionAuthority.CONSEQUENCE_BOUNDS, {
    label: 80,
    roleValue: 256,
    objectProperties: 8,
    objectString: 128,
    aggregateRender: 1024,
    composedBody: 1152
  }, 'compiler, materializer, gate, composer, and shell share one frozen confirmation bound');
  assert.equal(Object.isFrozen(ActionAuthority.CONSEQUENCE_BOUNDS), true,
    'the shared consequence bound is immutable');

  for (const testCase of FIVE_READY_WRITE_CASES) {
    for (const boundary of ['minimum', 'maximum']) {
      const harness = createHarness(testCase.slug);
      const raw = boundarySubmission(harness.projected.argumentContract, boundary);
      const parsed = ActionAuthority.parseCollectedArguments(harness.projected.argumentContract, raw);
      assert.equal(parsed.ok, true, testCase.slug + ' ' + boundary + ' collector boundary parses');
      harness.request.args = clone(parsed.args);
      const opened = await harness.gate.open(harness.request, { tabId: harness.tabId });
      assert.equal(opened.status, 'open', testCase.slug + ' ' + boundary + ' gate opens');
      const total = opened.confirmation.target.length + opened.confirmation.effect.length +
        opened.confirmation.parameterSummary.length + opened.confirmation.gerund.length;
      assert.ok(total <= ActionAuthority.CONSEQUENCE_BOUNDS.aggregateRender,
        testCase.slug + ' ' + boundary + ' stays inside the shared aggregate bound');
      assertConfirmationRendersInShell(
        harness.state.projection,
        testCase.slug,
        opened.confirmation,
        testCase.slug + ' ' + boundary
      );
      const cancelled = harness.gate.cancel(confirmRequest(harness, opened), { tabId: harness.tabId });
      assert.equal(cancelled.status, 'cancelled', testCase.slug + ' ' + boundary + ' token is consumed');
    }
  }
}

async function assertCompilerAndMaterializerPolicies() {
  const createPage = createHarness('notion.create_page');
  const schemaWithSafeOptional = clone(createPage.state.schema);
  schemaWithSafeOptional.properties.subtitle = { type: 'string', maxLength: 80 };
  const missingRole = await compileSchema('notion.create_page', schemaWithSafeOptional);
  assert.equal(missingRole.compiled.compatible, false,
    'unregistered safe optional field is incompatible');
  assert.equal(missingRole.compiled.reason, 'accepted-field-unregistered',
    'unregistered safe optional field reports accepted-field-unregistered');

  const excludedContract = clone(ConsequenceTargets.getContract('notion.create_page'));
  excludedContract.excludedFromCollection = ['subtitle'];
  const reviewedExclusion = await compileSchema(
    'notion.create_page',
    schemaWithSafeOptional,
    excludedContract
  );
  assert.equal(reviewedExclusion.compiled.compatible, true,
    'reviewed optional exclusion can restore compatibility');
  assert.equal(reviewedExclusion.compiled.acceptedConsequenceFields.includes('subtitle'), false,
    'reviewed exclusion removes the optional from the effective collector');

  const update = createHarness('notion.update_page');
  const secretSchema = clone(update.state.schema);
  secretSchema.properties.api_token = {
    type: 'string',
    maxLength: 128,
    writeOnly: true,
    title: 'Forged API token title'
  };
  const secretBuilt = await compileSchema('notion.update_page', secretSchema);
  assert.equal(secretBuilt.compiled.compatible, true,
    'optional api_token/writeOnly secret stays outside collection');
  assert.equal(secretBuilt.compiled.acceptedConsequenceFields.includes('api_token'), false,
    'api_token is neither accepted nor confirmed');
  const secretRole = clone(ConsequenceTargets.getContract('notion.update_page'));
  secretRole.materialRoles.push({
    field: 'api_token', label: 'API token', render: 'scalar', maxLength: 128
  });
  const secretRoleBuilt = await compileSchema('notion.update_page', secretSchema, secretRole);
  assert.equal(secretRoleBuilt.compiled.compatible, false, 'secret role is rejected');

  const writeOnlySchema = clone(update.state.schema);
  writeOnlySchema.properties.cover.writeOnly = true;
  const writeOnlyBuilt = await compileSchema('notion.update_page', writeOnlySchema);
  assert.equal(writeOnlyBuilt.compiled.compatible, false,
    'registered writeOnly cover role is incompatible');

  const objectSchema = {
    type: 'object',
    properties: {
      record_id: { type: 'string', minLength: 1, maxLength: 128 },
      metadata: {
        type: 'object',
        properties: {
          alpha: { type: 'string', maxLength: 128 },
          count: { type: 'integer', minimum: 0, maximum: 9 }
        },
        required: ['alpha', 'count'],
        additionalProperties: false,
        maxProperties: 2
      }
    },
    required: ['record_id', 'metadata'],
    additionalProperties: false
  };
  const objectAuthority = {
    tier: 'T1a',
    executionOrigin: 'https://object.example.com',
    sideEffectClass: 'write',
    paramSchema: objectSchema,
    schemaDigest: await ActionAuthority.schemaDigest(objectSchema)
  };
  const objectArgumentContract = {
    mode: 'form',
    fields: [
      {
        name: 'record_id', label: 'Record id', kind: 'string', required: true,
        choices: null, minLength: 1, maxLength: 128, minimum: null, maximum: null
      },
      {
        name: 'metadata', label: 'Metadata', kind: 'bounded-object', required: true,
        choices: null, minLength: null, maxLength: null, minimum: null, maximum: null
      }
    ],
    reason: null,
    schemaDigest: objectAuthority.schemaDigest
  };
  const objectContract = {
    effectLabel: 'Update one record',
    progressLabel: 'Updating one record',
    targetRoles: [
      { field: 'record_id', label: 'Record ID', render: 'scalar', maxLength: 128 }
    ],
    materialRoles: [
      { field: 'metadata', label: 'Metadata', render: 'bounded-object', maxLength: 256 }
    ],
    excludedFromCollection: []
  };
  const compiledObject = ActionAuthority.compileConsequenceContract(
    'object.update_record', objectContract, objectAuthority, objectArgumentContract
  );
  assert.equal(compiledObject.compatible, true,
    'explicit closed bounded-object role is compatible');
  const objectMaterial = ActionAuthority.materializeConsequence(compiledObject, {
    record_id: 'record-7', metadata: { count: 2, alpha: 'A' }
  });
  assert.equal(objectMaterial.parameterSummary, 'Metadata: alpha: A, count: 2.',
    'bounded-object material renders deterministically');
  assert.deepEqual(objectMaterial.renderedFields, ['metadata', 'record_id'],
    'bounded-object material reports exact renderedFields');

  const objectFailures = [
    ['implicit object role', function(schema, contract) { contract.materialRoles[0].render = 'scalar'; }],
    ['open object', function(schema) { schema.properties.metadata.additionalProperties = true; }],
    ['unbounded object', function(schema) { delete schema.properties.metadata.maxProperties; }],
    ['more than 8 object keys', function(schema) {
      schema.properties.metadata.properties = {};
      for (let index = 0; index < 9; index += 1) {
        schema.properties.metadata.properties['key_' + index] = { type: 'string', maxLength: 8 };
      }
      schema.properties.metadata.required = Object.keys(schema.properties.metadata.properties);
      schema.properties.metadata.maxProperties = 9;
    }],
    ['nested object value', function(schema) {
      schema.properties.metadata.properties.alpha = {
        type: 'object', properties: {}, additionalProperties: false, maxProperties: 1
      };
    }],
    ['secret object key', function(schema) {
      schema.properties.metadata.properties.api_token = { type: 'string', maxLength: 8 };
      schema.properties.metadata.required.push('api_token');
      schema.properties.metadata.maxProperties = 3;
    }],
    ['oversized object text', function(schema) {
      schema.properties.metadata.properties.alpha.maxLength = 129;
    }]
  ];
  for (const [label, mutate] of objectFailures) {
    const schema = clone(objectSchema);
    const contract = clone(objectContract);
    mutate(schema, contract);
    const authority = Object.assign({}, objectAuthority, {
      paramSchema: schema,
      schemaDigest: await ActionAuthority.schemaDigest(schema)
    });
    const argumentContract = clone(objectArgumentContract);
    argumentContract.schemaDigest = authority.schemaDigest;
    const compiled = ActionAuthority.compileConsequenceContract(
      'object.update_record', contract, authority, argumentContract
    );
    assert.equal(compiled.compatible, false, label + ' bounded-object is incompatible');
  }
}

async function assertGateMutationMatrix() {
  for (const slug of [
    'notion.create_page',
    'notion.update_page',
    'notion.create_database',
    'notion.create_database_item'
  ]) {
    const harness = createHarness(slug);
    harness.state.descriptorClass = 'destructive';
    const blocked = await expectNoOpen(harness, slug + ' classification mismatch');
    assert.equal(blocked.reason, 'classification-mismatch',
      slug + ' resolved-vs-row side-effect mismatch is classified');
  }

  const missingChannel = createHarness('slack.chat.postMessage', { text: 'Message only' });
  await expectNoOpen(missingChannel, 'missing Slack channel target');
  const emptyChannel = createHarness('slack.chat.postMessage', { channel: '', text: 'Message' });
  await expectNoOpen(emptyChannel, 'missing Slack target value');
  const swappedChannel = createHarness('slack.chat.postMessage');
  swappedChannel.state.contract = clone(ConsequenceTargets.getContract(swappedChannel.slug));
  swappedChannel.state.contract.targetRoles[0].field = 'text';
  swappedChannel.state.contract.materialRoles[0].field = 'channel';
  await expectNoOpen(swappedChannel, 'swapped Slack channel/text roles');

  for (const canary of OPTIONAL_CANARIES) {
    const harness = createHarness(canary.slug, canary.args);
    harness.state.contract = clone(ConsequenceTargets.getContract(canary.slug));
    harness.state.contract.targetRoles = harness.state.contract.targetRoles.filter(function(role) {
      return role.field !== canary.field;
    });
    harness.state.contract.materialRoles = harness.state.contract.materialRoles.filter(function(role) {
      return role.field !== canary.field;
    });
    await expectNoOpen(harness,
      canary.slug + ' omitted optional role ' + canary.field + ' without exclusion');
  }

  const forgedTarget = createHarness('notion.update_page');
  const targetRequest = Object.assign({}, clone(forgedTarget.request), { target: 'Forged content target' });
  const targetBlocked = await expectNoOpen(forgedTarget, 'content-supplied target', targetRequest);
  assert.equal(targetBlocked.reason, 'open-request-invalid', 'content target is an unknown field');

  const secretSentinel = 'SECRET_SENTINEL_MUST_NOT_RENDER';
  const secretHarness = createHarness('notion.update_page', {
    page_id: 'page-secret', api_token: secretSentinel
  });
  const secretBlocked = await expectNoOpen(secretHarness, 'forged api_token/writeOnly secret');
  assert.equal(JSON.stringify(secretBlocked).includes(secretSentinel), false,
    'secret value is absent from gate diagnostics');

  for (const slug of ['notion.create_database', 'notion.create_database_item']) {
    const testCase = testCaseFor(slug);
    const propertiesHarness = createHarness(slug, Object.assign({}, clone(testCase.args), {
      properties: { status: 'unregistered-open-object' }
    }));
    await expectNoOpen(propertiesHarness, slug + ' extra/uncollected properties');
  }

  const metadataHarness = createHarness('notion.update_page');
  const metadataSchema = clone(metadataHarness.state.schema);
  metadataSchema.title = 'Forged action schema title';
  metadataSchema.description = 'Forged action schema description';
  metadataSchema.properties.page_id.title = 'Forged schema target';
  metadataSchema.properties.page_id.description = 'Forged target description';
  const metadataBuilt = await compileSchema('notion.update_page', metadataSchema);
  assert.equal(metadataBuilt.compiled.compatible, true,
    'schema title/description do not define consequence roles');
  installCompiledAuthority(metadataHarness, metadataBuilt);
  const forgedEntity = deepFreeze({
    kind: 'page', id: 'forged-page-id', label: 'Forged semantic target'
  });
  metadataHarness.state.authority = deepFreeze(Object.assign({}, clone(metadataHarness.state.authority), {
    semanticEntity: forgedEntity
  }));
  metadataHarness.request.semanticEntity = clone(forgedEntity);
  const metadataOpen = await metadataHarness.gate.open(metadataHarness.request, {
    tabId: metadataHarness.tabId
  });
  assert.equal(metadataOpen.status, 'open', 'metadata-injected schema still uses reviewed contract');
  assert.equal(metadataOpen.confirmation.target, 'Page ID: page-123',
    'schema title/description and semantic entity cannot inject target copy');

  const originHarness = createHarness('notion.update_page');
  const originFull = clone(originHarness.state.full);
  originFull.executionAuthority.executionOrigin = 'https://notion.so';
  originHarness.state.full = deepFreeze(originFull);
  await expectNoOpen(originHarness, 'service-derived execution origin confusion');

  const forgedRequests = [
    ['forged tab', function(harness) { return { request: harness.request, caller: { tabId: harness.tabId + 1 } }; }],
    ['forged origin', function(harness) {
      return { request: Object.assign({}, clone(harness.request), { exactOrigin: 'https://other.example.com' }), caller: { tabId: harness.tabId } };
    }],
    ['forged profile', function(harness) {
      return { request: Object.assign({}, clone(harness.request), { profileVersion: harness.request.profileVersion + '.forged' }), caller: { tabId: harness.tabId } };
    }],
    ['forged entity', function(harness) {
      return {
        request: Object.assign({}, clone(harness.request), {
          semanticEntity: { kind: 'page', id: 'other-page', label: 'Other page' }
        }),
        caller: { tabId: harness.tabId }
      };
    }]
  ];
  for (const [label, make] of forgedRequests) {
    const harness = createHarness('notion.update_page');
    const forged = make(harness);
    const result = await harness.gate.open(forged.request, forged.caller);
    assert.notEqual(result.status, 'open', label + ' fails closed with zero call');
    assert.equal(harness.calls.length, 0, label + ' makes zero call');
  }

  const staleMutations = [
    ['old schemaDigest', function(harness) {
      const schema = clone(harness.state.schema);
      schema.properties.cover.maxLength = 255;
      harness.state.schema = schema;
    }],
    ['old consequenceDigest', function(harness) {
      const full = clone(harness.state.full);
      full.consequenceDigest = 'sha256:' + '0'.repeat(64);
      harness.state.full = deepFreeze(full);
    }],
    ['changed role label', function(harness) {
      const contract = clone(harness.state.contract);
      contract.materialRoles[0].label = 'Changed page identifier';
      harness.state.contract = contract;
    }],
    ['changed role bound', function(harness) {
      const contract = clone(harness.state.contract);
      contract.materialRoles[0].maxLength -= 1;
      harness.state.contract = contract;
    }],
    ['changed projected profile', function(harness) {
      const projection = clone(harness.state.projection);
      projection.profileId = projection.profileId + '-replacement';
      harness.state.projection = deepFreeze(projection);
    }]
  ];
  for (const [label, mutate] of staleMutations) {
    const harness = createHarness('notion.update_page');
    const opened = await harness.gate.open(harness.request, { tabId: harness.tabId });
    assert.equal(opened.status, 'open', label + ' setup opens');
    mutate(harness);
    const result = await harness.gate.confirm(
      confirmRequest(harness, opened),
      { tabId: harness.tabId }
    );
    assert.equal(result.status, 'stale', label + ' after open is stale');
    assert.equal(harness.calls.length, 0, label + ' after open makes zero call');
  }

  const weakened = createHarness('notion.update_page');
  weakened.state.materializer = function(compiled, args) {
    const materialized = clone(ActionAuthority.materializeConsequence(compiled, args));
    materialized.materialItems = materialized.materialItems.filter(function(item) {
      return item.field !== 'cover';
    });
    materialized.renderedFields = materialized.renderedFields.filter(function(field) {
      return field !== 'cover';
    });
    materialized.parameterSummary = materialized.materialItems.map(function(item) {
      return item.label + ': ' + item.value;
    }).join('; ') + '.';
    return materialized;
  };
  const weakenedResult = await expectNoOpen(
    weakened,
    'weakened materializer skip supplied update_page cover'
  );
  assert.equal(weakenedResult.reason, 'rendered-fields-mismatch',
    'independent suppliedFields/renderedFields check catches omitted cover');

  const cancelReopen = createHarness('notion.update_page');
  const firstOpen = await cancelReopen.gate.open(cancelReopen.request, { tabId: cancelReopen.tabId });
  cancelReopen.gate.cancel(confirmRequest(cancelReopen, firstOpen), { tabId: cancelReopen.tabId });
  const reopened = await cancelReopen.gate.open(cancelReopen.request, { tabId: cancelReopen.tabId });
  const reopenedResult = await cancelReopen.gate.confirm(
    confirmRequest(cancelReopen, reopened),
    { tabId: cancelReopen.tabId }
  );
  assert.equal(reopenedResult.success, true, 'cancel/reopen permits one fresh explicit confirm');
  assert.equal(cancelReopen.calls.length, 1, 'cancel/reopen still invokes exactly once');
  const oldReplay = await cancelReopen.gate.confirm(
    confirmRequest(cancelReopen, firstOpen),
    { tabId: cancelReopen.tabId }
  );
  assert.equal(oldReplay.status, 'stale', 'cancelled old token cannot replay');

  const expiry = createHarness('notion.update_page');
  const realNow = Date.now;
  let clock = 1_900_000_000_000;
  Date.now = function() { return clock; };
  try {
    const opened = await expiry.gate.open(expiry.request, { tabId: expiry.tabId });
    clock += 30_000;
    const expired = await expiry.gate.confirm(
      confirmRequest(expiry, opened),
      { tabId: expiry.tabId }
    );
    assert.equal(expired.reason, 'token-expired', 'expired token is stale');
    assert.equal(expiry.calls.length, 0, 'expired token makes zero call');
  } finally {
    Date.now = realNow;
  }

  for (const reason of ['kill', 'replacement']) {
    const harness = createHarness('notion.update_page');
    const opened = await harness.gate.open(harness.request, { tabId: harness.tabId });
    harness.gate.invalidate(reason);
    const stale = await harness.gate.confirm(
      confirmRequest(harness, opened),
      { tabId: harness.tabId }
    );
    assert.equal(stale.status, 'stale', reason + ' before confirm is stale');
    assert.equal(harness.calls.length, 0, reason + ' before confirm makes zero call');
  }

  const deferred = createHarness('notion.update_page');
  deferred.state.deferInvoke = true;
  const deferredOpen = await deferred.gate.open(deferred.request, { tabId: deferred.tabId });
  const deferredConfirmation = confirmRequest(deferred, deferredOpen);
  const pending = deferred.gate.confirm(deferredConfirmation, { tabId: deferred.tabId });
  assert.equal(deferred.gate.getState().status, 'pending',
    'confirm consumes token and enters pending synchronously');
  const parallel = await deferred.gate.confirm(deferredConfirmation, { tabId: deferred.tabId });
  assert.equal(parallel.status, 'stale', 'parallel confirm is stale while pending');
  await waitFor(function() { return typeof deferred.state.resolveInvoke === 'function'; },
    'deferred router invocation');
  assert.equal(deferred.calls.length, 1, 'deferred double confirm reaches router exactly once');
  deferred.gate.invalidate('kill');
  deferred.state.resolveInvoke({ success: true, code: 'LATE_SUCCESS' });
  const late = await pending;
  assert.equal(late.status, 'stale', 'kill suppresses late router completion');
  assert.equal(late.reason, 'late-result', 'late completion is explicitly stale');
  assert.equal(deferred.calls.length, 1, 'late completion adds no router call');
}

async function main() {
  console.log('--- Skopeo trusted consequence authority ---');

  assert.deepEqual(Gate.STATUS, {
    IDLE: 'idle', OPEN: 'open', PENDING: 'pending', COMPLETE: 'complete',
    CANCELLED: 'cancelled', STALE: 'stale'
  }, 'exact status vocabulary is exported');
  assert.equal(Object.isFrozen(Gate.STATUS), true, 'status vocabulary is frozen');
  const shapeHarness = createHarness('notion.update_page');
  assert.equal(Gate.validateOpenRequest(shapeHarness.request), true, 'real open request is valid');
  assert.equal(Gate.validateOpenRequest(Object.assign({}, clone(shapeHarness.request), {
    target: 'forged target'
  })), false, 'content display claim is rejected');

  await assertFiveWriteMatrix();
  await assertFiveWriteRenderBoundaries();
  await assertOptionalCoverage();
  await assertCompilerAndMaterializerPolicies();
  await assertGateMutationMatrix();

  const gateSource = fs.readFileSync(GATE_PATH, 'utf8');
  const backgroundSource = fs.readFileSync(BACKGROUND_PATH, 'utf8');
  assert.equal(/TARGET_ROLE_VOCABULARY|targetRoleIdentity|targetFromEntity|projectedSummaryMatches/.test(gateSource), false,
    'retired target/schema/semantic heuristics are absent');
  assert.equal((gateSource.match(/router\.invoke\s*\(/g) || []).length, 1,
    'source has one post-confirm router.invoke dispatch site');
  assert.equal(/executeBoundSpec|executeBoundPageRead|chrome\.scripting|handler\.handle\s*\(|interpretRecipe|fetch\s*\(/.test(gateSource), false,
    'gate has no alternate direct executor');
  for (const symbol of [
    'getCurrentCapabilityAuthority', 'normalizeResolvedAuthority',
    'validateCollectedArguments', 'validateResolvedArgs', 'materializeConsequence',
    'consequenceDigest', 'suppliedFields', 'renderedFields'
  ]) {
    assert.equal(gateSource.includes(symbol) || backgroundSource.includes(symbol), true,
      symbol + ' full-authority wiring is present');
  }
  assert.equal(backgroundSource.includes("importScripts('catalog/skopeo-consequence-targets.js')"), true,
    'background imports trusted consequence targets before the gate');

  console.log('mutation report: classification/schema/consequenceDigest/target/secret/bounded-object/double/parallel/late paths fail closed');
  console.log('PASS: five-write consequence gate suite');
}

main().catch(function(error) {
  console.error('skopeo-consequence-gate.test.js failed:', error && error.stack ? error.stack : error);
  process.exit(1);
});
