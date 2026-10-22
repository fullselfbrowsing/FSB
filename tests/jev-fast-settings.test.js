'use strict';

/**
 * Phase 68 Plan 01 (AUTO-01, D-04) -- the fast-mode switch as one settings key.
 *
 * fsbJevFastModeEnabled is one writable boolean FsbSettingsSchema entry,
 * default false, with the same false default in Config.defaults,
 * init-config.js and options.js defaultSettings. The control panel loads,
 * saves and live-refreshes it the way it handles fsbChangeReportsEnabled, and
 * nothing reads it at run time yet. The checkbox and its disclosure card land
 * in plan 68-12, so every panel site here must tolerate a missing element.
 *
 * Sections:
 *   - schema: the entry, its position, the 36/25/11 counts and parseValue;
 *   - default copies: the three copies hold false, so D-12 parity adds no
 *     divergence;
 *   - options.js wiring: source regexes in the style of
 *     tests/change-report-settings-ui.test.js;
 *   - panel sync: FSBSettingsSync loaded under the tests/settings-panel-sync
 *     DOM shim (refresh in place, no event, Save never reverts an external
 *     write, a user edit wins).
 * Plan 68-12 adds:
 *   - copy accuracy: the shared disclosure fact list
 *     (tests/fixtures/jev-fast-disclosure-facts.js) checked against the real
 *     request builder (FsbJevState.buildRequest) and the content-side proofs,
 *     so every never-sent claim stays true;
 *   - card: the unchecked switch in Advanced Settings right after Action
 *     Change Reports, and its disclosure text checked against the same fact
 *     list (every SHARED_PHRASES and CARD_ONLY_PHRASES entry, no
 *     FORBIDDEN_PATTERNS match).
 *
 * No network, no ports. Node 20-safe.
 *
 * Run: node tests/jev-fast-settings.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const KEY = 'fsbJevFastModeEnabled';

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log('  PASS:', msg); }
  else { failed += 1; console.error('  FAIL:', msg); }
}

function section(title) {
  console.log('\n--- ' + title + ' ---');
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function readRepo(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function sliceBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) return null;
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) return null;
  return text.slice(start, end);
}

const OPTIONS_PATH = path.join(ROOT, 'extension', 'ui', 'options.js');
const OPTIONS_SOURCE = readRepo('extension/ui/options.js');
const INIT_CONFIG_SOURCE = readRepo('extension/config/init-config.js');
const SCHEMA_TEST_SOURCE = readRepo('tests/settings-schema.test.js');

// ---------------------------------------------------------------------------
// DOM shim (the tests/settings-panel-sync.test.js harness, reduced)
// ---------------------------------------------------------------------------

let dispatchCount = 0;
let fetchCalls = 0;

function makeEl(tagName, id) {
  return {
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
}

const registry = new Map();

function buildRegistry(withSwitch) {
  registry.clear();
  for (const id of ['debugMode', 'fsbChangeReportsEnabled']) {
    const el = makeEl('input', id);
    el.type = 'checkbox';
    registry.set(id, el);
  }
  if (withSwitch) {
    const el = makeEl('input', KEY);
    el.type = 'checkbox';
    registry.set(KEY, el);
  }
}

function installShims() {
  buildRegistry(true);
  global.document = {
    readyState: 'complete',
    getElementById: (id) => registry.get(id) || null,
    createElement: (tag) => makeEl(tag),
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => []
  };
  global.chrome = {
    storage: {
      local: {
        get: (_keys, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
        set: (_obj, cb) => { if (typeof cb === 'function') cb(); return Promise.resolve(); }
      },
      onChanged: { addListener: () => {} }
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
    throw new Error('jev-fast-settings: network is forbidden in this test');
  };
}

function simpleDeps() {
  const noop = () => undefined;
  const deps = { getElement: (id) => registry.get(id) || null };
  for (const name of ['refreshStepper', 'setAgentCap', 'setPersistedVoiceInputEnabled', 'getProviderState',
    'getPersistedProviderSelection', 'setPersistedProviderSelection', 'normalizeProviderSettings',
    'invalidateDiscovery', 'updateApiKeyVisibility', 'updateModelDescription', 'setDiscoveryStatus',
    'setControlsDisabled', 'refreshCombobox', 'renderProviderKind', 'syncSelectLabels', 'createOption']) {
    deps[name] = noop;
  }
  return deps;
}

// The onboarding-first-run harness on init-config's production branch (the
// tests/settings-schema.test.js D-12 harness): the install patch is what a
// fresh production install stores.
async function loadInitConfigProductionDefaults() {
  const storageSets = [];
  let installListener = null;
  const context = {
    console,
    window: {},
    chrome: {
      runtime: {
        getManifest: () => ({ version: '0.0.0-test', update_url: 'https://clients2.google.com/service/update2/crx' }),
        getURL: (rel) => 'chrome-extension://fsb/' + rel,
        onInstalled: { addListener: (fn) => { installListener = fn; } }
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async (patch) => { storageSets.push(patch); }
        }
      },
      tabs: { create: async () => {} }
    }
  };
  vm.runInNewContext(INIT_CONFIG_SOURCE, context, { filename: 'init-config.js' });
  if (typeof installListener !== 'function') return { patch: null, defaultConfig: null };
  await installListener({ reason: 'install' });
  const patch = storageSets.find((set) => set && Object.prototype.hasOwnProperty.call(set, 'modelProvider')) || null;
  const defaultConfig = context.window.initConfig ? context.window.initConfig.defaultConfig : null;
  return { patch, defaultConfig };
}

function loadOptionsDefaultSettings() {
  const literal = sliceBetween(OPTIONS_SOURCE, 'const defaultSettings = {', '\n};\n');
  if (literal === null) return null;
  return vm.runInNewContext('(' + literal.slice('const defaultSettings = '.length) + '\n})', {}, { filename: 'options.js defaultSettings' });
}

(async () => {
  console.log('--- Phase 68 Plan 01: the fast-mode switch (fsbJevFastModeEnabled) ---');

  const configModule = require('../extension/config/config.js');
  const schema = configModule.FsbSettingsSchema;

  // -------------------------------------------------------------------------
  section('schema');
  // -------------------------------------------------------------------------
  const entry = schema.get(KEY);
  ok(entry !== null && sameJson({ ...entry }, { key: KEY, type: 'boolean', cls: 'writable', default: false }),
    'FsbSettingsSchema.get(fsbJevFastModeEnabled) is {key, type:boolean, cls:writable, default:false}');
  const keys = schema.keys();
  ok(keys[keys.length - 1] === KEY, 'fsbJevFastModeEnabled is the last schema entry');
  ok(keys.length === 36, 'keys().length is 36 (got ' + keys.length + ')');
  ok(keys.filter((k) => schema.isWritable(k)).length === 25, '25 keys are writable');
  ok(schema.isWritable(KEY) === true, 'fsbJevFastModeEnabled is writable over MCP');
  ok(schema.readOnlyKeys().length === 11 && !schema.readOnlyKeys().includes(KEY), 'readOnlyKeys() stays at 11 and excludes the switch');
  ok(sameJson(schema.parseValue(KEY, 'true'), { ok: true, value: true }), "parseValue(fsbJevFastModeEnabled, 'true') is {ok:true, value:true}");
  ok(sameJson(schema.parseValue(KEY, 'false'), { ok: true, value: false }), "parseValue(fsbJevFastModeEnabled, 'false') is {ok:true, value:false}");
  const yes = schema.parseValue(KEY, 'yes');
  ok(yes && yes.ok === false && yes.code === schema.CODES.VALUE_INVALID, "parseValue(fsbJevFastModeEnabled, 'yes') fails VALUE_INVALID");
  ok(schema.projectAll({}, {}).settings[KEY] === false, 'an empty store reads the switch as false');
  ok(!keys.includes('speedMode') && !keys.includes('fsbFixtureFastMode'), 'neither speedMode nor the fsbFixtureFastMode fixture is a production key');

  // -------------------------------------------------------------------------
  section('default copies');
  // -------------------------------------------------------------------------
  const ConfigClass = configModule.Config;
  ok(new ConfigClass().defaults[KEY] === false, 'new Config().defaults.fsbJevFastModeEnabled === false');
  const init = await loadInitConfigProductionDefaults();
  ok(init.patch !== null && init.patch[KEY] === false, "init-config.js's production install patch holds fsbJevFastModeEnabled: false");
  ok(init.defaultConfig !== null && init.defaultConfig[KEY] === false, 'init-config.js defaultConfig holds fsbJevFastModeEnabled: false');
  const optionsDefaults = loadOptionsDefaultSettings();
  ok(optionsDefaults !== null && optionsDefaults[KEY] === false, 'options.js defaultSettings.fsbJevFastModeEnabled === false');
  const divergences = sliceBetween(SCHEMA_TEST_SOURCE, 'const KNOWN_DEFAULT_DIVERGENCES = {', '\n};\n');
  ok(divergences !== null && !divergences.includes(KEY), 'KNOWN_DEFAULT_DIVERGENCES gains no entry for the switch');

  // -------------------------------------------------------------------------
  section('options.js wiring');
  // -------------------------------------------------------------------------
  const defaultsLiteral = sliceBetween(OPTIONS_SOURCE, 'const defaultSettings = {', '\n};\n') || '';
  ok(/\n\s*fsbJevFastModeEnabled\s*:\s*false\s*,/.test(defaultsLiteral), 'defaultSettings declares fsbJevFastModeEnabled: false');
  ok(/elements\.fsbJevFastModeEnabled\s*=\s*document\.getElementById\(['"]fsbJevFastModeEnabled['"]\)/.test(OPTIONS_SOURCE),
    'cacheElements wires elements.fsbJevFastModeEnabled');
  ok(/if \(elements\.fsbJevFastModeEnabled\) \{\s*elements\.fsbJevFastModeEnabled\.addEventListener\(['"]change['"],\s*\(\)\s*=>\s*\{\s*markUnsavedChanges\(\);/.test(OPTIONS_SOURCE),
    'setupEventListeners attaches a null-guarded change handler that calls markUnsavedChanges()');
  ok(/if \(elements\.fsbJevFastModeEnabled\) \{\s*elements\.fsbJevFastModeEnabled\.checked = settings\.fsbJevFastModeEnabled \?\? false;\s*\}/.test(OPTIONS_SOURCE),
    'loadSettings sets .checked = settings.fsbJevFastModeEnabled ?? false inside a null guard');
  const saveBody = sliceBetween(OPTIONS_SOURCE, 'function saveSettings() {', 'function discardChanges() {') || '';
  const saveObject = sliceBetween(saveBody, '  const settings = {\n', '\n  };\n') || '';
  ok(saveObject.split('\n    fsbJevFastModeEnabled: elements.fsbJevFastModeEnabled?.checked ?? false,').length - 1 === 1,
    'saveSettings writes fsbJevFastModeEnabled: elements.fsbJevFastModeEnabled?.checked ?? false exactly once');
  ok(/fsbChangeReportsEnabled: elements\.fsbChangeReportsEnabled\?\.checked \?\? true,\n\s*fsbJevFastModeEnabled: elements\.fsbJevFastModeEnabled\?\.checked \?\? false,/.test(saveObject),
    'the save line sits right after the fsbChangeReportsEnabled line');
  ok(OPTIONS_SOURCE.split("    fsbJevFastModeEnabled: (value, deps) => setControlChecked(deps, 'fsbJevFastModeEnabled', value === true),").length - 1 === 1,
    'FIELD_REFRESHERS holds one fsbJevFastModeEnabled refresher (checked only for a stored true)');
  ok(OPTIONS_SOURCE.split('\n').filter((line) => line.includes('speedMode') && line.includes(KEY)).length === 0,
    'no speedMode line mentions the switch');
  ok((OPTIONS_SOURCE.match(/fsbJevFastModeEnabled/g) || []).length >= 5, 'options.js names the switch at least five times');

  // -------------------------------------------------------------------------
  section('panel sync (FSBSettingsSync)');
  // -------------------------------------------------------------------------
  global.FsbSettingsSchema = schema;
  global.config = {
    availableModels: { xai: [], gemini: [], openai: [], anthropic: [], openrouter: [], lmstudio: [] }
  };
  delete require.cache[require.resolve(OPTIONS_PATH)];
  installShims();
  require(OPTIONS_PATH);
  const sync = global.FSBSettingsSync;
  ok(sync !== null && typeof sync === 'object', 'requiring options.js exposes FSBSettingsSync');

  ok(sync.keyForElementId(KEY) === KEY, 'keyForElementId(fsbJevFastModeEnabled) -> fsbJevFastModeEnabled (no alias)');

  sync.reset({ [KEY]: false });
  const changed = sync.noteStorageChanges({ [KEY]: { oldValue: false, newValue: true } }, 'local');
  ok(sameJson(changed.apply, { [KEY]: true }), 'an untouched external write is applied: apply is {fsbJevFastModeEnabled: true}');

  buildRegistry(true);
  dispatchCount = 0;
  const applied = sync.applyToForm(changed.apply, simpleDeps());
  ok(sameJson(applied, [KEY]), 'applyToForm refreshes the switch in place');
  ok(registry.get(KEY).checked === true, 'the checkbox is now checked');
  ok(dispatchCount === 0, 'the refresh dispatches no event');

  const builtWhileUnchecked = { debugMode: false, [KEY]: false };
  const dropped = sync.filterForSave(builtWhileUnchecked);
  ok(dropped.includes(KEY) && !Object.prototype.hasOwnProperty.call(builtWhileUnchecked, KEY),
    'filterForSave deletes the switch from a Save built while the box was still unchecked (Save never reverts it)');

  sync.reset({ [KEY]: false });
  sync.noteTouched(KEY);
  const touchedChange = sync.noteStorageChanges({ [KEY]: { oldValue: false, newValue: true } }, 'local');
  ok(sameJson(touchedChange.apply, {}), 'after noteTouched the external write is not applied');
  const userEdit = { [KEY]: false };
  ok(sync.filterForSave(userEdit).length === 0 && userEdit[KEY] === false, "after noteTouched the user's edit wins at Save");

  buildRegistry(true);
  registry.get(KEY).checked = true;
  sync.applyToForm({ [KEY]: undefined }, simpleDeps());
  ok(registry.get(KEY).checked === false, 'a removed key refreshes to the default (unchecked)');
  registry.get(KEY).checked = true;
  sync.applyToForm({ [KEY]: 'yes' }, simpleDeps());
  ok(registry.get(KEY).checked === false, 'only a stored boolean true checks the box');

  buildRegistry(false);
  let threw = null;
  let appliedWithoutElement = null;
  try {
    appliedWithoutElement = sync.applyToForm({ [KEY]: true }, simpleDeps());
  } catch (error) {
    threw = error;
  }
  ok(threw === null && sameJson(appliedWithoutElement, [KEY]), 'with no checkbox in the page (before plan 68-12) the refresh is a safe no-op');
  ok(fetchCalls === 0, 'no network call was made');
  sync.reset({});

  // -------------------------------------------------------------------------
  section('copy accuracy (plan 68-12: each never-sent claim is enforced by code)');
  // -------------------------------------------------------------------------
  // The disclosure facts are characterization guards: they pass against the
  // current request builder and content-side proofs, so a later change that
  // makes a claim false fails here before the copy can drift from the code.
  const facts = require('./fixtures/jev-fast-disclosure-facts.js');
  const jevState = require('../extension/ai/jev-state.js');
  const requestCases = require('./fixtures/jev-request-cases.js');

  ok(typeof jevState.buildRequest === 'function' && jevState.CONTRACT && Array.isArray(jevState.CONTRACT.KEYS.element),
    'require(extension/ai/jev-state.js) is the FsbJevState api with buildRequest and CONTRACT.KEYS.element');
  ok(Array.isArray(facts.SHARED_PHRASES) && facts.SHARED_PHRASES.length >= 28 && typeof facts.textOf === 'function',
    'the fact list exports at least 28 SHARED_PHRASES and textOf()');

  const DROPPED_MARKERS = ['SECRET-PW-LABEL', 'SECRET-HIDDEN-LABEL', 'SECRET-FILE-LABEL', 'SECRET-CC-LABEL',
    'SECRET-OTP-LABEL', 'SECRET-NEWPW-LABEL', 'SECRET-SENSITIVE-LABEL', 'SECRET-VAULT-LABEL'];
  const pageInput = () => ({
    kinds: ['operation', 'target'],
    goal: 'Open the Bravo product page',
    url: 'https://shop.test/a/b?q=SECRET-QUERY#SECRET-FRAG',
    title: 'Shop',
    visibleText: 'Products: Alpha, Bravo',
    elements: [
      { id: 'pw', role: 'textbox', label: 'Password SECRET-PW-LABEL', ops: ['click', 'type_text'], inputType: 'password' },
      { id: 'hid', role: 'textbox', label: 'Token SECRET-HIDDEN-LABEL', ops: ['click'], inputType: 'hidden' },
      { id: 'upload', role: 'button', label: 'Upload SECRET-FILE-LABEL', ops: ['click'], inputType: 'file' },
      { id: 'card', role: 'textbox', label: 'Card SECRET-CC-LABEL', ops: ['click', 'type_text'], autocomplete: 'cc-number' },
      { id: 'otp', role: 'textbox', label: 'Code SECRET-OTP-LABEL', ops: ['click', 'type_text'], autocomplete: 'one-time-code' },
      { id: 'newpw', role: 'textbox', label: 'New password SECRET-NEWPW-LABEL', ops: ['click', 'type_text'], autocomplete: 'new-password' },
      { id: 'sensitive', role: 'textbox', label: 'Account SECRET-SENSITIVE-LABEL', ops: ['click'], purpose: { sensitive: true } },
      { id: 'vaulted', role: 'textbox', label: 'Email SECRET-VAULT-LABEL', ops: ['click', 'type_text'] },
      { id: 'alpha', role: 'link', label: 'Alpha', ops: ['click'], value: 'SECRET-ELEMENT-VALUE', cookie: 'SECRET-COOKIE' },
      { id: 'bravo', role: 'link', label: 'Bravo', ops: ['click'] }
    ],
    vaultFilledIds: ['vaulted'],
    recentActions: [],
    offeredOps: ['click']
  });

  const built = jevState.buildRequest(pageInput());
  ok(built && built.ok === true && built.request && typeof built.request === 'object',
    'buildRequest with password, hidden, file, cc-number, one-time-code, new-password, sensitive and vault-filled fields plus two ordinary links returns ok');
  const request = built && built.ok ? built.request : { elements: [], page: {} };
  const requestJson = JSON.stringify(request);
  ok(request.elements.length === 2 && sameJson(built.idMap, { e0: 'alpha', e1: 'bravo' })
    && sameJson(request.elements.map((e) => e.label), ['Alpha', 'Bravo']),
  'only the two ordinary entries remain (idMap {e0: alpha, e1: bravo})');
  ok(built && built.ok && built.stats.dropped.sensitive === 8, 'buildRequest reports all eight sensitive fields dropped');
  ok(DROPPED_MARKERS.every((marker) => !requestJson.includes(marker)),
    'no dropped field (password, hidden, file, payment, one-time-code, new-password, sensitive, saved-password fill) reaches the request');
  const allowedElementKeys = jevState.CONTRACT.KEYS.element;
  ok(request.elements.every((e) => Object.keys(e).every((k) => allowedElementKeys.includes(k))),
    'every request element carries only CONTRACT.KEYS.element keys (' + allowedElementKeys.join(', ') + ')');
  ok(!requestJson.includes('SECRET-QUERY') && !requestJson.includes('SECRET-FRAG'),
    'neither the query string nor the fragment of the page address is sent');
  ok(request.page.path === '/a/b' && request.page.origin === 'https://shop.test',
    "the page address is sent as origin 'https://shop.test' and path '/a/b' only");
  const requestKeys = [];
  (function collectKeys(value) {
    if (Array.isArray(value)) { value.forEach(collectKeys); return; }
    if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value)) { requestKeys.push(key); collectKeys(value[key]); }
    }
  })(request);
  ok(requestKeys.length > 0 && requestKeys.every((key) => !/^(value|values|cookie|cookies)$/i.test(key)),
    'no key named value or cookie appears anywhere in the request');
  ok(!requestJson.includes('SECRET-ELEMENT-VALUE') && !requestJson.includes('SECRET-COOKIE'),
    'a value or cookie carried on an ordinary entry is never copied into the request');

  const secretCase = requestCases.INVALID_CASES.find((c) => c.reason === 'sensitive_goal' && /sk-/.test(c.request.goal));
  const secretToken = secretCase ? (secretCase.request.goal.match(/sk-[A-Za-z0-9]+/) || [''])[0] : '';
  ok(secretToken.length > 10 && jevState.matchesSecret(secretToken) === true,
    'the secret sample comes from tests/fixtures/jev-request-cases.js and the scrubber matches it (' + secretToken.slice(0, 6) + '...)');
  const goalInput = pageInput();
  goalInput.goal = 'Sign in with ' + secretToken + ' then open Bravo';
  const goalResult = jevState.buildRequest(goalInput);
  ok(sameJson(goalResult, { ok: false, reason: 'sensitive_goal' }),
    "a task text holding a secret returns {ok:false, reason:'sensitive_goal'}: nothing is sent for that task");
  const textInput = pageInput();
  textInput.visibleText = 'Your key is ' + secretToken + ' keep it safe';
  const textResult = jevState.buildRequest(textInput);
  ok(textResult && textResult.ok === true && !JSON.stringify(textResult.request).includes(secretToken)
    && typeof textResult.request.page.text === 'string' && textResult.request.page.text.includes('keep it safe'),
  'a secret in the visible-text excerpt is removed before the request is built (the rest of the excerpt stays)');

  ok(Array.isArray(facts.ENFORCEMENT) && facts.ENFORCEMENT.length === 4
    && sameJson(facts.ENFORCEMENT.map((e) => e.fact), ['typed', 'field value', 'saved', 'one step description']),
  'ENFORCEMENT ties the typed, field value, saved and one-step-description facts to their proofs');
  for (const entry of facts.ENFORCEMENT) {
    const abs = path.join(ROOT, entry.file);
    const exists = fs.existsSync(abs);
    const source = exists ? fs.readFileSync(abs, 'utf8') : '';
    ok(exists && entry.markers.length > 0 && entry.markers.every((marker) => source.includes(marker)),
      "the '" + entry.fact + "' claim is backed by " + entry.file + ' (' + entry.markers.join(', ') + ')');
    ok(facts.SHARED_PHRASES.some((phrase) => phrase.toLowerCase() === entry.fact.toLowerCase()),
      "the enforced fact '" + entry.fact + "' is one of the SHARED_PHRASES");
  }

  const plantedForbidden = ['FSB never reads what you typed into them.', 'TypeSafe does not retain requests.', 'Never sent: passwords.'];
  facts.FORBIDDEN_PATTERNS.forEach((re, index) => {
    ok(plantedForbidden.some((sentence) => re.test(sentence)),
      'FORBIDDEN_PATTERNS[' + index + '] ' + re + ' fires on a planted sentence');
  });
  ok(plantedForbidden.every((sentence) => facts.FORBIDDEN_PATTERNS.some((re) => re.test(sentence))),
    'every planted forbidden sentence is caught');
  const scopedForms = ["Never sent to FSB's server: passwords.", 'fast mode leaves out form fields',
    "FSB's server keeps no page content.", 'TypeSafe AI keeps data as long as reasonably necessary to provide its services.'];
  ok(scopedForms.every((sentence) => facts.FORBIDDEN_PATTERNS.every((re) => !re.test(sentence))),
    'no FORBIDDEN_PATTERNS entry fires on the scoped forms');
  ok(facts.textOf('<p>FSB&#39;s <span translate="no">server</span>&nbsp;keeps &amp; <!-- note -->drops</p>') === "FSB's server keeps & drops"
    && facts.textOf('<b>FSB&rsquo;s</b>\n  <i>server&apos;s</i>') === "FSB's server's",
  'textOf removes tags and comments, decodes the apostrophe, ampersand and nbsp entities and collapses whitespace');

  // -------------------------------------------------------------------------
  section('card (plan 68-12: the Advanced Settings switch and its D-06 disclosure)');
  // -------------------------------------------------------------------------
  const PANEL_HTML = readRepo('extension/ui/control_panel.html');
  const CARD_START = 'id="fsbJevFastModeCard"';
  const CARD_END = '<!-- /fsbJevFastModeCard -->';
  const countOf = (text, needle) => text.split(needle).length - 1;
  const lineAt = (text, index) => (index < 0 ? -1 : text.slice(0, index).split('\n').length);

  ok(countOf(PANEL_HTML, 'id="fsbJevFastModeEnabled"') === 1, 'control_panel.html holds exactly one id="fsbJevFastModeEnabled"');
  ok(countOf(PANEL_HTML, CARD_START) === 1 && countOf(PANEL_HTML, CARD_END) === 1,
    'control_panel.html holds exactly one card start (id="fsbJevFastModeCard") and one closing comment <!-- /fsbJevFastModeCard -->');
  const cardIdIndex = PANEL_HTML.indexOf(CARD_START);
  const cardEndIndex = PANEL_HTML.indexOf(CARD_END);
  const cardRootIndex = cardIdIndex === -1 ? -1 : PANEL_HTML.lastIndexOf('<', cardIdIndex);
  const cardBlock = cardRootIndex !== -1 && cardEndIndex > cardIdIndex
    ? PANEL_HTML.slice(cardRootIndex, cardEndIndex + CARD_END.length)
    : '';
  ok(cardBlock.startsWith('<div class="settings-card" id="fsbJevFastModeCard">'),
    'the card root is <div class="settings-card" id="fsbJevFastModeCard">');
  const checkbox = (cardBlock.match(/<input\b[^>]*\bid="fsbJevFastModeEnabled"[^>]*>/) || [''])[0];
  ok(checkbox === '<input type="checkbox" id="fsbJevFastModeEnabled">',
    'the card holds <input type="checkbox" id="fsbJevFastModeEnabled"> (got ' + JSON.stringify(checkbox) + ')');
  ok(checkbox !== '' && !/\bchecked\b/i.test(checkbox) && !/<input[^>]*id="fsbJevFastModeEnabled"[^>]*checked/i.test(PANEL_HTML),
    'the checkbox carries no checked attribute (the switch is off by default)');
  ok(/<label class="modern-toggle">\s*<input type="checkbox" id="fsbJevFastModeEnabled">/.test(cardBlock),
    'the checkbox sits in a modern-toggle label, like the Action Change Reports card');

  const changeReportsLine = lineAt(PANEL_HTML, PANEL_HTML.indexOf('id="fsbChangeReportsEnabled"'));
  const replayLine = lineAt(PANEL_HTML, PANEL_HTML.indexOf('id="mcpSessionReplaySettings"'));
  const cardStartLine = lineAt(PANEL_HTML, cardIdIndex);
  const cardEndLine = lineAt(PANEL_HTML, cardEndIndex);
  ok(changeReportsLine > 0 && cardStartLine > changeReportsLine && cardEndLine > cardStartLine && replayLine > cardEndLine,
    'the card sits after the Action Change Reports card and before #mcpSessionReplaySettings (lines '
    + changeReportsLine + ' < ' + cardStartLine + '..' + cardEndLine + ' < ' + replayLine + ')');
  const between = cardRootIndex > 0 ? PANEL_HTML.slice(PANEL_HTML.indexOf('id="fsbChangeReportsEnabled"'), cardRootIndex) : '';
  ok(between !== '' && countOf(between, 'class="settings-card') === 0 && countOf(between, 'class="adv-sub"') === 0,
    'no other card or sub-header sits between Action Change Reports and the fast-mode card');
  const afterCard = cardEndIndex > 0 ? PANEL_HTML.slice(cardEndIndex + CARD_END.length) : '';
  ok(/^\s*<div class="settings-card full-width" id="mcpSessionReplaySettings">/.test(afterCard),
    'the MCP Session Replay card follows the closing comment directly');

  ok(/<i class="fas fa-bolt"><\/i>/.test(cardBlock), 'the card icon is fas fa-bolt');
  ok(/<h3>Jev fast mode \(experimental\)<\/h3>/.test(cardBlock), 'the card title is "Jev fast mode (experimental)"');
  ok(/<p>Faster simple clicks during autopilot<\/p>/.test(cardBlock), 'the card subtitle is "Faster simple clicks during autopilot"');
  ok(/<span class="toggle-label">Use Jev for simple steps<\/span>/.test(cardBlock), 'the toggle label is "Use Jev for simple steps"');

  const cardText = facts.textOf(cardBlock);
  const lowerCardText = cardText.toLowerCase();
  const missingShared = facts.SHARED_PHRASES.filter((phrase) => !lowerCardText.includes(phrase.toLowerCase()));
  ok(cardText.length > 0 && missingShared.length === 0,
    'the card text holds every SHARED_PHRASES entry (' + facts.SHARED_PHRASES.length + '; missing: ' + (missingShared.join(' | ') || 'none') + ')');
  const missingCardOnly = facts.CARD_ONLY_PHRASES.filter((phrase) => !lowerCardText.includes(phrase.toLowerCase()));
  ok(missingCardOnly.length === 0, 'the card text holds every CARD_ONLY_PHRASES entry (missing: ' + (missingCardOnly.join(' | ') || 'none') + ')');
  ok(cardText.includes("Never sent to FSB's server"), 'the never-sent list is headed "Never sent to FSB\'s server"');
  ok(cardText.includes("Sent to FSB's server"), 'the sent list is headed "Sent to FSB\'s server"');
  const firedForbidden = facts.FORBIDDEN_PATTERNS.filter((re) => re.test(cardText)).map(String);
  ok(firedForbidden.length === 0, 'the card text matches no FORBIDDEN_PATTERNS entry (' + (firedForbidden.join(', ') || 'none') + ')');
  ok(/^Off by default\./.test(facts.textOf((cardBlock.match(/<span class="toggle-desc">[\s\S]*?<\/span>/) || [''])[0])),
    'the toggle description opens with "Off by default."');

  const toggleLabel = (cardBlock.match(/<label class="modern-toggle">[\s\S]*?<\/label>/) || [''])[0];
  ok(toggleLabel !== '' && !facts.textOf(toggleLabel).includes("Never sent to FSB's server")
    && !facts.textOf(toggleLabel).includes("Sent to FSB's server"),
  'the sent and never-sent lists sit outside the toggle label, so reading or clicking them cannot flip the switch');
  ok(!/<button\b|<script\b|<a\b|<form\b|<iframe\b|<img\b/i.test(cardBlock), 'the card holds no button, script, link, form, frame or image');
  ok(!/\bid="(?!fsbJevFastModeCard"|fsbJevFastModeEnabled")[^"]*"/.test(cardBlock),
    'the card has no element id besides the card root and the checkbox (no status line)');
  ok(!/class="[^"]*status[^"]*"/i.test(cardBlock) && !/\baria-live\b|\brole="status"/i.test(cardBlock),
    'the card has no status element or live region (D-06: no live status)');
  ok(!/[a-z][a-z0-9+.-]*:\/\//i.test(cardBlock), 'the card names no URL, so the panel makes no network call for it');
  ok(!/[\u{10000}-\u{10FFFF}]/u.test(cardBlock), 'the card holds no emoji');

  // -------------------------------------------------------------------------
  section('registration');
  // -------------------------------------------------------------------------
  const pkg = JSON.parse(readRepo('package.json'));
  ok(pkg.scripts.test.split(' && ').filter((cmd) => cmd === 'node tests/jev-fast-settings.test.js').length === 1,
    'package.json test chain runs this suite exactly once');
  const contract = readRepo('tests/delegation-phase-contract.test.js');
  ok(contract.split("'node tests/jev-fast-settings.test.js',").length - 1 === 1,
    'REFINEMENT_ROOT_TEST_COMMANDS lists this suite exactly once');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
