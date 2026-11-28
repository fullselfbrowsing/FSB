/**
 * Local storage for page recordings (video-style session playback).
 *
 * While an automation session runs, utils/page-recorder-host.js streams each
 * acted-on tab's DOM capture here in chunks. ui/recording-player.html reads it
 * back. Everything stays on this device, in IndexedDB.
 *
 * Model: one recording per session correlation, one track per tab, one segment
 * per document, chunks numbered within a segment. A chunk whose first event is
 * a snapshot is a keyframe; playback seeks from the nearest keyframe.
 *
 * Loaded by the service worker (importScripts) and by extension pages
 * (<script src>), so it only touches globalScope.indexedDB.
 */
(function (globalScope) {
  'use strict';

  var DB_NAME = 'fsb-page-recordings';
  var DB_VERSION = 1;
  var RECORDING_STORE = 'recordings';
  var CHUNK_STORE = 'chunks';
  var MARKER_STORE = 'markers';
  var META_STORE = 'meta';
  var TOTAL_BYTES_KEY = 'totalBytes';

  var MIB = 1024 * 1024;
  var DEFAULT_LIMITS = {
    maxRecordingBytes: 64 * MIB, // per recording; capture stops, markers continue
    maxTotalBytes: 1024 * MIB, // all recordings; oldest finished ones are evicted first
    unlinkedGraceMs: 60 * 60 * 1000, // finished but never linked to a history row
    staleLiveMs: 6 * 60 * 60 * 1000 // a live row this quiet was left behind by a crash
  };

  var STATUS_RECORDING = 'recording';
  var STATUS_FINISHED = 'finished';

  var _limits = Object.assign({}, DEFAULT_LIMITS);
  var _dbPromise = null;
  var _backendOverride = null;
  var _indexedDbBackend = null;
  var _writeTail = Promise.resolve();

  function clone(value, fallback) {
    if (value === undefined) return fallback;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return fallback;
    }
  }

  function now() {
    return Date.now();
  }

  function randomSuffix() {
    try {
      if (globalScope.crypto && typeof globalScope.crypto.randomUUID === 'function') {
        return globalScope.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      }
    } catch (_error) { /* fall through */ }
    return Math.random().toString(36).slice(2, 14);
  }

  function newRecordingId() {
    return 'rec_' + now().toString(36) + '_' + randomSuffix();
  }

  function eventsBytes(events) {
    try {
      return JSON.stringify(events || []).length;
    } catch (_error) {
      return 0;
    }
  }

  function enqueueWrite(fn) {
    var next = _writeTail.then(fn, fn);
    _writeTail = next.catch(function () {});
    return next;
  }

  // ---------------------------------------------------------------------------
  // IndexedDB backend
  // ---------------------------------------------------------------------------

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
        var recordings = db.objectStoreNames.contains(RECORDING_STORE)
          ? request.transaction.objectStore(RECORDING_STORE)
          : db.createObjectStore(RECORDING_STORE, { keyPath: 'id' });
        ensureIndex(recordings, 'byHistorySessionId', 'historySessionId');
        ensureIndex(recordings, 'byCorrelation', 'correlation');
        ensureIndex(recordings, 'byStatus', 'status');
        ensureIndex(recordings, 'byEndedAt', 'endedAt');

        var chunks = db.objectStoreNames.contains(CHUNK_STORE)
          ? request.transaction.objectStore(CHUNK_STORE)
          : db.createObjectStore(CHUNK_STORE, { keyPath: ['recordingId', 'trackId', 'segment', 'seq'] });
        ensureIndex(chunks, 'byRecording', 'recordingId');
        // Sparse: only keyframe chunks carry keyframeAt.
        ensureIndex(chunks, 'byKeyframe', ['recordingId', 'trackId', 'keyframeAt']);

        var markers = db.objectStoreNames.contains(MARKER_STORE)
          ? request.transaction.objectStore(MARKER_STORE)
          : db.createObjectStore(MARKER_STORE, { keyPath: ['recordingId', 't', 'mid'] });
        ensureIndex(markers, 'byRecording', 'recordingId');

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
        reject(request.error || new Error('Could not open page recordings'));
      };
    });
    return _dbPromise;
  }

  function deleteByIndex(store, indexName, key) {
    return new Promise(function (resolve, reject) {
      var cursorRequest = store.index(indexName).openKeyCursor(IDBKeyRange.only(key));
      cursorRequest.onsuccess = function () {
        var cursor = cursorRequest.result;
        if (!cursor) {
          resolve();
          return;
        }
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
      cursorRequest.onerror = function () { reject(cursorRequest.error); };
    });
  }

  function createIndexedDbBackend() {
    return {
      kind: 'indexeddb',
      async getRecording(id) {
        var db = await openDatabase();
        var tx = db.transaction(RECORDING_STORE, 'readonly');
        return clone(await requestResult(tx.objectStore(RECORDING_STORE).get(id)), null);
      },
      async listRecordings() {
        var db = await openDatabase();
        var tx = db.transaction(RECORDING_STORE, 'readonly');
        return clone(await requestResult(tx.objectStore(RECORDING_STORE).getAll()), []);
      },
      async getChunks(recordingId, trackId) {
        var db = await openDatabase();
        var tx = db.transaction(CHUNK_STORE, 'readonly');
        var range = IDBKeyRange.bound(
          [recordingId, trackId, -Infinity, -Infinity],
          [recordingId, trackId, Infinity, Infinity]
        );
        return clone(await requestResult(tx.objectStore(CHUNK_STORE).getAll(range)), []);
      },
      async getMarkers(recordingId) {
        var db = await openDatabase();
        var tx = db.transaction(MARKER_STORE, 'readonly');
        return clone(await requestResult(tx.objectStore(MARKER_STORE).index('byRecording').getAll(IDBKeyRange.only(recordingId))), []);
      },
      async listChunkRecordingIds() {
        var db = await openDatabase();
        var tx = db.transaction([CHUNK_STORE, MARKER_STORE], 'readonly');
        var ids = new Set();
        async function collect(store) {
          await new Promise(function (resolve, reject) {
            var request = store.index('byRecording').openKeyCursor(null, 'nextunique');
            request.onsuccess = function () {
              var cursor = request.result;
              if (!cursor) {
                resolve();
                return;
              }
              ids.add(cursor.key);
              cursor.continue();
            };
            request.onerror = function () { reject(request.error); };
          });
        }
        await collect(tx.objectStore(CHUNK_STORE));
        await collect(tx.objectStore(MARKER_STORE));
        return Array.from(ids);
      },
      async getMeta(key) {
        var db = await openDatabase();
        var tx = db.transaction(META_STORE, 'readonly');
        return clone(await requestResult(tx.objectStore(META_STORE).get(key)), null);
      },
      async commit(batch) {
        var db = await openDatabase();
        var tx = db.transaction([RECORDING_STORE, CHUNK_STORE, MARKER_STORE, META_STORE], 'readwrite');
        var done = transactionDone(tx);
        (batch.recordings || []).forEach(function (row) { tx.objectStore(RECORDING_STORE).put(row); });
        (batch.chunks || []).forEach(function (row) { tx.objectStore(CHUNK_STORE).put(row); });
        (batch.markers || []).forEach(function (row) { tx.objectStore(MARKER_STORE).put(row); });
        (batch.meta || []).forEach(function (row) { tx.objectStore(META_STORE).put(row); });
        await done;
      },
      async deleteCascade(recordingIds, metaRows) {
        var db = await openDatabase();
        var tx = db.transaction([RECORDING_STORE, CHUNK_STORE, MARKER_STORE, META_STORE], 'readwrite');
        var done = transactionDone(tx);
        // Awaited below; the no-op handler keeps an early abort from surfacing
        // as an unhandled rejection while the cursor deletes are still pending.
        done.catch(function () {});
        var pending = [];
        (recordingIds || []).forEach(function (id) {
          tx.objectStore(RECORDING_STORE).delete(id);
          pending.push(deleteByIndex(tx.objectStore(CHUNK_STORE), 'byRecording', id));
          pending.push(deleteByIndex(tx.objectStore(MARKER_STORE), 'byRecording', id));
        });
        (metaRows || []).forEach(function (row) { tx.objectStore(META_STORE).put(row); });
        await Promise.all(pending);
        await done;
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Memory backend (tests, and contexts without IndexedDB)
  // ---------------------------------------------------------------------------

  function createMemoryBackend() {
    var recordings = new Map();
    var chunks = new Map();
    var markers = new Map();
    var meta = new Map();
    function chunkKey(row) { return JSON.stringify([row.recordingId, row.trackId, row.segment, row.seq]); }
    function markerKey(row) { return JSON.stringify([row.recordingId, row.t, row.mid]); }
    return {
      kind: 'memory',
      _state: { recordings: recordings, chunks: chunks, markers: markers, meta: meta },
      async getRecording(id) { return clone(recordings.get(id), null); },
      async listRecordings() { return clone(Array.from(recordings.values()), []); },
      async getChunks(recordingId, trackId) {
        return clone(Array.from(chunks.values()).filter(function (row) {
          return row.recordingId === recordingId && row.trackId === trackId;
        }), []);
      },
      async getMarkers(recordingId) {
        return clone(Array.from(markers.values()).filter(function (row) {
          return row.recordingId === recordingId;
        }), []);
      },
      async listChunkRecordingIds() {
        var ids = new Set();
        chunks.forEach(function (row) { ids.add(row.recordingId); });
        markers.forEach(function (row) { ids.add(row.recordingId); });
        return Array.from(ids);
      },
      async getMeta(key) { return clone(meta.get(key), null); },
      async commit(batch) {
        (batch.recordings || []).forEach(function (row) { recordings.set(row.id, clone(row, null)); });
        (batch.chunks || []).forEach(function (row) { chunks.set(chunkKey(row), clone(row, null)); });
        (batch.markers || []).forEach(function (row) { markers.set(markerKey(row), clone(row, null)); });
        (batch.meta || []).forEach(function (row) { meta.set(row.key, clone(row, null)); });
      },
      async deleteCascade(recordingIds, metaRows) {
        var doomed = new Set(recordingIds || []);
        doomed.forEach(function (id) { recordings.delete(id); });
        Array.from(chunks.keys()).forEach(function (key) {
          if (doomed.has(chunks.get(key).recordingId)) chunks.delete(key);
        });
        Array.from(markers.keys()).forEach(function (key) {
          if (doomed.has(markers.get(key).recordingId)) markers.delete(key);
        });
        (metaRows || []).forEach(function (row) { meta.set(row.key, clone(row, null)); });
      }
    };
  }

  function backend() {
    if (_backendOverride) return _backendOverride;
    if (!globalScope.indexedDB) {
      _backendOverride = createMemoryBackend();
      return _backendOverride;
    }
    if (!_indexedDbBackend) _indexedDbBackend = createIndexedDbBackend();
    return _indexedDbBackend;
  }

  // ---------------------------------------------------------------------------
  // Store policy
  // ---------------------------------------------------------------------------

  async function readTotalBytes() {
    var row = await backend().getMeta(TOTAL_BYTES_KEY);
    return row && Number.isFinite(row.value) ? row.value : 0;
  }

  function totalRow(value) {
    return { key: TOTAL_BYTES_KEY, value: Math.max(0, value) };
  }

  function normalizeTrack(track) {
    var t = track || {};
    return {
      trackId: String(t.trackId || 'primary'),
      tabId: Number.isFinite(t.tabId) ? t.tabId : null,
      logicalTab: typeof t.logicalTab === 'string' ? t.logicalTab : null,
      startedAt: Number.isFinite(t.startedAt) ? t.startedAt : now(),
      endedAt: Number.isFinite(t.endedAt) ? t.endedAt : null,
      segments: Number.isFinite(t.segments) ? t.segments : 0
    };
  }

  async function createRecording(input) {
    var source = input || {};
    var row = {
      id: typeof source.id === 'string' && source.id ? source.id : newRecordingId(),
      correlation: String(source.correlation || ''),
      driver: source.driver === 'autopilot' ? 'autopilot' : 'mcp',
      agentId: typeof source.agentId === 'string' ? source.agentId : null,
      recordingRunId: typeof source.recordingRunId === 'string' ? source.recordingRunId : null,
      historySessionId: typeof source.historySessionId === 'string' && source.historySessionId ? source.historySessionId : null,
      status: STATUS_RECORDING,
      truncated: false,
      startedAt: Number.isFinite(source.startedAt) ? source.startedAt : now(),
      endedAt: null,
      updatedAt: now(),
      bytes: 0,
      chunkCount: 0,
      markerCount: 0,
      tracks: {}
    };
    return enqueueWrite(async function () {
      await backend().commit({ recordings: [row] });
      return clone(row, null);
    });
  }

  function getRecording(id) {
    return backend().getRecording(id);
  }

  async function listRecordings() {
    var rows = await backend().listRecordings();
    return rows.sort(function (a, b) { return (a.startedAt || 0) - (b.startedAt || 0); });
  }

  async function findRecordingByCorrelation(correlation, options) {
    var wantStatus = options && options.status;
    var rows = (await listRecordings()).filter(function (row) {
      return row.correlation === correlation && (!wantStatus || row.status === wantStatus);
    });
    return rows.length ? rows[rows.length - 1] : null;
  }

  async function findRecordingsByHistorySessionId(historySessionId) {
    return (await listRecordings()).filter(function (row) {
      return row.historySessionId === historySessionId;
    });
  }

  /**
   * Read-modify-write one recording row. `mutate(row)` edits the copy in place
   * or returns a replacement; returning false cancels the write.
   */
  function updateRecording(id, mutate) {
    return enqueueWrite(async function () {
      var row = await backend().getRecording(id);
      if (!row) return null;
      var result = typeof mutate === 'function' ? mutate(row) : Object.assign(row, mutate || {});
      if (result === false) return row;
      var next = result && typeof result === 'object' ? result : row;
      next.updatedAt = now();
      await backend().commit({ recordings: [next] });
      return clone(next, null);
    });
  }

  function upsertTrack(recordingId, track) {
    var normalized = normalizeTrack(track);
    return updateRecording(recordingId, function (row) {
      var existing = row.tracks[normalized.trackId];
      row.tracks[normalized.trackId] = existing
        ? Object.assign({}, existing, track, { trackId: normalized.trackId })
        : normalized;
    });
  }

  function linkHistorySession(recordingId, historySessionId) {
    return updateRecording(recordingId, function (row) {
      if (!historySessionId || row.historySessionId === historySessionId) return false;
      row.historySessionId = String(historySessionId);
      row.linkedAt = now();
    });
  }

  function finishRecording(recordingId, endedAt) {
    return updateRecording(recordingId, function (row) {
      if (row.status === STATUS_FINISHED) return false;
      row.status = STATUS_FINISHED;
      row.endedAt = Number.isFinite(endedAt) ? endedAt : now();
      Object.keys(row.tracks || {}).forEach(function (trackId) {
        if (!Number.isFinite(row.tracks[trackId].endedAt)) row.tracks[trackId].endedAt = row.endedAt;
      });
    });
  }

  function normalizeChunk(recordingId, chunk) {
    var c = chunk || {};
    var events = Array.isArray(c.events) ? c.events : [];
    var row = {
      recordingId: recordingId,
      trackId: String(c.trackId || 'primary'),
      segment: Number.isFinite(c.segment) ? c.segment : 0,
      seq: Number.isFinite(c.seq) ? c.seq : 0,
      t0: Number.isFinite(c.t0) ? c.t0 : (events[0] && events[0].t) || 0,
      t1: Number.isFinite(c.t1) ? c.t1 : (events.length ? events[events.length - 1].t : 0),
      keyframe: c.keyframe === true,
      bytes: Number.isFinite(c.bytes) && c.bytes >= 0 ? c.bytes : eventsBytes(events),
      events: events
    };
    if (row.keyframe) row.keyframeAt = row.t0;
    return row;
  }

  /**
   * Append capture chunks to a live recording. Stops accepting once the
   * recording would pass maxRecordingBytes and marks it truncated; markers
   * keep working after that.
   */
  function appendChunks(recordingId, chunks) {
    var incoming = (Array.isArray(chunks) ? chunks : []).map(function (chunk) {
      return normalizeChunk(recordingId, chunk);
    });
    return enqueueWrite(async function () {
      var row = await backend().getRecording(recordingId);
      if (!row) return { accepted: 0, truncated: false, missing: true };
      if (row.truncated) return { accepted: 0, truncated: true };
      var accepted = [];
      var addedBytes = 0;
      var truncated = false;
      for (var i = 0; i < incoming.length; i++) {
        if (row.bytes + addedBytes + incoming[i].bytes > _limits.maxRecordingBytes) {
          truncated = true;
          break;
        }
        addedBytes += incoming[i].bytes;
        accepted.push(incoming[i]);
      }
      row.bytes += addedBytes;
      row.chunkCount += accepted.length;
      row.updatedAt = now();
      if (truncated) row.truncated = true;
      var total = (await readTotalBytes()) + addedBytes;
      await backend().commit({ recordings: [row], chunks: accepted, meta: [totalRow(total)] });
      if (total > _limits.maxTotalBytes) await evictForBudget(recordingId);
      return { accepted: accepted.length, truncated: truncated, bytes: row.bytes };
    });
  }

  function appendMarkers(recordingId, markers) {
    var rows = (Array.isArray(markers) ? markers : []).map(function (marker, index) {
      var m = marker || {};
      return {
        recordingId: recordingId,
        t: Number.isFinite(m.t) ? m.t : now(),
        mid: typeof m.mid === 'string' && m.mid ? m.mid : (now().toString(36) + '-' + index + '-' + randomSuffix()),
        trackId: typeof m.trackId === 'string' ? m.trackId : null,
        kind: String(m.kind || 'note'),
        data: clone(m.data, {})
      };
    });
    return enqueueWrite(async function () {
      var row = await backend().getRecording(recordingId);
      if (!row) return { accepted: 0, missing: true };
      row.markerCount += rows.length;
      row.updatedAt = now();
      await backend().commit({ recordings: [row], markers: rows });
      return { accepted: rows.length };
    });
  }

  async function readTrackChunks(recordingId, trackId) {
    var rows = await backend().getChunks(recordingId, trackId);
    return rows.sort(function (a, b) { return (a.segment - b.segment) || (a.seq - b.seq); });
  }

  async function readMarkers(recordingId) {
    var rows = await backend().getMarkers(recordingId);
    return rows.sort(function (a, b) { return (a.t - b.t) || (a.mid < b.mid ? -1 : a.mid > b.mid ? 1 : 0); });
  }

  /** Flatten a track into playback events ordered by time. */
  async function readTrackEvents(recordingId, trackId) {
    var chunks = await readTrackChunks(recordingId, trackId);
    var events = [];
    chunks.forEach(function (chunk) {
      (chunk.events || []).forEach(function (event) { events.push(event); });
    });
    events.sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
    return events;
  }

  // Deletion runs inside the write queue; callers that already hold it use the
  // *Now variant to avoid queueing behind themselves.
  async function deleteRecordingsNow(ids) {
    var unique = Array.from(new Set((ids || []).filter(Boolean)));
    if (unique.length === 0) return 0;
    var freed = 0;
    for (var i = 0; i < unique.length; i++) {
      var row = await backend().getRecording(unique[i]);
      if (row && Number.isFinite(row.bytes)) freed += row.bytes;
    }
    var total = Math.max(0, (await readTotalBytes()) - freed);
    await backend().deleteCascade(unique, [totalRow(total)]);
    return unique.length;
  }

  function deleteRecordings(ids) {
    return enqueueWrite(function () { return deleteRecordingsNow(ids); });
  }

  async function deleteByHistorySessionIds(historySessionIds) {
    var wanted = new Set((historySessionIds || []).map(String));
    if (wanted.size === 0) return 0;
    var rows = await listRecordings();
    return deleteRecordings(rows.filter(function (row) {
      return row.historySessionId && wanted.has(row.historySessionId);
    }).map(function (row) { return row.id; }));
  }

  async function clearAll(options) {
    var keepLive = !!(options && options.keepLive);
    var rows = await listRecordings();
    return deleteRecordings(rows.filter(function (row) {
      return !(keepLive && row.status === STATUS_RECORDING);
    }).map(function (row) { return row.id; }));
  }

  async function pruneOlderThan(cutoffMs) {
    if (!Number.isFinite(cutoffMs)) return 0;
    var rows = await listRecordings();
    return deleteRecordings(rows.filter(function (row) {
      return row.status === STATUS_FINISHED && Number.isFinite(row.endedAt) && row.endedAt < cutoffMs;
    }).map(function (row) { return row.id; }));
  }

  // Oldest finished recordings go first; a live recording is never evicted.
  async function evictForBudget(protectedId) {
    var total = await readTotalBytes();
    if (total <= _limits.maxTotalBytes) return 0;
    var rows = (await backend().listRecordings())
      .filter(function (row) { return row.status === STATUS_FINISHED && row.id !== protectedId; })
      .sort(function (a, b) { return (a.endedAt || a.startedAt || 0) - (b.endedAt || b.startedAt || 0); });
    var doomed = [];
    for (var i = 0; i < rows.length && total > _limits.maxTotalBytes; i++) {
      doomed.push(rows[i].id);
      total -= rows[i].bytes || 0;
    }
    return deleteRecordingsNow(doomed);
  }

  /**
   * Housekeeping. Removes:
   *  - finished recordings whose history row is gone (when knownHistoryIds is given),
   *  - finished recordings that never got linked within unlinkedGraceMs,
   *  - chunks and markers whose recording row is missing.
   * Live rows that stopped updating long ago are closed as finished.
   */
  function sweepOrphans(options) {
    var opts = options || {};
    var at = Number.isFinite(opts.now) ? opts.now : now();
    var known = Array.isArray(opts.knownHistoryIds) ? new Set(opts.knownHistoryIds.map(String)) : null;
    return enqueueWrite(async function () {
      var rows = await backend().listRecordings();
      var byId = new Set(rows.map(function (row) { return row.id; }));
      var doomed = [];
      var closed = [];
      rows.forEach(function (row) {
        if (row.status === STATUS_RECORDING) {
          if (at - (row.updatedAt || row.startedAt || 0) > _limits.staleLiveMs) {
            row.status = STATUS_FINISHED;
            row.endedAt = row.updatedAt || row.startedAt || at;
            closed.push(row);
          }
          return;
        }
        if (row.historySessionId) {
          if (known && !known.has(row.historySessionId)) doomed.push(row.id);
          return;
        }
        if (at - (row.endedAt || row.startedAt || 0) > _limits.unlinkedGraceMs) doomed.push(row.id);
      });
      if (closed.length) await backend().commit({ recordings: closed });
      var orphanIds = (await backend().listChunkRecordingIds()).filter(function (id) { return !byId.has(id); });
      var removed = await deleteRecordingsNow(doomed.concat(orphanIds));
      return { removed: removed, closed: closed.length, orphanChunkSets: orphanIds.length };
    });
  }

  function durationOf(row) {
    var end = Number.isFinite(row.endedAt) ? row.endedAt : row.updatedAt;
    return Math.max(0, (end || row.startedAt || 0) - (row.startedAt || 0));
  }

  /**
   * Summary keyed by history session id, for the side panel's Watch button.
   * The newest recording wins when one history row has several.
   */
  async function buildIndexSummary() {
    var rows = await listRecordings();
    var summary = {};
    rows.forEach(function (row) {
      if (!row.historySessionId || row.chunkCount <= 0) return;
      summary[row.historySessionId] = {
        recordingId: row.id,
        durationMs: durationOf(row),
        tracks: Object.keys(row.tracks || {}).length,
        state: row.status === STATUS_RECORDING ? 'recording' : (row.truncated ? 'truncated' : 'ready'),
        startedAt: row.startedAt
      };
    });
    return summary;
  }

  function configure(limits) {
    Object.keys(limits || {}).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_LIMITS, key) && Number.isFinite(limits[key]) && limits[key] > 0) {
        _limits[key] = limits[key];
      }
    });
    return Object.assign({}, _limits);
  }

  var api = {
    DB_NAME: DB_NAME,
    STATUS_RECORDING: STATUS_RECORDING,
    STATUS_FINISHED: STATUS_FINISHED,
    DEFAULT_LIMITS: Object.freeze(Object.assign({}, DEFAULT_LIMITS)),
    configure: configure,
    createRecording: createRecording,
    getRecording: getRecording,
    listRecordings: listRecordings,
    findRecordingByCorrelation: findRecordingByCorrelation,
    findRecordingsByHistorySessionId: findRecordingsByHistorySessionId,
    updateRecording: updateRecording,
    upsertTrack: upsertTrack,
    linkHistorySession: linkHistorySession,
    finishRecording: finishRecording,
    appendChunks: appendChunks,
    appendMarkers: appendMarkers,
    readTrackChunks: readTrackChunks,
    readTrackEvents: readTrackEvents,
    readMarkers: readMarkers,
    deleteRecordings: deleteRecordings,
    deleteByHistorySessionIds: deleteByHistorySessionIds,
    clearAll: clearAll,
    pruneOlderThan: pruneOlderThan,
    sweepOrphans: sweepOrphans,
    buildIndexSummary: buildIndexSummary,
    _createMemoryBackend: createMemoryBackend,
    _setBackendForTests: function (value) {
      _backendOverride = value || null;
      _writeTail = Promise.resolve();
    },
    _resetLimitsForTests: function () { _limits = Object.assign({}, DEFAULT_LIMITS); }
  };

  globalScope.FsbPageRecordingStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
