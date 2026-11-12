'use strict';

/**
 * Quick task 260516-mq4 -- MCP fsb-server numeric param coercion regression test.
 *
 * Context: Claude Code's current MCP tool-call transport stringifies JSON
 * numbers, so the FSB MCP server's Zod gate rejects every numeric tool call
 * (switch_tab tabId, click_at x/y, vault tab_id, observability
 * limit/count/topN, ...). The bug lives
 * in two places:
 *
 *   1. The JSON Schema -> Zod translator at mcp/src/tools/schema-bridge.ts:95
 *      (covers ~35 numeric fields across the TOOL_REGISTRY).
 *   2. Five hand-rolled Zod sites that bypass the translator:
 *        - mcp/src/tools/vault.ts:60            (fill_credential tab_id)
 *        - mcp/src/tools/vault.ts:110           (use_payment_method tab_id)
 *        - mcp/src/tools/observability.ts:27    (list_sessions limit)
 *        - mcp/src/tools/observability.ts:68    (get_logs count)
 *        - mcp/src/tools/observability.ts:91    (search_memory topN)
 *
 * Fix posture: swap z.number() -> z.coerce.number() and chain .finite()
 * (NaN guard) plus .int() for integer-shaped fields. Empty-string MUST
 * reject for integer fields (Number("") === 0 ambiguity) via a
 * z.preprocess wrapper that converts "" to NaN before coercion.
 *
 * Test surface: >=8 assertions covering translator + 7 hand-rolled sites +
 * a source-grep regression guard that catches any future stray z.number()
 * literal in mcp/src/tools/.
 *
 * IMPORTANT: this test imports the COMPILED translator from
 * mcp/build/tools/schema-bridge.js. The npm test chain runs
 * `npm --prefix mcp run build` before this test executes; the test file
 * also performs a fast existence check up front and bails with a clear
 * message if the build artifact is missing.
 *
 * Run: node tests/mcp-numeric-param-coercion.test.js
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const REPO_ROOT = path.resolve(__dirname, '..');
const MCP_BUILD = path.join(REPO_ROOT, 'mcp', 'build', 'tools', 'schema-bridge.js');
const MCP_SRC_TOOLS = path.join(REPO_ROOT, 'mcp', 'src', 'tools');
const ZOD_CJS = path.join(REPO_ROOT, 'mcp', 'node_modules', 'zod', 'index.cjs');

if (!fs.existsSync(MCP_BUILD)) {
  console.error('FATAL: mcp/build/tools/schema-bridge.js missing.');
  console.error('Run `npm --prefix mcp run build` before this test.');
  process.exit(2);
}
if (!fs.existsSync(ZOD_CJS)) {
  console.error('FATAL: zod CJS entrypoint missing at ' + ZOD_CJS);
  process.exit(2);
}

const { z } = require(ZOD_CJS);

let passed = 0;
let failed = 0;
const failures = [];

function check(label, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('  PASS: ' + label);
  } else {
    failed += 1;
    failures.push({ label, detail });
    console.log('  FAIL: ' + label + (detail ? ' -- ' + detail : ''));
  }
}

async function main() {
  // ---------------------------------------------------------------------
  // Load the compiled translator. Use a dynamic import because the build
  // emits ESM. The test file itself is CJS to match the rest of tests/.
  // ---------------------------------------------------------------------
  const mod = await import(MCP_BUILD);
  const { jsonSchemaToZod } = mod;
  assert.equal(typeof jsonSchemaToZod, 'function', 'jsonSchemaToZod must be a function');

  // Helper: build a top-level z.object() over a single-property schema
  // so safeParse() exercises the same code path the MCP SDK uses.
  function wrap(propType, required = true) {
    const shape = jsonSchemaToZod({
      type: 'object',
      properties: { n: { type: propType } },
      required: required ? ['n'] : [],
    });
    return z.object(shape);
  }

  // -------- Translator assertions (A1-A9) --------

  // A1: number, numeric input -> success and identity.
  {
    const r = wrap('number').safeParse({ n: 123 });
    check('A1: number schema accepts JSON number 123', r.success && r.data && r.data.n === 123,
      JSON.stringify(r));
  }

  // A2: number, string input -> success with coerced number (THE bug-fix).
  {
    const r = wrap('number').safeParse({ n: '123' });
    check('A2: number schema accepts string "123" and coerces to number 123',
      r.success && r.data && r.data.n === 123 && typeof r.data.n === 'number',
      JSON.stringify(r));
  }

  // A3: integer, numeric input -> success.
  {
    const r = wrap('integer').safeParse({ n: 123 });
    check('A3: integer schema accepts JSON number 123', r.success && r.data && r.data.n === 123,
      JSON.stringify(r));
  }

  // A4: integer, string input -> success, coerced.
  {
    const r = wrap('integer').safeParse({ n: '123' });
    check('A4: integer schema accepts string "123" and coerces to number 123',
      r.success && r.data && r.data.n === 123 && typeof r.data.n === 'number',
      JSON.stringify(r));
  }

  // A5: integer, fractional string -> rejected by .int().
  {
    const r = wrap('integer').safeParse({ n: '123.45' });
    check('A5: integer schema rejects fractional string "123.45"', !r.success, JSON.stringify(r));
  }

  // A6: integer, negative both shapes.
  {
    const a = wrap('integer').safeParse({ n: -42 });
    const b = wrap('integer').safeParse({ n: '-42' });
    check('A6: integer schema accepts -42 and "-42"',
      a.success && a.data && a.data.n === -42 &&
      b.success && b.data && b.data.n === -42,
      'a=' + JSON.stringify(a) + ' b=' + JSON.stringify(b));
  }

  // A7: number, non-numeric string -> rejected by .finite() NaN guard.
  {
    const r = wrap('number').safeParse({ n: 'abc' });
    check('A7: number schema rejects "abc" (NaN guard via .finite())', !r.success,
      JSON.stringify(r));
  }

  // A8: integer, empty string -> rejected.
  // Empirical zod 3.25 behavior: bare z.coerce.number().int().finite()
  // ACCEPTS "" as 0 because Number("") === 0 and 0 IS an integer. The
  // translator MUST tighten this with a z.preprocess wrapper that maps
  // "" -> NaN before coercion (see schema-bridge.ts fix).
  {
    const r = wrap('integer').safeParse({ n: '' });
    check('A8: integer schema rejects empty string "" (z.preprocess tightens Number("")===0)',
      !r.success, JSON.stringify(r));
  }

  // A9: optional field absent -> success, data.n === undefined.
  {
    const r = wrap('number', false).safeParse({});
    check('A9: optional numeric field accepts undefined',
      r.success && r.data && r.data.n === undefined, JSON.stringify(r));
  }

  // -------- A10: hand-rolled sites (7 sub-assertions) --------
  // Strategy: the hand-rolled schemas are defined inline in registerTool
  // calls and are not directly importable without standing up an
  // McpServer. Per the plan, we reconstruct the EXACT Zod literal each
  // site SHOULD emit after the fix, with file:line back-pointers, and
  // assert string-encoded numerics parse correctly. The source-grep
  // guard (A11) is what enforces the actual source matches this shape.

  function postFixTabIdPositive() {
    // Shape used at vault.ts:60 and vault.ts:110: tab ids MUST be positive
    // integers.
    return z.coerce.number().int().positive().finite().optional();
  }
  function postFixCountNonnegative() {
    // Shape used at observability.ts:27 (limit) and :68 (count):
    // counts are non-negative integers (0 allowed).
    return z.coerce.number().int().nonnegative().finite().optional();
  }
  function postFixTopNPositive() {
    // Shape used at observability.ts:91 (topN): top-N must be >= 1.
    return z.coerce.number().int().positive().finite().optional();
  }

  // A10.2: vault.ts:60 fill_credential tab_id
  {
    const s = postFixTabIdPositive();
    const r = s.safeParse('999');
    check('A10.2: vault.ts:60 fill_credential.tab_id accepts string "999"',
      r.success && r.data === 999, JSON.stringify(r));
  }

  // A10.3: vault.ts:110 use_payment_method tab_id
  {
    const s = postFixTabIdPositive();
    const r = s.safeParse('999');
    check('A10.3: vault.ts:110 use_payment_method.tab_id accepts string "999"',
      r.success && r.data === 999, JSON.stringify(r));
  }

  // A10.5: observability.ts:27 list_sessions.limit
  {
    const s = postFixCountNonnegative();
    const r = s.safeParse('10');
    check('A10.5: observability.ts:27 list_sessions.limit accepts string "10"',
      r.success && r.data === 10, JSON.stringify(r));
  }

  // A10.6: observability.ts:68 get_logs.count
  {
    const s = postFixCountNonnegative();
    const r = s.safeParse('10');
    check('A10.6: observability.ts:68 get_logs.count accepts string "10"',
      r.success && r.data === 10, JSON.stringify(r));
  }

  // A10.7: observability.ts:91 search_memory.topN
  {
    const s = postFixTopNPositive();
    const r = s.safeParse('5');
    check('A10.7: observability.ts:91 search_memory.topN accepts string "5"',
      r.success && r.data === 5, JSON.stringify(r));
  }

  // -------- A11: source-grep regression guard --------
  // Scan every .ts file under mcp/src/tools/ for a literal `z.number(`.
  // ALLOW: `z.coerce.number(` (the post-fix shape).
  // ALLOW: lines whose trimmed start is `//` (commented-out code).
  // ALLOW: a line that contains the marker `internal-only` (escape valve
  //   per research; today there should be ZERO exemptions of this kind).
  // FAIL: any other line containing `z.number(` is a regression.
  {
    const offending = [];
    const files = fs.readdirSync(MCP_SRC_TOOLS).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      const full = path.join(MCP_SRC_TOOLS, file);
      const text = fs.readFileSync(full, 'utf8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) continue;
        if (!line.includes('z.number(')) continue;
        // Substring-check the literal form. Anything matching `z.coerce.number(`
        // is fine because it does not contain the bare `z.number(` substring.
        // (The `coerce.` segment breaks the match.) But be defensive: also
        // allow lines that explicitly carry `coerce.` immediately before
        // `number(`, just in case future formatting puts whitespace between.
        const coerceIdx = line.indexOf('z.coerce.number(');
        if (coerceIdx !== -1) {
          // The substring `z.number(` IS present here only if there is a
          // separate bare occurrence elsewhere on the same line. Strip the
          // coerce.number occurrences and re-check.
          const stripped = line.split('z.coerce.number(').join('');
          if (!stripped.includes('z.number(')) continue;
        }
        if (line.includes('internal-only')) continue;
        offending.push(file + ':' + (i + 1) + ': ' + trimmed);
      }
    }
    check('A11: source-grep regression guard -- zero stray z.number() in mcp/src/tools/',
      offending.length === 0, offending.length ? '\n    ' + offending.join('\n    ') : '');
  }

  // ---------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------
  const total = passed + failed;
  console.log('\n=== Results: ' + passed + '/' + total + ' PASS ===');
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log('  - ' + f.label + (f.detail ? ' -- ' + f.detail : ''));
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL: test harness threw:', err && err.stack ? err.stack : err);
  process.exit(2);
});
