// Phase 66 run identity and preflight (D-18, D-19): canonical hashing, git
// identity, and the refusal matrix that keeps benchmark runs off the user's
// everyday extension, a stale hub, a retired model and a dirty tree.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PINNED_AUTOPILOT_MODEL,
  SERVED_MODEL_PATTERN,
  WEB_STORE_EXTENSION_ID,
  canonicalJson,
  evaluatePreflight,
  gitIdentity,
  servedModelMatches,
  sha256Hex,
  toolsListDigest,
} from '../scripts/bench/lib/identity.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const UNPACKED_ID = 'abcdefghijklmnopabcdefghijklmnop';

function goodInput() {
  return {
    mode: 'campaign',
    arms: ['autopilot', 'claude'],
    configPayload: {
      success: true,
      config: { providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4.3', maxIterations: 20 },
      extension: { id: UNPACKED_ID, version: '0.9.91', measurement: { callTiming: 1, sessionDetailJournal: 1 } },
    },
    hub: { listenerPid: 4242, serverPid: 4242 },
    claudeModel: 'claude-sonnet-4-6',
    expectExtensionId: UNPACKED_ID,
    git: { dirty: false },
    allowDirty: false,
    toolsList: { count: 73 },
  };
}

function codes(result) {
  return result.refusals.map((r) => r.code);
}

test('constants pin the Web Store id, the autopilot model and the served-model pattern', () => {
  assert.equal(WEB_STORE_EXTENSION_ID, 'badgafnfchcihdfnjneklogedcdkmjfk');
  assert.equal(PINNED_AUTOPILOT_MODEL, 'grok-4.3');
  assert.equal(SERVED_MODEL_PATTERN.source, '^grok-4\\.3');
});

test('canonicalJson sorts keys at every depth, keeps array order and drops undefined values', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
  assert.equal(canonicalJson({ a: 1, b: undefined, c: () => 1 }), '{"a":1}');
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
  assert.equal(canonicalJson(undefined), 'null');
  const shared = { x: 1 };
  assert.equal(canonicalJson({ p: shared, q: shared }), '{"p":{"x":1},"q":{"x":1}}', 'shared references are not cycles');
});

test('canonicalJson throws on a cycle', () => {
  const cyclic = { name: 'loop' };
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), TypeError);
  const cyclicArray = [];
  cyclicArray.push(cyclicArray);
  assert.throws(() => canonicalJson(cyclicArray), TypeError);
});

