(function(global) {
  'use strict';

  var API_PROVIDER_IDS = Object.freeze([
    'xai',
    'gemini',
    'openai',
    'anthropic',
    'openrouter',
    'lmstudio',
    'custom'
  ]);
  var API_PROVIDER_SET = createSet(API_PROVIDER_IDS);
  var SUPPORTED_AGENT_PROVIDERS = Object.freeze({
    'claude-code': 'Claude Code'
  });
  var MAX_PROVIDER_ID_LENGTH = 128;

  function createSet(values) {
    var result = Object.create(null);
    values.forEach(function(value) {
      result[value] = true;
    });
    return Object.freeze(result);
  }

  function getOwnValue(value, key) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return undefined;
    }
    try {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ? descriptor.value
        : undefined;
    } catch (_error) {
      return undefined;
    }
  }

  function boundedString(value) {
    return typeof value === 'string' && value.length <= MAX_PROVIDER_ID_LENGTH
      ? value
      : '';
  }

  function isApiProvider(providerId) {
    return Object.prototype.hasOwnProperty.call(API_PROVIDER_SET, providerId);
  }

  function isSupportedAgentProvider(providerId) {
    return Object.prototype.hasOwnProperty.call(SUPPORTED_AGENT_PROVIDERS, providerId);
  }

  function providerLabel(providerId) {
    if (isSupportedAgentProvider(providerId)) return SUPPORTED_AGENT_PROVIDERS[providerId];
    return providerId || 'Selected provider';
  }

  function failure(code, providerId) {
    return {
      ok: false,
      code: code,
      providerId: providerId,
      providerLabel: providerLabel(providerId)
    };
  }

  function check(input) {
    var providerKind = boundedString(getOwnValue(input, 'providerKind'));
    var modelProvider = boundedString(getOwnValue(input, 'modelProvider'));
    var agentProviderId = boundedString(getOwnValue(input, 'agentProviderId'));

    if (providerKind === 'api') {
      if (!isApiProvider(modelProvider)) return failure('unsupported_provider', modelProvider);
      return {
        ok: true,
        kind: 'api',
        providerId: modelProvider,
        agentProviderId: ''
      };
    }

    if (providerKind !== 'agent' || !isSupportedAgentProvider(agentProviderId)) {
      return failure('unsupported_provider', agentProviderId || modelProvider);
    }

    var bridgeState = getOwnValue(input, 'bridgeState');
    var connected = getOwnValue(bridgeState, 'connected') === true
      && getOwnValue(bridgeState, 'status') === 'connected';
    if (!connected) return failure('agent_offline', agentProviderId);
    if (getOwnValue(bridgeState, 'pairingStatus') !== 'paired') {
      return failure('agent_unpaired', agentProviderId);
    }

    return {
      ok: true,
      kind: 'agent',
      providerId: agentProviderId,
      providerLabel: providerLabel(agentProviderId)
    };
  }

  var api = Object.freeze({
    check: check
  });

  global.FsbDelegationPreflight = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
