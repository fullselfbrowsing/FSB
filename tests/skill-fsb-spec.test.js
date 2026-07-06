'use strict';

/**
 * Phase 251 -- static-content tests for the FSB OpenClaw + Hermes skill at
 * skills/fsb/. Locks SKILL.md frontmatter, scripts/print-stdio.mjs
 * stdio block parity with mcp/src/install.ts, references/*.md
 * completeness, multi-agent typed error coverage, and USAGE.md links
 * against silent regression. Wired into root npm test chain so the
 * existing ci / all-green PR gate covers the skill.
 *
 * No network. No live FSB extension. No build step. No new dev deps.
 *
 * Covers: TEST-01 (CI wiring -- this file is invoked from npm test),
 *         TEST-02 (frontmatter), TEST-03 (stdio parity),
 *         TEST-04 (references), TEST-05 (USAGE links).
 *
 * Run: node tests/skill-fsb-spec.test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const repoRoot = path.resolve(__dirname, '..');
const skillRoot = path.join(repoRoot, 'skills', 'fsb');

const skillMd = path.join(skillRoot, 'SKILL.md');
const usageMd = path.join(skillRoot, 'USAGE.md');
const printStdio = path.join(skillRoot, 'scripts', 'print-stdio.mjs');
const installTs = path.join(repoRoot, 'mcp', 'src', 'install.ts');
const toolDefs = path.join(repoRoot, 'mcp', 'ai', 'tool-definitions.cjs');
const refs = {
  'tool-decision-tree.md': path.join(skillRoot, 'references', 'tool-decision-tree.md'),
  'multi-agent-contract.md': path.join(skillRoot, 'references', 'multi-agent-contract.md'),
  'restricted-tab-recovery.md': path.join(skillRoot, 'references', 'restricted-tab-recovery.md'),
  'default-to-fsb.md': path.join(skillRoot, 'references', 'default-to-fsb.md'),
  'vault-boundary.md': path.join(skillRoot, 'references', 'vault-boundary.md'),
  'visual-session-lifecycle.md': path.join(skillRoot, 'references', 'visual-session-lifecycle.md'),
};

console.log('=== TEST-02: SKILL.md frontmatter ===');

check(fs.existsSync(skillMd), 'SKILL.md exists');
const skillSrc = fs.readFileSync(skillMd, 'utf8');

// Extract frontmatter (between first two --- lines)
const fmMatch = skillSrc.match(/^---\n([\s\S]*?)\n---\n/);
check(fmMatch !== null, 'SKILL.md has YAML frontmatter');
const fm = fmMatch ? fmMatch[1] : '';

// Minimal regex parsing of relevant fields
const nameMatch = fm.match(/^name:\s*(\S.*?)\s*$/m);
check(nameMatch && nameMatch[1] === 'fsb', 'frontmatter name === fsb');

const versionMatch = fm.match(/^version:\s*(\S+)\s*$/m);
check(versionMatch && versionMatch[1] === '0.9.62', 'frontmatter version === 0.9.62');

// requires.bins must include node and npx
const binsMatch = fm.match(/bins:\s*\[([^\]]*)\]/);
check(binsMatch !== null, 'frontmatter has requires.bins array');
if (binsMatch) {
  const bins = binsMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
  check(bins.includes('node'), 'requires.bins includes node');
  check(bins.includes('npx'), 'requires.bins includes npx');
}

// requires.env must be empty
const envMatch = fm.match(/env:\s*\[([^\]]*)\]/);
check(envMatch !== null, 'frontmatter has requires.env array');
if (envMatch) {
  const env = envMatch[1].trim();
  check(env === '' || env.length === 0, 'requires.env is empty array');
}

// metadata.openclaw must be valid JSON with kind: node, package: fsb-mcp-server
const ocMatch = fm.match(/openclaw:\s*(\{[^\n]*\})/);
check(ocMatch !== null, 'frontmatter has metadata.openclaw single-line JSON');
if (ocMatch) {
  let oc = null;
  try { oc = JSON.parse(ocMatch[1]); } catch (e) { /* fail below */ }
  check(oc !== null, 'metadata.openclaw parses as JSON');
  if (oc) {
    check(Array.isArray(oc.install) && oc.install.length >= 1, 'metadata.openclaw.install is non-empty array');
    if (Array.isArray(oc.install) && oc.install.length >= 1) {
      const first = oc.install[0];
      check(first.kind === 'node', 'install[0].kind === node');
      check(first.package === 'fsb-mcp-server', 'install[0].package === fsb-mcp-server');
    }
  }
}

