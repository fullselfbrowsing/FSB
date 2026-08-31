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
const agentIds = ['claude-code', 'grok-build'];
const retiredAgentIds = ['codex', 'opencode'];

function activeSettings(settings) {
  return {
    ...settings,
    requiresProviderReselection: false,
    retiredAgentProviderId: ''
  };
}

assert.deepEqual(providers.API_PROVIDER_IDS, apiIds);
assert.deepEqual(providers.AGENT_PROVIDER_IDS, agentIds);
assert.deepEqual(providers.RETIRED_AGENT_PROVIDER_IDS, retiredAgentIds);
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
assert.equal(providers.isAgentProvider('codex'), false);
assert.equal(providers.isRetiredAgentProvider('codex'), true);
assert.equal(providers.isAgentProvider('opencode'), false);
assert.equal(providers.isRetiredAgentProvider('opencode'), true);
for (const providerId of ['', 'cursor', 'gemini-cli', '__proto__', null, undefined]) {
  assert.equal(providers.isApiProvider(providerId), false);
  assert.equal(providers.isAgentProvider(providerId), false);
}

assert.deepEqual(providers.normalizeSettings({}), {
  providerKind: 'api',
  modelProvider: 'xai',
  agentProviderId: '',
  requiresProviderReselection: false,
  retiredAgentProviderId: ''
});
for (const modelProvider of apiIds) {
  assert.deepEqual(providers.normalizeSettings({ modelProvider }), activeSettings({
    providerKind: 'api',
    modelProvider,
    agentProviderId: ''
  }), `legacy ${modelProvider} settings remain API settings`);
}
for (const agentProviderId of agentIds) {
  assert.deepEqual(providers.normalizeSettings({
    providerKind: 'agent',
    modelProvider: 'openai',
    agentProviderId
  }), activeSettings({
    providerKind: 'agent',
    modelProvider: 'openai',
    agentProviderId
  }), `${agentProviderId} stays separate from the latent API provider`);
}
assert.deepEqual(providers.normalizeSettings({
  providerKind: 'api',
  modelProvider: 'anthropic',
  agentProviderId: 'codex'
}), activeSettings({
  providerKind: 'api',
  modelProvider: 'anthropic',
  agentProviderId: ''
}), 'a stale inactive Codex selection is discarded without blocking the active API');
assert.deepEqual(providers.normalizeSettings({
  providerKind: 'agent',
  modelProvider: 'anthropic',
  agentProviderId: 'codex'
}), {
  providerKind: 'agent',
  modelProvider: 'anthropic',
  agentProviderId: '',
  requiresProviderReselection: true,
  retiredAgentProviderId: 'codex'
}, 'an active saved Codex selection requires an explicit replacement');
assert.deepEqual(providers.normalizeSettings({
  providerKind: 'api',
  modelProvider: 'openai',
  agentProviderId: 'opencode'
}), activeSettings({
  providerKind: 'api',
  modelProvider: 'openai',
  agentProviderId: ''
}), 'a stale inactive OpenCode selection does not block the active API');
assert.deepEqual(providers.normalizeSettings({
  providerKind: 'agent',
  modelProvider: 'openai',
  agentProviderId: 'opencode'
}), {
  providerKind: 'agent',
  modelProvider: 'openai',
  agentProviderId: '',
  requiresProviderReselection: true,
  retiredAgentProviderId: 'opencode'
}, 'an active saved OpenCode selection requires an explicit replacement');
assert.deepEqual(providers.normalizeSettings({
  providerKind: 'agent',
  modelProvider: 'gemini',
  agentProviderId: 'cursor'
}), activeSettings({
  providerKind: 'api',
  modelProvider: 'gemini',
  agentProviderId: ''
}), 'an invalid active agent fails closed without changing the API selection');

const state = providers.normalizeSettings({
  providerKind: 'api',
  modelProvider: 'openrouter',
  agentProviderId: 'claude-code'
});
state.providerKind = 'agent';
state.agentProviderId = 'grok-build';
assert.deepEqual(providers.normalizeSettings(state), activeSettings({
  providerKind: 'agent',
  modelProvider: 'openrouter',
  agentProviderId: 'grok-build'
}));
state.providerKind = 'api';
assert.deepEqual(providers.normalizeSettings(state), activeSettings({
  providerKind: 'api',
  modelProvider: 'openrouter',
  agentProviderId: 'grok-build'
}), 'switching back restores the API selection without deleting the active agent selection');

assert.match(
  optionsSource,
  /providerKind:\s*normalizedProviderSettings\.providerKind,[\s\S]*?agentProviderId:\s*normalizedProviderSettings\.agentProviderId,[\s\S]*?modelProvider:\s*normalizedProviderSettings\.modelProvider/
);
assert.doesNotMatch(
  optionsSource,
  /modelProvider\s*=\s*providerPanelState\.agentProviderId/
);
for (const agentProviderId of [...agentIds, ...retiredAgentIds]) {
  assert.doesNotMatch(
    universalProviderSource,
    new RegExp(`['"]${agentProviderId}['"]`),
    `${agentProviderId} never enters the API-only universal provider`
  );
}

console.log('providers-panel-logic.test.js: PASS');
