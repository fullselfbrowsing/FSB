'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

let passed = 0;
let failed = 0;

const ROOT = path.resolve(__dirname, '..');
const BACKGROUND_PATH = path.join(ROOT, 'extension', 'background.js');
const MCP_DISPATCHER_PATH = path.join(ROOT, 'extension', 'ws', 'mcp-tool-dispatcher.js');
const TOOL_EXECUTOR_PATH = path.join(ROOT, 'extension', 'ai', 'tool-executor.js');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const MCP_MANUAL_PATH = path.join(ROOT, 'mcp', 'src', 'tools', 'manual.ts');
const MCP_QUEUE_PATH = path.join(ROOT, 'mcp', 'src', 'queue.ts');
const MCP_RUNTIME_PATH = path.join(ROOT, 'mcp', 'src', 'runtime.ts');
const MCP_BUILD_QUEUE_PATH = path.join(ROOT, 'mcp', 'build', 'queue.js');

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

async function runCase(name, fn) {
  try {
    await fn();
    check(true, name);
  } catch (err) {
    check(false, name + ' -- ' + (err && err.message ? err.message : err));
  }
}

function readSource(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function functionSource(src, fnName) {
  const start = src.indexOf('function ' + fnName);
  if (start < 0) return '';
  const open = src.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}') depth--;
    if (depth === 0) return src.slice(start, i + 1);
  }
  return '';
}

function assertOrdered(src, earlier, later, msg) {
  const a = src.indexOf(earlier);
  const b = src.indexOf(later);
  assert.ok(a >= 0, earlier + ' exists for order assertion');
  assert.ok(b >= 0, later + ' exists for order assertion');
  assert.ok(a < b, msg || (earlier + ' appears before ' + later));
}

function loadToolHandlers(extraGlobals) {
  const src = readSource(BACKGROUND_PATH);
  const start = src.indexOf('function fsbTriggerFirstString');
  assert.ok(start >= 0, 'trigger helper block exists in background.js');
  assert.ok(src.includes('async function fsbTriggerOwnerContext'), 'fsbTriggerOwnerContext exists in background.js');
  const marker = 'globalThis.fsbTriggerToolHandlersForTest';
  const markerIndex = src.indexOf(marker, start);
  assert.ok(markerIndex > start, 'test-only trigger tool handler bundle exists');
  const assignmentEnd = src.indexOf('\n', markerIndex);
  const slice = src.slice(start, assignmentEnd > 0 ? assignmentEnd : src.length);
  const context = Object.assign({
    console,
    Date,
    Number,
    Object,
    Array,
    String,
    Promise,
    Math,
    crypto: { randomUUID: () => 'test-random-uuid' },
    fsbTriggerAttrName(snap) {
      const condition = snap && snap.condition && typeof snap.condition === 'object' ? snap.condition : {};
      return snap && (snap.attrName || snap.attribute || condition.attrName || condition.attribute || null);
    },
    fsbTriggerCopyReportedAttributes(attributes) {
      if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return null;
      return Object.assign({}, attributes);
    },
    fsbTriggerIsLiveObserveSnapshot(snap) {
      return snap && snap.status === 'armed' && (snap.watch === 'live-observe' || snap.watch === 'live_observe');
    },
    fsbTriggerIsRefreshPollSnapshot(snap) {
      return snap && snap.status === 'armed' && (snap.watch === 'refresh-poll' || snap.watch === 'refresh_poll');
    }
  }, extraGlobals || {});
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(slice, context, { filename: 'background-trigger-tool-slice.js' });
  assert.ok(context.fsbTriggerToolHandlersForTest, 'tool handler bundle initialized');
  return context.fsbTriggerToolHandlersForTest;
}

function makeSnapshot(overrides) {
  return Object.assign({
    trigger_id: 'trg_status',
    status: 'armed',
    watch: 'live-observe',
    condition: { kind: 'changed' },
    target_tab_id: 42,
    agent_id: 'agent_a',
    ownership_token: 'tok_a',
    baseline: '10',
    last_value: '10',
    reported_value: '12',
    armed_at: 1000,
    deadline_at: 5000,
    last_evaluated_at: 1800,
    last_reported_at: 1900,
    attention_reason: null,
    last_attention: null
  }, overrides || {});
}

async function casePackageWiring() {
  const pkg = JSON.parse(readSource(PACKAGE_PATH));
  const matches = (pkg.scripts.test.match(/tests\/trigger-tool-dispatcher\.test\.js/g) || []).length;
  assert.strictEqual(matches, 1, 'root npm test includes trigger-tool-dispatcher exactly once');
}

