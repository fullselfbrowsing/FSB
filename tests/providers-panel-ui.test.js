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
  const paramsOpen = source.indexOf('(', start);
  let paramsDepth = 1;
  let paramsCursor = paramsOpen + 1;
  while (paramsCursor < source.length && paramsDepth > 0) {
    if (source[paramsCursor] === '(') paramsDepth += 1;
    if (source[paramsCursor] === ')') paramsDepth -= 1;
    paramsCursor += 1;
  }
  const open = source.indexOf('{', paramsCursor);
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
assert.match(HTML,
  /id="providerEvidenceAnnouncement"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);

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
assert.strictEqual((agentDetails.match(/>—<\/dd>/g) || []).length, 3,
  'agent usage begins with exactly three unknown metric values');
assert.match(agentDetails, /id="agentAccountStatus">Not reported<\/dd>/);
assert.match(agentDetails, /The CLI has not reported its account type\./);
assert.match(agentDetails,
  /FSB uses this CLI's existing sign-in and does not need its credential\. Billing and limits follow the account or provider configured in the CLI\./);
assert.match(agentDetails,
  /id="agentBillingLink"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*hidden/);
assert.doesNotMatch(agentDetails, /id="[^"]*(?:cost|currency)[^"]*"|>\s*Cost\s*</i,
  'agent details contain no cost or currency UI');
assert.doesNotMatch(agentDetails, /Included in your subscription/,
  'unknown Phase 58 auth never statically claims subscription inclusion');
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
assert.match(providerCss, /\.provider-roster__announcement\[role="alert"\]/);
assert.match(providerCss, /\.agent-provider-details__fact \.agent-provider-details__help/);
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

console.log('Providers panel UI: advisory evidence source boundaries');

const requestClientsSource = extractFunction(JS, 'requestMcpClients');
const refreshEvidenceSource = extractFunction(JS, 'refreshProviderEvidence');
const recommendationRenderSource = extractFunction(JS, 'renderProviderRecommendation');
const evidenceRenderSource = extractFunction(JS, 'renderProviderEvidence');
const otherClientsRenderSource = extractFunction(JS, 'renderOtherMcpClients');
const agentDetailsRenderSource = extractFunction(JS, 'renderSelectedAgentDetails');
const setupGuideSource = extractFunction(JS, 'openAgentSetupGuide');
const announcementSource = extractFunction(JS, 'setProviderEvidenceAnnouncement');
const eventSetupSource = extractFunction(JS, 'setupEventListeners');
assert.match(requestClientsSource, /sendMessage\(\{ action: 'getMcpClients' \}/,
  'evidence uses the one Phase 57 runtime action');
assert.match(requestClientsSource, /runtime\.lastError/);
assert.match(requestClientsSource, /getOwnDataValue\(response, 'success'\) !== true/);
assert.match(refreshEvidenceSource, /providerEvidenceRefreshPromise/);
assert.match(refreshEvidenceSource, /hasSuccessfulEvidence/);
assert.match(refreshEvidenceSource, /evidenceStatus = 'stale'/);
assert.match(refreshEvidenceSource, /evidenceStatus = 'unavailable'/);
assert.doesNotMatch(recommendationRenderSource,
  /setProviderSelection|\.checked\s*=|modelProvider|chrome\.storage|markUnsavedChanges/,
  'recommendation rendering cannot write selection or settings');
assert.match(evidenceRenderSource, /status\.checkedAt/);
assert.doesNotMatch(evidenceRenderSource, /lastSeenAt|connectedAt|lastClickedAt/,
  'evidence rendering cannot substitute non-installed timestamps');
assert.match(otherClientsRenderSource, /item\.textContent/);
assert.doesNotMatch(otherClientsRenderSource, /innerHTML|insertAdjacentHTML/,
  'raw client names use text-only DOM population');
assert.match(eventSetupSource, /area === 'local' && changes && changes\.fsbAgentProviders/);
assert.match(eventSetupSource, /area === 'session' && changes && changes\.fsbAgentRegistry/);
assert.match(agentDetailsRenderSource, /getBillingLabel\(undefined\)/,
  'Phase 57 evidence is not treated as auth state');
assert.match(agentDetailsRenderSource, /billing\.label/);
assert.match(agentDetailsRenderSource, /definition\.billingCopy/);
assert.match(agentDetailsRenderSource, /definition\.billingUrl/);
assert.match(agentDetailsRenderSource, /noopener noreferrer/);
assert.doesNotMatch(agentDetailsRenderSource, /\$\s*\d|currency|\bcost\b/i,
  'agent renderer contains no fabricated cost or currency path');
assert.match(setupGuideSource, /getURL\('ui\/onboarding\.html'\)/,
  'setup action uses the existing extension onboarding page');
assert.doesNotMatch(setupGuideSource, /exec|spawn|shell|command/i,
  'setup action does not embed a shell command');
assert.match(announcementSource, /isAlert \? 'alert' : 'status'/);
assert.match(announcementSource, /isAlert \? 'assertive' : 'polite'/);
assert.match(JS, /setTimeout\(\(\) => \{[\s\S]*?refreshProviderEvidence\(\);[\s\S]*?\}, 100\)/);
assert.doesNotMatch(refreshEvidenceSource + eventSetupSource,
  /setInterval|visibilitychange|focus\s*\)|scan|detectInstalled/i,
  'provider evidence has no polling, focus refresh, or disk-scan trigger');

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
    open: false,
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
  let currentTextContent = config.textContent || '';
  Object.defineProperty(element, 'textContent', {
    get() { return currentTextContent; },
    set(value) {
      currentTextContent = String(value);
      element.children = [];
      if (element.tagName === 'SELECT') element.options = [];
    }
  });
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

function createProviderHarness(initialStorage, harnessOptions) {
  const options = harnessOptions || {};
  const registry = Object.create(null);
  const providerRows = [];
  const radios = [];
  const recommendationBadges = [];
  const evidenceBadges = [];
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
    const recommendationBadge = makeElement('', {
      hidden: true,
      classes: ['provider-badge', 'provider-badge--recommended'],
      dataset: { providerRecommendation: id },
      textContent: 'Recommended'
    });
    const evidenceBadge = makeElement('', {
      hidden: true,
      classes: ['provider-badge', 'provider-badge--status'],
      dataset: { providerEvidence: id },
      textContent: 'Status unavailable'
    });
    radio._providerRow = row;
    row.appendChild(recommendationBadge);
    row.appendChild(evidenceBadge);
    row.appendChild(radio);
    providerRows.push(row);
    radios.push(radio);
    recommendationBadges.push(recommendationBadge);
    evidenceBadges.push(evidenceBadge);
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
  const agentDetailsHeading = makeElement('agentProviderDetailsHeading');
  const agentNoCredentialCaption = makeElement('agentNoCredentialCaption');
  const agentEmptyState = makeElement('agentEvidenceEmptyState', { hidden: true });
  const agentInstallationStatus = makeElement('agentInstallationStatus');
  const agentConnectionStatus = makeElement('agentConnectionStatus');
  const agentAccountStatus = makeElement('agentAccountStatus');
  const agentAccountHelp = makeElement('agentAccountHelp');
  const agentSetupStatus = makeElement('agentSetupStatus');
  const openAgentSetupGuideBtn = makeElement('openAgentSetupGuideBtn', { tagName: 'button' });
  const agentUsageTokens = makeElement('agentUsageTokens');
  const agentUsageTurns = makeElement('agentUsageTurns');
  const agentUsageDuration = makeElement('agentUsageDuration');
  const agentUsageEmptyState = makeElement('agentUsageEmptyState');
  const agentBillingStatus = makeElement('agentBillingStatus');
  const agentBillingCopy = makeElement('agentBillingCopy');
  const agentBillingLink = makeElement('agentBillingLink', { tagName: 'a', hidden: true });
  const agentBillingLinkLabel = makeElement('agentBillingLinkLabel');
  const refreshLabel = makeElement('', { textContent: 'Refresh status' });
  const refreshPending = makeElement('', { hidden: true, textContent: 'Refreshing…' });
  const refreshButton = makeElement('refreshProviderStatusBtn', { tagName: 'button' });
  const announcement = makeElement('providerEvidenceAnnouncement', { hidden: true });
  refreshButton.querySelector = (selector) => selector.endsWith('refresh-label')
    ? refreshLabel
    : (selector.endsWith('refresh-pending') ? refreshPending : null);
  const otherDisclosure = makeElement('otherMcpClientsDisclosure', { tagName: 'details', hidden: true });
  const otherSummary = makeElement('otherMcpClientsSummary', { textContent: 'Other MCP clients (0)' });
  const otherList = makeElement('otherMcpClientsList', { tagName: 'ul' });
  const apiKey = makeElement('apiKey', { tagName: 'input' });
  const geminiApiKey = makeElement('geminiApiKey', { tagName: 'input' });
  const openaiApiKey = makeElement('openaiApiKey', { tagName: 'input' });
  const anthropicApiKey = makeElement('anthropicApiKey', { tagName: 'input' });
  const customApiKey = makeElement('customApiKey', { tagName: 'input' });
  const customEndpoint = makeElement('customEndpoint', { tagName: 'input' });
  const openrouterApiKey = makeElement('openrouterApiKey', { tagName: 'input' });
  const lmstudioBaseUrl = makeElement('lmstudioBaseUrl', { tagName: 'input', value: 'http://localhost:1234' });
  [
    providerRoster, modelProvider, modelName, apiDetails, agentDetails,
    agentDetailsHeading, agentNoCredentialCaption, agentEmptyState, agentInstallationStatus,
    agentConnectionStatus, agentAccountStatus, agentAccountHelp, agentSetupStatus,
    openAgentSetupGuideBtn, agentUsageTokens, agentUsageTurns, agentUsageDuration,
    agentUsageEmptyState, agentBillingStatus, agentBillingCopy, agentBillingLink,
    agentBillingLinkLabel, refreshButton, announcement, otherDisclosure, otherSummary, otherList, apiKey,
    geminiApiKey, openaiApiKey, anthropicApiKey, customApiKey, customEndpoint,
    openrouterApiKey, lmstudioBaseUrl
  ].forEach((element) => { registry[element.id] = element; });

  let storage = { ...(initialStorage || {}) };
  const writes = [];
  const storageListeners = [];
  const runtimeCalls = [];
  const pendingRuntimeCallbacks = [];
  const openedSetupPages = [];
  let runtimeResponse = Object.prototype.hasOwnProperty.call(options, 'runtimeResponse')
    ? options.runtimeResponse
    : { success: true, clients: {} };
  let runtimeError = null;
  let holdRuntime = options.holdRuntime === true;
  const document = {
    getElementById(id) { return registry[id] || null; },
    querySelectorAll(selector) {
      if (selector === '.nav-item' || selector === '.content-section') return [];
      if (selector === 'input[name="fsbProviderSelection"]') return radios;
      if (selector === '[data-provider-recommendation]') return recommendationBadges;
      if (selector === '[data-provider-evidence]') return evidenceBadges;
      if (selector === '.form-select, .chart-select') return [modelProvider];
      return [];
    },
    createElement(tagName) { return makeElement('', { tagName: tagName }); },
    addEventListener() {}
  };
  function deliverRuntime(callback, response, error) {
    Promise.resolve().then(() => {
      chrome.runtime.lastError = error ? { message: String(error) } : null;
      callback(response);
      chrome.runtime.lastError = null;
    });
  }
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
      session: {},
      onChanged: { addListener(listener) { storageListeners.push(listener); } }
    },
    runtime: {
      lastError: null,
      getURL(relativePath) { return 'chrome-extension://test/' + relativePath; },
      sendMessage(message, callback) {
        runtimeCalls.push(JSON.parse(JSON.stringify(message)));
        if (holdRuntime) pendingRuntimeCallbacks.push(callback);
        else deliverRuntime(callback, runtimeResponse, runtimeError);
      },
      onMessage: { addListener() {} }
    },
    tabs: {
      create(properties) { openedSetupPages.push({ ...properties }); }
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
    open(url, target, features) { openedSetupPages.push({ url, target, features }); },
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
  context.FSBModelCombobox = { init() {}, refresh() {} };
  context.updateApiKeyVisibility = (provider) => { calls.visibility.push(provider); };
  context.checkApiConnection = () => { calls.connection += 1; };
  context.addLog = () => {};
  context.showToast = () => {};

  return {
    context,
    calls,
    writes,
    runtimeCalls,
    radios,
    recommendationBadges,
    evidenceBadges,
    modelProvider,
    modelName,
    apiDetails,
    agentDetails,
    agentDetailsHeading,
    agentNoCredentialCaption,
    refreshButton,
    refreshLabel,
    refreshPending,
    announcement,
    agentEmptyState,
    agentInstallationStatus,
    agentConnectionStatus,
    agentAccountStatus,
    agentAccountHelp,
    agentSetupStatus,
    openAgentSetupGuideBtn,
    agentUsageTokens,
    agentUsageTurns,
    agentUsageDuration,
    agentUsageEmptyState,
    agentBillingStatus,
    agentBillingCopy,
    agentBillingLink,
    agentBillingLinkLabel,
    openedSetupPages,
    otherDisclosure,
    otherSummary,
    otherList,
    apiKey,
    anthropicApiKey,
    get storage() { return storage; },
    setStorage(next) { storage = { ...next }; },
    setRuntimeResponse(response) {
      runtimeResponse = response;
      runtimeError = null;
      holdRuntime = false;
    },
    setRuntimeError(error) {
      runtimeResponse = undefined;
      runtimeError = error || 'runtime unavailable';
      holdRuntime = false;
    },
    holdRuntime() { holdRuntime = true; },
    resolveRuntime(response, error) {
      holdRuntime = false;
      const callbacks = pendingRuntimeCallbacks.splice(0);
      callbacks.forEach((callback) => deliverRuntime(callback, response, error));
    },
    emitStorage(changes, area) {
      storageListeners.slice().forEach((listener) => listener(changes, area));
    },
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

function visibleRecommendationIds(harness) {
  return harness.recommendationBadges
    .filter((badge) => !badge.hidden)
    .map((badge) => badge.dataset.providerRecommendation);
}

function evidenceBadge(harness, providerId) {
  return harness.evidenceBadges.find((badge) => badge.dataset.providerEvidence === providerId);
}

async function runAgentDetailsTests() {
  console.log('Providers panel UI: honest agent account, setup, usage, and billing details');
  const harness = createProviderHarness();
  harness.context.setupEventListeners();
  harness.state().hasSuccessfulEvidence = true;
  harness.state().evidenceStatus = 'ready';
  harness.state().clients = {
    'claude-code': { live: { agentId: 'claude-live' } },
    opencode: { connected: { lastSeenAt: 20 } },
    codex: { installed: { detected: true, checkedAt: 30 } }
  };

  const expected = {
    'claude-code': {
      heading: 'Claude Code details',
      installation: 'Not installed',
      connection: 'Connected now',
      copy: "Uses the account signed into Claude Code. FSB does not need your Anthropic credential. Usage and charges follow that account's Claude plan or API configuration.",
      label: 'Review Claude plans and billing',
      url: 'https://claude.com/pricing'
    },
    opencode: {
      heading: 'OpenCode details',
      installation: 'Not installed',
      connection: 'Seen before',
      copy: 'Uses the provider configured in OpenCode. FSB does not need that provider credential. Charges may come from OpenCode Zen or the configured provider.',
      label: 'Review OpenCode providers and billing',
      url: 'https://opencode.ai/docs/providers/'
    },
    codex: {
      heading: 'Codex details',
      installation: 'Installed',
      connection: 'Not connected',
      copy: "Uses the account signed into Codex. FSB does not need your OpenAI credential. Usage, credits, and charges follow that account's current OpenAI plan or API configuration.",
      label: 'Review current Codex billing',
      url: 'https://help.openai.com/en/articles/20001106-codex-rate-card-2'
    }
  };

  for (const providerId of PROVIDERS.AGENT_PROVIDER_IDS) {
    harness.context.setProviderSelection('agent', providerId, { markDirty: false });
    const contract = expected[providerId];
    assert.strictEqual(harness.agentDetailsHeading.textContent, contract.heading);
    assert.strictEqual(harness.agentInstallationStatus.textContent, contract.installation);
    assert.strictEqual(harness.agentConnectionStatus.textContent, contract.connection);
    assert.strictEqual(harness.agentAccountStatus.textContent, 'Not reported');
    assert.strictEqual(harness.agentAccountHelp.textContent,
      'The CLI has not reported its account type.');
    assert.strictEqual(harness.agentNoCredentialCaption.textContent,
      "FSB uses this CLI's existing sign-in and does not need its credential. Billing and limits follow the account or provider configured in the CLI.");
    assert.strictEqual(harness.agentUsageTokens.textContent, '—');
    assert.strictEqual(harness.agentUsageTurns.textContent, '—');
    assert.strictEqual(harness.agentUsageDuration.textContent, '—');
    assert.strictEqual(harness.agentUsageEmptyState.textContent, 'No delegated runs yet');
    assert.strictEqual(harness.agentBillingStatus.textContent, 'Billing not reported');
    assert.strictEqual(harness.agentBillingCopy.textContent, contract.copy);
    assert.strictEqual(harness.agentBillingLinkLabel.textContent, contract.label);
    assert.strictEqual(harness.agentBillingLink.getAttribute('href'), contract.url);
    assert.strictEqual(harness.agentBillingLink.getAttribute('target'), '_blank');
    assert.strictEqual(harness.agentBillingLink.getAttribute('rel'), 'noopener noreferrer');
    assert.strictEqual(harness.agentBillingLink.hidden, false);
  }

  harness.openAgentSetupGuideBtn.dispatchEvent({ type: 'click' });
  assert.deepStrictEqual(harness.openedSetupPages, [
    { url: 'chrome-extension://test/ui/onboarding.html' }
  ], 'setup action opens the existing extension onboarding surface once');
}

async function runProviderEvidenceTests() {
  console.log('Providers panel UI: runtime evidence, recommendation, and failure safety');

  const harness = createProviderHarness({}, {
    runtimeResponse: {
      success: true,
      clients: {
        codex: {
          id: 'codex', raw: false, displayName: 'Codex', clicked: null,
          installed: { detected: true, configPath: null, checkedAt: 500 },
          connected: null, live: null
        },
        opencode: {
          id: 'opencode', raw: false, displayName: 'OpenCode', clicked: { lastClickedAt: 900 },
          installed: null, connected: null, live: { agentId: 'agent_open' }
        },
        'claude-code': {
          id: 'claude-code', raw: false, displayName: 'Claude Code', clicked: null,
          installed: null, connected: { lastSeenAt: 800 }, live: { agentId: 'agent_claude' }
        }
      }
    }
  });
  harness.context.setupEventListeners();
  harness.context.setProviderSelection('api', 'anthropic', { markDirty: false });
  harness.modelName.appendChild(makeOption('claude-model', 'claude-model'));
  harness.modelName.value = 'claude-model';
  harness.anthropicApiKey.value = 'preserve-this-key';
  const beforeRefresh = {
    selected: selectedRadio(harness).dataset.providerId,
    modelProvider: harness.modelProvider.value,
    modelName: harness.modelName.value,
    key: harness.anthropicApiKey.value,
    dirty: harness.dashboardState().hasUnsavedChanges,
    writes: harness.writes.length
  };

  await harness.context.refreshProviderEvidence();
  assert.deepStrictEqual(harness.runtimeCalls, [{ action: 'getMcpClients' }]);
  assert.deepStrictEqual(visibleRecommendationIds(harness), ['claude-code'],
    'fixed Claude tie order yields exactly one visible live recommendation');
  assert.strictEqual(evidenceBadge(harness, 'claude-code').textContent, 'Connected now');
  assert.strictEqual(evidenceBadge(harness, 'opencode').textContent, 'Connected now');
  assert.strictEqual(evidenceBadge(harness, 'codex').textContent, 'Installed');
  assert.deepStrictEqual({
    selected: selectedRadio(harness).dataset.providerId,
    modelProvider: harness.modelProvider.value,
    modelName: harness.modelName.value,
    key: harness.anthropicApiKey.value,
    dirty: harness.dashboardState().hasUnsavedChanges,
    writes: harness.writes.length
  }, beforeRefresh, 'evidence refresh preserves selection, API values, Save state, and storage');

  harness.setRuntimeResponse({
    success: true,
    clients: {
      'claude-code': {
        id: 'claude-code', raw: false, displayName: 'Claude Code', clicked: null,
        installed: null, connected: { lastSeenAt: 999999 }, live: null
      }
    }
  });
  await harness.context.refreshProviderEvidence();
  assert.deepStrictEqual(visibleRecommendationIds(harness), ['xai'],
    'historical-only evidence retains the xAI fallback recommendation');
  assert.strictEqual(evidenceBadge(harness, 'claude-code').textContent, 'Seen before');
  assert.strictEqual(evidenceBadge(harness, 'claude-code').getAttribute('title'), null,
    'historical timestamp is never displayed as the installed check time');

  harness.setRuntimeResponse({
    success: true,
    clients: {
      'raw:markup': {
        id: 'raw:markup', raw: true, displayName: '<img src=x onerror=alert(1)>',
        clicked: null, installed: null, connected: {}, live: null
      },
      cursor: {
        id: 'cursor', raw: false, displayName: 'Cursor',
        clicked: {}, installed: null, connected: null, live: null
      }
    }
  });
  await harness.context.refreshProviderEvidence();
  assert.strictEqual(harness.otherDisclosure.hidden, false);
  assert.strictEqual(harness.otherSummary.textContent, 'Other MCP clients (2)');
  assert.deepStrictEqual(harness.otherList.children.map((item) => item.textContent), [
    '<img src=x onerror=alert(1)> — Observed MCP client',
    'Cursor — Observed MCP client'
  ], 'unsupported clients are sorted and rendered as inert text');
  assert.strictEqual(harness.agentEmptyState.hidden, false,
    'no supported agent evidence reveals the exact static empty-state block');
  assert.deepStrictEqual(visibleRecommendationIds(harness), ['xai']);

  harness.setRuntimeResponse({
    success: true,
    clients: {
      codex: {
        id: 'codex', raw: false, displayName: 'Codex', clicked: {},
        installed: null, connected: null, live: null
      }
    }
  });
  await harness.context.refreshProviderEvidence();
  assert.strictEqual(harness.agentEmptyState.hidden, true,
    'any supported clicked/installed/connected/live evidence hides the empty state');
  assert.strictEqual(harness.otherDisclosure.hidden, true,
    'Other MCP clients disclosure disappears when the count returns to zero');

  const priorClients = JSON.stringify(harness.state().clients);
  const priorRecommendation = JSON.stringify(harness.state().recommendation);
  harness.setRuntimeError('private transport detail must not surface');
  await harness.context.refreshProviderEvidence({ announce: true });
  assert.strictEqual(harness.state().evidenceStatus, 'stale');
  assert.strictEqual(JSON.stringify(harness.state().clients), priorClients,
    'runtime failure retains the previous successful evidence snapshot');
  assert.strictEqual(JSON.stringify(harness.state().recommendation), priorRecommendation,
    'runtime failure retains the previous recommendation');
  assert.strictEqual(harness.agentDetails.getAttribute('role'), null,
    'the full details region never becomes an assertive alert');
  assert.strictEqual(harness.announcement.getAttribute('role'), 'alert');
  assert.strictEqual(harness.announcement.getAttribute('aria-live'), 'assertive');
  assert.strictEqual(harness.announcement.textContent,
    'Provider status may be stale. Refresh after the FSB server reconnects.');
  assert.match(evidenceBadge(harness, 'codex').textContent, /Status may be stale/);
  assert.match(evidenceBadge(harness, 'codex').getAttribute('title'), /Status may be stale/);
  assert.doesNotMatch(evidenceBadge(harness, 'codex').getAttribute('title'), /private transport detail/);
  assert.deepStrictEqual(visibleRecommendationIds(harness), ['codex'],
    'preserved clicked recommendation remains exactly one after a stale failure');
  assert.strictEqual(selectedRadio(harness).dataset.providerId, beforeRefresh.selected);

  const malformed = createProviderHarness({}, {
    runtimeResponse: { success: true, clients: [] }
  });
  malformed.context.setProviderSelection('agent', 'codex', { markDirty: false });
  await malformed.context.refreshProviderEvidence();
  assert.strictEqual(malformed.state().evidenceStatus, 'unavailable');
  assert.deepStrictEqual(visibleRecommendationIds(malformed), ['xai']);
  assert.strictEqual(selectedRadio(malformed).dataset.providerId, 'codex',
    'malformed first response does not clear the checked agent radio');
  assert.strictEqual(evidenceBadge(malformed, 'codex').textContent, 'Status unavailable');
  assert.strictEqual(malformed.announcement.getAttribute('role'), 'status',
    'background failure retains polite status semantics');
  assert.strictEqual(malformed.announcement.getAttribute('aria-live'), 'polite');
  assert.strictEqual(malformed.announcement.textContent,
    'Provider status is unavailable. Your selection is unchanged.');

  const missingRuntime = createProviderHarness();
  missingRuntime.context.setProviderSelection('api', 'openai', { markDirty: false });
  delete missingRuntime.context.chrome.runtime.sendMessage;
  await missingRuntime.context.refreshProviderEvidence();
  assert.strictEqual(missingRuntime.state().evidenceStatus, 'unavailable');
  assert.deepStrictEqual(visibleRecommendationIds(missingRuntime), ['xai']);
  assert.strictEqual(selectedRadio(missingRuntime).dataset.providerId, 'openai');

  console.log('Providers panel UI: coalescing, manual refresh, storage debounce, and section entry');
  const coalesced = createProviderHarness({}, { holdRuntime: true });
  coalesced.context.setupEventListeners();
  coalesced.context.setProviderSelection('agent', 'opencode', { markDirty: false });
  const first = coalesced.context.refreshProviderEvidence();
  const second = coalesced.context.refreshProviderEvidence();
  assert.strictEqual(first, second, 'concurrent refresh callers share one in-flight promise');
  assert.deepStrictEqual(coalesced.runtimeCalls, [{ action: 'getMcpClients' }]);
  assert.strictEqual(coalesced.refreshButton.disabled, true);
  assert.strictEqual(coalesced.refreshButton.getAttribute('aria-busy'), 'true');
  assert.strictEqual(coalesced.refreshLabel.hidden, true);
  assert.strictEqual(coalesced.refreshPending.hidden, false);
  coalesced.resolveRuntime({ success: true, clients: {} });
  await first;
  assert.strictEqual(coalesced.refreshButton.disabled, false);
  assert.strictEqual(coalesced.refreshButton.getAttribute('aria-busy'), 'false');
  assert.strictEqual(coalesced.refreshLabel.hidden, false);
  assert.strictEqual(coalesced.refreshPending.hidden, true);
  assert.strictEqual(selectedRadio(coalesced).dataset.providerId, 'opencode');

  const callsBeforeIrrelevantStorage = coalesced.runtimeCalls.length;
  coalesced.emitStorage({ unrelated: { newValue: true } }, 'local');
  await flushHarness();
  assert.strictEqual(coalesced.runtimeCalls.length, callsBeforeIrrelevantStorage,
    'unrelated storage events do not refresh provider evidence');

  coalesced.holdRuntime();
  coalesced.emitStorage({ fsbAgentProviders: { newValue: {} } }, 'local');
  coalesced.emitStorage({ fsbAgentRegistry: { newValue: {} } }, 'session');
  await flushHarness();
  assert.strictEqual(coalesced.runtimeCalls.length, callsBeforeIrrelevantStorage + 1,
    'local and session evidence changes debounce/coalesce to one refresh');
  coalesced.resolveRuntime({ success: true, clients: {} });
  await flushHarness();

  coalesced.holdRuntime();
  const callsBeforeSection = coalesced.runtimeCalls.length;
  coalesced.context.switchSection('providers');
  assert.strictEqual(coalesced.runtimeCalls.length, callsBeforeSection + 1,
    'canonical Providers entry requests fresh evidence');
  coalesced.resolveRuntime({ success: true, clients: {} });
  await flushHarness();

  coalesced.holdRuntime();
  const callsBeforeManual = coalesced.runtimeCalls.length;
  coalesced.refreshButton.dispatchEvent({ type: 'click' });
  assert.strictEqual(coalesced.runtimeCalls.length, callsBeforeManual + 1,
    'Refresh status invokes one explicit refresh');
  coalesced.resolveRuntime({ success: true, clients: {} });
  await flushHarness();
  assert.strictEqual(selectedRadio(coalesced).dataset.providerId, 'opencode',
    'storage, section, and manual refreshes all preserve in-form selection');
}

runProviderRuntimeTests()
  .then(runAgentDetailsTests)
  .then(runProviderEvidenceTests)
  .then(() => console.log('PASS providers-panel-ui static and runtime evidence'))
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
