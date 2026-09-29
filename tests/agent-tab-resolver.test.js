'use strict';

/**
 * Phase 246 plan 01 -- Wave 0 RED scaffold for the agent-scoped tab resolver.
 *
 * Validates the resolver helper at extension/utils/agent-tab-resolver.js
 * (created in Task 2). The resolver is the single chokepoint that read /
 * visual / action tool dispatch paths consult to pick a target tab for a
 * given agentId. It implements decisions D-01 (registry-driven 3-branch
 * behaviour) and D-04 (legacy:* prefix branch falls through to active tab).
 *
 * Coverage (per plan 246-01 Task 1 <behavior>):
 *   Test 1 (D-01 single owned)   -- agent owns 1 tab; resolver returns
 *                                   {tabId, ownershipToken:null, skipGate:false}.
 *   Test 2 (D-01 zero owned)     -- agent registered but owns 0 tabs;
 *                                   {success:false, code:'NO_OWNED_TAB', ...}.
 *   Test 3 (D-01 multi owned)    -- agent owns 2+ tabs; resolver returns
 *                                   selectedTabId if valid, otherwise
 *                                   {success:false, code:'AMBIGUOUS_TAB',
 *                                    agentId, tabIds:[...]}.
 *   Test 4 (D-04 legacy popup)   -- agentId='legacy:popup' with active tab;
 *                                   {tabId, ownershipToken:null, skipGate:true}.
 *   Test 5 (D-04 legacy + none)  -- legacy:* with no active tab; returns
 *                                   {success:false, code:'NO_ACTIVE_TAB', ...}.
 *   Test 6 (snake_case tab_id)   -- an explicitly selected owned tab resolves.
 *   Test 7 (camelCase tabId)     -- a foreign explicit tab is rejected before
 *                                   any direct read/action path can use it.
 *   Test 7b (navigate recovery)  -- a caller may explicitly opt into claiming
 *                                   a truly unowned tab.
 *   Test 7c (foreign recovery)   -- that opt-in never permits another agent's
 *                                   tab.
 *   Test 7d (missing authority)  -- recovery cannot infer "unowned" when the
 *                                   registry has no owner lookup.
 *   Test 8 (registry missing)    -- no globalThis.fsbAgentRegistryInstance;
 *                                   {success:false, code:'AGENT_REGISTRY_UNAVAILABLE'}.
 *
 * Wave 0 posture: this file is RED-skeleton. The resolver module does not
 * exist yet (Task 2 creates it). The require below is wrapped in try/catch;
 * MODULE_NOT_FOUND short-circuits to process.exit(0) so the test chain stays
 * green during scaffold. Task 2 removes the wrapper and enables the asserts
 * stubbed below.
 *
 * Run: node tests/agent-tab-resolver.test.js
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

const RESOLVER_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'agent-tab-resolver.js');

// Phase 246-01 Task 2: resolver landed; the Task 1 RED-skeleton wrapper that
// short-circuited on MODULE_NOT_FOUND is retired here. The 8 cases below now
// exercise the real implementation.
const resolverModule = require(RESOLVER_PATH);
const { resolveAgentTabOrError } = resolverModule;

// ---- Mock registry helpers ------------------------------------------------
//
// Mirrors the buildRegistryMock pattern from tests/ownership-error-codes.test.js
// extended with getAgentTabs(agentId) which returns Array<number>|null.

function buildRegistryMock(opts) {
  opts = opts || {};
  const knownAgents = new Set(opts.knownAgents || []);
  const tabOwners = new Map(opts.tabOwners || []);
  const selectedTabIds = new Map(opts.selectedTabIds || []);
  return {
    hasAgent(agentId) {
      return typeof agentId === 'string' && knownAgents.has(agentId);
    },
    getAgentTabs(agentId) {
      if (!knownAgents.has(agentId)) return null;
      const tabs = [];
      tabOwners.forEach((owner, tabId) => {
        if (owner === agentId) tabs.push(tabId);
      });
      return tabs;
    },
    getOwner(tabId) {
      return tabOwners.get(tabId) || null;
    },
    getSelectedTabId(agentId) {
      return selectedTabIds.get(agentId) || null;
    }
  };
}

function installRegistry(mock) {
  globalThis.fsbAgentRegistryInstance = mock;
}

function uninstallRegistry() {
  delete globalThis.fsbAgentRegistryInstance;
}

// =========================================================================
// Test 1 (D-01 single owned)
// =========================================================================
async function test1_singleOwned() {
  console.log('--- Test 1: D-01 single owned tab ---');
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a'],
    tabOwners: [[42, 'agent_a']]
  }));
  try {
    const resolved = await resolveAgentTabOrError('agent_a', {}, null);
    check(resolved && resolved.tabId === 42, 'tabId === 42');
    check(resolved && resolved.ownershipToken === null, 'ownershipToken === null');
    check(resolved && resolved.skipGate === false, 'skipGate === false');
    check(!('success' in resolved) || resolved.success !== false, 'no error envelope on happy path');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 2 (D-01 zero owned)
// =========================================================================
async function test2_zeroOwned() {
  console.log('--- Test 2: D-01 zero owned tabs -> NO_OWNED_TAB ---');
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a']
    // no tabOwners
  }));
  try {
    const resolved = await resolveAgentTabOrError('agent_a', {}, null);
    check(resolved && resolved.success === false, 'success === false');
    check(resolved && resolved.code === 'NO_OWNED_TAB', 'code === NO_OWNED_TAB');
    check(resolved && resolved.agentId === 'agent_a', 'agentId echoed');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 3 (D-01 multi owned)
// =========================================================================
async function test3_multiOwned() {
  console.log('--- Test 3: D-01 multi owned tabs without selection -> AMBIGUOUS_TAB ---');
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a'],
    tabOwners: [[42, 'agent_a'], [43, 'agent_a']]
  }));
  try {
    const resolved = await resolveAgentTabOrError('agent_a', {}, null);
    check(resolved && resolved.success === false, 'success === false');
    check(resolved && resolved.code === 'AMBIGUOUS_TAB', 'code === AMBIGUOUS_TAB');
    check(resolved && resolved.agentId === 'agent_a', 'agentId echoed');
    check(Array.isArray(resolved.tabIds) && resolved.tabIds.includes(42) && resolved.tabIds.includes(43), 'tabIds contains both 42 and 43');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 3b (multi owned + selected tab)
// =========================================================================
async function test3b_multiOwnedSelected() {
  console.log('--- Test 3b: multi owned tabs with selectedTabId resolves selection ---');
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a'],
    tabOwners: [[42, 'agent_a'], [43, 'agent_a']],
    selectedTabIds: [['agent_a', 43]]
  }));
  try {
    const resolved = await resolveAgentTabOrError('agent_a', {}, null);
    check(resolved && resolved.tabId === 43, 'tabId === selected tab 43');
    check(resolved && resolved.skipGate === false, 'skipGate === false');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 3c (multi owned + invalid selected tab)
// =========================================================================
async function test3c_multiOwnedInvalidSelected() {
  console.log('--- Test 3c: invalid selectedTabId still returns AMBIGUOUS_TAB ---');
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a'],
    tabOwners: [[42, 'agent_a'], [43, 'agent_a']],
    selectedTabIds: [['agent_a', 99]]
  }));
  try {
    const resolved = await resolveAgentTabOrError('agent_a', {}, null);
    check(resolved && resolved.success === false, 'success === false');
    check(resolved && resolved.code === 'AMBIGUOUS_TAB', 'code === AMBIGUOUS_TAB');
    check(Array.isArray(resolved.tabIds) && resolved.tabIds.length === 2, 'tabIds still enumerates owned tabs');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 4 (D-04 legacy popup)
// =========================================================================
async function test4_legacyPopup() {
  console.log('--- Test 4: D-04 legacy:popup falls through to _getActiveTab ---');
  // No registry needed; legacy branch is first line of resolver.
  const mockClient = {
    _getActiveTab: async () => ({ id: 99, url: 'https://example.com', active: true })
  };
  const resolved = await resolveAgentTabOrError('legacy:popup', {}, mockClient);
  check(resolved && resolved.tabId === 99, 'tabId === 99 from active-tab fall-through');
  check(resolved && resolved.ownershipToken === null, 'ownershipToken === null');
  check(resolved && resolved.skipGate === true, 'skipGate === true (legacy bypasses gate tab-arm)');
}

// =========================================================================
// Test 5 (D-04 legacy + no active tab)
// =========================================================================
async function test5_legacyNoActive() {
  console.log('--- Test 5: D-04 legacy:sidepanel + no active tab -> NO_ACTIVE_TAB ---');
  const mockClient = {
    _getActiveTab: async () => null
  };
  const resolved = await resolveAgentTabOrError('legacy:sidepanel', {}, mockClient);
  check(resolved && resolved.success === false, 'success === false');
  check(resolved && resolved.code === 'NO_ACTIVE_TAB', 'code === NO_ACTIVE_TAB');
  check(resolved && resolved.agentId === 'legacy:sidepanel', 'agentId echoed');
}

// =========================================================================
// Test 6 (explicit tab_id snake_case)
// =========================================================================
async function test6_explicitSnakeCase() {
  console.log('--- Test 6: explicit owned params.tab_id resolves ---');
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a'],
    tabOwners: [[42, 'agent_a']]
  }));
  try {
    const resolved = await resolveAgentTabOrError('agent_a', { tab_id: 42 }, null);
    check(resolved && resolved.tabId === 42, 'tabId === 42 (owned explicit params.tab_id)');
    check(resolved && resolved.ownershipToken === null, 'ownershipToken === null');
    check(resolved && resolved.skipGate === false, 'skipGate === false');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 7 (explicit tabId camelCase)
// =========================================================================
async function test7_explicitCamelCase() {
  console.log('--- Test 7: explicit foreign params.tabId rejects centrally ---');
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a', 'agent_b'],
    tabOwners: [[42, 'agent_a'], [7, 'agent_b']]
  }));
  try {
    const resolved = await resolveAgentTabOrError('agent_a', { tabId: 7 }, null);
    check(resolved && resolved.success === false, 'success === false');
    check(resolved && resolved.code === 'TAB_NOT_OWNED', 'code === TAB_NOT_OWNED');
    check(resolved && resolved.ownerAgentId === 'agent_b', 'ownerAgentId === agent_b');
  } finally {
    uninstallRegistry();
  }
}

async function test7b_explicitUnownedClaim() {
  console.log('--- Test 7b: explicit unowned tab resolves only for recovery opt-in ---');
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a'],
    tabOwners: [[42, 'agent_a']]
  }));
  try {
    const denied = await resolveAgentTabOrError('agent_a', { tab_id: 7 }, null);
    check(denied && denied.code === 'TAB_NOT_OWNED', 'unowned explicit tab rejects by default');
    const resolved = await resolveAgentTabOrError(
      'agent_a',
      { tab_id: 7 },
      null,
      { allowUnownedClaim: true }
    );
    check(resolved && resolved.tabId === 7, 'unowned explicit tab resolves with recovery opt-in');
    check(resolved && resolved.skipGate === false, 'recovery target still passes through ownership gate');
  } finally {
    uninstallRegistry();
  }
}

async function test7c_explicitForeignClaimRejects() {
  console.log('--- Test 7c: recovery opt-in never resolves a foreign tab ---');
  installRegistry(buildRegistryMock({
    knownAgents: ['agent_a', 'agent_b'],
    tabOwners: [[42, 'agent_a'], [7, 'agent_b']]
  }));
  try {
    const resolved = await resolveAgentTabOrError(
      'agent_a',
      { tab_id: 7 },
      null,
      { allowUnownedClaim: true }
    );
    check(resolved && resolved.success === false, 'success === false');
    check(resolved && resolved.code === 'TAB_NOT_OWNED', 'code === TAB_NOT_OWNED');
    check(resolved && resolved.ownerAgentId === 'agent_b', 'foreign owner remains visible in typed error');
  } finally {
    uninstallRegistry();
  }
}

async function test7d_claimRequiresOwnerAuthority() {
  console.log('--- Test 7d: recovery claim fails closed without owner authority ---');
  const registry = buildRegistryMock({
    knownAgents: ['agent_a'],
    tabOwners: [[42, 'agent_a']]
  });
  delete registry.getOwner;
  installRegistry(registry);
  try {
    const resolved = await resolveAgentTabOrError(
      'agent_a',
      { tab_id: 7 },
      null,
      { allowUnownedClaim: true }
    );
    check(resolved && resolved.success === false, 'success === false');
    check(resolved && resolved.code === 'TAB_NOT_OWNED', 'claim rejects without getOwner authority');
  } finally {
    uninstallRegistry();
  }
}

// =========================================================================
// Test 8 (registry unavailable)
// =========================================================================
async function test8_registryUnavailable() {
  console.log('--- Test 8: no registry singleton -> AGENT_REGISTRY_UNAVAILABLE ---');
  uninstallRegistry();
  const resolved = await resolveAgentTabOrError('agent_a', {}, null);
  check(resolved && resolved.success === false, 'success === false');
  check(resolved && resolved.code === 'AGENT_REGISTRY_UNAVAILABLE', 'code === AGENT_REGISTRY_UNAVAILABLE');
  check(resolved && resolved.agentId === 'agent_a', 'agentId echoed');
}

async function run() {
  await test1_singleOwned();
  await test2_zeroOwned();
  await test3_multiOwned();
  await test3b_multiOwnedSelected();
  await test3c_multiOwnedInvalidSelected();
  await test4_legacyPopup();
  await test5_legacyNoActive();
  await test6_explicitSnakeCase();
  await test7_explicitCamelCase();
  await test7b_explicitUnownedClaim();
  await test7c_explicitForeignClaimRejects();
  await test7d_claimRequiresOwnerAuthority();
  await test8_registryUnavailable();

  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  failed++;
  console.error('  FAIL: uncaught error:', err && err.stack ? err.stack : err);
  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(1);
});
