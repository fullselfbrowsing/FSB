'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  MockDocument,
  MockWindow,
  createHarness,
  snapshotHostState
} = require('./skopeo-shell-contract.test.js');

const ROOT = path.resolve(__dirname, '..');
const BACKGROUND_PATH = path.join(ROOT, 'extension', 'background.js');
const CONFIG_PATH = path.join(ROOT, 'extension', 'config', 'config.js');
const ENGINE_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-truth-engine.js');
const SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-truth-schema.js');
const HUD_SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-hud-schema.js');
const HUD_PROJECTOR_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-hud-projector.js');
const ALERT_SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-alert-schema.js');
const ASK_SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-ask-schema.js');
const RUNTIME_PATH = path.join(ROOT, 'extension', 'content', 'skopeo-runtime.js');
const COMPOSER_PATH = path.join(ROOT, 'extension', 'content', 'skopeo-adaptive-composer.js');
const SHELL_PATH = path.join(ROOT, 'extension', 'content', 'skopeo-shell.js');
const MANIFEST_PATH = path.join(ROOT, 'extension', 'manifest.json');
const MARKER = 'skopeo hud truth runtime contract';
const CONTROLLER_MARKER = 'skopeo hud controller contract';
const CONTENT_ROUTING_MARKER = 'skopeo hud content routing contract';
const ASK_CONTROLLER_MARKER = 'skopeo ask controller contract';
const ASK_CONTENT_MARKER = 'skopeo ask content contract';
const CONTEXT_START = '/* FSB_SKOPEO_TRUTH_CONTEXT_BUILDER_START */';
const CONTEXT_END = '/* FSB_SKOPEO_TRUTH_CONTEXT_BUILDER_END */';
const HELPER_START = '/* FSB_SKOPEO_HUD_TRUTH_HELPER_START */';
const HELPER_END = '/* FSB_SKOPEO_HUD_TRUTH_HELPER_END */';
const HUD_CONTROLLER_START = '/* FSB_SKOPEO_HUD_CONTROLLER_START */';
const HUD_CONTROLLER_END = '/* FSB_SKOPEO_HUD_CONTROLLER_END */';
const HUD_ABSENCE_JOIN_START = '/* FSB_SKOPEO_HUD_ABSENCE_JOIN_START */';
const HUD_ABSENCE_JOIN_END = '/* FSB_SKOPEO_HUD_ABSENCE_JOIN_END */';
const POLICY_DOCUMENT_START = '/* FSB_SKOPEO_POLICY_DOCUMENT_RESOLVER_START */';
const POLICY_DOCUMENT_END = '/* FSB_SKOPEO_POLICY_DOCUMENT_RESOLVER_END */';
const POLICY_MEMO_START = '/* FSB_SKOPEO_POLICY_MEMO_JOIN_START */';
const POLICY_MEMO_END = '/* FSB_SKOPEO_POLICY_MEMO_JOIN_END */';

function markedSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.notStrictEqual(start, -1, `${startMarker} exists`);
  assert.notStrictEqual(end, -1, `${endMarker} exists`);
  assert.ok(end > start, `${startMarker} precedes ${endMarker}`);
  return source.slice(start, end + endMarker.length);
}

function blocker(result, code) {
  assert.ok(result && result.status === 'review-required', `${code} is closed`);
  assert.deepStrictEqual(result.blockerCodes, [code]);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'families'), false,
    `${code} exposes no truth family prefix`);
}

function loadSources() {
  for (const filePath of [
    BACKGROUND_PATH, CONFIG_PATH, ENGINE_PATH, SCHEMA_PATH,
    HUD_SCHEMA_PATH, HUD_PROJECTOR_PATH, RUNTIME_PATH, COMPOSER_PATH, SHELL_PATH, MANIFEST_PATH
  ]) {
    assert.ok(fs.existsSync(filePath), `${path.basename(filePath)} exists`);
  }
  const sources = {
    background: fs.readFileSync(BACKGROUND_PATH, 'utf8'),
    config: fs.readFileSync(CONFIG_PATH, 'utf8'),
    engine: fs.readFileSync(ENGINE_PATH, 'utf8'),
    hudSchema: fs.readFileSync(HUD_SCHEMA_PATH, 'utf8'),
    hudProjector: fs.readFileSync(HUD_PROJECTOR_PATH, 'utf8'),
    runtime: fs.readFileSync(RUNTIME_PATH, 'utf8'),
    composer: fs.readFileSync(COMPOSER_PATH, 'utf8'),
    shell: fs.readFileSync(SHELL_PATH, 'utf8'),
    manifest: fs.readFileSync(MANIFEST_PATH, 'utf8')
  };
  new vm.Script(sources.background, { filename: BACKGROUND_PATH });
  new vm.Script(sources.config, { filename: CONFIG_PATH });
  new vm.Script(sources.engine, { filename: ENGINE_PATH });
  new vm.Script(sources.hudSchema, { filename: HUD_SCHEMA_PATH });
  new vm.Script(sources.hudProjector, { filename: HUD_PROJECTOR_PATH });
  new vm.Script(sources.runtime, { filename: RUNTIME_PATH });
  new vm.Script(sources.composer, { filename: COMPOSER_PATH });
  new vm.Script(sources.shell, { filename: SHELL_PATH });
  assert.match(sources.background, /\/\* FSB_SKOPEO_CONTROLLER_START \*\//,
    'trusted controller extraction marker remains intact');
  assert.match(sources.background, /global\.FSBSkopeoController = controller/,
    'trusted controller export anchor remains intact');
  assert.match(sources.engine, /FsbSkopeoTruthEngine/,
    'truth engine baseline module remains parseable');
  return sources;
}

