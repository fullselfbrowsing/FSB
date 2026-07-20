'use strict';

const path = require('path');
const util = require('util');

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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const repoRoot = path.resolve(__dirname, '..');
const dispatcherRelativePath = 'extension/ws/mcp-tool-dispatcher.js';
const dispatcherPath = path.join(repoRoot, dispatcherRelativePath);
const { TOOL_REGISTRY } = require(path.join(repoRoot, 'extension', 'ai', 'tool-definitions.js'));

const requiredPublicRoutes = [
  'navigate',
  'go_back',
  'go_forward',
  'refresh',
  'open_tab',
  'switch_tab',
  'close_tab',
  'list_tabs',
  'start_visual_session',
  'end_visual_session',
  'run_task',
  'stop_task',
  'get_task_status',
  'get_site_guide',
  'list_sessions',
  'get_session_detail',
  'get_logs',
  'search_memory',
  'get_memory_stats',
  'read_page',
  'get_dom_snapshot',
  'get_page_snapshot',
  'trigger',
  'stop_trigger',
  'get_trigger_status',
  'list_triggers'
];

const requiredMessageRoutes = [
  'mcp:get-tabs',
  'mcp:get-dom',
  'mcp:read-page',
  'mcp:start-visual-session',
  'mcp:end-visual-session',
  'mcp:start-automation',
  'mcp:stop-automation',
  'mcp:get-status',
  'mcp:get-site-guides',
  'mcp:get-page-snapshot',
  'mcp:list-sessions',
  'mcp:get-session',
  'mcp:get-logs',
  'mcp:search-memory',
  'mcp:get-memory',
  'mcp:go-back',
  'mcp:trigger',
  'mcp:stop-trigger',
  'mcp:get-trigger-status',
  'mcp:list-triggers'
];

// Phase 199 left fill_credential / fill_payment_method out of the route-contract
// expansion. Those tool names were subsequently removed from TOOL_REGISTRY
// (vault flow consolidated under list_credentials / use_payment_method); the
// exclusion list is therefore empty until a vault tool is reintroduced.
const phase199VaultExclusions = new Set([]);

const groupDefinitions = {
  browser: {
    tools: [
      'navigate',
      'go_back',
      'go_forward',
      'refresh',
      'open_tab',
      'switch_tab',
      'close_tab',
      'list_tabs',
      'get_site_guide',
      'execute_js',
      'report_progress',
      'complete_task',
      'partial_task',
      'fail_task'
    ],
    messages: [
      'mcp:get-tabs',
      'mcp:get-site-guides',
      'mcp:go-back'
    ]
  },
  visual: {
    tools: [
      'start_visual_session',
      'end_visual_session'
    ],
    messages: [
      'mcp:start-visual-session',
      'mcp:end-visual-session'
    ]
  },
  autopilot: {
    tools: [
      'run_task',
      'stop_task',
      'get_task_status'
    ],
    messages: [
      'mcp:start-automation',
      'mcp:stop-automation',
      'mcp:get-status'
    ]
  },
  observability: {
    tools: [
      'list_sessions',
      'get_session_detail',
      'get_logs',
      'search_memory',
      'get_memory_stats'
    ],
    messages: [
      'mcp:list-sessions',
      'mcp:get-session',
      'mcp:get-logs',
      'mcp:search-memory',
      'mcp:get-memory'
    ]
  },
  read: {
    tools: [
      'read_page',
      'get_dom_snapshot',
      'get_page_snapshot'
    ],
    messages: [
      'mcp:read-page',
      'mcp:get-dom',
      'mcp:get-page-snapshot'
    ]
  },
  trigger: {
    tools: [
      'trigger',
      'stop_trigger',
      'get_trigger_status',
      'list_triggers'
    ],
    messages: [
      'mcp:trigger',
      'mcp:stop-trigger',
      'mcp:get-trigger-status',
      'mcp:list-triggers'
    ]
  }
};

function selectedGroups() {
  const groupArg = process.argv.find(arg => arg.startsWith('--group='));
  if (!groupArg) {
    return ['browser', 'visual', 'autopilot', 'observability', 'read', 'trigger'];
  }

  const group = groupArg.slice('--group='.length);
  if (groupDefinitions[group]) {
    return [group];
  }

  assert(false, `Unknown route contract group: ${group}`);
  return [];
}

function unique(values) {
  return Array.from(new Set(values));
}

