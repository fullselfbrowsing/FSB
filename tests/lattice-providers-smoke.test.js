'use strict';

/**
 * Phase 4 (v0.10.0-attempt-2) -- Lattice provider-adapter surface-presence smoke.
 *
 * Purpose: prove FSB can reach Phase 4's 5 new native provider factories
 * via the existing file: dependency. This is the FSB-side ceremony parity
 * smoke (one per phase since Phase 1). The SUBSTANTIVE INV-03 proof lives
 * in the Lattice-side `parity.test.ts` (Plan 04-04 Task 2).
 *
 * Exercises:
 *   (1) Surface presence: 5 new factories + Phase 1+2+3 carryforward exports
 *       reachable via `await import('lattice')` bare specifier.
 *   (2) Factory invocation with stub options + injected fake fetch; each new
 *       adapter returns a ProviderAdapter shape (kind === "provider-adapter",
 *       expected id, capabilities populated, execute is function).
 *   (3) capabilities[0].modelId reflects the supplied model option (per-adapter).
 *   (4) Phase 1+2+3 byte-frozen baseline preserved (29 + 39 + 72 PASS in
 *       the prior smokes; this smoke runs additively after them).
 *
 * Coverage:
 *   - Phase 4 CONTEXT.md D-01 .. D-21 (surface presence aspects)
 *   - INV-06 (the primitives live in Lattice; FSB just consumes via bare specifier)
 *   - INV-03 ceremony parity (substantive proof in Lattice parity.test.ts)
 *   - Phase 1+2+3 byte-frozen baseline (existing FSB smokes remain unchanged
 *     and the Phase 1+2+3 surface still reachable from THIS smoke too)
 *
 * Run: node tests/lattice-providers-smoke.test.js
 */

let passed = 0;
let failed = 0;

function passAssert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function passAssertEqual(actual, expected, msg) {
  passAssert(
    actual === expected,
    msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')'
  );
}

/**
 * Build a fake fetch returning a provider-shape-appropriate body.
 * Mirrors the Lattice-side per-provider fake-body convention (parity.test.ts).
 */
function makeFakeFetch(body, status) {
  status = status || 200;
  return async function () {
    return new Response(JSON.stringify(body), {
      status: status,
      headers: { 'content-type': 'application/json' }
    });
  };
}

const ANTHROPIC_FAKE_BODY = {
  content: [{ type: 'text', text: 'fsb-smoke anthropic ok' }],
  usage: { input_tokens: 10, output_tokens: 5 }
};

const GEMINI_FAKE_BODY = {
  candidates: [
    { content: { parts: [{ text: 'fsb-smoke gemini ok' }], role: 'model' } }
  ],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
};

