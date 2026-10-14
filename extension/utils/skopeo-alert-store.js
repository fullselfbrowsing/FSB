(function(global) {
  'use strict';

  var VERSION = 'skopeo-alert-store/1';
  var STORAGE_KEY = 'fsbSkopeoAlertsV1';
  var PAYLOAD_VERSION = 1;
  var MAX_PARTITIONS = 1024;
  var MAX_BINDINGS = 4096;
  var MAX_ALERTS = 8192;
  var MAX_BYTES = 8 * 1024 * 1024;
  var TRANSITIONS = Object.freeze({
    scheduled: Object.freeze({ attempted: true, missed: true, superseded: true, failed: true }),
    attempted: Object.freeze({ delivered: true, failed: true, superseded: true }),
    delivered: Object.freeze({ superseded: true }),
    failed: Object.freeze({ scheduled: true, superseded: true, missed: true }),
    missed: Object.freeze({}),
    superseded: Object.freeze({})
  });

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    try {
      var prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    } catch (_error) { return false; }
  }

  function entries(value) {
    if (!plain(value)) return null;
    var keys;
    try { keys = Reflect.ownKeys(value); } catch (_error) { return null; }
    var output = [];
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      var descriptor;
      try { descriptor = Object.getOwnPropertyDescriptor(value, key); }
      catch (_error) { return null; }
      if (typeof key !== 'string' || !descriptor || !own(descriptor, 'value') ||
          descriptor.enumerable !== true) return null;
      output.push([key, descriptor.value]);
    }
    return output;
  }

  function exact(value, keys) {
    var values = entries(value);
    if (!values || values.length !== keys.length) return null;
    var output = Object.create(null);
    for (var index = 0; index < values.length; index += 1) {
      if (keys.indexOf(values[index][0]) < 0) return null;
      output[values[index][0]] = values[index][1];
    }
    return output;
  }

  function record() {
    return Object.create(null);
  }

  function frozenRecord(values) {
    var output = record();
    Object.keys(values).forEach(function(key) { output[key] = values[key]; });
    return Object.freeze(output);
  }

  function ok(extra) {
    var output = { ok: true };
    if (extra) Object.keys(extra).forEach(function(key) { output[key] = extra[key]; });
    return Object.freeze(output);
  }

  function failure() {
    return Object.freeze({ ok: false });
  }

  function create(dependencies) {
    var fields = exact(dependencies, ['storageArea', 'alertSchema', 'now', 'byteLength']);
    if (!fields || !fields.storageArea ||
        typeof fields.storageArea.get !== 'function' ||
        typeof fields.storageArea.set !== 'function' ||
        typeof fields.alertSchema.parsePartition !== 'function' ||
        typeof fields.alertSchema.parseOwnerBinding !== 'function' ||
        typeof fields.alertSchema.parseCandidate !== 'function' ||
        typeof fields.alertSchema.parseEntry !== 'function' ||
        typeof fields.now !== 'function' || typeof fields.byteLength !== 'function') return null;

    var storageArea = fields.storageArea;
    var schema = fields.alertSchema;
    var mutationChain = Promise.resolve();
    var issuedParticipant = false;

    function emptyEnvelope() {
      var output = record();
      output.version = PAYLOAD_VERSION;
      output.partitions = record();
      return output;
    }

    function emptyPartition(partition) {
      var output = record();
      output.partition = partition;
      output.bindings = record();
      output.alerts = record();
      return output;
    }

    function parseBindingMap(value, partition) {
      var values = entries(value);
      if (!values || values.length > MAX_BINDINGS) return null;
      var output = record();
      for (var index = 0; index < values.length; index += 1) {
        var binding = schema.parseOwnerBinding(values[index][1]);
        if (!binding || values[index][0] !== binding.ownerStableRecordId ||
            binding.partition.partitionKey !== partition.partitionKey ||
            binding.partition.accountPermissionId !== partition.accountPermissionId ||
            binding.partition.corpusRootFileId !== partition.corpusRootFileId) return null;
        output[values[index][0]] = binding;
      }
      return output;
    }

    function parseAlertMap(value, partition) {
      var values = entries(value);
      if (!values || values.length > MAX_ALERTS) return null;
      var output = record();
      for (var index = 0; index < values.length; index += 1) {
        var entry = schema.parseEntry(values[index][1]);
        if (!entry || values[index][0] !== entry.candidate.alertKey ||
            entry.candidate.partition.partitionKey !== partition.partitionKey ||
            entry.candidate.partition.accountPermissionId !== partition.accountPermissionId ||
            entry.candidate.partition.corpusRootFileId !== partition.corpusRootFileId) return null;
        output[values[index][0]] = entry;
      }
      return output;
    }

    function parsePartitionRecord(value, key) {
      var data = exact(value, ['partition', 'bindings', 'alerts']);
      var partition = data && schema.parsePartition(data.partition);
      var bindings = partition && parseBindingMap(data.bindings, partition);
      var alerts = partition && parseAlertMap(data.alerts, partition);
      if (!data || !partition || key !== partition.partitionKey || !bindings || !alerts) return null;
      var output = emptyPartition(partition);
      output.bindings = bindings;
      output.alerts = alerts;
      return output;
    }

    function parseEnvelope(value) {
      var data = exact(value, ['version', 'partitions']);
      var partitionEntries = data && entries(data.partitions);
      if (!data || data.version !== PAYLOAD_VERSION || !partitionEntries ||
          partitionEntries.length > MAX_PARTITIONS) return null;
      var output = emptyEnvelope();
      for (var index = 0; index < partitionEntries.length; index += 1) {
        var partition = parsePartitionRecord(partitionEntries[index][1], partitionEntries[index][0]);
        if (!partition) return null;
        output.partitions[partitionEntries[index][0]] = partition;
      }
      var serialized;
      try { serialized = JSON.stringify(output); } catch (_error) { return null; }
      var size;
      try { size = fields.byteLength(serialized); } catch (_error) { return null; }
      return Number.isSafeInteger(size) && size >= 0 && size <= MAX_BYTES ? output : null;
    }

    async function load(strict) {
      var values;
      try { values = await storageArea.get([STORAGE_KEY]); } catch (_error) { return null; }
      if (!plain(values)) return null;
      if (!own(values, STORAGE_KEY)) return strict ? emptyEnvelope() : emptyEnvelope();
      return parseEnvelope(values[STORAGE_KEY]);
    }

    async function save(envelope) {
      var parsed = parseEnvelope(envelope);
      if (!parsed) return false;
      var update = record();
      update[STORAGE_KEY] = parsed;
      try { await storageArea.set(update); } catch (_error) { return false; }
      return true;
    }

    function queue(work) {
      var next = mutationChain.then(work, work);
      mutationChain = next.then(function() {}, function() {});
      return next;
    }

    function findPartition(envelope, partition) {
      return own(envelope.partitions, partition.partitionKey)
        ? envelope.partitions[partition.partitionKey]
        : null;
    }

    function ensurePartition(envelope, partition) {
      var current = findPartition(envelope, partition);
      if (current) {
        if (current.partition.accountPermissionId !== partition.accountPermissionId ||
            current.partition.corpusRootFileId !== partition.corpusRootFileId) return null;
        return current;
      }
      current = emptyPartition(partition);
      envelope.partitions[partition.partitionKey] = current;
      return current;
    }

    async function recover() {
      var envelope = await load(true);
      return envelope ? ok() : failure();
    }

    async function readOwnerBinding(partitionValue, ownerStableRecordId) {
      var partition = schema.parsePartition(partitionValue);
      if (!partition || typeof ownerStableRecordId !== 'string') return null;
      var envelope = await load(false);
      var current = envelope && findPartition(envelope, partition);
      return current && own(current.bindings, ownerStableRecordId)
        ? schema.parseOwnerBinding(current.bindings[ownerStableRecordId])
        : null;
    }

    function bindOwner(value) {
      var binding = schema.parseOwnerBinding(value);
      if (!binding) return Promise.resolve(failure());
      return queue(async function() {
        var envelope = await load(true);
        if (!envelope) return failure();
        var partition = ensurePartition(envelope, binding.partition);
        if (!partition) return failure();
        partition.bindings[binding.ownerStableRecordId] = binding;
        return await save(envelope) ? ok() : failure();
      });
    }

    function unbindOwner(partitionValue, ownerStableRecordId) {
      var partition = schema.parsePartition(partitionValue);
      if (!partition || typeof ownerStableRecordId !== 'string') return Promise.resolve(failure());
      return queue(async function() {
        var envelope = await load(true);
        if (!envelope) return failure();
        var current = findPartition(envelope, partition);
        if (!current || !own(current.bindings, ownerStableRecordId)) return ok();
        delete current.bindings[ownerStableRecordId];
        return await save(envelope) ? ok() : failure();
      });
    }

    function schedule(candidateValue, scheduledFor) {
      var candidate = schema.parseCandidate(candidateValue);
      if (!candidate || !Number.isSafeInteger(scheduledFor) || scheduledFor < 0) {
        return Promise.resolve(failure());
      }
      return queue(async function() {
        var envelope = await load(true);
        if (!envelope) return failure();
        var partition = ensurePartition(envelope, candidate.partition);
        if (!partition) return failure();
        var existing = partition.alerts[candidate.alertKey];
        if (existing) return ok({ entry: schema.parseEntry(existing), unchanged: true });
        var now;
        try { now = fields.now(); } catch (_error) { return failure(); }
        var entry = schema.parseEntry({
          version: schema.ENTRY_VERSION,
          candidate: candidate,
          state: 'scheduled',
          reason: null,
          scheduledFor: scheduledFor,
          scheduledAt: now,
          attemptedAt: null,
          deliveredAt: null,
          updatedAt: now,
          attemptCount: 0
        });
        if (!entry) return failure();
        partition.alerts[candidate.alertKey] = entry;
        return await save(envelope) ? ok({ entry: entry, unchanged: false }) : failure();
      });
    }

    function transition(requestValue) {
      var request = exact(requestValue, ['partition', 'alertKey', 'from', 'to', 'reason']);
      var partition = request && schema.parsePartition(request.partition);
      if (!request || !partition || typeof request.alertKey !== 'string' ||
          !TRANSITIONS[request.from] || TRANSITIONS[request.from][request.to] !== true ||
          !(request.reason === null || schema.REASONS[request.reason])) {
        return Promise.resolve(failure());
      }
      if (request.to === 'failed' && request.reason === null) return Promise.resolve(failure());
      if (request.to === 'missed' && request.reason !== 'alert-date-passed') return Promise.resolve(failure());
      if (request.to === 'superseded' && request.reason !== 'evidence-superseded') {
        return Promise.resolve(failure());
      }
      return queue(async function() {
        var envelope = await load(true);
        if (!envelope) return failure();
        var current = findPartition(envelope, partition);
        var prior = current && current.alerts[request.alertKey];
        if (!prior || prior.state !== request.from) return failure();
        var now;
        try { now = fields.now(); } catch (_error) { return failure(); }
        var attemptedAt = prior.attemptedAt;
        var deliveredAt = prior.deliveredAt;
        var attemptCount = prior.attemptCount;
        if (request.to === 'attempted') {
          attemptedAt = now;
          deliveredAt = null;
          attemptCount += 1;
        } else if (request.to === 'delivered') {
          deliveredAt = now;
        } else if (request.to === 'scheduled') {
          attemptedAt = null;
          deliveredAt = null;
          attemptCount = 0;
        }
        var next = schema.parseEntry({
          version: schema.ENTRY_VERSION,
          candidate: prior.candidate,
          state: request.to,
          reason: request.reason,
          scheduledFor: prior.scheduledFor,
          scheduledAt: prior.scheduledAt,
          attemptedAt: attemptedAt,
          deliveredAt: deliveredAt,
          updatedAt: now,
          attemptCount: attemptCount
        });
        if (!next) return failure();
        current.alerts[request.alertKey] = next;
        return await save(envelope) ? ok({ entry: next }) : failure();
      });
    }

    async function get(partitionValue, alertKey) {
      var partition = schema.parsePartition(partitionValue);
      if (!partition || typeof alertKey !== 'string') return null;
      var envelope = await load(false);
      var current = envelope && findPartition(envelope, partition);
      return current && own(current.alerts, alertKey)
        ? schema.parseEntry(current.alerts[alertKey])
        : null;
    }

    async function list(partitionValue) {
      var partition = schema.parsePartition(partitionValue);
      if (!partition) return Object.freeze([]);
      var envelope = await load(false);
      var current = envelope && findPartition(envelope, partition);
      if (!current) return Object.freeze([]);
      return Object.freeze(Object.keys(current.alerts).sort().map(function(key) {
        return schema.parseEntry(current.alerts[key]);
      }).filter(Boolean));
    }

    async function listAll() {
      var envelope = await load(false);
      if (!envelope) return Object.freeze([]);
      var output = [];
      Object.keys(envelope.partitions).sort().forEach(function(partitionKey) {
        var current = envelope.partitions[partitionKey];
        Object.keys(current.alerts).sort().forEach(function(alertKey) {
          var parsed = schema.parseEntry(current.alerts[alertKey]);
          if (parsed) output.push(parsed);
        });
      });
      return Object.freeze(output);
    }

    async function getByAlertKey(alertKey) {
      if (typeof alertKey !== 'string') return null;
      var envelope = await load(false);
      if (!envelope) return null;
      var matches = [];
      Object.keys(envelope.partitions).forEach(function(partitionKey) {
        var current = envelope.partitions[partitionKey];
        if (own(current.alerts, alertKey)) matches.push(current.alerts[alertKey]);
      });
      return matches.length === 1 ? schema.parseEntry(matches[0]) : null;
    }

    function parseParticipantRequest(value, partitionOnly) {
      var request = exact(value, ['partitionKey', 'sourceFileId']);
      if (!request || typeof request.partitionKey !== 'string' ||
          request.partitionKey.slice(0, 6) !== 'scpk1:' ||
          !(request.sourceFileId === null ||
            (typeof request.sourceFileId === 'string' && request.sourceFileId.length > 0 &&
              request.sourceFileId.length <= 256)) ||
          (partitionOnly && request.sourceFileId !== null) ||
          (!partitionOnly && request.sourceFileId === null)) return null;
      return request;
    }

    function partitionHasSource(current, sourceFileId) {
      return Object.keys(current.bindings).some(function(key) {
        return current.bindings[key].ownerSourceFileId === sourceFileId;
      }) || Object.keys(current.alerts).some(function(key) {
        return current.alerts[key].candidate.sourceFileIds.indexOf(sourceFileId) >= 0;
      });
    }

    function participantPurge(requestValue, capability, verifier, partitionOnly) {
      var request = parseParticipantRequest(requestValue, partitionOnly);
      var mode = partitionOnly ? 'purge-partition' : 'purge-source';
      if (!request || !verifier(capability, mode, requestValue)) return Promise.resolve(failure());
      return queue(async function() {
        var envelope = await load(true);
        if (!envelope || !verifier(capability, mode, requestValue)) return failure();
        var current = envelope.partitions[request.partitionKey];
        if (!current) return ok();
        if (partitionOnly) {
          delete envelope.partitions[request.partitionKey];
        } else {
          Object.keys(current.bindings).forEach(function(key) {
            if (current.bindings[key].ownerSourceFileId === request.sourceFileId) {
              delete current.bindings[key];
            }
          });
          Object.keys(current.alerts).forEach(function(key) {
            if (current.alerts[key].candidate.sourceFileIds.indexOf(request.sourceFileId) >= 0) {
              delete current.alerts[key];
            }
          });
        }
        if (!verifier(capability, mode, requestValue)) return failure();
        return await save(envelope) ? ok() : failure();
      });
    }

    async function participantInfluence(requestValue, capability, verifier) {
      var request = parseParticipantRequest(requestValue, false) ||
        parseParticipantRequest(requestValue, true);
      var mode = request && request.sourceFileId === null ? 'verify-partition' : 'verify-source';
      if (!request || !verifier(capability, mode, requestValue)) return Object.freeze({ owned: true });
      var envelope = await load(false);
      if (!envelope || !verifier(capability, mode, requestValue)) return Object.freeze({ owned: true });
      var current = envelope.partitions[request.partitionKey];
      var owned = request.sourceFileId === null
        ? !!current
        : !!current && partitionHasSource(current, request.sourceFileId);
      return Object.freeze({ owned: owned });
    }

    function getPurgeParticipant(name) {
      if (name !== 'alerts' || issuedParticipant) return null;
      issuedParticipant = true;
      var used = false;
      return function bindParticipant(verifier) {
        if (used || typeof verifier !== 'function') return null;
        used = true;
        return Object.freeze({
          purgeSource: function(request, capability) {
            return participantPurge(request, capability, verifier, false);
          },
          purgePartition: function(request, capability) {
            return participantPurge(request, capability, verifier, true);
          },
          hasOwnedInfluence: function(request, capability) {
            return participantInfluence(request, capability, verifier);
          }
        });
      };
    }

    return Object.freeze({
      VERSION: VERSION,
      STORAGE_KEY: STORAGE_KEY,
      recover: recover,
      bindOwner: bindOwner,
      unbindOwner: unbindOwner,
      readOwnerBinding: readOwnerBinding,
      schedule: schedule,
      transition: transition,
      get: get,
      list: list,
      listAll: listAll,
      getByAlertKey: getByAlertKey,
      getPurgeParticipant: getPurgeParticipant
    });
  }

  var api = Object.freeze({ VERSION: VERSION, STORAGE_KEY: STORAGE_KEY, create: create });
  global.FsbSkopeoAlertStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
