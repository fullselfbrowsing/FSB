'use strict';

/**
 * Phase 241 plan 01 task 1 -- cap storage round-trip + onChanged + grandfather
 * (POOL-05 / D-05 / D-06).
 *
 * Validates:
 *   - setCap writes to chrome.storage.local under fsbAgentCap.
 *   - Fresh registry then _loadCapFromStorage hydrates the value.
 *   - Lower-cap grandfathering: setCap(2) while 5 agents active does NOT
 *     evict; subsequent registerAgent rejects with AGENT_CAP_REACHED.
 *   - chrome.storage.onChanged listener cross-context propagation.
 *   - LOG-04 'agent-cap-lowered-grandfathered' fires when M > newCap.
 *
 * Run: node tests/agent-cap-storage.test.js
 */

const assert = require('assert');
const REGISTRY_MODULE_PATH = require.resolve('../extension/utils/agent-registry.js');
const RECOMMENDATION_MODULE_PATH = require.resolve('../extension/utils/agent-cap-recommendation.js');

function freshRequireRegistry() {
  delete require.cache[REGISTRY_MODULE_PATH];
  return require(REGISTRY_MODULE_PATH);
}

function loadRecommendationHelper() {
  delete require.cache[RECOMMENDATION_MODULE_PATH];
  return require(RECOMMENDATION_MODULE_PATH);
}

function createStorageArea(initial) {
  const store = Object.assign({}, initial || {});
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
      Object.assign(store, values);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => { delete store[key]; });
    },
    _dump() {
      return Object.assign({}, store);
    }
  };
}

function setupChromeMock(opts) {
  opts = opts || {};
  const session = createStorageArea(opts.session || {});
  const local = createStorageArea(opts.local || {});
  const onChangedListeners = [];
  const chromeMock = {
    runtime: { id: 'phase-241-test', lastError: null },
    storage: {
      session: session,
      local: local,
      onChanged: {
        addListener(fn) { onChangedListeners.push(fn); },
        _emit(changes, area) {
          onChangedListeners.forEach((fn) => { fn(changes, area); });
        }
      }
    },
    tabs: {
      async query() { return []; },
      async get(tabId) { throw new Error('no tab'); },
      onRemoved: { addListener() {} }
    }
  };

  if (opts.memoryInfo || opts.memoryError) {
    chromeMock.system = {
      memory: {
        getInfo(cb) {
          if (opts.memoryError) throw opts.memoryError;
          if (typeof cb === 'function') {
            cb(opts.memoryInfo);
            return undefined;
          }
          return Promise.resolve(opts.memoryInfo);
        }
      }
    };
  }

  globalThis.chrome = chromeMock;
  return { session: session, local: local, onChangedListeners: onChangedListeners };
}

function teardownChromeMock() {
  delete globalThis.chrome;
}

function setupDiagnosticCapture() {
  const captured = [];
  globalThis.rateLimitedWarn = function(prefix, category, message, ctx) {
    captured.push({ prefix: prefix, category: category, message: message, ctx: ctx });
  };
  globalThis.redactForLog = function(v) { return { kind: typeof v }; };
  return captured;
}

function teardownDiagnosticCapture() {
  delete globalThis.rateLimitedWarn;
  delete globalThis.redactForLog;
}