function loadDispatcher() {
  try {
    return require(dispatcherPath);
  } catch (error) {
    assert(
      false,
      `Missing direct MCP route contracts: ${dispatcherRelativePath} could not be loaded (${error.code || error.message})`,
    );
    return null;
  }
}

function safeCall(fn, args, label) {
  try {
    return fn(...args);
  } catch (error) {
    assert(false, `${label} threw: ${error.message || String(error)}`);
    return undefined;
  }
}

function runRegistryChecks() {
  console.log('\n--- registry source coverage ---');

  assert(Array.isArray(TOOL_REGISTRY), 'TOOL_REGISTRY loads from ai/tool-definitions.js');

  for (const toolName of requiredPublicRoutes) {
    const inRegistry = TOOL_REGISTRY.some(tool => tool.name === toolName);
    const serverOnly = ['start_visual_session', 'end_visual_session', 'run_task', 'stop_task', 'get_task_status', 'list_sessions', 'get_session_detail', 'get_logs', 'search_memory', 'get_memory_stats'].includes(toolName);
    assert(inRegistry || serverOnly, `${toolName} is known through TOOL_REGISTRY or MCP server tool registration`);
  }

  const backgroundToolNames = TOOL_REGISTRY
    .filter(tool => tool._route === 'background')
    .map(tool => tool.name);

  for (const required of groupDefinitions.browser.tools) {
    assert(backgroundToolNames.includes(required), `background TOOL_REGISTRY includes ${required}`);
  }

  for (const required of groupDefinitions.trigger.tools) {
    assert(backgroundToolNames.includes(required), `background TOOL_REGISTRY includes ${required}`);
  }

  for (const excluded of phase199VaultExclusions) {
    assert(backgroundToolNames.includes(excluded), `${excluded} remains explicitly out of Phase 199 route-contract expansion`);
  }
}

function runDispatcherChecks(dispatcher, groups) {
  console.log('\n--- dispatcher contract exports ---');

  if (!dispatcher) return;

  const {
    dispatchMcpMessageRoute,
    getMcpRouteContracts,
    hasMcpToolRoute,
    hasMcpMessageRoute
  } = dispatcher;

  assert(typeof dispatchMcpMessageRoute === 'function', 'dispatchMcpMessageRoute export exists');
  assert(typeof getMcpRouteContracts === 'function', 'getMcpRouteContracts export exists');
  assert(typeof hasMcpToolRoute === 'function', 'hasMcpToolRoute export exists');
  assert(typeof hasMcpMessageRoute === 'function', 'hasMcpMessageRoute export exists');

  if (typeof getMcpRouteContracts !== 'function') return;

  const contracts = safeCall(getMcpRouteContracts, [], 'getMcpRouteContracts');
  const secondContracts = safeCall(getMcpRouteContracts, [], 'getMcpRouteContracts second call');
  const toolRoutes = contracts?.toolRoutes;
  const messageRoutes = contracts?.messageRoutes;

  assert(isPlainObject(toolRoutes), 'getMcpRouteContracts returns stable toolRoutes object');
  assert(isPlainObject(messageRoutes), 'getMcpRouteContracts returns stable messageRoutes object');

  if (isPlainObject(toolRoutes) && isPlainObject(secondContracts?.toolRoutes)) {
    assertDeepEqual(Object.keys(secondContracts.toolRoutes).sort(), Object.keys(toolRoutes).sort(), 'toolRoutes keys are stable across calls');
  }

  if (isPlainObject(messageRoutes) && isPlainObject(secondContracts?.messageRoutes)) {
    assertDeepEqual(Object.keys(secondContracts.messageRoutes).sort(), Object.keys(messageRoutes).sort(), 'messageRoutes keys are stable across calls');
  }

  const expectedTools = unique(groups.flatMap(group => groupDefinitions[group].tools));
  const expectedMessages = unique(groups.flatMap(group => groupDefinitions[group].messages));

  console.log('\n--- direct tool route contracts ---');
  for (const toolName of expectedTools) {
    const hasRoute = typeof hasMcpToolRoute === 'function'
      ? safeCall(hasMcpToolRoute, [toolName], `hasMcpToolRoute(${toolName})`)
      : false;
    assert(hasRoute === true, `Missing direct MCP route for tool ${toolName}`);
  }

  console.log('\n--- direct message route contracts ---');
  for (const messageType of expectedMessages) {
    const hasRoute = typeof hasMcpMessageRoute === 'function'
      ? safeCall(hasMcpMessageRoute, [messageType], `hasMcpMessageRoute(${messageType})`)
      : false;
    assert(hasRoute === true, `Missing direct MCP message route for ${messageType}`);
  }

  if (groups.length === Object.keys(groupDefinitions).length) {
    for (const toolName of requiredPublicRoutes) {
      const hasRoute = typeof hasMcpToolRoute === 'function'
        ? safeCall(hasMcpToolRoute, [toolName], `hasMcpToolRoute(${toolName})`)
        : false;
      assert(hasRoute === true, `requiredPublicRoutes includes direct route for ${toolName}`);
    }

    for (const messageType of requiredMessageRoutes) {
      const hasRoute = typeof hasMcpMessageRoute === 'function'
        ? safeCall(hasMcpMessageRoute, [messageType], `hasMcpMessageRoute(${messageType})`)
        : false;
      assert(hasRoute === true, `requiredMessageRoutes includes direct route for ${messageType}`);
    }
  }

  console.log('\n--- background registry route contracts ---');
  const backgroundTools = TOOL_REGISTRY
    .filter(tool => tool._route === 'background')
    .map(tool => tool.name);

  for (const toolName of backgroundTools) {
    if (phase199VaultExclusions.has(toolName)) continue;
    const hasRoute = typeof hasMcpToolRoute === 'function'
      ? safeCall(hasMcpToolRoute, [toolName], `hasMcpToolRoute(${toolName})`)
      : false;
    assert(hasRoute === true, `background TOOL_REGISTRY tool ${toolName} has a direct route contract`);
  }
}