// Forbidden keys
check(!/^priority:/m.test(fm), 'no priority key in frontmatter');
check(!/^must-use:/m.test(fm), 'no must-use key in frontmatter');

// Hermes Skills Hub additions (v0.9.69+): platforms array and metadata.hermes block
check(/^platforms:\s*\[[^\]]*macos[^\]]*\]/m.test(fm), 'frontmatter has platforms array including macos');
check(/^\s*hermes:\s*$/m.test(fm), 'frontmatter metadata has hermes block');

console.log('\n=== TEST-03: stdio block parity ===');

check(fs.existsSync(printStdio), 'scripts/print-stdio.mjs exists');
check(fs.existsSync(installTs), 'mcp/src/install.ts exists');
const printSrc = fs.readFileSync(printStdio, 'utf8');
const installSrc = fs.readFileSync(installTs, 'utf8');

// Both must reference the canonical command shape
check(/"command":\s*"npx"/.test(printSrc), 'print-stdio.mjs has "command": "npx"');
check(/"args":\s*\[\s*"-y"\s*,\s*"fsb-mcp-server"\s*\]/.test(printSrc), 'print-stdio.mjs has args ["-y", "fsb-mcp-server"]');
check(/STDIO_COMMAND\s*=\s*'npx -y fsb-mcp-server'/.test(installSrc), 'install.ts STDIO_COMMAND === "npx -y fsb-mcp-server"');
check(/"command":\s*"npx"/.test(installSrc), 'install.ts has "command": "npx" sample');
check(/"args":\s*\[\s*"-y"\s*,\s*"fsb-mcp-server"\s*\]/.test(installSrc), 'install.ts has args ["-y", "fsb-mcp-server"] sample');

console.log('\n=== TEST-04: references completeness ===');

for (const [name, p] of Object.entries(refs)) {
  check(fs.existsSync(p), `references/${name} exists`);
}

const macSrc = fs.existsSync(refs['multi-agent-contract.md'])
  ? fs.readFileSync(refs['multi-agent-contract.md'], 'utf8')
  : '';
const typedErrors = ['TAB_NOT_OWNED', 'AGENT_CAP_REACHED', 'TAB_INCOGNITO_NOT_SUPPORTED', 'TAB_OUT_OF_SCOPE'];
for (const err of typedErrors) {
  check(macSrc.includes(err), `multi-agent-contract.md mentions ${err}`);
}
check(/\bback\b/.test(macSrc), 'multi-agent-contract.md mentions back tool');

// tool-decision-tree.md tool token cross-reference
const tdtSrc = fs.existsSync(refs['tool-decision-tree.md'])
  ? fs.readFileSync(refs['tool-decision-tree.md'], 'utf8')
  : '';
