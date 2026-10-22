/**
 * Unit tests for ai/cost-tracker.js
 *
 * Adapted from archive/remote-main tests/test-cost-tracker.js. The archive
 * exported standalone checkBudget / checkTimeLimit functions that read
 * agentState.totalCost / agentState.startTime; local uses an instance-based
 * CostTracker class with a record()/checkBudget() method pair instead. The
 * tests below preserve the pricing + budget enforcement validation intent
 * against local's actual API surface.
 *
 * Phase 66 (plan 66-04, D-10/D-11): the Grok rows follow the xAI retirement of
 * May 15, 2026 (grok-4.3 and every slug it now serves bill at $1.25/$2.50 per
 * 1M; grok-build-0.1 and grok-code-fast-1 at $1.00/$2.00), so every
 * Grok-priced expectation below is recomputed from those rows. The unknown
 * model display fallback is a frozen legacy constant that no longer reads a
 * Grok row. The provider-first usage/cost readers and the per-iteration
 * measurement helpers are covered at the end of the file.
 *
 * Note: local also has an orthogonal source-level regression test at
 * tests/cost-tracker-ordering.test.js that verifies agent-loop.js
 * construction ordering. These two test files complement each other.
 *
 * Run: node tests/cost-tracker.test.js
 */

'use strict';

const util = require('util');

const {
  MODEL_PRICING,
  estimateCost,
  CostTracker,
  resolvePricingKey,
  readProviderUsage,
  estimateCostDetailed,
  buildIterationTimingRow,
  appendIterationTiming,
  addIterationToolTime,
  XAI_TICKS_PER_USD,
  LEGACY_UNKNOWN_MODEL_PRICING
} = require('../extension/ai/cost-tracker.js');
const xaiFixture = require('./fixtures/bench/xai-chat-completion.json');

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

function assertClose(actual, expected, msg, epsilon) {
  const eps = epsilon || 0.0001;
  assert(Math.abs(actual - expected) < eps, msg + ' (expected: ~' + expected + ', got: ' + actual + ')');
}

function assertDeepEqual(actual, expected, msg) {
  assert(util.isDeepStrictEqual(actual, expected),
    msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')');
}

// Phase 66 cases run inside a section so a missing export fails the case
// instead of aborting the whole file.
function section(title, fn) {
  console.log('\n--- ' + title + ' ---');
  try {
    fn();
  } catch (err) {
    failed++;
    console.error('  FAIL: ' + title + ' threw: ' + (err && err.message ? err.message : String(err)));
  }
}

function collectKeys(value, out) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, out));
  } else if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      out.push(key);
      collectKeys(value[key], out);
    });
  }
  return out;
}

// --- MODEL_PRICING table presence ----------------------------------------

console.log('\n--- MODEL_PRICING table presence ---');
assert(typeof MODEL_PRICING === 'object' && MODEL_PRICING !== null, 'MODEL_PRICING is an object');
assert('grok-4-1-fast-reasoning' in MODEL_PRICING, 'has grok-4-1-fast-reasoning');
assertEqual(MODEL_PRICING['grok-4-1-fast-reasoning'].input, 1.25, 'grok-4-1-fast-reasoning input price (served by grok-4.3)');
assertEqual(MODEL_PRICING['grok-4-1-fast-reasoning'].output, 2.50, 'grok-4-1-fast-reasoning output price (served by grok-4.3)');
assert('gpt-4o' in MODEL_PRICING, 'has gpt-4o');
assertEqual(MODEL_PRICING['gpt-4o'].input, 2.50, 'gpt-4o input price');
assertEqual(MODEL_PRICING['gpt-4o'].output, 10.00, 'gpt-4o output price');
assert('claude-sonnet-4-5-20250514' in MODEL_PRICING, 'has claude-sonnet-4-5-20250514');
assertEqual(MODEL_PRICING['claude-sonnet-4-5-20250514'].input, 3.00, 'claude sonnet input price');
assertEqual(MODEL_PRICING['claude-sonnet-4-5-20250514'].output, 15.00, 'claude sonnet output price');
assert('claude-opus-4-1-20250414' in MODEL_PRICING, 'has claude-opus-4-1-20250414');
assert('gemini-2.5-flash' in MODEL_PRICING, 'has gemini-2.5-flash');
assert('gemini-2.0-flash' in MODEL_PRICING, 'has gemini-2.0-flash (free tier)');
assertEqual(MODEL_PRICING['gemini-2.0-flash'].input, 0.00, 'gemini-2.0-flash free input');
assertEqual(MODEL_PRICING['gemini-2.0-flash'].output, 0.00, 'gemini-2.0-flash free output');

const modelCount = Object.keys(MODEL_PRICING).length;
assert(modelCount >= 20, 'MODEL_PRICING has 20+ entries (got ' + modelCount + ')');

// --- estimateCost: exact model match -------------------------------------

console.log('\n--- estimateCost: exact model match ---');
// grok-4-1-fast-reasoning: input 1.25/1M, output 2.50/1M -> 1M/1M = $3.75
assertClose(estimateCost('grok-4-1-fast-reasoning', 1000000, 1000000), 3.75, 'grok-4-1-fast-reasoning 1M/1M = $3.75');
// grok-4-1-fast-reasoning: 1M input, 100K output -> $1.25 + $0.25 = $1.50
assertClose(estimateCost('grok-4-1-fast-reasoning', 1000000, 100000), 1.50, 'grok-4-1-fast-reasoning 1M/100K = $1.50');
// gpt-4o: 1M/1M = $12.50
assertClose(estimateCost('gpt-4o', 1000000, 1000000), 12.50, 'gpt-4o 1M/1M = $12.50');
// claude-sonnet-4-5: 1M/1M = $18.00
assertClose(estimateCost('claude-sonnet-4-5-20250514', 1000000, 1000000), 18.00, 'claude-sonnet-4-5 1M/1M = $18.00');

// --- estimateCost: prefix / substring match ------------------------------

