'use strict';

/**
 * Phase 228 Plan 02 — UI integration tests for model-discovery wiring.
 *
 * Two layers:
 *   1. Static-analysis assertions on control_panel.html / options.css /
 *      options.js — confirms the markup, styles, and required call sites
 *      exist (matches the project's prevailing test pattern,
 *      cf. tests/dashboard-metrics-render.test.js).
 *   2. Behavioral assertions on the discovery helper module exposed by
 *      options.js as globalThis.FSBDiscoveryUI — covers the truth table
 *      states, debounce, fresh-only hosted discovery, refresh, and
 *      lmstudio/custom behavior.
 *
 * GUARD-02: No real network calls. globalThis.discoverModels is mocked
 * in-process.
 *
 * Run: node tests/model-discovery-ui.test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    failures.push(msg);
    console.error('  FAIL:', msg);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

// ---------------------------------------------------------------------------
// Layer 1: Static analysis
// ---------------------------------------------------------------------------

const HTML = read('extension/ui/control_panel.html');
const CSS = read('extension/ui/options.css');
const JS  = read('extension/ui/options.js');

console.log('\n--- Plan 228-02 / Task 1: HTML markup ---');

assert(
  /<script\s+src="\.\.\/ai\/model-discovery\.js"><\/script>/.test(HTML),
  '[Task 1] control_panel.html includes model-discovery.js script tag'
);

// The discovery script must load BEFORE options.js so globalThis.discoverModels
// is defined when options.js wires its event handlers. Look at <script src=...>
// occurrences specifically (a code comment elsewhere mentions options.js too).
{
  const discIdx = HTML.indexOf('src="../ai/model-discovery.js"');
  const optIdx  = HTML.indexOf('src="options.js"');
  assert(
    discIdx > -1 && optIdx > -1 && discIdx < optIdx,
    '[Task 1] model-discovery.js script tag appears before options.js'
  );
}

assert(
  /id="refreshModelsBtn"/.test(HTML),
  '[Task 1] control_panel.html has #refreshModelsBtn button'
);

const refreshButtonMatch = HTML.match(
  /<button\b[^>]*id="refreshModelsBtn"[^>]*>([\s\S]*?)<\/button>/
);
const refreshButtonMarkup = refreshButtonMatch ? refreshButtonMatch[0] : '';
const refreshButtonText = refreshButtonMatch
  ? refreshButtonMatch[1].replace(/<[^>]+>/g, '').trim()
  : '';
assert(
  /class="fsb-refresh-icon"/.test(refreshButtonMarkup)
    && /aria-label="Refresh model list"/.test(refreshButtonMarkup)
    && /class="fas fa-sync-alt"[^>]*aria-hidden="true"/.test(refreshButtonMarkup)
    && refreshButtonText === '',
  '[Task 1] model refresh is an accessible icon-only FSB control'
);

assert(
  /id="modelDiscoveryStatus"/.test(HTML),
  '[Task 1] control_panel.html has #modelDiscoveryStatus indicator element'
);
assert(
  /id="modelSearch"/.test(HTML),
  '[Task 1] control_panel.html has #modelSearch input'
);
assert(
  /id="modelListbox"/.test(HTML),
  '[Task 1] control_panel.html has #modelListbox combobox popup'
);
assert(
  /id="modelName"/.test(HTML),
  '[Task 1] control_panel.html retains #modelName select (value source of truth)'
);

console.log('\n--- Plan 228-02 / Task 1: CSS chip styles ---');

assert(/\.discovery-status\b/.test(CSS), '[Task 1] options.css defines .discovery-status base rule');
assert(/\.discovery-status\.info\b/.test(CSS), '[Task 1] options.css defines .discovery-status.info');
assert(/\.discovery-status\.warning\b/.test(CSS), '[Task 1] options.css defines .discovery-status.warning');
assert(/\.discovery-status\.error\b/.test(CSS), '[Task 1] options.css defines .discovery-status.error');
assert(/\.discovery-status\.loading\b/.test(CSS), '[Task 1] options.css defines .discovery-status.loading');
assert(/\.model-combobox\b/.test(CSS), '[Task 1] options.css defines .model-combobox');
assert(/\.model-combobox__listbox\b/.test(CSS), '[Task 1] options.css defines .model-combobox__listbox');
assert(/\.model-combobox__hl\b/.test(CSS), '[Task 1] options.css defines .model-combobox__hl (search-term highlight)');
assert(/\.fsb-refresh-icon\s*\{[^}]*appearance:\s*none/s.test(CSS),
  '[Task 1] refresh icon opts out of native button appearance');
assert(/\.fsb-refresh-icon:focus-visible\s*\{[^}]*var\(--fsb-focus-ring\)/s.test(CSS),
  '[Task 1] refresh icon has a visible keyboard-focus treatment');
assert(/\.fsb-refresh-icon:disabled\s*\{[^}]*cursor:\s*not-allowed[^}]*opacity:/s.test(CSS),
  '[Task 1] refresh icon has an explicit disabled treatment');

console.log('\n--- Plan 228-02 / Task 2: options.js wiring call sites ---');

assert(
  /discoverModels\s*\(/.test(JS),
  '[Task 2] options.js calls discoverModels()'
);
assert(
  /bypassCache:\s*true/.test(JS),
  '[Task 2] hosted Control Panel discovery bypasses cache reads'
);
assert(
  /Provide API key to list models/.test(HTML),
  '[Task 1] initial model control uses the missing-key placeholder'
);
assert(
  /FSBDiscoveryUI/.test(JS),
  '[Task 2] options.js exposes FSBDiscoveryUI namespace for testability'
);
assert(
  /refreshModelsBtn/.test(JS),
  '[Task 2] options.js wires the #refreshModelsBtn click handler'
);
assert(
  /if \(!validateHostedApiSettingsSelection\(normalizedProviderSettings, selectedModelName\)\) return false;/.test(JS),
  '[Task 2] Save rejects hosted API settings without a live-ready model'
);
assert(
  /isHostedSelectionReady\(provider, modelName\)/.test(JS),
  '[Task 2] Test Connection rejects hosted API settings without a live-ready model'
);

// ---------------------------------------------------------------------------
// Layer 2: Behavioral — load options.js helpers via the FSBDiscoveryUI export.
// We construct the minimum globals the module needs and invoke the helpers
// against a tiny DOM shim. We do NOT exercise loadSettings / chrome.storage —
// only the discovery wiring.
// ---------------------------------------------------------------------------

// Minimal DOM shim. Each shim element exposes the surface our helpers touch.
function makeEl(tagName) {
  const el = {
    tagName: String(tagName || 'DIV').toUpperCase(),
    children: [],
    attributes: {},
    classList: {
      _set: new Set(),
      add(...names) { names.forEach(n => this._set.add(n)); el.className = Array.from(this._set).join(' '); },
      remove(...names) { names.forEach(n => this._set.delete(n)); el.className = Array.from(this._set).join(' '); },
      contains(n) { return this._set.has(n); },
      toggle(n, on) { if (on) this.add(n); else this.remove(n); }
    },
    className: '',
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    hidden: true,
    style: {},
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'hidden') this.hidden = true; },
    removeAttribute(k) { delete this.attributes[k]; if (k === 'hidden') this.hidden = false; },
    addEventListener(type, fn) {
      this._listeners = this._listeners || {};
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    dispatchEvent(type, evt) {
      const list = (this._listeners && this._listeners[type]) || [];
      list.forEach(fn => fn(evt || { target: el }));
    }
  };
  // Replacing innerHTML must clear children for our purposes.
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._innerHTML || ''; },
    set(v) { el._innerHTML = v; if (v === '') el.children = []; }
  });
  return el;
}

function makeRegistry() {
  const byId = {};
  const get = (id) => byId[id] || null;
  const make = (id, tag) => { const e = makeEl(tag); byId[id] = e; e.id = id; return e; };
  return { byId, get, make };
}

const reg = makeRegistry();

// Model select + chip + refresh button + 5 provider key inputs
const modelSelect      = reg.make('modelName', 'select');
const modelSearch      = reg.make('modelSearch', 'input');
const statusChip       = reg.make('modelDiscoveryStatus', 'div');
const refreshBtn       = reg.make('refreshModelsBtn', 'button');
const providerSelect   = reg.make('modelProvider', 'select');
const xaiKey           = reg.make('apiKey', 'input');
const geminiKey        = reg.make('geminiApiKey', 'input');
const openaiKey        = reg.make('openaiApiKey', 'input');
const anthropicKey     = reg.make('anthropicApiKey', 'input');
const openrouterKey    = reg.make('openrouterApiKey', 'input');
const lmstudioBaseUrl  = reg.make('lmstudioBaseUrl', 'input');
const saveBtn          = reg.make('saveBtn', 'button');
const fullApiTest      = reg.make('fullApiTest', 'button');
const modelDescription = reg.make('modelDescription', 'div');

statusChip.hidden = true;

// document shim
global.document = {
  getElementById: (id) => reg.get(id),
  createElement: (tag) => makeEl(tag),
  addEventListener: () => {}
};

// chrome shim — discovery helpers don't actually use chrome.storage in our
// test path because we always read the key from the live input. Kept so
// loadSettings-style calls don't blow up if accidentally invoked.
global.chrome = {
  storage: {
    local: {
      get: (_keys, cb) => cb({}),
      set: (_o, cb) => cb && cb()
    }
  },
  runtime: { sendMessage: () => {} }
};

// Load real model-discovery.js FIRST to capture FALLBACK_MODELS, then
// override globalThis.discoverModels with our mock. (The real module attaches
// discovery helpers to globalThis as a side
// effect — installing mocks after the require() ensures FSBDiscoveryUI
// resolves to our mocks at call time.)
const { FALLBACK_MODELS } = require('../extension/ai/model-discovery.js');
global.FALLBACK_MODELS = FALLBACK_MODELS;

let discoverCalls = [];
let pendingResolvers = [];
let nextResult = null;
let hydrateCalls = 0;
let discoveredIdCalls = 0;

global.discoverModels = function (provider, apiKey, opts) {
  discoverCalls.push({ provider, apiKey, opts });
  if (nextResult === '__pending__') {
    return new Promise((resolve) => {
      pendingResolvers.push(resolve);
    });
  }
  return Promise.resolve(nextResult);
};

global.hydrateDiscoveryCache = function () { hydrateCalls++; return Promise.resolve(); };
global.getDiscoveredModelIds = function () { discoveredIdCalls++; return ['stale-cached-model']; };

// Minimal config shim — options.js imports `config.availableModels` at module
// scope. Provide a plausible empty-shaped value so module load doesn't throw.
global.config = { availableModels: { xai: [], gemini: [], openai: [], anthropic: [], openrouter: [], lmstudio: [] } };

// Stub other globals options.js touches at load time.
global.window = global;
global.FSBAnalytics = function () {
  return { addEventListener: () => {}, refreshAnalytics: () => {}, getStats: () => ({}) };
};

// Now load options.js — it should attach FSBDiscoveryUI to globalThis at load
// time (NOT inside DOMContentLoaded).
require('../extension/ui/options.js');

const ui = global.FSBDiscoveryUI;

console.log('\n--- Plan 228-02 / Task 2: FSBDiscoveryUI runtime contract ---');

assert(typeof ui === 'object' && ui !== null, '[Task 2] FSBDiscoveryUI exposed on globalThis after load');
assert(typeof ui.runDiscovery === 'function', '[Task 2] FSBDiscoveryUI.runDiscovery is a function');
assert(typeof ui.setDiscoveryStatus === 'function', '[Task 2] FSBDiscoveryUI.setDiscoveryStatus is a function');
assert(typeof ui.setControlsDisabled === 'function', '[Task 2] FSBDiscoveryUI exposes provider control state');
assert(typeof ui.isHostedSelectionReady === 'function', '[Task 2] FSBDiscoveryUI exposes live hosted-selection readiness');
assert(typeof ui.handleSelectionChange === 'function', '[Task 2] FSBDiscoveryUI exposes local selection gating');
assert(typeof ui.renderModelDropdown === 'function', '[Task 2] FSBDiscoveryUI.renderModelDropdown is a function');
assert(typeof ui.applyModelSearch === 'function', '[Task 2] FSBDiscoveryUI.applyModelSearch is a function');
assert(typeof ui.filterModelsForSearch === 'function', '[Task 2] FSBDiscoveryUI.filterModelsForSearch is a function');
assert(typeof ui.IN_SCOPE_PROVIDERS === 'object', '[Task 2] FSBDiscoveryUI.IN_SCOPE_PROVIDERS exposed');

// Helpers --------------------------------------------------------------------

function reset() {
  ui.invalidateDiscovery();
  discoverCalls = [];
  pendingResolvers = [];
  hydrateCalls = 0;
  discoveredIdCalls = 0;
  modelSelect.innerHTML = '';
  modelSelect.disabled = false;
  statusChip.hidden = true;
  statusChip.classList._set.clear();
  statusChip.className = '';
  statusChip.textContent = '';
  refreshBtn.disabled = false;
  saveBtn.disabled = false;
  fullApiTest.disabled = false;
  modelSearch.value = '';
}

function setProviderKey(provider, value) {
  ({ xai: xaiKey, gemini: geminiKey, openai: openaiKey, anthropic: anthropicKey, openrouter: openrouterKey })[provider].value = value;
}

// Run behavioral tests sequentially so each gets a clean reset() before
// the previous test's promise resolves.
async function runSequentialTests() {
async function test_ok_live() {
  reset();
  setProviderKey('xai', 'sk-xai-good');
  providerSelect.value = 'xai';
  nextResult = { ok: true, source: 'live', models: [
    { id: 'grok-4-1-fast', displayName: 'Grok 4.1 Fast' },
    { id: 'grok-4',        displayName: 'Grok 4' }
  ], provider: 'xai' };

  await ui.runDiscovery('xai');

  assert(discoverCalls.length === 1 && discoverCalls[0].provider === 'xai', '[T2/ok-live] discoverModels invoked once with xai');
  assert(discoverCalls[0].opts && discoverCalls[0].opts.bypassCache === true, '[T2/ok-live] hosted discovery bypasses cache reads');
  assert(modelSelect.children.length === 2, '[T2/ok-live] dropdown populated with 2 discovered models');
  assert(modelSelect.children[0].value === 'grok-4-1-fast', '[T2/ok-live] first option is grok-4-1-fast');
  assert(statusChip.classList.contains('info'), '[T2/ok-live] chip class is info');
  assert(/2 models discovered/i.test(statusChip.textContent), '[T2/ok-live] chip text reports model count');
  assert(statusChip.hidden === false, '[T2/ok-live] chip is visible');
  assert(modelSelect.disabled === false, '[T2/ok-live] dropdown is re-enabled after success');
  assert(saveBtn.disabled === false && fullApiTest.disabled === false, '[T2/ok-live] Save and Test are enabled after success');
  assert(ui.isHostedSelectionReady('xai', modelSelect.value), '[T2/ok-live] selected live model is marked ready');
}
await test_ok_live();

// 2. Defensive cache rejection ---------------------------------------------
async function test_cache_result_rejected() {
  reset();
  setProviderKey('xai', 'sk-xai-good');
  nextResult = { ok: true, source: 'cache', models: [{ id: 'grok-4-1-fast', displayName: 'Grok 4.1 Fast' }], provider: 'xai' };

  await ui.runDiscovery('xai');
  assert(statusChip.classList.contains('error'), '[T2/cache-reject] cached result is rendered as an error');
  assert(modelSelect.children.length === 1 && modelSelect.children[0].value === '', '[T2/cache-reject] cached models are not selectable');
  assert(modelSelect.disabled === true && refreshBtn.disabled === false, '[T2/cache-reject] model stays disabled while Refresh remains available');
  assert(saveBtn.disabled === true && fullApiTest.disabled === true, '[T2/cache-reject] Save and Test remain blocked');
}
await test_cache_result_rejected();

// 3. auth-failed → error chip, NO fallback ---------------------------------
async function test_auth_failed() {
  reset();
  setProviderKey('xai', 'sk-bad');
  nextResult = { ok: false, reason: 'auth-failed', message: 'Authentication failed (401)', provider: 'xai' };

  await ui.runDiscovery('xai');

  assert(statusChip.classList.contains('error'), '[T2/auth-failed] chip class is error');
  assert(/invalid/i.test(statusChip.textContent), '[T2/auth-failed] chip text mentions "invalid"');
  const ids = modelSelect.children.map(c => c.value);
  const fallbackIds = FALLBACK_MODELS.xai.map(m => m.id);
  const overlaps = ids.filter(i => fallbackIds.includes(i));
  assert(overlaps.length === 0, '[T2/auth-failed] dropdown is NOT populated from FALLBACK_MODELS');
  assert(modelSelect.children.length >= 1 && /invalid/i.test(modelSelect.children[0].textContent),
    '[T2/auth-failed] dropdown shows invalid-key placeholder option');
  assert(modelSelect.disabled === true && refreshBtn.disabled === false, '[T2/auth-failed] dropdown is disabled and Refresh remains enabled');
  assert(saveBtn.disabled === true && fullApiTest.disabled === true, '[T2/auth-failed] Save and Test are blocked');
}
await test_auth_failed();

// 4. network-failed → disabled error, no fallback ---------------------------
async function test_network_failed() {
  reset();
  setProviderKey('xai', 'sk-good');
  nextResult = { ok: false, reason: 'network-failed', message: 'down', provider: 'xai' };
  await ui.runDiscovery('xai');
  assert(statusChip.classList.contains('error'), '[T2/network-failed] chip class is error');
  assert(modelSelect.children.length === 1 && /couldn.t load models/i.test(modelSelect.children[0].textContent), '[T2/network-failed] dropdown shows only the failure placeholder');
  assert(modelSelect.disabled === true && refreshBtn.disabled === false, '[T2/network-failed] dropdown is disabled and Refresh remains enabled');
  assert(saveBtn.disabled === true && fullApiTest.disabled === true, '[T2/network-failed] Save and Test are blocked');
}
await test_network_failed();

// 5. timeout → disabled error, no fallback ---------------------------------
async function test_timeout() {
  reset();
  setProviderKey('xai', 'sk-good');
  nextResult = { ok: false, reason: 'timeout', message: 'slow', provider: 'xai' };
  await ui.runDiscovery('xai');
  assert(statusChip.classList.contains('error'), '[T2/timeout] chip class is error');
  assert(modelSelect.children.length === 1 && modelSelect.children[0].value === '', '[T2/timeout] no fallback model is selectable');
  assert(modelSelect.disabled === true && refreshBtn.disabled === false, '[T2/timeout] dropdown is disabled and Refresh remains enabled');
}
await test_timeout();

// 6. empty-response → disabled empty state ----------------------------------
async function test_empty() {
  reset();
  setProviderKey('xai', 'sk-good');
  nextResult = { ok: false, reason: 'empty-response', message: 'none', provider: 'xai' };
  await ui.runDiscovery('xai');
  assert(statusChip.classList.contains('error'), '[T2/empty] chip class is error');
  assert(modelSelect.children.length === 1 && /no available models/i.test(modelSelect.children[0].textContent), '[T2/empty] dropdown shows the empty-response placeholder');
  assert(modelSelect.disabled === true && refreshBtn.disabled === false, '[T2/empty] dropdown is disabled and Refresh remains enabled');
}
await test_empty();

async function test_discovery_unavailable() {
  reset();
  setProviderKey('xai', 'sk-good');
  const savedDiscoverModels = global.discoverModels;
  global.discoverModels = undefined;
  await ui.runDiscovery('xai');
  global.discoverModels = savedDiscoverModels;
  assert(modelSelect.children.length === 1 && /couldn.t load models/i.test(modelSelect.children[0].textContent), '[T2/unavailable] dropdown shows only the failure placeholder');
  assert(modelSelect.disabled === true && refreshBtn.disabled === false, '[T2/unavailable] dropdown is disabled and Refresh remains available');
  assert(saveBtn.disabled === true && fullApiTest.disabled === true, '[T2/unavailable] Save and Test are blocked');
}
await test_discovery_unavailable();

// 7. missing-api-key → disabled placeholder for every hosted provider -------
async function test_missing_keys() {
  for (const provider of ['xai', 'gemini', 'openai', 'anthropic', 'openrouter']) {
    reset();
    providerSelect.value = provider;
    setProviderKey(provider, '');
    await ui.runDiscovery(provider);
    assert(discoverCalls.length === 0, '[T2/missing-' + provider + '] discoverModels is not called');
    assert(hydrateCalls === 0 && discoveredIdCalls === 0, '[T2/missing-' + provider + '] persistent discovery cache is not read');
    assert(statusChip.hidden === true, '[T2/missing-' + provider + '] status chip stays hidden');
    assert(modelSelect.children.length === 1 && modelSelect.children[0].textContent === 'Provide API key to list models', '[T2/missing-' + provider + '] exact placeholder is rendered');
    assert(modelSelect.disabled === true && refreshBtn.disabled === true, '[T2/missing-' + provider + '] model and Refresh controls are disabled');
    assert(saveBtn.disabled === true && fullApiTest.disabled === true, '[T2/missing-' + provider + '] Save and Test are blocked');
  }
}
await test_missing_keys();

// 8. LM Studio uses live discovery; custom remains out-of-scope --------------
async function test_out_of_scope_providers() {
  reset();
  lmstudioBaseUrl.value = 'localhost:1234/v1';
  nextResult = {
    ok: true,
    source: 'live',
    models: [{ id: 'qwen/qwen3.6-27b', displayName: 'qwen/qwen3.6-27b' }],
    provider: 'lmstudio'
  };
  await ui.runDiscovery('lmstudio', { previousSelection: 'text-embedding-old' });
  assert(discoverCalls.length === 1, '[T2/lmstudio] discoverModels called for lmstudio');
  assert(discoverCalls[0].apiKey === '', '[T2/lmstudio] discovery does not synthesize an API key');
  assert(discoverCalls[0].opts && discoverCalls[0].opts.baseUrl === 'localhost:1234/v1', '[T2/lmstudio] live base URL is passed through opts');
  assert(modelSelect.value === 'qwen/qwen3.6-27b', '[T2/lmstudio] unavailable saved model is not retained as a synthetic option');
  assert(statusChip.classList.contains('warning'), '[T2/lmstudio] unavailable saved model shows an actionable warning');
  reset();
  await ui.runDiscovery('custom');
  assert(discoverCalls.length === 0, '[T2/oos] discoverModels NOT called for custom');
}
await test_out_of_scope_providers();

async function test_lmstudio_failure_blocks_actions() {
  reset();
  lmstudioBaseUrl.value = 'http://localhost:1234';
  nextResult = { ok: false, reason: 'empty-response', message: 'none', provider: 'lmstudio' };
  await ui.runDiscovery('lmstudio');
  assert(modelSelect.value === '', '[T2/lmstudio-fail] no model remains selected');
  assert(modelSelect.disabled === true, '[T2/lmstudio-fail] model selection is disabled');
  assert(saveBtn.disabled === true, '[T2/lmstudio-fail] Save is disabled');
  assert(fullApiTest.disabled === true, '[T2/lmstudio-fail] Test Connection is disabled');
  assert(statusChip.classList.contains('error'), '[T2/lmstudio-fail] failure is rendered as an error');
}
await test_lmstudio_failure_blocks_actions();

async function test_lmstudio_multiple_requires_choice() {
  reset();
  lmstudioBaseUrl.value = 'http://localhost:1234';
  nextResult = {
    ok: true,
    source: 'live',
    models: [
      { id: 'qwen/qwen3.6-27b', displayName: 'qwen/qwen3.6-27b' },
      { id: 'mistral/chat', displayName: 'mistral/chat' }
    ],
    provider: 'lmstudio'
  };
  await ui.runDiscovery('lmstudio');
  assert(modelSelect.value === '', '[T2/lmstudio-choice] ambiguous local discovery does not silently choose the first model');
  assert(modelSelect.disabled === false, '[T2/lmstudio-choice] model selector remains available for an explicit choice');
  assert(saveBtn.disabled === true, '[T2/lmstudio-choice] Save stays disabled until a model is selected');
  assert(fullApiTest.disabled === true, '[T2/lmstudio-choice] Test Connection stays disabled until a model is selected');
  assert(statusChip.classList.contains('warning'), '[T2/lmstudio-choice] ambiguous discovery shows an actionable warning');
  modelSelect.value = 'qwen/qwen3.6-27b';
  ui.handleSelectionChange('lmstudio', modelSelect.value);
  assert(saveBtn.disabled === false, '[T2/lmstudio-choice] explicit selection enables Save');
  assert(fullApiTest.disabled === false, '[T2/lmstudio-choice] explicit selection enables Test Connection');
}
await test_lmstudio_multiple_requires_choice();

async function test_provider_exit_reenables_actions() {
  ui.setControlsDisabled(false);
  assert(modelSelect.disabled === false, '[T2/lmstudio-exit] model selection is re-enabled after leaving failed local discovery');
  assert(saveBtn.disabled === false, '[T2/lmstudio-exit] Save is re-enabled after leaving failed local discovery');
  assert(fullApiTest.disabled === false, '[T2/lmstudio-exit] Test Connection is re-enabled after leaving failed local discovery');
}
await test_provider_exit_reenables_actions();

// 9. Refresh performs fresh discovery without deleting validation metadata --
async function test_refresh_live() {
  reset();
  setProviderKey('xai', 'sk-good');
  nextResult = { ok: true, source: 'live', models: [{ id: 'grok-4-1-fast', displayName: 'Grok 4.1 Fast' }], provider: 'xai' };
  await ui.runDiscovery('xai');
  assert(discoverCalls.length === 1, '[T2/refresh] discoverModels is called once');
  assert(discoverCalls[0].opts && discoverCalls[0].opts.bypassCache === true, '[T2/refresh] discovery bypasses cache reads');
}
await test_refresh_live();

// 10. Loading state shows while pending -------------------------------------
async function test_loading_state() {
  reset();
  setProviderKey('xai', 'sk-good');
  nextResult = '__pending__';
  const promise = ui.runDiscovery('xai');
  assert(statusChip.classList.contains('loading'), '[T2/loading] chip class is loading while pending');
  assert(modelSelect.disabled === true, '[T2/loading] dropdown disabled while pending');
  assert(refreshBtn.disabled === true, '[T2/loading] refresh button disabled while pending');
  assert(modelSelect.children.length === 1 && /discovering/i.test(modelSelect.children[0].textContent),
    '[T2/loading] dropdown shows "Discovering models..." option while pending');

  pendingResolvers.forEach(r => r({ ok: true, source: 'live', models: [{ id: 'grok-4-1-fast', displayName: 'Grok 4.1 Fast' }], provider: 'xai' }));
  await promise;
  assert(modelSelect.disabled === false, '[T2/loading] dropdown re-enabled after resolve');
  assert(refreshBtn.disabled === false, '[T2/loading] refresh button re-enabled after resolve');
}
await test_loading_state();

async function test_stale_lmstudio_response_is_ignored() {
  reset();
  lmstudioBaseUrl.value = 'http://localhost:1234';
  nextResult = '__pending__';
  const stalePromise = ui.runDiscovery('lmstudio');
  const staleResolver = pendingResolvers[0];

  setProviderKey('xai', 'sk-current');
  nextResult = {
    ok: true,
    source: 'live',
    models: [{ id: 'grok-current', displayName: 'Grok Current' }],
    provider: 'xai'
  };
  await ui.runDiscovery('xai');
  staleResolver({
    ok: true,
    source: 'live',
    models: [{ id: 'qwen/stale', displayName: 'Qwen Stale' }],
    provider: 'lmstudio'
  });
  await stalePromise;

  assert(modelSelect.value === 'grok-current', '[T2/stale-local] late LM Studio result does not overwrite current provider');
  assert(modelSelect.children.every(option => option.value !== 'qwen/stale'), '[T2/stale-local] stale local option is not rendered');
}
await test_stale_lmstudio_response_is_ignored();

// 11. Selection preservation ------------------------------------------------
async function test_selection_preserved() {
  reset();
  setProviderKey('xai', 'sk-good');
  nextResult = { ok: true, source: 'live', models: [
    { id: 'grok-4-1-fast', displayName: 'Grok 4.1 Fast' },
    { id: 'grok-4',        displayName: 'Grok 4' }
  ], provider: 'xai' };

  await ui.runDiscovery('xai', { previousSelection: 'grok-4' });
  assert(modelSelect.value === 'grok-4', '[T2/preserve] previously selected model id retained when present in new list');
}
await test_selection_preserved();

async function test_selection_falls_back_to_first() {
  reset();
  setProviderKey('xai', 'sk-good');
  nextResult = { ok: true, source: 'live', models: [
    { id: 'grok-4-1-fast', displayName: 'Grok 4.1 Fast' }
  ], provider: 'xai' };

  await ui.runDiscovery('xai', { previousSelection: 'grok-zzz-not-here' });
  assert(modelSelect.value === 'grok-4-1-fast', '[T2/preserve] unavailable saved selection falls back to the first live model');
  assert(modelSelect.children.every(option => option.value !== 'grok-zzz-not-here'), '[T2/preserve] stale saved model is not rendered synthetically');
}
await test_selection_falls_back_to_first();

// 12. Debounced API-key handler --------------------------------------------
async function test_debounce() {
  reset();
  providerSelect.value = 'xai';
  setProviderKey('xai', 'sk-good');
  nextResult = { ok: true, source: 'live', models: [{ id: 'grok-4-1-fast', displayName: 'Grok 4.1 Fast' }], provider: 'xai' };

  ui.scheduleDiscoveryFromKeyChange('xai', { debounceMs: 20 });
  ui.scheduleDiscoveryFromKeyChange('xai', { debounceMs: 20 });
  ui.scheduleDiscoveryFromKeyChange('xai', { debounceMs: 20 });
  assert(modelSelect.disabled === true && /discovering/i.test(modelSelect.children[0].textContent), '[T2/debounce] stale models clear immediately during debounce');

  await new Promise(r => setTimeout(r, 60));
  assert(discoverCalls.length === 1, '[T2/debounce] 3 rapid scheduleDiscoveryFromKeyChange calls coalesce to 1 discovery');
  assert(discoverCalls[0].opts && discoverCalls[0].opts.bypassCache === true, '[T2/debounce] debounced discovery bypasses cache reads');
}
await test_debounce();

async function test_key_clear_invalidates_pending_response() {
  reset();
  providerSelect.value = 'xai';
  setProviderKey('xai', 'sk-old');
  nextResult = '__pending__';
  const stalePromise = ui.runDiscovery('xai');
  const staleResolver = pendingResolvers[0];

  setProviderKey('xai', '');
  ui.scheduleDiscoveryFromKeyChange('xai', { debounceMs: 20 });
  assert(modelSelect.children.length === 1 && modelSelect.children[0].textContent === 'Provide API key to list models', '[T2/key-clear] clearing the key immediately renders the missing-key placeholder');

  staleResolver({
    ok: true,
    source: 'live',
    models: [{ id: 'grok-stale', displayName: 'Grok Stale' }],
    provider: 'xai'
  });
  await stalePromise;

  assert(modelSelect.children.every(option => option.value !== 'grok-stale'), '[T2/key-clear] late result for the old key is ignored');
  assert(modelSelect.disabled === true && refreshBtn.disabled === true, '[T2/key-clear] model and Refresh controls remain disabled');
}
await test_key_clear_invalidates_pending_response();

// 13. Smart model search ----------------------------------------------------
async function test_smart_model_search() {
  reset();
  const models = [
    { id: 'openai/gpt-4o', displayName: 'OpenAI: GPT-4o', description: 'Flagship model', provider: 'openrouter' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', displayName: 'Llama 3.3 70B Instruct Free', description: 'OpenRouter free tier', provider: 'openrouter' },
    { id: 'google/gemini-2.0-flash-exp:free', displayName: 'Gemini 2.0 Flash Experimental Free', description: 'Free model', provider: 'openrouter' },
    { id: 'anthropic/claude-sonnet-4', displayName: 'Anthropic: Claude Sonnet 4', description: 'Paid model', provider: 'openrouter' }
  ];

  ui.renderModelDropdown(models);
  assert(modelSelect.children.length === 4, '[T2/search] empty search renders all models');

  ui.applyModelSearch('free');
  let ids = modelSelect.children.map(c => c.value);
  assert(ids.length === 2, '[T2/search] free query filters to 2 matching models');
  assert(ids.includes('meta-llama/llama-3.3-70b-instruct:free'), '[T2/search] free matches OpenRouter id suffix');
  assert(ids.includes('google/gemini-2.0-flash-exp:free'), '[T2/search] free matches model display/description too');
  assert(!ids.includes('openai/gpt-4o'), '[T2/search] free excludes non-free GPT model');

  ui.applyModelSearch('GPT');
  ids = modelSelect.children.map(c => c.value);
  assert(ids.length === 1 && ids[0] === 'openai/gpt-4o', '[T2/search] GPT query matches case-insensitively');

  ui.applyModelSearch('openai GPT');
  ids = modelSelect.children.map(c => c.value);
  assert(ids.length === 1 && ids[0] === 'openai/gpt-4o', '[T2/search] multi-token query requires both tokens');

  ui.applyModelSearch('not-a-real-model');
  assert(modelSelect.children.length === 1, '[T2/search] no-match query renders one placeholder option');
  assert(modelSelect.children[0].disabled === true, '[T2/search] no-match placeholder is disabled');
  assert(/no models match/i.test(modelSelect.children[0].textContent), '[T2/search] no-match placeholder text is explicit');

  ui.applyModelSearch('');
  ids = modelSelect.children.map(c => c.value);
  assert(ids.length === 4, '[T2/search] clearing query restores full list');
}
await test_smart_model_search();

} // end runSequentialTests

runSequentialTests().then(() => {
  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  if (failed > 0) {
    failures.forEach(f => console.error('  - ' + f));
    process.exit(1);
  }
}).catch((err) => {
  console.error('FATAL: test runner crashed:', err);
  process.exit(1);
});
