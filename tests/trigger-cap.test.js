'use strict';

/**
 * Phase 15 plan 02 -- trigger-manager.js inline concurrency cap (LIFE-04 / D-09).
 *
 * A clone of tests/agent-cap.test.js, RENAMED Agent -> Trigger, translated from
 * the agent-registry INSTANCE pattern to the trigger-manager module-singleton
 * IIFE, with TWO trigger-specific additions:
 *
 *   1. The storage-first ACTIVE-COUNT divergence test (D-09, net-new -- there is
 *      no agent-cap analog because agent-registry counts a heap Set on purpose):
 *      seed N>=cap status:'armed' snapshots into the mock store, leave the
 *      manager's module heap empty (fresh require), call armTrigger once and
 *      assert it STILL returns TRIGGER_CAP_REACHED. This proves the active count
 *      derives from listArmedSnapshots() (storage), not an in-heap Set that would
 *      reset to 0 on SW eviction and silently stop enforcing the cap.
 *   2. The N-concurrent arm exercises the _withArmLock serialization (the
 *      listArmedSnapshots() read + cap compare + persist run inside one mutex
 *      turn), so concurrent arms cannot all slip past cap=8 (TOCTOU fix).
 *
 * Validates:
 *   - default cap is 8 immediately after fresh require (no setCap).
 *   - setCap clamping: 0 -> 1, 100 -> 64, NaN -> 8, 3.7 -> 3, 'str' -> 8, -5 -> 1.
 *   - N-concurrent armTrigger under cap=8 (0 armed seed, ~20 concurrent arms):
 *     exactly 8 succeed; the rest return { code, error, cap:8, active:8 }.
 *   - the divergence test described above.
 *
 * Run: node tests/trigger-cap.test.js
 * Framework: Node built-in assert + a local check() counter (NO Jest/Mocha).
 */

const assert = require('assert');
const harness = require('./fixtures/run-task-harness.js');

const MANAGER_PATH = require.resolve('../extension/utils/trigger-manager.js');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL: ' + msg);
  }
}

/**
 * A controllable, stateful mock FsbTriggerStore + FsbTriggerLifecycle pair.
 *
 * listArmedSnapshots() returns the live backing array, so it reflects arms that
 * succeed during the test (the cap's active-count source -- D-09). The mock
 * lifecycle's armTrigger(snapshot) pushes the snapshot into the SAME backing
 * array, mirroring how the real FsbTriggerLifecycle.armTrigger persists a
 * status:'armed' snapshot that a later listArmedSnapshots() would then count.
 *
 * Both are installed on globalThis BEFORE the manager is fresh-required so its
 * lazy _getStore()/_getLifecycle() bind these mocks.
 */
function installMockStoreAndLifecycle(seedArmed) {
  var armed = (seedArmed || []).slice();

  var priorStore = globalThis.FsbTriggerStore;
  var priorLifecycle = globalThis.FsbTriggerLifecycle;

  globalThis.FsbTriggerStore = {
    async listArmedSnapshots() {
      // Return a snapshot of the live array (the cap reads .length off this).
      return armed.slice();
    }
  };

  globalThis.FsbTriggerLifecycle = {
    FSB_TRIGGER_DEFAULT_TTL_MS: 21600000,
    async armTrigger(snapshot) {
      // Persist as a status:'armed' record the next listArmedSnapshots() counts.
      armed.push(snapshot);
      return { ok: true, armed: true };
    }
  };

  return {
    armedRef: function() { return armed; },
    restore() {
      if (priorStore === undefined) delete globalThis.FsbTriggerStore;
      else globalThis.FsbTriggerStore = priorStore;
      if (priorLifecycle === undefined) delete globalThis.FsbTriggerLifecycle;
      else globalThis.FsbTriggerLifecycle = priorLifecycle;
    }
  };
}

function freshRequireManager() {
  delete require.cache[MANAGER_PATH];
  return require(MANAGER_PATH);
}

