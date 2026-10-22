// Phase 71 Plan 09 Task 3 (REL-02-d; CONTEXT D-26; Pitfall 16; T-71-05): the
// count_tokens script V4 runs for MCP-01's "more than half" (M-71-09).
//
// Every request goes to an injected fake fetch that records it and answers
// input_tokens derived from the request body length, so no test reaches the
// network. The API key is a sentinel; every scenario, the error paths
// included, scans the captured stdout and stderr for it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ANTHROPIC_VERSION,
  CAVEATS,
  COUNT_TOKENS_URL,
  REQUEST_TIMEOUT_MS,
  USER_MESSAGE,
  assertBuildFresh,
  defaultDeps,
  main,
  parseArgs,
  toAnthropicTool,
} from '../scripts/mcp/count-tool-tokens.mjs';
import { canonicalJson } from '../scripts/mcp/lib/tools-list.mjs';

const SENTINEL_KEY = 'sk-ant-TESTSENTINEL-0000000000';
const ENV = Object.freeze({ ANTHROPIC_API_KEY: SENTINEL_KEY });

const BASELINE_TOOLS = Object.freeze([
  {
    name: 'click',
    description: 'Click an element on the page identified by a selector or element reference. Long baseline description.',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { selector: { type: 'string', description: 'The selector to click on the page.' } },
      required: ['selector'],
      additionalProperties: false,
    },
    annotations: undefined,
  },
  {
    name: 'navigate',
    description: 'Navigate the active tab to a URL and wait for the page to settle. Long baseline description.',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { url: { type: 'string', description: 'Where to go.' }, extra: undefined },
      required: ['url'],
    },
  },
]);

const CURRENT_TOOLS = Object.freeze([
  {
    name: 'click',
    description: 'Click an element.',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { selector: { type: 'string' }, expect: { type: 'object', additionalProperties: false } },
      required: ['selector'],
      additionalProperties: false,
    },
  },
  {
    name: 'navigate',
    description: 'Open a URL.',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
    execution: undefined,
  },
  {
    name: 'settings',
    description: 'Read or change one FSB setting.',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { key: { type: 'string' }, value: { type: 'string' } },
    },
  },
]);

// input_tokens = a deterministic function of the request body.
const tokensFor = (body) => Math.floor(body.length / 4) + 7;

function fakeFetch({ status = 200, json = null, throwError = null, bodyText = null } = {}) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init, body: JSON.parse(init.body) });
    if (throwError) throw throwError;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (json ? json(init.body) : { input_tokens: tokensFor(init.body) }),
      text: async () => bodyText || '',
    };
  };
  return { requests, fetchImpl };
}

function capture() {
  const out = [];
  const err = [];
  return { out, err, stdout: (text) => out.push(text), stderr: (text) => err.push(text), all: () => out.join('') + err.join('') };
}

async function run(argv, { env = ENV, fetch: fetchOverride, baseline = BASELINE_TOOLS, current = CURRENT_TOOLS } = {}) {
  const io = capture();
  const fake = fetchOverride || fakeFetch();
  const code = await main(argv, {
    env,
    fetch: fake.fetchImpl,
    readBaseline: async () => baseline,
    readCurrent: async () => current,
    stdout: io.stdout,
    stderr: io.stderr,
  });
  return { code, io, requests: fake.requests };
}

function assertNoSecret(io) {
  const text = io.all();
  assert.equal(text.includes(SENTINEL_KEY), false, 'the API key never appears in stdout or stderr');
  assert.equal(text.includes('TESTSENTINEL'), false, 'no fragment of the API key appears');
  assert.equal(text.toLowerCase().includes('x-api-key'), false, 'the key header name never appears');
  assert.equal(text.includes('anthropic-version'), false, 'no header appears');
  assert.equal(/headers/i.test(text), false, 'the headers object never appears');
}

function expectedTool(tool, { strip = false } = {}) {
  const converted = JSON.parse(canonicalJson({ name: tool.name, description: tool.description, input_schema: tool.inputSchema }));
  if (strip) delete converted.input_schema.$schema;
  return converted;
}

