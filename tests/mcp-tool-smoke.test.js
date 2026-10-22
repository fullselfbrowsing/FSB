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
  'complete_task',
  'partial_task',
  'fail_task',
  'trigger',
  'stop_trigger',
  'get_trigger_status',
  'list_triggers',
  'get_logs',
  'get_session_replay',
  'replay_session',
  'back',
  'settings',
];

// Session journals (ac377038) stamp every agent-scoped bridge payload with
// correlation fields in buildAgentPayload() -- mcp/src/agent-bridge.ts. Two of
// them are random UUIDs, so a whole-payload deepEqual can never match. Assert
// the sidecar contract here, once per call, then strip it so the routing
// assertions below stay about routing.
const RECORDING_SIDECAR_FIELDS = ['recordingCallId', 'recordingRunId', 'recordingLeaseMs'];
// Phase 69 D-15: the same-call `expect` check also travels as a top-level
// sidecar, but only when the caller sent one. This suite never sends it, so no
// captured payload may carry it (tests/expect-parity.test.js pins this line).
const EXPECT_SIDECAR_FIELDS = ['expect'];
const RECORDING_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function describeSidecar(payload) {
  const seen = {};
  for (const field of RECORDING_SIDECAR_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) seen[field] = payload[field];
  }
  return JSON.stringify(seen);
}

function normalizeRecordingSidecar(toolName, call) {
  const payload = call && call.message && call.message.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return call;

  const expectLeaked = EXPECT_SIDECAR_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
  assert(expectLeaked.length === 0,
    `${toolName} sends no expect sidecar when the caller sent none`
      + (expectLeaked.length === 0 ? '' : ` (unexpected: ${expectLeaked.join(', ')})`));

  // buildAgentPayload() sets agentId and the correlation fields together, so
  // agentId is the discriminator for whether the sidecar must be present.
  if (Object.prototype.hasOwnProperty.call(payload, 'agentId')) {
    // recordingRunId is conditional on the scope supporting the call lifecycle,
    // so it is optional -- but must still be a UUID when it is emitted.
    const valid = RECORDING_UUID_PATTERN.test(payload.recordingCallId)
      && Number.isInteger(payload.recordingLeaseMs)
      && payload.recordingLeaseMs > 0
      && (payload.recordingRunId === undefined
        || RECORDING_UUID_PATTERN.test(payload.recordingRunId));
    assert(valid,
      `${toolName} carries a well-formed journal sidecar on its agent-scoped send `
        + `(got: ${describeSidecar(payload)})`);
  } else {
    const leaked = RECORDING_SIDECAR_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
    assert(leaked.length === 0,
      `${toolName} sends no journal sidecar without an agentId to correlate it `
        + `(unexpected: ${leaked.join(', ') || 'none'})`);
  }

  const stripped = { ...payload };
  for (const field of RECORDING_SIDECAR_FIELDS) delete stripped[field];
  return { ...call, message: { ...call.message, payload: stripped } };
}

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
  return call ? normalizeRecordingSidecar(toolName, call) : call;
}

// Phase 66.1: settings tool fixtures. These key names are test data only; the
// tool source itself carries no setting key literal (SC4).
const SMOKE_SETTINGS = { debugMode: false, maxIterations: 100, apiKey: '[set]' };
const SMOKE_SETTING_TYPES = { debugMode: 'boolean', maxIterations: 'integer', apiKey: 'string' };
const SMOKE_READ_ONLY = ['apiKey'];
const SETTINGS_FALLBACK_NEXT_ACTION =
  'Call settings with only a key to see its type and allowed values, or with no arguments to list every setting.';
const SETTINGS_UNSUPPORTED_NEXT_ACTION =
  'Update the FSB extension, or change the setting in the FSB Control Panel.';

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function smokeSettingsRead({ payload }) {
  if (!hasOwn(payload, 'key')) {
    return { success: true, settings: { ...SMOKE_SETTINGS }, readOnly: [...SMOKE_READ_ONLY] };
  }
  if (payload.key === 'storageBroken') {
    return {
      success: false,
      code: 'SETTING_STORAGE_FAILED',
      errorCode: 'SETTING_STORAGE_FAILED',
      error: 'Settings storage could not be read.',
    };
  }
  if (!hasOwn(SMOKE_SETTINGS, payload.key)) {
    return {
      success: false,
      code: 'SETTING_UNKNOWN_KEY',
      errorCode: 'SETTING_UNKNOWN_KEY',
      error: 'Unknown setting key. Call settings with no arguments to list keys.',
    };
  }
  const answer = {
    success: true,
    key: payload.key,
    value: SMOKE_SETTINGS[payload.key],
    type: SMOKE_SETTING_TYPES[payload.key],
    writable: payload.key !== 'apiKey',
  };
  if (payload.key === 'maxIterations') answer.range = { min: 50, max: 500 };
  return answer;
}

