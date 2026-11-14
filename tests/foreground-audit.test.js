/**
 * Phase 243-01 BG-01/BG-02/BG-03: foreground audit invariants.
 *
 * These tests guard the per-tool `_forceForeground` opt-in introduced by
 * Phase 243 and narrowed in the no-focus multi-tab work. switch_tab is the
 * ONLY tool allowed to foreground, and it may only do so when the caller
 * explicitly passes active:true. Every other tool must default to
 * `_forceForeground: false`.
 *
 * Test strategy: read the three target source files as text and assert
 * structural invariants via string / regex predicates. We deliberately
 * avoid require()-ing the Chrome-coupled background sources (mcp-tool-
 * dispatcher.js / tool-executor.js); only tool-definitions.js is loaded
 * via require() because it is pure data with a single CommonJS export.
 *
 * Run: node tests/foreground-audit.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TOOL_DEFS_PATH = path.join(ROOT, 'extension/ai/tool-definitions.js');
const DISPATCHER_PATH = path.join(ROOT, 'extension/ws/mcp-tool-dispatcher.js');
const EXECUTOR_PATH = path.join(ROOT, 'extension/ai/tool-executor.js');
const AUDIT_DOC_PATH = path.join(
  ROOT,
  '.planning/milestones/v0.9.60-phases/243-background-tab-audit-ui-badge-integration/243-BACKGROUND-TAB-AUDIT.md'
);

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function readSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return null;
  }
}

// -----------------------------------------------------------------------
// Test 1: tool-definitions.js exports switch_tab with _forceForeground:true
// and at least one other tool with _forceForeground:false (or absent).
// -----------------------------------------------------------------------

console.log('\n--- Test 1: tool-definitions.js _forceForeground shape ---');
{
  const defs = require('../extension/ai/tool-definitions.js');
  const registry = defs.TOOL_REGISTRY;
  assert(Array.isArray(registry) && registry.length >= 40,
    'TOOL_REGISTRY is a populated array (>=40 tools)');

  const switchTab = registry.find(t => t.name === 'switch_tab');
  assert(!!switchTab, 'switch_tab tool definition exists');
  assert(switchTab && switchTab._forceForeground === true,
    'switch_tab._forceForeground === true');
  assert(switchTab && switchTab.inputSchema && switchTab.inputSchema.properties
    && switchTab.inputSchema.properties.active
    && switchTab.inputSchema.properties.active.default === false,
    'switch_tab active flag exists and defaults false');

  const trueCount = registry.filter(t => t._forceForeground === true).length;
  assert(trueCount === 1,
    'exactly 1 tool has _forceForeground:true (switch_tab) — got ' + trueCount);

  const otherFalseCount = registry.filter(
    t => t.name !== 'switch_tab' && t._forceForeground === false
  ).length;
  assert(otherFalseCount >= 1,
    'at least one non-switch_tab tool has _forceForeground:false — got ' + otherFalseCount);
}

// -----------------------------------------------------------------------
// Test 2: grep over tool-definitions.js source — exactly 1 occurrence of
// `_forceForeground:` paired with `true` (whitespace tolerant).
// -----------------------------------------------------------------------

console.log('\n--- Test 2: tool-definitions.js grep _forceForeground:true ---');
{
  const src = readSafe(TOOL_DEFS_PATH) || '';
  const trueMatches = src.match(/_forceForeground\s*:\s*true/g) || [];
  assert(trueMatches.length === 1,
    'exactly 1 textual `_forceForeground: true` in tool-definitions.js — got ' + trueMatches.length);

  const allMatches = src.match(/_forceForeground\s*:/g) || [];
  assert(allMatches.length >= 40,
    '_forceForeground appears on >=40 tool defs (every tool flagged) — got ' + allMatches.length);
}

// -----------------------------------------------------------------------
// Test 3: mcp-tool-dispatcher.js — every chrome.tabs.update(...active:true)
// inside the file must sit inside a block that mentions _forceForeground
// within the prior 30 lines.
// -----------------------------------------------------------------------

console.log('\n--- Test 3: mcp-tool-dispatcher.js gates active:true behind _forceForeground ---');
{
  const src = readSafe(DISPATCHER_PATH) || '';
  const lines = src.split('\n');
  const offenders = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/chrome\.tabs\.update\s*\(/.test(line) && /active\s*:\s*true/.test(line)) {
      const start = Math.max(0, i - 30);
      const window = lines.slice(start, i + 1).join('\n');
      if (!/_forceForeground/.test(window)) {
        offenders.push((i + 1) + ': ' + line.trim());
      }
    }
  }
  assert(offenders.length === 0,
    'no unguarded chrome.tabs.update({active:true}) in mcp-tool-dispatcher.js — offenders: ' + offenders.join(' | '));

  const flagRefs = (src.match(/_forceForeground/g) || []).length;
  assert(flagRefs >= 1,
    'mcp-tool-dispatcher.js references _forceForeground at least once — got ' + flagRefs);
  assert(/_forceForeground\s*===\s*true\s*&&\s*params\.active\s*===\s*true/.test(src),
    'mcp-tool-dispatcher.js requires params.active === true before foregrounding switch_tab');
}

// -----------------------------------------------------------------------
// Test 4: tool-executor.js — same invariant for the autopilot switch_tab path.
// -----------------------------------------------------------------------

console.log('\n--- Test 4: tool-executor.js gates active:true behind _forceForeground ---');
{
  const src = readSafe(EXECUTOR_PATH) || '';
  const lines = src.split('\n');
  const offenders = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/chrome\.tabs\.update\s*\(/.test(line) && /active\s*:\s*true/.test(line)) {
      const start = Math.max(0, i - 30);
      const window = lines.slice(start, i + 1).join('\n');
      // open_tab uses chrome.tabs.create with `active`, which is a different
      // API and not a foreground-steal. The regex above only matches
      // chrome.tabs.update, so create calls are excluded by construction.
      if (!/_forceForeground/.test(window)) {
        offenders.push((i + 1) + ': ' + line.trim());
      }
    }
  }
  assert(offenders.length === 0,
    'no unguarded chrome.tabs.update({active:true}) in tool-executor.js — offenders: ' + offenders.join(' | '));

  const flagRefs = (src.match(/_forceForeground/g) || []).length;
  assert(flagRefs >= 1,
    'tool-executor.js references _forceForeground at least once — got ' + flagRefs);
  assert(/_forceForeground\s*===\s*true\s*&&\s*params\?\.active\s*===\s*true/.test(src),
    'tool-executor.js requires params.active === true before foregrounding switch_tab');
}

// -----------------------------------------------------------------------
// Test 5: Audit doc 243-BACKGROUND-TAB-AUDIT.md exists and contains both
// canonical phrases.
// -----------------------------------------------------------------------

console.log('\n--- Test 5: 243-BACKGROUND-TAB-AUDIT.md presence + canonical phrases ---');
{
  const doc = readSafe(AUDIT_DOC_PATH);
  assert(doc !== null, 'audit doc exists at ' + AUDIT_DOC_PATH);
  if (doc) {
    assert(/zero\s+settimeout\s*>=\s*30s/i.test(doc),
      'audit doc contains "ZERO setTimeout >= 30s" (case-insensitive)');
    assert(/Phase 244 follow-up/.test(doc),
      'audit doc contains "Phase 244 follow-up"');
  }
}

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log('\n========================================');
console.log('Foreground audit results: ' + passed + ' passed, ' + failed + ' failed');
console.log('========================================\n');

process.exit(failed === 0 ? 0 : 1);
