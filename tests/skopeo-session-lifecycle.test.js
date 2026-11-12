/**
 * Contract tests for the tab-scoped Skopeo session lifecycle reducer.
 *
 * Run the transition oracle alongside the production runtime integration:
 *   node tests/skopeo-session-lifecycle.test.js --self-test
 *
 * Run the production contract:
 *   node tests/skopeo-session-lifecycle.test.js
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  CATEGORIES: RESOURCE_CATEGORIES,
  zeroSnapshot,
  isExactZeroSnapshot
} = require('./helpers/skopeo-resource-ledger.js');
const CONTEXT_ROUTER = require('../extension/content/skopeo-context-router.js');
const ACTION_AUTHORITY = require('../extension/utils/skopeo-action-authority.js');
const CAPABILITY_PROJECTOR = require('../extension/utils/skopeo-capability-projector.js');
const PROFILE_INDEX = require('../extension/catalog/skopeo-profile-index.generated.js');

const SELF_TEST = process.argv.includes('--self-test');
const PREPARED_REASON = 'prepared-awaiting-commit';
const CATALOG_RUNTIME_AUTHORITY_FIELDS = Object.freeze([
  'generation',
  'exactOrigin',
  'catalogVersion',
  'profileVersion',
  'contextEpoch',
  'semanticEntity'
]);

function createTransitionOracle() {
  const STATUS = Object.freeze({
    OFF: 'off',
    STARTING: 'starting',
    ACTIVE: 'active',
    TERMINATING: 'terminating'
  });

  function isPositiveInteger(value) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }

  function isGeneration(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
  }

  function isTimestamp(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  function isReason(value) {
    return value === null || (typeof value === 'string' && value.length > 0);
  }

  function copyRecord(record) {
    if (!record || typeof record !== 'object') return null;
    if (!isPositiveInteger(record.tabId)) return null;
    if (!isGeneration(record.generation)) return null;
    if (!Object.values(STATUS).includes(record.status)) return null;
    if (!isGeneration(record.terminalGeneration)) return null;
    if (record.terminalGeneration > record.generation) return null;
    if (!isTimestamp(record.updatedAt)) return null;
    if (!isReason(record.reason)) return null;
    return {
      tabId: record.tabId,
      generation: record.generation,
      status: record.status,
      terminalGeneration: record.terminalGeneration,
      updatedAt: record.updatedAt,
      reason: record.reason
    };
  }

  function storageKeyForTab(tabId) {
    return isPositiveInteger(tabId) ? `skopeoSession:${tabId}` : null;
  }

  function createOffState(tabId, generation = 0, now = Date.now()) {
    if (!isPositiveInteger(tabId) || !isGeneration(generation) || !isTimestamp(now)) {
      return null;
    }
    return {
      tabId,
      generation,
      status: STATUS.OFF,
      terminalGeneration: generation,
      updatedAt: now,
      reason: null
    };
  }

  function beginGeneration(previous, tabId, now = Date.now()) {
    if (!isPositiveInteger(tabId) || !isTimestamp(now)) return null;
    const current = previous == null ? createOffState(tabId, 0, now) : copyRecord(previous);
    if (!current || current.tabId !== tabId || current.status !== STATUS.OFF) {
      return current;
    }
    const generation = Math.max(current.generation, current.terminalGeneration) + 1;
    return {
      tabId,
      generation,
      status: STATUS.STARTING,
      terminalGeneration: current.terminalGeneration,
      updatedAt: now,
      reason: null
    };
  }

  function markActive(current, generation, now = Date.now(), reason = null) {
    const record = copyRecord(current);
    if (!record || !isGeneration(generation) || !isTimestamp(now)) return record;
    if (reason !== null && reason !== PREPARED_REASON) return record;
    if (record.generation !== generation) return record;
    if (record.status === STATUS.ACTIVE) return record;
    if (record.status !== STATUS.STARTING) return record;
    return {
      ...record,
      status: STATUS.ACTIVE,
      updatedAt: now,
      reason
    };
  }

  function clearActiveReason(current, generation, now = Date.now()) {
    const record = copyRecord(current);
    if (!record || !isGeneration(generation) || !isTimestamp(now)) return record;
    if (record.status !== STATUS.ACTIVE || record.generation !== generation) return record;
    if (record.reason !== PREPARED_REASON) return record;
    return { ...record, updatedAt: now, reason: null };
  }

  function beginTermination(current, generation, reason, now = Date.now()) {
    const record = copyRecord(current);
    if (!record || !isGeneration(generation) || !isTimestamp(now)) return record;
    if (typeof reason !== 'string' || reason.length === 0) return record;
    if (record.generation !== generation) return record;
    if (record.status === STATUS.TERMINATING || record.status === STATUS.OFF) return record;
    if (record.status !== STATUS.STARTING && record.status !== STATUS.ACTIVE) return record;
    return {
      ...record,
      status: STATUS.TERMINATING,
      terminalGeneration: generation,
      updatedAt: now,
      reason
    };
  }

  function finishTermination(current, generation, now = Date.now()) {
    const record = copyRecord(current);
    if (!record || !isGeneration(generation) || !isTimestamp(now)) return record;
    if (record.generation !== generation || record.status !== STATUS.TERMINATING) {
      return record;
    }
    return { ...record, status: STATUS.OFF, updatedAt: now };
  }

  function acceptsGeneration(current, generation) {
    const record = copyRecord(current);
    if (!record || !isGeneration(generation)) return false;
    if (record.generation !== generation) return false;
    return record.status === STATUS.STARTING || record.status === STATUS.ACTIVE;
  }

  function reduceSession(current, event) {
    const record = current == null ? null : copyRecord(current);
    if (!event || typeof event !== 'object' || typeof event.type !== 'string') return record;
    if (!isPositiveInteger(event.tabId)) return record;
    if (!isTimestamp(event.now)) return record;
    if (record && record.tabId !== event.tabId) return record;
    switch (event.type) {
      case 'BEGIN':
        return beginGeneration(record, event.tabId, event.now);
      case 'READY':
        return markActive(record, event.generation, event.now, event.reason == null ? null : event.reason);
      case 'COMMIT_READY':
        return clearActiveReason(record, event.generation, event.now);
      case 'TERMINATE':
        return beginTermination(record, event.generation, event.reason, event.now);
      case 'FINISH':
        return finishTermination(record, event.generation, event.now);
      default:
        return record;
    }
  }

  return {
    STATUS,
    storageKeyForTab,
    createOffState,
    beginGeneration,
    markActive,
    clearActiveReason,
    beginTermination,
    finishTermination,
    acceptsGeneration,
    reduceSession
  };
}

if (!SELF_TEST) {
  delete globalThis.FSBSkopeoSessionState;
}

const lifecycle = SELF_TEST
  ? createTransitionOracle()
  : require('../extension/utils/skopeo-session-state.js');

function assertRecordKeys(record) {
  assert.deepEqual(Object.keys(record).sort(), [
    'generation',
    'reason',
    'status',
    'tabId',
    'terminalGeneration',
    'updatedAt'
  ]);
}

function assertUnchanged(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function driveRoute(id, overrides = {}) {
  const contextKind = overrides.contextKind || 'vendor-folder';
  const identityId = overrides.identityId || id;
  return {
    url: overrides.url || `https://drive.google.com/drive/u/0/folders/${id}`,
    contextKind,
    semanticIdentity: overrides.semanticIdentity === undefined
      ? { kind: 'drive-folder', id: identityId }
      : overrides.semanticIdentity,
    evidence: overrides.evidence || [
      { signal: 'exact-origin', value: 'https://drive.google.com' },
      { signal: 'trusted-context-kind', value: contextKind },
      { signal: 'drive-item-id', value: id }
    ]
  };
}

function anchorDescriptor(anchorId, routeResult) {
  return {
    anchorId,
    contextEpoch: routeResult.contextEpoch,
    semanticIdentity: plain(routeResult.semanticIdentity),
    candidateLocators: [{ kind: 'drive-item-id', value: routeResult.semanticIdentity.id }],
    validators: ['semantic-identity', 'connected', 'geometry']
  };
}

function catalogProjection(generation, overrides = {}) {
  const exactOrigin = overrides.exactOrigin || 'https://drive.google.com';
  const service = new URL(exactOrigin).hostname;
  const schemaDigest = 'sha256:' + 'b'.repeat(64);
  return {
    status: 'recognized',
    tabId: overrides.tabId || 9,
    generation,
    exactOrigin,
    service,
    appStem: overrides.appStem || 'gdrive',
    profileId: overrides.profileId || 'generic-default-v1',
    profileVersion: overrides.profileVersion || 'skopeo-profiles-v1',
    catalogVersion: overrides.catalogVersion || 'sha256:' + 'a'.repeat(64),
    profile: {
      profileDisposition: 'generic-default',
      displayName: 'Drive',
      defaultGenre: 'generic-app',
      pageNoun: 'view',
      entityVocabulary: { singular: 'item', plural: 'items' },
      attentionCeiling: 'ambient',
      adapterId: 'generic-unanchored-v1',
      rendererId: 'generic-default-v1'
    },
    capabilityGroups: [{
      id: 'review',
      label: 'Review',
      capabilities: [{
        slug: (overrides.appStem || 'gdrive') + '.list_items',
        actionLabel: 'List items',
        effect: 'read-only',
        sideEffectClass: 'read',
        executionOrigin: exactOrigin,
        schemaDigest,
        executionBlockReason: null,
        paramSummary: { count: 0, required: [], optional: [], truncated: false },
        argumentContract: { mode: 'empty', fields: [], reason: null, schemaDigest },
        consequenceCompatible: false,
        consequenceDigest: null,
        actionabilityReason: null,
        sourceReadiness: 't1-ready',
        sourceTerminalState: 't1-ready',
        surfaceStatus: 't1-ready',
        presentationDisposition: 't1-ready',
        executionEnabled: true,
        invocable: true
      }]
    }]
  };
}

function assertExportSurface() {
  const expectedFunctions = [
    'storageKeyForTab',
    'createOffState',
    'beginGeneration',
    'markActive',
    'clearActiveReason',
    'beginTermination',
    'finishTermination',
    'acceptsGeneration',
    'reduceSession'
  ];
  assert.deepEqual(lifecycle.STATUS, {
    OFF: 'off',
    STARTING: 'starting',
    ACTIVE: 'active',
    TERMINATING: 'terminating'
  });
  for (const name of expectedFunctions) {
    assert.equal(typeof lifecycle[name], 'function', `${name} is exported`);
  }
  if (!SELF_TEST) {
    assert.strictEqual(globalThis.FSBSkopeoSessionState, lifecycle, 'classic-script global matches CommonJS export');
  }
}

function testCatalogRuntimeConfigureSurface() {
  const runtimePath = path.resolve(__dirname, '..', 'extension', 'content', 'skopeo-runtime.js');
  const source = fs.readFileSync(runtimePath, 'utf8');
  assert.match(source, /skopeo:configure/, 'catalog runtime requires an exact configure envelope');
  assert.match(source, /FSBSkopeoAppContextResolver/, 'configure owns the adaptive context resolver');
  assert.match(source, /renderAdaptive/, 'the lifecycle retains one adaptive shell renderer');
  for (const field of CATALOG_RUNTIME_AUTHORITY_FIELDS) {
    assert.ok(source.includes(field), 'catalog lifecycle repeats ' + field + ' authority');
  }
}

function testInvalidIdentifiersAndOffState() {
  for (const tabId of [-1, 0, 1.5, NaN, Infinity, '9', null, undefined]) {
    assert.equal(lifecycle.storageKeyForTab(tabId), null, `invalid tab id ${String(tabId)} has no storage key`);
    assert.equal(lifecycle.createOffState(tabId, 0, 10), null, `invalid tab id ${String(tabId)} has no state`);
  }

  assert.equal(lifecycle.storageKeyForTab(9), 'skopeoSession:9');
  assert.equal(lifecycle.createOffState(9, -1, 10), null);
  assert.equal(lifecycle.createOffState(9, 0.5, 10), null);
  assert.equal(lifecycle.createOffState(9, 0, -1), null);
  assert.equal(lifecycle.createOffState(9, 0, Infinity), null);

  const off = lifecycle.createOffState(9, 0, 100);
  assert.deepEqual(off, {
    tabId: 9,
    generation: 0,
    status: lifecycle.STATUS.OFF,
    terminalGeneration: 0,
    updatedAt: 100,
    reason: null
  });
  assertRecordKeys(off);
  assert.equal(lifecycle.acceptsGeneration(off, 0), false);
}

function testStartReadyAndPreparedCommit() {
  const starting = lifecycle.beginGeneration(null, 9, 110);
  assert.deepEqual(starting, {
    tabId: 9,
    generation: 1,
    status: lifecycle.STATUS.STARTING,
    terminalGeneration: 0,
    updatedAt: 110,
    reason: null
  });
  assert.equal(lifecycle.acceptsGeneration(starting, 1), true);
  assert.equal(lifecycle.acceptsGeneration(starting, 0), false);
  assert.equal(lifecycle.acceptsGeneration(starting, 2), false);
  assert.equal(lifecycle.acceptsGeneration(starting, '1'), false);

  const staleReady = lifecycle.markActive(starting, 0, 120);
  assertUnchanged(staleReady, starting, 'stale generation cannot become active');

  for (const reason of ['', 'ready', 1, {}, []]) {
    const rejected = lifecycle.markActive(starting, 1, 120, reason);
    assertUnchanged(rejected, starting, `active reason ${JSON.stringify(reason)} fails closed`);
  }

  const prepared = lifecycle.markActive(starting, 1, 120, PREPARED_REASON);
  assert.equal(prepared.status, lifecycle.STATUS.ACTIVE);
  assert.equal(prepared.reason, PREPARED_REASON);
  assert.equal(lifecycle.acceptsGeneration(prepared, 1), true);

  const roundTripPrepared = JSON.parse(JSON.stringify(prepared));
  assert.deepEqual(roundTripPrepared, prepared);
  assert.equal(roundTripPrepared.reason, PREPARED_REASON);
  assertRecordKeys(roundTripPrepared);

  assertUnchanged(
    lifecycle.clearActiveReason(starting, 1, 125),
    starting,
    'STARTING cannot clear the commit marker'
  );
  assertUnchanged(
    lifecycle.clearActiveReason(prepared, 2, 125),
    prepared,
    'wrong generation cannot clear the commit marker'
  );

  const committed = lifecycle.clearActiveReason(prepared, 1, 130);
  assert.equal(committed.status, lifecycle.STATUS.ACTIVE);
  assert.equal(committed.reason, null);
  assert.equal(committed.updatedAt, 130);
  assertUnchanged(
    lifecycle.clearActiveReason(committed, 1, 140),
    committed,
    'clearing an absent marker is idempotent'
  );

  assertUnchanged(
    lifecycle.markActive(committed, 1, 999, null),
    committed,
    'duplicate activation is an exact no-op'
  );

  const activeWithoutMarker = lifecycle.markActive(starting, 1, 121, null);
  assert.equal(activeWithoutMarker.status, lifecycle.STATUS.ACTIVE);
  assert.equal(activeWithoutMarker.reason, null);
}

function testTerminationFromStartingAndActive() {
  const starting = lifecycle.beginGeneration(null, 9, 200);
  const terminatingStart = lifecycle.beginTermination(starting, 1, 'toggle_off', 210);
  assert.equal(terminatingStart.status, lifecycle.STATUS.TERMINATING);
  assert.equal(terminatingStart.terminalGeneration, 1);
  assert.equal(terminatingStart.reason, 'toggle_off');
  assert.equal(lifecycle.acceptsGeneration(terminatingStart, 1), false);

  const offFromStart = lifecycle.finishTermination(terminatingStart, 1, 220);
  assert.equal(offFromStart.status, lifecycle.STATUS.OFF);
  assert.equal(offFromStart.generation, 1);
  assert.equal(offFromStart.terminalGeneration, 1);
  assert.equal(offFromStart.reason, 'toggle_off');
  assert.equal(lifecycle.acceptsGeneration(offFromStart, 1), false);

  const active = lifecycle.markActive(lifecycle.beginGeneration(null, 10, 300), 1, 310, null);
  const activeSnapshot = JSON.stringify(active);
  const terminatingActive = lifecycle.beginTermination(active, 1, 'escape_escape', 320);
  assert.equal(JSON.stringify(active), activeSnapshot, 'termination does not mutate the caller record');
  assert.equal(terminatingActive.status, lifecycle.STATUS.TERMINATING);
  assert.equal(terminatingActive.terminalGeneration, 1);
  assert.equal(lifecycle.acceptsGeneration(terminatingActive, 1), false);

  const offFromActive = lifecycle.finishTermination(terminatingActive, 1, 330);
  const serialized = JSON.parse(JSON.stringify(offFromActive));
  assert.equal(serialized.terminalGeneration, 1, 'terminal tombstone survives JSON round-trip');
  assert.deepEqual(serialized, offFromActive);

  assertUnchanged(
    lifecycle.beginTermination(offFromActive, 1, 'escape_escape', 340),
    offFromActive,
    'repeated termination remains off'
  );
  assertUnchanged(
    lifecycle.finishTermination(offFromActive, 1, 350),
    offFromActive,
    'repeated finish remains off'
  );
  assertUnchanged(
    lifecycle.beginTermination(active, 1, '', 321),
    active,
    'empty termination reason fails closed'
  );
  assertUnchanged(
    lifecycle.beginTermination(active, 2, 'wrong_generation', 321),
    active,
    'future termination generation fails closed'
  );
}

async function testLateCompletionAfterKillCannotResurrect() {
  const starting = lifecycle.beginGeneration(null, 21, 400);
  let current = starting;
  let release;
  const deferred = new Promise((resolve) => {
    release = resolve;
  });

  const lateCompletion = deferred.then((generation) => ({
    admitted: lifecycle.acceptsGeneration(current, generation),
    renderedState: lifecycle.markActive(current, generation, 450, null)
  }));

  current = lifecycle.beginTermination(current, 1, 'universal_kill', 410);
  assert.equal(current.status, lifecycle.STATUS.TERMINATING, 'terminal boundary exists before deferred work resumes');
  assert.equal(current.terminalGeneration, 1);
  current = lifecycle.finishTermination(current, 1, 420);

  release(1);
  const result = await lateCompletion;
  assert.equal(result.admitted, false, 'late completion after kill cannot resurrect');
  assertUnchanged(result.renderedState, current, 'late completion cannot transition OFF to ACTIVE');

  const timerAdmission = () => lifecycle.acceptsGeneration(current, 1);
  const messageReady = () => lifecycle.reduceSession(current, {
    type: 'READY',
    tabId: 21,
    generation: 1,
    now: 460,
    reason: null
  });
  assert.equal(timerAdmission(), false, 'queued timer for terminal generation is rejected');
  assertUnchanged(messageReady(), current, 'queued message for terminal generation is rejected');

  const generationTwo = lifecycle.beginGeneration(current, 21, 500);
  assert.equal(generationTwo.generation, 2);
  assert.equal(generationTwo.status, lifecycle.STATUS.STARTING);
  assert.equal(generationTwo.terminalGeneration, 1);
  assert.equal(generationTwo.reason, null, 'new generation does not restore prior reason');
  assert.equal(lifecycle.acceptsGeneration(generationTwo, 2), true);
  assert.equal(lifecycle.acceptsGeneration(generationTwo, 1), false, 'generation one stays stale after reinvocation');
  assertUnchanged(
    lifecycle.markActive(generationTwo, 1, 510, null),
    generationTwo,
    'late generation-one ready cannot activate generation two'
  );
}

function testReducerAndTabIsolation() {
  let tabA = lifecycle.reduceSession(null, { type: 'BEGIN', tabId: 31, now: 600 });
  let tabB = lifecycle.reduceSession(null, { type: 'BEGIN', tabId: 32, now: 601 });
  assert.equal(tabA.generation, 1);
  assert.equal(tabB.generation, 1);

  tabA = lifecycle.reduceSession(tabA, {
    type: 'READY',
    tabId: 31,
    generation: 1,
    reason: PREPARED_REASON,
    now: 610
  });
  assert.equal(tabA.status, lifecycle.STATUS.ACTIVE);
  assert.equal(tabA.reason, PREPARED_REASON);

  tabA = lifecycle.reduceSession(tabA, {
    type: 'COMMIT_READY',
    tabId: 31,
    generation: 1,
    now: 620
  });
  assert.equal(tabA.reason, null);

  const tabBBeforeCrossEvent = JSON.parse(JSON.stringify(tabB));
  assertUnchanged(
    lifecycle.reduceSession(tabB, {
      type: 'TERMINATE',
      tabId: 31,
      generation: 1,
      reason: 'wrong_tab',
      now: 630
    }),
    tabBBeforeCrossEvent,
    'Tab A event cannot mutate Tab B record'
  );

  tabA = lifecycle.reduceSession(tabA, {
    type: 'TERMINATE',
    tabId: 31,
    generation: 1,
    reason: 'toggle_off',
    now: 640
  });
  tabA = lifecycle.reduceSession(tabA, {
    type: 'FINISH',
    tabId: 31,
    generation: 1,
    now: 650
  });
  assert.equal(tabA.status, lifecycle.STATUS.OFF);
  assert.equal(lifecycle.acceptsGeneration(tabB, 1), true, 'killing Tab A leaves Tab B renderable');
  assert.deepEqual(tabB, tabBBeforeCrossEvent, 'Tab B record remains byte-for-byte equivalent');

  assertUnchanged(
    lifecycle.reduceSession(tabA, { type: 'UNKNOWN', tabId: 31, now: 660 }),
    tabA,
    'unknown reducer event fails closed'
  );
  assertUnchanged(
    lifecycle.reduceSession(tabA, { type: 'BEGIN', tabId: 32, now: 670 }),
    tabA,
    'cross-tab BEGIN cannot select another tab record'
  );
  assertUnchanged(
    lifecycle.reduceSession(tabA, { type: 'BEGIN', tabId: 31, now: -1 }),
    tabA,
    'malformed event timestamp fails closed'
  );
}

// ---------------------------------------------------------------------------
// Page runtime integration oracle and VM harness
// ---------------------------------------------------------------------------

const ZERO_RESOURCES = zeroSnapshot();

function runtimeIntegrationOracleEntrypoint() {
  (function () {
    'use strict';

    const STALE_CODE = 'SKOPEO_STALE_GENERATION';
    const DOUBLE_ESCAPE_MS = 600;

    function positiveGeneration(value) {
      return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
    }

    function exactEnvelope(envelope, action) {
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return false;
      if (envelope.action !== action || !positiveGeneration(envelope.generation)) return false;
      const expected = action === 'skopeo:terminate'
        ? ['action', 'generation', 'reason']
        : ['action', 'generation'];
      const keys = Object.keys(envelope).sort();
      if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
      return action !== 'skopeo:terminate' ||
        (typeof envelope.reason === 'string' && envelope.reason.trim().length > 0);
    }

    function zeroResources() {
      return {
        roots: 0,
        listeners: 0,
        observers: 0,
        timeouts: 0,
        intervals: 0,
        animationFrames: 0,
        animations: 0,
        focusHooks: 0,
        pointerSurfaces: 0,
        pendingRenders: 0,
        popoverTopLayer: 0
      };
    }

    function installOwner() {
      const state = {
        generation: 0,
        phase: 'idle',
        disposed: false,
        terminal: false,
        mounted: false,
        attention: 'ambient',
        controller: null,
        shell: null,
        preparedPlacement: null,
        fixtureToken: null,
        fixtureTimerId: null,
        fixtureActivated: false,
        lastEscapeAt: null,
        teardownReason: null,
        teardownOrder: [],
        finalSnapshot: null,
        runtimeListenerInstalled: false,
        activeListenersInstalled: false
      };
      const api = {};

      function live(generation) {
        return !state.disposed && !state.terminal && state.generation === generation &&
          state.controller && !state.controller.signal.aborted;
      }

      function snapshot() {
        const resources = state.shell && typeof state.shell.getResourceSnapshot === 'function'
          ? state.shell.getResourceSnapshot()
          : zeroResources();
        return {
          generation: state.generation,
          phase: state.phase,
          terminal: state.terminal,
          disposed: state.disposed,
          aborted: !!(state.controller && state.controller.signal.aborted),
          mounted: state.mounted,
          attention: state.attention,
          resources,
          reason: state.teardownReason,
          teardownOrder: state.teardownOrder.slice()
        };
      }

      function send(message) {
        if (!message || Object.prototype.hasOwnProperty.call(message, 'tabId')) return false;
        try {
          const result = chrome.runtime.sendMessage(message);
          if (result && typeof result.catch === 'function') result.catch(function () {});
          return true;
        } catch (_error) {
          return false;
        }
      }

      function removeActiveListeners() {
        if (!state.activeListenersInstalled) return;
        window.removeEventListener('keydown', onKeydown, true);
        window.removeEventListener('pagehide', onPagehide, false);
        state.activeListenersInstalled = false;
      }

      function teardown(reason) {
        if (state.finalSnapshot) return state.finalSnapshot;

        state.terminal = true;
        state.disposed = true;
        state.phase = 'terminal';
        state.teardownReason = typeof reason === 'string' && reason ? reason : 'off';
        state.teardownOrder.push('terminal');

        state.teardownOrder.push('abort');
        if (state.controller && !state.controller.signal.aborted) state.controller.abort(state.teardownReason);
        if (state.fixtureTimerId !== null) {
          clearTimeout(state.fixtureTimerId);
          state.fixtureTimerId = null;
        }

        state.teardownOrder.push('destroy');
        let resources = zeroResources();
        if (state.shell && typeof state.shell.destroy === 'function') {
          try {
            resources = state.shell.destroy(state.teardownReason) || zeroResources();
          } catch (_error) {
            resources = state.shell && typeof state.shell.getResourceSnapshot === 'function'
              ? state.shell.getResourceSnapshot()
              : zeroResources();
          }
        }
        state.mounted = false;

        state.teardownOrder.push('teardown-complete');
        if (positiveGeneration(state.generation)) {
          send({
            action: 'skopeo:teardown-complete',
            generation: state.generation,
            reason: state.teardownReason,
            resources
          });
        }

        state.teardownOrder.push('unregister-runtime-listener');
        if (state.runtimeListenerInstalled) {
          chrome.runtime.onMessage.removeListener(onRuntimeMessage);
          state.runtimeListenerInstalled = false;
        }

        state.teardownOrder.push('unregister-key/pagehide-listeners');
        removeActiveListeners();

        state.teardownOrder.push('delete-fixture-hook');
        delete api.activateControlledFixtureForTest;
        if (Object.prototype.hasOwnProperty.call(window, '__FSB_SKOPEO_TEST_FIXTURE__')) {
          delete window.__FSB_SKOPEO_TEST_FIXTURE__;
        }

        state.teardownOrder.push('delete-sentinel');
        if (window.__FSB_SKOPEO_RUNTIME__ === api) delete window.__FSB_SKOPEO_RUNTIME__;

        state.preparedPlacement = null;
        state.fixtureToken = null;
        state.fixtureActivated = false;
        state.lastEscapeAt = null;
        state.shell = null;
        state.finalSnapshot = {
          generation: state.generation,
          phase: state.phase,
          terminal: true,
          disposed: true,
          aborted: true,
          mounted: false,
          attention: state.attention,
          resources,
          reason: state.teardownReason,
          teardownOrder: state.teardownOrder.slice()
        };
        return state.finalSnapshot;
      }

      function requestKill(reason) {
        if (!live(state.generation)) return false;
        const allowed = reason === 'close' || reason === 'escape' ||
          reason === 'unsafe-layout' || reason === 'navigation'
          ? reason
          : 'close';
        send({ action: 'skopeo:kill-request', generation: state.generation, reason: allowed });
        teardown(allowed);
        return true;
      }

      function onShellClose(payload) {
        const reason = payload && payload.reason === 'back' ? 'escape' : 'close';
        requestKill(reason);
      }

      function onShellKill(payload) {
        const requested = payload && payload.reason;
        const reason = requested === 'unsafe-layout'
          ? 'unsafe-layout'
          : (typeof requested === 'string' && requested.indexOf('escape') !== -1 ? 'escape' : 'close');
        requestKill(reason);
      }

      function onShellEscape(payload) {
        if (!payload || !live(state.generation)) return;
        if (Number.isFinite(payload.timestamp)) state.lastEscapeAt = payload.timestamp;
        if (['ambient', 'anchored', 'focused', 'interstitial'].includes(payload.to)) {
          state.attention = payload.to;
        }
      }

      function prepare(envelope) {
        if (!exactEnvelope(envelope, 'skopeo:prepare') || state.disposed) return false;
        const generation = envelope.generation;
        if (state.generation && generation < state.generation) return false;
        if (generation === state.generation && (state.phase === 'prepared' || state.phase === 'active')) return true;
        if (state.generation && generation > state.generation) {
          teardown('replacement');
          const successor = installOwner();
          return successor.prepare(envelope);
        }
        if (!window.FSBSkopeoShell || typeof window.FSBSkopeoShell.createShell !== 'function') return false;

        state.generation = generation;
        state.phase = 'preparing';
        state.controller = new AbortController();
        state.fixtureToken = Object.freeze({});
        try {
          state.shell = window.FSBSkopeoShell.createShell({
            document,
            window,
            generation,
            signal: state.controller.signal,
            allowControlledFixture: true,
            fixtureToken: state.fixtureToken,
            onRequestClose: onShellClose,
            onRequestKill: onShellKill,
            onEscapeConsumed: onShellEscape
          });
          state.preparedPlacement = state.shell.prepareAmbient();
          const placement = state.shell.getPreparedPlacementMode(state.preparedPlacement);
          if (!state.preparedPlacement || (placement !== 'full' && placement !== 'compact')) {
            send({ action: 'skopeo:kill-request', generation, reason: 'unsafe-layout' });
            teardown('unsafe-layout');
            return false;
          }
          if (!live(generation)) return false;
          state.phase = 'prepared';
          send({ action: 'skopeo:prepared', generation, placement });
          return true;
        } catch (_error) {
          teardown('failed-start');
          return false;
        }
      }

      function commit(envelope) {
        if (!exactEnvelope(envelope, 'skopeo:commit') || state.disposed) return false;
        if (envelope.generation !== state.generation) return false;
        if (state.phase === 'active' && state.mounted) return true;
        if (state.phase !== 'prepared' || !state.shell || !state.preparedPlacement) return false;
        const generation = state.generation;
        const placement = state.preparedPlacement;
        state.preparedPlacement = null;
        let mounted = false;
        try {
          mounted = state.shell.mountAmbient(placement) === true;
        } catch (_error) {
          mounted = false;
        }
        if (!mounted || !live(generation)) {
          teardown('failed-start');
          return false;
        }
        state.mounted = true;
        state.phase = 'active';
        state.attention = 'ambient';
        window.addEventListener('keydown', onKeydown, true);
        window.addEventListener('pagehide', onPagehide, false);
        state.activeListenersInstalled = true;
        if (!live(generation)) return false;
        send({ action: 'skopeo:ready', generation, attention: 'ambient' });
        return true;
      }

      function probe(envelope) {
        if (!exactEnvelope(envelope, 'skopeo:probe')) return false;
        if (!state.disposed && state.phase === 'active' && state.mounted && envelope.generation === state.generation) {
          return {
            success: true,
            generation: envelope.generation,
            status: 'active',
            attention: 'ambient',
            mounted: true
          };
        }
        return {
          success: false,
          generation: envelope.generation,
          status: 'stale',
          code: STALE_CODE
        };
      }

      function terminate(envelope) {
        if (!exactEnvelope(envelope, 'skopeo:terminate')) return false;
        if (envelope.generation !== state.generation) return false;
        if (state.disposed) return state.finalSnapshot || false;
        return teardown(envelope.reason.trim());
      }

      function activateControlledFixtureForTest() {
        if (!live(state.generation) || state.phase !== 'active' || !state.mounted) return false;
        if (window.__FSB_SKOPEO_TEST_FIXTURE__ !== true) return false;
        if (!state.shell || typeof state.shell.enableControlledFixture !== 'function') return false;
        if (state.fixtureActivated) return true;
        if (!state.shell.enableControlledFixture(state.fixtureToken)) return false;
        const generation = state.generation;
        state.fixtureActivated = true;
        state.fixtureTimerId = setTimeout(function () {
          state.fixtureTimerId = null;
          if (!live(generation) || !state.shell || typeof state.shell.render !== 'function') return;
          if (state.shell.render('anchored', { announcement: 'Skopeo controlled fixture ready.' })) {
            state.attention = 'anchored';
          }
        }, 25);
        return true;
      }

      function onKeydown(event) {
        if (!event || event.defaultPrevented || event.key !== 'Escape' || event.repeat || event.isComposing) return;
        if (!live(state.generation) || !state.mounted || !state.shell) return;
        const now = window.performance && typeof window.performance.now === 'function'
          ? window.performance.now()
          : Date.now();
        if (state.lastEscapeAt !== null && now - state.lastEscapeAt <= DOUBLE_ESCAPE_MS) {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          if (typeof event.stopPropagation === 'function') event.stopPropagation();
          requestKill('escape');
          return;
        }
        const consumed = state.shell.back() === true;
        if (!consumed) return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        if (live(state.generation)) {
          state.lastEscapeAt = now;
          const shellSnapshot = typeof state.shell.getSnapshot === 'function' ? state.shell.getSnapshot() : null;
          if (shellSnapshot && typeof shellSnapshot.attention === 'string') state.attention = shellSnapshot.attention;
        }
      }

      function onPagehide() {
        requestKill('navigation');
      }

      function onRuntimeMessage(message, sender, sendResponse) {
        if (!sender || sender.id !== chrome.runtime.id) return false;
        let response = false;
        if (message && message.action === 'skopeo:prepare') response = prepare(message);
        else if (message && message.action === 'skopeo:commit') response = commit(message);
        else if (message && message.action === 'skopeo:probe') response = probe(message);
        else if (message && message.action === 'skopeo:terminate') response = terminate(message);
        if (typeof sendResponse === 'function') sendResponse(response);
        return false;
      }

      api.prepare = prepare;
      api.commit = commit;
      api.probe = probe;
      api.terminate = terminate;
      api.getSnapshot = function () { return state.finalSnapshot || snapshot(); };
      api.activateControlledFixtureForTest = activateControlledFixtureForTest;
      api.disposeForReplacement = function () { return teardown('replacement'); };

      window.__FSB_SKOPEO_RUNTIME__ = api;
      chrome.runtime.onMessage.addListener(onRuntimeMessage);
      state.runtimeListenerInstalled = true;
      return api;
    }

    const previous = window.__FSB_SKOPEO_RUNTIME__;
    if (previous && typeof previous.disposeForReplacement === 'function') {
      previous.disposeForReplacement();
    }
    installOwner();
  })();
}

class ListenerRegistry {
  constructor(onRemove) {
    this.entries = [];
    this.onRemove = onRemove;
  }

  add(type, listener, options) {
    if (!this.entries.some(entry => entry.type === type && entry.listener === listener && entry.options === options)) {
      this.entries.push({ type, listener, options });
    }
  }

  remove(type, listener, options) {
    const before = this.entries.length;
    this.entries = this.entries.filter(entry => !(
      entry.type === type && entry.listener === listener && entry.options === options
    ));
    if (before !== this.entries.length && this.onRemove) this.onRemove(type);
  }

  count(type) {
    return this.entries.filter(entry => !type || entry.type === type).length;
  }

  dispatch(type, event) {
    const snapshot = this.entries.filter(entry => entry.type === type);
    for (const entry of snapshot) {
      if (this.entries.includes(entry)) entry.listener(event);
    }
  }
}

function createRuntimeHarness(options = {}) {
  const operations = [];
  const outbound = [];
  const shells = [];
  const routers = [];
  const registries = [];
  const timers = [];
  let now = 1000;
  let nextTimerId = 1;
  const windowListeners = new ListenerRegistry(type => operations.push(`remove-window:${type}`));
  const runtimeListeners = new ListenerRegistry(() => operations.push('remove-runtime-listener'));

  const observationRoot = {
    id: 'narrow-observation-root',
    isConnected: true,
    contains(node) { return node === this || !!(node && node.parentNode === this); }
  };
  const documentElement = { id: 'document-element', isConnected: true };
  const body = { id: 'document-body', isConnected: true };
  const document = {
    activeElement: { id: 'host-focus' },
    documentElement,
    body,
    createElement() { return {}; }
  };

  function resourceSnapshot(mounted) {
    return { ...ZERO_RESOURCES, roots: mounted ? 1 : 0, popoverTopLayer: mounted ? 1 : 0 };
  }

  const shellFactory = {
    createShell(settings) {
      operations.push(`create-shell:${settings.generation}`);
      const behavior = options.shellBehaviors && options.shellBehaviors.length
        ? options.shellBehaviors.shift()
        : {};
      const shell = {
        generation: settings.generation,
        settings,
        mounted: false,
        destroyed: false,
        attention: 'ambient',
        preparedToken: null,
        fixtureEnabled: false,
        renderCalls: 0,
        focusCalls: 0,
        backCalls: 0,
        contextProjections: [],
        anchorCommits: [],
        anchorWithdrawals: [],
        adaptiveModels: [],
        prepareAmbient() {
          operations.push(`prepare-ambient:${this.generation}`);
          if (behavior.prepareFails) return null;
          this.preparedToken = Object.freeze({});
          return this.preparedToken;
        },
        getPreparedPlacementMode(token) {
          operations.push(`placement-mode:${this.generation}`);
          return token === this.preparedToken ? (behavior.placement || 'full') : null;
        },
        mountAmbient(token) {
          operations.push(`mount-ambient:${this.generation}`);
          if (behavior.mountFails || token !== this.preparedToken || this.destroyed) return false;
          this.preparedToken = null;
          this.mounted = true;
          return true;
        },
        getResourceSnapshot() {
          return resourceSnapshot(this.mounted && !this.destroyed);
        },
        getSnapshot() {
          return { attention: this.attention, mounted: this.mounted && !this.destroyed };
        },
        projectContext(model) {
          if (this.destroyed || !this.mounted) return false;
          const projection = plain(model);
          this.contextProjections.push(projection);
          operations.push(`project-context:${this.generation}:${projection.contextEpoch}:${projection.status}`);
          return true;
        },
        commitSemanticAnchor(projection) {
          if (this.destroyed || !this.mounted) return false;
          const committed = plain(projection);
          this.anchorCommits.push(committed);
          operations.push(`commit-anchor:${committed.contextEpoch}:${committed.semanticIdentity.id}:${committed.bindingEpoch}`);
          return true;
        },
        withdrawSemanticAnchor(model) {
          if (this.destroyed || !this.mounted) return false;
          const withdrawn = plain(model);
          this.anchorWithdrawals.push(withdrawn);
          operations.push(`withdraw-anchor:${withdrawn.contextEpoch}:${withdrawn.bindingEpoch}:${withdrawn.reason}`);
          return true;
        },
        back() {
          this.backCalls += 1;
          operations.push(`back:${this.generation}:${this.attention}`);
          if (this.destroyed || !this.mounted) return false;
          if (this.attention === 'ambient') {
            settings.onRequestClose({ generation: this.generation, reason: 'back', state: 'ambient' });
            return true;
          }
          if (this.attention === 'anchored') this.attention = 'ambient';
          else if (this.attention === 'focused') this.attention = 'anchored';
          else this.attention = 'focused';
          return true;
        },
        enableControlledFixture(token) {
          operations.push(`enable-fixture:${this.generation}`);
          if (token !== settings.fixtureToken || this.destroyed || !this.mounted) return false;
          this.fixtureEnabled = true;
          return true;
        },
        render(attention) {
          this.renderCalls += 1;
          operations.push(`render:${this.generation}:${attention}`);
          if (this.destroyed || !this.mounted || !this.fixtureEnabled) return false;
          this.attention = attention;
          return true;
        },
        renderAdaptive(model, atoms) {
          if (this.destroyed || !this.mounted || !model || !Array.isArray(atoms)) return false;
          this.adaptiveModels.push(plain(model));
          this.attention = model.attention;
          operations.push(`render-adaptive:${this.generation}:${model.attention}:${model.authority.contextEpoch}`);
          return true;
        },
        destroy(reason) {
          operations.push(`destroy:${this.generation}:${reason}:${settings.signal.aborted ? 'aborted' : 'live'}`);
          this.destroyed = true;
          this.mounted = false;
          if (Object.prototype.hasOwnProperty.call(behavior, 'destroyResources')) {
            return behavior.destroyResources;
          }
          return { ...ZERO_RESOURCES };
        },
        requestClose(reason = 'close') {
          settings.onRequestClose({ generation: this.generation, reason, state: this.attention });
        },
        requestKill(reason = 'control') {
          settings.onRequestKill({ generation: this.generation, reason, state: this.attention });
        },
        adaptiveAction(payload) {
          return settings.onAdaptiveAction(payload);
        }
      };
      shells.push(shell);
      return shell;
    }
  };

  const routerFactory = Object.freeze({
    ...CONTEXT_ROUTER,
    createRouter(settings) {
      const realRouter = CONTEXT_ROUTER.createRouter(settings);
      const router = {
        generation: settings.generation,
        disposed: false,
        route(input) {
          const result = realRouter.route(input);
          operations.push(`route:${settings.generation}:${result.contextEpoch}:${result.status}`);
          return result;
        },
        currentEpoch() { return realRouter.currentEpoch(); },
        dispose() {
          if (this.disposed) return true;
          this.disposed = true;
          operations.push(`dispose-router:${settings.generation}`);
          return realRouter.dispose();
        }
      };
      routers.push(router);
      operations.push(`create-router:${settings.generation}`);
      return router;
    }
  });

  const registryFactory = Object.freeze({
    BINDING_REASON: Object.freeze({
      MANUAL: 'manual',
      REBIND: 'rebind',
      CONTEXT_CHANGED: 'context-changed',
      NAVIGATION: 'navigation',
      DISPOSED: 'disposed'
    }),
    createRegistry(settings) {
      const descriptors = new Map();
      const bindingEpochs = new Map();
      const boundAnchors = new Set();
      const pendingHandles = new Map();
      const owned = [
        settings.resourceLedger.acquire('observers', function () {}, 'test registry observer'),
        settings.resourceLedger.acquire('listeners', function () {}, 'test registry listener')
      ];
      const registry = {
        settings,
        context: null,
        disposed: false,
        setContext(context) {
          if (this.disposed) return false;
          this.context = plain(context);
          operations.push(`registry-context:${context.contextEpoch}`);
          return true;
        },
        register(descriptor) {
          if (this.disposed) return null;
          const value = plain(descriptor);
          descriptors.set(value.anchorId, value);
          bindingEpochs.set(value.anchorId, bindingEpochs.get(value.anchorId) || 0);
          operations.push(`registry-register:${value.anchorId}:${value.contextEpoch}`);
          return Object.freeze(value);
        },
        resolve(anchorId) {
          if (this.disposed || !descriptors.has(anchorId)) return false;
          bindingEpochs.set(anchorId, bindingEpochs.get(anchorId) + 1);
          const handle = settings.resourceLedger.acquire('pendingRenders', undefined, `test resolver ${anchorId}`);
          pendingHandles.set(anchorId, handle);
          operations.push(`registry-resolve:${anchorId}:${bindingEpochs.get(anchorId)}`);
          return true;
        },
        withdraw(anchorId, reason) {
          if (this.disposed || !descriptors.has(anchorId)) return false;
          const nextEpoch = (bindingEpochs.get(anchorId) || 0) + 1;
          bindingEpochs.set(anchorId, nextEpoch);
          boundAnchors.delete(anchorId);
          operations.push(`registry-withdraw:${anchorId}:${reason}:${nextEpoch}`);
          settings.onWithdraw({ anchorId, reason, bindingEpoch: nextEpoch });
          return true;
        },
        emitCommit(anchorId, overrides = {}) {
          const descriptor = descriptors.get(anchorId);
          if (!descriptor) return false;
          const handle = pendingHandles.get(anchorId);
          if (handle) {
            settings.resourceLedger.release(handle, { cleanup: false, suppressCleanupError: true });
            pendingHandles.delete(anchorId);
          }
          const projection = {
            generation: overrides.generation || settings.generation,
            contextEpoch: overrides.contextEpoch || descriptor.contextEpoch,
            semanticIdentity: overrides.semanticIdentity || descriptor.semanticIdentity,
            bindingEpoch: overrides.bindingEpoch || bindingEpochs.get(anchorId),
            targetRect: overrides.targetRect || { left: 50, top: 50, width: 100, height: 32, right: 150, bottom: 82 }
          };
          boundAnchors.add(anchorId);
          operations.push(`registry-commit-callback:${anchorId}:${projection.contextEpoch}`);
          return settings.onCommit(Object.freeze(projection));
        },
        emitWithdraw(anchorId, reason = 'context-changed') {
          const nextEpoch = (bindingEpochs.get(anchorId) || 0) + 1;
          bindingEpochs.set(anchorId, nextEpoch);
          boundAnchors.delete(anchorId);
          return settings.onWithdraw({ anchorId, reason, bindingEpoch: nextEpoch });
        },
        signal(kind) {
          operations.push(`registry-signal:${kind}`);
          return !this.disposed;
        },
        getSnapshot() {
          return {
            anchors: Array.from(descriptors.values(), (descriptor) => ({
              anchorId: descriptor.anchorId,
              semanticIdentity: descriptor.semanticIdentity,
              contextEpoch: descriptor.contextEpoch,
              bindingEpoch: bindingEpochs.get(descriptor.anchorId) || 0,
              bound: boundAnchors.has(descriptor.anchorId)
            })),
            resources: settings.resourceLedger.snapshot()
          };
        },
        dispose() {
          if (this.disposed) return settings.resourceLedger.snapshot();
          this.disposed = true;
          operations.push(`dispose-registry:${settings.generation}`);
          for (const handle of pendingHandles.values()) {
            settings.resourceLedger.release(handle, { cleanup: false, suppressCleanupError: true });
          }
          pendingHandles.clear();
          for (const handle of owned.slice().reverse()) {
            settings.resourceLedger.release(handle, { cleanup: true, suppressCleanupError: true });
          }
          return settings.resourceLedger.snapshot();
        }
      };
      registries.push(registry);
      operations.push(`create-registry:${settings.generation}`);
      return registry;
    }
  });

  class RecordingAbortController {
    constructor() {
      const listeners = new Set();
      this.signal = {
        aborted: false,
        reason: undefined,
        addEventListener(type, listener) { if (type === 'abort') listeners.add(listener); },
        removeEventListener(type, listener) { if (type === 'abort') listeners.delete(listener); }
      };
      this._listeners = listeners;
    }
    abort(reason) {
      operations.push('abort');
      this.signal.aborted = true;
      this.signal.reason = reason;
      for (const listener of Array.from(this._listeners)) listener({ type: 'abort' });
    }
  }

  const appContextResolverFactory = Object.freeze({
    createResolver(settings) {
      let epoch = 0;
      let disposed = false;
      return Object.freeze({
        resolve(request) {
          epoch += 1;
          if (disposed) return Object.freeze({ status: 'unsupported', generation: settings.generation, contextEpoch: epoch, reason: 'resolver-disposed', retryable: false });
          const projection = settings.projection;
          const context = {
            status: 'recognized',
            generation: settings.generation,
            exactOrigin: projection.exactOrigin,
            profileId: projection.profileId,
            profileVersion: projection.profileVersion,
            contextEpoch: epoch,
            app: {
              appStem: projection.appStem,
              service: projection.service,
              displayName: projection.profile.displayName,
              pageNoun: projection.profile.pageNoun
            },
            genre: projection.profile.defaultGenre,
            lens: request.requestedLens,
            semanticEntity: null,
            anchorDescriptor: null,
            capabilityGroups: projection.capabilityGroups,
            risk: { highest: 'read', readCount: 1, writeCount: 0, destructiveCount: 0 },
            reason: 'no-stable-entity',
            evidence: []
          };
          Object.freeze(context.app);
          Object.freeze(context.risk);
          Object.freeze(context.evidence);
          return Object.freeze(context);
        },
        currentEpoch() { return epoch; },
        dispose() { disposed = true; return true; }
      });
    },
    validateResult(value) { return !!value && value.status === 'recognized'; }
  });

  const adaptiveComposerFactory = Object.freeze({
    compose(input) {
      const attention = input.intent.kind === 'initial'
        ? 'ambient'
        : (input.consequence && options.rejectConsequence !== true ? 'interstitial' : 'focused');
      return Object.freeze({
        modelVersion: 1,
        authority: Object.freeze({
          generation: input.context.generation,
          exactOrigin: input.context.exactOrigin,
          profileId: input.context.profileId,
          profileVersion: input.context.profileVersion,
          contextEpoch: input.context.contextEpoch
        }),
        attention,
        primitives: Object.freeze(attention === 'ambient' ? ['rail'] : attention === 'interstitial' ? ['gate'] : []),
        lens: Object.freeze({}),
        entity: null,
        readyGroups: Object.freeze([]),
        unavailableSummary: Object.freeze({}),
        argumentCollection: input.argumentCollection,
        rendererRequest: Object.freeze({ resultStatus: input.result ? input.result.status : 'idle' }),
        consequence: attention === 'interstitial' ? input.consequence : null
      });
    },
    validateRenderModel(value) { return !!value && value.modelVersion === 1; }
  });

  const rendererRegistryFactory = Object.freeze({
    render(_rendererId, typedResult) {
      return typedResult && typedResult.status ? Object.freeze([]) : null;
    },
    validateAtoms(value) { return Array.isArray(value); }
  });

  const sandbox = {
    console,
    document,
    location: { href: options.url || 'https://drive.google.com/drive/u/0/folders/root' },
    FSBSkopeoContextRouter: routerFactory,
    FSBSkopeoAppContextResolver: appContextResolverFactory,
    FSBSkopeoAnchorRegistry: registryFactory,
    FSBSkopeoAdapterRegistry: Object.freeze({ resolve() { return null; } }),
    FSBSkopeoAdaptiveComposer: adaptiveComposerFactory,
    FSBSkopeoRendererRegistry: rendererRegistryFactory,
    FSBSkopeoShell: shellFactory,
    AbortController: RecordingAbortController,
    Date,
    URL,
    performance: { now: () => now },
    setTimeout(callback, delay) {
      const timer = { id: nextTimerId++, callback, delay, cleared: false, fired: false };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout(id) {
      const timer = timers.find(entry => entry.id === id);
      if (timer) timer.cleared = true;
    },
    addEventListener(type, listener, eventOptions) {
      windowListeners.add(type, listener, eventOptions);
    },
    removeEventListener(type, listener, eventOptions) {
      windowListeners.remove(type, listener, eventOptions);
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.chrome = {
    runtime: {
      id: 'runtime-test-extension',
      onMessage: {
        addListener(listener) {
          runtimeListeners.add('message', listener, undefined);
          operations.push('add-runtime-listener');
        },
        removeListener(listener) {
          runtimeListeners.remove('message', listener, undefined);
        }
      },
      sendMessage(message) {
        const clone = JSON.parse(JSON.stringify(message));
        outbound.push(clone);
        operations.push(`send:${clone.action}`);
        if (typeof options.runtimeResponder === 'function') {
          const response = options.runtimeResponder(clone);
          return Promise.resolve(response).then(function(value) {
            return value === undefined ? undefined : toContent(value);
          });
        }
        return Promise.resolve();
      }
    }
  };

  const context = vm.createContext(sandbox);
  const runtimePath = path.resolve(__dirname, '..', 'extension', 'content', 'skopeo-runtime.js');
  const actionAuthorityPath = path.resolve(
    __dirname, '..', 'extension', 'utils', 'skopeo-action-authority.js'
  );
  const projectorPath = path.resolve(
    __dirname, '..', 'extension', 'utils', 'skopeo-capability-projector.js'
  );
  assert.ok(fs.existsSync(runtimePath), 'production Skopeo runtime must exist for integration coverage');
  const source = fs.readFileSync(runtimePath, 'utf8');
  const actionAuthoritySource = fs.readFileSync(actionAuthorityPath, 'utf8');
  const projectorSource = fs.readFileSync(projectorPath, 'utf8');

  function evaluate() {
    vm.runInContext(actionAuthoritySource, context, { filename: actionAuthorityPath });
    vm.runInContext(projectorSource, context, { filename: projectorPath });
    vm.runInContext(source, context, { filename: runtimePath });
    return sandbox.__FSB_SKOPEO_RUNTIME__;
  }

  function toContent(value) {
    return vm.runInContext('(' + JSON.stringify(value) + ')', context);
  }

  function deliver(message, sender = { id: sandbox.chrome.runtime.id }) {
    const listeners = runtimeListeners.entries.filter(entry => entry.type === 'message');
    if (!listeners.length) {
      if (message && message.action === 'skopeo:probe') {
        return {
          success: false,
          generation: message.generation,
          status: 'missing',
          code: 'SKOPEO_RUNTIME_MISSING'
        };
      }
      return undefined;
    }
    let response;
    for (const entry of listeners.slice()) {
      if (!runtimeListeners.entries.includes(entry)) continue;
      entry.listener(toContent(message), sender, value => { response = value; });
    }
    return response;
  }

  function dispatchWindow(type, init = {}) {
    const event = {
      key: init.key,
      repeat: init.repeat === true,
      isComposing: init.isComposing === true,
      isTrusted: init.isTrusted === true,
      defaultPrevented: init.defaultPrevented === true,
      propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; }
    };
    windowListeners.dispatch(type, event);
    return event;
  }

  function runTimers({ includeCleared = false } = {}) {
    for (const timer of timers.slice()) {
      if (timer.fired || (timer.cleared && !includeCleared)) continue;
      timer.fired = true;
      timer.callback();
    }
  }

  return {
    sandbox,
    operations,
    outbound,
    shells,
    routers,
    registries,
    observationRoot,
    timers,
    windowListeners,
    runtimeListeners,
    evaluate,
    toContent,
    deliver,
    dispatchWindow,
    runTimers,
    setNow(value) { now = value; }
  };
}

function assertRuntimeOff(harness, label) {
  assert.equal(harness.runtimeListeners.count('message'), 0, `${label}: Chrome listener removed`);
  assert.equal(harness.windowListeners.count('keydown'), 0, `${label}: Escape listener removed`);
  assert.equal(harness.windowListeners.count('pagehide'), 0, `${label}: pagehide listener removed`);
  assert.equal(harness.sandbox.__FSB_SKOPEO_RUNTIME__, undefined, `${label}: sentinel removed`);
  assert.equal(harness.sandbox.__FSB_SKOPEO_TEST_FIXTURE__, undefined, `${label}: fixture flag removed`);
  for (const shell of harness.shells) {
    assert.deepEqual(shell.getResourceSnapshot(), ZERO_RESOURCES, `${label}: shell resources returned to zero`);
  }
}

function prepareAndCommit(harness, generation) {
  assert.equal(harness.deliver({
    action: 'skopeo:configure',
    generation,
    projection: catalogProjection(generation)
  }), true, 'configure accepted before prepare');
  assert.equal(harness.deliver({ action: 'skopeo:prepare', generation }), true, 'prepare accepted');
  assert.deepEqual(harness.outbound.at(-1), {
    action: 'skopeo:prepared',
    generation,
    placement: 'full'
  });
  assert.equal(harness.deliver({ action: 'skopeo:commit', generation }), true, 'matching worker commit accepted');
  assert.deepEqual(harness.outbound.at(-1), {
    action: 'skopeo:ready',
    generation,
    attention: 'ambient',
    exactOrigin: 'https://drive.google.com',
    profileId: 'generic-default-v1',
    profileVersion: 'skopeo-profiles-v1',
    catalogVersion: 'sha256:' + 'a'.repeat(64),
    contextEpoch: 1,
    semanticEntity: null
  });
}

function testRealProjectionConfigureLifecycle() {
  const cases = [
    {
      label: 'read-only Zillow',
      generation: 21,
      tabId: 121,
      url: 'https://www.zillow.com/homes/',
      requiredSlug: 'zillow.search_for_sale'
    },
    {
      label: 'consequence-compatible Notion',
      generation: 22,
      tabId: 122,
      url: 'https://app.notion.com/workspace',
      requiredSlug: 'notion.update_page'
    }
  ];

  for (const testCase of cases) {
    const projection = CAPABILITY_PROJECTOR.createProjection({
      tabId: testCase.tabId,
      generation: testCase.generation,
      url: testCase.url
    }, PROFILE_INDEX);
    assert.equal(projection.status, 'recognized', testCase.label + ' real projection is recognized');
    assert.equal(CAPABILITY_PROJECTOR.validateProjection(projection), true,
      testCase.label + ' real projection passes the authoritative validator');
    const row = projection.capabilityGroups.flatMap(group => group.capabilities)
      .find(capability => capability.slug === testCase.requiredSlug);
    assert.ok(row, testCase.label + ' includes the expected real capability');
    if (testCase.requiredSlug === 'notion.update_page') {
      assert.equal(row.consequenceCompatible, true, 'Notion write keeps its trusted consequence contract');
      assert.equal(row.argumentContract.fields.some(field => field.name === 'title'), true,
        'Notion optional title remains admitted by the shared projector contract');
    }

    const harness = createRuntimeHarness({ url: testCase.url });
    const api = harness.evaluate();
    const crossedBoundary = JSON.parse(JSON.stringify(projection));
    const contentProjection = harness.toContent(crossedBoundary);
    assert.equal(harness.sandbox.FsbSkopeoCapabilityProjector.validateProjection(contentProjection), true,
      testCase.label + ' is accepted by the projector injected beside the runtime');
    assert.equal(api.configure({
      action: 'skopeo:configure',
      generation: testCase.generation,
      projection: contentProjection
    }), true, testCase.label + ' configures after a structured-clone boundary');
    assert.equal(api.prepare({ action: 'skopeo:prepare', generation: testCase.generation }), true,
      testCase.label + ' prepares with the injected projector present');
    assert.equal(api.commit({ action: 'skopeo:commit', generation: testCase.generation }), true,
      testCase.label + ' commits through the production lifecycle');
    assert.equal(api.getSnapshot().phase, 'active', testCase.label + ' reaches active state');
    api.terminate({ action: 'skopeo:terminate', generation: testCase.generation, reason: 'test-complete' });

    const mutated = JSON.parse(JSON.stringify(projection));
    mutated.capabilityGroups[0].capabilities[0].unexpectedClaim = true;
    const rejected = createRuntimeHarness({ url: testCase.url });
    const rejectedApi = rejected.evaluate();
    assert.equal(rejectedApi.configure({
      action: 'skopeo:configure', generation: testCase.generation,
      projection: rejected.toContent(mutated)
    }), false, testCase.label + ' rejects a projector-contract mutation');
    assert.equal(rejectedApi.configure({
      action: 'skopeo:configure', generation: testCase.generation + 1,
      projection: rejected.toContent(crossedBoundary)
    }), false, testCase.label + ' rejects a mismatched current generation');
    rejectedApi.disposeForReplacement();
  }

  const originHarness = createRuntimeHarness({ url: 'https://www.zillow.com/homes/' });
  const originApi = originHarness.evaluate();
  const notionProjection = CAPABILITY_PROJECTOR.createProjection({
    tabId: 123,
    generation: 23,
    url: 'https://app.notion.com/workspace'
  }, PROFILE_INDEX);
  assert.equal(originApi.configure({
    action: 'skopeo:configure', generation: 23,
    projection: originHarness.toContent(notionProjection)
  }), false, 'runtime adds a current-document origin check to the shared projection validator');
  originApi.disposeForReplacement();
}

function testRuntimePrepareCommitAndProbe() {
  const harness = createRuntimeHarness();
  const api = harness.evaluate();
  assert.ok(api, 'runtime evaluation installs its sentinel');
  assert.deepEqual(Object.keys(api).sort(), [
    'activateControlledFixtureForTest',
    'bindSemanticAnchor',
    'commit',
    'configure',
    'configureAnchorAdapter',
    'disposeForReplacement',
    'getSnapshot',
    'prepare',
    'probe',
    'routeContext',
    'terminate',
    'withdrawSemanticAnchor'
  ].sort(), 'sentinel exposes only the lifecycle and trusted isolated-world adapter methods');
  assert.equal(harness.runtimeListeners.count('message'), 1, 'runtime evaluation installs one named message listener');
  assert.equal(harness.shells.length, 0, 'runtime evaluation creates no shell or host');
  assert.equal(harness.windowListeners.count(), 0, 'runtime evaluation creates no active page listeners');
  assert.deepEqual(plain(api.getSnapshot().resources), {
    ...ZERO_RESOURCES,
    listeners: 1
  }, 'runtime message listener is included in the combined resource snapshot');

  assert.equal(api.prepare({ generation: 1 }), false, 'bare prepare without action is rejected');
  assert.equal(api.configure({ action: 'skopeo:configure', generation: 1 }), false,
    'configure requires the exact projection envelope');
  assert.equal(api.commit({ action: 'skopeo:commit', generation: 1 }), false, 'commit before prepare fails closed');
  assert.equal(api.probe({ generation: 1 }), false, 'bare probe is rejected');
  assert.equal(harness.deliver({ action: 'skopeo:prepare', generation: 0 }), false, 'non-positive generation is rejected');
  assert.equal(
    harness.deliver({ action: 'skopeo:prepare', generation: 1 }, { id: 'page-world' }),
    undefined,
    'foreign sender cannot enter the isolated runtime'
  );
  assert.equal(
    harness.deliver({ action: 'skopeo:fixture', generation: 1 }),
    false,
    'controlled fixture has no message action'
  );

  assert.equal(harness.deliver({
    action: 'skopeo:configure',
    generation: 1,
    projection: catalogProjection(1)
  }), true, 'one exact catalog projection configures the idle runtime');
  assert.equal(harness.deliver({
    action: 'skopeo:configure',
    generation: 1,
    projection: catalogProjection(1)
  }), false, 'repeated configure is rejected even when identical');

  assert.equal(harness.deliver({ action: 'skopeo:prepare', generation: 1 }), true);
  const shell = harness.shells[0];
  assert.equal(shell.mounted, false, 'prepare remains root-free');
  assert.deepEqual(shell.getResourceSnapshot(), ZERO_RESOURCES, 'prepare owns zero shell resources');
  assert.equal(harness.windowListeners.count('keydown'), 0, 'prepare installs no Escape listener');
  assert.equal(harness.windowListeners.count('pagehide'), 0, 'prepare installs no pagehide listener');
  assert.deepEqual(plain(api.getSnapshot().resources), {
    ...ZERO_RESOURCES,
    listeners: 1
  }, 'prepared runtime owns only its message listener');
  assert.equal(shell.attention, 'ambient', 'prepare does not advance attention');
  assert.deepEqual(harness.outbound, [{
    action: 'skopeo:prepared',
    generation: 1,
    placement: 'full'
  }]);
  assert.equal(api.activateControlledFixtureForTest(), false, 'fixture hook is inert before committed activation');

  assert.equal(
    api.commit({ action: 'skopeo:commit', generation: 1, preparedPlacement: {} }),
    false,
    'foreign prepared placement is rejected as a non-exact envelope'
  );
  assert.equal(api.commit({ action: 'skopeo:commit', generation: 2 }), false, 'foreign generation commit fails closed');
  assert.equal(api.commit({ action: 'skopeo:commit', generation: 1 }), true, 'post-ACTIVE matching commit mounts');
  assert.equal(shell.mounted, true, 'matching commit creates one Ambient shell');
  assert.equal(harness.windowListeners.count('keydown'), 1, 'commit installs one runtime Escape listener');
  assert.equal(harness.windowListeners.count('pagehide'), 1, 'commit installs one runtime pagehide listener');
  assert.deepEqual(plain(api.getSnapshot().resources), {
    ...ZERO_RESOURCES,
    roots: 1,
    listeners: 3,
    popoverTopLayer: 1
  }, 'committed snapshot combines shell and runtime-owned listeners');
  assert.deepEqual(harness.outbound.at(-1), {
    action: 'skopeo:ready',
    generation: 1,
    attention: 'ambient',
    exactOrigin: 'https://drive.google.com',
    profileId: 'generic-default-v1',
    profileVersion: 'skopeo-profiles-v1',
    catalogVersion: 'sha256:' + 'a'.repeat(64),
    contextEpoch: 1,
    semanticEntity: null
  });
  assert.equal(harness.outbound.some(message => Object.hasOwn(message, 'tabId')), false, 'outbound envelopes never carry caller-controlled tabId');

  const countsBeforeProbe = {
    shells: harness.shells.length,
    mounts: harness.operations.filter(value => value.startsWith('mount-ambient')).length,
    renders: shell.renderCalls,
    backs: shell.backCalls,
    listeners: harness.windowListeners.count(),
    messages: harness.outbound.length,
    attention: shell.attention,
    focus: shell.focusCalls
  };
  assert.deepEqual(plain(api.probe({ action: 'skopeo:probe', generation: 1 })), {
    success: true,
    generation: 1,
    status: 'active',
    attention: 'ambient',
    mounted: true,
    exactOrigin: 'https://drive.google.com',
    profileId: 'generic-default-v1',
    profileVersion: 'skopeo-profiles-v1',
    catalogVersion: 'sha256:' + 'a'.repeat(64),
    contextEpoch: 1,
    semanticEntity: null
  });
  assert.deepEqual(plain(api.probe({ action: 'skopeo:probe', generation: 9 })), {
    success: false,
    generation: 9,
    status: 'stale',
    code: 'SKOPEO_STALE_GENERATION'
  });
  assert.deepEqual({
    shells: harness.shells.length,
    mounts: harness.operations.filter(value => value.startsWith('mount-ambient')).length,
    renders: shell.renderCalls,
    backs: shell.backCalls,
    listeners: harness.windowListeners.count(),
    messages: harness.outbound.length,
    attention: shell.attention,
    focus: shell.focusCalls
  }, countsBeforeProbe, 'probe is purely observational');

  assert.equal(api.prepare({ action: 'skopeo:prepare', generation: 1 }), true, 'duplicate prepare is idempotent');
  assert.equal(api.commit({ action: 'skopeo:commit', generation: 1 }), true, 'duplicate commit is idempotent');
  assert.equal(api.prepare({ action: 'skopeo:prepare', generation: 0 }), false, 'older generation is rejected');
  assert.equal(harness.shells.length, 1, 'duplicate and stale envelopes create no second shell');
  assert.equal(harness.operations.filter(value => value.startsWith('mount-ambient')).length, 1, 'duplicate commit mounts once');
}

async function testRuntimeCancelsUnrenderableConsequence() {
  const actionToken = 'sg1_' + 'a'.repeat(64);
  const url = 'https://app.notion.com/workspace';
  const harness = createRuntimeHarness({
    url,
    rejectConsequence: true,
    runtimeResponder(message) {
      if (message.action === 'skopeo:consequence-open') {
        return {
          status: 'open',
          actionToken,
          confirmation: {
            actionSlug: 'notion.create_database',
            actionLabel: 'Create database',
            target: 'Parent page ID: parent-1',
            effect: 'Create one database',
            parameterSummary: 'Database title: Roadmap.',
            gerund: 'Creating one database'
          }
        };
      }
      if (message.action === 'skopeo:consequence-cancel') {
        return { status: 'cancelled', reason: 'cancelled' };
      }
      return undefined;
    }
  });
  const api = harness.evaluate();
  const projection = CAPABILITY_PROJECTOR.createProjection({
    tabId: 124,
    generation: 24,
    url
  }, PROFILE_INDEX);
  assert.equal(api.configure({
    action: 'skopeo:configure', generation: 24, projection: harness.toContent(projection)
  }), true, 'unrenderable-consequence fixture configures a real Notion projection');
  assert.equal(api.prepare({ action: 'skopeo:prepare', generation: 24 }), true);
  assert.equal(api.commit({ action: 'skopeo:commit', generation: 24 }), true);
  const group = projection.capabilityGroups.find(candidate => candidate.capabilities.some(
    row => row.slug === 'notion.create_database'
  ));
  const tuple = {
    generation: 24,
    exactOrigin: projection.exactOrigin,
    profileId: projection.profileId,
    profileVersion: projection.profileVersion,
    contextEpoch: 1,
    entity: null,
    groupId: group.id,
    actionSlug: 'notion.create_database',
    sideEffectClass: 'write'
  };
  const shell = harness.shells[0];
  assert.equal(shell.adaptiveAction(harness.toContent(
    Object.assign({ kind: 'select-action' }, tuple)
  )), true,
    'real write selection enters its bounded collector');
  const collectionEpoch = shell.adaptiveModels.at(-1).argumentCollection.collectionEpoch;
  await shell.adaptiveAction(harness.toContent(Object.assign({
    kind: 'submit-arguments',
    collectionEpoch,
    values: { parent_page_id: 'parent-1', title: 'Roadmap' }
  }, tuple)));
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  const messages = harness.outbound.filter(message =>
    message.action === 'skopeo:consequence-open' || message.action === 'skopeo:consequence-cancel'
  );
  assert.deepEqual(messages.map(message => message.action), [
    'skopeo:consequence-open', 'skopeo:consequence-cancel'
  ], 'a confirmation that cannot become Interstitial is cancelled immediately');
  assert.equal(messages[1].actionToken, actionToken,
    'the exact open token is consumed by the fail-closed cancellation');
  assert.equal(shell.adaptiveModels.some(model => model.attention === 'interstitial'), false,
    'an incomplete confirmation never paints an alertdialog claim');
  assert.equal(shell.adaptiveModels.at(-1).rendererRequest.resultStatus, 'error',
    'the user receives a typed recovery state after cancellation');
  api.terminate({ action: 'skopeo:terminate', generation: 24, reason: 'test-complete' });
}

function currentAdaptivePayload(projection, overrides = {}) {
  return Object.assign({
    kind: 'open-actions',
    generation: projection.generation,
    exactOrigin: projection.exactOrigin,
    profileId: projection.profileId,
    profileVersion: projection.profileVersion,
    contextEpoch: 1,
    entity: null,
    groupId: null,
    actionSlug: null,
    sideEffectClass: null
  }, overrides);
}

function assertSyntheticEscapeInert(harness, api, label) {
  const before = plain(api.getSnapshot());
  const outboundCount = harness.outbound.length;
  const backCount = harness.shells[0].backCalls;
  const event = harness.dispatchWindow('keydown', { key: 'Escape', isTrusted: false });
  assert.equal(event.defaultPrevented, false, label + ' page-created Escape is not consumed');
  assert.deepEqual(plain(api.getSnapshot()), before,
    label + ' page-created Escape changes no attention or lifecycle state');
  assert.equal(harness.outbound.length, outboundCount,
    label + ' page-created Escape sends no outbound message');
  assert.equal(harness.shells[0].backCalls, backCount,
    label + ' page-created Escape performs no back transition');
  assert.equal(harness.shells[0].destroyed, false,
    label + ' page-created Escape performs no teardown');
}

async function drainRuntimeWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

function boundaryValues(contract, maximum) {
  const values = {};
  for (const field of contract.fields) {
    if (!maximum && !field.required) continue;
    if (field.kind === 'string') {
      values[field.name] = maximum
        ? 'x'.repeat(field.maxLength)
        : 'ordinary-' + field.name;
    } else if (field.kind === 'boolean') {
      values[field.name] = maximum;
    } else if (field.kind === 'choice') {
      values[field.name] = maximum ? field.choices.at(-1) : field.choices[0];
    } else {
      values[field.name] = String(maximum ? field.maximum : field.minimum);
    }
  }
  return values;
}

async function assertTrustedInterstitialEscape(boundary) {
  const maximum = boundary === 'maximum';
  const staleCancellation = boundary === 'stale cancellation';
  const url = 'https://app.notion.com/workspace';
  const generation = staleCancellation ? 33 : maximum ? 32 : 31;
  const token = 'sg1_' + (staleCancellation ? 'c' : maximum ? 'e' : 'd').repeat(64);
  const harness = createRuntimeHarness({
    url,
    runtimeResponder(message) {
      if (message.action === 'skopeo:consequence-open') {
        return {
          status: 'open',
          actionToken: token,
          confirmation: {
            actionSlug: 'notion.update_page',
            actionLabel: 'Update page',
            target: 'Page ID: reviewed-page',
            effect: 'Update one page',
            parameterSummary: maximum
              ? 'All accepted fields are represented at their maximum bounds.'
              : 'Page title: Ordinary review.',
            gerund: 'Updating one page'
          }
        };
      }
      if (message.action === 'skopeo:consequence-cancel') {
        return staleCancellation
          ? { status: 'stale', reason: 'authority-stale' }
          : { status: 'cancelled', reason: 'cancelled' };
      }
      return undefined;
    }
  });
  const api = harness.evaluate();
  const projection = CAPABILITY_PROJECTOR.createProjection({
    tabId: staleCancellation ? 133 : maximum ? 132 : 131,
    generation,
    url
  }, PROFILE_INDEX);
  assert.equal(api.configure({
    action: 'skopeo:configure', generation, projection: harness.toContent(projection)
  }), true, boundary + ' Escape fixture configures a real Notion projection');
  assert.equal(api.prepare({ action: 'skopeo:prepare', generation }), true);
  assert.equal(api.commit({ action: 'skopeo:commit', generation }), true);
  const shell = harness.shells[0];
  const group = projection.capabilityGroups.find(candidate => candidate.capabilities.some(
    row => row.slug === 'notion.update_page'
  ));
  const row = group.capabilities.find(candidate => candidate.slug === 'notion.update_page');
  const selected = currentAdaptivePayload(projection, {
    kind: 'select-action',
    groupId: group.id,
    actionSlug: row.slug,
    sideEffectClass: row.sideEffectClass
  });
  assert.equal(shell.adaptiveAction(harness.toContent(selected)), true,
    boundary + ' real write selection enters its collector');
  assert.equal(shell.attention, 'focused', boundary + ' collector remains in Focused attention');
  assertSyntheticEscapeInert(harness, api, boundary + ' collector');

  const collectionEpoch = shell.adaptiveModels.at(-1).argumentCollection.collectionEpoch;
  const values = boundaryValues(row.argumentContract, maximum);
  await shell.adaptiveAction(harness.toContent(Object.assign({}, selected, {
    kind: 'submit-arguments',
    collectionEpoch,
    values
  })));
  await drainRuntimeWork();
  assert.equal(shell.attention, 'interstitial', boundary + ' accepted values open Interstitial');
  assert.equal(api.getSnapshot().attention, 'interstitial',
    boundary + ' runtime attention agrees with the visible alertdialog');
  assertSyntheticEscapeInert(harness, api, boundary + ' Interstitial');

  const trusted = harness.dispatchWindow('keydown', { key: 'Escape', isTrusted: true });
  const duplicate = harness.dispatchWindow('keydown', { key: 'Escape', isTrusted: true });
  assert.equal(trusted.defaultPrevented, true, boundary + ' trusted Escape is consumed');
  assert.equal(duplicate.defaultPrevented, true, boundary + ' duplicate trusted Escape is consumed');
  await drainRuntimeWork();

  const consequenceMessages = harness.outbound.filter(message =>
    message.action === 'skopeo:consequence-open' ||
    message.action === 'skopeo:consequence-cancel' ||
    message.action === 'skopeo:consequence-confirm'
  );
  const cancels = consequenceMessages.filter(message => message.action === 'skopeo:consequence-cancel');
  assert.equal(cancels.length, 1,
    boundary + ' trusted Escape emits exactly one consequence-cancel');
  assert.equal(cancels[0].actionToken, token,
    boundary + ' trusted Escape carries the exact generation-owned token');
  assert.equal(consequenceMessages.some(message => message.action === 'skopeo:consequence-confirm'), false,
    boundary + ' Escape makes zero router-bound confirmation calls');
  if (staleCancellation) {
    assert.equal(shell.backCalls, 0,
      'stale cancellation never restores a misleading Focused shell');
    assert.equal(api.getSnapshot().reason, 'escape',
      'stale cancellation terminates through the fail-closed Escape path');
    assertRuntimeOff(harness, 'stale cancellation acknowledgement');
    return;
  }
  assert.equal(shell.backCalls, 1,
    boundary + ' runtime restores the shell exactly once after cancellation');
  assert.equal(shell.attention, 'focused', boundary + ' cancellation restores Focused');
  assert.equal(api.getSnapshot().attention, 'focused',
    boundary + ' pending state clears before runtime records Focused');

  shell.adaptiveAction(harness.toContent(Object.assign({}, selected, { kind: 'cancel-consequence' })));
  await drainRuntimeWork();
  assert.equal(harness.outbound.filter(
    message => message.action === 'skopeo:consequence-cancel'
  ).length, 1, boundary + ' cleared pending state cannot emit a second cancellation');
  const open = consequenceMessages.find(message => message.action === 'skopeo:consequence-open');
  assert.ok(open, boundary + ' case opened one production consequence request');
  if (maximum) {
    assert.deepEqual(open.args, plain(
      ACTION_AUTHORITY.parseCollectedArguments(row.argumentContract, values).args
    ), 'maximum accepted collector values reach the exact open request');
  }
  api.terminate({ action: 'skopeo:terminate', generation, reason: 'test-complete' });
}

async function testTrustedAndSyntheticEscapeBoundary() {
  const ambientHarness = createRuntimeHarness();
  const ambientApi = ambientHarness.evaluate();
  prepareAndCommit(ambientHarness, 1);
  assertSyntheticEscapeInert(ambientHarness, ambientApi, 'Ambient');
  ambientApi.terminate({ action: 'skopeo:terminate', generation: 1, reason: 'test-complete' });

  const focusedHarness = createRuntimeHarness();
  const focusedApi = focusedHarness.evaluate();
  prepareAndCommit(focusedHarness, 2);
  focusedHarness.shells[0].adaptiveAction(focusedHarness.toContent(currentAdaptivePayload(
    catalogProjection(2), { kind: 'open-actions' }
  )));
  assert.equal(focusedHarness.shells[0].attention, 'focused',
    'Focused hostile-event fixture opens through the trusted shell callback');
  assertSyntheticEscapeInert(focusedHarness, focusedApi, 'Focused');
  focusedApi.terminate({ action: 'skopeo:terminate', generation: 2, reason: 'test-complete' });

  await assertTrustedInterstitialEscape('ordinary');
  await assertTrustedInterstitialEscape('maximum');
  await assertTrustedInterstitialEscape('stale cancellation');
}

async function testRuntimeAbortFirstAndLateWork() {
  const harness = createRuntimeHarness();
  const api = harness.evaluate();
  prepareAndCommit(harness, 1);
  const shell = harness.shells[0];
  assert.equal(api.configureAnchorAdapter({
    observationRoot: harness.observationRoot,
    resolveCandidates() { return []; },
    validateCandidate() { return { semanticIdentity: { kind: 'drive-folder', id: 'folder-A' } }; }
  }), true, 'trusted narrow adapter creates the one generation-owned registry');
  const recognized = api.routeContext(driveRoute('folder-A'));
  assert.equal(recognized.status, 'recognized');
  assert.equal(api.bindSemanticAnchor(anchorDescriptor('anchor-A', recognized)), true);
  const savedRegistry = harness.registries[0];
  harness.sandbox.__FSB_SKOPEO_TEST_FIXTURE__ = true;
  assert.equal(api.activateControlledFixtureForTest(), true, 'isolated-world flag unlocks the controlled fixture only after commit');
  assert.equal(shell.attention, 'ambient', 'fixture activation itself leaves ordinary committed attention Ambient');
  assert.equal(api.getSnapshot().resources.timeouts, 1, 'controlled fixture timeout is counted while pending');
  const delayedCallback = harness.timers[0].callback;
  const savedListener = harness.runtimeListeners.entries[0].listener;

  const terminal = api.terminate({ action: 'skopeo:terminate', generation: 1, reason: 'toggle-off' });
  assert.deepEqual(plain(terminal.teardownOrder), [
    'terminal',
    'abort',
    'clear-fixture-timeout',
    'dispose-registry',
    'dispose-router',
    'destroy-shell',
    'unregister-key/pagehide-listeners',
    'unregister-runtime-listener',
    'delete-fixture-hook/flag',
    'delete-sentinel',
    'teardown-complete'
  ], 'terminal boundary, abort, cleanup, listener removal, globals, and acknowledgement follow exact order');
  assert.ok(
    harness.operations.includes('destroy:1:toggle-off:aborted'),
    'AbortSignal is aborted before shell.destroy runs'
  );
  assert.deepEqual(harness.outbound.at(-1), {
    action: 'skopeo:teardown-complete',
    generation: 1,
    reason: 'toggle-off',
    resources: { ...ZERO_RESOURCES }
  });
  assert.equal(isExactZeroSnapshot(terminal.resources), true, 'terminal snapshot carries exactly eleven finite numeric zeroes');
  assert.equal(
    harness.outbound.filter(message => message.action === 'skopeo:teardown-complete').length,
    1,
    'terminal path emits exactly one teardown acknowledgement'
  );
  const destroyIndex = harness.operations.indexOf('destroy:1:toggle-off:aborted');
  const registryDisposeIndex = harness.operations.indexOf('dispose-registry:1');
  const routerDisposeIndex = harness.operations.indexOf('dispose-router:1');
  const keydownRemovalIndex = harness.operations.indexOf('remove-window:keydown');
  const pagehideRemovalIndex = harness.operations.indexOf('remove-window:pagehide');
  const runtimeRemovalIndex = harness.operations.indexOf('remove-runtime-listener');
  const acknowledgementIndex = harness.operations.indexOf('send:skopeo:teardown-complete');
  assert.ok(
    registryDisposeIndex < routerDisposeIndex &&
      routerDisposeIndex < destroyIndex &&
      destroyIndex < keydownRemovalIndex &&
      keydownRemovalIndex < pagehideRemovalIndex &&
      pagehideRemovalIndex < runtimeRemovalIndex &&
      runtimeRemovalIndex < acknowledgementIndex,
    'teardown acknowledgement is emitted only after shell and runtime-owned listeners are gone'
  );
  assertRuntimeOff(harness, 'explicit terminate');

  const operationCount = harness.operations.length;
  const outboundCount = harness.outbound.length;
  delayedCallback();
  savedRegistry.emitCommit('anchor-A');
  savedListener({ action: 'skopeo:commit', generation: 1 }, { id: harness.sandbox.chrome.runtime.id }, () => {});
  await Promise.resolve().then(() => api.commit({ action: 'skopeo:commit', generation: 1 }));
  harness.runTimers({ includeCleared: true });
  assert.equal(shell.renderCalls, 0, 'released timer and deferred callback cannot render after abort');
  assert.equal(harness.shells.length, 1, 'late queued work cannot create another shell');
  assert.equal(harness.outbound.length, outboundCount, 'late queued work cannot send ready or another teardown');

  const beforeSecondTerminate = harness.operations.length;
  const second = api.terminate({ action: 'skopeo:terminate', generation: 1, reason: 'toggle-off' });
  assert.deepEqual(plain(second), plain(terminal), 'saved terminal API returns the same teardown snapshot');
  assert.ok(harness.operations.length >= operationCount, 'saved callbacks may be observed by the harness without side effects');
  assert.equal(harness.operations.length, beforeSecondTerminate, 'idempotent terminal API performs no second removal or focus work');
  assert.deepEqual(plain(api.getSnapshot()), plain(terminal), 'saved terminal API returns the stable terminal snapshot');
  assert.deepEqual(harness.deliver({ action: 'skopeo:probe', generation: 1 }), {
    success: false,
    generation: 1,
    status: 'missing',
    code: 'SKOPEO_RUNTIME_MISSING'
  }, 'disposed runtime is worker-normalizable as missing because no listener remains');
}

async function testRuntimeDiscardsLateReadResultAfterKill() {
  let resolveRead;
  const readResult = new Promise((resolve) => { resolveRead = resolve; });
  const harness = createRuntimeHarness({
    runtimeResponder(message) {
      return message.action === 'skopeo:read-invoke' ? readResult : undefined;
    }
  });
  const api = harness.evaluate();
  prepareAndCommit(harness, 1);
  const shell = harness.shells[0];
  assert.equal(shell.adaptiveModels.length, 1, 'commit paints one initial adaptive model');
  assert.equal(shell.adaptiveAction({
    kind: 'select-action',
    generation: 1,
    exactOrigin: 'https://drive.google.com',
    profileId: 'generic-default-v1',
    profileVersion: 'skopeo-profiles-v1',
    contextEpoch: 1,
    entity: null,
    groupId: 'review',
    actionSlug: 'gdrive.list_items',
    sideEffectClass: 'read'
  }), true, 'explicit current control starts one ready read');
  await Promise.resolve();
  const request = harness.outbound.find((message) => message.action === 'skopeo:read-invoke');
  assert.ok(request, 'ready read crosses the runtime boundary only after deterministic pending paint');
  assert.equal(shell.adaptiveModels.length, 2, 'selected read enters one pending focused model');

  const terminal = api.terminate({ action: 'skopeo:terminate', generation: 1, reason: 'toggle-off' });
  const modelCountAtKill = shell.adaptiveModels.length;
  resolveRead({
    success: true,
    generation: request.generation,
    exactOrigin: request.exactOrigin,
    profileId: request.profileId,
    profileVersion: request.profileVersion,
    catalogVersion: request.catalogVersion,
    contextEpoch: request.contextEpoch,
    semanticEntity: request.semanticEntity,
    slug: request.slug,
    actionToken: request.actionToken,
    result: {
      status: 'success',
      actionLabel: 'List items',
      sections: [{
        kind: 'notice', tone: 'info', heading: 'Read complete',
        message: 'Late result', nextStep: 'This must never paint.'
      }]
    }
  });
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(shell.adaptiveModels.length, modelCountAtKill,
    'a read result resolved after kill performs zero late paint or announcement');
  assert.equal(isExactZeroSnapshot(plain(terminal.resources)), true,
    'kill during the read await still returns the exact resource certificate');
  assertRuntimeOff(harness, 'late read result after kill');
}

function testRuntimeContextAndAnchorAuthority() {
  const harness = createRuntimeHarness();
  const api = harness.evaluate();
  prepareAndCommit(harness, 7);
  const shell = harness.shells[0];

  assert.equal(harness.routers.length, 1, 'prepare installs exactly one generation-owned router');
  assert.equal(harness.registries.length, 0, 'prepare/commit does not observe before trusted adapter configuration');
  assert.equal(shell.contextProjections.length, 1, 'commit routes the current URL once');
  assert.equal(shell.contextProjections[0].status, 'uncertain', 'URL alone projects generic fail-quiet context');
  assert.equal(Object.hasOwn(shell.contextProjections[0], 'semanticIdentity'), false, 'URL-only projection carries no claimed identity');

  const adapter = {
    observationRoot: harness.observationRoot,
    resolveCandidates() { return []; },
    validateCandidate(_candidate, descriptor) { return { semanticIdentity: descriptor.semanticIdentity }; }
  };
  assert.equal(api.configureAnchorAdapter({ ...adapter, observationRoot: harness.sandbox.document }), false, 'document-wide adapter roots are rejected');
  assert.equal(api.configureAnchorAdapter({ ...adapter, observationRoot: { isConnected: false } }), false, 'disconnected adapter roots are rejected');
  assert.equal(api.configureAnchorAdapter(adapter), true, 'one connected narrow trusted adapter is accepted');
  assert.equal(api.configureAnchorAdapter(adapter), true, 'identical adapter configuration is idempotent');
  assert.equal(harness.registries.length, 1, 'adapter configuration creates one registry only');
  const registry = harness.registries[0];

  const routeA = api.routeContext(driveRoute('folder-A'));
  assert.equal(routeA.status, 'recognized');
  assert.equal(api.bindSemanticAnchor(anchorDescriptor('anchor-A', routeA)), true);
  const routeAAgain = api.routeContext(driveRoute('folder-A', { url: 'https://drive.google.com/drive/u/1/folders/folder-A' }));
  assert.equal(routeAAgain.status, 'recognized', 'same semantic identity still receives a fresh context epoch');
  assert.ok(routeAAgain.contextEpoch > routeA.contextEpoch);
  assert.equal(api.bindSemanticAnchor(anchorDescriptor('anchor-A-new', routeAAgain)), true);

  const routeBStart = harness.operations.length;
  const routeB = api.routeContext(driveRoute('folder-B'));
  assert.equal(routeB.status, 'recognized');
  const routeBOperations = harness.operations.slice(routeBStart);
  assert.ok(
    routeBOperations.findIndex((entry) => entry.startsWith('withdraw-anchor:')) <
      routeBOperations.findIndex((entry) => entry.startsWith('route:')),
    'prior semantic projection withdraws before the changed route is admitted'
  );
  assert.equal(api.bindSemanticAnchor(anchorDescriptor('anchor-B', routeB)), true);

  registry.emitCommit('anchor-B');
  registry.emitCommit('anchor-A-new');
  registry.emitCommit('anchor-B', { generation: 8, bindingEpoch: 99 });
  registry.emitCommit('anchor-B', { contextEpoch: routeAAgain.contextEpoch, bindingEpoch: 100 });
  registry.emitCommit('anchor-B', { semanticIdentity: { kind: 'drive-folder', id: 'folder-A' }, bindingEpoch: 101 });
  assert.deepEqual(
    shell.anchorCommits.map((projection) => [projection.contextEpoch, projection.semanticIdentity.id]),
    [[routeB.contextEpoch, 'folder-B']],
    'B completing before A permits only the newest generation/context/identity/binding tuple to project'
  );

  const conflicting = api.routeContext(driveRoute('folder-C', { identityId: 'folder-D' }));
  assert.equal(conflicting.status, 'uncertain');
  assert.equal(shell.contextProjections.at(-1).status, 'uncertain', 'conflicting identity evidence fails quiet');
  assert.equal(shell.anchorCommits.length, 1, 'conflicting evidence cannot leave or create an anchor');

  const beforeRouteMessage = harness.routers[0].currentEpoch();
  const adaptiveRoute = harness.deliver({
    action: 'skopeo:route-change',
    generation: 7,
    url: 'https://drive.google.com/drive/u/0/folders/folder-D'
  });
  assert.deepEqual(plain(adaptiveRoute), {
    success: true,
    generation: 7,
    exactOrigin: 'https://drive.google.com',
    profileId: 'generic-default-v1',
    profileVersion: 'skopeo-profiles-v1',
    catalogVersion: 'sha256:' + 'a'.repeat(64),
    contextEpoch: 2,
    semanticEntity: null,
    attention: 'ambient'
  }, 'matching worker route-change returns a higher exact adaptive tuple');
  assert.ok(harness.routers[0].currentEpoch() > beforeRouteMessage);
  const afterRouteMessage = harness.routers[0].currentEpoch();
  assert.equal(harness.deliver({ action: 'skopeo:route-change', generation: 8, url: 'https://drive.google.com/' }), false);
  assert.equal(harness.deliver({ action: 'skopeo:route-change', generation: 7, url: 'https://drive.google.com/', extra: true }), false);
  assert.equal(harness.deliver(
    { action: 'skopeo:route-change', generation: 7, url: 'https://drive.google.com/' },
    { id: 'page-world' }
  ), undefined);
  assert.equal(harness.routers[0].currentEpoch(), afterRouteMessage, 'stale, non-exact, and foreign route messages are inert');
  assert.equal(harness.shells.length, 1, 'same-document reroutes never create a second shell');
  assert.equal(harness.routers.length, 1, 'same-document reroutes never create a second router');
  assert.equal(harness.registries.length, 1, 'same-document reroutes never create a second registry');

  harness.dispatchWindow('pagehide');
  assertRuntimeOff(harness, 'pagehide after routed context');
  assert.equal(api.routeContext(driveRoute('folder-Z')), false, 'saved route API is inert after terminal navigation');
  assert.equal(api.bindSemanticAnchor(anchorDescriptor('anchor-Z', routeB)), false, 'saved bind API is inert after terminal navigation');
  assert.equal(registry.emitCommit('anchor-B'), false, 'saved registry callback is inert after terminal navigation');
}

function testRuntimeTerminalPathsAndEscape() {
  {
    const harness = createRuntimeHarness();
    const api = harness.evaluate();
    prepareAndCommit(harness, 1);
    harness.shells[0].requestClose('close');
    assert.deepEqual(harness.outbound.slice(-2).map(message => message.action), [
      'skopeo:kill-request',
      'skopeo:teardown-complete'
    ], 'Ambient close requests kill and converges on teardown');
    assert.equal(harness.outbound.at(-2).reason, 'close');
    assertRuntimeOff(harness, 'Ambient close');
    assert.equal(api.getSnapshot().reason, 'close');
  }

  {
    const harness = createRuntimeHarness();
    harness.evaluate();
    prepareAndCommit(harness, 1);
    const ambientEscape = harness.dispatchWindow('keydown', { key: 'Escape', isTrusted: true });
    assert.equal(ambientEscape.defaultPrevented, true, 'single Ambient Escape is consumed by the visible shell');
    assert.equal(harness.outbound.at(-2).reason, 'escape', 'Ambient Escape requests current-tab off');
    assertRuntimeOff(harness, 'Ambient Escape');
  }

  {
    const harness = createRuntimeHarness();
    harness.evaluate();
    prepareAndCommit(harness, 1);
    const composing = harness.dispatchWindow('keydown', { key: 'Escape', isComposing: true, isTrusted: true });
    const repeated = harness.dispatchWindow('keydown', { key: 'Escape', repeat: true, isTrusted: true });
    const unrelated = harness.dispatchWindow('keydown', { key: 'Enter', isTrusted: true });
    assert.equal(composing.defaultPrevented || repeated.defaultPrevented || unrelated.defaultPrevented, false, 'composing, repeated, and unrelated keys pass through');

    harness.sandbox.__FSB_SKOPEO_TEST_FIXTURE__ = true;
    assert.equal(harness.sandbox.__FSB_SKOPEO_RUNTIME__.activateControlledFixtureForTest(), true);
    assert.equal(harness.sandbox.__FSB_SKOPEO_RUNTIME__.getSnapshot().resources.timeouts, 1);
    harness.runTimers();
    assert.equal(harness.sandbox.__FSB_SKOPEO_RUNTIME__.getSnapshot().resources.timeouts, 0, 'fired fixture timeout is released before render');
    assert.equal(harness.shells[0].attention, 'anchored');
    harness.setNow(1200);
    const first = harness.dispatchWindow('keydown', { key: 'Escape', isTrusted: true });
    assert.equal(first.defaultPrevented, true, 'first applicable Escape is suppressed after shell consumes one back');
    assert.equal(harness.shells[0].attention, 'ambient', 'first Escape backs one attention level');
    harness.setNow(1700);
    const second = harness.dispatchWindow('keydown', { key: 'Escape', isTrusted: true });
    assert.equal(second.defaultPrevented, true, 'second applicable Escape inside 600ms is consumed');
    assert.equal(harness.outbound.find(message => message.action === 'skopeo:kill-request').reason, 'escape');
    assertRuntimeOff(harness, 'Escape Escape');
  }

  {
    const harness = createRuntimeHarness();
    harness.evaluate();
    prepareAndCommit(harness, 1);
    harness.dispatchWindow('pagehide', {});
    assert.equal(harness.outbound.at(-2).reason, 'navigation');
    assertRuntimeOff(harness, 'navigation');
  }

  {
    const harness = createRuntimeHarness({ shellBehaviors: [{ prepareFails: true }] });
    harness.evaluate();
    assert.equal(harness.deliver({
      action: 'skopeo:configure', generation: 1, projection: catalogProjection(1)
    }), true);
    assert.equal(harness.deliver({ action: 'skopeo:prepare', generation: 1 }), false);
    assert.deepEqual(harness.outbound.map(message => [message.action, message.reason]), [
      ['skopeo:kill-request', 'unsafe-layout'],
      ['skopeo:teardown-complete', 'unsafe-layout']
    ], 'unsafe prepare fails root-free with kill and teardown evidence');
    assertRuntimeOff(harness, 'unsafe prepare');
  }

  {
    const harness = createRuntimeHarness({ shellBehaviors: [{ mountFails: true }] });
    harness.evaluate();
    assert.equal(harness.deliver({
      action: 'skopeo:configure', generation: 1, projection: catalogProjection(1)
    }), true);
    assert.equal(harness.deliver({ action: 'skopeo:prepare', generation: 1 }), true);
    assert.equal(harness.deliver({ action: 'skopeo:commit', generation: 1 }), false);
    assert.equal(harness.outbound.some(message => message.action === 'skopeo:ready'), false, 'failed commit never sends ready');
    assertRuntimeOff(harness, 'failed commit');
  }
}

function testRuntimeReplacementAndFreshReinjection() {
  const harness = createRuntimeHarness();
  const firstApi = harness.evaluate();
  prepareAndCommit(harness, 1);
  const firstShell = harness.shells[0];
  assert.equal(firstApi.prepare({ action: 'skopeo:prepare', generation: 2 }), false,
    'a newer prepare cannot replace a configured owner without explicit reinjection');
  harness.evaluate();
  const secondApi = harness.sandbox.__FSB_SKOPEO_RUNTIME__;
  assert.notStrictEqual(secondApi, firstApi, 'explicit reinjection installs a new sentinel identity');
  assert.equal(firstShell.destroyed, true, 'old shell is destroyed before replacement configure');
  assert.equal(firstApi.getSnapshot().reason, 'replacement');
  assert.equal(harness.runtimeListeners.count('message'), 1, 'replacement leaves exactly one current listener');
  assert.equal(secondApi.configure({
    action: 'skopeo:configure', generation: 2, projection: harness.toContent(catalogProjection(2))
  }), true, 'replacement accepts one fresh exact configure');
  assert.equal(secondApi.prepare({ action: 'skopeo:prepare', generation: 2 }), true,
    'replacement prepares only after configure');
  assert.equal(harness.shells.length, 2, 'replacement prepares exactly one fresh shell');
  assert.equal(harness.shells[1].mounted, false, 'replacement prepare is root-free');
  assert.ok(
    harness.operations.indexOf('destroy:1:replacement:aborted') <
      harness.operations.lastIndexOf('add-runtime-listener'),
    'old owner is aborted and destroyed before the successor listener is registered'
  );
  assert.equal(secondApi.commit({ action: 'skopeo:commit', generation: 1 }), false, 'old generation cannot enter replacement owner');
  assert.equal(secondApi.commit({ action: 'skopeo:commit', generation: 2 }), true, 'new generation commits once');

  const secondShell = harness.shells[1];
  harness.evaluate();
  const thirdApi = harness.sandbox.__FSB_SKOPEO_RUNTIME__;
  assert.notStrictEqual(thirdApi, secondApi, 'script reinjection replaces the active runtime identity');
  assert.equal(secondShell.destroyed, true, 'script reinjection disposes all prior shell resources first');
  assert.equal(harness.runtimeListeners.count('message'), 1, 'script reinjection still owns exactly one runtime listener');
  assert.equal(harness.windowListeners.count(), 0, 'fresh reinjection has no active Escape/pagehide listeners before commit');
  assert.equal(harness.shells.length, 2, 'script evaluation alone restores no prior primitive shell');
  assert.equal(thirdApi.configure({
    action: 'skopeo:configure', generation: 3, projection: harness.toContent(catalogProjection(3))
  }), true, 'later dynamic injection accepts one newer configure');
  assert.equal(thirdApi.prepare({ action: 'skopeo:prepare', generation: 3 }), true, 'later dynamic injection accepts a newer generation');
  assert.equal(thirdApi.prepare({ action: 'skopeo:prepare', generation: 2 }), false, 'prior generation stays stale after newer preparation');
  assert.equal(thirdApi.commit({ action: 'skopeo:commit', generation: 3 }), true);
  assert.equal(harness.shells.length, 3, 'later invocation creates only its fresh generation shell');

  thirdApi.terminate({ action: 'skopeo:terminate', generation: 3, reason: 'off' });
  assertRuntimeOff(harness, 'ordinary off before reinjection');
  const terminalShellCount = harness.shells.length;
  const fourthApi = harness.evaluate();
  assert.ok(fourthApi, 'later explicit dynamic reinjection restores only listener and sentinel');
  assert.equal(harness.shells.length, terminalShellCount, 'reinjection after off does not restore prior primitives');
  assert.equal(fourthApi.configure({
    action: 'skopeo:configure', generation: 4, projection: harness.toContent(catalogProjection(4))
  }), true);
  assert.equal(fourthApi.prepare({ action: 'skopeo:prepare', generation: 4 }), true);
  assert.equal(fourthApi.prepare({ action: 'skopeo:prepare', generation: 3 }), false);
}

function testRuntimeRefusesInvalidCleanupCertificates() {
  const missingCategory = { ...ZERO_RESOURCES };
  delete missingCategory.pointerSurfaces;
  const cases = [
    [
      'nonzero resource',
      { ...ZERO_RESOURCES, roots: 1 }
    ],
    [
      'missing resource category',
      missingCategory
    ],
    [
      'coercible resource value',
      { ...ZERO_RESOURCES, roots: '0' }
    ],
    [
      'NaN resource value',
      { ...ZERO_RESOURCES, roots: NaN }
    ],
    [
      'infinite resource value',
      { ...ZERO_RESOURCES, roots: Infinity }
    ],
    [
      'extra resource category',
      { ...ZERO_RESOURCES, extra: 0 }
    ],
    [
      'null shell snapshot',
      null
    ],
    [
      'array shell snapshot',
      RESOURCE_CATEGORIES.map(() => 0)
    ]
  ];

  for (const [label, destroyResources] of cases) {
    const harness = createRuntimeHarness({ shellBehaviors: [{ destroyResources }] });
    const api = harness.evaluate();
    prepareAndCommit(harness, 1);
    const savedListener = harness.runtimeListeners.entries[0].listener;
    const terminal = api.terminate({ action: 'skopeo:terminate', generation: 1, reason: 'toggle-off' });

    assert.equal(isExactZeroSnapshot(plain(terminal.resources)), false, `${label} remains diagnostic, not a certificate`);
    assert.equal(
      harness.outbound.some(message => message.action === 'skopeo:teardown-complete'),
      false,
      `${label} suppresses teardown acknowledgement`
    );
    assertRuntimeOff(harness, label);
    const outboundCount = harness.outbound.length;
    savedListener({ action: 'skopeo:commit', generation: 1 }, { id: harness.sandbox.chrome.runtime.id }, () => {});
    harness.runTimers({ includeCleared: true });
    assert.equal(harness.outbound.length, outboundCount, `${label} leaves stale callbacks inert`);
  }

  assert.deepEqual(Object.keys(ZERO_RESOURCES), RESOURCE_CATEGORIES, 'certificate category order remains canonical');
}

async function testRuntimeIntegration() {
  testRealProjectionConfigureLifecycle();
  testRuntimePrepareCommitAndProbe();
  await testRuntimeCancelsUnrenderableConsequence();
  await testTrustedAndSyntheticEscapeBoundary();
  testRuntimeContextAndAnchorAuthority();
  await testRuntimeAbortFirstAndLateWork();
  await testRuntimeDiscardsLateReadResultAfterKill();
  testRuntimeTerminalPathsAndEscape();
  testRuntimeReplacementAndFreshReinjection();
  testRuntimeRefusesInvalidCleanupCertificates();
  console.log('skopeo runtime integration production contract: PASS');
}

async function main() {
  assertExportSurface();
  testCatalogRuntimeConfigureSurface();
  testInvalidIdentifiersAndOffState();
  testStartReadyAndPreparedCommit();
  testTerminationFromStartingAndActive();
  await testLateCompletionAfterKillCannotResurrect();
  testReducerAndTabIsolation();
  await testRuntimeIntegration();
  console.log(`skopeo session lifecycle ${SELF_TEST ? 'oracle' : 'production'} contract: PASS`);
}

main().then(
  () => undefined,
  (error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
);
