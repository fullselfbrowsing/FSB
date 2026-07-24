'use strict';

/**
 * Phase 246 Plan 03 -- byte-identity check between
 * extension/ai/tool-definitions.js and mcp/ai/tool-definitions.cjs.
 *
 * RESEARCH.md Pitfall 2: the two files MUST stay byte-identical. The
 * extension SW loads tool-definitions.js via importScripts; the MCP
 * server loads tool-definitions.cjs via createRequire. Schema bumps
 * (Phase 246 D-02 / D-14) MUST be applied to both in lockstep. This
 * test catches drift before it can ship.
 *
 * The two files differ ONLY in extension (.js vs .cjs); the byte content
 * MUST be identical.
 *
 * Run: node tests/tool-definitions-parity.test.js
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const extPath = path.resolve(__dirname, '..', 'extension', 'ai', 'tool-definitions.js');
const mcpPath = path.resolve(__dirname, '..', 'mcp', 'ai', 'tool-definitions.cjs');

const TRIGGER_TOOL_NAMES = ['trigger', 'stop_trigger', 'get_trigger_status', 'list_triggers'];
const TRIGGER_COMPANION_TOOL_NAMES = ['stop_trigger', 'get_trigger_status', 'list_triggers'];
const PROVIDER_KEYS = ['xai', 'openai', 'anthropic', 'gemini', 'openrouter', 'lmstudio', 'custom'];
const EXPECTED_NON_TRIGGER_TOOL_NAMES = [
  'execute_js', 'navigate', 'search', 'go_back', 'go_forward', 'refresh',
  'click', 'type_text', 'press_enter', 'press_key', 'select_option',
  'check_box', 'hover', 'right_click', 'double_click', 'select_text_range',
  'drag_drop', 'drop_file', 'focus', 'clear_input', 'scroll',
  'scroll_to_top', 'scroll_to_bottom', 'scroll_to_element',
  'wait_for_element', 'wait_for_stable', 'open_tab', 'switch_tab',
  'close_tab', 'fill_sheet', 'read_sheet', 'click_at', 'click_and_hold',
  'drag', 'drag_variable_speed', 'scroll_at', 'insert_text',
  'double_click_at', 'read_page', 'get_text', 'get_attribute',
  'set_attribute', 'get_dom_snapshot', 'list_tabs', 'get_page_snapshot',
  'get_site_guide', 'search_memory', 'report_progress', 'complete_task',
  'partial_task', 'fail_task', 'upload_file'
];
const EXPECTED_NON_TRIGGER_REGISTRY_HASH = '0a525835adc6961463c5a954f3e80205f066e23bef6089283ef598c78f1d8623';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce(function(out, key) {
      out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}

function registryHash(tools) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(tools.map(stable)))
    .digest('hex');
}

function countRegistryName(registry, name) {
  return registry.filter(function(tool) { return tool.name === name; }).length;
}

function formattedToolNames(formatted, provider) {
  if (provider === 'gemini') {
    return ((formatted[0] && formatted[0].functionDeclarations) || [])
      .map(function(decl) { return decl.name; });
  }
  if (provider === 'anthropic') {
    return formatted.map(function(tool) { return tool.name; });
  }
  return formatted.map(function(tool) { return tool.function && tool.function.name; });
}

// Test 1: both files exist
check(fs.existsSync(extPath), 'extension/ai/tool-definitions.js exists');
check(fs.existsSync(mcpPath), 'mcp/ai/tool-definitions.cjs exists');

if (failed > 0) {
  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(1);
}

// Test 2: byte-identity (the canonical Pitfall 2 check)
const extBuf = fs.readFileSync(extPath);
const mcpBuf = fs.readFileSync(mcpPath);
check(
  Buffer.compare(extBuf, mcpBuf) === 0,
  'tool-definitions.js and tool-definitions.cjs are byte-identical (' + extBuf.length + ' bytes each)'
);

if (Buffer.compare(extBuf, mcpBuf) !== 0) {
  // Find first differing byte for diagnostic
  const len = Math.min(extBuf.length, mcpBuf.length);
  let firstDiff = -1;
  for (let i = 0; i < len; i++) {
    if (extBuf[i] !== mcpBuf[i]) { firstDiff = i; break; }
  }
  console.error('  DIAG: first differing byte at offset ' + firstDiff);
  console.error('  DIAG: extension byte = 0x' + (firstDiff >= 0 ? extBuf[firstDiff].toString(16) : '?'));
  console.error('  DIAG: mcp byte = 0x' + (firstDiff >= 0 ? mcpBuf[firstDiff].toString(16) : '?'));
  console.error('  DIAG: extension length = ' + extBuf.length + ' bytes');
  console.error('  DIAG: mcp length = ' + mcpBuf.length + ' bytes');
}

// Test 3: Phase 246 schema additions sanity check -- verify the read tools
// have tab_id (Plan 01 Task 6) and open_tab has active boolean (Plan 01
// Task 5) by parsing the file content.
const td = require('../mcp/ai/tool-definitions.cjs');
const agentLoop = require('../extension/ai/agent-loop.js');
const { formatToolsForProvider } = require('../extension/ai/tool-use-adapter.js');

// Test 3a: Phase 18 trigger registry additivity and provider visibility.
EXPECTED_NON_TRIGGER_TOOL_NAMES.forEach(function(name) {
  check(!!td.getToolByName(name), 'pre-trigger tool ' + name + ' still exists in TOOL_REGISTRY');
});

const nonTriggerTools = td.TOOL_REGISTRY.filter(function(tool) {
  return TRIGGER_TOOL_NAMES.indexOf(tool.name) < 0;
});
check(nonTriggerTools.length === EXPECTED_NON_TRIGGER_TOOL_NAMES.length,
  'non-trigger registry size remains ' + EXPECTED_NON_TRIGGER_TOOL_NAMES.length);
check(registryHash(nonTriggerTools) === EXPECTED_NON_TRIGGER_REGISTRY_HASH,
  'non-trigger registry definitions remain byte-equivalent to the locked pre-trigger baseline');
check(td.TOOL_REGISTRY.length === EXPECTED_NON_TRIGGER_TOOL_NAMES.length + TRIGGER_TOOL_NAMES.length,
  'TOOL_REGISTRY contains only the locked pre-trigger tools plus the four trigger tools');

TRIGGER_TOOL_NAMES.forEach(function(name) {
  const tool = td.getToolByName(name);
  check(!!tool, 'trigger-family tool ' + name + ' resolves via getToolByName');
  check(countRegistryName(td.TOOL_REGISTRY, name) === 1,
    'trigger-family tool ' + name + ' appears exactly once in TOOL_REGISTRY');
  if (tool) {
    check(tool._route === 'background', name + ' is background-routed');
  }
});

const triggerTool = td.getToolByName('trigger');
check(!!triggerTool && triggerTool._readOnly === false,
  'trigger is side-effecting (_readOnly: false)');
if (triggerTool) {
  const triggerProps = (triggerTool.inputSchema && triggerTool.inputSchema.properties) || {};
  ['trigger_id', 'detached', 'timeout_ms', 'safety_ceiling_ms', 'rearm_on_fire'].forEach(function(field) {
    check(!!triggerProps[field], 'trigger schema includes additive reporting field ' + field);
  });
  check((triggerTool.inputSchema.required || []).indexOf('selector') >= 0,
    'trigger schema still requires selector');
  check((triggerTool.inputSchema.required || []).indexOf('condition') >= 0,
    'trigger schema still requires condition');
  check((triggerTool.inputSchema.required || []).indexOf('detached') < 0,
    'trigger schema detached field is optional');
  check((triggerTool.inputSchema.required || []).indexOf('timeout_ms') < 0,
    'trigger schema timeout_ms field is optional');
}
TRIGGER_COMPANION_TOOL_NAMES.forEach(function(name) {
  const tool = td.getToolByName(name);
  check(!!tool && tool._readOnly === true,
    name + ' is read-only/bypass class (_readOnly: true)');
});

const listTriggersTool = td.getToolByName('list_triggers');
if (listTriggersTool) {
  const statusEnum = (((listTriggersTool.inputSchema || {}).properties || {}).status || {}).enum || [];
  ['armed', 'needs_attention', 'blocked', 'fired', 'timed_out', 'stopped'].forEach(function(status) {
    check(statusEnum.indexOf(status) >= 0,
      'list_triggers status enum accepts persisted status ' + status);
  });
  check(new Set(statusEnum).size === statusEnum.length,
    'list_triggers status enum has no duplicate values');
}

const publicTools = agentLoop.getPublicTools();
PROVIDER_KEYS.forEach(function(provider) {
  const formatted = formatToolsForProvider(publicTools, provider);
  const names = formattedToolNames(formatted, provider);
  TRIGGER_TOOL_NAMES.forEach(function(name) {
    check(names.indexOf(name) >= 0,
      provider + ' formatted tool envelope exposes ' + name);
  });
});

const readTools = ['read_page', 'get_text', 'get_attribute', 'get_dom_snapshot', 'get_page_snapshot', 'read_sheet'];
readTools.forEach(function(name) {
  const t = td.getToolByName(name);
  check(!!t, 'read tool ' + name + ' exists in TOOL_REGISTRY');
  if (t) {
    check(!!t.inputSchema.properties.tab_id, name + ' has tab_id in inputSchema.properties');
    check(!(t.inputSchema.required || []).includes('tab_id'), name + ' tab_id is OPTIONAL (not in required)');
  }
});

const openTab = td.getToolByName('open_tab');
check(!!openTab, 'open_tab exists in TOOL_REGISTRY');
if (openTab) {
  check(!!openTab.inputSchema.properties.active, 'open_tab has active in inputSchema.properties');
  check(openTab.inputSchema.properties.active.type === 'boolean', 'open_tab.active type is boolean');
  check(openTab.inputSchema.properties.active.default === false, 'open_tab.active default is false (Phase 246 D-05)');
}

const switchTab = td.getToolByName('switch_tab');
check(!!switchTab, 'switch_tab exists in TOOL_REGISTRY');
if (switchTab) {
  check(!!switchTab.inputSchema.properties.active, 'switch_tab has active in inputSchema.properties');
  check(switchTab.inputSchema.properties.active.type === 'boolean', 'switch_tab.active type is boolean');
  check(switchTab.inputSchema.properties.active.default === false, 'switch_tab.active default is false');
  check(!((switchTab.inputSchema.required || []).includes('active')), 'switch_tab.active is OPTIONAL');
}

const closeTab = td.getToolByName('close_tab');
check(!!closeTab, 'close_tab exists in TOOL_REGISTRY');
if (closeTab) {
  check(!!closeTab.inputSchema.properties.tab_id, 'close_tab has tab_id in inputSchema.properties');
  check(!((closeTab.inputSchema.required || []).includes('tab_id')), 'close_tab.tab_id is OPTIONAL');
  check(!!closeTab.inputSchema.properties.allow_active, 'close_tab has allow_active in inputSchema.properties');
  check(closeTab.inputSchema.properties.allow_active.type === 'boolean', 'close_tab.allow_active type is boolean');
  check(closeTab.inputSchema.properties.allow_active.default === false, 'close_tab.allow_active default is false');
  check(!((closeTab.inputSchema.required || []).includes('allow_active')), 'close_tab.allow_active is OPTIONAL');
}

// Action tools have tab_id (Plan 02 Task 4 -- 35 tools)
const actionTools = ['execute_js','navigate','search','go_back','go_forward','refresh','click','type_text','press_enter','press_key','select_option','check_box','hover','right_click','double_click','select_text_range','drag_drop','drop_file','focus','clear_input','scroll','scroll_to_top','scroll_to_bottom','scroll_to_element','wait_for_element','wait_for_stable','fill_sheet','click_at','click_and_hold','drag','drag_variable_speed','scroll_at','insert_text','double_click_at','set_attribute','upload_file'];
actionTools.forEach(function(name) {
  const t = td.getToolByName(name);
  check(!!t, 'action tool ' + name + ' exists in TOOL_REGISTRY');
  if (t) {
    check(!!t.inputSchema.properties.tab_id, name + ' has tab_id in inputSchema.properties');
    check(!(t.inputSchema.required || []).includes('tab_id'), name + ' tab_id is OPTIONAL');
  }
});

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