(async () => {
  console.log('--- Test 1: default cap is 8 immediately after fresh require ---');
  {
    var mock = harness.installChromeMock({ storage: { local: {} } });
    var stores = installMockStoreAndLifecycle([]);
    try {
      var M = freshRequireManager();
      assert.strictEqual(typeof M.getCap, 'function', 'getCap must be exported');
      check(M.getCap() === 8, 'default cap is 8 after fresh require (no setCap)');
      check(M.FSB_TRIGGER_CAP_DEFAULT === 8, 'FSB_TRIGGER_CAP_DEFAULT exported as 8');
      check(M.FSB_TRIGGER_CAP_MIN === 1, 'FSB_TRIGGER_CAP_MIN exported as 1');
      check(M.FSB_TRIGGER_CAP_MAX === 64, 'FSB_TRIGGER_CAP_MAX exported as 64');
    } finally {
      stores.restore();
      mock.restore();
    }
  }
  console.log('  done');

  console.log('--- Test 2: setCap clamping (0->1, 100->64, NaN->8, 3.7->3, str->8, -5->1) ---');
  {
    var mock = harness.installChromeMock({ storage: { local: {} } });
    var stores = installMockStoreAndLifecycle([]);
    try {
      var M = freshRequireManager();
      M.setCap(0);
      check(M.getCap() === 1, 'setCap(0) clamps to 1');
      M.setCap(100);
      check(M.getCap() === 64, 'setCap(100) clamps to 64');
      M.setCap(NaN);
      check(M.getCap() === 8, 'setCap(NaN) reverts to default 8');
      M.setCap(3.7);
      check(M.getCap() === 3, 'setCap(3.7) floors to 3');
      M.setCap('not-a-number');
      check(M.getCap() === 8, 'setCap(string) reverts to default 8');
      M.setCap(-5);
      check(M.getCap() === 1, 'setCap(-5) clamps to MIN=1');
    } finally {
      stores.restore();
      mock.restore();
    }
  }
  console.log('  done');

  console.log('--- Test 3: 20-concurrent armTrigger under cap=8 (0 armed seed) ---');
  {
    var mock = harness.installChromeMock({ storage: { local: {} } });
    var stores = installMockStoreAndLifecycle([]); // start with 0 armed
    try {
      var M = freshRequireManager();
      M.setCap(8);

      var promises = [];
      for (var i = 0; i < 20; i++) {
        promises.push(M.armTrigger({
          trigger_id: 'fsbTrigger:t' + i,
          condition: { kind: 'changed' },
          baseline: '0',
          selector: '#price',
          target_tab_id: 1,
          agent_id: 'agent_x'
        }));
      }
      var results = await Promise.all(promises);

      var successes = results.filter(function(r) { return r && !r.code && (r.ok === true || r.armed === true || r.trigger_id); });
      var rejections = results.filter(function(r) { return r && r.code === 'TRIGGER_CAP_REACHED'; });

      check(successes.length === 8, 'exactly 8 concurrent arms succeed under cap=8 (got ' + successes.length + ')');
      check(rejections.length === 12, 'exactly 12 concurrent arms reject (got ' + rejections.length + ')');
      var shapeOk = rejections.every(function(r) {
        return r.code === 'TRIGGER_CAP_REACHED' && r.error === 'TRIGGER_CAP_REACHED' && r.cap === 8 && r.active === 8;
      });
      check(shapeOk, 'each rejection has { code:TRIGGER_CAP_REACHED, error:TRIGGER_CAP_REACHED, cap:8, active:8 }');
    } finally {
      stores.restore();
      mock.restore();
    }
  }
  console.log('  done');

  console.log('--- Test 4 (DIVERGENCE, D-09): seeded storage rejects with an EMPTY heap ---');
  {
    // Seed N>=cap status:'armed' snapshots into the mock store. The manager's
    // module heap is empty (fresh require). If the cap counted a heap Set it
    // would read active=0 and ALLOW the arm. Counting listArmedSnapshots()
    // (storage-of-truth) makes it correctly REJECT -- this is the whole point
    // of D-09 (the cap survives SW eviction).
    var seeded = [];
    for (var k = 0; k < 8; k++) {
      seeded.push({ trigger_id: 'fsbTrigger:seed' + k, status: 'armed' });
    }
    var mock = harness.installChromeMock({ storage: { local: {} } });
    var stores = installMockStoreAndLifecycle(seeded);
    try {
      var M = freshRequireManager(); // fresh heap, zero in-memory triggers
      M.setCap(8);
      var res = await M.armTrigger({
        trigger_id: 'fsbTrigger:newcomer',
        condition: { kind: 'changed' },
        baseline: '0',
        selector: '#price',
        target_tab_id: 1,
        agent_id: 'agent_y'
      });
      check(res && res.code === 'TRIGGER_CAP_REACHED',
        'armTrigger with 8 seeded armed snapshots + empty heap STILL rejects (count from listArmedSnapshots, not heap)');
      check(res && res.active === 8, 'divergence: active === 8 reflects the SEEDED storage count, not a heap Set');
      check(res && res.cap === 8, 'divergence: cap === 8 in the typed reject');
    } finally {
      stores.restore();
      mock.restore();
    }
  }
  console.log('  done');

  console.log('');
  console.log('trigger-cap.test: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('PASS trigger-cap');
  }
})().catch(function(err) {
  console.error('FAIL trigger-cap:', (err && err.stack) || err);
  process.exit(1);
});
