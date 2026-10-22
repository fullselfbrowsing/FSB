'use strict';

/**
 * Phase 66.1 settings schema (globalThis.FsbSettingsSchema in
 * extension/config/config.js): the single source of truth for MCP settings
 * reads and writes (D-08).
 *
 * Covers the 36-key contract (D-09), secret masking (D-10), origin-only
 * endpoint reads (D-11), effective defaults and read purity (D-12), strict
 * value-free parsing (D-04, D-14), the test-only fixture factory (D-17) and
 * the config.js scope safety the service worker depends on.
 *
 * Node 20-safe: fs, path, vm and assert only; no ports, no global WebSocket.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CONFIG_PATH = path.join(__dirname, '..', 'extension', 'config', 'config.js');
const CONFIG_SOURCE = fs.readFileSync(CONFIG_PATH, 'utf8');
const configModule = require(CONFIG_PATH);
const { Config, config } = configModule;
const schema = configModule.FsbSettingsSchema;

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function isDeepEqual(actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    return true;
  } catch (_e) {
    return false;
  }
}

function checkDeep(actual, expected, msg) {
  const ok = isDeepEqual(actual, expected);
  check(ok, ok ? msg : `${msg} (got ${JSON.stringify(actual)})`);
}

function throwsTypeError(fn) {
  try {
    fn();
    return false;
  } catch (err) {
    return err instanceof TypeError;
  }
}

// ---------------------------------------------------------------------------
// The SETTINGS CONTRACT shared by plans 66.1-01..08 (D-09 order: the
// saveSettings object order, then the four other control-panel writers).
// ---------------------------------------------------------------------------
const PROVIDER_IDS = ['xai', 'gemini', 'openai', 'anthropic', 'openrouter', 'lmstudio', 'custom'];
const EXPECTED_ENTRIES = [
  { key: 'providerKind', type: 'enum', cls: 'writable', default: 'api', values: ['api', 'agent'], group: 'provider' },
  { key: 'agentProviderId', type: 'string', cls: 'writable', default: '', maxLength: 64, group: 'provider' },
  { key: 'modelProvider', type: 'enum', cls: 'writable', default: 'xai', values: PROVIDER_IDS, group: 'provider' },
  { key: 'modelName', type: 'string', cls: 'writable', default: 'grok-4-1-fast', maxLength: 200, group: 'provider' },
  { key: 'apiKey', type: 'string', cls: 'secret', default: '' },
  { key: 'geminiApiKey', type: 'string', cls: 'secret', default: '' },
  { key: 'openaiApiKey', type: 'string', cls: 'secret', default: '' },
  { key: 'anthropicApiKey', type: 'string', cls: 'secret', default: '' },
  { key: 'customApiKey', type: 'string', cls: 'secret', default: '' },
  { key: 'customEndpoint', type: 'string', cls: 'endpoint', default: '' },
  { key: 'openrouterApiKey', type: 'string', cls: 'secret', default: '' },
  { key: 'lmstudioBaseUrl', type: 'string', cls: 'endpoint', default: 'http://localhost:1234' },
  { key: 'maxIterations', type: 'integer', cls: 'writable', default: 100, min: 50, max: 500 },
  { key: 'debugMode', type: 'boolean', cls: 'writable', default: false },
  { key: 'domOptimization', type: 'boolean', cls: 'writable', default: true },
  { key: 'maxDOMElements', type: 'integer', cls: 'writable', default: 2000, min: 500, max: 5000 },
  { key: 'elementCacheSize', type: 'integer', cls: 'writable', default: 200, min: 10, max: 1000 },
  { key: 'prioritizeViewport', type: 'boolean', cls: 'writable', default: true },
  { key: 'animatedActionHighlights', type: 'boolean', cls: 'writable', default: true },
  { key: 'showSidepanelProgress', type: 'boolean', cls: 'writable', default: true },
  { key: 'enableLogin', type: 'boolean', cls: 'writable', default: false },
  { key: 'captchaSolverEnabled', type: 'boolean', cls: 'writable', default: false },
  { key: 'captchaApiKey', type: 'string', cls: 'secret', default: '' },
  { key: 'sttProvider', type: 'enum', cls: 'writable', default: 'browser', values: ['browser', 'whisper'] },
  { key: 'voiceInputEnabled', type: 'boolean', cls: 'writable', default: true },
  { key: 'autoRefineSiteMaps', type: 'boolean', cls: 'writable', default: true },
  { key: 'fsbAgentCap', type: 'integer', cls: 'writable', default: { from: 'agentCapRecommendation' }, min: 1, max: 64 },
  { key: 'fsbTriggerCap', type: 'integer', cls: 'writable', default: 8, min: 1, max: 64 },
  { key: 'fsbChangeReportsEnabled', type: 'boolean', cls: 'writable', default: true },
  { key: 'fsbMcpSessionRecordingEnabled', type: 'boolean', cls: 'writable', default: true },
  { key: 'fsbMcpSessionRetentionDays', type: 'integer', cls: 'writable', default: 30, min: 1, max: 365 },
  { key: 'autoAnalyzeMemories', type: 'boolean', cls: 'writable', default: true },
  { key: 'fsbTelemetryOptOut', type: 'boolean', cls: 'writable', default: false },
  { key: 'serverUrl', type: 'string', cls: 'endpoint', default: 'https://full-selfbrowsing.com' },
  { key: 'serverHashKey', type: 'string', cls: 'secret', default: '' },
  { key: 'fsbJevFastModeEnabled', type: 'boolean', cls: 'writable', default: false },
];
const EXPECTED_KEYS = EXPECTED_ENTRIES.map((entry) => entry.key);
const SECRET_KEYS = ['apiKey', 'geminiApiKey', 'openaiApiKey', 'anthropicApiKey', 'openrouterApiKey', 'customApiKey', 'captchaApiKey', 'serverHashKey'];
const ENDPOINT_KEYS = ['customEndpoint', 'lmstudioBaseUrl', 'serverUrl'];
const EXPECTED_READ_ONLY = EXPECTED_KEYS.filter((key) => SECRET_KEYS.includes(key) || ENDPOINT_KEYS.includes(key));
const PROVIDER_GROUP_KEYS = ['providerKind', 'agentProviderId', 'modelProvider', 'modelName'];
const ALLOWED_FIELDS = ['key', 'type', 'cls', 'default', 'min', 'max', 'values', 'maxLength', 'group'];

// Snapshot of Config.defaults before Phase 66.1 (D-08 keeps all three default
// copies unchanged; the effective-default divergences are pinned in 66.1-02),
// plus the Phase 68 fast-mode switch, whose false default 68 D-04 adds to all
// three copies in the commit that adds its schema entry.
const CONFIG_DEFAULTS_SNAPSHOT = {
  providerKind: 'api',
  agentProviderId: '',
  modelProvider: 'xai',
  modelName: 'grok-4-1-fast',
  apiKey: '',
  geminiApiKey: '',
  openaiApiKey: '',
  anthropicApiKey: '',
  openrouterApiKey: '',
  customApiKey: '',
  customEndpoint: '',
  lmstudioBaseUrl: 'http://localhost:1234',
  speedMode: 'normal',
  maxIterations: 100,
  debugMode: false,
  domOptimization: true,
  maxDOMElements: 2000,
  elementCacheSize: 200,
  prioritizeViewport: true,
  animatedActionHighlights: true,
  showSidepanelProgress: false,
  fsbJevFastModeEnabled: false,
  enableLogin: false,
  enableSavedPayments: false,
  captchaSolverEnabled: false,
  captchaApiKey: '',
  serverUrl: 'https://fsb-server.fly.dev',
  serverHashKey: '',
  serverSyncEnabled: false,
};

console.log('\n--- exports ---');
check(typeof Config === 'function', 'config.js still exports the Config class');
check(config instanceof Config, 'config.js still exports the config singleton');
check(schema !== null && typeof schema === 'object', 'config.js exports FsbSettingsSchema on module.exports');
check(Boolean(schema) && globalThis.FsbSettingsSchema === schema, 'globalThis.FsbSettingsSchema is the exported schema');
checkDeep(new Config().defaults, CONFIG_DEFAULTS_SNAPSHOT, 'new Config().defaults is unchanged');
check(Boolean(schema) && Object.isFrozen(schema), 'the production schema object is frozen');

if (!schema) {
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
}

console.log('\n--- statics ---');
checkDeep({ ...schema.CODES }, {
  REQUEST_INVALID: 'SETTING_REQUEST_INVALID',
  UNKNOWN_KEY: 'SETTING_UNKNOWN_KEY',
  PROTECTED_KEY: 'SETTING_PROTECTED_KEY',
  VALUE_INVALID: 'SETTING_VALUE_INVALID',
  PROVIDER_NOT_READY: 'SETTING_PROVIDER_NOT_READY',
  DELEGATED_WRITE_REFUSED: 'SETTING_DELEGATED_WRITE_REFUSED',
  UNSUPPORTED: 'SETTING_UNSUPPORTED',
  STORAGE_FAILED: 'SETTING_STORAGE_FAILED',
}, 'CODES lists the eight SETTING_ codes');
check(Object.isFrozen(schema.CODES), 'CODES is frozen');
check(schema.KEY_PATTERN instanceof RegExp && schema.KEY_PATTERN.source === '^[A-Za-z][A-Za-z0-9_]{0,63}$'
  && schema.KEY_PATTERN.flags === '', 'KEY_PATTERN is /^[A-Za-z][A-Za-z0-9_]{0,63}$/');
check(schema.KEY_PATTERN.test('apiKey') && !schema.KEY_PATTERN.test('1abc'), 'KEY_PATTERN still matches after export');
check(schema.VALUE_MAX_LENGTH === 2048, 'VALUE_MAX_LENGTH is 2048');
check(schema.MODEL_LIST_CAP === 25, 'MODEL_LIST_CAP is 25');
checkDeep([...schema.PROVIDERS], PROVIDER_IDS, 'PROVIDERS lists the seven provider ids in order');
check(Object.isFrozen(schema.PROVIDERS), 'PROVIDERS is frozen');
for (const name of ['create', 'originOnly', 'safeKeyLabel']) {
  check(typeof schema[name] === 'function', `static ${name} is a function`);
}

console.log('\n--- the 36-key contract (D-09) ---');
checkDeep(schema.keys(), EXPECTED_KEYS, 'keys() lists the 36 contract keys in order');
check(schema.keys().length === 36, 'there are exactly 36 keys');
checkDeep(schema.readOnlyKeys(), EXPECTED_READ_ONLY, 'readOnlyKeys() lists the 8 secrets and 3 endpoints in entry order');
check(schema.readOnlyKeys().length === 11, 'there are exactly 11 read-only keys');
check(schema.keys().filter((key) => schema.isWritable(key)).length === 25, '25 keys are writable');
check(schema.entries.length === 36, 'entries holds 36 entries');
EXPECTED_ENTRIES.forEach((expected, index) => {
  const entry = schema.entries[index];
  checkDeep({ ...entry }, expected, `entry ${index + 1} ${expected.key} matches the contract`);
});
check(schema.entries.filter((entry) => entry.cls === 'secret').map((entry) => entry.key).sort().join(',')
  === [...SECRET_KEYS].sort().join(','), 'the secret class holds exactly the eight D-10 keys');
check(schema.entries.filter((entry) => entry.cls === 'endpoint').map((entry) => entry.key).join(',')
  === ENDPOINT_KEYS.join(','), 'the endpoint class holds exactly the three D-11 keys');

console.log('\n--- entry shape ---');
for (const entry of schema.entries) {
  const fields = Object.keys(entry);
  const label = entry.key;
  check(fields.every((field) => ALLOWED_FIELDS.includes(field)), `${label} uses allowed fields only`);
  check(['boolean', 'integer', 'enum', 'string'].includes(entry.type), `${label} has a known type`);
  check(['writable', 'secret', 'endpoint'].includes(entry.cls), `${label} has a known class`);
  check(schema.KEY_PATTERN.test(entry.key), `${label} matches KEY_PATTERN`);
  if (entry.cls !== 'writable') check(entry.type === 'string', `${label} (${entry.cls}) is a string`);
  if (entry.type === 'integer') {
    check(Number.isInteger(entry.min) && Number.isInteger(entry.max) && entry.min <= entry.max, `${label} has integer bounds`);
    if (typeof entry.default === 'number') {
      check(Number.isInteger(entry.default) && entry.default >= entry.min && entry.default <= entry.max, `${label} default is inside its bounds`);
    } else {
      checkDeep({ ...entry.default }, { from: 'agentCapRecommendation' }, `${label} computed default names the agent-cap recommendation`);
      check(entry.key === 'fsbAgentCap', `${label} is the only computed default`);
    }
  } else {
    check(!('min' in entry) && !('max' in entry), `${label} has no min/max`);
  }
  if (entry.type === 'enum') {
    check(Array.isArray(entry.values) && entry.values.length > 0 && entry.values.includes(entry.default), `${label} enum default is in its values`);
  } else {
    check(!('values' in entry), `${label} has no values`);
  }
  if (entry.type === 'boolean') check(typeof entry.default === 'boolean', `${label} boolean default is boolean`);
  if (entry.type === 'string') check(typeof entry.default === 'string', `${label} string default is a string`);
  if ('maxLength' in entry) check(entry.type === 'string' && Number.isInteger(entry.maxLength) && entry.maxLength > 0, `${label} maxLength is a positive integer on a string`);
  if ('group' in entry) check(entry.group === 'provider' && PROVIDER_GROUP_KEYS.includes(entry.key), `${label} group is provider on a provider key`);
}
check(schema.entries.filter((entry) => entry.group === 'provider').map((entry) => entry.key).join(',')
  === PROVIDER_GROUP_KEYS.join(','), 'group provider is set on exactly the four provider keys');

console.log('\n--- deep freeze ---');
check(Object.isFrozen(schema.entries), 'entries is frozen');
check(schema.entries.every((entry) => Object.isFrozen(entry)), 'every entry is frozen');
check(schema.entries.filter((entry) => Array.isArray(entry.values)).every((entry) => Object.isFrozen(entry.values)), 'every values array is frozen');
check(Object.isFrozen(schema.get('fsbAgentCap').default), 'the computed default object is frozen');
check(throwsTypeError(() => { schema.entries.push({ key: 'x' }); }), 'pushing into the production entries throws in strict mode');
check(throwsTypeError(() => { schema.entries[0].key = 'hijacked'; }), 'renaming a production entry throws in strict mode');
check(throwsTypeError(() => { schema.get('sttProvider').values.push('other'); }), 'extending an enum throws in strict mode');
check(throwsTypeError(() => { schema.CODES.UNKNOWN_KEY = 'x'; }), 'CODES cannot be rewritten');
check(schema.keys().length === 36 && schema.entries[0].key === 'providerKind', 'the production schema is intact after tamper attempts');
const keysCopy = schema.keys();
keysCopy.push('extra');
check(schema.keys().length === 36, 'keys() returns a fresh array each call');

console.log('\n--- get / isWritable / safeKeyLabel ---');
check(schema.get('apiKey') === schema.entries[4], 'get(apiKey) returns its entry');
for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'unknownKey', '', 'a b']) {
  check(schema.get(name) === null, `get(${JSON.stringify(name)}) is null`);
}
for (const value of [undefined, null, 1, true, {}, ['apiKey']]) {
  check(schema.get(value) === null, `get(${JSON.stringify(value)}) is null for a non-string`);
}
check(schema.isWritable('maxIterations') === true, 'maxIterations is writable');
check(schema.isWritable('modelProvider') === true, 'modelProvider is writable (group rules apply later)');
check(schema.isWritable('apiKey') === false, 'apiKey is not writable');
check(schema.isWritable('serverUrl') === false, 'serverUrl is not writable');
check(schema.isWritable('constructor') === false, 'constructor is not writable');
check(schema.isWritable(42) === false, 'a non-string key is not writable');
check(schema.safeKeyLabel('apiKey') === 'apiKey', 'safeKeyLabel keeps a valid key');
check(schema.safeKeyLabel('a'.repeat(64)) === 'a'.repeat(64), 'safeKeyLabel keeps a 64-char key');
for (const value of ['', 'a b', '1abc', 'a'.repeat(65), '_x', 'a-b', 'key\n', undefined, null, 7, {}, ['apiKey']]) {
  check(schema.safeKeyLabel(value) === '[invalid]', `safeKeyLabel(${JSON.stringify(value)}) is [invalid]`);
}

console.log('\n--- effective defaults (D-12) ---');
const defaults = schema.projectAll({}, {});
checkDeep(Object.keys(defaults), ['settings', 'readOnly'], 'projectAll returns { settings, readOnly }');
checkDeep(Object.keys(defaults.settings), EXPECTED_KEYS, 'projectAll settings keep entry order');
checkDeep(defaults.readOnly, EXPECTED_READ_ONLY, 'projectAll readOnly lists the read-only keys');
check(defaults.settings.showSidepanelProgress === true, 'showSidepanelProgress defaults to true (effective)');
check(defaults.settings.serverUrl === 'https://full-selfbrowsing.com', 'serverUrl defaults to https://full-selfbrowsing.com');
check(defaults.settings.lmstudioBaseUrl === 'http://localhost:1234', 'lmstudioBaseUrl defaults to http://localhost:1234');
check(defaults.settings.customEndpoint === '', 'customEndpoint defaults to empty');
check(defaults.settings.autoAnalyzeMemories === true, 'autoAnalyzeMemories defaults to true');
check(defaults.settings.fsbTelemetryOptOut === false, 'fsbTelemetryOptOut defaults to false');
check(defaults.settings.fsbAgentCap === 8, 'fsbAgentCap falls back to 8 with no recommendation');
check(defaults.settings.maxIterations === 100 && defaults.settings.modelName === 'grok-4-1-fast', 'plain defaults come from the entries');
check(SECRET_KEYS.every((key) => defaults.settings[key] === ''), 'every unset secret reads as empty');
check(schema.projectAll({}, { agentCapRecommendation: 12 }).settings.fsbAgentCap === 12, 'fsbAgentCap uses a recommendation of 12');
for (const rec of [99, 0, 65, 7.5, -1, NaN, Infinity, '12', null]) {
  check(schema.effectiveDefault('fsbAgentCap', { agentCapRecommendation: rec }) === 8, `recommendation ${String(rec)} falls back to 8`);
}
check(schema.effectiveDefault('fsbAgentCap', undefined) === 8, 'a missing ctx falls back to 8');
check(schema.effectiveDefault('fsbAgentCap', { agentCapRecommendation: 1 }) === 1
  && schema.effectiveDefault('fsbAgentCap', { agentCapRecommendation: 64 }) === 64, 'recommendations 1 and 64 are used');
check(schema.effectiveDefault('maxIterations') === 100, 'effectiveDefault returns a plain default');
check(schema.effectiveDefault('nope') === undefined, 'effectiveDefault of an unknown key is undefined');
checkDeep(schema.projectAll(undefined, undefined), defaults, 'projectAll(undefined) equals projectAll({})');
check(schema.projectAll({ fsbAgentCap: 20 }, { agentCapRecommendation: 12 }).settings.fsbAgentCap === 20, 'a stored fsbAgentCap wins over the recommendation');
check(schema.projectValue('debugMode', { debugMode: true }, {}) === true, 'a stored writable value is returned as-is');
check(schema.projectValue('debugMode', { debugMode: undefined }, {}) === false, 'a stored undefined counts as absent');
check(schema.projectValue('debugMode', Object.create({ debugMode: true }), {}) === false, 'an inherited property counts as absent');
check(schema.projectValue('nope', {}, {}) === undefined, 'projectValue of an unknown key is undefined');

console.log('\n--- secrets (D-10) ---');
const SECRET_SENTINEL = 'sk-SENTINEL-abc123';
check(schema.projectValue('apiKey', { apiKey: SECRET_SENTINEL }, {}) === '[set]', 'a stored secret reads as [set]');
check(schema.projectValue('apiKey', { apiKey: '' }, {}) === '', 'an empty secret reads as empty');
check(schema.projectValue('apiKey', { apiKey: '   ' }, {}) === '', 'a blank secret reads as empty');
check(schema.projectValue('apiKey', {}, {}) === '', 'an absent secret reads as empty');
check(schema.projectValue('apiKey', { apiKey: 12345 }, {}) === '', 'a non-string secret reads as empty');
const secretStore = {};
for (const key of SECRET_KEYS) secretStore[key] = SECRET_SENTINEL;
const secretJson = JSON.stringify(schema.projectAll(secretStore, {}));
check(SECRET_KEYS.every((key) => schema.projectAll(secretStore, {}).settings[key] === '[set]'), 'all eight stored secrets read as [set]');
check(!secretJson.includes('SENTINEL'), 'projectAll JSON holds no secret sentinel');
check(!secretJson.includes('sk-'), 'projectAll JSON holds no secret prefix');
check(!secretJson.includes('abc123'), 'projectAll JSON holds no secret suffix');
check(!secretJson.includes(String(SECRET_SENTINEL.length)), 'projectAll JSON holds no stored secret length');
for (const key of SECRET_KEYS) {
  const described = JSON.stringify(schema.describe(key, secretStore, {}));
  check(!described.includes('SENTINEL') && described.includes('"value":"[set]"'), `describe(${key}) masks the secret`);
}

console.log('\n--- endpoints (D-11) ---');
const ENDPOINT_CASES = [
  ['https://user:pw@host.example:8443/v1/chat?k=SECRET#frag', 'https://host.example:8443/...'],
  ['http://localhost:1234', 'http://localhost:1234'],
  ['http://localhost:1234/', 'http://localhost:1234'],
  ['https://h.example?x=1', 'https://h.example/...'],
  ['https://h.example#frag', 'https://h.example/...'],
  ['https://h.example/path', 'https://h.example/...'],
  ['https://h.example:443/', 'https://h.example'],
  ['https://user:pw@h.example', 'https://h.example'],
  ['http://[::1]:1234/v1', 'http://[::1]:1234/...'],
  ['not a url', '[set]'],
  ['javascript:alert(1)', '[set]'],
  ['file:///etc/passwd', '[set]'],
  ['data:text/plain,SECRET', '[set]'],
  ['   ', '[set]'],
  ['', ''],
];
for (const [raw, expected] of ENDPOINT_CASES) {
  const got = schema.originOnly(raw);
  check(got === expected, `originOnly(${JSON.stringify(raw)}) is ${JSON.stringify(expected)} (got ${JSON.stringify(got)})`);
  for (const secret of ['user', 'pw@', 'SECRET', 'frag', 'chat', 'passwd']) {
    if (got.includes(secret)) check(false, `originOnly(${JSON.stringify(raw)}) leaks ${secret}`);
  }
}
for (const value of [undefined, null, 42, {}, ['https://h.example']]) {
  check(schema.originOnly(value) === '', `originOnly(${JSON.stringify(value)}) is empty for a non-string`);
}
const endpointStore = {
  customEndpoint: 'https://user:pw@host.example:8443/v1/chat?k=SECRET#frag',
  lmstudioBaseUrl: 'http://localhost:1234/',
  serverUrl: 'not a url',
};
const endpointRead = schema.projectAll(endpointStore, {});
check(endpointRead.settings.customEndpoint === 'https://host.example:8443/...', 'a stored customEndpoint reads as origin only');
check(endpointRead.settings.lmstudioBaseUrl === 'http://localhost:1234', 'a stored lmstudioBaseUrl reads as origin only');
check(endpointRead.settings.serverUrl === '[set]', 'an unparseable serverUrl reads as [set]');
const endpointJson = JSON.stringify(endpointRead);
check(!/user|pw@|SECRET|frag|chat/.test(endpointJson), 'projectAll JSON holds no userinfo, path, query or fragment token');
check(schema.projectValue('customEndpoint', { customEndpoint: '' }, {}) === '', 'an empty stored endpoint reads as empty');
check(schema.projectValue('serverUrl', {}, {}) === 'https://full-selfbrowsing.com', 'an absent endpoint reads as its effective default origin');

console.log('\n--- reads never write ---');
const frozenStore = Object.freeze({
  apiKey: SECRET_SENTINEL,
  customEndpoint: 'https://h.example/v1?x=1',
  maxIterations: 250,
  debugMode: true,
  sttProvider: 'whisper',
});
const frozenCtx = Object.freeze({ agentCapRecommendation: 12 });
const beforeJson = JSON.stringify(frozenStore);
let readThrew = false;
try {
  schema.projectAll(frozenStore, frozenCtx);
  for (const key of schema.keys()) {
    schema.projectValue(key, frozenStore, frozenCtx);
    schema.describe(key, frozenStore, frozenCtx);
    schema.effectiveDefault(key, frozenCtx);
  }
  schema.describe('nope', frozenStore, frozenCtx);
} catch (_e) {
  readThrew = true;
}
check(!readThrew, 'projectAll, projectValue, describe and effectiveDefault accept a frozen store');
check(JSON.stringify(frozenStore) === beforeJson, 'the stored object is unchanged after every read');
check(schema.projectAll(frozenStore, frozenCtx).settings.maxIterations === 250, 'a stored integer is returned');
check(schema.projectAll(frozenStore, frozenCtx).settings.fsbAgentCap === 12, 'an absent fsbAgentCap uses the ctx recommendation');

console.log('\n--- describe ---');
const describedMax = schema.describe('maxIterations', {}, {});
checkDeep(describedMax, { key: 'maxIterations', value: 100, type: 'integer', writable: true, range: { min: 50, max: 500 } },
  'describe(maxIterations) shows value, type, writable and range');
check(JSON.stringify(describedMax) === '{"key":"maxIterations","value":100,"type":"integer","writable":true,"range":{"min":50,"max":500}}',
  'describe(maxIterations) keeps the wire field order');
checkDeep(schema.describe('sttProvider', {}, {}), { key: 'sttProvider', value: 'browser', type: 'enum', writable: true, values: ['browser', 'whisper'] },
  'describe(sttProvider) lists its values');
checkDeep(schema.describe('apiKey', { apiKey: 'x' }, {}), { key: 'apiKey', value: '[set]', type: 'string', writable: false },
  'describe(apiKey) masks and reports read-only');
checkDeep(schema.describe('serverUrl', {}, {}), { key: 'serverUrl', value: 'https://full-selfbrowsing.com', type: 'string', writable: false },
  'describe(serverUrl) reports origin and read-only');
checkDeep(schema.describe('debugMode', { debugMode: true }, {}), { key: 'debugMode', value: true, type: 'boolean', writable: true },
  'describe(debugMode) reports the stored boolean');
check(schema.describe('fsbAgentCap', {}, { agentCapRecommendation: 16 }).value === 16, 'describe(fsbAgentCap) uses the recommendation');
check(schema.describe('nope', {}, {}) === null, 'describe of an unknown key is null');
check(schema.describe('constructor', {}, {}) === null, 'describe(constructor) is null');
const describedEnum = schema.describe('modelProvider', {}, {});
describedEnum.values.push('mutated');
check(schema.get('modelProvider').values.length === 7, 'describe returns a copy of the values array');

console.log('\n--- parseValue (D-04, D-14) ---');
const C = schema.CODES;
function expectOk(key, raw, value, label) {
  const result = schema.parseValue(key, raw);
  check(isDeepEqual(result, { ok: true, value }), `${label || `parseValue(${key}, ${JSON.stringify(raw)})`} -> ${JSON.stringify(value)} (got ${JSON.stringify(result)})`);
}
function expectFail(key, raw, code, extra, label) {
  const result = schema.parseValue(key, raw);
  const tag = label || `parseValue(${key}, ${JSON.stringify(raw)})`;
  check(result && result.ok === false && result.code === code, `${tag} fails with ${code} (got ${JSON.stringify(result && result.code)})`);
  check(typeof result.error === 'string' && result.error.length > 0, `${tag} carries an error sentence`);
  check(result.key === schema.safeKeyLabel(key), `${tag} labels the key safely`);
  if (extra && extra.range) checkDeep(result.range, extra.range, `${tag} carries the range`);
  if (extra && extra.values) checkDeep(result.values, extra.values, `${tag} carries the allowed values`);
  if (!extra || !extra.range) check(!('range' in result), `${tag} has no range`);
  if (!extra || !extra.values) check(!('values' in result), `${tag} has no values`);
  return result;
}
expectOk('debugMode', 'true', true);
expectOk('debugMode', 'false', false);
for (const raw of ['TRUE', 'True', '1', '0', ' true', 'true ', 'yes', 'on', '']) {
  expectFail('debugMode', raw, C.VALUE_INVALID);
}
expectOk('maxIterations', '50', 50);
expectOk('maxIterations', '500', 500);
expectOk('maxIterations', '250', 250);
expectOk('maxIterations', '000050', 50, 'parseValue(maxIterations, "000050") reads digits as base 10');
const maxRange = { range: { min: 50, max: 500 } };
for (const raw of ['49', '501', '50.0', '-1', '1e2', '0x10', ' 50', '50 ', '', '+50', '5_0', '0000050', '１００', 'Infinity', 'NaN']) {
  expectFail('maxIterations', raw, C.VALUE_INVALID, maxRange);
}
const rangeFailure = schema.parseValue('maxIterations', '600');
check(rangeFailure.error === 'maxIterations must be a whole number from 50 to 500.', 'the integer error states the range');
expectOk('fsbMcpSessionRetentionDays', '365', 365);
expectFail('fsbMcpSessionRetentionDays', '366', C.VALUE_INVALID, { range: { min: 1, max: 365 } });
expectFail('fsbAgentCap', '0', C.VALUE_INVALID, { range: { min: 1, max: 64 } });
expectOk('fsbAgentCap', '64', 64);
expectOk('sttProvider', 'whisper', 'whisper');
expectOk('sttProvider', 'browser', 'browser');
const enumFailure = expectFail('sttProvider', 'Whisper', C.VALUE_INVALID, { values: ['browser', 'whisper'] });
check(enumFailure.error.includes('browser, whisper'), 'the enum error lists the allowed values');
expectFail('sttProvider', ' whisper', C.VALUE_INVALID, { values: ['browser', 'whisper'] });
expectOk('modelProvider', 'lmstudio', 'lmstudio');
expectFail('modelProvider', 'XAI', C.VALUE_INVALID, { values: PROVIDER_IDS });
expectOk('providerKind', 'agent', 'agent');
expectOk('modelName', '  grok-4  ', 'grok-4');
expectOk('modelName', '', '', 'parseValue(modelName, "") accepts an empty string');
expectOk('modelName', 'm'.repeat(200), 'm'.repeat(200), 'parseValue(modelName, 200 chars) accepts the bound');
expectOk('modelName', `  ${'m'.repeat(200)}  `, 'm'.repeat(200), 'parseValue(modelName) trims before the length check');
const longFailure = expectFail('modelName', 'm'.repeat(201), C.VALUE_INVALID, null, 'parseValue(modelName, 201 chars)');
check(longFailure.error.includes('200'), 'the string error states its length bound');
expectOk('agentProviderId', 'claude-code', 'claude-code');
expectFail('agentProviderId', 'a'.repeat(65), C.VALUE_INVALID, null, 'parseValue(agentProviderId, 65 chars)');
expectFail('modelName', 'm'.repeat(2049), C.VALUE_INVALID, null, 'parseValue(modelName, 2049 chars)');
expectFail('debugMode', 't'.repeat(2049), C.VALUE_INVALID, null, 'parseValue(debugMode, 2049 chars)');
for (const raw of [true, false, 5, null, undefined, {}, ['true'], Symbol.iterator]) {
  expectFail('debugMode', raw, C.REQUEST_INVALID, null, `parseValue(debugMode, ${typeof raw})`);
}
expectFail('maxIterations', 100, C.REQUEST_INVALID, null, 'parseValue(maxIterations, number 100)');
expectFail('nope', 'true', C.UNKNOWN_KEY);
expectFail('constructor', 'true', C.UNKNOWN_KEY);
expectFail('', 'true', C.UNKNOWN_KEY);
expectFail(42, 'true', C.UNKNOWN_KEY, null, 'parseValue(42, "true")');
check(schema.parseValue('a b', 'true').key === '[invalid]', 'an invalid key is labelled [invalid]');
for (const key of [...SECRET_KEYS, ...ENDPOINT_KEYS]) {
  expectFail(key, 'https://h.example', C.PROTECTED_KEY);
}

console.log('\n--- value-free failures ---');
const RAW_MARK = 'SENTINEL-raw';
const sentinelCases = [
  ['debugMode', RAW_MARK],
  ['debugMode', `true${RAW_MARK}`],
  ['maxIterations', RAW_MARK],
  ['maxIterations', `5${RAW_MARK}`],
  ['sttProvider', RAW_MARK],
  ['modelProvider', RAW_MARK],
  ['providerKind', RAW_MARK],
  ['modelName', `${'x'.repeat(201)}${RAW_MARK}`],
  ['agentProviderId', `${'x'.repeat(64)}${RAW_MARK}`],
  ['modelName', RAW_MARK.repeat(200)],
  ['apiKey', RAW_MARK],
  ['serverHashKey', RAW_MARK],
  ['customEndpoint', `https://${RAW_MARK}.example/`],
  ['serverUrl', `https://${RAW_MARK}.example/`],
  ['nope', RAW_MARK],
  [`${RAW_MARK} key`, RAW_MARK],
];
for (const [key, raw] of sentinelCases) {
  const result = schema.parseValue(key, raw);
  check(result.ok === false, `parseValue(${schema.safeKeyLabel(key)}, <sentinel>) fails`);
  check(!result.error.includes('SENTINEL'), `parseValue(${schema.safeKeyLabel(key)}, <sentinel>) error omits the raw value`);
  check(!JSON.stringify(result).includes('SENTINEL'), `parseValue(${schema.safeKeyLabel(key)}, <sentinel>) failure object omits the raw value`);
}

console.log('\n--- fixture factory (D-17) ---');
const FIXTURE_KEY = 'fsbSchemaFixtureFlag';
const fixture = schema.create([
  ...schema.entries,
  { key: FIXTURE_KEY, type: 'boolean', cls: 'writable', default: false },
]);
check(fixture !== schema, 'create returns a new instance');
check(Object.isFrozen(fixture) && Object.isFrozen(fixture.entries), 'the fixture instance and its entries are frozen');
check(fixture.keys().includes(FIXTURE_KEY), 'the fixture schema lists the fixture key');
check(fixture.keys().length === 37, 'the fixture schema has 37 keys');
check(!schema.keys().includes(FIXTURE_KEY) && schema.get(FIXTURE_KEY) === null, 'the production schema does not see the fixture key');
check(schema.keys().length === 36, 'the production schema still has 36 keys');
check(fixture.isWritable(FIXTURE_KEY) === true, 'the fixture key is writable');
check(fixture.projectAll({}, {}).settings[FIXTURE_KEY] === false, 'the fixture key reads its default');
check(fixture.projectAll({ [FIXTURE_KEY]: true }, {}).settings[FIXTURE_KEY] === true, 'the fixture key reads a stored value');
checkDeep(fixture.parseValue(FIXTURE_KEY, 'true'), { ok: true, value: true }, 'the fixture key parses a write');
checkDeep(fixture.describe(FIXTURE_KEY, {}, {}), { key: FIXTURE_KEY, value: false, type: 'boolean', writable: true }, 'the fixture key describes itself');
check(schema.parseValue(FIXTURE_KEY, 'true').code === C.UNKNOWN_KEY, 'the production schema refuses the fixture key');
for (const name of ['CODES', 'KEY_PATTERN', 'VALUE_MAX_LENGTH', 'PROVIDERS', 'MODEL_LIST_CAP', 'safeKeyLabel', 'originOnly', 'create']) {
  check(fixture[name] === schema[name], `the fixture instance carries the static ${name}`);
}
const nested = fixture.create([{ key: 'onlyKey', type: 'integer', cls: 'writable', default: 3, min: 1, max: 5 }]);
checkDeep(nested.keys(), ['onlyKey'], 'a fixture instance can create another schema');
checkDeep(nested.parseValue('onlyKey', '6'), {
  ok: false, code: C.VALUE_INVALID, error: 'onlyKey must be a whole number from 1 to 5.', key: 'onlyKey', range: { min: 1, max: 5 },
}, 'a fixture integer entry enforces its own bounds');
const fixtureSource = [{ key: 'sourceKey', type: 'enum', cls: 'writable', default: 'a', values: ['a', 'b'] }];
const fromSource = schema.create(fixtureSource);
fixtureSource[0].values.push('c');
fixtureSource.push({ key: 'late', type: 'boolean', cls: 'writable', default: true });
checkDeep(fromSource.keys(), ['sourceKey'], 'create copies its input array');
checkDeep([...fromSource.get('sourceKey').values], ['a', 'b'], 'create copies nested arrays');
check(!Object.isFrozen(fixtureSource[0]), 'create does not freeze the caller\'s objects');
const BAD_ENTRIES = [
  ['a non-array', 'nope'],
  ['a non-object entry', ['x']],
  ['an invalid key', [{ key: '1bad', type: 'boolean', cls: 'writable', default: true }]],
  ['a duplicate key', [{ key: 'dup', type: 'boolean', cls: 'writable', default: true }, { key: 'dup', type: 'boolean', cls: 'writable', default: false }]],
  ['an unknown field', [{ key: 'k', type: 'boolean', cls: 'writable', default: true, extra: 1 }]],
  ['an unknown type', [{ key: 'k', type: 'number', cls: 'writable', default: 1 }]],
  ['an unknown class', [{ key: 'k', type: 'boolean', cls: 'hidden', default: true }]],
  ['a non-string secret', [{ key: 'k', type: 'boolean', cls: 'secret', default: false }]],
  ['an integer default outside its bounds', [{ key: 'k', type: 'integer', cls: 'writable', default: 9, min: 1, max: 5 }]],
  ['an integer without bounds', [{ key: 'k', type: 'integer', cls: 'writable', default: 1 }]],
  ['an enum default outside its values', [{ key: 'k', type: 'enum', cls: 'writable', default: 'z', values: ['a'] }]],
  ['an enum without values', [{ key: 'k', type: 'enum', cls: 'writable', default: 'a' }]],
  ['a boolean with a string default', [{ key: 'k', type: 'boolean', cls: 'writable', default: 'true' }]],
  ['min on a boolean', [{ key: 'k', type: 'boolean', cls: 'writable', default: true, min: 1 }]],
  ['maxLength on an integer', [{ key: 'k', type: 'integer', cls: 'writable', default: 1, min: 1, max: 2, maxLength: 3 }]],
  ['an unknown group', [{ key: 'k', type: 'boolean', cls: 'writable', default: true, group: 'other' }]],
  ['an unknown computed default', [{ key: 'k', type: 'integer', cls: 'writable', default: { from: 'elsewhere' }, min: 1, max: 64 }]],
];
for (const [label, entries] of BAD_ENTRIES) {
  check(throwsTypeError(() => schema.create(entries)), `create rejects ${label}`);
}
check(schema.keys().length === 36, 'rejected create calls leave the production schema untouched');

console.log('\n--- config.js scope safety ---');
const topLevel = CONFIG_SOURCE.split('\n').filter((line) => /^(const|let|class|function|var) /.test(line));
checkDeep(topLevel.map((line) => line.split(/[\s=({]/).slice(0, 2).join(' ')), ['class Config', 'const config'],
  'config.js declares only class Config and const config at top level');
check((CONFIG_SOURCE.match(/global\.FsbSettingsSchema\s*=/g) || []).length === 1, 'config.js assigns global.FsbSettingsSchema once');
check(/module\.exports\.FsbSettingsSchema\s*=/.test(CONFIG_SOURCE), 'config.js adds FsbSettingsSchema to module.exports');
check(CONFIG_SOURCE.includes('module.exports = { Config, config };'), 'config.js keeps its original export line');
check(/providerKind/.test(CONFIG_SOURCE), 'config.js keeps the providerKind token (delegation-phase-contract pin)');
check(!/chrome\.storage\.local\.(get|set)/.test(CONFIG_SOURCE.slice(CONFIG_SOURCE.indexOf('module.exports = { Config, config };'))),
  'the schema block never touches chrome.storage');

// Control panel: options.js declares `const defaultSettings` in the same scope.
const panelContext = vm.createContext({ console, URL });
vm.runInContext('var window = globalThis; const defaultSettings = {};', panelContext);
let panelError = null;
try {
  vm.runInContext(CONFIG_SOURCE, panelContext, { filename: 'config.js' });
} catch (err) {
  panelError = err;
}
check(panelError === null, `config.js loads in a panel-like scope that already declared defaultSettings${panelError ? ` (${panelError.message})` : ''}`);
check(vm.runInContext('typeof defaultSettings === "object" && typeof FsbSettingsSchema === "object" && window.FsbSettingsSchema === FsbSettingsSchema', panelContext),
  'the panel scope exposes FsbSettingsSchema next to defaultSettings');

// Service worker: `self` is the global; config.js loads before the SW-only modules.
let chromeCalls = 0;
const swChrome = {
  storage: {
    onChanged: { addListener() { chromeCalls += 1; } },
    local: {
      get() { throw new Error('schema load must not read storage'); },
      set() { throw new Error('schema load must not write storage'); },
    },
  },
};
const swContext = vm.createContext({ console, URL, chrome: swChrome });
vm.runInContext('var self = globalThis;', swContext);
let swError = null;
try {
  vm.runInContext(CONFIG_SOURCE, swContext, { filename: 'config.js' });
} catch (err) {
  swError = err;
}
check(swError === null, `config.js loads in an SW-like scope${swError ? ` (${swError.message})` : ''}`);
check(vm.runInContext('self.FsbSettingsSchema.keys().length', swContext) === 36, 'the SW scope exposes self.FsbSettingsSchema');
check(vm.runInContext('typeof FsbAgentCapRecommendation === "undefined" && typeof FsbDelegationProviders === "undefined"', swContext),
  'config.js does not need the SW-only globals at load');
check(chromeCalls === 1, 'loading config.js makes only the Config cache listener chrome call');
check(vm.runInContext('self.FsbSettingsSchema.projectAll({ apiKey: "k", lmstudioBaseUrl: "http://127.0.0.1:1234/v1" }, {}).settings.lmstudioBaseUrl', swContext)
  === 'http://127.0.0.1:1234/...', 'reads work in the SW scope without chrome.storage');
let laterScriptError = null;
try {
  vm.runInContext([
    'const PRODUCTION_ENTRIES = 1; const CODES = 1; const KEY_PATTERN = 1; const PROVIDERS = 1;',
    'const create = 1; const originOnly = 1; const safeKeyLabel = 1; const api = 1; const STATICS = 1;',
    'const buildEntry = 1; const failure = 1; const VALUE_MAX_LENGTH = 1; const MODEL_LIST_CAP = 1;',
  ].join('\n'), swContext, { filename: 'later-importScripts-module.js' });
} catch (err) {
  laterScriptError = err;
}
check(laterScriptError === null, `a later SW script can declare the schema's internal names${laterScriptError ? ` (${laterScriptError.message})` : ''}`);

// A context without URL (never the SW or panel) still masks endpoints.
const noUrlContext = vm.createContext({ console });
vm.runInContext(CONFIG_SOURCE, noUrlContext, { filename: 'config.js' });
check(vm.runInContext('FsbSettingsSchema.originOnly("https://user:pw@h.example/x")', noUrlContext) === '[set]',
  'originOnly fails closed to [set] when URL is unavailable');

// WR-01: a malformed production entry disables the schema instead of throwing,
// because a throw in config.js (an unguarded importScripts) stops the whole SW.
const GOOD_DEBUG_ENTRY = "{ key: 'debugMode', type: 'boolean', cls: 'writable', default: false },";
check(CONFIG_SOURCE.split(GOOD_DEBUG_ENTRY).length - 1 === 1, 'the debugMode production entry is found once (degrade fixture anchor)');
const BROKEN_CONFIG_SOURCE = CONFIG_SOURCE.replace(GOOD_DEBUG_ENTRY,
  "{ key: 'debugMode', type: 'boolean', cls: 'writable', default: 'not-a-boolean' },");
const degradeErrors = [];
const degradeConsole = {
  log() {},
  warn() {},
  error(...args) { degradeErrors.push(args.map(String).join(' ')); }
};
const degradeModule = { exports: {} };
const degradeChrome = { storage: { onChanged: { addListener() {} } } };
const degradeContext = vm.createContext({ console: degradeConsole, URL, chrome: degradeChrome, module: degradeModule });
vm.runInContext('var self = globalThis;', degradeContext);
let degradeError = null;
try {
  vm.runInContext(BROKEN_CONFIG_SOURCE, degradeContext, { filename: 'config.js' });
} catch (err) {
  degradeError = err;
}
check(degradeError === null, `config.js with a malformed entry still loads${degradeError ? ` (${degradeError.message})` : ''}`);
check(vm.runInContext('typeof self.FsbSettingsSchema === "undefined"', degradeContext),
  'a malformed entry leaves no FsbSettingsSchema global (the routes answer SETTING_UNSUPPORTED)');
check(vm.runInContext('typeof Config === "function" && self.config instanceof Config', degradeContext),
  'a malformed entry keeps the Config class and the config singleton');
check(typeof degradeModule.exports.Config === 'function' && !('FsbSettingsSchema' in degradeModule.exports),
  'module.exports keeps Config and gains no FsbSettingsSchema');
check(degradeErrors.length === 1 && degradeErrors[0].startsWith('[FSB] Settings schema disabled:')
  && degradeErrors[0].includes('FsbSettingsSchema entry'), 'the disabled schema is reported once on console.error');
check(throwsTypeError(() => schema.create([{ key: 'debugMode', type: 'boolean', cls: 'writable', default: 'not-a-boolean' }])),
  'create() itself still throws on the same malformed entry');

// ===========================================================================
// 66.1-02 Task 1: the write planner (D-13, D-14, D-15) and its helpers.
// A section that throws records one failure and the suite carries on.
// ===========================================================================
function runSection(title, fn) {
  console.log(`\n--- ${title} ---`);
  try {
    fn();
  } catch (err) {
    check(false, `${title} threw: ${err && err.message}`);
  }
}

const EXPECTED_DEFAULT_MODELS = {
  xai: 'grok-4-1-fast',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-6',
  openrouter: 'openai/gpt-4o',
  lmstudio: '',
  custom: '',
};
const HOSTED_IDS = ['xai', 'gemini', 'openai', 'anthropic', 'openrouter'];
const EXPECTED_PROVIDER_API_KEY = {
  xai: 'apiKey',
  gemini: 'geminiApiKey',
  openai: 'openaiApiKey',
  anthropic: 'anthropicApiKey',
  openrouter: 'openrouterApiKey',
  custom: 'customApiKey',
  lmstudio: null,
};
const XAI_BUILT_IN_IDS = new Config().availableModels.xai.map((model) => model.id);
const NOT_READY_CODE = 'SETTING_PROVIDER_NOT_READY';
const planSuccesses = [];

function plan(key, raw, stored, ctx) {
  const result = schema.planWrite(key, raw, stored, ctx);
  if (result && result.ok === true) planSuccesses.push(result);
  return result;
}

function expectPlanFail(result, code, tag) {
  check(Boolean(result) && result.ok === false && result.code === code,
    `${tag} fails with ${code} (got ${JSON.stringify(result && result.code)})`);
  check(Boolean(result) && typeof result.error === 'string' && result.error.length > 0, `${tag} carries an error sentence`);
  return result || {};
}

function expectPlanOk(result, expected, tag) {
  checkDeep(result, { ok: true, ...expected }, tag);
  return result || {};
}

function endsWith(text, suffix) {
  return typeof text === 'string' && text.endsWith(suffix);
}

runSection('Config.DEFAULT_MODELS (one shared default-model map)', () => {
  const map = Config.DEFAULT_MODELS;
  check(map !== null && typeof map === 'object' && Object.isFrozen(map), 'Config.DEFAULT_MODELS is a frozen object');
  checkDeep({ ...map }, EXPECTED_DEFAULT_MODELS, 'Config.DEFAULT_MODELS holds the seven provider defaults');
  checkDeep(Object.keys(map || {}), Object.keys(EXPECTED_DEFAULT_MODELS), 'Config.DEFAULT_MODELS keeps the provider order');
  const literalCount = (CONFIG_SOURCE.match(/['"]?gemini['"]?\s*:\s*'gemini-2\.5-flash'/g) || []).length;
  check(literalCount === 1, `the gemini default literal appears once in config.js (got ${literalCount})`);
  const vcmStart = CONFIG_SOURCE.indexOf('validateAndCorrectModel(modelName');
  const vcmBody = CONFIG_SOURCE.slice(vcmStart, CONFIG_SOURCE.indexOf('isDevelopment() {', vcmStart));
  check(vcmStart !== -1 && vcmBody.includes('Config.DEFAULT_MODELS'), 'validateAndCorrectModel reads Config.DEFAULT_MODELS');
  check(!/const defaultModels = \{/.test(vcmBody), 'validateAndCorrectModel no longer declares its own default literal');
  checkDeep(new Config().defaults, CONFIG_DEFAULTS_SNAPSHOT, 'Config.defaults is still unchanged');

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(' ')); };
  const got = {};
  try {
    const cfg = new Config();
    for (const provider of PROVIDER_IDS) got[provider] = cfg.validateAndCorrectModel('', provider);
    got.unknown = cfg.validateAndCorrectModel('', 'nope');
    got.undefinedName = cfg.validateAndCorrectModel(undefined, 'gemini');
    got.defaultProvider = cfg.validateAndCorrectModel('');
  } finally {
    console.warn = originalWarn;
  }
  check(got.gemini === 'gemini-2.5-flash', 'validateAndCorrectModel("", "gemini") still returns gemini-2.5-flash');
  check(got.unknown === 'grok-4-1-fast', 'validateAndCorrectModel("", "nope") still returns grok-4-1-fast');
  for (const provider of HOSTED_IDS) {
    check(got[provider] === EXPECTED_DEFAULT_MODELS[provider], `validateAndCorrectModel("", "${provider}") returns ${EXPECTED_DEFAULT_MODELS[provider]}`);
  }
  check(got.lmstudio === '' && got.custom === '', 'lmstudio and custom still keep an empty model name');
  check(got.undefinedName === 'gemini-2.5-flash', 'an undefined model name still gets the provider default');
  check(got.defaultProvider === 'grok-4-1-fast', 'the provider argument still defaults to xai');
  // Five hosted providers + unknown + undefined name + default provider; lmstudio/custom return early.
  check(warnings.length === 8, `the empty-name console.warn still fires once per corrected call (got ${warnings.length})`);
  check(warnings.every((line) => line.startsWith('[Config] Model "')), 'the empty-name warning text is unchanged');
});

runSection('write-planner statics', () => {
  checkDeep([...(schema.HOSTED_PROVIDERS || [])], HOSTED_IDS, 'HOSTED_PROVIDERS lists the five hosted providers');
  check(Object.isFrozen(schema.HOSTED_PROVIDERS), 'HOSTED_PROVIDERS is frozen');
  checkDeep({ ...schema.PROVIDER_API_KEY }, EXPECTED_PROVIDER_API_KEY, 'PROVIDER_API_KEY maps each provider to its stored key');
  check(Object.isFrozen(schema.PROVIDER_API_KEY), 'PROVIDER_API_KEY is frozen');
  checkDeep(Object.keys(schema.PROVIDER_API_KEY || {}).sort(), [...PROVIDER_IDS].sort(), 'PROVIDER_API_KEY covers exactly the seven providers');
  for (const [provider, key] of Object.entries(schema.PROVIDER_API_KEY || {})) {
    if (key !== null) check(schema.get(key) !== null && schema.get(key).cls === 'secret', `PROVIDER_API_KEY.${provider} (${key}) is a secret schema key`);
  }
  for (const name of ['knownModelIds', 'discoveredIdsFromCache', 'formatAllowed', 'planWrite']) {
    check(typeof schema[name] === 'function', `${name} is a function on the production schema`);
  }
});

runSection('formatAllowed (the value-free Allowed text)', () => {
  const fa = schema.formatAllowed;
  check(fa({ range: { min: 1, max: 64 } }) === '1 to 64', 'a range renders as "<min> to <max>"');
  check(fa({ values: ['', 'a', 3, null, { x: 1 }] }) === '"", a, 3', 'values keep strings and finite numbers and show "" for empty');
  check(fa({ values: ['a'], omitted: 5 }) === 'a (+5 more)', 'a positive omitted count appends (+N more)');
  check(fa({}) === '', 'nothing to show renders as empty');
  check(fa() === '' && fa(null) === '', 'a missing argument renders as empty');
  check(fa({ values: ['L'.repeat(250)] }) === 'L'.repeat(200), 'a 250-character entry is cut to 200');
  check(fa({ range: { min: 50, max: 500 }, values: ['a', 'b'] }) === '50 to 500; a, b', 'range and values join with "; "');
  check(fa({ range: { min: 1, max: Infinity } }) === '', 'a non-finite bound shows no range');
  check(fa({ range: { min: 1 } }) === '' && fa({ range: { min: '1', max: '2' } }) === '', 'a partial or non-numeric range shows nothing');
  check(fa({ values: [NaN, Infinity, 'x'] }) === 'x', 'non-finite numbers are dropped');
  check(fa({ values: 'abc' }) === '', 'non-array values show nothing');
  for (const omitted of [0, -1, 2.5, '3', NaN]) {
    check(fa({ values: ['a'], omitted }) === 'a', `omitted ${String(omitted)} adds no count`);
  }
  check(fa({ values: [], omitted: 4 }) === '(+4 more)', 'an empty list with a count shows only the count');
});

runSection('discoveredIdsFromCache (mirrors getDiscoveredModelIds over fsbDiscoveryCache)', () => {
  const NOW = 1700000000000;
  const later = NOW + 60000;
  const cache = {
    'xai:hashA': { result: { ok: true, models: [{ id: 'old-id' }] }, expiresAt: later },
    'xai:hashB': { result: { ok: true, models: [{ id: 'new-id' }, { id: '' }, {}, null, { id: 7 }] }, expiresAt: later },
    'xai:hashC': { result: { ok: true, models: [{ id: 'expired-id' }] }, expiresAt: NOW },
    'xai:hashD': { result: { ok: false, models: [{ id: 'not-ok-id' }] }, expiresAt: later },
    'xai:hashE': { result: { ok: true, models: 'not-an-array' }, expiresAt: later },
    'xai:hashF': null,
    'xai:hashG': { result: { ok: true, models: [{ id: 'no-expiry-id' }] } },
    'xaix:hash': { result: { ok: true, models: [{ id: 'other-prefix-id' }] }, expiresAt: later },
    'gemini:hash': { result: { ok: true, models: [{ id: 'gemini-id' }] }, expiresAt: later },
  };
  const frozen = JSON.stringify(cache);
  checkDeep(schema.discoveredIdsFromCache(cache, 'xai', NOW), ['new-id', '7'],
    'the last qualifying xai entry wins; expired, not-ok, non-array, null and other-prefix entries are ignored');
  checkDeep(schema.discoveredIdsFromCache(cache, 'gemini', NOW), ['gemini-id'], 'a provider only sees its own prefix');
  checkDeep(schema.discoveredIdsFromCache(cache, 'openai', NOW), [], 'a provider with no entry gets []');
  checkDeep(schema.discoveredIdsFromCache(cache, 'xai', later), [], 'every entry is expired once now reaches expiresAt');
  checkDeep(schema.discoveredIdsFromCache(cache, 'xai', undefined), [], 'a missing clock fails closed to []');
  for (const input of [null, undefined, 'cache', 42, true, ['xai:hashA']]) {
    checkDeep(schema.discoveredIdsFromCache(input, 'xai', NOW), [], `a non-object cache (${JSON.stringify(input)}) gives []`);
  }
  for (const provider of ['', null, 7]) {
    checkDeep(schema.discoveredIdsFromCache(cache, provider, NOW), [], `provider ${JSON.stringify(provider)} gives []`);
  }
  check(JSON.stringify(cache) === frozen, 'the cache object is not modified');
});

runSection('knownModelIds (built-in list plus discovered ids)', () => {
  checkDeep(schema.knownModelIds('xai', []), XAI_BUILT_IN_IDS, 'xai lists its built-in ids in order');
  checkDeep(schema.knownModelIds('xai', undefined), XAI_BUILT_IN_IDS, 'missing discovered ids are treated as none');
  checkDeep(schema.knownModelIds('xai', ['grok-4', 'new-x', 'new-x', '', 5, null]), [...XAI_BUILT_IN_IDS, 'new-x'],
    'discovered ids are appended once, after the built-in ids; non-strings and empties are dropped');
  checkDeep(schema.knownModelIds('gemini', []), new Config().availableModels.gemini.map((model) => model.id), 'gemini lists its built-in ids');
  for (const provider of ['lmstudio', 'custom', 'nope', '', undefined]) {
    checkDeep(schema.knownModelIds(provider, ['some-id']), [], `${String(provider)} has no known model list`);
  }
  const first = schema.knownModelIds('xai', []);
  first.push('mutated');
  checkDeep(schema.knownModelIds('xai', []), XAI_BUILT_IN_IDS, 'knownModelIds returns a fresh array');
});

runSection('planWrite: key and class checks come first', () => {
  const unknown = expectPlanFail(plan('nope', 'x', {}), 'SETTING_UNKNOWN_KEY', 'planWrite(nope)');
  check(unknown.key === 'nope', 'an unknown valid key is reported by name');
  check(unknown.error === 'Unknown setting key. Call settings with no arguments to list keys.', 'the unknown-key sentence is fixed');
  check(expectPlanFail(plan('a b', 'x', {}), 'SETTING_UNKNOWN_KEY', 'planWrite("a b")').key === '[invalid]', 'an invalid key is labelled [invalid]');
  expectPlanFail(plan(42, 'x', {}), 'SETTING_UNKNOWN_KEY', 'planWrite(42)');
  expectPlanFail(plan('constructor', 'true', {}), 'SETTING_UNKNOWN_KEY', 'planWrite(constructor)');
  expectPlanFail(plan('speedMode', 'fast', {}), 'SETTING_UNKNOWN_KEY', 'planWrite(speedMode), an excluded legacy key');

  const apiKey = expectPlanFail(plan('apiKey', 'sk-SENTINEL', {}), 'SETTING_PROTECTED_KEY', 'planWrite(apiKey)');
  check(apiKey.error === 'apiKey is read-only over MCP; change it in the FSB Control Panel.', 'the protected-key sentence names the key only');
  expectPlanFail(plan('serverUrl', 'https://evil.example', {}), 'SETTING_PROTECTED_KEY', 'planWrite(serverUrl)');
  let rawTouched = false;
  const trap = new Proxy({}, { get() { rawTouched = true; return undefined; }, has() { rawTouched = true; return false; } });
  for (const key of [...SECRET_KEYS, ...ENDPOINT_KEYS]) {
    for (const raw of ['sk-SENTINEL', 'https://evil.example', undefined, 5, { value: 'SENTINEL' }, trap]) {
      const result = schema.planWrite(key, raw, { apiKey: 'stored-SENTINEL' }, {});
      check(result && result.code === 'SETTING_PROTECTED_KEY', `planWrite(${key}, ${typeof raw}) is refused as protected`);
      const json = JSON.stringify(result);
      check(!json.includes('SENTINEL') && !json.includes('evil'), `planWrite(${key}, ${typeof raw}) failure holds no value`);
    }
  }
  check(rawTouched === false, 'the raw value of a protected key is never inspected');
});

runSection('planWrite: strict parsing and the Allowed clause', () => {
  const missing = expectPlanFail(plan('debugMode', undefined, {}), 'SETTING_REQUEST_INVALID', 'planWrite(debugMode, undefined)');
  check(missing.error === 'A value is required to change debugMode.', 'a missing value has its own sentence');
  const range = expectPlanFail(plan('maxIterations', '600', {}), 'SETTING_VALUE_INVALID', 'planWrite(maxIterations, "600")');
  checkDeep(range.range, { min: 50, max: 500 }, 'the integer failure keeps its range field');
  check(endsWith(range.error, 'Allowed: 50 to 500.'), `the integer failure ends with "Allowed: 50 to 500." (got ${JSON.stringify(range.error)})`);
  check(range.error === 'maxIterations must be a whole number from 50 to 500. Allowed: 50 to 500.', 'the integer sentence keeps the parse sentence and adds the clause');
  const enumFail = expectPlanFail(plan('sttProvider', 'Whisper', {}), 'SETTING_VALUE_INVALID', 'planWrite(sttProvider, "Whisper")');
  checkDeep(enumFail.values, ['browser', 'whisper'], 'the enum failure keeps its values field');
  check(endsWith(enumFail.error, 'Allowed: browser, whisper.'), `the enum failure ends with "Allowed: browser, whisper." (got ${JSON.stringify(enumFail.error)})`);
  const providerEnum = expectPlanFail(plan('modelProvider', 'XAI', {}), 'SETTING_VALUE_INVALID', 'planWrite(modelProvider, "XAI")');
  check(endsWith(providerEnum.error, `Allowed: ${PROVIDER_IDS.join(', ')}.`), 'the modelProvider failure lists the seven providers');
  check((providerEnum.error.match(/Allowed:/g) || []).length === 1, 'the clause is appended once');
  expectPlanFail(plan('fsbAgentCap', '0', {}), 'SETTING_VALUE_INVALID', 'planWrite(fsbAgentCap, "0")');
  check(endsWith(plan('fsbAgentCap', '65', {}).error, 'Allowed: 1 to 64.'), 'fsbAgentCap refuses 65 and states 1 to 64 (never clamped)');
  check(endsWith(plan('fsbMcpSessionRetentionDays', '366', {}).error, 'Allowed: 1 to 365.'), 'fsbMcpSessionRetentionDays refuses 366 (never clamped)');

  const noClause = [
    plan('nope', 'x', {}),
    plan('apiKey', 'x', {}),
    plan('debugMode', undefined, {}),
    plan('debugMode', 5, {}),
    plan('debugMode', 'yes', {}),
    plan('modelName', 'm'.repeat(201), { modelProvider: 'lmstudio' }),
    plan('modelProvider', 'gemini', {}),
    plan('providerKind', 'agent', {}),
  ];
  noClause.forEach((result, index) => {
    check(result && result.ok === false && !String(result.error).includes('Allowed:'), `failure ${index + 1} (${result && result.code}) carries no Allowed clause`);
  });
});

runSection('planWrite: no-op and absent-key semantics (D-13, Pitfall 10)', () => {
  expectPlanOk(plan('debugMode', 'true', {}),
    { key: 'debugMode', value: true, previous: false, patch: { debugMode: true }, changed: ['debugMode'] },
    'writing an absent key is a real write');
  expectPlanOk(plan('debugMode', 'true', { debugMode: true }),
    { key: 'debugMode', value: true, previous: true, patch: {}, changed: [] },
    'writing the stored value is a no-op');
  expectPlanOk(plan('showSidepanelProgress', 'true', { showSidepanelProgress: false }),
    { key: 'showSidepanelProgress', value: true, previous: false, patch: { showSidepanelProgress: true }, changed: ['showSidepanelProgress'] },
    'a stored false flips to true');
  expectPlanOk(plan('showSidepanelProgress', 'true', {}),
    { key: 'showSidepanelProgress', value: true, previous: true, patch: { showSidepanelProgress: true }, changed: ['showSidepanelProgress'] },
    'writing the effective default to an absent key still writes it');
  expectPlanOk(plan('debugMode', 'true', { debugMode: undefined }),
    { key: 'debugMode', value: true, previous: false, patch: { debugMode: true }, changed: ['debugMode'] },
    'a stored undefined counts as absent');
  expectPlanOk(plan('maxIterations', '250', { maxIterations: 250 }),
    { key: 'maxIterations', value: 250, previous: 250, patch: {}, changed: [] },
    'an equal stored integer is a no-op');
  expectPlanOk(plan('maxIterations', '250', { maxIterations: '250' }),
    { key: 'maxIterations', value: 250, previous: '250', patch: { maxIterations: 250 }, changed: ['maxIterations'] },
    'a stored string "250" is not equal to 250, so the number is written');
  expectPlanOk(plan('fsbAgentCap', '12', {}, { agentCapRecommendation: 12 }),
    { key: 'fsbAgentCap', value: 12, previous: 12, patch: { fsbAgentCap: 12 }, changed: ['fsbAgentCap'] },
    'fsbAgentCap previous uses the recommendation, and the absent key is written');
  expectPlanOk(plan('sttProvider', 'whisper', null, null),
    { key: 'sttProvider', value: 'whisper', previous: 'browser', patch: { sttProvider: 'whisper' }, changed: ['sttProvider'] },
    'a null store and ctx are treated as empty');

  const frozenStored = Object.freeze({ debugMode: false, modelProvider: 'xai', geminiApiKey: 'g' });
  const frozenCtx = Object.freeze({ agentCapRecommendation: 9, discoveredModelIds: Object.freeze(['x']) });
  const before = JSON.stringify(frozenStored);
  let threw = null;
  try {
    schema.planWrite('debugMode', 'true', frozenStored, frozenCtx);
    schema.planWrite('modelProvider', 'gemini', frozenStored, frozenCtx);
    schema.planWrite('modelName', 'x', frozenStored, frozenCtx);
  } catch (err) {
    threw = err;
  }
  check(threw === null, `planWrite accepts a frozen store and ctx${threw ? ` (${threw.message})` : ''}`);
  check(JSON.stringify(frozenStored) === before, 'planWrite never modifies the stored object');
});

runSection('planWrite: modelProvider (D-15)', () => {
  const notReady = expectPlanFail(plan('modelProvider', 'gemini', {}), NOT_READY_CODE, 'gemini without its API key');
  check(notReady.error === 'Store the gemini API key in the FSB Control Panel first.', 'the hosted not-ready sentence names the provider');
  expectPlanFail(plan('modelProvider', 'gemini', { geminiApiKey: '   ' }), NOT_READY_CODE, 'gemini with a blank API key');
  expectPlanFail(plan('modelProvider', 'gemini', { geminiApiKey: 5 }), NOT_READY_CODE, 'gemini with a non-string API key');
  expectPlanFail(plan('modelProvider', 'openai', { apiKey: 'k', geminiApiKey: 'g' }), NOT_READY_CODE, 'another provider\'s key does not count');
  expectPlanOk(plan('modelProvider', 'gemini', { geminiApiKey: 'g' }),
    {
      key: 'modelProvider', value: 'gemini', previous: 'xai', patch: { modelProvider: 'gemini', modelName: 'gemini-2.5-flash' }, changed: ['modelProvider', 'modelName'],
      coupled: { modelName: { value: 'gemini-2.5-flash', previous: 'grok-4-1-fast' } }
    },
    'gemini with its key stored also sets the gemini default model (and reports the overwritten model, D-18)');
  for (const provider of HOSTED_IDS) {
    const keyName = EXPECTED_PROVIDER_API_KEY[provider];
    const from = provider === 'xai' ? 'gemini' : 'xai';
    const ready = plan('modelProvider', provider, { modelProvider: from, modelName: 'whatever', [keyName]: 'k' });
    check(ready && ready.ok === true && ready.patch.modelName === EXPECTED_DEFAULT_MODELS[provider],
      `switching to ${provider} sets modelName to ${EXPECTED_DEFAULT_MODELS[provider]}`);
    const blocked = plan('modelProvider', provider, { modelProvider: from });
    check(blocked && blocked.code === NOT_READY_CODE && blocked.error === `Store the ${provider} API key in the FSB Control Panel first.`,
      `switching to ${provider} without ${keyName} is not ready`);
  }
  const custom = expectPlanFail(plan('modelProvider', 'custom', {}), NOT_READY_CODE, 'custom without an endpoint');
  check(custom.error === 'Set a custom endpoint in the FSB Control Panel first.', 'the custom not-ready sentence asks for an endpoint');
  expectPlanFail(plan('modelProvider', 'custom', { customEndpoint: '  ' }), NOT_READY_CODE, 'custom with a blank endpoint');
  expectPlanOk(plan('modelProvider', 'custom', { customEndpoint: 'https://x.example' }),
    {
      key: 'modelProvider', value: 'custom', previous: 'xai', patch: { modelProvider: 'custom', modelName: '' }, changed: ['modelProvider', 'modelName'],
      coupled: { modelName: { value: '', previous: 'grok-4-1-fast' } }
    },
    'custom with an endpoint and no stored model sets an empty modelName');
  // WR-02: custom has no start-time model resolver, so a stored model is kept
  // rather than blanked (the control panel's Save keeps it too).
  expectPlanOk(plan('modelProvider', 'custom', { customEndpoint: 'https://x.example', modelProvider: 'openrouter', modelName: 'vendor/long-model-id' }),
    { key: 'modelProvider', value: 'custom', previous: 'openrouter', patch: { modelProvider: 'custom' }, changed: ['modelProvider'] },
    'custom keeps a stored non-blank modelName and writes only modelProvider');
  expectPlanOk(plan('modelProvider', 'custom', { customEndpoint: 'https://x.example', modelName: '   ' }),
    {
      key: 'modelProvider', value: 'custom', previous: 'xai', patch: { modelProvider: 'custom', modelName: '' }, changed: ['modelProvider', 'modelName'],
      coupled: { modelName: { value: '', previous: '   ' } }
    },
    'custom with a blank stored modelName still writes the empty default');
  expectPlanOk(plan('modelProvider', 'lmstudio', {}),
    {
      key: 'modelProvider', value: 'lmstudio', previous: 'xai', patch: { modelProvider: 'lmstudio', modelName: '' }, changed: ['modelProvider', 'modelName'],
      coupled: { modelName: { value: '', previous: 'grok-4-1-fast' } }
    },
    'lmstudio needs no key and sets an empty modelName (its model is resolved at start)');
  expectPlanOk(plan('modelProvider', 'lmstudio', { modelName: 'grok-4' }),
    {
      key: 'modelProvider', value: 'lmstudio', previous: 'xai', patch: { modelProvider: 'lmstudio', modelName: '' }, changed: ['modelProvider', 'modelName'],
      coupled: { modelName: { value: '', previous: 'grok-4' } }
    },
    'lmstudio still blanks a stored hosted model so the start-time resolver runs');
  expectPlanOk(plan('modelProvider', 'xai', { modelProvider: 'xai' }),
    { key: 'modelProvider', value: 'xai', previous: 'xai', patch: {}, changed: [] },
    'xai when xai is stored needs no API key and is a no-op');
  expectPlanOk(plan('modelProvider', 'xai', { modelProvider: 'xai', modelName: 'grok-4' }),
    { key: 'modelProvider', value: 'xai', previous: 'xai', patch: {}, changed: [] },
    'a same-provider write never resets modelName');
  expectPlanOk(plan('modelProvider', 'xai', { modelName: 'grok-4' }),
    { key: 'modelProvider', value: 'xai', previous: 'xai', patch: { modelProvider: 'xai' }, changed: ['modelProvider'] },
    'an absent provider equal to the default is made explicit without touching modelName');
  expectPlanOk(plan('modelProvider', 'gemini', { modelProvider: 'gemini', modelName: 'gemini-2.5-pro' }),
    { key: 'modelProvider', value: 'gemini', previous: 'gemini', patch: {}, changed: [] },
    'the current provider needs no readiness check even without its key');
  expectPlanOk(plan('modelProvider', 'lmstudio', { modelProvider: 'lmstudio', modelName: 'qwen/local' }),
    { key: 'modelProvider', value: 'lmstudio', previous: 'lmstudio', patch: {}, changed: [] },
    're-selecting lmstudio keeps its model');
  expectPlanOk(plan('modelProvider', 'xai', { modelProvider: 7, apiKey: 'k' }),
    { key: 'modelProvider', value: 'xai', previous: 7, patch: { modelProvider: 'xai' }, changed: ['modelProvider'] },
    'a non-string stored provider counts as the default xai and is corrected');
});

runSection('planWrite: modelName (D-15, cache only, no network)', () => {
  let fetchCalls = 0;
  const hadFetch = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { fetchCalls += 1; throw new Error('planWrite must not call the network'); };
  try {
    expectPlanOk(plan('modelName', 'grok-4-1-fast', { modelProvider: 'xai', modelName: 'grok-4' }),
      { key: 'modelName', value: 'grok-4-1-fast', previous: 'grok-4', patch: { modelName: 'grok-4-1-fast' }, changed: ['modelName'] },
      'a built-in xai id is accepted');
    const invalid = expectPlanFail(plan('modelName', 'made-up-model', { modelProvider: 'xai' }), 'SETTING_VALUE_INVALID', 'an unknown xai model');
    check(Array.isArray(invalid.values) && invalid.values.length > 0 && invalid.values.length <= 25, 'the failure lists between 1 and 25 known ids');
    check(Array.isArray(invalid.values) && invalid.values.includes('grok-4-1-fast'), 'the known ids include grok-4-1-fast');
    check(/Refresh models/.test(invalid.error), 'the error suggests refreshing models');
    check(invalid.error.startsWith('modelName is not a known xai model.'), 'the error names the key and the provider');
    check(Array.isArray(invalid.values) && invalid.error.includes(`Allowed: ${invalid.values.join(', ')}`), 'the error lists the known ids in its Allowed clause');
    check(!invalid.error.includes('(+'), 'no (+N more) when every id fits');
    check(!JSON.stringify(invalid).includes('made-up-model'), 'the failure never echoes the submitted id');
    expectPlanOk(plan('modelName', 'made-up-model', { modelProvider: 'xai' }, { discoveredModelIds: ['made-up-model'] }),
      { key: 'modelName', value: 'made-up-model', previous: 'grok-4-1-fast', patch: { modelName: 'made-up-model' }, changed: ['modelName'] },
      'a discovered id is accepted');

    const discovered = [];
    for (let i = 1; i <= 30; i += 1) discovered.push(`disc-${String(i).padStart(2, '0')}`);
    const known = schema.knownModelIds('xai', discovered);
    const capped = expectPlanFail(plan('modelName', 'not-listed-model', { modelProvider: 'xai' }, { discoveredModelIds: discovered }),
      'SETTING_VALUE_INVALID', 'an unknown id with 36 known ids');
    check(Array.isArray(capped.values) && capped.values.length === 25, 'the values field is capped at 25 ids');
    checkDeep(capped.values, known.slice(0, 25), 'the capped values are the first 25 known ids');
    check(endsWith(capped.error, `(+${known.length - 25} more).`), `the error ends with (+${known.length - 25} more). (got ${JSON.stringify(capped.error)})`);
    check(known.slice(25).every((id) => !capped.error.includes(id)), 'no id after the 25th is named');
    check(!capped.error.includes('not-listed-model'), 'the capped error never echoes the submitted id');

    expectPlanFail(plan('modelName', 'gemini-2.5-flash', {}), 'SETTING_VALUE_INVALID', 'an absent provider counts as xai, so a gemini id is refused');
    expectPlanFail(plan('modelName', '', { modelProvider: 'openai' }), 'SETTING_VALUE_INVALID', 'a hosted provider refuses an empty model name');
    expectPlanOk(plan('modelName', 'gemini-2.5-pro', { modelProvider: 'gemini' }),
      { key: 'modelName', value: 'gemini-2.5-pro', previous: 'grok-4-1-fast', patch: { modelName: 'gemini-2.5-pro' }, changed: ['modelName'] },
      'a built-in gemini id is accepted for gemini');
    expectPlanOk(plan('modelName', '', { modelProvider: 'lmstudio', modelName: 'qwen' }),
      { key: 'modelName', value: '', previous: 'qwen', patch: { modelName: '' }, changed: ['modelName'] },
      'lmstudio accepts an empty model name');
    expectPlanOk(plan('modelName', ' vendor/local-model ', { modelProvider: 'lmstudio' }),
      { key: 'modelName', value: 'vendor/local-model', previous: 'grok-4-1-fast', patch: { modelName: 'vendor/local-model' }, changed: ['modelName'] },
      'lmstudio accepts any bounded string (trimmed)');
    check(plan('modelName', 'm'.repeat(200), { modelProvider: 'custom' }).ok === true, 'custom accepts a 200-character model name');
    expectPlanFail(plan('modelName', 'm'.repeat(201), { modelProvider: 'custom' }), 'SETTING_VALUE_INVALID', 'custom still enforces the length bound');
    const unknownProvider = expectPlanFail(plan('modelName', 'x', { modelProvider: 'retired-provider' }), NOT_READY_CODE, 'a stored provider outside the seven');
    check(!unknownProvider.error.includes('retired-provider'), 'the unknown-provider sentence does not echo the stored provider');
  } finally {
    if (hadFetch) globalThis.fetch = originalFetch;
    else delete globalThis.fetch;
  }
  check(fetchCalls === 0, 'planWrite never called fetch');
});

runSection('planWrite: providerKind and agentProviderId (D-15, A3)', () => {
  const shipped = (id) => id === 'claude-code' || id === 'grok-build';
  const agentCtx = { isShippedAgentId: shipped, shippedAgentIds: ['claude-code', 'grok-build'] };
  expectPlanOk(plan('providerKind', 'agent', { agentProviderId: 'claude-code' }, { isShippedAgentId: (id) => id === 'claude-code' }),
    { key: 'providerKind', value: 'agent', previous: 'api', patch: { providerKind: 'agent' }, changed: ['providerKind'] },
    'agent with a shipped agent id is accepted');
  const noChecker = expectPlanFail(plan('providerKind', 'agent', { agentProviderId: 'claude-code' }, {}), NOT_READY_CODE, 'agent without isShippedAgentId (fails closed)');
  check(noChecker.error === 'Choose an agent provider in the FSB Control Panel first.', 'the agent not-ready sentence is fixed');
  expectPlanFail(plan('providerKind', 'agent', { agentProviderId: 'claude-code' }), NOT_READY_CODE, 'agent with no ctx at all');
  expectPlanFail(plan('providerKind', 'agent', { agentProviderId: '' }, agentCtx), NOT_READY_CODE, 'agent with an empty agent id');
  expectPlanFail(plan('providerKind', 'agent', {}, agentCtx), NOT_READY_CODE, 'agent with no stored agent id');
  expectPlanFail(plan('providerKind', 'agent', { agentProviderId: 'codex' }, agentCtx), NOT_READY_CODE, 'agent with a retired agent id');
  expectPlanFail(plan('providerKind', 'agent', { agentProviderId: 'claude-code' }, { isShippedAgentId: () => { throw new Error('boom'); } }),
    NOT_READY_CODE, 'agent when the checker throws');
  expectPlanFail(plan('providerKind', 'agent', { agentProviderId: 'claude-code' }, { isShippedAgentId: () => 1 }),
    NOT_READY_CODE, 'agent when the checker returns a truthy non-true value');
  expectPlanOk(plan('providerKind', 'api', {}),
    { key: 'providerKind', value: 'api', previous: 'api', patch: { providerKind: 'api' }, changed: ['providerKind'] },
    'api when api is already in effect needs no readiness check (absent key written)');
  expectPlanOk(plan('providerKind', 'api', { providerKind: 'api', modelProvider: 'openai' }),
    { key: 'providerKind', value: 'api', previous: 'api', patch: {}, changed: [] },
    'restating api is a no-op even when the provider has no key');
  expectPlanOk(plan('providerKind', 'api', { providerKind: 'agent', agentProviderId: '', apiKey: 'k' }),
    { key: 'providerKind', value: 'api', previous: 'agent', patch: { providerKind: 'api' }, changed: ['providerKind'] },
    'api is accepted from agent when the provider in effect (xai) has its key');

  // WR-04: switching to api uses the modelProvider readiness rule.
  const apiNoKey = expectPlanFail(plan('providerKind', 'api', { providerKind: 'agent', agentProviderId: 'claude-code', modelProvider: 'openai' }),
    NOT_READY_CODE, 'api from agent when openai has no stored key');
  check(apiNoKey.error === 'Store the openai API key in the FSB Control Panel first.', 'the api not-ready sentence names the provider');
  expectPlanFail(plan('providerKind', 'api', { providerKind: 'agent', modelProvider: 'openai', apiKey: 'k' }),
    NOT_READY_CODE, 'another provider\'s key does not make api ready');
  expectPlanFail(plan('providerKind', 'api', { providerKind: 'agent' }), NOT_READY_CODE, 'api from agent with the default xai and no key');
  const apiCustom = expectPlanFail(plan('providerKind', 'api', { providerKind: 'agent', modelProvider: 'custom', customEndpoint: ' ' }),
    NOT_READY_CODE, 'api from agent when custom has no endpoint');
  check(apiCustom.error === 'Set a custom endpoint in the FSB Control Panel first.', 'the custom api sentence asks for an endpoint');
  expectPlanOk(plan('providerKind', 'api', { providerKind: 'agent', modelProvider: 'custom', customEndpoint: 'https://x.example' }),
    { key: 'providerKind', value: 'api', previous: 'agent', patch: { providerKind: 'api' }, changed: ['providerKind'] },
    'api from agent with custom and an endpoint is accepted');
  expectPlanOk(plan('providerKind', 'api', { providerKind: 'agent', modelProvider: 'lmstudio' }),
    { key: 'providerKind', value: 'api', previous: 'agent', patch: { providerKind: 'api' }, changed: ['providerKind'] },
    'api from agent with lmstudio needs no key');
  const apiRetired = expectPlanFail(plan('providerKind', 'api', { providerKind: 'agent', modelProvider: 'retired-provider' }),
    NOT_READY_CODE, 'api from agent with a stored provider outside the seven');
  check(!apiRetired.error.includes('retired-provider'), 'the api not-ready sentence never echoes a stored provider');

  const retired = expectPlanFail(plan('agentProviderId', 'codex', {}, agentCtx), 'SETTING_VALUE_INVALID', 'a retired agent id');
  checkDeep(retired.values, ['', 'claude-code', 'grok-build'], 'the agent-id failure lists "" and the shipped ids');
  check(endsWith(retired.error, 'Allowed: "", claude-code, grok-build.'), `the agent-id failure ends with the shipped ids (got ${JSON.stringify(retired.error)})`);
  check(!retired.error.includes('codex'), 'the agent-id failure never echoes the submitted id');
  const noList = expectPlanFail(plan('agentProviderId', 'codex', {}, { isShippedAgentId: shipped }), 'SETTING_VALUE_INVALID', 'a retired agent id without the id list');
  check(!('values' in noList) && !noList.error.includes('Allowed:'), 'without shippedAgentIds there is no values field and no clause');
  expectPlanFail(plan('agentProviderId', 'claude-code', {}, {}), 'SETTING_VALUE_INVALID', 'a shipped id without isShippedAgentId (fails closed)');
  expectPlanOk(plan('agentProviderId', 'claude-code', {}, agentCtx),
    { key: 'agentProviderId', value: 'claude-code', previous: '', patch: { agentProviderId: 'claude-code' }, changed: ['agentProviderId'] },
    'a shipped agent id is accepted');
  expectPlanOk(plan('agentProviderId', 'claude-code', { agentProviderId: 'claude-code' }, agentCtx),
    { key: 'agentProviderId', value: 'claude-code', previous: 'claude-code', patch: {}, changed: [] },
    'the stored agent id is a no-op');
  const clearing = expectPlanFail(plan('agentProviderId', '', { providerKind: 'agent', agentProviderId: 'claude-code' }, agentCtx),
    NOT_READY_CODE, 'clearing the agent id while providerKind is agent');
  check(!clearing.error.includes('Allowed:'), 'the clearing refusal carries no clause');
  expectPlanOk(plan('agentProviderId', '', { providerKind: 'api', agentProviderId: 'claude-code' }, agentCtx),
    { key: 'agentProviderId', value: '', previous: 'claude-code', patch: { agentProviderId: '' }, changed: ['agentProviderId'] },
    'clearing the agent id while providerKind is api is accepted');
  expectPlanOk(plan('agentProviderId', '', {}),
    { key: 'agentProviderId', value: '', previous: '', patch: { agentProviderId: '' }, changed: ['agentProviderId'] },
    'an empty agent id needs no checker');
});

runSection('planWrite: patches only ever hold schema keys', () => {
  const writable = schema.keys().filter((key) => schema.isWritable(key));
  check(planSuccesses.length > 20, `the cases above produced successful plans (${planSuccesses.length})`);
  const patchKeys = new Set();
  for (const result of planSuccesses) for (const key of Object.keys(result.patch)) patchKeys.add(key);
  check([...patchKeys].every((key) => writable.includes(key)), `every patched key is a writable schema key (${[...patchKeys].join(', ')})`);
  check(planSuccesses.every((result) => Object.keys(result.patch).length <= 2), 'a patch holds at most two keys');
  check(planSuccesses.every((result) => isDeepEqual(result.changed, Object.keys(result.patch))), 'changed always lists the patch keys');
  check(planSuccesses.every((result) => isDeepEqual(Object.keys(result.coupled || {}), result.changed.filter((key) => key !== result.key))),
    'coupled lists exactly the patched keys other than the named key (D-18)');
  check(planSuccesses.every((result) => !('coupled' in result) || Object.keys(result.coupled).length > 0),
    'coupled is absent rather than empty for a one-key write');
  check(planSuccesses.every((result) => Object.keys(result.coupled || {}).every((key) => result.coupled[key].value === result.patch[key])),
    'every coupled value is the value written');
  check(planSuccesses.filter((result) => Object.keys(result.patch).length === 2).every((result) => result.key === 'modelProvider'),
    'only a modelProvider change writes two keys');
});

runSection('planWrite: value-free failures, Allowed clause included', () => {
  const RAW = 'SENTINEL-raw';
  const agentCtx = { isShippedAgentId: (id) => id === 'claude-code', shippedAgentIds: ['claude-code', 'grok-build'] };
  const cases = [
    ['debugMode', RAW, {}, {}],
    ['maxIterations', `5${RAW}`, {}, {}],
    ['sttProvider', RAW, {}, {}],
    ['modelProvider', RAW, {}, {}],
    ['providerKind', RAW, {}, {}],
    ['modelName', RAW, { modelProvider: 'xai' }, {}],
    ['modelName', RAW, { modelProvider: 'anthropic' }, { discoveredModelIds: ['a', 'b'] }],
    ['modelName', RAW, { modelProvider: 'retired-provider' }, {}],
    ['modelName', `${'x'.repeat(201)}${RAW}`, { modelProvider: 'lmstudio' }, {}],
    ['agentProviderId', RAW, {}, agentCtx],
    ['agentProviderId', RAW, {}, {}],
    ['apiKey', RAW, {}, {}],
    ['serverHashKey', RAW, {}, {}],
    ['customEndpoint', `https://${RAW}.example/`, {}, {}],
    ['nope', RAW, {}, {}],
    [`${RAW} key`, RAW, {}, {}],
  ];
  for (const [key, raw, stored, ctx] of cases) {
    const result = schema.planWrite(key, raw, stored, ctx);
    const label = `planWrite(${schema.safeKeyLabel(key)}, <sentinel>)`;
    check(result && result.ok === false, `${label} fails`);
    check(!JSON.stringify(result).includes('SENTINEL'), `${label} failure holds no raw value`);
  }
});

runSection('planWrite: fixture instances (D-17)', () => {
  const FAST_KEY = 'fsbFixtureFastMode';
  const fastFixture = schema.create([...schema.entries, { key: FAST_KEY, type: 'boolean', cls: 'writable', default: false }]);
  check(typeof fastFixture.planWrite === 'function', 'a fixture instance has planWrite');
  for (const name of ['HOSTED_PROVIDERS', 'PROVIDER_API_KEY', 'knownModelIds', 'discoveredIdsFromCache', 'formatAllowed']) {
    check(fastFixture[name] === schema[name], `the fixture instance carries the static ${name}`);
  }
  checkDeep(fastFixture.planWrite(FAST_KEY, 'true', {}, {}),
    { ok: true, key: FAST_KEY, value: true, previous: false, patch: { [FAST_KEY]: true }, changed: [FAST_KEY] },
    'the fixture key plans a write with no tool change');
  check(schema.planWrite(FAST_KEY, 'true', {}, {}).code === 'SETTING_UNKNOWN_KEY', 'the production schema refuses the fixture key');
  check(fastFixture.planWrite('modelProvider', 'gemini', { geminiApiKey: 'g' }, {}).changed.join() === 'modelProvider,modelName',
    'the fixture instance keeps the provider rules');
});

runSection('planWrite in the SW and panel scopes (lazy Config access)', () => {
  check(vm.runInContext('self.FsbSettingsSchema.planWrite("modelProvider", "gemini", { geminiApiKey: "g" }, {}).patch.modelName', swContext)
    === 'gemini-2.5-flash', 'the SW scope plans a provider change from Config.DEFAULT_MODELS');
  check(vm.runInContext('self.FsbSettingsSchema.planWrite("modelName", "grok-4", { modelProvider: "xai" }, {}).ok', swContext) === true,
    'the SW scope reads the built-in models from the config singleton');
  check(chromeCalls === 1, 'planning in the SW scope makes no chrome call');
  check(vm.runInContext('FsbSettingsSchema.planWrite("maxIterations", "70", {}, {}).changed.join()', panelContext) === 'maxIterations',
    'the panel scope plans a write');
});

// ===========================================================================
// 66.1-02 Task 2: the schema is pinned to the control panel. D-09 inventory
// (every panel writer), D-12 defaults (three default copies, known
// divergences pinned, not fixed), D-14 bounds (steppers and clamp helpers).
// Source extraction only reads files.
// ===========================================================================
const REPO_ROOT = path.join(__dirname, '..');
function readRepo(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
const OPTIONS_SOURCE = readRepo('extension/ui/options.js');
const CONTROL_PANEL_HTML = readRepo('extension/ui/control_panel.html');
const INIT_CONFIG_SOURCE = readRepo('extension/config/init-config.js');
const INSTALL_IDENTITY_SOURCE = readRepo('extension/utils/install-identity.js');
const INSTALL_IDENTITY_UI_SOURCE = readRepo('extension/ui/install-identity-ui.js');
const MODEL_DISCOVERY_SOURCE = readRepo('extension/ai/model-discovery.js');
const SIDEPANEL_SOURCE = readRepo('extension/ui/sidepanel.js');
const WS_CLIENT_SOURCE = readRepo('extension/ws/ws-client.js');

function sliceBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) return null;
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) return null;
  return text.slice(start, end);
}

function countOf(text, needle) {
  return text.split(needle).length - 1;
}

// D-09: the property names of saveSettings' `const settings = {` object, at
// the object's own indent (nested IIFE lines are deeper). Returns null when
// the function, the object or its closing `  };` line cannot be found, so a
// refactor fails loudly instead of yielding a short list.
function extractSaveSettingsKeys(sourceText) {
  const body = sliceBetween(sourceText, 'function saveSettings() {', 'function discardChanges() {');
  if (body === null) return null;
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*const settings = \{\s*$/.test(line));
  if (start === -1) return null;
  const propertyIndent = `${lines[start].match(/^(\s*)/)[1]}  `;
  const keys = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] === '  };') return keys;
    const match = lines[i].match(/^(\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/);
    if (match && match[1] === propertyIndent) keys.push(match[2]);
  }
  return null;
}

// The four control-panel writers outside saveSettings (D-09).
const OTHER_PANEL_WRITERS = ['autoAnalyzeMemories', 'fsbTelemetryOptOut', 'serverUrl', 'serverHashKey'];

// Keys the panel or Config knows that are deliberately not settings (D-09).
const EXCLUDED_FROM_SCHEMA = {
  speedMode: 'legacy: Config.defaults marks it deprecated in favour of modelName; no control-panel writer',
  enableSavedPayments: 'no reader or writer: the control_panel.html checkbox is never read or saved by any script',
  serverSyncEnabled: 'no control-panel writer (only Config.defaults and init-config.js carry it)',
  fsb_sunset_notice_dismissed: 'UI dismissal flag the panel writes when the sunset notice is closed, not a setting',
};

function inventoryDiff(panelKeys, schemaKeys) {
  const panelSet = new Set(panelKeys);
  const schemaSet = new Set(schemaKeys);
  return {
    // Written by the panel with no schema entry (a Phase 68 key added to saveSettings alone lands here).
    extra: [...panelSet].filter((key) => !schemaSet.has(key)),
    // Schema entries no panel writer writes.
    missing: [...schemaSet].filter((key) => !panelSet.has(key)),
  };
}

runSection('D-09 inventory parity: schema keys equal every control-panel writer', () => {
  const saveKeys = extractSaveSettingsKeys(OPTIONS_SOURCE);
  check(Array.isArray(saveKeys), 'extractSaveSettingsKeys finds the saveSettings settings object');
  const keysFound = saveKeys || [];
  check(keysFound.length === 32, `saveSettings writes 32 keys (got ${keysFound.length})`);
  check(new Set(keysFound).size === keysFound.length, 'saveSettings lists each key once');
  check(keysFound.includes('fsbTriggerCap') && keysFound.includes('fsbMcpSessionRetentionDays'),
    'the extractor reads past the nested IIFEs to the last keys');
  check(!keysFound.includes('raw') && !keysFound.includes('var'), 'the extractor ignores lines inside the nested IIFEs');
  const inventory = [...keysFound, ...OTHER_PANEL_WRITERS];
  const diff = inventoryDiff(inventory, schema.keys());
  check(diff.extra.length === 0, `every panel-written key has a schema entry (extra: ${diff.extra.join(', ') || 'none'})`);
  check(diff.missing.length === 0, `every schema key has a panel writer (missing: ${diff.missing.join(', ') || 'none'})`);
  check(inventory.length === schema.keys().length, 'the inventory and the schema have the same size');

  for (const [key, reason] of Object.entries(EXCLUDED_FROM_SCHEMA)) {
    check(schema.get(key) === null, `${key} is not a schema key (${reason})`);
    check(!inventory.includes(key), `${key} is not in the panel settings inventory`);
  }
  check(OPTIONS_SOURCE.includes('chrome.storage.local.set({ fsb_sunset_notice_dismissed: true })'),
    'options.js still writes fsb_sunset_notice_dismissed as a UI flag');

  // The four writers outside saveSettings still exist.
  check(OPTIONS_SOURCE.includes('chrome.storage.local.set({ autoAnalyzeMemories'), 'options.js still writes autoAnalyzeMemories');
  check(OPTIONS_SOURCE.includes('chrome.storage.local.set({ serverUrl, serverHashKey'), 'options.js still writes serverUrl and serverHashKey together');
  check(/var FSB_TELEMETRY_OPT_OUT_KEY = 'fsbTelemetryOptOut';/.test(INSTALL_IDENTITY_SOURCE),
    'install-identity.js FSB_TELEMETRY_OPT_OUT_KEY is fsbTelemetryOptOut');
  check(INSTALL_IDENTITY_SOURCE.includes('chrome.storage.local.set({ [FSB_TELEMETRY_OPT_OUT_KEY]:'),
    'install-identity.js writes FSB_TELEMETRY_OPT_OUT_KEY');
  check(INSTALL_IDENTITY_UI_SOURCE.includes('chrome.storage.local.set({ fsbTelemetryOptOut:'),
    'install-identity-ui.js keeps its direct fsbTelemetryOptOut fallback write');

  // Self-check: a key added to saveSettings without a schema entry fails (SC4).
  const marker = 'const settings = {\n';
  const objectAt = OPTIONS_SOURCE.indexOf(marker, OPTIONS_SOURCE.indexOf('function saveSettings() {'));
  check(objectAt !== -1, 'the probe finds the saveSettings settings object');
  const probed = `${OPTIONS_SOURCE.slice(0, objectAt + marker.length)}    fsbParityProbe: true,\n${OPTIONS_SOURCE.slice(objectAt + marker.length)}`;
  const probedKeys = extractSaveSettingsKeys(probed) || [];
  check(probedKeys.includes('fsbParityProbe'), 'extractSaveSettingsKeys returns an injected fsbParityProbe key');
  const probedDiff = inventoryDiff([...probedKeys, ...OTHER_PANEL_WRITERS], schema.keys());
  checkDeep(probedDiff, { extra: ['fsbParityProbe'], missing: [] }, 'the inventory comparison reports fsbParityProbe as an extra key');
  const removed = OPTIONS_SOURCE.replace('    fsbTriggerCap: (function() {', '    notTheTriggerCap: (function() {');
  const removedDiff = inventoryDiff([...(extractSaveSettingsKeys(removed) || []), ...OTHER_PANEL_WRITERS], schema.keys());
  check(removedDiff.missing.includes('fsbTriggerCap'), 'a schema key dropped from saveSettings is reported as missing');
  check(extractSaveSettingsKeys(OPTIONS_SOURCE.replace('function discardChanges() {', 'function discardEdits() {')) === null,
    'the extractor returns null when its end marker is gone');
  const closeAt = OPTIONS_SOURCE.indexOf('\n  };\n', objectAt);
  check(closeAt !== -1, 'the probe finds the settings object closing line');
  const unclosed = `${OPTIONS_SOURCE.slice(0, closeAt)}\n  }; // moved${OPTIONS_SOURCE.slice(closeAt + '\n  };'.length)}`;
  check(extractSaveSettingsKeys(unclosed) === null, 'the extractor returns null when the object has no exact closing line');
});

// D-12: the value each copy should hold, and the source that proves the
// effective value. Each entry is pinned exactly: a fix or a new drift fails.
const ABSENT = Object.freeze({ absent: true });
const KNOWN_DEFAULT_DIVERGENCES = {
  showSidepanelProgress: {
    schema: true,
    config: false,
    initConfig: false,
    options: true,
    proof: ['extension/ui/sidepanel.js', SIDEPANEL_SOURCE, 'showSidepanelProgressEnabled = stored.showSidepanelProgress ?? true;'],
  },
  serverUrl: {
    schema: 'https://full-selfbrowsing.com',
    config: 'https://fsb-server.fly.dev',
    initConfig: 'https://fsb-server.fly.dev',
    options: ABSENT,
    proof: ['extension/ws/ws-client.js', WS_CLIENT_SOURCE, "const FSB_SERVER_URL = 'https://full-selfbrowsing.com';"],
  },
};

function schemaDefaultFor(key) {
  const entry = schema.get(key);
  if (entry.cls === 'endpoint') return entry.default;
  return schema.projectAll({}, {}).settings[key];
}

function loadOptionsDefaultSettings() {
  const literal = sliceBetween(OPTIONS_SOURCE, 'const defaultSettings = {', '\n};\n');
  if (literal === null) return null;
  return vm.runInNewContext(`(${literal.slice('const defaultSettings = '.length)}\n})`, {}, { filename: 'options.js defaultSettings' });
}

// The onboarding-first-run harness, steered onto init-config's PRODUCTION
// branch: isDevelopment() is !getManifest().update_url, and the dev branch
// writes debugMode: true (a false drift).
async function loadInitConfigProductionDefaults() {
  const storageSets = [];
  let installListener = null;
  const context = {
    console,
    window: {},
    chrome: {
      runtime: {
        getManifest: () => ({ version: '0.0.0-test', update_url: 'https://clients2.google.com/service/update2/crx' }),
        getURL: (rel) => `chrome-extension://fsb/${rel}`,
        onInstalled: { addListener: (fn) => { installListener = fn; } },
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async (patch) => { storageSets.push(patch); },
        },
      },
      tabs: { create: async () => {} },
    },
  };
  vm.runInNewContext(INIT_CONFIG_SOURCE, context, { filename: 'init-config.js' });
  if (typeof installListener !== 'function') return { patch: null, storageSets, defaultConfig: null };
  await installListener({ reason: 'install' });
  const patch = storageSets.find((set) => set && Object.prototype.hasOwnProperty.call(set, 'modelProvider')) || null;
  const defaultConfig = context.window.initConfig ? context.window.initConfig.defaultConfig : null;
  return { patch, storageSets, defaultConfig };
}

async function runDefaultParity() {
  console.log('\n--- D-12 default parity: schema effective defaults vs the three default copies ---');
  const init = await loadInitConfigProductionDefaults();
  check(init.patch !== null, 'init-config.js writes its defaults on install');
  check(init.defaultConfig !== null, 'init-config.js exposes window.initConfig.defaultConfig');
  check(init.patch !== null && init.defaultConfig !== null && isDeepEqual({ ...init.patch }, { ...init.defaultConfig }),
    'the install patch deep-equals window.initConfig.defaultConfig (production branch)');
  check(init.patch !== null && init.patch.debugMode === false, 'the harness took the production branch (debugMode false, not the dev true)');
  check(init.storageSets.length === 2 && init.storageSets.some((set) => set && 'fsbOnboardingAutoOpenedAt' in set),
    'the separate onboarding timestamp write is ignored');
  const optionsDefaults = loadOptionsDefaultSettings();
  check(optionsDefaults !== null && typeof optionsDefaults === 'object', 'options.js defaultSettings evaluates from its source slice');

  const copies = [
    { id: 'config', label: 'Config.defaults', values: new Config().defaults },
    { id: 'initConfig', label: 'init-config.js', values: init.patch || {} },
    { id: 'options', label: 'options.js defaultSettings', values: optionsDefaults || {} },
  ];
  checkDeep(Object.keys(KNOWN_DEFAULT_DIVERGENCES), ['showSidepanelProgress', 'serverUrl'],
    'KNOWN_DEFAULT_DIVERGENCES holds exactly showSidepanelProgress and serverUrl');

  let compared = 0;
  for (const key of schema.keys()) {
    const expected = schemaDefaultFor(key);
    const divergence = KNOWN_DEFAULT_DIVERGENCES[key];
    if (divergence) {
      check(divergence.schema === expected, `${key}: the schema still carries the effective default ${JSON.stringify(divergence.schema)}`);
      const [proofFile, proofSource, proofLine] = divergence.proof;
      check(proofSource.includes(proofLine), `${key}: ${proofFile} still proves the effective default (${proofLine})`);
    }
    for (const copy of copies) {
      const has = Object.prototype.hasOwnProperty.call(copy.values, key);
      const actual = has ? copy.values[key] : ABSENT;
      if (divergence) {
        const pinned = divergence[copy.id];
        check(actual === pinned,
          `${key}: ${copy.label} still holds the pinned ${pinned === ABSENT ? 'absence' : JSON.stringify(pinned)} (got ${actual === ABSENT ? 'absent' : JSON.stringify(actual)})`);
      } else if (has) {
        compared += 1;
        check(actual === expected, `${key}: ${copy.label} default ${JSON.stringify(actual)} equals the schema default ${JSON.stringify(expected)}`);
      }
    }
  }
  check(compared >= 70, `the ordinary equality check compared ${compared} copy values`);
  for (const [key, divergence] of Object.entries(KNOWN_DEFAULT_DIVERGENCES)) {
    const differs = ['config', 'initConfig', 'options'].some((id) => divergence[id] !== ABSENT && divergence[id] !== divergence.schema);
    check(differs, `${key}: the pinned divergence is a real disagreement`);
  }
  const fsbDefaultServerUrl = OPTIONS_SOURCE.match(/const FSB_DEFAULT_SERVER_URL = '([^']+)';/);
  check(Boolean(fsbDefaultServerUrl) && fsbDefaultServerUrl[1] === schemaDefaultFor('serverUrl'),
    'options.js FSB_DEFAULT_SERVER_URL equals the schema serverUrl default');
  check(OPTIONS_SOURCE.includes('result.autoAnalyzeMemories !== false'), 'options.js still reads autoAnalyzeMemories as default true');
  check(schemaDefaultFor('autoAnalyzeMemories') === true, 'the schema autoAnalyzeMemories default is true');

  // fsbAgentCap is a computed default, not a divergence: its fallback equals options.js 8.
  check(!('fsbAgentCap' in KNOWN_DEFAULT_DIVERGENCES), 'fsbAgentCap is not in KNOWN_DEFAULT_DIVERGENCES');
  check(schema.projectAll({}, {}).settings.fsbAgentCap === 8 && optionsDefaults !== null && optionsDefaults.fsbAgentCap === 8,
    'the fsbAgentCap fallback 8 equals options.js defaultSettings.fsbAgentCap');
  check(!('fsbAgentCap' in copies[0].values) && !('fsbAgentCap' in copies[1].values), 'Config.defaults and init-config.js have no fsbAgentCap');
  check(schema.effectiveDefault('fsbAgentCap', { agentCapRecommendation: 12 }) === 12, 'a recommendation of 12 is the fsbAgentCap default');
  for (const rec of [0, 65, 7.5]) {
    check(schema.effectiveDefault('fsbAgentCap', { agentCapRecommendation: rec }) === 8, `a recommendation of ${rec} falls back to 8`);
  }
}

// D-14: the stepper input id for every integer key.
const STEPPER_INPUT_IDS = {
  maxIterations: 'maxIterationsSlider',
  maxDOMElements: 'maxDOMElementsSlider',
  elementCacheSize: 'elementCacheSizeCustom',
  fsbAgentCap: 'fsbAgentCap',
  fsbTriggerCap: 'fsbTriggerCap',
  fsbMcpSessionRetentionDays: 'fsbMcpSessionRetentionDays',
};

// The data-min/data-max of the .fsb-stepper div that directly holds the input.
function stepperBounds(html, inputId) {
  const idAttr = `id="${inputId}"`;
  if (countOf(html, idAttr) !== 1) return null;
  const idIndex = html.indexOf(idAttr);
  const open = html.lastIndexOf('<div class="fsb-stepper"', idIndex);
  if (open === -1 || html.slice(open, idIndex).includes('</div>')) return null;
  const tag = html.slice(open, html.indexOf('>', open) + 1);
  const min = tag.match(/\bdata-min="(-?\d+)"/);
  const max = tag.match(/\bdata-max="(-?\d+)"/);
  if (!min || !max) return null;
  return { min: Number(min[1]), max: Number(max[1]) };
}

function literalBounds(body, variable) {
  if (typeof body !== 'string') return null;
  const low = body.match(new RegExp(`if \\(${variable} < (\\d+)\\) return (\\d+);`));
  const high = body.match(new RegExp(`if \\(${variable} > (\\d+)\\) return (\\d+);`));
  if (!low || !high || low[1] !== low[2] || high[1] !== high[2]) return null;
  return { min: Number(low[1]), max: Number(high[1]) };
}

runSection('D-14 bounds parity: schema bounds equal the panel steppers and clamps', () => {
  const integerKeys = schema.entries.filter((entry) => entry.type === 'integer').map((entry) => entry.key);
  checkDeep(integerKeys.slice().sort(), Object.keys(STEPPER_INPUT_IDS).sort(), 'every integer key has a mapped control-panel stepper');
  for (const key of integerKeys) {
    const entry = schema.get(key);
    const bounds = stepperBounds(CONTROL_PANEL_HTML, STEPPER_INPUT_IDS[key]);
    checkDeep(bounds, { min: entry.min, max: entry.max },
      `${key}: the #${STEPPER_INPUT_IDS[key]} stepper data-min/data-max equal the schema bounds ${entry.min}-${entry.max}`);
  }
  check(stepperBounds(CONTROL_PANEL_HTML, 'elementCacheSizePreset') === null, 'stepperBounds refuses an input outside a stepper');
  const presetBlock = sliceBetween(CONTROL_PANEL_HTML, '<select id="elementCacheSizePreset"', '</select>') || '';
  const presetValues = [...presetBlock.matchAll(/<option value="(\d+)"/g)].map((match) => Number(match[1]));
  const cacheEntry = schema.get('elementCacheSize');
  check(presetValues.length >= 3 && presetValues.every((value) => value >= cacheEntry.min && value <= cacheEntry.max),
    `the element cache presets (${presetValues.join(', ')}) sit inside the schema bounds`);

  const retentionBody = sliceBetween(OPTIONS_SOURCE, 'function clampMcpSessionRetentionDays(value) {', '\n}\n');
  checkDeep(literalBounds(retentionBody, 'days'), { min: 1, max: 365 }, 'clampMcpSessionRetentionDays clamps to 1 and 365');
  const retention = schema.get('fsbMcpSessionRetentionDays');
  checkDeep(literalBounds(retentionBody, 'days'), { min: retention.min, max: retention.max }, 'clampMcpSessionRetentionDays equals the schema bounds');

  const saveBody = sliceBetween(OPTIONS_SOURCE, 'function saveSettings() {', 'function discardChanges() {');
  const triggerBody = sliceBetween(saveBody || '', 'fsbTriggerCap: (function() {', '})(),');
  const trigger = schema.get('fsbTriggerCap');
  checkDeep(literalBounds(triggerBody, 'raw'), { min: 1, max: 64 }, 'the saveSettings fsbTriggerCap IIFE returns 1 and 64 at its bounds');
  checkDeep(literalBounds(triggerBody, 'raw'), { min: trigger.min, max: trigger.max }, 'the fsbTriggerCap clamp equals the schema bounds');
  check(typeof triggerBody === 'string' && triggerBody.includes(`if (!Number.isFinite(raw)) return ${trigger.default};`),
    'the fsbTriggerCap fallback equals the schema default');

  const agentCap = schema.get('fsbAgentCap');
  const panelAgentClamp = sliceBetween(OPTIONS_SOURCE, 'function clampAgentCapValue(value, fallbackValue) {', '\n}\n');
  checkDeep(literalBounds(panelAgentClamp, 'raw'), { min: agentCap.min, max: agentCap.max }, 'the clampAgentCapValue fallback clamps to the schema bounds');
  const agentCapModule = require('../extension/utils/agent-cap-recommendation.js');
  check(agentCapModule.clampAgentCap(0) === 1 && agentCapModule.clampAgentCap(1000) === 64, 'clampAgentCap(0) is 1 and clampAgentCap(1000) is 64');
  check(agentCapModule.clampAgentCap(0) === agentCap.min && agentCapModule.clampAgentCap(1000) === agentCap.max, 'clampAgentCap equals the schema bounds');
  check(agentCapModule.AGENT_CAP_MIN === agentCap.min && agentCapModule.AGENT_CAP_MAX === agentCap.max, 'AGENT_CAP_MIN/MAX equal the schema bounds');

  const sttLine = (saveBody || '').match(/sttProvider:[^\n]*\?\s*'([^']+)'\s*:\s*'([^']+)'/);
  check(Boolean(sttLine), 'saveSettings still writes sttProvider from a two-literal choice');
  checkDeep(sttLine ? [sttLine[1], sttLine[2]].sort() : null, [...schema.get('sttProvider').values].sort(),
    'the sttProvider values equal the two literals saveSettings writes (whisper, browser)');
  checkDeep([...schema.get('modelProvider').values], PROVIDER_IDS, 'the modelProvider values equal the seven INV-03 provider ids');
});

runSection('discovery-rule tripwire: discoveredIdsFromCache mirrors getDiscoveredModelIds', () => {
  const body = sliceBetween(MODEL_DISCOVERY_SOURCE, 'function getDiscoveredModelIds(provider) {', '\n  }\n');
  check(typeof body === 'string', 'model-discovery.js still defines getDiscoveredModelIds(provider)');
  for (const token of ["const prefix = provider + ':';", 'key.startsWith(prefix)', 'entry.expiresAt <= now', 'entry.result.ok !== true', 'm.id']) {
    check(typeof body === 'string' && body.includes(token), `getDiscoveredModelIds still contains ${token}`);
  }
});

async function runAsyncChecks() {
  await runDefaultParity().catch((err) => {
    check(false, `D-12 default parity threw: ${err && err.message}`);
  });

  console.log('\n--- PROVIDER_API_KEY parity with Config.prototype.getApiKey ---');
  try {
    const markerConfig = new Config();
    const markers = {};
    for (const key of SECRET_KEYS) markers[key] = `marker-${key}`;
    markerConfig.loadFromStorage = async () => ({ ...markerConfig.defaults, ...markers });
    for (const provider of PROVIDER_IDS) {
      const got = await markerConfig.getApiKey(provider);
      const mapped = schema.PROVIDER_API_KEY ? schema.PROVIDER_API_KEY[provider] : undefined;
      if (mapped === null) {
        check(got === '', `getApiKey(${provider}) returns '' and PROVIDER_API_KEY.${provider} is null`);
      } else {
        check(typeof mapped === 'string' && got === `marker-${mapped}`, `getApiKey(${provider}) reads ${mapped} (got ${got})`);
      }
    }
  } catch (err) {
    check(false, `PROVIDER_API_KEY parity threw: ${err && err.message}`);
  }
}

runAsyncChecks().then(() => {
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}, (err) => {
  console.error('settings-schema async checks crashed:', err);
  process.exit(1);
});
