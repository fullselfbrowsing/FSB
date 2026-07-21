(function(global) {
  'use strict';

  var METADATA_KEYS = ['id', 'label', 'billingKind'];

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach(function(key) { deepFreeze(value[key]); });
    return value;
  }

  var definitions = deepFreeze([
    { id: 'claude-code', label: 'Claude Code', billingKind: 'subscription' },
    { id: 'opencode', label: 'OpenCode', billingKind: 'unknown' }
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

  function exactOwnDataRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    try {
      if (Object.getPrototypeOf(value) !== Object.prototype) return null;
      var ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== METADATA_KEYS.length) return null;
      var record = {};
      for (var index = 0; index < METADATA_KEYS.length; index += 1) {
        var key = METADATA_KEYS[index];
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor
            || !descriptor.enumerable
            || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
        record[key] = descriptor.value;
      }
      for (var keyIndex = 0; keyIndex < ownKeys.length; keyIndex += 1) {
        if (typeof ownKeys[keyIndex] !== 'string'
            || METADATA_KEYS.indexOf(ownKeys[keyIndex]) === -1) return null;
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
    var record = exactOwnDataRecord(value);
    if (!record) return null;
    var canonical = get(record.id);
    if (!canonical
        || record.label !== canonical.label
        || record.billingKind !== canonical.billingKind) return null;
    return canonical;
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
    get: get,
    validate: validate,
    ids: ids,
    list: list,
    isShippedId: isShippedId
  });

  global.FsbDelegationProviders = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
