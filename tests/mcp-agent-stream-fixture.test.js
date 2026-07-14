'use strict';

const assert = require('assert');
const path = require('path');
const { Readable } = require('stream');
const { pathToFileURL } = require('url');

const repoRoot = path.resolve(__dirname, '..');
const streamBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'claude-stream.js');

const sessionId = 'session_fixture_01';

function baselineLines() {
  return [
    {
      type: 'system',
      subtype: 'init',
      session_id: sessionId,
      tools: ['mcp__fsb__search_capabilities', 'mcp__fsb__invoke_capability'],
      mcp_servers: [{ name: 'fsb', status: 'connected' }],
      plugins: [],
      hooks: [],
      model: 'fixture-model',
    },
    {
      type: 'assistant',
      session_id: sessionId,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'fixture text' },
          { type: 'tool_use', id: 'tool_01', name: 'mcp__fsb__search_capabilities', input: { query: 'fixture' } },
        ],
      },
    },
    {
      type: 'stream_event',
      session_id: sessionId,
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'delta' } },
    },
    {
      type: 'user',
      session_id: sessionId,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool_01', content: 'fixture result' }],
      },
    },
    {
      type: 'system',
      subtype: 'api_retry',
      session_id: sessionId,
      attempt: 1,
      max_retries: 3,
      retry_delay_ms: 250,
      error: 'rate_limit',
    },
    {
      type: 'result',
      subtype: 'success',
      session_id: sessionId,
      is_error: false,
      num_turns: 2,
      usage: { input_tokens: 10, output_tokens: 20 },
    },
  ];
}

function encode(lines, trailingNewline = true, separator = '\n') {
  const value = lines.map((line) => JSON.stringify(line)).join(separator);
  return Buffer.from(`${value}${trailingNewline ? separator : ''}`, 'utf8');
}

async function collect(parseClaudeEvents, chunks) {
  const events = [];
  for await (const event of parseClaudeEvents(Readable.from(chunks))) events.push(event);
  return events;
}

async function expectDrift(parseClaudeEvents, chunks, reason) {
  await assert.rejects(
    () => collect(parseClaudeEvents, chunks),
    (error) => {
      assert.strictEqual(error.code, 'agent_protocol_drift');
      assert.strictEqual(error.reason, reason);
      assert.doesNotMatch(error.message, /TOP_SECRET_SENTINEL/);
      return true;
    },
  );
}

