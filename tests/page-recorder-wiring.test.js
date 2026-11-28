'use strict';

// The page recorder's hooks into the rest of the extension: MCP bridge,
// Autopilot loop, visual-session lifecycle and the service worker. These are
// one-line calls that a refactor could drop without any recorder test noticing.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const bridge = read('extension/ws/mcp-bridge-client.js');
const agentLoop = read('extension/ai/agent-loop.js');
const background = read('extension/background.js');

function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start !== -1, 'found ' + signature);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unbalanced ' + signature);
}

function extractTopLevel(source, name) {
  const asyncSig = 'async function ' + name + '(';
  const syncSig = 'function ' + name + '(';
  return functionBody(source, source.includes(asyncSig) ? asyncSig : syncSig);
}

test('the MCP bridge notes action start after the visual-session tick and end when it records the action', () => {
  const tick = functionBody(bridge, 'async _recordVisualSessionTickIfPresent(');
  assert.match(tick, /await fsbNotePageRecordingStart\(tabId, agentId, payload, sidecar\);\s*\}$/);
  const record = functionBody(bridge, '_recordMcpSessionAction(payload, response, resolvedTabId, targetContext) {');
  assert.match(record, /^_recordMcpSessionAction\([^)]*\) \{\s*fsbNotePageRecordingEnd\(payload, response, resolvedTabId\);/);
  const execute = functionBody(bridge, 'async _handleExecuteAction(');
  assert.ok(!/fsbNotePageRecording/.test(execute), '_handleExecuteAction itself stays untouched (source-window pins)');
});

test('the bridge helpers map the MCP payload and never throw', async () => {
  const calls = [];
  const ctx = { globalThis: null, Number };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(extractTopLevel(bridge, 'fsbNotePageRecordingStart') + '\n' + extractTopLevel(bridge, 'fsbNotePageRecordingEnd'), ctx);
  await ctx.fsbNotePageRecordingStart(7, 'agent-1', { recordingRunId: 'run-1', recordingCallId: 'call-9', tool: 'click' }, { visualReason: 'Clicking Buy' });
  assert.equal(calls.length, 0, 'no host loaded: a no-op');
  ctx.FsbPageRecorderHost = {
    noteActionStart: async (input) => { calls.push(['start', JSON.parse(JSON.stringify(input))]); },
    noteActionEnd: (input) => { calls.push(['end', JSON.parse(JSON.stringify(input))]); }
  };
  await ctx.fsbNotePageRecordingStart(7, 'agent-1', { recordingRunId: 'run-1', recordingCallId: 'call-9', tool: 'click' }, { visualReason: 'Clicking Buy' });
  ctx.fsbNotePageRecordingEnd({ agentId: 'agent-1', recordingRunId: 'run-1', recordingCallId: 'call-9', tool: 'click' }, { success: false }, '7');
  assert.deepEqual(calls[0], ['start', { driver: 'mcp', tabId: 7, agentId: 'agent-1', recordingRunId: 'run-1', actionId: 'call-9', tool: 'click', reason: 'Clicking Buy' }]);
  assert.deepEqual(calls[1], ['end', { tabId: 7, agentId: 'agent-1', recordingRunId: 'run-1', actionId: 'call-9', tool: 'click', success: false }]);
  ctx.FsbPageRecorderHost = { noteActionStart: async () => { throw new Error('boom'); }, noteActionEnd: () => { throw new Error('boom'); } };
  await ctx.fsbNotePageRecordingStart(7, 'a', {}, {});
  ctx.fsbNotePageRecordingEnd({}, {}, 7);
});

test('the Autopilot loop notes each tool call around execution and finalizes after the last frame', () => {
  const startAt = agentLoop.indexOf("driver: 'autopilot',");
  const executeAt = agentLoop.indexOf('result = await _executeTool(call.name, call.args, actionOpenerTabId, {');
  assert.ok(startAt !== -1 && executeAt !== -1 && startAt < executeAt, 'noteActionStart runs before _executeTool');
  assert.match(agentLoop, /toolResults\.push\(\{ callId: call\.id, name: call\.name, result: result \}\);\s*if \(globalThis\.FsbPageRecorderHost\) \{\s*try \{\s*globalThis\.FsbPageRecorderHost\.noteActionEnd\(\{\s*tabId: session\.tabId,/);
  assert.match(agentLoop, /await sleep\(900\);[\s\S]{0,300}finalizeAutopilotSession\(sid\)/);
});

test('the service worker loads the recorder and follows history deletes and session cleanup', () => {
  assert.match(background, /importScripts\('utils\/page-recording-store\.js', 'utils\/page-recorder-host\.js'\)/);
  assert.ok(background.indexOf("importScripts('utils/mcp-session-recorder.js')") < background.indexOf("'utils/page-recorder-host.js'"),
    'loaded after the MCP recorder whose patterns it reuses');
  assert.match(background, /FsbPageRecorderHost\.onHistoryDeleted\(\[sessionId\]\)/);
  assert.match(background, /FsbPageRecorderHost\.onHistoryCleared\(\)/);
  const cleanupAt = background.indexOf('async function cleanupSession(');
  const finalizeAt = background.indexOf('FsbPageRecorderHost.finalizeAutopilotSession(sessionId)', cleanupAt);
  const deleteAt = background.indexOf('activeSessions.delete(sessionId);', cleanupAt);
  assert.ok(cleanupAt !== -1 && finalizeAt > cleanupAt && finalizeAt < deleteAt,
    'cleanupSession finalizes an Autopilot recording before dropping the session');
  assert.ok(!/dom-stream|domStream|phantom-stream/.test(background), 'no retired live-preview tokens (dashboard-sunset)');
});

test('clearing a visual session ends that tab\'s recording track', async () => {
  const session = new Map([['mcpVisualSession:5', { tabId: 5, agentId: 'agent-1', client: 'Claude Code', deadlineAt: Date.now() + 60_000 }]]);
  const cleared = [];
  global.chrome = {
    storage: { session: {
      async get(key) { return session.has(key) ? { [key]: session.get(key) } : {}; },
      async set(values) { Object.entries(values).forEach(([k, v]) => session.set(k, v)); },
      async remove(key) { session.delete(key); }
    } },
    alarms: { async clear() { return true; }, async create() {} }
  };
  global.FsbPageRecorderHost = { onVisualSessionCleared: (entry, reason) => cleared.push([entry.tabId, reason]) };
  try {
    delete require.cache[require.resolve('../extension/utils/mcp-visual-session-lifecycle.js')];
    const lifecycle = require('../extension/utils/mcp-visual-session-lifecycle.js');
    const storageKey = lifecycle.storageKeyForTab ? lifecycle.storageKeyForTab(5) : 'mcpVisualSession:5';
    if (storageKey !== 'mcpVisualSession:5') session.set(storageKey, session.get('mcpVisualSession:5'));
    const result = await lifecycle.clearVisualSession(5, { reason: 'is_final', skipBroadcast: true });
    assert.equal(result.action, 'cleared');
    assert.deepEqual(cleared, [[5, 'is_final']]);
    const noop = await lifecycle.clearVisualSession(5, { reason: 'timeout', skipBroadcast: true });
    assert.equal(noop.action, 'noop');
    assert.equal(cleared.length, 1, 'no entry, no track end');
  } finally {
    delete global.chrome;
    delete global.FsbPageRecorderHost;
  }
});
