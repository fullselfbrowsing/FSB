(function(global) {
  'use strict';

  function copyText(copy, key, fallback) {
    return copy && typeof copy[key] === 'string' ? copy[key] : fallback;
  }

  function getPreviewNotReadyText(reason, copy) {
    switch (reason) {
      case 'restricted-tab':
        return copyText(copy, 'previewOpenNormalPage', 'Open a normal browser page to resume preview');
      case 'tab-closed':
        return copyText(copy, 'previewTabClosed', 'The streaming tab was closed. Open another page to resume preview');
      case 'waiting-for-page-ready':
        return copyText(copy, 'previewWaitingForPage', 'Waiting for the browser page to finish loading');
      case 'no-streamable-tab':
      default:
        return copyText(copy, 'previewOpenStreamableTab', 'Open a browser tab with a normal web page to start preview');
    }
  }

  function derivePreviewSurface(input) {
    input = input || {};
    var previewState = input.previewState || 'hidden';
    var reason = input.previewNotReadyReason || '';
    var lastRecoveredStreamState = input.lastRecoveredStreamState || '';
    var hasLiveSnapshot = !!input.hasLiveSnapshot;
    var copy = input.copy || {};
    var isRecovering = previewState === 'loading' &&
      (lastRecoveredStreamState === 'recovering' || !!input.previewResyncPending);

    if (previewState === 'hidden') {
      return {
        chipLabel: '',
        chipTone: 'paused',
        detailText: '',
        showIframe: false,
        showLoading: false,
        showDisconnected: false
      };
    }

    if (previewState === 'streaming') {
      return {
        chipLabel: copyText(copy, 'previewStreamingLabel', 'streaming'),
        chipTone: 'streaming',
        detailText: copyText(copy, 'previewLiveDetail', 'Live browser preview'),
        showIframe: true,
        showLoading: false,
        showDisconnected: false
      };
    }

    if (previewState === 'paused') {
      return {
        chipLabel: copyText(copy, 'previewPausedLabel', 'paused'),
        chipTone: 'paused',
        detailText: copyText(copy, 'previewPausedDetail', 'Preview paused'),
        showIframe: hasLiveSnapshot,
        showLoading: false,
        showDisconnected: false
      };
    }

    if (reason) {
      return {
        chipLabel: copyText(copy, 'previewNotReadyLabel', 'not ready'),
        chipTone: 'blocked',
        detailText: getPreviewNotReadyText(reason, copy),
        showIframe: false,
        showLoading: false,
        showDisconnected: true
      };
    }

    if (isRecovering || lastRecoveredStreamState === 'recovering') {
      return {
        chipLabel: copyText(copy, 'previewRecoveringLabel', 'recovering'),
        chipTone: 'recovering',
        detailText: copyText(copy, 'previewRecoveringDetail', 'Recovering browser preview...'),
        showIframe: false,
        showLoading: true,
        showDisconnected: false
      };
    }

    if (previewState === 'loading') {
      return {
        chipLabel: copyText(copy, 'previewLoadingLabel', 'loading'),
        chipTone: 'loading',
        detailText: copyText(copy, 'previewLoadingDetail', 'Waiting for live page preview...'),
        showIframe: false,
        showLoading: true,
        showDisconnected: false
      };
    }

    if (previewState === 'frozen-disconnect') {
      return {
        chipLabel: copyText(copy, 'previewDisconnectedLabel', 'disconnected'),
        chipTone: 'blocked',
        detailText: copyText(copy, 'previewDisconnectedLastFrame', 'Stream disconnected -- showing last frame'),
        showIframe: true,
        showLoading: false,
        showDisconnected: false,
        showFrozenOverlay: true,
        frozenLabel: copyText(copy, 'previewDisconnectedFrozenLabel', 'Disconnected'),
        frozenType: 'frozen-disconnect'
      };
    }

    if (previewState === 'frozen-complete') {
      return {
        chipLabel: copyText(copy, 'previewCompleteLabel', 'complete'),
        chipTone: 'streaming',
        detailText: copyText(copy, 'previewCompleteDetail', 'Task finished -- showing final page'),
        showIframe: true,
        showLoading: false,
        showDisconnected: false,
        showFrozenOverlay: true,
        frozenLabel: copyText(copy, 'previewCompleteFrozenLabel', 'Task Complete'),
        frozenType: 'frozen-complete'
      };
    }

    if (previewState === 'disconnected') {
      return {
        chipLabel: copyText(copy, 'previewDisconnectedLabel', 'disconnected'),
        chipTone: 'blocked',
        detailText: copyText(copy, 'previewDisconnectedDetail', 'Stream disconnected'),
        showIframe: false,
        showLoading: false,
        showDisconnected: true
      };
    }

    if (previewState === 'restricted') {
      return {
        chipLabel: copyText(copy, 'previewRestrictedLabel', 'restricted page'),
        chipTone: 'blocked',
        detailText: copyText(copy, 'previewRestrictedDetail', 'Restricted page -- use the URL bar to navigate'),
        showIframe: false,
        showLoading: false,
        showDisconnected: false
      };
    }

    return {
      chipLabel: copyText(copy, 'previewDisconnectedLabel', 'disconnected'),
      chipTone: 'blocked',
      detailText: copyText(copy, 'previewErrorDetail', 'Could not load page preview'),
      showIframe: false,
      showLoading: false,
      showDisconnected: false
    };
  }

  function deriveRemoteControlSurface(input) {
    input = input || {};
    var previewState = input.previewState || 'hidden';
    var copy = input.copy || {};
    var reason = input.reason || (input.attached ? 'ready' : 'stream-not-ready');
    var isStreaming = previewState === 'streaming';
    var canUseRemote = isStreaming || input.remoteControlAvailable === true;
    var detailText = copyText(copy, 'remoteOffDetail', 'Remote control is off');
    var chipLabel = copyText(copy, 'remoteOffLabel', 'remote off');
    var chipTone = 'paused';
    var available = canUseRemote;

    switch (reason) {
      case 'requesting':
        chipLabel = copyText(copy, 'remoteRequestingLabel', 'requesting');
        chipTone = 'recovering';
        detailText = copyText(copy, 'remoteRequestingDetail', 'Remote control request sent to the extension');
        available = canUseRemote;
        break;
      case 'ready':
        chipLabel = copyText(copy, 'remoteReadyLabel', 'remote ready');
        chipTone = 'streaming';
        detailText = copyText(copy, 'remoteReadyDetail', 'Remote control is attached to the live preview');
        available = canUseRemote;
        break;
      case 'retarget-required':
        chipLabel = copyText(copy, 'remoteRearmLabel', 're-arm remote');
        chipTone = 'recovering';
        detailText = copyText(copy, 'remoteRearmDetail', 'Preview target changed. Re-enable remote control to continue.');
        available = canUseRemote;
        break;
      case 'dispatch-failed':
        chipLabel = copyText(copy, 'remoteRetryLabel', 'remote retry');
        chipTone = 'recovering';
        detailText = copyText(copy, 'remoteRetryDetail', 'Remote control lost its debugger session. Re-enable it to retry.');
        available = canUseRemote;
        break;
      case 'debugger-blocked':
        chipLabel = copyText(copy, 'remoteBlockedLabel', 'remote blocked');
        chipTone = 'blocked';
        detailText = input.ownership === 'external-debugger'
          ? copyText(copy, 'remoteExternalDebuggerDetail', 'Another debugger owns the browser tab.')
          : copyText(copy, 'remoteBlockedDetail', 'Remote control could not attach to the browser tab.');
        available = false;
        break;
      case 'no-tab':
        chipLabel = copyText(copy, 'remoteNoTabLabel', 'no tab');
        chipTone = 'blocked';
        detailText = copyText(copy, 'remoteNoTabDetail', 'Remote control needs a normal browser tab.');
        available = canUseRemote;
        break;
      case 'request-timeout':
        chipLabel = copyText(copy, 'remoteNoResponseLabel', 'no response');
        chipTone = 'blocked';
        detailText = copyText(copy, 'remoteNoResponseDetail', 'The extension did not confirm remote control.');
        available = canUseRemote;
        break;
      case 'dashboard-disconnected':
        chipLabel = copyText(copy, 'remoteDashboardOfflineLabel', 'dashboard offline');
        chipTone = 'blocked';
        detailText = copyText(copy, 'remoteDashboardOfflineDetail', 'Reconnect the dashboard before using remote control.');
        available = false;
        break;
      case 'stream-not-ready':
        chipLabel = copyText(copy, 'remoteOffLabel', 'remote off');
        chipTone = 'blocked';
        detailText = copyText(copy, 'remoteUnavailableDetail', 'Remote control is unavailable until the preview is live again.');
        available = canUseRemote;
        break;
      case 'user-stop':
      default:
        chipLabel = copyText(copy, 'remoteOffLabel', 'remote off');
        chipTone = 'paused';
        detailText = copyText(copy, 'remoteOffDetail', 'Remote control is off');
        available = canUseRemote;
        break;
    }

    return {
      chipLabel: chipLabel,
      chipTone: chipTone,
      detailText: detailText,
      available: available,
      shouldForceDisable: reason !== 'requesting' && (input.attached !== true || reason !== 'ready')
    };
  }

  function deriveTaskRecoverySurface(input) {
    input = input || {};
    var activeTaskRunId = input.activeTaskRunId || '';
    var incomingTaskRunId = input.incomingTaskRunId || '';
    var lastActionText = input.lastActionText || '';
    var copy = input.copy || {};

    if (input.recoveryTimedOut) {
      return {
        chipLabel: copyText(copy, 'taskTimedOutLabel', 'task timed out'),
        chipTone: 'blocked',
        actionText: copyText(copy, 'taskTimedOutAction', 'Task recovery timed out'),
        keepProgressView: false,
        shouldFail: true
      };
    }

    if (incomingTaskRunId && activeTaskRunId && incomingTaskRunId !== activeTaskRunId) {
      return {
        chipLabel: copyText(copy, 'taskWaitingLabel', 'waiting for task'),
        chipTone: 'recovering',
        actionText: copyText(copy, 'taskWaitingAction', 'Waiting for task recovery...'),
        keepProgressView: true,
        shouldFail: false
      };
    }

    if (input.taskState === 'running' &&
        (input.extensionOnline === false || input.wsConnected === false || input.recoveryPending === true)) {
      return {
        chipLabel: copyText(copy, 'taskRecoveringLabel', 'recovering task'),
        chipTone: 'recovering',
        actionText: copyText(copy, 'taskWaitingAction', 'Waiting for task recovery...'),
        keepProgressView: true,
        shouldFail: false
      };
    }

    if (input.taskState === 'running') {
      return {
        chipLabel: copyText(copy, 'taskLiveLabel', 'task live'),
        chipTone: 'streaming',
        actionText: lastActionText || copyText(copy, 'taskWorkingAction', 'Working...'),
        keepProgressView: true,
        shouldFail: false
      };
    }

    return {
      chipLabel: '',
      chipTone: 'paused',
      actionText: lastActionText,
      keepProgressView: false,
      shouldFail: false
    };
  }

  function translateProgressPhase(phase, copy) {
    var value = typeof phase === 'string' ? phase.trim() : '';
    switch (value.toLowerCase()) {
      case 'navigation':
      case 'navigating':
        return copyText(copy, 'phaseNavigating', 'Navigating');
      case 'extraction':
      case 'reading':
      case 'reading page':
        return copyText(copy, 'phaseReading', 'Reading page');
      case 'filling':
      case 'filling form':
        return copyText(copy, 'phaseFilling', 'Filling form');
      case 'analyzing':
      case 'thinking':
        return copyText(copy, 'phaseAnalyzing', 'Analyzing');
      case 'planning':
        return copyText(copy, 'phasePlanning', 'Planning');
      case 'acting':
        return copyText(copy, 'phaseActing', 'Acting');
      case 'recovering':
        return copyText(copy, 'previewRecoveringLabel', 'Recovering');
      case 'writing':
        return copyText(copy, 'phaseWriting', 'Writing');
      case 'switching_tab':
      case 'switching tabs':
        return copyText(copy, 'phaseSwitchingTabs', 'Switching tabs');
      case 'calling':
      case 'calling api':
        return copyText(copy, 'phaseCallingApi', 'Calling API');
      case 'trigger-watch':
      case 'watching':
      case 'watching a trigger':
        return copyText(copy, 'phaseWatchingTrigger', 'Watching a trigger');
      case 'waiting':
        return copyText(copy, 'phaseWaiting', 'Waiting');
      case 'complete':
      case 'done':
        return copyText(copy, 'previewCompleteLabel', 'Complete');
      case 'error':
        return copyText(copy, 'previewErrorLabel', 'Error');
      case 'cleared':
      case 'hidden':
        return copyText(copy, 'previewHiddenLabel', 'Hidden');
      case 'unknown':
      case 'working':
      case '':
        return copyText(copy, 'phaseWorking', 'Working');
      default:
        return value;
    }
  }

  function translateProgressLabel(label, phaseText, copy) {
    var raw = typeof label === 'string' ? label.trim() : '';
    if (!raw) return phaseText;
    var hasEllipsis = /(?:\u2026|\.\.\.)$/.test(raw);
    var base = raw.replace(/(?:\u2026|\.\.\.)$/, '').trim();
    var translated;

    switch (base.toLowerCase()) {
      case 'searching':
        translated = copyText(copy, 'progressSearching', 'Searching');
        break;
      case 'formatting':
        translated = copyText(copy, 'progressFormatting', 'Formatting');
        break;
      case 'formatted':
        translated = copyText(copy, 'progressFormatted', 'Formatted');
        break;
      case 'partial':
        translated = copyText(copy, 'resultPartial', 'Partial');
        break;
      default:
        translated = translateProgressPhase(base, copy);
        if (translated === base && base !== phaseText) return raw;
        break;
    }

    return translated + (hasEllipsis ? '\u2026' : '');
  }

  function translateProgressDetail(detail, copy) {
    var value = typeof detail === 'string' ? detail.trim() : '';
    var step = value.match(/^Step (\d+)\/(\d+):\s*(.+)$/i);
    if (step) {
      return step[1] + '/' + step[2] + ': ' + translateProgressDetail(step[3], copy);
    }
    switch (value.toLowerCase()) {
      case 'task completed':
        return copyText(copy, 'progressTaskCompleted', 'Task completed');
      case 'task partially completed':
        return copyText(copy, 'progressTaskPartiallyCompleted', 'Task partially completed');
      case 'task ended with an error':
        return copyText(copy, 'progressTaskError', 'Task ended with an error');
      case 'task stopped':
        return copyText(copy, 'taskStopped', 'Task stopped');
      case 'reviewing page state':
        return copyText(copy, 'progressReviewingPage', 'Reviewing page state');
      case 'planning next step':
      case 'planning next browser step':
        return copyText(copy, 'progressPlanningNextStep', 'Planning next step');
      case 'performing browser action':
        return copyText(copy, 'progressPerformingAction', 'Performing browser action');
      case 'recovering from interruption':
        return copyText(copy, 'progressRecoveringInterruption', 'Recovering from interruption');
      case 'updating page':
        return copyText(copy, 'progressUpdatingPage', 'Updating page');
      case 'switching to another tab':
        return copyText(copy, 'progressSwitchingTab', 'Switching to another tab');
      case 'watching dom for change':
        return copyText(copy, 'progressWatchingDom', 'Watching DOM for change');
      case 'reconnect or send another progress update':
        return copyText(copy, 'progressReconnectOrUpdate', 'Reconnect or send another progress update');
      case 'switched tab -- preparing next step...':
        return copyText(copy, 'progressSwitchingTab', 'Switching to another tab');
      case 'ready to begin':
        return copyText(copy, 'phasePlanning', 'Planning');
      case 'waiting for mcp client':
        return copyText(copy, 'phaseWaiting', 'Waiting');
      case 'working':
      case 'working...':
        return copyText(copy, 'phaseWorking', 'Working');
      case 'clicking element':
      case 'entering text':
      case 'submitting':
      case 'opening page':
      case 'scrolling':
      case 'reading content':
      case 'inspecting page':
      case 'selecting option':
      case 'selecting text':
      case 'toggling checkbox':
      case 'hovering':
      case 'focusing field':
      case 'clearing field':
      case 'waiting for element':
      case 'double-clicking':
      case 'right-clicking':
      case 'going back':
      case 'going forward':
      case 'refreshing':
      case 'moving cursor':
      case 'pressing key':
      case 'solving captcha':
      case 'opening new tab':
      case 'switching tab':
      case 'closing tab':
      case 'checking tabs':
      case 'signing in...':
        return copyText(copy, 'progressPerformingAction', 'Performing browser action');
      default:
        return value;
    }
  }

  function translateRestrictedPageType(pageType, copy) {
    var value = typeof pageType === 'string' ? pageType.trim() : '';
    switch (value.toLowerCase()) {
      case 'chrome-internal':
      case 'chrome internal page':
        return copyText(copy, 'restrictedChromeInternalPage', 'Chrome internal page');
      case 'chrome-extension':
      case 'chrome extension page':
        return copyText(copy, 'restrictedChromeExtensionPage', 'Chrome extension page');
      case 'edge-internal':
      case 'edge internal page':
        return copyText(copy, 'restrictedEdgeInternalPage', 'Edge internal page');
      case 'browser-internal':
      case 'browser internal page':
        return copyText(copy, 'restrictedBrowserInternalPage', 'Browser internal page');
      case 'local-file':
      case 'local file':
        return copyText(copy, 'restrictedLocalFile', 'Local file');
      case 'restricted':
      case 'restricted page':
        return copyText(copy, 'restrictedPageType', 'Restricted page');
      case 'no-active-tab':
      case 'no active tab':
        return copyText(copy, 'restrictedNoActiveTab', 'No active tab');
      case '':
      case 'new-tab':
      case 'new tab':
        return copyText(copy, 'newTab', 'New Tab');
      default:
        return value;
    }
  }

  function translateTaskError(errorCode, error, copy) {
    var code = typeof errorCode === 'string' ? errorCode.trim().toLowerCase() : '';
    var value = typeof error === 'string' ? error.trim() : '';
    if (!code) {
      switch (value.toLowerCase()) {
        case 'no task provided':
          code = 'dashboard_task_missing';
          break;
        case 'another task is already running':
          code = 'dashboard_task_already_running';
          break;
        case 'no usable browser tab found for automation':
          code = 'dashboard_task_no_usable_tab';
          break;
        case 'failed to start automation':
          code = 'dashboard_task_start_failed';
          break;
        default:
          break;
      }
    }
    switch (code) {
      case 'dashboard_task_missing':
        return copyText(copy, 'taskErrorMissing', 'No task was provided');
      case 'dashboard_task_already_running':
        return copyText(copy, 'taskErrorAlreadyRunning', 'Another task is already running');
      case 'dashboard_task_no_usable_tab':
        return copyText(copy, 'taskErrorNoUsableTab', 'No usable browser tab was found');
      case 'dashboard_task_start_failed':
      case 'dashboard_task_start_exception':
        return copyText(copy, 'taskCouldNotStart', 'Task could not be started');
      default:
        return value;
    }
  }

  function formatProgressOverlay(progress, copy) {
    var value = progress && typeof progress === 'object' ? progress : {};
    var phaseText = translateProgressPhase(value.phase, copy);
    var progressText = value.mode === 'determinate' && typeof value.percent === 'number'
      ? Math.round(value.percent) + '%'
      : translateProgressLabel(value.label, phaseText, copy);
    return progressText + ' - ' + phaseText;
  }

  var exportsObj = {
    derivePreviewSurface: derivePreviewSurface,
    deriveRemoteControlSurface: deriveRemoteControlSurface,
    deriveTaskRecoverySurface: deriveTaskRecoverySurface,
    formatProgressOverlay: formatProgressOverlay,
    translateRestrictedPageType: translateRestrictedPageType,
    translateTaskError: translateTaskError,
    translateProgressDetail: translateProgressDetail,
    translateProgressLabel: translateProgressLabel,
    translateProgressPhase: translateProgressPhase
  };

  global.FSBDashboardRuntimeState = exportsObj;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
