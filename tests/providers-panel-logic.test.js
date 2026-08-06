'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'extension', 'ui', 'providers-panel.js');
const optionsPath = path.join(root, 'extension', 'ui', 'options.js');
const universalProviderPath = path.join(
  root,
  'extension',
  'ai',
  'universal-provider.js'
);

delete globalThis.FsbDelegationProviders;
delete globalThis.FSBProvidersPanel;
delete require.cache[require.resolve('../extension/utils/delegation-providers.js')];
delete require.cache[require.resolve(helperPath)];
require('../extension/utils/delegation-providers.js');
const providers = require(helperPath);

const optionsSource = fs.readFileSync(optionsPath, 'utf8');
const universalProviderSource = fs.readFileSync(universalProviderPath, 'utf8');

const apiIds = [
  'xai',
  'gemini',
  'openai',
  'anthropic',
  'openrouter',
  'lmstudio',
  'custom'
];
const agentIds = ['claude-code', 'opencode', 'codex'];

assert.deepEqual(providers.API_PROVIDER_IDS, apiIds);
assert.deepEqual(providers.AGENT_PROVIDER_IDS, agentIds);
assert.equal(Object.isFrozen(providers.API_PROVIDER_IDS), true);
assert.equal(Object.isFrozen(providers.AGENT_PROVIDER_IDS), true);

for (const providerId of apiIds) {
  assert.equal(providers.isApiProvider(providerId), true);
  assert.equal(providers.isAgentProvider(providerId), false);
}
for (const providerId of agentIds) {
  assert.equal(providers.isApiProvider(providerId), false);
  assert.equal(providers.isAgentProvider(providerId), true);
}
for (const providerId of ['', 'cursor', 'gemini-cli', '__proto__', null, undefined]) {
  assert.equal(providers.isApiProvider(providerId), false);
  assert.equal(providers.isAgentProvider(providerId), false);
}

assert.deepEqual(providers.normalizeSettings({}), {
  providerKind: 'api',
  modelProvider: 'xai',
  agentProviderId: ''
});
for (const modelProvider of apiIds) {
  assert.deepEqual(providers.normalizeSettings({ modelProvider }), {
    providerKind: 'api',
    modelProvider,
    agentProviderId: ''
  }, `legacy ${modelProvider} settings remain API settings`);
}
for (const agentProviderId of agentIds) {
  assert.deepEqual(providers.normalizeSettings({
    providerKind: 'agent',
    modelProvider: 'openai',
    agentProviderId
  }), {
    providerKind: 'agent',
    modelProvider: 'openai',
    agentProviderId
  }, `${agentProviderId} stays separate from the latent API provider`);
}
assert.deepEqual(providers.normalizeSettings({
  providerKind: 'api',
  modelProvider: 'anthropic',
  agentProviderId: 'codex'
}), {
  providerKind: 'api',
  modelProvider: 'anthropic',
  agentProviderId: 'codex'
}, 'an inactive agent selection is preserved');
assert.deepEqual(providers.normalizeSettings({
  providerKind: 'agent',
  modelProvider: 'gemini',
  agentProviderId: 'cursor'
}), {
  providerKind: 'api',
  modelProvider: 'gemini',
  agentProviderId: ''
}, 'an invalid active agent fails closed without changing the API selection');

const state = providers.normalizeSettings({
  providerKind: 'api',
  modelProvider: 'openrouter',
  agentProviderId: 'claude-code'
});
state.providerKind = 'agent';
state.agentProviderId = 'codex';
assert.deepEqual(providers.normalizeSettings(state), {
  providerKind: 'agent',
  modelProvider: 'openrouter',
  agentProviderId: 'codex'
});
state.providerKind = 'api';
assert.deepEqual(providers.normalizeSettings(state), {
  providerKind: 'api',
  modelProvider: 'openrouter',
  agentProviderId: 'codex'
}, 'switching back restores the API selection without deleting the agent selection');

assert.match(
  optionsSource,
  /providerKind:\s*normalizedProviderSettings\.providerKind,[\s\S]*?agentProviderId:\s*normalizedProviderSettings\.agentProviderId,[\s\S]*?modelProvider:\s*normalizedProviderSettings\.modelProvider/
);
assert.doesNotMatch(
  optionsSource,
  /modelProvider\s*=\s*providerPanelState\.agentProviderId/
);
for (const agentProviderId of agentIds) {
  assert.doesNotMatch(
    universalProviderSource,
    new RegExp(`['"]${agentProviderId}['"]`),
    `${agentProviderId} never enters the API-only universal provider`
  );
}

console.log('providers-panel-logic.test.js: PASS');
