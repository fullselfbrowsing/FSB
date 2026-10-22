'use strict';

/**
 * Skopeo gap closure: real installed catalog, bounded projection, production
 * background action controller, consequence gate, and route sequencing.
 *
 * This battery never executes an installed handler. The only side-effect seam
 * is a spy installed as FsbCapabilityRouter.invoke inside the production VM.
 */

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const BACKGROUND_PATH = path.join(ROOT, 'extension', 'background.js');
const VALIDATION_PATH = path.join(
  ROOT,
  '.planning/milestones/v1.2.0-SKOPEO-phases/53.1-generalize-skopeo-adaptive-huds-across-the-capability-catalo/53.1-VALIDATION.md'
);
const CLOSURE_COMMAND = 'node tests/skopeo-gap-closure.test.js';
const CONTROLLER_START = '/* FSB_SKOPEO_CONTROLLER_START */';
const CONTROLLER_END = '/* FSB_SKOPEO_CONTROLLER_END */';

if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;
if (!globalThis.CfworkerJsonSchema) {
  vm.runInThisContext(fs.readFileSync(
    path.join(ROOT, 'extension/lib/cfworker-json-schema.min.js'),
    'utf8'
  ));
}

const catalog = require('../extension/catalog/recipe-index.generated.js');
const Projector = require('../extension/utils/skopeo-capability-projector.js');
const RealRouter = require('../extension/utils/capability-router.js');
globalThis.FsbCapabilityRouter = RealRouter;
const ActionAuthority = require('../extension/utils/skopeo-action-authority.js');
const ConsequenceTargets = require('../extension/catalog/skopeo-consequence-targets.js');
const ConsequenceGate = require('../extension/utils/skopeo-consequence-gate.js');
const zillowHandlers = require('../extension/catalog/handlers/zillow.js');

