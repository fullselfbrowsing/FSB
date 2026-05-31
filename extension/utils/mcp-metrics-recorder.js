/**
 * MCP Metrics Recorder -- single fact-emission site for every resolved MCP
 * tool dispatch.
 *
 * Phase 271 / v0.9.69 anonymous telemetry. Hooked from try/finally blocks in
 * extension/ws/mcp-tool-dispatcher.js (`dispatchMcpToolRoute` lines 285-301 +
 * `dispatchMcpMessageRoute` lines 303-331). Each recordDispatch() appends ONE
 * row to chrome.storage.local.fsbUsageData -- the SAME storage key the existing
 * AI-provider analytics surface (extension/utils/analytics.js) writes to.
 *
 * The hero Control Panel surface (Total Tokens / Total Cost / Total Requests)
 * recomputes over ALL fsbUsageData rows regardless of `source` discriminator,
 * so MCP rows merge into the same numbers automatically with NO new UI section
 * (per CONTEXT decision D-04, strict merge).
 *
 * Allowlist of fields this module reads from `requestPayload`:
 *   - requestPayload.text -- ONLY its `.length` is read, for the type_text /
 *     insert_text token estimator. The literal string value is NEVER stored,
 *     forwarded, logged, or otherwise inspected.
 *
 * NEVER reads / persists: any of bodies, page DOM, request URLs, hrefs,
 * innerHTML/outerHTML, clipboard, cookie headers, Authorization headers, OR
 * any .value property of any DOM-like object. The static-grep CI gate at
 * tests/mcp-metrics-no-pii-leak.test.js fails the build if this module's
 * source code (comments stripped) contains any of those identifiers.
 *
 * Module surface (globalThis.fsbMcpMetricsRecorder):
 *   - recordDispatch(input) -> Promise<void>
 *       Appends one row; NEVER throws; broadcasts ANALYTICS_UPDATE.
 *   - MCP_TOOL_TOKEN_HEURISTICS  -- frozen const tool->{in,out,token_source}.
 *   - _estimateTokensForTool(tool, requestPayload) -- pure helper; test-only.
 *   - FSB_USAGE_DATA_KEY = 'fsbUsageData'
 *
 * Node CommonJS surface for the test harness mirrors the above plus
 * `_setStorageShim(shim)` so tests can inject a fake chrome.storage.local
 * without leaking to the global namespace.
 *
 * Pattern: function/prototype on globalThis (mirrors install-identity.js +
 * mcp-pricing.js). NO `class`, NO ES module syntax -- importScripts-compatible
 * in MV3 SW.
 *
 * @module extension/utils/mcp-metrics-recorder
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

var FSB_USAGE_DATA_KEY = 'fsbUsageData';

/**
 * Token-cost heuristic table per CONTEXT.md decision 1.
 *
 * These are deliberately coarse initial estimates. They will be tuned in
 * v0.9.70+ once Phase 273's server-side ingest has collected real per-tool
 * baselines. type_text / insert_text are NOT in the static table -- they
 * scale with payload length (see _estimateTokensForTool below); the floor
 * is Math.max(50, Math.ceil(textLength / 4)) per the OpenAI rule-of-thumb
 * of ~1 token per 4 English characters. ONLY the textLength integer is
 * read; the literal payload string is never inspected or persisted.
 *
 * Unknown tool names fall through to the {in: 100, out: 200,
 * token_source: 'unknown'} row -- the `unknown` discriminator lets
 * Phase 274's stats page surface dispatch counts for tools the heuristic
 * table does not yet cover.
 */
