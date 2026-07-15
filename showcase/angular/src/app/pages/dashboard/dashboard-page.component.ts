import { AfterViewInit, Component, DOCUMENT, ElementRef, LOCALE_ID, NgZone, OnDestroy, OnInit, Renderer2, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

/* CDN libraries loaded lazily on /dashboard only (see loadDashboardCdnScripts). */
declare const Html5Qrcode: any;
declare const LZString: any;

interface RemoteControlState {
  enabled: boolean;
  attached: boolean;
  tabId: number | null;
  reason: string;
  ownership: string;
}

interface MetricsPayload {
  connection?: { connected?: boolean; pairedClient?: string; connectedAt?: number };
  sessions?: { activeSessions?: number; completedTasks?: number; errorCount?: number };
  cost?: { totalCost?: number; totalTokens?: number };
  usage?: {
    timeRange?: string;
    totalTokens?: number;
    totalCost?: number;
    totalRequests?: number;
    successfulRequests?: number;
    successRate?: number;
  };
  activeTab?: { tabId?: number; url?: string };
}

interface PreviewSurface {
  chipLabel: string;
  chipTone: string;
  detailText: string;
  showIframe: boolean;
  showLoading: boolean;
  showDisconnected: boolean;
  showFrozenOverlay?: boolean;
  frozenLabel?: string;
  frozenType?: string;
}

interface RemoteControlSurface {
  chipLabel: string;
  chipTone: string;
  detailText: string;
  available: boolean;
  shouldForceDisable: boolean;
}

interface TaskRecoverySurface {
  chipLabel: string;
  chipTone: string;
  actionText: string;
  keepProgressView: boolean;
  shouldFail: boolean;
}

interface TransportDiagnostics {
  events: any[];
  counters: {
    byEvent: Record<string, number>;
    sentByType: Record<string, number>;
    receivedByType: Record<string, number>;
  };
  lastError: any;
  lastSnapshotRecovery: any;
}

type TaskState = 'idle' | 'running' | 'success' | 'failed';
type PreviewState = 'hidden' | 'loading' | 'streaming' | 'disconnected' | 'error' | 'paused' | 'frozen-disconnect' | 'frozen-complete' | 'restricted';
type PreviewLayoutMode = 'inline' | 'maximized' | 'pip' | 'fullscreen';

const PACKAGE_OWNED_TASK_ACTIONS: ReadonlySet<string> = new Set([
  'clicking element',
  'entering text',
  'submitting',
  'opening page',
  'scrolling',
  'reading content',
  'inspecting page',
  'selecting option',
  'selecting text',
  'toggling checkbox',
  'hovering',
  'focusing field',
  'clearing field',
  'waiting for element',
  'double-clicking',
  'right-clicking',
  'going back',
  'going forward',
  'refreshing',
  'moving cursor',
  'pressing key',
  'solving captcha',
  'opening new tab',
  'switching tab',
  'closing tab',
  'checking tabs',
  'signing in...',
]);

function ownRecordValue(
  values: Readonly<Record<string, string>>,
  key: string,
): string | undefined {
  return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
}

interface PreviewOverlayIdentity {
  clientLabel: string;
  lifecycle: string;
  result: string;
  sessionToken: string;
  version: number | null;
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);

  ngOnInit(): void {
    const pageTitle = $localize`:@@dashboard.meta.title:FSB Dashboard`;
    const pageDescription = $localize`:@@dashboard.meta.description:Control your paired FSB extension, run one-shot browser tasks, and monitor the live browser preview.`;
    this.title.setTitle(pageTitle);
    this.meta.updateTag({ name: 'description', content: pageDescription });
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.loadDashboardCdnScripts();
  }

  private loadDashboardCdnScripts(): void {
    const libs: ReadonlyArray<readonly [string, string]> = [
      ['dash-html5-qrcode', 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'],
      ['dash-lz-string',    'https://unpkg.com/lz-string@1.5.0/libs/lz-string.min.js'],
    ];
    for (const [id, src] of libs) {
      if (this.doc.head.querySelector(`script[data-cdn="${id}"]`)) continue;
      const s = this.renderer.createElement('script') as HTMLScriptElement;
      this.renderer.setAttribute(s, 'src', src);
      this.renderer.setAttribute(s, 'data-cdn', id);
      this.renderer.setAttribute(s, 'defer', '');
      this.renderer.appendChild(this.doc.body, s);
    }
  }

  // ---- Constants ----
  private readonly API_BASE = '';
  private readonly STORAGE_KEY = 'fsb_dashboard_key';
  private readonly SESSION_KEY = 'fsb_dashboard_session';
  private readonly SESSION_EXPIRES_KEY = 'fsb_dashboard_expires';
  private readonly POLL_INTERVAL = 30000;
  private readonly TASK_TIMEOUT_MS = 10 * 60 * 1000;
  private readonly TASK_RECOVERY_DEADLINE_MS = 20000;
  private readonly DASHBOARD_TRANSPORT_DIAGNOSTIC_LIMIT = 100;

  /** Copy rendered by imperative dashboard code and the shared runtime-state helper. */
  private readonly dashboardCopy = {
    previewOpenNormalPage: $localize`:@@dashboard.runtime.preview.openNormalPage:Open a normal browser page to resume preview`,
    previewTabClosed: $localize`:@@dashboard.runtime.preview.tabClosed:The streaming tab was closed. Open another page to resume preview`,
    previewWaitingForPage: $localize`:@@dashboard.runtime.preview.waitingForPage:Waiting for the browser page to finish loading`,
    previewOpenStreamableTab: $localize`:@@dashboard.runtime.preview.openStreamableTab:Open a browser tab with a normal web page to start preview`,
    previewStreamingLabel: $localize`:@@dashboard.runtime.preview.streamingLabel:streaming`,
    previewLiveDetail: $localize`:@@dashboard.runtime.preview.liveDetail:Live browser preview`,
    previewPausedLabel: $localize`:@@dashboard.runtime.preview.pausedLabel:paused`,
    previewPausedDetail: $localize`:@@dashboard.runtime.preview.pausedDetail:Preview paused`,
    previewNotReadyLabel: $localize`:@@dashboard.runtime.preview.notReadyLabel:not ready`,
    previewRecoveringLabel: $localize`:@@dashboard.runtime.preview.recoveringLabel:recovering`,
    previewRecoveringDetail: $localize`:@@dashboard.runtime.preview.recoveringDetail:Recovering browser preview...`,
    previewLoadingLabel: $localize`:@@dashboard.runtime.preview.loadingLabel:loading`,
    previewLoadingDetail: $localize`:@@dashboard.runtime.preview.loadingDetail:Waiting for live page preview...`,
    previewReadyLabel: $localize`:@@dashboard.runtime.preview.readyLabel:ready`,
    previewErrorLabel: $localize`:@@dashboard.runtime.preview.errorLabel:error`,
    previewHiddenLabel: $localize`:@@dashboard.runtime.preview.hiddenLabel:hidden`,
    previewDisconnectedLabel: $localize`:@@dashboard.runtime.preview.disconnectedLabel:disconnected`,
    previewDisconnectedLastFrame: $localize`:@@dashboard.runtime.preview.disconnectedLastFrame:Stream disconnected -- showing last frame`,
    previewDisconnectedFrozenLabel: $localize`:@@dashboard.runtime.preview.disconnectedFrozenLabel:Disconnected`,
    previewCompleteLabel: $localize`:@@dashboard.runtime.preview.completeLabel:complete`,
    previewCompleteDetail: $localize`:@@dashboard.runtime.preview.completeDetail:Task finished -- showing final page`,
    previewCompleteFrozenLabel: $localize`:@@dashboard.runtime.preview.completeFrozenLabel:Task Complete`,
    previewDisconnectedDetail: $localize`:@@dashboard.runtime.preview.disconnectedDetail:Stream disconnected`,
    previewRestrictedLabel: $localize`:@@dashboard.runtime.preview.restrictedLabel:restricted page`,
    previewRestrictedDetail: $localize`:@@dashboard.runtime.preview.restrictedDetail:Restricted page -- use the URL bar to navigate`,
    previewErrorDetail: $localize`:@@dashboard.runtime.preview.errorDetail:Could not load page preview`,
    remoteOffDetail: $localize`:@@dashboard.runtime.remote.offDetail:Remote control is off`,
    remoteOffLabel: $localize`:@@dashboard.runtime.remote.offLabel:remote off`,
    remoteRequestingLabel: $localize`:@@dashboard.runtime.remote.requestingLabel:requesting`,
    remoteRequestingDetail: $localize`:@@dashboard.runtime.remote.requestingDetail:Remote control request sent to the extension`,
    remoteReadyLabel: $localize`:@@dashboard.runtime.remote.readyLabel:remote ready`,
    remoteReadyDetail: $localize`:@@dashboard.runtime.remote.readyDetail:Remote control is attached to the live preview`,
    remoteRearmLabel: $localize`:@@dashboard.runtime.remote.rearmLabel:re-arm remote`,
    remoteRearmDetail: $localize`:@@dashboard.runtime.remote.rearmDetail:Preview target changed. Re-enable remote control to continue.`,
    remoteRetryLabel: $localize`:@@dashboard.runtime.remote.retryLabel:remote retry`,
    remoteRetryDetail: $localize`:@@dashboard.runtime.remote.retryDetail:Remote control lost its debugger session. Re-enable it to retry.`,
    remoteBlockedLabel: $localize`:@@dashboard.runtime.remote.blockedLabel:remote blocked`,
    remoteExternalDebuggerDetail: $localize`:@@dashboard.runtime.remote.externalDebuggerDetail:Another debugger owns the browser tab.`,
    remoteBlockedDetail: $localize`:@@dashboard.runtime.remote.blockedDetail:Remote control could not attach to the browser tab.`,
    remoteNoTabLabel: $localize`:@@dashboard.runtime.remote.noTabLabel:no tab`,
    remoteNoTabDetail: $localize`:@@dashboard.runtime.remote.noTabDetail:Remote control needs a normal browser tab.`,
    remoteNoResponseLabel: $localize`:@@dashboard.runtime.remote.noResponseLabel:no response`,
    remoteNoResponseDetail: $localize`:@@dashboard.runtime.remote.noResponseDetail:The extension did not confirm remote control.`,
    remoteDashboardOfflineLabel: $localize`:@@dashboard.runtime.remote.dashboardOfflineLabel:dashboard offline`,
    remoteDashboardOfflineDetail: $localize`:@@dashboard.runtime.remote.dashboardOfflineDetail:Reconnect the dashboard before using remote control.`,
    remoteUnavailableDetail: $localize`:@@dashboard.runtime.remote.unavailableDetail:Remote control is unavailable until the preview is live again.`,
    taskTimedOutLabel: $localize`:@@dashboard.runtime.task.timedOutLabel:task timed out`,
    taskTimedOutAction: $localize`:@@dashboard.runtime.task.timedOutAction:Task recovery timed out`,
    taskWaitingLabel: $localize`:@@dashboard.runtime.task.waitingLabel:waiting for task`,
    taskWaitingAction: $localize`:@@dashboard.runtime.task.waitingAction:Waiting for task recovery...`,
    taskRecoveringLabel: $localize`:@@dashboard.runtime.task.recoveringLabel:recovering task`,
    taskLiveLabel: $localize`:@@dashboard.runtime.task.liveLabel:task live`,
    taskWorkingAction: $localize`:@@dashboard.runtime.task.workingAction:Working...`,
    stopping: $localize`:@@dashboard.runtime.task.stopping:Stopping...`,
    waking: $localize`:@@dashboard.runtime.extension.waking:Waking...`,
    wakeExtension: $localize`:@@dashboard.runtime.extension.wake:Wake Extension`,
    pauseStream: $localize`:@@dashboard.runtime.preview.pauseStream:Pause stream`,
    resumeStream: $localize`:@@dashboard.runtime.preview.resumeStream:Resume stream`,
    refreshingPreview: $localize`:@@dashboard.runtime.preview.refreshing:Refreshing browser preview...`,
    reconnectingPreview: $localize`:@@dashboard.runtime.preview.reconnecting:Reconnecting to browser preview...`,
    connectingPreview: $localize`:@@dashboard.runtime.preview.connecting:Connecting to browser...`,
    connectingToBrowser: $localize`:@@dashboard.runtime.preview.connectingToBrowser:Connecting to browser...`,
    frozen: $localize`:@@dashboard.runtime.preview.frozen:Frozen`,
    newTab: $localize`:@@dashboard.runtime.preview.newTab:New Tab`,
    restrictedChromeInternalPage: $localize`:@@dashboard.runtime.preview.chromeInternalPage:Chrome internal page`,
    restrictedChromeExtensionPage: $localize`:@@dashboard.runtime.preview.chromeExtensionPage:Chrome extension page`,
    restrictedEdgeInternalPage: $localize`:@@dashboard.runtime.preview.edgeInternalPage:Edge internal page`,
    restrictedBrowserInternalPage: $localize`:@@dashboard.runtime.preview.browserInternalPage:Browser internal page`,
    restrictedLocalFile: $localize`:@@dashboard.runtime.preview.localFile:Local file`,
    restrictedPageType: $localize`:@@dashboard.runtime.preview.restrictedPageType:Restricted page`,
    restrictedNoActiveTab: $localize`:@@dashboard.runtime.preview.noActiveTab:No active tab`,
    remoteOn: $localize`:@@dashboard.runtime.metrics.remoteOn:Remote on`,
    connected: $localize`:@@dashboard.runtime.status.connected:Connected`,
    offline: $localize`:@@dashboard.runtime.status.offline:Offline`,
    notConnected: $localize`:@@dashboard.runtime.task.notConnected:Not connected to server.`,
    extensionOffline: $localize`:@@dashboard.runtime.task.extensionOffline:Extension is offline.`,
    taskTimedOutTenMinutes: $localize`:@@dashboard.runtime.task.timeoutTenMinutes:Task timed out (10 minutes)`,
    etaPending: $localize`:@@dashboard.runtime.task.etaPending:Estimating remaining time`,
    phaseNavigating: $localize`:@@dashboard.runtime.task.phaseNavigating:Navigating`,
    phaseReading: $localize`:@@dashboard.runtime.task.phaseReading:Reading page`,
    phaseFilling: $localize`:@@dashboard.runtime.task.phaseFilling:Filling form`,
    phaseAnalyzing: $localize`:@@dashboard.runtime.task.phaseAnalyzing:Analyzing`,
    phasePlanning: $localize`:@@dashboard.runtime.task.phasePlanning:Planning`,
    phaseActing: $localize`:@@dashboard.runtime.task.phaseActing:Acting`,
    phaseWriting: $localize`:@@dashboard.runtime.task.phaseWriting:Writing`,
    phaseSwitchingTabs: $localize`:@@dashboard.runtime.task.phaseSwitchingTabs:Switching tabs`,
    phaseCallingApi: $localize`:@@dashboard.runtime.task.phaseCallingApi:Calling API`,
    phaseWatchingTrigger: $localize`:@@dashboard.runtime.task.phaseWatchingTrigger:Watching a trigger`,
    phaseWaiting: $localize`:@@dashboard.runtime.task.phaseWaiting:Waiting`,
    phaseWorking: $localize`:@@dashboard.runtime.task.phaseWorking:Working`,
    progressSearching: $localize`:@@dashboard.runtime.task.progressSearching:Searching`,
    progressFormatting: $localize`:@@dashboard.runtime.task.progressFormatting:Formatting`,
    progressFormatted: $localize`:@@dashboard.runtime.task.progressFormatted:Formatted`,
    progressTaskCompleted: $localize`:@@dashboard.runtime.task.progressTaskCompleted:Task completed`,
    progressTaskPartiallyCompleted: $localize`:@@dashboard.runtime.task.progressTaskPartiallyCompleted:Task partially completed`,
    progressTaskError: $localize`:@@dashboard.runtime.task.progressTaskError:Task ended with an error`,
    progressReviewingPage: $localize`:@@dashboard.runtime.task.progressReviewingPage:Reviewing page state`,
    progressPlanningNextStep: $localize`:@@dashboard.runtime.task.progressPlanningNextStep:Planning next step`,
    progressPerformingAction: $localize`:@@dashboard.runtime.task.progressPerformingAction:Performing browser action`,
    progressRecoveringInterruption: $localize`:@@dashboard.runtime.task.progressRecoveringInterruption:Recovering from interruption`,
    progressUpdatingPage: $localize`:@@dashboard.runtime.task.progressUpdatingPage:Updating page`,
    progressSwitchingTab: $localize`:@@dashboard.runtime.task.progressSwitchingTab:Switching to another tab`,
    progressWatchingDom: $localize`:@@dashboard.runtime.task.progressWatchingDom:Watching DOM for change`,
    progressReconnectOrUpdate: $localize`:@@dashboard.runtime.task.progressReconnectOrUpdate:Reconnect or send another progress update`,
    taskCouldNotStart: $localize`:@@dashboard.runtime.task.couldNotStart:Task could not be started`,
    taskErrorMissing: $localize`:@@dashboard.runtime.task.errorMissing:No task was provided`,
    taskErrorAlreadyRunning: $localize`:@@dashboard.runtime.task.errorAlreadyRunning:Another task is already running`,
    taskErrorNoUsableTab: $localize`:@@dashboard.runtime.task.errorNoUsableTab:No usable browser tab was found`,
    taskCouldNotComplete: $localize`:@@dashboard.runtime.task.couldNotComplete:Task could not be completed`,
    taskStopped: $localize`:@@dashboard.runtime.task.stopped:Stopped by user`,
    taskReconnected: $localize`:@@dashboard.runtime.task.reconnected:Reconnected...`,
    extensionOfflinePlaceholder: $localize`:@@dashboard.runtime.task.extensionOfflinePlaceholder:Extension offline...`,
    taskPlaceholder: $localize`:@@dashboard.runtime.task.placeholder:What should FSB do?`,
    connecting: $localize`:@@dashboard.runtime.auth.connecting:Connecting...`,
    connectWithKey: $localize`:@@dashboard.runtime.auth.connectWithKey:Connect with Key`,
    invalidHashKey: $localize`:@@dashboard.runtime.auth.invalidKey:Invalid hash key. Check your key and try again.`,
    cannotConnect: $localize`:@@dashboard.runtime.auth.cannotConnect:Could not connect to server. Check your connection and try again.`,
    sessionExpired: $localize`:@@dashboard.runtime.auth.sessionExpired:Session expired. Scan QR code to reconnect.`,
    qrScannerUnavailable: $localize`:@@dashboard.runtime.qr.unavailable:QR scanner not available`,
    cameraUnavailable: $localize`:@@dashboard.runtime.qr.cameraUnavailable:Camera unavailable`,
    qrMissingToken: $localize`:@@dashboard.runtime.qr.missingToken:QR code does not contain a pairing token`,
    qrExchangeFailed: $localize`:@@dashboard.runtime.qr.exchangeFailed:Pairing exchange failed`,
    qrInvalidOrExpired: $localize`:@@dashboard.runtime.qr.invalidOrExpired:The pairing code is invalid or expired`,
    qrTokenUsed: $localize`:@@dashboard.runtime.qr.tokenUsed:The pairing code has already been used`,
    qrTokenExpired: $localize`:@@dashboard.runtime.qr.tokenExpired:The pairing code has expired`,
    scanFailed: $localize`:@@dashboard.runtime.qr.scanFailed:Scan failed -- paste your key instead`,
    pointCamera: $localize`:@@dashboard.runtime.qr.pointCamera:Point camera at QR code in FSB extension`,
    qrViewfinder: $localize`:@@dashboard.runtime.qr.viewfinder:QR code camera viewfinder`,
    remoteControlAria: $localize`:@@dashboard.runtime.remote.aria:Remote browser control`,
    disableRemoteControl: $localize`:@@dashboard.runtime.remote.disable:Disable remote control`,
    remoteControl: $localize`:@@dashboard.runtime.remote.control:Remote control`,
    minimize: $localize`:@@dashboard.runtime.preview.minimize:Minimize`,
    exitPip: $localize`:@@dashboard.runtime.preview.exitPip:Exit picture-in-picture`,
    exitFullscreen: $localize`:@@dashboard.runtime.preview.exitFullscreen:Exit fullscreen`,
    maximize: $localize`:@@dashboard.runtime.preview.maximize:Maximize`,
    pip: $localize`:@@dashboard.runtime.preview.pip:Picture-in-picture`,
    fullscreen: $localize`:@@dashboard.runtime.preview.fullscreen:Fullscreen`,
    dialogAlert: $localize`:@@dashboard.runtime.dialog.alert:Alert`,
    dialogConfirm: $localize`:@@dashboard.runtime.dialog.confirm:Confirm`,
    dialogPrompt: $localize`:@@dashboard.runtime.dialog.prompt:Prompt`,
    viewerCrossOriginFrame: $localize`:@@dashboard.runtime.viewer.crossOriginFrame:Cross-origin iframe`,
    viewerOriginLabel: $localize`:@@dashboard.runtime.viewer.originLabel:Origin`,
    viewerSourceLabel: $localize`:@@dashboard.runtime.viewer.sourceLabel:Source`,
    viewerPlayMedia: $localize`:@@dashboard.runtime.viewer.playMedia:Play mirrored media`,
    viewerUnmuteMedia: $localize`:@@dashboard.runtime.viewer.unmuteMedia:Unmute mirrored media`,
    viewerUnmute: $localize`:@@dashboard.runtime.viewer.unmute:Unmute`,
    viewerMediaPosterOnly: $localize`:@@dashboard.runtime.viewer.mediaPosterOnly:Media (poster only)`,
    viewerMediaUnavailable: $localize`:@@dashboard.runtime.viewer.mediaUnavailable:Media unavailable`,
    viewerLiveMirrorTitle: $localize`:@@dashboard.runtime.viewer.liveMirrorTitle:PhantomStream live mirror`,
    wsConnected: $localize`:@@dashboard.runtime.ws.connected:connected`,
    wsDisconnected: $localize`:@@dashboard.runtime.ws.disconnected:disconnected`,
    wsReconnecting: $localize`:@@dashboard.runtime.ws.reconnecting:reconnecting...`,
    resultSuccess: $localize`:@@dashboard.runtime.result.success:Success`,
    resultPartial: $localize`:@@dashboard.runtime.result.partial:Partial`,
    resultFailed: $localize`:@@dashboard.runtime.result.failed:Failed`,
    resultStopped: $localize`:@@dashboard.runtime.result.stopped:Stopped`,
    resultActions: $localize`:@@dashboard.runtime.result.actions:Actions`,
    resultCost: $localize`:@@dashboard.runtime.result.cost:Cost`,
    resultFinalUrl: $localize`:@@dashboard.runtime.result.finalUrl:Final URL`,
  } as const;

  // ---- Persistent state ----
  private hashKey = '';
  private sessionToken = '';
  private sessionExpiresAt = '';

  // ---- Runtime state ----
  private qrScanner: any = null;
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private agents: any[] = [];
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private stats: any = {};
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private selectedAgentId: string | null = null;
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private pollTimer: any = null;
  private ws: WebSocket | null = null;
  private wsReconnectDelay = 0;
  private readonly wsMaxReconnectDelay = 30000;
  private wsReconnectTimer: any = null;
  private wsPingTimer: any = null;
  private extensionOnline = false;

  // ---- Task control state ----
  private taskState: TaskState = 'idle';
  private taskText = '';
  private taskStartTime = 0;
  private taskElapsedTimer: any = null;
  private lastProgressAction = '';
  private taskTimeoutTimer: any = null;

  // ---- Agent management state ----
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private detailAgentId: string | null = null;
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private detailRunsOffset = 0;
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private readonly detailRunsLimit = 10;
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private modalMode: 'create' | 'edit' | null = null;
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private modalAgentId: string | null = null;
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private deleteAgentId: string | null = null;
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private deleteAgentName = '';
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private saveAgentScheduleType = 'interval';
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private agentRunningId: string | null = null;

  // ---- DOM preview state ----
  private previewState: PreviewState = 'hidden';
  private previewLayoutMode: PreviewLayoutMode = 'inline';
  private previewScale = 1;
  private previewViewer: any = null;
  private previewViewerHealth: any = null;
  private previewHideTimer: any = null;
  private previewSnapshotData: any = null;
  private lastPreviewScroll = { x: 0, y: 0 };
  private streamToggleOn = true;
  private streamTabUrl = '';
  private lastSnapshotTime = 0;
  private pageReady = false;
  private remoteControlOn = false;
  private previewLoadStartedAt = 0;
  private previewNotReadyReason = '';
  private lastRecoveredStreamState = '';
  private pendingStreamRecovery: any = null;
  private activePreviewStreamSessionId = '';
  private activePreviewSnapshotId = 0;
  private activePreviewTabId: number | null = null;
  private remoteControlCaptureActive = false;
  private staleMutationCount = 0;
  private mutationApplyFailures = 0;
  // Phase 276 STREAM-04: stream-state tooltip counters surfaced via
  // updatePreviewTooltip. mutationsAppliedTotal increments inside the
  // handleDOMMutations forEach branch; lastFrameTime is refreshed on every
  // snapshot AND every mutation arrival.
  private mutationsAppliedTotal = 0;
  private lastFrameTime = 0;
  private previewResyncPending = false;
  private lastPreviewOverlayIdentity: PreviewOverlayIdentity = {
    clientLabel: '',
    lifecycle: '',
    result: '',
    sessionToken: '',
    version: null,
  };

  // ---- Task recovery state ----
  private activeTaskRunId = '';
  private lastCompletedTaskRunId = '';
  private lastTaskStateUpdatedAt = 0;
  private taskRecoveryPending = false;
  private taskRecoveryStartedAt = 0;
  private taskRecoveryTimer: any = null;
  private taskRecoverySource = '';

  // ---- Remote control state ----
  private lastRemoteControlState: RemoteControlState = {
    enabled: false,
    attached: false,
    tabId: null,
    reason: 'user-stop',
    ownership: 'none',
  };
  private remoteControlRequestedAt = 0;
  private remoteControlRequestTimer: any = null;
  private readonly REMOTE_CONTROL_START_GRACE_MS = 5000;

  // ---- DOM references (populated in ngAfterViewInit) ----
  private loginSection!: HTMLElement | null;
  private contentSection!: HTMLElement | null;
  private keyInput!: HTMLInputElement | null;
  private connectBtn!: HTMLElement | null;
  private disconnectBtn!: HTMLElement | null;
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private agentCountEl!: HTMLElement | null;
  private sseStatusEl!: HTMLElement | null;
  private wakeBtn!: HTMLElement | null;
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private agentGrid!: HTMLElement | null;
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private emptyState!: HTMLElement | null;
  private tabScan!: HTMLElement | null;
  private tabPaste!: HTMLElement | null;
  private tabScanContent!: HTMLElement | null;
  private tabPasteContent!: HTMLElement | null;
  private scanError!: HTMLElement | null;
  private loginMessage!: HTMLElement | null;
  private pairedBadge!: HTMLElement | null;

  // Task control DOM refs
  private taskArea!: HTMLElement | null;
  private taskInput!: HTMLInputElement | null;
  private taskSubmitBtn!: HTMLElement | null;
  private taskInputRow!: HTMLElement | null;
  private taskProgressView!: HTMLElement | null;
  private taskTitle!: HTMLElement | null;
  private taskBarFill!: HTMLElement | null;
  private taskPercent!: HTMLElement | null;
  private taskPhase!: HTMLElement | null;
  private taskEta!: HTMLElement | null;
  private taskElapsed!: HTMLElement | null;
  private taskRecoveryStatusEl!: HTMLElement | null;
  private taskAction!: HTMLElement | null;
  private taskSuccessView!: HTMLElement | null;
  private taskSuccessStatus!: HTMLElement | null;
  private taskResultText!: HTMLElement | null;
  private taskInputNext!: HTMLInputElement | null;
  private taskSubmitNext!: HTMLElement | null;
  private taskFailedView!: HTMLElement | null;
  private taskFailedStatus!: HTMLElement | null;
  private taskErrorText!: HTMLElement | null;
  private taskRetryBtn!: HTMLElement | null;
  private taskInputRetry!: HTMLInputElement | null;
  private taskSubmitRetry!: HTMLElement | null;
  private taskStopBtn!: HTMLElement | null;

  // DOM preview refs
  private previewContainer!: HTMLElement | null;
  private previewViewerHost!: HTMLElement | null;
  private previewLoading!: HTMLElement | null;
  private previewGlow!: HTMLElement | null;
  private previewProgress!: HTMLElement | null;
  private previewProgressBadge!: HTMLElement | null;
  private previewProgressStatus!: HTMLElement | null;
  private previewProgressDetail!: HTMLElement | null;
  private previewStatus!: HTMLElement | null;
  private previewRcState!: HTMLElement | null;
  private previewDisconnected!: HTMLElement | null;
  private previewError!: HTMLElement | null;
  private previewDialog!: HTMLElement | null;
  private previewDialogType!: HTMLElement | null;
  private previewDialogMessage!: HTMLElement | null;
  private previewToggle!: HTMLElement | null;
  private previewTooltip!: HTMLElement | null;
  // Phase 276 STREAM-04: Resync button DOM ref.
  private previewResyncBtn!: HTMLElement | null;
  private previewPipBtn!: HTMLElement | null;
  private previewMaximizeBtn!: HTMLElement | null;
  private previewFullscreenBtn!: HTMLElement | null;
  private previewRcBtn!: HTMLElement | null;
  private remoteOverlay!: HTMLElement | null;
  private previewFsExit!: HTMLElement | null;
  private previewFrozenOverlay!: HTMLElement | null;
  private previewFrozenBadge!: HTMLElement | null;
  private previewFrozenLabel!: HTMLElement | null;
  // URL bar (Phase 212 / NAV-01)
  private previewUrlBar!: HTMLElement | null;
  private previewUrlInput!: HTMLInputElement | null;
  private previewUrlForm!: HTMLFormElement | null;
  private previewUrlBack!: HTMLElement | null;
  private previewUrlForward!: HTMLElement | null;
  private previewUrlReload!: HTMLElement | null;
  // Restricted-tab placeholder (Phase 212 / STREAM-06)
  private previewRestricted!: HTMLElement | null;
  private previewRestrictedTitle!: HTMLElement | null;
  private previewRestrictedUrl!: HTMLElement | null;
  private lastKnownStreamUrl = '';

  // Action feed DOM refs
  private actionFeed!: HTMLElement | null;
  private readonly ACTION_FEED_MAX = 15;

  // Agent management DOM refs
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private newAgentBtn!: HTMLElement | null;
  // private agentContainer!: HTMLElement | null;
  // private detailPanel!: HTMLElement | null;
  // private detailClose!: HTMLElement | null;
  // private detailRunNow!: HTMLElement | null;
  // private detailEdit!: HTMLElement | null;
  // private detailDelete!: HTMLElement | null;
  // private detailName!: HTMLElement | null;
  // private detailTask!: HTMLElement | null;
  // private detailUrl!: HTMLElement | null;
  // private detailSchedule!: HTMLElement | null;
  // private detailReplayRuns!: HTMLElement | null;
  // private detailAiFallback!: HTMLElement | null;
  // private detailTokensSaved!: HTMLElement | null;
  // private detailCostSaved!: HTMLElement | null;
  // private detailRunProgress!: HTMLElement | null;
  // private detailRunBar!: HTMLElement | null;
  // private detailRunAction!: HTMLElement | null;
  // private detailRunsList!: HTMLElement | null;
  // private detailRunsPagination!: HTMLElement | null;
  // private detailScriptToggle!: HTMLElement | null;
  // private detailScriptContent!: HTMLElement | null;
  // private detailScriptList!: HTMLElement | null;
  // private detailScriptChevron!: HTMLElement | null;
//
  // Modal DOM refs
  // private modalOverlay!: HTMLElement | null;
  // private modalTitle!: HTMLElement | null;
  // private modalClose!: HTMLElement | null;
  // private modalName!: HTMLInputElement | null;
  // private modalTask!: HTMLTextAreaElement | null;
  // private modalUrl!: HTMLInputElement | null;
  // private modalScheduleType!: HTMLElement | null;
  // private modalScheduleConfig!: HTMLElement | null;
  // private modalDiscard!: HTMLElement | null;
  // private modalSave!: HTMLElement | null;
//
  // Delete dialog DOM refs
  // private deleteOverlay!: HTMLElement | null;
  // private deleteTitle!: HTMLElement | null;
  // private deleteCancel!: HTMLElement | null;
  // private deleteConfirm!: HTMLElement | null;
//
  // Save-as-Agent DOM refs
  // private saveAgentSection!: HTMLElement | null;
  // private saveAgentTrigger!: HTMLElement | null;
  // private saveAgentFields!: HTMLElement | null;
  // private saveAgentNameEl!: HTMLInputElement | null;
  // private saveAgentUrlEl!: HTMLInputElement | null;
  // private saveAgentBtn!: HTMLElement | null;
  // private saveAgentScheduleConfig!: HTMLElement | null;
//
  // Cleanup tracking
  private destroyed = false;
  private readonly boundHandlers: Array<{ el: EventTarget; event: string; handler: EventListener; options?: any }> = [];
  private resizeObserver: ResizeObserver | null = null;

  // ==================== LIFECYCLE ====================

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.initDOMRefs();
      this.initEventListeners();
      this.initTransportDiagnostics();
      this.autoConnect();
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;

    // Close WebSocket
    this.disconnectWS();

    // Stop polling
    // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
    // this.stopPolling();

    // Stop QR scanner
    this.stopQRScanner();

    // Clear all timers
    if (this.taskElapsedTimer) clearInterval(this.taskElapsedTimer);
    if (this.taskTimeoutTimer) clearTimeout(this.taskTimeoutTimer);
    if (this.taskRecoveryTimer) clearTimeout(this.taskRecoveryTimer);
    this.clearRemoteControlRequestTimer();
    if (this.previewHideTimer) clearTimeout(this.previewHideTimer);
    if (this.pendingStreamRecovery) clearTimeout(this.pendingStreamRecovery);

    // Remove event listeners
    for (const binding of this.boundHandlers) {
      binding.el.removeEventListener(binding.event, binding.handler, binding.options);
    }
    this.boundHandlers.length = 0;

    // Disconnect ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.previewViewer && typeof this.previewViewer.destroy === 'function') {
      this.previewViewer.destroy();
      this.previewViewer = null;
    }
  }

  // ==================== DOM INITIALIZATION ====================

  private el(id: string): HTMLElement | null {
    return this.host.nativeElement.querySelector(`#${id}`);
  }

  private initDOMRefs(): void {
    this.loginSection = this.el('dash-login');
    this.contentSection = this.el('dash-content');
    this.keyInput = this.el('dash-key-input') as HTMLInputElement | null;
    this.connectBtn = this.el('dash-connect-btn');
    this.disconnectBtn = this.el('dash-disconnect-btn');
    // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
    // this.agentCountEl = this.el('dash-agent-count');
    this.sseStatusEl = this.el('dash-sse-status');
    this.wakeBtn = this.el('dash-wake-btn');
    // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
    // this.agentGrid = this.el('dash-agent-grid');
    // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
    // this.emptyState = this.el('dash-empty');
    this.tabScan = this.el('dash-tab-scan');
    this.tabPaste = this.el('dash-tab-paste');
    this.tabScanContent = this.el('tab-scan');
    this.tabPasteContent = this.el('tab-paste');
    this.scanError = this.el('dash-scan-error');
    this.loginMessage = this.el('dash-login-message');
    this.pairedBadge = this.el('dash-paired-badge');

    this.taskArea = this.el('dash-task-area');
    this.taskInput = this.el('dash-task-input') as HTMLInputElement | null;
    this.taskSubmitBtn = this.el('dash-task-submit');
    this.taskInputRow = this.el('dash-task-input-row');
    this.taskProgressView = this.el('dash-task-progress');
    this.taskTitle = this.el('dash-task-title');
    this.taskBarFill = this.el('dash-task-bar-fill');
    this.taskPercent = this.el('dash-task-percent');
    this.taskPhase = this.el('dash-task-phase');
    this.taskEta = this.el('dash-task-eta');
    this.taskElapsed = this.el('dash-task-elapsed');
    this.taskRecoveryStatusEl = this.el('dash-task-recovery-status');
    this.taskAction = this.el('dash-task-action');
    this.taskSuccessView = this.el('dash-task-success');
    this.taskSuccessStatus = this.el('dash-task-success-status');
    this.taskResultText = this.el('dash-task-result-text');
    this.taskInputNext = this.el('dash-task-input-next') as HTMLInputElement | null;
    this.taskSubmitNext = this.el('dash-task-submit-next');
    this.taskFailedView = this.el('dash-task-failed');
    this.taskFailedStatus = this.el('dash-task-failed-status');
    this.taskErrorText = this.el('dash-task-error-text');
    this.taskRetryBtn = this.el('dash-task-retry');
    this.taskInputRetry = this.el('dash-task-input-retry') as HTMLInputElement | null;
    this.taskSubmitRetry = this.el('dash-task-submit-retry');
    this.taskStopBtn = this.el('dash-task-stop');

    this.previewContainer = this.el('dash-preview');
    this.previewViewerHost = this.el('dash-preview-viewer');
    this.previewLoading = this.el('dash-preview-loading');
    this.previewGlow = this.el('dash-preview-glow');
    this.previewProgress = this.el('dash-preview-progress');
    this.previewProgressBadge = this.el('dash-preview-progress-badge');
    this.previewProgressStatus = this.el('dash-preview-progress-status');
    this.previewProgressDetail = this.el('dash-preview-progress-detail');
    this.previewStatus = this.el('dash-preview-status');
    this.previewRcState = this.el('dash-preview-rc-state');
    this.previewDisconnected = this.el('dash-preview-disconnected');
    this.previewError = this.el('dash-preview-error');
    this.previewDialog = this.el('dash-preview-dialog');
    this.previewDialogType = this.el('dash-preview-dialog-type');
    this.previewDialogMessage = this.el('dash-preview-dialog-message');
    this.previewToggle = this.el('dash-preview-toggle');
    this.previewTooltip = this.el('dash-preview-tooltip');
    // Phase 276 STREAM-04
    this.previewResyncBtn = this.el('dash-preview-resync-btn');
    this.previewPipBtn = this.el('dash-preview-pip-btn');
    this.previewMaximizeBtn = this.el('dash-preview-maximize-btn');
    this.previewFullscreenBtn = this.el('dash-preview-fullscreen-btn');
    this.previewRcBtn = this.el('dash-preview-rc-btn');
    this.remoteOverlay = this.el('dash-remote-overlay');
    this.previewFsExit = this.el('dash-preview-fs-exit');
    this.previewFrozenOverlay = this.el('dash-preview-frozen-overlay');
    this.previewFrozenBadge = this.el('dash-preview-frozen-badge');
    this.previewFrozenLabel = this.previewFrozenOverlay ? this.previewFrozenOverlay.querySelector('.dash-preview-frozen-label') : null;
    // Phase 212 / NAV-01: URL bar refs
    this.previewUrlBar = this.el('dash-preview-urlbar');
    this.previewUrlInput = this.el('dash-preview-urlbar-input') as HTMLInputElement | null;
    this.previewUrlForm = this.el('dash-preview-urlbar-form') as HTMLFormElement | null;
    this.previewUrlBack = this.el('dash-preview-urlbar-back');
    this.previewUrlForward = this.el('dash-preview-urlbar-forward');
    this.previewUrlReload = this.el('dash-preview-urlbar-reload');
    // Phase 212 / STREAM-06: restricted-tab placeholder refs
    this.previewRestricted = this.el('dash-preview-restricted');
    this.previewRestrictedTitle = this.el('dash-preview-restricted-title');
    this.previewRestrictedUrl = this.el('dash-preview-restricted-url');
    this.actionFeed = this.el('dash-action-feed');

    // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
    // this.newAgentBtn = this.el('dash-new-agent-btn');
    // this.agentContainer = this.el('dash-agent-container');
    // this.detailPanel = this.el('dash-agent-detail');
    // this.detailClose = this.el('dash-detail-close');
    // this.detailRunNow = this.el('dash-detail-run-now');
    // this.detailEdit = this.el('dash-detail-edit');
    // this.detailDelete = this.el('dash-detail-delete');
    // this.detailName = this.el('dash-detail-name');
    // this.detailTask = this.el('dash-detail-task');
    // this.detailUrl = this.el('dash-detail-url');
    // this.detailSchedule = this.el('dash-detail-schedule');
    // this.detailReplayRuns = this.el('dash-detail-replay-runs');
    // this.detailAiFallback = this.el('dash-detail-ai-fallback');
    // this.detailTokensSaved = this.el('dash-detail-tokens-saved');
    // this.detailCostSaved = this.el('dash-detail-cost-saved');
    // this.detailRunProgress = this.el('dash-detail-run-progress');
    // this.detailRunBar = this.el('dash-detail-run-bar');
    // this.detailRunAction = this.el('dash-detail-run-action');
    // this.detailRunsList = this.el('dash-detail-runs');
    // this.detailRunsPagination = this.el('dash-detail-runs-pagination');
    // this.detailScriptToggle = this.el('dash-detail-script-toggle');
    // this.detailScriptContent = this.el('dash-detail-script-content');
    // this.detailScriptList = this.el('dash-detail-script-list');
    // this.detailScriptChevron = this.el('dash-detail-script-chevron');
//
    // this.modalOverlay = this.el('dash-agent-modal-overlay');
    // this.modalTitle = this.el('dash-modal-title');
    // this.modalClose = this.el('dash-modal-close');
    // this.modalName = this.el('dash-modal-name') as HTMLInputElement | null;
    // this.modalTask = this.el('dash-modal-task') as HTMLTextAreaElement | null;
    // this.modalUrl = this.el('dash-modal-url') as HTMLInputElement | null;
    // this.modalScheduleType = this.el('dash-modal-schedule-type');
    // this.modalScheduleConfig = this.el('dash-modal-schedule-config');
    // this.modalDiscard = this.el('dash-modal-discard');
    // this.modalSave = this.el('dash-modal-save');
//
    // this.deleteOverlay = this.el('dash-delete-overlay');
    // this.deleteTitle = this.el('dash-delete-title');
    // this.deleteCancel = this.el('dash-delete-cancel');
    // this.deleteConfirm = this.el('dash-delete-confirm');
//
    // this.saveAgentSection = this.el('dash-task-save-agent');
    // this.saveAgentTrigger = this.el('dash-save-agent-trigger');
    // this.saveAgentFields = this.el('dash-save-agent-fields');
    // this.saveAgentNameEl = this.el('dash-save-agent-name') as HTMLInputElement | null;
    // this.saveAgentUrlEl = this.el('dash-save-agent-url') as HTMLInputElement | null;
    // this.saveAgentBtn = this.el('dash-save-agent-btn');
    // this.saveAgentScheduleConfig = this.el('dash-save-agent-schedule-config');
  }

  // ==================== EVENT LISTENERS ====================

  private listen(el: EventTarget | null, event: string, handler: EventListener, options?: any): void {
    if (!el) return;
    el.addEventListener(event, handler, options);
    this.boundHandlers.push({ el, event, handler, options });
  }

  private initEventListeners(): void {
    // Connect button
    this.listen(this.connectBtn, 'click', () => {
      const key = this.keyInput?.value.trim();
      if (key) this.connect(key);
    });

    // Key input Enter
    this.listen(this.keyInput, 'keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        const key = this.keyInput?.value.trim();
        if (key) this.connect(key);
      }
    });

    // Disconnect
    this.listen(this.disconnectBtn, 'click', () => this.disconnect());

    // Task control listeners
    this.setupTaskInput(this.taskInput, this.taskSubmitBtn);
    this.setupTaskInput(this.taskInputNext, this.taskSubmitNext);
    this.setupTaskInput(this.taskInputRetry, this.taskSubmitRetry);

    this.listen(this.taskRetryBtn, 'click', () => {
      if (this.taskText) this.submitTask(this.taskText);
    });

    this.listen(this.taskStopBtn, 'click', () => {
      this.sendDashboardWSMessage('dash:stop-task', {});
      if (this.taskAction) {
        this.taskAction.style.display = '';
        this.taskAction.textContent = this.dashboardCopy.stopping;
      }
      if (this.taskStopBtn) (this.taskStopBtn as HTMLButtonElement).disabled = true;
    });

    // Tab switching
    this.listen(this.tabScan, 'click', () => this.switchTab('scan'));
    this.listen(this.tabPaste, 'click', () => this.switchTab('paste'));

    // Remote control toggle
    this.listen(this.previewRcBtn, 'click', () => {
      this.handleRemoteControlToggleClick();
    });

    // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
    // Detail panel listeners
    // this.listen(this.detailClose, 'click', () => this.closeDetailPanel());
    // this.listen(this.detailRunNow, 'click', () => {
      // if (this.detailAgentId) this.runAgentNow(this.detailAgentId);
    // });
    // this.listen(this.detailEdit, 'click', () => {
      // if (this.detailAgentId) this.openAgentModal('edit', this.detailAgentId);
    // });
    // this.listen(this.detailDelete, 'click', () => {
      // if (this.detailAgentId) {
        // const agent = this.agents.find(a => a.agent_id === this.detailAgentId);
        // this.openDeleteDialog(this.detailAgentId, agent ? agent.name : this.detailAgentId);
      // }
    // });
