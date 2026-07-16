(function(global) {
  'use strict';

  var FSB_AGENT_PROVIDERS_STORAGE_KEY = 'fsbAgentProviders';
  var FSB_AGENT_COMPATIBILITY_MAX_AGE_MS = 15 * 60 * 1000;
  var FSB_COMPATIBILITY_MAX_ADAPTERS = 16;
  var FSB_COMPATIBILITY_MAX_STRING_LENGTH = 64;
  var FSB_COMPATIBILITY_ADAPTER_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
  var FSB_COMPATIBILITY_SNAPSHOT_KEYS = ['schemaVersion', 'checkedAt', 'adapters'];
  var FSB_COMPATIBILITY_ROW_KEYS = ['adapterId', 'displayLabel', 'status', 'reason'];
  var FSB_COMPATIBILITY_AGENT_IDS = {
    'claude-code': true,
    opencode: true,
    codex: true
  };
  var FSB_SHIPPED_COMPATIBILITY_LABELS = {
    'claude-code': 'Claude Code'
  };
  var ALLOWED_SUBMAPS = {
    clicked: true,
    connected: true,
    installed: true
  };

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function setOwnEnumerable(target, key, value) {
    Object.defineProperty(target, key, {
      value: value,
      writable: true,
      enumerable: true,
      configurable: true
    });
  }

  function ownEnumerableDataValue(value, key) {
    if (!value || typeof value !== 'object') return undefined;
    var descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch (_error) {
      return undefined;
    }
    return descriptor && descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : undefined;
  }

  function ownDataRecord(value, expectedKeys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    try {
      if (Object.getPrototypeOf(value) !== Object.prototype) return null;
      var ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== expectedKeys.length) return null;
      var allowed = {};
      expectedKeys.forEach(function(key) { setOwnEnumerable(allowed, key, true); });
      var record = {};
      for (var index = 0; index < ownKeys.length; index += 1) {
        var key = ownKeys[index];
        if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(allowed, key)) return null;
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor
            || !descriptor.enumerable
            || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
        setOwnEnumerable(record, key, descriptor.value);
      }
      return record;
    } catch (_error) {
      return null;
    }
  }

  function denseDataArray(value, maximumLength) {
    if (!Array.isArray(value)) return null;
    try {
      if (Object.getPrototypeOf(value) !== Array.prototype
          || !Number.isSafeInteger(value.length)
          || value.length > maximumLength) return null;
      var ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== value.length + 1) return null;
      var items = [];
      for (var index = 0; index < value.length; index += 1) {
        var descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor
            || !descriptor.enumerable
            || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
        items.push(descriptor.value);
      }
      var lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (!lengthDescriptor
          || lengthDescriptor.enumerable
          || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')) return null;
      for (var keyIndex = 0; keyIndex < ownKeys.length; keyIndex += 1) {
        var ownKey = ownKeys[keyIndex];
        if (typeof ownKey !== 'string') return null;
        if (ownKey !== 'length'
            && (!/^(0|[1-9][0-9]*)$/.test(ownKey) || Number(ownKey) >= value.length)) return null;
      }
      return items;
    } catch (_error) {
      return null;
    }
  }

  function boundedCompatibilityString(value, pattern) {
    return typeof value === 'string'
      && value.length > 0
      && value.length <= FSB_COMPATIBILITY_MAX_STRING_LENGTH
      && !/[\u0000-\u001f\u007f]/.test(value)
      && (!pattern || pattern.test(value));
  }

  function validCompatibilityStatusReason(status, reason) {
    if (status === 'supported') return reason === 'within_tested_range';
    if (status === 'degraded') {
      return reason === 'newer_than_tested_range' || reason === 'evidence_stale';
    }
    if (status !== 'unsupported') return false;
    return reason === 'binary_not_found'
      || reason === 'version_missing'
      || reason === 'version_malformed'
      || reason === 'below_minimum'
      || reason === 'wrong_major'
      || reason === 'adapter_unshipped'
      || reason === 'matrix_invalid';
  }

  function parseCompatibilityRow(value) {
    var record = ownDataRecord(value, FSB_COMPATIBILITY_ROW_KEYS);
    if (!record
        || !boundedCompatibilityString(record.adapterId, FSB_COMPATIBILITY_ADAPTER_ID_PATTERN)
        || !boundedCompatibilityString(record.displayLabel)
        || !validCompatibilityStatusReason(record.status, record.reason)) return null;
    return {
      adapterId: record.adapterId,
      displayLabel: record.displayLabel,
      status: record.status,
      reason: record.reason
    };
  }

  function parseCompatibilitySnapshot(value) {
    var record = ownDataRecord(value, FSB_COMPATIBILITY_SNAPSHOT_KEYS);
    if (!record
        || record.schemaVersion !== 1
        || !Number.isSafeInteger(record.checkedAt)
        || record.checkedAt < 0) return null;
    var values = denseDataArray(record.adapters, FSB_COMPATIBILITY_MAX_ADAPTERS);
    if (!values) return null;
    var ids = {};
    var adapters = [];
    for (var index = 0; index < values.length; index += 1) {
      var row = parseCompatibilityRow(values[index]);
      if (!row || Object.prototype.hasOwnProperty.call(ids, row.adapterId)) return null;
      setOwnEnumerable(ids, row.adapterId, true);
      adapters.push(row);
    }
    return {
      schemaVersion: 1,
      checkedAt: record.checkedAt,
      adapters: adapters
    };
  }

  function cloneMap(value) {
    var clone = {};
    if (!isPlainObject(value)) return clone;
    Object.keys(value).forEach(function(key) {
      setOwnEnumerable(clone, key, value[key]);
    });
    return clone;
  }

  function connectedRecordTime(record) {
    return isPlainObject(record)
        && typeof record.lastSeenAt === 'number'
        && Number.isFinite(record.lastSeenAt)
      ? record.lastSeenAt
      : null;
  }

  function shouldReplaceConnectedRecord(current, candidate) {
    if (!isPlainObject(current)) return true;
    var currentTime = connectedRecordTime(current);
    var candidateTime = connectedRecordTime(candidate);
    if (candidateTime === null) return currentTime === null;
    return currentTime === null || candidateTime > currentTime;
  }

  function resolveConnectedKey(name, version, agentId, legacyKey) {
    var aliases = getAliasApi();
    var canonicalId = aliases.resolveMcpClientAlias(name)
      || aliases.resolveMcpClientAlias(legacyKey || '');
    if (canonicalId) return canonicalId;

    var normalizedName = aliases.normalizeMcpClientName(name || '');
    if (normalizedName) return 'raw:' + normalizedName;
    if (typeof legacyKey === 'string' && legacyKey.indexOf('raw:') === 0) {
      return legacyKey;
    }
    if (typeof legacyKey === 'string' && legacyKey.indexOf('unknown:') === 0) {
      return 'raw:' + legacyKey;
    }

    var fallback = normalizeIdentityPart(version)
      || normalizeIdentityPart(agentId)
      || aliases.normalizeMcpClientName(legacyKey || '')
      || 'unknown';
    return 'raw:unknown:' + fallback;
  }

  function normalizeConnected(value) {
    if (!isPlainObject(value)) return {};
    var connected = {};
    Object.keys(value).forEach(function(legacyKey) {
      var record = value[legacyKey];
      if (!isPlainObject(record)) {
        setOwnEnumerable(connected, legacyKey, record);
        return;
      }
      var key = resolveConnectedKey(record.name, record.version, '', legacyKey);
      var current = Object.prototype.hasOwnProperty.call(connected, key)
        ? connected[key]
        : undefined;
      if (shouldReplaceConnectedRecord(current, record)) {
        setOwnEnumerable(connected, key, record);
      }
    });
    return connected;
  }

  function normalizeEnvelope(value) {
    var source = isPlainObject(value) ? value : {};
    var envelope = {};
    Object.keys(source).forEach(function(key) {
      var ownValue = ownEnumerableDataValue(source, key);
      if (ownValue !== undefined) setOwnEnumerable(envelope, key, ownValue);
    });
    envelope.clicked = cloneMap(ownEnumerableDataValue(source, 'clicked'));
    envelope.connected = normalizeConnected(ownEnumerableDataValue(source, 'connected'));
    envelope.installed = cloneMap(ownEnumerableDataValue(source, 'installed'));
    var compatibilityDescriptor;
    try {
      compatibilityDescriptor = Object.getOwnPropertyDescriptor(source, 'compatibility');
    } catch (_error) {
      compatibilityDescriptor = null;
    }
    if (compatibilityDescriptor) {
      envelope.compatibility = compatibilityDescriptor.enumerable
          && Object.prototype.hasOwnProperty.call(compatibilityDescriptor, 'value')
        ? parseCompatibilitySnapshot(compatibilityDescriptor.value)
        : null;
    }
    return envelope;
  }

  function getStorageArea() {
    var chromeApi = (typeof globalThis !== 'undefined') ? globalThis.chrome : null;
    var area = chromeApi && chromeApi.storage && chromeApi.storage.local;
    if (!area || typeof area.get !== 'function' || typeof area.set !== 'function') {
      throw new Error('MCP agent provider storage is unavailable');
    }
    return area;
  }

  async function read() {
    var stored = await getStorageArea().get([FSB_AGENT_PROVIDERS_STORAGE_KEY]);
    return normalizeEnvelope(stored && stored[FSB_AGENT_PROVIDERS_STORAGE_KEY]);
  }

  async function write(envelope) {
    var payload = {};
    setOwnEnumerable(payload, FSB_AGENT_PROVIDERS_STORAGE_KEY, normalizeEnvelope(envelope));
    await getStorageArea().set(payload);
    return payload[FSB_AGENT_PROVIDERS_STORAGE_KEY];
  }

  var mutationChain = Promise.resolve();

  function enqueueMutation(run) {
    var next = mutationChain.then(run, run);
    mutationChain = next.catch(function() { /* keep later writers live */ });
    return next;
  }

  function mutateSubmap(submap, mutator) {
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_SUBMAPS, submap)) {
      return Promise.reject(new Error('Unknown MCP agent provider submap'));
    }
    if (typeof mutator !== 'function') {
      return Promise.reject(new Error('MCP agent provider mutator must be a function'));
    }

    var run = async function() {
      var envelope = await read();
      var selected = cloneMap(envelope[submap]);
      var result = await mutator(selected);
      if (result !== undefined) {
        if (!isPlainObject(result)) {
          throw new Error('MCP agent provider mutator must return an object');
        }
        selected = cloneMap(result);
      }
      envelope[submap] = selected;
      return await write(envelope);
    };

    return enqueueMutation(run);
  }

  function normalizeIdentityPart(value) {
    return typeof value === 'string'
      ? value.toLowerCase().replace(/\s+/g, '')
      : '';
  }

  async function recordConnected(agentId, clientInfo) {
    var info = isPlainObject(clientInfo) ? clientInfo : {};
    var name = typeof info.name === 'string' ? info.name : '';
    var version = typeof info.version === 'string' ? info.version : '';
    var key = resolveConnectedKey(name, version, agentId, '');

    return await mutateSubmap('connected', function(connected) {
      var record = {
        name: name,
        version: version,
        lastSeenAt: Date.now()
      };
      setOwnEnumerable(connected, key, record);
    });
  }

  function normalizeInstalled(platforms) {
    if (!isPlainObject(platforms)) return {};
    var installed = {};
    Object.keys(platforms).forEach(function(clientId) {
      var record = platforms[clientId];
      if (!isPlainObject(record)) return;
      if (typeof record.detected !== 'boolean') return;
      if (!(record.configPath === null || typeof record.configPath === 'string')) return;
      if (typeof record.checkedAt !== 'number' || !Number.isFinite(record.checkedAt)) return;

      var normalized = {
        detected: record.detected,
        configPath: record.configPath,
        checkedAt: record.checkedAt
      };
      if (typeof record.version === 'string') {
        normalized.version = record.version;
      }
      setOwnEnumerable(installed, clientId, normalized);
    });
    return installed;
  }

  async function replaceInstalled(platforms) {
    var installed = normalizeInstalled(platforms);
    return await mutateSubmap('installed', function() {
      return installed;
    });
  }

  function replaceCompatibility(snapshot) {
    var compatibility = parseCompatibilitySnapshot(snapshot);
    if (!compatibility) {
      return Promise.reject(new Error('Invalid MCP agent compatibility snapshot'));
    }
    return enqueueMutation(async function() {
      var envelope = await read();
      envelope.compatibility = compatibility;
      return await write(envelope);
    });
  }

  function createMergedRow(id, raw, displayName) {
    return {
      id: id,
      raw: raw,
      displayName: displayName,
      clicked: null,
      installed: null,
      connected: null,
      live: null
    };
  }

  function compatibilityProjection(status, reason, checkedAt) {
    return {
      status: status,
      reason: reason,
      checkedAt: checkedAt
    };
  }

  function projectedCompatibility(snapshot, adapterId, now) {
    var validTime = Number.isSafeInteger(now) && now >= 0;
    var validSnapshot = snapshot
      && snapshot.schemaVersion === 1
      && Number.isSafeInteger(snapshot.checkedAt)
      && snapshot.checkedAt >= 0;
    var checkedAt = validSnapshot && validTime && snapshot.checkedAt <= now
      ? snapshot.checkedAt
      : null;
    if (!Object.prototype.hasOwnProperty.call(FSB_SHIPPED_COMPATIBILITY_LABELS, adapterId)) {
      return compatibilityProjection('unsupported', 'adapter_unshipped', checkedAt);
    }
    if (!validSnapshot || !validTime || snapshot.checkedAt > now) {
      return compatibilityProjection('unsupported', 'matrix_invalid', null);
    }

    var row = null;
    for (var index = 0; index < snapshot.adapters.length; index += 1) {
      if (snapshot.adapters[index].adapterId === adapterId) {
        row = snapshot.adapters[index];
        break;
      }
    }
    if (!row || row.displayLabel !== FSB_SHIPPED_COMPATIBILITY_LABELS[adapterId]) {
      return compatibilityProjection('unsupported', 'matrix_invalid', checkedAt);
    }
    if (row.status === 'supported'
        && now - snapshot.checkedAt > FSB_AGENT_COMPATIBILITY_MAX_AGE_MS) {
      return compatibilityProjection('degraded', 'evidence_stale', snapshot.checkedAt);
    }
    return compatibilityProjection(row.status, row.reason, snapshot.checkedAt);
  }

  function resolveProjectionTime(now) {
    try {
      var value = typeof now === 'function' ? now() : (now === undefined ? Date.now() : now);
      return Number.isSafeInteger(value) && value >= 0 ? value : null;
    } catch (_error) {
      return null;
    }
  }

  function getAliasApi() {
    var aliases = global && global.FsbMcpClientAliases;
    if (!aliases
        || typeof aliases.normalizeMcpClientName !== 'function'
        || typeof aliases.resolveMcpClientAlias !== 'function') {
      throw new Error('MCP client aliases are unavailable');
    }
    return aliases;
  }

  async function getMergedClients(liveRecords, now) {
    var aliases = getAliasApi();
    var envelope = await read();
    var merged = {};
    var unknownIndex = 0;
    var projectionTime = resolveProjectionTime(now);

    function ensureCanonicalRow(id) {
      if (!Object.prototype.hasOwnProperty.call(merged, id)) {
        setOwnEnumerable(merged, id, createMergedRow(id, false, id));
      }
      return merged[id];
    }

    function resolveNamedRow(name) {
      var originalName = typeof name === 'string' ? name : '';
      var canonicalId = aliases.resolveMcpClientAlias(originalName);
      if (canonicalId) {
        var canonicalRow = ensureCanonicalRow(canonicalId);
        if (canonicalRow.displayName === canonicalRow.id && originalName) {
          canonicalRow.displayName = originalName;
        }
        return canonicalRow;
      }

      var normalizedName = aliases.normalizeMcpClientName(originalName);
      var rawId = normalizedName
        ? 'raw:' + normalizedName
        : 'raw:unknown-' + unknownIndex++;
      if (!Object.prototype.hasOwnProperty.call(merged, rawId)) {
        setOwnEnumerable(merged, rawId, createMergedRow(rawId, true, originalName));
      }
      return merged[rawId];
    }

    Object.keys(envelope.clicked).sort().forEach(function(id) {
      ensureCanonicalRow(id).clicked = envelope.clicked[id];
    });
    Object.keys(envelope.installed).sort().forEach(function(id) {
      ensureCanonicalRow(id).installed = envelope.installed[id];
    });
    Object.keys(envelope.connected).sort().forEach(function(key) {
      var record = envelope.connected[key];
      var name = isPlainObject(record) ? record.name : '';
      resolveNamedRow(name).connected = record;
    });

    var records = Array.isArray(liveRecords) ? liveRecords : [];
    records.forEach(function(record) {
      if (!isPlainObject(record) || !isPlainObject(record.clientInfo)) return;
      resolveNamedRow(record.clientInfo.name).live = record;
    });

    Object.keys(merged).forEach(function(id) {
      if (!Object.prototype.hasOwnProperty.call(FSB_COMPATIBILITY_AGENT_IDS, id)) return;
      merged[id].compatibility = projectedCompatibility(
        Object.prototype.hasOwnProperty.call(envelope, 'compatibility')
          ? envelope.compatibility
          : null,
        id,
        projectionTime
      );
    });

    return merged;
  }

  var api = {
    read: read,
    mutateSubmap: mutateSubmap,
    recordConnected: recordConnected,
    replaceCompatibility: replaceCompatibility,
    replaceInstalled: replaceInstalled
  };
  Object.defineProperty(api, 'COMPATIBILITY_MAX_AGE_MS', {
    value: FSB_AGENT_COMPATIBILITY_MAX_AGE_MS,
    enumerable: false
  });
  Object.defineProperty(api, 'validateCompatibilitySnapshot', {
    value: function(value) { return parseCompatibilitySnapshot(value); },
    enumerable: false
  });
  Object.defineProperty(api, 'getMergedClients', {
    value: getMergedClients,
    enumerable: false
  });
  global.FsbMcpAgentProviders = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