var MCP_TOOL_TOKEN_HEURISTICS = Object.freeze({
  // Click family
  'click':           { in: 50,  out: 30,   token_source: 'estimate' },
  'click_at':        { in: 50,  out: 30,   token_source: 'estimate' },
  'double_click':    { in: 50,  out: 30,   token_source: 'estimate' },
  'right_click':     { in: 50,  out: 30,   token_source: 'estimate' },
  'hover':           { in: 50,  out: 30,   token_source: 'estimate' },
  'press_enter':     { in: 50,  out: 30,   token_source: 'estimate' },
  'press_key':       { in: 50,  out: 30,   token_source: 'estimate' },

  // Navigation family
  'navigate':        { in: 50,  out: 30,   token_source: 'estimate' },
  'open_tab':        { in: 50,  out: 30,   token_source: 'estimate' },
  'switch_tab':      { in: 50,  out: 30,   token_source: 'estimate' },
  'go_back':         { in: 50,  out: 30,   token_source: 'estimate' },
  'go_forward':      { in: 50,  out: 30,   token_source: 'estimate' },
  'refresh':         { in: 50,  out: 30,   token_source: 'estimate' },

  // Read family
  'read_page':         { in: 80,  out: 2000, token_source: 'estimate' },
  'get_dom_snapshot':  { in: 100, out: 4000, token_source: 'estimate' },
  'get_text':          { in: 80,  out: 200,  token_source: 'estimate' },
  'get_attribute':     { in: 80,  out: 200,  token_source: 'estimate' },

  // Heavy
  'run_task':        { in: 200, out: 8000, token_source: 'estimate' },

  // Wait family
  'wait_for_element':  { in: 50, out: 30, token_source: 'estimate' },
  'wait_for_stable':   { in: 50, out: 30, token_source: 'estimate' },

  // Scroll family (explicit keys; NO prefix match per CONTEXT decision 1)
  'scroll':              { in: 50, out: 30, token_source: 'estimate' },
  'scroll_at':           { in: 50, out: 30, token_source: 'estimate' },
  'scroll_to_top':       { in: 50, out: 30, token_source: 'estimate' },
  'scroll_to_bottom':    { in: 50, out: 30, token_source: 'estimate' },
  'scroll_to_element':   { in: 50, out: 30, token_source: 'estimate' }, /* eslint-disable-line */

  // Sheet family
  'fill_sheet':      { in: 150, out: 500, token_source: 'estimate' },
  'read_sheet':      { in: 150, out: 500, token_source: 'estimate' }
});

// ---------------------------------------------------------------------------
// Token estimator
// ---------------------------------------------------------------------------

/**
 * Pure synchronous helper: given a tool name + the original request payload
 * object, return the estimated {tokens_in, tokens_out, token_source} triple.
 *
 * Special-case: type_text + insert_text scale with payload `text` length.
 * The function reads ONLY `payload.text.length` (an integer) and never
 * dereferences or stores the string value itself. Missing / non-string
 * text falls to the floor of 50 tokens.
 *
 * Unknown tool: {in: 100, out: 200, token_source: 'unknown'} so Phase 274
 * stats can surface uncategorised tool counts.
 *
 * @param {string} tool - The MCP tool name.
 * @param {object|null|undefined} requestPayload - The original payload.
 * @returns {{tokens_in:number, tokens_out:number, token_source:string}}
 */
function _estimateTokensForTool(tool, requestPayload) {
  // Special-case the two payload-length-scaled tools BEFORE table lookup.
  // ONLY the .length is consulted -- never the string value. The variable
  // name `textLength` is intentional: the no-pii grep allows `text.length`
  // but not `text` alone in source code (it would conflict with body fields
  // a future contributor might be tempted to add).
  if (tool === 'type_text' || tool === 'insert_text') {
    var raw = (requestPayload && typeof requestPayload.text === 'string') ? requestPayload.text : '';
    var textLength = raw.length;
    var estimated = Math.max(50, Math.ceil(textLength / 4));
    return { tokens_in: estimated, tokens_out: 30, token_source: 'estimate' };
  }

  var row = (tool && Object.prototype.hasOwnProperty.call(MCP_TOOL_TOKEN_HEURISTICS, tool))
    ? MCP_TOOL_TOKEN_HEURISTICS[tool]
    : null;

  if (row) {
    return { tokens_in: row.in, tokens_out: row.out, token_source: row.token_source };
  }

  // Unknown tool fallback. Discriminator 'unknown' lets the stats page
  // surface uncategorised tool counts; no fabricated estimate is implied.
  return { tokens_in: 100, tokens_out: 200, token_source: 'unknown' };
}

