/**
 * Durable, append-only Lattice event journal for MCP recording sessions.
 *
 * New MCP clients provide an authenticated agentId plus an internal
 * recordingRunId. This module binds that pair to one durable run, stores each
 * retained dispatch once, and exposes history/replay/export projections.
 * Legacy clients remain owned by mcp-session-recorder.js.
 */
(function (globalScope) {
  'use strict';

  var DB_NAME = 'fsb-mcp-lattice-journal';
  var DB_VERSION = 1;
  var RUN_STORE = 'runs';
  var EVENT_STORE = 'events';
  var ARTIFACT_STORE = 'artifacts';
  var META_STORE = 'meta';
  var TOTAL_BYTES_KEY = 'totalEncodedBytes';
  var SCHEMA_VERSION = 2;
  var STORAGE_BACKEND = 'journal-v2';
  var ARTIFACT_THRESHOLD_BYTES = 64 * 1024;
  var ARTIFACT_PREVIEW_CHARS = 2048;
  var ARTIFACT_READ_LIMIT = 256 * 1024;
  var DETAIL_DEFAULT_LIMIT = 200;
  var DETAIL_MAX_LIMIT = 500;
  var MAX_ENCODED_BYTES = 512 * 1024 * 1024;
  var EXPORT_ARTIFACT_MAX_BYTES = 32 * 1024 * 1024;
  var RETENTION_DEFAULT_DAYS = 30;
  var SESSION_HISTORY_CAP = 50;
  var IDLE_MS = 60 * 1000;
  var RECORDING_LEASE_MIN_MS = 1000;
  var RECORDING_LEASE_MAX_MS = 15 * 60 * 1000;
  var MEMORY_CANDIDATE_TTL_MS = 5 * 60 * 1000;
  var IDLE_ALARM_PREFIX = 'fsbMcpJournal:idle:';
  var RETENTION_ALARM = 'fsbMcpJournal:retention';
  var RETENTION_ALARM_MINUTES = 24 * 60;
  var TASK_SOURCE_PRIORITY = Object.freeze({
    tool: 0,
    capability: 1,
    'visual-session': 2
  });
  var RESULT_PROJECTION_ACTION = 'journal-action-v1';
  var RESULT_PROJECTION_FULL = 'journal-full-v1';
  var INTERNAL_PAYLOAD_KEYS = Object.freeze([
    'agentId', 'agent_id', 'ownershipToken', 'ownership_token',
    'connectionId', 'connection_id', 'recordingRunId', 'recordingCallId',
    'recordingLeaseMs'
  ]);

  var _dbPromise = null;
  var _backendOverride = null;
  var _localStorageShim = null;
  var _alarmShim = null;
  var _timeShim = null;
  var _writeQueue = Promise.resolve();
  var _recordingGaps = new Map();
  var _indexProjectionDirty = false;

  function correlationKey(entry) {
    return String(entry && entry.agentId || '') + '\u0000' + String(entry && entry.recordingRunId || '');
  }

  function nowMs() {
    return _timeShim && typeof _timeShim.now === 'function' ? _timeShim.now() : Date.now();
  }

  function uuid() {
    try {
      if (globalScope.crypto && typeof globalScope.crypto.randomUUID === 'function') {
        return globalScope.crypto.randomUUID();
      }
    } catch (_error) { /* fall through */ }
    return 'journal-' + String(nowMs()) + '-' + Math.random().toString(16).slice(2) + '-' + Math.random().toString(16).slice(2);
  }

  function clone(value, fallback) {
    try {
      if (typeof structuredClone === 'function') return structuredClone(value);
    } catch (_error) { /* JSON fallback */ }
    try {
      if (value === undefined) return fallback;
      return JSON.parse(JSON.stringify(value));
    } catch (_error2) {
      return fallback;
    }
  }

  function textEncoder() {
    if (typeof TextEncoder === 'function') return new TextEncoder();
    throw new Error('TextEncoder is unavailable');
  }

  function textDecoder() {
    if (typeof TextDecoder === 'function') return new TextDecoder();
    throw new Error('TextDecoder is unavailable');
  }

  function byteLength(value) {
    return textEncoder().encode(String(value || '')).byteLength;
  }

  function utf8Preview(bytes, maximumBytes) {
    var end = Math.min(bytes.byteLength, maximumBytes);
    if (end < bytes.byteLength) {
      while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
    }
    return textDecoder().decode(bytes.slice(0, end));
  }

  function stableJson(value) {
    var seen = new Set();
    function normalize(node) {
      if (node === null || typeof node !== 'object') return node;
      if (seen.has(node)) throw new TypeError('Circular value cannot be journaled');
      seen.add(node);
      var out;
      if (Array.isArray(node)) {
        out = node.map(normalize);
      } else {
        out = {};
        Object.keys(node).sort().forEach(function (key) {
          var child = node[key];
          if (child !== undefined && typeof child !== 'function') out[key] = normalize(child);
        });
      }
      seen.delete(node);
      return out;
    }
    return JSON.stringify(normalize(value === undefined ? null : value));
  }

  function hex(bytes) {
    return Array.from(new Uint8Array(bytes)).map(function (value) {
      return value.toString(16).padStart(2, '0');
    }).join('');
  }

  async function sha256(bytes) {
    if (globalScope.crypto && globalScope.crypto.subtle) {
      return hex(await globalScope.crypto.subtle.digest('SHA-256', bytes));
    }
    if (typeof require === 'function') {
      var crypto = require('node:crypto');
      return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
    }
    throw new Error('SHA-256 is unavailable');
  }

  async function gzip(bytes) {
    if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function') {
      return { encoding: 'identity', bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    }
    try {
      var writerInput = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
      return { encoding: 'gzip', bytes: await new Response(writerInput).arrayBuffer() };
    } catch (_error) {
      return { encoding: 'identity', bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    }
  }

  async function ungzip(row) {
    var source = row && row.bytes instanceof ArrayBuffer
      ? row.bytes
      : (row && ArrayBuffer.isView(row.bytes)
        ? row.bytes.buffer.slice(row.bytes.byteOffset, row.bytes.byteOffset + row.bytes.byteLength)
        : new ArrayBuffer(0));
    if (row && row.encoding === 'gzip' && typeof DecompressionStream === 'function') {
      var stream = new Blob([source]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return new Uint8Array(source);
  }

  function artifactCorruptError(message, cause) {
    var error = new Error(message || 'Journal payload failed integrity verification');
    error.code = 'artifact_corrupt';
    if (cause) error.cause = cause;
    return error;
  }

  async function verifiedArtifactBytes(row) {
    var bytes;
    try {
      bytes = await ungzip(row);
    } catch (cause) {
      throw artifactCorruptError('Journal artifact could not be decoded', cause);
    }
    var digest = await sha256(bytes);
    if (!row || digest !== row.id ||
        (Number.isFinite(row.byteLength) && row.byteLength !== bytes.byteLength)) {
      throw artifactCorruptError('Journal artifact failed integrity verification');
    }
    return bytes;
  }

  function requestResult(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('IndexedDB request failed')); };
    });
  }

  function transactionDone(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () { resolve(); };
      transaction.onabort = function () { reject(transaction.error || new Error('IndexedDB transaction aborted')); };
      transaction.onerror = function () { reject(transaction.error || new Error('IndexedDB transaction failed')); };
    });
  }

  function accountedBytes(value) {
    return Math.max(0, Number(value) || 0);
  }

  function isReplayTerminalStatus(status) {
    return typeof status === 'string' &&
      status !== 'running' && status !== 'paused' && status !== 'replay_paused';
  }

  function storageBudgetError() {
    var error = new Error('Journal encoded-data budget exhausted');
    error.code = 'storage_budget_exhausted';
    return error;
  }

  function ensureIndex(store, name, keyPath, options) {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options || {});
  }

  function openDatabase() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function (resolve, reject) {
      if (!globalScope.indexedDB) {
        reject(new Error('IndexedDB is unavailable'));
        return;
      }
      var request = globalScope.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        var runs = db.objectStoreNames.contains(RUN_STORE)
          ? request.transaction.objectStore(RUN_STORE)
          : db.createObjectStore(RUN_STORE, { keyPath: 'id' });
        ensureIndex(runs, 'byAgentRecordingRun', ['agentId', 'recordingRunId'], { unique: true });
        ensureIndex(runs, 'byStatus', 'status');
        ensureIndex(runs, 'byEndTime', 'endTime');
        ensureIndex(runs, 'byParentRunId', 'parentRunId');
        ensureIndex(runs, 'byReplayIntegrity', 'replayIntegrity');

        var events = db.objectStoreNames.contains(EVENT_STORE)
          ? request.transaction.objectStore(EVENT_STORE)
          : db.createObjectStore(EVENT_STORE, { keyPath: ['runId', 'sequence'] });
        ensureIndex(events, 'byRunId', 'runId');
        ensureIndex(events, 'byEventId', 'eventId', { unique: true });
        ensureIndex(events, 'byCallId', 'callId', { unique: false });

        if (!db.objectStoreNames.contains(ARTIFACT_STORE)) {
          db.createObjectStore(ARTIFACT_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = function () {
        var db = request.result;
        db.onversionchange = function () { db.close(); _dbPromise = null; };
        resolve(db);
      };
      request.onerror = function () {
        _dbPromise = null;
        reject(request.error || new Error('Could not open MCP journal'));
      };
    });
    return _dbPromise;
  }

  function eventRange(runId, afterSequence) {
    var lower = Number.isFinite(afterSequence) ? afterSequence + 1 : Number.MIN_SAFE_INTEGER;
    return IDBKeyRange.bound([runId, lower], [runId, Number.MAX_SAFE_INTEGER]);
  }

  function createIndexedDbBackend() {
    return {
      async getRun(id) {
        var db = await openDatabase();
        var tx = db.transaction(RUN_STORE, 'readonly');
        return clone(await requestResult(tx.objectStore(RUN_STORE).get(id)), null);
      },
      async getRunByCorrelation(agentId, recordingRunId) {
        var db = await openDatabase();
        var tx = db.transaction(RUN_STORE, 'readonly');
        return clone(await requestResult(tx.objectStore(RUN_STORE).index('byAgentRecordingRun').get([agentId, recordingRunId])), null);
      },
      async getEventByCallId(callId) {
        if (!callId) return null;
        var db = await openDatabase();
        var tx = db.transaction(EVENT_STORE, 'readonly');
        return clone(await requestResult(tx.objectStore(EVENT_STORE).index('byCallId').get(callId)), null);
      },
      async putBundle(run, events, artifacts, relatedRuns) {
        var db = await openDatabase();
        var tx = db.transaction([RUN_STORE, EVENT_STORE, ARTIFACT_STORE, META_STORE], 'readwrite');
        var runStore = tx.objectStore(RUN_STORE);
        var eventStore = tx.objectStore(EVENT_STORE);
        var artifactStore = tx.objectStore(ARTIFACT_STORE);
        var metaStore = tx.objectStore(META_STORE);
        var meta = await requestResult(metaStore.get(TOTAL_BYTES_KEY));
        var total = meta && Number.isFinite(meta.value) ? meta.value : 0;
        var artifactRows = coalesceArtifacts(artifacts || []);
        var existingArtifacts = new Map();
        var addedBytes = (events || []).reduce(function (sum, event) {
          return sum + accountedBytes(event && event.byteCost);
        }, 0);
        for (var p = 0; p < artifactRows.length; p++) {
          var persisted = await requestResult(artifactStore.get(artifactRows[p].id));
          existingArtifacts.set(artifactRows[p].id, persisted || null);
          if (!persisted) addedBytes += accountedBytes(artifactRows[p].storedBytes);
        }
        if (addedBytes > 0 && total + addedBytes > MAX_ENCODED_BYTES) {
          try { tx.abort(); } catch (_abortError) { /* no writes have been issued */ }
          throw storageBudgetError();
        }
        for (var i = 0; i < artifactRows.length; i++) {
          var incoming = artifactRows[i];
          var existing = existingArtifacts.get(incoming.id);
          if (existing) {
            existing.refCount = Math.max(0, Number(existing.refCount) || 0) + incoming.refDelta;
            await requestResult(artifactStore.put(existing));
          } else {
            incoming.refCount = incoming.refDelta;
            delete incoming.refDelta;
            total += accountedBytes(incoming.storedBytes);
            await requestResult(artifactStore.put(incoming));
          }
        }
        for (var e = 0; e < events.length; e++) {
          total += accountedBytes(events[e].byteCost);
          await requestResult(eventStore.add(events[e]));
        }
        await requestResult(runStore.put(run));
        for (var r = 0; r < (relatedRuns || []).length; r++) {
          await requestResult(runStore.put(relatedRuns[r]));
        }
        await requestResult(metaStore.put({ key: TOTAL_BYTES_KEY, value: Math.max(0, total) }));
        await transactionDone(tx);
        return clone(run, null);
      },
      async updateRun(run) {
        var db = await openDatabase();
        var tx = db.transaction(RUN_STORE, 'readwrite');
        await requestResult(tx.objectStore(RUN_STORE).put(run));
        await transactionDone(tx);
        return clone(run, null);
      },
      async getEvents(runId, afterSequence, limit) {
        var db = await openDatabase();
        var tx = db.transaction(EVENT_STORE, 'readonly');
        var rows = await requestResult(tx.objectStore(EVENT_STORE).getAll(eventRange(runId, afterSequence), limit));
        return clone(rows || [], []);
      },
      async getAllEvents(runId) {
        var db = await openDatabase();
        var tx = db.transaction(EVENT_STORE, 'readonly');
        return clone(await requestResult(tx.objectStore(EVENT_STORE).getAll(eventRange(runId, null))), []);
      },
      async getArtifact(id) {
        var db = await openDatabase();
        var tx = db.transaction(ARTIFACT_STORE, 'readonly');
        return await requestResult(tx.objectStore(ARTIFACT_STORE).get(id)) || null;
      },
      async getTotalBytes() {
        var db = await openDatabase();
        var tx = db.transaction(META_STORE, 'readonly');
        var row = await requestResult(tx.objectStore(META_STORE).get(TOTAL_BYTES_KEY));
        return row && Number.isFinite(row.value) ? row.value : 0;
      },
      async listClosedOldest(cutoff) {
        var db = await openDatabase();
        var tx = db.transaction(RUN_STORE, 'readonly');
        var range = Number.isFinite(cutoff) ? IDBKeyRange.upperBound(cutoff) : null;
        return clone(await requestResult(tx.objectStore(RUN_STORE).index('byEndTime').getAll(range)), []);
      },
      async listOpenRuns() {
        var db = await openDatabase();
        var tx = db.transaction(RUN_STORE, 'readonly');
        return clone(await requestResult(tx.objectStore(RUN_STORE).index('byStatus').getAll('running')), []);
      },
      async listRecordingRuns() {
        var db = await openDatabase();
        var tx = db.transaction(RUN_STORE, 'readonly');
        var rows = await requestResult(tx.objectStore(RUN_STORE).getAll());
        return clone((rows || []).filter(function (run) { return run.type === 'recording'; }), []);
      },
      async listPendingSeals() {
        var db = await openDatabase();
        var tx = db.transaction(RUN_STORE, 'readonly');
        return clone(await requestResult(tx.objectStore(RUN_STORE).index('byReplayIntegrity').getAll('pending')), []);
      },
      async listChildRuns(parentRunId) {
        var db = await openDatabase();
        var tx = db.transaction(RUN_STORE, 'readonly');
        return clone(await requestResult(tx.objectStore(RUN_STORE).index('byParentRunId').getAll(parentRunId)), []);
      },
      async deleteRun(runId) {
        var db = await openDatabase();
        var readTx = db.transaction(EVENT_STORE, 'readonly');
        var rows = await requestResult(readTx.objectStore(EVENT_STORE).getAll(eventRange(runId, null)));
        var tx = db.transaction([RUN_STORE, EVENT_STORE, ARTIFACT_STORE, META_STORE], 'readwrite');
        var eventStore = tx.objectStore(EVENT_STORE);
        var artifactStore = tx.objectStore(ARTIFACT_STORE);
        var metaStore = tx.objectStore(META_STORE);
        var meta = await requestResult(metaStore.get(TOTAL_BYTES_KEY));
        var total = meta && Number.isFinite(meta.value) ? meta.value : 0;
        var refs = artifactReferenceCounts(rows || []);
        var ids = Object.keys(refs);
        for (var i = 0; i < ids.length; i++) {
          var artifact = await requestResult(artifactStore.get(ids[i]));
          if (!artifact) continue;
          artifact.refCount = Math.max(0, (Number(artifact.refCount) || 0) - refs[ids[i]]);
          if (artifact.refCount === 0) {
            total -= artifact.storedBytes || 0;
            await requestResult(artifactStore.delete(ids[i]));
          } else {
            await requestResult(artifactStore.put(artifact));
          }
        }
        for (var e = 0; e < (rows || []).length; e++) {
          total -= rows[e].byteCost || 0;
        }
        await requestResult(eventStore.delete(eventRange(runId, null)));
        await requestResult(tx.objectStore(RUN_STORE).delete(runId));
        await requestResult(metaStore.put({ key: TOTAL_BYTES_KEY, value: Math.max(0, total) }));
        await transactionDone(tx);
        return true;
      }
    };
  }

  function createMemoryBackend() {
    var runs = new Map();
    var events = new Map();
    var artifacts = new Map();
    var totalBytes = 0;
    function copy(value) { return clone(value, value); }
    return {
      _state: { runs: runs, events: events, artifacts: artifacts },
      async getRun(id) { return copy(runs.get(id) || null); },
      async getRunByCorrelation(agentId, recordingRunId) {
        return copy(Array.from(runs.values()).find(function (run) {
          return run.agentId === agentId && run.recordingRunId === recordingRunId;
        }) || null);
      },
      async getEventByCallId(callId) {
        return copy(Array.from(events.values()).flat().find(function (event) { return event.callId === callId; }) || null);
      },
      async putBundle(run, rows, incomingArtifacts, relatedRuns) {
        var artifactRows = coalesceArtifacts(incomingArtifacts || []);
        var addedBytes = (rows || []).reduce(function (sum, row) {
          return sum + accountedBytes(row && row.byteCost);
        }, 0);
        artifactRows.forEach(function (incoming) {
          if (!artifacts.has(incoming.id)) addedBytes += accountedBytes(incoming.storedBytes);
        });
        if (addedBytes > 0 && totalBytes + addedBytes > MAX_ENCODED_BYTES) {
          throw storageBudgetError();
        }
        artifactRows.forEach(function (incoming) {
          var existing = artifacts.get(incoming.id);
          if (existing) {
            existing.refCount += incoming.refDelta;
          } else {
            var row = copy(incoming);
            row.refCount = row.refDelta;
            delete row.refDelta;
            artifacts.set(row.id, row);
            totalBytes += accountedBytes(row.storedBytes);
          }
        });
        var list = events.get(run.id) || [];
        rows.forEach(function (row) { list.push(copy(row)); totalBytes += accountedBytes(row.byteCost); });
        list.sort(function (a, b) { return a.sequence - b.sequence; });
        events.set(run.id, list);
        runs.set(run.id, copy(run));
        (relatedRuns || []).forEach(function (relatedRun) {
          runs.set(relatedRun.id, copy(relatedRun));
        });
        return copy(run);
      },
      async updateRun(run) { runs.set(run.id, copy(run)); return copy(run); },
      async getEvents(runId, afterSequence, limit) {
        return copy((events.get(runId) || []).filter(function (event) {
          return event.sequence > (Number.isFinite(afterSequence) ? afterSequence : Number.MIN_SAFE_INTEGER);
        }).slice(0, limit));
      },
      async getAllEvents(runId) { return copy(events.get(runId) || []); },
      async getArtifact(id) { return copy(artifacts.get(id) || null); },
      async getTotalBytes() { return totalBytes; },
      async listClosedOldest(cutoff) {
        return copy(Array.from(runs.values()).filter(function (run) {
          return run.status !== 'running' && Number.isFinite(run.endTime) && (!Number.isFinite(cutoff) || run.endTime <= cutoff);
        }).sort(function (a, b) { return a.endTime - b.endTime; }));
      },
      async listOpenRuns() { return copy(Array.from(runs.values()).filter(function (run) { return run.status === 'running'; })); },
      async listRecordingRuns() {
        return copy(Array.from(runs.values()).filter(function (run) { return run.type === 'recording'; }));
      },
      async listPendingSeals() { return copy(Array.from(runs.values()).filter(function (run) { return run.replayIntegrity === 'pending'; })); },
      async listChildRuns(parentRunId) { return copy(Array.from(runs.values()).filter(function (run) { return run.parentRunId === parentRunId; })); },
      async deleteRun(runId) {
        var rows = events.get(runId) || [];
        var refs = artifactReferenceCounts(rows);
        Object.keys(refs).forEach(function (id) {
          var artifact = artifacts.get(id);
          if (!artifact) return;
          artifact.refCount -= refs[id];
          if (artifact.refCount <= 0) {
            totalBytes -= artifact.storedBytes || 0;
            artifacts.delete(id);
          }
        });
        rows.forEach(function (row) { totalBytes -= row.byteCost || 0; });
        events.delete(runId);
        runs.delete(runId);
        totalBytes = Math.max(0, totalBytes);
        return true;
      }
    };
  }

  function backend() {
    if (_backendOverride) return _backendOverride;
    if (!backend._indexedDb) backend._indexedDb = createIndexedDbBackend();
    return backend._indexedDb;
  }

  function coalesceArtifacts(rows) {
    var byId = new Map();
    (rows || []).forEach(function (row) {
      if (!row || !row.id) return;
      if (byId.has(row.id)) {
        byId.get(row.id).refDelta += Number(row.refDelta) || 1;
      } else {
        var next = clone(row, row);
        next.refDelta = Number(next.refDelta) || 1;
        byId.set(next.id, next);
      }
    });
    return Array.from(byId.values());
  }

  function payloadArtifactIds(event) {
    var ids = [];
    var metadata = event && event.metadata || {};
    ['request', 'result'].forEach(function (field) {
      var descriptor = metadata[field];
      if (descriptor && descriptor.storage === 'artifact' && typeof descriptor.artifactId === 'string') {
        ids.push(descriptor.artifactId);
      }
    });
    return ids;
  }

  function artifactReferenceCounts(events) {
    var counts = {};
    (events || []).forEach(function (event) {
      payloadArtifactIds(event).forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
    });
    return counts;
  }

  function eventRowsByteCost(rows) {
    return (rows || []).reduce(function (sum, row) {
      return sum + accountedBytes(row && row.byteCost);
    }, 0);
  }

  async function bundleEncodedByteCost(store, rows, artifactRows) {
    var total = eventRowsByteCost(rows);
    var incoming = coalesceArtifacts(artifactRows || []);
    for (var i = 0; i < incoming.length; i++) {
      if (!(await store.getArtifact(incoming[i].id))) total += accountedBytes(incoming[i].storedBytes);
    }
    return total;
  }

  function hasPersistedRunStart(run) {
    return run && (run.runStartWritten === true || accountedBytes(run.eventCount) > 0);
  }

  function recordingStartEvent(run, at, sequence) {
    if (hasPersistedRunStart(run)) return null;
    return makeEvent(run, sequence, 'run.start', at, {
      schemaVersion: SCHEMA_VERSION,
      agentId: run.agentId,
      recordingRunId: run.recordingRunId,
      client: run.client,
      task: run.task,
      taskSource: run.taskSource || null
    });
  }

  function applyPersistedEvents(run, rows) {
    if (!rows || !rows.length) return;
    var nextSequence = accountedBytes(run.nextSequence);
    rows.forEach(function (row) {
      nextSequence = Math.max(nextSequence, accountedBytes(row.sequence) + 1);
      if (row.kind === 'run.start') run.runStartWritten = true;
    });
    run.nextSequence = nextSequence;
    run.eventCount = accountedBytes(run.eventCount) + rows.length;
  }

  function markStorageBudgetDegraded(run) {
    run.recordingState = 'degraded';
    run.degradedReason = 'storage_budget_exhausted';
    run.replayTrusted = false;
    run.replayIntegrity = 'degraded';
  }

  function invalidateReplayMetadata(run) {
    if (!run || run.type !== 'recording') return false;
    var hadReplayMetadata = !!run.replay || run.replayIntegrity === 'verified' || run.replayIntegrity === 'failed';
    run.replay = null;
    run.replayIntegrity = run.replayTrusted === false ? 'degraded' : 'pending';
    return hadReplayMetadata;
  }

  async function preparePayload(value) {
    var canonical = stableJson(value);
    var bytes = textEncoder().encode(canonical);
    var digest = await sha256(bytes);
    var preview = utf8Preview(bytes, ARTIFACT_PREVIEW_CHARS);
    if (bytes.byteLength <= ARTIFACT_THRESHOLD_BYTES) {
      return {
        descriptor: {
          storage: 'inline', inline: clone(value, null), sha256: digest,
          byteLength: bytes.byteLength, preview: preview
        },
        artifact: null
      };
    }
    var compressed = await gzip(bytes);
    return {
      descriptor: {
        storage: 'artifact', artifactId: digest, sha256: digest,
        byteLength: bytes.byteLength, storedBytes: compressed.bytes.byteLength,
        encoding: compressed.encoding, preview: preview
      },
      artifact: {
        id: digest,
        encoding: compressed.encoding,
        bytes: compressed.bytes,
        byteLength: bytes.byteLength,
        storedBytes: compressed.bytes.byteLength,
        refDelta: 1,
        createdAt: nowMs()
      }
    };
  }

  function omitArtifact(prepared, reason) {
    if (!prepared || !prepared.descriptor) return prepared;
    var descriptor = prepared.descriptor;
    var omission = {
      storage: 'omitted', sha256: prepared.descriptor.sha256,
      byteLength: prepared.descriptor.byteLength,
      preview: prepared.descriptor.preview,
      reason: reason || 'budget'
    };
    Object.keys(descriptor).forEach(function (key) { delete descriptor[key]; });
    Object.assign(descriptor, omission);
    prepared.artifact = null;
    return prepared;
  }

  function eventByteCost(event) {
    try { return byteLength(JSON.stringify(event)); } catch (_error) { return 0; }
  }

  function makeEvent(run, sequence, kind, at, metadata) {
    var event = {
      schemaVersion: SCHEMA_VERSION,
      eventId: uuid(),
      runId: run.id,
      sequence: sequence,
      kind: kind,
      timestamp: new Date(at).toISOString(),
      callId: metadata && metadata.callId || null,
      metadata: metadata || {}
    };
    event.byteCost = eventByteCost(event);
    return event;
  }

  function validRunSidecar(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
  }

  function validCallSidecar(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
  }

  function normalizedLeaseMs(value) {
    var lease = Number(value);
    if (!Number.isFinite(lease)) lease = IDLE_MS;
    return Math.max(RECORDING_LEASE_MIN_MS, Math.min(RECORDING_LEASE_MAX_MS, Math.floor(lease)));
  }

  function normalizedActiveCalls(run, at) {
    var calls = Array.isArray(run && run.activeCalls) ? run.activeCalls : [];
    var seen = new Set();
    var active = [];
    calls.forEach(function (call) {
      if (!call || !validCallSidecar(call.callId) || !Number.isFinite(call.expiresAt) || call.expiresAt <= at ||
          seen.has(call.callId)) return;
      seen.add(call.callId);
      active.push({ callId: call.callId, expiresAt: call.expiresAt });
    });
    active.sort(function (a, b) { return a.expiresAt - b.expiresAt || a.callId.localeCompare(b.callId); });
    run.activeCalls = active;
    return active;
  }

  function refreshRunDeadline(run, at) {
    var active = normalizedActiveCalls(run, at);
    var idleDeadline = (Number.isFinite(run.lastActivityAt) ? run.lastActivityAt : at) + IDLE_MS;
    var leaseDeadline = active.reduce(function (latest, call) {
      return Math.max(latest, call.expiresAt);
    }, 0);
    run.deadlineAt = Math.max(idleDeadline, leaseDeadline);
    return { idleDeadline: idleDeadline, leaseDeadline: leaseDeadline, deadlineAt: run.deadlineAt };
  }

  function normalizedTabId(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return parseInt(value, 10);
    return null;
  }

  function logicalTabFor(run, tabId) {
    run.tabIds = Array.isArray(run.tabIds) ? run.tabIds : [];
    run.logicalTabs = run.logicalTabs && typeof run.logicalTabs === 'object' ? run.logicalTabs : {};
    if (tabId === null) return run.tabIds.length ? run.logicalTabs[String(run.tabIds[0])] || 'primary' : 'primary';
    var key = String(tabId);
    if (run.logicalTabs[key]) return run.logicalTabs[key];
    if (run.tabIds.indexOf(tabId) === -1) run.tabIds.push(tabId);
    var logical = run.tabIds.indexOf(tabId) === 0 ? 'primary' : 'tab-' + String(run.tabIds.indexOf(tabId) + 1);
    run.logicalTabs[key] = logical;
    if (run.tabId === null || run.tabId === undefined) run.tabId = tabId;
    return logical;
  }

  function safeTask(entry) {
    var value = typeof entry.task === 'string' && entry.task.trim()
      ? entry.task.trim()
      : (typeof entry.tool === 'string' && entry.tool ? entry.tool : 'MCP agent session');
    return value.slice(0, 2000);
  }

  function normalizedTaskSource(value) {
    return Object.prototype.hasOwnProperty.call(TASK_SOURCE_PRIORITY, value) ? value : 'tool';
  }

  function normalizedResultProjection(value) {
    return value === RESULT_PROJECTION_ACTION || value === RESULT_PROJECTION_FULL ? value : null;
  }

  function promoteTask(run, entry) {
    var incomingSource = normalizedTaskSource(entry && entry.taskSource);
    var currentSource = normalizedTaskSource(run && run.taskSource);
    if (TASK_SOURCE_PRIORITY[incomingSource] <= TASK_SOURCE_PRIORITY[currentSource]) return false;
    run.task = safeTask(entry || {});
    run.taskSource = incomingSource;
    return true;
  }

  function newRun(entry, at) {
    var suffix = String(entry.recordingRunId).replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || uuid().slice(0, 8);
    var unique = uuid().replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
    return {
      id: 'session_' + String(at) + '_' + suffix + '_' + unique,
      runId: null,
      schemaVersion: SCHEMA_VERSION,
      storageBackend: STORAGE_BACKEND,
      type: 'recording',
      parentRunId: null,
      agentId: entry.agentId,
      recordingRunId: entry.recordingRunId,
      task: safeTask(entry),
      taskSource: normalizedTaskSource(entry.taskSource),
      client: typeof entry.client === 'string' && entry.client ? entry.client : 'unknown',
      mode: 'mcp-agent',
      status: 'running',
      outcome: null,
      outcomeDetails: null,
      startTime: at,
      endTime: null,
      lastActivityAt: at,
      deadlineAt: at + IDLE_MS,
      nextSequence: 0,
      eventCount: 0,
      runStartWritten: false,
      budgetMarkerWritten: false,
      actionCount: 0,
      replaySourceCount: 0,
      tabId: null,
      tabIds: [],
      logicalTabs: {},
      startUrl: entry.replayContext && entry.replayContext.targetUrl || null,
      startOrigin: entry.replayContext && entry.replayContext.targetOrigin || null,
      lastUrl: null,
      recordingState: 'healthy',
      degradedReason: null,
      replayTrusted: true,
      replayIntegrity: 'pending',
      replay: null,
      lastReplayRunId: null,
      activeCalls: []
    };
  }

  function stripInternalPayload(payload) {
    var next = clone(payload, {});
    if (!next || typeof next !== 'object' || Array.isArray(next)) return {};
    INTERNAL_PAYLOAD_KEYS.forEach(function (key) { delete next[key]; });
    if (next.visualSession && typeof next.visualSession === 'object') {
      next.visualSession = {
        isFinal: next.visualSession.isFinal === true,
        visualReason: typeof next.visualSession.visualReason === 'string'
          ? next.visualSession.visualReason.slice(0, 2000)
          : undefined
      };
    }
    return next;
  }

  function buildIndexEntry(run) {
    return {
      id: run.id,
      task: run.task,
      taskSource: run.taskSource || null,
      startTime: run.startTime,
      endTime: run.endTime,
      status: run.status,
      actionCount: run.actionCount || 0,
      eventCount: run.eventCount || 0,
      domSnapshotCount: 0,
      mode: 'mcp-agent',
      mcpClient: run.client || null,
      taskRunId: run.id,
      recordingRunId: run.recordingRunId,
      agentId: run.agentId,
      tabIds: Array.isArray(run.tabIds) ? run.tabIds.slice() : [],
      tabCount: Array.isArray(run.tabIds) ? run.tabIds.length : 0,
      storageBackend: STORAGE_BACKEND,
      schemaVersion: SCHEMA_VERSION,
      recordingState: run.recordingState || 'healthy',
      degradedReason: run.degradedReason || null,
      replayTrusted: run.replayTrusted !== false,
      replayIntegrity: run.replayIntegrity || null,
      replayProvenance: 'capture',
      replayableCount: run.replay && run.replay.counts ? run.replay.counts.executable || 0 : 0,
      replayBlockedCount: run.replay && run.replay.counts ? run.replay.counts.blocked || 0 : 0,
      outcome: run.outcome || null,
      outcomeDetails: run.outcomeDetails || null,
      result: run.result || null,
      completionMessage: run.completionMessage || null,
      error: run.error || null,
      blocker: run.blocker || null,
      nextStep: run.nextStep || null,
      journalGap: run.journalGap === true
    };
  }

  function resolveLocalStorage() {
    if (_localStorageShim) return _localStorageShim;
    return globalScope.chrome && globalScope.chrome.storage && globalScope.chrome.storage.local || null;
  }

  async function withSessionStorageLock(fn) {
    var logger = globalScope.automationLogger;
    if (logger && typeof logger.withSessionMutationLock === 'function') {
      return logger.withSessionMutationLock(fn);
    }
    return fn();
  }

  // chrome.storage is a rebuildable history projection. Its failures never
  // escape into the durable IndexedDB journal error path.
  async function attemptIndexProjection(fn, reconcilesAll) {
    try {
      await fn();
      if (reconcilesAll === true) _indexProjectionDirty = false;
      return true;
    } catch (_error) {
      _indexProjectionDirty = true;
      return false;
    }
  }

  async function writeJournalIndex(runs) {
    var storage = resolveLocalStorage();
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') return true;
    return attemptIndexProjection(async function () {
      await withSessionStorageLock(async function () {
        var stored = await storage.get(['fsbSessionIndex']);
        var index = Array.isArray(stored && stored.fsbSessionIndex) ? stored.fsbSessionIndex : [];
        var persistedCorrelations = new Set((runs || []).map(correlationKey));
        var preserved = index.filter(function (entry) {
          if (!entry || entry.storageBackend !== STORAGE_BACKEND) return true;
          return entry.journalGap === true && !persistedCorrelations.has(correlationKey(entry));
        });
        var journalEntries = (runs || []).map(buildIndexEntry);
        var next = preserved.concat(journalEntries);
        next.sort(function (a, b) {
          return (Number(b && b.startTime) || 0) - (Number(a && a.startTime) || 0);
        });
        await storage.set({ fsbSessionIndex: next });
      });
    }, true);
  }

  async function reconcileJournalIndex() {
    try {
      return await writeJournalIndex(await backend().listRecordingRuns());
    } catch (_error) {
      _indexProjectionDirty = true;
      return false;
    }
  }

  async function upsertIndex(run) {
    if (_indexProjectionDirty) return reconcileJournalIndex();
    var storage = resolveLocalStorage();
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') return true;
    return attemptIndexProjection(async function () {
      await withSessionStorageLock(async function () {
        var stored = await storage.get(['fsbSessionIndex']);
        var index = Array.isArray(stored && stored.fsbSessionIndex) ? stored.fsbSessionIndex : [];
        var entry = buildIndexEntry(run);
        var at = index.findIndex(function (candidate) { return candidate && candidate.id === run.id; });
        if (at === -1) index.unshift(entry); else index[at] = entry;
        index.sort(function (a, b) { return (Number(b && b.startTime) || 0) - (Number(a && a.startTime) || 0); });
        await storage.set({ fsbSessionIndex: index });
      });
    }, false);
  }

  async function removeIndexEntries(ids) {
    var storage = resolveLocalStorage();
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') return true;
    var idSet = new Set(ids || []);
    return attemptIndexProjection(async function () {
      await withSessionStorageLock(async function () {
        var stored = await storage.get(['fsbSessionIndex']);
        var index = Array.isArray(stored && stored.fsbSessionIndex) ? stored.fsbSessionIndex : [];
        await storage.set({ fsbSessionIndex: index.filter(function (entry) { return !idSet.has(entry && entry.id); }) });
      });
    }, false);
  }

  async function findPersistedGap(entry) {
    var storage = resolveLocalStorage();
    if (!storage || typeof storage.get !== 'function') return null;
    try {
      var stored = await storage.get(['fsbSessionIndex']);
      var index = Array.isArray(stored && stored.fsbSessionIndex) ? stored.fsbSessionIndex : [];
      var row = index.find(function (candidate) {
        return candidate && candidate.journalGap === true &&
          candidate.storageBackend === STORAGE_BACKEND &&
          candidate.agentId === entry.agentId &&
          candidate.recordingRunId === entry.recordingRunId;
      });
      return row ? { reason: 'journal_append_failed', summaryId: row.id } : null;
    } catch (_error) {
      return null;
    }
  }

  function resolveAlarms() {
    if (_alarmShim) return _alarmShim;
    return globalScope.chrome && globalScope.chrome.alarms || null;
  }

  async function armIdle(run) {
    var alarms = resolveAlarms();
    if (!alarms || typeof alarms.create !== 'function') return;
    await Promise.resolve(alarms.create(IDLE_ALARM_PREFIX + run.id, { when: run.deadlineAt })).catch(function () {});
  }

  async function clearIdle(runId) {
    var alarms = resolveAlarms();
    if (!alarms || typeof alarms.clear !== 'function') return;
    await Promise.resolve(alarms.clear(IDLE_ALARM_PREFIX + runId)).catch(function () {});
  }

  async function scheduleRetentionAlarm() {
    var alarms = resolveAlarms();
    if (!alarms || typeof alarms.create !== 'function') return;
    await Promise.resolve(alarms.create(RETENTION_ALARM, {
      delayInMinutes: RETENTION_ALARM_MINUTES,
      periodInMinutes: RETENTION_ALARM_MINUTES
    })).catch(function () {});
  }

  function enqueueWrite(fn) {
    var next = _writeQueue.then(fn, fn);
    _writeQueue = next.catch(function () {});
    return next;
  }

  async function hasNonterminalDescendant(runId, seen) {
    seen = seen || new Set();
    if (seen.has(runId)) return false;
    seen.add(runId);
    var children = await backend().listChildRuns(runId);
    for (var i = 0; i < children.length; i++) {
      if (!Number.isFinite(children[i].endTime)) return true;
      if (await hasNonterminalDescendant(children[i].id, seen)) return true;
    }
    return false;
  }

  async function forceDeleteRunTree(runId, deleted, seen) {
    deleted = deleted || [];
    seen = seen || new Set();
    if (seen.has(runId)) return deleted;
    seen.add(runId);
    var store = backend();
    var children = await store.listChildRuns(runId);
    for (var i = 0; i < children.length; i++) {
      await forceDeleteRunTree(children[i].id, deleted, seen);
    }
    await store.deleteRun(runId);
    await clearIdle(runId);
    deleted.push(runId);
    return deleted;
  }

  async function automaticallyDeleteRunTree(runId) {
    if (await hasNonterminalDescendant(runId)) return false;
    await forceDeleteRunTree(runId);
    return true;
  }

  async function pruneCountNow() {
    var roots = await backend().listRecordingRuns();
    if (roots.length <= SESSION_HISTORY_CAP) return [];
    roots.sort(function (a, b) {
      var timeDelta = (Number(b && b.startTime) || 0) - (Number(a && a.startTime) || 0);
      return timeDelta || String(a && a.id || '').localeCompare(String(b && b.id || ''));
    });

    var protectedIds = new Set();
    for (var i = 0; i < roots.length; i++) {
      if (roots[i].status === 'running' || await hasNonterminalDescendant(roots[i].id)) {
        protectedIds.add(roots[i].id);
      }
    }

    var retainedIds = new Set(protectedIds);
    for (var r = 0; r < roots.length && retainedIds.size < SESSION_HISTORY_CAP; r++) {
      retainedIds.add(roots[r].id);
    }

    var removed = [];
    for (var d = 0; d < roots.length; d++) {
      if (retainedIds.has(roots[d].id)) continue;
      if (await automaticallyDeleteRunTree(roots[d].id)) removed.push(roots[d].id);
    }
    return removed;
  }

  async function maintainCountAndIndexBestEffort() {
    try {
      await pruneCountNow();
    } catch (_error) {
      // Retention maintenance retries on the next write, startup, or alarm.
    }
    return reconcileJournalIndex();
  }

  async function pruneNow(retentionDays) {
    var days = Number.isFinite(retentionDays) ? retentionDays : RETENTION_DEFAULT_DAYS;
    days = Math.min(365, Math.max(1, Math.floor(days)));
    var cutoff = nowMs() - days * 24 * 60 * 60 * 1000;
    var expired = await backend().listClosedOldest(cutoff);
    var ids = [];
    for (var i = 0; i < expired.length; i++) {
      if (expired[i].type === 'replay' && expired[i].parentRunId) continue;
      if (await automaticallyDeleteRunTree(expired[i].id)) ids.push(expired[i].id);
    }
    var countRemoved = await pruneCountNow();
    for (var c = 0; c < countRemoved.length; c++) {
      if (ids.indexOf(countRemoved[c]) === -1) ids.push(countRemoved[c]);
    }
    await reconcileJournalIndex();
    return { removed: ids.length, ids: ids };
  }

  function prune(retentionDays) {
    return enqueueWrite(function () { return pruneNow(retentionDays); });
  }

  async function ensureBudget(requiredBytes, protectedRunIds) {
    var store = backend();
    var protectedIds = new Set(protectedRunIds || []);
    requiredBytes = accountedBytes(requiredBytes);
    var total = await store.getTotalBytes();
    if (total + requiredBytes <= MAX_ENCODED_BYTES) return true;
    var closed = await store.listClosedOldest(null);
    var removed = [];
    for (var i = 0; i < closed.length && total + requiredBytes > MAX_ENCODED_BYTES; i++) {
      if (closed[i].type === 'replay' && closed[i].parentRunId) continue;
      if (protectedIds.has(closed[i].id)) continue;
      if (await automaticallyDeleteRunTree(closed[i].id)) removed.push(closed[i].id);
      total = await store.getTotalBytes();
    }
    if (removed.length) await reconcileJournalIndex();
    return total + requiredBytes <= MAX_ENCODED_BYTES;
  }

  function terminalFields(outcome) {
    if (!outcome || typeof outcome !== 'object') return {};
    return {
      status: outcome.status || (outcome.outcome === 'failure' ? 'failed' : 'completed'),
      outcome: outcome.outcome || null,
      outcomeDetails: {
        outcome: outcome.outcome || null,
        reason: outcome.reason || (outcome.outcome === 'failure' ? 'error' : 'completed'),
        summary: outcome.summary || null,
        blocker: outcome.blocker || null,
        nextStep: outcome.nextStep || null,
        result: outcome.outcome === 'failure' ? null : outcome.text || null,
        error: outcome.error || null
      },
      result: outcome.summary || null,
      completionMessage: outcome.outcome === 'failure' ? null : outcome.text || null,
      error: outcome.error || null,
      blocker: outcome.blocker || null,
      nextStep: outcome.nextStep || null
    };
  }

  function journalCallIdentityConflict() {
    var error = new Error('Journal call ID belongs to a different recording identity');
    error.code = 'journal_call_identity_conflict';
    return error;
  }

  async function resolveExistingCall(store, entry) {
    if (!entry || typeof entry.recordingCallId !== 'string' || !entry.recordingCallId) return null;
    var event = await store.getEventByCallId(entry.recordingCallId);
    if (!event) return null;
    var run = await store.getRun(event.runId);
    if (!run) throw new Error('Journal call references a missing run');
    var metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
    if (event.callId !== entry.recordingCallId ||
        metadata.callId !== entry.recordingCallId ||
        metadata.agentId !== entry.agentId ||
        metadata.recordingRunId !== entry.recordingRunId ||
        run.agentId !== entry.agentId ||
        run.recordingRunId !== entry.recordingRunId) {
      throw journalCallIdentityConflict();
    }
    return { event: event, run: run };
  }

  async function recordDispatchNow(entry, outcome) {
    var at = nowMs();
    var store = backend();
    var resolvedCall = await resolveExistingCall(store, entry);
    var existingCall = resolvedCall && resolvedCall.event;
    if (existingCall && !outcome) {
      return { recorded: false, deduplicated: true, sessionId: existingCall.runId };
    }
    var run = existingCall
      ? resolvedCall.run
      : await store.getRunByCorrelation(entry.agentId, entry.recordingRunId);
    var isNew = !run || (Number(run.eventCount) || 0) === 0;
    if (!run) run = newRun(entry, at);
    normalizedActiveCalls(run, at);
    // A durable call lease can create an event-free placeholder before the
    // first routed dispatch. Let that dispatch replace the placeholder's tool
    // title when it carries a higher-authority task source.
    var taskPromoted = promoteTask(run, entry);
    run.runId = run.id;
    if (existingCall && run.status !== 'running') {
      return { recorded: false, deduplicated: true, sessionId: run.id, run: run };
    }
    var closeWithOutcome = !!outcome && run.status === 'running';
    var gapKey = correlationKey(entry);
    var priorGap = _recordingGaps.get(gapKey) || (isNew && !existingCall ? await findPersistedGap(entry) : null);
    if (priorGap) {
      run.recordingState = 'degraded';
      run.degradedReason = 'journal_append_failed';
      run.replayTrusted = false;
      run.replayIntegrity = 'degraded';
    }
    var events = [];
    var artifacts = [];
    var selectedRequiredBytes = 0;

    if (!existingCall) {
      var tabId = normalizedTabId(entry.tabId);
      var logicalTab = logicalTabFor(run, tabId);
      var requestPrepared = await preparePayload(stripInternalPayload(entry.requestPayload || {}));
      var resultPrepared = await preparePayload(entry.response === undefined ? null : entry.response);
      var context = clone(entry.replayContext || {}, {});
      context.logicalTab = logicalTab;
      var metadata = {
        schemaVersion: SCHEMA_VERSION,
        agentId: run.agentId,
        recordingRunId: run.recordingRunId,
        callId: entry.recordingCallId || null,
        tool: entry.tool || '',
        route: entry.dispatcher_route || 'unknown',
        client: entry.client || run.client,
        taskSource: normalizedTaskSource(entry.taskSource),
        resultProjection: normalizedResultProjection(entry.resultProjection),
        success: entry.success !== false,
        tabId: tabId,
        logicalTab: logicalTab,
        request: requestPrepared.descriptor,
        result: resultPrepared.descriptor,
        replayContext: context,
        redactedInputs: entry.redactedInputs === true,
        targetRedacted: entry.targetRedacted === true,
        lateAfterClose: run.status !== 'running'
      };
      var artifactRows = coalesceArtifacts([requestPrepared.artifact, resultPrepared.artifact].filter(Boolean));
      var startEvent = recordingStartEvent(run, at, run.nextSequence);
      var startRows = startEvent ? [startEvent] : [];
      var prospectiveEvent = makeEvent(run, run.nextSequence + startRows.length, 'tool.call', at, metadata);
      var fullRows = startRows.concat([prospectiveEvent]);
      var fullRequired = await bundleEncodedByteCost(store, fullRows, artifactRows);
      if (await ensureBudget(fullRequired, [run.id])) {
        events = fullRows;
        artifacts = artifactRows;
        selectedRequiredBytes = fullRequired;
      } else {
        omitArtifact(requestPrepared, 'budget');
        omitArtifact(resultPrepared, 'budget');
        metadata.storageBudgetExhausted = true;
        markStorageBudgetDegraded(run);
        if (run.budgetMarkerWritten !== true) {
          var compactEvent = makeEvent(run, run.nextSequence + startRows.length, 'tool.call', at, metadata);
          var compactRows = startRows.concat([compactEvent]);
          var compactRequired = await bundleEncodedByteCost(store, compactRows, []);
          if (await ensureBudget(compactRequired, [run.id])) {
            events = compactRows;
            selectedRequiredBytes = compactRequired;
            run.budgetMarkerWritten = true;
          }
        }
      }
      var appendedSourceEvent = events.some(function (event) { return event.kind === 'tool.call'; });
      var replayInvalidated = false;
      if (events.length) {
        applyPersistedEvents(run, events);
        run.actionCount++;
        if (entry.tool !== 'complete_task' && entry.tool !== 'partial_task' && entry.tool !== 'fail_task' && entry.tool !== 'mcp:task-status') {
          run.replaySourceCount++;
        }
        if (appendedSourceEvent) replayInvalidated = invalidateReplayMetadata(run);
      }
      if (metadata.lateAfterClose) {
        run.recordingState = 'degraded';
        run.degradedReason = 'late_post_terminal_event';
        run.replayTrusted = false;
        run.replayIntegrity = 'degraded';
      }
      if (!run.startUrl && context.targetUrl) run.startUrl = context.targetUrl;
      if (!run.startOrigin && context.targetOrigin) run.startOrigin = context.targetOrigin;
      var requestParams = entry.requestPayload && entry.requestPayload.params || {};
      if (entry.tool === 'navigate' && entry.success !== false && typeof requestParams.url === 'string') {
        run.lastUrl = requestParams.url;
      }
    }

    if (closeWithOutcome) {
      var fields = terminalFields(outcome);
      Object.keys(fields).forEach(function (key) { run[key] = fields[key]; });
      run.endTime = at;
      run.lastActivityAt = at;
      run.deadlineAt = null;
      run.activeCalls = [];
      run.replayIntegrity = run.replayTrusted === false ? 'degraded' : 'pending';
      var terminalStart = recordingStartEvent(run, at, run.nextSequence);
      var terminalRows = terminalStart ? [terminalStart] : [];
      terminalRows.push(makeEvent(run, run.nextSequence + terminalRows.length,
        outcome.outcome === 'failure' ? 'run.failed' : 'run.complete', at, {
        schemaVersion: SCHEMA_VERSION,
        agentId: run.agentId,
        recordingRunId: run.recordingRunId,
        outcome: clone(outcome, {})
      }));
      var terminalRequired = selectedRequiredBytes + eventRowsByteCost(terminalRows);
      if (await ensureBudget(terminalRequired, [run.id])) {
        events = events.concat(terminalRows);
        selectedRequiredBytes = terminalRequired;
        applyPersistedEvents(run, terminalRows);
      } else {
        markStorageBudgetDegraded(run);
      }
    } else if (run.status === 'running') {
      run.lastActivityAt = at;
      refreshRunDeadline(run, at);
    }

    await store.putBundle(run, events, artifacts);
    if (priorGap) {
      _recordingGaps.delete(gapKey);
      if (priorGap.summaryId) await removeIndexEntries([priorGap.summaryId]);
    }
    if (isNew || closeWithOutcome) {
      await maintainCountAndIndexBestEffort();
    } else if (taskPromoted || run.recordingState === 'degraded' || replayInvalidated) {
      await upsertIndex(run);
    }
    if (closeWithOutcome) {
      await clearIdle(run.id);
      if (run.replayTrusted !== false && globalScope.FsbLatticeReplay &&
          typeof globalScope.FsbLatticeReplay.sealPersistedSession === 'function') {
        Promise.resolve(globalScope.FsbLatticeReplay.sealPersistedSession(run.id)).catch(function () {});
      }
    } else if (run.status === 'running') {
      await armIdle(run);
    }
    return { recorded: true, sessionId: run.id, run: run };
  }

  async function persistDegradedSummary(entry, error) {
    var at = nowMs();
    var key = correlationKey(entry);
    var priorGap = _recordingGaps.get(key);
    var summaryId = priorGap && priorGap.summaryId ||
      'session_' + String(at) + '_degraded_' + String(entry.recordingRunId || '').slice(0, 8) + '_' + uuid().slice(-8);
    _recordingGaps.set(key, {
      reason: error && error.message ? error.message.slice(0, 500) : 'journal_append_failed',
      summaryId: summaryId
    });
    try {
      var existing = await backend().getRunByCorrelation(entry.agentId, entry.recordingRunId);
      if (existing) {
        existing.recordingState = 'degraded';
        existing.degradedReason = 'journal_append_failed';
        existing.replayTrusted = false;
        existing.replayIntegrity = 'degraded';
        await backend().updateRun(existing);
        await upsertIndex(existing);
        _recordingGaps.delete(key);
        return;
      }
    } catch (_existingError) { /* fall through to diagnostics-only summary */ }
    var run = {
      id: summaryId,
      recordingRunId: entry.recordingRunId || null,
      agentId: entry.agentId || null,
      task: safeTask(entry),
      client: entry.client || 'unknown',
      startTime: at,
      endTime: at,
      status: 'stopped',
      actionCount: 0,
      eventCount: 0,
      tabIds: [],
      recordingState: 'degraded',
      degradedReason: _recordingGaps.get(key).reason,
      replayTrusted: false,
      replayIntegrity: 'degraded',
      journalGap: true
    };
    try { await upsertIndex(run); } catch (_error) { /* diagnostics only */ }
  }

  function validCallIdentity(identity) {
    return !!(identity && typeof identity.agentId === 'string' && identity.agentId &&
      validRunSidecar(identity.recordingRunId) && validCallSidecar(identity.recordingCallId));
  }

  function beginCall(identity, leaseMs) {
    return enqueueWrite(async function () {
      if (!validCallIdentity(identity)) return { accepted: false, reason: 'invalid_identity' };
      var at = nowMs();
      var store = backend();
      var run = await store.getRunByCorrelation(identity.agentId, identity.recordingRunId);
      var created = !run;
      if (!run) run = newRun(identity, at);
      if (run.status !== 'running') {
        return { accepted: false, terminal: true, sessionId: run.id };
      }

      var active = normalizedActiveCalls(run, at);
      var expiresAt = at + normalizedLeaseMs(leaseMs);
      var existing = active.find(function (call) { return call.callId === identity.recordingCallId; });
      if (existing) existing.expiresAt = Math.max(existing.expiresAt, expiresAt);
      else active.push({ callId: identity.recordingCallId, expiresAt: expiresAt });
      run.activeCalls = active;
      refreshRunDeadline(run, at);
      await store.updateRun(run);
      await armIdle(run);
      return { accepted: true, created: created, sessionId: run.id, expiresAt: expiresAt };
    });
  }

  function endCall(identity) {
    return enqueueWrite(async function () {
      if (!validCallIdentity(identity)) return { ended: false, reason: 'invalid_identity' };
      var at = nowMs();
      var store = backend();
      var run = await store.getRunByCorrelation(identity.agentId, identity.recordingRunId);
      if (!run) return { ended: false, reason: 'missing' };

      var priorActiveCount = Array.isArray(run.activeCalls) ? run.activeCalls.length : 0;
      var active = normalizedActiveCalls(run, at).filter(function (call) {
        return call.callId !== identity.recordingCallId;
      });
      run.activeCalls = active;
      if (run.status !== 'running') {
        if (active.length !== priorActiveCount) await store.updateRun(run);
        return { ended: true, terminal: true, sessionId: run.id };
      }

      if ((Number(run.eventCount) || 0) === 0
          && active.length === 0
          && run.recordingState === 'healthy'
          && run.degradedReason === null) {
        await store.deleteRun(run.id);
        await clearIdle(run.id);
        await removeIndexEntries([run.id]);
        return { ended: true, removedPlaceholder: true, sessionId: run.id };
      }

      var deadline = refreshRunDeadline(run, at);
      if (deadline.deadlineAt <= at) {
        await closeIdleRun(run);
        return { ended: true, closed: true, sessionId: run.id };
      }
      await store.updateRun(run);
      await armIdle(run);
      return { ended: true, sessionId: run.id, deadlineAt: run.deadlineAt };
    });
  }

  function recordDispatch(entry) {
    return enqueueWrite(function () {
      return recordDispatchNow(entry, null);
    }).catch(function (error) {
      return markRecordingGap(entry || {}, error).then(function () {
        return { recorded: false, degraded: true, error: error && error.message };
      });
    });
  }

  function markRecordingGap(identity, error) {
    var source = identity && typeof identity === 'object' ? identity : {};
    var entry = {
      agentId: typeof source.agentId === 'string' ? source.agentId : '',
      recordingRunId: typeof source.recordingRunId === 'string' ? source.recordingRunId : '',
      client: typeof source.client === 'string' ? source.client : 'unknown',
      task: typeof source.task === 'string' ? source.task : '',
      tool: typeof source.tool === 'string' ? source.tool : ''
    };
    return enqueueWrite(function () {
      return persistDegradedSummary(entry, error);
    });
  }

  function degradeOpenRuns(reason) {
    var degradedReason = typeof reason === 'string' && reason ? reason : 'recording_disabled';
    return enqueueWrite(async function () {
      var store = backend();
      var open = await store.listOpenRuns();
      var ids = [];
      for (var i = 0; i < open.length; i++) {
        var run = open[i];
        if (!run || run.type !== 'recording') continue;
        run.recordingState = 'degraded';
        run.degradedReason = degradedReason;
        run.replayTrusted = false;
        run.replayIntegrity = 'degraded';
        await store.updateRun(run);
        await upsertIndex(run);
        ids.push(run.id);
      }
      return { degraded: ids.length, ids: ids };
    });
  }

  async function hasCall(agentId, recordingRunId, recordingCallId) {
    if (typeof recordingCallId !== 'string' || !recordingCallId) return false;
    return !!(await resolveExistingCall(backend(), {
      agentId: agentId,
      recordingRunId: recordingRunId,
      recordingCallId: recordingCallId
    }));
  }

  function recordTaskOutcome(entry, outcome) {
    return enqueueWrite(function () {
      return recordDispatchNow(entry, outcome);
    }).then(async function (result) {
      if (!result || !result.run) return result;
      var events = await backend().getAllEvents(result.run.id);
      var tools = events.filter(function (event) { return event.kind === 'tool.call'; })
        .slice(-100).map(function (event) { return event.metadata && event.metadata.tool || ''; }).filter(Boolean);
      result.candidate = {
        sessionId: result.run.id,
        agentId: result.run.agentId,
        tabId: result.run.tabId,
        tabIds: result.run.tabIds || [],
        task: result.run.task,
        client: result.run.client,
        startTime: result.run.startTime,
        endTime: result.run.endTime || nowMs(),
        closedAt: result.run.endTime || nowMs(),
        expiresAt: (result.run.endTime || nowMs()) + MEMORY_CANDIDATE_TTL_MS,
        lastUrl: result.run.lastUrl,
        actionCount: result.run.actionCount || 0,
        toolNames: tools
      };
      return result;
    }).catch(function (error) {
      return markRecordingGap(entry || {}, error).then(function () {
        return { recorded: false, degraded: true, error: error && error.message };
      });
    });
  }

  async function closeIdleRun(run) {
    if (!run || run.status !== 'running') return null;
    var at = nowMs();
    var store = backend();
    run.status = 'stopped';
    run.outcome = 'stopped';
    run.outcomeDetails = { outcome: 'stopped', reason: 'idle_timeout' };
    run.endTime = at;
    run.lastActivityAt = at;
    run.deadlineAt = null;
    run.activeCalls = [];
    run.replayIntegrity = run.replayTrusted === false ? 'degraded' : 'pending';
    var startEvent = recordingStartEvent(run, at, run.nextSequence);
    var rows = startEvent ? [startEvent] : [];
    rows.push(makeEvent(run, run.nextSequence + rows.length, 'run.complete', at, {
      schemaVersion: SCHEMA_VERSION,
      agentId: run.agentId,
      recordingRunId: run.recordingRunId,
      outcome: { outcome: 'stopped', status: 'stopped', reason: 'idle_timeout' }
    }));
    if (await ensureBudget(eventRowsByteCost(rows), [run.id])) {
      applyPersistedEvents(run, rows);
    } else {
      rows = [];
      markStorageBudgetDegraded(run);
    }
    await store.putBundle(run, rows, []);
    await clearIdle(run.id);
    await maintainCountAndIndexBestEffort();
    if (run.replayTrusted !== false && globalScope.FsbLatticeReplay &&
        typeof globalScope.FsbLatticeReplay.sealPersistedSession === 'function') {
      Promise.resolve(globalScope.FsbLatticeReplay.sealPersistedSession(run.id)).catch(function () {});
    }
    return run;
  }

  function handleAlarm(alarm, retentionDays) {
    return enqueueWrite(async function () {
      if (!alarm || typeof alarm.name !== 'string') return { handled: false };
      if (alarm.name === RETENTION_ALARM) {
        var pruned = await pruneNow(retentionDays);
        return { handled: true, action: 'retention_pruned', removed: pruned.removed };
      }
      if (alarm.name.indexOf(IDLE_ALARM_PREFIX) !== 0) return { handled: false };
      var id = alarm.name.slice(IDLE_ALARM_PREFIX.length);
      var run = await backend().getRun(id);
      if (!run) return { handled: true, action: 'missing' };
      var at = nowMs();
      var priorCalls = Array.isArray(run.activeCalls) ? run.activeCalls.length : 0;
      var priorDeadline = run.deadlineAt;
      var deadline = run.status === 'running' ? refreshRunDeadline(run, at) : null;
      if (run.status === 'running' && deadline.deadlineAt <= at) {
        await closeIdleRun(run);
        return { handled: true, action: 'closed', sessionId: id };
      }
      if (run.status === 'running') {
        if (priorCalls !== run.activeCalls.length || priorDeadline !== deadline.deadlineAt) {
          await backend().updateRun(run);
        }
        await armIdle(run);
      }
      return { handled: true, action: run.status === 'running' ? 'rearmed' : 'already_closed' };
    });
  }

  async function initialize(retentionDays) {
    await scheduleRetentionAlarm();
    return enqueueWrite(async function () {
      await pruneNow(retentionDays);
      var open = await backend().listOpenRuns();
      for (var i = 0; i < open.length; i++) {
        var run = open[i];
        if (!run || run.type !== 'recording') continue;
        var at = nowMs();
        var priorCalls = Array.isArray(run.activeCalls) ? run.activeCalls.length : 0;
        var priorDeadline = run.deadlineAt;
        var deadline = refreshRunDeadline(run, at);
        if (deadline.deadlineAt <= at) {
          await closeIdleRun(run);
        } else {
          if (priorCalls !== run.activeCalls.length || priorDeadline !== deadline.deadlineAt) {
            await backend().updateRun(run);
          }
          await armIdle(run);
        }
      }
      await reconcileJournalIndex();
    });
  }

  function eventForDetail(event) {
    var out = clone(event, {});
    if (out.metadata && out.metadata.request && out.metadata.request.storage === 'artifact') {
      delete out.metadata.request.inline;
    }
    if (out.metadata && out.metadata.result && out.metadata.result.storage === 'artifact') {
      delete out.metadata.result.inline;
    }
    return out;
  }

  async function getSessionDetail(input) {
    input = input || {};
    var sessionId = String(input.sessionId || '');
    var run = await backend().getRun(sessionId);
    if (!run || run.type !== 'recording') return null;
    var after = Number.isFinite(input.afterSequence) ? input.afterSequence : -1;
    var limit = Number.isFinite(input.limit) ? Math.floor(input.limit) : DETAIL_DEFAULT_LIMIT;
    limit = Math.max(1, Math.min(DETAIL_MAX_LIMIT, limit));
    var rows = await backend().getEvents(sessionId, after, limit + 1);
    var hasMore = rows.length > limit;
    if (hasMore) rows = rows.slice(0, limit);
    return {
      session: buildIndexEntry(run),
      events: rows.map(eventForDetail),
      nextSequence: hasMore && rows.length ? rows[rows.length - 1].sequence : null,
      hasMore: hasMore
    };
  }

  function verifyDescriptorMetadata(descriptor, digest, bytes) {
    if (!descriptor || descriptor.sha256 !== digest ||
        !Number.isFinite(descriptor.byteLength) || descriptor.byteLength !== bytes.byteLength) {
      throw artifactCorruptError('Journal payload descriptor failed integrity verification');
    }
  }

  async function descriptorValue(descriptor) {
    if (!descriptor) return null;
    if (typeof descriptor !== 'object' || Array.isArray(descriptor)) {
      throw artifactCorruptError('Journal payload descriptor is malformed');
    }
    if (descriptor.storage === 'omitted') return null;
    if (descriptor.storage === 'inline') {
      var canonical;
      try {
        canonical = stableJson(descriptor.inline);
      } catch (cause) {
        throw artifactCorruptError('Journal inline payload could not be canonicalized', cause);
      }
      var inlineBytes = textEncoder().encode(canonical);
      verifyDescriptorMetadata(descriptor, await sha256(inlineBytes), inlineBytes);
      return clone(descriptor.inline, null);
    }
    if (descriptor.storage !== 'artifact' || typeof descriptor.artifactId !== 'string' || !descriptor.artifactId) {
      throw artifactCorruptError('Journal payload descriptor is malformed');
    }
    var artifact = await backend().getArtifact(descriptor.artifactId);
    if (!artifact) return null;
    var bytes = await verifiedArtifactBytes(artifact);
    if (artifact.id !== descriptor.artifactId) {
      throw artifactCorruptError('Journal artifact descriptor points to the wrong payload');
    }
    verifyDescriptorMetadata(descriptor, artifact.id, bytes);
    try {
      return JSON.parse(textDecoder().decode(bytes));
    } catch (cause2) {
      throw artifactCorruptError('Journal artifact payload could not be decoded', cause2);
    }
  }

  function assertExportableDescriptor(descriptor) {
    if (!descriptor || descriptor.storage !== 'artifact') return;
    if (Number.isFinite(descriptor.byteLength) && descriptor.byteLength > EXPORT_ARTIFACT_MAX_BYTES) {
      var error = new Error('A recorded request or result exceeds the 32 MiB per-value export limit');
      error.code = 'journal_export_artifact_too_large';
      throw error;
    }
  }

  function markRunDegraded(runId, reason) {
    return enqueueWrite(async function () {
      var run = await backend().getRun(runId);
      if (!run) return null;
      run.recordingState = 'degraded';
      run.degradedReason = reason || 'artifact_corrupt';
      run.replayTrusted = false;
      run.replayIntegrity = 'degraded';
      await backend().updateRun(run);
      if (run.type === 'recording') await upsertIndex(run);
      return run;
    });
  }

  async function readSessionArtifact(input) {
    input = input || {};
    var run = await backend().getRun(String(input.sessionId || ''));
    if (!run) return null;
    var artifactId = String(input.artifactId || '');
    var rows = await backend().getAllEvents(run.id);
    var referenced = rows.some(function (event) { return payloadArtifactIds(event).indexOf(artifactId) !== -1; });
    if (!referenced) return null;
    var artifact = await backend().getArtifact(artifactId);
    if (!artifact) return null;
    var bytes;
    try {
      bytes = await verifiedArtifactBytes(artifact);
    } catch (error) {
      await markRunDegraded(run.id, error && error.code === 'artifact_corrupt' ? 'artifact_corrupt' : 'missing_artifact');
      throw error;
    }
    var offset = Math.max(0, Number.isFinite(input.offset) ? Math.floor(input.offset) : 0);
    var limit = Math.max(4, Math.min(ARTIFACT_READ_LIMIT, Number.isFinite(input.limit) ? Math.floor(input.limit) : ARTIFACT_READ_LIMIT));
    offset = Math.min(offset, bytes.byteLength);
    while (offset < bytes.byteLength && (bytes[offset] & 0xc0) === 0x80) offset++;
    var end = Math.min(bytes.byteLength, offset + limit);
    if (end < bytes.byteLength) {
      while (end > offset && (bytes[end] & 0xc0) === 0x80) end--;
      if (end === offset) end = Math.min(bytes.byteLength, offset + limit);
    }
    var chunk = textDecoder().decode(bytes.slice(offset, end));
    return {
      artifactId: artifactId,
      text: chunk,
      offset: offset,
      nextOffset: end < bytes.byteLength ? end : null,
      totalLength: bytes.byteLength,
      sha256: artifact.id,
      encoding: 'utf-8'
    };
  }

  function replayEntryFromEvent(event, requestValue, resultValue) {
    var metadata = event.metadata || {};
    return {
      tool: metadata.tool || '',
      requestPayload: requestValue || {},
      response: resultValue,
      success: metadata.success !== false,
      dispatcher_route: metadata.route || 'unknown',
      timestamp: Date.parse(event.timestamp),
      replayContext: clone(metadata.replayContext || {}, {}),
      resultProjection: normalizedResultProjection(metadata.resultProjection),
      redactedInputs: metadata.redactedInputs === true,
      targetRedacted: metadata.targetRedacted === true
    };
  }

  async function getReplayProjection(sessionId) {
    var run = await backend().getRun(sessionId);
    if (!run || run.type !== 'recording') return null;
    var rows = (await backend().getAllEvents(sessionId)).filter(function (event) {
      if (event.kind !== 'tool.call') return false;
      var tool = event.metadata && event.metadata.tool;
      return tool !== 'complete_task' && tool !== 'partial_task' && tool !== 'fail_task' && tool !== 'mcp:task-status';
    });
    var total = rows.length;
    rows = rows.slice(-100);
    var entries = [];
    var missingInput = false;
    var missingArtifact = false;
    var corruptArtifact = false;
    for (var i = 0; i < rows.length; i++) {
      var requestDescriptor = rows[i].metadata && rows[i].metadata.request;
      var resultDescriptor = rows[i].metadata && rows[i].metadata.result;
      var requestValue = null;
      var resultValue = null;
      if (!requestDescriptor || !resultDescriptor) {
        missingArtifact = true;
        corruptArtifact = true;
      }
      try { requestValue = await descriptorValue(requestDescriptor); } catch (requestError) {
        missingArtifact = true;
        corruptArtifact = corruptArtifact || requestError && requestError.code === 'artifact_corrupt';
      }
      try { resultValue = await descriptorValue(resultDescriptor); } catch (resultError) {
        missingArtifact = true;
        corruptArtifact = corruptArtifact || resultError && resultError.code === 'artifact_corrupt';
      }
      if (requestDescriptor && requestDescriptor.storage === 'omitted') missingInput = true;
      if (requestDescriptor && requestDescriptor.storage === 'artifact' && requestValue === null) missingArtifact = true;
      if (resultDescriptor && resultDescriptor.storage === 'artifact' && resultValue === null) missingArtifact = true;
      entries.push(replayEntryFromEvent(rows[i], requestValue, resultValue));
    }
    if (missingInput || missingArtifact) {
      run = await markRunDegraded(run.id, corruptArtifact ? 'artifact_corrupt' :
        (missingArtifact ? 'missing_artifact' : 'missing_replay_argument'));
      if (!run) return null;
    }
    return {
      session: Object.assign(buildIndexEntry(run), {
        sessionId: run.id,
        id: run.id,
        task: run.task,
        status: run.status,
        outcome: run.outcome,
        outcomeDetails: run.outcomeDetails,
        startTime: run.startTime,
        endTime: run.endTime,
        startUrl: run.startUrl,
        lastUrl: run.lastUrl,
        mode: run.mode,
        client: run.client,
        mcpClient: run.client
      }),
      entries: entries,
      totalSourceSteps: total,
      truncated: total > 100,
      replayTrusted: run.replayTrusted !== false
    };
  }

  function updateReplayMetadata(sessionId, replayRecord) {
    return enqueueWrite(async function () {
      var run = await backend().getRun(sessionId);
      if (!run) return null;
      var currentSourceStepCount = accountedBytes(run.replaySourceCount);
      var sealedSourceStepCount = replayRecord && Number.isFinite(replayRecord.sourceStepCount)
        ? accountedBytes(replayRecord.sourceStepCount)
        : (replayRecord && Number.isFinite(replayRecord.totalSourceSteps)
          ? accountedBytes(replayRecord.totalSourceSteps)
          : currentSourceStepCount);
      if (replayRecord && sealedSourceStepCount !== currentSourceStepCount) {
        var staleError = new Error('Replay source changed while it was being sealed');
        staleError.code = 'replay_source_changed';
        throw staleError;
      }
      run.replay = replayRecord ? {
        version: replayRecord.version,
        integrity: replayRecord.integrity,
        provenance: replayRecord.provenance,
        manifestHash: replayRecord.manifestHash || null,
        receipt: replayRecord.receipt || null,
        receiptCid: replayRecord.receiptCid || null,
        signerKid: replayRecord.signerKid || null,
        counts: clone(replayRecord.counts || {}, {}),
        error: replayRecord.error || null,
        sourceStepCount: sealedSourceStepCount,
        totalSourceSteps: replayRecord.totalSourceSteps || currentSourceStepCount,
        truncated: replayRecord.truncated === true || currentSourceStepCount > 100
      } : null;
      run.replayIntegrity = run.replay && run.replay.integrity || (run.replayTrusted === false ? 'degraded' : 'pending');
      await backend().updateRun(run);
      await upsertIndex(run);
      return clone(run.replay, null);
    });
  }

  async function getReplayMetadata(sessionId) {
    var run = await backend().getRun(sessionId);
    if (!run) return null;
    var replay = clone(run.replay, null);
    if (replay && run.lastReplayRunId) replay.lastRun = await materializeReplayRun(run.lastReplayRunId);
    return replay;
  }

  async function persistReplayRun(parentSessionId, replayRun) {
    return enqueueWrite(async function () {
      var store = backend();
      var parent = await store.getRun(parentSessionId);
      if (!parent) return false;
      var replayId = String(replayRun && replayRun.id || 'replay_' + uuid());
      var run = await store.getRun(replayId);
      var at = nowMs();
      if (!run) {
        run = {
          id: replayId, runId: replayId, schemaVersion: SCHEMA_VERSION,
          storageBackend: STORAGE_BACKEND, type: 'replay', parentRunId: parentSessionId,
          agentId: replayRun && replayRun.agentId || null, recordingRunId: null,
          task: parent.task, client: 'Replay', mode: 'replay', status: 'running',
          startTime: replayRun && replayRun.startedAt || at, endTime: null,
          nextSequence: 0, eventCount: 0, runStartWritten: false,
          persistedAttemptCount: 0, budgetMarkerWritten: false
        };
      }
      var attempts = Array.isArray(replayRun && replayRun.steps) ? replayRun.steps : [];
      var persistedAttemptCount = accountedBytes(run.persistedAttemptCount);
      var persistedNextStep = accountedBytes(run.nextStep);
      var incomingNextStep = replayRun && Number.isFinite(replayRun.nextStep)
        ? accountedBytes(replayRun.nextStep)
        : persistedNextStep;
      var incomingStatus = replayRun && replayRun.status || run.status;
      var incomingTerminal = isReplayTerminalStatus(incomingStatus);
      if (isReplayTerminalStatus(run.status)) return false;
      var progressRegressed = attempts.length < persistedAttemptCount || incomingNextStep < persistedNextStep;
      if (progressRegressed && !incomingTerminal) return false;

      var rows = [];
      var sequence = accountedBytes(run.nextSequence);
      if (!hasPersistedRunStart(run)) {
        rows.push(makeEvent(run, sequence++, 'run.start', at, {
          parentRunId: parentSessionId, manifestHash: replayRun && replayRun.manifestHash || null
        }));
      }
      if (!progressRegressed) {
        for (var i = persistedAttemptCount; i < attempts.length; i++) {
          rows.push(makeEvent(run, sequence++, 'tool.call', attempts[i].completedAt || at, {
            parentRunId: parentSessionId,
            replayAttempt: clone(attempts[i], {})
          }));
        }
      }
      run.persistedAttemptCount = progressRegressed ? persistedAttemptCount : attempts.length;
      run.status = incomingStatus;
      run.nextStep = progressRegressed ? persistedNextStep : incomingNextStep;
      if (!progressRegressed) {
        run.previousReceiptCid = replayRun && replayRun.previousReceiptCid || null;
        run.playback = clone(replayRun && replayRun.playback || null, null);
        run.targetTabId = replayRun && Number.isFinite(replayRun.targetTabId) ? replayRun.targetTabId : null;
        run.expectedOrigin = replayRun && replayRun.expectedOrigin || null;
        run.logicalTabs = clone(replayRun && replayRun.logicalTabs || null, null);
      }
      run.error = replayRun && replayRun.error || null;
      run.finishedAt = replayRun && replayRun.finishedAt || null;
      if (isReplayTerminalStatus(run.status)) {
        run.endTime = run.finishedAt || at;
        if (run.terminalEventWritten !== true && run.terminalEventOmitted !== true) {
          rows.push(makeEvent(run, sequence++, run.status === 'completed' || run.status === 'replay_completed'
            ? 'run.complete'
            : 'run.failed', run.endTime, {
            parentRunId: parentSessionId, status: run.status, error: run.error
          }));
        }
      }
      parent.lastReplayRunId = run.id;
      var rowsFit = !rows.length || await ensureBudget(eventRowsByteCost(rows), [parent.id, run.id]);
      if (rowsFit) {
        applyPersistedEvents(run, rows);
        if (rows.some(function (row) { return row.kind === 'run.complete' || row.kind === 'run.failed'; })) {
          run.terminalEventWritten = true;
        }
      } else {
        run.omittedAttemptCount = accountedBytes(run.omittedAttemptCount) + rows.filter(function (row) {
          return row.kind === 'tool.call';
        }).length;
        if (rows.some(function (row) { return row.kind === 'run.complete' || row.kind === 'run.failed'; })) {
          run.terminalEventOmitted = true;
        }
        rows = [];
        markStorageBudgetDegraded(run);
      }
      await store.putBundle(run, rows, [], [parent]);
      return true;
    });
  }

  async function materializeReplayRun(replayRunId) {
    var run = await backend().getRun(replayRunId);
    if (!run || run.type !== 'replay') return null;
    var events = await backend().getAllEvents(replayRunId);
    return {
      id: run.id,
      status: run.status,
      startedAt: run.startTime,
      finishedAt: run.finishedAt || run.endTime || null,
      error: run.error || null,
      nextStep: run.nextStep || 0,
      previousReceiptCid: run.previousReceiptCid || null,
      playback: clone(run.playback, null),
      targetTabId: Number.isFinite(run.targetTabId) ? run.targetTabId : null,
      expectedOrigin: run.expectedOrigin || null,
      logicalTabs: clone(run.logicalTabs, null),
      steps: events.filter(function (event) { return event.metadata && event.metadata.replayAttempt; })
        .map(function (event) { return clone(event.metadata.replayAttempt, {}); })
    };
  }

  async function deleteSession(sessionId) {
    return enqueueWrite(async function () {
      var run = await backend().getRun(sessionId);
      if (!run) return false;
      await forceDeleteRunTree(sessionId);
      await reconcileJournalIndex();
      return true;
    });
  }

  function clearSessions() {
    return enqueueWrite(async function () {
      var closed = await backend().listClosedOldest(null);
      var open = await backend().listOpenRuns();
      var all = closed.concat(open).filter(function (run) { return run.type === 'recording'; });
      for (var i = 0; i < all.length; i++) await forceDeleteRunTree(all[i].id);
      await reconcileJournalIndex();
      return true;
    });
  }

  async function hasSession(sessionId) {
    var run = await backend().getRun(sessionId);
    return !!(run && run.type === 'recording');
  }

  async function hasCorrelation(agentId, recordingRunId) {
    if (!validRunSidecar(recordingRunId) || typeof agentId !== 'string' || !agentId) return false;
    var run = await backend().getRunByCorrelation(agentId, recordingRunId);
    return !!(run && run.type === 'recording');
  }

  async function exportHumanReadable(sessionId) {
    var run = await backend().getRun(sessionId);
    if (!run || run.type !== 'recording') return 'Session not found.';
    var rows = (await backend().getAllEvents(sessionId)).filter(function (event) {
      return event.kind === 'tool.call';
    });
    var lines = [
      '================================================================================',
      'FSB MCP SESSION REPORT',
      '================================================================================',
      'Session ID: ' + sessionId,
      'Task: ' + (run.task || 'MCP agent session'),
      'Status: ' + (run.status || 'unknown'),
      'Recording: ' + (run.recordingState || 'healthy'),
      'Calls retained: ' + String(rows.length)
    ];
    if (run.replaySourceCount > 100) {
      lines.push('Executable replay: latest 100 of ' + String(run.replaySourceCount));
    }
    lines.push('');
    rows.forEach(function (event, index) {
      var metadata = event.metadata || {};
      lines.push((metadata.success === false ? '[FAILED] ' : '[OK] ') +
        'Call ' + String(index + 1) + ': ' + (metadata.tool || 'unknown'));
    });
    return lines.join('\n');
  }

  async function getReplayData(sessionId) {
    if (!globalScope.FsbLatticeReplay || typeof globalScope.FsbLatticeReplay.prepareReplay !== 'function') {
      return null;
    }
    var prepared = await globalScope.FsbLatticeReplay.prepareReplay(sessionId);
    var detail = await getSessionDetail({ sessionId: sessionId, afterSequence: -1, limit: 1 });
    var session = detail && detail.session || {};
    var steps = prepared && Array.isArray(prepared.steps) ? prepared.steps : [];
    return {
      version: prepared && prepared.replay && prepared.replay.version || '1.0',
      id: sessionId,
      metadata: {
        task: session.task,
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status,
        actionCount: steps.length,
        totalSourceSteps: prepared.totalSourceSteps || steps.length,
        truncated: prepared.truncated === true,
        integrity: prepared.replay && prepared.replay.integrity || 'pending',
        provenance: prepared.replay && prepared.replay.provenance || 'capture',
        manifestHash: prepared.replay && prepared.replay.manifestHash || null
      },
      steps: steps.map(function (record, index) {
        return {
          stepNumber: index + 1,
          timestamp: record.timestamp,
          action: { tool: record.tool, params: record.arguments || {} },
          targeting: {
            url: record.target && record.target.url || null,
            origin: record.target && record.target.origin || null,
            logicalTab: record.target && record.target.logicalTab || 'primary'
          },
          result: {
            success: record.success !== false,
            error: record.resultSummary && (record.resultSummary.error || record.resultSummary.message) || null,
            recorded: record.resultSummary || { resultHash: record.resultHash || null }
          },
          route: record.route || 'legacy',
          capability: record.capability || null,
          replay: record.replay || null
        };
      }),
      summary: {
        totalSteps: steps.length,
        totalSourceSteps: prepared.totalSourceSteps || steps.length,
        successfulSteps: steps.filter(function (row) { return row.success !== false; }).length,
        failedSteps: steps.filter(function (row) { return row.success === false; }).length,
        executableSteps: prepared.counts && prepared.counts.executable || 0,
        approvalRequiredSteps: prepared.counts && prepared.counts.approvalRequired || 0,
        blockedSteps: prepared.counts && prepared.counts.blocked || 0,
        truncated: prepared.truncated === true
      }
    };
  }

  async function streamSessionExport(sessionId, format, emit) {
    var run = await backend().getRun(sessionId);
    if (!run || typeof emit !== 'function') return false;
    async function emitChunked(value) {
      var text = String(value || '');
      var chunkSize = 256 * 1024;
      if (!text.length) return emit('');
      var bytes = textEncoder().encode(text);
      for (var offset = 0; offset < bytes.byteLength;) {
        var end = Math.min(bytes.byteLength, offset + chunkSize);
        if (end < bytes.byteLength) {
          while (end > offset && (bytes[end] & 0xc0) === 0x80) end--;
        }
        if (end === offset) end = Math.min(bytes.byteLength, offset + chunkSize);
        await emit(textDecoder().decode(bytes.slice(offset, end)));
        offset = end;
      }
    }
    if (format === 'text') {
      var lines = [
        '================================================================================',
        'FSB MCP SESSION REPORT',
        '================================================================================',
        'Session ID: ' + sessionId,
        'Task: ' + (run.task || 'MCP agent session'),
        'Status: ' + (run.status || 'unknown'),
        'Recording: ' + (run.recordingState || 'healthy'),
        'Calls retained: ' + String(Number(run.actionCount) || 0)
      ];
      if (run.replaySourceCount > 100) {
        lines.push('Executable replay: latest 100 of ' + String(run.replaySourceCount));
      }
      lines.push('');
      await emitChunked(lines.join('\n'));
      var textAfter = -1;
      var callIndex = 0;
      while (true) {
        var textRows = await backend().getEvents(sessionId, textAfter, DETAIL_MAX_LIMIT);
        if (!textRows.length) break;
        for (var t = 0; t < textRows.length; t++) {
          textAfter = textRows[t].sequence;
          if (textRows[t].kind !== 'tool.call') continue;
          var textMetadata = textRows[t].metadata || {};
          callIndex++;
          await emitChunked('\n' + (textMetadata.success === false ? '[FAILED] ' : '[OK] ') +
            'Call ' + String(callIndex) + ': ' + (textMetadata.tool || 'unknown'));
        }
        if (textRows.length < DETAIL_MAX_LIMIT) break;
      }
      return true;
    }
    await emitChunked('{"schemaVersion":2,"session":' + JSON.stringify(buildIndexEntry(run)) + ',"events":[');
    var after = -1;
    var first = true;
    while (true) {
      var rows = await backend().getEvents(sessionId, after, DETAIL_MAX_LIMIT);
      if (!rows.length) break;
      for (var i = 0; i < rows.length; i++) {
        var event = clone(rows[i], {});
        if (event.kind === 'tool.call') {
          if (event.metadata && event.metadata.request) {
            assertExportableDescriptor(event.metadata.request);
            event.metadata.requestValue = await descriptorValue(event.metadata.request);
          }
          if (event.metadata && event.metadata.result) {
            assertExportableDescriptor(event.metadata.result);
            event.metadata.resultValue = await descriptorValue(event.metadata.result);
          }
        }
        await emitChunked((first ? '' : ',') + JSON.stringify(event));
        first = false;
        after = rows[i].sequence;
      }
      if (rows.length < DETAIL_MAX_LIMIT) break;
    }
    await emitChunked(']}');
    return true;
  }

  async function listPendingSealSessionIds() {
    return (await backend().listPendingSeals()).filter(function (run) {
      return run.type === 'recording' && run.status !== 'running' && run.replayTrusted !== false;
    }).map(function (run) { return run.id; });
  }

  function resetForTests() {
    _backendOverride = createMemoryBackend();
    _localStorageShim = null;
    _alarmShim = null;
    _timeShim = null;
    _writeQueue = Promise.resolve();
    _recordingGaps = new Map();
    _indexProjectionDirty = false;
    return _backendOverride;
  }

  var api = {
    DB_NAME: DB_NAME,
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORAGE_BACKEND: STORAGE_BACKEND,
    ARTIFACT_THRESHOLD_BYTES: ARTIFACT_THRESHOLD_BYTES,
    MAX_ENCODED_BYTES: MAX_ENCODED_BYTES,
    EXPORT_ARTIFACT_MAX_BYTES: EXPORT_ARTIFACT_MAX_BYTES,
    SESSION_HISTORY_CAP: SESSION_HISTORY_CAP,
    IDLE_MS: IDLE_MS,
    IDLE_ALARM_PREFIX: IDLE_ALARM_PREFIX,
    RETENTION_ALARM: RETENTION_ALARM,
    validRunSidecar: validRunSidecar,
    beginCall: beginCall,
    endCall: endCall,
    recordDispatch: recordDispatch,
    recordTaskOutcome: recordTaskOutcome,
    markRecordingGap: markRecordingGap,
    degradeOpenRuns: degradeOpenRuns,
    handleAlarm: handleAlarm,
    initialize: initialize,
    prune: prune,
    hasSession: hasSession,
    hasCorrelation: hasCorrelation,
    hasCall: hasCall,
    getSessionDetail: getSessionDetail,
    readSessionArtifact: readSessionArtifact,
    getReplayProjection: getReplayProjection,
    updateReplayMetadata: updateReplayMetadata,
    getReplayMetadata: getReplayMetadata,
    persistReplayRun: persistReplayRun,
    materializeReplayRun: materializeReplayRun,
    deleteSession: deleteSession,
    clearSessions: clearSessions,
    exportHumanReadable: exportHumanReadable,
    getReplayData: getReplayData,
    streamSessionExport: streamSessionExport,
    listPendingSealSessionIds: listPendingSealSessionIds,
    _createMemoryBackend: createMemoryBackend,
    _setBackendForTests: function (value) { _backendOverride = value; },
    _setLocalStorageShim: function (value) { _localStorageShim = value; },
    _setAlarmShim: function (value) { _alarmShim = value; },
    _setTimeShim: function (value) { _timeShim = value; },
    _resetForTests: resetForTests,
    _drainForTests: function () { return Promise.resolve(_writeQueue).catch(function () {}); },
    _stableJsonForTests: stableJson
  };

  globalScope.FsbMcpLatticeJournal = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