function shellRendererSeamState(sources) {
  return Object.freeze({
    renderer: /\brenderContractView\s*\(/.test(sources.shell),
    closedCopy: sources.shell.includes(
      'Skopeo can’t verify this contract view. Reopen the folder or document and invoke Skopeo again.'
    ),
    modelVersion: sources.shell.includes('skopeo-contract-view/1'),
    forcedColors: /forced-colors\s*:\s*active/.test(sources.shell),
    reducedMotion: /prefers-reduced-motion\s*:\s*reduce/.test(sources.shell)
  });
}

function contentRoutingSeamState(sources) {
  return Object.freeze({
    projectionRequest: sources.runtime.includes("'skopeo:hud-projection'"),
    contractComposer: /composeContractView\s*\(/.test(sources.runtime),
    contractRenderer: /renderContractView\s*\(/.test(sources.runtime),
    citationDispatch: sources.runtime.includes("'skopeo:hud-citation-open'"),
    actionEpoch: /contractActionEpoch/.test(sources.runtime)
  });
}

function askContentSeamState(sources) {
  const runtime = sources.runtime.includes('/* FSB_SKOPEO_CONTRACT_RUNTIME_START */') &&
    sources.runtime.includes('/* FSB_SKOPEO_CONTRACT_RUNTIME_END */')
    ? markedSource(
      sources.runtime,
      '/* FSB_SKOPEO_CONTRACT_RUNTIME_START */',
      '/* FSB_SKOPEO_CONTRACT_RUNTIME_END */'
    )
    : '';
  return Object.freeze({
    composer: /composeContractAsk\s*\(/.test(runtime) && /validateContractAskModel/.test(runtime),
    state: /contractAskState/.test(runtime) && /contractAskEpoch/.test(runtime),
    ask: runtime.includes("'skopeo:hud-ask'"),
    cancel: runtime.includes("'skopeo:hud-ask-cancel'"),
    action: runtime.includes("'skopeo:hud-answer-action'"),
    confirm: runtime.includes("'skopeo:hud-answer-action-confirm'")
  });
}

function alertBackgroundSeamState(sources) {
  return Object.freeze({
    runtimeFacade: /fsbSkopeoAlertRuntimeFacade/.test(sources.background),
    currentCandidateJoin: /deriveCurrentHudAlertCandidates\s*\(/.test(sources.background),
    alarmRoute: /handleAlarm\s*\(alarm\)/.test(sources.background) &&
      /FsbSkopeoAlertRuntime\.ALARM_PREFIX/.test(sources.background),
    lifecycleReconcile: /fsbReconcileSkopeoAlerts\s*\(/.test(sources.background),
    notificationClicks: /notifications\.onClicked\.addListener/.test(sources.background) &&
      /notifications\.onButtonClicked\.addListener/.test(sources.background),
    freshEvidence: /fsbOpenCurrentSkopeoAlertEvidence\s*\(/.test(sources.background),
    mappingEffects: /commitCurrentHudAlertAction\s*\(/.test(sources.background) &&
      sources.background.includes("'skopeo:hud-alert-action'") &&
      sources.background.includes("'skopeo:hud-alert-action-confirm'")
  });
}

function seamState(sources) {
  return Object.freeze({
    displayInspection: /inspectDisplaySnapshot\s*:/.test(sources.engine),
    contextBuilder: sources.background.includes(CONTEXT_START) && sources.background.includes(CONTEXT_END),
    orchestrationHelper: sources.background.includes(HELPER_START) && sources.background.includes(HELPER_END),
    configDefaults: sources.config.includes('skopeoTruthTimezoneBinding') &&
      sources.config.includes('skopeoTruthCalendars')
  });
}

function hudControllerSeamState(sources) {
  return Object.freeze({
    controllerFactory: sources.background.includes(HUD_CONTROLLER_START) &&
      sources.background.includes(HUD_CONTROLLER_END) &&
      /function createFsbSkopeoHudProjectionController\s*\(/.test(sources.background),
    projectionAction: sources.background.includes("'skopeo:hud-projection'"),
    citationAction: sources.background.includes("'skopeo:hud-citation-open'")
  });
}

function askControllerSeamState(sources) {
  const controller = sources.background.includes(HUD_CONTROLLER_START) &&
    sources.background.includes(HUD_CONTROLLER_END)
    ? markedSource(sources.background, HUD_CONTROLLER_START, HUD_CONTROLLER_END)
    : '';
  return Object.freeze({
    modules: sources.background.includes("importScripts('utils/skopeo-ask-schema.js')") &&
      sources.background.includes("importScripts('utils/skopeo-ask-engine.js')") &&
      sources.background.includes("importScripts('utils/skopeo-decision-policy-store.js')") &&
      sources.background.includes("importScripts('utils/skopeo-decision-policy.js')"),
    ask: controller.includes("'skopeo:hud-ask'") && /async function ask\s*\(/.test(controller),
    cancel: controller.includes("'skopeo:hud-ask-cancel'") &&
      /function cancelAsk\s*\(/.test(controller),
    answerAction: controller.includes("'skopeo:hud-answer-action'") &&
      /async function answerAction\s*\(/.test(controller),
    answerConfirm: controller.includes("'skopeo:hud-answer-action-confirm'") &&
      /async function confirmAnswerAction\s*\(/.test(controller)
  });
}

function testStaticPrivacyAndPassiveContract(sources) {
  assert.match(sources.config, /skopeoTruthTimezoneBinding\s*:\s*null/);
  assert.match(sources.config, /skopeoTruthCalendars\s*:\s*\[\s*\]/);
  assert.match(sources.background, /let fsbSkopeoTruthEngineFacade\s*=\s*null\s*;/,
    'truth facade is held in background module lexical state');
  assert.strictEqual(/global(?:This)?\.fsbSkopeoTruthEngineFacade\s*=/.test(sources.background), false,
    'truth facade is never published globally');
  assert.strictEqual(/['"]skopeo:truth/.test(sources.background), false,
    'no content or MCP action exposes truth readiness');
  assert.strictEqual(sources.manifest.includes('skopeo-truth-engine.js'), false,
    'truth engine remains absent from manifest content scripts');
  assert.match(sources.background,
    /let fsbSkopeoDecisionPolicyStoreFacade\s*=\s*null\s*;/,
    'decision policy store facade is held in background module lexical state');
  assert.match(sources.background,
    /let fsbSkopeoDecisionPolicyFacade\s*=\s*null\s*;/,
    'decision policy engine facade is held in background module lexical state');
  assert.strictEqual(
    /global(?:This)?\.fsbSkopeoDecisionPolicy(?:Store)?Facade\s*=/.test(sources.background),
    false,
    'decision policy facades are never published globally'
  );
  assert.strictEqual(sources.manifest.includes('skopeo-decision-policy'), false,
    'decision policy modules remain absent from manifest content scripts');
  assert.strictEqual(
    /draftMemo|generateMemo|authorMemo|synthesizeMemo|memoText/.test(sources.background),
    false,
    'background exposes no memo authoring path'
  );

  const controller = markedSource(
    sources.background,
    '/* FSB_SKOPEO_CONTROLLER_START */',
    '/* FSB_SKOPEO_CONTROLLER_END */'
  );
  assert.strictEqual(
    controller.split('ensureCurrentHudTruthDisplaySnapshot(').length - 1,
    6,
    'private truth readiness has one declaration plus display, citation, alert, ask, and policy refresh callers'
  );
  for (const passive of [
    'rehydrateStoredSessions', 'handleNavigation', 'handleSameDocumentRoute',
    'handleTabRemoved', 'handleReady'
  ]) {
    const pattern = new RegExp(`function ${passive}\\([^]*?\\n  }`);
    const match = controller.match(pattern);
    assert.ok(match, `${passive} remains available`);
    assert.strictEqual(/inspectDisplaySnapshot|\.recompute\s*\(/.test(match[0]), false,
      `${passive} starts no truth inspection or recomputation`);
  }
}

function loadContextBuilder(backgroundSource) {
  const region = markedSource(backgroundSource, CONTEXT_START, CONTEXT_END);
  return new Function(`${region}\nreturn createFsbSkopeoTruthEvaluationContextBuilder;`)();
}

function loadPolicyDocumentResolver(backgroundSource) {
  const region = markedSource(backgroundSource, POLICY_DOCUMENT_START, POLICY_DOCUMENT_END);
  return new Function(`${region}\nreturn createFsbSkopeoPolicyDocumentResolver;`)();
}

async function testPolicyDocumentResolver(backgroundSource) {
  const createResolver = loadPolicyDocumentResolver(backgroundSource);
  const operations = [];
  const resolver = createResolver({
    async runCorpusOperation(kind, exactTuple, selection, callback) {
      operations.push({ kind, exactTuple, selection });
      const aggregate = await callback(
        Object.freeze([Object.freeze({
          sourceFileId: selection.sourceFileIds[0], sourceState: 'ready'
        })]),
        Object.freeze({ complete: true }),
        Object.freeze({ aborted: false })
      );
      return Object.freeze({ decision: 'admitted', aggregate: aggregate.aggregate });
    },
    async bindSource(args, sourceFileId) {
      assert.equal(args.certificateBySource.get(sourceFileId).sourceState, 'ready');
      return Object.freeze({
        sourceFileId,
        sourceRevision: 'revision-document-10',
        familyId: 'family-document-10',
        citationId: 'citation-document-10'
      });
    }
  });
  const base = {
    visible: {
      manifest: {
        sources: [
          { sourceFileId: 'agreement-current', state: 'ready' },
          { sourceFileId: 'document-10-stable', state: 'ready' }
        ]
      }
    },
    binding: { exactTuple: { generation: 7 } },
    truth: { status: 'current' },
    kernel: {},
    operationSignal: { aborted: false },
    certificateBySource: new Map([[
      'agreement-current', { sourceFileId: 'agreement-current', sourceState: 'ready' }
    ]])
  };
  const current = await resolver(base, 'document-10-stable');
  assert.equal(current.state, 'current',
    'configured Document 10 resolves independently of the agreement evidence scope');
  assert.equal(current.revisionKey, 'revision-document-10');
  assert.equal(current.source.sourceFileId, 'document-10-stable');
  assert.deepStrictEqual(operations, [{
    kind: 'query',
    exactTuple: { generation: 7 },
    selection: { sourceFileIds: ['document-10-stable'] }
  }], 'Document 10 receives its own exact current authorization operation');

  const inaccessible = await resolver({
    ...base,
    visible: { manifest: { sources: [
      { sourceFileId: 'document-10-stable', state: 'unreadable' }
    ] } }
  }, 'document-10-stable');
  assert.equal(inaccessible.state, 'inaccessible',
    'known non-ready Document 10 is an explicit access blocker');
  const missing = await resolver(base, 'document-10-missing');
  assert.equal(missing.state, 'missing',
    'configured identity absent from the current corpus is explicitly missing');
  assert.equal(operations.length, 1,
    'missing and inaccessible states start no unauthorized source read');
}

function testPolicyMemoJoin(backgroundSource) {
  const region = markedSource(backgroundSource, POLICY_MEMO_START, POLICY_MEMO_END);
  const qualify = new Function(`${region}\nreturn hudQualifyingPolicyMemoRecords;`)();
  const agreement = {
    kind: 'agreement', sourceFileId: 'agreement-current', recordVersionId: 'agreement-version'
  };
  const relatedMemo = {
    kind: 'memo', sourceFileId: 'memo-related', recordVersionId: 'memo-related-version'
  };
  const unrelatedMemo = {
    kind: 'memo', sourceFileId: 'memo-unrelated', recordVersionId: 'memo-unrelated-version'
  };
  const graph = {
    records: [agreement, unrelatedMemo, relatedMemo],
    relations: [{
      predicate: 'references-memo',
      fromRecordVersionId: 'agreement-version',
      toRecordVersionId: 'memo-related-version'
    }]
  };
  assert.deepStrictEqual(
    qualify(graph, 'agreement-current', [
      'agreement-current', 'memo-related', 'memo-unrelated'
    ]).map((record) => record.sourceFileId),
    ['memo-related'],
    'only a current agreement-to-memo relation can satisfy the complex memo join'
  );
  assert.deepStrictEqual(qualify({
    records: [agreement, unrelatedMemo], relations: []
  }, 'agreement-current', ['agreement-current', 'memo-unrelated']), [],
  'an unrelated memo record cannot clear the current agreement safeguard');
  assert.deepStrictEqual(qualify({
    records: [agreement, relatedMemo],
    relations: [{
      predicate: 'references-memo',
      fromRecordVersionId: 'agreement-version',
      toRecordVersionId: 'memo-related-version'
    }]
  }, 'agreement-other', ['agreement-current', 'memo-related']), [],
  'a cross-agreement memo relation cannot clear the current agreement safeguard');
}

async function testEvaluationContextBuilder(backgroundSource) {
  const TruthSchema = require(SCHEMA_PATH);
  const createBuilder = loadContextBuilder(backgroundSource);
  assert.strictEqual(typeof createBuilder, 'function');

  async function buildAt(timezone, instant, calendars = []) {
    let clockCalls = 0;
    let settingsReads = 0;
    const settings = Object.freeze({
      skopeoTruthTimezoneBinding: Object.freeze({
        kind: 'configured',
        timezone,
        configurationId: 'governing-zone',
        configurationVersion: 'v7'
      }),
      skopeoTruthCalendars: Object.freeze(calendars.slice())
    });
    const build = createBuilder({
      now() { clockCalls += 1; return new Date(instant); },
      async readSettings() { settingsReads += 1; return settings; },
      truthSchema: TruthSchema,
      IntlDateTimeFormat: Intl.DateTimeFormat
    });
    const result = await build();
    assert.strictEqual(clockCalls, 1, `${timezone} reads its injected clock exactly once`);
    assert.strictEqual(settingsReads, 2, `${timezone} rechecks settings before return`);
    return result;
  }

  const chicago = await buildAt('America/Chicago', '2026-01-01T03:30:00.000Z');
  assert.strictEqual(chicago.asOfCivilDate, '2025-12-31');
  const tokyo = await buildAt('Asia/Tokyo', '2026-01-01T03:30:00.000Z');
  assert.strictEqual(tokyo.asOfCivilDate, '2026-01-01');
  const kiritimati = await buildAt('Pacific/Kiritimati', '2026-07-24T11:30:00.000Z');
  assert.strictEqual(kiritimati.asOfCivilDate, '2026-07-25');

  const calendarB = Object.freeze({
    schemaVersion: TruthSchema.CALENDAR_VERSION,
    calendarId: 'calendar-B',
    calendarVersionId: 'v2',
    weekendDays: Object.freeze([0, 6]),
    holidays: Object.freeze([])
  });
  const calendarA = Object.freeze({
    schemaVersion: TruthSchema.CALENDAR_VERSION,
    calendarId: 'calendar-A',
    calendarVersionId: 'v1',
    weekendDays: Object.freeze([0, 6]),
    holidays: Object.freeze(['2026-01-01'])
  });
  const calendarContext = await buildAt(
    'America/New_York', '2026-01-01T05:30:00.000Z', [calendarB, calendarA]);
  assert.deepStrictEqual(calendarContext.calendars.map((calendar) => calendar.calendarId),
    ['calendar-A', 'calendar-B'], 'business calendars are reparsed and sorted');
  assert.ok(Object.isFrozen(calendarContext), 'evaluation context is schema-frozen');

  const missing = createBuilder({
    now() { throw new Error('missing timezone must not read the clock'); },
    async readSettings() {
      return Object.freeze({ skopeoTruthTimezoneBinding: null, skopeoTruthCalendars: [] });
    },
    truthSchema: TruthSchema,
    IntlDateTimeFormat: Intl.DateTimeFormat
  });
  blocker(await missing(), 'timezone-missing');

  const malformedCalendar = createBuilder({
    now() { return new Date('2026-01-01T12:00:00.000Z'); },
    async readSettings() {
      return Object.freeze({
        skopeoTruthTimezoneBinding: Object.freeze({
          kind: 'configured', timezone: 'America/Chicago',
          configurationId: 'zone', configurationVersion: 'v1'
        }),
        skopeoTruthCalendars: Object.freeze([Object.freeze({ calendarId: 'broken' })])
      });
    },
    truthSchema: TruthSchema,
    IntlDateTimeFormat: Intl.DateTimeFormat
  });
  blocker(await malformedCalendar(), 'business-calendar-missing');

  let staleRead = 0;
  const stale = createBuilder({
    now() { return new Date('2026-01-01T12:00:00.000Z'); },
    async readSettings() {
      staleRead += 1;
      return Object.freeze({
        skopeoTruthTimezoneBinding: Object.freeze({
          kind: 'configured', timezone: staleRead === 1 ? 'America/Chicago' : 'America/New_York',
          configurationId: 'zone', configurationVersion: `v${staleRead}`
        }),
        skopeoTruthCalendars: Object.freeze([])
      });
    },
    truthSchema: TruthSchema,
    IntlDateTimeFormat: Intl.DateTimeFormat
  });
  blocker(await stale(), 'evaluation-context-stale');
}

function loadTruthHelper(backgroundSource, dependencies) {
  const region = markedSource(backgroundSource, HELPER_START, HELPER_END);
  return new Function('dependencies', [
    'const controllers = dependencies.controllers;',
    'const global = dependencies.global;',
    'const hudTruthDisplayInflight = new Map();',
    'const CORPUS_FACADE_TUPLE_KEYS = [',
    '  "tabId", "generation", "exactOrigin", "profileId", "profileVersion",',
    '  "contextEpoch", "semanticEntity"',
    '];',
    'function exactKeys(value, expected) {',
    '  return !!value && typeof value === "object" && !Array.isArray(value) &&',
    '    Object.keys(value).length === expected.length &&',
    '    Object.keys(value).every(function(key) { return expected.includes(key); });',
    '}',
    'async function fsbRunPrivateHudTruthOperation(operation, exactTuple, request) {',
    '  return operation === "inspect-display"',
    '    ? dependencies.facade.inspectDisplaySnapshot(exactTuple, request)',
    '    : dependencies.facade.recompute(exactTuple, request);',
    '}',
    'function controllerEntryFor(tabId, generation) {',
    '  const entry = controllers.get(tabId);',
    '  return entry && entry.generation === generation && !entry.controller.signal.aborted ? entry : null;',
    '}',
    'function sameSkopeoEntity(left, right) { return JSON.stringify(left) === JSON.stringify(right); }',
    'function deepFreezeSkopeo(value) {',
    '  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;',
    '  Object.values(value).forEach(deepFreezeSkopeo); return Object.freeze(value);',
    '}',
    region,
    'return { ensure: ensureCurrentHudTruthDisplaySnapshot, inflight: hudTruthDisplayInflight };'
  ].join('\n'))(dependencies);
}

function tuple(tabId = 17, generation = 4) {
  return Object.freeze({
    tabId,
    generation,
    exactOrigin: 'https://drive.google.com',
    profileId: 'drive-docs-deep-pack',
    profileVersion: '57.1.0',
    contextEpoch: 9,
    semanticEntity: Object.freeze({ kind: 'drive-folder', id: 'folder-A', label: 'Folder A' })
  });
}

function installEntry(controllers, exactTuple) {
  const controller = new AbortController();
  controllers.set(exactTuple.tabId, {
    generation: exactTuple.generation,
    controller,
    projection: Object.freeze({
      exactOrigin: exactTuple.exactOrigin,
      profileId: exactTuple.profileId,
      profileVersion: exactTuple.profileVersion
    }),
    authority: Object.freeze({
      contextEpoch: exactTuple.contextEpoch,
      semanticEntity: exactTuple.semanticEntity
    })
  });
  return controller;
}

async function testExplicitTruthDedupe(backgroundSource) {
  const TruthSchema = require(SCHEMA_PATH);
  const context = TruthSchema.parseEvaluationContext({
    asOfCivilDate: '2026-07-24',
    governingTimezoneBinding: {
      kind: 'configured', timezone: 'America/Chicago',
      configurationId: 'zone', configurationVersion: 'v1'
    },
    calendars: []
  });
  const exactTuple = tuple();
  const controllers = new Map();
  installEntry(controllers, exactTuple);
  const calls = [];
  let published = false;
  let releaseRecompute;
  const recomputeGate = new Promise((resolve) => { releaseRecompute = resolve; });
  const facade = Object.freeze({
    async inspectDisplaySnapshot(receivedTuple, request) {
      calls.push({ method: 'inspect', tuple: receivedTuple, request });
      return published
        ? Object.freeze({ version: 'skopeo-truth-engine/1', status: 'current', blockerCodes: Object.freeze([]) })
        : Object.freeze({ version: 'skopeo-truth-engine/1', status: 'review-required', blockerCodes: Object.freeze(['fact-missing']) });
    },
    async recompute(receivedTuple, request) {
      calls.push({ method: 'recompute', tuple: receivedTuple, request });
      await recomputeGate;
      published = true;
      return Object.freeze({ version: 'skopeo-truth-engine/1', status: 'published', blockerCodes: Object.freeze([]) });
    }
  });
  const helper = loadTruthHelper(backgroundSource, {
    facade,
    controllers,
    global: Object.freeze({ FsbSkopeoTruthSchema: TruthSchema })
  });
  assert.strictEqual(helper.inflight.size, 0, 'private in-flight registry starts empty');
  const first = helper.ensure(exactTuple, { evaluationContext: context });
  const second = helper.ensure(exactTuple, { evaluationContext: context });
  for (let attempt = 0;
    attempt < 50 && calls.filter((call) => call.method === 'recompute').length === 0;
    attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.strictEqual(calls.filter((call) => call.method === 'recompute').length, 1,
    'identical explicit consumers share one recompute');
  releaseRecompute();
  const [left, right] = await Promise.all([first, second]);
  assert.strictEqual(left, right, 'identical explicit consumers share one result promise');
  assert.strictEqual(calls.filter((call) => call.method === 'inspect').length, 2,
    'shared work performs exact inspect, recompute, inspect choreography');
  assert.deepStrictEqual(calls.map((call) => call.method), ['inspect', 'recompute', 'inspect']);
  for (const call of calls) {
    assert.strictEqual(call.tuple, exactTuple, 'facade receives the exact tuple object');
    assert.deepStrictEqual(Object.keys(call.request), ['evaluationContext']);
    assert.strictEqual(call.request.evaluationContext, context,
      'facade receives the exact evaluation context object');
  }
  assert.strictEqual(helper.inflight.size, 0, 'settled work leaves no hidden cadence');

  const blockedControllers = new Map();
  installEntry(blockedControllers, exactTuple);
  let blockedRecompute = 0;
  const blockedHelper = loadTruthHelper(backgroundSource, {
    controllers: blockedControllers,
    global: Object.freeze({ FsbSkopeoTruthSchema: TruthSchema }),
    facade: Object.freeze({
      async inspectDisplaySnapshot() {
        return Object.freeze({
          version: 'skopeo-truth-engine/1', status: 'review-required',
          blockerCodes: Object.freeze(['source-inaccessible'])
        });
      },
      async recompute() { blockedRecompute += 1; throw new Error('must not run'); }
    })
  });
  blocker(await blockedHelper.ensure(exactTuple, { evaluationContext: context }), 'source-inaccessible');
  assert.strictEqual(blockedRecompute, 0, 'non-missing/stale blockers never start provider work');

  const distinctControllers = new Map();
  installEntry(distinctControllers, exactTuple);
  let distinctRecomputes = 0;
  const distinctHelper = loadTruthHelper(backgroundSource, {
    controllers: distinctControllers,
    global: Object.freeze({ FsbSkopeoTruthSchema: TruthSchema }),
    facade: Object.freeze({
      async inspectDisplaySnapshot() {
        return Object.freeze({
          version: 'skopeo-truth-engine/1', status: 'review-required',
          blockerCodes: Object.freeze(['fact-missing'])
        });
      },
      async recompute() {
        distinctRecomputes += 1;
        return Object.freeze({ version: 'skopeo-truth-engine/1', status: 'published' });
      }
    })
  });
  const distinctContext = TruthSchema.parseEvaluationContext({
    ...context,
    asOfCivilDate: '2026-07-25'
  });
  await Promise.all([
    distinctHelper.ensure(exactTuple, { evaluationContext: context }),
    distinctHelper.ensure(exactTuple, { evaluationContext: distinctContext })
  ]);
  assert.strictEqual(distinctRecomputes, 2,
    'different evaluation-context digests never share provider work');

  const abortControllers = new Map();
  const abortController = installEntry(abortControllers, exactTuple);
  let releaseAbort;
  const abortGate = new Promise((resolve) => { releaseAbort = resolve; });
  let abortPublished = false;
  const abortHelper = loadTruthHelper(backgroundSource, {
    controllers: abortControllers,
    global: Object.freeze({ FsbSkopeoTruthSchema: TruthSchema }),
    facade: Object.freeze({
      async inspectDisplaySnapshot() {
        return abortPublished
          ? Object.freeze({ version: 'skopeo-truth-engine/1', status: 'current', blockerCodes: Object.freeze([]) })
          : Object.freeze({ version: 'skopeo-truth-engine/1', status: 'review-required', blockerCodes: Object.freeze(['fact-missing']) });
      },
      async recompute() { await abortGate; abortPublished = true; return Object.freeze({ status: 'published' }); }
    })
  });
  const late = abortHelper.ensure(exactTuple, { evaluationContext: context });
  await new Promise((resolve) => setImmediate(resolve));
  abortController.abort('replacement');
  abortControllers.delete(exactTuple.tabId);
  releaseAbort();
  blocker(await late, 'snapshot-stale');
  assert.strictEqual(abortHelper.inflight.size, 0,
    'replacement abort makes late completion inert and clears its registry entry');
}

function loadHudControllerFactory(backgroundSource) {
  const region = markedSource(backgroundSource, HUD_CONTROLLER_START, HUD_CONTROLLER_END);
  return new Function(`${region}\nreturn createFsbSkopeoHudProjectionController;`)();
}

function testHudControllerStaticContract(sources) {
  const controller = markedSource(
    sources.background,
    '/* FSB_SKOPEO_CONTROLLER_START */',
    '/* FSB_SKOPEO_CONTROLLER_END */'
  );
  const hudController = markedSource(sources.background, HUD_CONTROLLER_START, HUD_CONTROLLER_END);

  assert.match(sources.background, /importScripts\('utils\/skopeo-hud-schema\.js'\)/,
    'background imports the closed HUD schema');
  assert.match(sources.background, /importScripts\('utils\/skopeo-hud-projector\.js'\)/,
    'background imports the bounded HUD projector');
  assert.match(controller, /runSkopeoCorpusOperation\('display'/,
    'HUD projection uses the exact display corpus operation');
  assert.match(controller, /runSkopeoCorpusOperation\('citation-open'/,
    'HUD citation replay uses the exact effectful corpus operation');
  assert.match(controller, /ensureCurrentHudTruthDisplaySnapshot\(/,
    'HUD display is the only explicit caller of the private truth readiness helper');
  assert.match(controller, /function refreshCurrentHudCitation\s*\(/,
    'citation refresh is background-local and re-reads current truth');
  assert.match(controller, /kernel\.transport\.getFile\s*\(/,
    'citation refresh re-resolves authenticated file metadata');
  assert.match(controller, /https:\/\/docs\.google\.com\/document\/d\//,
    'fresh Docs navigation is constructed only in trusted background code');
  assert.match(controller, /https:\/\/drive\.google\.com\/file\/d\//,
    'fresh Drive navigation is constructed only in trusted background code');
  assert.strictEqual(/fsbSkopeoCorpusFacade|global\.FSBSkopeoCorpus/.test(hudController), false,
    'HUD controller receives no direct corpus facade or raw authority object');
  assert.strictEqual((hudController.match(/chrome\.tabs\.create\s*\(/g) || []).length, 1,
    'HUD citation path owns one guarded tab-opening call site');
  assert.match(controller, /hudProjectionController\.revokeController\(/,
    'controller lifecycle revokes HUD capability state');
  for (const passive of [
    'rehydrateStoredSessions', 'handleNavigation', 'handleSameDocumentRoute',
    'handleTabRemoved', 'handleReady'
  ]) {
    const pattern = new RegExp(`function ${passive}\\([^]*?\\n  }`);
    const match = controller.match(pattern);
    assert.ok(match, `${passive} remains available`);
    assert.strictEqual(/requestProjection\s*\(/.test(match[0]), false,
      `${passive} starts no HUD projection work`);
  }
}

function projectionRequest(overrides = {}) {
  return Object.freeze({
    action: 'skopeo:hud-projection',
    generation: 7,
    exactOrigin: 'https://drive.google.com',
    profileVersion: 'profile-v7',
    contextEpoch: 11,
    semanticEntityToken: 'entity-token-7',
    actionToken: 'request-token-7',
    ...overrides
  });
}

function citationRequest(projectionToken, actionId, overrides = {}) {
  return Object.freeze({
    action: 'skopeo:hud-citation-open',
    generation: 7,
    exactOrigin: 'https://drive.google.com',
    profileVersion: 'profile-v7',
    contextEpoch: 11,
    semanticEntityToken: 'entity-token-7',
    projectionToken,
    actionId,
    ...overrides
  });
}

function revokeRequest(projectionToken, overrides = {}) {
  return Object.freeze({
    action: 'skopeo:hud-revoke',
    generation: 7,
    exactOrigin: 'https://drive.google.com',
    profileVersion: 'profile-v7',
    contextEpoch: 11,
    semanticEntityToken: 'entity-token-7',
    projectionToken,
    ...overrides
  });
}

function askRequest(projectionToken, scopeToken, question, overrides = {}) {
  return Object.freeze({
    action: 'skopeo:hud-ask',
    generation: 7,
    exactOrigin: 'https://drive.google.com',
    profileVersion: 'profile-v7',
    contextEpoch: 11,
    semanticEntityToken: 'entity-token-7',
    projectionToken,
    scopeToken,
    question: Object.freeze({ text: question }),
    ...overrides
  });
}

function askCancelRequest(projectionToken, overrides = {}) {
  return Object.freeze({
    action: 'skopeo:hud-ask-cancel',
    generation: 7,
    exactOrigin: 'https://drive.google.com',
    profileVersion: 'profile-v7',
    contextEpoch: 11,
    semanticEntityToken: 'entity-token-7',
    projectionToken,
    ...overrides
  });
}

function answerActionRequest(projectionToken, actionId, overrides = {}) {
  return Object.freeze({
    action: 'skopeo:hud-answer-action',
    generation: 7,
    exactOrigin: 'https://drive.google.com',
    profileVersion: 'profile-v7',
    contextEpoch: 11,
    semanticEntityToken: 'entity-token-7',
    projectionToken,
    actionId,
    ...overrides
  });
}

function answerConfirmRequest(projectionToken, actionId, confirmationToken, overrides = {}) {
  return Object.freeze({
    action: 'skopeo:hud-answer-action-confirm',
    generation: 7,
    exactOrigin: 'https://drive.google.com',
    profileVersion: 'profile-v7',
    contextEpoch: 11,
    semanticEntityToken: 'entity-token-7',
    projectionToken,
    actionId,
    confirmationToken,
    ...overrides
  });
}

function alertActionRequest(projectionToken, actionId, overrides = {}) {
  return Object.freeze({
    ...answerActionRequest(projectionToken, actionId),
    action: 'skopeo:hud-alert-action',
    ...overrides
  });
}

function alertConfirmRequest(projectionToken, actionId, confirmationToken, overrides = {}) {
  return Object.freeze({
    ...answerConfirmRequest(projectionToken, actionId, confirmationToken),
    action: 'skopeo:hud-alert-action-confirm',
    ...overrides
  });
}

function readingProjection(
  binding,
  projectionToken,
  actionId,
  label = 'Vendor agreement',
  scopeToken = 'scope-opaque-agreement'
) {
  return {
    version: 'skopeo-hud-projection/1',
    generation: binding.generation,
    exactOrigin: binding.exactOrigin,
    profileVersion: binding.profileVersion,
    contextEpoch: binding.contextEpoch,
    semanticEntityToken: binding.semanticEntityToken,
    requestActionToken: binding.actionToken,
    projectionToken,
    mode: 'reading',
    currentness: 'current',
    result: 'complete',
    body: {
      documentLabel: label,
      sourceState: 'ready',
      readingState: 'governing',
      governingAction: { state: 'document', actionToken: actionId },
      facts: [{
        type: 'effective',
        value: 'Effective January 1, 2026',
        evidenceRole: 'governing',
        trustState: 'accepted',
        citationLabel: 'Effective date',
        actionToken: null
      }],
      factOverflow: 0,
      gaps: [],
      gapOverflow: 0,
      policyDocument: 'on-file',
      memoRequirement: 'not-evaluated',
      notificationDelivery: 'not-available',
      emptyState: 'not-empty',
      askScopes: [{
        kind: 'agreement', label: 'Current agreement', scopeToken
      }]
    }
  };
}

function folderProjection(binding, projectionToken, scopeToken = 'scope-opaque-corpus') {
  return {
    version: 'skopeo-hud-projection/1',
    generation: binding.generation,
    exactOrigin: binding.exactOrigin,
    profileVersion: binding.profileVersion,
    contextEpoch: binding.contextEpoch,
    semanticEntityToken: binding.semanticEntityToken,
    requestActionToken: binding.actionToken,
    projectionToken,
    mode: 'folder',
    currentness: 'current',
    result: 'empty',
    body: {
      manifestState: 'complete',
      vendorCount: 0,
      vendors: [],
      vendorOverflow: 0,
      nextMaterialDates: [],
      nextMaterialDateOverflow: 0,
      urgentGaps: [],
      urgentGapOverflow: 0,
      emptyState: 'complete-empty',
      askScopes: [{
        kind: 'corpus', label: 'Enrolled accessible corpus', scopeToken
      }]
    }
  };
}

function mutableBinding(overrides = {}) {
  return {
    controllerKey: Object.freeze({ name: 'controller-7' }),
    tabId: 17,
    generation: 7,
    exactOrigin: 'https://drive.google.com',
    profileVersion: 'profile-v7',
    contextEpoch: 11,
    semanticEntityToken: 'entity-token-7',
    actionToken: 'request-token-7',
    mode: 'reading',
    exactTuple: Object.freeze({
      tabId: 17,
      generation: 7,
      origin: 'https://drive.google.com',
      profileId: 'drive',
      profileVersion: 'profile-v7',
      contextEpoch: 11,
      entityKind: 'file',
      entityId: 'raw-drive-file'
    }),
    sourceFileIds: Object.freeze(['raw-source-file-A']),
    sourceSetDigest: 'source-set-A',
    revisionDigest: 'revision-A',
    accessDigest: 'access-A',
    ...overrides
  };
}

function withoutKey(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function assertNoHudAuthorityKeys(value, label) {
  const forbidden = new Set([
    'tabId', 'profileId', 'entityId', 'rootFileId', 'sourceFileId', 'sourceFileIds',
    'familyId', 'citationId', 'contentFingerprint', 'sourceRevision', 'canonicalUrl',
    'url', 'resourceKey', 'accountPermissionId', 'corpusRootFileId'
  ]);
  const visit = (candidate) => {
    if (!candidate || typeof candidate !== 'object') return;
    for (const key of Object.keys(candidate)) {
      assert.strictEqual(forbidden.has(key), false, `${label} excludes authority key ${key}`);
      visit(candidate[key]);
    }
  };
  visit(value);
}

async function testHudControllerRuntime(backgroundSource) {
  const HudSchema = require(HUD_SCHEMA_PATH);
  const AlertSchema = require(ALERT_SCHEMA_PATH);
  const createController = loadHudControllerFactory(backgroundSource);
  assert.strictEqual(typeof createController, 'function');

  let activeBinding = mutableBinding();
  let tokenCounter = 0;
  let projectionLabel = 'Vendor agreement';
  let driftAfterRefresh = null;
  let refreshGate = null;
  const operations = [];
  const openedTabs = [];

  function sameSender(sender, binding) {
    return sender && sender.id === 'extension-id' && sender.frameId === 0 &&
      sender.tab && sender.tab.id === binding.tabId;
  }

  const sender = Object.freeze({
    id: 'extension-id',
    frameId: 0,
    tab: Object.freeze({ id: 17, url: 'https://drive.google.com/drive/folders/raw-drive-folder' })
  });

  let extraHiddenActions = 0;
  let evaluationOverride = null;
  let includeAlertAction = false;
  let alertCommits = 0;
  const dependencies = Object.freeze({
    hudSchema: HudSchema,
    alertSchema: AlertSchema,
    randomToken(kind) {
      tokenCounter += 1;
      return `${kind}-opaque-${tokenCounter}`;
    },
    async resolveCurrentBinding(_message, candidateSender) {
      return activeBinding && sameSender(candidateSender, activeBinding)
        ? { ...activeBinding }
        : null;
    },
    async buildEvaluationContext() {
      if (evaluationOverride) return evaluationOverride;
      return Object.freeze({ civilDate: '2026-08-12', digest: 'evaluation-digest-A' });
    },
    async ensureTruth(exactTuple, options) {
      assert.deepStrictEqual(exactTuple, activeBinding.exactTuple);
      assert.ok(options && options.evaluationContext, 'truth readiness receives explicit evaluation context');
      return Object.freeze({ status: 'current', outputGenerationId: 'truth-generation-A' });
    },
    async buildProjection(args) {
      const actionId = args.mintActionId();
      const alertActionId = includeAlertAction ? args.mintActionId() : null;
      const scopeToken = args.mintScopeToken();
      const projection = args.binding.mode === 'folder'
        ? folderProjection(args.binding, args.projectionToken, scopeToken)
        : readingProjection(
          args.binding,
          args.projectionToken,
          actionId,
          projectionLabel,
          scopeToken
        );
      if (alertActionId && projection.mode === 'reading') {
        projection.body.notificationDelivery = {
          version: 'skopeo-alert-public-status/1', state: 'scheduled',
          summary: 'Local alert scheduled',
          detail: 'Skopeo will recheck current evidence before showing this local alert.',
          deadlineCivilDate: '2027-05-31', alertCivilDate: '2027-03-02',
          action: {
            actionId: alertActionId, kind: 'remove-current-owner-mapping',
            label: 'Remove current owner mapping', requiresConfirmation: true
          }
        };
      }
      const actions = args.binding.mode === 'folder' ? [] : [{
        actionId,
        familyId: 'raw-family-A',
        citationId: 'raw-citation-A',
        sourceFileId: 'raw-source-file-A',
        sourceRevision: 'revision-A',
        contentFingerprint: 'fingerprint-A',
        truthGenerationId: 'truth-generation-A',
        evaluationContextDigest: 'evaluation-digest-A'
      }];
      for (let index = 0; index < extraHiddenActions; index += 1) {
        const hiddenId = args.mintActionId();
        actions.push({
          actionId: hiddenId,
          familyId: 'raw-family-A',
          citationId: 'raw-citation-hidden-' + String(index + 1),
          sourceFileId: 'raw-source-file-A',
          sourceRevision: 'revision-A',
          contentFingerprint: 'fingerprint-A',
          truthGenerationId: 'truth-generation-A',
          evaluationContextDigest: 'evaluation-digest-A'
        });
      }
      return Object.freeze({
        projection,
        actions: Object.freeze(actions.map((action) => Object.freeze(action))),
        alertActions: Object.freeze(alertActionId ? [Object.freeze({
          actionId: alertActionId,
          kind: 'remove-current-owner-mapping',
          familyId: 'family-alert-A',
          partition: Object.freeze({
            partitionKey: 'scpk1:partition-A',
            accountPermissionId: 'permission-A',
            corpusRootFileId: 'corpus-root-A'
          }),
          owner: Object.freeze({
            stableRecordId: 'owner-stable-A',
            stableRelationId: 'owner-relation-A',
            sourceFileId: 'raw-source-file-A',
            sourceRevision: 'revision-A',
            label: 'Current owner'
          }),
          agreementStableId: 'agreement-stable-A',
          sourceFileIds: Object.freeze(['raw-source-file-A']),
          sourceSetDigest: 'source-set-A',
          revisionDigest: 'revision-A',
          accessDigest: 'access-A',
          truthGenerationId: 'truth-generation-A',
          evaluationContextDigest: 'evaluation-digest-A'
        })] : []),
        scopes: Object.freeze([Object.freeze({
          scopeToken,
          kind: args.binding.mode === 'folder' ? 'corpus' : 'agreement',
          label: args.binding.mode === 'folder'
            ? 'Enrolled accessible corpus'
            : 'Current agreement',
          scopeDigest: 'scope-digest-A',
          sourceFileIds: Object.freeze(args.binding.sourceFileIds.slice())
        })])
      });
    },
    async refreshCitation(args) {
      if (refreshGate) await refreshGate;
      if (driftAfterRefresh) activeBinding = { ...activeBinding, [driftAfterRefresh]: `${driftAfterRefresh}-drifted` };
      assert.strictEqual(args.action.sourceFileId, 'raw-source-file-A');
      return Object.freeze({
        canonicalUrl: 'https://docs.google.com/document/d/fresh-governing-source/edit',
        familyId: 'raw-family-A',
        citationId: 'raw-citation-A',
        sourceRevision: 'revision-A',
        contentFingerprint: 'fingerprint-A',
        truthGenerationId: 'truth-generation-A',
        evaluationContextDigest: 'evaluation-digest-A'
      });
    },
    async commitAlertAction(args) {
      assert.strictEqual(args.action.kind, 'remove-current-owner-mapping');
      assert.strictEqual(args.action.owner.stableRecordId, 'owner-stable-A');
      alertCommits += 1;
      return true;
    },
    chrome: Object.freeze({
      tabs: Object.freeze({
        async create(options) {
          assert.deepStrictEqual(Object.keys(options).sort(), ['active', 'url']);
          assert.strictEqual(options.active, true);
          openedTabs.push(options.url);
          return true;
        }
      })
    }),
    async runCorpusOperation(kind, exactTuple, selection, callback, commitCallback) {
      operations.push(Object.freeze({ kind, exactTuple, selection }));
      assert.deepStrictEqual(selection, { sourceFileIds: ['raw-source-file-A'] });
      if (kind === 'display') {
        const callbackResult = await callback(
          Object.freeze([{ sourceFileId: 'raw-source-file-A' }]),
          Object.freeze({ complete: true }),
          Object.freeze({ aborted: false })
        );
        assert.deepStrictEqual(callbackResult.rows, [], 'display callback emits no raw authority rows');
        return Object.freeze({ decision: 'admitted', aggregate: callbackResult.aggregate });
      }
      assert.strictEqual(kind, 'citation-open');
      assert.strictEqual(typeof commitCallback, 'function');
      const prepared = await callback(
        Object.freeze([{ sourceFileId: 'raw-source-file-A' }]),
        Object.freeze({ complete: true }),
        Object.freeze({ aborted: false })
      );
      const value = await commitCallback(prepared, Object.freeze({
        publish: async (effect) => effect(Object.freeze({ aborted: false }))
      }));
      return Object.freeze({ decision: 'admitted', value });
    }
  });

  const hud = createController(dependencies);
  assert.deepStrictEqual(Object.keys(hud).sort(),
    [
      'alertAction', 'answerAction', 'ask', 'cancelAsk', 'citationOpen',
      'confirmAlertAction', 'confirmAnswerAction', 'requestProjection',
      'requestRevoke', 'revokeController'
    ],
    'HUD controller exposes only its ten narrow lifecycle operations');
  assert.ok(Object.isFrozen(hud), 'HUD controller surface is frozen');

  const reading = await hud.requestProjection(projectionRequest(), sender);
  assert.ok(HudSchema.parseProjection(reading), 'reading response is a schema-valid frozen projection');
  assert.ok(Object.isFrozen(reading) && Object.isFrozen(reading.body), 'reading response is deeply frozen');
  assert.strictEqual(operations[0].kind, 'display');
  const readingJson = JSON.stringify(reading);
  assertNoHudAuthorityKeys(reading, 'reading projection');
  for (const secret of [
    'raw-drive-file', 'raw-source-file-A', 'raw-family-A', 'raw-citation-A',
    'fingerprint-A', 'docs.google.com/document'
  ]) {
    assert.strictEqual(readingJson.includes(secret), false, `reading projection excludes ${secret}`);
  }

  activeBinding = mutableBinding({ mode: 'folder' });
  const folder = await hud.requestProjection(projectionRequest(), sender);
  assert.ok(HudSchema.parseProjection(folder), 'folder response is a schema-valid frozen projection');
  assert.strictEqual(folder.mode, 'folder');
  assert.strictEqual(folder.result, 'empty');

  activeBinding = mutableBinding();
  includeAlertAction = true;
  const alertProjection = await hud.requestProjection(projectionRequest(), sender);
  const alertActionId = alertProjection.body.notificationDelivery.action.actionId;
  const alertConsequence = await hud.alertAction(
    alertActionRequest(alertProjection.projectionToken, alertActionId), sender
  );
  assert.deepStrictEqual(Object.keys(alertConsequence).sort(), [
    'confirmationToken', 'consequence', 'status', 'success'
  ], 'alert mapping exposes only minimized consequence and opaque confirmation authority');
  assert.deepStrictEqual(alertConsequence.consequence, {
    title: 'Remove current owner mapping',
    effect: 'local-alert-owner-mapping',
    detail: 'Removes the local recipient mapping and supersedes pending alerts for this exact current agreement owner.'
  });
  assert.deepStrictEqual(await hud.confirmAlertAction(alertConfirmRequest(
    alertProjection.projectionToken, alertActionId, 'confirmation-wrong'
  ), sender), Object.freeze({ success: false, status: 'closed' }));
  assert.strictEqual(alertCommits, 0, 'wrong alert confirmation has no durable effect');
  assert.deepStrictEqual(await hud.confirmAlertAction(alertConfirmRequest(
    alertProjection.projectionToken, alertActionId, alertConsequence.confirmationToken
  ), sender), Object.freeze({ success: true, status: 'committed' }));
  assert.strictEqual(alertCommits, 1, 'one exact alert confirmation commits once');
  assert.deepStrictEqual(await hud.confirmAlertAction(alertConfirmRequest(
    alertProjection.projectionToken, alertActionId, alertConsequence.confirmationToken
  ), sender), Object.freeze({ success: false, status: 'closed' }),
  'confirmed alert action cannot replay');
  includeAlertAction = false;

  activeBinding = mutableBinding();
  const replayProjection = await hud.requestProjection(projectionRequest(), sender);
  const replayAction = replayProjection.body.governingAction.actionToken;
  const replayMessage = citationRequest(replayProjection.projectionToken, replayAction);
  const operationsBeforeRejectedCitations = operations.length;
  const tabsBeforeRejectedCitations = openedTabs.length;
  for (const key of [
    'action', 'generation', 'exactOrigin', 'profileVersion', 'contextEpoch',
    'semanticEntityToken', 'projectionToken', 'actionId'
  ]) {
    assert.deepStrictEqual(await hud.citationOpen(withoutKey(replayMessage, key), sender),
      Object.freeze({ success: false, status: 'closed' }),
      `citation missing ${key} fails closed without consuming the action`);
  }
  for (const extraKey of ['actionToken', 'mode', 'tabId', 'sourceFileId', 'extra']) {
    assert.deepStrictEqual(await hud.citationOpen({ ...replayMessage, [extraKey]: 'caller-value' }, sender),
      Object.freeze({ success: false, status: 'closed' }),
      `citation caller-supplied ${extraKey} authority fails closed`);
  }
  for (const invalidCitation of [
    { ...replayMessage, action: 'skopeo:hud-citation-open-other' },
    { ...replayMessage, generation: 8 },
    { ...replayMessage, exactOrigin: 'https://docs.google.com' },
    { ...replayMessage, profileVersion: 'profile-v8' },
    { ...replayMessage, contextEpoch: 12 },
    { ...replayMessage, semanticEntityToken: 'entity-token-8' },
    { ...replayMessage, projectionToken: 'projection-opaque-wrong' },
    { ...replayMessage, actionId: 'action-opaque-wrong' }
  ]) {
    assert.deepStrictEqual(await hud.citationOpen(invalidCitation, sender),
      Object.freeze({ success: false, status: 'closed' }),
      'wrong citation authority tuple fails closed without consuming the action');
  }
  assert.strictEqual(operations.length, operationsBeforeRejectedCitations,
    'invalid citation messages start no corpus operation');
  assert.strictEqual(openedTabs.length, tabsBeforeRejectedCitations,
    'invalid citation messages open no tab');
  const wrongSender = Object.freeze({ ...sender, tab: Object.freeze({ id: 18 }) });
  assert.deepStrictEqual(await hud.citationOpen(replayMessage, wrongSender),
    Object.freeze({ success: false, status: 'closed' }),
    'cross-tab capability replay closes without an effect');

  let releaseRefresh;
  refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  const firstClick = hud.citationOpen(replayMessage, sender);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(await hud.citationOpen(replayMessage, sender),
    Object.freeze({ success: false, status: 'closed' }),
    'one-shot action is consumed before its first async boundary');
  releaseRefresh();
  assert.deepStrictEqual(await firstClick, Object.freeze({ success: true, status: 'opened' }));
  refreshGate = null;
  assert.strictEqual(openedTabs.length, 1, 'one admitted action opens exactly one fresh canonical tab');
  assert.deepStrictEqual(await hud.citationOpen(replayMessage, sender),
    Object.freeze({ success: false, status: 'closed' }),
    'successful citation action cannot be replayed');

  activeBinding = mutableBinding();
  const replacedProjection = await hud.requestProjection(projectionRequest(), sender);
  const replacement = await hud.requestProjection(projectionRequest(), sender);
  assert.deepStrictEqual(await hud.citationOpen(citationRequest(
    replacedProjection.projectionToken,
    replacedProjection.body.governingAction.actionToken
  ), sender), Object.freeze({ success: false, status: 'closed' }),
  'replacement withdraws actions from the old projection before publishing the new one');
  assert.ok(replacement.projectionToken !== replacedProjection.projectionToken,
    'replacement receives a fresh opaque projection token');

  const revokedProjection = await hud.requestProjection(projectionRequest(), sender);
  hud.revokeController(activeBinding.controllerKey, 'hide');
  assert.deepStrictEqual(await hud.citationOpen(citationRequest(
    revokedProjection.projectionToken,
    revokedProjection.body.governingAction.actionToken
  ), sender), Object.freeze({ success: false, status: 'closed' }),
  'hide/replacement revocation withdraws every minted action');

  const hideProjection = await hud.requestProjection(projectionRequest(), sender);
  assert.deepStrictEqual(await hud.requestRevoke(revokeRequest(hideProjection.projectionToken), sender),
    Object.freeze({ success: true, status: 'revoked' }),
    'production hide revocation admits the current sender/projection tuple');
  assert.deepStrictEqual(await hud.citationOpen(citationRequest(
    hideProjection.projectionToken,
    hideProjection.body.governingAction.actionToken
  ), sender), Object.freeze({ success: false, status: 'closed' }),
  'production hide revocation withdraws every minted action');
  assert.deepStrictEqual(await hud.requestRevoke(revokeRequest(hideProjection.projectionToken), sender),
    Object.freeze({ success: false, status: 'closed' }),
    'a second hide revocation for the same projection stays closed');

  for (const driftField of [
    'generation', 'semanticEntityToken', 'sourceSetDigest', 'revisionDigest', 'accessDigest'
  ]) {
    activeBinding = mutableBinding();
    const beforeDrift = await hud.requestProjection(projectionRequest(), sender);
    driftAfterRefresh = driftField;
    const beforeTabs = openedTabs.length;
    const response = await hud.citationOpen(citationRequest(
      beforeDrift.projectionToken,
      beforeDrift.body.governingAction.actionToken
    ), sender);
    assert.deepStrictEqual(response, Object.freeze({ success: false, status: 'closed' }),
      `${driftField} drift closes before the effect`);
    assert.strictEqual(openedTabs.length, beforeTabs, `${driftField} drift opens no tab`);
    driftAfterRefresh = null;
  }

  activeBinding = mutableBinding();
  projectionLabel = '<img src=x onerror=alert(1)>';
  const hostile = await hud.requestProjection(projectionRequest(), sender);
  assert.strictEqual(hostile, null, 'hostile projected metadata fails closed at the HUD schema boundary');
  projectionLabel = 'Vendor agreement';

  extraHiddenActions = 11;
  activeBinding = mutableBinding();
  const overflowed = await hud.requestProjection(projectionRequest(), sender);
  assert.ok(overflowed && overflowed.body && overflowed.body.governingAction,
    'eleven extra private bindings still admit the bounded public projection');
  assert.strictEqual(overflowed.body.facts.length <= 10, true,
    'public reading facts remain at the documented cap');
  extraHiddenActions = 0;

  evaluationOverride = Object.freeze({
    status: 'review-required',
    blockerCodes: Object.freeze(['timezone-missing'])
  });
  activeBinding = mutableBinding();
  const closedForTimezone = await hud.requestProjection(projectionRequest(), sender);
  assert.ok(closedForTimezone, 'admitted timezone-missing still returns a HUD envelope');
  assert.strictEqual(closedForTimezone.mode, 'contract-closed');
  assert.strictEqual(closedForTimezone.currentness, 'closed');
  assert.strictEqual(closedForTimezone.body.reason, 'evaluation-context-missing');
  evaluationOverride = null;

  activeBinding = mutableBinding({
    mode: 'folder',
    sourceFileIds: Object.freeze([]),
    exactTuple: Object.freeze({
      tabId: 17,
      generation: 7,
      origin: 'https://drive.google.com',
      profileId: 'drive',
      profileVersion: 'profile-v7',
      contextEpoch: 11,
      entityKind: 'folder',
      entityId: 'raw-drive-folder'
    })
  });
  const emptyFolder = await hud.requestProjection(projectionRequest(), sender);
  assert.ok(emptyFolder, 'a complete empty enrolled folder still admits a HUD');
  assert.strictEqual(emptyFolder.mode, 'folder');
  assert.strictEqual(emptyFolder.result, 'empty');
  assert.strictEqual(emptyFolder.body.emptyState, 'complete-empty');
  assert.strictEqual(emptyFolder.body.vendorCount, 0);

  activeBinding = mutableBinding();
  const staleStart = { ...activeBinding };
  let releaseTruth;
  const truthGate = new Promise((resolve) => { releaseTruth = resolve; });
  const staleDependencies = Object.freeze({
    ...dependencies,
    async ensureTruth() { await truthGate; return Object.freeze({ status: 'current' }); }
  });
  const staleHud = createController(staleDependencies);
  const lateProjection = staleHud.requestProjection(projectionRequest(), sender);
  await new Promise((resolve) => setImmediate(resolve));
  activeBinding = { ...staleStart, revisionDigest: 'revision-after-await' };
  releaseTruth();
  assert.strictEqual(await lateProjection, null, 'late projection completion is inert after revision drift');

  const invalidProjectionMessages = [
    { ...projectionRequest(), action: 'skopeo:hud-projection-other' },
    { ...projectionRequest(), generation: 8 },
    { ...projectionRequest(), exactOrigin: 'https://docs.google.com' },
    { ...projectionRequest(), profileVersion: 'profile-v8' },
    { ...projectionRequest(), contextEpoch: 12 },
    { ...projectionRequest(), semanticEntityToken: 'entity-token-8' },
    { ...projectionRequest(), actionToken: 'request-token-8' },
    { ...projectionRequest(), mode: 'reading' },
    { ...projectionRequest(), extra: true }
  ];
  for (const key of [
    'action', 'generation', 'exactOrigin', 'profileVersion', 'contextEpoch',
    'semanticEntityToken', 'actionToken'
  ]) {
    invalidProjectionMessages.push(withoutKey(projectionRequest(), key));
  }
  activeBinding = mutableBinding();
  for (const invalid of invalidProjectionMessages) {
    assert.strictEqual(await hud.requestProjection(invalid, sender), null,
      'tuple/entity/action/mode drift or extra input fails closed');
  }

  assert.deepStrictEqual(operations.map((operation) => operation.kind).filter((kind) => kind === 'citation-open').length,
    openedTabs.length + 5,
    'citation operations cover one admitted action plus five post-refresh drift closures');
  assert.strictEqual(JSON.stringify({ success: true, status: 'opened' }).includes('fresh-governing-source'), false,
    'citation acknowledgement carries no URL or authority identifier');
}

async function testAskControllerRuntime(backgroundSource) {
  const AskSchema = require(ASK_SCHEMA_PATH);
  const HudSchema = require(HUD_SCHEMA_PATH);
  delete require.cache[require.resolve(HUD_PROJECTOR_PATH)];
  const HudProjector = require(HUD_PROJECTOR_PATH);
  const createController = loadHudControllerFactory(backgroundSource);
  const sender = Object.freeze({
    id: 'extension-id', frameId: 0,
    tab: Object.freeze({ id: 17, url: 'https://drive.google.com/file/d/private-file/view' })
  });
  let activeBinding = mutableBinding();
  let tokenCounter = 0;
  let askGate = null;
  let askCalls = 0;
  let policyScenario = 'none';
  let policyCommits = 0;
  const operations = [];
  const openedTabs = [];

  function citedAnswer(actionId) {
    return AskSchema.parseCitedAnswer({
      outcome: 'answered',
      evidenceComplete: true,
      conclusion: 'The current agreement requires 90 days notice.',
      trust: {
        state: 'accepted',
        explanation: 'The complete current governing evidence supports this conclusion.'
      },
      governingEvidence: [{
        claim: 'Notice period', value: '90 days', trustState: 'accepted',
        citation: { label: 'Section 12, page 9', actionToken: actionId }
      }],
      historyEvidence: [{
        claim: 'Prior notice practice', value: '60 days in 2024', trustState: 'extracted',
        citation: { label: '2024 notice, page 2', actionToken: 'answer-history-action' }
      }],
      conflicts: [], gaps: [],
      sources: [{
        label: 'Section 12, page 9', evidenceRole: 'governing', actionToken: actionId
      }, {
        label: '2024 notice, page 2', evidenceRole: 'history',
        actionToken: 'answer-history-action'
      }],
      sourceOverflow: 0
    });
  }

  function policyInput(documentState = 'current') {
    return AskSchema.parsePolicyInput({
      decisionKind: 'cited-contract-decision',
      authority: {
        accountKey: 'private-account-A',
        corpusKey: 'private-corpus-A',
        agreementKey: 'private-agreement-A',
        sourceSetDigest: 'private-policy-source-digest-A',
        revisionDigest: 'private-policy-revision-digest-A'
      },
      document10: {
        configuredFileKey: documentState === 'missing'
          ? 'policy-document-10-unconfigured'
          : 'raw-source-file-A',
        currentRevisionKey: documentState === 'current' ? 'revision-A' : null,
        state: documentState
      },
      classification: 'routine',
      memoProof: null,
      governingConflict: false
    });
  }

  function publicPolicy(documentState, reviewed) {
    return Object.freeze({
      clearance: reviewed ? 'cleared' : 'blocked',
      applicable: true,
      decisionDigest: 'private-decision-digest',
      reasons: Object.freeze(reviewed ? [] : [
        documentState === 'missing' ? 'document-10-missing' : 'document-10-unreviewed'
      ]),
      document10: Object.freeze({ state: documentState, reviewed })
    });
  }

  function policyBinding(actionId, label, requiresConfirmation, input, source = null) {
    return Object.freeze({
      actionId, label, requiresConfirmation, policyInput: input, source
    });
  }

  function reviewSource() {
    return Object.freeze({
      familyId: 'raw-family-A', citationId: 'raw-citation-A',
      sourceFileId: 'raw-source-file-A', sourceRevision: 'revision-A',
      contentFingerprint: 'fingerprint-A', truthGenerationId: 'truth-generation-A',
      evaluationContextDigest: 'evaluation-digest-A'
    });
  }

  function policyBundle(stage = 'initial') {
    if (policyScenario === 'none') {
      return Object.freeze({
        policy: publicPolicy('current', false),
        policyActions: Object.freeze([]),
        policyActionBindings: Object.freeze([])
      });
    }
    if (policyScenario === 'review') {
      const reviewed = stage === 'acknowledged';
      const actionId = stage === 'opened' ? 'policy-ack-action' : 'policy-review-action';
      const label = stage === 'opened'
        ? 'acknowledge-document-10'
        : 'review-document-10';
      const actions = reviewed ? [] : [Object.freeze({
        actionId, label, requiresConfirmation: false
      })];
      const bindings = reviewed ? [] : [policyBinding(
        actionId,
        label,
        false,
        policyInput('current'),
        stage === 'opened' ? null : reviewSource()
      )];
      return Object.freeze({
        policy: publicPolicy('current', reviewed),
        policyActions: Object.freeze(actions),
        policyActionBindings: Object.freeze(bindings)
      });
    }
    const configured = stage === 'committed';
    const actionId = 'policy-configure-action';
    return Object.freeze({
      policy: publicPolicy(configured ? 'current' : 'missing', false),
      policyActions: Object.freeze(configured ? [] : [Object.freeze({
        actionId,
        label: 'configure-document-10',
        requiresConfirmation: true
      })]),
      policyActionBindings: Object.freeze(configured ? [] : [policyBinding(
        actionId,
        'configure-document-10',
        true,
        policyInput('missing')
      )])
    });
  }

  const dependencies = Object.freeze({
    hudSchema: HudSchema,
    askSchema: AskSchema,
    randomToken(kind) {
      tokenCounter += 1;
      return `${kind}-opaque-${tokenCounter}`;
    },
    async resolveCurrentBinding(_message, candidateSender) {
      return candidateSender === sender && activeBinding ? { ...activeBinding } : null;
    },
    async buildEvaluationContext() {
      return Object.freeze({ civilDate: '2026-08-27', digest: 'evaluation-digest-A' });
    },
    async ensureTruth() {
      return Object.freeze({ status: 'current', outputGenerationId: 'truth-generation-A' });
    },
    async buildProjection(args) {
      const actionId = args.mintActionId();
      const scopeToken = args.mintScopeToken();
      return Object.freeze({
        projection: readingProjection(
          args.binding, args.projectionToken, actionId, 'Vendor agreement', scopeToken
        ),
        actions: Object.freeze([Object.freeze({
          actionId,
          familyId: 'raw-family-A', citationId: 'raw-citation-A',
          sourceFileId: 'raw-source-file-A', sourceRevision: 'revision-A',
          contentFingerprint: 'fingerprint-A', truthGenerationId: 'truth-generation-A',
          evaluationContextDigest: 'evaluation-digest-A'
        })]),
        scopes: Object.freeze([Object.freeze({
          scopeToken, kind: 'agreement', label: 'Current agreement',
          scopeDigest: 'scope-digest-A',
          sourceFileIds: Object.freeze(['raw-source-file-A'])
        })])
      });
    },
    async runAsk(args) {
      askCalls += 1;
      assert.deepStrictEqual(Object.keys(args).sort(), [
        'askSignal', 'binding', 'certificates', 'operationSignal', 'proof',
        'question', 'requestToken', 'scope'
      ]);
      assert.deepStrictEqual(args.scope.sourceFileIds, ['raw-source-file-A'],
        'opaque agreement scope resolves to exactly its certified source set');
      assert.equal(args.scope.scopeDigest, 'scope-digest-A');
      assert.deepStrictEqual({ ...args.question }, { text: 'What notice period governs?' });
      if (askGate) await askGate.promise;
      if (args.askSignal.aborted || args.operationSignal.aborted) return null;
      const policy = policyBundle();
      return Object.freeze({
        answer: citedAnswer('answer-source-action'),
        policy: policy.policy,
        actions: Object.freeze([Object.freeze({
          actionId: 'answer-source-action',
          familyId: 'raw-family-A', citationId: 'raw-citation-A',
          sourceFileId: 'raw-source-file-A', sourceRevision: 'revision-A',
          contentFingerprint: 'fingerprint-A', truthGenerationId: 'truth-generation-A',
          evaluationContextDigest: 'evaluation-digest-A'
        }), Object.freeze({
          actionId: 'answer-history-action',
          familyId: 'raw-family-A', citationId: 'raw-citation-history',
          sourceFileId: 'raw-source-file-A', sourceRevision: 'revision-A',
          contentFingerprint: 'fingerprint-A', truthGenerationId: 'truth-generation-A',
          evaluationContextDigest: 'evaluation-digest-A'
        })]),
        policyActions: policy.policyActions,
        policyActionBindings: policy.policyActionBindings
      });
    },
    buildAskProjection(args) {
      return HudProjector.createProjection({
        mode: 'answer',
        question: args.question,
        scope: args.scope,
        answer: args.answer,
        policy: args.policy,
        policyActions: args.policyActions,
        authority: args.authority
      });
    },
    refreshPolicy(args) {
      if (policyScenario === 'review') {
        return policyBundle(args.acknowledgement
          ? 'acknowledged'
          : args.reviewOpen ? 'opened' : 'initial');
      }
      return policyBundle(policyCommits > 0 ? 'committed' : 'initial');
    },
    openPolicyReview(input) {
      assert.ok(AskSchema.parsePolicyInput(input), 'review consumes a parsed private policy input');
      return Object.freeze({
        decisionDigest: 'private-decision-digest',
        documentFileKey: 'raw-source-file-A',
        documentRevisionKey: 'revision-A'
      });
    },
    acknowledgePolicyReview(input, opened) {
      assert.ok(AskSchema.parsePolicyInput(input),
        'acknowledgement consumes a parsed private policy input');
      return opened && opened.documentRevisionKey === 'revision-A'
        ? Object.freeze({ ...opened })
        : null;
    },
    async commitPolicyAction(args) {
      assert.equal(args.action.label, 'configure-document-10');
      policyCommits += 1;
      return true;
    },
    async refreshCitation(args) {
      assert.equal(args.action.sourceFileId, 'raw-source-file-A');
      return Object.freeze({
        canonicalUrl: 'https://docs.google.com/document/d/raw-source-file-A/edit',
        familyId: args.action.familyId,
        citationId: args.action.citationId,
        sourceRevision: args.action.sourceRevision,
        contentFingerprint: args.action.contentFingerprint,
        truthGenerationId: args.action.truthGenerationId,
        evaluationContextDigest: args.action.evaluationContextDigest
      });
    },
    chrome: Object.freeze({
      tabs: Object.freeze({
        async create(options) {
          openedTabs.push(options.url);
          return true;
        }
      })
    }),
    async runCorpusOperation(kind, exactTuple, selection, callback, commitCallback) {
      operations.push({ kind, exactTuple, selection });
      assert.deepStrictEqual(selection, { sourceFileIds: ['raw-source-file-A'] });
      if (kind === 'citation-open') {
        const prepared = await callback(
          Object.freeze([{ sourceFileId: 'raw-source-file-A' }]),
          Object.freeze({ complete: true }),
          Object.freeze({ aborted: false })
        );
        const value = await commitCallback(prepared, Object.freeze({
          publish: async (effect) => effect(Object.freeze({ aborted: false }))
        }));
        return Object.freeze({ decision: 'admitted', value });
      }
      assert.ok(kind === 'display' || kind === 'query');
      const aggregate = await callback(
        Object.freeze([{ sourceFileId: 'raw-source-file-A' }]),
        Object.freeze({ complete: true }),
        Object.freeze({ aborted: false })
      );
      return Object.freeze({ decision: 'admitted', aggregate: aggregate.aggregate });
    }
  });

  const hud = createController(dependencies);
  const initial = await hud.requestProjection(projectionRequest(), sender);
  assert.ok(initial && initial.body.askScopes.length === 1,
    'current reading projection exposes one explicit certified agreement scope');
  const scopeToken = initial.body.askScopes[0].scopeToken;
  const request = askRequest(initial.projectionToken, scopeToken, 'What notice period governs?');

  for (const key of [
    'action', 'generation', 'exactOrigin', 'profileVersion', 'contextEpoch',
    'semanticEntityToken', 'projectionToken', 'scopeToken', 'question'
  ]) {
    assert.deepStrictEqual(await hud.ask(withoutKey(request, key), sender), null,
      `ask missing ${key} fails closed`);
  }
  assert.deepStrictEqual(await hud.ask({ ...request, sourceFileId: 'caller-file' }, sender), null,
    'caller-supplied source authority fails closed');
  assert.deepStrictEqual(await hud.ask({ ...request, scopeToken: 'scope-foreign' }, sender), null,
    'cross-scope token fails closed');
  assert.deepStrictEqual(await hud.ask(request, Object.freeze({
    ...sender, tab: Object.freeze({ id: 18 })
  })), null, 'cross-tab ask fails closed');
  assert.equal(askCalls, 0, 'invalid asks start no query/provider work');

  const answer = await hud.ask(request, sender);
  assert.ok(HudSchema.parseProjection(answer), 'answer is a closed HUD projection');
  assert.equal(answer.mode, 'answer');
  assert.equal(answer.body.answer.outcome, 'answered');
  assert.equal(answer.body.policy.clearance, 'blocked',
    'answer outcome and deterministic policy clearance remain separate');
  assert.equal(answer.body.answer.governingEvidence[0].citationLabel, 'Section 12, page 9');
  assert.equal(answer.body.answer.historyEvidence[0].citationLabel, '2024 notice, page 2');
  assert.equal(JSON.stringify(answer).includes('private-decision-digest'), false,
    'private decision digest does not cross the projection boundary');
  assertNoHudAuthorityKeys(answer, 'ask answer projection');
  assert.equal(operations.filter((operation) => operation.kind === 'query').length, 1,
    'one admitted ask starts one exact query operation');

  const replacement = await hud.requestProjection(projectionRequest(), sender);
  const replacementScope = replacement.body.askScopes[0].scopeToken;
  askGate = deferred();
  const pending = hud.ask(askRequest(
    replacement.projectionToken,
    replacementScope,
    'What notice period governs?'
  ), sender);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(await hud.cancelAsk(askCancelRequest(replacement.projectionToken), sender),
    Object.freeze({ success: true, status: 'cancelled' }),
    'current cancel aborts the one pending ask');
  askGate.resolve();
  assert.strictEqual(await pending, null, 'cancelled late provider completion publishes nothing');
  assert.deepStrictEqual(await hud.cancelAsk(askCancelRequest(replacement.projectionToken), sender),
    Object.freeze({ success: false, status: 'closed' }),
    'cancel is current and one-shot');

  const driftProjection = await hud.requestProjection(projectionRequest(), sender);
  const driftScope = driftProjection.body.askScopes[0].scopeToken;
  askGate = deferred();
  const drifted = hud.ask(askRequest(
    driftProjection.projectionToken,
    driftScope,
    'What notice period governs?'
  ), sender);
  await new Promise((resolve) => setImmediate(resolve));
  activeBinding = { ...activeBinding, revisionDigest: 'revision-after-provider' };
  askGate.resolve();
  assert.strictEqual(await drifted, null,
    'revision drift after provider completion publishes no stale answer');

  askGate = null;
  activeBinding = mutableBinding();
  policyScenario = 'review';
  const reviewBase = await hud.requestProjection(projectionRequest(), sender);
  const reviewAnswer = await hud.ask(askRequest(
    reviewBase.projectionToken,
    reviewBase.body.askScopes[0].scopeToken,
    'What notice period governs?'
  ), sender);
  assert.deepStrictEqual(reviewAnswer.body.policyActions.map((action) => action.label),
    ['review-document-10'], 'current Document 10 exposes only an opaque review action');
  const reviewAction = reviewAnswer.body.policyActions[0];
  const reviewMessage = answerActionRequest(reviewAnswer.projectionToken, reviewAction.actionId);
  for (const key of [
    'action', 'generation', 'exactOrigin', 'profileVersion', 'contextEpoch',
    'semanticEntityToken', 'projectionToken', 'actionId'
  ]) {
    assert.deepStrictEqual(await hud.answerAction(withoutKey(reviewMessage, key), sender),
      Object.freeze({ success: false, status: 'closed' }),
      `policy source action missing ${key} fails closed`);
  }
  assert.deepStrictEqual(await hud.answerAction(reviewMessage, Object.freeze({
    ...sender, tab: Object.freeze({ id: 18 })
  })), Object.freeze({ success: false, status: 'closed' }),
  'cross-tab policy source action fails closed');
  const afterReview = await hud.answerAction(reviewMessage, sender);
  assert.ok(HudSchema.parseProjection(afterReview),
    'successful current Document 10 open rebuilds a closed answer projection');
  assert.deepStrictEqual(afterReview.body.policyActions.map((action) => action.label),
    ['acknowledge-document-10'],
    'acknowledgement appears only after the current Document 10 source opens');
  assert.equal(openedTabs.length, 1, 'review opens one current canonical source tab');
  assert.deepStrictEqual(await hud.answerAction(reviewMessage, sender),
    Object.freeze({ success: false, status: 'closed' }),
    'review action cannot replay across the refreshed projection');
  const acknowledge = afterReview.body.policyActions[0];
  const afterAcknowledge = await hud.answerAction(answerActionRequest(
    afterReview.projectionToken, acknowledge.actionId
  ), sender);
  assert.ok(HudSchema.parseProjection(afterAcknowledge),
    'current acknowledgement rebuilds a closed answer projection');
  assert.equal(afterAcknowledge.body.policy.clearance, 'cleared',
    'current review plus explicit acknowledgement deterministically clears policy');
  assert.equal(afterAcknowledge.body.answer.outcome, 'answered',
    'policy refresh preserves the distinct informational answer state');
  assert.equal(JSON.stringify(afterAcknowledge).includes('private-decision-digest'), false,
    'review and acknowledgement never expose the private decision digest');

  activeBinding = mutableBinding();
  policyScenario = 'configure';
  policyCommits = 0;
  const configurationBase = await hud.requestProjection(projectionRequest(), sender);
  const configurationAnswer = await hud.ask(askRequest(
    configurationBase.projectionToken,
    configurationBase.body.askScopes[0].scopeToken,
    'What notice period governs?'
  ), sender);
  const configure = configurationAnswer.body.policyActions[0];
  assert.equal(configure.label, 'configure-document-10');
  const consequence = await hud.answerAction(answerActionRequest(
    configurationAnswer.projectionToken, configure.actionId
  ), sender);
  assert.deepStrictEqual(Object.keys(consequence).sort(), [
    'confirmationToken', 'consequence', 'status', 'success'
  ], 'local policy writes expose only a bounded consequence and opaque confirmation token');
  assert.deepStrictEqual(Object.keys(consequence.consequence).sort(), ['detail', 'effect', 'title']);
  assert.equal(consequence.consequence.effect, 'local-policy-write');
  assertNoHudAuthorityKeys(consequence, 'policy consequence');
  const confirmMessage = answerConfirmRequest(
    configurationAnswer.projectionToken, configure.actionId, consequence.confirmationToken
  );
  for (const key of [
    'action', 'generation', 'exactOrigin', 'profileVersion', 'contextEpoch',
    'semanticEntityToken', 'projectionToken', 'actionId', 'confirmationToken'
  ]) {
    assert.deepStrictEqual(await hud.confirmAnswerAction(withoutKey(confirmMessage, key), sender),
      Object.freeze({ success: false, status: 'closed' }),
      `policy confirmation missing ${key} fails closed`);
  }
  assert.deepStrictEqual(await hud.confirmAnswerAction({
    ...confirmMessage, effect: 'caller-selected-effect'
  }, sender), Object.freeze({ success: false, status: 'closed' }),
  'caller-selected policy effect fails the exact confirmation shape');
  assert.deepStrictEqual(await hud.confirmAnswerAction(answerConfirmRequest(
    configurationAnswer.projectionToken, configure.actionId, 'confirmation-wrong'
  ), sender), Object.freeze({ success: false, status: 'closed' }),
  'wrong confirmation token cannot write policy state');
  assert.equal(policyCommits, 0, 'wrong confirmation has zero durable effect');
  const afterConfiguration = await hud.confirmAnswerAction(confirmMessage, sender);
  assert.ok(HudSchema.parseProjection(afterConfiguration),
    'confirmed current configuration rebuilds the policy projection');
  assert.equal(policyCommits, 1, 'one exact confirmation performs one local policy write');
  assert.equal(afterConfiguration.body.policy.document10.state, 'current');
  assert.deepStrictEqual(await hud.confirmAnswerAction(answerConfirmRequest(
    configurationAnswer.projectionToken, configure.actionId, consequence.confirmationToken
  ), sender), Object.freeze({ success: false, status: 'closed' }),
  'confirmed local policy action cannot replay');
  assert.equal(policyCommits, 1, 'replay performs no second local policy write');
}

const CONTENT_RUNTIME_START = '/* FSB_SKOPEO_CONTRACT_RUNTIME_START */';
const CONTENT_RUNTIME_END = '/* FSB_SKOPEO_CONTRACT_RUNTIME_END */';
const CONTENT_RESOURCE_KEYS = Object.freeze([
  'roots', 'listeners', 'observers', 'timeouts', 'intervals', 'animationFrames',
  'animations', 'focusHooks', 'pointerSurfaces', 'pendingRenders', 'popoverTopLayer'
]);

function contentZeroResources() {
  return Object.freeze(Object.fromEntries(CONTENT_RESOURCE_KEYS.map(key => [key, 0])));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushContentRuntime() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

function contentEntityForUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  let match = parsed.pathname.match(/\/folders\/([A-Za-z0-9._:-]+)/);
  if (parsed.origin === 'https://drive.google.com' && match) {
    return { kind: 'drive-folder', id: match[1], label: 'Current vendor folder' };
  }
  match = parsed.pathname.match(/\/file\/d\/([A-Za-z0-9._:-]+)/);
  if (parsed.origin === 'https://drive.google.com' && match) {
    return { kind: 'drive-file', id: match[1], label: 'Current agreement' };
  }
  match = parsed.pathname.match(/\/document\/d\/([A-Za-z0-9._:-]+)/);
  if (parsed.origin === 'https://docs.google.com' && match) {
    return { kind: 'docs-document', id: match[1], label: 'Current agreement' };
  }
  return null;
}

function contentProjection(message, mode = 'reading', overrides = {}) {
  const base = {
    version: 'skopeo-hud-projection/1',
    generation: message.generation,
    exactOrigin: message.exactOrigin,
    profileVersion: message.profileVersion,
    contextEpoch: message.contextEpoch,
    semanticEntityToken: message.semanticEntityToken,
    requestActionToken: message.actionToken,
    projectionToken: 'projection-' + message.actionToken,
    mode,
    currentness: mode === 'contract-closed' ? 'closed' : 'current',
    result: mode === 'contract-closed' ? 'closed' : 'complete',
    body: null
  };
  if (mode === 'folder') {
    base.result = 'empty';
    base.body = {
      manifestState: 'complete', vendorCount: 0, vendors: [], vendorOverflow: 0,
      nextMaterialDates: [], nextMaterialDateOverflow: 0,
      urgentGaps: [], urgentGapOverflow: 0, emptyState: 'complete-empty'
    };
  } else if (mode === 'reading') {
    base.body = {
      documentLabel: 'Current agreement', sourceState: 'ready', readingState: 'review-required',
      governingAction: { state: 'clause', actionToken: 'primary-action-opaque' },
      facts: [
        {
          type: 'effective', value: 'Effective January 1, 2026', evidenceRole: 'governing',
          trustState: 'accepted', citationLabel: 'Section 2, page 3',
          actionToken: 'effective-action-opaque'
        },
        {
          type: 'renewal', value: 'Renews July 1, 2027', evidenceRole: 'governing',
          trustState: 'extracted', citationLabel: 'Section 8, page 9',
          actionToken: 'renewal-action-opaque'
        }
      ],
      factOverflow: 0,
      gaps: [{ type: 'version-conflict', priority: 'urgent' }],
      gapOverflow: 0,
      policyDocument: 'not-evaluated', memoRequirement: 'not-evaluated',
      notificationDelivery: 'not-available', emptyState: 'not-empty'
    };
  } else {
    base.body = { reason: 'access-unavailable' };
  }
  return Object.assign(base, overrides);
}

function contentScopedProjection(message, mode = 'reading') {
  const projection = contentProjection(message, mode);
  projection.body.askScopes = mode === 'folder'
    ? [
      { kind: 'corpus', label: 'Enrolled accessible corpus', scopeToken: 'scope-corpus-opaque' },
      { kind: 'vendor', label: 'Acme', scopeToken: 'scope-vendor-opaque' }
    ]
    : [{
      kind: 'agreement', label: 'Current agreement · Acme', scopeToken: 'scope-agreement-opaque'
    }];
  return projection;
}

function contentAnswerProjection(message, requestActionToken, suffix = 'one', overrides = {}) {
  const body = {
    question: message.question.text,
    scope: {
      kind: 'agreement', label: 'Current agreement · Acme',
      scopeToken: 'scope-answer-' + suffix + '-opaque'
    },
    answer: {
      outcome: 'answered', evidenceComplete: true,
      conclusion: 'The agreement renews on July 1, 2027.',
      trust: { state: 'accepted', explanation: 'Current governing evidence supports this conclusion.' },
      governingEvidence: [{
        claim: 'Renewal date', value: 'July 1, 2027', trustState: 'accepted',
        citationLabel: 'Section 8, page 9', actionToken: 'answer-governing-' + suffix + '-opaque'
      }],
      historyEvidence: [], conflicts: [], gaps: [],
      sources: [{
        label: 'Section 8, page 9', evidenceRole: 'governing',
        actionToken: 'answer-governing-' + suffix + '-opaque'
      }],
      sourceOverflow: 0
    },
    policy: {
      clearance: 'cleared', reasons: [],
      document10: { state: 'current', reviewed: true }
    },
    policyActions: []
  };
  Object.assign(body, overrides);
  return {
    version: 'skopeo-hud-projection/1',
    generation: message.generation,
    exactOrigin: message.exactOrigin,
    profileVersion: message.profileVersion,
    contextEpoch: message.contextEpoch,
    semanticEntityToken: message.semanticEntityToken,
    requestActionToken,
    projectionToken: 'projection-answer-' + suffix + '-opaque',
    mode: 'answer', currentness: 'current', result: 'complete', body
  };
}

function createContentRuntimeHarness(options = {}) {
  const initialUrl = options.url || 'https://docs.google.com/document/d/agreement-A/edit';
  const document = new MockDocument({ popoverSupported: false });
  const window = new MockWindow(document);
  document.defaultView = window;
  window.location = { href: initialUrl };
  const operations = [];
  const messages = [];
  const shells = [];
  const runtimeListeners = [];
  let contextEpoch = 0;
  let hudResponseIndex = 0;
  const realComposer = require(COMPOSER_PATH);

  const chrome = {
    runtime: {
      id: 'skopeo-content-runtime-test',
      onMessage: {
        addListener(listener) { runtimeListeners.push(listener); },
        removeListener(listener) {
          const index = runtimeListeners.indexOf(listener);
          if (index >= 0) runtimeListeners.splice(index, 1);
        }
      },
      sendMessage(message) {
        const cloned = JSON.parse(JSON.stringify(message));
        messages.push(cloned);
        operations.push('send:' + cloned.action);
        if (cloned.action === 'skopeo:hud-projection') {
          const response = (options.hudResponses || [])[hudResponseIndex++];
          if (response && response.promise) return response.promise;
          if (typeof response === 'function') return Promise.resolve(response(cloned));
          return Promise.resolve(response === undefined ? null : response);
        }
        if (cloned.action === 'skopeo:hud-citation-open') {
          if (typeof options.citationResponder === 'function') {
            return Promise.resolve(options.citationResponder(cloned));
          }
          return Promise.resolve({ success: true, status: 'opened' });
        }
        if (cloned.action === 'skopeo:hud-ask') {
          if (typeof options.askResponder === 'function') {
            const response = options.askResponder(cloned);
            return response && response.promise ? response.promise : Promise.resolve(response);
          }
          return Promise.resolve(null);
        }
        if (cloned.action === 'skopeo:hud-ask-cancel') {
          return Promise.resolve({ success: true, status: 'cancelled' });
        }
        if (cloned.action === 'skopeo:hud-answer-action') {
          if (typeof options.answerActionResponder === 'function') {
            const response = options.answerActionResponder(cloned);
            return response && response.promise ? response.promise : Promise.resolve(response);
          }
          return Promise.resolve({ success: true, status: 'opened' });
        }
        if (cloned.action === 'skopeo:hud-answer-action-confirm') {
          if (typeof options.answerConfirmResponder === 'function') {
            const response = options.answerConfirmResponder(cloned);
            return response && response.promise ? response.promise : Promise.resolve(response);
          }
          return Promise.resolve(null);
        }
        if (cloned.action === 'skopeo:hud-alert-action') {
          if (typeof options.alertActionResponder === 'function') {
            const response = options.alertActionResponder(cloned);
            return response && response.promise ? response.promise : Promise.resolve(response);
          }
          return Promise.resolve({ success: false, status: 'closed' });
        }
        if (cloned.action === 'skopeo:hud-alert-action-confirm') {
          if (typeof options.alertConfirmResponder === 'function') {
            const response = options.alertConfirmResponder(cloned);
            return response && response.promise ? response.promise : Promise.resolve(response);
          }
          return Promise.resolve({ success: false, status: 'closed' });
        }
        return Promise.resolve(null);
      }
    }
  };

  function createShell(shellOptions) {
    const shell = {
      shellOptions,
      renderedContracts: [],
      contractCallbacks: [],
      renderedAsks: [],
      askCallbacks: [],
      renderedConfirmations: [],
      confirmationCallbacks: [],
      withdrawals: 0,
      destroyed: false,
      prepareAmbient() {
        operations.push('prepare-ambient');
        return options.geometryUnsafe ? null : Object.freeze({ prepared: true });
      },
      getPreparedPlacementMode(token) {
        return token && !options.geometryUnsafe ? 'full' : null;
      },
      mountAmbient() { operations.push('mount-ambient'); return !options.geometryUnsafe; },
      projectContext() { return true; },
      renderAdaptive() { return true; },
      renderCorpus() {
        operations.push('render-corpus');
        this.corpusRenders = (this.corpusRenders || 0) + 1;
        return true;
      },
      renderContractView(model, onAction) {
        operations.push('render-contract:' + model.mode);
        this.renderedContracts.push(JSON.parse(JSON.stringify(model)));
        this.contractCallbacks.push(onAction);
        return true;
      },
      renderContractAsk(model, onAction) {
        operations.push('render-contract-ask:' + model.mode);
        this.renderedAsks.push(JSON.parse(JSON.stringify(model)));
        this.askCallbacks.push(onAction);
        return true;
      },
      renderContractConfirmation(model, onAction) {
        operations.push('render-contract-confirmation');
        this.renderedConfirmations.push(JSON.parse(JSON.stringify(model)));
        this.confirmationCallbacks.push(onAction);
        return true;
      },
      withdrawCorpus() {
        operations.push('withdraw-contract');
        this.withdrawals += 1;
        return true;
      },
      hideContract() {
        if (typeof this.shellOptions.onContractWithdraw === 'function') {
          return this.shellOptions.onContractWithdraw('hide');
        }
        return this.withdrawCorpus();
      },
      withdrawSemanticAnchor() { return true; },
      getResourceSnapshot() { return contentZeroResources(); },
      destroy() {
        operations.push('destroy-shell');
        this.destroyed = true;
        return contentZeroResources();
      },
      back() { return true; },
      getSnapshot() { return { attention: 'ambient' }; }
    };
    shells.push(shell);
    return shell;
  }

  const routerFactory = Object.freeze({
    createRouter() {
      return {
        route(input) {
          contextEpoch += 1;
          const entity = contentEntityForUrl(input.url);
          const status = options.routeStatus || (entity ? 'recognized' : 'unsupported');
          if (status !== 'recognized') {
            return Object.freeze({
              status, contextEpoch, reason: status + '-context', semanticIdentity: null
            });
          }
          return Object.freeze({
            status: 'recognized',
            contextKind: entity && entity.kind === 'drive-folder' ? 'vendor-folder' : 'agreement-reading',
            contextEpoch,
            semanticIdentity: entity ? Object.freeze({ kind: entity.kind, id: entity.id }) : null,
            reason: entity ? null : 'semantic-identity-uncertain'
          });
        },
        dispose() {}
      };
    }
  });

  const resolverFactory = Object.freeze({
    createResolver(settings) {
      return {
        resolve(input) {
          const rawEntity = contentEntityForUrl(input.url);
          const entity = options.semanticUncertain ? null : rawEntity;
          const status = options.contextStatus || 'recognized';
          if (status !== 'recognized') return Object.freeze({ status, contextEpoch });
          return Object.freeze({
            status: 'recognized',
            generation: settings.generation,
            exactOrigin: settings.projection.exactOrigin,
            profileId: settings.projection.profileId,
            profileVersion: settings.projection.profileVersion,
            contextEpoch,
            app: Object.freeze({
              appStem: 'gdrive', service: new URL(input.url).host,
              displayName: 'Google Drive', pageNoun: 'view'
            }),
            genre: 'drive-docs-deep-pack',
            lens: 'app-actions',
            semanticEntity: entity && Object.freeze(entity),
            anchorDescriptor: null,
            capabilityGroups: Object.freeze([]),
            risk: Object.freeze({ highest: 'read', readCount: 0, writeCount: 0, destructiveCount: 0 }),
            reason: entity ? null : 'no-stable-entity',
            evidence: Object.freeze([])
          });
        },
        dispose() {}
      };
    },
    validateResult(value) { return !!value && value.status === 'recognized'; }
  });

  const composerFacade = Object.freeze({
    compose() { return Object.freeze({ attention: 'ambient' }); },
    composeCorpus() { return null; },
    composeContractView(projection) {
      operations.push('compose-contract:' + (projection && projection.mode));
      return realComposer.composeContractView(JSON.parse(JSON.stringify(projection)));
    },
    validateContractViewModel: realComposer.validateContractViewModel,
    composeContractAsk(projection) {
      operations.push('compose-contract-ask:' + (projection && projection.mode));
      return realComposer.composeContractAsk(JSON.parse(JSON.stringify(projection)));
    },
    validateContractAskModel: realComposer.validateContractAskModel
  });

  const sandbox = {
    window,
    document,
    chrome,
    URL,
    AbortController,
    Promise,
    Date,
    console,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout
  };
  sandbox.globalThis = window;
  window.window = window;
  window.document = document;
  window.chrome = chrome;
  window.URL = URL;
  window.AbortController = AbortController;
  window.FsbSkopeoCapabilityProjector = Object.freeze({ validateProjection() { return true; } });
  window.FSBSkopeoContextRouter = routerFactory;
  window.FSBSkopeoAppContextResolver = resolverFactory;
  window.FSBSkopeoAnchorRegistry = Object.freeze({
    BINDING_REASON: Object.freeze({ manual: 'manual' }),
    createRegistry() { throw new Error('contract content fixture has no row anchors'); }
  });
  window.FSBSkopeoAdapterRegistry = Object.freeze({ resolve() { return Object.freeze({}); } });
  window.FSBSkopeoAdaptiveComposer = composerFacade;
  window.FSBSkopeoRendererRegistry = Object.freeze({ render() { return []; }, validateAtoms() { return true; } });
  window.FSBSkopeoShell = Object.freeze({ createShell });

  const runtimeSource = fs.readFileSync(RUNTIME_PATH, 'utf8');
  vm.runInNewContext(runtimeSource, sandbox, { filename: RUNTIME_PATH });
  const api = window.__FSB_SKOPEO_RUNTIME__;
  const origin = new URL(initialUrl).origin;
  const projection = Object.freeze({
    generation: 57,
    exactOrigin: origin,
    profileId: 'drive-docs-deep-pack',
    profileVersion: 'profile-v57',
    catalogVersion: 'catalog-v57',
    profile: Object.freeze({
      adapterId: options.profileAdapter || 'drive-docs-deep-pack-v1',
      rendererId: 'drive-docs-deep-pack-v1'
    })
  });

  function sendRuntime(message) {
    const listener = runtimeListeners[runtimeListeners.length - 1];
    assert.ok(listener, 'content runtime listener exists');
    let response;
    listener(message, { id: chrome.runtime.id }, value => { response = value; });
    return response;
  }

  function start() {
    assert.strictEqual(api.configure({ action: 'skopeo:configure', generation: 57, projection }), true);
    const prepared = api.prepare({ action: 'skopeo:prepare', generation: 57 });
    if (options.geometryUnsafe) return { prepared, committed: false, shell: shells[0] };
    assert.strictEqual(prepared, true);
    const committed = api.commit({ action: 'skopeo:commit', generation: 57 });
    return { prepared, committed, shell: shells[0] };
  }

  return {
    api, window, document, operations, messages, shells, projection,
    start, sendRuntime,
    hudMessages() { return messages.filter(message => message.action === 'skopeo:hud-projection'); },
    citationMessages() { return messages.filter(message => message.action === 'skopeo:hud-citation-open'); },
    askMessages() { return messages.filter(message => message.action === 'skopeo:hud-ask'); },
    askCancelMessages() { return messages.filter(message => message.action === 'skopeo:hud-ask-cancel'); },
    answerActionMessages() { return messages.filter(message => message.action === 'skopeo:hud-answer-action'); },
    answerConfirmMessages() {
      return messages.filter(message => message.action === 'skopeo:hud-answer-action-confirm');
    },
    alertActionMessages() {
      return messages.filter(message => message.action === 'skopeo:hud-alert-action');
    },
    alertConfirmMessages() {
      return messages.filter(message => message.action === 'skopeo:hud-alert-action-confirm');
    },
    revokeMessages() { return messages.filter(message => message.action === 'skopeo:hud-revoke'); }
  };
}

function assertNoContentPrivilege(source) {
  const start = source.indexOf(CONTENT_RUNTIME_START);
  const end = source.indexOf(CONTENT_RUNTIME_END);
  assert.notStrictEqual(start, -1, 'contract runtime region starts');
  assert.ok(end > start, 'contract runtime region ends after it starts');
  const region = source.slice(start, end + CONTENT_RUNTIME_END.length);
  for (const forbidden of [
    /chrome\.storage/, /googleapis/, /kernel\.transport/, /fetch\s*\(/,
    /querySelector/, /textContent/, /innerHTML/, /Date\.parse/, /new URL\s*\(/,
    /drive\.google\.com\/file/, /docs\.google\.com\/document/
  ]) {
    assert.strictEqual(forbidden.test(region), false,
      `content contract region excludes privileged/page inference seam ${forbidden}`);
  }
  assert.match(region, /skopeo:hud-projection/);
  assert.match(region, /skopeo:hud-citation-open/);
  assert.match(region, /skopeo:hud-revoke/);
}

async function testContentRuntimeAdmissionMatrix(runtimeSource) {
  const folderHarness = createContentRuntimeHarness({
    url: 'https://drive.google.com/drive/folders/vendor-root-A',
    hudResponses: [message => contentProjection(message, 'folder')]
  });
  const folderStart = folderHarness.start();
  assert.strictEqual(folderStart.committed, true);
  await flushContentRuntime();
  assert.strictEqual(folderHarness.hudMessages().length, 1,
    'exact verified folder requests one current Phase 57 projection');
  assert.deepStrictEqual(Object.keys(folderHarness.hudMessages()[0]).sort(), [
    'action', 'actionToken', 'contextEpoch', 'exactOrigin', 'generation',
    'profileVersion', 'semanticEntityToken'
  ]);
  assert.doesNotMatch(folderHarness.hudMessages()[0].semanticEntityToken, /vendor-root-A/,
    'the public projection claim uses a content-minted opaque entity token, not the Drive ID');
  assert.strictEqual(folderStart.shell.renderedContracts.length, 1,
    'folder render operations: ' + folderHarness.operations.join(', ') +
      '; messages: ' + JSON.stringify(folderHarness.messages));
  assert.strictEqual(folderStart.shell.renderedContracts[0].mode, 'folder');
  assert.ok(folderHarness.operations.indexOf('withdraw-contract') <
    folderHarness.operations.indexOf('send:skopeo:hud-projection'),
  'old Phase 57 state withdraws synchronously before request');
  assert.strictEqual(
    folderHarness.messages.filter((message) => String(message.action).startsWith('skopeo:corpus-')).length,
    0,
    'a pending contract projection owns the shared surface and suppresses the legacy corpus renderer'
  );

  const readingHarness = createContentRuntimeHarness({
    hudResponses: [message => contentProjection(message, 'reading')]
  });
  const readingStart = readingHarness.start();
  assert.strictEqual(readingStart.committed, true);
  await flushContentRuntime();
  assert.strictEqual(readingStart.shell.renderedContracts.length, 1);
  assert.strictEqual(readingStart.shell.renderedContracts[0].mode, 'reading');
  assert.strictEqual(readingStart.shell.renderedContracts[0].reading.banner.label, 'Review required',
    'current admitted review-required truth remains usable but non-definitive');
  assert.strictEqual(readingStart.shell.renderedContracts[0].reading.banner.definitive, false);

  const closedHarness = createContentRuntimeHarness({
    hudResponses: [
      message => contentProjection(message, 'reading'),
      message => contentProjection(message, 'contract-closed')
    ]
  });
  const closedStart = closedHarness.start();
  await flushContentRuntime();
  const beforeChange = closedHarness.operations.length;
  assert.ok(closedHarness.sendRuntime({
    action: 'skopeo:route-change', generation: 57,
    url: 'https://docs.google.com/document/d/agreement-B/edit'
  }));
  const immediate = closedHarness.operations.slice(beforeChange);
  assert.strictEqual(immediate[0], 'withdraw-contract',
    'replacement synchronously withdraws before starting async projection work');
  await flushContentRuntime();
  assert.deepStrictEqual(closedStart.shell.renderedContracts.map(model => model.mode), [
    'reading', 'contract-closed'
  ]);
  assert.strictEqual(closedStart.shell.renderedContracts[1].blocker.body,
    'Skopeo can’t verify this contract view. Reopen the folder or document and invoke Skopeo again.');
  const secondRender = closedHarness.operations.lastIndexOf('render-contract:contract-closed');
  const precedingWithdraw = closedHarness.operations.lastIndexOf('withdraw-contract', secondRender);
  assert.ok(precedingWithdraw !== -1 && precedingWithdraw < secondRender,
    'admitted closed result withdraws again before blocker render');

  const noAuthorityCases = [
    ['unsupported', { profileAdapter: 'unsupported-adapter-v1' }],
    ['unverified', { contextStatus: 'uncertain' }],
    ['semantic uncertainty', { semanticUncertain: true }],
    ['geometry unsafe', { geometryUnsafe: true }]
  ];
  for (const [label, options] of noAuthorityCases) {
    const harness = createContentRuntimeHarness(Object.assign({
      hudResponses: [message => contentProjection(message, 'contract-closed')]
    }, options));
    const started = harness.start();
    await flushContentRuntime();
    assert.strictEqual(harness.hudMessages().length, 0, `${label} starts no Phase 57 request`);
    assert.strictEqual(harness.operations.filter(item => item.startsWith('compose-contract:')).length, 0,
      `${label} starts no Phase 57 composition`);
    assert.strictEqual(harness.operations.filter(item => item.startsWith('render-contract:')).length, 0,
      `${label} starts no Phase 57 render or generic blocker`);
    assert.ok(!started.shell || started.shell.withdrawals >= 1 || started.shell.destroyed,
      `${label} synchronously clears prior Phase 57 state or terminally tears down`);
  }
  assertNoContentPrivilege(runtimeSource);
}

async function testContentRuntimeReplacementAndActions() {
  const staleProjection = deferred();
  const staleHarness = createContentRuntimeHarness({
    url: 'https://drive.google.com/drive/folders/vendor-root-A',
    hudResponses: [staleProjection, message => contentProjection(message, 'folder')]
  });
  const staleStart = staleHarness.start();
  assert.ok(staleHarness.sendRuntime({
    action: 'skopeo:route-change', generation: 57,
    url: 'https://drive.google.com/drive/folders/vendor-root-B'
  }));
  await flushContentRuntime();
  assert.deepStrictEqual(staleStart.shell.renderedContracts.map(model => model.mode), ['folder']);
  staleProjection.resolve(contentProjection(staleHarness.hudMessages()[0], 'folder'));
  await flushContentRuntime();
  assert.deepStrictEqual(staleStart.shell.renderedContracts.map(model => model.mode), ['folder'],
    'late superseded projection cannot resurrect after replacement');

  const primaryGate = deferred();
  const effectiveGate = deferred();
  const actionHarness = createContentRuntimeHarness({
    hudResponses: [message => contentProjection(message, 'reading')],
    citationResponder(message) {
      if (message.actionId === 'primary-action-opaque') return primaryGate.promise;
      if (message.actionId === 'effective-action-opaque') return effectiveGate.promise;
      return { success: true, status: 'opened' };
    }
  });
  const actionStart = actionHarness.start();
  await flushContentRuntime();
  const model = actionStart.shell.renderedContracts[0];
  assert.deepStrictEqual(model.actionIds, [
    'primary-action-opaque', 'effective-action-opaque', 'renewal-action-opaque'
  ]);
  const onAction = actionStart.shell.contractCallbacks[0];
  assert.strictEqual(typeof onAction, 'function');
  const primary = onAction('primary-action-opaque');
  assert.strictEqual(await Promise.resolve(onAction('primary-action-opaque')), false,
    'double-click is suppressed for only the pending primary action');
  const effective = onAction('effective-action-opaque');
  assert.strictEqual(actionHarness.citationMessages().length, 2,
    'an unrelated fact citation remains independently actionable while primary is pending');
  assert.strictEqual(await Promise.resolve(onAction('unknown-action-opaque')), false,
    'an action outside the current model is rejected without dispatch');
  assert.strictEqual(actionHarness.citationMessages().length, 2);
  for (const request of actionHarness.citationMessages()) {
    assert.deepStrictEqual(Object.keys(request).sort(), [
      'action', 'actionId', 'contextEpoch', 'exactOrigin', 'generation',
      'profileVersion', 'projectionToken', 'semanticEntityToken'
    ]);
    for (const forbidden of ['url', 'sourceFileId', 'tabId', 'citationId', 'resourceKey']) {
      assert.strictEqual(Object.prototype.hasOwnProperty.call(request, forbidden), false);
    }
    assert.doesNotMatch(request.semanticEntityToken, /agreement-A/,
      'citation dispatch preserves the opaque public entity token without the Docs ID');
  }
  primaryGate.resolve({ success: true, status: 'opened' });
  effectiveGate.resolve({ success: true, status: 'opened' });
  assert.strictEqual(await primary, true);
  assert.strictEqual(await effective, true);
  const citationsAfterSuccess = actionHarness.citationMessages().length;
  assert.strictEqual(await actionStart.shell.contractCallbacks[0]('primary-action-opaque'), false,
    'a successfully consumed current-model action is suppressed locally on replay');
  assert.strictEqual(actionHarness.citationMessages().length, citationsAfterSuccess,
    'local replay suppression starts no second background effect');

  const hideHarness = createContentRuntimeHarness({
    hudResponses: [message => contentProjection(message, 'reading')],
    citationResponder() { return { success: true, status: 'opened' }; }
  });
  const hideStart = hideHarness.start();
  await flushContentRuntime();
  const hideCallback = hideStart.shell.contractCallbacks[0];
  const hideProjectionRequest = hideHarness.hudMessages()[0];
  assert.strictEqual(typeof hideStart.shell.shellOptions.onContractWithdraw, 'function',
    'runtime owns the shell hide/geometry withdrawal callback');
  assert.strictEqual(hideStart.shell.hideContract(), true,
    'hide routes through the runtime-owned contract withdrawal callback');
  const revokeMessages = hideHarness.revokeMessages();
  assert.strictEqual(revokeMessages.length, 1, 'hide sends one projection-bound background revocation');
  assert.deepStrictEqual(Object.keys(revokeMessages[0]).sort(), [
    'action', 'contextEpoch', 'exactOrigin', 'generation',
    'profileVersion', 'projectionToken', 'semanticEntityToken'
  ]);
  assert.strictEqual(revokeMessages[0].projectionToken, 'projection-' + hideProjectionRequest.actionToken);
  assert.strictEqual(revokeMessages[0].semanticEntityToken, hideProjectionRequest.semanticEntityToken);
  for (const actionId of [
    'primary-action-opaque', 'effective-action-opaque', 'renewal-action-opaque'
  ]) {
    assert.strictEqual(await hideCallback(actionId), false,
      `hide revokes captured action ${actionId} before any citation dispatch`);
  }
  assert.strictEqual(hideHarness.citationMessages().length, 0,
    'hide leaves no live citation capability for captured action IDs');

  const driftGate = deferred();
  const driftHarness = createContentRuntimeHarness({
    hudResponses: [
      message => contentProjection(message, 'reading'),
      message => contentProjection(message, 'reading')
    ],
    citationResponder() { return driftGate.promise; }
  });
  const driftStart = driftHarness.start();
  await flushContentRuntime();
  const pending = driftStart.shell.contractCallbacks[0]('renewal-action-opaque');
  const beforeDrift = driftHarness.operations.length;
  assert.ok(driftHarness.sendRuntime({
    action: 'skopeo:route-change', generation: 57,
    url: 'https://docs.google.com/document/d/agreement-C/edit'
  }));
  assert.strictEqual(driftHarness.operations[beforeDrift], 'withdraw-contract',
    'navigation revokes contract actions synchronously before any await settles');
  driftGate.resolve({ success: true, status: 'opened' });
  assert.strictEqual(await pending, false,
    'post-await acknowledgement rechecks the complete current tuple and action epoch');
  await flushContentRuntime();
  const priorWithdrawals = driftStart.shell.withdrawals;
  const snapshot = driftHarness.api.terminate({
    action: 'skopeo:terminate', generation: 57, reason: 'off'
  });
  assert.strictEqual(snapshot.terminal, true);
  assert.ok(driftStart.shell.withdrawals > priorWithdrawals,
    'teardown synchronously withdraws the contract model');
}

async function testContentAskRuntimeLifecycle() {
  let requestActionToken = null;
  const mainHarness = createContentRuntimeHarness({
    hudResponses: [message => {
      requestActionToken = message.actionToken;
      return contentScopedProjection(message, 'reading');
    }],
    askResponder(message) {
      return contentAnswerProjection(message, requestActionToken, 'main');
    }
  });
  const mainStart = mainHarness.start();
  await flushContentRuntime();
  const entry = mainStart.shell.renderedContracts[0].askEntries[0];
  assert.deepStrictEqual(entry.action, { kind: 'ask-entry', label: 'Ask about this agreement' });
  assert.strictEqual(mainStart.shell.contractCallbacks[0]({
    kind: 'ask-entry', scopeToken: entry.scopeToken
  }), true, 'only the explicit certified agreement entry opens Focused ask');
  assert.strictEqual(mainStart.shell.renderedAsks[0].mode, 'ask');
  assert.strictEqual(mainStart.shell.renderedAsks[0].composer.state, 'editing');
  assert.strictEqual(mainHarness.askMessages().length, 0,
    'entry never dispatches a provider request automatically');

  const dispatch = mainStart.shell.askCallbacks[0]({
    kind: 'ask-dispatch', question: 'When does this agreement renew?'
  });
  assert.strictEqual(mainStart.shell.renderedAsks[1].composer.state, 'checking');
  assert.strictEqual(await dispatch, true);
  const askRequest = mainHarness.askMessages()[0];
  assert.deepStrictEqual(Object.keys(askRequest).sort(), [
    'action', 'contextEpoch', 'exactOrigin', 'generation', 'profileVersion',
    'projectionToken', 'question', 'scopeToken', 'semanticEntityToken'
  ]);
  assert.deepStrictEqual(askRequest.question, { text: 'When does this agreement renew?' });
  assert.strictEqual(askRequest.scopeToken, 'scope-agreement-opaque');
  for (const forbidden of [
    'providerId', 'sourceFileId', 'url', 'policyId', 'accountId', 'tabId', 'requestActionToken'
  ]) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(askRequest, forbidden), false,
      `ask request excludes ${forbidden}`);
  }
  const answerModel = mainStart.shell.renderedAsks[2];
  assert.strictEqual(answerModel.mode, 'answer');
  assert.strictEqual(answerModel.answer.banner.label, 'Answered');
  const answerCallback = mainStart.shell.askCallbacks[2];
  assert.strictEqual(await answerCallback({
    kind: 'answer-action', actionId: 'answer-governing-main-opaque'
  }), true);
  assert.deepStrictEqual(Object.keys(mainHarness.answerActionMessages()[0]).sort(), [
    'action', 'actionId', 'contextEpoch', 'exactOrigin', 'generation',
    'profileVersion', 'projectionToken', 'semanticEntityToken'
  ]);
  assert.strictEqual(await answerCallback({
    kind: 'answer-action', actionId: 'answer-governing-main-opaque'
  }), false, 'a consumed answer action cannot replay');
  assert.strictEqual(mainHarness.answerActionMessages().length, 1);
  assert.strictEqual(answerCallback({ kind: 'ask-another' }), true);
  const followUp = mainStart.shell.renderedAsks[mainStart.shell.renderedAsks.length - 1];
  assert.strictEqual(followUp.mode, 'ask');
  assert.strictEqual(followUp.composer.question, null,
    'Ask another begins empty and inherits no prior answer text');
  assert.strictEqual(await answerCallback({
    kind: 'answer-action', actionId: 'answer-governing-main-opaque'
  }), false, 'Ask another synchronously revokes captured answer actions');

  const firstGate = deferred();
  let abaActionToken = null;
  let askCount = 0;
  const abaHarness = createContentRuntimeHarness({
    hudResponses: [message => {
      abaActionToken = message.actionToken;
      return contentScopedProjection(message, 'reading');
    }],
    askResponder(message) {
      askCount += 1;
      return askCount === 1 ? firstGate : contentAnswerProjection(message, abaActionToken, 'second');
    }
  });
  const abaStart = abaHarness.start();
  await flushContentRuntime();
  const abaEntry = abaStart.shell.renderedContracts[0].askEntries[0];
  assert.strictEqual(abaStart.shell.contractCallbacks[0]({
    kind: 'ask-entry', scopeToken: abaEntry.scopeToken
  }), true);
  const firstAsk = abaStart.shell.askCallbacks[0]({
    kind: 'ask-dispatch', question: 'What is the current renewal date?'
  });
  const checkingCallback = abaStart.shell.askCallbacks[1];
  assert.strictEqual(checkingCallback({ kind: 'ask-cancel' }), true);
  assert.strictEqual(abaHarness.askCancelMessages().length, 1);
  assert.deepStrictEqual(Object.keys(abaHarness.askCancelMessages()[0]).sort(), [
    'action', 'contextEpoch', 'exactOrigin', 'generation', 'profileVersion',
    'projectionToken', 'semanticEntityToken'
  ]);
  const secondAsk = abaStart.shell.askCallbacks[2]({
    kind: 'ask-dispatch', question: 'What is the current notice deadline?'
  });
  assert.strictEqual(await secondAsk, true);
  const resultCount = abaStart.shell.renderedAsks.filter(model => model.mode === 'answer').length;
  firstGate.resolve(contentAnswerProjection(
    abaHarness.askMessages()[0], abaActionToken, 'stale-first'
  ));
  assert.strictEqual(await firstAsk, false);
  assert.strictEqual(abaStart.shell.renderedAsks.filter(model => model.mode === 'answer').length,
    resultCount, 'late cancelled ABA completion cannot repaint over the newer answer');

  let folderActionToken = null;
  const scopeHarness = createContentRuntimeHarness({
    url: 'https://drive.google.com/drive/folders/vendor-root-A',
    hudResponses: [
      message => {
        folderActionToken = message.actionToken;
        return contentScopedProjection(message, 'folder');
      },
      message => contentScopedProjection(message, 'folder')
    ]
  });
  const scopeStart = scopeHarness.start();
  await flushContentRuntime();
  const scopeModel = scopeStart.shell.renderedContracts[0];
  const corpusEntry = scopeModel.askEntries.find(item => item.kind === 'corpus');
  const vendorEntry = scopeModel.askEntries.find(item => item.kind === 'vendor');
  const baseCallback = scopeStart.shell.contractCallbacks[0];
  assert.strictEqual(baseCallback({ kind: 'ask-entry', scopeToken: corpusEntry.scopeToken }), true);
  const staleScopeCallback = scopeStart.shell.askCallbacks[0];
  assert.strictEqual(baseCallback({ kind: 'ask-entry', scopeToken: vendorEntry.scopeToken }), true,
    'explicit scope replacement commits without automatic dispatch');
  assert.strictEqual(scopeStart.shell.renderedAsks[1].scope.label, 'Acme');
  assert.strictEqual(await staleScopeCallback({
    kind: 'ask-dispatch', question: 'Can stale scope run?'
  }), false, 'scope replacement revokes the prior scope callback synchronously');
  assert.strictEqual(scopeHarness.askMessages().length, 0);
  assert.strictEqual(scopeStart.shell.askCallbacks[1]({ kind: 'ask-back' }), true);
  assert.ok(scopeHarness.revokeMessages().length >= 1,
    'Back withdraws the ask authority before requesting a fresh contract projection');
  assert.ok(folderActionToken, 'folder action authority was captured for the certified scopes');

  const navigationGate = deferred();
  let navigationActionToken = null;
  const navigationHarness = createContentRuntimeHarness({
    hudResponses: [
      message => {
        navigationActionToken = message.actionToken;
        return contentScopedProjection(message, 'reading');
      },
      message => contentScopedProjection(message, 'reading')
    ],
    askResponder() { return navigationGate; }
  });
  const navigationStart = navigationHarness.start();
  await flushContentRuntime();
  const navigationEntry = navigationStart.shell.renderedContracts[0].askEntries[0];
  navigationStart.shell.contractCallbacks[0]({
    kind: 'ask-entry', scopeToken: navigationEntry.scopeToken
  });
  const pendingNavigationAsk = navigationStart.shell.askCallbacks[0]({
    kind: 'ask-dispatch', question: 'What survives navigation?'
  });
  assert.ok(navigationHarness.sendRuntime({
    action: 'skopeo:route-change', generation: 57,
    url: 'https://docs.google.com/document/d/agreement-B/edit'
  }));
  assert.strictEqual(navigationHarness.askCancelMessages().length, 1,
    'navigation best-effort cancels current provider work before replacement');
  navigationGate.resolve(contentAnswerProjection(
    navigationHarness.askMessages()[0], navigationActionToken, 'navigation-stale'
  ));
  assert.strictEqual(await pendingNavigationAsk, false);
  await flushContentRuntime();
  assert.strictEqual(navigationStart.shell.renderedAsks.some(model =>
    model.mode === 'answer' && model.authority.projectionToken === 'projection-answer-navigation-stale-opaque'),
  false, 'navigation prevents late answer residue');
}

async function testContentAskConfirmationRouting() {
  let requestActionToken = null;
  let askRequest = null;
  const harness = createContentRuntimeHarness({
    hudResponses: [message => {
      requestActionToken = message.actionToken;
      return contentScopedProjection(message, 'reading');
    }],
    askResponder(message) {
      askRequest = message;
      const projection = contentAnswerProjection(message, requestActionToken, 'policy');
      projection.body.answer.outcome = 'review-required';
      projection.body.answer.conclusion =
        'The cited renewal date is current, but the policy safeguard remains open.';
      projection.body.answer.trust = {
        state: 'review-required', explanation: 'A current policy safeguard remains open.'
      };
      projection.body.policy = {
        clearance: 'blocked', reasons: ['document-10-unreviewed'],
        document10: { state: 'current', reviewed: false }
      };
      projection.body.policyActions = [{
        actionId: 'policy-complex-opaque', label: 'classify-complex', requiresConfirmation: true
      }];
      return projection;
    },
    answerActionResponder() {
      return {
        success: true,
        status: 'confirmation-required',
        confirmationToken: 'confirmation-policy-opaque',
        consequence: {
          title: 'Classify as complex', effect: 'local-policy-write',
          detail: 'Adds the human-authored memo safeguard for this current agreement.'
        }
      };
    },
    answerConfirmResponder(message) {
      const refreshedRequest = Object.assign({}, message, { question: askRequest.question });
      return contentAnswerProjection(refreshedRequest, requestActionToken, 'confirmed');
    }
  });
  const started = harness.start();
  await flushContentRuntime();
  const entry = started.shell.renderedContracts[0].askEntries[0];
  started.shell.contractCallbacks[0]({ kind: 'ask-entry', scopeToken: entry.scopeToken });
  assert.strictEqual(await started.shell.askCallbacks[0]({
    kind: 'ask-dispatch', question: 'Does this decision require a complex-agreement memo?'
  }), true);
  const answer = started.shell.renderedAsks[started.shell.renderedAsks.length - 1];
  assert.deepStrictEqual(answer.actionIds, [
    'answer-governing-policy-opaque', 'policy-complex-opaque'
  ]);
  const answerCallback = started.shell.askCallbacks[started.shell.askCallbacks.length - 1];
  assert.strictEqual(await answerCallback({
    kind: 'answer-action', actionId: 'policy-complex-opaque'
  }), true);
  const confirmation = started.shell.renderedConfirmations[0];
  assert.strictEqual(confirmation.eyebrow, 'AGREEMENT CLASSIFICATION');
  assert.strictEqual(confirmation.title, 'Classify as complex');
  assert.strictEqual(confirmation.body,
    'A current human-authored memo will be required before applicable decisions can be cleared.');
  assert.strictEqual(confirmation.safeAction.label, 'Keep routine classification');
  assert.deepStrictEqual(Object.keys(harness.answerActionMessages()[0]).sort(), [
    'action', 'actionId', 'contextEpoch', 'exactOrigin', 'generation',
    'profileVersion', 'projectionToken', 'semanticEntityToken'
  ]);
  assert.strictEqual(await started.shell.confirmationCallbacks[0]({
    kind: confirmation.confirmAction.kind,
    actionId: confirmation.confirmAction.actionId,
    confirmationToken: confirmation.confirmAction.confirmationToken
  }), true);
  assert.deepStrictEqual(Object.keys(harness.answerConfirmMessages()[0]).sort(), [
    'action', 'actionId', 'confirmationToken', 'contextEpoch', 'exactOrigin',
    'generation', 'profileVersion', 'projectionToken', 'semanticEntityToken'
  ]);
  assert.strictEqual(harness.answerConfirmMessages()[0].confirmationToken,
    'confirmation-policy-opaque');
  assert.strictEqual(started.shell.renderedAsks[started.shell.renderedAsks.length - 1].mode,
    'answer', 'confirmed local policy effect renders only a fresh background answer projection');
}

async function testContentAlertConfirmationRouting() {
  const actionId = 'alert-remove-owner-content-opaque';
  const harness = createContentRuntimeHarness({
    hudResponses: [
      message => {
        const projection = contentProjection(message, 'reading');
        projection.body.notificationDelivery = {
          version: 'skopeo-alert-public-status/1', state: 'scheduled',
          summary: 'Local alert scheduled',
          detail: 'Skopeo will recheck current evidence before showing this local alert.',
          deadlineCivilDate: '2027-05-31', alertCivilDate: '2027-03-02',
          action: {
            actionId, kind: 'remove-current-owner-mapping',
            label: 'Remove current owner mapping', requiresConfirmation: true
          }
        };
        return projection;
      },
      message => contentProjection(message, 'reading')
    ],
    alertActionResponder() {
      return {
        success: true, status: 'confirmation-required',
        confirmationToken: 'alert-confirmation-content-opaque',
        consequence: {
          title: 'Remove current owner mapping', effect: 'local-alert-owner-mapping',
          detail: 'Future alerts for this owner will no longer be delivered to this Chrome user.'
        }
      };
    },
    alertConfirmResponder() {
      return { success: true, status: 'committed' };
    }
  });
  const started = harness.start();
  await flushContentRuntime();
  const model = started.shell.renderedContracts[0];
  assert.ok(model.actionIds.includes(actionId), 'current alert action is in the exact content epoch');
  const callback = started.shell.contractCallbacks[0];
  assert.strictEqual(await callback({ kind: 'alert-action', actionId }), true);
  assert.deepStrictEqual(Object.keys(harness.alertActionMessages()[0]).sort(), [
    'action', 'actionId', 'contextEpoch', 'exactOrigin', 'generation',
    'profileVersion', 'projectionToken', 'semanticEntityToken'
  ]);
  assert.strictEqual(await callback({ kind: 'alert-action', actionId }), false,
    'alert action is one-shot before confirmation');
  assert.strictEqual(harness.alertActionMessages().length, 1);
  const confirmation = started.shell.renderedConfirmations[0];
  assert.strictEqual(confirmation.eyebrow, 'LOCAL ALERT RECIPIENT');
  assert.strictEqual(confirmation.title, 'Remove current owner mapping');
  assert.strictEqual(confirmation.safeAction.label, 'Keep current owner mapping');
  assert.strictEqual(confirmation.confirmAction.kind, 'alert-confirm');
  assert.strictEqual(await started.shell.confirmationCallbacks[0]({
    kind: 'alert-confirm', actionId,
    confirmationToken: 'alert-confirmation-content-wrong'
  }), false, 'wrong alert confirmation token has no effect');
  assert.strictEqual(harness.alertConfirmMessages().length, 0);
  assert.strictEqual(await started.shell.confirmationCallbacks[0]({
    kind: confirmation.confirmAction.kind,
    actionId: confirmation.confirmAction.actionId,
    confirmationToken: confirmation.confirmAction.confirmationToken
  }), true);
  assert.deepStrictEqual(Object.keys(harness.alertConfirmMessages()[0]).sort(), [
    'action', 'actionId', 'confirmationToken', 'contextEpoch', 'exactOrigin',
    'generation', 'profileVersion', 'projectionToken', 'semanticEntityToken'
  ]);
  await flushContentRuntime();
  assert.strictEqual(started.shell.renderedContracts.length, 2,
    'confirmed mapping effect refreshes one current projection');
  assert.strictEqual(started.shell.renderedContracts[1].reading.policyAndDelivery.length, 2,
    'refreshed unavailable status is omitted');
}

function shellContractProjection(mode, body, overrides = {}) {
  const reading = mode === 'reading';
  return Object.assign({
    version: 'skopeo-hud-projection/1',
    generation: 57,
    exactOrigin: reading ? 'https://docs.google.com' : 'https://drive.google.com',
    profileVersion: 'profile-v57',
    contextEpoch: 12,
    semanticEntityToken: reading ? 'docs-document:opaque-current' : 'drive-folder:opaque-current',
    requestActionToken: 'request-opaque-current',
    projectionToken: 'projection-opaque-current',
    mode,
    currentness: mode === 'contract-closed' ? 'closed' : 'current',
    result: mode === 'contract-closed' ? 'closed' : 'complete',
    body
  }, overrides);
}

function shellMaterialDate(type, civilDate, displayDate) {
  return { state: 'accepted', type, civilDate, displayDate, trustState: 'accepted' };
}

function shellVendor(index) {
  return {
    vendorToken: 'vendor-opaque-' + String(index).padStart(2, '0'),
    label: index === 1 ? 'Aster " onclick=alert(1)' : 'Vendor ' + String(index).padStart(2, '0'),
    owner: { state: 'assigned', label: 'Owner ' + index },
    documents: {
      indexState: 'complete', total: 2, ready: 2, pending: 0,
      unreadable: 0, downloadBlocked: 0, inaccessible: 0, missing: 0
    },
    governingState: index === 2 ? 'review-required' : 'governing',
    nextMaterialDate: shellMaterialDate('renewal', '2027-08-' + String(Math.min(index, 9)).padStart(2, '0'),
      'Aug ' + index + ', 2027'),
    consequence: { state: 'accepted', text: 'The current term renews unless accepted notice is delivered.' },
    memoEvidence: index === 1 ? 'on-file' : 'not-evaluated',
    policyDocument: index === 1 ? 'on-file' : 'not-evaluated',
    memoRequirement: 'not-evaluated',
    notificationDelivery: 'not-available',
    gaps: index === 1 ? [
      { type: 'unreadable-scan', priority: 'urgent' },
      { type: 'owner-gap', priority: 'urgent' },
      { type: 'version-conflict', priority: 'normal' }
    ] : [],
    gapOverflow: 0
  };
}

function shellFolderProjection() {
  const vendors = Array.from({ length: 10 }, (_, index) => shellVendor(index + 1));
  return shellContractProjection('folder', {
    manifestState: 'complete',
    vendorCount: 10,
    vendors,
    vendorOverflow: 0,
    nextMaterialDates: [{
      vendorToken: vendors[0].vendorToken,
      vendorLabel: vendors[0].label,
      date: shellMaterialDate('renewal', '2027-08-01', 'Aug 1, 2027'),
      consequence: { state: 'accepted', text: 'The current term renews unless accepted notice is delivered.' }
    }],
    nextMaterialDateOverflow: 0,
    urgentGaps: [{
      vendorToken: vendors[0].vendorToken,
      vendorLabel: vendors[0].label,
      gap: { type: 'unreadable-scan', priority: 'urgent' }
    }],
    urgentGapOverflow: 0,
    emptyState: 'not-empty'
  });
}

function shellReadingProjection() {
  return shellContractProjection('reading', {
    documentLabel: 'Agreement " aria-label=forged',
    sourceState: 'ready',
    readingState: 'review-required',
    governingAction: { state: 'clause', actionToken: 'citation-primary-opaque' },
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

function shellClosedProjection(reason = 'access-unavailable') {
  return shellContractProjection('contract-closed', { reason }, {
    exactOrigin: 'https://docs.google.com',
    semanticEntityToken: 'docs-document:opaque-current'
  });
}

function mountContractShell(shellApi, options = {}) {
  const harness = createHarness(shellApi, Object.assign({ generation: 57 }, options));
  const prepared = harness.shell.prepareAmbient();
  assert.ok(prepared, 'contract shell prepares within certified ambient geometry');
  assert.strictEqual(harness.shell.mountAmbient(prepared), true, 'contract shell reuses the sole mounted Shadow root');
  return harness;
}

async function flushContractActions() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

async function testShellContractRenderer(sources) {
  const shellApi = require(SHELL_PATH);
  const composer = require(COMPOSER_PATH);
  const hudSchema = require(HUD_SCHEMA_PATH);
  assert.strictEqual(typeof shellApi.SkopeoShell.prototype.renderContractView, 'function',
    'the existing Skopeo shell owns the exact Phase 57 renderer');
  assert.deepStrictEqual(shellRendererSeamState(sources), Object.freeze({
    renderer: true,
    closedCopy: true,
    modelVersion: true,
    forcedColors: true,
    reducedMotion: true
  }), 'shell source pins model, closed-copy, forced-colors, and reduced-motion contracts');

  const folder = composer.composeContractView(hudSchema.parseProjection(shellFolderProjection()));
  const reading = composer.composeContractView(hudSchema.parseProjection(shellReadingProjection()));
  const documentProjection = shellReadingProjection();
  documentProjection.body.governingAction.state = 'document';
  const documentReading = composer.composeContractView(hudSchema.parseProjection(documentProjection));
  const closed = composer.composeContractView(hudSchema.parseProjection(shellClosedProjection()));
  assert.ok(folder && reading && documentReading && closed,
    'shell fixtures cross the real schema and composer boundaries');

  const harness = mountContractShell(shellApi, { width: 1024, height: 900 });
  const hostControl = harness.addHostControl({ left: 24, top: 240, width: 120, height: 36 }, {
    tagName: 'button', 'aria-label': 'Host action', class: 'host-action'
  });
  hostControl.style.color = 'rgb(1, 2, 3)';
  hostControl.focus();
  const hostBefore = snapshotHostState(harness.document, harness.window);
  assert.strictEqual(harness.shell.renderContractView(folder, () => true), true,
    'admitted usable folder renders');
  const root = harness.shadow();
  let region = root.querySelector('.skopeo-contract-region');
  assert.ok(region, 'folder uses one composite rail inside the existing root');
  assert.strictEqual(root.querySelectorAll('.skopeo-contract-region').length, 1, 'one Phase 57 rail maximum');
  assert.strictEqual(harness.document.querySelectorAll('[data-skopeo-shell-root="true"]').length, 1,
    'Phase 57 never installs a second shell owner');
  assert.strictEqual(region.getAttribute('role'), 'region');
  assert.strictEqual(region.getAttribute('aria-labelledby'), 'skopeo-contract-heading');
  assert.strictEqual(region.getAttribute('tabindex'), '0', 'scrollable rail is keyboard reachable');
  assert.strictEqual(region.style.position, 'fixed');
  assert.strictEqual(region.style.width, '384px');
  assert.strictEqual(region.style.right, '16px');
  assert.strictEqual(region.style.top, '64px');
  assert.strictEqual(region.style.bottom, '64px');
  assert.strictEqual(region.style.maxHeight, 'calc(100dvh - 128px)');
  assert.strictEqual(region.style.borderRadius, '12px');
  assert.strictEqual(region.style.padding, '16px');
  assert.strictEqual(root.querySelector('#skopeo-contract-heading').textContent, 'Vendor agreements');
  assert.deepStrictEqual(
    root.querySelectorAll('[data-contract-section]').map(node => node.getAttribute('data-contract-section')),
    ['header', 'next-material-dates', 'urgent-gaps', 'vendors', 'vendor-page-controls'],
    'folder follows the fixed visible section order'
  );
  assert.strictEqual(root.querySelectorAll('.skopeo-contract-vendor').length, 8,
    'local page one is capped at eight vendors');
  const typedDate = root.querySelector('time[datetime="2027-08-01"]');
  assert.ok(typedDate, 'typed material dates preserve machine-readable civil dates');
  assert.strictEqual(root.querySelector('img'), null, 'hostile labels stay literal text');
  assert.ok(root.textContent.includes('Aster " onclick=alert(1)'), 'hostile-but-valid label remains visible literal copy');
  assert.strictEqual(harness.document.activeElement, hostControl, 'mount never steals host focus');
  assert.deepStrictEqual(snapshotHostState(harness.document, harness.window), hostBefore,
    'folder render performs no host attribute, class, style, layout, focus, or scroll writes');

  const exact480 = mountContractShell(shellApi, { width: 480, height: 900 });
  assert.strictEqual(exact480.shell.renderContractView(folder, () => true), true,
    'exact 480 CSS-pixel viewport still admits the contract rail');
  const exactRegion = exact480.shadow().querySelector('.skopeo-contract-region');
  assert.ok(exactRegion, 'exact-480 fixture renders one contract region');
  assert.strictEqual(exactRegion.getAttribute('data-contract-columns'), '1',
    'geometry certificate and CSS agree that 480px uses the narrow contract layout');
  assert.strictEqual(exactRegion.style.left, '16px');
  assert.strictEqual(exactRegion.style.right, '16px');
  assert.strictEqual(exactRegion.style.width, 'auto');
  exact480.shell.destroy();

  const next = root.querySelector('[aria-label="Next vendor page"]');
  assert.ok(next && next.localName === 'button' && next.type === 'button', 'pager is a real button');
  next.focus();
  next.click();
  assert.strictEqual(root.querySelectorAll('.skopeo-contract-vendor').length, 2,
    'local page two exposes only the remaining bounded rows');
  assert.strictEqual(root.activeElement, region,
    'paging falls back to the region when the same-direction control is omitted at the boundary');
  assert.strictEqual(root.querySelector('[aria-live="polite"]').textContent, 'Vendor page 2 of 2.',
    'paging has one concise polite status update');

  assert.strictEqual(harness.shell.withdrawCorpus(), true, 'authority transition synchronously withdraws folder DOM');
  assert.strictEqual(root.querySelector('.skopeo-contract-region'), null);
  assert.strictEqual(harness.shell.renderContractView(documentReading, () => true), true);
  assert.ok(root.querySelector('[aria-label="Open governing document"]'),
    'document-only primary route retains its exact approved label');
  assert.strictEqual(harness.shell.withdrawCorpus(), true);
  const actionCalls = [];
  let resolvePrimary;
  const primaryGate = new Promise(resolve => { resolvePrimary = resolve; });
  assert.strictEqual(harness.shell.renderContractView(reading, actionId => {
    actionCalls.push(actionId);
    return actionId === 'citation-primary-opaque' ? primaryGate : true;
  }), true, 'admitted review-required reading remains usable but non-definitive');
  region = root.querySelector('.skopeo-contract-region');
  assert.ok(region.classList.contains('skopeo-contract-reading'));
  const banner = root.querySelector('.skopeo-contract-reading-banner');
  assert.strictEqual(banner.getAttribute('data-definitive'), 'false');
  assert.strictEqual(banner.textContent.includes('Review required'), true);
  assert.strictEqual(banner.style.position, 'sticky', 'reading state remains visible while scrolling');
  const citationButtons = root.querySelectorAll('.skopeo-contract-citation');
  assert.deepStrictEqual(citationButtons.map(button => button.getAttribute('aria-label')), [
    'Open governing clause',
    'Open source for Effective',
    'Open source for Renewal'
  ], 'primary and every eligible fact retain exact separate button labels');
  assert.ok(citationButtons.every(button => button.localName === 'button' && button.type === 'button'));
  citationButtons[0].click();
  assert.deepStrictEqual(actionCalls, ['citation-primary-opaque'], 'primary dispatches only its opaque action ID');
  assert.strictEqual(citationButtons[0].disabled, true);
  assert.strictEqual(citationButtons[0].getAttribute('aria-busy'), 'true');
  assert.strictEqual(citationButtons[1].disabled, false, 'pending state is independent per citation');
  citationButtons[1].click();
  await flushContractActions();
  assert.deepStrictEqual(actionCalls, ['citation-primary-opaque', 'citation-fact-effective-opaque'],
    'fact citation keeps its distinct opaque action ID');

  const failedActionCalls = [];
  assert.strictEqual(harness.shell.renderContractView(reading, () => {
    failedActionCalls.push('failed');
    return false;
  }), true, 'fresh reading model can replace the in-flight citation surface');
  const failedButtons = root.querySelectorAll('.skopeo-contract-citation');
  failedButtons[0].click();
  await flushContractActions();
  assert.deepStrictEqual(failedActionCalls, ['failed']);
  assert.strictEqual(failedButtons[0].disabled, true,
    'a failed citation stays disabled instead of re-enabling a revoked token');

  assert.strictEqual(harness.shell.renderContractView(closed, () => false), true,
    'same admitted exact context can replace stale reading with contract-closed');
  assert.strictEqual(root.querySelectorAll('.skopeo-contract-region').length, 1,
    'withdraw-before-blocker never overlaps stale and closed rails');
  assert.strictEqual(root.querySelector('.skopeo-contract-region').getAttribute('data-contract-mode'), 'contract-closed');
  assert.strictEqual(root.querySelector('.skopeo-contract-blocker').getAttribute('role'), 'status');
  assert.strictEqual(root.querySelector('.skopeo-contract-blocker').textContent.includes(
    'Skopeo can’t verify this contract view. Reopen the folder or document and invoke Skopeo again.'
  ), true, 'admitted closed state renders the exact recovery copy');
  assert.strictEqual(root.querySelectorAll('.skopeo-contract-citation').length, 0,
    'closed replacement synchronously revokes every stale action');
  resolvePrimary(true);
  await flushContractActions();
  assert.strictEqual(root.querySelector('.skopeo-contract-blocker') !== null, true,
    'settled stale action cannot rewrite the replacement state');

  const narrow = mountContractShell(shellApi, { width: 420, height: 900 });
  assert.strictEqual(narrow.shell.renderContractView(folder, () => true), true);
  const narrowRegion = narrow.shadow().querySelector('.skopeo-contract-region');
  assert.strictEqual(narrowRegion.style.left, '16px');
  assert.strictEqual(narrowRegion.style.right, '16px');
  assert.strictEqual(narrowRegion.style.width, 'auto');
  assert.strictEqual(narrowRegion.getAttribute('data-contract-columns'), '1');
  assert.deepStrictEqual(Object.assign({}, narrow.shell.destroy('narrow-contract')),
    Object.assign({}, shellApi.zeroSnapshot()), 'narrow teardown leaves exact zero resources');

  const unsafe = mountContractShell(shellApi, { width: 1024, height: 900 });
  unsafe.addHostControl({ left: 610, top: 56, width: 398, height: 780 }, {
    tagName: 'button', 'aria-label': 'Verified host interaction target'
  });
  assert.strictEqual(unsafe.shell.renderContractView(reading, () => true), false,
    'immediate unsafe geometry certificate follows the no-authority/no-rail row');
  assert.strictEqual(unsafe.shadow().querySelectorAll('.skopeo-contract-region').length, 0);
  assert.strictEqual(unsafe.shadow().querySelector('.skopeo-contract-blocker'), null,
    'geometry failure never manufactures contract-closed');
  assert.strictEqual(unsafe.shadow().querySelectorAll('.skopeo-contract-citation').length, 0);
  assert.strictEqual(unsafe.shadow().querySelector('[aria-live="polite"]').textContent, '',
    'geometry failure clears Phase 57 announcements');
  assert.deepStrictEqual(Object.assign({}, unsafe.shell.destroy('unsafe-contract')),
    Object.assign({}, shellApi.zeroSnapshot()));

  for (const forbidden of [
    'Ask Skopeo', 'Draft notice', 'Send notice', 'Approve', 'Document 10',
    'notification workflow', 'policy editing', 'missing-required policy'
  ]) {
    assert.strictEqual(root.textContent.includes(forbidden), false, `Phase 57 excludes ${forbidden}`);
  }
  assert.strictEqual(harness.document.querySelectorAll('[data-skopeo-row-badge]').length, 0,
    'Phase 57 adds no per-row host badge or multi-anchor decoration');
  let hideShell = null;
  const hideReasons = [];
  const hideHarness = mountContractShell(shellApi, {
    width: 1024,
    height: 900,
    onContractWithdraw(reason) {
      hideReasons.push(reason);
      return hideShell.withdrawCorpus() === true;
    }
  });
  hideShell = hideHarness.shell;
  assert.strictEqual(hideHarness.shell.renderContractView(reading, () => true), true);
  const hideRoot = hideHarness.shadow();
  const hideButton = hideRoot.querySelector('.skopeo-contract-hide');
  assert.ok(hideButton && hideButton.localName === 'button', 'contract header exposes the hide control');
  hideButton.click();
  assert.deepStrictEqual(hideReasons, ['hide'],
    'the hide control uses the runtime-owned withdrawal callback instead of a local-only withdraw');
  assert.strictEqual(hideRoot.querySelector('.skopeo-contract-region'), null,
    'hide removes the contract rail before any captured action can run');
  assert.strictEqual(hideRoot.querySelectorAll('.skopeo-contract-citation').length, 0,
    'hide synchronously revokes every visible citation control');
  hideHarness.shell.destroy();
  assert.deepStrictEqual(Object.assign({}, harness.shell.destroy('contract-complete')),
    Object.assign({}, shellApi.zeroSnapshot()), 'teardown removes listeners, timers, actions, and root ownership');
  assert.strictEqual(harness.document.querySelectorAll('[data-skopeo-shell-root="true"]').length, 0,
    'teardown leaves no Shadow host residue');
}

function testHudAbsenceJoin(backgroundSource) {
  const source = markedSource(backgroundSource, HUD_ABSENCE_JOIN_START, HUD_ABSENCE_JOIN_END);
  const join = vm.runInNewContext(
    source + '\n({ hudFinalState, hudPolicyState, hudPriorityGaps });'
  );
  assert.strictEqual(join.hudFinalState({
    value: 'executed', reasonCode: 'executed-evidence', trustState: 'extracted'
  }), 'present');
  assert.strictEqual(join.hudFinalState({
    value: 'unsigned', reasonCode: 'unsigned-evidence', trustState: 'extracted'
  }), 'proven-missing');
  assert.strictEqual(join.hudFinalState({
    value: 'unsigned', reasonCode: 'execution-evidence-missing', trustState: 'extracted'
  }), 'proven-missing');
  assert.strictEqual(join.hudFinalState({
    value: 'unsigned', reasonCode: 'execution-evidence-missing', trustState: 'ambiguous'
  }), 'not-evaluated', 'inconclusive execution evidence stays not-evaluated');
  assert.strictEqual(join.hudFinalState({
    value: 'executed', reasonCode: 'unsigned-evidence', trustState: 'extracted'
  }), 'not-evaluated', 'mismatched execution proof does not fabricate present');
  assert.strictEqual(join.hudFinalState(null), 'not-evaluated');

  assert.strictEqual(join.hudPolicyState({
    records: [{ kind: 'policy-document', sourceFileId: 'src-a', presence: 'absent' }],
    relations: []
  }, ['src-a']), 'proven-missing');
  assert.strictEqual(join.hudPolicyState({
    records: [{ kind: 'policy-document', sourceFileId: 'src-a' }],
    relations: []
  }, ['src-a']), 'on-file');
  assert.strictEqual(join.hudPolicyState({
    records: [],
    relations: [{
      predicate: 'references-policy', candidateOnly: false, sourceFileId: 'src-a'
    }]
  }, ['src-a']), 'on-file');
  assert.strictEqual(join.hudPolicyState({
    records: [],
    relations: [{
      predicate: 'references-policy', candidateOnly: true, sourceFileId: 'src-a'
    }]
  }, ['src-a']), 'not-evaluated', 'candidate policy relations are not current absence or presence');
  assert.strictEqual(join.hudPolicyState({ records: [], relations: [] }, ['src-a']),
    'not-evaluated', 'empty complete-looking graph without a policy proof stays unknown');

  assert.strictEqual(join.hudPriorityGaps(
    'proven-missing', 'proven-missing', 'review-required', ['version-conflict']
  ).join(','), 'missing-final,policy-document-missing,version-conflict');
  assert.strictEqual(join.hudPriorityGaps('present', 'on-file', 'governing', []).join(','), '');
  assert.strictEqual(join.hudPriorityGaps('not-evaluated', 'not-evaluated', 'governing', []).join(','), '');
}

function productionJoinDigest() {
  return 'sha256:' + 'a'.repeat(64);
}

function productionJoinSource(sourceBinding, vendorScopeFileId, state = 'ready', indexState = 'complete') {
  return { sourceBinding, vendorScopeFileId, state, indexState };
}

function productionJoinFamily(options) {
  return Object.assign({
    familyToken: 'family:join',
    sourceBindings: ['source:join'],
    governingState: 'governing',
    readingStates: [{ sourceBinding: 'source:join', state: 'governing' }],
    finalState: 'present',
    materialDates: [],
    facts: [],
    conflicts: [],
    priorityGaps: [],
    policyState: 'not-evaluated',
    governingAction: { state: 'not-available', sourceBinding: null, actionToken: null }
  }, options);
}

function productionJoinInput(mode, family, extras = {}) {
  const digest = productionJoinDigest();
  const reading = mode === 'reading';
  return Object.assign({
    mode,
    focus: reading
      ? { sourceBinding: 'source:join', documentLabel: 'Joined agreement' }
      : { sourceBinding: null, documentLabel: null },
    manifest: {
      state: 'complete',
      authorizedSetDigest: digest,
      totalSources: 1,
      sourceOverflow: 0,
      totalVendors: 1,
      vendorOverflow: 0,
      sources: [productionJoinSource('source:join', 'folder:join')]
    },
    graph: {
      state: 'complete',
      authorizedSetDigest: digest,
      records: [],
      relations: []
    },
    truth: {
      state: 'complete',
      authorizedSetDigest: digest,
      evaluationContextDigest: digest,
      families: [family],
      blockerCodes: []
    },
    vendorLabels: {
      state: 'current',
      entries: [{ vendorScopeFileId: 'folder:join', vendorToken: 'vendor:join', label: 'Join Vendor' }]
    },
    evaluationContext: { civilDate: '2026-08-12', digest },
    authority: {
      generation: 7,
      exactOrigin: reading ? 'https://docs.google.com' : 'https://drive.google.com',
      profileVersion: 'drive-docs-deep-pack-v1',
      contextEpoch: 11,
      semanticEntityToken: reading ? 'entity:document:join' : 'entity:folder:join',
      requestActionToken: 'request:join',
      projectionToken: 'projection:join'
    }
  }, extras);
}

function adapterReadingState(governanceValue, lineageValue, onAcceptedPath) {
  if (governanceValue === 'review-required') return 'review-required';
  if (!onAcceptedPath) return 'not-evaluated';
  if (governanceValue === 'superseded') return 'superseded';
  if (lineageValue === 'historical') return 'historical';
  if (governanceValue === 'governing') return 'governing';
  if (governanceValue === 'partially-governing') return 'partially-governing';
  return 'not-evaluated';
}

function testProductionJoin(backgroundSource) {
  const projector = require(HUD_PROJECTOR_PATH);
  const schema = require(HUD_SCHEMA_PATH);
  const join = vm.runInNewContext(
    markedSource(backgroundSource, HUD_ABSENCE_JOIN_START, HUD_ABSENCE_JOIN_END) +
      '\n({ hudFinalState, hudPolicyState, hudPriorityGaps });'
  );

  const historical = projector.createProjection(productionJoinInput('reading', productionJoinFamily({
    governingState: 'not-evaluated',
    readingStates: [{
      sourceBinding: 'source:join',
      state: adapterReadingState('governing', 'historical', true)
    }],
    governingAction: { state: 'document', sourceBinding: 'source:join', actionToken: 'action:hist' }
  })));
  assert.ok(schema.parseProjection(historical));
  assert.strictEqual(historical.body.readingState, 'historical',
    'accepted historical lineage stays historical through the production join');

  const superseded = projector.createProjection(productionJoinInput('reading', productionJoinFamily({
    governingState: 'not-evaluated',
    readingStates: [{
      sourceBinding: 'source:join',
      state: adapterReadingState('superseded', 'historical', true)
    }],
    governingAction: { state: 'document', sourceBinding: 'source:join', actionToken: 'action:super' }
  })));
  assert.strictEqual(superseded.body.readingState, 'superseded',
    'accepted superseded governance stays distinct from historical');

  const reviewRequired = projector.createProjection(productionJoinInput('reading', productionJoinFamily({
    governingState: 'review-required',
    readingStates: [{
      sourceBinding: 'source:join',
      state: adapterReadingState('review-required', 'historical', true)
    }],
    conflicts: ['version-conflict'],
    priorityGaps: Array.from(join.hudPriorityGaps(
      'present', 'not-evaluated', 'review-required', ['version-conflict']
    ))
  })));
  assert.strictEqual(reviewRequired.body.readingState, 'review-required');
  assert.ok(reviewRequired.body.gaps.some((gap) => gap.type === 'version-conflict' && gap.priority === 'urgent'),
    'review-required conflicts enter the live urgent-gap producer');

  const acceptedDate = projector.createProjection(productionJoinInput('folder', productionJoinFamily({
    materialDates: [{
      type: 'notice-deadline',
      civilDate: '2027-03-15',
      displayDate: 'Mar 15, 2027',
      trustState: 'accepted',
      consequence: 'Notice must be given by this date',
      sourceBinding: 'source:join'
    }]
  })));
  assert.strictEqual(acceptedDate.body.vendors[0].nextMaterialDate.trustState, 'accepted');
  assert.strictEqual(acceptedDate.body.vendors[0].nextMaterialDate.type, 'notice-deadline');

  const missingFinal = join.hudFinalState({
    value: 'unsigned', reasonCode: 'unsigned-evidence', trustState: 'extracted'
  });
  const policyMissing = join.hudPolicyState({
    records: [{ kind: 'policy-document', sourceFileId: 'source:join', presence: 'absent' }],
    relations: []
  }, ['source:join']);
  const absence = projector.createProjection(productionJoinInput('folder', productionJoinFamily({
    finalState: missingFinal,
    policyState: policyMissing,
    priorityGaps: Array.from(join.hudPriorityGaps(missingFinal, policyMissing, 'governing', []))
  })));
  assert.ok(absence.body.vendors[0].gaps.some((gap) => gap.type === 'missing-final' && gap.priority === 'urgent'));
  assert.ok(absence.body.vendors[0].gaps.some((gap) =>
    gap.type === 'policy-document-missing' && gap.priority === 'urgent'));
  assert.strictEqual(absence.body.vendors[0].policyDocument, 'missing');

  const unknown = projector.createProjection(productionJoinInput('folder', productionJoinFamily({
    finalState: join.hudFinalState({
      value: 'unsigned', reasonCode: 'execution-evidence-missing', trustState: 'ambiguous'
    }),
    policyState: join.hudPolicyState({ records: [], relations: [] }, ['source:join']),
    priorityGaps: []
  })));
  assert.strictEqual(unknown.body.vendors[0].gaps.some((gap) => gap.type === 'missing-final'), false,
    'inconclusive execution evidence does not publish missing-final');
  assert.strictEqual(unknown.body.vendors[0].policyDocument, 'not-evaluated');
}

async function testSharedSurfaceCompletionOrders() {
  const hudFirst = deferred();
  const firstHarness = createContentRuntimeHarness({
    url: 'https://drive.google.com/drive/folders/vendor-root-A',
    hudResponses: [hudFirst]
  });
  firstHarness.start();
  await flushContentRuntime();
  assert.strictEqual(
    firstHarness.messages.filter((message) => String(message.action).startsWith('skopeo:corpus-')).length,
    0,
    'HUD-first order never launches the legacy corpus renderer'
  );
  hudFirst.resolve(contentProjection(firstHarness.hudMessages()[0], 'folder'));
  await flushContentRuntime();
  assert.strictEqual(firstHarness.shells[0].renderedContracts[0].mode, 'folder');
  assert.strictEqual(firstHarness.operations.filter((item) => item === 'render-corpus').length, 0,
    'HUD-first completion never paints the shared region as corpus');

  const hudLate = deferred();
  const lateHarness = createContentRuntimeHarness({
    url: 'https://drive.google.com/drive/folders/vendor-root-A',
    hudResponses: [hudLate]
  });
  const lateStart = lateHarness.start();
  await flushContentRuntime();
  lateStart.shell.renderCorpus({ mode: 'active-corpus' });
  assert.ok(lateHarness.operations.includes('render-corpus'),
    'corpus-first order can still reach the shared shell before HUD resolves');
  hudLate.resolve(contentProjection(lateHarness.hudMessages()[0], 'folder'));
  await flushContentRuntime();
  const lastCorpus = lateHarness.operations.lastIndexOf('render-corpus');
  const lastContract = lateHarness.operations.lastIndexOf('render-contract:folder');
  assert.ok(lastContract > lastCorpus,
    'late HUD still owns the shared surface after a premature corpus render');
  assert.strictEqual(lateStart.shell.renderedContracts[lateStart.shell.renderedContracts.length - 1].mode,
    'folder');
}

function testContentRuntimeStaticContract(sources) {
  assert.deepStrictEqual(contentRoutingSeamState(sources), Object.freeze({
    projectionRequest: true,
    contractComposer: true,
    contractRenderer: true,
    citationDispatch: true,
    actionEpoch: true
  }), 'complete content projection routing interface is installed');
}

async function runHudRuntimeContract() {
  try {
    const sources = loadSources();
    const seams = seamState(sources);
    const hudControllerSeams = hudControllerSeamState(sources);
    const askControllerSeams = askControllerSeamState(sources);
    const contentRoutingSeams = contentRoutingSeamState(sources);
    const askContentSeams = askContentSeamState(sources);
    const alertBackgroundSeams = alertBackgroundSeamState(sources);
    if (process.env.SKOPEO_ASK_EXPECT_CONTROLLER_RED === '1') {
      assert.deepStrictEqual(hudControllerSeams, Object.freeze({
        controllerFactory: true,
        projectionAction: true,
        citationAction: true
      }), 'controlled ask RED preserves the Phase 57 background controller');
      assert.deepStrictEqual(askControllerSeams, Object.freeze({
        modules: false,
        ask: false,
        cancel: false,
        answerAction: false,
        answerConfirm: false
      }), 'controlled ask RED is valid only while all Phase 58 controller seams are absent');
      testStaticPrivacyAndPassiveContract(sources);
      console.log(`${ASK_CONTROLLER_MARKER}: RED`);
      return;
    }
    if (process.env.SKOPEO_ASK_EXPECT_CONTENT_RED === '1') {
      assert.deepStrictEqual(contentRoutingSeams, Object.freeze({
        projectionRequest: true,
        contractComposer: true,
        contractRenderer: true,
        citationDispatch: true,
        actionEpoch: true
      }), 'controlled ask-content RED preserves the complete Phase 57 content routing seam');
      assert.deepStrictEqual(askContentSeams, Object.freeze({
        composer: false,
        state: false,
        ask: false,
        cancel: false,
        action: false,
        confirm: false
      }), 'controlled ask-content RED is valid only while all Phase 58 content seams are absent');
      testStaticPrivacyAndPassiveContract(sources);
      console.log(`${ASK_CONTENT_MARKER}: RED`);
      return;
    }
    if (process.env.SKOPEO_HUD_EXPECT_CONTENT_RED === '1') {
      assert.deepStrictEqual(seams, Object.freeze({
        displayInspection: true,
        contextBuilder: true,
        orchestrationHelper: true,
        configDefaults: true
      }), 'controlled content RED does not excuse an unrelated truth seam failure');
      assert.deepStrictEqual(hudControllerSeams, Object.freeze({
        controllerFactory: true,
        projectionAction: true,
        citationAction: true
      }), 'controlled content RED does not excuse an unrelated background HUD failure');
      testStaticPrivacyAndPassiveContract(sources);
      assert.deepStrictEqual(contentRoutingSeams, Object.freeze({
        projectionRequest: false,
        contractComposer: false,
        contractRenderer: false,
        citationDispatch: false,
        actionEpoch: false
      }), 'controlled content-routing RED is valid only for the intended absent interface');
      console.log(`${CONTENT_ROUTING_MARKER}: RED`);
      return;
    }
    if (process.env.SKOPEO_HUD_EXPECT_CONTROLLER_RED === '1') {
      assert.deepStrictEqual(hudControllerSeams, Object.freeze({
        controllerFactory: false,
        projectionAction: false,
        citationAction: false
      }), 'controlled controller RED is valid only for the intended absent production seam');
      console.log(`${CONTROLLER_MARKER}: RED`);
      return;
    }
    if (process.env.SKOPEO_HUD_EXPECT_TRUTH_RED === '1') {
      assert.deepStrictEqual(seams, Object.freeze({
        displayInspection: false,
        contextBuilder: false,
        orchestrationHelper: false,
        configDefaults: false
      }), 'controlled RED is valid only for the intended absent production seams');
      console.log(`${MARKER}: RED`);
      return;
    }
    assert.deepStrictEqual(seams, Object.freeze({
      displayInspection: true,
      contextBuilder: true,
      orchestrationHelper: true,
      configDefaults: true
    }), 'complete HUD truth production seams are installed');
    assert.deepStrictEqual(hudControllerSeams, Object.freeze({
      controllerFactory: true,
      projectionAction: true,
      citationAction: true
    }), 'complete HUD projection controller seams are installed');
    assert.deepStrictEqual(askControllerSeams, Object.freeze({
      modules: true,
      ask: true,
      cancel: true,
      answerAction: true,
      answerConfirm: true
    }), 'complete cited-ask background controller seams are installed');
    assert.deepStrictEqual(askContentSeams, Object.freeze({
      composer: true,
      state: true,
      ask: true,
      cancel: true,
      action: true,
      confirm: true
    }), 'complete cited-ask content seams are installed');
    assert.deepStrictEqual(alertBackgroundSeams, Object.freeze({
      runtimeFacade: true,
      currentCandidateJoin: true,
      alarmRoute: true,
      lifecycleReconcile: true,
      notificationClicks: true,
      freshEvidence: true,
      mappingEffects: true
    }), 'complete current-user alert background seams are installed');
    testStaticPrivacyAndPassiveContract(sources);
    await testEvaluationContextBuilder(sources.background);
    await testExplicitTruthDedupe(sources.background);
    testHudControllerStaticContract(sources);
    await testHudControllerRuntime(sources.background);
    await testAskControllerRuntime(sources.background);
    await testPolicyDocumentResolver(sources.background);
    testPolicyMemoJoin(sources.background);
    testHudAbsenceJoin(sources.background);
    testProductionJoin(sources.background);
    testContentRuntimeStaticContract(sources);
    await testContentRuntimeAdmissionMatrix(sources.runtime);
    await testContentRuntimeReplacementAndActions();
    await testContentAskRuntimeLifecycle();
    await testContentAskConfirmationRouting();
    await testContentAlertConfirmationRouting();
    await testSharedSurfaceCompletionOrders();
    await testShellContractRenderer(sources);
    console.log(`${MARKER}: PASS`);
  } catch (error) {
    console.error(error && error.stack || error);
    process.exitCode = 1;
  }
}

module.exports = {
  contentProjection,
  createContentRuntimeHarness,
  deferred,
  flushContentRuntime,
  runHudRuntimeContract
};

if (require.main === module) runHudRuntimeContract();
