'use strict';

const assert = require('assert');
const crypto = require('crypto');
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

function assertBalancedHtmlFragment(fragment, label) {
  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);
  const stack = [];
  const source = fragment.replace(/<!--[\s\S]*?-->/g, '');
  const tags = /<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi;
  let match;
  while ((match = tags.exec(source))) {
    const token = match[0];
    const tag = match[1].toLowerCase();
    if (token.startsWith('</')) {
      const open = stack.pop();
      assert.ok(open, label + ' has an unexpected </' + tag + '>');
      assert.strictEqual(tag, open.tag,
        label + ' closes </' + tag + '> while <' + open.tag + '> from offset ' + open.offset + ' is open');
    } else if (!voidTags.has(tag) && !token.endsWith('/>')) {
      stack.push({ tag, offset: match.index });
    }
  }
  assert.deepStrictEqual(stack, [], label + ' has no unclosed tags');
}

const HTML = read('extension/ui/control_panel.html');
const CSS = read('extension/ui/options.css');
const JS = read('extension/ui/options.js');
const DELEGATION_PROVIDERS = require('../extension/utils/delegation-providers.js');
const PROVIDERS = require('../extension/ui/providers-panel.js');

const delegationTrustMountSource = extractFunction(JS, 'ensureDelegationTrustControl');
const delegationTrustRenderSource = extractFunction(JS, 'renderDelegationTrustControl');
const delegationTrustClearSource = extractFunction(JS, 'clearDelegationTrust');
assert.doesNotMatch(delegationTrustMountSource, /Claude Code|OpenCode|claude-code|opencode/,
  'the trust control mount has no provider-specific placeholder');
assert.match(delegationTrustRenderSource, /provider\.label/,
  'the existing trust control copy is driven by canonical selected-provider metadata');
assert.doesNotMatch(delegationTrustClearSource, /['"](?:claude-code|opencode)['"]/,
  'clear trust contains no fixed provider id');

console.log('Providers panel UI: canonical route and static roster');

assert.match(HTML, /data-section="providers"/);
assert.match(HTML, /<section class="content-section" id="providers">/);
assert.match(HTML, /<h2>Providers<\/h2>/);
const providersSection = extractElement(HTML, 'section', 'providers');
assertBalancedHtmlFragment(providersSection, '#providers section');
assert.match(providersSection,
  /<div class="form-card provider-details-card">[\s\S]*?<\/div>\s*<\/section>$/,
  'Providers detail card is explicitly closed before the section');
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

const canonicalHelperScript = '  <script src="../utils/delegation-providers.js"></script>\n';
const canonicalHelperTags = HTML.match(
  /<script\s+src="\.\.\/utils\/delegation-providers\.js"><\/script>/g
) || [];
const helperTags = HTML.match(/<script\s+src="providers-panel\.js"><\/script>/g) || [];
assert.strictEqual(canonicalHelperTags.length, 1,
  'canonical delegation provider helper is loaded exactly once');
assert.strictEqual(helperTags.length, 1, 'provider panel helper is loaded exactly once');
assert.ok(
  HTML.indexOf('src="../utils/delegation-providers.js"')
    < HTML.indexOf('src="providers-panel.js"')
    && HTML.indexOf('src="providers-panel.js"') < HTML.indexOf('src="options.js"'),
  'canonical delegation helper loads before both Providers consumers'
);
assert.match(HTML,
  /<script src="\.\.\/utils\/delegation-providers\.js"><\/script>\s*<script src="providers-panel\.js"><\/script>\s*<script src="options\.js"><\/script>/,
  'the three Providers scripts remain adjacent in dependency order');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
assert.strictEqual(
  sha256(HTML.replace(canonicalHelperScript, '')),
  'effea844924badc6cf0bae22d3a98a75d4a4f12506bb1e4b1897dd51b01b667e',
  'the canonical helper line is the only control-panel HTML delta'
);
assert.strictEqual(
  sha256(providersSection),
  '747b52e964882ef11f82f96e22696c495b45e2c1ffee8b2e8f552fd436f64a04',
  'the visible Providers section remains byte-equivalent'
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
assert.deepStrictEqual(radioContract.slice(0, 3), [
  { kind: 'agent', id: 'claude-code', value: 'claude-code' },
  { kind: 'agent', id: 'opencode', value: 'opencode' },
  { kind: 'agent', id: 'codex', value: 'codex' }
], 'OpenCode remains the unchanged second Agent CLI row between Claude Code and Codex');

const providerLabels = HTML.match(/<label\b[^>]*class="provider-row"[^>]*>[\s\S]*?<\/label>/g) || [];
assert.strictEqual(providerLabels.length, 10, 'every radio has a provider-row label');
providerLabels.forEach((label, index) => {
  assert.strictEqual(attribute(label.slice(0, label.indexOf('>') + 1), 'data-provider-kind'), expectedContract[index].kind);
  assert.strictEqual(attribute(label.slice(0, label.indexOf('>') + 1), 'data-provider-id'), expectedContract[index].id);
  assert.doesNotMatch(label, /<(?:a|button|select|textarea)\b/i, 'provider labels contain no nested secondary controls');
  const nameSpan = label.match(/<span\b[^>]*\bid="([^"]+)"[^>]*\bclass="provider-row__name"[^>]*>([^<]+)<\/span>/);
  const descriptionSpan = label.match(/<span\b[^>]*\bid="([^"]+)"[^>]*\bclass="visually-hidden"[^>]*\bdata-provider-description="([^"]+)"[^>]*><\/span>/);
  const radio = label.match(/<input\b[^>]*\bname="fsbProviderSelection"[^>]*>/);
  assert.ok(nameSpan && descriptionSpan && radio,
    'provider row contains stable name and description spans plus its radio');
  assert.strictEqual(attribute(radio[0], 'aria-labelledby'), nameSpan[1],
    'radio accessible name resolves only from its stable provider-name span');
  const describedBy = String(attribute(radio[0], 'aria-describedby') || '').split(/\s+/).filter(Boolean);
  const compatibilityDescriptionId = 'provider-agent-' + expectedContract[index].id
    + '-compatibility-description';
  assert.strictEqual(describedBy[0], descriptionSpan[1],
    'radio retains its stable recommendation and evidence description first');
  assert.strictEqual(descriptionSpan[2], expectedContract[index].id,
    'description state is keyed to the same closed provider id');
  assert.strictEqual(nameSpan[2], PROVIDERS.getProviderDefinition(expectedContract[index].kind, expectedContract[index].id).displayName,
    'stable accessible name is exactly the provider display name');
  const dynamicBadges = label.match(/<span\b[^>]*\bclass="provider-badge [^"]+"[^>]*>/g) || [];
  assert.strictEqual(dynamicBadges.length, 2);
  dynamicBadges.forEach((badge) => {
    assert.strictEqual(attribute(badge, 'aria-hidden'), 'true',
      'changing recommendation and evidence text is excluded from the radio name');
  });
  if (expectedContract[index].kind === 'agent') {
    assert.deepStrictEqual(describedBy, [descriptionSpan[1], compatibilityDescriptionId],
      'agent radio references compatibility alongside recommendation and evidence');
    assert.match(label, new RegExp(
      '<span class="provider-row__compatibility" data-provider-compatibility-group="'
        + expectedContract[index].id + '">'
    ));
    assert.match(label, /<span class="provider-row__compatibility-label">Compatibility<\/span>/);
    assert.match(label, new RegExp(
      '<i class="fas fa-circle-xmark provider-row__compatibility-icon" data-provider-compatibility-icon="'
        + expectedContract[index].id + '" aria-hidden="true"><\\/i>'
    ));
    assert.match(label, new RegExp(
      '<span class="compatibility-badge compatibility-badge--unsupported" data-provider-compatibility-status="'
        + expectedContract[index].id + '">Unsupported<\\/span>'
    ));
    assert.match(label, new RegExp(
      '<span id="' + compatibilityDescriptionId
        + '" class="visually-hidden" data-provider-compatibility-description="'
        + expectedContract[index].id + '">Compatibility: Unsupported\\. '
    ));
    const compatibilityGroup = label.match(
      /<span class="provider-row__compatibility"[\s\S]*?<\/span>\s*<span id="provider-agent-[^"]+-compatibility-description"/
    );
    assert.ok(compatibilityGroup, 'compatibility is a sibling after the evidence content');
    assert.doesNotMatch(compatibilityGroup[0], /role="status"|aria-live|tabindex=/,
      'row compatibility is descriptive, non-live, and non-interactive');
    assert.ok(
      label.indexOf('class="provider-row__compatibility"') < label.indexOf('<input class="provider-radio"'),
      'compatibility precedes the trailing native radio without moving it'
    );
  } else {
    assert.deepStrictEqual(describedBy, [descriptionSpan[1]],
      'API radio retains only its recommendation/evidence description');
    assert.doesNotMatch(label, /provider-row__compatibility|data-provider-compatibility/,
      'API rows receive no compatibility group or description');
  }
});
assert.strictEqual((providersSection.match(/data-provider-compatibility-group=/g) || []).length, 3,
  'exactly the three agent rows contain one compatibility group');
assert.strictEqual((providersSection.match(/data-provider-compatibility-description=/g) || []).length, 3,
  'exactly the three agent radios receive one stable compatibility description');
const openCodeRow = providerLabels[1];
assert.strictEqual((openCodeRow.match(/data-provider-id="opencode"/g) || []).length, 2,
  'the unchanged OpenCode label and native radio share the closed provider id');
assert.strictEqual((openCodeRow.match(/data-provider-evidence="opencode"/g) || []).length, 1,
  'OpenCode retains one evidence badge in its existing content cluster');
assert.strictEqual((openCodeRow.match(/data-provider-compatibility-group="opencode"/g) || []).length, 1,
  'OpenCode retains one compatibility group');
assert.strictEqual((openCodeRow.match(/data-provider-compatibility-description="opencode"/g) || []).length, 1,
  'OpenCode retains one stable compatibility description');
assert.strictEqual((openCodeRow.match(/<input\b[^>]*\bdata-provider-id="opencode"[^>]*>/g) || []).length, 1,
  'OpenCode retains one native radio');

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
const agentDetailsOpeningTag = HTML.match(/<div id="agentProviderDetails"[^>]*>/);
assert.ok(agentDetailsOpeningTag, 'agent provider details have one stable container');
assert.match(agentDetailsOpeningTag[0], /\bhidden\b/);
assert.doesNotMatch(agentDetailsOpeningTag[0], /\brole=|\baria-live=/,
  'the changing details container is not a second compatibility live region');
[
  'modelCombobox', 'modelDiscoveryStatus', 'refreshModelsBtn', 'xaiApiKeyGroup',
  'geminiApiKeyGroup', 'openaiApiKeyGroup', 'anthropicApiKeyGroup',
  'openrouterApiKeyGroup', 'lmstudioServerGroup', 'customApiGroup',
  'apiStatusCard', 'fullApiTest'
].forEach((id) => assert.match(extractElement(HTML, 'div', 'apiProviderDetails'), new RegExp('id="' + id + '"')));

const agentDetails = extractElement(HTML, 'div', 'agentProviderDetails');
const compatibilityAnnouncementTag = HTML.match(/<p id="providerEvidenceAnnouncement"[^>]*>/);
assert.ok(compatibilityAnnouncementTag, 'compatibility refreshes have one shared announcement owner');
const compatibilitySurfaceTags = [
  compatibilityAnnouncementTag[0],
  agentDetailsOpeningTag[0],
  ...['agentCompatibilityStatus', 'agentCompatibilityHelp', 'agentCompatibilityChecked'].map((id) => {
    const match = HTML.match(new RegExp('<(?:dd|p)[^>]*id="' + id + '"[^>]*>'));
    assert.ok(match, 'finds compatibility surface #' + id);
    return match[0];
  }),
  ...Array.from(providersSection.matchAll(/<span class="provider-row__compatibility"[^>]*>/g),
    (match) => match[0])
];
assert.deepStrictEqual(
  compatibilitySurfaceTags.filter((tag) => /\brole=|\baria-live=/.test(tag)),
  [compatibilityAnnouncementTag[0]],
  '#providerEvidenceAnnouncement is the sole live owner for compatibility changes'
);
['Installation', 'Connection', 'Compatibility', 'Account/Auth', 'Setup', 'Usage', 'Tokens', 'Turns', 'Duration'].forEach((label) => {
  assert.ok(agentDetails.includes(label), 'agent details include ' + label);
});
assert.match(agentDetails, /<dt>Compatibility<\/dt>/);
assert.match(agentDetails, /id="agentCompatibilityStatus">Unsupported<\/dd>/);
assert.match(agentDetails,
  /id="agentCompatibilityHelp"[^>]*>FSB cannot verify compatibility for this CLI\. Refresh status or review setup before starting a task\.<\/dd>/);
assert.match(agentDetails, /id="agentCompatibilityChecked"[^>]*hidden><\/dd>/);
assert.match(agentDetails, /id="agentUsageTokens">—<\/dd>/);
assert.match(agentDetails, /id="agentUsageTurns">—<\/dd>/);
assert.match(agentDetails, /id="agentUsageDuration">—<\/dd>/);
assert.match(agentDetails, /No delegated runs yet/);
assert.strictEqual((agentDetails.match(/>—<\/dd>/g) || []).length, 3,
  'agent usage begins with exactly three unknown metric values');
assert.match(agentDetails, /id="agentAccountStatus">Not reported<\/dd>/);
assert.match(agentDetails, /Claude Code does not report an auth state that FSB can safely read\./);
assert.match(agentDetails,
  /FSB uses this CLI's existing sign-in and does not need its credential\. Billing and limits follow the account or provider configured in the CLI\./);
const pairingInputTag = agentDetails.match(/<input\b[^>]*\bid="mcpBridgePairingCode"[^>]*>/);
assert.ok(pairingInputTag, 'agent details include the local bridge pairing input');
assert.strictEqual(attribute(pairingInputTag[0], 'type'), 'password');
assert.strictEqual(attribute(pairingInputTag[0], 'autocomplete'), 'off');
assert.strictEqual(attribute(pairingInputTag[0], 'spellcheck'), 'false');
assert.match(agentDetails, /<label[^>]*for="mcpBridgePairingCode"[^>]*>Pairing code<\/label>/);
assert.strictEqual((agentDetails.match(/id="mcpBridgePairingCode"/g) || []).length, 1,
  'agent details contain exactly one pairing input');
assert.match(agentDetails,
  /Run fsb-mcp-server pair, then paste the code here\. The code stays in this browser session\./);
assert.match(agentDetails, /id="pairMcpBridgeBtn"[^>]*>Pair bridge<\/button>/);
assert.match(agentDetails, /id="removeMcpBridgePairingBtn"[^>]*>Remove pairing<\/button>/);
assert.match(agentDetails,
  /id="mcpBridgePairingStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
assert.ok(
  agentDetails.indexOf('id="mcpBridgePairingCode"') < agentDetails.indexOf('id="pairMcpBridgeBtn"')
    && agentDetails.indexOf('id="pairMcpBridgeBtn"') < agentDetails.indexOf('id="removeMcpBridgePairingBtn"')
    && agentDetails.indexOf('id="removeMcpBridgePairingBtn"') < agentDetails.indexOf('id="mcpBridgePairingStatus"'),
  'pairing controls follow a sensible keyboard and reading order'
);
assert.ok(
  agentDetails.indexOf('id="agentSetupHeading"') < agentDetails.indexOf('id="mcpBridgePairingHeading"')
    && agentDetails.indexOf('id="mcpBridgePairingHeading"') < agentDetails.indexOf('id="agentUsageHeading"'),
  'local bridge pairing appears between Setup and Usage'
);
providerLabels.forEach((label) => {
  assert.doesNotMatch(label, /mcpBridgePairing|Pair bridge|Remove pairing/,
    'pairing controls stay outside provider radio labels');
});
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
assert.strictEqual(
  sha256(providerCss),
  '295a04bf37d4fb44b3ea24a8900ac1171eec59db9a4f33e525fa69fb23f7dfa6',
  'the Providers CSS block remains byte-equivalent'
);
assert.match(providerCss, /\.provider-row\s*\{/);
assert.match(providerCss, /min-height:\s*64px/);
assert.match(providerCss, /padding:\s*16px/);
assert.match(providerCss, /gap:\s*12px/);
assert.match(providerCss, /border:\s*2px solid var\(--border-color\)/);
assert.match(providerCss, /border-color:\s*var\(--primary-color\)/);
assert.match(providerCss,
  /(?:^|\n)\.provider-row\.is-selected\s*\{[^}]*background:\s*var\(--primary-light\);[^}]*border-color:\s*var\(--primary-color\);[^}]*\}/,
  'Chrome 88 receives selected styling from a standalone class rule');
