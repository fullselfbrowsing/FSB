'use strict';

/*
 * Phase 255 Plan 04: schema-lock invariants for the v0.9.62 implicit
 * visual-session contract.
 *
 * Source of truth: .planning/v0.9.62-CONTRACT.md (Action Tools section,
 * Read-Only Tools section, Typed Errors section).
 *
 * What this test locks:
 *   1. The 36 canonical action tools (CONTRACT-02) carry visual_reason,
 *      client, is_final in inputSchema.properties and visual_reason +
 *      client in inputSchema.required.
 *   2. The 15 read-only tools (CONTRACT-05) have NO visual_reason /
 *      client / is_final in their inputSchema.properties (schema-lock
 *      invariant).
 *   3. wait_for_element and wait_for_stable have _readOnly: true (the
 *      milestone-level reclassification from Phase 254).
 *   4. The dispatcher (registerManualTools in mcp/src/tools/manual.ts)
 *      rejects action-tool calls missing visual_reason or client with
 *      VISUAL_FIELDS_REQUIRED (CONTRACT-03).
 *   5. The dispatcher rejects action-tool calls with non-allowlisted
 *      client values with BADGE_NOT_ALLOWED (CONTRACT-04).
 *   6. Rejections do NOT invoke the bridge or queue (no DOM mutation,
 *      no change_report, no overlay state change).
 *
 * Run: node tests/visual-session-schema-lock.test.js
 */

const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// -------------------------------------------------------------------
// Canonical name lists (sourced verbatim from .planning/v0.9.62-CONTRACT.md)
// Embed verbatim instead of deriving from TOOL_REGISTRY at runtime so a
// regression that drops a tool from the registry surfaces here as a
// FAIL rather than silently shrinking a derived list.
// -------------------------------------------------------------------

const VISUAL_SESSION_ACTION_TOOLS = [
  'click', 'type_text', 'navigate', 'scroll', 'drag', 'select_option',
  'press_key', 'press_enter', 'drag_drop', 'hover', 'focus', 'clear_input',
  'check_box', 'drop_file', 'click_and_hold', 'double_click', 'right_click',
  'click_at', 'scroll_at', 'double_click_at', 'drag_variable_speed',
  'set_attribute', 'insert_text', 'search', 'refresh', 'go_back',
  'go_forward', 'open_tab', 'close_tab', 'switch_tab', 'execute_js',
  'select_text_range', 'scroll_to_top', 'scroll_to_bottom',
  'scroll_to_element', 'fill_sheet'
];

const VISUAL_SESSION_READ_ONLY_TOOLS = [
  'read_sheet', 'read_page', 'get_text', 'get_attribute',
  'get_dom_snapshot', 'list_tabs', 'get_page_snapshot', 'get_site_guide',
  'search_memory', 'report_progress', 'complete_task', 'partial_task',
  'fail_task', 'wait_for_element', 'wait_for_stable',
  'stop_trigger', 'get_trigger_status', 'list_triggers'
];

check(VISUAL_SESSION_ACTION_TOOLS.length === 36, '36 canonical action tools enumerated');
check(VISUAL_SESSION_READ_ONLY_TOOLS.length === 18, '18 canonical read-only tools enumerated');
check(VISUAL_SESSION_ACTION_TOOLS.indexOf('trigger') < 0,
  'trigger is not in the visual-session action-tool field-bundle list');

// -------------------------------------------------------------------
// Section 1: TOOL_REGISTRY schema-shape invariants
// -------------------------------------------------------------------

const REGISTRY_PATH = path.resolve(__dirname, '..', 'mcp', 'ai', 'tool-definitions.cjs');
check(fs.existsSync(REGISTRY_PATH), 'mcp/ai/tool-definitions.cjs exists');

const registry = require(REGISTRY_PATH);
const { getToolByName, getReadOnlyTools } = registry;

check(typeof registry.VISUAL_SESSION_FIELDS === 'object' && registry.VISUAL_SESSION_FIELDS !== null,
  'tool-definitions.cjs exports VISUAL_SESSION_FIELDS');
check(typeof registry.withVisualSessionFields === 'function',
  'tool-definitions.cjs exports withVisualSessionFields helper');
check(Array.isArray(registry.VISUAL_SESSION_REQUIRED) &&
      registry.VISUAL_SESSION_REQUIRED.indexOf('visual_reason') >= 0 &&
      registry.VISUAL_SESSION_REQUIRED.indexOf('client') >= 0,
  'VISUAL_SESSION_REQUIRED contains visual_reason and client');