const toolDefsSrc = fs.readFileSync(toolDefs, 'utf8');
const definedTools = new Set();
const nameRegex = /name:\s*['"]([a-z_][a-z0-9_]*)['"]/g;
let m;
while ((m = nameRegex.exec(toolDefsSrc)) !== null) {
  definedTools.add(m[1]);
}
check(definedTools.size >= 30, `tool-definitions.cjs has >= 30 tools (found ${definedTools.size})`);

// Extract backtick-wrapped tool tokens from tool-decision-tree.md
const tokenRegex = /`([a-z_][a-z0-9_]*)`/g;
const referenced = new Set();
let tm;
while ((tm = tokenRegex.exec(tdtSrc)) !== null) {
  referenced.add(tm[1]);
}
// Allow non-tool-name tokens (e.g., generic words). Filter to those that look like FSB tool names:
// any token that is also in definedTools must NOT be a typo. Conversely, tokens that look like
// tool names but are NOT in definedTools could be drift. Allowlist common non-tool tokens AND
// real MCP tools that live on different surfaces (autopilot, visual sessions) and are
// intentionally not in tool-definitions.cjs.
const nonToolAllowlist = new Set([
  'value', 'autopilot', 'true', 'false', 'undefined', 'null',
  'browser', 'fsb', 'extension', 'mcp', 'openclaw', 'chrome',
  'agent_id', 'session_token', 'client', 'reason',
  // v0.9.62 implicit visual-session field-bundle keys (action-tool inputs, not tools):
  'visual_reason', 'is_final',
  // Real MCP tools served from mcp/src/tools/*.ts (not in mcp/ai/tool-definitions.cjs):
  'run_task', 'stop_task', 'get_task_status',
  'start_visual_session', 'end_visual_session', 'progress_visual_session',
  'fill_credential', 'use_payment_method',
  // Hermes-side imported-tool prefix examples (Hermes auto-prefixes MCP tools as mcp_fsb_<tool>):
  'mcp_fsb_click', 'mcp_fsb_read_page', 'mcp_fsb_type_text',
  'mcp_fsb_get_dom_snapshot', 'mcp_fsb_execute_js',
  // v0.9.90 Capability Catalog MCP tools (mcp runtime surface, not in tool-definitions.cjs):
  'search_capabilities', 'invoke_capability',
  // v0.9.90 Trigger Watchers params / conditions (action inputs, not tools):
  'trigger_id', 'include_terminal', 'delta_percent',
]);
let unknownTokens = [];
for (const token of referenced) {
  if (definedTools.has(token)) continue;       // valid -- defined tool
  if (nonToolAllowlist.has(token)) continue;   // valid -- known non-tool word
  // unknown token; only flag if it looks like a tool name (snake_case with > 1 segment)
  if (/^[a-z]+_[a-z_]+$/.test(token)) {
    unknownTokens.push(token);
  }
}
check(unknownTokens.length === 0, `tool-decision-tree.md tool tokens all defined (unknown: ${unknownTokens.join(', ')})`);

console.log('\n=== TEST-05: USAGE.md links ===');

check(fs.existsSync(usageMd), 'USAGE.md exists');
const usageSrc = fs.readFileSync(usageMd, 'utf8');

const webStoreUrl = 'https://chromewebstore.google.com/detail/badgafnfchcihdfnjneklogedcdkmjfk';
check(usageSrc.includes(webStoreUrl), 'USAGE.md contains exact Chrome Web Store URL');

const githubReleasesPattern = /github\.com\/[^/\s]+\/FSB\/releases/i;
check(githubReleasesPattern.test(usageSrc), 'USAGE.md contains GitHub Releases fallback link');

console.log('\n=== ASCII-only enforcement ===');

// All skill artifacts and this test file must be ASCII-only (project rule).
const asciiArtifacts = [
  skillMd, usageMd, printStdio,
  refs['tool-decision-tree.md'], refs['multi-agent-contract.md'],
  refs['restricted-tab-recovery.md'], refs['default-to-fsb.md'],
  refs['vault-boundary.md'], refs['visual-session-lifecycle.md'],
  // Hermes Skills Hub additions (created in Task 2 of QUICK-260520-gi0).
  // The loop below skips missing files via fs.existsSync, so these are safe
  // to assert pre-Task-2 and become enforced once the files exist.
  path.join(skillRoot, 'references', 'hermes-tool-prefix.md'),
  path.join(skillRoot, 'references', 'v0.9.62-contract-mirror.md'),
  path.join(skillRoot, 'scripts', 'print-hermes-yaml.mjs'),
];
for (const f of asciiArtifacts) {
  if (!fs.existsSync(f)) continue;
  const buf = fs.readFileSync(f);
  let nonAscii = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] > 127) { nonAscii++; }
  }
  check(nonAscii === 0, `${path.relative(repoRoot, f)} is ASCII-only (non-ASCII bytes: ${nonAscii})`);
}

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed > 0) {
  process.exit(1);
}
console.log('All checks passed.');
