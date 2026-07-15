'use strict';

/**
 * Phase 237 plan 01 + 02 -- agent registry CRUD + helpers + mutex + storage.
 *
 * Plan 01 validates:
 *   - Module export shape (constants + class + helpers)
 *   - formatAgentIdForDisplay (D-02 canonical 6-char prefix helper)
 *   - registerAgent ID minting (AGENT-01: caller-supplied ids ignored)
 *   - Multi-agent independence (AGENT-04 data-structural)
 *   - 20-concurrent-claim mutex serialization (TOCTOU groundwork for Phase 241)
 *   - In-memory CRUD (bindTab / releaseTab / isOwnedBy / getOwner / getAgentTabs)
 *   - releaseTab idempotency (Pitfall 6)
 *   - releaseAgent removes agent and all bound tabs
 *
 * Plan 02 validates (AGENT-02 + AGENT-03):
 *   - Storage write-through round-trip on register / bind / release / agent release
 *   - Empty registry removes the storage key
 *   - Versioned envelope { v: 1, records: { ... } } shape
 *   - Version mismatch and corrupt envelope fall through gracefully
 *   - hydrate() rebuilds Maps from storage (SW-eviction simulation)
 *   - hydrate() drops ghost records (tab no longer in chrome.tabs.query)
 *   - hydrate() emits agent:reaped diagnostic events via rateLimitedWarn
 *   - hydrate() is idempotent (second call no-op) and gated by withRegistryLock
 *   - hydrate() conservative on chrome.tabs.query failure (does not drop)
 *   - emitAgentReapedEvent shape (D-03 verbatim) and lazy-reference safety
 *
 * Run: node tests/agent-registry.test.js
 */

const assert = require('assert');
const path = require('path');
const REGISTRY_MODULE_PATH = require.resolve('../extension/utils/agent-registry.js');
const { dispatchMcpToolRoute } = require('../extension/ws/mcp-tool-dispatcher.js');

// Initial require for plan 01 tests; plan 02 storage tests fresh-require per test
// after installing chrome mock so the module's lazy globalThis.chrome reference
// resolves against the mock.
const reg = require(REGISTRY_MODULE_PATH);
const {
  AgentRegistry,
  formatAgentIdForDisplay,
  withRegistryLock,
  FSB_AGENT_REGISTRY_STORAGE_KEY,
  FSB_AGENT_REGISTRY_PAYLOAD_VERSION,
  FSB_AGENT_LOG_PREFIX,
  FSB_AGENT_ID_PREFIX
} = reg;

// ---- Plan 02 chrome mock harness (createStorageArea copied from
// tests/mcp-bridge-client-lifecycle.test.js:33-70 verbatim; chrome.tabs added) -----

function createStorageArea(initial) {
  const store = Object.assign({}, initial || {});
  let nextSetError = null;
  return {
    async get(keys) {
      if (keys == null) return Object.assign({}, store);
      if (Array.isArray(keys)) {
        const out = {};
        keys.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(store, key)) out[key] = store[key];
        });
        return out;
      }
      if (typeof keys === 'string') {
        return Object.prototype.hasOwnProperty.call(store, keys)
          ? { [keys]: store[keys] }
          : {};
      }
      if (typeof keys === 'object') {
        const out = {};
        Object.keys(keys).forEach((key) => {
          out[key] = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : keys[key];
        });
        return out;
      }
      return Object.assign({}, store);
    },
    async set(values) {
      if (nextSetError) {
        const error = nextSetError;
        nextSetError = null;
        throw error;
      }
      Object.assign(store, values);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => { delete store[key]; });
    },
    _dump() {
      return Object.assign({}, store);
    },
    _rejectNextSet(error) {
      nextSetError = error || new Error('storage write rejected');
    },
  };
}

function createChromeTabsMock(initialTabs) {
  let tabs = (initialTabs || []).map((t) => Object.assign({}, t));
  const listeners = { onRemoved: [] };
  let queryThrows = false;
  return {
    async query(_filter) {
      if (queryThrows) throw new Error('tabs.query unavailable');
      return tabs.slice();
    },
    async get(tabId) {
      const found = tabs.find((t) => t.id === tabId);
      if (!found) throw new Error('No tab with id: ' + tabId);
      return found;
    },
    onRemoved: {
      addListener(fn) { listeners.onRemoved.push(fn); },
      _emit(tabId) { listeners.onRemoved.forEach((fn) => { fn(tabId); }); }
    },
    _setTabs(newTabs) { tabs = newTabs.slice(); },
    _addTab(t) { tabs.push(Object.assign({}, t)); },
    _removeTab(tabId) { tabs = tabs.filter((t) => t.id !== tabId); },
    _setQueryThrows(v) { queryThrows = !!v; }
  };
}

function setupChromeMock(opts) {
  opts = opts || {};
  const session = createStorageArea(opts.session || {});
  const local = createStorageArea(opts.local || {});
  const tabs = createChromeTabsMock(opts.tabs || []);
  globalThis.chrome = {
    runtime: { id: 'phase-237-test', lastError: null },
    storage: { session: session, local: local },
    tabs: tabs
  };
  return { session: session, local: local, tabs: tabs };
}

function teardownChromeMock() {
  delete globalThis.chrome;
}

function setupDiagnosticCapture() {
  const captured = [];
  globalThis.rateLimitedWarn = function(prefix, category, message, ctx) {
    captured.push({
      prefix: prefix,
      category: category,
      message: message,
      ctx: ctx
    });
  };
  globalThis.redactForLog = function(v) { return { kind: typeof v }; };
  return captured;
}

function teardownDiagnosticCapture() {
  delete globalThis.rateLimitedWarn;
  delete globalThis.redactForLog;
}

function freshRequireRegistry() {
  delete require.cache[REGISTRY_MODULE_PATH];
  return require(REGISTRY_MODULE_PATH);
}

// ---- helpers ---------------------------------------------------------------

function freshRegistry() {
  const registry = new AgentRegistry();
  if (typeof registry._resetForTests === 'function') {
    registry._resetForTests();
  }
  return registry;
}

const UUID_PATTERN = /^agent_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---- main ------------------------------------------------------------------