//
    // Recorded script toggle
    // this.listen(this.detailScriptToggle, 'click', () => {
      // if (!this.detailScriptToggle) return;
      // const isExpanded = this.detailScriptToggle.classList.contains('expanded');
      // this.detailScriptToggle.classList.toggle('expanded');
      // if (this.detailScriptContent) this.detailScriptContent.style.display = isExpanded ? 'none' : 'block';
    // });

    // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
    // New Agent button
    // this.listen(this.newAgentBtn, 'click', () => this.openAgentModal('create'));

    // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
    // Modal listeners
    // this.listen(this.modalClose, 'click', () => this.closeAgentModal());
    // this.listen(this.modalDiscard, 'click', () => this.closeAgentModal());
    // this.listen(this.modalSave, 'click', () => this.saveAgentFromModal());
    // this.listen(this.modalOverlay, 'click', (e: Event) => {
      // if (e.target === this.modalOverlay) this.closeAgentModal();
    // });
//
    // Escape key closes modal/delete dialog/maximized
    // this.listen(document, 'keydown', (e: Event) => {
      // const key = (e as KeyboardEvent).key;
      // if (key === 'Escape') {
        // if (this.modalOverlay && this.modalOverlay.style.display !== 'none') {
          // this.closeAgentModal();
        // } else if (this.deleteOverlay && this.deleteOverlay.style.display !== 'none') {
          // this.closeDeleteDialog();
        // } else if (this.previewLayoutMode === 'maximized') {
          // this.setPreviewLayout('inline');
        // }
      // }
    // });
//
    // Schedule type pill handlers (modal)
    // this.listen(this.modalScheduleType, 'click', (e: Event) => {
      // const pill = (e.target as HTMLElement).closest('.dash-schedule-pill');
      // if (!pill) return;
      // this.modalScheduleType?.querySelectorAll('.dash-schedule-pill').forEach(p => p.classList.remove('active'));
      // pill.classList.add('active');
      // this.renderScheduleConfig(this.modalScheduleConfig, pill.getAttribute('data-type') || 'interval', '{}');
    // });
//
    // Delete dialog listeners
    // this.listen(this.deleteCancel, 'click', () => this.closeDeleteDialog());
    // this.listen(this.deleteConfirm, 'click', () => this.confirmDeleteAgent());
    // this.listen(this.deleteOverlay, 'click', (e: Event) => {
      // if (e.target === this.deleteOverlay) this.closeDeleteDialog();
    // });
//
    // Save-as-Agent listeners
    // this.listen(this.saveAgentTrigger, 'click', () => {
      // if (!this.saveAgentTrigger) return;
      // const isExpanded = this.saveAgentTrigger.classList.contains('expanded');
      // this.saveAgentTrigger.classList.toggle('expanded');
      // if (this.saveAgentFields) {
        // if (isExpanded) {
          // this.saveAgentFields.classList.remove('dash-save-expanded');
          // this.saveAgentFields.style.display = 'none';
        // } else {
          // this.saveAgentFields.style.display = 'flex';
          // this.saveAgentFields.classList.add('dash-save-expanded');
        // }
      // }
    // });
//
    // this.listen(this.saveAgentSection, 'click', (e: Event) => {
      // const pill = (e.target as HTMLElement).closest('.dash-schedule-pill');
      // if (!pill) return;
      // this.saveAgentSection?.querySelectorAll('.dash-schedule-pill').forEach(p => p.classList.remove('active'));
      // pill.classList.add('active');
      // this.renderScheduleConfig(this.saveAgentScheduleConfig, pill.getAttribute('data-type') || 'interval', '{}');
    // });
//
    // this.listen(this.saveAgentBtn, 'click', () => this.submitSaveAsAgent());
