(function(global) {
  'use strict';

  var METADATA_KEYS = ['id', 'label', 'billingKind'];
  var ACCEPTED_IDENTITY_KEYS = [
    'providerId', 'label', 'profileVersion', 'authState', 'billingKind'
  ];
  var AGENT_AUTH_STATES = Object.freeze([
    'chatgpt', 'api_key', 'unauthenticated', 'unknown'
  ]);
  var AGENT_BILLING_KINDS = Object.freeze([
    'subscription', 'api', 'unknown'
  ]);
  var MAX_PROFILE_VERSION_CHARS = 128;

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach(function(key) { deepFreeze(value[key]); });
    return value;
  }

  var definitions = deepFreeze([
    {
      id: 'claude-code',
      label: 'Claude Code',
      billingKind: 'subscription',
      profileVersion: '2.1.177',
      authToBilling: { unknown: 'subscription' }
    },
    {
      id: 'opencode',
      label: 'OpenCode',
      billingKind: 'unknown',
      profileVersion: '1.14.25',
      authToBilling: { unknown: 'unknown' }
    },
    {
      id: 'codex',
      label: 'Codex',
      billingKind: 'unknown',
      profileVersion: '0.142.5',
      authToBilling: { chatgpt: 'subscription', api_key: 'api' }
    }
  ]);
  var byId = Object.create(null);
  definitions.forEach(function(metadata) { byId[metadata.id] = metadata; });
  Object.freeze(byId);

  function copyMetadata(metadata) {
    if (!metadata) return null;
    return deepFreeze({
      id: metadata.id,
      label: metadata.label,
      billingKind: metadata.billingKind
    });
  }

  function exactOwnDataRecord(value, expectedKeys, allowNullPrototype) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    try {
      var prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && !(allowNullPrototype && prototype === null)) return null;
      var ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== expectedKeys.length) return null;
      var record = {};
      for (var index = 0; index < expectedKeys.length; index += 1) {
        var key = expectedKeys[index];
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor
            || !descriptor.enumerable
            || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
        record[key] = descriptor.value;
      }
      for (var keyIndex = 0; keyIndex < ownKeys.length; keyIndex += 1) {
        if (typeof ownKeys[keyIndex] !== 'string'
            || expectedKeys.indexOf(ownKeys[keyIndex]) === -1) return null;
      }
      return record;
    } catch (_error) {
      return null;
    }
  }

  function get(providerId) {
    if (typeof providerId !== 'string'
        || !Object.prototype.hasOwnProperty.call(byId, providerId)) return null;
    return copyMetadata(byId[providerId]);
  }

  function validate(value) {
    var record = exactOwnDataRecord(value, METADATA_KEYS, false);
    if (!record) return null;
    var canonical = get(record.id);
    if (!canonical
        || record.label !== canonical.label
        || record.billingKind !== canonical.billingKind) return null;
    return canonical;
  }

  function resolveAgentBillingKind(providerId, authState) {
    if (typeof providerId !== 'string'
        || typeof authState !== 'string'
        || !Object.prototype.hasOwnProperty.call(byId, providerId)) return null;
    var mapping = byId[providerId].authToBilling;
    if (!mapping || !Object.prototype.hasOwnProperty.call(mapping, authState)) return null;
    var billingKind = mapping[authState];
    return AGENT_BILLING_KINDS.indexOf(billingKind) === -1 ? null : billingKind;
  }

  function validateAcceptedAgentIdentity(value) {
    var record = exactOwnDataRecord(value, ACCEPTED_IDENTITY_KEYS, true);
    if (!record
        || typeof record.profileVersion !== 'string'
        || record.profileVersion.length === 0
        || Array.from(record.profileVersion).length > MAX_PROFILE_VERSION_CHARS
        || AGENT_AUTH_STATES.indexOf(record.authState) === -1
        || AGENT_BILLING_KINDS.indexOf(record.billingKind) === -1) return null;
    var metadata = Object.prototype.hasOwnProperty.call(byId, record.providerId)
      ? byId[record.providerId]
      : null;
    var billingKind = resolveAgentBillingKind(record.providerId, record.authState);
    if (!metadata
        || record.label !== metadata.label
        || record.billingKind !== billingKind) return null;
    return deepFreeze({
      providerId: metadata.id,
      label: metadata.label,
      profileVersion: record.profileVersion,
      authState: record.authState,
      billingKind: billingKind
    });
  }

  function createAcceptedAgentIdentity(providerId, authState) {
    if (typeof providerId !== 'string'
        || typeof authState !== 'string'
        || !Object.prototype.hasOwnProperty.call(byId, providerId)) return null;
    var metadata = byId[providerId];
    var billingKind = resolveAgentBillingKind(providerId, authState);
    if (!billingKind) return null;
    return validateAcceptedAgentIdentity({
      providerId: metadata.id,
      label: metadata.label,
      profileVersion: metadata.profileVersion,
      authState: authState,
      billingKind: billingKind
    });
  }

  function ids() {
    return Object.freeze(definitions.map(function(metadata) { return metadata.id; }));
  }

  function list() {
    return deepFreeze(definitions.map(copyMetadata));
  }

  function isShippedId(providerId) {
    return get(providerId) !== null;
  }

  var api = Object.freeze({
    AGENT_AUTH_STATES: AGENT_AUTH_STATES,
    AGENT_BILLING_KINDS: AGENT_BILLING_KINDS,
    get: get,
    validate: validate,
    ids: ids,
    list: list,
    isShippedId: isShippedId,
    resolveAgentBillingKind: resolveAgentBillingKind,
    validateAcceptedAgentIdentity: validateAcceptedAgentIdentity,
    createAcceptedAgentIdentity: createAcceptedAgentIdentity
  });

  global.FsbDelegationProviders = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
