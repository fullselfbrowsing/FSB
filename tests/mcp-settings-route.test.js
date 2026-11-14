'use strict';

/**
 * mcp-settings-route.test.js (Phase 66.1, plan 05)
 *
 * The service-worker side of the MCP `settings` tool: the mcp:get-settings and
 * mcp:set-setting message routes in extension/ws/mcp-tool-dispatcher.js.
 *
 * Part A drives the real dispatcher and the real FsbSettingsSchema
 * (extension/config/config.js) against a fake chrome.storage.local that
 * supports callback and promise forms, records every set call and fires
 * storage.onChanged listeners. It covers reads (D-07, D-10..D-12), writes
 * (D-13..D-15), the delegated-write gate (D-20), the write lock (Pitfall 9),
 * propagation to existing consumers, the operator log lines (D-18), typed
 * failures with recovery hints, and the test-only fixture entry (D-17, SC4).
 *
 * Part B vm-loads the real extension/ws/mcp-bridge-client.js (the
 * tests/mcp-bridge-background-dispatch.test.js harness pattern, no global
 * WebSocket) and proves both types reach the dispatcher through _routeMessage
 * (Pitfall 1), the toolbar icon classes them, the client's real fail-closed
 * _isDelegationScopedInbound gates writes (D-20), and the source contracts:
 * no chrome.runtime.onMessage path names the types and _handleGetConfig is
 * byte-identical to 469907cb (D-06, D-21).
 *
 * Part C (plan 66.1-06) covers session recording (D-18, D-19, Pitfalls 3-5):
 * - the dispatcher's recording sanitizers
 * - the real mcp-session-recorder.js handing its snapshots to a journal stub
 *   (the tests/mcp-session-recorder-journal.test.js pattern)
 * - a sentinel sweep of refused writes across storage, recorder entries, the
 *   journal, automationLogger calls, route responses, console and stderr
 * - lattice-replay.js classifying both types as unsupported
 *
 * Every response, set call, logger call and console line is kept and scanned
 * at the end: no submitted SENTINEL value may appear in any of them.
 *
 * Plain node, Node 20-safe, binds no port. Chain command:
 *   node tests/mcp-settings-route.test.js
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function out(line) {
  process.stdout.write(line + '\n');
}

function check(cond, msg) {
  if (cond) {
    passed += 1;
    out('  PASS: ' + msg);
  } else {
    failed += 1;
    process.stderr.write('  FAIL: ' + msg + '\n');
  }
}

function checkDeep(actual, expected, msg) {
  const ok = util.isDeepStrictEqual(actual, expected);
  check(ok, ok ? msg : msg + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

// ---------------------------------------------------------------------------
// Sinks scanned for SENTINEL at the end
// ---------------------------------------------------------------------------

const allResponses = [];
const allSetCalls = [];
const loggerCalls = [];
const consoleLines = [];

for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
  const original = console[method].bind(console);
  console[method] = function (...args) {
    try {
      consoleLines.push(args.map((arg) => (typeof arg === 'string' ? arg : util.inspect(arg, { depth: 6 }))).join(' '));
    } catch (_e) { /* capture is best-effort */ }
    return original(...args);
  };
}

// ---------------------------------------------------------------------------
// Fake chrome (installed before any extension module is required)
// ---------------------------------------------------------------------------

const fakeStorage = {
  store: {},
  setCalls: [],
  listeners: [],
  failNextSet: false,
  failNextGet: false
};

function pickFromStore(keys) {
  const store = fakeStorage.store;
  if (keys === null || keys === undefined) return clone(store);
  const list = typeof keys === 'string' ? [keys] : keys;
  if (Array.isArray(list)) {
    const result = {};
    for (const key of list) {
      if (hasOwn(store, key)) result[key] = clone(store[key]);
    }
    return result;
  }
  if (typeof keys === 'object') {
    const result = {};
    for (const key of Object.keys(keys)) {
      result[key] = hasOwn(store, key) ? clone(store[key]) : keys[key];
    }
    return result;
  }
  return {};
}

const tabsCreateCalls = [];
let fetchCalls = 0;

global.chrome = {
  storage: {
    local: {
      // Callback form (dispatcher change-report hydration) and promise form.
      // Both resolve on a later macrotask, as chrome.storage does, so
      // concurrent callers really interleave.
      get(keys, callback) {
        const failing = fakeStorage.failNextGet;
        fakeStorage.failNextGet = false;
        const promise = nextTick().then(() => {
          if (failing) throw new Error('storage read failed');
          return pickFromStore(keys);
        });
        if (typeof callback === 'function') {
          promise.then((result) => callback(result), () => callback({}));
          return undefined;
        }
        return promise;
      },
      set(items, callback) {
        const snapshot = clone(items);
        fakeStorage.setCalls.push(snapshot);
        allSetCalls.push(snapshot);
        const failing = fakeStorage.failNextSet;
        fakeStorage.failNextSet = false;
        const promise = nextTick().then(() => {
          if (failing) throw new Error('QUOTA_BYTES quota exceeded');
          const changes = {};
          for (const key of Object.keys(snapshot)) {
            changes[key] = { oldValue: clone(fakeStorage.store[key]), newValue: clone(snapshot[key]) };
            fakeStorage.store[key] = clone(snapshot[key]);
          }
          for (const listener of fakeStorage.listeners.slice()) {
            try { listener(changes, 'local'); } catch (_e) { /* a listener cannot break the writer */ }
          }
        });
        if (typeof callback === 'function') {
          promise.then(() => callback(), () => callback());
          return undefined;
        }
        return promise;
      }
    },
    onChanged: {
      addListener(listener) {
        fakeStorage.listeners.push(listener);
      }
    }
  },
  tabs: {
    create(options) {
      tabsCreateCalls.push(options);
      return Promise.resolve({ id: 99 });
    }
  }
};

global.automationLogger = {
  info(message, data) { loggerCalls.push({ level: 'info', message, data: clone(data) }); },
  warn(message, data) { loggerCalls.push({ level: 'warn', message, data: clone(data) }); },
  error(message, data) { loggerCalls.push({ level: 'error', message, data: clone(data) }); },
  debug(message, data) { loggerCalls.push({ level: 'debug', message, data: clone(data) }); }
};

global.fetch = function () {
  fetchCalls += 1;
  throw new Error('network access is not allowed in the settings routes');
};

const configModule = require(path.join(ROOT, 'extension', 'config', 'config.js'));
const PRODUCTION_SCHEMA = globalThis.FsbSettingsSchema;
const dispatcher = require(path.join(ROOT, 'extension', 'ws', 'mcp-tool-dispatcher.js'));

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

const SECRET_KEYS = [
  'apiKey', 'geminiApiKey', 'openaiApiKey', 'anthropicApiKey',
  'customApiKey', 'openrouterApiKey', 'captchaApiKey', 'serverHashKey'
];
const ENDPOINT_KEYS = ['customEndpoint', 'lmstudioBaseUrl', 'serverUrl'];
const HINT_PANEL = 'Change this setting in the FSB Control Panel.';
const HINT_UNSUPPORTED = 'Update the FSB extension, or change the setting in the FSB Control Panel.';
const HINT_DEFAULT = 'Call settings with only a key to see its type and allowed values, or with no arguments to list every setting.';
const EXPECTED_HINTS = {
  SETTING_PROTECTED_KEY: HINT_PANEL,
  SETTING_DELEGATED_WRITE_REFUSED: HINT_PANEL,
  SETTING_PROVIDER_NOT_READY: HINT_PANEL,
  SETTING_UNSUPPORTED: HINT_UNSUPPORTED
};

// Non-delegated client: only agent_delegated is mapped to a delegated run.
const OK_CLIENT = {
  _isDelegationScopedInbound(_type, payload) {
    return Boolean(payload && payload.agentId === 'agent_delegated');
  }
};

const SHIPPED_PROVIDERS_STUB = Object.freeze({
  ids() { return Object.freeze(['claude-code', 'grok-build', 'codex']); },
  isShippedId(id) { return id === 'claude-code' || id === 'grok-build'; }
});

function resetStorage(initial) {
  fakeStorage.store = clone(initial || {});
  fakeStorage.setCalls = [];
  fakeStorage.failNextSet = false;
  fakeStorage.failNextGet = false;
}

function resetGlobals() {
  globalThis.FsbSettingsSchema = PRODUCTION_SCHEMA;
  delete globalThis.FsbAgentCapRecommendation;
  delete globalThis.FsbDelegationProviders;
}

function capStub(value) {
  return {
    async getRecommendedAgentCap() {
      await nextTick();
      return value;
    }
  };
}

async function getSettings(payload, client) {
  const response = await dispatcher.dispatchMcpMessageRoute({
    type: 'mcp:get-settings',
    payload: payload || {},
    client: client === undefined ? OK_CLIENT : client
  });
  allResponses.push(response);
  return response;
}

async function setSetting(payload, client) {
  const response = await dispatcher.dispatchMcpMessageRoute({
    type: 'mcp:set-setting',
    payload: payload || {},
    client: client === undefined ? OK_CLIENT : client
  });
  allResponses.push(response);
  return response;
}

function writePayload(key, value, extra) {
  const payload = Object.assign({ agentId: 'agent_ok', recordingCallId: 'call-1', recordingLeaseMs: 10000 }, extra || {});
  if (key !== undefined) payload.key = key;
  if (value !== undefined) payload.value = value;
  return payload;
}

function isFailure(response, code) {
  return Boolean(response) && response.success === false && response.code === code && response.errorCode === code;
}

function hasSentinel(value) {
  return JSON.stringify(value === undefined ? null : value).includes('SENTINEL');
}