//
    // Wake Extension button
    this.listen(this.wakeBtn, 'click', () => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (this.wakeBtn) {
        (this.wakeBtn as HTMLButtonElement).disabled = true;
        this.wakeBtn.innerHTML = '<span class="dash-spinner"></span> ' + this.escapeHtml(this.dashboardCopy.waking);
      }
      this.sendDashboardWSMessage('dash:request-status', { trigger: 'wake-button' });
      this.sendDashboardWSMessage('dash:dom-stream-start', { trigger: 'wake-button' });
      this.recordTransportEvent('recovery-request-sent', {
        trigger: 'wake-button',
        requestStatusSent: true,
        streamStartSent: true,
      });
      setTimeout(() => {
        if (this.wakeBtn && !this.extensionOnline) {
          (this.wakeBtn as HTMLButtonElement).disabled = false;
          this.wakeBtn.innerHTML = '<i class="fa-solid fa-bell"></i> ' + this.escapeHtml(this.dashboardCopy.wakeExtension);
        }
      }, 5000);
    });

    // Preview control buttons
    this.listen(this.previewToggle, 'click', () => {
      this.streamToggleOn = !this.streamToggleOn;
      if (this.previewToggle) {
        this.previewToggle.title = this.streamToggleOn ? this.dashboardCopy.pauseStream : this.dashboardCopy.resumeStream;
        this.previewToggle.innerHTML = this.streamToggleOn
          ? '<i class="fa-solid fa-pause"></i>'
          : '<i class="fa-solid fa-play"></i>';
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        if (this.streamToggleOn) {
          this.sendDashboardWSMessage('dash:dom-stream-resume', {});
          this.scheduleStreamRecovery('toggle-resume');
        } else {
          this.clearPendingStreamRecovery();
          this.sendDashboardWSMessage('dash:dom-stream-pause', {});
          this.setPreviewState('paused');
        }
      }
    });

    this.listen(this.previewMaximizeBtn, 'click', () => this.toggleMaximize());
    this.listen(this.previewPipBtn, 'click', () => this.togglePip());
    this.listen(this.previewFullscreenBtn, 'click', () => this.toggleFullscreen());

    // Phase 276 STREAM-04: Resync button -- user-initiated forced refresh of
    // the live preview stream. Routes through the same requestPreviewResync
    // path the stale-mutation watchdog already uses; sends dash:request-status
    // + dash:dom-stream-start and arms the recovery watchdog if not already
    // pending. Idempotent -- if a resync is already pending the call returns
    // false and the button click is a no-op for the user.
    this.listen(this.previewResyncBtn, 'click', () => {
      this.requestPreviewResync('user-resync-button');
    });

    // Phase 212 / NAV-01: URL bar event handlers
    if (this.previewUrlForm) {
      this.listen(this.previewUrlForm, 'submit', (e: Event) => {
        e.preventDefault();
        this.submitUrlBar();
      });
    }
    if (this.previewUrlInput) {
      this.listen(this.previewUrlInput, 'keydown', (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter') {
          e.preventDefault();
          this.submitUrlBar();
        }
      });
      this.listen(this.previewUrlInput, 'focus', () => {
        try { this.previewUrlInput!.select(); } catch (_) { /* ignore */ }
      });
    }
    this.listen(this.previewUrlBack, 'click', () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendDashboardWSMessage('dash:navigate-history', { direction: 'back' });
      }
    });
    this.listen(this.previewUrlForward, 'click', () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendDashboardWSMessage('dash:navigate-history', { direction: 'forward' });
      }
    });
    this.listen(this.previewUrlReload, 'click', () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendDashboardWSMessage('dash:navigate-history', { direction: 'reload' });
      }
    });

    // Fullscreen change
    this.listen(document, 'fullscreenchange', () => {
      if (!document.fullscreenElement && this.previewLayoutMode === 'fullscreen') {
        this.setPreviewLayout('inline');
      }
    });

    // Window resize
    this.listen(window, 'resize', () => {
      if (this.previewState === 'streaming') {
        this.updatePreviewScale();
      }
    });

    // Visibility change (tab hidden/visible)
    this.listen(document, 'visibilitychange', () => {
      if (this.previewState === 'hidden' || this.previewState === 'error' || this.previewState === 'paused') return;
      if (document.hidden) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.previewState === 'streaming') {
          this.sendDashboardWSMessage('dash:dom-stream-pause', {});
        }
      } else {
        if (this.streamToggleOn && this.ws && this.ws.readyState === WebSocket.OPEN &&
            (this.previewState === 'streaming' || this.previewState === 'disconnected')) {
          this.sendDashboardWSMessage('dash:dom-stream-resume', {});
          this.scheduleStreamRecovery('visibility-resume');
        }
      }
    });

    // ResizeObserver for preview container
    if (typeof ResizeObserver !== 'undefined' && this.previewContainer) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.previewState === 'streaming') {
          this.updatePreviewScale();
        }
      });
      this.resizeObserver.observe(this.previewContainer);
    }

    // PiP drag handler
    this.initPipDrag();

    // Fullscreen exit overlay
    this.initFsExitOverlay();

    // Remote control event forwarding
    this.initRemoteControl();
  }

  private setupTaskInput(inputEl: HTMLInputElement | null, submitEl: HTMLElement | null): void {
    this.listen(inputEl, 'keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter' && inputEl?.value.trim()) {
        this.submitTask(inputEl.value.trim());
      }
    });
    this.listen(submitEl, 'click', () => {
      const text = inputEl?.value.trim() || '';
      if (text) this.submitTask(text);
    });
  }

  // ==================== AUTO-CONNECT ====================

  private autoConnect(): void {
    this.hashKey = localStorage.getItem(this.STORAGE_KEY) || '';
    this.sessionToken = localStorage.getItem(this.SESSION_KEY) || '';
    this.sessionExpiresAt = localStorage.getItem(this.SESSION_EXPIRES_KEY) || '';

    if (this.sessionToken && this.sessionExpiresAt) {
      if (new Date(this.sessionExpiresAt) > new Date()) {
        this.validateSession();
      } else {
        this.clearSessionStorage();
        this.showExpiredLogin();
      }
    } else if (this.hashKey) {
      this.validateAndConnect(this.hashKey);
    } else {
      // Auto-start QR scanner if login card is visible and no credentials exist
      if (this.loginSection && this.loginSection.style.display !== 'none' &&
          this.tabScan?.classList.contains('active')) {
        this.startQRScanner();
      }
    }
  }

  // ==================== TRANSPORT DIAGNOSTICS ====================

  private diagnostics!: TransportDiagnostics;

  private initTransportDiagnostics(): void {
    this.diagnostics = {
      events: [],
      counters: {
        byEvent: {},
        sentByType: {},
        receivedByType: {},
      },
      lastError: null,
      lastSnapshotRecovery: null,
    };
    // Expose for debugging
    (window as any).__FSBDashboardTransportDiagnostics = this.diagnostics;
  }

  private bumpTransportCounter(bucket: 'byEvent' | 'sentByType' | 'receivedByType', key: string): void {
    if (!key) return;
    this.diagnostics.counters[bucket][key] = (this.diagnostics.counters[bucket][key] || 0) + 1;
  }

  private recordTransportEvent(eventName: string, details?: any): any {
    const entry = { event: eventName, ts: Date.now(), ...details };
    this.diagnostics.events.push(entry);
    if (this.diagnostics.events.length > this.DASHBOARD_TRANSPORT_DIAGNOSTIC_LIMIT) {
      this.diagnostics.events.shift();
    }
    this.bumpTransportCounter('byEvent', eventName);
    return entry;
  }

  private recordTransportMessage(direction: 'sent' | 'received', type: string): void {
    if (!type) return;
    this.bumpTransportCounter(direction === 'sent' ? 'sentByType' : 'receivedByType', type);
  }

  private recordTransportError(eventName: string, errorMessage: string, details?: any): any {
    const entry = this.recordTransportEvent(eventName, {
      error: errorMessage || 'Unknown dashboard transport error',
      ...details,
    });
    this.diagnostics.lastError = {
      event: eventName,
      error: entry.error,
      ts: entry.ts,
      type: entry.type || '',
      readyState: entry.readyState,
      context: entry.context || '',
    };
    return entry;
  }

  private recordSnapshotRecovery(details: any): void {
    this.diagnostics.lastSnapshotRecovery = { ts: Date.now(), ...details };
  }

  // ==================== WS MESSAGE HELPERS ====================

  private sendDashboardWSMessage(type: string, payload: any): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.recordTransportError('message-send-failed', 'Dashboard WebSocket not open', {
        type,
        readyState: this.ws ? this.ws.readyState : 'missing',
      });
      return false;
    }
    this.recordTransportMessage('sent', type);
    this.ws.send(JSON.stringify({ type, payload: payload || {}, ts: Date.now() }));
    return true;
  }

  // ==================== PREVIEW MESSAGE IDENTITY ====================

  private getPreviewMessageIdentity(payload: any): { streamSessionId: string; snapshotId: number; tabId: number | null } {
    return {
      streamSessionId: payload?.streamSessionId || '',
      snapshotId: payload?.snapshotId || 0,
      tabId: typeof payload?.tabId === 'number' ? payload.tabId : null,
    };
  }

  private resetPreviewGenerationState(): void {
    this.staleMutationCount = 0;
    this.mutationApplyFailures = 0;
    this.previewViewerHealth = null;
    // Phase 276 STREAM-04: reset tooltip counters on every generation cycle
    // so a fresh snapshot starts counting from 0. lastFrameTime is left as-is
    // (refreshed on the next message) so the tooltip's "X seconds ago" reading
    // does not jump back to 0 mid-cycle.
    this.mutationsAppliedTotal = 0;
    this.previewResyncPending = false;
  }

  private handlePreviewViewerHealth(health: any): void {
    this.previewViewerHealth = health || null;
    if (this.previewViewerHealth) {
      if (typeof this.previewViewerHealth.staleMisses === 'number') {
        this.staleMutationCount = this.previewViewerHealth.staleMisses;
      }
      if (typeof this.previewViewerHealth.applyFailures === 'number') {
        this.mutationApplyFailures = this.previewViewerHealth.applyFailures;
      }
      if (typeof this.previewViewerHealth.lastFrameAt === 'number' && this.previewViewerHealth.lastFrameAt > 0) {
        this.lastFrameTime = this.previewViewerHealth.lastFrameAt;
      }
      if (typeof this.previewViewerHealth.lastSnapshotAt === 'number' && this.previewViewerHealth.lastSnapshotAt > 0) {
        this.lastSnapshotTime = this.previewViewerHealth.lastSnapshotAt;
      }
    }
    this.updatePreviewTooltip();
  }

  private handlePreviewViewerState(event: any): void {
    const state = event?.state || '';
    this.recordTransportEvent('phantomstream-viewer-state', {
      state,
      reason: event?.reason || '',
    });
    if (state === 'live' && this.previewState === 'loading' && this.previewSnapshotData) {
      this.setPreviewState('streaming');
    }
  }

  private ensurePreviewViewer(): any {
    if (this.previewViewer) return this.previewViewer;
    if (!this.previewViewerHost) {
      this.recordTransportError('phantomstream-viewer-missing', 'Preview viewer host missing', {
        type: 'dashboard-preview',
      });
      return null;
    }
    const bridge = (window as any).FSBPhantomStreamViewer;
    if (!bridge || typeof bridge.createDashboardViewer !== 'function') {
      this.recordTransportError('phantomstream-viewer-missing', 'PhantomStream viewer bundle missing', {
        type: 'dashboard-preview',
      });
      return null;
    }
    this.previewViewer = bridge.createDashboardViewer({
      container: this.previewViewerHost,
      copy: this.dashboardCopy,
      logger: console,
      onResync: (payload: any) => {
        payload = payload || {};
        this.requestPreviewResync(payload.reason || 'phantomstream-viewer-resync', payload);
      },
      onSubtreeRequest: (payload: any) => {
        this.recordTransportEvent('phantomstream-subtree-request-deferred', {
          requestId: payload?.requestId || '',
          nid: payload?.nid || '',
        });
      },
      onUnsupportedControl: (type: string) => {
        this.recordTransportEvent('phantomstream-control-ignored', {
          type: type || '',
        });
      },
      onState: (event: any) => this.handlePreviewViewerState(event),
      onHealth: (health: any) => this.handlePreviewViewerHealth(health),
      // Phase 33 (MEDIA): live <video>/<audio> mirroring by reference (parity
      // with the static dashboard). 'reference' is the package default and the
      // point of the feature; switch to 'poster'/'off' for a more conservative
      // posture. Degrade callbacks are logger-trapped by the package.
      mediaMode: 'reference',
      onMediaBlocked: (nid: string) => {
        this.recordTransportEvent('phantomstream-media-blocked', { nid: nid || '' });
      },
      onMediaUnavailable: (nid: string, reason: string) => {
        this.recordTransportEvent('phantomstream-media-unavailable', { nid: nid || '', reason: reason || '' });
      },
    });
    return this.previewViewer;
  }

  private dispatchPreviewViewer(type: string, payload: any): boolean {
    const viewer = this.ensurePreviewViewer();
    if (!viewer || typeof viewer.dispatch !== 'function') return false;
    viewer.dispatch(type, payload || {});
    return true;
  }

  /**
   * Phase 276 STREAM-04: seconds since the last DOM frame (snapshot OR mutation)
   * was applied to the preview viewer. Surfaced in the dash-preview-tooltip.
   * Returns 0 when no frame has been observed yet. Capped at -- not the
   * "0s ago" reading, which would be misleading if no frame ever arrived.
   */
  private lastFrameAgo(): number {
    if (!this.lastFrameTime) return 0;
    return Math.max(0, Math.round((Date.now() - this.lastFrameTime) / 1000));
  }

  private shouldAcceptPreviewMessage(payload: any, messageType: string): boolean {
    const identity = this.getPreviewMessageIdentity(payload);
    if (!this.activePreviewStreamSessionId && !this.activePreviewSnapshotId) return true;
    if (!identity.streamSessionId && !identity.snapshotId) return true;

    if (identity.streamSessionId && this.activePreviewStreamSessionId &&
        identity.streamSessionId !== this.activePreviewStreamSessionId) {
      this.recordTransportEvent('stale-preview-message-ignored', { type: messageType, ...identity });
      return false;
    }
    if (identity.snapshotId && this.activePreviewSnapshotId &&
        identity.snapshotId !== this.activePreviewSnapshotId) {
      this.recordTransportEvent('stale-preview-message-ignored', { type: messageType, ...identity });
      return false;
    }
    if (identity.tabId && this.activePreviewTabId && identity.tabId !== this.activePreviewTabId) {
      this.recordTransportEvent('stale-preview-message-ignored', { type: messageType, ...identity });
      return false;
    }
    return true;
  }

  private requestPreviewResync(reason: string, details?: any): boolean {
    if (this.previewResyncPending) return false;
    this.previewResyncPending = true;
    this.previewLoadStartedAt = Date.now();
    this.lastRecoveredStreamState = 'recovering';
    this.recordTransportEvent('mutation-resync-requested', { reason, ...details });
    this.setPreviewLoadingText(this.dashboardCopy.refreshingPreview);
    this.setPreviewState('loading');
    const statusSent = this.sendDashboardWSMessage('dash:request-status', { trigger: 'preview-resync', reason });
    const streamStartSent = this.sendDashboardWSMessage('dash:dom-stream-start', { trigger: 'preview-resync', reason });
    if (!statusSent && !streamStartSent) {
      this.previewResyncPending = false;
      return false;
    }
    if (!this.pendingStreamRecovery) {
      this.armPreviewRecoveryWatchdog('preview-resync:' + reason);
    }
    return true;
  }

  // ==================== TASK RUN ID HELPERS ====================

  private getTaskPayloadUpdatedAt(payload: any): number {
    return payload?.updatedAt || payload?.taskUpdatedAt || 0;
  }

  private getTaskRunId(payload: any): string {
    return payload?.taskRunId || '';
  }

  private acceptRunningTaskPayload(payload: any): boolean {
    const taskRunId = this.getTaskRunId(payload);
    if (!taskRunId) return true;
    if (this.lastCompletedTaskRunId && taskRunId === this.lastCompletedTaskRunId) return false;
    if (this.activeTaskRunId && taskRunId !== this.activeTaskRunId) return false;
    return true;
  }

  private acceptTerminalTaskPayload(payload: any): boolean {
    const taskRunId = this.getTaskRunId(payload);
    if (!taskRunId) return true;
    if (this.activeTaskRunId && taskRunId !== this.activeTaskRunId) return false;
    if (this.lastCompletedTaskRunId && taskRunId === this.lastCompletedTaskRunId) {
      const payloadUpdatedAt = this.getTaskPayloadUpdatedAt(payload);
      if (!payloadUpdatedAt || payloadUpdatedAt <= this.lastTaskStateUpdatedAt) return false;
    }
    return true;
  }

  private markTaskRunCompleted(taskRunId: string): void {
    this.activeTaskRunId = '';
    if (taskRunId) this.lastCompletedTaskRunId = taskRunId;
  }

  private rememberActiveTaskRun(taskRunId: string): void {
    if (taskRunId) this.activeTaskRunId = taskRunId;
  }

  // ==================== RUNTIME STATE HELPERS ====================

  private getDashboardRuntimeStateHelpers(): any {
    return (window as any).FSBDashboardRuntimeState || {};
  }

  private renderStateChip(element: HTMLElement | null, baseClassName: string, label: string, tone: string): void {
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

  private normalizeRemoteControlReason(reason: any, fallback: string): string {
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

  private normalizePhantomRemoteControlState(payload: any): RemoteControlState | null {
    if (!payload || typeof payload.state !== 'string') return null;
    const tabId = typeof payload.tabId === 'number' ? payload.tabId : null;
    const ownership = typeof payload.ownership === 'string' && payload.ownership ? payload.ownership : null;

    switch (payload.state) {
      case 'active':
        return {
          enabled: true,
          attached: true,
          tabId,
          reason: this.normalizeRemoteControlReason(payload.reason, 'ready'),
          ownership: ownership || 'dashboard',
        };
      case 'requesting':
      case 'locked':
        return {
          enabled: false,
          attached: false,
          tabId,
          reason: this.normalizeRemoteControlReason(payload.reason, 'requesting'),
          ownership: ownership || 'none',
        };
      case 'denied':
        return {
          enabled: false,
          attached: false,
          tabId,
          reason: this.normalizeRemoteControlReason(payload.reason, 'debugger-blocked'),
          ownership: ownership || 'none',
        };
      case 'stopped':
        return {
          enabled: false,
          attached: false,
          tabId,
          reason: this.normalizeRemoteControlReason(payload.reason, 'user-stop'),
          ownership: ownership || 'none',
        };
      default:
        return null;
    }
  }

  private normalizeRemoteControlState(payload: any): RemoteControlState {
    payload = payload || {};
    const phantomState = this.normalizePhantomRemoteControlState(payload);
    if (phantomState) return phantomState;
    return {
      enabled: !!payload.enabled,
      attached: !!payload.attached,
      tabId: typeof payload.tabId === 'number' ? payload.tabId : null,
      reason: typeof payload.reason === 'string' && payload.reason ? payload.reason : 'user-stop',
      ownership: typeof payload.ownership === 'string' && payload.ownership ? payload.ownership : 'none',
    };
  }

  private derivePreviewRuntimeSurface(): PreviewSurface {
    const helpers = this.getDashboardRuntimeStateHelpers();
    if (helpers.derivePreviewSurface) {
      return helpers.derivePreviewSurface({
        previewState: this.previewState,
        lastRecoveredStreamState: this.lastRecoveredStreamState,
        previewNotReadyReason: this.previewNotReadyReason,
        streamToggleOn: this.streamToggleOn,
        previewResyncPending: this.previewResyncPending,
        hasLiveSnapshot: !!this.previewSnapshotData,
        copy: this.dashboardCopy,
      });
    }
    return {
      chipLabel: '',
      chipTone: 'paused',
      detailText: '',
      showIframe: false,
      showLoading: false,
      showDisconnected: false,
    };
  }

  private deriveRemoteRuntimeSurface(payload: RemoteControlState): RemoteControlSurface {
    const remoteControlAvailable = this.canClickRemoteControlToggle();
    const helpers = this.getDashboardRuntimeStateHelpers();
    if (helpers.deriveRemoteControlSurface) {
      return helpers.deriveRemoteControlSurface({
        remoteControlOn: this.remoteControlOn,
        previewState: this.previewState,
        remoteControlAvailable,
        attached: payload.attached,
        reason: payload.reason,
        ownership: payload.ownership,
        requestPending: this.isRemoteControlStartPending(),
        copy: this.dashboardCopy,
      });
    }
    return {
      chipLabel: '',
      chipTone: 'paused',
      detailText: '',
      available: remoteControlAvailable,
      shouldForceDisable: payload.attached !== true || payload.reason !== 'ready',
    };
  }

  private deriveTaskRecoveryRuntimeSurface(incomingTaskRunId: string): TaskRecoverySurface {
    const helpers = this.getDashboardRuntimeStateHelpers();
    const timedOut = !!(this.taskRecoveryPending &&
      this.taskRecoveryStartedAt &&
      (Date.now() - this.taskRecoveryStartedAt >= this.TASK_RECOVERY_DEADLINE_MS));
    if (helpers.deriveTaskRecoverySurface) {
      return helpers.deriveTaskRecoverySurface({
        taskState: this.taskState,
        activeTaskRunId: this.activeTaskRunId,
        incomingTaskRunId: incomingTaskRunId || '',
        extensionOnline: this.extensionOnline,
        wsConnected: !!(this.ws && this.ws.readyState === WebSocket.OPEN),
        recoveryPending: this.taskRecoveryPending,
        recoveryTimedOut: timedOut,
        lastActionText: this.lastProgressAction || '',
        copy: this.dashboardCopy,
      });
    }
    return {
      chipLabel: '',
      chipTone: 'paused',
      actionText: this.lastProgressAction || '',
      keepProgressView: false,
      shouldFail: timedOut,
    };
  }

  private clearPreviewOverlayIdentity(): void {
    this.lastPreviewOverlayIdentity = {
      clientLabel: '',
      lifecycle: '',
      result: '',
      sessionToken: '',
      version: null,
    };
  }

  private rememberPreviewOverlayIdentity(progressPayload: any): void {
    if (!progressPayload || progressPayload.lifecycle === 'cleared') {
      this.clearPreviewOverlayIdentity();
      return;
    }

    this.lastPreviewOverlayIdentity = {
      clientLabel: String(progressPayload.clientLabel || '').trim(),
      lifecycle: String(progressPayload.lifecycle || '').trim(),
      result: String(progressPayload.result || '').trim(),
      sessionToken: String(progressPayload.sessionToken || '').trim(),
      version: typeof progressPayload.version === 'number' ? progressPayload.version : null,
    };
  }

  private renderPreviewClientBadge(target: HTMLElement | null, clientLabel: string): void {
    if (!target) return;
    const label = String(clientLabel || '').trim();
    target.textContent = label;
    target.style.display = label ? 'inline-flex' : 'none';
  }

  private renderPreviewFrozenIdentity(): void {
    this.renderPreviewClientBadge(this.previewFrozenBadge, this.lastPreviewOverlayIdentity.clientLabel);
  }

  // ==================== TASK RECOVERY ====================

  private clearTaskRecoveryTimer(): void {
    if (this.taskRecoveryTimer) {
      clearTimeout(this.taskRecoveryTimer);
      this.taskRecoveryTimer = null;
    }
  }

  private failTaskRecovery(): void {
    this.clearTaskRecoveryTimer();
    this.taskRecoveryPending = false;
    this.taskRecoveryStartedAt = 0;
    this.taskRecoverySource = 'timeout';
    const timeoutMessage = this.lastProgressAction
      ? $localize`:@@dashboard.runtime.task.recoveryTimeoutWithAction:Task recovery timed out -- was: ${this.lastProgressAction}:action:`
      : this.dashboardCopy.taskTimedOutAction;
    this.setTaskState('failed', {
      error: timeoutMessage,
      elapsed: this.taskStartTime ? (Date.now() - this.taskStartTime) : 0,
    });
  }

  private renderTaskRecoveryStatus(incomingTaskRunId: string, taskSource?: string): void {
    if (taskSource) this.taskRecoverySource = taskSource;
    const surface = this.deriveTaskRecoveryRuntimeSurface(incomingTaskRunId || '');
    if (surface.shouldFail) {
      this.failTaskRecovery();
      return;
    }
    this.renderStateChip(this.taskRecoveryStatusEl, 'dash-task-recovery-status', surface.chipLabel, surface.chipTone);
    if (this.taskState === 'running' && surface.keepProgressView && this.taskProgressView) {
      this.taskProgressView.style.display = 'block';
    }
    if (this.taskAction && this.taskState === 'running' && surface.actionText) {
      this.taskAction.style.display = '';
      this.taskAction.textContent = surface.actionText || this.dashboardCopy.taskWaitingAction;
    }
  }

  private setTaskRecoveryPending(on: boolean, reason?: string): void {
    if (on) {
      if (!this.taskRecoveryPending) {
        this.taskRecoveryStartedAt = Date.now();
      }
      this.taskRecoveryPending = true;
      this.taskRecoverySource = reason || this.taskRecoverySource || 'recovery';
      this.clearTaskRecoveryTimer();
      this.taskRecoveryTimer = setTimeout(() => {
        this.renderTaskRecoveryStatus(this.activeTaskRunId || '', this.taskRecoverySource);
      }, this.TASK_RECOVERY_DEADLINE_MS);
      this.renderTaskRecoveryStatus(this.activeTaskRunId || '', reason || this.taskRecoverySource);
      return;
    }
    this.taskRecoveryPending = false;
    this.taskRecoveryStartedAt = 0;
    this.taskRecoverySource = reason || '';
    this.clearTaskRecoveryTimer();
    this.renderTaskRecoveryStatus(this.activeTaskRunId || '', reason || '');
  }

  private maybeClearTaskRecoveryFromPayload(payload: any): boolean {
    if (!payload) return false;
    const incomingTaskRunId = this.getTaskRunId(payload);
    const source = payload.taskSource || payload.snapshotSource || this.taskRecoverySource || '';
    if (source) this.taskRecoverySource = source;
    if (!this.taskRecoveryPending) {
      this.renderTaskRecoveryStatus(incomingTaskRunId, source);
      return false;
    }
    if (!incomingTaskRunId) {
      this.renderTaskRecoveryStatus('', source);
      return false;
    }
    if (!this.activeTaskRunId) {
      this.rememberActiveTaskRun(incomingTaskRunId);
    }
    if (this.activeTaskRunId && incomingTaskRunId === this.activeTaskRunId) {
      this.setTaskRecoveryPending(false, source);
      return true;
    }
    this.renderTaskRecoveryStatus(incomingTaskRunId, source);
    return false;
  }

  // ==================== REMOTE CONTROL STATE ====================

  private renderRemoteControlState(payload: any, options?: { skipToggleSync?: boolean }): RemoteControlSurface {
    options = options || {};
    const nextState = this.normalizeRemoteControlState(payload || this.lastRemoteControlState);
    const suppressStaleOff = this.isRemoteControlStartPending() && this.isBenignRemoteControlOff(nextState);
    if (!suppressStaleOff) {
      this.lastRemoteControlState = nextState;
    }
    const surface = this.deriveRemoteRuntimeSurface(this.lastRemoteControlState);
    this.renderStateChip(this.previewRcState, 'dash-preview-rc-state', surface.chipLabel, surface.chipTone);
    if (this.previewRcBtn) {
      (this.previewRcBtn as HTMLButtonElement).disabled = !this.canClickRemoteControlToggle();
    }
    if (options.skipToggleSync) return surface;
    if (this.lastRemoteControlState.enabled && this.lastRemoteControlState.attached && this.lastRemoteControlState.reason === 'ready') {
      this.completeRemoteControlRequest();
      if (!this.remoteControlOn) {
        this.setRemoteControl(true, { silent: true, source: 'remote-state' });
      }
    } else if (surface.shouldForceDisable && this.remoteControlOn && !suppressStaleOff) {
      this.completeRemoteControlRequest();
      this.setRemoteControl(false, { silent: true, source: 'remote-state' });
    }
    return surface;
  }

  // ==================== METRICS (Phase 223 MET-06/07) ====================

  private renderMetrics(payload: MetricsPayload) {
    if (!payload || typeof payload !== 'object') {
      this.clearMetrics();
      return;
    }

    const sessions = payload.sessions || {};
    const cost = payload.cost || {};
    const usage = payload.usage || {};

    const totalTokens = typeof usage.totalTokens === 'number'
      ? usage.totalTokens
      : (typeof cost.totalTokens === 'number' ? cost.totalTokens : 0);
    const totalCost = typeof usage.totalCost === 'number'
      ? usage.totalCost
      : (typeof cost.totalCost === 'number' ? cost.totalCost : 0);
    const totalRequests = typeof usage.totalRequests === 'number'
      ? usage.totalRequests
      : ((typeof sessions.completedTasks === 'number' ? sessions.completedTasks : 0) +
        (typeof sessions.errorCount === 'number' ? Math.max(0, sessions.errorCount) : 0));
    const completedTasks = typeof sessions.completedTasks === 'number' ? sessions.completedTasks : 0;
    const errorCount = typeof sessions.errorCount === 'number' ? Math.max(0, sessions.errorCount) : 0;
    const totalAttempts = totalRequests > 0 ? totalRequests : completedTasks + errorCount;
    const successRate = typeof usage.successRate === 'number'
      ? usage.successRate
      : (totalAttempts > 0 ? (completedTasks / totalAttempts) * 100 : 0);

    const enabledEl = document.getElementById('stat-enabled');
    const runsEl = document.getElementById('stat-runs-today');
    const rateEl = document.getElementById('stat-success-rate');
    const costEl = document.getElementById('stat-total-cost');
    const remoteEl = document.getElementById('stat-cost-saved');

    if (enabledEl) enabledEl.textContent = this.formatStatNumber(totalTokens);
    if (runsEl) runsEl.textContent = this.formatStatNumber(totalRequests);
    if (rateEl) rateEl.textContent = Math.round(successRate) + '%';
    if (costEl) costEl.textContent = '$' + totalCost.toFixed(2);
    if (remoteEl) remoteEl.textContent = this.remoteControlOn
      ? this.dashboardCopy.remoteOn
      : (payload.connection?.connected ? this.dashboardCopy.connected : this.dashboardCopy.offline);
  }

  private clearMetrics(): void {
    const enabledEl = document.getElementById('stat-enabled');
    const runsEl = document.getElementById('stat-runs-today');
    const rateEl = document.getElementById('stat-success-rate');
    const costEl = document.getElementById('stat-total-cost');
    const remoteEl = document.getElementById('stat-cost-saved');

    if (enabledEl) enabledEl.textContent = '0';
    if (runsEl) runsEl.textContent = '0';
    if (rateEl) rateEl.textContent = '0%';
    if (costEl) costEl.textContent = '$0.00';
    if (remoteEl) remoteEl.textContent = this.dashboardCopy.offline;
  }

  // ==================== REMOTE CONTROL HELPERS ====================

  private formatStatNumber(value: number): string {
    const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
    return Math.round(safe).toLocaleString(this.localeId);
  }

  private getRemoteViewportSize(): { width: number; height: number } {
    return {
      width: Math.max(1, this.previewSnapshotData?.viewportWidth || this.previewSnapshotData?.pageWidth || 1),
      height: Math.max(1, this.previewSnapshotData?.viewportHeight || 1),
    };
  }

  private clampRemotePreviewPoint(localX: number, localY: number): { x: number; y: number } {
    if (this.previewViewer && typeof this.previewViewer.mapPointToViewport === 'function') {
      const mapped = this.previewViewer.mapPointToViewport({ x: localX, y: localY });
      if (mapped && mapped.inside && typeof mapped.x === 'number' && typeof mapped.y === 'number') {
        return { x: mapped.x, y: mapped.y };
      }
    }
    const viewport = this.getRemoteViewportSize();
    const scale = this.previewScale > 0 ? this.previewScale : 1;
    const x = Math.round(localX / scale);
    const y = Math.round(localY / scale);
    return {
      x: Math.max(0, Math.min(viewport.width - 1, x)),
      y: Math.max(0, Math.min(viewport.height - 1, y)),
    };
  }

  private getRemoteModifiers(event: MouseEvent | KeyboardEvent): number {
    let modifiers = 0;
    if (event.altKey) modifiers |= 1;
    if (event.ctrlKey) modifiers |= 2;
    if (event.metaKey) modifiers |= 4;
    if (event.shiftKey) modifiers |= 8;
    return modifiers;
  }

  private shouldInsertRemoteText(event: KeyboardEvent): boolean {
    if (!event || event.isComposing) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    return !!event.key && event.key.length === 1;
  }

  private setRemoteControlCaptureActive(active: boolean): void {
    this.remoteControlCaptureActive = active;
    if (!this.remoteOverlay) return;
    if (this.remoteControlCaptureActive) {
      this.remoteOverlay.classList.add('capturing');
    } else {
      this.remoteOverlay.classList.remove('capturing');
    }
  }

  // ==================== TASK CONTROL ====================

  private submitTask(text: string): void {
    if (this.taskState === 'running') return;
    if (!text) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.taskAction) { this.taskAction.textContent = this.dashboardCopy.notConnected; this.taskAction.style.display = 'block'; }
      return;
    }
    if (!this.extensionOnline) {
      if (this.taskAction) { this.taskAction.textContent = this.dashboardCopy.extensionOffline; this.taskAction.style.display = 'block'; }
      return;
    }

    this.taskText = text;
    this.taskStartTime = Date.now();
    this.activeTaskRunId = '';
    this.lastCompletedTaskRunId = '';
    this.lastTaskStateUpdatedAt = this.taskStartTime;
    this.lastProgressAction = '';
    this.setTaskRecoveryPending(false, 'task-submit');

    this.ws.send(JSON.stringify({
      type: 'dash:task-submit',
      payload: { task: text },
      ts: Date.now(),
    }));

    this.setTaskState('running', { task: text });
  }

  private setTaskState(newState: TaskState, data?: any): void {
    this.taskState = newState;
    data = data || {};

    if (this.taskTimeoutTimer) { clearTimeout(this.taskTimeoutTimer); this.taskTimeoutTimer = null; }
    if (newState !== 'running') {
      this.taskRecoveryPending = false;
      this.taskRecoveryStartedAt = 0;
      this.taskRecoverySource = '';
      this.clearTaskRecoveryTimer();
    }
    if (newState !== 'running' && this.taskStopBtn) this.taskStopBtn.style.display = 'none';
    if (this.taskElapsedTimer) { clearInterval(this.taskElapsedTimer); this.taskElapsedTimer = null; }

    // Hide all sub-views
    if (this.taskInputRow) this.taskInputRow.style.display = 'none';
    if (this.taskProgressView) this.taskProgressView.style.display = 'none';
    if (this.taskSuccessView) this.taskSuccessView.style.display = 'none';
    if (this.taskFailedView) this.taskFailedView.style.display = 'none';
    // Clear action feed on state transition (Phase 189)
    if (this.actionFeed && newState !== 'running') { this.actionFeed.innerHTML = ''; }

    switch (newState) {
      case 'idle':
        this.activeTaskRunId = '';
        this.lastCompletedTaskRunId = '';
        this.lastTaskStateUpdatedAt = 0;
        if (this.taskInputRow) this.taskInputRow.style.display = 'flex';
        if (this.taskInput) { this.taskInput.value = ''; this.taskInput.disabled = false; }
        if (this.taskSubmitBtn) (this.taskSubmitBtn as HTMLButtonElement).disabled = false;
        if (this.taskBarFill) { this.taskBarFill.style.width = '0%'; this.taskBarFill.className = 'dash-task-bar-fill'; }
        // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
        // this.hideSaveAsAgent();
        if (this.previewContainer) this.previewContainer.classList.remove('dash-preview-automating');
        this.renderTaskRecoveryStatus('', '');
        break;

      case 'running':
        if (this.taskProgressView) this.taskProgressView.style.display = 'block';
        if (this.taskTitle) this.taskTitle.textContent = data.task || this.taskText || '';
        if (this.taskBarFill) { this.taskBarFill.style.width = '0%'; this.taskBarFill.className = 'dash-task-bar-fill'; }
        if (this.taskPercent) this.taskPercent.textContent = '0%';
        if (this.taskPhase) this.taskPhase.textContent = '';
        if (this.taskEta) this.taskEta.textContent = '';
        if (this.taskElapsed) this.taskElapsed.textContent = this.formatRunningFor(0);
        if (this.taskAction) { this.taskAction.textContent = this.dashboardCopy.taskWorkingAction; this.taskAction.style.display = ''; }
        if (this.taskStopBtn) this.taskStopBtn.style.display = '';
        this.taskElapsedTimer = setInterval(() => {
          if (this.taskElapsed && this.taskStartTime) {
            this.taskElapsed.textContent = this.formatRunningFor(Date.now() - this.taskStartTime);
          }
        }, 1000);
        if (this.taskTimeoutTimer) clearTimeout(this.taskTimeoutTimer);
        this.taskTimeoutTimer = setTimeout(() => {
          if (this.taskState === 'running') {
            this.setTaskState('failed', { error: this.dashboardCopy.taskTimedOutTenMinutes });
          }
        }, this.TASK_TIMEOUT_MS);
        this.disableAllTaskInputs(true);
        // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
        // this.hideSaveAsAgent();
        if (this.previewContainer) this.previewContainer.classList.add('dash-preview-automating');
        this.renderTaskRecoveryStatus(this.activeTaskRunId || '', this.taskRecoverySource);
        break;

      case 'success':
        if (this.taskProgressView) this.taskProgressView.style.display = 'block';
        if (this.taskSuccessView) this.taskSuccessView.style.display = 'block';
        if (this.taskBarFill) { this.taskBarFill.style.width = '100%'; this.taskBarFill.className = 'dash-task-bar-fill dash-task-bar-success'; }
        if (this.taskPercent) this.taskPercent.textContent = '100%';
        if (this.taskPhase) this.taskPhase.textContent = '';
        if (this.taskEta) this.taskEta.textContent = '';
        if (this.taskElapsed) this.taskElapsed.textContent = '';
        if (this.taskAction) this.taskAction.style.display = 'none';
        {
          const elapsed = data.elapsed || (Date.now() - this.taskStartTime);
          data.elapsed = elapsed;
          this.renderResultCard(this.taskSuccessView, data, true);
        }
        this.disableAllTaskInputs(false);
        if (this.taskInputNext) this.taskInputNext.value = '';
        // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
        // this.showSaveAsAgent();
        if (this.previewContainer) this.previewContainer.classList.remove('dash-preview-automating');
        this.renderTaskRecoveryStatus('', '');
        break;

      case 'failed':
        if (this.taskProgressView) this.taskProgressView.style.display = 'block';
        if (this.taskFailedView) this.taskFailedView.style.display = 'block';
        if (this.taskBarFill) this.taskBarFill.className = 'dash-task-bar-fill dash-task-bar-failed';
        if (this.taskPhase) this.taskPhase.textContent = '';
        if (this.taskEta) this.taskEta.textContent = '';
        if (this.taskElapsed) this.taskElapsed.textContent = '';
        if (this.taskAction) this.taskAction.style.display = 'none';
        {
          const failedElapsed = data.elapsed || (this.taskStartTime ? Date.now() - this.taskStartTime : 0);
          data.elapsed = failedElapsed;
          this.renderResultCard(this.taskFailedView, data, false);
        }
        this.disableAllTaskInputs(false);
        if (this.taskInputRetry) this.taskInputRetry.value = '';
        if (this.taskSubmitRetry) (this.taskSubmitRetry as HTMLButtonElement).disabled = true;
        if (this.previewContainer) this.previewContainer.classList.remove('dash-preview-automating');
        this.renderTaskRecoveryStatus('', '');
        break;
    }
  }

  private updateTaskProgress(payload: any): void {
    const payloadUpdatedAt = this.getTaskPayloadUpdatedAt(payload);
    if (payloadUpdatedAt && this.lastTaskStateUpdatedAt && payloadUpdatedAt < this.lastTaskStateUpdatedAt) return;
    if (!this.acceptRunningTaskPayload(payload)) return;
    if (payloadUpdatedAt) this.lastTaskStateUpdatedAt = payloadUpdatedAt;
    this.rememberActiveTaskRun(this.getTaskRunId(payload));
    this.maybeClearTaskRecoveryFromPayload(payload);
    if (this.taskState !== 'running') return;

    const progress = payload.progress || 0;
    if (this.taskBarFill) {
      const width = progress > 0 ? Math.max(2, progress) : 0;
      this.taskBarFill.style.width = width + '%';
    }
    if (this.taskPercent) this.taskPercent.textContent = Math.round(progress) + '%';

    if (this.taskPhase && payload.phase) {
      this.taskPhase.textContent = this.translateTaskPhase(payload.phase);
    }
    if (this.taskEta && payload.eta) {
      this.taskEta.textContent = this.formatTaskEta(payload.eta);
    }
    if (this.taskElapsed && payload.elapsed) {
      this.taskElapsed.textContent = this.formatRunningFor(payload.elapsed);
    }
    const actionText = payload.action ? this.translateTaskAction(payload.action) : '';
    if (this.taskAction && actionText) {
      this.taskAction.style.display = '';
      this.taskAction.textContent = actionText;
      this.lastProgressAction = actionText;
    }
    // Action feed: append timestamped entry (Phase 189)
    if (this.actionFeed && actionText) {
      const entry = document.createElement('div');
      entry.className = 'dash-action-feed-entry';
      const ts = document.createElement('span');
      ts.className = 'dash-action-feed-ts';
      const now = new Date();
      ts.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
      const txt = document.createElement('span');
      txt.className = 'dash-action-feed-text';
      txt.textContent = actionText;
      entry.appendChild(ts);
      entry.appendChild(txt);
      this.actionFeed.appendChild(entry);
      while (this.actionFeed.children.length > this.ACTION_FEED_MAX) {
        this.actionFeed.removeChild(this.actionFeed.firstChild!);
      }
      this.actionFeed.scrollTop = this.actionFeed.scrollHeight;
    }
    this.renderTaskRecoveryStatus(this.getTaskRunId(payload), payload.taskSource || '');
  }

  private handleTaskComplete(payload: any): void {
    if (!this.acceptTerminalTaskPayload(payload)) return;
    const payloadUpdatedAt = this.getTaskPayloadUpdatedAt(payload);
    if (payloadUpdatedAt && this.lastTaskStateUpdatedAt && payloadUpdatedAt < this.lastTaskStateUpdatedAt) return;
    if (payloadUpdatedAt) this.lastTaskStateUpdatedAt = payloadUpdatedAt;

    if (this.taskState === 'idle' && !payload.success) {
      if (this.taskAction) {
        this.taskAction.style.display = '';
        this.taskAction.textContent = this.translateTaskError(
          payload.errorCode,
          payload.error,
          this.dashboardCopy.taskCouldNotStart,
        );
        setTimeout(() => {
          if (this.taskState === 'idle' && this.taskAction) this.taskAction.style.display = 'none';
        }, 5000);
      }
      return;
    }

    if (this.taskStopBtn) (this.taskStopBtn as HTMLButtonElement).disabled = false;
    this.maybeClearTaskRecoveryFromPayload(payload);
    this.markTaskRunCompleted(this.getTaskRunId(payload));

    // Freeze preview on final page state (Phase 190: STRM-01/STRM-04)
    if (this.previewState === 'streaming' || this.previewState === 'frozen-disconnect') {
      this.setPreviewState('frozen-complete');
    }

    const resultData = {
      summary: payload.summary || '',
      elapsed: payload.elapsed || 0,
      actionCount: payload.actionCount || 0,
      totalCost: payload.totalCost || 0,
      finalUrl: payload.finalUrl || '',
      pageTitle: payload.pageTitle || '',
      taskStatus: payload.taskStatus || '',
      error: '',
    };

    if (payload.success) {
      this.setTaskState('success', resultData);
    } else if (payload.stopped) {
      const actionContext = payload.lastAction || this.lastProgressAction;
      resultData.error = this.formatStoppedTask(actionContext);
      resultData.taskStatus = resultData.taskStatus || 'stopped';
      this.setTaskState('failed', resultData);
    } else {
      resultData.error = this.translateTaskError(
        payload.errorCode,
        payload.error,
        this.dashboardCopy.taskCouldNotComplete,
      );
      resultData.taskStatus = resultData.taskStatus || 'failed';
      this.setTaskState('failed', resultData);
    }
    this.lastProgressAction = '';
  }

  private applyRecoveredTaskState(snapshot: any): void {
    if (!snapshot) return;
    const recoveredStatus = snapshot.taskStatus || (snapshot.taskRunning ? 'running' : 'idle');
    const recoveredUpdatedAt = this.getTaskPayloadUpdatedAt(snapshot);
    if (recoveredUpdatedAt && this.lastTaskStateUpdatedAt && recoveredUpdatedAt < this.lastTaskStateUpdatedAt) return;
    if (recoveredStatus === 'running' && !this.acceptRunningTaskPayload(snapshot)) return;
    if (recoveredStatus !== 'running' && recoveredStatus !== 'idle' && !this.acceptTerminalTaskPayload(snapshot)) return;
    if (recoveredUpdatedAt) this.lastTaskStateUpdatedAt = recoveredUpdatedAt;
    this.maybeClearTaskRecoveryFromPayload(snapshot);

    if (snapshot.task) this.taskText = snapshot.task;

    if (recoveredStatus === 'running') {
      this.rememberActiveTaskRun(this.getTaskRunId(snapshot));
      this.taskStartTime = Date.now() - (snapshot.elapsed || 0);
      this.setTaskState('running', { task: snapshot.task || this.taskText || '' });
      this.updateTaskProgress({
        progress: snapshot.progress || 0,
        phase: snapshot.phase || '',
        eta: snapshot.eta || null,
        elapsed: snapshot.elapsed || 0,
        action: snapshot.action || snapshot.lastAction || this.dashboardCopy.taskReconnected,
        updatedAt: recoveredUpdatedAt || Date.now(),
      });
      return;
    }

    if (recoveredStatus === 'success') {
      this.markTaskRunCompleted(this.getTaskRunId(snapshot));
      this.setTaskState('success', { summary: snapshot.summary || '', elapsed: snapshot.elapsed || 0 });
      return;
    }

    if (recoveredStatus === 'stopped') {
      this.markTaskRunCompleted(this.getTaskRunId(snapshot));
      const stoppedAction = snapshot.lastAction || snapshot.action || this.lastProgressAction;
      this.setTaskState('failed', { error: this.formatStoppedTask(stoppedAction), elapsed: snapshot.elapsed || 0 });
      return;
    }

    if (recoveredStatus === 'failed') {
      this.markTaskRunCompleted(this.getTaskRunId(snapshot));
      this.setTaskState('failed', {
        error: this.translateTaskError(
          snapshot.errorCode,
          snapshot.error,
          this.dashboardCopy.taskCouldNotComplete,
        ),
        elapsed: snapshot.elapsed || 0,
      });
    }
  }

  private disableAllTaskInputs(disabled: boolean): void {
    const inputs = [this.taskInput, this.taskInputNext, this.taskInputRetry];
    const btns = [this.taskSubmitBtn, this.taskSubmitNext, this.taskSubmitRetry];
    inputs.forEach(el => { if (el) el.disabled = disabled; });
    btns.forEach(el => { if (el) (el as HTMLButtonElement).disabled = disabled; });
  }

  private showTaskArea(): void {
    if (this.taskArea) this.taskArea.style.display = 'block';
    if (this.taskState === 'idle') this.setTaskState('idle');
  }

  private hideTaskArea(): void {
    if (this.taskArea) this.taskArea.style.display = 'none';
  }

  private updateTaskOfflineState(): void {
    if (!this.taskArea) return;
    if (!this.extensionOnline) {
      this.taskArea.classList.add('dash-task-offline');
      if (this.taskState === 'idle' && this.taskInput) {
        this.taskInput.placeholder = this.dashboardCopy.extensionOfflinePlaceholder;
      }
      if (this.taskState === 'running') {
        this.setTaskRecoveryPending(true, (!this.ws || this.ws.readyState !== WebSocket.OPEN) ? 'ws-disconnected' : 'extension-offline');
      }
      if (this.wakeBtn && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.wakeBtn.style.display = 'inline-flex';
      }
    } else {
      this.taskArea.classList.remove('dash-task-offline');
      if (this.taskState === 'idle' && this.taskInput) {
        this.taskInput.placeholder = this.dashboardCopy.taskPlaceholder;
        this.taskInput.disabled = false;
      }
      if (this.wakeBtn) this.wakeBtn.style.display = 'none';
    }
    this.renderTaskRecoveryStatus(this.activeTaskRunId || '', this.taskRecoverySource);
  }

  // ==================== AUTH ====================

  private connect(key: string): void {
    this.clearLoginError();
    if (this.connectBtn) {
      this.connectBtn.innerHTML = '<span class="dash-spinner"></span> ' + this.escapeHtml(this.dashboardCopy.connecting);
      (this.connectBtn as HTMLButtonElement).disabled = true;
    }

    this.validateKey(key).then(result => {
      if (this.connectBtn) {
        this.connectBtn.innerHTML = '<i class="fa-solid fa-plug"></i> ' + this.escapeHtml(this.dashboardCopy.connectWithKey);
        (this.connectBtn as HTMLButtonElement).disabled = false;
      }
      if (result.valid) {
        this.hashKey = key;
        localStorage.setItem(this.STORAGE_KEY, key);
        this.clearSessionStorage();
        this.showDashboard();
        // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
        // this.loadData();
        this.connectWS();
        // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
        // this.startPolling();
      } else {
        this.showLoginError(this.dashboardCopy.invalidHashKey);
      }
    }).catch(() => {
      if (this.connectBtn) {
        this.connectBtn.innerHTML = '<i class="fa-solid fa-plug"></i> ' + this.escapeHtml(this.dashboardCopy.connectWithKey);
        (this.connectBtn as HTMLButtonElement).disabled = false;
      }
      this.showLoginError(this.dashboardCopy.cannotConnect);
    });
  }

  private validateAndConnect(key: string): void {
    this.validateKey(key).then(result => {
      if (result.valid) {
        this.showDashboard();
        // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
        // this.loadData();
        this.connectWS();
        // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
        // this.startPolling();
      } else {
        localStorage.removeItem(this.STORAGE_KEY);
        this.hashKey = '';
      }
    }).catch(() => {
      this.showDashboard();
      // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
      // this.loadData();
      // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
      // this.startPolling();
    });
  }

  private disconnect(): void {
    if (this.sessionToken) {
      this.apiFetch('/api/pair/revoke', {
        method: 'POST',
        headers: { 'X-FSB-Session-Token': this.sessionToken },
      }).catch(() => {});
    }
    this.hashKey = '';
    localStorage.removeItem(this.STORAGE_KEY);
    this.clearSessionStorage();
    // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
    // this.agents = [];
    // this.stats = {};
    // this.selectedAgentId = null;
    // this.stopPolling();
    this.disconnectWS();
    this.stopQRScanner();
    this.showLogin();
  }

  private validateKey(key: string): Promise<any> {
    return this.apiFetch('/api/auth/validate', { headers: { 'X-FSB-Hash-Key': key } });
  }

  // ==================== SESSION MANAGEMENT ====================

  private validateSession(): void {
    this.apiFetch('/api/pair/validate', {
      headers: { 'X-FSB-Session-Token': this.sessionToken },
    }).then(result => {
      if (result.valid) {
        this.hashKey = result.hashKey;
        localStorage.setItem(this.STORAGE_KEY, this.hashKey);
        this.showDashboard();
        // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
        // this.loadData();
        this.connectWS();
        // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
        // this.startPolling();
      } else {
        this.clearSessionStorage();
        if (result.reason === 'expired') {
          this.showExpiredLogin();
        } else {
          this.showLogin();
        }
      }
    }).catch(() => {
      if (this.hashKey) {
        this.showDashboard();
        // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
        // this.loadData();
        this.connectWS();
        // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
        // this.startPolling();
      }
    });
  }

  private storeSession(newHashKey: string, newSessionToken: string, newExpiresAt: string): void {
    this.hashKey = newHashKey;
    this.sessionToken = newSessionToken;
    this.sessionExpiresAt = newExpiresAt;
    localStorage.setItem(this.STORAGE_KEY, this.hashKey);
    localStorage.setItem(this.SESSION_KEY, this.sessionToken);
    localStorage.setItem(this.SESSION_EXPIRES_KEY, this.sessionExpiresAt);
  }

  private clearSessionStorage(): void {
    this.sessionToken = '';
    this.sessionExpiresAt = '';
    localStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.SESSION_EXPIRES_KEY);
  }

  private showExpiredLogin(): void {
    this.showLogin();
    if (this.loginMessage) {
      this.loginMessage.textContent = this.dashboardCopy.sessionExpired;
      this.loginMessage.className = 'dash-login-message expired';
      this.loginMessage.style.display = 'block';
    }
  }

  // ==================== UI TOGGLE ====================

  private showDashboard(): void {
    if (this.loginSection) {
      this.loginSection.classList.add('fade-out');
      setTimeout(() => {
        if (this.loginSection) {
          this.loginSection.style.display = 'none';
          this.loginSection.classList.remove('fade-out');
        }
        if (this.contentSection) {
          this.contentSection.style.display = 'block';
          this.contentSection.classList.add('fade-in');
        }
        this.showTaskArea();
      }, 400);
    }
    this.stopQRScanner();
    if (this.pairedBadge) this.pairedBadge.style.display = 'inline-flex';
    if (this.loginMessage) this.loginMessage.style.display = 'none';
  }

  private showLogin(): void {
    if (this.contentSection) {
      this.contentSection.style.display = 'none';
      this.contentSection.classList.remove('fade-in', 'fade-dim');
    }
    if (this.loginSection) {
      this.loginSection.style.display = '';
      this.loginSection.classList.remove('fade-out');
    }
    this.hideTaskArea();
    if (this.keyInput) this.keyInput.value = '';
    if (this.pairedBadge) this.pairedBadge.style.display = 'none';
    if (this.tabScan && this.tabPaste && this.tabScanContent && this.tabPasteContent) {
      this.tabScan.classList.add('active');
      this.tabPaste.classList.remove('active');
      this.tabScanContent.style.display = 'block';
      this.tabPasteContent.style.display = 'none';
    }
  }

  private showLoginError(msg: string): void {
    this.clearLoginError();
    const el = document.createElement('p');
    el.className = 'dash-login-error';
    el.textContent = msg;
    el.id = 'dash-error';
    const form = this.host.nativeElement.querySelector('.dash-login-form');
    if (form) form.parentNode?.insertBefore(el, form.nextSibling);
  }

  private clearLoginError(): void {
    const existing = this.host.nativeElement.querySelector('#dash-error');
    if (existing) existing.remove();
  }

  // ==================== TAB SWITCHING ====================

  private switchTab(tab: 'scan' | 'paste'): void {
    if (tab === 'scan') {
      this.tabScan?.classList.add('active');
      this.tabPaste?.classList.remove('active');
      if (this.tabScanContent) this.tabScanContent.style.display = 'block';
      if (this.tabPasteContent) this.tabPasteContent.style.display = 'none';
      this.startQRScanner();
    } else {
      this.tabPaste?.classList.add('active');
      this.tabScan?.classList.remove('active');
      if (this.tabPasteContent) this.tabPasteContent.style.display = 'block';
      if (this.tabScanContent) this.tabScanContent.style.display = 'none';
      this.stopQRScanner();
    }
    if (this.scanError) this.scanError.style.display = 'none';
    this.clearLoginError();
  }

  // ==================== QR SCANNER ====================

  private startQRScanner(): void {
    if (this.qrScanner) return;
    if (typeof Html5Qrcode === 'undefined') {
      this.showScanError(this.dashboardCopy.qrScannerUnavailable);
      this.switchTab('paste');
      return;
    }

    this.qrScanner = new Html5Qrcode('qr-reader');
    this.qrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText: string) => {
        this.qrScanner.stop().then(() => {
          this.qrScanner = null;
          this.handleScannedQR(decodedText);
        }).catch(() => {
          this.qrScanner = null;
          this.handleScannedQR(decodedText);
        });
      },
      () => { /* Ignore per-frame decode failures */ }
    ).catch((err: any) => {
      this.qrScanner = null;
      this.showScanError(this.dashboardCopy.cameraUnavailable);
      this.switchTab('paste');
    });
  }

  private stopQRScanner(): void {
    if (this.qrScanner) {
      const scanner = this.qrScanner;
      this.qrScanner = null;
      try {
        scanner.stop().catch(() => {});
      } catch (_) {}
    }
  }

  private handleScannedQR(decodedText: string): void {
    try {
      const data = JSON.parse(decodedText);
      if (!data.t) throw new Error(this.dashboardCopy.qrMissingToken);

      if (this.tabScanContent) {
        this.tabScanContent.innerHTML = '<p class="dash-scan-instruction">' + this.escapeHtml(this.dashboardCopy.connecting) + '</p>';
      }

      let exchangeUrl = (data.s || '') + '/api/pair/exchange';
      if (data.s && data.s === location.origin) exchangeUrl = '/api/pair/exchange';
      if (!data.s) exchangeUrl = '/api/pair/exchange';

      fetch(exchangeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.t }),
      }).then(resp => {
        if (!resp.ok) {
          return resp.json().catch(() => ({})).then(body => {
            const exchangeError = new Error('pairing-exchange-rejected') as Error & {
              localizedMessage?: string;
            };
            exchangeError.localizedMessage = this.pairingErrorMessage(body?.code);
            throw exchangeError;
          });
        }
        return resp.json();
      }).then(result => {
        this.storeSession(result.hashKey, result.sessionToken, result.expiresAt);
        this.showDashboard();
        // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
        // this.loadData();
        this.connectWS();
        // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
        // this.startPolling();
      }).catch((err: Error & { localizedMessage?: string }) => {
        this.showScanError(err?.localizedMessage || this.dashboardCopy.scanFailed);
        if (this.tabScanContent) {
          this.tabScanContent.innerHTML =
            '<p class="dash-scan-instruction">' + this.escapeHtml(this.dashboardCopy.pointCamera) + '</p>' +
            '<div id="qr-reader" class="dash-qr-reader" aria-label="' + this.escapeAttr(this.dashboardCopy.qrViewfinder) + '"></div>' +
            '<p id="dash-scan-error" class="dash-scan-error" style="display: none;"></p>';
        }
        this.switchTab('paste');
      });
    } catch (err) {
      this.showScanError(this.dashboardCopy.scanFailed);
      this.switchTab('paste');
    }
  }

  private showScanError(msg: string): void {
    const el = this.host.nativeElement.querySelector('#dash-scan-error');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
    }
  }
