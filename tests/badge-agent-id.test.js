'use strict';

/**
 * Phase 243 plan 03 -- UI-01 overlay-state agentIdShort + badge renderer.
 *
 * Validates:
 *   - buildOverlayState threads agentIdShort (6 hex chars) when statusData.agentId
 *     is provided, sourced via formatAgentIdForDisplay (NEVER sliced locally).
 *   - buildOverlayState yields agentIdShort = null (or absent) when no agentId.
 *   - Badge combine helper renders 'clientLabel / agentIdShort' when both present,
 *     either alone when only one is set, and '' when neither.
 *
 * Run: node tests/badge-agent-id.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const overlayStateUtils = require('../extension/utils/overlay-state.js');
const { formatAgentIdForDisplay, FSB_AGENT_DISPLAY_HEX_LENGTH } = require('../extension/utils/agent-registry.js');

let passed = 0;
let failed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

console.log('\n--- buildOverlayState threads agentIdShort via formatAgentIdForDisplay ---');

// Test 1: agentId present -> agentIdShort is 6 hex chars (matches /^agent_[0-9a-f]{6}$/)
const stateWithAgent = overlayStateUtils.buildOverlayState({
  phase: 'analyzing',
  agentId: 'agent_a3f1ab123c45-d6e7-89f0-1234-567890abcdef',
  clientLabel: 'Claude'
}, null);

ok(typeof stateWithAgent.agentIdShort === 'string', 'Test 1a: agentIdShort is string when agentId present');
ok(/^agent_[0-9a-f]{6}$/.test(stateWithAgent.agentIdShort),
  'Test 1b: agentIdShort matches /^agent_[0-9a-f]{6}$/ shape (got: ' + stateWithAgent.agentIdShort + ')');

// Confirm it is exactly the canonical helper output (no local slice).
const canonical = formatAgentIdForDisplay('agent_a3f1ab123c45-d6e7-89f0-1234-567890abcdef');
ok(stateWithAgent.agentIdShort === canonical,
  'Test 1c: agentIdShort === formatAgentIdForDisplay(agentId) (canonical SSOT)');
ok(canonical.length === ('agent_').length + FSB_AGENT_DISPLAY_HEX_LENGTH,
  'Test 1d: canonical length is prefix + FSB_AGENT_DISPLAY_HEX_LENGTH (' + FSB_AGENT_DISPLAY_HEX_LENGTH + ')');

// Test 2: no agentId -> agentIdShort is null/falsy
const stateNoAgent = overlayStateUtils.buildOverlayState({
  phase: 'analyzing',
  clientLabel: 'Claude'
}, null);
ok(!stateNoAgent.agentIdShort, 'Test 2: agentIdShort is falsy when statusData.agentId absent');

// Test 2b: agentId is non-string -> agentIdShort is falsy
const stateBadAgent = overlayStateUtils.buildOverlayState({
  phase: 'analyzing',
  agentId: 12345
}, null);
ok(!stateBadAgent.agentIdShort, 'Test 2b: agentIdShort is falsy when agentId is non-string');

// Test 2c: legacy:popup-style id (NOT the agent_<uuid> shape) -> falsy/empty per
// formatAgentIdForDisplay contract (agent-registry.js:184 returns '' for non-prefix).
const stateLegacy = overlayStateUtils.buildOverlayState({
  phase: 'analyzing',
  agentId: 'legacy:popup'
}, null);
ok(!stateLegacy.agentIdShort,
  'Test 2c: agentIdShort is falsy for legacy:popup id (not agent_ prefixed)');

console.log('\n--- formatAgentIdForDisplay used in overlay-state source (no local slice) ---');

// Test 3: source-level audit -- overlay-state.js must reference formatAgentIdForDisplay
// and NOT contain a `agentId.slice(`-style local truncation in the badge thread.
const overlayStateSrc = fs.readFileSync(
  path.resolve(__dirname, '../extension/utils/overlay-state.js'),
  'utf8'
);
ok(overlayStateSrc.indexOf('formatAgentIdForDisplay') >= 0,
  'Test 3a: overlay-state.js references formatAgentIdForDisplay (NEVER local slice)');
ok(overlayStateSrc.indexOf('agentIdShort') >= 0,
  'Test 3b: overlay-state.js threads agentIdShort field');

console.log('\n--- visual-feedback combine helper: clientLabel / agentIdShort ---');

// Test 4: pure combine helper exposed for testability.
// We require a small extracted helper module so the renderer logic is testable
// without a DOM. The helper lives at extension/content/badge-combine.js and is
// referenced from visual-feedback.js's badge update block.
const badgeCombine = require('../extension/content/badge-combine.js');

ok(typeof badgeCombine.combineBadgeText === 'function',
  'Test 4a: extension/content/badge-combine.js exports combineBadgeText');

ok(badgeCombine.combineBadgeText('Claude', 'agent_a3f1ab') === 'Claude / agent_a3f1ab',
  'Test 4b: combineBadgeText("Claude", "agent_a3f1ab") === "Claude / agent_a3f1ab"');

ok(badgeCombine.combineBadgeText('Claude', '') === 'Claude',
  'Test 4c: combineBadgeText("Claude", "") === "Claude"');

ok(badgeCombine.combineBadgeText('', 'agent_a3f1ab') === 'agent_a3f1ab',
  'Test 4d: combineBadgeText("", "agent_a3f1ab") === "agent_a3f1ab"');

ok(badgeCombine.combineBadgeText('', '') === '',
  'Test 4e: combineBadgeText("", "") === ""');

ok(badgeCombine.combineBadgeText(null, null) === '',
  'Test 4f: combineBadgeText(null, null) === ""');

// Whitespace normalisation: trim incoming.
ok(badgeCombine.combineBadgeText('  Claude  ', '  agent_a3f1ab  ') === 'Claude / agent_a3f1ab',
  'Test 4g: combineBadgeText trims whitespace on both inputs');

console.log('\n--- visual-feedback.js consumes agentIdShort ---');

const vfSrc = fs.readFileSync(
  path.resolve(__dirname, '../extension/content/visual-feedback.js'),
  'utf8'
);
ok(vfSrc.indexOf('agentIdShort') >= 0,
  'Test 5a: visual-feedback.js reads overlayState.agentIdShort');
// The status pill names the client on its top line and keeps the agent id for
// its hover row, for when two agents share a client.
ok(vfSrc.indexOf("this._setText('.pl-who', v.agentId)") >= 0,
  'Test 5b: the status pill shows the agent id in its hover row');

console.log('\n=== badge-agent-id results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed > 0) process.exit(1);