async function runObservabilityRedactionCase(dispatcher, groups) {
  if (!dispatcher || !groups.includes('observability')) return;

  console.log('\n--- observability session detail redaction ---');

  const previousAutomationLogger = global.automationLogger;
  global.automationLogger = {
    async loadSession(sessionId) {
      return {
        sessionId,
        task: 'Log in and pay invoice',
        logs: [
          { logType: 'prompt', data: { text: 'prompt-secret-do-not-return' } },
          { logType: 'info', data: { message: 'safe event' } }
        ],
        actionHistory: [
          {
            tool: 'type',
            timestamp: '2026-04-22T23:59:00.000Z',
            iteration: 3,
            params: {
              selector: '#password',
              url: 'https://checkout.example.com/login',
              text: 'typed-super-secret',
              value: 'typed-hidden-value',
              cardNumber: '4111111111111111'
            },
            result: {
              success: true,
              value: 'result-hidden-value',
              password: 'result-password',
              cvv: '123'
            }
          }
        ]
      };
    }
  };

  try {
    const response = await dispatcher.dispatchMcpMessageRoute({
      type: 'mcp:get-session',
      payload: { sessionId: 'session-redaction' }
    });

    assert(response?.success === true, 'mcp:get-session succeeds for regression fixture');
    assert(Array.isArray(response?.session?.actionHistory), 'mcp:get-session returns actionHistory array');

    const action = response?.session?.actionHistory?.[0] || {};
    assertDeepEqual(
      action,
      {
        tool: 'type',
        timestamp: '2026-04-22T23:59:00.000Z',
        iteration: 3,
        selector: '#password',
        domain: 'checkout.example.com',
        result: { success: true }
      },
      'actionHistory returns bounded metadata instead of raw params/results',
    );

    const serialized = JSON.stringify(response || {});
    for (const secret of [
      'typed-super-secret',
      'typed-hidden-value',
      '4111111111111111',
      'result-hidden-value',
      'result-password',
      '123',
      'prompt-secret-do-not-return'
    ]) {
      assert(!serialized.includes(secret), `mcp:get-session omits raw secret value ${secret}`);
    }
  } finally {
    if (previousAutomationLogger === undefined) {
      delete global.automationLogger;
    } else {
      global.automationLogger = previousAutomationLogger;
    }
  }
}