//
  // ==================== DATA LOADING ====================
//
  // private loadData(): void {
    // this.fetchStats();
    // this.fetchAgents();
  // }
//
  // private fetchStats(): void {
    // this.apiFetch('/api/stats', { headers: { 'X-FSB-Hash-Key': this.hashKey } })
      // .then(data => { this.stats = data; this.renderStats(); })
      // .catch(() => {});
  // }
//
  // private fetchAgents(): void {
    // this.apiFetch('/api/agents', { headers: { 'X-FSB-Hash-Key': this.hashKey } })
      // .then(data => { this.agents = data.agents || []; this.renderAgents(); })
      // .catch(() => {});
  // }
//
  // private fetchRuns(agentId: string, limit: number, offset: number): Promise<any> {
    // const url = '/api/agents/' + encodeURIComponent(agentId) + '/runs?limit=' + limit + '&offset=' + offset;
    // return this.apiFetch(url, { headers: { 'X-FSB-Hash-Key': this.hashKey } });
  // }
//
  // ==================== RENDERING ====================
//
  // private renderStats(): void {
    // this.setTextById('stat-agents', String(this.stats.totalAgents || 0));
    // this.setTextById('stat-enabled', String(this.stats.enabledAgents || 0));
    // this.setTextById('stat-runs-today', String(this.stats.runsToday || 0));
    // this.setTextById('stat-success-rate', (this.stats.successRate || 0) + '%');
    // this.setTextById('stat-total-cost', '$' + (this.stats.totalCost || 0).toFixed(2));
    // this.setTextById('stat-cost-saved', '$' + (this.stats.totalCostSaved || 0).toFixed(2));
    // const countText = (this.stats.totalAgents || 0) + ' agent' + ((this.stats.totalAgents || 0) !== 1 ? 's' : '');
    // if (this.agentCountEl) this.agentCountEl.textContent = countText + (this.extensionOnline ? '' : ' - extension offline');
  // }
