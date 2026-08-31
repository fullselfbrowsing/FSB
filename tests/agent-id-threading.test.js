'use strict';

// Phase 238 Plan 03 D-13.4: integration test asserting that agent:register
// fires exactly ONCE across N parallel tool invocations from the same
// MCP process, and that all N execute-action payloads share the same
// agentId (the lazy-mint singleton property is observable on the wire).
//
// This is the load-bearing check on the cached-promise race control
// (CONTEXT.md D-03). A regression that double-mints would surface here
// before it could ship to production.
//
// Phase 246 Plan 03 Task 3: 2 additional cases extend coverage to the
// read-only.ts overturn (Phase 238 D-06 -> Phase 246 D-02). read-only.ts
// previously void-cast agentScope; it now threads agentId into every read
// tool bridge payload AND forwards optional tab_id when the caller
// supplies it.

const {
  createToolHarness,
  loadAgentScope,
  loadBuildModule,
} = require('./mcp-smoke-harness.js');

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

async function testManualNavigateAgentIdThreading() {
  const manualModule = await loadBuildModule('tools/manual.js');
  const agentScope = await loadAgentScope();

  const harness = createToolHarness({
    bridgeResponses: {
      'mcp:execute-action': ({ payload }) => ({ success: true, executed: payload.tool }),
    },
  });

  manualModule.registerManualTools(harness.server, harness.bridge, harness.queue, agentScope);

  const navigate = harness.getHandler('navigate');
  assert(typeof navigate === 'function', 'navigate handler is registered on the harness');
  if (typeof navigate !== 'function') {
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(1);
  }

  const N = 5;
  const promises = [];
  for (let i = 0; i < N; i++) {
    // Phase 255 Plan 03: action-tool dispatcher validates the v0.9.62 visual-session
    // field bundle (visual_reason + client) before forwarding to the bridge. The
    // agent-id-threading test exercises the post-validator path, so the bundle is
    // supplied here. See .planning/v0.9.62-CONTRACT.md.
    promises.push(navigate(
      { url: 'https://example.test/page' + i, visual_reason: 'test', client: 'Claude' },
      harness.createExtra(),
    ));
  }
  const results = await Promise.all(promises);
  assert(results.length === N, 'all ' + N + ' parallel navigate invocations resolved');

  // Lazy-mint property: exactly ONE agent:register on the wire across N invocations.
  const registerCalls = harness.bridgeCalls.filter(
    (c) => c && c.message && c.message.type === 'agent:register',
  );
  assert(
    registerCalls.length === 1,
    'agent:register fires exactly ONCE across ' + N + ' parallel invocations; observed ' + registerCalls.length,
  );

  // Every navigate invocation lands on the bridge as mcp:execute-action.
  const execCalls = harness.bridgeCalls.filter(
    (c) => c && c.message && c.message.type === 'mcp:execute-action',
  );
  assert(
    execCalls.length === N,
    'expected ' + N + ' mcp:execute-action calls, got ' + execCalls.length,
  );

  // All N execute-action payloads carry the SAME agentId (singleton property).
  const observedIds = new Set(
    execCalls.map((c) => c && c.message && c.message.payload && c.message.payload.agentId),
  );
  assert(
    observedIds.size === 1,
    'all ' + N + ' execute-action payloads share one agentId; got ' + observedIds.size + ' distinct value(s)',
  );
  assert(
    observedIds.has('agent_test_smoke'),
    'observed agentId equals the harness-minted deterministic value (agent_test_smoke)',
  );
  const observedRunIds = new Set(execCalls.map((c) => c.message.payload.recordingRunId));
  assert(
    observedRunIds.size === 1 && /^[0-9a-f-]{36}$/i.test([...observedRunIds][0]),
    'parallel calls share one internal recordingRunId',
  );
  const observedCallIds = new Set(execCalls.map((c) => c.message.payload.recordingCallId));
  assert(
    observedCallIds.size === N && [...observedCallIds].every((id) => /^[0-9a-f-]{36}$/i.test(id)),
    'each logical bridge call carries a unique internal recordingCallId',
  );
  assert(
    execCalls.every((c) => c.message.payload.recordingLeaseMs === 35_000),
    'manual calls carry a timeout-derived recording lease with settle grace',
  );

  console.log(
    '\nagent-id-threading.test.js manual.ts: ' +
      (failed === 0 ? 'PASS' : 'FAIL') +
      ' (N=' +
      N +
      ' parallel invocations -> ' +
      registerCalls.length +
      ' register + ' +
      execCalls.length +
      ' execute-actions, ' +
      observedIds.size +
      ' distinct agentId)',
  );
}