async function caseSourceSurface() {
  const src = readSource(BACKGROUND_PATH);
  assert.ok(src.includes('function fsbTriggerOwnerContext'), 'owner context helper exists');
  assert.ok(src.includes('function fsbTriggerProjectTriggerStatus'), 'status projection helper exists');
  assert.ok(src.includes('function fsbTriggerProjectTriggerSummary'), 'summary projection helper exists');
  assert.ok(src.includes('function fsbTriggerHandleToolStatus'), 'status handler exists');
  assert.ok(src.includes('function fsbTriggerHandleToolList'), 'list handler exists');
  assert.ok(src.includes('globalThis.fsbTriggerToolHandlersForTest'), 'test-only handler bundle is exposed');
}

async function caseMcpManualExcludesTrigger() {
  const src = readSource(MCP_MANUAL_PATH);
  const registerSrc = functionSource(src, 'registerManualTools');
  assert.ok(src.includes('TRIGGER_MANUAL_EXCLUSIONS'), 'manual tool source declares trigger exclusion set');
  assert.ok(src.includes("'trigger'") || src.includes('"trigger"'), 'manual exclusion set includes trigger');
  assert.ok(src.includes('!TRIGGER_MANUAL_EXCLUSIONS.has(t.name)'), 'manual tool predicate excludes trigger by name');
  assert.ok(registerSrc.includes('TOOL_REGISTRY.filter(isManualTool)'), 'manual tool filter uses the trigger-aware predicate');
  assertOrdered(src, 'TRIGGER_MANUAL_EXCLUSIONS', 'TOOL_REGISTRY.filter', 'trigger exclusion set is declared before manual filtering');
}

async function caseMcpRuntimeRegistersTriggerTools() {
  const src = readSource(MCP_RUNTIME_PATH);
  assert.ok(src.includes("from './tools/triggers.js'"), 'runtime imports trigger registrar');
  const calls = src.match(/registerTriggerTools\(server, bridge, queue, agentScope\)/g) || [];
  assert.strictEqual(calls.length, 1, 'runtime calls registerTriggerTools exactly once');
  assertOrdered(
    src,
    'registerTriggerTools(server, bridge, queue, agentScope)',
    'registerManualTools(server, bridge, queue, agentScope)',
    'runtime registers trigger tools before ordinary manual tools'
  );
}

async function caseMcpQueueDerivesReadOnlyTools() {
  const src = readSource(MCP_QUEUE_PATH);
  assert.ok(src.includes('getReadOnlyTools().map'), 'TaskQueue derives read-only names from shared registry');
  assert.ok(src.includes('...registryReadOnly'), 'TaskQueue read-only bypass set includes registry-derived names');
}

async function caseMcpQueueCompanionsBypassPendingMutation() {
  const queueModule = await import(pathToFileURL(MCP_BUILD_QUEUE_PATH).href);
  const queue = new queueModule.TaskQueue();
  const never = queue.enqueue('click', () => new Promise(() => {}));
  void never;

  for (const toolName of ['stop_trigger', 'get_trigger_status', 'list_triggers']) {
    let ran = false;
    const result = await Promise.race([
      queue.enqueue(toolName, async () => {
        ran = true;
        return `${toolName}:direct`;
      }),
      new Promise((resolve) => setTimeout(() => resolve(`${toolName}:blocked`), 25)),
    ]);
    assert.strictEqual(result, `${toolName}:direct`, `${toolName} bypasses pending mutation queue work`);
    assert.strictEqual(ran, true, `${toolName} callback ran immediately`);
  }
}

async function caseMcpDispatcherTriggerRoutesDelegateToBackground() {
  const src = readSource(MCP_DISPATCHER_PATH);
  for (const messageType of ['mcp:trigger', 'mcp:stop-trigger', 'mcp:get-trigger-status', 'mcp:list-triggers']) {
    assert.ok(src.includes(messageType), `dispatcher declares ${messageType}`);
  }
  for (const toolName of ['trigger', 'stop_trigger', 'get_trigger_status', 'list_triggers']) {
    assert.ok(src.includes(toolName), `dispatcher declares ${toolName}`);
  }
  assert.ok(src.includes("routeFamily: 'trigger'"), 'dispatcher trigger routes use trigger route family');
  assert.ok(src.includes('fsbTriggerDispatchToolRequest'), 'dispatcher delegates trigger messages to background dispatch helper');
  assert.strictEqual(src.includes('FsbTriggerManager.armTrigger'), false, 'dispatcher does not arm triggers directly');
}