// ---------------------------------------------------------------------------
// Storage shim (test seam)
// ---------------------------------------------------------------------------

// Production code path: pass through chrome.storage.local directly. The Node
// test harness calls `_setStorageShim(fakeStorage)` to inject an in-memory
// {get, set} object so tests can capture writes without touching globalThis.
// Default to null until first use so the production path can lazy-bind to
// chrome at first call (avoids referencing chrome at module init -- the SW
// chrome global is reliable but Node-side tests benefit from late binding).
var _storageShim = null;

function _resolveStorage() {
  if (_storageShim) return _storageShim;
  if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local) {
    return chrome.storage.local;
  }
  return null;
}

function _setStorageShim(shim) {
  _storageShim = shim;
}

// ---------------------------------------------------------------------------
// recordDispatch
// ---------------------------------------------------------------------------

// Canonical UNKNOWN-pricing envelope (matches mcp-pricing.js _unknownEnvelope).
// Used when globalThis.fsbMcpPricing is unavailable (Node tests without the
// pricing module loaded, or SW startup race). Keeping the shape identical means
// the row schema is consistent regardless of pricing availability.
function _unknownPricingEnvelope() {
  return {
    cost: null,
    source: 'unknown',
    model_used: null,
    pricing_confidence: null,
    pricing_source_date: null
  };
}

// ---------------------------------------------------------------------------
// Concurrency lock for the fsbUsageData read-modify-write cycle.
// ---------------------------------------------------------------------------
//
// Two `recordDispatch` calls that fire close in time (both started before
// either has resolved its `storage.get -> arr.push -> storage.set` triple)
// race against each other: each reads the same prior array, pushes its
// own row onto that local snapshot, and writes back -- the second write
// overwrites the first row. The result is a silent row drop, which
// violates COST-05 ("no double count / no dropped row") and BEAT-04
// ("INSERT OR IGNORE dedup on retry") because rows that never reached
// storage cannot be aggregated by the next Phase 272 flush.
//
// Pattern mirrors `_flushLock` + `_withLock` in
// extension/utils/telemetry-collector.js lines 142-150. Each new caller
// chains onto the previous task; both branches of `.then(fn, fn)` route
// to the same handler so a rejection does not skip the next caller. The
// `.catch` on the assignment side keeps the chain alive for subsequent
// callers even if the in-flight task rejects -- the returned promise
// (handed to recordDispatch) still rejects, so the outer try/catch can
// log it.
//
// `_recordLock` / `_withRecordLock` are intentionally NOT exported -- they
// are private serialization machinery, not part of the public surface.
var _recordLock = Promise.resolve();

function _withRecordLock(fn) {
  var next = _recordLock.then(fn, fn);
  _recordLock = next.catch(function () { /* keep chain alive */ });
  return next;
}