console.log('\n--- estimateCost: prefix / substring match ---');
// Versioned model name that starts with a known key should match it
assertClose(estimateCost('grok-4-1-fast-reasoning-v2', 1000000, 0), 1.25, 'prefix match: grok-4-1-fast-reasoning-v2 matches grok-4-1-fast-reasoning');

// --- estimateCost: unknown model fallback --------------------------------

console.log('\n--- estimateCost: unknown model fallback ---');
// Unknown models keep the frozen pre-Phase-66 display rate (0.20/0.50), which
// no longer reads the grok-4-1-fast-reasoning row
assertClose(estimateCost('totally-unknown-model', 1000000, 1000000), 0.70, 'unknown model uses the frozen legacy display fallback (decoupled from Grok rows)');

// --- estimateCost: null / zero inputs ------------------------------------

console.log('\n--- estimateCost: null / zero inputs ---');
assertEqual(estimateCost(null, 0, 0), 0, 'null model, zero tokens returns 0');
assertEqual(estimateCost('grok-4-1-fast-reasoning', 0, 0), 0, 'zero tokens returns 0 regardless of model');

// --- estimateCost: LM Studio stays free -----------------------------------

console.log('\n--- estimateCost: LM Studio local usage ---');
assertEqual(
  estimateCost('qwen/qwen3-30b-a3b', 1000000, 1000000, 'lmstudio'),
  0,
  'LM Studio local usage is always $0'
);

// --- CostTracker construction --------------------------------------------

console.log('\n--- CostTracker construction ---');
{
  const ct = new CostTracker(5.00);
  assertEqual(ct.totalCost, 0, 'initial totalCost is 0');
  assertEqual(ct.totalInputTokens, 0, 'initial totalInputTokens is 0');
  assertEqual(ct.totalOutputTokens, 0, 'initial totalOutputTokens is 0');
  assertEqual(ct.callCount, 0, 'initial callCount is 0');
  assertEqual(ct.costLimit, 5.00, 'costLimit passed through constructor');
}

// --- CostTracker default costLimit ---------------------------------------

console.log('\n--- CostTracker default costLimit ---');
{
  const ct = new CostTracker();
  assertEqual(ct.costLimit, 2.00, 'default costLimit is $2.00');
}

// --- CostTracker.record() accumulates correctly --------------------------

console.log('\n--- CostTracker.record() accumulates ---');
{
  const ct = new CostTracker(10.00);
  const c1 = ct.record('grok-4-1-fast-reasoning', 1000000, 1000000);
  assertClose(c1, 3.75, 'first call returns individual cost');
  assertClose(ct.totalCost, 3.75, 'totalCost after one call');
  assertEqual(ct.totalInputTokens, 1000000, 'totalInputTokens after one call');
  assertEqual(ct.totalOutputTokens, 1000000, 'totalOutputTokens after one call');
  assertEqual(ct.callCount, 1, 'callCount after one call');

  const c2 = ct.record('grok-4-1-fast-reasoning', 500000, 200000);
  // 0.625 + 0.50 = 1.125
  assertClose(c2, 1.125, 'second call returns individual cost');
  assertClose(ct.totalCost, 4.875, 'totalCost after two calls');
  assertEqual(ct.totalInputTokens, 1500000, 'totalInputTokens after two calls');
  assertEqual(ct.totalOutputTokens, 1200000, 'totalOutputTokens after two calls');
  assertEqual(ct.callCount, 2, 'callCount after two calls');
}

// --- CostTracker.record() handles missing tokens -------------------------

console.log('\n--- CostTracker.record() handles missing tokens ---');
{
  const ct = new CostTracker();
  ct.record('grok-4-1-fast-reasoning', undefined, undefined);
  assertEqual(ct.totalInputTokens, 0, 'undefined inputTokens treated as 0');
  assertEqual(ct.totalOutputTokens, 0, 'undefined outputTokens treated as 0');
  assertEqual(ct.callCount, 1, 'callCount still incremented');
}

// --- CostTracker.record() keeps LM Studio free ----------------------------

console.log('\n--- CostTracker.record() keeps LM Studio free ---');
{
  const ct = new CostTracker();
  const cost = ct.record('qwen/qwen3-30b-a3b', 1000000, 1000000, 'lmstudio');
  assertEqual(cost, 0, 'LM Studio call cost is $0');
  assertEqual(ct.totalCost, 0, 'LM Studio does not increase totalCost');
  assertEqual(ct.callCount, 1, 'LM Studio calls still increment callCount');
}

// --- CostTracker.checkBudget(): under limit ------------------------------

console.log('\n--- CostTracker.checkBudget(): under limit ---');
{
  const ct = new CostTracker(3.00);
  ct.record('grok-4-1-fast-reasoning', 1000000, 500000);
  // Cost: 1.25 + 1.25 = 2.50
  const budget = ct.checkBudget();
  assertEqual(budget.exceeded, false, 'under limit -> exceeded is false');
  assertEqual(budget.reason, null, 'under limit -> reason is null');
  assertEqual(budget.costLimit, 3.00, 'checkBudget echoes costLimit');
  assertClose(budget.totalCost, 2.50, 'checkBudget echoes totalCost');
}

// --- CostTracker.checkBudget(): Phase 231 — enforcement disabled ---------

console.log('\n--- CostTracker.checkBudget(): Phase 231 — limit no longer enforced ---');
{
  const ct = new CostTracker(0.50);
  ct.record('grok-4-1-fast-reasoning', 1000000, 1000000);
  // Cost: 3.75 — would have exceeded 0.50 pre-Phase-231
  const budget = ct.checkBudget();
  assertEqual(budget.exceeded, false, 'Phase 231: cost over old limit no longer triggers exceeded');
  assertEqual(budget.reason, null, 'Phase 231: no termination reason emitted');
  assertClose(budget.totalCost, 3.75, 'totalCost still tracked accurately for analytics');
  assertEqual(budget.costLimit, 0.50, 'costLimit field preserved for backward-compat reads');
}

