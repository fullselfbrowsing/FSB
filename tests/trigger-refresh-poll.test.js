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

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

const ROOT = path.resolve(__dirname, '..');
const BACKGROUND_PATH = path.join(ROOT, 'extension', 'background.js');

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

function readSource(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function sourceSliceBetween(src, startNeedle, endNeedles) {
  const start = src.indexOf(startNeedle);
  if (start < 0) return '';
  let end = src.length;
  (endNeedles || []).forEach((needle) => {
    const idx = src.indexOf(needle, start + startNeedle.length);
    if (idx >= 0 && idx < end) end = idx;
  });
  return src.slice(start, end);
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

function makeRefreshPollSnapshot(overrides) {
  return Object.assign({
    trigger_id: 'trg_refresh_snapshot',
    status: 'armed',
    watch: 'refresh-poll',
    condition: { kind: 'changed' },
    baseline: 'old',
    last_value: 'old',
    selector: '#price',
    target_tab_id: 123,
    agent_id: 'agent_refresh',
    armed_at: 1000000,
    deadline_at: 9000000,
    poll_interval_ms: 60000
  }, overrides || {});
}

async function withFixedNow(now, fn) {
  const priorNow = Date.now;
  Date.now = function() { return now; };
  try {
    return await fn();
  } finally {
    Date.now = priorNow;
  }
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

async function caseArmSchedulesNextPoll() {
  console.log('\n--- Case E: lifecycle arm writes next_poll_at and alarms next poll ---');
  const now = 2000000;
  await withFixedNow(now, async () => {
    const h = setupRefreshPollHarness();
    const deadline = now + 3600000;
    const snapshot = makeRefreshPollSnapshot({
      trigger_id: 'trg_arm_next',
      poll_interval_ms: 45000,
      poll_jitter_ms: 2000,
      deadline_at: deadline
    });

    check(typeof h.lifecycle.scheduleNextRefreshPollAlarm === 'function',
      'E.1 lifecycle exports scheduleNextRefreshPollAlarm');
    const result = await h.lifecycle.armTrigger(snapshot);
    const stored = await readSnapshot(h, 'trg_arm_next');
    const alarm = h.chromeMock.alarms._created().find((a) => a.name === 'fsbTrigger:trg_arm_next');

    check(result && result.ok === true && result.armed === true, 'E.2 refresh-poll lifecycle arm succeeds');
    check(stored && stored.next_poll_at === now + 47000,
      'E.3 arm writes next_poll_at = now + interval + deterministic jitter');
    check(stored && stored.deadline_at === deadline, 'E.4 deadline_at is preserved as TTL');
    check(alarm && alarm.when === stored.next_poll_at && alarm.when !== deadline,
      'E.5 alarm is created for next_poll_at, not deadline_at');
  });
}

async function caseRestoreUsesPersistedNextPoll() {
  console.log('\n--- Case F: restore uses persisted future next_poll_at ---');
  const now = 3000000;
  await withFixedNow(now, async () => {
    const h = setupRefreshPollHarness();
    const nextPollAt = now + 65000;
    const deadline = now + 3600000;
    await h.store.writeSnapshot('trg_restore_keep', makeRefreshPollSnapshot({
      trigger_id: 'trg_restore_keep',
      next_poll_at: nextPollAt,
      deadline_at: deadline
    }));

    const result = await h.lifecycle.restoreTriggersFromStorage();
    const stored = await readSnapshot(h, 'trg_restore_keep');
    const alarm = h.chromeMock.alarms._created().find((a) => a.name === 'fsbTrigger:trg_restore_keep');

    check(result && result.ok === true && result.restored === 1, 'F.1 restore keeps armed refresh-poll survivor');
    check(stored && stored.next_poll_at === nextPollAt, 'F.2 restore preserves valid persisted next_poll_at');
    check(stored && stored.deadline_at === deadline, 'F.3 restore preserves deadline_at');
    check(alarm && alarm.when === nextPollAt, 'F.4 restore creates alarm at persisted next_poll_at');
  });
}

async function caseRestoreRecomputesUnsafeNextPoll() {
  console.log('\n--- Case G: restore recomputes unsafe next_poll_at floor-safely ---');
  const now = 4000000;
  await withFixedNow(now, async () => {
    const h = setupRefreshPollHarness();
    const deadline = now + 3600000;
    await h.store.writeSnapshot('trg_restore_recompute', makeRefreshPollSnapshot({
      trigger_id: 'trg_restore_recompute',
      next_poll_at: now + 10000,
      poll_interval_ms: 45000,
      poll_jitter_ms: 1000,
      deadline_at: deadline
    }));

    const result = await h.lifecycle.restoreTriggersFromStorage();
    const stored = await readSnapshot(h, 'trg_restore_recompute');
    const alarm = h.chromeMock.alarms._created().find((a) => a.name === 'fsbTrigger:trg_restore_recompute');

    check(result && result.ok === true && result.restored === 1, 'G.1 restore keeps armed refresh-poll survivor');
    check(stored && stored.next_poll_at === now + 46000,
      'G.2 restore recomputes stale/floor-unsafe next_poll_at from interval + jitter');
    check(stored && stored.deadline_at === deadline, 'G.3 recompute preserves deadline_at');
    check(alarm && alarm.when === now + 46000, 'G.4 recomputed next_poll_at is used for alarm');
  });
}

async function caseJitterAndDeadlineFloor() {
  console.log('\n--- Case H: deterministic jitter is clamped and deadline-safe ---');
  const now = 5000000;
  await withFixedNow(now, async () => {
    const h = setupRefreshPollHarness();

    await h.lifecycle.armTrigger(makeRefreshPollSnapshot({
      trigger_id: 'trg_jitter_cap',
      poll_interval_ms: 30000,
      poll_jitter_ms: 5000,
      deadline_at: now + 3600000
    }));
    const capped = await readSnapshot(h, 'trg_jitter_cap');
    check(capped && capped.next_poll_at === now + 33000,
      'H.1 deterministic jitter is capped to 3000ms');

    await h.lifecycle.armTrigger(makeRefreshPollSnapshot({
      trigger_id: 'trg_jitter_floor',
      poll_interval_ms: 30000,
      poll_jitter_ms: -5000,
      deadline_at: now + 3600000
    }));
    const floored = await readSnapshot(h, 'trg_jitter_floor');
    check(floored && floored.next_poll_at === now + 30000,
      'H.2 negative deterministic jitter clamps to 0 and keeps the 30s floor');

    await h.lifecycle.armTrigger(makeRefreshPollSnapshot({
      trigger_id: 'trg_deadline_soon',
      poll_interval_ms: 60000,
      poll_jitter_ms: 3000,
      deadline_at: now + 20000
    }));
    const shortTtl = await readSnapshot(h, 'trg_deadline_soon');
    const shortAlarm = h.chromeMock.alarms._created().find((a) => a.name === 'fsbTrigger:trg_deadline_soon');
    check(shortTtl && shortTtl.next_poll_at === now + 20000,
      'H.3 deadline_at owns the next wake when remaining TTL is below the floor');
    check(shortAlarm && shortAlarm.when === shortTtl.next_poll_at,
      'H.4 short-TTL alarm is scheduled at deadline_at for reap');
  });
}

async function caseOwnershipSourceGuards() {
  console.log('\n--- Case I: refresh-poll ownership source guards ---');
  const src = readSource(BACKGROUND_PATH);
  const block = sourceSliceBetween(src, 'function fsbTriggerIsRefreshPollSnapshot', [
    'async function fsbTriggerStartObserveForSnapshot',
    'async function fsbTriggerRearmLiveObserversForTab'
  ]);

  check(/function\s+fsbTriggerIsRefreshPollSnapshot\s*\(/.test(src),
    'I.1 fsbTriggerIsRefreshPollSnapshot helper exists');
  check(/function\s+fsbTriggerValidateRefreshPollOwnership\s*\(/.test(src),
    'I.2 fsbTriggerValidateRefreshPollOwnership helper exists');
  check(/TAB_NOT_OWNED/.test(src), 'I.3 TAB_NOT_OWNED ownership rejection exists');
  check(/hasAgent/.test(block) && /getOwner/.test(block) && /isOwnedBy/.test(block),
    'I.4 ownership helper consults hasAgent, getOwner, and isOwnedBy');
  check(/ownerAgentId/.test(block) && /requestedTabId/.test(block) && /requestingAgentId/.test(block),
    'I.5 TAB_NOT_OWNED shape includes ownerAgentId, requestedTabId, and requestingAgentId');
  check(!/sendMessageWithRetry\s*\(/.test(block),
    'I.6 refresh-poll helper block does not call sendMessageWithRetry');
  check(!/chrome\.tabs\.query\s*\([\s\S]{0,140}active\s*:\s*true/.test(block),
    'I.7 refresh-poll helper block does not query active tab');
  check(!/chrome\.tabs\.update\s*\([\s\S]{0,180}active\s*:\s*true/.test(block),
    'I.8 refresh-poll helper block does not activate tabs');
}

(async () => {
  console.log('--- Phase 17 Plan 01: trigger refresh-poll cadence ---');
  await caseDefaultInterval();
  await caseAcceptedExplicitInterval();
  await caseSubFloorAliasesReject();
  await caseNonRefreshNoPollField();
  await caseArmSchedulesNextPoll();
  await caseRestoreUsesPersistedNextPoll();
  await caseRestoreRecomputesUnsafeNextPoll();
  await caseJitterAndDeadlineFloor();
  await caseOwnershipSourceGuards();

  console.log('\ntrigger-refresh-poll.test: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
  console.log('PASS trigger-refresh-poll');
})().catch((err) => {
  console.error('FAIL trigger-refresh-poll:', (err && err.stack) || err);
  process.exit(1);
});