//
  // private renderAgents(): void {
    // if (!this.agentGrid) return;
    // this.agentGrid.innerHTML = '';
//
    // if (this.agents.length === 0) {
      // if (this.emptyState) this.emptyState.style.display = 'block';
      // this.agentGrid.style.display = 'none';
      // return;
    // }
//
    // if (this.emptyState) this.emptyState.style.display = 'none';
    // this.agentGrid.style.display = '';
//
    // this.agents.forEach(agent => {
      // const card = document.createElement('div');
      // const isEnabled = agent.enabled === true || agent.enabled === 1;
      // const isSelected = this.detailAgentId === agent.agent_id;
      // card.className = 'dash-agent-card' + (isSelected ? ' selected' : '') + (!isEnabled ? ' dash-agent-disabled' : '');
      // card.setAttribute('data-agent-id', agent.agent_id);
      // card.setAttribute('role', 'button');
      // card.setAttribute('aria-expanded', isSelected ? 'true' : 'false');
//
      // const scheduleLabel = this.formatScheduleLabel(agent.schedule_type, agent.schedule_config);
      // const successCount = agent.successful_runs || 0;
      // const totalRuns = agent.total_runs || 0;
      // const successRateText = totalRuns > 0 ? successCount + '/' + totalRuns : '0/0';
      // const successPercent = totalRuns > 0 ? (successCount / totalRuns) * 100 : 100;
      // const rateColor = successPercent > 80 ? '#22c55e' : successPercent >= 50 ? '#eab308' : '#ef4444';
      // const costSaved = agent.cost_saved || 0;
      // const costText = '$' + costSaved.toFixed(2);
      // const lastRunText = agent.last_run_at ? this.formatTimeAgo(agent.last_run_at) : 'Never';
      // const runningIcon = this.agentRunningId === agent.agent_id ? ' <span class="dash-spinner dash-agent-running-icon"></span>' : '';
//
      // card.innerHTML =
        // '<div class="dash-agent-card-header">' +
          // '<div class="dash-agent-name">' +
            // '<span class="dash-status-dot ' + (isEnabled ? 'dash-status-enabled' : 'dash-status-disabled') + '"></span>' +
            // this.escapeHtml(agent.name) + runningIcon +
          // '</div>' +
          // '<button class="dash-toggle" role="switch" aria-checked="' + isEnabled + '" aria-label="Enable ' + this.escapeAttr(agent.name) + '" data-agent-id="' + this.escapeAttr(agent.agent_id) + '"></button>' +
        // '</div>' +
        // '<div class="dash-agent-task">' + this.escapeHtml(agent.task) + '</div>' +
        // '<div class="dash-agent-url">' + this.escapeHtml(agent.target_url || '') + '</div>' +
        // '<div class="dash-agent-meta">' +
          // '<span class="dash-agent-schedule">' + this.escapeHtml(scheduleLabel) + '</span>' +
          // '<span class="dash-agent-last-run">' + this.escapeHtml(lastRunText) + '</span>' +
        // '</div>' +
        // '<div class="dash-agent-card-stats">' +
          // '<span class="dash-agent-success-rate" style="color: ' + rateColor + '">' + successRateText + '</span>' +
          // '<span class="dash-agent-cost-saved">' + costText + '</span>' +
        // '</div>';
//
      // card.addEventListener('click', (e: Event) => {
        // if ((e.target as HTMLElement).closest('.dash-toggle')) return;
        // this.openDetailPanel(agent.agent_id);
      // });
//
      // const toggle = card.querySelector('.dash-toggle');
      // if (toggle) {
        // toggle.addEventListener('click', (e: Event) => {
          // e.stopPropagation();
          // this.toggleAgent(agent.agent_id, !isEnabled);
        // });
      // }
//
      // this.agentGrid!.appendChild(card);
    // });
  // }
//
  // ==================== TOGGLE AGENT ====================
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
//
  // private toggleAgent(agentId: string, enabled: boolean): void {
    // this.agents = this.agents.map(a => {
      // if (a.agent_id === agentId) a.enabled = enabled ? 1 : 0;
      // return a;
    // });
    // this.renderAgents();
//
    // this.apiFetch('/api/agents/' + encodeURIComponent(agentId), {
      // method: 'PATCH',
      // headers: { 'Content-Type': 'application/json', 'X-FSB-Hash-Key': this.hashKey },
      // body: JSON.stringify({ enabled }),
    // }).catch(() => {
      // this.agents = this.agents.map(a => {
        // if (a.agent_id === agentId) a.enabled = enabled ? 0 : 1;
        // return a;
      // });
      // this.renderAgents();
    // });
  // }
//
  // ==================== DETAIL PANEL ====================
//
  // private openDetailPanel(agentId: string): void {
    // const agent = this.agents.find(a => a.agent_id === agentId);
    // if (!agent) return;
//
    // this.detailAgentId = agentId;
    // this.selectedAgentId = agentId;
    // this.detailRunsOffset = 0;
//
    // const cards = this.agentGrid?.querySelectorAll('.dash-agent-card');
    // cards?.forEach(c => {
      // const isThis = c.getAttribute('data-agent-id') === agentId;
      // c.classList.toggle('selected', isThis);
      // c.setAttribute('aria-expanded', isThis ? 'true' : 'false');
    // });
//
    // if (this.detailName) this.detailName.textContent = agent.name;
    // if (this.detailTask) this.detailTask.textContent = agent.task;
    // if (this.detailUrl) this.detailUrl.textContent = agent.target_url || '';
    // if (this.detailSchedule) this.detailSchedule.textContent = this.formatScheduleLabel(agent.schedule_type, agent.schedule_config);
//
    // if (this.detailPanel) this.detailPanel.style.display = 'block';
    // if (this.agentContainer) this.agentContainer.classList.add('dash-detail-open');
//
    // this.loadAgentStats(agentId);
    // this.loadDetailRuns(agentId, 0);
    // this.loadRecordedScript(agent);
//
    // if (this.detailRunProgress) this.detailRunProgress.style.display = 'none';
  // }
//
  // private closeDetailPanel(): void {
    // this.detailAgentId = null;
    // this.selectedAgentId = null;
    // if (this.detailPanel) this.detailPanel.style.display = 'none';
    // if (this.agentContainer) this.agentContainer.classList.remove('dash-detail-open');
    // this.agentGrid?.querySelectorAll('.dash-agent-card').forEach(c => {
      // c.classList.remove('selected');
      // c.setAttribute('aria-expanded', 'false');
    // });
  // }
//
  // private loadAgentStats(agentId: string): void {
    // this.apiFetch('/api/agents/' + encodeURIComponent(agentId) + '/stats', {
      // headers: { 'X-FSB-Hash-Key': this.hashKey },
    // }).then(data => {
      // if (this.detailReplayRuns) this.detailReplayRuns.textContent = String(data.replayRuns || 0);
      // if (this.detailAiFallback) this.detailAiFallback.textContent = String(data.aiFallbackRuns || 0);
      // if (this.detailTokensSaved) this.detailTokensSaved.textContent = this.formatNumber(data.tokensSaved || 0);
      // if (this.detailCostSaved) this.detailCostSaved.textContent = '$' + (data.costSaved || 0).toFixed(2);
    // }).catch(() => {});
  // }
//
  // private loadDetailRuns(agentId: string, offset: number): void {
    // if (!this.detailRunsList) return;
    // this.detailRunsList.innerHTML = '<div class="text-center"><span class="dash-spinner"></span></div>';
    // this.fetchRuns(agentId, this.detailRunsLimit, offset).then(data => {
      // this.renderDetailRuns(data.runs || [], data.total || 0, data.limit || this.detailRunsLimit, data.offset || 0);
    // }).catch(() => {
      // if (this.detailRunsList) this.detailRunsList.innerHTML = '<p class="text-muted text-center">Failed to load runs.</p>';
    // });
  // }
//
  // private renderDetailRuns(runs: any[], total: number, limit: number, offset: number): void {
    // if (!this.detailRunsList) return;
    // this.detailRunsList.innerHTML = '';
//
    // if (runs.length === 0) {
      // this.detailRunsList.innerHTML = '<p class="text-muted text-center">No runs yet. Tap Run Now to test this agent.</p>';
      // if (this.detailRunsPagination) this.detailRunsPagination.innerHTML = '';
      // return;
    // }
//
    // runs.forEach(run => {
      // const entry = document.createElement('div');
      // entry.className = 'dash-run-entry';
      // const time = this.formatTime(run.completed_at);
      // const statusClass = run.status === 'success' ? 'dash-run-status-success' :
                          // run.status === 'failed' ? 'dash-run-status-failed' : 'dash-run-status-unknown';
      // const statusSr = run.status === 'success' ? 'Status: success' : run.status === 'failed' ? 'Status: failed' : 'Status: unknown';
      // const modeBadge = this.renderModeBadge(run.execution_mode);
      // const resultText = run.error || run.result || '-';
      // const duration = run.duration_ms ? this.formatDuration(run.duration_ms) : '-';
      // const costStr = run.cost_saved && run.cost_saved > 0 ? '-$' + run.cost_saved.toFixed(4) :
                      // run.cost_usd ? '$' + run.cost_usd.toFixed(4) : '-';
      // entry.innerHTML =
        // '<div class="dash-run-time">' + time + '</div>' +
        // '<div><span class="dash-run-status ' + statusClass + '"><span class="sr-only">' + statusSr + '</span>' + this.escapeHtml(run.status) + '</span></div>' +
        // '<div>' + modeBadge + '</div>' +
        // '<div class="dash-run-result" title="' + this.escapeAttr(resultText) + '">' + this.escapeHtml(resultText) + '</div>' +
        // '<div class="dash-run-duration">' + duration + '</div>' +
        // '<div class="dash-run-cost">' + costStr + '</div>';
      // this.detailRunsList!.appendChild(entry);
    // });
//
    // if (this.detailRunsPagination) {
      // this.detailRunsPagination.innerHTML = '';
      // if (total > limit) {
        // const prevBtn = document.createElement('button');
        // prevBtn.textContent = 'Previous';
        // prevBtn.disabled = offset === 0;
        // prevBtn.addEventListener('click', () => this.loadDetailRuns(this.detailAgentId!, Math.max(0, offset - limit)));
        // const nextBtn = document.createElement('button');
        // nextBtn.textContent = 'Next';
        // nextBtn.disabled = (offset + limit) >= total;
        // nextBtn.addEventListener('click', () => this.loadDetailRuns(this.detailAgentId!, offset + limit));
        // const info = document.createElement('span');
        // info.className = 'text-muted text-sm';
        // info.style.padding = '6px 8px';
        // info.textContent = (offset + 1) + '-' + Math.min(offset + limit, total) + ' of ' + total;
        // this.detailRunsPagination.appendChild(prevBtn);
        // this.detailRunsPagination.appendChild(info);
        // this.detailRunsPagination.appendChild(nextBtn);
      // }
    // }
  // }
//
  // private loadRecordedScript(agent: any): void {
    // if (!this.detailScriptList) return;
    // this.detailScriptList.innerHTML = '';
    // if (this.detailScriptContent) this.detailScriptContent.style.display = 'none';
    // if (this.detailScriptToggle) this.detailScriptToggle.classList.remove('expanded');
//
    // const script = agent.recorded_script || agent.recordedScript;
    // if (!script || !Array.isArray(script) || script.length === 0) {
      // this.detailScriptList.innerHTML = '<li>No recorded script available</li>';
      // return;
    // }
    // script.forEach((step: any) => {
      // const li = document.createElement('li');
      // li.textContent = typeof step === 'string' ? step : (step.action || step.description || JSON.stringify(step));
      // this.detailScriptList!.appendChild(li);
    // });
  // }
//
  // ==================== RUN NOW ====================
//
  // private runAgentNow(agentId: string): void {
    // if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // if (!this.extensionOnline) return;
//
    // this.agentRunningId = agentId;
    // this.renderAgents();
//
    // if (this.detailRunProgress) this.detailRunProgress.style.display = 'block';
    // if (this.detailRunBar) { this.detailRunBar.style.width = '0%'; this.detailRunBar.className = 'dash-task-bar-fill'; }
    // if (this.detailRunAction) this.detailRunAction.textContent = 'Starting...';
    // if (this.detailRunNow) { (this.detailRunNow as HTMLButtonElement).disabled = true; this.detailRunNow.innerHTML = '<span class="dash-spinner"></span> Running'; }
//
    // this.ws.send(JSON.stringify({
      // type: 'dash:agent-run-now',
      // payload: { agentId },
      // ts: Date.now(),
    // }));
  // }
//
  // ==================== AGENT MODAL ====================
//
  // private openAgentModal(mode: 'create' | 'edit', agentId?: string): void {
    // this.modalMode = mode;
    // this.modalAgentId = agentId || null;
    // if (this.modalTitle) this.modalTitle.textContent = mode === 'edit' ? 'Edit Agent' : 'New Agent';
    // if (this.modalSave) { this.modalSave.textContent = 'Save Agent'; (this.modalSave as HTMLButtonElement).disabled = false; }
//
    // if (mode === 'edit' && agentId) {
      // const agent = this.agents.find(a => a.agent_id === agentId);
      // if (agent) {
        // if (this.modalName) this.modalName.value = agent.name || '';
        // if (this.modalTask) this.modalTask.value = agent.task || '';
        // if (this.modalUrl) this.modalUrl.value = agent.target_url || '';
        // this.setModalScheduleType(agent.schedule_type || 'interval', agent.schedule_config);
      // }
    // } else {
      // if (this.modalName) this.modalName.value = '';
      // if (this.modalTask) this.modalTask.value = '';
      // if (this.modalUrl) this.modalUrl.value = '';
      // this.setModalScheduleType('interval', '{}');
    // }
//
    // if (this.modalOverlay) this.modalOverlay.style.display = 'flex';
    // if (this.modalName) this.modalName.focus();
  // }
//
  // private closeAgentModal(): void {
    // if (this.modalOverlay) this.modalOverlay.style.display = 'none';
    // this.modalMode = null;
    // this.modalAgentId = null;
    // this.clearModalErrors();
  // }
//
  // private clearModalErrors(): void {
    // const container = this.modalOverlay || this.host.nativeElement;
    // container.querySelectorAll('.dash-field-error').forEach((e: Element) => e.remove());
    // container.querySelectorAll('.dash-input-error').forEach((e: Element) => e.classList.remove('dash-input-error'));
  // }
//
  // private saveAgentFromModal(): void {
    // this.clearModalErrors();
    // const name = this.modalName?.value.trim() || '';
    // const task = this.modalTask?.value.trim() || '';
    // const url = this.modalUrl?.value.trim() || '';
//
    // let valid = true;
    // if (!name) { this.showFieldError(this.modalName, 'Name is required'); valid = false; }
    // if (!task) { this.showFieldError(this.modalTask, 'Task description is required'); valid = false; }
    // if (!url) { this.showFieldError(this.modalUrl, 'Target URL is required'); valid = false; }
    // if (!valid) return;
//
    // const scheduleType = this.getActiveScheduleType(this.modalScheduleType);
    // const scheduleConfig = this.getScheduleConfig(this.modalScheduleConfig, scheduleType);
