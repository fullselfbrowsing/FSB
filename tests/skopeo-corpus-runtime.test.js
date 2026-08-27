/**
 * Phase 54 corpus content-runtime contract.
 *
 * This oracle covers only content-side claims and minimized presentation. Drive
 * authority, permission IDs, certificates, reconciliation, and source content
 * remain background-only. Plan 08 extends this file with the background seam.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const composer = require('../extension/content/skopeo-adaptive-composer.js');
const shellApi = require('../extension/content/skopeo-shell.js');
const {
  MockDocument,
  MockWindow,
  snapshotHostState
} = require('./skopeo-shell-contract.test.js');
const {
  SkopeoResourceLedger,
  assertExactZero,
  zeroSnapshot
} = require('./helpers/skopeo-resource-ledger.js');

const RUNTIME_PATH = path.resolve(__dirname, '..', 'extension', 'content', 'skopeo-runtime.js');
const COMPOSER_PATH = path.resolve(__dirname, '..', 'extension', 'content', 'skopeo-adaptive-composer.js');
const SHELL_PATH = path.resolve(__dirname, '..', 'extension', 'content', 'skopeo-shell.js');
const BACKGROUND_PATH = path.resolve(__dirname, '..', 'extension', 'background.js');
const MANIFEST_PATH = path.resolve(__dirname, '..', 'extension', 'manifest.json');
const RUNTIME_SOURCE = fs.readFileSync(RUNTIME_PATH, 'utf8');
const COMPOSER_SOURCE = fs.readFileSync(COMPOSER_PATH, 'utf8');
const SHELL_SOURCE = fs.readFileSync(SHELL_PATH, 'utf8');
const BACKGROUND_SOURCE = fs.readFileSync(BACKGROUND_PATH, 'utf8');
const MANIFEST_SOURCE = fs.readFileSync(MANIFEST_PATH, 'utf8');

const STATES = Object.freeze([
  'ready',
  'pending',
  'unreadable',
  'download-blocked',
  'inaccessible',
  'missing'
]);
const PROVEN_ROW_STATES = Object.freeze(['ready', 'unreadable', 'download-blocked']);
const FORBIDDEN_PROJECTION_FIELDS = Object.freeze([
  'permissionId',
  'accountPermissionId',
  'certificate',
  'changeToken',
  'pageToken',
  'resourceToken',
  'rawError',
  'content',
  'excerpt',
  'relationships',
  'answers',
  'citations',
  'contractProjection',
  'sourceStateCounts'
]);

function authority(contextEpoch = 7, origin = 'https://drive.google.com') {
  return Object.freeze({
    generation: 19,
    exactOrigin: origin,
    profileId: 'drive-docs-deep-pack',
    profileVersion: '54.1.0',
    contextEpoch
  });
}

function entity(kind, id, label) {
  return Object.freeze({ kind, id, label });
}

const FOLDER = entity('drive-folder', 'folder-root-A', 'Current vendor folder');
const DRIVE_FILE = entity('drive-file', 'drive-file-A', 'Current agreement');
const DOCS_DOCUMENT = entity('docs-document', 'docs-document-A', 'Current document');
const UNSUPPORTED_ENTITY = entity('drive-shortcut', 'shortcut-A', 'Looks like a folder');

function inputFor(semanticEntity, projection, actionToken = 'corpus-action-19-7-1', tuple) {
  const currentAuthority = tuple || authority(
    7,
    semanticEntity && semanticEntity.kind === 'docs-document'
      ? 'https://docs.google.com'
      : 'https://drive.google.com'
  );
  return Object.freeze({
    authority: currentAuthority,
    semanticEntity,
    actionToken,
    projection
  });
}

function currentSource(state, actionToken = 'corpus-action-19-7-1', displayLabel) {
  const value = {
    mode: 'current-source',
    state,
    labelToken: 'current-source',
    actionToken
  };
  if (displayLabel !== undefined) value.displayLabel = displayLabel;
  return Object.freeze(value);
}

function activeCorpus(rows, aggregate = null, actionToken = 'corpus-action-19-7-1') {
  return Object.freeze({
    mode: 'active-corpus',
    rows: Object.freeze(rows.slice()),
    aggregate,
    actionToken
  });
}

function corpusClosed(reasonCode = 'fail-quiet', actionToken = 'corpus-action-19-7-1') {
  return Object.freeze({ mode: 'corpus-closed', reasonCode, actionToken });
}

function enrollment(actionToken = 'corpus-action-19-7-1') {
  return Object.freeze({ mode: 'enrollment', actionToken });
}

function row(rowToken, state, displayLabel) {
  const value = { rowToken, state };
  if (displayLabel !== undefined) value.displayLabel = displayLabel;
  return Object.freeze(value);
}

function aggregate(rowTokens) {
  return Object.freeze({ rowTokens: Object.freeze(rowTokens.slice()) });
}

function withExtra(value, key, extraValue) {
  return Object.freeze(Object.assign({}, value, { [key]: extraValue }));
}

function assertCorpusSurfacePresentOnce(root, selector, message) {
  assert.strictEqual(root.querySelectorAll(selector).length, 1, message);
}

function assertCorpusSurfaceAbsent(root, selector, message) {
  assert.strictEqual(root.querySelectorAll(selector).length, 0, message);
}

function testComposerClosedModels() {
  assert.strictEqual(
    typeof composer.composeCorpus,
    'function',
    'corpus composer/runtime contract requires composeCorpus before Enroll this folder can exist'
  );
  assert.strictEqual(typeof composer.validateCorpusModel, 'function', 'corpus composer exports a closed validator');

  const enrollmentModel = composer.composeCorpus(inputFor(FOLDER, enrollment()));
  assert.ok(enrollmentModel, 'authorized current Drive folder composes enrollment');
  assert.strictEqual(enrollmentModel.mode, 'enrollment');
  assert.strictEqual(enrollmentModel.control.label, 'Enroll this folder');
  assert.strictEqual(enrollmentModel.control.accessibleName, 'Enroll this folder');
  assert.strictEqual(composer.validateCorpusModel(enrollmentModel), true);
  assert.strictEqual(Object.isFrozen(enrollmentModel), true, 'enrollment model is deeply frozen');
  assert.strictEqual(Object.isFrozen(enrollmentModel.control), true, 'enrollment copy is deeply frozen');
  assert.strictEqual(composer.composeCorpus(inputFor(FOLDER, null)), null,
    'missing or failed background status cannot infer enrollment in content');

  for (const candidate of [DRIVE_FILE, DOCS_DOCUMENT, UNSUPPORTED_ENTITY, null]) {
    assert.strictEqual(
      composer.composeCorpus(inputFor(candidate, enrollment())),
      null,
      'enrollment is absent on files, Docs, ambiguous/loading, unsupported, and no-target contexts'
    );
  }
  assert.strictEqual(
    composer.composeCorpus(inputFor(
      FOLDER, enrollment(), 'corpus-action-19-7-1', authority(7, 'https://example.com')
    )),
    null,
    'arbitrary unsupported origins cannot compose folder enrollment'
  );

  for (const currentEntity of [DRIVE_FILE, DOCS_DOCUMENT]) {
    for (const state of STATES) {
      const model = composer.composeCorpus(inputFor(currentEntity, currentSource(state)));
      assert.ok(model, `${currentEntity.kind} composes exact current-source state ${state}`);
      assert.strictEqual(model.mode, 'current-source');
      assert.strictEqual(model.source.state, state);
      assert.strictEqual(model.source.label, 'Current source', `${state} defaults to local generic identity`);
      assert.strictEqual(composer.validateCorpusModel(model), true);
      assert.strictEqual(Object.isFrozen(model.source), true);
    }
  }

  for (const state of PROVEN_ROW_STATES) {
    const named = composer.composeCorpus(inputFor(DRIVE_FILE, currentSource(state, undefined, 'Agreement 2026')));
    assert.ok(named, `fresh safe identity may label ${state} exact current source`);
    assert.strictEqual(named.source.label, 'Agreement 2026');
    const hostile = composer.composeCorpus(inputFor(
      DRIVE_FILE,
      currentSource(state, undefined, '<img src=x onerror=alert(1)>')
    ));
    assert.ok(hostile, 'unsafe identity fails to generic copy rather than entering the model');
    assert.strictEqual(hostile.source.label, 'Current source');
  }

  for (const state of ['pending', 'inaccessible', 'missing']) {
    assert.strictEqual(
      composer.composeCorpus(inputFor(DRIVE_FILE, currentSource(state, undefined, 'Prior private name'))),
      null,
      `${state} structurally rejects prior labels when current proof is unavailable`
    );
  }

  const certifiedRows = [
    row('row-1', 'ready', 'Agreement A'),
    row('row-2', 'unreadable', 'Agreement B'),
    row('row-3', 'download-blocked')
  ];
  const active = composer.composeCorpus(inputFor(
    FOLDER,
    activeCorpus(certifiedRows, aggregate(['row-1', 'row-2', 'row-3']))
  ));
  assert.ok(active, 'same-operation display-certified active corpus composes');
  assert.strictEqual(active.mode, 'active-corpus');
  assert.strictEqual(active.rows.length, 3);
  assert.strictEqual(active.aggregate.label, '3 sources');
  assert.deepStrictEqual(active.aggregate.rowTokens, ['row-1', 'row-2', 'row-3']);
  assert.strictEqual(Object.isFrozen(active.rows), true);
  assert.strictEqual(Object.isFrozen(active.aggregate.rowTokens), true);

  const withoutAggregate = composer.composeCorpus(inputFor(FOLDER, activeCorpus(certifiedRows)));
  assert.ok(withoutAggregate, 'aggregate is optional when certified complete-set proof is unavailable');
  assert.strictEqual(withoutAggregate.aggregate, null);

  for (const state of ['pending', 'inaccessible', 'missing']) {
    assert.strictEqual(
      composer.composeCorpus(inputFor(FOLDER, activeCorpus([row('row-unsafe', state)]))),
      null,
      `${state} cannot contribute a certified row or aggregate`
    );
  }
  assert.strictEqual(
    composer.composeCorpus(inputFor(FOLDER, activeCorpus([
      row('row-1', 'ready'),
      row('row-1', 'ready')
    ]))),
    null,
    'duplicate row tokens cannot imply duplicate certification'
  );
  assert.strictEqual(
    composer.composeCorpus(inputFor(
      FOLDER,
      activeCorpus(certifiedRows, aggregate(['row-1', 'row-2']))
    )),
    null,
    'aggregate is rejected unless tied to the complete certified row set'
  );
  assert.strictEqual(
    composer.composeCorpus(inputFor(
      FOLDER,
      activeCorpus(certifiedRows, aggregate(['row-3', 'row-2', 'row-1']))
    )),
    null,
    'aggregate order must match the one bounded display operation'
  );
  assert.strictEqual(
    composer.composeCorpus(inputFor(FOLDER, activeCorpus(
      Array.from({ length: 33 }, (_, index) => row(`row-${index + 1}`, 'ready'))
    ))),
    null,
    'certified row set remains bounded'
  );

  const closed = composer.composeCorpus(inputFor(FOLDER, corpusClosed('denied')));
  assert.ok(closed, 'closed corpus state composes fixed fail-quiet copy');
  assert.strictEqual(closed.mode, 'corpus-closed');
  assert.strictEqual(closed.copy, 'Corpus unavailable');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(closed, 'rows'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(closed, 'aggregate'), false);

  for (const field of FORBIDDEN_PROJECTION_FIELDS) {
    const value = field === 'sourceStateCounts' ? { ready: 2 } : 'private-value';
    assert.strictEqual(
      composer.composeCorpus(inputFor(DRIVE_FILE, withExtra(currentSource('ready'), field, value))),
      null,
      `${field} is structurally forbidden from current-source projection`
    );
    assert.strictEqual(
      composer.composeCorpus(inputFor(FOLDER, withExtra(corpusClosed(), field, value))),
      null,
      `${field} is structurally forbidden from corpus-closed projection`
    );
  }
  assert.strictEqual(
    composer.composeCorpus(inputFor(FOLDER, withExtra(activeCorpus(certifiedRows), 'sourceStateCounts', { ready: 3 }))),
    null,
    'sourceStateCounts never enters even a certified active-corpus projection'
  );
  assert.strictEqual(
    composer.composeCorpus(inputFor(FOLDER, activeCorpus([
      withExtra(row('row-1', 'ready'), 'details', 'prior private detail')
    ]))),
    null,
    'certified rows reject details and prior state'
  );

  const accessor = {};
  Object.defineProperty(accessor, 'mode', { enumerable: true, get() { throw new Error('secret getter'); } });
  assert.strictEqual(
    composer.composeCorpus(inputFor(FOLDER, accessor)),
    null,
    'projection accessors fail closed without executing as data'
  );
  let rowGetterCalls = 0;
  const accessorRows = [];
  Object.defineProperty(accessorRows, '0', {
    enumerable: true,
    get() { rowGetterCalls += 1; return row('row-secret', 'ready'); }
  });
  accessorRows.length = 1;
  assert.strictEqual(composer.composeCorpus(inputFor(FOLDER, Object.freeze({
    mode: 'active-corpus',
    rows: accessorRows,
    aggregate: null,
    actionToken: 'corpus-action-19-7-1'
  }))), null, 'row-array accessors are rejected as non-data projections');
  assert.strictEqual(rowGetterCalls, 0, 'row-array accessors are never invoked');
  const bidi = composer.composeCorpus(inputFor(
    DRIVE_FILE,
    currentSource('ready', undefined, `Agreement\u202eprivate`)
  ));
  assert.ok(bidi);
  assert.strictEqual(bidi.source.label, 'Current source', 'bidi labels reduce to generic copy');
  const oversized = composer.composeCorpus(inputFor(
    DRIVE_FILE,
    currentSource('ready', undefined, 'A'.repeat(81))
  ));
  assert.ok(oversized);
  assert.strictEqual(oversized.source.label, 'Current source', 'oversized labels reduce to generic copy');
  assert.strictEqual(
    composer.composeCorpus(inputFor(DRIVE_FILE, currentSource('ready', 'stale-action-token'))),
    null,
    'projection action token must match the current display operation'
  );
}

function createMountedShell(generation = 19) {
  const document = new MockDocument({ popoverSupported: true });
  const window = new MockWindow(document);
  document.defaultView = window;
  const fixtureToken = Object.freeze({ fixture: Symbol('corpus-shell') });
  const ledger = new SkopeoResourceLedger('corpus-shell');
  const actions = [];
  const shell = shellApi.createShell({
    document,
    window,
    generation,
    onCorpusAction(payload) { actions.push(payload); return true; },
    resourceLedger: ledger,
    allowControlledFixture: true,
    fixtureToken
  });
  const prepared = shell.prepareAmbient();
  assert.ok(prepared, 'corpus shell prepares existing ambient HUD');
  assert.strictEqual(shell.mountAmbient(prepared), true, 'corpus shell mounts existing ambient HUD');
  return { document, window, shell, ledger, fixtureToken, actions };
}

function testShellCorpusRegion() {
  const harness = createMountedShell();
  const root = harness.shell.getControlledTestRoot(harness.fixtureToken);
  const enrollmentModel = composer.composeCorpus(inputFor(FOLDER, enrollment()));
  assert.strictEqual(harness.shell.renderCorpus(enrollmentModel), true, 'shell renders closed enrollment model');
  assertCorpusSurfacePresentOnce(root, '.skopeo-corpus-region', 'one corpus region uses the sole shell');
  assertCorpusSurfacePresentOnce(root, '.skopeo-corpus-enroll', 'Enroll this folder appears exactly once');
  const button = root.querySelector('.skopeo-corpus-enroll');
  assert.strictEqual(button.textContent, 'Enroll this folder');
  assert.strictEqual(button.getAttribute('aria-label'), 'Enroll this folder');
  assert.strictEqual(button.getAttribute('type'), 'button');
  button.focus({ preventScroll: true });
  assert.strictEqual(root.activeElement, button, 'enrollment control is keyboard focusable inside the sole shell');
  button.click();
  button.click();
  assert.strictEqual(harness.actions.length, 1, 'repeated clicks emit one current enrollment claim');
  assert.deepStrictEqual(Object.keys(harness.actions[0]).sort(), [
    'actionToken', 'contextEpoch', 'exactOrigin', 'generation', 'profileVersion', 'semanticEntityToken'
  ]);

  const active = composer.composeCorpus(inputFor(FOLDER, activeCorpus([
    row('row-1', 'ready', '<img src=x onerror=globalThis.__corpusPwned=true>'),
    row('row-2', 'download-blocked', 'Agreement B')
  ], aggregate(['row-1', 'row-2']))));
  assert.ok(active, 'unsafe active row identity normalizes before shell render');
  assert.strictEqual(harness.shell.renderCorpus(active), true);
  assertCorpusSurfaceAbsent(root, '.skopeo-corpus-enroll', 'status replacement synchronously removes enrollment control');
  assert.strictEqual(root.querySelectorAll('.skopeo-corpus-row').length, 2, 'only certified rows paint');
  assert.strictEqual(root.querySelector('.skopeo-corpus-region').getAttribute('role'), 'region');
  assert.strictEqual(root.querySelector('.skopeo-corpus-list').getAttribute('role'), 'list');
  assert.strictEqual(root.querySelector('.skopeo-corpus-region').textContent.includes('<img'), false);
  assert.strictEqual(root.querySelectorAll('img').length, 0, 'safe text creates no active media');
  assert.strictEqual(globalThis.__corpusPwned, undefined);
  for (const privateValue of ['row-1', 'row-2', FOLDER.id, active.actionToken]) {
    assert.strictEqual(root.querySelector('.skopeo-corpus-region').textContent.includes(privateValue), false,
      'row/entity/action tokens never enter visible corpus text');
  }

  const pendingToken = 'corpus-action-19-8-1';
  const pending = composer.composeCorpus(inputFor(
    DRIVE_FILE,
    currentSource('pending', pendingToken),
    pendingToken,
    authority(8)
  ));
  assert.strictEqual(harness.shell.renderCorpus(pending), true);
  assert.strictEqual(root.querySelectorAll('.skopeo-corpus-row').length, 0, 'pending withdraws all prior rows before paint');
  assertCorpusSurfaceAbsent(root, '.skopeo-corpus-aggregate', 'pending withdraws prior aggregate/count copy');
  assert.strictEqual(root.querySelector('.skopeo-corpus-source-label').textContent, 'Current source');
  assert.strictEqual(root.querySelector('.skopeo-corpus-source-state').getAttribute('role'), 'status');
  assert.strictEqual(root.textContent.includes('Agreement B'), false, 'pending cannot retain prior certified labels/details');

  const expectedStateCopy = Object.freeze({
    ready: 'Ready',
    pending: 'Checking access',
    unreadable: 'Unreadable',
    'download-blocked': 'Download blocked',
    inaccessible: 'Inaccessible',
    missing: 'Missing'
  });
  for (const state of STATES) {
    const token = `corpus-action-19-8-${state}`;
    const model = composer.composeCorpus(inputFor(
      DRIVE_FILE,
      currentSource(state, token),
      token,
      authority(8)
    ));
    assert.strictEqual(harness.shell.renderCorpus(model), true, `${state} visibly renders in the current shell`);
    assert.strictEqual(root.querySelector('.skopeo-corpus-source-state').textContent, expectedStateCopy[state]);
    assert.strictEqual(root.querySelectorAll('.skopeo-corpus-row').length, 0, `${state} retains no prior row`);
    assertCorpusSurfaceAbsent(root, '.skopeo-corpus-aggregate', `${state} retains no prior aggregate`);
  }

  const closedToken = 'corpus-action-19-8-closed';
  const closed = composer.composeCorpus(inputFor(
    DRIVE_FILE,
    corpusClosed('denied', closedToken),
    closedToken,
    authority(8)
  ));
  assert.strictEqual(harness.shell.renderCorpus(closed), true);
  assert.strictEqual(root.querySelector('.skopeo-corpus-closed').textContent, 'Corpus unavailable');
  assert.strictEqual(root.querySelectorAll('.skopeo-corpus-row').length, 0, 'fail-quiet state has no prior rows');
  assertCorpusSurfaceAbsent(root, '.skopeo-corpus-aggregate', 'fail-quiet state has no prior count');

  assert.strictEqual(harness.shell.renderCorpus(pending), true, 'current pending state can replace fail-quiet copy');

  const stale = composer.composeCorpus(inputFor(DRIVE_FILE, currentSource(
    'ready', 'corpus-action-19-6-1'
  ), 'corpus-action-19-6-1', authority(6)));
  assert.strictEqual(harness.shell.renderCorpus(stale), false, 'stale context completion cannot paint');
  assert.strictEqual(root.querySelector('.skopeo-corpus-source-state').textContent, 'Checking access');
  assert.strictEqual(harness.shell.withdrawCorpus(), true, 'explicit withdrawal removes corpus surface synchronously');
  assertCorpusSurfaceAbsent(root, '.skopeo-corpus-region', 'withdrawal leaves no prior rows or announcements');

  const beforeDestroy = harness.shell.getResourceSnapshot();
  assert.ok(beforeDestroy.roots > 0 && beforeDestroy.listeners > 0, 'corpus lifecycle ownership is non-vacuous');
  const destroyed = harness.shell.destroy('corpus-test');
  assertExactZero(destroyed, 'corpus shell teardown is exact zero');
  assertExactZero(harness.ledger.snapshot(), 'injected corpus shell ledger is exact zero');
  assert.strictEqual(harness.document.querySelectorAll('[data-skopeo-shell-root="true"]').length, 0);
}

function testArbitraryDomTextDoesNotEnroll() {
  const harness = createMountedShell();
  const decoy = harness.document.createElement('p');
  decoy.textContent = 'Enroll this folder';
  harness.document.body.appendChild(decoy);
  const root = harness.shell.getControlledTestRoot(harness.fixtureToken);
  assertCorpusSurfaceAbsent(root, '.skopeo-corpus-enroll',
    'arbitrary host DOM text that resembles a folder creates no enrollment action');
  harness.shell.destroy('decoy');
  assertExactZero(harness.ledger.snapshot(), 'decoy host text leaves exact-zero shell resources');
  assert.strictEqual(decoy.isConnected, true, 'host-authored decoy text survives shell teardown');
}

function testShellHundredCyclePlateau() {
  for (let cycle = 1; cycle <= 100; cycle += 1) {
    const harness = createMountedShell(cycle);
    const beforeHost = snapshotHostState(harness.document, harness.window);
    const root = harness.shell.getControlledTestRoot(harness.fixtureToken);
    const tuple = authority(cycle);
    const token = `corpus-action-${cycle}-1`;
    const enrollmentModel = composer.composeCorpus(inputFor(FOLDER, enrollment(token), token, Object.freeze({
      generation: cycle,
      exactOrigin: tuple.exactOrigin,
      profileId: tuple.profileId,
      profileVersion: tuple.profileVersion,
      contextEpoch: tuple.contextEpoch
    })));
    assert.ok(enrollmentModel);
    assert.strictEqual(harness.shell.renderCorpus(enrollmentModel), true);
    assertCorpusSurfacePresentOnce(root, '.skopeo-corpus-enroll', `cycle ${cycle} owns one enrollment button`);
    harness.shell.destroy('cycle');
    assertExactZero(harness.ledger.snapshot(), `cycle ${cycle} returns every resource category to zero`);
    assert.deepStrictEqual(
      snapshotHostState(harness.document, harness.window),
      beforeHost,
      `cycle ${cycle} preserves host DOM, styles, scroll, and focus`
    );
  }
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

function zeroResources() {
  return Object.freeze(Object.assign({}, zeroSnapshot()));
}

function semanticEntityForUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  let match;
  if (parsed.origin === 'https://docs.google.com') {
    match = parsed.pathname.match(/\/document\/d\/([A-Za-z0-9._:-]+)/);
    return match ? entity('docs-document', match[1], 'Current document') : null;
  }
  match = parsed.pathname.match(/\/folders\/([A-Za-z0-9._:-]+)/);
  if (match) return entity('drive-folder', match[1], 'Current folder');
  match = parsed.pathname.match(/\/file\/d\/([A-Za-z0-9._:-]+)/);
  return match ? entity('drive-file', match[1], 'Current file') : null;
}

function createRuntimeHarness(initialUrl, corpusResponses = []) {
  const document = new MockDocument({ popoverSupported: false });
  const window = new MockWindow(document);
  document.defaultView = window;
  window.location = { href: initialUrl };
  const messages = [];
  const shells = [];
  const runtimeListeners = [];
  let contextEpoch = 0;
  let corpusResponseIndex = 0;

  const chrome = {
    runtime: {
      id: 'skopeo-extension-id',
      onMessage: {
        addListener(listener) { runtimeListeners.push(listener); },
        removeListener(listener) {
          const index = runtimeListeners.indexOf(listener);
          if (index >= 0) runtimeListeners.splice(index, 1);
        }
      },
      sendMessage(message) {
        messages.push(message);
        if (message.action === 'skopeo:corpus-enroll' ||
            message.action === 'skopeo:corpus-status' ||
            message.action === 'skopeo:corpus-root-status') {
          const response = corpusResponses[corpusResponseIndex++];
          if (response && response.promise) return response.promise;
          if (typeof response === 'function') return Promise.resolve(response(message));
          return Promise.resolve(response === undefined ? null : response);
        }
        return Promise.resolve(null);
      }
    }
  };

  function createShell(options) {
    const shell = {
      options,
      renderedCorpus: [],
      withdrawals: 0,
      destroyed: false,
      prepareAmbient() { return Object.freeze({ prepared: true }); },
      getPreparedPlacementMode() { return 'full'; },
      mountAmbient() { return true; },
      projectContext() { return true; },
      renderAdaptive() { return true; },
      renderCorpus(model) { this.renderedCorpus.push(model); return true; },
      withdrawCorpus() { this.withdrawals += 1; return true; },
      withdrawSemanticAnchor() { return true; },
      getResourceSnapshot() { return zeroResources(); },
      destroy() { this.destroyed = true; return zeroResources(); },
      back() { return true; },
      getSnapshot() { return { attention: 'ambient' }; }
    };
    shells.push(shell);
    return shell;
  }

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
  window.FSBSkopeoContextRouter = Object.freeze({
    createRouter() {
      return {
        route(input) {
          contextEpoch += 1;
          const semanticEntity = semanticEntityForUrl(input.url);
          return Object.freeze({
            status: semanticEntity ? 'recognized' : 'unsupported',
            contextKind: semanticEntity && semanticEntity.kind === 'drive-folder'
              ? 'vendor-folder'
              : semanticEntity && semanticEntity.kind === 'docs-document'
                ? 'agreement-reading'
                : 'focused-ask',
            contextEpoch,
            semanticIdentity: semanticEntity
              ? Object.freeze({ kind: semanticEntity.kind, id: semanticEntity.id })
              : null,
            reason: semanticEntity ? null : 'unsupported-context'
          });
        },
        dispose() {}
      };
    }
  });
  window.FSBSkopeoAppContextResolver = Object.freeze({
    createResolver() {
      return {
        resolve(input) {
          return Object.freeze({
            status: 'recognized',
            contextEpoch,
            semanticEntity: semanticEntityForUrl(input.url),
            capabilityGroups: Object.freeze([])
          });
        },
        dispose() {}
      };
    },
    validateResult(value) { return !!value && value.status === 'recognized'; }
  });
  window.FSBSkopeoAnchorRegistry = Object.freeze({
    BINDING_REASON: Object.freeze({ manual: 'manual' }),
    createRegistry() { throw new Error('anchor registry is not needed by corpus fixture'); }
  });
  window.FSBSkopeoAdapterRegistry = Object.freeze({ resolve() { return Object.freeze({}); } });
  window.FSBSkopeoAdaptiveComposer = Object.freeze({
    compose() { return Object.freeze({ attention: 'ambient' }); },
    composeCorpus(input) {
      return composer.composeCorpus(JSON.parse(JSON.stringify(input)));
    },
    validateCorpusModel: composer.validateCorpusModel
  });
  window.FSBSkopeoRendererRegistry = Object.freeze({
    render() { return []; },
    validateAtoms() { return true; }
  });
  window.FSBSkopeoShell = Object.freeze({ createShell });

  vm.runInNewContext(RUNTIME_SOURCE, sandbox, { filename: RUNTIME_PATH });
  const api = window.__FSB_SKOPEO_RUNTIME__;
  const origin = new URL(initialUrl).origin;
  const projection = Object.freeze({
    generation: 19,
    exactOrigin: origin,
    profileId: 'drive-docs-deep-pack',
    profileVersion: '54.1.0',
    catalogVersion: 'catalog-54',
    profile: Object.freeze({
      adapterId: 'drive-docs-deep-pack-v1',
      rendererId: 'drive-docs-deep-pack-v1'
    })
  });

  function sendRuntime(message) {
    let response;
    const listener = runtimeListeners[runtimeListeners.length - 1];
    assert.ok(listener, 'runtime listener exists');
    listener(message, { id: chrome.runtime.id }, value => { response = value; });
    return response;
  }

  return {
    api,
    window,
    document,
    messages,
    shells,
    projection,
    sendRuntime,
    start() {
      assert.strictEqual(api.configure({ action: 'skopeo:configure', generation: 19, projection }), true);
      assert.strictEqual(api.prepare({ action: 'skopeo:prepare', generation: 19 }), true);
      assert.strictEqual(api.commit({ action: 'skopeo:commit', generation: 19 }), true);
      return shells[0];
    }
  };
}

function corpusMessages(harness, action) {
  return harness.messages.filter(message => message.action === action);
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function testRuntimeFolderEnrollmentClaim() {
  const rootStatus = deferred();
  const response = deferred();
  const harness = createRuntimeHarness(
    'https://drive.google.com/drive/folders/folder-root-A',
    [rootStatus, response]
  );
  const shell = harness.start();
  assert.strictEqual(shell.renderedCorpus.length, 0,
    'folder commit withdraws while exact-root background status is pending');
  const rootClaims = corpusMessages(harness, 'skopeo:corpus-root-status');
  assert.strictEqual(rootClaims.length, 1, 'folder refresh requests one exact-root status');
  assert.deepStrictEqual(Object.keys(rootClaims[0]).sort(), [
    'action',
    'actionToken',
    'contextEpoch',
    'corpusRootFileId',
    'exactOrigin',
    'generation',
    'profileVersion',
    'semanticEntityToken'
  ]);
  assert.strictEqual(rootClaims[0].corpusRootFileId, 'folder-root-A');
  rootStatus.resolve(enrollment(rootClaims[0].actionToken));
  await flushMicrotasks();
  assert.strictEqual(shell.renderedCorpus.length, 1,
    'background enrollment decision composes one folder enrollment control');
  assert.strictEqual(shell.renderedCorpus[0].mode, 'enrollment');
  assert.strictEqual(corpusMessages(harness, 'skopeo:corpus-enroll').length, 0, 'commit alone grants no enrollment authority');
  assert.strictEqual(corpusMessages(harness, 'skopeo:corpus-status').length, 0, 'folder enrollment does not imply corpus status authority');

  const payload = Object.freeze({
    generation: shell.renderedCorpus[0].authority.generation,
    exactOrigin: shell.renderedCorpus[0].authority.exactOrigin,
    profileVersion: shell.renderedCorpus[0].authority.profileVersion,
    contextEpoch: shell.renderedCorpus[0].authority.contextEpoch,
    semanticEntityToken: shell.renderedCorpus[0].semanticEntityToken,
    actionToken: shell.renderedCorpus[0].actionToken
  });
  assert.strictEqual(shell.options.onCorpusAction(payload), true, 'trusted enrollment action submits current claim');
  assert.strictEqual(shell.options.onCorpusAction(payload), false, 'repeated enrollment callback is consumed once');
  const enrollClaims = corpusMessages(harness, 'skopeo:corpus-enroll');
  assert.strictEqual(enrollClaims.length, 1);
  assert.deepStrictEqual(Object.keys(enrollClaims[0]).sort(), [
    'action',
    'actionToken',
    'contextEpoch',
    'corpusRootFileId',
    'exactOrigin',
    'generation',
    'profileVersion',
    'semanticEntityToken'
  ]);
  assert.strictEqual(enrollClaims[0].corpusRootFileId, 'folder-root-A');
  for (const forbidden of ['accountPermissionId', 'email', 'authuser', 'tabId', 'permissionId', 'certificate']) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(enrollClaims[0], forbidden), false,
      `content enrollment claim carries no ${forbidden} authority`);
  }
  assert.ok(shell.withdrawals >= 1, 'prior corpus presentation withdraws synchronously before enrollment request');

  response.resolve(activeCorpus([
    row('row-1', 'ready', 'Agreement A')
  ], aggregate(['row-1']), enrollClaims[0].actionToken));
  await flushMicrotasks();
  assert.strictEqual(shell.renderedCorpus.length, 2, 'fresh enrollment response paints once');
  assert.strictEqual(shell.renderedCorpus[1].mode, 'active-corpus');
  assert.strictEqual(shell.renderedCorpus[1].rows.length, 1);

  const snapshot = harness.api.terminate({ action: 'skopeo:terminate', generation: 19, reason: 'off' });
  assertExactZero(snapshot.resources, 'off session returns runtime and shell resources to exact zero');
  assert.strictEqual(shell.destroyed, true);
}

async function testRuntimeFolderStatusAndStaleRaces() {
  const unavailableHarness = createRuntimeHarness(
    'https://drive.google.com/drive/folders/folder-root-A',
    []
  );
  const unavailableShell = unavailableHarness.start();
  await flushMicrotasks();
  assert.strictEqual(unavailableShell.renderedCorpus.length, 0,
    'missing/undefined root-status response cannot infer enrollment in content');

  const activeHarness = createRuntimeHarness(
    'https://drive.google.com/drive/folders/folder-root-A',
    [message => activeCorpus([
      row('row-root-refresh', 'ready', 'Agreement A')
    ], aggregate(['row-root-refresh']), message.actionToken)]
  );
  const activeShell = activeHarness.start();
  await flushMicrotasks();
  assert.strictEqual(activeShell.renderedCorpus.length, 1);
  assert.strictEqual(activeShell.renderedCorpus[0].mode, 'active-corpus',
    'refresh on the enrolled root renders active corpus, not enrollment');
  assert.strictEqual(corpusMessages(activeHarness, 'skopeo:corpus-enroll').length, 0,
    'active-root refresh performs no enrollment mutation');

  const closedHarness = createRuntimeHarness(
    'https://drive.google.com/drive/folders/folder-root-A',
    [message => corpusClosed('fail-quiet', message.actionToken)]
  );
  const closedShell = closedHarness.start();
  await flushMicrotasks();
  assert.strictEqual(closedShell.renderedCorpus.length, 1);
  assert.strictEqual(closedShell.renderedCorpus[0].mode, 'corpus-closed',
    'validating/unproved root fails quiet without an enrollment action');

  const oldResponse = deferred();
  const newResponse = deferred();
  const raceHarness = createRuntimeHarness(
    'https://drive.google.com/drive/folders/folder-root-A',
    [oldResponse, newResponse]
  );
  const raceShell = raceHarness.start();
  const changed = raceHarness.sendRuntime({
    action: 'skopeo:route-change',
    generation: 19,
    url: 'https://drive.google.com/drive/folders/folder-root-B'
  });
  assert.ok(changed && changed.success);
  const rootClaims = corpusMessages(raceHarness, 'skopeo:corpus-root-status');
  assert.deepStrictEqual(rootClaims.map((claim) => claim.corpusRootFileId), [
    'folder-root-A', 'folder-root-B'
  ]);
  oldResponse.resolve(activeCorpus([
    row('stale-root-row', 'ready', 'Stale root')
  ], aggregate(['stale-root-row']), rootClaims[0].actionToken));
  await flushMicrotasks();
  assert.strictEqual(raceShell.renderedCorpus.length, 0,
    'late status for the prior folder paints nothing');
  newResponse.resolve(enrollment(rootClaims[1].actionToken));
  await flushMicrotasks();
  assert.strictEqual(raceShell.renderedCorpus.length, 1);
  assert.strictEqual(raceShell.renderedCorpus[0].mode, 'enrollment');
  assert.strictEqual(raceShell.renderedCorpus[0].semanticEntityToken,
    'drive-folder:folder-root-B', 'only the current folder receives enrollment');
}

async function testRuntimeExactCurrentSourceAndStaleRaces() {
  const oldResponse = deferred();
  const newResponse = deferred();
  const harness = createRuntimeHarness(
    'https://drive.google.com/drive/file/d/drive-file-A',
    [oldResponse, newResponse]
  );
  const shell = harness.start();
  const firstClaims = corpusMessages(harness, 'skopeo:corpus-status');
  assert.strictEqual(firstClaims.length, 1, 'Drive file requests exact current-source status after commit');
  assert.deepStrictEqual(Object.keys(firstClaims[0]).sort(), [
    'action',
    'actionToken',
    'contextEpoch',
    'currentSourceFileId',
    'exactOrigin',
    'generation',
    'profileVersion',
    'semanticEntityToken'
  ]);
  assert.strictEqual(firstClaims[0].currentSourceFileId, 'drive-file-A');
  assert.strictEqual(shell.renderedCorpus.length, 0, 'prior corpus state is withdrawn while proof is pending');

  const routeResult = harness.sendRuntime({
    action: 'skopeo:route-change',
    generation: 19,
    url: 'https://drive.google.com/drive/file/d/drive-file-B'
  });
  assert.ok(routeResult && routeResult.success, 'same-origin route establishes a new current source tuple');
  const statusClaims = corpusMessages(harness, 'skopeo:corpus-status');
  assert.strictEqual(statusClaims.length, 2);
  assert.strictEqual(statusClaims[1].currentSourceFileId, 'drive-file-B');
  assert.ok(shell.withdrawals >= 2, 'route synchronously withdraws prior rows, labels, aggregate, and announcement');

  oldResponse.resolve(currentSource('ready', statusClaims[0].actionToken, 'Stale private source'));
  await flushMicrotasks();
  assert.strictEqual(shell.renderedCorpus.length, 0, 'stale completion after entity/context change paints zero state');

  newResponse.resolve(currentSource('download-blocked', statusClaims[1].actionToken, 'Current source B'));
  await flushMicrotasks();
  assert.strictEqual(shell.renderedCorpus.length, 1, 'current completion paints once');
  assert.strictEqual(shell.renderedCorpus[0].source.state, 'download-blocked');
  assert.strictEqual(shell.renderedCorpus[0].source.label, 'Current source B');

  const killResponse = deferred();
  const killedHarness = createRuntimeHarness(
    'https://docs.google.com/document/d/docs-document-A/edit',
    [killResponse]
  );
  const killedShell = killedHarness.start();
  assert.strictEqual(corpusMessages(killedHarness, 'skopeo:corpus-status').length, 1, 'Docs requests exact source status');
  const killed = killedHarness.api.terminate({
    action: 'skopeo:terminate', generation: 19, reason: 'replacement'
  });
  assertExactZero(killed.resources, 'replacement kill returns exact zero before pending completion');
  killResponse.resolve(currentSource(
    'ready',
    corpusMessages(killedHarness, 'skopeo:corpus-status')[0].actionToken,
    'Must not paint'
  ));
  await flushMicrotasks();
  assert.strictEqual(killedShell.renderedCorpus.length, 0, 'completion after kill/replacement paints and announces nothing');
}

function testStaticSafetyAndExistingLifecycle() {
  for (const source of [COMPOSER_SOURCE, SHELL_SOURCE, RUNTIME_SOURCE]) {
    assert.strictEqual(/\.innerHTML\s*=|insertAdjacentHTML\s*\(/.test(source), false, 'corpus path has no HTML sink');
    assert.strictEqual(/\beval\s*\(|new\s+Function\s*\(/.test(source), false, 'corpus path has no dynamic execution');
  }
  assert.match(COMPOSER_SOURCE, /current-source/);
  assert.match(COMPOSER_SOURCE, /active-corpus/);
  assert.match(COMPOSER_SOURCE, /download-blocked/);
  assert.match(SHELL_SOURCE, /Enroll this folder/);
  assert.match(SHELL_SOURCE, /forced-colors/);
  assert.match(SHELL_SOURCE, /prefers-reduced-motion/);
  assert.match(SHELL_SOURCE, /max-width:\s*480px/);
  assert.match(RUNTIME_SOURCE, /skopeo:corpus-enroll/);
  assert.match(RUNTIME_SOURCE, /skopeo:corpus-status/);
  assert.match(RUNTIME_SOURCE, /semanticEntity/);
  assert.match(RUNTIME_SOURCE, /contextEpoch/);
  assert.strictEqual(/FsbSkopeoDriveCorpusTransport|FsbSkopeoCorpusStore|chrome\.storage\.local/.test(
    [COMPOSER_SOURCE, SHELL_SOURCE, RUNTIME_SOURCE].join('\n')
  ), false, 'content corpus path imports no Drive transport or trusted storage');
  const contentSources = [COMPOSER_SOURCE, SHELL_SOURCE, RUNTIME_SOURCE].join('\n');
  assert.strictEqual(/contractProjection|alert-delivery/.test(contentSources), false,
    'content corpus presentation still excludes raw contract projection and alert delivery authority');
  assert.strictEqual((COMPOSER_SOURCE.match(/kind:\s*['"]citation-open['"]/g) || []).length, 1,
    'the composer adds exactly one closed citation-open model action kind');
  assert.strictEqual((RUNTIME_SOURCE.match(/['"]skopeo:hud-citation-open['"]/g) || []).length, 1,
    'the runtime adds exactly one narrow HUD citation-open message family');
  const citationModelRegion = markedSource(
    COMPOSER_SOURCE, 'function citationAction(', 'function composeFact('
  );
  const citationRuntimeRegion = markedSource(
    RUNTIME_SOURCE,
    '/* FSB_SKOPEO_CONTRACT_RUNTIME_START */',
    '/* FSB_SKOPEO_CONTRACT_RUNTIME_END */'
  );
  assert.strictEqual(/\b(?:url|href|sourceFileId|rootFileId|citationId|resourceKey|storageKey|accountPermissionId)\b|chrome\.storage/.test(
    citationModelRegion + '\n' + citationRuntimeRegion
  ), false, 'closed citation actions expose no raw URL, source, or storage authority');
}

function markedSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.notStrictEqual(start, -1, `${startMarker} exists`);
  assert.notStrictEqual(end, -1, `${endMarker} exists`);
  assert.ok(end > start, `${startMarker} precedes ${endMarker}`);
  return source.slice(start, end + endMarker.length);
}

function testBackgroundCorpusIntegrationContract() {
  const privateModules = [
    'utils/skopeo-corpus-schema.js',
    'utils/skopeo-corpus-store.js',
    'utils/skopeo-drive-corpus-transport.js',
    'utils/skopeo-drive-authority.js',
    'utils/skopeo-corpus-controller.js',
    'utils/skopeo-drive-reconciler.js'
  ];
  const orderedModules = ['utils/capability-fetch.js'].concat(privateModules);
  let priorIndex = -1;
  for (const modulePath of orderedModules) {
    const index = BACKGROUND_SOURCE.indexOf(`importScripts('${modulePath}')`);
    assert.ok(index > priorIndex, `${modulePath} loads once in private dependency order`);
    assert.strictEqual(BACKGROUND_SOURCE.split(`importScripts('${modulePath}')`).length, 2,
      `${modulePath} has one background load site`);
    priorIndex = index;
  }
  assert.ok(priorIndex < BACKGROUND_SOURCE.indexOf('/* FSB_SKOPEO_CONTROLLER_START */'),
    'all corpus modules load before the existing Skopeo controller');

  const controller = markedSource(
    BACKGROUND_SOURCE,
    '/* FSB_SKOPEO_CONTROLLER_START */',
    '/* FSB_SKOPEO_CONTROLLER_END */'
  );
  const corpusBoundary = markedSource(
    BACKGROUND_SOURCE,
    '/* FSB_SKOPEO_CORPUS_BOUNDARY_START */',
    '/* FSB_SKOPEO_CORPUS_BOUNDARY_END */'
  );
  assert.match(corpusBoundary, /initializeFsbSkopeoCorpusBoundary/);
  assert.match(corpusBoundary, /TRUSTED_CONTEXTS/);
  assert.match(corpusBoundary, /\.recover\(\{\},\s*recoveryGuard\)/,
    'wake boot hides the dormant durable corpus until fresh account proof');
  assert.match(corpusBoundary, /issueMutation\(recoveryController\.signal\)/,
    'wake recovery receives an issued opaque mutation guard');
  assert.match(corpusBoundary, /finishMutation\(recoveryGuard\)/,
    'wake recovery requires terminal store acknowledgement');
  assert.match(controller, /awaitCorpusBoundary/,
    'corpus actions await trusted initialization and closed recovery');
  assert.match(controller, /createSkopeoCorpusKernel/);
  assert.match(controller, /runSkopeoCorpusOperation/);
  assert.match(controller, /handleCorpusEnroll/);
  assert.match(controller, /handleCorpusStatus/);
  assert.match(controller, /recoverCorpusOnWake/);

  for (const action of [
    'skopeo:corpus-enroll', 'skopeo:corpus-status', 'skopeo:corpus-root-status'
  ]) {
    assert.match(controller, new RegExp(`['"]${action}['"]`), `${action} is a narrow content action`);
  }
  for (const kind of ['ingestion', 'query', 'display', 'citation-open', 'alert-delivery']) {
    assert.match(controller, new RegExp(`['"]${kind}['"]`), `${kind} is an explicit facade operation kind`);
  }
  assert.match(controller, /sourceFileId/);
  assert.match(controller, /sourceFileIds/);
  assert.match(controller, /duplicate|new Set/,
    'facade rejects duplicate exact-source selections');
  assert.match(controller, /maxSourcesPerOperation|MAX_CORPUS_OPERATION_SOURCES/,
    'facade enforces a bounded nonempty exact-source set');
  assert.match(controller, /runWithCertifiedSource/);
  assert.match(controller, /runWithCertifiedSources/);
  assert.match(controller, /actionToken/);
  assert.match(controller, /semanticEntityToken/);
  assert.match(controller, /currentSourceFileId/);
  assert.match(controller, /corpusRootFileId/);
  assert.match(controller, /chrome\.tabs\.get/,
    'every operation re-reads the live tab instead of accepting a content URL');

  const contentFiles = markedSource(
    BACKGROUND_SOURCE,
    'const CONTENT_SCRIPT_FILES = [',
    '/* FSB_SKOPEO_CONTROLLER_START */'
  );
  const injectionFiles = markedSource(
    BACKGROUND_SOURCE,
    'const SKOPEO_INJECTION_FILES = Object.freeze([',
    ']);'
  );
  for (const privateModule of ['utils/trusted-local-feature-store.js'].concat(privateModules)) {
    assert.strictEqual(contentFiles.includes(privateModule), false,
      `${privateModule} is absent from generic content injection`);
    assert.strictEqual(injectionFiles.includes(privateModule), false,
      `${privateModule} is absent from Skopeo content injection`);
    assert.strictEqual(MANIFEST_SOURCE.includes(privateModule), false,
      `${privateModule} is absent from manifest content scripts`);
  }
  assert.strictEqual(/FsbSkopeoDriveCorpusTransport|FsbSkopeoCorpusStore|runSkopeoCorpusOperation/.test(
    [COMPOSER_SOURCE, SHELL_SOURCE, RUNTIME_SOURCE].join('\n')
  ), false, 'private store, transport, and facade remain unreachable from content');
}

