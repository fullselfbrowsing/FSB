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
const options = fs.readFileSync(OPTIONS_PATH, 'utf8');
const html = fs.readFileSync(HTML_PATH, 'utf8');

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

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
