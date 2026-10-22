/**
 * Phase 69 Plan 07, SC4 layer 1 (MCP-02, MCP-04; CONTEXT D-19, D-21, D-23):
 * a representative MCP caller performs an action and reads its verified
 * effect in exactly one tools/call.
 *
 * The caller is the real SDK Client over InMemoryTransport, driving
 * createRuntime() from mcp/build (tests/helpers/mcp-in-process.mjs), so every
 * call passes the SDK's own input validation, the expect sidecar code and
 * mapFSBError exactly as a host's call would. The bridge is a stand-in
 * extension: it answers mcp:execute-action and mcp:go-back with a canned
 * action result and, when the payload carries `expect`, runs the REAL
 * normalizeExpectSpec + evaluateExpectation from
 * extension/utils/action-verification.js against canned page probes (fake
 * clock, canned tab). A wrapper on the client transport records every
 * JSON-RPC message the caller sends, so "one call" is counted, not assumed.
 *
 * Never skips. No ports, no sockets, no git, no child processes; Node 20 safe.
 * The live demonstration with a real host is Validation Block V5.
 *
 * Run: npm --prefix mcp run build && node --test tests/mcp-expect-caller.test.mjs
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test, { after } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  REPO_ROOT,
  assertBuildFresh,
  createInProcessClient,
  makeStubBridge,
} from './helpers/mcp-in-process.mjs';

// A stale build would exercise old code; fail loudly before anything else.
assertBuildFresh();

const require = createRequire(import.meta.url);
const av = require('../extension/utils/action-verification.js');
const manual = await import(pathToFileURL(path.join(REPO_ROOT, 'mcp', 'build', 'tools', 'manual.js')).href);

const DISPATCH_TYPES = new Set(['mcp:execute-action', 'mcp:go-back']);
const VISUAL_ARGS = Object.freeze({ visual_reason: 'sc4 caller', client: 'Claude' });
const DEFAULT_TAB = Object.freeze({ id: 7, url: 'https://app.example.test/editor', title: 'Editor', status: 'complete' });
const RAW_PAGE_VALUE = 'secret-token-123';

// ---------------------------------------------------------------------------
// Canned page behaviour, one scenario at a time.
// ---------------------------------------------------------------------------

// Probe answer built from a per-kind observation table. Each probed check
// gets { kind, observable: true, holds, observed, redact: false } unless the
// table overrides fields for that kind.
function cannedProbe(byKind) {
  return (probeSpec) => ({
    ok: true,
    documentId: 'doc-current',
    result: {
      ok: true,
      textTruncated: false,
      observations: probeSpec.checks.map((check) => ({
        kind: check.kind,
        observable: true,
        holds: false,
        observed: null,
        redact: false,
        ...(byKind[check.kind] || {}),
      })),
    },
  });
}

function baseScenario(overrides = {}) {
  return {
    actionResult: { success: true },
    tab: { ...DEFAULT_TAB },
    probe: cannedProbe({}),
    commit: null,
    ...overrides,
  };
}

let scenario = baseScenario();
const probeCalls = [];
const evaluations = [];

// Same verb-independent rule as the real dispatcher: expect_result rides only
// on success:true or mayHaveExecuted:true (D-19).
async function fakeExtension(message) {
  if (!DISPATCH_TYPES.has(message.type)) return { success: true };
  const current = scenario;
  const payload = message.payload || {};
  const result = { ...current.actionResult };
  if (payload.expect === undefined || !(result.success === true || result.mayHaveExecuted === true)) {
    return result;
  }
  const normalized = av.normalizeExpectSpec(payload.expect);
  if (!normalized.ok) {
    result.expect_result = av.buildUncertainExpectResult(null, 'invalid_expect');
    return result;
  }
  let t = 0;
  const deps = {
    tabsGet: async () => (current.tab ? { ...current.tab } : null),
    executeProbe: async (tabId, func, args) => {
      probeCalls.push({ tabId, func, args });
      assert.equal(func, av._fsbExpectProbeInPage, 'the evaluator injects the real self-contained probe');
      return current.probe(args[0], t);
    },
    now: () => t,
    sleep: async (ms) => { t += Math.max(0, Number(ms) || 0); },
  };
  const expectResult = await av.evaluateExpectation({
    tabId: current.tab ? current.tab.id : DEFAULT_TAB.id,
    spec: normalized.spec,
    deps,
    commit: current.commit || undefined,
  });
  evaluations.push(expectResult);
  result.expect_result = expectResult;
  return result;
}

const bridge = makeStubBridge({ onSend: (message) => fakeExtension(message) });
const session = await createInProcessClient({ bridge });
after(() => session.close());

// The caller transcript: every JSON-RPC message the client puts on its
// transport after the initialize handshake.
const transcript = [];
const clientTransport = session.client.transport;
assert.ok(clientTransport && typeof clientTransport.send === 'function', 'the SDK client exposes its transport');
const originalSend = clientTransport.send.bind(clientTransport);
clientTransport.send = (jsonRpcMessage, options) => {
  transcript.push(JSON.parse(JSON.stringify(jsonRpcMessage)));
  return originalSend(jsonRpcMessage, options);
};

// One caller turn: reset the recorders, set the scenario, make exactly one
// callTool, and return what the caller and the stand-in extension saw.
async function act(name, args, nextScenario) {
  scenario = nextScenario;
  transcript.length = 0;
  probeCalls.length = 0;
  evaluations.length = 0;
  bridge.calls.length = 0;
  const result = await session.client.callTool({ name, arguments: args });
  const requests = transcript.filter((m) => typeof m.method === 'string' && m.id !== undefined);
  const dispatches = bridge.calls.filter((entry) => DISPATCH_TYPES.has(entry.message.type));
  const text = result && Array.isArray(result.content) && result.content[0] ? result.content[0].text : '';
  return { result, text, requests, dispatches, probes: probeCalls.slice(), evaluations: evaluations.slice() };
}

function assertOneCall(turn, label) {
  const toolCalls = turn.requests.filter((m) => m.method === 'tools/call');
  assert.equal(toolCalls.length, 1, `${label}: exactly one tools/call in the caller transcript`);
  assert.deepEqual(turn.requests.map((m) => m.method), ['tools/call'],
    `${label}: no other request (no follow-up read) in the caller transcript`);
  assert.equal(turn.dispatches.length, 1, `${label}: exactly one bridge dispatch`);
}

function parseBody(turn) {
  assert.notEqual(turn.result.isError, true, `success response expected, got: ${turn.text}`);
  return JSON.parse(turn.text);
}

// Trailing JSON of an unknown-outcome response (mapFSBError D-21).
function trailerOf(text) {
  const lines = text.split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

// ---------------------------------------------------------------------------
// Scenarios (D-23 layer 1)
// ---------------------------------------------------------------------------

test('1. click with expect.text_visible: one tools/call returns the action and its verified effect', async () => {
  const expect = { text_visible: 'Saved' };
  const turn = await act('click', { selector: '#save', ...VISUAL_ARGS, expect }, baseScenario({
    actionResult: { success: true, clicked: '#save', tabId: 7 },
    probe: cannedProbe({ text_visible: { holds: true, observed: 'present' } }),
  }));
  assertOneCall(turn, 'click');
  const body = parseBody(turn);
  assert.equal(body.success, true);
  assert.equal(body.clicked, '#save', 'the action result is in the same response');
  assert.equal(body.expect_result.status, 'verified');
  assert.deepEqual(body.expect_result.checks, [{ kind: 'text_visible', expected: 'Saved', observed: 'present', status: 'met' }]);
  assert.equal(body.expect_result.timeout_ms, av.EXPECT_DEFAULT_TIMEOUT_MS);
  const payload = turn.dispatches[0].message.payload;
  assert.equal(turn.dispatches[0].message.type, 'mcp:execute-action');
  assert.deepEqual(payload.expect, expect, 'the bridge payload carries expect exactly as the caller sent it');
  assert.equal(Object.prototype.hasOwnProperty.call(payload.params, 'expect'), false, 'expect never enters params');
  assert.equal(turn.probes.length, 1, 'met on the first probe');
});

test('2. navigate with expect.url_includes: verified after the commit', async () => {
  const turn = await act('navigate', { url: 'https://app.example.test/done', ...VISUAL_ARGS, expect: { url_includes: '/done' } },
    baseScenario({
      actionResult: { success: true, navigated: true, tabId: 7 },
      tab: { ...DEFAULT_TAB, url: 'https://app.example.test/done', title: 'Done' },
      commit: { required: true, isCommitted: () => true, documentId: () => 'doc-done' },
    }));
  assertOneCall(turn, 'navigate');
  const body = parseBody(turn);
  assert.equal(body.expect_result.status, 'verified');
  assert.deepEqual(body.expect_result.checks, [{
    kind: 'url_includes', expected: '/done', observed: 'https://app.example.test/done', status: 'met',
  }]);
  assert.equal(turn.probes.length, 0, 'a tab-level check needs no page injection');
  assert.equal(turn.dispatches[0].options.timeout, 30000, 'navigate keeps its 30 s action timeout');
});

test('3. unknown-outcome click with expect met: isError, verified trailer, do not repeat', async () => {
  const turn = await act('click', { selector: '#pay', ...VISUAL_ARGS, expect: { text_visible: 'Saved' } }, baseScenario({
    actionResult: { success: false, outcome: 'unknown', mayHaveExecuted: true },
    probe: cannedProbe({ text_visible: { holds: true, observed: 'present' } }),
  }));
  assertOneCall(turn, 'unknown-outcome click');
  assert.equal(turn.result.isError, true, 'the single-activation semantics keep isError true');
  assert.match(turn.text, /^Detected: Action outcome unknown\n/);
  const nextAction = turn.text.split('\n').find((line) => line.startsWith('Next action:'));
  assert.ok(nextAction, 'a Next action line is present');
  assert.match(nextAction, /Do not repeat the action/);
  assert.doesNotMatch(nextAction, /retry/i, 'the Next action line never invites a retry');
  const trailer = trailerOf(turn.text);
  assert.deepEqual(Object.keys(trailer), ['outcome', 'mayHaveExecuted', 'expect_result']);
  assert.equal(trailer.outcome, 'unknown');
  assert.equal(trailer.mayHaveExecuted, true);
  assert.equal(trailer.expect_result.status, 'verified');
});

test('4a. unmet: the text never appears by the deadline, still one tools/call', async () => {
  const turn = await act('click', { selector: '#save', ...VISUAL_ARGS, expect: { text_visible: 'Saved' } }, baseScenario({
    probe: cannedProbe({ text_visible: { holds: false, observed: 'absent' } }),
  }));
  assertOneCall(turn, 'unmet click');
  const body = parseBody(turn);
  assert.equal(body.success, true, 'success still means the action ran');
  assert.equal(body.expect_result.status, 'unmet');
  assert.deepEqual(body.expect_result.checks, [{ kind: 'text_visible', expected: 'Saved', observed: 'absent', status: 'unmet' }]);
  assert.equal(body.expect_result.waited_ms, av.EXPECT_DEFAULT_TIMEOUT_MS, 'polled until the default deadline');
  assert.equal(Object.prototype.hasOwnProperty.call(body.expect_result, 'reason'), false, 'reason only on uncertain');
  assert.ok(turn.probes.length > 1, 'the evaluator polled more than once');
});

test('4b. uncertain: the probe loses its race, still one tools/call', async () => {
  const turn = await act('click', { selector: '#save', ...VISUAL_ARGS, expect: { text_visible: 'Saved' } }, baseScenario({
    probe: () => ({ ok: false, reason: 'timeout' }),
  }));
  assertOneCall(turn, 'uncertain click');
  const body = parseBody(turn);
  assert.equal(body.expect_result.status, 'uncertain');
  assert.equal(body.expect_result.reason, 'probe_timeout');
  assert.deepEqual(body.expect_result.checks, [{ kind: 'text_visible', expected: 'Saved', observed: null, status: 'uncertain' }]);
  assert.equal(turn.probes.length, 1, 'no further probe after a probe timeout');
});

test('4c. unmet value check on a plain field: observed is redacted end to end (D-19)', async () => {
  const turn = await act('type_text', {
    selector: '#email', text: 'x@y.z', ...VISUAL_ARGS,
    expect: { selector: '#email', value: 'x@y.z', timeout_ms: 0 },
  }, baseScenario({
    probe: cannedProbe({ value: { holds: false, observed: RAW_PAGE_VALUE, redact: false } }),
  }));
  assertOneCall(turn, 'value check');
  const body = parseBody(turn);
  assert.equal(body.expect_result.status, 'unmet');
  assert.deepEqual(body.expect_result.checks, [{ kind: 'value', expected: 'x@y.z', observed: av.EXPECT_REDACTED, status: 'unmet' }]);
  assert.equal(body.expect_result.timeout_ms, 0);
  assert.ok(!turn.text.includes(RAW_PAGE_VALUE), 'the raw page value never reaches the MCP response');
});

test('5. expect sent as a JSON string is accepted and verified', async () => {
  const turn = await act('click', { selector: '#save', ...VISUAL_ARGS, expect: '{"text_visible":"Saved"}' }, baseScenario({
    probe: cannedProbe({ text_visible: { holds: true, observed: 'present' } }),
  }));
  assertOneCall(turn, 'stringified expect');
  assert.deepEqual(turn.dispatches[0].message.payload.expect, { text_visible: 'Saved' }, 'the string arrives parsed');
  assert.equal(parseBody(turn).expect_result.status, 'verified');
});

test('6. click without expect: no expect key on the wire and the baseline response bytes', async () => {
  const canned = { success: true, clicked: '#save', tabId: 7 };
  const turn = await act('click', { selector: '#save', ...VISUAL_ARGS }, baseScenario({ actionResult: canned }));
  assertOneCall(turn, 'no-expect click');
  const payload = turn.dispatches[0].message.payload;
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'expect'), false, 'no expect key in the bridge payload');
  assert.equal(Object.prototype.hasOwnProperty.call(payload.params, 'expect'), false, 'no expect key in params');
  assert.equal(turn.text, JSON.stringify(canned, null, 2), 'the response is the canned result, byte for byte');
  assert.equal(turn.result.isError, undefined);
  assert.equal(turn.probes.length, 0, 'nothing is probed');
  assert.equal(turn.dispatches[0].options.timeout, 30000);
});

test('7. a content-verb tool (type_text) and a CDP-verb tool (click_at) carry expect to the wire verb', async () => {
  const typed = await act('type_text', { selector: '#q', text: 'hello', ...VISUAL_ARGS, expect: { text_visible: 'hello' } },
    baseScenario({ probe: cannedProbe({ text_visible: { holds: true, observed: 'present' } }) }));
  assertOneCall(typed, 'type_text');
  assert.equal(typed.dispatches[0].message.payload.tool, 'type', 'type_text travels as the content verb type');
  assert.deepEqual(typed.dispatches[0].message.payload.expect, { text_visible: 'hello' });
  assert.equal(parseBody(typed).expect_result.status, 'verified');

  const clicked = await act('click_at', { x: 10, y: 20, ...VISUAL_ARGS, expect: { selector: '#menu', state: 'visible' } },
    baseScenario({ probe: cannedProbe({ state: { holds: true, observed: 'visible' } }) }));
  assertOneCall(clicked, 'click_at');
  assert.equal(clicked.dispatches[0].message.payload.tool, 'cdpClickAt', 'click_at travels as the CDP verb cdpClickAt');
  assert.deepEqual(clicked.dispatches[0].message.payload.expect, { selector: '#menu', state: 'visible' });
  assert.deepEqual(clicked.dispatches[0].message.payload.params, { x: 10, y: 20, shiftKey: false, ctrlKey: false, altKey: false },
    'PARAM_TRANSFORMS rebuild params without expect');
  const body = parseBody(clicked);
  assert.equal(body.expect_result.status, 'verified');
  assert.deepEqual(body.expect_result.checks, [{ kind: 'state', expected: 'visible', observed: 'visible', status: 'met' }]);
});

test('8. back with expect: mcp:go-back carries expect and the timeout makes room for the check', async () => {
  const expect = { text_visible: 'Home', timeout_ms: 1000 };
  const turn = await act('back', { tab_id: 7, expect }, baseScenario({
    actionResult: { success: true, status: 'navigated', tabId: 7 },
    tab: { ...DEFAULT_TAB, url: 'https://app.example.test/home', title: 'Home' },
    commit: { required: true, isCommitted: () => true, documentId: () => 'doc-current' },
    probe: cannedProbe({ text_visible: { holds: true, observed: 'present' } }),
  }));
  assertOneCall(turn, 'back');
  const dispatch = turn.dispatches[0];
  assert.equal(dispatch.message.type, 'mcp:go-back');
  assert.deepEqual(dispatch.message.payload.expect, expect);
  assert.equal(dispatch.message.payload.tabId, 7);
  assert.equal(dispatch.options.timeout, 5000 + av.clampExpectTimeoutMs(expect.timeout_ms) + 1500,
    'back timeout = 5,000 + clamp(timeout_ms) + 1,500');
  assert.equal(dispatch.options.timeout, 7500);
  assert.equal(manual.EXPECT_BRIDGE_HEADROOM_MS, 1500);
  const body = parseBody(turn);
  assert.equal(body.expect_result.status, 'verified');
  assert.equal(body.expect_result.timeout_ms, 1000);
});

test('8b. back without expect keeps the 5,000 ms timeout and an expect-free payload', async () => {
  const canned = { success: true, status: 'navigated', tabId: 7 };
  const turn = await act('back', { tab_id: 7 }, baseScenario({ actionResult: canned }));
  assertOneCall(turn, 'back without expect');
  assert.equal(turn.dispatches[0].options.timeout, 5000);
  assert.equal(Object.prototype.hasOwnProperty.call(turn.dispatches[0].message.payload, 'expect'), false);
  assert.equal(turn.text, JSON.stringify(canned, null, 2));
});

test('9. a malformed expect is rejected before dispatch: no bridge send, no side effect', async () => {
  const turn = await act('click', { selector: '#save', ...VISUAL_ARGS, expect: { bogus: 1 } }, baseScenario());
  assert.equal(turn.requests.filter((m) => m.method === 'tools/call').length, 1);
  assert.equal(turn.result.isError, true);
  assert.match(turn.text, /-32602/);
  assert.equal(turn.dispatches.length, 0, 'validation stops the call before the bridge');
});
