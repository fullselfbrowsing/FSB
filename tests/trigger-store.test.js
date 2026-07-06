'use strict';

/**
 * Phase 14 plan 01 -- chrome.storage.session trigger-store helper validation.
 *
 * Validates extension/utils/trigger-store.js mirrors the mcp-task-store.js
 * envelope shape and exposes the 5-function public API documented in
 * 14-CONTEXT.md D-01 (single versioned envelope key `fsbTriggerRegistry`,
 * shape { v:1, records:{[trigger_id]: snapshot} }).
 *
 * This is a 10-case clone of tests/mcp-task-store.test.js: the store-side proof
 * of SURV-01 -- there is no SW heap in a Node test, so a write-then-discard-refs
 * read deterministically simulates SW eviction; readSnapshot always re-reads from
 * the (mock) chrome.storage.session.
 *
 * Wave 0 (RED): all 10 cases fail because the module does not yet exist.
 * Wave 1 (GREEN): all 10 cases pass once the store lands.
 *
 * Run: node tests/trigger-store.test.js
 */

const assert = require('assert');
const path = require('path');
const harness = require('./fixtures/run-task-harness');

const STORE_MODULE_PATH = path.join(__dirname, '..', 'extension', 'utils', 'trigger-store.js');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { passed++; console.log('  PASS:', name); })
    .catch((err) => {
      failed++;
      console.error('  FAIL:', name, '--', err && err.message ? err.message : err);
    });
}

function freshRequireStore() {
  // Drop module cache so the lazy globalThis.chrome reference resolves against
  // the most recently installed mock, not a captured one.
  try { delete require.cache[require.resolve(STORE_MODULE_PATH)]; } catch (_e) { /* not yet exists */ }
  return require(STORE_MODULE_PATH);
}

function makeSnapshot(overrides) {
  // Flat-scalar trigger snapshot per D-01 (snake_case, mirrors mcp-task-store.js
  // convention). condition/selector/baseline/last_value are reserved -- the store
  // persists them verbatim but interprets none of them (Phase 15+).
  return Object.assign({
    trigger_id: 'trigger_abc',
    status: 'armed',
    watch: 'live-observe',
    condition: null,
    selector: null,
    target_tab_id: 42,
    agent_id: 'agent_001',
    baseline: null,
    last_value: null,
    last_evaluated_at: null,
    armed_at: 1000,
    fired_at: null,
    deadline_at: 1000 + 21600000,
    alarm_name: 'fsbTrigger:trigger_abc'
  }, overrides || {});
}

