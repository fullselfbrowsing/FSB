'use strict';

/**
 * Unit tests for extension/ai/model-discovery.js
 *
 * GUARD-02: All fetches are mocked; no real provider APIs are called.
 */

const path = require('path');
const {
  discoverModels,
  PROVIDER_DISCOVERY_CONFIG,
  FALLBACK_MODELS,
  clearDiscoveryCache,
  hashApiKey
} = require('../extension/ai/model-discovery.js');
const { RESPONSE_FIXTURES, ERROR_FIXTURES } = require('./fixtures/model-discovery-responses.js');
const { config: realConfig } = require('../extension/config/config.js');

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    failures.push(msg);
    console.error('  FAIL:', msg);
  }
}
function assertEqual(actual, expected, msg) {
  assert(actual === expected, msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')');
}
function assertDeepEqual(actual, expected, msg) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    msg + '\n    expected: ' + JSON.stringify(expected) + '\n    got:      ' + JSON.stringify(actual)
  );
}

// --- fetch mock plumbing -----------------------------------------------------

const realFetch = globalThis.fetch;
let fetchCalls = [];
let fetchImpl = null;

function setFetch(fn) {
  fetchCalls = [];
  fetchImpl = fn;
  globalThis.fetch = (...args) => {
    fetchCalls.push(args);
    return fn(...args);
  };
}
function restoreFetch() {
  globalThis.fetch = realFetch;
  fetchImpl = null;
  fetchCalls = [];
}

function jsonResponse(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
}

// --- 1. Per-provider happy paths --------------------------------------------

async function testXai() {
  console.log('\n--- xAI discovery ---');
  clearDiscoveryCache();
  setFetch(() => jsonResponse(200, RESPONSE_FIXTURES.xai));
  const result = await discoverModels('xai', 'sk-test-xai');
  assertEqual(result.ok, true, 'xai ok=true');
  assertEqual(result.source, 'live', 'xai source=live');
  assertEqual(result.provider, 'xai', 'xai provider field set');
  const ids = (result.models || []).map(m => m.id);
  assert(ids.includes('grok-4-1-fast') && ids.includes('grok-4') && ids.includes('grok-code-fast-1'), 'xai keeps grok-* text models');
  assert(!ids.includes('grok-2-image-1212'), 'xai drops image model');
  assert(!ids.includes('unrelated-test-model'), 'xai drops non-grok prefix');
  restoreFetch();
}

async function testOpenAI() {
  console.log('\n--- OpenAI discovery ---');
  clearDiscoveryCache();
  setFetch(() => jsonResponse(200, RESPONSE_FIXTURES.openai));
  const result = await discoverModels('openai', 'sk-test-openai');
  assertEqual(result.ok, true, 'openai ok=true');
  const ids = (result.models || []).map(m => m.id);
  assert(ids.includes('gpt-4o') && ids.includes('gpt-4o-mini') && ids.includes('o1-preview') && ids.includes('chatgpt-4o-latest'), 'openai keeps text models');
  assert(!ids.includes('text-embedding-3-large'), 'openai drops embedding');
  assert(!ids.includes('whisper-1'), 'openai drops whisper');
  assert(!ids.includes('dall-e-3'), 'openai drops dall-e');
  assert(!ids.includes('tts-1'), 'openai drops tts');
  assert(!ids.includes('gpt-4o-audio-preview'), 'openai drops audio variant');
  assert(!ids.includes('gpt-4o-realtime-preview'), 'openai drops realtime variant');
  restoreFetch();
}

