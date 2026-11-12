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
const CONTROLLER_START = '/* FSB_SKOPEO_CONTROLLER_START */';
const CONTROLLER_END = '/* FSB_SKOPEO_CONTROLLER_END */';
const SIDEPANEL_CONTROLLER_START = '/* FSB_SKOPEO_SIDEPANEL_CONTROLLER_START */';
const SIDEPANEL_CONTROLLER_END = '/* FSB_SKOPEO_SIDEPANEL_CONTROLLER_END */';
const TAB_AUTHORITY_START = '/* FSB_SKOPEO_TAB_AUTHORITY_START */';
const TAB_AUTHORITY_END = '/* FSB_SKOPEO_TAB_AUTHORITY_END */';
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

function extractBoundedSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.notEqual(start, -1, startMarker + ' exists');
  assert.notEqual(end, -1, endMarker + ' exists');
  assert.ok(end > start, startMarker + ' precedes ' + endMarker);
  return source.slice(start, end + endMarker.length);
}

function createSidepanelElement(id, tagName, documentRef, writeLog, mutationLog) {
  const attributes = new Map();
  const classes = new Set();
  const listeners = new Map();
  const datasetValues = {};
  const styleValues = {};
  let text = '';
  let hidden = false;
  let disabled = false;
  let tabIndex = 0;
  const element = {
    id,
    tagName,
    classList: {
      add(name) {
        classes.add(name);
        mutationLog.push({ id, property: 'class.' + name, value: true });
      },
      remove(name) {
        classes.delete(name);
        mutationLog.push({ id, property: 'class.' + name, value: false });
      },
      contains(name) {
        return classes.has(name);
      }
    },
    dataset: new Proxy(datasetValues, {
      set(target, property, value) {
        target[property] = String(value);
        mutationLog.push({ id, property: 'dataset.' + String(property), value: String(value) });
        return true;
      }
    }),
    style: new Proxy(styleValues, {
      set(target, property, value) {
        target[property] = String(value);
        mutationLog.push({ id, property: 'style.' + String(property), value: String(value) });
        return true;
      }
    }),
    setAttribute(name, value) {
      const next = String(value);
      attributes.set(name, next);
      mutationLog.push({ id, property: 'attribute.' + name, value: next });
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    removeAttribute(name) {
      attributes.delete(name);
      mutationLog.push({ id, property: 'attribute.' + name, value: null });
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    focus() {
      documentRef.activeElement = element;
    },
    dispatch(type, event = {}) {
      const calls = (listeners.get(type) || []).map((listener) => listener({ currentTarget: element, target: element, ...event }));
      return Promise.all(calls.map((value) => Promise.resolve(value)));
    },
    _attributes: attributes,
    _classes: classes,
    _listeners: listeners
  };
  Object.defineProperty(element, 'textContent', {
    get() {
      return text;
    },
    set(value) {
      text = String(value);
      writeLog.push({ id, property: 'textContent', value: text });
      mutationLog.push({ id, property: 'textContent', value: text });
    }
  });
  for (const [property, getter, setter] of [
    ['hidden', () => hidden, (value) => { hidden = Boolean(value); }],
    ['disabled', () => disabled, (value) => { disabled = Boolean(value); }],
    ['tabIndex', () => tabIndex, (value) => { tabIndex = Number(value); }]
  ]) {
    Object.defineProperty(element, property, {
      get: getter,
      set(value) {
        setter(value);
        mutationLog.push({ id, property, value: getter() });
      }
    });
  }
  Object.defineProperty(element, 'innerHTML', {
    get() {
      return '';
    },
    set() {
      throw new Error('Skopeo controller must not write innerHTML');
    }
  });
  Object.defineProperty(element, 'title', {
    get() {
      return attributes.get('title') || '';
    },
    set(value) {
      const next = String(value);
      attributes.set('title', next);
      mutationLog.push({ id, property: 'attribute.title', value: next });
    }
  });
  return element;
}

function createSidepanelDomHarness() {
  const writeLog = [];
  const mutationLog = [];
  const elements = new Map();
  const documentRef = {
    activeElement: null,
    getElementById(id) {
      return elements.get(id) || null;
    }
  };
  function add(id, tagName = 'DIV') {
    const element = createSidepanelElement(id, tagName, documentRef, writeLog, mutationLog);
    elements.set(id, element);
    return element;
  }

  const row = add('skopeoControl', 'SECTION');
  row.dataset.state = 'off';
  row.setAttribute('aria-live', 'off');
  row.setAttribute('aria-atomic', 'true');
  row.setAttribute('aria-busy', 'false');
  const title = add('skopeoTitle', 'SPAN');
  title.textContent = 'Skopeo';
  const toggle = add('skopeoToggle', 'BUTTON');
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', 'false');
  toggle.setAttribute('aria-label', 'Skopeo for this tab');
  toggle.setAttribute('aria-describedby', 'skopeoStatus skopeoStatusBody skopeoHint');
  const status = add('skopeoStatus', 'SPAN');
  status.textContent = 'Off for this tab';
  const body = add('skopeoStatusBody', 'P');
  body.hidden = true;
  const action = add('skopeoAction', 'SPAN');
  action.textContent = 'Turn on Skopeo';
  const hint = add('skopeoHint', 'BUTTON');
  hint.textContent = 'Shortcut not assigned \u00b7 Set in Chrome shortcuts';
  const chatInput = add('chatInput', 'DIV');
  chatInput.textContent = 'keep this draft';
  chatInput.setAttribute('contenteditable', 'true');
  const sendBtn = add('sendBtn', 'BUTTON');
  sendBtn.disabled = false;
  const stopBtn = add('stopBtn', 'BUTTON');
  stopBtn.disabled = false;
  const micBtn = add('micBtn', 'BUTTON');
  micBtn.disabled = false;
  const ownerChip = add('fsb-owner-chip', 'SPAN');
  ownerChip.style.display = 'none';
  const chatMessages = add('chatMessages', 'DIV');
  chatMessages.textContent = 'existing chat';
  writeLog.length = 0;
  mutationLog.length = 0;
  return {
    document: documentRef,
    elements,
    writeLog,
    mutationLog,
    row,
    title,
    toggle,
    status,
    body,
    action,
    hint,
    chatInput,
    sendBtn,
    stopBtn,
    micBtn,
    ownerChip,
    chatMessages
  };
}

function createSidepanelChromeHarness() {
  const runtimeOnMessage = createEvent();
  const messages = [];
  const commandCalls = [];
  const queryCalls = [];
  const createdTabs = [];
  let runtimeResponder = async (message) => {
    if (message.action === 'skopeo:get-status') {
      return { success: true, tabId: message.tabId, generation: 0, status: 'off' };
    }
    return { success: true, tabId: message.tabId, generation: 1, status: 'starting' };
  };
  let commandRows = [{ name: COMMAND, shortcut: 'Ctrl+Shift+Space' }];
  let commandResponder = async () => clone(commandRows);
  const chrome = {
    runtime: {
      onMessage: runtimeOnMessage,
      async sendMessage(message) {
        messages.push(clone(message));
        return runtimeResponder(message);
      }
    },
    commands: {
      async getAll() {
        commandCalls.push(true);
        return commandResponder();
      }
    },
    tabs: {
      async query(details) {
        queryCalls.push(clone(details));
        return [{ id: 999 }];
      },
      async create(details) {
        createdTabs.push(clone(details));
        return { id: 1000, ...clone(details) };
      }
    }
  };
  return {
    chrome,
    runtimeOnMessage,
    messages,
    commandCalls,
    queryCalls,
    createdTabs,
    setRuntimeResponder(responder) {
      runtimeResponder = responder;
    },
    setCommandRows(rows) {
      commandRows = clone(rows);
      commandResponder = async () => clone(commandRows);
    },
    setCommandResponder(responder) {
      commandResponder = responder;
    }
  };
}

function extractSidepanelControllerSource(sidepanelSource) {
  const start = sidepanelSource.indexOf(SIDEPANEL_CONTROLLER_START);
  const end = sidepanelSource.indexOf(SIDEPANEL_CONTROLLER_END);
  assert.notEqual(start, -1, 'side-panel Skopeo controller start marker exists');
  assert.notEqual(end, -1, 'side-panel Skopeo controller end marker exists');
  assert.ok(end > start, 'side-panel Skopeo controller marker order is valid');
  return sidepanelSource.slice(start, end + SIDEPANEL_CONTROLLER_END.length);
}

function instrumentSidepanelControllerAuthority(controllerSource) {
  const anchor = 'global.FSBSkopeoSidepanelController = Object.freeze({';
  assert.ok(controllerSource.includes(anchor), 'side-panel controller export anchor exists');
  return controllerSource.replace(anchor, [
    'globalThis.__readSkopeoControllerAuthority = function () {',
    '  return {',
    '    activationSerial: _activationSerial,',
    '    currentActivation: _currentActivation ? {',
    '      tabId: _currentActivation.tabId,',
    '      token: _currentActivation.token',
    '    } : null,',
    '    requestSerial: _requestSerial,',
    '    latestRequests: Array.from(_latestRequestByLane.entries()).sort(function (left, right) {',
    '      return String(left[0]).localeCompare(String(right[0]));',
    '    }),',
    '    presentationSerial: typeof _presentationSerial === "undefined" ? 0 : _presentationSerial,',
    '    latestPresentation: typeof _latestPresentation === "undefined" || !_latestPresentation ? null : {',
    '      tabId: _latestPresentation.tabId,',
    '      activationToken: _latestPresentation.activationToken,',
    '      token: _latestPresentation.token',
    '    },',
    '    shortcutHint: _shortcutHint,',
    '    highestGenerations: typeof _highestGenerationByTab === "undefined"',
    '      ? []',
    '      : Array.from(_highestGenerationByTab.entries()).sort(function (left, right) {',
    '          return left[0] - right[0];',
    '        }),',
    '    lifecyclePresentations: typeof _lifecyclePresentationByTab === "undefined"',
    '      ? []',
    '      : Array.from(_lifecyclePresentationByTab.entries()).map(function (entry) {',
    '          return [entry[0], { generation: entry[1].generation, stage: entry[1].stage }];',
    '        }).sort(function (left, right) {',
    '          return left[0] - right[0];',
    '        })',
    '  };',
    '};',
    anchor
  ].join('\n  '));
}

function bootSidepanelController(sidepanelSource, domHarness, chromeHarness, activeTabId = 11) {
  const controllerSource = instrumentSidepanelControllerAuthority(
    extractSidepanelControllerSource(sidepanelSource)
  );
  const sandbox = {
    chrome: chromeHarness.chrome,
    document: domHarness.document,
    console,
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
    _activeTabIdSnapshot: activeTabId
  };
  sandbox.globalThis = sandbox;
  vm.runInContext(controllerSource, vm.createContext(sandbox), { filename: 'sidepanel-skopeo-controller.js' });
  assert.ok(sandbox.FSBSkopeoSidepanelController, 'side-panel controller exports its narrow integration surface');
  sandbox.FSBSkopeoSidepanelController.initialize();
  return { controller: sandbox.FSBSkopeoSidepanelController, sandbox, source: controllerSource };
}

function invokeSidepanelStatusHandler(controller, message) {
  return [controller.handleSkopeoStatusEvent(message)];
}

function createOuterAuthorityHarness(sidepanelSource, initialTabId = 10) {
  const dom = createSidepanelDomHarness();
  const runtimeOnMessage = createEvent();
  const tabActivated = createEvent();
  const windowFocused = createEvent();
  const messages = [];
  const queryCalls = [];
  const activations = [];
  const swaps = [];
  const persistedTabs = [];
  const restoredTabs = [];
  const runningDispatches = [];
  const windowQueries = new Map();
  let bootQuery = null;
  let ownerRefresh = () => Promise.resolve();

  const chrome = {
    runtime: {
      onMessage: runtimeOnMessage,
      async sendMessage(message) {
        messages.push(clone(message));
        if (message.action === 'skopeo:get-status') {
          return {
            success: true,
            tabId: message.tabId,
            generation: 1,
            status: 'active',
            attention: 'ambient'
          };
        }
        return {
          success: true,
          tabId: message.tabId,
          generation: 1,
          status: 'off'
        };
      }
    },
    commands: {
      async getAll() {
        return [{ name: COMMAND, shortcut: 'Ctrl+Shift+Space' }];
      }
    },
    tabs: {
      onActivated: tabActivated,
      async query(details) {
        queryCalls.push(clone(details));
        if (details && details.currentWindow === true) {
          assert.ok(bootQuery, 'boot query deferred is configured');
          return bootQuery.promise;
        }
        const pending = windowQueries.get(details && details.windowId);
        assert.ok(pending, 'window query deferred is configured for ' + String(details && details.windowId));
        return pending.promise;
      },
      async create(details) {
        return { id: 1000, ...clone(details) };
      }
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: windowFocused
    },
    storage: {
      session: {
        async get() { return {}; },
        async set() { return true; },
        async remove() { return true; }
      }
    }
  };

  const authoritySource = extractBoundedSource(sidepanelSource, TAB_AUTHORITY_START, TAB_AUTHORITY_END);
  const controllerSource = extractSidepanelControllerSource(sidepanelSource);
  const initSource = extractBracedSource(
    sidepanelSource,
    'async function initTabConversationStore()',
    true
  );
  const activatedBody = extractBracedSource(
    sidepanelSource,
    'chrome.tabs.onActivated.addListener(async (activeInfo) =>',
    false
  );
  const focusedBody = extractBracedSource(
    sidepanelSource,
    'chrome.windows.onFocusChanged.addListener(async (windowId) =>',
    false
  );

  const sandbox = {
    chrome,
    document: dom.document,
    console,
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
    _activeTabIdSnapshot: initialTabId,
    tabConvEnvelope: null,
    conversationId: 'conversation-initial',
    _envelopeReadyResolve() {},
    _mintConversationId() { return 'conversation-fallback'; },
    FSBSidepanelTabConvStore: {
      async migrateLegacyConversationKey(_read, _write, _remove, activeTabId) {
        return {
          v: 1,
          byTab: {
            '11': { conversationId: 'conversation-tab-a' },
            '22': { conversationId: 'conversation-tab-b' }
          },
          lru: [String(activeTabId)]
        };
      },
      getTabConversation(envelope, tabId) {
        const entry = envelope && envelope.byTab && envelope.byTab[String(tabId)];
        return entry ? entry.conversationId : null;
      }
    },
    refreshOwnerChip() {
      return ownerRefresh();
    },
    async swapToTabConversation(tabId) {
      swaps.push(tabId);
      sandbox.conversationId = tabId === 22 ? 'conversation-tab-b' : 'conversation-tab-a';
    },
    _persistTabStatusIntent(tabId) {
      persistedTabs.push(tabId);
    },
    _restoreTabStatusIntent(tabId) {
      restoredTabs.push(tabId);
    },
    _getTabRunningEntry(tabId) {
      return { isRunning: false, sessionId: 'session-' + tabId };
    },
    setRunningState(tabId) {
      runningDispatches.push({ tabId, state: 'running' });
    },
    setIdleState(tabId) {
      runningDispatches.push({ tabId, state: 'idle' });
    }
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(authoritySource, context, { filename: 'sidepanel-tab-authority.js' });
  vm.runInContext(controllerSource, context, { filename: 'sidepanel-skopeo-controller.js' });
  sandbox.FSBSkopeoSidepanelController.initialize();
  const productionController = sandbox.FSBSkopeoSidepanelController;
  sandbox.FSBSkopeoSidepanelController = Object.freeze({
    ...productionController,
    activateTab(tabId) {
      activations.push(tabId);
      return productionController.activateTab(tabId);
    }
  });
  vm.runInContext(initSource, context, { filename: 'sidepanel-tab-store-init.js' });
  vm.runInContext(
    'globalThis.__onTabActivated = async function(activeInfo) {' + activatedBody + '\n};',
    context,
    { filename: 'sidepanel-tab-activated.js' }
  );
  vm.runInContext(
    'globalThis.__onWindowFocused = async function(windowId) {' + focusedBody + '\n};',
    context,
    { filename: 'sidepanel-window-focused.js' }
  );

  async function flush() {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }

  async function assertWinningTab(tabId, label) {
    await productionController.refreshSkopeoControl(tabId);
    assert.deepEqual(
      messages.filter((message) => message.action === 'skopeo:get-status').at(-1),
      { action: 'skopeo:get-status', tabId },
      label + ' refresh uses winning tab'
    );
    await productionController.handleSkopeoToggle();
    assert.deepEqual(
      messages.filter((message) => message.action === 'skopeo:toggle-tab').at(-1),
      { action: 'skopeo:toggle-tab', tabId },
      label + ' toggle uses winning tab'
    );
  }

  return {
    dom,
    sandbox,
    messages,
    queryCalls,
    activations,
    swaps,
    persistedTabs,
    restoredTabs,
    runningDispatches,
    productionController,
    setBootQuery(deferred) { bootQuery = deferred; },
    setWindowQuery(windowId, deferred) { windowQueries.set(windowId, deferred); },
    setOwnerRefresh(refresh) { ownerRefresh = refresh; },
    onTabActivated(activeInfo) { return sandbox.__onTabActivated(activeInfo); },
    onWindowFocused(windowId) { return sandbox.__onWindowFocused(windowId); },
    initTabConversationStore() { return sandbox.initTabConversationStore(); },
    flush,
    assertWinningTab
  };
}

function createOwnerChipAuthorityHarness(sidepanelSource, tabAStorage, tabBStorage, options = {}) {
  const dom = createSidepanelDomHarness();
  const storageReads = [];
  const lookupReads = [];
  const tabQueries = [];
  const queriedTabs = [11, 22];
  const storageChanged = createEvent();
  const primaryStorageResponses = options.primaryStorageResponses || [tabAStorage, tabBStorage];
  const lookupStorageResponses = options.lookupStorageResponses || [];
  let primaryStorageIndex = 0;
  let lookupStorageIndex = 0;
  let sandbox;

  function settleStorageResponse(response) {
    if (response && typeof response.then === 'function') return response;
    return Promise.resolve(clone(response === undefined ? {} : response));
  }

  const chrome = {
    tabs: {
      async query(details) {
        tabQueries.push(clone(details));
        return [{ id: queriedTabs[tabQueries.length - 1] }];
      }
    },
    storage: {
      onChanged: storageChanged,
      session: {
        get(keys) {
          if (Array.isArray(keys)) {
            storageReads.push(clone(keys));
            return settleStorageResponse(primaryStorageResponses[primaryStorageIndex++]);
          }
          lookupReads.push(keys);
          return settleStorageResponse(lookupStorageResponses[lookupStorageIndex++]);
        }
      }
    }
  };

  const authoritySource = extractBoundedSource(sidepanelSource, TAB_AUTHORITY_START, TAB_AUTHORITY_END);
  const lockoutSource = extractBracedSource(
    sidepanelSource,
    'function applyInputLockout(foreignOwned)',
    true
  );
  const refreshSource = extractBracedSource(
    sidepanelSource,
    'async function refreshOwnerChip',
    true
  );
  const refreshCurrentSource = extractBracedSource(
    sidepanelSource,
    'function refreshOwnerChipForCurrentAuthority()',
    true
  );
  const storageChangedBody = extractBracedSource(
    sidepanelSource,
    'chrome.storage.onChanged.addListener((changes, area) =>',
    false
  );
  const activatedBody = extractBracedSource(
    sidepanelSource,
    'chrome.tabs.onActivated.addListener(async (activeInfo) =>',
    false
  );

  sandbox = {
    chrome,
    document: dom.document,
    console,
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
    MY_SURFACE: 'legacy:sidepanel',
    FSBOwnerChip: require('../extension/ui/owner-chip.js'),
    FsbAgentRegistry: {
      formatAgentIdForDisplay(agentId) { return agentId; }
    },
    _activeTabIdSnapshot: 10,
    _chatLockedByOwnerChip: false,
    chatInput: dom.chatInput,
    isRunning: false,
    FSBSkopeoSidepanelController: {
      activateTab() {}
    },
    _persistTabStatusIntent() {},
    _restoreTabStatusIntent() {},
    async swapToTabConversation() {},
    _getTabRunningEntry() {
      return { isRunning: false, sessionId: null };
    },
    setRunningState() {},
    setIdleState() {},
    updateSendButtonState() {
      const hasContent = dom.chatInput.textContent.trim().length > 0;
      dom.sendBtn.disabled = !hasContent || sandbox.isRunning || sandbox._chatLockedByOwnerChip;
    }
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(
    [authoritySource, lockoutSource, refreshSource, refreshCurrentSource].join('\n'),
    context,
    { filename: 'sidepanel-owner-chip-authority.js' }
  );
  vm.runInContext(
    'chrome.storage.onChanged.addListener(function(changes, area) {' + storageChangedBody + '\n});',
    context,
    { filename: 'sidepanel-owner-chip-storage-listener.js' }
  );
  vm.runInContext(
    'globalThis.__onTabActivated = async function(activeInfo) {' + activatedBody + '\n};',
    context,
    { filename: 'sidepanel-owner-chip-activated.js' }
  );

  async function flush() {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }

  async function waitForStorageReads(count) {
    for (let attempt = 0; attempt < 20 && storageReads.length < count; attempt += 1) {
      await flush();
    }
    assert.equal(storageReads.length, count, 'owner-chip storage reads reach the expected boundary');
  }

  async function waitForLookupReads(count) {
    for (let attempt = 0; attempt < 20 && lookupReads.length < count; attempt += 1) {
      await flush();
    }
    assert.equal(lookupReads.length, count, 'owner-chip label lookups reach the expected boundary');
  }

  function controlSnapshot(element) {
    return {
      disabled: element.disabled,
      ariaDisabled: element.getAttribute('aria-disabled'),
      ariaDescribedBy: element.getAttribute('aria-describedby'),
      foreignOwnedClass: element.classList.contains('fsb-foreign-owned-disabled')
    };
  }

  function snapshot() {
    return {
      activeTabId: sandbox._activeTabIdSnapshot,
      chipText: dom.ownerChip.textContent,
      chipDisplay: dom.ownerChip.style.display,
      locked: sandbox._chatLockedByOwnerChip,
      chatInput: {
        ...controlSnapshot(dom.chatInput),
        contenteditable: dom.chatInput.getAttribute('contenteditable'),
        title: dom.chatInput.title
      },
      sendBtn: controlSnapshot(dom.sendBtn),
      stopBtn: controlSnapshot(dom.stopBtn),
      micBtn: controlSnapshot(dom.micBtn),
      mutationCount: dom.mutationLog.length
    };
  }

  return {
    storageReads,
    lookupReads,
    tabQueries,
    emitStorageChange(changes) { return storageChanged.emit(clone(changes), 'session'); },
    onTabActivated(activeInfo) { return sandbox.__onTabActivated(activeInfo); },
    waitForStorageReads,
    waitForLookupReads,
    flush,
    snapshot
  };
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

  const sidepanelSource = fs.readFileSync(SIDEPANEL_JS_PATH, 'utf8');
  const sidepanelControllerSource = extractSidepanelControllerSource(sidepanelSource);
  for (const functionName of [
    'renderSkopeoState',
    'refreshSkopeoControl',
    'handleSkopeoToggle',
    'refreshSkopeoShortcut',
    'handleSkopeoStatusEvent'
  ]) {
    assert.match(sidepanelControllerSource, new RegExp('function\\s+' + functionName + '\\b'), functionName + ' is extractable');
  }

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
  const manifestContentScripts = (manifest.content_scripts || []).flatMap((entry) => entry.js || []);
  const webAccessibleResources = (manifest.web_accessible_resources || []).flatMap((entry) => entry.resources || []);
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

function countElementId(source, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (source.match(new RegExp('\\bid=["\\\']' + escaped + '["\\\']', 'g')) || []).length;
}

function assertSidepanelRowStaticContracts(htmlSource, cssSource) {
  const headerClose = htmlSource.indexOf('</header>');
  const rowStart = htmlSource.indexOf('id="skopeoControl"');
  const chatStart = htmlSource.indexOf('class="chat-messages-area"');
  assert.ok(headerClose !== -1 && rowStart > headerClose, 'Skopeo row follows the side-panel header');
  assert.ok(chatStart > rowStart, 'Skopeo row precedes the chat messages area');
  assert.match(
    htmlSource,
    /<\/header>\s*<section\s+id="skopeoControl"\s+class="skopeo-control-row"/,
    'Skopeo row is the immediate structural sibling after the header'
  );

  const ids = [
    'skopeoControl',
    'skopeoTitle',
    'skopeoToggle',
    'skopeoStatus',
    'skopeoStatusBody',
    'skopeoAction',
    'skopeoHint'
  ];
  for (const id of ids) assert.equal(countElementId(htmlSource, id), 1, id + ' exists exactly once');

  assert.match(htmlSource, /<button\s+id="skopeoToggle"[^>]*\btype="button"[^>]*\brole="switch"/s, 'switch is a native button');
  assert.match(htmlSource, /id="skopeoToggle"[^>]*\baria-checked="false"/s, 'switch starts unchecked');
  assert.match(htmlSource, /id="skopeoToggle"[^>]*\baria-label="Skopeo for this tab"/s, 'switch has the exact accessible name');
  assert.match(
    htmlSource,
    /id="skopeoToggle"[^>]*\baria-describedby="skopeoStatus skopeoStatusBody skopeoHint"/s,
    'switch references status, body, and shortcut descriptions'
  );
  assert.match(htmlSource, /id="skopeoControl"[^>]*\baria-live="off"[^>]*\baria-atomic="true"/s, 'initial Off row is atomic but silent');
  assert.match(htmlSource, /id="skopeoControl"[^>]*\baria-busy="false"/s, 'row starts non-busy');
  assert.match(htmlSource, /id="skopeoStatusBody"[^>]*\bhidden\b/s, 'optional status explanation starts absent');
  assert.match(htmlSource, /id="skopeoTitle"[^>]*>\s*Skopeo\s*</s, 'initial title copy is exact');
  assert.match(htmlSource, /id="skopeoStatus"[^>]*>\s*Off for this tab\s*</s, 'initial Off copy is exact');
  assert.match(htmlSource, /id="skopeoAction"[^>]*>\s*Turn on Skopeo\s*</s, 'initial action copy is exact');
  assert.doesNotMatch(htmlSource, /<input[^>]*type="checkbox"[^>]*skopeo/i, 'Skopeo is not a generic checkbox');

  const start = cssSource.indexOf('/* FSB_SKOPEO_ROW_START */');
  const end = cssSource.indexOf('/* FSB_SKOPEO_ROW_END */');
  assert.ok(start !== -1 && end > start, 'Skopeo row CSS has a bounded contract block');
  const css = cssSource.slice(start, end);
  assert.match(css, /\.skopeo-control-row\s*\{[^}]*min-height:\s*64px;[^}]*padding:\s*8px 16px;[^}]*gap:\s*8px;[^}]*border:\s*1px solid var\(--border-color\);[^}]*border-radius:\s*12px;/s, 'row geometry uses exact UI-SPEC values');
  assert.match(css, /\.skopeo-toggle\s*\{[^}]*width:\s*44px;[^}]*height:\s*40px;/s, 'switch target is exactly 44x40');
  assert.match(css, /\.skopeo-switch-track\s*\{[^}]*width:\s*40px;[^}]*height:\s*24px;/s, 'visible track is exactly 40x24');
  assert.match(css, /\.skopeo-switch-thumb\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;[^}]*top:\s*4px;[^}]*left:\s*4px;/s, 'thumb is 16px with a 4px inset');
  assert.match(css, /\.skopeo-toggle\[aria-checked="true"\][\s\S]*#ff6b35/i, 'orange is reserved for the checked signal');
  assert.match(css, /\.skopeo-toggle:focus-visible\s*\{[^}]*outline:\s*2px solid #ff6b35;[^}]*outline-offset:\s*2px;/s, 'focus-visible outline is exact and unclipped');
  assert.match(css, /\.skopeo-control-hint:disabled[\s\S]*cursor:\s*default;/, 'Active kill guidance has no shortcut-link cursor');
  assert.match(css, /\[data-theme="dark"\]\s+\.skopeo-control-row/, 'row inherits an explicit dark-theme surface');
  for (const state of ['starting', 'active', 'unsupported', 'error']) {
    assert.match(css, new RegExp('\\.skopeo-control-row\\[data-state="' + state + '"\\]'), state + ' has a semantic style hook');
  }
  assert.match(css, /@media\s*\(max-width:\s*350px\)[\s\S]*\.skopeo-control-row[\s\S]*max-width:\s*calc\(100% - 32px\)/, 'narrow row cannot create horizontal overflow');
  assert.match(css, /@media\s*\(forced-colors:\s*active\)[\s\S]*Canvas[\s\S]*CanvasText[\s\S]*ButtonFace[\s\S]*ButtonText[\s\S]*Highlight/, 'forced colors use system tokens');
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*transition-duration:\s*0ms/, 'reduced motion removes row transitions');

  const sizes = Array.from(css.matchAll(/font-size:\s*(\d+)px/g), (match) => Number(match[1]));
  assert.ok(sizes.length >= 3, 'row declares its type roles');
  assert.ok(sizes.every((size) => [11, 12, 14, 16].includes(size)), 'row uses only approved font sizes');
  const weights = Array.from(css.matchAll(/font-weight:\s*(\d+)/g), (match) => Number(match[1]));
  assert.ok(weights.length > 0 && weights.every((weight) => weight === 400 || weight === 700), 'row uses only approved font weights');
}