//
    // if (this.modalSave) { (this.modalSave as HTMLButtonElement).disabled = true; this.modalSave.innerHTML = '<span class="dash-spinner"></span> Saving...'; }
//
    // const agentId = this.modalMode === 'edit' ? this.modalAgentId! :
      // 'agent_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
//
    // this.apiFetch('/api/agents', {
      // method: 'POST',
      // headers: { 'Content-Type': 'application/json', 'X-FSB-Hash-Key': this.hashKey },
      // body: JSON.stringify({
        // agentId, name, task, targetUrl: url,
        // scheduleType, scheduleConfig: JSON.stringify(scheduleConfig), enabled: true,
      // }),
    // }).then(() => {
      // this.closeAgentModal();
      // this.loadData();
      // setTimeout(() => {
        // const newCard = this.agentGrid?.querySelector('[data-agent-id="' + agentId + '"]');
        // if (newCard) {
          // newCard.classList.add('dash-agent-card-highlight');
          // setTimeout(() => newCard.classList.remove('dash-agent-card-highlight'), 1100);
        // }
      // }, 200);
    // }).catch(err => {
      // if (this.modalSave) { (this.modalSave as HTMLButtonElement).disabled = false; this.modalSave.textContent = 'Save Agent'; }
      // const msg = err?.error || 'Couldn\'t create agent. Check your connection and try again.';
      // this.showFieldError(this.modalUrl, msg);
    // });
  // }
//
  // private showFieldError(inputEl: HTMLElement | null, msg: string): void {
    // if (!inputEl) return;
    // inputEl.classList.add('dash-input-error');
    // const errEl = document.createElement('div');
    // errEl.className = 'dash-field-error';
    // errEl.textContent = msg;
    // inputEl.parentNode?.appendChild(errEl);
  // }
//
  // ==================== SCHEDULE CONFIGURATION ====================
//
  // private setModalScheduleType(type: string, configStr: any): void {
    // const pills = (this.modalScheduleType || this.host.nativeElement).querySelectorAll('.dash-schedule-pill');
    // pills.forEach((p: Element) => p.classList.toggle('active', p.getAttribute('data-type') === type));
    // this.renderScheduleConfig(this.modalScheduleConfig, type, configStr);
  // }
//
  // private renderScheduleConfig(container: HTMLElement | null, type: string, configStr: any): void {
    // if (!container) return;
    // let config: any = {};
    // try { config = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {}); } catch (_) {}
//
    // if (type === 'interval') {
      // const mins = config.intervalMinutes || 60;
      // container.innerHTML =
        // '<div class="dash-schedule-interval-row">' +
          // '<span class="dash-schedule-interval-label">Every</span>' +
          // '<input type="number" class="dash-input dash-schedule-interval-input" value="' + mins + '" min="5" step="5">' +
          // '<span class="dash-schedule-interval-label">minutes</span>' +
        // '</div>';
      // const input = container.querySelector('input');
      // if (input) {
        // input.addEventListener('blur', () => {
          // if (parseInt(input.value) < 5) {
            // input.value = '5';
            // let msgEl = container.querySelector('.dash-schedule-snap-msg');
            // if (!msgEl) {
              // msgEl = document.createElement('div');
              // msgEl.className = 'dash-schedule-snap-msg';
              // msgEl.textContent = 'Minimum 5 minutes';
              // container.appendChild(msgEl);
              // setTimeout(() => { (msgEl as HTMLElement).style.opacity = '0'; }, 100);
              // setTimeout(() => { if (msgEl?.parentNode) msgEl.remove(); }, 2100);
            // }
          // }
        // });
      // }
    // } else if (type === 'daily') {
      // const time = config.dailyTime || '08:00';
      // const days = config.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
      // const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      // const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      // const pillsHtml = dayLabels.map((label, i) => {
        // const checked = days.indexOf(i) >= 0;
        // return '<button class="dash-day-pill" role="checkbox" aria-checked="' + checked + '" aria-label="' + dayNames[i] + '" data-day="' + i + '">' + label + '</button>';
      // }).join('');
      // container.innerHTML =
        // '<input type="time" class="dash-input" value="' + time + '" style="width: 120px;">' +
        // '<div class="dash-day-pills">' + pillsHtml + '</div>';
      // container.querySelectorAll('.dash-day-pill').forEach(pill => {
        // pill.addEventListener('click', () => {
          // const isChecked = pill.getAttribute('aria-checked') === 'true';
          // pill.setAttribute('aria-checked', String(!isChecked));
        // });
      // });
    // } else if (type === 'once') {
      // const dt = config.dateTime || '';
      // container.innerHTML = '<input type="datetime-local" class="dash-input" value="' + dt + '">';
    // }
  // }
//
  // private getActiveScheduleType(container: HTMLElement | null): string {
    // if (!container) return 'interval';
    // const active = container.querySelector('.dash-schedule-pill.active');
    // return active ? (active.getAttribute('data-type') || 'interval') : 'interval';
  // }
//
  // private getScheduleConfig(container: HTMLElement | null, type: string): any {
    // if (!container) return {};
    // if (type === 'interval') {
      // const input = container.querySelector('input[type="number"]') as HTMLInputElement | null;
      // return { intervalMinutes: Math.max(5, parseInt(input?.value || '60') || 60) };
    // }
    // if (type === 'daily') {
      // const timeInput = container.querySelector('input[type="time"]') as HTMLInputElement | null;
      // const daysChecked: number[] = [];
      // container.querySelectorAll('.dash-day-pill[aria-checked="true"]').forEach(p => {
        // daysChecked.push(parseInt(p.getAttribute('data-day') || '0'));
      // });
      // return { dailyTime: timeInput?.value || '08:00', daysOfWeek: daysChecked };
    // }
    // if (type === 'once') {
      // const dtInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement | null;
      // return { dateTime: dtInput?.value || '' };
    // }
    // return {};
  // }
//
  // ==================== DELETE AGENT ====================
//
  // private openDeleteDialog(agentId: string, agentName: string): void {
    // this.deleteAgentId = agentId;
    // this.deleteAgentName = agentName;
    // if (this.deleteTitle) this.deleteTitle.textContent = 'Delete ' + agentName + '?';
    // if (this.deleteOverlay) this.deleteOverlay.style.display = 'flex';
    // if (this.deleteCancel) this.deleteCancel.focus();
  // }
//
  // private closeDeleteDialog(): void {
    // if (this.deleteOverlay) this.deleteOverlay.style.display = 'none';
    // this.deleteAgentId = null;
    // this.deleteAgentName = '';
  // }
//
  // private confirmDeleteAgent(): void {
    // if (!this.deleteAgentId) return;
    // this.apiFetch('/api/agents/' + encodeURIComponent(this.deleteAgentId), {
      // method: 'DELETE',
      // headers: { 'X-FSB-Hash-Key': this.hashKey },
    // }).then(() => {
      // this.closeDeleteDialog();
      // this.closeDetailPanel();
      // this.loadData();
    // }).catch(() => {
      // this.closeDeleteDialog();
    // });
  // }
//
  // ==================== SAVE AS AGENT ====================
//
  // private showSaveAsAgent(): void {
    // if (this.saveAgentSection) this.saveAgentSection.style.display = 'block';
    // if (this.saveAgentNameEl && this.taskText) {
      // this.saveAgentNameEl.value = this.taskText.length > 50 ? this.taskText.substring(0, 50) + '...' : this.taskText;
    // }
    // if (this.saveAgentUrlEl) {
      // const urlMatch = this.taskText.match(/https?:\/\/[^\s]+/);
      // if (urlMatch) this.saveAgentUrlEl.value = urlMatch[0];
    // }
    // this.renderScheduleConfig(this.saveAgentScheduleConfig, 'interval', '{"intervalMinutes": 60}');
  // }
//
  // private hideSaveAsAgent(): void {
    // if (this.saveAgentSection) this.saveAgentSection.style.display = 'none';
    // if (this.saveAgentFields) { this.saveAgentFields.style.display = 'none'; this.saveAgentFields.classList.remove('dash-save-expanded'); }
    // if (this.saveAgentTrigger) this.saveAgentTrigger.classList.remove('expanded');
  // }
//
  // private submitSaveAsAgent(): void {
    // const name = this.saveAgentNameEl?.value.trim() || '';
    // const url = this.saveAgentUrlEl?.value.trim() || '';
    // if (!name || !url) return;
//
    // let scheduleType = 'interval';
    // this.saveAgentSection?.querySelectorAll('.dash-schedule-pill').forEach(p => {
      // if (p.classList.contains('active')) scheduleType = p.getAttribute('data-type') || 'interval';
    // });
    // const scheduleConfig = this.getScheduleConfig(this.saveAgentScheduleConfig, scheduleType);
//
    // if (this.saveAgentBtn) { (this.saveAgentBtn as HTMLButtonElement).disabled = true; this.saveAgentBtn.innerHTML = '<span class="dash-spinner"></span> Saving...'; }
//
    // const agentId = 'agent_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
//
    // this.apiFetch('/api/agents', {
      // method: 'POST',
      // headers: { 'Content-Type': 'application/json', 'X-FSB-Hash-Key': this.hashKey },
      // body: JSON.stringify({
        // agentId, name, task: this.taskText, targetUrl: url,
        // scheduleType, scheduleConfig: JSON.stringify(scheduleConfig), enabled: true,
      // }),
    // }).then(() => {
      // this.hideSaveAsAgent();
      // this.loadData();
      // if (this.saveAgentBtn) { (this.saveAgentBtn as HTMLButtonElement).disabled = false; this.saveAgentBtn.textContent = 'Save Agent'; }
    // }).catch(() => {
      // if (this.saveAgentBtn) { (this.saveAgentBtn as HTMLButtonElement).disabled = false; this.saveAgentBtn.textContent = 'Save Agent'; }
    // });
  // }
//
  // private renderModeBadge(mode: string): string {
    // if (mode === 'replay') return '<span class="dash-mode-badge dash-mode-replay">Replay</span>';
    // if (mode === 'ai_fallback') return '<span class="dash-mode-badge dash-mode-fallback">AI Fallback</span>';
    // return '<span class="dash-mode-badge dash-mode-ai">AI</span>';
  // }