async function caseToolExecutorTriggerRoutesDelegateToBackground() {
  const src = readSource(TOOL_EXECUTOR_PATH);
  const backgroundSrc = functionSource(src, 'executeBackgroundTool');
  const paramsSrc = functionSource(src, 'buildAutopilotTriggerParams');
  const effectSrc = functionSource(src, 'autopilotTriggerHadEffect');

  for (const toolName of ['trigger', 'stop_trigger', 'get_trigger_status', 'list_triggers']) {
    assert.ok(backgroundSrc.includes(`case '${toolName}'`), `tool executor handles ${toolName}`);
  }
  assert.ok(backgroundSrc.includes('fsbTriggerDispatchToolRequest'), 'tool executor delegates trigger tools to background dispatch helper');
  assert.ok(backgroundSrc.includes("source: 'autopilot'"), 'tool executor marks trigger dispatch context as autopilot');
  assert.ok(paramsSrc.includes('agent_id') && paramsSrc.includes('agentId'), 'autopilot trigger params strip caller agent identity aliases');
  assert.ok(paramsSrc.includes('ownership_token') && paramsSrc.includes('ownershipToken'), 'autopilot trigger params strip caller ownership token aliases');
  assert.ok(paramsSrc.includes('delete cleaned[field]'), 'autopilot trigger params delete untrusted ownership fields');
  assert.ok(paramsSrc.includes('tab_id') && paramsSrc.includes('tabId'), 'autopilot trigger params default tab aliases from executor tabId');
  assert.ok(effectSrc.includes("toolName === 'trigger'"), 'trigger success is treated as effectful');
  assert.ok(effectSrc.includes("toolName === 'stop_trigger'") && effectSrc.includes('response.stopped === true'), 'stop_trigger is effectful only when it stops an active trigger');
  assert.strictEqual(src.includes('FsbTriggerManager.armTrigger'), false, 'tool executor does not arm triggers directly');
  assert.strictEqual(src.includes('FsbTriggerStore'), false, 'tool executor does not inspect trigger storage directly');
  assert.strictEqual(src.includes('FsbTriggerLifecycle'), false, 'tool executor does not call trigger lifecycle directly');
  assert.strictEqual(src.includes('chrome.alarms'), false, 'tool executor does not own trigger alarms');
  assert.strictEqual(src.includes('triggerObserveStart'), false, 'tool executor does not own live-observe startup');
}

async function caseToolExecutorRuntimeStripsUntrustedAutopilotFields() {
  const { executeTool } = require(path.join(ROOT, 'extension', 'ai', 'tool-executor.js'));
  const previousDispatch = global.fsbTriggerDispatchToolRequest;
  const calls = [];
  global.fsbTriggerDispatchToolRequest = async function(toolName, params, context) {
    calls.push({ toolName, params, context });
    if (toolName === 'stop_trigger') return { success: true, stopped: false, trigger_id: params.trigger_id };
    if (toolName === 'get_trigger_status') return { success: true, status: { trigger_id: params.trigger_id } };
    return { success: true, trigger_id: 'trg_runtime', status: { status: 'armed' } };
  };

  try {
    const triggerResult = await executeTool('trigger', {
      selector: '#price',
      condition: { kind: 'changed' },
      targetTabId: 99,
      agent_id: 'spoof_snake',
      agentId: 'spoof_camel',
      ownership_token: 'tok_snake',
      ownershipToken: 'tok_camel'
    }, 55);
    assert.strictEqual(triggerResult.success, true, 'runtime trigger execution succeeds through dispatch helper');
    assert.strictEqual(triggerResult.hadEffect, true, 'successful trigger arm is effectful');
    assert.strictEqual(calls[0].toolName, 'trigger', 'runtime trigger dispatch uses trigger tool name');
    assert.strictEqual(calls[0].params.agent_id, undefined, 'runtime trigger params strip agent_id');
    assert.strictEqual(calls[0].params.agentId, undefined, 'runtime trigger params strip agentId');
    assert.strictEqual(calls[0].params.ownership_token, undefined, 'runtime trigger params strip ownership_token');
    assert.strictEqual(calls[0].params.ownershipToken, undefined, 'runtime trigger params strip ownershipToken');
    assert.strictEqual(calls[0].params.target_tab_id, 99, 'runtime trigger params normalize targetTabId to target_tab_id');
    assert.deepStrictEqual(calls[0].context, { tabId: 55, source: 'autopilot' }, 'runtime trigger context is trusted autopilot tab context only');

    const statusResult = await executeTool('get_trigger_status', { trigger_id: 'trg_runtime' }, 55);
    assert.strictEqual(statusResult.success, true, 'runtime get_trigger_status succeeds through dispatch helper');
    assert.strictEqual(statusResult.hadEffect, false, 'get_trigger_status is never effectful');

    const idempotentStop = await executeTool('stop_trigger', { trigger_id: 'trg_runtime' }, 55);
    assert.strictEqual(idempotentStop.success, true, 'runtime stop_trigger succeeds through dispatch helper');
    assert.strictEqual(idempotentStop.hadEffect, false, 'idempotent stop_trigger is not effectful when nothing stopped');
  } finally {
    if (previousDispatch === undefined) {
      delete global.fsbTriggerDispatchToolRequest;
    } else {
      global.fsbTriggerDispatchToolRequest = previousDispatch;
    }
  }
}