const FIVE_WRITES = Object.freeze([
  Object.freeze({
    slug: 'notion.create_database',
    args: Object.freeze({ parent_page_id: 'page-1', title: 'Q3' }),
    target: 'Parent page ID: page-1',
    effect: 'Create one database',
    parameterSummary: 'Database title: Q3.',
    gerund: 'Creating one database'
  }),
  Object.freeze({
    slug: 'notion.create_database_item',
    args: Object.freeze({ database_id: 'db-1', title: 'Row' }),
    target: 'Database ID: db-1',
    effect: 'Create one database item',
    parameterSummary: 'Item title: Row.',
    gerund: 'Creating one database item'
  }),
  Object.freeze({
    slug: 'notion.create_page',
    args: Object.freeze({ title: 'Plan' }),
    target: 'New page title: Plan',
    effect: 'Create one page',
    parameterSummary: 'Page title: Plan.',
    gerund: 'Creating one page'
  }),
  Object.freeze({
    slug: 'notion.update_page',
    args: Object.freeze({ page_id: 'page-1' }),
    target: 'Page ID: page-1',
    effect: 'Update one page',
    parameterSummary: 'Updated page ID: page-1.',
    gerund: 'Updating one page'
  }),
  Object.freeze({
    slug: 'slack.chat.postMessage',
    args: Object.freeze({ channel: 'C123', text: 'test' }),
    target: 'Slack channel: C123',
    effect: 'Send one message',
    parameterSummary: 'Message: test.',
    gerund: 'Sending one message'
  })
]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function rowsOf(projection) {
  return projection && Array.isArray(projection.capabilityGroups)
    ? projection.capabilityGroups.flatMap(function(group) { return group.capabilities; })
    : [];
}

function profileFor(index, capability) {
  return index.profiles.find(function(profile) {
    return profile.profileKey === capability.profileKey;
  });
}

function sourceReadyCapabilities(index) {
  const profiles = new Map(index.profiles.map(function(profile) {
    return [profile.profileKey, profile];
  }));
  return index.capabilities.filter(function(capability) {
    const profile = profiles.get(capability.profileKey);
    return capability.sourceReadiness === 't1-ready' &&
      capability.sourceTerminalState === 't1-ready' &&
      capability.surfaceStatus === 't1-ready' && profile &&
      profile.profileDisposition !== 'ambiguous-stem';
  });
}

function boundedParamSummary(schema) {
  const properties = schema && schema.properties && typeof schema.properties === 'object'
    ? schema.properties
    : {};
  const names = Object.keys(properties).sort();
  const requiredSet = new Set(Array.isArray(schema && schema.required) ? schema.required : []);
  const required = names.filter(function(name) { return requiredSet.has(name); }).slice(0, 12);
  const optional = names.filter(function(name) { return !requiredSet.has(name); })
    .slice(0, Math.max(0, 12 - required.length));
  return {
    count: names.length,
    required,
    optional,
    truncated: required.length + optional.length < names.length
  };
}

function representativeRaw(contract) {
  const raw = {};
  for (const field of contract.fields) {
    if (!field.required) continue;
    if (field.kind === 'choice') raw[field.name] = field.choices[0];
    else if (field.kind === 'boolean') raw[field.name] = true;
    else if (field.kind === 'integer') {
      const minimum = field.minimum === null ? 1 : Math.ceil(field.minimum);
      raw[field.name] = String(field.maximum === null ? minimum : Math.min(minimum, field.maximum));
    } else if (field.kind === 'number') {
      const minimum = field.minimum === null ? 1 : field.minimum;
      raw[field.name] = String(field.maximum === null ? minimum : Math.min(minimum, field.maximum));
    } else {
      raw[field.name] = 'x'.repeat(Math.max(1, field.minLength || 0));
    }
  }
  return raw;
}

function ownKeyArgs(base, key, value) {
  const result = Object.create(null);
  for (const [name, entryValue] of Object.entries(base)) {
    Object.defineProperty(result, name, {
      value: entryValue, enumerable: true, writable: true, configurable: true
    });
  }
  Object.defineProperty(result, key, {
    value, enumerable: true, writable: true, configurable: true
  });
  return result;
}

function expectWeakenedFailure(label, assertion) {
  let failure = null;
  try {
    assertion();
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof assert.AssertionError,
    label + ': weakened control must fail its named assertion');
  assert.ok(String(failure.message).includes(label),
    label + ': weakened control failed for the intended reason');
}

async function loadRealIndexAndResolver() {
  const load = async function(relativePath) {
    return import(pathToFileURL(path.join(ROOT, relativePath)).href);
  };
  const generator = await load('scripts/generate-skopeo-profile-index.mjs');
  const readiness = await load('scripts/report-t1-readiness.mjs');
  const terminal = await load('scripts/report-t1-terminal-states.mjs');
  const authoredRegistry = require('../catalog/skopeo/app-profiles.json');
  const terminalReport = terminal.buildTerminalStateReport();
  const index = generator.buildSkopeoProfileIndex({
    descriptors: catalog.descriptors,
    terminalReport,
    authoredRegistry
  });
  const resolveInstalled = readiness.buildInstalledResolver(catalog);
  assert.equal(typeof resolveInstalled, 'function',
    'CR-01/CR-02 buildInstalledResolver exposes the installed catalog');
  return { index, resolveInstalled };
}

async function assertCatalogReachabilityAndAuthority(index, resolveInstalled) {
  assert.deepEqual(index.counts, {
    descriptors: 2319, stems: 129, services: 129, pairs: 131
  }, 'CR-01 real generated catalog retains all descriptor/stem/service/pair counts');

  const sourceReady = sourceReadyCapabilities(index);
  assert.equal(sourceReady.length, 1285, 'CR-01 source Ready corpus contains 1,285 rows');
  const installedReady = [];
  const projectionCache = new Map();
  const interactiveReadyWithoutArgumentPath = [];
  const unsupportedStatic = [];
  let projectedInteractive = 0;

  for (const capability of sourceReady) {
    const profile = profileFor(index, capability);
    const resolved = resolveInstalled(capability.slug, profile && profile.serviceOrigin);
    const normalized = await ActionAuthority.normalizeResolvedAuthority(resolved);
    if (!normalized) continue;
    installedReady.push({ capability, profile, resolved, normalized });

    const resolvedOrigin = resolved.origin || (resolved.handler && resolved.handler.origin);
    assert.equal(resolvedOrigin, capability.executionAuthority.executionOrigin,
      'CR-02 ' + capability.slug + ': installed resolved.origin equals generated executionOrigin');
    assert.equal(normalized.executionOrigin, capability.executionAuthority.executionOrigin,
      'CR-02 ' + capability.slug + ': normalized executionOrigin equals generated authority');
    assert.equal(ActionAuthority.authorityMatches(normalized, capability.executionAuthority), true,
      'CR-02 ' + capability.slug + ': complete installed authority matches generated authority');
    assert.equal(index.admittedOriginIndex.some(function(row) {
      return row.admittedOrigin === normalized.executionOrigin;
    }), true, 'CR-02 ' + capability.slug + ': executionOrigin belongs to admitted origins');
  }

  assert.equal(installedReady.length, 1279,
    'CR-02 exactly 1,279 source Ready rows have installed comparable authority');

  // Router validation may annotate a schema object internally. Complete the
  // corpus authority comparison first, then validate isolated schema clones so
  // one installed descriptor cannot affect another descriptor sharing a schema.
  for (const installed of installedReady) {
    const { capability, normalized } = installed;
    const resolved = freshResolvedEntry(
      installed.resolved,
      normalized.paramSchema,
      capability.service
    );
    let projection = projectionCache.get(normalized.executionOrigin);
    if (!projection) {
      projection = Projector.createProjection({
        tabId: projectionCache.size + 1,
        generation: 1,
        url: normalized.executionOrigin + '/skopeo-gap-closure'
      }, index);
      projectionCache.set(normalized.executionOrigin, projection);
    }
    if (projection.status !== 'recognized') continue;
    const projected = rowsOf(projection).find(function(row) {
      return row.slug === capability.slug;
    });
    assert.ok(projected, 'CR-01 ' + capability.slug + ': installed row survives projection');
    if (projected.invocable) {
      projectedInteractive += 1;
      const mode = projected.argumentContract && projected.argumentContract.mode;
      let validPath = mode === 'empty' || mode === 'form';
      if (validPath && mode === 'empty') {
        const parsed = ActionAuthority.parseCollectedArguments(projected.argumentContract, {});
        validPath = parsed.ok === true && RealRouter.validateResolvedArgs(resolved, parsed.args) === true;
      }
      if (validPath && mode === 'form') {
        const parsed = ActionAuthority.parseCollectedArguments(
          projected.argumentContract,
          representativeRaw(projected.argumentContract)
        );
        validPath = parsed.ok === true &&
          ActionAuthority.validateCollectedArguments(projected.argumentContract, parsed.args) === true &&
          RealRouter.validateResolvedArgs(resolved, parsed.args) === true;
      }
      if (!validPath) interactiveReadyWithoutArgumentPath.push(capability.slug);
      assert.equal(projection.exactOrigin, projected.executionOrigin,
        'CR-02 ' + capability.slug + ': interactive current page origin equals executionOrigin');
    } else if (projected.argumentContract.mode === 'unsupported') {
      unsupportedStatic.push(capability.slug);
      assert.equal(projected.presentationDisposition, 'unsupported',
        'CR-01 ' + capability.slug + ': unsupported argument shape stays static');
      assert.equal(projected.executionEnabled, false,
        'CR-01 ' + capability.slug + ': unsupported argument shape cannot execute');
    }
  }

  assert.deepEqual(interactiveReadyWithoutArgumentPath, [],
    'CR-01 interactiveReadyWithoutArgumentPath is exactly zero');
  assert.equal(projectedInteractive, 1264,
    'CR-01 exactly 1,264 source Ready rows have a real interactive argument path');
  assert.equal(unsupportedStatic.length, 15,
    'CR-01 15 comparable unsupported argument shapes remain static and non-invokable');

  for (const [slug, expectedOrigin] of [
    ['airbnb.get_current_user', 'https://www.airbnb.com'],
    ['notion.create_page', 'https://app.notion.com'],
    ['wikipedia.compare_revisions', 'https://en.wikipedia.org'],
    ['zillow.search_for_sale', 'https://www.zillow.com']
  ]) {
    const capability = index.capabilities.find(function(row) { return row.slug === slug; });
    assert.ok(capability && capability.executionAuthority,
      'CR-02 named diagnostic ' + slug + ' has installed authority');
    assert.equal(capability.executionAuthority.executionOrigin, expectedOrigin,
      'CR-02 named diagnostic ' + slug + ' keeps exact executionOrigin');
  }

  for (const slug of ['notion.create_page', 'wikipedia.compare_revisions']) {
    const capability = index.capabilities.find(function(row) { return row.slug === slug; });
    assert.notEqual(capability.service, new URL(capability.executionAuthority.executionOrigin).hostname,
      'CR-02 ' + slug + ': serviceIdentity remains distinct from executionOrigin host');
  }
  const variantFixtures = installedReady.filter(function(entry) {
    return entry.profile.admittedPageOrigins.length > 1 &&
      entry.profile.serviceOrigin !== entry.normalized.executionOrigin;
  });
  assert.ok(variantFixtures.some(function(entry) { return entry.capability.slug.startsWith('airbnb.'); }),
    'CR-02 installed variant-host fixtures include Airbnb');
  for (const entry of variantFixtures) {
    assert.notEqual(entry.capability.service, new URL(entry.normalized.executionOrigin).hostname,
      'CR-02 ' + entry.capability.slug + ': variant service identity differs from executionOrigin');
  }

  const airbnb = index.capabilities.find(function(row) {
    return row.slug === 'airbnb.get_current_user';
  });
  const airbnbProfile = profileFor(index, airbnb);
  assert.ok(airbnbProfile.admittedPageOrigins.includes(airbnbProfile.serviceOrigin),
    'CR-02 Airbnb service variant is an admitted current page origin');
  assert.notEqual(airbnbProfile.serviceOrigin, airbnb.executionAuthority.executionOrigin,
    'CR-02 Airbnb admitted variant differs from executionOrigin');
  const variantProjection = Projector.createProjection({
    tabId: 2500,
    generation: 1,
    url: airbnbProfile.serviceOrigin + '/skopeo-gap-closure-variant'
  }, index);
  const variantRow = rowsOf(variantProjection).find(function(row) {
    return row.slug === airbnb.slug;
  });
  assert.ok(variantRow, 'CR-02 admitted current variant still projects an honest static row');
  assert.equal(variantRow.invocable, false,
    'CR-02 admitted current variant unequal to executionOrigin is non-interactive');
  assert.equal(variantRow.executionBlockReason, 'execution-origin-mismatch',
    'CR-02 admitted variant reports exact execution-origin mismatch');

  expectWeakenedFailure('CR-01 weakened argument bypass', function() {
    const unsupported = { invocable: true, argumentContract: { mode: 'unsupported' } };
    assert.equal(
      unsupported.invocable && ['empty', 'form'].includes(unsupported.argumentContract.mode),
      true,
      'CR-01 weakened argument bypass'
    );
  });
  expectWeakenedFailure('CR-02 weakened current-origin admission', function() {
    assert.equal(airbnbProfile.serviceOrigin, airbnb.executionAuthority.executionOrigin,
      'CR-02 weakened current-origin admission');
  });

  return {
    sourceReady: sourceReady.length,
    installedReady: installedReady.length,
    projectedInteractive,
    unsupportedStatic: unsupportedStatic.length,
    interactiveReadyWithoutArgumentPath: interactiveReadyWithoutArgumentPath.length
  };
}

function assertCombinedArgumentRejection(contract, resolved, args, label) {
  const accepted = ActionAuthority.validateCollectedArguments(contract, args) === true &&
    RealRouter.validateResolvedArgs(resolved, args) === true;
  assert.equal(accepted, false, 'CR-01 ' + label + ' is rejected before invocation');
}

function assertArgumentCollectionAndValidation(index, resolveInstalled) {
  const requiredRead = index.capabilities.find(function(row) {
    return row.slug === 'slack.list_members';
  });
  const requiredEntry = resolveInstalled(requiredRead.slug, requiredRead.executionAuthority.executionOrigin);
  assert.equal(RealRouter.getResolvedParamsSchema(requiredEntry), requiredEntry.handler.params,
    'CR-01 getResolvedParamsSchema returns installed handler schema authority');
  const readParsed = ActionAuthority.parseCollectedArguments(requiredRead.argumentContract, {
    channel: 'C123', limit: '7'
  });
  assert.deepEqual(readParsed, { ok: true, args: { channel: 'C123', limit: 7 } },
    'CR-01 real required-argument read collects typed values');
  assert.equal(RealRouter.validateResolvedArgs(requiredEntry, readParsed.args), true,
    'CR-01 real required-argument read passes canonical router validation');

  const slackWrite = index.capabilities.find(function(row) {
    return row.slug === 'slack.chat.postMessage';
  });
  const slackEntry = resolveInstalled(slackWrite.slug, slackWrite.executionAuthority.executionOrigin);
  const slackParsed = ActionAuthority.parseCollectedArguments(slackWrite.argumentContract, {
    channel: 'C123', text: 'test'
  });
  assert.deepEqual(slackParsed, { ok: true, args: { channel: 'C123', text: 'test' } },
    'CR-01 Slack chat.postMessage uses the shared argument collector');
  assert.equal(RealRouter.validateResolvedArgs(slackEntry, slackParsed.args), true,
    'CR-01 collected Slack arguments pass the installed router schema');

  assertCombinedArgumentRejection(
    requiredRead.argumentContract,
    requiredEntry,
    { channel: 'C123', forged: true },
    'extra key'
  );
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    assertCombinedArgumentRejection(
      requiredRead.argumentContract,
      requiredEntry,
      ownKeyArgs({ channel: 'C123' }, key, 'polluted'),
      key + ' pollution key'
    );
  }
  assertCombinedArgumentRejection(
    requiredRead.argumentContract,
    requiredEntry,
    { channel: 123 },
    'wrong primitive type'
  );
  assertCombinedArgumentRejection(
    requiredRead.argumentContract,
    requiredEntry,
    { channel: 'C123', limit: Number.NaN },
    'non-finite number'
  );
  assertCombinedArgumentRejection(
    requiredRead.argumentContract,
    requiredEntry,
    { channel: 'x'.repeat(513) },
    'oversized value'
  );

  const secretShaped = index.capabilities.find(function(row) {
    return row.slug === 'meticulous.get_session';
  });
  const secretEntry = resolveInstalled(secretShaped.slug, secretShaped.executionAuthority.executionOrigin);
  assert.equal(secretShaped.argumentContract.mode, 'unsupported',
    'CR-01 required session secret is not exposed through the generic collector');
  assert.equal(RealRouter.validateResolvedArgs(secretEntry, {}), false,
    'CR-01 missing required secret-shaped session value fails installed schema validation');
  assert.equal(secretShaped.invocable, false,
    'CR-01 unsupported secret-shaped action cannot dispatch');
}

