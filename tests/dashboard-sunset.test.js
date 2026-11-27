/**
 * Live Dashboard retirement checks.
 *
 * v0.9.95 was the last version with the Live Dashboard: the extension's
 * relay to fsb-server, DOM streaming for the live preview, remote control
 * from the web, and the control panel's Sync tab with hash-key and QR
 * pairing. These checks keep that code from coming back and prove the
 * update-time cleanup works:
 *   - The relay, streaming and pairing files are deleted, and nothing in the
 *     service worker loads or references them.
 *   - On extension update, background.js deletes the relay settings, the
 *     toolbar icon's relay-seen flag and the live-preview watchdog alarm.
 *   - The control panel has no Sync tab. The background-agents note now sits
 *     in Help, and old #sync links land there.
 *   - The toolbar icon no longer dims for a missing relay.
 *   - The absence guards from the earlier Sync consolidation checks still
 *     hold.
 *
 * Each area has its own section so new areas can be appended.
 *
 * Plain Node + assert + fs. Static checks plus sandboxed runs of the cleanup
 * and of the control panel's section-id normalizer.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function countSubstring(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

// Returns the source of a top-level function, from its declaration line to
// the first closing brace at column zero.
function sliceTopLevelFunction(source, declaration) {
  const start = source.indexOf(declaration);
  if (start === -1) return '';
  const end = source.indexOf('\n}\n', start);
  if (end === -1) return '';
  return source.slice(start, end + 2);
}

let failures = 0;
function pass(label) { console.log('PASS - ' + label); }
function fail(label, detail) {
  failures += 1;
  console.log('FAIL - ' + label);
  if (detail) console.log('       ' + detail);
}
function check(condition, label, detail) {
  if (condition) pass(label);
  else fail(label, detail);
}

const pending = [];

// ---- Section 1: extension -- the relay, streaming and pairing files are deleted ----

for (const rel of [
  'extension/ws/ws-client.js',
  'extension/ws/phantom-stream-protocol.js',
  'extension/ws/phantom-stream-protocol-entry.js',
  'extension/content/dom-stream.js',
  'extension/content/phantom-stream-capture.js',
  'extension/content/phantom-stream-capture-entry.js',
  'extension/lib/lz-string.min.js',
  'extension/ui/lib/qrcode-generator.min.js',
]) {
  check(!fs.existsSync(path.join(ROOT, rel)), rel + ' is deleted');
}

{
  // esbuild must not regenerate the deleted bundles on the next build.
  const src = read('esbuild.config.js');
  check(!/phantom-stream-(capture|protocol)/.test(src),
    'esbuild.config.js has no capture or protocol bundle entry for the extension');
}

// ---- Section 2: extension -- the service worker no longer carries the relay ----

const bgSource = read('extension/background.js');
const CLEANUP_START_MARKER = 'const RETIRED_DASHBOARD_STORAGE_KEYS';
const CLEANUP_FUNCTION = 'async function clearRetiredDashboardData() {';

// The cleanup block is the one place allowed to name the retired storage
// keys and the watchdog alarm. It runs from the key list to the end of the
// cleanup function.
const cleanupStart = bgSource.indexOf(CLEANUP_START_MARKER);
const cleanupFunction = sliceTopLevelFunction(bgSource, CLEANUP_FUNCTION);
const cleanupFunctionStart = bgSource.indexOf(CLEANUP_FUNCTION);
const cleanupEnd = cleanupFunction ? cleanupFunctionStart + cleanupFunction.length : -1;
const cleanupSource = (cleanupStart !== -1 && cleanupEnd > cleanupStart)
  ? bgSource.slice(cleanupStart, cleanupEnd)
  : '';

{
  const outsideCleanup = cleanupSource
    ? bgSource.slice(0, cleanupStart) + bgSource.slice(cleanupEnd)
    : bgSource;
  const retiredTokens = [
    'ws-client',
    'lz-string',
    'dom-stream',
    'domStream',
    'DomStream',
    'phantom-stream',
    'fsbWebSocket',
    'broadcastDashboardProgress',
    '_getDashboardTaskRecoverySnapshot',
    '_lastDashboardTaskResult',
    '_bgRemoteControlStateCache',
    'normalizeDashboardServerUrlForSync',
    'getRemoteControlState',
    'remoteControlStateChanged',
    'reconnectDashboardWebSocket',
    'getDashboardWebSocketStatus',
    'fsb-domstream-watchdog',
    'serverHashKey',
    'serverSyncEnabled',
    'changes.serverUrl',
    'fsbActionIconRelaySeen',
  ];
  const leftovers = retiredTokens.filter((token) => outsideCleanup.includes(token));
  check(leftovers.length === 0,
    'background.js names no relay, streaming or remote-control code outside the cleanup block',
    'found: ' + leftovers.join(', '));
  check(!/source\s*===\s*'dashboard'/.test(bgSource),
    'handleStartAutomation has no dashboard task-source branch');
  check(/source\s*===\s*'mcp'/.test(bgSource),
    'handleStartAutomation still recognises MCP-started tasks');
  check(/case 'automationComplete':\s*(?:\/\/[^\n]*\n\s*)*break;/.test(bgSource),
    "case 'automationComplete' keeps its label and only breaks");
}

{
  // The loads that sat next to the relay stay, each exactly once.
  const kept = [
    'utils/diagnostics-ring-buffer.js',
    'utils/redactForLog.js',
    'utils/agent-protocol-drift-diagnostics.js',
    'utils/action-icon.js',
    'ws/mcp-tool-dispatcher.js',
    'ws/mcp-bridge-client.js',
  ];
  const wrong = kept.filter((rel) => countSubstring(bgSource, "importScripts('" + rel + "')") !== 1);
  check(wrong.length === 0, 'the service worker still loads its neighbouring modules exactly once',
    'not loaded exactly once: ' + wrong.join(', '));
}

{
  // The MCP reconnect branch is unchanged and is now the last thing the
  // alarm listener does.
  const expected = '  const isMcpReconnectAlarm =\n'
    + "    typeof MCP_RECONNECT_ALARM !== 'undefined' &&\n"
    + '    alarm.name === MCP_RECONNECT_ALARM;\n'
    + '\n'
    + '  if (isMcpReconnectAlarm) {\n'
    + "    armMcpBridge('alarm:' + MCP_RECONNECT_ALARM);\n"
    + '    return;\n'
    + '  }\n'
    + '});';
  check(countSubstring(bgSource, expected) === 1,
    'the alarm listener ends with the unchanged MCP reconnect branch');
}

// ---- Section 3: extension -- content scripts carry no streaming code ----

{
  const match = bgSource.match(/CONTENT_SCRIPT_FILES\s*=\s*\[([\s\S]*?)\]/);
  if (!match) {
    fail('background.js defines CONTENT_SCRIPT_FILES');
  } else {
    const entries = match[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .split(',')
      .map((entry) => entry.trim().replace(/^['"]/, '').replace(/['"]$/, ''))
      .filter(Boolean);
    const streaming = entries.filter((entry) => /dom-stream|phantom-stream/.test(entry));
    check(streaming.length === 0, 'CONTENT_SCRIPT_FILES lists no streaming content script',
      'found: ' + streaming.join(', '));
    check(entries.includes('content/visual-feedback.js') && entries.includes('content/messaging.js'),
      'CONTENT_SCRIPT_FILES still injects visual-feedback.js and messaging.js');
  }
}

{
  const src = read('extension/content/visual-feedback.js');
  check(!src.includes('domStream') && !src.includes('getStreamState'),
    'visual-feedback.js no longer talks to the live-preview stream');
}

{
  const src = read('extension/ai/agent-loop.js');
  check(!src.includes('broadcastDashboardProgress'), 'agent-loop.js has no dashboard progress hook');
}

{
  const leftovers = ['extension/config/config.js', 'extension/config/init-config.js']
    .filter((rel) => /serverUrl|serverHashKey|serverSyncEnabled/.test(read(rel)));
  check(leftovers.length === 0, 'the config defaults no longer carry relay settings',
    'found in: ' + leftovers.join(', '));
}

// ---- Section 4: extension -- the update-time cleanup ----

{
  const listenerStart = bgSource.indexOf('chrome.runtime.onInstalled.addListener(async (details) => {');
  if (!cleanupSource || listenerStart === -1 || cleanupEnd > listenerStart) {
    fail('background.js defines the dashboard cleanup before the onInstalled listener');
  } else {
    pass('background.js defines the dashboard cleanup before the onInstalled listener');

    const makeSandbox = (removeImpl) => {
      const calls = { removed: [], cleared: [], warnings: [] };
      const sandbox = {
        console: {
          log() {},
          warn: (...args) => { calls.warnings.push(args.join(' ')); },
          error() {},
        },
        chrome: {
          storage: {
            local: {
              remove: async (keys) => {
                calls.removed.push(...[].concat(keys));
                if (removeImpl) await removeImpl();
              },
            },
          },
          alarms: {
            clear: async (name) => { calls.cleared.push(name); return true; },
          },
        },
      };
      vm.createContext(sandbox);
      vm.runInContext(cleanupSource + '\nthis.__cleanup = clearRetiredDashboardData;', sandbox);
      return { sandbox, calls };
    };

    const runCleanup = (label, removeImpl) => {
      try {
        const run = makeSandbox(removeImpl);
        return { run, done: Promise.resolve(run.sandbox.__cleanup()) };
      } catch (error) {
        fail(label + ': the cleanup block does not evaluate on its own', error && error.message);
        return null;
      }
    };

    const happyRun = runCleanup('cleanup run', null);
    const happy = happyRun && happyRun.run;
    if (happyRun) pending.push(happyRun.done.then(() => {
      assert.deepStrictEqual(happy.calls.removed.slice().sort(),
        ['fsbActionIconRelaySeen', 'serverHashKey', 'serverSyncEnabled', 'serverUrl']);
      pass('cleanup removes exactly the relay settings and the icon relay-seen flag');
      assert.deepStrictEqual(happy.calls.cleared, ['fsb-domstream-watchdog']);
      pass('cleanup clears only the live-preview watchdog alarm');
      assert.strictEqual(happy.calls.warnings.length, 0);
      pass('cleanup is quiet when storage succeeds');
    }).catch((error) => {
      fail('cleanup run', error && error.message);
    }));

    const failingRun = runCleanup('cleanup failure run', async () => { throw new Error('storage unavailable'); });
    const failing = failingRun && failingRun.run;
    if (failingRun) pending.push(failingRun.done.then(() => {
      assert.strictEqual(failing.calls.warnings.length, 1);
      pass('cleanup swallows a storage failure and only warns');
    }).catch((error) => {
      fail('cleanup rejects when storage fails', error && error.message);
    }));
  }
}

{
  const listenerStart = bgSource.indexOf('chrome.runtime.onInstalled.addListener(async (details) => {');
  const listenerEnd = bgSource.indexOf('\n});', listenerStart);
  const listener = listenerStart === -1 ? '' : bgSource.slice(listenerStart, listenerEnd);
  check(/if \(details && details\.reason === 'update'\) \{\s*await clearRetiredBackgroundAgentData\(\);\s*await clearRetiredDashboardData\(\);\s*\}/.test(listener),
    'onInstalled runs the dashboard cleanup on update, right after the background-agent cleanup');
  check(countSubstring(bgSource, 'await clearRetiredDashboardData();') === 1,
    'the dashboard cleanup has exactly one call site');
}

// ---- Section 5: extension -- the control panel has no Sync tab ----

const controlPanel = read('extension/ui/control_panel.html');
const optionsSource = read('extension/ui/options.js');

{
  check(!/<section[^>]*id="sync"/.test(controlPanel), 'control_panel.html has no #sync section');
  check(!controlPanel.includes('data-section="sync"'), 'control_panel.html has no Sync nav item');
  check(!controlPanel.includes('href="#sync"'), 'control_panel.html has no in-page link to #sync');
  check(!/qrcode/i.test(controlPanel), 'control_panel.html loads no QR code library');
  const pairingIds = ['btnPairDashboard', 'btnGenerateHashKey', 'btnCopyHashKey', 'btnCancelPairing', 'pairingQR'];
  const leftovers = pairingIds.filter((id) => controlPanel.includes(id));
  check(leftovers.length === 0, 'control_panel.html renders no pairing controls', 'found: ' + leftovers.join(', '));
}

{
  const help = (controlPanel.match(/<section[^>]*id="help"[\s\S]*?<\/section>/) || [''])[0];
  const headline = 'Background agents have left the building';
  check(countSubstring(controlPanel, headline) === 1, 'the background-agents note appears exactly once');
  check(help.includes(headline), 'the background-agents note sits inside section#help');
  check(help.indexOf('class="help-grid"') !== -1 && help.indexOf('class="help-grid"') < help.indexOf(headline),
    'the note follows the Help cards');
  check(/href="https:\/\/github\.com\/openclaw\/openclaw"[^>]*rel="noopener noreferrer"/.test(help)
      && /href="https:\/\/www\.anthropic\.com\/claude\/routines"[^>]*rel="noopener noreferrer"/.test(help),
    'both note links stay in Help with rel="noopener noreferrer"');
  check(/Retired in v0\.9\.45rc1/.test(help) && /April 2026/.test(help),
    'the note footer still names v0.9.45rc1 and April 2026');
}

{
  const css = read('extension/ui/options.css');
  check(/\.sync-deprecation\s*\{/.test(css), 'options.css still styles the background-agents note');
  const leftovers = ['.pairing-qr', '.sync-key-row', '.sync-section-header', 'pairingPulse']
    .filter((token) => css.includes(token));
  check(leftovers.length === 0, 'options.css has no pairing or Sync row styles', 'found: ' + leftovers.join(', '));
}

{
  const retired = [
    'initializeSyncSection',
    'initializeSyncDeprecationAndButtons',
    'FSB_DEFAULT_SERVER_URL',
    'serverHashKey',
    'serverSyncEnabled',
    'getRemoteControlState',
    'remoteControlStateChanged',
    'reconnectDashboardWebSocket',
    'getDashboardWebSocketStatus',
    'dashboardWsStatusChanged',
    'wsConnected',
    'qrcode(',
  ];
  const leftovers = retired.filter((token) => optionsSource.includes(token));
  check(leftovers.length === 0, 'options.js has no Sync, pairing or relay-status code', 'found: ' + leftovers.join(', '));
}

{
  const fnSource = sliceTopLevelFunction(optionsSource, 'function normalizeSectionId(sectionId) {');
  if (!fnSource) {
    fail('options.js defines normalizeSectionId');
  } else {
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(fnSource + '\nthis.__normalize = normalizeSectionId;', sandbox);
    const normalize = sandbox.__normalize;
    check(normalize('sync') === 'help', 'an old #sync link opens Help');
    check(normalize('providers') === 'api-config', 'the providers alias still opens api-config');
    check(normalize('help') === 'help' && normalize('dashboard') === 'dashboard',
      'other section ids pass through unchanged');
  }
}

{
  const src = read('extension/ui/onboarding.js');
  check(src.includes("openInternalPage('ui/control_panel.html#help')"), 'onboarding opens the control panel at #help');
  check(!src.includes('control_panel.html#sync'), 'onboarding no longer links to #sync');
}

// ---- Section 6: extension -- the toolbar icon no longer tracks the relay ----

{
  const src = read('extension/utils/action-icon.js');
  const leftovers = ['setConnected', 'fsbActionIconRelaySeen', "'idle:off'", "'watching:off'"]
    .filter((token) => src.includes(token));
  check(leftovers.length === 0, 'action-icon.js has no relay-dim state or setConnected export',
    'found: ' + leftovers.join(', '));
}

// ---- Section 7: guards carried over from the Sync consolidation checks ----

{
  const about = read('showcase/angular/src/app/pages/about/about-page.component.html');
  const support = read('showcase/angular/src/app/pages/support/support-page.component.html');

  check(!/<span>Remote Control <span class="feature-badge beta">Beta<\/span><\/span>/.test(controlPanel),
    'control_panel.html has no standalone "Remote Control <Beta>" nav label');
  check(!/<span>Agents <span class="feature-badge beta">Beta<\/span><\/span>/.test(controlPanel),
    'control_panel.html has no legacy "Agents <Beta>" nav label');
  check(!/data-section="background-agents"/.test(controlPanel),
    'no nav item references data-section="background-agents"');
  check(!/<section[^>]*id="background-agents"/.test(controlPanel),
    'no <section id="background-agents"> remains');
  check(!/<h2>Remote Control<\/h2>/.test(controlPanel),
    'no standalone "<h2>Remote Control</h2>" section header remains');
  check(!/id="fsbSunsetNotice/.test(controlPanel),
    'the retired agent-names notice is gone from the control panel');

  check(!/<i class="fa-solid fa-server"><\/i> Remote Control/.test(about),
    'about page has no old Remote Control sidebar label');
  check(!/Extension Control Surface|control-preview|rec-sidebar|rec-badge-beta/.test(about),
    'about page does not bring back the removed control-surface preview');
  check(!/<h4[^>]*>Remote Control<\/h4>/.test(about),
    'about page has no "Remote Control" architecture box');
  check(!/paired via QR/.test(about),
    'about page does not describe a QR-paired extension control surface');
  check(!/<h3>What is Remote Control\?<\/h3>/.test(support),
    'support page FAQ does not ask "What is Remote Control?"');
  check(!/<h3>What are Background Agents\?<\/h3>/.test(support),
    'support page FAQ does not ask "What are Background Agents?"');

  // Characters outside the Basic Multilingual Plane are a reliable proxy for
  // emoji, which the repo does not allow in UI files.
  const emojiRe = /[\u{10000}-\u{10FFFF}]/u;
  for (const [label, src] of [['control_panel.html', controlPanel], ['about page', about], ['support page', support]]) {
    check(!emojiRe.test(src), label + ' contains no emoji');
  }
}

// ---- Result ----

Promise.all(pending).then(() => {
  console.log('');
  if (failures === 0) {
    console.log('All Live Dashboard retirement checks PASSED');
    process.exit(0);
  }
  console.log(failures + ' check(s) FAILED');
  process.exit(1);
});
