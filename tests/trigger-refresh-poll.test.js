'use strict';

/**
 * Phase 17 plan 01 -- refresh-poll cadence harness.
 *
 * Plain Node script covering the Wave 0 refresh-poll cadence contract:
 * arm-time interval normalization, sub-floor typed rejection, and persisted
 * refresh-poll snapshot fields. Later Phase 17 plans extend this file for the
 * reload/read/evaluate path.
 *
 * Run: node tests/trigger-refresh-poll.test.js
 */

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
        return Object.prototype.hasOwnProperty.call(store, keys) ? { [keys]: store[keys] } : {};
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
    _dump() { return Object.assign({}, store); }
  };
}

function createChromeMock() {
  const session = createStorageArea();
  const local = createStorageArea();
  const alarms = new Map();
  const createHistory = [];
  const cleared = [];
  return {
    storage: { session, local },
    alarms: {
      async create(name, options) {
        const record = Object.assign({ name }, options || {});
        alarms.set(name, record);
        createHistory.push(record);
      },
      async clear(name) {
        cleared.push(name);
        alarms.delete(name);
        return true;
      },
      async getAll() {
        return Array.from(alarms.values());
      },
      _created() { return Array.from(alarms.values()); },
      _createHistory() { return createHistory.slice(); },
      _cleared() { return cleared.slice(); }
    }
  };
}

const EXTRACTOR_MODULE_PATH = require.resolve('../extension/utils/value-extractor.js');
const STORE_MODULE_PATH = require.resolve('../extension/utils/trigger-store.js');
const LIFECYCLE_MODULE_PATH = require.resolve('../extension/utils/trigger-lifecycle.js');
const MANAGER_MODULE_PATH = require.resolve('../extension/utils/trigger-manager.js');

function setupRefreshPollHarness() {
  const chromeMock = createChromeMock();
  global.chrome = chromeMock;

  delete require.cache[EXTRACTOR_MODULE_PATH];
  delete require.cache[STORE_MODULE_PATH];
  delete require.cache[LIFECYCLE_MODULE_PATH];
  delete require.cache[MANAGER_MODULE_PATH];

  const extractor = require(EXTRACTOR_MODULE_PATH);
  const store = require(STORE_MODULE_PATH);
  const lifecycle = require(LIFECYCLE_MODULE_PATH);
  const manager = require(MANAGER_MODULE_PATH);

  return { chromeMock, extractor, store, lifecycle, manager };
}

function makeRefreshPollSpec(overrides) {
  return Object.assign({
    trigger_id: 'trg_refresh',
    watch: 'refresh-poll',
    condition: { kind: 'changed' },
    baseline: 'old',
    selector: '#price',
    target_tab_id: 123,
    agent_id: 'agent_refresh',
    now: 1000000
  }, overrides || {});
}

async function readSnapshot(harness, triggerId) {
  return await harness.store.readSnapshot(triggerId);
}

async function caseDefaultInterval() {
  console.log('\n--- Case A: refresh-poll defaults to 60000ms ---');
  const h = setupRefreshPollHarness();
  const spec = makeRefreshPollSpec({ trigger_id: 'trg_default' });
  const result = await h.manager.armTrigger(spec);
  const snap = await readSnapshot(h, 'trg_default');

  check(result && result.ok === true, 'A.1 armTrigger succeeds for refresh-poll default interval');
  check(snap && snap.watch === 'refresh-poll', 'A.2 snapshot persists watch:refresh-poll');
  check(snap && snap.poll_interval_ms === 60000, 'A.3 snapshot persists default poll_interval_ms 60000');
}

async function caseAcceptedExplicitInterval() {
  console.log('\n--- Case B: refresh-poll persists accepted explicit interval ---');
  const h = setupRefreshPollHarness();
  const spec = makeRefreshPollSpec({
    trigger_id: 'trg_accepted',
    poll_interval_ms: 45000
  });
  const result = await h.manager.armTrigger(spec);
  const snap = await readSnapshot(h, 'trg_accepted');

  check(result && result.ok === true, 'B.1 armTrigger succeeds with 45000ms interval');
  check(snap && snap.poll_interval_ms === 45000, 'B.2 snapshot persists poll_interval_ms 45000');
}

async function caseSubFloorAliasesReject() {
  console.log('\n--- Case C: sub-floor aliases reject before lifecycle delegation ---');
  const aliases = [
    ['poll_interval_ms', 29999],
    ['pollIntervalMs', 1000],
    ['interval_ms', 0],
    ['intervalMs', 25000]
  ];

  for (let i = 0; i < aliases.length; i++) {
    const h = setupRefreshPollHarness();
    let delegated = 0;
    const priorLifecycle = global.FsbTriggerLifecycle;
    global.FsbTriggerLifecycle = Object.assign({}, h.lifecycle, {
      async armTrigger(snapshot) {
        delegated++;
        return await h.lifecycle.armTrigger(snapshot);
      }
    });

    const key = aliases[i][0];
    const value = aliases[i][1];
    const triggerId = 'trg_low_' + key;
    const spec = makeRefreshPollSpec({ trigger_id: triggerId });
    spec[key] = value;

    const result = await h.manager.armTrigger(spec);
    const snap = await readSnapshot(h, triggerId);

    check(result && result.code === 'REFRESH_POLL_INTERVAL_TOO_LOW',
      'C.' + (i + 1) + '.1 ' + key + ' below floor returns typed code');
    check(result && result.error === 'REFRESH_POLL_INTERVAL_TOO_LOW',
      'C.' + (i + 1) + '.2 ' + key + ' below floor returns typed error');
    check(result && result.min_interval_ms === 30000,
      'C.' + (i + 1) + '.3 ' + key + ' rejection includes min_interval_ms 30000');
    check(result && result.requested_interval_ms === value,
      'C.' + (i + 1) + '.4 ' + key + ' rejection includes requested interval');
    check(result && result.guidance === 'Use live-observe for sub-30s changes.',
      'C.' + (i + 1) + '.5 ' + key + ' rejection includes live-observe guidance');
    check(delegated === 0, 'C.' + (i + 1) + '.6 ' + key + ' rejection does not delegate to lifecycle.armTrigger');
    check(snap === null, 'C.' + (i + 1) + '.7 ' + key + ' rejection does not persist a snapshot');

    global.FsbTriggerLifecycle = priorLifecycle;
  }
}

async function caseNonRefreshNoPollField() {
  console.log('\n--- Case D: non-refresh watches keep existing arm behavior ---');
  const h = setupRefreshPollHarness();
  const result = await h.manager.armTrigger({
    trigger_id: 'trg_live',
    watch: 'live-observe',
    condition: { kind: 'changed' },
    baseline: 'old',
    selector: '#price',
    target_tab_id: 123,
    agent_id: 'agent_live',
    poll_interval_ms: 45000,
    now: 1000000
  });
  const snap = await readSnapshot(h, 'trg_live');

  check(result && result.ok === true, 'D.1 non-refresh armTrigger still succeeds');
  check(snap && snap.poll_interval_ms === undefined, 'D.2 non-refresh snapshot does not gain poll_interval_ms');
}

(async () => {
  console.log('--- Phase 17 Plan 01: trigger refresh-poll cadence ---');
  await caseDefaultInterval();
  await caseAcceptedExplicitInterval();
  await caseSubFloorAliasesReject();
  await caseNonRefreshNoPollField();

  console.log('\ntrigger-refresh-poll.test: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
  console.log('PASS trigger-refresh-poll');
})().catch((err) => {
  console.error('FAIL trigger-refresh-poll:', (err && err.stack) || err);
  process.exit(1);
});