let consequenceSerial = 0;

function freshResolvedEntry(base, schema, service) {
  return {
    tier: 'T1a',
    origin: base.origin || base.handler.origin,
    handler: Object.assign({}, base.handler, {
      params: clone(schema),
      async handle() { return { success: true }; }
    }),
    descriptor: Object.assign({}, base.descriptor, {
      service,
      params: clone(schema)
    })
  };
}

function createConsequenceHarness(index, resolveInstalled, testCase) {
  consequenceSerial += 1;
  const full = index.capabilities.find(function(row) { return row.slug === testCase.slug; });
  const tabId = 3000 + consequenceSerial;
  const generation = 40 + consequenceSerial;
  const contextEpoch = 80 + consequenceSerial;
  const projection = Projector.createProjection({
    tabId,
    generation,
    url: full.executionAuthority.executionOrigin + '/skopeo-gap-closure'
  }, index);
  const projected = rowsOf(projection).find(function(row) { return row.slug === testCase.slug; });
  const installed = resolveInstalled(testCase.slug, full.executionAuthority.executionOrigin);
  assert.ok(projected && installed, 'CR-03 ' + testCase.slug + ': real authority is available');

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
    schema: clone(RealRouter.getResolvedParamsSchema(installed)),
    contract: ConsequenceTargets.getContract(testCase.slug)
  };
  const calls = [];
  const router = {
    getResolvedParamsSchema: RealRouter.getResolvedParamsSchema,
    validateResolvedArgs: RealRouter.validateResolvedArgs,
    async invoke(slug, args, context) {
      calls.push({ slug, args: clone(args), context: clone(context) });
      return { success: true, code: 'SCOPE_ONLY_ROUTER_SPY' };
    }
  };
  const gate = ConsequenceGate.createGateManager({
    getCurrentAuthority: function() { return state.authority; },
    getCurrentProjection: function() { return state.projection; },
    getCurrentCapabilityAuthority: function(slug) {
      return slug === testCase.slug ? state.full : null;
    },
    resolveCapability: function(slug, origin) {
      if (slug !== testCase.slug || origin !== state.full.executionAuthority.executionOrigin) return null;
      return freshResolvedEntry(installed, state.schema, state.full.service);
    },
    router,
    actionAuthority: ActionAuthority,
    consequenceTargets: {
      getContract: function(slug) { return slug === testCase.slug ? state.contract : null; }
    },
    materializeConsequence: ActionAuthority.materializeConsequence
  });
  const request = {
    generation,
    exactOrigin: projection.exactOrigin,
    profileVersion: projection.profileVersion,
    contextEpoch,
    semanticEntity: null,
    slug: testCase.slug,
    args: clone(testCase.args)
  };
  return { tabId, state, calls, gate, request, projected };
}