function testBackgroundTruthIntegrationContract() {
  try {
    const truthModules = [
      'utils/skopeo-truth-schema.js',
      'utils/skopeo-truth-extractor.js',
      'utils/skopeo-lineage-adjudicator.js',
      'utils/skopeo-deadline-engine.js',
      'utils/skopeo-truth-store.js',
      'utils/skopeo-truth-engine.js'
    ];
    let prior = BACKGROUND_SOURCE.indexOf("importScripts('utils/skopeo-graph-engine.js')");
    assert.ok(prior >= 0, 'graph engine import exists before truth imports');
    for (const modulePath of truthModules) {
      const needle = `importScripts('${modulePath}')`;
      const index = BACKGROUND_SOURCE.indexOf(needle);
      assert.ok(index > prior, `${modulePath} loads once after the graph chain`);
      assert.strictEqual(BACKGROUND_SOURCE.split(needle).length, 2,
        `${modulePath} has one background load site`);
      prior = index;
    }
    const boundary = markedSource(
      BACKGROUND_SOURCE,
      '/* FSB_SKOPEO_CORPUS_BOUNDARY_START */',
      '/* FSB_SKOPEO_CORPUS_BOUNDARY_END */'
    );
    assert.match(boundary, /globalThis\.FsbSkopeoTruthStore\.create\s*\(/);
    assert.match(boundary, /graphStore\.registerTruthInvalidator\(truthStore\.graphInvalidator\)/);
    assert.match(boundary, /truthStore\.getPurgeParticipant\(participantName\)/);
    assert.match(boundary, /emptyReserved = participantName === 'counts'/,
      'counts is the sole empty reserved participant');
    assert.match(boundary,
      /participantName === 'alerts'[\s\S]{0,100}alertStore\.getPurgeParticipant\(participantName\)/,
      'alerts use the real Phase 59 purge owner');
    assert.ok(boundary.indexOf('truthStore.recover(truthRecoveryGuard)') >
      boundary.indexOf('globalThis.FsbSkopeoGraphEngine.create'),
    'truth recovery follows graph facade construction');
  } catch (error) {
    throw new Error(`skopeo corpus runtime truth integration contract: ${error.message}`);
  }
}

function createBackgroundCorpusHarness() {
  const controllerSource = markedSource(
    BACKGROUND_SOURCE,
    '/* FSB_SKOPEO_CONTROLLER_START */',
    '/* FSB_SKOPEO_CONTROLLER_END */'
  );
  const exportAnchor = '  global.FSBSkopeoController = controller;';
  assert.ok(controllerSource.includes(exportAnchor), 'background corpus harness finds controller export');
  const instrumented = controllerSource.replace(exportAnchor, [
    '  controller.__testInstallCorpusEntry = function(config) {',
    '    installController(config.tabId, config.generation, {',
    "      status: 'recognized', tabId: config.tabId, generation: config.generation,",
    '      exactOrigin: config.exactOrigin, service: new URL(config.exactOrigin).hostname,',
    "      appStem: 'gdrive', profileId: config.profileId, profileVersion: config.profileVersion,",
    "      catalogVersion: 'sha256:' + 'a'.repeat(64),",
    "      profile: { adapterId: 'drive-docs-deep-pack-v1' }, capabilityGroups: []",
    '    });',
    '    const entry = controllers.get(config.tabId);',
    '    entry.authority = deepFreezeSkopeo({',
    '      contextEpoch: config.contextEpoch, semanticEntity: config.semanticEntity',
    '    });',
    '    return corpusFacadeTuple(config.tabId, entry);',
    '  };',
    '  controller.__testRecoverCorpusOnWake = function(tabId) {',
    '    return recoverCorpusOnWake(tabId, controllers.get(tabId));',
    '  };',
    exportAnchor
  ].join('\n'));

  const tabId = 71;
  const generation = 23;
  const sessionKey = `skopeoSession:${tabId}`;
  const sessionBag = Object.create(null);
  const tabs = new Map();
  const moduleCalls = [];
  const manifest = {
    accountPermissionId: 'permission-A',
    corpusRootFileId: 'folder-root-A',
    authorityEpoch: 9,
    sources: [{
      sourceFileId: 'drive-file-A',
      state: 'ready',
      displayName: 'Agreement A'
    }]
  };
  const boundary = {
    closed: false,
    currentClaim: null,
    hiddenSourceStates: new Map(),
    store: {
      async getVisibleManifest(claim) {
        if (!claim || claim.accountPermissionId !== manifest.accountPermissionId ||
            claim.corpusRootFileId !== manifest.corpusRootFileId) return null;
        return manifest;
      }
    }
  };
  const event = () => ({ addListener() {}, removeListener() {} });
  const chrome = {
    runtime: {
      id: 'background-corpus-fixture',
      onMessage: event(),
      lastError: null
    },
    commands: { onCommand: event() },
    tabs: {
      async get(id) { return tabs.get(id) || null; },
      async sendMessage() { return true; },
      onUpdated: event(),
      onRemoved: event()
    },
    storage: {
      session: {
        async get(key) {
          if (key === null) return { ...sessionBag };
          return Object.prototype.hasOwnProperty.call(sessionBag, key)
            ? { [key]: sessionBag[key] }
            : {};
        },
        async set(values) { Object.assign(sessionBag, values); },
        async remove(key) { delete sessionBag[key]; }
      }
    }
  };

  function createAuthority() {
    return {
      async beginOperation(kind, context) {
        moduleCalls.push({ type: 'begin', kind, context });
        return { kind, context };
      },
      async runWithCertifiedSource(operation, sourceFileId, callback, commitCallback) {
        try {
          const operationController = new AbortController();
          const prepared = await callback(Object.freeze({ sourceFileId }), operationController.signal);
          const value = ['ingestion', 'citation-open', 'alert-delivery'].includes(operation.kind)
            ? await commitCallback(prepared, Object.freeze({
                signal: operationController.signal,
                publish: async effect => effect(Object.freeze({ signal: operationController.signal }))
              }))
            : prepared;
          operationController.abort('complete');
          return { decision: 'admitted', value };
        } catch (_error) {
          return { decision: 'pending' };
        }
      },
      async runWithCertifiedSources(operation, sourceFileIds, callback, commitCallback) {
        try {
          const operationController = new AbortController();
          const certificates = sourceFileIds.map(sourceFileId => Object.freeze({ sourceFileId }));
          const prepared = await callback(
            Object.freeze(certificates),
            Object.freeze({ complete: true }),
            operationController.signal
          );
          const value = ['ingestion', 'citation-open', 'alert-delivery'].includes(operation.kind)
            ? await commitCallback(prepared, Object.freeze({
                signal: operationController.signal,
                publish: async effect => effect(Object.freeze({ signal: operationController.signal }))
              }))
            : prepared;
          operationController.abort('complete');
          if (operation.kind === 'display') {
            return {
              decision: 'admitted',
              rows: value.rows,
              aggregate: value.aggregate
            };
          }
          return { decision: 'admitted', value };
        } catch (_error) {
          return { decision: 'pending' };
        }
      },
      async readHiddenSourceState(operation, sourceFileId) {
        moduleCalls.push({ type: 'hidden-state', sourceFileId });
        const state = boundary.hiddenSourceStates.get(sourceFileId);
        return state
          ? { decision: 'admitted', state }
          : { decision: 'closed' };
      },
      finishOperation() { return true; }
    };
  }

  const sandbox = {
    chrome,
    crypto: webcrypto,
    fsbSkopeoCorpusBootPromise: Promise.resolve(boundary),
    FSBSkopeoSessionState: null,
    FsbCapabilityFetch: { executeBoundPageRead: async () => ({ kind: 'unsupported', status: null }) },
    FsbSkopeoCorpusSchema: {},
    FsbSkopeoDriveCorpusTransport: {
      createTransport() { return { about() {}, getFile() {} }; }
    },
    FsbSkopeoDriveAuthority: { create: createAuthority },
    FsbSkopeoCorpusController: {
      create() {
        let claim = null;
        return {
          async enroll(input) {
            moduleCalls.push({ type: 'enroll', input });
            claim = {
              accountPermissionId: manifest.accountPermissionId,
              corpusRootFileId: input.folderFileId
            };
            return { ok: true, status: 'validating' };
          },
          async revalidate() { return { ok: true, status: 'active' }; },
          async recover() {
            moduleCalls.push({ type: 'recover' });
            claim = {
              accountPermissionId: manifest.accountPermissionId,
              corpusRootFileId: manifest.corpusRootFileId
            };
            return { ok: true, status: 'active' };
          },
          async getRootStatus(input) {
            moduleCalls.push({ type: 'root-status', input });
            if (input.folderFileId === manifest.corpusRootFileId) {
              claim = {
                accountPermissionId: manifest.accountPermissionId,
                corpusRootFileId: manifest.corpusRootFileId
              };
              return { ok: true, status: 'active' };
            }
            return { ok: true, status: 'unconfigured' };
          },
          getCurrentClaim() { return claim; }
        };
      }
    },
    FsbSkopeoDriveReconciler: {
      create() {
        return {
          async buildInitialInventory(context) {
            moduleCalls.push({ type: 'inventory', context });
            return { ok: true, status: 'active' };
          },
          async resume(context) {
            moduleCalls.push({ type: 'resume', context });
            return { ok: true, status: 'active' };
          },
          abort() { return true; }
        };
      }
    },
    AbortController,
    URL,
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
    Reflect,
    Error,
    TypeError
  };
  sandbox.globalThis = sandbox;
  vm.runInContext(instrumented, vm.createContext(sandbox), {
    filename: 'background-corpus-controller.js'
  });

  function activate(url, semanticEntity, exactOrigin = new URL(url).origin) {
    tabs.set(tabId, { id: tabId, url });
    sessionBag[sessionKey] = {
      tabId,
      generation,
      terminalGeneration: generation - 1,
      status: 'active',
      reason: null,
      updatedAt: 100
    };
    return sandbox.FSBSkopeoController.__testInstallCorpusEntry({
      tabId,
      generation,
      exactOrigin,
      profileId: exactOrigin === 'https://docs.google.com'
        ? 'docs-deep-pack-v1'
        : 'drive-deep-pack-v1',
      profileVersion: 'skopeo-profiles-v2',
      contextEpoch: 4,
      semanticEntity
    });
  }

  return {
    controller: sandbox.FSBSkopeoController,
    sender: { id: chrome.runtime.id, tab: { id: tabId } },
    boundary,
    manifest,
    moduleCalls,
    tabs,
    tabId,
    generation,
    activate
  };
}

async function testBackgroundCorpusMessageAndFacadeIntegration() {
  const harness = createBackgroundCorpusHarness();
  await harness.controller.ready;
  const folder = entity('drive-folder', 'folder-root-A', 'Current vendor folder');
  const folderTuple = harness.activate(
    'https://drive.google.com/drive/folders/folder-root-A', folder
  );
  const rootStatusMessage = {
    action: 'skopeo:corpus-root-status',
    generation: harness.generation,
    exactOrigin: 'https://drive.google.com',
    profileVersion: 'skopeo-profiles-v2',
    contextEpoch: 4,
    semanticEntityToken: 'drive-folder:folder-root-A',
    corpusRootFileId: 'folder-root-A',
    actionToken: 'corpus_action_23_4_root_status'
  };
  const rootStatus = await harness.controller.handleContentMessage(
    rootStatusMessage, harness.sender
  );
  assert.strictEqual(rootStatus.mode, 'active-corpus',
    'fresh exact-root status recognizes the already enrolled folder');
  assert.equal(harness.moduleCalls.some((call) => call.type === 'enroll'), false,
    'root status performs no enrollment mutation');

  harness.activate(
    'https://drive.google.com/drive/folders/folder-root-B',
    entity('drive-folder', 'folder-root-B', 'Different folder')
  );
  const differentRootStatus = await harness.controller.handleContentMessage({
    ...rootStatusMessage,
    semanticEntityToken: 'drive-folder:folder-root-B',
    corpusRootFileId: 'folder-root-B',
    actionToken: 'corpus_action_23_4_root_status_B'
  }, harness.sender);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(differentRootStatus)), {
    mode: 'enrollment',
    actionToken: 'corpus_action_23_4_root_status_B'
  }, 'fresh different-root status explicitly authorizes enrollment composition');

  harness.activate(
    'https://drive.google.com/drive/folders/folder-root-A', folder
  );
  const enrollMessage = {
    action: 'skopeo:corpus-enroll',
    generation: harness.generation,
    exactOrigin: 'https://drive.google.com',
    profileVersion: 'skopeo-profiles-v2',
    contextEpoch: 4,
    semanticEntityToken: 'drive-folder:folder-root-A',
    corpusRootFileId: 'folder-root-A',
    actionToken: 'corpus_action_23_4_1'
  };
  const enrollment = await harness.controller.handleContentMessage(enrollMessage, harness.sender);
  assert.strictEqual(enrollment.mode, 'active-corpus', 'exact sender folder claim builds and certifies baseline rows');
  assert.strictEqual(enrollment.rows.length, 1);
  assert.strictEqual(enrollment.rows[0].state, 'ready');
  assert.strictEqual(enrollment.aggregate.rowTokens.length, 1);
  assert.strictEqual(JSON.stringify(enrollment).includes('drive-file-A'), false,
    'certified content projection contains no source ID');
  assert.strictEqual(JSON.stringify(enrollment).includes('permission-A'), false,
    'certified content projection contains no account permission ID');
  assert.deepStrictEqual(
    harness.moduleCalls.filter(call => call.type === 'enroll').map(call => call.input.folderFileId),
    ['folder-root-A'],
    'background derives and enrolls only the exact current folder ID'
  );
  assert.strictEqual(harness.moduleCalls.filter(call => call.type === 'inventory').length, 1,
    'successful enrollment performs one baseline inventory before display');

  const forged = await harness.controller.handleContentMessage(
    { ...enrollMessage, corpusRootFileId: 'other-root', extraAuthority: 'permission-A' },
    harness.sender
  );
  assert.strictEqual(forged.mode, 'corpus-closed', 'extra/cross-root enrollment authority fails closed');
  assert.strictEqual(harness.moduleCalls.filter(call => call.type === 'enroll').length, 1,
    'forged enrollment reaches no controller or Drive operation');

  const file = entity('drive-file', 'drive-file-A', 'Current agreement');
  const fileTuple = harness.activate(
    'https://drive.google.com/drive/file/d/drive-file-A', file
  );
  const statusMessage = {
    action: 'skopeo:corpus-status',
    generation: harness.generation,
    exactOrigin: 'https://drive.google.com',
    profileVersion: 'skopeo-profiles-v2',
    contextEpoch: 4,
    semanticEntityToken: 'drive-file:drive-file-A',
    currentSourceFileId: 'drive-file-A',
    actionToken: 'corpus_action_23_4_2'
  };
  const status = await harness.controller.handleContentMessage(statusMessage, harness.sender);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(status)), {
    mode: 'current-source',
    state: 'ready',
    labelToken: 'current-source',
    actionToken: statusMessage.actionToken,
    displayLabel: 'Agreement A'
  }, 'exact current file receives the certified minimized six-state projection');

  for (const hiddenState of ['pending', 'inaccessible', 'missing']) {
    harness.boundary.hiddenSourceStates.set('drive-file-A', hiddenState);
    const hiddenMessage = {
      ...statusMessage,
      actionToken: `corpus_action_23_4_hidden_${hiddenState}`
    };
    const hidden = await harness.controller.handleContentMessage(hiddenMessage, harness.sender);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(hidden)), {
      mode: 'current-source',
      state: hiddenState,
      labelToken: 'current-source',
      actionToken: hiddenMessage.actionToken
    }, `persisted ${hiddenState} projects only the closed state token`);
    assert.equal(JSON.stringify(hidden).includes('Agreement A'), false,
      `persisted ${hiddenState} cannot project stale source metadata`);
  }
  harness.boundary.hiddenSourceStates.clear();

  const commitPrepared = async (prepared, publisher) => publisher.publish(async () => prepared);
  for (const kind of ['ingestion', 'query', 'display', 'citation-open', 'alert-delivery']) {
    const operationArguments = [
      kind, fileTuple, { sourceFileId: 'drive-file-A' },
      async certificate => ({ provedSource: certificate.sourceFileId })
    ];
    if (['ingestion', 'citation-open', 'alert-delivery'].includes(kind)) {
      operationArguments.push(commitPrepared);
    }
    const admitted = await harness.controller.runCorpusOperation(...operationArguments);
    assert.strictEqual(admitted.decision, 'admitted', `${kind} admits one explicit current source`);
  }
  const uncommittedEffect = await harness.controller.runCorpusOperation(
    'alert-delivery', fileTuple, { sourceFileId: 'drive-file-A' },
    async certificate => ({ provedSource: certificate.sourceFileId })
  );
  assert.strictEqual(uncommittedEffect.decision, 'closed',
    'effectful facade operations require a separate authority-gated commit callback');
  const beginCount = harness.moduleCalls.filter(call => call.type === 'begin').length;
  for (const invalidSelection of [
    { sourceFileIds: [] },
    { sourceFileIds: ['drive-file-A', 'drive-file-A'] },
    { sourceFileIds: Array.from({ length: 33 }, (_, index) => `source-${index}`) },
    {},
    { sourceFileId: 'drive-file-A', sourceFileIds: ['drive-file-A'] }
  ]) {
    const rejected = await harness.controller.runCorpusOperation(
      'query', fileTuple, invalidSelection, async () => ({ leaked: true })
    );
    assert.strictEqual(rejected.decision, 'closed', 'empty, duplicate, over-limit, or implicit-all selection closes');
  }
  assert.strictEqual(harness.moduleCalls.filter(call => call.type === 'begin').length, beginCount,
    'invalid source selection starts zero authority operations');

  const stale = await harness.controller.runCorpusOperation(
    'query', fileTuple, { sourceFileId: 'drive-file-A' }, async () => {
      harness.tabs.set(harness.tabId, {
        id: harness.tabId,
        url: 'https://drive.google.com/drive/file/d/drive-file-B'
      });
      return { privateBody: 'must-not-escape' };
    }
  );
  assert.strictEqual(stale.decision, 'closed', 'tuple change during trusted callback withdraws its output');
  assert.strictEqual(JSON.stringify(stale).includes('must-not-escape'), false,
    'operation-local callback body is absent from stale output');

  void folderTuple;
}

