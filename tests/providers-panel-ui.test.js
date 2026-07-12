'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function attribute(tag, name) {
  const match = tag.match(new RegExp('\\b' + name + '="([^"]*)"'));
  return match ? match[1] : null;
}

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notStrictEqual(start, -1, 'options.js defines ' + name + '()');
  const open = source.indexOf('{', start);
  let depth = 1;
  let cursor = open + 1;
  while (cursor < source.length && depth > 0) {
    if (source[cursor] === '{') depth += 1;
    if (source[cursor] === '}') depth -= 1;
    cursor += 1;
  }
  assert.strictEqual(depth, 0, 'extracts complete ' + name + '() body');
  return source.slice(start, cursor);
}

function extractElement(source, tagName, id) {
  const startPattern = new RegExp('<' + tagName + '\\b[^>]*\\bid="' + id + '"[^>]*>');
  const startMatch = startPattern.exec(source);
  assert.ok(startMatch, 'finds #' + id);
  const start = startMatch.index;
  const tokenPattern = new RegExp('<\\/?' + tagName + '\\b[^>]*>', 'g');
  tokenPattern.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tokenPattern.exec(source))) {
    if (match[0][1] === '/') depth -= 1;
    else depth += 1;
    if (depth === 0) return source.slice(start, tokenPattern.lastIndex);
  }
  throw new Error('Unclosed #' + id);
}

const HTML = read('extension/ui/control_panel.html');
const CSS = read('extension/ui/options.css');
const JS = read('extension/ui/options.js');
const PROVIDERS = require('../extension/ui/providers-panel.js');

console.log('Providers panel UI: canonical route and static roster');

assert.match(HTML, /data-section="providers"/);
assert.match(HTML, /<section class="content-section" id="providers">/);
assert.match(HTML, /<h2>Providers<\/h2>/);
assert.match(
  HTML,
  /Choose how FSB runs AI tasks\. API providers use keys stored locally; agent CLIs use their existing local sign-in\./
);
assert.doesNotMatch(HTML, /data-section="api-config"|id="api-config"/);

const normalizeSource = extractFunction(JS, 'normalizeSectionId');
const normalizeSectionId = new Function(normalizeSource + '; return normalizeSectionId;')();
assert.strictEqual(normalizeSectionId('api-config'), 'providers');
assert.strictEqual(normalizeSectionId('advanced'), 'advanced');

const switchSource = extractFunction(JS, 'switchSection');
const initializeSource = extractFunction(JS, 'initializeSections');
assert.match(switchSource, /sectionId\s*=\s*normalizeSectionId\(sectionId\)/);
assert.match(switchSource, /history\.replaceState\(null, null, `#\$\{sectionId\}`\)/);
assert.match(initializeSource, /normalizeSectionId\(window\.location\.hash\.slice\(1\)\)/);
assert.ok(
  initializeSource.indexOf('normalizeSectionId(') < initializeSource.indexOf('document.getElementById(hash)'),
  'legacy hash is normalized before section lookup'
);

const helperTags = HTML.match(/<script\s+src="providers-panel\.js"><\/script>/g) || [];
assert.strictEqual(helperTags.length, 1, 'provider helper is loaded exactly once');
assert.ok(
  HTML.indexOf('src="providers-panel.js"') < HTML.indexOf('src="options.js"'),
  'provider helper loads before options.js'
);

const radioTags = HTML.match(/<input\b[^>]*\bname="fsbProviderSelection"[^>]*>/g) || [];
assert.strictEqual(radioTags.length, 10, 'exactly ten provider radios share one name');
const radioContract = radioTags.map((tag) => ({
  kind: attribute(tag, 'data-provider-kind'),
  id: attribute(tag, 'data-provider-id'),
  value: attribute(tag, 'value')
}));
const expectedContract = [
  ...PROVIDERS.AGENT_PROVIDER_IDS.map((id) => ({ kind: 'agent', id, value: id })),
  ...PROVIDERS.API_PROVIDER_IDS.map((id) => ({ kind: 'api', id, value: id }))
];
assert.deepStrictEqual(radioContract, expectedContract);

