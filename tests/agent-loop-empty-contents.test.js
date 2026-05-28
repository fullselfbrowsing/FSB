'use strict';

// Regression test for issue #29: Gemini "contents is not specified" 400 error.
// On the first agent-loop iteration session.messages contains only the
// system message (the user task is embedded in the system prompt). When that
// is filtered out for Gemini's `contents` array (or Anthropic's `messages`),
// the API rejects the request. callProviderWithTools must seed a starter
// user turn so the request body is valid.
//
// Phase 7 Plan 07-01 (FINT-09): the feature flag is removed and
// callProviderWithTools now ALWAYS routes through executeViaBridge ->
// chrome.runtime.sendMessage -> offscreen Lattice host. The test therefore
// mocks chrome.runtime.sendMessage, captures the `requestBody` field of the
// lattice-provider-execute envelope, and asserts on the captured body
// instead of a legacy provider stub.

let lastCapturedRequestBody = null;

globalThis.chrome = {
  runtime: {
    id: 'fsb-test',
    // chrome.runtime.sendMessage returns a Promise in MV3; the bridge
    // awaits it. We capture the requestBody and return a success envelope
    // shape that satisfies executeViaBridge's unwrap (ok:true + response.rawResponse).
    sendMessage: async function (envelope) {
      if (envelope && envelope.type === 'lattice-provider-execute') {
        lastCapturedRequestBody = envelope.requestBody;
        return { ok: true, response: { rawResponse: { __stub: true } } };
      }
      // lattice-provider-abort or other envelope types -> no-op.
      return undefined;
    }
  }
};

// The bridge IIFE installs executeViaBridge onto globalScope (globalThis in Node)
// at module load time. Require it BEFORE agent-loop.js so the symbol is resolvable
// from agent-loop.js's callProviderWithTools tail.
require('../extension/ai/lattice-provider-bridge.js');

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

// providerInstance metadata stub: callProviderWithTools reads .config.keyField,
// .settings[keyField], .model, and (for custom/lmstudio only) settings.customEndpoint
// / settings.lmstudioBaseUrl. universal-provider.js's UniversalProvider class is the
// production source of these fields; here we stub the minimal shape.
function makeProviderInstance(keyField) {
  return {
    config: { keyField: keyField || 'apiKey' },
    settings: { apiKey: 'sk-test', geminiApiKey: 'sk-test', anthropicApiKey: 'sk-test' },
    model: 'fake-model',
  };
}

async function run() {
  const systemMessages = [{ role: 'system', content: 'TASK: navigate to my profile' }];
  const tools = [{ name: 'click', description: 'click', inputSchema: { type: 'object', properties: {} } }];

  console.log('\n--- Gemini: empty conversation seeds starter user turn (issue #29) ---');
  lastCapturedRequestBody = null;
  await callProviderWithTools(makeProviderInstance('geminiApiKey'), 'gemini-flash-latest', null, systemMessages, tools, 'gemini');
  assert(lastCapturedRequestBody && Array.isArray(lastCapturedRequestBody.contents), 'gemini request has contents array (Phase 7 bridge envelope)');
  assert(lastCapturedRequestBody && lastCapturedRequestBody.contents.length > 0, 'gemini contents is non-empty (would fail with "contents is not specified")');

  console.log('\n--- Gemini: ongoing conversation passes through unchanged ---');
  const realConversation = [
    { role: 'system', content: 'TASK: x' },
    { role: 'user', content: 'real user message' }
  ];
  lastCapturedRequestBody = null;
  await callProviderWithTools(makeProviderInstance('geminiApiKey'), 'gemini-flash-latest', null, realConversation, tools, 'gemini');
  assert(lastCapturedRequestBody && Array.isArray(lastCapturedRequestBody.contents), 'gemini ongoing-conversation request has contents array');
  assert(lastCapturedRequestBody && lastCapturedRequestBody.contents.length >= 1, 'gemini ongoing-conversation contents is non-empty');

  console.log('\n--- Anthropic: empty conversation seeds starter user turn ---');
  lastCapturedRequestBody = null;
  await callProviderWithTools(makeProviderInstance('anthropicApiKey'), 'claude-sonnet-4-5', null, systemMessages, tools, 'anthropic');
  assert(lastCapturedRequestBody && Array.isArray(lastCapturedRequestBody.messages), 'anthropic request has messages array (Phase 7 bridge envelope)');
  assert(lastCapturedRequestBody && lastCapturedRequestBody.messages.length > 0, 'anthropic messages is non-empty');

  console.log('\n--- xAI: empty conversation seeds starter user turn ---');
  lastCapturedRequestBody = null;
  await callProviderWithTools(makeProviderInstance('apiKey'), 'grok-4-1-fast', null, systemMessages, tools, 'xai');
  assert(lastCapturedRequestBody && Array.isArray(lastCapturedRequestBody.messages), 'xai request has messages array (Phase 7 bridge envelope)');
  assert(lastCapturedRequestBody && lastCapturedRequestBody.messages.length > 0, 'xai messages is non-empty');

  console.log('\n--- Summary ---');
  console.log('  Passed:', passed);
  console.log('  Failed:', failed);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(function (err) { console.error('FATAL:', err); process.exit(1); });