//
  // ==================== DOM PREVIEW ====================

  private setPreviewLoadingText(text: string): void {
    if (!this.previewLoading) return;
    const label = this.previewLoading.querySelector('span');
    if (label) label.textContent = text || this.dashboardCopy.connectingToBrowser;
  }

  private setPreviewDisconnectedText(text: string): void {
    if (!this.previewDisconnected) return;
    const label = this.previewDisconnected.querySelector('span');
    if (label) label.textContent = text || this.dashboardCopy.previewDisconnectedDetail;
  }

  private getPreviewNotReadyText(reason: string): string {
    switch (reason) {
      case 'restricted-tab': return this.dashboardCopy.previewOpenNormalPage;
      case 'tab-closed': return this.dashboardCopy.previewTabClosed;
      case 'waiting-for-page-ready': return this.dashboardCopy.previewWaitingForPage;
      case 'no-streamable-tab':
      default: return this.dashboardCopy.previewOpenStreamableTab;
    }
  }

  private clearPendingStreamRecovery(): void {
    if (this.pendingStreamRecovery) {
      clearTimeout(this.pendingStreamRecovery);
      this.pendingStreamRecovery = null;
    }
  }

  private armPreviewRecoveryWatchdog(trigger: string): void {
    this.clearPendingStreamRecovery();
    if (!this.streamToggleOn) return;
    this.pendingStreamRecovery = setTimeout(() => {
      this.pendingStreamRecovery = null;
      if (!this.streamToggleOn || this.previewState === 'streaming') return;
      if (this.lastRecoveredStreamState === 'not-ready') return;
      this.lastRecoveredStreamState = 'not-ready';
      this.pageReady = false;
      this.previewNotReadyReason = this.previewNotReadyReason || 'waiting-for-page-ready';
      this.setPreviewDisconnectedText(this.getPreviewNotReadyText(this.previewNotReadyReason));
      this.setPreviewState('disconnected');
      this.updatePreviewTooltip();
    }, 5000);
  }

  private scheduleStreamRecovery(trigger: string): void {
    this.sendDashboardWSMessage('dash:request-status', { trigger });
    if (!this.streamToggleOn || this.previewState === 'frozen-complete') {
      this.clearPendingStreamRecovery();
      this.updatePreviewTooltip();
      return;
    }
    this.previewLoadStartedAt = Date.now();
    this.previewNotReadyReason = '';
    this.pageReady = false;
    this.lastRecoveredStreamState = 'recovering';
    this.setPreviewLoadingText(trigger === 'extension-online' ? this.dashboardCopy.reconnectingPreview : this.dashboardCopy.connectingPreview);
    this.setPreviewDisconnectedText(this.dashboardCopy.previewDisconnectedDetail);
    this.setPreviewState('loading');
    const streamStartSent = this.sendDashboardWSMessage('dash:dom-stream-start', { trigger });
    this.recordTransportEvent('recovery-request-sent', { trigger, streamStartSent, streamToggleOn: this.streamToggleOn });
    this.armPreviewRecoveryWatchdog(trigger);
    this.updatePreviewTooltip();
  }

  // Phase 212 / NAV-01: URL bar helpers
  private normalizeNavigateUrl(input: string): string {
    if (typeof input !== 'string') return '';
    const url = input.trim();
    if (!url) return '';
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) return url;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return url;
    if (/^\/\//.test(url)) return 'https:' + url;
    return 'https://' + url;
  }
  private submitUrlBar(): void {
    if (!this.previewUrlInput) return;
    const normalized = this.normalizeNavigateUrl(this.previewUrlInput.value);
    if (!normalized) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendDashboardWSMessage('dash:navigate', { url: normalized });
      if (this.previewRestricted) this.previewRestricted.style.display = 'none';
      if (this.previewState === 'restricted' || this.previewState === 'disconnected') {
        this.setPreviewState('loading');
      }
    } else {
      console.warn('[FSB-DASH] Cannot navigate -- WS not open');
    }
  }
  // Phase 212 / STREAM-06: restricted-tab placeholder helpers
  private showRestrictedPlaceholder(payload: any): void {
    if (!this.previewRestricted) return;
    const url = (payload && payload.url) || '';
    const pageType = this.translateRestrictedPageType(payload && payload.pageType);
    if (this.previewRestrictedTitle) this.previewRestrictedTitle.textContent = pageType;
    if (this.previewRestrictedUrl) this.previewRestrictedUrl.textContent = url;
    this.previewRestricted.style.display = 'flex';
  }
  private hideRestrictedPlaceholder(): void {
    if (this.previewRestricted) this.previewRestricted.style.display = 'none';
  }
  private syncUrlBarFromStream(url: string): void {
    if (!this.previewUrlInput) return;
    if (typeof url !== 'string') return;
    if (document.activeElement === this.previewUrlInput) return;
    if (url && url !== this.lastKnownStreamUrl) {
      this.lastKnownStreamUrl = url;
      this.previewUrlInput.value = url;
    }
  }

  private handleRecoveredStreamState(payload: any): void {
    const status = payload.status || 'not-ready';
    const streamIntentActive = payload.streamIntentActive !== false;
    this.streamTabUrl = payload.url || '';
    this.syncUrlBarFromStream(this.streamTabUrl);
    this.activePreviewTabId = typeof payload.tabId === 'number' ? payload.tabId : this.activePreviewTabId;
    this.lastRecoveredStreamState = status;
    this.previewNotReadyReason = payload.reason || '';

    if (status === 'not-ready') {
      this.recordTransportEvent('stream-state-not-ready', { type: 'ext:stream-state', reason: this.previewNotReadyReason || '' });
      this.pageReady = false;
      this.resetPreviewGenerationState();
      this.clearPendingStreamRecovery();
      // Phase 212 / STREAM-06: render placeholder for restricted tabs
      if (this.previewNotReadyReason === 'restricted-tab') {
        this.showRestrictedPlaceholder(payload);
        this.setPreviewState('restricted' as PreviewState);
      } else {
        this.hideRestrictedPlaceholder();
        this.setPreviewDisconnectedText(this.getPreviewNotReadyText(this.previewNotReadyReason));
        this.setPreviewState('disconnected');
      }
      this.updatePreviewTooltip();
      return;
    }
    // Stream ready or recovering -- clear restricted placeholder
    this.hideRestrictedPlaceholder();

    if (!this.streamToggleOn || !streamIntentActive) {
      if (!this.streamToggleOn) this.clearPendingStreamRecovery();
      this.updatePreviewTooltip();
      return;
    }

    if (status === 'ready') {
      this.recordTransportEvent('stream-state-ready', { type: 'ext:stream-state' });
      this.pageReady = true;
      this.previewNotReadyReason = '';
      this.previewLoadStartedAt = this.previewLoadStartedAt || Date.now();
      this.setPreviewLoadingText(this.dashboardCopy.previewLoadingDetail);
      if (this.previewState !== 'streaming') this.setPreviewState('loading');
      if (!this.pendingStreamRecovery) this.armPreviewRecoveryWatchdog('stream-state:ready');
    } else if (status === 'recovering') {
      this.recordTransportEvent('stream-state-recovering', { type: 'ext:stream-state' });
      this.pageReady = false;
      this.previewLoadStartedAt = Date.now();
      this.setPreviewLoadingText(this.dashboardCopy.previewRecoveringDetail);
      if (this.previewState !== 'streaming') this.setPreviewState('loading');
      if (!this.pendingStreamRecovery) this.armPreviewRecoveryWatchdog('stream-state:recovering');
    }
    this.updatePreviewTooltip();
  }

  private setPreviewState(newState: PreviewState): void {
    this.previewState = newState;
    if (this.previewHideTimer) { clearTimeout(this.previewHideTimer); this.previewHideTimer = null; }

    // Reset all sub-views
    if (this.previewContainer) this.previewContainer.style.display = 'none';
    if (this.previewLoading) this.previewLoading.style.display = 'none';
    if (this.previewViewerHost) this.previewViewerHost.style.display = 'none';
    if (this.previewGlow) this.previewGlow.style.display = 'none';
    if (this.previewProgress) this.previewProgress.style.display = 'none';
    if (this.previewDialog) this.previewDialog.style.display = 'none';
    if (this.previewStatus) { this.previewStatus.style.display = 'none'; this.previewStatus.className = 'dash-preview-status'; }
    if (this.previewDisconnected) this.previewDisconnected.style.display = 'none';
    if (this.previewError) this.previewError.style.display = 'none';
    if (this.previewFrozenOverlay) this.previewFrozenOverlay.style.display = 'none';
    this.renderStateChip(this.previewRcState, 'dash-preview-rc-state', '', '');

    switch (newState) {
      case 'hidden':
        if (this.previewStatus) this.previewStatus.textContent = '';
        break;
      case 'error':
        if (this.previewContainer) this.previewContainer.style.display = '';
        if (this.previewError) this.previewError.style.display = 'flex';
        break;
      default: {
        const previewSurface = this.derivePreviewRuntimeSurface();
        if (this.previewContainer) this.previewContainer.style.display = '';
        if (this.previewLoading && previewSurface.showLoading) {
          this.previewLoading.style.display = 'flex';
          this.setPreviewLoadingText(previewSurface.detailText);
        }
        if (this.previewViewerHost && previewSurface.showIframe) {
          this.previewViewerHost.style.display = '';
        }
        if (this.previewDisconnected && previewSurface.showDisconnected) {
          this.previewDisconnected.style.display = 'flex';
          this.setPreviewDisconnectedText(previewSurface.detailText);
        }
        if (this.previewFrozenOverlay && previewSurface.showFrozenOverlay) {
          this.previewFrozenOverlay.style.display = 'flex';
          this.renderPreviewFrozenIdentity();
          if (this.previewFrozenLabel) {
            this.previewFrozenLabel.textContent = previewSurface.frozenLabel || this.dashboardCopy.frozen;
            this.previewFrozenLabel.className = 'dash-preview-frozen-label ' + (previewSurface.frozenType || '');
          }
        }
        this.renderStateChip(this.previewStatus, 'dash-preview-status', previewSurface.chipLabel, previewSurface.chipTone);
        break;
      }
    }
    const keepRemoteUntilAuthoritativeState = newState !== 'paused' &&
      (this.isRemoteControlStartPending() || this.isDashboardWSOpen());
    if (newState !== 'streaming' && newState !== 'frozen-disconnect' && newState !== 'frozen-complete' && this.remoteControlOn && !keepRemoteUntilAuthoritativeState) {
      this.setRemoteControl(false, { silent: newState !== 'paused', source: 'preview-state' });
    }
    this.renderRemoteControlState(this.lastRemoteControlState, { skipToggleSync: true });
  }

  private isRemoteControlToggleAvailable(): boolean {
    if (this.isDashboardWSOpen()) return true;
    if (this.isRemoteControlStartPending()) return true;
    if (this.previewState === 'streaming') return true;
    if (this.previewState !== 'loading') return false;
    if (!this.streamToggleOn || this.previewNotReadyReason) return false;
    return this.pageReady === true ||
      this.lastRecoveredStreamState === 'ready' ||
      this.lastRecoveredStreamState === 'recovering';
  }

  private isDashboardWSOpen(): boolean {
    return !!(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  private canClickRemoteControlToggle(): boolean {
    return this.remoteControlOn || this.isRemoteControlStartPending() || this.isDashboardWSOpen();
  }

  private isRemoteControlStartPending(): boolean {
    return this.remoteControlRequestedAt > 0 &&
      Date.now() - this.remoteControlRequestedAt < this.REMOTE_CONTROL_START_GRACE_MS;
  }

  private isBenignRemoteControlOff(state: RemoteControlState): boolean {
    if (!state || state.enabled || state.attached) return false;
    return state.reason === 'user-stop' || state.reason === 'stream-not-ready';
  }

  private clearRemoteControlRequestTimer(): void {
    if (this.remoteControlRequestTimer) {
      clearTimeout(this.remoteControlRequestTimer);
      this.remoteControlRequestTimer = null;
    }
  }

  private completeRemoteControlRequest(): void {
    this.remoteControlRequestedAt = 0;
    this.clearRemoteControlRequestTimer();
  }

  private armRemoteControlRequestTimeout(): void {
    this.clearRemoteControlRequestTimer();
    this.remoteControlRequestTimer = setTimeout(() => {
      this.remoteControlRequestTimer = null;
      if (!this.remoteControlRequestedAt || !this.remoteControlOn) return;
      this.remoteControlRequestedAt = 0;
      this.lastRemoteControlState = {
        enabled: false,
        attached: false,
        tabId: this.activePreviewTabId,
        reason: 'request-timeout',
        ownership: 'none',
      };
      this.setRemoteControl(false, { silent: true, source: 'request-timeout' });
      this.renderRemoteControlState(this.lastRemoteControlState, { skipToggleSync: true });
    }, this.REMOTE_CONTROL_START_GRACE_MS);
  }

  private handleRemoteControlToggleClick(): void {
    if (this.remoteControlOn) {
      this.setRemoteControl(false);
      return;
    }
    if (!this.isDashboardWSOpen()) {
      this.lastRemoteControlState = {
        enabled: false,
        attached: false,
        tabId: this.activePreviewTabId,
        reason: 'dashboard-disconnected',
        ownership: 'none',
      };
      this.renderRemoteControlState(this.lastRemoteControlState, { skipToggleSync: true });
      return;
    }
    this.setRemoteControl(true);
  }

  private handleDOMSnapshot(payload: any): void {
    if (!payload || !payload.html) {
      this.recordTransportError('dom-snapshot-invalid', 'DOM snapshot missing html payload', { type: 'ext:dom-snapshot' });
      this.setPreviewState('error');
      return;
    }
    this.recordTransportEvent('dom-snapshot-received', { type: 'ext:dom-snapshot' });

    const identity = this.getPreviewMessageIdentity(payload);
    let replacingPreviewStream = false;
    if (identity.streamSessionId && this.activePreviewStreamSessionId && identity.streamSessionId !== this.activePreviewStreamSessionId) replacingPreviewStream = true;
    if (identity.snapshotId && this.activePreviewSnapshotId && identity.snapshotId !== this.activePreviewSnapshotId) replacingPreviewStream = true;
    if (identity.tabId && this.activePreviewTabId && identity.tabId !== this.activePreviewTabId) replacingPreviewStream = true;

    this.activePreviewStreamSessionId = identity.streamSessionId || '';
    this.activePreviewSnapshotId = identity.snapshotId || 0;
    this.activePreviewTabId = identity.tabId;
    this.resetPreviewGenerationState();
    this.lastPreviewScroll.x = payload.scrollX || 0;
    this.lastPreviewScroll.y = payload.scrollY || 0;

    if (this.previewGlow) this.previewGlow.style.display = 'none';
    if (this.previewProgress) this.previewProgress.style.display = 'none';
    if (this.previewDialog) this.previewDialog.style.display = 'none';
    if (replacingPreviewStream) {
      this.recordTransportEvent('preview-stream-replaced', { type: 'ext:dom-snapshot' });
    }

    this.previewSnapshotData = payload;
    this.lastSnapshotTime = Date.now();
    // Phase 276 STREAM-04: snapshot counts as a "frame" for the
    // last-frame-ago tooltip reading.
    this.lastFrameTime = this.lastSnapshotTime;
    this.previewLoadStartedAt = 0;
    this.pageReady = true;
    this.lastRecoveredStreamState = 'streaming';
    this.previewNotReadyReason = '';
    this.clearPendingStreamRecovery();
    this.updatePreviewTooltip();

    try {
      if (!this.dispatchPreviewViewer('ext:dom-snapshot', payload)) {
        throw new Error('phantomstream-viewer-unavailable');
      }
      this.updatePreviewScale();
      this.setPreviewState('streaming');
    } catch (e: any) {
      this.recordTransportError('dom-snapshot-render-failed', e.message, { type: 'ext:dom-snapshot' });
      this.setPreviewState('error');
    }
  }

  private updatePreviewScale(): void {
    if (!this.previewViewerHost || !this.previewContainer || !this.previewSnapshotData) return;
    const containerWidth = this.previewContainer.clientWidth;
    const pageWidth = this.previewSnapshotData.viewportWidth || this.previewSnapshotData.pageWidth || 1920;
    const pageHeight = this.previewSnapshotData.viewportHeight || 1080;

    let computedHeight = (pageHeight / pageWidth) * containerWidth;
    if (this.previewLayoutMode === 'inline') {
      computedHeight = Math.max(200, Math.min(computedHeight, window.innerHeight * 0.9));
    }
    if (this.previewLayoutMode === 'maximized' || this.previewLayoutMode === 'fullscreen') {
      computedHeight = this.previewContainer.clientHeight;
    }
    if (this.previewLayoutMode === 'inline' || this.previewLayoutMode === 'pip') {
      this.previewContainer.style.height = computedHeight + 'px';
    }

    this.previewScale = containerWidth / pageWidth;
    if (this.previewViewer && typeof this.previewViewer.getViewportMapping === 'function') {
      try {
        const mapping = this.previewViewer.getViewportMapping();
        if (mapping && mapping.scale && typeof mapping.scale.s === 'number' && mapping.scale.s > 0) {
          this.previewScale = mapping.scale.s;
        }
      } catch (e) {}
    }
  }

  private setRemoteControl(on: boolean, options?: { silent?: boolean; source?: string }): void {
    options = options || {};
    if (on && options.silent !== true && !this.isDashboardWSOpen()) {
      this.lastRemoteControlState = {
        enabled: false,
        attached: false,
        tabId: this.activePreviewTabId,
        reason: 'dashboard-disconnected',
        ownership: 'none',
      };
      this.renderRemoteControlState(this.lastRemoteControlState, { skipToggleSync: true });
      return;
    }
    this.remoteControlOn = on;
    if (on && options.silent !== true) {
      this.remoteControlRequestedAt = Date.now();
      this.lastRemoteControlState = {
        enabled: false,
        attached: false,
        tabId: this.activePreviewTabId,
        reason: 'requesting',
        ownership: 'dashboard',
      };
      this.armRemoteControlRequestTimeout();
    } else if (!on) {
      this.completeRemoteControlRequest();
    }
    this.setRemoteControlCaptureActive(false);
    if (this.remoteOverlay) {
      this.remoteOverlay.tabIndex = on ? 0 : -1;
      this.remoteOverlay.setAttribute('role', 'application');
      this.remoteOverlay.setAttribute('aria-label', this.dashboardCopy.remoteControlAria);
      this.remoteOverlay.style.display = on ? '' : 'none';
      if (on) {
        this.remoteOverlay.classList.add('active');
      } else {
        this.remoteOverlay.classList.remove('active');
        if (document.activeElement === this.remoteOverlay) this.remoteOverlay.blur();
      }
    }
    if (this.previewContainer) {
      if (on) { this.previewContainer.classList.add('dash-rc-active'); }
      else { this.previewContainer.classList.remove('dash-rc-active'); }
    }
    if (this.previewRcBtn) {
      if (on) {
        this.previewRcBtn.classList.add('dash-rc-on');
        this.previewRcBtn.title = this.dashboardCopy.disableRemoteControl;
      } else {
        this.previewRcBtn.classList.remove('dash-rc-on');
        this.previewRcBtn.title = this.dashboardCopy.remoteControl;
      }
      this.previewRcBtn.innerHTML = '<i class="fa-solid fa-hand-pointer"></i>';
    }
    const activeWs = this.ws;
    if (options.silent !== true && activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(JSON.stringify({
        type: on ? 'dash:remote-control-start' : 'dash:remote-control-stop',
        payload: {},
        ts: Date.now(),
      }));
      activeWs.send(JSON.stringify({
        type: on ? 'dash:ps-control-request' : 'dash:ps-control-stop',
        payload: {},
        ts: Date.now(),
      }));
    }
    this.renderRemoteControlState(this.lastRemoteControlState, { skipToggleSync: true });
  }

  private setPreviewLayout(mode: PreviewLayoutMode): void {
    if (this.previewContainer) {
      this.previewContainer.classList.remove('dash-preview-maximized', 'dash-preview-pip');
    }
    document.body.classList.remove('dash-layout-maximized');
    this.previewLayoutMode = mode;

    switch (mode) {
      case 'maximized':
        if (this.previewContainer) this.previewContainer.classList.add('dash-preview-maximized');
        document.body.classList.add('dash-layout-maximized');
        if (this.previewMaximizeBtn) { this.previewMaximizeBtn.innerHTML = '<i class="fa-solid fa-compress"></i>'; this.previewMaximizeBtn.title = this.dashboardCopy.minimize; }
        break;
      case 'pip':
        if (this.previewContainer) this.previewContainer.classList.add('dash-preview-pip');
        if (this.previewPipBtn) { this.previewPipBtn.innerHTML = '<i class="fa-solid fa-arrow-down-left-and-up-right-to-center"></i>'; this.previewPipBtn.title = this.dashboardCopy.exitPip; }
        break;
      case 'fullscreen':
        if (this.previewFsExit) this.previewFsExit.style.display = 'block';
        if (this.previewFullscreenBtn) { this.previewFullscreenBtn.innerHTML = '<i class="fa-solid fa-down-left-and-up-right-to-center"></i>'; this.previewFullscreenBtn.title = this.dashboardCopy.exitFullscreen; }
        break;
      case 'inline':
      default:
        if (this.previewMaximizeBtn) { this.previewMaximizeBtn.innerHTML = '<i class="fa-solid fa-expand"></i>'; this.previewMaximizeBtn.title = this.dashboardCopy.maximize; }
        if (this.previewPipBtn) { this.previewPipBtn.innerHTML = '<i class="fa-solid fa-window-restore"></i>'; this.previewPipBtn.title = this.dashboardCopy.pip; }
        if (this.previewFullscreenBtn) { this.previewFullscreenBtn.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>'; this.previewFullscreenBtn.title = this.dashboardCopy.fullscreen; }
        if (this.previewFsExit) this.previewFsExit.style.display = 'none';
        if (this.previewContainer) {
          this.previewContainer.style.left = '';
          this.previewContainer.style.top = '';
          this.previewContainer.style.bottom = '';
          this.previewContainer.style.right = '';
          this.previewContainer.style.height = '';
        }
        break;
    }
    setTimeout(() => this.updatePreviewScale(), 50);
  }

  private toggleMaximize(): void {
    this.setPreviewLayout(this.previewLayoutMode === 'maximized' ? 'inline' : 'maximized');
  }

  private togglePip(): void {
    this.setPreviewLayout(this.previewLayoutMode === 'pip' ? 'inline' : 'pip');
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement === this.previewContainer) {
      document.exitFullscreen();
    } else if (this.previewContainer) {
      this.previewContainer.requestFullscreen().catch(() => {});
      this.setPreviewLayout('fullscreen');
    }
  }

  private initPipDrag(): void {
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0, containerStartLeft = 0, containerStartTop = 0;
    const previewHeader = this.host.nativeElement.querySelector('.dash-preview-header');
    if (!previewHeader || !this.previewContainer) return;

    this.listen(previewHeader, 'mousedown', (e: Event) => {
      if (this.previewLayoutMode !== 'pip') return;
      if ((e.target as HTMLElement).closest('.dash-preview-btn') || (e.target as HTMLElement).closest('.dash-preview-controls button')) return;
      isDragging = true;
      const me = e as MouseEvent;
      dragStartX = me.clientX;
      dragStartY = me.clientY;
      const rect = this.previewContainer!.getBoundingClientRect();
      containerStartLeft = rect.left;
      containerStartTop = rect.top;
      previewHeader.style.cursor = 'grabbing';
      me.preventDefault();
    });

    this.listen(document, 'mousemove', (e: Event) => {
      if (!isDragging) return;
      const me = e as MouseEvent;
      this.previewContainer!.style.left = (containerStartLeft + me.clientX - dragStartX) + 'px';
      this.previewContainer!.style.top = (containerStartTop + me.clientY - dragStartY) + 'px';
      this.previewContainer!.style.bottom = 'auto';
      this.previewContainer!.style.right = 'auto';
    });

    this.listen(document, 'mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      if (previewHeader) previewHeader.style.cursor = '';
    });
  }

  private initFsExitOverlay(): void {
    let fsHideTimer: any = null;
    if (!this.previewContainer || !this.previewFsExit) return;

    this.listen(this.previewContainer, 'mousemove', () => {
      if (this.previewLayoutMode !== 'fullscreen') return;
      if (this.previewFsExit) this.previewFsExit.style.opacity = '1';
      if (fsHideTimer) clearTimeout(fsHideTimer);
      fsHideTimer = setTimeout(() => {
        if (this.previewFsExit) this.previewFsExit.style.opacity = '0';
      }, 2000);
    });

    const fsExitBtn = this.previewFsExit.querySelector('.dash-preview-fs-exit-btn');
    if (fsExitBtn) {
      this.listen(fsExitBtn, 'click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
      });
    }
  }

  private initRemoteControl(): void {
    if (!this.remoteOverlay) return;
    this.remoteOverlay.tabIndex = -1;
    this.remoteOverlay.setAttribute('role', 'application');
    this.remoteOverlay.setAttribute('aria-label', this.dashboardCopy.remoteControlAria);

    this.listen(this.remoteOverlay, 'focus', () => {
      if (!this.remoteControlOn) return;
      this.setRemoteControlCaptureActive(true);
    });

    this.listen(this.remoteOverlay, 'blur', () => {
      this.setRemoteControlCaptureActive(false);
    });

    // Click forwarding
    this.listen(this.remoteOverlay, 'mousedown', (e: Event) => {
      const me = e as MouseEvent;
      if (!this.remoteControlOn || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      me.preventDefault();
      me.stopPropagation();
      this.remoteOverlay!.focus({ preventScroll: true });
      const rect = this.remoteOverlay!.getBoundingClientRect();
      const point = this.clampRemotePreviewPoint(me.clientX - rect.left, me.clientY - rect.top);
      this.ws.send(JSON.stringify({
        type: 'dash:remote-click',
        payload: { x: point.x, y: point.y, button: 'left', modifiers: this.getRemoteModifiers(me) },
        ts: Date.now(),
      }));
    });

    // Keyboard forwarding
    this.listen(this.remoteOverlay, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (!this.remoteControlOn || !this.remoteControlCaptureActive || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      ke.preventDefault();
      ke.stopPropagation();
      if (this.shouldInsertRemoteText(ke)) {
        this.ws.send(JSON.stringify({
          type: 'dash:remote-key',
          payload: { type: 'insertText', key: ke.key, code: ke.code, text: ke.key, modifiers: this.getRemoteModifiers(ke) },
          ts: Date.now(),
        }));
        return;
      }
      this.ws.send(JSON.stringify({
        type: 'dash:remote-key',
        payload: { type: 'keyDown', key: ke.key, code: ke.code, text: '', modifiers: this.getRemoteModifiers(ke) },
        ts: Date.now(),
      }));
    });

    this.listen(this.remoteOverlay, 'keyup', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (!this.remoteControlOn || !this.remoteControlCaptureActive || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (this.shouldInsertRemoteText(ke)) return;
      ke.preventDefault();
      ke.stopPropagation();
      this.ws.send(JSON.stringify({
        type: 'dash:remote-key',
        payload: { type: 'keyUp', key: ke.key, code: ke.code, text: '', modifiers: this.getRemoteModifiers(ke) },
        ts: Date.now(),
      }));
    });

    // Scroll forwarding
    let scrollThrottleTimer: any = null;
    this.listen(this.remoteOverlay, 'wheel', (e: Event) => {
      const we = e as WheelEvent;
      if (!this.remoteControlOn || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      we.preventDefault();
      we.stopPropagation();
      this.remoteOverlay!.focus({ preventScroll: true });
      if (scrollThrottleTimer) return;
      scrollThrottleTimer = setTimeout(() => { scrollThrottleTimer = null; }, 16);
      const rect = this.remoteOverlay!.getBoundingClientRect();
      const point = this.clampRemotePreviewPoint(we.clientX - rect.left, we.clientY - rect.top);
      this.ws.send(JSON.stringify({
        type: 'dash:remote-scroll',
        payload: { x: point.x, y: point.y, deltaX: Math.round(we.deltaX), deltaY: Math.round(we.deltaY) },
        ts: Date.now(),
      }));
    }, { passive: false });
  }

  private handleDOMMutations(payload: any): void {
    if (!this.shouldAcceptPreviewMessage(payload, 'ext:dom-mutations')) return;
    if (this.previewState !== 'streaming') return;

    this.lastFrameTime = Date.now();

    try {
      const mutations = payload.mutations || [];
      this.recordTransportEvent('dom-mutations-dispatched', {
        type: 'ext:dom-mutations',
        mutationCount: mutations.length,
        streamSessionId: payload.streamSessionId || this.activePreviewStreamSessionId,
        snapshotId: payload.snapshotId || this.activePreviewSnapshotId,
      });
      if (!this.dispatchPreviewViewer('ext:dom-mutations', payload)) {
        throw new Error('phantomstream-viewer-unavailable');
      }
      this.mutationsAppliedTotal += mutations.length;
      this.updatePreviewTooltip();
    } catch (e: any) {
      this.mutationApplyFailures += 1;
      this.recordTransportError('dom-mutation-apply-failed', e.message, {
        type: 'ext:dom-mutations',
        mutationCount: payload?.mutations ? payload.mutations.length : 0,
        mutationApplyFailures: this.mutationApplyFailures,
      });
      this.requestPreviewResync('dom-mutation-batch-failed', {
        mutationCount: payload?.mutations ? payload.mutations.length : 0,
      });
    }
  }

  private handleDOMScroll(payload: any): void {
    if (!this.shouldAcceptPreviewMessage(payload, 'ext:dom-scroll')) return;
    this.lastPreviewScroll.x = payload.scrollX || 0;
    this.lastPreviewScroll.y = payload.scrollY || 0;
    if (this.previewState !== 'streaming') return;
    this.dispatchPreviewViewer('ext:dom-scroll', payload);
  }

  private handleDOMMedia(payload: any): void {
    // Phase 33 (MEDIA): forward live media playback state to the viewer's
    // reconciler. Stream-only (like scroll); the viewer self-heals drift.
    if (!this.shouldAcceptPreviewMessage(payload, 'ext:dom-media')) return;
    if (this.previewState !== 'streaming') return;
    this.dispatchPreviewViewer('ext:dom-media', payload);
  }

  private handleDOMMediaHint(payload: any): void {
    // Phase 33 (MEDIA): adaptive-manifest discovery hint (dormant until the
    // opt-in chrome.webRequest discovery path is enabled).
    if (!this.shouldAcceptPreviewMessage(payload, 'ext:dom-media-hint')) return;
    if (this.previewState !== 'streaming') return;
    this.dispatchPreviewViewer('ext:dom-media-hint', payload);
  }

  private handleDOMOverlay(payload: any): void {
    if (!this.shouldAcceptPreviewMessage(payload, 'ext:dom-overlay')) return;
    const canRenderOverlay = this.previewState === 'streaming'
      || this.previewState === 'frozen-disconnect'
      || this.previewState === 'frozen-complete';
    if (!canRenderOverlay) return;
    this.dispatchPreviewViewer('ext:dom-overlay', payload);
    if (payload.glow?.state === 'active' && this.previewGlow) {
      this.previewGlow.style.display = '';
      this.previewGlow.style.top = (payload.glow.y * this.previewScale) + 'px';
      this.previewGlow.style.left = (payload.glow.x * this.previewScale) + 'px';
      this.previewGlow.style.width = (payload.glow.w * this.previewScale) + 'px';
      this.previewGlow.style.height = (payload.glow.h * this.previewScale) + 'px';
    } else if (this.previewGlow) {
      this.previewGlow.style.display = 'none';
    }
    if (payload.progress && payload.progress.lifecycle !== 'cleared') {
      this.rememberPreviewOverlayIdentity(payload.progress);
    } else {
      this.clearPreviewOverlayIdentity();
    }
    this.renderPreviewFrozenIdentity();

    const hasActiveProgress = !!(payload.progress && payload.progress.lifecycle !== 'cleared');
    if (hasActiveProgress && this.previewProgress) {
      this.previewProgress.style.display = '';
      const helpers = this.getDashboardRuntimeStateHelpers();
      const progressText = typeof helpers.formatProgressOverlay === 'function'
        ? helpers.formatProgressOverlay(payload.progress, this.dashboardCopy)
        : this.dashboardCopy.phaseWorking + ' - ' + this.dashboardCopy.phaseWorking;
      if (this.previewProgressStatus) {
        this.previewProgressStatus.textContent = progressText;
      }
      const rawDetailText = String(payload.progress.detail || '').trim();
      const detailText = typeof helpers.translateProgressDetail === 'function'
        ? helpers.translateProgressDetail(rawDetailText, this.dashboardCopy)
        : rawDetailText;
      if (this.previewProgressDetail) {
        this.previewProgressDetail.textContent = detailText;
        this.previewProgressDetail.style.display = detailText ? 'block' : 'none';
      }
      this.renderPreviewClientBadge(this.previewProgressBadge, payload.progress.clientLabel || '');
    } else if (this.previewProgress) {
      this.previewProgress.style.display = 'none';
      if (this.previewProgressDetail) {
        this.previewProgressDetail.textContent = '';
        this.previewProgressDetail.style.display = 'none';
      }
      this.renderPreviewClientBadge(this.previewProgressBadge, '');
    }
  }

  private handleDOMDialog(payload: any): void {
    if (!this.shouldAcceptPreviewMessage(payload, 'ext:dom-dialog')) return;
    this.dispatchPreviewViewer('ext:dom-dialog', payload);
    const dialog = payload.dialog || payload;
    if (!dialog) return;

    if (dialog.state === 'open') {
      if (this.previewDialogType) {
        const dialogType = String(dialog.type || 'alert').toLowerCase();
        this.previewDialogType.textContent = dialogType === 'confirm'
          ? this.dashboardCopy.dialogConfirm
          : dialogType === 'prompt'
            ? this.dashboardCopy.dialogPrompt
            : this.dashboardCopy.dialogAlert;
      }
      if (this.previewDialogMessage) this.previewDialogMessage.textContent = dialog.message || '';
      if (this.previewDialog) {
        const iconEl = this.previewDialog.querySelector('.dash-preview-dialog-icon i');
        if (iconEl) {
          switch (dialog.type) {
            case 'confirm': iconEl.className = 'fa-solid fa-circle-question'; break;
            case 'prompt': iconEl.className = 'fa-solid fa-keyboard'; break;
            default: iconEl.className = 'fa-solid fa-triangle-exclamation'; break;
          }
        }
        this.previewDialog.style.display = 'flex';
      }
    } else if (dialog.state === 'closed') {
      if (this.previewDialog) this.previewDialog.style.display = 'none';
    }
  }

  private updatePreviewTooltip(): void {
    if (!this.previewTooltip) return;
    const parts: string[] = [];
    if (this.streamTabUrl) parts.push(this.streamTabUrl.length > 60 ? this.streamTabUrl.substring(0, 60) + '...' : this.streamTabUrl);
    if (this.lastSnapshotTime) {
      const snapshotTime = new Date(this.lastSnapshotTime).toLocaleTimeString(this.localeId);
      parts.push($localize`:@@dashboard.runtime.tooltip.lastSnapshot:Last snapshot: ${snapshotTime}:snapshotTime:`);
    }
    if (this.lastRecoveredStreamState) {
      const state = this.translateStreamState(this.lastRecoveredStreamState);
      parts.push($localize`:@@dashboard.runtime.tooltip.state:State: ${state}:streamState:`);
    }
    if (this.previewNotReadyReason) {
      const reason = this.getPreviewNotReadyText(this.previewNotReadyReason);
      parts.push($localize`:@@dashboard.runtime.tooltip.reason:Reason: ${reason}:reason:`);
    }
    if (this.previewLoadStartedAt && this.previewState === 'loading') {
      const seconds = Math.max(1, Math.round((Date.now() - this.previewLoadStartedAt) / 1000));
      parts.push($localize`:@@dashboard.runtime.tooltip.recoveringFor:Recovering for ${seconds}:seconds: s`);
    }
    // Phase 276 STREAM-04: stream-state diagnostic counters. The four lines
    // below mirror the values already in this.* state; they make the live
    // pipeline state visible to the user without opening DevTools.
    const frameSeconds = this.lastFrameAgo();
    parts.push($localize`:@@dashboard.runtime.tooltip.lastFrame:last frame: ${frameSeconds}:seconds: s ago`);
    parts.push($localize`:@@dashboard.runtime.tooltip.mutations:mutations: ${this.mutationsAppliedTotal}:count:`);
    parts.push($localize`:@@dashboard.runtime.tooltip.applyFailures:apply failures: ${this.mutationApplyFailures}:count:`);
    parts.push($localize`:@@dashboard.runtime.tooltip.stale:stale: ${this.staleMutationCount}:count:`);
    this.previewTooltip.textContent = parts.join(' | ') || $localize`:@@dashboard.runtime.tooltip.noData:No stream data`;
  }

  // ==================== WEBSOCKET ====================

  private connectWS(): void {
    this.disconnectWS();
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = proto + '//' + location.host + '/ws?key=' +
      encodeURIComponent(this.hashKey) + '&role=dashboard';

    this.ws = new WebSocket(wsUrl);
    this.setWsState('reconnecting');

    this.ws.onopen = () => {
      this.recordTransportEvent('ws-open', { readyState: this.ws?.readyState });
      this.wsReconnectDelay = 0;
      this.setWsState('connected');
      if (this.wsPingTimer) clearInterval(this.wsPingTimer);
      this.wsPingTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        }
      }, 20000);
      this.scheduleStreamRecovery('ws-open');
    };

    this.ws.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data);
        let msg: any;
        if (envelope._lz && envelope.d && typeof LZString !== 'undefined') {
          const decompressed = LZString.decompressFromBase64(envelope.d);
          if (!decompressed) {
            this.recordTransportError('message-parse-failed', 'Failed to decompress dashboard WS message');
            return;
          }
          msg = JSON.parse(decompressed);
        } else {
          msg = envelope;
        }
        this.recordTransportMessage('received', msg.type);
        this.handleWSMessage(msg);
      } catch (e: any) {
        this.recordTransportError('message-parse-failed', e.message, { context: 'parse' });
      }
    };

    this.ws.onclose = (e) => {
      this.clearMetrics();
      if (this.remoteControlOn || this.remoteControlRequestedAt) {
        this.setRemoteControl(false, { silent: true, source: 'ws-close' });
        this.lastRemoteControlState = {
          enabled: false,
          attached: false,
          tabId: this.activePreviewTabId,
          reason: 'dashboard-disconnected',
          ownership: 'none',
        };
        this.renderRemoteControlState(this.lastRemoteControlState, { skipToggleSync: true });
      }
      this.recordTransportEvent('ws-close', { closeCode: e.code, closeReason: e.reason || '' });
      this.extensionOnline = false;
      this.pageReady = false;
      this.clearPendingStreamRecovery();
      if (this.wsPingTimer) { clearInterval(this.wsPingTimer); this.wsPingTimer = null; }
      this.setWsState('disconnected');
      if (this.taskState === 'running') this.setTaskRecoveryPending(true, 'ws-disconnected');
      this.updateTaskOfflineState();
      if (this.previewState === 'streaming') this.setPreviewState('frozen-disconnect');
      else if (this.previewState === 'loading') this.setPreviewState('disconnected');
      this.scheduleWSReconnect();
    };

    this.ws.onerror = () => {};
  }

  private disconnectWS(): void {
    this.clearPendingStreamRecovery();
    this.clearRemoteControlRequestTimer();
    if (this.wsReconnectTimer) { clearTimeout(this.wsReconnectTimer); this.wsReconnectTimer = null; }
    if (this.wsPingTimer) { clearInterval(this.wsPingTimer); this.wsPingTimer = null; }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setWsState('disconnected');
  }

  private scheduleWSReconnect(): void {
    if (!this.hashKey) return;
    if (this.destroyed) return;
    if (this.wsReconnectDelay === 0) {
      this.wsReconnectDelay = 1000;
      this.recordTransportEvent('ws-reconnect-scheduled', { delayMs: 0 });
      this.connectWS();
      return;
    }
    this.recordTransportEvent('ws-reconnect-scheduled', { delayMs: this.wsReconnectDelay });
    this.wsReconnectTimer = setTimeout(() => { if (!this.destroyed) this.connectWS(); }, this.wsReconnectDelay);
    this.wsReconnectDelay = Math.min(this.wsReconnectDelay * 2, this.wsMaxReconnectDelay);
  }

  private setWsState(state: string): void {
    if (!this.sseStatusEl) return;
    const labels: Record<string, string> = {
      connected: this.dashboardCopy.wsConnected,
      disconnected: this.dashboardCopy.wsDisconnected,
      reconnecting: this.dashboardCopy.wsReconnecting,
    };
    this.sseStatusEl.textContent = labels[state] || state;
    this.sseStatusEl.className = 'dash-sse-badge ' +
      (state === 'connected' ? 'dash-sse-connected' :
       state === 'reconnecting' ? 'dash-sse-reconnecting' : 'dash-sse-disconnected');
  }

  private handleWSMessage(msg: any): void {
    if (msg.type === 'pong') return;

    if (msg.type === 'ext:task-progress') { this.updateTaskProgress(msg.payload); return; }
    if (msg.type === 'ext:task-complete') { this.handleTaskComplete(msg.payload); return; }

    // Phase 212 / NAV-01: feedback from dashboard-initiated navigation.
    if (msg.type === 'ext:navigate-result') {
      const navRes = msg.payload || {};
      if (!navRes.ok) {
        console.warn('[FSB-DASH] Navigate failed:', navRes.error || 'unknown', navRes.reason || '');
      } else if (navRes.url && this.previewUrlInput && document.activeElement !== this.previewUrlInput) {
        this.lastKnownStreamUrl = navRes.url;
        this.previewUrlInput.value = navRes.url;
      }
      return;
    }

    if (msg.type === 'ext:status') {
      const wasExtensionOnline = this.extensionOnline;
      this.extensionOnline = msg.payload?.online;
      if (!this.extensionOnline && this.taskState === 'running') {
        this.setTaskRecoveryPending(true, 'extension-offline');
      } else if (!wasExtensionOnline && this.extensionOnline && this.taskState === 'running' && this.activeTaskRunId) {
        this.setTaskRecoveryPending(true, 'extension-online');
      }
      this.updateTaskOfflineState();
      // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
      // if (this.agentCountEl) {
        // const countText = (this.stats.totalAgents || 0) + ' agent' + ((this.stats.totalAgents || 0) !== 1 ? 's' : '');
        // this.agentCountEl.textContent = countText + (this.extensionOnline ? '' : ' - extension offline');
      // }
      if (!wasExtensionOnline && this.extensionOnline) this.scheduleStreamRecovery('extension-online');
      if (!this.extensionOnline) this.pageReady = false;
      return;
    }

    if (msg.type === 'ext:snapshot') {
      const snapshot = msg.payload || {};
      const snapshotIntentActive = snapshot.streamIntentActive !== false;
      this.extensionOnline = true;
      // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
      // this.loadData();
      this.recordTransportEvent('snapshot-recovered', { type: 'ext:snapshot' });
      this.recordSnapshotRecovery({ type: 'ext:snapshot', status: snapshot.streamStatus || '' });
      if (snapshot.remoteControl) this.renderRemoteControlState(snapshot.remoteControl);
      this.applyRecoveredTaskState(snapshot);
      this.streamTabUrl = snapshot.streamTabUrl || '';
      this.activePreviewTabId = typeof snapshot.streamTabId === 'number' ? snapshot.streamTabId : this.activePreviewTabId;
      this.lastRecoveredStreamState = snapshot.streamStatus || this.lastRecoveredStreamState;
      this.previewNotReadyReason = snapshot.streamReason || '';

      if (!this.streamToggleOn) {
        this.clearPendingStreamRecovery();
        this.setPreviewState('paused');
      } else if (snapshot.streamStatus === 'not-ready') {
        this.pageReady = false;
        this.clearPendingStreamRecovery();
        this.setPreviewDisconnectedText(this.getPreviewNotReadyText(this.previewNotReadyReason));
        this.setPreviewState('disconnected');
      } else if (!snapshotIntentActive) {
        this.updatePreviewTooltip();
      } else if (snapshot.streamStatus === 'ready' || snapshot.streamStatus === 'recovering') {
        this.pageReady = snapshot.streamStatus === 'ready';
        this.previewLoadStartedAt = Date.now();
        this.setPreviewLoadingText(snapshot.streamStatus === 'recovering'
          ? this.dashboardCopy.previewRecoveringDetail
          : this.dashboardCopy.previewLoadingDetail);
        if (this.previewState !== 'streaming') this.setPreviewState('loading');
        if (!this.pendingStreamRecovery) this.armPreviewRecoveryWatchdog('snapshot:' + (snapshot.snapshotSource || 'unknown'));
      }
      this.updatePreviewTooltip();
      this.updateTaskOfflineState();
      this.renderTaskRecoveryStatus(snapshot.taskRunId || '', snapshot.taskSource || snapshot.snapshotSource || '');
      return;
    }

    // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
    // if (msg.type === 'ext:agent-run-progress') {
      // const rp = msg.payload || {};
      // if (rp.agentId === this.agentRunningId) {
        // if (this.detailRunBar) this.detailRunBar.style.width = (rp.progress || 0) + '%';
        // if (this.detailRunAction) this.detailRunAction.textContent = rp.action || 'Working...';
      // }
      // return;
    // }

    // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
    // if (msg.type === 'ext:agent-run-complete') {
      // const rc = msg.payload || {};
      // this.agentRunningId = null;
      // this.renderAgents();
      // if (rc.agentId === this.detailAgentId) {
        // if (this.detailRunNow) { (this.detailRunNow as HTMLButtonElement).disabled = false; this.detailRunNow.textContent = 'Run Now'; }
        // if (this.detailRunProgress) {
          // if (this.detailRunBar) {
            // this.detailRunBar.style.width = '100%';
            // this.detailRunBar.className = 'dash-task-bar-fill ' + (rc.success ? 'dash-task-bar-success' : 'dash-task-bar-failed');
          // }
          // if (this.detailRunAction) this.detailRunAction.textContent = rc.success ? 'Complete' : (rc.error || 'Failed');
          // setTimeout(() => { if (this.detailRunProgress) this.detailRunProgress.style.display = 'none'; }, 3000);
        // }
        // this.loadAgentStats(this.detailAgentId!);
        // this.loadDetailRuns(this.detailAgentId!, 0);
      // }
      // this.loadData();
      // return;
    // }

    if (msg.type === 'ext:dom-snapshot') { this.handleDOMSnapshot(msg.payload); return; }
    if (msg.type === 'ext:dom-mutations') { this.handleDOMMutations(msg.payload); return; }
    if (msg.type === 'ext:dom-scroll') { this.handleDOMScroll(msg.payload); return; }
    if (msg.type === 'ext:dom-overlay') { this.handleDOMOverlay(msg.payload); return; }
    if (msg.type === 'ext:dom-dialog') { this.handleDOMDialog(msg.payload); return; }
    if (msg.type === 'ext:dom-media') { this.handleDOMMedia(msg.payload); return; }
    if (msg.type === 'ext:dom-media-hint') { this.handleDOMMediaHint(msg.payload); return; }
    if (msg.type === 'ext:stream-state') { this.handleRecoveredStreamState(msg.payload || {}); return; }
    if (msg.type === 'ext:request-snapshot') {
      if (this.previewState !== 'frozen-complete') {
        this.requestPreviewResync(msg.payload?.reason || 'request-snapshot', msg.payload || {});
      }
      return;
    }
    if (msg.type === 'ext:remote-control-state' || msg.type === 'ext:ps-control-state') { this.renderRemoteControlState(msg.payload || {}); return; }
    if (msg.type === 'ext:metrics') { this.renderMetrics(msg.payload || {}); return; }

    if (msg.type === 'ext:page-ready') {
      this.recordTransportEvent('page-ready-received', { type: 'ext:page-ready' });
      this.pageReady = true;
      this.lastRecoveredStreamState = 'ready';
      this.previewNotReadyReason = '';
      this.streamTabUrl = msg.payload?.url || '';
      this.recordSnapshotRecovery({ type: 'ext:page-ready', status: 'ready', source: 'ext:page-ready' });
      if (this.streamToggleOn && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendDashboardWSMessage('dash:dom-stream-start', {});
        this.previewLoadStartedAt = Date.now();
        this.setPreviewLoadingText(this.dashboardCopy.previewLoadingDetail);
        if (this.previewState !== 'streaming') this.setPreviewState('loading');
        if (!this.pendingStreamRecovery) this.armPreviewRecoveryWatchdog('page-ready');
      }
      this.updatePreviewTooltip();
      return;
    }

    if (msg.type === 'ext:stream-tab-info') {
      const info = msg.payload || {};
      this.handleRecoveredStreamState({
        status: info.ready ? 'ready' : 'not-ready',
        reason: info.ready ? '' : 'restricted-tab',
        url: info.url || '',
        tabId: info.tabId || null,
        source: 'legacy:stream-tab-info',
      });
      return;
    }

    // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
    // if (msg.type === 'agent_updated' || msg.type === 'agent_deleted' || msg.type === 'run_completed') {
      // this.loadData();
      // if (msg.agentId && msg.agentId === this.detailAgentId) {
        // this.loadAgentStats(this.detailAgentId!);
        // this.loadDetailRuns(this.detailAgentId!, 0);
      // }
    // }
  }
