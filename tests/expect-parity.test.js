'use strict';

/**
 * Phase 69 Plan 07 (MCP-02, MCP-04; CONTEXT D-12, D-15, D-19, D-20, D-25):
 * producer/validator parity for the same-call `expect` contract.
 *
 * The contract is hand-mirrored across two runtimes (gotcha 6): the MCP
 * server (mcp/src/tools/manual.ts, plan 69-06) and the extension
 * (extension/utils/action-verification.js, plan 69-03), plus the sidecar
 * strip lists (plan 69-05) and the smoke test's sidecar guard. Every mirror is
 * compared here in one place so a drift on either side fails `npm test`
 * instead of silently changing what a caller sees.
 *
 * It also keeps the 4,500-character _handleExecuteAction ownership-guard
 * window honest (RESEARCH Finding 5 / Pitfall 3, T-69-07): two suites gate
 * their checks on resolveAgentTabOrError being inside that window and print
 * "skipped" when it is not. This test fails instead.
 *
 * No ports, no git, no child processes; Node 20 safe.
 *
 * Run: npm --prefix mcp run build && node tests/expect-parity.test.js
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const HELPER_PATH = path.join(__dirname, 'helpers', 'mcp-in-process.mjs');
const MANUAL_BUILD_PATH = path.join(REPO_ROOT, 'mcp', 'build', 'tools', 'manual.js');
const DESCRIPTIONS_BUILD_PATH = path.join(REPO_ROOT, 'mcp', 'build', 'tools', 'descriptions.js');
const DISPATCHER_PATH = path.join(REPO_ROOT, 'extension', 'ws', 'mcp-tool-dispatcher.js');
const BRIDGE_CLIENT_PATH = path.join(REPO_ROOT, 'extension', 'ws', 'mcp-bridge-client.js');
const JOURNAL_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'mcp-lattice-journal.js');
const RECORDER_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'mcp-session-recorder.js');
const SMOKE_TEST_PATH = path.join(__dirname, 'mcp-tool-smoke.test.js');

// The same window tests/action-tool-agent-scoped.test.js and
// tests/ownership-error-codes.test.js slice (their blockOf helpers).
const GUARD_WINDOW_CHARS = 4500;

const av = require('../extension/utils/action-verification.js');

let passed = 0;
let failed = 0;

function check(cond, msg, detail) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
    if (detail) console.error(`        ${String(detail).split('\n').join('\n        ')}`);
  }
}

function sides(mcpValue, extValue) {
  return `MCP side:       ${JSON.stringify(mcpValue)}\nextension side: ${JSON.stringify(extValue)}`;
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function readSource(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// Body of a top-level `function name(` declaration, up to the next top-level
// function declaration (column 0). Empty when the declaration is missing.
function topLevelFunctionSource(source, name) {
  const start = source.indexOf(`\nfunction ${name}(`);
  if (start === -1) return '';
  const next = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const ends = [next, nextAsync].filter((index) => index !== -1);
  return source.slice(start + 1, ends.length > 0 ? Math.min(...ends) : source.length);
}

// A fake clock for evaluateExpectation: sleep advances time instantly.
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += Math.max(0, Number(ms) || 0); } };
}

// Every value-kind check obeys the D-19 observed rule: observed is null, the
// redaction marker, or the caller's own expected string. Never a page read.
function valueChecksObeyObservedRule(result) {
  const valueChecks = (result && Array.isArray(result.checks) ? result.checks : [])
    .filter((c) => c && c.kind === 'value');
  return valueChecks.length > 0 && valueChecks.every((c) => (
    c.observed === null || c.observed === av.EXPECT_REDACTED || c.observed === c.expected
  ));
}

// Every predicate at once (D-13): seven checks in the extension's fixed order.
const FULL_SPEC = Object.freeze({
  url_includes: '/done',
  title_includes: 'Done',
  text_visible: 'Saved',
  text_gone: 'Loading',
  selector: '#q',
  state: 'checked',
  value: 'hunter2',
  dialog_open: true,
  timeout_ms: 1500,
});

// One accept/reject table, run through BOTH validators (D-16): the MCP schema
// (EXPECT_SHAPE.expect, whose z.preprocess applies parseExpectArg) and the
// extension's normalizeExpectSpec. They must agree on every row.
const VALIDATOR_ROWS = Object.freeze([
  { label: 'empty object', input: {}, accept: false },
  { label: 'timeout_ms only (no predicate)', input: { timeout_ms: 100 }, accept: false },
  { label: 'unknown key', input: { bogus: 1 }, accept: false },
  { label: 'text_visible not a string', input: { text_visible: 5 }, accept: false },
  { label: 'empty text_visible', input: { text_visible: '' }, accept: false },
  { label: 'empty selector with state', input: { selector: '', state: 'visible' }, accept: false },
  { label: 'state without selector', input: { state: 'checked' }, accept: false },
  { label: 'value without selector', input: { value: 'x' }, accept: false },
  { label: 'state outside the enum', input: { selector: '#a', state: 'bogus' }, accept: false },
  { label: '2,001-character text_visible', input: { text_visible: 'x'.repeat(2001) }, accept: false },
  { label: "selector with value '' (clear_input check)", input: { selector: '#q', value: '' }, accept: true },
  { label: 'selector alone (state visible)', input: { selector: '#a' }, accept: true },
  { label: 'every predicate', input: { ...FULL_SPEC }, accept: true },
  // Extra rows where both validators are expected to agree.
  { label: 'fractional timeout_ms', input: { text_visible: 'a', timeout_ms: 1.5 }, accept: false },
  { label: 'non-numeric timeout_ms string', input: { text_visible: 'a', timeout_ms: 'abc' }, accept: false },
  { label: 'empty timeout_ms string', input: { text_visible: 'a', timeout_ms: '' }, accept: false },
  { label: 'numeric timeout_ms string', input: { text_visible: 'a', timeout_ms: '3000' }, accept: true },
  { label: 'out-of-range timeout_ms (clamped, not rejected)', input: { text_visible: 'a', timeout_ms: 99999 }, accept: true },
  // 69-REVIEW WR-02: null is omitted; nothing else non-numeric is coerced.
  { label: 'timeout_ms null (omitted, the default applies)', input: { text_visible: 'a', timeout_ms: null }, accept: true },
  { label: 'timeout_ms true', input: { text_visible: 'a', timeout_ms: true }, accept: false },
  { label: 'timeout_ms false', input: { text_visible: 'a', timeout_ms: false }, accept: false },
  { label: 'whitespace-only timeout_ms string', input: { text_visible: 'a', timeout_ms: '   ' }, accept: false },
  { label: 'timeout_ms as an array', input: { text_visible: 'a', timeout_ms: [500] }, accept: false },
  { label: 'timeout_ms as an empty array', input: { text_visible: 'a', timeout_ms: [] }, accept: false },
  // 69-REVIEW WR-03: whitespace collapses to '', which would match vacuously.
  { label: 'whitespace-only text_visible', input: { text_visible: '   ' }, accept: false },
  { label: 'whitespace-only title_includes', input: { title_includes: ' \t\n ' }, accept: false },
  { label: 'whitespace-only text_gone', input: { text_gone: '  ' }, accept: false },
  { label: 'whitespace-only url_includes', input: { url_includes: ' ' }, accept: false },
  { label: 'whitespace-only selector', input: { selector: '  ' }, accept: false },
  { label: 'whitespace-only value (a real check)', input: { selector: '#q', value: '   ' }, accept: true },
  { label: 'text_visible with inner spaces', input: { text_visible: ' Order saved ' }, accept: true },
  { label: 'dialog_open as a string', input: { dialog_open: 'true' }, accept: false },
  { label: 'dialog_open false', input: { dialog_open: false }, accept: true },
  { label: '2,000-character text_visible (at the cap)', input: { text_visible: 'x'.repeat(2000) }, accept: true },
  { label: 'state gone', input: { selector: '#spinner', state: 'gone' }, accept: true },
]);

const CLAMP_INPUTS = Object.freeze([undefined, null, 'abc', NaN, -5, 0, 1234.9, '3000', 99999, Infinity]);

(async () => {
  const helper = await import(pathToFileURL(HELPER_PATH).href);
  try {
    helper.assertBuildFresh();
  } catch (error) {
    check(false, 'mcp/build is present and fresh', error && error.message);
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(1);
  }
  const manual = await import(pathToFileURL(MANUAL_BUILD_PATH).href);
  const descriptions = await import(pathToFileURL(DESCRIPTIONS_BUILD_PATH).href);

  // -------------------------------------------------------------------------
  console.log('\n--- D-12: the 29-tool list (MCP build, extension, test helper) ---');
  {
    const mcpNames = Array.from(manual.EXPECT_TOOL_NAMES || []);
    const extNames = Array.from(av.EXPECT_TOOL_NAMES || []);
    const helperNames = Array.from(helper.EXPECT_TOOL_NAMES_VERBATIM || []);
    check(sameJson(mcpNames, extNames), 'MCP EXPECT_TOOL_NAMES equals the extension EXPECT_TOOL_NAMES (same order)',
      sides(mcpNames, extNames));
    check(sameJson(helperNames, extNames), 'the helper EXPECT_TOOL_NAMES_VERBATIM equals the extension list (same order)',
      `helper:         ${JSON.stringify(helperNames)}\nextension side: ${JSON.stringify(extNames)}`);
    check(extNames.length === 29 && new Set(extNames).size === 29, 'the list holds 29 distinct names',
      `length ${extNames.length}, distinct ${new Set(extNames).size}`);
    const mcpSet = manual.EXPECT_TOOL_SET;
    check(mcpSet instanceof Set && mcpSet.size === mcpNames.length && mcpNames.every((name) => mcpSet.has(name)),
      'MCP EXPECT_TOOL_SET holds exactly EXPECT_TOOL_NAMES');
    const nav = Array.from(av.EXPECT_NAV_TOOL_NAMES || []);
    check(nav.length === 5 && nav.every((name) => extNames.includes(name)),
      'the extension navigation subset is inside the 29', JSON.stringify(nav));
  }

  // -------------------------------------------------------------------------
  console.log('\n--- D-20: default, cap, string cap and the clamp table ---');
  {
    check(manual.EXPECT_DEFAULT_TIMEOUT_MS === av.EXPECT_DEFAULT_TIMEOUT_MS,
      `default timeout matches (${av.EXPECT_DEFAULT_TIMEOUT_MS} ms)`,
      sides(manual.EXPECT_DEFAULT_TIMEOUT_MS, av.EXPECT_DEFAULT_TIMEOUT_MS));
    check(manual.EXPECT_MAX_TIMEOUT_MS === av.EXPECT_MAX_TIMEOUT_MS,
      `timeout cap matches (${av.EXPECT_MAX_TIMEOUT_MS} ms)`,
      sides(manual.EXPECT_MAX_TIMEOUT_MS, av.EXPECT_MAX_TIMEOUT_MS));
    check(manual.EXPECT_STRING_MAX === av.EXPECT_STRING_MAX,
      `string cap matches (${av.EXPECT_STRING_MAX} characters)`,
      sides(manual.EXPECT_STRING_MAX, av.EXPECT_STRING_MAX));
    check(av.EXPECT_DEFAULT_TIMEOUT_MS === 2000 && av.EXPECT_MAX_TIMEOUT_MS === 5000 && av.EXPECT_STRING_MAX === 2000,
      'the D-20 values are 2,000 ms default, 5,000 ms cap and a 2,000-character string cap',
      `default ${av.EXPECT_DEFAULT_TIMEOUT_MS}, cap ${av.EXPECT_MAX_TIMEOUT_MS}, string ${av.EXPECT_STRING_MAX}`);
    for (const input of CLAMP_INPUTS) {
      const mcpValue = manual.clampExpectTimeoutMs(input);
      const extValue = av.clampExpectTimeoutMs(input);
      const label = typeof input === 'string' ? JSON.stringify(input) : String(input);
      check(Object.is(mcpValue, extValue), `clampExpectTimeoutMs(${label}) agrees (${extValue})`,
        sides(mcpValue, extValue));
    }
  }

  // -------------------------------------------------------------------------
  console.log('\n--- D-19: result keys, check keys, kinds, reasons (version-skew fill) ---');
  {
    const mcpResult = manual.buildUnsupportedExpectResult({ ...FULL_SPEC });
    const normalized = av.normalizeExpectSpec({ ...FULL_SPEC });
    check(normalized.ok === true, 'the extension accepts the every-predicate spec', JSON.stringify(normalized));
    const extResult = normalized.ok ? av.buildUncertainExpectResult(normalized.spec, 'extension_unsupported') : null;

    const resultKeys = Object.keys(mcpResult);
    check(resultKeys.every((key) => av.EXPECT_RESULT_KEYS.includes(key)),
      'MCP buildUnsupportedExpectResult uses only EXPECT_RESULT_KEYS',
      `keys ${JSON.stringify(resultKeys)} vs ${JSON.stringify(av.EXPECT_RESULT_KEYS)}`);
    check(sameJson(resultKeys, Array.from(av.EXPECT_RESULT_KEYS)),
      'an uncertain MCP result carries every EXPECT_RESULT_KEYS key in order (reason included)',
      `keys ${JSON.stringify(resultKeys)} vs ${JSON.stringify(av.EXPECT_RESULT_KEYS)}`);
    const checks = Array.isArray(mcpResult.checks) ? mcpResult.checks : [];
    check(checks.length > 0 && checks.every((c) => sameJson(Object.keys(c), Array.from(av.EXPECT_CHECK_KEYS))),
      'every MCP check object has exactly EXPECT_CHECK_KEYS',
      JSON.stringify(checks.map((c) => Object.keys(c))));
    const mcpKinds = checks.map((c) => c.kind);
    check(sameJson(mcpKinds, Array.from(av.EXPECT_CHECK_KINDS)),
      'the every-predicate spec yields all EXPECT_CHECK_KINDS in the extension fixed order',
      sides(mcpKinds, av.EXPECT_CHECK_KINDS));
    const extKinds = extResult ? extResult.checks.map((c) => c.kind) : null;
    check(sameJson(mcpKinds, extKinds),
      'MCP and extension uncertain results list the same check kinds in the same order',
      sides(mcpKinds, extKinds));
    check(mcpResult.reason === 'extension_unsupported' && av.EXPECT_UNCERTAIN_REASONS.includes(mcpResult.reason),
      "MCP reason 'extension_unsupported' is one of EXPECT_UNCERTAIN_REASONS", String(mcpResult.reason));
    check(mcpResult.status === 'uncertain' && av.EXPECT_STATUSES.includes(mcpResult.status)
      && checks.every((c) => av.EXPECT_CHECK_STATUSES.includes(c.status)),
      'MCP statuses come from EXPECT_STATUSES / EXPECT_CHECK_STATUSES');
    const valueCheck = checks.find((c) => c.kind === 'value');
    check(Boolean(valueCheck) && valueCheck.expected === av.EXPECT_REDACTED,
      "MCP value check's expected is the extension's EXPECT_REDACTED", JSON.stringify(valueCheck));

    // The two version-skew/fallback builders produce the same bytes for the
    // same spec (key order included), so an older extension and an evaluator
    // that could not run look identical to a caller.
    const specs = [
      { ...FULL_SPEC },
      { selector: '#a' },
      { selector: '#q', value: '' },
      { selector: '#pw', value: 'hunter2', timeout_ms: 99999 },
      { text_visible: 'y'.repeat(130), timeout_ms: '3000' },
      { url_includes: '/done', dialog_open: false, timeout_ms: -5 },
    ];
    for (const spec of specs) {
      const mcpOut = manual.buildUnsupportedExpectResult(spec);
      const n = av.normalizeExpectSpec(spec);
      const extOut = n.ok ? av.buildUncertainExpectResult(n.spec, 'extension_unsupported') : n;
      check(sameJson(mcpOut, extOut),
        `buildUnsupportedExpectResult === buildUncertainExpectResult for ${JSON.stringify(spec).slice(0, 80)}`,
        sides(mcpOut, extOut));
    }
  }

  // -------------------------------------------------------------------------
  console.log('\n--- D-20: back headroom vs the 750 ms probe race; expect description size ---');
  {
    const dispatcherSrc = readSource(DISPATCHER_PATH);
    const matches = [...dispatcherSrc.matchAll(/const _PAGE_INJECTION_TIMEOUT_MS = (\d+);/g)];
    check(matches.length === 1, 'the dispatcher declares _PAGE_INJECTION_TIMEOUT_MS exactly once',
      `found ${matches.length}`);
    const probeRace = matches.length === 1 ? Number(matches[0][1]) : NaN;
    check(Number.isFinite(probeRace) && manual.EXPECT_BRIDGE_HEADROOM_MS > probeRace,
      `EXPECT_BRIDGE_HEADROOM_MS (${manual.EXPECT_BRIDGE_HEADROOM_MS}) exceeds the probe race (${probeRace} ms)`,
      sides(manual.EXPECT_BRIDGE_HEADROOM_MS, probeRace));
    const description = descriptions.MCP_EXPECT_DESCRIPTION;
    check(typeof description === 'string' && description.length > 0 && description.length <= 160,
      `MCP_EXPECT_DESCRIPTION is at most 160 characters (${description && description.length})`);
  }

  // -------------------------------------------------------------------------
  console.log('\n--- D-16: one accept/reject table through both validators ---');
  {
    const schema = manual.EXPECT_SHAPE && manual.EXPECT_SHAPE.expect;
    check(Boolean(schema) && typeof schema.safeParse === 'function', 'MCP EXPECT_SHAPE.expect is a zod schema');
    for (const row of VALIDATOR_ROWS) {
      const mcpVerdict = schema.safeParse(row.input).success === true;
      const extVerdict = av.normalizeExpectSpec(row.input).ok === true;
      const shown = JSON.stringify(row.input);
      const brief = shown.length > 70 ? `${shown.slice(0, 67)}...` : shown;
      check(mcpVerdict === extVerdict && extVerdict === row.accept,
        `${row.accept ? 'accept' : 'reject'}: ${row.label}`,
        `row:       ${brief}\nwant:      ${row.accept ? 'accept' : 'reject'}\n`
          + `MCP:       ${mcpVerdict ? 'accept' : 'reject'}\nextension: ${extVerdict ? 'accept' : 'reject'}`);
    }
  }

  // -------------------------------------------------------------------------
  console.log('\n--- D-19 / D-25: one redaction marker, and the value-check observed rule ---');
  {
    const mcpMarker = manual.buildUnsupportedExpectResult({ selector: '#a', value: 'x' })
      .checks.find((c) => c.kind === 'value').expected;
    check(mcpMarker === av.EXPECT_REDACTED, `the MCP marker equals EXPECT_REDACTED (${av.EXPECT_REDACTED})`,
      sides(mcpMarker, av.EXPECT_REDACTED));

    const RAW_PAGE_VALUE = 'secret-token-123';
    const tab = { id: 7, url: 'https://example.test/form', title: 'Form', status: 'complete' };

    // 1. The extension evaluator with a canned unmet value observation that
    //    carries a raw page value (a regressed probe).
    async function evaluateCanned(spec, observation) {
      const clock = fakeClock();
      return av.evaluateExpectation({
        tabId: 7,
        spec,
        deps: {
          tabsGet: async () => ({ ...tab }),
          executeProbe: async () => ({
            ok: true,
            documentId: 'doc-1',
            result: { ok: true, observations: [observation], textTruncated: false },
          }),
          now: clock.now,
          sleep: clock.sleep,
        },
      });
    }
    const unmet = await evaluateCanned({ selector: '#email', value: 'a@b.c', timeout_ms: 0 },
      { kind: 'value', observable: true, holds: false, observed: RAW_PAGE_VALUE, redact: false });
    check(unmet.status === 'unmet', 'evaluateExpectation: the canned plain-field value check is unmet', JSON.stringify(unmet));
    check(valueChecksObeyObservedRule(unmet), 'evaluateExpectation: value observed is null, the marker or its own expected',
      JSON.stringify(unmet.checks));
    check(unmet.checks[0] && unmet.checks[0].observed === av.EXPECT_REDACTED,
      "evaluateExpectation: an unmet plain-field value is observed '[redacted]'", JSON.stringify(unmet.checks[0]));
    check(!JSON.stringify(unmet).includes(RAW_PAGE_VALUE), 'evaluateExpectation: the raw page value appears nowhere in the result');

    const sensitive = await evaluateCanned({ selector: '#pw', value: 'hunter2', timeout_ms: 0 },
      { kind: 'value', observable: true, holds: true, observed: RAW_PAGE_VALUE, redact: true });
    check(sensitive.status === 'verified' && valueChecksObeyObservedRule(sensitive)
      && sensitive.checks[0].expected === av.EXPECT_REDACTED && sensitive.checks[0].observed === av.EXPECT_REDACTED,
      'evaluateExpectation: a met sensitive value is redacted on both sides', JSON.stringify(sensitive));
    check(!/secret-token-123|hunter2/.test(JSON.stringify(sensitive)),
      'evaluateExpectation: neither the page value nor the caller secret appears for a sensitive field');

    // 2. The extension's all-uncertain builder.
    const n = av.normalizeExpectSpec({ selector: '#pw', value: 'hunter2' });
    const uncertain = av.buildUncertainExpectResult(n.ok ? n.spec : null, 'probe_failed');
    check(valueChecksObeyObservedRule(uncertain), 'buildUncertainExpectResult: value observed obeys the D-19 rule',
      JSON.stringify(uncertain.checks));
    check(uncertain.checks[0].expected === av.EXPECT_REDACTED && !JSON.stringify(uncertain).includes('hunter2'),
      'buildUncertainExpectResult: the value expected is the marker and the caller value never appears',
      JSON.stringify(uncertain));

    // 3. The MCP version-skew fill.
    const unsupported = manual.buildUnsupportedExpectResult({ selector: '#pw', value: 'hunter2' });
    check(valueChecksObeyObservedRule(unsupported), 'buildUnsupportedExpectResult: value observed obeys the D-19 rule',
      JSON.stringify(unsupported.checks));
    check(!JSON.stringify(unsupported).includes('hunter2'),
      'buildUnsupportedExpectResult: the caller value never appears', JSON.stringify(unsupported));

    // D-25: both change-report harvest functions use the same literal.
    const dispatcherSrc = readSource(DISPATCHER_PATH);
    for (const name of ['_fsbHarvestStartInPage', '_fsbHarvestStopInPage']) {
      const body = topLevelFunctionSource(dispatcherSrc, name);
      const literals = [...body.matchAll(/const REDACTED = (['"])([^'"]*)\1;/g)].map((match) => match[2]);
      check(body.length > 0 && literals.length === 1 && literals[0] === av.EXPECT_REDACTED,
        `${name} redacts with the EXPECT_REDACTED literal`,
        `found ${JSON.stringify(literals)} in ${body.length} characters; EXPECT_REDACTED is ${JSON.stringify(av.EXPECT_REDACTED)}`);
    }

    // D-25 builder side: inputs_changed and the value entries of attrs_changed.
    const target = { getAttribute: (name) => (name === 'id' ? 'pw' : (name === 'value' ? 'hunter3' : null)), tagName: 'INPUT' };
    const report = av.buildChangeReport(
      { url: 'u', inputValues: { pw: 'hunter2', email: 'a@b.c' }, redactedInputKeys: ['pw'] },
      { url: 'u', inputValues: { pw: 'hunter3', email: 'a@b.c' }, redactedInputKeys: ['pw'], redactedInputsChanged: ['pw'] },
      [{ type: 'attributes', target, attributeName: 'value', oldValue: 'hunter2', valueRedacted: true }],
      {},
    );
    const inputEntry = report && report.inputs_changed && report.inputs_changed.pw;
    const attrEntry = report && Array.isArray(report.attrs_changed) ? report.attrs_changed.find((e) => e.attr === 'value') : null;
    check(Boolean(inputEntry) && inputEntry.before === av.EXPECT_REDACTED && inputEntry.after === av.EXPECT_REDACTED,
      'buildChangeReport: a sensitive inputs_changed entry uses EXPECT_REDACTED', JSON.stringify(inputEntry));
    check(Boolean(attrEntry) && attrEntry.before === av.EXPECT_REDACTED && attrEntry.after === av.EXPECT_REDACTED,
      'buildChangeReport: a sensitive value entry of attrs_changed uses EXPECT_REDACTED', JSON.stringify(attrEntry));
    check(!/hunter/.test(JSON.stringify(report)), 'buildChangeReport: no raw secret appears in the report');
  }

  // -------------------------------------------------------------------------
  console.log('\n--- D-15: expect in both strip lists and in the smoke-test sidecar guard ---');
  {
    const journalSrc = readSource(JOURNAL_PATH);
    const journalStart = journalSrc.indexOf('var INTERNAL_PAYLOAD_KEYS = Object.freeze([');
    const journalEnd = journalStart === -1 ? -1 : journalSrc.indexOf(']);', journalStart);
    const journalSlice = journalEnd === -1 ? '' : journalSrc.slice(journalStart, journalEnd);
    check(journalSlice.length > 0 && /'expect'/.test(journalSlice),
      "the journal INTERNAL_PAYLOAD_KEYS list contains 'expect'", journalSlice || 'INTERNAL_PAYLOAD_KEYS not found');

    const recorderSrc = readSource(RECORDER_PATH);
    const replayFn = recorderSrc.indexOf('function _replayInvocationPayload(');
    const mcpBranch = replayFn === -1 ? -1 : recorderSrc.indexOf("tool.indexOf('mcp:') === 0", replayFn);
    const listEnd = mcpBranch === -1 ? -1 : recorderSrc.indexOf('].forEach(', mcpBranch);
    const recorderSlice = listEnd === -1 ? '' : recorderSrc.slice(mcpBranch, listEnd);
    check(recorderSlice.length > 0 && /'expect'/.test(recorderSlice),
      "the recorder _replayInvocationPayload mcp: strip list contains 'expect'", recorderSlice || 'mcp: strip list not found');

    const smokeSrc = readSource(SMOKE_TEST_PATH);
    check(smokeSrc.includes("const EXPECT_SIDECAR_FIELDS = ['expect'];"),
      "tests/mcp-tool-smoke.test.js declares const EXPECT_SIDECAR_FIELDS = ['expect'];");
    const recordingDecl = smokeSrc.match(/const RECORDING_SIDECAR_FIELDS = \[([^\]]*)\];/);
    check(Boolean(recordingDecl) && !/'expect'/.test(recordingDecl[1]),
      "RECORDING_SIDECAR_FIELDS (random correlation ids) does not hold 'expect'",
      recordingDecl ? recordingDecl[0] : 'RECORDING_SIDECAR_FIELDS not found');
  }

  // -------------------------------------------------------------------------
  console.log('\n--- T-69-07: the _handleExecuteAction ownership-guard window ---');
  {
    const bridgeSrc = readSource(BRIDGE_CLIENT_PATH);
    const start = bridgeSrc.indexOf('async _handleExecuteAction');
    check(start !== -1, 'mcp-bridge-client.js declares async _handleExecuteAction');
    const offset = start === -1 ? -1 : bridgeSrc.indexOf('resolveAgentTabOrError', start) - start;
    const window = start === -1 ? '' : bridgeSrc.slice(start, start + GUARD_WINDOW_CHARS);
    check(window.includes('resolveAgentTabOrError'),
      `resolveAgentTabOrError lies within ${GUARD_WINDOW_CHARS} characters of async _handleExecuteAction (offset ${offset})`,
      `offset ${offset}: the guards in action-tool-agent-scoped and ownership-error-codes would print "skipped". `
        + 'Keep _handleExecuteAction additions minimal (RESEARCH Finding 5).');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error('  FAIL: expect-parity threw:', error && error.stack ? error.stack : error);
  process.exit(1);
});