async function assertSidepanelStateController(sidepanelSource) {
  const dom = createSidepanelDomHarness();
  const chromeHarness = createSidepanelChromeHarness();
  const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
  const controller = booted.controller;

  assert.doesNotMatch(booted.source, /\.innerHTML\s*=/, 'controller never writes message-provided markup');
  assert.match(booted.source, /skopeo:get-status/);
  assert.match(booted.source, /skopeo:toggle-tab/);

  assert.equal(controller.renderSkopeoState(22, { status: 'active' }), false, 'wrong-tab renderer exits before DOM writes');
  assert.equal(
    controller.renderSkopeoState(11, { tabId: 22, status: 'active' }),
    false,
    'response tab ID must match the captured request tab'
  );
  assert.equal(dom.status.textContent, 'Off for this tab');

  assert.equal(controller.renderSkopeoState(11, { success: true, tabId: 11, status: 'off' }), true);
  assert.equal(dom.row.dataset.state, 'off');
  assert.equal(dom.row.getAttribute('aria-live'), 'off', 'Off remains silent');
  assert.equal(dom.row.getAttribute('aria-busy'), 'false');
  assert.equal(dom.toggle.getAttribute('aria-checked'), 'false');
  assert.equal(dom.toggle.disabled, false);
  assert.equal(dom.status.textContent, 'Off for this tab');
  assert.equal(dom.body.hidden, true);
  assert.equal(dom.action.hidden, false);
  assert.equal(dom.action.textContent, 'Turn on Skopeo');

  dom.toggle.focus();
  assert.equal(controller.renderSkopeoState(11, { success: true, tabId: 11, status: 'starting' }), true);
  assert.equal(dom.row.dataset.state, 'starting');
  assert.equal(dom.row.getAttribute('aria-live'), 'polite');
  assert.equal(dom.row.getAttribute('aria-busy'), 'true');
  assert.equal(dom.toggle.getAttribute('aria-checked'), 'true');
  assert.equal(dom.toggle.disabled, false, 'Starting remains cancellable');
  assert.equal(dom.status.textContent, 'Starting on this tab\u2026');
  assert.equal(dom.action.textContent, 'Turn off Skopeo');
  assert.equal(dom.document.activeElement, dom.toggle, 'Starting render retains switch focus');

  chromeHarness.setRuntimeResponder(async (message) => ({
    success: true,
    tabId: message.tabId,
    generation: 1,
    status: 'off'
  }));
  await controller.handleSkopeoToggle();
  assert.deepEqual(chromeHarness.messages.at(-1), { action: 'skopeo:toggle-tab', tabId: 11 });
  assert.equal(dom.row.dataset.state, 'off', 'Starting toggle renders terminal Off acknowledgment');
  assert.equal(dom.document.activeElement, dom.toggle, 'cancellation acknowledgment retains switch focus');

  controller.renderSkopeoState(11, { success: true, tabId: 11, status: 'active', attention: 'ambient' });
  assert.equal(dom.row.dataset.state, 'active');
  assert.equal(dom.toggle.getAttribute('aria-checked'), 'true');
  assert.equal(dom.toggle.disabled, false);
  assert.equal(dom.row.getAttribute('aria-busy'), 'false');
  assert.equal(dom.status.textContent, 'On \u00b7 Ambient');
  assert.equal(dom.action.textContent, 'Turn off Skopeo');
  assert.equal(dom.hint.textContent, 'Esc Esc: turn off Skopeo in this tab');
  assert.equal(dom.hint.disabled, true, 'Active kill guidance is not a shortcut-settings button');
  assert.equal(dom.hint.tabIndex, -1, 'Active kill guidance is not focusable');
  assert.equal(dom.hint.getAttribute('aria-label'), 'Esc Esc: turn off Skopeo in this tab');
  await dom.hint.dispatch('click');
  assert.equal(chromeHarness.createdTabs.length, 0, 'Active kill guidance refuses shortcut navigation');
  await controller.handleSkopeoToggle();
  assert.deepEqual(chromeHarness.messages.at(-1), { action: 'skopeo:toggle-tab', tabId: 11 });
  assert.equal(dom.row.dataset.state, 'off', 'Active toggle is an immediate kill request');
  assert.equal(dom.hint.disabled, false, 'shortcut action is restored outside Active');
  assert.equal(dom.hint.tabIndex, 0);
  assert.equal(dom.hint.getAttribute('aria-label'), 'Open Chrome shortcut settings');

  controller.renderSkopeoState(11, {
    success: false,
    tabId: 11,
    status: 'unsupported',
    code: 'SKOPEO_UNSUPPORTED_TAB',
    message: '<img src=x onerror=alert(1)>'
  });
  assert.equal(dom.row.dataset.state, 'unsupported');
  assert.equal(dom.toggle.getAttribute('aria-checked'), 'false');
  assert.equal(dom.toggle.disabled, true);
  assert.equal(dom.status.textContent, 'Skopeo can\u2019t run on this page.');
  assert.equal(dom.body.textContent, 'Open a standard web page, then try again.');
  assert.equal(dom.body.hidden, false);
  assert.equal(dom.action.hidden, true, 'unsupported state presents no active/retry switch action');

  controller.renderSkopeoState(11, {
    success: false,
    tabId: 11,
    status: 'error',
    code: 'SKOPEO_START_FAILED',
    message: '<script>bad()</script>'
  });
  assert.equal(dom.row.dataset.state, 'error');
  assert.equal(dom.toggle.getAttribute('aria-checked'), 'false');
  assert.equal(dom.toggle.disabled, false);
  assert.equal(dom.status.textContent, 'Skopeo didn\u2019t start.');
  assert.equal(dom.body.textContent, 'Nothing was added to the page. Try again.');
  assert.equal(dom.action.hidden, false);
  assert.equal(dom.action.textContent, 'Try again');
  assert.equal(dom.hint.disabled, false, 'Error restores the shortcut-settings action');
  assert.equal(dom.hint.tabIndex, 0);
  assert.equal(dom.hint.getAttribute('aria-label'), 'Open Chrome shortcut settings');
  assert.equal(dom.hint.getAttribute('aria-disabled'), null);

  controller.renderSkopeoState(11, {
    success: false,
    tabId: 11,
    status: 'error',
    code: 'SKOPEO_UNSAFE_LAYOUT',
    message: '<b>untrusted</b>'
  });
  assert.equal(dom.status.textContent, 'Skopeo can\u2019t open safely on this layout.');
  assert.equal(dom.body.textContent, 'Zoom out or resize the page, then try again.');
  assert.equal(dom.action.textContent, 'Try again');
  assert.equal(dom.writeLog.every((write) => write.property === 'textContent'), true, 'all variable copy uses textContent');

  controller.renderSkopeoState(11, { success: true, tabId: 11, status: 'off' });
  chromeHarness.setRuntimeResponder(async () => ({
    success: true,
    tabId: 22,
    generation: 4,
    status: 'active',
    attention: 'ambient'
  }));
  assert.equal(await controller.refreshSkopeoControl(11), false, 'get-status rejects a mismatched response tab ID');
  assert.equal(dom.row.dataset.state, 'off', 'mismatched get-status response cannot present another tab');

  assert.equal(await controller.handleSkopeoToggle(), false, 'toggle rejects a mismatched response tab ID');
  assert.equal(dom.row.dataset.state, 'starting', 'mismatched toggle response cannot present another tab as Active');

  chromeHarness.setRuntimeResponder(async (message) => ({
    success: true,
    tabId: message.tabId,
    generation: 4,
    status: 'active',
    attention: 'ambient'
  }));
  await controller.refreshSkopeoControl(11);
  assert.deepEqual(chromeHarness.messages.at(-1), { action: 'skopeo:get-status', tabId: 11 });
  assert.equal(chromeHarness.queryCalls.length, 0, 'controller never performs a second active-tab query');

  chromeHarness.setCommandRows([{ name: COMMAND, shortcut: 'Alt+Space' }]);
  await controller.refreshSkopeoShortcut(11);
  assert.equal(dom.hint.textContent, 'Esc Esc: turn off Skopeo in this tab', 'Active kill guidance outranks shortcut metadata');
  controller.renderSkopeoState(11, { success: true, tabId: 11, status: 'off' });
  assert.equal(dom.hint.textContent, 'Shortcut: \u2325 Space \u00b7 Change shortcut');

  chromeHarness.setCommandRows([{ name: COMMAND, shortcut: 'Command+Shift+Y' }]);
  await controller.refreshSkopeoShortcut(11);
  assert.equal(dom.hint.textContent, 'Shortcut: Command Shift Y \u00b7 Change shortcut');
  chromeHarness.setCommandRows([
    { name: 'unrelated-command', shortcut: 'Ctrl+K' },
    { name: COMMAND, shortcut: '' }
  ]);
  await controller.refreshSkopeoShortcut(11);
  assert.equal(dom.hint.textContent, 'Shortcut not assigned \u00b7 Set in Chrome shortcuts');
  assert.equal(chromeHarness.commandCalls.length, 3, 'shortcut state is read from Chrome each refresh');

  assert.equal(chromeHarness.createdTabs.length, 0, 'shortcut page does not open without a deliberate click');
  await dom.hint.dispatch('click');
  assert.deepEqual(chromeHarness.createdTabs, [{ url: 'chrome://extensions/shortcuts' }]);

  controller.renderSkopeoState(11, { success: true, tabId: 11, status: 'off' });
  chromeHarness.runtimeOnMessage.emit({ action: 'skopeo:status-changed', tabId: 22, status: 'active' });
  assert.equal(dom.row.dataset.state, 'off', 'wrong-tab status event is ignored');
  chromeHarness.runtimeOnMessage.emit({
    action: 'skopeo:status-changed',
    tabId: 11,
    generation: 4,
    status: 'active',
    attention: 'ambient'
  });
  assert.equal(dom.row.dataset.state, 'active', 'selected-tab status event renders through the real handler');

  assert.equal(dom.chatInput.textContent, 'keep this draft');
  assert.equal(dom.chatInput.getAttribute('contenteditable'), 'true');
  assert.equal(dom.sendBtn.disabled, false);
  assert.equal(dom.chatMessages.textContent, 'existing chat');
}