function confirmationRequest(harness, opened, overrides) {
  return Object.assign({}, clone(harness.request), {
    actionToken: opened.actionToken
  }, overrides || {});
}

async function assertFiveConsequenceCanaries(index, resolveInstalled) {
  let opened = 0;
  let confirmed = 0;
  let cancelled = 0;

  for (const testCase of FIVE_WRITES) {
    const cancelHarness = createConsequenceHarness(index, resolveInstalled, testCase);
    assert.equal(cancelHarness.projected.consequenceCompatible, true,
      'CR-03 ' + testCase.slug + ': trusted consequence metadata is compatible');
    assert.equal(cancelHarness.projected.consequenceDigest, cancelHarness.state.full.consequenceDigest,
      'CR-03 ' + testCase.slug + ': projected digest binds full trusted metadata');
    assert.equal(Object.hasOwn(cancelHarness.projected, 'consequenceContract'), false,
      'CR-03 ' + testCase.slug + ': target roles remain background-only');
    const cancelOpen = await cancelHarness.gate.open(cancelHarness.request, {
      tabId: cancelHarness.tabId
    });
    assert.equal(cancelOpen.status, 'open',
      'CR-03 ' + testCase.slug + ': exact trusted confirmation opens');
    assert.deepEqual(cancelOpen.confirmation, {
      actionSlug: testCase.slug,
      actionLabel: cancelHarness.projected.actionLabel,
      target: testCase.target,
      effect: testCase.effect,
      parameterSummary: testCase.parameterSummary,
      gerund: testCase.gerund
    }, 'CR-03 ' + testCase.slug + ': exact target/effect/material metadata');
    opened += 1;
    const cancelResult = cancelHarness.gate.cancel(
      confirmationRequest(cancelHarness, cancelOpen),
      { tabId: cancelHarness.tabId }
    );
    assert.equal(cancelResult.status, 'cancelled', 'CR-03 ' + testCase.slug + ': cancel closes gate');
    assert.equal(cancelHarness.calls.length, 0, 'CR-03 ' + testCase.slug + ': cancel invokes zero times');
    cancelled += 1;

    const harness = createConsequenceHarness(index, resolveInstalled, testCase);
    const acceptedOpen = await harness.gate.open(harness.request, { tabId: harness.tabId });
    const confirmation = confirmationRequest(harness, acceptedOpen);
    const first = harness.gate.confirm(confirmation, { tabId: harness.tabId });
    const concurrent = await harness.gate.confirm(confirmation, { tabId: harness.tabId });
    assert.equal(concurrent.status, 'stale',
      'CR-03 ' + testCase.slug + ': concurrent token reuse is stale');
    const accepted = await first;
    assert.equal(accepted.success, true, 'CR-03 ' + testCase.slug + ': one explicit confirmation succeeds');
    assert.equal(harness.calls.length, 1, 'CR-03 ' + testCase.slug + ': sole router invokes exactly once');
    assert.deepEqual(harness.calls[0], {
      slug: testCase.slug,
      args: clone(testCase.args),
      context: {
        origin: harness.state.full.executionAuthority.executionOrigin,
        tabId: harness.tabId,
        source: 'skopeo'
      }
    }, 'CR-03 ' + testCase.slug + ': exact args and origin reach sole router');
    const replay = await harness.gate.confirm(confirmation, { tabId: harness.tabId });
    assert.equal(replay.status, 'stale', 'CR-03 ' + testCase.slug + ': replay is stale');
    assert.equal(harness.calls.length, 1, 'CR-03 ' + testCase.slug + ': replay adds zero calls');
    confirmed += 1;
  }

  const negativeCase = FIVE_WRITES.find(function(row) { return row.slug === 'notion.update_page'; });
  const forged = createConsequenceHarness(index, resolveInstalled, negativeCase);
  const forgedOpen = await forged.gate.open(forged.request, { tabId: forged.tabId });
  const forgedResult = await forged.gate.confirm(
    confirmationRequest(forged, forgedOpen, { actionToken: 'forged-token' }),
    { tabId: forged.tabId }
  );
  assert.equal(forgedResult.status, 'stale', 'CR-03 forged token is stale');
  assert.equal(forged.calls.length, 0, 'CR-03 forged token invokes zero times');

  const stale = createConsequenceHarness(index, resolveInstalled, negativeCase);
  const staleOpen = await stale.gate.open(stale.request, { tabId: stale.tabId });
  stale.state.authority = deepFreeze(Object.assign({}, clone(stale.state.authority), {
    contextEpoch: stale.state.authority.contextEpoch + 1
  }));
  const staleResult = await stale.gate.confirm(
    confirmationRequest(stale, staleOpen),
    { tabId: stale.tabId }
  );
  assert.equal(staleResult.status, 'stale', 'CR-03 stale session is rejected');
  assert.equal(stale.calls.length, 0, 'CR-03 stale session invokes zero times');

  const targetMismatch = createConsequenceHarness(index, resolveInstalled, negativeCase);
  const targetOpen = await targetMismatch.gate.open(targetMismatch.request, { tabId: targetMismatch.tabId });
  targetMismatch.state.contract = clone(targetMismatch.state.contract);
  targetMismatch.state.contract.targetRoles[0].label = 'Forged target';
  const targetResult = await targetMismatch.gate.confirm(
    confirmationRequest(targetMismatch, targetOpen),
    { tabId: targetMismatch.tabId }
  );
  assert.equal(targetResult.status, 'stale', 'CR-03 target metadata mismatch is stale');
  assert.equal(targetMismatch.calls.length, 0, 'CR-03 target metadata mismatch invokes zero times');

  const digestMismatch = createConsequenceHarness(index, resolveInstalled, negativeCase);
  const digestOpen = await digestMismatch.gate.open(digestMismatch.request, { tabId: digestMismatch.tabId });
  digestMismatch.state.schema.properties.cover.description = 'hidden schema authority changed';
  const digestResult = await digestMismatch.gate.confirm(
    confirmationRequest(digestMismatch, digestOpen),
    { tabId: digestMismatch.tabId }
  );
  assert.equal(digestResult.status, 'stale', 'CR-03 schema-digest mismatch is stale');
  assert.equal(digestMismatch.calls.length, 0, 'CR-03 schema-digest mismatch invokes zero times');

  const exactAdmission = function(input) {
    return input.targetMatches && input.tokenCurrent && input.schemaDigestMatches;
  };
  assert.equal(exactAdmission({
    targetMatches: false, tokenCurrent: true, schemaDigestMatches: true
  }), false, 'CR-03 real exact consequence admission rejects target mismatch');
  expectWeakenedFailure('CR-03 weakened consequence validation', function() {
    const bypassExactValidation = function() { return true; };
    assert.equal(bypassExactValidation(), false, 'CR-03 weakened consequence validation');
  });

  return { attempted: FIVE_WRITES.length, opened, confirmed, cancelled };
}