/**
 * Record a single MCP tool dispatch.
 *
 * Called from a try/finally block in mcp-tool-dispatcher.js for BOTH success
 * AND failure paths. NEVER throws -- the entire body is wrapped in try/catch
 * so a recorder bug cannot alter the dispatcher's resolved value or thrown
 * error. The dispatcher itself further insulates this call inside its own
 * inner try/catch as defence in depth.
 *
 * Caller-supplied input shape (CONTEXT decision 3):
 *   {client, tool, requestPayload, response, success, dispatcher_route}
 *
 * `response` is intentionally NOT used by the row schema -- it is part of
 * the hook signature for forward-compat with future heuristics that might
 * consume metadata. The PII gate test asserts the recorder source contains
 * no references to response body / DOM / etc.
 *
 * Row schema written (CONTEXT decision 5 + reconciliation #2):
 *   - Canonical snake_case for Phase 272 TelemetryCollector consumption:
 *       source, client, tool, model, tokens_in, tokens_out, token_source,
 *       cost_usd, pricing_confidence, ts, dispatcher_route
 *   - Legacy camelCase aliases so the existing hero (getAllTimeStats) sums
 *     MCP contributions correctly without UI changes:
 *       inputTokens, outputTokens, cost (null cost_usd -> 0 alias),
 *       timestamp, success
 *
 * @param {object} input - The dispatch context.
 * @returns {Promise<void>}
 */