async function assertSidepanelRaceIntegration(sidepanelSource) {
  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    const tabAStatus = createDeferred();
    const tabBStatus = createDeferred();
    chromeHarness.setRuntimeResponder((message) => {
      if (message.action === 'skopeo:get-status' && message.tabId === 11) return tabAStatus.promise;
      if (message.action === 'skopeo:get-status' && message.tabId === 22) return tabBStatus.promise;
      if (message.action === 'skopeo:toggle-tab') {
        return Promise.resolve({ success: true, tabId: message.tabId, generation: 4, status: 'off' });
      }
      return Promise.resolve({ success: false, tabId: message.tabId, status: 'error' });
    });

    dom.toggle.focus();
    const pendingTabA = controller.refreshSkopeoControl(11);
    await Promise.resolve();
    const pendingTabB = controller.activateTab(22);
    assert.equal(booted.sandbox._activeTabIdSnapshot, 22, 'tab activation changes authority before awaiting status');
    assert.equal(dom.row.dataset.state, 'loading', 'tab activation synchronously clears outgoing visual state');
    assert.equal(dom.status.textContent, '', 'neutral loading snapshot contains no outgoing-tab status');
    assert.equal(dom.toggle.getAttribute('aria-checked'), 'false');
    assert.equal(dom.toggle.disabled, true);
    assert.equal(dom.document.activeElement, dom.toggle, 'tab refresh does not move side-panel focus');

    tabBStatus.resolve({ success: true, tabId: 22, generation: 4, status: 'active', attention: 'ambient' });
    await pendingTabB;
    assert.equal(dom.row.dataset.state, 'active');
    assert.equal(dom.status.textContent, 'On \u00b7 Ambient');
    assert.equal(dom.document.activeElement, dom.toggle, 'Active response retains switch focus');

    const writesBeforeLateA = dom.writeLog.length;
    tabAStatus.resolve({ success: true, tabId: 11, generation: 7, status: 'active', attention: 'ambient' });
    assert.equal(await pendingTabA, false, 'late Tab A success is rejected after Tab B selection');
    chromeHarness.runtimeOnMessage.emit({
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 7,
      status: 'error',
      code: 'SKOPEO_START_FAILED'
    });
    assert.equal(dom.writeLog.length, writesBeforeLateA, 'late Tab A response/event performs no DOM text write');
    assert.equal(dom.row.dataset.state, 'active');
    assert.equal(dom.status.textContent, 'On \u00b7 Ambient');

    const writesBeforeEquivalent = dom.writeLog.length;
    chromeHarness.runtimeOnMessage.emit({
      action: 'skopeo:status-changed',
      tabId: 22,
      generation: 4,
      status: 'active',
      attention: 'ambient'
    });
    assert.equal(dom.writeLog.length, writesBeforeEquivalent, 'equivalent selected-tab live copy is coalesced');

    await controller.handleSkopeoToggle();
    const toggleMessages = chromeHarness.messages.filter((message) => message.action === 'skopeo:toggle-tab');
    assert.deepEqual(toggleMessages.at(-1), { action: 'skopeo:toggle-tab', tabId: 22 });
    assert.equal(dom.row.dataset.state, 'off');
    assert.equal(dom.document.activeElement, dom.toggle, 'terminal Off acknowledgment retains switch focus');
  }

  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    const tabAStatus = createDeferred();
    const tabBStatus = createDeferred();
    chromeHarness.setRuntimeResponder((message) => {
      if (message.action === 'skopeo:get-status' && message.tabId === 11) return tabAStatus.promise;
      if (message.action === 'skopeo:get-status' && message.tabId === 22) return tabBStatus.promise;
      return Promise.resolve({ success: true, tabId: message.tabId, status: 'off' });
    });

    dom.chatInput.focus();
    const pendingTabA = controller.refreshSkopeoControl(11);
    await Promise.resolve();
    const pendingTabB = controller.activateTab(22);
    assert.equal(dom.document.activeElement, dom.chatInput, 'tab switch never forces focus away from an unrelated side-panel control');
    tabBStatus.resolve({ success: true, tabId: 22, generation: 9, status: 'active', attention: 'ambient' });
    await pendingTabB;
    assert.equal(dom.row.dataset.state, 'active');
    assert.equal(dom.status.textContent, 'On \u00b7 Ambient');
    tabAStatus.reject(new Error('Tab A status channel closed'));
    assert.equal(await pendingTabA, false, 'late rejected Tab A request exits silently after Tab B selection');
    assert.equal(dom.row.dataset.state, 'active', 'late Tab A rejection cannot paint Error on Tab B');
    assert.equal(dom.status.textContent, 'On \u00b7 Ambient');
    assert.equal(dom.document.activeElement, dom.chatInput, 'late rejection does not move focus');
    assert.equal(dom.chatInput.textContent, 'keep this draft');
    assert.equal(dom.chatMessages.textContent, 'existing chat');
  }
}

