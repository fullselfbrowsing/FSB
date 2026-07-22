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
  var delegationProviders = global.FsbDelegationProviders;
  if (!delegationProviders
      && typeof module !== 'undefined'
      && module.exports
      && typeof require === 'function') {
    delegationProviders = require('./delegation-providers.js');
  }
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
    return !!delegationProviders
      && typeof delegationProviders.isShippedId === 'function'
      && delegationProviders.isShippedId(providerId);
  }

  function providerLabel(providerId) {
    var metadata = delegationProviders
      && typeof delegationProviders.get === 'function'
      ? delegationProviders.get(providerId)
      : null;
    if (metadata) return metadata.label;
    return providerId || 'Selected provider';
  }

  function canonicalCompatibility(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var expected = ['status', 'reason', 'checkedAt'];
    var record = {};
    try {
      var keys = Reflect.ownKeys(value);
      if (keys.length !== expected.length) return null;
      for (var index = 0; index < expected.length; index += 1) {
        var key = expected[index];
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor
            || !descriptor.enumerable
            || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
        record[key] = descriptor.value;
      }
      for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        if (typeof keys[keyIndex] !== 'string' || expected.indexOf(keys[keyIndex]) === -1) {
          return null;
        }
      }
    } catch (_error) {
      return null;
    }
    return record.status === 'supported'
      && record.reason === 'within_tested_range'
      && Number.isSafeInteger(record.checkedAt)
      && record.checkedAt >= 0
      ? record
      : null;
  }

  function acceptedAgentIdentity(value, providerId) {
    if (!delegationProviders
        || typeof delegationProviders.validateAcceptedAgentIdentity !== 'function') return null;
    var identity = delegationProviders.validateAcceptedAgentIdentity(value);
    return identity && identity.providerId === providerId ? identity : null;
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
    var delegationConnection = getOwnValue(bridgeState, 'delegationConnection');
    if (getOwnValue(delegationConnection, 'state') !== 'connected') {
      return failure('agent_offline', agentProviderId);
    }
    if (getOwnValue(bridgeState, 'pairingStatus') !== 'paired') {
      return failure('agent_unpaired', agentProviderId);
    }
    if (!canonicalCompatibility(getOwnValue(input, 'compatibility'))) {
      return failure('unsupported_provider', agentProviderId);
    }

    var acceptedIdentity = acceptedAgentIdentity(
      getOwnValue(input, 'acceptedIdentity'),
      agentProviderId
    );
    if (!acceptedIdentity) return failure('provider_status_refresh', agentProviderId);

    return {
      ok: true,
      kind: 'agent',
      providerId: agentProviderId,
      providerLabel: providerLabel(agentProviderId),
      acceptedIdentity: acceptedIdentity
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