(async () => {
  console.log('--- Phase 14 plan 01: trigger-store ---');

  await runTest('module_exports', async () => {
    const mock = harness.installChromeMock();
    try {
      const mod = freshRequireStore();
      assert.strictEqual(typeof mod.writeSnapshot, 'function', 'writeSnapshot is a function');
      assert.strictEqual(typeof mod.readSnapshot, 'function', 'readSnapshot is a function');
      assert.strictEqual(typeof mod.deleteSnapshot, 'function', 'deleteSnapshot is a function');
      assert.strictEqual(typeof mod.listArmedSnapshots, 'function', 'listArmedSnapshots is a function');
      assert.strictEqual(typeof mod.hydrate, 'function', 'hydrate is a function');
      assert.strictEqual(mod.FSB_TRIGGER_REGISTRY_STORAGE_KEY, 'fsbTriggerRegistry', 'storage key is fsbTriggerRegistry');
      assert.strictEqual(mod.FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION, 1, 'payload version is 1');
    } finally {
      mock.restore();
    }
  });

  await runTest('write_envelope_v1', async () => {
    const mock = harness.installChromeMock();
    try {
      const mod = freshRequireStore();
      const snap = makeSnapshot();
      await mod.writeSnapshot('trigger_abc', snap);
      const stored = await mock.chrome.storage.session.get(['fsbTriggerRegistry']);
      assert.deepStrictEqual(stored, {
        fsbTriggerRegistry: { v: 1, records: { trigger_abc: snap } }
      }, 'envelope is { v: 1, records: { trigger_abc: snapshot } }');
    } finally {
      mock.restore();
    }
  });

  await runTest('read_unknown_returns_null', async () => {
    const mock = harness.installChromeMock();
    try {
      const mod = freshRequireStore();
      const result = await mod.readSnapshot('nonexistent');
      assert.strictEqual(result, null, 'readSnapshot returns null for unknown trigger');
    } finally {
      mock.restore();
    }
  });

  await runTest('read_round_trip', async () => {
    const mock = harness.installChromeMock();
    try {
      const mod = freshRequireStore();
      const snap = makeSnapshot({ trigger_id: 'trigger_rt', last_value: '42.50' });
      await mod.writeSnapshot('trigger_rt', snap);
      const got = await mod.readSnapshot('trigger_rt');
      assert.deepStrictEqual(got, snap, 'readSnapshot round-trips written value');
    } finally {
      mock.restore();
    }
  });

  await runTest('list_armed', async () => {
    const mock = harness.installChromeMock();
    try {
      const mod = freshRequireStore();
      await mod.writeSnapshot('a', makeSnapshot({ trigger_id: 'a', status: 'armed' }));
      await mod.writeSnapshot('b', makeSnapshot({ trigger_id: 'b', status: 'fired' }));
      await mod.writeSnapshot('c', makeSnapshot({ trigger_id: 'c', status: 'stopped' }));
      const armed = await mod.listArmedSnapshots();
      assert.strictEqual(armed.length, 1, 'exactly one armed snapshot');
      assert.strictEqual(armed[0].trigger_id, 'a', 'armed snapshot is trigger a');
    } finally {
      mock.restore();
    }
  });

  await runTest('delete_snapshot_removes_key_when_empty', async () => {
    const mock = harness.installChromeMock();
    try {
      const mod = freshRequireStore();
      await mod.writeSnapshot('trigger_del', makeSnapshot({ trigger_id: 'trigger_del' }));
      await mod.deleteSnapshot('trigger_del');
      const stored = await mock.chrome.storage.session.get(['fsbTriggerRegistry']);
      assert.deepStrictEqual(stored, {}, 'storage key removed when records map is empty');
    } finally {
      mock.restore();
    }
  });

  await runTest('delete_snapshot_keeps_key_when_others_exist', async () => {
    const mock = harness.installChromeMock();
    try {
      const mod = freshRequireStore();
      await mod.writeSnapshot('keep', makeSnapshot({ trigger_id: 'keep' }));
      await mod.writeSnapshot('drop', makeSnapshot({ trigger_id: 'drop' }));
      await mod.deleteSnapshot('drop');
      const stored = await mock.chrome.storage.session.get(['fsbTriggerRegistry']);
      assert.ok(stored.fsbTriggerRegistry, 'envelope still present');
      assert.deepStrictEqual(Object.keys(stored.fsbTriggerRegistry.records), ['keep'], 'only keep remains');
    } finally {
      mock.restore();
    }
  });

  await runTest('hydrate_returns_records', async () => {
    const mock = harness.installChromeMock();
    try {
      const mod = freshRequireStore();
      await mod.writeSnapshot('one', makeSnapshot({ trigger_id: 'one' }));
      await mod.writeSnapshot('two', makeSnapshot({ trigger_id: 'two' }));
      const env = await mod.hydrate();
      assert.strictEqual(env.v, 1, 'envelope version is 1');
      assert.deepStrictEqual(Object.keys(env.records).sort(), ['one', 'two'], 'records keys are one + two');
    } finally {
      mock.restore();
    }
  });

  await runTest('version_mismatch_returns_empty', async () => {
    const mock = harness.installChromeMock({
      storage: { session: { fsbTriggerRegistry: { v: 99, records: { bad: {} } } } }
    });
    try {
      const mod = freshRequireStore();
      const env = await mod.hydrate();
      assert.deepStrictEqual(env, { v: 1, records: {} }, 'wrong version returns canonical empty envelope');
    } finally {
      mock.restore();
    }
  });

  await runTest('chrome_unavailable_no_throw', async () => {
    // Ensure chrome is NOT installed
    const prior = globalThis.chrome;
    delete globalThis.chrome;
    try {
      const mod = freshRequireStore();
      // Best-effort posture: must not throw
      await mod.writeSnapshot('x', { trigger_id: 'x', status: 'armed' });
      const got = await mod.readSnapshot('x');
      assert.strictEqual(got, null, 'readSnapshot returns null with no chrome');
    } finally {
      if (prior !== undefined) globalThis.chrome = prior;
    }
  });

  console.log('\n--- Phase 14 plan 01 trigger-store summary ---');
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