async function assertStatusNotificationResponseContract(backgroundSource, sidepanelSource) {
  const dom = createSidepanelDomHarness();
  const sidepanelChrome = createSidepanelChromeHarness();
  bootSidepanelController(sidepanelSource, dom, sidepanelChrome, 11);
  const backgroundHarness = createChromeHarness({
    runtimeBroadcastEvent: sidepanelChrome.runtimeOnMessage
  });
  const controller = bootProductionController(backgroundSource, backgroundHarness);
  await controller.ready;

  const pendingStart = controller.toggleTab(11);
  const outcome = await Promise.race([
    pendingStart.then((response) => ({ settled: true, response })),
    new Promise((resolve) => setImmediate(() => resolve({ settled: false })))
  ]);

  assert.equal(outcome.settled, true, 'Starting notification does not claim an unanswered async response');
  assert.equal(outcome.response.status, 'starting', 'startup settles after the accepted notification');
  assert.equal(dom.row.dataset.state, 'starting', 'the open side panel still renders the notification');
  assert.equal(backgroundHarness.executeCalls.length, 1, 'startup proceeds from broadcast to injection');
  assert.equal(
    backgroundHarness.tabMessages.some((entry) => entry.message.action === 'skopeo:prepare'),
    true,
    'startup proceeds from broadcast through runtime prepare'
  );
}

async function assertGenerationZeroBaselineRecovery(backgroundSource, sidepanelSource) {
  const dom = createSidepanelDomHarness();
  const sidepanelChrome = createSidepanelChromeHarness();
  const booted = bootSidepanelController(sidepanelSource, dom, sidepanelChrome, 11);
  const sidepanelController = booted.controller;
  const backgroundHarness = createChromeHarness({
    runtimeBroadcastEvent: sidepanelChrome.runtimeOnMessage
  });
  const backgroundController = bootProductionController(backgroundSource, backgroundHarness);
  await backgroundController.ready;

  const heldBaselineGate = createDeferred();
  let statusRequestCount = 0;
  let heldBaselineResponse = null;
  sidepanelChrome.setRuntimeResponder(async (message) => {
    if (message.action === 'skopeo:get-status') {
      statusRequestCount += 1;
      const response = await backgroundController.getStatus(message.tabId);
      if (statusRequestCount === 1) {
        heldBaselineResponse = clone(response);
        await heldBaselineGate.promise;
      }
      return response;
    }
    if (message.action === 'skopeo:toggle-tab') {
      return backgroundController.toggleTab(message.tabId);
    }
    throw new Error('unexpected side-panel runtime request: ' + String(message.action));
  });

  assert.deepEqual(invokeSidepanelStatusHandler(sidepanelController, {
    action: 'skopeo:status-changed',
    tabId: 11,
    generation: 5,
    status: 'off'
  }), [true], 'generation 5 establishes the panel ordering floor before worker state is lost');
  assert.deepEqual(readGenerationFloors(booted), [[11, 5]]);
  assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 5, stage: 3 }]]);

  const staleRefresh = sidepanelController.refreshSkopeoControl(11);
  await backgroundHarness.flush();
  assert.deepEqual(
    heldBaselineResponse,
    { success: true, tabId: 11, generation: 0, status: 'off' },
    'held status response comes from the production missing-record path'
  );

  assert.equal(
    await sidepanelController.refreshSkopeoControl(11),
    true,
    'current production generation-0 Off response renders the missing-record baseline'
  );
  assert.equal(dom.row.dataset.state, 'off');
  assert.equal(dom.row.getAttribute('aria-busy'), 'false');
  assert.deepEqual(readGenerationFloors(booted), [], 'generation-0 Off clears the prior generation floor');
  assert.deepEqual(
    readLifecyclePresentations(booted),
    [],
    'generation-0 Off clears the prior lifecycle presentation'
  );

  assert.equal(
    await sidepanelController.handleSkopeoToggle(),
    false,
    'production Starting notification owns presentation before the matching toggle response settles'
  );
  const starting = storageRecord(backgroundHarness, 11);
  assert.equal(starting.generation, 1, 'production missing-record startup begins a new generation-1 epoch');
  assert.equal(starting.status, 'starting');
  assert.equal(dom.row.dataset.state, 'starting');
  assert.equal(dom.row.getAttribute('aria-busy'), 'true');
  assert.deepEqual(readGenerationFloors(booted), [[11, 1]]);
  assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 1, stage: 1 }]]);

  const sender = { id: backgroundHarness.chrome.runtime.id, tab: { id: 11 } };
  await backgroundController.handleContentMessage(
    { action: 'skopeo:prepared', generation: 1, placement: 'full' },
    sender
  );
  await backgroundController.handleContentMessage(readyMessage(1), sender);
  assert.equal(dom.row.dataset.state, 'active', 'generation-1 Active notification completes the new epoch');
  assert.equal(dom.row.getAttribute('aria-busy'), 'false');
  assert.equal(dom.toggle.getAttribute('aria-checked'), 'true');
  assert.deepEqual(readGenerationFloors(booted), [[11, 1]]);
  assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 1, stage: 2 }]]);

  const activePresentation = captureSidepanelPresentation(booted, dom, { authority: true });
  heldBaselineGate.resolve();
  assert.equal(await staleRefresh, false, 'held generation-0 response cannot reset a newer presentation');
  assert.deepEqual(
    captureSidepanelPresentation(booted, dom, { authority: true }),
    activePresentation,
    'stale held baseline response is mutation-free'
  );

  assert.deepEqual(invokeSidepanelStatusHandler(sidepanelController, {
    action: 'skopeo:status-changed',
    tabId: 11,
    generation: 0,
    status: 'off'
  }), [false], 'delayed generation-0 live event cannot reset current generation authority');
  assert.deepEqual(
    captureSidepanelPresentation(booted, dom, { authority: true }),
    activePresentation,
    'delayed generation-0 live event is mutation-free'
  );
}

function captureSidepanelPresentation(booted, dom, options = {}) {
  const snapshot = {
    mutationCount: dom.mutationLog.length,
    mutations: clone(dom.mutationLog),
    textWrites: clone(dom.writeLog),
    rowState: dom.row.dataset.state,
    rowLive: dom.row.getAttribute('aria-live'),
    rowBusy: dom.row.getAttribute('aria-busy'),
    status: dom.status.textContent,
    body: dom.body.textContent,
    bodyHidden: dom.body.hidden,
    action: dom.action.textContent,
    actionHidden: dom.action.hidden,
    hint: dom.hint.textContent,
    hintDisabled: dom.hint.disabled,
    hintTabIndex: dom.hint.tabIndex,
    toggleChecked: dom.toggle.getAttribute('aria-checked'),
    toggleDisabled: dom.toggle.disabled,
    toggleAriaDisabled: dom.toggle.getAttribute('aria-disabled'),
    activeTabId: booted.sandbox._activeTabIdSnapshot,
    focusId: dom.document.activeElement && dom.document.activeElement.id,
    chatInput: dom.chatInput.textContent,
    chatMessages: dom.chatMessages.textContent
  };
  if (options.authority === true) {
    snapshot.authority = clone(booted.sandbox.__readSkopeoControllerAuthority());
  }
  return snapshot;
}

async function assertLifecyclePresentationAuthority(sidepanelSource) {
  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    const heldToggle = createDeferred();
    chromeHarness.setRuntimeResponder((message) => {
      if (message.action === 'skopeo:toggle-tab') return heldToggle.promise;
      return Promise.resolve({ success: true, tabId: message.tabId, generation: 1, status: 'off' });
    });

    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 1,
      status: 'off'
    }), [true], 'generation 1 Off establishes the selected-tab lifecycle');
    dom.toggle.focus();
    const pendingToggle = controller.handleSkopeoToggle();
    await Promise.resolve();
    assert.equal(dom.row.dataset.state, 'starting', 'toggle paints only its local optimistic Starting state');
    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 2,
      status: 'active',
      attention: 'ambient'
    }), [true], 'live Active event owns generation 2 presentation');
    const beforeLateStarting = captureSidepanelPresentation(booted, dom, { authority: true });
    assert.equal(
      chromeHarness.messages.filter((message) => message.action === 'skopeo:toggle-tab').length,
      1,
      'toggle side effect is dispatched exactly once before its response settles'
    );

    heldToggle.resolve({ success: true, tabId: 11, generation: 2, status: 'starting' });
    assert.equal(await pendingToggle, false, 'older equal-generation Starting response returns false');
    assert.deepEqual(
      captureSidepanelPresentation(booted, dom, { authority: true }),
      beforeLateStarting,
      'live Active event makes the older Starting completion perform zero presentation or authority writes'
    );
    assert.equal(
      chromeHarness.messages.filter((message) => message.action === 'skopeo:toggle-tab').length,
      1,
      'rejecting the late response never repeats the toggle side effect'
    );
  }

  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    const heldStatus = createDeferred();
    chromeHarness.setRuntimeResponder((message) => {
      if (message.action === 'skopeo:get-status') return heldStatus.promise;
      return Promise.resolve({ success: true, tabId: message.tabId, generation: 2, status: 'off' });
    });

    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 2,
      status: 'starting'
    }), [true]);
    const pendingStatus = controller.refreshSkopeoControl(11);
    await Promise.resolve();
    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 2,
      status: 'off'
    }), [true], 'live Off event supersedes an older held status response');
    const beforeLateActive = captureSidepanelPresentation(booted, dom, { authority: true });
    heldStatus.resolve({
      success: true,
      tabId: 11,
      generation: 2,
      status: 'active',
      attention: 'ambient'
    });
    assert.equal(await pendingStatus, false, 'older equal-generation Active status response returns false');
    assert.deepEqual(
      captureSidepanelPresentation(booted, dom, { authority: true }),
      beforeLateActive,
      'live Off event makes the older Active status completion perform zero writes'
    );
  }

  for (const lateStatus of ['active', 'starting']) {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    const heldToggle = createDeferred();
    chromeHarness.setRuntimeResponder((message) => {
      if (message.action === 'skopeo:toggle-tab') return heldToggle.promise;
      return Promise.resolve({ success: true, tabId: message.tabId, generation: 1, status: 'off' });
    });

    const initialStatus = lateStatus === 'active' ? 'active' : 'off';
    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 2,
      status: initialStatus,
      ...(initialStatus === 'active' ? { attention: 'ambient' } : {})
    }), [true]);
    dom.toggle.focus();
    const pendingToggle = controller.handleSkopeoToggle();
    await Promise.resolve();
    const terminalGeneration = lateStatus === 'active' ? 2 : 3;
    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: terminalGeneration,
      status: 'off'
    }), [true], 'live Off event owns the terminal presentation before late ' + lateStatus);
    const beforeLateResponse = captureSidepanelPresentation(booted, dom, { authority: true });
    heldToggle.resolve({
      success: true,
      tabId: 11,
      generation: terminalGeneration,
      status: lateStatus,
      ...(lateStatus === 'active' ? { attention: 'ambient' } : {})
    });
    assert.equal(await pendingToggle, false, 'older ' + lateStatus + ' toggle response returns false after live Off');
    assert.deepEqual(
      captureSidepanelPresentation(booted, dom, { authority: true }),
      beforeLateResponse,
      'live Off event makes the older ' + lateStatus + ' toggle completion perform zero writes'
    );
    assert.equal(
      chromeHarness.messages.filter((message) => message.action === 'skopeo:toggle-tab').length,
      1,
      'late ' + lateStatus + ' rejection preserves exactly one toggle side effect'
    );
  }

  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    const heldStatus = createDeferred();
    chromeHarness.setRuntimeResponder((message) => {
      if (message.action === 'skopeo:get-status') return heldStatus.promise;
      return Promise.resolve({ success: true, tabId: message.tabId, generation: 1, status: 'off' });
    });
    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 2,
      status: 'active',
      attention: 'ambient'
    }), [true]);
    const pendingStatus = controller.refreshSkopeoControl(11);
    await Promise.resolve();
    const beforeRejected = captureSidepanelPresentation(booted, dom, { authority: true });
    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 1,
      status: 'off'
    }), [false], 'rejected live event is presentation-neutral');
    assert.deepEqual(
      captureSidepanelPresentation(booted, dom, { authority: true }),
      beforeRejected,
      'rejected live event does not claim status-lane or presentation authority'
    );
    heldStatus.resolve({
      success: true,
      tabId: 11,
      generation: 2,
      status: 'active',
      attention: 'ambient'
    });
    assert.equal(await pendingStatus, true, 'pending valid status response survives a rejected event');

    const authorityBeforeDuplicate = clone(booted.sandbox.__readSkopeoControllerAuthority());
    const writesBeforeDuplicate = dom.writeLog.length;
    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 2,
      status: 'active',
      attention: 'ambient'
    }), [true], 'equal-generation duplicate remains admissible');
    const authorityAfterDuplicate = clone(booted.sandbox.__readSkopeoControllerAuthority());
    assert.ok(
      authorityAfterDuplicate.presentationSerial > authorityBeforeDuplicate.presentationSerial,
      'accepted duplicate live event claims newer shared presentation authority'
    );
    assert.equal(dom.writeLog.length, writesBeforeDuplicate, 'duplicate live event repeats no atomic text/live copy');
  }

  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    const heldShortcut = createDeferred();
    chromeHarness.setCommandResponder(() => heldShortcut.promise);
    const pendingShortcut = booted.controller.refreshSkopeoShortcut(11);
    await Promise.resolve();
    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 1,
      status: 'active',
      attention: 'ambient'
    }), [true]);
    heldShortcut.resolve([{ name: COMMAND, shortcut: 'Ctrl+Shift+9' }]);
    assert.equal(
      await pendingShortcut,
      'Shortcut: Ctrl Shift 9 \u00b7 Change shortcut',
      'accepted lifecycle presentation does not invalidate independent shortcut work'
    );
    assert.equal(
      booted.sandbox.__readSkopeoControllerAuthority().shortcutHint,
      'Shortcut: Ctrl Shift 9 \u00b7 Change shortcut'
    );
  }

  const controllerSource = extractSidepanelControllerSource(sidepanelSource);
  for (const declaration of [
    'var _presentationSerial = 0;',
    'var _latestPresentation = null;'
  ]) {
    assert.equal(controllerSource.split(declaration).length - 1, 1, declaration + ' exists exactly once');
  }
  assert.equal((controllerSource.match(/function\s+claimPresentation\b/g) || []).length, 1);
  assert.equal((controllerSource.match(/function\s+presentationIsCurrent\b/g) || []).length, 1);
  assert.doesNotMatch(controllerSource, /chrome\.tabs\.query\s*\(/, 'presentation repair adds no tab query');
}