(async () => {
  console.log('--- Test 5: setCap writes to chrome.storage.local; new registry hydrates ---');
  {
    const mock = setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(12);

      // Allow async chrome.storage.local.set to settle
      await new Promise((res) => setTimeout(res, 10));

      const dump = mock.local._dump();
      assert.strictEqual(dump.fsbAgentCap, 12, 'setCap(12) wrote to chrome.storage.local under fsbAgentCap');

      const fresh2 = freshRequireRegistry();
      const reg2 = new fresh2.AgentRegistry();
      assert.strictEqual(reg2.getCap(), 8, 'fresh registry default before _loadCapFromStorage');
      await reg2._loadCapFromStorage();
      assert.strictEqual(reg2.getCap(), 12, 'after _loadCapFromStorage, cap is 12');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: chrome.storage.local round-trip');

  console.log('--- Test 6: lower-cap grandfathering (D-06) ---');
  {
    const mock = setupChromeMock();
    const captured = setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      reg.setCap(8);

      // Register 5 agents under cap=8.
      for (let i = 0; i < 5; i++) await reg.registerAgent();
      assert.strictEqual(reg._agents.size, 5, 'five agents registered');

      // Lower the cap to 2; M (5) > newCap (2) -> no eviction.
      reg.setCap(2);
      assert.strictEqual(reg._agents.size, 5, '_agents.size unchanged after lowering cap');
      assert.strictEqual(reg.getCap(), 2, 'getCap reflects new cap');

      // Diagnostic event for grandfathering.
      const grandfatherEvents = captured.filter(c => c.category === 'agent-cap-lowered-grandfathered');
      assert.ok(grandfatherEvents.length >= 1, 'agent-cap-lowered-grandfathered emitted');
      const evt = grandfatherEvents[0];
      assert.ok(evt.ctx, 'event has context payload');
      assert.strictEqual(evt.ctx.previousCap, 8, 'previousCap === 8');
      assert.strictEqual(evt.ctx.newCap, 2, 'newCap === 2');
      assert.strictEqual(evt.ctx.activeAtChange, 5, 'activeAtChange === 5');

      // Fresh registerAgent now rejects with cap=2, active=5.
      const r = await reg.registerAgent();
      assert.strictEqual(r.code, 'AGENT_CAP_REACHED', 'fresh claim rejected post-lower');
      assert.strictEqual(r.cap, 2, 'rejection cap === 2');
      assert.strictEqual(r.active, 5, 'rejection active === 5');
      assert.strictEqual(reg._agents.size, 5, 'rejection did not insert');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: lower-cap grandfathering preserves agents + emits LOG-04');

  console.log('--- Test 7: chrome.storage.onChanged propagates cap to in-memory cache ---');
  {
    const mock = setupChromeMock();
    setupDiagnosticCapture();
    try {
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      assert.strictEqual(reg.getCap(), 8, 'starts at default 8');

      // Simulate cross-context storage write (e.g., options page saved cap=16).
      mock.onChangedListeners; // sanity
      globalThis.chrome.storage.onChanged._emit(
        { fsbAgentCap: { newValue: 16, oldValue: 8 } },
        'local'
      );

      assert.strictEqual(reg.getCap(), 16, 'onChanged propagated newValue=16 to cache');

      // Wrong area should be ignored.
      globalThis.chrome.storage.onChanged._emit(
        { fsbAgentCap: { newValue: 32, oldValue: 16 } },
        'session'
      );
      assert.strictEqual(reg.getCap(), 16, 'onChanged in non-local area ignored');

      // Out-of-range value gets clamped on apply.
      globalThis.chrome.storage.onChanged._emit(
        { fsbAgentCap: { newValue: 999, oldValue: 16 } },
        'local'
      );
      assert.strictEqual(reg.getCap(), 64, 'onChanged value=999 clamped to MAX=64');

      // Non-numeric value reverts to default.
      globalThis.chrome.storage.onChanged._emit(
        { fsbAgentCap: { newValue: 'evil', oldValue: 64 } },
        'local'
      );
      assert.strictEqual(reg.getCap(), 64, 'onChanged with non-numeric ignored (kept previous)');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: chrome.storage.onChanged cross-context propagation');

  console.log('--- Test 8: missing stored cap seeds RAM-based recommendation ---');
  {
    const mock = setupChromeMock({ memoryInfo: { capacity: 64 * 1024 * 1024 * 1024 } });
    setupDiagnosticCapture();
    try {
      loadRecommendationHelper();
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      assert.strictEqual(reg.getCap(), 8, 'fresh registry starts at fallback before storage load');
      await reg._loadCapFromStorage();
      assert.strictEqual(reg.getCap(), 21, 'missing fsbAgentCap hydrates to 64 GiB recommendation');
      assert.strictEqual(mock.local._dump().fsbAgentCap, 21, 'recommended cap persisted to chrome.storage.local');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: missing cap seeds recommendation');

  console.log('--- Test 9: saved cap is never overwritten by RAM recommendation ---');
  {
    const mock = setupChromeMock({
      local: { fsbAgentCap: 12 },
      memoryInfo: { capacity: 64 * 1024 * 1024 * 1024 }
    });
    setupDiagnosticCapture();
    try {
      loadRecommendationHelper();
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      await reg._loadCapFromStorage();
      assert.strictEqual(reg.getCap(), 12, 'saved cap wins over recommendation');
      assert.strictEqual(mock.local._dump().fsbAgentCap, 12, 'saved cap remains unchanged');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: saved cap preserved');

  console.log('--- Test 10: registerAgent uses hydrated recommended cap ---');
  {
    const mock = setupChromeMock({ memoryInfo: { capacity: 8 * 1024 * 1024 * 1024 } });
    setupDiagnosticCapture();
    try {
      loadRecommendationHelper();
      const fresh = freshRequireRegistry();
      const reg = new fresh.AgentRegistry();
      await reg._loadCapFromStorage();
      assert.strictEqual(reg.getCap(), 2, '8 GiB recommendation hydrates to cap=2');
      const a = await reg.registerAgent();
      const b = await reg.registerAgent();
      const c = await reg.registerAgent();
      assert.ok(a.agentId, 'first agent succeeds');
      assert.ok(b.agentId, 'second agent succeeds');
      assert.strictEqual(c.code, 'AGENT_CAP_REACHED', 'third agent rejects under recommended cap');
      assert.strictEqual(c.cap, 2, 'rejection reports hydrated recommended cap');
      assert.strictEqual(mock.local._dump().fsbAgentCap, 2, 'recommended cap persisted');
    } finally {
      teardownDiagnosticCapture();
      teardownChromeMock();
    }
  }
  console.log('  PASS: hydrated recommendation gates claims');

  console.log('PASS agent-cap-storage');
})().catch(err => {
  console.error('FAIL agent-cap-storage:', err && err.stack || err);
  process.exit(1);
});
