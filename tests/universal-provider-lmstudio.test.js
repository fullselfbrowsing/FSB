'use strict';

const {
  UniversalProvider,
  normalizeProviderBaseUrl,
  buildProviderModelsEndpoint,
  parseOpenAICompatibleModelList
} = require('../extension/ai/universal-provider.js');

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

function assertEqual(actual, expected, msg) {
  assert(actual === expected, msg + ' (expected: ' + expected + ', got: ' + actual + ')');
}

console.log('\n--- LM Studio endpoint normalization ---');
assertEqual(
  normalizeProviderBaseUrl('lmstudio', 'localhost:1234/v1'),
  'http://localhost:1234',
  'strips /v1 and prepends http://'
);
assertEqual(
  normalizeProviderBaseUrl('lmstudio', 'http://localhost:1234/v1/chat/completions/'),
  'http://localhost:1234',
  'strips chat completions suffix'
);
assertEqual(
  buildProviderModelsEndpoint('lmstudio', 'localhost:1234/v1/chat/completions'),
  'http://localhost:1234/v1/models',
  'builds LM Studio /v1/models discovery endpoint'
);

console.log('\n--- LM Studio model list parsing ---');
const parsedIds = parseOpenAICompatibleModelList({
  data: [
    { id: 'qwen/qwen3-30b-a3b' },
    { id: 'mistral-small-3.1' },
    { id: 'qwen/qwen3-30b-a3b' },
    {}
  ]
});
assertEqual(parsedIds.length, 2, 'deduplicates repeated model ids');
assertEqual(parsedIds[0], 'qwen/qwen3-30b-a3b', 'preserves first discovered model id');
assertEqual(parsedIds[1], 'mistral-small-3.1', 'preserves second discovered model id');

console.log('\n--- LM Studio UniversalProvider behavior ---');
const provider = new UniversalProvider({
  modelProvider: 'lmstudio',
  modelName: 'qwen/qwen3-30b-a3b',
  lmstudioBaseUrl: 'localhost:1234/v1'
});
assertEqual(
  provider.getEndpoint(),
  'http://localhost:1234/v1/chat/completions',
  'LM Studio provider uses normalized local chat completions endpoint'
);
const headers = provider.getHeaders();
assertEqual(headers['Content-Type'], 'application/json', 'LM Studio requests keep JSON content type');
assert(!('Authorization' in headers), 'LM Studio requests omit Authorization header');

const defaultProvider = new UniversalProvider({
  modelProvider: 'lmstudio',
  modelName: 'local-model'
});
assertEqual(
  defaultProvider.getEndpoint(),
  'http://localhost:1234/v1/chat/completions',
  'LM Studio provider defaults to localhost:1234 when no URL is configured'
);

console.log('\n--- LM Studio base-URL construction sites route through normalization ---');
// The bridge path (agent-loop) and the options test-connection path each append
// /v1 to the stored base URL. Both must strip a pasted /v1 (LM Studio's documented
// setting form) first -- the regression was a bare trailing-slash strip producing
// .../v1/v1/chat/completions.
const fs = require('fs');
const path = require('path');
const agentLoopSrc = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ai', 'agent-loop.js'), 'utf8');
assert(
  agentLoopSrc.indexOf("_al_normalizeProviderBaseUrl('lmstudio', _settings.lmstudioBaseUrl) + '/v1'") !== -1,
  'agent-loop bridge path builds the LM Studio baseUrl via normalizeProviderBaseUrl (+ /v1)'
);
assert(
  agentLoopSrc.indexOf("lmstudioBaseUrl || 'http://localhost:1234').replace(/\\/+$/, '') + '/v1'") === -1,
  'agent-loop no longer hand-rolls a trailing-slash-only strip before appending /v1'
);
const optionsSrc = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'options.js'), 'utf8');
const latticeIdx = optionsSrc.indexOf('lattice-test-connection');
const optionsTestConn = optionsSrc.slice(Math.max(0, latticeIdx - 4000), latticeIdx);
assert(
  optionsTestConn.indexOf("replace(/\\/v1\\/?$/, '')") !== -1,
  'options test-connection path strips a pasted /v1 suffix before re-appending /v1'
);

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