// Per-action-tool schema assertion
for (const name of VISUAL_SESSION_ACTION_TOOLS) {
  const tool = getToolByName(name);
  if (!tool) { check(false, name + ': present in TOOL_REGISTRY'); continue; }
  check(tool._readOnly === false, name + ': _readOnly is false (still an action tool)');
  const props = tool.inputSchema && tool.inputSchema.properties;
  check(!!props && props.visual_reason && props.visual_reason.type === 'string',
    name + ': inputSchema.properties.visual_reason is { type: string }');
  check(!!props && props.client && props.client.type === 'string',
    name + ': inputSchema.properties.client is { type: string }');
  check(!!props && props.is_final && props.is_final.type === 'boolean',
    name + ': inputSchema.properties.is_final is { type: boolean }');
  const required = (tool.inputSchema && tool.inputSchema.required) || [];
  check(required.indexOf('visual_reason') >= 0,
    name + ': inputSchema.required contains visual_reason');
  check(required.indexOf('client') >= 0,
    name + ': inputSchema.required contains client');
}

// Per-read-only-tool schema-LOCK assertion
for (const name of VISUAL_SESSION_READ_ONLY_TOOLS) {
  const tool = getToolByName(name);
  if (!tool) { check(false, name + ': present in TOOL_REGISTRY'); continue; }
  check(tool._readOnly === true, name + ': _readOnly is true (read-only classification)');
  const props = (tool.inputSchema && tool.inputSchema.properties) || {};
  check(!props.visual_reason, name + ': inputSchema.properties does NOT contain visual_reason');
  check(!props.client, name + ': inputSchema.properties does NOT contain client');
  check(!props.is_final, name + ': inputSchema.properties does NOT contain is_final');
}

// wait_for_* reclassification check (explicit, for downstream readability)
const waitForElement = getToolByName('wait_for_element');
const waitForStable = getToolByName('wait_for_stable');
check(waitForElement && waitForElement._readOnly === true,
  'wait_for_element is reclassified as _readOnly: true');
check(waitForStable && waitForStable._readOnly === true,
  'wait_for_stable is reclassified as _readOnly: true');

const triggerTool = getToolByName('trigger');
check(!!triggerTool, 'trigger is present in TOOL_REGISTRY');
if (triggerTool) {
  const triggerProps = (triggerTool.inputSchema && triggerTool.inputSchema.properties) || {};
  check(triggerTool._readOnly === false,
    'trigger is registered as a side-effecting tool, not read-only');
  check(!triggerProps.visual_reason,
    'trigger inputSchema.properties does NOT contain visual_reason');
  check(!triggerProps.client,
    'trigger inputSchema.properties does NOT contain client');
  check(!triggerProps.is_final,
    'trigger inputSchema.properties does NOT contain is_final');
}

// getReadOnlyTools() count = 18
check(getReadOnlyTools().length === 18,
  'getReadOnlyTools() returns exactly 18 entries');

// -------------------------------------------------------------------
// Section 2: Dispatcher rejection runtime invariants
// -------------------------------------------------------------------

const BUILD_PATH = path.resolve(__dirname, '..', 'mcp', 'build', 'tools', 'manual.js');
const SRC_PATH = path.resolve(__dirname, '..', 'mcp', 'src', 'tools', 'manual.ts');
if (!fs.existsSync(BUILD_PATH)) {
  console.error('  FAIL: mcp/build/tools/manual.js missing -- run `npm --prefix mcp run build` before this test (root npm test chain does this automatically).');
  process.exit(1);
}
// Staleness guard: a build older than the source has caused phantom contract
// failures. Fail loud with remediation rather than importing stale code.
if (fs.existsSync(SRC_PATH) && fs.statSync(SRC_PATH).mtimeMs > fs.statSync(BUILD_PATH).mtimeMs) {
  console.error('  FAIL: mcp/build/tools/manual.js is older than mcp/src/tools/manual.ts -- run `npm --prefix mcp run build` to refresh');
  process.exit(1);
}

function makeMockBridge() {
  const calls = [];
  return {
    calls,
    bridge: {
      isConnected: true,
      sendAndWait: async () => {
        calls.push('sendAndWait');
        return { success: true };
      }
    }
  };
}

function makeMockQueue() {
  const calls = [];
  return {
    calls,
    queue: {
      enqueue: async (name, fn) => {
        calls.push(name);
        return await fn();
      }
    }
  };
}

function makeMockAgentScope() {
  return {
    ensure: async () => 'agent-test',
    ownershipTokenFor: () => null,
    currentOwnershipToken: () => null,
    currentConnectionId: () => null,
    captureOwnershipToken: () => {},
    reset: () => {}
  };
}

function makeRecordingServer() {
  const tools = new Map();
  return {
    tools,
    server: {
      tool: (name, _desc, _zod, handler) => {
        tools.set(name, handler);
      }
    }
  };
}