async function recordDispatch(input) {
  try {
    if (!input || typeof input !== 'object') return;

    var storage = _resolveStorage();
    if (!storage) {
      // No storage available -- silently no-op. Production SW always has
      // chrome.storage.local; this branch fires under Node when the test
      // harness forgets to inject a shim.
      return;
    }

    var clientLabel = (typeof input.client === 'string' && input.client.length > 0) ? input.client : 'unknown';
    var toolLabel = (typeof input.tool === 'string' && input.tool.length > 0) ? input.tool : 'unknown';
    // Phase 10 FINT-17 -- 'autopilot' route literal added for FSB autopilot
    // driver attribution. MCP-side routes 'tool' + 'message' preserved.
    var routeLabel = (input.dispatcher_route === 'tool' ||
                      input.dispatcher_route === 'message' ||
                      input.dispatcher_route === 'autopilot')
      ? input.dispatcher_route
      : null;

    // Token estimate -- pure synchronous lookup.
    var tokenEstimate = _estimateTokensForTool(toolLabel, input.requestPayload);

    // Pricing resolution -- synchronous call to Phase 270 module. NEVER
    // throws. When globalThis.fsbMcpPricing is unavailable (e.g. Node test
    // without the pricing module required), fall through to UNKNOWN.
    var priceResult;
    try {
      if (
        typeof globalThis !== 'undefined' &&
        globalThis.fsbMcpPricing &&
        typeof globalThis.fsbMcpPricing.estimateMcpCost === 'function'
      ) {
        priceResult = globalThis.fsbMcpPricing.estimateMcpCost({
          client: input.client || null,
          tokensIn: tokenEstimate.tokens_in,
          tokensOut: tokenEstimate.tokens_out
        });
      } else {
        priceResult = _unknownPricingEnvelope();
      }
    } catch (_pricingErr) {
      priceResult = _unknownPricingEnvelope();
    }

    // Defensive: pricing module always returns an object, but coerce to
    // UNKNOWN envelope if a future contributor breaks the contract.
    if (!priceResult || typeof priceResult !== 'object') {
      priceResult = _unknownPricingEnvelope();
    }

    var costUsd = (typeof priceResult.cost === 'number' && isFinite(priceResult.cost)) ? priceResult.cost : null;
    var modelUsed = (typeof priceResult.model_used === 'string' && priceResult.model_used.length > 0)
      ? priceResult.model_used
      : null;
    var pricingConfidence = (typeof priceResult.pricing_confidence === 'string' && priceResult.pricing_confidence.length > 0)
      ? priceResult.pricing_confidence
      : null;

    var now = Date.now();
    var successFlag = Boolean(input.success);
    var legacyCost = (costUsd === null) ? 0 : costUsd;

    // Assemble row -- both canonical snake_case keys (for Phase 272
    // telemetry) and camelCase aliases (for the existing hero). cost_usd
    // remains null when unknown (authoritative "uncounted" signal); the
    // camelCase `cost` alias floors to 0 so the hero sum stays correct
    // per D-10 (never invent a fake number).
    var row = {
      // Canonical CONTEXT shape
      source: 'mcp',
      client: clientLabel,
      tool: toolLabel,
      model: modelUsed,
      tokens_in: tokenEstimate.tokens_in,
      tokens_out: tokenEstimate.tokens_out,
      token_source: tokenEstimate.token_source,
      cost_usd: costUsd,
      pricing_confidence: pricingConfidence,
      ts: now,
      dispatcher_route: routeLabel,

      // Phase 10 FINT-18 -- driving-model attribution pass-through.
      // Autopilot rows carry { provider, model_id, reasoning_tokens? };
      // MCP rows omit -> coerced to undefined here so dashboards that
      // don't consume the field don't regress.
      drivingModel: (input.drivingModel && typeof input.drivingModel === 'object')
        ? input.drivingModel
        : undefined,

      // Legacy camelCase aliases for hero compatibility (reconciliation #2)
      inputTokens: tokenEstimate.tokens_in,
      outputTokens: tokenEstimate.tokens_out,
      cost: legacyCost,
      timestamp: now,
      success: successFlag
    };

    // Append to fsbUsageData. Use get->push->set so existing AI-provider
    // rows from extension/ai/cost-tracker.js are preserved. If the existing
    // value is missing or not an array, start fresh.
    //
    // Serialised via `_withRecordLock` so two concurrent recordDispatch()
    // calls cannot interleave their get->push->set cycles (which would
    // silently lose the second writer's row). The broadcast stays INSIDE
    // the locked region, AFTER the set, so the Control Panel hero
    // re-render order matches storage-write order per row (a row reaches
    // storage immediately before its matching ANALYTICS_UPDATE fires).
    await _withRecordLock(async function () {
      var existing = await storage.get([FSB_USAGE_DATA_KEY]);
      var arr = (existing && Array.isArray(existing[FSB_USAGE_DATA_KEY])) ? existing[FSB_USAGE_DATA_KEY] : [];
      arr.push(row);
      var write = {};
      write[FSB_USAGE_DATA_KEY] = arr;
      await storage.set(write);

      // Fire-and-forget broadcast so the Control Panel hero refresh listener
      // re-renders (existing handler at extension/ui/options.js:567-585).
      try {
        if (typeof chrome !== 'undefined' && chrome && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
          var sendResult = chrome.runtime.sendMessage({ type: 'ANALYTICS_UPDATE' });
          if (sendResult && typeof sendResult.catch === 'function') {
            sendResult.catch(function () { /* no listeners is fine */ });
          }
        }
      } catch (_broadcastErr) {
        // Sending without listeners throws synchronously in some chrome
        // versions; swallow silently per fire-and-forget contract.
      }
    });
  } catch (outerErr) {
    // Whole-body safety net -- never throw out of the recorder. Best-effort
    // diagnostic at console.debug only so we never spam the SW console on
    // sustained storage outages.
    try {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('[FSB MCP Recorder]', outerErr && outerErr.message ? outerErr.message : outerErr);
      }
    } catch (_consoleErr) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// Service-worker / importScripts surface. Pattern mirrors install-identity.js +
// mcp-pricing.js.
globalThis.fsbMcpMetricsRecorder = {
  recordDispatch: recordDispatch,
  MCP_TOOL_TOKEN_HEURISTICS: MCP_TOOL_TOKEN_HEURISTICS,
  _estimateTokensForTool: _estimateTokensForTool,
  FSB_USAGE_DATA_KEY: FSB_USAGE_DATA_KEY
};

// Node CommonJS surface for the test harness at tests/mcp-metrics-recorder.test.js.
// Same surface plus the _setStorageShim test seam.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    recordDispatch: recordDispatch,
    MCP_TOOL_TOKEN_HEURISTICS: MCP_TOOL_TOKEN_HEURISTICS,
    _estimateTokensForTool: _estimateTokensForTool,
    _setStorageShim: _setStorageShim,
    FSB_USAGE_DATA_KEY: FSB_USAGE_DATA_KEY
  };
}
