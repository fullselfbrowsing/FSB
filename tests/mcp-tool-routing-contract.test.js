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

async function run() {
  const groups = selectedGroups();
  console.log(`\n--- MCP route contract group: ${groups.join(', ')} ---`);

  runRegistryChecks();
  const dispatcher = loadDispatcher();
  runDispatcherChecks(dispatcher, groups);
  await runObservabilityRedactionCase(dispatcher, groups);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