test('two models: four count_tokens POSTs per model with the key from the env and the fixed headers', async () => {
  const { code, io, requests } = await run(['--model', 'm1', '--model', 'm2']);
  assert.equal(code, 0, io.err.join(''));
  assert.equal(requests.length, 8);
  for (const request of requests) {
    assert.equal(request.url, COUNT_TOKENS_URL);
    assert.equal(COUNT_TOKENS_URL, 'https://api.anthropic.com/v1/messages/count_tokens');
    assert.equal(request.init.method, 'POST');
    assert.deepEqual(request.init.headers, {
      'x-api-key': SENTINEL_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    });
    assert.equal(ANTHROPIC_VERSION, '2023-06-01');
    assert.deepEqual(request.body.messages, [{ role: 'user', content: USER_MESSAGE }]);
    assert.equal(USER_MESSAGE, 'List the available tools.');
  }
  for (const model of ['m1', 'm2']) {
    const mine = requests.filter((request) => request.body.model === model);
    assert.equal(mine.length, 4, `${model}: four requests`);
    const withTools = mine.filter((request) => Object.prototype.hasOwnProperty.call(request.body, 'tools'));
    const withoutTools = mine.filter((request) => !Object.prototype.hasOwnProperty.call(request.body, 'tools'));
    assert.equal(withTools.length, 2);
    assert.equal(withoutTools.length, 2);
    for (const request of withoutTools) assert.deepEqual(Object.keys(request.body).sort(), ['messages', 'model']);
    const sentNames = withTools.map((request) => request.body.tools.map((tool) => tool.name));
    assert.deepEqual(sentNames, [['click', 'navigate'], ['click', 'navigate', 'settings']]);
  }
  assertNoSecret(io);
});

test('each tool is sent as {name, description, input_schema} built through canonicalJson', async () => {
  const { requests } = await run(['--model', 'm1']);
  const [baselineRequest, , currentRequest] = requests;
  assert.deepEqual(baselineRequest.body.tools, BASELINE_TOOLS.map((tool) => expectedTool(tool)));
  assert.deepEqual(currentRequest.body.tools, CURRENT_TOOLS.map((tool) => expectedTool(tool)));
  for (const tool of [...baselineRequest.body.tools, ...currentRequest.body.tools]) {
    assert.deepEqual(Object.keys(tool).sort(), ['description', 'input_schema', 'name']);
    assert.equal(tool.input_schema.$schema, 'http://json-schema.org/draft-07/schema#');
  }
  assert.equal(Object.prototype.hasOwnProperty.call(baselineRequest.body.tools[1].input_schema.properties, 'extra'), false,
    'undefined keys are dropped');
  assert.deepEqual(toAnthropicTool(CURRENT_TOOLS[1]), expectedTool(CURRENT_TOOLS[1]));
});

test('tool tokens subtract the same model\'s no-tools count; text output is labelled an estimate with both caveats', async () => {
  const { code, io, requests } = await run(['--model', 'm1']);
  assert.equal(code, 0);
  const counts = requests.map((request) => tokensFor(JSON.stringify(request.body)));
  const baselineTokens = counts[0] - counts[1];
  const currentTokens = counts[2] - counts[3];
  const text = io.out.join('');
  assert.match(text, /estimate/);
  assert.match(text, new RegExp(`baseline[^\\n]*${baselineTokens} tool tokens`));
  assert.match(text, new RegExp(`current[^\\n]*${currentTokens} tool tokens`));
  const ratio = Math.round((currentTokens / baselineTokens) * 10000) / 10000;
  const reduction = Math.round((1 - currentTokens / baselineTokens) * 10000) / 100;
  assert.match(text, new RegExp(`ratio ${String(ratio).replace('.', '\\.')}`));
  assert.match(text, new RegExp(`reduction ${String(reduction).replace('.', '\\.')}%`));
  assert.ok(text.includes('newer tokenizers count about 30% more tokens for the same text'));
  assert.ok(text.includes("Claude Code's default tool search loads only tool names at session start, so whole-schema counts overstate session-start context"));
  assert.ok(text.indexOf(CAVEATS[0]) > text.indexOf('ratio'), 'the caveats follow the figures');
  assertNoSecret(io);
});

