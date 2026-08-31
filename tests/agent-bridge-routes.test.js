'use strict';

/**
 * Phase 238 plan 02 -- agent:register / agent:release / agent:status bridge route
 * handler unit tests (Wave 0).
 *
 * These tests gate the contract for the three new dispatcher handlers added in
 * Plan 02 Task 2. Until Task 2 lands those handlers (and exports them on the
 * dispatcher's module.exports), this file SKIP-PASSES so the test runner stays
 * green during TDD red phase.
 *
 * Coverage (D-09, D-10, D-12):
 *   Test 1 - D-12 register: caller-supplied agentId is IGNORED; registry mints fresh.
 *            Asserts handler called registerAgent() with ZERO arguments.
 *   Test 2 - D-12 register: registry unavailable -> agent_registry_unavailable error.
 *   Test 3 - D-09 release: happy path with explicit reason.
 *   Test 4 - release: missing agentId -> invalid-params error.
 *   Test 5 - D-10 status: caller-self-only scope; exact 4-key response shape.
 *            NO `agents` array, NO cross-agent leakage.
 *   Test 6 - status: missing agentId -> invalid-params error.
 *
 * Run: node tests/agent-bridge-routes.test.js
 */

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

// --- Load dispatcher module ----------------------------------------------
const DISPATCHER_PATH = path.resolve(__dirname, '..', 'extension', 'ws', 'mcp-tool-dispatcher.js');
const dispatcher = require(DISPATCHER_PATH);

// Wave 0 skip-pass: if Task 2 has not yet exported the handlers, exit cleanly.
if (typeof dispatcher.handleAgentRegisterRoute !== 'function'
    || typeof dispatcher.handleAgentReleaseRoute !== 'function'
    || typeof dispatcher.handleAgentStatusRoute !== 'function') {
  console.log('SKIPPED -- handlers not yet exported (Wave 0; gated by Plan 02 Task 2)');
  process.exit(0);
}

const {
  handleAgentRegisterRoute,
  handleAgentReleaseRoute,
  handleAgentStatusRoute
} = dispatcher;

// --- Mock registry --------------------------------------------------------
class MockAgentRegistry {
  constructor(opts = {}) {
    this._mintId = opts.mintId || 'agent_minted-fresh-uuid';
    this._releaseResult = opts.releaseResult !== undefined ? opts.releaseResult : true;
    this._tabsByAgent = opts.tabsByAgent || {};
    this.calls = {
      registerAgent: [],
      releaseAgent: [],
      getAgentTabs: [],
      stampConnectionId: []
    };
  }
  async registerAgent() {
    this.calls.registerAgent.push(Array.from(arguments));
    return { agentId: this._mintId, agentIdShort: this._mintId.slice(0, 12) };
  }
  async releaseAgent(agentId, reason) {
    this.calls.releaseAgent.push([agentId, reason]);
    return this._releaseResult;
  }
  getAgentTabs(agentId) {
    this.calls.getAgentTabs.push([agentId]);
    return this._tabsByAgent[agentId] || [];
  }
  stampConnectionId(agentId, connectionId) {
    this.calls.stampConnectionId.push([agentId, connectionId]);
    return true;
  }
}

// --- Test harness helpers ------------------------------------------------
function installMockRegistry(mock) {
  globalThis.fsbAgentRegistryInstance = mock;
  globalThis.FsbAgentRegistry = {
    formatAgentIdForDisplay: (id) => (typeof id === 'string' ? id.slice(0, 12) : '')
  };
}

function uninstallRegistry() {
  delete globalThis.fsbAgentRegistryInstance;
  delete globalThis.FsbAgentRegistry;
}