console.log('\n--- CostTracker.checkBudget(): Phase 231 — at-limit also no longer enforced ---');
{
  const ct = new CostTracker(3.75);
  ct.record('grok-4-1-fast-reasoning', 1000000, 1000000);
  // Cost: exactly 3.75
  const budget = ct.checkBudget();
  assertEqual(budget.exceeded, false, 'Phase 231: at-limit no longer triggers exceeded');
  assertClose(budget.totalCost, 3.75, 'at-limit totalCost equals the limit');
}

// --- CostTracker.toJSON() serialization ----------------------------------

console.log('\n--- CostTracker.toJSON() ---');
{
  const ct = new CostTracker(3.00);
  ct.record('grok-4-1-fast-reasoning', 1000000, 500000);
  ct.record('gpt-4o', 500000, 100000);
  const json = ct.toJSON();
  assertClose(json.totalCost, 2.50 + 2.25, 'toJSON totalCost');
  assertEqual(json.totalInputTokens, 1500000, 'toJSON totalInputTokens');
  assertEqual(json.totalOutputTokens, 600000, 'toJSON totalOutputTokens');
  assertEqual(json.callCount, 2, 'toJSON callCount');
  assertEqual(json.costLimit, 3.00, 'toJSON costLimit');
}

// --- CostTracker isolation: multiple independent instances ---------------

console.log('\n--- CostTracker isolation between instances ---');
{
  const a = new CostTracker(1.00);
  const b = new CostTracker(5.00);
  a.record('grok-4-1-fast-reasoning', 1000000, 1000000);
  assertClose(a.totalCost, 3.75, 'a.totalCost updated');
  assertEqual(b.totalCost, 0, 'b.totalCost unaffected by a.record()');
  assertEqual(b.callCount, 0, 'b.callCount unaffected');
}

// =========================================================================
// Phase 66 (plan 66-04): D-11 Grok rows, provider-first usage and cost,
// and per-iteration measurement rows
// =========================================================================

section('D-11: Grok rows follow the May 15, 2026 xAI retirement', () => {
  const keys = Object.keys(MODEL_PRICING);
  assertEqual(keys.slice(0, 3).join(','), 'grok-4.3,grok-4.3-latest,grok-build-0.1',
    'the first three keys are grok-4.3, grok-4.3-latest, grok-build-0.1');
  assert(keys.indexOf('grok-4.3') >= 0 && keys.indexOf('grok-4.3') < keys.indexOf('grok-4'),
    'exact grok-4.3 row precedes the legacy grok-4 substring row');
  assert(keys.indexOf('grok-4.3-latest') >= 0 && keys.indexOf('grok-4.3-latest') < keys.indexOf('grok-4'),
    'exact grok-4.3-latest row precedes the legacy grok-4 substring row');
  [
    'grok-4.3', 'grok-4.3-latest', 'grok-4-1-fast', 'grok-4-1-fast-reasoning',
    'grok-4-1-fast-non-reasoning', 'grok-4-fast-reasoning', 'grok-4-fast-non-reasoning',
    'grok-4-0709', 'grok-3'
  ].forEach((key) => {
    assertDeepEqual(MODEL_PRICING[key], { input: 1.25, output: 2.50 }, key + ' bills at grok-4.3 rates ($1.25/$2.50)');
  });
  ['grok-build-0.1', 'grok-code-fast-1'].forEach((key) => {
    assertDeepEqual(MODEL_PRICING[key], { input: 1.00, output: 2.00 }, key + ' bills at grok-build-0.1 rates ($1.00/$2.00)');
  });
  // Rows D-11 does not name are unchanged
  assertDeepEqual(MODEL_PRICING['grok-4'], { input: 3.00, output: 15.00 }, 'legacy grok-4 row unchanged');
  assertDeepEqual(MODEL_PRICING['grok-4-1'], { input: 3.00, output: 15.00 }, 'legacy grok-4-1 row unchanged');
  assertDeepEqual(MODEL_PRICING['grok-4-fast'], { input: 3.00, output: 15.00 }, 'legacy grok-4-fast row unchanged');
  assertDeepEqual(MODEL_PRICING['grok-3-mini'], { input: 0.30, output: 0.50 }, 'grok-3-mini row unchanged');
  assertDeepEqual(MODEL_PRICING['grok-3-fast'], { input: 0.50, output: 2.50 }, 'grok-3-fast row unchanged');
  assertDeepEqual(MODEL_PRICING['grok-3-mini-beta'], { input: 0.30, output: 0.50 }, 'grok-3-mini-beta row unchanged');
  assertDeepEqual(MODEL_PRICING['grok-3-mini-fast-beta'], { input: 0.20, output: 0.50 }, 'grok-3-mini-fast-beta row unchanged');
  assertDeepEqual(MODEL_PRICING['gemini-2.5-pro'], { input: 1.25, output: 10.00 }, 'gemini-2.5-pro row unchanged');
});

section('estimateCost prices the pin target and the retired slugs correctly', () => {
  assertClose(estimateCost('grok-4.3', 1e6, 1e6), 3.75, 'grok-4.3 1M/1M = $3.75 (was $18.00 via the grok-4 substring)', 1e-9);
  assertClose(estimateCost('grok-4.3-latest', 1e6, 1e6), 3.75, 'grok-4.3-latest 1M/1M = $3.75', 1e-9);
  assertClose(estimateCost('x-ai/grok-4.3', 1e6, 1e6), 3.75, 'OpenRouter-style x-ai/grok-4.3 matches the grok-4.3 row', 1e-9);
  assertClose(estimateCost('grok-4-1-fast-reasoning', 1e6, 1e6), 3.75, 'grok-4-1-fast-reasoning 1M/1M = $3.75', 1e-9);
  assertClose(estimateCost('grok-4-1-fast', 1e6, 1e6), 3.75, 'FSB default slug grok-4-1-fast 1M/1M = $3.75', 1e-9);
  assertClose(estimateCost('grok-build-0.1', 1e6, 1e6), 3.00, 'grok-build-0.1 1M/1M = $3.00', 1e-9);
  assertClose(estimateCost('grok-4.3', 1e6, 1e6, 'xai'), 3.75, 'the provider argument does not change a priced model', 1e-9);
  assertClose(estimateCost('constructor', 1e6, 1e6), 0.70, 'prototype names never resolve to a price row (legacy fallback, not NaN)', 1e-9);
  assertClose(estimateCost('Totally-Unknown-Model', 1e6, 0), 0.20, 'unknown model input side uses the legacy $0.20/M', 1e-9);
});

