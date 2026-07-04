#!/usr/bin/env node
// print-hermes-yaml.mjs -- prints the canonical Hermes ~/.hermes/config.yaml mcp_servers.fsb block.
// Parity with skills/fsb/SKILL.md metadata.hermes -- enforced by tests/skill-fsb-spec.test.js (TEST-03 extension).
// Mirrors the fail-loud pattern from scripts/print-stdio.mjs (BLOCK constant + defense-in-depth validator).

const BLOCK = `mcp_servers:
  fsb:
    command: "npx"
    args: ["-y", "fsb-mcp-server"]
`;

// Defense-in-depth: BLOCK is hand-written YAML. Node has no stdlib YAML parser,
// so we declare the equivalent JSON shape and assert (a) the JSON validator is
// itself well-formed and (b) the hand-written YAML satisfies string-level
// invariants that prove it round-trips to the same structure. Fail loudly on drift.
const EQUIVALENT = {
  mcp_servers: {
    fsb: {
      command: 'npx',
      args: ['-y', 'fsb-mcp-server']
    }
  }
};

try {
  // Round-trip the JSON form to confirm the validator itself is well-formed.
  const parsed = JSON.parse(JSON.stringify(EQUIVALENT));
  const ok =
    parsed &&
    parsed.mcp_servers &&
    parsed.mcp_servers.fsb &&
    parsed.mcp_servers.fsb.command === 'npx' &&
    Array.isArray(parsed.mcp_servers.fsb.args) &&
    parsed.mcp_servers.fsb.args.length === 2 &&
    parsed.mcp_servers.fsb.args[0] === '-y' &&
    parsed.mcp_servers.fsb.args[1] === 'fsb-mcp-server';
  // Structural string-level guards on the hand-written YAML:
  const yamlOk =
    /^mcp_servers:\n/.test(BLOCK) &&
    /\n {2}fsb:\n/.test(BLOCK) &&
    /\n {4}command: "npx"\n/.test(BLOCK) &&
    /\n {4}args: \["-y", "fsb-mcp-server"\]\n/.test(BLOCK);
  if (!ok || !yamlOk) {
    process.stderr.write('[FAIL] BLOCK constant is not valid YAML/JSON or has drifted\n');
    process.exit(1);
  }
} catch (_err) {
  process.stderr.write('[FAIL] BLOCK constant is not valid YAML/JSON or has drifted\n');
  process.exit(1);
}

process.stdout.write('Paste this into ~/.hermes/config.yaml under the top-level mcp_servers key (merge with existing entries):\n');
process.stdout.write('\n');
process.stdout.write(BLOCK);
process.stdout.write('\n');
process.stdout.write('After saving, restart Hermes so the FSB MCP server registers. See skills/fsb/SKILL.md metadata.hermes for the source-of-truth shape.\n');

process.exit(0);
