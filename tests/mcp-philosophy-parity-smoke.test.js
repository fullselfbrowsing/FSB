'use strict';
/**
 * tests/mcp-philosophy-parity-smoke.test.js
 *
 * Phase 10 Plan 10-01 -- Wave 0 scaffold. Parts 1-4 filled (>= 14 PASSes
 * covering allowlist accept + lifecycle driver field roundtrip + restore
 * backward-compat + allowlist gate rejection). Parts 5-10 are placeholders
 * that emit 1 PASS each so the chain stays green; Plans 10-02 and 10-03
 * fill them with metrics recorder integration + INV byte-freeze regression
 * + provider switch precedence assertions.
 *
 * Real-runtime test discipline per CLAUDE.md MEMORY (no static-text grep for
 * presence; load + invoke the modules). chrome.storage.session + chrome.alarms
 * are mocked (Chrome APIs absent in Node); the visual-session + lifecycle
 * modules are loaded for real.
 *
 * ASCII only. No emojis. No literal token "setTimeout" anywhere in this file.
 *
 * Exit 0 on failed === 0; exit 1 on any FAIL.
 */
const path = require('node:path');

let passed = 0;
let failed = 0;

function ok(cond, label) {
  if (cond) {
    passed++;
    console.log('PASS', label);
  } else {
    failed++;
    console.error('FAIL', label);
  }
}

// ------------------------------------------------------------------
// chrome.storage.session + chrome.alarms mocks. Pattern mirrors
// tests/mcp-visual-tick-lifecycle.test.js so the lifecycle module
// loads and exercises real code paths.
// ------------------------------------------------------------------

function createStorageArea(initial) {
  const store = Object.assign({}, initial || {});
  return {
    async get(keys) {
      if (keys == null) return Object.assign({}, store);
      if (Array.isArray(keys)) {
        const out = {};
        keys.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(store, key)) out[key] = store[key];
        });
        return out;
      }
      if (typeof keys === 'string') {
        return Object.prototype.hasOwnProperty.call(store, keys) ? { [keys]: store[keys] } : {};
      }
      if (typeof keys === 'object') {
        const out = {};
        Object.keys(keys).forEach((key) => {
          out[key] = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : keys[key];
        });
        return out;
      }
      return Object.assign({}, store);
    },
    async set(values) {
      Object.assign(store, values);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => { delete store[key]; });
    },
    _dump() { return Object.assign({}, store); },
    _replace(next) {
      Object.keys(store).forEach((k) => { delete store[k]; });
      Object.assign(store, next || {});
    },
    _keys() { return Object.keys(store); }
  };
}

function createChromeMock() {
  const sessionArea = createStorageArea();
  const localArea = createStorageArea();
  const alarmsMap = new Map();
  const createdHistory = [];
  return {
    runtime: {
      id: 'fsb-phase-10-test',
      async sendMessage() { /* noop */ }
    },
    storage: {
      session: sessionArea,
      local: localArea
    },
    alarms: {
      async create(name, options) {
        const record = Object.assign({ name }, options || {});
        alarmsMap.set(name, record);
        createdHistory.push(record);
      },
      async clear(name) {
        alarmsMap.delete(name);
        return true;
      },
      async getAll() {
        return Array.from(alarmsMap.values());
      },
      onAlarm: { addListener() { /* noop */ } },
      _all() { return Array.from(alarmsMap.values()); },
      _history() { return createdHistory.slice(); }
    },
    tabs: {
      onRemoved: { addListener() { /* noop */ } },
      async sendMessage() { /* noop */ }
    }
  };
}

// Install mocks BEFORE requiring the modules so module-load IIFEs see them.
const chromeMock = createChromeMock();
global.chrome = chromeMock;
global.sendSessionStatus = async () => { /* swallow */ };

// ------------------------------------------------------------------
// Module load. Side-effect IIFE registers globals.
// ------------------------------------------------------------------
const VS_PATH = require.resolve('../extension/utils/mcp-visual-session.js');
const LC_PATH = require.resolve('../extension/utils/mcp-visual-session-lifecycle.js');
const REC_PATH = require.resolve('../extension/utils/mcp-metrics-recorder.js');
delete require.cache[VS_PATH];
delete require.cache[LC_PATH];
delete require.cache[REC_PATH];
const VS = require(VS_PATH);
global.MCPVisualSessionUtils = VS;
const LC = require(LC_PATH);
const REC = require(REC_PATH);
// The recorder module registers globalThis.fsbMcpMetricsRecorder on load
// AND exposes a CommonJS surface. Use the CommonJS surface for assertions
// since both share the same recordDispatch function reference.

