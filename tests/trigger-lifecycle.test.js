'use strict';

/**
 * Phase 14 Plan 02 -- lifecycle unit tests for the trigger-survivability
 * scaffold (extension/utils/trigger-lifecycle.js).
 *
 * Source-of-truth: .planning/phases/14-trigger-survivability-foundation/
 *   14-CONTEXT.md (D-03 alarm prefix + 30s floor, D-08 orphan sweep, D-09
 *   idempotent re-read no-op, D-10 three reap paths, D-11 single TTL const),
 *   14-RESEARCH.md (Pattern 1 handleTriggerAlarm, Pattern 2 reconcile + getAll()
 *   orphan sweep, Code Examples handleTriggerTabRemoved), 14-PATTERNS.md.
 *
 * Clone provenance: createStorageArea() + createChromeMock() are copied
 * VERBATIM from tests/mcp-visual-tick-lifecycle.test.js:58-124 (the alarm mock
 * already fakes alarms.create/clear/getAll + _created()/_createHistory()/
 * _cleared()). The template's fake sendSessionStatus global is DROPPED -- there
 * is no overlay broadcast in Phase 14 (visual feedback is Phase 16).
 *
 * What this test locks:
 *   A. handleTriggerAlarm not_our_alarm / malformed_alarm_name guards.
 *   B. handleTriggerAlarm missing snapshot -> noop_no_entry (D-09).
 *   C. handleTriggerAlarm fired/stopped -> noop_terminal, called TWICE, second
 *      is a no-op and _cleared() did not double-fire (SURV-02 / D-09 / Pitfall #16).
 *   D. handleTriggerAlarm now >= deadline_at -> reaped_ttl: entry deleted + alarm
 *      cleared (LIFE-05 reap path a).
 *   E. handleTriggerAlarm armed-not-elapsed -> evaluated_noop (Phase 15 seam).
 *   F. SURV-02 eviction-between-read-and-decision: mutate mock storage between
 *      two handler calls, assert the second observes the new state (no stale heap).
 *   G. restoreTriggersFromStorage armed-not-elapsed re-armed with the ORIGINAL
 *      when value (asserted via _created()/getAll()) (SURV-03).
 *   H. restoreTriggersFromStorage fired/stopped/expired dropped (delete + _cleared())
 *      (SURV-03 / LIFE-05 reap path b).
 *   I. restoreTriggersFromStorage orphan fsbTrigger:* alarm with NO backing
 *      snapshot -> cleared (SURV-03 / D-08, the one genuinely-new piece).
 *   J. restoreTriggersFromStorage malformed snapshot (non-finite deadline_at) ->
 *      dropped.
 *   K. handleTriggerTabRemoved reaps exactly the matching target_tab_id triggers
 *      and only those (LIFE-05 reap path c / D-10c).
 *   L. handleTriggerTabRemoved non-finite tabId -> { ok:true, reaped:0 }.
 *   M. Module SOURCE contains no setInterval / keepalive (SURV-01 / Pitfall #3) --
 *      the only timer surface is chrome.alarms.
 *   N. Module surface shape: dual-export + the documented constants/functions.
 *
 * Run: node tests/trigger-lifecycle.test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// ------------------------------------------------------------------
// In-memory chrome.storage.session + chrome.alarms fakes.
// Copied VERBATIM from tests/mcp-visual-tick-lifecycle.test.js:58-124.
// The alarms mock already fakes create/clear/getAll + introspection
// (_created / _createHistory / _cleared), exactly what the orphan-sweep,
// re-arm, and duplicate-fire assertions need.
// ------------------------------------------------------------------

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
    _dump() { return Object.assign({}, store); },
    _keys() { return Object.keys(store); }
  };
}

function createChromeMock() {
  const session = createStorageArea();
  const alarms = new Map();
  const cleared = [];
  const createHistory = [];
  return {
    storage: { session },
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

// ------------------------------------------------------------------
// Harness: install the chrome mock on the Node global, then re-require
// trigger-store.js + trigger-lifecycle.js with clean require.cache slots
// so each module's lazy _getChrome() rebinds against the fresh mock.
// (Mirrors tests/mcp-visual-tick-lifecycle.test.js setupHarness, minus the
//  fake sendSessionStatus global -- no broadcast in Phase 14.)
// ------------------------------------------------------------------

const STORE_MODULE_PATH = require.resolve('../extension/utils/trigger-store.js');
const LIFECYCLE_MODULE_PATH = require.resolve('../extension/utils/trigger-lifecycle.js');

function setupHarness() {
  const chromeMock = createChromeMock();
  global.chrome = chromeMock;

  delete require.cache[STORE_MODULE_PATH];
  delete require.cache[LIFECYCLE_MODULE_PATH];
  const store = require(STORE_MODULE_PATH);
  const lc = require(LIFECYCLE_MODULE_PATH);

  return { chromeMock, store, lc };
}

// Trigger snapshot factory (D-01 flat-scalar schema).
function makeSnapshot(overrides) {
  return Object.assign({
    trigger_id: 'trg_abc',
    status: 'armed',
    watch: 'live-observe',
    condition: null,
    selector: null,
    target_tab_id: 42,
    agent_id: 'agent_owner',
    baseline: null,
    last_value: null,
    last_evaluated_at: null,
    armed_at: 1000,
    fired_at: null,
    deadline_at: 9999999999999,
    alarm_name: 'fsbTrigger:trg_abc'
  }, overrides || {});
}

// ------------------------------------------------------------------
// Case A: handleTriggerAlarm guards (not_our_alarm / malformed_alarm_name)
// ------------------------------------------------------------------

async function caseA() {
  console.log('\n--- Case A: handleTriggerAlarm input guards ---');
  const { lc } = setupHarness();

  const r1 = await lc.handleTriggerAlarm(null);
  check(r1 && r1.ok === false && r1.reason === 'not_our_alarm', 'A.1 null alarm -> not_our_alarm');

  const r2 = await lc.handleTriggerAlarm({ name: 'mcpVisualDeath:42' });
  check(r2 && r2.ok === false && r2.reason === 'not_our_alarm', 'A.2 foreign prefix -> not_our_alarm');

  const r3 = await lc.handleTriggerAlarm({ name: 'fsbTrigger:' });
  check(r3 && r3.ok === false && r3.reason === 'malformed_alarm_name', 'A.3 empty trigger id -> malformed_alarm_name');
}

// ------------------------------------------------------------------
// Case B: missing snapshot -> noop_no_entry (D-09)
// ------------------------------------------------------------------

async function caseB() {
  console.log('\n--- Case B: missing snapshot -> noop_no_entry (D-09) ---');
  const { lc } = setupHarness();

  const r = await lc.handleTriggerAlarm({ name: 'fsbTrigger:trg_missing' });
  check(r && r.ok === true && r.action === 'noop_no_entry', 'B.1 no backing snapshot -> noop_no_entry (re-read storage, not heap)');
}

// ------------------------------------------------------------------
// Case C: fired/stopped -> noop_terminal, twice, no double-clear
//         (SURV-02 idempotent fire-guard / D-09 / Pitfall #16)
// ------------------------------------------------------------------

async function caseC() {
  console.log('\n--- Case C: terminal snapshot -> noop_terminal (idempotent, no double-clear) ---');
  const { chromeMock, store, lc } = setupHarness();

  await store.writeSnapshot('trg_fired', makeSnapshot({ trigger_id: 'trg_fired', status: 'fired', fired_at: 2000 }));

  const r1 = await lc.handleTriggerAlarm({ name: 'fsbTrigger:trg_fired' });
  check(r1 && r1.ok === true && r1.action === 'noop_terminal', 'C.1 fired snapshot -> noop_terminal');

  const r2 = await lc.handleTriggerAlarm({ name: 'fsbTrigger:trg_fired' });
  check(r2 && r2.ok === true && r2.action === 'noop_terminal', 'C.2 second call also noop_terminal (idempotent)');

  // Pitfall #16: a terminal no-op must NOT delete the entry or clear the alarm.
  const stillThere = await store.readSnapshot('trg_fired');
  check(stillThere && stillThere.status === 'fired', 'C.3 snapshot NOT deleted by noop_terminal');
  check(chromeMock.alarms._cleared().filter((n) => n === 'fsbTrigger:trg_fired').length === 0, 'C.4 alarm NOT cleared by noop_terminal (no double-fire / double-clear)');

  // A stopped snapshot is equally terminal.
  await store.writeSnapshot('trg_stopped', makeSnapshot({ trigger_id: 'trg_stopped', status: 'stopped' }));
  const r3 = await lc.handleTriggerAlarm({ name: 'fsbTrigger:trg_stopped' });
  check(r3 && r3.ok === true && r3.action === 'noop_terminal', 'C.5 stopped snapshot -> noop_terminal');
}

// ------------------------------------------------------------------
// Case D: now >= deadline_at -> reaped_ttl (LIFE-05 reap path a)
// ------------------------------------------------------------------

async function caseD() {
  console.log('\n--- Case D: TTL elapsed on tick -> reaped_ttl (LIFE-05 a) ---');
  const { chromeMock, store, lc } = setupHarness();

  await store.writeSnapshot('trg_ttl', makeSnapshot({ trigger_id: 'trg_ttl', status: 'armed', deadline_at: Date.now() - 1000 }));

  const r = await lc.handleTriggerAlarm({ name: 'fsbTrigger:trg_ttl' });
  check(r && r.ok === true && r.action === 'reaped_ttl', 'D.1 elapsed deadline_at -> reaped_ttl');

  const gone = await store.readSnapshot('trg_ttl');
  check(gone === null, 'D.2 snapshot deleted on TTL reap');
  check(chromeMock.alarms._cleared().includes('fsbTrigger:trg_ttl'), 'D.3 alarm cleared on TTL reap');
}

// ------------------------------------------------------------------
// Case E: armed-not-elapsed -> evaluated_noop (Phase 15 seam)
// ------------------------------------------------------------------

async function caseE() {
  console.log('\n--- Case E: armed-not-elapsed -> evaluated_noop (Phase 15 seam) ---');
  const { chromeMock, store, lc } = setupHarness();

  await store.writeSnapshot('trg_live', makeSnapshot({ trigger_id: 'trg_live', status: 'armed', deadline_at: Date.now() + 3600000 }));

  const r = await lc.handleTriggerAlarm({ name: 'fsbTrigger:trg_live' });
  check(r && r.ok === true && r.action === 'evaluated_noop', 'E.1 armed-not-elapsed -> evaluated_noop');

  const still = await store.readSnapshot('trg_live');
  check(still && still.status === 'armed', 'E.2 snapshot preserved (no reap, no fire in Phase 14)');
  check(chromeMock.alarms._cleared().filter((n) => n === 'fsbTrigger:trg_live').length === 0, 'E.3 alarm not cleared on evaluated_noop');
}

// ------------------------------------------------------------------
// Case F: SURV-02 eviction-between-read-and-decision (no stale-heap read)
// ------------------------------------------------------------------

async function caseF() {
  console.log('\n--- Case F: SURV-02 eviction between read and decision (no stale heap) ---');
  const { store, lc } = setupHarness();

  // First call: armed + far-future deadline -> evaluated_noop.
  await store.writeSnapshot('trg_evict', makeSnapshot({ trigger_id: 'trg_evict', status: 'armed', deadline_at: Date.now() + 3600000 }));
  const r1 = await lc.handleTriggerAlarm({ name: 'fsbTrigger:trg_evict' });
  check(r1 && r1.action === 'evaluated_noop', 'F.1 first tick sees armed -> evaluated_noop');

  // Mutate storage BETWEEN handler calls (simulates eviction + external write).
  // If the handler trusted a captured SW heap value it would still return
  // evaluated_noop; re-reading storage every tick yields noop_terminal.
  await store.writeSnapshot('trg_evict', makeSnapshot({ trigger_id: 'trg_evict', status: 'fired', fired_at: Date.now() }));
  const r2 = await lc.handleTriggerAlarm({ name: 'fsbTrigger:trg_evict' });
  check(r2 && r2.action === 'noop_terminal', 'F.2 second tick observes the mutated (fired) state -> noop_terminal (storage-is-truth, no stale-heap read)');
}

// ------------------------------------------------------------------
// Case G: restoreTriggersFromStorage re-arms non-elapsed armed with ORIGINAL when
// ------------------------------------------------------------------

async function caseG() {
  console.log('\n--- Case G: restore re-arms non-elapsed armed with ORIGINAL when (SURV-03) ---');
  const { chromeMock, store, lc } = setupHarness();

  const originalDeadline = Date.now() + 5400000;
  await store.writeSnapshot('trg_survivor', makeSnapshot({ trigger_id: 'trg_survivor', status: 'armed', deadline_at: originalDeadline }));

  const r = await lc.restoreTriggersFromStorage();
  check(r && r.ok === true, 'G.1 restore returned ok=true');
  check(r.restored === 1, 'G.2 one survivor restored');

  const armed = chromeMock.alarms._created().find((a) => a.name === 'fsbTrigger:trg_survivor');
  check(!!armed, 'G.3 fsbTrigger:trg_survivor alarm re-armed');
  check(armed && armed.when === originalDeadline, 'G.4 re-armed with the ORIGINAL deadline_at (no silent reset)');

  const still = await store.readSnapshot('trg_survivor');
  check(still && still.status === 'armed', 'G.5 survivor snapshot preserved');
}

// ------------------------------------------------------------------
// Case H: restore drops fired/stopped/expired (delete + clear)
// ------------------------------------------------------------------

async function caseH() {
  console.log('\n--- Case H: restore drops fired/stopped/expired (SURV-03 / LIFE-05 b) ---');
  const { chromeMock, store, lc } = setupHarness();
  const now = Date.now();

  await store.writeSnapshot('trg_fired', makeSnapshot({ trigger_id: 'trg_fired', status: 'fired', deadline_at: now + 3600000 }));
  await store.writeSnapshot('trg_stopped', makeSnapshot({ trigger_id: 'trg_stopped', status: 'stopped', deadline_at: now + 3600000 }));
  await store.writeSnapshot('trg_expired', makeSnapshot({ trigger_id: 'trg_expired', status: 'armed', deadline_at: now - 1000 }));

  const r = await lc.restoreTriggersFromStorage();
  check(r && r.ok === true, 'H.1 restore returned ok=true');
  check(r.reaped === 3, 'H.2 all three terminal/expired snapshots reaped');
  check(r.restored === 0, 'H.3 nothing re-armed');

  check((await store.readSnapshot('trg_fired')) === null, 'H.4 fired snapshot deleted');
  check((await store.readSnapshot('trg_stopped')) === null, 'H.5 stopped snapshot deleted');
  check((await store.readSnapshot('trg_expired')) === null, 'H.6 expired-armed snapshot deleted (LIFE-05 restore-reap)');

  const cleared = chromeMock.alarms._cleared();
  check(cleared.includes('fsbTrigger:trg_fired') && cleared.includes('fsbTrigger:trg_stopped') && cleared.includes('fsbTrigger:trg_expired'), 'H.7 all three alarms cleared');
}

// ------------------------------------------------------------------
// Case I: restore orphan sweep (D-08, the one genuinely-new piece)
// ------------------------------------------------------------------

async function caseI() {
  console.log('\n--- Case I: restore orphan sweep (SURV-03 / D-08) ---');
  const { chromeMock, store, lc } = setupHarness();

  // A live survivor (must NOT be swept) ...
  const survivorDeadline = Date.now() + 5400000;
  await store.writeSnapshot('trg_keep', makeSnapshot({ trigger_id: 'trg_keep', status: 'armed', deadline_at: survivorDeadline }));
  // ... an ORPHAN fsbTrigger:* alarm with NO backing snapshot ...
  await chromeMock.alarms.create('fsbTrigger:trg_orphan', { when: Date.now() + 1000 });
  // ... and a foreign-prefix alarm that must be left untouched.
  await chromeMock.alarms.create('mcpVisualDeath:55', { when: Date.now() + 1000 });

  const r = await lc.restoreTriggersFromStorage();
  check(r && r.ok === true, 'I.1 restore returned ok=true');
  check(r.orphans_cleared === 1, 'I.2 exactly one orphan cleared');

  const cleared = chromeMock.alarms._cleared();
  check(cleared.includes('fsbTrigger:trg_orphan'), 'I.3 orphan fsbTrigger:trg_orphan cleared (alarm-into-the-void killed)');
  check(!cleared.includes('mcpVisualDeath:55'), 'I.4 foreign-prefix alarm NOT swept (scope limited to fsbTrigger:)');
  check(!cleared.includes('fsbTrigger:trg_keep'), 'I.5 live survivor NOT swept');

  const liveNames = (await chromeMock.alarms.getAll()).map((a) => a.name);
  check(liveNames.includes('fsbTrigger:trg_keep'), 'I.6 survivor alarm still armed after restore');
  check(liveNames.includes('mcpVisualDeath:55'), 'I.7 foreign alarm still present after restore');
  check(!liveNames.includes('fsbTrigger:trg_orphan'), 'I.8 orphan alarm gone after restore');
}

// ------------------------------------------------------------------
// Case J: restore drops malformed snapshot (non-finite deadline_at)
// ------------------------------------------------------------------

async function caseJ() {
  console.log('\n--- Case J: restore drops malformed snapshot ---');
  const { chromeMock, store, lc } = setupHarness();

  await store.writeSnapshot('trg_bad', makeSnapshot({ trigger_id: 'trg_bad', status: 'armed', deadline_at: 'not-a-number' }));

  const r = await lc.restoreTriggersFromStorage();
  check(r && r.ok === true, 'J.1 restore returned ok=true');
  check(r.dropped === 1, 'J.2 malformed snapshot counted as dropped');
  check((await store.readSnapshot('trg_bad')) === null, 'J.3 malformed snapshot deleted');
  check(chromeMock.alarms._cleared().includes('fsbTrigger:trg_bad'), 'J.4 malformed snapshot alarm cleared');
}

// ------------------------------------------------------------------
// Case K: handleTriggerTabRemoved reaps only matching target_tab_id (D-10c)
// ------------------------------------------------------------------

async function caseK() {
  console.log('\n--- Case K: tab-close reap by target_tab_id (LIFE-05 c / D-10c) ---');
  const { chromeMock, store, lc } = setupHarness();

  await store.writeSnapshot('trg_t42_a', makeSnapshot({ trigger_id: 'trg_t42_a', target_tab_id: 42 }));
  await store.writeSnapshot('trg_t42_b', makeSnapshot({ trigger_id: 'trg_t42_b', target_tab_id: 42 }));
  await store.writeSnapshot('trg_t99', makeSnapshot({ trigger_id: 'trg_t99', target_tab_id: 99 }));

  const r = await lc.handleTriggerTabRemoved(42);
  check(r && r.ok === true && r.reaped === 2, 'K.1 exactly two tab-42 triggers reaped');

  check((await store.readSnapshot('trg_t42_a')) === null, 'K.2 trg_t42_a deleted');
  check((await store.readSnapshot('trg_t42_b')) === null, 'K.3 trg_t42_b deleted');

  const survivor = await store.readSnapshot('trg_t99');
  check(survivor && survivor.target_tab_id === 99, 'K.4 tab-99 trigger survives');

  const cleared = chromeMock.alarms._cleared();
  check(cleared.includes('fsbTrigger:trg_t42_a') && cleared.includes('fsbTrigger:trg_t42_b'), 'K.5 both tab-42 alarms cleared');
  check(!cleared.includes('fsbTrigger:trg_t99'), 'K.6 tab-99 alarm NOT cleared');
}

// ------------------------------------------------------------------
// Case L: handleTriggerTabRemoved non-finite tabId -> reaped 0
// ------------------------------------------------------------------

async function caseL() {
  console.log('\n--- Case L: tab-removed with non-finite tabId is a no-op ---');
  const { store, lc } = setupHarness();

  await store.writeSnapshot('trg_x', makeSnapshot({ trigger_id: 'trg_x', target_tab_id: 42 }));

  const r = await lc.handleTriggerTabRemoved('not-a-number');
  check(r && r.ok === true && r.reaped === 0, 'L.1 non-finite tabId -> { ok:true, reaped:0 }');
  check((await store.readSnapshot('trg_x')) !== null, 'L.2 no snapshot reaped on bad tabId');
}

// ------------------------------------------------------------------
// Case M: SOURCE has no setInterval / keepalive (SURV-01 / Pitfall #3)
// ------------------------------------------------------------------

function caseM() {
  console.log('\n--- Case M: no setInterval / keepalive in module source (SURV-01 / Pitfall #3) ---');
  const src = fs.readFileSync(LIFECYCLE_MODULE_PATH, 'utf8');
  // Strip comment lines so a comment mentioning setInterval would not trip this.
  const codeOnly = src
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line) && !/^\s*\*/.test(line))
    .join('\n');
  check(codeOnly.indexOf('setInterval') === -1, 'M.1 no setInterval in module code (only chrome.alarms)');
  check(codeOnly.indexOf('setTimeout') === -1, 'M.2 no setTimeout keepalive in module code');
}