const OPENAI_COMPAT_FAKE_BODY = {
  choices: [{ message: { content: 'fsb-smoke openai-compat ok' } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 }
};

(async () => {
  console.log('\n--- Lattice Phase 4 providers surface-presence smoke ---');

  let lattice;
  try {
    lattice = await import('lattice');
  } catch (err) {
    console.error('  FAIL: dynamic import("lattice") threw:', err && err.message ? err.message : err);
    console.error('         Did you run `cd lattice && pnpm install && pnpm build` after Phase 4 commits?');
    process.exit(1);
  }

  // ---- Part 1: surface presence -- 5 new factories ----
  console.log('\n--- Part 1: surface presence (5 new factories) ---');

  passAssertEqual(typeof lattice.createAnthropicProvider, 'function', 'lattice.createAnthropicProvider is a function (NEW in Phase 4)');
  passAssertEqual(typeof lattice.createGeminiProvider, 'function', 'lattice.createGeminiProvider is a function (NEW in Phase 4)');
  passAssertEqual(typeof lattice.createXaiProvider, 'function', 'lattice.createXaiProvider is a function (NEW in Phase 4)');
  passAssertEqual(typeof lattice.createOpenRouterProvider, 'function', 'lattice.createOpenRouterProvider is a function (NEW in Phase 4)');
  passAssertEqual(typeof lattice.createLmStudioProvider, 'function', 'lattice.createLmStudioProvider is a function (NEW in Phase 4)');

  // ---- Part 1b: Phase 1+2+3 carryforward exports still reachable ----
  console.log('\n--- Part 1b: Phase 1+2+3 carryforward exports ---');

  passAssertEqual(typeof lattice.createReceipt, 'function', 'lattice.createReceipt still reachable (Phase 1 carryforward)');
  passAssertEqual(typeof lattice.verifyReceipt, 'function', 'lattice.verifyReceipt still reachable');
  passAssertEqual(typeof lattice.createInMemorySigner, 'function', 'lattice.createInMemorySigner still reachable');
  passAssertEqual(typeof lattice.generateEd25519KeyPairJwk, 'function', 'lattice.generateEd25519KeyPairJwk still reachable');
  passAssertEqual(typeof lattice.createMemoryKeySet, 'function', 'lattice.createMemoryKeySet still reachable');
  passAssertEqual(typeof lattice.createHookPipeline, 'function', 'lattice.createHookPipeline still reachable (Phase 2 carryforward)');
  passAssertEqual(typeof lattice.createCheckpointHook, 'function', 'lattice.createCheckpointHook still reachable (Phase 3 carryforward)');
  passAssertEqual(typeof lattice.createOpenAIProvider, 'function', 'lattice.createOpenAIProvider still reachable (pre-Phase-4 baseline)');
  passAssertEqual(typeof lattice.createOpenAICompatibleProvider, 'function', 'lattice.createOpenAICompatibleProvider still reachable');
  passAssertEqual(typeof lattice.createFakeProvider, 'function', 'lattice.createFakeProvider still reachable');
  passAssertEqual(lattice.STEP_TRANSITION_EVENT_NAME, 'step.transition', 'lattice.STEP_TRANSITION_EVENT_NAME constant preserved');
  passAssertEqual(lattice.DEFAULT_CHECKPOINT_BAND, 1, 'lattice.DEFAULT_CHECKPOINT_BAND === 1 preserved');

  if (failed > 0) {
    console.log('\nLattice providers smoke: surface presence check failed; aborting before factory invocation.');
    process.exit(1);
  }

  // ---- Part 2: factory invocation (each new adapter executes against fake fetch) ----
  console.log('\n--- Part 2: per-adapter shape + execute() against fake fetch ---');

  // Anthropic
  {
    const adapter = lattice.createAnthropicProvider({
      model: 'claude-3-opus-fsb-smoke',
      apiKey: 'sk-ant-fsb-smoke',
      fetch: makeFakeFetch(ANTHROPIC_FAKE_BODY)
    });
    passAssertEqual(adapter.kind, 'provider-adapter', 'createAnthropicProvider().kind === "provider-adapter"');
    passAssertEqual(adapter.id, 'anthropic', 'createAnthropicProvider().id === "anthropic"');
    passAssert(Array.isArray(adapter.capabilities) && adapter.capabilities.length > 0, 'createAnthropicProvider().capabilities non-empty');
    passAssertEqual(adapter.capabilities[0].modelId, 'claude-3-opus-fsb-smoke', 'Anthropic capabilities[0].modelId reflects supplied model');
    passAssertEqual(typeof adapter.execute, 'function', 'createAnthropicProvider().execute is a function');
    const response = await adapter.execute({ task: 't', artifacts: [], outputs: ['text'] });
    passAssertEqual(typeof response.rawOutputs.text, 'string', 'Anthropic execute() returns rawOutputs.text:string');
    passAssertEqual(response.rawOutputs.text, 'fsb-smoke anthropic ok', 'Anthropic rawOutputs.text matches fake body content[0].text');
  }

  // Gemini
  {
    const adapter = lattice.createGeminiProvider({
      model: 'gemini-1.5-flash-fsb-smoke',
      apiKey: 'AIza-fsb-smoke',
      fetch: makeFakeFetch(GEMINI_FAKE_BODY)
    });
    passAssertEqual(adapter.kind, 'provider-adapter', 'createGeminiProvider().kind === "provider-adapter"');
    passAssertEqual(adapter.id, 'gemini', 'createGeminiProvider().id === "gemini"');
    passAssert(Array.isArray(adapter.capabilities) && adapter.capabilities.length > 0, 'createGeminiProvider().capabilities non-empty');
    passAssertEqual(adapter.capabilities[0].modelId, 'gemini-1.5-flash-fsb-smoke', 'Gemini capabilities[0].modelId reflects supplied model');
    const response = await adapter.execute({ task: 't', artifacts: [], outputs: ['text'] });
    passAssertEqual(response.rawOutputs.text, 'fsb-smoke gemini ok', 'Gemini rawOutputs.text matches fake body candidates[0].content.parts[0].text');
  }

  // xAI
  {
    const adapter = lattice.createXaiProvider({
      model: 'grok-4-fsb-smoke',
      apiKey: 'xai-fsb-smoke',
      fetch: makeFakeFetch(OPENAI_COMPAT_FAKE_BODY)
    });
    passAssertEqual(adapter.kind, 'provider-adapter', 'createXaiProvider().kind === "provider-adapter"');
    passAssertEqual(adapter.id, 'xai', 'createXaiProvider().id === "xai"');
    passAssertEqual(adapter.capabilities[0].modelId, 'grok-4-fsb-smoke', 'xAI capabilities[0].modelId reflects supplied model');
    const response = await adapter.execute({ task: 't', artifacts: [], outputs: ['text'] });
    passAssertEqual(response.rawOutputs.text, 'fsb-smoke openai-compat ok', 'xAI rawOutputs.text matches fake body (OpenAI-compat shape)');
  }

  // OpenRouter
  {
    const adapter = lattice.createOpenRouterProvider({
      model: 'openai/gpt-4o-fsb-smoke',
      apiKey: 'sk-or-fsb-smoke',
      fetch: makeFakeFetch(OPENAI_COMPAT_FAKE_BODY)
    });
    passAssertEqual(adapter.kind, 'provider-adapter', 'createOpenRouterProvider().kind === "provider-adapter"');
    passAssertEqual(adapter.id, 'openrouter', 'createOpenRouterProvider().id === "openrouter"');
    passAssertEqual(adapter.capabilities[0].modelId, 'openai/gpt-4o-fsb-smoke', 'OpenRouter capabilities[0].modelId reflects supplied model');
    const response = await adapter.execute({ task: 't', artifacts: [], outputs: ['text'] });
    passAssertEqual(response.rawOutputs.text, 'fsb-smoke openai-compat ok', 'OpenRouter rawOutputs.text matches fake body');
  }

  // LM Studio (no apiKey -- CD-03 default)
  {
    const adapter = lattice.createLmStudioProvider({
      model: 'qwen2.5-coder-fsb-smoke',
      fetch: makeFakeFetch(OPENAI_COMPAT_FAKE_BODY)
    });
    passAssertEqual(adapter.kind, 'provider-adapter', 'createLmStudioProvider().kind === "provider-adapter"');
    passAssertEqual(adapter.id, 'lm-studio', 'createLmStudioProvider().id === "lm-studio"');
    passAssertEqual(adapter.capabilities[0].modelId, 'qwen2.5-coder-fsb-smoke', 'LM Studio capabilities[0].modelId reflects supplied model');
    const response = await adapter.execute({ task: 't', artifacts: [], outputs: ['text'] });
    passAssertEqual(response.rawOutputs.text, 'fsb-smoke openai-compat ok', 'LM Studio rawOutputs.text matches fake body');
  }

  // ---- Part 3: distinct provider ids (CD-02 ceremony parity with Lattice parity smoke) ----
  console.log('\n--- Part 3: 5 new adapters claim distinct ids ---');

  const ids = new Set();
  for (const builder of [
    () => lattice.createAnthropicProvider({ model: 'm', apiKey: 'k', fetch: makeFakeFetch(ANTHROPIC_FAKE_BODY) }),
    () => lattice.createGeminiProvider({ model: 'm', apiKey: 'k', fetch: makeFakeFetch(GEMINI_FAKE_BODY) }),
    () => lattice.createXaiProvider({ model: 'm', apiKey: 'k', fetch: makeFakeFetch(OPENAI_COMPAT_FAKE_BODY) }),
    () => lattice.createOpenRouterProvider({ model: 'm', apiKey: 'k', fetch: makeFakeFetch(OPENAI_COMPAT_FAKE_BODY) }),
    () => lattice.createLmStudioProvider({ model: 'm', fetch: makeFakeFetch(OPENAI_COMPAT_FAKE_BODY) })
  ]) {
    const adapter = builder();
    passAssert(!ids.has(adapter.id), '5 new adapter id "' + adapter.id + '" is distinct (no collision)');
    ids.add(adapter.id);
  }
  passAssertEqual(ids.size, 5, '5 new adapters yield 5 distinct ids');

  console.log('\n--- Summary ---');
  console.log('passed:', passed);
  console.log('failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Providers smoke harness uncaught error:', err && err.stack ? err.stack : err);
  process.exit(1);
});