// Phase 246 Plan 03 Task 3 -- Case A: read-only.ts threads agentId per the
// Phase 238 D-06 -> Phase 246 D-02 overturn. read_page with NO tab_id MUST
// send agentId in the bridge payload.
async function testReadOnlyAgentIdThreading() {
  const readOnlyModule = await loadBuildModule('tools/read-only.js');
  const agentScope = await loadAgentScope();

  const harness = createToolHarness({
    bridgeResponses: {
      'mcp:read-page': () => ({ success: true, content: 'OK' }),
      'mcp:get-dom': () => ({ success: true, elements: [] }),
      'mcp:execute-action': () => ({ success: true }),
    },
  });

  readOnlyModule.registerReadOnlyTools(harness.server, harness.bridge, harness.queue, agentScope);

  const readPage = harness.getHandler('read_page');
  assert(typeof readPage === 'function', 'read_page handler is registered');
  if (typeof readPage !== 'function') return;

  await readPage({});

  const readPageCalls = harness.bridgeCalls.filter(
    (c) => c && c.message && c.message.type === 'mcp:read-page',
  );
  assert(readPageCalls.length === 1, 'read_page sent exactly 1 mcp:read-page bridge message');
  if (readPageCalls.length !== 1) return;
  const payload = readPageCalls[0].message.payload;
  assert(typeof payload.agentId === 'string', 'mcp:read-page payload contains agentId (Phase 246 D-02 overturn)');
  assert(payload.agentId === 'agent_test_smoke', 'agentId is the harness-minted deterministic value');
  assert(typeof payload.recordingRunId === 'string', 'mcp:read-page carries internal recording run correlation');
  assert(typeof payload.recordingCallId === 'string', 'mcp:read-page carries internal call deduplication correlation');
  assert(payload.recordingLeaseMs === 50_000, 'mcp:read-page carries its 45s timeout plus recording settle grace');
}

// Phase 246 Plan 03 Task 3 -- Case B: read_page with explicit tab_id forwards
// it AND threads agentId. The MESSAGE_TYPE_MAP entry for read_page in
// read-only.ts spreads p.tab_id when defined; the wrapper also adds agentId
// at the top of the payload.
async function testReadOnlyTabIdForwarded() {
  const readOnlyModule = await loadBuildModule('tools/read-only.js');
  const agentScope = await loadAgentScope();

  const harness = createToolHarness({
    bridgeResponses: {
      'mcp:read-page': () => ({ success: true, content: 'OK' }),
    },
  });

  readOnlyModule.registerReadOnlyTools(harness.server, harness.bridge, harness.queue, agentScope);

  const readPage = harness.getHandler('read_page');
  assert(typeof readPage === 'function', 'read_page handler is registered (Case B)');
  if (typeof readPage !== 'function') return;

  await readPage({ tab_id: 42 });

  const readPageCalls = harness.bridgeCalls.filter(
    (c) => c && c.message && c.message.type === 'mcp:read-page',
  );
  assert(readPageCalls.length === 1, 'exactly 1 read_page call (Case B)');
  if (readPageCalls.length !== 1) return;
  const payload = readPageCalls[0].message.payload;
  assert(payload.tab_id === 42, 'tab_id forwarded into bridge payload (Phase 246 D-02 messageBuilder)');
  assert(typeof payload.agentId === 'string', 'agentId still threaded alongside tab_id');
}

