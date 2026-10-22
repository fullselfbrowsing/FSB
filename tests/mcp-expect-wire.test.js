'use strict';

/**
 * Phase 69 Plan 06 (MCP-02, MCP-04 / SC3; CONTEXT D-11..D-16, D-21, D-22):
 * call-level wire checks for the optional `expect` parameter.
 *
 * Drives the built MCP runtime in-process (SDK Client over InMemoryTransport,
 * stub bridge, mock AgentScope; tests/helpers/mcp-in-process.mjs), so every
 * call goes through the SDK's own input validation exactly as a host's would.
 * No ports, no git, no child processes; Node 20 safe.
 *
 * G1-G3 are golden literals captured from the pre-change build (before
 * 69-06 touched manual.ts / agents.ts) and passed against it. They prove the
 * no-`expect` wire (bridge payload bytes, key order, bridge timeout and
 * response text) is unchanged.
 *
 * Run: npm --prefix mcp run build && node tests/mcp-expect-wire.test.js
 */

const path = require('path');
const { pathToFileURL } = require('url');

const HELPER_PATH = path.join(__dirname, 'helpers', 'mcp-in-process.mjs');

// buildAgentPayload() (mcp/src/agent-bridge.ts) stamps random correlation
// fields on every agent-scoped send; drop them before byte comparison
// (tests/mcp-tool-smoke.test.js RECORDING_SIDECAR_FIELDS).
const RECORDING_SIDECAR_FIELDS = ['recordingCallId', 'recordingRunId', 'recordingLeaseMs'];
const DISPATCH_TYPES = new Set(['mcp:execute-action', 'mcp:go-back']);

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function hasOwn(object, key) {
  return Boolean(object) && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key);
}

// Payload as the extension receives it: recording sidecar removed, then the
// JSON the real WebSocketBridge would put on the wire (undefined-valued keys
// from PARAM_TRANSFORMS vanish exactly as they do in transit).
function wireJson(call) {
  const payload = { ...call.message.payload };
  for (const field of RECORDING_SIDECAR_FIELDS) delete payload[field];
  return JSON.stringify(payload);
}

// ---------------------------------------------------------------------------
// G1 / G2 goldens: captured from the pre-change build (manual.ts after 69-02,
// agents.ts after 69-02) with the in-process client below, then pasted here
// verbatim. Do not regenerate them from the current build.
// ---------------------------------------------------------------------------

const VISUAL_ARGS = Object.freeze({ visual_reason: 'wire test', client: 'Codex' });

const GOLDEN_CALLS = Object.freeze([
  {
    name: 'click',
    args: { selector: 'e5', ...VISUAL_ARGS },
    type: 'mcp:execute-action',
    timeout: 30000,
    payload: { tool: 'click', params: { selector: 'e5' }, visualSession: { visualReason: 'wire test', client: 'Codex', isFinal: false }, agentId: 'agent-test' },
  },
  {
    name: 'type_text',
    args: { selector: '#q', text: 'hello', clear_first: true, tab_id: 4, ...VISUAL_ARGS },
    type: 'mcp:execute-action',
    timeout: 30000,
    payload: { tool: 'type', params: { selector: '#q', text: 'hello', clear_first: true, tab_id: 4 }, visualSession: { visualReason: 'wire test', client: 'Codex', isFinal: false }, agentId: 'agent-test' },
  },
  {
    name: 'press_key',
    args: { key: 'Enter', ctrl: true, tab_id: 9, ...VISUAL_ARGS },
    type: 'mcp:execute-action',
    timeout: 30000,
    payload: { tool: 'keyPress', params: { key: 'Enter', ctrlKey: true, shiftKey: false, altKey: false, useDebuggerAPI: true, tab_id: 9 }, visualSession: { visualReason: 'wire test', client: 'Codex', isFinal: false }, agentId: 'agent-test' },
  },
  {
    name: 'drag_drop',
    args: { sourceSelector: '#a', targetSelector: '#b', steps: 5, ...VISUAL_ARGS },
    type: 'mcp:execute-action',
    timeout: 30000,
    payload: { tool: 'dragdrop', params: { sourceRef: '#a', targetRef: '#b', steps: 5 }, visualSession: { visualReason: 'wire test', client: 'Codex', isFinal: false }, agentId: 'agent-test' },
  },
  {
    name: 'click_at',
    args: { x: 10, y: 20, shift: true, ...VISUAL_ARGS },
    type: 'mcp:execute-action',
    timeout: 30000,
    payload: { tool: 'cdpClickAt', params: { x: 10, y: 20, shiftKey: true, ctrlKey: false, altKey: false }, visualSession: { visualReason: 'wire test', client: 'Codex', isFinal: false }, agentId: 'agent-test' },
  },
  {
    name: 'drag',
    args: { startX: 1, startY: 2, endX: 3, endY: 4, alt: true, ...VISUAL_ARGS },
    type: 'mcp:execute-action',
    timeout: 30000,
    payload: { tool: 'cdpDrag', params: { startX: 1, startY: 2, endX: 3, endY: 4, shiftKey: false, ctrlKey: false, altKey: true }, visualSession: { visualReason: 'wire test', client: 'Codex', isFinal: false }, agentId: 'agent-test' },
  },
  {
    name: 'fill_sheet',
    args: { startCell: 'A1', csvData: 'a,b\n1,2', sheetName: 'S', ...VISUAL_ARGS },
    type: 'mcp:execute-action',
    timeout: 150000,
    payload: { tool: 'fillsheet', params: { startCell: 'A1', data: 'a,b\n1,2', sheetName: 'S' }, visualSession: { visualReason: 'wire test', client: 'Codex', isFinal: false }, agentId: 'agent-test' },
  },
  {
    name: 'navigate',
    args: { url: 'https://example.com/a', ...VISUAL_ARGS, is_final: true },
    type: 'mcp:execute-action',
    timeout: 30000,
    payload: { tool: 'navigate', params: { url: 'https://example.com/a' }, visualSession: { visualReason: 'wire test', client: 'Codex', isFinal: true }, agentId: 'agent-test' },
  },
  {
    name: 'hover',
    args: { selector: '#menu', ...VISUAL_ARGS },
    type: 'mcp:execute-action',
    timeout: 30000,
    payload: { tool: 'hover', params: { selector: '#menu' }, visualSession: { visualReason: 'wire test', client: 'Codex', isFinal: false }, agentId: 'agent-test' },
  },
  {
    name: 'clear_input',
    args: { selector: '#q', ...VISUAL_ARGS },
    type: 'mcp:execute-action',
    timeout: 30000,
    payload: { tool: 'clearInput', params: { selector: '#q' }, visualSession: { visualReason: 'wire test', client: 'Codex', isFinal: false }, agentId: 'agent-test' },
  },
]);

