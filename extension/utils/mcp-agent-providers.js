(function(global) {
  'use strict';

  var FSB_AGENT_PROVIDERS_STORAGE_KEY = 'fsbAgentProviders';
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
      setOwnEnumerable(envelope, key, source[key]);
    });
    envelope.clicked = cloneMap(source.clicked);
    envelope.connected = normalizeConnected(source.connected);
    envelope.installed = cloneMap(source.installed);
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

    var next = mutationChain.then(run, run);
    mutationChain = next.catch(function() { /* keep later writers live */ });
    return next;
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
      var current = Object.prototype.hasOwnProperty.call(connected, key)
        ? connected[key]
        : undefined;
      if (shouldReplaceConnectedRecord(current, record)) {
        setOwnEnumerable(connected, key, record);
      }
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

  function getAliasApi() {
    var aliases = global && global.FsbMcpClientAliases;
    if (!aliases
        || typeof aliases.normalizeMcpClientName !== 'function'
        || typeof aliases.resolveMcpClientAlias !== 'function') {
      throw new Error('MCP client aliases are unavailable');
    }
    return aliases;
  }

  async function getMergedClients(liveRecords) {
    var aliases = getAliasApi();
    var envelope = await read();
    var merged = {};
    var unknownIndex = 0;

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

    return merged;
  }

  var api = {
    read: read,
    mutateSubmap: mutateSubmap,
    recordConnected: recordConnected,
    replaceInstalled: replaceInstalled
  };
  Object.defineProperty(api, 'getMergedClients', {
    value: getMergedClients,
    enumerable: false
  });
  global.FsbMcpAgentProviders = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