async function runSection(name, fn) {
  out('\n--- ' + name + ' ---');
  resetGlobals();
  resetStorage({});
  try {
    await fn();
  } catch (error) {
    check(false, name + ' threw: ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : String(error)));
  } finally {
    resetGlobals();
  }
}

// ---------------------------------------------------------------------------
// Part A: dispatcher routes
// ---------------------------------------------------------------------------

async function partA() {
  await runSection('exports and route table', async () => {
    check(typeof dispatcher.handleGetSettingsMessageRoute === 'function', 'handleGetSettingsMessageRoute is exported');
    check(typeof dispatcher.handleSetSettingMessageRoute === 'function', 'handleSetSettingMessageRoute is exported');
    check(typeof dispatcher._withSettingsWriteLock === 'function', '_withSettingsWriteLock is exported');
    check(dispatcher.hasMcpMessageRoute('mcp:get-settings') === true, 'mcp:get-settings has a dispatcher message route');
    check(dispatcher.hasMcpMessageRoute('mcp:set-setting') === true, 'mcp:set-setting has a dispatcher message route');
    check(typeof PRODUCTION_SCHEMA === 'object' && typeof PRODUCTION_SCHEMA.planWrite === 'function',
      'config.js installed the production FsbSettingsSchema');
  });

  await runSection('read all (D-07, D-10, D-11)', async () => {
    const stored = {
      lmstudioBaseUrl: 'http://user:pw@127.0.0.1:1234/v1?t=SENTINEL',
      customEndpoint: 'https://api.example.test/v1?token=SENTINEL',
      maxIterations: 250
    };
    for (const key of SECRET_KEYS) stored[key] = 'sk-SENTINEL-1';
    stored.openrouterApiKey = '';
    resetStorage(stored);
    const response = await getSettings({ agentId: 'agent_ok' });
    check(response && response.success === true, 'read-all succeeds');
    const settings = (response && response.settings) || {};
    check(Object.keys(settings).length === 36, 'read-all returns the 36 schema keys (got ' + Object.keys(settings).length + ')');
    check(Array.isArray(response.readOnly) && response.readOnly.length === 11, 'read-all lists the 11 read-only keys');
    checkDeep(response.readOnly, PRODUCTION_SCHEMA.readOnlyKeys(), 'readOnly is the schema read-only list');
    for (const key of SECRET_KEYS.filter((k) => k !== 'openrouterApiKey')) {
      check(settings[key] === '[set]', key + ' reads as [set]');
    }
    check(settings.openrouterApiKey === '', 'an empty secret reads as ""');
    check(settings.lmstudioBaseUrl === 'http://127.0.0.1:1234/...', 'lmstudioBaseUrl reads origin only');
    check(settings.customEndpoint === 'https://api.example.test/...', 'customEndpoint reads origin only');
    check(settings.serverUrl === 'https://full-selfbrowsing.com', 'serverUrl reads its effective default origin');
    check(settings.maxIterations === 250, 'a stored value is returned');
    check(settings.showSidepanelProgress === true, 'an absent key returns its effective default');
    check(!hasSentinel(response), 'no stored secret, userinfo or query text appears in the read-all reply');
    check(fakeStorage.setCalls.length === 0, 'read-all makes no storage write');
    checkDeep(Object.keys(response).sort(), ['readOnly', 'settings', 'success'], 'read-all reply carries success, settings and readOnly only');
  });

  await runSection('agent cap recommendation is awaited (D-12)', async () => {
    globalThis.FsbAgentCapRecommendation = capStub(12);
    resetStorage({});
    const all = await getSettings({ agentId: 'agent_ok' });
    check(all && all.settings && all.settings.fsbAgentCap === 12, 'read-all reports the awaited recommendation 12');
    const one = await getSettings({ agentId: 'agent_ok', key: 'fsbAgentCap' });
    check(one && one.success === true && one.value === 12, 'read-one reports the awaited recommendation 12');

    resetStorage({ fsbAgentCap: 5 });
    const stored = await getSettings({ agentId: 'agent_ok', key: 'fsbAgentCap' });
    check(stored && stored.value === 5, 'a stored agent cap wins over the recommendation');

    globalThis.FsbAgentCapRecommendation = {
      async getRecommendedAgentCap() {
        await nextTick();
        throw new Error('memory info unavailable');
      }
    };
    resetStorage({});
    const rejected = await getSettings({ agentId: 'agent_ok', key: 'fsbAgentCap' });
    check(rejected && rejected.success === true && rejected.value === 8, 'a rejecting recommendation falls back to 8');

    delete globalThis.FsbAgentCapRecommendation;
    const missing = await getSettings({ agentId: 'agent_ok', key: 'fsbAgentCap' });
    check(missing && missing.success === true && missing.value === 8, 'no recommendation module falls back to 8');

    globalThis.FsbAgentCapRecommendation = capStub(12);
    resetStorage({});
    const write = await setSetting(writePayload('fsbAgentCap', '20'));
    check(write && write.success === true && write.previous === 12 && write.value === 20,
      'a write over an unset agent cap reports previous 12 (got ' + JSON.stringify(write && write.previous) + ')');
    checkDeep(fakeStorage.setCalls, [{ fsbAgentCap: 20 }], 'the agent cap write stores only fsbAgentCap');
  });

  await runSection('read one key', async () => {
    resetStorage({});
    const maxIterations = await getSettings({ agentId: 'agent_ok', key: 'maxIterations' });
    checkDeep(maxIterations,
      { success: true, key: 'maxIterations', value: 100, type: 'integer', writable: true, range: { min: 50, max: 500 } },
      'maxIterations read-one carries type, writable and range');

    resetStorage({ modelProvider: 'xai' });
    const modelName = await getSettings({ agentId: 'agent_ok', key: 'modelName' });
    check(modelName && modelName.success === true && modelName.value === 'grok-4-1-fast', 'modelName read-one returns the default model');
    check(Array.isArray(modelName.values) && modelName.values.length > 0 && modelName.values.length <= 25,
      'modelName read-one lists at most 25 known ids');
    check(Array.isArray(modelName.values) && modelName.values.includes('grok-4-1-fast'), 'the xai list includes grok-4-1-fast');

    const manyModels = [];
    for (let i = 0; i < 40; i += 1) manyModels.push({ id: 'disc-' + i });
    resetStorage({
      modelProvider: 'openai',
      fsbDiscoveryCache: {
        'openai:abc123': { expiresAt: Date.now() + 60000, result: { ok: true, models: manyModels } }
      }
    });
    const capped = await getSettings({ agentId: 'agent_ok', key: 'modelName' });
    check(Array.isArray(capped.values) && capped.values.length === 25, 'a long discovered list is capped at 25');
    check(Array.isArray(capped.values) && capped.values[0] === 'gpt-4o', 'built-in ids come before discovered ids');

    resetStorage({ modelProvider: 'lmstudio' });
    const lmstudio = await getSettings({ agentId: 'agent_ok', key: 'modelName' });
    check(lmstudio && lmstudio.success === true && !hasOwn(lmstudio, 'values'), 'lmstudio modelName carries no values list');

    globalThis.FsbDelegationProviders = SHIPPED_PROVIDERS_STUB;
    resetStorage({});
    const agentProvider = await getSettings({ agentId: 'agent_ok', key: 'agentProviderId' });
    checkDeep(agentProvider && agentProvider.values, ['', 'claude-code', 'grok-build'],
      'agentProviderId read-one lists "" and the shipped ids only');

    resetStorage({ apiKey: 'sk-SENTINEL-1' });
    const secret = await getSettings({ agentId: 'agent_ok', key: 'apiKey' });
    checkDeep(secret, { success: true, key: 'apiKey', value: '[set]', type: 'string', writable: false },
      'a secret read-one is masked and not writable');

    const unknown = await getSettings({ agentId: 'agent_ok', key: 'nope' });
    check(isFailure(unknown, 'SETTING_UNKNOWN_KEY') && unknown.key === 'nope', 'an unknown key is SETTING_UNKNOWN_KEY with its label');
    const invalid = await getSettings({ agentId: 'agent_ok', key: 'bad key' });
    check(isFailure(invalid, 'SETTING_UNKNOWN_KEY') && invalid.key === '[invalid]', 'a malformed key is SETTING_UNKNOWN_KEY labelled [invalid]');
    const empty = await getSettings({ agentId: 'agent_ok', key: '' });
    check(isFailure(empty, 'SETTING_UNKNOWN_KEY') && empty.key === '[invalid]', 'an empty key is SETTING_UNKNOWN_KEY');
    const proto = await getSettings({ agentId: 'agent_ok', key: 'constructor' });
    check(isFailure(proto, 'SETTING_UNKNOWN_KEY'), 'a prototype name is not a setting');
    check(typeof unknown.error === 'string' && unknown.error.length > 0, 'an unknown-key failure carries a sentence');
    check(fakeStorage.setCalls.length === 0, 'read-one makes no storage write');
  });

  await runSection('write one key (D-13)', async () => {
    resetStorage({});
    const first = await setSetting(writePayload('debugMode', 'true'));
    checkDeep(first, { success: true, key: 'debugMode', value: true, previous: false, changed: ['debugMode'] },
      'debugMode write returns key, value, previous and changed');
    checkDeep(fakeStorage.setCalls, [{ debugMode: true }], 'exactly one set call with only debugMode');
    const again = await setSetting(writePayload('debugMode', 'true'));
    check(again && again.success === true && Array.isArray(again.changed) && again.changed.length === 0,
      'repeating the same value succeeds with changed []');
    check(fakeStorage.setCalls.length === 1, 'an equal stored value adds no set call');
    check(fakeStorage.store.debugMode === true, 'storage holds the new value');

    resetStorage({});
    const absent = await setSetting(writePayload('showSidepanelProgress', 'true'));
    checkDeep(absent && absent.changed, ['showSidepanelProgress'], 'writing the default to an absent key is a real write (Pitfall 10)');
    checkDeep(fakeStorage.setCalls, [{ showSidepanelProgress: true }], 'the absent key is materialised');

    resetStorage({});
    const missingValue = await setSetting(writePayload('debugMode'));
    check(isFailure(missingValue, 'SETTING_REQUEST_INVALID'), 'a write with no value is SETTING_REQUEST_INVALID');
    const objectValue = await setSetting(writePayload('debugMode', { nested: 'SENTINEL-object' }));
    check(isFailure(objectValue, 'SETTING_REQUEST_INVALID') && !hasSentinel(objectValue), 'a non-string value is refused without echo');
    check(fakeStorage.setCalls.length === 0, 'refused requests make no set call');
  });

  await runSection('invalid values and protected keys (D-10, D-11, D-14)', async () => {
    resetStorage({});
    const range = await setSetting(writePayload('maxIterations', '600'));
    check(isFailure(range, 'SETTING_VALUE_INVALID'), 'maxIterations 600 is SETTING_VALUE_INVALID');
    checkDeep(range && range.range, { min: 50, max: 500 }, 'the failure carries the range');
    check(range && typeof range.error === 'string' && range.error.includes('Allowed: 50 to 500'), 'the error states Allowed: 50 to 500');
    check(range && range.key === 'maxIterations', 'the failure names the key');

    resetStorage({ modelProvider: 'xai' });
    const model = await setSetting(writePayload('modelName', 'SENTINEL-MODEL'));
    check(isFailure(model, 'SETTING_VALUE_INVALID'), 'an unknown xai model is SETTING_VALUE_INVALID');
    check(Array.isArray(model.values) && model.values.length > 0 && model.values.length <= 25 && model.values.includes('grok-4-1-fast'),
      'the model failure lists at most 25 known ids including grok-4-1-fast');
    check(typeof model.error === 'string' && model.error.includes('Allowed: ') && model.error.includes('grok-4-1-fast'),
      'the model error carries the Allowed clause');
    check(!hasSentinel(model), 'the model failure never echoes the submitted id');

    globalThis.FsbDelegationProviders = SHIPPED_PROVIDERS_STUB;
    resetStorage({});
    const agent = await setSetting(writePayload('agentProviderId', 'SENTINEL-AGENT'));
    check(isFailure(agent, 'SETTING_VALUE_INVALID'), 'an unshipped agent id is SETTING_VALUE_INVALID');
    checkDeep(agent && agent.values, ['', 'claude-code', 'grok-build'], 'the agent failure lists "" and the shipped ids');
    check(typeof agent.error === 'string' && agent.error.includes('Allowed: "", claude-code, grok-build'),
      'the agent error carries Allowed: "", claude-code, grok-build');
    check(!hasSentinel(agent), 'the agent failure never echoes the submitted id');

    for (const key of SECRET_KEYS.concat(ENDPOINT_KEYS)) {
      resetStorage({});
      const refused = await setSetting(writePayload(key, key === 'serverUrl' || key.endsWith('Url') || key === 'customEndpoint'
        ? 'https://SENTINEL.example.test/?k=sk-SENTINEL-2'
        : 'sk-SENTINEL-2'));
      check(isFailure(refused, 'SETTING_PROTECTED_KEY') && refused.key === key, key + ' write is SETTING_PROTECTED_KEY');
      check(fakeStorage.setCalls.length === 0, key + ' write makes no set call');
      check(!hasSentinel(refused), key + ' refusal never echoes the value');
    }
    check(fakeStorage.setCalls.length === 0 && allSetCalls.every((call) => !hasSentinel(call)), 'no refused value ever reached storage');
  });

  await runSection('provider pair (D-15)', async () => {
    resetStorage({ geminiApiKey: 'sk-SENTINEL-1' });
    const gemini = await setSetting(writePayload('modelProvider', 'gemini'));
    check(gemini && gemini.success === true, 'modelProvider gemini succeeds with its key stored');
    checkDeep(gemini && gemini.changed, ['modelProvider', 'modelName'], 'changed lists both provider keys');
    checkDeep(fakeStorage.setCalls, [{ modelProvider: 'gemini', modelName: 'gemini-2.5-flash' }],
      'ONE set call writes the provider and its default model');
    check(gemini && gemini.previous === 'xai', 'previous is the effective default provider');

    resetStorage({});
    const notReady = await setSetting(writePayload('modelProvider', 'gemini'));
    check(isFailure(notReady, 'SETTING_PROVIDER_NOT_READY'), 'modelProvider gemini without its key is SETTING_PROVIDER_NOT_READY');
    check(fakeStorage.setCalls.length === 0, 'a not-ready provider makes no set call');
  });

  await runSection('model ids come from the persisted discovery cache (Pitfall 7)', async () => {
    fetchCalls = 0;
    tabsCreateCalls.length = 0;
    resetStorage({ modelProvider: 'openai' });
    const noCache = await setSetting(writePayload('modelName', 'disc-model-1'));
    check(isFailure(noCache, 'SETTING_VALUE_INVALID'), 'an undiscovered model is refused');

    resetStorage({
      modelProvider: 'openai',
      fsbDiscoveryCache: {
        'openai:feedbeef': { expiresAt: Date.now() - 1000, result: { ok: true, models: [{ id: 'disc-model-1' }] } }
      }
    });
    const expired = await setSetting(writePayload('modelName', 'disc-model-1'));
    check(isFailure(expired, 'SETTING_VALUE_INVALID'), 'an expired discovery entry does not count');

    resetStorage({
      modelProvider: 'openai',
      fsbDiscoveryCache: {
        'xai:feedbeef': { expiresAt: Date.now() + 60000, result: { ok: true, models: [{ id: 'disc-model-1' }] } },
        'openai:failed': { expiresAt: Date.now() + 60000, result: { ok: false, models: [{ id: 'disc-model-1' }] } }
      }
    });
    const wrongProvider = await setSetting(writePayload('modelName', 'disc-model-1'));
    check(isFailure(wrongProvider, 'SETTING_VALUE_INVALID'), 'another provider\'s or a failed entry does not count');

    resetStorage({
      modelProvider: 'openai',
      fsbDiscoveryCache: {
        'openai:feedbeef': { expiresAt: Date.now() + 60000, result: { ok: true, models: [{ id: 'disc-model-1' }, { id: 'disc-model-2' }] } }
      }
    });
    const discovered = await setSetting(writePayload('modelName', 'disc-model-1'));
    checkDeep(discovered, { success: true, key: 'modelName', value: 'disc-model-1', previous: 'grok-4-1-fast', changed: ['modelName'] },
      'a model in a live discovery entry is accepted');
    checkDeep(fakeStorage.setCalls, [{ modelName: 'disc-model-1' }], 'only modelName is written');
    check(fetchCalls === 0, 'no network call ran');
    check(tabsCreateCalls.length === 0, 'no tab or UI side effect ran');
  });

  await runSection('providerKind agent needs a shipped agent (D-15)', async () => {
    globalThis.FsbDelegationProviders = SHIPPED_PROVIDERS_STUB;
    resetStorage({ agentProviderId: 'claude-code' });
    const agent = await setSetting(writePayload('providerKind', 'agent'));
    checkDeep(agent, { success: true, key: 'providerKind', value: 'agent', previous: 'api', changed: ['providerKind'] },
      'providerKind agent succeeds with a shipped agent stored');

    delete globalThis.FsbDelegationProviders;
    resetStorage({ agentProviderId: 'claude-code' });
    const noProviders = await setSetting(writePayload('providerKind', 'agent'));
    check(isFailure(noProviders, 'SETTING_PROVIDER_NOT_READY'), 'without FsbDelegationProviders it fails closed');
    check(fakeStorage.setCalls.length === 0, 'the fail-closed refusal makes no set call');

    // WR-04: leaving a delegated agent for api needs a ready API provider.
    resetStorage({ providerKind: 'agent', agentProviderId: 'claude-code', modelProvider: 'openai' });
    const apiNotReady = await setSetting(writePayload('providerKind', 'api'));
    check(isFailure(apiNotReady, 'SETTING_PROVIDER_NOT_READY'), 'providerKind api with no stored openai key is not ready');
    check(fakeStorage.setCalls.length === 0 && fakeStorage.store.providerKind === 'agent', 'the api refusal writes nothing');
    resetStorage({ providerKind: 'agent', agentProviderId: 'claude-code', modelProvider: 'openai', openaiApiKey: 'sk-SENTINEL-5' });
    const apiReady = await setSetting(writePayload('providerKind', 'api'));
    checkDeep(apiReady, { success: true, key: 'providerKind', value: 'api', previous: 'agent', changed: ['providerKind'] },
      'providerKind api succeeds once the openai key is stored');
  });

  await runSection('delegated-write gate (D-20)', async () => {
    const cases = [
      { name: 'a delegated agent', client: { _isDelegationScopedInbound: () => true }, payload: writePayload('debugMode', 'true') },
      { name: 'a throwing detector', client: { _isDelegationScopedInbound: () => { throw new Error('registry broke'); } }, payload: writePayload('debugMode', 'true') },
      { name: 'a truthy non-boolean detector result', client: { _isDelegationScopedInbound: () => 'no' }, payload: writePayload('debugMode', 'true') },
      // Only an answer of exactly false allows the write.
      { name: 'a detector that returns undefined', client: { _isDelegationScopedInbound: () => undefined }, payload: writePayload('debugMode', 'true') },
      { name: 'a detector that returns 0', client: { _isDelegationScopedInbound: () => 0 }, payload: writePayload('debugMode', 'true') },
      { name: 'a missing client', client: null, payload: writePayload('debugMode', 'true') },
      { name: 'a client without the detector', client: {}, payload: writePayload('debugMode', 'true') },
      { name: 'a payload without agentId', client: OK_CLIENT, payload: { key: 'debugMode', value: 'true' } },
      { name: 'an empty agentId', client: OK_CLIENT, payload: writePayload('debugMode', 'true', { agentId: '' }) },
      { name: 'a non-string agentId', client: OK_CLIENT, payload: writePayload('debugMode', 'true', { agentId: 42 }) },
      { name: 'the mapped delegated agent', client: OK_CLIENT, payload: writePayload('debugMode', 'true', { agentId: 'agent_delegated' }) }
    ];
    for (const testCase of cases) {
      resetStorage({});
      const response = await setSetting(testCase.payload, testCase.client);
      check(isFailure(response, 'SETTING_DELEGATED_WRITE_REFUSED'), testCase.name + ' is refused with SETTING_DELEGATED_WRITE_REFUSED');
      check(fakeStorage.setCalls.length === 0, testCase.name + ' makes no set call');
    }
    let sawType = null;
    const spyClient = {
      _isDelegationScopedInbound(type, payload) {
        sawType = type;
        return payload.agentId === 'agent_delegated';
      }
    };
    resetStorage({});
    await setSetting(writePayload('debugMode', 'true'), spyClient);
    check(sawType === 'mcp:set-setting', 'the detector is asked about mcp:set-setting');

    resetStorage({ maxIterations: 300 });
    const delegatedRead = await getSettings({ agentId: 'agent_delegated', key: 'maxIterations' }, { _isDelegationScopedInbound: () => true });
    check(delegatedRead && delegatedRead.success === true && delegatedRead.value === 300, 'a delegated agent can still read one key');
    const delegatedReadAll = await getSettings({ agentId: 'agent_delegated' }, { _isDelegationScopedInbound: () => true });
    check(delegatedReadAll && delegatedReadAll.success === true, 'a delegated agent can still read all');
  });

  await runSection('write lock serializes concurrent writes (Pitfall 9)', async () => {
    resetStorage({});
    const [a, b] = await Promise.all([
      setSetting(writePayload('maxIterations', '60')),
      setSetting(writePayload('maxIterations', '70'))
    ]);
    check(a && a.success === true && a.previous === 100 && a.value === 60, 'the first write reports previous 100');
    check(b && b.success === true && b.previous === 60 && b.value === 70, 'the second write reports previous 60 (got ' + JSON.stringify(b && b.previous) + ')');
    checkDeep(fakeStorage.setCalls, [{ maxIterations: 60 }, { maxIterations: 70 }], 'two set calls, in order');

    const order = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const first = dispatcher._withSettingsWriteLock(async () => { order.push('first-start'); await gate; order.push('first-end'); return 1; });
    const second = dispatcher._withSettingsWriteLock(async () => { order.push('second'); return 2; });
    await nextTick();
    checkDeep(order, ['first-start'], 'a queued call waits for the running one');
    release();
    checkDeep(await Promise.all([first, second]), [1, 2], 'both locked calls resolve with their own results');
    checkDeep(order, ['first-start', 'first-end', 'second'], 'locked calls run one at a time, in order');
    const failing = dispatcher._withSettingsWriteLock(async () => { throw new Error('boom'); });
    let rejected = false;
    try { await failing; } catch (_e) { rejected = true; }
    check(rejected, 'a failing locked call rejects to its caller');
    check(await dispatcher._withSettingsWriteLock(async () => 'after') === 'after', 'a rejection does not poison the chain');
  });

  await runSection('existing consumers see the write (D-13)', async () => {
    resetStorage({ openaiApiKey: 'sk-SENTINEL-1' });
    const consumer = new configModule.Config();
    consumer._cachedConfig = { stale: true };
    consumer._cacheTimestamp = Date.now();
    const write = await setSetting(writePayload('modelProvider', 'openai'));
    check(write && write.success === true, 'modelProvider openai is written');
    check(consumer._cachedConfig === null, 'the Config cache clears on the storage change');
    const fresh = await chrome.storage.local.get(['providerKind', 'modelProvider', 'modelName']);
    checkDeep(fresh, { modelProvider: 'openai', modelName: 'gpt-4o' }, 'a fresh run_task-style storage read returns the new pair');
    check(fetchCalls === 0 && tabsCreateCalls.length === 0, 'no network or UI side effect ran');
  });

  await runSection('operator log lines (D-18)', async () => {
    resetStorage({ fsbMcpSessionRecordingEnabled: false });
    const before = loggerCalls.length;
    const read = await getSettings({ agentId: 'agent_ok' });
    check(read && read.success === true && loggerCalls.length === before, 'reads write no operator log line');

    const accepted = await setSetting(writePayload('debugMode', 'true', { visualSession: { client: 'Claude' } }));
    check(accepted && accepted.success === true, 'the logged write succeeds');
    const infoLines = loggerCalls.slice(before).filter((call) => call.level === 'info');
    check(infoLines.length === 1, 'an accepted write logs exactly one info line');
    const info = infoLines[0] || { data: {} };
    check(info.message === 'MCP settings write', 'the info line is "MCP settings write"');
    checkDeep(Object.keys(info.data || {}).sort(), ['at', 'changed', 'client', 'key', 'previous', 'value'],
      'the info line carries exactly key, previous, value, changed, client and at');
    check(info.data.key === 'debugMode' && info.data.previous === false && info.data.value === true, 'the info line has key, previous and value');
    checkDeep(info.data.changed, ['debugMode'], 'the info line has changed');
    check(info.data.client === 'Claude', 'the info line has the MCP client label');
    check(typeof info.data.at === 'string' && !Number.isNaN(Date.parse(info.data.at)), 'the info line has an ISO time');

    // WR-02: a provider switch also overwrites modelName; the reply and the
    // info line name its new and previous value, so the old id is recoverable.
    const storeBeforePair = clone(fakeStorage.store);
    resetStorage({ fsbMcpSessionRecordingEnabled: false, modelProvider: 'xai', modelName: 'grok-4', geminiApiKey: 'g-SENTINEL-4' });
    const beforePair = loggerCalls.length;
    const pair = await setSetting(writePayload('modelProvider', 'gemini'));
    checkDeep(pair, {
      success: true, key: 'modelProvider', value: 'gemini', previous: 'xai', changed: ['modelProvider', 'modelName'],
      coupled: { modelName: { value: 'gemini-2.5-flash', previous: 'grok-4' } }
    }, 'a provider switch reports the coupled modelName with its previous value');
    checkDeep(fakeStorage.setCalls, [{ modelProvider: 'gemini', modelName: 'gemini-2.5-flash' }], 'the provider pair is written in one set call');
    const pairLine = loggerCalls.slice(beforePair).filter((call) => call.level === 'info')[0] || { data: {} };
    checkDeep(pairLine.data.coupled, { modelName: { value: 'gemini-2.5-flash', previous: 'grok-4' } },
      'the info line carries the coupled modelName with its previous and new value');
    check(!hasSentinel(pair) && !hasSentinel(pairLine), 'the coupled report never carries a stored secret');

    resetStorage({ fsbMcpSessionRecordingEnabled: false, modelProvider: 'openrouter', modelName: 'vendor/long-model-id', customEndpoint: 'https://x.example/v1' });
    const keptModel = await setSetting(writePayload('modelProvider', 'custom'));
    checkDeep(keptModel, { success: true, key: 'modelProvider', value: 'custom', previous: 'openrouter', changed: ['modelProvider'] },
      'a switch to custom keeps the stored model (no coupled field)');
    checkDeep(fakeStorage.setCalls, [{ modelProvider: 'custom' }], 'the switch to custom writes only modelProvider');
    resetStorage(storeBeforePair);

    const beforeRefusal = loggerCalls.length;
    const refused = await setSetting(writePayload('apiKey', 'sk-SENTINEL-3'));
    check(isFailure(refused, 'SETTING_PROTECTED_KEY'), 'the logged refusal is SETTING_PROTECTED_KEY');
    const warnLines = loggerCalls.slice(beforeRefusal).filter((call) => call.level === 'warn');
    check(warnLines.length === 1 && loggerCalls.length === beforeRefusal + 1, 'a refused write logs exactly one warn line');
    const warn = warnLines[0] || { data: {} };
    check(warn.message === 'MCP settings write refused', 'the warn line is "MCP settings write refused"');
    checkDeep(Object.keys(warn.data || {}).sort(), ['at', 'client', 'code', 'key'], 'the warn line carries exactly key, code, client and at');
    check(warn.data.key === 'apiKey' && warn.data.code === 'SETTING_PROTECTED_KEY', 'the warn line has the key label and the code');

    const beforeInvalidKey = loggerCalls.length;
    await setSetting(writePayload('no such key!', 'x'));
    const invalidKeyLine = loggerCalls[beforeInvalidKey] || { data: {} };
    check(invalidKeyLine.level === 'warn' && invalidKeyLine.data.key === '[invalid]' && invalidKeyLine.data.code === 'SETTING_UNKNOWN_KEY',
      'a malformed key is logged as [invalid]');

    const beforeGate = loggerCalls.length;
    await setSetting(writePayload('debugMode', 'false', { agentId: 'agent_delegated' }));
    const gateLine = loggerCalls[beforeGate] || { data: {} };
    check(gateLine.level === 'warn' && gateLine.data.code === 'SETTING_DELEGATED_WRITE_REFUSED' && gateLine.data.key === 'debugMode',
      'a delegated refusal is logged with key and code');
    check(fakeStorage.store.fsbMcpSessionRecordingEnabled === false, 'the lines are written while session recording is off');

    const beforeNoop = loggerCalls.length;
    const noop = await setSetting(writePayload('debugMode', 'true'));
    check(noop && noop.success === true && noop.changed.length === 0, 'the no-op write succeeds');
    check(loggerCalls.length === beforeNoop + 1 && loggerCalls[beforeNoop].level === 'info', 'a no-op write is logged as accepted');

    const savedLogger = global.automationLogger;
    delete global.automationLogger;
    try {
      resetStorage({});
      const withoutLogger = await setSetting(writePayload('debugMode', 'true'));
      check(withoutLogger && withoutLogger.success === true, 'a missing automationLogger does not break the write');
      global.automationLogger = { info() { throw new Error('logger broke'); }, warn() { throw new Error('logger broke'); } };
      resetStorage({});
      const throwingLogger = await setSetting(writePayload('debugMode', 'true'));
      check(throwingLogger && throwingLogger.success === true, 'a throwing automationLogger does not break the write');
      const throwingRefusal = await setSetting(writePayload('apiKey', 'x'));
      check(isFailure(throwingRefusal, 'SETTING_PROTECTED_KEY'), 'a throwing automationLogger does not break a refusal');
    } finally {
      global.automationLogger = savedLogger;
    }
  });

  await runSection('unsupported schema and storage failures', async () => {
    delete globalThis.FsbSettingsSchema;
    resetStorage({});
    const read = await getSettings({ agentId: 'agent_ok' });
    check(isFailure(read, 'SETTING_UNSUPPORTED'), 'read without a schema is SETTING_UNSUPPORTED');
    const before = loggerCalls.length;
    const write = await setSetting(writePayload('debugMode', 'true'));
    check(isFailure(write, 'SETTING_UNSUPPORTED'), 'write without a schema is SETTING_UNSUPPORTED');
    const line = loggerCalls[before] || { data: {} };
    check(line.level === 'warn' && line.data.key === '[invalid]' && line.data.code === 'SETTING_UNSUPPORTED',
      'the unsupported write is logged as a refusal with key [invalid]');
    globalThis.FsbSettingsSchema = { keys() { return []; } };
    const partial = await getSettings({ agentId: 'agent_ok' });
    check(isFailure(partial, 'SETTING_UNSUPPORTED'), 'a schema without projectAll/describe is SETTING_UNSUPPORTED');
    const partialWrite = await setSetting(writePayload('debugMode', 'true'));
    check(isFailure(partialWrite, 'SETTING_UNSUPPORTED'), 'a schema without planWrite is SETTING_UNSUPPORTED');
    globalThis.FsbSettingsSchema = PRODUCTION_SCHEMA;

    resetStorage({});
    fakeStorage.failNextSet = true;
    const beforeStorage = loggerCalls.length;
    const failedSet = await setSetting(writePayload('debugMode', 'true'));
    check(isFailure(failedSet, 'SETTING_STORAGE_FAILED'), 'a rejected storage set is SETTING_STORAGE_FAILED');
    const storageLine = loggerCalls.slice(beforeStorage).find((call) => call.level === 'warn') || { data: {} };
    check(storageLine.data.code === 'SETTING_STORAGE_FAILED' && storageLine.data.key === 'debugMode', 'the storage failure is logged as a refusal');
    check(loggerCalls.slice(beforeStorage).every((call) => call.level !== 'info'), 'a failed write logs no accepted line');

    resetStorage({});
    fakeStorage.failNextGet = true;
    const failedRead = await getSettings({ agentId: 'agent_ok' });
    check(isFailure(failedRead, 'SETTING_STORAGE_FAILED'), 'a rejected storage read is SETTING_STORAGE_FAILED');
    fakeStorage.failNextGet = true;
    const failedWriteRead = await setSetting(writePayload('debugMode', 'true'));
    check(isFailure(failedWriteRead, 'SETTING_STORAGE_FAILED'), 'a rejected read before a write is SETTING_STORAGE_FAILED');
    check(fakeStorage.setCalls.length === 0, 'a failed read makes no set call');
  });

  await runSection('handlers never throw', async () => {
    const getHandler = dispatcher.handleGetSettingsMessageRoute;
    const setHandler = dispatcher.handleSetSettingMessageRoute;
    const inputs = [undefined, {}, { payload: null }, { payload: [] }, { payload: 'text' }, { payload: { key: 42 } },
      { payload: { key: { toString() { throw new Error('x'); } } } }];
    for (const input of inputs) {
      let threw = false;
      let response;
      try { response = await getHandler(input); } catch (_e) { threw = true; }
      check(!threw && response && typeof response.success === 'boolean', 'get handler returns a result for ' + util.inspect(input && input.payload));
      allResponses.push(response);
      threw = false;
      try { response = await setHandler(input === undefined ? undefined : Object.assign({ client: OK_CLIENT }, input)); } catch (_e) { threw = true; }
      check(!threw && response && response.success === false, 'set handler returns a failure for ' + util.inspect(input && input.payload));
      allResponses.push(response);
    }
    const nonObject = await setHandler({ payload: 'text', client: OK_CLIENT });
    check(isFailure(nonObject, 'SETTING_REQUEST_INVALID'), 'a non-object payload is SETTING_REQUEST_INVALID');
  });

  await runSection('recovery hints on every SETTING_ failure', async () => {
    const failures = allResponses.filter((response) => response && response.success === false
      && typeof response.code === 'string' && response.code.indexOf('SETTING_') === 0);
    check(failures.length >= 30, 'collected ' + failures.length + ' SETTING_ failures');
    const codes = new Set(failures.map((response) => response.code));
    for (const code of ['SETTING_REQUEST_INVALID', 'SETTING_UNKNOWN_KEY', 'SETTING_PROTECTED_KEY', 'SETTING_VALUE_INVALID',
      'SETTING_PROVIDER_NOT_READY', 'SETTING_DELEGATED_WRITE_REFUSED', 'SETTING_UNSUPPORTED', 'SETTING_STORAGE_FAILED']) {
      check(codes.has(code), code + ' was exercised');
    }
    let wrongHint = 0;
    let shapeErrors = 0;
    for (const response of failures) {
      const expected = EXPECTED_HINTS[response.code] || HINT_DEFAULT;
      if (response.recoveryHint !== expected) wrongHint += 1;
      if (response.errorCode !== response.code || typeof response.error !== 'string' || response.error === '') shapeErrors += 1;
    }
    check(wrongHint === 0, 'every SETTING_ failure carries its mapped recoveryHint (' + wrongHint + ' wrong)');
    check(shapeErrors === 0, 'every SETTING_ failure has code === errorCode and a non-empty error (' + shapeErrors + ' bad)');
    check(failures.every((response) => !hasSentinel(response.recoveryHint) && !hasSentinel(response.error)),
      'no recoveryHint or error contains a SENTINEL value');
  });

  await runSection('fixture schema entry needs no MCP change (D-17, SC4)', async () => {
    const fixture = PRODUCTION_SCHEMA.create(PRODUCTION_SCHEMA.entries.concat([
      { key: 'fsbFixtureFastMode', type: 'boolean', cls: 'writable', default: false }
    ]));
    globalThis.FsbSettingsSchema = fixture;
    resetStorage({});
    const all = await getSettings({ agentId: 'agent_ok' });
    check(all && all.settings && all.settings.fsbFixtureFastMode === false, 'read-all includes the fixture key with its default');
    const one = await getSettings({ agentId: 'agent_ok', key: 'fsbFixtureFastMode' });
    checkDeep(one, { success: true, key: 'fsbFixtureFastMode', value: false, type: 'boolean', writable: true },
      'read-one describes the fixture key');
    const write = await setSetting(writePayload('fsbFixtureFastMode', 'true'));
    checkDeep(write, { success: true, key: 'fsbFixtureFastMode', value: true, previous: false, changed: ['fsbFixtureFastMode'] },
      'the fixture key is writable through the route');
    checkDeep(fakeStorage.setCalls, [{ fsbFixtureFastMode: true }], 'the fixture write stores only its key');

    globalThis.FsbSettingsSchema = PRODUCTION_SCHEMA;
    const gone = await getSettings({ agentId: 'agent_ok', key: 'fsbFixtureFastMode' });
    check(isFailure(gone, 'SETTING_UNKNOWN_KEY'), 'the production schema does not know the fixture key');
    const goneWrite = await setSetting(writePayload('fsbFixtureFastMode', 'true'));
    check(isFailure(goneWrite, 'SETTING_UNKNOWN_KEY'), 'the production schema refuses to write the fixture key');
  });

  // Phase 68 (AUTO-01 SC1): the real switch is one stored value, reached
  // through the production schema alone, with no MCP change.
  await runSection('the fast-mode switch is one stored value (Phase 68, AUTO-01)', async () => {
    const KEY = 'fsbJevFastModeEnabled';
    check(PRODUCTION_SCHEMA.keys().includes(KEY) && !PRODUCTION_SCHEMA.keys().includes('fsbFixtureFastMode'),
      'the production schema has the switch and still not the fsbFixtureFastMode fixture');
    resetStorage({});
    const all = await getSettings({ agentId: 'agent_ok' });
    check(all && all.success === true && all.settings && all.settings[KEY] === false,
      'read-all reports fsbJevFastModeEnabled as false when storage is empty');
    const one = await getSettings({ agentId: 'agent_ok', key: KEY });
    checkDeep(one, { success: true, key: KEY, value: false, type: 'boolean', writable: true }, 'read-one describes the switch');
    const write = await setSetting(writePayload(KEY, 'true'));
    checkDeep(write, { success: true, key: KEY, value: true, previous: false, changed: [KEY] },
      "a write of 'true' succeeds with changed ['fsbJevFastModeEnabled']");
    checkDeep(fakeStorage.setCalls, [{ [KEY]: true }], 'the write stores exactly {fsbJevFastModeEnabled: true}');
    const after = await getSettings({ agentId: 'agent_ok', key: KEY });
    check(after && after.success === true && after.value === true, 'read-one then reports true');
  });
}

// ---------------------------------------------------------------------------
// Part B: the real MCPBridgeClient (vm-loaded) routes both types and its real
// fail-closed delegation detector gates writes (D-06, D-20, Pitfall 1)
// ---------------------------------------------------------------------------

const BRIDGE_CLIENT_PATH = path.join(ROOT, 'extension', 'ws', 'mcp-bridge-client.js');
// sha256 of the `async _handleGetConfig() {` method text (up to the next
// `async _handleGetSiteGuides(`) at 469907cb, source equal to 8a058bdf.
// fsb://config is the bench run identity and stays byte-identical (D-21).
const HANDLE_GET_CONFIG_SHA256_469907CB = '4de2a8ab83d3fd2a2af84c9be0a4cf452ccb2dea2bc4d0b48422911d6f5c8ab2';
// Files under extension/ that may name the two settings message types. A new
// holder must be a reviewed addition here; a chrome.runtime.onMessage handler
// never may (D-06, T-66.1-11).
// utils/mcp-session-recorder.js names them only in JOURNAL_FULL_RESULT_TOOLS,
// a journal projection table (plan 66.1-06).
const ALLOWED_SETTINGS_TYPE_FILES = ['utils/mcp-session-recorder.js', 'ws/mcp-bridge-client.js', 'ws/mcp-tool-dispatcher.js'];

function createVmFakeTimers() {
  const noop = { cleared: false };
  return {
    setTimeout() { return noop; },
    clearTimeout() {},
    setInterval() { return noop; },
    clearInterval() {}
  };
}

function createVmStorageArea() {
  const store = {};
  return {
    async get(keys) {
      if (keys === null || keys === undefined) return { ...store };
      const list = typeof keys === 'string' ? [keys] : (Array.isArray(keys) ? keys : Object.keys(keys));
      const result = {};
      for (const key of list) {
        if (hasOwn(store, key)) result[key] = store[key];
      }
      return result;
    },
    async set(values) { Object.assign(store, values); },
    async remove(keys) {
      for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];
    }
  };
}

