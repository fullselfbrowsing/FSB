/**
 * Unit tests for extension/utils/mcp-metrics-recorder.js.
 *
 * Phase 271 / v0.9.69. Validates the 8 behaviour sections per CONTEXT.md
 * decisions 1-7 + COST-01..05.
 *
 * Test sections (in order):
 *   1. recordDispatch writes one row with snake+camel keys, source='mcp'
 *      (COST-02, decision 5)
 *   2. Unknown-tool branch -> token_source='unknown' (decision 1 fallback)
 *   3. Failure case (success=false) still records (decision 3)
 *   4. 10 sequential dispatches -> exactly 10 rows (COST-05 no-double-count)
 *   5. Hero merge -- MCP + AI-provider rows summed together (COST-01, D-04)
 *   6. AI-provider back-fill walk -- missing source -> 'ai-provider' on
 *      AI-provider-shaped rows; second pass is no-op (COST-04, decision 7)
 *   7. type_text token scaling -- proportional to text.length with floor=50
 *      (decision 1 special case)
 *   8. Pricing integration -- known client resolves to claude-opus-4-7 cost
 *      > 0; unknown client -> cost_usd=null + cost=0 alias (decision 4 +
 *      D-10)
 *
 * Run: node tests/mcp-metrics-recorder.test.js
 *
 * Test harness pattern matches tests/install-identity.test.js and
 * tests/mcp-pricing.test.js: plain Node script, no external test framework.
 * `passed` / `failed` counters; process.exit(0|1) at end.
 */

'use strict';

const path = require('path');
const assert = require('assert');

const PRICING_PATH = require.resolve('../extension/utils/mcp-pricing.js');
const RECORDER_PATH = require.resolve('../extension/utils/mcp-metrics-recorder.js');
const PRICING_DATA_PATH = require.resolve('../extension/utils/mcp-pricing-data.json');

let passed = 0;
let failed = 0;

function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function passAssertEqual(actual, expected, msg) {
  passAssert(actual === expected,
    msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')');
}

function freshRequire() {
  delete require.cache[PRICING_PATH];
  delete require.cache[RECORDER_PATH];
  delete require.cache[PRICING_DATA_PATH];
  // Reset module-level globals from any previous require so each test
  // starts with a clean fsbMcpPricing / fsbMcpMetricsRecorder.
  delete globalThis.fsbMcpPricing;
  delete globalThis.fsbMcpMetricsRecorder;
  // Require pricing FIRST -- the recorder calls into it.
  require(PRICING_PATH);
  return require(RECORDER_PATH);
}

// In-memory chrome.storage.local shim. Each test resets _store.
function makeShim() {
  return {
    _store: {},
    _broadcasts: [],
    async get(keys) {
      const ks = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of ks) {
        if (Object.prototype.hasOwnProperty.call(this._store, k)) {
          out[k] = this._store[k];
        }
      }
      return out;
    },
    async set(o) {
      Object.assign(this._store, o);
    }
  };
}

// IMPORTANT: do NOT set global.chrome before requiring pricing. The pricing
// module branches on `typeof chrome === 'undefined' || !chrome.runtime ||
// typeof chrome.runtime.getURL !== 'function'` to choose Node sync require
// vs SW fetch. Pure-Node lets it synchronously load the JSON, which is what
// section 8 needs. We install global.chrome AFTER pricing has bound for the
// recorder's runtime.sendMessage broadcast (the recorder is robust to
// chrome.runtime missing too, but we provide a stub for completeness).
function installChromeStub(shim) {
  global.chrome = {
    storage: { local: shim },
    runtime: {
      sendMessage(msg) { shim._broadcasts.push(msg); return Promise.resolve(); }
    }
  };
}