async function runTriggerOwnershipGateCase(dispatcher, groups) {
  if (!dispatcher || !groups.includes('trigger')) return;

  console.log('\n--- trigger message ownership gate ---');

  const previousRegistry = global.fsbAgentRegistryInstance;
  const previousDispatch = global.fsbTriggerDispatchToolRequest;
  let dispatchCalls = 0;

  global.fsbAgentRegistryInstance = {
    hasAgent(agentId) {
      return agentId === 'agent_a' || agentId === 'agent_b';
    },
    isOwnedBy() {
      return false;
    },
    getOwner(tabId) {
      return tabId === 77 ? 'agent_a' : null;
    },
    getTabMetadata() {
      return { incognito: false, windowId: 1 };
    },
    getAgentWindowId() {
      return 1;
    }
  };
  global.fsbTriggerDispatchToolRequest = async () => {
    dispatchCalls++;
    return { success: true };
  };

  try {
    const response = await dispatcher.dispatchMcpMessageRoute({
      type: 'mcp:trigger',
      payload: {
        selector: '#price',
        condition: { kind: 'changed' },
        target_tab_id: 77,
        agentId: 'agent_b',
        ownershipToken: 'tok_b'
      }
    });

    assert(response?.success === false, 'mcp:trigger rejects cross-agent target');
    assert(response?.errorCode === 'TAB_NOT_OWNED', 'mcp:trigger cross-agent rejection uses TAB_NOT_OWNED');
    assert(response?.requestedTabId === 77, 'mcp:trigger ownership gate reads target_tab_id');
    assert(dispatchCalls === 0, 'mcp:trigger ownership gate rejects before background trigger dispatch');
  } finally {
    if (previousRegistry === undefined) {
      delete global.fsbAgentRegistryInstance;
    } else {
      global.fsbAgentRegistryInstance = previousRegistry;
    }
    if (previousDispatch === undefined) {
      delete global.fsbTriggerDispatchToolRequest;
    } else {
      global.fsbTriggerDispatchToolRequest = previousDispatch;
    }
  }
}

async function runTaskOutcomeRecorderCase(dispatcher, groups) {
  if (!dispatcher || !groups.includes('browser')) return;

  console.log('\n--- lifecycle summaries are the only task-memory handoff ---');
  const previousRecorder = global.fsbMcpSessionRecorder;
  const calls = [];
  global.fsbMcpSessionRecorder = {
    recordTaskOutcome(input) { calls.push(input); }
  };

  try {
    const payload = { agentId: 'agent-lifecycle', ownershipToken: 'token-lifecycle' };
    const completed = await dispatcher.dispatchMcpToolRoute({
      tool: 'complete_task',
      params: { summary: 'Completed safely', tabId: 9, tab_id: 9 },
      payload
    });
    assert(completed?.status === 'completed', 'complete_task returns a handler-confirmed completed status');
    assert(calls.length === 1, 'valid complete_task records one client-authored outcome');
    assert(calls[0].payload.agentId === 'agent-lifecycle', 'outcome hook preserves agent identity');
    assert(calls[0].params.tab_id === 9, 'outcome hook preserves public tab_id');

    const failed = await dispatcher.dispatchMcpToolRoute({
      tool: 'fail_task', params: { reason: 'Unrecoverable' }, payload
    });
    assert(failed?.status === 'failed' && failed?.success === false,
      'fail_task valid terminal response remains success:false with failed status');
    assert(calls.length === 2, 'valid fail_task still records a terminal outcome');

    await dispatcher.dispatchMcpToolRoute({ tool: 'complete_task', params: {}, payload });
    assert(calls.length === 2, 'invalid lifecycle params never reach the task-memory recorder');
  } finally {
    if (previousRecorder === undefined) delete global.fsbMcpSessionRecorder;
    else global.fsbMcpSessionRecorder = previousRecorder;
  }
}