function createVmChrome() {
  return {
    runtime: {
      id: 'settings-route-test-extension',
      lastError: undefined,
      onMessage: { addListener() {}, removeListener() {} },
      sendMessage(_request, callback) { if (typeof callback === 'function') callback({}); }
    },
    storage: { session: createVmStorageArea(), local: createVmStorageArea() },
    alarms: {
      async create() {},
      async clear() { return true; },
      async getAll() { return []; }
    }
  };
}

function createVmFakeWebSocketClass() {
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.sent = [];
    }
    send(payload) { this.sent.push(payload); }
    close() { this.readyState = FakeWebSocket.CLOSED; }
  }
  FakeWebSocket.CONNECTING = 0;
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSED = 3;
  return FakeWebSocket;
}

function buildBridgeHarness(options) {
  const settings = options || {};
  const routeCalls = [];
  const iconCalls = [];
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0;
  const timers = createVmFakeTimers();
  const context = {
    chrome: createVmChrome(),
    WebSocket: createVmFakeWebSocketClass(),
    console,
    Math: deterministicMath,
    Date,
    EventTarget,
    CustomEvent,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    // Spy first, then (optionally) the real dispatcher, so a test can prove
    // both the pass-through arguments and the end-to-end result.
    dispatchMcpMessageRoute: async (args) => {
      routeCalls.push(args);
      if (settings.forward) return dispatcher.dispatchMcpMessageRoute(args);
      return { success: true, routedType: args.type };
    },
    dispatchMcpToolRoute: async () => ({ success: true }),
    fsbActionIcon: {
      noteActivity(tabId, activity) { iconCalls.push(activity); }
    },
    globalThis: {}
  };
  context.globalThis = context;
  const source = fs.readFileSync(BRIDGE_CLIENT_PATH, 'utf8');
  const footer = '\nthis.__settingsTest = { MCPBridgeClient, mcpBridgeClient, MCP_ICON_READ_MESSAGE_TYPES };\n';
  vm.runInNewContext(source + footer, context, { filename: 'ws/mcp-bridge-client.js' });
  const exportsObj = context.__settingsTest;
  const client = exportsObj.mcpBridgeClient;
  const unsupported = [];
  client._recordUnsupportedMcpMessage = async (type) => { unsupported.push(type); };
  client.setInboundAuthorityReady(true);
  if (settings.delegationReady !== false) client.setDelegationAuthorityReady(true);
  return { context, exportsObj, client, routeCalls, iconCalls, unsupported };
}

