/**
 * Cost Tracker -- model pricing, cost estimation, and per-session budget enforcement.
 *
 * Extracted from agent-loop.js (MODEL_PRICING, estimateCost) with a new
 * CostTracker class for cumulative cost tracking and budget checking.
 *
 * Mirrors Claude Code's cost_tracker.py pattern adapted for Chrome MV3.
 *
 * Phase 66 (MEAS-01, D-10/D-11) adds provider-first usage and cost readers and
 * the per-iteration measurement helpers that agent-loop.js calls. They are
 * pure, never throw on a malformed provider body, and report an unmeasured
 * value as null rather than 0.
 *
 * @module cost-tracker
 */

'use strict';

// ---------------------------------------------------------------------------
// Model pricing per 1M tokens (input / output)
// ---------------------------------------------------------------------------

/**
 * Pricing per 1M tokens (input / output) by model name.
 * Originally mirrored the background.js analytics calculateCost table. Since
 * Phase 66 the Grok rows here follow the xAI retirement below; the dashboard
 * tables (background.js, utils/analytics.js) move with the deferred
 * default-model fix.
 *
 * xAI rows, verified 2026-09-29 against
 * https://docs.x.ai/developers/migration/may-15-retirement and
 * https://docs.x.ai/developers/pricing: the retirement took effect May 15,
 * 2026 12:00 PT. grok-4-1-fast-*, grok-4-fast-*, grok-4-0709 and grok-3 are
 * now served by grok-4.3 and bill at its rates; grok-code-fast-1 is served by
 * grok-build-0.1. Prices are the <200k-token context tier (the 200k+ tier
 * doubles them and is not modelled, nor is the cached-input discount).
 * These rows are a labelled estimate: provider-reported cost is authoritative
 * (D-10). The exact grok-4.3 rows come first because the substring match
 * walks keys in insertion order, where 'grok-4.3' would otherwise hit the
 * legacy 'grok-4' row.
 * @type {Object.<string, {input: number, output: number}>}
 */