async function assertSameTabABAAuthority(sidepanelSource) {
  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    const a1Status = createDeferred();
    const tabBStatus = createDeferred();
    const a2Status = createDeferred();
    let tabARequests = 0;
    chromeHarness.setRuntimeResponder((message) => {
      if (message.action !== 'skopeo:get-status') {
        return Promise.resolve({ success: true, tabId: message.tabId, generation: 2, status: 'off' });
      }
      if (message.tabId === 22) return tabBStatus.promise;
      tabARequests += 1;
      return tabARequests === 1 ? a1Status.promise : a2Status.promise;
    });

    dom.toggle.focus();
    const pendingA1 = controller.activateTab(11);
    const pendingB = controller.activateTab(22);
    const pendingA2 = controller.activateTab(11);
    assert.deepEqual(
      chromeHarness.messages.filter((message) => message.action === 'skopeo:get-status'),
      [
        { action: 'skopeo:get-status', tabId: 11 },
        { action: 'skopeo:get-status', tabId: 22 },
        { action: 'skopeo:get-status', tabId: 11 }
      ],
      'A1 -> B -> A2 starts one explicit status request per activation before settlement'
    );
    tabBStatus.resolve({ success: true, tabId: 22, generation: 1, status: 'off' });
    await pendingB;
    a2Status.resolve({ success: true, tabId: 11, generation: 2, status: 'active', attention: 'ambient' });
    await pendingA2;
    const beforeLateA1 = captureSidepanelPresentation(booted, dom);

    a1Status.resolve({ success: true, tabId: 11, generation: 1, status: 'off' });
    const a1Result = await pendingA1;
    assert.deepEqual(
      captureSidepanelPresentation(booted, dom),
      beforeLateA1,
      'late A1 status success performs zero writes after A2 commits'
    );
    assert.equal(a1Result[0].status, 'fulfilled');
    assert.equal(a1Result[0].value, false, 'late A1 status success returns false');
  }

  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    const a1Status = createDeferred();
    const tabBStatus = createDeferred();
    const a2Status = createDeferred();
    let tabARequests = 0;
    chromeHarness.setRuntimeResponder((message) => {
      if (message.action !== 'skopeo:get-status') {
        return Promise.resolve({ success: true, tabId: message.tabId, generation: 2, status: 'off' });
      }
      if (message.tabId === 22) return tabBStatus.promise;
      tabARequests += 1;
      return tabARequests === 1 ? a1Status.promise : a2Status.promise;
    });

    dom.chatInput.focus();
    const pendingA1 = controller.activateTab(11);
    const pendingB = controller.activateTab(22);
    const pendingA2 = controller.activateTab(11);
    tabBStatus.resolve({ success: true, tabId: 22, generation: 1, status: 'off' });
    await pendingB;
    a2Status.resolve({ success: true, tabId: 11, generation: 2, status: 'active', attention: 'ambient' });
    await pendingA2;
    const beforeLateA1 = captureSidepanelPresentation(booted, dom);

    a1Status.reject(new Error('A1 status channel closed'));
    const a1Result = await pendingA1;
    assert.deepEqual(
      captureSidepanelPresentation(booted, dom),
      beforeLateA1,
      'late A1 status rejection performs zero writes after A2 commits'
    );
    assert.equal(a1Result[0].status, 'fulfilled');
    assert.equal(a1Result[0].value, false, 'late A1 status rejection returns false');
  }

  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    const a1Status = createDeferred();
    const tabBStatus = createDeferred();
    const a2Status = createDeferred();
    const a1Toggle = createDeferred();
    let tabARequests = 0;
    chromeHarness.setRuntimeResponder((message) => {
      if (message.action === 'skopeo:toggle-tab') return a1Toggle.promise;
      if (message.tabId === 22) return tabBStatus.promise;
      tabARequests += 1;
      return tabARequests === 1 ? a1Status.promise : a2Status.promise;
    });

    dom.toggle.focus();
    controller.activateTab(11);
    controller.renderSkopeoState(11, { success: true, tabId: 11, generation: 1, status: 'off' });
    const pendingToggle = controller.handleSkopeoToggle();
    const pendingB = controller.activateTab(22);
    const pendingA2 = controller.activateTab(11);
    tabBStatus.resolve({ success: true, tabId: 22, generation: 1, status: 'off' });
    await pendingB;
    a2Status.resolve({ success: true, tabId: 11, generation: 2, status: 'active', attention: 'ambient' });
    await pendingA2;
    const beforeLateA1 = captureSidepanelPresentation(booted, dom);
    assert.deepEqual(
      chromeHarness.messages.filter((message) => message.action === 'skopeo:toggle-tab'),
      [{ action: 'skopeo:toggle-tab', tabId: 11 }],
      'A1 toggle sends its original explicit side effect exactly once'
    );

    a1Toggle.resolve({ success: true, tabId: 11, generation: 1, status: 'off' });
    assert.equal(await pendingToggle, false, 'late A1 toggle response returns false');
    assert.deepEqual(
      captureSidepanelPresentation(booted, dom),
      beforeLateA1,
      'late A1 toggle response performs zero writes after A2 commits'
    );
    assert.equal(
      chromeHarness.messages.filter((message) => message.action === 'skopeo:toggle-tab').length,
      1,
      'rejecting the late toggle response never repeats the A1 side effect'
    );
  }

  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    const a1Status = createDeferred();
    const tabBStatus = createDeferred();
    const a2Status = createDeferred();
    const a1Shortcut = createDeferred();
    const a2Shortcut = createDeferred();
    let tabARequests = 0;
    let shortcutRequests = 0;
    chromeHarness.setRuntimeResponder((message) => {
      if (message.tabId === 22) return tabBStatus.promise;
      tabARequests += 1;
      return tabARequests === 1 ? a1Status.promise : a2Status.promise;
    });
    chromeHarness.setCommandResponder(() => {
      shortcutRequests += 1;
      if (shortcutRequests === 1) return Promise.resolve([{ name: COMMAND, shortcut: 'Ctrl+Shift+1' }]);
      if (shortcutRequests === 2) return a1Shortcut.promise;
      if (shortcutRequests === 3) return Promise.resolve([{ name: COMMAND, shortcut: 'Ctrl+Shift+B' }]);
      return a2Shortcut.promise;
    });

    dom.chatInput.focus();
    controller.activateTab(11);
    const pendingA1Shortcut = controller.refreshSkopeoShortcut(11);
    const pendingB = controller.activateTab(22);
    const pendingA2 = controller.activateTab(11);
    tabBStatus.resolve({ success: true, tabId: 22, generation: 1, status: 'off' });
    await pendingB;
    a2Shortcut.resolve([{ name: COMMAND, shortcut: 'Ctrl+Shift+2' }]);
    a2Status.resolve({ success: true, tabId: 11, generation: 2, status: 'active', attention: 'ambient' });
    await pendingA2;
    const beforeLateA1 = captureSidepanelPresentation(booted, dom, { authority: true });

    a1Shortcut.resolve([{ name: COMMAND, shortcut: 'Ctrl+Shift+1' }]);
    assert.equal(await pendingA1Shortcut, false, 'late A1 shortcut response returns false');
    assert.deepEqual(
      captureSidepanelPresentation(booted, dom, { authority: true }),
      beforeLateA1,
      'late A1 shortcut response cannot mutate hint state or presentation after A2'
    );
  }

  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const pending = [];
    const traces = [];
    for (const tabId of [11, 22, 11]) {
      pending.push(booted.controller.activateTab(tabId));
      traces.push(clone(booted.sandbox.__readSkopeoControllerAuthority().currentActivation));
    }
    await Promise.all(pending);
    assert.deepEqual(traces.map((entry) => entry.tabId), [11, 22, 11], 'activation trace retains A1 -> B -> A2 identities');
    assert.ok(
      traces[0].token < traces[1].token && traces[1].token < traces[2].token,
      'A1 -> B -> A2 receives three strictly increasing controller activation tokens'
    );
  }

  const controllerSource = extractSidepanelControllerSource(sidepanelSource);
  for (const declaration of [
    'var _activationSerial = 0;',
    'var _currentActivation = null;',
    'var _requestSerial = 0;',
    'var _latestRequestByLane = new Map();'
  ]) {
    assert.equal(controllerSource.split(declaration).length - 1, 1, declaration + ' exists exactly once');
  }
  assert.doesNotMatch(controllerSource, /chrome\.tabs\.query\s*\(/, 'bounded controller performs no second active-tab query');
}

function readGenerationFloors(booted) {
  return clone(booted.sandbox.__readSkopeoControllerAuthority().highestGenerations);
}

