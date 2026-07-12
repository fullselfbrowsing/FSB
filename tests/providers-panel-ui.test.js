'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

console.log('PASS providers-panel-ui static shell');