var MODEL_PRICING = {
  // xAI current models (exact rows first; see above)
  'grok-4.3':                       { input: 1.25, output: 2.50 },
  'grok-4.3-latest':                { input: 1.25, output: 2.50 },
  'grok-build-0.1':                 { input: 1.00, output: 2.00 },
  // xAI earlier slugs (retired ones bill at the model that now serves them)
  'grok-4-0709':                    { input: 1.25, output: 2.50 },
  'grok-4-1-fast-reasoning':        { input: 1.25, output: 2.50 },
  'grok-4-1-fast-non-reasoning':    { input: 1.25, output: 2.50 },
  'grok-4-fast-reasoning':          { input: 1.25, output: 2.50 },
  'grok-4-fast-non-reasoning':      { input: 1.25, output: 2.50 },
  'grok-code-fast-1':               { input: 1.00, output: 2.00 },
  'grok-3':                         { input: 1.25, output: 2.50 },
  'grok-3-mini':                    { input: 0.30, output: 0.50 },
  // xAI Legacy
  'grok-4-1-fast':                  { input: 1.25, output: 2.50 },
  'grok-4-1':                       { input: 3.00, output: 15.00 },
  'grok-4':                         { input: 3.00, output: 15.00 },
  'grok-4-fast':                    { input: 3.00, output: 15.00 },
  'grok-3-fast':                    { input: 0.50, output: 2.50 },
  'grok-3-mini-beta':               { input: 0.30, output: 0.50 },
  'grok-3-mini-fast-beta':          { input: 0.20, output: 0.50 },
  // OpenAI
  'gpt-4o':                         { input: 2.50, output: 10.00 },
  'gpt-4o-mini':                    { input: 0.15, output: 0.60 },
  'chatgpt-4o-latest':              { input: 2.50, output: 10.00 },
  'gpt-4-turbo':                    { input: 10.00, output: 30.00 },
  // Anthropic
  'claude-sonnet-4-5-20250514':     { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20250514':      { input: 1.00, output: 5.00 },
  'claude-opus-4-1-20250414':       { input: 15.00, output: 75.00 },
  // Gemini
  'gemini-2.5-flash':               { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite':          { input: 0.10, output: 0.40 },
  'gemini-2.5-pro':                 { input: 1.25, output: 10.00 },
  'gemini-2.0-flash':               { input: 0.00, output: 0.00 }
};

/**
 * Pre-Phase-66 display fallback for models missing from MODEL_PRICING, frozen
 * at the old $0.20/$0.50 rate and decoupled from the Grok rows, so the
 * retirement repricing leaves legacy totals for unknown models where they
 * were. Measurement records never use it: estimateCostDetailed reports an
 * unknown model as 'unavailable' (D-10).
 * @type {{input: number, output: number}}
 */
var LEGACY_UNKNOWN_MODEL_PRICING = Object.freeze({ input: 0.20, output: 0.50 });

/**
 * xAI reports usage.cost_in_usd_ticks on every response; 1e10 ticks = $1
 * (https://docs.x.ai/developers/cost-tracking).
 * @type {number}
 */
var XAI_TICKS_PER_USD = 1e10;

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

/**
 * Resolve the MODEL_PRICING key for a model name: the exact key first, then
 * the first key (in insertion order) that the lower-cased name starts with or
 * contains. Only own keys count, so prototype names never resolve.
 * @param {string} model - Model name as requested or served
 * @returns {string|null} The pricing key, or null when nothing matches
 */
function resolvePricingKey(model) {
  if (typeof model !== 'string' || model === '') return null;
  if (Object.prototype.hasOwnProperty.call(MODEL_PRICING, model)) return model;
  var modelLower = model.toLowerCase();
  for (var key in MODEL_PRICING) {
    if (!Object.prototype.hasOwnProperty.call(MODEL_PRICING, key)) continue;
    if (modelLower.startsWith(key) || modelLower.includes(key)) {
      return key;
    }
  }
  return null;
}

/**
 * Estimate cost for an API call based on token usage.
 * Legacy numeric estimate behind session.totalCost and CostTracker; unknown
 * models use LEGACY_UNKNOWN_MODEL_PRICING. Labelled measurement records use
 * estimateCostDetailed instead.
 * @param {string} model - Model name (e.g. 'grok-4-1-fast')
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {string} [provider] - Provider key (used for local free providers)
 * @returns {number} Estimated cost in USD
 */
function estimateCost(model, inputTokens, outputTokens, provider) {
  if ((provider || '').toLowerCase() === 'lmstudio') {
    return 0;
  }

  // Exact match first, then prefix/substring match for versioned model names
  var pricingKey = resolvePricingKey(model);
  var pricing = pricingKey ? MODEL_PRICING[pricingKey] : LEGACY_UNKNOWN_MODEL_PRICING;

  var inputCost = (inputTokens / 1000000) * pricing.input;
  var outputCost = (outputTokens / 1000000) * pricing.output;
  return inputCost + outputCost;
}

// ---------------------------------------------------------------------------
// CostTracker class
// ---------------------------------------------------------------------------

/**
 * Per-session cost accumulator with budget enforcement.
 *
 * Tracks cumulative cost across all API calls in a session and provides
 * a checkBudget() method to determine if the session has exceeded its
 * cost limit.
 *
 * Uses function/prototype pattern for importScripts compatibility.
 *
 * @param {number} [costLimit=2.00] - Maximum allowed session cost in USD.
 * @constructor
 */
function CostTracker(costLimit) {
  this.totalCost = 0;
  this.totalInputTokens = 0;
  this.totalOutputTokens = 0;
  this.callCount = 0;
  this.costLimit = costLimit || 2.00;
}

/**
 * Record an API call's token usage and accumulate cost.
 *
 * @param {string} model - Model name used for the call.
 * @param {number} inputTokens - Number of input tokens consumed.
 * @param {number} outputTokens - Number of output tokens produced.
 * @param {string} [provider] - Provider key used for the call.
 * @returns {number} Cost of this individual call in USD.
 */
CostTracker.prototype.record = function(model, inputTokens, outputTokens, provider) {
  var cost = estimateCost(model, inputTokens, outputTokens, provider);
  this.totalCost += cost;
  this.totalInputTokens += (inputTokens || 0);
  this.totalOutputTokens += (outputTokens || 0);
  this.callCount += 1;
  return cost;
};

/**
 * Check whether the session has exceeded its cost budget.
 *
 * Phase 231: cost-limit enforcement DISABLED per operator request — only the
 * iteration limit (and time limit) gate sessions now. The CostTracker continues
 * to record totals and per-call costs for analytics/display, but checkBudget
 * always returns exceeded=false so cost no longer terminates a session.
 * The costLimit field is preserved for backward-compat read paths and analytics.
 *
 * @returns {{exceeded: boolean, totalCost: number, costLimit: number, reason: string|null}}
 */
CostTracker.prototype.checkBudget = function() {
  return { exceeded: false, totalCost: this.totalCost, costLimit: this.costLimit, reason: null };
};

/**
 * Serialize tracker state for persistence or logging.
 *
 * @returns {{totalCost: number, totalInputTokens: number, totalOutputTokens: number, callCount: number, costLimit: number}}
 */
CostTracker.prototype.toJSON = function() {
  return {
    totalCost: this.totalCost,
    totalInputTokens: this.totalInputTokens,
    totalOutputTokens: this.totalOutputTokens,
    callCount: this.callCount,
    costLimit: this.costLimit
  };
};

// ---------------------------------------------------------------------------
// Phase 66 measurement: provider-first usage/cost and per-iteration rows
// ---------------------------------------------------------------------------
//
// Row and summary key names never contain "token" (the MCP dispatcher's
// secret filter drops /token/i keys) and never use the name reserved for the
// lattice step literals in agent-loop.js. Unmeasured values are null, never 0.

/** @private A finite, non-negative number, else null. */
function _ctNonNegativeOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** @private A plain (non-array) object. */
function _ctIsPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** @private A non-empty string cut to `max` characters, else null. */
function _ctModelNameOrNull(value, max) {
  if (typeof value !== 'string' || value === '') return null;
  var limit = max || 128;
  return value.length > limit ? value.slice(0, limit) : value;
}

/** @private Add a finite, non-negative value to a total that starts as null. */
function _ctAddOrNull(total, value) {
  var add = _ctNonNegativeOrNull(value);
  if (add === null) return total;
  return _ctNonNegativeOrNull(total) === null ? add : total + add;
}

/** @private A fresh v1 measurement summary with nothing measured yet. */
function _ctNewMeasurementSummary() {
  return {
    v: 1,
    iterations: 0,
    modelMsTotal: null,
    toolMsTotal: null,
    toolCount: 0,
    usage: { input: null, output: null, reasoning: null, cachedInput: null },
    usageIterations: 0,
    usageSource: 'unavailable',
    costUsd: null,
    costIterations: 0,
    costSource: 'unavailable',
    requestedModel: null,
    servedModels: []
  };
}

/**
 * Read provider-reported usage, and cost where the provider reports one, from
 * a raw (non-streaming) chat response. Missing, non-finite or negative values
 * are null (D-05/D-10).
 *
 * Shapes mirror tool-use-adapter.js extractUsage:
 *   anthropic: usage.input_tokens / output_tokens / cache_read_input_tokens
 *   gemini:    usageMetadata.promptTokenCount / candidatesTokenCount /
 *              thoughtsTokenCount / cachedContentTokenCount (modelVersion)
 *   default (xai, openai, openrouter, custom, lmstudio): usage.prompt_tokens /
 *              completion_tokens / completion_tokens_details.reasoning_tokens /
 *              prompt_tokens_details.cached_tokens
 * Provider cost: xai usage.cost_in_usd_ticks / XAI_TICKS_PER_USD; openrouter
 * usage.cost (USD).
 *
 * @param {Object} response - Raw provider response body
 * @param {string} providerKey - Provider key (e.g. 'xai')
 * @returns {{input: number|null, output: number|null, reasoning: number|null,
 *   cachedInput: number|null, providerCostUsd: number|null,
 *   usageSource: 'provider'|'unavailable', servedModel: string|null}}
 */
function readProviderUsage(response, providerKey) {
  var result = {
    input: null,
    output: null,
    reasoning: null,
    cachedInput: null,
    providerCostUsd: null,
    usageSource: 'unavailable',
    servedModel: null
  };
  if (!_ctIsPlainObject(response)) return result;
  try {
    var provider = typeof providerKey === 'string' ? providerKey.toLowerCase() : '';
    var servedModel = _ctModelNameOrNull(response.model, 128);
    if (servedModel === null && provider === 'gemini') {
      servedModel = _ctModelNameOrNull(response.modelVersion, 128);
    }
    var input = null;
    var output = null;
    var reasoning = null;
    var cachedInput = null;
    var providerCostUsd = null;
    if (provider === 'anthropic') {
      var anthropicUsage = _ctIsPlainObject(response.usage) ? response.usage : {};
      input = _ctNonNegativeOrNull(anthropicUsage.input_tokens);
      output = _ctNonNegativeOrNull(anthropicUsage.output_tokens);
      cachedInput = _ctNonNegativeOrNull(anthropicUsage.cache_read_input_tokens);
    } else if (provider === 'gemini') {
      var geminiUsage = _ctIsPlainObject(response.usageMetadata) ? response.usageMetadata : {};
      input = _ctNonNegativeOrNull(geminiUsage.promptTokenCount);
      output = _ctNonNegativeOrNull(geminiUsage.candidatesTokenCount);
      reasoning = _ctNonNegativeOrNull(geminiUsage.thoughtsTokenCount);
      cachedInput = _ctNonNegativeOrNull(geminiUsage.cachedContentTokenCount);
    } else {
      var usage = _ctIsPlainObject(response.usage) ? response.usage : {};
      input = _ctNonNegativeOrNull(usage.prompt_tokens);
      output = _ctNonNegativeOrNull(usage.completion_tokens);
      reasoning = _ctIsPlainObject(usage.completion_tokens_details)
        ? _ctNonNegativeOrNull(usage.completion_tokens_details.reasoning_tokens)
        : null;
      cachedInput = _ctIsPlainObject(usage.prompt_tokens_details)
        ? _ctNonNegativeOrNull(usage.prompt_tokens_details.cached_tokens)
        : null;
      if (provider === 'xai') {
        var ticks = _ctNonNegativeOrNull(usage.cost_in_usd_ticks);
        providerCostUsd = ticks === null ? null : ticks / XAI_TICKS_PER_USD;
      } else if (provider === 'openrouter') {
        providerCostUsd = _ctNonNegativeOrNull(usage.cost);
      }
    }
    result.input = input;
    result.output = output;
    result.reasoning = reasoning;
    result.cachedInput = cachedInput;
    result.providerCostUsd = providerCostUsd;
    result.usageSource = (input !== null || output !== null) ? 'provider' : 'unavailable';
    result.servedModel = servedModel;
  } catch (_e) {
    // A body that cannot be read is simply unmeasured (result stays all-null).
  }
  return result;
}

/**
 * Labelled price-table estimate. An unknown model, or missing input/output
 * usage, is 'unavailable' with usd null: never priced as Grok (D-10).
 * Reasoning is billed at the output rate only where the provider reports it
 * outside the output count (xai, gemini); OpenAI-compatible and Anthropic
 * output counts already include it.
 *
 * @param {string} model - Requested model name
 * @param {{input: number|null, output: number|null, reasoning: number|null}} usage
 * @param {string} provider - Provider key
 * @returns {{usd: number|null, source: 'estimate'|'unavailable',
 *   pricingKey: string|null, reasoningBilled: boolean}}
 */
function estimateCostDetailed(model, usage, provider) {
  var providerLower = typeof provider === 'string' ? provider.toLowerCase() : '';
  if (providerLower === 'lmstudio') {
    return { usd: 0, source: 'estimate', pricingKey: 'lmstudio-local', reasoningBilled: false };
  }
  var pricingKey = resolvePricingKey(model);
  var counts = _ctIsPlainObject(usage) ? usage : {};
  var input = _ctNonNegativeOrNull(counts.input);
  var output = _ctNonNegativeOrNull(counts.output);
  if (pricingKey === null || input === null || output === null) {
    return { usd: null, source: 'unavailable', pricingKey: pricingKey, reasoningBilled: false };
  }
  var reasoning = _ctNonNegativeOrNull(counts.reasoning);
  var reasoningBilled = reasoning !== null && (providerLower === 'xai' || providerLower === 'gemini');
  var pricing = MODEL_PRICING[pricingKey];
  var billedOutput = output + (reasoningBilled ? reasoning : 0);
  return {
    usd: (input / 1000000) * pricing.input + (billedOutput / 1000000) * pricing.output,
    source: 'estimate',
    pricingKey: pricingKey,
    reasoningBilled: reasoningBilled
  };
}

/**
 * Build one flat per-iteration measurement row (contract v1, projected by
 * get_session_detail). Provider cost wins over the estimate, and
 * estimateDeltaPct = round4((estimate - provider) / provider) records how far
 * the estimate drifts. toolMs stays null until the first measured tool
 * (addIterationToolTime).
 *
 * @param {{iteration: number, startedAt: number, modelMs: number|null,
 *   modelRetried: boolean, usage: Object, estimate: Object,
 *   requestedModel: string, provider: string}} fields
 * @returns {Object} The v1 row
 */
function buildIterationTimingRow(fields) {
  var f = _ctIsPlainObject(fields) ? fields : {};
  var u = _ctIsPlainObject(f.usage) ? f.usage : {};
  var est = _ctIsPlainObject(f.estimate) ? f.estimate : {};
  var usage = {
    input: _ctNonNegativeOrNull(u.input),
    output: _ctNonNegativeOrNull(u.output),
    reasoning: _ctNonNegativeOrNull(u.reasoning),
    cachedInput: _ctNonNegativeOrNull(u.cachedInput)
  };
  var usageSource = (u.usageSource === 'provider' && (usage.input !== null || usage.output !== null))
    ? 'provider'
    : 'unavailable';
  var providerCostUsd = _ctNonNegativeOrNull(u.providerCostUsd);
  var estimateUsd = est.source === 'estimate' ? _ctNonNegativeOrNull(est.usd) : null;
  var costUsd = null;
  var costSource = 'unavailable';
  if (providerCostUsd !== null) {
    costUsd = providerCostUsd;
    costSource = 'provider';
  } else if (estimateUsd !== null) {
    costUsd = estimateUsd;
    costSource = 'estimate';
  }
  var estimateDeltaPct = (providerCostUsd !== null && providerCostUsd > 0 && estimateUsd !== null)
    ? Math.round(((estimateUsd - providerCostUsd) / providerCostUsd) * 10000) / 10000
    : null;
  return {
    v: 1,
    iteration: Number.isSafeInteger(f.iteration) && f.iteration >= 0 ? f.iteration : null,
    startedAt: _ctNonNegativeOrNull(f.startedAt),
    modelMs: _ctNonNegativeOrNull(f.modelMs),
    modelRetried: f.modelRetried === true,
    toolMs: null,
    toolCount: 0,
    usage: usage,
    usageSource: usageSource,
    costUsd: costUsd,
    costSource: costSource,
    estimateUsd: estimateUsd,
    estimateDeltaPct: estimateDeltaPct,
    pricingKey: _ctModelNameOrNull(est.pricingKey, 128),
    requestedModel: _ctModelNameOrNull(f.requestedModel, 128),
    servedModel: _ctModelNameOrNull(u.servedModel, 128),
    provider: _ctModelNameOrNull(f.provider, 64)
  };
}

/**
 * Append a row to session.iterationTiming (the last `cap` rows are kept,
 * default 100) and fold it into session.measurementSummary, whose totals
 * cover every appended row. A summary source is the rows' shared source, or
 * 'mixed' once they differ. Totals stay null until the first finite value.
 *
 * @param {Object} session - Live autopilot session
 * @param {Object} row - Row from buildIterationTimingRow
 * @param {number} [cap=100] - Rows kept on the session
 * @returns {Object|null} The stored row object, or null for unusable inputs
 */
function appendIterationTiming(session, row, cap) {
  if (!_ctIsPlainObject(session) || !_ctIsPlainObject(row)) return null;
  var limit = Number.isSafeInteger(cap) && cap > 0 ? cap : 100;
  if (!Array.isArray(session.iterationTiming)) session.iterationTiming = [];
  session.iterationTiming.push(row);
  if (session.iterationTiming.length > limit) {
    session.iterationTiming.splice(0, session.iterationTiming.length - limit);
  }

  var summary = session.measurementSummary;
  if (!_ctIsPlainObject(summary) || summary.v !== 1) {
    summary = _ctNewMeasurementSummary();
    session.measurementSummary = summary;
  }
  if (!_ctIsPlainObject(summary.usage)) {
    summary.usage = { input: null, output: null, reasoning: null, cachedInput: null };
  }
  if (!Array.isArray(summary.servedModels)) summary.servedModels = [];

  var first = !(Number.isSafeInteger(summary.iterations) && summary.iterations > 0);
  summary.iterations = (first ? 0 : summary.iterations) + 1;
  summary.modelMsTotal = _ctAddOrNull(summary.modelMsTotal, row.modelMs);
  if (_ctNonNegativeOrNull(row.toolMs) !== null) {
    summary.toolMsTotal = _ctAddOrNull(summary.toolMsTotal, row.toolMs);
    summary.toolCount = (Number.isSafeInteger(summary.toolCount) && summary.toolCount >= 0 ? summary.toolCount : 0)
      + (Number.isSafeInteger(row.toolCount) && row.toolCount > 0 ? row.toolCount : 0);
  }

  var rowUsage = _ctIsPlainObject(row.usage) ? row.usage : {};
  summary.usage.input = _ctAddOrNull(summary.usage.input, rowUsage.input);
  summary.usage.output = _ctAddOrNull(summary.usage.output, rowUsage.output);
  summary.usage.reasoning = _ctAddOrNull(summary.usage.reasoning, rowUsage.reasoning);
  summary.usage.cachedInput = _ctAddOrNull(summary.usage.cachedInput, rowUsage.cachedInput);
  var rowUsageSource = row.usageSource === 'provider' ? 'provider' : 'unavailable';
  if (rowUsageSource === 'provider') {
    summary.usageIterations = (Number.isSafeInteger(summary.usageIterations) ? summary.usageIterations : 0) + 1;
  }
  summary.usageSource = (first || summary.usageSource === rowUsageSource) ? rowUsageSource : 'mixed';

  var rowCost = _ctNonNegativeOrNull(row.costUsd);
  var rowCostSource = (rowCost !== null && (row.costSource === 'provider' || row.costSource === 'estimate'))
    ? row.costSource
    : 'unavailable';
  if (rowCostSource !== 'unavailable') {
    summary.costUsd = _ctAddOrNull(summary.costUsd, rowCost);
    summary.costIterations = (Number.isSafeInteger(summary.costIterations) ? summary.costIterations : 0) + 1;
  }
  summary.costSource = (first || summary.costSource === rowCostSource) ? rowCostSource : 'mixed';

  var requestedModel = _ctModelNameOrNull(row.requestedModel, 128);
  if (requestedModel !== null) summary.requestedModel = requestedModel;
  var servedModel = _ctModelNameOrNull(row.servedModel, 128);
  if (servedModel !== null && summary.servedModels.indexOf(servedModel) === -1 && summary.servedModels.length < 10) {
    summary.servedModels.push(servedModel);
  }
  return row;
}

/**
 * Add one executed tool's measured duration to its iteration row and to the
 * session summary. Bad inputs (no row, non-finite or negative duration)
 * change nothing and never throw.
 *
 * @param {Object} session - Live autopilot session
 * @param {Object} row - Row returned by appendIterationTiming
 * @param {number} durationMs - Measured tool time in ms
 * @returns {boolean} true when the time was recorded
 */
function addIterationToolTime(session, row, durationMs) {
  if (!_ctIsPlainObject(row)) return false;
  var ms = _ctNonNegativeOrNull(durationMs);
  if (ms === null) return false;
  try {
    row.toolMs = _ctAddOrNull(row.toolMs, ms);
    row.toolCount = (Number.isSafeInteger(row.toolCount) && row.toolCount >= 0 ? row.toolCount : 0) + 1;
    var summary = _ctIsPlainObject(session) ? session.measurementSummary : null;
    if (_ctIsPlainObject(summary) && summary.v === 1) {
      summary.toolMsTotal = _ctAddOrNull(summary.toolMsTotal, ms);
      summary.toolCount = (Number.isSafeInteger(summary.toolCount) && summary.toolCount >= 0 ? summary.toolCount : 0) + 1;
    }
    return true;
  } catch (_e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MODEL_PRICING: MODEL_PRICING,
    estimateCost: estimateCost,
    CostTracker: CostTracker,
    resolvePricingKey: resolvePricingKey,
    readProviderUsage: readProviderUsage,
    estimateCostDetailed: estimateCostDetailed,
    buildIterationTimingRow: buildIterationTimingRow,
    appendIterationTiming: appendIterationTiming,
    addIterationToolTime: addIterationToolTime,
    XAI_TICKS_PER_USD: XAI_TICKS_PER_USD,
    LEGACY_UNKNOWN_MODEL_PRICING: LEGACY_UNKNOWN_MODEL_PRICING
  };
}