section('LEGACY_UNKNOWN_MODEL_PRICING and XAI_TICKS_PER_USD', () => {
  assertDeepEqual(Object.assign({}, LEGACY_UNKNOWN_MODEL_PRICING), { input: 0.20, output: 0.50 },
    'legacy unknown-model display rate is 0.20/0.50');
  assert(Object.isFrozen(LEGACY_UNKNOWN_MODEL_PRICING), 'legacy unknown-model rate is frozen');
  assert(Object.keys(MODEL_PRICING).every((key) => MODEL_PRICING[key] !== LEGACY_UNKNOWN_MODEL_PRICING),
    'legacy unknown-model rate is not a MODEL_PRICING row object');
  assertEqual(XAI_TICKS_PER_USD, 1e10, 'xAI cost ticks: 1e10 ticks = $1');
});

section('resolvePricingKey', () => {
  assertEqual(resolvePricingKey('grok-4.3'), 'grok-4.3', 'exact grok-4.3');
  assertEqual(resolvePricingKey('grok-4.3-latest'), 'grok-4.3-latest', 'exact grok-4.3-latest');
  assertEqual(resolvePricingKey('x-ai/grok-4.3'), 'grok-4.3', 'substring x-ai/grok-4.3 -> grok-4.3');
  assertEqual(resolvePricingKey('Grok-4.3'), 'grok-4.3', 'case-insensitive substring match');
  assertEqual(resolvePricingKey('grok-4-1-fast-reasoning-v2'), 'grok-4-1-fast-reasoning', 'prefix match keeps insertion order');
  assertEqual(resolvePricingKey('gpt-4o'), 'gpt-4o', 'exact non-Grok key');
  assertEqual(resolvePricingKey('totally-unknown-model'), null, 'unknown model -> null');
  assertEqual(resolvePricingKey(null), null, 'null -> null');
  assertEqual(resolvePricingKey(undefined), null, 'undefined -> null');
  assertEqual(resolvePricingKey(''), null, 'empty string -> null');
  assertEqual(resolvePricingKey(42), null, 'non-string -> null');
  assertEqual(resolvePricingKey('constructor'), null, 'prototype property name -> null');
  assertEqual(resolvePricingKey('__proto__'), null, '__proto__ -> null');
});

section('readProviderUsage: xAI fixture (provider usage and cost ticks)', () => {
  assertEqual(typeof xaiFixture._fixture, 'string', 'fixture documents that it is synthetic');
  const usage = readProviderUsage(xaiFixture, 'xai');
  assertDeepEqual(usage, {
    input: 12000,
    output: 350,
    reasoning: 420,
    cachedInput: 8000,
    providerCostUsd: 0.008525,
    usageSource: 'provider',
    servedModel: 'grok-4.3'
  }, 'xAI body maps to provider usage and ticks / 1e10 USD');
  assertEqual(usage.providerCostUsd, xaiFixture.usage.cost_in_usd_ticks / XAI_TICKS_PER_USD, 'providerCostUsd = ticks / XAI_TICKS_PER_USD');
  assertEqual(readProviderUsage(xaiFixture, 'XAI').providerCostUsd, 0.008525, 'provider key is case-insensitive');
});

section('readProviderUsage: missing, non-finite and negative fields are null', () => {
  const empty = {
    input: null, output: null, reasoning: null, cachedInput: null,
    providerCostUsd: null, usageSource: 'unavailable', servedModel: null
  };
  assertDeepEqual(readProviderUsage({}, 'xai'), empty, 'empty body -> all null, unavailable');
  assertDeepEqual(readProviderUsage(null, 'xai'), empty, 'null body -> all null, unavailable');
  assertDeepEqual(readProviderUsage(undefined, 'openai'), empty, 'undefined body -> all null, unavailable');
  assertDeepEqual(readProviderUsage('not-an-object', 'xai'), empty, 'string body -> all null, unavailable');
  assertDeepEqual(readProviderUsage([1, 2], 'xai'), empty, 'array body -> all null, unavailable');
  const hostile = readProviderUsage({
    model: 'grok-4.3',
    usage: {
      prompt_tokens: -5,
      completion_tokens: NaN,
      prompt_tokens_details: { cached_tokens: '8000' },
      completion_tokens_details: { reasoning_tokens: Infinity },
      cost_in_usd_ticks: -1
    }
  }, 'xai');
  assertDeepEqual(hostile, Object.assign({}, empty, { servedModel: 'grok-4.3' }),
    'negative, NaN, Infinity and string fields -> null (served model kept)');
  const noTicks = readProviderUsage({ usage: { prompt_tokens: 10, completion_tokens: 2 } }, 'xai');
  assertEqual(noTicks.providerCostUsd, null, 'xAI body without ticks -> providerCostUsd null');
  assertEqual(noTicks.usageSource, 'provider', 'xAI body without ticks still has provider usage');
  assertEqual(noTicks.reasoning, null, 'absent reasoning details -> null, never 0');
  assertEqual(noTicks.cachedInput, null, 'absent cached details -> null, never 0');
  assertEqual(readProviderUsage(xaiFixture, 'openai').providerCostUsd, null, 'ticks are honoured only for the xai provider');
  assertEqual(readProviderUsage({ model: 'g'.repeat(500), usage: {} }, 'xai').servedModel.length, 128, 'servedModel is capped at 128 chars');
  assertEqual(readProviderUsage({ model: 12, usage: {} }, 'xai').servedModel, null, 'non-string served model -> null');
});