async function testAnthropic() {
  console.log('\n--- Anthropic discovery ---');
  clearDiscoveryCache();
  setFetch(() => jsonResponse(200, RESPONSE_FIXTURES.anthropic));
  const result = await discoverModels('anthropic', 'sk-ant-test');
  assertEqual(result.ok, true, 'anthropic ok=true');
  const ids = (result.models || []).map(m => m.id);
  assert(ids.includes('claude-sonnet-4-5-20250929'), 'anthropic keeps sonnet 4.5');
  assert(ids.includes('claude-opus-4-1-20250805'), 'anthropic keeps opus 4.1');
  assert(ids.includes('claude-haiku-3-5-20241022'), 'anthropic keeps haiku 3.5');
  assert(!ids.includes('legacy-experimental-model'), 'anthropic drops non-claude id');

  // Verify createdAt sort: newest first
  assertEqual(result.models[0].id, 'claude-sonnet-4-5-20250929', 'anthropic newest first (sonnet 4.5)');
  const lastClaude = result.models[result.models.length - 1].id;
  assertEqual(lastClaude, 'claude-haiku-3-5-20241022', 'anthropic oldest last (haiku 3.5)');

  // displayName comes from display_name field
  const sonnet = result.models.find(m => m.id === 'claude-sonnet-4-5-20250929');
  assertEqual(sonnet.displayName, 'Claude Sonnet 4.5', 'anthropic uses provider display_name');
  restoreFetch();
}

async function testGemini() {
  console.log('\n--- Gemini discovery ---');
  clearDiscoveryCache();
  setFetch(() => jsonResponse(200, RESPONSE_FIXTURES.gemini));
  const result = await discoverModels('gemini', 'AIza-test-key');
  assertEqual(result.ok, true, 'gemini ok=true');
  const ids = (result.models || []).map(m => m.id);
  assert(ids.includes('gemini-2.5-flash'), 'gemini keeps 2.5 flash');
  assert(ids.includes('gemini-2.0-flash-exp'), 'gemini keeps 2.0 flash exp');
  assert(!ids.includes('text-embedding-004'), 'gemini drops embedding');
  assert(!ids.includes('imagen-3.0-generate'), 'gemini drops imagen');
  // models/ prefix stripped
  assert(!ids.some(id => id.startsWith('models/')), 'gemini strips models/ prefix from id');
  // displayName from provider
  const flash = result.models.find(m => m.id === 'gemini-2.5-flash');
  assertEqual(flash.displayName, 'Gemini 2.5 Flash', 'gemini uses provider displayName');
  // contextWindow when available
  assertEqual(flash.contextWindow, 1048576, 'gemini exposes contextWindow from inputTokenLimit');
  // gemini puts api key in URL — confirm no Authorization header
  const reqInit = fetchCalls[0][1] || {};
  const headers = reqInit.headers || {};
  assert(!('Authorization' in headers) && !('authorization' in headers), 'gemini does not send Authorization header');
  // URL should embed key
  const urlArg = fetchCalls[0][0];
  assert(typeof urlArg === 'string' && urlArg.includes('key=AIza-test-key'), 'gemini puts key in URL');
  restoreFetch();
}

async function testOpenRouter() {
  console.log('\n--- OpenRouter discovery ---');
  clearDiscoveryCache();
  setFetch(() => jsonResponse(200, RESPONSE_FIXTURES.openrouter));
  const result = await discoverModels('openrouter', 'sk-or-test');
  assertEqual(result.ok, true, 'openrouter ok=true');
  const ids = (result.models || []).map(m => m.id);
  assert(ids.includes('openai/gpt-4o'), 'openrouter keeps gpt-4o');
  assert(ids.includes('anthropic/claude-sonnet-4'), 'openrouter keeps claude sonnet');
  assert(ids.includes('x-ai/grok-4-1-fast'), 'openrouter keeps grok');
  assert(!ids.includes('openai/text-embedding-3-large'), 'openrouter drops embedding');
  assert(!ids.includes('some/zero-context-model'), 'openrouter drops zero-context model');
  const gpt = result.models.find(m => m.id === 'openai/gpt-4o');
  assertEqual(gpt.contextWindow, 128000, 'openrouter exposes context_length as contextWindow');
  restoreFetch();
}