(async () => {
  const manualModule = await import(BUILD_PATH);
  const recordingServer = makeRecordingServer();
  const mockBridge = makeMockBridge();
  const mockQueue = makeMockQueue();
  const mockAgentScope = makeMockAgentScope();

  manualModule.registerManualTools(
    recordingServer.server,
    mockBridge.bridge,
    mockQueue.queue,
    mockAgentScope
  );

  check(recordingServer.tools.has('click'),
    'registerManualTools registers click handler');

  const clickHandler = recordingServer.tools.get('click');

  // Case A: missing visual_reason AND client
  mockBridge.calls.length = 0;
  mockQueue.calls.length = 0;
  const resA = await clickHandler({ selector: '#submit' });
  check(resA.isError === true,
    'click without visual_reason+client returns isError: true');
  check(mockBridge.calls.length === 0,
    'click without visual_reason+client did NOT call bridge.sendAndWait');
  check(mockQueue.calls.length === 0,
    'click without visual_reason+client did NOT call queue.enqueue');
  check(typeof resA.content[0].text === 'string' &&
    (resA.content[0].text.toLowerCase().includes('visual') ||
     resA.content[0].text.toLowerCase().includes('field bundle')),
    'click rejection body references visual / field bundle (VISUAL_FIELDS_REQUIRED routing)');

  // Case B: visual_reason present but client missing
  mockBridge.calls.length = 0;
  mockQueue.calls.length = 0;
  const resB = await clickHandler({ selector: '#submit', visual_reason: 'Testing' });
  check(resB.isError === true,
    'click with visual_reason only (no client) returns isError: true');
  check(mockBridge.calls.length === 0,
    'click with missing client did NOT call bridge.sendAndWait');

  // Case C: empty-string visual_reason rejected
  mockBridge.calls.length = 0;
  const resC = await clickHandler({ selector: '#submit', visual_reason: '', client: 'Claude' });
  check(resC.isError === true,
    'click with empty visual_reason returns isError: true');
  check(mockBridge.calls.length === 0,
    'click with empty visual_reason did NOT call bridge.sendAndWait');

  // Case D: non-allowlisted client
  mockBridge.calls.length = 0;
  mockQueue.calls.length = 0;
  const resD = await clickHandler({
    selector: '#submit',
    visual_reason: 'Testing',
    client: 'NotARealClient'
  });
  check(resD.isError === true,
    'click with non-allowlisted client returns isError: true');
  check(mockBridge.calls.length === 0,
    'click with non-allowlisted client did NOT call bridge.sendAndWait');
  check(typeof resD.content[0].text === 'string' &&
    resD.content[0].text.includes('NotARealClient'),
    'BADGE_NOT_ALLOWED body echoes offending client label NotARealClient');

  // Case E: valid call proceeds to bridge
  mockBridge.calls.length = 0;
  mockQueue.calls.length = 0;
  const resE = await clickHandler({
    selector: '#submit',
    visual_reason: 'Submitting form',
    client: 'Claude'
  });
  check(resE.isError !== true,
    'click with valid visual_reason+client did NOT set isError');
  check(mockBridge.calls.length === 1,
    'click with valid bundle DID call bridge.sendAndWait exactly once');
  check(mockQueue.calls.length === 1 && mockQueue.calls[0] === 'click',
    'click with valid bundle DID enqueue under the tool name');

  // Case F: is_final accepted (no current runtime semantics; Phase 257)
  mockBridge.calls.length = 0;
  mockQueue.calls.length = 0;
  const resF = await clickHandler({
    selector: '#submit',
    visual_reason: 'Final action',
    client: 'Claude',
    is_final: true
  });
  check(resF.isError !== true,
    'click with is_final: true is accepted (validator passes; Phase 257 wires semantics)');
  check(mockBridge.calls.length === 1,
    'click with is_final: true proceeds to bridge');

  // Section 3: Sampling -- assert the validator is wired on a handful of
  // structurally diverse action tools beyond click. Picking one tool per
  // category covers content-routed, background-routed, and CDP-routed
  // handlers without enumerating all 36.
  const SAMPLES = ['type_text', 'navigate', 'click_at', 'execute_js', 'switch_tab', 'fill_sheet'];
  for (const name of SAMPLES) {
    const handler = recordingServer.tools.get(name);
    if (!handler) { check(false, name + ': handler registered'); continue; }
    mockBridge.calls.length = 0;
    mockQueue.calls.length = 0;
    const res = await handler({});
    check(res.isError === true,
      name + ': handler rejects empty-params call (missing visual_reason+client)');
    check(mockBridge.calls.length === 0,
      name + ': rejection blocks bridge.sendAndWait');
  }

  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('FATAL:', err.stack || err);
  process.exit(1);
});