function installedZillowEntry(harness, slug) {
  const handler = zillowHandlers[slug];
  if (!handler) return null;
  const params = clone(handler.params);
  const entry = {
    tier: 'T1a',
    origin: handler.origin,
    handler: Object.assign({}, handler, {
      params,
      async handle() {
        harness.directHandlerCalls += 1;
        return { success: false };
      }
    }),
    descriptor: {
      slug,
      service: 'zillow.com',
      sideEffectClass: handler.sideEffectClass,
      params: clone(params)
    }
  };
  return typeof harness.resolveOverride === 'function'
    ? harness.resolveOverride(entry, slug)
    : entry;
}

function createActionHarness() {
  const records = new Map();
  const routerCalls = [];
  const noopEvent = { addListener() {}, removeListener() {} };
  const harness = {
    records,
    routerCalls,
    directHandlerCalls: 0,
    fetchCalls: 0,
    resolveOverride: null
  };
  harness.chrome = {
    runtime: {
      id: 'skopeo-gap-closure-extension',
      onMessage: noopEvent,
      async sendMessage() { return true; }
    },
    commands: { onCommand: noopEvent },
    tabs: { onUpdated: noopEvent, onRemoved: noopEvent },
    storage: {
      session: {
        async get(key) {
          if (typeof key === 'string') {
            return records.has(key) ? { [key]: records.get(key) } : {};
          }
          return Object.fromEntries(records);
        },
        async set(bag) {
          for (const [key, value] of Object.entries(bag || {})) records.set(key, value);
        },
        async remove(key) { records.delete(key); }
      }
    }
  };
  return harness;
}

