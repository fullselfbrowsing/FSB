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

function makeHarness(discoverImpl, options) {
  const opts = options || {};
  const sequence = [];
  const storageWrites = [];
  const connectionConfigs = [];
  const heldChecks = [];
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
          if (opts.holdValidation) heldChecks.push(callback);
          else callback({ ok: true });
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
  return { api, sequence, storageWrites, connectionConfigs, heldChecks };
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

  // Another model is chosen while the first one is being checked: the late answer is for the old model.
  const switching = makeHarness(async () => ({
    ok: true,
    source: 'live',
    models: [
      { id: 'qwen/qwen3.6-27b', displayName: 'qwen/qwen3.6-27b' },
      { id: 'mistral/chat', displayName: 'mistral/chat' }
    ]
  }), { holdValidation: true });
  assert.strictEqual(await switching.api.discoverLmStudioModels({ force: true }), true, 'two local chat models are discovered');
  switching.api.state.lmstudioModel = 'qwen/qwen3.6-27b';
  const switchingCheck = switching.api.validateAndContinue();
  for (let i = 0; i < 20 && switching.heldChecks.length === 0; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(switching.heldChecks.length, 1, 'the first model is sent for a connection test');
  // What the model select's change handler does.
  switching.api.state.lmstudioModel = 'mistral/chat';
  switching.api.state.keyStatus = 'idle';
  switching.heldChecks[0]({ ok: true });
  assert.strictEqual(await switchingCheck, false, 'an answer for the old model cannot continue');
  assert.strictEqual(switching.api.state.keyStatus, 'idle', 'the newly chosen model is still unchecked');
  assert.strictEqual(switching.api.state.validating, false, 'the late answer ends the busy state');
  assert.deepStrictEqual(switching.storageWrites, [], 'the old model is not stored');

  const twoModels = async () => ({
    ok: true,
    source: 'live',
    models: [
      { id: 'qwen/qwen3.6-27b', displayName: 'qwen/qwen3.6-27b' },
      { id: 'mistral/chat', displayName: 'mistral/chat' }
    ]
  });
  async function heldCount(harness, count) {
    for (let i = 0; i < 40 && harness.heldChecks.length < count; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(harness.heldChecks.length, count, `connection test ${count} is sent`);
  }

  // The model select re-enables Continue during a check, so a second check can start before the
  // first answers. The first answer, stale by then, leaves the newer check's busy state alone.
  const overlapping = makeHarness(twoModels, { holdValidation: true });
  assert.strictEqual(await overlapping.api.discoverLmStudioModels({ force: true }), true, 'two local chat models are discovered');
  overlapping.api.state.lmstudioModel = 'qwen/qwen3.6-27b';
  const olderCheck = overlapping.api.validateAndContinue();
  await heldCount(overlapping, 1);
  overlapping.api.state.lmstudioModel = 'mistral/chat';
  overlapping.api.state.keyStatus = 'idle';
  const newerCheck = overlapping.api.validateAndContinue();
  await heldCount(overlapping, 2);
  overlapping.heldChecks[0]({ ok: true });
  assert.strictEqual(await olderCheck, false, 'the older answer is for a model no longer chosen');
  assert.strictEqual(overlapping.api.state.validating, true, 'the newer check still holds the busy state');
  assert.strictEqual(overlapping.api.state.keyStatus, 'validating', 'the newer check is still running');
  overlapping.heldChecks[1]({ ok: true });
  assert.strictEqual(await newerCheck, true, 'the chosen model continues on its own answer');
  assert.strictEqual(overlapping.api.state.keyStatus, 'valid', 'the chosen model is valid');
  assert.strictEqual(overlapping.api.state.validating, false, 'its answer ends the busy state');
  assert.strictEqual(overlapping.storageWrites.length, 1, 'only the chosen model is stored');
  assert.strictEqual(overlapping.storageWrites[0].modelName, 'mistral/chat', 'the stored model is the chosen one');

  // Away and back to the same model, then Continue: an older failure that lands after the newer
  // success cannot mark that model invalid again.
  const reordered = makeHarness(twoModels, { holdValidation: true });
  assert.strictEqual(await reordered.api.discoverLmStudioModels({ force: true }), true, 'two local chat models are discovered');
  reordered.api.state.lmstudioModel = 'qwen/qwen3.6-27b';
  const slowCheck = reordered.api.validateAndContinue();
  await heldCount(reordered, 1);
  reordered.api.state.lmstudioModel = 'mistral/chat';
  reordered.api.state.lmstudioModel = 'qwen/qwen3.6-27b';
  reordered.api.state.keyStatus = 'idle';
  const fastCheck = reordered.api.validateAndContinue();
  await heldCount(reordered, 2);
  reordered.heldChecks[1]({ ok: true });
  assert.strictEqual(await fastCheck, true, 'the newer check passes');
  reordered.heldChecks[0]({ ok: false, error: 'Request timed out' });
  assert.strictEqual(await slowCheck, false, 'the older check does not continue');
  assert.strictEqual(reordered.api.state.keyStatus, 'valid', 'an older failure cannot undo the newer success');
  assert.strictEqual(reordered.api.state.validating, false, 'nothing is left busy');

  console.log('PASS onboarding-lmstudio.test.js');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
