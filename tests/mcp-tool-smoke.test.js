'use strict';

const util = require('util');
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

function assertDeepEqual(actual, expected, msg) {
  assert(util.isDeepStrictEqual(actual, expected), `${msg} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

const requiredSmokeTools = [
  'list_tabs',
  'navigate',
  'read_page',
  'get_dom_snapshot',
  'get_page_snapshot',
  'get_site_guide',
  'click',
  'close_tab',
  'start_visual_session',
  'end_visual_session',
  'run_task',
  'stop_task',
  'trigger',
  'stop_trigger',
  'get_trigger_status',
  'list_triggers',
  'get_logs',
  'back',
];

async function invokeTool(harness, toolName, params = {}, extra = null) {
  const handler = harness.getHandler(toolName);
  assert(typeof handler === 'function', `${toolName} registers a callable MCP handler`);
  if (typeof handler !== 'function') return null;

  const before = harness.bridgeCalls.length;
  const result = await handler(params, extra || harness.createExtra());
  // Phase 238: a manual/visual-session/autopilot tool's first invocation
  // also triggers an 'agent:register' lazy mint via AgentScope.ensure().
  // The smoke test asserts on the TOOL's own bridge message, so skip past
  // any agent:register entries inserted into bridgeCalls during this call.
  let call = null;
  for (let i = before; i < harness.bridgeCalls.length; i++) {
    const entry = harness.bridgeCalls[i];
    if (entry && entry.message && entry.message.type === 'agent:register') continue;
    call = entry;
    break;
  }

  assert(result && Array.isArray(result.content), `${toolName} smoke returns MCP content output`);
  return call;
}

async function run() {
  const runtimeModule = await loadBuildModule('runtime.js');
  const readOnlyModule = await loadBuildModule(pathJoin('tools', 'read-only.js'));
  const manualModule = await loadBuildModule(pathJoin('tools', 'manual.js'));
  const visualSessionModule = await loadBuildModule(pathJoin('tools', 'visual-session.js'));
  const autopilotModule = await loadBuildModule(pathJoin('tools', 'autopilot.js'));
  const triggersModule = await loadBuildModule(pathJoin('tools', 'triggers.js'));
  const observabilityModule = await loadBuildModule(pathJoin('tools', 'observability.js'));
  // Phase 242 plan 02: agents.ts now exposes the 'back' tool (Plan 01 D-01).
  // Loading the module here lets the smoke test register the back handler
  // alongside the other surfaces; without this, 'back' stays in
  // requiredSmokeTools but its handler never lands in harness.handlers.
  const agentsModule = await loadBuildModule(pathJoin('tools', 'agents.js'));

  console.log('\n--- packaged runtime surface ---');
  assert(typeof runtimeModule.createRuntime === 'function', 'build/runtime.js exports createRuntime');
  assert(typeof readOnlyModule.registerReadOnlyTools === 'function', 'build/tools/read-only.js exports registerReadOnlyTools');
  assert(typeof manualModule.registerManualTools === 'function', 'build/tools/manual.js exports registerManualTools');
  assert(typeof visualSessionModule.registerVisualSessionTools === 'function', 'build/tools/visual-session.js exports registerVisualSessionTools');
  assert(typeof autopilotModule.registerAutopilotTools === 'function', 'build/tools/autopilot.js exports registerAutopilotTools');
  assert(typeof triggersModule.registerTriggerTools === 'function', 'build/tools/triggers.js exports registerTriggerTools');
  assert(typeof observabilityModule.registerObservabilityTools === 'function', 'build/tools/observability.js exports registerObservabilityTools');
  assert(typeof agentsModule.registerAgentTools === 'function', 'build/tools/agents.js exports registerAgentTools');

  const harness = createToolHarness({
    bridgeResponses: {
      'mcp:get-tabs': { success: true, tabs: [{ id: 7, active: true, url: 'https://example.com' }] },
      'mcp:execute-action': ({ payload }) => ({ success: true, executed: payload.tool }),
      'mcp:read-page': { success: true, content: 'Example page' },
      'mcp:get-dom': { success: true, elements: [{ ref: 'e5' }] },
      'mcp:get-page-snapshot': { success: true, snapshot: '# Example\n- e1: button "Submit"', elementCount: 1 },
      'mcp:get-site-guides': { success: true, guide: { site: 'example.com', selectors: {} } },
      'mcp:start-visual-session': ({ payload }) => ({
        success: true,
        sessionToken: 'visual_token_123',
        clientLabel: payload.clientLabel,
        tabId: 7,
      }),
      'mcp:end-visual-session': ({ payload }) => ({
        success: true,
        sessionToken: payload.sessionToken,
        cleared: true,
      }),
      'mcp:start-automation': { success: true, sessionId: 'smoke-session', status: 'started' },
      'mcp:stop-automation': { success: true, stopped: true },
      'mcp:trigger': ({ payload }) => ({ success: true, trigger_id: 'trg_smoke', status: 'armed', owner: payload.agentId }),
      'mcp:stop-trigger': ({ payload }) => ({ success: true, trigger_id: payload.trigger_id, stopped: true }),
      'mcp:get-trigger-status': ({ payload }) => ({ success: true, trigger_id: payload.trigger_id, status: 'armed' }),
      'mcp:list-triggers': { success: true, triggers: [] },
      'mcp:get-logs': { success: true, logs: [] },
    },
  });

  // Phase 238 D-11: register*Tools accepts AgentScope as the 4th arg.
  // The harness's bridge.sendAndWait responds to type 'agent:register'
  // with a deterministic { agentId: 'agent_test_smoke', ... } payload.
  const agentScope = await loadAgentScope();
  readOnlyModule.registerReadOnlyTools(harness.server, harness.bridge, harness.queue, agentScope);
  manualModule.registerManualTools(harness.server, harness.bridge, harness.queue, agentScope);
  visualSessionModule.registerVisualSessionTools(harness.server, harness.bridge, harness.queue, agentScope);
  triggersModule.registerTriggerTools(harness.server, harness.bridge, harness.queue, agentScope);
  autopilotModule.registerAutopilotTools(harness.server, harness.bridge, harness.queue, agentScope);
  observabilityModule.registerObservabilityTools(harness.server, harness.bridge, harness.queue, agentScope);
  // Phase 242 D-01: registerAgentTools registers the 'back' MCP tool. Loaded
  // last so the smoke test's registered-handlers assertion (line 118) sees it.
  agentsModule.registerAgentTools(harness.server, harness.bridge, harness.queue, agentScope);

  console.log('\n--- registered smoke tools ---');
  for (const toolName of requiredSmokeTools) {
    assert(harness.handlers.has(toolName), `registered handlers include ${toolName}`);
  }

  console.log('\n--- bridge message families ---');
  const listTabsCall = await invokeTool(harness, 'list_tabs');
  assertDeepEqual(
    listTabsCall && listTabsCall.message,
    { type: 'mcp:get-tabs', payload: { agentId: 'agent_test_smoke', ownershipToken: 'token_test_smoke' } },
    'list_tabs routes through mcp:get-tabs with agent identity',
  );

  // v0.9.62 implicit visual session contract: action tools require visual_reason + client.
  // The fields are STRIPPED from params before dispatch and travel as a top-level
  // visualSession sidecar (camelCase wire form) sibling to agentId/ownershipToken.
  const navigateCall = await invokeTool(harness, 'navigate', {
    url: 'https://example.com',
    visual_reason: 'smoke test',
    client: 'Codex',
  });
  assertDeepEqual(
    navigateCall && navigateCall.message,
    {
      type: 'mcp:execute-action',
      payload: {
        tool: 'navigate',
        params: { url: 'https://example.com' },
        visualSession: { visualReason: 'smoke test', client: 'Codex', isFinal: false },
        agentId: 'agent_test_smoke',
        ownershipToken: 'token_test_smoke',
      },
    },
    'navigate routes through mcp:execute-action with navigate payload + v0.9.62 visualSession sidecar',
  );

  const readPageCall = await invokeTool(harness, 'read_page', { full: true });
  assertDeepEqual(
    readPageCall && readPageCall.message,
    { type: 'mcp:read-page', payload: { full: true, agentId: 'agent_test_smoke', ownershipToken: 'token_test_smoke' } },
    'read_page routes through mcp:read-page with full flag and agent identity',
  );

  const domSnapshotCall = await invokeTool(harness, 'get_dom_snapshot', { maxElements: 5 });
  assertDeepEqual(
    domSnapshotCall && domSnapshotCall.message,
    { type: 'mcp:get-dom', payload: { maxElements: 5, agentId: 'agent_test_smoke', ownershipToken: 'token_test_smoke' } },
    'get_dom_snapshot routes through mcp:get-dom with maxElements payload and agent identity',
  );

  const pageSnapshotCall = await invokeTool(harness, 'get_page_snapshot');
  assertDeepEqual(
    pageSnapshotCall && pageSnapshotCall.message,
    { type: 'mcp:get-page-snapshot', payload: { agentId: 'agent_test_smoke', ownershipToken: 'token_test_smoke' } },
    'get_page_snapshot routes through mcp:get-page-snapshot with agent identity',
  );

  const siteGuideCall = await invokeTool(harness, 'get_site_guide', { domain: 'example.com' });
  assertDeepEqual(
    siteGuideCall && siteGuideCall.message,
    { type: 'mcp:get-site-guides', payload: { domain: 'example.com', url: 'example.com', agentId: 'agent_test_smoke', ownershipToken: 'token_test_smoke' } },
    'get_site_guide routes through mcp:get-site-guides with domain payload and agent identity',
  );

  const clickCall = await invokeTool(harness, 'click', {
    selector: 'e5',
    visual_reason: 'smoke test',
    client: 'Codex',
  });
  assertDeepEqual(
    clickCall && clickCall.message,
    {
      type: 'mcp:execute-action',
      payload: {
        tool: 'click',
        params: { selector: 'e5' },
        visualSession: { visualReason: 'smoke test', client: 'Codex', isFinal: false },
        agentId: 'agent_test_smoke',
        ownershipToken: 'token_test_smoke',
      },
    },
    'click routes through mcp:execute-action with click payload + v0.9.62 visualSession sidecar',
  );

  // v0.9.62 (fsb-mcp-server 0.9.0): start_visual_session + end_visual_session
  // are TOOL_REMOVED stubs. Handlers stay registered (for the migration recipe
  // surface) but they short-circuit BEFORE the task queue and BEFORE the bridge
  // connectivity check -- no bridge dispatch happens. See
  // mcp/src/tools/visual-session.ts and .planning/v0.9.62-CONTRACT.md.
  const startVisualSessionCall = await invokeTool(harness, 'start_visual_session', {
    client: ' codex ',
    task: 'Smoke test the visual lifecycle',
    detail: 'Preparing overlay',
  });
  assert(
    startVisualSessionCall === null,
    'start_visual_session is a TOOL_REMOVED stub and does not dispatch a bridge message',
  );

  const endVisualSessionCall = await invokeTool(harness, 'end_visual_session', {
    session_token: 'visual_token_123',
    reason: 'ended',
  });
  assert(
    endVisualSessionCall === null,
    'end_visual_session is a TOOL_REMOVED stub and does not dispatch a bridge message',
  );

  const runTaskCall = await invokeTool(harness, 'run_task', { task: 'Smoke test the browser bridge' }, harness.createExtra({ progressToken: 'smoke-progress' }));
  assertDeepEqual(
    runTaskCall && runTaskCall.message,
    { type: 'mcp:start-automation', payload: { task: 'Smoke test the browser bridge', agentId: 'agent_test_smoke', ownershipToken: 'token_test_smoke' } },
    'run_task routes through mcp:start-automation with task payload (Phase 238 includes agentId; Phase 240 strengthens with ownershipToken)',
  );

  const stopTaskCall = await invokeTool(harness, 'stop_task');
  assertDeepEqual(
    stopTaskCall && stopTaskCall.message,
    { type: 'mcp:stop-automation', payload: { agentId: 'agent_test_smoke', ownershipToken: 'token_test_smoke' } },
    'stop_task routes through mcp:stop-automation with agentId payload (Phase 238 includes agentId; Phase 240 strengthens with ownershipToken)',
  );

  const getLogsCall = await invokeTool(harness, 'get_logs', { sessionId: 'smoke-session', count: 10 });
  assertDeepEqual(
    getLogsCall && getLogsCall.message,
    { type: 'mcp:get-logs', payload: { sessionId: 'smoke-session', count: 10 } },
    'get_logs routes through mcp:get-logs with observability payload',
  );

  // Phase 242 plan 02: 'back' routes through mcp:go-back. Bridge response
  // surfaces the canonical 5-status envelope; agentScope captures the
  // (optional) ownershipToken via captureOwnershipToken on success.
  const backCall = await invokeTool(harness, 'back');
  assertDeepEqual(
    backCall && backCall.message,
    { type: 'mcp:go-back', payload: { agentId: 'agent_test_smoke', ownershipToken: 'token_test_smoke' } },
    'back routes through mcp:go-back with agentId + ownershipToken (Phase 242 D-01)',
  );

  console.log('\n--- explicit tab_id uses tab-specific ownership token ---');
  agentScope.captureOwnershipToken(77, 'token_tab_77');
  const triggerCall = await invokeTool(harness, 'trigger', {
    selector: '#price',
    condition: { kind: 'changed' },
    target_tab_id: 77,
    watch: 'live-observe',
    timeout_ms: 600_000,
    rearm_on_fire: true,
  });
  const triggerPayload = triggerCall && triggerCall.message && triggerCall.message.payload;
  assert(typeof triggerPayload.trigger_id === 'string' && triggerPayload.trigger_id.length > 0,
    'trigger pre-generates trigger_id for blocking correlation');
  assertDeepEqual(
    triggerCall && triggerCall.message,
    {
      type: 'mcp:trigger',
      payload: {
        selector: '#price',
        condition: { kind: 'changed' },
        target_tab_id: 77,
        watch: 'live-observe',
        timeout_ms: 600_000,
        rearm_on_fire: true,
        trigger_id: triggerPayload.trigger_id,
        agentId: 'agent_test_smoke',
        ownershipToken: 'token_tab_77',
      },
    },
    'trigger routes through mcp:trigger with registry params, generated trigger_id, agentId, and tab-specific ownership token',
  );
  assert(triggerCall && triggerCall.options && triggerCall.options.timeout > 240_000,
    'blocking trigger uses bridge timeout above the 240s safety ceiling');
  assert(triggerCall && triggerCall.options && typeof triggerCall.options.onProgress === 'function',
    'blocking trigger installs onProgress handler for heartbeats');

  const detachedTriggerCall = await invokeTool(harness, 'trigger', {
    selector: '#price',
    condition: { kind: 'changed' },
    target_tab_id: 77,
    watch: 'live-observe',
    detached: true,
  });
  const detachedPayload = detachedTriggerCall && detachedTriggerCall.message && detachedTriggerCall.message.payload;
  assert(typeof detachedPayload.trigger_id === 'string' && detachedPayload.trigger_id.length > 0,
    'detached trigger also pre-generates trigger_id');
  assertDeepEqual(
    detachedTriggerCall && detachedTriggerCall.message,
    {
      type: 'mcp:trigger',
      payload: {
        selector: '#price',
        condition: { kind: 'changed' },
        target_tab_id: 77,
        watch: 'live-observe',
        detached: true,
        trigger_id: detachedPayload.trigger_id,
        agentId: 'agent_test_smoke',
        ownershipToken: 'token_tab_77',
      },
    },
    'detached trigger routes through mcp:trigger with generated trigger_id and detached flag',
  );
  assertDeepEqual(
    detachedTriggerCall && detachedTriggerCall.options,
    { timeout: 30_000, onProgress: undefined },
    'detached trigger keeps bounded 30s bridge timeout and no progress handler',
  );

  const stopTriggerCall = await invokeTool(harness, 'stop_trigger', { trigger_id: 'trg_smoke', tab_id: 77 });
  assertDeepEqual(
    stopTriggerCall && stopTriggerCall.message,
    {
      type: 'mcp:stop-trigger',
      payload: {
        trigger_id: 'trg_smoke',
        tab_id: 77,
        agentId: 'agent_test_smoke',
        ownershipToken: 'token_tab_77',
      },
    },
    'stop_trigger routes through mcp:stop-trigger with agentId and ownership token',
  );
  assertDeepEqual(
    stopTriggerCall && stopTriggerCall.options,
    { timeout: 10_000, onProgress: undefined },
    'stop_trigger uses bounded 10s bridge timeout',
  );

  const getTriggerStatusCall = await invokeTool(harness, 'get_trigger_status', { trigger_id: 'trg_smoke', tab_id: 77 });
  assertDeepEqual(
    getTriggerStatusCall && getTriggerStatusCall.message,
    {
      type: 'mcp:get-trigger-status',
      payload: {
        trigger_id: 'trg_smoke',
        tab_id: 77,
        agentId: 'agent_test_smoke',
        ownershipToken: 'token_tab_77',
      },
    },
    'get_trigger_status routes through mcp:get-trigger-status with agentId and ownership token',
  );
  assertDeepEqual(
    getTriggerStatusCall && getTriggerStatusCall.options,
    { timeout: 5_000, onProgress: undefined },
    'get_trigger_status uses bounded 5s bridge timeout',
  );

  const listTriggersCall = await invokeTool(harness, 'list_triggers', { status: 'armed', tab_id: 77 });
  assertDeepEqual(
    listTriggersCall && listTriggersCall.message,
    {
      type: 'mcp:list-triggers',
      payload: {
        status: 'armed',
        tab_id: 77,
        agentId: 'agent_test_smoke',
        ownershipToken: 'token_tab_77',
      },
    },
    'list_triggers routes through mcp:list-triggers with agentId and ownership token',
  );
  assertDeepEqual(
    listTriggersCall && listTriggersCall.options,
    { timeout: 5_000, onProgress: undefined },
    'list_triggers uses bounded 5s bridge timeout',
  );

  const explicitReadPageCall = await invokeTool(harness, 'read_page', { full: true, tab_id: 77 });
  assertDeepEqual(
    explicitReadPageCall && explicitReadPageCall.message,
    { type: 'mcp:read-page', payload: { full: true, tab_id: 77, agentId: 'agent_test_smoke', ownershipToken: 'token_tab_77' } },
    'read_page with tab_id uses ownershipTokenFor(tab_id)',
  );

  const explicitBackCall = await invokeTool(harness, 'back', { tab_id: 77 });
  assertDeepEqual(
    explicitBackCall && explicitBackCall.message,
    { type: 'mcp:go-back', payload: { agentId: 'agent_test_smoke', ownershipToken: 'token_tab_77', tabId: 77 } },
    'back with tab_id uses ownershipTokenFor(tab_id)',
  );

  const explicitCloseTabCall = await invokeTool(harness, 'close_tab', {
    tab_id: 77,
    visual_reason: 'smoke test',
    client: 'Codex',
  });
  assertDeepEqual(
    explicitCloseTabCall && explicitCloseTabCall.message,
    {
      type: 'mcp:execute-action',
      payload: {
        tool: 'close_tab',
        params: { tab_id: 77 },
        visualSession: { visualReason: 'smoke test', client: 'Codex', isFinal: false },
        agentId: 'agent_test_smoke',
        ownershipToken: 'token_tab_77',
      },
    },
    'close_tab with tab_id uses ownershipTokenFor(tab_id) + v0.9.62 visualSession sidecar',
  );

  console.log('\n--- agent:register lazy-mint invariant (Phase 238 D-13.4) ---');
  const registerCalls = harness.bridgeCalls.filter((c) => c.message && c.message.type === 'agent:register');
  assert(registerCalls.length === 1, 'agent:register must fire exactly once across all tool invocations; saw ' + registerCalls.length);

  console.log('\n--- queue coverage ---');
  // v0.9.62 (fsb-mcp-server 0.9.0): start_visual_session + end_visual_session
  // are TOOL_REMOVED stubs that short-circuit BEFORE queue.enqueue (see
  // mcp/src/tools/visual-session.ts). They are excluded from queue coverage
  // alongside stop_task (which stays direct so cancellation does not wait
  // behind queued work).
  const DIRECT_TOOLS = new Set(['stop_task', 'start_visual_session', 'end_visual_session', 'trigger', 'stop_trigger', 'get_trigger_status', 'list_triggers']);
  for (const toolName of requiredSmokeTools.filter((name) => !DIRECT_TOOLS.has(name))) {
    assert(harness.queueCalls.includes(toolName), `${toolName} passes through the shared queue surface`);
  }
  assert(!harness.queueCalls.includes('stop_task'), 'stop_task stays direct so cancellation does not wait behind queued work');
  assert(!harness.queueCalls.includes('trigger'), 'trigger dispatches directly from the trigger registrar');
  assert(!harness.queueCalls.includes('stop_trigger'), 'stop_trigger dispatches directly so cancellation does not wait behind queued work');
  assert(!harness.queueCalls.includes('get_trigger_status'), 'get_trigger_status dispatches directly so status does not wait behind queued work');
  assert(!harness.queueCalls.includes('list_triggers'), 'list_triggers dispatches directly so listing does not wait behind queued work');
  assert(!harness.queueCalls.includes('start_visual_session'), 'start_visual_session is a TOOL_REMOVED stub and does not enqueue');
  assert(!harness.queueCalls.includes('end_visual_session'), 'end_visual_session is a TOOL_REMOVED stub and does not enqueue');

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

function pathJoin(...parts) {
  return parts.join('/');
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
