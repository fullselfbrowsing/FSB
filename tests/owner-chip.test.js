'use strict';

/**
 * Popup/sidepanel ownership-status tests.
 *
 * Validates:
 *   - shouldShowOwnerChip render conditions per CONTEXT D-05
 *     (foreign owner -> show; same-surface -> hide; unowned -> hide)
 *   - buildChipText format ('Owned by <label>')
 *   - ownerLabelFor: legacy:* literal vs agent_<uuid> -> formatAgentIdForDisplay
 *   - findOwnerInEnvelope flat-scan over the Phase 237 D-03 storage envelope
 *   - Popup and sidepanel replace the one header status instead of appending
 *     a second owner chip.
 *
 * Run: node tests/owner-chip.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const OwnerChip = require('../extension/ui/owner-chip.js');
const { shouldShowOwnerChip, buildChipText, ownerLabelFor, clientLabelFor, findOwnerInEnvelope } =
  OwnerChip;
const { formatAgentIdForDisplay } = require('../extension/utils/agent-registry.js');

let passed = 0;
let failed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

console.log('\n--- shouldShowOwnerChip render conditions ---');

// Test 1: foreign non-legacy agent owner -> SHOW
ok(shouldShowOwnerChip('agent_a3f1ab123c45-d6e7-89f0', 'legacy:popup') === true,
  'Test 1: non-legacy agent owner + legacy:popup surface -> SHOW');
ok(shouldShowOwnerChip('agent_a3f1ab123c45-d6e7-89f0', 'legacy:sidepanel') === true,
  'Test 1b: non-legacy agent owner + legacy:sidepanel surface -> SHOW');

// Test 2: null / undefined ownerAgentId -> HIDE (unowned tab)
ok(shouldShowOwnerChip(null, 'legacy:popup') === false,
  'Test 2a: null ownerAgentId -> HIDE');
ok(shouldShowOwnerChip(undefined, 'legacy:popup') === false,
  'Test 2b: undefined ownerAgentId -> HIDE');
ok(shouldShowOwnerChip('', 'legacy:popup') === false,
  'Test 2c: empty-string ownerAgentId -> HIDE');

// Test 3: ownerAgentId === mySurface (popup owns its own tab) -> HIDE
ok(shouldShowOwnerChip('legacy:popup', 'legacy:popup') === false,
  'Test 3a: legacy:popup owner + legacy:popup surface -> HIDE');
ok(shouldShowOwnerChip('legacy:sidepanel', 'legacy:sidepanel') === false,
  'Test 3b: legacy:sidepanel owner + legacy:sidepanel surface -> HIDE');

// Test 4: cross-surface legacy ownership IS shown (popup viewing a tab the
// sidepanel owns is informative)
ok(shouldShowOwnerChip('legacy:sidepanel', 'legacy:popup') === true,
  'Test 4a: legacy:sidepanel owner + legacy:popup surface -> SHOW (cross-surface)');
ok(shouldShowOwnerChip('legacy:popup', 'legacy:sidepanel') === true,
  'Test 4b: legacy:popup owner + legacy:sidepanel surface -> SHOW (cross-surface)');

// Defensive: bad mySurface input
ok(shouldShowOwnerChip('agent_xx', null) === false,
  'Test 4c: null mySurface -> HIDE (defensive)');

console.log('\n--- buildChipText format ---');

ok(buildChipText('agent_a3f1ab') === 'Owned by agent_a3f1ab',
  'Test 5a: buildChipText("agent_a3f1ab") === "Owned by agent_a3f1ab"');
ok(buildChipText('legacy:sidepanel') === 'Owned by legacy:sidepanel',
  'Test 5b: buildChipText("legacy:sidepanel") === "Owned by legacy:sidepanel"');
ok(buildChipText('') === 'Owned by ',
  'Test 5c: buildChipText("") === "Owned by "');
ok(buildChipText(null) === 'Owned by ',
  'Test 5d: buildChipText(null) === "Owned by "');

console.log('\n--- ownerLabelFor (legacy literal vs canonical formatter) ---');

ok(ownerLabelFor('legacy:popup', formatAgentIdForDisplay) === 'legacy:popup',
  'Test 6a: legacy:popup -> literal');
ok(ownerLabelFor('legacy:sidepanel', formatAgentIdForDisplay) === 'legacy:sidepanel',
  'Test 6b: legacy:sidepanel -> literal');

const fullId = 'agent_a3f1ab123c45-d6e7-89f0-1234-567890abcdef';
const expectedShort = formatAgentIdForDisplay(fullId);
ok(ownerLabelFor(fullId, formatAgentIdForDisplay) === expectedShort,
  'Test 6c: agent_<uuid> -> formatAgentIdForDisplay output (' + expectedShort + ')');

ok(ownerLabelFor(null, formatAgentIdForDisplay) === '',
  'Test 6d: null -> ""');

console.log('\n--- clientLabelFor (chrome.storage.session fsbAgentClientLabels lookup) ---');

// Test 11a: happy path -- agentId present in labelsMap returns the canonical label verbatim
ok(clientLabelFor('agent_aaa', { 'agent_aaa': 'Claude' }) === 'Claude',
  'Test 11a: clientLabelFor("agent_aaa", { agent_aaa: "Claude" }) === "Claude"');

// Test 11b: missing agentId returns null (chip falls back to ownerLabelFor)
ok(clientLabelFor('agent_missing', { 'agent_aaa': 'Claude' }) === null,
  'Test 11b: missing agentId -> null');

// Test 11c: null labelsMap -> null
ok(clientLabelFor('agent_aaa', null) === null,
  'Test 11c: null labelsMap -> null');

// Test 11d: undefined labelsMap -> null
ok(clientLabelFor('agent_aaa', undefined) === null,
  'Test 11d: undefined labelsMap -> null');

// Test 11e: array labelsMap -> null (must be a plain map); string labelsMap -> null
ok(clientLabelFor('agent_aaa', ['Claude']) === null
   && clientLabelFor('agent_aaa', 'Claude') === null,
  'Test 11e: array labelsMap and string labelsMap both -> null');

// Test 11f: empty-string value rejected so chip never renders "owned by " with blank label
ok(clientLabelFor('agent_aaa', { 'agent_aaa': '' }) === null,
  'Test 11f: empty-string value -> null (so chip never shows "owned by " with blank label)');

console.log('\n--- findOwnerInEnvelope storage scan ---');

// Test 7: standard envelope shape (Phase 237 D-03)
const env1 = {
  v: 1,
  records: {
    'agent_aaa1111111111111-2222-3333-4444-555555555555': { tabIds: [10, 20] },
    'legacy:popup': { tabIds: [30] },
    'agent_bbb2222222222222-3333-4444-5555-666666666666': { tabIds: [40, 50, 60] }
  }
};

ok(findOwnerInEnvelope(env1, 20) === 'agent_aaa1111111111111-2222-3333-4444-555555555555',
  'Test 7a: tab 20 owned by agent_aaa');
ok(findOwnerInEnvelope(env1, 30) === 'legacy:popup',
  'Test 7b: tab 30 owned by legacy:popup');
ok(findOwnerInEnvelope(env1, 60) === 'agent_bbb2222222222222-3333-4444-5555-666666666666',
  'Test 7c: tab 60 owned by agent_bbb');
ok(findOwnerInEnvelope(env1, 999) === null,
  'Test 7d: tab 999 -> null (no owner)');

// Test 7e: tabId scalar (legacy single-tab record shape)
const env2 = {
  v: 1,
  records: {
    'agent_ccc': { tabId: 77 }
  }
};
ok(findOwnerInEnvelope(env2, 77) === 'agent_ccc',
  'Test 7e: scalar tabId record matched');

// Test 7f: defensive inputs
ok(findOwnerInEnvelope(null, 1) === null, 'Test 7f: null envelope -> null');
ok(findOwnerInEnvelope({}, 1) === null, 'Test 7g: empty envelope -> null');
ok(findOwnerInEnvelope(env1, 'not-a-number') === null,
  'Test 7h: non-numeric tabId -> null');

console.log('\n--- Source-level audit: popup.js + sidepanel.js + HTML wiring ---');

const popupJsSrc = fs.readFileSync(
  path.resolve(__dirname, '../extension/ui/popup.js'), 'utf8'
);
const popupHtmlSrc = fs.readFileSync(
  path.resolve(__dirname, '../extension/ui/popup.html'), 'utf8'
);
const sidepanelJsSrc = fs.readFileSync(
  path.resolve(__dirname, '../extension/ui/sidepanel.js'), 'utf8'
);
const sidepanelHtmlSrc = fs.readFileSync(
  path.resolve(__dirname, '../extension/ui/sidepanel.html'), 'utf8'
);
const popupCssSrc = fs.readFileSync(
  path.resolve(__dirname, '../extension/ui/popup.css'), 'utf8'
);
const sidepanelCssSrc = fs.readFileSync(
  path.resolve(__dirname, '../extension/ui/sidepanel.css'), 'utf8'
);

// Popup wiring
ok(popupJsSrc.indexOf("legacy:popup") >= 0,
  'Test 8a: popup.js references legacy:popup surface id');
ok(popupJsSrc.indexOf('shouldShowOwnerChip') >= 0,
  'Test 8b: popup.js calls shouldShowOwnerChip');
ok(popupJsSrc.indexOf('refreshOwnerChip') >= 0 || popupJsSrc.indexOf('owner-chip') >= 0
  || popupJsSrc.indexOf('owned by') >= 0,
  'Test 8c: popup.js threads owner-chip refresh logic');
ok(popupHtmlSrc.indexOf('fsb-owner-chip') === -1,
  'Test 8d: popup.html has no separate owner-chip element');
ok(popupHtmlSrc.indexOf('owner-chip.js') >= 0,
  'Test 8e: popup.html loads owner-chip.js');

// Test 8f -- popup.js mirrors sidepanel.js storage-change listener (Quick task
// 260524-8qv, Codex PR #78 Finding 3, P2): popup.js installs a
// chrome.storage.onChanged listener that refreshes the owner chip when
// fsbAgentRegistry or fsbAgentClientLabels mutate in the session namespace.
// Mirrors sidepanel.js:224..241 so an ownership flip mid-popup re-renders the
// chip without waiting for a close/reopen. Source-text audit (popup.js source
// already loaded above as `popupJsSrc`).
ok(popupJsSrc.indexOf('chrome.storage.onChanged') >= 0,
  'Test 8f-1: popup.js installs a chrome.storage.onChanged listener');
ok(popupJsSrc.indexOf('fsbAgentClientLabels') >= 0,
  'Test 8f-2: popup.js listener references fsbAgentClientLabels (canonical MCP client label map)');
ok(popupJsSrc.indexOf('fsbAgentRegistry') >= 0,
  'Test 8f-3: popup.js listener references fsbAgentRegistry (ownership envelope)');
// Both keys must be in the SAME branch -- a regex over the listener body catches
// a regression where the listener exists but only watches one key.
ok(/chrome\.storage\.onChanged[\s\S]{0,800}fsbAgentRegistry[\s\S]{0,400}fsbAgentClientLabels|chrome\.storage\.onChanged[\s\S]{0,800}fsbAgentClientLabels[\s\S]{0,400}fsbAgentRegistry/.test(popupJsSrc),
  'Test 8f-4: popup.js listener body covers BOTH fsbAgentRegistry and fsbAgentClientLabels (single branch)');
ok(/area\s*===\s*['"]session['"]/.test(popupJsSrc),
  'Test 8f-5: popup.js listener gates on area === "session"');

// Sidepanel wiring
ok(sidepanelJsSrc.indexOf('legacy:sidepanel') >= 0,
  'Test 9a: sidepanel.js references legacy:sidepanel surface id');
ok(sidepanelJsSrc.indexOf('shouldShowOwnerChip') >= 0,
  'Test 9b: sidepanel.js calls shouldShowOwnerChip');
ok(sidepanelJsSrc.indexOf('refreshOwnerChip') >= 0 || sidepanelJsSrc.indexOf('owner-chip') >= 0
  || sidepanelJsSrc.indexOf('owned by') >= 0,
  'Test 9c: sidepanel.js threads owner-chip refresh logic');
ok(sidepanelHtmlSrc.indexOf('fsb-owner-chip') === -1,
  'Test 9d: sidepanel.html has no separate owner-chip element');
ok(sidepanelHtmlSrc.indexOf('owner-chip.js') >= 0,
  'Test 9e: sidepanel.html loads owner-chip.js');
ok((sidepanelHtmlSrc.match(/delegation-feed\.js/g) || []).length === 1
    && sidepanelHtmlSrc.indexOf('owner-chip.js') < sidepanelHtmlSrc.indexOf('delegation-feed.js')
    && sidepanelHtmlSrc.indexOf('delegation-feed.js') < sidepanelHtmlSrc.indexOf('sidepanel.js'),
  'Test 9f: sidepanel delegation feed is loaded once without disturbing owner-chip-before-sidepanel order');
ok((popupHtmlSrc.match(/class="status-text"/g) || []).length === 1
    && (sidepanelHtmlSrc.match(/class="status-text"/g) || []).length === 1,
  'Test 9g: each surface retains exactly one header status text element');
ok(/changes\.fsbAgentRegistry[\s\S]{0,220}syncActiveTabSurface\(_activeTabIdSnapshot\)[\s\S]{0,180}_refreshSelectedDelegationSnapshot\(\)/.test(sidepanelJsSrc),
  'Test 9h: one registry-change branch synchronizes the tab surface and canonical delegation snapshot');
ok(/chrome\.tabs\.onActivated\.addListener[\s\S]*?syncActiveTabSurface\(activeInfo\.tabId, activeInfo\.windowId\)/.test(sidepanelJsSrc)
    && /async function syncActiveTabSurface[\s\S]*?_activeTabIdSnapshot\s*=\s*incomingTabId[\s\S]*?_hydrateDelegationForSelectedConversation\(\)/.test(sidepanelJsSrc),
  'Test 9i: tab activation uses the exact event tab and the unified sync refreshes delegation eligibility');

ok(/\.status-dot\.owned\s*\{[^}]*color:\s*#f59e0b[^}]*animation:\s*none/s.test(popupCssSrc),
  'Test 10a: popup ownership dot is orange and non-pulsing');
ok(/\.status-dot\.owned\s*\{[^}]*color:\s*#f59e0b[^}]*animation:\s*none/s.test(sidepanelCssSrc),
  'Test 10b: sidepanel ownership dot is orange and non-pulsing');
ok(/_setHeaderOwner\(label\)/.test(popupJsSrc)
    && /_setHeaderOwner\(label,\s*\{/.test(sidepanelJsSrc),
  'Test 10c: both ownership refresh paths replace the header status');

function extractNamedFunction(source, name) {
  const asyncStart = source.indexOf('async function ' + name + '(');
  const start = asyncStart >= 0 ? asyncStart : source.indexOf('function ' + name + '(');
  if (start < 0) return null;
  const brace = source.indexOf('{', start);
  if (brace < 0) return null;
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function runHeaderStatusContract(source, surfaceName) {
  const classes = new Set();
  const context = {
    statusText: { textContent: 'Ready' },
    statusDot: {
      classList: {
        add(...names) { names.forEach((name) => classes.add(name)); },
        remove(...names) { names.forEach((name) => classes.delete(name)); }
      }
    },
    FSBOwnerChip: { buildChipText },
    _headerBaseStatusLabel: 'Ready',
    _headerBaseStatusTone: '',
    _headerOwnerLabel: null
  };
  vm.createContext(context);
  for (const name of ['_renderHeaderStatus', '_setHeaderStatus', '_setHeaderOwner']) {
    const definition = extractNamedFunction(source, name);
    ok(!!definition, surfaceName + ': ' + name + ' is extractable');
    if (definition) vm.runInContext(definition, context);
  }

  context._setHeaderStatus('Ready', '');
  ok(context.statusText.textContent === 'Ready' && classes.size === 0,
    surfaceName + ': unowned idle state stays Ready with the green base dot');

  context._setHeaderOwner('Claude');
  ok(context.statusText.textContent === 'Owned by Claude'
      && classes.has('owned') && !classes.has('running') && !classes.has('error'),
    surfaceName + ': foreign ownership replaces Ready with the orange owner state');

  context._setHeaderStatus('Error', 'error');
  ok(context.statusText.textContent === 'Owned by Claude'
      && classes.has('owned') && !classes.has('error'),
    surfaceName + ': ownership wins over later lifecycle updates');

  context._setHeaderOwner(null);
  ok(context.statusText.textContent === 'Error'
      && classes.has('error') && !classes.has('owned'),
    surfaceName + ': release restores the latest underlying lifecycle state');

  context._setHeaderStatus('Working', 'running');
  context._setHeaderOwner('Codex');
  context._setHeaderOwner(null);
  ok(context.statusText.textContent === 'Working'
      && classes.has('running') && !classes.has('owned'),
    surfaceName + ': release restores a newer Working state too');
}

console.log('\n--- exclusive ownership status rendering ---');
runHeaderStatusContract(popupJsSrc, 'popup');
runHeaderStatusContract(sidepanelJsSrc, 'sidepanel');

async function runOwnershipRefreshContract(source, surfaceName, mySurface, richLockout) {
  const classes = new Set();
  const attributes = Object.create(null);
  const chatInput = {
    title: '',
    setAttribute(name, value) { attributes[name] = String(value); },
    removeAttribute(name) { delete attributes[name]; }
  };
  let storageBag = {
    fsbAgentRegistry: { v: 1, records: { agent_aaa: { tabIds: [42] } } },
    fsbAgentClientLabels: { agent_aaa: 'Claude' }
  };
  let delayNextStorageRead = false;
  let resolveDelayedStorageRead = null;
  const lockoutCalls = [];
  const context = {
    MY_SURFACE: mySurface,
    FSBOwnerChip: OwnerChip,
    FsbAgentRegistry: { formatAgentIdForDisplay },
    statusText: { textContent: 'Ready' },
    statusDot: {
      classList: {
        add(...names) { names.forEach((name) => classes.add(name)); },
        remove(...names) { names.forEach((name) => classes.delete(name)); }
      }
    },
    chatInput,
    _headerBaseStatusLabel: 'Ready',
    _headerBaseStatusTone: '',
    _headerOwnerLabel: null,
    _ownerStatusRefreshGeneration: 0,
    _chatLockedByOwnerChip: false,
    chrome: {
      tabs: { async query() { return [{ id: 42 }]; } },
      storage: {
        session: {
          get(key) {
            if (Array.isArray(key) && delayNextStorageRead) {
              delayNextStorageRead = false;
              return new Promise((resolve) => { resolveDelayedStorageRead = resolve; });
            }
            if (Array.isArray(key)) return Promise.resolve(storageBag);
            return Promise.resolve({});
          }
        }
      }
    },
    updateSendButtonState() {},
    applyInputLockout(value) { lockoutCalls.push(value); }
  };
  vm.createContext(context);
  for (const name of ['_renderHeaderStatus', '_setHeaderStatus', '_setHeaderOwner', 'refreshOwnerChip']) {
    const definition = extractNamedFunction(source, name);
    ok(!!definition, surfaceName + ': ' + name + ' is extractable for refresh behavior');
    if (definition) vm.runInContext(definition, context);
  }

  await context.refreshOwnerChip();
  ok(context.statusText.textContent === 'Owned by Claude'
      && classes.has('owned') && context._chatLockedByOwnerChip === true,
    surfaceName + ': canonical client ownership replaces Ready and locks the composer');
  if (richLockout) {
    ok(lockoutCalls[lockoutCalls.length - 1] === true,
      surfaceName + ': ownership status preserves the rich input lockout path');
  } else {
    ok(attributes.contenteditable === 'false',
      surfaceName + ': ownership status preserves the popup input lockout path');
  }

  storageBag = {
    fsbAgentRegistry: { v: 1, records: { agent_aaa: { tabIds: [42] } } },
    fsbAgentClientLabels: { agent_aaa: 'Codex' }
  };
  await context.refreshOwnerChip();
  ok(context.statusText.textContent === 'Owned by Codex' && classes.has('owned'),
    surfaceName + ': a friendly-label update refreshes the replacement status');

  context._setHeaderStatus('Error', 'error');
  storageBag = { fsbAgentRegistry: { v: 1, records: {} }, fsbAgentClientLabels: {} };
  await context.refreshOwnerChip();
  ok(context.statusText.textContent === 'Error'
      && classes.has('error') && !classes.has('owned')
      && context._chatLockedByOwnerChip === false,
    surfaceName + ': ownership release restores the latest status and unlocks the composer');

  context._setHeaderStatus('Ready', '');
  storageBag = {
    fsbAgentRegistry: { v: 1, records: { [mySurface]: { tabIds: [42] } } },
    fsbAgentClientLabels: {}
  };
  await context.refreshOwnerChip();
  ok(context.statusText.textContent === 'Ready' && !classes.has('owned'),
    surfaceName + ': self-owned tabs retain Ready');

  const staleOwnedBag = {
    fsbAgentRegistry: { v: 1, records: { agent_stale: { tabIds: [42] } } },
    fsbAgentClientLabels: { agent_stale: 'Stale agent' }
  };
  delayNextStorageRead = true;
  const staleRefresh = context.refreshOwnerChip();
  await new Promise((resolve) => setImmediate(resolve));
  storageBag = { fsbAgentRegistry: { v: 1, records: {} }, fsbAgentClientLabels: {} };
  await context.refreshOwnerChip();
  resolveDelayedStorageRead(staleOwnedBag);
  await staleRefresh;
  ok(context.statusText.textContent === 'Ready'
      && !classes.has('owned') && context._chatLockedByOwnerChip === false,
    surfaceName + ': a stale ownership read cannot overwrite a newer release');
}

(async function runAsyncContracts() {
  console.log('\n--- ownership refresh and race handling ---');
  await runOwnershipRefreshContract(popupJsSrc, 'popup', 'legacy:popup', false);
  await runOwnershipRefreshContract(sidepanelJsSrc, 'sidepanel', 'legacy:sidepanel', true);
  console.log('\n=== owner-chip results: ' + passed + ' passed, ' + failed + ' failed ===');
  if (failed > 0) process.exitCode = 1;
})().catch((error) => {
  failed++;
  console.error('  FAIL: ownership refresh contract threw:', error);
  console.log('\n=== owner-chip results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exitCode = 1;
});