assert.doesNotMatch(providerCss, /\.provider-row\.is-selected\s*,[^\{]*:has\(/,
  'the compatibility selected rule never shares a selector list with :has()');
assert.match(providerCss, /\.provider-row:focus-within\s*\{[^}]*var\(--fsb-focus-ring\)/,
  'Chrome 88 receives row focus styling through focus-within');
assert.match(providerCss, /@supports selector\(\.provider-row:has\(\.provider-radio:checked\)\)/,
  ':has() selected-state enhancement is feature-gated');
assert.doesNotMatch(providerCss,
  /\[data-theme="dark"\] \.provider-row\.is-selected\s*,[^\{]*:has\(/,
  'dark-mode selected baseline also remains independent of :has()');
assert.match(providerCss, /\.provider-badge--recommended[\s\S]*var\(--info-light\)/);
const neutralBadgeRule = providerCss.match(/\.provider-badge--neutral\s*\{[^}]*\}/);
assert.ok(neutralBadgeRule, 'neutral evidence badge has an explicit fallback rule');
assert.doesNotMatch(neutralBadgeRule[0], /\.provider-badge--status/,
  'permanent status base class cannot override semantic evidence modifiers');
assert.doesNotMatch(providerCss,
  /\.provider-badge--neutral\s*,\s*\.provider-badge--status\s*\{/,
  'neutral colors are never grouped with the permanent status base class');

const compatibilityGroupRule = providerCss.match(/\.provider-row__compatibility\s*\{[^}]*\}/);
assert.ok(compatibilityGroupRule, 'compatibility has a dedicated inline group rule');
assert.match(compatibilityGroupRule[0], /display:\s*flex/);
assert.match(compatibilityGroupRule[0], /flex-wrap:\s*wrap/);
assert.match(compatibilityGroupRule[0], /gap:\s*4px 8px/);
assert.match(compatibilityGroupRule[0], /min-width:\s*0/);
assert.match(compatibilityGroupRule[0], /max-width:\s*100%/);
assert.match(compatibilityGroupRule[0], /padding-left:\s*16px/);
assert.match(compatibilityGroupRule[0], /border-left:\s*1px solid var\(--border-color\)/);
assert.match(compatibilityGroupRule[0], /overflow-wrap:\s*anywhere/);

const compatibilityLabelRule = providerCss.match(/\.provider-row__compatibility-label\s*\{[^}]*\}/);
assert.ok(compatibilityLabelRule, 'compatibility micro-label has an explicit typography rule');
assert.match(compatibilityLabelRule[0], /font-size:\s*12px/);
assert.match(compatibilityLabelRule[0], /font-weight:\s*400/);
assert.match(compatibilityLabelRule[0], /line-height:\s*1\.5/);

const compatibilityBadgeRule = providerCss.match(/\.compatibility-badge\s*\{[^}]*\}/);
assert.ok(compatibilityBadgeRule, 'compatibility pill has an explicit base rule');
assert.match(compatibilityBadgeRule[0], /display:\s*inline-flex/);
assert.match(compatibilityBadgeRule[0], /padding:\s*4px 8px/);
assert.match(compatibilityBadgeRule[0], /font-size:\s*12px/);
assert.match(compatibilityBadgeRule[0], /font-weight:\s*600/);
assert.match(compatibilityBadgeRule[0], /line-height:\s*1\.2/);
assert.match(compatibilityBadgeRule[0], /overflow-wrap:\s*anywhere/);
assert.doesNotMatch(compatibilityBadgeRule[0], /text-overflow|white-space:\s*nowrap/,
  'compatibility labels wrap instead of truncating');

[
  ['supported', 'success', 'fa-circle-check'],
  ['degraded', 'warning', 'fa-triangle-exclamation'],
  ['unsupported', 'error', 'fa-circle-xmark']
].forEach(([state, tone, icon]) => {
  assert.match(providerCss, new RegExp(
    '\\.compatibility-badge--' + state
      + ',\\s*\\.provider-row__compatibility-icon\\.' + icon
      + '\\s*\\{[^}]*color:\\s*var\\(--' + tone + '-color\\)'
  ), state + ' text and icon use the exact semantic color token');
  assert.match(providerCss, new RegExp(
    '\\.compatibility-badge--' + state
      + '\\s*\\{[^}]*background:\\s*var\\(--' + tone + '-light\\);'
      + '[^}]*border-color:\\s*var\\(--' + tone + '-color\\)'
  ), state + ' pill uses the exact semantic surface and border tokens');
});
const compatibilityToneSelectorHeaders = Array.from(
  providerCss.matchAll(/([^{}]*\.compatibility-badge--(?:supported|degraded|unsupported)[^{}]*)\{/g),
  (match) => match[1]
);
compatibilityToneSelectorHeaders.forEach((selector) => assert.doesNotMatch(selector,
  /\.provider-row(?=\s*[,.:#\[]|\s*$)|\.provider-radio|\.provider-row__name|\.provider-badge--(?:recommended|status)/,
  'compatibility tones never share a rule with provider selection, name, recommendation, or evidence'));

assert.match(providerCss,
  /\.agent-provider-details__fact #agentCompatibilityStatus\s*\{[^}]*font-size:\s*14px[^}]*overflow-wrap:\s*anywhere/s,
  'selected compatibility status keeps body typography and wraps');
assert.match(providerCss,
  /\.agent-provider-details__fact #agentCompatibilityHelp,[\s\S]*?#agentCompatibilityChecked\s*\{[^}]*font-size:\s*12px[^}]*font-weight:\s*400[^}]*line-height:\s*1\.5/s,
  'selected compatibility metadata follows the approved type scale');

const compatibilityRules = Array.from(
  providerCss.matchAll(/([^{}]*(?:compatibility|Compatibility)[^{}]*)\{([^{}]*)\}/g),
  (match) => match[2]
);
assert.ok(compatibilityRules.length >= 9, 'compatibility CSS is source-pinned across states and layouts');
compatibilityRules.forEach((body) => {
  for (const declaration of body.matchAll(/(?:^|;)\s*((?:row-|column-)?gap|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?)\s*:\s*([^;]+)/g)) {
    const pixelValues = declaration[2].match(/\b\d+px\b/g) || [];
    pixelValues.forEach((value) => assert.ok(
      ['4px', '8px', '16px', '24px', '32px', '48px', '64px'].includes(value),
      'compatibility ' + declaration[1] + ' uses approved spacing, received ' + value
    ));
  }
});

assert.match(providerCss, /var\(--fsb-focus-ring\)/);
const wideCompatibilityLayout = providerCss.match(/@media \(min-width: 900px\)\s*\{([\s\S]*?)\n\}/);
assert.ok(wideCompatibilityLayout, 'wide provider layout has an explicit breakpoint');
assert.match(wideCompatibilityLayout[1], /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(wideCompatibilityLayout[1],
  /\.provider-row__compatibility\s*\{[^}]*border-left:\s*1px solid var\(--border-color\)/s,
  'wide compatibility stays inline behind a tokenized divider');

const mediumCompatibilityLayout = providerCss.match(
  /@media \(min-width: 641px\) and \(max-width: 899px\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(mediumCompatibilityLayout, 'medium provider layout has an explicit closed range');
assert.match(mediumCompatibilityLayout[1], /grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(mediumCompatibilityLayout[1],
  /\.provider-row__compatibility\s*\{[^}]*border-left:\s*1px solid var\(--border-color\)/s,
  'medium compatibility retains inline separation');

const narrowCompatibilityLayout = providerCss.match(/@media \(max-width: 640px\)\s*\{([\s\S]*?)\n\}/);
assert.ok(narrowCompatibilityLayout, 'narrow provider layout has an explicit breakpoint');
assert.match(narrowCompatibilityLayout[1], /\.provider-row\s*\{[^}]*flex-wrap:\s*wrap[^}]*max-width:\s*100%/s);
assert.match(narrowCompatibilityLayout[1],
  /\.provider-row__compatibility\s*\{[^}]*flex:\s*1 1 100%[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*padding-top:\s*8px[^}]*padding-left:\s*0[^}]*border-top:\s*1px solid var\(--border-color\)[^}]*border-left:\s*0[^}]*justify-content:\s*flex-start/s,
  'narrow compatibility becomes a full-width, top-divided, left-aligned group');
assert.match(narrowCompatibilityLayout[1],
  /\.provider-row__content\s*\{[^}]*flex:\s*1 1 100%[^}]*max-width:\s*100%/s,
  'narrow provider names and evidence stack without horizontal overflow');
assert.doesNotMatch(narrowCompatibilityLayout[1], /\border\s*:/,
  'responsive CSS preserves native trailing DOM order instead of visually reordering children');

const forcedColorsCompatibility = providerCss.match(/@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\}/);
assert.ok(forcedColorsCompatibility, 'compatibility defines a forced-colors treatment');
assert.match(forcedColorsCompatibility[1], /\.provider-row__compatibility-icon/);
assert.match(forcedColorsCompatibility[1], /\.compatibility-badge/);
assert.match(forcedColorsCompatibility[1], /color:\s*CanvasText/);
assert.match(forcedColorsCompatibility[1], /background:\s*Canvas/);
assert.match(forcedColorsCompatibility[1], /border-color:\s*currentColor/);
assert.match(forcedColorsCompatibility[1], /border-style:\s*dashed/);
assert.match(forcedColorsCompatibility[1], /border-style:\s*double/);

const reducedMotionCompatibility = providerCss.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
assert.ok(reducedMotionCompatibility, 'provider motion reduction remains explicit');
assert.match(reducedMotionCompatibility[1], /\.provider-row__compatibility/);
assert.match(reducedMotionCompatibility[1], /\.provider-row__compatibility-icon/);
assert.match(reducedMotionCompatibility[1], /\.compatibility-badge/);
assert.match(reducedMotionCompatibility[1], /animation:\s*none !important/);
assert.match(reducedMotionCompatibility[1], /transform:\s*none !important/);
assert.match(reducedMotionCompatibility[1], /transition:\s*none !important/);
assert.match(providerCss, /\[data-theme="dark"\] \.provider-row/);
assert.match(providerCss,
  /\[data-theme="dark"\] \.provider-row__compatibility\s*\{[^}]*border-color:\s*var\(--border-color\)/,
  'dark compatibility separation stays token-only');
assert.match(providerCss, /\.provider-roster__announcement\[role="alert"\]/);
assert.match(providerCss, /\.agent-provider-details__fact \.agent-provider-details__help/);
assert.match(providerCss, /\.mcp-bridge-pairing__row\s*\{[^}]*display:\s*flex[^}]*gap:\s*12px/s);
assert.match(providerCss, /\.mcp-bridge-pairing__input\s*\{[^}]*flex:\s*1 1 280px[^}]*min-width:\s*0/s);
assert.match(providerCss, /\.mcp-bridge-pairing__actions \.form-secondary-btn\s*\{[^}]*min-height:\s*44px/s);
assert.match(providerCss,
  /\.mcp-bridge-pairing__input:focus-visible,[\s\S]*box-shadow:\s*var\(--fsb-focus-ring\)/);
assert.match(providerCss, /\.mcp-bridge-pairing__status\s*\{[^}]*overflow-wrap:\s*anywhere/s);
assert.match(providerCss, /@media \(max-width: 640px\)[\s\S]*\.mcp-bridge-pairing__actions[\s\S]*width:\s*100%/);
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
const pairBridgeSource = extractFunction(JS, 'pairMcpBridge');
const removeBridgeSource = extractFunction(JS, 'removeMcpBridgePairing');
const loadBridgeSource = extractFunction(JS, 'loadMcpBridgePairingStatus');
const reloadBridgeSource = extractFunction(JS, 'requestMcpBridgePairingReload');
assert.match(loadSource, /normalizeSettings\(mergedSettings\)/);
assert.ok(loadSource.indexOf('normalizeSettings(mergedSettings)') < loadSource.indexOf('setProviderSelection('),
  'settings normalize before controls render');
assert.match(loadSource, /setProviderSelection\(settings\.providerKind, activeProviderId, \{ markDirty: false \}\)/);
assert.match(loadSource, /if \(settings\.providerKind === 'api'\)[\s\S]*checkApiConnection\(\)/);
assert.match(loadSource,
  /providerPanelState\.providerKind !== 'api'[\s\S]*elements\.modelProvider\?\.value !== settings\.modelProvider/,
  'delayed API load rechecks current kind and provider before applying saved model state');