async function assertPerTabGenerationFloors(sidepanelSource) {
  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    const a1Status = createDeferred();
    const tabBStatus = createDeferred();
    const a2Status = createDeferred();
    const queues = new Map([
      [11, [a1Status, a2Status]],
      [22, [tabBStatus]]
    ]);
    chromeHarness.setRuntimeResponder((message) => {
      const queue = queues.get(message.tabId) || [];
      const deferred = queue.shift();
      assert.ok(deferred, 'status response queue exists for tab ' + String(message.tabId));
      return deferred.promise;
    });

    dom.chatInput.focus();
    const pendingA1 = controller.activateTab(11);
    const pendingB = controller.activateTab(22);
    const pendingA2 = controller.activateTab(11);
    tabBStatus.resolve({ success: true, tabId: 22, generation: 1, status: 'off' });
    await pendingB;
    a2Status.resolve({ success: true, tabId: 11, generation: 2, status: 'active', attention: 'ambient' });
    await pendingA2;
    assert.deepEqual(readGenerationFloors(booted), [[11, 2]], 'A2 generation 2 establishes only Tab 11 floor');

    for (const event of [
      { action: 'skopeo:status-changed', tabId: 11, generation: 1, status: 'off' },
      {
        action: 'skopeo:status-changed',
        tabId: 11,
        generation: 1,
        status: 'error',
        code: 'SKOPEO_START_FAILED'
      }
    ]) {
      const before = captureSidepanelPresentation(booted, dom, { authority: true });
      assert.deepEqual(invokeSidepanelStatusHandler(controller, event), [false], 'lower-generation status event is rejected');
      assert.deepEqual(
        captureSidepanelPresentation(booted, dom, { authority: true }),
        before,
        'lower-generation Off/Error event performs zero writes after A2'
      );
    }

    assert.deepEqual(
      invokeSidepanelStatusHandler(controller, {
        action: 'skopeo:status-changed',
        tabId: 11,
        generation: 2,
        status: 'off'
      }),
      [true],
      'equal generation remains valid for a later lifecycle transition'
    );
    assert.equal(dom.row.dataset.state, 'off');
    assert.deepEqual(readGenerationFloors(booted), [[11, 2]], 'equal generation does not move the floor');
    const beforeTerminalResurrection = captureSidepanelPresentation(booted, dom, { authority: true });
    assert.deepEqual(
      invokeSidepanelStatusHandler(controller, {
        action: 'skopeo:status-changed',
        tabId: 11,
        generation: 2,
        status: 'active',
        attention: 'ambient'
      }),
      [false],
      'equal generation cannot resurrect Active after terminal Off'
    );
    assert.deepEqual(
      captureSidepanelPresentation(booted, dom, { authority: true }),
      beforeTerminalResurrection,
      'terminal resurrection is rejected before presentation, floor, lifecycle, or DOM mutation'
    );
    assert.deepEqual(
      invokeSidepanelStatusHandler(controller, {
        action: 'skopeo:status-changed',
        tabId: 11,
        generation: 3,
        status: 'active',
        attention: 'ambient'
      }),
      [true],
      'higher generation advances the selected-tab floor'
    );
    assert.deepEqual(readGenerationFloors(booted), [[11, 3]]);

    for (const generation of [2, undefined, '4', 4.5, Number.POSITIVE_INFINITY, -1]) {
      const before = captureSidepanelPresentation(booted, dom, { authority: true });
      const event = { action: 'skopeo:status-changed', tabId: 11, status: 'off' };
      if (generation !== undefined) event.generation = generation;
      assert.deepEqual(invokeSidepanelStatusHandler(controller, event), [false], 'stale or unverifiable event is rejected');
      assert.deepEqual(
        captureSidepanelPresentation(booted, dom, { authority: true }),
        before,
        'stale or unverifiable event cannot mutate the current generation presentation'
      );
      assert.deepEqual(readGenerationFloors(booted), [[11, 3]], 'invalid generation never advances the floor');
    }

    const beforeWrongTab = captureSidepanelPresentation(booted, dom, { authority: true });
    assert.deepEqual(
      invokeSidepanelStatusHandler(controller, {
        action: 'skopeo:status-changed',
        tabId: 22,
        generation: 99,
        status: 'active',
        attention: 'ambient'
      }),
      [false],
      'wrong-tab event is rejected before generation admission'
    );
    assert.deepEqual(captureSidepanelPresentation(booted, dom, { authority: true }), beforeWrongTab);
    assert.deepEqual(readGenerationFloors(booted), [[11, 3]], 'wrong-tab event cannot create a floor');

    a1Status.resolve({ success: true, tabId: 11, generation: 99, status: 'off' });
    const a1Result = await pendingA1;
    assert.equal(a1Result[0].value, false, 'expired A1 response is rejected before generation admission');
    assert.deepEqual(readGenerationFloors(booted), [[11, 3]], 'expired activation cannot advance the floor');

    chromeHarness.setRuntimeResponder(async () => ({
      success: true,
      tabId: 22,
      generation: 100,
      status: 'active',
      attention: 'ambient'
    }));
    const beforeMismatchedStatus = captureSidepanelPresentation(booted, dom);
    assert.equal(await controller.refreshSkopeoControl(11), false, 'mismatched get-status response is rejected');
    assert.deepEqual(captureSidepanelPresentation(booted, dom), beforeMismatchedStatus);
    assert.deepEqual(readGenerationFloors(booted), [[11, 3]], 'mismatched response cannot advance either floor');

    chromeHarness.setRuntimeResponder(async (message) => ({
      success: true,
      tabId: message.tabId,
      generation: 2,
      status: 'off'
    }));
    const beforeLowerToggle = captureSidepanelPresentation(booted, dom);
    assert.equal(await controller.handleSkopeoToggle(), false, 'lower-generation current toggle response is rejected');
    assert.deepEqual(captureSidepanelPresentation(booted, dom), beforeLowerToggle);
    assert.deepEqual(readGenerationFloors(booted), [[11, 3]], 'lower toggle cannot regress the floor');

    chromeHarness.setRuntimeResponder(async (message) => ({
      success: true,
      tabId: message.tabId,
      generation: 4,
      status: 'off'
    }));
    assert.equal(await controller.handleSkopeoToggle(), true, 'higher-generation current toggle response is admitted');
    assert.equal(dom.row.dataset.state, 'off');
    assert.deepEqual(readGenerationFloors(booted), [[11, 4]], 'toggle response advances through the shared helper');

    chromeHarness.setRuntimeResponder(async (message) => ({
      success: true,
      tabId: message.tabId,
      generation: 1,
      status: 'active',
      attention: 'ambient'
    }));
    await controller.activateTab(22);
    assert.equal(dom.row.dataset.state, 'active');
    assert.deepEqual(
      readGenerationFloors(booted),
      [[11, 4], [22, 1]],
      'Tab 22 maintains an independent floor without clearing Tab 11'
    );
    const beforeMalformedTabB = captureSidepanelPresentation(booted, dom, { authority: true });
    assert.deepEqual(
      invokeSidepanelStatusHandler(controller, {
        action: 'skopeo:status-changed',
        tabId: 22,
        generation: '9',
        status: 'off'
      }),
      [false]
    );
    assert.deepEqual(captureSidepanelPresentation(booted, dom, { authority: true }), beforeMalformedTabB);
    assert.deepEqual(readGenerationFloors(booted), [[11, 4], [22, 1]]);
  }

  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    assert.deepEqual(
      invokeSidepanelStatusHandler(controller, {
        action: 'skopeo:status-changed',
        tabId: 11,
        status: 'active',
        attention: 'ambient'
      }),
      [true],
      'initial generationless fixture event remains compatible before a positive floor exists'
    );
    assert.deepEqual(readGenerationFloors(booted), [], 'generationless event never creates a floor');
    for (const generation of ['7', 7.5, Number.POSITIVE_INFINITY, -1]) {
      assert.deepEqual(
        invokeSidepanelStatusHandler(controller, {
          action: 'skopeo:status-changed',
          tabId: 11,
          generation,
          status: 'error',
          code: 'SKOPEO_START_FAILED'
        }),
        [true],
        'legacy error may render before any positive floor exists'
      );
      assert.deepEqual(readGenerationFloors(booted), [], 'malformed legacy generation never advances the floor');
    }
    assert.deepEqual(
      invokeSidepanelStatusHandler(controller, {
        action: 'skopeo:status-changed',
        tabId: 11,
        generation: 1,
        status: 'off'
      }),
      [true]
    );
    assert.deepEqual(readGenerationFloors(booted), [[11, 1]]);
    const beforeGenerationlessRegression = captureSidepanelPresentation(booted, dom, { authority: true });
    assert.deepEqual(
      invokeSidepanelStatusHandler(controller, {
        action: 'skopeo:status-changed',
        tabId: 11,
        status: 'active',
        attention: 'ambient'
      }),
      [false],
      'generationless event is rejected after a positive floor exists'
    );
    assert.deepEqual(
      captureSidepanelPresentation(booted, dom, { authority: true }),
      beforeGenerationlessRegression,
      'generationless event performs zero writes after the floor is known'
    );
  }

  const controllerSource = extractSidepanelControllerSource(sidepanelSource);
  assert.equal(
    controllerSource.split('var _highestGenerationByTab = new Map();').length - 1,
    1,
    'controller owns exactly one page-lifetime generation-floor map'
  );
  assert.equal(
    controllerSource.split('var _lifecyclePresentationByTab = new Map();').length - 1,
    1,
    'controller owns exactly one page-lifetime lifecycle-presentation map'
  );
  assert.equal(
    (controllerSource.match(/function\s+lifecycleStage\b/g) || []).length,
    1,
    'controller owns one closed lifecycle stage classifier'
  );
  assert.equal(
    (controllerSource.match(/function\s+acceptLifecyclePresentation\b/g) || []).length,
    1,
    'all generation-bearing paths share exactly one ordered lifecycle admission helper'
  );
}

async function assertCurrentUnversionedTerminalAuthority(sidepanelSource) {
  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 5,
      status: 'off'
    }), [true]);
    chromeHarness.setRuntimeResponder((message) => {
      if (message.action === 'skopeo:toggle-tab') return Promise.reject(new Error('toggle transport closed'));
      return Promise.resolve({ success: true, tabId: message.tabId, generation: 5, status: 'off' });
    });

    assert.equal(await controller.handleSkopeoToggle(), true, 'current toggle rejection renders its terminal error');
    assert.equal(dom.row.dataset.state, 'error');
    assert.equal(dom.row.getAttribute('aria-busy'), 'false');
    assert.equal(dom.toggle.getAttribute('aria-checked'), 'false');
    assert.equal(dom.toggle.disabled, false, 'transport error restores retry authority');
    assert.deepEqual(readGenerationFloors(booted), [[11, 5]], 'unversioned error does not move the floor');
    assert.deepEqual(
      readLifecyclePresentations(booted),
      [[11, { generation: 5, stage: 3 }]],
      'unversioned error does not rewrite versioned lifecycle authority'
    );
  }

  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 5,
      status: 'active',
      attention: 'ambient'
    }), [true]);
    chromeHarness.setRuntimeResponder((message) => {
      if (message.action === 'skopeo:get-status') return Promise.reject(new Error('status transport closed'));
      return Promise.resolve({ success: true, tabId: message.tabId, generation: 5, status: 'off' });
    });

    const activation = await controller.activateTab(11);
    assert.equal(activation[0].value, true, 'current activation rejection renders its terminal error');
    assert.equal(dom.row.dataset.state, 'error', 'activation does not remain at neutral Loading');
    assert.equal(dom.row.getAttribute('aria-busy'), 'false');
    assert.equal(dom.toggle.disabled, false);
    assert.deepEqual(readGenerationFloors(booted), [[11, 5]]);
    assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 5, stage: 2 }]]);
  }

  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 5,
      status: 'off'
    }), [true]);
    chromeHarness.setRuntimeResponder(async (message) => ({
      success: false,
      tabId: message.tabId,
      status: 'unsupported',
      code: 'SKOPEO_UNSUPPORTED_TAB'
    }));

    assert.equal(await controller.handleSkopeoToggle(), true, 'current restricted response renders Unsupported');
    assert.equal(dom.row.dataset.state, 'unsupported');
    assert.equal(dom.row.getAttribute('aria-busy'), 'false');
    assert.equal(dom.toggle.getAttribute('aria-checked'), 'false');
    assert.equal(dom.toggle.disabled, true);
    assert.deepEqual(readGenerationFloors(booted), [[11, 5]]);
    assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 5, stage: 3 }]]);
  }

  {
    const dom = createSidepanelDomHarness();
    const chromeHarness = createSidepanelChromeHarness();
    const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
    const controller = booted.controller;
    const heldStatus = createDeferred();
    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 5,
      status: 'active',
      attention: 'ambient'
    }), [true]);
    chromeHarness.setRuntimeResponder((message) => {
      if (message.action === 'skopeo:get-status') return heldStatus.promise;
      return Promise.resolve({ success: true, tabId: message.tabId, generation: 5, status: 'off' });
    });

    const pendingStatus = controller.refreshSkopeoControl(11);
    await Promise.resolve();
    assert.deepEqual(invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: 11,
      generation: 6,
      status: 'off'
    }), [true], 'newer live event owns presentation while the request is pending');
    const afterNewerEvent = captureSidepanelPresentation(booted, dom, { authority: true });
    heldStatus.resolve({
      success: false,
      tabId: 11,
      status: 'unsupported',
      code: 'SKOPEO_UNSUPPORTED_TAB'
    });
    assert.equal(await pendingStatus, false, 'late unversioned terminal response remains rejected');
    assert.deepEqual(
      captureSidepanelPresentation(booted, dom, { authority: true }),
      afterNewerEvent,
      'shared request and presentation tokens keep the late terminal response inert'
    );
  }
}

function readLifecyclePresentations(booted) {
  return clone(booted.sandbox.__readSkopeoControllerAuthority().lifecyclePresentations);
}

async function assertForwardOnlyLifecyclePresentation(sidepanelSource) {
  const dom = createSidepanelDomHarness();
  const chromeHarness = createSidepanelChromeHarness();
  const booted = bootSidepanelController(sidepanelSource, dom, chromeHarness, 11);
  const controller = booted.controller;

  function emit(status, generation, extras = {}) {
    return invokeSidepanelStatusHandler(controller, {
      action: 'skopeo:status-changed',
      tabId: booted.sandbox._activeTabIdSnapshot,
      generation,
      status,
      ...extras
    });
  }

  assert.deepEqual(emit('starting', 5), [true], 'first observed Starting begins generation 5');
  assert.deepEqual(readGenerationFloors(booted), [[11, 5]]);
  assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 5, stage: 1 }]]);
  let writesBeforeDuplicate = dom.writeLog.length;
  assert.deepEqual(emit('starting', 5), [true], 'Starting duplicate remains admissible');
  assert.equal(dom.writeLog.length, writesBeforeDuplicate, 'Starting duplicate repeats no text/live copy');
  assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 5, stage: 1 }]]);

  assert.deepEqual(emit('active', 5, { attention: 'ambient' }), [true], 'Starting advances to Active');
  assert.equal(dom.row.dataset.state, 'active');
  assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 5, stage: 2 }]]);
  writesBeforeDuplicate = dom.writeLog.length;
  assert.deepEqual(emit('active', 5, { attention: 'ambient' }), [true], 'Active duplicate remains admissible');
  assert.equal(dom.writeLog.length, writesBeforeDuplicate, 'Active duplicate repeats no text/live copy');

  let beforeRejected = captureSidepanelPresentation(booted, dom, { authority: true });
  assert.deepEqual(emit('starting', 5), [false], 'Active cannot regress to Starting');
  assert.deepEqual(
    captureSidepanelPresentation(booted, dom, { authority: true }),
    beforeRejected,
    'Active-to-Starting rejection is mutation-free'
  );

  assert.deepEqual(emit('off', 5), [true], 'Active advances to terminal Off');
  assert.equal(dom.row.dataset.state, 'off');
  assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 5, stage: 3 }]]);
  writesBeforeDuplicate = dom.writeLog.length;
  assert.deepEqual(emit('off', 5), [true], 'Off duplicate remains admissible');
  assert.equal(dom.writeLog.length, writesBeforeDuplicate, 'Off duplicate repeats no text/live copy');

  for (const backward of [
    ['active', { attention: 'ambient' }],
    ['starting', {}]
  ]) {
    beforeRejected = captureSidepanelPresentation(booted, dom, { authority: true });
    assert.deepEqual(emit(backward[0], 5, backward[1]), [false], 'terminal cannot return to ' + backward[0]);
    assert.deepEqual(
      captureSidepanelPresentation(booted, dom, { authority: true }),
      beforeRejected,
      'terminal-to-' + backward[0] + ' rejection is mutation-free'
    );
  }

  assert.deepEqual(emit('error', 5, { code: 'SKOPEO_UNSAFE_LAYOUT' }), [true], 'terminal error stays stage-equal');
  assert.equal(dom.row.dataset.state, 'error');
  assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 5, stage: 3 }]]);
  assert.deepEqual(
    emit('unsupported', 5, { code: 'SKOPEO_UNSUPPORTED_TAB' }),
    [true],
    'terminal unsupported projection stays stage-equal and fail-closed'
  );
  assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 5, stage: 3 }]]);

  assert.deepEqual(
    emit('active', 6, { attention: 'ambient' }),
    [true],
    'strictly newer generation may hydrate directly to Active'
  );
  assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 6, stage: 2 }]]);
  assert.deepEqual(emit('off', 7), [true], 'strictly newer generation may hydrate directly to terminal');
  assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 7, stage: 3 }]]);
  assert.deepEqual(emit('starting', 8), [true], 'strictly newer generation may hydrate directly to Starting');
  assert.deepEqual(readLifecyclePresentations(booted), [[11, { generation: 8, stage: 1 }]]);

  beforeRejected = captureSidepanelPresentation(booted, dom, { authority: true });
  assert.deepEqual(emit('active', 7, { attention: 'ambient' }), [false], 'lower generation remains rejected');
  assert.deepEqual(captureSidepanelPresentation(booted, dom, { authority: true }), beforeRejected);

  chromeHarness.setRuntimeResponder(async (message) => ({
    success: true,
    tabId: message.tabId,
    generation: message.tabId === 22 ? 1 : 9,
    status: message.tabId === 22 ? 'active' : 'off',
    ...(message.tabId === 22 ? { attention: 'ambient' } : {})
  }));
  await controller.activateTab(22);
  assert.deepEqual(
    readLifecyclePresentations(booted),
    [[11, { generation: 8, stage: 1 }], [22, { generation: 1, stage: 2 }]],
    'Tab B owns an independent record while Tab A is retained'
  );
  await controller.activateTab(11);
  assert.deepEqual(
    readLifecyclePresentations(booted),
    [[11, { generation: 9, stage: 3 }], [22, { generation: 1, stage: 2 }]],
    'A-to-B-to-A re-entry retains only encountered tabs and advances Tab A with newer authority'
  );
  assert.equal(readLifecyclePresentations(booted).length, 2, 'lifecycle map stays bounded to encountered tabs');
}