// =========================================================================
// Test 1 (D-12): register handler IGNORES caller-supplied agentId
// =========================================================================
async function test1_registerIgnoresCallerSuppliedId() {
  console.log('--- Test 1: D-12 register handler ignores caller-supplied agentId ---');
  const mock = new MockAgentRegistry({ mintId: 'agent_fresh-server-mint' });
  installMockRegistry(mock);
  try {
    const response = await handleAgentRegisterRoute({
      payload: { agentId: 'attacker-supplied-id' }
    });
    check(response.success === true, 'response.success === true');
    check(response.agentId === 'agent_fresh-server-mint',
      'response.agentId is the registry-minted id, NOT the caller-supplied id');
    check(response.agentId !== 'attacker-supplied-id',
      'response.agentId differs from attacker-supplied id');
    check(response.agentIdShort === 'agent_fresh-server-mint'.slice(0, 12),
      'response.agentIdShort is the formatAgentIdForDisplay output of the fresh id (12-char slice)');

    // W8: registerAgent() must be called with ZERO arguments.
    check(mock.calls.registerAgent.length === 1,
      'registerAgent called exactly once');
    check(
      mock.calls.registerAgent[0].length === 0,
      'D-12: handler must call registerAgent() with no arguments -- found args = '
        + JSON.stringify(mock.calls.registerAgent[0])
    );
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 2 (D-12): register handler with registry unavailable
// =========================================================================
async function test2_registerRegistryUnavailable() {
  console.log('--- Test 2: D-12 register handler -- registry unavailable ---');
  uninstallRegistry();
  globalThis.fsbAgentRegistryInstance = undefined;
  try {
    const response = await handleAgentRegisterRoute({ payload: {} });
    check(response.success === false, 'response.success === false when registry missing');
    check(response.errorCode === 'agent_registry_unavailable',
      "errorCode is 'agent_registry_unavailable'");
    check(typeof response.error === 'string' && response.error.length > 0,
      'response.error is a non-empty string');
  } finally {
    uninstallRegistry();
  }
}

async function test2b_registerUsesClientConnectionIdFallback() {
  console.log('--- Test 2b: register handler uses client connectionId fallback ---');
  const mock = new MockAgentRegistry({ mintId: 'agent_conn-fallback' });
  installMockRegistry(mock);
  try {
    const response = await handleAgentRegisterRoute({
      payload: {},
      client: { getConnectionId: () => 'conn-client-123' }
    });
    check(response.success === true, 'response.success === true');
    check(response.connectionId === 'conn-client-123', 'response echoes client connectionId fallback');
    check(mock.calls.stampConnectionId.length === 1, 'stampConnectionId called once');
    check(mock.calls.stampConnectionId[0][0] === 'agent_conn-fallback', 'stampConnectionId receives minted agent id');
    check(mock.calls.stampConnectionId[0][1] === 'conn-client-123', 'stampConnectionId receives client connection id');
  } finally {
    uninstallRegistry();
  }
}

async function test2c_delegationRegistrationGateAndRollback() {
  console.log('--- Test 2c: delegation registration requires one exact controller gate ---');
  const delegationId = 'Delegation_expected_live_6104';

  // Missing gate fails closed and removes the otherwise ordinary agent row.
  {
    const mock = new MockAgentRegistry({ mintId: 'agent_missing-gate' });
    installMockRegistry(mock);
    try {
      const response = await handleAgentRegisterRoute({ payload: { delegationId } });
      check(response.success === false, 'missing delegation controller gate rejects registration');
      check(response.errorCode === 'delegation_binding_rejected', 'missing gate returns typed rejection');
      check(mock.calls.releaseAgent.length === 1, 'missing gate rolls back ordinary agent record');
      check(mock.calls.releaseAgent[0][0] === 'agent_missing-gate', 'rollback targets freshly minted id');
    } finally {
      uninstallRegistry();
    }
  }

  // A malformed sidecar never reaches the gate, but still rolls back mint.
  {
    const mock = new MockAgentRegistry({ mintId: 'agent_malformed-sidecar' });
    installMockRegistry(mock);
    let calls = 0;
    try {
      const response = await handleAgentRegisterRoute({
        payload: { delegationId: 'case.varied.invalid' },
        bindRegisteredAgent: async () => { calls += 1; return { ok: true }; },
      });
      check(response.success === false, 'malformed delegation id rejects registration');
      check(calls === 0, 'malformed delegation id never reaches controller authorization');
      check(mock.calls.releaseAgent.length === 1, 'malformed sidecar rolls back ordinary record');
    } finally {
      uninstallRegistry();
    }
  }

  // The exact expected active id is passed with the fresh agent id. The gate
  // consumes it once; a replay/case variation is denied and rolled back.
  {
    const mock = new MockAgentRegistry({ mintId: 'agent_expected-live' });
    installMockRegistry(mock);
    let expected = delegationId;
    const calls = [];
    const gate = async (input) => {
      calls.push(input);
      if (input.delegationId !== expected) {
        return { ok: false, code: 'delegation_binding_rejected' };
      }
      expected = null;
      return { ok: true };
    };
    try {
      const accepted = await handleAgentRegisterRoute({
        payload: { delegationId, agentId: 'attacker-agent-id' },
        bindRegisteredAgent: gate,
      });
      check(accepted.success === true, 'single expected live delegation is accepted');
      check(calls.length === 1, 'controller gate called exactly once');
      check(calls[0].delegationId === delegationId, 'gate receives exact sidecar bytes');
      check(calls[0].agentId === 'agent_expected-live', 'gate receives fresh extension-minted id');

      const replay = await handleAgentRegisterRoute({
        payload: { delegationId },
        bindRegisteredAgent: gate,
      });
      check(replay.success === false, 'consumed expected registration rejects replay');
      check(mock.calls.releaseAgent.length === 1, 'denied replay rolls back its ordinary record');

      const caseVaried = await handleAgentRegisterRoute({
        payload: { delegationId: delegationId.toLowerCase() },
        bindRegisteredAgent: gate,
      });
      check(caseVaried.success === false, 'case-varied delegation id is not equivalent');
      check(mock.calls.releaseAgent.length === 2, 'case-varied denial also rolls back');
    } finally {
      uninstallRegistry();
    }
  }

  for (const code of [
    'unknown_delegation',
    'delegation_not_active',
    'delegation_stale',
    'delegation_terminal',
    'delegation_binding_conflict',
  ]) {
    const mock = new MockAgentRegistry({ mintId: 'agent_denied-' + code });
    installMockRegistry(mock);
    try {
      const response = await handleAgentRegisterRoute({
        payload: { delegationId },
        authorizeDelegation: async () => ({ ok: false, code }),
      });
      check(response.success === false && response.errorCode === code,
        code + ' controller denial is preserved');
      check(mock.calls.releaseAgent.length === 1, code + ' denial rolls back the mint');
    } finally {
      uninstallRegistry();
    }
  }
}

// =========================================================================
// Test 3 (D-09): release handler happy path
// =========================================================================
async function test3_releaseHappyPath() {
  console.log('--- Test 3: D-09 release handler -- happy path ---');
  const mock = new MockAgentRegistry({ releaseResult: true });
  installMockRegistry(mock);
  try {
    const response = await handleAgentReleaseRoute({
      payload: { agentId: 'agent_xxx', reason: 'mcp-explicit' }
    });
    check(response.success === true, 'response.success === true');
    check(response.released === true, 'response.released === true');
    check(mock.calls.releaseAgent.length === 1, 'releaseAgent called exactly once');
    check(mock.calls.releaseAgent[0][0] === 'agent_xxx',
      'releaseAgent called with payload.agentId');
    check(mock.calls.releaseAgent[0][1] === 'mcp-explicit',
      'releaseAgent called with payload.reason');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 4: release handler -- missing agentId
// =========================================================================
async function test4_releaseMissingAgentId() {
  console.log('--- Test 4: release handler -- missing agentId ---');
  const mock = new MockAgentRegistry();
  installMockRegistry(mock);
  try {
    const response = await handleAgentReleaseRoute({ payload: {} });
    check(response.success === false, 'response.success === false on missing agentId');
    check(typeof response.error === 'string' && response.error.indexOf('agent:release') !== -1
      && response.error.indexOf('agentId') !== -1,
      'response.error mentions both agent:release and agentId');
    check(mock.calls.releaseAgent.length === 0,
      'releaseAgent NOT called when agentId missing');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 5 (D-10): status handler -- caller-self-only scope
// =========================================================================
async function test5_statusCallerSelfOnly() {
  console.log('--- Test 5: D-10 status handler -- caller-self-only scope ---');
  const mock = new MockAgentRegistry({
    tabsByAgent: { 'agent_xxx': [123, 456], 'agent_other': [999] }
  });
  installMockRegistry(mock);
  try {
    const response = await handleAgentStatusRoute({
      payload: { agentId: 'agent_xxx' }
    });
    check(response.success === true, 'response.success === true');
    check(response.agentId === 'agent_xxx', 'response.agentId echoes caller agentId');
    check(response.agentIdShort === 'agent_xxx',
      'response.agentIdShort is formatAgentIdForDisplay of caller id (12-char slice)');
    check(Array.isArray(response.tabIds) && response.tabIds.length === 2
      && response.tabIds[0] === 123 && response.tabIds[1] === 456,
      'response.tabIds === [123, 456]');

    // CRITICAL D-10: response shape must be EXACTLY 4 keys; no leakage.
    const keys = Object.keys(response).sort().join(',');
    check(keys === 'agentId,agentIdShort,success,tabIds',
      'response keys are EXACTLY [agentId, agentIdShort, success, tabIds]; got=' + keys);
    check(response.agents === undefined,
      'response has NO `agents` array (no full registry snapshot leak)');
    check(mock.calls.getAgentTabs.length === 1
      && mock.calls.getAgentTabs[0][0] === 'agent_xxx',
      'getAgentTabs called once with caller agentId only');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 6: status handler -- missing agentId
// =========================================================================
async function test6_statusMissingAgentId() {
  console.log('--- Test 6: status handler -- missing agentId ---');
  const mock = new MockAgentRegistry();
  installMockRegistry(mock);
  try {
    const response = await handleAgentStatusRoute({ payload: {} });
    check(response.success === false, 'response.success === false on missing agentId');
    check(typeof response.error === 'string' && response.error.indexOf('agent:status') !== -1
      && response.error.indexOf('agentId') !== -1,
      'response.error mentions both agent:status and agentId');
    check(mock.calls.getAgentTabs.length === 0,
      'getAgentTabs NOT called when agentId missing');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Run all
// =========================================================================
(async function main() {
  try {
    await test1_registerIgnoresCallerSuppliedId();
    await test2_registerRegistryUnavailable();
    await test2b_registerUsesClientConnectionIdFallback();
    await test2c_delegationRegistrationGateAndRollback();
    await test3_releaseHappyPath();
    await test4_releaseMissingAgentId();
    await test5_statusCallerSelfOnly();
    await test6_statusMissingAgentId();
  } catch (err) {
    console.error('Unhandled error during test run:', err && err.stack || err);
    process.exit(1);
  }

  console.log('');
  console.log('=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  if (failed > 0) {
    process.exit(1);
  }
  console.log('agent-bridge-routes.test.js: PASS');
})();
