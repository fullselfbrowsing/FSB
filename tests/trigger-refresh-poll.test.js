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
const vm = require('vm');

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

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function loadRefreshPollVm(extraGlobals) {
  const src = readSource(BACKGROUND_PATH);
  const lockStart = src.indexOf('const fsbTriggerRefreshPollTabLocks');
  const snapshotStart = src.indexOf('function fsbTriggerSnapshotId');
  const start = (lockStart >= 0 && lockStart < snapshotStart) ? lockStart : snapshotStart;
  const marker = 'globalThis.fsbTriggerHandleRefreshPollForTest = fsbTriggerHandleRefreshPollAlarm;';
  const markerIndex = src.indexOf(marker, start);
  if (start < 0 || markerIndex < 0) {
    throw new Error('refresh-poll background slice not found');
  }
  const slice = src.slice(start, markerIndex + marker.length);
  const context = Object.assign({
    console,
    Date,
    Number,
    Object,
    Array,
    String,
    Promise,
    Math,
    Map,
    Set,
    setTimeout,
    clearTimeout,
    FSB_TRIGGER_REPORTED_TEXT_MAX: 4096
  }, extraGlobals || {});
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(slice, context, { filename: 'background-refresh-poll-slice.js' });
  return context;
}

function createRefreshPollVmHarness(seedRecords, options) {
  const opts = options || {};
  const records = {};
  Object.keys(seedRecords || {}).forEach((key) => {
    records[key] = clone(seedRecords[key]);
  });
  const calls = {
    events: [],
    reloads: [],
    reads: [],
    writes: [],
    handles: [],
    schedules: [],
    pulses: [],
    stamps: [],
    ownership: [],
    ensures: []
  };
  const registeredAgents = new Set(opts.registeredAgents || ['agent_refresh', 'agent_a', 'agent_b', 'agent_c']);
  const ownerByTab = opts.ownerByTab || {};
  const tabStates = opts.tabStates || {};
  const readValues = opts.readValues || {};

  const chromeMock = {
    tabs: {
      async reload(tabId) {
        calls.events.push('reload:' + tabId);
        calls.reloads.push(tabId);
        if (opts.deferReload) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      },
      async get(tabId) {
        const state = tabStates[tabId] || {};
        if (state.throw) throw new Error(state.throw);
        return {
          id: tabId,
          status: state.status || 'complete',
          url: state.url || 'https://example.test/page-' + tabId
        };
      },
      async sendMessage(tabId, payload, sendOptions) {
        calls.events.push((payload && payload.action ? payload.action : 'message') + ':' + tabId);
        if (payload && payload.action === 'triggerRead') {
          calls.reads.push({ tabId, payload: clone(payload), options: clone(sendOptions) });
          const key = payload.selector;
          const value = Object.prototype.hasOwnProperty.call(readValues, key)
            ? readValues[key]
            : { text: 'value:' + key, attributes: { selector: key } };
          return clone({ ok: true, success: true, value });
        }
        if (payload && payload.action === 'triggerPulseStart') {
          calls.pulses.push({ tabId, payload: clone(payload) });
        }
        return { ok: true };
      }
    }
  };

  const lifecyclePrefix = 'fsbTrigger:';
  const context = loadRefreshPollVm({
    chrome: chromeMock,
    pageLoadWatcher: {
      async waitForPageReady(tabId) {
        calls.events.push('ready:' + tabId);
        return { success: true };
      }
    },
    async ensureContentScriptInjected(tabId) {
      calls.events.push('ensure:' + tabId);
      calls.ensures.push(tabId);
      return true;
    },
    isRestrictedURL(url) {
      return opts.restrictedUrls && opts.restrictedUrls.indexOf(url) >= 0;
    },
    fsbAgentRegistryInstance: {
      hasAgent(agentId) {
        calls.events.push('hasAgent:' + agentId);
        calls.ownership.push({ method: 'hasAgent', agentId });
        return registeredAgents.has(agentId);
      },
      getOwner(tabId) {
        calls.events.push('getOwner:' + tabId);
        calls.ownership.push({ method: 'getOwner', tabId });
        return Object.prototype.hasOwnProperty.call(ownerByTab, tabId) ? ownerByTab[tabId] : null;
      },
      getTabMetadata(tabId) {
        calls.events.push('getTabMetadata:' + tabId);
        calls.ownership.push({ method: 'getTabMetadata', tabId });
        return null;
      },
      isOwnedBy(tabId, agentId, token) {
        calls.events.push('isOwnedBy:' + tabId + ':' + agentId);
        calls.ownership.push({ method: 'isOwnedBy', tabId, agentId, token });
        return opts.isOwnedBy ? opts.isOwnedBy(tabId, agentId, token) : true;
      },
      stampAgentNavigation(tabId) {
        calls.events.push('stamp:' + tabId);
        calls.stamps.push(tabId);
      }
    },
    FsbTriggerStore: {
      async hydrate() {
        return { v: 1, records: clone(records) };
      },
      async readSnapshot(triggerId) {
        return clone(records[triggerId] || null);
      },
      async writeSnapshot(triggerId, snap) {
        records[triggerId] = clone(snap);
        calls.writes.push({ triggerId, snap: clone(snap) });
      }
    },
    FsbTriggerLifecycle: {
      TRIGGER_ALARM_PREFIX: lifecyclePrefix,
      async handleTriggerAlarm(alarm) {
        calls.events.push('handle:' + alarm.name);
        calls.handles.push(alarm.name);
        if (typeof opts.onHandleTriggerAlarm === 'function') {
          await opts.onHandleTriggerAlarm(alarm, records, calls);
        }
        return { ok: true, action: 'evaluated_noop' };
      },
      async scheduleNextRefreshPollAlarm(snap, now) {
        calls.events.push('schedule:' + snap.trigger_id);
        calls.schedules.push({ triggerId: snap.trigger_id, now });
        return { ok: true };
      }
    }
  });

  return {
    context,
    calls,
    records,
    alarm(triggerId) {
      return { name: lifecyclePrefix + triggerId };
    }
  };
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

async function caseRefreshPollSameTabBatchCoalesces() {
  console.log('\n--- Case N: same-tab refresh-poll due batch coalesces reload ---');
  const now = 6000000;
  await withFixedNow(now, async () => {
    const h = createRefreshPollVmHarness({
      trg_batch_a: makeRefreshPollSnapshot({
        trigger_id: 'trg_batch_a',
        selector: '#a',
        target_tab_id: 321,
        next_poll_at: undefined,
        agent_id: 'agent_a'
      }),
      trg_batch_b: makeRefreshPollSnapshot({
        trigger_id: 'trg_batch_b',
        selector: '#b',
        target_tab_id: 321,
        next_poll_at: now - 1,
        agent_id: 'agent_b'
      }),
      trg_batch_future: makeRefreshPollSnapshot({
        trigger_id: 'trg_batch_future',
        selector: '#future',
        target_tab_id: 321,
        next_poll_at: now + 60000,
        agent_id: 'agent_a'
      }),
      trg_batch_terminal: makeRefreshPollSnapshot({
        trigger_id: 'trg_batch_terminal',
        status: 'fired',
        selector: '#terminal',
        target_tab_id: 321,
        next_poll_at: now - 1,
        agent_id: 'agent_a'
      })
    }, { deferReload: true });

    await Promise.all([
      h.context.fsbTriggerHandleRefreshPollForTest(h.alarm('trg_batch_a')),
      h.context.fsbTriggerHandleRefreshPollForTest(h.alarm('trg_batch_b'))
    ]);

    const readSelectors = h.calls.reads.map((entry) => entry.payload.selector).sort();
    check(h.calls.reloads.length === 1 && h.calls.reloads[0] === 321,
      'N.1 same-tab due refresh-poll alarms share one explicit tab reload');
    check(readSelectors.join(',') === '#a,#b',
      'N.2 due same-tab triggers are each read once after the shared reload');
    check(h.calls.handles.length === 2,
      'N.3 lifecycle evaluation remains per due trigger');
    check(h.calls.handles.indexOf('fsbTrigger:trg_batch_future') === -1
      && h.calls.handles.indexOf('fsbTrigger:trg_batch_terminal') === -1,
      'N.4 future and terminal same-tab snapshots are not evaluated');
    check(h.calls.pulses.length === 2 && h.calls.schedules.length === 2,
      'N.5 armed evaluated snapshots get independent pulse and next-poll scheduling');
  });
}

async function caseRefreshPollOtherTabsReloadIndependently() {
  console.log('\n--- Case O: other-tab refresh-poll batches reload independently ---');
  const now = 7000000;
  await withFixedNow(now, async () => {
    const h = createRefreshPollVmHarness({
      trg_tab_a: makeRefreshPollSnapshot({
        trigger_id: 'trg_tab_a',
        selector: '#a',
        target_tab_id: 401,
        next_poll_at: now - 1,
        agent_id: 'agent_a'
      }),
      trg_tab_b: makeRefreshPollSnapshot({
        trigger_id: 'trg_tab_b',
        selector: '#b',
        target_tab_id: 402,
        next_poll_at: now - 1,
        agent_id: 'agent_b'
      })
    });

    await h.context.fsbTriggerHandleRefreshPollForTest(h.alarm('trg_tab_a'));
    await h.context.fsbTriggerHandleRefreshPollForTest(h.alarm('trg_tab_b'));

    check(h.calls.reloads.length === 2
      && h.calls.reloads[0] === 401
      && h.calls.reloads[1] === 402,
      'O.1 due refresh-poll triggers on different tabs reload independently');
    check(h.calls.handles.length === 2,
      'O.2 each tab batch still performs per-trigger lifecycle evaluation');
  });
}

async function caseRefreshPollBatchPreservesAttentionAndPulseGuards() {
  console.log('\n--- Case P: coalescing preserves ownership, blocked, terminal, and pulse guards ---');
  const now = 8000000;
  await withFixedNow(now, async () => {
    const h = createRefreshPollVmHarness({
      trg_good: makeRefreshPollSnapshot({
        trigger_id: 'trg_good',
        selector: '#good',
        target_tab_id: 501,
        next_poll_at: now - 1,
        agent_id: 'agent_a'
      }),
      trg_bad_owner: makeRefreshPollSnapshot({
        trigger_id: 'trg_bad_owner',
        selector: '#bad-owner',
        target_tab_id: 501,
        next_poll_at: now - 1,
        agent_id: 'missing_agent'
      }),
      trg_terminal: makeRefreshPollSnapshot({
        trigger_id: 'trg_terminal',
        status: 'stopped',
        selector: '#terminal',
        target_tab_id: 501,
        next_poll_at: now - 1,
        agent_id: 'agent_a'
      })
    }, {
      onHandleTriggerAlarm(alarm, records) {
        if (alarm.name === 'fsbTrigger:trg_good') {
          records.trg_good.status = 'fired';
        }
      }
    });

    await h.context.fsbTriggerHandleRefreshPollForTest(h.alarm('trg_good'));

    const badOwner = h.records.trg_bad_owner;
    const reloadIdx = h.calls.events.indexOf('reload:501');
    const badOwnerIdx = h.calls.events.indexOf('hasAgent:missing_agent');
    check(badOwner && badOwner.status === 'needs_attention' && badOwner.attention_reason === 'ownership_failed',
      'P.1 ownership failures are marked needs_attention without blocking valid triggers');
    check(badOwnerIdx >= 0 && reloadIdx >= 0 && badOwnerIdx < reloadIdx,
      'P.2 ownership is validated for every due trigger before reload');
    check(h.calls.reloads.length === 1 && h.calls.handles.length === 1 && h.calls.handles[0] === 'fsbTrigger:trg_good',
      'P.3 valid due trigger evaluates once while invalid and terminal snapshots are skipped');
    check(h.calls.pulses.length === 0 && h.calls.schedules.length === 0,
      'P.4 pulse reassertion and next-poll scheduling skip snapshots no longer armed');

    const blocked = createRefreshPollVmHarness({
      trg_blocked: makeRefreshPollSnapshot({
        trigger_id: 'trg_blocked',
        selector: '#blocked',
        target_tab_id: 502,
        next_poll_at: now - 1,
        agent_id: 'agent_a'
      })
    }, {
      tabStates: { 502: { url: 'chrome://settings' } },
      restrictedUrls: ['chrome://settings']
    });

    await blocked.context.fsbTriggerHandleRefreshPollForTest(blocked.alarm('trg_blocked'));
    check(blocked.calls.reloads.length === 0
      && blocked.calls.reads.length === 0
      && blocked.records.trg_blocked.status === 'blocked'
      && blocked.records.trg_blocked.last_attention
      && blocked.records.trg_blocked.last_attention.code === 'TRIGGER_PAGE_BLOCKED',
      'P.5 restricted pages write blocked attention before reload or challenge-text staging');
  });
}

async function caseRefreshPollCoalescingSourceGuards() {
  console.log('\n--- Case Q: refresh-poll coalescing source guards ---');
  const src = readSource(BACKGROUND_PATH);
  const block = sourceSliceBetween(src, 'const fsbTriggerRefreshPollTabLocks', [
    'async function fsbTriggerRunRefreshPollTick',
    'async function fsbTriggerRearmLiveObserversForTab'
  ]);
  const validateIdx = block.indexOf('fsbTriggerValidateRefreshPollOwnership');
  const reloadIdx = block.indexOf('await chrome.tabs.reload');
  const handleIdx = block.indexOf('FsbTriggerLifecycle.handleTriggerAlarm');

  check(/const\s+fsbTriggerRefreshPollTabLocks\s*=\s*new\s+Map\s*\(\s*\)/.test(src),
    'Q.1 refresh-poll tab lock map exists');
  check(/function\s+fsbTriggerCollectDueRefreshPollSnapshots\s*\(/.test(src),
    'Q.2 due snapshot collector helper exists');
  check(/async\s+function\s+fsbTriggerRunRefreshPollTabBatch\s*\(/.test(src),
    'Q.3 tab batch helper exists');
  check(/fsbTriggerRefreshPollTabLocks\.get/.test(block) && /fsbTriggerRefreshPollTabLocks\.set/.test(block),
    'Q.4 batch helper joins and records in-flight per-tab work');
  check(validateIdx >= 0 && reloadIdx >= 0 && validateIdx < reloadIdx,
    'Q.5 batch ownership validation appears before shared tab reload');
  check(/chrome\.tabs\.reload\s*\(\s*tabId\s*\)/.test(block),
    'Q.6 batch reload remains explicit by tabId');
  check(handleIdx >= 0,
    'Q.7 batch path preserves per-trigger lifecycle evaluation');
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

async function caseRefreshPollRunSourceGuards() {
  console.log('\n--- Case J: refresh-poll reload/read/evaluate source guards ---');
  const src = readSource(BACKGROUND_PATH);
  const block = sourceSliceBetween(src, 'async function fsbTriggerSendRefreshPollRead', [
    'async function fsbTriggerRearmLiveObserversForTab',
    'async function fsbTriggerHandleObserveWatchdog'
  ]);
  const runIdx = block.indexOf('async function fsbTriggerRunRefreshPollTick');
  const validateIdx = block.indexOf('fsbTriggerValidateRefreshPollOwnership');
  const stampIdx = block.indexOf('stampAgentNavigation');
  const reloadIdx = block.indexOf('await chrome.tabs.reload');
  const reportedIdx = block.indexOf('reported_value');
  const handleIdx = block.indexOf('handleTriggerAlarm');
  const elementNotFoundIdx = block.indexOf('ELEMENT_NOT_FOUND');

  check(/async\s+function\s+fsbTriggerSendRefreshPollRead\s*\(/.test(src),
    'J.1 fsbTriggerSendRefreshPollRead helper exists');
  check(/async\s+function\s+fsbTriggerRunRefreshPollTick\s*\(/.test(src),
    'J.2 fsbTriggerRunRefreshPollTick helper exists');
  check(validateIdx >= 0 && reloadIdx >= 0 && validateIdx < reloadIdx,
    'J.3 ownership validation appears before chrome.tabs.reload');
  check(stampIdx >= 0 && reloadIdx >= 0 && stampIdx < reloadIdx,
    'J.4 stampAgentNavigation appears before chrome.tabs.reload');
  check(/chrome\.tabs\.reload\s*\(\s*(tabId|Number\s*\(\s*tabId\s*\))/.test(block),
    'J.5 chrome.tabs.reload is called with explicit tabId');
  check(/ensureContentScriptInjected\s*\(\s*tabId\s*\)/.test(block),
    'J.6 refresh-poll read helper ensures content scripts before read');
  check(/frameId\s*:\s*0/.test(block),
    'J.7 triggerRead message targets frameId: 0');
  check(reportedIdx >= 0 && handleIdx >= 0 && reportedIdx < handleIdx,
    'J.8 reported_value is staged before handleTriggerAlarm');
  check(elementNotFoundIdx >= 0 && handleIdx >= 0 && elementNotFoundIdx < handleIdx,
    'J.9 ELEMENT_NOT_FOUND is handled before lifecycle delegation');
  check(!/status\s*=\s*['"]fired['"]/.test(block) && !/status\s*:\s*['"]fired['"]/.test(block),
    'J.10 refresh-poll background helpers do not set fired status');
}

async function caseBlockedPageSourceGuards() {
  console.log('\n--- Case L: refresh-poll blocked-page source guards ---');
  const src = readSource(BACKGROUND_PATH);
  const block = sourceSliceBetween(src, 'async function fsbTriggerSendRefreshPollRead', [
    'async function fsbTriggerRearmLiveObserversForTab',
    'async function fsbTriggerHandleObserveWatchdog'
  ]);
  const restrictedIdx = block.indexOf('isRestrictedURL');
  const reloadIdx = block.indexOf('await chrome.tabs.reload');
  const blockedIdx = block.indexOf('TRIGGER_PAGE_BLOCKED');
  const reportedIdx = block.indexOf('reported_value');
  const handleIdx = block.indexOf('handleTriggerAlarm');

  check(/TRIGGER_PAGE_BLOCKED/.test(src), 'L.1 TRIGGER_PAGE_BLOCKED handling exists in background source');
  check(/status\s*=\s*['"]blocked['"]/.test(block) || /status\s*:\s*['"]blocked['"]/.test(block),
    'L.2 blocked handling writes status blocked');
  check(/attention_reason/.test(block), 'L.3 blocked handling writes attention_reason');
  check(/last_attention/.test(block), 'L.4 blocked handling writes last_attention');
  check(/blocked_reason/.test(block), 'L.5 blocked handling preserves blocked_reason');
  check(restrictedIdx >= 0 && reloadIdx >= 0 && restrictedIdx < reloadIdx,
    'L.6 restricted URL check appears before chrome.tabs.reload');
  check(blockedIdx >= 0 && reportedIdx >= 0 && blockedIdx < reportedIdx,
    'L.7 blocked response is handled before staging reported_value');
  check(blockedIdx >= 0 && handleIdx >= 0 && blockedIdx < handleIdx,
    'L.8 blocked response is handled before handleTriggerAlarm');
}

async function casePulseRestartSourceGuards() {
  console.log('\n--- Case M: refresh-poll pulse restart source guards ---');
  const src = readSource(BACKGROUND_PATH);
  const block = sourceSliceBetween(src, 'async function fsbTriggerSendRefreshPollRead', [
    'async function fsbTriggerRearmLiveObserversForTab',
    'async function fsbTriggerHandleObserveWatchdog'
  ]);
  const handleIdx = block.indexOf('handleTriggerAlarm');
  const latestIdx = block.indexOf('latestSnap');
  const armedIdx = block.indexOf("latestSnap.status === 'armed'");
  const pulseIdx = block.indexOf('triggerPulseStart', handleIdx);
  const scheduleIdx = block.indexOf('await FsbTriggerLifecycle.scheduleNextRefreshPollAlarm', handleIdx);

  check(/triggerPulseStart/.test(block), 'M.1 refresh-poll helper restarts triggerPulseStart');
  check(/reason\s*:\s*['"]refresh-poll['"]/.test(block), 'M.2 pulse restart uses reason refresh-poll');
  check(handleIdx >= 0 && latestIdx >= 0 && handleIdx < latestIdx,
    'M.3 latest snapshot is re-read after handleTriggerAlarm');
  check(armedIdx >= 0 && pulseIdx >= 0 && armedIdx < pulseIdx,
    'M.4 status armed check appears before pulse restart');
  check(pulseIdx >= 0 && scheduleIdx >= 0 && pulseIdx < scheduleIdx,
    'M.5 pulse restart appears before next refresh-poll scheduling');
}

async function caseAlarmBranchSourceGuards() {
  console.log('\n--- Case K: refresh-poll alarm branch source guards ---');
  const src = readSource(BACKGROUND_PATH);
  const branch = sourceSliceBetween(src, 'alarm.name.startsWith(FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX)', [
    'alarm.name.startsWith(FSB_TRIGGER_OBSERVE_WATCHDOG_PREFIX)',
    'if (alarm && alarm.name ==='
  ]);
  const refreshIdx = branch.indexOf('fsbTriggerHandleRefreshPollAlarm');
  const fallbackIdx = branch.indexOf('FsbTriggerLifecycle.handleTriggerAlarm(alarm)');

  check(/async\s+function\s+fsbTriggerHandleRefreshPollAlarm\s*\(/.test(src),
    'K.1 fsbTriggerHandleRefreshPollAlarm helper exists');
  check(refreshIdx >= 0, 'K.2 fsbTrigger alarm branch calls fsbTriggerHandleRefreshPollAlarm');
  check(fallbackIdx >= 0, 'K.3 fsbTrigger alarm branch preserves lifecycle fallback');
  check(refreshIdx >= 0 && fallbackIdx >= 0 && refreshIdx < fallbackIdx,
    'K.4 refresh-poll handling appears before lifecycle fallback');
  check(/fsbTriggerHandleRefreshPollForTest/.test(src),
    'K.5 test-only refresh-poll alarm hook exists');
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
  await caseRefreshPollSameTabBatchCoalesces();
  await caseRefreshPollOtherTabsReloadIndependently();
  await caseRefreshPollBatchPreservesAttentionAndPulseGuards();
  await caseRefreshPollCoalescingSourceGuards();
  await caseOwnershipSourceGuards();
  await caseRefreshPollRunSourceGuards();
  await caseBlockedPageSourceGuards();
  await casePulseRestartSourceGuards();
  await caseAlarmBranchSourceGuards();

  console.log('\ntrigger-refresh-poll.test: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
  console.log('PASS trigger-refresh-poll');
})().catch((err) => {
  console.error('FAIL trigger-refresh-poll:', (err && err.stack) || err);
  process.exit(1);
});