const DELEGATED_MAPPING = Object.freeze([{ delegationId: 'deleg_settings_01', agentId: 'agent_delegated' }]);

async function partB() {
  await runSection('bridge client routes both types to the dispatcher (Pitfall 1)', async () => {
    const harness = buildBridgeHarness();
    const getPayload = { key: 'debugMode' };
    const setPayload = { key: 'debugMode', value: 'true' };
    let threw = null;
    let getResult;
    let setResult;
    try {
      getResult = await harness.client._routeMessage('mcp:get-settings', getPayload, 'id1');
      setResult = await harness.client._routeMessage('mcp:set-setting', setPayload, 'id2');
    } catch (error) {
      threw = error;
    }
    check(threw === null, 'neither type throws Unknown MCP message type' + (threw ? ' (' + threw.message + ')' : ''));
    check(harness.unsupported.length === 0, 'neither type is recorded as an unsupported message');
    check(harness.routeCalls.length === 2, 'both types reach dispatchMcpMessageRoute');
    const [getCall, setCall] = harness.routeCalls;
    check(getCall && getCall.type === 'mcp:get-settings' && getCall.payload === getPayload
      && getCall.client === harness.client && getCall.mcpMsgId === 'id1',
      'mcp:get-settings passes type, payload, the client instance and the message id');
    check(setCall && setCall.type === 'mcp:set-setting' && setCall.payload === setPayload
      && setCall.client === harness.client && setCall.mcpMsgId === 'id2',
      'mcp:set-setting passes type, payload, the client instance and the message id');
    check(getResult && getResult.routedType === 'mcp:get-settings' && setResult && setResult.routedType === 'mcp:set-setting',
      'the dispatcher result is returned unchanged');
  });

  await runSection('toolbar icon classes reads and writes (D-06)', async () => {
    const harness = buildBridgeHarness();
    const iconSet = harness.exportsObj.MCP_ICON_READ_MESSAGE_TYPES;
    check(iconSet && iconSet.has('mcp:get-settings') === true, 'mcp:get-settings is an icon read type');
    check(iconSet && iconSet.has('mcp:set-setting') === false, 'mcp:set-setting is not an icon read type');
    await harness.client._routeMessage('mcp:get-settings', {}, 'icon-read');
    await harness.client._routeMessage('mcp:set-setting', { key: 'debugMode', value: 'true' }, 'icon-write');
    checkDeep(harness.iconCalls, ['orbit', 'sweep'], 'a settings read shows Orbit and a write shows Sweep');
  });

  await runSection('the real delegation detector gates writes (D-20)', async () => {
    const harness = buildBridgeHarness();
    const realClient = harness.client;
    const handler = dispatcher.handleSetSettingMessageRoute;
    const writeAs = (agentId) => handler({ payload: writePayload('debugMode', 'true', { agentId }), client: realClient })
      .then((response) => { allResponses.push(response); return response; });

    harness.context.fsbAgentRegistryInstance = { listDelegationMappings: () => DELEGATED_MAPPING.map((row) => ({ ...row })) };
    resetStorage({});
    const delegated = await writeAs('agent_delegated');
    check(isFailure(delegated, 'SETTING_DELEGATED_WRITE_REFUSED'), 'a mapped delegated agent is refused');
    check(fakeStorage.setCalls.length === 0, 'the delegated refusal makes no set call');
    const plain = await writeAs('agent_plain');
    checkDeep(plain, { success: true, key: 'debugMode', value: true, previous: false, changed: ['debugMode'] },
      'an unmapped agent writes through the same registry');
    checkDeep(fakeStorage.setCalls, [{ debugMode: true }], 'the allowed write stores only debugMode');

    const failClosed = [
      ['the registry is missing', () => { delete harness.context.fsbAgentRegistryInstance; }],
      ['the registry has no listDelegationMappings', () => { harness.context.fsbAgentRegistryInstance = {}; }],
      ['listDelegationMappings throws', () => {
        harness.context.fsbAgentRegistryInstance = { listDelegationMappings() { throw new Error('registry broke'); } };
      }],
      ['a mapping row is malformed', () => {
        harness.context.fsbAgentRegistryInstance = {
          listDelegationMappings: () => [{ delegationId: 'deleg_settings_01', agentId: 'agent_delegated', extra: true }]
        };
      }],
      ['a mapping delegationId is invalid', () => {
        harness.context.fsbAgentRegistryInstance = { listDelegationMappings: () => [{ delegationId: 'bad id', agentId: 'agent_other' }] };
      }],
      ['the mapping list is not an array', () => {
        harness.context.fsbAgentRegistryInstance = { listDelegationMappings: () => ({ agent_plain: true }) };
      }]
    ];
    for (const [name, arrange] of failClosed) {
      arrange();
      resetStorage({});
      const response = await writeAs('agent_plain');
      check(isFailure(response, 'SETTING_DELEGATED_WRITE_REFUSED'), 'refused (fail closed) when ' + name);
      check(fakeStorage.setCalls.length === 0, 'no set call when ' + name);
    }

    harness.context.fsbAgentRegistryInstance = { listDelegationMappings: () => DELEGATED_MAPPING.map((row) => ({ ...row })) };
    resetStorage({ maxIterations: 300 });
    const read = await dispatcher.handleGetSettingsMessageRoute({ payload: { agentId: 'agent_delegated', key: 'maxIterations' }, client: realClient });
    allResponses.push(read);
    check(read && read.success === true && read.value === 300, 'a delegated agent can still read');
  });

  await runSection('end to end through _routeMessage and the real dispatcher', async () => {
    const harness = buildBridgeHarness({ forward: true });
    harness.context.fsbAgentRegistryInstance = { listDelegationMappings: () => DELEGATED_MAPPING.map((row) => ({ ...row })) };
    resetStorage({});
    const written = await harness.client._routeMessage('mcp:set-setting', writePayload('maxIterations', '120', { agentId: 'agent_plain' }), 'e2e-1');
    allResponses.push(written);
    check(written && written.success === true && written.value === 120 && written.previous === 100, 'an MCP write lands through the bridge');
    checkDeep(fakeStorage.setCalls, [{ maxIterations: 120 }], 'storage holds only the written key');
    const refused = await harness.client._routeMessage('mcp:set-setting', writePayload('maxIterations', '130', { agentId: 'agent_delegated' }), 'e2e-2');
    allResponses.push(refused);
    check(isFailure(refused, 'SETTING_DELEGATED_WRITE_REFUSED'), 'a delegated write is refused through the bridge');
    const read = await harness.client._routeMessage('mcp:get-settings', { agentId: 'agent_delegated', key: 'maxIterations' }, 'e2e-3');
    allResponses.push(read);
    check(read && read.success === true && read.value === 120, 'a delegated read succeeds through the bridge');

    // _handleMessage wraps a handler result as { success: true, ...result },
    // so a typed failure must still arrive as success:false.
    const sent = [];
    harness.client._sendResult = (id, payload) => { sent.push({ id, kind: 'result', payload }); };
    harness.client._sendError = (id, error) => { sent.push({ id, kind: 'error', error }); };
    await harness.client._handleMessage(JSON.stringify({
      id: 'wire-1', type: 'mcp:set-setting', payload: writePayload('apiKey', 'sk-SENTINEL-4', { agentId: 'agent_plain' })
    }));
    const frame = sent[0] || {};
    allResponses.push(frame.payload);
    check(frame.kind === 'result' && frame.payload && frame.payload.success === false
      && frame.payload.code === 'SETTING_PROTECTED_KEY', 'a refusal leaves the bridge as an mcp:result with success:false');
    check(!hasSentinel(frame), 'the refusal frame never carries the submitted value');
  });

  await runSection('delegation authority not ready stops a delegated write first', async () => {
    const harness = buildBridgeHarness({ forward: true, delegationReady: false });
    harness.context.fsbAgentRegistryInstance = { listDelegationMappings: () => DELEGATED_MAPPING.map((row) => ({ ...row })) };
    resetStorage({});
    let message = null;
    try {
      await harness.client._routeMessage('mcp:set-setting', writePayload('debugMode', 'true', { agentId: 'agent_delegated' }), 'na-1');
    } catch (error) {
      message = error && error.message;
    }
    check(message === 'delegation_authority_not_ready', 'the bridge throws delegation_authority_not_ready');
    check(harness.routeCalls.length === 0, 'no handler ran');
    check(fakeStorage.setCalls.length === 0, 'no storage write happened');
  });

  await runSection('source contracts (D-06, D-21, T-66.1-11)', async () => {
    const background = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
    check(!background.includes('mcp:get-settings') && !background.includes('mcp:set-setting'),
      'background.js (chrome.runtime.onMessage) names neither settings type');

    const holders = [];
    const extensionRoot = path.join(ROOT, 'extension');
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') continue;
          walk(full);
        } else if (/\.(js|mjs|cjs|html|json)$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          if (text.includes('mcp:get-settings') || text.includes('mcp:set-setting')) {
            holders.push(path.relative(extensionRoot, full).split(path.sep).join('/'));
          }
        }
      }
    };
    walk(extensionRoot);
    checkDeep(holders.sort(), ALLOWED_SETTINGS_TYPE_FILES.slice().sort(),
      'only the bridge client and the dispatcher name the settings types under extension/');

    const bridgeSource = fs.readFileSync(BRIDGE_CLIENT_PATH, 'utf8');
    check((bridgeSource.match(/case 'mcp:get-settings':/g) || []).length === 1, 'one mcp:get-settings switch case');
    check((bridgeSource.match(/case 'mcp:set-setting':/g) || []).length === 1, 'one mcp:set-setting switch case');
    check(/case 'mcp:get-status':\s*return this\._handleGetStatus\(payload\);/.test(bridgeSource),
      'the mcp:get-status case pin text is unchanged');
    const configStart = bridgeSource.indexOf('  async _handleGetConfig() {');
    const configEnd = bridgeSource.indexOf('\n  async _handleGetSiteGuides(', configStart);
    const configText = configStart === -1 || configEnd === -1 ? '' : bridgeSource.slice(configStart, configEnd);
    const configHash = crypto.createHash('sha256').update(configText).digest('hex');
    check(configHash === HANDLE_GET_CONFIG_SHA256_469907CB, '_handleGetConfig is byte-identical to 469907cb (got ' + configHash + ')');

    const contracts = dispatcher.getMcpRouteContracts().messageRoutes;
    checkDeep(contracts['mcp:get-settings'], { routeFamily: 'settings', handler: 'handleGetSettingsMessageRoute' },
      'getMcpRouteContracts reports the get-settings route');
    checkDeep(contracts['mcp:set-setting'], { routeFamily: 'settings', handler: 'handleSetSettingMessageRoute' },
      'getMcpRouteContracts reports the set-setting route');
  });
}