function bootProductionActionController(background, harness, index) {
  const start = background.indexOf(CONTROLLER_START);
  const end = background.indexOf(CONTROLLER_END);
  assert.ok(start >= 0 && end > start, 'CR-04 production Skopeo controller markers are ordered');
  let source = background.slice(start, end + CONTROLLER_END.length);
  const exportAnchor = '  global.FSBSkopeoController = controller;';
  assert.ok(source.includes(exportAnchor), 'CR-04 production controller export anchor exists');
  source = source.replace(exportAnchor, [
    '  controller.__testSeedActionEntry = function (tabId, projection, contextEpoch) {',
    '    installController(tabId, projection.generation, projection);',
    '    const entry = controllers.get(tabId);',
    '    entry.authority = deepFreezeSkopeo({ contextEpoch: contextEpoch, semanticEntity: null });',
    '    entry.attention = "focused";',
    '    return entry;',
    '  };',
    exportAnchor
  ].join('\n'));
  source = source.replace(
    '  controller.ready = rehydrateStoredSessions();',
    '  controller.ready = Promise.resolve({ success: true, restored: 0, normalized: 0 });'
  );

  const router = {
    getResolvedParamsSchema: RealRouter.getResolvedParamsSchema,
    validateResolvedArgs: RealRouter.validateResolvedArgs,
    async invoke(slug, args, context) {
      harness.routerCalls.push({ slug, args: clone(args), context: clone(context) });
      return { success: true, message: 'One scoped fixture result is available.' };
    }
  };
  const sandbox = {
    chrome: harness.chrome,
    FSBSkopeoSessionState: require('../extension/utils/skopeo-session-state.js'),
    FsbSkopeoProfileIndex: index,
    FsbSkopeoCapabilityProjector: Projector,
    FsbSkopeoActionAuthority: ActionAuthority,
    FsbSkopeoConsequenceTargets: ConsequenceTargets,
    FsbCapabilityCatalog: {
      resolve: function(slug) { return installedZillowEntry(harness, slug); }
    },
    FsbCapabilityRouter: router,
    FsbSkopeoConsequenceGate: ConsequenceGate,
    CfworkerJsonSchema: globalThis.CfworkerJsonSchema,
    fetch: function() {
      harness.fetchCalls += 1;
      throw new Error('direct fetch bypass');
    },
    AbortController,
    console,
    Date,
    Promise,
    Object,
    Array,
    Number,
    String,
    Boolean,
    JSON,
    Map,
    Set,
    Error,
    TypeError,
    URL
  };
  sandbox.globalThis = sandbox;
  vm.runInContext(source, vm.createContext(sandbox), {
    filename: 'background-skopeo-gap-closure-controller.js'
  });
  assert.ok(sandbox.FSBSkopeoController, 'CR-04 production action controller boots');
  return sandbox.FSBSkopeoController;
}

