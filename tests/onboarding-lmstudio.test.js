'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const onboardingPath = path.join(__dirname, '..', 'extension', 'ui', 'onboarding.js');
const originalSource = fs.readFileSync(onboardingPath, 'utf8');
const instrumentedSource = originalSource.replace(
  "  window.addEventListener('pagehide', () => {",
  "  globalThis.__ONBOARDING_LMSTUDIO_TEST__ = { state, els, discoverLmStudioModels, validateAndContinue, normalizeBaseUrl };\n\n  window.addEventListener('pagehide', () => {"
);

function makeElement() {
  return {
    dataset: {},
    style: {},
    innerHTML: '',
    textContent: '',
    classList: { toggle: () => {}, add: () => {}, remove: () => {} },
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

function makeHarness(discoverImpl) {
  const sequence = [];
  const storageWrites = [];
  const connectionConfigs = [];
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    cancelAnimationFrame: () => {},
    document: { addEventListener: () => {}, querySelector: () => null },
    window: { addEventListener: () => {} },
    chrome: {
      runtime: {
        getManifest: () => ({ version: 'test' }),
        lastError: null,
        sendMessage: (message, callback) => {
          sequence.push('validate');
          connectionConfigs.push(message.config);
          callback({ ok: true });
        }
      },
      storage: {
        local: {
          set: (patch, callback) => {
            sequence.push('store');
            storageWrites.push(patch);
            if (callback) callback();
          }
        }
      }
    }
  };
  context.globalThis = context;
  context.FSBModelDiscovery = {
    normalizeLmStudioBaseUrl(value) {
      let url = String(value || 'http://localhost:1234').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
      if (!/^https?:\/\//.test(url)) url = 'http://' + url;
      return url;
    },
    discoverModels: discoverImpl
  };
  vm.runInNewContext(instrumentedSource, context, { filename: onboardingPath });
  const api = context.__ONBOARDING_LMSTUDIO_TEST__;
  Object.assign(api.els, {
    root: makeElement(),
    screen: makeElement(),
    nodes: makeElement(),
    trackFill: makeElement(),
    stepLabel: makeElement(),
    toast: makeElement(),
    toastMsg: makeElement()
  });
  Object.assign(api.state, {
    path: 'byok',
    screen: 'apikey',
    provider: 'lmstudio',
    lmstudioBaseUrl: 'localhost:1234/v1',
    lmstudioModel: '',
    lmstudioModels: [],
    lmstudioDiscoveryStatus: 'idle',
    lmstudioDiscoveryMessage: '',
    lmstudioDiscoveredBaseUrl: ''
  });
  return { api, sequence, storageWrites, connectionConfigs };
}

(async function run() {
  const single = makeHarness(async (provider, credential, options) => {
    assert.strictEqual(provider, 'lmstudio');
    assert.strictEqual(credential, '');
    assert.strictEqual(options.baseUrl, 'http://localhost:1234');
    return {
      ok: true,
      source: 'live',
      models: [{ id: 'qwen/qwen3.6-27b', displayName: 'qwen/qwen3.6-27b' }]
    };
  });

  assert.strictEqual(await single.api.discoverLmStudioModels({ force: true }), true, 'onboarding discovers the local model');
  assert.strictEqual(single.api.state.lmstudioModel, 'qwen/qwen3.6-27b', 'one compatible model is selected');
  assert.strictEqual(await single.api.validateAndContinue(), true, 'validated LM Studio configuration can continue');
  assert.strictEqual(single.connectionConfigs[0].model, 'qwen/qwen3.6-27b', 'connection test uses the exact selected model');
  assert.deepStrictEqual(single.sequence.slice(-2), ['validate', 'store'], 'configuration is stored only after connection validation');
  const stored = single.storageWrites[single.storageWrites.length - 1];
  assert.strictEqual(stored.modelProvider, 'lmstudio');
  assert.strictEqual(stored.modelName, 'qwen/qwen3.6-27b');
  assert.strictEqual(stored.lmstudioBaseUrl, 'http://localhost:1234');

  const pending = {};
  const delayed = makeHarness((_provider, _credential, options) => new Promise((resolve) => {
    pending[options.baseUrl] = resolve;
  }));
  delayed.api.state.lmstudioBaseUrl = 'http://localhost:1234';
  const first = delayed.api.discoverLmStudioModels({ force: true });
  delayed.api.state.lmstudioBaseUrl = 'http://localhost:5678';
  const second = delayed.api.discoverLmStudioModels({ force: true });
  pending['http://localhost:5678']({
    ok: true,
    models: [{ id: 'qwen/new-model', displayName: 'qwen/new-model' }]
  });
  await second;
  pending['http://localhost:1234']({
    ok: true,
    models: [{ id: 'qwen/stale-model', displayName: 'qwen/stale-model' }]
  });
  await first;
  assert.strictEqual(delayed.api.state.lmstudioModel, 'qwen/new-model', 'late discovery response cannot overwrite the current server selection');
  assert.strictEqual(delayed.api.state.lmstudioDiscoveredBaseUrl, 'http://localhost:5678', 'current discovery URL remains authoritative');

  const multiple = makeHarness(async () => ({
    ok: true,
    source: 'live',
    models: [
      { id: 'qwen/qwen3.6-27b', displayName: 'qwen/qwen3.6-27b' },
      { id: 'mistral/chat', displayName: 'mistral/chat' }
    ]
  }));
  assert.strictEqual(await multiple.api.discoverLmStudioModels({ force: true }), true, 'multiple local chat models are discovered');
  assert.strictEqual(multiple.api.state.lmstudioModel, '', 'multiple candidates do not silently select the first model');
  assert.strictEqual(await multiple.api.validateAndContinue(), false, 'onboarding cannot continue without an explicit local model choice');
  assert.deepStrictEqual(multiple.sequence, [], 'ambiguous discovery sends no connection test and writes no storage');
  multiple.api.state.lmstudioModel = 'qwen/qwen3.6-27b';
  assert.strictEqual(await multiple.api.validateAndContinue(), true, 'an explicit local model choice can be validated');
  assert.strictEqual(multiple.connectionConfigs[0].model, 'qwen/qwen3.6-27b', 'the explicitly selected local model is tested exactly');
  assert.strictEqual(multiple.storageWrites[0].modelName, 'qwen/qwen3.6-27b', 'the explicitly selected local model is persisted');

  console.log('PASS onboarding-lmstudio.test.js');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