function smokeSettingsWrite({ payload }) {
  // The extension refuses an unknown or protected key before it reads a value,
  // so the tool sends those writes without one.
  if (!hasOwn(payload, 'value')) {
    if (payload.key === 'apiKey') {
      return {
        success: false,
        code: 'SETTING_PROTECTED_KEY',
        errorCode: 'SETTING_PROTECTED_KEY',
        error: 'apiKey is read-only over MCP; change it in the FSB Control Panel.',
        recoveryHint: 'Change this setting in the FSB Control Panel.',
      };
    }
    return {
      success: false,
      code: 'SETTING_UNKNOWN_KEY',
      errorCode: 'SETTING_UNKNOWN_KEY',
      error: 'Unknown setting key. Call settings with no arguments to list keys.',
    };
  }
  return { success: true, key: payload.key, value: true, previous: false, changed: [payload.key] };
}

// Calls the settings handler and returns its result plus every tool-owned
// bridge message it sent (agent:register skipped, journal sidecar stripped).
async function invokeSettings(harness, params = {}) {
  const handler = harness.getHandler('settings');
  assert(typeof handler === 'function', 'settings registers a callable MCP handler');
  if (typeof handler !== 'function') return { result: null, calls: [], stderr: [] };
  const before = harness.bridgeCalls.length;
  const stderr = [];
  const originalConsoleError = console.error;
  console.error = (...args) => { stderr.push(args.map(String).join(' ')); };
  let result;
  try {
    result = await handler(params, harness.createExtra());
  } finally {
    console.error = originalConsoleError;
  }
  const calls = harness.bridgeCalls.slice(before)
    .filter((entry) => !(entry && entry.message && entry.message.type === 'agent:register'))
    .map((entry) => normalizeRecordingSidecar('settings', entry));
  assert(result && Array.isArray(result.content) && result.content.length === 1
    && result.content[0].type === 'text' && typeof result.content[0].text === 'string',
  'settings returns exactly one MCP text content item');
  return { result, calls, stderr };
}