// ------------------------------------------------------------------
// Case N: module surface shape (dual-export + documented constants/functions)
// ------------------------------------------------------------------

function caseN() {
  console.log('\n--- Case N: module surface shape ---');
  const { lc } = setupHarness();

  check(typeof lc.handleTriggerAlarm === 'function', 'N.1 exports handleTriggerAlarm');
  check(typeof lc.handleTriggerTabRemoved === 'function', 'N.2 exports handleTriggerTabRemoved');
  check(typeof lc.restoreTriggersFromStorage === 'function', 'N.3 exports restoreTriggersFromStorage');
  check(typeof lc.alarmNameForTrigger === 'function', 'N.4 exports alarmNameForTrigger');
  check(lc.TRIGGER_ALARM_PREFIX === 'fsbTrigger:', 'N.5 TRIGGER_ALARM_PREFIX === fsbTrigger: (D-03)');
  check(lc.FSB_TRIGGER_DEFAULT_TTL_MS === 21600000, 'N.6 FSB_TRIGGER_DEFAULT_TTL_MS === 21600000 (6h, D-11)');

  // alarmNameForTrigger guard: null on non-string/empty, else prefix + id.
  check(lc.alarmNameForTrigger('trg_z') === 'fsbTrigger:trg_z', 'N.7 alarmNameForTrigger composes the alarm name');
  check(lc.alarmNameForTrigger('') === null, 'N.8 alarmNameForTrigger(empty) -> null');
  check(lc.alarmNameForTrigger(42) === null, 'N.9 alarmNameForTrigger(non-string) -> null');

  // SW global is attached (dual-export).
  check(global.FsbTriggerLifecycle && typeof global.FsbTriggerLifecycle.handleTriggerAlarm === 'function', 'N.10 global.FsbTriggerLifecycle attached (importScripts consumer)');

  // 30s alarm-floor constant exported for Phase 17 (declared, not enforced here).
  const hasFloor = (typeof lc.TRIGGER_ALARM_MIN_PERIOD_MS === 'number' && lc.TRIGGER_ALARM_MIN_PERIOD_MS === 30000)
    || (typeof lc.TRIGGER_ALARM_MIN_PERIOD_MINUTES === 'number' && lc.TRIGGER_ALARM_MIN_PERIOD_MINUTES === 0.5);
  check(hasFloor, 'N.11 a 30s alarm-floor constant is exported for Phase 17 (D-03)');
}

// ------------------------------------------------------------------
// Driver
// ------------------------------------------------------------------

(async () => {
  console.log('--- Phase 14 Plan 02: trigger-lifecycle ---');
  await caseA();
  await caseB();
  await caseC();
  await caseD();
  await caseE();
  await caseF();
  await caseG();
  await caseH();
  await caseI();
  await caseJ();
  await caseK();
  await caseL();
  caseM();
  caseN();

  console.log('\n--- Phase 14 plan 02 trigger-lifecycle summary ---');
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err && err.stack ? err.stack : err);
  process.exit(1);
});