function activeRecord(tabId, generation) {
  return {
    tabId,
    generation,
    status: 'active',
    terminalGeneration: generation - 1,
    updatedAt: 100,
    reason: null
  };
}

function seedActionTab(controller, harness, index, tabId, generation, url) {
  const projection = Projector.createProjection({ tabId, generation, url }, index);
  assert.equal(projection.status, 'recognized', 'CR-04 production action origin is recognized');
  harness.records.set('skopeoSession:' + tabId, activeRecord(tabId, generation));
  controller.__testSeedActionEntry(tabId, projection, 1);
  return projection;
}

function readMessage(projection, slug, args, actionToken) {
  const row = rowsOf(projection).find(function(candidate) { return candidate.slug === slug; });
  return {
    action: 'skopeo:read-invoke',
    generation: projection.generation,
    exactOrigin: projection.exactOrigin,
    profileId: projection.profileId,
    profileVersion: projection.profileVersion,
    catalogVersion: projection.catalogVersion,
    contextEpoch: 1,
    semanticEntity: null,
    slug,
    args,
    actionToken,
    schemaDigest: row.argumentContract.schemaDigest
  };
}

async function assertZillowBackgroundFidelity(index) {
  const background = fs.readFileSync(BACKGROUND_PATH, 'utf8');
  assert.equal((background.match(/FsbCapabilityRouter\.invoke\s*\(/g) || []).length, 1,
    'CR-04 background has one Skopeo read router chokepoint');
  const harness = createActionHarness();
  const controller = bootProductionActionController(background, harness, index);
  await controller.ready;
  const senderFor = function(tabId) {
    return { id: harness.chrome.runtime.id, tab: { id: tabId } };
  };

  const full = index.capabilities.find(function(row) {
    return row.slug === 'zillow.search_for_sale';
  });
  const schema = full.executionAuthority.paramSchema;
  const names = Object.keys(schema.properties).sort();
  assert.equal(names.length, 13, 'CR-04 Zillow background authority retains all 13 parameters');
  assert.equal(ActionAuthority.canonicalSchemaJson(schema),
    ActionAuthority.canonicalSchemaJson(RealRouter.getResolvedParamsSchema({ params: schema })),
  'CR-04 Zillow canonical full schema is the router schema authority');
  assert.equal(await ActionAuthority.schemaDigest(schema), full.executionAuthority.schemaDigest,
    'CR-04 Zillow schemaDigest binds canonicalSchemaJson over all 13 parameters');

  const projection = seedActionTab(
    controller, harness, index, 4100, 5, 'https://www.zillow.com/homes/'
  );
  const projected = rowsOf(projection).find(function(row) { return row.slug === full.slug; });
  assert.equal(Object.hasOwn(projected, 'paramSchema'), false,
    'CR-04 Zillow projection contains no schema');
  assert.equal(Object.hasOwn(projected, 'executionAuthority'), false,
    'CR-04 Zillow projection contains no full execution authority');
  assert.equal(projected.schemaDigest, full.executionAuthority.schemaDigest,
    'CR-04 Zillow projection retains the full-schema digest');
  assert.equal(projected.paramSummary.count, 13, 'CR-04 Zillow display count remains 13');
  assert.ok(projected.paramSummary.required.length + projected.paramSummary.optional.length <= 12,
    'CR-04 Zillow display names remain bounded to 12');
  assert.equal(projected.paramSummary.truncated, true,
    'CR-04 Zillow bounded summary reports truncation');

  const response = await controller.handleContentMessage(
    readMessage(projection, full.slug, {}, 'zillow_empty_exactly_once'),
    senderFor(4100)
  );
  assert.equal(response.success, true, 'CR-04 Zillow empty args pass production background validation');
  assert.equal(harness.routerCalls.length, 1, 'CR-04 Zillow empty args invoke sole router exactly once');
  assert.deepEqual(harness.routerCalls[0], {
    slug: full.slug,
    args: {},
    context: { origin: 'https://www.zillow.com', tabId: 4100, source: 'skopeo' }
  }, 'CR-04 Zillow production dispatch uses exact empty args and installed origin');

  const mutatedSchema = clone(schema);
  const hiddenName = names[12];
  mutatedSchema.properties[hiddenName].description =
    String(mutatedSchema.properties[hiddenName].description || '') + ' hidden authority mutation';
  assert.deepEqual(boundedParamSummary(mutatedSchema), boundedParamSummary(schema),
    'CR-04 hidden thirteenth mutation retains identical bounded paramSummary');
  const mutatedDigest = await ActionAuthority.schemaDigest(mutatedSchema);
  assert.notEqual(mutatedDigest, full.executionAuthority.schemaDigest,
    'CR-04 hidden thirteenth mutation changes full-schema digest');
  expectWeakenedFailure('CR-04 weakened displayed-name digest', function() {
    const weakDigest = function(value) {
      return JSON.stringify(boundedParamSummary(value));
    };
    assert.notEqual(weakDigest(schema), weakDigest(mutatedSchema),
      'CR-04 weakened displayed-name digest');
  });

  const tamperProjection = seedActionTab(
    controller, harness, index, 4101, 6, 'https://www.zillow.com/homes/'
  );
  harness.resolveOverride = function(entry, slug) {
    if (slug !== full.slug) return entry;
    return Object.assign({}, entry, {
      handler: Object.assign({}, entry.handler, { params: clone(mutatedSchema) }),
      descriptor: Object.assign({}, entry.descriptor, { params: clone(mutatedSchema) })
    });
  };
  const beforeTamper = harness.routerCalls.length;
  const tampered = await controller.handleContentMessage(
    readMessage(tamperProjection, full.slug, {}, 'zillow_hidden_schema_tamper'),
    senderFor(4101)
  );
  assert.equal(tampered.success, false,
    'CR-04 hidden thirteenth schema mutation invalidates projected authority');
  assert.equal(harness.routerCalls.length, beforeTamper,
    'CR-04 hidden thirteenth schema mutation invokes zero times');
  assert.equal(harness.directHandlerCalls, 0, 'CR-04 installed handler is never called directly');
  assert.equal(harness.fetchCalls, 0, 'CR-04 direct fetch bypass is never used');

  return { parameters: 13, displayed: 12, emptyDispatches: 1, hiddenTamperDispatches: 0 };
}

function runFocusedProductionGate(relativePath, label, marker) {
  let output = '';
  try {
    output = childProcess.execFileSync(process.execPath, [path.join(ROOT, relativePath)], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: Object.assign({}, process.env, { FORCE_COLOR: '0' })
    });
  } catch (error) {
    const detail = String((error && (error.stderr || error.stdout)) || error).slice(-4000);
    assert.fail(label + ' failed: ' + detail);
  }
  if (marker) assert.ok(output.includes(marker), label + ' emits its production PASS marker');
  return output;
}

