'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

const ROOT = path.resolve(__dirname, '..');
const BACKGROUND_PATH = path.join(ROOT, 'extension', 'background.js');
const PACKAGE_PATH = path.join(ROOT, 'package.json');

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
    crypto: { randomUUID: () => 'test-random-uuid' }
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

async function caseStorageSourceContracts() {
  const src = readSource(BACKGROUND_PATH);
  const statusSrc = functionSource(src, 'fsbTriggerHandleToolStatus');
  const listSrc = functionSource(src, 'fsbTriggerHandleToolList');
  assert.ok(statusSrc.includes('FsbTriggerStore.readSnapshot'), 'status reads persisted snapshot');
  assert.ok(listSrc.includes('FsbTriggerStore.hydrate'), 'list hydrates persisted trigger registry');
  assert.ok(!statusSrc.includes('activeSessions'), 'status does not project from activeSessions');
  assert.ok(!listSrc.includes('activeSessions'), 'list does not project from activeSessions');
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
  await runCase('status/list source contracts read trigger store', caseStorageSourceContracts);
  await runCase('status projection derives elapsed and remaining time', caseStatusProjectionMath);
  await runCase('list defaults to armed and attention states', caseListDefaultsToActiveAttentionStates);
  await runCase('cross-agent status is rejected without snapshot data', caseCrossAgentStatusRejected);
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