(async () => {
  console.log('--- Module exports ---');
  assert.strictEqual(typeof AgentRegistry, 'function', 'AgentRegistry is a constructor');
  assert.strictEqual(typeof formatAgentIdForDisplay, 'function', 'formatAgentIdForDisplay is a function');
  assert.strictEqual(typeof withRegistryLock, 'function', 'withRegistryLock is a function');
  assert.strictEqual(FSB_AGENT_REGISTRY_STORAGE_KEY, 'fsbAgentRegistry', 'storage key is fsbAgentRegistry');
  assert.strictEqual(FSB_AGENT_REGISTRY_PAYLOAD_VERSION, 1, 'payload version is 1');
  assert.strictEqual(FSB_AGENT_LOG_PREFIX, 'AGT', 'log prefix is AGT');
  assert.strictEqual(FSB_AGENT_ID_PREFIX, 'agent_', 'id prefix is agent_');
  console.log('  PASS: module exports verified');

  console.log('--- formatAgentIdForDisplay returns 6-char prefix (D-02 canonical) ---');
  assert.strictEqual(
    formatAgentIdForDisplay('agent_550e8400-e29b-41d4-a716-446655440000'),
    'agent_550e84',
    'full uuid -> first 6 hex'
  );
  assert.strictEqual(
    formatAgentIdForDisplay('agent_abcdef12-3456-7890-abcd-ef1234567890'),
    'agent_abcdef',
    'second uuid -> first 6 hex'
  );
  assert.strictEqual(formatAgentIdForDisplay(''), '', 'empty string -> empty');
  assert.strictEqual(formatAgentIdForDisplay(null), '', 'null -> empty');
  assert.strictEqual(formatAgentIdForDisplay(undefined), '', 'undefined -> empty');
  assert.strictEqual(formatAgentIdForDisplay(12345), '', 'number -> empty');
  assert.strictEqual(formatAgentIdForDisplay({}), '', 'object -> empty');
  assert.strictEqual(formatAgentIdForDisplay([]), '', 'array -> empty');
  assert.strictEqual(
    formatAgentIdForDisplay('not-prefixed-uuid'),
    '',
    'no agent_ prefix -> empty'
  );
  assert.strictEqual(
    formatAgentIdForDisplay('agent_abc'),
    'agent_abc',
    'short input -> slice without padding'
  );
  assert.strictEqual(
    formatAgentIdForDisplay('agent_'),
    'agent_',
    'bare prefix -> bare prefix'
  );
  console.log('  PASS: formatAgentIdForDisplay handles valid + invalid inputs');

  console.log('--- registerAgent ignores caller-supplied agent_id (AGENT-01) ---');
  {
    const registry = freshRegistry();
    const r1 = await registry.registerAgent({ agent_id: 'agent_pre-supplied' });
    assert.notStrictEqual(r1.agentId, 'agent_pre-supplied', 'caller-supplied agent_id ignored');
    assert.ok(r1.agentId.startsWith('agent_'), 'agentId starts with agent_');
    assert.ok(UUID_PATTERN.test(r1.agentId), 'agentId is agent_<rfc4122-v4>');
    assert.strictEqual(
      r1.agentIdShort,
      formatAgentIdForDisplay(r1.agentId),
      'agentIdShort matches formatAgentIdForDisplay output'
    );
    assert.strictEqual(
      r1.agentIdShort.length,
      'agent_'.length + 6,
      'agentIdShort is exactly 6 hex chars after the agent_ prefix'
    );

    // Even with no opts at all, minting works.
    const r2 = await registry.registerAgent();
    assert.ok(UUID_PATTERN.test(r2.agentId), 'no-opts call mints valid agentId');
    assert.notStrictEqual(r2.agentId, r1.agentId, 'second call mints a distinct id');

    // Even with arbitrary garbage, opts are ignored.
    const r3 = await registry.registerAgent({ agentId: 'evil', tabIds: [1, 2, 3] });
    assert.ok(UUID_PATTERN.test(r3.agentId), 'garbage opts produce valid agentId');
    assert.notStrictEqual(r3.agentId, 'evil', 'agentId field on opts ignored');
  }
  console.log('  PASS: registerAgent always mints fresh crypto.randomUUID, ignores caller input');

  console.log('--- Multiple agents coexist independently (AGENT-04) ---');
  {
    const registry = freshRegistry();
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const r = await registry.registerAgent();
      ids.push(r.agentId);
    }
    assert.strictEqual(new Set(ids).size, 5, 'all 5 agentIds distinct');
    assert.strictEqual(registry.listAgents().length, 5, 'listAgents reports 5 agents');

    // Release one; the others remain.
    const released = registry.releaseAgent(ids[2], 'test');
    // releaseAgent is gated by the mutex; await
    const releaseResult = (released && typeof released.then === 'function')
      ? await released
      : released;
    assert.strictEqual(releaseResult, true, 'releaseAgent returns true on existing id');
    assert.strictEqual(registry.listAgents().length, 4, 'one fewer agent after release');
    assert.ok(
      registry.listAgents().every(record => record.agentId !== ids[2]),
      'released agent no longer in listAgents'
    );

    // Other agents still present and untouched.
    for (let i = 0; i < 5; i++) {
      if (i === 2) continue;
      assert.ok(
        registry.listAgents().some(record => record.agentId === ids[i]),
        'sibling agent ' + i + ' still present'
      );
    }
  }
  console.log('  PASS: 5 agents register and release independently');

  console.log('--- 20-concurrent registerAgent mutex serialization stress ---');
  {
    const registry = freshRegistry();
    // Phase 241 plan 01: this test predates the cap (default 8). The test's
    // intent is mutex-serialization: zero ID collisions across 20 concurrent
    // claims. Lift the cap to 64 so cap-rejection (a separate invariant
    // covered by tests/agent-cap.test.js) does not interfere with this
    // pre-existing serialization assertion.
    if (typeof registry.setCap === 'function') registry.setCap(64);
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(registry.registerAgent({}));
    }
    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 20, '20 registrations resolved');
    const seen = new Set();
    for (const r of results) {
      assert.ok(UUID_PATTERN.test(r.agentId), 'concurrent agentId valid: ' + r.agentId);
      seen.add(r.agentId);
    }
    assert.strictEqual(seen.size, 20, 'no agentId collisions across 20 concurrent claims');
    assert.strictEqual(registry.listAgents().length, 20, '_agents.size === 20 (mutex held)');
  }
  console.log('  PASS: 20 concurrent registerAgent calls all distinct, no silent drops');

  console.log('--- In-memory CRUD: bindTab / releaseTab / isOwnedBy / getOwner / getAgentTabs ---');
  {
    const registry = freshRegistry();
    const r = await registry.registerAgent();
    const A = r.agentId;

    // bindTab is gated by withRegistryLock; methods may return promises.
    // Phase 240: bindTab return shape is now {agentId, tabId, ownershipToken}
    // on success; false on failure. Truthy-check preserves Phase 237 callers.
    const b1 = registry.bindTab(A, 100);
    const b1Result = (b1 && typeof b1.then === 'function') ? await b1 : b1;
    assert.ok(b1Result, 'bindTab(A, 100) returns truthy on success');

    const b2 = registry.bindTab(A, 200);
    const b2Result = (b2 && typeof b2.then === 'function') ? await b2 : b2;
    assert.ok(b2Result, 'bindTab(A, 200) returns truthy on success');

    assert.strictEqual(registry.isOwnedBy(100, A), true, 'isOwnedBy(100, A) === true');
    assert.strictEqual(
      registry.isOwnedBy(100, 'agent_other'),
      false,
      'isOwnedBy(100, other) === false'
    );
    assert.strictEqual(registry.getOwner(100), A, 'getOwner(100) === A');
    assert.strictEqual(registry.getOwner(999), null, 'getOwner(unowned) === null');

    const tabs = registry.getAgentTabs(A);
    assert.ok(Array.isArray(tabs), 'getAgentTabs returns an array');
    assert.strictEqual(tabs.length, 2, 'agent A owns 2 tabs');
    assert.ok(tabs.includes(100) && tabs.includes(200), 'agent A owns 100 and 200');

    // bindTab on unknown agent -> false (no throw)
    const bGhost = registry.bindTab('agent_does-not-exist', 300);
    const bGhostResult = (bGhost && typeof bGhost.then === 'function') ? await bGhost : bGhost;
    assert.strictEqual(bGhostResult, false, 'bindTab on unknown agent returns false');

    // bindTab with invalid tabId -> false
    const bBad = registry.bindTab(A, -1);
    const bBadResult = (bBad && typeof bBad.then === 'function') ? await bBad : bBad;
    assert.strictEqual(bBadResult, false, 'bindTab with invalid tabId returns false');

    // releaseTab(100) removes binding
    const rel1 = registry.releaseTab(100);
    const rel1Result = (rel1 && typeof rel1.then === 'function') ? await rel1 : rel1;
    assert.strictEqual(rel1Result, true, 'releaseTab(100) returns true');
    assert.strictEqual(registry.getOwner(100), null, 'after releaseTab(100), getOwner(100) === null');
    const tabsAfter = registry.getAgentTabs(A);
    assert.strictEqual(tabsAfter.length, 1, 'agent A now owns 1 tab');
    assert.strictEqual(tabsAfter[0], 200, 'remaining tab is 200');
  }
  console.log('  PASS: bindTab / releaseTab / isOwnedBy / getOwner / getAgentTabs in-memory CRUD');

  console.log('--- releaseTab is idempotent (Pitfall 6) ---');
  {
    const registry = freshRegistry();
    const r = await registry.registerAgent();
    const A = r.agentId;
    const b1 = registry.bindTab(A, 100);
    if (b1 && typeof b1.then === 'function') await b1;

    const first = registry.releaseTab(100);
    const firstResult = (first && typeof first.then === 'function') ? await first : first;
    assert.strictEqual(firstResult, true, 'first releaseTab(100) returns true');

    let secondThrew = false;
    let second;
    try {
      second = registry.releaseTab(100);
      if (second && typeof second.then === 'function') second = await second;
    } catch (err) {
      secondThrew = true;
    }
    assert.strictEqual(secondThrew, false, 'second releaseTab(100) does not throw');
    assert.strictEqual(second, false, 'second releaseTab(100) returns false (no-op)');

    let neverThrew = false;
    let never;
    try {
      never = registry.releaseTab(99999);
      if (never && typeof never.then === 'function') never = await never;
    } catch (err) {
      neverThrew = true;
    }
    assert.strictEqual(neverThrew, false, 'releaseTab on never-owned tab does not throw');
    assert.strictEqual(never, false, 'releaseTab on never-owned tab returns false');
  }
  console.log('  PASS: releaseTab idempotent; double-call and never-owned are silent no-ops');

  console.log('--- releaseAgent removes agent and all bound tabs ---');
  {
    const registry = freshRegistry();
    const r = await registry.registerAgent();
    const A = r.agentId;

    for (const tabId of [100, 200, 300]) {
      const b = registry.bindTab(A, tabId);
      if (b && typeof b.then === 'function') await b;
    }
    assert.strictEqual(registry.getAgentTabs(A).length, 3, 'A owns 3 tabs before release');

    const rel = registry.releaseAgent(A, 'test');
    const relResult = (rel && typeof rel.then === 'function') ? await rel : rel;
    assert.strictEqual(relResult, true, 'releaseAgent returns true on existing agent');

    assert.ok(
      registry.listAgents().every(record => record.agentId !== A),
      'released agent removed from listAgents'
    );
    assert.strictEqual(registry.getOwner(100), null, 'tab 100 unowned after agent release');
    assert.strictEqual(registry.getOwner(200), null, 'tab 200 unowned after agent release');
    assert.strictEqual(registry.getOwner(300), null, 'tab 300 unowned after agent release');

    const ghostTabs = registry.getAgentTabs(A);
    assert.ok(
      ghostTabs === null || (Array.isArray(ghostTabs) && ghostTabs.length === 0),
      'getAgentTabs on released agent returns null or empty array'
    );

    // releaseAgent on unknown agent -> false (no throw)
    const ghost = registry.releaseAgent('agent_does-not-exist', 'test');
    const ghostResult = (ghost && typeof ghost.then === 'function') ? await ghost : ghost;
    assert.strictEqual(ghostResult, false, 'releaseAgent on unknown agent returns false');
  }
  console.log('  PASS: releaseAgent reaps agent and all tab bindings');

  console.log('--- listAgents returns shallow clones (caller cannot corrupt internal state) ---');
  {
    const registry = freshRegistry();
    const r = await registry.registerAgent();
    const before = registry.listAgents();
    assert.strictEqual(before.length, 1, 'listAgents returns one record');
    // Mutate the returned record.
    before[0].agentId = 'agent_corrupted';
    before[0].tabIds.push(99999);
    const after = registry.listAgents();
    assert.strictEqual(after[0].agentId, r.agentId, 'internal agentId not mutated');
    assert.strictEqual(after[0].tabIds.length, 0, 'internal tabIds not mutated');
  }
  console.log('  PASS: listAgents returns defensive clones');

  console.log('--- hydrate / _persist are async functions (plan 02 wires real storage) ---');
  {
    const registry = freshRegistry();
    assert.strictEqual(typeof registry.hydrate, 'function', 'hydrate exists');
    assert.strictEqual(typeof registry._persist, 'function', '_persist exists');
    // Real plan-02 calls require chrome mock; here we only verify shape.
  }
  console.log('  PASS: hydrate and _persist exist as functions');

  // === Plan 02: storage round-trip ============================================

  console.log('--- Plan 02 / Test 1: storage round-trip -- registerAgent persists ---');
  {
    const mock = setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      const ids = [];
      for (let i = 0; i < 5; i++) {
        const r = await registry.registerAgent();
        ids.push(r.agentId);
      }
      const dump = mock.session._dump();
      const payload = dump[fresh.FSB_AGENT_REGISTRY_STORAGE_KEY];
      assert.ok(payload && typeof payload === 'object', 'payload exists');
      assert.strictEqual(payload.v, 1, 'payload.v === 1');
      assert.ok(payload.records && typeof payload.records === 'object', 'payload.records exists');
      assert.strictEqual(Object.keys(payload.records).length, 5, '5 records persisted');
      ids.forEach((id) => {
        const rec = payload.records[id];
        assert.ok(rec, 'record exists for ' + id);
        assert.strictEqual(rec.agentId, id, 'record.agentId matches');
        assert.strictEqual(typeof rec.createdAt, 'number', 'record.createdAt is number');
        assert.ok(Array.isArray(rec.tabIds), 'record.tabIds is array');
        assert.strictEqual(rec.tabIds.length, 0, 'record.tabIds is empty');
        assert.ok(!('connection_id' in rec), 'no connection_id field (D-04)');
      });
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: registerAgent writes through to chrome.storage.session');

  console.log('--- Plan 02 / Test 2: storage round-trip -- bindTab persists ---');
  {
    const mock = setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      const r = await registry.registerAgent();
      await registry.bindTab(r.agentId, 100);
      await registry.bindTab(r.agentId, 200);
      const payload = mock.session._dump()[fresh.FSB_AGENT_REGISTRY_STORAGE_KEY];
      const tabIds = payload.records[r.agentId].tabIds;
      assert.ok(tabIds.includes(100), 'tab 100 persisted');
      assert.ok(tabIds.includes(200), 'tab 200 persisted');
      assert.strictEqual(tabIds.length, 2, 'exactly 2 tabIds');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: bindTab writes through to chrome.storage.session');

  console.log('--- Plan 02 / Test 3: storage round-trip -- releaseTab persists ---');
  {
    const mock = setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      const r = await registry.registerAgent();
      await registry.bindTab(r.agentId, 100);
      await registry.bindTab(r.agentId, 200);
      await registry.bindTab(r.agentId, 300);
      await registry.releaseTab(200);
      const payload = mock.session._dump()[fresh.FSB_AGENT_REGISTRY_STORAGE_KEY];
      const tabIds = payload.records[r.agentId].tabIds;
      assert.ok(tabIds.includes(100), 'tab 100 still present');
      assert.ok(tabIds.includes(300), 'tab 300 still present');
      assert.ok(!tabIds.includes(200), 'tab 200 no longer present');
      assert.strictEqual(tabIds.length, 2, 'exactly 2 tabIds remain');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: releaseTab writes through to chrome.storage.session');

  console.log('--- Plan 02 / Test 4: storage round-trip -- releaseAgent removes from storage ---');
  {
    const mock = setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      const A = (await registry.registerAgent()).agentId;
      const B = (await registry.registerAgent()).agentId;
      await registry.bindTab(A, 100);
      await registry.bindTab(B, 200);
      await registry.releaseAgent(A, 'test');
      const payload = mock.session._dump()[fresh.FSB_AGENT_REGISTRY_STORAGE_KEY];
      assert.ok(payload, 'payload still exists (B remains)');
      const keys = Object.keys(payload.records);
      assert.strictEqual(keys.length, 1, 'exactly 1 record remains');
      assert.strictEqual(keys[0], B, 'remaining record is B');
      assert.ok(!(A in payload.records), 'agent A removed from storage');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: releaseAgent writes through to chrome.storage.session');

  console.log('--- Plan 02 / Test 5: empty registry removes the storage key ---');
  {
    const mock = setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      const r = await registry.registerAgent();
      // Verify it was written.
      assert.ok(
        fresh.FSB_AGENT_REGISTRY_STORAGE_KEY in mock.session._dump(),
        'key present after registerAgent'
      );
      await registry.releaseAgent(r.agentId, 'test');
      const dump = mock.session._dump();
      assert.ok(
        !(fresh.FSB_AGENT_REGISTRY_STORAGE_KEY in dump),
        'storage key removed when records are empty'
      );
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: empty records map removes the storage key');

  console.log('--- Plan 02 / Test 6: version mismatch returns null ---');
  {
    const mock = setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 99,
          records: { ghost: { agentId: 'ghost', createdAt: 1, tabIds: [] } }
        }
      }
    });
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      await registry.hydrate();
      assert.strictEqual(registry.listAgents().length, 0, 'version mismatch -> empty in-memory state');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: version mismatch falls through to empty state');

  console.log('--- Plan 02 / Test 7: SW-eviction simulation -- fresh instance repopulates from storage ---');
  {
    const mock = setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {
            'agent_a': { agentId: 'agent_a', createdAt: 1234, tabIds: [100] }
          }
        }
      },
      tabs: [{ id: 100 }]
    });
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      await registry.hydrate();
      assert.strictEqual(registry.listAgents().length, 1, 'one agent rehydrated');
      assert.strictEqual(registry.getOwner(100), 'agent_a', 'tab 100 -> agent_a after hydrate');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: hydrate rebuilds Maps from a valid persisted snapshot');

  console.log('--- Plan 02 / Test 8: corrupt envelope falls through gracefully ---');
  {
    const mock = setupChromeMock({
      session: { fsbAgentRegistry: 'not-an-object' }
    });
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      let threw = false;
      try {
        await registry.hydrate();
      } catch (e) {
        threw = true;
      }
      assert.strictEqual(threw, false, 'hydrate did not throw on corrupt envelope');
      assert.strictEqual(registry.listAgents().length, 0, 'no records on corrupt envelope');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: corrupt envelope handled defensively, no throw');

  // === Plan 02: ghost-record reconciliation + diagnostic emission =============

  console.log('--- Plan 02 / Test 9: hydrate drops ghost records and emits diagnostic ---');
  {
    const mock = setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {
            'agent_550e8400-e29b-41d4-a716-446655440000': {
              agentId: 'agent_550e8400-e29b-41d4-a716-446655440000',
              createdAt: 1000,
              tabIds: [100]
            },
            'agent_999e8400-e29b-41d4-a716-446655440000': {
              agentId: 'agent_999e8400-e29b-41d4-a716-446655440000',
              createdAt: 2000,
              tabIds: [999]
            }
          }
        }
      },
      tabs: [{ id: 100 }] // tab 999 is the ghost
    });
    const captured = setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      await registry.hydrate();
      assert.strictEqual(registry.listAgents().length, 1, 'ghost agent dropped');
      assert.strictEqual(
        registry.getOwner(100),
        'agent_550e8400-e29b-41d4-a716-446655440000',
        'tab 100 -> live agent'
      );
      assert.strictEqual(registry.getOwner(999), null, 'tab 999 has no owner');
      assert.strictEqual(captured.length, 1, 'exactly 1 warn captured');
      const warn = captured[0];
      assert.strictEqual(warn.prefix, 'AGT', 'prefix is AGT');
      assert.strictEqual(
        warn.category,
        'agent-reaped-tab_not_found',
        'category is agent-reaped-tab_not_found'
      );
      assert.strictEqual(warn.ctx.tabId, 999, 'ctx.tabId === 999');
      assert.strictEqual(warn.ctx.reason, 'tab_not_found', 'ctx.reason === tab_not_found');
      assert.strictEqual(
        warn.ctx.agentIdShort,
        fresh.formatAgentIdForDisplay('agent_999e8400-e29b-41d4-a716-446655440000'),
        'ctx.agentIdShort matches display formatter'
      );
      // Storage written back.
      const payload = mock.session._dump()[fresh.FSB_AGENT_REGISTRY_STORAGE_KEY];
      assert.ok(
        !('agent_999e8400-e29b-41d4-a716-446655440000' in payload.records),
        'ghost agent removed from storage'
      );
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: hydrate drops ghosts and emits a diagnostic per drop');

  console.log('--- Plan 02 / Test 10: hydrate drops MULTIPLE ghosts (one warn per record) ---');
  {
    const mock = setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {
            'agent_live-0000-0000-0000-000000000001': {
              agentId: 'agent_live-0000-0000-0000-000000000001',
              createdAt: 1, tabIds: [100]
            },
            'agent_g111-0000-0000-0000-000000000001': {
              agentId: 'agent_g111-0000-0000-0000-000000000001',
              createdAt: 2, tabIds: [991]
            },
            'agent_g222-0000-0000-0000-000000000002': {
              agentId: 'agent_g222-0000-0000-0000-000000000002',
              createdAt: 3, tabIds: [992]
            },
            'agent_g333-0000-0000-0000-000000000003': {
              agentId: 'agent_g333-0000-0000-0000-000000000003',
              createdAt: 4, tabIds: [993]
            }
          }
        }
      },
      tabs: [{ id: 100 }]
    });
    const captured = setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      await registry.hydrate();
      assert.strictEqual(registry.listAgents().length, 1, 'only live agent remains');
      assert.strictEqual(captured.length, 3, 'one warn emitted per ghost (3 total)');
      const tabIds = captured.map((w) => w.ctx.tabId).sort();
      assert.deepStrictEqual(tabIds, [991, 992, 993], 'each ghost tab seen exactly once');
      captured.forEach((w) => {
        assert.strictEqual(w.prefix, 'AGT', 'all warns have AGT prefix');
        assert.strictEqual(
          w.category,
          'agent-reaped-tab_not_found',
          'all warns are tab_not_found category'
        );
      });
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: 3 ghosts -> 3 warns (one per record)');

  console.log('--- Plan 02 / Test 11: hydrate is idempotent (second call no-op) ---');
  {
    const mock = setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {
            'agent_a-0000-0000-0000-000000000001': {
              agentId: 'agent_a-0000-0000-0000-000000000001',
              createdAt: 1, tabIds: [100]
            },
            'agent_g-0000-0000-0000-000000000002': {
              agentId: 'agent_g-0000-0000-0000-000000000002',
              createdAt: 2, tabIds: [999]
            }
          }
        }
      },
      tabs: [{ id: 100 }]
    });
    const captured = setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      await registry.hydrate();
      const stateAfter1 = registry.listAgents().map((r) => r.agentId).sort();
      const captured1 = captured.length;
      await registry.hydrate();
      const stateAfter2 = registry.listAgents().map((r) => r.agentId).sort();
      const captured2 = captured.length;
      assert.deepStrictEqual(stateAfter1, stateAfter2, 'state unchanged across hydrate calls');
      assert.strictEqual(captured1, captured2, 'no NEW warns on second hydrate');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: hydrate idempotent; second call adds no warns');

  console.log('--- Plan 02 / Test 12: hydrate is gated by withRegistryLock ---');
  {
    const mock = setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {
            'agent_a-0000-0000-0000-000000000001': {
              agentId: 'agent_a-0000-0000-0000-000000000001',
              createdAt: 1, tabIds: [100]
            }
          }
        }
      },
      tabs: [{ id: 100 }]
    });
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      const [_h, regResult] = await Promise.all([
        registry.hydrate(),
        registry.registerAgent()
      ]);
      assert.strictEqual(registry.listAgents().length, 2, 'hydrated agent + new agent both present');
      assert.strictEqual(
        registry.getOwner(100),
        'agent_a-0000-0000-0000-000000000001',
        'hydrate completed before register observable'
      );
      assert.ok(regResult && regResult.agentId, 'registerAgent returned a fresh id');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: concurrent hydrate + registerAgent serialized under mutex');

  console.log('--- Plan 02 / Test 13: hydrate is conservative when chrome.tabs.query throws ---');
  {
    const mock = setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {
            'agent_x-0000-0000-0000-000000000001': {
              agentId: 'agent_x-0000-0000-0000-000000000001',
              createdAt: 1, tabIds: [100]
            },
            'agent_y-0000-0000-0000-000000000002': {
              agentId: 'agent_y-0000-0000-0000-000000000002',
              createdAt: 2, tabIds: [200]
            },
            'agent_z-0000-0000-0000-000000000003': {
              agentId: 'agent_z-0000-0000-0000-000000000003',
              createdAt: 3, tabIds: [300]
            }
          }
        }
      },
      tabs: []
    });
    mock.tabs._setQueryThrows(true);
    const captured = setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      await registry.hydrate();
      assert.strictEqual(registry.listAgents().length, 3, 'no records dropped on query failure');
      const reapingWarns = captured.filter((w) => w.category && w.category.indexOf('agent-reaped-') === 0);
      assert.strictEqual(reapingWarns.length, 0, 'no reaping warns emitted on query failure');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: chrome.tabs.query failure -> conservative no-drop posture');

  console.log('--- Plan 02 / Test 14: emitAgentReapedEvent has correct payload shape (D-03) ---');
  {
    setupChromeMock();
    const captured = setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      assert.ok(
        fresh._internal && typeof fresh._internal.emitAgentReapedEvent === 'function',
        '_internal.emitAgentReapedEvent exists'
      );
      fresh._internal.emitAgentReapedEvent(
        'agent_550e8400-e29b-41d4-a716-446655440000',
        999,
        'tab_not_found'
      );
      assert.strictEqual(captured.length, 1, 'exactly 1 warn captured');
      const w = captured[0];
      assert.strictEqual(w.prefix, 'AGT', 'prefix === AGT');
      assert.strictEqual(w.category, 'agent-reaped-tab_not_found', 'category per-reason');
      assert.strictEqual(w.message, 'agent reaped', 'message === "agent reaped"');
      assert.deepStrictEqual(
        w.ctx,
        {
          agentIdShort: 'agent_550e84',
          tabId: 999,
          reason: 'tab_not_found'
        },
        'ctx shape matches D-03 verbatim'
      );
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: emitAgentReapedEvent emits exact D-03 payload');

  console.log('--- Plan 02 / Test 15: emit is safe when rateLimitedWarn is absent (Pitfall 5) ---');
  {
    const mock = setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {
            'agent_g-0000-0000-0000-000000000001': {
              agentId: 'agent_g-0000-0000-0000-000000000001',
              createdAt: 1, tabIds: [999]
            }
          }
        }
      },
      tabs: []
    });
    // NOTE: deliberately do NOT install rateLimitedWarn.
    delete globalThis.rateLimitedWarn;
    delete globalThis.redactForLog;
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      let threw = false;
      try {
        await registry.hydrate();
      } catch (e) {
        threw = true;
      }
      assert.strictEqual(threw, false, 'hydrate did not throw without rateLimitedWarn');
      assert.strictEqual(registry.listAgents().length, 0, 'ghost still dropped');
      // Storage rewritten without ghost.
      const dump = mock.session._dump();
      const payload = dump[fresh.FSB_AGENT_REGISTRY_STORAGE_KEY];
      // Either the key is removed (records empty) or records is empty object.
      if (payload) {
        assert.strictEqual(Object.keys(payload.records).length, 0, 'storage records empty');
      }
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: missing rateLimitedWarn does not crash reaping path');

  // === Phase 240 token + metadata (additive coverage) =========================

  console.log('--- Phase 240 / Test 1: bindTab returns { agentId, tabId, ownershipToken } ---');
  {
    const mock = setupChromeMock({ tabs: [{ id: 100, incognito: false, windowId: 10 }] });
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      const reg = await registry.registerAgent();
      const result = await registry.bindTab(reg.agentId, 100);
      assert.ok(result && typeof result === 'object', 'bindTab return is an object');
      assert.strictEqual(result.agentId, reg.agentId, 'result.agentId === registered agentId');
      assert.strictEqual(result.tabId, 100, 'result.tabId === bound tabId');
      assert.ok(typeof result.ownershipToken === 'string' && result.ownershipToken.length > 0,
        'ownershipToken is a non-empty string');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: bindTab return shape extended with ownershipToken');

  console.log('--- Phase 240 / Test 2: storage envelope persists tabMetadata block ---');
  {
    const mock = setupChromeMock({ tabs: [{ id: 100, incognito: false, windowId: 10 }] });
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      const reg = await registry.registerAgent();
      const r = await registry.bindTab(reg.agentId, 100);
      const dump = mock.session._dump();
      const payload = dump[fresh.FSB_AGENT_REGISTRY_STORAGE_KEY];
      assert.ok(payload, 'envelope persisted');
      assert.strictEqual(payload.v, 1, 'envelope version is 1 (unchanged)');
      assert.ok(payload.tabMetadata && typeof payload.tabMetadata === 'object',
        'tabMetadata block at top level');
      const meta = payload.tabMetadata['100'];
      assert.ok(meta, 'metadata for tab 100');
      assert.strictEqual(meta.ownershipToken, r.ownershipToken,
        'persisted token matches in-memory');
      assert.strictEqual(meta.incognito, false, 'persisted incognito flag');
      assert.strictEqual(meta.windowId, 10, 'persisted windowId');
      assert.ok(typeof meta.boundAt === 'number', 'persisted boundAt is numeric');
      assert.strictEqual(meta.lastAgentNavigationAt, null,
        'unstamped navigation metadata persists an explicit safe null');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: tabMetadata persists at v: 1 (additive, no schema bump)');

  console.log('--- Phase 240 / Test 3: hydrate rebuilds _tabMetadata from envelope ---');
  {
    const mock = setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {
            'agent_550e8400-e29b-41d4-a716-446655440000': {
              agentId: 'agent_550e8400-e29b-41d4-a716-446655440000',
              createdAt: 1000,
              tabIds: [100],
              windowId: 10
            }
          },
          tabMetadata: {
            '100': {
              ownershipToken: 'persist-token-aaa',
              incognito: false,
              windowId: 10,
              boundAt: 999,
              lastAgentNavigationAt: 777
            }
          }
        }
      },
      tabs: [{ id: 100, incognito: false, windowId: 10 }]
    });
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      await registry.hydrate();
      const meta = registry.getTabMetadata(100);
      assert.ok(meta, 'getTabMetadata after hydrate returns metadata');
      assert.strictEqual(meta.ownershipToken, 'persist-token-aaa',
        'hydrated ownershipToken survives round-trip');
      assert.strictEqual(meta.incognito, false);
      assert.strictEqual(meta.windowId, 10);
      assert.strictEqual(meta.boundAt, 999);
      assert.strictEqual(meta.lastAgentNavigationAt, 777);
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: hydrate restores _tabMetadata block');

  // === Phase 61 delegation correlation ======================================

  console.log('--- Phase 61 / Task 1: exact one-to-one delegation mapping ---');
  {
    const mock = setupChromeMock({
      tabs: [
        { id: 101, incognito: false, windowId: 10 },
        { id: 202, incognito: false, windowId: 20 }
      ]
    });
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      const agentA = (await registry.registerAgent()).agentId;
      const agentB = (await registry.registerAgent()).agentId;
      const tabA = await registry.bindTab(agentA, 101);
      await registry.bindTab(agentB, 202);
      const delegationA = 'Delegation_live_A_6104';
      const delegationB = 'Delegation_live_B_6104';

      const boundA = await registry.bindDelegation({ delegationId: delegationA, agentId: agentA });
      const boundB = await registry.bindDelegation({ delegationId: delegationB, agentId: agentB });
      assert.strictEqual(boundA.ok, true);
      assert.strictEqual(boundB.ok, true);
      assert.strictEqual(registry.getAgentForDelegation(delegationA), agentA);
      assert.deepStrictEqual(
        registry.getDelegationOwnedTabs({ delegationId: delegationA, agentId: agentA }),
        [{ tabId: 101, ownershipToken: tabA.ownershipToken }],
        'lookup returns only the complete exact tab/token set',
      );
      assert.deepStrictEqual(
        registry.getDelegationOwnedTabs({ delegationId: delegationA, agentId: agentB }),
        [],
        'mismatched expected agent sees no ownership',
      );

      const samePair = await registry.bindDelegation({ delegationId: delegationA, agentId: agentA });
      assert.strictEqual(samePair.code, 'delegation_already_bound');
      assert.strictEqual(
        (await registry.bindDelegation({ delegationId: delegationA, agentId: agentB })).code,
        'delegation_binding_conflict',
      );
      assert.strictEqual(
        (await registry.bindDelegation({ delegationId: delegationB, agentId: agentA })).code,
        'delegation_binding_conflict',
      );
      assert.strictEqual(
        (await registry.bindDelegation({ delegationId: 'bad.id', agentId: agentA })).ok,
        false,
      );

      const agentC = (await registry.registerAgent()).agentId;
      const delegationC = 'Delegation_storage_C_6104';
      mock.session._rejectNextSet(new Error('binding write rejected'));
      assert.deepStrictEqual(
        await registry.bindDelegation({ delegationId: delegationC, agentId: agentC }),
        { ok: false, code: 'delegation_binding_persistence_failed' },
        'durable binding failure leaves no in-memory authority',
      );
      assert.strictEqual(registry.getAgentForDelegation(delegationC), null);

      assert.strictEqual(await registry.releaseAgent(agentA, 'test'), false,
        'generic release cannot bypass exact delegated cleanup');
      assert.strictEqual(registry.getAgentForDelegation(delegationA), agentA,
        'generic release retains controller-owned mapping');
      assert.deepStrictEqual(
        await registry.releaseDelegation({ delegationId: delegationA, agentId: agentA }),
        { ok: true, code: 'delegation_released', releasedTabCount: 1 },
      );
      assert.strictEqual(registry.getAgentForDelegation(delegationA), null,
        'exact cleanup removes its delegation mapping');
      assert.strictEqual(registry.getAgentForDelegation(delegationB), agentB,
        'unrelated delegation remains mapped');
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: exact one-to-one mapping rejects conflicts and removes only itself');

  console.log('--- Phase 61 / Task 1: delegation map hydrate validates ghosts and conflicts ---');
  {
    const agentA = 'agent_550e8400-e29b-41d4-a716-446655440001';
    const agentB = 'agent_550e8400-e29b-41d4-a716-446655440002';
    const delegationA = 'Delegation_hydrate_A_6104';
    const delegationGhost = 'Delegation_hydrate_ghost_6104';
    const mock = setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {
            [agentA]: { agentId: agentA, createdAt: 1, tabIds: [301] },
            [agentB]: { agentId: agentB, createdAt: 2, tabIds: [302] }
          },
          tabMetadata: {
            '301': { ownershipToken: 'token-a', incognito: false, windowId: 1, boundAt: 1 },
            '302': { ownershipToken: 'token-b', incognito: false, windowId: 1, boundAt: 1 }
          },
          delegations: {
            [delegationA]: agentA,
            [delegationGhost]: 'agent_missing',
            'Delegation_duplicate_B1_6104': agentB,
            'Delegation_duplicate_B2_6104': agentB,
            'malformed.id': agentB
          }
        }
      },
      tabs: [
        { id: 301, incognito: false, windowId: 1 },
        { id: 302, incognito: false, windowId: 1 }
      ]
    });
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      await registry.hydrate();
      assert.strictEqual(registry.getAgentForDelegation(delegationA), agentA);
      assert.strictEqual(registry.getAgentForDelegation(delegationGhost), null);
      assert.strictEqual(registry.getAgentForDelegation('Delegation_duplicate_B1_6104'), null);
      assert.strictEqual(registry.getAgentForDelegation('Delegation_duplicate_B2_6104'), null);
      assert.strictEqual(registry.getAgentForDelegation('malformed.id'), null);
      const persisted = mock.session._dump().fsbAgentRegistry;
      assert.deepStrictEqual(persisted.delegations, { [delegationA]: agentA },
        'hydrate writes back only the valid one-to-one row');
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: hydrate retains only valid non-ghost one-to-one rows');

  console.log('--- Phase 61 / Task 2: complete owned set seals into one held lease ---');
  {
    const now = 50_000;
    const mock = setupChromeMock({
      tabs: [
        { id: 401, incognito: false, windowId: 4 },
        { id: 402, incognito: false, windowId: 4 }
      ]
    });
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry({ now: () => now });
      const agentA = (await registry.registerAgent()).agentId;
      const agentB = (await registry.registerAgent()).agentId;
      await registry.bindTab(agentA, 401);
      await registry.bindTab(agentA, 402);
      const tabSecurity = [401, 402].map((tabId) => {
        const meta = registry.getTabMetadata(tabId);
        return {
          tabId,
          ownershipToken: meta.ownershipToken,
          incognito: meta.incognito,
          windowId: meta.windowId,
          boundAt: meta.boundAt,
          forced: meta.forced,
          lastAgentNavigationAt: meta.lastAgentNavigationAt || null,
        };
      });
      const delegationId = 'Delegation_hold_complete_6104';
      await registry.bindDelegation({ delegationId, agentId: agentA });
      const ownedTabs = registry.getDelegationOwnedTabs({ delegationId, agentId: agentA });
      const sealed = await registry.sealHoldLease({
        delegationId,
        agentId: agentA,
        activeTabId: 401,
        ownedTabs,
        expiresAt: now + fresh.FSB_HOLD_LEASE_MS,
      });
      assert.deepStrictEqual(sealed, {
        ok: true,
        code: 'hold_lease_sealed',
        expiresAt: now + 300000,
      });
      assert.deepStrictEqual(registry.getAgentTabs(agentA), [], 'all active ownership leaves automation');
      assert.strictEqual(registry.getOwner(401), null);
      assert.strictEqual(registry.getOwner(402), null);
      assert.strictEqual(registry.getTabMetadata(401), null, 'active token cache leaves the active index');
      assert.strictEqual(await registry.bindTab(agentB, 401), false, 'second agent cannot claim held active tab');
      assert.strictEqual(await registry.bindTab(agentB, 402), false, 'second agent cannot claim any held tab');
      assert.strictEqual(await registry.bindTab(agentA, 401), false, 'mapped agent cannot bypass its own lease');
      assert.strictEqual(await registry.releaseTab(401), false, 'generic tab release cannot dissolve held state');
      assert.strictEqual(await registry.releaseAgent(agentA, 'connection-expired'), false,
        'generic agent release cannot dissolve held state');
      assert.strictEqual(registry.getAgentForDelegation(delegationId), agentA,
        'exact delegation mapping remains live while held');
      assert.deepStrictEqual(registry.getDelegationHoldLease({ delegationId, agentId: agentA }), {
        ok: true,
        code: 'hold_lease_present',
        activeTabId: 401,
        ownedTabs,
        expiresAt: now + 300000,
      }, 'held reconciliation reads the complete exact lease without restoring it');
      assert.deepStrictEqual(
        registry.getDelegationHoldLease({ delegationId, agentId: agentB }),
        { ok: false, code: 'resume_ownership_lost' },
        'mismatched reconciliation cannot inspect another agent lease',
      );

      const envelope = mock.session._dump().fsbAgentRegistry;
      assert.strictEqual(envelope.v, 1, 'registry envelope version remains additive v1');
      assert.deepStrictEqual(envelope.holdLeases[delegationId], {
        v: 2,
        delegationId,
        agentId: agentA,
        activeTabId: 401,
        ownedTabs,
        tabSecurity,
        issuedAt: now,
        expiresAt: now + 300000,
      });
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: exact complete set becomes one durable unclaimable lease');

  console.log('--- Phase 61 / Task 2: every invalid seal preserves complete active ownership ---');
  {
    const now = 70_000;
    setupChromeMock({
      tabs: [
        { id: 411, incognito: false, windowId: 4 },
        { id: 412, incognito: false, windowId: 4 }
      ]
    });
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry({ now: () => now });
      const agentId = (await registry.registerAgent()).agentId;
      await registry.bindTab(agentId, 411);
      await registry.bindTab(agentId, 412);
      const delegationId = 'Delegation_hold_validation_6104';
      await registry.bindDelegation({ delegationId, agentId });
      const exact = registry.getDelegationOwnedTabs({ delegationId, agentId });
      const expiresAt = now + fresh.FSB_HOLD_LEASE_MS;
      const cases = [
        { activeTabId: 999, ownedTabs: exact, expiresAt },
        { activeTabId: 411, ownedTabs: exact.slice(0, 1), expiresAt },
        { activeTabId: 411, ownedTabs: exact.concat({ tabId: 999, ownershipToken: 'extra-token' }), expiresAt },
        { activeTabId: 411, ownedTabs: [exact[0], exact[0], exact[1]], expiresAt },
        {
          activeTabId: 411,
          ownedTabs: [
            { tabId: exact[0].tabId, ownershipToken: exact[0].ownershipToken + '-changed' },
            exact[1],
          ],
          expiresAt,
        },
        { activeTabId: 411, ownedTabs: exact, expiresAt: expiresAt + 1 },
      ];
      for (const testCase of cases) {
        const result = await registry.sealHoldLease({ delegationId, agentId, ...testCase });
        assert.strictEqual(result.ok, false, 'invalid seal fails');
        assert.deepStrictEqual(
          registry.getDelegationOwnedTabs({ delegationId, agentId }),
          exact,
          'invalid seal leaves every original tab/token active',
        );
        assert.strictEqual(registry.isOwnedBy(411, agentId, exact[0].ownershipToken), true);
        assert.strictEqual(registry.isOwnedBy(412, agentId, exact[1].ownershipToken), true);
      }
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: active mismatch, partial/extra/duplicate/token/expiry failures are mutation-free');

  console.log('--- Phase 61 / Task 2: seal serializes against claims/releases and survives reload/expiry ---');
  {
    let now = 90_000;
    setupChromeMock({
      tabs: [
        { id: 421, incognito: false, windowId: 4 },
        { id: 422, incognito: false, windowId: 4 }
      ]
    });
    try {
      let fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry({ now: () => now });
      const agentA = (await registry.registerAgent()).agentId;
      const agentB = (await registry.registerAgent()).agentId;
      await registry.bindTab(agentA, 421);
      await registry.bindTab(agentA, 422);
      const delegationId = 'Delegation_hold_reload_6104';
      await registry.bindDelegation({ delegationId, agentId: agentA });
      const ownedTabs = registry.getDelegationOwnedTabs({ delegationId, agentId: agentA });
      const results = await Promise.all([
        registry.sealHoldLease({
          delegationId,
          agentId: agentA,
          activeTabId: 421,
          ownedTabs,
          expiresAt: now + fresh.FSB_HOLD_LEASE_MS,
        }),
        registry.bindTab(agentB, 421),
        registry.releaseTab(422),
      ]);
      assert.strictEqual(results[0].ok, true, 'seal wins its queued atomic transition');
      assert.strictEqual(results[1], false, 'concurrent claim observes held reservation');
      assert.strictEqual(results[2], false, 'concurrent generic release cannot touch held reservation');

      now += fresh.FSB_HOLD_LEASE_MS + 1;
      fresh = freshRequireRegistry();
      const restored = new fresh.AgentRegistry({ now: () => now });
      await restored.hydrate();
      assert.strictEqual(restored.getAgentForDelegation(delegationId), agentA);
      assert.deepStrictEqual(restored.getAgentTabs(agentA), [], 'reload retains no active ownership while held');
      assert.strictEqual(await restored.bindTab(agentB, 421), false,
        'lease remains unclaimable after exact expiry boundary and module reload');
      assert.strictEqual(await restored.bindTab(agentB, 422), false,
        'every expired held tab remains cancellation-required, never silently free');

      const sealSource = fresh.AgentRegistry.prototype.sealHoldLease.toString();
      assert.strictEqual(sealSource.includes('chrome.tabs.query'), false,
        'sealHoldLease never queries active-tab UI state');
      assert.strictEqual(sealSource.includes('activeTabId'), true,
        'seal consumes only the controller-verified active id');
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: lock ordering, reload, expiry, and no-active-query invariants hold');

  console.log('--- Phase 61 / Task 2: storage rejection leaves original ownership intact ---');
  {
    const now = 110_000;
    const mock = setupChromeMock({
      tabs: [
        { id: 431, incognito: false, windowId: 4 },
        { id: 432, incognito: false, windowId: 4 }
      ]
    });
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry({ now: () => now });
      const agentId = (await registry.registerAgent()).agentId;
      await registry.bindTab(agentId, 431);
      await registry.bindTab(agentId, 432);
      const delegationId = 'Delegation_hold_storage_6104';
      await registry.bindDelegation({ delegationId, agentId });
      const ownedTabs = registry.getDelegationOwnedTabs({ delegationId, agentId });
      mock.session._rejectNextSet(new Error('quota rejected'));
      const result = await registry.sealHoldLease({
        delegationId,
        agentId,
        activeTabId: 431,
        ownedTabs,
        expiresAt: now + fresh.FSB_HOLD_LEASE_MS,
      });
      assert.deepStrictEqual(result, { ok: false, code: 'hold_lease_persistence_failed' });
      assert.deepStrictEqual(registry.getDelegationOwnedTabs({ delegationId, agentId }), ownedTabs);
      for (const tab of ownedTabs) {
        assert.strictEqual(registry.isOwnedBy(tab.tabId, agentId, tab.ownershipToken), true,
          'storage failure retains exact tab/token ownership');
      }
      const envelope = mock.session._dump().fsbAgentRegistry;
      assert.strictEqual(envelope.holdLeases, undefined, 'best-effort rollback leaves no durable partial lease');
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: durable-write rejection has no active or persisted partial transition');

  console.log('--- Phase 61 / Task 3: exact complete lease restore is atomic ---');
  {
    let now = 130_000;
    setupChromeMock({
      tabs: [
        { id: 501, incognito: false, windowId: 5 },
        { id: 502, incognito: false, windowId: 5 }
      ]
    });
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry({ now: () => now });
      const agentId = (await registry.registerAgent()).agentId;
      const delegationId = 'Delegation_restore_complete_6104';
      await registry.bindTab(agentId, 501);
      await registry.bindTab(agentId, 502);
      await registry.bindDelegation({ delegationId, agentId });
      const ownedTabs = registry.getDelegationOwnedTabs({ delegationId, agentId });
      await registry.sealHoldLease({
        delegationId,
        agentId,
        activeTabId: 501,
        ownedTabs,
        expiresAt: now + fresh.FSB_HOLD_LEASE_MS,
      });

      const [restored, raced] = await Promise.all([
        registry.restoreHoldLease({ delegationId, agentId, liveTabIds: [502, 501] }),
        registry.restoreHoldLease({ delegationId, agentId, liveTabIds: [501, 502] }),
      ]);
      assert.deepStrictEqual(restored, { ok: true, code: 'hold_lease_restored' });
      assert.deepStrictEqual(raced, { ok: false, code: 'resume_ownership_lost' },
        'second restore cannot replay a consumed lease');
      assert.deepStrictEqual(registry.getAgentTabs(agentId).sort((a, b) => a - b), [501, 502]);
      for (const tab of ownedTabs) {
        assert.strictEqual(registry.isOwnedBy(tab.tabId, agentId, tab.ownershipToken), true,
          'restore preserves each exact original ownership token');
      }
      assert.strictEqual(registry.getSelectedTabId(agentId), 501,
        'controller-verified active tab is restored as selected');
      assert.strictEqual(registry.getAgentForDelegation(delegationId), agentId,
        'restore retains exact delegation correlation for later stop');
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: complete restore wins once and preserves exact tokens');

  console.log('--- Phase 61 / CR2-01: hold/reload/resume preserves dispatch security metadata ---');
  {
    const now = 140_000;
    setupChromeMock({
      tabs: [
        { id: 601, incognito: true, windowId: 10 },
        { id: 602, incognito: false, windowId: 20 },
      ]
    });
    try {
      let fresh = freshRequireRegistry();
      let registry = new fresh.AgentRegistry({ now: () => now });
      const agentId = (await registry.registerAgent()).agentId;
      const incognitoBinding = await registry.bindTab(agentId, 601, { forced: true });
      const crossWindowBinding = await registry.bindTab(agentId, 602);
      registry.stampAgentNavigation(601);
      await Promise.resolve();
      assert.ok(registry.getTabMetadata(601).lastAgentNavigationAt > 0,
        'test fixture stamps the optional navigation-suppression timestamp');
      const delegationId = 'Delegation_security_metadata_6104';
      await registry.bindDelegation({ delegationId, agentId });

      const securitySnapshot = new Map([601, 602].map((tabId) => {
        const meta = registry.getTabMetadata(tabId);
        return [tabId, {
          ownershipToken: meta.ownershipToken,
          incognito: meta.incognito,
          windowId: meta.windowId,
          boundAt: meta.boundAt,
          forced: meta.forced,
          lastAgentNavigationAt: meta.lastAgentNavigationAt,
        }];
      }));
      assert.strictEqual(securitySnapshot.get(601).incognito, true, 'incognito bit starts restrictive');
      assert.strictEqual(securitySnapshot.get(601).forced, true, 'forced audit bit starts true');
      assert.strictEqual(securitySnapshot.get(602).windowId, 20, 'mixed-window tab retains its own window');
      assert.strictEqual(registry.getAgentWindowId(agentId), 10, 'agent remains pinned to first window');

      globalThis.fsbAgentRegistryInstance = registry;
      const beforeIncognito = await dispatchMcpToolRoute({
        tool: 'navigate',
        params: {
          url: 'https://example.com', tabId: 601, agentId,
          ownershipToken: incognitoBinding.ownershipToken,
        },
      });
      const beforeCrossWindow = await dispatchMcpToolRoute({
        tool: 'navigate',
        params: {
          url: 'https://example.com', tabId: 602, agentId,
          ownershipToken: crossWindowBinding.ownershipToken,
        },
      });
      assert.strictEqual(beforeIncognito.code, 'TAB_INCOGNITO_NOT_SUPPORTED');
      assert.strictEqual(beforeCrossWindow.code, 'TAB_OUT_OF_SCOPE');

      const ownedTabs = registry.getDelegationOwnedTabs({ delegationId, agentId });
      assert.deepStrictEqual(await registry.sealHoldLease({
        delegationId,
        agentId,
        activeTabId: 601,
        ownedTabs,
        expiresAt: now + fresh.FSB_HOLD_LEASE_MS,
      }), {
        ok: true,
        code: 'hold_lease_sealed',
        expiresAt: now + fresh.FSB_HOLD_LEASE_MS,
      });

      fresh = freshRequireRegistry();
      registry = new fresh.AgentRegistry({ now: () => now });
      await registry.hydrate();
      assert.strictEqual(registry.getTabMetadata(601), null, 'held metadata is not exposed as active authority');
      assert.strictEqual(registry.getTabMetadata(602), null, 'all held metadata remains sealed after reload');
      assert.strictEqual((await registry.getDelegationHoldLease({ delegationId, agentId })).ok, true,
        'v2 sealed lease survives a worker reload as restorable');
      assert.deepStrictEqual(await registry.restoreHoldLease({
        delegationId,
        agentId,
        liveTabIds: [602, 601],
      }), { ok: true, code: 'hold_lease_restored' });

      for (const tabId of [601, 602]) {
        const restored = registry.getTabMetadata(tabId);
        const original = securitySnapshot.get(tabId);
        assert.deepStrictEqual({
          ownershipToken: restored.ownershipToken,
          incognito: restored.incognito,
          windowId: restored.windowId,
          boundAt: restored.boundAt,
          forced: restored.forced,
          lastAgentNavigationAt: restored.lastAgentNavigationAt,
        }, original, 'resume restores the exact security metadata for tab ' + tabId);
      }

      fresh = freshRequireRegistry();
      registry = new fresh.AgentRegistry({ now: () => now });
      await registry.hydrate();
      globalThis.fsbAgentRegistryInstance = registry;
      const afterIncognito = await dispatchMcpToolRoute({
        tool: 'navigate',
        params: {
          url: 'https://example.com', tabId: 601, agentId,
          ownershipToken: incognitoBinding.ownershipToken,
        },
      });
      const afterCrossWindow = await dispatchMcpToolRoute({
        tool: 'navigate',
        params: {
          url: 'https://example.com', tabId: 602, agentId,
          ownershipToken: crossWindowBinding.ownershipToken,
        },
      });
      assert.strictEqual(afterIncognito.code, 'TAB_INCOGNITO_NOT_SUPPORTED',
        'incognito dispatch remains rejected after hold/resume/reload');
      assert.strictEqual(afterCrossWindow.code, 'TAB_OUT_OF_SCOPE',
        'cross-window dispatch remains rejected after hold/resume/reload');
      assert.strictEqual(afterCrossWindow.reason, 'cross_window');
      assert.strictEqual(
        registry.getTabMetadata(601).lastAgentNavigationAt,
        securitySnapshot.get(601).lastAgentNavigationAt,
        'navigation-suppression timestamp survives hold, restore, and a second worker reload',
      );
    } finally {
      delete globalThis.fsbAgentRegistryInstance;
      teardownChromeMock();
    }
  }
  console.log('  PASS: incognito/window/bound/forced/token metadata stays exact across hold/reload/resume');

  console.log('--- Phase 61 / CR2-01: legacy token-only holds remain cancellation-only ---');
  {
    const now = 160_000;
    const agentId = 'agent_legacy_hold_security';
    const delegationId = 'Delegation_legacy_hold_6104';
    setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {
            [agentId]: { agentId, createdAt: 1, tabIds: [], windowId: 30 },
          },
          delegations: { [delegationId]: agentId },
          holdLeases: {
            [delegationId]: {
              v: 1,
              delegationId,
              agentId,
              activeTabId: 603,
              ownedTabs: [{ tabId: 603, ownershipToken: 'legacy-token' }],
              issuedAt: now,
              expiresAt: now + 300000,
            },
          },
        },
      },
      tabs: [{ id: 603, incognito: true, windowId: 30 }],
    });
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry({ now: () => now });
      await registry.hydrate();
      assert.deepStrictEqual(
        registry.getDelegationHoldLease({ delegationId, agentId }),
        { ok: false, code: 'resume_ownership_lost', disposition: 'cancel_required' },
        'unsafe v1 lease cannot be restored with synthesized metadata',
      );
      const otherAgentId = (await registry.registerAgent()).agentId;
      assert.strictEqual(await registry.bindTab(otherAgentId, 603), false,
        'legacy held tab remains reserved until exact cancellation cleanup');
      assert.deepStrictEqual(await registry.releaseDelegation({ delegationId, agentId }), {
        ok: true,
        code: 'delegation_released',
        releasedTabCount: 1,
      }, 'exact release remains available for the fail-closed legacy lease');
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: unsafe legacy holds cannot resume or become claimable before exact cleanup');

  console.log('--- Phase 61 / CR3: malformed v2 holds remain cancellation-only and reserved ---');
  {
    const now = 165_000;
    const agentId = 'agent_malformed_v2_hold_security';
    const delegationId = 'Delegation_malformed_v2_hold_6104';
    const ownershipToken = 'malformed-v2-held-token';
    const mock = setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {
            [agentId]: { agentId, createdAt: 1, tabIds: [], windowId: 31 },
          },
          delegations: { [delegationId]: agentId },
          holdLeases: {
            [delegationId]: {
              v: 2,
              delegationId,
              agentId,
              activeTabId: 604,
              ownedTabs: [{ tabId: 604, ownershipToken }],
              tabSecurity: [{
                tabId: 604,
                ownershipToken,
                incognito: false,
                windowId: 31,
                boundAt: 100,
                forced: false,
                // Deliberately missing lastAgentNavigationAt.
              }],
              issuedAt: now,
              expiresAt: now + 300000,
            },
          },
        },
      },
      tabs: [{ id: 604, incognito: false, windowId: 31 }],
    });
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry({ now: () => now });
      await registry.hydrate();
      assert.deepStrictEqual(
        registry.getDelegationHoldLease({ delegationId, agentId }),
        { ok: false, code: 'resume_ownership_lost', disposition: 'cancel_required' },
        'malformed current metadata can never become resumable',
      );
      const persistedLease = mock.session._dump().fsbAgentRegistry.holdLeases[delegationId];
      assert.strictEqual(persistedLease.v, 1, 'malformed v2 lease is durably quarantined');
      assert.strictEqual(persistedLease.tabSecurity, undefined,
        'untrusted security metadata is stripped from cancellation-only proof');
      const otherAgentId = (await registry.registerAgent()).agentId;
      assert.strictEqual(await registry.bindTab(otherAgentId, 604), false,
        'identified held tab remains unclaimable after worker hydration');
      assert.deepStrictEqual(
        await registry.restoreHoldLease({ delegationId, agentId, liveTabIds: [604] }),
        { ok: false, code: 'resume_ownership_lost' },
        'quarantined hold cannot restore authority',
      );
      assert.deepStrictEqual(await registry.releaseDelegation({ delegationId, agentId }), {
        ok: true,
        code: 'delegation_released',
        releasedTabCount: 1,
      }, 'only exact delegation cleanup releases the quarantined reservation');
      assert.ok(await registry.bindTab(otherAgentId, 604),
        'tab becomes claimable only after exact cleanup');
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: malformed current holds fail closed across wake and exact cleanup');

  console.log('--- Phase 61 / CR3: orphaned hold proofs quarantine registry hydration ---');
  {
    const now = 167_000;
    const agentId = 'agent_orphaned_hold_security';
    const delegationId = 'Delegation_orphaned_hold_6104';
    const ownershipToken = 'orphaned-hold-token';
    setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {
            [agentId]: { agentId, createdAt: 1, tabIds: [], windowId: 32 },
          },
          delegations: {},
          holdLeases: {
            [delegationId]: {
              v: 2,
              delegationId,
              agentId,
              activeTabId: 605,
              ownedTabs: [{ tabId: 605, ownershipToken }],
              tabSecurity: [{
                tabId: 605,
                ownershipToken,
                incognito: false,
                windowId: 32,
                boundAt: 100,
                forced: false,
                lastAgentNavigationAt: 150,
              }],
              issuedAt: now,
              expiresAt: now + 300000,
            },
          },
        },
      },
      tabs: [{ id: 605, incognito: false, windowId: 32 }],
    });
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry({ now: () => now });
      await assert.rejects(
        registry.hydrate(),
        /mapped hold lease is corrupt/,
        'orphaned canonical hold proof rejects hydration',
      );
      await assert.rejects(
        registry.registerAgent(),
        /hydration failed/,
        'failed hydration quarantines later authority mutations',
      );
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: orphaned hold proofs cannot be discarded or overwritten after wake');

  console.log('--- Phase 61 / Task 3: restore loss/expiry/persistence failures remain fully sealed ---');
  {
    let now = 150_000;
    const mock = setupChromeMock({
      tabs: [
        { id: 511, incognito: false, windowId: 5 },
        { id: 512, incognito: false, windowId: 5 }
      ]
    });
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry({ now: () => now });
      const agentA = (await registry.registerAgent()).agentId;
      const agentB = (await registry.registerAgent()).agentId;
      const delegationId = 'Delegation_restore_failure_6104';
      await registry.bindTab(agentA, 511);
      await registry.bindTab(agentA, 512);
      await registry.bindDelegation({ delegationId, agentId: agentA });
      const ownedTabs = registry.getDelegationOwnedTabs({ delegationId, agentId: agentA });
      const expiresAt = now + fresh.FSB_HOLD_LEASE_MS;
      await registry.sealHoldLease({
        delegationId,
        agentId: agentA,
        activeTabId: 511,
        ownedTabs,
        expiresAt,
      });
      const assertStillSealed = async (label) => {
        assert.deepStrictEqual(registry.getAgentTabs(agentA), [], label + ': no partial active restore');
        assert.strictEqual(await registry.bindTab(agentB, 511), false, label + ': first tab reserved');
        assert.strictEqual(await registry.bindTab(agentB, 512), false, label + ': second tab reserved');
      };

      for (const liveTabIds of [[511], [511, 512, 999], [511, 511]]) {
        assert.deepStrictEqual(
          await registry.restoreHoldLease({ delegationId, agentId: agentA, liveTabIds }),
          { ok: false, code: 'resume_ownership_lost' },
        );
        await assertStillSealed('invalid live tab identity set');
      }
      assert.deepStrictEqual(
        await registry.restoreHoldLease({ delegationId, agentId: agentB, liveTabIds: [511, 512] }),
        { ok: false, code: 'resume_ownership_lost' },
      );
      await assertStillSealed('wrong agent identity');

      registry._heldTabTokens.set(511, 'stale-token');
      assert.deepStrictEqual(
        await registry.restoreHoldLease({ delegationId, agentId: agentA, liveTabIds: [511, 512] }),
        { ok: false, code: 'resume_ownership_lost' },
      );
      await assertStillSealed('stale token reservation');
      registry._heldTabTokens.set(511, ownedTabs.find((tab) => tab.tabId === 511).ownershipToken);

      mock.session._rejectNextSet(new Error('restore write rejected'));
      assert.deepStrictEqual(
        await registry.restoreHoldLease({ delegationId, agentId: agentA, liveTabIds: [511, 512] }),
        { ok: false, code: 'resume_ownership_lost' },
      );
      await assertStillSealed('restore persistence rejection');

      now = expiresAt;
      assert.deepStrictEqual(
        await registry.restoreHoldLease({ delegationId, agentId: agentA, liveTabIds: [511, 512] }),
        { ok: false, code: 'hold_expired', disposition: 'cancel_required' },
        'the exact expiry boundary requires controller cancellation',
      );
      await assertStillSealed('expired lease');
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: missing/extra/duplicate/stale/storage/expiry failures never partially restore');

  console.log('--- Phase 61 / Task 3: exact release isolates agents and counts active+held union ---');
  {
    const now = 170_000;
    const mock = setupChromeMock({
      tabs: [
        { id: 521, incognito: false, windowId: 5 },
        { id: 522, incognito: false, windowId: 5 },
        { id: 523, incognito: false, windowId: 5 },
        { id: 524, incognito: false, windowId: 6 }
      ]
    });
    const diagnostics = setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry({ now: () => now });
      const agentA = (await registry.registerAgent()).agentId;
      const agentB = (await registry.registerAgent()).agentId;
      const delegationA = 'Delegation_release_A_6104';
      const delegationB = 'Delegation_release_B_6104';
      await registry.bindTab(agentA, 521);
      await registry.bindTab(agentA, 522);
      await registry.bindTab(agentB, 524);
      await registry.bindDelegation({ delegationId: delegationA, agentId: agentA });
      await registry.bindDelegation({ delegationId: delegationB, agentId: agentB });
      const heldTabs = registry.getDelegationOwnedTabs({ delegationId: delegationA, agentId: agentA });
      await registry.sealHoldLease({
        delegationId: delegationA,
        agentId: agentA,
        activeTabId: 521,
        ownedTabs: heldTabs,
        expiresAt: now + fresh.FSB_HOLD_LEASE_MS,
      });
      const mixedActive = await registry.bindTab(agentA, 523);
      assert.ok(mixedActive, 'mixed held+new-active state established for distinct-union cleanup');

      const mismatch = await registry.releaseDelegation({ delegationId: delegationA, agentId: agentB });
      assert.deepStrictEqual(mismatch, {
        ok: false,
        code: 'delegation_mapping_mismatch',
        releasedTabCount: 0,
      });
      assert.strictEqual(registry.isOwnedBy(523, agentA, mixedActive.ownershipToken), true,
        'mismatched cleanup leaves mapped active tab untouched');
      assert.strictEqual(registry.isOwnedBy(524, agentB), true,
        'mismatched cleanup leaves unrelated agent untouched');
      assert.strictEqual(await registry.bindTab(agentB, 521), false,
        'mismatched cleanup leaves held reservation untouched');
      assert.ok(diagnostics.some((entry) => entry.category === 'delegation-release-mismatch'),
        'mismatch emits typed diagnostic');

      const originalReverse = registry._delegationByAgent.get(agentA);
      registry._delegationByAgent.set(agentA, delegationB);
      const inconsistent = await registry.releaseDelegation({ delegationId: delegationA, agentId: agentA });
      assert.strictEqual(inconsistent.releasedTabCount, 0, 'inconsistent reverse map releases zero');
      assert.strictEqual(registry.isOwnedBy(523, agentA, mixedActive.ownershipToken), true);
      registry._delegationByAgent.set(agentA, originalReverse);

      registry._tabOwners.set(599, agentA);
      const orphanedOwnerIndex = await registry.releaseDelegation({
        delegationId: delegationA,
        agentId: agentA,
      });
      assert.strictEqual(orphanedOwnerIndex.releasedTabCount, 0,
        'owner index not represented in the complete reverse set releases zero');
      registry._tabOwners.delete(599);

      registry._heldTabDelegations.set(598, delegationA);
      registry._heldTabTokens.set(598, 'orphaned-held-token');
      const orphanedHeldIndex = await registry.releaseDelegation({
        delegationId: delegationA,
        agentId: agentA,
      });
      assert.strictEqual(orphanedHeldIndex.releasedTabCount, 0,
        'held reservation not represented in the sealed lease releases zero');
      registry._heldTabDelegations.delete(598);
      registry._heldTabTokens.delete(598);

      const released = await registry.releaseDelegation({ delegationId: delegationA, agentId: agentA });
      assert.deepStrictEqual(released, {
        ok: true,
        code: 'delegation_released',
        releasedTabCount: 3,
      }, 'two held plus one active tab count as exact distinct union');
      assert.strictEqual(registry.getAgentForDelegation(delegationA), null);
      assert.strictEqual(registry.hasAgent(agentA), false);
      assert.strictEqual(registry.getAgentForDelegation(delegationB), agentB);
      assert.strictEqual(registry.isOwnedBy(524, agentB), true, 'other delegation ownership survives exact cleanup');
      const receiptPayload = mock.session._dump()[fresh.FSB_AGENT_REGISTRY_STORAGE_KEY];
      assert.deepStrictEqual(receiptPayload.delegationReleaseReceipts[delegationA], {
        v: 1,
        delegationId: delegationA,
        agentId: agentA,
        releasedTabCount: 3,
        releasedAt: now,
        acknowledged: false,
      }, 'exact release proof is persisted before terminal acknowledgement');
      assert.deepStrictEqual(
        await registry.releaseDelegation({ delegationId: delegationA, agentId: agentA }),
        { ok: true, code: 'delegation_already_released', releasedTabCount: 3 },
        'repeated cleanup returns the original truthful count',
      );
      assert.deepStrictEqual(
        await registry.releaseDelegation({ delegationId: delegationA, agentId: agentB }),
        { ok: false, code: 'delegation_mapping_mismatch', releasedTabCount: 0 },
        'receipt replay fails closed for a different agent',
      );

      const reloadedModule = freshRequireRegistry();
      const reloadedRegistry = new reloadedModule.AgentRegistry({ now: () => now + 1 });
      await reloadedRegistry.hydrate();
      assert.deepStrictEqual(
        await reloadedRegistry.releaseDelegation({ delegationId: delegationA, agentId: agentA }),
        { ok: true, code: 'delegation_already_released', releasedTabCount: 3 },
        'fresh worker returns the durable exact release count',
      );
      assert.ok(await registry.bindTab(agentB, 521), 'released held tab becomes claimable only after exact cleanup');

      const agentC = (await registry.registerAgent()).agentId;
      const delegationC = 'Delegation_release_zero_6104';
      await registry.bindDelegation({ delegationId: delegationC, agentId: agentC });
      assert.deepStrictEqual(
        await registry.releaseDelegation({ delegationId: delegationC, agentId: agentC }),
        { ok: true, code: 'delegation_released', releasedTabCount: 0 },
        'a valid mapped agent with no tabs cleans up exactly with count zero',
      );
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: exact cleanup counts once, repeats safely, and never touches another delegation');

  console.log('--- Phase 61 / CR2-02: release receipts stay bounded without dropping outstanding proof ---');
  {
    const mock = setupChromeMock({
      tabs: [{ id: 625, incognito: false, windowId: 6 }],
    });
    try {
      let fresh = freshRequireRegistry();
      let registry = new fresh.AgentRegistry({ now: () => 200_000 });
      const registered = await registry.registerAgent();
      const binding = await registry.bindTab(registered.agentId, 625);
      const delegationId = 'Delegation_receipt_capacity_active';
      await registry.bindDelegation({ delegationId, agentId: registered.agentId });

      const key = fresh.FSB_AGENT_REGISTRY_STORAGE_KEY;
      const payload = JSON.parse(JSON.stringify(mock.session._dump()[key]));
      payload.delegationReleaseReceipts = {};
      for (let index = 0; index < 128; index += 1) {
        const receiptId = `Delegation_receipt_capacity_${String(index).padStart(3, '0')}`;
        payload.delegationReleaseReceipts[receiptId] = {
          v: 1,
          delegationId: receiptId,
          agentId: `agent_receipt_capacity_${String(index).padStart(3, '0')}`,
          releasedTabCount: index % 4,
          releasedAt: index,
          acknowledged: false,
        };
      }
      await mock.session.set({ [key]: payload });

      fresh = freshRequireRegistry();
      registry = new fresh.AgentRegistry({ now: () => 200_001 });
      await registry.hydrate();
      assert.deepStrictEqual(
        await registry.releaseDelegation({
          delegationId,
          agentId: registered.agentId,
        }),
        {
          ok: false,
          code: 'delegation_release_persistence_failed',
          releasedTabCount: 0,
        },
        'full outstanding receipt capacity refuses a new physical release',
      );
      assert.strictEqual(registry.getAgentForDelegation(delegationId), registered.agentId);
      assert.strictEqual(registry.isOwnedBy(625, registered.agentId, binding.ownershipToken), true);
      assert.strictEqual(
        Object.keys(mock.session._dump()[key].delegationReleaseReceipts).length,
        128,
      );
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: full unacknowledged capacity fails before release and preserves authority');

  console.log('--- Phase 61 / CR2-02: corrupt terminal evidence cannot acknowledge a receipt ---');
  {
    const delegationId = 'Delegation_receipt_corrupt_ledger';
    const agentId = 'agent_receipt_corrupt_ledger';
    const registryEnvelope = {
      v: 1,
      records: {},
      delegationReleaseReceipts: {
        [delegationId]: {
          v: 1,
          delegationId,
          agentId,
          releasedTabCount: 2,
          releasedAt: 123,
          acknowledged: true,
        },
      },
    };
    const ledgerKey = `fsbDelegationLedger:v1:${delegationId}`;
    const mock = setupChromeMock({
      session: {
        fsbAgentRegistry: registryEnvelope,
        [ledgerKey]: {
          v: 1,
          delegationId,
          terminal: true,
          terminalCode: 'stopped',
          cleanupPending: null,
          entries: [{}],
        },
      },
    });
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      await registry.hydrate();
      assert.strictEqual(
        mock.session._dump()[fresh.FSB_AGENT_REGISTRY_STORAGE_KEY]
          .delegationReleaseReceipts[delegationId].acknowledged,
        false,
        'hydrate downgrades forged acknowledgement without canonical terminal evidence',
      );
      assert.strictEqual(
        await registry.acknowledgeDelegationRelease({ delegationId, agentId }),
        false,
        'acknowledgement re-reads and refuses corrupt terminal evidence',
      );
      await mock.session.set({
        [ledgerKey]: {
          v: 1,
          delegationId,
          terminal: true,
          terminalCode: 'provider_private_code',
          cleanupPending: null,
          entries: [],
        },
      });
      assert.strictEqual(
        await registry.acknowledgeDelegationRelease({ delegationId, agentId }),
        false,
        'a noncanonical terminal code cannot acknowledge a receipt',
      );
      await mock.session.set({
        [ledgerKey]: {
          v: 1,
          delegationId,
          terminal: false,
          terminalCode: null,
          cleanupPending: {
            code: 'completed',
            cancellationConfirmed: true,
            agentId,
          },
          entries: [],
        },
      });
      assert.strictEqual(
        await registry.acknowledgeDelegationRelease({ delegationId, agentId }),
        false,
        'nonterminal cleanup evidence cannot acknowledge a receipt',
      );
      await mock.session.set({
        [ledgerKey]: {
          v: 1,
          delegationId,
          terminal: true,
          terminalCode: 'stopped',
          cleanupPending: null,
          entries: [],
        },
      });
      assert.strictEqual(
        await registry.acknowledgeDelegationRelease({ delegationId, agentId }),
        true,
        'only a fully canonical current-schema terminal ledger acknowledges proof',
      );
      assert.strictEqual(
        mock.session._dump()[fresh.FSB_AGENT_REGISTRY_STORAGE_KEY]
          .delegationReleaseReceipts[delegationId].acknowledged,
        true,
        'canonical acknowledgement is itself durable',
      );
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: only canonical durable terminal evidence can acknowledge release proof');

  console.log('--- Phase 61 / CR3: malformed release proof quarantines every later mutation ---');
  {
    const delegationId = 'Delegation_receipt_malformed_6104';
    const baseReceipt = {
      v: 1,
      delegationId,
      agentId: 'agent_receipt_malformed_6104',
      releasedTabCount: 1,
      releasedAt: 123,
      acknowledged: false,
    };
    const cases = [
      ['missing releasedAt', (() => {
        const value = { ...baseReceipt };
        delete value.releasedAt;
        return value;
      })()],
      ['oversized agentId', { ...baseReceipt, agentId: 'agent_' + 'x'.repeat(5000) }],
      ['impossible releasedTabCount', {
        ...baseReceipt,
        releasedTabCount: Number.MAX_SAFE_INTEGER,
      }],
    ];
    for (const [label, receipt] of cases) {
      const originalEnvelope = {
        v: 1,
        records: {},
        delegationReleaseReceipts: { [delegationId]: receipt },
      };
      const mock = setupChromeMock({
        session: { fsbAgentRegistry: originalEnvelope },
      });
      try {
        const fresh = freshRequireRegistry();
        const registry = new fresh.AgentRegistry();
        await assert.rejects(registry.hydrate(), /release receipt is corrupt/, label);
        assert.deepStrictEqual(registry.listAgents(), [],
          label + ': failed hydration quarantines partially rebuilt authority');
        await assert.rejects(
          registry.registerAgent(),
          /mutations are quarantined/,
          label + ': later mutation is blocked before it can overwrite proof',
        );
        assert.deepStrictEqual(
          mock.session._dump()[fresh.FSB_AGENT_REGISTRY_STORAGE_KEY],
          originalEnvelope,
          label + ': original receipt envelope remains byte-for-byte structural proof',
        );
      } finally {
        teardownChromeMock();
      }
    }
  }
  console.log('  PASS: malformed receipt fields never disappear through hydrate or later writes');

  console.log('--- Phase 61 / CR2-02: over-cap persisted outstanding receipts fail hydrate closed ---');
  {
    const receipts = {};
    for (let index = 0; index < 129; index += 1) {
      const delegationId = `Delegation_receipt_overcap_${String(index).padStart(3, '0')}`;
      receipts[delegationId] = {
        v: 1,
        delegationId,
        agentId: `agent_receipt_overcap_${String(index).padStart(3, '0')}`,
        releasedTabCount: 1,
        releasedAt: index,
        acknowledged: false,
      };
    }
    const mock = setupChromeMock({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {},
          delegationReleaseReceipts: receipts,
        },
      },
    });
    try {
      const fresh = freshRequireRegistry();
      const registry = new fresh.AgentRegistry();
      await assert.rejects(
        registry.hydrate(),
        /release receipt capacity exceeded/,
      );
      assert.strictEqual(
        Object.keys(mock.session._dump()[fresh.FSB_AGENT_REGISTRY_STORAGE_KEY]
          .delegationReleaseReceipts).length,
        129,
        'fail-closed hydrate never truncates an outstanding proof',
      );
      await assert.rejects(
        registry.registerAgent(),
        /mutations are quarantined/,
        'post-failure registration cannot overwrite the original over-cap proof envelope',
      );
      assert.strictEqual(
        Object.keys(mock.session._dump()[fresh.FSB_AGENT_REGISTRY_STORAGE_KEY]
          .delegationReleaseReceipts).length,
        129,
        'quarantined registry preserves all outstanding proof after a later mutation attempt',
      );
    } finally {
      teardownChromeMock();
    }
  }
  console.log('  PASS: malformed over-cap state is rejected without dropping unacknowledged proof');

  console.log('\nAll assertions passed.');
})().catch((err) => {
  console.error('TEST FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
