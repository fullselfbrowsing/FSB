/**
 * Static-grep CI gate -- fails the build if extension/utils/telemetry-collector.js
 * source code (with comments stripped) contains any banned identifier outside
 * of comments.
 *
 * Phase 272 / v0.9.69. Enforces CONTEXT decision "Privacy gate" + BEAT-04 + the
 * versioned allowlist (event_id, install_uuid, ts_minute, mcp_client, model,
 * tokens_in, tokens_out, active_agent_count, event_type). The collector is
 * the sole site that constructs the outbound beat payload, and the construction
 * MUST come from a narrow allowlist. Phase 271 row fields (tool, cost_usd,
 * pricing_confidence, token_source) MUST NOT appear; classic-PII identifiers
 * (prompt, href, innerHTML, outerHTML, clipboard, Cookie, Authorization,
 * .value) MUST NOT appear; and `url`-as-an-identifier MUST NOT appear (the
 * hardcoded TELEMETRY_ENDPOINT string literal is its own runtime constant,
 * and is allowed since it doesn't trip a whole-word `\burl\b` match -- we
 * test the gate against the as-shipped source and confirm zero hits).
 *
 * NOTE on `url`: the static gate scans for the BARE token `\burl\b`, which
 * matches `url` as a standalone identifier or property key. The constant
 * TELEMETRY_ENDPOINT value (the literal string starting with "https://...")
 * does NOT contain the word `url`. Variable names like "fetchUrl" would NOT
 * match `\burl\b` either, but any code that named a variable just `url`
 * WOULD. This is intentional: PII-leak gates flag implementation patterns,
 * not URL constants.
 *
 * Banned identifiers (case-insensitive unless noted; whole-word match):
 *   Phase 272 / payload-shape:
 *     - tool, cost_usd, pricing_confidence, token_source
 *   Classic PII identifiers carried over from tests/mcp-metrics-no-pii-leak:
 *     - prompt, url, href, innerHTML, outerHTML, clipboard
 *     - Cookie (CASE-SENSITIVE), Authorization (CASE-SENSITIVE)
 *     - .value (whole-token .value read)
 *
 * The gate strips line and block comments BEFORE scanning so legitimate
 * code-comment references do not trip the gate. RUNTIME references only.
 *
 * Failure mode: exit 1 with a list of which banned identifier(s) matched.
 * The fix is to repair the collector, not the gate.
 *
 * Run: node tests/telemetry-payload-allowlist.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const COLLECTOR_PATH = path.join(__dirname, '..', 'extension', 'utils', 'telemetry-collector.js');
const src = fs.readFileSync(COLLECTOR_PATH, 'utf8');

// Strip /* ... */ blocks first, then // line comments. Order matters: stripping
// line comments first would prematurely chop the */ of an unterminated block.
function stripComments(s) {
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return s;
}
const code = stripComments(src);

// 13 banned identifiers per Phase 272 hard constraint.
//   `tool`, `cost_usd`, `pricing_confidence`, `token_source` are Phase 271
//   row fields that must NOT be copied into the outbound payload.
//   `prompt`, `url`, `href`, `innerHTML`, `outerHTML`, `clipboard`,
//   `Cookie`, `Authorization`, `.value` are classic PII identifiers carried
//   over from tests/mcp-metrics-no-pii-leak.test.js.
const BANNED = [
  // Phase 272 -- forbidden Phase 271 row fields
  { name: 'tool',               re: /\btool\b/i },
  { name: 'cost_usd',           re: /\bcost_usd\b/i },
  { name: 'pricing_confidence', re: /\bpricing_confidence\b/i },
  { name: 'token_source',       re: /\btoken_source\b/i },
  // Classic PII identifiers (mirror of tests/mcp-metrics-no-pii-leak.test.js)
  { name: 'prompt',             re: /\bprompt\b/i },
  { name: 'url',                re: /\burl\b/i },
  { name: 'href',               re: /\bhref\b/i },
  { name: 'innerHTML',          re: /\binnerHTML\b/ },
  { name: 'outerHTML',          re: /\bouterHTML\b/ },
  { name: 'clipboard',          re: /\bclipboard\b/i },
  { name: 'Cookie',             re: /\bCookie\b/ },
  { name: 'Authorization',      re: /\bAuthorization\b/ },
  { name: '.value read',        re: /\.value\b/ }
];

const violations = [];
for (const b of BANNED) {
  const m = code.match(b.re);
  if (m) {
    // Locate line number to make the failure actionable.
    const idx = code.indexOf(m[0]);
    const line = code.slice(0, idx).split('\n').length;
    violations.push("Banned identifier '" + b.name + "' (match: '" + m[0] + "') at line " + line + " of " + COLLECTOR_PATH);
  }
}

if (violations.length > 0) {
  console.error('FAIL: telemetry-collector.js contains banned identifier(s):');
  for (const v of violations) console.error('  - ' + v);
  console.error('See Phase 272 CONTEXT.md "Privacy gate" + BEAT-04.');
  console.error('Fix the collector; do NOT weaken this gate.');
  process.exit(1);
}

console.log('PASS: telemetry-collector.js source contains no banned identifiers.');
console.log('  - 13 banned patterns scanned: tool, cost_usd, pricing_confidence, token_source,');
console.log('    prompt, url, href, innerHTML, outerHTML, clipboard, Cookie, Authorization, .value');
console.log('  - Scanned bytes (comment-stripped): ' + code.length + ' / raw: ' + src.length);
process.exit(0);