section('readProviderUsage: anthropic, gemini and openrouter shapes', () => {
  assertDeepEqual(readProviderUsage({
    model: 'claude-sonnet-4-5-20250514',
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3 }
  }, 'anthropic'), {
    input: 10, output: 5, reasoning: null, cachedInput: 3,
    providerCostUsd: null, usageSource: 'provider', servedModel: 'claude-sonnet-4-5-20250514'
  }, 'anthropic usage.input_tokens/output_tokens/cache_read_input_tokens');
  assertDeepEqual(readProviderUsage({
    modelVersion: 'gemini-2.5-flash',
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 7, cachedContentTokenCount: 40 }
  }, 'gemini'), {
    input: 100, output: 20, reasoning: 7, cachedInput: 40,
    providerCostUsd: null, usageSource: 'provider', servedModel: 'gemini-2.5-flash'
  }, 'gemini usageMetadata prompt/candidates/thoughts/cachedContent counts');
  assertDeepEqual(readProviderUsage({
    model: 'x-ai/grok-4.3',
    usage: { prompt_tokens: 1000, completion_tokens: 100, cost: 0.0042 }
  }, 'openrouter'), {
    input: 1000, output: 100, reasoning: null, cachedInput: null,
    providerCostUsd: 0.0042, usageSource: 'provider', servedModel: 'x-ai/grok-4.3'
  }, 'openrouter finite usage.cost is the provider cost');
  assertEqual(readProviderUsage({ usage: { prompt_tokens: 1, completion_tokens: 1, cost: -0.5 } }, 'openrouter').providerCostUsd,
    null, 'openrouter negative cost -> null');
  assertEqual(readProviderUsage({ usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.5 } }, 'openai').providerCostUsd,
    null, 'usage.cost is honoured only for openrouter');
  assertEqual(readProviderUsage({ usage: { input_tokens: 10 } }, 'anthropic').output, null, 'anthropic missing output -> null');
});

section('readProviderUsage: stored key names avoid "token"', () => {
  const keys = collectKeys(readProviderUsage(xaiFixture, 'xai'), []);
  assert(keys.length > 0 && keys.every((key) => !/token/i.test(key)), 'no key matches /token/i');
});

section('estimateCostDetailed: labelled estimate, never a Grok guess', () => {
  const someUsage = { input: 1, output: 1, reasoning: null, cachedInput: null };
  const unknown = estimateCostDetailed('totally-unknown-model', someUsage, 'xai');
  assertEqual(unknown.usd, null, 'unknown model -> usd null');
  assertEqual(unknown.source, 'unavailable', 'unknown model -> source unavailable');
  assertEqual(unknown.pricingKey, null, 'unknown model -> pricingKey null');
  assertEqual(unknown.reasoningBilled, false, 'unknown model -> reasoningBilled false');

  const xai = estimateCostDetailed('grok-4.3', { input: 1e6, output: 1e6, reasoning: 1e6 }, 'xai');
  assertEqual(xai.usd, 6.25, 'grok-4.3 xai 1M/1M/1M reasoning = $6.25 (reasoning at the output rate)');
  assertEqual(xai.source, 'estimate', 'priced model -> source estimate');
  assertEqual(xai.pricingKey, 'grok-4.3', 'pricingKey is the resolved row');
  assertEqual(xai.reasoningBilled, true, 'xai reasoning is billed');

  const gemini = estimateCostDetailed('gemini-2.5-flash', { input: 1e6, output: 1e6, reasoning: 1e6 }, 'gemini');
  assertClose(gemini.usd, 5.30, 'gemini reasoning (thoughts) billed at the output rate', 1e-9);
  assertEqual(gemini.reasoningBilled, true, 'gemini reasoning is billed');

  const openai = estimateCostDetailed('gpt-4o', { input: 1e6, output: 1e6, reasoning: 1e6 }, 'openai');
  assertClose(openai.usd, 12.50, 'openai reasoning is already inside completion tokens (not added)', 1e-9);
  assertEqual(openai.reasoningBilled, false, 'openai reasoningBilled false');

  const noReasoning = estimateCostDetailed('grok-4.3', { input: 1e6, output: 1e6, reasoning: null }, 'xai');
  assertClose(noReasoning.usd, 3.75, 'xai without reported reasoning bills input + output only', 1e-9);
  assertEqual(noReasoning.reasoningBilled, false, 'reasoningBilled false when reasoning is not reported');

  const missingInput = estimateCostDetailed('grok-4.3', { input: null, output: 5, reasoning: null }, 'xai');
  assertEqual(missingInput.source, 'unavailable', 'input null -> unavailable');
  assertEqual(missingInput.usd, null, 'input null -> usd null');
  assertEqual(estimateCostDetailed('grok-4.3', { input: 5, output: null }, 'xai').source, 'unavailable', 'output null -> unavailable');
  assertEqual(estimateCostDetailed('grok-4.3', null, 'xai').source, 'unavailable', 'usage null -> unavailable (no throw)');

  const lmstudio = estimateCostDetailed('qwen/qwen3-30b-a3b', { input: 1e6, output: 1e6 }, 'lmstudio');
  assertEqual(lmstudio.usd, 0, 'lmstudio local estimate is $0');
  assertEqual(lmstudio.source, 'estimate', 'lmstudio source estimate');
  assertEqual(lmstudio.pricingKey, 'lmstudio-local', 'lmstudio pricingKey lmstudio-local');

  const fixtureEstimate = estimateCostDetailed('grok-4.3', readProviderUsage(xaiFixture, 'xai'), 'xai');
  assertClose(fixtureEstimate.usd, 0.016925, 'fixture estimate: 12000 in + (350 + 420) out at grok-4.3 rates', 1e-12);
});

