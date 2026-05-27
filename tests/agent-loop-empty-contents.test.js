'use strict';

// Regression test for issue #29: Gemini "contents is not specified" 400 error.
// On the first agent-loop iteration session.messages contains only the
// system message (the user task is embedded in the system prompt). When that
// is filtered out for Gemini's `contents` array (or Anthropic's `messages`),
// the API rejects the request. callProviderWithTools must seed a starter
// user turn so the request body is valid.
//
// Phase 6 Plan 06-03 (FINT-08b): callProviderWithTools now has a feature-flag-
// gated bridge call at its tail. This test exercises the switch + requestBody
// construction (byte-frozen by Plan 06-03) and asserts on the makeProviderStub's
// lastRequest field, which is only populated when the legacy path (flag-false)
// is taken. Set FSB_LATTICE_PROVIDER_BRIDGE_ENABLED = false BEFORE requiring
// agent-loop.js so the legacy providerInstance.sendRequest call path runs.
globalThis.FSB_LATTICE_PROVIDER_BRIDGE_ENABLED = false;

const { callProviderWithTools } = require('../extension/ai/agent-loop.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function makeProviderStub() {
  const stub = { lastRequest: null };
  stub.sendRequest = async (body) => {
    stub.lastRequest = body;
    return { __stub: true };
  };
  return stub;
}

async function run() {
  const systemMessages = [{ role: 'system', content: 'TASK: navigate to my profile' }];
  const tools = [{ name: 'click', description: 'click', inputSchema: { type: 'object', properties: {} } }];

  console.log('\n--- Gemini: empty conversation seeds starter user turn (issue #29) ---');
  const gemini = makeProviderStub();
  await callProviderWithTools(gemini, 'gemini-flash-latest', null, systemMessages, tools, 'gemini');
  assert(Array.isArray(gemini.lastRequest.contents), 'gemini request has contents array');
  assert(gemini.lastRequest.contents.length > 0, 'gemini contents is non-empty (would fail with "contents is not specified")');
  assert(gemini.lastRequest.contents[0].role === 'user', 'seeded turn has role=user');
  assert(
    Array.isArray(gemini.lastRequest.contents[0].parts) &&
      typeof gemini.lastRequest.contents[0].parts[0]?.text === 'string' &&
      gemini.lastRequest.contents[0].parts[0].text.length > 0,
    'seeded turn has non-empty text part'
  );
  assert(
    gemini.lastRequest.systemInstruction &&
      gemini.lastRequest.systemInstruction.parts[0].text.includes('navigate to my profile'),
    'system prompt is preserved via systemInstruction'
  );

  console.log('\n--- Gemini: existing user turn is not overwritten by the seed ---');
  const gemini2 = makeProviderStub();
  const realConversation = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hello there' }
  ];
  await callProviderWithTools(gemini2, 'gemini-flash-latest', null, realConversation, tools, 'gemini');
  assert(gemini2.lastRequest.contents.length === 1, 'real user turn produces single content entry');
  assert(
    gemini2.lastRequest.contents[0].parts[0].text === 'hello there',
    'real user turn text is preserved (not replaced with seed)'
  );

  console.log('\n--- Anthropic: empty conversation seeds starter user turn ---');
  const anthropic = makeProviderStub();
  await callProviderWithTools(anthropic, 'claude-sonnet-4-5', null, systemMessages, tools, 'anthropic');
  assert(Array.isArray(anthropic.lastRequest.messages), 'anthropic request has messages array');
  assert(anthropic.lastRequest.messages.length > 0, 'anthropic messages is non-empty');
  assert(anthropic.lastRequest.messages[0].role === 'user', 'seeded anthropic turn has role=user');
  assert(typeof anthropic.lastRequest.messages[0].content === 'string', 'seeded anthropic turn has string content');
  assert(
    Array.isArray(anthropic.lastRequest.system) &&
      anthropic.lastRequest.system[0].text.includes('navigate to my profile'),
    'anthropic system prompt is preserved'
  );

  console.log('\n--- OpenAI/xAI default path: system-only messages still passes through unchanged ---');
  const xai = makeProviderStub();
  await callProviderWithTools(xai, 'grok-4-1-fast', null, systemMessages, tools, 'xai');
  assert(Array.isArray(xai.lastRequest.messages), 'xai request has messages array');
  assert(xai.lastRequest.messages.length === 1, 'xai keeps system-only messages (no seed needed)');
  assert(xai.lastRequest.messages[0].role === 'system', 'xai system message is preserved verbatim');

  console.log('\n--- Summary ---');
  console.log('  Passed:', passed);
  console.log('  Failed:', failed);

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Test run threw:', err);
  process.exit(1);
});