test('--json prints the same figures as JSON', async () => {
  const { code, io, requests } = await run(['--model', 'm1', '--model', 'm2', '--json']);
  assert.equal(code, 0);
  const report = JSON.parse(io.out.join(''));
  assert.equal(report.label, 'estimate');
  assert.deepEqual(report.caveats, [...CAVEATS]);
  assert.deepEqual(report.models.map((entry) => entry.model), ['m1', 'm2']);
  const counts = requests.map((request) => tokensFor(JSON.stringify(request.body)));
  const first = report.models[0];
  assert.deepEqual(first.baseline, { tools: 2, withTools: counts[0], withoutTools: counts[1], toolTokens: counts[0] - counts[1] });
  assert.deepEqual(first.current, { tools: 3, withTools: counts[2], withoutTools: counts[3], toolTokens: counts[2] - counts[3] });
  assert.equal(first.ratio, Math.round(((counts[2] - counts[3]) / (counts[0] - counts[1])) * 10000) / 10000);
  assert.equal(first.reductionPercent, Math.round((1 - (counts[2] - counts[3]) / (counts[0] - counts[1])) * 10000) / 100);
  assertNoSecret(io);
});

test('--strip-schema-keyword removes the top-level $schema from every input_schema', async () => {
  const { code, requests } = await run(['--model', 'm1', '--strip-schema-keyword']);
  assert.equal(code, 0);
  const withTools = requests.filter((request) => request.body.tools);
  assert.equal(withTools.length, 2);
  for (const request of withTools) {
    for (const tool of request.body.tools) assert.equal(Object.prototype.hasOwnProperty.call(tool.input_schema, '$schema'), false);
  }
  assert.deepEqual(withTools[1].body.tools, CURRENT_TOOLS.map((tool) => expectedTool(tool, { strip: true })));
  assert.equal(CURRENT_TOOLS[0].inputSchema.$schema, 'http://json-schema.org/draft-07/schema#', 'the input lists are not mutated');
});

test('a missing ANTHROPIC_API_KEY exits 2 naming the variable only, before any request', async () => {
  for (const env of [{}, { ANTHROPIC_API_KEY: '' }, { ANTHROPIC_API_KEY: '   ' }]) {
    const { code, io, requests } = await run(['--model', 'm1'], { env });
    assert.equal(code, 2);
    assert.equal(requests.length, 0);
    assert.match(io.err.join(''), /ANTHROPIC_API_KEY/);
    assertNoSecret(io);
  }
});

test('no --model and unknown flags exit 2 before any request', async () => {
  for (const argv of [[], ['--json'], ['--model'], ['--model', 'm1', '--verbose'], ['--model', 'm1', 'extra'], ['--model', 'bad model'], ['--model', 'm1', '--model', 'm1']]) {
    const { code, io, requests } = await run(argv);
    assert.equal(code, 2, JSON.stringify(argv));
    assert.equal(requests.length, 0, JSON.stringify(argv));
    assertNoSecret(io);
  }
  assert.throws(() => parseArgs(['--model', 'm1', '--dump-headers']), { name: 'UsageError' });
  assert.deepEqual(parseArgs(['--model', 'm1', '--json', '--strip-schema-keyword']),
    { help: false, models: ['m1'], json: true, stripSchemaKeyword: true });
});

test('an HTTP 400 exits 1 printing the status code only, never the response body or the key', async () => {
  const fake = fakeFetch({ status: 400, bodyText: 'BODYSENTINEL invalid request', json: () => ({ error: { message: 'BODYSENTINEL' } }) });
  const { code, io, requests } = await run(['--model', 'm1'], { fetch: fake });
  assert.equal(code, 1);
  assert.equal(requests.length, 1, 'stops at the first failed request');
  assert.match(io.err.join(''), /400/);
  assert.equal(io.all().includes('BODYSENTINEL'), false, 'no response body');
  assertNoSecret(io);
});