async function testStaleAgentSelfHealsOnce() {
  const agentBridgeModule = await loadBuildModule('agent-bridge.js');
  const agentScope = await loadAgentScope();
  const bridgeCalls = [];
  let registerCount = 0;

  const bridge = {
    isConnected: true,
    async sendAndWait(message, options) {
      bridgeCalls.push({ message, options });
      if (message.type === 'agent:register') {
        registerCount += 1;
        const agentId = registerCount === 1 ? 'agent_stale' : 'agent_fresh';
        return { success: true, agentId, agentIdShort: agentId.slice(0, 12), ownershipTokens: {} };
      }
      if (message.type === 'mcp:execute-action') {
        if (message.payload.agentId === 'agent_stale') {
          return { success: false, code: 'AGENT_NOT_REGISTERED', requestingAgentId: 'agent_stale' };
        }
        return { success: true, tool: message.payload.tool, tabId: 99, ownershipToken: 'tok-fresh-99' };
      }
      return { success: false, error: 'unexpected message type' };
    },
  };

  const result = await agentBridgeModule.sendAgentScopedBridgeMessage(
    bridge,
    agentScope,
    'mcp:execute-action',
    { tool: 'navigate', params: { url: 'https://example.com' } },
    { timeout: 30_000 },
  );

  assert(result && result.success === true, 'stale AGENT_NOT_REGISTERED retry eventually succeeds');
  assert(registerCount === 2, 'stale-agent path registers twice: initial stale id, then fresh id');
  const execCalls = bridgeCalls.filter((c) => c.message.type === 'mcp:execute-action');
  assert(execCalls.length === 2, 'stale-agent path retries the tool exactly once');
  assert(execCalls[0].message.payload.agentId === 'agent_stale', 'first tool call used stale agent id');
  assert(execCalls[1].message.payload.agentId === 'agent_fresh', 'retry tool call used fresh agent id');
  assert(
    execCalls[0].message.payload.recordingCallId !== execCalls[1].message.payload.recordingCallId,
    'self-heal retry gives each physical attempt a distinct recording call id',
  );
  assert(
    execCalls[0].message.payload.recordingRunId !== execCalls[1].message.payload.recordingRunId,
    'self-heal retry journals the fresh agent in a distinct recording run',
  );
  assert(agentScope.current() === 'agent_fresh', 'AgentScope cache now holds the fresh agent id');
}

async function testTerminalLifecycleRotatesRecordingRun() {
  const agentBridgeModule = await loadBuildModule('agent-bridge.js');
  const agentScope = await loadAgentScope();
  const calls = [];
  const bridge = {
    isConnected: true,
    async sendAndWait(message) {
      calls.push(message);
      if (message.type === 'agent:register') {
        return { success: true, agentId: 'agent_terminal', ownershipTokens: {} };
      }
      if (message.type === 'mcp:task-status') {
        return { success: true, status: 'completed' };
      }
      return { success: true };
    },
  };

  const firstBase = { tool: 'read_page', params: {} };
  await agentBridgeModule.sendAgentScopedBridgeMessage(
    bridge, agentScope, 'mcp:read-page', firstBase, {},
  );
  await agentBridgeModule.sendAgentScopedBridgeMessage(
    bridge, agentScope, 'mcp:task-status', { tool: 'complete_task', params: { summary: 'done' } }, {},
  );
  await agentBridgeModule.sendAgentScopedBridgeMessage(
    bridge, agentScope, 'mcp:read-page', { tool: 'read_page', params: {} }, {},
  );

  const toolCalls = calls.filter((message) => message.type !== 'agent:register');
  assert(toolCalls[0].payload.recordingRunId === toolCalls[1].payload.recordingRunId,
    'confirmed terminal call stays in the run it closes');
  assert(toolCalls[2].payload.recordingRunId !== toolCalls[1].payload.recordingRunId,
    'the first post-terminal bridge call starts a new recording run');
  assert(!Object.prototype.hasOwnProperty.call(firstBase, 'recordingRunId'),
    'recordingRunId does not mutate public tool arguments');
}