const providerLabels = HTML.match(/<label\b[^>]*class="provider-row"[^>]*>[\s\S]*?<\/label>/g) || [];
assert.strictEqual(providerLabels.length, 10, 'every radio has a provider-row label');
providerLabels.forEach((label, index) => {
  assert.strictEqual(attribute(label.slice(0, label.indexOf('>') + 1), 'data-provider-kind'), expectedContract[index].kind);
  assert.strictEqual(attribute(label.slice(0, label.indexOf('>') + 1), 'data-provider-id'), expectedContract[index].id);
  assert.doesNotMatch(label, /<(?:a|button|select|textarea)\b/i, 'provider labels contain no nested secondary controls');
});

const modelProviderMatch = HTML.match(/<select\b[^>]*\bid="modelProvider"[^>]*>[\s\S]*?<\/select>/);
assert.ok(modelProviderMatch, 'hidden compatibility #modelProvider remains present');
const modelProviderMarkup = modelProviderMatch[0];
assert.match(modelProviderMarkup, /class="form-select provider-roster__native"/);
assert.match(modelProviderMarkup, /tabindex="-1"/);
assert.match(modelProviderMarkup, /aria-hidden="true"/);
assert.doesNotMatch(modelProviderMarkup.split('>')[0], /\bdisabled\b/);
assert.deepStrictEqual(
  Array.from(modelProviderMarkup.matchAll(/<option\s+value="([^"]+)"/g), (match) => match[1]),
  Array.from(PROVIDERS.API_PROVIDER_IDS)
);
PROVIDERS.AGENT_PROVIDER_IDS.forEach((id) => {
  assert.doesNotMatch(modelProviderMarkup, new RegExp('value="' + id + '"'));
});

assert.match(HTML, /id="refreshProviderStatusBtn"/);
assert.match(HTML, />Refresh status<\/span>/);
assert.match(HTML, />Refreshing…<\/span>/);
assert.match(HTML, /id="refreshProviderStatusBtn"[^>]*aria-busy="false"/);

const refreshingSource = extractFunction(JS, 'setProviderStatusRefreshing');
const refreshingState = {
  disabled: false,
  attributes: {},
  classes: new Set(),
  label: { hidden: false },
  pending: { hidden: true }
};
const refreshButton = {
  disabled: false,
  querySelector(selector) {
    return selector.endsWith('refresh-label') ? refreshingState.label : refreshingState.pending;
  },
  setAttribute(name, value) { refreshingState.attributes[name] = value; },
  classList: {
    toggle(name, on) {
      if (on) refreshingState.classes.add(name);
      else refreshingState.classes.delete(name);
    }
  }
};
const setProviderStatusRefreshing = new Function(
  'elements',
  refreshingSource + '; return setProviderStatusRefreshing;'
)({ refreshProviderStatusBtn: refreshButton });
setProviderStatusRefreshing(true);
assert.strictEqual(refreshButton.disabled, true);
assert.strictEqual(refreshingState.attributes['aria-busy'], 'true');
assert.strictEqual(refreshingState.label.hidden, true);
assert.strictEqual(refreshingState.pending.hidden, false);
setProviderStatusRefreshing(false);
assert.strictEqual(refreshButton.disabled, false);
assert.strictEqual(refreshingState.attributes['aria-busy'], 'false');
assert.strictEqual(refreshingState.label.hidden, false);
assert.strictEqual(refreshingState.pending.hidden, true);

console.log('Providers panel UI: detail, empty, and disclosure contracts');

assert.match(HTML, /id="apiProviderDetails"/);
assert.match(HTML, /id="agentProviderDetails"[^>]*hidden[^>]*aria-live="polite"/);
[
  'modelCombobox', 'modelDiscoveryStatus', 'refreshModelsBtn', 'xaiApiKeyGroup',
  'geminiApiKeyGroup', 'openaiApiKeyGroup', 'anthropicApiKeyGroup',
  'openrouterApiKeyGroup', 'lmstudioServerGroup', 'customApiGroup',
  'apiStatusCard', 'fullApiTest'
].forEach((id) => assert.match(extractElement(HTML, 'div', 'apiProviderDetails'), new RegExp('id="' + id + '"')));

