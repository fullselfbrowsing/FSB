#!/usr/bin/env node
// print-stdio.mjs -- prints the canonical OpenClaw stdio MCP config block (SKILL-04 / SKILL-06)
// Block parity with mcp/src/install.ts STDIO_COMMAND (line 28) and Claude Desktop section (~lines 170-176)
// -- enforced at CI time by tests/skill-fsb-spec.test.js (Phase 251 TEST-03).

const BLOCK = `{
  "mcpServers": {
    "fsb": {
      "command": "npx",
      "args": ["-y", "fsb-mcp-server"]
    }
  }
}
`;

// Defense-in-depth: BLOCK is hard-coded but verify it is valid JSON and matches
// the canonical structure. If this ever drifts, fail loudly before printing.
try {
  const parsed = JSON.parse(BLOCK);
  const ok =
    parsed &&
    parsed.mcpServers &&
    parsed.mcpServers.fsb &&
    parsed.mcpServers.fsb.command === 'npx' &&
    Array.isArray(parsed.mcpServers.fsb.args) &&
    parsed.mcpServers.fsb.args.length === 2 &&
    parsed.mcpServers.fsb.args[0] === '-y' &&
    parsed.mcpServers.fsb.args[1] === 'fsb-mcp-server';
  if (!ok) {
    process.stderr.write('[FAIL] BLOCK constant is not valid JSON or has drifted\n');
    process.exit(1);
  }
} catch (err) {
  process.stderr.write('[FAIL] BLOCK constant is not valid JSON or has drifted\n');
  process.exit(1);
}

process.stdout.write('Paste this into your OpenClaw MCP config:\n');
process.stdout.write('\n');
process.stdout.write(BLOCK);
process.stdout.write('\n');
process.stdout.write('If your OpenClaw build documents a different shape, see mcp/src/install.ts getSetupSections() (canonical source of truth).\n');

process.exit(0);
