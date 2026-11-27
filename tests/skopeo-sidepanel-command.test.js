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

const SELF_TEST = process.argv.includes('--self-test');
const REPO_ROOT = path.resolve(__dirname, '..');
const BACKGROUND_PATH = path.join(REPO_ROOT, 'extension', 'background.js');
const MANIFEST_PATH = path.join(REPO_ROOT, 'extension', 'manifest.json');
const SIDEPANEL_HTML_PATH = path.join(REPO_ROOT, 'extension', 'ui', 'sidepanel.html');
const SIDEPANEL_CSS_PATH = path.join(REPO_ROOT, 'extension', 'ui', 'sidepanel.css');
const SIDEPANEL_JS_PATH = path.join(REPO_ROOT, 'extension', 'ui', 'sidepanel.js');
const WS_CLIENT_PATH = path.join(REPO_ROOT, 'extension', 'ws', 'ws-client.js');
const CONTROL_PANEL_HTML_PATH = path.join(REPO_ROOT, 'extension', 'ui', 'control_panel.html');
const OPTIONS_JS_PATH = path.join(REPO_ROOT, 'extension', 'ui', 'options.js');
const CONTROLLER_START = '/* FSB_SKOPEO_CONTROLLER_START */';
const CONTROLLER_END = '/* FSB_SKOPEO_CONTROLLER_END */';
const COMMAND = 'toggle-skopeo-current-tab';
const PREPARED_REASON = 'prepared-awaiting-commit';
const ZERO_RESOURCES = zeroSnapshot();
const EMPTY_ARGUMENT_SCHEMA_DIGEST = 'sha256:99334726611ccf58a148b0814696bfa6fe08c1b2d027e946beccf5a74331c9aa';
const ADAPTIVE_INJECTION_FILES = Object.freeze([
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
// ui-locale.js and the HUD copy map are injected in front of the bundle.
const LOCALE_INJECTION_FILES = Object.freeze([
  'utils/ui-locale.js',
  'utils/skopeo-hud-exact.js'
]);

function activeResources() {
  return { ...ZERO_RESOURCES, roots: 1, listeners: 2, popoverTopLayer: 1 };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function testProjection(tabId, generation, rawUrl) {
  const exactOrigin = new URL(rawUrl).origin;
  const service = new URL(rawUrl).hostname;
  return {
    status: 'recognized', tabId, generation, exactOrigin, service,
    appStem: 'example', profileId: 'generic-default-v1',
    profileVersion: 'skopeo-profiles-v1', catalogVersion: 'sha256:' + 'a'.repeat(64),
    profile: {
      profileDisposition: 'generic-default', displayName: 'Example', defaultGenre: 'generic-app',
      pageNoun: 'view', entityVocabulary: { singular: 'item', plural: 'items' },
      attentionCeiling: 'ambient', adapterId: 'generic-unanchored-v1', rendererId: 'generic-default-v1'
    },
    capabilityGroups: [{
      id: 'review', label: 'Review', capabilities: [{
        slug: 'example.list', actionLabel: 'List items', effect: 'read-only', sideEffectClass: 'read',
        executionOrigin: exactOrigin, schemaDigest: EMPTY_ARGUMENT_SCHEMA_DIGEST,
        executionBlockReason: null,
        paramSummary: { count: 0, required: [], optional: [], truncated: false },
        argumentContract: {
          mode: 'empty', fields: [], reason: null, schemaDigest: EMPTY_ARGUMENT_SCHEMA_DIGEST
        },
        actionabilityReason: null, sourceReadiness: 't1-ready',
        sourceTerminalState: 't1-ready', surfaceStatus: 't1-ready', presentationDisposition: 't1-ready',
        executionEnabled: true, invocable: true
      }, {
        slug: 'example.update', actionLabel: 'Update item', effect: 'changes-service-data', sideEffectClass: 'write',
        executionOrigin: exactOrigin, schemaDigest: EMPTY_ARGUMENT_SCHEMA_DIGEST,
        executionBlockReason: 'source-not-ready',
        paramSummary: { count: 0, required: [], optional: [], truncated: false },
        argumentContract: {
          mode: 'empty', fields: [], reason: null, schemaDigest: EMPTY_ARGUMENT_SCHEMA_DIGEST
        },
        actionabilityReason: 'consequence-contract-pending', sourceReadiness: 't1-ready',
        sourceTerminalState: 't1-ready', surfaceStatus: 't1-ready', presentationDisposition: 'unsupported',
        executionEnabled: false, invocable: false
      }]
    }]
  };
}

function readyMessage(generation, rawUrl = 'https://example.test/a') {
  const projection = testProjection(11, generation, rawUrl);
  return {
    action: 'skopeo:ready', generation, attention: 'ambient', exactOrigin: projection.exactOrigin,
    profileId: projection.profileId, profileVersion: projection.profileVersion,
    catalogVersion: projection.catalogVersion, contextEpoch: 1, semanticEntity: null
  };
}

function readMessage(generation, overrides = {}) {
  const projection = testProjection(11, generation, 'https://example.test/a');
  return {
    action: 'skopeo:read-invoke',
    generation,
    exactOrigin: projection.exactOrigin,
    profileId: projection.profileId,
    profileVersion: projection.profileVersion,
    catalogVersion: projection.catalogVersion,
    contextEpoch: 1,
    semanticEntity: null,
    slug: 'example.list',
    args: {},
    actionToken: 'sr1_fixture_current_0001',
    schemaDigest: EMPTY_ARGUMENT_SCHEMA_DIGEST,
    ...overrides
  };
}

function parseStringArray(source, anchor) {
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(escaped + '\\s*=\\s*(?:Object\\.freeze\\()?\\s*\\[([\\s\\S]*?)\\]'));
  assert.ok(match, anchor + ' array exists');
  return match[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]/, '').replace(/['"]$/, ''))
    .filter(Boolean);
}

function parseFallbackBundle(source) {
  const helper = source.match(/function _getContentScriptFilesForInjection\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(helper, 'fallback injection helper exists');
  const fallback = helper[0].match(/return\s*\[([\s\S]*?)\]/);
  assert.ok(fallback, 'fallback injection array exists');
  return parseStringArray('FALLBACK = [' + fallback[1] + ']', 'FALLBACK');
}

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    },
    removeListener(listener) {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    },
    emit(...args) {
      return listeners.slice().map((listener) => listener(...args));
    }
  };
}

function deliverChromeRuntimeMessage(event, message, sender = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let asyncResponseClaimed = false;
    const sendResponse = (response) => {
      if (settled) return;
      settled = true;
      resolve(clone(response));
    };
    try {
      for (const listener of event.listeners.slice()) {
        if (listener(clone(message), clone(sender), sendResponse) === true) {
          asyncResponseClaimed = true;
        }
      }
      if (!settled && !asyncResponseClaimed) {
        settled = true;
        resolve(undefined);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function extractBracedSource(source, anchor, includeDeclaration) {
  const start = source.indexOf(anchor);
  assert.notEqual(start, -1, anchor + ' exists');
  const open = source.indexOf('{', start);
  assert.notEqual(open, -1, anchor + ' opening brace exists');
  let depth = 1;
  let index = open + 1;
  while (index < source.length && depth > 0) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    index += 1;
  }
  assert.equal(depth, 0, anchor + ' closes');
  return includeDeclaration
    ? source.slice(start, index)
    : source.slice(open + 1, index - 1);
}

function createChromeHarness(options = {}) {
  const operations = [];
  const broadcasts = [];
  const executeCalls = [];
  const tabMessages = [];
  const getCalls = [];
  const queryCalls = [];
  const storageData = new Map();
  const tabs = new Map();
  const runtimes = new Map();
  const runtimeOnMessage = createEvent();
  const commandEvent = createEvent();
  const updatedEvent = createEvent();
  const removedEvent = createEvent();
  const routerCalls = [];
  const gateManagers = [];

  for (const tab of options.tabs || [
    { id: 11, url: 'https://example.test/a' },
    { id: 22, url: 'https://example.test/b' },
    { id: 33, url: 'chrome://settings/' }
  ]) {
    tabs.set(tab.id, clone(tab));
  }
  for (const [key, value] of Object.entries(options.storage || {})) {
    storageData.set(key, clone(value));
  }
  for (const [tabId, runtime] of Object.entries(options.runtimes || {})) {
    runtimes.set(Number(tabId), { resources: { ...ZERO_RESOURCES }, ...clone(runtime) });
  }

  function responseForGet(keys) {
    if (keys == null) return Object.fromEntries(Array.from(storageData, ([key, value]) => [key, clone(value)]));
    const requested = Array.isArray(keys) ? keys : [keys];
    const result = {};
    for (const key of requested) {
      if (storageData.has(key)) result[key] = clone(storageData.get(key));
    }
    return result;
  }

  const localData = options.localStorage ? new Map(Object.entries(clone(options.localStorage))) : null;
  const storageChanged = createEvent();

  const chrome = {
    runtime: {
      id: 'skopeo-test-extension',
      lastError: null,
      onMessage: runtimeOnMessage,
      async sendMessage(message) {
        broadcasts.push(clone(message));
        operations.push('broadcast:' + message.action + ':' + (message.status || 'none'));
        if (options.runtimeBroadcastEvent) {
          return deliverChromeRuntimeMessage(options.runtimeBroadcastEvent, message, {
            id: chrome.runtime.id
          });
        }
        return true;
      }
    },
    commands: { onCommand: commandEvent },
    tabs: {
      onUpdated: updatedEvent,
      onRemoved: removedEvent,
      async get(tabId) {
        getCalls.push(tabId);
        operations.push('tabs.get:' + tabId);
        if (!tabs.has(tabId)) throw new Error('No tab with id: ' + tabId);
        return clone(tabs.get(tabId));
      },
      async query(queryInfo) {
        queryCalls.push(clone(queryInfo));
        return Array.from(tabs.values()).slice(0, 1).map(clone);
      },
      async sendMessage(tabId, message, messageOptions) {
        const entry = { tabId, message: clone(message), options: clone(messageOptions) };
        tabMessages.push(entry);
        operations.push('tab-message:' + tabId + ':' + message.action + ':' + message.generation);
        const runtime = runtimes.get(tabId);
        if (!runtime || runtime.listenerMissing) throw new Error('Could not establish connection. Receiving end does not exist.');
        if (message.action === 'skopeo:configure') {
          if (runtime.configureFailure) throw new Error('configure delivery failed');
          runtime.generation = message.generation;
          runtime.projection = clone(message.projection);
          runtime.phase = 'configured';
          return runtime.configureResponse === undefined ? true : clone(runtime.configureResponse);
        }
        if (message.action === 'skopeo:prepare') {
          if (runtime.prepareFailure) throw new Error('prepare delivery failed');
          if (runtime.phase !== 'configured' || runtime.generation !== message.generation) return false;
          runtime.generation = message.generation;
          runtime.phase = 'prepared';
          runtime.resources = { ...ZERO_RESOURCES };
          return runtime.prepareResponse === undefined ? true : clone(runtime.prepareResponse);
        }
        if (message.action === 'skopeo:commit') {
          if (runtime.commitFailure) throw new Error('commit delivery failed');
          if (runtime.phase !== 'prepared' || runtime.generation !== message.generation) return false;
          runtime.phase = 'active';
          runtime.resources = activeResources();
          return runtime.commitResponse === undefined ? true : clone(runtime.commitResponse);
        }
        if (message.action === 'skopeo:probe') {
          if (runtime.probeFailure) throw new Error('probe delivery failed');
          if (runtime.probeResponse) return clone(runtime.probeResponse);
          if (runtime.phase === 'active' && runtime.generation === message.generation) {
            const projection = runtime.projection || testProjection(tabId, message.generation, tabs.get(tabId).url);
            return {
              success: true,
              generation: message.generation,
              status: 'active',
              attention: 'ambient',
              mounted: true,
              exactOrigin: projection.exactOrigin,
              profileId: projection.profileId,
              profileVersion: projection.profileVersion,
              catalogVersion: projection.catalogVersion,
              contextEpoch: runtime.contextEpoch || 1,
              semanticEntity: null
            };
          }
          return {
            success: false,
            generation: message.generation,
            status: 'stale',
            code: 'SKOPEO_STALE_GENERATION'
          };
        }
        if (message.action === 'skopeo:route-change') {
          if (runtime.routeFailure) throw new Error('route delivery failed');
          if (runtime.phase !== 'active' || runtime.generation !== message.generation) return false;
          runtime.routeChanges = (runtime.routeChanges || []).concat([clone(message)]);
          runtime.contextEpoch = (runtime.contextEpoch || 1) + 1;
          const projection = runtime.projection || testProjection(tabId, message.generation, tabs.get(tabId).url);
          const response = {
            success: true,
            generation: message.generation,
            exactOrigin: projection.exactOrigin,
            profileId: projection.profileId,
            profileVersion: projection.profileVersion,
            catalogVersion: projection.catalogVersion,
            contextEpoch: runtime.contextEpoch,
            semanticEntity: null,
            attention: 'ambient'
          };
          if (typeof options.routeResponder === 'function') {
            const controlled = options.routeResponder({
              tabId,
              message: clone(message),
              response: clone(response),
              routeIndex: runtime.routeChanges.length - 1
            });
            if (controlled !== undefined) return controlled;
          }
          return response;
        }
        if (message.action === 'skopeo:terminate') {
          runtime.phase = 'terminal';
          runtime.resources = { ...ZERO_RESOURCES };
          runtime.listenerMissing = true;
          if (runtime.terminateFailure) throw new Error('runtime listener already removed');
          return {
            generation: message.generation,
            resources: { ...ZERO_RESOURCES },
            reason: message.reason
          };
        }
        return false;
      }
    },
    scripting: {
      async executeScript(details) {
        executeCalls.push(clone(details));
        operations.push('execute:' + details.target.tabId + ':' + details.files.join(','));
        if (options.injectionFailures && options.injectionFailures.has(details.target.tabId)) {
          throw new Error('Cannot access contents of the page');
        }
        const previous = runtimes.get(details.target.tabId) || {};
        runtimes.set(details.target.tabId, {
          ...previous,
          listenerMissing: false,
          phase: 'idle',
          resources: { ...ZERO_RESOURCES }
        });
        return [{ frameId: 0, result: true }];
      }
    },
    storage: {
      session: {
        async get(keys) {
          operations.push('storage.get:' + (keys == null ? '*' : String(keys)));
          return responseForGet(keys);
        },
        async set(values) {
          for (const [key, value] of Object.entries(values)) storageData.set(key, clone(value));
          const records = Object.values(values);
          if (records.length === 1 && records[0] && records[0].status) {
            operations.push('storage.set:' + records[0].tabId + ':' + records[0].status + ':' + (records[0].reason || 'none'));
          } else {
            operations.push('storage.set');
          }
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) storageData.delete(key);
          operations.push('storage.remove:' + String(keys));
        }
      }
    }
  };

  if (localData) {
    chrome.storage.local = {
      async get(keys) {
        const wanted = keys == null ? Array.from(localData.keys()) : (Array.isArray(keys) ? keys : [keys]);
        const result = {};
        for (const key of wanted) if (localData.has(key)) result[key] = clone(localData.get(key));
        return result;
      },
      async set(values) {
        const changes = {};
        for (const [key, value] of Object.entries(values)) {
          changes[key] = { oldValue: clone(localData.get(key)), newValue: clone(value) };
          localData.set(key, clone(value));
        }
        storageChanged.emit(changes, 'local');
      }
    };
    chrome.storage.onChanged = storageChanged;
  }

  async function sendWorkerMessage(message, sender = { id: chrome.runtime.id }) {
    assert.ok(runtimeOnMessage.listeners.length > 0, 'Skopeo runtime listener is registered');
    return new Promise((resolve, reject) => {
      let settled = false;
      const sendResponse = (response) => {
        settled = true;
        resolve(clone(response));
      };
      try {
        const handled = runtimeOnMessage.listeners.some((listener) => listener(message, sender, sendResponse) === true);
        if (!handled && !settled) resolve(undefined);
        setImmediate(() => {
          if (!settled && handled) reject(new Error('async message did not send a response'));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function flush() {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }

  return {
    chrome,
    operations,
    broadcasts,
    executeCalls,
    tabMessages,
    getCalls,
    queryCalls,
    storageData,
    tabs,
    runtimes,
    routerCalls,
    gateManagers,
    events: { runtimeOnMessage, commandEvent, updatedEvent, removedEvent },
    sendWorkerMessage,
    flush
  };
}

function createOracle() {
  const records = new Map();
  const controllers = new Map();
  return {
    start(tabId) {
      const prior = records.get(tabId);
      const generation = prior ? prior.generation + 1 : 1;
      records.set(tabId, { tabId, generation, status: 'starting', reason: null });
      controllers.set(tabId, { aborted: false, generation });
      return generation;
    },
    ack(action, senderTabId, generation) {
      const record = records.get(senderTabId);
      const live = controllers.get(senderTabId);
      if (!record || !live || live.aborted || record.generation !== generation) return false;
      if (action === 'prepared' && record.status === 'starting') {
        record.status = 'active';
        record.reason = PREPARED_REASON;
        return true;
      }
      if (action === 'ready' && record.status === 'active' && record.reason === PREPARED_REASON) {
        record.reason = null;
        return true;
      }
      return false;
    },
    get(tabId) {
      return clone(records.get(tabId));
    },
    abort(tabId) {
      const controller = controllers.get(tabId);
      if (controller) controller.aborted = true;
    }
  };
}

function runSelfTest() {
  assert.deepEqual(parseStringArray("const FILES = ['one.js', 'two.js'];", 'FILES'), ['one.js', 'two.js']);
  assert.deepEqual(
    parseStringArray("const FILES = Object.freeze(['shell.js', /* ordered */ 'runtime.js']);", 'FILES'),
    ['shell.js', 'runtime.js']
  );
  assert.deepEqual(
    parseFallbackBundle("function _getContentScriptFilesForInjection() {\n  return ['a.js', 'b.js'];\n}"),
    ['a.js', 'b.js']
  );

  const oracle = createOracle();
  const tabAGeneration = oracle.start(11);
  const tabBGeneration = oracle.start(22);
  assert.equal(oracle.ack('prepared', 33, tabAGeneration), false, 'unowned sender tab is rejected');
  assert.equal(oracle.ack('prepared', 22, tabAGeneration + 1), false, 'stale Tab B prepared is rejected');
  assert.equal(oracle.ack('prepared', 22, tabAGeneration), true, 'same numeric generation remains scoped to sender Tab B');
  assert.equal(oracle.get(11).status, 'starting', 'Tab B acknowledgment cannot mutate Tab A');
  assert.equal(oracle.ack('ready', 11, tabAGeneration + 1), false, 'stale ready is rejected');
  assert.equal(oracle.ack('prepared', 11, tabAGeneration), true, 'matching prepared is accepted');
  assert.equal(oracle.get(11).reason, PREPARED_REASON, 'prepared marker is retained until ready');
  oracle.abort(11);
  assert.equal(oracle.ack('ready', 11, tabAGeneration), false, 'aborted generation cannot become ready');
  assert.equal(oracle.get(22).generation, tabBGeneration, 'per-tab generation remains independent');

  const bytes = fs.readFileSync(__filename);
  assert.equal(Array.from(bytes).every((byte) => byte <= 0x7f), true, 'test source remains ASCII-only');
  console.log('skopeo side-panel command oracle/parsers: PASS');
}

function assertStaticContracts(backgroundSource, manifest, wsClientSource) {
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.action || {}, 'default_popup'), false, 'toolbar action keeps no popup');
  assert.equal(manifest.side_panel && manifest.side_panel.default_path, 'ui/sidepanel.html', 'toolbar side-panel path is preserved');
  assert.deepEqual(manifest.commands, {
    [COMMAND]: {
      suggested_key: { default: 'Ctrl+Shift+Space', mac: 'Alt+Space' },
      description: 'Toggle Skopeo in current tab'
    }
  });

  const contentBundle = parseStringArray(backgroundSource, 'CONTENT_SCRIPT_FILES');
  const fallbackBundle = parseFallbackBundle(wsClientSource);
  const dedicatedBundle = parseStringArray(backgroundSource, 'SKOPEO_INJECTION_FILES');
  assert.deepEqual(dedicatedBundle, ADAPTIVE_INJECTION_FILES);
  const localeBundle = parseStringArray(backgroundSource, 'SKOPEO_LOCALE_FILES');
  assert.deepEqual(localeBundle, LOCALE_INJECTION_FILES, 'the HUD locale files load in a fixed order');
  assert.equal(localeBundle.some((file) => dedicatedBundle.includes(file)), false,
    'the locale files stay out of the dedicated Skopeo bundle');
  const manifestContentScripts = (manifest.content_scripts || []).flatMap((entry) => entry.js || []);
  const webAccessibleResources = (manifest.web_accessible_resources || []).flatMap((entry) => entry.resources || []);
  // ui-locale.js is FSB's shared resolver and also loads with the content
  // scripts; the HUD copy map loads only with Skopeo.
  for (const [where, list] of [['CONTENT_SCRIPT_FILES', contentBundle], ['fallback injection list', fallbackBundle],
    ['manifest content scripts', manifestContentScripts], ['web-accessible resources', webAccessibleResources]]) {
    assert.equal(list.includes('utils/skopeo-hud-exact.js'), false, 'the HUD copy map is absent from ' + where);
  }
  for (const file of dedicatedBundle) {
    assert.equal(dedicatedBundle.filter((entry) => entry === file).length, 1, file + ' occurs once in dedicated injection list');
    assert.equal(contentBundle.includes(file), false, file + ' is absent from CONTENT_SCRIPT_FILES');
    assert.equal(fallbackBundle.includes(file), false, file + ' is absent from fallback injection list');
    assert.equal(manifestContentScripts.includes(file), false, file + ' is absent from manifest content scripts');
    assert.equal(webAccessibleResources.includes(file), false, file + ' is absent from web-accessible resources');
  }
  assert.match(backgroundSource, /commands\.onCommand\.addListener/);
  assert.doesNotMatch(backgroundSource, /chrome\.action\.onClicked[\s\S]{0,1000}skopeo:/i, 'toolbar action does not route to Skopeo');
}

async function assertStatusNotificationResponseContract(backgroundSource) {
  // Any open extension page may hear the broadcast; a listener that does not
  // answer must not hold startup open.
  const broadcastEvent = createEvent();
  const heard = [];
  broadcastEvent.addListener((message) => { heard.push(message); });
  const backgroundHarness = createChromeHarness({ runtimeBroadcastEvent: broadcastEvent });
  const controller = bootProductionController(backgroundSource, backgroundHarness);
  await controller.ready;

  const pendingStart = controller.toggleTab(11);
  const outcome = await Promise.race([
    pendingStart.then((response) => ({ settled: true, response })),
    new Promise((resolve) => setImmediate(() => resolve({ settled: false })))
  ]);

  assert.equal(outcome.settled, true, 'Starting notification does not claim an unanswered async response');
  assert.equal(outcome.response.status, 'starting', 'startup settles after the accepted notification');
  assert.equal(heard.some((message) => message.action === 'skopeo:status-changed' && message.status === 'starting'), true,
    'the Starting status is broadcast');
  assert.equal(backgroundHarness.executeCalls.length, 1, 'startup proceeds from broadcast to injection');
  assert.equal(
    backgroundHarness.tabMessages.some((entry) => entry.message.action === 'skopeo:prepare'),
    true,
    'startup proceeds from broadcast through runtime prepare'
  );
}

// Skopeo moved out of the side panel: Advanced Settings holds one switch for
// the whole extension and the shortcut button; the shortcut opens it on a tab.
function assertSkopeoLivesInAdvancedSettings(sources) {
  for (const [where, source] of [['sidepanel.html', sources.sidepanelHtml], ['sidepanel.css', sources.sidepanelCss],
    ['sidepanel.js', sources.sidepanelJs]]) {
    assert.doesNotMatch(source, /skopeo/i, where + ' carries no Skopeo row or controller');
  }
  const html = sources.controlPanelHtml;
  const start = html.indexOf('<section class="content-section" id="advanced">');
  const end = html.indexOf('</section>', start);
  assert.ok(start !== -1 && end > start, 'the control panel has an Advanced Settings section');
  const advanced = html.slice(start, end);
  assert.match(advanced, /<div class="settings-card full-width" id="skopeoSettings">/, 'Advanced Settings has a Skopeo card');
  assert.match(advanced, /<input type="checkbox" id="fsbSkopeoEnabled" checked>/, 'the Skopeo switch starts on');
  assert.match(advanced, /<button type="button" class="form-secondary-btn" id="fsbSkopeoShortcut"[^>]*aria-label="Open Chrome shortcut settings"/,
    'the shortcut button opens the Chrome shortcut settings');
  assert.equal((html.match(/id="fsbSkopeoEnabled"/g) || []).length, 1, 'the control panel has one Skopeo switch');

  const options = sources.optionsJs;
  assert.match(options, /chrome\.storage\.local\.set\(\{ fsbSkopeoEnabled: toggle\.checked \}\)/, 'the switch is saved when it changes');
  assert.match(options, /result\.fsbSkopeoEnabled !== false/, 'the switch reads as on unless it was saved off');
  assert.match(options, /entry\.name === SKOPEO_COMMAND/, 'the button reads the Skopeo command shortcut');
  assert.match(options, /const SKOPEO_COMMAND = 'toggle-skopeo-current-tab';/, 'the panel names the manifest command');
  assert.match(options, /chrome\.tabs\.create\(\{ url: 'chrome:\/\/extensions\/shortcuts' \}\)/, 'the button opens Chrome shortcuts');
  assert.match(options, /^  initSkopeoSettings\(\);$/m, 'the dashboard boot wires the Skopeo card');
}

async function assertSkopeoSwitchContract(backgroundSource) {
  const tabA = { id: 11, url: 'https://example.test/a' };

  // Switched off: neither the shortcut nor a toggle request starts Skopeo.
  {
    const harness = createChromeHarness({ localStorage: { fsbSkopeoEnabled: false } });
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    assert.equal(await controller.skopeoEnabled(), false, 'a saved false switches Skopeo off');
    assert.equal(await controller.handleCommand(COMMAND, tabA), false, 'the shortcut does nothing while Skopeo is off');
    harness.events.commandEvent.emit(COMMAND, tabA);
    await harness.flush();
    assert.equal(harness.executeCalls.length, 0, 'nothing is injected while Skopeo is off');
    assert.equal(storageRecord(harness, 11), undefined, 'no session record is written while Skopeo is off');
    const toggled = await harness.sendWorkerMessage({ action: 'skopeo:toggle-tab', tabId: 11 });
    assert.equal(toggled.status, 'off', 'a toggle request only reports Off while Skopeo is off');
    assert.equal(harness.executeCalls.length, 0, 'a toggle request injects nothing while Skopeo is off');
  }

  // No saved value, a saved true, or no local storage at all: Skopeo starts as before.
  for (const localStorage of [{}, { fsbSkopeoEnabled: true }, null]) {
    const harness = createChromeHarness(localStorage ? { localStorage } : {});
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    const label = localStorage ? JSON.stringify(localStorage) : 'no local storage';
    assert.equal(await controller.skopeoEnabled(), true, 'Skopeo is on with ' + label);
    assert.equal(await controller.handleCommand(COMMAND, tabA), true, 'the shortcut starts Skopeo with ' + label);
    assert.equal(harness.executeCalls.length, 1, 'the shortcut injects Skopeo with ' + label);
    assert.equal(storageRecord(harness, 11).status, 'starting', 'the tab is Starting with ' + label);
  }

  // Turning the switch off closes Skopeo in every tab that has it open.
  {
    const harness = createChromeHarness({ localStorage: {} });
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    const generationA = await activateProductionTab(controller, harness, 11);
    const generationB = await activateProductionTab(controller, harness, 22);
    harness.broadcasts.length = 0;
    await harness.chrome.storage.local.set({ fsbSkopeoEnabled: false });
    const recordA = await waitForStoredStatus(harness, 11, 'off');
    const recordB = await waitForStoredStatus(harness, 22, 'off');
    assert.equal(recordA.generation, generationA, 'Tab A closes its own generation');
    assert.equal(recordB.generation, generationB, 'Tab B closes its own generation');
    for (const tabId of [11, 22]) {
      assert.equal(harness.tabMessages.some((entry) => entry.tabId === tabId &&
        entry.message.action === 'skopeo:terminate' && entry.message.reason === 'toggle-off'), true,
        'tab ' + tabId + ' is told to close as a toggle-off');
      assert.equal(harness.broadcasts.some((message) => message.action === 'skopeo:status-changed' &&
        message.tabId === tabId && message.status === 'off'), true, 'tab ' + tabId + ' broadcasts Off');
    }
    assert.equal(await controller.handleCommand(COMMAND, tabA), false, 'the shortcut stays inert after the switch goes off');
    assert.equal(storageRecord(harness, 11).status, 'off', 'Tab A stays off');

    const again = await controller.turnOffEverywhere();
    assert.equal(again.success, true, 'a second pass can read the sessions');
    assert.equal(again.closed, 0, 'a second pass finds nothing open');
  }
}

function sabotageRouteCurrentness(controllerSource) {
  const original = extractBracedSource(
    controllerSource,
    'function routeRequestIsCurrent(request)',
    true
  );
  return controllerSource.replace(original, [
    'function routeRequestIsCurrent(request) {',
    '    return !!request;',
    '  }'
  ].join('\n'));
}

function bootProductionController(backgroundSource, harness, options = {}) {
  const start = backgroundSource.indexOf(CONTROLLER_START);
  const end = backgroundSource.indexOf(CONTROLLER_END);
  assert.notEqual(start, -1, 'production Skopeo controller start marker exists');
  assert.notEqual(end, -1, 'production Skopeo controller end marker exists');
  assert.ok(end > start, 'production controller marker order is valid');
  let controllerSource = backgroundSource.slice(start, end + CONTROLLER_END.length);
  if (options.sabotageRouteCurrentness === true) {
    controllerSource = sabotageRouteCurrentness(controllerSource);
  }
  const exportAnchor = '  global.FSBSkopeoController = controller;';
  assert.ok(controllerSource.includes(exportAnchor), 'production controller export anchor exists');
  controllerSource = controllerSource.replace(exportAnchor, [
    '  controller.__testSnapshot = function (tabId) {',
    '    const entry = controllers.get(tabId);',
    '    if (!entry) return null;',
    '    return {',
    '      generation: entry.generation,',
    '      aborted: entry.controller.signal.aborted,',
    '      projection: entry.projection,',
    '      authority: entry.authority,',
    '      attention: entry.attention,',
    '      readActionTokens: entry.readActionTokens instanceof Set',
    '        ? Array.from(entry.readActionTokens).sort()',
    '        : null,',
    '      routeRequestSequence: Number.isSafeInteger(entry.routeRequestSequence)',
    '        ? entry.routeRequestSequence',
    '        : 0,',
    '      routeLaneVersion: Number.isSafeInteger(entry.routeLaneVersion)',
    '        ? entry.routeLaneVersion',
    '        : 0',
    '    };',
    '  };',
    exportAnchor
  ].join('\n'));
  const lifecycle = require('../extension/utils/skopeo-session-state.js');
  const emptyParamSchema = { type: 'object', properties: {}, additionalProperties: false };
  const emptyParamSummary = { count: 0, required: [], optional: [], truncated: false };
  const emptyArgumentContract = {
    mode: 'empty', fields: [], reason: null, schemaDigest: EMPTY_ARGUMENT_SCHEMA_DIGEST
  };
  const executionAuthority = {
    tier: 'T1a', executionOrigin: 'https://example.test', sideEffectClass: 'read',
    paramSchema: emptyParamSchema, schemaDigest: EMPTY_ARGUMENT_SCHEMA_DIGEST
  };
  const descriptor = {
    slug: 'example.list', profileKey: 'example@example.test', appStem: 'example',
    service: 'example.test', serviceOrigin: 'https://example.test',
    profileId: 'generic-default-v1', actionLabel: 'List items', effect: 'read-only', sideEffectClass: 'read',
    executionAuthority, paramSummary: emptyParamSummary, argumentContract: emptyArgumentContract,
    actionabilityReason: null, sourceReadiness: 't1-ready',
    sourceTerminalState: 't1-ready', surfaceStatus: 't1-ready', presentationDisposition: 't1-ready',
    executionEnabled: true, invocable: true
  };
  const installedEntry = {
    tier: 'T1a', origin: 'https://example.test',
    handler: {
      origin: 'https://example.test', sideEffectClass: 'read', params: emptyParamSchema,
      async handle() { throw new Error('background fixture must dispatch through the router'); }
    },
    descriptor: { slug: 'example.list', sideEffectClass: 'read', params: emptyParamSchema }
  };
  const sandbox = {
    chrome: harness.chrome,
    FSBSkopeoSessionState: lifecycle,
    FsbSkopeoProfileIndex: { capabilities: [descriptor] },
    FsbSkopeoCapabilityProjector: {
      createProjection(input) { return testProjection(input.tabId, input.generation, input.url); },
      validateProjection(value) { return !!value && value.status === 'recognized'; }
    },
    FsbCapabilityCatalog: {
      resolve(slug, origin) {
        return slug === 'example.list' && origin === 'https://example.test' ? installedEntry : null;
      }
    },
    FsbSkopeoActionAuthority: {
      canonicalSchemaJson(value) { return JSON.stringify(value); },
      async normalizeResolvedAuthority(resolved) {
        return resolved === installedEntry ? clone(executionAuthority) : null;
      },
      authorityMatches(expected, actual) {
        return JSON.stringify(expected) === JSON.stringify(actual);
      },
      analyzeArgumentSchema(resolved, authority) {
        return resolved === installedEntry && authority &&
          authority.schemaDigest === EMPTY_ARGUMENT_SCHEMA_DIGEST
          ? clone(emptyArgumentContract)
          : null;
      },
      validateCollectedArguments(contract, args) {
        return JSON.stringify(contract) === JSON.stringify(emptyArgumentContract) &&
          args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length === 0;
      }
    },
    FsbCapabilityRouter: {
      getResolvedParamsSchema(entry) {
        return entry && entry.handler ? entry.handler.params : null;
      },
      validateResolvedArgs(entry, args) {
        return !!entry && !!entry.params && args && typeof args === 'object' &&
          !Array.isArray(args) && Object.keys(args).length === 0;
      },
      async invoke(slug, args, context) {
        harness.routerCalls.push({ slug, args: clone(args), context: clone(context) });
        return { success: true, message: 'One item is available.' };
      }
    },
    CfworkerJsonSchema: {
      Validator: class Validator {
        constructor(schema) { this.schema = schema; }
        validate(value) {
          const allowed = new Set(Object.keys(this.schema.properties || {}));
          const valid = value && typeof value === 'object' && !Array.isArray(value) &&
            Object.keys(value).every((key) => allowed.has(key));
          return { valid, errors: valid ? [] : [{ message: 'unexpected property' }] };
        }
      }
    },
    FsbSkopeoConsequenceGate: {
      createGateManager(settings) {
        const authority = settings.getCurrentAuthority();
        const state = {
          pendingArgument: null,
          pendingRead: null,
          pendingConfirmation: null,
          pendingConsequence: null,
          invalidations: []
        };
        const manager = {
          __tabId: authority && authority.tabId,
          open(request) {
            state.pendingArgument = clone(request.args);
            state.pendingRead = { slug: request.slug, contextEpoch: request.contextEpoch };
            state.pendingConfirmation = { slug: request.slug, generation: request.generation };
            state.pendingConsequence = clone(request);
            return { status: 'awaiting-confirmation', reason: 'fixture-pending' };
          },
          async confirm() { return { success: false, code: 'not-used' }; },
          cancel() {
            state.pendingArgument = null;
            state.pendingRead = null;
            state.pendingConfirmation = null;
            state.pendingConsequence = null;
            return { status: 'cancelled', reason: 'fixture-cancelled' };
          },
          invalidate(reason) {
            state.invalidations.push(reason);
            state.pendingArgument = null;
            state.pendingRead = null;
            state.pendingConfirmation = null;
            state.pendingConsequence = null;
            return { status: 'cancelled', reason };
          },
          __testSnapshot() { return clone(state); }
        };
        harness.gateManagers.push(manager);
        return manager;
      }
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
  vm.runInContext(controllerSource, vm.createContext(sandbox), { filename: 'background-skopeo-controller.js' });
  assert.ok(sandbox.FSBSkopeoController, 'controller exports its narrow integration surface');
  return sandbox.FSBSkopeoController;
}

function storageRecord(harness, tabId) {
  return clone(harness.storageData.get('skopeoSession:' + tabId));
}

function resourceSnapshot(harness, tabId) {
  const runtime = harness.runtimes.get(tabId);
  return runtime ? clone(runtime.resources) : { ...ZERO_RESOURCES };
}

function readyMessageForTab(tabId, generation, rawUrl) {
  const projection = testProjection(tabId, generation, rawUrl);
  return {
    action: 'skopeo:ready',
    generation,
    attention: 'ambient',
    exactOrigin: projection.exactOrigin,
    profileId: projection.profileId,
    profileVersion: projection.profileVersion,
    catalogVersion: projection.catalogVersion,
    contextEpoch: 1,
    semanticEntity: null
  };
}

async function activateProductionTab(controller, harness, tabId) {
  const rawUrl = harness.tabs.get(tabId).url;
  const started = await controller.toggleTab(tabId);
  assert.equal(started.status, 'starting', 'fixture tab starts through the production controller');
  const generation = started.generation;
  const sender = { id: harness.chrome.runtime.id, tab: { id: tabId } };
  await controller.handleContentMessage(
    { action: 'skopeo:prepared', generation, placement: 'full' },
    sender
  );
  await controller.handleContentMessage(
    readyMessageForTab(tabId, generation, rawUrl),
    sender
  );
  assert.equal(storageRecord(harness, tabId).status, 'active', 'fixture tab reaches Active');
  return generation;
}

async function seedPendingRouteState(controller, harness, tabId, generation, tokenSuffix) {
  const rawUrl = harness.tabs.get(tabId).url;
  const projection = testProjection(tabId, generation, rawUrl);
  const sender = { id: harness.chrome.runtime.id, tab: { id: tabId } };
  const actionToken = 'route_race_read_' + tokenSuffix;
  const read = await controller.handleContentMessage({
    action: 'skopeo:read-invoke',
    generation,
    exactOrigin: projection.exactOrigin,
    profileId: projection.profileId,
    profileVersion: projection.profileVersion,
    catalogVersion: projection.catalogVersion,
    contextEpoch: 1,
    semanticEntity: null,
    slug: 'example.list',
    args: {},
    actionToken,
    schemaDigest: EMPTY_ARGUMENT_SCHEMA_DIGEST
  }, sender);
  assert.equal(read.success, true, 'fixture consumes one current read token before rerouting');
  const consequence = await controller.handleContentMessage({
    action: 'skopeo:consequence-open',
    generation,
    exactOrigin: projection.exactOrigin,
    profileVersion: projection.profileVersion,
    contextEpoch: 1,
    semanticEntity: null,
    slug: 'example.update',
    args: {}
  }, sender);
  assert.equal(consequence.status, 'awaiting-confirmation', 'fixture seeds pending consequence state');
  return actionToken;
}

function createControlledRouteHarness(options = {}) {
  const deliveries = [];
  const harness = createChromeHarness({
    ...options,
    routeResponder(route) {
      const deferred = createDeferred();
      deliveries.push({ ...route, deferred });
      return deferred.promise;
    }
  });
  return { harness, deliveries };
}

function emitUrlOnlyUpdate(harness, tabId, rawUrl) {
  const tab = harness.tabs.get(tabId);
  harness.tabs.set(tabId, { ...tab, url: rawUrl });
  harness.events.updatedEvent.emit(tabId, { url: rawUrl }, { ...tab, url: rawUrl });
}

function emitHardNavigation(harness, tabId, rawUrl) {
  const tab = harness.tabs.get(tabId);
  harness.tabs.set(tabId, { ...tab, url: rawUrl });
  harness.events.updatedEvent.emit(
    tabId,
    { status: 'loading', url: rawUrl },
    { ...tab, url: rawUrl, status: 'loading' }
  );
}

async function waitForRouteDeliveries(harness, deliveries, count) {
  for (let attempt = 0; attempt < 20 && deliveries.length < count; attempt += 1) {
    await harness.flush();
  }
  assert.equal(deliveries.length, count, 'expected deferred route deliveries reached the runtime');
}

async function waitForStoredStatus(harness, tabId, status) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const record = storageRecord(harness, tabId);
    if (record && record.status === status) return record;
    await harness.flush();
  }
  assert.equal(storageRecord(harness, tabId).status, status, 'fixture reaches expected stored status');
}

function resolveRouteDelivery(delivery, overrides = {}) {
  delivery.deferred.resolve({ ...delivery.response, ...overrides });
}

function productionRouteSnapshot(controller, harness, tabId) {
  const runtime = harness.runtimes.get(tabId);
  return {
    record: storageRecord(harness, tabId),
    controller: clone(controller.__testSnapshot(tabId)),
    runtime: runtime ? {
      generation: runtime.generation,
      phase: runtime.phase,
      contextEpoch: runtime.contextEpoch,
      listenerMissing: runtime.listenerMissing === true,
      resources: clone(runtime.resources),
      projection: clone(runtime.projection),
      routeChanges: clone(runtime.routeChanges || [])
    } : null,
    gates: harness.gateManagers
      .filter((manager) => manager.__tabId === tabId)
      .map((manager) => manager.__testSnapshot()),
    lifecycleWrites: harness.operations.filter((entry) => entry.startsWith('storage.set:' + tabId + ':')),
    broadcasts: harness.broadcasts.filter((event) => event.tabId === tabId),
    terminationMessages: harness.tabMessages
      .filter((entry) => entry.tabId === tabId && entry.message.action === 'skopeo:terminate')
      .map((entry) => entry.message)
  };
}

async function assertPrimaryInvocationContract(backgroundSource) {
  const harness = createChromeHarness();
  const controller = bootProductionController(backgroundSource, harness);
  await controller.ready;

  harness.events.commandEvent.emit('unrelated-command', { id: 11, url: 'https://example.test/a' });
  await harness.flush();
  assert.equal(harness.executeCalls.length, 0, 'unrelated commands are ignored');

  const invalid = await harness.sendWorkerMessage({ action: 'skopeo:toggle-tab', tabId: 0 });
  assert.equal(invalid.success, false, 'side-panel requests require positive explicit tab IDs');
  assert.equal(invalid.code, 'SKOPEO_UNSUPPORTED_TAB');
  assert.equal(harness.executeCalls.length, 0);

  harness.events.commandEvent.emit(COMMAND, { id: 11, url: 'https://example.test/a' });
  await harness.flush();
  assert.equal(harness.queryCalls.length, 0, 'command uses supplied tab without tabs.query');
  assert.deepEqual(harness.getCalls, [11, 11],
    'command preflights the supplied tab ID and re-reads its exact URL for projection');
  assert.equal(harness.executeCalls.length, 1);
  assert.deepEqual(harness.executeCalls[0], {
    target: { tabId: 11, frameIds: [0] },
    files: [...LOCALE_INJECTION_FILES, ...ADAPTIVE_INJECTION_FILES]
  });
  let tabA = storageRecord(harness, 11);
  assert.equal(tabA.status, 'starting');
  assert.deepEqual(resourceSnapshot(harness, 11), ZERO_RESOURCES, 'prepare remains root/listener/top-layer free');
  const injectionOperation = 'execute:11:' + [...LOCALE_INJECTION_FILES, ...ADAPTIVE_INJECTION_FILES].join(',');
  assert.ok(harness.operations.indexOf('storage.set:11:starting:none') < harness.operations.indexOf(injectionOperation));
  assert.ok(harness.operations.indexOf('broadcast:skopeo:status-changed:starting') < harness.operations.indexOf(injectionOperation));

  const tabBStart = await harness.sendWorkerMessage({ action: 'skopeo:toggle-tab', tabId: 22 });
  assert.equal(tabBStart.status, 'starting');
  const tabB = storageRecord(harness, 22);
  assert.equal(tabB.generation, 1);
  assert.equal(storageRecord(harness, 11).generation, 1, 'Tab B start does not alter Tab A generation');

  const wrongPrepared = await harness.sendWorkerMessage(
    { action: 'skopeo:prepared', generation: tabA.generation, placement: 'full' },
    { id: harness.chrome.runtime.id, tab: { id: 44 } }
  );
  assert.equal(wrongPrepared.success, false, 'sender-derived wrong-tab prepared is rejected');
  const stalePrepared = await harness.sendWorkerMessage(
    { action: 'skopeo:prepared', generation: tabA.generation + 1, placement: 'full' },
    { id: harness.chrome.runtime.id, tab: { id: 11 } }
  );
  assert.equal(stalePrepared.success, false, 'stale prepared is rejected');
  const payloadTabPrepared = await harness.sendWorkerMessage(
    { action: 'skopeo:prepared', tabId: 11, generation: tabA.generation, placement: 'full' },
    { id: harness.chrome.runtime.id, tab: { id: 11 } }
  );
  assert.equal(payloadTabPrepared.success, false, 'content payload tabId is never trusted');
  assert.equal(harness.tabMessages.filter((entry) => entry.message.action === 'skopeo:commit').length, 0);

  const prepared = await harness.sendWorkerMessage(
    { action: 'skopeo:prepared', generation: tabA.generation, placement: 'full' },
    { id: harness.chrome.runtime.id, tab: { id: 11 } }
  );
  assert.equal(prepared.status, 'starting');
  tabA = storageRecord(harness, 11);
  assert.equal(tabA.status, 'active');
  assert.equal(tabA.reason, PREPARED_REASON);
  const statusBeforeReady = await controller.getStatus(11, { rehydrate: false });
  assert.equal(statusBeforeReady.status, 'starting', 'prepared ACTIVE marker remains publicly Starting');
  const activeMarkerWrite = harness.operations.indexOf('storage.set:11:active:' + PREPARED_REASON);
  const commitSend = harness.operations.indexOf('tab-message:11:skopeo:commit:' + tabA.generation);
  assert.ok(activeMarkerWrite !== -1 && activeMarkerWrite < commitSend, 'ACTIVE marker persists before commit');
  assert.equal(harness.broadcasts.some((event) => event.tabId === 11 && event.status === 'active'), false, 'prepared does not broadcast Active');

  const wrongReady = await harness.sendWorkerMessage(
    readyMessage(tabA.generation),
    { id: harness.chrome.runtime.id, tab: { id: 22 } }
  );
  assert.equal(wrongReady.success, false);
  const staleReady = await harness.sendWorkerMessage(
    readyMessage(tabA.generation + 1),
    { id: harness.chrome.runtime.id, tab: { id: 11 } }
  );
  assert.equal(staleReady.success, false);
  const ready = await harness.sendWorkerMessage(
    readyMessage(tabA.generation),
    { id: harness.chrome.runtime.id, tab: { id: 11 } }
  );
  assert.deepEqual(ready, { success: true, tabId: 11, generation: 1, status: 'active', attention: 'ambient' });
  assert.equal(storageRecord(harness, 11).reason, null);

  const validReadRequest = readMessage(tabA.generation);
  const validRead = await harness.sendWorkerMessage(
    validReadRequest,
    { id: harness.chrome.runtime.id, tab: { id: 11 } }
  );
  assert.equal(harness.routerCalls.length, 1, 'one current ready read invokes the shared router exactly once');
  assert.deepEqual(harness.routerCalls[0], {
    slug: 'example.list',
    args: {},
    context: { origin: 'https://example.test', tabId: 11, source: 'skopeo' }
  });
  assert.equal(validRead.success, true, 'current ready read returns a typed same-tuple response');
  assert.equal(validRead.actionToken, validReadRequest.actionToken);
  assert.deepEqual(validRead.result, {
    status: 'success',
    actionLabel: 'List items',
    sections: [{
      kind: 'notice',
      tone: 'info',
      heading: 'Read complete',
      message: 'One item is available.',
      nextStep: 'Review the result and keep working in the current view.'
    }]
  });

  for (const [label, request, sender] of [
    ['replayed action token', validReadRequest, { id: harness.chrome.runtime.id, tab: { id: 11 } }],
    ['stale context', readMessage(tabA.generation, { contextEpoch: 2, actionToken: 'sr1_fixture_stale_0002' }),
      { id: harness.chrome.runtime.id, tab: { id: 11 } }],
    ['foreign-service slug', readMessage(tabA.generation, { slug: 'foreign.list', actionToken: 'sr1_fixture_foreign_0003' }),
      { id: harness.chrome.runtime.id, tab: { id: 11 } }],
    ['write-classified slug', readMessage(tabA.generation, { slug: 'example.update', actionToken: 'sr1_fixture_write_0004' }),
      { id: harness.chrome.runtime.id, tab: { id: 11 } }],
    ['malformed args', readMessage(tabA.generation, { args: { unexpected: true }, actionToken: 'sr1_fixture_args_0005' }),
      { id: harness.chrome.runtime.id, tab: { id: 11 } }],
    ['forged payload tab', { ...readMessage(tabA.generation, { actionToken: 'sr1_fixture_tab_0006' }), tabId: 11 },
      { id: harness.chrome.runtime.id, tab: { id: 11 } }],
    ['wrong sender tab', readMessage(tabA.generation, { actionToken: 'sr1_fixture_sender_0007' }),
      { id: harness.chrome.runtime.id, tab: { id: 22 } }]
  ]) {
    const rejected = await harness.sendWorkerMessage(request, sender);
    assert.equal(rejected.success, false, label + ' is rejected');
    assert.equal(harness.routerCalls.length, 1, label + ' performs zero additional router calls');
  }

  const commitsBeforeDuplicate = harness.tabMessages.filter((entry) => entry.message.action === 'skopeo:commit').length;
  const activeEventsBeforeDuplicate = harness.broadcasts.filter((event) => event.tabId === 11 && event.status === 'active').length;
  await harness.sendWorkerMessage(
    { action: 'skopeo:prepared', generation: 1, placement: 'full' },
    { id: harness.chrome.runtime.id, tab: { id: 11 } }
  );
  await harness.sendWorkerMessage(
    readyMessage(1),
    { id: harness.chrome.runtime.id, tab: { id: 11 } }
  );
  assert.equal(harness.tabMessages.filter((entry) => entry.message.action === 'skopeo:commit').length, commitsBeforeDuplicate);
  assert.equal(harness.broadcasts.filter((event) => event.tabId === 11 && event.status === 'active').length, activeEventsBeforeDuplicate);

  const killed = await harness.sendWorkerMessage({ action: 'skopeo:toggle-tab', tabId: 11 });
  assert.equal(killed.status, 'off', 'ACTIVE toggle kills');
  assert.equal(storageRecord(harness, 11).status, 'off');
  assert.deepEqual(resourceSnapshot(harness, 11), ZERO_RESOURCES);
  assert.equal(storageRecord(harness, 22).status, 'starting', 'Tab A kill leaves Tab B independent');
}

async function assertFailureAndCancellationContracts(backgroundSource) {
  {
    const harness = createChromeHarness();
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    await controller.toggleTab(11);
    const generation = storageRecord(harness, 11).generation;
    await controller.toggleTab(11);
    assert.equal(storageRecord(harness, 11).status, 'off', 'STARTING is cancellable before prepared');
    const late = await controller.handleContentMessage(
      { action: 'skopeo:prepared', generation, placement: 'full' },
      { id: harness.chrome.runtime.id, tab: { id: 11 } }
    );
    assert.equal(late.success, false);
    assert.deepEqual(resourceSnapshot(harness, 11), ZERO_RESOURCES);
  }

  {
    const harness = createChromeHarness();
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    await controller.toggleTab(11);
    const generation = storageRecord(harness, 11).generation;
    await controller.handleContentMessage(
      { action: 'skopeo:prepared', generation, placement: 'compact' },
      { id: harness.chrome.runtime.id, tab: { id: 11 } }
    );
    await controller.toggleTab(11);
    assert.equal(storageRecord(harness, 11).status, 'off', 'ACTIVE marker is cancellable before ready');
    assert.deepEqual(resourceSnapshot(harness, 11), ZERO_RESOURCES);
    const lateReady = await controller.handleContentMessage(
      readyMessage(generation),
      { id: harness.chrome.runtime.id, tab: { id: 11 } }
    );
    assert.equal(lateReady.success, false);
  }

  {
    const harness = createChromeHarness({ injectionFailures: new Set([11]) });
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    const failed = await controller.toggleTab(11);
    assert.equal(failed.success, false);
    assert.equal(failed.status, 'error');
    assert.equal(failed.code, 'SKOPEO_START_FAILED');
    assert.equal(storageRecord(harness, 11).status, 'off', 'injection failure leaves OFF tombstone');
    assert.deepEqual(resourceSnapshot(harness, 11), ZERO_RESOURCES);
  }

  {
    const harness = createChromeHarness();
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    const unsupported = await controller.toggleTab(33);
    assert.equal(unsupported.status, 'unsupported');
    assert.equal(unsupported.code, 'SKOPEO_UNSUPPORTED_TAB');
    assert.equal(storageRecord(harness, 33), undefined, 'restricted URL fails before generation');
    assert.equal(harness.executeCalls.length, 0);
  }

  {
    const harness = createChromeHarness();
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    await controller.toggleTab(11);
    const generation = storageRecord(harness, 11).generation;
    const unsafe = await controller.handleContentMessage(
      { action: 'skopeo:kill-request', generation, reason: 'unsafe-layout' },
      { id: harness.chrome.runtime.id, tab: { id: 11 } }
    );
    assert.equal(unsafe.success, false);
    assert.equal(unsafe.code, 'SKOPEO_UNSAFE_LAYOUT');
    assert.equal(storageRecord(harness, 11).status, 'off');
  }

  {
    const harness = createChromeHarness();
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    await controller.toggleTab(11);
    const generation = storageRecord(harness, 11).generation;
    harness.runtimes.get(11).commitFailure = true;
    const failedCommit = await controller.handleContentMessage(
      { action: 'skopeo:prepared', generation, placement: 'full' },
      { id: harness.chrome.runtime.id, tab: { id: 11 } }
    );
    assert.equal(failedCommit.success, false);
    assert.equal(failedCommit.code, 'SKOPEO_START_FAILED');
    assert.equal(storageRecord(harness, 11).status, 'off');
    assert.deepEqual(resourceSnapshot(harness, 11), ZERO_RESOURCES);
  }

  {
    const harness = createChromeHarness();
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    await controller.toggleTab(11);
    const generation = storageRecord(harness, 11).generation;
    await controller.handleContentMessage(
      { action: 'skopeo:prepared', generation, placement: 'full' },
      { id: harness.chrome.runtime.id, tab: { id: 11 } }
    );
    const teardown = await controller.handleContentMessage(
      { action: 'skopeo:teardown-complete', generation, reason: 'failed-start', resources: { ...ZERO_RESOURCES } },
      { id: harness.chrome.runtime.id, tab: { id: 11 } }
    );
    assert.equal(teardown.success, false, 'mount/readiness teardown reports start failure');
    assert.equal(storageRecord(harness, 11).status, 'off');
    const staleTeardown = await controller.handleContentMessage(
      { action: 'skopeo:teardown-complete', generation: generation + 1, reason: 'failed-start', resources: { ...ZERO_RESOURCES } },
      { id: harness.chrome.runtime.id, tab: { id: 11 } }
    );
    assert.equal(staleTeardown.success, false, 'stale teardown is rejected');
  }
}

async function assertTeardownCertificateValidation(backgroundSource) {
  const harness = createChromeHarness();
  const controller = bootProductionController(backgroundSource, harness);
  await controller.ready;
  await controller.toggleTab(11);
  const generation = storageRecord(harness, 11).generation;
  const sender = { id: harness.chrome.runtime.id, tab: { id: 11 } };

  assert.equal(isExactZeroSnapshot(ZERO_RESOURCES), true, 'test certificate is the exact eleven-key zero schema');

  const malformedResources = [];
  for (const category of RESOURCE_CATEGORIES) {
    const missing = { ...ZERO_RESOURCES };
    delete missing[category];
    malformedResources.push([`missing ${category}`, missing]);
  }
  malformedResources.push(
    ['extra category', { ...ZERO_RESOURCES, extra: 0 }],
    ['null resources', null],
    ['false resources', false],
    ['empty-string resources', ''],
    ['numeric-string category', { ...ZERO_RESOURCES, roots: '0' }],
    ['NaN category', { ...ZERO_RESOURCES, roots: NaN }],
    ['positive infinity category', { ...ZERO_RESOURCES, roots: Infinity }],
    ['negative infinity category', { ...ZERO_RESOURCES, roots: -Infinity }]
  );

  for (const [label, resources] of malformedResources) {
    const response = await controller.handleContentMessage({
      action: 'skopeo:teardown-complete',
      generation,
      reason: 'failed-start',
      resources
    }, sender);
    assert.equal(response.success, false, `${label} cannot acknowledge cleanup`);
    assert.equal(storageRecord(harness, 11).status, 'starting', `${label} leaves the generation live`);
  }

  const invalidEnvelopes = [
    ['payload tabId', {
      action: 'skopeo:teardown-complete', tabId: 11, generation, reason: 'failed-start', resources: { ...ZERO_RESOURCES }
    }, sender],
    ['stale generation', {
      action: 'skopeo:teardown-complete', generation: generation + 1, reason: 'failed-start', resources: { ...ZERO_RESOURCES }
    }, sender],
    ['wrong sender tab', {
      action: 'skopeo:teardown-complete', generation, reason: 'failed-start', resources: { ...ZERO_RESOURCES }
    }, { id: harness.chrome.runtime.id, tab: { id: 22 } }],
    ['missing reason', {
      action: 'skopeo:teardown-complete', generation, resources: { ...ZERO_RESOURCES }
    }, sender],
    ['missing resources', {
      action: 'skopeo:teardown-complete', generation, reason: 'failed-start'
    }, sender],
    ['extra outer key', {
      action: 'skopeo:teardown-complete', generation, reason: 'failed-start', resources: { ...ZERO_RESOURCES }, extra: true
    }, sender]
  ];
  for (const [label, message, envelopeSender] of invalidEnvelopes) {
    const response = await controller.handleContentMessage(message, envelopeSender);
    assert.equal(response.success, false, `${label} is rejected`);
    assert.equal(storageRecord(harness, 11).status, 'starting', `${label} cannot finish another generation`);
  }

  const accepted = await controller.handleContentMessage({
    action: 'skopeo:teardown-complete',
    generation,
    reason: 'failed-start',
    resources: { ...ZERO_RESOURCES }
  }, sender);
  assert.equal(accepted.success, false, 'current failed-start teardown reports the start failure');
  assert.equal(accepted.code, 'SKOPEO_START_FAILED');
  assert.equal(storageRecord(harness, 11).status, 'off', 'only the exact current certificate finishes teardown');
}

function activeRecord(tabId, generation, reason = null, status = 'active') {
  return {
    tabId,
    generation,
    status,
    terminalGeneration: status === 'terminating' || status === 'off' ? generation : generation - 1,
    updatedAt: 100,
    reason
  };
}

async function assertStoredRecordInvariantParity(backgroundSource) {
  const cases = [
    {
      label: 'Active terminal boundary at the live generation',
      record: { ...activeRecord(11, 5), terminalGeneration: 5 },
      runtime: { generation: 5, phase: 'active', resources: activeResources() }
    },
    {
      label: 'Starting terminal boundary at the live generation',
      record: { ...activeRecord(11, 6, null, 'starting'), terminalGeneration: 6 }
    },
    {
      label: 'Off terminal boundary behind the completed generation',
      record: { ...activeRecord(11, 7, null, 'off'), terminalGeneration: 6 }
    },
    {
      label: 'Terminating terminal boundary behind the ending generation',
      record: { ...activeRecord(11, 8, 'navigation', 'terminating'), terminalGeneration: 7 }
    },
    {
      label: 'Starting record with the prepared Active reason',
      record: activeRecord(11, 9, PREPARED_REASON, 'starting')
    },
    {
      label: 'Active record with an unrecognized reason',
      record: activeRecord(11, 10, 'worker-restored')
    },
    {
      label: 'Terminating record without a reason',
      record: activeRecord(11, 11, null, 'terminating')
    },
    {
      label: 'Off record with a blank reason',
      record: activeRecord(11, 12, '   ', 'off')
    },
    {
      label: 'record with a negative timestamp',
      record: { ...activeRecord(11, 13), updatedAt: -1 }
    },
    {
      label: 'array-shaped record',
      record: [activeRecord(11, 14)]
    }
  ];

  for (const testCase of cases) {
    const harness = createChromeHarness({
      storage: { ['skopeoSession:11']: testCase.record },
      runtimes: { 11: testCase.runtime || { listenerMissing: true } }
    });
    const controller = bootProductionController(backgroundSource, harness);

    assert.deepEqual(
      clone(await controller.ready),
      { success: true, restored: 0, normalized: 1 },
      testCase.label + ' is removed during worker rehydration'
    );
    assert.equal(storageRecord(harness, 11), undefined, testCase.label + ' leaves no stored session');
    assert.deepEqual(
      clone(await controller.getStatus(11)),
      { success: true, tabId: 11, generation: 0, status: 'off' },
      testCase.label + ' falls back to the missing-record baseline'
    );

    const restarted = await controller.toggleTab(11);
    assert.equal(restarted.success, true, testCase.label + ' does not strand the next toggle');
    assert.equal(restarted.generation, 1, testCase.label + ' restarts at generation 1');
    assert.equal(restarted.status, 'starting', testCase.label + ' creates a fresh Starting record');
    assert.equal(storageRecord(harness, 11).generation, 1, testCase.label + ' persists generation 1');
  }
}

async function assertNoncanonicalStoredSessionAliases(backgroundSource) {
  const cases = [
    {
      label: 'leading-zero Starting alias',
      key: 'skopeoSession:011',
      record: activeRecord(11, 15, null, 'starting')
    },
    {
      label: 'exponent Active alias',
      key: 'skopeoSession:11e0',
      record: activeRecord(11, 16)
    },
    {
      label: 'signed Terminating alias',
      key: 'skopeoSession:+11',
      record: activeRecord(11, 17, 'navigation', 'terminating')
    },
    {
      label: 'whitespace Off alias',
      key: 'skopeoSession: 11',
      record: activeRecord(11, 18, null, 'off')
    }
  ];

  for (const testCase of cases) {
    const harness = createChromeHarness({
      storage: { [testCase.key]: testCase.record },
      runtimes: {
        11: { generation: testCase.record.generation, phase: 'active', resources: activeResources() }
      }
    });
    const controller = bootProductionController(backgroundSource, harness);

    assert.deepEqual(
      clone(await controller.ready),
      { success: true, restored: 0, normalized: 0 },
      testCase.label + ' is discarded without false restoration or normalization accounting'
    );
    assert.equal(harness.storageData.has(testCase.key), false, testCase.label + ' raw key is removed');
    assert.equal(storageRecord(harness, 11), undefined, testCase.label + ' does not create a canonical record');
    assert.equal(
      harness.tabMessages.some((entry) => entry.message.action === 'skopeo:probe'),
      false,
      testCase.label + ' never probes a page runtime'
    );
  }

  const canonical = activeRecord(11, 19);
  const shadowAlias = activeRecord(11, 19, null, 'starting');
  const harness = createChromeHarness({
    storage: {
      ['skopeoSession:011']: shadowAlias,
      ['skopeoSession:11']: canonical
    },
    runtimes: { 11: { generation: 19, phase: 'active', resources: activeResources() } }
  });
  const controller = bootProductionController(backgroundSource, harness);

  assert.deepEqual(
    clone(await controller.ready),
    { success: true, restored: 1, normalized: 0 },
    'noncanonical alias is ignored while the canonical Active record is restored'
  );
  assert.equal(harness.storageData.has('skopeoSession:011'), false, 'shadow alias raw key is removed');
  assert.deepEqual(storageRecord(harness, 11), canonical, 'shadow alias cannot mutate the canonical record');
  assert.equal(
    harness.tabMessages.filter((entry) => entry.message.action === 'skopeo:probe').length,
    1,
    'only the canonical Active record is probed'
  );
}

async function assertProbeAndWakeContracts(backgroundSource) {
  const cases = [
    {
      label: 'matching active probe',
      record: activeRecord(11, 4),
      runtime: { generation: 4, phase: 'active', resources: activeResources() },
      expected: 'active'
    },
    {
      label: 'stale active probe',
      record: activeRecord(11, 5),
      runtime: { generation: 4, phase: 'active', resources: activeResources() },
      expected: 'off'
    },
    {
      label: 'missing active runtime',
      record: activeRecord(11, 6),
      runtime: { listenerMissing: true },
      expected: 'off'
    },
    {
      label: 'prepared marker with missing runtime',
      record: activeRecord(11, 7, PREPARED_REASON),
      runtime: { listenerMissing: true },
      expected: 'off'
    },
    {
      label: 'prepared marker with mounted runtime',
      record: activeRecord(11, 8, PREPARED_REASON),
      runtime: { generation: 8, phase: 'active', resources: activeResources() },
      expected: 'active'
    },
    {
      label: 'interrupted STARTING',
      record: activeRecord(11, 9, null, 'starting'),
      runtime: { listenerMissing: true },
      expected: 'off'
    },
    {
      label: 'interrupted TERMINATING',
      record: activeRecord(11, 10, 'navigation', 'terminating'),
      runtime: { listenerMissing: true },
      expected: 'off'
    }
  ];

  for (const testCase of cases) {
    const harness = createChromeHarness({
      storage: { ['skopeoSession:11']: testCase.record },
      runtimes: { 11: testCase.runtime }
    });
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    const record = storageRecord(harness, 11);
    assert.equal(record.status, testCase.expected, testCase.label);
    if (testCase.expected === 'active') assert.equal(record.reason, null, testCase.label + ' is publicly active after proof');
    assert.equal(harness.executeCalls.length, 0, testCase.label + ' never injects');
    assert.equal(harness.tabMessages.some((entry) => entry.message.action === 'skopeo:prepare'), false);
    assert.equal(harness.tabMessages.some((entry) => entry.message.action === 'skopeo:commit'), false);
    assert.equal(harness.broadcasts.some((event) => event.attention && event.attention !== 'ambient'), false);
  }

  const malformedHarness = createChromeHarness({
    storage: { ['skopeoSession:11']: activeRecord(11, 12) },
    runtimes: {
      11: {
        generation: 12,
        phase: 'active',
        probeResponse: { success: true, generation: 11, status: 'active', attention: 'ambient', mounted: true }
      }
    }
  });
  const malformedController = bootProductionController(backgroundSource, malformedHarness);
  await malformedController.ready;
  assert.equal(storageRecord(malformedHarness, 11).status, 'off', 'wrong-generation active probe is rejected');
  assert.equal(malformedHarness.executeCalls.length, 0);
}

async function assertNavigationAndReinjection(backgroundSource) {
  const harness = createChromeHarness();
  const controller = bootProductionController(backgroundSource, harness);
  await controller.ready;
  await controller.toggleTab(11);
  const firstGeneration = storageRecord(harness, 11).generation;
  await controller.handleContentMessage(
    { action: 'skopeo:prepared', generation: firstGeneration, placement: 'full' },
    { id: harness.chrome.runtime.id, tab: { id: 11 } }
  );
  await controller.handleContentMessage(
    readyMessage(firstGeneration),
    { id: harness.chrome.runtime.id, tab: { id: 11 } }
  );
  const injectionsBeforeNavigation = harness.executeCalls.length;
  const preparesBeforeRoute = harness.tabMessages.filter((entry) => entry.message.action === 'skopeo:prepare').length;
  const commitsBeforeRoute = harness.tabMessages.filter((entry) => entry.message.action === 'skopeo:commit').length;
  const broadcastsBeforeRoute = harness.broadcasts.length;

  harness.events.updatedEvent.emit(11, { url: 'https://example.test/a2' }, { id: 11, url: 'https://example.test/a2' });
  await harness.flush();
  assert.equal(storageRecord(harness, 11).status, 'active', 'URL-only update keeps the active generation alive');
  assert.equal(storageRecord(harness, 11).generation, firstGeneration, 'URL-only update does not allocate a generation');
  assert.equal(harness.executeCalls.length, injectionsBeforeNavigation, 'URL-only update does not reinject');
  assert.equal(harness.tabMessages.filter((entry) => entry.message.action === 'skopeo:prepare').length, preparesBeforeRoute, 'URL-only update does not prepare');
  assert.equal(harness.tabMessages.filter((entry) => entry.message.action === 'skopeo:commit').length, commitsBeforeRoute, 'URL-only update does not commit');
  assert.equal(harness.broadcasts.length, broadcastsBeforeRoute, 'URL-only update does not rebroadcast Active');
  assert.deepEqual(
    harness.tabMessages.filter((entry) => entry.message.action === 'skopeo:route-change').map((entry) => entry.message),
    [{ action: 'skopeo:route-change', generation: firstGeneration, url: 'https://example.test/a2' }],
    'URL-only update hands the exact bounded route envelope to the existing runtime once'
  );

  harness.runtimes.get(11).terminateFailure = true;
  harness.events.updatedEvent.emit(11, { status: 'loading', url: 'https://example.test/a3' }, { id: 11, url: 'https://example.test/a3' });
  await harness.flush();
  assert.equal(storageRecord(harness, 11).status, 'off', 'loading/hard navigation ends generation despite removed runtime listener');
  assert.equal(harness.executeCalls.length, injectionsBeforeNavigation, 'hard navigation does not reinject');
  assert.equal(
    harness.tabMessages.filter((entry) => entry.message.action === 'skopeo:route-change').length,
    1,
    'loading plus URL evidence stays terminal and cannot also route'
  );
  assert.deepEqual(resourceSnapshot(harness, 11), ZERO_RESOURCES);

  harness.events.updatedEvent.emit(11, { url: 'https://example.test/off' }, { id: 11, url: 'https://example.test/off' });
  await harness.flush();
  assert.equal(
    harness.tabMessages.filter((entry) => entry.message.action === 'skopeo:route-change').length,
    1,
    'URL-only updates do not auto-start or hand off to an OFF tab'
  );

  const secondStart = await controller.toggleTab(11);
  assert.equal(secondStart.generation, firstGeneration + 1, 'later explicit invoke allocates a newer generation');
  assert.equal(harness.executeCalls.length, injectionsBeforeNavigation + 1, 'later explicit invoke dynamically reinjects once');

  await controller.handleContentMessage(
    { action: 'skopeo:prepared', generation: secondStart.generation, placement: 'full' },
    { id: harness.chrome.runtime.id, tab: { id: 11 } }
  );
  await controller.handleContentMessage(
    readyMessage(secondStart.generation),
    { id: harness.chrome.runtime.id, tab: { id: 11 } }
  );
  const routeCountBeforeRestricted = harness.tabMessages.filter((entry) => entry.message.action === 'skopeo:route-change').length;
  harness.events.updatedEvent.emit(11, { url: 'chrome://settings/' }, { id: 11, url: 'chrome://settings/' });
  await harness.flush();
  assert.equal(storageRecord(harness, 11).status, 'off', 'restricted URL evidence remains terminal');
  assert.equal(harness.executeCalls.length, injectionsBeforeNavigation + 1, 'restricted navigation cannot reinject');
  assert.equal(
    harness.tabMessages.filter((entry) => entry.message.action === 'skopeo:route-change').length,
    routeCountBeforeRestricted,
    'restricted navigation is never delivered as a same-document route'
  );

  harness.events.removedEvent.emit(11);
  await harness.flush();
  assert.equal(storageRecord(harness, 11), undefined, 'tab removal deletes only that tab record');
}

async function exerciseNewestFirstRouteRace(backgroundSource, controllerOptions = {}) {
  const { harness, deliveries } = createControlledRouteHarness();
  const controller = bootProductionController(backgroundSource, harness, controllerOptions);
  await controller.ready;
  const generation = await activateProductionTab(controller, harness, 11);
  await seedPendingRouteState(controller, harness, 11, generation, 'newest_first');

  emitUrlOnlyUpdate(harness, 11, 'https://example.test/a2');
  emitUrlOnlyUpdate(harness, 11, 'https://example.test/a3');
  await waitForRouteDeliveries(harness, deliveries, 2);
  assert.deepEqual(
    deliveries.map((delivery) => delivery.response.contextEpoch),
    [2, 3],
    'fixture assigns monotonically newer runtime epochs to consecutive routes'
  );

  resolveRouteDelivery(deliveries[1]);
  await harness.flush();
  const afterNewest = productionRouteSnapshot(controller, harness, 11);
  assert.equal(afterNewest.record.status, 'active', 'newest route reply keeps the generation Active');
  assert.equal(afterNewest.controller.authority.contextEpoch, 3, 'newest route reply owns context authority');
  assert.deepEqual(afterNewest.controller.readActionTokens, [], 'accepted current route clears read tokens');
  assert.equal(afterNewest.gates[0].pendingArgument, null, 'accepted current route clears pending arguments');
  assert.equal(afterNewest.gates[0].pendingRead, null, 'accepted current route clears pending reads');
  assert.equal(afterNewest.gates[0].pendingConfirmation, null, 'accepted current route clears pending confirmation');
  assert.equal(afterNewest.gates[0].pendingConsequence, null, 'accepted current route clears pending consequence');
  assert.deepEqual(afterNewest.terminationMessages, [], 'newest route reply does not terminate the session');

  resolveRouteDelivery(deliveries[0]);
  await harness.flush();
  const afterObsolete = productionRouteSnapshot(controller, harness, 11);
  assert.deepEqual(
    afterObsolete,
    afterNewest,
    'newest-first route sequence: obsolete reply mutated newest session (missing production currentness guard)'
  );
  assert.deepEqual(
    afterObsolete.gates[0].invalidations,
    ['authority-stale'],
    'only the accepted current route invalidates pending consequence state'
  );
}

async function assertSameDocumentRouteSequencing(backgroundSource) {
  await exerciseNewestFirstRouteRace(backgroundSource);

  {
    const { harness, deliveries } = createControlledRouteHarness();
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    const generation = await activateProductionTab(controller, harness, 11);
    await seedPendingRouteState(controller, harness, 11, generation, 'oldest_first');
    emitUrlOnlyUpdate(harness, 11, 'https://example.test/a2');
    emitUrlOnlyUpdate(harness, 11, 'https://example.test/a3');
    await waitForRouteDeliveries(harness, deliveries, 2);
    const beforeReplies = productionRouteSnapshot(controller, harness, 11);

    resolveRouteDelivery(deliveries[0]);
    await harness.flush();
    assert.deepEqual(
      productionRouteSnapshot(controller, harness, 11),
      beforeReplies,
      'oldest-first route sequence: obsolete first reply is completely inert'
    );

    resolveRouteDelivery(deliveries[1]);
    await harness.flush();
    const afterCurrent = productionRouteSnapshot(controller, harness, 11);
    assert.equal(afterCurrent.record.status, 'active', 'oldest-first sequence finishes Active');
    assert.equal(afterCurrent.controller.authority.contextEpoch, 3, 'only newest route reply advances authority');
    assert.deepEqual(afterCurrent.controller.readActionTokens, [], 'newest route acceptance clears read tokens');
    assert.deepEqual(
      afterCurrent.gates[0].invalidations,
      ['authority-stale'],
      'oldest-first sequence invalidates pending state only for the current route'
    );
  }

  {
    const { harness, deliveries } = createControlledRouteHarness();
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    const generationA = await activateProductionTab(controller, harness, 11);
    const generationB = await activateProductionTab(controller, harness, 22);
    emitUrlOnlyUpdate(harness, 11, 'https://example.test/a2');
    emitUrlOnlyUpdate(harness, 22, 'https://example.test/b2');
    await waitForRouteDeliveries(harness, deliveries, 2);
    const routeA = deliveries.find((delivery) => delivery.tabId === 11);
    const routeB = deliveries.find((delivery) => delivery.tabId === 22);
    assert.ok(routeA && routeB, 'two-tab fixture captures one independent route per tab');

    resolveRouteDelivery(routeB);
    await harness.flush();
    const tabBAfterOwnReply = productionRouteSnapshot(controller, harness, 22);
    resolveRouteDelivery(routeA);
    await harness.flush();
    assert.deepEqual(
      productionRouteSnapshot(controller, harness, 22),
      tabBAfterOwnReply,
      'Tab A route commit cannot mutate Tab B route authority'
    );
    assert.equal(controller.__testSnapshot(11).generation, generationA, 'Tab A keeps its generation');
    assert.equal(controller.__testSnapshot(22).generation, generationB, 'Tab B keeps its generation');
    assert.equal(controller.__testSnapshot(11).authority.contextEpoch, 2, 'Tab A commits its own epoch');
    assert.equal(controller.__testSnapshot(22).authority.contextEpoch, 2, 'Tab B commits its own epoch');
  }

  {
    const { harness, deliveries } = createControlledRouteHarness();
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    const firstGeneration = await activateProductionTab(controller, harness, 11);
    emitUrlOnlyUpdate(harness, 11, 'https://example.test/a2');
    await waitForRouteDeliveries(harness, deliveries, 1);
    await controller.toggleTab(11);
    const secondGeneration = await activateProductionTab(controller, harness, 11);
    assert.ok(secondGeneration > firstGeneration, 'replacement fixture installs a newer controller generation');
    const afterReplacement = productionRouteSnapshot(controller, harness, 11);
    resolveRouteDelivery(deliveries[0]);
    await harness.flush();
    assert.deepEqual(
      productionRouteSnapshot(controller, harness, 11),
      afterReplacement,
      'reply owned by a replaced controller is completely inert'
    );
  }

  for (const terminalCase of [
    {
      label: 'explicit kill',
      apply: async (controller) => { await controller.toggleTab(11); }
    },
    {
      label: 'hard navigation',
      apply: async (_controller, harness) => { emitHardNavigation(harness, 11, 'https://example.test/a3'); }
    },
    {
      label: 'origin change',
      apply: async (_controller, harness) => { emitUrlOnlyUpdate(harness, 11, 'https://other.test/a3'); }
    }
  ]) {
    const { harness, deliveries } = createControlledRouteHarness();
    const controller = bootProductionController(backgroundSource, harness);
    await controller.ready;
    await activateProductionTab(controller, harness, 11);
    emitUrlOnlyUpdate(harness, 11, 'https://example.test/a2');
    await waitForRouteDeliveries(harness, deliveries, 1);
    await terminalCase.apply(controller, harness);
    await waitForStoredStatus(harness, 11, 'off');
    const afterTerminal = productionRouteSnapshot(controller, harness, 11);
    resolveRouteDelivery(deliveries[0]);
    await harness.flush();
    assert.deepEqual(
      productionRouteSnapshot(controller, harness, 11),
      afterTerminal,
      terminalCase.label + ': reply after terminal invalidation is completely inert'
    );
  }

  let sabotageFailure = null;
  try {
    await exerciseNewestFirstRouteRace(backgroundSource, { sabotageRouteCurrentness: true });
  } catch (error) {
    sabotageFailure = error;
  }
  const sabotageReason = 'newest-first route sequence: obsolete reply mutated newest session (missing production currentness guard)';
  assert.ok(sabotageFailure, 'currentness-guard sabotage must fail the route race regression');
  assert.ok(
    String(sabotageFailure.message).includes(sabotageReason),
    'currentness-guard sabotage is caught for the intended stale-reply reason'
  );
}

async function runProductionContract() {
  const backgroundSource = fs.readFileSync(BACKGROUND_PATH, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const sidepanelHtmlSource = fs.readFileSync(SIDEPANEL_HTML_PATH, 'utf8');
  const sidepanelCssSource = fs.readFileSync(SIDEPANEL_CSS_PATH, 'utf8');
  const sidepanelSource = fs.readFileSync(SIDEPANEL_JS_PATH, 'utf8');
  const controlPanelHtmlSource = fs.readFileSync(CONTROL_PANEL_HTML_PATH, 'utf8');
  const optionsSource = fs.readFileSync(OPTIONS_JS_PATH, 'utf8');
  const wsClientSource = fs.readFileSync(WS_CLIENT_PATH, 'utf8');
  assertStaticContracts(backgroundSource, manifest, wsClientSource);
  assertSkopeoLivesInAdvancedSettings({
    sidepanelHtml: sidepanelHtmlSource,
    sidepanelCss: sidepanelCssSource,
    sidepanelJs: sidepanelSource,
    controlPanelHtml: controlPanelHtmlSource,
    optionsJs: optionsSource
  });
  await assertStatusNotificationResponseContract(backgroundSource);
  await assertSkopeoSwitchContract(backgroundSource);
  await assertPrimaryInvocationContract(backgroundSource);
  await assertFailureAndCancellationContracts(backgroundSource);
  await assertTeardownCertificateValidation(backgroundSource);
  await assertStoredRecordInvariantParity(backgroundSource);
  await assertNoncanonicalStoredSessionAliases(backgroundSource);
  await assertProbeAndWakeContracts(backgroundSource);
  await assertNavigationAndReinjection(backgroundSource);
  await assertSameDocumentRouteSequencing(backgroundSource);
  const bytes = fs.readFileSync(__filename);
  assert.equal(Array.from(bytes).every((byte) => byte <= 0x7f), true, 'test source remains ASCII-only');
  console.log('skopeo side-panel/command production contract: PASS');
}

async function main() {
  if (SELF_TEST) runSelfTest();
  else await runProductionContract();
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
