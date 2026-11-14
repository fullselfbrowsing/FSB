'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const BACKGROUND_PATH = path.join(ROOT, 'extension', 'background.js');
const RUNTIME_PATH = path.join(ROOT, 'extension', 'content', 'skopeo-runtime.js');
const MANIFEST_PATH = path.join(ROOT, 'extension', 'manifest.json');
const PROFILE_INDEX_PATH = path.join(ROOT, 'extension', 'catalog', 'skopeo-profile-index.generated.js');
const PROFILE_SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-profile-schema.js');
const PROJECTOR_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-capability-projector.js');
const CONSEQUENCE_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-consequence-gate.js');
const CONSEQUENCE_TARGETS_PATH = path.join(ROOT, 'extension', 'catalog', 'skopeo-consequence-targets.js');
const AUTHORITY_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-action-authority.js');
const ROUTER_PATH = path.join(ROOT, 'extension', 'utils', 'capability-router.js');
const CONTROLLER_START = '/* FSB_SKOPEO_CONTROLLER_START */';
const CONTROLLER_END = '/* FSB_SKOPEO_CONTROLLER_END */';

if (!globalThis.CfworkerJsonSchema) {
  vm.runInThisContext(source(path.join(ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js')));
}

const profileIndex = require(PROFILE_INDEX_PATH);
const projector = require(PROJECTOR_PATH);
const actionAuthority = require(AUTHORITY_PATH);
const consequenceGate = require(CONSEQUENCE_PATH);
const realRouter = require(ROUTER_PATH);
const rendererRegistry = require(path.join(ROOT, 'extension', 'content', 'skopeo-renderer-registry.js'));
const slackHandlers = require(path.join(ROOT, 'extension', 'catalog', 'handlers', 'slack.js'));
const notionHandlers = require(path.join(ROOT, 'extension', 'catalog', 'handlers', 'notion.js'));
const zillowHandlers = require(path.join(ROOT, 'extension', 'catalog', 'handlers', 'zillow.js'));
const githubHandlers = require(path.join(ROOT, 'extension', 'catalog', 'handlers', 'github.js'));
const { GENRE_MATRIX: genreMatrix } = require('./fixtures/skopeo-catalog/genre-matrix.js');

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

const EXPECTED_DYNAMIC_FILES = Object.freeze([
  'utils/skopeo-profile-schema.js',
  'utils/skopeo-action-authority.js',
  'utils/skopeo-capability-projector.js',
  'content/skopeo-context-router.js',
  'content/skopeo-app-context-resolver.js',
  'content/skopeo-anchor-registry.js',
  'content/skopeo-adapter-registry.js',
  'utils/skopeo-hud-schema.js',
  'content/skopeo-adaptive-composer.js',
  'content/skopeo-renderer-registry.js',
  'content/skopeo-shell.js',
  'content/skopeo-runtime.js'
]);

const EXPECTED_BACKGROUND_IMPORTS = Object.freeze([
  'catalog/skopeo-profile-index.generated.js',
  'utils/skopeo-profile-schema.js',
  'catalog/skopeo-consequence-targets.js',
  'utils/skopeo-action-authority.js',
  'utils/skopeo-capability-projector.js',
  'utils/skopeo-consequence-gate.js'
]);

function source(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseStringArray(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(escaped + '\\s*=\\s*Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)'));
  assert.ok(match, name + ' is a frozen file list');
  return Array.from(match[1].matchAll(/['"]([^'"]+)['"]/g), function (entry) {
    return entry[1];
  });
}

function rowsOf(projection) {
  return projection.capabilityGroups.flatMap(function (group) { return group.capabilities; });
}

function assertStaticAndOrderedContracts(background, runtime, manifest) {
  assert.match(background, /skopeo:configure/,
    'configure projection must exist before adaptive runtime preparation');
  const contentScripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  const staticFiles = contentScripts.flatMap(function (entry) {
    return Array.isArray(entry.js) ? entry.js : [];
  });
  assert.equal(staticFiles.some(function (file) { return /skopeo/i.test(file); }), false,
    'no static/all-pages Skopeo bundle exists');

  for (const file of EXPECTED_BACKGROUND_IMPORTS) {
    assert.match(background, new RegExp("importScripts\\('" + file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'\\)"),
      file + ' is loaded in the service worker');
  }
  const routerImport = background.indexOf("importScripts('utils/capability-router.js')");
  const profileImport = background.indexOf("importScripts('catalog/skopeo-profile-index.generated.js')");
  const authorityImport = background.indexOf("importScripts('utils/skopeo-action-authority.js')");
  const projectorImport = background.indexOf("importScripts('utils/skopeo-capability-projector.js')");
  const controller = background.indexOf('/* FSB_SKOPEO_CONTROLLER_START */');
  assert.ok(routerImport >= 0 && profileImport > routerImport && authorityImport > profileImport &&
    projectorImport > authorityImport && controller > projectorImport,
  'catalog/router/action-authority dependencies load before the one Skopeo controller');

  assert.deepEqual(parseStringArray(background, 'SKOPEO_INJECTION_FILES'), EXPECTED_DYNAMIC_FILES,
    'one explicit invocation injects the complete adaptive stack in dependency order');
  assert.equal(EXPECTED_DYNAMIC_FILES.filter(function (file) { return file === 'content/skopeo-runtime.js'; }).length, 1,
    'the ordered stack contains one final runtime');

  const createProjection = background.indexOf('createProjection');
  const executeScript = background.indexOf('chrome.scripting.executeScript', createProjection);
  const configure = background.indexOf("action: 'skopeo:configure'", executeScript);
  const prepare = background.indexOf("action: 'skopeo:prepare'", configure);
  assert.ok(createProjection >= 0 && executeScript > createProjection && configure > executeScript && prepare > configure,
    'skopeo:configure projection is sent exactly once after injection and before adaptive prepare');
  assert.equal((background.match(/action:\s*['"]skopeo:configure['"]/g) || []).length, 1,
    'background has one configure send seam');

  const configureHandler = runtime.indexOf("skopeo:configure");
  const prepareHandler = runtime.indexOf("skopeo:prepare");
  assert.ok(configureHandler >= 0 && prepareHandler > configureHandler,
    'runtime defines exact configure admission before prepare dispatch');
  for (const seam of [
    'FSBSkopeoAppContextResolver',
    'FSBSkopeoAdapterRegistry',
    'FSBSkopeoAdaptiveComposer',
    'FSBSkopeoRendererRegistry',
    'renderAdaptive',
    'pending',
    'pendingArgument',
    'beginSelectedAction',
    'submit-arguments',
    'profileVersion',
    'contextEpoch'
  ]) {
    assert.ok(runtime.includes(seam), 'adaptive runtime contains ' + seam);
  }
  assert.equal(/const\s+args\s*=\s*\{\s*\}/.test(runtime), false,
    'production runtime has no hard-coded empty argument dispatch');
}

function assertIsolatedDynamicProjectionCoherence(background) {
  const dynamicFiles = parseStringArray(background, 'SKOPEO_INJECTION_FILES');
  const listeners = [];
  const sandbox = {
    console,
    URL,
    AbortController,
    location: { href: 'https://airbnb.com/' },
    document: { createElement() { return {}; } },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
    performance: { now() { return 1; } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.chrome = {
    runtime: {
      id: 'isolated-skopeo-content-world',
      onMessage: {
        addListener(listener) { listeners.push(listener); },
        removeListener(listener) {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        }
      },
      sendMessage() { return Promise.resolve(true); }
    }
  };
  const context = vm.createContext(sandbox);
  for (const relativePath of dynamicFiles) {
    const absolutePath = path.join(ROOT, 'extension', relativePath);
    vm.runInContext(source(absolutePath), context, { filename: absolutePath });
  }

  assert.equal(typeof sandbox.FsbSkopeoCapabilityProjector.validateProjection, 'function',
    'the exact isolated-world injection list installs the real projector validator');
  assert.equal(typeof sandbox.FSBSkopeoAppContextResolver.createResolver, 'function',
    'the resolver loads after its projector dependency in the fresh content world');
  const projection = projector.createProjection({
    tabId: 77,
    generation: 17,
    url: 'https://airbnb.com/'
  }, profileIndex);
  assert.equal(projection.status, 'recognized', 'fresh-world oracle has a real generic projection');
  sandbox.__projectionJson = JSON.stringify(projection);
  vm.runInContext(`
    (function () {
      function freeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Reflect.ownKeys(value).forEach(function (key) { freeze(value[key]); });
        return Object.freeze(value);
      }
      var projection = freeze(JSON.parse(globalThis.__projectionJson));
      var resolver = FSBSkopeoAppContextResolver.createResolver({
        generation: 17,
        projection: projection,
        resolveAdapter: FSBSkopeoAdapterRegistry.resolve
      });
      globalThis.__isolatedProjectionValid = FsbSkopeoCapabilityProjector.validateProjection(projection);
      globalThis.__isolatedResolved = resolver.resolve({
        url: 'https://airbnb.com/',
        requestedLens: 'app-actions',
        adapterEvidence: []
      });
    })();
  `, context);
  assert.equal(sandbox.__isolatedProjectionValid, true,
    'the structured-cloned projection validates in the fresh content realm');
  const resolved = sandbox.__isolatedResolved;
  assert.equal(resolved.status, 'recognized',
    'the real projection remains coherent through the real isolated-world resolver');
  assert.equal(resolved.reason, 'no-stable-entity',
    'generic isolated-world resolution remains explicitly unanchored');
  assert.equal(sandbox.FSBSkopeoAppContextResolver.validateResult(resolved), true,
    'the recognized isolated-world result passes the public resolver contract');
  sandbox.__FSB_SKOPEO_RUNTIME__.disposeForReplacement();
}

function assertCatalogProjectionClosure() {
  assert.deepEqual(profileIndex.counts, {
    descriptors: 2319,
    stems: 129,
    services: 129,
    pairs: 131
  }, 'the deterministic generated catalog retains its full closure counts');
  assert.equal(profileIndex.admittedOriginIndex.length, 166,
    'all exact admitted page origins are represented');
  assert.equal(Object.hasOwn(profileIndex, 'exactOriginIndex'), false,
    'the v1 exact-origin index is not retained as parallel authority');

  const unambiguousOrigins = profileIndex.admittedOriginIndex.filter(function (row) {
    return row.profileKeys.length === 1;
  });
  assert.equal(unambiguousOrigins.length, 165, '165 admitted origins have one unambiguous app profile');
  for (let index = 0; index < unambiguousOrigins.length; index += 1) {
    const origin = unambiguousOrigins[index].admittedOrigin;
    const projection = projector.createProjection({
      tabId: index + 1,
      generation: 1,
      url: origin + '/skopeo-catalog-runtime-fixture'
    }, profileIndex);
    assert.equal(projection.status, 'recognized', origin + ' has a current-service projection');
    assert.equal(projector.validateProjection(projection), true, origin + ' projection validates');
    assert.ok(rowsOf(projection).every(function (row) {
      return row.slug.startsWith(projection.appStem + '.');
    }), origin + ' projection contains no foreign-service slug');
    assert.equal(Object.hasOwn(projection, 'capabilities'), false, origin + ' does not receive the full catalog');
  }
  const ambiguous = projector.createProjection({
    tabId: 129,
    generation: 1,
    url: 'https://atlassian.net/skopeo-catalog-runtime-fixture'
  }, profileIndex);
  assert.deepEqual(ambiguous, { status: 'unsupported', reason: 'profile-inconsistent' },
    'the one ambiguous exact origin fails closed without injecting either app profile');
}

function assertGenreFixtureEvidenceIsNotLiveApproval() {
  assert.deepEqual(genreMatrix.map(function (row) { return row.genre; }), GENRES,
    'the deterministic fixture covers every canonical genre once');
  for (const row of genreMatrix) {
    assert.equal(row.evidenceState, 'automated-fixture', row.genre + ' remains automated evidence');
    assert.equal(row.liveApproval, 'not-live-approved', row.genre + ' cannot set live_approved');
    assert.ok(['ambient', 'anchored'].includes(row.expected.firstAttention),
      row.genre + ' begins at Ambient or Anchored only');
    assert.equal(row.expected.off.ownedResourceTotal, 0, row.genre + ' Off state owns zero resources');
  }
}

function assertReadyReadAndConsequenceChokepoints(background) {
  for (const action of [
    'skopeo:read-invoke',
    'skopeo:consequence-open',
    'skopeo:consequence-confirm',
    'skopeo:consequence-cancel'
  ]) {
    assert.ok(background.includes(action), action + ' has one sender-authoritative worker handler');
  }
  assert.match(background, /sender\s*&&\s*sender\.tab\s*&&[\s\S]{0,120}sender\.tab\.id/,
    'tab authority comes from sender.tab.id');
  assert.match(background, /FsbCapabilityRouter\.invoke\s*\(/,
    'current t1-ready read delegates to FsbCapabilityRouter.invoke');
  assert.match(background, /FsbSkopeoActionAuthority[\s\S]{0,1200}validateCollectedArguments/,
    'background independently validates the exact collector contract');
  assert.match(background, /FsbCapabilityRouter\.validateResolvedArgs\s*\(/,
    'background repeats full installed schema validation before dispatch');
  assert.match(background, /FsbCapabilityCatalog\.resolve\s*\(/,
    'background re-resolves installed authority instead of trusting projected claims');
  assert.match(background, /presentationDisposition\s*!==\s*['"]t1-ready['"]/,
    'foreign slug and non-ready rows are rejected before the router');
  assert.match(background, /sideEffectClass\s*!==\s*['"]read['"]/,
    'write-classified rows cannot enter the ready-read path');
  assert.match(background, /createGateManager\s*\(/,
    'write/destructive confirmation delegates to the Plan 06 consequence manager');

  const forbidden = [
    /directHandler/i,
    /directRecipe/i,
    /pageExecutor/i,
    /fetch\s*\([^)]*skopeo:read-invoke/i
  ];
  for (const pattern of forbidden) {
    assert.equal(pattern.test(background), false, 'router bypass mutation is absent: ' + pattern);
  }

  const consequence = source(CONSEQUENCE_PATH);
  assert.equal((consequence.match(/router\.invoke\s*\(/g) || []).length, 1,
    'the consequence manager retains one confirmed router invocation');
  assert.equal((background.match(/FsbCapabilityRouter\.invoke\s*\(/g) || []).length, 1,
    'Skopeo Ready reads have exactly one production FsbCapabilityRouter.invoke chokepoint');
}

function assertAuthorityAndLateResultSourceContracts(background, runtime) {
  const joined = background + '\n' + runtime;
  for (const term of [
    'generation',
    'exactOrigin',
    'catalogVersion',
    'profileVersion',
    'contextEpoch',
    'semanticEntity',
    'actionToken',
    'worker-interrupted',
    'replacement',
    'pending',
    'late-result'
  ]) {
    assert.ok(joined.includes(term), 'full stale tuple/worker closure includes ' + term);
  }
  assert.match(runtime, /controller\.signal\.aborted|signal\.aborted/,
    'kill/replacement aborts pending adaptive work');
  assert.match(background, /controller\.signal\.aborted|signal\.aborted/,
    'worker dispatch repeats terminal state before installing a late result');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function installedEntryFor(harness, slug) {
  const handler = slackHandlers[slug] || notionHandlers[slug] || zillowHandlers[slug] || githubHandlers[slug];
  if (!handler) return null;
  const params = structuredClone(handler.params);
  const wrappedHandler = Object.assign({}, handler, {
    params,
    async handle(args, context) {
      harness.directHandlerCalls += 1;
      return handler.handle(args, context);
    }
  });
  const service = slug.startsWith('slack.')
    ? 'app.slack.com'
    : slug.startsWith('notion.') ? 'notion.so'
      : slug.startsWith('github.') ? 'github.com' : 'zillow.com';
  const entry = {
    tier: 'T1a',
    handler: wrappedHandler,
    origin: handler.origin,
    descriptor: {
      slug,
      service,
      sideEffectClass: handler.sideEffectClass,
      params: structuredClone(params)
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
    resolveOverride: null,
    routerResultFactory: null
  };
  harness.chrome = {
    runtime: {
      id: 'skopeo-runtime-test-extension',
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

function bootProductionActionController(background, harness) {
  const start = background.indexOf(CONTROLLER_START);
  const end = background.indexOf(CONTROLLER_END);
  assert.ok(start >= 0 && end > start, 'production Skopeo controller markers are ordered');
  let controllerSource = background.slice(start, end + CONTROLLER_END.length);
  const exportAnchor = '  global.FSBSkopeoController = controller;';
  assert.ok(controllerSource.includes(exportAnchor), 'production controller export anchor exists');
  controllerSource = controllerSource.replace(exportAnchor, [
    '  controller.__testSeedActionEntry = function (tabId, projection, contextEpoch) {',
    '    installController(tabId, projection.generation, projection);',
    '    const entry = controllers.get(tabId);',
    '    entry.authority = deepFreezeSkopeo({',
    '      contextEpoch: contextEpoch,',
    '      semanticEntity: null',
    '    });',
    '    entry.attention = "focused";',
    '    return entry;',
    '  };',
    '  controller.__testAbortActionEntry = function (tabId) {',
    '    const entry = controllers.get(tabId);',
    '    if (entry && !entry.controller.signal.aborted) entry.controller.abort("test-kill");',
    '  };',
    exportAnchor
  ].join('\n'));
  controllerSource = controllerSource.replace(
    '  controller.ready = rehydrateStoredSessions();',
    '  controller.ready = Promise.resolve({ success: true, restored: 0, normalized: 0 });'
  );

  const lifecycle = require('../extension/utils/skopeo-session-state.js');
  const router = {
    getResolvedParamsSchema: realRouter.getResolvedParamsSchema,
    validateResolvedArgs: realRouter.validateResolvedArgs,
    async invoke(slug, args, context) {
      harness.routerCalls.push({
        slug,
        args: structuredClone(args),
        context: structuredClone(context)
      });
      if (typeof harness.routerResultFactory === 'function') {
        return harness.routerResultFactory(slug, args, context);
      }
      return { success: true, message: 'One production fixture result is available.' };
    }
  };
  const sandbox = {
    chrome: harness.chrome,
    FSBSkopeoSessionState: lifecycle,
    FsbSkopeoProfileIndex: profileIndex,
    FsbSkopeoCapabilityProjector: projector,
    FsbSkopeoActionAuthority: actionAuthority,
    FsbSkopeoConsequenceTargets: require(CONSEQUENCE_TARGETS_PATH),
    FsbCapabilityCatalog: {
      resolve(slug) { return installedEntryFor(harness, slug); }
    },
    FsbCapabilityRouter: router,
    FsbSkopeoConsequenceGate: consequenceGate,
    CfworkerJsonSchema: globalThis.CfworkerJsonSchema,
    fetch() { harness.fetchCalls += 1; throw new Error('direct fetch bypass'); },
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
  vm.runInContext(controllerSource, vm.createContext(sandbox), {
    filename: 'background-skopeo-action-controller.js'
  });
  assert.ok(sandbox.FSBSkopeoController, 'production controller boots in the action harness');
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

function seedActionTab(controller, harness, tabId, generation, url, projectionOverride) {
  const projection = projectionOverride || projector.createProjection({ tabId, generation, url }, profileIndex);
  assert.equal(projection.status, 'recognized', url + ' action projection is recognized');
  assert.equal(projector.validateProjection(projection), true, url + ' action projection validates');
  harness.records.set('skopeoSession:' + tabId, activeRecord(tabId, generation));
  controller.__testSeedActionEntry(tabId, projection, 1);
  return projection;
}

function projectedRow(projection, slug) {
  return rowsOf(projection).find(function(row) { return row.slug === slug; });
}

function readMessage(projection, slug, args, actionToken, overrides = {}) {
  const row = projectedRow(projection, slug);
  return Object.assign({
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
    schemaDigest: row ? row.argumentContract.schemaDigest : 'sha256:' + '0'.repeat(64)
  }, overrides);
}

function consequenceMessage(projection, slug, args, action, actionToken) {
  const message = {
    action,
    generation: projection.generation,
    exactOrigin: projection.exactOrigin,
    profileVersion: projection.profileVersion,
    contextEpoch: 1,
    semanticEntity: null,
    slug,
    args
  };
  if (actionToken !== undefined) message.actionToken = actionToken;
  return message;
}

const PRODUCTION_WRITE_CASES = Object.freeze([
  ['slack.chat.postMessage', 'https://app.slack.com/client/T123/C456', {
    channel: 'C456', text: 'Review renewal today'
  }],
  ['notion.create_page', 'https://app.notion.com/workspace', {
    title: 'Renewal brief', parent_page_id: 'parent-123', icon: 'contract-icon', content: 'Review renewal terms'
  }],
  ['notion.update_page', 'https://app.notion.com/workspace', {
    page_id: 'page-123', title: 'Updated renewal brief', icon: 'updated-icon', cover: 'updated-cover'
  }],
  ['notion.create_database', 'https://app.notion.com/workspace', {
    parent_page_id: 'parent-123', title: 'Renewal tracker'
  }],
  ['notion.create_database_item', 'https://app.notion.com/workspace', {
    database_id: 'database-123', title: 'Priceline renewal'
  }]
]);

async function assertProductionConsequenceDispatch(controller, harness, senderFor) {
  let attempted = 0;
  let opened = 0;
  let confirmedExactlyOnce = 0;
  for (let index = 0; index < PRODUCTION_WRITE_CASES.length; index += 1) {
    const [slug, url, args] = PRODUCTION_WRITE_CASES[index];
    const tabId = 90 + index;
    const projection = seedActionTab(controller, harness, tabId, 30 + index, url);
    const row = projectedRow(projection, slug);
    attempted += 1;
    assert.ok(row, slug + ' real write is projected');
    assert.equal(row.presentationDisposition, 't1-ready', slug + ' real write is visually Ready');
    assert.equal(row.consequenceCompatible, true, slug + ' exact consequence contract is compatible');
    assert.match(row.consequenceDigest, /^sha256:[0-9a-f]{64}$/,
      slug + ' exact consequenceDigest is projected');

    const beforeCancel = harness.routerCalls.length;
    const firstOpen = await controller.handleContentMessage(
      consequenceMessage(projection, slug, args, 'skopeo:consequence-open'),
      senderFor(tabId)
    );
    assert.equal(firstOpen.status, 'open', slug +
      ' production consequence-open reaches alertdialog data: ' + JSON.stringify(firstOpen));
    opened += 1;
    assert.equal(harness.routerCalls.length, beforeCancel, slug + ' open makes zero calls');
    assert.ok(firstOpen.confirmation && firstOpen.confirmation.target && firstOpen.confirmation.effect,
      slug + ' alertdialog has exact target/effect/material confirmation');
    for (const [field, value] of Object.entries(args)) {
      const reviewText = firstOpen.confirmation.target + ' ' + firstOpen.confirmation.parameterSummary;
      assert.equal(reviewText.includes(String(value)), true,
        slug + ' every supplied mutation field is represented before confirm: ' + field);
    }
    const cancelled = await controller.handleContentMessage(
      consequenceMessage(projection, slug, args, 'skopeo:consequence-cancel', firstOpen.actionToken),
      senderFor(tabId)
    );
    assert.equal(cancelled.status, 'cancelled', slug + ' consequence-cancel closes alertdialog');
    assert.equal(harness.routerCalls.length, beforeCancel, slug + ' cancel makes zero calls');

    const secondOpen = await controller.handleContentMessage(
      consequenceMessage(projection, slug, args, 'skopeo:consequence-open'),
      senderFor(tabId)
    );
    assert.equal(secondOpen.status, 'open', slug +
      ' can reopen after cancel: ' + JSON.stringify(secondOpen));
    const confirmed = await controller.handleContentMessage(
      consequenceMessage(projection, slug, args, 'skopeo:consequence-confirm', secondOpen.actionToken),
      senderFor(tabId)
    );
    assert.equal(confirmed.success, true, slug + ' explicit confirm returns the stub router result');
    assert.equal(harness.routerCalls.length, beforeCancel + 1, slug + ' confirm invokes exactly once');
    confirmedExactlyOnce += 1;
    assert.deepEqual(harness.routerCalls.at(-1), {
      slug,
      args,
      context: {
        origin: slug.startsWith('slack.') ? 'https://app.slack.com' : 'https://app.notion.com',
        tabId,
        source: 'skopeo'
      }
    }, slug + ' production confirm uses exact args and installed execution origin');
    const replay = await controller.handleContentMessage(
      consequenceMessage(projection, slug, args, 'skopeo:consequence-confirm', secondOpen.actionToken),
      senderFor(tabId)
    );
    assert.equal(replay.status, 'stale', slug + ' repeated confirm is stale');
    assert.equal(harness.routerCalls.length, beforeCancel + 1, slug + ' replay adds zero calls');
  }
  assert.deepEqual({ attempted, opened, confirmedExactlyOnce, compatibilityFailures: attempted - opened }, {
    attempted: 5,
    opened: 5,
    confirmedExactlyOnce: 5,
    compatibilityFailures: 0
  }, 'production five-write matrix opens 5, confirms exactly once 5, and has zero compatibility failures');
}

async function assertProductionArgumentDispatch(background) {
  const harness = createActionHarness();
  const controller = bootProductionActionController(background, harness);
  await controller.ready;
  const senderFor = tabId => ({ id: harness.chrome.runtime.id, tab: { id: tabId } });

  const slackProjection = seedActionTab(
    controller, harness, 41, 3, 'https://app.slack.com/client/T123/C456'
  );
  const requiredRead = projectedRow(slackProjection, 'slack.list_members');
  assert.ok(requiredRead, 'one real required-argument read is projected');
  assert.equal(requiredRead.argumentContract.mode, 'form');
  const parsed = actionAuthority.parseCollectedArguments(requiredRead.argumentContract, {
    channel: 'C123', limit: '7'
  });
  assert.deepEqual(parsed, { ok: true, args: { channel: 'C123', limit: 7 } },
    'production collector parses entered values into typed args');

  const valid = await controller.handleContentMessage(
    readMessage(slackProjection, requiredRead.slug, parsed.args, 'required_read_exactly_once'),
    senderFor(41)
  );
  assert.equal(valid.success, true,
    'real required-argument read reaches the production action response: ' + JSON.stringify(valid));
  assert.equal(harness.routerCalls.length, 1, 'required read calls FsbCapabilityRouter.invoke exactly once');
  assert.deepEqual(harness.routerCalls[0], {
    slug: 'slack.list_members',
    args: { channel: 'C123', limit: 7 },
    context: { origin: 'https://app.slack.com', tabId: 41, source: 'skopeo' }
  }, 'router receives typed args and the installed execution origin');

  const githubProjection = seedActionTab(
    controller, harness, 45, 7, 'https://github.com/issues'
  );
  const githubRead = projectedRow(githubProjection, 'github.issues.list');
  assert.ok(githubRead, 'non-generic GitHub worklist read is projected');
  assert.equal(githubProjection.profile.rendererId, 'worklist-record-v1',
    'production result contract uses the authoritative selected genre renderer');
  harness.routerResultFactory = function() {
    return {
      success: true,
      data: {
        issues: [
          { title: 'Fix projection parity', state: 'open', number: 531, author: 'Lakshman' },
          { title: 'Verify safe HUD atoms', state: 'closed', number: 532 }
        ],
        total: 2
      }
    };
  };
  const structured = await controller.handleContentMessage(
    readMessage(githubProjection, githubRead.slug, {}, 'github_structured_result'),
    senderFor(45)
  );
  assert.equal(structured.success, true, 'production structured read succeeds');
  assert.deepEqual(Array.from(structured.result.sections, section => section.kind), ['items', 'notice'],
    'bounded structured data reaches the typed result before its completion notice');
  const renderedAtoms = rendererRegistry.render(
    githubProjection.profile.rendererId,
    structuredClone(structured.result),
    { width: 1024 }
  );
  const renderedItems = renderedAtoms.find(atom => atom.type === 'item-list');
  assert.ok(renderedItems, 'selected worklist renderer emits the corresponding safe item-list atom');
  assert.equal(JSON.stringify(renderedItems).includes('Fix projection parity'), true,
    'safe production router data survives adaptation into the selected genre renderer');
  assert.equal(rendererRegistry.validateAtoms(renderedAtoms), true,
    'adapted production router data emits only renderer-validated closed atoms');

  const unsafeResults = [
    ['secret-bearing', {
      issues: [{ title: 'Must not cross', api_token: 'NEVER-CROSS-THE-HUD' }]
    }, 'NEVER-CROSS-THE-HUD'],
    ['session key', {
      issues: [{ title: 'Must not cross', session: 'OPAQUE-SESSION-SENTINEL' }]
    }, 'OPAQUE-SESSION-SENTINEL'],
    ['underscored session key', {
      issues: [{ title: 'Must not cross', session_key: 'OPAQUE-SESSION-KEY-SENTINEL' }]
    }, 'OPAQUE-SESSION-KEY-SENTINEL'],
    ['bare auth key', {
      issues: [{ title: 'Must not cross', auth: 'OPAQUE-AUTH-SENTINEL' }]
    }, 'OPAQUE-AUTH-SENTINEL'],
    ['auth token key', {
      issues: [{ title: 'Must not cross', auth_token: 'OPAQUE-AUTH-TOKEN-SENTINEL' }]
    }, 'OPAQUE-AUTH-TOKEN-SENTINEL'],
    ['authentication key', {
      issues: [{ title: 'Must not cross', authentication_key: 'OPAQUE-AUTHENTICATION-SENTINEL' }]
    }, 'OPAQUE-AUTHENTICATION-SENTINEL'],
    ['oauth key', {
      issues: [{ title: 'Must not cross', oauth_token: 'OPAQUE-OAUTH-SENTINEL' }]
    }, 'OPAQUE-OAUTH-SENTINEL'],
    ['secret-shaped value under a display key', {
      issues: [{ title: 'session_key=DISPLAY-VALUE-SENTINEL', state: 'open' }]
    }, 'DISPLAY-VALUE-SENTINEL'],
    ['oversized', {
      issues: [{ title: 'x'.repeat(513), state: 'open' }]
    }, null],
    ['unknown-shape', {
      issues: [{ title: 'One collection', state: 'open' }],
      labels: [{ name: 'Second collection' }]
    }, null]
  ];
  for (let index = 0; index < unsafeResults.length; index += 1) {
    const [label, data, sentinel] = unsafeResults[index];
    harness.routerResultFactory = function() { return { success: true, data }; };
    const response = await controller.handleContentMessage(
      readMessage(githubProjection, githubRead.slug, {}, 'github_rejected_result_' + String(index)),
      senderFor(45)
    );
    assert.equal(response.success, true, label + ' router completion retains the safe generic fallback');
    assert.deepEqual(Array.from(response.result.sections, section => section.kind), ['notice'],
      label + ' structured result is rejected before renderer delivery');
    if (sentinel) {
      assert.equal(JSON.stringify(response).includes(sentinel), false,
        label + ' data does not cross the background result boundary');
    }
  }

  const obfuscatedDataCases = [
    ['control-obfuscated structured value',
      'password\u0000=CONTROL-DATA-SENTINEL', 'password =CONTROL-DATA-SENTINEL',
      'CONTROL-DATA-SENTINEL'],
    ['bidi-obfuscated structured value',
      'authorization\u202e: BIDI-DATA-SENTINEL', 'authorization : BIDI-DATA-SENTINEL',
      'BIDI-DATA-SENTINEL'],
    ['zero-width-obfuscated structured value',
      'session_key\u200b=ZERO-WIDTH-DATA-SENTINEL', 'session_key =ZERO-WIDTH-DATA-SENTINEL',
      'ZERO-WIDTH-DATA-SENTINEL']
  ];
  for (let index = 0; index < obfuscatedDataCases.length; index += 1) {
    const [label, obfuscated, normalized, sentinel] = obfuscatedDataCases[index];
    harness.routerResultFactory = function() {
      return { success: true, data: { issues: [{ title: obfuscated, state: 'open' }] } };
    };
    const response = await controller.handleContentMessage(
      readMessage(githubProjection, githubRead.slug, {}, 'github_obfuscated_data_' + String(index)),
      senderFor(45)
    );
    const serialized = JSON.stringify(response);
    assert.equal(response.success, true, label + ' retains the safe read response envelope');
    assert.deepEqual(Array.from(response.result.sections, section => section.kind), ['notice'],
      label + ' is rejected before renderer delivery');
    assert.equal(serialized.includes(JSON.stringify(obfuscated).slice(1, -1)), false,
      label + ' marker bytes do not cross the background result boundary');
    assert.equal(serialized.includes(normalized), false,
      label + ' normalized prohibited form does not cross the background result boundary');
    assert.equal(serialized.includes(sentinel), false,
      label + ' sentinel bytes do not cross the background result boundary');
  }

  const secretTextCases = [
    ['success password message', {
      success: true,
      message: 'password=SUCCESS-MESSAGE-SENTINEL'
    }, 'SUCCESS-MESSAGE-SENTINEL', 'success'],
    ['success session message', {
      success: true,
      message: 'session_key=SESSION-MESSAGE-SENTINEL'
    }, 'SESSION-MESSAGE-SENTINEL', 'success'],
    ['success auth message', {
      success: true,
      message: 'authorization: AUTH-MESSAGE-SENTINEL'
    }, 'AUTH-MESSAGE-SENTINEL', 'success'],
    ['error code', {
      success: false,
      code: 'password=ERROR-CODE-SENTINEL'
    }, 'ERROR-CODE-SENTINEL', 'error'],
    ['error message metadata', {
      success: false,
      code: 'REMOTE_FAILURE',
      message: 'auth_token=ERROR-MESSAGE-SENTINEL'
    }, 'ERROR-MESSAGE-SENTINEL', 'error']
  ];
  for (let index = 0; index < secretTextCases.length; index += 1) {
    const [label, routerResult, sentinel, expectedStatus] = secretTextCases[index];
    harness.routerResultFactory = function() { return routerResult; };
    const response = await controller.handleContentMessage(
      readMessage(githubProjection, githubRead.slug, {}, 'github_secret_text_' + String(index)),
      senderFor(45)
    );
    assert.equal(response.success, true, label + ' retains the closed read response envelope');
    assert.equal(response.result.status, expectedStatus, label + ' retains only the typed status');
    assert.equal(JSON.stringify(response).includes(sentinel), false,
      label + ' sentinel bytes never cross the background boundary');
    if (expectedStatus === 'success') {
      assert.deepEqual(Array.from(response.result.sections, section => section.kind), ['notice'],
        label + ' is replaced by only the fixed generic notice');
      assert.equal(response.result.sections[0].message,
        'The selected read completed through the capability router.',
        label + ' uses exact non-secret completion copy');
    } else if (label === 'error code') {
      assert.equal(response.result.errorCode, 'SKOPEO_ROUTER_ERROR',
        label + ' is replaced by the fixed router error code');
    }
  }

  const obfuscatedMessageCases = [
    ['control-obfuscated success message', {
      success: true,
      message: 'password\u0000=CONTROL-MESSAGE-SENTINEL'
    }, ['password =CONTROL-MESSAGE-SENTINEL'], ['CONTROL-MESSAGE-SENTINEL'], 'success'],
    ['bidi-obfuscated success message', {
      success: true,
      message: 'authorization\u202e: BIDI-MESSAGE-SENTINEL'
    }, ['authorization : BIDI-MESSAGE-SENTINEL'], ['BIDI-MESSAGE-SENTINEL'], 'success'],
    ['zero-width-obfuscated success message', {
      success: true,
      message: 'session_key\u200b=ZERO-WIDTH-MESSAGE-SENTINEL'
    }, ['session_key =ZERO-WIDTH-MESSAGE-SENTINEL'], ['ZERO-WIDTH-MESSAGE-SENTINEL'], 'success'],
    ['control-obfuscated router error', {
      success: false,
      code: 'password\u0000=CONTROL-ERROR-SENTINEL',
      message: 'authorization\u202e: BIDI-ERROR-MESSAGE-SENTINEL'
    }, [
      'password =CONTROL-ERROR-SENTINEL',
      'authorization : BIDI-ERROR-MESSAGE-SENTINEL'
    ], ['CONTROL-ERROR-SENTINEL', 'BIDI-ERROR-MESSAGE-SENTINEL'], 'error']
  ];
  for (let index = 0; index < obfuscatedMessageCases.length; index += 1) {
    const [label, routerResult, normalizedForms, sentinels, expectedStatus] =
      obfuscatedMessageCases[index];
    harness.routerResultFactory = function() { return routerResult; };
    const response = await controller.handleContentMessage(
      readMessage(githubProjection, githubRead.slug, {}, 'github_obfuscated_message_' + String(index)),
      senderFor(45)
    );
    const serialized = JSON.stringify(response);
    assert.equal(response.success, true, label + ' retains the closed read response envelope');
    assert.equal(response.result.status, expectedStatus, label + ' retains only the typed status');
    for (const value of Object.values(routerResult)) {
      if (typeof value !== 'string') continue;
      assert.equal(serialized.includes(JSON.stringify(value).slice(1, -1)), false,
        label + ' marker bytes do not cross the background boundary');
    }
    for (const sentinel of sentinels) {
      assert.equal(serialized.includes(sentinel), false,
        label + ' sentinel bytes do not cross the background boundary');
    }
    for (const normalized of normalizedForms) {
      assert.equal(serialized.includes(normalized), false,
        label + ' normalized prohibited form does not cross the background boundary');
    }
    if (expectedStatus === 'success') {
      assert.equal(response.result.sections[0].message,
        'The selected read completed through the capability router.',
        label + ' uses exact non-secret completion copy');
    } else {
      assert.equal(response.result.errorCode, 'SKOPEO_ROUTER_ERROR',
        label + ' uses the fixed router error code');
    }
  }
  harness.routerResultFactory = function() {
    return { success: true, message: 'Review https://private.example.invalid/result/REMOTE-PATH' };
  };
  const remoteMessage = await controller.handleContentMessage(
    readMessage(githubProjection, githubRead.slug, {}, 'github_remote_message'),
    senderFor(45)
  );
  assert.equal(remoteMessage.result.sections[0].message, 'Review [external value omitted]',
    'success text uses the same canonical remote-address sanitizer as structured values');
  assert.equal(JSON.stringify(remoteMessage).includes('private.example.invalid'), false,
    'remote address bytes do not cross into content');
  harness.routerResultFactory = null;

  const callsAfterValid = harness.routerCalls.length;
  const zeroCallCases = [
    ['missing required', readMessage(slackProjection, requiredRead.slug, {}, 'missing_required')],
    ['unknown key', readMessage(slackProjection, requiredRead.slug,
      { channel: 'C123', forged: true }, 'unknown_key')],
    ['secret-shaped extra', readMessage(slackProjection, requiredRead.slug,
      { channel: 'C123', api_token: 'NEVER-DISPATCH' }, 'secret_extra')],
    ['foreign slug', readMessage(slackProjection, 'zillow.search_for_sale', {}, 'foreign_slug')],
    ['forged origin', readMessage(slackProjection, requiredRead.slug, { channel: 'C123' },
      'forged_origin', { exactOrigin: 'https://www.zillow.com' })],
    ['forged profile', readMessage(slackProjection, requiredRead.slug, { channel: 'C123' },
      'forged_profile', { profileId: 'forged-profile' })],
    ['forged tuple', readMessage(slackProjection, requiredRead.slug, { channel: 'C123' },
      'forged_tuple', { contextEpoch: 2 })]
  ];
  for (const [label, message] of zeroCallCases) {
    const response = await controller.handleContentMessage(message, senderFor(41));
    assert.equal(response.success, false, label + ' fails closed');
    assert.equal(harness.routerCalls.length, callsAfterValid, label + ' makes zero router calls');
  }

  const replay = await controller.handleContentMessage(
    readMessage(slackProjection, requiredRead.slug, parsed.args, 'required_read_exactly_once'),
    senderFor(41)
  );
  assert.equal(replay.success, false, 'double submit/action-token replay is stale');
  assert.equal(harness.routerCalls.length, callsAfterValid, 'double submit makes zero additional calls');

  const staleProjection = structuredClone(slackProjection);
  staleProjection.tabId = 42;
  staleProjection.generation = 4;
  const staleRow = projectedRow(staleProjection, requiredRead.slug);
  staleRow.argumentContract.schemaDigest = 'sha256:' + '0'.repeat(64);
  deepFreeze(staleProjection);
  harness.records.set('skopeoSession:42', activeRecord(42, 4));
  controller.__testSeedActionEntry(42, staleProjection, 1);
  const staleResponse = await controller.handleContentMessage(
    readMessage(staleProjection, requiredRead.slug, { channel: 'C123' }, 'stale_form'),
    senderFor(42)
  );
  assert.equal(staleResponse.success, false, 'stale form/schemaDigest replay fails closed');
  assert.equal(harness.routerCalls.length, callsAfterValid, 'stale form makes zero calls');

  harness.resolveOverride = function(entry, slug) {
    if (slug !== 'slack.list_members') return entry;
    const schema = structuredClone(entry.handler.params);
    schema.properties.cursor.description = 'hidden authority changed after collection';
    const handler = Object.assign({}, entry.handler, { params: schema });
    return Object.assign({}, entry, {
      handler,
      descriptor: Object.assign({}, entry.descriptor, { params: schema })
    });
  };
  const schemaChanged = await controller.handleContentMessage(
    readMessage(slackProjection, requiredRead.slug, { channel: 'C123' }, 'schema_changed'),
    senderFor(41)
  );
  assert.equal(schemaChanged.success, false, 'installed schema mutation invalidates the old form');
  assert.equal(harness.routerCalls.length, callsAfterValid, 'installed schema mutation makes zero calls');
  harness.resolveOverride = null;

  const zillowProjection = seedActionTab(
    controller, harness, 43, 5, 'https://www.zillow.com/homes/'
  );
  const zillow = projectedRow(zillowProjection, 'zillow.search_for_sale');
  assert.equal(zillow.paramSummary.count, 13, 'Zillow complete authority has 13 properties');
  assert.equal(zillow.paramSummary.required.length + zillow.paramSummary.optional.length, 12,
    'Zillow projected display shows at most 12 property names');
  assert.equal(zillow.argumentContract.schemaDigest, zillow.schemaDigest,
    'Zillow empty contract binds the complete schemaDigest');
  assert.equal(zillow.argumentContract.mode, 'empty');
  const zillowResponse = await controller.handleContentMessage(
    readMessage(zillowProjection, zillow.slug, {}, 'zillow_empty_exactly_once'),
    senderFor(43)
  );
  assert.equal(zillowResponse.success, true, 'Zillow {} passes production background preconditions');
  assert.equal(harness.routerCalls.length, callsAfterValid + 1,
    'zillow.search_for_sale calls FsbCapabilityRouter.invoke exactly once');
  assert.deepEqual(harness.routerCalls.at(-1), {
    slug: 'zillow.search_for_sale',
    args: {},
    context: { origin: 'https://www.zillow.com', tabId: 43, source: 'skopeo' }
  });

  const killedProjection = seedActionTab(
    controller, harness, 44, 6, 'https://app.slack.com/client/T123/C456'
  );
  controller.__testAbortActionEntry(44);
  const beforeKilled = harness.routerCalls.length;
  const killed = await controller.handleContentMessage(
    readMessage(killedProjection, requiredRead.slug, { channel: 'C123' }, 'killed_during_send'),
    senderFor(44)
  );
  assert.equal(killed.success, false, 'killed-during-send authority is stale');
  assert.equal(harness.routerCalls.length, beforeKilled, 'killed-during-send makes zero calls');
  await assertProductionConsequenceDispatch(controller, harness, senderFor);
  assert.equal(harness.directHandlerCalls, 0, 'production action flow never calls an installed handler directly');
  assert.equal(harness.fetchCalls, 0, 'production action flow never uses a direct fetch bypass');
}

async function main() {
  const background = source(BACKGROUND_PATH);
  const runtime = source(RUNTIME_PATH);
  const manifest = JSON.parse(source(MANIFEST_PATH));

  assert.equal(fs.existsSync(CONSEQUENCE_TARGETS_PATH), true,
    'trusted per-slug consequence target/effect/material registry is bundled');

  assertStaticAndOrderedContracts(background, runtime, manifest);
  assertIsolatedDynamicProjectionCoherence(background);
  assertCatalogProjectionClosure();
  assertGenreFixtureEvidenceIsNotLiveApproval();
  assertReadyReadAndConsequenceChokepoints(background);
  assertAuthorityAndLateResultSourceContracts(background, runtime);
  await assertProductionArgumentDispatch(background);
  assert.equal(source(PROFILE_SCHEMA_PATH).includes('FsbSkopeoProfileSchema'), true,
    'profile schema is the shared closed vocabulary');
  console.log('skopeo-catalog-runtime: PASS (2319 descriptors, 129 stems, 129 services, 131 pairs, 9 genres)');
}

main().catch(function(error) {
  console.error('skopeo-catalog-runtime: FAIL');
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