// ---------------------------------------------------------------------------
// Part C: session recording keeps settings values out (D-18, D-19, Pitfall 3-5)
// ---------------------------------------------------------------------------

const RECORDER_PATH = path.join(ROOT, 'extension', 'utils', 'mcp-session-recorder.js');
const RECORDING_RUN_ID = 'recording-run-settings';

// sanitizeMcpMessageResponseForRecording('mcp:capture-screenshot', ...) as the
// pre-66.1-06 implementation returned it (captured from 6a934f50 source). The
// settings branch must leave the screenshot path byte-identical in behaviour.
const SCREENSHOT_SAMPLES = Object.freeze({
  ok: {
    success: true,
    dataUrl: 'data:image/png;base64,AAAA',
    metadata: {
      capture_id: 'cap-1', output_width: 1280, output_height: 720, byte_length: 4096,
      duration_ms: 31, delivery_status: 'delivered', format: 'png', tabUrl: 'https://example.test/'
    },
    note: 'extra'
  },
  fail: { success: false, errorCode: 'CAPTURE_FAILED', retryable: true, error: 'boom', metadata: { capture_id: 'cap-2', duration_ms: 5 } },
  failCode: { success: false, code: 'SCREENSHOT_TOO_LARGE', errorCode: 'IGNORED', retryable: 'yes' },
  noMeta: { success: true, metadata: null }
});
const SCREENSHOT_FIXTURE = Object.freeze({
  ok: {
    success: true,
    metadata: { capture_id: 'cap-1', output_width: 1280, output_height: 720, byte_length: 4096, duration_ms: 31, delivery_status: 'delivered' }
  },
  fail: { success: false, metadata: { capture_id: 'cap-2', duration_ms: 5 }, code: 'CAPTURE_FAILED', retryable: true },
  failCode: { success: false, metadata: {}, code: 'SCREENSHOT_TOO_LARGE', retryable: false },
  noMeta: { success: true, metadata: {} }
});

