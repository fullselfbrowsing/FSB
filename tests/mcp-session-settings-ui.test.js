/**
 * Advanced Settings contract for local, secret-redacted MCP replay recording.
 * Run: node tests/mcp-session-settings-ui.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OPTIONS_PATH = path.resolve(__dirname, '..', 'extension', 'ui', 'options.js');
const HTML_PATH = path.resolve(__dirname, '..', 'extension', 'ui', 'control_panel.html');
const SIDEPANEL_PATH = path.resolve(__dirname, '..', 'extension', 'ui', 'sidepanel.js');
const BACKGROUND_PATH = path.resolve(__dirname, '..', 'extension', 'background.js');
const options = fs.readFileSync(OPTIONS_PATH, 'utf8');
const html = fs.readFileSync(HTML_PATH, 'utf8');
const sidepanel = fs.readFileSync(SIDEPANEL_PATH, 'utf8');
const background = fs.readFileSync(BACKGROUND_PATH, 'utf8');

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed++;
    console.log('  PASS:', message);
  } else {
    failed++;
    console.error('  FAIL:', message);
  }
}

console.log('--- MCP replay Advanced Settings contract ---');

check(/fsbMcpSessionRecordingEnabled\s*:\s*true/.test(options),
  'recording default is true');
check(/fsbMcpSessionRetentionDays\s*:\s*30\b/.test(options),
  'retention default is 30 days');
check(options.includes("getElementById('fsbMcpSessionRecordingEnabled')"),
  'cacheElements wires the recording toggle');
check(options.includes("getElementById('fsbMcpSessionRetentionDays')"),
  'cacheElements wires the retention input');
check(/fsbMcpSessionRecordingEnabled\.checked\s*=\s*settings\.fsbMcpSessionRecordingEnabled\s*!==\s*false/.test(options),
  'loadSettings defaults the toggle on when the key is absent');
check(/clampMcpSessionRetentionDays\(settings\.fsbMcpSessionRetentionDays\)/.test(options),
  'loadSettings clamps persisted retention before painting');
check(/fsbMcpSessionRecordingEnabled\s*:\s*elements\.fsbMcpSessionRecordingEnabled\?\.checked\s*\?\?\s*true/.test(options),
  'saveSettings persists the recording toggle');
check(/fsbMcpSessionRetentionDays\s*:\s*clampMcpSessionRetentionDays\(elements\.fsbMcpSessionRetentionDays\?\.value\)/.test(options),
  'saveSettings clamps and persists retention days');

check(/id=["']fsbMcpSessionRecordingEnabled["'][^>]*checked/.test(html),
  'Advanced Settings includes a checked recording toggle');
check(/id=["']fsbMcpSessionRetentionDays["']/.test(html),
  'Advanced Settings includes the retention input');
check(/data-min=["']1["'][^>]*data-max=["']365["']/.test(html),
  'retention stepper declares the 1-365 range');
check(/id=["']fsbMcpSessionRetentionDays["'][^>]*value=["']30["']/.test(html),
  'retention input displays the 30-day default');
check(/typed text/i.test(html) && /action results/i.test(html) && /locally/i.test(html),
  'disclosure says typed text and action results are stored locally');
check(/redacting secret-bearing fields/i.test(html) && /sensitive inputs/i.test(html),
  'disclosure clearly states the replay redaction boundary');
check(/no separate AI-provider call is made/i.test(html) && /local task memory/i.test(html),
  'disclosure explains the client-authored, provider-free memory handoff');
check(/Autopilot history is unaffected/i.test(html) && /Autopilot history is never pruned/i.test(html),
  'copy limits opt-out and retention behavior to MCP history');
check(/up to the 50 most recent sessions/i.test(html) &&
      /no session is kept longer than the configured retention period/i.test(html),
  'copy discloses both the MCP history capacity and retention-age limits');
check(!/existing MCP sessions remain until their retention period expires/i.test(html),
  'copy no longer promises that every session survives until age expiry');

const helperMatch = options.match(/function clampMcpSessionRetentionDays\(value\)\s*\{[\s\S]*?\n\}/);
check(!!helperMatch, 'retention clamp helper exists');
if (helperMatch) {
  const sandbox = { defaultSettings: { fsbMcpSessionRetentionDays: 30 }, result: null };
  vm.createContext(sandbox);
  vm.runInContext(helperMatch[0] + '\nresult = clampMcpSessionRetentionDays;', sandbox);
  const clamp = sandbox.result;
  check(clamp(0) === 1, 'clamp enforces minimum 1 day');
  check(clamp(999) === 365, 'clamp enforces maximum 365 days');
  check(clamp(30.9) === 30, 'clamp floors to an integer');
  check(clamp('not-a-number') === 30, 'invalid retention falls back to 30 days');
}

console.log('\n--- Session history deletion delegation contract ---');

const optionsDeleteStart = options.indexOf('async function deleteSession(sessionId)');
const optionsDeleteEnd = options.indexOf('/**\n * Clear all saved sessions', optionsDeleteStart);
const optionsDelete = options.slice(optionsDeleteStart, optionsDeleteEnd);
const optionsClearStart = options.indexOf('async function clearAllSessions()', optionsDeleteEnd);
const optionsClearEnd = options.indexOf('// Session functions are now accessed', optionsClearStart);
const optionsClear = options.slice(optionsClearStart, optionsClearEnd);
const sidepanelDeleteStart = sidepanel.indexOf('async function deleteHistorySession(sessionId)');
const sidepanelDeleteEnd = sidepanel.indexOf('async function loadSessionView', sidepanelDeleteStart);
const sidepanelDelete = sidepanel.slice(sidepanelDeleteStart, sidepanelDeleteEnd);
const sidepanelClearStart = sidepanel.indexOf('async function clearAllHistorySessions()');
const sidepanelClearEnd = sidepanel.indexOf('function formatSessionDate', sidepanelClearStart);
const sidepanelClear = sidepanel.slice(sidepanelClearStart, sidepanelClearEnd);

check(optionsDelete.includes("action: 'deleteSessionHistory'") &&
      sidepanelDelete.includes("action: 'deleteSessionHistory'"),
  'both history UIs delegate individual deletion to the service worker');
check(optionsClear.includes("action: 'clearSessionHistory'") &&
      sidepanelClear.includes("action: 'clearSessionHistory'"),
  'both history UIs delegate clear-all to the service worker');
check(!/chrome\.storage\.local\.(?:set|remove)/.test(optionsDelete + optionsClear + sidepanelDelete + sidepanelClear),
  'history UIs no longer mutate session storage directly');
check(optionsDelete.indexOf('if (!response?.success)') < optionsDelete.indexOf('loadSessionList()') &&
      sidepanelDelete.indexOf('if (!response?.success)') < sidepanelDelete.indexOf('loadHistoryList()'),
  'individual-delete views refresh only after a successful response');
check(optionsClear.indexOf('if (!response?.success)') < optionsClear.indexOf('loadSessionList()') &&
      sidepanelClear.indexOf('if (!response?.success)') < sidepanelClear.indexOf('loadHistoryList()'),
  'clear-all views refresh only after a successful response');
check(/case 'deleteSessionHistory':[\s\S]*automationLogger\.deleteSession\(sessionId\)/.test(background),
  'background deletion action uses the race-safe automation logger path');
check(/case 'clearSessionHistory':[\s\S]*automationLogger\.clearAllSessions\(\)/.test(background),
  'background clear-all action uses the race-safe automation logger path');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
