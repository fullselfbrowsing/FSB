/* =============================================
   FSB Showcase - Dashboard JavaScript
   Agent monitoring, stats, WebSocket, run history
   ============================================= */

(function () {
  'use strict';

  var API_BASE = '';
  var STORAGE_KEY = 'fsb_dashboard_key';
  var SESSION_KEY = 'fsb_dashboard_session';
  var SESSION_EXPIRES_KEY = 'fsb_dashboard_expires';
  var POLL_INTERVAL = 30000;

  // State
  var hashKey = localStorage.getItem(STORAGE_KEY) || '';
  var sessionToken = localStorage.getItem(SESSION_KEY) || '';
  var sessionExpiresAt = localStorage.getItem(SESSION_EXPIRES_KEY) || '';
  var qrScanner = null;
  var stats = {};
  var runsOffset = 0;
  var runsLimit = 20;
  var pollTimer = null;
  var ws = null;
  var wsReconnectDelay = 0;
  var wsMaxReconnectDelay = 30000;
  var wsReconnectTimer = null;
  var wsPingTimer = null;
  var extensionOnline = false;

  // Task control state
  var taskState = 'idle'; // 'idle' | 'running' | 'success' | 'failed'
  var taskText = '';
  var taskStartTime = 0;
  var taskElapsedTimer = null;
  var lastProgressAction = '';

  // DOM preview state
  var previewState = 'hidden'; // 'hidden' | 'loading' | 'streaming' | 'disconnected' | 'frozen-disconnect' | 'frozen-complete' | 'error'
  var previewLayoutMode = 'inline'; // 'inline' | 'maximized' | 'pip' | 'fullscreen'
  var previewScale = 1;
  var previewViewer = null;
  var previewViewerHealth = null;
  var previewHideTimer = null;
  var previewSnapshotData = null; // Last snapshot for reconnect
  var lastPreviewScroll = { x: 0, y: 0 }; // Last known scroll position for maintenance after mutations
  var streamToggleOn = true;        // User toggle: on by default
  var streamTabUrl = '';             // Current streaming tab URL
  var lastSnapshotTime = 0;         // Timestamp of last snapshot received
  var pageReady = false;            // Extension reported a real page is loaded
  var remoteControlOn = false;      // Remote control mode toggle
  var previewLoadStartedAt = 0;     // Timestamp for the current preview recovery attempt
  var previewNotReadyReason = '';   // Last explicit not-ready reason from extension recovery
  var lastRecoveredStreamState = ''; // ready | recovering | not-ready | streaming
  var pendingStreamRecovery = null; // Watchdog timer for reconnect recovery
  var activePreviewStreamSessionId = '';
  var activePreviewSnapshotId = 0;
  var activePreviewTabId = null;
  var remoteControlCaptureActive = false;
  var staleMutationCount = 0;
  var mutationApplyFailures = 0;
  var mutationsAppliedTotal = 0;
  var lastFrameTime = 0;
  var previewResyncPending = false;
  var lastPreviewOverlayIdentity = {
    clientLabel: '',
    lifecycle: '',
    result: '',
    sessionToken: '',
    version: null
  };
  var DASHBOARD_TRANSPORT_DIAGNOSTIC_LIMIT = 100;
  var activeTaskRunId = '';
  var lastCompletedTaskRunId = '';
  var lastTaskStateUpdatedAt = 0;
  var taskRecoveryPending = false;
  var taskRecoveryStartedAt = 0;
  var taskRecoveryDeadlineMs = 20000;
  var taskRecoveryTimer = null;
  var taskRecoverySource = '';
  var TASK_RECOVERY_WAIT_TEXT = 'Waiting for task recovery...';
  var TASK_RECOVERY_TIMEOUT_TEXT = 'Task recovery timed out';
  var lastRemoteControlState = {
    enabled: false,
    attached: false,
    tabId: null,
    reason: 'user-stop',
    ownership: 'none'
  };
  var remoteControlRequestedAt = 0;
  var remoteControlRequestTimer = null;
  var REMOTE_CONTROL_START_GRACE_MS = 5000;

  function getDashboardTransportDiagnostics() {
    if (!window.__FSBDashboardTransportDiagnostics || typeof window.__FSBDashboardTransportDiagnostics !== 'object') {
      window.__FSBDashboardTransportDiagnostics = {
        events: [],
        counters: {
          byEvent: {},
          sentByType: {},
          receivedByType: {}
        },
        lastError: null,
        lastSnapshotRecovery: null
      };
    }

    var diagnostics = window.__FSBDashboardTransportDiagnostics;
    diagnostics.events = Array.isArray(diagnostics.events) ? diagnostics.events : [];
    diagnostics.counters = diagnostics.counters && typeof diagnostics.counters === 'object'
      ? diagnostics.counters
      : {};
    diagnostics.counters.byEvent = diagnostics.counters.byEvent && typeof diagnostics.counters.byEvent === 'object'
      ? diagnostics.counters.byEvent
      : {};
    diagnostics.counters.sentByType = diagnostics.counters.sentByType && typeof diagnostics.counters.sentByType === 'object'
      ? diagnostics.counters.sentByType
      : {};
    diagnostics.counters.receivedByType = diagnostics.counters.receivedByType && typeof diagnostics.counters.receivedByType === 'object'
      ? diagnostics.counters.receivedByType
      : {};
    if (!Object.prototype.hasOwnProperty.call(diagnostics, 'lastError')) diagnostics.lastError = null;
    if (!Object.prototype.hasOwnProperty.call(diagnostics, 'lastSnapshotRecovery')) diagnostics.lastSnapshotRecovery = null;
    return diagnostics;
  }

  function bumpDashboardTransportCounter(bucket, key) {
    if (!key) return;
    var diagnostics = getDashboardTransportDiagnostics();
    diagnostics.counters[bucket][key] = (diagnostics.counters[bucket][key] || 0) + 1;
  }

  function recordDashboardTransportEvent(eventName, details) {
    var diagnostics = getDashboardTransportDiagnostics();
    var entry = Object.assign({ event: eventName, ts: Date.now() }, details || {});
    diagnostics.events.push(entry);
    if (diagnostics.events.length > DASHBOARD_TRANSPORT_DIAGNOSTIC_LIMIT) {
      diagnostics.events.shift();
    }
    bumpDashboardTransportCounter('byEvent', eventName);
    return entry;
  }

  function recordDashboardTransportMessage(direction, type) {
    if (!type) return;
    bumpDashboardTransportCounter(direction === 'sent' ? 'sentByType' : 'receivedByType', type);
  }

  function recordDashboardTransportError(eventName, errorMessage, details) {
    var entry = recordDashboardTransportEvent(eventName, Object.assign({
      error: errorMessage || 'Unknown dashboard transport error'
    }, details || {}));
    getDashboardTransportDiagnostics().lastError = {
      event: eventName,
      error: entry.error,
      ts: entry.ts,
      type: entry.type || '',
      readyState: entry.readyState,
      context: entry.context || ''
    };
    return entry;
  }

  function recordDashboardSnapshotRecovery(details) {
    getDashboardTransportDiagnostics().lastSnapshotRecovery = Object.assign({
      ts: Date.now()
    }, details || {});
  }

  function sendDashboardWSMessage(type, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      recordDashboardTransportError('message-send-failed', 'Dashboard WebSocket not open', {
        type: type,
        readyState: ws ? ws.readyState : 'missing'
      });
      return false;
    }

    recordDashboardTransportMessage('sent', type);
    ws.send(JSON.stringify({
      type: type,
      payload: payload || {},
      ts: Date.now()
    }));
    return true;
  }

  function getPreviewMessageIdentity(payload) {
    return {
      streamSessionId: payload && payload.streamSessionId ? payload.streamSessionId : '',
      snapshotId: payload && payload.snapshotId ? payload.snapshotId : 0,
      tabId: payload && typeof payload.tabId === 'number' ? payload.tabId : null
    };
  }

  function resetPreviewGenerationState() {
    staleMutationCount = 0;
    mutationApplyFailures = 0;
    mutationsAppliedTotal = 0;
    previewViewerHealth = null;
    previewResyncPending = false;
  }

  function handlePreviewViewerHealth(health) {
    previewViewerHealth = health || null;
    if (previewViewerHealth) {
      if (typeof previewViewerHealth.staleMisses === 'number') {
        staleMutationCount = previewViewerHealth.staleMisses;
      }
      if (typeof previewViewerHealth.applyFailures === 'number') {
        mutationApplyFailures = previewViewerHealth.applyFailures;
      }
      if (typeof previewViewerHealth.lastFrameAt === 'number' && previewViewerHealth.lastFrameAt > 0) {
        lastFrameTime = previewViewerHealth.lastFrameAt;
      }
      if (typeof previewViewerHealth.lastSnapshotAt === 'number' && previewViewerHealth.lastSnapshotAt > 0) {
        lastSnapshotTime = previewViewerHealth.lastSnapshotAt;
      }
    }
    updatePreviewTooltip();
  }

  function handlePreviewViewerState(event) {
    var state = event && event.state ? event.state : '';
    recordDashboardTransportEvent('phantomstream-viewer-state', {
      state: state,
      reason: event && event.reason ? event.reason : ''
    });
    if (state === 'live' && previewState === 'loading' && previewSnapshotData) {
      setPreviewState('streaming');
    }
  }

  function ensurePreviewViewer() {
    if (previewViewer) return previewViewer;
    if (!previewViewerHost) {
      recordDashboardTransportError('phantomstream-viewer-missing', 'Preview viewer host missing', {
        type: 'dashboard-preview'
      });
      return null;
    }
    var bridge = window.FSBPhantomStreamViewer;
    if (!bridge || typeof bridge.createDashboardViewer !== 'function') {
      recordDashboardTransportError('phantomstream-viewer-missing', 'PhantomStream viewer bundle missing', {
        type: 'dashboard-preview'
      });
      return null;
    }
    previewViewer = bridge.createDashboardViewer({
      container: previewViewerHost,
      logger: console,
      onResync: function(payload) {
        payload = payload || {};
        requestPreviewResync(payload.reason || 'phantomstream-viewer-resync', payload);
      },
      onSubtreeRequest: function(payload) {
        recordDashboardTransportEvent('phantomstream-subtree-request-deferred', {
          requestId: payload && payload.requestId ? payload.requestId : '',
          nid: payload && payload.nid ? payload.nid : ''
        });
      },
      onUnsupportedControl: function(type) {
        recordDashboardTransportEvent('phantomstream-control-ignored', {
          type: type || ''
        });
      },
      onState: handlePreviewViewerState,
      onHealth: handlePreviewViewerHealth,
      // Phase 33 (MEDIA): live <video>/<audio> mirroring by reference.
      // 'reference' is the package default and the point of the feature; FSB's
      // capture-side masking (maskInputs + overlay skip) still applies. Switch
      // to 'poster' (poster image only, no media bytes) or 'off' for a more
      // conservative posture. The degrade callbacks are logger-trapped by the
      // package and only feed diagnostics.
      mediaMode: 'reference',
      onMediaBlocked: function(nid) {
        recordDashboardTransportEvent('phantomstream-media-blocked', {
          nid: nid || ''
        });
      },
      onMediaUnavailable: function(nid, reason) {
        recordDashboardTransportEvent('phantomstream-media-unavailable', {
          nid: nid || '',
          reason: reason || ''
        });
      }
    });
    return previewViewer;
  }

  function dispatchPreviewViewer(type, payload) {
    var viewer = ensurePreviewViewer();
    if (!viewer || typeof viewer.dispatch !== 'function') return false;
    viewer.dispatch(type, payload || {});
    return true;
  }

  function shouldAcceptPreviewMessage(payload, messageType) {
    var identity = getPreviewMessageIdentity(payload);

    if (!activePreviewStreamSessionId && !activePreviewSnapshotId) return true;
    if (!identity.streamSessionId && !identity.snapshotId) return true;

    if (identity.streamSessionId && activePreviewStreamSessionId && identity.streamSessionId !== activePreviewStreamSessionId) {
      recordDashboardTransportEvent('stale-preview-message-ignored', {
        type: messageType,
        streamSessionId: identity.streamSessionId,
        activeStreamSessionId: activePreviewStreamSessionId,
        snapshotId: identity.snapshotId,
        activeSnapshotId: activePreviewSnapshotId
      });
      return false;
    }

    if (identity.snapshotId && activePreviewSnapshotId && identity.snapshotId !== activePreviewSnapshotId) {
      recordDashboardTransportEvent('stale-preview-message-ignored', {
        type: messageType,
        streamSessionId: identity.streamSessionId || activePreviewStreamSessionId,
        activeStreamSessionId: activePreviewStreamSessionId,
        snapshotId: identity.snapshotId,
        activeSnapshotId: activePreviewSnapshotId
      });
      return false;
    }

    if (identity.tabId && activePreviewTabId && identity.tabId !== activePreviewTabId) {
      recordDashboardTransportEvent('stale-preview-message-ignored', {
        type: messageType,
        tabId: identity.tabId,
        activeTabId: activePreviewTabId,
        streamSessionId: identity.streamSessionId || activePreviewStreamSessionId,
        snapshotId: identity.snapshotId || activePreviewSnapshotId
      });
      return false;
    }

    return true;
  }

  function requestPreviewResync(reason, details) {
    if (previewResyncPending) return false;
    previewResyncPending = true;
    previewLoadStartedAt = Date.now();
    lastRecoveredStreamState = 'recovering';
    recordDashboardTransportEvent('mutation-resync-requested', Object.assign({
      reason: reason || 'unknown'
    }, details || {}));
    setPreviewLoadingText('Refreshing browser preview...');
    if (previewState !== 'streaming') {
      setPreviewState('loading');
    } else {
      setPreviewState('loading');
    }
    var statusSent = sendDashboardWSMessage('dash:request-status', {
      trigger: 'preview-resync',
      reason: reason || 'unknown'
    });
    var streamStartSent = sendDashboardWSMessage('dash:dom-stream-start', {
      trigger: 'preview-resync',
      reason: reason || 'unknown'
    });
    if (!statusSent && !streamStartSent) {
      previewResyncPending = false;
      return false;
    }
    if (!pendingStreamRecovery) {
      armPreviewRecoveryWatchdog('preview-resync:' + (reason || 'unknown'));
    }
    return true;
  }

  function getTaskPayloadUpdatedAt(payload) {
    return payload && (payload.updatedAt || payload.taskUpdatedAt) ? (payload.updatedAt || payload.taskUpdatedAt) : 0;
  }

  function getTaskRunId(payload) {
    return payload && payload.taskRunId ? payload.taskRunId : '';
  }

  function acceptRunningTaskPayload(payload) {
    var taskRunId = getTaskRunId(payload);
    if (!taskRunId) return true;
    if (lastCompletedTaskRunId && taskRunId === lastCompletedTaskRunId) return false;
    if (activeTaskRunId && taskRunId !== activeTaskRunId) return false;
    return true;
  }

  function acceptTerminalTaskPayload(payload) {
    var taskRunId = getTaskRunId(payload);
    if (!taskRunId) return true;
    if (activeTaskRunId && taskRunId !== activeTaskRunId) return false;
    if (lastCompletedTaskRunId && taskRunId === lastCompletedTaskRunId) {
      var payloadUpdatedAt = getTaskPayloadUpdatedAt(payload);
      if (!payloadUpdatedAt || payloadUpdatedAt <= lastTaskStateUpdatedAt) return false;
    }
    return true;
  }

  function markTaskRunCompleted(taskRunId) {
    activeTaskRunId = '';
    if (taskRunId) {
      lastCompletedTaskRunId = taskRunId;
    }
  }

  function rememberActiveTaskRun(taskRunId) {
    if (taskRunId) {
      activeTaskRunId = taskRunId;
    }
  }

  function getDashboardRuntimeStateHelpers() {
    return window.FSBDashboardRuntimeState || {};
  }

  function renderStateChip(element, baseClassName, label, tone) {
    if (!element) return;
    element.className = baseClassName;
    if (!label) {
      element.textContent = '';
      element.style.display = 'none';
      return;
    }
    element.textContent = label;
    element.className = baseClassName + ' dash-state-chip dash-state-chip--' + (tone || 'paused');
    element.style.display = '';
  }

  function normalizeRemoteControlReason(reason, fallback) {
    if (typeof reason !== 'string' || !reason) return fallback;
    switch (reason) {
      case 'ready':
      case 'retarget-required':
      case 'dispatch-failed':
      case 'debugger-blocked':
      case 'stream-not-ready':
      case 'user-stop':
      case 'no-tab':
        return reason;
      case 'active':
      case 'approved':
      case 'authorization-approved':
      case 'control-approved':
        return 'ready';
      case 'locked':
      case 'requesting':
        return 'requesting';
      case 'stopped':
        return 'user-stop';
      case 'denied':
      case 'authorization-denied':
      case 'control-denied':
        return 'debugger-blocked';
      default:
        return fallback;
    }
  }

  function normalizePhantomRemoteControlState(payload) {
    if (!payload || typeof payload.state !== 'string') return null;
    var tabId = typeof payload.tabId === 'number' ? payload.tabId : null;
    var ownership = typeof payload.ownership === 'string' && payload.ownership ? payload.ownership : null;

    switch (payload.state) {
      case 'active':
        return {
          enabled: true,
          attached: true,
          tabId: tabId,
          reason: normalizeRemoteControlReason(payload.reason, 'ready'),
          ownership: ownership || 'dashboard'
        };
      case 'requesting':
      case 'locked':
        return {
          enabled: false,
          attached: false,
          tabId: tabId,
          reason: normalizeRemoteControlReason(payload.reason, 'requesting'),
          ownership: ownership || 'none'
        };
      case 'denied':
        return {
          enabled: false,
          attached: false,
          tabId: tabId,
          reason: normalizeRemoteControlReason(payload.reason, 'debugger-blocked'),
          ownership: ownership || 'none'
        };
      case 'stopped':
        return {
          enabled: false,
          attached: false,
          tabId: tabId,
          reason: normalizeRemoteControlReason(payload.reason, 'user-stop'),
          ownership: ownership || 'none'
        };
      default:
        return null;
    }
  }

  function normalizeRemoteControlState(payload) {
    payload = payload || {};
    var phantomState = normalizePhantomRemoteControlState(payload);
    if (phantomState) return phantomState;
    return {
      enabled: !!payload.enabled,
      attached: !!payload.attached,
      tabId: typeof payload.tabId === 'number' ? payload.tabId : null,
      reason: typeof payload.reason === 'string' && payload.reason ? payload.reason : 'user-stop',
      ownership: typeof payload.ownership === 'string' && payload.ownership ? payload.ownership : 'none'
    };
  }

  function derivePreviewRuntimeSurface() {
    var helpers = getDashboardRuntimeStateHelpers();
    if (helpers.derivePreviewSurface) {
      return helpers.derivePreviewSurface({
        previewState: previewState,
        lastRecoveredStreamState: lastRecoveredStreamState,
        previewNotReadyReason: previewNotReadyReason,
        streamToggleOn: streamToggleOn,
        previewResyncPending: previewResyncPending,
        hasLiveSnapshot: !!previewSnapshotData
      });
    }
    return {
      chipLabel: '',
      chipTone: 'paused',
      detailText: '',
      showIframe: false,
      showLoading: false,
      showDisconnected: false
    };
  }

  function deriveRemoteRuntimeSurface(payload) {
    var remoteControlAvailable = canClickRemoteControlToggle();
    var helpers = getDashboardRuntimeStateHelpers();
    if (helpers.deriveRemoteControlSurface) {
      return helpers.deriveRemoteControlSurface({
        remoteControlOn: remoteControlOn,
        previewState: previewState,
        remoteControlAvailable: remoteControlAvailable,
        attached: payload.attached,
        reason: payload.reason,
        ownership: payload.ownership,
        requestPending: isRemoteControlStartPending()
      });
    }
    return {
      chipLabel: '',
      chipTone: 'paused',
      detailText: '',
      available: remoteControlAvailable,
      shouldForceDisable: payload.attached !== true || payload.reason !== 'ready'
    };
  }

  function deriveTaskRecoveryRuntimeSurface(incomingTaskRunId) {
    var helpers = getDashboardRuntimeStateHelpers();
    var timedOut = !!(taskRecoveryPending &&
      taskRecoveryStartedAt &&
      (Date.now() - taskRecoveryStartedAt >= taskRecoveryDeadlineMs));
    if (helpers.deriveTaskRecoverySurface) {
      return helpers.deriveTaskRecoverySurface({
        taskState: taskState,
        activeTaskRunId: activeTaskRunId,
        incomingTaskRunId: incomingTaskRunId || '',
        extensionOnline: extensionOnline,
        wsConnected: !!(ws && ws.readyState === WebSocket.OPEN),
        recoveryPending: taskRecoveryPending,
        recoveryTimedOut: timedOut,
        lastActionText: lastProgressAction || ''
      });
    }
    return {
      chipLabel: '',
      chipTone: 'paused',
      actionText: lastProgressAction || '',
      keepProgressView: false,
      shouldFail: timedOut
    };
  }

  function clearPreviewOverlayIdentity() {
    lastPreviewOverlayIdentity = {
      clientLabel: '',
      lifecycle: '',
      result: '',
      sessionToken: '',
      version: null
    };
  }

  function rememberPreviewOverlayIdentity(progressPayload) {
    if (!progressPayload || progressPayload.lifecycle === 'cleared') {
      clearPreviewOverlayIdentity();
      return;
    }

    lastPreviewOverlayIdentity = {
      clientLabel: String(progressPayload.clientLabel || '').trim(),
      lifecycle: String(progressPayload.lifecycle || '').trim(),
      result: String(progressPayload.result || '').trim(),
      sessionToken: String(progressPayload.sessionToken || '').trim(),
      version: typeof progressPayload.version === 'number' ? progressPayload.version : null
    };
  }

  function renderPreviewClientBadge(target, clientLabel) {
    if (!target) return;
    var label = String(clientLabel || '').trim();
    target.textContent = label;
    target.style.display = label ? 'inline-flex' : 'none';
  }

  function renderPreviewFrozenIdentity() {
    renderPreviewClientBadge(previewFrozenBadge, lastPreviewOverlayIdentity.clientLabel);
  }

  function clearTaskRecoveryTimer() {
    if (taskRecoveryTimer) {
      clearTimeout(taskRecoveryTimer);
      taskRecoveryTimer = null;
    }
  }

  function failTaskRecovery() {
    clearTaskRecoveryTimer();
    taskRecoveryPending = false;
    taskRecoveryStartedAt = 0;
    taskRecoverySource = 'timeout';
    var timeoutMessage = TASK_RECOVERY_TIMEOUT_TEXT;
    if (lastProgressAction) {
      timeoutMessage += ' -- was: ' + lastProgressAction;
    }
    setTaskState('failed', {
      error: timeoutMessage,
      elapsed: taskStartTime ? (Date.now() - taskStartTime) : 0
    });
  }

  function renderTaskRecoveryStatus(incomingTaskRunId, taskSource) {
    if (taskSource) {
      taskRecoverySource = taskSource;
    }
    var surface = deriveTaskRecoveryRuntimeSurface(incomingTaskRunId || '');
    if (surface.shouldFail) {
      failTaskRecovery();
      return;
    }
    renderStateChip(taskRecoveryStatus, 'dash-task-recovery-status', surface.chipLabel, surface.chipTone);
    if (taskState === 'running' && surface.keepProgressView && taskProgressView) {
      taskProgressView.style.display = 'block';
    }
    if (taskAction && taskState === 'running' && surface.actionText) {
      taskAction.style.display = '';
      taskAction.textContent = surface.actionText || TASK_RECOVERY_WAIT_TEXT;
    }
  }

  function setTaskRecoveryPending(on, reason) {
    if (on) {
      if (!taskRecoveryPending) {
        taskRecoveryStartedAt = Date.now();
      }
      taskRecoveryPending = true;
      taskRecoverySource = reason || taskRecoverySource || 'recovery';
      clearTaskRecoveryTimer();
      taskRecoveryTimer = setTimeout(function() {
        renderTaskRecoveryStatus(activeTaskRunId || '', taskRecoverySource);
      }, taskRecoveryDeadlineMs);
      renderTaskRecoveryStatus(activeTaskRunId || '', reason || taskRecoverySource);
      return;
    }
    taskRecoveryPending = false;
    taskRecoveryStartedAt = 0;
    taskRecoverySource = reason || '';
    clearTaskRecoveryTimer();
    renderTaskRecoveryStatus(activeTaskRunId || '', reason || '');
  }

  function maybeClearTaskRecoveryFromPayload(payload) {
    if (!payload) return false;
    var incomingTaskRunId = getTaskRunId(payload);
    var source = payload.taskSource || payload.snapshotSource || taskRecoverySource || '';
    if (source) taskRecoverySource = source;
    if (!taskRecoveryPending) {
      renderTaskRecoveryStatus(incomingTaskRunId, source);
      return false;
    }
    if (!incomingTaskRunId) {
      renderTaskRecoveryStatus('', source);
      return false;
    }
    if (!activeTaskRunId) {
      rememberActiveTaskRun(incomingTaskRunId);
    }
    if (activeTaskRunId && incomingTaskRunId === activeTaskRunId) {
      setTaskRecoveryPending(false, source);
      return true;
    }
    renderTaskRecoveryStatus(incomingTaskRunId, source);
    return false;
  }

  function renderRemoteControlState(payload, options) {
    options = options || {};
    var nextState = normalizeRemoteControlState(payload || lastRemoteControlState);
    var suppressStaleOff = isRemoteControlStartPending() && isBenignRemoteControlOff(nextState);
    if (!suppressStaleOff) {
      lastRemoteControlState = nextState;
    }
    var surface = deriveRemoteRuntimeSurface(lastRemoteControlState);
    renderStateChip(previewRcState, 'dash-preview-rc-state', surface.chipLabel, surface.chipTone);
    if (previewRcBtn) {
      previewRcBtn.disabled = !canClickRemoteControlToggle();
    }
    if (options.skipToggleSync) return surface;
    if (lastRemoteControlState.enabled && lastRemoteControlState.attached && lastRemoteControlState.reason === 'ready') {
      completeRemoteControlRequest();
      if (!remoteControlOn) {
        setRemoteControl(true, { silent: true, source: 'remote-state' });
      }
    } else if (surface.shouldForceDisable && remoteControlOn && !suppressStaleOff) {
      completeRemoteControlRequest();
      setRemoteControl(false, { silent: true, source: 'remote-state' });
    }
    return surface;
  }

  function handleRemoteControlState(payload) {
    renderRemoteControlState(payload);
  }

  function getRemoteViewportSize() {
    return {
      width: Math.max(1, previewSnapshotData && (previewSnapshotData.viewportWidth || previewSnapshotData.pageWidth) ? (previewSnapshotData.viewportWidth || previewSnapshotData.pageWidth) : 1),
      height: Math.max(1, previewSnapshotData && previewSnapshotData.viewportHeight ? previewSnapshotData.viewportHeight : 1)
    };
  }

  function clampRemotePreviewPoint(localX, localY) {
    if (previewViewer && typeof previewViewer.mapPointToViewport === 'function') {
      var mapped = previewViewer.mapPointToViewport({ x: localX, y: localY });
      if (mapped && mapped.inside && typeof mapped.x === 'number' && typeof mapped.y === 'number') {
        return { x: mapped.x, y: mapped.y };
      }
    }
    var viewport = getRemoteViewportSize();
    var scale = previewScale > 0 ? previewScale : 1;
    var x = Math.round(localX / scale);
    var y = Math.round(localY / scale);
    return {
      x: Math.max(0, Math.min(viewport.width - 1, x)),
      y: Math.max(0, Math.min(viewport.height - 1, y))
    };
  }

  function getRemoteModifiers(event) {
    var modifiers = 0;
    if (event.altKey) modifiers |= 1;
    if (event.ctrlKey) modifiers |= 2;
    if (event.metaKey) modifiers |= 4;
    if (event.shiftKey) modifiers |= 8;
    return modifiers;
  }

  function shouldInsertRemoteText(event) {
    if (!event || event.isComposing) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    return !!event.key && event.key.length === 1;
  }

  function setRemoteControlCaptureActive(active) {
    remoteControlCaptureActive = !!active;
    if (!remoteOverlay) return;

    if (remoteControlCaptureActive) {
      remoteOverlay.classList.add('capturing');
    } else {
      remoteOverlay.classList.remove('capturing');
    }
  }

  getDashboardTransportDiagnostics();

  // DOM refs
  var loginSection = document.getElementById('dash-login');
  var contentSection = document.getElementById('dash-content');
  var keyInput = document.getElementById('dash-key-input');
  var connectBtn = document.getElementById('dash-connect-btn');
  var disconnectBtn = document.getElementById('dash-disconnect-btn');
  var sseStatusEl = document.getElementById('dash-sse-status');
  var wakeBtn = document.getElementById('dash-wake-btn');
  var tabScan = document.getElementById('dash-tab-scan');
  var tabPaste = document.getElementById('dash-tab-paste');
  var tabScanContent = document.getElementById('tab-scan');
  var tabPasteContent = document.getElementById('tab-paste');
  var scanError = document.getElementById('dash-scan-error');
  var loginMessage = document.getElementById('dash-login-message');
  var pairedBadge = document.getElementById('dash-paired-badge');

  // Task control DOM refs
  var taskArea = document.getElementById('dash-task-area');
  var taskInput = document.getElementById('dash-task-input');
  var taskSubmitBtn = document.getElementById('dash-task-submit');
  var taskInputRow = document.getElementById('dash-task-input-row');
  var taskProgressView = document.getElementById('dash-task-progress');
  var taskTitle = document.getElementById('dash-task-title');
  var taskBarFill = document.getElementById('dash-task-bar-fill');
  var taskPercent = document.getElementById('dash-task-percent');
  var taskPhase = document.getElementById('dash-task-phase');
  var taskEta = document.getElementById('dash-task-eta');
  var taskElapsed = document.getElementById('dash-task-elapsed');
  var taskRecoveryStatus = document.getElementById('dash-task-recovery-status');
  var taskAction = document.getElementById('dash-task-action');
  var taskSuccessView = document.getElementById('dash-task-success');
  var taskSuccessStatus = document.getElementById('dash-task-success-status');
  var taskResultText = document.getElementById('dash-task-result-text');
  var taskInputNext = document.getElementById('dash-task-input-next');
  var taskSubmitNext = document.getElementById('dash-task-submit-next');
  var taskFailedView = document.getElementById('dash-task-failed');
  var taskFailedStatus = document.getElementById('dash-task-failed-status');
  var taskErrorText = document.getElementById('dash-task-error-text');
  var taskRetryBtn = document.getElementById('dash-task-retry');
  var taskInputRetry = document.getElementById('dash-task-input-retry');
  var taskSubmitRetry = document.getElementById('dash-task-submit-retry');
  var taskStopBtn = document.getElementById('dash-task-stop');
  var actionFeed = document.getElementById('dash-action-feed');
  var taskTimeoutTimer = null;
  var TASK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes -- matches extension SESSION_DEFAULTS.timeLimit
  var ACTION_FEED_MAX = 15;

  // DOM preview refs
  var previewContainer = document.getElementById('dash-preview');
  var previewViewerHost = document.getElementById('dash-preview-viewer');
  var previewLoading = document.getElementById('dash-preview-loading');
  var previewGlow = document.getElementById('dash-preview-glow');
  var previewProgress = document.getElementById('dash-preview-progress');
  var previewProgressBadge = document.getElementById('dash-preview-progress-badge');
  var previewProgressStatus = document.getElementById('dash-preview-progress-status');
  var previewProgressDetail = document.getElementById('dash-preview-progress-detail');
  var previewStatus = document.getElementById('dash-preview-status');
  var previewRcState = document.getElementById('dash-preview-rc-state');
  var previewDisconnected = document.getElementById('dash-preview-disconnected');
  var previewFrozenOverlay = document.getElementById('dash-preview-frozen-overlay');
  var previewFrozenBadge = document.getElementById('dash-preview-frozen-badge');
  var previewFrozenLabel = previewFrozenOverlay ? previewFrozenOverlay.querySelector('.dash-preview-frozen-label') : null;
  var previewError = document.getElementById('dash-preview-error');
  var previewDialog = document.getElementById('dash-preview-dialog');
  var previewDialogType = document.getElementById('dash-preview-dialog-type');
  var previewDialogMessage = document.getElementById('dash-preview-dialog-message');
  var previewToggle = document.getElementById('dash-preview-toggle');
  var previewTooltip = document.getElementById('dash-preview-tooltip');
  var previewPipBtn = document.getElementById('dash-preview-pip-btn');
  var previewMaximizeBtn = document.getElementById('dash-preview-maximize-btn');
  var previewFullscreenBtn = document.getElementById('dash-preview-fullscreen-btn');
  var previewRcBtn = document.getElementById('dash-preview-rc-btn');
  var remoteOverlay = document.getElementById('dash-remote-overlay');
  var previewFsExit = document.getElementById('dash-preview-fs-exit');
  // URL bar (Phase 212 / NAV-01)
  var previewUrlBar = document.getElementById('dash-preview-urlbar');
  var previewUrlInput = document.getElementById('dash-preview-urlbar-input');
  var previewUrlForm = document.getElementById('dash-preview-urlbar-form');
  var previewUrlBack = document.getElementById('dash-preview-urlbar-back');
  var previewUrlForward = document.getElementById('dash-preview-urlbar-forward');
  var previewUrlReload = document.getElementById('dash-preview-urlbar-reload');
  // Restricted-tab placeholder (Phase 212 / STREAM-06)
  var previewRestricted = document.getElementById('dash-preview-restricted');
  var previewRestrictedTitle = document.getElementById('dash-preview-restricted-title');
  var previewRestrictedUrl = document.getElementById('dash-preview-restricted-url');
  var lastKnownStreamUrl = '';

  // --- Init ---
  if (sessionToken && sessionExpiresAt) {
    // Check local expiry first (avoid server call if obviously expired)
    if (new Date(sessionExpiresAt) > new Date()) {
      validateSession();
    } else {
      clearSession();
      showExpiredLogin();
    }
  } else if (hashKey) {
    // Legacy: user had hash key but no session token (pre-pairing upgrade)
    validateAndConnect(hashKey);
  }

  // --- Event Listeners ---
  if (connectBtn) {
    connectBtn.addEventListener('click', function () {
      var key = keyInput.value.trim();
      if (!key) return;
      connect(key);
    });
  }

  if (keyInput) {
    keyInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var key = keyInput.value.trim();
        if (key) connect(key);
      }
    });
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', disconnect);
  }

  // Task control listeners
  function setupTaskInput(inputEl, submitEl) {
    if (inputEl) {
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && inputEl.value.trim()) {
          submitTask(inputEl.value.trim());
        }
      });
    }
    if (submitEl) {
      submitEl.addEventListener('click', function () {
        var text = inputEl ? inputEl.value.trim() : '';
        if (text) submitTask(text);
      });
    }
  }

  setupTaskInput(taskInput, taskSubmitBtn);
  setupTaskInput(taskInputNext, taskSubmitNext);
  setupTaskInput(taskInputRetry, taskSubmitRetry);

  if (taskRetryBtn) {
    taskRetryBtn.addEventListener('click', function () {
      if (taskText) submitTask(taskText);
    });
  }

  if (taskStopBtn) {
    taskStopBtn.addEventListener('click', function () {
      sendDashboardWSMessage('dash:stop-task', {});
      // Show brief "Stopping..." state while extension processes the stop
      if (taskAction) {
        taskAction.style.display = '';
        taskAction.textContent = 'Stopping...';
      }
      if (taskStopBtn) taskStopBtn.disabled = true;
    });
  }

  // Remote control toggle
  if (previewRcBtn) {
    previewRcBtn.addEventListener('click', function () {
      handleRemoteControlToggleClick();
    });
  }

  // --- Task Control ---

  function submitTask(text) {
    console.log('[FSB-DASH] submitTask called:', text);
    console.log('[FSB-DASH] taskState:', taskState, 'extensionOnline:', extensionOnline, 'ws:', ws ? 'exists' : 'null', 'ws.readyState:', ws ? ws.readyState : 'N/A');
    if (taskState === 'running') { console.log('[FSB-DASH] blocked: task already running'); return; }
    if (!text) { console.log('[FSB-DASH] blocked: empty text'); return; }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log('[FSB-DASH] blocked: WS not open');
      if (taskAction) { taskAction.textContent = 'Not connected to server.'; taskAction.style.display = 'block'; }
      return;
    }
    if (!extensionOnline) {
      console.log('[FSB-DASH] blocked: extension offline');
      if (taskAction) { taskAction.textContent = 'Extension is offline.'; taskAction.style.display = 'block'; }
      return;
    }

    taskText = text;
    taskStartTime = Date.now();
    activeTaskRunId = '';
    lastCompletedTaskRunId = '';
    lastTaskStateUpdatedAt = taskStartTime;
    lastProgressAction = '';
    setTaskRecoveryPending(false, 'task-submit');

    ws.send(JSON.stringify({
      type: 'dash:task-submit',
      payload: { task: text },
      ts: Date.now()
    }));

    setTaskState('running', { task: text });
  }

  function setTaskState(newState, data) {
    taskState = newState;
    data = data || {};

    // Clear task timeout
    if (taskTimeoutTimer) { clearTimeout(taskTimeoutTimer); taskTimeoutTimer = null; }
    if (newState !== 'running') {
      taskRecoveryPending = false;
      taskRecoveryStartedAt = 0;
      taskRecoverySource = '';
      clearTaskRecoveryTimer();
    }
    // Hide stop button for non-running states
    if (newState !== 'running' && taskStopBtn) taskStopBtn.style.display = 'none';
    // Clear elapsed timer
    if (taskElapsedTimer) {
      clearInterval(taskElapsedTimer);
      taskElapsedTimer = null;
    }

    // Hide all sub-views
    if (taskInputRow) taskInputRow.style.display = 'none';
    if (taskProgressView) taskProgressView.style.display = 'none';
    if (taskSuccessView) taskSuccessView.style.display = 'none';
    if (taskFailedView) taskFailedView.style.display = 'none';

    switch (newState) {
      case 'idle':
        activeTaskRunId = '';
        lastCompletedTaskRunId = '';
        lastTaskStateUpdatedAt = 0;
        if (taskInputRow) taskInputRow.style.display = 'flex';
        if (taskInput) { taskInput.value = ''; taskInput.disabled = false; }
        if (taskSubmitBtn) taskSubmitBtn.disabled = false;
        // Reset progress bar
        if (taskBarFill) { taskBarFill.style.width = '0%'; taskBarFill.className = 'dash-task-bar-fill'; }
        if (actionFeed) actionFeed.innerHTML = '';
        if (previewContainer) previewContainer.classList.remove('dash-preview-automating');
        renderTaskRecoveryStatus('', '');
        break;

      case 'running':
        if (taskProgressView) taskProgressView.style.display = 'block';
        if (taskTitle) taskTitle.textContent = data.task || taskText || '';
        if (taskBarFill) { taskBarFill.style.width = '0%'; taskBarFill.className = 'dash-task-bar-fill'; }
        if (taskPercent) taskPercent.textContent = '0%';
        if (taskPhase) taskPhase.textContent = '';
        if (taskEta) taskEta.textContent = '';
        if (taskElapsed) taskElapsed.textContent = 'Running for 0s';
        if (taskAction) { taskAction.textContent = 'Working...'; taskAction.style.display = ''; }
        if (actionFeed) { actionFeed.innerHTML = ''; actionFeed.style.display = ''; }
        if (taskStopBtn) taskStopBtn.style.display = '';
        // Start elapsed timer
        taskElapsedTimer = setInterval(function () {
          if (taskElapsed && taskStartTime) {
            taskElapsed.textContent = 'Running for ' + formatDuration(Date.now() - taskStartTime);
          }
        }, 1000);
        // Start task timeout
        if (taskTimeoutTimer) clearTimeout(taskTimeoutTimer);
        taskTimeoutTimer = setTimeout(function () {
          if (taskState === 'running') {
            setTaskState('failed', { error: 'Task timed out (10 minutes)' });
          }
        }, TASK_TIMEOUT_MS);
        // Disable all task inputs during run
        disableAllTaskInputs(true);
        if (previewContainer) previewContainer.classList.add('dash-preview-automating');
        renderTaskRecoveryStatus(activeTaskRunId || '', taskRecoverySource);
        break;

      case 'success':
        if (taskProgressView) taskProgressView.style.display = 'block';
        if (taskSuccessView) taskSuccessView.style.display = 'block';
        // Fill progress bar to 100% green
        if (taskBarFill) { taskBarFill.style.width = '100%'; taskBarFill.className = 'dash-task-bar-fill dash-task-bar-success'; }
        if (taskPercent) taskPercent.textContent = '100%';
        // Hide metadata during success
        if (taskPhase) taskPhase.textContent = '';
        if (taskEta) taskEta.textContent = '';
        if (taskElapsed) taskElapsed.textContent = '';
        if (taskAction) taskAction.style.display = 'none';
        if (actionFeed) actionFeed.style.display = 'none';
        // Render structured result card
        renderResultCard(taskSuccessView, data, true);
        // Show next-task input
        disableAllTaskInputs(false);
        if (taskInputNext) { taskInputNext.value = ''; }
        if (previewContainer) previewContainer.classList.remove('dash-preview-automating');
        renderTaskRecoveryStatus('', '');
        break;

      case 'failed':
        if (taskProgressView) taskProgressView.style.display = 'block';
        if (taskFailedView) taskFailedView.style.display = 'block';
        // Progress bar turns red
        if (taskBarFill) { taskBarFill.className = 'dash-task-bar-fill dash-task-bar-failed'; }
        // Hide metadata
        if (taskPhase) taskPhase.textContent = '';
        if (taskEta) taskEta.textContent = '';
        if (taskElapsed) taskElapsed.textContent = '';
        if (taskAction) taskAction.style.display = 'none';
        if (actionFeed) actionFeed.style.display = 'none';
        // Render structured result card for failure
        renderResultCard(taskFailedView, data, false);
        // Show retry + next-task input
        disableAllTaskInputs(false);
        if (taskInputRetry) { taskInputRetry.value = ''; }
        if (taskSubmitRetry) taskSubmitRetry.disabled = true;
        if (previewContainer) previewContainer.classList.remove('dash-preview-automating');
        renderTaskRecoveryStatus('', '');
        break;
    }
  }

  /**
   * Renders a structured result card inside the given container.
   * Used for both success and failed/stopped task completion states.
   * Displays: status badge, elapsed time, action count, cost, final URL, and summary/error.
   */
  function renderResultCard(container, data, isSuccess) {
    if (!container) return;
    // Find or create the result card div
    var card = container.querySelector('.dash-result-card');
    if (!card) {
      card = document.createElement('div');
      card.className = 'dash-result-card';
      // Insert as first child (before the input-again row)
      var firstInput = container.querySelector('.dash-task-input-again');
      if (firstInput) {
        container.insertBefore(card, firstInput);
      } else {
        container.appendChild(card);
      }
    }

    var taskStatus = data.taskStatus || (isSuccess ? 'success' : 'failed');
    var badgeClass = 'dash-result-badge-' + taskStatus;
    var badgeLabels = { success: 'Success', partial: 'Partial', failed: 'Failed', stopped: 'Stopped' };
    var badgeLabel = badgeLabels[taskStatus] || taskStatus;

    var elapsed = data.elapsed || 0;
    var actionCount = data.actionCount || 0;
    var totalCost = data.totalCost || 0;
    var finalUrl = data.finalUrl || '';
    var pageTitle = data.pageTitle || '';
    var summary = data.summary || '';
    var error = data.error || '';

    var html = '<div class="dash-result-card-header">';
    html += '<span class="dash-result-badge ' + badgeClass + '">' + escapeHtml(badgeLabel) + '</span>';
    html += '<span class="dash-result-elapsed">' + formatDuration(elapsed) + '</span>';
    html += '</div>';

    // Metrics row
    html += '<div class="dash-result-metrics">';
    html += '<div class="dash-result-metric"><span class="dash-result-metric-val">' + actionCount + '</span><span class="dash-result-metric-label">Actions</span></div>';
    html += '<div class="dash-result-metric"><span class="dash-result-metric-val">$' + totalCost.toFixed(4) + '</span><span class="dash-result-metric-label">Cost</span></div>';
    if (finalUrl) {
      var displayUrl = finalUrl.length > 50 ? finalUrl.substring(0, 50) + '...' : finalUrl;
      html += '<div class="dash-result-metric dash-result-metric-url"><span class="dash-result-metric-val"><a href="' + escapeAttr(finalUrl) + '" target="_blank" rel="noopener" title="' + escapeAttr(finalUrl) + '">' + escapeHtml(displayUrl) + '</a></span><span class="dash-result-metric-label">Final URL</span></div>';
    }
    html += '</div>';

    // AI summary or error message
    if (isSuccess && summary) {
      html += '<div class="dash-result-summary">' + escapeHtml(summary) + '</div>';
    } else if (!isSuccess && error) {
      html += '<div class="dash-result-error">' + escapeHtml(error) + '</div>';
    }

    card.innerHTML = html;

    // Hide the old status/text elements (they are now replaced by the card)
    var oldStatus = container.querySelector('.dash-task-status');
    var oldResult = container.querySelector('.dash-task-result');
    var oldError = container.querySelector('.dash-task-error');
    if (oldStatus) oldStatus.style.display = 'none';
    if (oldResult) oldResult.style.display = 'none';
    if (oldError) oldError.style.display = 'none';
  }

  // [FSB Field Audit] Consumer: remote dashboard progress display
  // Reads: data.iteration, data.progress, data.phase, data.action
  // Display-filtered: none (remote dashboard shows full detail for monitoring)
  // Pass-through: all fields (iteration, progress, phase, action, eta, elapsed)
  function updateTaskProgress(payload) {
    var payloadUpdatedAt = getTaskPayloadUpdatedAt(payload);
    if (payloadUpdatedAt && lastTaskStateUpdatedAt && payloadUpdatedAt < lastTaskStateUpdatedAt) return;
    if (!acceptRunningTaskPayload(payload)) return;
    if (payloadUpdatedAt) lastTaskStateUpdatedAt = payloadUpdatedAt;
    rememberActiveTaskRun(getTaskRunId(payload));
    maybeClearTaskRecoveryFromPayload(payload);
    if (taskState !== 'running') return;

    var progress = payload.progress || 0;
    if (taskBarFill) {
      var width = progress > 0 ? Math.max(2, progress) : 0;
      taskBarFill.style.width = width + '%';
    }
    if (taskPercent) taskPercent.textContent = Math.round(progress) + '%';

    // Phase label: map internal names to display labels
    var phaseLabels = {
      navigation: 'Navigating',
      extraction: 'Reading page',
      writing: 'Filling form',
      unknown: 'Working'
    };
    if (taskPhase && payload.phase) {
      taskPhase.textContent = phaseLabels[payload.phase] || payload.phase;
    }

    if (taskEta && payload.eta) {
      taskEta.textContent = '~' + payload.eta;
    }

    // Elapsed is handled by the interval timer, but update from server if available
    if (taskElapsed && payload.elapsed) {
      taskElapsed.textContent = 'Running for ' + formatDuration(payload.elapsed);
    }

    if (taskAction && payload.action) {
      taskAction.style.display = '';
      taskAction.textContent = payload.action;
      lastProgressAction = payload.action;
    }
    // Append to scrolling action feed
    if (actionFeed && payload.action) {
      var entry = document.createElement('div');
      entry.className = 'dash-action-feed-entry';
      var ts = document.createElement('span');
      ts.className = 'dash-action-feed-ts';
      var now = new Date();
      ts.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
      var txt = document.createElement('span');
      txt.className = 'dash-action-feed-text';
      txt.textContent = payload.action;
      entry.appendChild(ts);
      entry.appendChild(txt);
      actionFeed.appendChild(entry);
      // Trim to max entries
      while (actionFeed.children.length > ACTION_FEED_MAX) {
        actionFeed.removeChild(actionFeed.firstChild);
      }
      // Auto-scroll to bottom
      actionFeed.scrollTop = actionFeed.scrollHeight;
    }
    renderTaskRecoveryStatus(getTaskRunId(payload), payload.taskSource || '');
  }

  function handleTaskComplete(payload) {
    if (!acceptTerminalTaskPayload(payload)) return;
    var payloadUpdatedAt = getTaskPayloadUpdatedAt(payload);
    if (payloadUpdatedAt && lastTaskStateUpdatedAt && payloadUpdatedAt < lastTaskStateUpdatedAt) return;
    if (payloadUpdatedAt) lastTaskStateUpdatedAt = payloadUpdatedAt;
    // Handle immediate rejections (extension busy, no tab, etc.)
    if (taskState === 'idle' && !payload.success) {
      // Briefly show the error in the task area without full state transition
      if (taskAction) {
        taskAction.style.display = '';
        taskAction.textContent = payload.error || 'Task could not be started';
        setTimeout(function () {
          if (taskState === 'idle' && taskAction) taskAction.style.display = 'none';
        }, 5000);
      }
      return;
    }

    // Re-enable stop button for next task
    if (taskStopBtn) taskStopBtn.disabled = false;

    maybeClearTaskRecoveryFromPayload(payload);
    markTaskRunCompleted(getTaskRunId(payload));

    if (payload.success) {
      setTaskState('success', {
        summary: payload.summary || '',
        elapsed: payload.elapsed || 0,
        actionCount: payload.actionCount || 0,
        totalCost: payload.totalCost || 0,
        finalUrl: payload.finalUrl || '',
        pageTitle: payload.pageTitle || '',
        taskStatus: payload.taskStatus || 'success'
      });
    } else if (payload.stopped) {
      // User-initiated stop (per D-06): show "Stopped by user" + last action context
      var stopMsg = 'Stopped by user';
      var actionContext = payload.lastAction || lastProgressAction;
      if (actionContext) {
        stopMsg += ' -- was: ' + actionContext;
      }
      setTaskState('failed', {
        error: stopMsg,
        elapsed: payload.elapsed || 0,
        actionCount: payload.actionCount || 0,
        totalCost: payload.totalCost || 0,
        finalUrl: payload.finalUrl || '',
        pageTitle: payload.pageTitle || '',
        taskStatus: 'stopped'
      });
    } else {
      setTaskState('failed', {
        error: payload.error || 'Task could not be completed',
        elapsed: payload.elapsed || 0,
        actionCount: payload.actionCount || 0,
        totalCost: payload.totalCost || 0,
        finalUrl: payload.finalUrl || '',
        pageTitle: payload.pageTitle || '',
        taskStatus: payload.taskStatus || 'failed'
      });
    }

    // Per D-06/D-07: Freeze preview on final page state with "Task Complete" badge
    if (previewState === 'streaming' || previewState === 'frozen-disconnect') {
      setPreviewState('frozen-complete');
    }

    // Reset last progress action for next task
    lastProgressAction = '';
  }

  function applyRecoveredTaskState(snapshot) {
    if (!snapshot) return;

    var recoveredStatus = snapshot.taskStatus || (snapshot.taskRunning ? 'running' : 'idle');
    var recoveredUpdatedAt = getTaskPayloadUpdatedAt(snapshot);
    if (recoveredUpdatedAt && lastTaskStateUpdatedAt && recoveredUpdatedAt < lastTaskStateUpdatedAt) return;
    if (recoveredStatus === 'running' && !acceptRunningTaskPayload(snapshot)) return;
    if (recoveredStatus !== 'running' && recoveredStatus !== 'idle' && !acceptTerminalTaskPayload(snapshot)) return;
    if (recoveredUpdatedAt) lastTaskStateUpdatedAt = recoveredUpdatedAt;
    maybeClearTaskRecoveryFromPayload(snapshot);

    if (snapshot.task) taskText = snapshot.task;

    if (recoveredStatus === 'running') {
      rememberActiveTaskRun(getTaskRunId(snapshot));
      taskStartTime = Date.now() - (snapshot.elapsed || 0);
      setTaskState('running', { task: snapshot.task || taskText || '' });
      updateTaskProgress({
        progress: snapshot.progress || 0,
        phase: snapshot.phase || '',
        eta: snapshot.eta || null,
        elapsed: snapshot.elapsed || 0,
        action: snapshot.action || snapshot.lastAction || 'Reconnected...',
        updatedAt: recoveredUpdatedAt || Date.now()
      });
      return;
    }

    if (recoveredStatus === 'success') {
      markTaskRunCompleted(getTaskRunId(snapshot));
      setTaskState('success', {
        summary: snapshot.summary || '',
        elapsed: snapshot.elapsed || 0,
        actionCount: snapshot.actionCount || 0,
        totalCost: snapshot.totalCost || 0,
        finalUrl: snapshot.finalUrl || '',
        pageTitle: snapshot.pageTitle || '',
        taskStatus: snapshot.taskStatus || 'success'
      });
      return;
    }

    if (recoveredStatus === 'stopped') {
      markTaskRunCompleted(getTaskRunId(snapshot));
      var stoppedMessage = 'Stopped by user';
      var stoppedAction = snapshot.lastAction || snapshot.action || lastProgressAction;
      if (stoppedAction) stoppedMessage += ' -- was: ' + stoppedAction;
      setTaskState('failed', {
        error: stoppedMessage,
        elapsed: snapshot.elapsed || 0,
        actionCount: snapshot.actionCount || 0,
        totalCost: snapshot.totalCost || 0,
        finalUrl: snapshot.finalUrl || '',
        pageTitle: snapshot.pageTitle || '',
        taskStatus: 'stopped'
      });
      return;
    }

    if (recoveredStatus === 'failed') {
      markTaskRunCompleted(getTaskRunId(snapshot));
      setTaskState('failed', {
        error: snapshot.error || 'Task could not be completed',
        elapsed: snapshot.elapsed || 0,
        actionCount: snapshot.actionCount || 0,
        totalCost: snapshot.totalCost || 0,
        finalUrl: snapshot.finalUrl || '',
        pageTitle: snapshot.pageTitle || '',
        taskStatus: snapshot.taskStatus || 'failed'
      });
    }
  }

  function disableAllTaskInputs(disabled) {
    var inputs = [taskInput, taskInputNext, taskInputRetry];
    var btns = [taskSubmitBtn, taskSubmitNext, taskSubmitRetry];
    inputs.forEach(function (el) { if (el) el.disabled = disabled; });
    btns.forEach(function (el) { if (el) el.disabled = disabled; });
  }

  function showTaskArea() {
    if (taskArea) taskArea.style.display = 'block';
    if (taskState === 'idle') {
      setTaskState('idle');
    }
  }

  function hideTaskArea() {
    if (taskArea) taskArea.style.display = 'none';
  }

  function updateTaskOfflineState() {
    if (!taskArea) return;
    if (!extensionOnline) {
      taskArea.classList.add('dash-task-offline');
      if (taskState === 'idle' && taskInput) {
        taskInput.placeholder = 'Extension offline...';
      }
      if (taskState === 'running') {
        setTaskRecoveryPending(true, (!ws || ws.readyState !== WebSocket.OPEN) ? 'ws-disconnected' : 'extension-offline');
      }
      // Show wake button when WS connected but extension offline
      if (wakeBtn && ws && ws.readyState === WebSocket.OPEN) {
        wakeBtn.style.display = 'inline-flex';
      }
    } else {
      taskArea.classList.remove('dash-task-offline');
      if (taskState === 'idle' && taskInput) {
        taskInput.placeholder = 'What should FSB do?';
        taskInput.disabled = false;
      }
      // Hide wake button when extension comes online
      if (wakeBtn) wakeBtn.style.display = 'none';
    }
    renderTaskRecoveryStatus(activeTaskRunId || '', taskRecoverySource);
  }

  // Wake Extension button -- sends status request to poke the service worker awake
  if (wakeBtn) {
    wakeBtn.addEventListener('click', function () {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      wakeBtn.disabled = true;
      wakeBtn.innerHTML = '<span class="dash-spinner"></span> Waking...';
      // Send status request which wakes the service worker via WS message
      sendDashboardWSMessage('dash:request-status', { trigger: 'wake-button' });
      // Also request stream start in case it's needed
      sendDashboardWSMessage('dash:dom-stream-start', { trigger: 'wake-button' });
      recordDashboardTransportEvent('recovery-request-sent', {
        trigger: 'wake-button',
        requestStatusSent: true,
        streamStartSent: true
      });
      // Reset button after 5s if extension doesn't respond
      setTimeout(function () {
        if (wakeBtn && !extensionOnline) {
          wakeBtn.disabled = false;
          wakeBtn.innerHTML = '<i class="fa-solid fa-bell"></i> Wake Extension';
        }
      }, 5000);
    });
  }

  // --- Auth ---

  function connect(key) {
    clearError();
    connectBtn.innerHTML = '<span class="dash-spinner"></span> Connecting...';
    connectBtn.disabled = true;

    validateKey(key).then(function (result) {
      connectBtn.innerHTML = '<i class="fa-solid fa-plug"></i> Connect';
      connectBtn.disabled = false;

      if (result.valid) {
        hashKey = key;
        localStorage.setItem(STORAGE_KEY, key);
        // For paste-key users, clear any stale session
        clearSession();
        showDashboard();
        connectWS();
      } else {
        showError(result.error || 'Invalid hash key. Check your key and try again.');
      }
    }).catch(function () {
      connectBtn.innerHTML = '<i class="fa-solid fa-plug"></i> Connect';
      connectBtn.disabled = false;
      showError('Could not connect to server. Check your connection and try again.');
    });
  }

  function validateAndConnect(key) {
    validateKey(key).then(function (result) {
      if (result.valid) {
        showDashboard();
        connectWS();
      } else {
        // Stored key is invalid, clear it
        localStorage.removeItem(STORAGE_KEY);
        hashKey = '';
      }
    }).catch(function () {
      // Server unreachable -- show dashboard anyway with cached key
      showDashboard();
    });
  }

  function disconnect() {
    // Revoke session on server (fire and forget)
    if (sessionToken) {
      apiFetch('/api/pair/revoke', {
        method: 'POST',
        headers: { 'X-FSB-Session-Token': sessionToken }
      }).catch(function () {});
    }

    hashKey = '';
    localStorage.removeItem(STORAGE_KEY);
    clearSession();
    disconnectWS();
    stopQRScanner();
    showLogin();
  }

  function validateKey(key) {
    return apiFetch('/api/auth/validate', {
      headers: { 'X-FSB-Hash-Key': key }
    });
  }

  // --- UI Toggle ---

  function showDashboard() {
    loginSection.classList.add('fade-out');
    setTimeout(function () {
      loginSection.style.display = 'none';
      loginSection.classList.remove('fade-out');
      contentSection.style.display = 'block';
      contentSection.classList.add('fade-in');
      showTaskArea();
    }, 400);
    stopQRScanner();
    if (pairedBadge) pairedBadge.style.display = 'inline-flex';
    if (loginMessage) loginMessage.style.display = 'none';
  }

  function showLogin() {
    contentSection.style.display = 'none';
    contentSection.classList.remove('fade-in', 'fade-dim');
    loginSection.style.display = '';
    loginSection.classList.remove('fade-out');
    hideTaskArea();
    if (keyInput) keyInput.value = '';
    if (pairedBadge) pairedBadge.style.display = 'none';
    // Reset to Scan QR tab
    if (tabScan && tabPaste && tabScanContent && tabPasteContent) {
      tabScan.classList.add('active');
      tabPaste.classList.remove('active');
      tabScanContent.style.display = 'block';
      tabPasteContent.style.display = 'none';
    }
  }

  function showError(msg) {
    clearError();
    var el = document.createElement('p');
    el.className = 'dash-login-error';
    el.textContent = msg;
    el.id = 'dash-error';
    var form = document.querySelector('.dash-login-form');
    form.parentNode.insertBefore(el, form.nextSibling);
  }

  function clearError() {
    var existing = document.getElementById('dash-error');
    if (existing) existing.remove();
  }

  // --- Session Management ---

  function validateSession() {
    apiFetch('/api/pair/validate', {
      headers: { 'X-FSB-Session-Token': sessionToken }
    }).then(function (result) {
      if (result.valid) {
        hashKey = result.hashKey;
        localStorage.setItem(STORAGE_KEY, hashKey);
        showDashboard();
        connectWS();
      } else {
        clearSession();
        if (result.reason === 'expired') {
          showExpiredLogin();
        } else {
          showLogin();
        }
      }
    }).catch(function () {
      // Server unreachable - try with stored hashKey
      if (hashKey) {
        showDashboard();
        connectWS();
      }
    });
  }

  function storeSession(newHashKey, newSessionToken, newExpiresAt) {
    hashKey = newHashKey;
    sessionToken = newSessionToken;
    sessionExpiresAt = newExpiresAt;
    localStorage.setItem(STORAGE_KEY, hashKey);
    localStorage.setItem(SESSION_KEY, sessionToken);
    localStorage.setItem(SESSION_EXPIRES_KEY, sessionExpiresAt);
  }

  function clearSession() {
    sessionToken = '';
    sessionExpiresAt = '';
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_EXPIRES_KEY);
  }

  function showExpiredLogin() {
    showLogin();
    if (loginMessage) {
      loginMessage.textContent = 'Session expired. Open the Sync tab in FSB to scan a fresh QR code.';
      loginMessage.className = 'dash-login-message expired';
      loginMessage.style.display = 'block';
    }
  }

  // --- Tab Switching ---

  if (tabScan) {
    tabScan.addEventListener('click', function () { switchTab('scan'); });
  }
  if (tabPaste) {
    tabPaste.addEventListener('click', function () { switchTab('paste'); });
  }

  // Auto-start QR scanner if login card is visible, Scan tab is active, and no credentials exist
  if (loginSection && loginSection.style.display !== 'none' && tabScan && tabScan.classList.contains('active') && !hashKey && !sessionToken) {
    startQRScanner();
  }

  function switchTab(tab) {
    if (tab === 'scan') {
      tabScan.classList.add('active');
      tabPaste.classList.remove('active');
      tabScanContent.style.display = 'block';
      tabPasteContent.style.display = 'none';
      startQRScanner();
    } else {
      tabPaste.classList.add('active');
      tabScan.classList.remove('active');
      tabPasteContent.style.display = 'block';
      tabScanContent.style.display = 'none';
      stopQRScanner();
    }
    // Clear any error messages
    if (scanError) { scanError.style.display = 'none'; }
    clearError();
  }

  // --- QR Scanner ---

  function startQRScanner() {
    if (qrScanner) return; // Already running
    if (typeof Html5Qrcode === 'undefined') {
      showScanError('QR scanner not available');
      switchTab('paste');
      return;
    }

    qrScanner = new Html5Qrcode('qr-reader');

    qrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      function onScanSuccess(decodedText) {
        qrScanner.stop().then(function () {
          qrScanner = null;
          handleScannedQR(decodedText);
        }).catch(function () {
          qrScanner = null;
          handleScannedQR(decodedText);
        });
      },
      function onScanFailure() {
        // Ignore per-frame decode failures - this is normal
      }
    ).catch(function (err) {
      qrScanner = null;
      // Camera permission denied or not available
      var msg = 'Camera unavailable';
      if (err && err.toString().indexOf('NotAllowedError') !== -1) {
        msg = 'Camera unavailable';
      } else if (err && err.toString().indexOf('NotFoundError') !== -1) {
        msg = 'Camera unavailable';
      }
      showScanError(msg);
      switchTab('paste');
    });
  }

  function stopQRScanner() {
    if (qrScanner) {
      var scanner = qrScanner;
      qrScanner = null;
      try {
        scanner.stop().catch(function () { /* scanner may not have started yet */ });
      } catch (_) { /* stop() threw synchronously */ }
    }
  }

  function handleScannedQR(decodedText) {
    try {
      var data = JSON.parse(decodedText);
      if (!data.t) throw new Error('No token in QR data');

      // Show connecting state
      if (tabScanContent) {
        tabScanContent.innerHTML = '<p class="dash-scan-instruction">Connecting...</p>';
      }

      // Exchange token for session
      var exchangeUrl = (data.s || '') + '/api/pair/exchange';
      // If server URL matches our origin, use relative URL
      if (data.s && data.s === location.origin) {
        exchangeUrl = '/api/pair/exchange';
      }
      // Default to relative if no server URL
      if (!data.s) {
        exchangeUrl = '/api/pair/exchange';
      }

      fetch(exchangeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.t })
      }).then(function (resp) {
        if (!resp.ok) {
          return resp.json().then(function (body) {
            throw new Error(body.error || 'Exchange failed');
          });
        }
        return resp.json();
      }).then(function (result) {
        // Store session and connect
        storeSession(result.hashKey, result.sessionToken, result.expiresAt);
        showDashboard();
        connectWS();
      }).catch(function (err) {
        showScanError(err.message || 'Scan failed -- paste your key instead');
        // Restore scan tab content
        if (tabScanContent) {
          tabScanContent.innerHTML =
            '<p class="dash-scan-instruction">Point camera at QR code in FSB extension</p>' +
            '<div id="qr-reader" class="dash-qr-reader" aria-label="QR code camera viewfinder"></div>' +
            '<p id="dash-scan-error" class="dash-scan-error" style="display: none;"></p>';
        }
        switchTab('paste');
      });

    } catch (err) {
      showScanError('Scan failed -- paste your key instead');
      switchTab('paste');
    }
  }

  function showScanError(msg) {
    var el = document.getElementById('dash-scan-error');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
    }
  }

  // --- Helper Functions ---

  // --- DOM Preview ---

  function setPreviewLoadingText(text) {
    if (!previewLoading) return;
    var label = previewLoading.querySelector('span');
    if (label) label.textContent = text || 'Connecting to browser...';
  }

  function setPreviewDisconnectedText(text) {
    if (!previewDisconnected) return;
    var label = previewDisconnected.querySelector('span');
    if (label) label.textContent = text || 'Stream disconnected';
  }

  function getPreviewNotReadyText(reason) {
    switch (reason) {
      case 'restricted-tab':
        return 'Open a normal browser page to resume preview';
      case 'tab-closed':
        return 'The streaming tab was closed. Open another page to resume preview';
      case 'waiting-for-page-ready':
        return 'Waiting for the browser page to finish loading';
      case 'no-streamable-tab':
      default:
        return 'Open a browser tab with a normal web page to start preview';
    }
  }

  function clearPendingStreamRecovery() {
    if (pendingStreamRecovery) {
      clearTimeout(pendingStreamRecovery);
      pendingStreamRecovery = null;
    }
  }

  function armPreviewRecoveryWatchdog(trigger) {
    clearPendingStreamRecovery();

    if (!streamToggleOn) return;

    pendingStreamRecovery = setTimeout(function() {
      pendingStreamRecovery = null;

      if (!streamToggleOn || previewState === 'streaming') return;
      if (lastRecoveredStreamState === 'not-ready') return;

      lastRecoveredStreamState = 'not-ready';
      pageReady = false;
      previewNotReadyReason = previewNotReadyReason || 'waiting-for-page-ready';
      setPreviewDisconnectedText(getPreviewNotReadyText(previewNotReadyReason));
      setPreviewState('disconnected');
      updatePreviewTooltip();
      console.warn('[FSB-DASH] Stream recovery watchdog expired:', trigger);
    }, 5000);
  }

  function scheduleStreamRecovery(trigger) {
    var requestStatusSent = sendDashboardWSMessage('dash:request-status', { trigger: trigger });

    // Do not restart stream after task completion -- user wants to see final page state
    if (previewState === 'frozen-complete') {
      clearPendingStreamRecovery();
      return;
    }

    if (!streamToggleOn) {
      clearPendingStreamRecovery();
      updatePreviewTooltip();
      return;
    }

    previewLoadStartedAt = Date.now();
    previewNotReadyReason = '';
    pageReady = false;
    lastRecoveredStreamState = 'recovering';
    setPreviewLoadingText(trigger === 'extension-online'
      ? 'Reconnecting to browser preview...'
      : 'Connecting to browser...');
    setPreviewDisconnectedText('Stream disconnected');
    setPreviewState('loading');
    var streamStartSent = sendDashboardWSMessage('dash:dom-stream-start', { trigger: trigger });
    recordDashboardTransportEvent('recovery-request-sent', {
      trigger: trigger,
      requestStatusSent: requestStatusSent,
      streamStartSent: streamStartSent,
      streamToggleOn: streamToggleOn
    });

    armPreviewRecoveryWatchdog(trigger);
    updatePreviewTooltip();
  }

  function showRestrictedPlaceholder(payload) {
    if (!previewRestricted) return;
    var url = (payload && payload.url) || '';
    var pageType = (payload && payload.pageType) || 'New Tab';
    if (previewRestrictedTitle) previewRestrictedTitle.textContent = pageType;
    if (previewRestrictedUrl) previewRestrictedUrl.textContent = url;
    previewRestricted.style.display = 'flex';
  }
  function hideRestrictedPlaceholder() {
    if (previewRestricted) previewRestricted.style.display = 'none';
  }
  function syncUrlBarFromStream(url) {
    if (!previewUrlInput) return;
    if (typeof url !== 'string') return;
    if (document.activeElement === previewUrlInput) return; // don't clobber user typing
    if (url && url !== lastKnownStreamUrl) {
      lastKnownStreamUrl = url;
      previewUrlInput.value = url;
    }
  }

  function handleRecoveredStreamState(payload) {
    var status = payload.status || 'not-ready';
    var streamIntentActive = payload.streamIntentActive !== false;
    streamTabUrl = payload.url || '';
    syncUrlBarFromStream(streamTabUrl);
    activePreviewTabId = typeof payload.tabId === 'number' ? payload.tabId : activePreviewTabId;
    lastRecoveredStreamState = status;
    previewNotReadyReason = payload.reason || '';

    if (status === 'not-ready') {
      recordDashboardTransportEvent('stream-state-not-ready', {
        type: 'ext:stream-state',
        reason: previewNotReadyReason || '',
        tabId: payload.tabId || null,
        source: payload.source || ''
      });
      pageReady = false;
      resetPreviewGenerationState();
      clearPendingStreamRecovery();
      // Phase 212 / STREAM-06: render a friendly placeholder for restricted
      // tabs (chrome://newtab, chrome://settings, etc.) so the user can use
      // the URL bar to navigate away.
      if (previewNotReadyReason === 'restricted-tab') {
        showRestrictedPlaceholder(payload);
        setPreviewState('restricted');
      } else {
        hideRestrictedPlaceholder();
        setPreviewDisconnectedText(getPreviewNotReadyText(previewNotReadyReason));
        setPreviewState('disconnected');
      }
      updatePreviewTooltip();
      return;
    }
    // Stream is ready or recovering -- clear any restricted placeholder.
    hideRestrictedPlaceholder();

    if (!streamToggleOn || !streamIntentActive) {
      if (!streamToggleOn) clearPendingStreamRecovery();
      updatePreviewTooltip();
      return;
    }

    if (status === 'ready') {
      recordDashboardTransportEvent('stream-state-ready', {
        type: 'ext:stream-state',
        reason: previewNotReadyReason || '',
        tabId: payload.tabId || null,
        source: payload.source || ''
      });
      pageReady = true;
      previewNotReadyReason = '';
      previewLoadStartedAt = previewLoadStartedAt || Date.now();
      setPreviewLoadingText('Waiting for live page preview...');
      if (previewState !== 'streaming') setPreviewState('loading');
      if (!pendingStreamRecovery) armPreviewRecoveryWatchdog('stream-state:ready');
    } else if (status === 'recovering') {
      recordDashboardTransportEvent('stream-state-recovering', {
        type: 'ext:stream-state',
        reason: previewNotReadyReason || '',
        tabId: payload.tabId || null,
        source: payload.source || ''
      });
      pageReady = false;
      previewLoadStartedAt = Date.now();
      setPreviewLoadingText('Recovering browser preview...');
      if (previewState !== 'streaming') setPreviewState('loading');
      if (!pendingStreamRecovery) armPreviewRecoveryWatchdog('stream-state:recovering');
    }

    updatePreviewTooltip();
  }

  function setPreviewState(newState) {
    previewState = newState;
    var previewSurface;

    // Clear any pending hide timer
    if (previewHideTimer) {
      clearTimeout(previewHideTimer);
      previewHideTimer = null;
    }

    // Reset all sub-views
    if (previewContainer) previewContainer.style.display = 'none';
    if (previewLoading) previewLoading.style.display = 'none';
    if (previewViewerHost) previewViewerHost.style.display = 'none';
    if (previewGlow) previewGlow.style.display = 'none';
    if (previewProgress) previewProgress.style.display = 'none';
    if (previewDialog) previewDialog.style.display = 'none';
    if (previewStatus) { previewStatus.style.display = 'none'; previewStatus.className = 'dash-preview-status'; }
    if (previewDisconnected) previewDisconnected.style.display = 'none';
    if (previewFrozenOverlay) previewFrozenOverlay.style.display = 'none';
    if (previewError) previewError.style.display = 'none';
    renderStateChip(previewRcState, 'dash-preview-rc-state', '', '');

    switch (newState) {
      case 'hidden':
        // Container not visible
        if (previewStatus) previewStatus.textContent = '';
        break;

      case 'error':
        if (previewContainer) previewContainer.style.display = '';
        if (previewError) previewError.style.display = 'flex';
        break;

      default:
        previewSurface = derivePreviewRuntimeSurface();
        if (previewContainer) previewContainer.style.display = '';
        if (previewLoading && previewSurface.showLoading) {
          previewLoading.style.display = 'flex';
          setPreviewLoadingText(previewSurface.detailText);
        }
        if (previewViewerHost && previewSurface.showIframe) {
          previewViewerHost.style.display = '';
        }
        if (previewDisconnected && previewSurface.showDisconnected) {
          previewDisconnected.style.display = 'flex';
          setPreviewDisconnectedText(previewSurface.detailText);
        }
        if (previewFrozenOverlay && previewSurface.showFrozenOverlay) {
          previewFrozenOverlay.style.display = 'flex';
          renderPreviewFrozenIdentity();
          if (previewFrozenLabel) {
            previewFrozenLabel.textContent = previewSurface.frozenLabel || 'Frozen';
            previewFrozenLabel.className = 'dash-preview-frozen-label ' + (previewSurface.frozenType || '');
          }
        }
        renderStateChip(previewStatus, 'dash-preview-status', previewSurface.chipLabel, previewSurface.chipTone);
        break;
    }
    var keepRemoteUntilAuthoritativeState = newState !== 'paused' &&
      (isRemoteControlStartPending() || isDashboardWSOpen());
    if (newState !== 'streaming' && newState !== 'frozen-disconnect' && newState !== 'frozen-complete' && remoteControlOn && !keepRemoteUntilAuthoritativeState) {
      setRemoteControl(false, { silent: newState !== 'paused', source: 'preview-state' });
    }
    renderRemoteControlState(lastRemoteControlState, { skipToggleSync: true });
  }

  function isRemoteControlToggleAvailable() {
    if (isDashboardWSOpen()) return true;
    if (isRemoteControlStartPending()) return true;
    if (previewState === 'streaming') return true;
    if (previewState !== 'loading') return false;
    if (!streamToggleOn || previewNotReadyReason) return false;
    return pageReady === true ||
      lastRecoveredStreamState === 'ready' ||
      lastRecoveredStreamState === 'recovering';
  }

  function isDashboardWSOpen() {
    return !!(ws && ws.readyState === WebSocket.OPEN);
  }

  function canClickRemoteControlToggle() {
    return remoteControlOn || isRemoteControlStartPending() || isDashboardWSOpen();
  }

  function isRemoteControlStartPending() {
    return remoteControlRequestedAt > 0 &&
      Date.now() - remoteControlRequestedAt < REMOTE_CONTROL_START_GRACE_MS;
  }

  function isBenignRemoteControlOff(state) {
    if (!state || state.enabled || state.attached) return false;
    return state.reason === 'user-stop' || state.reason === 'stream-not-ready';
  }

  function clearRemoteControlRequestTimer() {
    if (remoteControlRequestTimer) {
      clearTimeout(remoteControlRequestTimer);
      remoteControlRequestTimer = null;
    }
  }

  function completeRemoteControlRequest() {
    remoteControlRequestedAt = 0;
    clearRemoteControlRequestTimer();
  }

  function armRemoteControlRequestTimeout() {
    clearRemoteControlRequestTimer();
    remoteControlRequestTimer = setTimeout(function () {
      remoteControlRequestTimer = null;
      if (!remoteControlRequestedAt || !remoteControlOn) return;
      remoteControlRequestedAt = 0;
      lastRemoteControlState = {
        enabled: false,
        attached: false,
        tabId: activePreviewTabId,
        reason: 'request-timeout',
        ownership: 'none'
      };
      setRemoteControl(false, { silent: true, source: 'request-timeout' });
      renderRemoteControlState(lastRemoteControlState, { skipToggleSync: true });
    }, REMOTE_CONTROL_START_GRACE_MS);
  }

  function handleRemoteControlToggleClick() {
    if (remoteControlOn) {
      setRemoteControl(false);
      return;
    }
    if (!isDashboardWSOpen()) {
      lastRemoteControlState = {
        enabled: false,
        attached: false,
        tabId: activePreviewTabId,
        reason: 'dashboard-disconnected',
        ownership: 'none'
      };
      renderRemoteControlState(lastRemoteControlState, { skipToggleSync: true });
      return;
    }
    setRemoteControl(true);
  }

  function handleDOMSnapshot(payload) {
    if (!payload || !payload.html) {
      recordDashboardTransportError('dom-snapshot-invalid', 'DOM snapshot missing html payload', {
        type: 'ext:dom-snapshot'
      });
      setPreviewState('error');
      return;
    }

    recordDashboardTransportEvent('dom-snapshot-received', {
      type: 'ext:dom-snapshot',
      mutationCount: 0,
      streamSessionId: payload.streamSessionId || '',
      snapshotId: payload.snapshotId || 0,
      tabId: typeof payload.tabId === 'number' ? payload.tabId : null,
      viewportWidth: payload.viewportWidth || 0,
      viewportHeight: payload.viewportHeight || 0
    });

    var identity = getPreviewMessageIdentity(payload);
    var replacingPreviewStream = false;
    if (identity.streamSessionId && activePreviewStreamSessionId && identity.streamSessionId !== activePreviewStreamSessionId) {
      replacingPreviewStream = true;
    }
    if (identity.snapshotId && activePreviewSnapshotId && identity.snapshotId !== activePreviewSnapshotId) {
      replacingPreviewStream = true;
    }
    if (identity.tabId && activePreviewTabId && identity.tabId !== activePreviewTabId) {
      replacingPreviewStream = true;
    }

    activePreviewStreamSessionId = identity.streamSessionId || '';
    activePreviewSnapshotId = identity.snapshotId || 0;
    activePreviewTabId = identity.tabId;
    resetPreviewGenerationState();
    lastPreviewScroll.x = payload.scrollX || 0;
    lastPreviewScroll.y = payload.scrollY || 0;

    // Reset glow, progress, and dialog overlays on new snapshot
    if (previewGlow) previewGlow.style.display = 'none';
    if (previewProgress) previewProgress.style.display = 'none';
    if (previewDialog) previewDialog.style.display = 'none';
    if (replacingPreviewStream) {
      recordDashboardTransportEvent('preview-stream-replaced', {
        type: 'ext:dom-snapshot',
        streamSessionId: activePreviewStreamSessionId,
        snapshotId: activePreviewSnapshotId,
        tabId: activePreviewTabId
      });
    }

    previewSnapshotData = payload;
    lastSnapshotTime = Date.now();
    lastFrameTime = lastSnapshotTime;
    previewLoadStartedAt = 0;
    pageReady = true;
    lastRecoveredStreamState = 'streaming';
    previewNotReadyReason = '';
    clearPendingStreamRecovery();
    updatePreviewTooltip();

    try {
      if (!dispatchPreviewViewer('ext:dom-snapshot', payload)) {
        throw new Error('phantomstream-viewer-unavailable');
      }
      updatePreviewScale();
      setPreviewState('streaming');
    } catch (e) {
      console.warn('[FSB-DASH] DOM snapshot render failed:', e.message);
      recordDashboardTransportError('dom-snapshot-render-failed', e.message, {
        type: 'ext:dom-snapshot'
      });
      setPreviewState('error');
    }
  }

  function updatePreviewScale() {
    if (!previewViewerHost || !previewContainer || !previewSnapshotData) return;

    var containerWidth = previewContainer.clientWidth;
    var pageWidth = previewSnapshotData.viewportWidth || previewSnapshotData.pageWidth || 1920;
    var pageHeight = previewSnapshotData.viewportHeight || 1080;

    // Dynamic container height from viewport aspect ratio (LAYOUT-03)
    var computedHeight = (pageHeight / pageWidth) * containerWidth;
    // Floor at 200px, cap at 90vh for inline mode
    if (previewLayoutMode === 'inline') {
      computedHeight = Math.max(200, Math.min(computedHeight, window.innerHeight * 0.9));
    }
    // In maximized/fullscreen, use full available height
    if (previewLayoutMode === 'maximized' || previewLayoutMode === 'fullscreen') {
      computedHeight = previewContainer.clientHeight; // CSS handles it (100vh)
    }

    if (previewLayoutMode === 'inline' || previewLayoutMode === 'pip') {
      previewContainer.style.height = computedHeight + 'px';
    }

    // Scale to fit width -- overflow clips bottom (prevents responsive text reflow)
    previewScale = containerWidth / pageWidth;

    if (previewViewer && typeof previewViewer.getViewportMapping === 'function') {
      try {
        var mapping = previewViewer.getViewportMapping();
        if (mapping && mapping.scale && typeof mapping.scale.s === 'number' && mapping.scale.s > 0) {
          previewScale = mapping.scale.s;
        }
      } catch (e) { /* viewer mapping is advisory */ }
    }
  }

  function setRemoteControl(on, options) {
    options = options || {};
    if (on && options.silent !== true && !isDashboardWSOpen()) {
      lastRemoteControlState = {
        enabled: false,
        attached: false,
        tabId: activePreviewTabId,
        reason: 'dashboard-disconnected',
        ownership: 'none'
      };
      renderRemoteControlState(lastRemoteControlState, { skipToggleSync: true });
      return;
    }
    remoteControlOn = on;
    if (on && options.silent !== true) {
      remoteControlRequestedAt = Date.now();
      lastRemoteControlState = {
        enabled: false,
        attached: false,
        tabId: activePreviewTabId,
        reason: 'requesting',
        ownership: 'dashboard'
      };
      armRemoteControlRequestTimeout();
    } else if (!on) {
      completeRemoteControlRequest();
    }
    setRemoteControlCaptureActive(false);
    if (remoteOverlay) {
      remoteOverlay.tabIndex = on ? 0 : -1;
      remoteOverlay.setAttribute('role', 'application');
      remoteOverlay.setAttribute('aria-label', 'Remote browser control');
      remoteOverlay.style.display = on ? '' : 'none';
      if (on) {
        remoteOverlay.classList.add('active');
      } else {
        remoteOverlay.classList.remove('active');
        if (document.activeElement === remoteOverlay) {
          remoteOverlay.blur();
        }
      }
    }
    if (previewContainer) {
      if (on) {
        previewContainer.classList.add('dash-rc-active');
      } else {
        previewContainer.classList.remove('dash-rc-active');
      }
    }
    if (previewRcBtn) {
      if (on) {
        previewRcBtn.classList.add('dash-rc-on');
        previewRcBtn.title = 'Disable remote control';
        previewRcBtn.innerHTML = '<i class="fa-solid fa-hand-pointer"></i>';
      } else {
        previewRcBtn.classList.remove('dash-rc-on');
        previewRcBtn.title = 'Remote control';
        previewRcBtn.innerHTML = '<i class="fa-solid fa-hand-pointer"></i>';
      }
    }
    // Notify extension to attach/detach debugger
    if (options.silent !== true && isDashboardWSOpen()) {
      ws.send(JSON.stringify({
        type: on ? 'dash:remote-control-start' : 'dash:remote-control-stop',
        payload: {},
        ts: Date.now()
      }));
      ws.send(JSON.stringify({
        type: on ? 'dash:ps-control-request' : 'dash:ps-control-stop',
        payload: {},
        ts: Date.now()
      }));
    }
    renderRemoteControlState(lastRemoteControlState, { skipToggleSync: true });
  }

  function setPreviewLayout(mode) {
    // Remove all layout classes
    if (previewContainer) {
      previewContainer.classList.remove('dash-preview-maximized', 'dash-preview-pip');
    }
    document.body.classList.remove('dash-layout-maximized');

    previewLayoutMode = mode;

    switch (mode) {
      case 'maximized':
        if (previewContainer) previewContainer.classList.add('dash-preview-maximized');
        document.body.classList.add('dash-layout-maximized');
        if (previewMaximizeBtn) previewMaximizeBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
        if (previewMaximizeBtn) previewMaximizeBtn.title = 'Minimize';
        break;

      case 'pip':
        if (previewContainer) previewContainer.classList.add('dash-preview-pip');
        if (previewPipBtn) previewPipBtn.innerHTML = '<i class="fa-solid fa-arrow-down-left-and-up-right-to-center"></i>';
        if (previewPipBtn) previewPipBtn.title = 'Exit picture-in-picture';
        break;

      case 'fullscreen':
        if (previewFsExit) previewFsExit.style.display = 'block';
        if (previewFullscreenBtn) previewFullscreenBtn.innerHTML = '<i class="fa-solid fa-down-left-and-up-right-to-center"></i>';
        if (previewFullscreenBtn) previewFullscreenBtn.title = 'Exit fullscreen';
        break;

      case 'inline':
      default:
        // Reset button icons
        if (previewMaximizeBtn) previewMaximizeBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
        if (previewMaximizeBtn) previewMaximizeBtn.title = 'Maximize';
        if (previewPipBtn) previewPipBtn.innerHTML = '<i class="fa-solid fa-window-restore"></i>';
        if (previewPipBtn) previewPipBtn.title = 'Picture-in-picture';
        if (previewFullscreenBtn) previewFullscreenBtn.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>';
        if (previewFullscreenBtn) previewFullscreenBtn.title = 'Fullscreen';
        if (previewFsExit) previewFsExit.style.display = 'none';
        // Reset PiP drag positioning
        if (previewContainer) {
          previewContainer.style.left = '';
          previewContainer.style.top = '';
          previewContainer.style.bottom = '';
          previewContainer.style.right = '';
          previewContainer.style.height = '';
        }
        break;
    }

    // Recalculate scale after layout change
    setTimeout(function() { updatePreviewScale(); }, 50);
  }

  function toggleMaximize() {
    if (previewLayoutMode === 'maximized') {
      setPreviewLayout('inline');
    } else {
      // Exit any other mode first
      setPreviewLayout('maximized');
    }
  }

  function togglePip() {
    if (previewLayoutMode === 'pip') {
      setPreviewLayout('inline');
    } else {
      setPreviewLayout('pip');
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement === previewContainer) {
      document.exitFullscreen();
    } else if (previewContainer) {
      previewContainer.requestFullscreen().catch(function(err) {
        console.warn('[FSB-DASH] Fullscreen request failed:', err.message);
      });
      setPreviewLayout('fullscreen');
    }
  }

  // Exit fullscreen when user presses Escape or browser exits fullscreen
  document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement && previewLayoutMode === 'fullscreen') {
      setPreviewLayout('inline');
    }
  });

  // PiP drag handler -- header acts as drag handle in PiP mode
  (function initPipDrag() {
    var isDragging = false;
    var dragStartX = 0;
    var dragStartY = 0;
    var containerStartLeft = 0;
    var containerStartTop = 0;
    var previewHeader = document.querySelector('.dash-preview-header');

    if (!previewHeader || !previewContainer) return;

    previewHeader.addEventListener('mousedown', function(e) {
      if (previewLayoutMode !== 'pip') return;
      // Don't drag if clicking a button
      if (e.target.closest('.dash-preview-btn') || e.target.closest('.dash-preview-controls button')) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      var rect = previewContainer.getBoundingClientRect();
      containerStartLeft = rect.left;
      containerStartTop = rect.top;
      previewHeader.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var dx = e.clientX - dragStartX;
      var dy = e.clientY - dragStartY;
      previewContainer.style.left = (containerStartLeft + dx) + 'px';
      previewContainer.style.top = (containerStartTop + dy) + 'px';
      // Override bottom/right from CSS class since we are repositioning
      previewContainer.style.bottom = 'auto';
      previewContainer.style.right = 'auto';
    });

    document.addEventListener('mouseup', function() {
      if (!isDragging) return;
      isDragging = false;
      if (previewHeader) previewHeader.style.cursor = '';
    });
  })();

  // Fullscreen exit overlay -- shows on mouse move, hides after 2s
  (function initFsExitOverlay() {
    var fsHideTimer = null;

    if (!previewContainer || !previewFsExit) return;

    previewContainer.addEventListener('mousemove', function() {
      if (previewLayoutMode !== 'fullscreen') return;
      // Show exit button
      previewFsExit.style.opacity = '1';
      // Reset hide timer
      if (fsHideTimer) clearTimeout(fsHideTimer);
      fsHideTimer = setTimeout(function() {
        if (previewFsExit) previewFsExit.style.opacity = '0';
      }, 2000);
    });

    // Wire exit button click
    var fsExitBtn = previewFsExit.querySelector('.dash-preview-fs-exit-btn');
    if (fsExitBtn) {
      fsExitBtn.addEventListener('click', function() {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
      });
    }
  })();

  // Remote control event forwarding
  (function initRemoteControl() {
    if (!remoteOverlay) return;

    remoteOverlay.tabIndex = -1;
    remoteOverlay.setAttribute('role', 'application');
    remoteOverlay.setAttribute('aria-label', 'Remote browser control');

    remoteOverlay.addEventListener('focus', function () {
      if (!remoteControlOn) return;
      setRemoteControlCaptureActive(true);
    });

    remoteOverlay.addEventListener('blur', function () {
      setRemoteControlCaptureActive(false);
    });

    // --- CLICK forwarding (CONTROL-01) ---
    remoteOverlay.addEventListener('mousedown', function (e) {
      if (!remoteControlOn || !ws || ws.readyState !== WebSocket.OPEN) return;
      e.preventDefault();
      e.stopPropagation();
      remoteOverlay.focus({ preventScroll: true });

      // Get click position relative to the preview container
      var rect = remoteOverlay.getBoundingClientRect();
      var point = clampRemotePreviewPoint(e.clientX - rect.left, e.clientY - rect.top);

      ws.send(JSON.stringify({
        type: 'dash:remote-click',
        payload: { x: point.x, y: point.y, button: 'left', modifiers: getRemoteModifiers(e) },
        ts: Date.now()
      }));
    });

    // --- KEYBOARD forwarding (CONTROL-02) ---
    remoteOverlay.addEventListener('keydown', function (e) {
      if (!remoteControlOn || !remoteControlCaptureActive || !ws || ws.readyState !== WebSocket.OPEN) return;

      e.preventDefault();
      e.stopPropagation();

      if (shouldInsertRemoteText(e)) {
        ws.send(JSON.stringify({
          type: 'dash:remote-key',
          payload: {
            type: 'insertText',
            key: e.key,
            code: e.code,
            text: e.key,
            modifiers: getRemoteModifiers(e)
          },
          ts: Date.now()
        }));
        return;
      }

      ws.send(JSON.stringify({
        type: 'dash:remote-key',
        payload: {
          type: 'keyDown',
          key: e.key,
          code: e.code,
          text: '',
          modifiers: getRemoteModifiers(e)
        },
        ts: Date.now()
      }));
    });

    remoteOverlay.addEventListener('keyup', function (e) {
      if (!remoteControlOn || !remoteControlCaptureActive || !ws || ws.readyState !== WebSocket.OPEN) return;
      if (shouldInsertRemoteText(e)) return;

      e.preventDefault();
      e.stopPropagation();

      ws.send(JSON.stringify({
        type: 'dash:remote-key',
        payload: {
          type: 'keyUp',
          key: e.key,
          code: e.code,
          text: '',
          modifiers: getRemoteModifiers(e)
        },
        ts: Date.now()
      }));
    });

    // --- SCROLL forwarding (CONTROL-03) ---
    // Throttle scroll events to ~60fps (16ms) to avoid overwhelming the WS connection
    var scrollThrottleTimer = null;
    remoteOverlay.addEventListener('wheel', function (e) {
      if (!remoteControlOn || !ws || ws.readyState !== WebSocket.OPEN) return;
      e.preventDefault();
      e.stopPropagation();
      remoteOverlay.focus({ preventScroll: true });

      if (scrollThrottleTimer) return;
      scrollThrottleTimer = setTimeout(function () { scrollThrottleTimer = null; }, 16);

      // Get scroll position relative to the preview
      var rect = remoteOverlay.getBoundingClientRect();
      var point = clampRemotePreviewPoint(e.clientX - rect.left, e.clientY - rect.top);

      ws.send(JSON.stringify({
        type: 'dash:remote-scroll',
        payload: { x: point.x, y: point.y, deltaX: Math.round(e.deltaX), deltaY: Math.round(e.deltaY) },
        ts: Date.now()
      }));
    }, { passive: false }); // passive: false required to call preventDefault on wheel
  })();

  window.addEventListener('resize', function() {
    if (previewState === 'streaming') {
      updatePreviewScale();
    }
  });

  // ResizeObserver for more accurate scaling when container resizes independently
  if (typeof ResizeObserver !== 'undefined' && previewContainer) {
    new ResizeObserver(function() {
      if (previewState === 'streaming') {
        updatePreviewScale();
      }
    }).observe(previewContainer);
  }

  function handleDOMMutations(payload) {
    if (!shouldAcceptPreviewMessage(payload, 'ext:dom-mutations')) return;
    if (previewState !== 'streaming') return;
    lastFrameTime = Date.now();

    try {
      var mutations = payload.mutations || [];
      recordDashboardTransportEvent('dom-mutations-dispatched', {
        type: 'ext:dom-mutations',
        mutationCount: mutations.length,
        streamSessionId: payload.streamSessionId || activePreviewStreamSessionId,
        snapshotId: payload.snapshotId || activePreviewSnapshotId
      });
      if (!dispatchPreviewViewer('ext:dom-mutations', payload)) {
        throw new Error('phantomstream-viewer-unavailable');
      }
      mutationsAppliedTotal += mutations.length;
      updatePreviewTooltip();
    } catch (e) {
      console.warn('[FSB-DASH] Mutation apply error:', e.message);
      mutationApplyFailures += 1;
      recordDashboardTransportError('dom-mutation-apply-failed', e.message, {
        type: 'ext:dom-mutations',
        mutationCount: payload && payload.mutations ? payload.mutations.length : 0,
        mutationApplyFailures: mutationApplyFailures
      });
      // Don't change state -- keep showing last good content
      requestPreviewResync('dom-mutation-batch-failed', {
        mutationCount: payload && payload.mutations ? payload.mutations.length : 0
      });
    }
  }

  function handleDOMScroll(payload) {
    if (!shouldAcceptPreviewMessage(payload, 'ext:dom-scroll')) return;
    // Store last scroll position for maintenance after mutations
    lastPreviewScroll.x = payload.scrollX || 0;
    lastPreviewScroll.y = payload.scrollY || 0;

    if (previewState !== 'streaming') return;
    dispatchPreviewViewer('ext:dom-scroll', payload);
  }

  function handleDOMMedia(payload) {
    // Phase 33 (MEDIA): forward live media playback state to the viewer's
    // reconciler. Stream-only (like scroll); the viewer self-heals drift.
    if (!shouldAcceptPreviewMessage(payload, 'ext:dom-media')) return;
    if (previewState !== 'streaming') return;
    dispatchPreviewViewer('ext:dom-media', payload);
  }

  function handleDOMMediaHint(payload) {
    // Phase 33 (MEDIA): adaptive-manifest discovery hint (dormant until the
    // opt-in chrome.webRequest discovery path is enabled).
    if (!shouldAcceptPreviewMessage(payload, 'ext:dom-media-hint')) return;
    if (previewState !== 'streaming') return;
    dispatchPreviewViewer('ext:dom-media-hint', payload);
  }

  function handleDOMOverlay(payload) {
    if (!shouldAcceptPreviewMessage(payload, 'ext:dom-overlay')) return;
    var canRenderOverlay = previewState === 'streaming' ||
      previewState === 'frozen-disconnect' ||
      previewState === 'frozen-complete';
    if (!canRenderOverlay) return;
    dispatchPreviewViewer('ext:dom-overlay', payload);

    if (payload.glow && payload.glow.state === 'active' && previewGlow) {
      previewGlow.style.display = '';
      previewGlow.style.top = (payload.glow.y * previewScale) + 'px';
      previewGlow.style.left = (payload.glow.x * previewScale) + 'px';
      previewGlow.style.width = (payload.glow.w * previewScale) + 'px';
      previewGlow.style.height = (payload.glow.h * previewScale) + 'px';
    } else if (previewGlow) {
      previewGlow.style.display = 'none';
    }

    if (payload.progress && payload.progress.lifecycle !== 'cleared') {
      rememberPreviewOverlayIdentity(payload.progress);
    } else {
      clearPreviewOverlayIdentity();
    }
    renderPreviewFrozenIdentity();

    var hasActiveProgress = !!(payload.progress && payload.progress.lifecycle !== 'cleared');
    if (hasActiveProgress && previewProgress) {
      previewProgress.style.display = '';
      var phaseText = payload.progress.phase || 'Working';
      var progressText;
      if (payload.progress.mode === 'determinate' && typeof payload.progress.percent === 'number') {
        progressText = Math.round(payload.progress.percent) + '%';
      } else {
        progressText = payload.progress.label || phaseText || 'Working';
      }
      if (previewProgressStatus) {
        previewProgressStatus.textContent = progressText + ' - ' + phaseText;
      } else {
        previewProgress.textContent = progressText + ' - ' + phaseText;
      }
      var detailText = String(payload.progress.detail || '').trim();
      if (previewProgressDetail) {
        previewProgressDetail.textContent = detailText;
        previewProgressDetail.style.display = detailText ? 'block' : 'none';
      }
      renderPreviewClientBadge(previewProgressBadge, payload.progress.clientLabel || '');
    } else if (previewProgress) {
      previewProgress.style.display = 'none';
      if (previewProgressDetail) {
        previewProgressDetail.textContent = '';
        previewProgressDetail.style.display = 'none';
      }
      renderPreviewClientBadge(previewProgressBadge, '');
    }
  }

  function handleDOMDialog(payload) {
    if (!shouldAcceptPreviewMessage(payload, 'ext:dom-dialog')) return;
    dispatchPreviewViewer('ext:dom-dialog', payload);
    var dialog = payload.dialog || payload;
    if (!dialog) return;

    if (dialog.state === 'open') {
      // Show dialog card overlay
      if (previewDialogType) {
        var typeLabel = (dialog.type || 'alert').charAt(0).toUpperCase() + (dialog.type || 'alert').slice(1);
        previewDialogType.textContent = typeLabel;
      }
      if (previewDialogMessage) {
        previewDialogMessage.textContent = dialog.message || '';
      }
      if (previewDialog) {
        // Set icon based on dialog type
        var iconEl = previewDialog.querySelector('.dash-preview-dialog-icon i');
        if (iconEl) {
          switch (dialog.type) {
            case 'confirm':
              iconEl.className = 'fa-solid fa-circle-question';
              break;
            case 'prompt':
              iconEl.className = 'fa-solid fa-keyboard';
              break;
            default: // alert
              iconEl.className = 'fa-solid fa-triangle-exclamation';
              break;
          }
        }
        previewDialog.style.display = 'flex';
      }
    } else if (dialog.state === 'closed') {
      // Hide dialog card overlay
      if (previewDialog) {
        previewDialog.style.display = 'none';
      }
    }
  }

  document.addEventListener('visibilitychange', function() {
    if (previewState === 'hidden' || previewState === 'error' || previewState === 'paused') return;

    if (document.hidden) {
      // Tab hidden -- pause stream (only if user toggle is on; if user paused, already handled)
      if (ws && ws.readyState === WebSocket.OPEN && previewState === 'streaming') {
        sendDashboardWSMessage('dash:dom-stream-pause', {});
      }
    } else {
      // Tab visible -- resume stream (triggers fresh snapshot)
      if (streamToggleOn && ws && ws.readyState === WebSocket.OPEN && (previewState === 'streaming' || previewState === 'disconnected' || previewState === 'frozen-disconnect')) {
        sendDashboardWSMessage('dash:dom-stream-resume', {});
        scheduleStreamRecovery('visibility-resume');
      }
    }
  });

  // Stream toggle button
  if (previewToggle) {
    previewToggle.addEventListener('click', function() {
      streamToggleOn = !streamToggleOn;
      previewToggle.title = streamToggleOn ? 'Pause stream' : 'Resume stream';
      previewToggle.innerHTML = streamToggleOn
        ? '<i class="fa-solid fa-pause"></i>'
        : '<i class="fa-solid fa-play"></i>';
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (streamToggleOn) {
          sendDashboardWSMessage('dash:dom-stream-resume', {});
          scheduleStreamRecovery('toggle-resume');
        } else {
          clearPendingStreamRecovery();
          sendDashboardWSMessage('dash:dom-stream-pause', {});
          setPreviewState('paused');
        }
      }
    });
  }

  // Maximize button
  if (previewMaximizeBtn) {
    previewMaximizeBtn.addEventListener('click', function() {
      toggleMaximize();
    });
  }

  // URL bar (Phase 212 / NAV-01)
  function normalizeNavigateUrl(input) {
    if (typeof input !== 'string') return '';
    var url = input.trim();
    if (!url) return '';
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) return url;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return url;
    if (/^\/\//.test(url)) return 'https:' + url;
    return 'https://' + url;
  }
  function submitUrlBar() {
    if (!previewUrlInput) return;
    var raw = previewUrlInput.value;
    var normalized = normalizeNavigateUrl(raw);
    if (!normalized) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendDashboardWSMessage('dash:navigate', { url: normalized });
      // Optimistic UI: hide restricted placeholder so the user sees the
      // preview wake up the moment the new tab starts loading.
      if (previewRestricted) previewRestricted.style.display = 'none';
      if (previewState === 'restricted' || previewState === 'disconnected') {
        setPreviewState('loading');
      }
    } else {
      console.warn('[FSB-DASH] Cannot navigate -- WS not open');
    }
  }
  if (previewUrlForm) {
    previewUrlForm.addEventListener('submit', function (e) {
      e.preventDefault();
      submitUrlBar();
    });
  }
  if (previewUrlInput) {
    previewUrlInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitUrlBar();
      }
    });
    previewUrlInput.addEventListener('focus', function () {
      try { previewUrlInput.select(); } catch (_) { /* ignore */ }
    });
  }
  if (previewUrlBack && ws !== undefined) {
    previewUrlBack.addEventListener('click', function () {
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendDashboardWSMessage('dash:navigate-history', { direction: 'back' });
      }
    });
  }
  if (previewUrlForward) {
    previewUrlForward.addEventListener('click', function () {
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendDashboardWSMessage('dash:navigate-history', { direction: 'forward' });
      }
    });
  }
  if (previewUrlReload) {
    previewUrlReload.addEventListener('click', function () {
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendDashboardWSMessage('dash:navigate-history', { direction: 'reload' });
      }
    });
  }

  // PiP button
  if (previewPipBtn) {
    previewPipBtn.addEventListener('click', function() {
      togglePip();
    });
  }

  // Fullscreen button
  if (previewFullscreenBtn) {
    previewFullscreenBtn.addEventListener('click', function() {
      toggleFullscreen();
    });
  }

  // Escape key exits maximized mode
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && previewLayoutMode === 'maximized') {
      setPreviewLayout('inline');
    }
  });

  function lastFrameAgo() {
    if (!lastFrameTime) return 0;
    return Math.max(0, Math.round((Date.now() - lastFrameTime) / 1000));
  }

  function updatePreviewTooltip() {
    if (!previewTooltip) return;
    var parts = [];
    if (streamTabUrl) parts.push(streamTabUrl.length > 60 ? streamTabUrl.substring(0, 60) + '...' : streamTabUrl);
    if (lastSnapshotTime) parts.push('Last snapshot: ' + new Date(lastSnapshotTime).toLocaleTimeString());
    if (lastRecoveredStreamState) parts.push('State: ' + lastRecoveredStreamState);
    if (previewNotReadyReason) parts.push('Reason: ' + previewNotReadyReason);
    if (previewLoadStartedAt && previewState === 'loading') {
      parts.push('Recovering for ' + Math.max(1, Math.round((Date.now() - previewLoadStartedAt) / 1000)) + 's');
    }
    parts.push('last-frame: ' + lastFrameAgo() + 's ago');
    parts.push('mutations: ' + mutationsAppliedTotal);
    parts.push('apply failures: ' + mutationApplyFailures);
    parts.push('stale: ' + staleMutationCount);
    previewTooltip.textContent = parts.join(' | ') || 'No stream data';
  }

  // --- WebSocket ---

  function connectWS() {
    disconnectWS();
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var wsUrl = proto + '//' + location.host + '/ws?key=' +
      encodeURIComponent(hashKey) + '&role=dashboard';

    console.log('[FSB-DASH] Connecting WS to:', wsUrl);
    ws = new WebSocket(wsUrl);
    setWsState('reconnecting');

    ws.onopen = function () {
      console.log('[FSB-DASH] WS connected');
      recordDashboardTransportEvent('ws-open', {
        readyState: ws ? ws.readyState : 'missing'
      });
      wsReconnectDelay = 0;
      setWsState('connected');
      // Dashboard-side keepalive -- prevents fly.io from closing idle WS connections
      if (wsPingTimer) clearInterval(wsPingTimer);
      wsPingTimer = setInterval(function () {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        }
      }, 20000);
      scheduleStreamRecovery('ws-open');
    };

    ws.onmessage = function (event) {
      try {
        var envelope = JSON.parse(event.data);
        var msg;
        // Detect compressed payload from extension
        if (envelope._lz && envelope.d && typeof LZString !== 'undefined') {
          var decompressed = LZString.decompressFromBase64(envelope.d);
          if (!decompressed) {
            console.warn('[FSB-DASH] Failed to decompress WS message');
            recordDashboardTransportError('message-parse-failed', 'Failed to decompress dashboard WS message', {
              type: 'compressed',
              readyState: ws ? ws.readyState : 'missing',
              context: 'decompress'
            });
            return;
          }
          msg = JSON.parse(decompressed);
          console.log('[FSB-DASH] WS msg (decompressed):', msg.type, msg.payload ? JSON.stringify(msg.payload).substring(0, 100) : '');
        } else {
          // Uncompressed message (backward compatibility or small payloads)
          msg = envelope;
          console.log('[FSB-DASH] WS msg:', msg.type, msg.payload ? JSON.stringify(msg.payload).substring(0, 100) : '');
        }
        recordDashboardTransportMessage('received', msg.type);
        handleWSMessage(msg);
      } catch (e) {
        console.warn('[FSB-DASH] WS parse error:', e.message);
        recordDashboardTransportError('message-parse-failed', e.message, {
          type: 'unknown',
          readyState: ws ? ws.readyState : 'missing',
          context: 'parse'
        });
      }
    };

    ws.onclose = function (e) {
      clearMetrics();
      if (remoteControlOn || remoteControlRequestedAt) {
        setRemoteControl(false, { silent: true, source: 'ws-close' });
        lastRemoteControlState = {
          enabled: false,
          attached: false,
          tabId: activePreviewTabId,
          reason: 'dashboard-disconnected',
          ownership: 'none'
        };
        renderRemoteControlState(lastRemoteControlState, { skipToggleSync: true });
      }
      console.log('[FSB-DASH] WS closed, code:', e.code, 'reason:', e.reason);
      recordDashboardTransportEvent('ws-close', {
        closeCode: e.code,
        closeReason: e.reason || '',
        readyState: ws ? ws.readyState : 'closed'
      });
      extensionOnline = false;
      pageReady = false; // Reset so reconnect waits for fresh page-ready signal
      clearPendingStreamRecovery();
      if (wsPingTimer) {
        clearInterval(wsPingTimer);
        wsPingTimer = null;
      }
      setWsState('disconnected');
      if (taskState === 'running') {
        setTaskRecoveryPending(true, 'ws-disconnected');
      }
      updateTaskOfflineState();
      if (previewState === 'streaming') {
        setPreviewState('frozen-disconnect');
      } else if (previewState === 'loading') {
        setPreviewState('disconnected');
      }
      scheduleWSReconnect();
    };

    ws.onerror = function (e) { console.log('[FSB-DASH] WS error:', e); };
  }

  function disconnectWS() {
    clearPendingStreamRecovery();
    clearRemoteControlRequestTimer();
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    if (wsPingTimer) {
      clearInterval(wsPingTimer);
      wsPingTimer = null;
    }
    if (ws) {
      ws.onclose = null; // Prevent reconnect on intentional close
      ws.close();
      ws = null;
    }
    setWsState('disconnected');
  }

  function scheduleWSReconnect() {
    if (!hashKey) return;
    if (wsReconnectDelay === 0) {
      wsReconnectDelay = 1000;
      recordDashboardTransportEvent('ws-reconnect-scheduled', {
        delayMs: 0
      });
      connectWS();
      return;
    }
    recordDashboardTransportEvent('ws-reconnect-scheduled', {
      delayMs: wsReconnectDelay
    });
    wsReconnectTimer = setTimeout(function () {
      connectWS();
    }, wsReconnectDelay);
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, wsMaxReconnectDelay);
  }

  function setWsState(state) {
    if (!sseStatusEl) return;
    var labels = {
      connected: 'connected',
      disconnected: 'disconnected',
      reconnecting: 'reconnecting...'
    };
    sseStatusEl.textContent = labels[state] || state;
    sseStatusEl.className = 'dash-sse-badge ' +
      (state === 'connected' ? 'dash-sse-connected' :
       state === 'reconnecting' ? 'dash-sse-reconnecting' :
       'dash-sse-disconnected');
  }

  // ==================== METRICS (Phase 223 MET-06/07 vanilla parity) ====================

  function formatStatNumber(value) {
    var safe = Number.isFinite(value) ? Math.max(0, value) : 0;
    return Math.round(safe).toLocaleString();
  }

  function renderMetrics(payload) {
    if (!payload || typeof payload !== 'object') {
      clearMetrics();
      return;
    }

    var sessions = payload.sessions || {};
    var cost = payload.cost || {};
    var usage = payload.usage || {};

    var totalTokens = typeof usage.totalTokens === 'number'
      ? usage.totalTokens
      : (typeof cost.totalTokens === 'number' ? cost.totalTokens : 0);
    var totalCost = typeof usage.totalCost === 'number'
      ? usage.totalCost
      : (typeof cost.totalCost === 'number' ? cost.totalCost : 0);
    var totalRequests = typeof usage.totalRequests === 'number'
      ? usage.totalRequests
      : ((typeof sessions.completedTasks === 'number' ? sessions.completedTasks : 0) +
        (typeof sessions.errorCount === 'number' ? Math.max(0, sessions.errorCount) : 0));
    var completedTasks = typeof sessions.completedTasks === 'number' ? sessions.completedTasks : 0;
    var errorCount = typeof sessions.errorCount === 'number' ? Math.max(0, sessions.errorCount) : 0;
    var totalAttempts = totalRequests > 0 ? totalRequests : completedTasks + errorCount;
    var successRate = typeof usage.successRate === 'number'
      ? usage.successRate
      : (totalAttempts > 0 ? (completedTasks / totalAttempts) * 100 : 0);

    var enabledEl = document.getElementById('stat-enabled');
    var runsEl = document.getElementById('stat-runs-today');
    var rateEl = document.getElementById('stat-success-rate');
    var costEl = document.getElementById('stat-total-cost');
    var remoteEl = document.getElementById('stat-cost-saved');

    if (enabledEl) enabledEl.textContent = formatStatNumber(totalTokens);
    if (runsEl) runsEl.textContent = formatStatNumber(totalRequests);
    if (rateEl) rateEl.textContent = Math.round(successRate) + '%';
    if (costEl) costEl.textContent = '$' + totalCost.toFixed(2);
    if (remoteEl) remoteEl.textContent = remoteControlOn
      ? 'Remote on'
      : (payload.connection && payload.connection.connected ? 'Connected' : 'Offline');
  }

  function clearMetrics() {
    var enabledEl = document.getElementById('stat-enabled');
    var runsEl = document.getElementById('stat-runs-today');
    var rateEl = document.getElementById('stat-success-rate');
    var costEl = document.getElementById('stat-total-cost');
    var remoteEl = document.getElementById('stat-cost-saved');

    if (enabledEl) enabledEl.textContent = '0';
    if (runsEl) runsEl.textContent = '0';
    if (rateEl) rateEl.textContent = '0%';
    if (costEl) costEl.textContent = '$0.00';
    if (remoteEl) remoteEl.textContent = 'Offline';
  }

  function handleWSMessage(msg) {
    if (msg.type === 'pong') return; // Ignore pong responses

    // Phase 212 / NAV-01: feedback for dashboard-initiated navigation. The
    // extension echoes back the resolved URL on success or a structured
    // error reason on failure. We log + briefly reflect failures inline; the
    // success case is implicit (the preview will start streaming the new URL).
    if (msg.type === 'ext:navigate-result') {
      var navRes = msg.payload || {};
      if (!navRes.ok) {
        console.warn('[FSB-DASH] Navigate failed:', navRes.error || 'unknown', navRes.reason || '');
      } else if (navRes.url && previewUrlInput && document.activeElement !== previewUrlInput) {
        lastKnownStreamUrl = navRes.url;
        previewUrlInput.value = navRes.url;
      }
      return;
    }

    if (msg.type === 'ext:task-progress') {
      updateTaskProgress(msg.payload);
      return;
    }

    if (msg.type === 'ext:task-complete') {
      handleTaskComplete(msg.payload);
      return;
    }

    if (msg.type === 'ext:status') {
      var wasExtensionOnline = extensionOnline;
      extensionOnline = msg.payload && msg.payload.online;
      if (!extensionOnline && taskState === 'running') {
        setTaskRecoveryPending(true, 'extension-offline');
      } else if (!wasExtensionOnline && extensionOnline && taskState === 'running' && activeTaskRunId) {
        setTaskRecoveryPending(true, 'extension-online');
      }
      updateTaskOfflineState();
      if (!wasExtensionOnline && extensionOnline) {
        scheduleStreamRecovery('extension-online');
      }
      if (!extensionOnline) {
        pageReady = false;
      }
      return;
    }

    if (msg.type === 'ext:snapshot') {
      var snapshot = msg.payload || {};
      var snapshotIntentActive = snapshot.streamIntentActive !== false;
      extensionOnline = true;
      recordDashboardTransportEvent('snapshot-recovered', {
        type: 'ext:snapshot',
        status: snapshot.streamStatus || '',
        reason: snapshot.streamReason || '',
        streamIntentActive: snapshotIntentActive,
        tabId: snapshot.streamTabId || null,
        source: snapshot.snapshotSource || ''
      });
      recordDashboardSnapshotRecovery({
        type: 'ext:snapshot',
        status: snapshot.streamStatus || '',
        reason: snapshot.streamReason || '',
        streamIntentActive: snapshotIntentActive,
        tabId: snapshot.streamTabId || null,
        url: snapshot.streamTabUrl || '',
        source: snapshot.snapshotSource || ''
      });
      if (snapshot.remoteControl) {
        handleRemoteControlState(snapshot.remoteControl);
      }
      applyRecoveredTaskState(snapshot);

      streamTabUrl = snapshot.streamTabUrl || '';
      activePreviewTabId = typeof snapshot.streamTabId === 'number' ? snapshot.streamTabId : activePreviewTabId;
      lastRecoveredStreamState = snapshot.streamStatus || lastRecoveredStreamState;
      previewNotReadyReason = snapshot.streamReason || '';

      if (!streamToggleOn) {
        clearPendingStreamRecovery();
        setPreviewState('paused');
      } else if (snapshot.streamStatus === 'not-ready') {
        pageReady = false;
        clearPendingStreamRecovery();
        setPreviewDisconnectedText(getPreviewNotReadyText(previewNotReadyReason));
        setPreviewState('disconnected');
      } else if (!snapshotIntentActive) {
        updatePreviewTooltip();
      } else if (snapshot.streamStatus === 'ready' || snapshot.streamStatus === 'recovering') {
        pageReady = snapshot.streamStatus === 'ready';
        previewLoadStartedAt = Date.now();
        setPreviewLoadingText(snapshot.streamStatus === 'recovering'
          ? 'Recovering browser preview...'
          : 'Waiting for live page preview...');
        if (previewState !== 'streaming') setPreviewState('loading');
        if (!pendingStreamRecovery) {
          armPreviewRecoveryWatchdog('snapshot:' + (snapshot.snapshotSource || 'unknown'));
        }
      }

      updatePreviewTooltip();
      updateTaskOfflineState();
      renderTaskRecoveryStatus(snapshot.taskRunId || '', snapshot.taskSource || snapshot.snapshotSource || '');
      return;
    }

    if (msg.type === 'ext:dom-snapshot') {
      handleDOMSnapshot(msg.payload);
      return;
    }

    if (msg.type === 'ext:dom-mutations') {
      handleDOMMutations(msg.payload);
      return;
    }

    if (msg.type === 'ext:dom-scroll') {
      handleDOMScroll(msg.payload);
      return;
    }

    if (msg.type === 'ext:dom-overlay') {
      handleDOMOverlay(msg.payload);
      return;
    }

    if (msg.type === 'ext:dom-dialog') {
      handleDOMDialog(msg.payload);
      return;
    }

    if (msg.type === 'ext:dom-media') {
      handleDOMMedia(msg.payload);
      return;
    }

    if (msg.type === 'ext:dom-media-hint') {
      handleDOMMediaHint(msg.payload);
      return;
    }

    if (msg.type === 'ext:stream-state') {
      handleRecoveredStreamState(msg.payload || {});
      return;
    }

    if (msg.type === 'ext:request-snapshot') {
      if (previewState !== 'frozen-complete') {
        requestPreviewResync((msg.payload && msg.payload.reason) || 'request-snapshot', msg.payload || {});
      }
      return;
    }

    if (msg.type === 'ext:metrics') { renderMetrics(msg.payload || {}); return; }

    if (msg.type === 'ext:remote-control-state' || msg.type === 'ext:ps-control-state') {
      handleRemoteControlState(msg.payload || {});
      return;
    }

    if (msg.type === 'ext:page-ready') {
      recordDashboardTransportEvent('page-ready-received', {
        type: 'ext:page-ready',
        tabId: msg.payload && msg.payload.tabId ? msg.payload.tabId : null
      });
      pageReady = true;
      lastRecoveredStreamState = 'ready';
      previewNotReadyReason = '';
      streamTabUrl = (msg.payload && msg.payload.url) || '';
      recordDashboardSnapshotRecovery({
        type: 'ext:page-ready',
        status: 'ready',
        reason: '',
        tabId: msg.payload && msg.payload.tabId ? msg.payload.tabId : null,
        url: streamTabUrl,
        source: 'ext:page-ready'
      });
      // Auto-start stream if toggle is on and WS is connected
      if (streamToggleOn && ws && ws.readyState === WebSocket.OPEN) {
        sendDashboardWSMessage('dash:dom-stream-start', {});
        previewLoadStartedAt = Date.now();
        setPreviewLoadingText('Waiting for live page preview...');
        if (previewState !== 'streaming') setPreviewState('loading');
        if (!pendingStreamRecovery) {
          armPreviewRecoveryWatchdog('page-ready');
        }
      }
      updatePreviewTooltip();
      return;
    }

    if (msg.type === 'ext:stream-tab-info') {
      var info = msg.payload || {};
      handleRecoveredStreamState({
        status: info.ready ? 'ready' : 'not-ready',
        reason: info.ready ? '' : 'restricted-tab',
        url: info.url || '',
        tabId: info.tabId || null,
        source: 'legacy:stream-tab-info'
      });
      return;
    }

  }

  // --- Polling Fallback ---

  // --- API Helpers ---

  function apiFetch(path, options) {
    options = options || {};
    var url = API_BASE + path;
    return fetch(url, options).then(function (resp) {
      if (!resp.ok) {
        return resp.json().then(function (body) {
          return Promise.reject(body);
        }).catch(function () {
          return Promise.reject({ error: 'Request failed with status ' + resp.status });
        });
      }
      return resp.json();
    });
  }

  // --- Utilities ---

  function formatTime(isoStr) {
    if (!isoStr) return '-';
    try {
      var d = new Date(isoStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
             ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return isoStr;
    }
  }

  function formatDuration(ms) {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, '&#39;');
  }

  function setTextById(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

})();