async function testLmStudio() {
  console.log('\n--- LM Studio discovery ---');
  clearDiscoveryCache();
  let calls = 0;
  setFetch(() => {
    calls++;
    return jsonResponse(200, {
      object: 'list',
      data: [
        { id: 'qwen/qwen3.6-27b', object: 'model' },
        { id: 'text-embedding-nomic-embed-text-v1.5', object: 'model' },
        { id: 'qwen/qwen3.6-27b', object: 'model' },
        { id: 'whisper-local', object: 'model' }
      ]
    });
  });

  const first = await discoverModels('lmstudio', '', {
    baseUrl: 'localhost:1234/v1/chat/completions'
  });
  const second = await discoverModels('lmstudio', '', {
    baseUrl: 'localhost:1234/v1/chat/completions'
  });

  assertEqual(first.ok, true, 'lmstudio discovers without an API key');
  assertEqual(first.source, 'live', 'lmstudio source is live');
  assertDeepEqual(first.models.map(model => model.id), ['qwen/qwen3.6-27b'], 'lmstudio deduplicates and filters non-chat models');
  assertEqual(fetchCalls[0][0], 'http://localhost:1234/v1/models', 'lmstudio normalizes the models endpoint');
  assert(!('Authorization' in (fetchCalls[0][1].headers || {})), 'lmstudio discovery sends no authorization header');
  assertEqual(second.source, 'live', 'lmstudio does not return a persistent-cache result');
  assertEqual(calls, 2, 'lmstudio re-fetches its live loaded-model list');
  restoreFetch();
}

// --- 2. Failure modes --------------------------------------------------------

async function testAuthFail() {
  console.log('\n--- Failure: 401 auth-failed ---');
  clearDiscoveryCache();
  setFetch(() => jsonResponse(401, ERROR_FIXTURES['401'].body));
  const result = await discoverModels('openai', 'bad-key');
  assertEqual(result.ok, false, '401 ok=false');
  assertEqual(result.reason, 'auth-failed', '401 reason=auth-failed');
  assertEqual(result.status, 401, '401 status preserved');
  restoreFetch();

  console.log('\n--- Failure: 403 auth-failed ---');
  clearDiscoveryCache();
  setFetch(() => jsonResponse(403, ERROR_FIXTURES['403'].body));
  const r2 = await discoverModels('openai', 'bad-key');
  assertEqual(r2.ok, false, '403 ok=false');
  assertEqual(r2.reason, 'auth-failed', '403 reason=auth-failed');
  restoreFetch();
}

async function testNetworkFail500() {
  console.log('\n--- Failure: 500 network-failed ---');
  clearDiscoveryCache();
  setFetch(() => jsonResponse(500, ERROR_FIXTURES['500'].body));
  const result = await discoverModels('openai', 'sk-test');
  assertEqual(result.ok, false, '500 ok=false');
  assertEqual(result.reason, 'network-failed', '500 reason=network-failed');
  assertEqual(result.status, 500, '500 status preserved');
  restoreFetch();
}

async function testNetworkThrown() {
  console.log('\n--- Failure: thrown TypeError -> network-failed ---');
  clearDiscoveryCache();
  const thrower = ERROR_FIXTURES.network();
  setFetch(thrower);
  const result = await discoverModels('openai', 'sk-test');
  assertEqual(result.ok, false, 'network-thrown ok=false');
  assertEqual(result.reason, 'network-failed', 'network-thrown reason=network-failed');
  restoreFetch();
}

