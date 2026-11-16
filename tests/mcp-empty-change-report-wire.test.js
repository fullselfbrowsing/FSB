'use strict';

/**
 * An action result reaches the MCP server without a change_report that
 * records nothing; the session recorder still stores the full report, and a
 * report that records anything goes out unchanged.
 *
 * Part 1 drives isEmptyChangeReport (extension/utils/action-verification.js)
 * over real buildChangeReport output. Part 2 loads the real bridge client in a
 * vm and routes an mcp:execute-action message through _handleMessage, so the
 * recorder tap and the outgoing WebSocket frame are both observed.
 *
 * Run: node tests/mcp-empty-change-report-wire.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const av = require('../extension/utils/action-verification.js');
const definitions = require('../extension/ai/tool-definitions.js');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const PAGE = 'https://example.com/form';

function state(overrides) {
  return {
    url: PAGE,
    title: 'Form',
    inputValues: { q: '' },
    activeElementSelector: null,
    ...overrides
  };
}

function emptyReport(options) {
  return av.buildChangeReport(state(), state(), [], { settleMs: 180, mutationCount: 0, ...(options || {}) });
}

function node(tagName, id) {
  return {
    tagName,
    textContent: 'Saved',
    offsetWidth: 10,
    getAttribute(name) { return name === 'id' ? id : null; },
    className: ''
  };
}

// --- Part 1: isEmptyChangeReport ---
console.log('--- isEmptyChangeReport ---');
check(typeof av.isEmptyChangeReport === 'function', 'isEmptyChangeReport is exported');

check(av.isEmptyChangeReport(emptyReport()) === true, 'same URL and title, no mutation, no change: empty');
const partialEmpty = emptyReport();
partialEmpty.partial = true;
check(av.isEmptyChangeReport(partialEmpty) === true, 'a partial report that recorded nothing is empty');

const noiseOnly = av.buildChangeReport(state(), state(), [], { mutationCount: 3 });
check(av.isEmptyChangeReport(noiseOnly) === false, 'mutation_count above zero is kept, even with empty buckets');
check(av.isEmptyChangeReport(av.buildChangeReport(state(), state({ url: PAGE + '#done' }), [], { mutationCount: 0 })) === false,
  'a URL change is kept');
check(av.isEmptyChangeReport(av.buildChangeReport(state(), state({ title: 'Saved' }), [], { mutationCount: 0 })) === false,
  'a title change is kept');
check(av.isEmptyChangeReport(av.buildChangeReport(state(), state({ inputValues: { q: 'shoes' } }), [], { mutationCount: 0 })) === false,
  'an input change (no mutation record, as with el.value = ...) is kept');
check(av.isEmptyChangeReport(av.buildChangeReport(state(), state({ activeElementSelector: '#q' }), [], { mutationCount: 0 })) === false,
  'a focus shift is kept');
check(av.isEmptyChangeReport(av.buildChangeReport(state(), state(), [{
  type: 'childList', target: node('DIV', 'list'), addedNodes: [node('LI', 'row-1')], removedNodes: []
}])) === false, 'an added node is kept');
check(av.isEmptyChangeReport(av.buildChangeReport(state(), state(), [{
  type: 'attributes', attributeName: 'aria-expanded', oldValue: 'false', target: node('BUTTON', 'menu'), addedNodes: [], removedNodes: []
}])) === false, 'an attribute change is kept');
check(av.isEmptyChangeReport(av.buildChangeReport(state(), state({ url: 'https://other.example/' }), [], { crossOrigin: true })) === false,
  'a cross-origin report is kept');
const truncated = emptyReport();
truncated.truncated = true;
check(av.isEmptyChangeReport(truncated) === false, 'a truncated report is kept');
const unknownKey = emptyReport();
unknownKey.tab_opened = 7;
check(av.isEmptyChangeReport(unknownKey) === false, 'a report with a key outside the known shape is kept');
const missingFocus = emptyReport();
delete missingFocus.focus_shift;
check(av.isEmptyChangeReport(missingFocus) === false, 'a report missing focus_shift is kept');
check(av.isEmptyChangeReport({
  url: { before: null, after: 'https://example.com/', changed: true },
  title_changed: false, dialogs_opened: [], nodes_added: [], nodes_removed: [], attrs_changed: [],
  inputs_changed: {}, focus_shift: null, mutation_count: 0, settle_ms: 0, truncated: false, partial: true
}) === false, 'the synthetic open_tab report (URL from null) is kept');
check(av.isEmptyChangeReport(null) === false && av.isEmptyChangeReport([]) === false && av.isEmptyChangeReport('x') === false,
  'non-objects are never empty');

// --- Part 2: the bridge routes the full result to the recorder and the
// trimmed one to the wire ---
function loadBridge() {
  const storageArea = () => ({
    async get() { return {}; },
    async set() {},
    async remove() {}
  });
  class FakeWebSocket {
    constructor() { this.readyState = FakeWebSocket.OPEN; this.sent = []; }
    send(data) { this.sent.push(data); }
    close() {}
  }
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSED = 3;
  const context = {
    chrome: {
      runtime: { id: 'empty-report-test', onMessage: { addListener() {}, removeListener() {} }, sendMessage() {} },
      storage: { session: storageArea(), local: storageArea() },
      alarms: { async create() {}, async clear() { return true; }, async getAll() { return []; } }
    },
    WebSocket: FakeWebSocket,
    console,
    Math,
    Date,
    URL,
    EventTarget,
    CustomEvent,
    setTimeout: () => ({}),
    clearTimeout() {},
    setInterval: () => ({}),
    clearInterval() {},
    getToolByNameOrVerb: definitions.getToolByNameOrVerb,
    isEmptyChangeReport: av.isEmptyChangeReport
  };
  context.globalThis = context;
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
  vm.runInNewContext(`${source}\nthis.__bridge = mcpBridgeClient;`, context, { filename: 'ws/mcp-bridge-client.js' });
  const client = context.__bridge;
  client.setInboundAuthorityReady(true);
  client.setDelegationAuthorityReady(true);
  return { context, client };
}

async function routeAction(actionResult) {
  const { context, client } = loadBridge();
  const recorded = [];
  context.fsbMcpSessionRecorder = { recordAction(entry) { recorded.push(entry); } };
  context.resolveAgentTabOrError = async () => ({ success: true, tabId: 42 });
  context.wrapWithChangeReport = async ({ execute }) => {
    await execute();
    return actionResult;
  };
  client._sendToContentScript = async () => ({ success: true });
  client._resolveMcpSessionRecordTarget = async () => ({ targetOriginResolved: true, targetUrl: PAGE, targetOrigin: 'https://example.com' });
  client._recordVisualSessionTickIfPresent = async () => {};
  client._clearVisualSessionIfFinal = async () => {};
  const sent = [];
  client._send = (frame) => sent.push(frame);
  await client._handleMessage(JSON.stringify({
    id: 'call-1',
    type: 'mcp:execute-action',
    payload: { tool: 'click', params: { selector: '#save' }, agentId: 'agent-1' }
  }));
  return { recorded, sent };
}

(async () => {
  console.log('--- bridge wire shaping ---');

  const empty = emptyReport();
  const emptyResult = { success: true, clicked: '#save', hadEffect: true, change_report: empty };
  const a = await routeAction(emptyResult);
  check(a.recorded.length === 1, 'the recorder received the action once');
  check(a.recorded[0] && a.recorded[0].response && a.recorded[0].response.change_report === empty,
    'the recorder received the full change_report');
  check(emptyResult.change_report === empty, 'the result object itself still carries the report');
  const frame = a.sent.find((f) => f && f.type === 'mcp:result');
  check(!!frame, 'an mcp:result frame was sent');
  check(frame && !Object.prototype.hasOwnProperty.call(frame.payload, 'change_report'),
    'the wire payload has no change_report key when it recorded nothing');
  check(frame && frame.payload.success === true && frame.payload.clicked === '#save' && frame.payload.hadEffect === true,
    'success and every other field stay on the wire');
  check(frame && JSON.stringify(Object.keys(frame.payload)) === JSON.stringify(['success', 'clicked', 'hadEffect']),
    'the remaining keys keep their order');

  const changed = av.buildChangeReport(state(), state({ title: 'Saved' }), [], { mutationCount: 2, settleMs: 300 });
  const changedResult = { success: true, clicked: '#save', change_report: changed, change_report_hint: 'truncated; call read_page for full state' };
  const b = await routeAction(changedResult);
  const changedFrame = b.sent.find((f) => f && f.type === 'mcp:result');
  check(changedFrame && JSON.stringify(changedFrame.payload.change_report) === JSON.stringify(changed),
    'a report that records a change goes out unchanged');
  check(changedFrame && changedFrame.payload.change_report_hint === changedResult.change_report_hint,
    'change_report_hint stays with its report');
  check(b.recorded[0] && b.recorded[0].response.change_report === changed, 'the recorder received the non-empty report');

  const failedResult = { success: false, error: 'Element not found' };
  const c = await routeAction(failedResult);
  const failedFrame = c.sent.find((f) => f && f.type === 'mcp:result');
  check(failedFrame && failedFrame.payload.success === false && failedFrame.payload.error === 'Element not found',
    'a result without a report passes through untouched');

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: mcp-empty-change-report-wire threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