assert.match(saveSource, /providerKind:\s*normalizedProviderSettings\.providerKind/);
assert.match(saveSource, /agentProviderId:\s*normalizedProviderSettings\.agentProviderId/);
assert.match(saveSource, /modelProvider:\s*elements\.modelProvider\?\.value \|\| 'xai'/);
assert.match(saveSource, /settings\.providerKind === 'api' && settings\.apiKey/);
assert.match(discardSource, /loadSettings\(\)/);
assert.match(pairBridgeSource,
  /session\.set\(\{[\s\S]*\[MCP_BRIDGE_PAIRING_KEY\]: \{ pairingCode: pairingCode, storedAt: Date\.now\(\) \}/);
assert.match(removeBridgeSource, /session\.remove\(MCP_BRIDGE_PAIRING_KEY\)/);
assert.match(reloadBridgeSource, /sendMessage\(\{ action: 'reloadMcpBridgePairing' \}/);
assert.match(loadBridgeSource, /session\.get\(\[MCP_BRIDGE_STATE_KEY\]\)/);
assert.doesNotMatch(loadBridgeSource, /MCP_BRIDGE_PAIRING_KEY|pairingCode/,
  'status initialization never reads the pairing credential');
assert.doesNotMatch(pairBridgeSource + removeBridgeSource,
  /markUnsavedChanges|providerPanelState|defaultSettings|storage\.local|storage\.sync/,
  'pairing actions remain independent from provider selection and Save state');
assert.doesNotMatch(loadSource + saveSource + discardSource,
  /MCP_BRIDGE_PAIRING_KEY|fsbMcpBridgePairing|pairingCode/,
  'settings load, save, and discard paths never include pairing state');

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
const compatibilityRenderSource = extractFunction(JS, 'renderProviderCompatibility');
const compatibilityModelSource = extractFunction(JS, 'getProviderCompatibilityModel');
const descriptionRenderSource = extractFunction(JS, 'renderProviderAccessibleDescriptions');
const otherClientsRenderSource = extractFunction(JS, 'renderOtherMcpClients');
const agentDetailsRenderSource = extractFunction(JS, 'renderSelectedAgentDetails');
const setupGuideSource = extractFunction(JS, 'openAgentSetupGuide');
const announcementSource = extractFunction(JS, 'setProviderEvidenceAnnouncement');
const refreshFailureMessageSource = extractFunction(JS, 'getCompatibilityRefreshFailureMessage');
const eventSetupSource = extractFunction(JS, 'setupEventListeners');
const providerPresentationSources = [
  recommendationRenderSource,
  evidenceRenderSource,
  compatibilityRenderSource,
  compatibilityModelSource,
  descriptionRenderSource,
  agentDetailsRenderSource,
  announcementSource
].join('\n');
assert.match(requestClientsSource, /\? \{ action: 'refreshMcpCompatibility' \}/,
  'manual evidence refresh uses the explicit live compatibility action');
assert.match(requestClientsSource, /: \{ action: 'getMcpClients' \}/,
  'hydration and inventory use the cache-only Phase 57 runtime action');
assert.match(requestClientsSource, /runtime\.lastError/);
assert.match(requestClientsSource, /getOwnDataValue\(response, 'success'\) !== true/);
assert.match(requestClientsSource, /getOwnDataValue\(response, 'refreshOutcome'\)/,
  'Providers consumes the background-owned closed refresh outcome');
assert.match(requestClientsSource, /\['refreshed', 'stale', 'unavailable'\]\.includes\(refreshOutcome\)/,
  'unknown refresh outcomes fail closed before rendering');
assert.match(JS, /const PROVIDER_EVIDENCE_TIMEOUT_MS\s*=\s*5000/);
assert.match(requestClientsSource, /clearTimeout\(timeoutHandle\)/,
  'runtime request timer is cleared on callback settlement');
assert.match(refreshEvidenceSource, /providerEvidenceRefreshPromise/);
assert.match(refreshEvidenceSource, /hasSuccessfulEvidence/);
assert.match(refreshEvidenceSource, /evidenceStatus = 'stale'/);
assert.match(refreshEvidenceSource, /evidenceStatus = 'unavailable'/);
assert.ok(
  refreshEvidenceSource.indexOf('renderProviderRecommendation()')
    < refreshEvidenceSource.indexOf('requestMcpClients(liveCompatibility === true)'),
  'fallback or last recommendation renders before the runtime request starts'
);
assert.doesNotMatch(recommendationRenderSource,
  /setProviderSelection|\.checked\s*=|modelProvider|chrome\.storage|markUnsavedChanges/,
  'recommendation rendering cannot write selection or settings');
assert.match(descriptionRenderSource, /description\.textContent\s*=/,
  'accessible descriptions are populated through text-only DOM assignment');
assert.doesNotMatch(descriptionRenderSource, /innerHTML|insertAdjacentHTML/,
  'recommendation and evidence descriptions cannot interpret markup');
assert.match(evidenceRenderSource, /status\.checkedAt/);
assert.doesNotMatch(evidenceRenderSource, /lastSeenAt|connectedAt|lastClickedAt/,
  'evidence rendering cannot substitute non-installed timestamps');
assert.match(compatibilityRenderSource, /status\.textContent\s*=\s*model\.label/);
assert.match(compatibilityRenderSource,
  /description\.textContent\s*=\s*`Compatibility: \$\{model\.label\}\. \$\{model\.detail\}`/,
  'compatibility descriptions use the closed model through text-only DOM assignment');
assert.doesNotMatch(compatibilityRenderSource, /innerHTML|insertAdjacentHTML|role|aria-live/,
  'compatibility rendering cannot interpret markup or create per-row live regions');
assert.doesNotMatch(compatibilityRenderSource + compatibilityModelSource,
  /setProviderSelection|markUnsavedChanges|getRecommendation|chrome\.storage|saveSettings|doctor|shell|process|native|wake|semver|version/i,
  'compatibility rendering has no selection, recommendation, persistence, process, or version authority');
assert.doesNotMatch(refreshEvidenceSource,
  /setProviderSelection|markUnsavedChanges|saveSettings|chrome\.storage|doctor|shell|process|native|wake|semver|version/i,
  'refresh never invokes selection, dirty-state, persistence, process, or version APIs');
assert.match(refreshEvidenceSource,
  /Compatibility is now \$\{nextCompatibilityLabel\}\./,
  'manual success appends the exact selected-status transition sentence');
assert.match(refreshFailureMessageSource,
  /Compatibility data could not be refreshed\. Cached support is now Degraded\./);
assert.match(refreshFailureMessageSource,
  /Compatibility data is unavailable\. Showing Unsupported\./);
assert.match(otherClientsRenderSource, /item\.textContent/);
assert.doesNotMatch(otherClientsRenderSource, /innerHTML|insertAdjacentHTML/,
  'raw client names use text-only DOM population');
assert.match(eventSetupSource, /area === 'local' && changes && changes\.fsbAgentProviders/);
assert.match(eventSetupSource, /area === 'session' && changes && changes\.fsbAgentRegistry/);
assert.match(agentDetailsRenderSource, /getAgentAuthDisplay\(providerId, row\)/,
  'the selected account helper receives the current safe provider row');
assert.match(agentDetailsRenderSource, /getBillingLabel\(providerId, row\)/,
  'the selected billing helper receives the same current safe provider row');
assert.doesNotMatch(agentDetailsRenderSource, /['"]codex['"]/,
  'the shared selected-agent renderer has no Codex-specific branch');
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
assert.doesNotMatch(providerPresentationSources, /['"]opencode['"]/,
  'existing provider renderers contain no OpenCode-specific branch');
assert.doesNotMatch(providerPresentationSources,
  /1\.14\.25|semver|tested[_ -]?range\s*[:=]|binary(?:Path)?|server(?:Url|Port)|basicAuth|topology|native(?:Model|Provider)|sessionContinuation/i,
  'provider rendering contains no native version, path, topology, secret, model, or continuation field');

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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createProviderHarness(initialStorage, harnessOptions) {
  const options = harnessOptions || {};
  const registry = Object.create(null);
  const providerRows = [];
  const radios = [];
  const recommendationBadges = [];
  const evidenceBadges = [];
  const providerDescriptions = [];
  const compatibilityGroups = [];
  const compatibilityIcons = [];
  const compatibilityStatuses = [];
  const compatibilityDescriptions = [];
  const providerIds = [
    ...PROVIDERS.AGENT_PROVIDER_IDS.map((id) => ['agent', id]),
    ...PROVIDERS.API_PROVIDER_IDS.map((id) => ['api', id])
  ];
  providerIds.forEach(([kind, id]) => {
    const row = makeElement('row-' + kind + '-' + id, {
      classes: ['provider-row'],
      dataset: { providerKind: kind, providerId: id }
    });
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
    const providerDescription = makeElement('provider-' + kind + '-' + id + '-description', {
      classes: ['visually-hidden'],
      dataset: { providerDescription: id }
    });
    let compatibilityGroup = null;
    let compatibilityIcon = null;
    let compatibilityStatus = null;
    let compatibilityDescription = null;
    if (kind === 'agent') {
      compatibilityGroup = makeElement('', {
        classes: ['provider-row__compatibility'],
        dataset: { providerCompatibilityGroup: id }
      });
      compatibilityIcon = makeElement('', {
        tagName: 'i',
        classes: ['fas', 'fa-circle-xmark', 'provider-row__compatibility-icon'],
        dataset: { providerCompatibilityIcon: id }
      });
      compatibilityStatus = makeElement('', {
        classes: ['compatibility-badge', 'compatibility-badge--unsupported'],
        dataset: { providerCompatibilityStatus: id },
        textContent: 'Unsupported'
      });
      compatibilityDescription = makeElement(
        'provider-agent-' + id + '-compatibility-description',
        {
          classes: ['visually-hidden'],
          dataset: { providerCompatibilityDescription: id },
          textContent: 'Compatibility: Unsupported. FSB cannot verify compatibility for this CLI. Refresh status or review setup before starting a task.'
        }
      );
      compatibilityGroup.appendChild(compatibilityIcon);
      compatibilityGroup.appendChild(compatibilityStatus);
      compatibilityGroups.push(compatibilityGroup);
      compatibilityIcons.push(compatibilityIcon);
      compatibilityStatuses.push(compatibilityStatus);
      compatibilityDescriptions.push(compatibilityDescription);
      radio.setAttribute('aria-describedby',
        providerDescription.id + ' ' + compatibilityDescription.id);
    } else {
      radio.setAttribute('aria-describedby', providerDescription.id);
    }
    radio._providerRow = row;
    row.appendChild(recommendationBadge);
    row.appendChild(evidenceBadge);
    row.appendChild(providerDescription);
    if (compatibilityGroup) row.appendChild(compatibilityGroup);
    if (compatibilityDescription) row.appendChild(compatibilityDescription);
    row.appendChild(radio);
    providerRows.push(row);
    radios.push(radio);
    recommendationBadges.push(recommendationBadge);
    evidenceBadges.push(evidenceBadge);
    providerDescriptions.push(providerDescription);
    registry[radio.id] = radio;
    registry[providerDescription.id] = providerDescription;
    if (compatibilityDescription) registry[compatibilityDescription.id] = compatibilityDescription;
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
  const modelDiscoveryStatus = makeElement('modelDiscoveryStatus', { hidden: true });
  const refreshModelsBtn = makeElement('refreshModelsBtn', { tagName: 'button' });
  const apiDetails = makeElement('apiProviderDetails');
  const agentDetails = makeElement('agentProviderDetails', { hidden: true });
  const agentDetailsHeading = makeElement('agentProviderDetailsHeading');
  const agentNoCredentialCaption = makeElement('agentNoCredentialCaption');
  const agentEmptyState = makeElement('agentEvidenceEmptyState', { hidden: true });
  const agentInstallationStatus = makeElement('agentInstallationStatus');
  const agentConnectionStatus = makeElement('agentConnectionStatus');
  const agentCompatibilityStatus = makeElement('agentCompatibilityStatus', { textContent: 'Unsupported' });
  const agentCompatibilityHelp = makeElement('agentCompatibilityHelp', {
    textContent: 'FSB cannot verify compatibility for this CLI. Refresh status or review setup before starting a task.'
  });
  const agentCompatibilityChecked = makeElement('agentCompatibilityChecked', { hidden: true });
  const agentAccountStatus = makeElement('agentAccountStatus');
  const agentAccountHelp = makeElement('agentAccountHelp');
  const agentSetupStatus = makeElement('agentSetupStatus');
  const openAgentSetupGuideBtn = makeElement('openAgentSetupGuideBtn', { tagName: 'button' });
  const mcpBridgePairingCode = makeElement('mcpBridgePairingCode', { tagName: 'input', type: 'password' });
  const pairMcpBridgeBtn = makeElement('pairMcpBridgeBtn', { tagName: 'button' });
  const removeMcpBridgePairingBtn = makeElement('removeMcpBridgePairingBtn', { tagName: 'button' });
  const mcpBridgePairingStatus = makeElement('mcpBridgePairingStatus', {
    textContent: 'No local bridge pairing is saved for this browser session.'
  });
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
    providerRoster, modelProvider, modelName, modelDiscoveryStatus, refreshModelsBtn,
    apiDetails, agentDetails,
    agentDetailsHeading, agentNoCredentialCaption, agentEmptyState, agentInstallationStatus,
    agentConnectionStatus, agentCompatibilityStatus, agentCompatibilityHelp,
    agentCompatibilityChecked, agentAccountStatus, agentAccountHelp, agentSetupStatus,
    openAgentSetupGuideBtn, mcpBridgePairingCode, pairMcpBridgeBtn,
    removeMcpBridgePairingBtn, mcpBridgePairingStatus,
    agentUsageTokens, agentUsageTurns, agentUsageDuration,
    agentUsageEmptyState, agentBillingStatus, agentBillingCopy, agentBillingLink,
    agentBillingLinkLabel, refreshButton, announcement, otherDisclosure, otherSummary, otherList, apiKey,
    geminiApiKey, openaiApiKey, anthropicApiKey, customApiKey, customEndpoint,
    openrouterApiKey, lmstudioBaseUrl
  ].forEach((element) => { registry[element.id] = element; });

  let storage = { ...(initialStorage || {}) };
  let sessionStorage = { ...(options.initialSession || {}) };
  const writes = [];
  const sessionWrites = [];
  const sessionRemoves = [];
  const sessionReads = [];
  const storageListeners = [];
  const runtimeCalls = [];
  const pendingRuntimeCallbacks = [];
  const scheduledTimeoutDelays = [];
  const heldTimeouts = new Map();
  let nextHeldTimeoutId = -1;
  const openedSetupPages = [];
  let runtimeResponse = Object.prototype.hasOwnProperty.call(options, 'runtimeResponse')
    ? options.runtimeResponse
    : { success: true, clients: {} };
  let runtimeError = null;
  let currentNowMs = Number.isSafeInteger(options.nowMs) ? options.nowMs : Date.now();
  const pairingRuntimeResponse = Object.prototype.hasOwnProperty.call(options, 'pairingRuntimeResponse')
    ? options.pairingRuntimeResponse
    : { success: true, pairingStatus: 'paired' };
  const pairingRuntimeError = options.pairingRuntimeError || null;
  let holdRuntime = options.holdRuntime === true;
  const document = {
    getElementById(id) { return registry[id] || null; },
    querySelectorAll(selector) {
      if (selector === '.nav-item' || selector === '.content-section') return [];
      if (selector === 'input[name="fsbProviderSelection"]') return radios;
      if (selector === '[data-provider-recommendation]') return recommendationBadges;
      if (selector === '[data-provider-evidence]') return evidenceBadges;
      if (selector === '[data-provider-description]') return providerDescriptions;
      if (selector === '[data-provider-compatibility-group]') return compatibilityGroups;
      if (selector === '[data-provider-compatibility-icon]') return compatibilityIcons;
      if (selector === '[data-provider-compatibility-status]') return compatibilityStatuses;
      if (selector === '[data-provider-compatibility-description]') return compatibilityDescriptions;
      if (selector === '.form-select, .chart-select') return [modelProvider];
      return [];
    },
    createElement(tagName) { return makeElement('', { tagName: tagName }); },
    addEventListener() {},
    activeElement: null
  };
  [
    ...providerRows,
    ...radios,
    ...recommendationBadges,
    ...evidenceBadges,
    ...providerDescriptions,
    ...compatibilityGroups,
    ...compatibilityIcons,
    ...compatibilityStatuses,
    ...compatibilityDescriptions,
    refreshButton,
    modelProvider,
    modelName,
    apiKey,
    geminiApiKey,
    openaiApiKey,
    anthropicApiKey,
    customApiKey,
    customEndpoint,
    openrouterApiKey,
    lmstudioBaseUrl
  ].forEach((element) => {
    element.focus = () => { document.activeElement = element; };
  });
  function deliverRuntime(callback, response, error) {
    Promise.resolve().then(() => {
      chrome.runtime.lastError = error ? { message: String(error) } : null;
      let delivered = response;
      if (!error && delivered && delivered.success === true
          && Object.prototype.hasOwnProperty.call(delivered, 'clients')
          && !Object.prototype.hasOwnProperty.call(delivered, 'refreshOutcome')) {
        delivered = { ...delivered, refreshOutcome: 'refreshed' };
      }
      if (!error && delivered && delivered.success === true
          && Object.prototype.hasOwnProperty.call(delivered, 'clients')
          && !Object.prototype.hasOwnProperty.call(delivered, 'compatibilityExpiresAt')) {
        delivered = { ...delivered, compatibilityExpiresAt: null };
      }
      callback(delivered);
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
      session: {
        get(keys) {
          const requested = Array.isArray(keys) ? Array.from(keys, String) : [String(keys)];
          sessionReads.push(requested);
          const result = {};
          requested.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(sessionStorage, key)) {
              result[key] = sessionStorage[key];
            }
          });
          return Promise.resolve(result);
        },
        set(next) {
          sessionWrites.push(JSON.parse(JSON.stringify(next)));
          if (options.sessionSetError) return Promise.reject(new Error(String(options.sessionSetError)));
          sessionStorage = { ...sessionStorage, ...next };
          return Promise.resolve();
        },
        remove(keys) {
          const requested = Array.isArray(keys) ? Array.from(keys, String) : [String(keys)];
          sessionRemoves.push(requested);
          if (options.sessionRemoveError) return Promise.reject(new Error(String(options.sessionRemoveError)));
          requested.forEach((key) => { delete sessionStorage[key]; });
          return Promise.resolve();
        }
      },
      onChanged: { addListener(listener) { storageListeners.push(listener); } }
    },
    runtime: {
      lastError: null,
      getURL(relativePath) { return 'chrome-extension://test/' + relativePath; },
      sendMessage(message, callback) {
        runtimeCalls.push(JSON.parse(JSON.stringify(message)));
        const isPairingReload = message && message.action === 'reloadMcpBridgePairing';
        if (!isPairingReload && typeof options.runtimeDispatch === 'function') {
          Promise.resolve().then(() => options.runtimeDispatch(message, {
            emitStorage(changes, area) {
              storageListeners.slice().forEach((listener) => listener(changes, area));
            }
          })).then(
            (response) => deliverRuntime(callback, response, null),
            (error) => deliverRuntime(callback, undefined, error && error.message ? error.message : error)
          );
          return;
        }
        if (holdRuntime && !isPairingReload) pendingRuntimeCallbacks.push(callback);
        else deliverRuntime(
          callback,
          isPairingReload ? pairingRuntimeResponse : runtimeResponse,
          isPairingReload ? pairingRuntimeError : runtimeError
        );
      },
      onMessage: { addListener() {} }
    },
    tabs: {
      create(properties) { openedSetupPages.push({ ...properties }); }
    }
  };
  function setHarnessTimeout(fn, delay) {
    scheduledTimeoutDelays.push(delay || 0);
    if (Array.isArray(options.heldTimerDelays) && options.heldTimerDelays.includes(delay)) {
      const id = nextHeldTimeoutId;
      nextHeldTimeoutId -= 1;
      heldTimeouts.set(id, { fn, delay });
      return id;
    }
    return setTimeout(fn, delay === 5000 ? 1 : 0);
  }
  function clearHarnessTimeout(handle) {
    if (heldTimeouts.delete(handle)) return;
    clearTimeout(handle);
  }
  const context = {
    console,
    document,
    chrome,
    config: { availableModels: Object.fromEntries(PROVIDERS.API_PROVIDER_IDS.map((id) => [id, []])) },
    FsbDelegationProviders: DELEGATION_PROVIDERS,
    FSBProvidersPanel: PROVIDERS,
    FSBAnalytics: function() {},
    Event: class { constructor(type) { this.type = type; } },
    Date: class extends Date {
      static now() { return currentNowMs; }
    },
    setTimeout: setHarnessTimeout,
    clearTimeout: clearHarnessTimeout,
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

  const realDiscoveryUI = context.FSBDiscoveryUI;
  const calls = { discovery: [], visibility: [], connection: 0, invalidations: 0 };
  if (options.useRealDiscovery) {
    context.FSBDiscoveryUI = realDiscoveryUI;
  } else {
    context.FSBDiscoveryUI = {
      IN_SCOPE_PROVIDERS: { xai: 'apiKey', gemini: 'geminiApiKey', openai: 'openaiApiKey', anthropic: 'anthropicApiKey', openrouter: 'openrouterApiKey' },
      runDiscovery(provider, discoveryOptions) {
        calls.discovery.push({ provider, options: { ...discoveryOptions } });
      },
      invalidateDiscovery() { calls.invalidations += 1; }
    };
  }
  context.FSBModelCombobox = { init() {}, refresh() {} };
  context.updateApiKeyVisibility = (provider) => { calls.visibility.push(provider); };
  context.checkApiConnection = () => { calls.connection += 1; };
  context.addLog = () => {};
  context.showToast = () => {};

  return {
    context,
    calls,
    writes,
    sessionWrites,
    sessionRemoves,
    sessionReads,
    runtimeCalls,
    scheduledTimeoutDelays,
    providerRows,
    radios,
    recommendationBadges,
    evidenceBadges,
    providerDescriptions,
    compatibilityGroups,
    compatibilityIcons,
    compatibilityStatuses,
    compatibilityDescriptions,
    modelProvider,
    modelName,
    modelDiscoveryStatus,
    refreshModelsBtn,
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
    agentCompatibilityStatus,
    agentCompatibilityHelp,
    agentCompatibilityChecked,
    agentAccountStatus,
    agentAccountHelp,
    agentSetupStatus,
    openAgentSetupGuideBtn,
    mcpBridgePairingCode,
    pairMcpBridgeBtn,
    removeMcpBridgePairingBtn,
    mcpBridgePairingStatus,
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
    geminiApiKey,
    openaiApiKey,
    anthropicApiKey,
    customApiKey,
    customEndpoint,
    openrouterApiKey,
    lmstudioBaseUrl,
    get storage() { return storage; },
    get sessionStorage() { return sessionStorage; },
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
    resolveNextRuntime(response, error) {
      const callback = pendingRuntimeCallbacks.shift();
      assert.ok(callback, 'a held runtime callback is available');
      deliverRuntime(callback, response, error);
    },
    emitStorage(changes, area) {
      storageListeners.slice().forEach((listener) => listener(changes, area));
    },
    advanceTimersBy(delay) {
      const ready = Array.from(heldTimeouts.entries())
        .filter(([, timer]) => timer.delay === delay);
      ready.forEach(([id, timer]) => {
        if (!heldTimeouts.delete(id)) return;
        timer.fn();
      });
    },
    get pendingTimeoutDelays() {
      return Array.from(heldTimeouts.values(), (timer) => timer.delay);
    },
    setNow(value) { currentNowMs = value; },
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

  const delayedLoad = createProviderHarness({
    providerKind: 'api',
    modelProvider: 'anthropic',
    modelName: 'saved-api-model'
  }, { heldTimerDelays: [100] });
  delayedLoad.context.loadSettings();
  await Promise.resolve();
  await Promise.resolve();
  delayedLoad.modelName.appendChild(makeOption('agent-kept-model', 'agent-kept-model'));
  delayedLoad.modelName.value = 'agent-kept-model';
  delayedLoad.context.setProviderSelection('agent', 'codex');
  const connectionBeforeDelayedLoad = delayedLoad.calls.connection;
  delayedLoad.advanceTimersBy(100);
  assert.strictEqual(delayedLoad.state().providerKind, 'agent');
  assert.strictEqual(delayedLoad.modelName.value, 'agent-kept-model',
    'cancelled saved-API timer cannot overwrite a model after switching to agent');
  assert.strictEqual(delayedLoad.calls.connection, connectionBeforeDelayedLoad,
    'cancelled saved-API timer cannot run an API connection check in agent mode');

  console.log('Providers panel UI: in-flight API discovery cancellation');
  const heldDiscoveryCases = [
    {
      name: 'success',
      settle(deferred) {
        deferred.resolve({
          ok: true,
          source: 'live',
          models: [{ id: 'late-model', displayName: 'Late model' }]
        });
      }
    },
    {
      name: 'auth failure',
      settle(deferred) {
        deferred.resolve({ ok: false, reason: 'auth-failed', message: 'late auth failure' });
      }
    }
  ];
  for (const heldCase of heldDiscoveryCases) {
    const held = createProviderHarness({}, { useRealDiscovery: true });
    const deferred = createDeferred();
    let discoveryCalls = 0;
    held.apiKey.value = 'held-api-key';
    held.context.discoverModels = () => {
      discoveryCalls += 1;
      return deferred.promise;
    };
    held.modelName.appendChild(makeOption('latent-api-model', 'latent-api-model'));
    held.modelName.value = 'latent-api-model';
    held.modelName.disabled = false;
    held.refreshModelsBtn.disabled = false;
    held.modelDiscoveryStatus.textContent = 'Latent API status';
    held.modelDiscoveryStatus.hidden = false;
    held.modelDiscoveryStatus.classList.add('info');
    const pending = held.context.FSBDiscoveryUI.runDiscovery('xai', {
      previousSelection: 'latent-api-model'
    });
    assert.strictEqual(discoveryCalls, 1, heldCase.name + ' discovery begins once');
    assert.strictEqual(held.modelDiscoveryStatus.textContent, 'Discovering models...',
      heldCase.name + ' enters the normal API loading state before cancellation');
    held.context.setProviderSelection('agent', 'codex');
    assert.strictEqual(held.modelName.value, 'latent-api-model',
      heldCase.name + ' agent selection restores the latent API model');
    assert.strictEqual(held.modelDiscoveryStatus.textContent, 'Latent API status',
      heldCase.name + ' agent selection restores the latent API status');
    assert.strictEqual(held.modelDiscoveryStatus.classList.contains('info'), true,
      heldCase.name + ' agent selection restores the latent API status class');
    assert.strictEqual(held.modelName.disabled, false,
      heldCase.name + ' agent selection restores the model control');
    assert.strictEqual(held.refreshModelsBtn.disabled, false,
      heldCase.name + ' agent selection restores the refresh control');
    const connectionBeforeSettlement = held.calls.connection;
    heldCase.settle(deferred);
    const result = await pending;
    assert.strictEqual(result.reason, 'cancelled',
      heldCase.name + ' result is discarded after selecting an agent');
    assert.strictEqual(held.modelName.value, 'latent-api-model',
      heldCase.name + ' cannot replace or clear the latent API model');
    assert.strictEqual(held.modelName.disabled, false,
      heldCase.name + ' cannot disable latent API model controls');
    assert.strictEqual(held.refreshModelsBtn.disabled, false,
      heldCase.name + ' cannot change the refresh control');
    assert.strictEqual(held.modelDiscoveryStatus.textContent, 'Latent API status',
      heldCase.name + ' cannot replace the latent API status');
    assert.strictEqual(held.modelDiscoveryStatus.classList.contains('info'), true,
      heldCase.name + ' cannot replace the latent API status class');
    assert.strictEqual(held.calls.connection, connectionBeforeSettlement,
      heldCase.name + ' performs no late API connection work');
  }

  const heldHydration = createProviderHarness({}, { useRealDiscovery: true });
  const hydrationDeferred = createDeferred();
  let cacheReads = 0;
  heldHydration.context.hydrateDiscoveryCache = () => hydrationDeferred.promise;
  heldHydration.context.getDiscoveredModelIds = () => {
    cacheReads += 1;
    return ['late-cached-model'];
  };
  heldHydration.modelName.appendChild(makeOption('latent-cache-model', 'latent-cache-model'));
  heldHydration.modelName.value = 'latent-cache-model';
  heldHydration.modelName.disabled = false;
  heldHydration.refreshModelsBtn.disabled = false;
  heldHydration.modelDiscoveryStatus.textContent = 'Latent cache status';
  heldHydration.modelDiscoveryStatus.hidden = false;
  const pendingHydration = heldHydration.context.FSBDiscoveryUI.runDiscovery('xai', {
    previousSelection: 'latent-cache-model'
  });
  heldHydration.context.setProviderSelection('agent', 'codex');
  assert.strictEqual(heldHydration.modelName.value, 'latent-cache-model',
    'agent selection preserves the latent model during cache hydration');
  assert.strictEqual(heldHydration.modelDiscoveryStatus.textContent, 'Latent cache status',
    'agent selection preserves the latent status during cache hydration');
  const connectionBeforeHydration = heldHydration.calls.connection;
  hydrationDeferred.resolve();
  const hydrationResult = await pendingHydration;
  assert.strictEqual(hydrationResult.reason, 'cancelled',
    'cache hydration result is discarded after selecting an agent');
  assert.strictEqual(cacheReads, 0,
    'cancelled cache hydration performs no late cache read or model render');
  assert.strictEqual(heldHydration.modelName.value, 'latent-cache-model');
  assert.strictEqual(heldHydration.modelName.disabled, false);
  assert.strictEqual(heldHydration.refreshModelsBtn.disabled, false);
  assert.strictEqual(heldHydration.modelDiscoveryStatus.textContent, 'Latent cache status');
  assert.strictEqual(heldHydration.calls.connection, connectionBeforeHydration,
    'cancelled cache hydration performs no late API connection work');

  const pendingDebounce = createProviderHarness({}, {
    useRealDiscovery: true,
    heldTimerDelays: [500]
  });
  let debouncedDiscoveryCalls = 0;
  let debouncedCacheClears = 0;
  pendingDebounce.context.discoverModels = () => {
    debouncedDiscoveryCalls += 1;
    return Promise.resolve({ ok: true, source: 'live', models: [] });
  };
  pendingDebounce.context.clearDiscoveryCache = () => {
    debouncedCacheClears += 1;
  };
  pendingDebounce.modelName.appendChild(makeOption('debounce-latent-model', 'debounce-latent-model'));
  pendingDebounce.modelName.value = 'debounce-latent-model';
  pendingDebounce.modelDiscoveryStatus.textContent = 'Debounce latent status';
  pendingDebounce.modelDiscoveryStatus.hidden = false;
  pendingDebounce.context.FSBDiscoveryUI.scheduleDiscoveryFromKeyChange('xai');
  assert.strictEqual(pendingDebounce.scheduledTimeoutDelays.includes(500), true,
    'API-key discovery is pending inside the production debounce window');
  pendingDebounce.context.setProviderSelection('agent', 'codex');
  pendingDebounce.advanceTimersBy(500);
  await Promise.resolve();
  assert.strictEqual(debouncedDiscoveryCalls, 0,
    'agent selection cancels a pending API-key discovery before it starts');
  assert.strictEqual(debouncedCacheClears, 0,
    'cancelled API-key debounce performs no late cache clear');
  assert.strictEqual(pendingDebounce.modelName.value, 'debounce-latent-model',
    'cancelled API-key debounce preserves the latent API model');
  assert.strictEqual(pendingDebounce.modelDiscoveryStatus.textContent, 'Debounce latent status',
    'cancelled API-key debounce preserves the latent API status');
}

function visibleRecommendationIds(harness) {
  return harness.recommendationBadges
    .filter((badge) => !badge.hidden)
    .map((badge) => badge.dataset.providerRecommendation);
}

function evidenceBadge(harness, providerId) {
  return harness.evidenceBadges.find((badge) => badge.dataset.providerEvidence === providerId);
}

function compatibilityStatus(harness, providerId) {
  return harness.compatibilityStatuses.find(
    (status) => status.dataset.providerCompatibilityStatus === providerId
  );
}

function compatibilityIcon(harness, providerId) {
  return harness.compatibilityIcons.find(
    (icon) => icon.dataset.providerCompatibilityIcon === providerId
  );
}

function compatibilityDescription(harness, providerId) {
  return harness.compatibilityDescriptions.find(
    (description) => description.dataset.providerCompatibilityDescription === providerId
  );
}

function compatibilityIdentitySnapshot(harness) {
  return {
    selected: selectedRadio(harness)?.dataset.providerId || null,
    focused: harness.context.document.activeElement?.id || null,
    rowOrder: harness.providerRows.map((row) => [
      row.dataset.providerKind,
      row.dataset.providerId
    ]),
    recommendation: JSON.stringify(harness.state().recommendation),
    providerKind: harness.state().providerKind,
    agentProviderId: harness.state().agentProviderId,
    modelProvider: harness.modelProvider.value,
    modelName: harness.modelName.value,
    apiKey: harness.apiKey.value,
    geminiApiKey: harness.geminiApiKey.value,
    openaiApiKey: harness.openaiApiKey.value,
    anthropicApiKey: harness.anthropicApiKey.value,
    customApiKey: harness.customApiKey.value,
    customEndpoint: harness.customEndpoint.value,
    openrouterApiKey: harness.openrouterApiKey.value,
    lmstudioBaseUrl: harness.lmstudioBaseUrl.value,
    dirty: harness.dashboardState().hasUnsavedChanges,
    account: harness.agentAccountStatus.textContent,
    accountHelp: harness.agentAccountHelp.textContent,
    billing: harness.agentBillingStatus.textContent,
    billingCopy: harness.agentBillingCopy.textContent,
    writes: harness.writes.length
  };
}

function nonCompatibilityClientSnapshot(harness) {
  return Object.fromEntries(Object.entries(harness.state().clients).map(([providerId, row]) => [
    providerId,
    Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'compatibility'))
  ]));
}

function providerEvidenceStateSnapshot(harness) {
  return {
    evidenceStatus: harness.state().evidenceStatus,
    hasSuccessfulEvidence: harness.state().hasSuccessfulEvidence,
    badges: harness.evidenceBadges.map((badge) => ({
      providerId: badge.dataset.providerEvidence,
      text: badge.textContent,
      title: badge.getAttribute('title'),
      stale: badge.getAttribute('data-stale')
    })),
    installation: harness.agentInstallationStatus.textContent,
    connection: harness.agentConnectionStatus.textContent,
    setup: harness.agentSetupStatus.textContent
  };
}

function providerDescription(harness, providerId) {
  return harness.providerDescriptions.find(
    (description) => description.dataset.providerDescription === providerId
  );
}

async function runAgentDetailsTests() {
  console.log('Providers panel UI: honest agent account, setup, usage, and billing details');
  const harness = createProviderHarness();
  harness.context.setupEventListeners();
  harness.state().hasSuccessfulEvidence = true;
  harness.state().evidenceStatus = 'ready';
  harness.state().clients = {
    'claude-code': {
      live: { agentId: 'claude-live' },
      compatibility: {
        status: 'supported', reason: 'within_tested_range', checkedAt: 1_000
      }
    },
    opencode: {
      connected: { lastSeenAt: 20 },
      compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 1_000 }
    },
    codex: {
      installed: { detected: true, checkedAt: 30 },
      authState: 'chatgpt',
      compatibility: {
        status: 'supported', reason: 'within_tested_range', checkedAt: 1_000
      }
    }
  };

  const expected = {
    'claude-code': {
      heading: 'Claude Code details',
      installation: 'Not installed',
      connection: 'Connected now',
      compatibility: 'Supported',
      compatibilityHelp: "This CLI is within FSB's fixture-tested compatibility range.",
      account: 'Not reported',
      authHelp: 'Claude Code does not report an auth state that FSB can safely read.',
      billing: 'Billing not reported',
      copy: "Uses the account signed into Claude Code. FSB does not need your Anthropic credential. Usage and charges follow that account's Claude plan or API configuration.",
      label: 'Review Claude plans and billing',
      url: 'https://claude.com/pricing'
    },
    opencode: {
      heading: 'OpenCode details',
      installation: 'Not installed',
      connection: 'Seen before',
      compatibility: 'Supported',
      compatibilityHelp: "This CLI is within FSB's fixture-tested compatibility range.",
      account: 'Not reported',
      authHelp: 'The CLI has not reported its account type.',
      billing: 'Billing not reported',
      copy: 'Uses the provider configured in OpenCode. FSB does not need that provider credential. Charges may come from OpenCode Zen or the configured provider.',
      label: 'Review OpenCode providers and billing',
      url: 'https://opencode.ai/docs/providers/'
    },
    codex: {
      heading: 'Codex details',
      installation: 'Installed',
      connection: 'Not connected',
      compatibility: 'Supported',
      compatibilityHelp: "This CLI is within FSB's fixture-tested compatibility range.",
      account: 'ChatGPT',
      authHelp: 'Codex is signed in with ChatGPT.',
      billing: 'Included with your ChatGPT plan',
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
    assert.strictEqual(harness.agentCompatibilityStatus.textContent, contract.compatibility);
    assert.strictEqual(harness.agentCompatibilityHelp.textContent, contract.compatibilityHelp);
    assert.match(harness.agentCompatibilityChecked.textContent, /^Checked /,
      'validated compatibility timestamps render as localized absolute checked text');
    assert.strictEqual(harness.agentCompatibilityChecked.hidden, false);
    assert.strictEqual(harness.agentAccountStatus.textContent, contract.account);
    assert.strictEqual(harness.agentAccountHelp.textContent, contract.authHelp);
    assert.strictEqual(harness.agentNoCredentialCaption.textContent,
      "FSB uses this CLI's existing sign-in and does not need its credential. Billing and limits follow the account or provider configured in the CLI.");
    assert.strictEqual(harness.agentUsageTokens.textContent, '—');
    assert.strictEqual(harness.agentUsageTurns.textContent, '—');
    assert.strictEqual(harness.agentUsageDuration.textContent, '—');
    assert.strictEqual(harness.agentUsageEmptyState.textContent, 'No delegated runs yet');
    assert.strictEqual(harness.agentBillingStatus.textContent, contract.billing);
    assert.strictEqual(harness.agentBillingCopy.textContent, contract.copy);
    assert.strictEqual(harness.agentBillingLinkLabel.textContent, contract.label);
    assert.strictEqual(harness.agentBillingLink.getAttribute('href'), contract.url);
    assert.strictEqual(harness.agentBillingLink.getAttribute('target'), '_blank');
    assert.strictEqual(harness.agentBillingLink.getAttribute('rel'), 'noopener noreferrer');
    assert.strictEqual(harness.agentBillingLink.hidden, false);
  }

  const codexPresentationStates = {
    chatgpt: {
      account: 'ChatGPT',
      help: 'Codex is signed in with ChatGPT.',
      billing: 'Included with your ChatGPT plan'
    },
    api_key: {
      account: 'API key',
      help: 'Codex is signed in with an API key stored by Codex.',
      billing: 'Billed to the API key stored by Codex; dollar amount not reported.'
    },
    unauthenticated: {
      account: 'Not signed in',
      help: 'Sign in to Codex first.',
      billing: 'Sign in to Codex first.'
    },
    unknown: {
      account: 'Status unavailable',
      help: 'Codex sign-in status is unavailable. Refresh status before starting a task.',
      billing: 'Billing not reported'
    }
  };
  const beforeCodexStates = compatibilityIdentitySnapshot(harness);
  for (const [authState, presentation] of Object.entries(codexPresentationStates)) {
    harness.state().clients.codex.authState = authState;
    harness.context.setProviderSelection('agent', 'codex', { markDirty: false });
    assert.strictEqual(harness.agentAccountStatus.textContent, presentation.account);
    assert.strictEqual(harness.agentAccountHelp.textContent, presentation.help);
    assert.strictEqual(harness.agentBillingStatus.textContent, presentation.billing);
  }
  const afterCodexStates = compatibilityIdentitySnapshot(harness);
  for (const field of [
    'selected', 'focused', 'rowOrder', 'recommendation', 'providerKind', 'agentProviderId',
    'modelProvider', 'modelName', 'apiKey', 'geminiApiKey', 'openaiApiKey',
    'anthropicApiKey', 'customApiKey', 'customEndpoint', 'openrouterApiKey',
    'lmstudioBaseUrl', 'dirty', 'billingCopy', 'writes'
  ]) {
    assert.deepStrictEqual(afterCodexStates[field], beforeCodexStates[field],
      `Codex auth presentation preserves ${field}`);
  }

  const openCodeDefinition = PROVIDERS.getProviderDefinition('agent', 'opencode');
  assert.strictEqual(openCodeDefinition.secondaryBillingLinkLabel, 'Review OpenCode Zen');
  assert.strictEqual(openCodeDefinition.secondaryBillingUrl, 'https://opencode.ai/docs/zen/');
  assert.doesNotMatch([
    openCodeDefinition.billingCopy,
    openCodeDefinition.billingLinkLabel,
    openCodeDefinition.secondaryBillingLinkLabel
  ].join(' '), /included in|subscription|\$\s*\d|\bfree\b|\bunlimited\b/i,
  'approved OpenCode billing metadata makes no inferred plan or price claim');

  harness.openAgentSetupGuideBtn.dispatchEvent({ type: 'click' });
  assert.deepStrictEqual(harness.openedSetupPages, [
    { url: 'chrome-extension://test/ui/onboarding.html' }
  ], 'setup action opens the existing extension onboarding surface once');
}

async function runMcpBridgePairingTests() {
  console.log('Providers panel UI: session-only local bridge pairing');
  const pairingCode = 'fsb-auth.' + 'A'.repeat(43);

  const invalid = createProviderHarness();
  invalid.mcpBridgePairingCode.value = 'fsb-auth.too-short';
  const invalidResult = await invalid.context.pairMcpBridge();
  assert.strictEqual(invalidResult.errorCode, 'invalid_pairing_code');
  assert.deepStrictEqual(invalid.sessionWrites, []);
  assert.deepStrictEqual(invalid.runtimeCalls, []);
  assert.strictEqual(invalid.mcpBridgePairingStatus.getAttribute('role'), 'alert');
  assert.strictEqual(invalid.mcpBridgePairingStatus.getAttribute('aria-live'), 'assertive');
  assert.doesNotMatch(invalid.mcpBridgePairingStatus.textContent, /too-short/,
    'validation feedback never echoes the rejected credential');

  const paired = createProviderHarness({}, {
    pairingRuntimeResponse: { success: true, pairingStatus: 'paired' }
  });
  paired.mcpBridgePairingCode.value = '  ' + pairingCode + '  ';
  const pairPromise = paired.context.pairMcpBridge();
  assert.strictEqual(paired.mcpBridgePairingCode.value, '',
    'pairing input clears synchronously after the session write begins');
  await pairPromise;
  assert.strictEqual(paired.sessionWrites.length, 1);
  assert.strictEqual(
    paired.sessionWrites[0].fsbMcpBridgePairing.pairingCode,
    pairingCode
  );
  assert.ok(Number.isFinite(paired.sessionWrites[0].fsbMcpBridgePairing.storedAt));
  assert.deepStrictEqual(paired.runtimeCalls, [{ action: 'reloadMcpBridgePairing' }]);
  assert.strictEqual(paired.mcpBridgePairingStatus.textContent,
    'Local bridge paired for this browser session.');
  assert.strictEqual(paired.mcpBridgePairingStatus.getAttribute('role'), 'status');
  assert.deepStrictEqual(paired.writes, [], 'pairing writes nothing to local settings storage');
  assert.strictEqual(paired.dashboardState().hasUnsavedChanges, false,
    'pairing does not enter the provider Save/discard workflow');

  const configured = createProviderHarness({}, {
    pairingRuntimeResponse: { success: true, pairingStatus: 'configured' }
  });
  configured.mcpBridgePairingCode.value = pairingCode;
  await configured.context.pairMcpBridge();
  assert.strictEqual(configured.mcpBridgePairingStatus.textContent,
    'Pairing saved. Start or restart fsb-mcp-server serve, then retry.');
  assert.doesNotMatch(configured.mcpBridgePairingStatus.textContent, /paired/i,
    'configured state does not claim an authenticated bridge');

  const expired = createProviderHarness({}, {
    pairingRuntimeResponse: { success: true, pairingStatus: 'expired' }
  });
  expired.mcpBridgePairingCode.value = pairingCode;
  await expired.context.pairMcpBridge();
  assert.strictEqual(expired.mcpBridgePairingStatus.textContent,
    'Pairing code was rejected or expired. Run fsb-mcp-server pair again.');
  assert.strictEqual(expired.mcpBridgePairingStatus.getAttribute('role'), 'alert');
  assert.strictEqual(expired.mcpBridgePairingStatus.getAttribute('aria-live'), 'assertive');

  const removed = createProviderHarness({}, {
    initialSession: {
      fsbMcpBridgePairing: { pairingCode, storedAt: 123 },
      mcpBridgeState: { pairingStatus: 'paired' }
    },
    pairingRuntimeResponse: { success: true, pairingStatus: 'unpaired' }
  });
  removed.mcpBridgePairingCode.value = pairingCode;
  const removeResult = await removed.context.removeMcpBridgePairing();
  assert.strictEqual(removeResult.success, true);
  assert.deepStrictEqual(removed.sessionRemoves, [['fsbMcpBridgePairing']]);
  assert.strictEqual(removed.mcpBridgePairingCode.value, '');
  assert.deepStrictEqual(removed.runtimeCalls, [{ action: 'reloadMcpBridgePairing' }]);
  assert.strictEqual(removed.mcpBridgePairingStatus.textContent, 'Pairing removed.');

  const loaded = createProviderHarness({}, {
    initialSession: {
      fsbMcpBridgePairing: { pairingCode, storedAt: 123 },
      mcpBridgeState: { pairingStatus: 'paired' }
    }
  });
  loaded.mcpBridgePairingCode.value = 'must-disappear';
  await loaded.context.loadMcpBridgePairingStatus();
  assert.strictEqual(loaded.mcpBridgePairingCode.value, '');
  assert.strictEqual(loaded.mcpBridgePairingStatus.textContent,
    'Local bridge paired for this browser session.');
  assert.deepStrictEqual(loaded.sessionReads, [['mcpBridgeState']],
    'initial status reads only the public bridge state record');

  const failed = createProviderHarness({}, {
    sessionSetError: 'sensitive write failure ' + pairingCode
  });
  failed.mcpBridgePairingCode.value = pairingCode;
  await failed.context.pairMcpBridge();
  assert.strictEqual(failed.mcpBridgePairingCode.value, '');
  assert.strictEqual(failed.mcpBridgePairingStatus.textContent,
    'Pairing could not be saved. Try again.');
  assert.doesNotMatch(failed.mcpBridgePairingStatus.textContent, /fsb-auth/,
    'storage errors cannot surface credential-bearing details');
  assert.deepStrictEqual(failed.runtimeCalls, []);
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
          connected: null, live: null,
          compatibility: { status: 'unsupported', reason: 'adapter_unshipped', checkedAt: 700 }
        },
        opencode: {
          id: 'opencode', raw: false, displayName: 'OpenCode', clicked: { lastClickedAt: 900 },
          installed: null, connected: null, live: { agentId: 'agent_open' },
          compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 700 }
        },
        'claude-code': {
          id: 'claude-code', raw: false, displayName: 'Claude Code', clicked: null,
          installed: null, connected: { lastSeenAt: 800 }, live: { agentId: 'agent_claude' },
          compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 700 }
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
  assert.strictEqual(compatibilityStatus(harness, 'claude-code').textContent, 'Supported');
  assert.strictEqual(compatibilityIcon(harness, 'claude-code').classList.contains('fa-circle-check'), true);
  assert.strictEqual(compatibilityDescription(harness, 'claude-code').textContent,
    "Compatibility: Supported. This CLI is within FSB's fixture-tested compatibility range.");
  assert.strictEqual(compatibilityStatus(harness, 'opencode').textContent, 'Supported');
  assert.strictEqual(compatibilityIcon(harness, 'opencode').classList.contains('fa-circle-check'), true);
  assert.strictEqual(compatibilityDescription(harness, 'opencode').textContent,
    "Compatibility: Supported. This CLI is within FSB's fixture-tested compatibility range.");
  assert.strictEqual(compatibilityStatus(harness, 'codex').textContent, 'Unsupported');
  assert.strictEqual(compatibilityIcon(harness, 'codex').classList.contains('fa-circle-xmark'), true);
  assert.strictEqual(providerDescription(harness, 'claude-code').textContent,
    'Recommended. Connected now.');
  assert.strictEqual(providerDescription(harness, 'opencode').textContent, 'Connected now.');
  assert.strictEqual(providerDescription(harness, 'codex').textContent, 'Installed.');
  assert.deepStrictEqual({
    selected: selectedRadio(harness).dataset.providerId,
    modelProvider: harness.modelProvider.value,
    modelName: harness.modelName.value,
    key: harness.anthropicApiKey.value,
    dirty: harness.dashboardState().hasUnsavedChanges,
    writes: harness.writes.length
  }, beforeRefresh, 'evidence refresh preserves selection, API values, Save state, and storage');

  const openCodeClients = (compatibility) => ({
    'claude-code': {
      id: 'claude-code', raw: false, displayName: 'Claude Code',
      clicked: null, installed: null, connected: null, live: null,
      compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 700 }
    },
    opencode: {
      id: 'opencode', raw: false, displayName: 'OpenCode',
      clicked: null, installed: null, connected: null, live: null,
      compatibility
    },
    codex: {
      id: 'codex', raw: false, displayName: 'Codex',
      clicked: null, installed: null, connected: null, live: null,
      compatibility: { status: 'unsupported', reason: 'adapter_unshipped', checkedAt: 700 }
    }
  });
  const openCodeStates = [
    {
      compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 700 },
      label: 'Supported',
      icon: 'fa-circle-check',
      className: 'compatibility-badge--supported',
      detail: "This CLI is within FSB's fixture-tested compatibility range.",
      announcement: 'Provider status refreshed.'
    },
    {
      compatibility: { status: 'degraded', reason: 'newer_than_tested_range', checkedAt: 700 },
      label: 'Degraded',
      icon: 'fa-triangle-exclamation',
      className: 'compatibility-badge--degraded',
      detail: "This CLI is newer than FSB's fixture-tested range. You can keep it selected; existing start checks still apply.",
      announcement: 'Provider status refreshed. Compatibility is now Degraded.'
    },
    {
      compatibility: { status: 'degraded', reason: 'evidence_stale', checkedAt: 700 },
      label: 'Degraded',
      icon: 'fa-triangle-exclamation',
      className: 'compatibility-badge--degraded',
      detail: 'Compatibility evidence is stale. Refresh status to check again.',
      announcement: 'Provider status refreshed.'
    },
    {
      compatibility: { status: 'unsupported', reason: 'matrix_invalid', checkedAt: 700 },
      label: 'Unsupported',
      icon: 'fa-circle-xmark',
      className: 'compatibility-badge--unsupported',
      detail: 'FSB cannot verify compatibility for this CLI. Refresh status or review setup before starting a task.',
      announcement: 'Provider status refreshed. Compatibility is now Unsupported.'
    }
  ];
  const openCodeStateHarness = createProviderHarness({}, {
    runtimeResponse: {
      success: true,
      refreshOutcome: 'refreshed',
      clients: openCodeClients(openCodeStates[0].compatibility)
    }
  });
  openCodeStateHarness.context.setupEventListeners();
  openCodeStateHarness.state().clients = openCodeClients(openCodeStates[0].compatibility);
  openCodeStateHarness.state().evidenceStatus = 'ready';
  openCodeStateHarness.state().hasSuccessfulEvidence = true;
  openCodeStateHarness.state().recommendation = PROVIDERS.getRecommendation(
    openCodeStateHarness.state().clients
  );
  openCodeStateHarness.context.setProviderSelection('agent', 'opencode', { markDirty: false });
  openCodeStateHarness.modelName.appendChild(makeOption('preserved-open-model', 'preserved-open-model'));
  openCodeStateHarness.modelName.value = 'preserved-open-model';
  openCodeStateHarness.apiKey.value = 'preserved-xai-key';
  openCodeStateHarness.geminiApiKey.value = 'preserved-gemini-key';
  openCodeStateHarness.openaiApiKey.value = 'preserved-openai-key';
  openCodeStateHarness.anthropicApiKey.value = 'preserved-anthropic-key';
  openCodeStateHarness.customApiKey.value = 'preserved-custom-key';
  openCodeStateHarness.customEndpoint.value = 'https://example.invalid/open-code';
  openCodeStateHarness.openrouterApiKey.value = 'preserved-openrouter-key';
  openCodeStateHarness.lmstudioBaseUrl.value = 'http://localhost:5678';
  openCodeStateHarness.dashboardState().hasUnsavedChanges = true;
  openCodeStateHarness.refreshButton.focus();

  for (const state of openCodeStates) {
    openCodeStateHarness.setRuntimeResponse({
      success: true,
      refreshOutcome: 'refreshed',
      clients: openCodeClients(state.compatibility)
    });
    const beforeOpenCodeTransition = compatibilityIdentitySnapshot(openCodeStateHarness);
    await openCodeStateHarness.context.refreshProviderEvidence({ announce: true });
    assert.deepStrictEqual(
      compatibilityIdentitySnapshot(openCodeStateHarness),
      beforeOpenCodeTransition,
      state.label + ' OpenCode rendering preserves focus, row order, selection, recommendation, API values, dirty state, auth, billing, and storage'
    );
    assert.strictEqual(compatibilityStatus(openCodeStateHarness, 'opencode').textContent, state.label);
    assert.strictEqual(compatibilityStatus(openCodeStateHarness, 'opencode').classList.contains(
      state.className
    ), true);
    assert.strictEqual(compatibilityIcon(openCodeStateHarness, 'opencode').classList.contains(
      state.icon
    ), true);
    assert.strictEqual(compatibilityDescription(openCodeStateHarness, 'opencode').textContent,
      `Compatibility: ${state.label}. ${state.detail}`);
    assert.strictEqual(openCodeStateHarness.agentCompatibilityStatus.textContent, state.label);
    assert.strictEqual(openCodeStateHarness.agentCompatibilityHelp.textContent, state.detail);
    assert.strictEqual(openCodeStateHarness.agentAccountStatus.textContent, 'Not reported');
    assert.strictEqual(openCodeStateHarness.agentAccountHelp.textContent,
      'The CLI has not reported its account type.');
    assert.strictEqual(openCodeStateHarness.agentBillingStatus.textContent, 'Billing not reported');
    assert.strictEqual(openCodeStateHarness.announcement.textContent, state.announcement);
    assert.strictEqual(compatibilityStatus(openCodeStateHarness, 'codex').textContent, 'Unsupported',
      'Codex stays fail-closed while OpenCode compatibility changes');
  }

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
  assert.strictEqual(providerDescription(harness, 'claude-code').textContent, 'Seen before.');
  assert.strictEqual(providerDescription(harness, 'xai').textContent, 'Recommended.',
    'API fallback exposes recommendation as description without agent evidence text');
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

  for (const providerId of PROVIDERS.AGENT_PROVIDER_IDS) {
    harness.setRuntimeResponse({
      success: true,
      clients: {
        [providerId]: {
          id: providerId,
          raw: true,
          displayName: 'Raw ' + providerId,
          clicked: {},
          installed: { detected: true, checkedAt: 123 },
          connected: {},
          live: {}
        }
      }
    });
    await harness.context.refreshProviderEvidence();
    assert.deepStrictEqual(visibleRecommendationIds(harness), ['xai'],
      'raw collision under ' + providerId + ' cannot become the canonical recommendation');
    assert.strictEqual(evidenceBadge(harness, providerId).textContent, 'Not installed',
      'raw collision under ' + providerId + ' cannot show canonical evidence');
    assert.strictEqual(harness.agentEmptyState.hidden, false,
      'raw collision under ' + providerId + ' cannot suppress the supported-agent empty state');
    assert.strictEqual(harness.otherSummary.textContent, 'Other MCP clients (1)');
    assert.deepStrictEqual(harness.otherList.children.map((item) => item.textContent), [
      'Raw ' + providerId + ' — Observed MCP client'
    ], 'raw collision under ' + providerId + ' remains safely informational');
  }

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

  const emptyState = createProviderHarness();
  emptyState.state().hasSuccessfulEvidence = true;
  emptyState.state().clients = Object.fromEntries(PROVIDERS.AGENT_PROVIDER_IDS.map((providerId) => [
    providerId,
    { installed: { detected: false, checkedAt: 123 } }
  ]));
  emptyState.state().evidenceStatus = 'ready';
  emptyState.context.renderProviderEvidence();
  assert.strictEqual(emptyState.agentEmptyState.hidden, false,
    'a ready sweep with three detected-false rows confirms no supported CLI');
  for (const evidenceStatus of ['loading', 'unavailable', 'stale']) {
    emptyState.state().evidenceStatus = evidenceStatus;
    emptyState.context.renderProviderEvidence();
    assert.strictEqual(emptyState.agentEmptyState.hidden, true,
      evidenceStatus + ' evidence cannot claim that no agent CLI is detected');
  }
  const evidenceShapes = [
    { clicked: {} },
    { installed: { detected: true, checkedAt: 123 } },
    { connected: { lastSeenAt: 123 } },
    { live: { agentId: 'live-agent' } }
  ];
  for (const row of evidenceShapes) {
    emptyState.state().clients = { codex: row };
    emptyState.state().evidenceStatus = 'ready';
    emptyState.context.renderProviderEvidence();
    assert.strictEqual(emptyState.agentEmptyState.hidden, true,
      'real supported clicked, installed, connected, or live evidence suppresses the empty state');
  }

  const priorClients = JSON.stringify(harness.state().clients);
  const priorRecommendation = JSON.stringify(harness.state().recommendation);
  harness.setRuntimeError('private transport detail must not surface');
  await harness.context.refreshProviderEvidence({ announce: true });
  assert.strictEqual(harness.state().evidenceStatus, 'stale');
  const expectedStaleClients = JSON.parse(priorClients);
  expectedStaleClients.codex.authState = 'unknown';
  delete expectedStaleClients.codex.acceptedIdentity;
  assert.strictEqual(JSON.stringify(harness.state().clients), JSON.stringify(expectedStaleClients),
    'runtime failure retains prior evidence while invalidating stale Codex auth');
  assert.strictEqual(JSON.stringify(harness.state().recommendation), priorRecommendation,
    'runtime failure retains the previous recommendation');
  assert.strictEqual(harness.agentDetails.getAttribute('role'), null,
    'the full details region never becomes an assertive alert');
  assert.strictEqual(harness.announcement.getAttribute('role'), 'alert');
  assert.strictEqual(harness.announcement.getAttribute('aria-live'), 'assertive');
  assert.strictEqual(harness.announcement.textContent,
    'Compatibility data is unavailable. Showing Unsupported.',
    'runtime failure without valid compatibility evidence does not claim Degraded support');
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
  assert.strictEqual(providerDescription(malformed, 'codex').textContent, 'Status unavailable.',
    'unavailable agent evidence remains discoverable through the stable description');
  assert.strictEqual(providerDescription(malformed, 'xai').textContent, 'Recommended.');
  assert.strictEqual(malformed.announcement.getAttribute('role'), 'status',
    'silent hydration retains non-alert semantics');
  assert.strictEqual(malformed.announcement.getAttribute('aria-live'), 'polite');
  assert.strictEqual(malformed.announcement.textContent, '');
  assert.strictEqual(malformed.announcement.hidden, true,
    'cold hydration failure is silent in the shared live region');

  const missingRuntime = createProviderHarness();
  missingRuntime.context.setProviderSelection('api', 'openai', { markDirty: false });
  delete missingRuntime.context.chrome.runtime.sendMessage;
  await missingRuntime.context.refreshProviderEvidence();
  assert.strictEqual(missingRuntime.state().evidenceStatus, 'unavailable');
  assert.deepStrictEqual(visibleRecommendationIds(missingRuntime), ['xai']);
  assert.strictEqual(selectedRadio(missingRuntime).dataset.providerId, 'openai');

  console.log('Providers panel UI: observational compatibility transitions');
  const compatibilityClients = (compatibility) => ({
    'claude-code': {
      id: 'claude-code',
      raw: false,
      displayName: 'Claude Code',
      clicked: null,
      installed: { detected: true, configPath: null, checkedAt: 600 },
      connected: null,
      live: null,
      authState: 'unknown',
      compatibility
    },
    opencode: {
      id: 'opencode', raw: false, displayName: 'OpenCode', clicked: null,
      installed: null, connected: null, live: null,
      authState: 'unknown',
      compatibility: { status: 'unsupported', reason: 'adapter_unshipped', checkedAt: 700 }
    },
    codex: {
      id: 'codex', raw: false, displayName: 'Codex', clicked: null,
      installed: null, connected: null, live: null,
      authState: 'unknown',
      compatibility: { status: 'unsupported', reason: 'binary_not_found', checkedAt: 700 }
    }
  });
  const supportedClients = compatibilityClients({
    status: 'supported', reason: 'within_tested_range', checkedAt: 700
  });
  const observational = createProviderHarness({}, {
    runtimeResponse: {
      success: true,
      refreshOutcome: 'refreshed',
      clients: supportedClients
    }
  });
  observational.context.setupEventListeners();
  observational.context.setProviderSelection('agent', 'claude-code', { markDirty: false });
  observational.state().clients = compatibilityClients({
    status: 'unsupported', reason: 'matrix_invalid', checkedAt: 650
  });
  observational.state().recommendation = PROVIDERS.getRecommendation(observational.state().clients);
  observational.state().evidenceStatus = 'ready';
  observational.state().hasSuccessfulEvidence = true;
  observational.modelName.appendChild(makeOption('preserved-model', 'preserved-model'));
  observational.modelName.value = 'preserved-model';
  observational.apiKey.value = 'xai-secret';
  observational.geminiApiKey.value = 'gemini-secret';
  observational.openaiApiKey.value = 'openai-secret';
  observational.anthropicApiKey.value = 'anthropic-secret';
  observational.customApiKey.value = 'custom-secret';
  observational.customEndpoint.value = 'https://example.invalid/v1';
  observational.openrouterApiKey.value = 'openrouter-secret';
  observational.lmstudioBaseUrl.value = 'http://localhost:4444';
  observational.dashboardState().hasUnsavedChanges = true;
  observational.context.renderProviderRecommendation();
  observational.context.renderProviderEvidence();
  observational.context.renderSelectedAgentDetails();
  observational.refreshButton.focus();
  const beforeSupportedTransition = compatibilityIdentitySnapshot(observational);
  await observational.context.refreshProviderEvidence({ announce: true });
  assert.deepStrictEqual(compatibilityIdentitySnapshot(observational), beforeSupportedTransition,
    'Unsupported to Supported refresh preserves focus, order, selection, recommendation, form, auth, billing, dirty state, and storage writes');
  assert.strictEqual(compatibilityStatus(observational, 'claude-code').textContent, 'Supported');
  assert.strictEqual(compatibilityStatus(observational, 'claude-code').classList.contains(
    'compatibility-badge--supported'
  ), true);
  assert.strictEqual(compatibilityIcon(observational, 'claude-code').classList.contains(
    'fa-circle-check'
  ), true);
  assert.strictEqual(observational.announcement.textContent,
    'Provider status refreshed. Compatibility is now Supported.');
  assert.strictEqual(observational.announcement.getAttribute('role'), 'status');
  assert.strictEqual(observational.announcement.getAttribute('aria-live'), 'polite');
  assert.strictEqual(observational.compatibilityGroups.length, 3);
  assert.strictEqual(observational.compatibilityDescriptions.length, 3,
    're-rendering reuses the three stable descriptions without duplication');

  observational.setRuntimeResponse({
    success: true,
    refreshOutcome: 'stale',
    clients: compatibilityClients({
      status: 'degraded', reason: 'evidence_stale', checkedAt: 700
    })
  });
  const beforeStaleTransition = compatibilityIdentitySnapshot(observational);
  await observational.context.refreshProviderEvidence({ announce: true });
  assert.deepStrictEqual(compatibilityIdentitySnapshot(observational), beforeStaleTransition,
    'Supported to stale Degraded transition remains observational');
  assert.strictEqual(compatibilityStatus(observational, 'claude-code').textContent, 'Degraded');
  assert.strictEqual(compatibilityIcon(observational, 'claude-code').classList.contains(
    'fa-triangle-exclamation'
  ), true);
  assert.strictEqual(observational.announcement.textContent,
    'Compatibility data could not be refreshed. Cached support is now Degraded.');
  assert.strictEqual(observational.announcement.getAttribute('role'), 'alert');
  assert.strictEqual(observational.announcement.getAttribute('aria-live'), 'assertive');

  observational.setRuntimeResponse({
    success: true,
    refreshOutcome: 'unavailable',
    clients: compatibilityClients({
      status: 'unsupported', reason: 'matrix_invalid', checkedAt: null
    })
  });
  const beforeUnavailableTransition = compatibilityIdentitySnapshot(observational);
  await observational.context.refreshProviderEvidence({ announce: true });
  assert.deepStrictEqual(compatibilityIdentitySnapshot(observational), beforeUnavailableTransition,
    'Degraded to Unsupported transition remains observational');
  assert.strictEqual(compatibilityStatus(observational, 'claude-code').textContent, 'Unsupported');
  assert.strictEqual(observational.announcement.textContent,
    'Compatibility data is unavailable. Showing Unsupported.');

  const timeoutSupported = createProviderHarness({}, {
    runtimeResponse: {
      success: true,
      refreshOutcome: 'refreshed',
      clients: supportedClients
    }
  });
  timeoutSupported.context.setProviderSelection('agent', 'claude-code', { markDirty: false });
  await timeoutSupported.context.refreshProviderEvidence();
  timeoutSupported.holdRuntime();
  await timeoutSupported.context.refreshProviderEvidence({ announce: true });
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(timeoutSupported.state().clients['claude-code'].compatibility)),
    { status: 'degraded', reason: 'evidence_stale', checkedAt: 700 },
    'runtime timeout degrades retained supported compatibility to stale evidence'
  );
  assert.strictEqual(compatibilityStatus(timeoutSupported, 'claude-code').textContent, 'Degraded');
  assert.strictEqual(timeoutSupported.agentCompatibilityStatus.textContent, 'Degraded',
    'runtime timeout keeps row and selected-detail compatibility coherent');
  assert.strictEqual(timeoutSupported.announcement.textContent,
    'Compatibility data could not be refreshed. Cached support is now Degraded.');

  const timeoutOpenCode = createProviderHarness({}, {
    runtimeResponse: {
      success: true,
      refreshOutcome: 'refreshed',
      clients: openCodeClients({
        status: 'supported', reason: 'within_tested_range', checkedAt: 700
      })
    }
  });
  timeoutOpenCode.context.setProviderSelection('agent', 'opencode', { markDirty: false });
  timeoutOpenCode.modelName.appendChild(makeOption('timeout-open-model', 'timeout-open-model'));
  timeoutOpenCode.modelName.value = 'timeout-open-model';
  timeoutOpenCode.openaiApiKey.value = 'timeout-preserved-key';
  timeoutOpenCode.dashboardState().hasUnsavedChanges = true;
  timeoutOpenCode.refreshButton.focus();
  await timeoutOpenCode.context.refreshProviderEvidence();
  const beforeOpenCodeTimeout = compatibilityIdentitySnapshot(timeoutOpenCode);
  timeoutOpenCode.holdRuntime();
  await timeoutOpenCode.context.refreshProviderEvidence({ announce: true });
  assert.deepStrictEqual(compatibilityIdentitySnapshot(timeoutOpenCode), beforeOpenCodeTimeout,
    'OpenCode timeout preserves focus, row order, selection, recommendation, API values, dirty state, auth, billing, and storage');
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(timeoutOpenCode.state().clients.opencode.compatibility)),
    { status: 'degraded', reason: 'evidence_stale', checkedAt: 700 },
    'OpenCode timeout degrades retained safe support without native inspection'
  );
  assert.strictEqual(compatibilityStatus(timeoutOpenCode, 'opencode').textContent, 'Degraded');
  assert.strictEqual(timeoutOpenCode.agentCompatibilityStatus.textContent, 'Degraded');
  assert.strictEqual(compatibilityStatus(timeoutOpenCode, 'codex').textContent, 'Unsupported');
  assert.strictEqual(timeoutOpenCode.announcement.textContent,
    'Compatibility data could not be refreshed. Cached support is now Degraded.');

  for (const contract of [
    {
      label: 'degraded',
      compatibility: { status: 'degraded', reason: 'newer_than_tested_range', checkedAt: 700 },
      retainedCompatibility: { status: 'degraded', reason: 'evidence_stale', checkedAt: 700 },
      visible: 'Degraded',
      announcement: 'Compatibility data could not be refreshed. Cached support is now Degraded.'
    },
    {
      label: 'unsupported',
      compatibility: { status: 'unsupported', reason: 'wrong_major', checkedAt: 700 },
      retainedCompatibility: { status: 'unsupported', reason: 'wrong_major', checkedAt: 700 },
      visible: 'Unsupported',
      announcement: 'Compatibility data is unavailable. Showing Unsupported.'
    }
  ]) {
    const retained = createProviderHarness({}, {
      runtimeResponse: {
        success: true,
        refreshOutcome: 'refreshed',
        clients: compatibilityClients(contract.compatibility)
      }
    });
    retained.context.setProviderSelection('agent', 'claude-code', { markDirty: false });
    await retained.context.refreshProviderEvidence();
    retained.setRuntimeError('bounded runtime failure');
    await retained.context.refreshProviderEvidence({ announce: true });
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(retained.state().clients['claude-code'].compatibility)),
      contract.retainedCompatibility,
      `runtime failure safely projects retained ${contract.label} compatibility truth`
    );
    assert.strictEqual(compatibilityStatus(retained, 'claude-code').textContent, contract.visible);
    assert.strictEqual(retained.agentCompatibilityStatus.textContent, contract.visible);
    assert.strictEqual(retained.announcement.textContent, contract.announcement,
      `runtime failure announcement agrees with retained ${contract.label} compatibility`);
  }

  const invalidOutcome = createProviderHarness({}, {
    runtimeResponse: { success: true, refreshOutcome: 'unknown', clients: supportedClients }
  });
  invalidOutcome.context.setProviderSelection('agent', 'claude-code', { markDirty: false });
  await invalidOutcome.context.refreshProviderEvidence({ announce: true });
  assert.strictEqual(invalidOutcome.state().evidenceStatus, 'unavailable');
  assert.strictEqual(compatibilityStatus(invalidOutcome, 'claude-code').textContent, 'Unsupported');
  assert.strictEqual(invalidOutcome.announcement.textContent,
    'Compatibility data is unavailable. Showing Unsupported.',
    'unknown background outcomes fail closed without a fourth UI state');

  let expiryCacheReads = 0;
  const expiryCheckedAt = 1_000;
  const expiryAt = expiryCheckedAt + (15 * 60 * 1000);
  const expiring = createProviderHarness({}, {
    nowMs: expiryCheckedAt,
    heldTimerDelays: [15 * 60 * 1000],
    runtimeDispatch(message) {
      assert.strictEqual(message.action, 'getMcpClients',
        'automatic compatibility expiry can only use the cache-only inventory route');
      expiryCacheReads += 1;
      if (expiryCacheReads === 1) {
        return {
          success: true,
          refreshOutcome: 'stale',
          compatibilityExpiresAt: expiryAt,
          clients: compatibilityClients({
            status: 'supported', reason: 'within_tested_range', checkedAt: expiryCheckedAt
          })
        };
      }
      const changedEvidenceClients = compatibilityClients({
        status: 'degraded', reason: 'evidence_stale', checkedAt: expiryCheckedAt
      });
      changedEvidenceClients['claude-code'].clicked = { lastClickedAt: expiryAt };
      changedEvidenceClients['claude-code'].installed = null;
      changedEvidenceClients['claude-code'].connected = { lastSeenAt: expiryAt };
      changedEvidenceClients['claude-code'].live = { agentId: 'cache-only-claude' };
      return {
        success: true,
        refreshOutcome: 'stale',
        compatibilityExpiresAt: null,
        clients: changedEvidenceClients
      };
    }
  });
  expiring.context.setupEventListeners();
  expiring.context.setProviderSelection('agent', 'claude-code', { markDirty: false });
  expiring.modelName.appendChild(makeOption('expiry-model', 'expiry-model'));
  expiring.modelName.value = 'expiry-model';
  expiring.anthropicApiKey.value = 'preserved-expiry-key';
  expiring.dashboardState().hasUnsavedChanges = true;
  expiring.refreshButton.focus();
  await expiring.context.refreshProviderEvidence();
  assert.strictEqual(compatibilityStatus(expiring, 'claude-code').textContent, 'Supported');
  assert.strictEqual(expiring.agentCompatibilityStatus.textContent, 'Supported');
  assert.strictEqual(expiring.scheduledTimeoutDelays.includes(15 * 60 * 1000), true,
    'fresh supported evidence schedules one exact authoritative expiry deadline');
  const beforeAutomaticExpiry = compatibilityIdentitySnapshot(expiring);
  const beforeNonCompatibilityClients = nonCompatibilityClientSnapshot(expiring);
  const beforeAutomaticExpiryEvidence = {
    evidenceStatus: expiring.state().evidenceStatus,
    hasSuccessfulEvidence: expiring.state().hasSuccessfulEvidence,
    badges: expiring.evidenceBadges.map((badge) => ({
      providerId: badge.dataset.providerEvidence,
      text: badge.textContent,
      title: badge.getAttribute('title'),
      stale: badge.getAttribute('data-stale')
    })),
    installation: expiring.agentInstallationStatus.textContent,
    connection: expiring.agentConnectionStatus.textContent,
    setup: expiring.agentSetupStatus.textContent
  };
  const beforeCompatibilityProjection = Object.fromEntries(
    expiring.compatibilityStatuses.map((status) => [
      status.dataset.providerCompatibilityStatus,
      status.textContent
    ])
  );

  expiring.setNow(expiryAt);
  expiring.advanceTimersBy(15 * 60 * 1000);
  await flushHarness();
  await flushHarness();

  assert.deepStrictEqual(expiring.runtimeCalls, [
    { action: 'getMcpClients' },
    { action: 'getMcpClients' }
  ], 'the exact-boundary timer reprojects cache once without a daemon refresh');
  assert.strictEqual(expiryCacheReads, 2,
    'automatic expiry performs the initial cache read plus one bounded re-projection');
  assert.strictEqual(compatibilityStatus(expiring, 'claude-code').textContent, 'Degraded',
    'the open provider row ages Supported to Degraded at exactly fifteen minutes');
  assert.strictEqual(expiring.agentCompatibilityStatus.textContent, 'Degraded',
    'selected-provider details stay coherent with the automatically aged row');
  assert.deepStrictEqual(nonCompatibilityClientSnapshot(expiring), beforeNonCompatibilityClients,
    'automatic expiry ignores cache changes to clicked, installed, connected, and live evidence');
  assert.deepStrictEqual({
    evidenceStatus: expiring.state().evidenceStatus,
    hasSuccessfulEvidence: expiring.state().hasSuccessfulEvidence,
    badges: expiring.evidenceBadges.map((badge) => ({
      providerId: badge.dataset.providerEvidence,
      text: badge.textContent,
      title: badge.getAttribute('title'),
      stale: badge.getAttribute('data-stale')
    })),
    installation: expiring.agentInstallationStatus.textContent,
    connection: expiring.agentConnectionStatus.textContent,
    setup: expiring.agentSetupStatus.textContent
  }, beforeAutomaticExpiryEvidence,
  'automatic expiry preserves evidence status, badges, and selected non-compatibility details');
  assert.deepStrictEqual(Object.fromEntries(
    expiring.compatibilityStatuses.map((status) => [
      status.dataset.providerCompatibilityStatus,
      status.textContent
    ])
  ), {
    ...beforeCompatibilityProjection,
    'claude-code': 'Degraded'
  }, 'automatic expiry changes only the expiring Supported compatibility projection');
  assert.deepStrictEqual(compatibilityIdentitySnapshot(expiring), beforeAutomaticExpiry,
    'automatic expiry preserves focus, selection, row order, form values, dirty state, and storage');

  const overlapNewCheckedAt = expiryAt - (5 * 60 * 1000);
  const overlapNewExpiryAt = overlapNewCheckedAt + (15 * 60 * 1000);
  const overlapNewDelay = overlapNewExpiryAt - expiryAt;
  const overlapInitialClients = compatibilityClients({
    status: 'supported', reason: 'within_tested_range', checkedAt: expiryCheckedAt
  });
  const overlapExpiredClients = compatibilityClients({
    status: 'degraded', reason: 'evidence_stale', checkedAt: expiryCheckedAt
  });
  const overlapManualClients = compatibilityClients({
    status: 'supported', reason: 'within_tested_range', checkedAt: overlapNewCheckedAt
  });

  for (const releaseOrder of ['manual-first', 'expiry-first']) {
    const oldExpiryResponse = createDeferred();
    const manualResponse = createDeferred();
    let overlapCacheReads = 0;
    let overlapDaemonRequests = 0;
    let overlapDurableWrites = 0;
    const overlap = createProviderHarness({}, {
      nowMs: expiryCheckedAt,
      heldTimerDelays: [5000, 15 * 60 * 1000, overlapNewDelay],
      runtimeDispatch(message) {
        if (message.action === 'getMcpClients') {
          overlapCacheReads += 1;
          if (overlapCacheReads === 1) {
            return {
              success: true,
              refreshOutcome: 'stale',
              compatibilityExpiresAt: expiryAt,
              clients: overlapInitialClients
            };
          }
          if (overlapCacheReads === 2) return oldExpiryResponse.promise;
        }
        if (message.action === 'refreshMcpCompatibility') {
          overlapDaemonRequests += 1;
          overlapDurableWrites += 1;
          return manualResponse.promise;
        }
        throw new Error(`unexpected ${releaseOrder} overlap runtime action`);
      }
    });
    overlap.context.setProviderSelection('agent', 'claude-code', { markDirty: false });
    overlap.modelName.appendChild(makeOption('overlap-model', 'overlap-model'));
    overlap.modelName.value = 'overlap-model';
    overlap.anthropicApiKey.value = 'preserved-overlap-key';
    overlap.dashboardState().hasUnsavedChanges = true;
    overlap.refreshButton.focus();
    await overlap.context.refreshProviderEvidence();
    overlap.setNow(expiryAt);
    const beforeOverlapIdentity = compatibilityIdentitySnapshot(overlap);
    const beforeOverlapNonCompatibility = nonCompatibilityClientSnapshot(overlap);
    let manualEvidence = null;

    overlap.advanceTimersBy(15 * 60 * 1000);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual(overlap.runtimeCalls, [
      { action: 'getMcpClients' },
      { action: 'getMcpClients' }
    ], `${releaseOrder}: the old expiry cache request is held before manual refresh`);

    const overlappingManual = overlap.context.refreshProviderEvidence({ announce: true });
    assert.deepStrictEqual(overlap.runtimeCalls, [
      { action: 'getMcpClients' },
      { action: 'getMcpClients' },
      { action: 'refreshMcpCompatibility' }
    ], `${releaseOrder}: manual refresh never coalesces into the older cache-only expiry request`);

    if (releaseOrder === 'manual-first') {
      manualResponse.resolve({
        success: true,
        refreshOutcome: 'refreshed',
        compatibilityExpiresAt: overlapNewExpiryAt,
        clients: overlapManualClients
      });
      await overlappingManual;
      manualEvidence = providerEvidenceStateSnapshot(overlap);
      assert.strictEqual(compatibilityStatus(overlap, 'claude-code').textContent, 'Supported');
      assert.strictEqual(overlap.pendingTimeoutDelays.includes(overlapNewDelay), true,
        'newer manual success owns the replacement compatibility deadline');
      oldExpiryResponse.resolve({
        success: true,
        refreshOutcome: 'stale',
        compatibilityExpiresAt: null,
        clients: overlapExpiredClients
      });
      await flushHarness();
      await flushHarness();
    } else {
      oldExpiryResponse.resolve({
        success: true,
        refreshOutcome: 'stale',
        compatibilityExpiresAt: null,
        clients: overlapExpiredClients
      });
      await flushHarness();
      assert.strictEqual(compatibilityStatus(overlap, 'claude-code').textContent, 'Supported',
        'an older expiry response is discarded as soon as a newer manual generation begins');
      manualResponse.resolve({
        success: true,
        refreshOutcome: 'refreshed',
        compatibilityExpiresAt: overlapNewExpiryAt,
        clients: overlapManualClients
      });
      await overlappingManual;
      manualEvidence = providerEvidenceStateSnapshot(overlap);
    }

    assert.strictEqual(compatibilityStatus(overlap, 'claude-code').textContent, 'Supported',
      `${releaseOrder}: final row retains the newer manual compatibility projection`);
    assert.strictEqual(overlap.agentCompatibilityStatus.textContent, 'Supported',
      `${releaseOrder}: selected details retain the newer manual compatibility projection`);
    assert.strictEqual(overlap.announcement.textContent, 'Provider status refreshed.',
      `${releaseOrder}: final announcement agrees with the newer Supported projection`);
    assert.strictEqual(overlap.state().evidenceStatus, 'ready');
    assert.strictEqual(overlap.pendingTimeoutDelays.includes(overlapNewDelay), true,
      `${releaseOrder}: the older response cannot cancel the newer expiry deadline`);
    assert.deepStrictEqual(nonCompatibilityClientSnapshot(overlap), beforeOverlapNonCompatibility,
      `${releaseOrder}: overlap preserves all non-compatibility client evidence`);
    assert.deepStrictEqual(providerEvidenceStateSnapshot(overlap), manualEvidence,
      `${releaseOrder}: older expiry work cannot alter the manual evidence projection`);
    assert.deepStrictEqual(compatibilityIdentitySnapshot(overlap), beforeOverlapIdentity,
      `${releaseOrder}: overlap preserves focus, selection, forms, recommendation, dirty state, and writes`);
    assert.strictEqual(overlapCacheReads, 2);
    assert.strictEqual(overlapDaemonRequests, 1);
    assert.strictEqual(overlapDurableWrites, 1,
      `${releaseOrder}: overlap performs one manual daemon/write generation only`);
  }

  const replacementManualResponse = createDeferred();
  let replacementCacheReads = 0;
  const replacingTimer = createProviderHarness({}, {
    nowMs: expiryCheckedAt,
    heldTimerDelays: [5000, 15 * 60 * 1000, overlapNewDelay],
    runtimeDispatch(message) {
      if (message.action === 'getMcpClients') {
        replacementCacheReads += 1;
        return {
          success: true,
          refreshOutcome: 'stale',
          compatibilityExpiresAt: expiryAt,
          clients: overlapInitialClients
        };
      }
      if (message.action === 'refreshMcpCompatibility') return replacementManualResponse.promise;
      throw new Error('unexpected timer-replacement runtime action');
    }
  });
  await replacingTimer.context.refreshProviderEvidence();
  replacingTimer.setNow(expiryAt);
  assert.strictEqual(replacingTimer.pendingTimeoutDelays.includes(15 * 60 * 1000), true,
    'the original compatibility deadline is armed before manual refresh');
  const replacingManual = replacingTimer.context.refreshProviderEvidence({ announce: true });
  assert.strictEqual(replacingTimer.pendingTimeoutDelays.includes(15 * 60 * 1000), false,
    'manual refresh cancels the older compatibility timer as soon as it begins');
  replacementManualResponse.resolve({
    success: true,
    refreshOutcome: 'refreshed',
    compatibilityExpiresAt: overlapNewExpiryAt,
    clients: overlapManualClients
  });
  await replacingManual;
  assert.strictEqual(replacingTimer.pendingTimeoutDelays.includes(overlapNewDelay), true,
    'manual success arms only its newer replacement deadline');
  replacingTimer.advanceTimersBy(15 * 60 * 1000);
  await flushHarness();
  assert.strictEqual(replacementCacheReads, 1,
    'advancing the cancelled older deadline cannot start a cache projection');
  assert.deepStrictEqual(replacingTimer.runtimeCalls, [
    { action: 'getMcpClients' },
    { action: 'refreshMcpCompatibility' }
  ], 'timer replacement performs one initial cache read and one explicit live request');

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

  let causalDaemonRequests = 0;
  let causalDurableWrites = 0;
  let causalCacheReads = 0;
  let explicitLiveActionSeen = false;
  const compatibilityStorageChange = (checkedAt) => ({
    fsbAgentProviders: {
      newValue: {
        compatibility: { schemaVersion: 2, checkedAt, adapters: [] }
      }
    }
  });
  const causalClients = compatibilityClients({
    status: 'supported', reason: 'within_tested_range', checkedAt: 700
  });
  const causal = createProviderHarness({}, {
    runtimeDispatch(message, controls) {
      if (message.action === 'refreshMcpCompatibility') {
        explicitLiveActionSeen = true;
        causalDaemonRequests += 1;
        causalDurableWrites += 1;
        controls.emitStorage(compatibilityStorageChange(700), 'local');
        return {
          success: true,
          refreshOutcome: 'refreshed',
          compatibilityExpiresAt: null,
          clients: causalClients
        };
      }
      if (message.action === 'getMcpClients' && explicitLiveActionSeen) {
        causalCacheReads += 1;
        return {
          success: true,
          refreshOutcome: 'stale',
          compatibilityExpiresAt: null,
          clients: causalClients
        };
      }
      if (message.action === 'getMcpClients') {
        // Models the reviewed implementation where inventory itself was live.
        causalDaemonRequests += 1;
        causalDurableWrites += 1;
        if (causalDurableWrites === 1) {
          controls.emitStorage({ fsbAgentProviders: { newValue: {} } }, 'local');
        }
        return { success: true, refreshOutcome: 'refreshed', clients: {} };
      }
      throw new Error('unexpected provider runtime action');
    }
  });
  causal.context.setupEventListeners();
  causal.refreshButton.dispatchEvent({ type: 'click' });
  await flushHarness();
  await flushHarness();
  assert.deepStrictEqual(causal.runtimeCalls, [
    { action: 'refreshMcpCompatibility' },
    { action: 'getMcpClients' }
  ], 'one user refresh performs one explicit live request followed by cache-only storage hydration');
  assert.strictEqual(causalDaemonRequests, 1,
    'storage fan-out cannot cause a second daemon compatibility request');
  assert.strictEqual(causalDurableWrites, 1,
    'storage fan-out cannot cause a second compatibility replacement');
  assert.strictEqual(causalCacheReads, 1,
    'the compatibility storage event is reprojected through one cache-only inventory read');
  assert.strictEqual(causal.announcement.textContent, 'Provider status refreshed.',
    'the causal cache hydration retains the one manual success announcement');
  assert.strictEqual(causal.announcement.getAttribute('role'), 'status');
  assert.strictEqual(causal.announcement.getAttribute('aria-live'), 'polite');
  assert.strictEqual(causal.announcement.hidden, false);
  assert.strictEqual(causal.state().evidenceStatus, 'ready',
    'the causal cache hydration cannot downgrade a successful manual generation to stale');
  assert.strictEqual(evidenceBadge(causal, 'claude-code').textContent, 'Installed',
    'fresh installation evidence retains its non-stale visible marker');
  assert.doesNotMatch(evidenceBadge(causal, 'claude-code').getAttribute('title') || '',
    /Status may be stale/,
    'fresh installation evidence retains no stale tooltip after causal fan-out');

  let lateDaemonRequests = 0;
  let lateDurableWrites = 0;
  let lateCacheReads = 0;
  let useNewerExternalProjection = false;
  const newerExternalClients = compatibilityClients({
    status: 'supported', reason: 'within_tested_range', checkedAt: 800
  });
  newerExternalClients['claude-code'].installed = null;
  newerExternalClients.codex.live = { agentId: 'newer-external-codex' };
  const lateCausal = createProviderHarness({}, {
    heldTimerDelays: [100],
    runtimeDispatch(message) {
      if (message.action === 'refreshMcpCompatibility') {
        lateDaemonRequests += 1;
        lateDurableWrites += 1;
        return {
          success: true,
          refreshOutcome: 'refreshed',
          compatibilityExpiresAt: null,
          clients: causalClients
        };
      }
      if (message.action === 'getMcpClients') {
        lateCacheReads += 1;
        return {
          success: true,
          refreshOutcome: 'stale',
          compatibilityExpiresAt: null,
          clients: useNewerExternalProjection ? newerExternalClients : causalClients
        };
      }
      throw new Error('unexpected late-causal provider runtime action');
    }
  });
  lateCausal.context.setupEventListeners();
  await lateCausal.context.refreshProviderEvidence({ announce: true });
  assert.deepStrictEqual(lateCausal.runtimeCalls, [
    { action: 'refreshMcpCompatibility' }
  ], 'manual live success settles before its causal provider-storage event is delivered');
  assert.strictEqual(lateCausal.state().evidenceStatus, 'ready');
  assert.strictEqual(lateCausal.announcement.textContent, 'Provider status refreshed.');

  lateCausal.emitStorage(compatibilityStorageChange(700), 'local');
  assert.strictEqual(lateCausal.runtimeCalls.length, 1,
    'late causal storage delivery waits for the ordinary evidence debounce');
  lateCausal.advanceTimersBy(100);
  await flushHarness();
  await flushHarness();
  assert.deepStrictEqual(lateCausal.runtimeCalls, [
    { action: 'refreshMcpCompatibility' },
    { action: 'getMcpClients' }
  ], 'late causal delivery performs one bounded cache-only hydration after settlement');
  assert.strictEqual(lateDaemonRequests, 1,
    'late causal delivery cannot repeat the daemon compatibility request');
  assert.strictEqual(lateDurableWrites, 1,
    'late causal delivery cannot repeat the durable compatibility replacement');
  assert.strictEqual(lateCacheReads, 1,
    'late causal delivery consumes exactly one cache projection');
  assert.strictEqual(lateCausal.state().evidenceStatus, 'ready',
    'late causal hydration retains the settled manual ready generation');
  assert.strictEqual(lateCausal.announcement.textContent, 'Provider status refreshed.',
    'late causal hydration retains exactly one polite manual success announcement');
  assert.strictEqual(evidenceBadge(lateCausal, 'claude-code').textContent, 'Installed');
  assert.doesNotMatch(evidenceBadge(lateCausal, 'claude-code').getAttribute('title') || '',
    /Status may be stale/,
    'late causal hydration retains no stale evidence marker');

  useNewerExternalProjection = true;
  lateCausal.emitStorage(compatibilityStorageChange(800), 'local');
  lateCausal.advanceTimersBy(100);
  await flushHarness();
  await flushHarness();
  assert.strictEqual(lateCacheReads, 2,
    'a newer external provider generation still performs its own cache hydration');
  assert.deepStrictEqual(visibleRecommendationIds(lateCausal), ['codex'],
    'newer external evidence is not suppressed by causal-generation deduplication');
  assert.strictEqual(evidenceBadge(lateCausal, 'codex').textContent,
    'Connected now · Status may be stale',
    'newer external evidence hydrates through the ordinary cache-state semantics');
  assert.strictEqual(lateDaemonRequests, 1);
  assert.strictEqual(lateDurableWrites, 1,
    'newer external hydration cannot re-enter the manual daemon/write route');

  const preManualResponse = createDeferred();
  const preManualClients = compatibilityClients({
    status: 'supported', reason: 'within_tested_range', checkedAt: 700
  });
  const preManualOlderClients = compatibilityClients({
    status: 'degraded', reason: 'evidence_stale', checkedAt: 600
  });
  const preManualDebounce = createProviderHarness({}, {
    heldTimerDelays: [100, 5000],
    runtimeDispatch(message) {
      if (message.action === 'refreshMcpCompatibility') return preManualResponse.promise;
      if (message.action === 'getMcpClients') {
        return {
          success: true,
          refreshOutcome: 'stale',
          compatibilityExpiresAt: null,
          clients: preManualOlderClients
        };
      }
      throw new Error('unexpected pre-manual debounce runtime action');
    }
  });
  preManualDebounce.context.setupEventListeners();
  preManualDebounce.context.setProviderSelection('agent', 'claude-code', { markDirty: false });
  preManualDebounce.emitStorage(compatibilityStorageChange(600), 'local');
  const preManualRefresh = preManualDebounce.context.refreshProviderEvidence({ announce: true });
  preManualDebounce.advanceTimersBy(100);
  await flushHarness();
  preManualResponse.resolve({
    success: true,
    refreshOutcome: 'refreshed',
    compatibilityExpiresAt: null,
    clients: preManualClients
  });
  await preManualRefresh;
  await flushHarness();
  await flushHarness();
  assert.strictEqual(preManualDebounce.state().evidenceStatus, 'ready',
    'an older debounce armed before manual refresh cannot downgrade its success');
  assert.strictEqual(preManualDebounce.announcement.textContent,
    'Provider status refreshed. Compatibility is now Supported.',
    'an older pre-manual debounce cannot erase the one success announcement');
  assert.strictEqual(compatibilityStatus(preManualDebounce, 'claude-code').textContent, 'Supported');
  assert.deepStrictEqual(preManualDebounce.runtimeCalls, [
    { action: 'refreshMcpCompatibility' }
  ], 'manual refresh subsumes an older provider-storage debounce before it can hydrate');

  const externalOldExpiryResponse = createDeferred();
  const externalInitialCheckedAt = 1_000;
  const externalInitialExpiryAt = externalInitialCheckedAt + (15 * 60 * 1000);
  const externalNewCheckedAt = 1_500;
  const externalNewExpiryAt = externalNewCheckedAt + (15 * 60 * 1000);
  const externalNewDelay = externalNewExpiryAt - externalInitialExpiryAt;
  const externalInitialClients = compatibilityClients({
    status: 'supported', reason: 'within_tested_range', checkedAt: externalInitialCheckedAt
  });
  const externalExpiredClients = compatibilityClients({
    status: 'degraded', reason: 'evidence_stale', checkedAt: externalInitialCheckedAt
  });
  const externalNewClients = compatibilityClients({
    status: 'supported', reason: 'within_tested_range', checkedAt: externalNewCheckedAt
  });
  let externalGenerationCacheReads = 0;
  const externalGeneration = createProviderHarness({}, {
    nowMs: externalInitialCheckedAt,
    heldTimerDelays: [100, 15 * 60 * 1000, externalNewDelay],
    runtimeDispatch(message) {
      assert.strictEqual(message.action, 'getMcpClients',
        'expiry and external evidence generations remain cache-only');
      externalGenerationCacheReads += 1;
      if (externalGenerationCacheReads === 1) {
        return {
          success: true,
          refreshOutcome: 'stale',
          compatibilityExpiresAt: externalInitialExpiryAt,
          clients: externalInitialClients
        };
      }
      if (externalGenerationCacheReads === 2) return externalOldExpiryResponse.promise;
      if (externalGenerationCacheReads === 3) {
        return {
          success: true,
          refreshOutcome: 'stale',
          compatibilityExpiresAt: externalNewExpiryAt,
          clients: externalNewClients
        };
      }
      throw new Error('unexpected external-generation cache read');
    }
  });
  externalGeneration.context.setupEventListeners();
  externalGeneration.context.setProviderSelection('agent', 'claude-code', { markDirty: false });
  await externalGeneration.context.refreshProviderEvidence();
  externalGeneration.setNow(externalInitialExpiryAt);
  externalGeneration.advanceTimersBy(15 * 60 * 1000);
  await Promise.resolve();
  await Promise.resolve();
  externalGeneration.emitStorage(compatibilityStorageChange(externalNewCheckedAt), 'local');
  externalGeneration.advanceTimersBy(100);
  await flushHarness();
  await flushHarness();
  assert.strictEqual(compatibilityStatus(externalGeneration, 'claude-code').textContent, 'Supported');
  assert.strictEqual(externalGeneration.pendingTimeoutDelays.includes(externalNewDelay), true,
    'newer external evidence installs its own compatibility deadline');
  const externalGenerationEvidence = providerEvidenceStateSnapshot(externalGeneration);
  externalOldExpiryResponse.resolve({
    success: true,
    refreshOutcome: 'stale',
    compatibilityExpiresAt: null,
    clients: externalExpiredClients
  });
  await flushHarness();
  await flushHarness();
  assert.strictEqual(compatibilityStatus(externalGeneration, 'claude-code').textContent, 'Supported',
    'an older expiry response cannot overwrite newer external compatibility');
  assert.strictEqual(externalGeneration.pendingTimeoutDelays.includes(externalNewDelay), true,
    'an older expiry response cannot cancel the newer external deadline');
  assert.deepStrictEqual(providerEvidenceStateSnapshot(externalGeneration), externalGenerationEvidence,
    'late expiry work cannot alter the newer external evidence generation');
  assert.strictEqual(externalGenerationCacheReads, 3,
    'the ordering uses one initial, one expiry, and one external cache read');

  const queuedStorage = createProviderHarness({}, {
    holdRuntime: true,
    heldTimerDelays: [5000]
  });
  queuedStorage.context.setupEventListeners();
  const heldFirstRefresh = queuedStorage.context.refreshProviderEvidence();
  queuedStorage.emitStorage({ fsbAgentProviders: { newValue: {} } }, 'local');
  queuedStorage.emitStorage({ fsbAgentRegistry: { newValue: {} } }, 'session');
  await flushHarness();
  assert.strictEqual(queuedStorage.runtimeCalls.length, 1,
    'storage invalidations do not join direct callers or start a parallel request');
  queuedStorage.resolveNextRuntime({
    success: true,
    clients: { 'claude-code': { live: {} } }
  });
  await heldFirstRefresh;
  assert.strictEqual(queuedStorage.runtimeCalls.length, 2,
    'local and session invalidations queue exactly one post-settlement refresh');
  queuedStorage.resolveNextRuntime({
    success: true,
    clients: { codex: { live: {} } }
  });
  await flushHarness();
  assert.strictEqual(queuedStorage.runtimeCalls.length, 2,
    'queued storage refresh performs exactly two total runtime calls');
  assert.deepStrictEqual(visibleRecommendationIds(queuedStorage), ['codex'],
    'the queued response wins as the final recommendation');
  assert.strictEqual(evidenceBadge(queuedStorage, 'codex').textContent, 'Connected now');
  assert.strictEqual(evidenceBadge(queuedStorage, 'claude-code').textContent, 'Not installed',
    'the first response cannot overwrite the queued final view');

  console.log('Providers panel UI: bounded held-runtime recovery');
  const timedOut = createProviderHarness({}, { holdRuntime: true });
  timedOut.context.setProviderSelection('agent', 'codex', { markDirty: false });
  const pendingTimeout = timedOut.context.refreshProviderEvidence({ announce: true });
  assert.deepStrictEqual(visibleRecommendationIds(timedOut), ['xai'],
    'deterministic fallback is visible while the first request is pending');
  assert.strictEqual(timedOut.refreshButton.disabled, true);
  await pendingTimeout;
  assert.ok(timedOut.scheduledTimeoutDelays.includes(5000),
    'the harness shortens the production five-second timeout deterministically');
  assert.strictEqual(timedOut.state().evidenceStatus, 'unavailable');
  assert.strictEqual(timedOut.refreshButton.disabled, false,
    'timeout restores the Refresh action');
  assert.strictEqual(timedOut.refreshButton.getAttribute('aria-busy'), 'false');
  assert.deepStrictEqual(visibleRecommendationIds(timedOut), ['xai'],
    'timeout retains exactly one fallback badge');
  assert.strictEqual(selectedRadio(timedOut).dataset.providerId, 'codex',
    'timeout preserves the in-form selection');

  const staleTimeout = createProviderHarness({}, {
    runtimeResponse: {
      success: true,
      clients: { codex: { installed: { detected: true, checkedAt: 500 } } }
    }
  });
  staleTimeout.context.setProviderSelection('api', 'openai', { markDirty: false });
  await staleTimeout.context.refreshProviderEvidence();
  staleTimeout.holdRuntime();
  await staleTimeout.context.refreshProviderEvidence({ announce: true });
  assert.strictEqual(staleTimeout.state().evidenceStatus, 'stale');
  assert.deepStrictEqual(visibleRecommendationIds(staleTimeout), ['codex'],
    'a timeout after success preserves exactly one last-known recommendation');
  assert.strictEqual(selectedRadio(staleTimeout).dataset.providerId, 'openai');
  assert.strictEqual(staleTimeout.refreshButton.disabled, false);
}

runProviderRuntimeTests()
  .then(runAgentDetailsTests)
  .then(runMcpBridgePairingTests)
  .then(runProviderEvidenceTests)
  .then(() => console.log('PASS providers-panel-ui static and runtime evidence'))
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