function makeRecorderStorage() {
  const state = {};
  return {
    state,
    async get(keys) {
      if (keys === null || keys === undefined) return { ...state };
      const names = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys));
      const result = {};
      for (const key of names) {
        if (hasOwn(state, key)) result[key] = state[key];
      }
      return result;
    },
    async set(values) { Object.assign(state, values || {}); },
    async remove(keys) {
      for (const key of (Array.isArray(keys) ? keys : [keys])) delete state[key];
    }
  };
}

// The tests/mcp-session-recorder-journal.test.js journalStub pattern: the
// recorder hands its journal snapshot (the tool.call event input) to
// recordDispatch.
function makeJournalStub() {
  const dispatches = [];
  return {
    IDLE_ALARM_PREFIX: 'fsbMcpJournal:idle:',
    RETENTION_ALARM: 'fsbMcpJournal:retention',
    dispatches,
    validRunSidecar(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value); },
    async hasCall() { return false; },
    async hasCorrelation() { return false; },
    async recordDispatch(value) { dispatches.push(value); return { recorded: true }; },
    async markRecordingGap() {},
    async degradeOpenRuns() { return { degraded: 0, ids: [] }; },
    async prune() { return { removed: 0, ids: [] }; },
    async initialize() {},
    async handleAlarm() { return { handled: false }; }
  };
}

const RECORDER_LOGGER_STUB = Object.freeze({
  async withSessionMutationLock(fn) { return fn(); },
  async pruneMcpSessions() { return { removed: 0, ids: [] }; },
  logSessionStart() {},
  logAction() {},
  getSessionLogs() { return [{ data: {} }]; },
  async saveSession() { return true; },
  async updateSessionOutcome() { return true; }
});

let realRecorder = null;

// Loads the real recorder once. It starts an initialization pass at load, so
// it gets a private chrome and logger for that pass (the suite's fake storage,
// listeners and logger capture stay untouched), and the global it registers
// is removed again: only the capture wrapper below may forward to it.
async function loadRealRecorder() {
  if (realRecorder) return realRecorder;
  const saved = {
    chrome: global.chrome,
    logger: global.automationLogger,
    recorder: globalThis.fsbMcpSessionRecorder,
    journal: globalThis.FsbMcpLatticeJournal,
    replay: globalThis.FsbLatticeReplay
  };
  global.chrome = {
    storage: { local: makeRecorderStorage(), session: makeRecorderStorage(), onChanged: { addListener() {} } },
    alarms: { async create() {}, async clear() { return true; }, async get() { return null; }, async getAll() { return []; } }
  };
  global.automationLogger = RECORDER_LOGGER_STUB;
  globalThis.FsbMcpLatticeJournal = makeJournalStub();
  globalThis.FsbLatticeReplay = null;
  try {
    const loaded = require(RECORDER_PATH);
    loaded._setStorageShim(makeRecorderStorage());
    loaded._setLocalStorageShim(makeRecorderStorage());
    loaded._setAlarmShim({ async create() {}, async clear() {}, async get() { return null; } });
    loaded._setTimeShim({ now: () => 1800000000000 });
    await loaded._drainForTests();
    realRecorder = loaded;
  } finally {
    global.chrome = saved.chrome;
    global.automationLogger = saved.logger;
    if (saved.recorder === undefined) delete globalThis.fsbMcpSessionRecorder;
    else globalThis.fsbMcpSessionRecorder = saved.recorder;
    if (saved.journal === undefined) delete globalThis.FsbMcpLatticeJournal;
    else globalThis.FsbMcpLatticeJournal = saved.journal;
    if (saved.replay === undefined) delete globalThis.FsbLatticeReplay;
    else globalThis.FsbLatticeReplay = saved.replay;
  }
  return realRecorder;
}

// Points the real recorder at a fresh journal stub with the given policy.
async function resetRealRecorder(recordingEnabled) {
  const recorder = await loadRealRecorder();
  await recorder._drainForTests();
  recorder._resetForTests();
  const sessionStore = makeRecorderStorage();
  const localStore = makeRecorderStorage();
  recorder._setStorageShim(sessionStore);
  recorder._setLocalStorageShim(localStore);
  const journal = makeJournalStub();
  globalThis.FsbMcpLatticeJournal = journal;
  await recorder._applyPolicyForTests(recordingEnabled !== false, 30, recorder.FSB_MCP_RECORDER_BACKEND_JOURNAL);
  return { recorder, journal, sessionStore, localStore };
}

// Installs the dispatcher's session-recorder global as a capture that keeps
// every entry and, when given, forwards it to the real recorder. No
// spreadsheet redactor is present, so the dispatcher calls it directly.
function installCaptureRecorder(forwardTo) {
  const entries = [];
  const saved = {
    recorder: globalThis.fsbMcpSessionRecorder,
    redactor: globalThis.FsbSpreadsheetRecordRedaction
  };
  delete globalThis.FsbSpreadsheetRecordRedaction;
  globalThis.fsbMcpSessionRecorder = {
    recordDispatch(entry) {
      entries.push(entry);
      if (forwardTo) forwardTo.recordDispatch(entry);
    }
  };
  return {
    entries,
    restore() {
      if (saved.recorder === undefined) delete globalThis.fsbMcpSessionRecorder;
      else globalThis.fsbMcpSessionRecorder = saved.recorder;
      if (saved.redactor !== undefined) globalThis.FsbSpreadsheetRecordRedaction = saved.redactor;
      delete globalThis.FsbMcpLatticeJournal;
    }
  };
}

// JSON and util.inspect (which also shows symbol-keyed context) of a value.
function sinkText(value) {
  let json = '';
  try { json = JSON.stringify(value === undefined ? null : value); } catch (_e) { json = '[unserializable]'; }
  return json + '\n' + util.inspect(value, { depth: 12, breakLength: Infinity });
}

function recordedPayload(key, value, callId, extra) {
  return writePayload(key, value, Object.assign({ recordingRunId: RECORDING_RUN_ID, recordingCallId: callId }, extra || {}));
}

const LATTICE_REPLAY_PATH = path.join(ROOT, 'extension', 'utils', 'lattice-replay.js');
const TOOL_DEFINITIONS_PATH = path.join(ROOT, 'extension', 'ai', 'tool-definitions.js');
const SWEEP_SENTINEL = 'sk-SENTINEL-ALL-9';

// [label, key, submitted value, expected code, extra payload fields, logged key]
const REFUSAL_SWEEP_CASES = Object.freeze([
  ['apiKey', 'apiKey', SWEEP_SENTINEL, 'SETTING_PROTECTED_KEY', null, 'apiKey'],
  ['serverHashKey', 'serverHashKey', SWEEP_SENTINEL, 'SETTING_PROTECTED_KEY', null, 'serverHashKey'],
  ['customEndpoint', 'customEndpoint', 'https://' + SWEEP_SENTINEL + '.example.test/v1?token=' + SWEEP_SENTINEL,
    'SETTING_PROTECTED_KEY', null, 'customEndpoint'],
  ['serverUrl', 'serverUrl', 'https://example.test/' + SWEEP_SENTINEL, 'SETTING_PROTECTED_KEY', null, 'serverUrl'],
  ['lmstudioBaseUrl', 'lmstudioBaseUrl', 'http://user:' + SWEEP_SENTINEL + '@127.0.0.1:1234/v1',
    'SETTING_PROTECTED_KEY', null, 'lmstudioBaseUrl'],
  ['an unknown key', 'fsbNoSuchSetting', SWEEP_SENTINEL, 'SETTING_UNKNOWN_KEY', null, 'fsbNoSuchSetting'],
  ['an invalid key', 'bad key', SWEEP_SENTINEL, 'SETTING_UNKNOWN_KEY', null, '[invalid]'],
  ['a delegated agent writing debugMode', 'debugMode', SWEEP_SENTINEL, 'SETTING_DELEGATED_WRITE_REFUSED',
    { agentId: 'agent_delegated' }, 'debugMode'],
  ['a debugMode write whose value is the sentinel', 'debugMode', SWEEP_SENTINEL, 'SETTING_VALUE_INVALID', null, 'debugMode']
]);