test('sha256Hex matches the FIPS 180-2 "abc" vector', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('toolsListDigest ignores tool and key order but not descriptions', () => {
  const tools = [
    { name: 'navigate', description: 'Open a URL', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
    { name: 'click', description: 'Click an element', inputSchema: { type: 'object', properties: { ref: { type: 'string' } } } },
    { name: 'read_page', description: 'Read the page', inputSchema: { type: 'object' } },
  ];
  const digest = toolsListDigest(tools);
  assert.equal(digest.count, 3);
  assert.match(digest.sha256, /^[0-9a-f]{64}$/);

  const reordered = [
    { inputSchema: { type: 'object' }, description: 'Read the page', name: 'read_page' },
    { description: 'Open a URL', name: 'navigate', inputSchema: { required: ['url'], properties: { url: { type: 'string' } }, type: 'object' } },
    { name: 'click', inputSchema: { properties: { ref: { type: 'string' } }, type: 'object' }, description: 'Click an element' },
  ];
  assert.deepEqual(toolsListDigest(reordered), digest);

  const annotated = tools.map((t) => ({ ...t, annotations: { readOnlyHint: true } }));
  assert.deepEqual(toolsListDigest(annotated), digest, 'only name, description and inputSchema are hashed');

  const edited = tools.map((t) => (t.name === 'click' ? { ...t, description: 'Click an element once' } : t));
  const changed = toolsListDigest(edited);
  assert.notEqual(changed.sha256, digest.sha256);
  assert.equal(changed.count, 3);

  assert.deepEqual(toolsListDigest([]).count, 0);
});

test('gitIdentity returns a 40-hex sha and a boolean dirty flag for the repo', () => {
  const identity = gitIdentity(REPO_ROOT);
  assert.match(identity.sha, /^[0-9a-f]{40}$/);
  assert.equal(typeof identity.dirty, 'boolean');
  assert.ok(Array.isArray(identity.dirtyPaths));
  assert.equal(identity.dirty, identity.dirtyPaths.length > 0);
});

test('servedModelMatches accepts grok-4.3 variants only', () => {
  assert.equal(servedModelMatches('grok-4.3'), true);
  assert.equal(servedModelMatches('grok-4.3-latest'), true);
  assert.equal(servedModelMatches('grok-4-1-fast-reasoning'), false);
  assert.equal(servedModelMatches('xai/grok-4.3'), false);
  assert.equal(servedModelMatches(null), false);
});

test('an all-good preflight input passes with no refusals', () => {
  assert.deepEqual(evaluatePreflight(goodInput()), { ok: true, refusals: [] });
});

const REFUSAL_CASES = [
  ['config_unavailable', (input) => { input.configPayload = null; }],
  ['measurement_marker_missing', (input) => { delete input.configPayload.extension.measurement; }],
  ['webstore_extension_loaded', (input) => {
    input.configPayload.extension.id = WEB_STORE_EXTENSION_ID;
    input.expectExtensionId = WEB_STORE_EXTENSION_ID;
  }],
  ['extension_id_mismatch', (input) => { input.expectExtensionId = 'ponmlkjihgfedcbaponmlkjihgfedcba'; }],
  ['provider_kind_not_api', (input) => { input.configPayload.config.providerKind = 'agent'; }],
  ['provider_not_xai', (input) => { input.configPayload.config.modelProvider = 'openai'; }],
  ['model_not_pinned', (input) => { input.configPayload.config.modelName = 'grok-4-1-fast'; }],
  ['claude_model_required', (input) => { delete input.claudeModel; }],
  ['hub_not_owned', (input) => { input.hub.serverPid = 9999; }],
  ['dirty_tree', (input) => { input.git.dirty = true; }],
  ['tool_list_empty', (input) => { input.toolsList.count = 0; }],
];

for (const [code, breakIt] of REFUSAL_CASES) {
  test(`preflight refusal ${code} fires alone when only its condition is broken`, () => {
    const input = goodInput();
    breakIt(input);
    const result = evaluatePreflight(input);
    assert.equal(result.ok, false);
    assert.deepEqual(codes(result), [code]);
    assert.equal(typeof result.refusals[0].detail, 'string');
  });
}

test('config_unavailable also covers a failed or config-less fsb://config payload', () => {
  for (const payload of [undefined, 'text', { success: false, error: 'bridge offline' }, { success: true }, { success: true, config: 'x' }]) {
    const input = goodInput();
    input.configPayload = payload;
    assert.deepEqual(codes(evaluatePreflight(input)), ['config_unavailable'], JSON.stringify(payload));
  }
});

test('measurement_marker_missing requires both markers to equal 1', () => {
  for (const measurement of [{ callTiming: 1 }, { sessionDetailJournal: 1 }, { callTiming: true, sessionDetailJournal: 1 }, { callTiming: 1, sessionDetailJournal: 2 }]) {
    const input = goodInput();
    input.configPayload.extension.measurement = measurement;
    assert.deepEqual(codes(evaluatePreflight(input)), ['measurement_marker_missing'], JSON.stringify(measurement));
  }
});

test('hub_not_owned fires when either pid is missing', () => {
  for (const hub of [{ listenerPid: null, serverPid: 4242 }, { listenerPid: 4242 }, {}, undefined]) {
    const input = goodInput();
    input.hub = hub;
    assert.deepEqual(codes(evaluatePreflight(input)), ['hub_not_owned'], JSON.stringify(hub));
  }
});

test('provider and model checks apply only when the autopilot arm runs', () => {
  const input = goodInput();
  input.arms = ['claude'];
  Object.assign(input.configPayload.config, { providerKind: 'agent', modelProvider: 'anthropic', modelName: 'claude-x' });
  assert.deepEqual(evaluatePreflight(input), { ok: true, refusals: [] });
});

test('claude_model_required applies only to Claude smoke and campaign runs', () => {
  const preflightOnly = goodInput();
  preflightOnly.mode = 'preflight';
  delete preflightOnly.claudeModel;
  assert.deepEqual(codes(evaluatePreflight(preflightOnly)), []);

  const smoke = goodInput();
  smoke.mode = 'smoke';
  smoke.claudeModel = '   ';
  assert.deepEqual(codes(evaluatePreflight(smoke)), ['claude_model_required']);

  const autopilotOnly = goodInput();
  autopilotOnly.arms = ['autopilot'];
  delete autopilotOnly.claudeModel;
  assert.deepEqual(codes(evaluatePreflight(autopilotOnly)), []);
});

test('dirty_tree applies only to campaigns without allowDirty', () => {
  const smoke = goodInput();
  smoke.mode = 'smoke';
  smoke.git.dirty = true;
  assert.deepEqual(codes(evaluatePreflight(smoke)), []);

  const allowed = goodInput();
  allowed.git.dirty = true;
  allowed.allowDirty = true;
  assert.deepEqual(codes(evaluatePreflight(allowed)), []);

  const unknown = goodInput();
  delete unknown.git;
  assert.deepEqual(codes(evaluatePreflight(unknown)), ['dirty_tree'], 'unknown git state fails closed for campaigns');
});

test('refusal details name only model and provider strings, never other config values', () => {
  const input = goodInput();
  input.configPayload.config = {
    providerKind: 'agent',
    modelProvider: 'openai',
    modelName: 'gpt-5-mini',
    apiKey: 'xai-SECRET-VALUE-0001',
    maxIterations: 987654,
  };
  input.configPayload.extension.id = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
  delete input.configPayload.extension.measurement;
  input.configPayload.extension.version = '9.8.7-private';
  const result = evaluatePreflight(input);
  assert.deepEqual(codes(result), [
    'measurement_marker_missing', 'extension_id_mismatch', 'provider_kind_not_api', 'provider_not_xai', 'model_not_pinned',
  ]);
  const json = JSON.stringify(result);
  for (const secret of ['xai-SECRET-VALUE-0001', '987654', 'zzzzzzzzzzzzzzzz', '9.8.7-private']) {
    assert.ok(!json.includes(secret), `refusal details echoed ${secret}`);
  }
  assert.ok(json.includes('openai'), 'provider string may be named');
  assert.ok(json.includes('gpt-5-mini'), 'model string may be named');
});