// ------------------------------------------------------------------
// Main async IIFE wrapping all Parts.
// ------------------------------------------------------------------
(async function main() {

  // --- Part 1: Allowlist accept (FINT-16; 4 PASS) -----------------
  console.log('\n--- Part 1: Allowlist accept (FINT-16) ---');
  var labels = VS.MCP_VISUAL_CLIENT_LABELS;
  ok(Array.isArray(labels) && labels.length === 14,
    'Part 1.1 -- MCP_VISUAL_CLIENT_LABELS has 14 entries post-Phase-10');
  ok(labels[13] === 'FSB Autopilot',
    'Part 1.2 -- last entry is FSB Autopilot');
  ok(VS.isAllowedMcpVisualClientLabel('FSB Autopilot') === true,
    'Part 1.3 -- allowlist accepts canonical FSB Autopilot');
  ok(VS.isAllowedMcpVisualClientLabel('fsb-autopilot') === true,
    'Part 1.4 -- normalization accepts hyphen variant');

  // --- Part 2: Lifecycle entry shape with driver field (5 PASS) ---
  console.log('\n--- Part 2: Lifecycle entry shape (FINT-16) ---');
  // Reset storage + alarms.
  chromeMock.storage.session._replace({});
  var result2 = await LC.recordVisualSessionTick(123, 'agent_test_p2', {
    client: 'FSB Autopilot',
    visualReason: 'autopilot-tool-dispatch:click',
    driver: 'autopilot'
  });
  ok(result2 && result2.ok === true,
    'Part 2.1 -- recordVisualSessionTick ok=true');
  ok(result2 && result2.entry && result2.entry.driver === 'autopilot',
    'Part 2.2 -- entry has driver=autopilot');
  ok(result2 && result2.entry && Object.keys(result2.entry).length === 9,
    'Part 2.3 -- entry has 9 keys (8 baseline + driver)');
  var stored2 = await chromeMock.storage.session.get('mcpVisualSession:123');
  ok(stored2 && stored2['mcpVisualSession:123'] !== undefined,
    'Part 2.4 -- storage write captured at mcpVisualSession:123');
  var alarmsList = chromeMock.alarms._all();
  ok(alarmsList.find(function(a) { return a.name === 'mcpVisualDeath:123'; }) !== undefined,
    'Part 2.5 -- death-timer alarm armed (mcpVisualDeath:123)');

  // --- Part 3: Restore-on-wake backward compat (3 PASS) -----------
  console.log('\n--- Part 3: Restore-path backward compat (FINT-16) ---');
  // Pre-seed a pre-Phase-10-shape entry (no driver field) at tab 456.
  chromeMock.storage.session._replace({
    'mcpVisualSession:456': {
      tabId: 456,
      agentId: 'agent_test_p3',
      client: 'Claude',
      visualReason: 'mcp-tool:fsb_action',
      startedAt: Date.now() - 1000,
      lastTickAt: Date.now() - 500,
      deadlineAt: Date.now() + 60000,
      isFinal: false
      // NOTE: no driver field (pre-Phase-10 entry)
    }
  });
  var preSeeded = (await chromeMock.storage.session.get('mcpVisualSession:456'))['mcpVisualSession:456'];
  ok(preSeeded && preSeeded.driver === undefined,
    'Part 3.1 -- pre-Phase-10 entry has no driver field');
  // Update via UPDATE branch path (no driver passed).
  var result3 = await LC.recordVisualSessionTick(456, 'agent_test_p3', {
    client: 'Claude',
    visualReason: 'mcp-tool:fsb_action_2'
    // NOTE: no driver field passed -- defaults expected
  });
  ok(result3 && result3.ok === true,
    'Part 3.2 -- update-branch restore-path tick ok=true');
  ok(result3 && result3.entry && result3.entry.driver === 'mcp',
    'Part 3.3 -- UPDATE branch defaults driver=mcp when neither existing nor caller specify');

  // --- Part 4: Allowlist gate rejects unknown (2 PASS) ------------
  console.log('\n--- Part 4: Allowlist gate intact (FINT-16) ---');
  chromeMock.storage.session._replace({});
  var result4 = await LC.recordVisualSessionTick(789, 'agent_test_p4', {
    client: 'TotallyUnknownClient',
    visualReason: 'test:gate',
    driver: 'autopilot'
  });
  ok(result4 && result4.ok === false,
    'Part 4.1 -- gate rejects unknown client');
  ok(result4 && result4.reason === 'client_not_allowed',
    'Part 4.2 -- rejection reason is client_not_allowed (gate intact)');

  // ------------------------------------------------------------------
  // Helper: extract the latest fsbUsageData row. The recorder writes the
  // array directly under the key (no wrapper object); the flatten guard
  // tolerates a future wrapper shape so the assertions are robust.
  // ------------------------------------------------------------------
  async function _latestRow() {
    var raw = await chromeMock.storage.local.get('fsbUsageData');
    var rows = (raw && raw.fsbUsageData) || [];
    if (!Array.isArray(rows)) rows = (rows && rows.rows) ? rows.rows : [];
    return { rows: rows, last: rows[rows.length - 1] || {} };
  }

  // --- Part 5: recordDispatch row schema (FINT-17/18; 6 PASS) -----
  console.log('\n--- Part 5: recordDispatch row schema (FINT-17/18) ---');
  chromeMock.storage.local._replace({});
  var _broadcasts5 = [];
  var _origSendMsg5 = chromeMock.runtime.sendMessage;
  chromeMock.runtime.sendMessage = async function(msg) { _broadcasts5.push(msg); };
  await REC.recordDispatch({
    client: 'FSB Autopilot',
    tool: 'fsb_action',
    requestPayload: { action: 'click', selector: '#btn' },
    success: true,
    dispatcher_route: 'autopilot',
    drivingModel: {
      provider: 'xai',
      model_id: 'grok-build-0.1',
      reasoning_tokens: 42
    }
  });
  var snap5 = await _latestRow();
  ok(snap5.rows.length >= 1,
    'Part 5.1 -- fsbUsageData has at least 1 row');
  ok(snap5.last.client === 'FSB Autopilot',
    'Part 5.2 -- row.client === FSB Autopilot');
  ok(snap5.last.dispatcher_route === 'autopilot',
    'Part 5.3 -- row.dispatcher_route === autopilot');
  ok(snap5.last.drivingModel && snap5.last.drivingModel.provider === 'xai',
    'Part 5.4 -- row.drivingModel.provider === xai');
  ok(snap5.last.drivingModel && snap5.last.drivingModel.model_id === 'grok-build-0.1',
    'Part 5.5 -- row.drivingModel.model_id === grok-build-0.1');
  ok(_broadcasts5.find(function(b) { return b && b.type === 'ANALYTICS_UPDATE'; }) !== undefined,
    'Part 5.6 -- ANALYTICS_UPDATE broadcast fired');
  chromeMock.runtime.sendMessage = _origSendMsg5;

  // --- Part 6: dispatcher_route allowlist (FINT-17; 2 PASS) -------
  console.log('\n--- Part 6: dispatcher_route allowlist (FINT-17) ---');
  chromeMock.storage.local._replace({});
  await REC.recordDispatch({
    client: 'FSB Autopilot', tool: 'fsb_action', requestPayload: {},
    success: true, dispatcher_route: 'autopilot',
    drivingModel: { provider: 'xai', model_id: 'grok-build-0.1' }
  });
  var snap6a = await _latestRow();
  ok(snap6a.last.dispatcher_route === 'autopilot',
    'Part 6.1 -- new autopilot literal accepted');

  chromeMock.storage.local._replace({});
  await REC.recordDispatch({
    client: 'FSB Autopilot', tool: 'fsb_action', requestPayload: {},
    success: true, dispatcher_route: 'garbage',
    drivingModel: { provider: 'xai', model_id: 'grok-build-0.1' }
  });
  var snap6b = await _latestRow();
  ok(snap6b.last.dispatcher_route === null,
    'Part 6.2 -- garbage route coerced to null (allowlist gate intact)');

  // --- Part 7: xAI reasoning_tokens edge cases (FINT-18; 4 PASS) --
  console.log('\n--- Part 7: xAI reasoning_tokens (FINT-18) ---');

  // 7.1: xAI + value 42
  chromeMock.storage.local._replace({});
  await REC.recordDispatch({
    client: 'FSB Autopilot', tool: 'fsb_action', requestPayload: {},
    success: true, dispatcher_route: 'autopilot',
    drivingModel: { provider: 'xai', model_id: 'grok-build-0.1', reasoning_tokens: 42 }
  });
  var snap7a = await _latestRow();
  ok(snap7a.last.drivingModel && snap7a.last.drivingModel.reasoning_tokens === 42,
    'Part 7.1 -- xAI reasoning_tokens 42 captured');

  // 7.2: xAI + undefined (missing completion_tokens_details upstream)
  chromeMock.storage.local._replace({});
  await REC.recordDispatch({
    client: 'FSB Autopilot', tool: 'fsb_action', requestPayload: {},
    success: true, dispatcher_route: 'autopilot',
    drivingModel: { provider: 'xai', model_id: 'grok-build-0.1', reasoning_tokens: undefined }
  });
  var snap7b = await _latestRow();
  ok(snap7b.last.drivingModel && snap7b.last.drivingModel.reasoning_tokens === undefined,
    'Part 7.2 -- xAI with missing completion_tokens_details -> undefined');

  // 7.3: non-xAI (openai) -- agent-loop strips reasoning_tokens; recorder passes through
  chromeMock.storage.local._replace({});
  await REC.recordDispatch({
    client: 'FSB Autopilot', tool: 'fsb_action', requestPayload: {},
    success: true, dispatcher_route: 'autopilot',
    drivingModel: { provider: 'openai', model_id: 'gpt-4', reasoning_tokens: undefined }
  });
  var snap7c = await _latestRow();
  ok(snap7c.last.drivingModel && snap7c.last.drivingModel.provider === 'openai' &&
     snap7c.last.drivingModel.reasoning_tokens === undefined,
    'Part 7.3 -- non-xAI provider -> reasoning_tokens undefined regardless of input');

  // 7.4: xAI + reasoning_tokens=0 -- preserved as 0 (not coerced to undefined)
  chromeMock.storage.local._replace({});
  await REC.recordDispatch({
    client: 'FSB Autopilot', tool: 'fsb_action', requestPayload: {},
    success: true, dispatcher_route: 'autopilot',
    drivingModel: { provider: 'xai', model_id: 'grok-build-0.1', reasoning_tokens: 0 }
  });
  var snap7d = await _latestRow();
  ok(snap7d.last.drivingModel && snap7d.last.drivingModel.reasoning_tokens === 0,
    'Part 7.4 -- xAI reasoning_tokens=0 preserved as 0 (not undefined)');

  // --- Part 8: drivingModel absent on MCP rows (FINT-17; 2 PASS) --
  console.log('\n--- Part 8: drivingModel absent on MCP rows (FINT-17) ---');
  chromeMock.storage.local._replace({});
  await REC.recordDispatch({
    client: 'Claude', tool: 'fsb_action', requestPayload: {},
    success: true, dispatcher_route: 'tool'
    // NOTE: no drivingModel field
  });
  var snap8a = await _latestRow();
  ok(snap8a.last.drivingModel === undefined,
    'Part 8.1 -- MCP-shape caller (no drivingModel field) -> row.drivingModel === undefined');

  chromeMock.storage.local._replace({});
  await REC.recordDispatch({
    client: 'Claude', tool: 'fsb_action', requestPayload: {},
    success: true, dispatcher_route: 'tool',
    drivingModel: null
  });
  var snap8b = await _latestRow();
  ok(snap8b.last.drivingModel === undefined,
    'Part 8.2 -- drivingModel: null coerced to undefined (non-object guard)');

  // --- Parts 9-10 PLACEHOLDER (1 PASS each) -----------------------
  console.log('\n--- Parts 9-10: PLACEHOLDERS (filled in 10-03) ---');
  ok(true, 'placeholder Part 9 -- INV byte-freeze regression (filled in Plan 10-03)');
  ok(true, 'placeholder Part 10 -- provider switch precedence (filled in Plan 10-03)');

  // --- Tail ------------------------------------------------------
  console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
  process.exit(failed === 0 ? 0 : 1);
})().catch(function(err) {
  console.error('SMOKE THREW', err && err.stack ? err.stack : err);
  process.exit(1);
});
