'use strict';

const assert = require('assert');

let captured = null;
const diagnostics = [];
global.automationLogger = {
  debug(message, fields) { diagnostics.push({ message, fields }); },
  error(message, fields) { diagnostics.push({ message, fields }); }
};
global.executeViaBridge = async function (provider, config, requestBody, options) {
  captured = { provider, config, requestBody, options };
  return {
    id: 'chatcmpl-lmstudio-test',
    model: 'qwen/qwen3.6-27b',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: {
            name: 'report_progress',
            arguments: '{"message":"Ready"}'
          }
        }]
      },
      finish_reason: 'tool_calls'
    }]
  };
};

const { UniversalProvider } = require('../extension/ai/universal-provider.js');
const {
  callProviderWithTools,
  getPublicTools
} = require('../extension/ai/agent-loop.js');
const { parseToolCalls } = require('../extension/ai/tool-use-adapter.js');

(async function run() {
  const provider = new UniversalProvider({
    modelProvider: 'lmstudio',
    modelName: 'qwen/qwen3.6-27b',
    lmstudioBaseUrl: 'localhost:1234/v1'
  });
  const tools = getPublicTools();
  const response = await callProviderWithTools(
    provider,
    provider.model,
    '',
    [
      { role: 'system', content: 'x'.repeat(4645) },
      { role: 'user', content: 'Begin.' }
    ],
    tools,
    'lmstudio'
  );

  assert(captured, 'agent request reaches the provider bridge');
  assert.strictEqual(captured.provider, 'lmstudio', 'bridge provider is lmstudio');
  assert.strictEqual(captured.config.model, 'qwen/qwen3.6-27b', 'bridge config uses the exact discovered model');
  assert.strictEqual(captured.requestBody.model, 'qwen/qwen3.6-27b', 'OpenAI-compatible body uses the exact discovered model');
  assert.strictEqual(captured.config.baseUrl, 'http://localhost:1234/v1', 'bridge receives a normalized LM Studio base URL');
  assert.strictEqual(captured.requestBody.tools.length, tools.length, 'every public FSB tool definition is forwarded');
  assert.strictEqual(tools.length, 57, 'fixture covers the current full 57-tool agent payload');
  assert.strictEqual(captured.options.timeoutMs, 270000, 'the real-sized first turn receives a 270s timeout');

  const parsed = parseToolCalls(response, 'lmstudio');
  assert.strictEqual(parsed.length, 1, 'OpenAI-compatible LM Studio tool call is parseable');
  assert.strictEqual(parsed[0].name, 'report_progress', 'tool-call name is preserved');
  assert.deepStrictEqual(parsed[0].args, { message: 'Ready' }, 'tool-call arguments are parsed');

  // Snapshot before the second call so the diagnostics assertions below stay
  // pinned to the real-sized first turn (270s budget, 57 tools).
  const firstTurnDiagnostics = diagnostics.slice();

  // The fixture above carries an explicit user turn, which the agent loop never
  // produces on iteration 1 -- session.messages is system-only there, because the
  // task lives inside the system prompt. LM Studio renders Qwen 3 through a local
  // Jinja chat template that rejects that shape outright with
  // 400 "Error rendering prompt with jinja template: No user query found in
  // messages." Assert the production shape reaches the bridge with a seeded turn.
  captured = null;
  await callProviderWithTools(
    provider,
    provider.model,
    '',
    [{ role: 'system', content: 'TASK: play sunflower on youtube' }],
    tools,
    'lmstudio'
  );
  assert(captured, 'system-only agent request reaches the provider bridge');
  assert(
    captured.requestBody.messages.some(message => message && message.role === 'user'),
    'system-only first turn is seeded with a user message before it leaves the extension'
  );
  assert.strictEqual(
    captured.requestBody.messages[0].role,
    'system',
    'the seeded user turn is inserted after the system prompt, not before it'
  );

  const requestDiagnostics = firstTurnDiagnostics.filter(entry => /^Provider bridge request/.test(entry.message));
  assert.deepStrictEqual(
    requestDiagnostics.map(entry => entry.message),
    ['Provider bridge request dispatch', 'Provider bridge request completed'],
    'provider request emits bounded start and completion diagnostics'
  );
  for (const entry of requestDiagnostics) {
    assert.deepStrictEqual(
      Object.keys(entry.fields).sort(),
      ['elapsedMs', 'model', 'phase', 'provider', 'timeoutMs', 'toolCount'].sort(),
      'provider diagnostics contain only the safe operational fields'
    );
    assert.strictEqual(entry.fields.model, 'qwen/qwen3.6-27b');
    assert.strictEqual(entry.fields.toolCount, 57);
    assert.strictEqual(entry.fields.timeoutMs, 270000);
  }

  console.log('PASS lmstudio-agent-request.test.js');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