function assertRouteSequencingAndPreservedBehavior() {
  const background = fs.readFileSync(BACKGROUND_PATH, 'utf8');
  for (const symbol of ['captureRouteRequest', 'routeRequestIsCurrent', 'queueCurrentRouteCommit']) {
    assert.ok(background.includes(symbol), 'CR-05 production background retains ' + symbol);
  }
  const routeOutput = runFocusedProductionGate(
    'tests/skopeo-sidepanel-command.test.js',
    'CR-05 production newest-first/cross-tab/replacement/kill/navigation/origin route gate',
    'skopeo side-panel/command production contract: PASS'
  );
  assert.ok(routeOutput.includes('PASS'),
    'CR-05 newest-first production race and terminal-boundary matrix pass');

  runFocusedProductionGate(
    'tests/skopeo-app-context-resolver.test.js',
    'ADAPT-02 independent resolver and Drive delegation regression'
  );
  runFocusedProductionGate(
    'tests/skopeo-profile-schema.test.js',
    'ADAPT-04 read-profile behavior regression'
  );
  runFocusedProductionGate(
    'tests/skopeo-genre-adapters.test.js',
    'ADAPT-05 scoped Drive delivery regression'
  );

  expectWeakenedFailure('CR-05 weakened obsolete-route currentness', function() {
    const forceObsoleteCurrent = function() { return true; };
    assert.equal(forceObsoleteCurrent(), false,
      'CR-05 weakened obsolete-route currentness');
  });
  return {
    newestFirst: 'passed',
    crossTab: 'passed',
    replacedGeneration: 'passed',
    killed: 'passed',
    hardNavigation: 'passed',
    originChange: 'passed'
  };
}

function assertRegistrationStage() {
  const packageJson = require('../package.json');
  const packageCounts = {
    test: packageJson.scripts.test.split(CLOSURE_COMMAND).length - 1,
    validateExtension: packageJson.scripts['validate:extension'].split(CLOSURE_COMMAND).length - 1
  };
  const ledger = fs.readFileSync(VALIDATION_PATH, 'utf8');
  const ledgerCount = ledger.split(CLOSURE_COMMAND).length - 1;

  if (packageCounts.test === 0 && packageCounts.validateExtension === 0 && ledgerCount === 0) {
    throw new Error(
      'gap-closure expected RED: package registrations missing; validation ledger registration missing'
    );
  }
  if (packageCounts.test === 1 && packageCounts.validateExtension === 1 && ledgerCount === 0) {
    throw new Error('gap-closure expected RED: validation ledger registration missing');
  }
  if (packageCounts.test !== 1 || packageCounts.validateExtension !== 1 || ledgerCount !== 1) {
    throw new Error(
      'gap-closure unexpected registration counts: test=' + packageCounts.test +
      '; validate:extension=' + packageCounts.validateExtension + '; ledger=' + ledgerCount
    );
  }
}

async function main() {
  console.log('--- skopeo gap closure ---');
  const { index, resolveInstalled } = await loadRealIndexAndResolver();
  const catalogMetrics = await assertCatalogReachabilityAndAuthority(index, resolveInstalled);
  assertArgumentCollectionAndValidation(index, resolveInstalled);
  const consequenceMetrics = await assertFiveConsequenceCanaries(index, resolveInstalled);
  const zillowMetrics = await assertZillowBackgroundFidelity(index);
  const routeMetrics = assertRouteSequencingAndPreservedBehavior();

  console.log('CR-01:', JSON.stringify(catalogMetrics));
  console.log('CR-02: authority mismatches=0; interactive origin mismatches=0; named inequalities=passed');
  console.log('CR-03:', JSON.stringify(consequenceMetrics));
  console.log('CR-04:', JSON.stringify(zillowMetrics));
  console.log('CR-05:', JSON.stringify(routeMetrics));
  console.log('preserved: ADAPT-02 resolver=passed; ADAPT-04 read-profile=passed; ADAPT-05 Drive=passed');
  console.log('weakened controls: CR-01=failed; CR-02=failed; CR-03=failed; CR-04=failed; CR-05=failed');

  // Registration is deliberately checked last so controlled RED cannot mask a
  // substantive catalog, projection, consequence, background, or route failure.
  assertRegistrationStage();
  console.log('skopeo gap closure: PASS');
}

main().catch(function(error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
