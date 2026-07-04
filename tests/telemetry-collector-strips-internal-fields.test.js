/**
 * Wire-payload regression test for extension/utils/telemetry-collector.js.
 *
 * Codex flagged a P1 leak on PR #50: telemetry-collector._runFlush() POSTed
 * a JSON body containing in-memory queue events whose `attempts` retry
 * counter (set by _bumpAttempts) leaked into the JSON. The server's 9-field
 * allowlist (showcase/server/src/routes/telemetry.js line 41-44) rejects
 * the first non-allowlisted key with 400 unknown_field, which causes
 * retried events to burn through the 5-attempt cap and be permanently
 * dropped -- defeating BEAT-04's INSERT OR IGNORE dedup promise.
 *
 * Authoritative behaviour:
 *   Scenario A -- wire payload strips `attempts`:
 *     Seed the queue with events that have `attempts: 2`. Run flush().
 *     The captured POST body's events array must contain EXACTLY the
 *     9 allowlisted keys per event -- no `attempts`, no other extras.
 *
 *   Scenario B -- in-memory queue retains `attempts` on POST failure:
 *     Same seed but fetch returns 500. After flush(), the re-enqueued
 *     residue's `attempts` is bumped to 3 (was 2). This proves the
 *     projection is read-only over the snapshot -- the in-memory queue
 *     still carries `attempts` and _bumpAttempts still sees the field.
 *
 * Run: node tests/telemetry-collector-strips-internal-fields.test.js
 *
 * Test harness mirrors tests/telemetry-collector.test.js verbatim.
 */

'use strict';

const COLLECTOR_PATH = require.resolve('../extension/utils/telemetry-collector.js');

let passed = 0;
let failed = 0;

function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function passAssertEqual(actual, expected, msg) {
  passAssert(actual === expected,
    msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')');
}

function passAssertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  passAssert(a === e, msg + ' (expected: ' + e + ', got: ' + a + ')');
}

function freshRequire() {
  delete require.cache[COLLECTOR_PATH];
  // Reset module-level global from any previous require so each test starts
  // with a clean fsbTelemetryCollector.
  delete globalThis.fsbTelemetryCollector;
  return require(COLLECTOR_PATH);
}

// In-memory chrome.storage.local shim. Each test resets _store. Mirror of
// tests/telemetry-collector.test.js makeShim() verbatim.
function makeShim() {
  return {
    _store: {},
    async get(keys) {
      const ks = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of ks) {
        if (Object.prototype.hasOwnProperty.call(this._store, k)) {
          out[k] = this._store[k];
        }
      }
      return out;
    },
    async set(o) {
      Object.assign(this._store, o);
    }
  };
}

// Fetch shim records every call. Empty _responses queue defaults to 200 OK.
// Mirror of tests/telemetry-collector.test.js makeFetchShim() verbatim.
function makeFetchShim() {
  const shim = {
    _calls: [],
    _responses: [],
    fetch: null
  };
  shim.fetch = async function (url, init) {
    let body;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : init && init.body; }
    catch (_e) { body = init && init.body; }
    shim._calls.push({
      url: url,
      init: {
        method: init && init.method,
        keepalive: init && init.keepalive,
        headers: init && init.headers,
        body: body
      }
    });
    if (shim._responses.length === 0) return { ok: true, status: 200 };
    return shim._responses.shift();
  };
  return shim;
}

// Identity shim. Returns a fixed UUIDv4 + opt-out=false.
function makeIdentityShim(optOut) {
  return {
    _optOut: !!optOut,
    async getOrCreateInstallUuid() { return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; },
    async isTelemetryOptedOut() { return this._optOut; }
  };
}

function wireShims(mod, storage, fetchShim, identity) {
  mod._setStorageShim(storage);
  mod._setFetchShim(fetchShim.fetch);
  mod._setIdentityShim(identity);
}

// Build a fully-formed 9-field event with `attempts` set. Used to seed the
// queue so we exercise the wire-payload projection on retried events. The
// crypto.randomUUID call produces a valid UUIDv4 cosmetically (no server
// runs in this test; the shape is irrelevant to the harness but is kept
// realistic so the test reads as a true production scenario).
function makeSeedEvent(attempts) {
  const tsMinute = Math.floor(Date.now() / 60000) * 60000;
  return {
    // The 9 allowlisted fields
    event_id: require('crypto').randomUUID(),
    install_uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ts_minute: tsMinute,
    mcp_client: 'Claude',
    model: 'claude-opus-4-7',
    tokens_in: 100,
    tokens_out: 50,
    active_agent_count: 2,
    event_type: 'periodic',
    // The in-memory-only retry counter. MUST stay off the wire.
    attempts: attempts
  };
}

const ALLOWLIST_SORTED = [
  'active_agent_count',
  'event_id',
  'event_type',
  'install_uuid',
  'mcp_client',
  'model',
  'tokens_in',
  'tokens_out',
  'ts_minute'
];

