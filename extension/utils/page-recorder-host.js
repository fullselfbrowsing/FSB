/**
 * Page recorder host (service worker).
 *
 * Starts, feeds and finishes page recordings for automation sessions:
 *  - action hooks (MCP bridge, Autopilot loop) call noteActionStart and
 *    noteActionEnd; the first action on a tab starts a track and injects
 *    content/page-recorder.js into that tab;
 *  - every new document on a recorded tab is injected again on commit;
 *  - content scripts stream capture chunks over the 'fsb-page-recorder' port,
 *    which are written to utils/page-recording-store.js and acknowledged;
 *  - tracks end when the visual session clears; recordings finish when the
 *    session ends (Autopilot) or a minute after the last track (MCP);
 *  - recordings are linked to their session-history row, deleted with it, and
 *    pruned with the MCP retention setting.
 *
 * Live state is mirrored to chrome.storage.session so a restarted service
 * worker keeps recording. Everything stays on this device.
 */
(function (globalScope) {
  'use strict';

  var PORT_NAME = 'fsb-page-recorder';
  var STATE_KEY = 'fsbPageRecorderState';
  var INDEX_KEY = 'fsbPageRecordingIndex';
  var ENABLED_KEY = 'fsbPageRecordingEnabled';
  var RETENTION_DAYS_KEY = 'fsbMcpSessionRetentionDays';
  var SESSION_INDEX_KEY = 'fsbSessionIndex';
  var FINALIZE_ALARM_PREFIX = 'fsbPageRecording:finalize:';
  var SWEEP_ALARM = 'fsbPageRecording:sweep';
  var RECORDER_FILES = ['dist/content/page-recorder-capture.js', 'content/page-recorder.js'];

  var DAY_MS = 24 * 60 * 60 * 1000;
  var MCP_FINALIZE_DELAY_MS = 60 * 1000;
  var REJOIN_WINDOW_MS = 30 * 60 * 1000;
  var NEW_TRACK_WAIT_MS = 400;
  var PENDING_END_MS = 2000;
  var HELLO_FALLBACK_MS = 1000;
  var DEFAULT_RETENTION_DAYS = 30;

  var _deps = {
    chrome: null,
    store: null,
    now: function () { return Date.now(); },
    setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimeout: function (handle) { clearTimeout(handle); },
    recorder: function () { return globalScope.fsbMcpSessionRecorder || null; },
    journal: function () { return globalScope.FsbMcpLatticeJournal || null; },
    logger: function () { return globalScope.automationLogger || null; }
  };

  // Persisted (chrome.storage.session): live recordings keyed by correlation,
  // and which recording each recorded tab belongs to.
  var _state = { recordings: {}, tabs: {} };
  var _ports = new Map(); // tabId -> port entry for its current document
  var _pendingEnds = new Map(); // tabId -> action end that arrived before its start
  var _injecting = new Map(); // tabId:documentId -> in-flight injection
  var _helloSeen = new Set(); // documentIds that already said hello
  var _firstBatchWaiters = new Map(); // tabId -> [resolve]
  var _creating = new Map(); // correlation -> in-flight ensureRecording
  var _enabled = true;
  var _restorePromise = null;
  var _persistTimer = null;
  var _indexTimer = null;
  var _initialized = false;

  function chromeApi() {
    return _deps.chrome || globalScope.chrome;
  }

  function store() {
    return _deps.store || globalScope.FsbPageRecordingStore;
  }

  function now() {
    return _deps.now();
  }

  function warn(message, error) {
    try { console.warn('[FSB PageRecorder] ' + message, error && error.message ? error.message : (error || '')); } catch (_e) { /* no console */ }
  }

  // ---------------------------------------------------------------------------
  // State persistence
  // ---------------------------------------------------------------------------

  function restored() {
    if (_restorePromise) return _restorePromise;
    _restorePromise = (async function () {
      try {
        var api = chromeApi();
        if (api && api.storage && api.storage.session) {
          var bag = await api.storage.session.get(STATE_KEY);
          var saved = bag && bag[STATE_KEY];
          if (saved && typeof saved === 'object') {
            _state.recordings = saved.recordings && typeof saved.recordings === 'object' ? saved.recordings : {};
            _state.tabs = saved.tabs && typeof saved.tabs === 'object' ? saved.tabs : {};
          }
        }
        if (api && api.storage && api.storage.local) {
          var settings = await api.storage.local.get(ENABLED_KEY);
          _enabled = !(settings && settings[ENABLED_KEY] === false);
        }
      } catch (error) {
        warn('state restore failed', error);
      }
    })();
    return _restorePromise;
  }

  function persistSoon() {
    if (_persistTimer) return;
    _persistTimer = _deps.setTimeout(function () {
      _persistTimer = null;
      persistNow();
    }, 200);
  }

  async function persistNow() {
    try {
      var api = chromeApi();
      if (api && api.storage && api.storage.session) {
        var value = {};
        value[STATE_KEY] = { recordings: _state.recordings, tabs: _state.tabs };
        await api.storage.session.set(value);
      }
    } catch (error) {
      warn('state persist failed', error);
    }
  }

  function indexSoon() {
    if (_indexTimer) return;
    _indexTimer = _deps.setTimeout(function () {
      _indexTimer = null;
      writeIndexNow();
    }, 500);
  }

  async function writeIndexNow() {
    try {
      var summary = await store().buildIndexSummary();
      var value = {};
      value[INDEX_KEY] = summary;
      await chromeApi().storage.local.set(value);
      return summary;
    } catch (error) {
      warn('index write failed', error);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function correlationFor(input) {
    if (input.driver === 'autopilot') return input.sessionId ? 'ap:' + input.sessionId : null;
    if (typeof input.agentId === 'string' && input.agentId) {
      return 'mcp:' + input.agentId + ':' + (typeof input.recordingRunId === 'string' && input.recordingRunId ? input.recordingRunId : 'legacy');
    }
    return null;
  }

  function recordableUrl(url) {
    var parsed;
    try {
      parsed = new URL(String(url || ''));
    } catch (_error) {
      return { ok: false, reason: 'restricted-page', origin: null };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: 'restricted-page', origin: null };
    }
    var host = parsed.hostname.toLowerCase();
    if (host === 'chromewebstore.google.com' || (host === 'chrome.google.com' && parsed.pathname.indexOf('/webstore') === 0)) {
      return { ok: false, reason: 'restricted-page', origin: parsed.origin };
    }
    return { ok: true, origin: parsed.origin };
  }

  function originAndPath(href) {
    try {
      var parsed = new URL(String(href || ''));
      return parsed.origin + parsed.pathname;
    } catch (_error) {
      return null;
    }
  }

  // Captions and labels never carry typed text (it sits in quotes) or secrets.
  function sanitizeLabel(text) {
    if (typeof text !== 'string' || !text.trim()) return '';
    var recorder = _deps.recorder();
    var clean = text;
    if (recorder && typeof recorder.sanitizeSummaryTextForPersistence === 'function') {
      try { clean = recorder.sanitizeSummaryTextForPersistence(text, 400); } catch (_error) { clean = text; }
    }
    return String(clean)
      .replace(/"[^"]*"/g, '"…"')
      .replace(/“[^”]*”/g, '“…”')
      .replace(/'[^']{2,}'/g, '\'…\'')
      .trim()
      .slice(0, 160);
  }

  function sensitivePatterns() {
    var recorder = _deps.recorder();
    return recorder && recorder.SENSITIVE_FIELD_PATTERNS ? recorder.SENSITIVE_FIELD_PATTERNS : null;
  }

  function recordingForTab(tabId) {
    var info = _state.tabs[tabId];
    var rec = info && _state.recordings[info.correlation];
    var track = rec && rec.tracks[tabId];
    return rec && track ? { rec: rec, track: track } : null;
  }

  function recordingById(recordingId) {
    var found = null;
    Object.keys(_state.recordings).forEach(function (key) {
      if (_state.recordings[key].recordingId === recordingId) found = _state.recordings[key];
    });
    return found;
  }

  function sendToTab(tabId, message) {
    var entry = _ports.get(tabId);
    if (!entry || !entry.port) return false;
    try {
      entry.port.postMessage(message);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function appendMarker(rec, track, kind, data, t) {
    return store().appendMarkers(rec.recordingId, [{
      t: Number.isFinite(t) ? t : now(),
      trackId: track ? track.trackId : null,
      kind: kind,
      data: data || {}
    }]).catch(function (error) { warn('marker write failed', error); });
  }

  // ---------------------------------------------------------------------------
  // Recordings and tracks
  // ---------------------------------------------------------------------------

  function tracksFromRow(row) {
    var tracks = {};
    Object.keys((row && row.tracks) || {}).forEach(function (trackId) {
      var t = row.tracks[trackId];
      if (!Number.isFinite(t.tabId)) return;
      tracks[t.tabId] = {
        trackId: trackId,
        tabId: t.tabId,
        segment: Number.isFinite(t.segments) ? t.segments - 1 : -1,
        live: false,
        startedAt: t.startedAt
      };
    });
    return tracks;
  }

  async function ensureRecording(input) {
    var correlation = correlationFor(input);
    if (!correlation) return null;
    if (_state.recordings[correlation]) {
      cancelFinalize(_state.recordings[correlation].recordingId);
      return _state.recordings[correlation];
    }
    if (_creating.has(correlation)) return _creating.get(correlation);
    var pending = (async function () {
      var reuse = await store().findRecordingByCorrelation(correlation);
      var row = null;
      if (reuse && !reuse.truncated && reuse.status === store().STATUS_FINISHED &&
          now() - (reuse.endedAt || 0) < REJOIN_WINDOW_MS) {
        row = await store().reopenRecording(reuse.id);
      }
      if (!row) {
        row = await store().createRecording({
          correlation: correlation,
          driver: input.driver === 'autopilot' ? 'autopilot' : 'mcp',
          agentId: input.agentId || null,
          recordingRunId: input.recordingRunId || null,
          historySessionId: input.driver === 'autopilot' ? input.sessionId : null,
          startedAt: now()
        });
      }
      var rec = {
        recordingId: row.id,
        correlation: correlation,
        driver: row.driver,
        agentId: row.agentId,
        recordingRunId: row.recordingRunId,
        historySessionId: row.historySessionId || null,
        startedAt: row.startedAt,
        tracks: tracksFromRow(row)
      };
      _state.recordings[correlation] = rec;
      persistSoon();
      return rec;
    })();
    _creating.set(correlation, pending);
    try {
      return await pending;
    } finally {
      _creating.delete(correlation);
    }
  }

  function nextTrackId(rec, logicalTab) {
    if (typeof logicalTab === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(logicalTab)) return logicalTab;
    var used = new Set(Object.keys(rec.tracks).map(function (tabId) { return rec.tracks[tabId].trackId; }));
    if (!used.has('primary')) return 'primary';
    for (var n = 2; n < 1000; n++) {
      if (!used.has('tab-' + n)) return 'tab-' + n;
    }
    return 'tab-' + now();
  }

  async function ensureTrack(rec, tabId, logicalTab) {
    // A tab belongs to one recording at a time.
    var current = _state.tabs[tabId];
    if (current && current.correlation !== rec.correlation) await endTrack(tabId, 'reassigned');
    var existing = rec.tracks[tabId];
    if (existing && existing.live) return { track: existing, created: false };
    var track = {
      trackId: existing ? existing.trackId : nextTrackId(rec, logicalTab),
      tabId: tabId,
      segment: existing ? existing.segment : -1,
      live: true,
      startedAt: existing ? existing.startedAt : now()
    };
    rec.tracks[tabId] = track;
    _state.tabs[tabId] = { correlation: rec.correlation };
    persistSoon();
    await store().upsertTrack(rec.recordingId, { trackId: track.trackId, tabId: tabId, startedAt: track.startedAt, endedAt: null });
    return { track: track, created: true };
  }

  async function endTrack(tabId, reason) {
    var found = recordingForTab(tabId);
    delete _state.tabs[tabId];
    _pendingEnds.delete(tabId);
    sendToTab(tabId, { type: 'stop', reason: 'track-ended' });
    if (!found) {
      persistSoon();
      return;
    }
    var rec = found.rec;
    var track = found.track;
    if (track.live) {
      track.live = false;
      track.endedAt = now();
      await store().upsertTrack(rec.recordingId, { trackId: track.trackId, endedAt: track.endedAt }).catch(function () {});
      appendMarker(rec, track, 'track-end', { reason: reason || 'ended' });
    }
    persistSoon();
    var anyLive = Object.keys(rec.tracks).some(function (key) { return rec.tracks[key].live; });
    if (!anyLive && rec.driver === 'mcp') scheduleFinalize(rec);
  }

  function scheduleFinalize(rec) {
    try {
      chromeApi().alarms.create(FINALIZE_ALARM_PREFIX + rec.recordingId, { when: now() + MCP_FINALIZE_DELAY_MS });
    } catch (error) {
      warn('finalize alarm failed', error);
    }
  }

  function cancelFinalize(recordingId) {
    try { chromeApi().alarms.clear(FINALIZE_ALARM_PREFIX + recordingId); } catch (_error) { /* no alarm */ }
  }

  async function finalizeRecording(rec, reason) {
    if (!rec || !_state.recordings[rec.correlation]) return;
    var tabIds = Object.keys(rec.tracks).filter(function (key) { return rec.tracks[key].live; });
    for (var i = 0; i < tabIds.length; i++) {
      var tabId = Number(tabIds[i]);
      if (_state.tabs[tabId] && _state.tabs[tabId].correlation === rec.correlation) {
        sendToTab(tabId, { type: 'stop', reason: reason || 'finished' });
        delete _state.tabs[tabId];
      }
      rec.tracks[tabIds[i]].live = false;
    }
    cancelFinalize(rec.recordingId);
    await linkRecording(rec, null);
    delete _state.recordings[rec.correlation];
    persistSoon();
    await store().finishRecording(rec.recordingId, now()).catch(function (error) { warn('finish failed', error); });
    indexSoon();
  }

  // ---------------------------------------------------------------------------
  // History linking
  // ---------------------------------------------------------------------------

  async function resolveHistoryId(rec, hint) {
    if (rec.driver === 'autopilot') return rec.historySessionId || null;
    try {
      if (rec.recordingRunId) {
        var bag = await chromeApi().storage.local.get(SESSION_INDEX_KEY);
        var index = Array.isArray(bag && bag[SESSION_INDEX_KEY]) ? bag[SESSION_INDEX_KEY] : [];
        for (var i = 0; i < index.length; i++) {
          var row = index[i];
          if (row && row.storageBackend === 'journal-v2' && row.agentId === rec.agentId &&
              row.recordingRunId === rec.recordingRunId && typeof row.id === 'string') {
            return row.id;
          }
        }
      }
      var recorder = _deps.recorder();
      var tabId = hint && Number.isFinite(hint.tabId) ? hint.tabId : null;
      if (tabId === null) {
        var liveTab = Object.keys(rec.tracks).find(function (key) { return rec.tracks[key].live; });
        tabId = liveTab ? Number(liveTab) : null;
      }
      if (!rec.recordingRunId && recorder && typeof recorder.resolveOpenSessionId === 'function' && tabId !== null) {
        return await recorder.resolveOpenSessionId(rec.agentId, tabId);
      }
    } catch (error) {
      warn('history lookup failed', error);
    }
    return null;
  }

  async function linkRecording(rec, hint) {
    var id = await resolveHistoryId(rec, hint);
    if (!id || id === rec.historySessionId) return rec.historySessionId;
    if (rec.historySessionId && rec.driver === 'mcp' && !rec.recordingRunId) {
      // A legacy MCP session rolled over to a new history row: close this
      // recording; the next action starts one for the new row.
      await finalizeRecording(rec, 'history-rolled-over');
      return rec.historySessionId;
    }
    rec.historySessionId = id;
    persistSoon();
    await store().linkHistorySession(rec.recordingId, id).catch(function (error) { warn('link failed', error); });
    indexSoon();
    return id;
  }

  // ---------------------------------------------------------------------------
  // Injection and the content port
  // ---------------------------------------------------------------------------

  async function inject(tabId, documentId) {
    var key = tabId + ':' + (documentId || 'top');
    if (_injecting.has(key)) return _injecting.get(key);
    var target = documentId ? { tabId: tabId, documentIds: [documentId] } : { tabId: tabId, frameIds: [0] };
    var pending = Promise.resolve().then(function () {
      return chromeApi().scripting.executeScript({
        target: target,
        files: RECORDER_FILES,
        world: 'ISOLATED',
        injectImmediately: true
      });
    }).then(function () { return true; }, function (error) {
      warn('inject failed', error);
      var found = recordingForTab(tabId);
      if (found) appendMarker(found.rec, found.track, 'gap', { reason: 'inject-blocked' });
      return false;
    });
    _injecting.set(key, pending);
    try {
      return await pending;
    } finally {
      _deps.setTimeout(function () { _injecting.delete(key); }, 2000);
    }
  }

  async function attachTab(tabId) {
    var tab = null;
    try { tab = await chromeApi().tabs.get(tabId); } catch (_error) { tab = null; }
    if (!tab) return false;
    var verdict = recordableUrl(tab.url || tab.pendingUrl);
    if (!verdict.ok) {
      var found = recordingForTab(tabId);
      if (found) appendMarker(found.rec, found.track, 'gap', { reason: verdict.reason, origin: verdict.origin });
      return false;
    }
    return inject(tabId, null);
  }

  function waitForFirstBatch(tabId, ms) {
    return new Promise(function (resolve) {
      var list = _firstBatchWaiters.get(tabId) || [];
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        resolve();
      };
      list.push(finish);
      _firstBatchWaiters.set(tabId, list);
      _deps.setTimeout(finish, ms);
    });
  }

  function releaseFirstBatchWaiters(tabId) {
    var list = _firstBatchWaiters.get(tabId);
    if (!list) return;
    _firstBatchWaiters.delete(tabId);
    list.forEach(function (fn) { fn(); });
  }

  function onConnect(port) {
    if (!port || port.name !== PORT_NAME) return;
    var api = chromeApi();
    var sender = port.sender || {};
    var tabId = sender.tab && sender.tab.id;
    if (!Number.isFinite(tabId) || sender.frameId !== 0 || (sender.id && api.runtime && sender.id !== api.runtime.id)) {
      try { port.disconnect(); } catch (_error) { /* already gone */ }
      return;
    }
    var entry = {
      port: port,
      tabId: tabId,
      documentId: sender.documentId || null,
      recordingId: null,
      trackId: null,
      segment: null,
      lastSeq: -1
    };
    _ports.set(tabId, entry);
    port.onMessage.addListener(function (message) { handlePortMessage(entry, message); });
    port.onDisconnect.addListener(function () {
      if (_ports.get(tabId) === entry) _ports.delete(tabId);
    });
  }

  async function handlePortMessage(entry, message) {
    var m = message || {};
    try {
      await restored();
      switch (m.type) {
        case 'hello': await onHello(entry, m); break;
        case 'batch': await onBatch(entry, m); break;
        case 'marker': await onContentMarker(entry, m.kind, m.data, m.t); break;
        case 'gap': await onContentMarker(entry, 'gap', { reason: String(m.reason || 'unknown') }); break;
        case 'error': warn('content error: ' + String(m.message || '').slice(0, 200)); break;
        default: break;
      }
    } catch (error) {
      warn('port message failed', error);
    }
  }

  async function onHello(entry, m) {
    if (entry.documentId) _helloSeen.add(entry.documentId);
    var found = recordingForTab(entry.tabId);
    if (!found || !found.track.live || !_enabled) {
      sendToTab(entry.tabId, { type: 'stop', reason: 'not-recording' });
      return;
    }
    var rec = found.rec;
    var track = found.track;
    var contentType = String(m.contentType || '');
    if (contentType && !/^(text\/html|application\/xhtml\+xml)/i.test(contentType)) {
      appendMarker(rec, track, 'gap', { reason: 'not-html' });
      sendToTab(entry.tabId, { type: 'stop', reason: 'not-html' });
      return;
    }
    var resume = m.resume && m.resume.recordingId === rec.recordingId && m.resume.trackId === track.trackId &&
      Number.isFinite(m.resume.segment);
    var segment;
    if (resume) {
      segment = m.resume.segment;
      entry.lastSeq = Number.isFinite(m.resume.lastAckedSeq) ? m.resume.lastAckedSeq : -1;
    } else {
      track.segment += 1;
      segment = track.segment;
      persistSoon();
      store().upsertTrack(rec.recordingId, { trackId: track.trackId, segments: segment + 1 }).catch(function () {});
      appendMarker(rec, track, 'navigation', { url: originAndPath(m.href) });
    }
    entry.recordingId = rec.recordingId;
    entry.trackId = track.trackId;
    entry.segment = segment;
    var start = {
      type: 'start',
      recordingId: rec.recordingId,
      trackId: track.trackId,
      segment: segment,
      limits: {}
    };
    var patterns = sensitivePatterns();
    if (patterns) start.patterns = patterns;
    sendToTab(entry.tabId, start);
  }

  async function onBatch(entry, m) {
    if (!entry.recordingId || m.recordingId !== entry.recordingId || !Number.isFinite(m.seq)) return;
    if (m.seq <= entry.lastSeq) {
      sendToTab(entry.tabId, { type: 'ack', seq: m.seq });
      return;
    }
    entry.lastSeq = m.seq;
    var chunks = (Array.isArray(m.chunks) ? m.chunks : []).map(function (chunk) {
      return Object.assign({}, chunk, { trackId: entry.trackId, segment: entry.segment });
    });
    var result = await store().appendChunks(entry.recordingId, chunks);
    sendToTab(entry.tabId, { type: 'ack', seq: m.seq });
    releaseFirstBatchWaiters(entry.tabId);
    if (result && result.truncated) {
      var found = recordingForTab(entry.tabId);
      if (found) appendMarker(found.rec, found.track, 'gap', { reason: 'recording-full' });
      sendToTab(entry.tabId, { type: 'stop', reason: 'recording-full' });
    }
    indexSoon();
  }

  async function onContentMarker(entry, kind, data, t) {
    var found = recordingForTab(entry.tabId);
    if (!found) return;
    await appendMarker(found.rec, found.track, String(kind || 'note'), data || {}, t);
  }

  // ---------------------------------------------------------------------------
  // Action hooks
  // ---------------------------------------------------------------------------

  async function noteActionStart(input) {
    var info = input || {};
    try {
      await restored();
      if (!_enabled || !Number.isFinite(info.tabId)) return;
      var rec = await ensureRecording(info);
      if (!rec) return;
      var result = await ensureTrack(rec, info.tabId, info.logicalTab);
      if (result.created) {
        var attached = await attachTab(info.tabId);
        if (attached) await waitForFirstBatch(info.tabId, NEW_TRACK_WAIT_MS);
      }
      var data = { actionId: info.actionId || null, tool: info.tool || null, label: sanitizeLabel(info.reason || '') };
      appendMarker(rec, result.track, 'action-start', data);
      sendToTab(info.tabId, { type: 'mark', kind: 'action-start', data: data });
      var pendingEnd = _pendingEnds.get(info.tabId);
      if (pendingEnd && now() - pendingEnd.at <= PENDING_END_MS) {
        _pendingEnds.delete(info.tabId);
        await finishAction(rec, result.track, pendingEnd);
      }
    } catch (error) {
      warn('action start failed', error);
    }
  }

  async function noteActionEnd(input) {
    var info = input || {};
    try {
      await restored();
      if (!Number.isFinite(info.tabId)) return;
      var found = recordingForTab(info.tabId);
      if (!found || !found.track.live) {
        // open_tab / switch_tab report the end before the new tab's start.
        if (_enabled) _pendingEnds.set(info.tabId, Object.assign({}, info, { at: now() }));
        return;
      }
      await finishAction(found.rec, found.track, info);
    } catch (error) {
      warn('action end failed', error);
    }
  }

  async function finishAction(rec, track, info) {
    appendMarker(rec, track, 'action-end', {
      actionId: info.actionId || null,
      tool: info.tool || null,
      success: info.success !== false
    });
    sendToTab(track.tabId, { type: 'settle', actionId: info.actionId || null });
    await linkRecording(rec, { tabId: track.tabId });
  }

  async function onVisualSessionCleared(entry, reason) {
    try {
      await restored();
      var tabId = entry && Number(entry.tabId);
      if (!Number.isFinite(tabId)) return;
      await endTrack(tabId, reason || 'cleared');
    } catch (error) {
      warn('track end failed', error);
    }
  }

  async function finalizeAutopilotSession(sessionId) {
    try {
      await restored();
      var rec = _state.recordings['ap:' + sessionId];
      if (rec) await finalizeRecording(rec, 'session-ended');
    } catch (error) {
      warn('autopilot finalize failed', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Deletion, retention, housekeeping
  // ---------------------------------------------------------------------------

  async function onHistoryDeleted(historySessionIds) {
    try {
      await store().deleteByHistorySessionIds((historySessionIds || []).filter(Boolean));
      await writeIndexNow();
    } catch (error) {
      warn('history delete follow-up failed', error);
    }
  }

  async function onHistoryCleared() {
    try {
      await store().clearAll({ keepLive: true });
      await writeIndexNow();
    } catch (error) {
      warn('history clear follow-up failed', error);
    }
  }

  async function historyExists(id) {
    try {
      var journal = _deps.journal();
      if (journal && typeof journal.hasSession === 'function' && await journal.hasSession(id)) return true;
    } catch (_error) { /* fall through */ }
    try {
      var logger = _deps.logger();
      if (logger && typeof logger.loadSession === 'function' && await logger.loadSession(id)) return true;
    } catch (_error) { /* fall through */ }
    return false;
  }

  function idsOf(index) {
    var ids = new Set();
    (Array.isArray(index) ? index : []).forEach(function (row) {
      if (row && typeof row.id === 'string') ids.add(row.id);
    });
    return ids;
  }

  // Every history-removal path (count caps, retention, journal budget, user
  // deletes) rewrites the session index; follow it, confirming each id is
  // really gone before deleting its recording.
  async function followSessionIndex(oldIndex, newIndex) {
    var before = idsOf(oldIndex);
    var after = idsOf(newIndex);
    var removed = [];
    before.forEach(function (id) { if (!after.has(id)) removed.push(id); });
    var gone = [];
    for (var i = 0; i < removed.length; i++) {
      if (!(await historyExists(removed[i]))) gone.push(removed[i]);
    }
    if (gone.length) {
      await store().deleteByHistorySessionIds(gone);
      indexSoon();
    }
    // New index rows may be the history row a live MCP recording waits for.
    var keys = Object.keys(_state.recordings);
    for (var k = 0; k < keys.length; k++) {
      var rec = _state.recordings[keys[k]];
      if (rec && !rec.historySessionId && rec.driver === 'mcp') await linkRecording(rec, null);
    }
  }

  async function retentionDays() {
    try {
      var bag = await chromeApi().storage.local.get(RETENTION_DAYS_KEY);
      var days = Math.round(Number(bag && bag[RETENTION_DAYS_KEY]));
      if (!Number.isFinite(days)) return DEFAULT_RETENTION_DAYS;
      return Math.min(365, Math.max(1, days));
    } catch (_error) {
      return DEFAULT_RETENTION_DAYS;
    }
  }

  async function housekeeping() {
    try {
      var days = await retentionDays();
      await store().pruneOlderThan(now() - days * DAY_MS, { driver: 'mcp' });
      var bag = await chromeApi().storage.local.get(SESSION_INDEX_KEY);
      var known = Array.from(idsOf(bag && bag[SESSION_INDEX_KEY]));
      await store().sweepOrphans({ knownHistoryIds: known, now: now() });
      await writeIndexNow();
    } catch (error) {
      warn('housekeeping failed', error);
    }
  }

  async function setEnabled(enabled) {
    _enabled = enabled !== false;
    if (_enabled) return;
    // Turning recording off stops every live recording and keeps what exists.
    var keys = Object.keys(_state.recordings);
    for (var i = 0; i < keys.length; i++) {
      await finalizeRecording(_state.recordings[keys[i]], 'recording-disabled');
    }
  }

  // ---------------------------------------------------------------------------
  // Chrome event wiring
  // ---------------------------------------------------------------------------

  function onCommitted(details) {
    if (!details || details.frameId !== 0 || details.documentLifecycle === 'prerender') return;
    var found = recordingForTab(details.tabId);
    if (!found || !found.track.live) return;
    var verdict = recordableUrl(details.url);
    if (!verdict.ok) {
      appendMarker(found.rec, found.track, 'gap', { reason: verdict.reason, origin: verdict.origin });
      return;
    }
    inject(details.tabId, details.documentId || null);
    if (details.documentId) {
      var documentId = details.documentId;
      _deps.setTimeout(function () {
        if (!_helloSeen.has(documentId) && recordingForTab(details.tabId)) {
          _injecting.delete(details.tabId + ':' + documentId);
          inject(details.tabId, documentId);
        }
      }, HELLO_FALLBACK_MS);
    }
  }

  function onAlarm(alarm) {
    var name = alarm && alarm.name;
    if (typeof name !== 'string') return;
    if (name.indexOf(FINALIZE_ALARM_PREFIX) === 0) {
      restored().then(function () {
        var rec = recordingById(name.slice(FINALIZE_ALARM_PREFIX.length));
        if (!rec) return null;
        var anyLive = Object.keys(rec.tracks).some(function (key) { return rec.tracks[key].live; });
        return anyLive ? null : finalizeRecording(rec, 'idle');
      }).catch(function (error) { warn('finalize alarm failed', error); });
    } else if (name === SWEEP_ALARM) {
      housekeeping();
    }
  }

  function onStorageChanged(changes, area) {
    if (area !== 'local' || !changes) return;
    if (changes[ENABLED_KEY]) {
      restored().then(function () { return setEnabled(changes[ENABLED_KEY].newValue !== false); });
    }
    if (changes[SESSION_INDEX_KEY]) {
      var change = changes[SESSION_INDEX_KEY];
      restored().then(function () { return followSessionIndex(change.oldValue, change.newValue); })
        .catch(function (error) { warn('index follow failed', error); });
    }
  }

  function onTabRemoved(tabId) {
    restored().then(function () {
      if (_state.tabs[tabId]) return endTrack(tabId, 'tab-closed');
      return null;
    });
  }

  function init() {
    if (_initialized) return;
    var api = chromeApi();
    if (!api || !api.runtime) return;
    _initialized = true;
    try { api.runtime.onConnect.addListener(onConnect); } catch (error) { warn('onConnect unavailable', error); }
    try { api.webNavigation.onCommitted.addListener(onCommitted); } catch (error) { warn('webNavigation unavailable', error); }
    try { api.tabs.onRemoved.addListener(onTabRemoved); } catch (error) { warn('tabs.onRemoved unavailable', error); }
    try { api.storage.onChanged.addListener(onStorageChanged); } catch (error) { warn('storage.onChanged unavailable', error); }
    try { api.alarms.onAlarm.addListener(onAlarm); } catch (error) { warn('alarms unavailable', error); }
    try {
      api.alarms.get(SWEEP_ALARM, function (existing) {
        if (!existing) api.alarms.create(SWEEP_ALARM, { delayInMinutes: 5, periodInMinutes: 24 * 60 });
      });
    } catch (error) {
      warn('sweep alarm failed', error);
    }
    restored();
  }

  var api = {
    PORT_NAME: PORT_NAME,
    INDEX_KEY: INDEX_KEY,
    ENABLED_KEY: ENABLED_KEY,
    RECORDER_FILES: RECORDER_FILES.slice(),
    init: init,
    noteActionStart: noteActionStart,
    noteActionEnd: noteActionEnd,
    onVisualSessionCleared: onVisualSessionCleared,
    finalizeAutopilotSession: finalizeAutopilotSession,
    onHistoryDeleted: onHistoryDeleted,
    onHistoryCleared: onHistoryCleared,
    housekeeping: housekeeping,
    _test: {
      recordableUrl: recordableUrl,
      sanitizeLabel: sanitizeLabel,
      correlationFor: correlationFor,
      onConnect: onConnect,
      onCommitted: onCommitted,
      onAlarm: onAlarm,
      onStorageChanged: onStorageChanged,
      onTabRemoved: onTabRemoved,
      followSessionIndex: followSessionIndex,
      persistNow: persistNow,
      writeIndexNow: writeIndexNow,
      state: function () { return _state; },
      ports: function () { return _ports; },
      setDeps: function (deps) {
        Object.keys(deps || {}).forEach(function (key) { _deps[key] = deps[key]; });
      },
      reset: function () {
        _state = { recordings: {}, tabs: {} };
        _ports.clear();
        _pendingEnds.clear();
        _injecting.clear();
        _helloSeen.clear();
        _firstBatchWaiters.clear();
        _creating.clear();
        _enabled = true;
        _restorePromise = null;
        _persistTimer = null;
        _indexTimer = null;
        _initialized = false;
      }
    }
  };

  globalScope.FsbPageRecorderHost = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else init();
})(typeof self !== 'undefined' ? self : globalThis);