const GOLDEN_BACK_CALLS = Object.freeze([
  { label: 'back', args: {}, type: 'mcp:go-back', timeout: 5000, payload: { agentId: 'agent-test' } },
  { label: 'back tab_id 12', args: { tab_id: 12 }, type: 'mcp:go-back', timeout: 5000, payload: { tabId: 12, agentId: 'agent-test' } },
]);

// Canned bridge answers (G3). Deterministic per message so the response text
// can be compared byte for byte.
function defaultCanned(message) {
  if (message.type === 'mcp:go-back') return { success: true, tool: 'back', navigated: true, tabId: 12 };
  return { success: true, tool: message.payload && message.payload.tool, wire: 'canned' };
}

// ---------------------------------------------------------------------------
// Post-change contract (69-06)
// ---------------------------------------------------------------------------

const MANUAL_BUILD_PATH = path.join(__dirname, '..', 'mcp', 'build', 'tools', 'manual.js');
const DESCRIPTIONS_BUILD_PATH = path.join(__dirname, '..', 'mcp', 'build', 'tools', 'descriptions.js');

const EXPECT_FIELDS = Object.freeze([
  'url_includes', 'title_includes', 'text_visible', 'text_gone', 'selector', 'state', 'value', 'dialog_open', 'timeout_ms',
]);
const EXPECT_SCHEMA_BYTE_CAP = 600;
const BACK_BASE_TIMEOUT_MS = 5000;
const ACTION_TIMEOUT_MS = 30000;

// clampExpectTimeoutMs table (D-20; same rows 69-07's parity test runs on
// both sides).
const CLAMP_TABLE = Object.freeze([
  [undefined, 2000], [null, 2000], ['abc', 2000], [NaN, 2000], [Infinity, 2000],
  [-5, 0], [0, 0], [1234.9, 1234], ['3000', 3000], [99999, 5000], [5000, 5000],
]);

// Malformed expect values (D-16): each must be rejected before dispatch.
const LONG_TEXT = 'x'.repeat(2001);
const REJECTED_EXPECTS = Object.freeze([
  ['{}', {}],
  ['timeout-only', { timeout_ms: 100 }],
  ['unknown key', { bogus: 1 }],
  ['state without selector', { state: 'checked' }],
  ['value without selector', { value: 'x' }],
  ['wrong type', { text_visible: 5 }],
  ['empty text_visible', { text_visible: '' }],
  ['empty selector', { selector: '', state: 'visible' }],
  ['2,001-char text_visible', { text_visible: LONG_TEXT }],
  ['state outside the enum', { selector: '#a', state: 'bogus' }],
  ['unparseable string', '{not json'],
  ['fractional timeout_ms', { text_visible: 'a', timeout_ms: 1.5 }],
  // 69-REVIEW WR-02: Number() would turn these into 1 / 0 ms.
  ['boolean timeout_ms', { text_visible: 'a', timeout_ms: true }],
  ['whitespace-only timeout_ms', { text_visible: 'a', timeout_ms: '   ' }],
  ['array timeout_ms', { text_visible: 'a', timeout_ms: [] }],
  // 69-REVIEW WR-03: a blank predicate would be vacuously met.
  ['whitespace-only text_visible', { text_visible: '   ' }],
  ['whitespace-only title_includes', { title_includes: '  ' }],
]);