test('a network failure or a malformed response exits 1 with a fixed message and no secret', async () => {
  const thrown = new Error(`connect failed while sending ${SENTINEL_KEY}`);
  const network = await run(['--model', 'm1'], { fetch: fakeFetch({ throwError: thrown }) });
  assert.equal(network.code, 1);
  assertNoSecret(network.io);
  const malformed = await run(['--model', 'm1'], { fetch: fakeFetch({ json: () => ({ input_tokens: -3 }) }) });
  assert.equal(malformed.code, 1);
  assert.match(malformed.io.err.join(''), /input_tokens/);
  assertNoSecret(malformed.io);
});

test('every request is bounded by a timeout; a stalled request or body read exits 1 with a fixed message (IN-04)', async () => {
  assert.equal(REQUEST_TIMEOUT_MS, 30000);
  const { requests } = await run(['--model', 'm1']);
  for (const request of requests) assert.ok(request.init.signal instanceof AbortSignal, 'each request carries an abort signal');

  // Waits until the signal aborts. A real stalled request holds its socket
  // open; the keep-alive timer stands in for it, since AbortSignal.timeout's
  // own timer does not keep the event loop alive on Node 20.
  const untilAborted = (signal) => new Promise((resolve, reject) => {
    const socket = setTimeout(() => {}, 60000);
    signal.addEventListener('abort', () => {
      clearTimeout(socket);
      reject(signal.reason);
    }, { once: true });
  });
  // A request that never answers, and a response whose body never finishes.
  const stalled = (url, init) => untilAborted(init.signal);
  const stalledBody = async (url, init) => ({ ok: true, status: 200, json: () => untilAborted(init.signal) });
  for (const fetchImpl of [stalled, stalledBody]) {
    const io = capture();
    const code = await main(['--model', 'm1'], {
      env: ENV, fetch: fetchImpl, readBaseline: async () => BASELINE_TOOLS, readCurrent: async () => CURRENT_TOOLS,
      stdout: io.stdout, stderr: io.stderr, timeoutMs: 20,
    });
    assert.equal(code, 1);
    assert.match(io.err.join(''), /count_tokens request timed out/);
    assertNoSecret(io);
  }
});

test('default dependencies: the env, global fetch, the 8a058bdf fixture, and the build-freshness guard', async () => {
  const deps = defaultDeps();
  assert.equal(deps.env, process.env);
  assert.equal(deps.fetch, globalThis.fetch);
  const baseline = await deps.readBaseline();
  assert.equal(baseline.length, 72);
  assert.equal(typeof deps.readCurrent, 'function');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-count-tokens-'));
  try {
    const src = path.join(root, 'src');
    const build = path.join(root, 'build');
    fs.mkdirSync(path.join(src, 'tools'), { recursive: true });
    fs.mkdirSync(path.join(build, 'tools'), { recursive: true });
    fs.writeFileSync(path.join(src, 'tools', 'a.ts'), 'export {};\n');
    assert.throws(() => assertBuildFresh({ mcpSrc: src, mcpBuild: build }), /run npm --prefix mcp run build/);
    fs.writeFileSync(path.join(build, 'runtime.js'), '');
    fs.writeFileSync(path.join(build, 'tools', 'a.js'), '');
    const past = new Date(Date.now() - 60000);
    fs.utimesSync(path.join(build, 'tools', 'a.js'), past, past);
    assert.throws(() => assertBuildFresh({ mcpSrc: src, mcpBuild: build }), /tools\/a\.js is older than .*run npm --prefix mcp run build/);
    const future = new Date(Date.now() + 60000);
    fs.utimesSync(path.join(build, 'tools', 'a.js'), future, future);
    assert.doesNotThrow(() => assertBuildFresh({ mcpSrc: src, mcpBuild: build }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a tool-list load failure exits 2 with its message and no request', async () => {
  const io = capture();
  const fake = fakeFetch();
  const code = await main(['--model', 'm1'], {
    env: ENV,
    fetch: fake.fetchImpl,
    readBaseline: async () => BASELINE_TOOLS,
    readCurrent: async () => { throw new Error('mcp/build/runtime.js is missing -- run `npm --prefix mcp run build`'); },
    stdout: io.stdout,
    stderr: io.stderr,
  });
  assert.equal(code, 2);
  assert.equal(fake.requests.length, 0);
  assert.match(io.err.join(''), /npm --prefix mcp run build/);
  assertNoSecret(io);
});