function fixtureRow(overrides) {
  const usage = readProviderUsage(xaiFixture, 'xai');
  return buildIterationTimingRow(Object.assign({
    iteration: 3,
    startedAt: 1790726400000,
    modelMs: 2150,
    modelRetried: false,
    usage: usage,
    estimate: estimateCostDetailed('grok-4.3', usage, 'xai'),
    requestedModel: 'grok-4.3',
    provider: 'xai'
  }, overrides || {}));
}

function openaiRow(iteration, input, output) {
  const usage = readProviderUsage({ model: 'gpt-4o', usage: { prompt_tokens: input, completion_tokens: output } }, 'openai');
  return buildIterationTimingRow({
    iteration: iteration, startedAt: 1790726400000 + iteration, modelMs: 100, modelRetried: false,
    usage: usage, estimate: estimateCostDetailed('gpt-4o', usage, 'openai'), requestedModel: 'gpt-4o', provider: 'openai'
  });
}

function unavailableRow(iteration) {
  const usage = readProviderUsage({}, 'custom');
  return buildIterationTimingRow({
    iteration: iteration, startedAt: 1790726400000 + iteration, modelMs: null, modelRetried: false,
    usage: usage, estimate: estimateCostDetailed('totally-unknown-model', usage, 'custom'),
    requestedModel: 'totally-unknown-model', provider: 'custom'
  });
}

section('buildIterationTimingRow: provider cost wins and the delta is recorded', () => {
  const row = fixtureRow();
  assertDeepEqual(Object.keys(row), [
    'v', 'iteration', 'startedAt', 'modelMs', 'modelRetried', 'toolMs', 'toolCount', 'usage',
    'usageSource', 'costUsd', 'costSource', 'estimateUsd', 'estimateDeltaPct', 'pricingKey',
    'requestedModel', 'servedModel', 'provider'
  ], 'row carries exactly the v1 contract keys');
  assertEqual(row.v, 1, 'v = 1');
  assertEqual(row.iteration, 3, 'iteration');
  assertEqual(row.startedAt, 1790726400000, 'startedAt');
  assertEqual(row.modelMs, 2150, 'modelMs');
  assertEqual(row.modelRetried, false, 'modelRetried false');
  assertEqual(row.toolMs, null, 'toolMs null until the first measured tool');
  assertEqual(row.toolCount, 0, 'toolCount starts at 0');
  assertDeepEqual(row.usage, { input: 12000, output: 350, reasoning: 420, cachedInput: 8000 }, 'usage copied from the provider');
  assertEqual(row.usageSource, 'provider', 'usageSource provider');
  assertEqual(row.costUsd, 0.008525, 'costUsd is the provider cost');
  assertEqual(row.costSource, 'provider', 'costSource provider');
  assertClose(row.estimateUsd, 0.016925, 'estimateUsd kept beside the provider cost', 1e-12);
  const expectedDelta = Math.round(((row.estimateUsd - 0.008525) / 0.008525) * 10000) / 10000;
  assertEqual(row.estimateDeltaPct, expectedDelta, 'estimateDeltaPct = round4((estimate - provider) / provider)');
  assertEqual(row.estimateDeltaPct, 0.9853, 'fixture delta shows the unmodelled cached-input discount');
  assertEqual(row.pricingKey, 'grok-4.3', 'pricingKey');
  assertEqual(row.requestedModel, 'grok-4.3', 'requestedModel');
  assertEqual(row.servedModel, 'grok-4.3', 'servedModel');
  assertEqual(row.provider, 'xai', 'provider');
  assertDeepEqual(JSON.parse(JSON.stringify(row)), row, 'row is JSON-safe');
});

section('buildIterationTimingRow: estimate-only, unavailable and hostile inputs', () => {
  const estimateOnly = openaiRow(1, 1e6, 1e6);
  assertEqual(estimateOnly.costSource, 'estimate', 'no provider cost but an estimate -> estimate');
  assertClose(estimateOnly.costUsd, 12.50, 'estimate-only costUsd is the estimate', 1e-9);
  assertEqual(estimateOnly.estimateDeltaPct, null, 'no provider cost -> no delta');

  const none = unavailableRow(2);
  assertEqual(none.costUsd, null, 'neither provider cost nor estimate -> costUsd null');
  assertEqual(none.costSource, 'unavailable', 'neither -> unavailable');
  assertEqual(none.estimateUsd, null, 'neither -> estimateUsd null');
  assertEqual(none.pricingKey, null, 'unknown model -> pricingKey null');
  assertEqual(none.usageSource, 'unavailable', 'no usage -> usageSource unavailable');
  assertDeepEqual(none.usage, { input: null, output: null, reasoning: null, cachedInput: null }, 'no usage -> all null, never 0');
  assertEqual(none.modelMs, null, 'unmeasured modelMs stays null');

  [NaN, Infinity, -5, '100', undefined, null].forEach((bad) => {
    assertEqual(fixtureRow({ modelMs: bad }).modelMs, null, 'modelMs ' + String(bad) + ' -> null');
  });
  assertEqual(fixtureRow({ modelMs: 0 }).modelMs, 0, 'a measured 0 ms stays 0');
  assertEqual(fixtureRow({ modelRetried: true }).modelRetried, true, 'modelRetried true');
  assertEqual(fixtureRow({ modelRetried: 'yes' }).modelRetried, false, 'non-boolean modelRetried -> false');
  assertEqual(fixtureRow({ iteration: 1.5 }).iteration, null, 'non-integer iteration -> null');
  assertEqual(fixtureRow({ requestedModel: 'm'.repeat(300) }).requestedModel.length, 128, 'requestedModel capped at 128 chars');

  const unknownWithTicks = buildIterationTimingRow({
    iteration: 1, startedAt: 1, modelMs: 10, usage: readProviderUsage(xaiFixture, 'xai'),
    estimate: estimateCostDetailed('totally-unknown-model', readProviderUsage(xaiFixture, 'xai'), 'xai'),
    requestedModel: 'totally-unknown-model', provider: 'xai'
  });
  assertEqual(unknownWithTicks.costSource, 'provider', 'provider cost still wins for an unpriced model');
  assertEqual(unknownWithTicks.estimateDeltaPct, null, 'no estimate -> no delta');
  assertEqual(unknownWithTicks.pricingKey, null, 'unpriced model keeps pricingKey null');

  const freeProvider = buildIterationTimingRow({
    iteration: 1, usage: { input: 5, output: 5, usageSource: 'provider', providerCostUsd: 0 },
    estimate: { usd: 0.01, source: 'estimate', pricingKey: 'grok-4.3' }
  });
  assertEqual(freeProvider.costUsd, 0, 'a provider-reported $0 is kept');
  assertEqual(freeProvider.costSource, 'provider', 'provider-reported $0 -> provider');
  assertEqual(freeProvider.estimateDeltaPct, null, 'provider $0 -> no delta (no division by zero)');

  const empty = buildIterationTimingRow(undefined);
  assertEqual(empty.v, 1, 'missing fields still build a v1 row');
  assertEqual(empty.costSource, 'unavailable', 'missing fields -> unavailable');
  assertEqual(empty.iteration, null, 'missing iteration -> null');
});