async function caseStorageSourceContracts() {
  const src = readSource(BACKGROUND_PATH);
  const statusSrc = functionSource(src, 'fsbTriggerHandleToolStatus');
  const listSrc = functionSource(src, 'fsbTriggerHandleToolList');
  assert.ok(statusSrc.includes('FsbTriggerStore.readSnapshot'), 'status reads persisted snapshot');
  assert.ok(listSrc.includes('FsbTriggerStore.hydrate'), 'list hydrates persisted trigger registry');
  assert.ok(!statusSrc.includes('activeSessions'), 'status does not project from activeSessions');
  assert.ok(!listSrc.includes('activeSessions'), 'list does not project from activeSessions');
}

async function caseStopSourceOrdering() {
  const src = readSource(BACKGROUND_PATH);
  const stopSrc = functionSource(src, 'fsbTriggerHandleToolStop');
  const stopObserveSrc = functionSource(src, 'fsbTriggerStopObserveForSnapshot');
  assert.ok(stopSrc.includes('function fsbTriggerHandleToolStop'), 'stop handler exists');
  assert.ok(stopObserveSrc.includes('triggerObserveStop'), 'observe cleanup sends triggerObserveStop');
  assert.ok(stopObserveSrc.includes('triggerPulseStop'), 'observe cleanup sends triggerPulseStop');
  assertOrdered(stopSrc, 'FsbTriggerStore.readSnapshot', 'fsbTriggerStopObserveForSnapshot', 'stop reads snapshot before content cleanup');
  assertOrdered(stopObserveSrc, 'triggerObserveStop', 'triggerPulseStop', 'observe stop precedes pulse stop');
  assertOrdered(stopSrc, 'fsbTriggerStopObserveForSnapshot', 'FsbTriggerLifecycle.clearTrigger', 'content cleanup precedes lifecycle clear');
  assertOrdered(stopSrc, 'fsbTriggerClearObserveWatchdog', 'FsbTriggerLifecycle.clearTrigger', 'watchdog cleanup precedes lifecycle clear');
}

