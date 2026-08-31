'use strict';

const assert = require('assert');

const {
  UniversalProvider,
  normalizeProviderChatRequest
} = require('../extension/ai/universal-provider.js');

function assertAbsent(object, key, message) {
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(object, key),
    false,
    message
  );
}

function makeRequest(overrides = {}) {
  return {
    model: 'gpt-5-nano',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 4096,
    temperature: 0,
    top_p: 0.9,
    logprobs: true,
    top_logprobs: 2,
    ...overrides
  };
}

function assertReasoningRequest(body, expectedLimit, label) {
  assert.strictEqual(
    body.max_completion_tokens,
    expectedLimit,
    `${label} uses max_completion_tokens`
  );
  for (const key of ['max_tokens', 'temperature', 'top_p', 'logprobs', 'top_logprobs']) {
    assertAbsent(body, key, `${label} omits ${key}`);
  }
}

let bridgeCalls = [];
global.executeViaBridge = async function(provider, config, requestBody, options) {
  bridgeCalls.push({ provider, config, requestBody, options });
  return {
    id: 'chatcmpl-openai-request-test',
    model: requestBody.model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'Done' },
      finish_reason: 'stop'
    }]
  };
};

const { callProviderWithTools } = require('../extension/ai/agent-loop.js');

(async function run() {
  const nanoRequest = makeRequest();
  const normalizedNano = normalizeProviderChatRequest('openai', 'gpt-5-nano', nanoRequest);
  assertReasoningRequest(normalizedNano, 4096, 'gpt-5-nano');
  assert.notStrictEqual(normalizedNano, nanoRequest, 'OpenAI normalization returns a new object');
  assert.strictEqual(nanoRequest.max_tokens, 4096, 'normalization does not mutate its input');
  assert.strictEqual(nanoRequest.temperature, 0, 'input sampling settings remain untouched');

  const snapshot = normalizeProviderChatRequest(
    'openai',
    'gpt-5-nano-2025-08-07',
    makeRequest({ model: 'gpt-5-nano-2025-08-07' })
  );
  assertReasoningRequest(snapshot, 4096, 'dated gpt-5-nano snapshot');

  const oSeries = normalizeProviderChatRequest(
    'openai',
    'o3-mini',
    makeRequest({ model: 'o3-mini' })
  );
  assertReasoningRequest(oSeries, 4096, 'o-series reasoning model');

  const gpt4 = normalizeProviderChatRequest(
    'openai',
    'gpt-4o',
    makeRequest({ model: 'gpt-4o' })
  );
  assert.strictEqual(gpt4.max_completion_tokens, 4096, 'GPT-4-class models use the modern token field');
  assertAbsent(gpt4, 'max_tokens', 'GPT-4-class models omit max_tokens');
  assert.strictEqual(gpt4.temperature, 0, 'GPT-4-class models retain temperature');
  assert.strictEqual(gpt4.top_p, 0.9, 'GPT-4-class models retain top_p');
  assert.strictEqual(gpt4.logprobs, true, 'GPT-4-class models retain logprobs');
  assert.strictEqual(gpt4.top_logprobs, 2, 'GPT-4-class models retain top_logprobs');

  const explicitModernLimit = normalizeProviderChatRequest(
    'openai',
    'gpt-5-nano',
    makeRequest({ max_tokens: 4096, max_completion_tokens: 777 })
  );
  assertReasoningRequest(explicitModernLimit, 777, 'explicit modern token limit');

  for (const providerKey of ['xai', 'openrouter', 'custom', 'lmstudio']) {
    const compatibleRequest = makeRequest({ model: `${providerKey}-model` });
    const unchanged = normalizeProviderChatRequest(
      providerKey,
      compatibleRequest.model,
      compatibleRequest
    );
    assert.strictEqual(unchanged, compatibleRequest, `${providerKey} request identity is unchanged`);
    assert.strictEqual(unchanged.max_tokens, 4096, `${providerKey} retains max_tokens`);
    assert.strictEqual(unchanged.temperature, 0, `${providerKey} retains sampling settings`);
    assertAbsent(unchanged, 'max_completion_tokens', `${providerKey} does not gain max_completion_tokens`);
  }

  const transportProvider = new UniversalProvider({
    modelProvider: 'openai',
    modelName: 'gpt-5-nano',
    openaiApiKey: 'test-key'
  });
  let wireBody = null;
  transportProvider.fetchWithTimeout = async function(_endpoint, options) {
    wireBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          id: 'chatcmpl-send-request-test',
          choices: [{ message: { role: 'assistant', content: 'Done' } }]
        };
      }
    };
  };
  await transportProvider.sendRequest(makeRequest({ max_tokens: 1234 }));
  assertReasoningRequest(wireBody, 1234, 'UniversalProvider wire request');

  const tools = [{
    name: 'report_progress',
    description: 'Report progress',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message']
    }
  }];
  const messages = [
    { role: 'system', content: 'Use tools.' },
    { role: 'user', content: 'Begin.' }
  ];

  const openaiAgentProvider = new UniversalProvider({
    modelProvider: 'openai',
    modelName: 'gpt-5-nano',
    openaiApiKey: 'test-key'
  });
  await callProviderWithTools(
    openaiAgentProvider,
    openaiAgentProvider.model,
    'test-key',
    messages,
    tools,
    'openai'
  );
  const openaiBridgeCall = bridgeCalls.at(-1);
  assert.strictEqual(openaiBridgeCall.provider, 'openai', 'agent request uses the OpenAI bridge');
  assertReasoningRequest(openaiBridgeCall.requestBody, 4096, 'agent-loop OpenAI bridge request');
  assert.deepStrictEqual(openaiBridgeCall.requestBody.messages, messages, 'agent-loop messages are retained');
  assert.strictEqual(openaiBridgeCall.requestBody.tools.length, 1, 'agent-loop tools are retained');

  const xaiAgentProvider = new UniversalProvider({
    modelProvider: 'xai',
    modelName: 'grok-4-1-fast',
    apiKey: 'test-key'
  });
  await callProviderWithTools(
    xaiAgentProvider,
    xaiAgentProvider.model,
    'test-key',
    messages,
    tools,
    'xai'
  );
  const xaiBridgeCall = bridgeCalls.at(-1);
  assert.strictEqual(xaiBridgeCall.provider, 'xai', 'agent request uses the xAI bridge');
  assert.strictEqual(xaiBridgeCall.requestBody.max_tokens, 4096, 'xAI agent request retains max_tokens');
  assert.strictEqual(xaiBridgeCall.requestBody.temperature, 0, 'xAI agent request retains temperature');
  assertAbsent(
    xaiBridgeCall.requestBody,
    'max_completion_tokens',
    'xAI agent request does not gain max_completion_tokens'
  );

  console.log('PASS openai-agent-request.test.js');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
