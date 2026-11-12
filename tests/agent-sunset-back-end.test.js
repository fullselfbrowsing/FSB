/**
 * Background-agents retirement: back-end checks.
 *
 * Background agents were removed in v0.9.45rc1. These checks keep the
 * leftovers from coming back and prove the update-time cleanup works:
 *   - The agent modules, the MCP agent-tools module and every commented-out
 *     agent code path are gone.
 *   - On extension update, background.js deletes the saved agent data
 *     (bgAgents, fsb_sync_queue, the old notice flag) and clears every
 *     fsb_agent_* alarm, leaving other storage keys and alarms alone.
 *   - The alarm listener still returns early for the MCP reconnect alarm
 *     and keeps the dom-stream watchdog branch live.
 *
 * Plain Node + assert. Static checks plus one sandboxed run of the cleanup.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const RETIRED_ANNOTATION = 'DEPRECATED v0.9.45rc1';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

let failures = 0;
function pass(label) { console.log('PASS - ' + label); }
function fail(label, detail) {
  failures += 1;
  console.log('FAIL - ' + label);
  if (detail) console.log('       ' + detail);
}

// ---- Section 1: the retired modules are deleted ----

for (const rel of [
  'extension/agents/agent-manager.js',
  'extension/agents/agent-scheduler.js',
  'extension/agents/agent-executor.js',
  'extension/agents/server-sync.js',
  'mcp/src/tools/agents.ts',
]) {
  if (!fs.existsSync(path.join(ROOT, rel))) pass(rel + ' is deleted');
  else fail(rel + ' still exists');
}

{
  const src = read('mcp/src/runtime.ts');
  if (!/registerAgentTools|tools\/agents\.js/.test(src)) pass('runtime.ts no longer imports or calls registerAgentTools');
  else fail('runtime.ts still references the agent tools module');
}

// ---- Section 2: no commented-out agent code is left behind ----

const sourceFiles = [
  'extension/background.js',
  'extension/ws/ws-client.js',
  'extension/ws/mcp-bridge-client.js',
  'extension/ui/popup.js',
  'extension/ui/sidepanel.js',
  'extension/ui/options.js',
  'extension/ui/options.css',
  'extension/ui/control_panel.html',
];

for (const rel of sourceFiles) {
  const src = read(rel);
  if (!src.includes(RETIRED_ANNOTATION)) pass('no retired-agent annotation left in ' + rel);
  else fail('retired-agent annotation still present in ' + rel);
}

{
  const src = read('extension/background.js');
  const leftovers = ['agentScheduler', 'agentManager', 'agentExecutor', 'serverSync.', 'executeAutomationTask']
    .filter((token) => src.includes(token));
  if (leftovers.length === 0) pass('background.js has no background-agent code paths');
  else fail('background.js still mentions retired agent code', leftovers.join(', '));
}

{
  const html = read('extension/ui/control_panel.html');
  const js = read('extension/ui/options.js');
  const gone = !html.includes('fsbSunsetNotice') && !js.includes('fsbSunsetNotice') && !js.includes('bgAgents');
  if (gone) pass('control panel no longer renders the old agent-names notice');
  else fail('control panel still carries the agent-names notice or reads bgAgents');
}

// ---- Section 3: the update-time cleanup ----

const bgSource = read('extension/background.js');

{
  const start = bgSource.indexOf('const RETIRED_AGENT_STORAGE_KEYS');
  const end = bgSource.indexOf('chrome.runtime.onInstalled.addListener(', start);
  if (start === -1 || end === -1) {
    fail('background.js defines the retired-agent cleanup before the onInstalled listener');
  } else {
    pass('background.js defines the retired-agent cleanup before the onInstalled listener');
    const cleanupSource = bgSource.slice(start, end);
    const removedKeys = [];
    const clearedAlarms = [];
    const sandbox = {
      console,
      chrome: {
        storage: {
          local: {
            remove: async (keys) => { removedKeys.push(...[].concat(keys)); },
          },
        },
        alarms: {
          getAll: async () => [
            { name: 'fsb_agent_daily-digest' },
            { name: 'fsb_agent_price-watch' },
            { name: 'fsb-mcp-bridge-reconnect' },
            { name: 'fsb-telemetry-beat' },
            { name: 'fsbTrigger:abc' },
          ],
          clear: async (name) => { clearedAlarms.push(name); return true; },
        },
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(cleanupSource + '\nthis.__cleanup = clearRetiredBackgroundAgentData;', sandbox);

    sandbox.__cleanup().then(() => {
      assert.deepStrictEqual(removedKeys.slice().sort(),
        ['bgAgents', 'fsb_sunset_notice_dismissed', 'fsb_sync_queue']);
      pass('cleanup removes bgAgents, fsb_sync_queue and the old notice flag');
      assert.deepStrictEqual(clearedAlarms.slice().sort(),
        ['fsb_agent_daily-digest', 'fsb_agent_price-watch']);
      pass('cleanup clears only fsb_agent_* alarms');
    }).catch((error) => {
      fail('cleanup run', error && error.message);
    }).finally(finish);
  }
}

{
  const listenerStart = bgSource.indexOf('chrome.runtime.onInstalled.addListener(async (details) => {');
  const listenerEnd = bgSource.indexOf('\n});', listenerStart);
  const listener = listenerStart === -1 ? '' : bgSource.slice(listenerStart, listenerEnd);
  if (/if \(details && details\.reason === 'update'\) \{\s*await clearRetiredBackgroundAgentData\(\);/.test(listener)) {
    pass('onInstalled runs the cleanup on extension update only');
  } else {
    fail('onInstalled does not gate the cleanup on reason === "update"');
  }
}

// ---- Section 4: MCP_RECONNECT_ALARM early-return preserved byte-for-byte ----

{
  const expected = '  if (isMcpReconnectAlarm) {\n    armMcpBridge(\'alarm:\' + MCP_RECONNECT_ALARM);\n    return;\n  }';
  if (bgSource.indexOf(expected) !== -1) pass('MCP_RECONNECT_ALARM early-return byte-for-byte preserved');
  else fail('MCP_RECONNECT_ALARM early-return path mutated or missing', 'Expected substring not found');
}

// ---- Section 5: dom-stream watchdog branch preserved on a live line ----

{
  const lines = bgSource.split('\n');
  const hits = lines.filter(line => /if\s*\(alarm\.name\s*===\s*'fsb-domstream-watchdog'\)/.test(line));
  const liveHits = hits.filter(line => !/^\s*\/\//.test(line));
  if (liveHits.length === 1) pass('dom-stream watchdog branch is live (and unique)');
  else fail('expected exactly 1 live dom-stream watchdog hit, found ' + liveHits.length);
}

// ---- Result ----

let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  console.log('');
  if (failures === 0) {
    console.log('All background-agent retirement checks PASSED');
    process.exit(0);
  }
  console.log(failures + ' check(s) FAILED');
  process.exit(1);
}

if (bgSource.indexOf('const RETIRED_AGENT_STORAGE_KEYS') === -1) finish();