async function run() {
  const {
    CLAUDE_STREAM_LINE_LIMIT_BYTES,
    AgentProtocolDriftError,
    parseClaudeEvents,
  } = await import(pathToFileURL(streamBuildPath).href);

  assert.strictEqual(CLAUDE_STREAM_LINE_LIMIT_BYTES, 256 * 1024);
  assert.strictEqual(new AgentProtocolDriftError('invalid_json', 1).code, 'agent_protocol_drift');

  const baseline = encode(baselineLines());
  const events = await collect(parseClaudeEvents, [baseline]);
  assert.deepStrictEqual(
    events.map((event) => event.type),
    ['init', 'assistant', 'tool_use', 'assistant_delta', 'user', 'tool_result', 'retry', 'result'],
  );
  for (const event of events) {
    assert.deepStrictEqual(Object.keys(event).sort(), ['payload', 'sessionId', 'type']);
    assert.strictEqual(event.sessionId, sessionId);
    assert(Object.isFrozen(event));
    assert(Object.isFrozen(event.payload));
  }
  assert.strictEqual(events[0].payload.model, 'fixture-model', 'compatible fields survive in payload');

  const finalWithoutNewline = await collect(parseClaudeEvents, [encode(baselineLines(), false)]);
  assert.deepStrictEqual(finalWithoutNewline.map((event) => event.type), events.map((event) => event.type));

  const crlf = await collect(parseClaudeEvents, [encode(baselineLines(), true, '\r\n')]);
  assert.deepStrictEqual(crlf.map((event) => event.type), events.map((event) => event.type));

  const emojiLines = baselineLines();
  emojiLines[1].message.content[0].text = 'split emoji 🙂 boundary';
  const emojiBytes = encode(emojiLines);
  const emojiStart = emojiBytes.indexOf(Buffer.from('🙂'));
  const splitUtf8 = await collect(parseClaudeEvents, [
    emojiBytes.subarray(0, emojiStart + 1),
    emojiBytes.subarray(emojiStart + 1, emojiStart + 3),
    emojiBytes.subarray(emojiStart + 3),
  ]);
  assert.deepStrictEqual(splitUtf8.map((event) => event.type), events.map((event) => event.type));

  for (const split of [1, 7, 31, Math.floor(baseline.length / 2), baseline.length - 1]) {
    const splitEvents = await collect(parseClaudeEvents, [baseline.subarray(0, split), baseline.subarray(split)]);
    assert.deepStrictEqual(splitEvents.map((event) => event.type), events.map((event) => event.type));
  }

  const unknownTop = baselineLines();
  unknownTop[1] = { type: 'TOP_SECRET_SENTINEL' };
  await expectDrift(parseClaudeEvents, [encode(unknownTop)], 'unknown_event_type');

  const unknownSystem = baselineLines();
  unknownSystem[1] = { type: 'system', subtype: 'hook_started', detail: 'TOP_SECRET_SENTINEL' };
  await expectDrift(parseClaudeEvents, [encode(unknownSystem)], 'configuration_surface');

  const unsupportedSystem = baselineLines();
  unsupportedSystem[1] = { type: 'system', subtype: 'status', detail: 'TOP_SECRET_SENTINEL' };
  await expectDrift(parseClaudeEvents, [encode(unsupportedSystem)], 'unknown_system_subtype');

  const preInitPlugin = baselineLines();
  preInitPlugin[0] = { type: 'plugin_progress', detail: 'TOP_SECRET_SENTINEL' };
  await expectDrift(parseClaudeEvents, [encode(preInitPlugin)], 'configuration_surface');

  const badInit = baselineLines();
  badInit[0].tools = ['Bash'];
  await expectDrift(parseClaudeEvents, [encode(badInit)], 'configuration_surface');

  const emptyTools = baselineLines();
  emptyTools[0].tools = [];
  await expectDrift(parseClaudeEvents, [encode(emptyTools)], 'configuration_surface');

  const missingFsb = baselineLines();
  missingFsb[0].mcp_servers = [];
  await expectDrift(parseClaudeEvents, [encode(missingFsb)], 'configuration_surface');

  const extraMcp = baselineLines();
  extraMcp[0].mcp_servers.push({ name: 'other', status: 'connected' });
  await expectDrift(parseClaudeEvents, [encode(extraMcp)], 'configuration_surface');

  const mismatchedSession = baselineLines();
  mismatchedSession[2].session_id = 'other_session';
  await expectDrift(parseClaudeEvents, [encode(mismatchedSession)], 'session_mismatch');

  const beforeInit = baselineLines();
  [beforeInit[0], beforeInit[1]] = [beforeInit[1], beforeInit[0]];
  await expectDrift(parseClaudeEvents, [encode(beforeInit)], 'event_before_init');

  const duplicateResult = baselineLines();
  duplicateResult.push({ ...duplicateResult[duplicateResult.length - 1] });
  await expectDrift(parseClaudeEvents, [encode(duplicateResult)], 'duplicate_result');

  await expectDrift(parseClaudeEvents, [encode(baselineLines().slice(0, -1))], 'missing_result');
  const missingContent = baselineLines();
  delete missingContent[1].message.content;
  await expectDrift(parseClaudeEvents, [encode(missingContent)], 'invalid_shape');
  await expectDrift(parseClaudeEvents, [Buffer.from('{"type":\n', 'utf8')], 'invalid_json');
  await expectDrift(parseClaudeEvents, [Buffer.from([0xff, 0x0a])], 'invalid_utf8');

  const exactLimitLines = baselineLines();
  const exactLimitEvent = { ...exactLimitLines[1], padding: '' };
  const baseSize = Buffer.byteLength(JSON.stringify(exactLimitEvent));
  exactLimitEvent.padding = 'x'.repeat(CLAUDE_STREAM_LINE_LIMIT_BYTES - baseSize);
  assert.strictEqual(Buffer.byteLength(JSON.stringify(exactLimitEvent)), CLAUDE_STREAM_LINE_LIMIT_BYTES);
  exactLimitLines[1] = exactLimitEvent;
  const exactLimitEvents = await collect(parseClaudeEvents, [encode(exactLimitLines)]);
  assert.strictEqual(exactLimitEvents.at(-1).type, 'result');

  const oversized = Buffer.concat([
    Buffer.from('{"type":"assistant","padding":"'),
    Buffer.alloc(CLAUDE_STREAM_LINE_LIMIT_BYTES, 0x61),
    Buffer.from('"}\n'),
  ]);
  await expectDrift(parseClaudeEvents, [oversized], 'line_too_large');

  const largeLines = baselineLines();
  const padding = 'x'.repeat(2048);
  for (let index = 0; index < 110; index += 1) {
    largeLines.splice(largeLines.length - 1, 0, {
      type: 'assistant',
      session_id: sessionId,
      message: { content: [{ type: 'text', text: `${index}:${padding}` }] },
    });
  }
  const largeBytes = encode(largeLines);
  assert(largeBytes.length > 200 * 1024);
  const largeEvents = await collect(
    parseClaudeEvents,
    Array.from({ length: Math.ceil(largeBytes.length / 997) }, (_, index) => (
      largeBytes.subarray(index * 997, Math.min((index + 1) * 997, largeBytes.length))
    )),
  );
  assert.strictEqual(largeEvents.at(-1).type, 'result');
  assert(largeEvents.length > 110);

  console.log('mcp-agent-stream-fixture.test.js: PASS');
}

run().catch((error) => {
  console.error('mcp-agent-stream-fixture.test.js: FAIL');
  console.error(error);
  process.exit(1);
});