// Order-insensitive deep equality through sorted-key JSON.
function sortedJson(value) {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${sortedJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameValue(a, b) {
  return sortedJson(a) === sortedJson(b);
}

// Wire JSON with the expect sidecar removed: must equal the no-expect golden.
function wireJsonWithoutExpect(call) {
  const payload = { ...call.message.payload };
  for (const field of RECORDING_SIDECAR_FIELDS) delete payload[field];
  delete payload.expect;
  return JSON.stringify(payload);
}

function parseResponseJson(text) {
  try { return JSON.parse(text); } catch (_error) { return null; }
}

// ---------------------------------------------------------------------------
// mapFSBError byte fixtures (D-21, D-22 item 2): full output strings captured
// from mcp/build/errors.js before 69-06 Task 2 edited errors.ts, pasted
// verbatim and compared with ===.
// ---------------------------------------------------------------------------

const ERRORS_BUILD_PATH = path.join(__dirname, '..', 'mcp', 'build', 'errors.js');

const MAP_FIXTURES = Object.freeze([
  {
    label: 'success',
    input: { success: true, tool: 'click' },
    isError: undefined,
    text: '{\n  "success": true,\n  "tool": "click"\n}',
  },
  {
    label: 'unknown outcome',
    input: { success: false, outcome: 'unknown', mayHaveExecuted: true, error: 'Port closed after dispatch' },
    isError: true,
    text: 'Detected: Action outcome unknown\nWhy: Port closed after dispatch\nNext action: Inspect the current page with read_page or get_dom_snapshot before deciding whether to retry.\n\n{"outcome":"unknown","mayHaveExecuted":true}',
  },
  {
    label: 'unknown outcome PAGE_UNRESPONSIVE',
    input: { success: false, outcome: 'unknown', mayHaveExecuted: true, errorCode: 'PAGE_UNRESPONSIVE', error: 'Page did not respond' },
    isError: true,
    text: 'Detected: Action outcome unknown\nWhy: Page did not respond\nNext action: The page stopped responding, so reads will wait on it too. Use navigate or close_tab to recover the tab, then check whether the action took effect before repeating it.\n\n{"outcome":"unknown","mayHaveExecuted":true}',
  },
  {
    label: 'unknown outcome ACTION_RESPONSE_TIMEOUT',
    input: { success: false, outcome: 'unknown', mayHaveExecuted: true, errorCode: 'ACTION_RESPONSE_TIMEOUT', error: 'No response within 30000ms' },
    isError: true,
    text: 'Detected: Action outcome unknown\nWhy: No response within 30000ms\nNext action: The operation may still be running. Wait for it to settle, then inspect the current page before deciding whether to retry.\n\n{"outcome":"unknown","mayHaveExecuted":true}',
  },
  {
    label: 'generic error',
    input: { success: false, error: 'element not found' },
    isError: true,
    text: 'Detected: Page navigation\nWhy: element not found\nNext action: Refresh page state with read_page or get_dom_snapshot, then retry.',
  },
  {
    label: 'success with expect_result',
    input: { success: true, tool: 'click', expect_result: { status: 'verified', checks: [{ kind: 'text_visible', expected: 'Saved', observed: 'Saved', status: 'met' }], waited_ms: 40, timeout_ms: 2000 } },
    isError: undefined,
    text: '{\n  "success": true,\n  "tool": "click",\n  "expect_result": {\n    "status": "verified",\n    "checks": [\n      {\n        "kind": "text_visible",\n        "expected": "Saved",\n        "observed": "Saved",\n        "status": "met"\n      }\n    ],\n    "waited_ms": 40,\n    "timeout_ms": 2000\n  }\n}',
  },
]);

// Hand-written expectation for the MCP version-skew fill (RESEARCH Finding
// 10, 69-03 buildUncertainExpectResult shape).
function unsupportedResult(checks, timeoutMs) {
  return {
    status: 'uncertain',
    checks: checks.map(([kind, expected]) => ({ kind, expected, observed: null, status: 'uncertain' })),
    waited_ms: 0,
    timeout_ms: timeoutMs,
    reason: 'extension_unsupported',
  };
}

(async () => {
  const h = await import(pathToFileURL(HELPER_PATH).href);
  h.assertBuildFresh();
  const manual = await import(pathToFileURL(MANUAL_BUILD_PATH).href);
  const descriptions = await import(pathToFileURL(DESCRIPTIONS_BUILD_PATH).href);
  const { mapFSBError } = await import(pathToFileURL(ERRORS_BUILD_PATH).href);

  // -------------------------------------------------------------------------
  console.log('\n--- mapFSBError: pre-change byte fixtures ---');
  for (const fixture of MAP_FIXTURES) {
    const mapped = mapFSBError(JSON.parse(JSON.stringify(fixture.input)));
    const text = mapped && mapped.content && mapped.content[0] && mapped.content[0].text;
    check(text === fixture.text && mapped.isError === fixture.isError,
      `mapFSBError ${fixture.label}: output is byte-identical to the pre-change build`
        + (text === fixture.text ? '' : `\n      want: ${JSON.stringify(fixture.text)}\n      got:  ${JSON.stringify(text)}`));
  }

  let cannedFor = defaultCanned;
  const lastCanned = [];
  const bridge = h.makeStubBridge({
    onSend: (message) => {
      const canned = cannedFor(message);
      lastCanned.push(canned);
      return canned;
    },
  });
  const session = await h.createInProcessClient({ bridge });
  const queue = session.runtime.queue;
  let queueEntries = 0;
  const originalEnqueue = queue.enqueue.bind(queue);
  queue.enqueue = (toolName, fn) => { queueEntries++; return originalEnqueue(toolName, fn); };

  // One tools/call; returns the bridge sends it caused, its result or error,
  // and the canned answers handed back.
  async function call(name, args) {
    bridge.calls.length = 0;
    lastCanned.length = 0;
    const queueBefore = queueEntries;
    let result = null;
    let error = null;
    try {
      result = await session.client.callTool({ name, arguments: args });
    } catch (err) {
      error = err;
    }
    return {
      result,
      error,
      calls: bridge.calls.slice(),
      dispatches: bridge.calls.filter((entry) => DISPATCH_TYPES.has(entry.message.type)),
      canned: lastCanned.slice(),
      queued: queueEntries - queueBefore,
    };
  }

  // SDK input validation (D-16): either a thrown McpError -32602 or, as SDK
  // 1.29.0 does, an isError result whose text carries the -32602 marker.
  function isValidationRejection(outcome) {
    if (outcome.error) return outcome.error.code === -32602;
    const text = responseText(outcome);
    return Boolean(outcome.result && outcome.result.isError === true && typeof text === 'string' && text.includes('-32602'));
  }

  function responseText(outcome) {
    return outcome.result && Array.isArray(outcome.result.content) && outcome.result.content[0]
      ? outcome.result.content[0].text
      : null;
  }

  try {
    // -----------------------------------------------------------------------
    console.log('\n--- G1: no-expect action calls match the pre-change goldens ---');
    for (const golden of GOLDEN_CALLS) {
      const outcome = await call(golden.name, golden.args);
      check(outcome.error === null && outcome.dispatches.length === 1 && outcome.calls.length === 1,
        `${golden.name}: exactly one bridge send${outcome.error ? ` (threw ${outcome.error.message})` : ''}`);
      const sent = outcome.dispatches[0];
      if (!sent) continue;
      check(sent.message.type === golden.type, `${golden.name}: sends ${golden.type}`);
      const actual = wireJson(sent);
      const expected = JSON.stringify(golden.payload);
      check(actual === expected, `${golden.name}: payload bytes equal the golden`
        + (actual === expected ? '' : `\n      golden: ${expected}\n      actual: ${actual}`));
      check(!hasOwn(sent.message.payload, 'expect') && !hasOwn(sent.message.payload.params, 'expect'),
        `${golden.name}: no \`expect\` key in the payload or its params`);
      check(sent.options && sent.options.timeout === golden.timeout,
        `${golden.name}: options.timeout is ${golden.timeout} (got ${sent.options && sent.options.timeout})`);

      console.log(`  G3 ${golden.name}:`);
      check(responseText(outcome) === JSON.stringify(outcome.canned[0], null, 2) && outcome.result.isError === undefined,
        `${golden.name}: response text is the canned result's JSON.stringify(result, null, 2), no isError`);
    }

    // -----------------------------------------------------------------------
    console.log('\n--- G2: back without expect matches the pre-change goldens ---');
    for (const golden of GOLDEN_BACK_CALLS) {
      const outcome = await call('back', golden.args);
      check(outcome.error === null && outcome.dispatches.length === 1 && outcome.calls.length === 1,
        `${golden.label}: exactly one bridge send`);
      const sent = outcome.dispatches[0];
      if (!sent) continue;
      check(sent.message.type === golden.type, `${golden.label}: sends ${golden.type}`);
      const actual = wireJson(sent);
      const expected = JSON.stringify(golden.payload);
      check(actual === expected, `${golden.label}: payload bytes equal the golden`
        + (actual === expected ? '' : `\n      golden: ${expected}\n      actual: ${actual}`));
      check(sent.options && sent.options.timeout === 5000,
        `${golden.label}: options.timeout is 5000 (got ${sent.options && sent.options.timeout})`);
      check(responseText(outcome) === JSON.stringify(outcome.canned[0], null, 2) && outcome.result.isError === undefined,
        `${golden.label}: G3 response text is the canned result's JSON.stringify(result, null, 2)`);
    }

    const goldenByName = new Map(GOLDEN_CALLS.map((golden) => [golden.name, golden]));

    // -----------------------------------------------------------------------
    console.log('\n--- MCP expect exports (mirror of the 69-03 extension contract) ---');
    check(Array.isArray(manual.EXPECT_TOOL_NAMES)
      && JSON.stringify(manual.EXPECT_TOOL_NAMES) === JSON.stringify(h.EXPECT_TOOL_NAMES_VERBATIM)
      && Object.isFrozen(manual.EXPECT_TOOL_NAMES),
      'EXPECT_TOOL_NAMES is the frozen D-12 list in D-12 order');
    check(manual.EXPECT_TOOL_SET instanceof Set && manual.EXPECT_TOOL_SET.size === 29
      && h.EXPECT_TOOL_NAMES_VERBATIM.every((name) => manual.EXPECT_TOOL_SET.has(name)),
      'EXPECT_TOOL_SET holds the same 29 names');
    check(manual.EXPECT_DEFAULT_TIMEOUT_MS === 2000 && manual.EXPECT_MAX_TIMEOUT_MS === 5000
      && manual.EXPECT_STRING_MAX === 2000 && manual.EXPECT_BRIDGE_HEADROOM_MS === 1500,
      'EXPECT_DEFAULT_TIMEOUT_MS 2000, EXPECT_MAX_TIMEOUT_MS 5000, EXPECT_STRING_MAX 2000, EXPECT_BRIDGE_HEADROOM_MS 1500');
    if (typeof manual.clampExpectTimeoutMs === 'function') {
      const wrong = CLAMP_TABLE.filter(([input, output]) => manual.clampExpectTimeoutMs(input) !== output)
        .map(([input, output]) => `${String(input)} -> ${manual.clampExpectTimeoutMs(input)} (want ${output})`);
      check(wrong.length === 0, `clampExpectTimeoutMs matches the D-20 table${wrong.length ? `: ${wrong.join('; ')}` : ''}`);
    } else {
      check(false, 'clampExpectTimeoutMs is exported');
    }
    if (typeof manual.parseExpectArg === 'function') {
      const objectArg = { text_visible: 'a' };
      check(manual.parseExpectArg(null) === undefined, 'parseExpectArg(null) is undefined (Finding 11)');
      check(manual.parseExpectArg(undefined) === undefined, 'parseExpectArg(undefined) is undefined');
      check(manual.parseExpectArg(objectArg) === objectArg, 'parseExpectArg passes an object through by reference');
      check(sameValue(manual.parseExpectArg('  {"text_visible":"a"}'), objectArg),
        'parseExpectArg parses a string whose trimmed text starts with {');
      check(manual.parseExpectArg('{not json') === '{not json', 'parseExpectArg returns an unparseable string unchanged');
      check(manual.parseExpectArg('Saved') === 'Saved', 'parseExpectArg leaves a non-object string unchanged');
    } else {
      check(false, 'parseExpectArg is exported');
    }
    check(manual.EXPECT_SHAPE && JSON.stringify(Object.keys(manual.EXPECT_SHAPE)) === '["expect"]'
      && typeof manual.EXPECT_SHAPE.expect.safeParse === 'function',
      'EXPECT_SHAPE has exactly one zod key, expect');
    check(typeof manual.buildUnsupportedExpectResult === 'function' && typeof manual.withUnsupportedExpectFill === 'function',
      'buildUnsupportedExpectResult and withUnsupportedExpectFill are exported');

    // -----------------------------------------------------------------------
    console.log('\n--- published schema: expect on exactly the 29 D-12 tools ---');
    const listed = (await session.client.listTools()).tools;
    const withExpect = listed.filter((tool) => hasOwn(tool.inputSchema && tool.inputSchema.properties, 'expect'));
    const withExpectNames = withExpect.map((tool) => tool.name).sort();
    const wantNames = [...h.EXPECT_TOOL_NAMES_VERBATIM].sort();
    check(JSON.stringify(withExpectNames) === JSON.stringify(wantNames),
      `expect is published on exactly the 29 D-12 tools (got ${withExpect.length}`
        + `${withExpectNames.length !== 29 ? `: ${withExpectNames.join(', ')}` : ''})`);
    const inRequired = withExpect.filter((tool) => (tool.inputSchema.required || []).includes('expect')).map((tool) => tool.name);
    check(inRequired.length === 0, `expect is never in required${inRequired.length ? ` (${inRequired.join(', ')})` : ''}`);
    if (withExpect.length > 0) {
      const reference = h.canonicalJson(withExpect[0].inputSchema.properties.expect);
      const differing = withExpect.filter((tool) => h.canonicalJson(tool.inputSchema.properties.expect) !== reference)
        .map((tool) => tool.name);
      check(differing.length === 0, `every published expect schema is byte-identical${differing.length ? ` (differs: ${differing.join(', ')})` : ''}`);
      const schema = withExpect[0].inputSchema.properties.expect;
      const bytes = h.canonicalBytes(schema);
      console.log(`  published expect schema: ${bytes} canonical bytes`);
      check(bytes <= EXPECT_SCHEMA_BYTE_CAP, `expect schema is ${bytes} canonical bytes (cap ${EXPECT_SCHEMA_BYTE_CAP})`);
      check(schema.type === 'object' && schema.additionalProperties === false,
        'expect is type object with additionalProperties false');
      check(sameValue(Object.keys(schema.properties || {}).sort(), [...EXPECT_FIELDS].sort()),
        'expect publishes exactly the nine D-13 fields');
      check(schema.description === descriptions.MCP_EXPECT_DESCRIPTION,
        'expect carries MCP_EXPECT_DESCRIPTION as its single description');
      check(schema.properties && schema.properties.state && sameValue(schema.properties.state.enum, ['visible', 'gone', 'checked', 'unchecked']),
        'state publishes the four-value enum');
    }

    // -----------------------------------------------------------------------
    console.log('\n--- expect omitted or null: the G1 bytes ---');
    {
      const golden = goldenByName.get('click');
      const outcome = await call('click', { ...golden.args, expect: null });
      const sent = outcome.dispatches[0];
      check(outcome.error === null && outcome.dispatches.length === 1 && sent && wireJson(sent) === JSON.stringify(golden.payload),
        'click with expect: null sends the G1 click bytes');
      check(sent && !hasOwn(sent.message.payload, 'expect') && sent.options.timeout === golden.timeout,
        'click with expect: null adds no expect key and keeps the 30 s timeout');
      check(responseText(outcome) === JSON.stringify(outcome.canned[0], null, 2),
        'click with expect: null returns the canned bytes (no fill)');
    }

    console.log('\n--- expect on tools outside the 29 is stripped by the SDK ---');
    for (const name of ['hover', 'fill_sheet']) {
      const golden = goldenByName.get(name);
      const outcome = await call(name, { ...golden.args, expect: { text_visible: 'Saved' } });
      const sent = outcome.dispatches[0];
      check(outcome.error === null && outcome.dispatches.length === 1 && sent && wireJson(sent) === JSON.stringify(golden.payload),
        `${name} with expect sends the G1 ${name} bytes (expect stripped, never reaches params)`);
      check(sent && sent.options.timeout === golden.timeout, `${name} keeps its ${golden.timeout} ms timeout`);
      check(responseText(outcome) === JSON.stringify(outcome.canned[0], null, 2), `${name} with expect returns the canned bytes (no fill)`);
    }

    // -----------------------------------------------------------------------
    console.log('\n--- expect travels as a top-level sidecar ---');
    {
      const golden = goldenByName.get('click');
      const spec = { text_visible: 'Saved' };
      const outcome = await call('click', { ...golden.args, expect: spec });
      const sent = outcome.dispatches[0];
      check(outcome.error === null && outcome.dispatches.length === 1, 'click with expect: one bridge send');
      check(sent && sameValue(sent.message.payload.expect, spec), 'click: payload.expect deep-equals the input');
      check(sent && sameValue(sent.message.payload.params, golden.payload.params) && !hasOwn(sent.message.payload.params, 'expect'),
        'click: payload.params deep-equals the G1 params');
      check(sent && wireJsonWithoutExpect(sent) === JSON.stringify(golden.payload),
        'click: the payload minus expect is the G1 bytes');
      check(sent && sent.options.timeout === ACTION_TIMEOUT_MS, 'click with expect keeps options.timeout 30000');
    }
    {
      const golden = goldenByName.get('click');
      const outcome = await call('click', { ...golden.args, expect: '{"text_visible":"Saved"}' });
      const sent = outcome.dispatches[0];
      check(outcome.error === null && sent && sameValue(sent.message.payload.expect, { text_visible: 'Saved' })
        && typeof sent.message.payload.expect === 'object',
        'click with expect as a JSON object string: payload.expect is the parsed object (D-14)');
    }
    {
      const golden = goldenByName.get('click');
      const outcome = await call('click', { ...golden.args, expect: { text_visible: 'Saved', timeout_ms: null } });
      const sent = outcome.dispatches[0];
      check(outcome.error === null && sent && sameValue(sent.message.payload.expect, { text_visible: 'Saved' })
        && JSON.parse(JSON.stringify(sent.message.payload)).expect.timeout_ms === undefined,
        'click with expect.timeout_ms null: forwarded without timeout_ms, so the 2000 ms default applies (WR-02)');
    }
    {
      const golden = goldenByName.get('clear_input');
      const spec = { selector: '#q', value: '' };
      const outcome = await call('clear_input', { ...golden.args, expect: spec });
      const sent = outcome.dispatches[0];
      check(outcome.error === null && outcome.dispatches.length === 1 && sent && sameValue(sent.message.payload.expect, spec),
        'clear_input with { selector, value: "" } is accepted and payload.expect deep-equals it (D-13)');
      check(sent && sameValue(sent.message.payload.params, golden.payload.params),
        'clear_input: payload.params deep-equals the no-expect params');
      check(sent && wireJsonWithoutExpect(sent) === JSON.stringify(golden.payload), 'clear_input: the payload minus expect is the G1 bytes');
    }
    for (const name of ['press_key', 'drag_drop', 'click_at', 'drag']) {
      const golden = goldenByName.get(name);
      const spec = { url_includes: '/done', timeout_ms: 1000 };
      const outcome = await call(name, { ...golden.args, expect: spec });
      const sent = outcome.dispatches[0];
      check(outcome.error === null && outcome.dispatches.length === 1 && sent
        && JSON.stringify(sent.message.payload.params) === JSON.stringify(golden.payload.params),
        `${name} (PARAM_TRANSFORMS): params are still the G1 bytes (expect lifted before the transform)`);
      check(sent && sameValue(sent.message.payload.expect, spec) && wireJsonWithoutExpect(sent) === JSON.stringify(golden.payload),
        `${name}: expect is top-level and the rest of the payload is the G1 bytes`);
    }
    {
      const golden = goldenByName.get('navigate');
      const outcome = await call('navigate', { ...golden.args, expect: { url_includes: 'example.com/a', timeout_ms: 5000 } });
      const sent = outcome.dispatches[0];
      check(outcome.error === null && sent && sent.options.timeout === ACTION_TIMEOUT_MS
        && wireJsonWithoutExpect(sent) === JSON.stringify(golden.payload),
        'navigate with expect keeps the 30 s action timeout and the G1 bytes besides expect');
    }

    // -----------------------------------------------------------------------
    console.log('\n--- malformed expect is rejected before dispatch (D-16) ---');
    {
      const golden = goldenByName.get('click');
      for (const [label, value] of REJECTED_EXPECTS) {
        const outcome = await call('click', { ...golden.args, expect: value });
        const rejected = isValidationRejection(outcome);
        check(rejected && outcome.dispatches.length === 0 && outcome.calls.length === 0 && outcome.queued === 0,
          `click expect ${label}: rejected (-32602 or isError) with zero bridge sends and zero queue entries`
            + (outcome.dispatches.length ? ` (sent ${outcome.dispatches.length})` : ''));
      }
      for (const [label, value] of [['{}', {}], ['unknown key', { bogus: 1 }], ['unparseable string', '{not json']]) {
        const outcome = await call('back', { expect: value });
        const rejected = isValidationRejection(outcome);
        check(rejected && outcome.dispatches.length === 0 && outcome.calls.length === 0 && outcome.queued === 0,
          `back expect ${label}: rejected with zero bridge sends and zero queue entries`);
      }
    }

    // -----------------------------------------------------------------------
    console.log('\n--- back: expect sidecar and the conditional timeout (RESEARCH Finding 1) ---');
    for (const [label, spec, timeout] of [
      ['timeout_ms 5000', { url_includes: '/a', timeout_ms: 5000 }, 11500],
      ['timeout_ms 99999', { url_includes: '/a', timeout_ms: 99999 }, 11500],
      ['no timeout_ms', { url_includes: '/a' }, 8500],
      ['timeout_ms -5', { url_includes: '/a', timeout_ms: -5 }, 6500],
      ['timeout_ms "3000"', { url_includes: '/a', timeout_ms: '3000' }, 9500],
      ['timeout_ms null (omitted: the 2000 ms default)', { url_includes: '/a', timeout_ms: null }, 8500],
    ]) {
      const outcome = await call('back', { expect: spec });
      const sent = outcome.dispatches[0];
      check(outcome.error === null && outcome.dispatches.length === 1 && sent && sent.message.type === 'mcp:go-back',
        `back expect ${label}: one mcp:go-back send`);
      check(sent && sent.options.timeout === timeout, `back expect ${label}: options.timeout ${timeout} (got ${sent && sent.options.timeout})`);
      check(sent && hasOwn(sent.message.payload, 'expect') && wireJsonWithoutExpect(sent) === JSON.stringify(GOLDEN_BACK_CALLS[0].payload),
        `back expect ${label}: payload.expect set; the rest is the G2 bytes`);
    }
    {
      const outcome = await call('back', { tab_id: 12, expect: { url_includes: '/a' } });
      const sent = outcome.dispatches[0];
      check(sent && sent.message.payload.tabId === 12 && sameValue(sent.message.payload.expect, { url_includes: '/a' })
        && wireJsonWithoutExpect(sent) === JSON.stringify(GOLDEN_BACK_CALLS[1].payload),
        'back tab_id 12 with expect: tabId threading unchanged, expect top-level');
      check(sent && sent.options.timeout === BACK_BASE_TIMEOUT_MS + 2000 + 1500, 'back tab_id 12 with expect: options.timeout 8500');
    }
    {
      const outcome = await call('back', { expect: null });
      const sent = outcome.dispatches[0];
      check(sent && wireJson(sent) === JSON.stringify(GOLDEN_BACK_CALLS[0].payload) && sent.options.timeout === BACK_BASE_TIMEOUT_MS,
        'back with expect: null sends the G2 bytes with timeout 5000');
    }

    // -----------------------------------------------------------------------
    console.log('\n--- version-skew fill (RESEARCH Finding 10, OQ1) ---');
    {
      const golden = goldenByName.get('click');
      const longText = 'L'.repeat(130);
      const spec = { text_visible: longText, selector: '#pw', value: 'hunter2', dialog_open: false, timeout_ms: 99999 };
      cannedFor = () => ({ success: true, tool: 'click' });
      const outcome = await call('click', { ...golden.args, expect: spec });
      cannedFor = defaultCanned;
      const text = responseText(outcome);
      const body = parseResponseJson(text);
      const want = unsupportedResult([
        ['text_visible', `${'L'.repeat(117)}...`],
        ['value', '[redacted]'],
        ['dialog_open', false],
      ], 5000);
      check(outcome.result && outcome.result.isError === undefined && body && body.success === true,
        'success without expect_result stays a success');
      check(body && sameValue(body.expect_result, want),
        'success without expect_result gains expect_result uncertain / extension_unsupported (checks uncertain, observed null, '
          + 'value expected [redacted], long expected capped at 120, timeout clamped)');
      check(body && Object.keys(body).pop() === 'expect_result', 'expect_result is added last');
      check(typeof text === 'string' && !text.includes('hunter2'), 'the value check never echoes the expected value');
      check(text === JSON.stringify({ success: true, tool: 'click', expect_result: body && body.expect_result }, null, 2),
        'the filled response is the canned result plus expect_result, nothing else');
    }
    {
      cannedFor = () => ({ success: true, tool: 'back', navigated: true });
      const outcome = await call('back', { expect: { url_includes: '/a', selector: '#x' } });
      cannedFor = defaultCanned;
      const body = parseResponseJson(responseText(outcome));
      check(body && sameValue(body.expect_result, unsupportedResult([['url_includes', '/a'], ['state', 'visible']], 2000)),
        'back success without expect_result is filled (default timeout 2000; selector alone means state visible)');
    }
    {
      const existing = { status: 'verified', checks: [{ kind: 'text_visible', expected: 'Saved', observed: 'Saved', status: 'met' }], waited_ms: 40, timeout_ms: 2000 };
      cannedFor = () => ({ success: true, tool: 'click', expect_result: existing });
      const outcome = await call('click', { ...goldenByName.get('click').args, expect: { text_visible: 'Saved' } });
      cannedFor = defaultCanned;
      check(responseText(outcome) === JSON.stringify({ success: true, tool: 'click', expect_result: existing }, null, 2),
        'an extension expect_result passes through unchanged');
    }
    {
      const failure = { success: false, error: 'element not found' };
      cannedFor = () => ({ ...failure });
      const outcome = await call('click', { ...goldenByName.get('click').args, expect: { text_visible: 'Saved' } });
      cannedFor = defaultCanned;
      const text = responseText(outcome);
      check(outcome.result && outcome.result.isError === true && typeof text === 'string' && !text.includes('expect_result'),
        'a definitive failure is not filled');
    }
    if (typeof manual.withUnsupportedExpectFill === 'function' && typeof manual.buildUnsupportedExpectResult === 'function') {
      const spec = { text_visible: 'Saved' };
      const unknown = { success: false, mayHaveExecuted: true, outcome: 'unknown', error: 'Port closed after dispatch' };
      const filled = manual.withUnsupportedExpectFill(unknown, spec);
      check(filled !== unknown && sameValue(filled, { ...unknown, expect_result: unsupportedResult([['text_visible', 'Saved']], 2000) })
        && Object.keys(filled).pop() === 'expect_result' && !hasOwn(unknown, 'expect_result'),
        'withUnsupportedExpectFill fills an unknown outcome on a shallow copy, expect_result last, input untouched');
      const definitive = { success: false, error: 'element not found' };
      check(manual.withUnsupportedExpectFill(definitive, spec) === definitive, 'withUnsupportedExpectFill: definitive failure returned by reference');
      const plain = { success: true };
      check(manual.withUnsupportedExpectFill(plain, undefined) === plain, 'withUnsupportedExpectFill: no expect, result returned by reference');
      const carried = { success: true, expect_result: { status: 'unmet', checks: [], waited_ms: 2000, timeout_ms: 2000 } };
      check(manual.withUnsupportedExpectFill(carried, spec) === carried, 'withUnsupportedExpectFill: existing expect_result returned by reference');
      check(manual.withUnsupportedExpectFill(null, spec) === null, 'withUnsupportedExpectFill: null result returned as is');
      check(sameValue(manual.buildUnsupportedExpectResult({ selector: '#a', state: 'checked', value: 'on' }),
        unsupportedResult([['state', 'checked'], ['value', '[redacted]']], 2000)),
        'buildUnsupportedExpectResult: state and value checks in the extension order');
    }

    // -----------------------------------------------------------------------
    console.log('\n--- mapFSBError: unknown outcomes carry expect_result (D-21, T-69-05) ---');
    const BASE_TRAILER = JSON.stringify({ outcome: 'unknown', mayHaveExecuted: true });
    const VERIFIED_NEXT_ACTION = 'Next action: The expected effect was observed (expect_result verified). Do not repeat the action.';
    const unknownFixtures = MAP_FIXTURES.filter((fixture) => fixture.input.mayHaveExecuted === true);
    const verifiedResult = { status: 'verified', checks: [{ kind: 'text_visible', expected: 'Saved', observed: 'Saved', status: 'met' }], waited_ms: 120, timeout_ms: 2000 };
    const unmetResult = { status: 'unmet', checks: [{ kind: 'text_visible', expected: 'Saved', observed: null, status: 'unmet' }], waited_ms: 2000, timeout_ms: 2000 };
    const uncertainResult = unsupportedResult([['url_includes', '/a']], 2000);
    for (const fixture of unknownFixtures) {
      for (const [label, er] of [['unmet', unmetResult], ['uncertain', uncertainResult]]) {
        const mapped = mapFSBError({ ...fixture.input, expect_result: er });
        const text = mapped.content[0].text;
        const want = fixture.text.replace(BASE_TRAILER, JSON.stringify({ outcome: 'unknown', mayHaveExecuted: true, expect_result: er }));
        check(mapped.isError === true && text === want,
          `${fixture.label} + ${label} expect_result: same text and Next action, trailer adds expect_result, isError true`
            + (text === want ? '' : `\n      want: ${JSON.stringify(want)}\n      got:  ${JSON.stringify(text)}`));
      }
      const mapped = mapFSBError({ ...fixture.input, expect_result: verifiedResult });
      const text = mapped.content[0].text;
      const lines = text.split('\n');
      const nextAction = lines.find((line) => line.startsWith('Next action:'));
      const trailer = lines[lines.length - 1];
      check(mapped.isError === true && text.includes('Action outcome unknown'),
        `${fixture.label} + verified: isError stays true and the text still says "Action outcome unknown"`);
      check(nextAction === VERIFIED_NEXT_ACTION && !/retry/i.test(nextAction) && !text.includes('then retry.'),
        `${fixture.label} + verified: Next action says the effect was observed and not to repeat it (no "retry")`);
      check(trailer === JSON.stringify({ outcome: 'unknown', mayHaveExecuted: true, expect_result: verifiedResult }),
        `${fixture.label} + verified: trailer is { outcome, mayHaveExecuted, expect_result } in that order`);
      check(text === fixture.text.replace(/Next action: .*\n/, `${VERIFIED_NEXT_ACTION}\n`).replace(BASE_TRAILER, trailer),
        `${fixture.label} + verified: only the Next action line and the trailer differ from today's text`);
    }
    for (const [label, er] of [['null', null], ['a string', 'verified']]) {
      const fixture = unknownFixtures[0];
      const mapped = mapFSBError({ ...fixture.input, expect_result: er });
      check(mapped.content[0].text === fixture.text && mapped.isError === true,
        `unknown outcome with expect_result ${label} (not an object) is byte-identical to today's`);
    }

    console.log('\n--- unknown outcomes end to end ---');
    {
      const golden = goldenByName.get('click');
      cannedFor = () => ({ success: false, outcome: 'unknown', mayHaveExecuted: true, error: 'Port closed after dispatch' });
      const outcome = await call('click', { ...golden.args, expect: { url_includes: '/a' } });
      cannedFor = defaultCanned;
      const text = responseText(outcome) || '';
      const want = unknownFixtures[0].text.replace(BASE_TRAILER,
        JSON.stringify({ outcome: 'unknown', mayHaveExecuted: true, expect_result: unsupportedResult([['url_includes', '/a']], 2000) }));
      check(outcome.result && outcome.result.isError === true && text === want,
        'click unknown outcome from an older extension: the trailer carries the extension_unsupported fill, Next action unchanged');
    }
    {
      const golden = goldenByName.get('click');
      cannedFor = () => ({ success: false, outcome: 'unknown', mayHaveExecuted: true, error: 'Port closed after dispatch', expect_result: verifiedResult });
      const outcome = await call('click', { ...golden.args, expect: { text_visible: 'Saved' } });
      cannedFor = defaultCanned;
      const text = responseText(outcome) || '';
      check(outcome.result && outcome.result.isError === true && text.includes(VERIFIED_NEXT_ACTION)
        && text.endsWith(JSON.stringify({ outcome: 'unknown', mayHaveExecuted: true, expect_result: verifiedResult })),
        'click unknown outcome with a verified expect_result: isError true, do-not-repeat line, trailer carries it');
    }
    {
      cannedFor = () => ({ success: false, outcome: 'unknown', mayHaveExecuted: true, error: 'Port closed after dispatch' });
      const outcome = await call('click', { ...goldenByName.get('click').args });
      cannedFor = defaultCanned;
      check(responseText(outcome) === unknownFixtures[0].text && outcome.result.isError === true,
        'click unknown outcome without expect: byte-identical to today');
    }
  } finally {
    await session.close();
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: mcp-expect-wire threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
