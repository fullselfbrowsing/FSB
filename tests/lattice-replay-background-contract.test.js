'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const background = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
const sidepanel = fs.readFileSync(path.join(root, 'extension', 'ui', 'sidepanel.js'), 'utf8');
const logger = fs.readFileSync(path.join(root, 'extension', 'utils', 'automation-logger.js'), 'utf8');
const recorder = fs.readFileSync(path.join(root, 'extension', 'utils', 'mcp-session-recorder.js'), 'utf8');
const replay = fs.readFileSync(path.join(root, 'extension', 'utils', 'lattice-replay.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
const host = fs.readFileSync(path.join(root, 'extension', 'offscreen', 'lattice-host.js'), 'utf8');

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
const target = functionBody(background, 'fsbReplayAssertTarget');
const dispatch = functionBody(background, 'fsbReplayDispatchStep');
const execute = functionBody(background, 'executeReplaySequence');
const recovery = functionBody(background, 'fsbRestoreLatticeReplayCheckpoints');
const checkpointState = functionBody(background, 'fsbReplayCheckpointState');
const failedStart = functionBody(background, 'fsbReplayAbortFailedStart');
const replayData = logger.slice(
  logger.indexOf('async getReplayData('),
  logger.indexOf('async exportHumanReadable(')
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
check('replay never selects or targets the previously active tab',
  !start.includes('chrome.tabs.query') && !start.includes('activeTab'));
check('replay creates a fresh active recorded-site tab and binds ownership',
  ownedTab.includes('chrome.tabs.create({ url: startUrl, active: true })') &&
  ownedTab.includes('registry.registerAgent()') && ownedTab.includes('registry.bindTab'));
check('every executable step checks HTTP(S) target origin',
  target.includes('fsbReplayOrigin(currentUrl)') &&
  target.includes('currentOrigin !== expectedOrigin') &&
  execute.indexOf('fsbReplayAssertTarget') < execute.indexOf('fsbReplayDispatchStep'));
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
check('survivability persists before dispatch and after each step',
  execute.includes("fsbReplayPersistCheckpoint(session, 'BEFORE_TOOL_EXECUTION', step)") &&
  execute.includes("fsbReplayPersistCheckpoint(session, 'BEFORE_NEXT_ITERATION_SCHEDULE', step)"));
check('survivability snapshots contain stable recovery data but no ownership secret',
  checkpointState.includes('manifestHash: session.manifestHash') &&
  checkpointState.includes('approvedScopes: session.approvedScopes.slice()') &&
  checkpointState.includes('_currentStepName: marker') &&
  !checkpointState.includes('ownershipToken'));
check('mid-write recovery pauses for explicit Retry Skip Stop',
  recovery.includes("resumePolicy === 'ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH'") &&
  recovery.includes('fsbReplayPauseForDecision') &&
  sidepanel.includes("['retry', 'skip', 'stop']"));
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
check('risk UI provides one write confirmation and per-step approvals',
  sidepanel.includes("approvedScopes.push('write')") &&
  sidepanel.includes("approvedScopes.push('step:' + step.id)"));
check('paused recovery remains actionable after the side panel is reopened',
  background.includes('pendingDecision: pausedStep ?') &&
  sidepanel.includes('if (preview.pendingDecision)') &&
  sidepanel.includes('renderReplayDecisionPrompt(preview.pendingDecision)'));
check('failed replay startup releases ownership and removes only its fresh tab',
  failedStart.includes("releaseAgent(owned.agentId, 'replay_start_failed')") &&
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