async function caseArmSourceContracts() {
  const src = readSource(BACKGROUND_PATH);
  const validateSrc = functionSource(src, 'fsbTriggerValidateToolCondition');
  const armSrc = functionSource(src, 'fsbTriggerHandleToolArm');
  const dispatchSrc = functionSource(src, 'fsbTriggerDispatchToolRequest');
  assert.ok(validateSrc.includes('TRIGGER_CONDITION_INVALID'), 'condition validator returns TRIGGER_CONDITION_INVALID');
  assert.ok(armSrc.includes('function fsbTriggerHandleToolArm'), 'arm handler exists');
  assert.ok(dispatchSrc.includes('trigger'), 'dispatch helper maps trigger tools');
  assertOrdered(armSrc, 'fsbTriggerOwnerContext', 'FsbTriggerManager.armTrigger', 'ownership context is resolved before armTrigger');
  assertOrdered(armSrc, 'fsbTriggerValidateToolCondition', 'FsbTriggerManager.armTrigger', 'condition validation precedes armTrigger');
  assertOrdered(armSrc, 'fsbTriggerSendRefreshPollRead', 'FsbTriggerManager.armTrigger', 'initial triggerRead precedes armTrigger');
  assert.ok(armSrc.includes('crypto.randomUUID'), 'arm handler generates missing trigger ids with crypto.randomUUID');
  assertOrdered(armSrc, 'FsbTriggerManager.armTrigger', 'fsbTriggerStartObserveForSnapshot', 'live observe startup happens after armTrigger');
  assertOrdered(armSrc, 'FsbTriggerManager.armTrigger', 'triggerPulseStart', 'refresh-poll pulse startup happens after armTrigger');
  assert.strictEqual(/heartbeat|auto[-_ ]detach|blocking wait|while\s*\(/.test(armSrc), false, 'arm handler has no Phase 19 wait loop, heartbeat, or auto-detach');
}

async function caseStatusProjectionMath() {
  const handlers = loadToolHandlers();
  const status = handlers.fsbTriggerProjectTriggerStatus(makeSnapshot(), 2500);
  assert.strictEqual(status.trigger_id, 'trg_status', 'trigger_id projected');
  assert.strictEqual(status.initial_value, '10', 'baseline projected as initial_value');
  assert.strictEqual(status.current_value, '12', 'reported_value projected as current_value');
  assert.strictEqual(status.elapsed_ms, 1500, 'elapsed_ms derived from armed_at');
  assert.strictEqual(status.remaining_ms, 2500, 'remaining_ms derived from deadline_at');
}

async function caseListDefaultsToActiveAttentionStates() {
  const records = {
    active: makeSnapshot({ trigger_id: 'active', status: 'armed' }),
    attention: makeSnapshot({ trigger_id: 'attention', status: 'needs_attention' }),
    blocked: makeSnapshot({ trigger_id: 'blocked', status: 'blocked' }),
    fired: makeSnapshot({ trigger_id: 'fired', status: 'fired' })
  };
  const handlers = loadToolHandlers({
    FsbTriggerStore: {
      async hydrate() {
        return { v: 1, records };
      }
    }
  });
  const result = await handlers.fsbTriggerHandleToolList({}, {});
  assert.strictEqual(result.success, true, 'list succeeds');
  assert.deepStrictEqual(Array.from(result.triggers.map(t => t.trigger_id).sort()), ['active', 'attention', 'blocked'], 'default list returns active and attention states only');
}

async function caseCrossAgentStatusRejected() {
  const handlers = loadToolHandlers({
    FsbTriggerStore: {
      async readSnapshot() {
        return makeSnapshot({ agent_id: 'agent_a', ownership_token: 'tok_a' });
      }
    }
  });
  const result = await handlers.fsbTriggerHandleToolStatus(
    { trigger_id: 'trg_status' },
    { agentId: 'agent_b', ownershipToken: 'tok_b' }
  );
  assert.strictEqual(result.success, false, 'cross-agent status fails');
  assert.strictEqual(result.errorCode, 'TRIGGER_ACCESS_DENIED', 'cross-agent status returns typed access denial');
  assert.strictEqual(result.status, undefined, 'cross-agent status does not return snapshot data');
}

async function caseStopMissingIsIdempotent() {
  const handlers = loadToolHandlers({
    FsbTriggerStore: {
      async readSnapshot() {
        return null;
      }
    }
  });
  const result = await handlers.fsbTriggerHandleToolStop({ trigger_id: 'trg_missing' }, {});
  assert.strictEqual(result.success, true, 'missing stop succeeds');
  assert.strictEqual(result.stopped, false, 'missing stop does not report stopped');
  assert.strictEqual(result.idempotent, true, 'missing stop is idempotent');
  assert.strictEqual(result.status, 'not_found', 'missing stop status is not_found');
}

async function caseStopRejectsCrossAgentBeforeCleanup() {
  const calls = [];
  const handlers = loadToolHandlers({
    FsbTriggerStore: {
      async readSnapshot() {
        return makeSnapshot({ status: 'armed', agent_id: 'agent_a', ownership_token: 'tok_a' });
      }
    },
    async fsbTriggerStopObserveForSnapshot() {
      calls.push('observe');
      return { ok: true };
    },
    async fsbTriggerClearObserveWatchdog() {
      calls.push('watchdog');
      return { ok: true };
    },
    FsbTriggerLifecycle: {
      async clearTrigger() {
        calls.push('lifecycle');
        return { ok: true };
      }
    }
  });
  const result = await handlers.fsbTriggerHandleToolStop(
    { trigger_id: 'trg_status' },
    { agentId: 'agent_b', ownershipToken: 'tok_b' }
  );
  assert.strictEqual(result.success, false, 'cross-agent stop fails');
  assert.strictEqual(result.errorCode, 'TRIGGER_ACCESS_DENIED', 'cross-agent stop returns typed denial');
  assert.deepStrictEqual(calls, [], 'cross-agent stop performs no cleanup side effects');
}

async function caseStopActiveCleanupOrder() {
  const calls = [];
  const handlers = loadToolHandlers({
    FsbTriggerStore: {
      async readSnapshot() {
        return makeSnapshot({ status: 'armed', agent_id: null, ownership_token: null });
      }
    },
    async fsbTriggerStopObserveForSnapshot() {
      calls.push('observe');
      return { ok: true };
    },
    async fsbTriggerClearObserveWatchdog() {
      calls.push('watchdog');
      return { ok: true };
    },
    FsbTriggerLifecycle: {
      async clearTrigger() {
        calls.push('lifecycle');
        return { ok: true };
      }
    }
  });
  const result = await handlers.fsbTriggerHandleToolStop({ trigger_id: 'trg_status' }, {});
  assert.strictEqual(result.success, true, 'active stop succeeds');
  assert.strictEqual(result.stopped, true, 'active stop reports stopped');
  assert.deepStrictEqual(calls, ['observe', 'watchdog', 'lifecycle'], 'active stop cleanup order is observe, watchdog, lifecycle');
}

async function caseStopTerminalCleanupIdempotent() {
  const calls = [];
  const handlers = loadToolHandlers({
    FsbTriggerStore: {
      async readSnapshot() {
        return makeSnapshot({ status: 'fired', agent_id: null, ownership_token: null });
      }
    },
    async fsbTriggerStopObserveForSnapshot() {
      calls.push('observe');
      return { ok: true };
    },
    async fsbTriggerClearObserveWatchdog() {
      calls.push('watchdog');
      return { ok: true };
    },
    FsbTriggerLifecycle: {
      async clearTrigger() {
        calls.push('lifecycle');
        return { ok: true };
      }
    }
  });
  const result = await handlers.fsbTriggerHandleToolStop({ trigger_id: 'trg_status' }, {});
  assert.strictEqual(result.success, true, 'terminal stop succeeds');
  assert.strictEqual(result.idempotent, true, 'terminal stop is idempotent');
  assert.strictEqual(result.status, 'fired', 'terminal stop reports prior status');
  assert.deepStrictEqual(calls, ['watchdog', 'lifecycle'], 'terminal stop skips content cleanup and clears watchdog before lifecycle');
}

async function caseInvalidConditionRejectedBeforeArm() {
  const calls = [];
  const handlers = loadToolHandlers({
    async fsbTriggerSendRefreshPollRead() {
      calls.push('read');
      return { success: true, value: { text: '10' } };
    },
    FsbTriggerManager: {
      async armTrigger() {
        calls.push('arm');
        return { ok: true };
      }
    }
  });
  const result = await handlers.fsbTriggerHandleToolArm({
    selector: '#price',
    target_tab_id: 10,
    condition: { kind: 'threshold', operator: '!=', target: 5 }
  }, {});
  assert.strictEqual(result.success, false, 'invalid condition rejects');
  assert.strictEqual(result.errorCode, 'TRIGGER_CONDITION_INVALID', 'invalid condition uses typed error');
  assert.deepStrictEqual(calls, [], 'invalid condition does not read DOM or arm trigger');
}

async function caseArmNormalizesDeltaPercentAlias() {
  const calls = [];
  let receivedSpec = null;
  const handlers = loadToolHandlers({
    async fsbTriggerSendRefreshPollRead() {
      calls.push('read');
      return { success: true, value: { text: '100' } };
    },
    FsbTriggerManager: {
      async armTrigger(spec) {
        calls.push('arm');
        receivedSpec = spec;
        return { ok: true, trigger_id: spec.trigger_id };
      }
    },
    FsbTriggerStore: {
      async readSnapshot() {
        return makeSnapshot(Object.assign({}, receivedSpec || {}, { status: 'armed' }));
      }
    },
    async fsbTriggerStartObserveForSnapshot() {
      calls.push('start-live');
      return { ok: true };
    }
  });

  const condition = { kind: 'delta_percent', percent: 5 };
  const validation = handlers.fsbTriggerValidateToolCondition(condition);
  assert.strictEqual(validation.ok, true, 'delta_percent alias validates');

  const result = await handlers.fsbTriggerHandleToolArm({
    selector: '#price',
    target_tab_id: 10,
    condition,
    watch: 'live-observe'
  }, {});

  assert.strictEqual(result.success, true, 'delta_percent alias arm succeeds');
  assert.deepStrictEqual(calls, ['read', 'arm', 'start-live'], 'delta_percent alias reaches normal arm flow');
  assert.strictEqual(condition.kind, 'delta_percent', 'delta_percent caller condition is not mutated');
  assert.strictEqual(receivedSpec.condition.kind, 'percent_change', 'delta_percent alias is persisted as percent_change');
}

async function caseArmReadsBaselineBeforeManagerAndStartsLiveObserve() {
  const calls = [];
  let receivedSpec = null;
  const handlers = loadToolHandlers({
    async fsbTriggerSendRefreshPollRead() {
      calls.push('read');
      return { success: true, value: { text: '10', attributes: { title: 'Price' } } };
    },
    FsbTriggerManager: {
      async armTrigger(spec) {
        calls.push('arm');
        receivedSpec = spec;
        return { ok: true, trigger_id: spec.trigger_id };
      }
    },
    FsbTriggerStore: {
      async readSnapshot() {
        return makeSnapshot(Object.assign({}, receivedSpec || {}, {
          status: 'armed',
          agent_id: receivedSpec && receivedSpec.agent_id,
          ownership_token: receivedSpec && receivedSpec.ownership_token
        }));
      }
    },
    async fsbTriggerStartObserveForSnapshot() {
      calls.push('start-live');
      return { ok: true };
    },
    async fsbTriggerSendTabMessage() {
      calls.push('pulse');
      return { ok: true };
    }
  });
  const result = await handlers.fsbTriggerHandleToolArm({
    selector: '#price',
    target_tab_id: 10,
    condition: { kind: 'changed' },
    watch: 'live-observe'
  }, { agentId: 'agent_a', ownershipToken: 'tok_a' });
  assert.strictEqual(result.success, true, 'arm succeeds');
  assert.deepStrictEqual(calls, ['read', 'arm', 'start-live'], 'arm reads baseline, persists through manager, then starts live observe');
  assert.strictEqual(receivedSpec.baseline, '10', 'baseline is captured from triggerRead');
  assert.strictEqual(receivedSpec.reported_value, '10', 'reported_value is captured from triggerRead');
  assert.strictEqual(receivedSpec.reported_attributes.title, 'Price', 'reported attributes are captured');
  assert.strictEqual(receivedSpec.agent_id, 'agent_a', 'agent id is bound into arm spec');
  assert.strictEqual(receivedSpec.ownership_token, 'tok_a', 'ownership token is bound into arm spec');
  assert.strictEqual(receivedSpec.trigger_id, 'test-random-uuid', 'missing trigger id uses crypto.randomUUID');
}

async function caseArmAutopilotLegacySpec() {
  let receivedSpec = null;
  const handlers = loadToolHandlers({
    fsbAgentRegistryInstance: {
      getOwner() {
        return null;
      },
      getTabMetadata() {
        return { ownershipToken: 'tok_legacy' };
      },
      async getOrRegisterLegacyAgent() {
        return { agentId: 'legacy:autopilot', ownershipToken: null };
      },
      async bindTab(agentId, tabId) {
        return { agentId, tabId, ownershipToken: 'tok_legacy' };
      }
    },
    async fsbTriggerSendRefreshPollRead() {
      return { success: true, value: { text: 'old' } };
    },
    FsbTriggerManager: {
      async armTrigger(spec) {
        receivedSpec = spec;
        return { ok: true, trigger_id: spec.trigger_id };
      }
    },
    FsbTriggerStore: {
      async readSnapshot() {
        return makeSnapshot(Object.assign({}, receivedSpec || {}, {
          status: 'armed',
          agent_id: receivedSpec && receivedSpec.agent_id,
          ownership_token: receivedSpec && receivedSpec.ownership_token
        }));
      }
    },
    async fsbTriggerStartObserveForSnapshot() {
      return { ok: true };
    }
  });
  const result = await handlers.fsbTriggerHandleToolArm({
    selector: '#price',
    target_tab_id: 77,
    condition: { kind: 'changed' },
    agentId: 'spoofed'
  }, { source: 'autopilot' });
  assert.strictEqual(result.success, true, 'autopilot arm succeeds on legacy-owned tab');
  assert.strictEqual(receivedSpec.agent_id, 'legacy:autopilot', 'autopilot arm spec uses derived legacy agent');
  assert.strictEqual(receivedSpec.ownership_token, 'tok_legacy', 'autopilot arm spec uses registry ownership token');
}

async function caseArmAutopilotForeignRejectsBeforeArm() {
  const calls = [];
  const handlers = loadToolHandlers({
    fsbAgentRegistryInstance: {
      getOwner() {
        return 'agent_other';
      },
      getTabMetadata() {
        return { ownershipToken: 'tok_other' };
      }
    },
    async fsbTriggerSendRefreshPollRead() {
      calls.push('read');
      return { success: true, value: { text: 'old' } };
    },
    FsbTriggerManager: {
      async armTrigger() {
        calls.push('arm');
        return { ok: true };
      }
    }
  });
  const result = await handlers.fsbTriggerHandleToolArm({
    selector: '#price',
    target_tab_id: 88,
    condition: { kind: 'changed' }
  }, { source: 'autopilot' });
  assert.strictEqual(result.success, false, 'foreign-owned autopilot arm fails');
  assert.strictEqual(result.errorCode, 'TRIGGER_ACCESS_DENIED', 'foreign-owned autopilot arm uses typed denial');
  assert.deepStrictEqual(calls, [], 'foreign-owned autopilot arm rejects before read or armTrigger');
}

async function caseDispatchHelperMapsTriggerTools() {
  let stopped = false;
  const handlers = loadToolHandlers({
    FsbTriggerStore: {
      async readSnapshot(triggerId) {
        return makeSnapshot({ trigger_id: triggerId, agent_id: null, ownership_token: null });
      },
      async hydrate() {
        return { v: 1, records: { one: makeSnapshot({ trigger_id: 'one', agent_id: null, ownership_token: null }) } };
      }
    },
    async fsbTriggerClearObserveWatchdog() {
      return { ok: true };
    },
    FsbTriggerLifecycle: {
      async clearTrigger() {
        stopped = true;
        return { ok: true };
      }
    }
  });
  const status = await handlers.fsbTriggerDispatchToolRequest('get_trigger_status', { trigger_id: 'one' }, {});
  const list = await handlers.fsbTriggerDispatchToolRequest('list_triggers', {}, {});
  const stop = await handlers.fsbTriggerDispatchToolRequest('stop_trigger', { trigger_id: 'one' }, {});
  assert.strictEqual(status.success, true, 'dispatch maps get_trigger_status');
  assert.strictEqual(list.success, true, 'dispatch maps list_triggers');
  assert.strictEqual(stop.success, true, 'dispatch maps stop_trigger');
  assert.strictEqual(stopped, true, 'dispatch stop reaches stop handler');
}

async function caseAutopilotDerivesLegacyOwnerToken() {
  const calls = [];
  const handlers = loadToolHandlers({
    fsbAgentRegistryInstance: {
      getOwner(tabId) {
        calls.push(['getOwner', tabId]);
        return null;
      },
      getTabMetadata(tabId) {
        calls.push(['getTabMetadata', tabId]);
        return { ownershipToken: 'tok_legacy' };
      },
      async getOrRegisterLegacyAgent(surface) {
        calls.push(['getOrRegisterLegacyAgent', surface]);
        return { agentId: 'legacy:autopilot', ownershipToken: null };
      },
      async bindTab(agentId, tabId) {
        calls.push(['bindTab', agentId, tabId]);
        return { agentId, tabId, ownershipToken: 'tok_legacy' };
      }
    }
  });
  const context = await handlers.fsbTriggerOwnerContext({
    source: 'autopilot',
    target_tab_id: 77,
    agentId: 'caller_spoof'
  }, null);
  assert.strictEqual(context.agentId, 'legacy:autopilot', 'autopilot derives legacy agent id');
  assert.strictEqual(context.ownershipToken, 'tok_legacy', 'autopilot derives ownership token');
  assert.ok(calls.some(c => c[0] === 'getOrRegisterLegacyAgent' && c[1] === 'autopilot'), 'legacy autopilot fallback used');
  assert.ok(calls.some(c => c[0] === 'bindTab' && c[1] === 'legacy:autopilot' && c[2] === 77), 'legacy autopilot tab binding used');
}

async function caseAutopilotRejectsForeignOwner() {
  const handlers = loadToolHandlers({
    fsbAgentRegistryInstance: {
      getOwner() {
        return 'agent_other';
      },
      getTabMetadata() {
        return { ownershipToken: 'tok_other' };
      }
    }
  });
  const context = await handlers.fsbTriggerOwnerContext({
    source: 'autopilot',
    target_tab_id: 88
  }, null);
  assert.strictEqual(context.accessDenied, true, 'foreign-owned autopilot tab is access denied');
  assert.strictEqual(context.errorCode, 'TRIGGER_ACCESS_DENIED', 'foreign-owned autopilot rejection is typed');
  assert.strictEqual(context.ownerAgentId, 'agent_other', 'foreign owner is reported without borrowing ownership');
}

(async () => {
  console.log('--- trigger-tool dispatcher background handlers ---');
  await runCase('package wiring includes dispatcher test exactly once', casePackageWiring);
  await runCase('background exposes status/list helper surface', caseSourceSurface);
  await runCase('MCP manual registrar excludes trigger from visual action path', caseMcpManualExcludesTrigger);
  await runCase('MCP runtime registers trigger tools before manual tools', caseMcpRuntimeRegistersTriggerTools);
  await runCase('MCP TaskQueue derives read-only names from registry', caseMcpQueueDerivesReadOnlyTools);
  await runCase('MCP TaskQueue trigger companions bypass pending mutation', caseMcpQueueCompanionsBypassPendingMutation);
  await runCase('MCP dispatcher trigger routes delegate to background helper', caseMcpDispatcherTriggerRoutesDelegateToBackground);
  await runCase('tool executor trigger routes delegate to background helper', caseToolExecutorTriggerRoutesDelegateToBackground);
  await runCase('tool executor runtime strips untrusted autopilot trigger fields', caseToolExecutorRuntimeStripsUntrustedAutopilotFields);
  await runCase('status/list source contracts read trigger store', caseStorageSourceContracts);
  await runCase('stop source orders cleanup before lifecycle clear', caseStopSourceOrdering);
  await runCase('arm source validates reads and starts watchers in order', caseArmSourceContracts);
  await runCase('status projection derives elapsed and remaining time', caseStatusProjectionMath);
  await runCase('list defaults to armed and attention states', caseListDefaultsToActiveAttentionStates);
  await runCase('cross-agent status is rejected without snapshot data', caseCrossAgentStatusRejected);
  await runCase('missing stop returns idempotent success', caseStopMissingIsIdempotent);
  await runCase('cross-agent stop is rejected before cleanup', caseStopRejectsCrossAgentBeforeCleanup);
  await runCase('active stop clears observe then watchdog then lifecycle', caseStopActiveCleanupOrder);
  await runCase('terminal stop clears watchdog and lifecycle idempotently', caseStopTerminalCleanupIdempotent);
  await runCase('invalid arm condition rejects before read or arm', caseInvalidConditionRejectedBeforeArm);
  await runCase('arm normalizes delta_percent alias before manager persistence', caseArmNormalizesDeltaPercentAlias);
  await runCase('arm reads baseline before manager and starts live observe', caseArmReadsBaselineBeforeManagerAndStartsLiveObserve);
  await runCase('autopilot arm spec binds legacy owner and token', caseArmAutopilotLegacySpec);
  await runCase('autopilot arm rejects foreign-owned tabs before side effects', caseArmAutopilotForeignRejectsBeforeArm);
  await runCase('dispatch helper maps trigger companion tools', caseDispatchHelperMapsTriggerTools);
  await runCase('autopilot derives legacy owner and ownership token', caseAutopilotDerivesLegacyOwnerToken);
  await runCase('autopilot rejects a tab owned by another agent', caseAutopilotRejectsForeignOwner);

  console.log('\n--- trigger-tool dispatcher summary ---');
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