async function run() {
  const runtimeModule = await loadBuildModule('runtime.js');
  const readOnlyModule = await loadBuildModule(pathJoin('tools', 'read-only.js'));
  const screenshotsModule = await loadBuildModule(pathJoin('tools', 'screenshots.js'));
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
  // Phase 66.1: the settings tool registers directly (out of TOOL_REGISTRY).
  const settingsModule = await loadBuildModule(pathJoin('tools', 'settings.js'));

  console.log('\n--- packaged runtime surface ---');
  assert(typeof runtimeModule.createRuntime === 'function', 'build/runtime.js exports createRuntime');
  assert(typeof readOnlyModule.registerReadOnlyTools === 'function', 'build/tools/read-only.js exports registerReadOnlyTools');
  assert(typeof screenshotsModule.registerScreenshotTools === 'function', 'build/tools/screenshots.js exports registerScreenshotTools');
  assert(typeof manualModule.registerManualTools === 'function', 'build/tools/manual.js exports registerManualTools');
  assert(typeof visualSessionModule.registerVisualSessionTools === 'function', 'build/tools/visual-session.js exports registerVisualSessionTools');
  assert(typeof autopilotModule.registerAutopilotTools === 'function', 'build/tools/autopilot.js exports registerAutopilotTools');
  assert(typeof triggersModule.registerTriggerTools === 'function', 'build/tools/triggers.js exports registerTriggerTools');
  assert(typeof observabilityModule.registerObservabilityTools === 'function', 'build/tools/observability.js exports registerObservabilityTools');
  assert(typeof agentsModule.registerAgentTools === 'function', 'build/tools/agents.js exports registerAgentTools');
  assert(typeof settingsModule.registerSettingsTool === 'function', 'build/tools/settings.js exports registerSettingsTool');

  const harness = createToolHarness({
    bridgeResponses: {
      'mcp:get-tabs': { success: true, tabs: [{ id: 7, active: true, url: 'https://example.com' }] },
      'mcp:execute-action': ({ payload }) => ({ success: true, executed: payload.tool }),
      'mcp:read-page': { success: true, content: 'Example page' },
      'mcp:get-dom': { success: true, elements: [{ ref: 'e5' }] },
      'mcp:get-page-snapshot': { success: true, snapshot: '# Example\n- e1: button "Submit"', elementCount: 1 },
      'mcp:get-site-guides': { success: true, guide: { site: 'example.com', selectors: {} } },
      'mcp:get-session-replay': {
        success: true,
        replay: { verified: true, manifestHash: 'smoke-manifest-hash', steps: [] }
      },
      'mcp:replay-session': {
        success: true,
        status: 'approval_required',
        requestId: 'smoke-replay-approval'
      },
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
      'mcp:task-status': ({ payload }) => {
        if (payload.tool === 'fail_task') {
          return {
            success: false,
            tool: 'fail_task',
            status: 'failed',
            error: payload.params.reason,
            reason: payload.params.reason,
          };
        }
        return {
          success: true,
          tool: payload.tool,
          status: payload.tool === 'complete_task' ? 'completed' : 'partial',
        };
      },
      'mcp:trigger': ({ payload }) => ({ success: true, trigger_id: 'trg_smoke', status: 'armed', owner: payload.agentId }),
      'mcp:stop-trigger': ({ payload }) => ({ success: true, trigger_id: payload.trigger_id, stopped: true }),
      'mcp:get-trigger-status': ({ payload }) => ({ success: true, trigger_id: payload.trigger_id, status: 'armed' }),
      'mcp:list-triggers': { success: true, triggers: [] },
      'mcp:get-logs': { success: true, logs: [] },
      'mcp:get-settings': smokeSettingsRead,
      'mcp:set-setting': smokeSettingsWrite,
    },
  });

  // Phase 238 D-11: register*Tools accepts AgentScope as the 4th arg.
  // The harness's bridge.sendAndWait responds to type 'agent:register'
  // with a deterministic { agentId: 'agent_test_smoke', ... } payload.
  const agentScope = await loadAgentScope();
  readOnlyModule.registerReadOnlyTools(harness.server, harness.bridge, harness.queue, agentScope);
  screenshotsModule.registerScreenshotTools(harness.server, harness.bridge, harness.queue, agentScope);
  manualModule.registerManualTools(harness.server, harness.bridge, harness.queue, agentScope);
  visualSessionModule.registerVisualSessionTools(harness.server, harness.bridge, harness.queue, agentScope);
  triggersModule.registerTriggerTools(harness.server, harness.bridge, harness.queue, agentScope);
  autopilotModule.registerAutopilotTools(harness.server, harness.bridge, harness.queue, agentScope);
  observabilityModule.registerObservabilityTools(harness.server, harness.bridge, harness.queue, agentScope);
  // Phase 242 D-01: registerAgentTools registers the 'back' MCP tool. Loaded
  // last so the smoke test's registered-handlers assertion (line 118) sees it.
  agentsModule.registerAgentTools(harness.server, harness.bridge, harness.queue, agentScope);
  settingsModule.registerSettingsTool(harness.server, harness.bridge, harness.queue, agentScope);

  console.log('\n--- registered smoke tools ---');
  for (const toolName of requiredSmokeTools) {
    assert(harness.handlers.has(toolName), `registered handlers include ${toolName}`);
  }
  assert(harness.handlers.has('capture_screenshot'), 'registered handlers include capture_screenshot');

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

  const completeTaskCall = await invokeTool(harness, 'complete_task', {
    summary: 'Smoke task completed',
    tab_id: 7,
  });
  assertDeepEqual(
    completeTaskCall && completeTaskCall.message,
    {
      type: 'mcp:task-status',
      payload: {
        tool: 'complete_task',
        params: { summary: 'Smoke task completed', tab_id: 7 },
        agentId: 'agent_test_smoke',
        ownershipToken: 'token_test_smoke',
      },
    },
    'complete_task routes its client-authored summary with agent identity and tab_id',
  );

  const partialTaskCall = await invokeTool(harness, 'partial_task', {
    summary: 'Useful work completed',
    blocker: 'Manual approval required',
    next_step: 'Approve the operation',
  });
  assertDeepEqual(
    partialTaskCall && partialTaskCall.message,
    {
      type: 'mcp:task-status',
      payload: {
        tool: 'partial_task',
        params: {
          summary: 'Useful work completed',
          blocker: 'Manual approval required',
          next_step: 'Approve the operation',
        },
        agentId: 'agent_test_smoke',
        ownershipToken: 'token_test_smoke',
      },
    },
    'partial_task routes summary, blocker, and next step through mcp:task-status',
  );

  const failTaskHandler = harness.getHandler('fail_task');
  assert(typeof failTaskHandler === 'function', 'fail_task registers a callable MCP handler');
  const failTaskCallStart = harness.bridgeCalls.length;
  const failTaskResult = await failTaskHandler(
    { reason: 'Unrecoverable test failure' },
    harness.createExtra(),
  );
  // Invoked directly rather than through invokeTool (it asserts on the handler's
  // own error-shaped return), so apply the same sidecar contract by hand.
  const failTaskCall = normalizeRecordingSidecar(
    'fail_task',
    harness.bridgeCalls[failTaskCallStart],
  );
  assertDeepEqual(
    failTaskCall && failTaskCall.message,
    {
      type: 'mcp:task-status',
      payload: {
        tool: 'fail_task',
        params: { reason: 'Unrecoverable test failure' },
        agentId: 'agent_test_smoke',
        ownershipToken: 'token_test_smoke',
      },
    },
    'fail_task routes the client-authored reason through mcp:task-status',
  );
  assert(
    failTaskResult && failTaskResult.isError !== true,
    'a recorded fail_task outcome is returned as a normal MCP acknowledgement',
  );
  assertDeepEqual(
    JSON.parse(failTaskResult.content[0].text),
    {
      success: false,
      tool: 'fail_task',
      status: 'failed',
      error: 'Unrecoverable test failure',
      reason: 'Unrecoverable test failure',
    },
    'fail_task acknowledgement preserves the recorded failure details',
  );

  const getLogsCall = await invokeTool(harness, 'get_logs', { sessionId: 'smoke-session', count: 10 });
  assertDeepEqual(
    getLogsCall && getLogsCall.message,
    { type: 'mcp:get-logs', payload: { sessionId: 'smoke-session', count: 10 } },
    'get_logs routes through mcp:get-logs with observability payload',
  );

  const getReplayCall = await invokeTool(harness, 'get_session_replay', { sessionId: 'smoke-session' });
  assertDeepEqual(
    getReplayCall && getReplayCall.message,
    { type: 'mcp:get-session-replay', payload: { sessionId: 'smoke-session' } },
    'get_session_replay requests the verified structured manifest',
  );

  const replaySessionCall = await invokeTool(harness, 'replay_session', { sessionId: 'smoke-session' });
  assertDeepEqual(
    replaySessionCall && replaySessionCall.message,
    { type: 'mcp:replay-session', payload: { sessionId: 'smoke-session' } },
    'replay_session requests side-panel consent without target-page input',
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

  console.log('\n--- settings tool (Phase 66.1: queue-free, compact, value-safe) ---');
  const settingsEntry = harness.handlers.get('settings');
  assert(
    settingsEntry && settingsEntry.description === 'Read or change FSB settings. No args returns all; key returns one with its allowed values; key and value sets it. API keys and endpoints are read-only.',
    'settings registers the exact D-03 description',
  );
  assertDeepEqual(
    settingsEntry && Object.keys(settingsEntry.schema || {}),
    ['key', 'value'],
    'settings input schema has exactly the optional key and value params',
  );

  const settingsReadAll = await invokeSettings(harness);
  assertDeepEqual(
    settingsReadAll.calls.map((call) => call.message),
    [{ type: 'mcp:get-settings', payload: { agentId: 'agent_test_smoke' } }],
    'settings with no args sends exactly one mcp:get-settings with agent identity and no ownershipToken',
  );
  assertDeepEqual(
    settingsReadAll.calls[0] && settingsReadAll.calls[0].options,
    { timeout: 10_000, onProgress: undefined },
    'settings uses a bounded 10s bridge timeout',
  );
  const readAllText = settingsReadAll.result.content[0].text;
  assert(settingsReadAll.result.isError !== true, 'settings read-all succeeds');
  assert(!readAllText.includes('\n'), 'settings read-all output is compact single-line JSON');
  assertDeepEqual(
    JSON.parse(readAllText),
    { settings: SMOKE_SETTINGS, readOnly: SMOKE_READ_ONLY },
    'settings read-all output is {settings, readOnly} only',
  );

  const settingsReadOne = await invokeSettings(harness, { key: 'maxIterations' });
  assertDeepEqual(
    settingsReadOne.calls.map((call) => call.message),
    [{ type: 'mcp:get-settings', payload: { key: 'maxIterations', agentId: 'agent_test_smoke' } }],
    'settings with only a key sends one mcp:get-settings {key}',
  );
  const readOneText = settingsReadOne.result.content[0].text;
  assert(!readOneText.includes('\n'), 'settings read-one output is compact single-line JSON');
  assertDeepEqual(
    JSON.parse(readOneText),
    { key: 'maxIterations', value: 100, type: 'integer', writable: true, range: { min: 50, max: 500 } },
    'settings read-one output is {key, value, type, writable} plus range',
  );

  const settingsWrite = await invokeSettings(harness, { key: 'debugMode', value: 'true' });
  assertDeepEqual(
    settingsWrite.calls.map((call) => call.message),
    [
      { type: 'mcp:get-settings', payload: { key: 'debugMode', agentId: 'agent_test_smoke' } },
      { type: 'mcp:set-setting', payload: { key: 'debugMode', value: 'true', agentId: 'agent_test_smoke' } },
    ],
    'settings write reads the key first, then sends mcp:set-setting {key, value} for a writable key',
  );
  assertDeepEqual(
    settingsWrite.calls.map((call) => call.options),
    [{ timeout: 10_000, onProgress: undefined }, { timeout: 10_000, onProgress: undefined }],
    'settings write uses the bounded 10s timeout for the preflight and the write',
  );
  const writeText = settingsWrite.result.content[0].text;
  assert(settingsWrite.result.isError !== true, 'settings write succeeds');
  assert(!writeText.includes('\n'), 'settings write output is compact single-line JSON');
  assertDeepEqual(
    JSON.parse(writeText),
    { key: 'debugMode', value: true, previous: false, changed: ['debugMode'] },
    'settings write output is {key, value, previous, changed} only',
  );

  const secretSentinel = 'sk-SMOKE-SENTINEL';
  const secretBridgeStart = harness.bridgeCalls.length;
  const settingsSecret = await invokeSettings(harness, { key: 'apiKey', value: secretSentinel });
  assertDeepEqual(
    settingsSecret.calls.map((call) => call.message),
    [
      { type: 'mcp:get-settings', payload: { key: 'apiKey', agentId: 'agent_test_smoke' } },
      { type: 'mcp:set-setting', payload: { key: 'apiKey', agentId: 'agent_test_smoke' } },
    ],
    'a write to a read-only key sends mcp:set-setting {key} without the value',
  );
  const rawSecretWrite = harness.bridgeCalls.slice(secretBridgeStart)
    .find((entry) => entry.message && entry.message.type === 'mcp:set-setting');
  assert(rawSecretWrite && !hasOwn(rawSecretWrite.message.payload, 'value'),
    'the raw mcp:set-setting payload for a read-only key has no value field');
  assert(!JSON.stringify(harness.bridgeCalls).includes('SMOKE-SENTINEL'),
    'no recorded bridge message contains the submitted secret value');
  const secretText = settingsSecret.result.content[0].text;
  assert(settingsSecret.result.isError === true, 'a read-only key write returns an MCP error');
  assert(secretText.startsWith('Detected: Settings\nWhy: SETTING_PROTECTED_KEY: '),
    'a read-only key write renders SETTING_PROTECTED_KEY under the Settings layer');
  assert(secretText.includes('Next action: Change this setting in the FSB Control Panel.'),
    'the extension recovery hint is the Next action');
  assert(!secretText.includes('SMOKE-SENTINEL') && !settingsSecret.stderr.join('\n').includes('SMOKE-SENTINEL'),
    'neither the error text nor stderr contains the submitted value');

  const unknownSentinel = 'UNKNOWN-KEY-SENTINEL';
  const unknownBridgeStart = harness.bridgeCalls.length;
  const settingsUnknown = await invokeSettings(harness, { key: 'noSuchSetting', value: unknownSentinel });
  assertDeepEqual(
    settingsUnknown.calls.map((call) => call.message),
    [
      { type: 'mcp:get-settings', payload: { key: 'noSuchSetting', agentId: 'agent_test_smoke' } },
      { type: 'mcp:set-setting', payload: { key: 'noSuchSetting', agentId: 'agent_test_smoke' } },
    ],
    'a write to an unknown key sends mcp:set-setting {key} without the value so the extension logs the refusal',
  );
  assert(!JSON.stringify(harness.bridgeCalls.slice(unknownBridgeStart)).includes(unknownSentinel),
    'no bridge message carries the value for an unknown key');
  const unknownText = settingsUnknown.result.content[0].text;
  assert(unknownText.startsWith('Detected: Settings\nWhy: SETTING_UNKNOWN_KEY: '),
    'an unknown key renders SETTING_UNKNOWN_KEY, not element_not_found');
  assert(unknownText.includes('Next action: ' + SETTINGS_FALLBACK_NEXT_ACTION),
    'an extension failure without recoveryHint uses the settings fallback Next action');
  assert(!unknownText.includes(unknownSentinel) && !settingsUnknown.stderr.join('\n').includes(unknownSentinel),
    'the unknown-key error text and stderr carry no value');

  const settingsPreflightFailure = await invokeSettings(harness, { key: 'storageBroken', value: '1' });
  assertDeepEqual(
    settingsPreflightFailure.calls.map((call) => call.message.type),
    ['mcp:get-settings'],
    'any other preflight failure returns without sending a write',
  );
  assert(settingsPreflightFailure.result.content[0].text.startsWith('Detected: Settings\nWhy: SETTING_STORAGE_FAILED: '),
    'the preflight failure renders its own SETTING_ code');

  const localChecks = [
    { label: 'value without key', params: { value: 'x' } },
    { label: 'a key longer than 64 characters', params: { key: 'k'.repeat(65) } },
    { label: 'a value longer than 2048 characters', params: { key: 'debugMode', value: 'V'.repeat(2049) } },
  ];
  for (const check of localChecks) {
    const localBridgeStart = harness.bridgeCalls.length;
    const local = await invokeSettings(harness, check.params);
    const localText = local.result.content[0].text;
    assert(harness.bridgeCalls.length === localBridgeStart, `settings with ${check.label} makes no bridge call`);
    assert(local.result.isError === true && localText.startsWith('Detected: Settings\nWhy: SETTING_REQUEST_INVALID: '),
      `settings with ${check.label} returns SETTING_REQUEST_INVALID locally`);
    assert(localText.includes('Next action: ' + SETTINGS_FALLBACK_NEXT_ACTION),
      `settings with ${check.label} points to a key-only read`);
    assert(!localText.includes('VVVV') && !local.stderr.join('\n').includes('VVVV'),
      `settings with ${check.label} does not echo the value`);
  }
  const boundaryKey = await invokeSettings(harness, { key: 'k'.repeat(64) });
  assert(boundaryKey.calls.length === 1, 'a 64-character key is within the local limit and reaches the extension');

  console.log('\n--- settings tool against an extension without settings support ---');
  const unsupportedHarness = createToolHarness({
    bridgeResponses: {
      'mcp:get-settings': { success: false, error: 'Unknown MCP message type: mcp:get-settings' },
    },
  });
  settingsModule.registerSettingsTool(
    unsupportedHarness.server, unsupportedHarness.bridge, unsupportedHarness.queue, await loadAgentScope(),
  );
  const unsupportedSentinel = 'UNSUPPORTED-VALUE-SENTINEL';
  const unsupportedWrite = await invokeSettings(unsupportedHarness, { key: 'debugMode', value: unsupportedSentinel });
  const unsupportedText = unsupportedWrite.result.content[0].text;
  assert(unsupportedWrite.result.isError === true
    && unsupportedText.startsWith('Detected: Settings\nWhy: SETTING_UNSUPPORTED: '),
  'a write to an extension without settings support returns SETTING_UNSUPPORTED');
  assert(unsupportedText.includes('Next action: ' + SETTINGS_UNSUPPORTED_NEXT_ACTION),
    'SETTING_UNSUPPORTED tells the client to update the extension or use the Control Panel');
  assert(!unsupportedHarness.bridgeCalls.some((entry) => entry.message && entry.message.type === 'mcp:set-setting'),
    'no mcp:set-setting is sent when the preflight read is unsupported');
  assert(!JSON.stringify(unsupportedHarness.bridgeCalls).includes(unsupportedSentinel),
    'the value never leaves the MCP process when settings are unsupported');
  const unsupportedRead = await invokeSettings(unsupportedHarness);
  assert(unsupportedRead.result.content[0].text.startsWith('Detected: Settings\nWhy: SETTING_UNSUPPORTED: '),
    'a read from an extension without settings support returns SETTING_UNSUPPORTED');
  assert(unsupportedHarness.queueCalls.length === 0, 'the unsupported settings path never enqueues');

  const setUnsupportedHarness = createToolHarness({
    bridgeResponses: {
      'mcp:get-settings': smokeSettingsRead,
      'mcp:set-setting': { success: false, error: 'Unknown MCP message type: mcp:set-setting' },
    },
  });
  settingsModule.registerSettingsTool(
    setUnsupportedHarness.server, setUnsupportedHarness.bridge, setUnsupportedHarness.queue, await loadAgentScope(),
  );
  const setUnsupported = await invokeSettings(setUnsupportedHarness, { key: 'debugMode', value: 'false' });
  assert(setUnsupported.result.content[0].text.startsWith('Detected: Settings\nWhy: SETTING_UNSUPPORTED: '),
    'an unsupported mcp:set-setting reply also returns SETTING_UNSUPPORTED');

  const disconnectedHarness = createToolHarness({ connected: false });
  settingsModule.registerSettingsTool(
    disconnectedHarness.server, disconnectedHarness.bridge, disconnectedHarness.queue, await loadAgentScope(),
  );
  const disconnected = await invokeSettings(disconnectedHarness, { key: 'debugMode', value: 'true' });
  assert(disconnected.result.isError === true && disconnectedHarness.bridgeCalls.length === 0,
    'settings without an extension connection returns an error and makes no bridge call');

  const throwingHarness = createToolHarness({
    onSendAndWait(message) {
      throw new Error(`Request smoke-1 (${message.type}) timed out after 10000ms`);
    },
  });
  settingsModule.registerSettingsTool(
    throwingHarness.server, throwingHarness.bridge, throwingHarness.queue, await loadAgentScope(),
  );
  let thrownResult = null;
  try {
    thrownResult = await invokeSettings(throwingHarness, { key: 'debugMode', value: 'THROWN-SENTINEL' });
  } catch (_error) {
    thrownResult = null;
  }
  assert(thrownResult && thrownResult.result && thrownResult.result.isError === true,
    'a bridge timeout is caught and rendered as an MCP error');
  assert(thrownResult && !thrownResult.result.content[0].text.includes('THROWN-SENTINEL'),
    'a rendered bridge timeout carries no value');

  console.log('\n--- agent:register lazy-mint invariant (Phase 238 D-13.4) ---');
  const registerCalls = harness.bridgeCalls.filter((c) => c.message && c.message.type === 'agent:register');
  assert(registerCalls.length === 1, 'agent:register must fire exactly once across all tool invocations; saw ' + registerCalls.length);

  console.log('\n--- queue coverage ---');
  // v0.9.62 (fsb-mcp-server 0.9.0): start_visual_session + end_visual_session
  // are TOOL_REMOVED stubs that short-circuit BEFORE queue.enqueue (see
  // mcp/src/tools/visual-session.ts). They are excluded from queue coverage
  // alongside stop_task (which stays direct so cancellation does not wait
  // behind queued work).
  const DIRECT_TOOLS = new Set(['stop_task', 'start_visual_session', 'end_visual_session', 'trigger', 'stop_trigger', 'get_trigger_status', 'list_triggers', 'settings']);
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
  assert(!harness.queueCalls.includes('settings'), 'settings bypasses the queue for reads and writes (Phase 66.1 D-05)');

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