section('appendIterationTiming: rows, summary totals and sources', () => {
  const session = {};
  const r1 = fixtureRow({ iteration: 1 });
  const stored = appendIterationTiming(session, r1);
  assert(stored === r1, 'returns the stored row object');
  assert(Array.isArray(session.iterationTiming) && session.iterationTiming[0] === r1, 'row stored on session.iterationTiming');
  const s = session.measurementSummary;
  assertDeepEqual(Object.keys(s), [
    'v', 'iterations', 'modelMsTotal', 'toolMsTotal', 'toolCount', 'usage', 'usageIterations',
    'usageSource', 'costUsd', 'costIterations', 'costSource', 'requestedModel', 'servedModels'
  ], 'summary carries exactly the v1 contract keys');
  assertEqual(s.v, 1, 'summary v = 1');
  assertEqual(s.iterations, 1, 'one iteration');
  assertEqual(s.modelMsTotal, 2150, 'modelMsTotal');
  assertEqual(s.toolMsTotal, null, 'toolMsTotal null until the first measured tool');
  assertEqual(s.toolCount, 0, 'toolCount 0');
  assertDeepEqual(s.usage, { input: 12000, output: 350, reasoning: 420, cachedInput: 8000 }, 'usage totals');
  assertEqual(s.usageIterations, 1, 'usageIterations');
  assertEqual(s.usageSource, 'provider', 'all-provider usage -> provider');
  assertEqual(s.costUsd, 0.008525, 'costUsd total');
  assertEqual(s.costIterations, 1, 'costIterations');
  assertEqual(s.costSource, 'provider', 'all-provider cost -> provider');
  assertEqual(s.requestedModel, 'grok-4.3', 'requestedModel');
  assertDeepEqual(s.servedModels, ['grok-4.3'], 'servedModels');

  appendIterationTiming(session, fixtureRow({ iteration: 2, modelMs: 850 }));
  assertEqual(s.iterations, 2, 'two iterations');
  assertEqual(s.modelMsTotal, 3000, 'modelMsTotal sums');
  assertEqual(s.usage.input, 24000, 'input sums');
  assertClose(s.costUsd, 0.01705, 'provider cost sums', 1e-12);
  assertEqual(s.costSource, 'provider', 'still provider');
  assertDeepEqual(s.servedModels, ['grok-4.3'], 'served models are distinct');

  appendIterationTiming(session, openaiRow(3, 1000, 100));
  assertEqual(s.costSource, 'mixed', 'provider + estimate -> mixed');
  assertEqual(s.usageSource, 'provider', 'all rows had provider usage');
  assertEqual(s.costIterations, 3, 'three priced iterations');

  appendIterationTiming(session, unavailableRow(4));
  assertEqual(s.usageSource, 'mixed', 'provider + unavailable usage -> mixed');
  assertEqual(s.usageIterations, 3, 'usageIterations counts provider rows only');
  assertEqual(s.costIterations, 3, 'costIterations skips the unavailable row');
  assertEqual(s.modelMsTotal, 3100, 'null modelMs does not change the total');
  assertEqual(s.requestedModel, 'totally-unknown-model', 'requestedModel tracks the latest requested model');

  const estimates = {};
  appendIterationTiming(estimates, openaiRow(1, 10, 10));
  appendIterationTiming(estimates, openaiRow(2, 10, 10));
  assertEqual(estimates.measurementSummary.costSource, 'estimate', 'all-estimate rows -> estimate');

  const unavailable = {};
  appendIterationTiming(unavailable, unavailableRow(1));
  appendIterationTiming(unavailable, unavailableRow(2));
  assertEqual(unavailable.measurementSummary.costSource, 'unavailable', 'all-unavailable cost -> unavailable');
  assertEqual(unavailable.measurementSummary.usageSource, 'unavailable', 'all-unavailable usage -> unavailable');
  assertEqual(unavailable.measurementSummary.costUsd, null, 'cost total stays null, never 0');
  assertEqual(unavailable.measurementSummary.modelMsTotal, null, 'modelMsTotal stays null, never 0');
  assertDeepEqual(unavailable.measurementSummary.usage, { input: null, output: null, reasoning: null, cachedInput: null },
    'usage totals stay null, never 0');
});