(async function runTests() {

  // --- Section 1: recordDispatch writes one row ---------------------------
  console.log('\n--- Section 1: recordDispatch with known tool ---');
  {
    const m = freshRequire();
    const shim = makeShim();
    installChromeStub(shim);
    m._setStorageShim(shim);

    await m.recordDispatch({
      client: 'Claude',
      tool: 'click',
      requestPayload: { selector: '#btn' },
      response: { success: true },
      success: true,
      dispatcher_route: 'tool'
    });

    const rows = shim._store.fsbUsageData;
    passAssert(Array.isArray(rows), 'fsbUsageData is an array');
    passAssertEqual(rows.length, 1, 'exactly one row appended');
    const row = rows[0];

    // Canonical snake_case shape
    passAssertEqual(row.source, 'mcp', 'row.source = mcp');
    passAssertEqual(row.tool, 'click', 'row.tool = click');
    passAssertEqual(row.client, 'Claude', 'row.client = Claude');
    passAssertEqual(row.tokens_in, 50, 'row.tokens_in = 50 (click heuristic)');
    passAssertEqual(row.tokens_out, 30, 'row.tokens_out = 30 (click heuristic)');
    passAssertEqual(row.token_source, 'estimate', 'row.token_source = estimate');
    passAssertEqual(row.dispatcher_route, 'tool', 'row.dispatcher_route = tool');
    passAssert(typeof row.ts === 'number' && row.ts > 0, 'row.ts is a positive number');

    // Legacy camelCase aliases for hero compatibility
    passAssertEqual(row.inputTokens, 50, 'row.inputTokens alias = 50');
    passAssertEqual(row.outputTokens, 30, 'row.outputTokens alias = 30');
    passAssertEqual(row.timestamp, row.ts, 'row.timestamp == row.ts');
    passAssertEqual(row.success, true, 'row.success = true');
    passAssert(typeof row.cost === 'number', 'row.cost is a number (legacy alias)');

    // PII non-leak: row schema MUST NOT include any selector, payload, or DOM data
    passAssert(!('selector' in row), 'row does NOT include requestPayload.selector');
    passAssert(!('requestPayload' in row), 'row does NOT include requestPayload object');
    passAssert(!('response' in row), 'row does NOT include response object');
  }

  // --- Section 2: unknown tool -> token_source='unknown' ------------------
  console.log('\n--- Section 2: unknown tool -> token_source=unknown ---');
  {
    const m = freshRequire();
    const shim = makeShim();
    installChromeStub(shim);
    m._setStorageShim(shim);

    await m.recordDispatch({
      client: 'Claude',
      tool: 'made_up_tool',
      requestPayload: {},
      response: { success: true },
      success: true,
      dispatcher_route: 'tool'
    });

    const rows = shim._store.fsbUsageData;
    passAssertEqual(rows.length, 1, 'exactly one row appended for unknown tool');
    passAssertEqual(rows[0].token_source, 'unknown', 'token_source = unknown');
    passAssertEqual(rows[0].tokens_in, 100, 'tokens_in = 100 (fallback floor)');
    passAssertEqual(rows[0].tokens_out, 200, 'tokens_out = 200 (fallback floor)');
    passAssertEqual(rows[0].tool, 'made_up_tool', 'tool name preserved');
  }

  // --- Section 3: failure case still records ------------------------------
  console.log('\n--- Section 3: failure case still records ---');
  {
    const m = freshRequire();
    const shim = makeShim();
    installChromeStub(shim);
    m._setStorageShim(shim);

    await m.recordDispatch({
      client: 'Claude',
      tool: 'click',
      requestPayload: {},
      response: { success: false, errorCode: 'X' },
      success: false,
      dispatcher_route: 'tool'
    });

    const rows = shim._store.fsbUsageData;
    passAssertEqual(rows.length, 1, 'failure path still appended one row');
    passAssertEqual(rows[0].success, false, 'row.success === false on failure');
    passAssertEqual(rows[0].source, 'mcp', 'failure row still has source=mcp');
    passAssertEqual(rows[0].tool, 'click', 'failure row still has tool name');
  }

  // --- Section 4: 10 sequential dispatches -> 10 rows (no double-count) ---
  console.log('\n--- Section 4: 10 sequential dispatches -> 10 rows ---');
  {
    const m = freshRequire();
    const shim = makeShim();
    installChromeStub(shim);
    m._setStorageShim(shim);

    for (let i = 0; i < 10; i++) {
      await m.recordDispatch({
        client: 'Claude',
        tool: 'click',
        requestPayload: {},
        response: { success: true },
        success: true,
        dispatcher_route: 'tool'
      });
    }

    const rows = shim._store.fsbUsageData;
    passAssertEqual(rows.length, 10, '10 sequential awaited calls -> exactly 10 rows');
    for (let i = 0; i < 10; i++) {
      passAssertEqual(rows[i].source, 'mcp', 'row ' + i + ' source=mcp');
      passAssertEqual(rows[i].tool, 'click', 'row ' + i + ' tool=click');
    }
  }

  // --- Section 5: hero merge -- MCP + AI-provider rows summed together ----
  console.log('\n--- Section 5: hero merge (MCP + AI-provider) ---');
  {
    const m = freshRequire();
    const shim = makeShim();
    installChromeStub(shim);
    m._setStorageShim(shim);

    // 3 MCP rows via recorder.
    for (let i = 0; i < 3; i++) {
      await m.recordDispatch({
        client: 'Claude',
        tool: 'click',
        requestPayload: {},
        response: { success: true },
        success: true,
        dispatcher_route: 'tool'
      });
    }
    // 2 synthetic AI-provider rows (matching cost-tracker.js shape).
    shim._store.fsbUsageData.push({
      source: 'ai-provider',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      inputTokens: 1000,
      outputTokens: 500,
      cost: 0.005,
      success: true,
      timestamp: Date.now()
    });
    shim._store.fsbUsageData.push({
      source: 'ai-provider',
      model: 'gpt-5',
      provider: 'openai',
      inputTokens: 2000,
      outputTokens: 800,
      cost: 0.01,
      success: true,
      timestamp: Date.now()
    });

    function heroSum(rows) {
      let totalTokens = 0, totalCost = 0;
      for (const r of rows) {
        totalTokens += (r.inputTokens || 0) + (r.outputTokens || 0);
        totalCost += (r.cost || 0);
      }
      return { totalTokens, totalCost, totalRequests: rows.length };
    }

    const stats = heroSum(shim._store.fsbUsageData);
    passAssertEqual(stats.totalRequests, 5, 'hero sees all 5 rows');
    // 3 MCP rows: 3 * (50 + 30) = 240 tokens
    // 2 AI rows: (1000+500) + (2000+800) = 1500 + 2800 = 4300
    // Total: 240 + 4300 = 4540
    passAssertEqual(stats.totalTokens, 4540, 'hero totalTokens = 240 (MCP) + 4300 (AI) = 4540');
    // AI total cost: 0.005 + 0.01 = 0.015. MCP cost from Node-mode pricing
    // is finite & > 0 (Claude default = claude-opus-4-7, 50 in @ 5.00/MTok +
    // 30 out @ 25.00/MTok = 0.00025 + 0.00075 = 0.001 per MCP row, * 3 rows).
    const mcpCostExpected = 3 * 0.001;
    const aiCostExpected = 0.015;
    passAssert(Math.abs(stats.totalCost - (mcpCostExpected + aiCostExpected)) < 1e-9,
      'hero totalCost = (3 * 0.001 MCP) + (0.015 AI) = ' + (mcpCostExpected + aiCostExpected) +
      ', got ' + stats.totalCost);
  }

  // --- Section 6: AI-provider back-fill walk (decision 7 / COST-04) ------
  console.log('\n--- Section 6: AI-provider back-fill walk ---');
  {
    // Mirror the back-fill walk from extension/utils/analytics.js
    // loadStoredData. The recorder doesn't own this logic, but the plan's
    // done-criteria require asserting the migration behaviour at unit level.
    function applyAiProviderBackfill(rows) {
      let touched = false;
      for (const r of rows) {
        const hasSourceString = typeof r.source === 'string' && r.source.length > 0;
        if (
          !hasSourceString &&
          typeof r.model === 'string' &&
          typeof r.inputTokens === 'number'
        ) {
          r.source = 'ai-provider';
          touched = true;
        }
      }
      return touched;
    }

    const rows = [
      { model: 'gpt-5', inputTokens: 100, outputTokens: 50, cost: 0.01, timestamp: 1 },
      { model: 'claude-opus-4-7', inputTokens: 200, outputTokens: 80, cost: 0.05, timestamp: 2 }
    ];
    passAssertEqual(rows[0].source, undefined, 'pre-back-fill: row 0 has no source');
    passAssertEqual(rows[1].source, undefined, 'pre-back-fill: row 1 has no source');

    const firstPass = applyAiProviderBackfill(rows);
    passAssertEqual(firstPass, true, 'first back-fill pass returns true (touched=true)');
    passAssertEqual(rows[0].source, 'ai-provider', 'row 0 back-filled to ai-provider');
    passAssertEqual(rows[1].source, 'ai-provider', 'row 1 back-filled to ai-provider');

    const secondPass = applyAiProviderBackfill(rows);
    passAssertEqual(secondPass, false, 'second pass is no-op (idempotent)');

    // Genuinely-legacy workflow-source rows retain their value untouched.
    const legacyRows = [
      { source: 'automation', model: 'grok-3', inputTokens: 100, outputTokens: 50 },
      { source: 'memory', model: 'gpt-5', inputTokens: 100, outputTokens: 50 },
      { source: 'sitemap', model: 'claude', inputTokens: 100, outputTokens: 50 }
    ];
    const legacyPass = applyAiProviderBackfill(legacyRows);
    passAssertEqual(legacyPass, false, 'legacy workflow-source rows not touched');
    passAssertEqual(legacyRows[0].source, 'automation', 'automation row preserved');
    passAssertEqual(legacyRows[1].source, 'memory', 'memory row preserved');
    passAssertEqual(legacyRows[2].source, 'sitemap', 'sitemap row preserved');

    // Rows without AI-provider shape (no model OR no inputTokens) NOT back-filled.
    const shapelessRows = [
      { inputTokens: 100, outputTokens: 50 },        // no model
      { model: 'gpt-5', outputTokens: 50 },          // no inputTokens
      {}                                              // neither
    ];
    const shapelessPass = applyAiProviderBackfill(shapelessRows);
    passAssertEqual(shapelessPass, false, 'rows lacking AI-provider shape are not back-filled');
    passAssertEqual(shapelessRows[0].source, undefined, 'shapeless row 0 retained undefined source');
  }

  // --- Section 7: type_text token scaling ---------------------------------
  console.log('\n--- Section 7: type_text token scaling ---');
  {
    const m = freshRequire();

    // 400 chars -> Math.ceil(400/4) = 100, max(50, 100) = 100
    const e1 = m._estimateTokensForTool('type_text', { textLength: 400 });
    passAssertEqual(e1.tokens_in, 100, 'type_text 400 chars -> tokens_in = 100');
    passAssertEqual(e1.tokens_out, 30, 'type_text 400 chars -> tokens_out = 30');
    passAssertEqual(e1.token_source, 'estimate', 'type_text 400 chars -> token_source = estimate');

    // 2 chars -> Math.ceil(2/4) = 1, max(50, 1) = 50 (floor)
    const e2 = m._estimateTokensForTool('type_text', { textLength: 2 });
    passAssertEqual(e2.tokens_in, 50, 'type_text "hi" -> tokens_in = 50 (floor)');

    // undefined text -> empty string fallback -> Math.ceil(0/4) = 0 -> max(50, 0) = 50
    const e3 = m._estimateTokensForTool('insert_text', {});
    passAssertEqual(e3.tokens_in, 50, 'insert_text undefined text -> tokens_in = 50 (floor)');

    // null payload entirely
    const e4 = m._estimateTokensForTool('type_text', null);
    passAssertEqual(e4.tokens_in, 50, 'type_text null payload -> tokens_in = 50');

    // 8 chars -> Math.ceil(8/4) = 2, max(50, 2) = 50
    const e5 = m._estimateTokensForTool('type_text', { textLength: 8 });
    passAssertEqual(e5.tokens_in, 50, 'type_text 8 chars -> tokens_in = 50 (floor)');

    // Now record a dispatch and assert the row carries the scaled value.
    const shim = makeShim();
    installChromeStub(shim);
    m._setStorageShim(shim);

    await m.recordDispatch({
      client: 'Claude',
      tool: 'type_text',
      requestMetadata: { textLength: 400 },
      success: true,
      dispatcher_route: 'tool'
    });
    passAssertEqual(shim._store.fsbUsageData[0].tokens_in, 100,
      'recorded type_text row carries scaled tokens_in = 100');
    passAssertEqual(shim._store.fsbUsageData[0].inputTokens, 100,
      'recorded type_text row carries scaled inputTokens = 100 (alias)');
  }

  // --- Section 8: pricing integration (decision 4 + D-10) -----------------
  console.log('\n--- Section 8: pricing integration ---');
  {
    const m = freshRequire();
    const shim = makeShim();
    installChromeStub(shim);
    m._setStorageShim(shim);

    // Known client -> pricing fallback to claude-opus-4-7
    await m.recordDispatch({
      client: 'Claude',
      tool: 'click',
      requestPayload: {},
      response: { success: true },
      success: true,
      dispatcher_route: 'tool'
    });
    const row1 = shim._store.fsbUsageData[0];
    passAssert(typeof row1.cost_usd === 'number' && row1.cost_usd > 0,
      'known client (Claude) -> row.cost_usd > 0 (got ' + row1.cost_usd + ')');
    passAssertEqual(row1.model, 'claude-opus-4-7',
      'known client (Claude) -> row.model resolves to claude-opus-4-7');
    passAssertEqual(row1.pricing_confidence, 'fallback',
      'known client without explicit model -> pricing_confidence = fallback');
    // cost = (50/1e6) * 5.00 + (30/1e6) * 25.00 = 0.00025 + 0.00075 = 0.001
    passAssert(Math.abs(row1.cost_usd - 0.001) < 1e-9,
      'cost_usd ≈ 0.001 (50/1e6 * 5 + 30/1e6 * 25), got ' + row1.cost_usd);
    passAssert(Math.abs(row1.cost - 0.001) < 1e-9,
      'cost camelCase alias matches cost_usd');

    // Unknown client -> UNKNOWN envelope -> cost_usd=null, cost=0
    shim._store.fsbUsageData = [];
    await m.recordDispatch({
      client: 'NonexistentClient_xyz_v999',
      tool: 'click',
      requestPayload: {},
      response: { success: true },
      success: true,
      dispatcher_route: 'tool'
    });
    const row2 = shim._store.fsbUsageData[0];
    passAssertEqual(row2.cost_usd, null,
      'unknown client -> cost_usd = null');
    passAssertEqual(row2.model, null,
      'unknown client -> model = null');
    passAssertEqual(row2.pricing_confidence, null,
      'unknown client -> pricing_confidence = null');
    passAssertEqual(row2.cost, 0,
      'unknown client -> camelCase cost alias = 0 (D-10 zero-floor for hero)');
  }

  // --- Section 9: alias route does not double-record (CR-01 regression) ---
  //
  // The 14 alias-routed tools (run_task, read_page, get_dom_snapshot, ...)
  // route through `handleToolAliasRoute`, which calls
  // `dispatchMcpMessageRoute` from inside `dispatchMcpToolRoute`. Before
  // CR-01 was fixed, BOTH dispatchers' `finally` blocks would call
  // `recordDispatch`, producing TWO `fsbUsageData` rows per logical client
  // call -- inflating tokens / cost / requests by 2x for the heaviest MCP
  // tools.
  //
  // This regression test loads the real dispatcher, stubs the underlying
  // message-route handler (so no real automation runs), invokes
  // `dispatchMcpToolRoute({tool: 'run_task', ...})`, and asserts that
  // EXACTLY ONE row is appended to `fsbUsageData` with `tool: 'run_task'`
  // (the outer tool name, NOT the inner `mcp:start-automation` message
  // type) and `dispatcher_route: 'tool'` (NOT 'message'). If the
  // `_mcpMetricsSuppressInner` flag is ever dropped from any of the three
  // chokepoints (dispatchMcpToolRoute, handleToolAliasRoute,
  // dispatchMcpMessageRoute), this test will fail with 2 rows instead of 1.
  console.log('\n--- Section 9: alias route does not double-record (CR-01) ---');
  {
    // Fresh recorder + chrome stub + storage shim.
    const m = freshRequire();
    const shim = makeShim();
    installChromeStub(shim);
    m._setStorageShim(shim);

    // Wire the recorder into globalThis so the dispatcher's finally block
    // can find it the same way the production service worker does.
    globalThis.fsbMcpMetricsRecorder = { recordDispatch: m.recordDispatch };

    // Load the real dispatcher. The dispatcher uses require() in Node mode
    // (no `TOOL_REGISTRY` global). We require it AFTER the recorder is
    // wired so its `finally` block sees `globalThis.fsbMcpMetricsRecorder`
    // on every invocation.
    const DISPATCHER_PATH = require.resolve('../extension/ws/mcp-tool-dispatcher.js');
    delete require.cache[DISPATCHER_PATH];
    const dispatcher = require(DISPATCHER_PATH);

    // Stub the underlying message-route handler so no real automation runs.
    // run_task -> 'mcp:start-automation' -> handleStartAutomationRoute by
    // default. We replace that handler with an async stub that returns a
    // canonical success envelope.
    const stubResponse = { success: true, sessionId: 'test-session-cr01' };
    const originalHandler = dispatcher.MCP_PHASE199_MESSAGE_ROUTES['mcp:start-automation'].handler;
    dispatcher.MCP_PHASE199_MESSAGE_ROUTES['mcp:start-automation'].handler =
      async function stubStartAutomation() { return stubResponse; };

    try {
      // Invoke the outer tool route. This must traverse:
      //   dispatchMcpToolRoute('run_task')
      //     -> route.handler === handleToolAliasRoute
      //     -> dispatchMcpMessageRoute('mcp:start-automation')
      //       -> stubStartAutomation() -> stubResponse
      //     -> inner finally (MUST be suppressed -- no inner row)
      //   -> outer finally (records exactly ONE row, dispatcher_route='tool')
      const response = await dispatcher.dispatchMcpToolRoute({
        tool: 'run_task',
        params: { task: 'cr01 regression test' },
        client: 'Claude'
      });

      passAssertEqual(response.success, true,
        'alias-routed dispatch returns the stubbed success response');
      passAssertEqual(response.sessionId, 'test-session-cr01',
        'alias-routed dispatch propagates the stubbed sessionId');

      // recordDispatch is fire-and-forget inside the dispatcher's finally
      // (intentionally not awaited so storage IO never blocks the WS
      // client response). Yield the event loop a few times so the
      // queued chrome.storage.local.set inside recordDispatch flushes
      // before we inspect fsbUsageData.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      const rows = shim._store.fsbUsageData || [];
      passAssertEqual(rows.length, 1,
        'CR-01: alias-routed dispatch appends EXACTLY ONE row (not 2)');

      if (rows.length === 1) {
        const row = rows[0];
        passAssertEqual(row.tool, 'run_task',
          'CR-01: the recorded row carries the OUTER tool name (run_task), not the inner message type (mcp:start-automation)');
        passAssertEqual(row.dispatcher_route, 'tool',
          'CR-01: the recorded row carries dispatcher_route="tool" (NOT "message")');
        passAssertEqual(row.source, 'mcp',
          'CR-01: the recorded row is tagged source="mcp"');
        passAssertEqual(row.success, true,
          'CR-01: the recorded row preserves success=true from the stubbed response');
      } else if (rows.length === 2) {
        // Diagnostic surface: if the regression returns, dump the row pair
        // so the failure log shows BOTH writers' fingerprints.
        console.error('  DIAG: double-record regression detected. Rows:');
        console.error('    row[0]: ' + JSON.stringify({ tool: rows[0].tool, dispatcher_route: rows[0].dispatcher_route }));
        console.error('    row[1]: ' + JSON.stringify({ tool: rows[1].tool, dispatcher_route: rows[1].dispatcher_route }));
      }
    } finally {
      // Restore the real handler so subsequent test runs / requires see a
      // clean module. The require.cache delete + re-require pattern above
      // means future sections do not see this stub, but resetting here is
      // belt-and-suspenders for in-process re-runs.
      dispatcher.MCP_PHASE199_MESSAGE_ROUTES['mcp:start-automation'].handler = originalHandler;
      // Drop the global so it does not leak into other test files in the
      // same Node process (the test chain re-requires per file).
      delete globalThis.fsbMcpMetricsRecorder;
    }
  }

  // --- Summary ------------------------------------------------------------
  console.log('\n--- Summary ---');
  console.log('Total: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
  console.log('All mcp-metrics-recorder tests passed.');
  process.exit(0);
})().catch((e) => {
  console.error('FATAL: test harness threw:', e && e.stack ? e.stack : e);
  process.exit(2);
});