async function testLongBridgeAttemptsRefreshRecordingActivity() {
  const agentBridgeModule = await loadBuildModule('agent-bridge.js');
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    const successScope = await loadAgentScope();
    const successCalls = [];
    const successBridge = {
      isConnected: true,
      async sendAndWait(message) {
        if (message.type === 'agent:register') {
          return { success: true, agentId: 'agent_long_success', ownershipTokens: {} };
        }
        successCalls.push(message);
        if (successCalls.length === 1) now += 60_000;
        return { success: true };
      },
    };
    await agentBridgeModule.sendAgentScopedBridgeMessage(
      successBridge, successScope, 'mcp:execute-action', { tool: 'fill_sheet', params: {} }, {},
    );
    await agentBridgeModule.sendAgentScopedBridgeMessage(
      successBridge, successScope, 'mcp:read-page', { tool: 'read_page', params: {} }, {},
    );
    assert(successCalls[0].payload.recordingRunId === successCalls[1].payload.recordingRunId,
      'a successful 60s bridge attempt refreshes recording activity on completion');

    now = 100_000;
    const failureScope = await loadAgentScope();
    const failureCalls = [];
    const failureBridge = {
      isConnected: true,
      async sendAndWait(message) {
        if (message.type === 'agent:register') {
          return { success: true, agentId: 'agent_long_failure', ownershipTokens: {} };
        }
        failureCalls.push(message);
        if (failureCalls.length === 1) {
          now += 60_000;
          throw new Error('simulated bridge timeout');
        }
        return { success: true };
      },
    };
    try {
      await agentBridgeModule.sendAgentScopedBridgeMessage(
        failureBridge, failureScope, 'mcp:execute-action', { tool: 'fill_sheet', params: {} }, {},
      );
    } catch (error) {
      assert(error && error.message === 'simulated bridge timeout',
        'the simulated long bridge failure reaches the caller');
    }
    await agentBridgeModule.sendAgentScopedBridgeMessage(
      failureBridge, failureScope, 'mcp:read-page', { tool: 'read_page', params: {} }, {},
    );
    assert(failureCalls[0].payload.recordingRunId === failureCalls[1].payload.recordingRunId,
      'a failed 60s bridge attempt refreshes recording activity in finally');
  } finally {
    Date.now = originalNow;
  }
}

async function testStaleAgentRetryLimitAndNoRetryForOtherErrors() {
  const agentBridgeModule = await loadBuildModule('agent-bridge.js');

  const repeatingScope = await loadAgentScope();
  const repeatingCalls = [];
  let repeatingRegisterCount = 0;
  const repeatingBridge = {
    isConnected: true,
    async sendAndWait(message) {
      repeatingCalls.push({ message });
      if (message.type === 'agent:register') {
        repeatingRegisterCount += 1;
        const agentId = 'agent_repeat_' + repeatingRegisterCount;
        return { success: true, agentId, agentIdShort: agentId.slice(0, 12), ownershipTokens: {} };
      }
      return { success: false, code: 'AGENT_NOT_REGISTERED', requestingAgentId: message.payload.agentId };
    },
  };

  const repeatResult = await agentBridgeModule.sendAgentScopedBridgeMessage(
    repeatingBridge,
    repeatingScope,
    'mcp:execute-action',
    { tool: 'navigate', params: { url: 'https://example.com' } },
    {},
  );
  assert(repeatResult && repeatResult.code === 'AGENT_NOT_REGISTERED', 'second AGENT_NOT_REGISTERED is returned after one retry');
  assert(repeatingRegisterCount === 2, 'repeating stale-agent path does not register more than twice');
  assert(
    repeatingCalls.filter((c) => c.message.type === 'mcp:execute-action').length === 2,
    'repeating stale-agent path sends exactly two tool calls',
  );

  const ownedScope = await loadAgentScope();
  const ownedCalls = [];
  let ownedRegisterCount = 0;
  const ownedBridge = {
    isConnected: true,
    async sendAndWait(message) {
      ownedCalls.push({ message });
      if (message.type === 'agent:register') {
        ownedRegisterCount += 1;
        return { success: true, agentId: 'agent_owned', agentIdShort: 'agent_owned', ownershipTokens: {} };
      }
      return { success: false, code: 'TAB_NOT_OWNED', requestedTabId: 7, requestingAgentId: message.payload.agentId };
    },
  };

  const ownedResult = await agentBridgeModule.sendAgentScopedBridgeMessage(
    ownedBridge,
    ownedScope,
    'mcp:execute-action',
    { tool: 'readsheet', params: { tab_id: 7 } },
    { targetTabId: 7 },
  );
  assert(ownedResult && ownedResult.code === 'TAB_NOT_OWNED', 'TAB_NOT_OWNED is returned without self-heal retry');
  assert(ownedRegisterCount === 1, 'TAB_NOT_OWNED path does not re-register');
  assert(
    ownedCalls.filter((c) => c.message.type === 'mcp:execute-action').length === 1,
    'TAB_NOT_OWNED path sends exactly one tool call',
  );
}

async function run() {
  await testManualNavigateAgentIdThreading();
  await testReadOnlyAgentIdThreading();
  await testReadOnlyTabIdForwarded();
  await testStaleAgentSelfHealsOnce();
  await testTerminalLifecycleRotatesRecordingRun();
  await testLongBridgeAttemptsRefreshRecordingActivity();
  await testStaleAgentRetryLimitAndNoRetryForOtherErrors();
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: integration test crashed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