section('appendIterationTiming: cap, served-model bound and bad inputs', () => {
  const session = {};
  for (let i = 1; i <= 150; i++) appendIterationTiming(session, fixtureRow({ iteration: i, modelMs: 10 }));
  assertEqual(session.iterationTiming.length, 100, 'default cap keeps the last 100 rows');
  assertEqual(session.iterationTiming[0].iteration, 51, 'oldest rows are dropped first');
  assertEqual(session.iterationTiming[99].iteration, 150, 'newest row kept');
  assertEqual(session.measurementSummary.iterations, 150, 'summary counts every appended row');
  assertEqual(session.measurementSummary.modelMsTotal, 1500, 'summary totals cover every appended row');

  const small = {};
  for (let i = 1; i <= 8; i++) appendIterationTiming(small, fixtureRow({ iteration: i }), 5);
  assertDeepEqual(small.iterationTiming.map((row) => row.iteration), [4, 5, 6, 7, 8], 'custom cap keeps the last cap rows');
  [0, -1, NaN, 'x', 2.5].forEach((badCap) => {
    const target = {};
    for (let i = 1; i <= 102; i++) appendIterationTiming(target, fixtureRow({ iteration: i }), badCap);
    assertEqual(target.iterationTiming.length, 100, 'invalid cap ' + String(badCap) + ' falls back to 100');
  });

  const served = {};
  for (let i = 1; i <= 12; i++) {
    const usage = Object.assign(readProviderUsage(xaiFixture, 'xai'), { servedModel: 'served-' + i });
    appendIterationTiming(served, buildIterationTimingRow({ iteration: i, usage: usage, estimate: null, requestedModel: 'grok-4.3', provider: 'xai' }));
  }
  assertEqual(served.measurementSummary.servedModels.length, 10, 'servedModels holds at most 10 strings');

  assertEqual(appendIterationTiming(null, fixtureRow()), null, 'null session -> null, no throw');
  const untouched = {};
  assertEqual(appendIterationTiming(untouched, null), null, 'null row -> null, no throw');
  assertEqual(untouched.iterationTiming, undefined, 'null row leaves the session untouched');
  const notArray = { iterationTiming: 'corrupt', measurementSummary: { v: 2 } };
  appendIterationTiming(notArray, fixtureRow({ iteration: 1 }));
  assert(Array.isArray(notArray.iterationTiming) && notArray.iterationTiming.length === 1, 'non-array iterationTiming is replaced');
  assertEqual(notArray.measurementSummary.v, 1, 'non-v1 summary is re-initialised');
  assertEqual(notArray.measurementSummary.iterations, 1, 're-initialised summary counts the new row');
});

section('addIterationToolTime: measured tools only', () => {
  const session = {};
  const row = appendIterationTiming(session, fixtureRow({ iteration: 1 }));
  assertEqual(addIterationToolTime(session, row, 412), true, 'returns true when recorded');
  assertEqual(row.toolMs, 412, 'toolMs null -> 412');
  assertEqual(row.toolCount, 1, 'toolCount 0 -> 1');
  assertEqual(session.measurementSummary.toolMsTotal, 412, 'summary toolMsTotal');
  assertEqual(session.measurementSummary.toolCount, 1, 'summary toolCount');
  addIterationToolTime(session, row, 88);
  assertEqual(row.toolMs, 500, 'second tool adds to toolMs');
  assertEqual(row.toolCount, 2, 'second tool increments toolCount');
  assertEqual(session.iterationTiming[0].toolMs, 500, 'stored row updated');
  const row2 = appendIterationTiming(session, fixtureRow({ iteration: 2 }));
  addIterationToolTime(session, row2, 10);
  assertEqual(session.measurementSummary.toolMsTotal, 510, 'summary totals span rows');
  assertEqual(session.measurementSummary.toolCount, 3, 'summary toolCount spans rows');
  addIterationToolTime(session, row2, 0);
  assertEqual(row2.toolMs, 10, 'a measured 0 ms tool adds 0');
  assertEqual(row2.toolCount, 2, 'a measured 0 ms tool still counts');

  const before = JSON.stringify(session);
  [NaN, -1, Infinity, '100', null, undefined].forEach((bad) => {
    assertEqual(addIterationToolTime(session, row, bad), false, 'duration ' + String(bad) + ' is rejected');
  });
  assertEqual(addIterationToolTime(session, null, 100), false, 'null row is rejected');
  assertEqual(addIterationToolTime(null, null, 5), false, 'null session and row are rejected');
  assertEqual(JSON.stringify(session), before, 'bad inputs change nothing');
});

section('Stored measurement keys avoid "token" and "stepName"', () => {
  const session = {};
  const row = appendIterationTiming(session, fixtureRow({ iteration: 1 }));
  addIterationToolTime(session, row, 25);
  const keys = collectKeys(row, []).concat(collectKeys(session.measurementSummary, []));
  assert(keys.length > 20, 'scanned row and summary keys (' + keys.length + ')');
  assert(keys.every((key) => !/token/i.test(key)), 'no key matches /token/i');
  assert(keys.every((key) => key !== 'stepName'), 'no key is named stepName');
  assertDeepEqual(JSON.parse(JSON.stringify(session.measurementSummary)), session.measurementSummary, 'summary is JSON-safe');
});

// --- exports check --------------------------------------------------------

console.log('\n--- exports check ---');
assert(typeof MODEL_PRICING === 'object', 'exports MODEL_PRICING');
assert(typeof estimateCost === 'function', 'exports estimateCost');
assert(typeof CostTracker === 'function', 'exports CostTracker');
assert(typeof resolvePricingKey === 'function', 'exports resolvePricingKey');
assert(typeof readProviderUsage === 'function', 'exports readProviderUsage');
assert(typeof estimateCostDetailed === 'function', 'exports estimateCostDetailed');
assert(typeof buildIterationTimingRow === 'function', 'exports buildIterationTimingRow');
assert(typeof appendIterationTiming === 'function', 'exports appendIterationTiming');
assert(typeof addIterationToolTime === 'function', 'exports addIterationToolTime');
assert(typeof XAI_TICKS_PER_USD === 'number', 'exports XAI_TICKS_PER_USD');
assert(typeof LEGACY_UNKNOWN_MODEL_PRICING === 'object' && LEGACY_UNKNOWN_MODEL_PRICING !== null, 'exports LEGACY_UNKNOWN_MODEL_PRICING');

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