const agentDetails = extractElement(HTML, 'div', 'agentProviderDetails');
['Installation', 'Connection', 'Account', 'Setup', 'Usage', 'Tokens', 'Turns', 'Duration'].forEach((label) => {
  assert.ok(agentDetails.includes(label), 'agent details include ' + label);
});
assert.match(agentDetails, /id="agentUsageTokens">—<\/dd>/);
assert.match(agentDetails, /id="agentUsageTurns">—<\/dd>/);
assert.match(agentDetails, /id="agentUsageDuration">—<\/dd>/);
assert.match(agentDetails, /No delegated runs yet/);
assert.match(agentDetails, /<h4>No agent CLI detected<\/h4>/);
assert.match(
  agentDetails,
  /You can select an agent now and follow its setup guide, or continue with an API provider\./
);

const otherClients = extractElement(HTML, 'details', 'otherMcpClientsDisclosure');
assert.doesNotMatch(otherClients.split('>')[0], /\bopen\b/);
assert.match(otherClients, /Other MCP clients \(0\)/);
assert.doesNotMatch(otherClients, /type="radio"|Recommended|Open setup guide/);

console.log('Providers panel UI: theme, responsive, and motion CSS');

const providerCssStart = CSS.indexOf('/* ---------------------------------------------------------------------------\n * Providers chooser');
const providerCssEnd = CSS.indexOf('/* ---------------------------------------------------------------------------\n * Model Discovery', providerCssStart);
assert.ok(providerCssStart >= 0 && providerCssEnd > providerCssStart, 'Providers CSS block is present');
const providerCss = CSS.slice(providerCssStart, providerCssEnd);
assert.match(providerCss, /\.provider-row\s*\{/);
assert.match(providerCss, /min-height:\s*64px/);
assert.match(providerCss, /padding:\s*16px/);
assert.match(providerCss, /gap:\s*12px/);
assert.match(providerCss, /border:\s*2px solid var\(--border-color\)/);
assert.match(providerCss, /border-color:\s*var\(--primary-color\)/);
assert.match(providerCss, /\.provider-badge--recommended[\s\S]*var\(--info-light\)/);
assert.match(providerCss, /var\(--fsb-focus-ring\)/);
assert.match(providerCss, /@media \(min-width: 900px\)/);
assert.match(providerCss, /@media \(max-width: 640px\)/);
assert.match(providerCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(providerCss, /\[data-theme="dark"\] \.provider-row/);
assert.doesNotMatch(providerCss, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'Providers CSS uses existing theme variables');
assert.match(CSS, /html, body\s*\{\s*overflow-x:\s*hidden;/);

console.log('Providers panel UI: selection source boundaries');

assert.match(JS, /providerKind:\s*'api'/);
assert.match(JS, /agentProviderId:\s*''/);
assert.match(JS, /const providerPanelState\s*=\s*\{/);
assert.match(JS, /providerSelectionRadios\s*=\s*document\.querySelectorAll\('input\[name="fsbProviderSelection"\]'\)/);
assert.match(JS, /classList\.contains\('provider-roster__native'\)/);
assert.strictEqual((JS.match(/providerRoster\.addEventListener\('change'/g) || []).length, 1,
  'one delegated provider radio change handler is wired');
assert.doesNotMatch(JS, /providerSelectionRadios[^;]*\.addEventListener/g,
  'provider radios do not receive per-row listeners');

const loadSource = extractFunction(JS, 'loadSettings');
const saveSource = extractFunction(JS, 'saveSettings');
const discardSource = extractFunction(JS, 'discardChanges');
assert.match(loadSource, /normalizeSettings\(mergedSettings\)/);
assert.ok(loadSource.indexOf('normalizeSettings(mergedSettings)') < loadSource.indexOf('setProviderSelection('),
  'settings normalize before controls render');
assert.match(loadSource, /setProviderSelection\(settings\.providerKind, activeProviderId, \{ markDirty: false \}\)/);
assert.match(loadSource, /if \(settings\.providerKind === 'api'\)[\s\S]*checkApiConnection\(\)/);
assert.match(saveSource, /providerKind:\s*normalizedProviderSettings\.providerKind/);
assert.match(saveSource, /agentProviderId:\s*normalizedProviderSettings\.agentProviderId/);
assert.match(saveSource, /modelProvider:\s*elements\.modelProvider\?\.value \|\| 'xai'/);
assert.match(saveSource, /settings\.providerKind === 'api' && settings\.apiKey/);
assert.match(discardSource, /loadSettings\(\)/);

const apiGetterSource = extractFunction(JS, 'checkApiConnection');
const discoveryMapStart = JS.indexOf('const IN_SCOPE_PROVIDERS = Object.freeze({');
const discoveryMapEnd = JS.indexOf('});', discoveryMapStart) + 3;
assert.ok(discoveryMapStart >= 0 && discoveryMapEnd > discoveryMapStart, 'discovery provider map is present');
const apiOnlySources = modelProviderMarkup + apiGetterSource + JS.slice(discoveryMapStart, discoveryMapEnd);
PROVIDERS.AGENT_PROVIDER_IDS.forEach((id) => {
  assert.doesNotMatch(apiOnlySources, new RegExp(id.replace('-', '\\-')),
    id + ' never enters API options, getters, or discovery maps');
});

const rootTestCommands = JSON.parse(read('package.json')).scripts.test.split(' && ');
const logicTestIndex = rootTestCommands.indexOf('node tests/providers-panel-logic.test.js');
assert.strictEqual(rootTestCommands[logicTestIndex + 1], 'node tests/providers-panel-ui.test.js',
  'root npm test runs providers-panel-ui immediately after provider logic');

function makeClassList(initial) {
  const names = new Set(initial || []);
  return {
    add(...values) { values.forEach((value) => names.add(value)); },
    remove(...values) { values.forEach((value) => names.delete(value)); },
    contains(value) { return names.has(value); },
    toggle(value, force) {
      const enabled = force === undefined ? !names.has(value) : !!force;
      if (enabled) names.add(value);
      else names.delete(value);
      return enabled;
    }
  };
}

function makeElement(id, options) {
  const config = options || {};
  const listeners = Object.create(null);
  const element = {
    id: id || '',
    tagName: (config.tagName || 'div').toUpperCase(),
    name: config.name || '',
    type: config.type || '',
    checked: !!config.checked,
    hidden: !!config.hidden,
    disabled: false,
    textContent: config.textContent || '',
    dataset: { ...(config.dataset || {}) },
    attributes: Object.create(null),
    classList: makeClassList(config.classes),
    style: {
      display: '',
      removeProperty(name) { delete this[name]; }
    },
    children: [],
    options: [],
    parentNode: null,
    addEventListener(type, listener) {
      (listeners[type] = listeners[type] || []).push(listener);
    },
    dispatchEvent(event) {
      const next = event || {};
      if (!next.target) next.target = element;
      (listeners[next.type] || []).slice().forEach((listener) => listener(next));
      return true;
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; },
    removeAttribute(name) { delete this.attributes[name]; },
    appendChild(child) {
      child.parentNode = element;
      this.children.push(child);
      if (element.tagName === 'SELECT' && child.tagName === 'OPTION') element.options.push(child);
      return child;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest(selector) {
      if (selector === '.provider-row') return this._providerRow || null;
      return null;
    },
    focus() {}
  };

  let currentValue = config.value === undefined ? '' : String(config.value);
  Object.defineProperty(element, 'value', {
    get() { return currentValue; },
    set(value) {
      const next = String(value);
      if (element.tagName === 'SELECT') {
        currentValue = element.options.some((option) => option.value === next) ? next : '';
      } else {
        currentValue = next;
      }
    }
  });
  Object.defineProperty(element, 'innerHTML', {
    get() { return ''; },
    set(value) {
      if (value === '') {
        element.children = [];
        if (element.tagName === 'SELECT') element.options = [];
        currentValue = '';
      }
    }
  });
  return element;
}

function makeOption(value, label) {
  return makeElement('', { tagName: 'option', value: value, textContent: label || value });
}

function makeSelect(id, values, initialValue, classes) {
  const select = makeElement(id, { tagName: 'select', classes: classes || [] });
  values.forEach((value) => select.appendChild(makeOption(value, value)));
  select.value = initialValue || values[0] || '';
  return select;
}

function createProviderHarness(initialStorage) {
  const registry = Object.create(null);
  const providerRows = [];
  const radios = [];
  const providerIds = [
    ...PROVIDERS.AGENT_PROVIDER_IDS.map((id) => ['agent', id]),
    ...PROVIDERS.API_PROVIDER_IDS.map((id) => ['api', id])
  ];
  providerIds.forEach(([kind, id]) => {
    const row = makeElement('row-' + kind + '-' + id, { classes: ['provider-row'] });
    const radio = makeElement('provider-' + kind + '-' + id, {
      tagName: 'input',
      type: 'radio',
      name: 'fsbProviderSelection',
      dataset: { providerKind: kind, providerId: id }
    });
    radio._providerRow = row;
    row.appendChild(radio);
    providerRows.push(row);
    radios.push(radio);
    registry[radio.id] = radio;
  });

  const providerRoster = makeElement('providerRoster', { tagName: 'fieldset' });
  providerRows.forEach((row) => providerRoster.appendChild(row));
  const modelProvider = makeSelect(
    'modelProvider',
    Array.from(PROVIDERS.API_PROVIDER_IDS),
    'xai',
    ['form-select', 'provider-roster__native']
  );
  const modelName = makeSelect('modelName', [], '', ['model-combobox__native']);
  const apiDetails = makeElement('apiProviderDetails');
  const agentDetails = makeElement('agentProviderDetails', { hidden: true });
  const apiKey = makeElement('apiKey', { tagName: 'input' });
  const geminiApiKey = makeElement('geminiApiKey', { tagName: 'input' });
  const openaiApiKey = makeElement('openaiApiKey', { tagName: 'input' });
  const anthropicApiKey = makeElement('anthropicApiKey', { tagName: 'input' });
  const customApiKey = makeElement('customApiKey', { tagName: 'input' });
  const customEndpoint = makeElement('customEndpoint', { tagName: 'input' });
  const openrouterApiKey = makeElement('openrouterApiKey', { tagName: 'input' });
  const lmstudioBaseUrl = makeElement('lmstudioBaseUrl', { tagName: 'input', value: 'http://localhost:1234' });
  [
    providerRoster, modelProvider, modelName, apiDetails, agentDetails, apiKey,
    geminiApiKey, openaiApiKey, anthropicApiKey, customApiKey, customEndpoint,
    openrouterApiKey, lmstudioBaseUrl
  ].forEach((element) => { registry[element.id] = element; });

  let storage = { ...(initialStorage || {}) };
  const writes = [];
  const document = {
    getElementById(id) { return registry[id] || null; },
    querySelectorAll(selector) {
      if (selector === '.nav-item' || selector === '.content-section') return [];
      if (selector === 'input[name="fsbProviderSelection"]') return radios;
      if (selector === '.form-select, .chart-select') return [modelProvider];
      return [];
    },
    createElement(tagName) { return makeElement('', { tagName: tagName }); },
    addEventListener() {}
  };
  const chrome = {
    storage: {
      local: {
        get(keys, callback) {
          const result = {};
          (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(storage, key)) result[key] = storage[key];
          });
          callback(result);
        },
        set(next, callback) {
          writes.push({ ...next });
          storage = { ...storage, ...next };
          if (callback) callback();
        }
      },
      onChanged: { addListener() {} }
    },
    runtime: {
      lastError: null,
      sendMessage(_message, callback) { if (callback) callback({ ok: true }); },
      onMessage: { addListener() {} }
    }
  };
  const context = {
    console,
    document,
    chrome,
    config: { availableModels: Object.fromEntries(PROVIDERS.API_PROVIDER_IDS.map((id) => [id, []])) },
    FSBProvidersPanel: PROVIDERS,
    FSBAnalytics: function() {},
    Event: class { constructor(type) { this.type = type; } },
    setTimeout(fn) { return setTimeout(fn, 0); },
    clearTimeout,
    requestAnimationFrame(fn) { return setTimeout(fn, 0); },
    cancelAnimationFrame: clearTimeout,
    location: { hash: '' },
    history: { replaceState() {} },
    addEventListener() {}
  };
  context.window = context;
  context.global = context;
  vm.createContext(context);
  vm.runInContext(JS, context, { filename: 'extension/ui/options.js' });
  context.cacheElements();

  const calls = { discovery: [], visibility: [], connection: 0 };
  context.FSBDiscoveryUI = {
    IN_SCOPE_PROVIDERS: { xai: 'apiKey', gemini: 'geminiApiKey', openai: 'openaiApiKey', anthropic: 'anthropicApiKey', openrouter: 'openrouterApiKey' },
    runDiscovery(provider, options) { calls.discovery.push({ provider, options: { ...options } }); }
  };
  context.FSBModelCombobox = { refresh() {} };
  context.updateApiKeyVisibility = (provider) => { calls.visibility.push(provider); };
  context.checkApiConnection = () => { calls.connection += 1; };
  context.addLog = () => {};
  context.showToast = () => {};

  return {
    context,
    calls,
    writes,
    radios,
    modelProvider,
    modelName,
    apiDetails,
    agentDetails,
    apiKey,
    anthropicApiKey,
    get storage() { return storage; },
    setStorage(next) { storage = { ...next }; },
    state() { return vm.runInContext('providerPanelState', context); },
    dashboardState() { return vm.runInContext('dashboardState', context); }
  };
}

function selectedRadio(harness) {
  return harness.radios.find((radio) => radio.checked);
}

function flushHarness() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

async function runProviderRuntimeTests() {
  console.log('Providers panel UI: VM load, selection, save, and discard');
  const harness = createProviderHarness({
    modelProvider: 'anthropic',
    modelName: 'claude-saved-model',
    anthropicApiKey: 'anthropic-saved-key'
  });

  harness.context.initFsbSelects();
  assert.strictEqual(harness.modelProvider.getAttribute('data-enh'), null,
    'hidden provider compatibility select is not enhanced into a second dropdown');

  harness.context.loadSettings();
  await flushHarness();
  assert.strictEqual(harness.state().providerKind, 'api', 'legacy settings migrate to API kind');
  assert.strictEqual(harness.modelProvider.value, 'anthropic', 'legacy Anthropic API choice is restored');
  assert.strictEqual(harness.state().agentProviderId, '', 'legacy settings retain no invented agent id');
  assert.strictEqual(selectedRadio(harness).dataset.providerId, 'anthropic', 'legacy API radio is checked');
  assert.strictEqual(harness.apiDetails.hidden, false, 'API details remain in tab flow for API kind');
  assert.strictEqual(harness.agentDetails.hidden, true, 'agent details leave tab flow for API kind');
  assert.strictEqual(harness.writes.length, 0, 'loading and migration do not persist implicitly');

  harness.setStorage({
    providerKind: 'agent',
    agentProviderId: 'unknown-agent',
    modelProvider: 'unknown-api',
    modelName: 'invalid-model'
  });
  harness.context.loadSettings();
  await flushHarness();
  assert.strictEqual(harness.state().providerKind, 'api', 'invalid kind/id pair fails closed to API');
  assert.strictEqual(harness.modelProvider.value, 'xai', 'invalid API id fails closed to xAI');
  assert.strictEqual(harness.state().agentProviderId, '', 'invalid agent id is cleared');
  assert.strictEqual(selectedRadio(harness).dataset.providerId, 'xai', 'fail-closed xAI radio is checked');

  harness.state().recommendation = { providerKind: 'agent', providerId: 'codex', reason: 'live' };
  harness.context.renderProviderSelection();
  assert.strictEqual(selectedRadio(harness).dataset.providerId, 'xai',
    'recommendation mutation cannot change checked selection');

  harness.context.setProviderSelection('api', 'anthropic');
  harness.modelName.value = 'invalid-model';
  harness.anthropicApiKey.value = 'preserved-key';
  const discoveryBeforeAgent = harness.calls.discovery.length;
  const visibilityBeforeAgent = harness.calls.visibility.length;
  const connectionBeforeAgent = harness.calls.connection;
  const latentModelProvider = harness.modelProvider.value;
  const latentModelName = harness.modelName.value;
  assert.strictEqual(harness.context.setProviderSelection('agent', 'codex'), true,
    'valid user agent selection is accepted');
  assert.strictEqual(harness.state().providerKind, 'agent');
  assert.strictEqual(harness.state().agentProviderId, 'codex');
  assert.strictEqual(harness.modelProvider.value, latentModelProvider, 'agent selection preserves latent API provider');
  assert.strictEqual(harness.modelName.value, latentModelName, 'agent selection preserves latent API model');
  assert.strictEqual(harness.anthropicApiKey.value, 'preserved-key', 'agent selection preserves inactive API key');
  assert.strictEqual(harness.calls.discovery.length, discoveryBeforeAgent, 'agent selection runs no model discovery');
  assert.strictEqual(harness.calls.visibility.length, visibilityBeforeAgent, 'agent selection runs no key visibility path');
  assert.strictEqual(harness.calls.connection, connectionBeforeAgent, 'agent selection runs no connection test');
  assert.strictEqual(harness.apiDetails.hidden, true, 'agent selection removes API controls from tab flow');
  assert.strictEqual(harness.agentDetails.hidden, false, 'agent selection reveals agent controls');
  assert.strictEqual(selectedRadio(harness).dataset.providerId, 'codex');
  assert.strictEqual(harness.dashboardState().hasUnsavedChanges, true, 'user selection marks Save bar state dirty');
  assert.strictEqual(harness.writes.length, 0, 'user selection does not write storage before Save');

  harness.apiKey.value = 'xai-latent-key';
  harness.context.saveSettings();
  assert.strictEqual(harness.writes.length, 1, 'Save is the first persistence action');
  const savedAgent = harness.writes[0];
  assert.strictEqual(savedAgent.providerKind, 'agent');
  assert.strictEqual(savedAgent.agentProviderId, 'codex');
  assert.strictEqual(savedAgent.modelProvider, 'anthropic', 'agent save preserves API-only provider');
  assert.strictEqual(savedAgent.modelName, latentModelName, 'agent save preserves inactive API model');
  assert.strictEqual(savedAgent.anthropicApiKey, 'preserved-key', 'agent save preserves inactive API key');
  assert.strictEqual(harness.calls.connection, connectionBeforeAgent, 'agent save does not test API connection');
  assert.strictEqual(harness.dashboardState().hasUnsavedChanges, false, 'Save clears dirty state');

  harness.context.setProviderSelection('api', 'openai');
  assert.strictEqual(harness.state().agentProviderId, 'codex', 'API selection preserves latent agent id');
  harness.context.discardChanges();
  await flushHarness();
  assert.strictEqual(harness.state().providerKind, 'agent', 'Discard restores saved agent kind');
  assert.strictEqual(harness.state().agentProviderId, 'codex', 'Discard restores saved agent id');
  assert.strictEqual(harness.modelProvider.value, 'anthropic', 'Discard restores latent saved API provider');
  assert.strictEqual(harness.modelName.value, latentModelName, 'Discard restores latent saved API model');
  assert.strictEqual(harness.anthropicApiKey.value, 'preserved-key', 'Discard restores inactive API key');

  const restoredDiscoveryCount = harness.calls.discovery.length;
  harness.context.setProviderSelection('api', 'anthropic');
  assert.strictEqual(harness.apiDetails.hidden, false, 'switching back restores API detail tab flow');
  assert.strictEqual(harness.agentDetails.hidden, true);
  assert.strictEqual(harness.modelProvider.value, 'anthropic');
  assert.strictEqual(harness.state().agentProviderId, 'codex');
  assert.strictEqual(harness.calls.discovery.length, restoredDiscoveryCount + 1,
    'API restoration invokes existing discovery path once');
  const apiConnectionBeforeSave = harness.calls.connection;
  harness.context.saveSettings();
  assert.strictEqual(harness.writes.at(-1).providerKind, 'api');
  assert.strictEqual(harness.writes.at(-1).agentProviderId, 'codex');
  assert.strictEqual(harness.calls.connection, apiConnectionBeforeSave + 1,
    'API save retains the existing guarded connection check');

  const currentSelection = selectedRadio(harness).dataset.providerId;
  assert.strictEqual(harness.context.setProviderSelection('agent', 'unknown-agent'), false,
    'invalid user agent id is rejected');
  assert.strictEqual(selectedRadio(harness).dataset.providerId, currentSelection,
    'invalid selection cannot disturb current choice');
}

runProviderRuntimeTests()
  .then(() => console.log('PASS providers-panel-ui static and runtime shell'))
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