async function testBackgroundDurableWakeRecovery() {
  const harness = createBackgroundCorpusHarness();
  await harness.controller.ready;

  harness.activate(
    'https://drive.google.com/drive/folders/folder-root-B',
    entity('drive-folder', 'folder-root-B', 'Different folder')
  );
  assert.equal(await harness.controller.__testRecoverCorpusOnWake(harness.tabId), true,
    'wake recovery runs while a different Drive folder is visible');
  assert.deepEqual(JSON.parse(JSON.stringify(harness.boundary.currentClaim)), {
    accountPermissionId: 'permission-A',
    corpusRootFileId: 'folder-root-A'
  }, 'wake keeps the durable root A claim instead of enrolling visible root B');
  assert.equal(harness.moduleCalls.some((call) => call.type === 'enroll'), false,
    'wake recovery never invokes explicit enrollment for the visible folder');
  assert.equal(harness.moduleCalls.filter((call) => call.type === 'resume').at(-1)
    .context.corpusRootFileId, 'folder-root-A',
  'reconciler resumes only the persisted root tuple');

  harness.boundary.currentClaim = null;
  harness.activate(
    'https://docs.google.com/document/d/docs-document-A/edit',
    entity('docs-document', 'docs-document-A', 'Current document')
  );
  assert.equal(await harness.controller.__testRecoverCorpusOnWake(harness.tabId), true,
    'wake recovery also runs from a Docs document context');
  assert.equal(harness.moduleCalls.filter((call) => call.type === 'resume').at(-1)
    .context.corpusRootFileId, 'folder-root-A',
  'document wake recovery resumes the same durable root A');
}

async function run() {
  testBackgroundTruthIntegrationContract();
  testComposerClosedModels();
  testShellCorpusRegion();
  testArbitraryDomTextDoesNotEnroll();
  testShellHundredCyclePlateau();
  await testRuntimeFolderEnrollmentClaim();
  await testRuntimeFolderStatusAndStaleRaces();
  await testRuntimeExactCurrentSourceAndStaleRaces();
  testStaticSafetyAndExistingLifecycle();
  testBackgroundCorpusIntegrationContract();
  await testBackgroundCorpusMessageAndFacadeIntegration();
  await testBackgroundDurableWakeRecovery();
  console.log('skopeo-corpus-runtime: PASS');
}

run().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