async function testTimeout() {
  console.log('\n--- Failure: 5s timeout ---');
  clearDiscoveryCache();
  // fetch that respects AbortController and rejects with AbortError when aborted
  setFetch((url, init) => {
    return new Promise((resolve, reject) => {
      const signal = init && init.signal;
      if (signal) {
        if (signal.aborted) {
          const err = new Error('aborted');
          err.name = 'AbortError';
          return reject(err);
        }
        signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
      // never resolve otherwise
    });
  });
  // Override timeout via env-style hook: discoverModels uses a 5s default.
  // For tests we patch the discovery module's _setTimeoutFn if exposed; otherwise,
  // we call discoverModels with a tiny timeout via a 4th opt arg the impl supports.
  const result = await discoverModels('openai', 'sk-test', { timeoutMs: 25 });
  assertEqual(result.ok, false, 'timeout ok=false');
  assertEqual(result.reason, 'timeout', 'timeout reason=timeout');
  restoreFetch();
}

async function testEmptyResponse() {
  console.log('\n--- Failure: empty filtered list ---');
  clearDiscoveryCache();
  // OpenAI fixture but only with non-allowed entries
  setFetch(() => jsonResponse(200, { object: 'list', data: [
    { id: 'text-embedding-3-large', object: 'model', created: 1, owned_by: 'openai' },
    { id: 'whisper-1', object: 'model', created: 1, owned_by: 'openai' }
  ] }));
  const result = await discoverModels('openai', 'sk-test');
  assertEqual(result.ok, false, 'empty ok=false');
  assertEqual(result.reason, 'empty-response', 'empty reason=empty-response');
  restoreFetch();
}

async function testMissingApiKey() {
  console.log('\n--- Failure: missing api key ---');
  clearDiscoveryCache();
  let called = false;
  setFetch(() => { called = true; return jsonResponse(200, RESPONSE_FIXTURES.openai); });
  const result = await discoverModels('openai', '');
  assertEqual(result.ok, false, 'missing-api-key ok=false');
  assertEqual(result.reason, 'missing-api-key', 'missing-api-key reason');
  assertEqual(called, false, 'no fetch performed when api key missing');
  restoreFetch();
}

async function testUnsupportedProvider() {
  console.log('\n--- Failure: unsupported provider ---');
  clearDiscoveryCache();
  let called = false;
  setFetch(() => { called = true; return jsonResponse(200, {}); });
  const result = await discoverModels('not-a-provider', 'key');
  assertEqual(result.ok, false, 'unsupported ok=false');
  assertEqual(result.reason, 'unsupported-provider', 'unsupported reason');
  assertEqual(called, false, 'no fetch for unsupported provider');
  restoreFetch();
}

// --- 3. Cache behavior -------------------------------------------------------

async function testCacheHit() {
  console.log('\n--- Cache: second call within TTL is cached ---');
  clearDiscoveryCache();
  let calls = 0;
  setFetch(() => { calls++; return jsonResponse(200, RESPONSE_FIXTURES.xai); });
  const r1 = await discoverModels('xai', 'sk-test-xai');
  const r2 = await discoverModels('xai', 'sk-test-xai');
  assertEqual(r1.source, 'live', 'first call source=live');
  assertEqual(r2.source, 'cache', 'second call source=cache');
  assertEqual(calls, 1, 'fetch called only once');
  restoreFetch();
}

async function testBypassCache() {
  console.log('\n--- Cache: bypassCache forces a live response and refreshes metadata ---');
  clearDiscoveryCache();
  let calls = 0;
  setFetch(() => { calls++; return jsonResponse(200, RESPONSE_FIXTURES.xai); });
  const first = await discoverModels('xai', 'sk-test-xai');
  const bypassed = await discoverModels('xai', 'sk-test-xai', { bypassCache: true });
  const cachedAfterBypass = await discoverModels('xai', 'sk-test-xai');
  assertEqual(first.source, 'live', 'initial response is live');
  assertEqual(bypassed.source, 'live', 'bypassCache skips the existing cache entry');
  assertEqual(cachedAfterBypass.source, 'cache', 'successful bypass response is still recorded for runtime validation');
  assertEqual(calls, 2, 'bypassCache performs exactly one additional fetch');
  restoreFetch();
}

async function testCacheKeyByApiKey() {
  console.log('\n--- Cache: distinct api keys -> distinct entries ---');
  clearDiscoveryCache();
  let calls = 0;
  setFetch(() => { calls++; return jsonResponse(200, RESPONSE_FIXTURES.xai); });
  await discoverModels('xai', 'key-a');
  await discoverModels('xai', 'key-b');
  assertEqual(calls, 2, 'different api keys -> separate fetches');

  // hashApiKey should be deterministic and non-plaintext
  const h1 = hashApiKey('key-a');
  const h2 = hashApiKey('key-a');
  const h3 = hashApiKey('key-b');
  assertEqual(h1, h2, 'hashApiKey deterministic');
  assert(h1 !== h3, 'hashApiKey distinguishes inputs');
  assert(!String(h1).includes('key-a'), 'hashApiKey does not embed plaintext');
  restoreFetch();
}

async function testClearCache() {
  console.log('\n--- Cache: clearDiscoveryCache(provider?) ---');
  clearDiscoveryCache();
  let calls = 0;
  setFetch(() => { calls++; return jsonResponse(200, RESPONSE_FIXTURES.xai); });
  await discoverModels('xai', 'k');
  await discoverModels('xai', 'k');
  assertEqual(calls, 1, 'cache prevents duplicate fetch');
  clearDiscoveryCache('xai');
  await discoverModels('xai', 'k');
  assertEqual(calls, 2, 'after clearDiscoveryCache(xai) the fetch fires again');

  // global clear also works
  clearDiscoveryCache();
  await discoverModels('xai', 'k');
  assertEqual(calls, 3, 'after clearDiscoveryCache() the fetch fires again');
  restoreFetch();
}

// --- 4. Fallback constants ---------------------------------------------------

function testFallbackModelsShape() {
  console.log('\n--- FALLBACK_MODELS shape + parity with config ---');
  assert(FALLBACK_MODELS && typeof FALLBACK_MODELS === 'object', 'FALLBACK_MODELS exported');
  for (const k of ['xai','gemini','openai','anthropic','openrouter','lmstudio']) {
    assert(Object.prototype.hasOwnProperty.call(FALLBACK_MODELS, k), 'FALLBACK_MODELS has ' + k);
  }
  assertDeepEqual(FALLBACK_MODELS.xai, realConfig.availableModels.xai, 'FALLBACK_MODELS.xai matches config.availableModels.xai byte-for-byte');
  assertDeepEqual(FALLBACK_MODELS.gemini, realConfig.availableModels.gemini, 'FALLBACK_MODELS.gemini matches config.availableModels.gemini');
  assertDeepEqual(FALLBACK_MODELS.openai, realConfig.availableModels.openai, 'FALLBACK_MODELS.openai matches config.availableModels.openai');
  assertDeepEqual(FALLBACK_MODELS.anthropic, realConfig.availableModels.anthropic, 'FALLBACK_MODELS.anthropic matches config.availableModels.anthropic');
  assertDeepEqual(FALLBACK_MODELS.openrouter, realConfig.availableModels.openrouter, 'FALLBACK_MODELS.openrouter matches config.availableModels.openrouter');
}

function testProviderConfigRegistry() {
  console.log('\n--- PROVIDER_DISCOVERY_CONFIG registry ---');
  for (const p of ['xai','openai','anthropic','gemini','openrouter','lmstudio']) {
    const cfg = PROVIDER_DISCOVERY_CONFIG[p];
    assert(cfg && typeof cfg.endpoint === 'function', 'config for ' + p + ' has endpoint(apiKey)');
    assert(typeof cfg.headers === 'function', 'config for ' + p + ' has headers(apiKey)');
    assert(typeof cfg.parse === 'function', 'config for ' + p + ' has parse(json)');
    assert(typeof cfg.filter === 'function', 'config for ' + p + ' has filter(model)');
  }
}

// --- runner ------------------------------------------------------------------

(async () => {
  await testXai();
  await testOpenAI();
  await testAnthropic();
  await testGemini();
  await testOpenRouter();
  await testLmStudio();
  await testAuthFail();
  await testNetworkFail500();
  await testNetworkThrown();
  await testTimeout();
  await testEmptyResponse();
  await testMissingApiKey();
  await testUnsupportedProvider();
  await testCacheHit();
  await testBypassCache();
  await testCacheKeyByApiKey();
  await testClearCache();
  testFallbackModelsShape();
  testProviderConfigRegistry();

  console.log('\n=========================================');
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  console.log('=========================================');
  if (failed > 0) {
    console.error('\nFailures:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
})();