(async function runTests() {

  // -------------------------------------------------------------------------
  // Scenario A: wire payload contains EXACTLY the 9 allowlist keys per event
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario A: POST body strips `attempts` (and any other extras) ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(false);
    wireShims(m, storage, fetchShim, identity);

    // Seed queue with 2 events, each carrying attempts: 2 (simulating two
    // prior failed POSTs).
    storage._store.fsbTelemetryQueue = [
      makeSeedEvent(2),
      makeSeedEvent(2)
    ];
    // Empty fsbUsageData so the aggregation step doesn't add new events.
    storage._store.fsbUsageData = [];
    // Advance watermark to now so any future-dated fsbUsageData wouldn't be
    // re-aggregated (defence in depth -- fsbUsageData is empty anyway).
    storage._store.fsbTelemetryLastBeatTs = Date.now();

    await m.flush();

    // Exactly one POST issued.
    passAssertEqual(fetchShim._calls.length, 1, 'exactly one POST issued');
    const body = fetchShim._calls[0].init.body;
    passAssert(body && Array.isArray(body.events), 'POST body has events array');
    // Quick task 260524-8qv (Codex PR #78 Finding 2, P2): the PRESENCE-01
    // heartbeat is now suppressed when queue.length > 0 -- the 2 seeded
    // events represent unsent retries from prior failed POSTs, and the
    // server's recordSeen() loop already covers this install_uuid via the
    // retried events themselves. Pre-8qv this assertion was `=== 3` (2
    // seeded + 1 heartbeat); post-8qv it is `=== 2` (the heartbeat slot is
    // gone). The wire-strip contract still applies uniformly across both
    // events (the per-event loop below verifies the 9-key allowlist on
    // EACH event).
    passAssertEqual(body.events.length, 2, 'POST body contains 2 seeded events (heartbeat suppressed by 260524-8qv)');

    // For each event in the wire payload, the key set must be EXACTLY the
    // 9-key allowlist (sorted). NO `attempts`. NO other extras.
    for (let i = 0; i < body.events.length; i++) {
      const ev = body.events[i];
      const keys = Object.keys(ev).sort();
      passAssertDeepEqual(keys, ALLOWLIST_SORTED,
        'wire event[' + i + '] has EXACTLY the 9-key allowlist (sorted)');
      passAssert(!Object.prototype.hasOwnProperty.call(ev, 'attempts'),
        'wire event[' + i + '] does NOT include `attempts` (server allowlist gate)');
    }
  }

  // -------------------------------------------------------------------------
  // Scenario B: in-memory queue retains `attempts` after a failed POST
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario B: failed POST -> re-enqueued event retains + bumps `attempts` ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(false);
    wireShims(m, storage, fetchShim, identity);

    // Seed queue with 1 event, attempts: 2. Fetch returns 500 -- the
    // collector should re-enqueue and bump attempts to 3.
    const seed = makeSeedEvent(2);
    const seedId = seed.event_id;
    storage._store.fsbTelemetryQueue = [seed];
    storage._store.fsbUsageData = [];
    storage._store.fsbTelemetryLastBeatTs = Date.now();
    fetchShim._responses.push({ ok: false, status: 500 });

    await m.flush();

    // One POST attempted; it failed; the in-memory queue should still hold
    // the event with attempts bumped to 3.
    passAssertEqual(fetchShim._calls.length, 1, 'one POST attempted before failure');
    const wireBody = fetchShim._calls[0].init.body;
    // Quick task 260524-8qv (Codex PR #78 Finding 2, P2): heartbeat is now
    // suppressed when queue.length > 0. Pre-8qv this assertion was `=== 2`
    // (1 seeded + 1 heartbeat); post-8qv it is `=== 1` (only the seeded
    // event hits the wire -- the heartbeat slot is gone).
    passAssert(wireBody && Array.isArray(wireBody.events) && wireBody.events.length === 1,
      'POST body had the seeded event (heartbeat suppressed by 260524-8qv) before failure');
    // Find the seeded event on the wire.
    const wireSeed = wireBody.events.find(function (e) { return e.event_id === seedId; });
    passAssert(wireSeed && !Object.prototype.hasOwnProperty.call(wireSeed, 'attempts'),
      'POST body seeded event did NOT include `attempts` (wire-payload strip still active on failure path)');

    const residueQueue = storage._store.fsbTelemetryQueue;
    passAssert(Array.isArray(residueQueue), 'residue queue is an array after failure');
    // Only the seeded event is re-enqueued on failure; the heartbeat was
    // never enqueued in the first place under 260524-8qv Finding 2.
    passAssertEqual(residueQueue.length, 1, 'residue queue retains the re-enqueued seeded event (no heartbeat under 260524-8qv)');
    // The seeded event must STILL carry `attempts`, bumped from 2 -> 3. This
    // proves the projection is read-only -- in-memory queue retains the field
    // so _bumpAttempts can see it on the next failure cycle.
    const residueEvent = residueQueue.find(function (e) { return e.event_id === seedId; });
    passAssertEqual(residueEvent.event_id, seedId,
      're-enqueued event has the same event_id (server INSERT OR IGNORE dedup)');
    passAssertEqual(typeof residueEvent.attempts, 'number',
      're-enqueued event still carries numeric `attempts` (in-memory queue retains the field)');
    passAssertEqual(residueEvent.attempts, 3,
      're-enqueued event has attempts bumped 2 -> 3 (_bumpAttempts saw the field)');
  }

  // --- Summary ------------------------------------------------------------
  console.log('\n--- Summary ---');
  console.log('Total: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
  console.log('All telemetry-collector-strips-internal-fields tests passed.');
  process.exit(0);
})().catch((e) => {
  console.error('FATAL: test harness threw:', e && e.stack ? e.stack : e);
  process.exit(2);
});
