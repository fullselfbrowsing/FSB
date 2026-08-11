'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const background = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
const sidepanel = fs.readFileSync(path.join(root, 'extension', 'ui', 'sidepanel.js'), 'utf8');
const visualFeedback = fs.readFileSync(path.join(root, 'extension', 'content', 'visual-feedback.js'), 'utf8');
const contentMessaging = fs.readFileSync(path.join(root, 'extension', 'content', 'messaging.js'), 'utf8');
const logger = fs.readFileSync(path.join(root, 'extension', 'utils', 'automation-logger.js'), 'utf8');
const recorder = fs.readFileSync(path.join(root, 'extension', 'utils', 'mcp-session-recorder.js'), 'utf8');
const replay = fs.readFileSync(path.join(root, 'extension', 'utils', 'lattice-replay.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
const dispatcher = fs.readFileSync(path.join(root, 'extension', 'ws', 'mcp-tool-dispatcher.js'), 'utf8');
const host = fs.readFileSync(path.join(root, 'extension', 'offscreen', 'lattice-host.js'), 'utf8');
const observability = fs.readFileSync(path.join(root, 'mcp', 'src', 'tools', 'observability.ts'), 'utf8');

let passed = 0;
function check(label, condition) {
  assert.equal(Boolean(condition), true, label);
  passed++;
  console.log('PASS', label);
}

function functionBody(source, name) {
  let start = source.indexOf('function ' + name + '(');
  if (start === -1) start = source.indexOf('async ' + name + '(');
  if (start === -1) start = source.indexOf(name + '(');
  assert.notEqual(start, -1, 'missing function ' + name);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error('unterminated function ' + name);
}

console.log('--- Lattice replay background/UI contract ---');

const start = functionBody(background, 'handleReplaySession');
const ownedTab = functionBody(background, 'fsbReplayCreateOwnedTab');
const additionalOwnedTab = functionBody(background, 'fsbReplayCreateAdditionalOwnedTab');
const waitForReplayTab = functionBody(background, 'fsbReplayWaitForTab');
const bootstrapTab = functionBody(background, 'fsbReplayBootstrapTab');
const ensureTargetTab = functionBody(background, 'fsbReplayEnsureTargetTab');
const target = functionBody(background, 'fsbReplayAssertTarget');
const dispatch = functionBody(background, 'fsbReplayDispatchStep');
const execute = functionBody(background, 'executeReplaySequence');
const handleClosedReplayTab = functionBody(background, 'fsbReplayHandleClosedTab');
const buildTimeline = functionBody(background, 'fsbReplayBuildTimeline');
const waitForPlayback = functionBody(background, 'fsbReplayWaitForPlayback');
const broadcastReplayOverlay = functionBody(background, 'fsbReplayBroadcastOverlay');
const finalizeReplay = functionBody(background, 'fsbReplayFinalize');
const replayControl = functionBody(background, 'handleReplayControl');
const progressOverlaySource = visualFeedback.slice(
  visualFeedback.indexOf('class ProgressOverlay'),
  visualFeedback.indexOf('class ReplayPlayerOverlay')
);
const replayPlayerSource = visualFeedback.slice(
  visualFeedback.indexOf('class ReplayPlayerOverlay'),
  visualFeedback.indexOf('// Singleton instance for progress overlay')
);
const renderReplayControls = functionBody(replayPlayerSource, 'update');
const scheduleReplayAutoHide = functionBody(replayPlayerSource, '_scheduleAutoHide');
const recovery = functionBody(background, 'fsbRestoreLatticeReplayCheckpoints');
const failedRecoveryCleanup = functionBody(background, 'fsbReplayCleanupFailedRecovery');
const reclaimTabs = functionBody(background, 'fsbReplayReclaimOwnedTabs');
const clearRecoverySnapshots = functionBody(background, 'fsbReplayClearRecoverySnapshots');
const releaseAgentId = functionBody(background, 'fsbReplayReleaseAgentId');
const releaseRecoveredTerminalAgent = functionBody(background, 'fsbReplayReleaseRecoveredTerminalAgent');
const checkpointState = functionBody(background, 'fsbReplayCheckpointState');
const failedStart = functionBody(background, 'fsbReplayAbortFailedStart');
const requestMcpReplay = functionBody(background, 'requestMcpSessionReplay');
const mutateMcpApprovals = functionBody(background, 'fsbMutatePendingMcpReplayApprovals');
const removeMcpApproval = functionBody(background, 'fsbRemovePendingMcpReplayApproval');
const approveMcpReplay = functionBody(background, 'fsbApprovePendingMcpReplay');
const startReplayUi = functionBody(sidepanel, 'startReplay');
const renderMcpApproval = functionBody(sidepanel, 'renderMcpReplayApproval');
const approveReplayCase = background.slice(
  background.indexOf("case 'approveMcpReplay':"),
  background.indexOf("case 'cancelMcpReplay':")
);
const cancelReplayCase = background.slice(
  background.indexOf("case 'cancelMcpReplay':"),
  background.indexOf("case 'replaySession':")
);
const replayData = logger.slice(
  logger.indexOf('async getReplayData('),
  logger.indexOf('async exportHumanReadable(')
);
const staleSessionCleanup = background.slice(
  background.indexOf('// Periodic cleanup of stale sessions'),
  background.indexOf('// Track content script ready status per tab')
);
const closedTabCleanup = background.slice(
  background.indexOf('// PERF: Clean up all state when a tab is closed'),
  background.indexOf('// Phase 237 -- registry tab-release hook.')
);

check('replay prepare and start are separate internal messages',
  background.includes("case 'prepareSessionReplay':") &&
  background.includes("case 'replaySession':") &&
  background.includes("case 'replayStepDecision':"));
check('execution and recovery decisions require an extension-page sender',
  background.includes('function fsbReplayIsTrustedUiSender(sender)') &&
  start.includes('!fsbReplayIsTrustedUiSender(sender)') &&
  functionBody(background, 'handleReplayStepDecision').includes('!fsbReplayIsTrustedUiSender(sender)'));
check('start verifies the preview hash before creating anything',
  start.indexOf('prepareSessionReplay') < start.indexOf('fsbReplayCreateOwnedTab') &&
  start.includes('request.manifestHash !== prepared.replay.manifestHash'));
check('replay startup is synchronously single-flight across concurrent UI approvals',
  start.includes('if (fsbReplayStartPending)') &&
  start.indexOf('fsbReplayStartPending = true') < start.indexOf('prepareSessionReplay') &&
  start.includes('finally') && start.includes('fsbReplayStartPending = false'));
check('bootstrap opens the first executable logical tab under its own mapping',
  start.includes('fsbReplayBootstrapTab(prepared)') &&
  start.includes('fsbReplayCreateOwnedTab(bootstrapTab.startUrl)') &&
  bootstrapTab.includes('fsbReplayIsExecutable(step)') &&
  bootstrapTab.includes('fsbReplayLogicalTab(step)') &&
  background.includes('replayTabs: bootstrapState ? { [bootstrapLogicalTab]: bootstrapState } : {}'));
check('replay never selects or targets the previously active tab',
  !start.includes('chrome.tabs.query') && !start.includes('activeTab'));
check('replay creates a fresh active recorded-site tab and binds ownership',
  ownedTab.includes('chrome.tabs.create({ url: startUrl, active: true })') &&
  ownedTab.includes('registry.registerAgent()') && ownedTab.includes('registry.bindTab'));
check('fresh replay tabs finish loading before injection without a pre-injection health check',
  waitForReplayTab.includes('pageLoadWatcher.waitForTabComplete') &&
  !waitForReplayTab.includes('pageLoadWatcher.waitForPageReady') &&
  waitForReplayTab.indexOf('waitForTabComplete') < waitForReplayTab.indexOf('ensureContentScriptInjected') &&
  waitForReplayTab.includes('injected !== true'));
check('each recorded logical tab is lazily created and owned by the replay agent',
  ensureTargetTab.includes('session.replayTabs?.[logicalTab]') &&
  ensureTargetTab.includes('fsbReplayCreateAdditionalOwnedTab') &&
  additionalOwnedTab.includes('chrome.tabs.create({ url: startUrl, active: active === true })') &&
  additionalOwnedTab.includes('registry.bindTab(session.replayAgentId, tab.id)'));
check('every executable step checks HTTP(S) target origin',
  target.includes('fsbReplayOrigin(currentUrl)') &&
  target.includes('currentOrigin !== expectedOrigin') &&
  execute.indexOf('fsbReplayAssertTarget') < execute.indexOf('fsbReplayDispatchStep'));
check('recorded tab-management steps use their mapped fresh tab instead of duplicating it',
  dispatch.includes("normalizedTool === 'open_tab'") &&
  dispatch.includes("normalizedTool === 'switch_tab'") &&
  dispatch.includes('chrome.tabs.update(targetState.tabId, { active: true })'));
check('closed replay tabs are marked and the primary target moves to a surviving owned tab',
  handleClosedReplayTab.includes('tab.closed = true') &&
  handleClosedReplayTab.includes('tab.ownershipToken = null') &&
  handleClosedReplayTab.includes('session.tabId = replacement?.tabId ?? null') &&
  handleClosedReplayTab.includes('session.expectedOrigin = replacement?.expectedOrigin ?? null') &&
  handleClosedReplayTab.includes('session.ownershipToken = replacement?.ownershipToken ?? null'));
check('tab removal and stale cleanup preserve replay sessions while close steps update immediately',
  closedTabCleanup.includes('if (fsbReplayHandleClosedTab(session, tabId)) continue;') &&
  staleSessionCleanup.includes('if (fsbReplayHandleClosedTab(session, closedTabId))') &&
  execute.includes('fsbReplayHandleClosedTab(session, target.tabState.tabId)') &&
  execute.indexOf('fsbReplayHandleClosedTab(session, target.tabState.tabId)') <
    execute.indexOf('delete session.replayTabs[logicalTab]'));
check('message, action/content/background, and CDP routes reuse shared handlers',
  dispatch.includes('hasMcpMessageRoute(step.tool)') &&
  dispatch.includes('mcpBridgeClient._handleExecuteAction') &&
  bridge.includes("toolDef && toolDef._route === 'cdp'") &&
  bridge.includes('executeCDPToolDirect({ tool: toolDef._cdpVerb, params }, tabId)'));
check('capability replay uses the existing capabilities-invoke message route',
  dispatch.includes("tool: 'mcp:capabilities-invoke'") &&
  background.includes("step.tool === 'mcp:capabilities-invoke'"));
check('Lattice permission verdict runs before every replay classification branch',
  execute.includes('authorizeReplayStep(step, session.approvedScopes)') &&
  execute.indexOf('authorizeReplayStep') < execute.indexOf('fsbReplayDispatchStep'));
check('blocked and redacted calls remain inspectable instead of executing',
  execute.includes("'blocked'") && execute.includes('!fsbReplayIsExecutable(step)'));
check('replay timing follows recorded timestamps with bounded gaps and an overlay lead-in',
  buildTimeline.includes('current.timestamp - previous.timestamp') &&
  buildTimeline.includes('FSB_REPLAY_MAX_RECORDED_GAP_MS') &&
  buildTimeline.includes('FSB_REPLAY_LEAD_IN_MS') &&
  execute.includes('fsbReplayWaitForPlayback(session, step, i)'));
check('playback waits are interruptible for pause, speed changes, and safe forward seeking',
  waitForPlayback.includes('playback.paused === true') &&
  waitForPlayback.includes('fsbReplayWaitForWake') &&
  waitForPlayback.includes('fsbReplayNormalizeSpeed(playback.speed)') &&
  replayControl.includes("command === 'pause'") &&
  replayControl.includes("command === 'play'") &&
  replayControl.includes("command === 'setSpeed'") &&
  replayControl.includes("command === 'seek'") &&
  replayControl.includes('can only seek forward'));
check('replay uses the regular FSB page overlay on every owned replay tab',
  broadcastReplayOverlay.includes('sendSessionStatus(tabId, statusData)') &&
  broadcastReplayOverlay.includes("clientLabel: 'Replay'") &&
  broadcastReplayOverlay.includes('stoppable: false') &&
  !broadcastReplayOverlay.includes('agentId:') &&
  !broadcastReplayOverlay.includes('`Step ${') &&
  background.includes("case 'controlReplay':"));
check('terminal replay overlay delivery completes before resource cleanup preserves its final display',
  finalizeReplay.includes('await fsbReplayBroadcastOverlay(') &&
  finalizeReplay.includes("cleanupSession(session.replaySessionId, { preserveFinalOverlay: true })") &&
  background.includes('if (!options.preserveFinalOverlay)') &&
  !failedStart.includes('preserveFinalOverlay') &&
  !failedRecoveryCleanup.includes('preserveFinalOverlay'));
check('the in-page replay player exposes play pause forward scrub and four speeds',
  visualFeedback.includes('class="fsb-replay-controls"') &&
  visualFeedback.includes('class="fsb-replay-scrubber"') &&
  visualFeedback.includes('<option value="0.5">0.5x</option>') &&
  visualFeedback.includes('<option value="4">4x</option>') &&
  renderReplayControls.includes("replay.status === 'paused'") &&
  visualFeedback.includes("command: 'seek'") &&
  visualFeedback.includes("command: 'setSpeed'"));
check('replay controls render in their own bottom-center top-layer host',
  replayPlayerSource.includes("this.host.id = 'fsb-replay-player-host'") &&
  replayPlayerSource.includes("this.host.setAttribute('data-fsb-overlay-role', 'replay-player-host')") &&
  replayPlayerSource.includes("left: 50% !important") &&
  replayPlayerSource.includes("bottom: max(16px, env(safe-area-inset-bottom)) !important") &&
  !progressOverlaySource.includes('fsb-replay-') &&
  contentMessaging.includes('FSB.replayPlayerOverlay.update(overlayState.replay, overlayState.lifecycle)'));
check('playing controls auto-hide after three seconds while a minimal rail remains',
  visualFeedback.includes('const REPLAY_PLAYER_HIDE_DELAY_MS = 3000') &&
  scheduleReplayAutoHide.includes('REPLAY_PLAYER_HIDE_DELAY_MS') &&
  replayPlayerSource.includes("classList.toggle('controls-hidden'") &&
  replayPlayerSource.includes('class="fsb-replay-minimal-track"') &&
  replayPlayerSource.includes("document.addEventListener('pointermove'") &&
  replayPlayerSource.includes('!this._scrubbing') &&
  replayPlayerSource.includes('!this._hovered') &&
  replayPlayerSource.includes('!this._focusWithin'));
check('terminal and cleared replay lifecycles destroy the standalone player',
  replayPlayerSource.includes('_scheduleTerminalRemoval()') &&
  replayPlayerSource.includes('this.destroy()') &&
  contentMessaging.includes("if (overlayState.lifecycle === 'cleared')") &&
  contentMessaging.includes('FSB.replayPlayerOverlay.destroy()'));
check('survivability persists before dispatch and after each step',
  execute.includes("fsbReplayPersistCheckpoint(session, 'BEFORE_TOOL_EXECUTION', step)") &&
  execute.includes("fsbReplayPersistCheckpoint(session, 'BEFORE_NEXT_ITERATION_SCHEDULE', step)"));
check('survivability snapshots contain stable recovery data but no ownership secret',
  checkpointState.includes('manifestHash: session.manifestHash') &&
  checkpointState.includes('approvedScopes: session.approvedScopes.slice()') &&
  checkpointState.includes('logicalTabs: Object.values(session.replayTabs || {})') &&
  checkpointState.includes('tab.closed !== true') &&
  checkpointState.includes('playback: fsbReplayPlaybackSnapshot(session)') &&
  checkpointState.includes('_currentStepName: marker') &&
  !checkpointState.includes('ownershipToken'));
check('recovery reclaims every surviving logical tab under one replay agent',
  recovery.includes('fsbReplayReclaimOwnedTabs(state,') &&
  reclaimTabs.includes('for (const item of recorded)') &&
  reclaimTabs.includes('Array.isArray(state.logicalTabs)') &&
  !reclaimTabs.includes('state.logicalTabs.length > 0') &&
  reclaimTabs.indexOf('eligibleTabs.push') < reclaimTabs.indexOf('fsbReplayReclaimOwnedTab') &&
  reclaimTabs.includes('replayTabs[logicalTab]') &&
  reclaimTabs.includes('allowMissingCloseLogicalTab') &&
  reclaimTabs.includes('closed: true') &&
  reclaimTabs.includes('tab: null') &&
  reclaimTabs.includes('tab.id === state.targetTabId') &&
  reclaimTabs.includes('bootstrapLogicalTab') &&
  reclaimTabs.includes("releaseAgent(failedAgentId, 'replay_recovery_failed')") &&
  !reclaimTabs.includes('chrome.tabs.remove'));
check('mid-write recovery pauses for explicit Retry Skip Stop',
  recovery.includes("resumePolicy === 'ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH'") &&
  recovery.includes('fsbReplayPauseForDecision') &&
  sidepanel.includes("['retry', 'skip', 'stop']"));
check('a recovered missing close target retries as an idempotent no-op',
  target.includes("normalizedTool === 'close_tab'") && target.includes('tabState.closed === true') &&
  dispatch.includes("normalizedTool === 'close_tab'") && dispatch.includes('alreadyClosed: true'));
check('terminal replay checkpoints release ownership and clear before any reclaim retry',
  recovery.includes('FSB_REPLAY_TERMINAL_STATUSES.has(persistedRun.status)') &&
  recovery.indexOf('FSB_REPLAY_TERMINAL_STATUSES.has') < recovery.indexOf('fsbReplayReclaimOwnedTabs') &&
  recovery.indexOf('fsbReplayReleaseRecoveredTerminalAgent(state.replayAgentId)') <
    recovery.indexOf('fsbReplayClearRecoverySnapshots(state.replaySessionId)') &&
  releaseRecoveredTerminalAgent.includes("fsbReplayReleaseAgentId(agentId, 'replay_terminal')") &&
  releaseAgentId.includes('registry.releaseAgent(agentId, reason)') &&
  releaseAgentId.includes('registry.hasAgent(agentId)') &&
  releaseAgentId.includes('return false') &&
  recovery.includes('fsbReplayClearRecoverySnapshots(state.replaySessionId)') &&
  clearRecoverySnapshots.includes('createFsbLatticeRuntimeAdapter') &&
  clearRecoverySnapshots.includes('clearSnapshots'));
check('failed recovery always releases runtime ownership and removes its registered session',
  recovery.includes('let reclaimedOwned = null') &&
  recovery.includes('let recoveredSession = null') &&
  recovery.includes('fsbReplayCleanupFailedRecovery(') &&
  failedRecoveryCleanup.includes("session.status = 'replay_failed'") &&
  failedRecoveryCleanup.includes('checkpointAgentId') &&
  failedRecoveryCleanup.includes('fsbReplayReleaseAgentId(') &&
  failedRecoveryCleanup.includes('return ownershipReleased') &&
  failedRecoveryCleanup.includes('cleanupSession(replaySessionId)') &&
  failedRecoveryCleanup.includes('activeSessions.delete(replaySessionId)') &&
  failedRecoveryCleanup.includes('stopKeepAlive()') &&
  recovery.indexOf('fsbReplayCleanupFailedRecovery(') <
    recovery.lastIndexOf('fsbReplayClearRecoverySnapshots(state.replaySessionId)'));
check('terminal cleanup only clears durable snapshots after ownership release',
  finalizeReplay.includes('terminalPersisted && ownershipReleased') &&
  finalizeReplay.indexOf('fsbReplayReleaseAgent(session)') < finalizeReplay.indexOf('clearSnapshots()') &&
  failedStart.includes('terminalPersisted && ownershipReleased') &&
  failedStart.indexOf("fsbReplayReleaseAgent(session, 'replay_start_failed')") < failedStart.indexOf('clearSnapshots()'));
check('live receipts chain and persist drift comparison',
  background.includes('sourceReceiptCid: session.sourceReceiptCid') &&
  background.includes('previousReceiptCid: session.previousReceiptCid') &&
  background.includes('recordedResultHash === checkpoint.resultHash'));
check('capture and live receipts hash normalized results without persisting result bodies',
  host.includes('normalizeReplayResult(result || {})') &&
  host.includes('resultSummary: priorResultSummary, ...persistedStep') &&
  host.includes('resultHashVersion: "fsb-normalized-result/v1"'));
check('recorder sanitizes its in-memory manifest input before persistence',
  recorder.includes('requestPayload: _sanitizeRequestPayload(payload, entry.response)') &&
  recorder.includes('redactedInputs: entry.redactedInputs === true') &&
  replay.includes("entry.inputState === 'redacted'"));
check('session details read persisted manifests and never transient actionRecords',
  replayData.includes('session.replay') && replayData.includes('manifest?.steps') &&
  !replayData.includes('actionRecords'));
check('side panel renders verified preview before requesting start',
  sidepanel.indexOf('renderReplayPreview(preview)') <
  sidepanel.indexOf("action: 'replaySession'"));
check('history replay uses one exact-manifest confirmation for all approved scopes',
  (startReplayUi.match(/\bconfirm\s*\(/g) || []).length === 1 &&
  startReplayUi.includes('exact signed manifest') &&
  startReplayUi.includes("approvedScopes.push('write')") &&
  startReplayUi.includes("approvedScopes.push('step:' + step.id)"));
check('MCP replay requests never ask the user to open pages and coalesce duplicate approvals',
  observability.includes('never ask the user to open target pages manually') &&
  requestMcpReplay.includes('Target pages will open automatically after approval') &&
  requestMcpReplay.includes('fsbMutatePendingMcpReplayApprovals') &&
  requestMcpReplay.includes('const existing = approvals.find'));
check('MCP replay approval mutations serialize fresh storage read-modify-write cycles',
  mutateMcpApprovals.includes('fsbPendingMcpReplayApprovalTail.then(run, run)') &&
  mutateMcpApprovals.includes('chrome.storage.session.get(FSB_PENDING_MCP_REPLAY_KEY)') &&
  mutateMcpApprovals.includes('item.expiresAt > now') &&
  mutateMcpApprovals.includes('fsbWritePendingMcpReplayApprovals(approvals)') &&
  removeMcpApproval.includes('fsbMutatePendingMcpReplayApprovals') &&
  cancelReplayCase.includes('fsbRemovePendingMcpReplayApproval(request.requestId)'));
check('MCP replay is gated by a persistent side-panel approval card',
  background.includes("case 'getPendingMcpReplayApprovals':") &&
  background.includes("case 'approveMcpReplay':") &&
  background.includes("case 'cancelMcpReplay':") &&
  renderMcpApproval.includes("approve.textContent = 'Approve replay'") &&
  renderMcpApproval.includes("action: 'approveMcpReplay'") &&
  dispatcher.includes("'mcp:replay-session'") &&
  dispatcher.includes('requestMcpSessionReplay(payload.sessionId)'));
check('a failed replay start keeps its exact approval request retryable',
  approveReplayCase.includes('fsbApprovePendingMcpReplay(request, sender)') &&
  approveMcpReplay.indexOf('handleReplaySession') < approveMcpReplay.indexOf('replayResponse.success === true') &&
  approveMcpReplay.indexOf('replayResponse.success === true') < approveMcpReplay.indexOf('fsbRemovePendingMcpReplayApproval') &&
  !approveMcpReplay.includes('fsbWritePendingMcpReplayApprovals'));
check('paused recovery remains actionable after the side panel is reopened',
  background.includes('pendingDecision: pausedStep ?') &&
  sidepanel.includes('if (preview.pendingDecision)') &&
  sidepanel.includes('renderReplayDecisionPrompt(preview.pendingDecision)'));
check('failed replay startup releases ownership and removes only its fresh tab',
  failedStart.includes("fsbReplayReleaseAgentId(owned.agentId, 'replay_start_failed')") &&
  failedStart.includes('chrome.tabs.remove(owned.tab.id)'));
check('replaying and paused sessions remain live to the side-panel liveness probe',
  background.includes("['running', 'replaying', 'replay_paused'].includes(session.status)"));
check('legacy expired and new idle-timeout sessions display as Idle-closed',
  (sidepanel.match(/Idle-closed/g) || []).length >= 2 &&
  recorder.includes("reason: 'idle_timeout'"));
check('private signing key names stay out of replay storage/messages/logging code',
  ![background, sidepanel, logger, recorder, replay].some((source) => source.includes('privateKeyJwk')));
check('the legacy action whitelist and rerunLive are absent',
  !background.includes('replayableTools = new Set') &&
  !background.includes('rerunLive') && !replay.includes('rerunLive'));

console.log('Summary:', passed, 'passed');