async function assertUnifiedTabSurfaceAuthority(sidepanelSource) {
  const syncSource = extractBracedSource(
    sidepanelSource,
    'async function syncActiveTabSurface(tabId, windowId)',
    true
  );
  const activatedBody = extractBracedSource(
    sidepanelSource,
    'chrome.tabs.onActivated.addListener(async (activeInfo) =>',
    false
  );
  const focusedBody = extractBracedSource(
    sidepanelSource,
    'chrome.windows.onFocusChanged.addListener(async (windowId) =>',
    false
  );

  assert.match(
    activatedBody,
    /await syncActiveTabSurface\(activeInfo\.tabId, activeInfo\.windowId\);/,
    'tab activation delegates its exact identity to the unified surface synchronizer'
  );
  assert.match(
    focusedBody,
    /await syncActiveTabSurface\(null, windowId\);/,
    'window focus delegates tab discovery to the same surface synchronizer'
  );
  assert.equal(
    (syncSource.match(/FSBSkopeoSidepanelController\.activateTab\(incomingTabId\)/g) || []).length,
    1,
    'the unified synchronizer contains one Skopeo activation site'
  );
  assert.match(
    syncSource,
    /const tabChanged = outgoingTabId !== incomingTabId;[\s\S]*?_activeTabIdSnapshot = incomingTabId;[\s\S]*?if \(tabChanged\) \{[\s\S]*?FSBSkopeoSidepanelController[\s\S]*?\.activateTab\(incomingTabId\)/,
    'Skopeo activates only after a changed tab is committed as authoritative'
  );
  assert.ok(
    (syncSource.match(/syncGeneration !== _activeTabSurfaceSyncGeneration/g) || []).length >= 6,
    'the unified synchronizer fences every asynchronous phase with its generation'
  );

  const lateOwner = createDeferred();
  const lateQuery = createDeferred();
  const activations = [];
  const ownerRefreshes = [];
  const adoptions = [];
  const swaps = [];
  const statusReads = [];
  const stateDispatches = [];
  const hydrations = [];
  const persistedTabs = [];
  const restoredTabs = [];
  const runningByTab = new Map();
  let queryPromise = Promise.resolve([{ id: 11 }]);

  const sandbox = {
    console: { warn() {} },
    Promise,
    Number,
    Date,
    Map,
    _activeTabSurfaceSyncGeneration: 0,
    _delegationHydrationGeneration: 0,
    _activeTabIdSnapshot: 11,
    _chatLockedByOwnerChip: false,
    conversationId: 'conversation-11',
    chatMessages: { innerHTML: '' },
    applyInputLockout() {},
    _persistTabStatusIntent(tabId) { persistedTabs.push(tabId); },
    _restoreTabStatusIntent(tabId) { restoredTabs.push(tabId); },
    refreshActiveTabOwnership(tabId, generation) {
      ownerRefreshes.push({ tabId, generation });
      if (tabId === 22) return lateOwner.promise;
      return Promise.resolve({ verified: true, tabId });
    },
    async _adoptTabIntoRunningDelegationConversation(tabId) {
      adoptions.push(tabId);
      return true;
    },
    async swapToTabConversation(tabId) {
      swaps.push(tabId);
      sandbox.conversationId = 'conversation-' + tabId;
      return true;
    },
    _getTabRunningEntry(tabId) {
      if (!runningByTab.has(tabId)) {
        runningByTab.set(tabId, { isRunning: false, sessionId: null, startedAt: null });
      }
      return runningByTab.get(tabId);
    },
    setRunningState(tabId) { stateDispatches.push({ tabId, state: 'running' }); },
    setIdleState(tabId) { stateDispatches.push({ tabId, state: 'idle' }); },
    async _hydrateDelegationForSelectedConversation() {
      hydrations.push(sandbox._activeTabIdSnapshot);
    },
    chrome: {
      tabs: {
        query() { return queryPromise; }
      },
      runtime: {
        async sendMessage(message) {
          statusReads.push(message.activeTabId);
          return { activeSessions: 0 };
        }
      }
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.FSBSkopeoSidepanelController = {
    activateTab(tabId) { activations.push(tabId); }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(syncSource, context, { filename: 'sidepanel-unified-tab-surface.js' });

  const staleTabA = context.syncActiveTabSurface(22, 1);
  const winningTabB = context.syncActiveTabSurface(33, 1);
  assert.equal(await winningTabB, true, 'the newest explicit tab sync completes');
  lateOwner.resolve({ verified: true, tabId: 22 });
  assert.equal(await staleTabA, false, 'a late ownership result cannot finish an older tab sync');
  assert.deepEqual(activations, [22, 33], 'each committed changed tab activates Skopeo exactly once');
  assert.equal(sandbox._activeTabIdSnapshot, 33, 'the winning explicit tab remains authoritative');
  assert.deepEqual(adoptions, [33], 'the stale generation cannot adopt a delegation tab');
  assert.deepEqual(swaps, [33], 'the stale generation cannot swap the conversation');
  assert.deepEqual(statusReads, [33], 'the stale generation cannot refresh running state');
  assert.deepEqual(hydrations, [33], 'the stale generation cannot hydrate delegation UI');

  assert.equal(await context.syncActiveTabSurface(33, 1), true, 'same-tab refresh still synchronizes the surface');
  assert.deepEqual(activations, [22, 33], 'same-tab refresh does not activate Skopeo again');

  queryPromise = lateQuery.promise;
  const staleWindowQuery = context.syncActiveTabSurface(null, 101);
  assert.equal(await context.syncActiveTabSurface(44, 202), true, 'explicit activation supersedes an older window query');
  lateQuery.resolve([{ id: 55 }]);
  assert.equal(await staleWindowQuery, false, 'late window-query resolution is generation fenced');
  assert.deepEqual(activations, [22, 33, 44], 'a stale queried tab is never committed or activated');
  assert.equal(sandbox._activeTabIdSnapshot, 44, 'the explicit activation wins over the stale query');
  assert.deepEqual(persistedTabs, [11, 22, 33], 'only committed tab transitions persist outgoing intent');
  assert.deepEqual(restoredTabs, [33, 33, 44], 'only current generations restore incoming intent');
  assert.deepEqual(
    ownerRefreshes.map((entry) => entry.tabId),
    [22, 33, 33, 44],
    'ownership refreshes are scoped to committed tabs only'
  );
  assert.deepEqual(
    stateDispatches.map((entry) => entry.tabId),
    [33, 33, 44],
    'only current generations dispatch tab-scoped running state'
  );
}

async function assertOuterTabAuthorityRaces(sidepanelSource) {
  async function settleWinningTab(harness, tabId, label) {
    await harness.flush();
    assert.equal(harness.sandbox._activeTabIdSnapshot, tabId, label + ' snapshot');
    assert.equal(harness.activations.at(-1), tabId, label + ' controller activation');
    assert.equal(harness.dom.document.activeElement, harness.dom.chatInput, label + ' preserves focus');
    await harness.assertWinningTab(tabId, label);
  }

  {
    const harness = createOuterAuthorityHarness(sidepanelSource);
    const windowA = createDeferred();
    const windowB = createDeferred();
    harness.setWindowQuery(101, windowA);
    harness.setWindowQuery(202, windowB);
    harness.dom.chatInput.focus();

    const pendingA = harness.onWindowFocused(101);
    const pendingB = harness.onWindowFocused(202);
    assert.deepEqual(
      harness.queryCalls,
      [{ active: true, windowId: 101 }, { active: true, windowId: 202 }],
      'window focus authority starts each query synchronously'
    );
    windowB.resolve([{ id: 22 }]);
    await pendingB;
    await harness.flush();
    const writesBeforeLateA = harness.dom.writeLog.length;
    windowA.resolve([{ id: 11 }]);
    await pendingA;
    assert.equal(harness.dom.writeLog.length, writesBeforeLateA, 'late Window A performs no Skopeo text write');
    await settleWinningTab(harness, 22, 'focus A then B, resolve B then A');
  }

  {
    const harness = createOuterAuthorityHarness(sidepanelSource);
    const bootA = createDeferred();
    harness.setBootQuery(bootA);
    harness.dom.chatInput.focus();

    const pendingBoot = harness.initTabConversationStore();
    const pendingB = harness.onTabActivated({ tabId: 22 });
    await pendingB;
    await harness.flush();
    const writesBeforeLateBoot = harness.dom.writeLog.length;
    bootA.resolve([{ id: 11 }]);
    await pendingBoot;
    assert.equal(harness.dom.writeLog.length, writesBeforeLateBoot, 'late boot query performs no Skopeo text write');
    assert.equal(harness.sandbox.conversationId, 'conversation-tab-b', 'late boot cannot select Tab A conversation');
    await settleWinningTab(harness, 22, 'boot A then activate B');
  }

  {
    const harness = createOuterAuthorityHarness(sidepanelSource);
    const windowA = createDeferred();
    harness.setWindowQuery(101, windowA);
    harness.dom.chatInput.focus();

    const pendingA = harness.onWindowFocused(101);
    const pendingB = harness.onTabActivated({ tabId: 22 });
    await pendingB;
    await harness.flush();
    const writesBeforeLateA = harness.dom.writeLog.length;
    windowA.resolve([{ id: 11 }]);
    await pendingA;
    assert.equal(harness.dom.writeLog.length, writesBeforeLateA, 'late focus query after activation performs no Skopeo text write');
    await settleWinningTab(harness, 22, 'focus A then activate B');
  }

  {
    const harness = createOuterAuthorityHarness(sidepanelSource);
    const windowA = createDeferred();
    const windowB = createDeferred();
    harness.setWindowQuery(101, windowA);
    harness.setWindowQuery(202, windowB);
    harness.dom.chatInput.focus();

    const pendingA = harness.onWindowFocused(101);
    const pendingB = harness.onWindowFocused(202);
    windowA.resolve([{ id: 11 }]);
    await pendingA;
    assert.equal(harness.activations.length, 0, 'older Window A cannot commit while newer Window B is unresolved');
    windowB.resolve([{ id: 22 }]);
    await pendingB;
    await settleWinningTab(harness, 22, 'focus A then B, resolve A then B');
  }

  {
    const harness = createOuterAuthorityHarness(sidepanelSource, 22);
    harness.dom.chatInput.focus();
    const before = {
      epoch: harness.sandbox._tabAuthorityEpoch,
      snapshot: harness.sandbox._activeTabIdSnapshot,
      queries: harness.queryCalls.length,
      activations: harness.activations.length,
      writes: harness.dom.writeLog.length,
      messages: harness.messages.length,
      focus: harness.dom.document.activeElement
    };
    await harness.onWindowFocused(-1);
    assert.deepEqual({
      epoch: harness.sandbox._tabAuthorityEpoch,
      snapshot: harness.sandbox._activeTabIdSnapshot,
      queries: harness.queryCalls.length,
      activations: harness.activations.length,
      writes: harness.dom.writeLog.length,
      messages: harness.messages.length,
      focus: harness.dom.document.activeElement
    }, before, 'WINDOW_ID_NONE has no authority side effect');
  }

  assert.match(sidepanelSource, /var _tabAuthorityEpoch = 0;/, 'one shared page-lifetime authority epoch exists');
  for (const helper of ['_claimTabAuthority', '_tabAuthorityIsCurrent', '_commitAuthoritativeTab']) {
    assert.equal(
      (sidepanelSource.match(new RegExp('function\\s+' + helper + '\\b', 'g')) || []).length,
      1,
      helper + ' is declared exactly once'
    );
  }
}

async function assertOwnerChipTabAuthorityRaces(sidepanelSource) {
  function storageBag(tabId, ownerAgentId, label) {
    const records = {};
    const labels = {};
    if (ownerAgentId) {
      records[ownerAgentId] = { tabIds: [tabId] };
      labels[ownerAgentId] = label;
    }
    return {
      fsbAgentRegistry: { v: 1, records },
      fsbAgentClientLabels: labels
    };
  }

  function expectedControl(foreignOwned) {
    return {
      disabled: foreignOwned,
      ariaDisabled: foreignOwned ? 'true' : null,
      ariaDescribedBy: foreignOwned ? 'fsb-lockout-aria-description' : null,
      foreignOwnedClass: foreignOwned
    };
  }

  function expectedPresentation(tabId, ownerLabel) {
    const foreignOwned = ownerLabel !== null;
    return {
      activeTabId: tabId,
      chipText: foreignOwned ? 'owned by ' + ownerLabel : '',
      chipDisplay: foreignOwned ? 'inline-flex' : 'none',
      locked: foreignOwned,
      chatInput: {
        disabled: false,
        ariaDisabled: foreignOwned ? 'true' : null,
        ariaDescribedBy: foreignOwned ? 'fsb-lockout-aria-description' : null,
        foreignOwnedClass: foreignOwned,
        contenteditable: foreignOwned ? 'false' : 'true',
        title: foreignOwned ? 'Disabled while tab is owned by ' + ownerLabel : ''
      },
      sendBtn: expectedControl(foreignOwned),
      stopBtn: expectedControl(foreignOwned),
      micBtn: expectedControl(foreignOwned)
    };
  }

  for (const testCase of [
    {
      label: 'late Tab A foreign owner cannot lock unowned Tab B',
      tabAStorage: storageBag(11, 'agent-a', 'Agent A'),
      tabBStorage: storageBag(22, null, null),
      tabBLabel: null
    },
    {
      label: 'late Tab A unowned result cannot unlock foreign-owned Tab B',
      tabAStorage: storageBag(11, null, null),
      tabBStorage: storageBag(22, 'agent-b', 'Agent B'),
      tabBLabel: 'Agent B'
    }
  ]) {
    const heldTabAStorage = createDeferred();
    const harness = createOwnerChipAuthorityHarness(
      sidepanelSource,
      heldTabAStorage.promise,
      testCase.tabBStorage
    );

    const pendingTabA = harness.onTabActivated({ tabId: 11 });
    await harness.waitForStorageReads(1);
    const pendingTabB = harness.onTabActivated({ tabId: 22 });
    await harness.waitForStorageReads(2);
    await pendingTabB;
    await harness.flush();

    const afterTabB = harness.snapshot();
    const { mutationCount: _mutationCount, ...tabBPresentation } = afterTabB;
    assert.deepEqual(
      tabBPresentation,
      expectedPresentation(22, testCase.tabBLabel),
      testCase.label + ' establishes Tab B chip and input authority'
    );

    heldTabAStorage.resolve(testCase.tabAStorage);
    await pendingTabA;
    await harness.flush();
    assert.deepEqual(
      harness.snapshot(),
      afterTabB,
      testCase.label + ' with zero late owner-chip, lock-flag, or input-control mutations'
    );
    assert.equal(
      harness.tabQueries.length,
      0,
      testCase.label + ' uses the activation tab ID without a second active-tab query'
    );
  }

  {
    const foreignTabA = storageBag(11, 'agent-a', 'Agent A');
    const rejectedTabBRead = createDeferred();
    const harness = createOwnerChipAuthorityHarness(sidepanelSource, null, null, {
      primaryStorageResponses: [foreignTabA, rejectedTabBRead.promise]
    });

    await harness.onTabActivated({ tabId: 11 });
    const tabA = harness.snapshot();
    const { mutationCount: _tabAMutationCount, ...tabAPresentation } = tabA;
    assert.deepEqual(
      tabAPresentation,
      expectedPresentation(11, 'Agent A'),
      'Tab A begins foreign-owned before the rejecting Tab B refresh'
    );

    const pendingTabB = harness.onTabActivated({ tabId: 22 });
    await harness.waitForStorageReads(2);
    const whileTabBReadIsPending = harness.snapshot();
    rejectedTabBRead.reject(new Error('WR-07 simulated owner registry read failure'));
    await pendingTabB;
    await harness.flush();

    const afterRejectedTabBRead = harness.snapshot();
    const { mutationCount: _rejectedMutationCount, ...rejectedPresentation } = afterRejectedTabBRead;
    assert.deepEqual(
      rejectedPresentation,
      expectedPresentation(22, null),
      'current Tab B read rejection commits truthful neutral unlocked ownership'
    );
    const { mutationCount: _pendingMutationCount, ...pendingPresentation } = whileTabBReadIsPending;
    assert.deepEqual(
      pendingPresentation,
      expectedPresentation(22, null),
      'Tab B authority synchronously revokes outgoing Agent A before storage settles'
    );
  }

  {
    const foreignTabA = storageBag(11, 'agent-a', 'Agent A');
    const staleRejectedTabBRead = createDeferred();
    const currentTabB = storageBag(22, 'agent-b', 'Agent B');
    const harness = createOwnerChipAuthorityHarness(sidepanelSource, null, null, {
      primaryStorageResponses: [foreignTabA, staleRejectedTabBRead.promise, currentTabB]
    });

    await harness.onTabActivated({ tabId: 11 });
    const pendingTabB = harness.onTabActivated({ tabId: 22 });
    await harness.waitForStorageReads(2);
    harness.emitStorageChange({ fsbAgentRegistry: { newValue: currentTabB.fsbAgentRegistry } });
    await harness.waitForStorageReads(3);
    await harness.flush();

    const afterCurrentTabBRefresh = harness.snapshot();
    const { mutationCount: _currentMutationCount, ...currentPresentation } = afterCurrentTabBRefresh;
    assert.deepEqual(
      currentPresentation,
      expectedPresentation(22, 'Agent B'),
      'later current Tab B refresh recovers and establishes Agent B ownership'
    );

    staleRejectedTabBRead.reject(new Error('WR-07 simulated stale owner registry read failure'));
    await pendingTabB;
    await harness.flush();
    assert.deepEqual(
      harness.snapshot(),
      afterCurrentTabBRefresh,
      'stale rejected refresh cannot overwrite later Tab B owner authority'
    );
  }

  {
    const foreignTab = storageBag(11, 'agent-a', 'Agent A');
    const rejectedSameTabRead = createDeferred();
    const releasedTab = storageBag(11, null, null);
    const harness = createOwnerChipAuthorityHarness(sidepanelSource, null, null, {
      primaryStorageResponses: [foreignTab, rejectedSameTabRead.promise, releasedTab]
    });

    await harness.onTabActivated({ tabId: 11 });
    const authoritativeForeignPresentation = harness.snapshot();
    const { mutationCount: _foreignMutationCount, ...foreignPresentation } = authoritativeForeignPresentation;
    assert.deepEqual(
      foreignPresentation,
      expectedPresentation(11, 'Agent A'),
      'same-tab rejection case begins with authoritative foreign ownership'
    );

    harness.emitStorageChange({
      fsbAgentClientLabels: { newValue: foreignTab.fsbAgentClientLabels }
    });
    await harness.waitForStorageReads(2);
    assert.deepEqual(
      harness.snapshot(),
      authoritativeForeignPresentation,
      'pending same-tab owner refresh preserves chip, lock, ARIA, and every disabled control'
    );

    rejectedSameTabRead.reject(new Error('WR-08 simulated current same-tab owner read failure'));
    await harness.flush();
    assert.deepEqual(
      harness.snapshot(),
      authoritativeForeignPresentation,
      'rejected current same-tab refresh preserves the last authoritative foreign-owner presentation'
    );

    harness.emitStorageChange({ fsbAgentRegistry: { newValue: releasedTab.fsbAgentRegistry } });
    await harness.waitForStorageReads(3);
    await harness.flush();
    const afterSuccessfulRelease = harness.snapshot();
    const { mutationCount: _releaseMutationCount, ...releasePresentation } = afterSuccessfulRelease;
    assert.deepEqual(
      releasePresentation,
      expectedPresentation(11, null),
      'later successful same-tab evidence may release the owner lock'
    );
    assert.ok(
      afterSuccessfulRelease.mutationCount > authoritativeForeignPresentation.mutationCount,
      'successful authoritative release performs the replacement presentation mutations'
    );
  }

  {
    const foreignTab = storageBag(11, 'agent-a', 'Agent A');
    const staleRejectedSameTabRead = createDeferred();
    const replacementForeignTab = storageBag(11, 'agent-b', 'Agent B');
    const harness = createOwnerChipAuthorityHarness(sidepanelSource, null, null, {
      primaryStorageResponses: [foreignTab, staleRejectedSameTabRead.promise, replacementForeignTab]
    });

    await harness.onTabActivated({ tabId: 11 });
    const authoritativeForeignPresentation = harness.snapshot();
    harness.emitStorageChange({
      'mcpVisualSession:11': { newValue: { client: 'Agent A' } }
    });
    await harness.waitForStorageReads(2);
    assert.deepEqual(
      harness.snapshot(),
      authoritativeForeignPresentation,
      'older pending same-tab refresh retains the established owner presentation'
    );

    harness.emitStorageChange({
      fsbAgentClientLabels: { newValue: replacementForeignTab.fsbAgentClientLabels }
    });
    await harness.waitForStorageReads(3);
    await harness.flush();
    const afterSuccessfulReplacement = harness.snapshot();
    const { mutationCount: _replacementMutationCount, ...replacementPresentation } = afterSuccessfulReplacement;
    assert.deepEqual(
      replacementPresentation,
      expectedPresentation(11, 'Agent B'),
      'newer successful same-tab evidence may replace the authoritative owner presentation'
    );

    staleRejectedSameTabRead.reject(new Error('WR-08 simulated stale same-tab owner read failure'));
    await harness.flush();
    assert.deepEqual(
      harness.snapshot(),
      afterSuccessfulReplacement,
      'older same-tab rejection cannot overwrite the newer authoritative owner presentation'
    );
  }

  {
    const delayedLookup = createDeferred();
    const unowned = storageBag(11, null, null);
    const staleForeign = storageBag(11, 'agent-stale', null);
    const harness = createOwnerChipAuthorityHarness(sidepanelSource, null, null, {
      primaryStorageResponses: [unowned, staleForeign, unowned],
      lookupStorageResponses: [delayedLookup.promise]
    });

    await harness.onTabActivated({ tabId: 11 });
    harness.emitStorageChange({ fsbAgentRegistry: { newValue: staleForeign.fsbAgentRegistry } });
    await harness.waitForStorageReads(2);
    await harness.waitForLookupReads(1);
    harness.emitStorageChange({ fsbAgentRegistry: { newValue: unowned.fsbAgentRegistry } });
    await harness.waitForStorageReads(3);
    await harness.flush();

    const afterRelease = harness.snapshot();
    const { mutationCount: _mutationCount, ...releasePresentation } = afterRelease;
    assert.deepEqual(
      releasePresentation,
      expectedPresentation(11, null),
      'newer same-tab release refresh hides the chip and unlocks every input control'
    );

    delayedLookup.resolve({ 'mcpVisualSession:11': { client: 'Stale Agent' } });
    await harness.flush();
    assert.deepEqual(
      harness.snapshot(),
      afterRelease,
      'older same-tab Tier-3 label lookup cannot restore stale chip, lock, or control state'
    );
  }

  {
    const delayedUnowned = createDeferred();
    const unowned = storageBag(11, null, null);
    const currentForeign = storageBag(11, 'agent-current', 'Current Agent');
    const harness = createOwnerChipAuthorityHarness(sidepanelSource, null, null, {
      primaryStorageResponses: [unowned, delayedUnowned.promise, currentForeign]
    });

    await harness.onTabActivated({ tabId: 11 });
    harness.emitStorageChange({ fsbAgentRegistry: { newValue: unowned.fsbAgentRegistry } });
    await harness.waitForStorageReads(2);
    harness.emitStorageChange({ fsbAgentRegistry: { newValue: currentForeign.fsbAgentRegistry } });
    await harness.waitForStorageReads(3);
    await harness.flush();

    const afterClaim = harness.snapshot();
    const { mutationCount: _mutationCount, ...claimPresentation } = afterClaim;
    assert.deepEqual(
      claimPresentation,
      expectedPresentation(11, 'Current Agent'),
      'newer same-tab claim refresh shows the chip and locks every input control'
    );

    delayedUnowned.resolve(unowned);
    await harness.flush();
    assert.deepEqual(
      harness.snapshot(),
      afterClaim,
      'older same-tab unowned read cannot hide the current chip or unlock controls'
    );
  }

  assert.match(
    sidepanelSource,
    /var _ownerRefreshSerial = 0;/,
    'owner-chip refreshes use a dedicated page-lifetime request serial'
  );
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
    files: ADAPTIVE_INJECTION_FILES
  });
  let tabA = storageRecord(harness, 11);
  assert.equal(tabA.status, 'starting');
  assert.deepEqual(resourceSnapshot(harness, 11), ZERO_RESOURCES, 'prepare remains root/listener/top-layer free');
  const injectionOperation = 'execute:11:' + ADAPTIVE_INJECTION_FILES.join(',');
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
  const wsClientSource = fs.readFileSync(WS_CLIENT_PATH, 'utf8');
  assertStaticContracts(backgroundSource, manifest, wsClientSource);
  assertSidepanelRowStaticContracts(sidepanelHtmlSource, sidepanelCssSource);
  await assertSidepanelStateController(sidepanelSource);
  await assertSidepanelRaceIntegration(sidepanelSource);
  await assertStatusNotificationResponseContract(backgroundSource, sidepanelSource);
  await assertGenerationZeroBaselineRecovery(backgroundSource, sidepanelSource);
  await assertLifecyclePresentationAuthority(sidepanelSource);
  await assertSameTabABAAuthority(sidepanelSource);
  await assertPerTabGenerationFloors(sidepanelSource);
  await assertCurrentUnversionedTerminalAuthority(sidepanelSource);
  await assertForwardOnlyLifecyclePresentation(sidepanelSource);
  await assertUnifiedTabSurfaceAuthority(sidepanelSource);
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