function captureText(args) {
  return args.map((arg) => (typeof arg === 'string' ? arg : util.inspect(arg, { depth: 12, breakLength: Infinity }))).join(' ');
}

// Sends every refused write through the real dispatcher while console and
// process.stderr are wrapped, a capture recorder forwards each entry to the
// real recorder, and the recorder hands its snapshots to a journal stub. The
// wrappers are restored before any check runs, so a failing check can never
// write into the captured text.
async function runRefusalSweep(recordingEnabled) {
  const { recorder, journal, sessionStore, localStore } = await resetRealRecorder(recordingEnabled);
  const capture = installCaptureRecorder(recorder);
  globalThis.FsbMcpLatticeJournal = journal;
  resetStorage({
    fsbMcpSessionRecordingEnabled: recordingEnabled,
    apiKey: 'stored-key-value',
    debugMode: false,
    serverUrl: 'https://full-selfbrowsing.com'
  });
  const storeBefore = clone(fakeStorage.store);
  const loggerStart = loggerCalls.length;
  const responses = [];
  const text = [];
  let stderrWrites = 0;
  const methods = ['log', 'info', 'warn', 'error', 'debug'];
  const originalConsole = {};
  for (const method of methods) originalConsole[method] = console[method];
  const originalStderrWrite = process.stderr.write;
  try {
    for (const method of methods) {
      console[method] = function (...args) {
        try { text.push(captureText(args)); } catch (_e) { /* capture is best-effort */ }
        return originalConsole[method].apply(console, args);
      };
    }
    process.stderr.write = function (chunk, ...rest) {
      stderrWrites += 1;
      try { text.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')); } catch (_e) { /* best-effort */ }
      return originalStderrWrite.call(process.stderr, chunk, ...rest);
    };
    console.debug('settings sweep: console capture is live');
    process.stderr.write('');
    let call = 0;
    for (const [, key, value, , extra] of REFUSAL_SWEEP_CASES) {
      call += 1;
      responses.push(await setSetting(recordedPayload(key, value, 'recording-call-sweep-' + call, extra)));
    }
    await recorder._drainForTests();
    await nextTick();
  } finally {
    for (const method of methods) console[method] = originalConsole[method];
    process.stderr.write = originalStderrWrite;
    capture.restore();
  }
  return {
    responses,
    entries: capture.entries,
    journal,
    sessionStore,
    localStore,
    storeBefore,
    loggerLines: loggerCalls.slice(loggerStart),
    text,
    stderrWrites
  };
}

function checkRefusalSweep(label, result, recordingEnabled) {
  const count = REFUSAL_SWEEP_CASES.length;
  REFUSAL_SWEEP_CASES.forEach(([name, , , code], index) => {
    const response = result.responses[index];
    check(isFailure(response, code), label + ': ' + name + ' is refused with ' + code
      + (response && response.code !== code ? ' (got ' + response.code + ')' : ''));
  });
  check(fakeStorage.setCalls.length === 0, label + ': no storage set call was made');
  checkDeep(fakeStorage.store, result.storeBefore, label + ': the storage map is unchanged');

  check(result.entries.length === count, label + ': the dispatcher recorded one entry per refused write (got ' + result.entries.length + ')');
  check(result.entries.every((entry) => entry.requestPayload && !hasOwn(entry.requestPayload, 'value')),
    label + ': no recorded request has a value');
  check(result.entries.every((entry) => !sinkText(entry).includes('SENTINEL-ALL')), label + ': no recorder entry contains the sentinel');

  const journaled = result.journal.dispatches;
  if (recordingEnabled) {
    check(journaled.length === count, label + ': the real recorder journaled every refused write (got ' + journaled.length + ')');
    checkDeep(journaled.map((event) => event.response && event.response.code), REFUSAL_SWEEP_CASES.map((row) => row[3]),
      label + ': each journal event keeps its refusal code');
  } else {
    check(journaled.length === 0, label + ': recording off journals nothing (got ' + journaled.length + ')');
  }
  check(journaled.every((event) => !sinkText(event).includes('SENTINEL-ALL')), label + ': no journal event contains the sentinel');
  check(!sinkText(result.sessionStore.state).includes('SENTINEL-ALL') && !sinkText(result.localStore.state).includes('SENTINEL-ALL'),
    label + ': the recorder storage holds no sentinel');

  const warnLines = result.loggerLines.filter((line) => line.level === 'warn' && line.message === 'MCP settings write refused');
  check(warnLines.length === count && result.loggerLines.length === count,
    label + ': exactly one automationLogger warn per refused write (got ' + warnLines.length + ' of ' + result.loggerLines.length + ')');
  checkDeep(warnLines.map((line) => line.data && line.data.key), REFUSAL_SWEEP_CASES.map((row) => row[5]),
    label + ': each warn line names the safe key label');
  checkDeep(warnLines.map((line) => line.data && line.data.code), REFUSAL_SWEEP_CASES.map((row) => row[3]),
    label + ': each warn line names its refusal code');
  check(result.loggerLines.every((line) => !sinkText(line).includes('SENTINEL-ALL')), label + ': no automationLogger call contains the sentinel');

  check(result.responses.every((response) => !sinkText(response).includes('SENTINEL-ALL')), label + ': no route response contains the sentinel');
  check(result.text.some((line) => line.includes('settings sweep: console capture is live')) && result.stderrWrites > 0,
    label + ': the console and stderr capture was live');
  check(result.text.every((line) => !line.includes('SENTINEL-ALL')), label + ': no console or stderr text contains the sentinel');
}

// Loads lattice-replay.js without leaving its FsbLatticeReplay global behind.
function loadLatticeReplay() {
  const saved = globalThis.FsbLatticeReplay;
  try {
    return require(LATTICE_REPLAY_PATH);
  } finally {
    if (saved === undefined) delete globalThis.FsbLatticeReplay;
    else globalThis.FsbLatticeReplay = saved;
  }
}

async function partC() {
  await runSection('recording sanitizers are exported (D-19)', async () => {
    check(typeof dispatcher.sanitizeMcpMessageRequestForRecording === 'function', 'sanitizeMcpMessageRequestForRecording is exported');
    check(typeof dispatcher.sanitizeMcpMessageResponseForRecording === 'function', 'sanitizeMcpMessageResponseForRecording is exported');
  });

  await runSection('request sanitizer drops the submitted value (D-19)', async () => {
    const sanitizeRequest = dispatcher.sanitizeMcpMessageRequestForRecording;
    const input = { key: 'apiKey', value: 'sk-SENTINEL-3', agentId: 'a1', recordingRunId: 'r1', recordingCallId: 'c1' };
    const before = clone(input);
    const recorded = sanitizeRequest('mcp:set-setting', input);
    checkDeep(recorded, { key: 'apiKey', agentId: 'a1', recordingRunId: 'r1', recordingCallId: 'c1' },
      'a set-setting request keeps key and the agent/recording fields but not value');
    check(recorded !== input, 'the recorded request is a copy');
    checkDeep(input, before, 'the input payload is not mutated');
    check(!hasSentinel(recorded), 'the recorded request has no SENTINEL value');

    checkDeep(sanitizeRequest('mcp:set-setting', { key: 'bad key', value: 'x', agentId: 'a1' }), { key: '[invalid]', agentId: 'a1' },
      'a malformed key is recorded as [invalid]');
    checkDeep(sanitizeRequest('mcp:set-setting', { key: 42, value: 1, agentId: 'a1' }), { key: '[invalid]', agentId: 'a1' },
      'a non-string key is recorded as [invalid]');
    checkDeep(sanitizeRequest('mcp:set-setting', { key: 'a'.repeat(65), value: 1 }), { key: '[invalid]' },
      'a key longer than 64 characters is recorded as [invalid]');
    checkDeep(sanitizeRequest('mcp:get-settings', { key: 'maxIterations', agentId: 'a1', connectionId: 'conn-1' }),
      { key: 'maxIterations', agentId: 'a1', connectionId: 'conn-1' }, 'a get-settings request keeps key, agentId and connectionId');
    checkDeep(sanitizeRequest('mcp:get-settings', { agentId: 'a1', value: 'sk-SENTINEL-3' }), { agentId: 'a1' },
      'a get-settings request never records a value either, and gains no key');

    const context = Symbol('replay-context');
    const withSymbol = { key: 'debugMode', value: true, agentId: 'a1' };
    withSymbol[context] = { tabId: 7 };
    const symbolCopy = sanitizeRequest('mcp:set-setting', withSymbol);
    check(symbolCopy[context] === withSymbol[context] && !hasOwn(symbolCopy, 'value'), 'symbol-keyed context is kept');

    const otherPayload = { key: 'k', value: 'v', agentId: 'a1' };
    check(sanitizeRequest('mcp:get-logs', otherPayload) === otherPayload, 'another type returns the same payload reference');
    check(sanitizeRequest('mcp:capture-screenshot', otherPayload) === otherPayload, 'the screenshot type returns the same payload reference');
    check(sanitizeRequest('mcp:set-setting', null) === null && sanitizeRequest('mcp:set-setting', undefined) === undefined,
      'a null or missing settings payload stays as it is');
    const malformed = [['a string', 'sk-SENTINEL-3'], ['an array', ['sk-SENTINEL-3']], ['a number', 7]];
    for (const [name, payload] of malformed) {
      const recordedMalformed = sanitizeRequest('mcp:set-setting', payload);
      checkDeep(recordedMalformed, {}, name + ' settings payload is recorded as an empty object');
    }
  });

  await runSection('response sanitizer records summaries (D-18, D-19)', async () => {
    const sanitizeResponse = dispatcher.sanitizeMcpMessageResponseForRecording;
    resetStorage({ maxIterations: 300 });
    const all = await getSettings({ agentId: 'agent_ok' });
    const allBefore = clone(all);
    checkDeep(sanitizeResponse('mcp:get-settings', all), { success: true, keyCount: PRODUCTION_SCHEMA.keys().length },
      'read-all is recorded as its key count');
    check(PRODUCTION_SCHEMA.keys().length === Object.keys((all && all.settings) || {}).length,
      'the key count equals the number of settings in the reply');
    checkDeep(all, allBefore, 'the reply itself is not changed');

    const one = await getSettings({ agentId: 'agent_ok', key: 'maxIterations' });
    check(one && one.success === true && one.value === 300, 'the read-one reply carries the value');
    checkDeep(sanitizeResponse('mcp:get-settings', one), { success: true, key: 'maxIterations', writable: true },
      'read-one is recorded as key and writable');
    const secretRead = await getSettings({ agentId: 'agent_ok', key: 'apiKey' });
    checkDeep(sanitizeResponse('mcp:get-settings', secretRead), { success: true, key: 'apiKey', writable: false },
      'a protected read is recorded as key and writable:false');

    resetStorage({});
    const write = await setSetting(writePayload('debugMode', 'true'));
    checkDeep(sanitizeResponse('mcp:set-setting', write), { success: true, key: 'debugMode', value: true, previous: false, changed: ['debugMode'] },
      'an accepted write is recorded as key, value, previous and changed');

    resetStorage({ modelName: 'grok-4' });
    const pairWrite = await setSetting(writePayload('modelProvider', 'lmstudio'));
    checkDeep(sanitizeResponse('mcp:set-setting', pairWrite), {
      success: true, key: 'modelProvider', value: 'lmstudio', previous: 'xai', changed: ['modelProvider', 'modelName'],
      coupled: { modelName: { value: '', previous: 'grok-4' } }
    }, 'a provider switch is recorded with its coupled modelName (WR-02)');
    checkDeep(sanitizeResponse('mcp:set-setting', { success: true, key: 'modelProvider', value: 'x', previous: 'y', changed: [], coupled: { 'bad key!': { value: 1, previous: 2 }, modelName: 'not-an-object' } }),
      { success: true, key: 'modelProvider', value: 'x', previous: 'y', changed: [] },
      'a malformed coupled map records nothing');
    resetStorage({});

    const refused = await setSetting(writePayload('apiKey', 'sk-SENTINEL-3'));
    checkDeep(sanitizeResponse('mcp:set-setting', refused), { success: false, code: 'SETTING_PROTECTED_KEY', key: 'apiKey' },
      'a refused write is recorded as code and key');
    checkDeep(sanitizeResponse('mcp:set-setting', { success: false, errorCode: 'SETTING_UNKNOWN_KEY', error: 'e', key: 'bad key', values: ['a'] }),
      { success: false, code: 'SETTING_UNKNOWN_KEY', key: '[invalid]' }, 'a failure takes errorCode and labels a malformed key');
    checkDeep(sanitizeResponse('mcp:get-settings', { success: false, code: 'SETTING_STORAGE_FAILED', errorCode: 'SETTING_STORAGE_FAILED', error: 'e' }),
      { success: false, code: 'SETTING_STORAGE_FAILED' }, 'a failure without a key records no key');

    for (const name of Object.keys(SCREENSHOT_SAMPLES)) {
      checkDeep(sanitizeResponse('mcp:capture-screenshot', clone(SCREENSHOT_SAMPLES[name])), SCREENSHOT_FIXTURE[name],
        'the screenshot ' + name + ' response is sanitized exactly as before');
    }
    check(sanitizeResponse('mcp:capture-screenshot', null) === null, 'a null screenshot response stays null');
    const logs = { success: true, logs: [{ message: 'x' }] };
    check(sanitizeResponse('mcp:get-logs', logs) === logs, 'another type returns the same response reference');
  });

  await runSection('dispatch records one value-free entry per settings call', async () => {
    const capture = installCaptureRecorder(null);
    try {
      resetStorage({});
      const write = await setSetting(recordedPayload('debugMode', 'true', 'recording-call-settings-1'));
      check(write && write.success === true, 'the recorded write succeeds');
      check(capture.entries.length === 1, 'one write records exactly one entry');
      const entry = capture.entries[0] || { requestPayload: {} };
      check(entry.tool === 'mcp:set-setting' && entry.dispatcher_route === 'message' && entry.success === true,
        'the entry names the type, the message route and success');
      check(entry.requestPayload && !hasOwn(entry.requestPayload, 'value'), 'the recorded request has no value');
      check(entry.requestPayload && entry.requestPayload.key === 'debugMode' && entry.requestPayload.agentId === 'agent_ok'
        && entry.requestPayload.recordingRunId === RECORDING_RUN_ID, 'the recorded request keeps key, agentId and recordingRunId');
      checkDeep(entry.response, { success: true, key: 'debugMode', value: true, previous: false, changed: ['debugMode'] },
        'the recorded response is the write summary');

      const all = await getSettings({ agentId: 'agent_ok', recordingRunId: RECORDING_RUN_ID, recordingCallId: 'recording-call-settings-2' });
      check(all && all.success === true && all.settings, 'the recorded read-all succeeds');
      const readEntry = capture.entries[1] || {};
      checkDeep(readEntry.response, { success: true, keyCount: PRODUCTION_SCHEMA.keys().length }, 'read-all is recorded as its key count');
      check(readEntry.response && !hasOwn(readEntry.response, 'settings'), 'the recorded read-all has no settings map');

      const refused = await setSetting(recordedPayload('apiKey', 'sk-SENTINEL-5', 'recording-call-settings-3'));
      check(isFailure(refused, 'SETTING_PROTECTED_KEY'), 'the recorded refusal is SETTING_PROTECTED_KEY');
      const refusedEntry = capture.entries[2] || {};
      checkDeep(refusedEntry.response, { success: false, code: 'SETTING_PROTECTED_KEY', key: 'apiKey' }, 'the refusal is recorded as code and key');
      check(capture.entries.length === 3, 'three settings calls record three entries');
      check(capture.entries.every((item) => !sinkText(item).includes('SENTINEL')), 'no recorded entry contains a SENTINEL value');
    } finally {
      capture.restore();
    }
  });

  await runSection('the journal keeps the accepted write facts (Pitfall 4)', async () => {
    const { recorder, journal } = await resetRealRecorder(true);
    const capture = installCaptureRecorder(null);
    globalThis.FsbMcpLatticeJournal = journal;
    try {
      resetStorage({});
      const write = await setSetting(recordedPayload('maxIterations', '120', 'recording-call-journal-1'));
      check(write && write.success === true, 'the journaled write succeeds');
      const all = await getSettings({ agentId: 'agent_ok', recordingRunId: RECORDING_RUN_ID, recordingCallId: 'recording-call-journal-2' });
      check(all && all.success === true, 'the journaled read-all succeeds');
      const refused = await setSetting(recordedPayload('serverHashKey', 'sk-SENTINEL-6', 'recording-call-journal-3'));
      check(isFailure(refused, 'SETTING_PROTECTED_KEY'), 'the journaled refusal is SETTING_PROTECTED_KEY');
      for (const entry of capture.entries) recorder.recordDispatch(entry);
      await recorder._drainForTests();

      check(journal.dispatches.length === 3, 'the real recorder hands three calls to the journal (got ' + journal.dispatches.length + ')');
      const [writeEvent, readEvent, refusedEvent] = journal.dispatches;
      const writeResult = (writeEvent && writeEvent.response) || {};
      check(writeEvent && writeEvent.tool === 'mcp:set-setting' && writeEvent.resultProjection === 'journal-full-v1',
        'the write uses the full-result journal projection');
      checkDeep(writeResult, { success: true, key: 'maxIterations', value: 120, previous: 100, changed: ['maxIterations'] },
        'the journal result keeps key, value, previous and changed');
      check(writeEvent && writeEvent.requestPayload && !hasOwn(writeEvent.requestPayload, 'value')
        && writeEvent.requestPayload.key === 'maxIterations', 'the journal request keeps key and no value');
      check(readEvent && readEvent.resultProjection === 'journal-full-v1', 'the read uses the full-result journal projection');
      checkDeep(readEvent && readEvent.response, { success: true, keyCount: PRODUCTION_SCHEMA.keys().length },
        'the journal read result is the key count');
      checkDeep(refusedEvent && refusedEvent.response, { success: false, code: 'SETTING_PROTECTED_KEY', key: 'serverHashKey' },
        'the journal refusal result is code and key');
      check(journal.dispatches.every((event) => !sinkText(event).includes('SENTINEL')), 'no journal event contains a SENTINEL value');
    } finally {
      capture.restore();
    }
  });

  await runSection('a refused value leaves no trace in any sink (SC2)', async () => {
    const result = await runRefusalSweep(true);
    checkRefusalSweep('recording on', result, true);
  });

  await runSection('the operator log still holds every refusal with recording off (D-18)', async () => {
    const result = await runRefusalSweep(false);
    check(fakeStorage.store.fsbMcpSessionRecordingEnabled === false, 'recording off: fsbMcpSessionRecordingEnabled is stored false');
    checkRefusalSweep('recording off', result, false);
  });

  await runSection('replay never re-runs a settings call (Pitfall 5)', async () => {
    const replay = loadLatticeReplay();
    check(replay && typeof replay.classifyReplayEntry === 'function', 'lattice-replay.js exports classifyReplayEntry');
    const writeSummary = { success: true, key: 'debugMode', value: true, previous: false, changed: ['debugMode'] };
    const readSummary = { success: true, keyCount: PRODUCTION_SCHEMA.keys().length };
    const toolDefinitions = require(TOOL_DEFINITIONS_PATH);
    const savedLookup = globalThis.getToolByName;
    try {
      for (const withRegistry of [false, true]) {
        if (withRegistry) globalThis.getToolByName = toolDefinitions.getToolByName;
        else delete globalThis.getToolByName;
        const suffix = withRegistry ? ' with the real tool registry' : ' without a tool registry';
        const write = replay.classifyReplayEntry({ tool: 'mcp:set-setting', success: true, response: writeSummary,
          requestPayload: { key: 'debugMode', agentId: 'agent_ok' } });
        check(write && write.availability === 'unsupported' && write.risk === 'inspect-only',
          'classifyReplayEntry reports mcp:set-setting as inspect-only and unsupported' + suffix);
        const read = replay.classifyReplayEntry({ tool: 'mcp:get-settings', success: true, response: readSummary,
          requestPayload: { agentId: 'agent_ok' } });
        check(read && read.availability === 'unsupported' && read.risk === 'inspect-only',
          'classifyReplayEntry reports mcp:get-settings as inspect-only and unsupported' + suffix);
      }
      check(replay.classifyReplayEntry({ tool: 'click', success: true }).availability === 'approval-once',
        'control: a registry tool still classifies as replayable');
    } finally {
      if (savedLookup === undefined) delete globalThis.getToolByName;
      else globalThis.getToolByName = savedLookup;
    }

    // The journal's own snapshots of settings calls become replay steps that
    // replay_session never executes and that carry no submitted value.
    const { recorder, journal } = await resetRealRecorder(true);
    const capture = installCaptureRecorder(recorder);
    globalThis.FsbMcpLatticeJournal = journal;
    try {
      resetStorage({});
      await setSetting(recordedPayload('debugMode', 'true', 'recording-call-replay-1'));
      await getSettings({ agentId: 'agent_ok', recordingRunId: RECORDING_RUN_ID, recordingCallId: 'recording-call-replay-2' });
      await getSettings({ agentId: 'agent_ok', key: 'maxIterations', recordingRunId: RECORDING_RUN_ID, recordingCallId: 'recording-call-replay-3' });
      await setSetting(recordedPayload('apiKey', 'sk-SENTINEL-7', 'recording-call-replay-4'));
      await recorder._drainForTests();
    } finally {
      capture.restore();
    }
    check(journal.dispatches.length === 4, 'four settings calls were journaled (got ' + journal.dispatches.length + ')');
    const record = replay.createReplayRecord({ sessionId: 'settings-replay', task: 'settings' }, journal.dispatches);
    const steps = (record && record.manifest && record.manifest.steps) || [];
    check(steps.length === 4, 'the replay manifest has one step per journaled settings call');
    const executable = ['ready', 'approval-once', 'approval-per-step'];
    check(steps.every((step) => step.replay && step.replay.availability === 'unsupported'),
      'every settings replay step is unsupported');
    check(steps.every((step) => step.replay && executable.indexOf(step.replay.availability) === -1),
      'no settings replay step is executable (background fsbReplayIsExecutable)');
    check(steps.every((step) => step.arguments && !hasOwn(step.arguments, 'value')), 'no settings replay step carries a value argument');
    check(!sinkText(steps).includes('SENTINEL'), 'no settings replay step contains a SENTINEL value');
    let validated = true;
    try { replay.validateReplayClassifications(steps); } catch (_e) { validated = false; }
    check(validated, 'the stored classifications match classifyReplayEntry');
    check(record && record.counts && record.counts.executable === 0, 'the replay counts show no executable step');

    const replaySource = fs.readFileSync(LATTICE_REPLAY_PATH, 'utf8');
    for (const setName of ['READ_TOOLS', 'PER_STEP_TOOLS', 'LEGACY_WRITE_TOOLS']) {
      const start = replaySource.indexOf('var ' + setName + ' = new Set([');
      const end = start === -1 ? -1 : replaySource.indexOf(']);', start);
      const body = start === -1 || end === -1 ? null : replaySource.slice(start, end);
      check(body !== null && !body.includes('mcp:set-setting') && !body.includes('mcp:get-settings'),
        setName + ' in lattice-replay.js names neither settings type');
    }
    check(!replaySource.includes('mcp:set-setting') && !replaySource.includes('mcp:get-settings'),
      'lattice-replay.js names neither settings type anywhere');
  });
}

// ---------------------------------------------------------------------------
// Value hygiene across every sink
// ---------------------------------------------------------------------------

function sentinelScan() {
  out('\n--- SENTINEL scan across every sink ---');
  check(allResponses.length > 0 && allResponses.every((response) => !hasSentinel(response)), 'no route response contains a SENTINEL value');
  check(allSetCalls.every((call) => !hasSentinel(call)), 'no storage set call contains a SENTINEL value');
  check(loggerCalls.every((call) => !hasSentinel(call)), 'no automationLogger call contains a SENTINEL value');
  check(consoleLines.every((line) => !line.includes('SENTINEL')), 'no console line contains a SENTINEL value');
  check(fetchCalls === 0, 'no route ever called fetch');
  check(tabsCreateCalls.length === 0, 'no route ever opened a tab');
}

(async () => {
  await partA();
  await partB();
  await partC();
  sentinelScan();
  out('\nmcp-settings-route: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  process.stderr.write('mcp-settings-route crashed: ' + (error && error.stack ? error.stack : String(error)) + '\n');
  process.exit(1);
});