//
  // ==================== POLLING FALLBACK ====================
//
  // private startPolling(): void {
    // this.stopPolling();
    // this.pollTimer = setInterval(() => { if (!this.destroyed) this.loadData(); }, this.POLL_INTERVAL);
  // }
//
  // private stopPolling(): void {
    // if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  // }

  // ==================== API HELPERS ====================

  private apiFetch(path: string, options?: any): Promise<any> {
    options = options || {};
    const url = this.API_BASE + path;
    return fetch(url, options).then(resp => {
      if (!resp.ok) {
        return resp.json().then(body => Promise.reject(body)).catch(() => {
          const status = resp.status;
          const error = $localize`:@@dashboard.runtime.api.requestFailed:Request failed with status ${status}:status:`;
          return Promise.reject({ error });
        });
      }
      return resp.json();
    });
  }

  // ==================== UTILITIES ====================

  private formatTime(isoStr: string): string {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
             ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return isoStr; }
  }

  private renderResultCard(container: HTMLElement | null, data: any, isSuccess: boolean): void {
    if (!container) return;
    let card = container.querySelector('.dash-result-card') as HTMLElement | null;
    if (!card) {
      card = document.createElement('div');
      card.className = 'dash-result-card';
      const firstInput = container.querySelector('.dash-task-input-again');
      if (firstInput) { container.insertBefore(card, firstInput); } else { container.appendChild(card); }
    }

    const taskStatus = data.taskStatus || (isSuccess ? 'success' : 'failed');
    const badgeClass = 'dash-result-badge-' + taskStatus;
    const badgeLabels: Record<string, string> = {
      success: this.dashboardCopy.resultSuccess,
      partial: this.dashboardCopy.resultPartial,
      failed: this.dashboardCopy.resultFailed,
      stopped: this.dashboardCopy.resultStopped,
    };
    const badgeLabel = badgeLabels[taskStatus] || taskStatus;

    const elapsed = data.elapsed || 0;
    const actionCount = data.actionCount || 0;
    const totalCost = data.totalCost || 0;
    const finalUrl = data.finalUrl || '';
    const summary = data.summary || '';
    const error = data.error || '';

    let html = '<div class="dash-result-card-header">';
    html += '<span class="dash-result-badge ' + badgeClass + '">' + this.escapeHtml(badgeLabel) + '</span>';
    html += '<span class="dash-result-elapsed">' + this.formatDuration(elapsed) + '</span>';
    html += '</div>';

    html += '<div class="dash-result-metrics">';
    html += '<div class="dash-result-metric"><span class="dash-result-metric-val">' + actionCount + '</span><span class="dash-result-metric-label">' + this.escapeHtml(this.dashboardCopy.resultActions) + '</span></div>';
    html += '<div class="dash-result-metric"><span class="dash-result-metric-val">$' + totalCost.toFixed(4) + '</span><span class="dash-result-metric-label">' + this.escapeHtml(this.dashboardCopy.resultCost) + '</span></div>';
    if (finalUrl) {
      const displayUrl = finalUrl.length > 50 ? finalUrl.substring(0, 50) + '...' : finalUrl;
      html += '<div class="dash-result-metric dash-result-metric-url"><span class="dash-result-metric-val"><a href="' + this.escapeHtml(finalUrl) + '" target="_blank" rel="noopener" title="' + this.escapeHtml(finalUrl) + '">' + this.escapeHtml(displayUrl) + '</a></span><span class="dash-result-metric-label">' + this.escapeHtml(this.dashboardCopy.resultFinalUrl) + '</span></div>';
    }
    html += '</div>';

    if (isSuccess && summary) {
      html += '<div class="dash-result-summary">' + this.escapeHtml(summary) + '</div>';
    } else if (!isSuccess && error) {
      html += '<div class="dash-result-error">' + this.escapeHtml(error) + '</div>';
    }

    card.innerHTML = html;

    const oldStatus = container.querySelector('.dash-task-status') as HTMLElement | null;
    const oldResult = container.querySelector('.dash-task-result') as HTMLElement | null;
    const oldError = container.querySelector('.dash-task-error') as HTMLElement | null;
    if (oldStatus) oldStatus.style.display = 'none';
    if (oldResult) oldResult.style.display = 'none';
    if (oldError) oldError.style.display = 'none';
  }

  private translateTaskPhase(phase: unknown): string {
    const value = typeof phase === 'string' ? phase.trim() : '';
    const helpers = this.getDashboardRuntimeStateHelpers();
    if (typeof helpers.translateProgressPhase === 'function') {
      return helpers.translateProgressPhase(value, this.dashboardCopy);
    }
    const labels: Record<string, string> = {
      navigation: this.dashboardCopy.phaseNavigating,
      navigating: this.dashboardCopy.phaseNavigating,
      extraction: this.dashboardCopy.phaseReading,
      reading: this.dashboardCopy.phaseReading,
      filling: this.dashboardCopy.phaseFilling,
      analyzing: this.dashboardCopy.phaseAnalyzing,
      thinking: this.dashboardCopy.phaseAnalyzing,
      planning: this.dashboardCopy.phasePlanning,
      acting: this.dashboardCopy.phaseActing,
      recovering: this.dashboardCopy.previewRecoveringLabel,
      writing: this.dashboardCopy.phaseWriting,
      switching_tab: this.dashboardCopy.phaseSwitchingTabs,
      'switching tabs': this.dashboardCopy.phaseSwitchingTabs,
      calling: this.dashboardCopy.phaseCallingApi,
      'calling api': this.dashboardCopy.phaseCallingApi,
      'trigger-watch': this.dashboardCopy.phaseWatchingTrigger,
      watching: this.dashboardCopy.phaseWatchingTrigger,
      'watching a trigger': this.dashboardCopy.phaseWatchingTrigger,
      waiting: this.dashboardCopy.phaseWaiting,
      complete: this.dashboardCopy.previewCompleteLabel,
      done: this.dashboardCopy.previewCompleteLabel,
      error: this.dashboardCopy.previewErrorLabel,
      cleared: this.dashboardCopy.previewHiddenLabel,
      hidden: this.dashboardCopy.previewHiddenLabel,
      unknown: this.dashboardCopy.phaseWorking,
      working: this.dashboardCopy.phaseWorking,
    };
    return ownRecordValue(labels, value.toLowerCase()) || value || this.dashboardCopy.phaseWorking;
  }

  private translateTaskAction(action: unknown): string {
    const value = typeof action === 'string' ? action.trim() : '';
    const helpers = this.getDashboardRuntimeStateHelpers();
    if (typeof helpers.translateProgressDetail === 'function') {
      return helpers.translateProgressDetail(value, this.dashboardCopy);
    }
    const step = value.match(/^Step (\d+)\/(\d+):\s*(.+)$/i);
    if (step) return `${step[1]}/${step[2]}: ${this.translateTaskAction(step[3])}`;
    const known: Record<string, string> = {
      'task completed': this.dashboardCopy.progressTaskCompleted,
      'task partially completed': this.dashboardCopy.progressTaskPartiallyCompleted,
      'task ended with an error': this.dashboardCopy.progressTaskError,
      'task stopped': this.dashboardCopy.taskStopped,
      'reviewing page state': this.dashboardCopy.progressReviewingPage,
      'planning next step': this.dashboardCopy.progressPlanningNextStep,
      'planning next browser step': this.dashboardCopy.progressPlanningNextStep,
      'performing browser action': this.dashboardCopy.progressPerformingAction,
      'recovering from interruption': this.dashboardCopy.progressRecoveringInterruption,
      'updating page': this.dashboardCopy.progressUpdatingPage,
      'switching to another tab': this.dashboardCopy.progressSwitchingTab,
      'watching dom for change': this.dashboardCopy.progressWatchingDom,
      'reconnect or send another progress update': this.dashboardCopy.progressReconnectOrUpdate,
      'switched tab -- preparing next step...': this.dashboardCopy.progressSwitchingTab,
      'ready to begin': this.dashboardCopy.phasePlanning,
      'waiting for mcp client': this.dashboardCopy.phaseWaiting,
      working: this.dashboardCopy.phaseWorking,
      'working...': this.dashboardCopy.phaseWorking,
    };
    const normalized = value.toLowerCase();
    const knownAction = ownRecordValue(known, normalized);
    if (knownAction) return knownAction;
    return PACKAGE_OWNED_TASK_ACTIONS.has(normalized)
      ? this.dashboardCopy.progressPerformingAction
      : value;
  }

  private formatTaskEta(eta: unknown): string {
    const raw = typeof eta === 'number' ? String(Math.max(0, Math.round(eta))) + 's' : String(eta || '').trim();
    const match = raw.match(/^~?\s*(\d+)\s*(s|m)(?:\s+remaining)?$/i);
    if (!match) return this.dashboardCopy.etaPending;
    const amount = Number.parseInt(match[1], 10);
    return match[2].toLowerCase() === 'm'
      ? $localize`:@@dashboard.runtime.task.etaMinutes:~${amount}:minutes: min remaining`
      : $localize`:@@dashboard.runtime.task.etaSeconds:~${amount}:seconds: s remaining`;
  }

  private translateTaskError(errorCode: unknown, error: unknown, fallback: string): string {
    const helpers = this.getDashboardRuntimeStateHelpers();
    if (typeof helpers.translateTaskError === 'function') {
      return helpers.translateTaskError(errorCode, error, this.dashboardCopy) || fallback;
    }
    let code = typeof errorCode === 'string' ? errorCode.trim().toLowerCase() : '';
    const value = typeof error === 'string' ? error.trim() : '';
    if (!code) {
      const legacyCodes: Record<string, string> = {
        'no task provided': 'dashboard_task_missing',
        'another task is already running': 'dashboard_task_already_running',
        'no usable browser tab found for automation': 'dashboard_task_no_usable_tab',
        'failed to start automation': 'dashboard_task_start_failed',
      };
      code = ownRecordValue(legacyCodes, value.toLowerCase()) || '';
    }
    const known: Record<string, string> = {
      dashboard_task_missing: this.dashboardCopy.taskErrorMissing,
      dashboard_task_already_running: this.dashboardCopy.taskErrorAlreadyRunning,
      dashboard_task_no_usable_tab: this.dashboardCopy.taskErrorNoUsableTab,
      dashboard_task_start_failed: this.dashboardCopy.taskCouldNotStart,
      dashboard_task_start_exception: this.dashboardCopy.taskCouldNotStart,
    };
    return ownRecordValue(known, code) || value || fallback;
  }

  private translateRestrictedPageType(pageType: unknown): string {
    const value = typeof pageType === 'string' ? pageType.trim() : '';
    const helpers = this.getDashboardRuntimeStateHelpers();
    if (typeof helpers.translateRestrictedPageType === 'function') {
      return helpers.translateRestrictedPageType(value, this.dashboardCopy);
    }
    const known: Record<string, string> = {
      'chrome-internal': this.dashboardCopy.restrictedChromeInternalPage,
      'chrome internal page': this.dashboardCopy.restrictedChromeInternalPage,
      'chrome-extension': this.dashboardCopy.restrictedChromeExtensionPage,
      'chrome extension page': this.dashboardCopy.restrictedChromeExtensionPage,
      'edge-internal': this.dashboardCopy.restrictedEdgeInternalPage,
      'edge internal page': this.dashboardCopy.restrictedEdgeInternalPage,
      'browser-internal': this.dashboardCopy.restrictedBrowserInternalPage,
      'browser internal page': this.dashboardCopy.restrictedBrowserInternalPage,
      'local-file': this.dashboardCopy.restrictedLocalFile,
      'local file': this.dashboardCopy.restrictedLocalFile,
      restricted: this.dashboardCopy.restrictedPageType,
      'restricted page': this.dashboardCopy.restrictedPageType,
      'no-active-tab': this.dashboardCopy.restrictedNoActiveTab,
      'no active tab': this.dashboardCopy.restrictedNoActiveTab,
      'new-tab': this.dashboardCopy.newTab,
      'new tab': this.dashboardCopy.newTab,
    };
    return ownRecordValue(known, value.toLowerCase()) || value || this.dashboardCopy.newTab;
  }

  private pairingErrorMessage(code: unknown): string {
    switch (typeof code === 'string' ? code : '') {
      case 'pair_token_required':
        return this.dashboardCopy.qrMissingToken;
      case 'pair_token_invalid_or_expired':
        return this.dashboardCopy.qrInvalidOrExpired;
      case 'pair_token_already_used':
        return this.dashboardCopy.qrTokenUsed;
      case 'pair_token_expired':
        return this.dashboardCopy.qrTokenExpired;
      case 'pair_exchange_failed':
      default:
        return this.dashboardCopy.qrExchangeFailed;
    }
  }

  private formatRunningFor(ms: number): string {
    const duration = this.formatDuration(ms);
    return $localize`:@@dashboard.runtime.task.runningFor:Running for ${duration}:duration:`;
  }

  private formatStoppedTask(action: string): string {
    if (!action) return this.dashboardCopy.taskStopped;
    return $localize`:@@dashboard.runtime.task.stoppedWithAction:Stopped by user -- was: ${action}:action:`;
  }

  private translateStreamState(state: string): string {
    const labels: Record<string, string> = {
      hidden: this.dashboardCopy.previewHiddenLabel,
      ready: this.dashboardCopy.previewReadyLabel,
      streaming: this.dashboardCopy.previewStreamingLabel,
      recovering: this.dashboardCopy.previewRecoveringLabel,
      loading: this.dashboardCopy.previewLoadingLabel,
      paused: this.dashboardCopy.previewPausedLabel,
      disconnected: this.dashboardCopy.previewDisconnectedLabel,
      restricted: this.dashboardCopy.previewRestrictedLabel,
      'not-ready': this.dashboardCopy.previewNotReadyLabel,
      error: this.dashboardCopy.previewErrorLabel,
    };
    return ownRecordValue(labels, state) || state;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's';
  }

  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // private formatTimeAgo(isoStr: string): string {
    // if (!isoStr) return 'Never';
    // try {
      // const diff = Date.now() - new Date(isoStr).getTime();
      // if (diff < 60000) return 'Just now';
      // if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      // if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      // return Math.floor(diff / 86400000) + 'd ago';
    // } catch (_) { return isoStr; }
  // }
//
  // private formatNumber(n: number): string {
    // if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    // if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    // return String(n);
  // }
//
  // private formatScheduleLabel(scheduleType: string, scheduleConfig: any): string {
    // let config: any = {};
    // try { config = typeof scheduleConfig === 'string' ? JSON.parse(scheduleConfig) : (scheduleConfig || {}); } catch (_) {}
    // if (scheduleType === 'interval') {
      // const mins = config.intervalMinutes || 60;
      // if (mins >= 1440) return 'Every ' + Math.round(mins / 1440) + 'd';
      // if (mins >= 60) return 'Every ' + Math.round(mins / 60) + 'h';
      // return 'Every ' + mins + 'min';
    // }
    // if (scheduleType === 'daily') return 'Daily ' + (config.dailyTime || '08:00');
    // if (scheduleType === 'once') return 'Once';
    // return scheduleType || 'manual';
  // }

  private escapeHtml(str: string): string {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private escapeAttr(str: string): string {
    return this.escapeHtml(str).replace(/'/g, '&#39;');
  }

  private setTextById(id: string, text: string): void {
    const el = this.host.nativeElement.querySelector('#' + id);
    if (el) el.textContent = text;
  }
}