async function runVisualSessionTokenOwnershipCase(dispatcher, groups) {
  if (!dispatcher || !groups.includes('browser')) return;

  console.log('\n--- visual-session tokens resolve to their authoritative owned tab ---');
  const previousRegistry = global.fsbAgentRegistryInstance;
  const previousResolver = global.resolveMcpVisualSessionTabId;
  const previousHandler = global.handleMcpVisualSessionTaskStatus;
  const previousRecorder = global.fsbMcpSessionRecorder;
  const handlerCalls = [];
  const outcomeCalls = [];

  global.fsbAgentRegistryInstance = {
    hasAgent(agentId) {
      return agentId === 'agent-owner' || agentId === 'agent-intruder';
    },
    isOwnedBy(tabId, agentId, ownershipToken) {
      if (tabId === 9) return agentId === 'agent-owner' && ownershipToken === 'owner-token-9';
      if (tabId === 10) return agentId === 'agent-owner' && ownershipToken === 'owner-token-10';
      if (tabId === 11) return agentId === 'agent-intruder' && ownershipToken === 'intruder-token-11';
      return false;
    },
    getOwner(tabId) {
      if (tabId === 9) return 'agent-owner';
      if (tabId === 10) return 'agent-owner';
      if (tabId === 11) return 'agent-intruder';
      return null;
    },
    getAgentTabs(agentId) {
      if (agentId === 'agent-owner') return [9, 10];
      if (agentId === 'agent-intruder') return [11];
      return null;
    },
    getTabMetadata(tabId) {
      const tokens = {
        9: 'owner-token-9',
        10: 'owner-token-10',
        11: 'intruder-token-11'
      };
      return { incognito: false, windowId: 1, ownershipToken: tokens[tabId] };
    },
    getAgentWindowId() {
      return 1;
    }
  };
  global.resolveMcpVisualSessionTabId = (sessionToken) => (
    sessionToken === 'session-token-9' ? 9 : null
  );
  global.handleMcpVisualSessionTaskStatus = (request, _sender, sendResponse) => {
    handlerCalls.push(request);
    if (request.sessionToken !== 'session-token-9') {
      sendResponse({ success: false, errorCode: 'visual_session_not_found' });
      return true;
    }
    if (request.tool === 'report_progress') {
      sendResponse({ success: true, tool: request.tool, hadEffect: true, message: request.message });
    } else if (request.tool === 'fail_task') {
      sendResponse({ success: false, tool: request.tool, status: 'failed', reason: request.reason });
    } else {
      sendResponse({
        success: true,
        tool: request.tool,
        status: request.tool === 'complete_task' ? 'completed' : 'partial'
      });
    }
    return true;
  };
  global.fsbMcpSessionRecorder = {
    recordTaskOutcome(input) {
      outcomeCalls.push(input);
    }
  };

  const toolCases = [
    { tool: 'report_progress', params: { message: 'Still working' } },
    { tool: 'complete_task', params: { summary: 'Finished safely' } },
    { tool: 'partial_task', params: { summary: 'Made progress', blocker: 'Approval required' } },
    { tool: 'fail_task', params: { reason: 'Unrecoverable' } }
  ];
  const ownerPayload = { agentId: 'agent-owner', ownershipToken: 'owner-token-9' };
  const ownerOtherTabPayload = { agentId: 'agent-owner', ownershipToken: 'owner-token-10' };
  const intruderPayload = { agentId: 'agent-intruder', ownershipToken: 'intruder-token-11' };

  try {
    for (const testCase of toolCases) {
      const response = await dispatcher.dispatchMcpToolRoute({
        tool: testCase.tool,
        params: { ...testCase.params, session_token: 'session-token-9' },
        payload: ownerPayload
      });
      assert(response?.tool === testCase.tool,
        `${testCase.tool} accepts an owner token without explicit tab_id`);
    }
    assert(handlerCalls.length === toolCases.length,
      'all token-backed lifecycle tools reach the visual-session handler for the owner');
    assert(outcomeCalls.length === 3,
      'only terminal token-backed lifecycle tools reach task-memory recording');
    assert(outcomeCalls.every(call => call.params.tabId === 9 && call.params.tab_id === 9),
      'token-only terminal outcomes are attributed to the authoritative tab');

    for (const testCase of toolCases) {
      const response = await dispatcher.dispatchMcpToolRoute({
        tool: testCase.tool,
        params: { ...testCase.params, session_token: 'session-token-9' },
        payload: ownerOtherTabPayload
      });
      assert(response?.tool === testCase.tool,
        `${testCase.tool} translates another current same-agent tab token to the session tab`);
    }
    assert(handlerCalls.length === toolCases.length * 2,
      'same-agent cross-tab tokens reach every token-backed lifecycle handler');
    assert(outcomeCalls.length === 6,
      'same-agent cross-tab tokens record all three terminal outcomes');
    assert(outcomeCalls.every(call => call.params.tabId === 9 && call.params.tab_id === 9),
      'translated token-only outcomes remain attributed to the authoritative tab');

    const matchingExplicit = await dispatcher.dispatchMcpToolRoute({
      tool: 'complete_task',
      params: { summary: 'Explicit match', session_token: 'session-token-9', tab_id: 9 },
      payload: ownerPayload
    });
    assert(matchingExplicit?.status === 'completed',
      'matching explicit tab_id remains compatible with the token-backed route');
    assert(outcomeCalls.at(-1)?.params.tabId === 9 && outcomeCalls.at(-1)?.params.tab_id === 9,
      'matching explicit tab_id remains canonical in task-memory recording');

    const callsBeforeRejects = handlerCalls.length;
    const outcomesBeforeRejects = outcomeCalls.length;
    for (const testCase of toolCases) {
      const response = await dispatcher.dispatchMcpToolRoute({
        tool: testCase.tool,
        params: { ...testCase.params, session_token: 'session-token-9' },
        payload: intruderPayload
      });
      assert(response?.errorCode === 'TAB_NOT_OWNED',
        `${testCase.tool} rejects a foreign agent before visual-session mutation`);
    }
    assert(handlerCalls.length === callsBeforeRejects,
      'foreign-agent token calls never invoke the visual-session handler');
    assert(outcomeCalls.length === outcomesBeforeRejects,
      'foreign-agent token calls never reach task-memory recording');

    const staleOwnership = await dispatcher.dispatchMcpToolRoute({
      tool: 'complete_task',
      params: { summary: 'Stale owner token', session_token: 'session-token-9' },
      payload: { agentId: 'agent-owner', ownershipToken: 'stale-owner-token' }
    });
    assert(staleOwnership?.errorCode === 'TAB_NOT_OWNED',
      'same-agent calls with a stale ownership token are rejected');

    const explicitWrongOwnership = await dispatcher.dispatchMcpToolRoute({
      tool: 'complete_task',
      params: { summary: 'Explicit wrong token', session_token: 'session-token-9', tab_id: 9 },
      payload: ownerOtherTabPayload
    });
    assert(explicitWrongOwnership?.errorCode === 'TAB_NOT_OWNED',
      'explicit tab calls never translate an ownership token from another tab');

    const spoofedTab = await dispatcher.dispatchMcpToolRoute({
      tool: 'complete_task',
      params: { summary: 'Spoofed tab', session_token: 'session-token-9', tab_id: 10 },
      payload: intruderPayload
    });
    assert(spoofedTab?.errorCode === 'mcp_route_invalid_params',
      'an owned tab_id cannot be paired with another tab\'s visual-session token');

    const missingToken = await dispatcher.dispatchMcpToolRoute({
      tool: 'complete_task',
      params: { summary: 'Missing token', session_token: 'missing-session-token' },
      payload: ownerPayload
    });
    assert(missingToken?.errorCode === 'visual_session_not_found',
      'an unknown session token preserves the existing not-found response');

    delete global.resolveMcpVisualSessionTabId;
    const unavailableResolver = await dispatcher.dispatchMcpToolRoute({
      tool: 'complete_task',
      params: { summary: 'No resolver', session_token: 'session-token-9' },
      payload: ownerPayload
    });
    assert(unavailableResolver?.errorCode === 'visual_session_unavailable',
      'token-backed lifecycle calls fail closed when the resolver is unavailable');
    assert(handlerCalls.length === callsBeforeRejects + 1,
      'only the unknown-token compatibility path reaches the handler after ownership rejections');
    assert(outcomeCalls.length === outcomesBeforeRejects,
      'rejected and unknown token calls do not create task outcomes');
  } finally {
    if (previousRegistry === undefined) delete global.fsbAgentRegistryInstance;
    else global.fsbAgentRegistryInstance = previousRegistry;
    if (previousResolver === undefined) delete global.resolveMcpVisualSessionTabId;
    else global.resolveMcpVisualSessionTabId = previousResolver;
    if (previousHandler === undefined) delete global.handleMcpVisualSessionTaskStatus;
    else global.handleMcpVisualSessionTaskStatus = previousHandler;
    if (previousRecorder === undefined) delete global.fsbMcpSessionRecorder;
    else global.fsbMcpSessionRecorder = previousRecorder;
  }
}

async function run() {
  const groups = selectedGroups();
  console.log(`\n--- MCP route contract group: ${groups.join(', ')} ---`);

  runRegistryChecks();
  const dispatcher = loadDispatcher();
  runDispatcherChecks(dispatcher, groups);
  await runObservabilityRedactionCase(dispatcher, groups);
  await runTriggerOwnershipGateCase(dispatcher, groups);
  await runTaskOutcomeRecorderCase(dispatcher, groups);
  await runVisualSessionTokenOwnershipCase(dispatcher, groups);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
