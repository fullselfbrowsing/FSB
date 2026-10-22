'use strict';

/**
 * Phase 66.1 Plan 04 (D-16): FSBSettingsSync keeps an open Control Panel in
 * step with settings written from outside it (the MCP settings tool, another
 * panel tab), so a later Save never silently reverts them.
 *
 * Layer 1 loads extension/ui/options.js under a small DOM shim (the
 * tests/model-discovery-ui.test.js pattern) and exercises the load-time
 * global: touched tracking, external-change tracking, the Save-time filter,
 * the self-write echo records and the in-place refresh of simple fields and
 * the provider group.
 *
 * No network and no ports: global.fetch is a throwing spy. Node 20-safe.
 *
 * Run: node tests/settings-panel-sync.test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function check(cond, msg) {
  if (cond) {
    passed += 1;
    console.log('  PASS:', msg);
  } else {
    failed += 1;
    failures.push(msg);
    console.error('  FAIL:', msg);
  }
}

function section(title) {
  console.log('\n--- ' + title + ' ---');
}

function hasOwnKey(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const OPTIONS_PATH = path.join(__dirname, '..', 'extension', 'ui', 'options.js');
const OPTIONS_SOURCE = fs.readFileSync(OPTIONS_PATH, 'utf8');
const INSTALL_IDENTITY_UI_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'extension', 'ui', 'install-identity-ui.js'),
  'utf8'
);

// ---------------------------------------------------------------------------
// DOM shim
// ---------------------------------------------------------------------------

let dispatchCount = 0;

function makeEl(tagName, id) {
  const el = {
    tagName: String(tagName || 'div').toUpperCase(),
    id: id || '',
    children: [],
    attributes: {},
    classList: {
      _set: new Set(),
      add(...names) { names.forEach((n) => this._set.add(n)); },
      remove(...names) { names.forEach((n) => this._set.delete(n)); },
      contains(n) { return this._set.has(n); },
      toggle(n, on) { if (on) this.add(n); else this.remove(n); }
    },
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    hidden: false,
    style: {},
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    addEventListener() {},
    querySelector() { return null; },
    dispatchEvent() { dispatchCount += 1; return true; }
  };
  return el;
}

// A select whose value setter only accepts an existing option's value, like a
// real <select>, and whose innerHTML = '' clears the options.
function makeSelect(id, values) {
  const el = makeEl('select', id);
  el.options = [];
  let current = '';
  el.appendChild = function (child) {
    child.parentNode = el;
    el.options.push(child);
    el.children.push(child);
    if (el.options.length === 1 && current === '') current = child.value;
    return child;
  };
  Object.defineProperty(el, 'value', {
    configurable: true,
    get() { return current; },
    set(v) {
      const s = String(v);
      if (el.options.some((o) => o.value === s)) current = s;
      else current = '';
    }
  });
  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    get() { return ''; },
    set(v) {
      if (v === '') {
        el.options = [];
        el.children = [];
        current = '';
      }
    }
  });
  el.querySelector = function (selector) {
    const match = /option\[value="([^"]*)"\]/.exec(String(selector));
    if (!match) return null;
    return el.options.find((o) => o.value === match[1]) || null;
  };
  (values || []).forEach((v) => {
    const option = makeEl('option');
    option.value = v;
    option.textContent = v;
    el.appendChild(option);
  });
  return el;
}

const registry = new Map();
function reg(el) { registry.set(el.id, el); return el; }

function buildRegistry() {
  registry.clear();
  for (const id of [
    'maxIterations', 'maxIterationsSlider', 'maxIterationsDisplay',
    'maxDOMElements', 'maxDOMElementsSlider', 'maxDOMElementsDisplay',
    'elementCacheSize', 'elementCacheSizeDisplay', 'elementCacheSizeCustom',
    'fsbAgentCap', 'fsbAgentCapDisplay', 'fsbTriggerCap', 'fsbTriggerCapDisplay',
    'fsbMcpSessionRetentionDays', 'modelDescription', 'modelSearch',
    'apiKey', 'geminiApiKey', 'openaiApiKey', 'anthropicApiKey', 'openrouterApiKey',
    'customApiKey', 'customEndpoint', 'lmstudioBaseUrl', 'captchaApiKey',
    'serverUrl', 'serverHashKey'
  ]) reg(makeEl('input', id));
  for (const id of [
    'debugMode', 'domOptimization', 'prioritizeViewport', 'animatedActionHighlights',
    'showSidepanelProgress', 'enableLogin', 'captchaSolverEnabled', 'sttProvider',
    'voiceInputEnabled', 'autoRefineSiteMaps', 'fsbChangeReportsEnabled', 'fsbJevFastModeEnabled',
    'fsbMcpSessionRecordingEnabled', 'autoAnalyzeToggle', 'fsbTelemetryOptOut'
  ]) {
    const el = reg(makeEl('input', id));
    el.type = 'checkbox';
  }
  const wrap = reg(makeEl('div', 'elementCacheSizeCustomWrap'));
  wrap.style.display = 'none';
  reg(makeSelect('elementCacheSizePreset', ['100', '200', '500', 'custom']));
  reg(makeSelect('modelProvider', [
    'xai', 'gemini', 'openai', 'anthropic', 'openrouter', 'lmstudio', 'custom', 'claude-code', 'grok-build'
  ]));
  reg(makeSelect('modelName', ['grok-4-1-fast', 'grok-4', 'grok-3-mini']));
  for (const id of ['xaiApiKeyGroup', 'geminiApiKeyGroup', 'openaiApiKeyGroup', 'anthropicApiKeyGroup',
    'customApiGroup', 'openrouterApiKeyGroup', 'lmstudioServerGroup', 'modelDiscoveryStatus',
    'refreshModelsBtn', 'saveBtn', 'fullApiTest', 'captchaSolverConfig']) {
    reg(makeEl('div', id));
  }
}

const documentListeners = [];
const onChangedListeners = [];
let fetchCalls = 0;
let storageSets = [];

function installShims() {
  buildRegistry();
  documentListeners.length = 0;
  onChangedListeners.length = 0;
  global.document = {
    readyState: 'complete',
    getElementById: (id) => registry.get(id) || null,
    createElement: (tag) => makeEl(tag),
    addEventListener: (type, fn, options) => { documentListeners.push({ type, fn, options }); },
    querySelector: () => null,
    querySelectorAll: () => []
  };
  global.chrome = {
    storage: {
      local: {
        get: (_keys, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
        set: (obj, cb) => { storageSets.push(obj); if (typeof cb === 'function') cb(); return Promise.resolve(); }
      },
      onChanged: { addListener: (fn) => { onChangedListeners.push(fn); } }
    },
    runtime: {
      sendMessage: () => Promise.resolve({}),
      getManifest: () => ({ version: '0.0.0' })
    }
  };
  global.window = global;
  global.FSBAnalytics = function () {
    return { addEventListener: () => {}, refreshAnalytics: () => {}, getStats: () => ({}) };
  };
  global.fetch = function () {
    fetchCalls += 1;
    throw new Error('settings-panel-sync: network is forbidden in this test');
  };
}

// config.js first: it defines FsbSettingsSchema. Then the panel globals.
const { FsbSettingsSchema } = require('../extension/config/config.js');
global.FsbSettingsSchema = FsbSettingsSchema;
global.config = {
  availableModels: { xai: [], gemini: [], openai: [], anthropic: [], openrouter: [], lmstudio: [] }
};

function loadOptionsFresh() {
  delete require.cache[require.resolve(OPTIONS_PATH)];
  installShims();
  const exported = require(OPTIONS_PATH);
  return { exported, sync: global.FSBSettingsSync };
}

function countEditListeners() {
  return documentListeners.filter((l) => l.type === 'input' || l.type === 'change' || l.type === 'click').length;
}

// ---------------------------------------------------------------------------
section('Load-time exposure and purity');
// ---------------------------------------------------------------------------

const first = loadOptionsFresh();
check(typeof first.sync === 'object' && first.sync !== null, 'requiring options.js exposes global.FSBSettingsSync');
check(first.exported && first.exported.FSBSettingsSync === first.sync, 'module.exports.FSBSettingsSync is the same object');
check(Object.isFrozen(first.sync), 'FSBSettingsSync is frozen');
for (const name of ['keyForElementId', 'noteTouched', 'noteSelfWrite', 'noteStorageChanges',
  'filterForSave', 'willWriteProviderGroup', 'noteSaved', 'reset', 'applyToForm', 'reconcile', 'attach']) {
  check(typeof (first.sync && first.sync[name]) === 'function', 'FSBSettingsSync.' + name + ' is a function');
}
check(first.sync && sameJson(first.sync.PROVIDER_GROUP_KEYS, ['providerKind', 'agentProviderId', 'modelProvider', 'modelName']),
  'PROVIDER_GROUP_KEYS lists the four provider keys in order');
check(onChangedListeners.length === 0, 'loading options.js installs no chrome.storage.onChanged listener');
check(countEditListeners() === 0, 'loading options.js installs no document input/change/click listener');

const second = loadOptionsFresh();
check(second.sync !== first.sync && typeof second.sync === 'object', 'a fresh require builds a fresh FSBSettingsSync');
check(onChangedListeners.length === 0 && countEditListeners() === 0,
  'a second fresh require also installs nothing until attach()');

const sync = second.sync;

// ---------------------------------------------------------------------------
section('keyForElementId');
// ---------------------------------------------------------------------------

const ALIASES = {
  maxIterationsSlider: 'maxIterations',
  maxIterations: 'maxIterations',
  maxDOMElementsSlider: 'maxDOMElements',
  maxDOMElements: 'maxDOMElements',
  elementCacheSizePreset: 'elementCacheSize',
  elementCacheSizeCustom: 'elementCacheSize',
  elementCacheSize: 'elementCacheSize',
  fsbAgentCap: 'fsbAgentCap',
  fsbAgentCapReset: 'fsbAgentCap',
  fsbTriggerCap: 'fsbTriggerCap',
  fsbTriggerCapReset: 'fsbTriggerCap',
  autoAnalyzeToggle: 'autoAnalyzeMemories',
  apiKey: 'apiKey',
  debugMode: 'debugMode',
  fsbTelemetryOptOut: 'fsbTelemetryOptOut'
};
for (const [id, key] of Object.entries(ALIASES)) {
  check(sync.keyForElementId(id) === key, 'keyForElementId(' + id + ') -> ' + key);
}
check(sync.PROVIDER_GROUP_KEYS.includes(sync.keyForElementId('modelProvider')), 'keyForElementId(modelProvider) is a provider key');
check(sync.PROVIDER_GROUP_KEYS.includes(sync.keyForElementId('modelName')), 'keyForElementId(modelName) is a provider key');
// WR-06: the combobox filter box is not an edit of modelName.
check(sync.keyForElementId('modelSearch') === null, 'keyForElementId(modelSearch) -> null (typing a filter is not an edit)');
for (const id of ['unknownId', '', 'saveBtn', 'refreshModelsBtn', '__proto__', 'constructor', 'toString']) {
  check(sync.keyForElementId(id) === null, 'keyForElementId(' + JSON.stringify(id) + ') -> null');
}
check(sync.keyForElementId(undefined) === null && sync.keyForElementId(42) === null, 'non-string ids map to null');

// Every alias target id exists in control_panel.html.
const HTML = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'control_panel.html'), 'utf8');
for (const id of Object.keys(ALIASES).concat(['modelProvider', 'modelName', 'modelSearch'])) {
  check(HTML.includes('id="' + id + '"'), 'control_panel.html has id="' + id + '"');
}

// ---------------------------------------------------------------------------
section('External changes, touched fields and filterForSave');
// ---------------------------------------------------------------------------

function fullSettings(overrides) {
  return Object.assign({
    providerKind: 'api', agentProviderId: '', modelProvider: 'xai', modelName: 'grok-4-1-fast',
    apiKey: 'k', maxIterations: 100, debugMode: false, domOptimization: true
  }, overrides || {});
}

sync.reset({ debugMode: false, maxIterations: 100 });
let result = sync.noteStorageChanges({ debugMode: { oldValue: false, newValue: true } }, 'local');
check(sameJson(result.apply, { debugMode: true }), 'an untouched external debugMode change is applied');
let settings = fullSettings();
let dropped = sync.filterForSave(settings);
check(sameJson(dropped, ['debugMode']), 'filterForSave drops the pending debugMode');
check(!Object.prototype.hasOwnProperty.call(settings, 'debugMode'), 'debugMode is deleted from the settings object');
check(settings.maxIterations === 100 && settings.apiKey === 'k', 'other keys stay in the settings object');

sync.reset({ debugMode: false });
sync.noteTouched('debugMode');
result = sync.noteStorageChanges({ debugMode: { oldValue: false, newValue: true } }, 'local');
check(sameJson(result.apply, {}), 'a touched debugMode is not applied');
settings = fullSettings({ debugMode: false });
dropped = sync.filterForSave(settings);
check(dropped.length === 0 && settings.debugMode === false, 'filterForSave keeps the touched debugMode (the user edit wins)');

// Provider group.
sync.reset({ providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4-1-fast' });
result = sync.noteStorageChanges({
  modelProvider: { oldValue: 'xai', newValue: 'gemini' },
  modelName: { oldValue: 'grok-4-1-fast', newValue: 'gemini-2.5-flash' }
}, 'local');
check(sameJson(result.apply, { modelProvider: 'gemini', modelName: 'gemini-2.5-flash' }),
  'an untouched provider-group change is applied');
settings = fullSettings();
dropped = sync.filterForSave(settings);
check(sameJson(dropped.slice().sort(), ['modelName', 'modelProvider']), 'filterForSave drops both changed provider keys');
check(settings.providerKind === 'api' && settings.agentProviderId === '', 'unchanged provider keys stay');

sync.reset({ providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4-1-fast' });
sync.noteTouched('modelName');
result = sync.noteStorageChanges({
  modelProvider: { oldValue: 'xai', newValue: 'gemini' },
  modelName: { oldValue: 'grok-4-1-fast', newValue: 'gemini-2.5-flash' }
}, 'local');
check(!sync.PROVIDER_GROUP_KEYS.some((k) => Object.prototype.hasOwnProperty.call(result.apply, k)),
  'touching modelName keeps every provider key out of apply');
settings = fullSettings();
dropped = sync.filterForSave(settings);
check(dropped.length === 0, 'touching modelName means no provider key is dropped');
check(sync.PROVIDER_GROUP_KEYS.every((k) => Object.prototype.hasOwnProperty.call(settings, k)), 'all four provider keys are written');

sync.reset({});
sync.noteTouched('providerKind');
result = sync.noteStorageChanges({ agentProviderId: { newValue: 'grok-build' } }, 'local');
check(sameJson(result.apply, {}), 'touching providerKind marks agentProviderId touched too');

// WR-03: the Save-time provider guards run only when the Save writes the
// provider group, so an MCP switch to lmstudio (empty model) cannot lock an
// unrelated Save.
sync.reset({ providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4-1-fast', debugMode: false });
check(sync.willWriteProviderGroup() === true, 'after a load the Save writes the provider group');
sync.noteStorageChanges({ debugMode: { oldValue: false, newValue: true } }, 'local');
check(sync.willWriteProviderGroup() === true, 'an external non-provider change keeps the provider group written');
sync.noteStorageChanges({
  modelProvider: { oldValue: 'xai', newValue: 'lmstudio' },
  modelName: { oldValue: 'grok-4-1-fast', newValue: '' }
}, 'local');
check(sync.willWriteProviderGroup() === false, 'an untouched external provider change means the Save leaves the group out');
settings = fullSettings({ modelProvider: 'lmstudio', modelName: 'grok-4-1-fast', debugMode: false });
dropped = sync.filterForSave(settings);
check(dropped.indexOf('modelProvider') !== -1 && dropped.indexOf('modelName') !== -1,
  'and filterForSave does drop the changed provider keys');
sync.noteTouched('debugMode');
check(sync.willWriteProviderGroup() === false, 'touching an unrelated field does not make the Save write the provider group');
sync.noteTouched('modelName');
check(sync.willWriteProviderGroup() === true, 'touching the provider group makes the Save write it (the guards run)');
sync.noteSaved(['providerKind', 'agentProviderId', 'modelProvider', 'modelName', 'debugMode']);
check(sync.willWriteProviderGroup() === true, 'after a Save that wrote the group nothing is pending');

// Area and key filters.
sync.reset({});
result = sync.noteStorageChanges({ debugMode: { newValue: true } }, 'session');
check(sameJson(result.apply, {}), 'area session is ignored');
check(sync.filterForSave(fullSettings()).length === 0, 'an ignored area marks nothing pending');
result = sync.noteStorageChanges({ debugMode: { newValue: true } }, 'sync');
check(sameJson(result.apply, {}) && sync.filterForSave(fullSettings()).length === 0, 'area sync is ignored');
result = sync.noteStorageChanges({
  fsbAgentRegistry: { newValue: { records: {} } },
  fsbConsentPolicies: { newValue: {} },
  fsbUsageData: { newValue: [] }
}, 'local');
const probe = { fsbAgentRegistry: 1, fsbConsentPolicies: 2, fsbUsageData: 3 };
check(sameJson(result.apply, {}) && sync.filterForSave(probe).length === 0 && Object.keys(probe).length === 3,
  'non-schema keys are ignored');
check(sameJson(sync.noteStorageChanges(null, 'local').apply, {}), 'null changes are ignored');

// Secrets and endpoints.
sync.reset({});
result = sync.noteStorageChanges({
  apiKey: { newValue: 'SENTINEL-secret' },
  geminiApiKey: { newValue: 'SENTINEL-secret-2' },
  customEndpoint: { newValue: 'https://example.test/v1' },
  lmstudioBaseUrl: { newValue: 'http://127.0.0.1:9999' },
  serverHashKey: { newValue: 'SENTINEL-hash' }
}, 'local');
check(sameJson(result.apply, {}), 'secret and endpoint keys never appear in apply');
settings = fullSettings({ geminiApiKey: 'g', customEndpoint: 'c', lmstudioBaseUrl: 'l' });
dropped = sync.filterForSave(settings);
check(sameJson(dropped.slice().sort(), ['apiKey', 'customEndpoint', 'geminiApiKey', 'lmstudioBaseUrl']),
  'externally changed secrets and endpoints are pending, so Save does not overwrite them');

// ---------------------------------------------------------------------------
section('Self-write records');
// ---------------------------------------------------------------------------

sync.reset({ maxIterations: 100, debugMode: false });
sync.noteSelfWrite({ maxIterations: 120, debugMode: false });
check(sameJson(sync.inspect().selfWriteKeys, ['maxIterations']), 'noteSelfWrite records only the key whose value changes');
result = sync.noteStorageChanges({ maxIterations: { oldValue: 100, newValue: 120 } }, 'local');
check(sameJson(result.apply, {}), 'the echo of a self-write is not applied');
check(sync.filterForSave(fullSettings()).length === 0, 'the echo of a self-write is not pending');
check(sync.inspect().selfWriteKeys.length === 0, 'the echo consumes the self-write record');
result = sync.noteStorageChanges({ maxIterations: { oldValue: 120, newValue: 150 } }, 'local');
check(sameJson(result.apply, { maxIterations: 150 }), 'a later external change of the same key is applied');
check(sameJson(sync.filterForSave(fullSettings()), ['maxIterations']), 'a later external change of the same key is pending');

// Checker W8: an unchanged rewrite leaves no record that could swallow a real change.
sync.reset({ maxIterations: 100 });
sync.noteSelfWrite({ maxIterations: 100 });
check(sync.inspect().selfWriteKeys.length === 0, 'rewriting an unchanged value records nothing');
result = sync.noteStorageChanges({ maxIterations: { oldValue: 100, newValue: 150 } }, 'local');
check(sameJson(result.apply, { maxIterations: 150 }), 'external change to 150 is applied');
result = sync.noteStorageChanges({ maxIterations: { oldValue: 150, newValue: 100 } }, 'local');
check(sameJson(result.apply, { maxIterations: 100 }), 'external change back to 100 is applied, not swallowed as a self-write');

// Two quick saves of the same new value produce one echo and one record.
sync.reset({ maxIterations: 100 });
sync.noteSelfWrite({ maxIterations: 120 });
sync.noteSelfWrite({ maxIterations: 120 });
sync.noteStorageChanges({ maxIterations: { oldValue: 100, newValue: 120 } }, 'local');
check(sync.inspect().selfWriteKeys.length === 0, 'two saves of one new value leave no stale record');
result = sync.noteStorageChanges({ maxIterations: { oldValue: 120, newValue: 100 } }, 'local');
check(sameJson(result.apply, { maxIterations: 100 }), 'a later external change back is still seen');

// A key absent from the snapshot is recorded (its first write produces an echo).
sync.reset({});
sync.noteSelfWrite({ debugMode: false });
check(sameJson(sync.inspect().selfWriteKeys, ['debugMode']), 'a key absent from lastKnown is recorded');
sync.noteStorageChanges({ debugMode: { newValue: false } }, 'local');
check(sync.inspect().selfWriteKeys.length === 0 && sync.filterForSave(fullSettings()).length === 0,
  'its echo is consumed and not pending');

// lastKnown follows every change, self or external.
sync.reset({ debugMode: false });
sync.noteStorageChanges({ debugMode: { oldValue: false, newValue: true } }, 'local');
sync.noteSelfWrite({ debugMode: true });
check(sync.inspect().selfWriteKeys.length === 0, 'lastKnown is updated by external changes (rewriting the new value records nothing)');

// Non-schema keys and non-objects are not recorded.
sync.reset({});
sync.noteSelfWrite({ fsbUsageData: [1], speedMode: 'fast' });
sync.noteSelfWrite(null);
sync.noteSelfWrite('debugMode');
check(sync.inspect().selfWriteKeys.length === 0, 'non-schema keys and non-objects are not recorded');

// ---------------------------------------------------------------------------
section('noteSaved and reset');
// ---------------------------------------------------------------------------

sync.reset({ debugMode: false, modelProvider: 'xai' });
sync.noteTouched('debugMode');
sync.noteStorageChanges({ modelProvider: { oldValue: 'xai', newValue: 'gemini' } }, 'local');
settings = fullSettings({ debugMode: true });
dropped = sync.filterForSave(settings);
check(sameJson(dropped, ['modelProvider']), 'the Save drops the pending modelProvider');
sync.noteSaved(Object.keys(settings));
let state = sync.inspect();
check(state.touched.length === 0, 'noteSaved clears the touched set');
check(sameJson(state.pending, ['modelProvider']), 'noteSaved keeps the dropped modelProvider pending');
sync.noteStorageChanges({ debugMode: { oldValue: false, newValue: true } }, 'local');
sync.noteSaved(['debugMode']);
check(sameJson(sync.inspect().pending, ['modelProvider']), 'noteSaved removes written keys from pending');

// IN-04: a field first edited while the Save's storage write is in flight
// stays touched; only the keys touched at the click are cleared.
sync.reset({ debugMode: false, maxIterations: 100 });
sync.noteTouched('debugMode');
const touchedAtClick = sync.inspect().touched;
sync.noteTouched('maxIterations'); // edited after the click, before the callback
sync.noteSaved(['debugMode', 'maxIterations'], touchedAtClick);
check(sameJson(sync.inspect().touched, ['maxIterations']), 'noteSaved clears only the keys touched when Save was clicked');
result = sync.noteStorageChanges({ maxIterations: { oldValue: 100, newValue: 300 } }, 'local');
check(sameJson(result.apply, {}), 'so an external write does not overwrite the in-flight edit');
sync.noteSaved([], 'not-an-array');
check(sync.inspect().touched.length === 0, 'noteSaved without a touched list clears every touched mark');

sync.noteTouched('maxIterations');
sync.noteSelfWrite({ maxIterations: 300 });
sync.reset({});
state = sync.inspect();
check(state.touched.length === 0 && state.pending.length === 0 && state.selfWriteKeys.length === 0,
  'reset({}) clears touched, pending and self-writes');
sync.reset('not-an-object');
check(sync.inspect().lastKnownKeys.length === 0, 'reset with a non-object seeds an empty lastKnown');
sync.reset({ debugMode: true, fsbUsageData: [1], maxIterations: 200 });
check(sameJson(sync.inspect().lastKnownKeys.slice().sort(), ['debugMode', 'maxIterations']),
  'reset seeds lastKnown with schema keys only');
check(JSON.stringify(sync.inspect()).indexOf('200') === -1, 'inspect() exposes key names, never values');

// ---------------------------------------------------------------------------
section('applyToForm: simple fields');
// ---------------------------------------------------------------------------

function makeCounters() {
  const calls = {};
  const deps = {};
  const counted = (name, fn) => {
    calls[name] = [];
    deps[name] = (...args) => {
      calls[name].push(args);
      return fn ? fn(...args) : undefined;
    };
  };
  return { calls, deps, counted };
}

function simpleDeps() {
  const c = makeCounters();
  c.counted('getElement', (id) => registry.get(id) || null);
  c.counted('refreshStepper');
  c.counted('setAgentCap');
  c.counted('setPersistedVoiceInputEnabled');
  for (const name of ['getProviderState', 'getPersistedProviderSelection', 'setPersistedProviderSelection',
    'normalizeProviderSettings', 'invalidateDiscovery', 'updateApiKeyVisibility', 'updateModelDescription',
    'setDiscoveryStatus', 'setControlsDisabled', 'refreshCombobox', 'renderProviderKind', 'syncSelectLabels',
    'createOption']) {
    c.counted(name);
  }
  return c;
}

const PROVIDER_DEP_NAMES = ['getProviderState', 'getPersistedProviderSelection', 'setPersistedProviderSelection',
  'normalizeProviderSettings', 'invalidateDiscovery', 'updateApiKeyVisibility', 'updateModelDescription',
  'setDiscoveryStatus', 'setControlsDisabled', 'refreshCombobox', 'renderProviderKind', 'syncSelectLabels',
  'createOption'];

buildRegistry();
dispatchCount = 0;
fetchCalls = 0;
let c = simpleDeps();
registry.get('voiceInputEnabled').checked = true;
registry.get('sttProvider').checked = false;
let applied = sync.applyToForm({ maxIterations: 150, voiceInputEnabled: false, sttProvider: 'whisper', fsbAgentCap: 12 }, c.deps);
check(String(registry.get('maxIterations').value) === '150', 'maxIterations hidden input updated');
check(String(registry.get('maxIterationsSlider').value) === '150', 'maxIterations stepper input updated');
check(String(registry.get('maxIterationsDisplay').textContent) === '150', 'maxIterations display updated');
check(c.calls.refreshStepper.some((args) => args[0] === registry.get('maxIterationsSlider')), 'the maxIterations stepper is refreshed');
check(registry.get('voiceInputEnabled').checked === false, 'voiceInputEnabled unchecked');
check(sameJson(c.calls.setPersistedVoiceInputEnabled, [[false]]), 'the voice baseline is set to false through deps');
check(registry.get('sttProvider').checked === true, 'sttProvider checked for whisper');
check(sameJson(c.calls.setAgentCap, [[12]]), 'the agent-cap setter receives 12');
check(PROVIDER_DEP_NAMES.every((name) => c.calls[name].length === 0), 'no provider dep is called without a provider key');
check(fetchCalls === 0, 'no fetch');
check(dispatchCount === 0, 'no element event is dispatched');
check(sameJson(applied.slice().sort(), ['fsbAgentCap', 'maxIterations', 'sttProvider', 'voiceInputEnabled']),
  'applyToForm returns the keys it refreshed');

buildRegistry();
c = simpleDeps();
sync.applyToForm({
  debugMode: true, domOptimization: false, maxDOMElements: 3000, prioritizeViewport: false,
  animatedActionHighlights: false, showSidepanelProgress: false, enableLogin: false,
  captchaSolverEnabled: true, autoRefineSiteMaps: false, fsbTriggerCap: 99,
  fsbChangeReportsEnabled: false, fsbMcpSessionRecordingEnabled: false, fsbMcpSessionRetentionDays: 400,
  autoAnalyzeMemories: false, fsbTelemetryOptOut: true
}, c.deps);
check(registry.get('debugMode').checked === true, 'debugMode checked');
check(registry.get('domOptimization').checked === false, 'domOptimization unchecked');
check(String(registry.get('maxDOMElements').value) === '3000' && String(registry.get('maxDOMElementsSlider').value) === '3000'
  && String(registry.get('maxDOMElementsDisplay').textContent) === '3000', 'maxDOMElements triplet updated');
check(registry.get('prioritizeViewport').checked === false && registry.get('animatedActionHighlights').checked === false
  && registry.get('showSidepanelProgress').checked === false, 'viewport, highlights and progress checkboxes updated');
check(registry.get('captchaSolverEnabled').checked === true, 'captchaSolverEnabled checked');
check(registry.get('captchaSolverConfig').style.display === 'block', 'the CAPTCHA config panel visibility follows (updateCaptchaSolverVisibility)');
check(registry.get('autoRefineSiteMaps').checked === false, 'autoRefineSiteMaps unchecked');
check(String(registry.get('fsbTriggerCap').value) === '64' && String(registry.get('fsbTriggerCapDisplay').textContent) === '64',
  'fsbTriggerCap clamps to 64 like the load path');
check(registry.get('fsbChangeReportsEnabled').checked === false && registry.get('fsbMcpSessionRecordingEnabled').checked === false,
  'change-report and recording toggles updated');
check(String(registry.get('fsbMcpSessionRetentionDays').value) === '365', 'retention days clamp to 365 like the load path');
check(registry.get('autoAnalyzeToggle').checked === false, 'autoAnalyzeToggle follows autoAnalyzeMemories');
check(registry.get('fsbTelemetryOptOut').checked === false, 'the telemetry toggle is inverse: opted out shows unchecked');
const ariaOff = registry.get('fsbTelemetryOptOut').getAttribute('aria-label');
check(typeof ariaOff === 'string' && INSTALL_IDENTITY_UI_SOURCE.includes("'" + ariaOff + "'"),
  'the telemetry aria-label matches install-identity-ui.js');
sync.applyToForm({ fsbTelemetryOptOut: false }, c.deps);
const ariaOn = registry.get('fsbTelemetryOptOut').getAttribute('aria-label');
check(registry.get('fsbTelemetryOptOut').checked === true && ariaOn !== ariaOff
  && INSTALL_IDENTITY_UI_SOURCE.includes("'" + ariaOn + "'"), 'telemetry on shows checked with the matching aria-label');
check(PROVIDER_DEP_NAMES.every((name) => c.calls[name].length === 0), 'still no provider dep');

// elementCacheSize: preset, custom, and the custom-select label sync.
buildRegistry();
c = simpleDeps();
sync.applyToForm({ elementCacheSize: 500 }, c.deps);
check(String(registry.get('elementCacheSize').value) === '500' && String(registry.get('elementCacheSizeDisplay').textContent) === '500',
  'elementCacheSize hidden input and display updated');
check(registry.get('elementCacheSizePreset').value === '500' && registry.get('elementCacheSizeCustomWrap').style.display === 'none',
  'a preset value selects the preset and hides the custom stepper');
check(c.calls.syncSelectLabels.length === 1, 'the custom-select labels are re-synced once');
sync.applyToForm({ elementCacheSize: 333 }, c.deps);
check(registry.get('elementCacheSizePreset').value === 'custom' && registry.get('elementCacheSizeCustomWrap').style.display === ''
  && String(registry.get('elementCacheSizeCustom').value) === '333', 'a non-preset value switches to the custom stepper');

// Removal (no newValue) refreshes to the effective default.
buildRegistry();
c = simpleDeps();
registry.get('debugMode').checked = true;
sync.applyToForm({ debugMode: undefined, maxIterations: undefined }, c.deps);
check(registry.get('debugMode').checked === false && String(registry.get('maxIterations').value) === '100',
  'a removed key refreshes to its default');

// Secrets, endpoints and unknown keys are never written to the form.
buildRegistry();
c = simpleDeps();
registry.get('apiKey').value = 'typed';
applied = sync.applyToForm({ apiKey: 'SENTINEL', customEndpoint: 'x', lmstudioBaseUrl: 'y', serverUrl: 'z', notAKey: 1 }, c.deps);
check(registry.get('apiKey').value === 'typed' && registry.get('customEndpoint').value === ''
  && registry.get('lmstudioBaseUrl').value === '' && registry.get('serverUrl').value === '', 'secret and endpoint inputs are never touched');
check(applied.length === 0, 'nothing is reported as applied');
check(sameJson(sync.applyToForm(null, c.deps), []), 'applyToForm(null) is a no-op');

// ---------------------------------------------------------------------------
section('applyToForm: provider refresh');
// ---------------------------------------------------------------------------

function providerDeps(stateInit, persistedInit, normalize) {
  const c2 = simpleDeps();
  const state = Object.assign({ requiresProviderReselection: false, retiredAgentProviderId: '' }, stateInit);
  let persisted = Object.assign({}, persistedInit);
  c2.state = state;
  c2.persisted = () => persisted;
  c2.counted('getProviderState', () => state);
  c2.counted('getPersistedProviderSelection', () => persisted);
  c2.counted('setPersistedProviderSelection', (obj) => { persisted = obj; });
  c2.counted('normalizeProviderSettings', normalize || ((obj) => ({
    providerKind: obj.providerKind,
    modelProvider: obj.modelProvider,
    agentProviderId: obj.agentProviderId,
    requiresProviderReselection: false,
    retiredAgentProviderId: ''
  })));
  c2.counted('createOption', () => makeEl('option'));
  return c2;
}

buildRegistry();
dispatchCount = 0;
fetchCalls = 0;
let p = providerDeps(
  { providerKind: 'api', modelProvider: 'xai', agentProviderId: '' },
  { providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4-1-fast' }
);
registry.get('modelProvider').value = 'xai';
registry.get('modelName').value = 'grok-4-1-fast';
sync.applyToForm({ modelProvider: 'gemini', modelName: 'gemini-2.5-flash' }, p.deps);
check(p.state.modelProvider === 'gemini' && p.state.providerKind === 'api', 'the provider state moves to gemini');
check(registry.get('modelProvider').value === 'gemini', 'the modelProvider select shows gemini');
const modelSel = registry.get('modelName');
check(modelSel.options.length === 1 && modelSel.options[0].value === 'gemini-2.5-flash'
  && modelSel.options[0].textContent === 'gemini-2.5-flash', 'the model select holds only the stored gemini model');
check(modelSel.value === 'gemini-2.5-flash', 'the stored model is selected');
check(sameJson(p.calls.updateApiKeyVisibility, [['gemini']]), 'updateApiKeyVisibility(gemini) once');
for (const name of ['invalidateDiscovery', 'refreshCombobox', 'renderProviderKind', 'syncSelectLabels']) {
  check(p.calls[name].length === 1, name + ' called exactly once');
}
check(sameJson(p.calls.updateModelDescription, [['']]), 'the model description resets for the new provider');
check(p.calls.setDiscoveryStatus.length === 1 && p.calls.setDiscoveryStatus[0][0].kind === 'info'
  && /Provider changed outside this panel/.test(p.calls.setDiscoveryStatus[0][0].text), 'an info status explains the change');
check(sameJson(p.calls.setControlsDisabled, [[false]]), 'the model controls are re-enabled for the new provider');
check(sameJson(p.calls.setPersistedProviderSelection, [[{ providerKind: 'api', modelProvider: 'gemini', modelName: 'gemini-2.5-flash' }]]),
  'the persisted selection baseline equals the shown selection');
check(p.calls.normalizeProviderSettings.length === 1, 'the provider settings are normalised once');
check(p.calls.invalidateDiscovery.length === 1 && p.calls.createOption.length === 1, 'one option is created');
check(fetchCalls === 0 && dispatchCount === 0, 'no fetch and no dispatched events during the provider refresh');

// Same-provider model change.
buildRegistry();
p = providerDeps(
  { providerKind: 'api', modelProvider: 'xai', agentProviderId: '' },
  { providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4-1-fast' }
);
registry.get('modelName').value = 'grok-4-1-fast';
sync.applyToForm({ modelName: 'grok-4' }, p.deps);
check(registry.get('modelName').options.length === 3, 'an existing model keeps the option list');
check(registry.get('modelName').value === 'grok-4', 'the existing option is selected');
check(p.calls.updateModelDescription.length === 0 && p.calls.setDiscoveryStatus.length === 0
  && p.calls.setControlsDisabled.length === 0, 'no description reset, status or control change for the same provider');
check(p.calls.createOption.length === 0, 'no option is created when it already exists');
check(sameJson(p.calls.setPersistedProviderSelection, [[{ providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4' }]]),
  'the baseline follows the new model');
sync.applyToForm({ modelName: 'grok-5-preview' }, p.deps);
check(registry.get('modelName').options.length === 4 && registry.get('modelName').value === 'grok-5-preview',
  'a model the list lacks is appended and selected');

// Agent switch.
buildRegistry();
p = providerDeps(
  { providerKind: 'api', modelProvider: 'xai', agentProviderId: 'claude-code' },
  { providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4-1-fast' }
);
registry.get('modelName').value = 'grok-4-1-fast';
sync.applyToForm({ providerKind: 'agent' }, p.deps);
check(p.state.providerKind === 'agent', 'the provider state switches to agent');
check(registry.get('modelProvider').value === 'claude-code', 'the modelProvider select shows the agent id');
check(registry.get('modelName').options.length === 3 && registry.get('modelName').value === 'grok-4-1-fast',
  'the model select options are untouched');
check(sameJson(p.persisted(), { providerKind: 'agent', modelProvider: 'xai', modelName: 'grok-4-1-fast' }),
  'the baseline persists providerKind agent');

// Real normaliser: a retired agent stays in the reselection state.
const providersPanel = require('../extension/ui/providers-panel.js');
buildRegistry();
p = providerDeps(
  { providerKind: 'agent', modelProvider: 'xai', agentProviderId: '', requiresProviderReselection: true, retiredAgentProviderId: 'codex' },
  { providerKind: 'agent', modelProvider: 'xai', modelName: 'grok-4-1-fast' },
  (obj) => providersPanel.normalizeSettings(obj)
);
sync.applyToForm({ modelName: 'grok-4' }, p.deps);
check(p.state.requiresProviderReselection === true && p.state.retiredAgentProviderId === 'codex',
  'a model-only change keeps the retired-agent reselection state');
check(registry.get('modelProvider').value === '', 'the provider select stays blank while reselection is required');
sync.applyToForm({ providerKind: 'api' }, p.deps);
check(p.state.requiresProviderReselection === false && p.state.providerKind === 'api'
  && registry.get('modelProvider').value === 'xai', 'an external switch to api clears the reselection state');

// An unknown provider id is normalised by the real helper (never shown raw).
buildRegistry();
p = providerDeps(
  { providerKind: 'api', modelProvider: 'gemini', agentProviderId: '' },
  { providerKind: 'api', modelProvider: 'gemini', modelName: 'gemini-2.5-flash' },
  (obj) => providersPanel.normalizeSettings(obj)
);
sync.applyToForm({ modelProvider: 'not-a-provider' }, p.deps);
check(p.state.modelProvider === 'xai', 'an unknown provider normalises to xai like the load path');

// ---------------------------------------------------------------------------
section('reconcile: writes that land while the load is awaiting (WR-05)');
// ---------------------------------------------------------------------------

// The load seeds the sync, an external write arrives during its awaits and is
// shown, then the load resumes and paints its older snapshot over it.
buildRegistry();
c = simpleDeps();
sync.reset({ debugMode: false, maxIterations: 100, enableLogin: false });
result = sync.noteStorageChanges({ debugMode: { oldValue: false, newValue: true } }, 'local');
sync.applyToForm(result.apply, c.deps);
check(registry.get('debugMode').checked === true, 'the external debugMode write is shown during the load');
registry.get('debugMode').checked = false; // the resumed load paints its stale snapshot
applied = sync.reconcile(c.deps);
check(registry.get('debugMode').checked === true, 'reconcile shows the stored debugMode again');
check(sameJson(applied, ['debugMode']), 'reconcile returns the keys it refreshed');
check(sameJson(sync.inspect().pending, ['debugMode']), 'reconcile leaves the key pending, so Save still leaves it out');

// A touched key keeps the user edit; a self-write echo is not pending.
sync.reset({ debugMode: false, maxIterations: 100 });
sync.noteStorageChanges({ debugMode: { oldValue: false, newValue: true } }, 'local');
sync.noteTouched('debugMode');
sync.noteSelfWrite({ maxIterations: 120 });
sync.noteStorageChanges({ maxIterations: { oldValue: 100, newValue: 120 } }, 'local');
buildRegistry();
c = simpleDeps();
registry.get('debugMode').checked = false;
check(sameJson(sync.reconcile(c.deps), []) && registry.get('debugMode').checked === false,
  'reconcile leaves a touched key and the panel\'s own write alone');

// A key removed outside the panel refreshes to its default.
sync.reset({ enableLogin: true });
sync.noteStorageChanges({ enableLogin: { oldValue: true } }, 'local');
buildRegistry();
c = simpleDeps();
registry.get('enableLogin').checked = true;
check(sameJson(sync.reconcile(c.deps), ['enableLogin']) && registry.get('enableLogin').checked === false,
  'a removed key reconciles to its default');

// Secrets and endpoints are never written to the form, even when pending.
sync.reset({});
sync.noteStorageChanges({ apiKey: { newValue: 'SENTINEL-secret' }, customEndpoint: { newValue: 'https://e.test' } }, 'local');
buildRegistry();
c = simpleDeps();
check(sameJson(sync.reconcile(c.deps), []) && registry.get('apiKey').value === '' && registry.get('customEndpoint').value === '',
  'reconcile never writes a secret or endpoint input');
check(c.calls.getElement.length === 0, 'with nothing to refresh reconcile touches no control');

// The provider group: the load put back the old provider and its baseline.
buildRegistry();
p = providerDeps(
  { providerKind: 'api', modelProvider: 'xai', agentProviderId: '' },
  { providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4-1-fast' }
);
sync.reset({ providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4-1-fast' });
sync.noteStorageChanges({
  modelProvider: { oldValue: 'xai', newValue: 'gemini' },
  modelName: { oldValue: 'grok-4-1-fast', newValue: 'gemini-2.5-flash' }
}, 'local');
fetchCalls = 0;
applied = sync.reconcile(p.deps);
check(p.state.modelProvider === 'gemini' && registry.get('modelProvider').value === 'gemini',
  'reconcile moves the provider state and select back to the stored provider');
check(registry.get('modelName').value === 'gemini-2.5-flash', 'reconcile selects the stored model');
check(sameJson(p.persisted(), { providerKind: 'api', modelProvider: 'gemini', modelName: 'gemini-2.5-flash' }),
  'reconcile moves the persisted provider baseline to the stored selection');
check(p.calls.invalidateDiscovery.length === 1, 'reconcile cancels discovery for the stale provider');
check(sameJson(applied.slice().sort(), ['modelName', 'modelProvider']), 'reconcile reports both provider keys');
check(fetchCalls === 0, 'reconcile makes no network call');
sync.reset({});

// ---------------------------------------------------------------------------
section('No-schema safety');
// ---------------------------------------------------------------------------

const savedSchema = global.FsbSettingsSchema;
global.FsbSettingsSchema = undefined;
sync.reset({ debugMode: false });
sync.noteTouched('debugMode');
result = sync.noteStorageChanges({ debugMode: { newValue: true } }, 'local');
settings = fullSettings();
check(sameJson(result.apply, {}) && sync.filterForSave(settings).length === 0 && settings.debugMode === false,
  'without FsbSettingsSchema nothing is applied or dropped');
check(sync.keyForElementId('debugMode') === null, 'without FsbSettingsSchema no id maps to a key');
check(sync.willWriteProviderGroup() === true, 'without FsbSettingsSchema the provider guards always run');
global.FsbSettingsSchema = savedSchema;
sync.reset({});

// ---------------------------------------------------------------------------
section('Source contract: saveSettings, loadSettings, discardChanges');
// ---------------------------------------------------------------------------

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) return '';
  const end = text.indexOf(endMarker, start + startMarker.length);
  return end === -1 ? '' : text.slice(start, end);
}

// .trim() calls in the saveSettings slice at 469907cb (8a058bdf source), measured
// once while implementing 66.1-04: selectedModelName, the LM Studio URL, the
// seven key/endpoint inputs and the CAPTCHA key. CI uses shallow clones, so the
// test never calls git.
const BASELINE_SAVE_SETTINGS_TRIM_COUNT = 10;

const saveSlice = between(OPTIONS_SOURCE, 'function saveSettings() {', 'function discardChanges() {');
check(saveSlice !== '', 'the saveSettings slice is found');
const lmGuardAt = saveSlice.indexOf('validateLmStudioSettingsSelection(normalizedProviderSettings, selectedModelName)');
const filterAt = saveSlice.indexOf('filterForSave(settings)');
const selfWriteAt = saveSlice.indexOf('noteSelfWrite(settings)');
const storageWriteAt = saveSlice.indexOf('chrome.storage.local.set(settings');
check(lmGuardAt !== -1 && filterAt > lmGuardAt && selfWriteAt > filterAt && storageWriteAt > selfWriteAt,
  'saveSettings runs the LM guard, then filterForSave(settings), then noteSelfWrite(settings), then the storage write');
// WR-03: both provider guards sit inside the branch that runs only when this
// Save writes the provider group.
check(/const providerGroupWritten = !globalThis\.FSBSettingsSync\s*\|\| globalThis\.FSBSettingsSync\.willWriteProviderGroup\(\);\s*if \(providerGroupWritten\) \{\s*if \(!validateLmStudioSettingsSelection\(normalizedProviderSettings, selectedModelName\)\) return false;\s*if \(!validateHostedApiSettingsSelection\(normalizedProviderSettings, selectedModelName\)\) return false;\s*\}/.test(saveSlice),
  'saveSettings runs the LM and hosted guards only when willWriteProviderGroup() says the Save writes the provider group');
check(saveSlice.split('validateLmStudioSettingsSelection(').length - 1 === 1
  && saveSlice.split('validateHostedApiSettingsSelection(').length - 1 === 1,
'saveSettings calls each provider guard once');
check(saveSlice.split('filterForSave(').length - 1 === 1 && saveSlice.split('noteSelfWrite(').length - 1 === 1,
  'saveSettings filters and records once');
check(saveSlice.includes("modelName: selectedModelName || persistedProviderSelection.modelName || 'grok-4-1-fast',"),
  'the exact modelName fallback line is still present');
const trimCount = (saveSlice.match(/\.trim\(\)/g) || []).length;
check(trimCount === BASELINE_SAVE_SETTINGS_TRIM_COUNT && trimCount >= 9,
  'saveSettings keeps its ' + BASELINE_SAVE_SETTINGS_TRIM_COUNT + ' .trim() calls (got ' + trimCount + ')');
check(!/\n\s*(?:async\s+)?function\s+\w+\s*\(/.test(saveSlice.slice('function saveSettings() {'.length)),
  'no function is declared between saveSettings and discardChanges');

const callback = saveSlice.slice(storageWriteAt);
check(/const wroteVoiceInput = Object\.prototype\.hasOwnProperty\.call\(settings, 'voiceInputEnabled'\);/.test(callback),
  'the Save callback checks whether voiceInputEnabled was written');
check(/if \(wroteVoiceInput\) persistedVoiceInputEnabled = settings\.voiceInputEnabled;/.test(callback),
  'persistedVoiceInputEnabled moves only when voiceInputEnabled was written');
check(/if \(voiceInputSettingsController && wroteVoiceInput\) \{\s*void voiceInputSettingsController\.handleSavedChange\(\s*previousVoiceInputEnabled,\s*settings\.voiceInputEnabled/.test(callback),
  'handleSavedChange runs only when voiceInputEnabled was written');
for (const field of ['providerKind', 'modelProvider', 'modelName']) {
  check(new RegExp(field + ": wrote\\('" + field + "'\\) \\? settings\\." + field + ' : previousProviderSelection\\.' + field).test(callback),
    'persistedProviderSelection keeps its previous ' + field + ' when the key was dropped');
}
check(callback.includes('globalThis.FSBSettingsSync.noteSaved(Object.keys(settings), touchedAtSave)'),
  'noteSaved receives the keys actually written and the touched keys at Save');
// IN-04: the touched snapshot is taken before the storage write starts.
const touchedSnapshotAt = saveSlice.indexOf('touchedAtSave = globalThis.FSBSettingsSync.inspect().touched;');
check(touchedSnapshotAt > selfWriteAt && touchedSnapshotAt < storageWriteAt,
  'saveSettings snapshots the touched keys after recording its write and before chrome.storage.local.set');
check(/function discardChanges\(\) \{\s*loadSettings\(\);/.test(OPTIONS_SOURCE), 'discardChanges still starts with loadSettings()');
check(!OPTIONS_SOURCE.includes('FSB_DELEGATION_CLEAR_TRUST'), 'options.js does not mention FSB_DELEGATION_CLEAR_TRUST');

const loadSlice = between(OPTIONS_SOURCE, 'function loadSettings() {', '// ---------------------------------------------------------------------------\n// Phase 243');
check(/data = data \|\| \{\};\n\s*if \(globalThis\.FSBSettingsSync\) globalThis\.FSBSettingsSync\.reset\(data\);\n\s*fsbRecommendedAgentCap = await/.test(loadSlice),
  'loadSettings seeds the sync from its storage snapshot right after data = data || {}, before the first await');
check(/globalThis\.FSBSettingsSync\.noteSelfWrite\(\{ modelName: migratedModel \}\);\s*chrome\.storage\.local\.set\(\{ modelName: migratedModel \}, resolve\);/.test(loadSlice),
  'the LM Studio migration records its own write immediately before it');
// WR-05: the load reconciles once, after its last field fill and after every
// await, so an external write that landed during the load is shown again.
const reconcileAt = loadSlice.indexOf('if (globalThis.FSBSettingsSync) globalThis.FSBSettingsSync.reconcile();');
check(reconcileAt !== -1 && loadSlice.split('FSBSettingsSync.reconcile(').length - 1 === 1, 'loadSettings calls FSBSettingsSync.reconcile() once');
check(reconcileAt > loadSlice.lastIndexOf('await ')
  && reconcileAt > loadSlice.indexOf('elements.voiceInputEnabled.checked = voiceInputEnabled;')
  && reconcileAt < loadSlice.indexOf("addLog('info', 'Settings loaded successfully');"),
'loadSettings reconciles after its last await and field fill, before it reports the load');
const lmUrlAt = loadSlice.indexOf("lmstudioBaseUrl.value = settings.lmstudioBaseUrl || 'http://localhost:1234'");
check(lmUrlAt !== -1 && lmUrlAt < loadSlice.indexOf('discoveryResult = await setProviderSelection('),
  'the LM Studio URL is still restored before discovery starts');

// ---------------------------------------------------------------------------
section('Source contract: setupEventListeners and the IIFE');
// ---------------------------------------------------------------------------

const EXISTING_ON_CHANGED_BLOCK = [
  "    chrome.storage.onChanged.addListener((changes, area) => {",
  "      if (area === 'session' && changes && changes.fsbAgentRegistry) {",
  '        scheduleRefreshActiveAgentCount();',
  "      } else if (area === 'local' && changes && changes.fsbAgentCap) {",
  '        scheduleRefreshActiveAgentCount();',
  "      } else if (area === 'session' && changes && changes.fsbTriggerRegistry) {",
  '        scheduleRefreshActiveTriggerCount();',
  "      } else if (area === 'local' && changes && changes.fsbTriggerCap) {",
  '        scheduleRefreshActiveTriggerCount();',
  "      } else if (area === 'local' && changes",
  '          && (changes.fsbConsentPolicies || changes.fsbAuditLog)) {'
].join('\n');
const setupSlice = between(OPTIONS_SOURCE, 'function setupEventListeners() {', '\nfunction ');
const existingBlockAt = setupSlice.indexOf(EXISTING_ON_CHANGED_BLOCK);
const attachAt = setupSlice.indexOf("if (globalThis.FSBSettingsSync && typeof globalThis.FSBSettingsSync.attach === 'function') globalThis.FSBSettingsSync.attach();");
check(existingBlockAt !== -1, 'the existing chrome.storage.onChanged listener keeps its arms');
check(attachAt > existingBlockAt, 'setupEventListeners calls FSBSettingsSync.attach() after the existing listener block');
check(OPTIONS_SOURCE.split('FSBSettingsSync.attach()').length - 1 === 1, 'FSBSettingsSync.attach() is called exactly once');
check(setupSlice.split('chrome.storage.onChanged.addListener(').length - 1 === 2,
  'setupEventListeners still registers only its two existing listeners (the sync installs its own through attach)');

const iifeStart = OPTIONS_SOURCE.indexOf('/**\n * FSBSettingsSync (Phase 66.1');
const iifeEnd = OPTIONS_SOURCE.indexOf('// Export for potential use by other scripts', iifeStart);
const iifeText = iifeStart === -1 || iifeEnd === -1 ? '' : OPTIONS_SOURCE.slice(iifeStart, iifeEnd);
check(iifeText.length > 0 && iifeText.includes('global.FSBSettingsSync = Object.freeze(api);'), 'the FSBSettingsSync IIFE text is found');
check(iifeText.includes('persistedProviderSelection ='), 'the IIFE refreshes the persisted provider baseline');
for (const forbidden of ['setProviderSelection(', 'runDiscovery', 'runApiProviderSelectionPath(', 'updateModelOptions(',
  'loadSettings(', 'checkApiConnection(', 'markUnsavedChanges(', 'fetch(', 'dispatchEvent(', 'showToast(',
  'handleSavedChange(', 'console.log(']) {
  check(!iifeText.includes(forbidden), 'the IIFE never contains ' + forbidden);
}
check(!/[^\x00-\x7f]/.test(iifeText), 'the IIFE is plain ASCII');
check(!/function (?:renderProviderKind|refreshStepper|saveSettings|loadSettings|updateApiKeyVisibility)\(/.test(iifeText),
  'the IIFE declares no function that shadows an options.js function');

// ---------------------------------------------------------------------------
section('attach(): the live listeners under the shim');
// ---------------------------------------------------------------------------

buildRegistry();
dispatchCount = 0;
fetchCalls = 0;
documentListeners.length = 0;
onChangedListeners.length = 0;
global.FSBProvidersPanel = providersPanel;
const discoveryUi = global.FSBDiscoveryUI;
let runDiscoveryCalls = 0;
if (discoveryUi && !Object.isFrozen(discoveryUi) && typeof discoveryUi.runDiscovery === 'function') {
  const realRunDiscovery = discoveryUi.runDiscovery;
  discoveryUi.runDiscovery = function (...args) {
    runDiscoveryCalls += 1;
    return realRunDiscovery.apply(this, args);
  };
}

check(sync.attach() === true, 'attach() installs the listeners');
check(sync.attach() === false, 'a second attach() is a no-op');
check(onChangedListeners.length === 1, 'exactly one chrome.storage.onChanged listener is installed');
const captureTypes = documentListeners.filter((l) => l.options === true).map((l) => l.type).sort();
check(sameJson(captureTypes, ['change', 'click', 'input']), 'capture-phase input, change and click listeners are installed once');
const fireStorage = (changes, area) => onChangedListeners.forEach((fn) => fn(changes, area || 'local'));
const fireDocument = (type, target) => documentListeners
  .filter((l) => l.type === type)
  .forEach((l) => l.fn({ type, target }));

sync.reset({ maxIterations: 100, debugMode: false, providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4-1-fast' });
fireStorage({ maxIterations: { oldValue: 100, newValue: 150 } });
check(String(registry.get('maxIterations').value) === '150' && String(registry.get('maxIterationsSlider').value) === '150'
  && String(registry.get('maxIterationsDisplay').textContent) === '150', 'an external maxIterations write shows in the registry inputs');
fireStorage({ maxIterations: { oldValue: 150, newValue: 175 } }, 'session');
check(String(registry.get('maxIterations').value) === '150', 'a session-area change is ignored');

fireDocument('input', registry.get('maxIterationsSlider'));
fireStorage({ maxIterations: { oldValue: 150, newValue: 300 } });
check(String(registry.get('maxIterationsSlider').value) === '150', 'after an edit of the stepper an external write is not applied');
settings = fullSettings({ maxIterations: 150 });
check(sync.filterForSave(settings).indexOf('maxIterations') === -1 && settings.maxIterations === 150,
  'and the edited value is not dropped (the user edit wins)');

const resetButton = makeEl('button', 'fsbAgentCapReset');
const capLabel = makeEl('span');
capLabel.closest = (selector) => (selector.indexOf('#fsbAgentCapReset') !== -1 ? resetButton : null);
fireDocument('click', capLabel);
check(sync.inspect().touched.indexOf('fsbAgentCap') !== -1, 'a click inside the agent-cap reset button marks fsbAgentCap touched');
const plainClick = makeEl('div', 'maxDOMElementsSlider');
plainClick.closest = () => null;
fireDocument('click', plainClick);
check(sync.inspect().touched.indexOf('maxDOMElements') === -1, 'a plain click on a field does not mark it touched');

// WR-06: typing in the model filter box leaves the provider group untouched,
// so an external provider write is still shown and not reverted by Save; the
// combobox commit (change on #modelName) is the edit.
sync.reset({ providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4-1-fast' });
fireDocument('input', registry.get('modelSearch'));
check(sync.PROVIDER_GROUP_KEYS.every((key) => sync.inspect().touched.indexOf(key) === -1),
  'an input event on #modelSearch marks no provider key touched');
result = sync.noteStorageChanges({ modelProvider: { oldValue: 'xai', newValue: 'gemini' } }, 'local');
check(sameJson(result.apply, { modelProvider: 'gemini' }), 'after typing a filter an external provider write is still applied');
fireDocument('change', registry.get('modelName'));
check(sync.PROVIDER_GROUP_KEYS.every((key) => sync.inspect().touched.indexOf(key) !== -1),
  'a change event on #modelName (the combobox commit) marks the provider group touched');
check(/function _commit\(value\) \{[\s\S]*?_select\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\);/.test(OPTIONS_SOURCE),
  'the combobox commit still dispatches change on the model select');
sync.reset({});

// Provider group through the real default deps (no discovery, no network).
buildRegistry();
registry.get('modelProvider').value = 'xai';
registry.get('modelName').value = 'grok-4-1-fast';
sync.reset({ providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4-1-fast' });
fetchCalls = 0;
dispatchCount = 0;
runDiscoveryCalls = 0;
fireStorage({
  modelProvider: { oldValue: 'xai', newValue: 'gemini' },
  modelName: { oldValue: 'grok-4-1-fast', newValue: 'gemini-2.5-flash' }
});
check(registry.get('modelProvider').value === 'gemini', 'the provider select shows gemini');
check(registry.get('modelName').options.length === 1 && registry.get('modelName').value === 'gemini-2.5-flash',
  'the model select holds only the stored gemini model, selected');
check(registry.get('geminiApiKeyGroup').style.display === 'block' && registry.get('xaiApiKeyGroup').style.display === 'none',
  'the gemini API-key group is shown');
check(/Provider changed outside this panel/.test(registry.get('modelDiscoveryStatus').textContent), 'the discovery chip explains the change');
check(fetchCalls === 0, 'no fetch during the provider refresh');
check(runDiscoveryCalls === 0, 'FSBDiscoveryUI.runDiscovery is never called');
check(dispatchCount === 0, 'no element event is dispatched');
settings = fullSettings({ modelProvider: 'gemini', modelName: 'gemini-2.5-flash' });
check(sameJson(sync.filterForSave(settings).sort(), ['modelName', 'modelProvider']), 'a later Save drops both provider keys');

buildRegistry();
registry.get('modelProvider').value = 'xai';
registry.get('modelName').value = 'grok-4-1-fast';
sync.reset({ providerKind: 'api', modelProvider: 'gemini', modelName: 'gemini-2.5-flash' });
fireDocument('change', registry.get('modelProvider'));
fireStorage({
  modelProvider: { oldValue: 'gemini', newValue: 'openai' },
  modelName: { oldValue: 'gemini-2.5-flash', newValue: 'gpt-4.1-mini' }
});
check(registry.get('modelProvider').value === 'xai', 'after a provider edit the provider select is left alone');
check(registry.get('modelName').options.length === 3 && registry.get('modelName').value === 'grok-4-1-fast',
  'after a provider edit the model select is left alone');
settings = fullSettings();
check(sync.filterForSave(settings).length === 0 && sync.PROVIDER_GROUP_KEYS.every((k) => hasOwnKey(settings, k)),
  'after a provider edit no provider key is dropped');
check(fetchCalls === 0 && runDiscoveryCalls === 0, 'still no fetch and no discovery');

// The panel's own Save echo is not an external change.
sync.reset({ debugMode: false, maxIterations: 100 });
settings = fullSettings({ debugMode: true, maxIterations: 100 });
sync.filterForSave(settings);
sync.noteSelfWrite(settings);
fireStorage({ debugMode: { oldValue: false, newValue: true } });
sync.noteSaved(Object.keys(settings));
check(sync.inspect().pending.length === 0, 'the Save echo leaves nothing pending');
sync.reset({});

// ---------------------------------------------------------------------------
section('Parity: every writable schema key refreshes in place');
// ---------------------------------------------------------------------------

// filterForSave protects any schema key automatically. Showing the new value
// needs a refresher, so a writable key added to the schema (Phase 68's Jev
// switch) without one fails here instead of silently staying stale on screen.
const writableKeys = FsbSettingsSchema.keys().filter((key) => FsbSettingsSchema.isWritable(key));
check(writableKeys.length > 0 && sync.PROVIDER_GROUP_KEYS.every((key) => writableKeys.includes(key)),
  'the provider group keys are writable schema keys');
for (const key of writableKeys) {
  if (sync.PROVIDER_GROUP_KEYS.includes(key)) continue;
  buildRegistry();
  const parityDeps = simpleDeps();
  const refreshed = sync.applyToForm({ [key]: undefined }, parityDeps.deps);
  check(sameJson(refreshed, [key]), key + ' has an in-place refresh in FSBSettingsSync');
}
for (const key of FsbSettingsSchema.readOnlyKeys()) {
  sync.reset({});
  check(sameJson(sync.noteStorageChanges({ [key]: { newValue: 'x' } }, 'local').apply, {}),
    key + ' (read-only over MCP) is never refreshed from storage');
}
sync.reset({});

// ---------------------------------------------------------------------------
section('Registration');
// ---------------------------------------------------------------------------

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
check(pkg.scripts.test.split(' && ').filter((cmd) => cmd === 'node tests/settings-panel-sync.test.js').length === 1,
  'package.json test chain runs this suite exactly once');
const contract = fs.readFileSync(path.join(__dirname, 'delegation-phase-contract.test.js'), 'utf8');
check(contract.split("'node tests/settings-panel-sync.test.js',").length - 1 === 1,
  'REFINEMENT_ROOT_TEST_COMMANDS lists this suite exactly once');

// ---------------------------------------------------------------------------

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  console.error('Failures:\n - ' + failures.join('\n - '));
  process.exit(1);
}
process.exit(0);
