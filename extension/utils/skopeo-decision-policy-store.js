(function(global) {
  'use strict';

  var STORAGE_KEY = 'fsbSkopeoDecisionPolicy';
  var PAYLOAD_VERSION = 1;
  var MAX_KEY_LENGTH = 256;
  var CLASSIFICATIONS = Object.freeze({ routine: true, complex: true });
  var mutationChain = Promise.resolve();

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function isPlainRecord(value) {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      var prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    } catch (_error) {
      return false;
    }
  }

  function ownDataEntries(value) {
    if (!isPlainRecord(value)) return null;
    try {
      var keys = Reflect.ownKeys(value);
      if (keys.some(function(key) { return typeof key !== 'string'; })) return null;
      var output = [];
      for (var index = 0; index < keys.length; index += 1) {
        var key = keys[index];
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
        output.push([key, descriptor.value]);
      }
      return output;
    } catch (_error) {
      return null;
    }
  }

  function exactFields(value, expectedKeys) {
    var entries = ownDataEntries(value);
    if (!entries || entries.length !== expectedKeys.length) return null;
    var expected = Object.create(null);
    expectedKeys.forEach(function(key) { expected[key] = true; });
    var output = Object.create(null);
    for (var index = 0; index < entries.length; index += 1) {
      if (!own(expected, entries[index][0])) return null;
      output[entries[index][0]] = entries[index][1];
    }
    return output;
  }

  function scalarLength(value) {
    if (typeof value !== 'string') return -1;
    var count = 0;
    for (var index = 0; index < value.length; index += 1) {
      var unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        if (index + 1 >= value.length) return -1;
        var next = value.charCodeAt(index + 1);
        if (next < 0xdc00 || next > 0xdfff) return -1;
        index += 1;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        return -1;
      }
      count += 1;
    }
    return count;
  }

  function validStableKey(value) {
    var length = scalarLength(value);
    return length > 0 && length <= MAX_KEY_LENGTH && value === value.trim() &&
      !/[\u0000-\u001f\u007f\u0080-\u009f\u202a-\u202e\u2066-\u2069<>]/.test(value) &&
      !/(?:https?|file|chrome):\/\//i.test(value);
  }

  function parsePartitionClaim(value) {
    var fields = exactFields(value, ['accountKey', 'corpusKey']);
    if (!fields || !validStableKey(fields.accountKey) || !validStableKey(fields.corpusKey)) return null;
    return fields;
  }

  function encodePartitionKey(value) {
    return 'sdp1:' + value.accountKey.length + ':' + value.accountKey +
      value.corpusKey.length + ':' + value.corpusKey;
  }

  function emptyAgreementMap() {
    return Object.create(null);
  }

  function emptyPartition() {
    var output = Object.create(null);
    output.document10FileKey = null;
    output.agreements = emptyAgreementMap();
    return output;
  }

  function emptyEnvelope() {
    var output = Object.create(null);
    output.v = PAYLOAD_VERSION;
    output.partitions = Object.create(null);
    return output;
  }

  function parseAgreementMap(value) {
    var entries = ownDataEntries(value);
    if (!entries || entries.length > 4096) return null;
    var output = emptyAgreementMap();
    for (var index = 0; index < entries.length; index += 1) {
      var key = entries[index][0];
      var classification = entries[index][1];
      if (!validStableKey(key) || !CLASSIFICATIONS[classification]) return null;
      output[key] = classification;
    }
    return output;
  }

  function parsePartitionRecord(value) {
    var fields = exactFields(value, ['document10FileKey', 'agreements']);
    if (!fields || !(fields.document10FileKey === null || validStableKey(fields.document10FileKey))) {
      return null;
    }
    var agreements = parseAgreementMap(fields.agreements);
    if (!agreements) return null;
    var output = emptyPartition();
    output.document10FileKey = fields.document10FileKey;
    output.agreements = agreements;
    return output;
  }

  function parseEnvelope(value) {
    var fields = exactFields(value, ['v', 'partitions']);
    if (!fields || fields.v !== PAYLOAD_VERSION) return null;
    var entries = ownDataEntries(fields.partitions);
    if (!entries || entries.length > 1024) return null;
    var output = emptyEnvelope();
    for (var index = 0; index < entries.length; index += 1) {
      var partitionKey = entries[index][0];
      var partition = parsePartitionRecord(entries[index][1]);
      if (!validStableKey(partitionKey) || !partition) return null;
      output.partitions[partitionKey] = partition;
    }
    return output;
  }

  function cloneFrozenPartition(value) {
    var agreements = emptyAgreementMap();
    Object.keys(value.agreements).forEach(function(key) {
      agreements[key] = value.agreements[key];
    });
    Object.freeze(agreements);
    var output = emptyPartition();
    output.document10FileKey = value.document10FileKey;
    output.agreements = agreements;
    return Object.freeze(output);
  }

  function chromeStorage() {
    var chromeObject = global && global.chrome;
    var local = chromeObject && chromeObject.storage && chromeObject.storage.local;
    return local && typeof local.get === 'function' && typeof local.set === 'function'
      ? local
      : null;
  }

  async function readEnvelope() {
    var storage = chromeStorage();
    if (!storage) return emptyEnvelope();
    try {
      var values = await storage.get([STORAGE_KEY]);
      if (!isPlainRecord(values) || !own(values, STORAGE_KEY)) return emptyEnvelope();
      return parseEnvelope(values[STORAGE_KEY]) || emptyEnvelope();
    } catch (_error) {
      return emptyEnvelope();
    }
  }

  async function writeEnvelope(value) {
    var storage = chromeStorage();
    if (!storage) return false;
    try {
      var update = Object.create(null);
      update[STORAGE_KEY] = value;
      await storage.set(update);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function readEnvelopeForMutation() {
    var storage = chromeStorage();
    if (!storage) return { ok: false, envelope: null };
    try {
      var values = await storage.get([STORAGE_KEY]);
      if (!isPlainRecord(values)) return { ok: false, envelope: null };
      if (!own(values, STORAGE_KEY)) return { ok: true, envelope: emptyEnvelope() };
      var parsed = parseEnvelope(values[STORAGE_KEY]);
      return parsed
        ? { ok: true, envelope: parsed }
        : { ok: false, envelope: null };
    } catch (_error) {
      return { ok: false, envelope: null };
    }
  }

  function withMutation(work) {
    var next = mutationChain.then(work, work);
    mutationChain = next.then(function() {}, function() {});
    return next;
  }

  async function readPartition(claim) {
    var parsed = parsePartitionClaim(claim);
    if (!parsed) return cloneFrozenPartition(emptyPartition());
    var envelope = await readEnvelope();
    var key = encodePartitionKey(parsed);
    var partition = own(envelope.partitions, key) ? envelope.partitions[key] : emptyPartition();
    return cloneFrozenPartition(partition);
  }

  function mutatePartition(claim, change) {
    var parsed = parsePartitionClaim(claim);
    if (!parsed || typeof change !== 'function') return Promise.resolve(false);
    return withMutation(async function() {
      var loaded = await readEnvelopeForMutation();
      if (!loaded.ok) return false;
      var envelope = loaded.envelope;
      var key = encodePartitionKey(parsed);
      var current = own(envelope.partitions, key)
        ? parsePartitionRecord(envelope.partitions[key])
        : emptyPartition();
      if (!current) current = emptyPartition();
      if (change(current) !== true) return false;
      envelope.partitions[key] = current;
      return writeEnvelope(envelope);
    });
  }

  function configureDocument10(claim, stableFileKey) {
    if (!validStableKey(stableFileKey)) return Promise.resolve(false);
    return mutatePartition(claim, function(partition) {
      partition.document10FileKey = stableFileKey;
      return true;
    });
  }

  function clearDocument10(claim) {
    return mutatePartition(claim, function(partition) {
      partition.document10FileKey = null;
      return true;
    });
  }

  function classifyAgreement(claim, stableAgreementKey, classification) {
    if (!validStableKey(stableAgreementKey) || !CLASSIFICATIONS[classification]) {
      return Promise.resolve(false);
    }
    return mutatePartition(claim, function(partition) {
      partition.agreements[stableAgreementKey] = classification;
      return true;
    });
  }

  function _reset() {
    mutationChain = Promise.resolve();
  }

  var api = Object.freeze({
    STORAGE_KEY: STORAGE_KEY,
    PAYLOAD_VERSION: PAYLOAD_VERSION,
    readPartition: readPartition,
    configureDocument10: configureDocument10,
    clearDocument10: clearDocument10,
    classifyAgreement: classifyAgreement,
    _reset: _reset
  });

  global.FsbSkopeoDecisionPolicyStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
